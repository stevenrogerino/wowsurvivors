#!/usr/bin/env node
/* Every damage source's share of the meter across full bot nights
 * (tools/botlab.js OUT files): what a player's meter would show, night after
 * night. This is how Skybreak was found - a median 61% of the meter once it
 * evolved, across 475 nights - after every solo test had passed it.
 *
 *   node tools/bot-share.js a.json b.json ...
 *   MIN=900 (default): only nights that reached 15:00
 *   CAP=0.35 (default): names any evolved weapon whose median share is over
 *   it, for tools/swap-test.js to judge */
'use strict';
const fs = require('fs');
const MIN = +(process.env.MIN || 900), CAP = +(process.env.CAP || 0.35);
const src = {};
let nights = 0;
for (const f of process.argv.slice(2)) {
  for (const r of JSON.parse(fs.readFileSync(f, 'utf8')).runs) {
    if (r.t < MIN) continue;
    const tot = Object.values(r.byWeapon).reduce((a, b) => a + b, 0);
    if (!tot) continue;
    nights++;
    const evolved = new Set((r.weapons || []).filter((w) => w.endsWith('E')).map((w) => w.split(':')[0]));
    for (const [k, v] of Object.entries(r.byWeapon)) {
      const s = src[k] = src[k] || { n: 0, all: [], evo: [] };
      s.n++; s.all.push(v / tot); if (evolved.has(k)) s.evo.push(v / tot);
    }
  }
}
const q = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)]; };
const pc = (v) => (isNaN(v) ? '-' : Math.round(v * 100) + '%');
console.log(`${nights} nights that reached ${Math.floor(MIN / 60)}:00\n`);
console.log('source               nights   median   90th pct   median evolved');
const rows = Object.entries(src).filter(([, s]) => s.n >= 5)
  .sort((a, b) => (q(b[1].evo, 0.5) || q(b[1].all, 0.5)) - (q(a[1].evo, 0.5) || q(a[1].all, 0.5)));
for (const [k, s] of rows) {
  console.log(k.padEnd(20), String(s.n).padStart(6), pc(q(s.all, 0.5)).padStart(8), pc(q(s.all, 0.9)).padStart(10),
    (s.evo.length ? pc(q(s.evo, 0.5)) + ` (${s.evo.length})` : '-').padStart(16));
}
const over = rows.filter(([, s]) => s.evo.length >= 5 && q(s.evo, 0.5) > CAP);
/* Not a gate: whatever evolves first beside low-rank weapons leads the
   meter, whichever weapon it is, so a high median here says "look", not
   "too strong". tools/swap-test.js answers it: the same builds, the weapon
   swapped for others. */
if (over.length) {
  console.log(`\nlook: median share once evolved over ${pc(CAP)}: ` + over.map(([k, s]) => `${k} ${pc(q(s.evo, 0.5))}`).join(', '));
  console.log('check each with tools/swap-test.js (WEAPON=id) before calling it strong');
  console.log('SWAP ' + over.map(([k]) => k).join(' '));
} else console.log(`\nok: no evolved weapon's median share over ${pc(CAP)}`);
