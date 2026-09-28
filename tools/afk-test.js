#!/usr/bin/env node
/* Can this build stand still and win?
 *
 * Not a guard: an instrument. A tester found the game is decided in the
 * first ten minutes - after that a strong build stands in a circle of its
 * own dead and the night never reaches it. This gives a named build (the
 * testers' own, below) to a survivor at T0 on the hardest night there is,
 * touches no key, suppresses level-ups so the build is the build, and runs
 * the clock for LIMIT seconds. Reported per build:
 *
 *   stood     how long it stood before falling (LIMIT means it never fell)
 *   low       the lowest its health got, as a share of the bar
 *   taken/s   damage that landed per second; healed/s the same for healing
 *   dealt/s   damage dealt per second
 *   reach     how close the nearest creature got, on average (the edge of
 *             the kill zone: a creature that gets no nearer never touches you)
 *   by        what hurt it most
 *
 *   node tools/afk-test.js                        every build, 2 seeds
 *   BUILD=ten,eisen SEEDS=3 node tools/afk-test.js
 *   MAP=thornhollow DIFF=veteran HYPER=0 T0=900 LIMIT=300 node tools/afk-test.js
 *   CONFIG='{"holyLock":8}' node tools/afk-test.js   a patch, measured
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const S = {
  MAP: env('MAP', 'palewastes'), DIFF: env('DIFF', 'professional'), HYPER: env('HYPER', '1') === '1',
  T0: +env('T0', 1200), LIMIT: +env('LIMIT', 590), SEEDS: +env('SEEDS', 2), LEVEL: +env('LEVEL', 150),
  CONFIG: JSON.parse(env('CONFIG', '{}')), CHARS: JSON.parse(env('CHARS', '{}')),
  WEAPONS: JSON.parse(env('WEAPONS', '{}')), BLESSINGS: JSON.parse(env('BLESSINGS', '{}')),
};

/* The builds. `weapons` are held at rank 8 and evolved; `unions` are fused
   from their two parts exactly as the level-up screen does it, so every
   discovery the parts carried goes into the union. From a tester's sheets. */
