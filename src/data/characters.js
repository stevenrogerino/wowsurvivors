/* Playable survivors. `apply(player, c)` mutates the freshly-built player. */
'use strict';
(function (WS) {

  WS.Characters = {
    mage: {
      name: 'Baron Zul', title: 'Apprentice of Northshire', className: 'Mage',
      art: 'mage', color: [0.41, 0.80, 0.94], weapon: 'arcane_missiles',
      description: 'A gifted novice whose missiles hunt his foes on their own.',
      perk: 'Weapon cooldowns reduced by {perkCooldownMult~%}%.',
      maxHealth: 110, moveSpeed: 225, armor: 0, pickupRadius: 60, healthRegen: 0,
      perkCooldownMult: 0.92,
      apply: (p, c) => { p.cooldownMultiplier *= c.perkCooldownMult; },
    },
    priest: {
      name: 'Chid', title: 'The Fool', className: 'Priest',
      art: 'priest', color: [1.00, 1.00, 1.00], weapon: 'holy_nova',
      description: 'A stalwart healer wreathed in rings of searing Light.',
      perk: 'Regenerates {perkRegen} health per second.',
      maxHealth: 135, moveSpeed: 205, armor: 1, pickupRadius: 64, healthRegen: 0,
      perkRegen: 1.0,
      apply: (p, c) => { p.healthRegen += c.perkRegen; },
    },
    rogue: {
      name: 'Dr. Rav McBreathless', title: 'Defias Defector', className: 'Rogue',
      art: 'rogue', color: [1.00, 0.96, 0.41], weapon: 'fan_of_knives',
      description: 'A quick-fingered cutpurse who fills the field with steel.',
      perk: '+{perkSpeedMult*%}% movement speed and +{perkCrit%}% critical strike chance.',
      maxHealth: 100, moveSpeed: 250, armor: 0, pickupRadius: 56, healthRegen: 0,
      perkSpeedMult: 1.10, perkCrit: 0.05,
      apply: (p, c) => { p.moveSpeed *= c.perkSpeedMult; p.critChance += c.perkCrit; },
      unlockHint: 'Survive for 8 minutes in a single run.',
    },
    hunter: {
      name: 'Maeca Barefoot', title: 'Ranger of the Westbrook Garrison', className: 'Hunter',
      art: 'hunter', color: [0.67, 0.83, 0.45], weapon: 'multishot',
      description: 'A keen-eyed ranger who never wastes an arrow.',
      perk: '+{perkPickup} pickup radius and +{perkSpeedMult*%}% movement speed.',
      maxHealth: 115, moveSpeed: 230, armor: 0, pickupRadius: 60, healthRegen: 0,
      perkPickup: 30, perkSpeedMult: 1.05,
      apply: (p, c) => { p.pickupRadius += c.perkPickup; p.moveSpeed *= c.perkSpeedMult; },
      unlockHint: 'Reach level 20 in a single run.',
    },
    warrior: {
      name: 'AAAAAAAAA', title: 'The Fallen Hero', className: 'Warrior',
      art: 'warrior', color: [0.78, 0.61, 0.43], weapon: 'whirlwind',
      description: 'An old soldier who solves most problems with spinning axes.',
      perk: '+{perkArmor} armor and +{perkHealth} maximum health.',
      maxHealth: 160, moveSpeed: 210, armor: 3, pickupRadius: 54, healthRegen: 0,
      perkArmor: 2, perkHealth: 25,
      apply: (p, c) => { p.armor += c.perkArmor; p.maxHealth += c.perkHealth; p.health += c.perkHealth; },
      unlockHint: 'Slay 2 bosses in a single run.',
    },
    warlock: {
      name: "Nim B'ladin", title: 'Exile of the Twilight Grove', className: 'Warlock',
      art: 'warlock', color: [0.58, 0.51, 0.79], weapon: 'shadow_bolt',
      description: 'A banished scholar whose bolts drink the life of many at once.',
      perk: '+{perkDamage%}% weapon damage.',
      maxHealth: 115, moveSpeed: 215, armor: 0, pickupRadius: 58, healthRegen: 0,
      perkDamage: 0.10,
      apply: (p, c) => { p.damageMultiplier += c.perkDamage; },
      unlockHint: 'Slay 750 enemies across all runs.',
    },
    shaman: {
      name: 'Vonnra Hydrocheck', title: 'Far Seer of the Crossroads', className: 'Shaman',
      art: 'shaman', color: [0.00, 0.44, 0.87], weapon: 'chain_lightning',
      description: 'A far seer who calls the storm down on whole warbands.',
      perk: '+{perkLuck%}% luck and +{perkArea%}% effect area.',
      maxHealth: 125, moveSpeed: 215, armor: 1, pickupRadius: 58, healthRegen: 0,
      perkLuck: 0.15, perkArea: 0.08,
      apply: (p, c) => { p.luck += c.perkLuck; p.areaMultiplier += c.perkArea; },
      unlockHint: 'Bank 500 gold across all runs.',
    },
    paladin: {
      name: 'Professor Keegan', title: 'Knight of the Silver Hand (Probationary)', className: 'Paladin',
      art: 'paladin', color: [0.96, 0.55, 0.73], weapon: 'avengers_shield',
      description: 'Buried by mistake. Dug himself out. Filed a complaint. Kept the shield.',
      perk: '+{perkArmor} armor and +{perkHealing%}% healing received.',
      maxHealth: 145, moveSpeed: 210, armor: 2, pickupRadius: 56, healthRegen: 0,
      perkArmor: 1, perkHealing: 0.20,
      apply: (p, c) => { p.armor += c.perkArmor; p.healingMult += c.perkHealing; },
      unlockHint: 'Somewhere in Elwynn Forest, an adequate knight lies buried...',
    },
    death_knight: {
      name: 'DZ', title: 'Who Could Not Stay Buried', className: 'Death Knight',
      art: 'death_knight', color: [0.77, 0.12, 0.23], weapon: 'death_strike',
      description: 'He healed until the Light curdled, and something colder answered. It has not let go since.',
      perk: 'Desecration is innate - overheal erupts as shadow, and {perkShare%}% of healing that lands lashes out with it.',
      maxHealth: 155, moveSpeed: 200, armor: 2, pickupRadius: 58, healthRegen: 2.0,
      perkShare: 0.20,
      apply: (p, c) => {
        p.desecration += 1;
        p.desecrationOverheal = WS.max(p.desecrationOverheal, WS.Config.desecrationOverheal);
        p.desecrationShare += c.perkShare;
      },
      unlockHint: 'Let healing curdle. When enough Light has rotted in one run, a blade will answer.',
    },
    demon_hunter: {
      name: 'Nerosus', title: 'The Spineless One', className: 'Demon Hunter',
      art: 'demon_hunter', color: [0.64, 0.19, 0.79], weapon: 'fel_beam',
      description: 'Burned out both eyes to see the fel clearly. Says it was worth it. Has not blinked since.',
      perk: 'Fel-attuned from the first swing - overkill damage always feeds Metamorphosis.',
      maxHealth: 120, moveSpeed: 235, armor: 0, pickupRadius: 60, healthRegen: 0,
      perkDodge: 0.05,
      apply: (p, c) => { p.felAttuned += 1; p.dodgeChance += c.perkDodge; },
      unlockHint: 'Waste enough killing. Metamorphose again and again, and the glaives will find you.',
    },
  };

  WS.CharacterOrder = [
    'mage', 'priest', 'rogue', 'hunter', 'warrior', 'warlock', 'shaman',
    'paladin', 'death_knight', 'demon_hunter',
  ];

})(window.WS);
