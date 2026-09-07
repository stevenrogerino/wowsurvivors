/* Drives each battlefield's data timeline: ambient spawn phases, scripted swarm
 * events, timed boss arrivals, supply caches, the egg merchant, and the three
 * one-shot story objects (coffin / runeblade / warglaives). Difficulty scaling
 * is a function of elapsed time times the map's difficulty knob. */
'use strict';
(function (WS) {

  const Wave = {};

  Wave.reset = function (map) {
    this.map = map;
    this.phaseIndex = 0;
    this.eventIndex = 0;
    this.bossIndex = 0;
    this.spawnTimer = 0.75;
    this.endlessBossTimer = 120;
    this.endlessEventTimer = 100;
    this.endlessBosses = 0;
    this.deathWarned = false;
    this.deathTimer = 0;
    this.cacheTimer = 60;
    this.merchantTimer = 150;
    this.coffinDone = false;
    this.coffinTimer = 120;
    this.runebladeDone = false;
    this.warglaiveDone = false;
  };

  /** Health/damage/xp inflation for ambient spawns. */
  Wave.enemyScale = function (time) {
    const run = WS.Game.run;
    const hyper = run.hyper ? WS.Config.hyperScale : 1;
    let s = (1 + time / WS.Config.enemyScaleTime) * this.map.difficulty * run.diffScale * hyper;
    if (run.victorious || run.mode === 'endless') {
      s *= 1 + WS.max(0, time - 1620) / WS.Config.endlessEnemyRampTime;
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
    const a = WS.random() * WS.TAU;
    const boss = WS.Enemy.spawn(id,
      WS.clamp(player.x + WS.cos(a) * 520, 60, WS.CONST.WORLD_WIDTH - 60),
      WS.clamp(player.y + WS.sin(a) * 520, 60, WS.CONST.WORLD_HEIGHT - 60),
      scale, true);
    if (!boss) return null;
    boss.finalBoss = !!final;
    const t = boss.template;
    WS.Game.announce(t.name, t.yell, 3.4);
    WS.Audio.play('boss');
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
        * run.diffInterval * (run.hyper ? 0.75 : 1) / (1 + 0.20 * curse);
      const scale = this.enemyScale(time);
      const count = WS.max(1, WS.round(phase.count * WS.Config.spawnCountMult * (1 + 0.20 * curse)));
      for (let n = 0; n < count; n++) {
        const pick = WS.weightedPick(phase.roster);
        WS.Enemy.spawnRing(pick.id, 700 + WS.random() * 160, scale);
      }
      if (phase.elite && WS.random() < phase.eliteChance) {
        const elite = WS.Enemy.spawnRing(phase.elite, 740, scale);
        if (elite) WS.FX.notice(elite.x, elite.y, elite.template.name, '#ffb347');
      }
    }

    /* ---- scripted swarm events ------------------------------------------- */
    const ev = map.events[this.eventIndex];
    if (ev && time >= ev.at) {
      this.eventIndex++;
      WS.Game.announce(ev.text, null, 2.6);
      WS.Audio.play('warn');
      WS.Enemy.spawnCircle(ev.id, ev.count, 620, this.enemyScale(time));
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
      this.cacheTimer = 75 + WS.random() * 45;
      const a = WS.random() * WS.TAU;
      WS.Pickup.spawn('cache',
        WS.clamp(player.x + WS.cos(a) * 320, 60, WS.CONST.WORLD_WIDTH - 60),
        WS.clamp(player.y + WS.sin(a) * 320, 60, WS.CONST.WORLD_HEIGHT - 60));
    }

    /* ---- the egg merchant ------------------------------------------------ */
    this.merchantTimer -= dt;
    if (this.merchantTimer <= 0) {
      this.merchantTimer = WS.Config.eggVendorInterval;
      const a = WS.random() * WS.TAU;
      if (WS.Pickup.spawn('merchant',
        WS.clamp(player.x + WS.cos(a) * 400, 80, WS.CONST.WORLD_WIDTH - 80),
        WS.clamp(player.y + WS.sin(a) * 400, 80, WS.CONST.WORLD_HEIGHT - 80))) {
        WS.Game.toast('An egg merchant sets up shop', 'Walk to the crate to spend your coin.');
      }
    }

    /* ---- the coffin of Bartholomew the Adequate -------------------------- */
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

    /* ---- the runeblade: answers desecration, not a timer ------------------ */
    if (!this.runebladeDone && !WS.Save.db.unlocks.characters.death_knight
      && player.desecrationDealt >= WS.Config.runebladeThreshold) {
      const a = WS.random() * WS.TAU;
      const cx = WS.clamp(player.x + WS.cos(a) * 300, 90, WS.CONST.WORLD_WIDTH - 90);
      const cy = WS.clamp(player.y + WS.sin(a) * 300, 90, WS.CONST.WORLD_HEIGHT - 90);
      if (WS.Pickup.spawn('runeblade', cx, cy)) {
        this.runebladeDone = true;
        WS.Game.announce('Enough Light has rotted.', 'A blade breaks the ground where it fell.', 4.0);
        WS.Audio.play('boss');
        for (let i = 0; i < 6; i++) {
          const g = (i / 6) * WS.TAU;
          WS.Enemy.spawn('ghoul', cx + WS.cos(g) * 74, cy + WS.sin(g) * 74, this.enemyScale(time) * 1.6);
        }
      }
    }

    /* ---- the warglaives: answer Metamorphosis ---------------------------- */
    if (!this.warglaiveDone && !WS.Save.db.unlocks.characters.demon_hunter
      && player.metamorphoses >= WS.Config.warglaiveMetas) {
      const a = WS.random() * WS.TAU;
      const cx = WS.clamp(player.x + WS.cos(a) * 300, 90, WS.CONST.WORLD_WIDTH - 90);
      const cy = WS.clamp(player.y + WS.sin(a) * 300, 90, WS.CONST.WORLD_HEIGHT - 90);
      if (WS.Pickup.spawn('warglaive', cx, cy)) {
        this.warglaiveDone = true;
        WS.Game.announce('The fel has taken enough of you.', 'Two glaives are waiting.', 4.0);
        WS.Audio.play('boss');
      }
    }

    /* ---- Death itself, and the endless escalation ------------------------ */
    const deathTime = WS.Config.deathTime;
    if (!this.deathWarned && time >= deathTime - 15) {
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
        this.endlessBossTimer = WS.max(cfg.endlessBossMinInterval,
          cfg.endlessBossInterval - this.endlessBosses * cfg.endlessBossInterval / cfg.endlessBossAccel);
        const pool = this.endlessBossPool();
        const pick = pool[WS.randInt(0, pool.length - 1)];
        const over = WS.max(0, time - 1620);
        this.spawnBoss(pick.id,
          this.bossScale(time) * cfg.endlessBossMult * (1 + over / cfg.endlessRampTime), false);
      }
      this.endlessEventTimer -= dt;
      if (this.endlessEventTimer <= 0) {
        this.endlessEventTimer = WS.Config.endlessEventInterval;
        const phaseNow = map.phases[map.phases.length - 1];
        const pick = WS.weightedPick(phaseNow.roster);
        WS.Game.announce('The horde does not stop.', null, 2.0);
        WS.Enemy.spawnCircle(pick.id, 22, 640, this.enemyScale(time));
      }
    }
  };

  WS.WaveManager = Wave;

})(window.WS);
