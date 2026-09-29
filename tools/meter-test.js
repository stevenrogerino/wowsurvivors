#!/usr/bin/env node
/* THE METER TEST: every evolved weapon measured the way a damage meter sees
 * it - in company.
 *
 * tools/rank-test.js measures a weapon alone. Alone, a weapon that hits
 * around the survivor does fine; in a build, whatever reaches out first -
 * chains, ricochets, homing bolts - kills the crowd before it arrives and the
 * weapons that hit close starve. Across 475 bot nights, evolved Arcweb
 * (Skybreak) took a median 61% of the meter and every area weapon 2% to 8%,
 * and none of the solo tests saw it. A tester's Skybreak did 59%.
 *
 * Each job is a build of BUILD evolved weapons drawn at random (seeded) from
 * the twenty, every damage passive at its cap, level 150, dropped into the
 * real waves at 20:00 on the Pale Wastes, Professional, for WARM seconds and
 * then counted for LIMIT: the damage that actually came off a creature (a
 * 50 hit into a 12-health creature is 12), by source. The survivor takes no
 * damage and kites the way tools/rank-test.js does. A weapon's result is
 * its mean share of the meter over every build it was in, against the fair
 * share 1/BUILD, and the landed damage it did.
 *
 *   node tools/meter-test.js                          60 builds of 5, evolved at 20:00
 *   STAGE=s3 node tools/meter-test.js                 rank 5 at 9:00 (s4: rank 8 at 14:00)
 *   BUILDS=90 SHARD=1/3 OUT=/tmp/m1.json node tools/meter-test.js
 *   node tools/meter-test.js --report /tmp/m1.json /tmp/m2.json
 *   WEAPONS='{"arcweb":{"evolveChains":12}}' ...    a candidate change
 *   BAND=0.65,1.35 (default): exits 1 if any weapon's share leaves the band
 *   MOVE=pilot HERO=shaman FIXED=arcweb:3,knifestorm:7 STAGE=s2 BUILDS=6:
 *     one build, moved by the bot's pilot, with a survivor's own kit
 *   STAGE=lead BUILDS=120: the first evolution, one evolved beside four at
 *     rank 6 at 14:00; LEADBAND=0.7,1.4 against the mean lead
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);

/* The lead report: each weapon's share when it is the one evolved weapon in
   the build. There is no fixed fair share here (an evolved weapon beside four
   unevolved ones should lead), so the gate is against the mean of the leads:
   every weapon within LEADBAND (default 0.7 to 1.4) of it. */
function reportLead(rows) {
  const by = {};
  for (const r of rows) {
    const tot = r.weapons.reduce((a, id) => a + (r.landed[id] || 0), 0) || 1;
    const w = by[r.lead] = by[r.lead] || { n: 0, share: 0 };
    w.n++; w.share += (r.landed[r.lead] || 0) / tot;
  }
  const list = Object.entries(by).map(([id, w]) => ({ id, n: w.n, share: w.share / w.n })).sort((a, b) => b.share - a.share);
  const mean = list.reduce((a, w) => a + w.share, 0) / list.length;
  console.log(`\n${rows.length} builds, one weapon evolved; the mean lead takes ${Math.round(mean * 100)}%\n`);
  console.log('evolved weapon    builds   its share   x mean');
  for (const w of list) console.log(w.id.padEnd(16), String(w.n).padStart(7), (Math.round(w.share * 1000) / 10 + '%').padStart(11), ('x' + (w.share / mean).toFixed(2)).padStart(8));
  const [lo, hi] = (process.env.LEADBAND || '0.7,1.4').split(',').map(Number);
  const out = list.filter((w) => w.share / mean < lo || w.share / mean > hi);
  if (out.length) { console.log(`\nFAIL: outside x${lo} to x${hi} of the mean lead: ` + out.map((w) => `${w.id} x${(w.share / mean).toFixed(2)}`).join(', ')); process.exitCode = 1; }
  else console.log(`\nok: every evolved weapon within x${lo} to x${hi} of the mean lead`);
  return list;
}

