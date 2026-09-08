/* Secret weapon-weapon synergies ("Discoveries"). Carrying both weapons
 * activates the discovery for that run and records it in the codex, where
 * undiscovered entries show only a cryptic hint.
 * Bonuses stay modest: evolutions are the power spikes; discoveries are
 * flavour, texture, and a reason to try pairs you otherwise would not. */
'use strict';
(function (WS) {

  WS.Combos = {
    frostfire: {
      name: 'Frostfire Bolt', weapons: ['rimeshard', 'cinderfall'],
      description: 'Cinderfalls chill whatever survives them, and both bolts hit 10% harder.',
      hint: 'When frost meets flame, something ancient stirs...',
      dmgMult: 1.10, slowFactor: 0.60, slowDuration: 1.5,
      apply: (w1, w2, c) => {
        w1.mods.damageMult = (w1.mods.damageMult || 1) * c.dmgMult;
        w2.mods.damageMult = (w2.mods.damageMult || 1) * c.dmgMult;
        w2.mods.slowFactor = c.slowFactor; w2.mods.slowDuration = c.slowDuration;
      },
    },
    shadowflame: {
      name: 'Shadowflame', weapons: ['umbral_bolt', 'cinderfall'],
      description: 'Umbral Bolts detonate on impact, scorching everything nearby.',
      hint: 'Shadow and flame were ever entwined.',
      splash: 55,
      apply: (w1, w2, c) => { w1.mods.splash = c.splash; },
    },
    deadly_brew: {
      name: 'Deadly Brew', weapons: ['knifestorm', 'rimeshard'],
      description: 'Every thrown knife is coated in a numbing venom that slows its victim.',
      hint: "A rogue with access to the alchemist's icebox is a dangerous thing.",
      slowFactor: 0.65, slowDuration: 1.2,
      apply: (w1, w2, c) => { w1.mods.slowFactor = c.slowFactor; w1.mods.slowDuration = c.slowDuration; },
    },
    tempest_pact: {
      name: 'Tempest Pact', weapons: ['axe_gyre', 'arcweb'],
      description: 'Axe Gyre blades sometimes call the storm, loosing arcweb on those they strike.',
      hint: 'Blessed blades may yet call the storm...',
      procChain: 0.15,
      apply: (w1, w2, c) => { w1.mods.procChain = c.procChain; },
    },
    radiant_gyre: {
      name: 'Radiant Gyre', weapons: ['axe_gyre', 'dawnpulse'],
      description: 'Every axe_gyre begins with a pulse of holy Light.',
      hint: 'Steel spun in faith becomes something more.',
      apply: (w1) => { w1.mods.novaOnCast = true; },
    },
    truestrike: {
      name: 'Truestrike', weapons: ['volley', 'seeking_motes'],
      description: 'Enchanted arrows curve in flight to seek their prey.',
      hint: 'The finest rangers fletch their arrows with a whisper of magic.',
      apply: (w1) => { w1.mods.homing = true; },
    },
    celestial: {
      name: 'Celestial Alignment', weapons: ['moonbrand', 'dawnpulse'],
      description: 'Sun and moon align: an extra moonbeam, and wider rings of Light.',
      hint: 'What happens when the moon rises on the light of dawn?',
      extraProjectiles: 1, areaMult: 1.12,
      apply: (w1, w2, c) => {
        w1.mods.extraProjectiles = (w1.mods.extraProjectiles || 0) + c.extraProjectiles;
        w2.mods.areaMult = (w2.mods.areaMult || 1) * c.areaMult;
      },
    },
    verdict: {
      name: 'Verdict', weapons: ['judgement_disc', 'hallowed_ring'],
      description: 'The shield judges from hallowed ground: +1 ricochet and 10% more damage.',
      hint: 'A shield thrown from sacred ground carries a verdict.',
      extraBounces: 1, dmgMult: 1.10,
      apply: (w1, w2, c) => {
        w1.mods.extraBounces = (w1.mods.extraBounces || 0) + c.extraBounces;
        w1.mods.damageMult = (w1.mods.damageMult || 1) * c.dmgMult;
      },
    },
    curdle: {
      name: 'Curdle', weapons: ['dawnpulse', 'hallowed_ring'],
      description: 'Both hallowed rites mend you for {healBonus} more - even unevolved. What your wounds cannot drink, rots.',
      hint: 'Two holy rites in one vessel. The Light has to go somewhere...',
      healBonus: 2,
      apply: (w1, w2, c) => {
        w1.mods.healBonus = (w1.mods.healBonus || 0) + c.healBonus;
        w2.mods.healBonus = (w2.mods.healBonus || 0) + c.healBonus;
      },
    },
  };

  WS.ComboOrder = [
    'frostfire', 'shadowflame', 'deadly_brew', 'tempest_pact',
    'radiant_gyre', 'truestrike', 'celestial', 'verdict', 'curdle',
  ];

})(window.WS);
