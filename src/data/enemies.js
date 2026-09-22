/* Rank-and-file enemies. Base stats are minute-zero Thornhollow; the wave manager
 * scales health/damage/xp with time and map difficulty.
 *   family - statistics + achievements     ranged - stops and lobs bolts
 *   art    - procedural sprite archetype   tint   - body palette key colour
 *
 * And the behaviours, which are what stop a field of two hundred creatures
 * from being one creature two hundred times. Each is optional data, so a new
 * one is a line on a template rather than a branch in the game:
 *
 *   lunge  {range, cooldown, windup, time}   the boss charge at small size:
 *          plants, marks a lane, then runs down exactly that lane. ELITES AND
 *          BOSSES ONLY - see WS.Elites below. It was on two rank-and-file
 *          templates, the Longtooth Wolf and the Sunhide Raptor, and both of
 *          those arrive in packs from the first minute. Measured over five
 *          minutes of Thornhollow: eleven of them on the field at once, a
 *          charge committing every 3.2 seconds and twenty-two inside one
 *          thirty-second stretch. A tell that fires that often is not a tell,
 *          it is weather - and the sound it plays ducks the whole mix, so a
 *          fifth of the run was spent at half volume. Something that plants
 *          and marks the ground has to mean "look at THIS one".
 *   orbit  {range, spin}                     holds a ring and walks it, so
 *          circling away from the horde stops being a free answer
 *   trail  {interval, radius, life, damagePct, tint}   leaks ground behind it
 *   burst  {radius, damagePct, fuse, tint}   goes off where it died, which
 *          makes WHERE you kill something matter and not only how fast
 *   split  {into, count, scale}              comes apart into smaller things
 */
