/* Permanent training bought from the Trainer with banked gold. Cost of the
 * next rank = cost * (currentRank + 1), so deep ranks are a serious sink. */
'use strict';
(function (WS) {

  WS.MetaUpgrades = {
    meta_might: {
      name: 'Lessons: Strength', art: 'fist',
      description: '+2% weapon damage per rank', max: 10, cost: 200, v: 0.02,
      apply: (p, rank, m) => { p.damageMultiplier += m.v * rank; },
    },
    meta_toughness: {
      name: 'Lessons: Toughness', art: 'heart',
      description: '+10 maximum health per rank', max: 10, cost: 180, v: 10,
      apply: (p, rank, m) => { p.maxHealth += m.v * rank; p.health += m.v * rank; },
    },
    meta_swiftness: {
      name: 'Lessons: Swiftness', art: 'boot',
      description: '+2% movement speed per rank', max: 8, cost: 180, v: 0.02,
      apply: (p, rank, m) => { p.moveSpeed *= (1 + m.v * rank); },
    },
    meta_armor: {
      name: 'Lessons: Defense', art: 'shield',
      description: '+1 armor per rank', max: 5, cost: 250, v: 1,
      apply: (p, rank, m) => { p.armor += m.v * rank; },
    },
    meta_greed: {
      name: 'Lessons: Greed', art: 'coin',
      description: '+10% gold found per rank', max: 8, cost: 150, v: 0.10,
      apply: (p, rank, m) => { p.goldMultiplier += m.v * rank; },
    },
    meta_wisdom: {
      name: 'Lessons: Wisdom', art: 'book',
      description: '+4% experience per rank', max: 8, cost: 150, v: 0.04,
      apply: (p, rank, m) => { p.xpMultiplier += m.v * rank; },
    },
    meta_recovery: {
      name: 'Lessons: Recovery', art: 'leaf',
      description: '+0.2 health per second per rank', max: 6, cost: 250, v: 0.2,
      apply: (p, rank, m) => { p.healthRegen += m.v * rank; },
    },
    meta_luck: {
      name: 'Lessons: Fortune', art: 'clover',
      description: '+5% luck per rank', max: 6, cost: 220, v: 0.05,
      apply: (p, rank, m) => { p.luck += m.v * rank; },
    },
    meta_reroll: {
      name: 'Tactical Retreat', art: 'reroll',
      description: '+1 level-up reroll per rank', max: 3, cost: 500, v: 1,
      apply: (p, rank, m) => { p.rerolls += m.v * rank; },
    },
    meta_banish: {
      name: 'Forbidden Words', art: 'banish',
      description: '+1 level-up banish per rank', max: 3, cost: 750, v: 1,
      apply: (p, rank, m) => { p.banishes += m.v * rank; },
    },
    meta_headstart: {
      name: "Veteran's Instincts", art: 'hourglass',
      description: 'Begin each run with 1 free level-up per rank', max: 3, cost: 750, v: 1,
      apply: (p, rank, m) => { p.startLevelUps += m.v * rank; },
    },
    meta_revive: {
      name: 'Ashen Ankh', art: 'ankh',
      description: 'Once per run, cheat death and return at half health', max: 1, cost: 2500, v: 1,
      apply: (p, rank, m) => { p.revives += m.v * rank; },
    },
    // A deep permanent sink: tiny gains at ever-rising prices, capped at 100.
    meta_egg: {
      name: 'Curious Egg', art: 'egg',
      description: '+0.1% damage and +1 health per egg. Up to 100 eggs.',
      max: 100, cost: 100, eggDmg: 0.001, eggHp: 1,
      apply: (p, rank, m) => {
        p.damageMultiplier += m.eggDmg * rank;
        p.maxHealth += m.eggHp * rank;
        p.health += m.eggHp * rank;
      },
    },
  };

  WS.MetaUpgradeOrder = [
    'meta_might', 'meta_toughness', 'meta_swiftness', 'meta_armor', 'meta_greed',
    'meta_wisdom', 'meta_recovery', 'meta_luck', 'meta_reroll', 'meta_banish',
    'meta_headstart', 'meta_revive', 'meta_egg',
  ];

})(window.WS);
