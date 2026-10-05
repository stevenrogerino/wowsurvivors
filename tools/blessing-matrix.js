#!/usr/bin/env node
/* Every blessing on every survivor: is anything too strong, and does any
 * survivor get too much out of their own?
 *
 * Not a guard: an instrument, like tools/calling-sim.js, but wider. That one
 * asks each survivor about their own signature; this one crosses all twelve
 * survivors with every blessing in the draft, so three questions can be read
 * off the same grid:
 *
 *   - which blessings are simply stronger than the rest, on anyone (the
 *     median gain across all twelve)
 *   - how much MORE a signature is worth on its owner than on the other
 *     eleven (the owner's gain minus the others' median) - the "individual
 *     benefit", which is the edge plus whatever the owner's kit adds
 *   - how much of that is the edge alone (the owner again, edge zeroed)
 *
 * Each run: real waves from TIME seconds, the survivor's own weapon filled
 * out to four (Volley, Arcweb, Axe Gyre, Cinderfall in that order), all
 * evolved, and a fixed passive spread, so the build is the same shape for
 * everyone and only the blessing changes. Scored against Warden's Charge
 * ('kings', a plain blessing) on the same survivor and seed: seconds
 * survived (to LIMIT) and effective damage per second (overkill clipped).
 *
 * Scenarios (SCEN):
 *   late   Thornhollow, Professional, from 22:00, kiting        (default)
 *   max    Pale Waste, Professional, Hyper, from 4:00, kiting
 *   stand  Thornhollow, Professional, Hyper, from 25:00, standing still, a
 *          tank build (thorns, Searing Aura, Ironhide) instead of the spread
 *
 * SAME=1 gives everyone the same four weapons instead of their own first:
 * the baselines then compare the survivors themselves.
 *
 * Runs are split across processes with SHARDS (default: the CPU count) and
 * the grid is written to OUT as JSON; tools/blessing-matrix.js --report OUT
 * prints the tables again from a saved grid.
 *
 *   SCEN=late SEEDS=6 OUT=/tmp/late.json node tools/blessing-matrix.js
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const SCENARIOS = {
  // Start times fitted so the baselines die somewhere inside the limit, not
  // all at once and not never: a grid where everyone lives tells nothing.
  late: { MAP: 'thornhollow', DIFF: 'professional', HYPER: false, TIME: 1320, LIMIT: 90, STILL: false, TANK: false },
  max: { MAP: 'palewastes', DIFF: 'professional', HYPER: true, TIME: 240, LIMIT: 90, STILL: false, TANK: false },
  stand: { MAP: 'thornhollow', DIFF: 'professional', HYPER: true, TIME: 1500, LIMIT: 90, STILL: true, TANK: true },
};

// Each survivor's edge on their own signature, and how to take it away.
const EDGE_OFF = {
  mage: (p) => { p.overflowBonus = 0; },
  priest: (p) => { p.barrierBonus = 0; },
  rogue: (p) => { p.comboBonus = 0; },
  hunter: (p) => { p.markHaste = 0; },
  warrior: (p) => { p.rageBonus = 0; },
  warlock: (p) => { p.soulBonus = 0; },
  shaman: (p) => { p.totemReach = 0; },
  paladin: (p) => { p.holyBonus = 0; },
  graveblade: (p) => { p.curdleShare = 0; },
  ruinseeker: (p) => { p.felBonus = 0; p.ruinborn = 0; },
  druid: (p) => { p.wildBonus = 0; p.formBonus = 0; },
  monk: (p) => { p.flowBonusSteps = 0; p.flowRechargeMult = 1; },
};

async function worker(scen, jobs, seeds) {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('ERR', e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
  await page.waitForTimeout(300);
  const edgeOff = Object.fromEntries(Object.entries(EDGE_OFF).map(([k, f]) => [k, f.toString()]));
  const out = await page.evaluate(({ S, jobs, seeds, edgeOff }) => {
    if (WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay(); WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Save.settings.difficulty = S.DIFF;
    WS.Save.db.unlocks.hyper[S.MAP] = true;
    if (S.HYPER) { WS.Save.db.oaths = Object.assign({}, WS.Save.db.oaths, { hyper: true }); WS.Save.stats.totalVictories = Math.max(1, WS.Save.stats.totalVictories || 0); } else if (WS.Save.db.oaths) delete WS.Save.db.oaths.hyper;  // Hyper is an Oath
    WS.Game.openLevelUp = () => {}; WS.Game.presentLevelUp = () => {};
    // Candidate numbers, tried without touching the game: CONFIG and CHARS.
    Object.assign(WS.Config, S.CONFIG || {});
    for (const [id, o] of Object.entries(S.CHARS || {})) Object.assign(WS.Characters[id], o);
    const off = {};
    for (const k in edgeOff) off[k] = (0, eval)('(' + edgeOff[k] + ')');
    const keepPlaying = () => {
      WS.Game.pendingLevelUps = 0; WS.Game.leveling = false;
      if (WS.Game.state === 'blessing' || WS.Game.state === 'levelup' || WS.Game.state === 'merchant') {
        WS.UI.closeOverlay(); WS.Game.state = 'playing';
      }
      WS.Game.timeScale = 1;
    };
    const kite = (p) => {
      const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT, t = WS.Game.run.time;
      let tx = W / 2 + Math.cos(t * 0.5) * 240, ty = H / 2 + Math.sin(t * 0.5) * 170;
      const near = WS.Enemy.findNearest(p.x, p.y, 160);
      if (near) {
        const dx = p.x - near.x, dy = p.y - near.y, d = Math.hypot(dx, dy) || 1;
        tx = p.x + dx / d * 250; ty = p.y + dy / d * 250;
      }
      tx = Math.max(80, Math.min(W - 80, tx)); ty = Math.max(80, Math.min(H - 80, ty));
      const k = WS.Input.keys, h = WS.Input.held;
      k.left = h.left = tx - p.x < -6; k.right = h.right = tx - p.x > 6;
      k.up = h.up = ty - p.y < -6; k.down = h.down = ty - p.y > 6;
    };
    const still = () => {
      const k = WS.Input.keys, h = WS.Input.held;
      k.left = h.left = k.right = h.right = k.up = h.up = k.down = h.down = false;
    };
    const FILL = S.TANK ? ['dawnpulse', 'hallowed_ring', 'axe_gyre', 'volley'] : ['volley', 'arcweb', 'axe_gyre', 'cinderfall'];
    const PASSIVES = S.TANK
      ? { armor: 5, thorns: 5, searing: 4, vitality: 4, might: 2 }
      : { might: 3, haste: 3, vitality: 3, armor: 2, area: 2 };
    const run1 = (hero, blessing, seed, noEdge) => {
      WS.setSeed(seed);
      WS.Game.startRun(S.MAP, hero);
      const pl = WS.Game.player;
      WS.Game.chooseBlessing({ type: 'blessing', id: blessing });
      if (noEdge) off[hero](pl);
      const start = pl.weapons[0] && pl.weapons[0].id;
      pl.weapons.length = 0; pl.weaponLevels = {};
      // SAME=1: everyone carries the same four, so what is left is the survivor.
      const ids = S.SAME ? [] : [start];
      for (const id of FILL) if (ids.length < 4 && !ids.includes(id)) ids.push(id);
      for (const id of ids) {
        const w = WS.Player.addWeapon(pl, id);
        if (!w) continue;
        w.level = WS.WEAPON_MAX_LEVEL; pl.weaponLevels[id] = w.level; w.evolved = true;
      }
      for (const [id, n] of Object.entries(PASSIVES)) {
        const up = WS.Upgrades[id];
        for (let i = 0; i < n; i++) up.apply(pl, up);
        pl.upgradeLevels[id] = (pl.upgradeLevels[id] || 0) + n;
      }
      if (pl.flowAttuned > 0) pl.flowSteps = WS.Primal.maxSteps(pl);
      pl.health = pl.maxHealth;
      WS.Enemy.pool.releaseAll(); WS.Hazard.pool.releaseAll(); WS.Projectile.bolts.releaseAll();
      WS.Game.run.time = S.TIME;
      pl.x = WS.CONST.WORLD_WIDTH / 2; pl.y = WS.CONST.WORLD_HEIGHT / 2;
      let eff = 0, t = 0;
      const rd = WS.Enemy.damage;
      WS.Enemy.damage = function (e, amount) {
        if (e && !e._dead && e.invuln <= 0) eff += Math.min(amount, Math.max(0, e.health));
        return rd.apply(this, arguments);
      };
      const taken0 = WS.Game.run.damageTaken;
      const heal0 = Object.assign({}, WS.Game.run.healingBySource);
      for (let i = 0; i < 60 * S.LIMIT; i++) {
        keepPlaying();
        if (S.STILL) still(); else kite(pl);
        WS.Game.tick(WS.CONST.TICK_RATE);
        t += WS.CONST.TICK_RATE;
        if (WS.Game.state === 'dying' || WS.Game.state === 'over' || pl.health <= 0) break;
      }
      WS.Enemy.damage = rd;
      const heals = {};
      for (const [k, v] of Object.entries(WS.Game.run.healingBySource)) {
        const d = (v - (heal0[k] || 0)) / t;
        if (d > 0.05) heals[k] = +d.toFixed(2);
      }
      return { t, dps: eff / t, taken: (WS.Game.run.damageTaken - taken0) / t, heals, maxHp: pl.maxHealth };
    };
    const res = [];
    for (const [hero, bl, noEdge] of jobs) {
      for (const seed of seeds) res.push({ hero, bl, noEdge, seed, ...run1(hero, bl, seed, noEdge) });
    }
    return res;
  }, { S: scen, jobs, seeds, edgeOff });
  await b.close();
  return out;
}

function report(grid, scenName) {
  const heroes = [...new Set(grid.map((r) => r.hero))];
  const bls = [...new Set(grid.map((r) => r.bl))];
  const avg = (rows, k) => rows.reduce((s, r) => s + r[k], 0) / (rows.length || 1);
  const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
  const cell = (h, b, noEdge = false) => grid.filter((r) => r.hero === h && r.bl === b && !!r.noEdge === noEdge);
  const gain = (h, b, noEdge) => {
    const base = cell(h, 'kings'), w = cell(h, b, noEdge);
    return { dt: avg(w, 't') - avg(base, 't'), dps: avg(w, 'dps') / avg(base, 'dps') - 1, t: avg(w, 't'), base: avg(base, 't') };
  };
  // Paired by seed: the same waves with and without, so the spread is the
  // blessing's, not the seed's. Returns the mean difference and its standard
  // error - survival is close to all-or-nothing, and at a handful of seeds a
  // ten-second difference can be nothing at all.
  const paired = (a, b, k) => {
    const d = [];
    for (const r of a) { const q = b.find((x) => x.seed === r.seed); if (q) d.push(r[k] - q[k]); }
    const m = avg(d.map((x) => ({ v: x })), 'v');
    const sd = Math.sqrt(d.reduce((acc, x) => acc + (x - m) * (x - m), 0) / WS_MAX(1, d.length - 1));
    return { m, se: sd / Math.sqrt(WS_MAX(1, d.length)) };
  };
  const WS_MAX = Math.max;
  const owners = JSON.parse(process.env.__OWNERS || '{}');
  const s = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
  const p = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(0) + '%';
  console.log(`\n== ${scenName}: survivors on plain Warden's Charge (baseline) ==`);
  for (const h of heroes) {
    const base = cell(h, 'kings');
    console.log('  ' + h.padEnd(11) + `${avg(base, 't').toFixed(1)}s`.padStart(8) + `${avg(base, 'dps').toFixed(0)} dps`.padStart(11)
      + `${avg(base, 'taken').toFixed(0)} taken/s`.padStart(14));
  }
  console.log(`\n== ${scenName}: every blessing, median gain over Warden's Charge across ${heroes.length} survivors ==`);
  console.log('  ' + 'blessing'.padEnd(20) + 'survived'.padStart(10) + 'dps'.padStart(8) + '   (range of survived gain)');
  const rows = bls.filter((b) => b !== 'kings').map((b) => {
    const others = heroes.filter((h) => owners[h] !== b);
    const g = others.map((h) => gain(h, b));
    return { b, dt: med(g.map((x) => x.dt)), dps: med(g.map((x) => x.dps)), lo: Math.min(...g.map((x) => x.dt)), hi: Math.max(...g.map((x) => x.dt)) };
  }).sort((a, b) => b.dt - a.dt);
  for (const r of rows) {
    const own = Object.keys(owners).find((h) => owners[h] === r.b);
    console.log('  ' + (r.b + (own ? ' *' : '')).padEnd(20) + (s(r.dt) + 's').padStart(10) + p(r.dps).padStart(8)
      + `   ${s(r.lo)}..${s(r.hi)}s`);
  }
  console.log('  (* a signature: median over the eleven who do not own it)');
  console.log(`\n== ${scenName}: owner's gain on their own signature vs everyone else's ==`);
  console.log('  ' + 'survivor'.padEnd(11) + 'signature'.padEnd(17) + 'owner'.padStart(9) + 'others'.padStart(9) + 'owner+'.padStart(9)
    + '  dps: owner  others' + '   edge alone: survived (± se)   dps');
  for (const h of heroes) {
    const b = owners[h];
    if (!b || !bls.includes(b)) continue;
    const o = gain(h, b), others = heroes.filter((x) => x !== h).map((x) => gain(x, b));
    const oth = med(others.map((x) => x.dt)), othD = med(others.map((x) => x.dps));
    const ne = cell(h, b, true).length ? gain(h, b, true) : null;
    console.log('  ' + h.padEnd(11) + b.padEnd(17) + (s(o.dt) + 's').padStart(9) + (s(oth) + 's').padStart(9) + (s(o.dt - oth) + 's').padStart(9)
      + p(o.dps).padStart(11) + p(othD).padStart(8)
      + (ne ? (() => { const e = paired(cell(h, b), cell(h, b, true), 't'); return (s(e.m) + 's ±' + e.se.toFixed(1)).padStart(28); })()
        + p((1 + o.dps) / (1 + ne.dps) - 1).padStart(7) : ''));
  }
}

(async () => {
  if (process.argv[2] === '--report') {
    const saved = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    process.env.__OWNERS = JSON.stringify(saved.owners);
    report(saved.grid, saved.scen);
    return;
  }
  const scenName = process.env.SCEN || 'late';
  const scen = Object.assign({}, SCENARIOS[scenName]);
  // TIME, LIMIT and HYPER=0/1 override the scenario's own.
  if (process.env.TIME) scen.TIME = +process.env.TIME;
  if (process.env.LIMIT) scen.LIMIT = +process.env.LIMIT;
  if (process.env.HYPER) scen.HYPER = process.env.HYPER === '1';
  scen.SAME = process.env.SAME === '1';
  // CONFIG='{"flowRecharge":6}' and CHARS='{"monk":{"perkRecharge":0.9}}'
  // try candidate numbers as runtime overrides.
  if (process.env.CONFIG) scen.CONFIG = JSON.parse(process.env.CONFIG);
  if (process.env.CHARS) scen.CHARS = JSON.parse(process.env.CHARS);
  const N = +(process.env.SEEDS || 6);
  const seeds = Array.from({ length: N }, (_, i) => 5 + i * 23);

  if (process.env.__WORKER) {
    const jobs = JSON.parse(process.env.__JOBS);
    const out = await worker(scen, jobs, seeds);
    process.stdout.write(JSON.stringify(out));
    return;
  }

  // Ask the game for its roster and draft once.
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage();
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
  const { heroes, bls, owners } = await page.evaluate(() => ({
    heroes: WS.CharacterOrder.slice(),
    bls: WS.BlessingOrder.slice(),
    owners: Object.fromEntries(WS.CharacterOrder.map((h) => [h, WS.Characters[h].signatureBlessing])),
  }));
  await b.close();
  const H = process.env.HEROES ? process.env.HEROES.split(',') : heroes;
  const B = process.env.BLESSINGS ? ['kings', ...process.env.BLESSINGS.split(',').filter((x) => x !== 'kings')] : bls;
  const jobs = [];
  for (const h of H) {
    for (const bl of B) jobs.push([h, bl, false]);
    if (owners[h] && B.includes(owners[h])) jobs.push([h, owners[h], true]);
  }
  const shards = +(process.env.SHARDS || os.cpus().length);
  const parts = Array.from({ length: shards }, () => []);
  jobs.forEach((j, i) => parts[i % shards].push(j));
  const t0 = Date.now();
  const results = await Promise.all(parts.map((part) => new Promise((resolve, reject) => {
    const ch = spawn(process.execPath, [__filename], {
      env: { ...process.env, __WORKER: '1', __JOBS: JSON.stringify(part), SCEN: scenName, SEEDS: String(N) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buf = '';
    ch.stdout.on('data', (d) => { buf += d; });
    ch.on('close', (code) => (code ? reject(new Error('worker failed')) : resolve(JSON.parse(buf))));
  })));
  const grid = results.flat();
  console.log(`${scenName}: ${JSON.stringify(scen)}, ${N} seeds, ${grid.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ scen: scenName, owners, grid }));
  process.env.__OWNERS = JSON.stringify(owners);
  report(grid, scenName);
})();
