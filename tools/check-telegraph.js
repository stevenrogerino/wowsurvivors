#!/usr/bin/env node
/* Does the boss go where the ground said it would?
 *
 * A telegraph is a contract. The game draws a lane in front of a charging
 * boss, and the whole reason to draw it is so the player can step out of it.
 * This one was broken three separate ways at once, and all three were
 * invisible to every check in this repo because they are behaviour, not
 * pixels:
 *
 *   AIMED TWICE.  The lane was aimed when the windup started and frozen
 *                 there. The charge was aimed again three quarters of a
 *                 second later, at wherever the survivor had walked to since.
 *                 At walking speed that is well over a hundred pixels of
 *                 error, so the boss routinely left the lane it had drawn.
 *
 *   NEVER USED.   The direction it worked out at that second moment was
 *                 written to e.chargeDir - and e.chargeDir was never read
 *                 anywhere in the codebase. The "charge" was the ordinary
 *                 chase at 3.2x speed, which means it tracked the survivor
 *                 the whole way. A charge you cannot sidestep is not a
 *                 charge.
 *
 *   WRONG LENGTH. The lane was drawn 460 long. A charge at 3.2x a boss's
 *                 speed for 1.1s covers about 210. More than half the marked
 *                 ground was never in danger.
 *
 * So the rule this enforces: WHERE THE LANE POINTS WHEN IT LOCKS IS WHERE
 * THE BOSS ENDS UP. The lane may swing while the boss is still winding up -
 * it should, that is the boss taking aim and the player's cue to move - but
 * the moment it commits, the lane stops moving and becomes a promise.
 *
 * Every charging boss in the game is put through it twice: once against a
 * survivor who stands still, and once against one who sprints sideways the
 * instant the charge commits. The second run is the one that catches homing.
 *
 * And every creature and elite that LUNGES, which is the same move at a
 * smaller size making the same promise. There are far more of them on the
 * field than there are bosses, so if either half is going to be caught
 * cheating, it is this one.
 *
 * NEGATIVE TESTS, both confirmed against the code as it was. Letting the
 * charge home again fails at "curved 127px out of its own lane". Freezing the
 * lane's aim at the start of the windup fails at "the lane locked 15.7
 * degrees off the survivor" - and, tellingly, ALSO at "curved 122.9px out of
 * its own lane" for a survivor who never moved at all, because a lane aimed
 * a beat early is a lane the boss was never going to run down. The homing
 * sabotage catches the small ones too: "wolf curved 62.4px out of its own
 * lane", "raptor covered 156.3 of the 230 it drew".
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-telegraph.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const OFF_LANE = 12;      // px the boss may stray sideways out of its own lane
const SHORTFALL = 0.12;   // fraction of the lane it may fail to cover
const AIM = 6;            // degrees the locked lane may miss the survivor by

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const fail = [];
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && window.WS.Game);

  const rows = await page.evaluate(() => {
    /* A fresh profile gets the prologue, and its layer covers the whole
       screen - which is the point of it. A harness has to walk past it
       before it can drive anything. */
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    const out = [];

    /* Arena bosses are excluded because they never reach this code path:
       arena.js drives Aethelgard's whole fight and Enemy.bossAttack is gated
       on !template.arena, so its declared charge pattern is dead data.

       Creatures and elites that LUNGE are in the same list, because a lunge
       is the same move at a smaller size and makes the same promise. There
       are far more of them on the field than there are bosses, so if either
       one is going to be caught homing at a player, it will be this half. */
    const chargers = Object.keys(WS.Bosses).filter((id) => !WS.Bosses[id].arena
      && (WS.Bosses[id].patterns || []).some((p) => p.type === 'charge'));
    const all = Object.assign({}, WS.Enemies, WS.Elites);
    const lungers = Object.keys(all).filter((id) => all[id].lunge);

    /* dodge: how the survivor behaves once the charge has committed.
     *   'stand' - stays put, so the lane and the target agree
     *   'bolt'  - runs perpendicular, which is exactly what a homing charge
     *             would follow and a real one would miss */
    const attempt = (id, dodge) => {
      WS.Game.startRun('thornhollow', 'mage');
      /* Straight to the game, not through the card. Picking a card is a UI act
         and the UI now holds the frame for a beat before it resolves, which a
         harness that drives Game.tick in a synchronous loop can never wait out.
         tools/check-choice.js guards the screens themselves. */
      WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
      const p = WS.Game.player;
      p.maxHealth = 1e7; p.health = 1e7; p.armor = 95;
      WS.Enemy.pool.releaseAll();

      const boss = WS.Enemy.spawn(id, 300, 360, 1);
      boss.maxHealth = 1e12; boss.health = 1e12;
      p.weapons.length = 0;                 // nothing may kill the subject
      p.x = 900; p.y = 360;

      // Straight to the move, through the real path each one actually uses.
      if (boss.template.lunge) {
        boss.lungeTimer = 0;
        boss.speed = 0;                     // so it cannot simply walk into range
        p.x = 300 + boss.template.lunge.range * 0.8;
      } else {
        boss.patternIndex = boss.template.patterns.findIndex((q) => q.type === 'charge');
        boss.attackTimer = 0.001;
      }

      const step = WS.CONST.TICK_RATE;
      const K = WS.Input.keys;
      let lane = null, start = null, aimedAt = null, laneGaps = 0, ticks = 0;
      let maxOff = 0;

      while (ticks++ < 400) {
        p.weapons.length = 0;
        if (WS.Game.state === 'blessing') {
          WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' }); continue;
        }
        if (WS.Game.state === 'levelup') {
          WS.Game.chooseLevelUp(WS.Game.levelChoices[0]); continue;
        }
        if (boss._dead || WS.Game.state === 'over') break;

        // While it is still taking aim, walk - the lane is meant to follow.
        if (!lane) { K.left = false; K.right = false; K.up = true; K.down = false; }

        WS.Game.tick(step);

        if (!lane && boss.telegraph && boss.telegraph.firing) {
          // The instant it commits: what was promised, and to whom.
          lane = { dx: boss.telegraph.dx, dy: boss.telegraph.dy,
            length: boss.telegraph.length };
          start = { x: boss.x, y: boss.y };
          aimedAt = { x: p.x, y: p.y };
          K.up = false;
          if (dodge === 'bolt') { K.down = true; }   // straight across the lane
        } else if (lane) {
          if (!boss.telegraph) laneGaps++;           // the promise left the screen
          const ox = boss.x - start.x, oy = boss.y - start.y;
          const off = Math.abs(ox * lane.dy - oy * lane.dx);   // perpendicular
          if (off > maxOff) maxOff = off;
          if (boss.chargeTimer <= 0) break;
        }
      }
      K.up = false; K.down = false;
      if (!lane) return { id, dodge, error: 'the boss never committed to a charge' };
      const ox = boss.x - start.x, oy = boss.y - start.y;
      const along = ox * lane.dx + oy * lane.dy;
      // Where the lane pointed, against where the survivor actually was.
      const [tx, ty] = WS.normalize(aimedAt.x - start.x, aimedAt.y - start.y);
      const dot = Math.max(-1, Math.min(1, tx * lane.dx + ty * lane.dy));
      return { id, dodge, off: +maxOff.toFixed(1), along: +along.toFixed(1),
        length: lane.length, laneGaps, aimErr: +(Math.acos(dot) * 180 / Math.PI).toFixed(1) };
    };

    for (const id of chargers.concat(lungers)) {
      out.push(attempt(id, 'stand'));
      out.push(attempt(id, 'bolt'));
    }
    return out;
  });

  for (const r of rows) {
    const who = `${r.id} (survivor ${r.dodge === 'bolt' ? 'sprinting aside' : 'standing'})`;
    if (r.error) { fail.push(`${who}: ${r.error}`); continue; }
    if (r.off > OFF_LANE) {
      fail.push(`${who} curved ${r.off}px out of its own lane - it is chasing the `
        + 'survivor, not running down the ground it marked');
    }
    if (r.along < r.length * (1 - SHORTFALL)) {
      fail.push(`${who} covered ${r.along} of the ${r.length} it drew - `
        + `${Math.round(100 - r.along / r.length * 100)}% of the marked ground was `
        + 'never dangerous');
    }
    if (r.aimErr > AIM) {
      fail.push(`${who}: the lane locked ${r.aimErr} degrees off the survivor - it `
        + 'stopped tracking before the boss stopped deciding');
    }
    if (r.laneGaps) {
      fail.push(`${who}: the lane vanished for ${r.laneGaps} tick(s) while the charge `
        + 'was still running - the player cannot see the promise being kept');
    }
  }

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail.slice(0, 26)) console.error('  - ' + f);
    if (fail.length > 26) console.error(`  ... and ${fail.length - 12} more`);
    process.exit(1);
  }
  const worstOff = rows.reduce((a, r) => (r.off > a.off ? r : a));
  const worstAim = rows.reduce((a, r) => (r.aimErr > a.aimErr ? r : a));
  console.log(`ok: ${rows.length} telegraphed rushes from ${rows.length / 2} bosses, elites `
    + 'and creatures, each against a '
    + 'survivor who stands and one who bolts; the worst stray from the marked lane is '
    + `${worstOff.off}px (${worstOff.id}), the worst aim at lock is ${worstAim.aimErr} `
    + `degrees (${worstAim.id}), and every charge covered the ground it drew`);
})();
