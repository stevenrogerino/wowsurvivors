/* Static tuning. Anything the player can change lives in save.js settings. */
'use strict';
(function (WS) {

  WS.Config = {
    startCharacter: 'mage',
    startMap: 'thornhollow',

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

    /* The boss charge. These three are one promise, not three numbers: the
     * lane the telegraph draws is chargeRange long, the charge runs for
     * chargeTime, and the speed it travels at is whatever covers that lane in
     * that time. Change the range and the charge still lands exactly where the
     * ground said it would. */
    chargeWindup: 0.75,
    chargeTime: 1.1,
    chargeRange: 460,
    chargeLaneTail: 0.15,   // the lane outlives the charge by this, so it lands visibly

    /* Rank-and-file behaviours. A lunge is the boss charge in miniature and
     * obeys the same promise: the lane it draws is where it goes. */
    lungeWindup: 0.42,
    lungeTime: 0.34,
    hazardTick: 0.45,      // how often armed ground hits whoever is standing in it
    trailFuse: 0.22,       // ground left behind is harmless for this long
    burstFuse: 0.65,       // and a corpse gives you this long to get clear
    burstLife: 0.30,

    baseCritChance: 0.05,
    baseCritDamage: 1.5,

    /* The flinch, and the fall. The flinch is deliberately shorter than the
     * invulnerability that follows it: a pose still playing while the player
     * is already safe again reads as lag. */
    hurtBeat: 0.30,
    deathBeat: 1.55,

    hitInvulnerable: 0.45,
    dodgeInvulnerable: 0.2,

    blockInterval1: 30, blockInterval2: 22, blockInterval3: 15,
    /* The kit, and the rank ceiling. Read through WS.MAX_WEAPONS and
       WS.WEAPON_MAX_LEVEL, which are getters over these. */
    /* When the one extra blessing arrives, in seconds. Half of deathTime.
       Zero turns it off entirely. */
    secondBlessingAt: 900,
    maxWeapons: 6,
    weaponMaxLevel: 8,
    /* The levels at which a survivor starts to LOOK like what they have
       become. Measured against real runs: a thirty-minute Hyper run finishes
       around level 85, and one that dies at 16:47 reaches 47 - so these put
       the first change a couple of minutes in and the crown a bit past the
       halfway mark, which leaves most of a good run spent looking earned.
       Weapons and skills get their own visual upgrades separately; this ladder
       is the survivor themselves. */
    /* Six tiers now, not four. The last two are past where most runs end -
       they are for the runs that go long, and the ladder should not stop
       rewarding a player before the run does. */
    heroRankAt: [6, 15, 28, 45, 62, 80],
    /* Dark Bargain's price, which was two numbers written into the middle of
       waves.js and enemy.js. The upgrade's own tooltip quotes them, so they
       had to be somewhere a tooltip could reach. */
    curseSpawnRate: 0.20,
    curseEnemySpeed: 0.08,

    homingReacquireRange: 520,

    enemyScaleTime: 210,
    bossScaleTime: 500,
    hyperScale: 1.4,
    /* One dial over every finale's damage (each also names its own scale,
       tuning.damage in data/finales.js). */
    finaleDamage: 1.0,
    /* The finales size their health to the build that reaches them. The
       fights were tuned against a build doing finaleRefDps; a real 30:00
       build was measured at 130k+ (27 times that) and deleted Mordecai in
       his first window. Health grows by (dps / ref) ^ finalePowerExp, so a
       stronger build still wins faster - 27x the damage ends the fight
       about 2.7x sooner, not 27x - and is capped at finalePowerCap. dps is
       the average over the last finalePowerWindow seconds before dawn. */
    finaleRefDps: 5000,
    finalePowerExp: 0.7,
    finalePowerCap: 40,
    finalePowerWindow: 120,

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
    retributionBase: 4.55,
    retributionPerRank: 3.64,
    retributionRange: 60,
    retributionRangePerRank: 20,
    retributionTick: 0.5,
    chillRangeBase: 70,
    chillRangePerRank: 18,
    chillSlowPerRank: 0.10,

    // Armor is a diminishing reduction: 1 - armor/(armor + K).
    armorConstant: 30,

    // Curdled Light: healing that curdles into shadow damage.
    curdleOverheal: 1.00,
    curdleShare: 0.25,
    curdlePerRank: 0.15,
    /* The coverage buff (curdleRadius, below) got Curdled Light to roughly
     * 10-15% of a real weapon's output even at max investment - a coverage
     * lever can't close a gap that size, because healing income itself was
     * never sized like a weapon's damage stat: no rank ladder, no evolution,
     * nothing past a handful of flat regen sources. Measured against the
     * dummy field (WS.Weapon.reach's own comparison basis, the same "dps"
     * tools/sim.js prints for every weapon) with every curdleShare lever
     * maxed (blessing + Graveblade's class perk + 5 ranks of the Curdled
     * Light upgrade = 1.20 share) and a genuinely buildable healing income
     * (base regen + maxed Recovery + a couple of the game's own healing
     * weapons landing regularly, ~10-24 hp/s): coefficient 1.00 -> 2.15
     * takes a fully-committed build from roughly 150-350 dps to 310-750,
     * landing right at ~500 for the middle of that range (regen=16) - real
     * weapon territory, not a rounding error next to it. A casual pickup
     * (one Recovery rank, no other investment) stays modest at ~20-50 dps
     * either way, since the multiplier only pays off once the healing
     * income actually justifies it. */
    curdleCoefficient: 2.15,
    /* Measured with tools/curdled-sim.js against a real, moving, killable
     * crowd (gauntlet): 110->140 is +43% total damage for the shared
     * curdleShare=0.25 baseline and +48% for Graveblade's 0.45 - coverage,
     * not overkill, since the burst applies its damage to every target in
     * range rather than dividing it. curdleInterval was tested alongside it
     * and measured within 2% either way (noise), so it's left alone; the
     * pool's remainder already carries between ticks (see player.js), which
     * is why a faster tick neither gains nor loses total output. */
    curdleRadius: 140,
    curdleInterval: 0.50,
    gravebladeThreshold: 4000,

    /* The watchers found in a run (src/game/encounters.js). Each is a person
       met on the field, and each answers something you did in that run:
         kerchiefs  Kerchiefs put down this run before Rav is found
         beasts     beasts put down this run before Maeca is found
         bosses     bosses slain this run before the cairn starts screaming
         slaughter  kills inside `slaughterWindow` seconds that draw Nim out
         gold       gold earned this run before Vonnra's storm gathers
       hold is how long you stand with them to bring them in; stay is how long
       a watcher who is not in danger waits for you before moving on, and gap
       the quiet between one meeting and the next. */
    encounters: {
      kerchiefs: 60, beasts: 300, bosses: 2, slaughter: 40, slaughterWindow: 1.5, gold: 600,
      hold: 3.0, holdRadius: 70, stay: 45, distance: 360,
      // Seconds after one meeting ends before the next can begin, so they
      // arrive as moments in a run rather than a queue.
      gap: 120,
    },

    // Fel / Ruinform: overkill harvested into a burst transformation.
    felPerOverkill: 1.00,
    felPerRank: 0.25,
    felToMeta: 3500,
    /* What fraction of the normal fel rate is gathered WHILE the form is up.
       This is NOT what caps uptime and it never was: overkill in a real late
       run measures about 4000 a second against a 3500 bar, so any rate above
       a rounding error refills the bar inside one form. Scaling it by rank
       was tried and moved the measured uptime by 0.0 points at every rank on
       every class. It stays where it was; the recovery window below is the
       thing that actually decides. */
    metaFelRate: 0.35,
    /* After the ruin recedes, no fel can be gathered for this long. It is the
       only thing that actually caps Ruinform uptime, because it does not
       care how much overkill is coming: the ceiling is
       duration / (duration + recovery), whatever the throughput.

       Ruin Hunger buys the window down. For the Ruinseeker it reaches ZERO at
       max rank, which is what "born to it" means - the form becomes a state
       instead of a cycle. For anyone holding the Ruinous Pact it bottoms out
       at metaRecoveryFloor and never reaches zero, so max Ruin Hunger off
       the class gets close to permanent and cannot be permanent. */
    metaRecovery: 5.0,
    metaRecoveryBorn: 3.5,
    metaRecoveryPerRank: 0.5,
    /* At max Ruin Hunger (rank 5) with metaDuration+metaDurationPerRank*5 = 13s
     * of uptime per form: metaRecoveryBornFloor gives the ruinborn 13/15.5 =
     * 83.9% uptime, and metaRecoveryFloor gives everyone else 13/17.5 = 74.3%
     * - about ten points apart, so the ruinborn is reliably ahead but never
     * unkillable-while-transformed. (Was 89.7% / 79.3% at floors 1.5 / 3.4;
     * lowered on playtest, "Ruinform is still too good".) */
    metaRecoveryBornFloor: 2.5,
    metaRecoveryFloor: 4.5,
    metaDuration: 8.0,
    /* The steroid: x1.85 damage and x0.60 cooldown while transformed, about
       x3.1 output (was x2.00, x3.3). */
    metaDamageMult: 1.85,
    metaCooldownMult: 0.60,
    metaDurationPerRank: 1.0,
    glaiveMetas: 3,

    limitBreakDamage: 0.08,

    eggVendorInterval: 420,
    eggVendorCost: 100,
    /* How long Beans stays once she sets up shop. She used to stay until you
       walked into her, which made her a bank: park her, farm, and spend at
       the best moment. She is a visit, not a vault. */
    eggVendorStay: 90,
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
      /* Once the upgrade pool is exhausted, every level-up is the same card.
         Off by default and only ever offered once that has happened. */
      autoBreakingPoint: false,
      /* Which cut of the prologue plays. Two exist while the author decides
         which one to keep; see src/render/cinematic.js. */
      cinematic: 2,
      // The victory piece at 30:00, before the results panel.
      victoryCinematic: true,
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

  /* These two were bare constants on WS, which put them outside every tuning
   * root: the cap on a weapon's rank and the size of your kit - two of the
   * most consequential numbers in a survivors-like - were the only balance
   * figures in the game that could not be tuned. They live in Config now.
   *
   * WS.WEAPON_MAX_LEVEL and WS.MAX_WEAPONS stay as getters over them rather
   * than being renamed at fifteen call sites, in the game and in the test
   * harnesses both. That is not to save the edit: a call site missed in a
   * rename would go on reading a frozen 8 for ever and nothing would say so,
   * whereas a getter cannot be out of date. */
  Object.defineProperty(WS, 'WEAPON_MAX_LEVEL',
    { get: () => WS.Config.weaponMaxLevel, configurable: true });
  Object.defineProperty(WS, 'MAX_WEAPONS',
    { get: () => WS.Config.maxWeapons, configurable: true });

})(window.WS);
