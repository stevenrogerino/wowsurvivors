#!/usr/bin/env node
/* RUSH OR SPREAD: what each weapon is worth rushed, at an equal number of
 * level-up picks.
 *
 * The genre's first lesson is "one maxed weapon beats four at level one"
 * (every Vampire Survivors guide). A rush should be a spike a player can
 * feel. But a weapon whose ranks are worth everything is always rushed and
 * one whose ranks are worth nothing never is, and either way the choice is
 * gone. So for every weapon W, three builds that spend the SAME picks
 * (getting a weapon, a rank, an evolution and a passive rank each cost one):
 *
 *   rush     W to rank 8 and evolved, its evolution passive, two partners at
 *            rank 2, the rest in three damage passives
 *   bare     W rushed and evolved the same way, no passive but its
 *            evolution one; the rest in three partners' ranks
 *   spread   W and three partners at an even rank, the rest in three damage
 *            passives; nothing evolved
 *
 * Partners and passives are drawn (seeded) per set, the same for every W, so
 * every weapon is measured against the same company. Each build is dropped
 * into the real waves at TIME with the survivor kiting (tools/meter-test.js
 * JOBS=), and scored by damage landed a minute, damage that reached the
 * survivor, and kills.
 *
 *   node tools/rush-test.js                      6:00, 24 picks, 4 sets
 *   TIME=540 PICKS=44 LEVEL=45 node tools/rush-test.js
 *   SETS=6 SHARDS=4 OUT=/tmp/r.json node tools/rush-test.js
 *   node tools/rush-test.js --report /tmp/r.json
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const DMG = ['might', 'haste', 'precision', 'ferocity', 'area', 'quantity', 'velocity', 'perennial', 'serration'];
const CAP = { might: 5, haste: 5, precision: 5, ferocity: 4, area: 5, quantity: 3, velocity: 3, perennial: 5, serration: 4 };

function report(rows) {
  const by = {};
  for (const r of rows) {
    const [style, w] = r.tag.split(':');
    const tot = Object.values(r.landed).reduce((a, v) => a + v, 0);
    const o = (by[w] = by[w] || {});
    const c = (o[style] = o[style] || { n: 0, tot: 0, own: 0, hurt: 0, kills: 0 });
    c.n++; c.tot += tot; c.own += r.landed[w] || 0; c.hurt += r.hurt; c.kills += r.kills;
  }
  const avg = (c, k) => c[k] / c.n;
  const lines = [];
  for (const [w, o] of Object.entries(by)) {
    if (!o.rush || !o.bare || !o.spread) continue;
    lines.push({ w, rush: avg(o.rush, 'tot'), bare: avg(o.bare, 'tot'), spread: avg(o.spread, 'tot'),
      hr: avg(o.rush, 'hurt'), hb: avg(o.bare, 'hurt'), hs: avg(o.spread, 'hurt'),
      own: avg(o.rush, 'own') / Math.max(1, avg(o.rush, 'tot')), ownS: avg(o.spread, 'own') / Math.max(1, avg(o.spread, 'tot')) });
  }
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const mSpread = med(lines.map((l) => l.spread));
  lines.sort((a, b) => b.rush / b.spread - a.rush / a.spread);
  console.log('\nweapon            rush/spread  bare/spread  rush/bare   hurt rush  bare  spread   W share rushed  spread   spread vs median');
  for (const l of lines) {
    console.log(l.w.padEnd(18) + `x${(l.rush / l.spread).toFixed(2)}`.padStart(11) + `x${(l.bare / l.spread).toFixed(2)}`.padStart(13)
      + `x${(l.rush / l.bare).toFixed(2)}`.padStart(11) + String(Math.round(l.hr)).padStart(12) + String(Math.round(l.hb)).padStart(7)
      + String(Math.round(l.hs)).padStart(8) + `${Math.round(l.own * 100)}%`.padStart(15) + `${Math.round(l.ownS * 100)}%`.padStart(9)
      + `x${(l.spread / mSpread).toFixed(2)}`.padStart(19));
  }
  const rs = lines.map((l) => l.rush / l.spread);
  console.log(`\nrush/spread: median x${med(rs).toFixed(2)}, range x${Math.min(...rs).toFixed(2)} - x${Math.max(...rs).toFixed(2)}`
    + `; rush/bare (what the passives add to a rush): median x${med(lines.map((l) => l.rush / l.bare)).toFixed(2)}`);
}

(async () => {
  if (process.argv[2] === '--report') {
    report(process.argv.slice(3).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).rows));
    return;
  }
  const TIME = +env('TIME', 360), PICKS = +env('PICKS', 24), LEVEL = +env('LEVEL', 25), SETS = +env('SETS', 4);
  const weapons = JSON.parse(fs.readFileSync(path.join(__dirname, 'rush-weapons.json'), 'utf8'));
  let s = 4242;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const draw = (bag, n, not) => { const b = bag.filter((x) => !not.includes(x)), out = []; while (out.length < n && b.length) out.push(b.splice(Math.floor(rnd() * b.length), 1)[0]); return out; };
  const ids = Object.keys(weapons);
  // The sets: three partners and three damage passives each, shared by every W.
  const sets = Array.from({ length: SETS }, () => ({ partners: draw(ids, 6, []), passives: draw(DMG, 3, []) }));
  /** Spend n picks over these passives, each up to its cap; returns {id: ranks}. */
  const spendPassives = (list, n, pp = {}) => {
    let left = n;
    for (let guard = 0; left > 0 && guard < 100; guard++) {
      let moved = false;
      for (const id of list) { if (left > 0 && (pp[id] || 0) < CAP[id]) { pp[id] = (pp[id] || 0) + 1; left--; moved = true; } }
      if (!moved) break;
    }
    return { pp, left };
  };
  const jobs = [];
  for (const W of ids) {
    const pair = weapons[W];
    for (const set of sets) {
      const partners = set.partners.filter((x) => x !== W).slice(0, 3);
      // rush: W 7 ranks + evolve + its passive = 9; two partners at rank 2 = 4; the rest passives.
      {
        const pp = { [pair]: 1 };
        const { pp: got } = spendPassives(set.passives, PICKS - 9 - 4, pp);
        jobs.push({ tag: 'rush:' + W, w: [W + ':8E', partners[0] + ':2', partners[1] + ':2'], pp: got });
      }
      // bare: the same rush, then the rest into three partners' ranks (capped at 8).
      {
        let left = PICKS - 9;
        const rk = [0, 0, 0];
        for (let guard = 0; left > 0 && guard < 100; guard++) for (let k = 0; k < 3 && left > 0; k++) { if (rk[k] < 8) { rk[k]++; left--; } }
        jobs.push({ tag: 'bare:' + W, w: [W + ':8E', ...partners.map((x, k) => x + ':' + Math.max(1, rk[k]))], pp: { [pair]: 1 } });
      }
      // spread: W (free) and three partners raised evenly with half the picks; the rest passives.
      {
        const weaponPicks = Math.round(PICKS / 2);
        const rk = [1, 0, 0, 0];
        let left = weaponPicks;
        for (let guard = 0; left > 0 && guard < 100; guard++) for (let k = 0; k < 4 && left > 0; k++) { if (rk[k] < 8) { rk[k]++; left--; } }
        const { pp } = spendPassives(set.passives, PICKS - weaponPicks);
        jobs.push({ tag: 'spread:' + W, w: [W + ':' + rk[0], ...partners.map((x, k) => x + ':' + Math.max(1, rk[k + 1]))], pp });
      }
    }
  }
  const tmp = path.join(os.tmpdir(), `rush-jobs-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(jobs));
  const SH = +env('SHARDS', os.cpus().length);
  const outs = Array.from({ length: SH }, (_, i) => path.join(os.tmpdir(), `rush-${process.pid}-${i}.json`));
  console.error(`${jobs.length} builds at ${TIME}s, ${PICKS} picks, level ${LEVEL}, over ${SH} shards`);
  await Promise.all(outs.map((out, i) => new Promise((resolve) => {
    const ch = spawn(process.execPath, [path.join(__dirname, 'meter-test.js')], {
      env: { ...process.env, JOBS: tmp, SHARD: `${i + 1}/${SH}`, OUT: out, TIME: String(TIME), LEVEL: String(LEVEL), STAGE: env('STAGE', 's3') },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    ch.on('close', resolve);
  })));
  const rows = outs.flatMap((f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).rows : []));
  if (env('OUT', null)) fs.writeFileSync(env('OUT'), JSON.stringify({ TIME, PICKS, LEVEL, SETS, rows }));
  report(rows);
})();
