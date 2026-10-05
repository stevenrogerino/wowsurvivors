/* The survivor: stats, movement, weapon cadence, experience, damage intake,
 * and the two mirrored resource systems - Curdled Light (wasted healing becomes
 * shadow damage) and Fel (wasted overkill becomes Ruinform). */
'use strict';
(function (WS) {

  const Player = {};

  /** XP to go from `level` to `level+1`. The curve steepens sharply past a
   *  threshold so a finished build is a late-run milestone, not a coast. */
  Player.xpForLevel = function (level) {
    const c = WS.Config;
    const n = level - 1;
    let base = c.xpBase + c.xpLinear * n + n * n * c.xpQuad;
    if (level > c.xpSteepFrom) {
      const d = level - c.xpSteepFrom;
      base += d * d * c.xpSteepMag;
    }
    return WS.floor(base);
  };

  Player.create = function (characterId) {
    const c = WS.Characters[characterId];
    const p = {
      characterId,
      character: c,
      x: WS.CONST.WORLD_WIDTH * 0.5,
      y: WS.CONST.WORLD_HEIGHT * 0.5,
      radius: WS.CONST.PLAYER_RADIUS,

      maxHealth: c.maxHealth,
      health: c.maxHealth,
      healthRegen: c.healthRegen || 0,
      moveSpeed: c.moveSpeed,
      armor: c.armor,
      pickupRadius: c.pickupRadius,

      damageMultiplier: 1,
      cooldownMultiplier: 1,
      areaMultiplier: 1,
      projectileBonus: 0,
      projectileSpeed: 1,
      projectileImpact: 0,
      critChance: WS.Config.baseCritChance,
      critDamage: WS.Config.baseCritDamage,
      luck: 1,
      goldMultiplier: 1,
      xpMultiplier: 1,
      healingMult: 1,

      level: 1,
      xp: 0,
      xpToNext: Player.xpForLevel(1),

      hurtTimer: 0,

      rerolls: WS.Config.baseRerolls,
      banishes: WS.Config.baseBanishes,
      startLevelUps: 0,
      revives: 0,

      weapons: [],
      weaponLevels: {},
      upgradeLevels: {},
      banished: {},
      combosActive: {},
      blessingsTaken: {},
      blessingNames: [],
      unionsForged: {},

      curdled: 0, curdleOverheal: 0, curdleShare: 0,
      curdlePool: 0, curdleTimer: 0, curdleDealt: 0,
      felAttuned: 0, fel: 0, felBonus: 0, soulRending: 0, metaTimer: 0,
      ruinborn: 0, felLock: 0,
      metamorphoses: 0,
      // The Old Shapes and Stillwater Step - see src/game/primal.js.
      wildAttuned: 0, wild: 0, wildBonus: 0, formBonus: 0, kinship: 0,
      form: null, formTimer: 0, wildLock: 0, shifts: 0, maulTimer: 0, starTimer: 0,
      serration: 0, durationMult: 1,
      flowAttuned: 0, flowSteps: 0, flowTimer: 0, flowBonusSteps: 0, flowRechargeMult: 1,
      serenity: 0, poise: 0, poiseTimer: 0, dashes: 0, dashTrail: null,
      lastDirX: 1, lastDirY: 0,
      summonDamage: 0, summonHaste: 0,
      lifesteal: 0, lifestealCarry: 0,

      invulnerable: 0,
      regenCarry: 0,
      healBatch: 0, healBatchTimer: 1,
      moving: false,
      facing: 1,
      spinTimer: 0,
      slowTimer: 0, slowFactor: 1,
      walkCycle: 0,

      blockRank: 0, blockTimer: 0, blockInterval: 0, blockReady: false,
      chillRank: 0, curse: 0, retRank: 0, retTimer: 0,
      thornsRank: 0, dodgeChance: 0,
      limitBreaks: 0,
      runEggs: 0,

      bloodthirst: false, bloodthirstTimer: 0, leechBudget: 0, momentum: false, overflow: 0,
      // The callings - see src/game/callings.js. `*Attuned` turns one on;
      // `*Bonus` / `*Haste` / `*Reach` is the owning survivor's edge, inert
      // until then.
      overflowAttuned: 0, overflowCharge: 0, overflowBonus: 0, surgeTimer: 0,
      barrierAttuned: 0, barrier: 0, barrierBonus: 0, barrierPeak: 0, barrierLock: 0,
      comboAttuned: 0, combo: 0, comboBonus: 0, comboGate: 0, comboLock: 0, vanishTimer: 0,
      markAttuned: 0, markTarget: null, markSpawn: 0, markLife: 0, markTimer: 1.5, markHaste: 0,
      rageAttuned: 0, rage: 0, rageBonus: 0, rageIdle: 0, rageLock: 0, enrageTimer: 0,
      soulAttuned: 0, souls: 0, soulBonus: 0, soulLock: 0,
      totemAttuned: 0, totems: [], totemReach: 0, pools: [],
      emberFill: 0, springFill: 0, galeFill: 0, dpsEma: 0,
      holyAttuned: 0, holyPower: 0, holyBonus: 0, holyHit: 0, holyHeal: 0, holyLock: 0, divineTimer: 0,
      // The callings' own passives, by rank (upgrades.js), and what the
      // carry-overs keep: gems toward the Undertow, the Smoulder's stacks.
      undertow: 0, undertowGems: 0, hallowed: 0, ruthless: 0, stalker: 0,
      slowBurn: 0, smoulder: 0, smoulderTimer: 0, bountiful: 0, deepRoots: 0, fervor: 0,
    };

    // Trainer lessons first, then the survivor's own perk, so percentages
    // stack on top of trained bases.
    for (const id of Object.keys(WS.Save.db.meta)) {
      const m = WS.MetaUpgrades[id];
      const rank = WS.Save.db.meta[id];
      if (m && rank > 0) m.apply(p, rank, m);
    }
    if (c.apply) c.apply(p, c);

    Player.addWeapon(p, c.weapon);
    return p;
  };

  /* ------------------------------------------------------------ weapons -- */
  /** How far along the survivor LOOKS, 0 to Hero.maxRank.
   *
   *  Read off character level. See Config.heroRankAt. */
  Player.rank = function (p) {
    if (!p) return 0;
    const at = WS.Config.heroRankAt || [];
    let r = 0;
    for (let i = 0; i < at.length; i++) if (p.level >= at[i]) r = i + 1;
    return r;
  };

  Player.addWeapon = function (p, id) {
    if (p.weaponLevels[id]) return Player.levelWeapon(p, id);
    /* Six hands and no more, whoever is handing it over. The draft only
       offers a new weapon when there is room, but the graveblade and the
       twin glaives put theirs straight into the survivor's hands - picked
       up with six already, that was seven (a tester's screenshot). */
    if (p.weapons.length >= WS.MAX_WEAPONS) return null;
    const w = { id, data: WS.Weapons[id], level: 1, cooldown: 0.35, mods: {}, burstShots: 0, burstTimer: 0 };
    p.weapons.push(w);
    p.weaponLevels[id] = 1;
    WS.ComboSystem.check(p);
    WS.Save.stats.maxWeapons = WS.max(WS.Save.stats.maxWeapons, p.weapons.length);
    return w;
  };

  Player.levelWeapon = function (p, id) {
    const level = p.weaponLevels[id] || 0;
    if (level >= WS.WEAPON_MAX_LEVEL) return false;
    p.weaponLevels[id] = level + 1;
    const w = Player.getWeapon(p, id);
    if (w) { w.level = level + 1; return true; }
    return false;
  };

  Player.getWeapon = function (p, id) {
    for (const w of p.weapons) if (w.id === id) return w;
    return null;
  };

  Player.removeWeapon = function (p, id) {
    delete p.weaponLevels[id];
    for (let i = p.weapons.length - 1; i >= 0; i--) {
      if (p.weapons[i].id === id) p.weapons.splice(i, 1);
    }
  };

  /** The Eclipse Arena hands out a ready-made kit so the duel tests the
   *  boss's mechanics rather than a 30-minute build-up. */
  Player.grantArenaLoadout = function (p) {
    const kit = [
      { id: 'seeking_motes', evolved: true },
      { id: 'dawnpulse', evolved: true },
      { id: 'arcweb', evolved: true },
      { id: 'knifestorm', evolved: true },
      { id: 'hallowed_ring', evolved: false },
    ];
    for (const slot of kit) {
      Player.addWeapon(p, slot.id);
      p.weaponLevels[slot.id] = WS.WEAPON_MAX_LEVEL;
      const w = Player.getWeapon(p, slot.id);
      if (w) { w.level = WS.WEAPON_MAX_LEVEL; w.evolved = slot.evolved; }
    }
    // Whatever the survivor brought of their own is brought up to the same
    // standard, so no slot in the arena kit is dead weight.
    for (const w of p.weapons) {
      if (w.level < WS.WEAPON_MAX_LEVEL) {
        w.level = WS.WEAPON_MAX_LEVEL;
        p.weaponLevels[w.id] = WS.WEAPON_MAX_LEVEL;
      }
    }
    const passives = { might: 4, haste: 3, fleetfoot: 3, armor: 3, vitality: 3, dodge: 2, area: 3, precision: 3 };
    for (const id of Object.keys(passives)) {
      const up = WS.Upgrades[id];
      for (let n = 0; n < passives[id]; n++) up.apply(p, up);
      p.upgradeLevels[id] = passives[id];
    }
    WS.ComboSystem.check(p);
  };

  /* ------------------------------------------------------------- update -- */
  Player.update = function (p, dt) {
    const keys = WS.Input.keys;
    let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;

    if (p.hurtTimer > 0) p.hurtTimer -= dt;

    let speed = p.moveSpeed * WS.Primal.moveMult(p) * WS.Moor.moveMult();
    if (p.slowTimer > 0) { p.slowTimer -= dt; speed *= p.slowFactor; }

    if (moving) {
      const n = WS.normalize(dx, dy);
      dx = n[0]; dy = n[1];
      const ab = WS.Game.arenaBounds;
      const minX = (ab ? ab.minX : 0) + p.radius;
      const maxX = (ab ? ab.maxX : WS.CONST.WORLD_WIDTH) - p.radius;
      const minY = (ab ? ab.minY : 0) + p.radius;
      const maxY = (ab ? ab.maxY : WS.CONST.WORLD_HEIGHT) - p.radius;
      p.x = WS.clamp(p.x + dx * speed * dt, minX, maxX);
      p.y = WS.clamp(p.y + dy * speed * dt, minY, maxY);
      if (dx !== 0) p.facing = dx < 0 ? -1 : 1;
      p.walkCycle += dt * 11;
    } else {
      p.walkCycle += dt * 2.5;
    }
    p.moving = moving;
    // Where the survivor is headed, a second's worth (Death's blink aims at it).
    p.vx = moving ? dx * speed : 0; p.vy = moving ? dy * speed : 0;
    if (p.witherTimer > 0) p.witherTimer -= dt;

    if (p.spinTimer > 0) p.spinTimer -= dt;
    WS.Primal.update(p, dt);
    WS.Calling.update(p, dt);

    // Warding Light recharges over time and flares when it comes back up.
    if (p.blockRank > 0 && !p.blockReady) {
      p.blockTimer -= dt;
      if (p.blockTimer <= 0) {
        p.blockReady = true;
        WS.FX.flash(p.x, p.y, 44, WS.CONST.COLORS.holy, 0.3);
      }
    }

    /* Passive regeneration, which ticks at full health too.
     *
     * OVERHEAL IS THE PART OF A HEAL THAT WOULD BE WASTED, not a thing that
     * only happens to the wounded. The gate here used to be
     * `p.health < p.maxHealth || p.curdled > 0`, so a survivor at full health
     * without Curdled Light did not regenerate at all - which is invisible
     * while nothing reads it, and wrong the moment anything does. It made the
     * Overhealing meter read zero for the one player who is overhealing the
     * most, and it means a heal trigger has to ask whether you are hurt
     * before it fires. Anything that WOULD heal now heals; applyHeal splits
     * it into the part that lands and the part that is wasted. */
    if (p.healthRegen > 0) {
      p.regenCarry += p.healthRegen * p.healingMult * dt;
      if (p.regenCarry >= 1) {
        const whole = WS.floor(p.regenCarry);
        p.regenCarry -= whole;
        Player.applyHeal(p, whole, 'regen');
      }
    }

    // Ruinform.
    if (p.felLock > 0) p.felLock = WS.max(0, p.felLock - dt);
    if (p.metaTimer > 0) {
      p.metaTimer -= dt;
      if (p.metaTimer <= 0) {
        p.metaTimer = 0;
        /* Only the ruinborn chains straight back in. For everyone else the
           ruin has to be gathered again from nothing, and it cannot even
           begin for metaRecovery seconds - which is the whole of what stops
           a Ruinous Pact on any class from holding the form permanently. */
        const wait = Player.ruinRecovery(p);
        if (wait <= 0 && p.fel >= WS.Config.felToMeta) {
          p.fel = 0;
          Player.metamorphose(p);
        } else {
          p.felLock = wait;
          WS.FX.flash(p.x, p.y, 110, [0.45, 0.85, 0.30], 0.4);
          WS.FX.notice(p.x, p.y, 'The ruin recedes', '#9fe66b');
        }
      }
    }

    // Curdled Light: release the pooled conversion as one shadow pulse.
    if (p.curdlePool > 0) {
      p.curdleTimer -= dt;
      if (p.curdleTimer <= 0) {
        p.curdleTimer = WS.Config.curdleInterval;
        const coeff = WS.Config.curdleCoefficient * Player.curdleScale(p);
        const dmg = WS.floor(p.curdlePool * coeff);
        if (dmg >= 1) {
          // Spend only what was dealt and keep the remainder, or a modest
          // healing build would be floored to nothing every single tick.
          p.curdlePool -= dmg / coeff;
          p.curdleDealt += dmg;
          const radius = WS.Config.curdleRadius * p.areaMultiplier;
          /* It erupts on the nearest of the crowd within curdleReach, not at
             the survivor's feet: late in a night the weapons kill everything
             before it gets that close, and a pulse at your feet struck air
             (0.07x a weapon at 20:00, 2.1x at 9:00, in the same builds). */
          const t = WS.Enemy.findNearest(p.x, p.y, WS.Config.curdleReach * p.areaMultiplier);
          const cx = t ? t.x : p.x, cy = t ? t.y : p.y;
          WS.Enemy.damageArea(cx, cy, radius, dmg, null, null, 'curdled');
          const punch = WS.min(1, dmg / 60);
          WS.FX.flash(cx, cy, radius * (0.86 + 0.24 * punch), [0.42, 0.12, 0.55], 0.32);
          WS.FX.flash(cx, cy, radius * (0.60 + 0.18 * punch), [0.30, 0.80 + 0.2 * punch, 0.22], 0.28);
          if (punch >= 0.85) WS.FX.shake(3, 0.16);
        }
      }
    }

    // Batch the continuous trickle into one green "+N" a second.
    p.healBatchTimer -= dt;
    if (p.healBatchTimer <= 0) {
      p.healBatchTimer = 1.0;
      if (p.healBatch > 0) {
        WS.FX.heal(p.x, p.y, p.healBatch);
        p.healBatch = 0;
      }
    }

    if (p.invulnerable > 0) p.invulnerable -= dt;
    if (p.bloodthirstTimer > 0) p.bloodthirstTimer -= dt;
    // Lifesteal's allowance refills at its cap per second, a second's worth
    // at most, so a burst can spend what a quiet moment saved and no more.
    if (p.lifesteal > 0) {
      const cap = p.maxHealth * WS.Config.lifestealCapPct;
      p.leechBudget = WS.min(cap, p.leechBudget + cap * dt);
    }

    // Searing Aura: sears everything nearby twice a second.
    if (p.retRank > 0) {
      const cfg = WS.Config;
      const range = (cfg.retributionRange + cfg.retributionRangePerRank * p.retRank) * p.areaMultiplier;
      p.retTimer -= dt;
      if (p.retTimer <= 0) {
        p.retTimer = cfg.retributionTick;
        const dmg = (cfg.retributionBase + cfg.retributionPerRank * p.retRank)
          * p.damageMultiplier * WS.CONST.PLAYER_DAMAGE_SCALE
          * (1 + cfg.retributionArmorScale * WS.max(0, p.armor || 0));
        WS.Enemy.damageArea(p.x, p.y, range, dmg, null, null, 'searing');
      }
    }

    // Automatic attacks. Momentum hastens firing while moving.
    const haste = (p.momentum && moving) ? (1 + p.momentumHaste) : 1;
    for (const w of p.weapons) {
      if (w.burstShots > 0) {
        w.burstTimer -= dt;
        if (w.burstTimer <= 0) {
          w.burstTimer = w.burstGap || 0.09;
          w.burstShots--;
          WS.Weapon.fireBurstShot(p, w);
        }
      }
      w.cooldown -= dt * haste;
      if (w.cooldown <= 0) {
        WS.Weapon.fire(p, w);
        w.cooldown = WS.Weapon.cooldown(p, w);
      }
    }
  };

  /* ---------------------------------------------------- xp / level-ups --- */
  Player.gainXP = function (p, amount) {
    // Arcane Overflow: a gathered gem may discharge every weapon at once.
    if (p.overflow && WS.random() < p.overflow) {
      for (const w of p.weapons) WS.Weapon.fire(p, w);
      WS.FX.flash(p.x, p.y, 60, WS.CONST.COLORS.arcane, 0.3);
    }
    // Arcane Surge: every gathered gem charges it (callings.js).
    WS.Calling.onGem(p);

    p.xp += amount * p.xpMultiplier * WS.Runs.oath('xp');
    while (p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext;
      p.level++;
      p.xpToNext = Player.xpForLevel(p.level);
      WS.Game.pendingLevelUps++;
      // Small automatic growth, so a level is a reward before the boon choice.
      p.maxHealth += 2;
      p.health = WS.min(p.maxHealth, p.health + 2);
      WS.Save.stats.bestLevel = WS.max(WS.Save.stats.bestLevel, p.level);
    }
    if (WS.Game.pendingLevelUps > 0 && !WS.Game.leveling) WS.Game.openLevelUp();
  };

  /* ------------------------------------------------------------ healing -- */
  const IMMEDIATE_HEAL = { potion: true, food: true, vitality: true, bloodthirst: true };

  Player.recordHeal = function (amount, source) {
    if (amount <= 0) return;
    const run = WS.Game.run;
    if (!run) return;
    run.healingDone += amount;
    run.healingBySource[source] = (run.healingBySource[source] || 0) + amount;
  };

  /** What a Curdled pulse is worth beyond its healing: your Might, and your
   *  arsenal - the mean over the weapons you hold of a rank's worth
   *  (curdleRankStep a rank) and an evolution's (curdleEvolvedMult). Healing
   *  income grows x2-4 from 9:00 to 20:00 while weapons grow x13; without
   *  this the pulse that mattered at 9:00 was a rounding error by 20:00. */
  Player.curdleScale = function (p) {
    const cfg = WS.Config;
    let sum = 0, n = 0;
    for (const w of p.weapons) {
      sum += (1 + cfg.curdleRankStep * (w.level - 1)) * (w.evolved ? cfg.curdleEvolvedMult : 1);
      n++;
    }
    return p.damageMultiplier * (n ? sum / n : 1);
  };

  Player.desecrate = function (p, amount) {
    if (amount <= 0 || p.curdled <= 0) return;
    p.curdlePool += amount;
  };

  /** Splits a heal into the part that lands and the part that would be wasted,
   *  feeding both into curdled at their own rates. */
  /** keep (0-1, default 1): the share of the heal allowed to land; the rest
      is overheal, as if the survivor were already full. */
  Player.applyHeal = function (p, scaled, source, keep) {
    const room = WS.max(0, p.maxHealth - p.health);
    const gained = WS.min(keep === undefined || keep >= 1 ? scaled : WS.floor(scaled * keep), room);
    const wasted = scaled - gained;
    if (wasted > 0) {
      const run = WS.Game.run;
      run.overhealDone += wasted;
      run.overhealBySource[source] = (run.overhealBySource[source] || 0) + wasted;
    }
    if (p.curdled > 0) {
      Player.desecrate(p, wasted * p.curdleOverheal + gained * p.curdleShare);
    }
    WS.Calling.onHeal(p, gained, wasted);
    if (gained <= 0) return 0;
    p.health += gained;
    Player.recordHeal(gained, source);
    if (IMMEDIATE_HEAL[source]) WS.FX.heal(p.x, p.y, gained);
    else p.healBatch += gained;
    return gained;
  };

  Player.heal = function (p, amount, source, keep) {
    // No early-out at full health: overheal is a resource Curdled Light eats,
    // so the heal still has to be measured.
    /* The fraction is CARRIED, per source, to the next heal. Health is whole
       numbers and this used to floor every heal - so anything that mends a
       little every frame (Boil Over's 3% a second, the Spring's pools: a
       fifth of a point a frame) floored to nothing, every frame, and had
       never healed at all. Whole heals are unchanged. */
    const exact = amount * p.healingMult * (source === 'potion' ? WS.Runs.oath('potion') : 1)
      * (p.witherTimer > 0 ? WS.Config.witherMult : 1);   // Death's blink withers it
    if (!(exact > 0)) return 0;
    const carry = p.healCarry || (p.healCarry = {});
    const key = source || 'other';
    const total = (carry[key] || 0) + exact;
    const scaled = WS.floor(total);
    carry[key] = total - scaled;
    if (scaled <= 0) return 0;
    return Player.applyHeal(p, scaled, key, keep);
  };

  Player.lifesteal = function (p, amount) {
    if (amount <= 0) return;
    // No full-health gate, for the same reason regen has none: the heal is
    // what triggers, and whether it lands or is wasted is applyHeal's answer.
    amount = WS.min(amount, p.leechBudget);
    if (amount <= 0) return;
    p.leechBudget -= amount;
    p.lifestealCarry += amount;
    const whole = WS.floor(p.lifestealCarry);
    if (whole >= 1) {
      p.lifestealCarry -= whole;
      Player.heal(p, whole, 'lifesteal');
    }
  };

  Player.grantRunEggs = function (p, n) {
    if (n <= 0) return;
    p.runEggs += n;
    p.damageMultiplier += WS.Config.eggRunDamage * n;
    p.maxHealth += WS.Config.eggRunHealth * n;
    p.health += WS.Config.eggRunHealth * n;
  };

  /* ----------------------------------------------------------------- fel - */
  /** How long the ruin takes to answer again once the form ends.
   *
   *  Ruin Hunger shortens it for everyone, and the ruinborn's is a fifth
   *  shorter still: at max rank the Ruinseeker's window floors at
   *  metaRecoveryBornFloor (74.7% uptime) while a Ruinous Pact on any other
   *  class floors at metaRecoveryFloor (70.3%). Neither reaches permanent -
   *  the gap holds at any level of overkill, but it is an edge, not the
   *  difference between mortal and unkillable. */
  Player.ruinRecovery = function (p) {
    const cfg = WS.Config;
    const step = cfg.metaRecoveryPerRank * p.soulRending;
    if (p.ruinborn > 0) return WS.max(cfg.metaRecoveryBornFloor, cfg.metaRecoveryBorn - step);
    return WS.max(cfg.metaRecoveryFloor, cfg.metaRecovery - step);
  };

  Player.gainFel = function (p, amount) {
    if (amount <= 0 || p.felAttuned <= 0) return;
    if (p.felLock > 0) return;              // the ruin is still receding
    const cfg = WS.Config;
    let rate = cfg.felPerOverkill + cfg.felPerRank * p.soulRending + p.felBonus;
    // Charging during the form is throttled, though the recovery window after
    // it is what actually decides uptime - see Config.metaRecovery.
    if (p.metaTimer > 0) rate *= cfg.metaFelRate;
    const need = cfg.felToMeta;
    p.fel = WS.min(need, p.fel + amount * rate);
    if (p.fel >= need && p.metaTimer <= 0) {
      p.fel = 0;                              // the whole bar is spent
      Player.metamorphose(p);
    }
  };

  Player.metamorphose = function (p) {
    const cfg = WS.Config;
    p.metaTimer = cfg.metaDuration + cfg.metaDurationPerRank * p.soulRending;
    p.metamorphoses++;
    const run = WS.Game.run;
    if (run) run.metamorphoses = (run.metamorphoses || 0) + 1;
    if (p.metamorphoses <= 1) {
      WS.Game.announce('Ruinform!', 'The ruin takes hold.', 2.0, { kind: 'glory' });
      WS.Audio.play('evolve');
    }
    WS.FX.shake(10, 0.5);
    WS.FX.screen('rgba(120,255,60,.18)', 0.4);
    WS.FX.flash(p.x, p.y, 90, [0.85, 1.0, 0.55], 0.4);
    WS.FX.flash(p.x, p.y, 190, [0.55, 1.0, 0.20], 0.5);
    WS.FX.burst(p.x, p.y, 24, '#8cf24a', 300, 0.7, 4);
  };

  /* ------------------------------------------------------------- damage -- */
  Player.applySlow = function (p, factor, duration) {
    if (!factor) return;
    p.slowFactor = WS.min(p.slowFactor, factor);
    p.slowTimer = WS.max(p.slowTimer, duration || 1);
  };

  /** True if the hit connected (false while invulnerable). A dodge still
   *  counts as connected - the attacker's swing is used up - but deals none. */
  Player.takeDamage = function (p, amount, srcName, telegraphed) {
    if (p.invulnerable > 0) return false;
    const run = WS.Game.run;

    /* A TELEGRAPHED BLOW IS DODGED BY READING IT. The finales', the arena's
       and the bosses' shapes (`telegraphed`) said where they would land and
       when; Stillwater's step and a dodge roll are for the blows nobody
       could see coming. In bot nights a Stillwater survivor took every one
       of a finale's hits on its step - 12 of 12, a whole fight at 0% - so
       the fight asked nothing of them. Blocks still take one: they are
       earned on a timer, one blow at a time. */
    // Stillwater: the blow finds only where they were.
    if (!telegraphed && WS.Primal.tryStep(p)) {
      run.damagePrevented += amount;
      return true;
    }

    if (!telegraphed && p.dodgeChance && WS.random() < p.dodgeChance) {
      p.invulnerable = WS.Config.dodgeInvulnerable;
      run.damagePrevented += amount;
      WS.FX.notice(p.x, p.y, 'Dodge', '#bfe6ff');
      return true;
    }

    if (p.blockReady) {
      p.blockReady = false;
      p.blockTimer = p.blockInterval;
      WS.FX.notice(p.x, p.y, 'BLOCK', '#ffe08a');
      WS.FX.flash(p.x, p.y, 60, WS.CONST.COLORS.holy, 0.3);
      /* Against a telegraphed blow a block takes half, not all. Those blows
         come one every half-minute or so, and a block ready every 15s met
         nearly every one of them: a block build stood in the shapes and
         took nothing (bot nights: 10 of 11 finale blows blocked). */
      if (telegraphed) {
        run.damagePrevented += amount * WS.Config.blockTelegraphed;
        amount *= 1 - WS.Config.blockTelegraphed;
      } else {
        p.invulnerable = WS.Config.hitInvulnerable;
        run.damagePrevented += amount;
        return true;
      }
    }

    // Armor is a diminishing % reduction, never a flat subtraction, so it
    // matters against big hits and cannot trivialise small ones.
    const armor = (p.armor || 0) + WS.Calling.armor(p);
    const reduction = armor > 0 ? armor / (armor + WS.Config.armorConstant) : 0;
    // The bear's hide takes its share before the armour does.
    const hide = WS.Moor.mitigate(WS.Primal.mitigate(p, amount));
    const blow = WS.max(1, WS.floor(hide * (1 - reduction)));
    // A Radiant Barrier takes its share before the health does.
    const taken = WS.floor(WS.Calling.absorb(p, blow));
    WS.Calling.onHurt(p, taken);
    run.damagePrevented += (amount - taken);
    run.damageTaken += taken;
    p.health -= taken;
    if (WS.RunLog) WS.RunLog.hurt(srcName, taken, p);
    // Never shorten a grace already running: the blow above can raise an
    // Aegis (onHurt fills Conviction), and a flat assignment here cut its two
    // seconds down to this half-second while the dome stayed up.
    p.invulnerable = WS.max(p.invulnerable, WS.Config.hitInvulnerable);
    run.noHitStreak = 0;
    WS.Trials.onHurt(p);
    p.hurtTimer = WS.Config.hurtBeat;
    WS.FX.playerHurt(p.x, p.y, taken);
    WS.FX.shake(5, 0.22);
    WS.Audio.play('playerHurt');
    // A blow worth a real share of the bar is heard above the fight.
    if (taken >= p.maxHealth * WS.Config.heavyHitShare) WS.Audio.play('heavyHit');

    if (p.health <= 0) {
      if (p.revives > 0) {
        p.revives--;
        const cfg = WS.Config;
        p.health = WS.floor(p.maxHealth * cfg.secondWindHeal);
        p.invulnerable = WS.max(p.invulnerable, cfg.secondWindGrace);
        WS.FX.flash(p.x, p.y, 130, WS.CONST.COLORS.nature, 0.6);
        WS.Enemy.damageArea(p.x, p.y, cfg.secondWindRadius, cfg.secondWindDamage, null,
          cfg.secondWindKnock, 'second_wind');
        WS.Game.announce('Second Wind!', 'The ancestors are not done with you.', 2.5,
          { kind: 'glory' });
        WS.Audio.play('level');
        return true;
      }
      // What landed the last blow, and how hard, for the defeat screen.
      run.killedBy = { name: srcName || 'the endless horde', hit: WS.round(taken) };
      WS.Game.beginDeath();
    }
    return true;
  };

  WS.Player = Player;

})(window.WS);
