#!/usr/bin/env node
/* WHAT EACH DISCOVERY IS WORTH, in a real build. A discovery is the reward
 * for carrying two weapons that belong together; finding one should be a
 * jump a player can feel, and no single one should be the only reason to
 * build anything. For every discovery, its two weapons and three others
 * that form no discovery among themselves or with them (drawn per set), at
 * TIME (default 14:00, rank RANK unevolved; EVO=1 evolves them), measured
 * twice in the real waves (tools/meter-test.js JOBS=): with every discovery
 * live, and with every discovery switched off. Only the one under test can
 * differ.
 *
 * Reported: the pair's landed damage on/off, the whole build's, and damage
 * that reached the survivor.
 *
 *   node tools/discovery-test.js
 *   TIME=1200 EVO=1 LEVEL=150 node tools/discovery-test.js
 *   node tools/discovery-test.js --report /tmp/on.json /tmp/off.json
 *   COMBOS='{"truestrike":{"dmgMult":1.05}}' OFF_FROM=/tmp/d.off.json node tools/discovery-test.js
 *     (a candidate: the 'on' run takes COMBOS; the 'off' run is reused from an
 *     earlier OUT= at the same TIME, LEVEL, SETS and RANK)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const LATE = { might: 4, haste: 4, area: 4, quantity: 2, precision: 3, ferocity: 2, velocity: 2 };

function report(on, off, combos) {
  const key = (r) => r.tag;
  const offBy = Object.fromEntries(off.map((r) => [key(r), r]));
  const by = {};
  for (const r of on) {
    const o = offBy[key(r)];
    if (!o) continue;
    const id = r.tag.split(':')[0];
    const [a, b] = combos[id];
    const pair = (x) => (x.landed[a] || 0) + (x.landed[b] || 0);
    const tot = (x) => Object.values(x.landed).reduce((s, v) => s + v, 0);
    const c = (by[id] = by[id] || { pOn: 0, pOff: 0, tOn: 0, tOff: 0, hOn: 0, hOff: 0, n: 0 });
    c.n++; c.pOn += pair(r); c.pOff += pair(o); c.tOn += tot(r); c.tOff += tot(o); c.hOn += r.hurt; c.hOff += o.hurt;
  }
  const rows = Object.entries(by).map(([id, c]) => ({ id, pair: c.pOn / c.pOff, tot: c.tOn / c.tOff, hurt: c.hOn / Math.max(1, c.hOff) }));
  rows.sort((x, y) => y.pair - x.pair);
  const med = rows.map((r) => r.pair).sort((x, y) => x - y)[rows.length >> 1];
  console.log('\ndiscovery              pair damage on/off   build on/off   hurt on/off   vs median');
  for (const r of rows) console.log(r.id.padEnd(22) + `x${r.pair.toFixed(2)}`.padStart(15) + `x${r.tot.toFixed(2)}`.padStart(15)
    + `x${r.hurt.toFixed(2)}`.padStart(14) + `x${(r.pair / med).toFixed(2)}`.padStart(12));
  console.log(`\nmedian pair gain x${med.toFixed(2)}`);
}

(async () => {
  if (process.argv[2] === '--report') {
    const on = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const off = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
    report(on.rows, off.rows, on.combos);
    return;
  }
  const TIME = +env('TIME', 840), LEVEL = +env('LEVEL', 80), SETS = +env('SETS', 4), RANK = +env('RANK', 8), EVO = env('EVO', '0') === '1';
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage();
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Combos && WS.WeaponOrder);
  const combos = await page.evaluate(() => Object.fromEntries(Object.entries(WS.Combos).map(([k, c]) => [k, c.weapons.slice()])));
  await b.close();
  const weapons = Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, 'rush-weapons.json'), 'utf8')));
  const linked = (x, y) => Object.values(combos).some(([a, c]) => (a === x && c === y) || (a === y && c === x));
  let s = 99;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const jobs = [];
  for (const [id, [a, bb]] of Object.entries(combos)) {
    if (!weapons.includes(a) || !weapons.includes(bb)) continue;
    for (let k = 0; k < SETS; k++) {
      const chosen = [a, bb];
      const bag = weapons.filter((w) => !chosen.includes(w));
      for (let guard = 0; chosen.length < 5 && guard < 500; guard++) {
        const w = bag[Math.floor(rnd() * bag.length)];
        if (chosen.includes(w) || chosen.some((x) => linked(x, w))) continue;
        chosen.push(w);
      }
      const r = RANK + (EVO ? 'E' : '');
      jobs.push({ tag: `${id}:${k}`, w: chosen.map((w) => w + ':' + r), pp: LATE });
    }
  }
  const tmp = path.join(os.tmpdir(), `disc-jobs-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(jobs));
  const SH = +env('SHARDS', os.cpus().length);
  const allOff = Object.fromEntries(Object.keys(combos).map((k) => [k, { weapons: ['__none_a', '__none_b'] }]));
  const run = (label, extra) => Promise.all(Array.from({ length: SH }, (_, i) => new Promise((resolve) => {
    const out = path.join(os.tmpdir(), `disc-${label}-${process.pid}-${i}.json`);
    const ch = spawn(process.execPath, [path.join(__dirname, 'meter-test.js')], {
      env: { ...process.env, ...extra, JOBS: tmp, SHARD: `${i + 1}/${SH}`, OUT: out, TIME: String(TIME), LEVEL: String(LEVEL), STAGE: EVO ? 's5' : 's4' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    ch.on('close', () => resolve(fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')).rows : []));
  }))).then((parts) => parts.flat());
  console.error(`${jobs.length} builds x2 at ${TIME}s over ${SH} shards`);
  const on = await run('on', {});
  const off = env('OFF_FROM', null) ? JSON.parse(fs.readFileSync(env('OFF_FROM'), 'utf8')).rows
    : await run('off', { COMBOS: JSON.stringify(allOff) });
  if (env('OUT', null)) {
    fs.writeFileSync(env('OUT') + '.on.json', JSON.stringify({ combos, rows: on }));
    fs.writeFileSync(env('OUT') + '.off.json', JSON.stringify({ combos, rows: off }));
  }
  report(on, off, combos);
})();
