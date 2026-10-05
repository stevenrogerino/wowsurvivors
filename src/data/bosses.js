/* Bosses. Each announces itself, then cycles attack patterns:
 *   summon (count adds of id) | volley (fan of bolts) | ring (full circle)
 *   | charge (a roaring burst of speed toward the survivor)
 * `interval` is seconds between pattern uses. Stats are pre-scaling. */
'use strict';
(function (WS) {

  WS.Bosses = {
    /* ------------------------------------------------------ Thornhollow ---- */
    grimtunnel: {
      // His own art (src/render/villains.js): the hard hat is his crown.
      name: 'Foreman Grimtunnel', family: 'lampling', art: 'grimtunnel', tint: [1.00, 0.86, 0.50],
      health: 2052, speed: 55, damage: 32, xp: 160, radius: 40, gold: 35, interval: 4.0,
      patterns: [
        { type: 'summon', id: 'lampling', count: 7 },
        // His pick, swung where you are going.
        { type: 'slam', share: 0.28, radius: 92, tint: [1.0, 0.72, 0.30] },
        { type: 'charge' },
        // Lantern oil, lobbed in threes.
        { type: 'barrage', count: 3, share: 0.18, radius: 66, tint: [1.0, 0.62, 0.22] },
        { type: 'nova', phase: 2, signature: true, gaps: 2, gap: 54, share: 0.26, tint: [1.0, 0.80, 0.40] },
      ],
      enrage: 'MINE! Every last lamp of it!',
      yell: 'Mine! My light! MINE!',
    },
    murkgill: {
      bossKit: ['crown', 'spines'],
      name: 'Murk-Gill the Ancient', family: 'gilkin', art: 'gilkin', tint: [0.30, 0.95, 0.85],
      health: 3132, speed: 58, damage: 37, xp: 220, radius: 44, gold: 40,
      interval: 3.6, school: 'frost',
      patterns: [
        { type: 'volley', bolts: 5 },
        // A tide of frost out of him, with holes in it. Wider than most:
        // he comes at 5:00 and at 11:00 in the thickest crowd of the night,
        // and at 50 degrees the strong bot still took 14% a fight from it.
        { type: 'nova', gaps: 2, gap: 56, share: 0.26, tint: [0.45, 0.95, 1.0] },
        { type: 'summon', id: 'gilkin', count: 8 },
        { type: 'barrage', count: 4, share: 0.18, radius: 64, style: 'ice', lob: false, tint: [0.55, 0.92, 1.0] },
        { type: 'nova', phase: 2, signature: true, waves: 2, gaps: 2, gap: 54, share: 0.24, tint: [0.45, 0.95, 1.0] },
      ],
      enrage: 'BLORRRP! The deep remembers!',
      yell: 'Blorp! Blorp-blorp-BLORRRP!',
    },
    gnarlfang: {
      bossKit: ['mane', 'trophies'],
      name: 'Gnarlfang the Ravager', family: 'mongrel', art: 'mongrel', tint: [0.95, 0.55, 0.20],
      health: 4536, speed: 60, damage: 43, xp: 300, radius: 48, gold: 50, interval: 3.4,
      patterns: [
        { type: 'summon', id: 'mongrel', count: 6 },
        // Runs you down twice, and twice more once he is bleeding.
        { type: 'charge', chain: 1, chainEnraged: 1, share: 0.3 },
        { type: 'slam', share: 0.32, radius: 100, tint: [0.95, 0.55, 0.20] },
        { type: 'cross', phase: 2, signature: true, lanes: 4, share: 0.28, tint: [0.95, 0.45, 0.15] },
      ],
      enrage: 'The Snarlpack does not retreat!',
      yell: 'This forest belongs to the Snarlpack!',
    },
    redcowl: {
      bossKit: ['plumehat', 'pauldrons'],
      name: 'Captain Redcowl', family: 'kerchief', art: 'bandit', tint: [0.95, 0.25, 0.20],
      health: 6048, speed: 70, damage: 48, xp: 360, radius: 46, gold: 55,
      interval: 3.2, school: 'physical',
      patterns: [
        { type: 'volley', bolts: 7 },
        // Powder kegs, rolled where you will be.
        { type: 'barrage', count: 4, share: 0.2, radius: 72, tint: [1.0, 0.50, 0.25] },
        { type: 'charge', share: 0.3 },
        // Musket lines from the Kerchiefs behind him.
        { type: 'cross', lanes: 3, share: 0.28, width: 54, tint: [1.0, 0.40, 0.30], sound: 'cannon' },
        { type: 'barrage', phase: 2, signature: true, count: 6, share: 0.2, radius: 72, tint: [1.0, 0.50, 0.25] },
      ],
      enrage: 'Kerchiefs! Volley fire!',
      yell: 'The Kerchiefs send their regards!',
    },
    fenroth: {
      bossKit: ['horns', 'mane'],
      name: 'Fenroth, Terror of the Vale', family: 'beast', art: 'moonwretch', tint: [0.85, 0.20, 0.20],
      health: 9720, speed: 66, damage: 56, xp: 700, radius: 54, gold: 100,
      interval: 3.0, school: 'shadow',
      patterns: [
        { type: 'summon', id: 'wolf', count: 8 },
        { type: 'charge', chain: 1, chainEnraged: 1, share: 0.32 },
        // The howl: a wave of dread with two ways through it.
        { type: 'nova', gaps: 2, gap: 46, share: 0.3, tint: [0.85, 0.25, 0.30] },
        { type: 'ring', bolts: 10 },
        { type: 'slam', share: 0.36, radius: 104, tint: [0.85, 0.20, 0.20] },
        { type: 'nova', phase: 2, signature: true, waves: 2, gaps: 2, gap: 44, share: 0.28, tint: [0.85, 0.25, 0.30] },
      ],
      enrage: 'The moon is mine! RUN!',
      yell: 'The vale runs red tonight!',
    },
    /* ------------------------------------------------------ Dustreach ---- */
    harvestking: {
      bossKit: ['crown', 'brand'],
      name: 'The Harvest King', family: 'mechanical', art: 'golem', tint: [1.00, 0.80, 0.30],
      health: 5184, speed: 48, damage: 45, xp: 320, radius: 50, gold: 50,
      interval: 3.8, school: 'fire',
      patterns: [
        { type: 'ring', bolts: 9 },
        // The scythe, swung in a cross through the field.
        { type: 'cross', lanes: 4, share: 0.3, width: 60, tint: [1.0, 0.70, 0.25] },
        { type: 'charge', share: 0.3 },
        { type: 'barrage', count: 4, share: 0.2, radius: 70, burn: true, tint: [1.0, 0.55, 0.20] },
        { type: 'cross', phase: 2, signature: true, lanes: 4, offset: true, share: 0.3, width: 60, tint: [1.0, 0.70, 0.25] },
      ],
      enrage: 'THE. HARVEST. IS. NOW.',
      yell: 'CROPS. REQUIRE. BLOOD.',
    },
    masked_admiral: {
      // His own art (src/render/villains.js), coat, plume and all.
      name: 'The Masked Admiral', family: 'kerchief', art: 'admiral', tint: [0.90, 0.20, 0.25],
      health: 11880, speed: 72, damage: 59, xp: 800, radius: 52, gold: 110,
      interval: 2.9, school: 'physical',
      patterns: [
        { type: 'volley', bolts: 9 },
        // A broadside: three lanes, one aimed at you.
        { type: 'cross', lanes: 3, share: 0.3, width: 56, tint: [1.0, 0.55, 0.30], sound: 'cannon' },
        { type: 'summon', id: 'kerchief', count: 8 },
        { type: 'charge', chain: 1, share: 0.32 },
        { type: 'barrage', count: 5, share: 0.2, radius: 76, tint: [1.0, 0.50, 0.25] },
        { type: 'nova', phase: 2, signature: true, waves: 2, gaps: 2, gap: 44, share: 0.28, tint: [1.0, 0.45, 0.35] },
      ],
      enrage: 'All hands! Sink this lapdog!',
      yell: "You'll never take me alive, lapdog!",
    },
    /* ------------------------------------------------------ Mourneholt ---- */
    barkfang: {
      bossKit: ['horns', 'spines'],
      name: 'Old Barkfang', family: 'moonwretch', art: 'moonwretch', tint: [0.70, 0.62, 0.80],
      health: 5616, speed: 74, damage: 45, xp: 330, radius: 46, gold: 50, interval: 3.4,
      patterns: [
        { type: 'charge', chain: 1, share: 0.3 },
        { type: 'summon', id: 'moonwretch', count: 5 },
        { type: 'slam', share: 0.3, radius: 96, tint: [0.70, 0.62, 0.80] },
        { type: 'nova', phase: 2, signature: true, gaps: 2, gap: 50, share: 0.26, tint: [0.75, 0.65, 0.95] },
      ],
      enrage: 'The hunt ends with you!',
      yell: 'The hunt is joined!',
    },
    silkfang: {
      bossKit: ['crown', 'spines'],
      name: 'Matriarch Silkfang', family: 'beast', art: 'spider', tint: [0.70, 0.40, 0.90],
      health: 6912, speed: 60, damage: 50, xp: 380, radius: 48, gold: 55,
      interval: 3.5, school: 'nature',
      patterns: [
        { type: 'summon', id: 'spider', count: 9 },
        // Egg sacs, burst where you stand.
        { type: 'barrage', count: 4, share: 0.2, radius: 66, tint: [0.70, 0.40, 0.90] },
        { type: 'ring', bolts: 8 },
        { type: 'nova', gaps: 2, gap: 48, share: 0.26, tint: [0.75, 0.45, 0.95] },
        { type: 'barrage', phase: 2, signature: true, count: 6, share: 0.2, radius: 66, tint: [0.70, 0.40, 0.90] },
      ],
      enrage: '*the brood stirs in every dark corner*',
      yell: '*a chittering shriek echoes from the dark*',
    },
    mordecai: {
      // His own art (src/render/villains.js): collar, lantern and his dead.
      name: 'Mordecai the Unburied', family: 'undead', art: 'mordecai', tint: [0.75, 0.90, 0.80],
      health: 8424, speed: 56, damage: 52, xp: 420, radius: 50, gold: 60,
      interval: 3.3, school: 'shadow',
      patterns: [
        { type: 'summon', id: 'skeleton', count: 7 },
        // The dead reach up where you are going.
        { type: 'barrage', count: 3, share: 0.22, radius: 60, style: 'hands', lob: false, tint: [0.55, 1.0, 0.70] },
        { type: 'volley', bolts: 7 },
        // The knell.
        { type: 'nova', gaps: 3, gap: 36, share: 0.28, tint: [0.60, 1.0, 0.80] },
        { type: 'nova', phase: 2, signature: true, waves: 2, gaps: 3, gap: 34, share: 0.26, tint: [0.60, 1.0, 0.80] },
      ],
      enrage: 'The door opens both ways.',
      yell: 'Death is a door. I walked back through it.',
    },
    palewraith: {
      bossKit: ['crown', 'brand'],
      name: 'The Pale Wraith', family: 'undead', art: 'wraith', tint: [0.80, 0.85, 1.00],
      health: 14580, speed: 62, damage: 63, xp: 900, radius: 52, gold: 120,
      interval: 2.8, school: 'shadow',
      patterns: [
        { type: 'volley', bolts: 9 },
        { type: 'nova', gaps: 2, gap: 44, share: 0.3, tint: [0.80, 0.85, 1.0] },
        { type: 'summon', id: 'ghoul', count: 8 },
        { type: 'cross', lanes: 4, share: 0.3, width: 54, tint: [0.75, 0.80, 1.0] },
        { type: 'ring', bolts: 12 },
        { type: 'barrage', count: 5, share: 0.2, radius: 70, style: 'hands', lob: false, tint: [0.80, 0.85, 1.0] },
        { type: 'cross', phase: 2, signature: true, lanes: 4, offset: true, share: 0.3, width: 54, tint: [0.75, 0.80, 1.0] },
      ],
      enrage: 'Every candle. Out.',
      yell: 'The candles gutter. The dark remains.',
    },
    /* --------------------------------------------------- Ochre Plains ---- */
    thornmane: {
      bossKit: ['banner', 'mane'],
      name: 'Warlord Bristlegore', family: 'bristlekin', art: 'bristlekin', tint: [0.95, 0.45, 0.25],
      health: 7344, speed: 62, damage: 52, xp: 400, radius: 48, gold: 55, interval: 3.4,
      patterns: [
        { type: 'summon', id: 'bristlekin', count: 6 },
        { type: 'charge', chain: 1, chainEnraged: 1, share: 0.3 },
        { type: 'slam', share: 0.32, radius: 98, tint: [0.95, 0.45, 0.25] },
        { type: 'cross', phase: 2, signature: true, lanes: 4, share: 0.28, tint: [0.95, 0.45, 0.25] },
      ],
      enrage: 'Thornhide! TRAMPLE THEM!',
      yell: 'Thornhide! Take back the land!',
    },
    shriekfeather: {
      bossKit: ['crown', 'plumehat'],
      name: 'Windmatron Shriekfeather', family: 'shrikewing', art: 'shrikewing', tint: [0.60, 0.85, 1.00],
      health: 8208, speed: 68, damage: 54, xp: 440, radius: 46, gold: 60,
      interval: 3.2, school: 'nature',
      patterns: [
        { type: 'volley', bolts: 8 },
        // Gusts down the field, one at you.
        { type: 'cross', lanes: 3, share: 0.26, width: 62, tint: [0.60, 0.85, 1.0] },
        { type: 'summon', id: 'shrikewing', count: 6 },
        { type: 'barrage', count: 4, share: 0.2, radius: 68, tint: [0.60, 0.85, 1.0] },
        { type: 'nova', phase: 2, signature: true, gaps: 2, gap: 48, share: 0.26, tint: [0.60, 0.85, 1.0] },
      ],
      enrage: 'The sky screams with me!',
      yell: 'The wind will strip your bones!',
    },
    kazrok: {
      bossKit: ['banner', 'pauldrons'],
      name: 'Warlord Kazrok of the Karrash', family: 'karrash', art: 'karrash', tint: [1.00, 0.55, 0.15],
      health: 9936, speed: 76, damage: 58, xp: 500, radius: 52, gold: 70, interval: 3.0,
      patterns: [
        { type: 'charge', chain: 1, chainEnraged: 1, share: 0.32 },
        { type: 'volley', bolts: 7 },
        { type: 'slam', share: 0.34, radius: 102, tint: [1.0, 0.55, 0.15] },
        { type: 'summon', id: 'karrash', count: 5 },
        { type: 'cross', phase: 2, signature: true, lanes: 4, offset: true, share: 0.3, tint: [1.0, 0.55, 0.15] },
      ],
      enrage: 'KARRASH! BLOOD FOR THE PLAINS!',
      yell: 'The Karrash own these plains! Die, two-legs!',
    },
    stormhide: {
      bossKit: ['pauldrons', 'brand'],
      name: 'Stormhide the Colossus', family: 'beast', art: 'strider', tint: [0.40, 0.70, 1.00],
      health: 17280, speed: 52, damage: 67, xp: 1000, radius: 58, gold: 130,
      interval: 3.0, school: 'nature',
      patterns: [
        { type: 'ring', bolts: 12 },
        { type: 'nova', gaps: 2, gap: 46, share: 0.3, tint: [0.40, 0.70, 1.0] },
        { type: 'charge', share: 0.34 },
        { type: 'barrage', count: 5, share: 0.22, radius: 74, tint: [0.55, 0.78, 1.0] },
        { type: 'volley', bolts: 9 },
        { type: 'cross', lanes: 4, share: 0.3, width: 60, tint: [0.40, 0.70, 1.0] },
        { type: 'nova', phase: 2, signature: true, waves: 2, gaps: 2, gap: 44, share: 0.28, tint: [0.40, 0.70, 1.0] },
      ],
      enrage: '*the sky splits open*',
      yell: '*thunder rolls across the savannah*',
    },
    /* ----------------------------------------------------- Pale Wastes ---- */
    boneweaver: {
      bossKit: ['spines', 'crown'],
      name: 'Ossuar the Boneweaver', family: 'undead', art: 'necromancer', tint: [0.80, 0.55, 1.00],
      health: 9504, speed: 58, damage: 56, xp: 480, radius: 50, gold: 65,
      interval: 3.2, school: 'shadow',
      patterns: [
        { type: 'summon', id: 'pale_ghoul', count: 8 },
        { type: 'barrage', count: 4, share: 0.22, radius: 62, style: 'hands', lob: false, tint: [0.80, 0.55, 1.0] },
        { type: 'volley', bolts: 8 },
        { type: 'nova', gaps: 3, gap: 38, share: 0.26, tint: [0.80, 0.55, 1.0] },
        { type: 'nova', phase: 2, signature: true, waves: 2, gaps: 3, gap: 36, share: 0.24, tint: [0.80, 0.55, 1.0] },
      ],
      enrage: 'Rise, and rise again!',
      yell: 'Your bones will serve the Pale!',
    },
    gorestitch: {
      bossKit: ['trophies', 'spines'],
      name: 'Gorestitch the Amalgam', family: 'undead', art: 'abomination', tint: [0.75, 0.95, 0.55],
      health: 12960, speed: 44, damage: 65, xp: 560, radius: 58, gold: 75,
      interval: 3.6, school: 'shadow',
      patterns: [
        { type: 'ring', bolts: 10 },
        { type: 'slam', share: 0.36, radius: 110, tint: [0.75, 0.95, 0.55] },
        { type: 'charge', share: 0.34 },
        // Bile, spat in a spread.
        { type: 'barrage', count: 4, share: 0.2, radius: 72, burn: true, tint: [0.65, 0.95, 0.40] },
        { type: 'slam', phase: 2, signature: true, count: 3, scatter: 170, stagger: 0.4, share: 0.32, radius: 100, tint: [0.75, 0.95, 0.55] },
      ],
      enrage: 'MORE! MORE PIECES!',
      yell: 'Fresh meat for the pile!',
    },
    /* The id is historical - saves and statistics key on it. The Pale Lord
       himself is the finale (data/finales.js); killing him at 27:00 and then
       watching him rise at 30:00 told the story backwards. This is his
       herald: the cold, sent on ahead to take your measure. */
    marrowfrost: {
      bossKit: ['pauldrons', 'trophies'],
      name: 'The Rime Herald', family: 'undead', art: 'lich', tint: [0.55, 0.85, 1.00],
      health: 23760, speed: 56, damage: 76, xp: 1400, radius: 60, gold: 200,
      interval: 2.7, school: 'frost',
      patterns: [
        { type: 'volley', bolts: 9 },
        { type: 'nova', gaps: 2, gap: 44, share: 0.3, tint: [0.55, 0.85, 1.0] },
        { type: 'ring', bolts: 14 },
        { type: 'barrage', count: 5, share: 0.22, radius: 72, style: 'ice', lob: false, tint: [0.70, 0.90, 1.0] },
        { type: 'summon', id: 'crypt_fiend', count: 6 },
        { type: 'cross', lanes: 4, share: 0.32, width: 56, tint: [0.65, 0.90, 1.0] },
        { type: 'nova', phase: 2, signature: true, waves: 2, gaps: 2, gap: 42, share: 0.3, tint: [0.55, 0.85, 1.0] },
      ],
      enrage: 'My lord will have your light. ALL of it.',
      yell: 'My lord is counting your lights, little one. I have come to put some out.',
    },

    /* -------------------------------------------------------- Highmoor ---- */
    hornlord: {
      bossKit: ['crown', 'mane'],
      name: 'Grandhorn, Lord of the High Pasture', family: 'highland', art: 'ram', tint: [0.92, 0.86, 0.72],
      health: 11000, speed: 64, damage: 58, xp: 500, radius: 50, gold: 65,
      interval: 3.0, school: 'nature',
      patterns: [
        { type: 'summon', id: 'stormhorn_ram', count: 6 },
        { type: 'charge', chain: 1, share: 0.3 },
        { type: 'storm', strikes: 4 },
        { type: 'slam', share: 0.32, radius: 100, tint: [0.92, 0.86, 0.72] },
        { type: 'nova', phase: 2, signature: true, gaps: 2, gap: 48, share: 0.26, tint: [0.70, 0.80, 1.0] },
      ],
      enrage: 'The whole mountain comes down on you!',
      yell: 'This slope has been ours since before there were slopes!',
    },
    skreeva: {
      bossKit: ['crown', 'trophies'],
      name: 'Skreeva, Queen of the Galewing', family: 'galewing', art: 'galewing', tint: [0.72, 0.56, 0.96],
      health: 14200, speed: 72, damage: 62, xp: 620, radius: 48, gold: 80,
      interval: 2.9, school: 'nature',
      patterns: [
        { type: 'volley', bolts: 9 },
        { type: 'cross', lanes: 3, share: 0.28, width: 60, tint: [0.72, 0.56, 0.96] },
        { type: 'summon', id: 'galewing_harpy', count: 6 },
        { type: 'barrage', count: 5, share: 0.2, radius: 70, tint: [0.72, 0.56, 0.96] },
        { type: 'ring', bolts: 12 },
        { type: 'nova', phase: 2, signature: true, waves: 2, gaps: 2, gap: 46, share: 0.26, tint: [0.72, 0.56, 0.96] },
      ],
      enrage: 'Fall, little prey. FALL!',
      yell: 'Down there, you are only ever prey. Up here, you are only ever falling.',
    },
    mossback: {
      bossKit: ['spines', 'crown'],
      name: 'Old Mossback, the Stonehide Elder', family: 'highland', art: 'stonehide', tint: [0.50, 0.62, 0.46],
      health: 20500, speed: 46, damage: 72, xp: 1100, radius: 58, gold: 130,
      interval: 2.8, school: 'nature',
      patterns: [
        { type: 'charge', share: 0.34 },
        { type: 'storm', strikes: 6 },
        { type: 'slam', share: 0.36, radius: 112, tint: [0.50, 0.62, 0.46] },
        { type: 'summon', id: 'stormwisp', count: 8 },
        { type: 'nova', gaps: 2, gap: 46, share: 0.28, tint: [0.62, 0.78, 1.0] },
        { type: 'ring', bolts: 12 },
        { type: 'slam', phase: 2, signature: true, count: 3, scatter: 180, stagger: 0.4, share: 0.32, radius: 104, tint: [0.50, 0.62, 0.46] },
      ],
      enrage: 'Enough talking. The storm and I agree.',
      yell: 'You woke me for this? The storm and I were talking.',
    },

    // Not on any schedule: at 30:00 Death itself arrives, and again every
    // minute after. Technically killable, in the proud Survivors tradition.
    death_itself: {
      // His own art (src/render/villains.js): the hourglass is his mark.
      name: 'Death Itself', family: 'death', art: 'reaper', tint: [0.80, 0.90, 1.00],
      health: 5400000, speed: 265, damage: 648, xp: 5000, radius: 46, gold: 999,
      interval: 60, patterns: [{ type: 'charge' }],
      yell: 'Rest now. You have fought enough.',
    },

    // Eclipse Arena boss: driven by src/game/arena.js, not the pattern loop.
    aethelgard: {
      name: 'Aethelgard, the Eclipse Sovereign', family: 'celestial', art: 'sovereign',
      tint: [0.95, 0.90, 1.00],
      /* spriteScale, not radius: the corona is drawn inside its own tile now
         (it never was), so the sprite lost reach. This buys the presence back
         without moving the hitbox on the final fight in the game. */
      health: 520000, speed: 0, damage: 37, xp: 0, radius: 62, gold: 0,
      spriteScale: 1.35,
      interval: 99, arena: true, stationary: true, school: 'holy',
      patterns: [{ type: 'charge' }],
      yell: 'Witness the eclipse of all things.',
    },
  };

})(window.WS);
