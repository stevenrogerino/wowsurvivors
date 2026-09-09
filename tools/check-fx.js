#!/usr/bin/env node
/* Effects guard rail.
 *
 * FX.spray takes a DIRECTION. A call site handed it a projectile's raw
 * velocity instead, so every impact launched sparks at direction x speed -
 * tens of thousands of px/s - which crosses the whole 1280px world inside a
 * frame. On screen that read as tiny circles blinking at random places
 * whenever a shot connected, and nothing in the simulation was wrong enough
 * to notice: no NaN, no crash, no error. Only the particles' speed gave it
 * away.
 *
 * So that is what this measures. It plays a real run and asserts that no
 * particle ever moves faster than anything that spawns one asks for, and that
 * none of them end up outside the world.
 *
 * It checks seeking bolts for the mirror-image failure. Homing used to steer
 * by lerping the velocity toward target-direction x speed, and a lerp between
 * two vectors of equal length gives a chord - always shorter than the radius -
 * so every frame a bolt turned it lost a little speed. On the near-180-degree
 * turn a bolt makes right after piercing something it shed most of its speed
 * in a few frames and settled into a hover, sitting on the field like a mine.
 * A bolt now holds its launch speed exactly, so that is the assertion.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-fx.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

// The fastest particle any caller asks for. FX.burst tops out around 320 on a
// boss death; the ceiling is generous, because the failure it catches was two
// orders of magnitude over.
const MAX_SPEED = 1200;

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const fail = [];
  page.on('pageerror', (e) => fail.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
  });
  const worst = await page.evaluate((MAX_SPEED) => {
    WS.Game.startRun('thornhollow', 'mage');
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT, K = WS.Input.keys;
    let maxSpeed = 0, offworld = 0, nan = 0, seen = 0, fastest = null;
    let slowestBolt = 1, boltSamples = 0, stalled = null;
    for (let i = 0; i < 60 * 240; i++) {
      if (WS.Game.state === 'levelup' || WS.Game.state === 'blessing') {
        const c = document.querySelector('#overlay:not(.hidden) .card');
        if (c) { c.click(); continue; }
      }
      if (WS.Game.state !== 'playing') break;
      const pl = WS.Game.player, t = WS.Game.run.time;
      let tx = W / 2 + Math.cos(t * 0.5) * 240, ty = H / 2 + Math.sin(t * 0.5) * 170;
      const near = WS.Enemy.findNearest(pl.x, pl.y, 160);
      if (near) {
        const dx = pl.x - near.x, dy = pl.y - near.y, d = Math.hypot(dx, dy) || 1;
        tx = pl.x + dx / d * 250; ty = pl.y + dy / d * 250;
      }
      tx = Math.max(80, Math.min(W - 80, tx)); ty = Math.max(80, Math.min(H - 80, ty));
      K.left = tx - pl.x < -6; K.right = tx - pl.x > 6;
      K.up = ty - pl.y < -6; K.down = ty - pl.y > 6;
      pl.health = pl.maxHealth;              // survive long enough to observe
      WS.Game.update(1 / 60);

      // Seeking bolts must not lose speed while they turn.
      const bolts = WS.Projectile.bolts;
      for (let n = 0; n < bolts.count; n++) {
        const bo = bolts.active[n];
        if (!bo.homing || !bo.speed) continue;
        boltSamples++;
        const ratio = Math.hypot(bo.vx, bo.vy) / bo.speed;
        if (ratio < slowestBolt) { slowestBolt = ratio; stalled = bo.art; }
      }

      const parts = WS.FX.particles;
      for (let n = 0; n < parts.count; n++) {
        const p = parts.active[n];
        seen++;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) ||
            !Number.isFinite(p.vx) || !Number.isFinite(p.vy)) { nan++; continue; }
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > maxSpeed) { maxSpeed = sp; fastest = p.colour; }
        if (p.x < -200 || p.x > W + 200 || p.y < -200 || p.y > H + 200) offworld++;
      }
    }
    return { maxSpeed, offworld, nan, seen, fastest, limit: MAX_SPEED,
      slowestBolt, boltSamples, stalled };
  }, MAX_SPEED);

  if (worst.seen === 0) fail.push('no particles observed at all - the harness never got into combat');
  if (worst.nan > 0) fail.push(`${worst.nan} particle samples had non-finite position or velocity`);
  if (worst.maxSpeed > MAX_SPEED) {
    fail.push(`fastest particle ${worst.maxSpeed.toFixed(0)} px/s exceeds the ${MAX_SPEED} px/s ceiling` +
      ` (colour ${worst.fastest}) - a caller is probably passing a velocity where a direction is expected`);
  }
  if (worst.offworld > 0) fail.push(`${worst.offworld} particle samples were outside the world`);
  if (worst.boltSamples === 0) fail.push('no seeking bolts observed - mage should fire them from the first shot');
  else if (worst.slowestBolt < 0.98) {
    fail.push(`a seeking bolt fell to ${(worst.slowestBolt * 100).toFixed(0)}% of its launch speed` +
      ` (art ${worst.stalled}) - steering is bleeding speed, and a bolt that stalls sits on the field like a mine`);
  }

  console.log(fail.length ? fail.join('\n')
    : `ok: ${worst.seen} particle samples, fastest ${worst.maxSpeed.toFixed(0)} px/s, none off-world;` +
      ` ${worst.boltSamples} seeking-bolt samples, slowest ${(worst.slowestBolt * 100).toFixed(0)}% of launch speed`);
  await b.close();
  process.exitCode = fail.length ? 1 : 0;
})();
