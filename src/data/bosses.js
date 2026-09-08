/* Bosses. Each announces itself, then cycles attack patterns:
 *   summon (count adds of id) | volley (fan of bolts) | ring (full circle)
 *   | charge (a roaring burst of speed toward the survivor)
 * `interval` is seconds between pattern uses. Stats are pre-scaling. */
'use strict';
(function (WS) {

  WS.Bosses = {
    /* ------------------------------------------------------ Thornhollow ---- */
    grimtunnel: {
      name: 'Foreman Grimtunnel', family: 'lampling', art: 'lampling', tint: [1.00, 0.90, 0.55],
      health: 1900, speed: 55, damage: 30, xp: 160, radius: 40, gold: 35, interval: 4.0,
      patterns: [{ type: 'summon', id: 'lampling', count: 7 }, { type: 'charge' }],
      yell: 'Mine! My light! MINE!',
    },
    murkgill: {
      name: 'Murk-Gill the Ancient', family: 'gilkin', art: 'gilkin', tint: [0.30, 0.95, 0.85],
      health: 2900, speed: 58, damage: 34, xp: 220, radius: 44, gold: 40,
      interval: 3.6, school: 'frost',
      patterns: [{ type: 'volley', bolts: 5 }, { type: 'summon', id: 'gilkin', count: 8 }],
      yell: 'Blorp! Blorp-blorp-BLORRRP!',
    },
    gnarlfang: {
      name: 'Gnarlfang the Ravager', family: 'mongrel', art: 'mongrel', tint: [0.95, 0.55, 0.20],
      health: 4200, speed: 60, damage: 40, xp: 300, radius: 48, gold: 50, interval: 3.4,
      patterns: [{ type: 'summon', id: 'mongrel', count: 6 }, { type: 'charge' }],
      yell: 'This forest belongs to the Snarlpack!',
    },
    redcowl: {
      name: 'Captain Redcowl', family: 'kerchief', art: 'bandit', tint: [0.95, 0.25, 0.20],
      health: 5600, speed: 70, damage: 44, xp: 360, radius: 46, gold: 55,
      interval: 3.2, school: 'physical',
      patterns: [{ type: 'volley', bolts: 7 }, { type: 'charge' }],
      yell: 'The Kerchiefs send their regards!',
    },
    fenroth: {
      name: 'Fenroth, Terror of the Vale', family: 'beast', art: 'moonwretch', tint: [0.85, 0.20, 0.20],
      health: 9000, speed: 66, damage: 52, xp: 700, radius: 54, gold: 100,
      interval: 3.0, school: 'shadow',
      patterns: [{ type: 'summon', id: 'wolf', count: 8 }, { type: 'charge' }, { type: 'ring', bolts: 10 }],
      yell: 'The vale runs red tonight!',
    },
    /* ------------------------------------------------------ Dustreach ---- */
    harvestking: {
      name: 'The Harvest King', family: 'mechanical', art: 'golem', tint: [1.00, 0.80, 0.30],
      health: 4800, speed: 48, damage: 42, xp: 320, radius: 50, gold: 50,
      interval: 3.8, school: 'fire',
      patterns: [{ type: 'ring', bolts: 9 }, { type: 'charge' }],
      yell: 'CROPS. REQUIRE. BLOOD.',
    },
    masked_admiral: {
      name: 'The Masked Admiral', family: 'kerchief', art: 'bandit', tint: [0.90, 0.20, 0.25],
      health: 11000, speed: 72, damage: 55, xp: 800, radius: 52, gold: 110,
      interval: 2.9, school: 'physical',
      patterns: [{ type: 'volley', bolts: 9 }, { type: 'summon', id: 'kerchief', count: 8 }, { type: 'charge' }],
      yell: "You'll never take me alive, lapdog!",
    },
    /* ------------------------------------------------------ Mourneholt ---- */
    barkfang: {
      name: 'Old Barkfang', family: 'moonwretch', art: 'moonwretch', tint: [0.70, 0.62, 0.80],
      health: 5200, speed: 74, damage: 42, xp: 330, radius: 46, gold: 50, interval: 3.4,
      patterns: [{ type: 'charge' }, { type: 'summon', id: 'moonwretch', count: 5 }],
      yell: 'The hunt is joined!',
    },
    silkfang: {
      name: 'Matriarch Silkfang', family: 'beast', art: 'spider', tint: [0.70, 0.40, 0.90],
      health: 6400, speed: 60, damage: 46, xp: 380, radius: 48, gold: 55,
      interval: 3.5, school: 'nature',
      patterns: [{ type: 'summon', id: 'spider', count: 9 }, { type: 'ring', bolts: 8 }],
      yell: '*a chittering shriek echoes from the dark*',
    },
    mordecai: {
      name: 'Mordecai the Unburied', family: 'undead', art: 'necromancer', tint: [0.75, 0.90, 0.80],
      health: 7800, speed: 56, damage: 48, xp: 420, radius: 50, gold: 60,
      interval: 3.3, school: 'shadow',
      patterns: [{ type: 'summon', id: 'skeleton', count: 7 }, { type: 'volley', bolts: 7 }],
      yell: 'Death is a door. I walked back through it.',
    },
    palewraith: {
      name: 'The Pale Wraith', family: 'undead', art: 'wraith', tint: [0.80, 0.85, 1.00],
      health: 13500, speed: 62, damage: 58, xp: 900, radius: 52, gold: 120,
      interval: 2.8, school: 'shadow',
      patterns: [{ type: 'volley', bolts: 9 }, { type: 'summon', id: 'ghoul', count: 8 }, { type: 'ring', bolts: 12 }],
      yell: 'The candles gutter. The dark remains.',
    },
    /* --------------------------------------------------- Ochre Plains ---- */
    thornmane: {
      name: 'Warlord Bristlegore', family: 'bristlekin', art: 'bristlekin', tint: [0.95, 0.45, 0.25],
      health: 6800, speed: 62, damage: 48, xp: 400, radius: 48, gold: 55, interval: 3.4,
      patterns: [{ type: 'summon', id: 'bristlekin', count: 6 }, { type: 'charge' }],
      yell: 'Thornhide! Take back the land!',
    },
    shriekfeather: {
      name: 'Windmatron Shriekfeather', family: 'shrikewing', art: 'shrikewing', tint: [0.60, 0.85, 1.00],
      health: 7600, speed: 68, damage: 50, xp: 440, radius: 46, gold: 60,
      interval: 3.2, school: 'nature',
      patterns: [{ type: 'volley', bolts: 8 }, { type: 'summon', id: 'shrikewing', count: 6 }],
      yell: 'The wind will strip your bones!',
    },
    kazrok: {
      name: 'Warlord Kazrok of the Karrash', family: 'karrash', art: 'karrash', tint: [1.00, 0.55, 0.15],
      health: 9200, speed: 76, damage: 54, xp: 500, radius: 52, gold: 70, interval: 3.0,
      patterns: [{ type: 'charge' }, { type: 'volley', bolts: 7 }, { type: 'summon', id: 'karrash', count: 5 }],
      yell: 'The Karrash own these plains! Die, two-legs!',
    },
    stormhide: {
      name: 'Stormhide the Colossus', family: 'beast', art: 'strider', tint: [0.40, 0.70, 1.00],
      health: 16000, speed: 52, damage: 62, xp: 1000, radius: 58, gold: 130,
      interval: 3.0, school: 'nature',
      patterns: [{ type: 'ring', bolts: 12 }, { type: 'charge' }, { type: 'volley', bolts: 9 }],
      yell: '*thunder rolls across the savannah*',
    },
    /* ----------------------------------------------------- Pale Wastes ---- */
    boneweaver: {
      name: 'Ossuar the Boneweaver', family: 'undead', art: 'necromancer', tint: [0.80, 0.55, 1.00],
      health: 8800, speed: 58, damage: 52, xp: 480, radius: 50, gold: 65,
      interval: 3.2, school: 'shadow',
      patterns: [{ type: 'summon', id: 'pale_ghoul', count: 8 }, { type: 'volley', bolts: 8 }],
      yell: 'Your bones will serve the Pale!',
    },
    gorestitch: {
      name: 'Gorestitch the Amalgam', family: 'undead', art: 'abomination', tint: [0.75, 0.95, 0.55],
      health: 12000, speed: 44, damage: 60, xp: 560, radius: 58, gold: 75,
      interval: 3.6, school: 'shadow',
      patterns: [{ type: 'ring', bolts: 10 }, { type: 'charge' }],
      yell: 'Fresh meat for the pile!',
    },
    marrowfrost: {
      name: 'Marrowfrost, the Pale Lord', family: 'undead', art: 'lich', tint: [0.55, 0.85, 1.00],
      health: 22000, speed: 56, damage: 70, xp: 1400, radius: 60, gold: 200,
      interval: 2.7, school: 'frost',
      patterns: [
        { type: 'volley', bolts: 9 },
        { type: 'ring', bolts: 14 },
        { type: 'summon', id: 'crypt_fiend', count: 6 },
      ],
      yell: 'Your warmth offends me, little one.',
    },

    // Not on any schedule: at 30:00 Death itself arrives, and again every
    // minute after. Technically killable, in the proud Survivors tradition.
    death_itself: {
      name: 'Death Itself', family: 'death', art: 'reaper', tint: [0.80, 0.90, 1.00],
      health: 5000000, speed: 265, damage: 600, xp: 5000, radius: 46, gold: 999,
      interval: 60, patterns: [{ type: 'charge' }],
      yell: 'Rest now. You have fought enough.',
    },

    // Eclipse Arena boss: driven by src/game/arena.js, not the pattern loop.
    aethelgard: {
      name: 'Aethelgard, the Eclipse Sovereign', family: 'celestial', art: 'sovereign',
      tint: [0.95, 0.90, 1.00],
      health: 300000, speed: 0, damage: 34, xp: 0, radius: 62, gold: 0,
      interval: 99, arena: true, stationary: true, school: 'holy',
      patterns: [{ type: 'charge' }],
      yell: 'Witness the eclipse of all things.',
    },
  };

})(window.WS);
