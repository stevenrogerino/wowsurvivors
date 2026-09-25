#!/usr/bin/env node
/* The training ground: run a build against a fixed scenario and write down
 * what it did.
 *
 * The point of this is comparison, and comparison is the hard part. An
 * ordinary run cannot do it: a stronger build kills faster, so it meets a
 * thinner field, collects different gems, levels at different times and ends
 * up somewhere else on the map. Two runs of two builds are not two
 * measurements of the same thing - they are two different afternoons. Earlier
 * in this project I compared builds that way and reported a performance cliff
 * that did not exist, off runs that had 123 and 314 creatures on the field.
 *
 * So everything the build does not control is nailed down:
 *
 *   spawns    A written script - id, time and place - replayed identically
 *             for every build. The wave director never runs.
 *   movement  A written circuit, driven by setting the same four keys the
 *             player's own fingers set. Position is an input here, not an
 *             outcome, because position decides what a weapon can reach.
 *   levels    Suppressed. The build under test is the build declared, at the
 *             ranks declared, for the whole run. A level-up mid-measurement
 *             would be the scenario choosing the build.
 *   dice      One seed, set before each run.
 *
 * What is left over is the build. Two scenarios ask it different questions:
 *
 *   dummy     One target that cannot die or move, at a range most weapons can
 *             work at. Answers "how much damage does this do", with no credit
 *             for killing things quickly and no penalty for missing.
 *   gauntlet  The written script, arriving whether or not you can cope.
 *             Answers "what does this build let through, and what does it
 *             cost you", which is the question the dummy cannot ask.
 *
 *   node tools/sim.js                 the standard sweep
 *   node tools/sim.js --json out.json also write the numbers out
 */
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
/* One definition of every scenario, shared with the tuning bench. Two copies
   of a scenario are two scenarios, and they drift. */
const CORE = require('./sim-core.js');
const CORE_PATH = path.join(__dirname, 'sim-core.js');

/* ----------------------------------------------------------------- dice -- */
/** The same generator in the harness as in the game, so the spawn script is
 *  reproducible from its seed alone and does not have to be checked in. */
function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------- scenario -- */
const DUMMY_SECONDS = CORE.SECONDS.dummy;
const GAUNTLET_SECONDS = CORE.SECONDS.gauntlet;
const SIEGE_SECONDS = CORE.SECONDS.siege;
const CRUCIBLE_SECONDS = CORE.SECONDS.crucible;




/* ---------------------------------------------------------------- builds -- */
/** A build is a list of [weaponId, rank]. Everything else about the survivor
 *  is held the same, so the list is the whole difference between two rows. */
