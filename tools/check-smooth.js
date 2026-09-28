#!/usr/bin/env node
/* Motion is smooth on a fast monitor.
 *
 * The simulation steps at 60 a second; a 120, 144 or 165 Hz screen draws
 * two or three frames per step. Drawn as the last step left it, a walking
 * survivor stands still for a frame or two and then jumps - measured at 144,
 * the drawn position went 0, 4.35, 0, 4.35, 0, 0, 4.35 pixels frame to frame.
 * The renderer now draws between the last two steps (Renderer.snapshot /
 * lerpIn), so every frame moves the same distance.
 *
 * This walks the survivor right at each refresh rate and asserts the drawn
 * step is even: the largest frame-to-frame step no more than 1.25x the
 * smallest, and none of them zero.
 *
 * NEGATIVE TEST: WS.Renderer.lerpIn = () => {} reports "144Hz: steps 0..4.35".
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
  const out = await page.evaluate(() => {
    if (WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay(); WS.Save.db.seenManual = true; WS.Save.unlockAll();
    const res = {};
    for (const hz of [120, 144, 165]) {
      WS.setSeed(7);
      WS.Game.startRun('thornhollow', 'mage');
      WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
      WS.Game.openLevelUp = () => {}; WS.Game.presentLevelUp = () => {};
      if (WS.Game.state !== 'playing') { WS.UI.closeOverlay(); WS.Game.state = 'playing'; }
      WS.Game.settle = 0; WS.Game.timeScale = 1;
      WS.Enemy.pool.releaseAll();
      WS.Input.poll = () => {}; WS.Input.keys.right = true;
      const p = WS.Game.player;
      p.x = 300;
      let drawn = null;
      const dp = WS.Renderer.drawPlayer;
      WS.Renderer.drawPlayer = function (ctx, pl) { if (drawn === null) drawn = pl.x; return dp.apply(this, arguments); };
      const xs = [];
      for (let i = 0; i < 60; i++) {
        WS.Game.pendingLevelUps = 0;
        drawn = null; WS.Game.update(1 / hz); WS.Renderer.draw(i / hz);
        if (i >= 20) xs.push(drawn);
      }
      WS.Renderer.drawPlayer = dp;
      WS.Input.keys.right = false;
      const steps = xs.slice(1).map((x, i) => x - xs[i]);
      res[hz] = { min: Math.min(...steps), max: Math.max(...steps) };
    }
    return res;
  });
  const fail = [];
  for (const [hz, r] of Object.entries(out)) {
    if (!(r.min > 0) || r.max > r.min * 1.25) fail.push(`${hz}Hz: steps ${r.min.toFixed(2)}..${r.max.toFixed(2)}`);
  }
  if (errs.length) fail.push('page errors: ' + errs.slice(0, 3).join(' | '));
  if (fail.length) { console.log('FAIL\n  - ' + fail.join('\n  - ')); process.exitCode = 1; }
  else {
    console.log('ok: a walking survivor moves an even distance every frame at '
      + Object.entries(out).map(([hz, r]) => `${hz}Hz (${r.min.toFixed(2)}-${r.max.toFixed(2)}px)`).join(', '));
  }
  await b.close();
})();
