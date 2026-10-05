#!/usr/bin/env node
/* What a set of bot nights (tools/botlab.js OUT=, TRACE=10) says about the
 * shape of a night, beyond who reached dawn:
 *
 *   by stretch   health lost and healed a minute (share of max), potions,
 *                level, creatures alive, kills a minute
 *   sustain      where the healing came from (potions vs everything else)
 *   power        the level curve, and when the first weapon evolved
 *   deaths       when nights end, and how fast the bar fell before it
 *   picks        how often each weapon was carried at the end, its mean
 *                rank, and how often it was evolved
 *
 *   node tools/study-nights.js a.json b.json ...
 *   GROUP=style node tools/study-nights.js ...   (group by the drafting style)
 */
'use strict';
const fs = require('fs');
const files = process.argv.slice(2).filter((f) => f.endsWith('.json'));
const runs = files.flatMap((f) => { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return d.runs.map((r) => Object.assign(r, { _S: d.S, _file: f })); });
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const pct = (v) => `${Math.round(v * 100)}%`;
const groupBy = process.env.GROUP || null;
const groups = {};
for (const r of runs) {
  const o = r._S.DRAFT_OPTS || {};
  const k = groupBy === 'style' ? (o.style || 'minmax') + (o.rushPassives === false ? ' (no passives)' : '')
    : groupBy === 'file' ? r._file.split('/').pop() : groupBy === 'hero' ? r.hero : 'all';
  (groups[k] = groups[k] || []).push(r);
}
for (const [g, rs] of Object.entries(groups)) {
  console.log(`\n=== ${g}: ${rs.length} nights, dawn ${rs.filter((r) => r.dawn).length}/${rs.length}, mean ${(mean(rs.map((r) => r.t)) / 60).toFixed(1)}m`);
  // By stretch, from the 10s trace.
  const B = 5, stretches = 6;
  const acc = Array.from({ length: stretches }, () => ({ lost: [], healed: [], alive: [], kills: [], level: [], low: [] }));
  for (const r of rs) {
    if (!r.trace) continue;
    const C = r.trace.cols, ix = (n) => C.indexOf(n);
    for (const row of r.trace.rows) {
      const s = Math.min(stretches - 1, Math.floor((row[0] - 1) / (B * 60)));
      acc[s].lost.push(row[ix('lost')] * 6); acc[s].healed.push(row[ix('healed')] * 6);
      acc[s].alive.push(row[ix('alive')]); acc[s].kills.push(row[ix('kills')] * 6); acc[s].level.push(row[ix('level')]);
      acc[s].low.push(row[ix('hpMin')] < 30 ? 1 : 0);
    }
  }
  console.log('  stretch     lost/min  healed/min  under 30%  alive  kills/min  level');
  acc.forEach((a, i) => {
    if (!a.lost.length) return;
    console.log(`  ${String(i * B).padStart(2)}-${String((i + 1) * B).padStart(2)}m  ` + `${Math.round(mean(a.lost))}%`.padStart(9) + `${Math.round(mean(a.healed))}%`.padStart(12)
      + pct(mean(a.low)).padStart(11) + String(Math.round(mean(a.alive))).padStart(7) + String(Math.round(mean(a.kills))).padStart(11) + String(Math.round(mean(a.level))).padStart(7));
  });
  // Sustain: what healed.
  const heal = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.healBy || {})) heal[k] = (heal[k] || 0) + v;
  const ht = Object.values(heal).reduce((a, v) => a + v, 0) || 1;
  console.log('  healing by source: ' + Object.entries(heal).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => `${k} ${pct(v / ht)}`).join(', ')
    + `; potions a night ${mean(rs.map((r) => r.potions)).toFixed(0)}`);
  // Power: first evolution, level at 10/20 minutes.
  const firstEvo = [], lvl = { 5: [], 10: [], 15: [], 20: [], 25: [] };
  for (const r of rs) {
    let fe = null;
    for (const c of r.curve || []) {
      if (lvl[c[0]]) lvl[c[0]].push(c[2]);
      if (fe === null && Object.values(c[6] || {}).some((v) => String(v).endsWith('E'))) fe = c[0];
    }
    if (fe !== null) firstEvo.push(fe);
  }
  console.log(`  level at 5/10/15/20/25m: ${Object.values(lvl).map((a) => a.length ? Math.round(mean(a)) : '-').join(' / ')}`
    + `; first evolution at ${firstEvo.length ? mean(firstEvo).toFixed(1) + 'm' : '-'} (${firstEvo.length}/${rs.length} nights)`);
  // Deaths: when, and the fall.
  const dead = rs.filter((r) => r.dead);
  if (dead.length) console.log(`  deaths at: ${dead.map((r) => (r.t / 60).toFixed(1) + 'm').sort().join(', ')}`);
  // Picks.
  const carried = {};
  for (const r of rs) for (const w of r.weapons || []) {
    const [id, lv] = w.split(':');
    const c = (carried[id] = carried[id] || { n: 0, rank: 0, evo: 0 });
    c.n++; c.rank += parseInt(lv); if (lv.endsWith('E')) c.evo++;
  }
  console.log('  carried at the end (nights, mean rank, evolved): ' + Object.entries(carried).sort((a, b) => b[1].n - a[1].n)
    .map(([id, c]) => `${id} ${c.n} r${(c.rank / c.n).toFixed(1)} e${c.evo}`).join(' · '));
  // Pick rate when offered (Slay the Spire's first number), by card.
  const off = {};
  for (const r of rs) for (const pk of r.picks || []) {
    if (!pk[3]) continue;
    for (const c of pk[3]) {
      const o = (off[c] = off[c] || { offered: 0, picked: 0 });
      o.offered++;
      if (c === pk[1] + ':' + pk[2]) o.picked++;
    }
  }
  const list = Object.entries(off).filter(([, o]) => o.offered >= 10).map(([k, o]) => [k, o.picked / o.offered, o.offered]);
  if (list.length) {
    list.sort((a, b) => b[1] - a[1]);
    const fmt = (x) => `${x[0]} ${Math.round(x[1] * 100)}% of ${x[2]}`;
    console.log('  pick rate when offered, highest: ' + list.slice(0, 12).map(fmt).join(' · '));
    console.log('  pick rate when offered, lowest:  ' + list.slice(-12).reverse().map(fmt).join(' · '));
    if (process.env.PICKS_OUT) fs.writeFileSync(process.env.PICKS_OUT, JSON.stringify(list));
  }
}
