#!/usr/bin/env node
/* What an ability is worth at each point of a night, and what feeds it.
 *
 * Not a guard: the instrument for balancing weapons and discoveries through
 * a whole run, where tools/slot-test.js looks only at the end of one. Every
 * figure is damage per second from the thing measured, against the crowd a
 * night actually puts in front of you at that minute and against one boss,
 * with a stage's worth of passives behind it.
 *
 * The stages are where a weapon of that rank is held in a typical run:
 *
 *   s1  1:00   rank 1              no passives        level 3
 *   s2  5:00   rank 3              a fifth of each    level 20
 *   s3  9:00   rank 5              half of each       level 45
 *   s4  14:00  rank 8              four fifths        level 80
 *   s5  20:00  rank 8, evolved     every one maxed    level 150
 *
 * "Each" is the passives that touch weapon damage: Might, Haste,
 * Precision, Ferocity, Area, Duplicity, Velocity and Perennial, rounded up
 * to whole ranks. The crowd at each stage is immortal dummies placed in the
 * rings a real horde was measured standing in around a survivor who kites
 * (Pale Wastes, Professional, Hyper, eight runs a stage): early on a
 * trailing spread, late a wide ring. The boss drifts from 60 to 260 out and
 * back every 12s while circling. The survivor takes no damage; nothing but the
 * measured weapons fires.
 *
 * Rank jobs also fight the real waves of that minute for 45s, kiting the
 * way tools/check-callings.js walks, and count kills and the damage that
 * actually came off a creature (a 50 bolt into a 12-health creature is
 * 12). Early on that is the fairer number: dummies never die, so a big
 * single hit on them looks better than it is against things that die to a
 * third of it. HORDE=0 skips it.
 *
 * Three kinds of job (KIND, all by default):
 *
 *   rank   every weapon at every stage
 *   aux    every weapon at s3 and s5 with one passive at 0 and then at its
 *          cap, the rest at the stage's share: what maxing it is worth to
 *          that weapon
 *   pair   every discovery's two weapons at s2 to s5, with the discovery
 *          and without it
 *
 *   node tools/rank-test.js                       everything
 *   KIND=rank NAMES=arcweb,volley node tools/rank-test.js
 *   KIND=aux STAGES=s5 SHARD=1/3 OUT=/tmp/aux1.json node tools/rank-test.js
 *   WEAPONS='{"arcweb":{"damage":30}}' KIND=rank ... a candidate change
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const S = {
  KIND: env('KIND', 'rank,aux,pair').split(','), STAGES: env('STAGES', null),
  NAMES: env('NAMES', null), SHARD: env('SHARD', '1/1').split('/').map(Number),
  WARM: +env('WARM', 8), LIMIT: +env('LIMIT', 30), SEEDS: +env('SEEDS', 1), HORDE: env('HORDE', '1') === '1',
  WEAPONS: JSON.parse(env('WEAPONS', '{}')), COMBOS: JSON.parse(env('COMBOS', '{}')), CONFIG: JSON.parse(env('CONFIG', '{}')),
};
// name, minute, rank, evolved, passive share, level, creatures per 100px ring (measured, kiting)
const STAGES = {
  s1: { t: 60, rank: 1, evo: false, frac: 0, level: 3, rings: [64, 48, 45, 33, 10, 8, 5, 5] },
  s2: { t: 300, rank: 3, evo: false, frac: 0.2, level: 20, rings: [87, 66, 68, 57, 23, 8, 3, 4] },
  s3: { t: 540, rank: 5, evo: false, frac: 0.5, level: 45, rings: [52, 58, 68, 70, 34, 17, 8, 9] },
  s4: { t: 840, rank: 8, evo: false, frac: 0.8, level: 80, rings: [64, 42, 35, 44, 24, 21, 19, 22] },
  s5: { t: 1200, rank: 8, evo: true, frac: 1, level: 150, rings: [21, 15, 51, 52, 49, 43, 39, 29] },
};
const DMG = ['might', 'haste', 'precision', 'ferocity', 'area', 'quantity', 'velocity', 'perennial', 'serration'];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page0 = await b.newPage();
  await page0.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page0.waitForFunction(() => window.WS && WS.Weapons && WS.Combos);
  const cat = await page0.evaluate(() => ({
    weapons: WS.WeaponOrder.filter((id) => !WS.Weapons[id].isUnion),
    combos: WS.ComboOrder.map((id) => ({ id, name: WS.Combos[id].name, weapons: WS.Combos[id].weapons })),
  }));
  await page0.close();

  const want = (st) => !S.STAGES || S.STAGES.split(',').includes(st);
  const named = (n) => !S.NAMES || S.NAMES.split(',').includes(n);
  const jobs = [];
  if (S.KIND.includes('rank')) {
    for (const w of cat.weapons) for (const st of Object.keys(STAGES)) {
      if (want(st) && named(w)) jobs.push({ kind: 'rank', name: w, stage: st, weapons: [w] });
    }
  }
  if (S.KIND.includes('aux')) {
    for (const w of cat.weapons) for (const st of ['s3', 's5']) for (const pas of DMG) for (const at of ['min', 'max']) {
      if (want(st) && named(w)) jobs.push({ kind: 'aux', name: w, stage: st, weapons: [w], passive: pas, at });
    }
  }
  if (S.KIND.includes('pair')) {
    for (const c of cat.combos) for (const st of ['s2', 's3', 's4', 's5']) for (const on of [true, false]) {
      if (want(st) && named(c.id)) jobs.push({ kind: 'pair', name: c.id, label: c.name, stage: st, weapons: c.weapons, combo: c.id, on });
    }
  }
  const mine = jobs.filter((j, i) => i % S.SHARD[1] === S.SHARD[0] - 1);
  console.error(`${mine.length} of ${jobs.length} jobs`);

  const rows = [];
  for (const job of mine) {
    for (let seed = 1; seed <= S.SEEDS; seed++) {
      const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
      await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
      const r = await page.evaluate(({ S, job, seed, stage, DMG }) => {
        if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
        WS.UI.closeOverlay();
        WS.Save.db.seenManual = true; WS.Save.unlockAll();
        WS.Save.save = () => {}; WS.Save.flush = () => {};
        WS.Save.settings.difficulty = 'professional';
        Object.assign(WS.Config, S.CONFIG);
        for (const [id, o] of Object.entries(S.WEAPONS)) Object.assign(WS.Weapons[id], o);
        for (const [id, o] of Object.entries(S.COMBOS)) Object.assign(WS.Combos[id], o);
        WS.setSeed(4000 + seed);
        const G = WS.Game;
        // Refused outright, not just refilled: late on the hardest night one
        // blow can outweigh a stage-sized health bar inside a single frame,
        // and a survivor who dies there stops the clock for every phase after.
        WS.Player.takeDamage = () => false;
        G.startRun('palewastes', 'mage');
        G.chooseBlessing({ type: 'blessing', id: 'kings' });
        const p = G.player;
        G.run.secondBlessing = true;
        G.openLevelUp = () => {}; G.presentLevelUp = () => {};
        G.state = 'playing'; WS.UI.closeOverlay();
        p.weapons.length = 0; p.weaponLevels = {};
        // A discovery measured "off" is marked found before its weapons meet,
        // so the check passes it by and nothing is applied.
        if (job.kind === 'pair' && !job.on) p.combosActive[job.combo] = true;
        for (const id of job.weapons) {
          const w = WS.Player.addWeapon(p, id);
          if (!w) continue;
          w.level = stage.rank; p.weaponLevels[id] = w.level;
          if (stage.evo && WS.Weapons[id].evolveName) w.evolved = true;
        }
        WS.ComboSystem.check(p);
        for (const id of DMG) {
          const up = WS.Upgrades[id];
          let n = Math.ceil(up.max * stage.frac);
          if (job.kind === 'aux' && id === job.passive) n = job.at === 'max' ? up.max : 0;
          for (let k = 0; k < n; k++) up.apply(p, up);
          p.upgradeLevels[id] = n;
        }
        p.level = stage.level;
        G.run.time = stage.t;
        const cx = WS.CONST.WORLD_WIDTH / 2, cy = WS.CONST.WORLD_HEIGHT / 2;
        WS.Input.poll = () => {};
        for (const k of Object.keys(WS.Input.keys)) WS.Input.keys[k] = false;
        let horde = null;
        if (S.HORDE && job.kind === 'rank') {
          G.run.time = Math.max(0, stage.t - 15);
          p.x = cx; p.y = cy;
          const kite = () => {
            const t = G.run.time;
            let tx = cx + Math.cos(t * 0.5) * 240, ty = cy + Math.sin(t * 0.5) * 170;
            const near = WS.Enemy.findNearest(p.x, p.y, 160);
            if (near) { const dx = p.x - near.x, dy = p.y - near.y, d = Math.hypot(dx, dy) || 1; tx = p.x + dx / d * 250; ty = p.y + dy / d * 250; }
            const k = WS.Input.keys, h = WS.Input.held || {};
            k.left = h.left = tx - p.x < -6; k.right = h.right = tx - p.x > 6; k.up = h.up = ty - p.y < -6; k.down = h.down = ty - p.y > 6;
          };
          let landed = 0, counting = false;
          const dmg = WS.Enemy.damage;
          WS.Enemy.damage = function (e, amount, crit, source) {
            if (counting && e && !e._dead && !(e.invuln > 0) && source !== 'bomb') landed += Math.min(amount, Math.max(0, e.health));
            return dmg.apply(this, arguments);
          };
          const tick = () => {
            G.pendingLevelUps = 0; G.leveling = false;
            if (G.state !== 'playing') { WS.UI.closeOverlay(); G.state = 'playing'; }
            p.health = p.maxHealth; kite(); G.update(1 / 60);
          };
          for (let i = 0; i < 15 * 60; i++) tick();
          const k0 = G.run.kills; counting = true;
          for (let i = 0; i < 45 * 60; i++) tick();
          counting = false; WS.Enemy.damage = dmg;
          horde = { kills: Math.round((G.run.kills - k0) * 60 / 45), landed: Math.round(landed / 45) };
          for (const k of Object.keys(WS.Input.keys)) WS.Input.keys[k] = false;
          if (WS.Input.held) for (const k of Object.keys(WS.Input.held)) WS.Input.held[k] = false;
        }
        for (const sys of [WS.WaveManager, WS.Airdrop, WS.Encounters, WS.Trials, WS.Moor]) sys.update = () => {};

        const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
        let dummies = [];
        const place = (x, y, boss) => {
          const e = WS.Enemy.spawn('wolf', x, y, 1, true);
          e.maxHealth = e.health = 1e12; e.damage = 0; e.speed = 0; e.stationary = true; e.attackTimer = 99;
          if (boss) { e.boss = true; e.radius = 40; e.spriteSize = 40 * 3.4; }
          const d = { e, x, y }; dummies.push(d); return d;
        };
        const crowd = () => {
          let n = 0;
          stage.rings.forEach((count, k) => {
            for (let i = 0; i < count; i++, n++) {
              const r = k * 100 + (k ? 0 : 30) + ((i * 0.618034) % 1) * (k ? 100 : 70);
              const a = n * 2.399963;
              place(WS.clamp(cx + Math.cos(a) * r, -120, W + 120), WS.clamp(cy + Math.sin(a) * r, -120, H + 120), false);
            }
          });
        };
        const boss = () => {
          const d = place(cx + 160, cy, true);
          let t = 0;
          d.move = () => { t += 1 / 60; const r = 160 - 100 * Math.cos(t / 12 * Math.PI * 2), a = t * 0.3; d.x = cx + Math.cos(a) * r; d.y = cy + Math.sin(a) * r; };
        };
        const step = () => {
          G.pendingLevelUps = 0; G.leveling = false;
          if (G.state !== 'playing') { WS.UI.closeOverlay(); G.state = 'playing'; }
          p.health = p.maxHealth; p.x = cx; p.y = cy;
          G.update(1 / 60);
          for (const d of dummies) { if (d.move) d.move(); d.e.health = d.e.maxHealth; d.e.x = d.x; d.e.y = d.y; d.e.attackTimer = 99; }
        };
        const measure = (build) => {
          WS.Enemy.clear(); dummies = []; build();
          for (let i = 0; i < S.WARM * 60; i++) step();
          const before = Object.assign({}, G.run.damageByWeapon);
          for (let i = 0; i < S.LIMIT * 60; i++) step();
          const by = {};
          let total = 0;
          for (const [k, v] of Object.entries(G.run.damageByWeapon)) {
            const d = v - (before[k] || 0);
            if (d > 0 && k !== 'bomb') { by[k] = Math.round(d / S.LIMIT); total += d; }
          }
          return { dps: Math.round(total / S.LIMIT), by };
        };
        const c = measure(crowd), bo = measure(boss);
        return {
          crowd: c.dps, boss: bo.dps, kpm: horde ? horde.kills : null, landed: horde ? horde.landed : null, crowdBy: c.by, bossBy: bo.by,
          combos: Object.keys(p.combosActive || {}).filter((k) => p.combosActive[k]),
          damageMult: p.damageMultiplier, area: p.areaMultiplier, crit: p.critChance,
        };
      }, { S, job, seed, stage: STAGES[job.stage], DMG });
      rows.push({ ...job, seed, ...r, errs: errs.slice(0, 1) });
      await page.close();
    }
    const rs = rows.filter((x) => x.kind === job.kind && x.name === job.name && x.stage === job.stage
      && x.passive === job.passive && x.at === job.at && x.on === job.on);
    const m = (f) => Math.round(rs.reduce((a, x) => a + x[f], 0) / rs.length);
    const tag = job.kind === 'aux' ? `${job.passive}=${job.at}` : job.kind === 'pair' ? (job.on ? 'on' : 'off') : '';
    console.log(`${job.kind.padEnd(5)} ${job.stage} ${(job.label || job.name).padEnd(20)} ${tag.padEnd(16)} crowd ${String(m('crowd')).padStart(8)}  boss ${String(m('boss')).padStart(7)}`
      + (rs[0].kpm != null ? `  horde ${String(m('kpm')).padStart(5)} kills/min ${String(m('landed')).padStart(7)} landed/s` : '')
      + (rs[0].errs.length ? '  ERR ' + rs[0].errs[0] : ''));
  }
  if (env('OUT', null)) fs.writeFileSync(env('OUT'), JSON.stringify({ S, STAGES, rows }, null, 1));
  await b.close();
})();
