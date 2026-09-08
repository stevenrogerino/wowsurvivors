/* Static tuning. Anything the player can change lives in save.js settings. */
'use strict';
(function (WS) {

  WS.Config = {
    startCharacter: 'mage',
    startMap: 'elwynn',

    baseRerolls: 1,
    baseBanishes: 1,

    // XP curve: base + linear*(L-1) + quad*(L-1)^2, plus a steep tail.
    xpBase: 14, xpLinear: 9, xpQuad: 1.35, xpSteepFrom: 40, xpSteepMag: 8,

    // Drop chances, rolled per kill and multiplied by luck.
    dropChanceGold: 0.010,
    dropChancePotion: 0.0035,
    dropChanceBomb: 0.0018,
    dropChanceStone: 0.0018,
    dropChanceHourglass: 0.0012,

    potionHealPct: 0.30,
    hourglassFreeze: 8,

    contactCooldownBoss: 0.5,
    contactCooldownNormal: 0.8,

    baseCritChance: 0.05,
    baseCritDamage: 1.5,

    hitInvulnerable: 0.45,
    dodgeInvulnerable: 0.2,

    blockInterval1: 30, blockInterval2: 22, blockInterval3: 15,

    homingReacquireRange: 520,

    enemyScaleTime: 210,
    bossScaleTime: 500,
    hyperScale: 1.4,

    endlessBossInterval: 75,
    endlessBossMinInterval: 30,
    endlessBossAccel: 18,
    endlessBossMult: 1.25,
    endlessRampTime: 240,
    endlessEventInterval: 90,
    endlessEnemyRampTime: 300,

    bossTimes: [300, 630, 960, 1320, 1620],
    spawnIntervalMult: 1.0,
    spawnCountMult: 1.0,
    deathTime: 1800,
    deathInterval: 60,

    thornsFlat: 10,
    thornsDamagePct: 0.40,
    retributionBase: 5,
    retributionPerRank: 4,
    retributionRange: 60,
    retributionRangePerRank: 20,
    retributionTick: 0.5,
    chillRangeBase: 70,
    chillRangePerRank: 18,
    chillSlowPerRank: 0.10,

    // Armor is a diminishing reduction: 1 - armor/(armor + K).
    armorConstant: 30,

    // Desecration: healing that curdles into shadow damage.
    desecrationOverheal: 1.00,
    desecrationShare: 0.25,
    desecrationPerRank: 0.15,
    desecrationCoefficient: 1.00,
    desecrationRadius: 110,
    desecrationInterval: 0.50,
    runebladeThreshold: 4000,

    // Fel / Metamorphosis: overkill harvested into a burst transformation.
    felPerOverkill: 1.00,
    felPerRank: 0.25,
    felToMeta: 3500,
    metaFelRate: 0.35,
    metaDuration: 8.0,
    metaDamageMult: 2.20,
    metaCooldownMult: 0.60,
    metaDurationPerRank: 1.0,
    warglaiveMetas: 3,

    limitBreakDamage: 0.08,

    eggVendorInterval: 420,
    eggVendorCost: 100,
    eggRunDamage: 0.001,
    eggRunHealth: 1,

    // Shared weapon rank / evolution curves.
    rankDamageStep: 0.20,
    rankAreaStep: 0.04,
    rankRadiusStep: 0.05,
    rankDurationStep: 0.06,
    projRankA: 4,
    projRankB: 7,
    evolveDamageMult: 1.5,
    evolveProjectiles: 2,
    evolveCooldownMult: 0.85,
    evolveAreaMult: 1.25,
    evolveRadiusMult: 1.3,
    evolvePierce: 2,
    evolveOrbitBlades: 4,
    evolveOrbitSpeed: 1.25,

    difficulties: {
      beginner: { label: 'Beginner', scale: 0.75, gold: 0.85, interval: 1.1 },
      veteran: { label: 'Veteran', scale: 1.0, gold: 1.0, interval: 1.0 },
      professional: { label: 'Professional', scale: 1.3, gold: 1.25, interval: 0.85 },
    },
    difficultyOrder: ['beginner', 'veteran', 'professional'],

    defaultSettings: {
      sound: true,
      music: true,
      effectsVolume: 0.7,
      musicVolume: 0.45,
      screenShake: true,
      damageNumbers: true,
      healNumbers: true,
      showHealthBars: true,
      levelUpTooltips: true,
      // 'strip' lays the arsenal and passives along the foot of the screen;
      // 'rail' stands them up the two edges, which on anything wider than
      // 16:9 puts them in the letterbox and off the battlefield entirely.
      hudLayout: 'strip',
      // Hold the left mouse button and drag to steer, the same gesture as the
      // touch stick. Off for anyone who would rather their clicks stayed inert.
      mouseSteer: true,
      difficulty: 'veteran',
      quality: 'high',      // high | balanced - drops soft shadows + bloom
    },
  };

  WS.WEAPON_MAX_LEVEL = 8;
  WS.MAX_WEAPONS = 6;

})(window.WS);
