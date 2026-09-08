/* Blessings: a run-defining boon chosen before the first wave. Three are
 * offered at the start of every run; the choice is permanent for that run. */
'use strict';
(function (WS) {

  WS.Blessings = {
    kings: {
      name: 'Warden\'s Charge', art: 'crown', quality: 'rare',
      description: '+{dmg%}% damage and +{hp} maximum health.',
      dmg: 0.08, hp: 40,
      apply: (p, b) => { p.damageMultiplier += b.dmg; p.maxHealth += b.hp; p.health += b.hp; },
    },
    wisdom: {
      name: 'Scholar\'s Charge', art: 'book', quality: 'rare',
      description: '+{xp%}% experience from every gem.',
      xp: 0.15,
      apply: (p, b) => { p.xpMultiplier += b.xp; },
    },
    moonlit: {
      name: 'Grace of the Moon', art: 'moon', quality: 'rare',
      description: '+{area%}% effect area on everything you cast.',
      area: 0.15,
      apply: (p, b) => { p.areaMultiplier += b.area; },
    },
    fortune: {
      name: 'Gift of the Hourglass', art: 'hourglass', quality: 'rare',
      description: '+{gold%}% gold found and +{luck%}% luck.',
      gold: 0.20, luck: 0.15,
      apply: (p, b) => { p.goldMultiplier += b.gold; p.luck += b.luck; },
    },
    wild: {
      name: 'Mark of the Thicket', art: 'leaf', quality: 'rare',
      description: '+{armor} armor, +{regen} health per second, +{speedMult*%}% movement speed.',
      armor: 1, regen: 0.5, speedMult: 1.08,
      apply: (p, b) => { p.armor += b.armor; p.healthRegen += b.regen; p.moveSpeed *= b.speedMult; },
    },
    air: {
      name: 'Wrath of the Gale', art: 'wing', quality: 'rare',
      description: '-{cooldownMult~%}% weapon cooldowns.',
      cooldownMult: 0.90,
      apply: (p, b) => { p.cooldownMultiplier *= b.cooldownMult; },
    },
    fel: {
      name: 'Leech Pact', art: 'drain', quality: 'rare',
      description: 'Your projectiles drain life: heal for {lifesteal%}% of the damage they deal.',
      lifesteal: 0.02,
      apply: (p, b) => { p.lifesteal += b.lifesteal; },
    },
    ancestors: {
      name: 'Ancestral Grace', art: 'heart', quality: 'rare',
      description: '+{healing%}% healing received.',
      healing: 0.30,
      apply: (p, b) => { p.healingMult += b.healing; },
    },

    /* Rule-changing blessings: these bend how the run plays, not just a stat. */
    glass_cannon: {
      name: 'Glass Cannon', art: 'flame', quality: 'legendary',
      description: '+{dmg%}% weapon damage, but -{hpMult~%}% maximum health. Live fast.',
      dmg: 0.45, hpMult: 0.65,
      apply: (p, b) => {
        p.damageMultiplier += b.dmg;
        p.maxHealth = WS.floor(p.maxHealth * b.hpMult);
        p.health = WS.min(p.health, p.maxHealth);
      },
    },
    bloodthirst: {
      name: 'Bloodthirst', art: 'drain', quality: 'legendary',
      description: 'Every {killInterval} kills restore {healPct%}% +{healFlat} health. The horde is your medicine.',
      killInterval: 25, healPct: 0.06, healFlat: 3,
      apply: (p, b) => {
        p.bloodthirst = true;
        p.bloodthirstInterval = b.killInterval;
        p.bloodthirstHealPct = b.healPct;
        p.bloodthirstHealFlat = b.healFlat;
      },
    },
    momentum: {
      name: 'Momentum', art: 'boot', quality: 'legendary',
      description: 'While moving, your weapons fire {moveHaste%}% faster. Never stand still.',
      moveHaste: 0.25,
      apply: (p, b) => { p.momentum = true; p.momentumHaste = b.moveHaste; },
    },
    arcane_overflow: {
      name: 'Arcane Overflow', art: 'arcane', quality: 'legendary',
      description: 'Every experience gem may unleash all your weapons at once ({overflow%}% chance).',
      overflow: 0.08,
      apply: (p, b) => { p.overflow = b.overflow; },
    },
    blood_rite: {
      name: 'Blood Rite', art: 'desecrate', quality: 'legendary',
      description: 'Healing curdles. Every point of overheal erupts as shadow, and {share%}% of the healing that does land lashes out too.',
      overheal: 1.0, share: 0.25,
      apply: (p, b) => {
        p.curdled += 1;
        p.curdleOverheal = WS.max(p.curdleOverheal, b.overheal);
        p.curdleShare += b.share;
      },
    },
    ruinous_pact: {
      name: 'Ruinous Pact', art: 'soulrend', quality: 'legendary',
      description: 'Overkill is no longer wasted: damage past the killing blow feeds the ruin, and it feeds {felGain%}% faster. Fill the meter and you become the monster.',
      felGain: 0.30,
      apply: (p, b) => { p.felAttuned += 1; p.felBonus += b.felGain; },
    },
    unyielding: {
      name: 'Unyielding Faith', art: 'aegis', quality: 'legendary',
      description: '+{armor} armor, +{hpMult*%}% max health, +{healing%}% healing received, and enemies that strike you are burned. But -{speedMult~%}% speed.',
      armor: 3, hpMult: 1.6, healing: 0.40, speedMult: 0.88, thorns: 2,
      apply: (p, b) => {
        p.armor += b.armor;
        p.maxHealth = WS.floor(p.maxHealth * b.hpMult);
        p.health = p.maxHealth;
        p.healingMult += b.healing;
        p.moveSpeed *= b.speedMult;
        p.thornsRank += b.thorns;
      },
    },
  };

  WS.BlessingOrder = [
    'kings', 'wisdom', 'moonlit', 'fortune', 'wild', 'air', 'fel', 'ancestors',
    'glass_cannon', 'bloodthirst', 'momentum', 'arcane_overflow', 'blood_rite',
    'ruinous_pact', 'unyielding',
  ];

})(window.WS);
