/* The two newest survivors are not found lying on the field. Each one is met
 * by doing the thing they are, well enough, in one night - the way the
 * graveblade answers curdled Light and the glaives answer the ruin - and then
 * proving it once more when the field asks.
 *
 *   THE LOST CALVES (Milksupply). Take a shape three times in one night and
 *   three calves stray onto the field, far apart and ambling. Gather all
 *   three before the time runs out. Miss it and they bolt; three more shapes
 *   and they stray again.
 *
 *   THE TRIAL OF THE STILL HAND (Abbot Eisen). Step through enough blows in
 *   one night and the Still Hand starts watching. Then go the given time
 *   without a single blow landing. A step through one is fine; that is the
 *   whole teaching. A blow that lands starts the count again.
 *
 * Every number is in Config beside the powers they grow out of. */
'use strict';
(function (WS) {

  const Trials = {};
  const C = () => WS.Config;

  function fresh(run) {
    if (!run.trials) {
      run.trials = {
        calves: { state: 'idle', timer: 0, gathered: 0, nextAt: C().calfShifts },
        still: { state: 'idle', timer: 0, nextAt: C().trialSteps },
      };
    }
    return run.trials;
  }

  function unlocked(id) {
    return !!(WS.Save.db.unlocks && WS.Save.db.unlocks.characters && WS.Save.db.unlocks.characters[id]);
  }

  /* --------------------------------------------------------- the calves -- */
  function strayCalves(p, t) {
    const n = C().calfCount;
    const base = WS.random() * WS.TAU;
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * WS.TAU + WS.randRange(-0.3, 0.3);
      const d = C().calfDistance * WS.randRange(0.85, 1.15);
      const x = WS.clamp(p.x + WS.cos(a) * d, 90, WS.CONST.WORLD_WIDTH - 90);
      const y = WS.clamp(p.y + WS.sin(a) * d, 90, WS.CONST.WORLD_HEIGHT - 90);
      const c = WS.Pickup.spawn('calf', x, y);
      if (c) { c.heading = a; c.turn = WS.randRange(1.5, 3); placed++; }
    }
    if (!placed) return false;
    t.state = 'live'; t.timer = C().calfTime; t.gathered = 0; t.count = placed;
    WS.Game.announce('Three calves have strayed.', 'Bring them in before the dark does.', 4.0);
    WS.Audio.play('warn');
    return true;
  }

  function clearCalves() {
    const pool = WS.Pickup.pool;
    let i = 0;
    while (i < pool.count) {
      const c = pool.active[i];
      if (c.kind === 'calf') {
        WS.FX.burst(c.x, c.y, 8, '#f0e2c8', 120, 0.5, 3);
        pool.releaseAt(i);
      } else i++;
    }
  }

  /** A calf walked into. True: it is gathered and leaves the field. */
  Trials.gatherCalf = function (p, pickup) {
    const run = WS.Game.run;
    const t = fresh(run).calves;
    if (t.state !== 'live') return true;
    t.gathered++;
    WS.FX.flash(pickup.x, pickup.y, 50, [0.95, 0.9, 0.78], 0.35);
    WS.Audio.play('potion');
    if (t.gathered >= t.count) {
      t.state = 'done';
      WS.Save.stats.calvesHerded = (WS.Save.stats.calvesHerded || 0) + 1;
      WS.Save.save();
      WS.Game.announce('Milksupply comes looking for them.',
        'Three calves home. Somebody big and horned says thank you, and stays.', 4.0, { kind: 'glory' });
      WS.Game.addGold(WS.floor(C().gravebladeGold * run.goldMult), p.x, p.y);
      WS.Achievements.check();
      WS.Audio.play('evolve');
    } else {
      WS.FX.notice(p.x, p.y, `${t.gathered} of ${t.count} calves`, '#f0e2c8');
    }
    return true;
  };

  /** Calves amble: a slow wander that turns now and then, and turns away
   *  from anything with teeth that gets close. Called by Pickup.update. */
  Trials.amble = function (c, dt) {
    c.turn -= dt;
    if (c.turn <= 0) { c.turn = WS.randRange(1.5, 3); c.heading += WS.randRange(-1.2, 1.2); }
    let speed = 34;
    const e = WS.Enemy.findNearest(c.x, c.y, 130);
    if (e) { c.heading = WS.atan2(c.y - e.y, c.x - e.x); speed = 70; }
    let nx = c.x + WS.cos(c.heading) * speed * dt, ny = c.y + WS.sin(c.heading) * speed * dt;
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
    if (nx < 80 || nx > W - 80) { c.heading = WS.PI - c.heading; nx = WS.clamp(nx, 80, W - 80); }
    if (ny < 80 || ny > H - 80) { c.heading = -c.heading; ny = WS.clamp(ny, 80, H - 80); }
    c.x = nx; c.y = ny;
    c.facing = WS.cos(c.heading) < 0 ? -1 : 1;
  };

  /* ---------------------------------------------------- the still hand -- */
  function beginStill(t) {
    t.state = 'live'; t.timer = 0;
    WS.Game.announce('The Still Hand is watching.',
      `Let nothing land for ${C().trialTime} seconds. A step through a blow does not count.`, 4.0);
    WS.Audio.play('warn');
  }

  /** A blow landed on the survivor. */
  Trials.onHurt = function (p) {
    const run = WS.Game.run;
    if (!run || !run.trials) return;
    const t = run.trials.still;
    if (t.state === 'live' && t.timer > 1) {
      WS.FX.notice(p.x, p.y, 'Again.', '#cfe4ff');
    }
    if (t.state === 'live') t.timer = 0;
  };

  /* ---------------------------------------------------------- per frame -- */
  Trials.update = function (dt, run) {
    const p = WS.Game.player;
    if (!p || run.map.arena || WS.Finale.running()) return;
    const T = fresh(run);

    if (!unlocked('druid')) {
      const t = T.calves;
      if (t.state === 'idle' && p.shifts >= t.nextAt) {
        if (!strayCalves(p, t)) t.nextAt = p.shifts + 1;
      } else if (t.state === 'live') {
        t.timer -= dt;
        if (t.timer <= 0) {
          clearCalves();
          t.state = 'idle';
          t.nextAt = p.shifts + C().calfShifts;
          WS.Game.announce('The calves bolted.', 'Take the shapes again and they may stray back.', 3.0);
        }
      }
    }

    if (!unlocked('monk')) {
      const t = T.still;
      if (t.state === 'idle' && p.dashes >= t.nextAt) beginStill(t);
      else if (t.state === 'live') {
        t.timer += dt;
        if (t.timer >= C().trialTime) {
          t.state = 'done';
          WS.Save.stats.stillHands = (WS.Save.stats.stillHands || 0) + 1;
          WS.Save.save();
          WS.Game.announce('Abbot Eisen bows.',
            'Nothing touched you. He would like to know who taught you that.', 4.0, { kind: 'glory' });
          WS.Game.addGold(WS.floor(C().gravebladeGold * run.goldMult), p.x, p.y);
          WS.FX.flash(p.x, p.y, 140, [0.8, 0.92, 1.0], 0.5);
          WS.Achievements.check();
          WS.Audio.play('evolve');
        }
      }
    }
  };

  /** The HUD's meter for whichever trial is under way, or null. */
  Trials.meter = function () {
    const run = WS.Game.run;
    if (!run || !run.trials) return null;
    const c = run.trials.calves, s = run.trials.still;
    if (c.state === 'live') {
      return { key: 'trial-calves', cls: 'trial calves',
        label: `Calves ${c.gathered}/${c.count} · ${WS.formatTime(WS.ceil(c.timer))}`,
        pct: c.timer / C().calfTime };
    }
    if (s.state === 'live') {
      return { key: 'trial-still', cls: 'trial still',
        label: `Still Hand · ${WS.formatTime(WS.max(0, WS.ceil(C().trialTime - s.timer)))}`,
        pct: s.timer / C().trialTime };
    }
    return null;
  };

  WS.Trials = Trials;

})(window.WS);
