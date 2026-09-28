#!/usr/bin/env node
/* THE DRAFTER'S EYE, corrected by measurement.
 *
 * The drafter (draft.js) values a weapon card by WS.Weapon.reach, the game's
 * own crowd model. That model spreads the horde evenly over the field, so it
 * counts a 120px blast as touching one creature while every pierce of a bolt
 * finds a target: against what tools/rank-test.js measures on a real crowd
 * it rated Axe Gyre 17 to 39 times too low and piercing bolts about 5 times
 * too high. A bot drafting on that never ranked an area weapon, and every
 * survivor whose kit starts with one (Graveblade's Reaving Arc) looked
 * weaker than it is.
 *
 * This reads rank-test output (KIND=rank STAGES=s3,s5, the damage landed
 * on real waves; or KIND=aux, dummies, if that is all there is) and writes
 * tools/bot/reach-calibration.json: per weapon, measured / modelled at rank
 * 5 (b) and evolved (e), normalised so the geometric mean is 1 and damped
 * by DAMP. botlab.js hands it to the drafter, which multiplies the model's
 * number by it.
 *
 *   KIND=rank STAGES=s3,s5 OUT=r.json node tools/rank-test.js
 *   node tools/bot/calibrate.js r.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const all = process.argv.slice(2).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).rows);
  const test = { s3: {}, s5: {} };
  // Preferred: rank jobs' damage LANDED on the real waves of that minute
  // (KIND=rank STAGES=s3,s5). Immortal dummies flatter anything that stands
  // in a crowd: an aura never runs out of targets on a ring that cannot die.
  for (const r of all) if (r.kind === 'rank' && r.landed > 0 && test[r.stage]) test[r.stage][r.name] = r.landed;
  // Else aux rows: each zeroes one passive; the stage's own number is the
  // highest of a weapon's "min" rows (the passive that touches it least).
  if (!Object.keys(test.s3).length) {
    for (const r of all) {
      if (r.kind !== 'aux' || r.at !== 'min') continue;
      test[r.stage][r.name] = Math.max(test[r.stage][r.name] || 0, r.crowd);
    }
  }
  /* How far to trust the measurement over the model: 1 is all the way. It
     is 0.5, half way in log terms, because damage is not the whole of a
     card's worth - a weapon that has to be stood next to its crowd to land
     its damage costs health a bolt from range does not, and a drafter fully
     corrected for damage alone builds for melee and dies more. */
  const DAMP = +(process.env.DAMP || 0.5);
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage();
  await page.goto('file://' + path.resolve(__dirname, '..', '..', 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Weapon && WS.Weapons);
  const model = await page.evaluate(() => {
    const out = {};
    for (const id of Object.keys(WS.Weapons)) {
      if (WS.Weapons[id].isUnion) continue;
      const a = WS.Weapon.reach(id, 5, false, 25, null), e = WS.Weapon.reach(id, 8, true, 40, null);
      out[id] = { s3: a ? a.dps : 0, s5: e ? e.dps : 0 };
    }
    return out;
  });
  await b.close();
  const raw = {};
  for (const id of Object.keys(model)) {
    const bb = test.s3[id] && model[id].s3 ? test.s3[id] / model[id].s3 : null;
    const ee = test.s5[id] && model[id].s5 ? test.s5[id] / model[id].s5 : null;
    if (bb > 0 && ee > 0 && isFinite(bb) && isFinite(ee)) raw[id] = { b: bb, e: ee };
    else console.log('skipped ' + id, test.s3[id], model[id], test.s5[id]);
  }
  const gm = (k) => Math.exp(Object.values(raw).reduce((s, v) => s + Math.log(v[k]), 0) / Object.keys(raw).length);
  const gb = gm('b'), ge = gm('e');
  const out = {};
  for (const [id, v] of Object.entries(raw)) out[id] = { b: +Math.pow(v.b / gb, DAMP).toFixed(3), e: +Math.pow(v.e / ge, DAMP).toFixed(3) };
  const file = path.join(__dirname, 'reach-calibration.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  for (const [id, v] of Object.entries(out)) console.log(id.padEnd(16), String(v.b).padStart(7), String(v.e).padStart(7));
  console.log('wrote ' + file);
})();