function buildTable(weapons, unions, combos, schools) {
  const builds = [];
  const r8 = (ids) => ids.map((id) => [id, 8]);

  /* Every weapon alone, at the rank you get it and at the rank you finish it.
     The pair is what says whether a weapon is weak or only early. */
  for (const id of weapons) {
    builds.push({ name: id + ' r1', weapons: [[id, 1]], group: 'rank' });
    builds.push({ name: id + ' r8', weapons: [[id, 8]], group: 'weapon' });
  }
  for (const u of unions) builds.push({ name: u + ' r8', weapons: [[u, 8]], group: 'union' });

  /* What is a SLOT worth? The same weapons, one more each time, so the curve
     is about how many you carry rather than which ones. */
  const ladder = ['umbral_bolt', 'seeking_motes', 'cinderfall',
    'rimeshard', 'arcweb', 'moonbrand'];
  for (let n = 1; n <= 6; n++) {
    builds.push({ name: n + (n > 1 ? ' slots' : ' slot'), group: 'slots',
      weapons: r8(ladder.slice(0, n)) });
  }

  /* One school, as far as it goes. A player who commits to a colour should be
     able to find out whether that was a plan or just tidy. */
  for (const sc of Object.keys(schools)) {
    const list = schools[sc].slice(0, 6);
    if (list.length < 3) continue;
    builds.push({ name: 'all ' + sc, group: 'school', weapons: r8(list) });
  }

  /* Each discovery as the two weapons that make it. */
  for (const c of combos) {
    builds.push({ name: 'pair: ' + c.name, group: 'pair', weapons: r8(c.weapons) });
  }

  const sixes = {
    'six: all holy': ['dawnpulse', 'hallowed_ring', 'judgement_disc',
      'seeking_motes', 'moonbrand', 'volley'],
    'six: spread': ['cinderfall', 'rimeshard', 'arcweb',
      'umbral_bolt', 'blightfield', 'knifestorm'],
    'six: melee-ish': ['axe_gyre', 'knifestorm', 'reaving_arc',
      'verdant_lance', 'blightfield', 'grave_tether'],
    'six: discoveries': ['rimeshard', 'cinderfall', 'umbral_bolt',
      'arcweb', 'axe_gyre', 'moonbrand'],
    'six: best clearers': ['seeking_motes', 'umbral_bolt', 'cinderfall',
      'moonbrand', 'arcweb', 'hallowed_ring'],
    'six: worst clearers': ['reaving_arc', 'judgement_disc', 'dawnpulse',
      'axe_gyre', 'blightfield', 'grave_tether'],
    'six: ground and orbit': ['blightfield', 'hallowed_ring', 'dawnpulse',
      'reaving_arc', 'axe_gyre', 'grave_tether'],
    'six: all bolts': ['seeking_motes', 'cinderfall', 'rimeshard',
      'umbral_bolt', 'moonbrand', 'volley'],
  };
  for (const name of Object.keys(sixes)) {
    builds.push({ name, group: 'six', weapons: r8(sixes[name]) });
  }
  /* And the same six with every one of them evolved: the difference between
     a finished build and a finished build that got its pairings too. */
  for (const name of Object.keys(sixes)) {
    builds.push({ name: name.replace('six:', 'evolved:'), group: 'evolved',
      weapons: r8(sixes[name]), evolved: true });
  }
  return builds;
}


