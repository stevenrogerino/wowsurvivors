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

    /* Drop chances, rolled per kill and multiplied by luck. Halved on 27 Sept
       (potions excepted) with every source of luck: a tester chained sapper
       charges and hourglasses through a whole run off an early Fortune - a
       luck build measured 74 charges and 46 hourglasses in one night. */
    dropChanceGold: 0.005,
    dropChancePotion: 0.0035,
    dropChanceBomb: 0.0009,
    dropChanceStone: 0.0009,
    dropChanceHourglass: 0.0006,
    /* ...but a horde of thousands, or a luck build, must not turn them into a
       screen that never stops clearing. After a bomb drops, the next bomb's
       chance starts at nothing and climbs back over bombRecharge seconds
       (glassRecharge for hourglasses), along a square curve. Still a roll on
       every kill: a lucky night late gets one about every 15-20s, sometimes
       8, sometimes 30; an ordinary night, whose gaps are longer than the
       recharge anyway, barely notices. A bomb's or a frozen creature's death
       rolls neither, and neither drops while the tide crests above
       dropCrestSuppress. Each kill's chance can also fade as the night goes
       on (x1/(1 + minutes/dropFadeMinutes); 0 is off). */
    dropFadeMinutes: 0,
    bombRecharge: 20,
    glassRecharge: 25,
    dropCrestSuppress: 1.15,

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

    /* Leech Pact and Bloodthirst heal with your damage and your kill rate,
       both of which grow without end, so both are capped. Uncapped, at 22:00
       the Pact healed 25-32 health a second (the whole of what a kiting
       build takes) and Bloodthirst 15-18: +61s and +25s of survival over a
       plain blessing, where the rest of the draft sits at -6..+16s
       (tools/blessing-matrix.js). Lifesteal now heals at most
       lifestealCapPct of max health a second; Bloodthirst at most once every
       bloodthirstCooldown seconds. */
    lifestealCapPct: 0.012,
    bloodthirstCooldown: 4,
    // The level-up ring (Game.levelBurst): how far it reaches and how far it
    // shoves the rank and file at its centre.
    levelBurstRadius: 200,
    levelBurstPush: 90,
    // A single blow this share of max health or more ducks the mix (Audio heavyHit).
    heavyHitShare: 0.12,
    hitInvulnerable: 0.45,
    dodgeInvulnerable: 0.2,

    blockInterval1: 30, blockInterval2: 22, blockInterval3: 15,
    // ...and against a telegraphed blow (a finale's, a boss's) it takes
    // this share instead of all of it (Player.takeDamage).
    blockTelegraphed: 0.5,
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
    /* 1.4, was 1.0. In bot nights every survivor who reached a finale on
       the first battlefields won it with a median 0% of their bar lost -
       their healing and barriers swallowed the little that landed. A
       caught blow should take a real piece of the bar through all of that:
       on Professional a lantern bomb is now about half of a median 30:00
       build's 727 health before armour, a drill or a broadside more. */
    finaleDamage: 1.4,
    /* The finales size their health to the build that reaches them: by
       (single / finaleRefSingle) ^ finalePowerExp, capped at finalePowerCap,
       so a stronger build still wins faster - 8x the damage ends the fight
       about 2.3x sooner, not 8x.

       `single` is the build's modelled damage against ONE target
       (Weapon.reach with a crowd of one, summed over the kit). It used to be
       the damage the build did to the whole field in the two minutes before
       dawn, and that measured the horde, not the build: an area build that
       shreds hundreds of weak things read as enormous power and got a boss
       it could not finish, and a harder map read as a stronger build (more
       health to chew through means less overkill wasted), so the Pale Lord
       came out at 10 to 20 times his health and nobody could kill him. */
    /* 1500 (boss-balance: "finales hurt more", the shortening undone; it was
       2000 for about a sixth off). */
    finaleRefSingle: 1500,
    /* FIGHTS THAT LAST. A build's modelled damage (above) misses unions,
       pets, waystones, bombs and bleeds, and a player's night (a Shaman at
       level 181 on Highmoor) put 300k a second into Kael for a six-second
       finale and 500k-700k into Death, who fell in eight. So every boss also
       reads what the survivor has ACTUALLY been landing on bosses
       (BossFight.observedDps: landed damage over time spent hitting them,
       recent fights weighted most) and brings at least that many seconds of
       it in health: bossFloorFinale for a finale, bossFloorDeath for Death
       (plus bossFloorDeathStep a minute of overtime), bossFloorOvertime for
       overtime's bosses, bossFloorScheduled for the night's own from
       bossFloorFrom on. A build that already takes longer never notices. */
    bossFloorFinale: 45, bossFloorDeath: 30, bossFloorDeathStep: 4,
    bossFloorOvertime: 20, bossFloorScheduled: 14, bossFloorFrom: 600,
    // How fast old fights fade from that reading: a half-life in seconds of night.
    bossDpsHalfLife: 180,
    finalePowerExp: 0.7,
    finalePowerCap: 6,
    /* Difficulty and Hyper make a finale hit harder in full, and make it
       tougher only by this power of the same product - a harder setting is
       a more dangerous fight, not a longer one. At 1 the health took the full
       product too, and on Professional Hyper a fight sized for three minutes
       ran twelve to twenty. */
    finaleHpDifficultyExp: 0.5,
    /* Sunrise: the dawn keeps coming while the fight goes on. Past
       finaleSunriseAfter seconds the villain and its machines take
       finaleSunriseStep more damage for every finaleSunriseEvery seconds, so
       no fight can stall - a build that cannot open the gates quickly gets
       there in the end, and one that can never sees it. */
    finaleSunriseAfter: 180,
    finaleSunriseStep: 0.5,
    finaleSunriseEvery: 60,
    /* The difficulty dials (map x difficulty x Hyper) ease in: at 0:00 an
       enemy carries difficultyRampStart of their extra, all of it by
       difficultyRampTime seconds. Applied in full from the first second, a
       Professional Hyper run on the Pale Wastes met four-times ghouls with
       one level-1 weapon and was over inside a minute. */
    difficultyRampStart: 0.35,
    difficultyRampTime: 360,
    // The finale engine: the breather before the boss, how fast the purge
    // clears the field, how long the epilogue holds, how often a beam or a
    // fence can hit again while you stand in it, how close a fence reaches,
    // and how long before a charge goes that its lane stops following you.
    finaleBreather: 30,
    // A retry after a finale death: a short breath, then the fight again.
    finaleRetryBreather: 6,
    finalePurgeSpeed: 1150,
    finaleEpilogue: 3.6,
    finaleRehit: 0.7,
    finaleFenceReach: 12,
    finaleChargeLock: 0.3,
    /* A ring's opening is always reachable (Finale.aimGap): it is placed
       among bearings the survivor can walk to at ringWalk of their speed in
       the time the band takes to reach them, less ringReact to see it. */
    ringReact: 0.45,
    ringWalk: 0.6,
    // ...and if nowhere within 90 degrees is clear of other shapes landing
    // as it arrives, it holds at its heart up to ringHold s until somewhere is
    // (2s: longer than the Pale Lord's glacial grid takes to fall).
    ringHold: 2.0,

    endlessBossInterval: 75,
    endlessBossMinInterval: 30,
    endlessBossAccel: 18,
    endlessBossMult: 1.25,
    endlessRampTime: 240,
    endlessEventInterval: 90,
    endlessEnemyRampTime: 300,
    // Overtime's ramps start here (27:00), and its first boss and first
    // horde surge come this long after dawn; each surge brings this many.
    endlessRampStart: 1620,
    endlessFirstBoss: 120,
    endlessFirstEvent: 100,
    endlessSurgeCount: 22,

    /* The wave director. The first ambient spawn; the rings the horde, an
       elite, a scripted swarm and a boss arrive on (px from the survivor);
       the supply cache's first drop, spacing (every + up to jitter more) and
       distance; Beans's first visit and distance; when Keegan's coffin
       surfaces; and how much warning Death gives. */
    firstSpawn: 0.75,
    spawnRing: 700,
    spawnRingJitter: 160,
    swarmRing: 620,
    bossSpawnDistance: 520,
    cacheFirst: 60,
    cacheEvery: 75,
    cacheJitter: 45,
    cacheDistance: 320,
    /* Edennil's drops (src/game/airdrop.js). The owl crosses at airdropSpeed
       px/s, airdropAltitude above its shadow; the crate falls freely for
       airdropFreefall s, then the canopy opens, landing airdropFall s after
       release. The mark goes down between airdropNear and airdropFar from
       the survivor; the owl enters and leaves airdropMargin past the field's
       edge; airdropSize is its wingspan; airdropFlap wingbeats a second. */
    airdropSpeed: 300, airdropAltitude: 170, airdropFreefall: 0.3, airdropFall: 2.2,
    airdropNear: 180, airdropFar: 380, airdropMargin: 180, airdropSize: 230, airdropFlap: 1.3,
    eggVendorFirst: 150,
    eggVendorDistance: 400,
    coffinTime: 120,
    deathWarning: 15,

    /* Boss patterns, for every boss that does not name its own on the
       pattern entry: how far a summon lands, how summons scale with the
       clock, a volley's spread, speed and share of the boss's damage, the
       same for a ring, and how wide a charge's lane is (x radius). */
    bossInterval: 3.6,
    bossSummonNear: 60,
    bossSummonFar: 130,
    bossSummonScaleTime: 600,
    bossVolleySpread: 0.16,
    bossVolleySpeed: 260,
    bossVolleyDamage: 0.7,
    bossRingSpeed: 220,
    bossRingDamage: 0.6,
    bossChargeGirth: 2.2,
    /* THE SCHEDULED BOSSES (src/game/bossfight.js). A light touch: in 160+
       bot nights they lived a median 6-13s against the build that met them
       and took nothing off the survivor (tools/boss-snapshots.js), dying
       before their kit had played once. The finales are the night's real
       fights; these are its punctuation, so they get just enough to show
       what they do.

       bossHealthCurve: [clock s, x health] on top of Wave.bossScale, linear
       between points: enough that the median build sees the whole kit
       (15-25s). It reads the clock, never the build.

       Each boss's one telegraphed blow takes a share of the survivor's max
       health (the pattern names it, 0.2-0.34) before armour, weighted from
       bossHitEarly at 5:00 to bossHitLate at 27:00 and by (difficulty x
       Hyper) ^ bossHitDifficultyExp - or the boss's own scaled damage if
       that is more - and never more than bossHitCap of the bar.

       bossEnrageAt: it turns at this share of health and its clock runs
       bossEnrageRate faster. No telegraph is shorter than bossMinTele. A
       charge winds up for bossChargeWindup and its lane stops following
       bossChargeLock before it goes (it used to track to the last frame).
       A summoned brood lands no nearer the survivor than bossSummonClear. */
    bossHealthCurve: [[300, 1.6], [630, 1.9], [960, 2.2], [1320, 2.6], [1620, 2.6]],
    // Overtime's bosses take this share of the curve's extra (they ramp on
    // their own: endlessBossMult, endlessRampTime).
    bossHealthOvertime: 0.5,
    bossHitEarly: 0.85,
    bossHitLate: 1.15,
    bossHitDifficultyExp: 0.5,
    bossHitCap: 0.5,
    bossEnrageAt: 0.5,
    bossEnrageRate: 1.2,
    bossMinTele: 0.6,
    bossChargeWindup: 0.9,
    bossChargeLock: 0.32,
    bossSummonClear: 110,
    // A ranged creature's bolt is this share of its body's damage, and it
    // fires from up to rangedReach x its range. A lunge's lane is lungeGirth
    // x its radius wide.
    /* Second Wind: the health it comes back with, its grace, and the burst
       that clears room (reach, damage, shove). */
    secondWindHeal: 0.5,
    secondWindGrace: 2.5,
    secondWindRadius: 170,
    secondWindDamage: 200,
    secondWindKnock: 90,

    /* What things are worth. A coin is coinMin plus up to coinSpread, a chest
       chestMin plus up to chestSpread (x the run's gold multiplier); an
       opened chest pays five times at goldJackpot odds and three times below
       goldLucky, goldMultiRoll of its value each; a bomb takes bombBossPct of
       a boss's health; and the story objects pay what they pay. */
    coinMin: 3,
    coinSpread: 4,
    chestMin: 18,
    chestSpread: 26,
    goldJackpot: 0.03,
    goldLucky: 0.15,
    goldMultiRoll: 0.8,
    bombBossPct: 0.04,
    coffinGold: 80,
    /* THE RELIQUARY: a boss that falls leaves one (Config.reliquaries), and
       it holds reliquaryFive-in-a-hundred five gifts, reliquaryThree three,
       else one - each odds times the survivor's luck. A gift is a step down
       the road the build is already on (LevelUp.bestow): the evolution
       that is ready, the passive a finished weapon is waiting on, a rank on
       the weapon nearest its evolution. */
    reliquaries: true,
    reliquaryFive: 0.05,
    reliquaryThree: 0.25,
    gravebladeGold: 120,
    glaiveGold: 120,
    rangedDamagePct: 0.75,
    rangedReach: 1.15,
    lungeGirth: 2.0,

    /* Weapon mechanics that are not any one weapon's: what evolving adds to
       a chain, a storm and a ricochet; how much each hop of a chain loses;
       how far past its range a chain looks for its first target; an orbit
       blade's share of the weapon's damage per touch; the Radiant Gyre's
       opening pulse (reach, share of damage, shove); how often a storm bolt
       finds a target and how far off it lands; and how soon a weapon with
       nothing in range looks again. */
    evolveChains: 2,
    evolveStrikes: 2,
    evolveBounces: 3,
    chainFalloff: 0.06,
    evolveChainFalloff: 0.06,   // an evolved chain's own fade (a weapon may carry its own)
    chainFirstReach: 1.6,
    orbitTickPct: 0.65,
    gyrePulseRadius: 130,
    gyrePulseDamage: 2.0,
    gyrePulseKnock: 20,
    stormAccuracy: 0.85,
    stormJitter: 30,
    weaponRetry: 0.25,

    bossTimes: [300, 630, 960, 1320, 1620],
    spawnIntervalMult: 1.0,
    spawnCountMult: 1.0,
    /* THE TIDE (waves.js Wave.tide): the ambient horde breathes around the
       bosses. For tideGather seconds before a boss it thickens to tideCrest
       of its pace; for tideLull seconds after one falls it thins to tideLow
       and eases back. And once a battlefield's last phase has begun, the pace
       keeps rising by one tideLateRamp-th a second, so the back half of the
       night is not a flat walk to dawn. */
    tides: true,
    tideGather: 40, tideCrest: 1.5,
    tideLull: 22.5, tideLow: 0.35,
    tideLateRamp: 900,
    // The same late rise on a night without Tides, at half the slope: x1.4
    // creatures by 30:00 on most battlefields, more to kill, not tougher.
    defaultLateRamp: 1800,
    /* And the night deepens at each boss: once a scheduled boss's lull is
       over, the horde's health steps up by that boss's share here (easing
       in over tideStepTime), so the stretch a boss's reliquary buys is
       caught up with before the next. Weighted late, where the build is. */
    tideSteps: [0.10, 0.15, 0.25, 0.30, 0],
    tideStepTime: 60,
    /* ...but only as deep as the survivor can take. Each step is scaled, when
       it comes, by how hard the night has been hitting: health DRAINED over
       roughly the last tideStrainTime seconds (damage taken less healing
       received), as a share of max health a second, and how low the bar has
       been lately. At no drain and a bar above tideLowBar the step lands in
       full; at tideStrainFull, or a bar tideLowSpan below tideLowBar, it does
       not land at all, and the late climb follows the latest step.

       Drain, not damage: counting only the blows read a thorns or lifesteal
       build that stands in the crowd and heals every point back as a
       survivor in trouble (a warrior healing 98% of what he took got 48% of
       each step), so the builds made to take hits got the softest nights. On
       the hardest battlefields, where no one gets ahead, the full steps took
       a strong player's dawns from 6 in 24 to none; they are there to catch
       a build that has run away with the night, not to finish one that has
       not. */
    tideStrainTime: 90, tideStrainFull: 0.003,
    /* Every night has the Tides. A survivor who wants the old night (one
       pace, no deepening, no reliquaries) can choose the Classic Night on
       the Oaths sheet, for a little less score: x0.9 here, and it also never
       earns the deepening's own bonus (depthScore). */
    classicScoreMult: 0.9,
    tideLowBar: 0.7, tideLowSpan: 0.4,
    /* ...and the night pays for what it took: each reliquary's odds of three
       and five gifts grow with the share of the last step that landed (x2
       and x3 at a full step), and every step taken adds depthScore of it to
       the night's score (Runs.score). Taking the night deep is a wager,
       not a tax. */
    reliquaryDeepThree: 1.0, reliquaryDeepFive: 2.0,
    depthScore: 0.05,
    deathTime: 1800,
    deathInterval: 60,
    /* Overtime that costs hits instead of one-shotting or never landing.
       m = minutes past deathTime. A new Death every max(deathIntervalMin,
       deathInterval - deathIntervalStep*m) s, at most min(deathCapMax,
       1 + floor(m / deathCapEvery)) alive. His touch costs a share of your
       health, min(1, deathContactBase + deathContactStep*m) of it (armour
       still applies): 30% at first, lethal by m = 14. And on one clock, every
       max(deathBlinkMin, deathBlinkPeriod - m) s, the oldest Death BLINKS: a
       ring opens where you are headed (deathBlinkLead s ahead), deathBlinkFuse
       s later he is there, and inside the ring it costs min(deathBlinkMax,
       deathBlinkBase + deathBlinkStep*m) of your health and withers your
       healing (x witherMult for witherTime s). A survivor at full speed who
       turns clears the ring; one who runs straight does not. */
    deathIntervalMin: 25, deathIntervalStep: 5,
    /* Death can be slowed, but only a fifth as much as anything else
       (1 = slows in full): a reaper you can pin in place is not one. */
    deathSlowTake: 0.2,
    deathCapMax: 8, deathCapEvery: 2,
    deathContactBase: 0.30, deathContactStep: 0.05,
    deathBlinkPeriod: 15, deathBlinkMin: 6, deathBlinkFuse: 0.8, deathBlinkRadius: 110, deathBlinkLead: 0.4,
    deathBlinkBase: 0.20, deathBlinkStep: 0.03, deathBlinkMax: 0.6,
    witherMult: 0.5, witherTime: 4,

    /* Standing and taking it. Measured (tools/tank-sim.js) on the hardest
       night: a warrior with every defensive passive at max, 760 health and
       23 armour, stood in the crowd exactly as long as a glass mage with 360
       health and 5 - ten seconds - because armour took 43% off a hit and the
       aura, which never grew past its rank, did 3% of the killing. So armour
       bites harder, thorns throw more back, and the aura burns in proportion
       to the armour of whoever wears it: the heavier the tank, the hotter. */
    thornsFlat: 10,
    thornsDamagePct: 0.60,
    retributionArmorScale: 0.12,   // +12% aura damage per point of armour
    retributionBase: 4.55,
    retributionPerRank: 3.64,
    retributionRange: 60,
    retributionRangePerRank: 20,
    retributionTick: 0.5,
    chillRangeBase: 70,
    chillRangePerRank: 18,
    chillSlowPerRank: 0.10,

    // Armor is a diminishing reduction: 1 - armor/(armor + K).
    armorConstant: 16,

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
    curdleCoefficient: 0.21,
    /* ...and the pulse grows with Might and with your arsenal (the mean,
       over held weapons, of 1 + curdleRankStep a rank past the first, x
       curdleEvolvedMult evolved; Player.curdleScale). */
    curdleRankStep: 0.20,
    curdleReach: 380,
    curdleEvolvedMult: 5,
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
      // The first look, a run's first few seconds in; the gold for bringing
      // one in; how fast progress drains when you step away (x the fill
      // rate); how much tougher than the horde their guards are, and who.
      firstCheck: 8, reward: 100, drain: 0.6, guardScale: 1.4,
      guards: {
        rogue: [['kerchief', 4], ['bruiser', 2]],
        hunter: [['wolf', 8]],
        warrior: [['skeleton', 6]],
      },
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
    metaRecovery: 8.0,
    metaRecoveryBorn: 6.4,
    metaRecoveryPerRank: 0.5,
    /* At max Ruin Hunger (rank 5) with metaDuration+metaDurationPerRank*5 = 13s
     * of uptime per form: metaRecoveryBornFloor gives the ruinborn 13/17.4 =
     * 74.7% uptime, and metaRecoveryFloor gives everyone else 13/18.5 = 70.3%.
     * Without Ruin Hunger: 55.6% and 50%. The ruinborn's rest is a fifth
     * shorter, one number, like every survivor's edge.
     *
     * Was 5.0 / 3.5 with floors 4.5 / 2.5 and x1.85 damage: the Pact was the
     * strongest signature in the draft for anyone (+30s of survival at 22:00
     * over a plain blessing, 30 seeds) and the Ruinseeker's shorter rest was
     * +19s on top, where every other survivor's edge measures within noise
     * of zero (tools/blessing-matrix.js). Now +19s for anyone, level with
     * Stillwater Step, and the edge within noise. */
    metaRecoveryBornFloor: 4.4,
    metaRecoveryFloor: 5.5,
    metaDuration: 8.0,
    /* The steroid: x1.6 damage and x0.60 cooldown while transformed, about
       x2.7 output (was x1.85, x3.1; x2.00, x3.3 before that). */
    metaDamageMult: 1.6,
    metaCooldownMult: 0.60,
    metaDurationPerRank: 1.0,
    glaiveMetas: 3,

    /* WILDSHAPE (The Old Shapes). Kills feed the Wild - a kill within
       wildNear of you counts wildNearMult times, an elite wildElite, a boss
       wildBoss - and the bar needs wildNeedBase plus wildNeedPerMinute for
       every minute of the night, so it takes about as long to fill at 25:00
       as at 2:00 against a horde that is ten times thicker. Full, it shifts
       you into the shape your arsenal leans to, for formDuration seconds
       (+formDurationPerRank per Primal Kinship), and then the Wild sleeps
       for wildLock (minus wildLockPerRank, never below wildLockFloor).

       The two shapes are not a bigger number, they are different trades.
       The BEAR takes bearMitigation off every hit, hits bearPhysical harder
       with physical weapons, and mauls everything within maulRadius every
       maulEvery seconds. The OWLBEAR hits owlMagic harder with every other
       school, fires owlCooldownMult faster, and brings a star down on the
       nearest thing within owlStarRange every owlStarEvery seconds. Both
       strikes grow with level and damage like the Stillwater palm below.
       Primal Kinship adds kinshipDamage per rank to everything in a shape.

       Measured against Ruinform (x1.85 damage, x0.60 cooldown, 8s): a shape
       is roughly x1.5 on the half of a build it favours, plus its strike,
       for longer - broader and gentler, and it protects as much as it hits. */
    wildNeedBase: 50,
    wildNeedPerMinute: 14,
    wildNear: 240,
    wildNearMult: 2,
    wildElite: 8,
    wildBoss: 30,
    wildPerRank: 0.10,
    formDuration: 11,
    formDurationPerRank: 1.5,
    wildLock: 7,
    wildLockPerRank: 0.75,
    wildLockFloor: 3,
    bearMitigation: 0.30,
    bearPhysical: 0.40,
    bearMoveMult: 0.95,
    maulEvery: 1.1,
    maulRadius: 105,
    maulBase: 24,
    maulPerLevel: 1.8,
    maulKnock: 42,
    owlMagic: 0.35,
    owlCooldownMult: 0.85,
    owlStarEvery: 0.8,
    owlStarRange: 440,
    owlStarRadius: 62,
    owlStarBase: 20,
    owlStarPerLevel: 1.5,
    kinshipDamage: 0.06,
    // The Lost Calves, which bring Milksupply: shapes taken in one night, how
    // many calves wander in, how long there is to gather them, how far out.
    calfShifts: 3,
    calfCount: 3,
    calfTime: 60,
    calfDistance: 430,

    /* STILLWATER STEP. flowSteps charges (the Monk's own knack adds one,
       Serenity another at ranks 3 and 5). A hit you would take is spent
       stepping flowDistance through it instead - flowGrace of untouchable
       after - and the palm strikes everything in a flowStrikeWidth lane along
       the way for flowStrikeBase + flowStrikePerLevel per level, times your
       damage. Each step lays down a stack of Poise (+poiseDamage to every
       weapon, up to poiseMax) that lasts poiseTime. A step comes back every
       flowRecharge seconds, flowRechargePerRank sooner per Serenity rank, not
       below flowRechargeFloor; Serenity also adds serenityStrike to the palm.

       It is a dodge that hits back, rationed: two steps every seven seconds. */
    flowSteps: 2,
    // Was 5.5: Stillwater was +24s of survival for anyone at 22:00, the
    // strongest signature with the Pact. At 7 it is +17s, level with the
    // strongest plain legendary (tools/blessing-matrix.js).
    flowRecharge: 7.0,
    flowRechargePerRank: 0.5,
    flowRechargeFloor: 2.5,
    flowDistance: 120,
    flowGrace: 0.45,
    flowStrikeBase: 30,
    flowStrikePerLevel: 2.2,
    flowStrikeWidth: 34,
    poiseDamage: 0.06,
    poiseMax: 5,
    poiseTime: 4.0,
    serenityStrike: 0.15,
    // the Serenity ranks that add a third and a fourth step
    serenityThirdStep: 3,
    serenityFourthStep: 5,
    // The Trial of the Still Hand, which brings Abbot Eisen: steps taken in
    // one night before he shows himself, and how long you must then go unhit.
    trialSteps: 25,
    trialTime: 20,

    /* HIGHMOOR - src/game/highmoor.js. Two things only this battlefield has.

       STORM CELLS. Every so often the sky picks a handful of spots, one of
       them wherever you are standing, darkens them for stormTele seconds
       and then strikes. The strike hurts you (stormDamage, scaled like a
       creature's blow) and it hurts EVERYTHING ELSE caught in it far worse
       (stormFoeDamage, scaled like a creature's health), so the storm is a
       weapon as much as a threat: step out and let the horde follow you in.

       SHRINES. A ring of standing stones rises now and then. Stand in it for
       shrineCapture seconds (the count slips back while you are out) and it
       gives one of three boons for shrineBuff seconds: STONE (a share of
       every blow turned aside), GALE (faster feet, faster weapons) or STORM
       (lightning from your own sky on the nearest foes). */
    stormFirst: 20, stormEvery: 15, stormEveryFloor: 8, stormEveryPerMinute: 0.25,
    stormStrikes: 3, stormStrikesPerMinute: 0.12, stormStrikesMax: 7,
    stormRadius: 88, stormTele: 1.7, stormSpread: 380,
    stormDamage: 18, stormFoeDamage: 70,
    shrineFirst: 50, shrineEvery: 75, shrineRadius: 72, shrineCapture: 3.5, shrineDecay: 0.5,
    shrineStay: 32, shrineBuff: 20,
    shrineStoneMitigation: 0.30, shrineGaleSpeed: 1.20, shrineGaleCooldown: 0.85,
    shrineStormEvery: 1.1, shrineStormTargets: 2, shrineStormDamage: 40,
    // The Serration passive: the share of a crit that bleeds, and how.
    serrationShare: 0.30, bleedTime: 3.0, bleedTick: 0.5,

    limitBreakDamage: 0.08,

    eggVendorInterval: 420,
    eggVendorCost: 100,
    /* How long Beans stays once she sets up shop. She used to stay until you
       walked into her, which made her a bank: park her, farm, and spend at
       the best moment. She is a visit, not a vault. */
    eggVendorStay: 90,
    /* When she comes (WaveManager.beansFollows): this long after a scheduled
       boss falls, if she was last here at least eggVendorGap ago and the
       finale is at least eggVendorFinaleGap away; the breather has its own
       visit, for as long as the breather lasts. eggVendorInterval is her
       clock after dawn. */
    eggVendorDelay: 4,
    eggVendorGap: 300,
    eggVendorFinaleGap: 240,
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

    /* CALLINGS - the first eight survivors' own powers (src/game/callings.js).
       Each is a legendary blessing anyone can take; the survivor it belongs
       to is a quarter further along ONE number of it (callingEdge), never
       handed a second copy of the thing. Strikes grow with level and Damage
       like a shape's maul: base + perLevel x level. */
    callingEdge: 0.25,
    // Spellflood: gems swell it; full, every weapon fires and the tide runs
    // cooldowns fast for surgeDuration seconds.
    overflowNeedBase: 18, overflowNeedPerMinute: 2.5,
    surgeDuration: 5, surgeCooldownMult: 0.5,
    // Radiant Barrier: wasted healing, and a share of healing that lands,
    // becomes a barrier up to a share of max health; breaking, it bursts.
    barrierCapPct: 0.30, barrierFromHeal: 0.20,
    // A barrier that has just soaked a blow cannot refill from healing for
    // barrierDelay seconds: healing in a crowd refilled it faster than the
    // crowd could wear it through, so it never broke.
    barrierDelay: 2.0,
    /* ...and then it RE-FORMS on its own. Healing alone could not build it
       back in a crowd - every blow it soaked held the refill off again, so
       with light healing it averaged 3% full and the Ward 1%, a sliver that
       broke as it formed. Broken (or never yet formed), it now builds back
       over barrierReformTime - no blow can stop that, and every heal you
       take hurries it (barrierReformHeal of max health healed is the whole
       of it) - and comes back at barrierReformPct of its cap. */
    barrierReformTime: 4, barrierReformPct: 0.5, barrierReformHeal: 0.3,
    barrierBurstRadius: 160, barrierBurstBase: 90, barrierBurstPerLevel: 9, barrierBurstMin: 0.25,
    // Opportunist: a crit is a point of Edge (no more than one per comboGate
    // seconds); comboNeed and the toughest enemy within reach takes a
    // Cutthroat blow, then a Slip, then comboLock to regroup.
    comboNeed: 5, comboGate: 0.35, comboLock: 3,
    eviscerateRange: 420, eviscerateBase: 140, eviscerateLevel: 14, vanishTime: 1.2,
    // The Quarry: every markEvery seconds the toughest thing within markRange
    // becomes the Quarry for up to markLife: +markBonus damage taken from
    // everything (bosses markBossBonus). Killing it readies every weapon
    // (cooldowns down to markRefund) and mends markHeal of max health.
    markEvery: 7, markLife: 10, markRange: 560, markBonus: 0.35, markBossBonus: 0.20,
    markRefund: 0.15, markHeal: 0.05,
    // Seething Blood: a hit you take is ragePerHit of heat, a kill within
    // rageCloseRange ragePerCloseKill; heat holds rageHold
    // seconds then cools at rageDecay a second. Heat is up to rageArmor armour
    // and +rageDamage damage; full, Boil Over for enrageTime.
    ragePerHit: 14, rageNeed: 100, rageHold: 2.5, rageDecay: 8,
    ragePerCloseKill: 2, rageCloseRange: 150,   // brawling feeds it too
    rageArmor: 6, rageDamage: 0.20,
    enrageTime: 6, enrageArmor: 8, enrageDamage: 0.25, enrageThorns: 2, enrageRegen: 0.03, rageLock: 4,
    // Reaper's Tithe: kills pay it (it asks more as the night goes on). Over
    // half paid, +soulEmpower damage; paid in full, a Reaping heals rendHealPer
    // of max health for each enemy it strikes, up to rendHealCap.
    // After a Reaping the tithe rests soulLock seconds before it gathers
    // again. The price grows with the clock, not with the crowd, so on a dense
    // field early (Pale Waste on Hyper at 4:00) Reapings came back to back and
    // healed 15 health a second, more than any other blessing but one; the
    // rest caps how often without touching a late run, where the price is
    // the limit (tools/blessing-matrix.js).
    // rendHealCap was 0.25: still +15s at 4:00 on Pale Waste Hyper with the
    // rest in place; at 0.15 it is +9s there and +4s late.
    soulNeedBase: 50, soulNeedPerMinute: 10, soulBoss: 25, soulElite: 6, soulEmpower: 0.15, soulLock: 5,
    rendRadius: 240, rendBase: 90, rendPerLevel: 9, rendHealPer: 0.015, rendHealCap: 0.15,
    /* Waystones: each stone is BUILT by a way of fighting, and rises where
       you stand when it is full, standing totemLife (one of a kind: a new
       one replaces the old). They used to rise on a timer, ember, spring,
       gale, over and over, which asked nothing of anyone.
         Ember: damage you deal within totemRadius of you. Full after
           emberSeconds of your own recent damage, if all of it were dealt
           close; a build that fights at range fills it slowly. It erupts
           as it rises, then sears everything near it every totemSearTick.
         Spring: healing you receive, overheal included; full at springNeed
           of your max health. It rains: a pool every springPoolEvery near
           you, standing springPoolLife, mending springPoolHeal of max health
           a second while you stand in one.
         Gale: ground you cover; full after galeDistance. Near it, weapons
           fire totemHaste as often. */
    totemLife: 10, totemRadius: 200,
    emberSeconds: 5, springNeed: 0.6, galeDistance: 1600,
    totemSearTick: 0.5, totemSearBase: 10, totemSearPerLevel: 0.4,
    emberEruptBase: 60, emberEruptPerLevel: 6,
    springPoolEvery: 1.1, springPoolLife: 3.5, springPoolRadius: 46, springPoolHeal: 0.04,
    totemHaste: 0.8,
    // Conviction: holyPerHit for each hit taken, one for every holyHealPct of
    // max health healed. At holyNeed, Judgement: every creature on the field
    // struck down and judgementBossPct off a boss, with an Aegis; then
    // holyLock before it gathers again.
    holyNeed: 36, holyPerHit: 0.5, holyHealPct: 0.10, holyLock: 20,
    judgementBossPct: 0.04, divineShield: 2.0,

    /* CALLING PASSIVES - one epic passive of five ranks for each calling
       (upgrades.js), the way Ruin Hunger, Primal Kinship and Serenity deepen
       theirs. Every figure is per rank. Four of them carry over: without the
       calling they do a smaller thing of their own, never the calling itself;
       with it, only the calling's half applies.
       Undertow (Spellflood): the Flood fills undertowFill faster and the tide
       runs undertowTide seconds longer. Without it: every undertowGems gems
       gathered take undertowCut off the slowest weapon's wait. */
    undertowFill: 0.10, undertowTide: 0.6, undertowGems: 15, undertowCut: 0.20,
    // Hallowed Mending (Radiant Barrier): the barrier holds hallowedCap more,
    // and its burst strikes hallowedBurst harder and hallowedReach wider.
    // Without it: overheal becomes a Ward of up to hallowedWard of max health,
    // which takes hits like the barrier but never bursts.
    hallowedCap: 0.10, hallowedBurst: 0.15, hallowedReach: 0.06, hallowedWard: 0.04,
    // Ruthless (Opportunist): ruthlessEdge more Edge a crit, a Cutthroat
    // ruthlessBlow harder, ruthlessRegroup seconds less to regroup. Without
    // it: a crit that leaves an ordinary creature (no elite, no boss) below
    // ruthlessExecute of its health finishes it (flat, from rank 1), and every
    // rank's crits land ruthlessLow harder on anything below ruthlessLowLine
    // of its health, elites and bosses included. The execute alone added
    // next to nothing past rank 1: late, a crit kills trash anyway.
    ruthlessEdge: 0.10, ruthlessBlow: 0.15, ruthlessRegroup: 0.3, ruthlessExecute: 0.06,
    ruthlessLow: 0.08, ruthlessLowLine: 0.35,
    // Against a boss, a finale's machine or Death, Ruthless's low-health crits land at this share.
    ruthlessBossShare: 0.5,
    // Stalker's Patience (The Quarry, no carry-over): a Quarry stalkerHaste
    // sooner, held stalkerLife seconds longer, taking stalkerBonus more.
    stalkerHaste: 0.06, stalkerLife: 1, stalkerBonus: 0.05,
    // Slow Burn (Seething Blood): heat builds slowBurnHeat faster and cools
    // slowBurnCool slower, and Boil Over lasts slowBurnBoil seconds longer.
    // Without it: every blow taken is a stack of Smoulder, slowBurnStack
    // damage each, up to slowBurnMax, gone slowBurnTime after the last blow.
    slowBurnHeat: 0.08, slowBurnCool: 0.10, slowBurnBoil: 0.6,
    slowBurnStack: 0.006, slowBurnMax: 8, slowBurnTime: 4,
    // Bountiful Tithe (Reaper's Tithe, no carry-over): it fills bountifulFill
    // faster, and a Reaping reaches bountifulReach wider and may heal
    // bountifulHeal more of max health.
    bountifulFill: 0.08, bountifulReach: 0.08, bountifulHeal: 0.01,
    // Deep Roots (Waystones, no carry-over): stones stand deepRootsLife
    // seconds longer and reach deepRootsReach farther; from rank
    // deepRootsPair two of each kind stand at once.
    deepRootsLife: 1, deepRootsReach: 0.06, deepRootsPair: 5,
    // Fervor (Conviction, no carry-over): it builds fervorBuild faster, a
    // Judgement takes fervorJudge more of a boss, the Aegis lasts fervorAegis
    // seconds longer.
    fervorBuild: 0.08, fervorJudge: 0.005, fervorAegis: 0.3,

    /* Two difficulties. Beginner (scale 0.75) went: the Tides already ease
       the night for a survivor who is struggling, and the Oaths are the way
       up. A save or a run record that still says beginner reads as Veteran
       (save.js, Runs.diffLabel). */
    difficulties: {
      veteran: { label: 'Veteran', scale: 1.0, gold: 1.0, interval: 1.0 },
      professional: { label: 'Professional', scale: 1.3, gold: 1.25, interval: 0.85 },
    },
    difficultyOrder: ['veteran', 'professional'],

    defaultSettings: {
      /* Accessibility. The danger palette recolours every telegraph and
         hazard (see Renderer.danger), reduceFlashes softens full-screen
         flashes and strobing telegraphs, textScale sizes the interface
         type, and keys are the player's own bindings (arrows always move
         as well). */
      dangerPalette: 'ember',
      reduceFlashes: false,
      textScale: 1,
      keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', pause: 'Escape', reroll: 'KeyR', banish: 'KeyB',
        pick1: 'Digit1', pick2: 'Digit2', pick3: 'Digit3', pick4: 'Digit4' },
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
      // Countdown bars for what comes next; shown only once a dawn is won.
      bossTimers: true,
      // Draw at a lower resolution while frames run slow (renderer.js).
      dynamicResolution: true,
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
