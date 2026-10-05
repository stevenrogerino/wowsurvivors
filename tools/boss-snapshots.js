#!/usr/bin/env node
/* WHAT ARRIVES AT EACH BOSS. From bot nights (tools/botlab.js OUT=, TRACE=10):
 * for every scheduled boss, the build that met it (level, weapons and ranks,
 * damage a second over the minute before), how long the boss lived and what
 * it took off the survivor while it was up. This is the "projected build" a
 * boss is tuned against: a boss that dies in seven seconds to the median
 * build never gets to use its mechanics, and one that only kills a build
 * that stopped moving is not a fight. It also lists every build that reached
 * the 30:00 finale (finaleBuilds): level, weapons, damage a second, health.
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
// The build that reaches the finale: every night still standing at 30:00.
const finale = [];
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!d.runs) continue;
  const S = d.S || {};
  for (const r of d.runs) {
    const cur = (r.curve || []).filter((c) => c[0] <= 30), c1 = cur[cur.length - 1], c0 = cur[cur.length - 2];
    if (!r.dawn || !c1 || c1[0] < 29) continue;
    finale.push({ map: S.MAP, diff: S.DIFF, hyper: !!S.HYPER, style: (S.DRAFT_OPTS && S.DRAFT_OPTS.style) || 'minmax', hero: r.hero,
      level: c1[2], dps: c0 ? Math.round((c1[4] - c0[4]) / 60) : null, weapons: c1[6], maxHp: r.maxHp, armor: r.armor });
  }
}
if (finale.length) {
  console.log(`\nreaching the finale: ${finale.length} nights; level median ${q(finale.map((x) => x.level), 0.5)}, build dps median ${q(finale.map((x) => x.dps), 0.5)} (p10 ${q(finale.map((x) => x.dps), 0.1)}, p90 ${q(finale.map((x) => x.dps), 0.9)}), max health median ${q(finale.map((x) => x.maxHp), 0.5)}`);
}
const rows = Object.values(bosses).sort((a, b) => a.minute - b.minute || a.boss.localeCompare(b.boss));
console.log('boss                  at    n   health   life med/p90   lost while up med/p90   level   build dps med');
for (const b of rows) console.log(b.boss.padEnd(20) + `${b.minute}m`.padStart(5) + String(b.life.length).padStart(5) + String(b.hp).padStart(9)
  + `${q(b.life, 0.5)}s / ${q(b.life, 0.9)}s`.padStart(15) + `${q(b.lost, 0.5)}% / ${q(b.lost, 0.9)}%`.padStart(23) + String(q(b.level, 0.5)).padStart(8) + String(q(b.dps, 0.5)).padStart(16));
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ made: new Date().toISOString(), sources: files.map((f) => f.split('/').pop()), finaleBuilds: finale, bosses: rows.map((b) => ({ boss: b.boss, minute: b.minute, n: b.life.length, health: b.hp, lifeMedian: q(b.life, 0.5), lifeP90: q(b.life, 0.9), lostMedian: q(b.lost, 0.5), lostP90: q(b.lost, 0.9), levelMedian: q(b.level, 0.5), dpsMedian: q(b.dps, 0.5) })), snapshots: snaps }));
