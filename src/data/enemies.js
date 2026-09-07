/* Rank-and-file enemies. Base stats are minute-zero Elwynn; the wave manager
 * scales health/damage/xp with time and map difficulty.
 *   family - statistics + achievements     ranged - stops and lobs bolts
 *   art    - procedural sprite archetype   tint   - body palette key colour */
'use strict';
(function (WS) {

  WS.Enemies = {
    /* --------------------------------------------------------- Elwynn ---- */
    kobold: {
      name: 'Kobold Tunneler', family: 'kobold', art: 'kobold', tint: [0.95, 0.85, 0.55],
      health: 18, speed: 64, damage: 8, xp: 3, radius: 13,
    },
    boar: {
      name: 'Stonetusk Boar', family: 'beast', art: 'boar', tint: [0.68, 0.46, 0.28],
      health: 26, speed: 76, damage: 9, xp: 3, radius: 15,
    },
    wolf: {
      name: 'Longtooth Wolf', family: 'beast', art: 'wolf', tint: [0.62, 0.62, 0.68],
      health: 22, speed: 92, damage: 8, xp: 4, radius: 14,
    },
    murloc: {
      name: 'Murloc Forager', family: 'murloc', art: 'murloc', tint: [0.45, 0.90, 0.60],
      health: 20, speed: 88, damage: 7, xp: 4, radius: 14,
    },
    murloc_oracle: {
      name: 'Murloc Tidecaller', family: 'murloc', art: 'murloc', tint: [0.40, 0.65, 1.00],
      health: 26, speed: 70, damage: 9, xp: 6, radius: 14, caster: true,
      ranged: { range: 260, cooldown: 3.2, speed: 220, school: 'frost' },
    },
    gnoll: {
      name: 'Riverpaw Mongrel', family: 'gnoll', art: 'gnoll', tint: [0.85, 0.70, 0.45],
      health: 48, speed: 60, damage: 13, xp: 6, radius: 18,
    },
    defias: {
      name: 'Defias Footpad', family: 'defias', art: 'bandit', tint: [1.00, 0.45, 0.40],
      health: 55, speed: 95, damage: 13, xp: 8, radius: 16,
    },
    /* ------------------------------------------------------- Westfall ---- */
    defias_pillager: {
      name: 'Defias Pillager', family: 'defias', art: 'bandit', tint: [1.00, 0.70, 0.40],
      health: 40, speed: 68, damage: 11, xp: 8, radius: 15, caster: true,
      ranged: { range: 280, cooldown: 2.8, speed: 240, school: 'fire' },
    },
    harvest_golem: {
      name: 'Harvest Reaper', family: 'mechanical', art: 'golem', tint: [0.80, 0.70, 0.40],
      health: 95, speed: 46, damage: 17, xp: 10, radius: 20,
    },
    fleshripper: {
      name: 'Young Fleshripper', family: 'beast', art: 'vulture', tint: [0.85, 0.60, 0.40],
      health: 34, speed: 100, damage: 10, xp: 6, radius: 14,
    },
    coyote: {
      name: 'Coyote Packrunner', family: 'beast', art: 'wolf', tint: [0.82, 0.68, 0.42],
      health: 30, speed: 96, damage: 10, xp: 5, radius: 14,
    },
    knuckleduster: {
      name: 'Defias Knuckleduster', family: 'defias', art: 'brute', tint: [0.90, 0.45, 0.35],
      health: 80, speed: 78, damage: 16, xp: 10, radius: 17,
    },
    /* ------------------------------------------------------- Duskwood ---- */
    ghoul: {
      name: 'Rotting Shambler', family: 'undead', art: 'ghoul', tint: [0.60, 0.80, 0.50],
      health: 60, speed: 55, damage: 14, xp: 8, radius: 17,
    },
    skeleton: {
      name: 'Skeletal Warrior', family: 'undead', art: 'skeleton', tint: [0.88, 0.90, 0.82],
      health: 45, speed: 70, damage: 12, xp: 7, radius: 16,
    },
    skeletal_mage: {
      name: 'Skeletal Frostweaver', family: 'undead', art: 'skeleton', tint: [0.60, 0.80, 1.00],
      health: 40, speed: 60, damage: 11, xp: 9, radius: 15, caster: true,
      ranged: { range: 270, cooldown: 3.0, speed: 220, school: 'frost', slowFactor: 0.6, slowDuration: 1.2 },
    },
    worgen: {
      name: 'Blackfang Worgen', family: 'worgen', art: 'worgen', tint: [0.55, 0.52, 0.62],
      health: 75, speed: 105, damage: 16, xp: 10, radius: 17,
    },
    spider: {
      name: 'Venomweb Creeper', family: 'beast', art: 'spider', tint: [0.42, 0.32, 0.55],
      health: 38, speed: 90, damage: 11, xp: 6, radius: 14,
    },
    /* -------------------------------------------------------- Barrens ---- */
    plainstrider: {
      name: 'Greater Plainstrider', family: 'beast', art: 'strider', tint: [0.75, 0.55, 0.80],
      health: 55, speed: 80, damage: 13, xp: 8, radius: 17,
    },
    raptor: {
      name: 'Sunscale Raptor', family: 'beast', art: 'raptor', tint: [0.90, 0.60, 0.25],
      health: 60, speed: 108, damage: 15, xp: 9, radius: 16,
    },
    quilboar: {
      name: 'Razormane Battleguard', family: 'quilboar', art: 'quilboar', tint: [0.85, 0.55, 0.40],
      health: 90, speed: 65, damage: 17, xp: 11, radius: 18,
    },
    harpy: {
      name: 'Witchwing Windcaller', family: 'harpy', art: 'harpy', tint: [0.65, 0.85, 1.00],
      health: 48, speed: 75, damage: 12, xp: 10, radius: 15, caster: true,
      ranged: { range: 290, cooldown: 2.6, speed: 250, school: 'nature' },
    },
    centaur: {
      name: 'Kolkar Outrunner', family: 'centaur', art: 'centaur', tint: [0.80, 0.60, 0.42],
      health: 85, speed: 95, damage: 16, xp: 11, radius: 18,
    },
    lion: {
      name: 'Savannah Prowler', family: 'beast', art: 'cat', tint: [0.88, 0.72, 0.40],
      health: 65, speed: 100, damage: 15, xp: 9, radius: 16,
    },
    /* ------------------------------------------------------- Icecrown ---- */
    scourge_ghoul: {
      name: 'Scourge Ghoul', family: 'undead', art: 'ghoul', tint: [0.55, 0.88, 0.95],
      health: 85, speed: 72, damage: 17, xp: 10, radius: 17,
    },
    crypt_fiend: {
      name: 'Crypt Skitterer', family: 'undead', art: 'spider', tint: [0.60, 0.70, 0.85],
      health: 100, speed: 82, damage: 18, xp: 12, radius: 18,
    },
    necromancer: {
      name: 'Cult Necromancer', family: 'undead', art: 'necromancer', tint: [0.70, 0.45, 0.90],
      health: 70, speed: 60, damage: 14, xp: 13, radius: 16, caster: true,
      ranged: { range: 300, cooldown: 2.6, speed: 240, school: 'shadow' },
    },
    abomination: {
      name: 'Stitched Horror', family: 'undead', art: 'abomination', tint: [0.65, 0.80, 0.50],
      health: 220, speed: 40, damage: 26, xp: 18, radius: 24,
    },
    geist: {
      name: 'Hungering Geist', family: 'undead', art: 'geist', tint: [0.70, 0.85, 0.95],
      health: 55, speed: 118, damage: 14, xp: 10, radius: 14,
    },
  };

  /* Elite champions: bigger, gold-glowing, name-plated, always drop a chest. */
  WS.Elites = {
    riverpaw_bonesnapper: {
      name: 'Riverpaw Bonesnapper', family: 'gnoll', elite: true, art: 'gnoll',
      tint: [1.00, 0.72, 0.15], health: 340, speed: 62, damage: 22, xp: 34, radius: 28,
    },
    defias_enforcer: {
      name: 'Defias Enforcer', family: 'defias', elite: true, art: 'brute',
      tint: [1.00, 0.45, 0.30], health: 480, speed: 72, damage: 26, xp: 44, radius: 28,
    },
    bone_sentinel: {
      name: 'Bone Sentinel', family: 'undead', elite: true, art: 'skeleton',
      tint: [0.90, 0.95, 1.00], health: 620, speed: 58, damage: 30, xp: 56, radius: 30,
    },
    kolkar_battlelord: {
      name: 'Kolkar Battlelord', family: 'centaur', elite: true, art: 'centaur',
      tint: [1.00, 0.62, 0.20], health: 780, speed: 78, damage: 34, xp: 68, radius: 30,
    },
    deathbound_vanguard: {
      name: 'Deathbound Vanguard', family: 'undead', elite: true, art: 'skeleton',
      tint: [0.55, 0.80, 1.00], health: 950, speed: 62, damage: 38, xp: 80, radius: 32,
    },
    // Eclipse Arena: a stationary channeler that drags you toward the chasm.
    shadow_weaver: {
      name: 'Shadow-Weaver', family: 'void', elite: true, stationary: true, art: 'wraith',
      tint: [0.70, 0.40, 0.98], health: 6000, speed: 0, damage: 6, xp: 0, radius: 26,
    },
  };

})(window.WS);
