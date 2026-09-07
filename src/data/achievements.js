/* Achievements. `test(db)` reads persisted statistics; `reward` grants gold or
 * unlocks a character/map the moment the test first passes. */
'use strict';
(function (WS) {

  WS.Achievements = {
    first_blood: {
      name: 'First Blood', art: 'blade',
      description: 'Slay your first enemy.',
      test: (db) => db.statistics.totalKills >= 1,
    },
    take_his_candle: {
      name: 'You Take Candle', art: 'candle',
      description: 'Defeat Foreman Grimtunnel.',
      reward: { type: 'gold', amount: 50 },
      test: (db) => !!db.statistics.bosses.grimtunnel,
    },
    gnollbane: {
      name: 'Bane of the Riverpaw', art: 'claw',
      description: 'Defeat Gnarlfang the Ravager.',
      reward: { type: 'gold', amount: 100 },
      test: (db) => !!db.statistics.bosses.gnarlfang,
    },
    unmasked: {
      name: 'Unmasked', art: 'mask',
      description: 'Defeat the Masked Admiral.',
      reward: { type: 'gold', amount: 250 },
      test: (db) => !!db.statistics.bosses.masked_admiral,
    },
    the_long_dark_ends: {
      name: 'The Long Dark Ends', art: 'frostaura',
      description: 'Defeat Lich-Lord Marrowfrost.',
      reward: { type: 'gold', amount: 1000 },
      test: (db) => !!db.statistics.bosses.marrowfrost,
    },

    /* ------------------------------------------------- map progression --- */
    beyond_the_forest: {
      name: 'Beyond the Forest', art: 'leaf',
      description: 'Survive for 10 minutes in Elwynn Forest.',
      reward: { type: 'map', id: 'westfall' },
      test: (db) => (db.statistics.bestTime.elwynn || 0) >= 600,
    },
    into_the_dark: {
      name: 'Into the Dark', art: 'deadtree',
      description: 'Survive for 10 minutes in Westfall.',
      reward: { type: 'map', id: 'duskwood' },
      test: (db) => (db.statistics.bestTime.westfall || 0) >= 600,
    },
    across_the_sea: {
      name: 'Across the Great Sea', art: 'sun',
      description: 'Survive for 10 minutes in Duskwood.',
      reward: { type: 'map', id: 'barrens' },
      test: (db) => (db.statistics.bestTime.duskwood || 0) >= 600,
    },
    the_frozen_north: {
      name: 'The Frozen North', art: 'crystal',
      description: 'Survive for 10 minutes in The Barrens.',
      reward: { type: 'map', id: 'icecrown' },
      test: (db) => (db.statistics.bestTime.barrens || 0) >= 600,
    },

    /* ------------------------------------------------ survivor unlocks --- */
    nightfall_survivor: {
      name: 'Nightfall Survivor', art: 'moon',
      description: 'Survive for 8 minutes in a single run.',
      reward: { type: 'character', id: 'rogue' },
      test: (db) => db.statistics.bestRunTime >= 480,
    },
    giant_slayer: {
      name: 'Giant Slayer', art: 'skull',
      description: 'Slay 2 bosses in a single run.',
      reward: { type: 'character', id: 'warrior' },
      test: (db) => db.statistics.bestBossesInRun >= 2,
    },
    seasoned_veteran: {
      name: 'Seasoned Veteran', art: 'book',
      description: 'Reach level 20 in a single run.',
      reward: { type: 'character', id: 'hunter' },
      test: (db) => db.statistics.bestLevel >= 20,
    },
    scourge_of_the_masses: {
      name: 'Scourge of the Masses', art: 'blade',
      description: 'Slay 750 enemies across all runs.',
      reward: { type: 'character', id: 'warlock' },
      test: (db) => db.statistics.totalKills >= 750,
    },
    fortune_seeker: {
      name: 'Fortune Seeker', art: 'coin',
      description: 'Bank 500 gold across all runs.',
      reward: { type: 'character', id: 'shaman' },
      test: (db) => db.statistics.totalGold >= 500,
    },

    /* ------------------------------------------------------- challenge --- */
    forbidden_knowledge: {
      name: 'Forbidden Knowledge', art: 'arcane',
      description: 'Evolve a weapon to its ultimate form.',
      reward: { type: 'gold', amount: 150 },
      test: (db) => db.statistics.evolutions >= 1,
    },
    lights_favor: {
      name: "Light's Favor", art: 'aegis',
      description: 'Survive for 3 minutes straight without taking damage.',
      reward: { type: 'gold', amount: 150 },
      test: (db) => db.statistics.bestNoHitStreak >= 180,
    },
    walking_armory: {
      name: 'Walking Armory', art: 'sword',
      description: 'Wield 6 weapons at once.',
      reward: { type: 'gold', amount: 150 },
      test: (db) => db.statistics.maxWeapons >= 6,
    },
    mrglglgl: {
      name: 'Mrglglglgl!', art: 'murloc',
      description: 'Slay 500 murlocs across all runs.',
      reward: { type: 'gold', amount: 200 },
      test: (db) => (db.statistics.families.murloc || 0) >= 500,
    },
    master_craftsman: {
      name: 'Master Craftsman', art: 'anvil',
      description: 'Forge a weapon union.',
      reward: { type: 'gold', amount: 250 },
      test: (db) => db.statistics.unions >= 1,
    },
    grave_robber: {
      name: 'Grave Robber', art: 'grave',
      description: 'Open a weathered coffin found on the battlefield.',
      reward: { type: 'gold', amount: 200 },
      test: (db) => (db.statistics.coffinsOpened || 0) > 0,
    },
    the_light_curdles: {
      name: 'The Light Curdles', art: 'desecrate',
      description: 'Claim a runeblade drawn out by your own desecration.',
      reward: { type: 'gold', amount: 400 },
      test: (db) => (db.statistics.runebladesClaimed || 0) > 0,
    },
    you_are_prepared: {
      name: 'You Are Prepared', art: 'soulrend',
      description: 'Claim the warglaives after giving yourself to the fel.',
      reward: { type: 'gold', amount: 400 },
      test: (db) => (db.statistics.warglaivesClaimed || 0) > 0,
    },
    survivor_of_the_long_dark: {
      name: 'Survivor of the Long Dark', art: 'sun',
      description: 'Achieve Victory on any battlefield.',
      reward: { type: 'gold', amount: 500 },
      test: (db) => db.statistics.totalVictories >= 1,
    },
    eclipse_broken: {
      name: 'Eclipse Broken', art: 'sovereign',
      description: 'Defeat Aethelgard in the Eclipse Arena.',
      reward: { type: 'gold', amount: 1500 },
      test: (db) => !!db.statistics.bosses.aethelgard,
    },
  };

  WS.AchievementOrder = [
    'first_blood', 'take_his_candle', 'gnollbane', 'unmasked', 'the_long_dark_ends',
    'beyond_the_forest', 'into_the_dark', 'across_the_sea', 'the_frozen_north',
    'nightfall_survivor', 'giant_slayer', 'seasoned_veteran', 'scourge_of_the_masses',
    'fortune_seeker', 'forbidden_knowledge', 'lights_favor', 'walking_armory',
    'mrglglgl', 'master_craftsman', 'grave_robber', 'the_light_curdles',
    'you_are_prepared', 'survivor_of_the_long_dark', 'eclipse_broken',
  ];

})(window.WS);
