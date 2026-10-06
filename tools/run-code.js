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
const asBuilds = args.includes('--builds');
/* --diff=professional --char=hunter --map=dustreach --bal=3v60cf keep only
   the nights that match; --builds prints each night's final weapons as a
   FIXED= line for tools/meter-test.js and tools/swap-test.js. */
const FILTER = {};
for (const a of args) { const m = /^--(diff|char|map|bal)=(.+)$/.exec(a); if (m) FILTER[m[1]] = m[2]; }
const inputs = args.filter((a) => !a.startsWith('--'));
// The hourglass's freeze, read from the game's own settings.
const FREEZE = (() => {
  try { const m = /hourglassFreeze:\s*([\d.]+)/.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'config.js'), 'utf8')); return m ? +m[1] : 8; }
  catch (e) { return 8; }
})();
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
/* Version 5 (runlog.js): card types as one letter, a pick as its place in
   the hand, the build's changes as diffs, slices as \`f\` with dt and q
   figures, meters as per-minute q rows against key lists. Read back into the
   shape of version 4. */
const TYPE = { s: 'stat', n: 'new_weapon', r: 'weapon_rank', e: 'evolve', u: 'union', g: 'gold', b: 'bread',
  p: 'breaking_point', B: 'blessing' };
const deq = (x) => (x ? Math.floor(x / 10) * 10 ** (x % 10) : 0);
const untok = (t) => { t = String(t); const i = t.indexOf(':'); return i < 0 ? t : (TYPE[t.slice(0, i)] || t.slice(0, i)) + t.slice(i); };
const unhand = (h) => String(h || '').split(',').filter(Boolean).map(untok).join(',');
function fromV5(L) {
  const kitOf = (s) => Object.fromEntries(String(s || '').split(',').filter(Boolean).map((x) => { const i = x.indexOf(':'); return i < 0 ? [x, '1'] : [x.slice(0, i), x.slice(i + 1)]; }));
  const kitStr = (m) => Object.entries(m).filter(([, v]) => v !== '0').map(([k, v]) => k + ':' + v).join(',');
  const cur = { w: {}, u: {}, d: {}, b: {} };
  for (const e of L.ev) {
    const k = e[1];
    if (k === 'kit') { cur.w = kitOf(e[2]); cur.u = kitOf(e[3]); cur.b = kitOf(e[4]); }
    else if (k === 'pick') {
      const hand = unhand(e[3]);
      e[3] = hand;
      e[2] = typeof e[2] === 'number' ? hand.split(',')[e[2]] : untok(e[2]);
      const [type, id] = String(e[2]).split(':');
      if (type === 'stat') cur.u[id] = String((+cur.u[id] || 0) + 1);
    } else if (k === 'boffer' || k === 'reroll') e[2] = unhand(e[2]);
    else if (k === 'bpick' || k === 'banish') {
      e[2] = untok(e[2]);
      if (k === 'bpick') cur.b[String(e[2]).split(':')[1]] = '1';
    } else if (k === 'kw' || k === 'ku' || k === 'kd' || k === 'kb') {
      const part = k[1], m = cur[part];
      for (const [id, v] of Object.entries(kitOf(e[2]))) { if (v === '0') delete m[id]; else m[id] = v; }
      e[2] = part === 'd' || part === 'b' ? Object.keys(m).join(',') : kitStr(m);
    }
  }
  const F = L.f || {}, t = [];
  let at = 0;
  for (const d of F.dt || []) t.push((at += d));
  L.s5 = { t, hp: F.hp || [], field: F.field || [], near: F.near || [], dealt: (F.dealt || []).map(deq),
    taken: (F.taken || []).map(deq), heal: (F.heal || []).map(deq), kills: F.kills || [], mv: F.mv || [], still: F.still || [] };
  // Meters: per-minute rows back into running totals.
  const run = [{}, {}, {}];
  L.m = (L.m || []).map((row) => [row[0], ...[0, 1, 2].map((i) => {
    (row[i + 1] || []).forEach((v, j) => { const key = L.mk[i][j]; run[i][key] = (run[i][key] || 0) + deq(v); });
    return Object.assign({}, run[i]);
  })]);
  const E = L.end || {}, lastRow = L.m[L.m.length - 1];
  if (lastRow && E.landed) { lastRow[1] = E.landed; lastRow[2] = E.heals || lastRow[2]; }
  L.s = { t: [], x: [], y: [] };
}
function normalise(L) {
  /* Pickups counted by the minute (runlog.js TALLY) come back as events,
     spread across their minute, so every reader below sees one shape. */
  if (L.tally) {
    for (const [what, kinds] of Object.entries(L.tally)) {
      for (const [kind, row] of Object.entries(kinds)) {
        row.forEach((n, m) => { for (let i = 0; i < n; i++) L.ev.push([m * 60 + (i + 0.5) * 60 / n, what, kind]); });
      }
    }
    L.ev.sort((a, b) => a[0] - b[0]);
  }
  if (L.v >= 5) fromV5(L);
  else if (L.v >= 2) {
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
  if (F.mv && F.mv.length) {
    say('\nMOVEMENT');
    const dist = 8 * F.mv.reduce((a, b) => a + b, 0), still = F.still.reduce((a, b) => a + b, 0);
    const box = E.box || [0, 0, 0, 0];
    say(`  walked ${fmt(dist)}px, ${Math.round(dist / Math.max(1, end))}px/s on average · still ${pct(still, end)} of the time · ranged over ${fmt(box[2] - box[0])} x ${fmt(box[3] - box[1])}px`);
    const near = F.near.reduce((a, b) => a + b, 0) / nf;
    const crowd = F.near.filter((v) => v >= 30).length;
    say(`  ${near.toFixed(0)} creatures within 320px on average · in a crowd of 30+ for ${pct(crowd, nf)} of the night · field peaked at ${Math.max(...F.field)}`);
  } else if (n > 2) {
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
  // Of the nights a card was taken in, how many reached dawn.
  const dawn = (L) => L.end && (L.end.reason === 'victory' || (L.end.time || 0) >= 1800 || L.end.finale);
  const tookIn = {}, tookWon = {};
  for (const L of logs) {
    const mine = new Set(L.ev.filter((e) => e[1] === 'pick').map((e) => e[2]));
    for (const c of mine) { tookIn[c] = (tookIn[c] || 0) + 1; if (dawn(L)) tookWon[c] = (tookWon[c] || 0) + 1; }
  }
  const rows = Object.keys(offered).filter((k) => offered[k] >= 3).map((k) => [k, (taken[k] || 0) / offered[k], offered[k]]).sort((a, b) => b[1] - a[1]);
  say(`  ${pad('', 34)} ${pad('taken', 14)} reached dawn when taken`);
  for (const [k, r, o] of rows) say(`  ${pad(k, 34)} ${pad((r * 100).toFixed(0) + '% of ' + o, 14)} ${tookIn[k] ? pct(tookWon[k] || 0, tookIn[k]) + ' of ' + tookIn[k] : '-'}`);

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

  /* The share of the meter by how many weapons were evolved at the time:
     a lone evolved weapon takes the meter whatever it is (docs/BALANCE.md),
     so only stretches with two or more evolved say anything about balance. */
  say('\nWEAPON SHARE BY HOW MANY WEAPONS WERE EVOLVED (landed, pooled over 10s windows)');
  const states = ['none', 'one', 'two+'], pool = {};
  for (const L of logs) {
    const kits = L.ev.filter((e) => e[1] === 'kw' || e[1] === 'kit').map((e) => [e[0], e[2] || '']);
    const evolvedAt = (t) => { let w = ''; for (const [kt, kw] of kits) if (kt <= t) w = kw; return w.split(',').filter((x) => /e$/.test(x)).length; };
    for (let i = 1; i < L.m.length; i++) {
      const [t0, a] = L.m[i - 1], [t1, b] = L.m[i];
      const ne = evolvedAt(t1), st = states[Math.min(2, ne)];
      let tot = 0; const d = {};
      for (const [k, v] of Object.entries(b)) { const x = v - (a[k] || 0); if (x > 0) { d[k] = x; tot += x; } }
      if (!tot) continue;
      for (const [k, x] of Object.entries(d)) {
        const P2 = pool[k] || (pool[k] = { none: [0, 0], one: [0, 0], 'two+': [0, 0] });
        P2[st][0] += x;
      }
      for (const k of Object.keys(d)) pool[k][st][1] += tot;
    }
  }
  say(`  ${pad('', 22)} ${states.map((s2) => pad(s2 + ' evolved', 14)).join('')}`);
  for (const [k, P2] of Object.entries(pool).sort((x, y) => (y[1]['two+'][0] + y[1].one[0]) - (x[1]['two+'][0] + x[1].one[0])).slice(0, 24))
    say(`  ${pad(k, 22)} ${states.map((s2) => pad(P2[s2][1] ? (100 * P2[s2][0] / P2[s2][1]).toFixed(0) + '%' : '-', 14)).join('')}`);

  say('\nSUMMONS: SHARE OF WHAT LANDED, AND HOW THE NIGHTS WENT WITH AND WITHOUT THEM');
  const SUM = ['wolves', 'ghouls', 'ghoul_rot'];
  const groups = { with: [], without: [] };
  for (const L of logs) {
    const last = L.m[L.m.length - 1]; if (!last) continue;
    const tot = Object.values(last[1]).reduce((x, y) => x + y, 0) || 1;
    const sum = SUM.reduce((x, k) => x + (last[1][k] || 0), 0);
    const F = L.s5 || { hp: [] }, nf = (F.hp || []).length || 1;
    const E = L.end || {};
    (sum > 0 ? groups.with : groups.without).push({ share: sum / tot, parts: SUM.map((k) => (last[1][k] || 0) / tot),
      low: (F.hp || []).filter((h) => h < 30).length / nf, tpm: (E.taken || 0) / Math.max(1, (E.time || 1) / 60), dawn: dawn(L) });
  }
  const avg = (a, f) => (a.length ? a.reduce((x, y) => x + f(y), 0) / a.length : 0);
  if (groups.with.length) say(`  with summons (${groups.with.length}): ${(100 * avg(groups.with, (g) => g.share)).toFixed(0)}% of the meter`
    + ` (wolves ${(100 * avg(groups.with, (g) => g.parts[0])).toFixed(0)}%, ghouls ${(100 * avg(groups.with, (g) => g.parts[1])).toFixed(0)}%, rot ${(100 * avg(groups.with, (g) => g.parts[2])).toFixed(0)}%)`);
  for (const [name, g] of Object.entries(groups)) if (g.length)
    say(`  ${pad(name, 8)} ${pad(g.length + ' nights', 10)} below 30% health ${(100 * avg(g, (x) => x.low)).toFixed(0)}% of the time · taken ${fmt(avg(g, (x) => x.tpm))}/min · reached dawn ${pct(g.filter((x) => x.dawn).length, g.length)}`);

  /* Drops by stretch: put on the field (drop) and picked up (got), per
     minute and per 1,000 kills, and the seconds the hourglasses froze. */
  say('\nPICKUPS BY STRETCH OF THE NIGHT: dropped / picked up per minute, dropped per 1,000 kills');
  const kinds = ['bomb', 'hourglass', 'potion', 'chest', 'reliquary', 'stone'];
  const buckets = [[0, 300], [300, 600], [600, 900], [900, 1200], [1200, 1500], [1500, 1800]];
  const killsIn = (L, a, b) => { const F = L.s5 || {}; let n = 0; (F.t || []).forEach((t, i) => { if (t > a && t <= b) n += (F.kills || [])[i] || 0; }); return n; };
  say('  ' + pad('', 11) + buckets.map(([a, b]) => pad(mmss(a) + '-' + mmss(b), 20)).join(''));
  const mins = buckets.map(([a, b]) => logs.reduce((x, L) => { const end = (L.end && L.end.time) || 0; return x + (end > a ? (Math.min(end, b) - a) / 60 : 0); }, 0));
  const kills = buckets.map(([a, b]) => logs.reduce((x, L) => x + killsIn(L, a, b), 0));
  for (const k of kinds) {
    const cells = buckets.map(([a, b], i) => {
      const cnt = (kind) => logs.reduce((x, L) => x + L.ev.filter((e) => e[1] === kind && e[2] === k && e[0] >= a && e[0] < b).length, 0);
      const dr = cnt('drop'), gt = cnt('got');
      if (!mins[i]) return '-';
      return `${(dr / mins[i]).toFixed(2)}/${(gt / mins[i]).toFixed(2)}` + (kills[i] ? ` ${(1000 * dr / kills[i]).toFixed(2)}` : '');
    });
    if (cells.some((c) => c !== '-' && !/^0\.00\/0\.00/.test(c))) say('  ' + pad(k, 11) + cells.map((c) => pad(c, 20)).join(''));
  }
  say('  ' + pad('frozen s/min', 11) + buckets.map(([a, b], i) => pad(mins[i] ? (FREEZE * logs.reduce((x, L) => x + L.ev.filter((e) => e[1] === 'got' && e[2] === 'hourglass' && e[0] >= a && e[0] < b).length, 0) / mins[i]).toFixed(1) : '-', 20)).join(''));
  say('  ' + pad('kills/min', 11) + buckets.map((_, i) => pad(mins[i] ? fmt(kills[i] / mins[i]) : '-', 20)).join(''));

  // Late screen-clears by luck: the top third of nights by luck against the bottom.
  const late = logs.filter((L) => L.end && (L.end.time || 0) > 900 && L.end.luck).sort((a, b) => a.end.luck - b.end.luck);
  if (late.length >= 6) {
    const third = Math.floor(late.length / 3);
    const rate = (set) => { let n = 0, m = 0; for (const L of set) { m += ((L.end.time || 0) - 900) / 60; n += L.ev.filter((e) => e[1] === 'drop' && e[2] === 'bomb' && e[0] >= 900).length; } return m ? n / m : 0; };
    const lo = rate(late.slice(0, third)), hi = rate(late.slice(-third));
    say(`  bombs dropped per minute after 15:00: lowest-luck third ${lo.toFixed(2)}, highest ${hi.toFixed(2)} (x${lo ? (hi / lo).toFixed(2) : '-'})`);
  }
  return out.join('\n');
}

/* ------------------------------------------------------------- main --- */
const codes = gather();
if (!codes.length) { console.error('no run codes found (they start with EW1. or EW0.)'); process.exit(1); }
const logs = [];
for (const c of codes) { try { logs.push(decode(c)); } catch (e) { console.error(`could not read a code (${c.slice(0, 16)}...): ${e.message}`); } }
const kept = logs.filter((L) => Object.entries(FILTER).every(([k, v]) => String(L[k]) === v));
if (kept.length < logs.length) console.error(`${logs.length - kept.length} of ${logs.length} nights left out by the filter`);
logs.length = 0; logs.push(...kept);
if (!logs.length) { console.error('no nights match'); process.exit(1); }
if (asJson) { console.log(JSON.stringify(logs.length === 1 ? logs[0] : logs, null, 1)); process.exit(0); }
if (asBuilds) {
  for (const L of logs) {
    const w = (L.end && L.end.kit && L.end.kit.w) || '';
    const fixed = w.split(',').filter(Boolean).map((x) => x.replace(/e$/, 'E')).join(',');
    console.log(`FIXED=${fixed} HERO=${L.char}   # ${L.map} ${L.diff} ${L.end ? L.end.reason + ' ' + mmss(L.end.time || 0) : ''}`);
  }
  process.exit(0);
}
if (logs.length === 1) console.log(readOne(logs[0]));
else { console.log(readMany(logs)); }
