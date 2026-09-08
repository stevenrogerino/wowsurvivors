#!/usr/bin/env node
/* Input guard rail. Holding a diagonal through a level-up used to come out as
 * a single direction: the overlay called Input.releaseAll(), and the browser
 * only auto-repeats keydown for the most recently pressed key, so every other
 * held direction was silently dropped. This drives real keyboard events
 * through the overlay and checks the survivor is still travelling the way the
 * player is still asking for.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-input.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const SIGN = (n) => (n > 0.01 ? 1 : n < -0.01 ? -1 : 0);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const fail = [];
  page.on('pageerror', (e) => fail.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(700);

  await page.evaluate(() => { WS.Game.startRun('thornhollow', 'mage'); });
  await page.waitForTimeout(150);
  // Clear the opening blessing so the run is actually playing.
  await page.evaluate(() => {
    const c = document.querySelector('#overlay:not(.hidden) .card');
    if (c) c.click();
  });
  await page.waitForTimeout(150);

  // Hold a north-east diagonal, and keep holding it for the whole test.
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  const step = () => page.evaluate(() => {
    const p = WS.Game.player, x = p.x, y = p.y;
    for (let i = 0; i < 30; i++) WS.Game.update(1 / 60);
    return { dx: WS.Game.player.x - x, dy: WS.Game.player.y - y };
  });

  const before = await step();
  if (SIGN(before.dx) !== 1 || SIGN(before.dy) !== -1) {
    fail.push(`before: expected north-east, moved dx=${before.dx.toFixed(1)} dy=${before.dy.toFixed(1)}`);
  }

  // Level up and pick a card, still holding W and D the whole time.
  await page.evaluate(() => { WS.Game.pendingLevelUps = 1; WS.Game.openLevelUp(); });
  await page.waitForTimeout(300);
  await page.click('#overlay .card');
  await page.waitForTimeout(200);

  const after = await step();
  if (SIGN(after.dx) !== 1 || SIGN(after.dy) !== -1) {
    fail.push(`after level-up: expected north-east, moved dx=${after.dx.toFixed(1)} dy=${after.dy.toFixed(1)}`);
  }

  // The same through a pause.
  await page.evaluate(() => WS.Game.pause());
  await page.waitForTimeout(250);
  await page.evaluate(() => WS.Game.resume());
  await page.waitForTimeout(200);
  const resumed = await step();
  if (SIGN(resumed.dx) !== 1 || SIGN(resumed.dy) !== -1) {
    fail.push(`after pause: expected north-east, moved dx=${resumed.dx.toFixed(1)} dy=${resumed.dy.toFixed(1)}`);
  }

  // Releasing must still stop the survivor - the fix must not strand keys down.
  await page.keyboard.up('w');
  await page.keyboard.up('d');
  const stopped = await step();
  if (SIGN(stopped.dx) !== 0 || SIGN(stopped.dy) !== 0) {
    fail.push(`after release: expected a standstill, moved dx=${stopped.dx.toFixed(1)} dy=${stopped.dy.toFixed(1)}`);
  }

  console.log(fail.length ? fail.join('\n') : 'ok: held movement survives level-up and pause');
  await b.close();
  process.exitCode = fail.length ? 1 : 0;
})();
