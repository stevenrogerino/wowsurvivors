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
const DUMMY_SECONDS = 45;
const GAUNTLET_SECONDS = 90;
const SIEGE_SECONDS = 90;

/** Who arrives, when, and where. Written once, replayed for every build.
 *  The mix walks from fodder to elites the way a real run's does, but on a
 *  clock that does not care how fast anything dies. */
function gauntletScript() {
  const r = rng(0x5EED17);
  const out = [];
  const early = ['lampling', 'boar', 'gilkin'];
  const mid = ['ghoul', 'skeleton', 'bristlekin'];
  for (let t = 2; t < GAUNTLET_SECONDS; t += 1.5) {
    const wave = t < 30 ? early : t < 60 ? early.concat(mid) : mid;
    const n = 2 + Math.floor(t / 14);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = 430 + r() * 90;
      out.push({
        t,
        id: wave[Math.floor(r() * wave.length) % wave.length],
        x: 640 + Math.cos(a) * d,
        y: 360 + Math.sin(a) * d,
      });
    }
  }
  return out;
}

/** The gauntlet saturates. Every six-weapon build cleared 259 to 271 of its
 *  282 arrivals, which is four builds measured as one - a scenario that cannot
 *  tell its subjects apart is not measuring them. The siege is the same idea
 *  with the pressure a late run actually applies: three times the arrivals,
 *  and the creatures a late run actually sends. */
function siegeScript() {
  const r = rng(0xBADCAFE);
  const out = [];
  const late = ['ghoul', 'skeleton', 'bristlekin', 'abomination', 'crypt_fiend', 'raptor'];
  for (let t = 2; t < SIEGE_SECONDS; t += 0.8) {
    const n = 4 + Math.floor(t / 8);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = 430 + r() * 90;
      out.push({
        t,
        id: late[Math.floor(r() * late.length) % late.length],
        x: 640 + Math.cos(a) * d,
        y: 360 + Math.sin(a) * d,
      });
    }
  }
  return out;
}

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

/** Installed into every fresh page: the whole training ground. Each call
 *  sets the world up from scratch, and each measurement gets its own page,
 *  so one run cannot leak into the next. */
