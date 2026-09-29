#!/usr/bin/env node
/* The frame budget at the worst the game gets.
 *
 * Two scenes, each run through the real frame (Game.update + Renderer.draw)
 * for ten seconds of play, timed per frame:
 *
 *   horde   25:00 on every battlefield: a finished six-weapon build, the
 *           creature pool held near its cap (300 of MAX_ENEMIES 320), every
 *           effect on.
 *   finale  every battlefield's finale fight with the same build.
 *
 * The page runs with Chromium's CPU throttled (THROTTLE, default 2x) as a
 * stand-in for a handheld's slower core.
 *
 * What is budgeted is the SIMULATION (Game.update): it is plain JavaScript
 * on one thread wherever the game runs, so its time here scales to the
 * device. Its p95 must fit in SIM_BUDGET (a quarter of the 60Hz frame, the
 * rest being the draw's) and its p99 in HITCH (half the frame). The single
 * worst step is printed, not budgeted: it is usually a garbage collection,
 * which lands on whatever frame it likes. A step that opens a card screen is
 * left out - the world stops behind it, and building the cards is the
 * screen's cost, not the fight's.
 *
 * The draw is reported, not budgeted. A headless browser with no GPU
 * rasterizes the canvas in software on the same thread, so its draw time
 * is an upper bound that says nothing about a GPU-backed canvas (Electron
 * on a Deck, any desktop browser). Measured: taking the per-creature
 * save/restore out of drawEnemy changed nothing here, because the time is
 * the rasterizer's, not the script's. Read the draw column for regressions
 * (a pass that doubles), not against 16.7ms.
 *
 * Timing is wall-clock and shares the machine with whatever else is running;
 * run it on an idle machine.
 *
 *   node tools/check-perf.js              every battlefield
 *   node tools/check-perf.js --only ochre one
 *   THROTTLE=1 node tools/check-perf.js   the raw desktop numbers
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const MAPS = ['thornhollow', 'dustreach', 'mourneholt', 'ochre', 'palewastes', 'highmoor'];
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const THROTTLE = +(process.env.THROTTLE || 2);
const SIM_BUDGET = 4.2, HITCH = 8.3;
const BUILD = ['seeking_motes', 'umbral_bolt', 'cinderfall', 'arcweb', 'hallowed_ring', 'knifestorm'];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const fail = [], rows = [];
  for (const map of MAPS) {
    if (only && map !== only) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    // The page's own loop is stopped; this drives every frame itself.
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(GAME);
    await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db && WS.Finale);
    if (THROTTLE > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    }
    const out = await page.evaluate(({ map, build }) => {
      if (WS.Prologue.active) WS.Prologue.finish();
      WS.UI.closeOverlay(); WS.Save.db.seenManual = true; WS.Save.unlockAll();
      WS.Save.settings.victoryCinematic = false;
      const G = WS.Game;
      const setup = () => {
        WS.setSeed(99);
        G.startRun(map, 'mage');
        G.chooseBlessing(G.blessingChoices[0]);
        G.state = 'playing'; G.running = true; G.leveling = false; G.pendingLevelUps = 0; G.settle = 0;
        WS.UI.closeOverlay();
        const p = G.player;
        p.weapons.length = 0; p.weaponLevels = {};
        for (const id of build) {
          WS.Player.addWeapon(p, id);
          const w = WS.Player.getWeapon(p, id);
          w.level = 8; p.weaponLevels[id] = 8; w.evolved = true;
        }
        p.projectileBonus += 1; p.areaMultiplier += 0.3;
        p.maxHealth = 1e7; p.health = 1e7;
      };
      // Keep every card screen out of the measurement: a real player's
      // frames stop while one is up.
      const drive = () => {
        if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
        if (G.state === 'levelup') G.chooseLevelUp(G.levelChoices[0]);
        G.pendingLevelUps = 0;
        if (G.state !== 'playing') { WS.UI.closeOverlay(); G.state = 'playing'; }
        G.player.health = G.player.maxHealth;
      };
      // Walk a slow circle so the field moves the way it does in play.
      let ang = 0;
      const steer = () => {
        ang += 0.012;
        const K = WS.Input.keys;
        K.left = K.right = K.up = K.down = false;
        const c = Math.cos(ang), s = Math.sin(ang);
        if (c > 0.38) K.right = true; else if (c < -0.38) K.left = true;
        if (s > 0.38) K.down = true; else if (s < -0.38) K.up = true;
      };
      WS.Input.poll = () => {};
      const topUp = (to) => {
        if (WS.Enemy.count() >= to) return;
        const ids = [];
        for (let i = 0; i < WS.Enemy.pool.count; i++) {
          const e = WS.Enemy.pool.active[i];
          if (!e.boss && !e.part && !e._dead) ids.push(e.id);
        }
        if (!ids.length) return;
        for (let n = WS.Enemy.count(); n < to; n++) WS.Enemy.spawnRing(ids[n % ids.length], 420 + (n % 7) * 30, 1, true);
      };
      /* One scene: `frames` frames at 60Hz, each timed as the page's own
         frame is (update, then draw), with the systems that usually cost
         the most timed on their own. */
      const measure = (frames, keepFull) => {
        const parts = { enemy: 0, proj: 0, draw: 0 };
        const wrap = (obj, key, part) => {
          const f = obj[key];
          obj[key] = function () { const t = performance.now(); try { return f.apply(this, arguments); } finally { parts[part] += performance.now() - t; } };
          return () => { obj[key] = f; };
        };
        const undo = [wrap(WS.Enemy, 'update', 'enemy'), wrap(WS.Projectile, 'update', 'proj')];
        const ft = [], st = [], counts = [];
        const ctx2d = WS.Renderer.canvas.getContext('2d');
        for (let i = 0; i < frames; i++) {
          drive(); steer();
          if (keepFull && i % 30 === 0) topUp(300);
          const t0 = performance.now();
          G.update(1 / 60);
          const t1 = performance.now();
          WS.Renderer.draw(i / 60);
          /* Rasterize now, inside the timer. The browser records a canvas's
             draws and paints them later, so a draw that never reads its own
             pixels is timed at the cost of RECORDING it - and the bloom,
             which reads the frame back, was timed at the cost of painting
             everything: 25ms before it and 252ms after, of which 230 was the
             frame's own paint moved inside the window. Measured fairly both
             ways it was 63ms against 73. One pixel read settles it for every
             frame alike. */
          ctx2d.getImageData(0, 0, 1, 1);
          const t2 = performance.now();
          parts.draw += t2 - t1;
          ft.push(t2 - t0);
          if (G.state === 'playing') st.push(t1 - t0);
          counts.push(WS.Enemy.count());
        }
        undo.forEach((u) => u());
        const s = ft.slice().sort((a, b) => a - b);
        const q = (k) => s[Math.min(s.length - 1, Math.floor(k * s.length))];
        const ss = st.slice().sort((a, b) => a - b);
        const sq = (k) => ss[Math.min(ss.length - 1, Math.floor(k * ss.length))];
        for (const k in parts) parts[k] /= frames;
        return { p50: q(0.5), p95: q(0.95), max: s[s.length - 1],
          sim50: sq(0.5), sim95: sq(0.95), sim99: sq(0.99), simMax: ss[ss.length - 1],
          creatures: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length), parts };
      };

      const res = {};
      // HORDE: 25:00, pool held near its cap.
      setup();
      G.run.time = 1500;
      // Warmed with drawing on, as play would have: sprite caches, JIT.
      for (let i = 0; i < 600; i++) { drive(); steer(); if (i % 30 === 0) topUp(300); G.update(1 / 60); WS.Renderer.draw(i / 60); }
      res.horde = measure(600, true);

      // FINALE: straight to 30:00, face it, skip to the fight.
      setup();
      G.run.secondBlessing = true;
      G.run.time = WS.Config.deathTime - 0.5;
      for (let i = 0; i < 120 && G.state === 'playing'; i++) G.update(1 / 60);
      if (G.faceFinale) {
        G.faceFinale();
        for (let i = 0; i < 60 * 90 && WS.Finale.stage !== 'fight'; i++) { drive(); G.update(1 / 60); }
        // Into the fight far enough that its mechanics are all out.
        for (let i = 0; i < 60 * 20; i++) { drive(); steer(); G.update(1 / 60); WS.Renderer.draw(i / 60); }
        res.finale = WS.Finale.stage === 'fight' ? measure(600, false) : { skipped: WS.Finale.stage };
      }
      return res;
    }, { map, build: BUILD });

    for (const [scene, r] of Object.entries(out)) {
      if (r.skipped !== undefined) { rows.push(`${map.padEnd(12)} ${scene.padEnd(7)} (never reached the fight: ${r.skipped})`); continue; }
      rows.push(`${map.padEnd(12)} ${scene.padEnd(7)} ${String(r.creatures).padStart(3)} creatures`
        + `  sim p50 ${r.sim50.toFixed(2)} p95 ${r.sim95.toFixed(2)} p99 ${r.sim99.toFixed(1)} max ${r.simMax.toFixed(0)}ms`
        + ` (creatures ${r.parts.enemy.toFixed(2)}, bolts ${r.parts.proj.toFixed(2)})`
        + `  |  sw draw ${r.parts.draw.toFixed(1)}ms, whole frame p95 ${r.p95.toFixed(1)}ms`);
      if (r.sim95 > SIM_BUDGET) fail.push(`${map} ${scene}: simulation p95 ${r.sim95.toFixed(2)}ms over its ${SIM_BUDGET}ms share of the frame`);
      if (r.sim99 > HITCH) fail.push(`${map} ${scene}: simulation p99 ${r.sim99.toFixed(1)}ms, over half a frame`);
    }
    if (errs.length) fail.push(`${map}: page errors: ${errs.slice(0, 2).join(' | ')}`);
    await page.close();
  }
  console.log(`CPU throttled ${THROTTLE}x; simulation p95 <= ${SIM_BUDGET}ms, p99 <= ${HITCH}ms; draw is software-rasterized (upper bound)\n` + rows.join('\n'));
  if (fail.length) { console.log('FAIL\n  - ' + fail.join('\n  - ')); process.exitCode = 1; }
  else console.log('ok');
  await browser.close();
})();
