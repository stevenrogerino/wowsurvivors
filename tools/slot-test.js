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
 * Three ways of measuring it (MODES, all by default):
 *
 *   horde   the night's real waves. What a build meets - but it is capped
 *           by supply: once a slot kills everything that reaches it, more
 *           damage shows as nothing, so the strongest all read alike.
 *   crowd   no waves. 320 dummies that cannot die or move - the pool's
 *           cap, which a 20:00 horde sits at whatever the build - placed in
 *           the rings where a real horde was measured standing (a pile at
 *           the feet, a gap, a thick ring at 200-300, a tail off-screen).
 *           Raw area output.
 *   boss    no waves. One boss-sized dummy (a boss for every rule that asks)
 *           that drifts from 60 to 260 out and back every 12s while circling,
 *           as a boss closes and is kited off. A fixed spot would favour
 *           whatever reaches exactly that far: the evolved gyre's blades
 *           circle at 217, and a boss held at 120 sat in the hole. Raw
 *           single-target output.
 *
 * The dummies never die, so what feeds on kills (a death burst, a calling
 * that charges on kills) shows only in the horde column.
 *
 *   node tools/slot-test.js                     everything, 2 seeds
 *   ONLY=union SEEDS=3 node tools/slot-test.js  one kind
 *   WEAPONS='{"union_ruin":{"damage":20}}' ONLY=union node tools/slot-test.js
 *   NAMES=cinderfall,volley MODES=crowd,boss   just those
 *   EVOLVED=0 ...                               the weapons at rank 8, not evolved
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
  MODES: env('MODES', 'horde,crowd,boss').split(','),
  T0: +env('T0', 1200), WARM: +env('WARM', 10), LIMIT: +env('LIMIT', 60), SEEDS: +env('SEEDS', 2),
  LEVEL: +env('LEVEL', 150), EVOLVED: env('EVOLVED', '1') === '1', ONLY: env('ONLY', null), SHARD: env('SHARD', '1/1').split('/').map(Number),
  CONFIG: JSON.parse(env('CONFIG', '{}')), WEAPONS: JSON.parse(env('WEAPONS', '{}')),
  BLESSINGS: JSON.parse(env('BLESSINGS', '{}')), CHARS: JSON.parse(env('CHARS', '{}')),
  COMBOS: JSON.parse(env('COMBOS', '{}')),
};
const PASSIVES = ['might', 'haste', 'precision', 'ferocity', 'area', 'quantity', 'velocity', 'perennial',
  'vitality', 'armor', 'recovery'];
const CALLINGS = [['mage', 'arcane_surge'], ['priest', 'radiant_barrier'], ['rogue', 'opportunist'],
  ['hunter', 'quarry'], ['warrior', 'seething_blood'], ['warlock', 'reapers_tithe'], ['shaman', 'waystones'],
  ['paladin', 'conviction'], ['graveblade', 'blood_rite'], ['ruinseeker', 'ruinous_pact'],
  ['druid', 'wildshape'], ['monk', 'stillwater']];
