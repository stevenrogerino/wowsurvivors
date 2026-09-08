/* Weapon definitions. `behavior` selects a handler in src/game/weapon.js:
 *   aimed | spray | ring | nova | zone | chain | orbit | storm | bounce | beam
 * Weapons rank to 8; a rank-8 weapon whose `evolvePairing` passive has been
 * learned may evolve. `art` names a procedural projectile sprite. */
'use strict';
(function (WS) {

  WS.Weapons = {
    seeking_motes: {
      name: 'Seeking Motes', school: 'arcane', behavior: 'aimed', art: 'missile',
      cooldown: 0.85, damage: 6, speed: 370, projectiles: 3, pierce: 2, range: 560,
      homing: true, life: 2.2, radius: 6, burst: true,
      description: 'A rapid volley of small seeking motes that curve through the crowd.',
      evolveName: 'Mote Cascade', evolvePairing: 'quantity',
      evolveDescription: 'The motes multiply beyond counting.',
    },
    cinderfall: {
      name: 'Cinderfall', school: 'fire', behavior: 'aimed', art: 'ember',
      cooldown: 1.60, damage: 34, speed: 380, projectiles: 1, pierce: 0, range: 600,
      splash: 70, life: 2.4, radius: 10,
      description: 'A slow, heavy cinder that bursts on impact.',
      evolveName: 'Fallen Star', evolvePairing: 'area',
      evolveDescription: 'The cinder becomes a falling star.',
    },
    rimeshard: {
      name: 'Rimeshard', school: 'frost', behavior: 'aimed', art: 'shard',
      cooldown: 1.10, damage: 20, speed: 400, projectiles: 1, pierce: 1, range: 580,
      slowFactor: 0.55, slowDuration: 2.0, life: 2.2, radius: 9,
      description: 'Bitter cold that slows whatever it strikes.',
      evolveName: 'Deepwinter', evolvePairing: 'haste',
      evolveDescription: 'Winter itself takes the field.',
    },
    arcweb: {
      name: 'Arcweb', school: 'nature', behavior: 'chain',
      color: [0.55, 0.80, 1.00], art: 'spark',
      cooldown: 1.50, damage: 30, chains: 4, range: 250,
      description: 'Lightning that leaps from foe to foe.',
      evolveName: 'Skybreak', evolvePairing: 'precision',
      evolveDescription: 'The sky answers every call.',
    },
    dawnpulse: {
      name: 'Dawnpulse', school: 'holy', behavior: 'nova', art: 'ring',
      cooldown: 2.40, damage: 30, radius: 150, expandTime: 0.35, knockback: 26,
      description: 'A ring of Light erupts outward from the survivor.',
      evolveName: 'Circle of Dawn', evolvePairing: 'vitality',
      evolveDescription: 'Each dawn mends the faithful.', evolvedHeal: 3,
    },
    verdant_lance: {
      name: 'Verdant Lance', school: 'nature', behavior: 'beam', art: 'beam',
      cooldown: 1.30, damage: 22, range: 620, beamWidth: 26,
      metaWidthMult: 1.8, color: [0.55, 1.00, 0.20],
      description: 'A lance of green fire that burns everything standing in its path.',
      evolveName: 'Verdant Gaze', evolvePairing: 'dodge',
      evolveDescription: 'The gaze widens until the world is a line of green fire.',
    },
    grave_tether: {
      name: 'Grave Tether', school: 'shadow', behavior: 'aimed', art: 'coil',
      cooldown: 1.45, damage: 28, speed: 420, projectiles: 1, pierce: 1,
      range: 600, life: 2.4, radius: 10, heal: 4, color: [0.55, 0.20, 0.75],
      description: 'A coil of dark magic that wounds the living and knits your own flesh back together.',
      evolveName: 'Tether of Anguish', evolvePairing: 'wisdom',
      evolveDescription: 'The tether takes more, and gives more back.', evolvedHeal: 5,
    },
    blightfield: {
      name: 'Blightfield', school: 'shadow', behavior: 'zone', art: 'zone',
      cooldown: 3.90, damage: 13, radius: 130, duration: 4.5, tickRate: 0.45,
      color: [0.45, 0.85, 0.35],
      description: 'Corrupts the ground underfoot; anything standing in it rots.',
      evolveName: 'Blighted Earth', evolvePairing: 'chilling_presence',
      evolveDescription: 'The blight spreads wider the longer it feeds.', evolvedHeal: 1,
    },
    reaving_arc: {
      name: 'Reaving Arc', school: 'shadow', behavior: 'nova', art: 'ring',
      cooldown: 2.20, damage: 34, radius: 130, expandTime: 0.28, knockback: 20,
      heal: 6, color: [0.85, 0.15, 0.20],
      description: 'A sweeping graveblade that carves health out of the wound it makes.',
      evolveName: 'Rend and Mend', evolvePairing: 'recovery',
      evolveDescription: 'The blade drinks deeper than any wound can hold.', evolvedHeal: 6,
    },
    hallowed_ring: {
      name: 'Hallowed Ring', school: 'holy', behavior: 'zone', art: 'zone',
      cooldown: 3.60, damage: 11, radius: 120, duration: 4.0, tickRate: 0.5,
      description: "Hallows the ground beneath the survivor's feet.",
      evolveName: 'Hallowed Ground', evolvePairing: 'armor',
      evolveDescription: 'Sacred ground that shelters as it burns.', evolvedHeal: 1,
    },
    umbral_bolt: {
      name: 'Umbral Bolt', school: 'shadow', behavior: 'aimed', art: 'bolt',
      cooldown: 1.00, damage: 26, speed: 400, projectiles: 1, pierce: 2, range: 580,
      life: 2.4, radius: 9,
      description: 'Bolts of shadow that tear straight through ranks.',
      evolveName: 'Ruin Bolt', evolvePairing: 'might',
      evolveDescription: 'Ruin that nothing can stop.',
    },
    knifestorm: {
      name: 'Knifestorm', school: 'physical', behavior: 'ring', art: 'dagger',
      cooldown: 1.30, damage: 18, speed: 380, projectiles: 6, pierce: 1,
      life: 0.9, radius: 8,
      description: 'A whirling ring of thrown steel.',
      evolveName: 'Steel Flurry', evolvePairing: 'fleetfoot',
      evolveDescription: 'The steel never stops moving.',
    },
    axe_gyre: {
      name: 'Axe Gyre', school: 'physical', behavior: 'orbit', art: 'axe',
      color: [0.85, 0.88, 0.96], evolvedColor: [1.00, 0.55, 0.25],
      cooldown: 5.50, damage: 22, projectiles: 2, orbitRadius: 85, orbitSpeed: 4.2,
      duration: 3.2, radius: 20,
      description: 'Axes circle the survivor, shredding all who close in.',
      evolveName: 'Gyrestorm', evolvePairing: 'ferocity',
      evolveDescription: 'Become the storm of blades.',
    },
    volley: {
      name: 'Volley', school: 'physical', behavior: 'spray', art: 'arrow',
      cooldown: 1.40, damage: 17, speed: 460, projectiles: 3, pierce: 1, range: 620,
      spread: 0.16, life: 1.7, radius: 8,
      description: 'A widening spread of hunting arrows.',
      evolveName: 'Arrowfall', evolvePairing: 'velocity',
      evolveDescription: 'The sky darkens with arrows.',
    },
    moonbrand: {
      name: 'Moonbrand', school: 'arcane', behavior: 'aimed', art: 'moon',
      cooldown: 1.20, damage: 24, speed: 320, projectiles: 1, pierce: 0, range: 560,
      homing: true, life: 2.6, radius: 9,
      description: 'Moonlit flame that tracks its prey.',
      evolveName: 'Moonfall', evolvePairing: 'magnet',
      evolveDescription: 'Moons fall wherever enemies gather.',
      evolvedBehavior: 'storm', strikes: 5, stormRadius: 230, splash: 60,
    },
    judgement_disc: {
      name: 'Judgement Disc', school: 'holy', behavior: 'bounce', art: 'shield',
      cooldown: 2.60, damage: 30, speed: 430, projectiles: 1, bounces: 3, range: 600,
      life: 3.0, radius: 11,
      description: 'A hurled shield that ricochets between enemies.',
      evolveName: 'Reckoning', evolvePairing: 'luck',
      evolveDescription: 'Judgment finds every last one of them.',
    },

    /* ---- Union super-weapons: never offered as ordinary new weapons ------ */
    union_firmament: {
      name: 'Firmament', school: 'arcane', behavior: 'storm', isUnion: true, art: 'moon',
      cooldown: 1.05, damage: 20, strikes: 7, stormRadius: 270, splash: 72, radius: 12,
      description: 'Sun and moon rain from the heavens without end.',
    },
    union_ruin: {
      name: 'Ruin Unbound', school: 'shadow', behavior: 'aimed', isUnion: true, art: 'chaos',
      cooldown: 0.9, damage: 28, speed: 470, projectiles: 2, pierce: 4, range: 620,
      splash: 82, homing: true, life: 2.6, radius: 12, color: [0.60, 0.30, 1.00],
      description: 'Ruin that devours everything in its path.',
    },
    union_steel: {
      name: 'Storm of Steel', school: 'physical', behavior: 'ring', isUnion: true, art: 'dagger',
      cooldown: 0.85, damage: 18, speed: 440, projectiles: 12, pierce: 3, life: 1.1, radius: 9,
      description: 'An unending cyclone of thrown steel.',
    },
    union_sanctuary: {
      name: 'Sanctuary', school: 'holy', behavior: 'nova', isUnion: true, art: 'ring',
      cooldown: 1.8, damage: 26, radius: 205, expandTime: 0.4, knockback: 34,
      description: 'The Light claims this ground as its own.',
    },
    union_stormcall: {
      name: 'Stormcall', school: 'nature', behavior: 'orbit', isUnion: true, art: 'sword',
      cooldown: 4.60, damage: 26, projectiles: 6, orbitRadius: 95, orbitSpeed: 5.0,
      duration: 4.0, radius: 22, procChain: 0.35, color: [0.45, 0.85, 1.00],
      description: 'Blessed blade of the Tempest: a cyclone of steel that answers every cut with lightning.',
    },
  };

  // Shared level-up pool. Every class's starting weapon is findable by anyone.
  WS.WeaponOrder = [
    'seeking_motes', 'cinderfall', 'rimeshard', 'arcweb', 'dawnpulse',
    'hallowed_ring', 'umbral_bolt', 'knifestorm', 'axe_gyre', 'volley',
    'moonbrand', 'judgement_disc', 'reaving_arc', 'verdant_lance',
    'grave_tether', 'blightfield',
  ];

  // Both sources must be fully evolved to merge; the union frees a slot.
  WS.Unions = [
    { result: 'union_firmament', from: ['seeking_motes', 'moonbrand'] },
    { result: 'union_ruin', from: ['cinderfall', 'umbral_bolt'] },
    { result: 'union_steel', from: ['knifestorm', 'volley'] },
    { result: 'union_sanctuary', from: ['dawnpulse', 'hallowed_ring'] },
    { result: 'union_stormcall', from: ['axe_gyre', 'arcweb'] },
  ];

})(window.WS);
