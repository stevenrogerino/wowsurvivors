/* THE CALLINGS: the first eight survivors' own powers.
 *
 * The four who came last - the Graveblade, the Ruinseeker, the Druid and the
 * Monk - each carry a power that is a whole system of its own (Blood Rite,
 * the Ruinous Pact, The Old Shapes, Stillwater Step), and a tester noticed
 * that those four were the strongest in the roster, which was not a
 * coincidence. These are the same thing for the other eight. Like theirs,
 * each is a legendary blessing ANYONE can take, and the survivor whose
 * calling it is gets one small edge on it: one number, about a quarter
 * better, never a second copy of the thing.
 *
 *   SPELLFLOOD (Mage). Gems swell the Flood. Full, every weapon fires at
 *     once and the tide runs fast for a while. Baron Zul: fills a quarter
 *     faster. (Arcane Overflow, the old gamble on every gem, is still there
 *     for anyone - this is not it.)
 *   RADIANT BARRIER (Priest). Healing that would be wasted becomes a barrier
 *     that takes hits before you do; when a real one breaks it bursts as
 *     Light. Chid: the barrier holds a quarter more.
 *   OPPORTUNIST (Rogue). Critical hits build Edge. At full, a Cutthroat blow
 *     on the toughest thing near you, and you Slip from sight for a moment.
 *     Rav: Edge builds a quarter faster.
 *   THE QUARRY (Hunter). The toughest enemy in sight becomes your Quarry: it
 *     takes more from everything, and killing it readies every weapon and
 *     mends you. Maeca: finds a Quarry a quarter sooner.
 *   SEETHING BLOOD (Warrior). Blows you take heat the blood, and heat is
 *     armour and damage. Full, you Boil Over: heavier still, thorns doubled,
 *     mending. AAAAAAAAA: heats a quarter faster.
 *   REAPER'S TITHE (Warlock). Kills pay the Tithe. Over half paid it
 *     empowers you; paid in full, a Reaping tears at everything near and
 *     heals you for what it takes. Nim: fills a quarter faster.
 *   WAYSTONES (Shaman). Every few seconds a stone rises where you stand -
 *     ember, spring, then gale - and fighting beside them pays. Vonnra:
 *     their reach is a quarter farther.
 *   CONVICTION (Paladin). Hits taken and healing received build Conviction.
 *     At full, a Hammerfall and an Aegis. Keegan: builds a quarter faster.
 *
 * The code keeps plain working names for the fields (rage, souls, totems,
 * holy) - what the player reads is in blessings.js and the meters below.
 * Every number is in Config under CALLINGS. */
