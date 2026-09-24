/* Playable survivors. `apply(player, c)` mutates the freshly-built player. */
'use strict';
(function (WS) {

  WS.Characters = {
    mage: {
      name: 'Baron Zul', title: 'Apprentice of the Low Cloister', className: 'Mage',
      art: 'mage', color: [0.41, 0.80, 0.94], weapon: 'seeking_motes',
      description: 'A gifted novice whose missiles hunt his foes on their own.',
      perk: 'Weapon cooldowns reduced by {perkCooldownMult~%}%.',
      maxHealth: 110, moveSpeed: 225, armor: 0, pickupRadius: 60, healthRegen: 0,
      perkCooldownMult: 0.92,
      apply: (p, c) => { p.cooldownMultiplier *= c.perkCooldownMult; },
    },
    priest: {
      name: 'Chid', title: 'The Fool', className: 'Priest',
      art: 'priest', color: [1.00, 1.00, 1.00], weapon: 'dawnpulse',
      description: 'A stalwart healer wreathed in rings of searing Light.',
      perk: 'Regenerates {perkRegen} health per second.',
      maxHealth: 135, moveSpeed: 205, armor: 1, pickupRadius: 64, healthRegen: 0,
      perkRegen: 1.0,
      apply: (p, c) => { p.healthRegen += c.perkRegen; },
    },
    rogue: {
      name: 'Dr. Rav McBreathless', title: 'Kerchief Defector', className: 'Rogue',
      art: 'rogue', color: [1.00, 0.96, 0.41], weapon: 'knifestorm',
      description: 'A quick-fingered cutpurse who fills the field with steel.',
      perk: '+{perkSpeedMult*%}% movement speed and +{perkCrit%}% critical strike chance.',
      maxHealth: 100, moveSpeed: 250, armor: 0, pickupRadius: 56, healthRegen: 0,
      perkSpeedMult: 1.10, perkCrit: 0.05,
      apply: (p, c) => { p.moveSpeed *= c.perkSpeedMult; p.critChance += c.perkCrit; },
      unlockHint: 'Held prisoner by the Kerchiefs.',
    },
    hunter: {
      name: 'Maeca Barefoot', title: 'Ranger of the Ashford Garrison', className: 'Hunter',
      art: 'hunter', color: [0.67, 0.83, 0.45], weapon: 'volley',
      description: 'A keen-eyed ranger who never wastes an arrow.',
      perk: '+{perkPickup} pickup radius and +{perkSpeedMult*%}% movement speed.',
      maxHealth: 115, moveSpeed: 230, armor: 0, pickupRadius: 60, healthRegen: 0,
      perkPickup: 30, perkSpeedMult: 1.05,
      apply: (p, c) => { p.pickupRadius += c.perkPickup; p.moveSpeed *= c.perkSpeedMult; },
      unlockHint: 'Holding out against the pack.',
    },
    warrior: {
      name: 'AAAAAAAAA', title: 'The Fallen Hero', className: 'Warrior',
      art: 'warrior', color: [0.78, 0.61, 0.43], weapon: 'axe_gyre',
      description: 'An old soldier who solves most problems with spinning axes.',
      perk: '+{perkArmor} armor and +{perkHealth} maximum health.',
      maxHealth: 160, moveSpeed: 210, armor: 3, pickupRadius: 54, healthRegen: 0,
      perkArmor: 2, perkHealth: 25,
      apply: (p, c) => { p.armor += c.perkArmor; p.maxHealth += c.perkHealth; p.health += c.perkHealth; },
      unlockHint: 'Screaming under a cairn.',
    },
    warlock: {
      name: "Nim B'ladin", title: 'Exile of the Gloaming Grove', className: 'Warlock',
      art: 'warlock', color: [0.58, 0.51, 0.79], weapon: 'umbral_bolt',
      description: 'A banished scholar whose bolts drink the life of many at once.',
      perk: '+{perkDamage%}% weapon damage.',
      maxHealth: 115, moveSpeed: 215, armor: 0, pickupRadius: 58, healthRegen: 0,
      perkDamage: 0.10,
      apply: (p, c) => { p.damageMultiplier += c.perkDamage; },
      unlockHint: 'Waiting at the edge of a slaughter.',
    },
    shaman: {
      name: 'Vonnra Hydrocheck', title: 'Far Seer of the Waystation', className: 'Shaman',
      art: 'shaman', color: [0.00, 0.44, 0.87], weapon: 'arcweb',
      description: 'A far seer who calls the storm down on whole warbands.',
      perk: '+{perkLuck%}% luck and +{perkArea%}% effect area.',
      maxHealth: 125, moveSpeed: 215, armor: 1, pickupRadius: 58, healthRegen: 0,
      perkLuck: 0.15, perkArea: 0.08,
      apply: (p, c) => { p.luck += c.perkLuck; p.areaMultiplier += c.perkArea; },
      unlockHint: 'Reading fortunes in the storm.',
    },
    paladin: {
      name: 'Professor Keegan', title: 'Knight of the Argent Vigil (Probationary)', className: 'Paladin',
      art: 'paladin', color: [0.96, 0.55, 0.73], weapon: 'judgement_disc',
      description: 'Buried by mistake. Dug himself out. Filed a complaint. Kept the shield.',
      perk: '+{perkArmor} armor and +{perkHealing%}% healing received.',
      maxHealth: 145, moveSpeed: 210, armor: 2, pickupRadius: 56, healthRegen: 0,
      perkArmor: 1, perkHealing: 0.20,
      apply: (p, c) => { p.armor += c.perkArmor; p.healingMult += c.perkHealing; },
      unlockHint: 'Buried in Thornhollow, by mistake.',
    },
    graveblade: {
      name: 'DZ', title: 'Who Could Not Stay Buried', className: 'Graveblade',
      art: 'graveblade', color: [0.77, 0.12, 0.23], weapon: 'reaving_arc',
      description: 'He healed until the Light curdled, and something colder answered. It has not let go since.',
      perk: 'An old practice, not a birthright: take up Blood Rite and healing curdles '
        + '{perkShare%}% harder for you than it does for anyone else who has taken the same rite.',
      maxHealth: 155, moveSpeed: 200, armor: 2, pickupRadius: 58, healthRegen: 2.0,
      perkShare: 0.20,
      signatureBlessing: 'blood_rite',
      /* Curdled Light used to be free at character select - felAttuned's own
         restructuring (see ruinseeker below) made that the odd one out: every
         class's identity power is something anyone can reach through a
         blessing, with the class that owns it a little further ahead of
         everyone else who took the same one. curdleShare is what carries that
         edge here, and like Ruinseeker's felBonus it is inert until Blood
         Rite (or anything else that sets curdled) actually turns the system on. */
      apply: (p, c) => { p.curdleShare += c.perkShare; },
      unlockHint: 'Where the Light has curdled.',
    },
    ruinseeker: {
      name: 'Nerosus', title: 'The Spineless One', className: 'Ruinseeker',
      art: 'ruinseeker', color: [0.64, 0.19, 0.79], weapon: 'verdant_lance',
      description: 'Burned out both eyes to see the ruin clearly. Says it was worth it. Has not blinked since.',
      perk: 'Born to the ruin, not given it free: take up the Ruinous Pact and it '
        + 'answers {perkFel%}% faster for you, and recovers quicker afterward than '
        + 'it does for anyone else who has sworn the same oath.',
      maxHealth: 120, moveSpeed: 235, armor: 0, pickupRadius: 60, healthRegen: 0,
      perkDodge: 0.05, perkFel: 0.35,
      signatureBlessing: 'ruinous_pact',
      /* felAttuned/ruinborn used to be free at character select - which made
         Ruinform a power only this one class could ever touch, unlike every
         other identity mechanic in the game (Curdled Light, Dark Bargain,
         Arcane Overflow) which anyone can reach through a blessing. Now the
         Ruinous Pact is what turns the system on for everyone, Ruinseeker
         included; felBonus and dodgeChance stay unconditional flavor - inert
         on fel gain until something sets felAttuned, same as Graveblade's
         curdleShare is inert until something sets curdled. What stays
         exclusive is ruinborn itself, granted only when THIS class takes the
         Pact (see blessings.js) - a deeper recovery floor, not a bigger one. */
      apply: (p, c) => {
        p.felBonus += c.perkFel;
        p.dodgeChance += c.perkDodge;
      },
      unlockHint: 'Where the ruin has taken enough.',
    },
  };

  WS.CharacterOrder = [
    'mage', 'priest', 'rogue', 'hunter', 'warrior', 'warlock', 'shaman',
    'paladin', 'graveblade', 'ruinseeker',
  ];

})(window.WS);
