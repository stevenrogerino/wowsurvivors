/* Drives each battlefield's data timeline: ambient spawn phases, scripted swarm
 * events, timed boss arrivals, supply caches, the egg merchant, and the three
 * one-shot story objects (coffin / graveblade / twin glaives). Difficulty scaling
 * is a function of elapsed time times the map's difficulty knob. */
'use strict';
(function (WS) {

  const Wave = {};

  Wave.reset = function (map) {
    this.map = map;
    this.phaseIndex = 0;
    this.eventIndex = 0;
    this.bossIndex = 0;
    const cfg = WS.Config;
    this.spawnTimer = cfg.firstSpawn;
    this.endlessBossTimer = cfg.endlessFirstBoss;
    this.endlessEventTimer = cfg.endlessFirstEvent;
    this.endlessBosses = 0;
    this.deathWarned = false;
    this.lull = 0;
    this.deepened = 0;
    this.stepK = [];      // how much of each tideSteps share landed (Wave.depth)
    this.strain = 0;      // health drained a second (hurt less healed), share of max, smoothed
    this.low = 1;         // how low the bar has been lately: follows it down at once, up slowly
    this.lastTaken = 0;
    this.lastHealed = 0;
    this.deathTimer = 0;
    this.cacheTimer = cfg.cacheFirst;
    this.merchantTimer = cfg.eggVendorFirst;   // after dawn only (Wave.beans)
    this.beansDue = null;        // when she arrives after the boss that just fell
    this.beansLast = -Infinity;  // when she last came
    // What each timer was last set to, so a countdown bar knows its length.
    this.cacheEvery = cfg.cacheFirst;
    this.merchantEvery = cfg.eggVendorFirst;
    this.endlessBossEvery = cfg.endlessFirstBoss;
    this.endlessEventEvery = cfg.endlessFirstEvent;
    this.coffinDone = false;
    this.coffinTimer = cfg.coffinTime;
    this.gravebladeDone = false;
    this.glaiveDone = false;
  };

  /** THE NIGHT'S OWN CLOCK: the run's time less the time the finale took.
   *
   *  The run clock keeps running through a finale while the wave director
   *  stands still, and everything the director does after it - how tough a
   *  creature is, how tough a returning boss is - was read off that clock.
   *  So a five-minute fight with Brother Kael left overtime starting five
   *  minutes deep: creatures at two and a half times what they were at dawn,
   *  arriving at once. A tester beat him and died almost immediately to the
   *  ordinary horde. Overtime now resumes where the night stopped. */
  Wave.clock = function (run) {
    if (!run) return 0;
    if (run.finaleSpent) return run.time - run.finaleSpent;
    if (run.finaleBegan !== undefined) return run.finaleBegan;    // mid-finale: the night is paused
    return run.time;
  };

  /** Health/damage/xp inflation for ambient spawns. */
  Wave.enemyScale = function (time) {
    const run = WS.Game.run;
    const hyper = run.hyper ? WS.Config.hyperScale : 1;
    // The dials (map x difficulty x Hyper) ease in over the opening minutes -
    // see Config.difficultyRampStart.
    const cfg = WS.Config;
    const dial = this.map.difficulty * run.diffScale * hyper;
    const k = WS.min(1, cfg.difficultyRampStart + (1 - cfg.difficultyRampStart) * time / cfg.difficultyRampTime);
    let s = (1 + time / cfg.enemyScaleTime) * (1 + (dial - 1) * k) * this.depth(time, run);
    if (run.victorious || run.mode === 'endless') {
      s *= 1 + WS.max(0, time - WS.Config.endlessRampStart) / WS.Config.endlessEnemyRampTime;
    }
    return s;
  };

  /** Is the night's rhythm playing: built in (Config.tides) and this night
   *  a Tides night (run.tides, armed from the menu like Hyper). */
  Wave.rhythmOn = function () {
    const run = WS.Game.run;
    return !!WS.Config.tides && !!(run && run.tides);
  };

  /** How thick the ambient horde runs right now, as a multiple of the
   *  phase's pace (Config.tides; see config.js THE TIDE). */
  Wave.tide = function (time, run) {
    const cfg = WS.Config;
    if (!this.rhythmOn() || run.victorious || run.mode === 'endless') return 1;
    let f = 1;
    const nb = this.map.bosses[this.bossIndex];
    if (nb && nb.at >= time && nb.at - time < cfg.tideGather) f = 1 + (cfg.tideCrest - 1) * WS.clamp(1 - (nb.at - time) / cfg.tideGather, 0, 1);
    if (this.lull > 0) {
      // Thin at once, then ease back over the second half.
      const k = WS.clamp((cfg.tideLull - this.lull) / cfg.tideLull, 0, 1);
      f *= k < 0.5 ? cfg.tideLow : cfg.tideLow + (1 - cfg.tideLow) * (k - 0.5) * 2;
    }
    const last = this.map.phases[this.map.phases.length - 1];
    if (last && time > last.at) {
      const k = this.stepK.length ? this.stepK[this.stepK.length - 1] : 1;
      f *= 1 + (time - last.at) / cfg.tideLateRamp * k;
    }
    return f;
  };

  /** How much the night has deepened by `time`: the product of each
   *  scheduled boss's tideSteps share, each easing in once its lull is
   *  done (Config.tides). */
  Wave.depth = function (time, run) {
    const cfg = WS.Config;
    if (!this.rhythmOn() || !this.map || !cfg.tideSteps) return 1;
    let d = 1;
    const bosses = this.map.bosses;
    for (let i = 0; i < bosses.length && i < cfg.tideSteps.length; i++) {
      const k = WS.clamp((time - bosses[i].at - cfg.tideLull) / cfg.tideStepTime, 0, 1);
      if (k <= 0) break;
      d *= 1 + cfg.tideSteps[i] * k * (this.stepK[i] !== undefined ? this.stepK[i] : 0);
    }
    return d;
  };

  /** The share of the latest deepening that landed, 0 before the first. */
  Wave.lastDepth = function () {
    return this.stepK && this.stepK.length ? this.stepK[this.stepK.length - 1] : 0;
  };

  /** A boss fell: the horde draws breath (Config.tides). */
  Wave.onBossSlain = function () {
    if (this.rhythmOn()) this.lull = WS.Config.tideLull;
    const run = WS.Game.run;
    if (run && this.beansFollows(run.time)) this.beansDue = run.time + WS.Config.eggVendorDelay;
  };

  /* BEANS FOLLOWS THE BOSSES. She used to come on a clock of her own - 2:30
     and then every seven minutes - which put her at 30:30 on a night whose
     finale starts at 30:00, took your coin at 23:30 or 28:00 and then came
     back broke-handed at the breather. Now she sets up just after a boss
     falls, when its gold is on the ground, unless she was here less than
     eggVendorGap ago or the finale is less than eggVendorFinaleGap away (the
     breather visit covers that). After dawn, with no bosses scheduled, she
     keeps the old clock. */
  Wave.beansFollows = function (t) {
    const cfg = WS.Config, run = WS.Game.run;
    if (run && (run.victorious || run.mode === 'endless')) return false;
    return t - this.beansLast >= cfg.eggVendorGap && cfg.deathTime - t >= cfg.eggVendorFinaleGap;
  };
  /** The scheduled boss she will follow next, or null (then: the breather). */
  Wave.beansNext = function (t) {
    const bosses = this.map ? this.map.bosses : [];
    for (let i = this.bossIndex; i < bosses.length; i++) {
      const at = bosses[i].at;
      if (at >= this.beansLast + WS.Config.eggVendorGap && WS.Config.deathTime - at >= WS.Config.eggVendorFinaleGap) return bosses[i];
    }
    return null;
  };
  Wave.beansArrive = function (player, stay) {
    const a = WS.random() * WS.TAU;
    const far = WS.Config.eggVendorDistance;
    const b = WS.Pickup.spawn('merchant',
      WS.clamp(player.x + WS.cos(a) * far, 80, WS.CONST.WORLD_WIDTH - 80),
      WS.clamp(player.y + WS.sin(a) * far, 80, WS.CONST.WORLD_HEIGHT - 80));
    if (b) {
      b.stay = stay || WS.Config.eggVendorStay;
      this.beansLast = WS.Game.run.time;
      WS.Audio.play('beans', b.x);
      setTimeout(() => WS.Audio.babble('beans', 'Come get some beans!'), 1100);
      WS.Game.toast('Beans sets up shop', '"COME GET SOME BEANS... I MEAN EGGS!" Walk over to spend your coin. She leaves in '
        + WS.formatTime(b.stay) + '.', { kind: 'merchant' });
    }
    return b;
  };

  /** Bosses have large bases already, so their curve is gentler. */
  Wave.bossScale = function (time) {
    const run = WS.Game.run;
    const hyper = run.hyper ? WS.Config.hyperScale : 1;
    return (1 + time / WS.Config.bossScaleTime) * this.map.difficulty * run.diffScale * hyper;
  };

  /** Endless respawns draw from the tougher half of the map's roster, so a
   *  returning boss is never a step down from the last scheduled one. */
  Wave.endlessBossPool = function () {
    const bosses = this.map.bosses;
    const pool = bosses.slice(WS.floor(bosses.length / 2));
    return pool.length ? pool : [bosses[bosses.length - 1]];
  };

  Wave.spawnBoss = function (id, scale, final) {
    const player = WS.Game.player;
    const a = WS.random() * WS.TAU, far = WS.Config.bossSpawnDistance;
    const boss = WS.Enemy.spawn(id,
      WS.clamp(player.x + WS.cos(a) * far, 60, WS.CONST.WORLD_WIDTH - 60),
      WS.clamp(player.y + WS.sin(a) * far, 60, WS.CONST.WORLD_HEIGHT - 60),
      scale, true);
    if (!boss) return null;
    boss.finalBoss = !!final;
    const t = boss.template;
    /* A yell between asterisks is a stage direction - a shriek, thunder -
       not a line: it is shown without them, and nobody speaks it. */
    const cue = t.yell && /^\*(.+)\*$/.exec(t.yell.trim());
    WS.Game.announce(t.name, cue ? cue[1] : t.yell, 3.4, { kind: 'dread', art: t.art, tint: t.tint });
    WS.Audio.play('boss');
    // And it says its piece, a beat after the horn.
    if (t.yell && !cue) setTimeout(() => WS.Audio.babble(WS.Audio.voiceFor(id, t), t.yell), 650);
    WS.FX.shake(6, 0.5);
    WS.FX.screen('rgba(180,40,120,.14)', 0.4);
    return boss;
  };

  Wave.update = function (dt, run) {
    const map = this.map;
    const time = this.clock(run);
    const player = WS.Game.player;

    // Advance to the newest phase whose start time has passed.
    while (map.phases[this.phaseIndex + 1] && map.phases[this.phaseIndex + 1].at <= time) {
      this.phaseIndex++;
    }
    const phase = map.phases[this.phaseIndex];

    /* ---- ambient spawns -------------------------------------------------- */
    const curse = player.curse;
    if (this.lull > 0) this.lull -= dt;
    // How hard the night is hitting (Config.tideStrainTime).
    const taken = run.damageTaken || 0, healed = run.healingDone || 0;
    const maxHp = WS.max(1, player.maxHealth);
    const drain = dt > 0 ? ((taken - this.lastTaken) - (healed - this.lastHealed)) / dt / maxHp : 0;
    this.lastTaken = taken; this.lastHealed = healed;
    const ease = WS.min(1, dt / WS.Config.tideStrainTime);
    this.strain += (drain - this.strain) * ease;    // signed: healing pays back the blows
    const bar = player.health / maxHp;
    this.low = bar < this.low ? bar : this.low + (bar - this.low) * ease;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && phase.count > 0) {
      this.spawnTimer = phase.interval * WS.Config.spawnIntervalMult / this.tide(time, run)
        * run.diffInterval * (run.hyper ? 0.75 : 1) / (1 + WS.Config.curseSpawnRate * curse)
        * WS.Runs.oath('spawn');
      const scale = this.enemyScale(time);
      const count = WS.max(1, WS.round(phase.count * WS.Config.spawnCountMult
        * (1 + WS.Config.curseSpawnRate * curse)));
      for (let n = 0; n < count; n++) {
        const pick = WS.weightedPick(phase.roster);
        WS.Enemy.spawnRing(pick.id, WS.Config.spawnRing + WS.random() * WS.Config.spawnRingJitter, scale);
      }
      if (phase.elite && WS.random() < phase.eliteChance * WS.Runs.oath('elite')) {
        const elite = WS.Enemy.spawnRing(phase.elite, WS.Config.spawnRing + 40, scale);
        if (elite) WS.FX.notice(elite.x, elite.y, elite.template.name, '#ffb347');
      }
    }

    /* ---- scripted swarm events ------------------------------------------- */
    const ev = map.events[this.eventIndex];
    if (ev && time >= ev.at) {
      this.eventIndex++;
      WS.Game.announce(ev.text, null, 2.6);
      WS.Audio.play('warn');
      WS.Enemy.spawnCircle(ev.id, ev.count, WS.Config.swarmRing, this.enemyScale(time));
    }

    /* ---- the night deepens (Config.tides) --------------------------------- */
    const steps = this.rhythmOn() && WS.Config.tideSteps;
    if (steps && !run.victorious) {
      const i = this.deepened;
      const b = map.bosses[i];
      if (b && i < steps.length && time >= b.at + WS.Config.tideLull) {
        this.deepened++;
        const cfg = WS.Config;
        const hurt = WS.max(0, this.strain) / cfg.tideStrainFull;
        const low = WS.clamp((cfg.tideLowBar - this.low) / cfg.tideLowSpan, 0, 1);
        const k = WS.clamp(1 - WS.max(hurt, low), 0, 1);
        this.stepK[i] = k;
        if (steps[i] > 0) run.depthTaken = (run.depthTaken || 0) + k;
        /* Say what landed: a step that came in full, one that came in
           part because the night has been hurting, or none at all. Only
           for a step that has just come: switching the rhythm on mid-night
           catches up the ones it missed without a string of banners. */
        if (steps[i] > 0 && time - (b.at + WS.Config.tideLull) < 5) {
          WS.Game.announce(k >= 0.75 ? 'The night deepens.' : k >= 0.25 ? 'The night deepens, a little.' : 'The night holds back.',
            null, 2.4);
        }
      }
    }

    /* ---- scheduled bosses ------------------------------------------------ */
    const nextBoss = map.bosses[this.bossIndex];
    if (nextBoss && time >= nextBoss.at) {
      this.bossIndex++;
      const isFinal = this.bossIndex >= map.bosses.length;
      this.spawnBoss(nextBoss.id, this.bossScale(time), false);
      if (isFinal) run.finalBossSeen = true;
    }

    /* ---- supply caches --------------------------------------------------- */
    this.cacheTimer -= dt;
    if (this.cacheTimer <= 0) {
      const cfg = WS.Config;
      this.cacheTimer = this.cacheEvery = cfg.cacheEvery + WS.random() * cfg.cacheJitter;
      // Edennil brings it (src/game/airdrop.js): marked, flown in, dropped.
      WS.Airdrop.call(player);
    }

    /* ---- Beans, the egg merchant ------------------------------------------ */
    if (this.beansDue !== null && run.time >= this.beansDue) {
      this.beansDue = null;
      this.beansArrive(player);
    }
    // After dawn there are no scheduled bosses to follow: her old clock.
    if (run.victorious || run.mode === 'endless') {
      this.merchantTimer -= dt;
      if (this.merchantTimer <= 0) {
        this.merchantTimer = this.merchantEvery = WS.Config.eggVendorInterval;
        this.beansArrive(player);
      }
    }

    /* ---- the coffin of Professor Keegan, buried by mistake ---------------- */
    if (!this.coffinDone && !WS.Save.db.unlocks.characters.paladin) {
      this.coffinTimer -= dt;
      if (this.coffinTimer <= 0) {
        const a = WS.random() * WS.TAU;
        const cx = WS.clamp(player.x + WS.cos(a) * 380, 90, WS.CONST.WORLD_WIDTH - 90);
        const cy = WS.clamp(player.y + WS.sin(a) * 380, 90, WS.CONST.WORLD_HEIGHT - 90);
        if (WS.Pickup.spawn('coffin', cx, cy)) {
          this.coffinDone = true;
          WS.Game.announce('A weathered coffin lies open to the sky...',
            'Reach it. Something stirs within.', 4.0);
          WS.Audio.play('boss');
          for (let i = 0; i < 6; i++) {
            const g = (i / 6) * WS.TAU;
            WS.Enemy.spawn('skeleton', cx + WS.cos(g) * 70, cy + WS.sin(g) * 70,
              this.enemyScale(time) * 1.5);
          }
        } else this.coffinTimer = 10;   // field full; try again shortly
      }
    }

    /* ---- the graveblade: answers curdled, not a timer ------------------ */
    if (!this.gravebladeDone && !WS.Save.db.unlocks.characters.graveblade
      && player.curdleDealt >= WS.Config.gravebladeThreshold) {
      const a = WS.random() * WS.TAU;
      const cx = WS.clamp(player.x + WS.cos(a) * 300, 90, WS.CONST.WORLD_WIDTH - 90);
      const cy = WS.clamp(player.y + WS.sin(a) * 300, 90, WS.CONST.WORLD_HEIGHT - 90);
      if (WS.Pickup.spawn('graveblade', cx, cy)) {
        this.gravebladeDone = true;
        WS.Game.announce('Enough Light has rotted.', 'A blade breaks the ground where it fell.', 4.0);
        WS.Audio.play('boss');
        for (let i = 0; i < 6; i++) {
          const g = (i / 6) * WS.TAU;
          WS.Enemy.spawn('ghoul', cx + WS.cos(g) * 74, cy + WS.sin(g) * 74, this.enemyScale(time) * 1.6);
        }
      }
    }

    /* ---- the twin glaives: answer Ruinform ---------------------------- */
    if (!this.glaiveDone && !WS.Save.db.unlocks.characters.ruinseeker
      && player.metamorphoses >= WS.Config.glaiveMetas) {
      const a = WS.random() * WS.TAU;
      const cx = WS.clamp(player.x + WS.cos(a) * 300, 90, WS.CONST.WORLD_WIDTH - 90);
      const cy = WS.clamp(player.y + WS.sin(a) * 300, 90, WS.CONST.WORLD_HEIGHT - 90);
      if (WS.Pickup.spawn('twinglaive', cx, cy)) {
        this.glaiveDone = true;
        WS.Game.announce('The ruin has taken enough of you.', 'Two glaives are waiting.', 4.0);
        WS.Audio.play('boss');
      }
    }

    /* ---- Death itself, and the endless escalation ------------------------ */
    const deathTime = WS.Config.deathTime;
    if (!this.deathWarned && time >= deathTime - WS.Config.deathWarning) {
      this.deathWarned = true;
      WS.Game.announce('Something is coming.', 'Fifteen seconds.', 4.0);
      WS.Audio.play('warn');
    }
    if (time >= deathTime) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        this.deathTimer = WS.Config.deathInterval;
        this.spawnBoss('death_itself', 1, false);
      }
    }

    if (run.victorious || run.mode === 'endless') {
      this.endlessBossTimer -= dt;
      if (this.endlessBossTimer <= 0) {
        const cfg = WS.Config;
        this.endlessBosses++;
        // The cadence tightens toward a floor as overtime drags on.
        this.endlessBossTimer = this.endlessBossEvery = WS.max(cfg.endlessBossMinInterval,
          cfg.endlessBossInterval - this.endlessBosses * cfg.endlessBossInterval / cfg.endlessBossAccel);
        const pool = this.endlessBossPool();
        const pick = pool[WS.randInt(0, pool.length - 1)];
        const over = WS.max(0, time - cfg.endlessRampStart);
        this.spawnBoss(pick.id,
          this.bossScale(time) * cfg.endlessBossMult * (1 + over / cfg.endlessRampTime), false);
      }
      this.endlessEventTimer -= dt;
      if (this.endlessEventTimer <= 0) {
        this.endlessEventTimer = this.endlessEventEvery = WS.Config.endlessEventInterval;
        const phaseNow = map.phases[map.phases.length - 1];
        const pick = WS.weightedPick(phaseNow.roster);
        WS.Game.announce('The horde does not stop.', null, 2.0);
        WS.Enemy.spawnCircle(pick.id, WS.Config.endlessSurgeCount, 640, this.enemyScale(time));
      }
    }
  };

  /* THE WATCH'S TIMERS - what a boss mod would put on the screen: what is
   * coming next and how long until it does. Read-only; the HUD draws it.
   * Each entry is { kind, id, label, left, total, art, tint }, soonest
   * first. A boss or a swarm is named only once the bestiary has met it:
   * the timer is a veteran's tool, not a spoiler. */
  Wave.timers = function (run) {
    const out = [];
    if (!this.map || !run || run.map.arena || WS.Finale.running()) return out;
    const map = this.map, t = run.time;
    const met = (id) => (WS.Save.stats.bestiary[id] || WS.Save.stats.bosses[id] || 0) > 0;
    const add = (kind, id, label, left, total, art, tint) => {
      if (left > 0) out.push({ kind, id, label, left, total: WS.max(total, left, 0.001), art, tint });
    };
    // Edennil: the next call, or - with one under way - the landing.
    const inbound = WS.Airdrop.nextLanding();
    if (inbound) add('cache', 'cache', 'Edennil lands', inbound.left, inbound.total, 'cache', [1.0, 0.9, 0.6]);
    else add('cache', 'cache', 'Edennil', this.cacheTimer, this.cacheEvery, 'cache', [1.0, 0.9, 0.6]);

    let beans = null;
    const pool = WS.Pickup.pool;
    for (let i = 0; i < pool.count; i++) {
      const q = pool.active[i];
      if (q && q.kind === 'merchant') { beans = q; break; }
    }
    const BEAN = [0.9, 0.52, 0.22];
    if (beans) {
      const stay = beans.stay || WS.Config.eggVendorStay;
      add('beans', 'beans', 'Beans packs up', stay - beans.life, stay, 'egg', BEAN);
    } else if (this.beansDue !== null) {
      add('beans', 'beans', 'Beans is coming', this.beansDue - t, WS.Config.eggVendorDelay, 'egg', BEAN);
    } else if (run.victorious || run.mode === 'endless') {
      add('beans', 'beans', 'Beans', this.merchantTimer, this.merchantEvery, 'egg', BEAN);
    } else {
      // She follows a boss: count to it, and say which.
      const nb2 = this.beansNext(t);
      if (nb2) {
        const tpl2 = WS.Bosses[nb2.id];
        add('beans', 'beans', 'Beans · after ' + (met(nb2.id) && tpl2 ? tpl2.name : 'the boss'), nb2.at - t,
          WS.max(1, nb2.at - WS.max(0, this.beansLast)), 'egg', BEAN);
      } else if (WS.Finale && WS.Finale.available(run)) {
        const at = WS.Config.deathTime;
        add('beans', 'beans', 'Beans · at the breather', at - t, WS.max(1, at - WS.max(0, this.beansLast)), 'egg', BEAN);
      }
    }

    const nb = map.bosses[this.bossIndex];
    if (nb) {
      const prev = this.bossIndex > 0 ? map.bosses[this.bossIndex - 1].at : 0;
      const tpl = WS.Bosses[nb.id];
      add('boss', nb.id, met(nb.id) && tpl ? tpl.name : 'A boss', nb.at - t, nb.at - prev, 'skull', tpl && tpl.tint);
    } else if (run.victorious || run.mode === 'endless') {
      add('boss', null, 'Overtime boss', this.endlessBossTimer, this.endlessBossEvery, 'skull', [0.9, 0.3, 0.3]);
    }

    const ev = map.events[this.eventIndex];
    if (ev) {
      const prev = this.eventIndex > 0 ? map.events[this.eventIndex - 1].at : 0;
      const tpl = WS.Enemies[ev.id];
      add('swarm', ev.id, met(ev.id) && tpl ? `Swarm · ${tpl.name}` : 'Swarm', ev.at - t, ev.at - prev, 'claw', tpl && tpl.tint);
    } else if (run.victorious || run.mode === 'endless') {
      add('swarm', null, 'Horde surge', this.endlessEventTimer, this.endlessEventEvery, 'claw', [0.8, 0.5, 0.4]);
    }
    // Highmoor's weather and its standing stones.
    for (const m of WS.Moor.timers(run)) out.push(m);
    return out.sort((a, b) => a.left - b.left);
  };

  WS.WaveManager = Wave;

})(window.WS);
