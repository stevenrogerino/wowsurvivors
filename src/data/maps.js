/* Battlefields: complete data-driven 30-minute campaigns.
 *   phases - ambient spawn schedule (interval/count/roster change over time)
 *   events - scripted swarm moments      bosses - timed arrivals
 *   ground / props / palette - how the renderer dresses the field
 *   music  - key into the procedural score in src/audio/audio.js */
'use strict';
(function (WS) {

  WS.Maps = {
    thornhollow: {
      name: 'Thornhollow',
      subtitle: 'The quiet woods beyond the last inn',
      description: 'Gentle hills, hungry lamplings, and a mongrel problem the town watch keeps ignoring.',
      art: 'forest',
      ground: [0.09, 0.16, 0.09], groundAlt: [0.12, 0.21, 0.11],
      fog: [0.05, 0.10, 0.07],
      music: 'forest',
      difficulty: 1.0, goldMult: 1.0,
      props: ['tree', 'stump', 'rock', 'flower'],
      phases: [
        { at: 0, interval: 1.10, count: 2, roster: [{ id: 'lampling', weight: 45 }, { id: 'boar', weight: 30 }, { id: 'wolf', weight: 25 }] },
        { at: 75, interval: 0.95, count: 2, roster: [{ id: 'lampling', weight: 25 }, { id: 'gilkin', weight: 35 }, { id: 'wolf', weight: 20 }, { id: 'boar', weight: 20 }] },
        { at: 180, interval: 0.85, count: 3, roster: [{ id: 'gilkin', weight: 30 }, { id: 'mongrel', weight: 30 }, { id: 'lampling', weight: 20 }, { id: 'gilkin_tidecaller', weight: 20 }], elite: 'snarlpack_bonesnapper', eliteChance: 0.05 },
        { at: 330, interval: 0.72, count: 3, roster: [{ id: 'mongrel', weight: 35 }, { id: 'kerchief', weight: 25 }, { id: 'gilkin_tidecaller', weight: 20 }, { id: 'wolf', weight: 20 }], elite: 'snarlpack_bonesnapper', eliteChance: 0.06 },
        { at: 540, interval: 0.62, count: 4, roster: [{ id: 'kerchief', weight: 35 }, { id: 'mongrel', weight: 30 }, { id: 'gilkin_tidecaller', weight: 20 }, { id: 'gilkin', weight: 15 }], elite: 'kerchief_enforcer', eliteChance: 0.06 },
        { at: 780, interval: 0.52, count: 5, roster: [{ id: 'kerchief', weight: 40 }, { id: 'mongrel', weight: 25 }, { id: 'wolf', weight: 15 }, { id: 'gilkin_tidecaller', weight: 20 }], elite: 'kerchief_enforcer', eliteChance: 0.08 },
        { at: 1020, interval: 0.45, count: 6, roster: [{ id: 'kerchief', weight: 40 }, { id: 'mongrel', weight: 30 }, { id: 'gilkin_tidecaller', weight: 30 }], elite: 'kerchief_enforcer', eliteChance: 0.10 },
      ],
      events: [
        { at: 240, text: 'The Snarlpack closes in!', id: 'mongrel', count: 18 },
        { at: 560, text: 'A tide of gilkin floods the banks!', id: 'gilkin', count: 26 },
        { at: 860, text: 'Wolves howl in the failing light!', id: 'wolf', count: 24 },
        { at: 1060, text: 'The Kerchiefs spring their ambush!', id: 'kerchief', count: 22 },
      ],
      bosses: [
        { at: 300, id: 'grimtunnel' }, { at: 630, id: 'murkgill' },
        { at: 960, id: 'gnarlfang' }, { at: 1320, id: 'redcowl' },
        { at: 1620, id: 'fenroth' },
      ],
    },

    dustreach: {
      name: 'The Dustreach',
      subtitle: 'A wind-scoured, lawless frontier',
      description: 'The harvest reapers never stopped working. The Kerchiefs never stopped taking.',
      art: 'plains',
      ground: [0.22, 0.17, 0.07], groundAlt: [0.27, 0.21, 0.09],
      fog: [0.16, 0.12, 0.05],
      music: 'plains',
      difficulty: 1.25, goldMult: 1.25,
      unlockHint: 'Survive for 10 minutes in Thornhollow.',
      props: ['wheat', 'gear', 'rock', 'fence'],
      phases: [
        { at: 0, interval: 1.00, count: 2, roster: [{ id: 'coyote', weight: 40 }, { id: 'fleshripper', weight: 30 }, { id: 'kerchief', weight: 30 }] },
        { at: 90, interval: 0.85, count: 3, roster: [{ id: 'coyote', weight: 25 }, { id: 'kerchief', weight: 30 }, { id: 'kerchief_pillager', weight: 25 }, { id: 'fleshripper', weight: 20 }] },
        { at: 210, interval: 0.75, count: 3, roster: [{ id: 'harvest_reaper', weight: 25 }, { id: 'kerchief_pillager', weight: 25 }, { id: 'bruiser', weight: 25 }, { id: 'coyote', weight: 25 }], elite: 'kerchief_enforcer', eliteChance: 0.05 },
        { at: 390, interval: 0.65, count: 4, roster: [{ id: 'bruiser', weight: 30 }, { id: 'harvest_reaper', weight: 25 }, { id: 'kerchief_pillager', weight: 25 }, { id: 'fleshripper', weight: 20 }], elite: 'kerchief_enforcer', eliteChance: 0.07 },
        { at: 600, interval: 0.55, count: 5, roster: [{ id: 'bruiser', weight: 35 }, { id: 'kerchief_pillager', weight: 30 }, { id: 'harvest_reaper', weight: 35 }], elite: 'kerchief_enforcer', eliteChance: 0.08 },
        { at: 840, interval: 0.48, count: 6, roster: [{ id: 'bruiser', weight: 40 }, { id: 'kerchief_pillager', weight: 30 }, { id: 'harvest_reaper', weight: 30 }], elite: 'kerchief_enforcer', eliteChance: 0.10 },
        { at: 1050, interval: 0.42, count: 7, roster: [{ id: 'bruiser', weight: 40 }, { id: 'kerchief_pillager', weight: 35 }, { id: 'harvest_reaper', weight: 25 }], elite: 'kerchief_enforcer', eliteChance: 0.12 },
      ],
      events: [
        { at: 260, text: 'Vultures wheel and descend!', id: 'fleshripper', count: 20 },
        { at: 580, text: 'The fields walk! Harvest reapers advance!', id: 'harvest_reaper', count: 14 },
        { at: 880, text: 'A Kerchiefs war party surrounds you!', id: 'bruiser', count: 20 },
      ],
      bosses: [
        { at: 300, id: 'murkgill' }, { at: 630, id: 'harvestking' },
        { at: 960, id: 'gnarlfang' }, { at: 1320, id: 'redcowl' },
        { at: 1620, id: 'masked_admiral' },
      ],
    },

    mourneholt: {
      name: 'Mourneholt',
      subtitle: 'Where the sun is only a rumor',
      description: 'The dead of Gallowmere do not rest, and something worse pads between the blackened trees.',
      art: 'haunted',
      ground: [0.06, 0.07, 0.11], groundAlt: [0.09, 0.10, 0.15],
      fog: [0.04, 0.05, 0.09],
      music: 'cursed',
      difficulty: 1.5, goldMult: 1.5,
      unlockHint: 'Survive for 10 minutes in the Dustreach.',
      props: ['deadtree', 'grave', 'bone', 'mushroom'],
      phases: [
        { at: 0, interval: 0.95, count: 2, roster: [{ id: 'skeleton', weight: 40 }, { id: 'spider', weight: 35 }, { id: 'ghoul', weight: 25 }] },
        { at: 90, interval: 0.82, count: 3, roster: [{ id: 'skeleton', weight: 30 }, { id: 'ghoul', weight: 30 }, { id: 'spider', weight: 20 }, { id: 'skeletal_mage', weight: 20 }] },
        { at: 240, interval: 0.70, count: 3, roster: [{ id: 'ghoul', weight: 30 }, { id: 'moonwretch', weight: 25 }, { id: 'skeletal_mage', weight: 25 }, { id: 'skeleton', weight: 20 }], elite: 'bone_sentinel', eliteChance: 0.05 },
        { at: 420, interval: 0.60, count: 4, roster: [{ id: 'moonwretch', weight: 30 }, { id: 'ghoul', weight: 30 }, { id: 'skeletal_mage', weight: 25 }, { id: 'spider', weight: 15 }], elite: 'bone_sentinel', eliteChance: 0.07 },
        { at: 630, interval: 0.52, count: 5, roster: [{ id: 'moonwretch', weight: 35 }, { id: 'ghoul', weight: 30 }, { id: 'skeletal_mage', weight: 35 }], elite: 'bone_sentinel', eliteChance: 0.08 },
        { at: 870, interval: 0.45, count: 6, roster: [{ id: 'moonwretch', weight: 40 }, { id: 'ghoul', weight: 30 }, { id: 'skeletal_mage', weight: 30 }], elite: 'bone_sentinel', eliteChance: 0.10 },
        { at: 1080, interval: 0.40, count: 7, roster: [{ id: 'moonwretch', weight: 40 }, { id: 'skeletal_mage', weight: 35 }, { id: 'ghoul', weight: 25 }], elite: 'bone_sentinel', eliteChance: 0.12 },
      ],
      events: [
        { at: 300, text: 'The graves of Gallowmere empty!', id: 'skeleton', count: 22 },
        { at: 620, text: 'Eyes gleam between the trees. The pack hunts!', id: 'moonwretch', count: 16 },
        { at: 920, text: 'The canopy rains spiders!', id: 'spider', count: 26 },
      ],
      bosses: [
        { at: 300, id: 'barkfang' }, { at: 630, id: 'silkfang' },
        { at: 960, id: 'mordecai' }, { at: 1320, id: 'harvestking' },
        { at: 1620, id: 'palewraith' },
      ],
    },

    ochre: {
      name: 'The Ochre Plains',
      subtitle: 'Red earth, white sun, no mercy',
      description: 'Everything on this savannah is hungry, armed, or both. The waystation sends its regards.',
      art: 'savannah',
      ground: [0.24, 0.13, 0.06], groundAlt: [0.30, 0.17, 0.08],
      fog: [0.18, 0.09, 0.04],
      music: 'savannah',
      difficulty: 1.8, goldMult: 1.8,
      unlockHint: 'Survive for 10 minutes in Mourneholt.',
      props: ['cactus', 'skull', 'rock', 'grass'],
      phases: [
        { at: 0, interval: 0.90, count: 3, roster: [{ id: 'longstrider', weight: 35 }, { id: 'lion', weight: 30 }, { id: 'raptor', weight: 35 }] },
        { at: 90, interval: 0.78, count: 3, roster: [{ id: 'raptor', weight: 30 }, { id: 'bristlekin', weight: 30 }, { id: 'lion', weight: 20 }, { id: 'shrikewing', weight: 20 }] },
        { at: 240, interval: 0.66, count: 4, roster: [{ id: 'bristlekin', weight: 30 }, { id: 'karrash', weight: 25 }, { id: 'shrikewing', weight: 25 }, { id: 'raptor', weight: 20 }], elite: 'karrash_battlelord', eliteChance: 0.05 },
        { at: 420, interval: 0.58, count: 5, roster: [{ id: 'karrash', weight: 30 }, { id: 'bristlekin', weight: 30 }, { id: 'shrikewing', weight: 25 }, { id: 'lion', weight: 15 }], elite: 'karrash_battlelord', eliteChance: 0.07 },
        { at: 630, interval: 0.50, count: 5, roster: [{ id: 'karrash', weight: 35 }, { id: 'bristlekin', weight: 30 }, { id: 'shrikewing', weight: 35 }], elite: 'karrash_battlelord', eliteChance: 0.08 },
        { at: 870, interval: 0.44, count: 6, roster: [{ id: 'karrash', weight: 40 }, { id: 'shrikewing', weight: 30 }, { id: 'bristlekin', weight: 30 }], elite: 'karrash_battlelord', eliteChance: 0.10 },
        { at: 1080, interval: 0.38, count: 7, roster: [{ id: 'karrash', weight: 40 }, { id: 'shrikewing', weight: 35 }, { id: 'raptor', weight: 25 }], elite: 'karrash_battlelord', eliteChance: 0.12 },
      ],
      events: [
        { at: 300, text: 'A raptor pack bursts from the tall grass!', id: 'raptor', count: 20 },
        { at: 620, text: 'The Shrikewing descend shrieking!', id: 'shrikewing', count: 18 },
        { at: 920, text: 'Karrash outriders circle for the kill!', id: 'karrash', count: 18 },
      ],
      bosses: [
        { at: 300, id: 'thornmane' }, { at: 630, id: 'shriekfeather' },
        { at: 960, id: 'kazrok' }, { at: 1320, id: 'silkfang' },
        { at: 1620, id: 'stormhide' },
      ],
    },

    palewastes: {
      name: 'The Pale Wastes',
      subtitle: 'Under a sky that never thaws',
      description: 'The Pale does not sleep, does not tire, and does not care how many you have already slain.',
      art: 'glacier',
      ground: [0.10, 0.14, 0.20], groundAlt: [0.14, 0.19, 0.27],
      fog: [0.07, 0.11, 0.17],
      music: 'glacier',
      difficulty: 2.2, goldMult: 2.2,
      unlockHint: 'Survive for 10 minutes in the Ochre Plains.',
      props: ['spire', 'bone', 'crystal', 'ice'],
      phases: [
        { at: 0, interval: 0.85, count: 3, roster: [{ id: 'pale_ghoul', weight: 45 }, { id: 'geist', weight: 30 }, { id: 'skeleton', weight: 25 }] },
        { at: 90, interval: 0.72, count: 4, roster: [{ id: 'pale_ghoul', weight: 30 }, { id: 'geist', weight: 25 }, { id: 'crypt_fiend', weight: 25 }, { id: 'necromancer', weight: 20 }] },
        { at: 240, interval: 0.62, count: 4, roster: [{ id: 'crypt_fiend', weight: 30 }, { id: 'necromancer', weight: 25 }, { id: 'pale_ghoul', weight: 25 }, { id: 'abomination', weight: 20 }], elite: 'deathbound_vanguard', eliteChance: 0.06 },
        { at: 420, interval: 0.54, count: 5, roster: [{ id: 'crypt_fiend', weight: 30 }, { id: 'abomination', weight: 25 }, { id: 'necromancer', weight: 25 }, { id: 'geist', weight: 20 }], elite: 'deathbound_vanguard', eliteChance: 0.08 },
        { at: 630, interval: 0.46, count: 6, roster: [{ id: 'crypt_fiend', weight: 30 }, { id: 'necromancer', weight: 30 }, { id: 'abomination', weight: 25 }, { id: 'geist', weight: 15 }], elite: 'deathbound_vanguard', eliteChance: 0.09 },
        { at: 870, interval: 0.40, count: 7, roster: [{ id: 'crypt_fiend', weight: 35 }, { id: 'necromancer', weight: 35 }, { id: 'abomination', weight: 30 }], elite: 'deathbound_vanguard', eliteChance: 0.11 },
        { at: 1080, interval: 0.35, count: 8, roster: [{ id: 'crypt_fiend', weight: 35 }, { id: 'necromancer', weight: 35 }, { id: 'abomination', weight: 30 }], elite: 'deathbound_vanguard', eliteChance: 0.13 },
      ],
      events: [
        { at: 300, text: 'The frozen earth splits - ghouls claw free!', id: 'pale_ghoul', count: 24 },
        { at: 620, text: 'Geists swarm from the spires!', id: 'geist', count: 22 },
        { at: 920, text: 'The cult chants as one. Necromancers converge!', id: 'necromancer', count: 16 },
      ],
      bosses: [
        { at: 300, id: 'boneweaver' }, { at: 630, id: 'gorestitch' },
        { at: 960, id: 'mordecai' }, { at: 1320, id: 'boneweaver' },
        { at: 1620, id: 'marrowfrost' },
      ],
    },

    // No horde, no timer: a bounded duel with a scripted boss. You arrive with
    // a ready-made kit so the fight tests the mechanics, not the build-up.
    boss_arena: {
      name: 'Eclipse Arena',
      subtitle: 'A duel with Aethelgard',
      description: 'No horde, no timer. A bounded arena and one scripted boss: Aethelgard, the Eclipse Sovereign. You arrive with a ready-made kit - survive the telegraphs and break the eclipse.',
      art: 'arena',
      ground: [0.06, 0.05, 0.11], groundAlt: [0.10, 0.08, 0.16],
      fog: [0.04, 0.03, 0.08],
      music: 'eclipse',
      difficulty: 1.0, goldMult: 1.0,
      arena: true,
      unlockHint: 'Defeat any final boss to open the arena gate.',
      props: [],
      phases: [{ at: 0, interval: 99, count: 0, roster: [{ id: 'lampling', weight: 1 }] }],
      events: [],
      bosses: [],
    },
  };

  WS.MapOrder = ['thornhollow', 'dustreach', 'mourneholt', 'ochre', 'palewastes', 'boss_arena'];

})(window.WS);
