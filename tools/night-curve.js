#!/usr/bin/env node
/* THE SHAPE OF A NIGHT, from tools/botlab.js timelines (TRACE=10).
 *
 * A night should breathe. Stretches at the edge of the seat, where the horde
 * presses in and health goes, should give way to stretches where the build
 * has outrun it and everything dies at the edge of the screen, and then the
 * night should catch up again. Good drafting and good drops can keep a
 * survivor ahead for most of a night; bad ones can keep them behind. What
 * should never happen is a night that is flat (ahead from the third minute
 * to dawn, or behind the whole way) or one that goes from easy to dead in
 * a single step.
 *
 * Every 10s window gets an intensity from 0 to 1, led by what the health
 * bar did, because that is what a player feels whatever they are holding:
 *
 *   hurt    health lost in the window, as a share of max (12% or more is 1)
 *   low     how low the bar went in it (40% or under is 1, full is 0)
 *   crowd   creatures standing within 250px, on average (15 or more is 1)
 *
 *   intensity = 0.55 hurt + 0.30 low + 0.15 crowd
 *
 * Where creatures die is recorded but not scored: an aura or a gyre kills
 * everything close by design, and counting that as pressure read a
 * comfortable melee night as a desperate one.
 *
 * and a mood: EDGE at 0.30 and over, AHEAD at 0.06 and under, even between.
 * Windows are smoothed over 30s before they are read, so one stray bolt is
 * not a swing. A WAVE is a return to the edge after at least a minute ahead.
 *
 *   node tools/night-curve.js a.json b.json ...        summary per battlefield
 *   HTML=/tmp/curve.html node tools/night-curve.js ... and a heat strip per run
 */
'use strict';
const fs = require('fs');

const files = process.argv.slice(2).filter((f) => f.endsWith('.json'));
if (!files.length) { console.log('usage: node tools/night-curve.js run.json ...'); process.exit(1); }

const EDGE = 0.30, AHEAD = 0.06;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function score(row, c) {
  const hurt = clamp01(row[c.lost] / 12);
  const low = clamp01((100 - row[c.hpMin]) / 60);
  const crowd = clamp01(row[c.near] / 15);
  return 0.55 * hurt + 0.30 * low + 0.15 * crowd;
}

function analyse(run) {
  const T = run.trace;
  if (!T || !T.rows.length) return null;
  const c = Object.fromEntries(T.cols.map((k, i) => [k, i]));
  const raw = T.rows.map((r) => score(r, c));
  const sm = raw.map((_, i) => {
    const a = raw.slice(Math.max(0, i - 1), i + 2);
    return a.reduce((s, v) => s + v, 0) / a.length;
  });
  const mood = sm.map((v) => (v >= EDGE ? 'E' : v <= AHEAD ? 'A' : '-'));
  // Waves: a return to the edge after at least six windows (a minute) ahead.
  let waves = 0, aheadRun = 0, longestAhead = 0, longestEdge = 0, edgeRun = 0, primed = false;
  let firstAhead = -1;
  for (let i = 0; i < mood.length; i++) {
    if (mood[i] === 'A') { aheadRun++; if (aheadRun >= 6) primed = true; if (firstAhead < 0 && aheadRun >= 6) firstAhead = T.rows[i - 5][c.t]; }
    else aheadRun = 0;
    if (mood[i] === 'E') { edgeRun++; if (primed) { waves++; primed = false; } } else edgeRun = 0;
    longestAhead = Math.max(longestAhead, aheadRun);
    longestEdge = Math.max(longestEdge, edgeRun);
  }
  // How the end came: a death after a spell at the edge was fought for; a
  // death straight out of a stretch ahead was a wall.
  let ending = run.dawn ? 'dawn' : 'died';
  if (!run.dawn) {
    const tail = mood.slice(-7, -1);
    ending = tail.filter((m) => m === 'E').length >= 2 ? 'died fighting' : 'died from ahead';
  }
  return { raw, sm, mood, waves, longestAhead: longestAhead * 10, longestEdge: longestEdge * 10, firstAhead,
    edge: mood.filter((m) => m === 'E').length / mood.length, ahead: mood.filter((m) => m === 'A').length / mood.length,
    ending, rows: T.rows, cols: c, ev: T.ev };
}

