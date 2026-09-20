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
    /* A fresh profile gets the prologue, and its layer covers the whole
       screen - which is the point of it. A harness has to walk past it
       before it can drive anything. */
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
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
      /* Straight to the game, not through the card.
         Picking a card is a UI act and the UI now holds the frame for a beat
         before it resolves - which a harness that drives Game.update in a
         synchronous loop can never wait out. The choice screens have their own
         guard in tools/check-choice.js; what this file is measuring is what
         happens after one. */
      WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
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

    /* The first elite in the table that actually lunges, so this follows the
       data instead of naming a template that may be retired. */
    const LUNGER = Object.keys(WS.Elites).find((k) => WS.Elites[k].lunge);
    if (!LUNGER) return { noLunger: true };

    const res = {};
    // A plain chaser, as the yardstick for everything below.
    let r = bare('mongrel', 3.0, [340, 360]);
    res.chase = { path: Math.round(r.track.path), close: Math.round(r.track.dClose) };

    /* An ELITE, because the lunge is now an elite-and-boss move. It used to be
       measured on the Sunhide Raptor, which is rank-and-file: eleven of them
       could be on the field at once, committing a charge every three seconds,
       and a tell that fires that often is weather rather than a warning. */
    r = bare(LUNGER, 7.0, [340, 360]);
    res.lunge = { path: Math.round(r.track.path), lanes: r.track.lanes.length,
      stray: +r.track.stray.toFixed(1), laneLen: r.track.lanes[0] || 0,
      speed: r.e.template.speed };
    res.chase.speed = WS.Enemies.mongrel.speed;
    // Who declares a lunge, and are any of them rank and file?
    res.lungers = { elite: Object.keys(WS.Elites).filter((k) => WS.Elites[k].lunge),
      trash: Object.keys(WS.Enemies).filter((k) => WS.Enemies[k].lunge) };

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
  /* Lunge is an elite and boss mechanic.
   *
   * It was on the Longtooth Wolf and the Sunhide Raptor, both of which arrive
   * in packs from the first minute of their maps. Measured over five minutes
   * of Thornhollow: eleven lungers on the field at once, a charge committing
   * every 3.2 seconds, twenty-two inside one thirty-second stretch - and the
   * sound a commit plays is the one kit that ducks the entire mix to half for
   * seven tenths of a second, so a fifth of the run was spent at half volume.
   *
   * Planting, marking the ground and running the lane down is the game's
   * loudest sentence. It has to be reserved for something worth saying it
   * about. */
  if (r.lungers.trash.length) {
    const many = r.lungers.trash.length > 1;
    fail.push(`${r.lungers.trash.join(', ')} ${many ? 'are' : 'is'} rank and file and `
      + `${many ? 'declare' : 'declares'} a lunge - a charge tell that arrives in packs `
      + 'from minute one is weather, not a warning, and its sound ducks the whole mix');
  }
  if (!r.lungers.elite.length) {
    fail.push('nothing in the elite table lunges any more - the charge tell has left the '
      + 'game below boss level entirely');
  }

  // lunge
  if (r.lunge.lanes < 1) fail.push('lunge never drew a lane in seven seconds');
  if (r.lunge.stray > 12) {
    fail.push(`lunge strayed ${r.lunge.stray}px out of the lane it drew - a small `
      + 'charge has to keep the same promise a big one does');
  }
  /* Scaled by walking speed. The yardstick is a mongrel and the subject is now
     an elite, and elites are heavier and slower - so comparing raw distance
     would ask whether the elite is faster, not whether lunging beats walking. */
  const walkRatio = (r.lunge.speed || 1) / (r.chase.speed || 1);
  if (r.lunge.path < r.chase.path * walkRatio * 1.15) {
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

  /* ---- nothing walks on stage ------------------------------------------
   * The field IS the screen - there is no camera - so a spawn ring drawn
   * around the survivor is only off-screen if somebody checks. It did not:
   * the ring stepped 700-860 along an angle and clamped x and y into the
   * padded world box independently, which does not keep a point outside a
   * rectangle, it drags it onto the edge of a larger one. Measured over
   * thousands of placements, 1% landed in view from the middle of the field
   * and 14-17% from an edge or a corner.
   *
   * It is worst under a time stop, which is where it was reported from. A
   * creature that lands in view normally starts running in the same frame and
   * the motion hides the arrival; a frozen one appears and stands perfectly
   * still. The horde still spawns through a freeze - it should - but it does
   * so out of sight. */
  const ring = await page.evaluate(() => {
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
    const pl = WS.Game.player;
    const spots = [[640, 360], [90, 360], [90, 90], [1190, 630], [220, 160]];
    let seen = 0, inView = 0, worst = null;
    for (const [px, py] of spots) {
      for (let i = 0; i < 400; i++) {
        pl.x = px; pl.y = py;
        WS.Enemy.clear();
        const e = WS.Enemy.spawnRing('lampling', 700 + WS.random() * 160, 1, true);
        if (!e) continue;
        seen++;
        if (e.x > 0 && e.x < W && e.y > 0 && e.y < H) {
          inView++;
          if (!worst) worst = { from: [px, py], at: [Math.round(e.x), Math.round(e.y)] };
        }
      }
    }
    // ...and a time stop does not stop the horde arriving, only its arriving
    // where you can watch it happen.
    WS.Enemy.clear();
    WS.Enemy.freezeAll(6);
    const frozen = WS.Enemy.freezeTimer > 0;
    pl.x = 120; pl.y = 110;
    let frozenInView = 0;
    for (let i = 0; i < 300; i++) {
      const e = WS.Enemy.spawnRing('lampling', 700 + WS.random() * 160, 1, true);
      if (e && e.x > 0 && e.x < W && e.y > 0 && e.y < H) frozenInView++;
      WS.Enemy.clear();
    }
    WS.Enemy.freezeTimer = 0;
    return { seen, inView, worst, frozen, frozenInView };
  });
  if (ring.inView > 0) {
    fail.push(`${ring.inView} of ${ring.seen} ring spawns landed inside the field - one from `
      + `${ring.worst.from} appeared at ${ring.worst.at}, in full view of the player`);
  }
  if (!ring.frozen) fail.push('the freeze under test never took hold');
  if (ring.frozenInView > 0) {
    fail.push(`${ring.frozenInView} creatures spawned in view during a time stop, where `
      + 'nothing moves to cover the arrival');
  }

  /* ---- the ones that shoot do not look like the ones that do not --------
   * Every caster in the game is drawn from the same art as a melee creature
   * and separated only by tint. Measured as the mean difference between their
   * silhouettes on a common grid, gilkin and Gilkin Tidecaller came out at
   * 0.0000 - the same shape exactly - and Kerchief Footpad and Kerchief
   * Pillager at 0.0034 in shape with only 17.6 of colour between them. The
   * creature that walks at you and the creature that shoots you from 280
   * pixels looked the same.
   *
   * This compares what is DRAWN rather than the cached sprite, because the
   * mark that tells them apart is painted by the renderer and not baked into
   * the art - which is the point of it: it applies to every caster the game
   * ever gains without anyone drawing a second sprite. */
  const casters = await page.evaluate(() => {
    const N = 72;
    const foot = (id, k) => {
      WS.Enemy.clear();
      const e = WS.Enemy.spawn(id, 300, 300, 1, true);
      if (!e) return null;
      const t = WS.Enemies[id];
      if (t.ranged) e.rangedTimer = (t.ranged.cooldown || 3) * (1 - k);
      e.bob = 0;
      const c = document.createElement('canvas');
      c.width = N; c.height = N;
      const g = c.getContext('2d');
      g.translate(N / 2 - 300, N / 2 - 300 + 10);
      WS.Renderer.drawEnemy(g, e, 0);
      const d = g.getImageData(0, 0, N, N).data;
      const a = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) a[i] = d[i * 4 + 3] / 255;
      return a;
    };
    const diff = (x, y) => {
      let s = 0;
      for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
      return +(s / x.length).toFixed(4);
    };
    // every melee/caster pair that shares one piece of art
    const ids = Object.keys(WS.Enemies);
    const out = [];
    for (const c of ids) {
      const tc = WS.Enemies[c];
      if (!tc.ranged) continue;
      const twin = ids.find((m) => m !== c && WS.Enemies[m].art === tc.art && !WS.Enemies[m].ranged);
      const idleA = foot(c, 0.15), hot = foot(c, 0.95);
      const entry = { caster: c, twin: twin || null,
        charge: idleA && hot ? diff(idleA, hot) : -1 };
      if (twin) {
        const mel = foot(twin, 0);
        entry.fromTwin = mel && idleA ? diff(mel, idleA) : -1;
      }
      out.push(entry);
    }
    WS.Enemy.clear();
    return out;
  });
  for (const c of casters) {
    if (c.twin && c.fromTwin < 0.008) {
      fail.push(`${c.caster} is drawn ${c.fromTwin} from ${c.twin}, which shares its art - `
        + 'the creature that shoots looks like the creature that does not');
    }
    if (c.charge < 0.006) {
      fail.push(`${c.caster} looks the same about to fire as it does idle (${c.charge}) - `
        + 'nothing tells the player the shot is coming');
    }
  }
  if (!casters.length) fail.push('no casters found to check');

  /* ---- a projectile you bought has to be a projectile you can see --------
   *
   * With three extra projectiles bought and one creature on the field,
   * Cinderfall, Rimeshard, Umbral Bolt, Moonbrand and Grave Tether each
   * launched SIX bolts 0 pixels and 0 degrees apart. One bolt on screen, six
   * lots of damage: five of the sixteen weapons, where the single most
   * legible upgrade in the game showed you nothing whatsoever. Volley already
   * fanned and Knifestorm already ringed; this is the group that had no
   * answer to "where did my extra shot go". */
  const stacked = await page.evaluate(() => {
    WS.setSeed(3);
    WS.Game.startRun('thornhollow', 'mage');
    if (WS.Game.blessingChoices) WS.Game.chooseBlessing(0);
    WS.Game.openLevelUp = function () { this.pendingLevelUps = 0; };
    WS.Input.poll = function () {};
    const p = WS.Game.player;
    p.x = 400; p.y = 360; p.maxHealth = 1e9; p.health = 1e9;
    p.projectileBonus = 3;
    const bad = [];
    for (const id of WS.WeaponOrder) {
      p.weapons.length = 0; p.weaponLevels = {}; p.combosActive = {};
      WS.Player.addWeapon(p, id);
      const w = WS.Player.getWeapon(p, id);
      if (!w) continue;
      w.level = 8; p.weaponLevels[id] = 8;
      WS.Enemy.pool.releaseAll();
      WS.Projectile.clear();
      const e = WS.Enemy.spawn('lampling', 900, 360, 1, true);
      if (e) { e.maxHealth = 1e9; e.health = 1e9; e.speed = 0; }
      w.cooldown = 0;
      WS.Weapon.fire(p, w);
      const bolts = WS.Projectile.bolts.active.slice();
      if (bolts.length < 2) continue;      // nothing launched together
      let gap = 0, ang = 0;
      for (let i = 0; i < bolts.length; i++) {
        for (let j = i + 1; j < bolts.length; j++) {
          gap = Math.max(gap, Math.hypot(bolts[i].x - bolts[j].x, bolts[i].y - bolts[j].y));
          ang = Math.max(ang, Math.abs(Math.atan2(bolts[i].vy, bolts[i].vx)
            - Math.atan2(bolts[j].vy, bolts[j].vx)));
        }
      }
      // a degree of separation, or a couple of pixels, is enough to be seen
      if (ang * 180 / Math.PI < 1 && gap < 3) {
        bad.push(`${WS.Weapons[id].name} launches ${bolts.length} bolts on top of each other`);
      }
    }
    return bad;
  });
  for (const b of stacked) fail.push(b);

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`ok: no ring spawn out of ${ring.seen} landed in view, frozen or not; each of `
    + `${casters.length} casters is marked apart from the melee twin it shares art with and `
    + 'shows its shot coming; and '
    + `${r.roster.verbs} of ${r.roster.total} creatures do something other than `
    + `walk at you. Only elites and bosses lunge (${r.lungers.elite.join(', ')}); one covers `
    + `${r.lunge.path}px against a chaser's ${r.chase.path} at ${Math.round(walkRatio * 100)}% `
    + 'of its walking speed and '
    + `stays within ${r.lunge.stray}px of the lane it drew; an orbiter travels `
    + `${r.orbit.path}px while closing only ${r.orbit.close} and settles at `
    + `${r.orbit.settled}px; a trail lays ground that is harmless for `
    + `${r.trail.minFuse}s first; a burst gives ${r.burst.fuse}s of warning at the corpse; `
    + `and a split makes ${r.split.born} children and then stops`);
})();