const BUILDS = {
  ten: { hero: 'ruinseeker', blessings: ['ruinous_pact', 'kings'],
    weapons: ['cinderfall', 'umbral_bolt', 'blightfield', 'thornbloom', 'grave_tether', 'verdant_lance',
      'spirit_herd', 'moonbrand', 'seeking_motes', 'rimeshard'],
    unions: ['union_ruin', 'union_rotwood', 'union_wild_hunt', 'union_firmament'] },
  eisen: { hero: 'monk', blessings: ['stillwater', 'kings'],
    weapons: ['axe_gyre', 'arcweb', 'dawnpulse', 'hallowed_ring', 'iron_palms', 'gale_chakram',
      'knifestorm', 'rimeshard', 'judgement_disc', 'grave_tether'],
    unions: ['union_stormcall', 'union_sanctuary', 'union_tempest_kata'] },
  nim: { hero: 'warlock', blessings: ['reapers_tithe', 'kings'],
    weapons: ['cinderfall', 'umbral_bolt', 'moonbrand', 'grave_tether', 'rimeshard', 'dawnpulse'],
    unions: ['union_ruin'] },
  milksupply: { hero: 'druid', blessings: ['wildshape', 'kings'],
    weapons: ['spirit_herd', 'verdant_lance', 'grave_tether', 'blightfield', 'thornbloom', 'moonbrand', 'dawnpulse'],
    unions: ['union_wild_hunt', 'union_rotwood'] },
  maelz: { hero: 'monk', blessings: ['stillwater', 'kings'],
    weapons: ['axe_gyre', 'arcweb', 'iron_palms', 'dawnpulse', 'hallowed_ring', 'judgement_disc'],
    unions: ['union_stormcall', 'union_sanctuary'] },
  keegan: { hero: 'paladin', blessings: ['conviction', 'kings'],
    weapons: ['judgement_disc', 'dawnpulse', 'hallowed_ring', 'grave_tether', 'arcweb', 'knifestorm'],
    unions: ['union_sanctuary'] },
  // A control: six evolved weapons and no union, what an unremarkable late
  // run holds. If this stands too, standing is the game, not the build.
  plain: { hero: 'mage', blessings: ['arcane_surge', 'kings'],
    weapons: ['seeking_motes', 'knifestorm', 'arcweb', 'volley', 'gale_chakram', 'judgement_disc'],
    unions: [] },
};
const want = env('BUILD', Object.keys(BUILDS).join(',')).split(',');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const rows = [];
  for (const name of want) {
    const B = BUILDS[name];
    if (!B) { console.log('no build ' + name); continue; }
    for (let seed = 1; seed <= S.SEEDS; seed++) {
      const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
      await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
      const r = await page.evaluate(({ S, B, seed }) => {
        if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
        WS.UI.closeOverlay();
        WS.Save.db.seenManual = true; WS.Save.unlockAll();
        WS.Save.save = () => {}; WS.Save.flush = () => {};
        WS.Save.settings.difficulty = S.DIFF;
        WS.Save.db.unlocks.hyper[S.MAP] = true; WS.Save.db.hyperArmed = S.HYPER;
        Object.assign(WS.Config, S.CONFIG);
        for (const [id, o] of Object.entries(S.CHARS)) Object.assign(WS.Characters[id], o);
        for (const [id, o] of Object.entries(S.WEAPONS)) Object.assign(WS.Weapons[id], o);
        for (const [id, o] of Object.entries(S.BLESSINGS)) Object.assign(WS.Blessings[id], o);
        WS.setSeed(1000 + seed);
        const G = WS.Game;
        G.startRun(S.MAP, B.hero);
        G.chooseBlessing({ type: 'blessing', id: B.blessings[0] });
        const p = G.player;
        for (const id of B.blessings.slice(1)) {
          WS.Blessings[id].apply(p, WS.Blessings[id]); p.blessingsTaken[id] = true;
        }
        G.run.secondBlessing = true;
        G.openLevelUp = () => {}; G.presentLevelUp = () => {};
        G.state = 'playing'; WS.UI.closeOverlay();
        // The build.
        p.weapons.length = 0; p.weaponLevels = {};
        for (const id of B.weapons) {
          const w = WS.Player.addWeapon(p, id);
          if (!w) continue;
          w.level = WS.WEAPON_MAX_LEVEL; p.weaponLevels[id] = w.level;
          if (WS.Weapons[id].evolveName) w.evolved = true;
        }
        WS.ComboSystem.check(p);
        for (const uid of B.unions) {
          const u = WS.Unions.find((x) => x.result === uid);
          for (const id of u.from) WS.Player.removeWeapon(p, id);
          const w = WS.Player.addWeapon(p, uid);
          w.level = WS.WEAPON_MAX_LEVEL; p.weaponLevels[uid] = w.level;
          WS.ComboSystem.inherit(p, w, u.from);
          WS.ComboSystem.check(p);
          p.unionsForged[uid] = true;
        }
        // Every passive at its cap, as a run this late has them.
        for (const id of WS.UpgradeOrder) {
          const up = WS.Upgrades[id];
          if (!up || !up.max || id === 'dark_bargain') continue;
          for (let k = (p.upgradeLevels[id] || 0); k < up.max; k++) { up.apply(p, up); p.upgradeLevels[id] = k + 1; }
        }
        p.level = S.LEVEL;
        p.health = p.maxHealth;
        G.run.time = S.T0;
        p.x = WS.CONST.WORLD_WIDTH / 2; p.y = WS.CONST.WORLD_HEIGHT / 2;
        WS.Input.poll = () => {};
        for (const k of Object.keys(WS.Input.keys)) WS.Input.keys[k] = false;
        // Stand, and watch.
        const by = {};
        const hurt = WS.Player.takeDamage;
        WS.Player.takeDamage = function (pl, amount, src) {
          const h0 = pl.health; const res = hurt.apply(this, arguments);
          const lost = WS.max(0, h0 - pl.health);
          if (lost > 0) by[src || '?'] = (by[src || '?'] || 0) + lost;
          return res;
        };
        const d0 = G.run.damageDone, h0 = G.run.healingDone;
        let low = 1, reachSum = 0, reachN = 0, stood = 0, taken = 0;
        const STEP = 1 / 60;
        for (let i = 0; i < S.LIMIT * 60; i++) {
          G.pendingLevelUps = 0; G.leveling = false;
          if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
          if (G.state !== 'playing' && G.state !== 'dying') { WS.UI.closeOverlay(); G.state = 'playing'; }
          const hp = p.health;
          G.update(STEP);
          if (G.state === 'dying' || G.state === 'over' || p.health <= 0) break;
          if (p.health < hp) taken += hp - p.health;
          low = WS.min(low, p.health / p.maxHealth);
          stood += STEP;
          if (i % 30 === 0) {
            let near = 1e9;
            for (let k = 0; k < WS.Enemy.pool.count; k++) {
              const e = WS.Enemy.pool.active[k];
              const d = Math.hypot(e.x - p.x, e.y - p.y) - e.radius;
              if (d < near) near = d;
            }
            if (near < 1e9) { reachSum += near; reachN++; }
          }
        }
        const top = Object.entries(by).sort((a, c) => c[1] - a[1]).slice(0, 2)
          .map(([k, v]) => `${k} ${Math.round(100 * v / WS.max(1, Object.values(by).reduce((a, x) => a + x, 0)))}%`);
        const dealt = G.run.damageDone - d0;
        const byW = Object.entries(G.run.damageByWeapon).sort((a, c) => c[1] - a[1]).slice(0, 3)
          .map(([k, v]) => `${k} ${Math.round(100 * v / WS.max(1, G.run.damageDone))}%`);
        return {
          stood: Math.round(stood), low: Math.round(low * 100), hp: Math.round(p.maxHealth), armor: Math.round(p.armor),
          takenPs: Math.round(taken / WS.max(1, stood)), healedPs: Math.round((G.run.healingDone - h0) / WS.max(1, stood)),
          dealtPs: Math.round(dealt / WS.max(1, stood)), reach: reachN ? Math.round(reachSum / reachN) : null,
          by: top.join(', '), top: byW.join(', '), weapons: p.weapons.map((w) => w.id).join(' '),
          combos: Object.keys(p.combosActive || {}).filter((k) => p.combosActive[k]).length,
          storms: G.run.storms || 0,
        };
      }, { S, B, seed });
      rows.push({ name, seed, ...r, errs: errs.length });
      console.log(`${name.padEnd(11)} s${seed}  stood ${String(r.stood).padStart(4)}s/${S.LIMIT}  low ${String(r.low).padStart(3)}%`
        + `  hp ${r.hp} armor ${r.armor}  taken ${r.takenPs}/s  healed ${r.healedPs}/s  dealt ${(r.dealtPs / 1000).toFixed(0)}k/s`
        + `  reach ${r.reach}px  discoveries ${r.combos}${r.storms ? '  judgements ' + r.storms : ''}  | hurt by ${r.by || 'nothing'} | damage ${r.top}${errs.length ? '  ERR ' + errs[0] : ''}`);
      await page.close();
    }
  }
  if (env('OUT', null)) require('fs').writeFileSync(env('OUT'), JSON.stringify({ S, rows }, null, 1));
  await b.close();
})();
