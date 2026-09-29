#!/usr/bin/env node
/* Beans follows the bosses (WaveManager.beansFollows).
 *
 * Plays each battlefield's night on a fast clock, killing every scheduled
 * boss a few seconds after it arrives, and records when Beans sets up shop
 * and when she packs up. Then the finale: she is there for the breather and
 * gone when the fight begins.
 *
 * Checks, per battlefield:
 *   - every visit comes within a few seconds of a boss falling
 *   - no two visits less than Config.eggVendorGap apart
 *   - none within Config.eggVendorFinaleGap of the finale
 *   - the HUD timer names what she follows and never points past 30:00
 *   - the breather visit, and no Beans once the finale fight starts
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
  const res = await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay();
    WS.Save.db.seenManual = true; WS.Save.unlockAll();
    WS.Save.save = () => {}; WS.Save.flush = () => {};
    const out = {};
    const C = WS.Config;
    for (const mapId of WS.MapOrder.filter((id) => !WS.Maps[id].arena)) {
      WS.setSeed(4242);
      const G = WS.Game;
      G.startRun(mapId, 'warrior');
      G.chooseBlessing({ type: 'blessing', id: 'kings' });
      const p = G.player;
      WS.Player.takeDamage = () => false;
      G.openLevelUp = () => {}; G.presentLevelUp = () => {};
      G.state = 'playing'; WS.UI.closeOverlay();
      const W = WS.WaveManager;
      const visits = [], leaves = [], falls = [], labels = [], problems = [];
      // Every boss that falls, however it falls.
      const slain = W.onBossSlain;
      W.onBossSlain = function () { falls.push(Math.round(G.run.time)); return slain.apply(this, arguments); };
      let had = false;
      const beansUp = () => { for (let i = 0; i < WS.Pickup.pool.count; i++) if (WS.Pickup.pool.active[i].kind === 'merchant') return true; return false; };
      const step = 1 / 20;
      while (G.run.time < C.deathTime - 1 && G.running) {
        G.pendingLevelUps = 0; G.leveling = false;
        if (G.state !== 'playing') { WS.UI.closeOverlay(); G.state = 'playing'; }
        p.health = p.maxHealth;
        // Keep the field thin: this is about the clock, not the fight.
        for (let i = WS.Enemy.pool.count - 1; i >= 0; i--) {
          const e = WS.Enemy.pool.active[i];
          if (e.boss) { if (G.run.time - (e.__seen || (e.__seen = G.run.time)) > 6) WS.Enemy.kill(e); }
          else if (WS.Enemy.pool.count > 40) WS.Enemy.pool.releaseAt(i);
        }
        G.update(step);
        const up = beansUp();
        if (up && !had) visits.push(Math.round(G.run.time));
        if (!up && had) leaves.push(Math.round(G.run.time));
        had = up;
        if (Math.round(G.run.time * 20) % 600 === 0) {
          const bt = W.timers(G.run).find((x) => x.kind === 'beans');
          if (bt) {
            labels.push(bt.label);
            if (G.run.time + bt.left > C.deathTime + 0.5) problems.push(`timer points past dawn at ${Math.round(G.run.time)}: ${bt.label} in ${Math.round(bt.left)}`);
          }
        }
      }
      // The checks on the night.
      for (const v of visits) {
        if (!falls.some((f) => v - f >= 0 && v - f <= C.eggVendorDelay + 2)) problems.push(`visit at ${v} follows no boss (falls ${falls.join(',')})`);
        if (C.deathTime - v < C.eggVendorFinaleGap) problems.push(`visit at ${v} too close to the finale`);
      }
      for (let i = 1; i < visits.length; i++) if (visits[i] - visits[i - 1] < C.eggVendorGap) problems.push(`visits ${visits[i - 1]} and ${visits[i]} too close`);
      // The finale: breather, then fight.
      let breather = null, gone = null;
      if (WS.Finale.available(G.run)) {
        while (G.run.time > 0 && WS.Pickup.pool.count) WS.Pickup.pool.releaseAt(0);
        WS.Finale.begin(G.run);
        for (let i = 0; i < 20 * 120 && WS.Finale.stage !== 'fight'; i++) {
          G.pendingLevelUps = 0; G.leveling = false;
          if (G.state !== 'playing') { WS.UI.closeOverlay(); G.state = 'playing'; }
          G.update(step);
          if (WS.Finale.stage === 'breather' && beansUp()) breather = breather || Math.round(G.run.time);
        }
        for (let i = 0; i < 20; i++) G.update(step);
        gone = !beansUp();
        if (!breather) problems.push('no Beans at the breather');
        if (!gone) problems.push('Beans still there once the finale fight began');
      }
      W.onBossSlain = slain;
      out[mapId] = { bosses: WS.Maps[mapId].bosses.map((x) => x.at), falls, visits, leaves, breather, gone, labels: [...new Set(labels)].slice(0, 6), problems };
      G.quitToMenu && G.quitToMenu();
    }
    return out;
  });
  let bad = 0;
  for (const [m, r] of Object.entries(res)) {
    console.log(`${m.padEnd(12)} bosses ${r.bosses.join(',')}  visits ${r.visits.join(',') || '-'}  breather ${r.breather || '-'}  gone at fight ${r.gone}`);
    console.log(`             timer says: ${r.labels.join(' | ')}`);
    for (const p of r.problems) { console.log('   FAIL ' + p); bad++; }
  }
  if (errs.length) { console.log('page errors: ' + errs.slice(0, 3).join(' | ')); bad++; }
  console.log(bad ? `\nFAIL: ${bad} problem(s)` : '\nok: Beans follows the bosses, skips the eve of the finale, keeps the breather and leaves for the fight');
  process.exitCode = bad ? 1 : 0;
  await b.close();
})();
