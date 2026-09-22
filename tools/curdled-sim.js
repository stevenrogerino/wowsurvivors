#!/usr/bin/env node
/* Curdled Light, measured the way Section Q measured weapons: a fixed
 * scenario, not a full RNG'd run.
 *
 * archetype-sim.js tried to answer "is a bigger radius/faster interval
 * better" by playing whole 30-minute runs, and the answer was noise - a tiny
 * config nudge can tip one borderline level-up choice, and that choice
 * compounds over 30 minutes into a wildly different run. Curdled Light isn't
 * a weapon, but it CAN be driven deterministically: it converts healing
 * income into a damage pool with no combat and no RNG involved (see
 * Player.applyHeal / Player.desecrate), so a build here declares a fixed
 * regen income and a curdleShare instead of a weapon list, and
 * sim-core.js's runBuild turns that on before the clock starts.
 *
 * curdleOverheal is identical for every class (1.00, granted by Blood Rite
 * and by Graveblade's own perk alike) - the only asymmetric lever is
 * curdleShare, which only reads from healing that LANDS. So every build
 * below starts the survivor with enormous headroom below a huge max health:
 * every tick of regen lands as a real heal for the whole run, none of it is
 * wasted as overheal, and the comparison is clean.
 *
 *   dummy     72 stationary, undying targets in rings out to 480px. Answers
 *             "how much damage does this do", the same question tools/sim.js
 *             asks weapons with it. Rewards a bigger radius without limit,
 *             because nothing here can be overkilled - useful for a raw
 *             throughput number, not for judging coverage.
 *   gauntlet  282 killable arrivals over 90s, the survivor on the written
 *             movement circuit, ZERO weapons equipped. Every kill and every
 *             point of damage is Curdled Light alone - this is where a
 *             bigger radius or faster interval either does or doesn't
 *             matter against a real, thinning crowd.
 *
 *   node tools/curdled-sim.js
 *   node tools/curdled-sim.js --json out.json
 */
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const CORE = require('./sim-core.js');
const CORE_PATH = path.join(__dirname, 'sim-core.js');

const DUMMY_SECONDS = CORE.SECONDS.dummy;
const GAUNTLET_SECONDS = CORE.SECONDS.gauntlet;

/* One representative healing income: Graveblade's own innate regen (2.0/s)
 * plus what a couple of ranks of Recovery/Vitality or a healing weapon might
 * plausibly add. Not a maximum, not a minimum - a build that invested some
 * but not all of its picks into sustain. */
const REGEN = 8;

const SHARES = [
  { label: 'baseline (Blood Rite alone, share=0.25)', share: 0.25 },
  { label: 'graveblade (Blood Rite + class perk, share=0.45)', share: 0.45 },
];

/* What's actually shipped right now, plus the candidates from the earlier
 * (inconclusive) archetype-sim pass, plus the blunt-instrument coefficient
 * lever held in reserve. */
const CONFIGS = [
  { label: 'shipped (r140, i0.50, c1.00)', radius: 140, interval: 0.50, coeff: 1.00 },
  { label: 'pre-buff (r110, i0.50, c1.00)', radius: 110, interval: 0.50, coeff: 1.00 },
  { label: 'interval 0.35', radius: 140, interval: 0.35, coeff: 1.00 },
  { label: 'coefficient 1.15', radius: 140, interval: 0.50, coeff: 1.15 },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const errs = [];

  const fresh = async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => window.WS && window.WS.Game);
    await page.addScriptTag({ path: CORE_PATH });
    await page.evaluate(() => {
      if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
      WS.Save.db.seenManual = true;
      WS.Save.unlockAll();
      window.__sim = (build, scenario, script, seconds) =>
        window.WSSim.runBuild(WS, build, scenario, script, seconds);
    });
    return page;
  };

  const gauntletScript = CORE.gauntletScript();
  const results = [];

  for (const cfg of CONFIGS) {
    for (const sh of SHARES) {
      const build = { name: cfg.label + ' / ' + sh.label, weapons: [],
        curdled: { share: sh.share, regen: REGEN } };

      const runOnce = async (scenario, script, seconds) => {
        const pg = await fresh();
        await pg.evaluate(([r, i, c]) => {
          WS.Config.curdleRadius = r;
          WS.Config.curdleInterval = i;
          WS.Config.curdleCoefficient = c;
        }, [cfg.radius, cfg.interval, cfg.coeff]);
        const r = await pg.evaluate(([b, s, n, k]) => window.__sim(b, k, s, n),
          [build, script, seconds, scenario]);
        await pg.close();
        return r;
      };

      const dummy = await runOnce('dummy', [], DUMMY_SECONDS);
      const gaunt = await runOnce('gauntlet', gauntletScript, GAUNTLET_SECONDS);

      results.push({
        config: cfg.label, share: sh.label, regen: REGEN,
        dummyDps: (dummy.byWeapon.curdled || 0) / DUMMY_SECONDS,
        gauntletDamage: gaunt.byWeapon.curdled || 0,
        gauntletKills: gaunt.kills,
        gauntletLeaked: gaunt.leaked,
      });
      process.stderr.write('.');
    }
  }
  process.stderr.write('\n');
  await browser.close();
  if (errs.length) console.error('page errors:\n  ' + errs.slice(0, 5).join('\n  '));

  console.log(`\nregen income: ${REGEN}/s, fully landed (no overheal) - isolates curdleShare.`);
  console.log(`dummy: ${DUMMY_SECONDS}s vs 72 undying targets. gauntlet: ${gauntletScript.length}`
    + ` killable arrivals over ${GAUNTLET_SECONDS}s, zero weapons equipped.\n`);
  console.log('  ' + 'config / share'.padEnd(58) + 'dummy dps'.padStart(11)
    + 'gaunt dmg'.padStart(11) + 'gaunt kills'.padStart(13) + 'gaunt left'.padStart(12));
  for (const r of results) {
    console.log('  ' + (r.config + ' / ' + r.share).padEnd(58)
      + r.dummyDps.toFixed(1).padStart(11)
      + r.gauntletDamage.toFixed(0).padStart(11)
      + String(r.gauntletKills).padStart(13)
      + String(r.gauntletLeaked).padStart(12));
  }

  if (process.argv.includes('--json')) {
    const out = process.argv[process.argv.indexOf('--json') + 1];
    fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), regen: REGEN, results }, null, 1));
    console.log('\nwrote ' + out);
  }
})();
