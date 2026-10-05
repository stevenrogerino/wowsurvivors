#!/usr/bin/env node
/* WHAT ARRIVES AT EACH BOSS. From bot nights (tools/botlab.js OUT=, TRACE=10):
 * for every scheduled boss, the build that met it (level, weapons and ranks,
 * damage a second over the minute before), how long the boss lived and what
 * it took off the survivor while it was up. This is the "projected build" a
 * boss is tuned against: a boss that dies in seven seconds to the median
 * build never gets to use its mechanics, and one that only kills a build
 * that stopped moving is not a fight.
 *
 *   node tools/boss-snapshots.js night-a.json night-b.json ...
 *   OUT=tools/bot/boss-snapshots.json node tools/boss-snapshots.js ...
 */
'use strict';
const fs = require('fs');
const files = process.argv.slice(2).filter((f) => f.endsWith('.json'));
const q = (a, p) => { const v = a.slice().sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : null; };
const bosses = {}, snaps = [];
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!d.runs) continue;
  const S = d.S || {};
  for (const r of d.runs) {
    if (!r.trace) continue;
    const C = r.trace.cols, open = {};
    const hpAt = (t) => { let best = null; for (const row of r.trace.rows) if (row[0] <= t) best = row; return best; };
    for (const e of r.trace.ev) {
      if (e[1] === 'boss') open[e[2]] = e;
      if (e[1] !== 'slain' || !open[e[2]]) continue;
      const sp = open[e[2]]; delete open[e[2]];
      const minute = Math.round(sp[0] / 60);
      const cur = (r.curve || []).filter((c) => c[0] <= Math.ceil(sp[0] / 60));
      const c1 = cur[cur.length - 1], c0 = cur[cur.length - 2];
      // Health lost while the boss was up, as a share of max (trace windows).
      let lost = 0;
      for (const row of r.trace.rows) if (row[0] > sp[0] && row[0] <= e[0] + 10) lost += row[C.indexOf('lost')];
      const b = (bosses[e[2] + '@' + minute] = bosses[e[2] + '@' + minute] || { boss: e[2], minute, hp: sp[3], life: [], lost: [], level: [], dps: [] });
      b.life.push(e[3]); b.lost.push(lost);
      if (c1) b.level.push(c1[2]);
      if (c1 && c0) b.dps.push(Math.round((c1[4] - c0[4]) / 60));
      snaps.push({ map: S.MAP, diff: S.DIFF, hyper: !!S.HYPER, tides: !!S.TIDES, style: (S.DRAFT_OPTS && S.DRAFT_OPTS.style) || 'minmax',
        hero: r.hero, boss: e[2], at: sp[0], hp: sp[3], life: e[3], lostPct: Math.round(lost), level: c1 ? c1[2] : null,
        dps: c1 && c0 ? Math.round((c1[4] - c0[4]) / 60) : null, weapons: c1 ? c1[6] : null });
    }
  }
}
const rows = Object.values(bosses).sort((a, b) => a.minute - b.minute || a.boss.localeCompare(b.boss));
console.log('boss                  at    n   health   life med/p90   lost while up med/p90   level   build dps med');
for (const b of rows) console.log(b.boss.padEnd(20) + `${b.minute}m`.padStart(5) + String(b.life.length).padStart(5) + String(b.hp).padStart(9)
  + `${q(b.life, 0.5)}s / ${q(b.life, 0.9)}s`.padStart(15) + `${q(b.lost, 0.5)}% / ${q(b.lost, 0.9)}%`.padStart(23) + String(q(b.level, 0.5)).padStart(8) + String(q(b.dps, 0.5)).padStart(16));
/* The fights themselves, where the night recorded them (tools/botlab.js
   books every blow taken while a scheduled boss is up, split by whether the
   boss dealt it - body, charge, its marks, its bolts - or the horde). */
const fights = {};
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const r of d.runs || []) for (const x of r.fights || []) {
    const k = x.id + '@' + Math.round(x.at / 60);
    const b = (fights[k] = fights[k] || { id: x.id, minute: Math.round(x.at / 60), life: [], boss: [], horde: [], mark: [], contact: [], enr: 0, n: 0 });
    if (x.life === null) continue;   // the night ended with it up
    b.n++; b.life.push(x.life); if (x.enraged) b.enr++;
    const L = x.lost || {};
    const own = Object.entries(L).filter(([k2]) => k2 !== 'horde').reduce((a, [, v]) => a + v, 0);
    b.boss.push(own); b.horde.push(L.horde || 0); b.mark.push(L.mark || 0); b.contact.push((L.contact || 0) + (L.charge || 0));
  }
}
const frows = Object.values(fights).sort((a, b) => a.minute - b.minute || a.id.localeCompare(b.id));
if (frows.length) {
  console.log('\nfights (share of max health, median / p90)        n   life      from boss      its marks   body+charge     horde    phase 2');
  for (const b of frows) console.log(b.id.padEnd(20) + `${b.minute}m`.padStart(5) + String(b.n).padStart(24) + `${q(b.life, 0.5)}s`.padStart(7)
    + `${q(b.boss, 0.5)}/${q(b.boss, 0.9)}%`.padStart(14) + `${q(b.mark, 0.5)}/${q(b.mark, 0.9)}%`.padStart(13)
    + `${q(b.contact, 0.5)}/${q(b.contact, 0.9)}%`.padStart(14) + `${q(b.horde, 0.5)}/${q(b.horde, 0.9)}%`.padStart(10)
    + `${Math.round(b.enr / Math.max(1, b.n) * 100)}%`.padStart(10));
}
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ made: new Date().toISOString(), sources: files.map((f) => f.split('/').pop()), bosses: rows.map((b) => ({ boss: b.boss, minute: b.minute, n: b.life.length, health: b.hp, lifeMedian: q(b.life, 0.5), lifeP90: q(b.life, 0.9), lostMedian: q(b.lost, 0.5), lostP90: q(b.lost, 0.9), levelMedian: q(b.level, 0.5), dpsMedian: q(b.dps, 0.5) })), snapshots: snaps }));