/* ------------------------------------------------------------------ run -- */
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const errs = [];

  /* A FRESH PAGE PER MEASUREMENT.
   
     This used to run every build on one page, and builds leaked into each
     other: the same build measured three times in a row gave 1544, 1565 and
     1563 damage a second - not noise, because two runs of the whole sweep
     agree to the digit, but an order the sweep happens to take. Something a
     run leaves behind (the save's running statistics, an achievement check,
     the dice left wherever the previous build stopped them) was worth more
     than 1% to a neighbour, and a comparison is worth nothing if a build's
     score depends on what ran before it. A page costs under a second; being
     able to trust the table is worth more. */
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
  const page = await fresh();

  const roster = await page.evaluate(() => {
    const schools = {};
    for (const id of WS.WeaponOrder) {
      const sc = WS.Weapons[id].school;
      (schools[sc] = schools[sc] || []).push(id);
    }
    return {
      weapons: WS.WeaponOrder.slice(),
      unions: WS.Unions.map((u) => u.result),
      combos: WS.ComboOrder.map((id) => ({
        name: WS.Combos[id].name, weapons: WS.Combos[id].weapons.slice(),
      })),
      schools,
    };
  });
  let builds = buildTable(roster.weapons, roster.unions, roster.combos, roster.schools);
  /* --only <text> narrows the sweep to the builds whose name contains it, so
     tuning one weapon does not cost a full pass over forty-one. */
  const onlyAt = process.argv.indexOf('--only');
  if (onlyAt > 0) {
    const needle = process.argv[onlyAt + 1];
    // A comma list matches any of its parts: --only "iron_palms,union_rotwood"
    const needles = needle.split(',');
    builds = builds.filter((b) => needles.some((n) => b.name.includes(n)));
  }
  const script = CORE.gauntletScript();


  const siege = CORE.siegeScript();
  const crucible = CORE.crucibleScript();
  const results = [];
  for (const build of builds) {
    const once = async (scenario, sc, secs) => {
      const pg = await fresh();
      const r = await pg.evaluate(([b, s, n, k]) => window.__sim(b, k, s, n),
        [build, sc, secs, scenario]);
      await pg.close();
      return r;
    };
    const dummy = await once('dummy', [], DUMMY_SECONDS);
    const gaunt = await once('gauntlet', script, GAUNTLET_SECONDS);
    /* Only the builds the gauntlet cannot separate. It saturates at six
       weapons - every one of them clears 259 to 271 of 282 - so anything
       that size needs the harder scene to say anything at all. A rank-1
       single weapon against the siege is a number nobody needs. */
    const HARD = ['six', 'union', 'evolved', 'school'];
    const hard = HARD.includes(build.group)
      ? await once('siege', siege, SIEGE_SECONDS) : null;
    /* Only the builds the siege cannot separate either. */
    const worst = (build.group === 'evolved' || build.group === 'six')
      ? await once('crucible', crucible, CRUCIBLE_SECONDS) : null;
    results.push({
      name: build.name, group: build.group,
      build: build.weapons, evolved: !!build.evolved,
      dps: dummy.damage / DUMMY_SECONDS,
      kills: gaunt.kills,
      leaked: gaunt.leaked,
      taken: gaunt.taken,
      siege: hard && { kills: hard.kills, leaked: hard.leaked, taken: hard.taken },
      crucible: worst && { kills: worst.kills, leaked: worst.leaked, taken: worst.taken,
        survived: worst.survived, died: worst.died },
      byWeapon: gaunt.byWeapon,
    });
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  await browser.close();
  if (errs.length) console.error('page errors:\n  ' + errs.slice(0, 5).join('\n  '));

  const spawned = script.length;
  const show = (rows, title) => {
    if (!rows.length) return;
    const hard = rows.some((r) => r.siege);
    const worst = rows.some((r) => r.crucible);
    console.log('\n' + title);
    console.log('  ' + 'build'.padEnd(26) + 'dps'.padStart(9) + 'kills'.padStart(8)
      + 'left'.padStart(7) + 'taken'.padStart(9)
      + (hard ? 'siege:kills'.padStart(13) + 'left'.padStart(7) + 'taken'.padStart(9) : '')
      + (worst ? 'crucible'.padStart(12) + 'kills'.padStart(9) + 'taken'.padStart(9) : ''));
    for (const r of rows) {
      console.log('  ' + r.name.padEnd(26) + r.dps.toFixed(0).padStart(9)
        + String(r.kills).padStart(8) + String(r.leaked).padStart(7)
        + r.taken.toFixed(0).padStart(9)
        + (r.siege ? String(r.siege.kills).padStart(13) + String(r.siege.leaked).padStart(7)
          + r.siege.taken.toFixed(0).padStart(9) : '')
        + (r.crucible ? (r.crucible.died ? (r.crucible.survived + 's').padStart(12)
          : 'held'.padStart(12)) + String(r.crucible.kills).padStart(9)
          + r.crucible.taken.toFixed(0).padStart(9) : ''));
    }
  };
  console.log(`the gauntlet sends ${spawned} creatures over ${GAUNTLET_SECONDS}s,`
    + ` the siege ${siege.length} over ${SIEGE_SECONDS}s,`
    + ` the crucible ${crucible.length} with elites over ${CRUCIBLE_SECONDS}s;`
    + ` the dummy field is 72 targets that cannot die, for ${DUMMY_SECONDS}s`);
  const by = (g) => results.filter((r) => r.group === g).sort((a, b) => b.dps - a.dps);
  show(by('weapon'), 'one weapon, rank 8');
  show(by('slots'), 'what a slot is worth');
  show(by('school'), 'one school, as far as it goes');
  show(by('pair'), 'the two weapons behind each discovery');
  show(by('evolved'), 'six slots, everything evolved');
  show(by('union'), 'unions, rank 8');
  show(by('six'), 'six slots');
  show(by('rank'), 'one weapon, rank 1');

  /* The tuning bench reads this, so it is written every time rather than only
     when asked - a bench showing a table from three refactors ago is worse
     than a bench showing none. The build list goes with each row so the bench
     can load one back into its composer. */
  const payload = { spawned, when: new Date().toISOString(), results };
  /* Only a WHOLE sweep goes to the bench. A --only run is a couple of rows
     about one weapon, and writing those over the stored table would leave the
     bench showing a sweep that was never run. */
  if (onlyAt < 0) {
    fs.writeFileSync(path.join(__dirname, 'bench', 'sweep.json'),
      JSON.stringify(payload, null, 1));
  }
  if (process.argv.includes('--json')) {
    const out = process.argv[process.argv.indexOf('--json') + 1];
    fs.writeFileSync(out, JSON.stringify(payload, null, 1));
    console.log('\nwrote ' + out);
  }
})();