'use strict';
(function (WS) {

  WS.Enemies = {
    /* ------------------------------------------------------ Thornhollow ---- */
    lampling: {
      name: 'Lampling Tunneler', family: 'lampling', art: 'lampling', tint: [0.95, 0.85, 0.55],
      health: 19, speed: 64, damage: 9, xp: 3, radius: 13,
    },
    boar: {
      name: 'Thicket Tusker', family: 'beast', art: 'boar', tint: [0.68, 0.46, 0.28],
      health: 28, speed: 76, damage: 10, xp: 3, radius: 15,
    },
    wolf: {
      name: 'Longtooth Wolf', family: 'beast', art: 'wolf', tint: [0.62, 0.62, 0.68],
      health: 24, speed: 92, damage: 9, xp: 4, radius: 14,
    },
    gilkin: {
      name: 'Gilkin Forager', family: 'gilkin', art: 'gilkin', tint: [0.45, 0.90, 0.60],
      health: 22, speed: 88, damage: 8, xp: 4, radius: 14,
    },
    gilkin_tidecaller: {
      name: 'Gilkin Tidecaller', family: 'gilkin', art: 'gilkin', tint: [0.40, 0.65, 1.00],
      health: 28, speed: 70, damage: 10, xp: 6, radius: 14, caster: true,
      ranged: { range: 260, cooldown: 3.2, speed: 220, school: 'frost' },
    },
    mongrel: {
      name: 'Snarlpack Mongrel', family: 'mongrel', art: 'mongrel', tint: [0.85, 0.70, 0.45],
      health: 52, speed: 60, damage: 14, xp: 6, radius: 18,
    },
    kerchief: {
      name: 'Kerchief Footpad', family: 'kerchief', art: 'bandit', tint: [1.00, 0.45, 0.40],
      health: 59, speed: 95, damage: 14, xp: 8, radius: 16,
    },
    /* ------------------------------------------------------ Dustreach ---- */
    kerchief_pillager: {
      name: 'Kerchief Pillager', family: 'kerchief', art: 'bandit', tint: [1.00, 0.70, 0.40],
      health: 43, speed: 68, damage: 12, xp: 8, radius: 15, caster: true,
      ranged: { range: 280, cooldown: 2.8, speed: 240, school: 'fire' },
    },
    harvest_reaper: {
      name: 'Harvest Reaper', family: 'mechanical', art: 'golem', tint: [0.80, 0.70, 0.40],
      health: 103, speed: 46, damage: 18, xp: 10, radius: 20,
      burst: { radius: 92, damagePct: 1.1, tint: [1.00, 0.62, 0.25] },
    },
    fleshripper: {
      name: 'Young Fleshripper', family: 'beast', art: 'vulture', tint: [0.85, 0.60, 0.40],
      health: 37, speed: 100, damage: 11, xp: 6, radius: 14,
      orbit: { range: 150, spin: 1.0 },
    },
    coyote: {
      name: 'Coyote Packrunner', family: 'beast', art: 'wolf', tint: [0.82, 0.68, 0.42],
      health: 32, speed: 96, damage: 11, xp: 5, radius: 14,
    },
    bruiser: {
      name: 'Kerchief Bruiser', family: 'kerchief', art: 'brute', tint: [0.90, 0.45, 0.35],
      // A brute is the wall of its family and was drawn the same size as the
      // shambler. Visual only - the hitbox is the radius and it has not moved.
      health: 86, speed: 78, damage: 17, xp: 10, radius: 17, spriteScale: 1.2,
    },
    /* ------------------------------------------------------ Mourneholt ---- */
    ghoul: {
      name: 'Rotting Shambler', family: 'undead', art: 'ghoul', tint: [0.60, 0.80, 0.50],
      health: 65, speed: 55, damage: 15, xp: 8, radius: 17,
    },
    skeleton: {
      name: 'Skeletal Warrior', family: 'undead', art: 'skeleton', tint: [0.88, 0.90, 0.82],
      health: 49, speed: 70, damage: 13, xp: 7, radius: 16,
    },
    skeletal_mage: {
      name: 'Skeletal Frostweaver', family: 'undead', art: 'skeleton', tint: [0.60, 0.80, 1.00],
      health: 43, speed: 60, damage: 12, xp: 9, radius: 15, caster: true,
      ranged: { range: 270, cooldown: 3.0, speed: 220, school: 'frost', slowFactor: 0.6, slowDuration: 1.2 },
    },
    moonwretch: {
      name: 'Blackfang Moonwretch', family: 'moonwretch', art: 'moonwretch', tint: [0.55, 0.52, 0.62],
      health: 81, speed: 105, damage: 17, xp: 10, radius: 17,
    },
    spider: {
      name: 'Venomweb Creeper', family: 'beast', art: 'spider', tint: [0.42, 0.32, 0.55],
      health: 41, speed: 90, damage: 12, xp: 6, radius: 14,
      trail: { interval: 1.5, radius: 34, life: 4.5, damagePct: 0.35,
        tint: [0.62, 0.35, 0.85] },
    },
    /* --------------------------------------------------- Ochre Plains ---- */
    longstrider: {
      name: 'Greater Longstrider', family: 'beast', art: 'strider', tint: [0.75, 0.55, 0.80],
      health: 59, speed: 80, damage: 14, xp: 8, radius: 17,
    },
    raptor: {
      name: 'Sunhide Raptor', family: 'beast', art: 'raptor', tint: [0.90, 0.60, 0.25],
      health: 65, speed: 108, damage: 16, xp: 9, radius: 16,
    },
    bristlekin: {
      name: 'Thornhide Battleguard', family: 'bristlekin', art: 'bristlekin', tint: [0.85, 0.55, 0.40],
      health: 97, speed: 65, damage: 18, xp: 11, radius: 18,
    },
    shrikewing: {
      name: 'Shrikewing Windcaller', family: 'shrikewing', art: 'shrikewing', tint: [0.65, 0.85, 1.00],
      health: 52, speed: 75, damage: 13, xp: 10, radius: 15, caster: true,
      ranged: { range: 290, cooldown: 2.6, speed: 250, school: 'nature' },
      orbit: { range: 250, spin: 0.85 },
    },
    karrash: {
      name: 'Karrash Outrunner', family: 'karrash', art: 'karrash', tint: [0.80, 0.60, 0.42],
      health: 92, speed: 95, damage: 17, xp: 11, radius: 18,
    },
    lion: {
      name: 'Savannah Prowler', family: 'beast', art: 'cat', tint: [0.88, 0.72, 0.40],
      health: 70, speed: 100, damage: 16, xp: 9, radius: 16,
    },
    /* ----------------------------------------------------- Pale Wastes ---- */
    pale_ghoul: {
      name: 'Palewaste Ghoul', family: 'undead', art: 'ghoul', tint: [0.55, 0.88, 0.95],
      health: 92, speed: 72, damage: 18, xp: 10, radius: 17,
    },
    crypt_fiend: {
      name: 'Crypt Skitterer', family: 'undead', art: 'spider', tint: [0.60, 0.70, 0.85],
      health: 108, speed: 82, damage: 19, xp: 12, radius: 18,
    },
    necromancer: {
      name: 'Cult Necromancer', family: 'undead', art: 'necromancer', tint: [0.70, 0.45, 0.90],
      health: 76, speed: 60, damage: 15, xp: 13, radius: 16, caster: true,
      ranged: { range: 300, cooldown: 2.6, speed: 240, school: 'shadow' },
    },
    abomination: {
      name: 'Stitched Horror', family: 'undead', art: 'abomination', tint: [0.65, 0.80, 0.50],
      health: 238, speed: 40, damage: 28, xp: 18, radius: 24,
      split: { into: 'ghoul', count: 3, scale: 0.75 },
    },
    geist: {
      name: 'Hungering Geist', family: 'undead', art: 'geist', tint: [0.70, 0.85, 0.95],
      health: 59, speed: 118, damage: 15, xp: 10, radius: 14,
      burst: { radius: 74, damagePct: 0.9, fuse: 0.55, tint: [0.60, 0.90, 1.00] },
    },
  };

  /* Elite champions: bigger, gold-glowing, name-plated, always drop a chest. */
  WS.Elites = {
    snarlpack_bonesnapper: {
      name: 'Snarlpack Bonesnapper', family: 'mongrel', elite: true, art: 'mongrel',
      tint: [1.00, 0.72, 0.15], health: 367, speed: 62, damage: 24, xp: 34, radius: 28,
    },
    kerchief_enforcer: {
      name: 'Kerchief Enforcer', family: 'kerchief', elite: true, art: 'brute',
      tint: [1.00, 0.45, 0.30], health: 518, speed: 72, damage: 28, xp: 44, radius: 28,
      spriteScale: 1.2,
      lunge: { range: 300, cooldown: 5.0, windup: 0.55, time: 0.45 },
    },
    bone_sentinel: {
      name: 'Bone Sentinel', family: 'undead', elite: true, art: 'skeleton',
      tint: [0.90, 0.95, 1.00], health: 670, speed: 58, damage: 32, xp: 56, radius: 30,
    },
    karrash_battlelord: {
      name: 'Karrash Battlelord', family: 'karrash', elite: true, art: 'karrash',
      tint: [1.00, 0.62, 0.20], health: 842, speed: 78, damage: 37, xp: 68, radius: 30,
      lunge: { range: 340, cooldown: 4.4, windup: 0.55, time: 0.5 },
    },
    deathbound_vanguard: {
      name: 'Deathbound Vanguard', family: 'undead', elite: true, art: 'skeleton',
      tint: [0.55, 0.80, 1.00], health: 1026, speed: 62, damage: 41, xp: 80, radius: 32,
    },
    // Eclipse Arena: a stationary channeler that drags you toward the chasm.
    shadow_weaver: {
      name: 'Shadow-Weaver', family: 'void', elite: true, stationary: true, art: 'wraith',
      tint: [0.70, 0.40, 0.98], health: 6480, speed: 0, damage: 6, xp: 0, radius: 26,
    },
  };

})(window.WS);