const groups = new Map();
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  const key = `${data.S.MAP} · ${data.S.DIFF}${data.S.HYPER ? ' Hyper' : ''}`;
  if (!groups.has(key)) groups.set(key, []);
  for (const r of data.runs) {
    const a = analyse(r);
    if (a) groups.get(key).push({ run: r, a });
  }
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const pct = (v) => Math.round(v * 100) + '%';
const mm = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

for (const [key, rs] of groups) {
  console.log(`\n${key} · ${rs.length} nights`);
  const dawn = rs.filter((x) => x.run.dawn).length;
  console.log(`  dawn ${dawn}/${rs.length}   mean ${(mean(rs.map((x) => x.run.t)) / 60).toFixed(1)}m   `
    + `edge ${pct(mean(rs.map((x) => x.a.edge)))}   ahead ${pct(mean(rs.map((x) => x.a.ahead)))}   `
    + `waves ${mean(rs.map((x) => x.a.waves)).toFixed(1)}   longest ahead ${mm(mean(rs.map((x) => x.a.longestAhead)))}`);
  const ends = {};
  for (const x of rs) ends[x.a.ending] = (ends[x.a.ending] || 0) + 1;
  console.log('  endings: ' + Object.entries(ends).map(([k, v]) => `${k} ${v}`).join(', '));
  // Intensity by five-minute stretch, over the runs still alive in it.
  const by5 = [];
  for (let s = 0; s < 6; s++) {
    const vals = [];
    for (const x of rs) {
      x.a.rows.forEach((row, i) => { if (row[x.a.cols.t] > s * 300 && row[x.a.cols.t] <= (s + 1) * 300) vals.push(x.a.sm[i]); });
    }
    by5.push(vals.length ? mean(vals).toFixed(2) : '  - ');
  }
  console.log('  intensity by 5 min: ' + by5.join('  '));
  // Per survivor, one line: minutes, mood strip at a minute a character.
  for (const x of rs.sort((a, b) => a.run.hero.localeCompare(b.run.hero) || a.run.seed - b.run.seed)) {
    const strip = [];
    for (let i = 0; i < x.a.mood.length; i += 6) {
      const m = x.a.mood.slice(i, i + 6);
      const e = m.filter((v) => v === 'E').length, a = m.filter((v) => v === 'A').length;
      strip.push(e >= 3 ? '#' : e >= 1 ? '+' : a >= 5 ? '.' : '-');
    }
    console.log(`  ${x.run.hero.padEnd(10)} ${String(x.run.seed).padStart(5)} ${(x.run.t / 60).toFixed(1).padStart(5)}m lvl ${String(x.run.level).padStart(3)}  `
      + `${strip.join('').padEnd(31)} waves ${x.a.waves}  ${x.a.ending}`);
  }
}
console.log('\n  strip: one character a minute. # at the edge most of it, + some of it, - even, . ahead the whole minute');

if (process.env.HTML) {
  const rows = [];
  for (const [key, rs] of groups) {
    rows.push(`<h2>${key}</h2>`);
    for (const x of rs) {
      const cells = x.a.sm.map((v, i) => {
        const r = x.a.rows[i], c = x.a.cols;
        const h = 210 - 210 * clamp01(v / 0.7);
        return `<i style="background:hsl(${h.toFixed(0)} 70% ${(30 + 25 * clamp01(v / 0.7)).toFixed(0)}%)" title="${mm(r[c.t])} i=${v.toFixed(2)} hp ${r[c.hp]}% lost ${r[c.lost]}% near ${r[c.near]} kill@${r[c.killDist]}px lvl ${r[c.level]}"></i>`;
      }).join('');
      rows.push(`<div class="r"><b>${x.run.hero} ${x.run.seed}</b>${cells}<span>${x.run.dawn ? 'dawn' : mm(x.run.t)}</span></div>`);
    }
  }
  fs.writeFileSync(process.env.HTML, `<!doctype html><meta charset="utf-8"><title>Night curves</title><style>
body{background:#111;color:#ddd;font:12px system-ui;margin:16px} h2{font-size:14px;margin:18px 0 6px}
.r{display:flex;align-items:center;height:12px;margin:1px 0} .r b{width:130px;font-weight:400;flex:none}
.r i{width:5px;height:12px;flex:none} .r span{margin-left:6px;color:#999}</style>${rows.join('\n')}`);
  console.log('wrote ' + process.env.HTML);
}
