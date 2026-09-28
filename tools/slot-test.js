#!/usr/bin/env node
/* What one slot is worth at the end of a night.
 *
 * Not a guard: the instrument for bringing abilities' damage into line. A
 * tester's strongest builds stood still from 20:00 and won - not because
 * standing is wrong, but because a few abilities hit many times harder than
 * the rest. This puts every ability on the same footing and measures it:
 *
 *   one survivor (the Mage, so no calling is in play unless asked for),
 *   level 150, the generic passives at their caps (might, haste, precision,
 *   ferocity, area, quantity, velocity, duration, vitality, armour,
 *   recovery - nothing that deals damage of its own), dropped at T0 into the
 *   real waves of a hard night, health pinned so it cannot fall, standing
 *   where it lands, holding ONE thing:
 *
 *     weapon   one weapon at rank 8, evolved
 *     union    one union at rank 8 (it costs two slots to make)
 *     pair     two weapons whose discovery is at stake, evolved, with the
 *              discovery live - against the same two measured alone
 *     calling  a survivor's signature blessing with a plain evolved weapon
 *              (Seeking Motes) beside it; the calling's own damage is the row
 *
 * Reported: damage per second from the thing measured (bombs and anything
 * the passives would add are excluded), and kills.
 *
 *   node tools/slot-test.js                     everything, 2 seeds
 *   ONLY=union SEEDS=3 node tools/slot-test.js  one kind
 *   WEAPONS='{"union_ruin":{"damage":20}}' ONLY=union node tools/slot-test.js
 *   OUT=/tmp/slots.json ...                     also write the numbers
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const S = {
  MAP: env('MAP', 'palewastes'), DIFF: env('DIFF', 'professional'), HYPER: env('HYPER', '1') === '1',
  T0: +env('T0', 1200), WARM: +env('WARM', 10), LIMIT: +env('LIMIT', 60), SEEDS: +env('SEEDS', 2),
  LEVEL: +env('LEVEL', 150), ONLY: env('ONLY', null), SHARD: env('SHARD', '1/1').split('/').map(Number),
  CONFIG: JSON.parse(env('CONFIG', '{}')), WEAPONS: JSON.parse(env('WEAPONS', '{}')),
  BLESSINGS: JSON.parse(env('BLESSINGS', '{}')), CHARS: JSON.parse(env('CHARS', '{}')),
};
const PASSIVES = ['might', 'haste', 'precision', 'ferocity', 'area', 'quantity', 'velocity', 'perennial',
  'vitality', 'armor', 'recovery'];
const CALLINGS = [['mage', 'arcane_surge'], ['priest', 'radiant_barrier'], ['rogue', 'opportunist'],
  ['hunter', 'quarry'], ['warrior', 'seething_blood'], ['warlock', 'reapers_tithe'], ['shaman', 'waystones'],
  ['paladin', 'conviction'], ['graveblade', 'blood_rite'], ['ruinseeker', 'ruinous_pact'],
  ['druid', 'wildshape'], ['monk', 'stillwater']];
const BASE = 'seeking_motes';

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  // The catalogue comes from the game itself.
  const page0 = await b.newPage();
  await page0.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page0.waitForFunction(() => window.WS && WS.Weapons && WS.Unions && WS.Combos);
  const cat = await page0.evaluate(() => ({
    weapons: WS.WeaponOrder.filter((id) => !WS.Weapons[id].isUnion),
    unions: WS.Unions.map((u) => ({ id: u.result, from: u.from })),
    combos: WS.ComboOrder.map((id) => ({ id, name: WS.Combos[id].name, needs: WS.Combos[id].weapons || WS.Combos[id].needs || null }))
      .filter((c) => Array.isArray(c.needs) && c.needs.length === 2),
  }));
  await page0.close();

  const jobs = [];
  if (!S.ONLY || S.ONLY === 'weapon') for (const id of cat.weapons) jobs.push({ kind: 'weapon', name: id, hero: 'mage', weapons: [id] });
  if (!S.ONLY || S.ONLY === 'union') for (const u of cat.unions) jobs.push({ kind: 'union', name: u.id, hero: 'mage', unions: [u] });
  if (!S.ONLY || S.ONLY === 'pair') for (const c of cat.combos) jobs.push({ kind: 'pair', name: c.id, label: c.name, hero: 'mage', weapons: c.needs });
  if (!S.ONLY || S.ONLY === 'calling') for (const [hero, bl] of CALLINGS) jobs.push({ kind: 'calling', name: bl, hero, blessing: bl, weapons: [BASE] });
  const mine = jobs.filter((j, i) => i % S.SHARD[1] === S.SHARD[0] - 1);

  const rows = [];
  for (const job of mine) {
    for (let seed = 1; seed <= S.SEEDS; seed++) {
      const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
      await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
      const r = await page.evaluate(({ S, job, seed, PASSIVES, BASE }) => {
        if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
        WS.UI.closeOverlay();
        WS.Save.db.seenManual = true; WS.Save.unlockAll();
        WS.Save.save = () => {}; WS.Save.flush = () => {};
        WS.Save.settings.difficulty = S.DIFF;
        WS.Save.db.unlocks.hyper[S.MAP] = true; WS.Save.db.hyperArmed = S.HYPER;
        Object.assign(WS.Config, S.CONFIG);
        for (const [id, o] of Object.entries(S.WEAPONS)) Object.assign(WS.Weapons[id], o);
        for (const [id, o] of Object.entries(S.BLESSINGS)) Object.assign(WS.Blessings[id], o);
        for (const [id, o] of Object.entries(S.CHARS)) Object.assign(WS.Characters[id], o);
        WS.setSeed(2000 + seed);
        const G = WS.Game;
        G.startRun(S.MAP, job.hero);
        // A blessing is always taken at the start; the calling rows take the
        // survivor's own, the rest one that deals no damage of its own.
        G.chooseBlessing({ type: 'blessing', id: job.blessing || 'kings' });
        const p = G.player;
        G.run.secondBlessing = true;
        G.openLevelUp = () => {}; G.presentLevelUp = () => {};
        G.state = 'playing'; WS.UI.closeOverlay();
        p.weapons.length = 0; p.weaponLevels = {};
        for (const id of job.weapons || []) {
          const w = WS.Player.addWeapon(p, id);
          if (!w) continue;
          w.level = WS.WEAPON_MAX_LEVEL; p.weaponLevels[id] = w.level;
          if (WS.Weapons[id].evolveName) w.evolved = true;
        }
        for (const u of job.unions || []) {
          for (const id of u.from) {
            const w = WS.Player.addWeapon(p, id);
            w.level = WS.WEAPON_MAX_LEVEL; p.weaponLevels[id] = w.level; w.evolved = true;
          }
          WS.ComboSystem.check(p);
          for (const id of u.from) WS.Player.removeWeapon(p, id);
          const w = WS.Player.addWeapon(p, u.id);
          w.level = WS.WEAPON_MAX_LEVEL; p.weaponLevels[u.id] = w.level;
          WS.ComboSystem.inherit(p, w, u.from);
          p.unionsForged[u.id] = true;
        }
        WS.ComboSystem.check(p);
        for (const id of PASSIVES) {
          const up = WS.Upgrades[id];
          if (!up || !up.max) continue;
          for (let k = (p.upgradeLevels[id] || 0); k < up.max; k++) { up.apply(p, up); p.upgradeLevels[id] = k + 1; }
        }
        p.level = S.LEVEL;
        G.run.time = S.T0;
        p.x = WS.CONST.WORLD_WIDTH / 2; p.y = WS.CONST.WORLD_HEIGHT / 2;
        WS.Input.poll = () => {};
        for (const k of Object.keys(WS.Input.keys)) WS.Input.keys[k] = false;
        const step = () => {
          G.pendingLevelUps = 0; G.leveling = false;
          if (G.state !== 'playing') { WS.UI.closeOverlay(); G.state = 'playing'; }
          p.health = p.maxHealth;
          G.update(1 / 60);
        };
        for (let i = 0; i < S.WARM * 60; i++) step();
        const before = Object.assign({}, G.run.damageByWeapon), k0 = G.run.kills;
        for (let i = 0; i < S.LIMIT * 60; i++) step();
        const delta = {};
        for (const [k, v] of Object.entries(G.run.damageByWeapon)) {
          const d = v - (before[k] || 0);
          if (d > 0) delta[k] = d;
        }
        // Everything the ability put out: the pickups' bombs are not it, and
        // in a calling row neither is the plain weapon standing beside it.
        const skip = new Set(['bomb']);
        if (job.kind === 'calling') { skip.add(BASE); }
        let own = 0;
        for (const [k, v] of Object.entries(delta)) if (!skip.has(k)) own += v;
        return {
          dps: Math.round(own / S.LIMIT), kills: G.run.kills - k0,
          parts: Object.entries(delta).filter(([k]) => !skip.has(k)).sort((a, c) => c[1] - a[1]).slice(0, 4)
            .map(([k, v]) => [k, Math.round(v / S.LIMIT)]),
          combos: Object.keys(p.combosActive || {}).filter((k) => p.combosActive[k]),
        };
      }, { S, job, seed, PASSIVES, BASE });
      rows.push({ kind: job.kind, name: job.name, label: job.label, seed, weapons: job.weapons, ...r, errs: errs.slice(0, 1) });
      await page.close();
    }
    const mineRows = rows.filter((x) => x.name === job.name && x.kind === job.kind);
    const mean = Math.round(mineRows.reduce((a, x) => a + x.dps, 0) / mineRows.length);
    console.log(`${job.kind.padEnd(8)} ${(job.label || job.name).padEnd(22)} ${String(mean).padStart(8)} dps  `
      + mineRows.map((x) => x.kills).join('/') + ' kills'
      + (mineRows[0].combos.length ? '  [' + mineRows[0].combos.join(', ') + ']' : '')
      + (mineRows[0].errs.length ? '  ERR ' + mineRows[0].errs[0] : ''));
  }
  if (env('OUT', null)) fs.writeFileSync(env('OUT'), JSON.stringify({ S, rows }, null, 1));
  await b.close();
})();
