/* Orchestration: run lifecycle, the fixed-step simulation, banners and toasts,
 * gold, victory and defeat. The UI layer reads this state and never mutates the
 * simulation directly. */
'use strict';
(function (WS) {

  const Game = {
    state: 'menu',      // menu | blessing | playing | levelup | paused | over
    running: false,
    leveling: false,
    pendingLevelUps: 0,
    player: null,
    run: null,
    arenaBounds: null,
    accumulator: 0,
    banner: null,
    toasts: [],
    levelChoices: null,
    selection: { character: null, map: null },
  };

  Game.init = function () {
    WS.FX.init();
    WS.Enemy.init();
    WS.Projectile.init();
    WS.XP.init();
    WS.Pickup.init();
    WS.Familiar.init();
    this.selection.character = WS.Config.startCharacter;
    this.selection.map = WS.Config.startMap;
  };

  /* --------------------------------------------------------------- run --- */
  function newRun(mapId, characterId) {
    const map = WS.Maps[mapId];
    const diffId = WS.Save.settings.difficulty;
    const diff = WS.Config.difficulties[diffId] || WS.Config.difficulties.veteran;
    return {
      mapId, map, characterId,
      time: 0,
      mode: 'normal',
      kills: 0,
      gold: 0,
      gemsCollected: 0,
      bossesSlain: 0,
      deathsSlain: 0,
      damageDone: 0,
      damageTaken: 0,
      damagePrevented: 0,
      healingDone: 0,
      damageByWeapon: {},
      healingBySource: {},
      noHitStreak: 0,
      bestNoHitStreak: 0,
      metamorphoses: 0,
      victorious: false,
      finalBossSeen: false,
      hyper: !!(WS.Save.db.unlocks.hyper[mapId] && WS.Save.db.hyperArmed),
      goldMult: map.goldMult * diff.gold,
      diffScale: diff.scale,
      diffInterval: diff.interval,
      killedBy: null,
    };
  }

  Game.startRun = function (mapId, characterId) {
    this.run = newRun(mapId, characterId);
    this.arenaBounds = null;
    WS.FX.clear();
    WS.Enemy.clear();
    WS.Projectile.clear();
    WS.XP.clear();
    WS.Pickup.clear();
    WS.Familiar.reset();
    this.toasts.length = 0;
    this.banner = null;
    this.pendingLevelUps = 0;
    this.leveling = false;

    this.player = WS.Player.create(characterId);
    WS.WaveManager.reset(this.run.map);
    WS.Renderer.buildScenery(this.run.map);

    WS.Save.stats.totalRuns++;
    WS.Save.save();

    if (this.run.map.arena) {
      // The arena hands out a ready-made kit and skips the blessing draft.
      WS.Player.grantArenaLoadout(this.player);
      this.running = true;
      this.state = 'playing';
      WS.Arena.begin();
      WS.Audio.playMusic(this.run.map.music);
      WS.UI.enterGame();
      return;
    }

    // Every run opens with a blessing draft, then the first wave.
    this.state = 'blessing';
    this.running = false;
    WS.Audio.playMusic(this.run.map.music);
    WS.UI.openBlessing(WS.LevelUp.buildBlessingChoices(this.player));
  };

  Game.beginWaves = function () {
    this.running = true;
    this.state = 'playing';
    WS.UI.enterGame();
    // Veteran's Instincts: start the run already owed some level-ups.
    if (this.player.startLevelUps > 0) {
      this.pendingLevelUps += this.player.startLevelUps;
      this.openLevelUp();
    }
  };

  Game.pause = function () {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    WS.Input.releaseAll();
    WS.UI.openPause();
  };

  Game.resume = function () {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    WS.UI.closeOverlay();
  };

  Game.quitToMenu = function () {
    this.running = false;
    this.state = 'menu';
    this.player = null;
    this.run = null;
    this.arenaBounds = null;
    WS.Arena.stop();
    WS.FX.clear();
    WS.Enemy.clear();
    WS.Projectile.clear();
    WS.XP.clear();
    WS.Pickup.clear();
    WS.Familiar.reset();
    WS.Audio.playMusic('menu');
    WS.UI.openMenu();
  };

  /* ------------------------------------------------------------ economy -- */
  Game.addGold = function (amount, x, y) {
    if (amount <= 0) return;
    this.run.gold += amount;
    WS.Save.addGold(amount);
    if (x !== undefined) WS.FX.gold(x, y, amount);
  };

  /* ------------------------------------------------------- presentation -- */
  Game.announce = function (title, subtitle, duration) {
    this.banner = { title, subtitle, life: duration || 2.5, maxLife: duration || 2.5 };
  };

  Game.toast = function (title, body) {
    this.toasts.push({ title, body, life: 4.5 });
    if (this.toasts.length > 3) this.toasts.shift();
  };

  /* ---------------------------------------------------------- level-ups -- */
  Game.openLevelUp = function () {
    if (this.leveling || this.pendingLevelUps <= 0) return;
    this.leveling = true;
    this.state = 'levelup';
    this.levelChoices = WS.LevelUp.buildChoices(this.player);
    WS.Audio.play('level');
    WS.Input.releaseAll();
    WS.UI.openLevelUp(this.levelChoices);
  };

  Game.chooseLevelUp = function (choice) {
    WS.LevelUp.apply(this.player, choice);
    this.pendingLevelUps--;
    this.leveling = false;
    if (this.pendingLevelUps > 0) {
      this.openLevelUp();
    } else {
      this.state = 'playing';
      WS.UI.closeOverlay();
    }
  };

  Game.rerollLevelUp = function () {
    if (this.player.rerolls <= 0) return false;
    this.player.rerolls--;
    this.levelChoices = WS.LevelUp.buildChoices(this.player);
    WS.Audio.play('ui');
    WS.UI.openLevelUp(this.levelChoices);
    return true;
  };

  Game.banishLevelUp = function (choice) {
    if (this.player.banishes <= 0) return false;
    if (!WS.LevelUp.banish(this.player, choice)) return false;
    this.player.banishes--;
    this.levelChoices = WS.LevelUp.buildChoices(this.player);
    WS.Audio.play('ui');
    WS.UI.openLevelUp(this.levelChoices);
    return true;
  };

  Game.chooseBlessing = function (choice) {
    WS.LevelUp.apply(this.player, choice);
    WS.UI.closeOverlay();
    this.beginWaves();
  };

  /* ------------------------------------------------------- run outcomes -- */
  Game.victory = function () {
    const run = this.run;
    if (run.victorious) return;
    run.victorious = true;
    WS.Save.stats.totalVictories++;
    WS.Save.db.unlocks.hyper[run.mapId] = true;
    WS.Save.save();
    WS.Audio.play('victory');
    WS.FX.screen('rgba(245,197,107,.35)', 1.2);
    this.announce('Victory!', 'The battlefield is yours. Fight on, or claim it.', 4.0);
    this.state = 'over';
    this.running = false;
    WS.Achievements.check();
    WS.UI.openVictory();
  };

  Game.continueEndless = function () {
    this.run.mode = 'endless';
    this.running = true;
    this.state = 'playing';
    WS.UI.closeOverlay();
    this.announce('True Endless', 'Nothing is coming to save you.', 3.0);
  };

  Game.endRun = function (reason) {
    if (!this.running && this.state === 'over') return;
    this.running = false;
    this.state = 'over';
    const run = this.run;
    const stats = WS.Save.stats;

    stats.totalTime += run.time;
    stats.bestRunTime = WS.max(stats.bestRunTime, run.time);
    stats.bestBossesInRun = WS.max(stats.bestBossesInRun, run.bossesSlain);
    stats.bestDamage = WS.max(stats.bestDamage, run.damageDone);
    stats.bestNoHitStreak = WS.max(stats.bestNoHitStreak, run.bestNoHitStreak);
    stats.bestTime[run.mapId] = WS.max(stats.bestTime[run.mapId] || 0, run.time);
    WS.Save.save();
    WS.Achievements.check();
    WS.Save.save();

    if (reason === 'defeated') {
      WS.Audio.play('death');
      WS.FX.screen('rgba(226,72,61,.35)', 1.0);
    }
    WS.Arena.stop();
    WS.UI.openGameOver(reason);
  };

  /* -------------------------------------------------------------- tick --- */
  Game.tick = function (dt) {
    const run = this.run;
    const player = this.player;
    run.time += dt;

    run.noHitStreak += dt;
    run.bestNoHitStreak = WS.max(run.bestNoHitStreak, run.noHitStreak);
    // The streak achievement is checked live, so it can fire mid-run.
    if (run.noHitStreak >= 180 && !WS.Save.db.achievements.lights_favor) {
      WS.Save.stats.bestNoHitStreak = WS.max(WS.Save.stats.bestNoHitStreak, run.noHitStreak);
      WS.Achievements.check();
    }

    WS.Player.update(player, dt);
    if (!this.running) return;

    if (run.map.arena) WS.Arena.update(dt);
    else WS.WaveManager.update(dt, run);
    if (!this.running) return;

    WS.Enemy.update(dt);
    if (!this.running) return;
    WS.Projectile.update(dt);
    if (!this.running) return;
    WS.Familiar.update(dt);
    WS.XP.update(dt);
    if (!this.running || this.leveling) return;
    WS.Pickup.update(dt);
    if (!this.running) return;
    WS.FX.update(dt);

    // Victory is banked the moment the survivor reaches 30:00.
    if (!run.victorious && !run.map.arena && run.time >= WS.Config.deathTime) {
      this.victory();
      return;
    }

    // The score tightens as the field fills and the clock runs down.
    WS.Audio.setIntensity(WS.min(1,
      WS.Enemy.count() / 90 * 0.6 + WS.min(1, run.time / 1500) * 0.4));
  };

  /** Fixed-step update with a catch-up cap, so one frame hitch never turns
   *  into a death spiral of simulation ticks. */
  Game.update = function (frameDt) {
    // Banners and toasts keep running while the game is paused or choosing.
    if (this.banner) {
      this.banner.life -= frameDt;
      if (this.banner.life <= 0) this.banner = null;
    }
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= frameDt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }

    if (this.state !== 'playing' || !this.running) {
      if (this.state === 'levelup' || this.state === 'paused') WS.FX.update(frameDt);
      return;
    }

    WS.Input.poll();
    const step = WS.CONST.TICK_RATE;
    this.accumulator += WS.min(frameDt, 0.25);
    let ticks = 0;
    while (this.accumulator >= step && ticks < WS.CONST.MAX_TICKS_PER_FRAME) {
      this.accumulator -= step;
      ticks++;
      this.tick(step);
      if (this.state !== 'playing') break;
    }
    if (ticks >= WS.CONST.MAX_TICKS_PER_FRAME) this.accumulator = 0;
  };

  WS.Game = Game;

})(window.WS);
