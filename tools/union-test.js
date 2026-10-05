#!/usr/bin/env node
/* IS A UNION A REWARD? Forging one consumes two evolved weapons and frees a
 * slot. A player who finds it should come out ahead, or the discovery was a
 * trap. For every union, in the same company (three other evolved weapons,
 * drawn per set) at TIME with a late-night set of passives:
 *
 *   pair     the two evolved weapons, as they were
 *   union    the union, and a new weapon at rank NEWRANK in the slot it freed
 *   alone    the union, the slot left empty
 *
 * Scored by damage landed a minute and damage that reached the survivor, in
 * the real waves (tools/meter-test.js JOBS=). union/pair above 1 is a reward.
 *
 *   node tools/union-test.js
 *   TIME=1500 LEVEL=130 SETS=5 OUT=/tmp/u.json node tools/union-test.js
 *   node tools/union-test.js --report /tmp/u.json
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const UNIONS = {
  union_firmament: ['seeking_motes', 'moonbrand'], union_ruin: ['cinderfall', 'umbral_bolt'],
  union_steel: ['knifestorm', 'volley'], union_sanctuary: ['dawnpulse', 'hallowed_ring'],
  union_stormcall: ['axe_gyre', 'arcweb'], union_tempest_kata: ['iron_palms', 'gale_chakram'],
  union_wild_hunt: ['spirit_herd', 'verdant_lance'], union_rotwood: ['thornbloom', 'blightfield'],
};
const LATE = { might: 5, haste: 5, area: 5, quantity: 3, precision: 4, ferocity: 3, velocity: 2 };

function report(rows) {
  const by = {};
  for (const r of rows) {
    const [kind, u] = r.tag.split(':');
    const tot = Object.values(r.landed).reduce((a, v) => a + v, 0);
    const c = ((by[u] = by[u] || {})[kind] = by[u][kind] || { n: 0, tot: 0, hurt: 0, own: 0 });
    c.n++; c.tot += tot; c.hurt += r.hurt; c.own += (r.landed[u] || 0) + UNIONS[u].reduce((a, w) => a + (r.landed[w] || 0), 0);
  }
  const m = (c, k) => c[k] / c.n;
  console.log('\nunion               union+new/pair  alone/pair   its own share: pair  union   hurt: pair  union+new  alone');
  for (const [u, o] of Object.entries(by)) {
    if (!o.pair || !o.union || !o.alone) continue;
    console.log(u.padEnd(20) + `x${(m(o.union, 'tot') / m(o.pair, 'tot')).toFixed(2)}`.padStart(13)
      + `x${(m(o.alone, 'tot') / m(o.pair, 'tot')).toFixed(2)}`.padStart(13)
      + `${Math.round(m(o.pair, 'own') / m(o.pair, 'tot') * 100)}%`.padStart(19) + `${Math.round(m(o.union, 'own') / m(o.union, 'tot') * 100)}%`.padStart(7)
      + String(Math.round(m(o.pair, 'hurt'))).padStart(13) + String(Math.round(m(o.union, 'hurt'))).padStart(11) + String(Math.round(m(o.alone, 'hurt'))).padStart(7));
  }
}

(async () => {
  if (process.argv[2] === '--report') { report(process.argv.slice(3).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).rows)); return; }
  const TIME = +env('TIME', 1260), LEVEL = +env('LEVEL', 120), SETS = +env('SETS', 4), NEWRANK = +env('NEWRANK', 4);
  const weapons = Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, 'rush-weapons.json'), 'utf8')));
  let s = 777;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const jobs = [];
  for (const [u, from] of Object.entries(UNIONS)) {
    for (let k = 0; k < SETS; k++) {
      const bag = weapons.filter((w) => !from.includes(w)), pick = [];
      while (pick.length < 4) pick.push(bag.splice(Math.floor(rnd() * bag.length), 1)[0]);
      const others = pick.slice(0, 3).map((w) => w + ':8E');
      jobs.push({ tag: 'pair:' + u, w: [from[0] + ':8E', from[1] + ':8E', ...others], pp: LATE });
      jobs.push({ tag: 'union:' + u, w: [u + ':8', ...others, pick[3] + ':' + NEWRANK], pp: LATE });
      jobs.push({ tag: 'alone:' + u, w: [u + ':8', ...others], pp: LATE });
    }
  }
  const tmp = path.join(os.tmpdir(), `union-jobs-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(jobs));
  const SH = +env('SHARDS', os.cpus().length);
  const outs = Array.from({ length: SH }, (_, i) => path.join(os.tmpdir(), `union-${process.pid}-${i}.json`));
  console.error(`${jobs.length} builds at ${TIME}s over ${SH} shards`);
  await Promise.all(outs.map((out, i) => new Promise((resolve) => {
    const ch = spawn(process.execPath, [path.join(__dirname, 'meter-test.js')], {
      env: { ...process.env, JOBS: tmp, SHARD: `${i + 1}/${SH}`, OUT: out, TIME: String(TIME), LEVEL: String(LEVEL), STAGE: 's5' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    ch.on('close', resolve);
  })));
  const rows = outs.flatMap((f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).rows : []));
  if (env('OUT', null)) fs.writeFileSync(env('OUT'), JSON.stringify({ TIME, LEVEL, SETS, rows }));
  report(rows);
})();
