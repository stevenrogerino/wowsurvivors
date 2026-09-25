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
    this.deathTimer = 0;
    this.cacheTimer = cfg.cacheFirst;
    this.merchantTimer = cfg.eggVendorFirst;
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

  /** Health/damage/xp inflation for ambient spawns. */
  Wave.enemyScale = function (time) {
    const run = WS.Game.run;
    const hyper = run.hyper ? WS.Config.hyperScale : 1;
    let s = (1 + time / WS.Config.enemyScaleTime) * this.map.difficulty * run.diffScale * hyper;
    if (run.victorious || run.mode === 'endless') {
      s *= 1 + WS.max(0, time - WS.Config.endlessRampStart) / WS.Config.endlessEnemyRampTime;
    }
    return s;
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
    const time = run.time;
    const player = WS.Game.player;

    // Advance to the newest phase whose start time has passed.
    while (map.phases[this.phaseIndex + 1] && map.phases[this.phaseIndex + 1].at <= time) {
      this.phaseIndex++;
    }
    const phase = map.phases[this.phaseIndex];

    /* ---- ambient spawns -------------------------------------------------- */
    const curse = player.curse;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && phase.count > 0) {
      this.spawnTimer = phase.interval * WS.Config.spawnIntervalMult
        * run.diffInterval * (run.hyper ? 0.75 : 1) / (1 + WS.Config.curseSpawnRate * curse);
      const scale = this.enemyScale(time);
      const count = WS.max(1, WS.round(phase.count * WS.Config.spawnCountMult
        * (1 + WS.Config.curseSpawnRate * curse)));
      for (let n = 0; n < count; n++) {
        const pick = WS.weightedPick(phase.roster);
        WS.Enemy.spawnRing(pick.id, WS.Config.spawnRing + WS.random() * WS.Config.spawnRingJitter, scale);
      }
      if (phase.elite && WS.random() < phase.eliteChance) {
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
      const a = WS.random() * WS.TAU;
      WS.Pickup.spawn('cache',
        WS.clamp(player.x + WS.cos(a) * cfg.cacheDistance, 60, WS.CONST.WORLD_WIDTH - 60),
        WS.clamp(player.y + WS.sin(a) * cfg.cacheDistance, 60, WS.CONST.WORLD_HEIGHT - 60));
    }

    /* ---- Beans, the egg merchant ------------------------------------------ */
    this.merchantTimer -= dt;
    if (this.merchantTimer <= 0) {
      this.merchantTimer = this.merchantEvery = WS.Config.eggVendorInterval;
      const a = WS.random() * WS.TAU;
      const far = WS.Config.eggVendorDistance;
      if (WS.Pickup.spawn('merchant',
        WS.clamp(player.x + WS.cos(a) * far, 80, WS.CONST.WORLD_WIDTH - 80),
        WS.clamp(player.y + WS.sin(a) * far, 80, WS.CONST.WORLD_HEIGHT - 80))) {
        WS.Game.toast('Beans sets up shop', '"COME GET SOME BEANS... I MEAN EGGS!" Walk over to spend your coin. She leaves in '
          + WS.formatTime(WS.Config.eggVendorStay) + '.', { kind: 'merchant' });
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
    add('cache', 'cache', 'Supply cache', this.cacheTimer, this.cacheEvery, 'cache', [1.0, 0.9, 0.6]);

    let beans = null;
    const pool = WS.Pickup.pool;
    for (let i = 0; i < pool.count; i++) {
      const q = pool.active[i];
      if (q && q.kind === 'merchant') { beans = q; break; }
    }
    const stay = WS.Config.eggVendorStay;
    if (beans) add('beans', 'beans', 'Beans packs up', stay - beans.life, stay, 'egg', [0.9, 0.52, 0.22]);
    else add('beans', 'beans', 'Beans', this.merchantTimer, this.merchantEvery, 'egg', [0.9, 0.52, 0.22]);

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
    return out.sort((a, b) => a.left - b.left);
  };

  WS.WaveManager = Wave;

})(window.WS);
