#!/usr/bin/env node
/* THE SWAP TEST: is an evolved weapon that leads real bot nights actually
 * strong, or just the only evolved weapon in a thin build?
 *
 * Across bot nights a weapon's median share once evolved looks damning (it
 * read Skybreak at 52%), but it compares unlike builds: whatever evolves
 * first beside five low-rank weapons leads, whichever weapon it is. This
 * takes real builds from botlab output where WEAPON is evolved at MINUTE,
 * and replays each through tools/meter-test.js (the bot's pilot, that
 * night's survivor, a random five passives) twice over: as it was, and with
 * WEAPON swapped for each of SWAPS evolved in its place. A fair weapon
 * leads its own builds about as much as the others would.
 *
 *   node tools/swap-test.js night-a.json night-b.json
 *   WEAPON=arcweb MINUTE=20 MAX=6 SWAPS=seeking_motes,knifestorm,volley,umbral_bolt,reaving_arc
 *   Gate: WEAPON's mean share within x0.8 to x1.25 of the swaps' mean (RATIO=0.8,1.25).
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const WEAPON = env('WEAPON', 'arcweb'), MINUTE = +env('MINUTE', 20), MAX = +env('MAX', 6);
const SWAPS = env('SWAPS', 'seeking_motes,knifestorm,volley,umbral_bolt,reaving_arc').split(',');
const [LO, HI] = env('RATIO', '0.8,1.25').split(',').map(Number);
const PAR = +env('PAR', 4);

const runs = process.argv.slice(2).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).runs);
const jobs = [];
const seen = new Set();
for (const r of runs) {
  if (seen.size >= MAX) break;
  const c = (r.curve || []).find((x) => x[0] === MINUTE) || (r.curve || [])[r.curve.length - 1];
  const ranks = c && c[6];
  if (!ranks || ranks[WEAPON] !== '8E') continue;
  const key = r.hero + '/' + r.seed;
  if (seen.has(key)) continue;
  seen.add(key);
  const others = Object.entries(ranks).filter(([k]) => k !== WEAPON && !k.startsWith('union')).map(([k, v]) => k + ':' + v);
  for (const sw of [WEAPON, ...SWAPS]) {
    if (sw !== WEAPON && ranks[sw]) continue;
    jobs.push({ key, hero: r.hero, swap: sw, fixed: [sw + ':8E', ...others].join(',') });
  }
}
if (!jobs.length) { console.log(`no night has ${WEAPON} evolved at ${MINUTE}:00`); process.exit(0); }
console.error(`${seen.size} builds, ${jobs.length} replays`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swap-'));
function run(j, i) {
  return new Promise((done) => {
    const out = path.join(tmp, i + '.json');
    execFile('node', [path.join(__dirname, 'meter-test.js')], {
      env: Object.assign({}, process.env, { MOVE: 'pilot', HERO: j.hero, FIXED: j.fixed, STAGE: 's4', TIME: String(MINUTE * 60),
        PASSIVES: 'subset', SUBSET: '5', BUILDS: '2', BAND: '0,99', OUT: out }),
      maxBuffer: 1 << 26,
    }, () => {
      try {
        const rows = JSON.parse(fs.readFileSync(out, 'utf8')).rows;
        const sh = rows.map((r) => (r.landed[j.swap] || 0) / (r.weapons.reduce((a, id) => a + (r.landed[id] || 0), 0) || 1));
        j.share = sh.reduce((a, b) => a + b, 0) / sh.length;
      } catch (e) { j.share = null; }
      done();
    });
  });
}
(async () => {
  let next = 0;
  await Promise.all(Array.from({ length: PAR }, async () => { while (next < jobs.length) { const i = next++; await run(jobs[i], i); } }));
  const cols = [WEAPON, ...SWAPS];
  console.log('build'.padEnd(20) + cols.map((c) => c.slice(0, 12).padStart(13)).join(''));
  const sums = {};
  for (const key of seen) {
    const row = cols.map((c) => { const j = jobs.find((x) => x.key === key && x.swap === c); return j && j.share !== null ? j.share : null; });
    row.forEach((v, i) => { if (v !== null) (sums[cols[i]] = sums[cols[i]] || []).push(v); });
    console.log(key.padEnd(20) + row.map((v) => (v === null ? '-' : Math.round(v * 100) + '%').padStart(13)).join(''));
  }
  const mean = (a) => (a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  console.log('mean'.padEnd(20) + cols.map((c) => (sums[c] ? Math.round(mean(sums[c]) * 100) + '%' : '-').padStart(13)).join(''));
  const own = mean(sums[WEAPON]), rest = mean(SWAPS.flatMap((s) => sums[s] || []));
  const ratio = own / rest;
  console.log(`\n${WEAPON} leads its own builds at x${ratio.toFixed(2)} of what the others would`);
  if (ratio < LO || ratio > HI) { console.log(`FAIL: outside x${LO} to x${HI}`); process.exitCode = 1; }
  else console.log(`ok: within x${LO} to x${HI}`);
  fs.rmSync(tmp, { recursive: true, force: true });
})();
