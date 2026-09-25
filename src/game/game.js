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
    settle: 0,             // seconds left of the slow-down into a level-up
    player: null,
    run: null,
    arenaBounds: null,
    accumulator: 0,
    timeScale: 1,          // ramps down into a level-up and back out of it
    banner: null,
    toasts: [],
    toastSeq: 0,
    levelChoices: null,
    blessingChoices: null,
    selection: { character: null, map: null },
  };

  Game.init = function () {
    WS.FX.init();
    WS.Enemy.init();
    WS.Projectile.init();
    WS.XP.init();
    WS.Pickup.init();
    WS.Hazard.init();
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
      /* Healing that had nowhere to go. It was invisible, which made Curdled
         Light - a boon that eats precisely this - impossible to read: you
         could not tell whether you were feeding it or wasting it. */
      overhealDone: 0,
      damageByWeapon: {},
      healingBySource: {},
      overhealBySource: {},
      dps: 0, hps: 0, ohps: 0,
      _dpsWindow: [], _hpsWindow: [], _ohpsWindow: [],
      _lastDamage: 0, _lastHealing: 0, _lastOverheal: 0, _meterTick: 0,
      noHitStreak: 0,
      bestNoHitStreak: 0,
      metamorphoses: 0,
      victorious: false,
      finalBossSeen: false,
      secondBlessing: false,
      hyper: !!(WS.Save.db.unlocks.hyper[mapId] && WS.Save.db.hyperArmed),
      goldMult: map.goldMult * diff.gold,
      diffScale: diff.scale,
      diffInterval: diff.interval,
      killedBy: null,
    };
  }

  Game.startRun = function (mapId, characterId) {
    // The menu's fire goes out when the run begins.
    if (WS.Audio.setAmbience) WS.Audio.setAmbience(null);
    this.run = newRun(mapId, characterId);
    this.arenaBounds = null;
    WS.FX.clear();
    WS.Enemy.clear();
    WS.Projectile.clear();
    WS.XP.clear();
    WS.Pickup.clear();
    WS.Hazard.clear();
    WS.Familiar.reset();
    this.timeScale = 1;
    this.toasts.length = 0;
    this.banner = null;
    this.pendingLevelUps = 0;
    this._dealt = null;
    this.settle = 0;
    this.leveling = false;
    this.leveling = false;

    WS.Finale.reset();
    this.player = WS.Player.create(characterId);
    WS.WaveManager.reset(this.run.map);
    WS.Encounters.reset(this.run);
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
    /* Held on the game, exactly like levelChoices, and for the same reason:
       the draft on screen has to be reachable by something other than a
       click. The commit beat spends real time before chooseBlessing runs, so
       anything driving the game a tick at a time - a harness, a replay - can
       never get past the opening draft by clicking, only by choosing. */
    this.blessingChoices = WS.LevelUp.buildBlessingChoices(this.player);
    WS.UI.openBlessing(this.blessingChoices);
  };

  Game.beginWaves = function () {
    this.running = true;
    this.state = 'playing';
    WS.UI.enterGame();
    /* Veteran's Instincts: start the run already owed some level-ups.
     *
     * And SAY SO. At three ranks this hands the player three choice screens
     * back to back before they have taken a step, and with nothing naming the
     * reason it reads as the game malfunctioning rather than as the thing they
     * bought. The banner is up while the cards are, because a title card whose
     * clock is stopped behind an overlay is exactly what Game.update already
     * arranges. */
    const owed = this.player.startLevelUps;
    if (owed > 0) {
      const up = WS.MetaUpgrades && WS.MetaUpgrades.meta_headstart;
      this.announce(up ? up.name : 'Veteran\u2019s Instincts',
        owed === 1 ? 'One level, before the first of them arrives.'
          : `${owed} levels, before the first of them arrives.`, 3.2, { kind: 'glory' });
      this.pendingLevelUps += owed;
      this.openLevelUp();
    } else {
      /* The night opens with where you are and who is standing there. A run
         used to begin on a silent field - the survivor chosen, the place
         chosen, and nothing said about either - and every watcher has a line
         of their own in the book that was only ever read in the menu. This is
         where it belongs: first thing, in their voice, as the dark starts. */
      const run = this.run;
      const w = WS.Lore && WS.Lore.watchers && WS.Lore.watchers[run.characterId];
      const said = w && w.says ? `\u201c${w.says}\u201d` : 'Thirty minutes until dawn.';
      this.announce(run.map.name, said, 3.6, { kind: 'plain' });
    }
  };

  Game.pause = function () {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    WS.UI.openPause();
  };

  Game.resume = function () {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    WS.UI.closeOverlay();
  };

  Game.quitToMenu = function () {
    if (WS.Victory && WS.Victory.active) WS.Victory.finish();
    this.running = false;
    this.state = 'menu';
    this.player = null;
    this.run = null;
    this.arenaBounds = null;
    WS.Arena.stop();
    WS.Finale.reset();
    WS.FX.clear();
    WS.Enemy.clear();
    WS.Projectile.clear();
    WS.XP.clear();
    WS.Pickup.clear();
    WS.Hazard.clear();
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
  /** True while a full-screen overlay hides the battlefield. The renderer and
   *  the banner clock both key off this, so they can never disagree. */
  Game.overlayCovers = function () {
    return this.state === 'levelup' || this.state === 'blessing'
      || this.state === 'paused' || this.state === 'over';
  };

  /**
   * Put a title card on screen.
   *
   * `opts` decides how big the moment reads. The game has two registers and
   * both matter: a boss walking on should feel like the sky opened, and a
   * weapon evolving should feel like a gift. Everything else is a caption.
   *
   *   kind: 'plain'  a swept rule and text. The default; costs nothing.
   *         'dread'  boss arrival - portrait medallion, dark band, red sweep.
   *         'glory'  evolution, union, blessing - gold rays behind the text.
   *   art:  a creature art key, drawn into the medallion for 'dread'.
   *   tint: the medallion's palette tint.
   */
  Game.announce = function (title, subtitle, duration, opts) {
    const d = duration || 2.5;
    this.banner = {
      title, subtitle, life: d, maxLife: d,
      kind: (opts && opts.kind) || 'plain',
      art: opts && opts.art, tint: opts && opts.tint,
      seed: WS.random() * 100,
    };
  };

  /** A notice in the corner. `opts` says what kind of news it is:
   *   art   the painted mark beside it (an Icons glyph name)
   *   tint  that mark's colour, [r,g,b]
   *   kind  loot, merchant, glory, discovery, warn, watcher, system
   * All optional; a bare toast is a plain one with a rune. */
  Game.toast = function (title, body, opts) {
    const o = opts || {};
    this.toasts.push({
      title, body, life: 4.5, maxLife: 4.5,
      art: o.art, tint: o.tint, kind: o.kind || 'plain', id: ++this.toastSeq,
    });
    if (this.toasts.length > 3) this.toasts.shift();
  };

  /* ---------------------------------------------------------- level-ups -- */
  /* How long the world takes to come to a stop in front of a level-up.
     The line at the top of this file has always claimed timeScale "ramps down
     into a level-up and back out of it"; only the second half was ever true.
     A gem finished a bar and the battlefield stopped between one frame and the
     next, which is the single largest jolt in the game. */
  const SETTLE = 0.16;

  /** The Breaking Point the auto-take should take off this draft, or null.
   *
   *  It used to wait until every other card was a loaf, on the theory that
   *  anything else was a real choice. In play that meant it almost never
   *  fired: a late draft is Breaking Point beside a weapon rank or a stat the
   *  player has been passing over for ten minutes, and "turned it on and it
   *  does nothing" was the report. So it takes Breaking Point whenever it is
   *  offered - that is what switching it on says - except beside an
   *  evolution or a union. Those are rare and they are the build; losing one
   *  to a setting would be worse than one more card screen. */
  Game.autoBreakingPoint = function (choices) {
    if (!WS.Save.settings.autoBreakingPoint || !choices) return null;
    const bp = choices.find((c) => c.type === 'breaking_point');
    if (!bp) return null;
    if (choices.some((c) => c.type === 'evolve' || c.type === 'union')) return null;
    return bp;
  };

  Game.openLevelUp = function () {
    if (this.leveling || this.pendingLevelUps <= 0) return;
    /* Taken without stopping at all: no slow-down, no cards, just a word
       over the survivor. The draft is dealt here so that one that turns out
       NOT to be auto-taken is the same draft the player then sees. */
    if (this.state === 'playing' && WS.Save.settings.autoBreakingPoint) {
      const choices = WS.LevelUp.buildChoices(this.player);
      const bp = this.autoBreakingPoint(choices);
      if (bp) {
        WS.LevelUp.apply(this.player, bp);
        this.pendingLevelUps--;
        const p = this.player;
        WS.FX.notice(p.x, p.y - 30, 'Breaking Point', '#ffb347');
        WS.Audio.play('gem');
        if (this.pendingLevelUps > 0) this.openLevelUp();
        return;
      }
      this._dealt = choices;
    }
    this.leveling = true;
    /* Nothing to slow down when a choice is already on screen: this is the
       second of a stacked pair and the world stopped for the first one. */
    if (this.state === 'playing' && this.running && !this.suspended) {
      this.settle = SETTLE;
      return;
    }
    this.presentLevelUp();
  };

  Game.presentLevelUp = function () {
    this.settle = 0;
    this.timeScale = 1;
    this.state = 'levelup';
    this.levelChoices = this._dealt || WS.LevelUp.buildChoices(this.player);
    this._dealt = null;

    /* The auto-take again, for a level that arrives while a card screen is
       already up (openLevelUp takes the rest before the world ever slows).
       Rule in Game.autoBreakingPoint. */
    {
      const bp = this.autoBreakingPoint(this.levelChoices);
      if (bp) {
        this.state = 'playing';
        this.chooseLevelUp(bp);
        return;
      }
    }
    WS.Audio.play('level');
    /* Do NOT release held keys here. The browser only auto-repeats keydown for
     * the most recently pressed key, so wiping the direction state mid-hold
     * loses every other one: a player running north-east on W+D came out of a
     * level-up running east. Nothing needs releasing anyway - the window keeps
     * focus, so the keyups still arrive, and the simulation is frozen while
     * the overlay is up. Input.releaseAll is for input we genuinely cannot
     * observe the end of: window blur, and lifting the touch stick. */
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
      this.timeScale = 0.25;      // the world comes back up to speed
      WS.UI.closeOverlay();
    }
  };

  Game.rerollLevelUp = function () {
    if (this.player.rerolls <= 0) return false;
    this.player.rerolls--;
    this.levelChoices = WS.LevelUp.buildChoices(this.player);
    WS.Audio.play('ui');
    WS.UI.fillLevelChoices(this.levelChoices);
    return true;
  };

  Game.banishLevelUp = function (choice) {
    if (this.player.banishes <= 0) return false;
    if (!WS.LevelUp.banish(this.player, choice)) return false;
    this.player.banishes--;
    this.levelChoices = WS.LevelUp.buildChoices(this.player);
    WS.Audio.play('ui');
    WS.UI.fillLevelChoices(this.levelChoices);
    return true;
  };

  /* The drafts that interrupt a run already under way: the midpoint one,
     and the one the finale's breather hands out at dawn. */
  const DRAFTS = {
    second: ['The Second Blessing', 'Halfway. The dark has taken your measure.',
      'Halfway to dawn. One more.'],
    third: ['The Third Blessing', 'The night is over. The one who made it is not.',
      'Dawn. One last gift, for what is coming.'],
  };

  /** A draft mid-run. Unlike the opening one the run is already going, so
   *  this stops it rather than starting it. */
  Game.offerBlessing = function (kind) {
    const choices = WS.LevelUp.buildBlessingChoices(this.player);
    if (!choices.length) return;        // nothing left unheld: say nothing
    const words = DRAFTS[kind] || DRAFTS.second;
    this.blessingChoices = choices;
    this.state = 'blessing';
    this.timeScale = 1;
    WS.Audio.play('evolve');
    /* Named, because a choice screen that arrives unannounced in the middle
       of a fight reads as the game interrupting you rather than as a thing
       the run had been building toward. The banner's clock is stopped behind
       an overlay, so it plays when the cards clear. */
    this.announce(words[0], words[1], 3.2, { kind: 'glory' });
    WS.UI.openBlessing(choices, words[2]);
  };

  Game.chooseBlessing = function (choice) {
    WS.LevelUp.apply(this.player, choice);
    WS.UI.closeOverlay();
    /* Which draft was that? The opening one happens before the first wave and
       has to start it; the midpoint one interrupts a run that is already
       under way and has to hand it back. `running` is the difference and
       needs no flag of its own. */
    if (!this.running) { this.beginWaves(); return; }
    this.state = 'playing';
    this.timeScale = 0.25;              // the world comes back up to speed
  };

  /* ------------------------------------------------------- run outcomes -- */
  /** Thirty minutes held: the win is banked whatever happens next. */
  Game.bankVictory = function () {
    const run = this.run;
    if (run.victorious) return false;
    run.victorious = true;
    WS.Save.stats.totalVictories++;
    WS.Save.db.unlocks.hyper[run.mapId] = true;
    WS.Save.save();
    this.state = 'over';
    this.running = false;
    WS.Achievements.check();
    return true;
  };

  Game.victory = function () {
    if (!this.bankVictory()) return;
    this.celebrate();
  };

  /** 30:00 on a map with a finale. The win is banked exactly as it always
   *  was, but the dawn is not the end of the story yet: the panel offers
   *  the finale beside the endless options, and the cinematic waits for
   *  whichever ending the player actually reaches. */
  Game.reachDawn = function () {
    if (!this.bankVictory()) return;
    WS.Audio.play('victory');
    WS.FX.screen('rgba(245,197,107,.3)', 1.0);
    WS.UI.openVictory();
  };

  /** Back into the run from the dawn panel, to face the finale. */
  Game.faceFinale = function () {
    this.running = true;
    this.state = 'playing';
    WS.UI.closeOverlay();
    WS.Finale.begin(this.run);
  };

  /** The finale is beaten. The story ends here, so the dawn plays here. */
  Game.finaleVictory = function () {
    this.state = 'over';
    this.running = false;
    WS.Achievements.check();
    this.celebrate();
  };

  Game.celebrate = function () {
    const run = this.run;
    /* Thirty minutes of holding the line earns more than a panel sliding up.
     *
     * The prologue's last line is "Hold until the light comes back"; this is
     * the light coming back, starring whoever the player actually ran. It is
     * off by one setting for anyone who has seen it and would rather have the
     * numbers, and it hands over to the same panel when it ends or is skipped
     * - so nothing downstream of here has to know whether it played. */
    const wanted = WS.Save.settings.victoryCinematic !== false;
    if (wanted && WS.Victory
      && WS.Victory.begin(this.player, run, () => WS.UI.openVictory())) {
      run.sunriseSeen = true;          // the claim that follows does not replay it
      return;
    }

    WS.Audio.play('victory');
    WS.FX.screen('rgba(245,197,107,.35)', 1.2);
    this.announce('Victory!', 'The battlefield is yours. Fight on, or claim it.', 4.0,
      { kind: 'glory' });
    WS.UI.openVictory();
  };

  /** "Stay for Death": play on past dawn. The win is already banked; the
   *  overtime rules in WaveManager (a climbing horde, returning bosses on a
   *  tightening clock, Death every minute) are what this walks into. */
  Game.continueEndless = function () {
    this.run.mode = 'endless';
    this.run.victorious = true;
    this.running = true;
    this.state = 'playing';
    WS.UI.closeOverlay();
    this.announce('Overtime', 'Death walks on every minute. Nothing is coming to save you.', 3.0);
  };

  /* The last second and a half.
   *
   * Running out of health used to be instantaneous: the survivor stopped being
   * drawn and a results panel slid over the top of the field they died on. A
   * run is half an hour of accumulated build and it ended like a dropped
   * connection - no moment, nothing to watch, no beat to feel it in.
   *
   * So death is a STATE now. The simulation stops dead - which is right, and
   * not a shortcut: everything that was about to kill you is frozen mid-stride
   * where it was, so the last frame is the picture of what actually got you -
   * while the survivor goes to a knee and over, their light goes out, and only
   * then does the panel arrive.
   */
  Game.beginDeath = function () {
    if (this.state === 'dying') return;
    this.state = 'dying';
    this.deathTimer = WS.Config.deathBeat;
    this.running = false;
    WS.FX.shake(9, 0.5);
    /* The ember leaving. Everything the survivor was carrying goes back out
       into the dark, which is the one image the whole game is about. */
    if (this.player) WS.FX.burst(this.player.x, this.player.y, 18, '#f5c56b', 90, 1.4, 3.5);
    WS.Audio.play('death');
    WS.Audio.setIntensity(0);
    WS.Audio.setBoss(null);
    // Bank it now. Whatever happens in the next second and a half, the run
    // has already earned what it earned.
    WS.Save.flush();
  };

  /** 0..1 through the death, for whatever wants to fade with it. */
  Game.deathProgress = function () {
    if (this.state !== 'dying') return 0;
    return WS.clamp(1 - this.deathTimer / WS.max(0.01, WS.Config.deathBeat), 0, 1);
  };

  Game.endRun = function (reason) {
    /* Once per RUN, not once per "state is over". The dawn panel and the
       finale's own victory both park the game in 'over' with nothing running
       while they wait for a choice - so a guard on the state turned "Claim
       the win" into a button that did nothing at all. What must not happen
       twice is banking the run, and the run can say whether that has
       happened. */
    const done = this.run;
    if (!done || done.ended) return;
    done.ended = true;
    this.running = false;
    this.state = 'over';
    const run = this.run;
    const stats = WS.Save.stats;

    stats.totalTime += run.time;
    stats.bestRunTime = WS.max(stats.bestRunTime, run.time);
    stats.bestBossesInRun = WS.max(stats.bestBossesInRun, run.bossesSlain);
    stats.bestDamage = WS.max(stats.bestDamage, run.damageDone);
    stats.deathsSlain = (stats.deathsSlain || 0) + run.deathsSlain;
    stats.bestNoHitStreak = WS.max(stats.bestNoHitStreak, run.bestNoHitStreak);
    stats.bestTime[run.mapId] = WS.max(stats.bestTime[run.mapId] || 0, run.time);
    WS.Save.save();
    WS.Achievements.check();
    WS.Save.save();

    /* No death sound here.
     *
     * It plays in beginDeath, at the blow - and the only way to reach
     * endRun('defeated') is through beginDeath, because 'dying' has one
     * entrance and one exit. So this was a second play of the same kit a
     * second and a half after the first, at the moment the results panel
     * arrived: you heard yourself die twice. It came in with the death
     * animation, which put a beat between the blow and the panel where there
     * had not been one before. */
    if (reason === 'defeated') WS.FX.screen('rgba(226,72,61,.35)', 1.0);
    WS.Arena.stop();
    WS.Finale.reset();
    WS.UI.openGameOver(reason);
  };

  /* -------------------------------------------------------------- tick --- */
  Game.tick = function (dt) {
    const run = this.run;
    const player = this.player;
    run.time += dt;

    // Rolling ten-second DPS/HPS, sampled four times a second - the HUD reads
    // these directly, so they must be cheap and never allocate per tick.
    run._meterTick -= dt;
    if (run._meterTick <= 0) {
      run._meterTick = 0.25;
      const dmg = run.damageDone - run._lastDamage;
      const heal = run.healingDone - run._lastHealing;
      const over = run.overhealDone - run._lastOverheal;
      run._lastDamage = run.damageDone;
      run._lastHealing = run.healingDone;
      run._lastOverheal = run.overhealDone;
      run._dpsWindow.push(dmg);
      run._hpsWindow.push(heal);
      run._ohpsWindow.push(over);
      if (run._dpsWindow.length > 40) {
        run._dpsWindow.shift(); run._hpsWindow.shift(); run._ohpsWindow.shift();
      }
      let ds = 0, hs = 0, os = 0;
      for (let i = 0; i < run._dpsWindow.length; i++) {
        ds += run._dpsWindow[i]; hs += run._hpsWindow[i]; os += run._ohpsWindow[i];
      }
      const span = run._dpsWindow.length * 0.25;
      run.dps = span > 0 ? ds / span : 0;
      run.hps = span > 0 ? hs / span : 0;
      run.ohps = span > 0 ? os / span : 0;
    }
    /* What the build is doing in the last stretch before dawn - the finale
       sizes itself to it (Finale.power). Two minutes, not the HUD's ten
       seconds, so one lucky screen-clear does not set the boss's health. */
    if (!run.dawnMark && run.time >= WS.Config.deathTime - WS.Config.finalePowerWindow) {
      run.dawnMark = { t: run.time, d: run.damageDone };
    }

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
    else if (WS.Finale.running()) WS.Finale.update(dt);
    else WS.WaveManager.update(dt, run);
    if (!this.running) return;
    WS.Encounters.update(dt, run);

    WS.Enemy.update(dt);
    if (!this.running) return;
    WS.Projectile.update(dt);
    if (!this.running) return;
    WS.Familiar.update(dt);
    WS.XP.update(dt);
    if (!this.running) return;
    /* Gathering is the one system that must stop the moment a level is owed,
       or a gem swept up on the way into the choice stacks a second one behind
       it. Everything below keeps running: the settle is 160ms of real ticks
       now, and freezing the particles while the enemies still walk would read
       as a stall rather than a slow-down. */
    if (!this.leveling) WS.Pickup.update(dt);
    if (!this.running) return;
    WS.Hazard.update(dt);
    if (!this.running) return;
    WS.FX.update(dt);

    /* Halfway. One more blessing, and only one.
     *
     * The draft that opens a run was the only one there had ever been, even
     * though everything around it was built for more: buildBlessingChoices
     * filters out anything already taken, and the survivor carries a set of
     * what they hold and a LIST of names. Fifteen minutes in is the middle of
     * the thirty, which is where a run stops being a build and starts being a
     * defence - and it is late enough that the choice is made knowing what
     * the build actually became. */
    const at = WS.Config.secondBlessingAt;
    if (at > 0 && !run.secondBlessing && !run.map.arena && !run.victorious
      && run.time >= at) {
      run.secondBlessing = true;
      this.offerBlessing();
      return;
    }

    /* Victory is banked the moment the survivor reaches 30:00 - and on a map
       with a finale, that is also where the choice is: face what made the
       night, or wait for Death. */
    if (!run.victorious && !run.map.arena && !WS.Finale.running()
      && run.time >= WS.Config.deathTime) {
      if (WS.Finale.available(run)) this.reachDawn();
      else this.victory();
      return;
    }

    WS.Audio.setIntensity(this.danger());
    /* And WHAT it is, not only how bad. Intensity is a dial the score turns
       slowly; a boss is an event, and the layer it brings in has to arrive
       with it rather than ease in behind it. Death gets its own word because
       the last boss in the game is not the same kind of trouble as the
       others. */
    const lead = WS.Enemy.leadBoss();
    WS.Audio.setBoss(lead
      ? (lead.template && lead.template.family === 'death' ? 'death' : 'boss')
      : null);
  };

  /* How bad is it, right now, 0 to 1.
   *
   * This drove the score, and it was one expression: crowd size and elapsed
   * time, added together. Which meant the music did not know a boss had walked
   * onto the field, did not know the survivor was two hits from dead, and rose
   * steadily whether or not anything was happening - the one thing a score
   * must never do is be the same at the worst moment of a run as at the
   * calmest, and at minute twenty-five with a full field it was pinned at 1
   * either way.
   *
   * So it is the MAXIMUM of named dangers rather than a sum. Danger does not
   * average: a survivor at nine health with an empty field is not in a calm
   * moment, and adding a small crowd term to it would say otherwise. Each term
   * below is one sentence about the run, and the loudest one wins.
   */
  Game.danger = function () {
    const run = this.run, p = this.player;
    if (!run || !p) return 0;
    const cfg = WS.Config;

    // The field, filling.
    let d = WS.min(1, WS.Enemy.count() / 130) * 0.7;
    // The night, wearing on. A floor, not a ceiling - late is tense even empty.
    d = WS.max(d, WS.min(1, run.time / cfg.deathTime) * 0.5);
    // A boss, and how far into it you are: it tightens as the boss weakens,
    // because the end of a boss is the part that decides the run.
    const boss = WS.Enemy.leadBoss();
    if (boss) {
      const left = WS.clamp(boss.health / WS.max(1, boss.maxHealth), 0, 1);
      d = WS.max(d, 0.7 + 0.25 * (1 - left));
      // Death itself is not a boss fight, it is the end of one.
      if (boss.template.family === 'death') d = 1;
    }
    // And the survivor, in trouble. Loudest of all, because it is the only one
    // that is about the player rather than the field.
    const hp = p.health / WS.max(1, p.maxHealth);
    if (hp < 0.35) d = WS.max(d, 0.72 + 0.28 * (1 - hp / 0.35));
    return WS.clamp(d, 0, 1);
  };

  /** Fixed-step update with a catch-up cap, so one frame hitch never turns
   *  into a death spiral of simulation ticks. */
  /* How often the account is written out while a run is going. Ten seconds is
   * far more often than it needs to be and still costs a fraction of one
   * frame a minute; the ceiling on what a crash can cost is what matters. */
  const AUTOSAVE = 10;
  Game.autosaveTimer = AUTOSAVE;

  /* Set from a media query that matches the one showing the rotate prompt.
   * A player who cannot see the battlefield must not be dying on it, so the
   * simulation stops while the prompt is up - but only the SIMULATION. The
   * account still autosaves, because a phone turned upright is one of the
   * likelier moments for a tab to be swallowed. */
  Game.suspended = false;

  Game.watchOrientation = function () {
    if (!window.matchMedia) return;
    const q = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
    const apply = () => { Game.suspended = q.matches; };
    apply();
    if (q.addEventListener) q.addEventListener('change', apply);
    else if (q.addListener) q.addListener(apply);
  };

  Game.update = function (frameDt) {
    // Real time, not simulation time: a paused or level-up-frozen game has
    // still earned everything it earned, and should not be holding it.
    if (this.state !== 'menu') {
      this.autosaveTimer -= frameDt;
      if (this.autosaveTimer <= 0) {
        this.autosaveTimer = AUTOSAVE;
        WS.Save.flush();
      }
    }

    /* A title card that expires behind a level-up menu was never seen, and a
     * half-faded one bleeding through the cards reads as a rendering fault -
     * which is exactly what it looked like. So the banner's clock stops while
     * a full-screen choice is open and the card resumes when play does. Toasts
     * keep running: they live in the corner and nothing covers them. */
    if (this.banner && !this.overlayCovers()) {
      this.banner.life -= frameDt;
      if (this.banner.life <= 0) this.banner = null;
    }
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= frameDt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }

    /* Dying runs on real time with the simulation stopped: the particles from
       the blow that killed you keep settling, and nothing else moves. */
    if (this.state === 'dying') {
      WS.FX.update(frameDt);
      this.deathTimer -= frameDt;
      if (this.deathTimer <= 0) this.endRun('defeated');
      return;
    }

    if (this.state !== 'playing' || !this.running || this.suspended) {
      if (this.state === 'levelup' || this.state === 'paused') WS.FX.update(frameDt);
      return;
    }

    WS.Input.poll();

    // Hit-stop: the world holds for a beat so a heavy kill has weight. The
    // accumulator is not fed while it runs, so no time is owed afterwards.
    if (WS.FX.hitStop > 0) {
      WS.FX.hitStop -= frameDt;
      WS.FX.update(frameDt);
      return;
    }

    /* Coming to a stop in front of a level-up. The simulation keeps running,
       just slower and slower, so the last thing the player sees before the
       cards is their own shot finishing its arc. */
    if (this.settle > 0) {
      this.settle = WS.max(0, this.settle - frameDt);
      this.timeScale = WS.max(0.05, this.settle / SETTLE);
      if (this.settle <= 0) { this.presentLevelUp(); return; }
    }

    const step = WS.CONST.TICK_RATE;
    this.accumulator += WS.min(frameDt, 0.25) * this.timeScale;
    let ticks = 0;
    while (this.accumulator >= step && ticks < WS.CONST.MAX_TICKS_PER_FRAME) {
      this.accumulator -= step;
      ticks++;
      this.tick(step);
      if (this.state !== 'playing') break;
    }
    if (ticks >= WS.CONST.MAX_TICKS_PER_FRAME) this.accumulator = 0;
    if (this.timeScale < 1 && this.settle <= 0) {
      this.timeScale = WS.min(1, this.timeScale + frameDt * 2.2);
    }
  };

  WS.Game = Game;

})(window.WS);
