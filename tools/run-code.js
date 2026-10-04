#!/usr/bin/env node
/* Reads run codes: the "Copy run code" line from the end of a night
 * (src/game/runlog.js), one or a pile of them.
 *
 *   node tools/run-code.js EW1.xxxx              one night, read out in full
 *   node tools/run-code.js codes.txt more.txt    every code in the files
 *   node tools/run-code.js codes/                every code in every file there
 *   node tools/run-code.js --json EW1.xxxx       the decoded record itself
 *   pbpaste | node tools/run-code.js -           codes on stdin
 *
 * One code gives the night: what was offered and taken and when, the build
 * as it grew, each boss and how long it stood, the damage meter as it moved,
 * what healed and what hurt, how low it got, how the survivor moved and how
 * close to the crowd, and every bomb and hourglass. Several give the pooled
 * view balance is decided on: how often each card is taken when offered,
 * each weapon's share of the meter in the builds that held it, what kills
 * people and when, and screen-clear pickups by minute of the night. Codes
 * from different tunings are grouped by their balance fingerprint. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const inputs = args.filter((a) => a !== '--json');
if (!inputs.length) { console.error('usage: node tools/run-code.js [--json] <code | file | folder | ->...'); process.exit(1); }

/* ----------------------------------------------------------- reading -- */
const CODE = /EW[01]\.[A-Za-z0-9_-]+/g;
function gather() {
  const texts = [];
  for (const a of inputs) {
    if (a === '-') texts.push(fs.readFileSync(0, 'utf8'));
    else if (/^EW[01]\./.test(a)) texts.push(a);
    else if (fs.existsSync(a) && fs.statSync(a).isDirectory()) {
      for (const f of fs.readdirSync(a)) { const p = path.join(a, f); if (fs.statSync(p).isFile()) texts.push(fs.readFileSync(p, 'utf8')); }
    } else if (fs.existsSync(a)) texts.push(fs.readFileSync(a, 'utf8'));
    else console.error(`skipped ${a}: not a code, a file or a folder`);
  }
  return [...new Set(texts.flatMap((t) => t.match(CODE) || []))];
}
function decode(code) {
  const body = Buffer.from(code.slice(4).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const json = code[2] === '1' ? zlib.inflateRawSync(body).toString('utf8') : body.toString('utf8');
  return normalise(JSON.parse(json));
}
/** Every version of the record, read into one shape: positions as absolute
 *  8px cells every second (s.t, s.x, s.y) and the slower figures in s5. */
function normalise(L) {
  if (L.v >= 2) {
    let x = 0, y = 0;
    L.s.x = L.s.dx.map((d) => (x += d)); L.s.y = L.s.dy.map((d) => (y += d));
  } else {
    L.s5 = { t: L.s.t, hp: L.s.hp, lv: L.s.lv, field: L.s.field, near: L.s.near, dealt: L.s.dealt, taken: L.s.taken, heal: L.s.heal };
  }
  return L;
}

/* ----------------------------------------------------------- helpers -- */
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + '%' : '-');
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n)));
const card = (tok) => { const [type, id] = String(tok).split(':'); return { type, id: id || type }; };
const pad = (s, n) => String(s).padEnd(n);
const kitMap = (s) => Object.fromEntries((s || '').split(',').filter(Boolean).map((x) => { const [id, v] = x.split(':'); return [id, v || '1']; }));

/** Damage dealt per source between two meter snapshots. */
function window(m, from, to) {
  const at = (t) => m.filter((s) => s[0] <= t).pop() || [0, {}, {}, {}];
  const a = at(from), b = at(to), out = {};
  for (const [k, v] of Object.entries(b[1])) { const d = v - (a[1][k] || 0); if (d > 0) out[k] = d; }
  return out;
}
const share = (o) => { const tot = Object.values(o).reduce((x, y) => x + y, 0); return Object.entries(o).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, v / (tot || 1), v]); };