function report(rows) {
  if (rows.length && rows[0].lead) return reportLead(rows);
  /* METRIC=raw reads what the in-game meter showed before it stopped
     counting overkill: every point dealt, landed or not. */
  if (process.env.METRIC === 'raw') rows = rows.filter((r) => r.raw).map((r) => Object.assign({}, r, { landed: r.raw }));
  const by = {};
  for (const r of rows) {
    // A share of what the build's weapons did: bombs and a survivor's own
    // kit take their part of the meter from every weapon alike.
    const tot = r.weapons.reduce((a, id) => a + (r.landed[id] || 0), 0) || 1;
    for (const id of r.weapons) {
      const w = by[id] = by[id] || { n: 0, share: 0, landed: 0, top: 0 };
      w.n++; w.share += (r.landed[id] || 0) / tot; w.landed += r.landed[id] || 0;
    }
    const top = r.weapons.slice().sort((a, b) => (r.landed[b] || 0) - (r.landed[a] || 0))[0];
    if (top) by[top].top++;
  }
  const size = rows.length ? rows[0].weapons.length : 5;
  const list = Object.entries(by).map(([id, w]) => ({ id, n: w.n, share: w.share / w.n, landed: w.landed / w.n, top: w.top }))
    .sort((a, b) => b.share - a.share);
  const alive = rows.filter((r) => r.alive !== undefined);
  const hurtRows = rows.filter((r) => r.hurt !== undefined);
  if (hurtRows.length) console.log(`damage that would have hit the survivor: ${Math.round(hurtRows.reduce((a, r) => a + r.hurt, 0) / hurtRows.length)} a minute (median ${hurtRows.map((r) => r.hurt).sort((a, b) => a - b)[hurtRows.length >> 1]})`);
  console.log(`\n${rows.length} builds of ${size}; a fair share is ${Math.round(100 / size)}%` + (alive.length ? `; ${Math.round(alive.reduce((a, r) => a + r.alive, 0) / alive.length)} creatures alive on average` : '') + '\n');
  console.log('weapon            builds   mean share  x fair   landed/s   top of meter');
  for (const w of list) {
    console.log(w.id.padEnd(16), String(w.n).padStart(7), (Math.round(w.share * 1000) / 10 + '%').padStart(12),
      ('x' + (w.share * size).toFixed(2)).padStart(8), String(Math.round(w.landed)).padStart(10), String(w.top).padStart(14));
  }
  /* The gate: every weapon's share within BAND of fair (default 0.65 to
     1.35). A weapon outside it is the thing a tester will screenshot. */
  const [lo, hi] = (process.env.BAND || '0.65,1.35').split(',').map(Number);
  const out = list.filter((w) => w.share * size < lo || w.share * size > hi);
  if (out.length) {
    console.log(`\nFAIL: outside x${lo} to x${hi} of fair: ` + out.map((w) => `${w.id} x${(w.share * size).toFixed(2)}`).join(', '));
    process.exitCode = 1;
  } else console.log(`\nok: every weapon within x${lo} to x${hi} of a fair share`);
  return list;
}