const BASE = env('BASE', 'seeking_motes');   // the plain weapon beside a calling

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
  const names = env('NAMES', null) && env('NAMES').split(',');
  const mine = jobs.filter((j) => !names || names.includes(j.name)).filter((j, i) => i % S.SHARD[1] === S.SHARD[0] - 1);

  const rows = [];
  for (const job of mine) {
    for (const mode of S.MODES) for (let seed = 1; seed <= S.SEEDS; seed++) {
      const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
      await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
      const r = await page.evaluate(({ S, job, seed, mode, PASSIVES, BASE }) => {
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
        for (const [id, o] of Object.entries(S.COMBOS)) Object.assign(WS.Combos[id], o);
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
          if (WS.Weapons[id].evolveName && S.EVOLVED) w.evolved = true;
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
        // The dummies: the night is stopped and they are all there is.
        const dummies = [];
        if (mode !== 'horde') {
          for (const sys of [WS.WaveManager, WS.Airdrop, WS.Encounters, WS.Trials, WS.Moor]) sys.update = () => {};
          WS.Enemy.clear();
          const place = (x, y, boss) => {
            const e = WS.Enemy.spawn('wolf', x, y, 1, true);
            e.maxHealth = e.health = 1e12; e.damage = 0; e.speed = 0; e.stationary = true; e.attackTimer = 99;
            if (boss) { e.boss = true; e.radius = 40; e.spriteSize = 40 * 3.4; }
            dummies.push({ e, x, y });
          };
          if (mode === 'boss') {
            place(p.x + 160, p.y, true);
            const d = dummies[0], cx = p.x, cy = p.y;
            let t = 0;
            d.move = () => {
              t += 1 / 60;
              const r = 160 - 100 * WS.cos(t / 12 * WS.TAU), a = t * 0.3;
              d.x = cx + WS.cos(a) * r; d.y = cy + WS.sin(a) * r;
            };
          }
          else {
            /* As many as the night's pool holds (320), standing where a real
               20:00 horde was measured standing around a survivor who does
               not move - the average over four builds from weak to strong,
               per 100px ring: a pile at the survivor's feet, a gap, a thick
               ring at 200-300 (the casters holding their range), and a tail
               out past the edge of the screen. */
            const RINGS = [82, 14, 131, 25, 26, 18, 14, 10];
            let n = 0;
            RINGS.forEach((count, k) => {
              for (let i = 0; i < count; i++, n++) {
                const r = k * 100 + (k ? 0 : 30) + ((i * 0.618034) % 1) * (k ? 100 : 70);
                const a = n * 2.399963;   // the golden angle: even, and never in lines
                const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
                place(WS.clamp(p.x + WS.cos(a) * r, -120, W + 120), WS.clamp(p.y + WS.sin(a) * r, -120, H + 120), false);
              }
            });
          }
        }
        const step = () => {
          G.pendingLevelUps = 0; G.leveling = false;
          if (G.state !== 'playing') { WS.UI.closeOverlay(); G.state = 'playing'; }
          p.health = p.maxHealth;
          p.x = WS.CONST.WORLD_WIDTH / 2; p.y = WS.CONST.WORLD_HEIGHT / 2;
          G.update(1 / 60);
          for (const d of dummies) { if (d.move) d.move(); d.e.health = d.e.maxHealth; d.e.x = d.x; d.e.y = d.y; d.e.attackTimer = 99; }
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
        let own = 0, all = 0;
        for (const [k, v] of Object.entries(delta)) { if (!skip.has(k)) own += v; if (k !== 'bomb') all += v; }
        return {
          // total: the whole build's, for a calling that works through the
          // weapon beside it (a mark, a haste) rather than dealing its own.
          dps: Math.round(own / S.LIMIT), total: Math.round(all / S.LIMIT), kills: G.run.kills - k0,
          parts: Object.entries(delta).filter(([k]) => !skip.has(k)).sort((a, c) => c[1] - a[1]).slice(0, 4)
            .map(([k, v]) => [k, Math.round(v / S.LIMIT)]),
          combos: Object.keys(p.combosActive || {}).filter((k) => p.combosActive[k]),
        };
      }, { S, job, seed, mode, PASSIVES, BASE });
      rows.push({ kind: job.kind, name: job.name, label: job.label, seed, mode, weapons: job.weapons, ...r, errs: errs.slice(0, 1) });
      await page.close();
    }
    const mineRows = rows.filter((x) => x.name === job.name && x.kind === job.kind);
    const cols = S.MODES.map((m) => {
      const rs = mineRows.filter((x) => x.mode === m);
      const mean = Math.round(rs.reduce((a, x) => a + x.dps, 0) / rs.length);
      const tot = Math.round(rs.reduce((a, x) => a + x.total, 0) / rs.length);
      return `${m} ${String(mean).padStart(8)}` + (job.kind === 'calling' ? ` (build ${tot})` : '') + (m === 'horde' ? ` (${rs.map((x) => x.kills).join('/')} kills)` : '');
    });
    console.log(`${job.kind.padEnd(8)} ${(job.label || job.name).padEnd(22)} ` + cols.join('   ')
      + (mineRows[0].combos.length ? '  [' + mineRows[0].combos.join(', ') + ']' : '')
      + (mineRows[0].errs.length ? '  ERR ' + mineRows[0].errs[0] : ''));
  }
  if (env('OUT', null)) fs.writeFileSync(env('OUT'), JSON.stringify({ S, rows }, null, 1));
  await b.close();
})();
