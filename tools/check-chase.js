#!/usr/bin/env node
/* Chase-target guard rail.
 *
 * check-steer.js proves the hand-off between mouse and keyboard. This proves
 * the thing that hand-off is actually driving: the point Input.chaseTarget
 * is now revisited from the survivor's current position every tick, rather
 * than latched once into a fixed vector at drag time.
 *
 * That distinction is invisible in a single frame and very visible in a
 * hand: click near the survivor, hold the mouse still, and the OLD scheme
 * sent it on that one heading forever - it sailed straight past wherever
 * the player had actually aimed, because nothing fed the survivor's motion
 * back into the direction it was walking. The fix is to re-aim at the same
 * world point from wherever the survivor now is, every tick, so it closes
 * in and stops instead of orbiting or overshooting.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-chase.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

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

  const park = () => page.evaluate(() => {
    const p = WS.Game.player;
    p.x = WS.CONST.WORLD_WIDTH / 2; p.y = WS.CONST.WORLD_HEIGHT / 2;
  });
  const ticks = (n) => page.evaluate((n) => {
    for (let k = 0; k < n; k++) WS.Game.update(1 / 60);
    return { x: WS.Game.player.x, y: WS.Game.player.y };
  }, n);

  // 1. Click near the survivor, drag past ENGAGE, then hold the pointer
  //    still. It must arrive at that point and stay there - not carry the
  //    original heading past it forever.
  await park();
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(760, 360, { steps: 4 });   // 120px east, past ENGAGE
  await page.mouse.move(760, 360);                 // and then hold still
  const target = await page.evaluate(() => WS.Renderer.toWorld(760, 360));

  const readings = [];
  for (let i = 0; i < 30; i++) readings.push(await ticks(5));
  await page.mouse.up();

  const dist = (p) => Math.hypot(p.x - target[0], p.y - target[1]);
  const final = dist(readings[readings.length - 1]);
  if (final > 15) {
    fail.push(`held still past the target's heading instead of arriving: `
      + `final distance ${final.toFixed(1)}px`);
  }
  // Once it has closed to near the target, it must not walk back open again -
  // that would be the dead zone flickering the survivor in and out of motion.
  const settled = readings.slice(-10).map(dist);
  const drift = Math.max(...settled) - Math.min(...settled);
  if (drift > 4) fail.push(`jittered once arrived: ${drift.toFixed(1)}px of drift over the last 10 samples`);

  // 2. A moving pointer keeps being chased, not just the point it started
  //    the drag from.
  await park();
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(760, 360, { steps: 4 });   // engage, heading east
  await ticks(10);
  await page.mouse.move(640, 240, { steps: 4 });   // now redirect north
  const redirected = await ticks(15);
  await page.mouse.up();
  if (!(redirected.y < 350)) {
    fail.push(`did not follow the pointer to a new heading: y=${redirected.y.toFixed(1)} (started at 360)`);
  }

  console.log(fail.length ? fail.join('\n')
    : 'ok: holding the pointer still lets the survivor arrive and stop rather than sailing past,'
      + ' arrival does not jitter, and a moving pointer keeps being chased rather than launched at once');
  await b.close();
  process.exitCode = fail.length ? 1 : 0;
})();