/* ------------------------------------------------------- one night ---- */
function readOne(L) {
  const E = L.end || {};
  const out = [];
  const say = (s = '') => out.push(s);
  say(`${L.char} on ${L.map} · ${L.diff}${L.hyper ? ' · Hyper' : ''}${L.tides ? ' · Tides' : ''}${L.oaths && L.oaths.length ? ' · oaths ' + L.oaths.join(',') : ''}${L.nightly ? ' · Nightly ' + L.nightly : ''}`);
  say(`played ${L.at} on ${L.plat} · balance ${L.bal} · seed ${L.seed}`);
  say(`${E.reason || 'unfinished'} at ${mmss(E.time || 0)} · level ${E.level} · ${fmt(E.kills || 0)} kills · score ${fmt(E.score || 0)}`
    + (E.killedBy ? ` · killed by ${E.killedBy.name} (${E.killedBy.hit})` : ''));
  say(`dealt ${fmt(E.dealt || 0)} · taken ${fmt(E.taken || 0)} · healed ${fmt(E.healed || 0)} · prevented ${fmt(E.prevented || 0)} · max health ${E.maxHealth}`);
  if (E.frames) say(`frames p50 ${E.frames.p50}ms p90 ${E.frames.p90}ms p99 ${E.frames.p99}ms · faults ${E.faults || 0}`);

  say('\nTHE BUILD, AS IT GREW');
  let prevW = {}, prevU = {}, hand = null;
  for (const e of L.ev) {
    const [t, k, a, b] = e;
    if (k === 'offer') { hand = a; continue; }
    if (k === 'pick') { const h = b || hand; say(`  ${mmss(t)}  took ${a}${h ? '   (from ' + h + ')' : ''}`); hand = null; }
    else if (k === 'reroll') say(`  ${mmss(t)}  rerolled ${a}`);
    else if (k === 'banish') say(`  ${mmss(t)}  banished ${a}`);
    else if (k === 'boffer') say(`  ${mmss(t)}  blessings offered ${a}`);
    else if (k === 'bpick') say(`  ${mmss(t)}  blessing ${a}`);
    else if (k === 'kw') {
      const now = kitMap(a);
      for (const [id, v] of Object.entries(now)) if (prevW[id] !== v && v.endsWith('e') && !(prevW[id] || '').endsWith('e')) say(`  ${mmss(t)}  ${id} evolved`);
      for (const id of Object.keys(now)) if (!prevW[id] && id.startsWith('union_')) say(`  ${mmss(t)}  forged ${id}`);
      prevW = now;
    } else if (k === 'ku') prevU = kitMap(a);
    else if (k === 'kd') say(`  ${mmss(t)}  discoveries now ${a || 'none'}`);
    else if (k === 'kit') prevW = kitMap(a);
  }
  if (E.kit) say(`  final weapons ${E.kit.w}\n  final passives ${E.kit.u}\n  discoveries ${E.kit.d || 'none'} · blessings ${E.kit.b}`);

  say('\nBOSSES');
  const fell = L.ev.filter((e) => e[1] === 'fell');
  for (const e of L.ev.filter((x) => x[1] === 'boss')) {
    const f = fell.find((x) => x[2] === e[2] && x[0] >= e[0]);
    say(`  ${mmss(e[0])}  ${pad(e[2], 26)} ${fmt(e[3])} hp  ${f ? 'fell after ' + Math.round(f[0] - e[0]) + 's' : 'not slain'}`);
  }
  const fin = L.ev.filter((e) => e[1] === 'finale').map((e) => `${mmss(e[0])} ${e[2]}`);
  if (fin.length) say(`  finale: ${fin.join(' > ')}`);

  say('\nDAMAGE METER, BY STRETCH OF THE NIGHT');
  const end = E.time || (L.s.t[L.s.t.length - 1] || 0);
  for (const [a, b] of [[0, 300], [300, 600], [600, 900], [900, 1200], [1200, 1500], [1500, 1800], [1800, 1e9]]) {
    if (a >= end) break;
    const sh = share(window(L.m, a, b)).slice(0, 6);
    if (sh.length) say(`  ${pad(mmss(a) + '-' + (b > 1e8 ? 'end' : mmss(b)), 12)} ${sh.map(([k, s]) => `${k} ${(s * 100).toFixed(0)}%`).join(' · ')}`);
  }
  const last = L.m[L.m.length - 1] || [0, {}, {}, {}];
  say('  whole night: ' + share(last[1]).slice(0, 8).map(([k, s, v]) => `${k} ${(s * 100).toFixed(0)}% (${fmt(v)})`).join(' · '));
  say('\nHEALING  ' + (share(last[2]).slice(0, 6).map(([k, s, v]) => `${k} ${fmt(v)}`).join(' · ') || 'none'));
  say('HURT BY  ' + (share(L.taken || {}).slice(0, 8).map(([k, s, v]) => `${k} ${fmt(v)}`).join(' · ') || 'nothing'));

  const S = L.s, n = S.t.length, F = L.s5 || {}, nf = (F.t || []).length;
  if (nf > 2) {
    say('\nDANGER');
    const step = nf > 1 ? (F.t[nf - 1] - F.t[0]) / (nf - 1) : 5;
    const low = F.hp.filter((h) => h < 30).length;
    const min = Math.min(...F.hp), at = F.t[F.hp.indexOf(min)];
    say(`  below 30% health for about ${Math.round(low * step)}s (${pct(low, nf)} of the night) · lowest ${min}% around ${mmss(at)}`);
    const hits = L.ev.filter((e) => e[1] === 'hit');
    if (hits.length) say(`  ${hits.length} heavy blows: ` + hits.slice(-8).map((e) => `${mmss(e[0])} ${e[2]} ${e[3]} (left ${e[4]}%)`).join(' · '));
  }
  if (n > 2) {
    say('\nMOVEMENT');
    let dist = 0, still = 0;
    for (let i = 1; i < n; i++) {
      const gap = Math.max(1, S.t[i] - S.t[i - 1]);
      const d = 8 * Math.hypot(S.x[i] - S.x[i - 1], S.y[i] - S.y[i - 1]);
      dist += d; if (d / gap < 20) still++;
    }
    const spanX = 8 * (Math.max(...S.x) - Math.min(...S.x)), spanY = 8 * (Math.max(...S.y) - Math.min(...S.y));
    say(`  walked ${fmt(dist)}px, ${Math.round(dist / Math.max(1, end))}px/s on average · still ${pct(still, n)} of the time · ranged over ${fmt(spanX)} x ${fmt(spanY)}px`);
    if (nf) {
      const near = F.near.reduce((a, b) => a + b, 0) / nf;
      const crowd = F.near.filter((v) => v >= 30).length;
      say(`  ${near.toFixed(0)} creatures within 320px on average · in a crowd of 30+ for ${pct(crowd, nf)} of the night · field peaked at ${Math.max(...F.field)}`);
    }
  }

  const got = {};
  for (const e of L.ev.filter((x) => x[1] === 'got')) (got[e[2]] = got[e[2]] || []).push(e[0]);
  if (Object.keys(got).length) {
    say('\nPICKED UP');
    for (const [k, ts] of Object.entries(got)) say(`  ${pad(k, 11)} ${pad(ts.length, 4)} ${ts.slice(0, 14).map(mmss).join(' ')}${ts.length > 14 ? ' ...' : ''}`);
  }
  return out.join('\n');
}

