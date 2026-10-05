#!/usr/bin/env node
/* WHAT A BUILD IS WORTH, BY KIND. Five weapons of one kind - projectiles,
 * auras (everything that works close: novas, zones, rings, orbits, palms) -
 * or a mix, with four ways of taking passives, at three points in the night,
 * dropped into the real waves (tools/meter-test.js JOBS=). For every build:
 *
 *   clear     creatures killed a minute (and how many stand alive on average)
 *   taken     damage that would have reached the survivor a minute
 *   dealt     landed damage a second, in total and by ability
 *   kills     by ability
 *
 * Passive sets, each at the stage's share of its cap (half at 9:00, four
 * fifths at 14:00, full at 20:00):
 *   none       nothing
 *   generic    Might, Haste, Precision, Ferocity
 *   matched    the build's own: projectiles take Quantity, Velocity, Might,
 *              Haste; auras take Area, Might, Haste, Precision; a mix takes
 *              all nine
 *   full       all nine weapon passives (the meter gate's default)
 *
 *   node tools/build-test.js                       runs and reports
 *   SETS=6 STAGES=s3,s4,s5 OUT=/tmp/b.json node tools/build-test.js
 *   node tools/build-test.js --report /tmp/b.json
 *   MODE=passives STAGES=s4,s5 node tools/build-test.js   each passive's worth:
 *     mixed builds with all nine, and with each one taken away
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);

const KINDS = {
  projectile: ['seeking_motes', 'cinderfall', 'rimeshard', 'umbral_bolt', 'volley', 'moonbrand', 'judgement_disc', 'gale_chakram'],
  aura: ['dawnpulse', 'hallowed_ring', 'reaving_arc', 'blightfield', 'thornbloom', 'axe_gyre', 'iron_palms', 'knifestorm'],
  mixed: null,   // any five of the twenty
};
const ALL = ['seeking_motes', 'cinderfall', 'rimeshard', 'arcweb', 'dawnpulse', 'hallowed_ring', 'umbral_bolt', 'knifestorm', 'axe_gyre', 'volley',
  'moonbrand', 'judgement_disc', 'reaving_arc', 'verdant_lance', 'grave_tether', 'blightfield', 'iron_palms', 'spirit_herd', 'thornbloom', 'gale_chakram'];
const CAPS = { might: 5, haste: 5, precision: 5, ferocity: 4, area: 5, quantity: 3, velocity: 3, perennial: 5, serration: 5 };
const SETS_OF = {
  none: () => [],
  generic: () => ['might', 'haste', 'precision', 'ferocity'],
  matched: (kind) => kind === 'projectile' ? ['quantity', 'velocity', 'might', 'haste']
    : kind === 'aura' ? ['area', 'might', 'haste', 'precision'] : Object.keys(CAPS),
  full: () => Object.keys(CAPS),
};
const STAGE = { s3: { rank: '5', frac: 0.5, label: '9:00 rank 5' }, s4: { rank: '8', frac: 0.8, label: '14:00 rank 8' }, s5: { rank: '8E', frac: 1, label: '20:00 evolved' } };

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

function report(rows) {
  const by = {};
  for (const r of rows) {
    const [kind, set, st] = r.tag.split(':');
    const k = `${st}|${kind}|${set}`;
    const c = (by[k] = by[k] || { st, kind, set, kills: [], alive: [], hurt: [], dealt: [] });
    c.kills.push(r.kills); c.alive.push(r.alive); c.hurt.push(r.hurt);
    c.dealt.push(Object.values(r.landed).reduce((a, v) => a + v, 0));
  }
  console.log('\nstage          kind        passives   kills/min   alive   taken/min   dealt/s');
  for (const c of Object.values(by).sort((a, b) => (a.st + a.kind + a.set).localeCompare(b.st + b.kind + b.set))) {
    console.log(`${STAGE[c.st].label.padEnd(15)}${c.kind.padEnd(12)}${c.set.padEnd(9)}` + String(Math.round(mean(c.kills))).padStart(11)
      + String(Math.round(mean(c.alive))).padStart(8) + String(Math.round(mean(c.hurt))).padStart(12) + String(Math.round(mean(c.dealt))).padStart(10));
  }
  // By ability: share of its build's landed damage and kills (x fair, 1 = a fifth), over every build it was in.
  const ab = {};
  for (const r of rows) {
    const st = r.tag.split(':')[2];
    const tot = Object.values(r.landed).reduce((a, v) => a + v, 0) || 1;
    const ktot = r.weapons.reduce((a, w) => a + ((r.killsBy || {})[w] || 0), 0) || 1;
    for (const w of r.weapons) {
      const a = ((ab[w] = ab[w] || {})[st] = ab[w][st] || { share: [], kshare: [], dealt: [] });
      a.share.push((r.landed[w] || 0) / tot * 5); a.kshare.push(((r.killsBy || {})[w] || 0) / ktot * 5); a.dealt.push(r.landed[w] || 0);
    }
  }
  console.log('\nability            damage share x fair (9:00 / 14:00 / 20:00)     kill share x fair');
  for (const w of Object.keys(ab).sort()) {
    const f = (k, key) => ab[w][k] ? mean(ab[w][k][key]).toFixed(2) : '  - ';
    console.log(w.padEnd(19) + ['s3', 's4', 's5'].map((k) => f(k, 'share')).join('  ').padStart(30) + ['s3', 's4', 's5'].map((k) => f(k, 'kshare')).join('  ').padStart(30));
  }
}

(async () => {
  if (process.argv[2] === '--report') { report(process.argv.slice(3).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).rows)); return; }
  const SETS = +env('SETS', 6), STAGES = env('STAGES', 's3,s4,s5').split(',');
  let s = 4242;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const pick = (pool, n) => { const bag = pool.slice(), out = []; while (out.length < n) out.push(bag.splice(Math.floor(rnd() * bag.length), 1)[0]); return out; };
  const jobs = [];
  /* MODE=passives: what each passive is worth. Mixed builds with all nine,
     then the same builds with one taken away, for each of the nine. */
  if (env('MODE', '') === 'passives') {
    const builds = Array.from({ length: SETS }, () => pick(ALL, 5));
    for (const drop of ['', ...Object.keys(CAPS)]) for (const st of STAGES) builds.forEach((b, i) => {
      const pp = {};
      for (const id of Object.keys(CAPS)) if (id !== drop) pp[id] = Math.max(1, Math.round(CAPS[id] * STAGE[st].frac));
      jobs.push({ tag: `loo:${drop || 'all'}:${st}:${i}`, w: b.map((w) => w + ':' + STAGE[st].rank), pp, stage: st });
    });
  }
  for (const kind of env('MODE', '') === 'passives' ? [] : Object.keys(KINDS)) {
    const builds = Array.from({ length: SETS }, () => pick(KINDS[kind] || ALL, 5));
    for (const set of Object.keys(SETS_OF)) for (const st of STAGES) builds.forEach((b, i) => {
      const pp = {};
      for (const id of SETS_OF[set](kind)) pp[id] = Math.max(1, Math.round(CAPS[id] * STAGE[st].frac));
      jobs.push({ tag: `${kind}:${set}:${st}:${i}`, w: b.map((w) => w + ':' + STAGE[st].rank), pp, stage: st });
    });
  }
  const SH = +env('SHARDS', os.cpus().length);
  const outs = [];
  console.error(`${jobs.length} builds over ${SH} shards per stage`);
  // meter-test takes one stage (time, level) per run, so each stage is its own batch.
  for (const st of STAGES) {
    const tmp = path.join(os.tmpdir(), `build-jobs-${process.pid}-${st}.json`);
    fs.writeFileSync(tmp, JSON.stringify(jobs.filter((j) => j.stage === st)));
    await Promise.all(Array.from({ length: SH }, (_, i) => new Promise((resolve) => {
      const out = path.join(os.tmpdir(), `build-${process.pid}-${st}-${i}.json`);
      outs.push(out);
      const ch = spawn(process.execPath, [path.join(__dirname, 'meter-test.js')], {
        env: { ...process.env, JOBS: tmp, SHARD: `${i + 1}/${SH}`, OUT: out, STAGE: st }, stdio: ['ignore', 'ignore', 'inherit'] });
      ch.on('close', resolve);
    })));
  }
  const rows = outs.flatMap((f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).rows : []));
  if (env('OUT', null)) fs.writeFileSync(env('OUT'), JSON.stringify({ SETS, STAGES, rows }));
  report(rows);
})();