const INSTALL = () => {
  if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
  WS.Save.db.seenManual = true;
  WS.Save.unlockAll();

  /* The whole training ground, installed on the page once. Each call sets
     the world up from scratch, so one run cannot leak into the next. */
  window.__sim = function (build, scenario, script, seconds) {
    const STEP = 1 / 60;

    WS.setSeed(1234567);
    WS.Game.startRun('thornhollow', 'mage');
    if (WS.Game.blessingChoices) WS.Game.chooseBlessing(0);
    const p = WS.Game.player;

    /* Nothing arrives except what the script says, and nothing the player
       does changes who arrives. */
    WS.WaveManager.update = function () {};

    /* The build under test is the build declared, at the ranks declared, for
       the whole run - so the offer of a level-up is never made. Draining the
       choice after the fact is not enough: presenting one sets the state to
       'levelup', and Game.update returns early in any state but 'playing',
       so the first gem picked up stops the simulation dead. That is what the
       first version of this did, for every build, which is why every build
       scored exactly the same nothing. */
    WS.Game.openLevelUp = function () { this.pendingLevelUps = 0; };
    WS.Game.presentLevelUp = function () { this.pendingLevelUps = 0; };
    WS.Enemy.pool.releaseAll();
    WS.Pickup.clear(); WS.XP.clear(); WS.Projectile.clear(); WS.FX.clear();

    // the declared build, and only it
    p.weapons.length = 0; p.weaponLevels = {}; p.combosActive = {};
    for (const [id, rank] of build.weapons) {
      WS.Player.addWeapon(p, id);
      const w = WS.Player.getWeapon(p, id);
      if (w) {
        w.level = rank; p.weaponLevels[id] = rank;
        /* A build can declare itself already evolved, so the cost of getting
           the pairings can be measured against the cost of only getting the
           ranks. */
        if (build.evolved) w.evolved = true;
      }
    }
    WS.ComboSystem.check(p);

    p.x = 640; p.y = 360;
    p.maxHealth = 1e9; p.health = 1e9;   // deaths would end the comparison early

    /* The four keys, set by the clock instead of by fingers. A slow circuit
       around the middle of the field: enough movement that a weapon which
       only works standing still is found out, not so much that the survivor
       outruns the script. */
    WS.Input.poll = function () {};
    const drive = (t) => {
      const leg = Math.floor(t / 4) % 4;
      const k = WS.Input.keys;
      k.up = leg === 0; k.right = leg === 1; k.down = leg === 2; k.left = leg === 3;
    };

    /* The dummies: a standing crowd at three ranges, none of which can die
       or move.
       
       This began as ONE dummy at 160px, and that measured range rather than
       throughput. Dawnpulse's nova reaches 150 and scored 2 damage a second
       while killing 118 things in the gauntlet; the orbiters, the melee arcs
       and the ground zones all read zero for the same reason, and arcweb,
       which chains between targets, had nothing to chain to. A weapon cannot
       be asked how hard it hits at a distance it was never built to hit at.
       
       Three rings, because the shape of a build's reach is part of what it
       is: what works point-blank is not what works across the field. */
    const dummies = [];
    if (scenario === 'dummy') {
      /* Rings every 60px out to 480, because three rings still left gaps and
         a gap is a lie. Hallowed Ring measured 60 damage a second at rank 1
         and 31 at rank 8 - a weapon getting worse as it levels - and the
         reason was that its orbiters grow their radius with rank and at rank
         8 were sweeping the empty band between one ring of dummies and the
         next. The weapon was fine; the instrument had holes in it. */
      const rings = [[6, 60], [6, 120], [8, 180], [8, 240],
        [10, 300], [10, 360], [12, 420], [12, 480]];
      for (const [n, dist] of rings) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * WS.TAU;
          const d = WS.Enemy.spawn('lampling',
            640 + WS.cos(a) * dist, 360 + WS.sin(a) * dist, 1, true);
          if (d) { d.speed = 0; d.maxHealth = 1e12; d.health = 1e12; dummies.push(d); }
        }
      }
    }

    let next = 0, t = 0;
    const seen = { leaked: 0 };
    while (t < seconds) {
      if (scenario !== 'dummy') {
        while (next < script.length && script[next].t <= t) {
          const s = script[next++];
          WS.Enemy.spawn(s.id, s.x, s.y, 1, true);
        }
      }
      /* The circuit is for the gauntlet, where where-you-stand is half of
         what a build does. The dummy test is throughput, so the survivor
         stands still and the ranges stay the ranges. */
      if (scenario !== 'dummy') drive(t);
      WS.Game.update(STEP);

      for (const d of dummies) { d.health = 1e12; d.x = d._hx || (d._hx = d.x); d.y = d._hy || (d._hy = d.y); }
      t += STEP;
    }

    const run = WS.Game.run;
    /* Anything still standing when the clock stops is something this build
       could not get to - the gauntlet's real verdict. */
    seen.leaked = WS.Enemy.pool.count;
    const byWeapon = {};
    for (const k in run.damageByWeapon) byWeapon[k] = run.damageByWeapon[k];
    return {
      damage: run.damageDone,
      taken: run.damageTaken,
      kills: run.kills || 0,
      leaked: seen.leaked,
      byWeapon,
    };
  };
};

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
    await page.evaluate(INSTALL);
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
    builds = builds.filter((b) => b.name.includes(needle));
  }
  const script = gauntletScript();


  const siege = siegeScript();
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
    results.push({
      name: build.name, group: build.group,
      dps: dummy.damage / DUMMY_SECONDS,
      kills: gaunt.kills,
      leaked: gaunt.leaked,
      taken: gaunt.taken,
      siege: hard && { kills: hard.kills, leaked: hard.leaked, taken: hard.taken },
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
    console.log('\n' + title);
    console.log('  ' + 'build'.padEnd(26) + 'dps'.padStart(9) + 'kills'.padStart(8)
      + 'left'.padStart(7) + 'taken'.padStart(9)
      + (hard ? 'siege:kills'.padStart(13) + 'left'.padStart(7) + 'taken'.padStart(9) : ''));
    for (const r of rows) {
      console.log('  ' + r.name.padEnd(26) + r.dps.toFixed(0).padStart(9)
        + String(r.kills).padStart(8) + String(r.leaked).padStart(7)
        + r.taken.toFixed(0).padStart(9)
        + (r.siege ? String(r.siege.kills).padStart(13) + String(r.siege.leaked).padStart(7)
          + r.siege.taken.toFixed(0).padStart(9) : ''));
    }
  };
  console.log(`the gauntlet sends ${spawned} creatures over ${GAUNTLET_SECONDS}s,`
    + ` the siege ${siege.length} over ${SIEGE_SECONDS}s;`
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

  if (process.argv.includes('--json')) {
    const out = process.argv[process.argv.indexOf('--json') + 1];
    fs.writeFileSync(out, JSON.stringify({ spawned, results }, null, 1));
    console.log('\nwrote ' + out);
  }
})();
