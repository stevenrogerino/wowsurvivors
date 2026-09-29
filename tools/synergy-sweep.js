#!/usr/bin/env node
/* THE SYNERGY SWEEP: every weapon and every union, against every passive and
 * every discovery it can carry.
 *
 * Not a guard: the instrument for finding what the other tests miss. They
 * each hold something fixed. tune-unions measures a union with no passives
 * at all; slot-test gives everything the same full set of passives and so
 * cannot say WHICH passive made a thing strong; the discovery tests measure
 * a pair alone. A tester's Ruin Unbound topped the meter in a build full of
 * Duplicity, Velocity and Expanse, carrying Frostfire and Shadowflame, and
 * no single test ever stood it in that spot. Here every item is measured:
 *
 *   none      at rank 8 (evolved; a union as forged), no passives
 *   <passive> that one passive at its cap, and nothing else - so its gain
 *             can be compared across every item it touches
 *   full      every damage passive at its cap
 *   full+disc the same, carrying every discovery the item can be part of
 *             (a union carries its sources'), as a player who found them does
 *
 * on 320 dummies that cannot die (crowd) and on one boss dummy that closes
 * and is kited off (boss) - the same fields as tools/slot-test.js, which
 * never saturate the way the real horde does (a horde test reads the
 * strongest things alike, once they kill everything that arrives).
 *
 * READ A CROWD FLAG AGAINST THE REAL HORDE BEFORE ACTING ON IT. Dummies
 * that never die stand in fixed rings, and that flatters some shapes and
 * starves others: an orbit that grows into the thick ring (Axe Gyre, x4.95
 * from Expanse here) and chains that never get to jump on past a kill
 * (Arcweb, Judgement Disc, 0.15x the median) all read as outliers, and in
 * tools/meter-test.js - every passive at its cap, in the real waves - all
 * three sit between 18% and 23% of a five-weapon build. A boss flag, and a
 * gain from one passive far past its peers', are the sweep's real finds.
 *
 * Reported per item: damage per second in each condition, and each
 * passive's gain as a multiple. Then the OUTLIERS: an item whose gain from
 * one passive is far past what that passive gives the median item, and an
 * item whose full build is far past the median of its kind (weapon, union).
 *
 *   node tools/synergy-sweep.js                       everything (long: shard it)
 *   SHARD=1/4 OUT=/tmp/s1.json node tools/synergy-sweep.js
 *   REPORT=/tmp/s1.json,/tmp/s2.json,... node tools/synergy-sweep.js    merge and report
 *   NAMES=union_ruin,union_steel MODES=crowd node tools/synergy-sweep.js
 *   WEAPONS='{"union_ruin":{"damage":30}}' ...        try a change
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const S = {
  MAP: env('MAP', 'palewastes'), DIFF: env('DIFF', 'professional'), HYPER: env('HYPER', '1') === '1',
  MODES: env('MODES', 'crowd,boss').split(','), T0: +env('T0', 1200), WARM: +env('WARM', 4), LIMIT: +env('LIMIT', 16),
  LEVEL: +env('LEVEL', 120), SHARD: env('SHARD', '1/1').split('/').map(Number),
  WEAPONS: JSON.parse(env('WEAPONS', '{}')), CONFIG: JSON.parse(env('CONFIG', '{}')), COMBOS: JSON.parse(env('COMBOS', '{}')),
  // A passive's gain this many times the median item's gain from it is an outlier.
  FLAG: +env('FLAG', 1.35),
};
// The passives that change what a weapon does. Health, armour and the rest
// change nothing a dummy can measure.
const PASSIVES = ['might', 'haste', 'precision', 'ferocity', 'area', 'quantity', 'velocity', 'perennial', 'serration'];
const CONDS = ['none', ...PASSIVES, 'full', 'full+disc'];

function report(rows) {
  const items = [...new Set(rows.map((r) => r.item))];
  const get = (item, mode, cond) => rows.find((r) => r.item === item && r.mode === mode && r.cond === cond);
  const out = [];
  for (const mode of S.MODES) {
    const kinds = {};
    for (const it of items) { const r = get(it, mode, 'none'); if (r) (kinds[r.kind] = kinds[r.kind] || []).push(it); }
    console.log(`\n== ${mode}: damage per second, and each passive's gain as a multiple of none`);
    console.log('  ' + 'item'.padEnd(18) + 'none'.padStart(8) + PASSIVES.map((p) => p.slice(0, 6).padStart(8)).join('')
      + 'full'.padStart(9) + '+disc'.padStart(9));
    const gain = {};
    for (const [kind, list] of Object.entries(kinds)) {
      console.log('  -- ' + kind + 's');
      for (const it of list) {
        const base = get(it, mode, 'none').dps || 1;
        const g = {};
        for (const p of PASSIVES) { const r = get(it, mode, p); g[p] = r ? r.dps / base : NaN; }
        gain[it] = g;
        const f = get(it, mode, 'full'), fd = get(it, mode, 'full+disc');
        console.log('  ' + get(it, mode, 'none').label.slice(0, 17).padEnd(18) + String(Math.round(base)).padStart(8)
          + PASSIVES.map((p) => ('x' + g[p].toFixed(2)).padStart(8)).join('')
          + String(f ? f.dps : '-').padStart(9) + String(fd ? fd.dps : '-').padStart(9));
      }
    }
    const med = (xs) => { const s = xs.filter((x) => isFinite(x)).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
    // Outliers by passive: gain over the median gain of every item (a passive
    // that does nothing for an item - area on a bolt - is not a signal).
    for (const p of PASSIVES) {
      const m = med(items.map((it) => gain[it] && gain[it][p]));
      for (const it of items) {
        const gg = gain[it] && gain[it][p];
        if (gg > 1.05 && (gg - 1) > (m - 1) * S.FLAG + 0.1) out.push({ mode, item: it, why: `${p} x${gg.toFixed(2)} where the median item gets x${m.toFixed(2)}` });
      }
    }
    // Outliers by full build, within a kind.
    for (const [kind, list] of Object.entries(kinds)) {
      for (const cond of ['full', 'full+disc']) {
        const m = med(list.map((it) => (get(it, mode, cond) || {}).dps));
        for (const it of list) {
          const d = (get(it, mode, cond) || {}).dps;
          if (d > m * 1.6) out.push({ mode, item: it, why: `${cond} ${d} dps, ${(d / m).toFixed(2)}x the median ${kind} (${m})` });
          if (d < m * 0.5) out.push({ mode, item: it, why: `${cond} ${d} dps, only ${(d / m).toFixed(2)}x the median ${kind} (${m})` });
        }
      }
    }
  }
  console.log('\n== outliers');
  if (!out.length) console.log('  none');
  for (const o of out) console.log(`  ${o.mode.padEnd(6)} ${o.item.padEnd(20)} ${o.why}`);
}

(async () => {
  if (env('REPORT', null)) {
    const rows = [].concat(...env('REPORT').split(',').map((f) => JSON.parse(fs.readFileSync(f, 'utf8')).rows));
    report(rows);
    return;
  }
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page0 = await b.newPage();
  await page0.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page0.waitForFunction(() => window.WS && WS.Weapons && WS.Unions && WS.Combos);
  const cat = await page0.evaluate(() => ({
    weapons: WS.WeaponOrder.filter((id) => !WS.Weapons[id].isUnion),
    unions: WS.Unions.map((u) => ({ id: u.result, from: u.from })),
  }));
  await page0.close();
  let jobs = [
    ...cat.weapons.map((id) => ({ kind: 'weapon', item: id, weapons: [id] })),
    ...cat.unions.map((u) => ({ kind: 'union', item: u.id, union: u })),
  ];
  const names = env('NAMES', null) && env('NAMES').split(',');
  if (names) jobs = jobs.filter((j) => names.includes(j.item));
  jobs = jobs.filter((j, i) => i % S.SHARD[1] === S.SHARD[0] - 1);

  const rows = [];
  for (const job of jobs) for (const mode of S.MODES) {
    const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
    const r = await page.evaluate(({ S, job, mode, PASSIVES, CONDS }) => {
      if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
      WS.UI.closeOverlay();
      WS.Save.db.seenManual = true; WS.Save.unlockAll();
      WS.Save.save = () => {}; WS.Save.flush = () => {};
      WS.Save.settings.difficulty = S.DIFF;
      WS.Save.db.unlocks.hyper[S.MAP] = true; WS.Save.db.hyperArmed = S.HYPER;
      Object.assign(WS.Config, S.CONFIG);
      for (const [id, o] of Object.entries(S.WEAPONS)) Object.assign(WS.Weapons[id], o);
      for (const [id, o] of Object.entries(S.COMBOS)) Object.assign(WS.Combos[id], o);
      for (const sys of [WS.WaveManager, WS.Airdrop, WS.Encounters, WS.Trials, WS.Moor]) sys.update = () => {};
      const G = WS.Game;
      const one = (cond) => {
        WS.setSeed(4000);
        G.startRun(S.MAP, 'mage');
        G.chooseBlessing({ type: 'blessing', id: 'kings' });
        const p = G.player;
        G.run.secondBlessing = true;
        G.openLevelUp = () => {}; G.presentLevelUp = () => {};
        G.state = 'playing'; WS.UI.closeOverlay();
        p.weapons.length = 0; p.weaponLevels = {};
        p.combosActive = {};
        let w;
        if (job.union) {
          w = WS.Player.addWeapon(p, job.item);
          w.level = WS.WEAPON_MAX_LEVEL; p.weaponLevels[job.item] = w.level;
          p.unionsForged[job.item] = true;
          w.standsFor = job.union.from.slice();
        } else {
          w = WS.Player.addWeapon(p, job.item);
          w.level = WS.WEAPON_MAX_LEVEL; p.weaponLevels[job.item] = w.level;
          if (WS.Weapons[job.item].evolveName) w.evolved = true;
        }
        const carries = [];
        if (cond === 'full+disc') {
          // Every discovery it can be part of: the item's side of it, as the
          // union's inherit and a found discovery write it. The partner is
          // not carried - only this item's damage is measured.
          const mine = job.union ? job.union.from : [job.item];
          for (const id of WS.ComboOrder) {
            const c = WS.Combos[id];
            if (!Array.isArray(c.weapons)) continue;
            const [a, bb] = c.weapons;
            if (!mine.includes(a) && !mine.includes(bb)) continue;
            c.apply(mine.includes(a) ? w : { mods: {} }, mine.includes(bb) ? w : { mods: {} }, c);
            carries.push(id);
          }
        }
        const ups = cond === 'none' ? [] : cond.startsWith('full') ? PASSIVES : [cond];
        for (const id of ups) {
          const up = WS.Upgrades[id];
          for (let k = 0; k < up.max; k++) { up.apply(p, up); p.upgradeLevels[id] = k + 1; }
        }
        p.level = S.LEVEL;
        G.run.time = S.T0;
        p.x = WS.CONST.WORLD_WIDTH / 2; p.y = WS.CONST.WORLD_HEIGHT / 2;
        WS.Input.poll = () => {};
        for (const k of Object.keys(WS.Input.keys)) WS.Input.keys[k] = false;
        WS.Enemy.clear();
        WS.Projectile.bolts.releaseAll();
        const dummies = [];
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
            const rr = 160 - 100 * WS.cos(t / 12 * WS.TAU), a = t * 0.3;
            d.x = cx + WS.cos(a) * rr; d.y = cy + WS.sin(a) * rr;
          };
        } else {
          // Where a real 20:00 horde stands around a survivor (slot-test.js).
          const RINGS = [82, 14, 131, 25, 26, 18, 14, 10];
          let n = 0;
          RINGS.forEach((count, k) => {
            for (let i = 0; i < count; i++, n++) {
              const rr = k * 100 + (k ? 0 : 30) + ((i * 0.618034) % 1) * (k ? 100 : 70);
              const a = n * 2.399963;
              const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
              place(WS.clamp(p.x + WS.cos(a) * rr, -120, W + 120), WS.clamp(p.y + WS.sin(a) * rr, -120, H + 120), false);
            }
          });
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
        const before = G.run.damageByWeapon[job.item] || 0;
        for (let i = 0; i < S.LIMIT * 60; i++) step();
        return { dps: Math.round(((G.run.damageByWeapon[job.item] || 0) - before) / S.LIMIT), carries };
      };
      const out = [];
      for (const cond of CONDS) out.push({ cond, ...one(cond) });
      // The same run twice must read the same, or the sweep measures noise.
      out.push({ cond: 'none#2', ...one('none') });
      return { out, label: WS.Weapons[job.item].name };
    }, { S, job, mode, PASSIVES, CONDS });
    await page.close();
    for (const o of r.out) rows.push({ kind: job.kind, item: job.item, label: r.label, mode, ...o, errs: errs.slice(0, 1) });
    const n0 = r.out.find((o) => o.cond === 'none'), n2 = r.out.find((o) => o.cond === 'none#2');
    process.stderr.write(`${job.item} ${mode}: none ${n0.dps} (again ${n2.dps}), full ${r.out.find((o) => o.cond === 'full').dps}`
      + `, +disc ${r.out.find((o) => o.cond === 'full+disc').dps}${errs.length ? '  ERR ' + errs[0] : ''}\n`);
  }
  await b.close();
  if (env('OUT', null)) fs.writeFileSync(env('OUT'), JSON.stringify({ S, rows }, null, 1));
  report(rows);
})();