/* ------------------------------------------------------- many nights --- */
function readMany(logs) {
  const out = [];
  const say = (s = '') => out.push(s);
  const byBal = {};
  for (const L of logs) (byBal[L.bal] = byBal[L.bal] || []).push(L);
  say(`${logs.length} nights · balance fingerprints: ${Object.entries(byBal).map(([k, v]) => `${k} (${v.length})`).join(', ')}`);
  if (Object.keys(byBal).length > 1) say('  (mixed tunings below; run a folder per fingerprint to keep them apart)');

  say('\nNIGHTS');
  for (const L of logs) { const E = L.end || {};
    say(`  ${pad(L.char, 11)} ${pad(L.map, 12)} ${pad(L.diff, 12)} ${pad(E.reason || '?', 9)} ${pad(mmss(E.time || 0), 6)} lv ${pad(E.level, 3)} ${E.killedBy ? 'by ' + E.killedBy.name : ''}`); }

  say('\nCARDS: TAKEN WHEN OFFERED');
  const offered = {}, taken = {};
  for (const L of logs) {
    for (const e of L.ev) {
      if (e[1] !== 'pick' || !e[3]) continue;
      for (const c of e[3].split(',')) offered[c] = (offered[c] || 0) + 1;
      taken[e[2]] = (taken[e[2]] || 0) + 1;
    }
  }
  const rows = Object.keys(offered).filter((k) => offered[k] >= 3).map((k) => [k, (taken[k] || 0) / offered[k], offered[k]]).sort((a, b) => b[1] - a[1]);
  for (const [k, r, o] of rows) say(`  ${pad(k, 34)} ${pad((r * 100).toFixed(0) + '%', 5)} of ${o}`);

  say('\nWEAPON SHARE OF THE METER, IN THE NIGHTS THAT HELD IT');
  const sh = {};
  for (const L of logs) { const last = L.m[L.m.length - 1]; if (!last) continue;
    for (const [k, s] of share(last[1])) (sh[k] = sh[k] || []).push(s); }
  for (const [k, v] of Object.entries(sh).sort((a, b) => b[1].reduce((x, y) => x + y, 0) / b[1].length - a[1].reduce((x, y) => x + y, 0) / a[1].length))
    say(`  ${pad(k, 22)} ${pad((100 * v.reduce((x, y) => x + y, 0) / v.length).toFixed(0) + '%', 5)} over ${v.length} nights`);

  say('\nWHAT ENDS NIGHTS');
  const deaths = {};
  for (const L of logs) { const E = L.end || {}; if (E.reason !== 'defeated') continue;
    const k = E.killedBy ? E.killedBy.name : 'unknown'; (deaths[k] = deaths[k] || []).push(E.time || 0); }
  for (const [k, ts] of Object.entries(deaths).sort((a, b) => b[1].length - a[1].length))
    say(`  ${pad(k, 28)} ${pad(ts.length, 3)} at ${ts.map(mmss).join(', ')}`);

  say('\nSCREEN-CLEARS AND OTHER PICKUPS, PER MINUTE, BY STRETCH OF THE NIGHT');
  const kinds = ['bomb', 'hourglass', 'potion', 'chest', 'reliquary', 'stone'];
  const buckets = [[0, 300], [300, 600], [600, 900], [900, 1200], [1200, 1500], [1500, 1800]];
  say('  ' + pad('', 11) + buckets.map(([a, b]) => pad(mmss(a) + '-' + mmss(b), 11)).join(''));
  for (const k of kinds) {
    const cells = buckets.map(([a, b]) => {
      let n = 0, mins = 0;
      for (const L of logs) { const end = (L.end && L.end.time) || 0; if (end <= a) continue;
        mins += (Math.min(end, b) - a) / 60; n += L.ev.filter((e) => e[1] === 'got' && e[2] === k && e[0] >= a && e[0] < b).length; }
      return mins ? (n / mins).toFixed(2) : '-';
    });
    if (cells.some((c) => c !== '-' && c !== '0.00')) say('  ' + pad(k, 11) + cells.map((c) => pad(c, 11)).join(''));
  }
  return out.join('\n');
}

/* ------------------------------------------------------------- main --- */
const codes = gather();
if (!codes.length) { console.error('no run codes found (they start with EW1. or EW0.)'); process.exit(1); }
const logs = [];
for (const c of codes) { try { logs.push(decode(c)); } catch (e) { console.error(`could not read a code (${c.slice(0, 16)}...): ${e.message}`); } }
if (asJson) { console.log(JSON.stringify(logs.length === 1 ? logs[0] : logs, null, 1)); process.exit(0); }
if (logs.length === 1) console.log(readOne(logs[0]));
else { console.log(readMany(logs)); }
