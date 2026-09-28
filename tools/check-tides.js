#!/usr/bin/env node
/* The night breathes around its bosses (src/game/waves.js THE TIDE) and
 * every boss leaves a reliquary (src/game/pickup.js, LevelUp.bestow).
 *
 * Checks, on a live game:
 *   - the pace gathers before a boss and falters after one falls
 *   - a deepening step lands in full on a survivor the night is not hurting
 *     and not at all on one it is hurting at tideStrainFull
 *   - a boss leaves a reliquary and Death does not
 *   - a reliquary's gifts go down the build's road in order: the ready
 *     evolution, then the passive a finished weapon waits on, then ranks
 *
 * NEGATIVE TESTS: drop the strain scale in Wave.depth and the hurt survivor
 * gets the full step; drop the evolve branch in LevelUp.bestow and the first
 * gift is a rank.
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
  const r = await page.evaluate(() => {
    if (WS.Prologue.active) WS.Prologue.finish(); WS.UI.closeOverlay(); WS.Save.unlockAll(); WS.Save.save = () => {};
    const cfg = WS.Config, W = WS.WaveManager, G = WS.Game;
    const out = { on: cfg.tides && cfg.reliquaries };
    WS.setSeed(5); G.startRun('dustreach', 'hunter'); G.chooseBlessing({ type: 'blessing', id: 'kings' });
    G.openLevelUp = () => {}; G.presentLevelUp = () => {};
    const run = G.run, p = G.player;
    const boss = run.map.bosses[0];
    // The pace: gathering, then the lull.
    out.calm = W.tide(boss.at - cfg.tideGather - 5, run);
    out.crest = W.tide(boss.at - 0.5, run);
    W.bossIndex = 1;   // the boss has come
    W.onBossSlain();
    out.lull = W.tide(boss.at + 1, run);
    W.lull = 0;
    // A step, as the night finds each survivor.
    const stepAt = boss.at + cfg.tideLull;
    const deepen = (strain) => {
      W.deepened = 0; W.stepK = []; W.strain = strain; W.lastTaken = run.damageTaken || 0;
      run.time = stepAt + 0.01; W.update(0, run);
      return W.depth(stepAt + cfg.tideStepTime + 1, run);
    };
    out.fresh = deepen(0);
    out.hurt = deepen(cfg.tideStrainFull * 1.5);
    // Reliquaries.
    WS.Enemy.clear(); WS.Pickup.pool.releaseAll();
    const kill = (id) => { const e = WS.Enemy.spawn(id, p.x + 120, p.y, 1, true); WS.Enemy.damage(e, e.health + 1, false, 'test'); };
    const count = () => WS.Pickup.pool.active.slice(0, WS.Pickup.pool.count).filter((q) => q.kind === 'reliquary').length;
    kill(boss.id); out.fromBoss = count();
    WS.Pickup.pool.releaseAll();
    kill('death_itself'); out.fromDeath = count();
    // The road: a finished weapon missing its passive, another nearly there.
    const w = p.weapons[0];
    w.level = WS.WEAPON_MAX_LEVEL; p.weaponLevels[w.id] = w.level;
    const pair = w.data.evolvePairing;
    p.upgradeLevels[pair] = 0;
    const second = WS.Player.addWeapon(p, 'rimeshard'); second.level = 5; p.weaponLevels.rimeshard = 5;
    out.gifts = WS.LevelUp.bestow(p, 4);
    out.evolved = w.evolved;
    out.pair = WS.Upgrades[pair].name;
    out.evolveName = w.data.evolveName;
    out.second = second.level;
    return out;
  });
  await b.close();
  const fail = [];
  if (!r.on) fail.push('Config.tides and Config.reliquaries are not both on');
  if (!(r.crest > r.calm * 1.3)) fail.push(`the pace does not gather before a boss (${r.calm.toFixed(2)} -> ${r.crest.toFixed(2)})`);
  if (!(r.lull < r.calm * 0.5)) fail.push(`the pace does not falter after a boss falls (${r.lull.toFixed(2)})`);
  if (!(r.fresh > 1.05)) fail.push(`a survivor the night is not hurting gets no step (depth ${r.fresh.toFixed(3)})`);
  if (!(Math.abs(r.hurt - 1) < 1e-6)) fail.push(`a survivor hurt at the strain ceiling still gets a step (depth ${r.hurt.toFixed(3)})`);
  if (r.fromBoss !== 1) fail.push(`a boss left ${r.fromBoss} reliquaries, not 1`);
  if (r.fromDeath !== 0) fail.push('Death left a reliquary');
  if (r.gifts[0] !== r.pair || r.gifts[1] !== r.evolveName || !r.evolved) fail.push(`the gifts did not go passive, then evolution: ${r.gifts.join(', ')}`);
  if (r.second !== 7) fail.push(`the next gifts did not rank the weapon nearest evolution (rank ${r.second})`);
  if (errs.length) fail.push('page errors: ' + errs.slice(0, 3).join(' | '));
  if (fail.length) { console.log('FAIL\n  - ' + fail.join('\n  - ')); process.exit(1); }
  console.log(`ok: the pace runs x${r.calm.toFixed(2)} -> x${r.crest.toFixed(2)} into a boss and x${r.lull.toFixed(2)} after it falls; `
    + `a step lands at x${r.fresh.toFixed(2)} on a survivor the night is not hurting and x${r.hurt.toFixed(2)} on one it is; `
    + `a boss leaves a reliquary and Death does not; and four gifts went ${r.gifts.join(', ')}`);
})();