(async () => {
  if (process.argv[2] === '--report') {
    const rows = process.argv.slice(3).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).rows);
    report(rows);
    return;
  }
  const S = {
    BUILDS: +env('BUILDS', 60), BUILD: +env('BUILD', 5), SHARD: env('SHARD', '1/1').split('/').map(Number),
    WARM: +env('WARM', 15), LIMIT: +env('LIMIT', 45), TIME: +env('TIME', 1200), MAP: env('MAP', 'palewastes'),
    WEAPONS: JSON.parse(env('WEAPONS', '{}')), COMBOS: JSON.parse(env('COMBOS', '{}')), CONFIG: JSON.parse(env('CONFIG', '{}')),
    // STAGE=s1: rank 1, nothing else, at 1:00. STAGE=s2: rank 3 at 5:00.
    // STAGE=s3: rank 5, unevolved, half of each passive, level 45, at 9:00.
    // STAGE=s4: rank 8, unevolved, four fifths, level 80, at 14:00.
    STAGE: env('STAGE', 's5'),
    // MOVE=pilot: the bot's pilot (tools/bot/pilot.js) moves the survivor
    // instead of the circling kite, as in a real night. HERO: whose kit.
    MOVE: env('MOVE', 'kite'), HERO: env('HERO', 'mage'),
    // FIXED='arcweb:3,knifestorm:7,...': every build is this one (E evolves).
    FIXED: env('FIXED', ''), FRAC: env('FRAC', ''),
    // PASSIVES=subset: each build draws SUBSET of the nine weapon passives
    // (by stage 0/2/4/5/6), each at three quarters of its cap (full at s5),
    // as a player who took some and not others. Default: all nine at FRAC.
    PASSIVES: env('PASSIVES', 'all'), SUBSET: env('SUBSET', ''),
  };
  const STAGES = { s1: { t: 60, rank: 1, evo: false, frac: 0, level: 3, sub: 0 }, s2: { t: 300, rank: 3, evo: false, frac: 0.2, level: 20, sub: 2 },
    s3: { t: 540, rank: 5, evo: false, frac: 0.5, level: 45, sub: 4 }, s4: { t: 840, rank: 8, evo: false, frac: 0.8, level: 80, sub: 5 },
    s5: { t: 1200, rank: 8, evo: true, frac: 1, level: 150, sub: 6 },
    // STAGE=lead: the first evolution. One weapon evolved, four at rank 6,
    // at 14:00: the moment a tester's meter showed Skybreak at 59%. Each
    // weapon leads BUILDS/20 builds; the gate compares the leads' shares.
    lead: { t: 840, rank: 6, evo: false, frac: 0.7, level: 80, lead: true } };
  S.st = Object.assign({}, STAGES[S.STAGE]);
  if (S.FRAC !== '') S.st.frac = +S.FRAC;
  // RANK=3: every weapon at this rank instead of the stage's (a weaker build
  // for the minute, as a real night often has).
  if (env('RANK', '') !== '') S.st.rank = +env('RANK');
  if (!process.env.TIME) S.TIME = S.st.t;
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page0 = await b.newPage();
  await page0.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page0.waitForFunction(() => window.WS && WS.Weapons);
  const pool = await page0.evaluate(() => WS.WeaponOrder.filter((id) => !WS.Weapons[id].isUnion && WS.Weapons[id].evolveName));
  await page0.close();
  // The builds: seeded, so every shard and every candidate sees the same ones.
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const builds = [];
  for (let i = 0; i < S.BUILDS; i++) {
    const bag = pool.slice(), pick = [];
    if (S.st.lead) pick.push(bag.splice(i % bag.length, 1)[0]);
    while (pick.length < S.BUILD) pick.push(bag.splice(Math.floor(rnd() * bag.length), 1)[0]);
    builds.push(pick);
  }
  // Each build's passives, drawn from their own stream so the weapons drawn
  // above stay the same builds in every mode.
  const DMG = ['might', 'haste', 'precision', 'ferocity', 'area', 'quantity', 'velocity', 'perennial', 'serration'];
  let s2 = 777;
  const rnd2 = () => { s2 = (s2 * 1103515245 + 12345) % 2147483648; return s2 / 2147483648; };
  const nSub = S.SUBSET !== '' ? +S.SUBSET : (S.st.sub || 0);
  const passiveSets = builds.map(() => {
    const bag = DMG.slice(), out = [];
    for (let k = 0; k < nSub; k++) out.push(bag.splice(Math.floor(rnd2() * bag.length), 1)[0]);
    return out;
  });
  if (S.FIXED) for (let i = 0; i < builds.length; i++) builds[i] = S.FIXED.split(',');
  const mine = builds.map((w, i) => ({ i, w, ps: S.PASSIVES === 'subset' ? passiveSets[i] : null })).filter((j) => j.i % S.SHARD[1] === S.SHARD[0] - 1);
  const rows = [];
  for (const job of mine) {
    const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
    const pilotSrc = require('./bot/pilot.js').installPilot.toString();
    const r = await page.evaluate(({ S, job, pilotSrc }) => {
      if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
      WS.UI.closeOverlay();
      WS.Save.db.seenManual = true; WS.Save.unlockAll();
      WS.Save.save = () => {}; WS.Save.flush = () => {};
      WS.Save.settings.difficulty = 'professional';
      Object.assign(WS.Config, S.CONFIG);
      for (const [id, o] of Object.entries(S.WEAPONS)) Object.assign(WS.Weapons[id], o);
      for (const [id, o] of Object.entries(S.COMBOS)) Object.assign(WS.Combos[id], o);
      WS.setSeed(7000 + job.i);
      const G = WS.Game;
      // The survivor takes no damage, but what would have hit is counted:
      // how well a build keeps the night off you.
      let hurt = 0, hurting = false;
      const hurtBy = {};
      WS.Player.takeDamage = (pl, amount, name) => { if (hurting && amount > 0) { hurt += amount; hurtBy[name || '?'] = (hurtBy[name || '?'] || 0) + amount; } return false; };
      G.startRun(S.MAP, S.HERO);
      G.chooseBlessing({ type: 'blessing', id: 'kings' });
      const p = G.player;
      G.run.secondBlessing = true;
      G.openLevelUp = () => {}; G.presentLevelUp = () => {};
      G.state = 'playing'; WS.UI.closeOverlay();
      p.weapons.length = 0; p.weaponLevels = {};
      for (const spec of job.w) {
        const [id, rk] = spec.split(':');
        const w = WS.Player.addWeapon(p, id);
        if (!w) continue;
        const lead = S.st.lead && spec === job.w[0];
        w.level = rk ? parseInt(rk) : lead ? 8 : S.st.rank; p.weaponLevels[id] = w.level;
        w.evolved = rk ? rk.endsWith('E') : lead || S.st.evo;
      }
      WS.ComboSystem.check(p);
      for (const id of job.ps || ['might', 'haste', 'precision', 'ferocity', 'area', 'quantity', 'velocity', 'perennial', 'serration']) {
        const up = WS.Upgrades[id];
        const n = job.ps ? Math.ceil(up.max * (S.st.evo ? 1 : 0.75)) : Math.ceil(up.max * S.st.frac);
        for (let k = 0; k < n; k++) up.apply(p, up);
        p.upgradeLevels[id] = n;
      }
      p.level = S.st.level;
      const cx = WS.CONST.WORLD_WIDTH / 2, cy = WS.CONST.WORLD_HEIGHT / 2;
      WS.Input.poll = () => {};
      for (const k of Object.keys(WS.Input.keys)) WS.Input.keys[k] = false;
      G.run.time = Math.max(0, S.TIME - S.WARM);
      p.x = cx; p.y = cy;
      const pilot = S.MOVE === 'pilot' ? (0, eval)('(' + pilotSrc + ')')({}) : null;
      const kite = () => {
        if (pilot) { pilot.step(1 / 60); return; }
        const t = G.run.time;
        let tx = cx + Math.cos(t * 0.5) * 240, ty = cy + Math.sin(t * 0.5) * 170;
        const near = WS.Enemy.findNearest(p.x, p.y, 160);
        if (near) { const dx = p.x - near.x, dy = p.y - near.y, d = Math.hypot(dx, dy) || 1; tx = p.x + dx / d * 250; ty = p.y + dy / d * 250; }
        const k = WS.Input.keys, h = WS.Input.held || {};
        k.left = h.left = tx - p.x < -6; k.right = h.right = tx - p.x > 6; k.up = h.up = ty - p.y < -6; k.down = h.down = ty - p.y > 6;
      };
      const landed = {}, raw = {};
      let counting = false;
      const dmg = WS.Enemy.damage;
      WS.Enemy.damage = function (e, amount, crit, source) {
        if (counting && e && !e._dead && !(e.invuln > 0)) {
          const k = source || '?';
          landed[k] = (landed[k] || 0) + Math.min(amount, Math.max(0, e.health));
          raw[k] = (raw[k] || 0) + amount;
        }
        return dmg.apply(this, arguments);
      };
      const tick = () => {
        G.pendingLevelUps = 0; G.leveling = false;
        if (G.state !== 'playing') { WS.UI.closeOverlay(); G.state = 'playing'; }
        p.health = p.maxHealth; kite(); G.update(1 / 60);
      };
      for (let i = 0; i < S.WARM * 60; i++) tick();
      const k0 = G.run.kills; counting = true; hurting = true;
      let alive = 0;
      for (let i = 0; i < S.LIMIT * 60; i++) { tick(); if (i % 60 === 0) alive += WS.Enemy.pool.count; }
      alive = Math.round(alive / S.LIMIT);
      counting = false; WS.Enemy.damage = dmg;
      for (const k of Object.keys(landed)) { landed[k] = Math.round(landed[k] / S.LIMIT); raw[k] = Math.round(raw[k] / S.LIMIT); }
      return { weapons: job.w.map((w) => w.split(':')[0]), passives: job.ps, lead: S.st.lead ? job.w[0] : null, landed, raw, kills: Math.round((G.run.kills - k0) * 60 / S.LIMIT), alive, hurt: Math.round(hurt * 60 / S.LIMIT), hurtBy, combos: Object.keys(p.combosActive) };
    }, { S, job, pilotSrc });
    r.errs = errs.slice(0, 2);
    if (errs.length) console.error('page error: ' + errs[0]);
    rows.push(r);
    const tot = Object.values(r.landed).reduce((a, v) => a + v, 0) || 1;
    console.error(`build ${String(job.i).padStart(3)}  ` + r.weapons.map((id) => `${id} ${Math.round((r.landed[id] || 0) / tot * 100)}%`).join('  '));
    await page.close();
  }
  await b.close();
  if (env('OUT', null)) fs.writeFileSync(env('OUT'), JSON.stringify({ S, rows }));
  report(rows);
})();
