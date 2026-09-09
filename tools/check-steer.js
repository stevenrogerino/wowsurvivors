#!/usr/bin/env node
/* Steering guard rail.
 *
 * One gesture, three pointer types: the floating stick is how touch, mouse and
 * pen all steer. Sharing the path is what gives one-handed play on a desktop,
 * and it is also where two hazards live.
 *
 *   1. A stray click must not stop a keyboard player. The stick only takes
 *      over past a drag threshold; below it the keyboard stays in charge.
 *   2. Releasing the stick must hand control BACK to keys that are still
 *      physically down. The old touch code called releaseAll() on release,
 *      which on a desktop wipes the WASD the player is holding.
 *
 * Both are invisible in code review and obvious in a hand. So this drives a
 * real pointer and a real keyboard together and checks where the survivor
 * actually goes.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-steer.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const SIGN = (n) => (n > 0.5 ? 1 : n < -0.5 ? -1 : 0);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const fail = [];
  page.on('pageerror', (e) => fail.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Game.startRun('thornhollow', 'mage');
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const c = document.querySelector('#overlay:not(.hidden) .card'); if (c) c.click();
  });
  await page.waitForTimeout(200);

  // Park the survivor mid-field so it can travel in any direction.
  const step = () => page.evaluate(() => {
    const p = WS.Game.player;
    p.x = WS.CONST.WORLD_WIDTH / 2; p.y = WS.CONST.WORLD_HEIGHT / 2;
    const x = p.x, y = p.y;
    for (let i = 0; i < 20; i++) WS.Game.update(1 / 60);
    return { dx: WS.Game.player.x - x, dy: WS.Game.player.y - y };
  });

  // 1. Mouse drag steers.
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(760, 360, { steps: 4 });      // well past the threshold
  const dragged = await step();
  if (SIGN(dragged.dx) !== 1 || SIGN(dragged.dy) !== 0) {
    fail.push(`mouse drag east moved dx=${dragged.dx.toFixed(1)} dy=${dragged.dy.toFixed(1)}`);
  }
  const stickShown = await page.evaluate(() =>
    document.getElementById('stick').classList.contains('active'));
  if (!stickShown) fail.push('the stick did not appear for a mouse drag');
  await page.mouse.up();

  // 2. Release hands back to a key that is still held.
  await page.keyboard.down('w');
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(760, 360, { steps: 4 });      // steer east with the mouse
  const both = await step();
  if (SIGN(both.dx) !== 1) fail.push('the stick did not win while it was held');
  await page.mouse.up();
  const afterRelease = await step();
  if (SIGN(afterRelease.dy) !== -1) {
    fail.push(`releasing the stick lost the held W key:` +
      ` dx=${afterRelease.dx.toFixed(1)} dy=${afterRelease.dy.toFixed(1)}`);
  }

  // 3. A click with no drag must not stop a keyboard player.
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(645, 362);                    // a jiggle, under the threshold
  const jiggled = await step();
  if (SIGN(jiggled.dy) !== -1) {
    fail.push(`a click with no real drag stopped the held W key:` +
      ` dx=${jiggled.dx.toFixed(1)} dy=${jiggled.dy.toFixed(1)}`);
  }
  await page.mouse.up();
  await page.keyboard.up('w');

  // 4. The setting turns it off.
  await page.evaluate(() => { WS.Save.settings.mouseSteer = false; });
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(760, 360, { steps: 4 });
  const off = await step();
  await page.mouse.up();
  if (SIGN(off.dx) !== 0 || SIGN(off.dy) !== 0) {
    fail.push(`mouse steering moved the survivor while the setting was off:` +
      ` dx=${off.dx.toFixed(1)} dy=${off.dy.toFixed(1)}`);
  }

  console.log(fail.length ? fail.join('\n')
    : 'ok: mouse drag steers, release hands back to held keys, a bare click does not,'
      + ' and the setting turns it off');
  await b.close();
  process.exitCode = fail.length ? 1 : 0;
})();
