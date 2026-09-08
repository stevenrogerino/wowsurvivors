/* Rank-and-file enemies. Base stats are minute-zero Thornhollow; the wave manager
 * scales health/damage/xp with time and map difficulty.
 *   family - statistics + achievements     ranged - stops and lobs bolts
 *   art    - procedural sprite archetype   tint   - body palette key colour */
'use strict';
(function (WS) {

  WS.Enemies = {
    /* ------------------------------------------------------ Thornhollow ---- */
    lampling: {
      name: 'Lampling Tunneler', family: 'lampling', art: 'lampling', tint: [0.95, 0.85, 0.55],
      health: 18, speed: 64, damage: 8, xp: 3, radius: 13,
    },
    boar: {
      name: 'Thicket Tusker', family: 'beast', art: 'boar', tint: [0.68, 0.46, 0.28],
      health: 26, speed: 76, damage: 9, xp: 3, radius: 15,
    },
    wolf: {
      name: 'Longtooth Wolf', family: 'beast', art: 'wolf', tint: [0.62, 0.62, 0.68],
      health: 22, speed: 92, damage: 8, xp: 4, radius: 14,
    },
    gilkin: {
      name: 'Gilkin Forager', family: 'gilkin', art: 'gilkin', tint: [0.45, 0.90, 0.60],
      health: 20, speed: 88, damage: 7, xp: 4, radius: 14,
    },
    gilkin_tidecaller: {
      name: 'Gilkin Tidecaller', family: 'gilkin', art: 'gilkin', tint: [0.40, 0.65, 1.00],
      health: 26, speed: 70, damage: 9, xp: 6, radius: 14, caster: true,
      ranged: { range: 260, cooldown: 3.2, speed: 220, school: 'frost' },
    },
    mongrel: {
      name: 'Snarlpack Mongrel', family: 'mongrel', art: 'mongrel', tint: [0.85, 0.70, 0.45],
      health: 48, speed: 60, damage: 13, xp: 6, radius: 18,
    },
    kerchief: {
      name: 'Kerchief Footpad', family: 'kerchief', art: 'bandit', tint: [1.00, 0.45, 0.40],
      health: 55, speed: 95, damage: 13, xp: 8, radius: 16,
    },
    /* ------------------------------------------------------ Dustreach ---- */
    kerchief_pillager: {
      name: 'Kerchief Pillager', family: 'kerchief', art: 'bandit', tint: [1.00, 0.70, 0.40],
      health: 40, speed: 68, damage: 11, xp: 8, radius: 15, caster: true,
      ranged: { range: 280, cooldown: 2.8, speed: 240, school: 'fire' },
    },
    harvest_reaper: {
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
    bruiser: {
      name: 'Kerchief Bruiser', family: 'kerchief', art: 'brute', tint: [0.90, 0.45, 0.35],
      health: 80, speed: 78, damage: 16, xp: 10, radius: 17,
    },
    /* ------------------------------------------------------ Mourneholt ---- */
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
    moonwretch: {
      name: 'Blackfang Moonwretch', family: 'moonwretch', art: 'moonwretch', tint: [0.55, 0.52, 0.62],
      health: 75, speed: 105, damage: 16, xp: 10, radius: 17,
    },
    spider: {
      name: 'Venomweb Creeper', family: 'beast', art: 'spider', tint: [0.42, 0.32, 0.55],
      health: 38, speed: 90, damage: 11, xp: 6, radius: 14,
    },
    /* --------------------------------------------------- Ochre Plains ---- */
    longstrider: {
      name: 'Greater Longstrider', family: 'beast', art: 'strider', tint: [0.75, 0.55, 0.80],
      health: 55, speed: 80, damage: 13, xp: 8, radius: 17,
    },
    raptor: {
      name: 'Sunhide Raptor', family: 'beast', art: 'raptor', tint: [0.90, 0.60, 0.25],
      health: 60, speed: 108, damage: 15, xp: 9, radius: 16,
    },
    bristlekin: {
      name: 'Thornhide Battleguard', family: 'bristlekin', art: 'bristlekin', tint: [0.85, 0.55, 0.40],
      health: 90, speed: 65, damage: 17, xp: 11, radius: 18,
    },
    shrikewing: {
      name: 'Shrikewing Windcaller', family: 'shrikewing', art: 'shrikewing', tint: [0.65, 0.85, 1.00],
      health: 48, speed: 75, damage: 12, xp: 10, radius: 15, caster: true,
      ranged: { range: 290, cooldown: 2.6, speed: 250, school: 'nature' },
    },
    karrash: {
      name: 'Karrash Outrunner', family: 'karrash', art: 'karrash', tint: [0.80, 0.60, 0.42],
      health: 85, speed: 95, damage: 16, xp: 11, radius: 18,
    },
    lion: {
      name: 'Savannah Prowler', family: 'beast', art: 'cat', tint: [0.88, 0.72, 0.40],
      health: 65, speed: 100, damage: 15, xp: 9, radius: 16,
    },
    /* ----------------------------------------------------- Pale Wastes ---- */
    pale_ghoul: {
      name: 'Palewaste Ghoul', family: 'undead', art: 'ghoul', tint: [0.55, 0.88, 0.95],
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
    snarlpack_bonesnapper: {
      name: 'Snarlpack Bonesnapper', family: 'mongrel', elite: true, art: 'mongrel',
      tint: [1.00, 0.72, 0.15], health: 340, speed: 62, damage: 22, xp: 34, radius: 28,
    },
    kerchief_enforcer: {
      name: 'Kerchief Enforcer', family: 'kerchief', elite: true, art: 'brute',
      tint: [1.00, 0.45, 0.30], health: 480, speed: 72, damage: 26, xp: 44, radius: 28,
    },
    bone_sentinel: {
      name: 'Bone Sentinel', family: 'undead', elite: true, art: 'skeleton',
      tint: [0.90, 0.95, 1.00], health: 620, speed: 58, damage: 30, xp: 56, radius: 30,
    },
    karrash_battlelord: {
      name: 'Karrash Battlelord', family: 'karrash', elite: true, art: 'karrash',
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
