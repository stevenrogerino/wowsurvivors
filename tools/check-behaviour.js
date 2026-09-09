#!/usr/bin/env node
/* Does the horde have more than one verb?
 *
 * Twenty-eight creatures, and every one of them walked at the survivor in a
 * straight line. Five of them stopped to throw something; that was the whole
 * range. They are drawn beautifully and they are all distinct to look at, and
 * none of that reaches the player's hands: the field read as one texture no
 * matter what was in it, because whatever was in it, the answer was the same.
 *
 * So this measures BEHAVIOUR, not artwork. Each behaviour is put in a bare
 * arena with a survivor and asked to prove it does the one thing it exists to
 * do - and, just as importantly, that it is not quietly doing what a plain
 * chaser would do anyway:
 *
 *   chase    the baseline, kept in the test so every other number has
 *            something honest to be compared against
 *   lunge    plants, marks a lane, and travels down THAT lane - the same
 *            promise the boss charge makes, at rank-and-file size, and it
 *            must cover ground a chaser could not
 *   orbit    closes to its ring and then goes SIDEWAYS: it must travel far
 *            while barely changing its distance to the survivor, which is
 *            exactly what a chaser cannot do
 *   trail    leaves armed ground behind it, and that ground must be harmless
 *            for a moment first
 *   burst    puts armed ground where it DIED, after a fuse long enough to
 *            walk out of
 *   split    comes apart into smaller things, exactly once, and the children
 *            must not split again
 *
 * Hazards are checked for the fuse specifically. Ground that hurts on the
 * frame it appears is not a mechanic, it is a tax, and it is the easy thing
 * to get wrong when the numbers get tuned later.
 *
 * NEGATIVE TESTS, all confirmed. Dropping the orbit branch so it just chases
 * fails at "orbit closed 300px on the survivor while travelling 300 - that is
 * a chaser, not a ring". Setting both fuses to zero fails at "trail ground was
 * armed the moment it appeared" and "burst gave 0s of warning". Pointing a
 * splitter at itself with the one-generation mark removed fails at "split kept
 * splitting - 81 still alive after three rounds of killing everything".
 *
 * What is NOT tested here, deliberately: whether a lunge homes. The survivor
 * stands still in these measurements, and against a survivor who stands still
 * a homing lunge and an honest one draw the same line - the sabotage passes.
 * That question needs a survivor who moves, so it lives in check-telegraph.js,
 * which sprints one sideways the instant the lane locks and catches the wolf
 * 62px out of its own lane.
 *
 * Everything here is seeded. Half of these behaviours start on a random phase
 * - a lunge's first cooldown, an orbiter's direction - and the first version
 * of this check disagreed with itself between runs because of it.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-behaviour.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const fail = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && window.WS.Game);

  const out = await page.evaluate(() => {
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    const step = WS.CONST.TICK_RATE;

    /* A bare field: one creature, one survivor who does not move and cannot
       die, nothing else spawning, no weapons firing. Anything that happens is
       the creature's doing. */
    const bare = (id, seconds, at) => {
      /* Seeded, because half of these behaviours start on a random phase -
       * a lunge's first cooldown, an orbiter's direction - and a check whose
       * verdict depends on a die roll is not measuring the game. Finding this
       * cost two runs that disagreed with each other. */
      WS.setSeed(20260909);
      WS.Game.startRun('thornhollow', 'mage');
      const card = document.querySelector('#overlay:not(.hidden) .card');
      if (card) card.click();
      const p = WS.Game.player;
      p.maxHealth = 1e9; p.health = 1e9; p.armor = 99;
      p.x = 640; p.y = 360;
      WS.WaveManager.reset(WS.Maps.thornhollow);
      WS.WaveManager.spawnTimer = 1e9;  // nothing ambient joins in
      p.weapons.length = 0;             // and no weapon may kill the subject
      WS.Enemy.pool.releaseAll();
      WS.Hazard.pool.releaseAll();
      const e = WS.Enemy.spawn(id, at[0], at[1], 1);
      e.maxHealth = 1e9; e.health = 1e9;
      const track = { path: 0, dClose: 0, hazards: [], firstArmed: null,
        lanes: [], stray: 0, kids: 0 };
      let px = e.x, py = e.y;
      let d0 = Math.hypot(p.x - e.x, p.y - e.y);
      let lane = null, laneStart = null;
      const ticks = Math.round(seconds / step);
      for (let i = 0; i < ticks; i++) {
        p.weapons.length = 0;
        WS.WaveManager.spawnTimer = 1e9;
        WS.Game.tick(step);
        if (WS.Game.state !== 'playing') break;
        track.path += Math.hypot(e.x - px, e.y - py);
        px = e.x; py = e.y;
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        track.dClose = Math.max(track.dClose, d0 - d);
        // the lane it drew, and whether it stayed in it
        if (!lane && e.telegraph && e.telegraph.firing) {
          lane = { dx: e.telegraph.dx, dy: e.telegraph.dy, length: e.telegraph.length };
          laneStart = { x: e.x, y: e.y };
          track.lanes.push(lane.length);
        } else if (lane && e.chargeTimer > 0) {
          const ox = e.x - laneStart.x, oy = e.y - laneStart.y;
          track.stray = Math.max(track.stray, Math.abs(ox * lane.dy - oy * lane.dx));
        } else if (lane && e.chargeTimer <= 0) {
          lane = null;
        }
        for (let n = 0; n < WS.Hazard.pool.count; n++) {
          const h = WS.Hazard.pool.active[n];
          if (!h._seen) {
            h._seen = true;
            track.hazards.push({ fuse: +h.maxFuse.toFixed(2), radius: h.radius });
          }
        }
      }
      return { track, e };
    };

    const res = {};
    // A plain chaser, as the yardstick for everything below.
    let r = bare('mongrel', 3.0, [340, 360]);
    res.chase = { path: Math.round(r.track.path), close: Math.round(r.track.dClose) };

    r = bare('raptor', 6.0, [340, 360]);
    res.lunge = { path: Math.round(r.track.path), lanes: r.track.lanes.length,
      stray: +r.track.stray.toFixed(1), laneLen: r.track.lanes[0] || 0 };

    r = bare('fleshripper', 6.0, [340, 360]);
    res.orbit = { path: Math.round(r.track.path), close: Math.round(r.track.dClose),
      settled: Math.round(Math.hypot(WS.Game.player.x - r.e.x, WS.Game.player.y - r.e.y)) };

    r = bare('spider', 6.0, [340, 360]);
    res.trail = { hazards: r.track.hazards.length,
      minFuse: r.track.hazards.reduce((a, h) => Math.min(a, h.fuse), 9) };

    /* Burst and split both happen on death, so these two kill the thing on
       purpose rather than waiting for a weapon to do it. */
    const onDeath = (id) => {
      bare(id, 0.2, [520, 360]);
      const e = WS.Enemy.pool.active[0];
      WS.Hazard.pool.releaseAll();
      const before = WS.Enemy.pool.count;
      WS.Enemy.damage(e, 1e12, false, 'test');
      const haz = [];
      for (let n = 0; n < WS.Hazard.pool.count; n++) {
        const h = WS.Hazard.pool.active[n];
        haz.push({ fuse: +h.maxFuse.toFixed(2), radius: h.radius,
          d: Math.round(Math.hypot(h.x - e.x, h.y - e.y)) });
      }
      // let any children die too, to see whether they split in turn
      let born = WS.Enemy.pool.count - before + 1;
      for (let g = 0; g < 3; g++) {
        const alive = WS.Enemy.pool.active.slice(0, WS.Enemy.pool.count);
        for (const k of alive) WS.Enemy.damage(k, 1e12, false, 'test');
      }
      return { haz, born, left: WS.Enemy.pool.count };
    };
    const b = onDeath('harvest_reaper');
    res.burst = { hazards: b.haz.length, fuse: b.haz[0] ? b.haz[0].fuse : 0,
      atCorpse: b.haz[0] ? b.haz[0].d : 999 };
    const sp = onDeath('abomination');
    res.split = { born: sp.born, runaway: sp.left };

    // and the shape of the roster itself
    const all = Object.assign({}, WS.Enemies, WS.Elites);
    res.roster = { total: Object.keys(all).length,
      verbs: Object.keys(all).filter((k) => all[k].ranged || all[k].lunge
        || all[k].orbit || all[k].trail || all[k].burst || all[k].split).length };
    return res;
  });

  const r = out;
  // lunge
  if (r.lunge.lanes < 1) fail.push('lunge never drew a lane in six seconds');
  if (r.lunge.stray > 12) {
    fail.push(`lunge strayed ${r.lunge.stray}px out of the lane it drew - a small `
      + 'charge has to keep the same promise a big one does');
  }
  if (r.lunge.path < r.chase.path * 1.15) {
    fail.push(`lunge covered ${r.lunge.path}px where a plain chaser covers `
      + `${r.chase.path} - it is not actually lunging`);
  }
  // orbit
  if (r.orbit.path < 260) fail.push(`orbit barely moved (${r.orbit.path}px)`);
  if (r.orbit.close > r.orbit.path * 0.55) {
    fail.push(`orbit closed ${r.orbit.close}px on the survivor while travelling `
      + `${r.orbit.path} - that is a chaser, not a ring`);
  }
  if (r.orbit.settled > 320 || r.orbit.settled < 60) {
    fail.push(`orbit settled ${r.orbit.settled}px away - it is not holding a ring`);
  }
  // trail
  if (r.trail.hazards < 2) {
    fail.push(`trail left ${r.trail.hazards} patch(es) of ground in six seconds`);
  }
  if (!(r.trail.minFuse > 0.05)) {
    fail.push('trail ground was armed the moment it appeared - ground that hurts on '
      + 'the frame it arrives is a tax, not a mechanic');
  }
  // burst
  if (r.burst.hazards < 1) fail.push('burst left nothing behind when it died');
  if (!(r.burst.fuse > 0.25)) {
    fail.push(`burst gave ${r.burst.fuse}s of warning - not enough to walk out of`);
  }
  if (r.burst.atCorpse > 4) {
    fail.push(`burst went off ${r.burst.atCorpse}px from the body it came out of`);
  }
  // split
  if (r.split.born < 2) fail.push(`split produced ${r.split.born} children`);
  if (r.split.runaway > 0) {
    fail.push(`split kept splitting - ${r.split.runaway} still alive after three `
      + 'rounds of killing everything');
  }
  if (r.roster.verbs < 12) {
    fail.push(`only ${r.roster.verbs} of ${r.roster.total} creatures do anything but `
      + 'walk at you');
  }

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`ok: ${r.roster.verbs} of ${r.roster.total} creatures do something other than `
    + `walk at you. A lunge covers ${r.lunge.path}px against a chaser's ${r.chase.path} and `
    + `stays within ${r.lunge.stray}px of the lane it drew; an orbiter travels `
    + `${r.orbit.path}px while closing only ${r.orbit.close} and settles at `
    + `${r.orbit.settled}px; a trail lays ground that is harmless for `
    + `${r.trail.minFuse}s first; a burst gives ${r.burst.fuse}s of warning at the corpse; `
    + `and a split makes ${r.split.born} children and then stops`);
})();