'use strict';
(function (WS) {

  const K = {};
  const C = () => WS.Config;

  /** A calling's own strike, grown with level and Damage the way a shape's
   *  is (primal.js), so it is never a tickle at 25:00. */
  function strike(p, base, perLevel) {
    return (base + perLevel * p.level) * p.damageMultiplier * WS.CONST.PLAYER_DAMAGE_SCALE;
  }
  function minutes() {
    const run = WS.Game.run;
    return run ? WS.WaveManager.clock(run) / 60 : 0;
  }
  function count(key) {
    const run = WS.Game.run;
    if (run) run[key] = (run[key] || 0) + 1;
  }

  /* ----------------------------------------------------------- spellflood -- */
  K.overflowNeed = () => C().overflowNeedBase + C().overflowNeedPerMinute * minutes();
  K.onGem = function (p) {
    if (p.overflowAttuned <= 0 || p.surgeTimer > 0) return;
    p.overflowCharge += 1 + p.overflowBonus;
    if (p.overflowCharge < K.overflowNeed()) return;
    p.overflowCharge = 0;
    p.surgeTimer = C().surgeDuration;
    for (const w of p.weapons) WS.Weapon.fire(p, w);
    count('overflows');
    WS.FX.flash(p.x, p.y, 70, WS.CONST.COLORS.arcane, 0.35);
    WS.FX.flash(p.x, p.y, 170, WS.CONST.COLORS.arcane, 0.5, 9, 'arcane');
    WS.FX.shake(4, 0.2);
    WS.Audio.play('evolve');
  };

  /* ------------------------------------------------------ radiant barrier -- */
  K.barrierCap = (p) => p.maxHealth * C().barrierCapPct * (1 + p.barrierBonus);
  /* The barrier recharges like a shield, not a sponge. Every Dawnpulse at
     full health is almost all overheal, and all of it went into the barrier,
     so in a crowd it was topped up faster than blows could take it down and
     never broke. Now a blow it soaks holds the refill off for barrierDelay,
     and a break for barrierBrokenDelay: a crowd in contact wears it through,
     and stepping clear of the press is what lets it build again. */
  K.onHeal = function (p, gained, wasted) {
    if (p.barrierAttuned > 0 && !(p.barrierLock > 0)) {
      const add = wasted + gained * C().barrierFromHeal;
      if (add > 0) {
        p.barrier = WS.min(K.barrierCap(p), p.barrier + add);
        p.barrierPeak = WS.max(p.barrierPeak || 0, p.barrier);
      }
    }
    if (p.holyAttuned > 0 && gained > 0 && p.holyLock <= 0) {
      p.holyHeal += gained * (1 + p.holyBonus);
      // By share of the bar: a flat figure was nothing late in a run, when a
      // healer is mending hundreds a second.
      const per = WS.max(1, p.maxHealth * C().holyHealPct);
      while (p.holyHeal >= per) { p.holyHeal -= per; K.addHoly(p, 1); }
    }
  };
  /* A barrier bursts in proportion to how much of one it was: a sliver of
     regeneration's overheal broken by the next blow is not a detonation.
     Below barrierBurstMin of the cap there is no burst at all. */
  function barrierBurst(p) {
    const cfg = C();
    const k = WS.min(1, (p.barrierPeak || 0) / WS.max(1, K.barrierCap(p)));
    p.barrierPeak = 0;
    if (k < cfg.barrierBurstMin) return;
    const r = cfg.barrierBurstRadius * p.areaMultiplier;
    WS.Enemy.damageArea(p.x, p.y, r, strike(p, cfg.barrierBurstBase, cfg.barrierBurstPerLevel) * k, null, 24, 'radiant_barrier');
    WS.FX.flash(p.x, p.y, r, WS.CONST.COLORS.holy, 0.4, 10, 'holy');
    WS.FX.flash(p.x, p.y, r * 0.5, [1, 0.96, 0.8], 0.25);
    WS.Audio.play('cast', undefined, 'holy');
    count('barriersBroken');
  }

  /** A blow, after armour, meets the barrier and the rage before the health.
   *  Returns what is left to take. */
  K.absorb = function (p, taken) {
    if (p.barrier > 0) {
      const soak = WS.min(p.barrier, taken);
      p.barrier -= soak;
      taken -= soak;
      p.barrierLock = WS.max(p.barrierLock || 0, C().barrierDelay);
      if (p.barrier <= 0.5) {
        p.barrier = 0; barrierBurst(p);
        p.barrierLock = WS.max(p.barrierLock, C().barrierBrokenDelay);
      }
    }
    return taken;
  };

  /* ---------------------------------------------------- opportunist: edge -- */
  K.onCrit = function (p) {
    if (p.comboAttuned <= 0 || p.comboLock > 0 || p.comboGate > 0) return;
    p.comboGate = C().comboGate;
    p.combo += 1 + p.comboBonus;
    if (p.combo >= C().comboNeed) eviscerate(p);
  };
  function eviscerate(p) {
    const cfg = C();
    p.combo = 0;
    p.comboLock = cfg.comboLock;
    // The toughest thing within reach, bosses included: that is the point.
    let best = null, most = -1;
    const r2 = cfg.eviscerateRange * cfg.eviscerateRange;
    for (let i = 0; i < WS.Enemy.pool.count; i++) {
      const e = WS.Enemy.pool.active[i];
      if (e._dead || e.untargetable || e.hidden) continue;
      if (WS.dist2(e.x, e.y, p.x, p.y) > r2) continue;
      if (e.health > most) { most = e.health; best = e; }
    }
    if (best) {
      WS.Enemy.hit(best, strike(p, cfg.eviscerateBase, cfg.eviscerateLevel) * p.critDamage, 'opportunist');
      WS.FX.flash(best.x, best.y, 46, [1.0, 0.92, 0.45], 0.3, 6, 'physical');
      WS.FX.burst(best.x, best.y, 14, '#ffe27a', 220, 0.4, 3);
    }
    p.vanishTimer = cfg.vanishTime;
    p.invulnerable = WS.max(p.invulnerable, cfg.vanishTime);
    count('eviscerates');
    WS.Audio.play('crit', p.x);
  }

  /* ------------------------------------------------------------ the quarry -- */
  K.markMult = function (e) {
    const p = WS.Game.player;
    if (!p || p.markTarget !== e) return 1;
    return 1 + (e.boss || e.finale ? C().markBossBonus : C().markBonus);
  };
  /* The quarry is the toughest thing in sight that a hunt can actually
     bring down: an elite, a heavy - not the boss, whose health would outlast
     every mark and never pay the refund. A boss is marked only when it is
     all there is. */
  function chooseMark(p) {
    const cfg = C();
    let best = null, most = -1, boss = null;
    const r2 = cfg.markRange * cfg.markRange;
    for (let i = 0; i < WS.Enemy.pool.count; i++) {
      const e = WS.Enemy.pool.active[i];
      if (e._dead || e.untargetable || e.hidden) continue;
      if (WS.dist2(e.x, e.y, p.x, p.y) > r2) continue;
      if (e.boss || e.finale) { boss = boss || e; continue; }
      if (e.maxHealth > most) { most = e.maxHealth; best = e; }
    }
    best = best || boss;
    if (!best) return;
    p.markTarget = best; p.markSpawn = best.spawnId;
    p.markLife = cfg.markLife;
    WS.FX.notice(best.x, best.y - best.radius - 10, 'Quarry', '#ffcf6a');
  }
  function markEvery(p) { return C().markEvery * (1 - p.markHaste); }

  /* -------------------------------------------------------- seething blood -- */
  K.onHurt = function (p, landed) {
    const cfg = C();
    if (p.rageAttuned > 0 && p.enrageTimer <= 0 && p.rageLock <= 0) {
      p.rage += cfg.ragePerHit * (1 + p.rageBonus);
      p.rageIdle = cfg.rageHold;
      if (p.rage >= cfg.rageNeed) enrage(p);
    }
    if (p.holyAttuned > 0 && p.holyLock <= 0) {
      p.holyHit += cfg.holyPerHit * (1 + p.holyBonus);
      while (p.holyHit >= 1) { p.holyHit -= 1; K.addHoly(p, 1); }
    }
    void landed;
  };
  function enrage(p) {
    const cfg = C();
    p.rage = 0;
    p.enrageTimer = cfg.enrageTime;
    count('enrages');
    WS.FX.flash(p.x, p.y, 120, [1.0, 0.3, 0.2], 0.4, 8, 'physical');
    WS.FX.shake(7, 0.35);
    WS.FX.notice(p.x, p.y - 30, 'BOILING OVER', '#ff7a5a');
    WS.Audio.play('shift');
  }
  /** Armour a calling lends right now. */
  K.armor = function (p) {
    let a = 0;
    if (p.rageAttuned > 0) {
      a += C().rageArmor * (p.rage / C().rageNeed);
      if (p.enrageTimer > 0) a += C().enrageArmor;
    }
    return a;
  };
  K.thornsMult = (p) => (p.enrageTimer > 0 ? C().enrageThorns : 1);

  /* -------------------------------------------------------- reaper's tithe -- */
  K.soulNeed = () => C().soulNeedBase + C().soulNeedPerMinute * minutes();
  K.onKill = function (p, e) {
    if (!p) return;
    // Seething Blood: a kill at arm's length heats the blood as a blow does.
    if (p.rageAttuned > 0 && p.enrageTimer <= 0 && p.rageLock <= 0) {
      const r = C().rageCloseRange;
      if (WS.dist2(e.x, e.y, p.x, p.y) <= r * r) {
        p.rage += C().ragePerCloseKill * (1 + p.rageBonus);
        p.rageIdle = WS.max(p.rageIdle, 1);
        if (p.rage >= C().rageNeed) enrage(p);
      }
    }
    if (p.soulAttuned > 0 && p.soulLock <= 0) {
      p.souls += (e.boss ? C().soulBoss : e.elite ? C().soulElite : 1) * (1 + p.soulBonus);
      if (p.souls >= K.soulNeed()) soulRend(p);
    }
    if (p.markTarget === e) {
      // The quarry is down: every weapon is ready again, and it mends.
      p.markTarget = null;
      p.markTimer = WS.min(p.markTimer, 1.2);
      for (const w of p.weapons) w.cooldown = WS.min(w.cooldown, C().markRefund);
      WS.Player.heal(p, p.maxHealth * C().markHeal, 'quarry');
      count('marksClaimed');
      WS.FX.flash(e.x, e.y, 60, [1.0, 0.8, 0.35], 0.3, 6, 'nature');
    }
  };
  function soulRend(p) {
    const cfg = C();
    p.souls = 0;
    p.soulLock = cfg.soulLock;
    const r = cfg.rendRadius * p.areaMultiplier;
    const struck = WS.Enemy.damageArea(p.x, p.y, r, strike(p, cfg.rendBase, cfg.rendPerLevel), null, 18, 'reapers_tithe');
    WS.Player.heal(p, WS.min(p.maxHealth * cfg.rendHealCap, p.maxHealth * cfg.rendHealPer * struck), 'reapers_tithe');
    count('rends');
    WS.FX.flash(p.x, p.y, r, [0.62, 0.3, 0.9], 0.45, 11, 'shadow');
    WS.FX.flash(p.x, p.y, r * 0.4, [0.85, 0.6, 1.0], 0.3);
    WS.FX.shake(5, 0.3);
    WS.Audio.play('cast', undefined, 'shadow');
  }

  /* ------------------------------------------------------------ waystones -- */
  const TOTEMS = ['searing', 'healing', 'windfury'];
  const STONE_NAME = { searing: 'ember', healing: 'spring', windfury: 'gale' };
  K.totemReach = (p) => C().totemRadius * p.areaMultiplier * (1 + p.totemReach);
  function plant(p) {
    const kind = TOTEMS[p.totemNext % TOTEMS.length];
    p.totemNext++;
    // One of each at most: a new one of a kind replaces the old.
    for (let i = p.totems.length - 1; i >= 0; i--) if (p.totems[i].kind === kind) p.totems.splice(i, 1);
    p.totems.push({ kind, x: p.x, y: p.y + 6, life: C().totemLife, max: C().totemLife, tick: 0 });
    count('waystones');
    WS.FX.flash(p.x, p.y, 40, TOTEM_COL[kind], 0.25, 5, 'nature');
    WS.Audio.play('cast', undefined, 'nature');
  }
  const TOTEM_COL = { searing: [1.0, 0.5, 0.2], healing: [0.4, 0.9, 0.7], windfury: [0.55, 0.8, 1.0] };
  K.TOTEM_COL = TOTEM_COL;
  function nearTotem(p, kind) {
    const r = K.totemReach(p);
    for (const t of p.totems) {
      if (t.kind === kind && WS.dist2(t.x, t.y, p.x, p.y) <= r * r) return t;
    }
    return null;
  }

  /* ------------------------------------------------------------ conviction -- */
  K.addHoly = function (p, n) {
    p.holyPower = WS.min(C().holyNeed, p.holyPower + n);
    if (p.holyPower >= C().holyNeed) divineStorm(p);
  };
  /* JUDGEMENT. Everything on the field that is not a boss is struck down,
     as by a sapper's charge; a boss loses a share of its health. Slow to
     come, and worth the wait.

     It was a Hammerfall: a blast around Keegan every few seconds, charged
     in three, and it was most of his damage - 60% of a tester's meter, 48%
     standing still - while its Aegis kept him untouchable near half the
     time. Now it takes holyNeed (a long night's worth of blows and mending)
     and then holyLock more before it can gather again. */
  function divineStorm(p) {
    const cfg = C();
    p.holyPower = 0; p.holyHit = 0; p.holyHeal = 0;
    p.holyLock = cfg.holyLock;
    const enemies = WS.Enemy.pool.active;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e || e._dead || e.untargetable) continue;
      if (e.boss || e.part || e.finale) WS.Enemy.hit(e, e.maxHealth * cfg.judgementBossPct, 'conviction');
      else WS.Enemy.damage(e, e.health + 1, false, 'conviction');
    }
    p.divineTimer = cfg.divineShield;
    p.invulnerable = WS.max(p.invulnerable, cfg.divineShield);
    count('storms');
    WS.FX.screen('rgba(255,236,170,.28)', 0.45);
    WS.FX.flash(p.x, p.y, 70, [1, 0.95, 0.75], 0.4);
    WS.FX.shake(9, 0.5);
    WS.FX.punch(0.03, 0.5);
    WS.Audio.play('evolve');
  }

  /* ------------------------------------------------------------ per frame -- */
  K.update = function (p, dt) {
    const cfg = C();
    if (p.surgeTimer > 0) p.surgeTimer = WS.max(0, p.surgeTimer - dt);
    if (p.comboGate > 0) p.comboGate -= dt;
    if (p.comboLock > 0) p.comboLock = WS.max(0, p.comboLock - dt);
    if (p.vanishTimer > 0) p.vanishTimer = WS.max(0, p.vanishTimer - dt);
    if (p.holyLock > 0) p.holyLock = WS.max(0, p.holyLock - dt);
    if (p.barrierLock > 0) p.barrierLock = WS.max(0, p.barrierLock - dt);
    if (p.soulLock > 0) p.soulLock = WS.max(0, p.soulLock - dt);
    if (p.divineTimer > 0) p.divineTimer = WS.max(0, p.divineTimer - dt);

    // The mark: keep it while the quarry lives and it has not run out.
    if (p.markAttuned > 0) {
      const t = p.markTarget;
      if (t && (t._dead || t.spawnId !== p.markSpawn || !WS.Enemy.pool.active.includes(t))) p.markTarget = null;
      if (p.markTarget) {
        p.markLife -= dt;
        if (p.markLife <= 0) { p.markTarget = null; p.markTimer = markEvery(p); }
      } else {
        p.markTimer -= dt;
        if (p.markTimer <= 0) { p.markTimer = markEvery(p); chooseMark(p); }
      }
    }

    // Rage cools when the blows stop coming.
    if (p.rageAttuned > 0) {
      if (p.enrageTimer > 0) {
        p.enrageTimer -= dt;
        WS.Player.heal(p, p.maxHealth * cfg.enrageRegen * dt, 'seething_blood');
        if (p.enrageTimer <= 0) { p.enrageTimer = 0; p.rageLock = cfg.rageLock; }
      } else if (p.rageLock > 0) {
        p.rageLock = WS.max(0, p.rageLock - dt);
      } else if (p.rageIdle > 0) {
        p.rageIdle -= dt;
      } else if (p.rage > 0) {
        p.rage = WS.max(0, p.rage - cfg.rageDecay * dt);
      }
    }

    // Totems: plant, and let the ones standing work.
    if (p.totemAttuned > 0) {
      p.totemTimer -= dt;
      if (p.totemTimer <= 0) { p.totemTimer = cfg.totemEvery; plant(p); }
      const r = K.totemReach(p);
      for (let i = p.totems.length - 1; i >= 0; i--) {
        const t = p.totems[i];
        t.life -= dt;
        if (t.life <= 0) { p.totems.splice(i, 1); continue; }
        if (t.kind === 'searing') {
          t.tick -= dt;
          if (t.tick <= 0) {
            t.tick = cfg.totemSearTick;
            WS.Enemy.damageArea(t.x, t.y, r, strike(p, cfg.totemSearBase, cfg.totemSearPerLevel), null, null, 'waystones');
          }
        }
      }
      if (nearTotem(p, 'healing')) WS.Player.heal(p, p.maxHealth * cfg.totemHeal * dt, 'waystones');
    }
  };

  /* --------------------------------------------------- what they change -- */
  K.damageMult = function (p) {
    let m = 1;
    if (p.rageAttuned > 0) {
      m *= 1 + C().rageDamage * (p.rage / C().rageNeed);
      if (p.enrageTimer > 0) m *= 1 + C().enrageDamage;
    }
    if (p.soulAttuned > 0 && p.souls >= K.soulNeed() * 0.5) m *= 1 + C().soulEmpower;
    return m;
  };
  K.cooldownMult = function (p) {
    let m = 1;
    if (p.surgeTimer > 0) m *= C().surgeCooldownMult;
    if (p.totemAttuned > 0 && nearTotem(p, 'windfury')) m *= C().totemHaste;
    return m;
  };

  /* ------------------------------------------------------------ the HUD -- */
  K.meters = function (p) {
    const out = [];
    const cfg = C();
    if (p.overflowAttuned > 0) {
      out.push(p.surgeTimer > 0
        ? { key: 'surge', cls: 'calling arcane', label: 'Flood tide', pct: p.surgeTimer / cfg.surgeDuration }
        : { key: 'overflow', cls: 'calling arcane', label: 'Flood', pct: p.overflowCharge / K.overflowNeed() });
    }
    if (p.barrierAttuned > 0) {
      // Broken, the meter says so and counts the way back; cracked, it says
      // the barrier is holding but not refilling.
      const broken = p.barrier <= 0 && p.barrierLock > 0;
      out.push({ key: 'barrier', cls: 'calling holy' + (p.barrierLock > 0 ? ' waiting' : ''),
        label: broken ? 'Barrier broken' : p.barrierLock > 0 ? 'Barrier ' + WS.round(p.barrier) + ' · cracked' : 'Barrier ' + WS.round(p.barrier),
        pct: broken ? 1 - p.barrierLock / C().barrierBrokenDelay : p.barrier / WS.max(1, K.barrierCap(p)) });
    }
    if (p.comboAttuned > 0) {
      out.push(p.comboLock > 0
        ? { key: 'combowait', cls: 'calling combo waiting', label: 'Regrouping', pct: 1 - p.comboLock / cfg.comboLock }
        : { key: 'combo', cls: 'calling combo', label: 'Edge', pips: cfg.comboNeed, full: WS.floor(p.combo), pct: p.combo % 1 });
    }
    if (p.markAttuned > 0) {
      out.push(p.markTarget
        ? { key: 'marked', cls: 'calling mark', label: 'Quarry', pct: p.markLife / cfg.markLife }
        : { key: 'mark', cls: 'calling mark waiting', label: 'Next quarry', pct: 1 - p.markTimer / markEvery(p) });
    }
    if (p.rageAttuned > 0) {
      out.push(p.enrageTimer > 0
        ? { key: 'enraged', cls: 'calling rage', label: 'Boiling over', pct: p.enrageTimer / cfg.enrageTime }
        : p.rageLock > 0
          ? { key: 'ragewait', cls: 'calling rage waiting', label: 'Spent', pct: 1 - p.rageLock / cfg.rageLock }
          : { key: 'rage', cls: 'calling rage', label: 'Heat', pct: p.rage / cfg.rageNeed });
    }
    if (p.soulAttuned > 0) {
      const need = K.soulNeed();
      out.push(p.soulLock > 0
        ? { key: 'soulwait', cls: 'calling soul waiting', label: 'Reaped', pct: 1 - p.soulLock / cfg.soulLock }
        : { key: 'souls', cls: 'calling soul', label: p.souls >= need * 0.5 ? 'Tithe · empowered' : 'Tithe', pct: p.souls / need });
    }
    if (p.totemAttuned > 0) {
      out.push({ key: 'totem', cls: 'calling totem', label: 'Next stone: ' + STONE_NAME[TOTEMS[p.totemNext % 3]],
        pct: 1 - p.totemTimer / cfg.totemEvery });
    }
    if (p.holyAttuned > 0) {
      out.push(p.holyLock > 0
        ? { key: 'holywait', cls: 'calling holy waiting', label: p.divineTimer > 0 ? 'Aegis' : 'Gathering', pct: 1 - p.holyLock / cfg.holyLock }
        // Too many points for pips: one bar, filling toward the Judgement.
        : { key: 'holy', cls: 'calling holy', label: 'Conviction ' + WS.floor(p.holyPower) + '/' + cfg.holyNeed,
          pct: WS.min(1, p.holyPower / cfg.holyNeed) });
    }
    return out;
  };

  WS.Calling = K;

})(window.WS);
