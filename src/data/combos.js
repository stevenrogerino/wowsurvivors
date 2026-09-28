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
      description: 'Cinderfalls chill whatever survives them, and both bolts hit {dmgMult*%}% harder.',
      hint: 'When frost meets flame, something ancient stirs...',
      dmgMult: 1.15, slowFactor: 0.60, slowDuration: 1.5,
      apply: (w1, w2, c) => {
        w1.mods.damageMult = (w1.mods.damageMult || 1) * c.dmgMult;
        w2.mods.damageMult = (w2.mods.damageMult || 1) * c.dmgMult;
        w2.mods.slowFactor = c.slowFactor; w2.mods.slowDuration = c.slowDuration;
      },
    },
    shadowflame: {
      name: 'Shadowflame', weapons: ['umbral_bolt', 'cinderfall'],
      description: 'Umbral Bolts detonate on impact, scorching everything nearby. Once a bolt passes through everything, the flame burns inside it instead: {pierceFlame*%}% harder.',
      hint: 'Shadow and flame were ever entwined.',
      // Every bolt that passes through something bursts, and an evolved bolt
      // passes through everything: at 55 the pair did 2.3 times its parts.
      // Umbral Bolt now pierces six from rank 1, so at 20 the burst was worth
      // +79% by 5:00 (tools/rank-test.js); 12 kept it near +40% early. Once
      // the bolt evolves it passes through everything, and a creature the
      // burst touched is one the bolt then skips, so the burst was worth +2%:
      // once it passes through everything the flame burns in the bolt
      // instead (weapon.js fillSpec), pierceFlame times its damage.
      splash: 12, pierceFlame: 1.35,
      apply: (w1, w2, c) => { w1.mods.splash = c.splash; w1.mods.pierceFlame = c.pierceFlame; },
    },
    deadly_brew: {
      name: 'Deadly Brew', weapons: ['knifestorm', 'rimeshard'],
      description: 'Every thrown knife is coated in a numbing venom that slows its victim and bites {dmgMult*%}% deeper.',
      hint: "A rogue with access to the alchemist's icebox is a dangerous thing.",
      slowFactor: 0.65, slowDuration: 1.2, dmgMult: 1.15,
      apply: (w1, w2, c) => {
        w1.mods.slowFactor = c.slowFactor; w1.mods.slowDuration = c.slowDuration;
        w1.mods.damageMult = (w1.mods.damageMult || 1) * c.dmgMult;
      },
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
      description: 'Every spin of the Axe Gyre begins with a pulse of holy Light, and the blades bite {dmgMult*%}% harder.',
      hint: 'Steel spun in faith becomes something more.',
      // The pulse is worth +20% early and +5% once the gyre evolves.
      dmgMult: 1.08,
      apply: (w1, w2, c) => { w1.mods.novaOnCast = true; w1.mods.damageMult = (w1.mods.damageMult || 1) * c.dmgMult; },
    },
    truestrike: {
      name: 'Truestrike', weapons: ['volley', 'seeking_motes'],
      description: 'Enchanted arrows curve in flight to seek their prey and strike {dmgMult*%}% harder.',
      hint: 'The finest rangers fletch their arrows with a whisper of magic.',
      // Homing alone bends a spread onto one target: -1% to -5% on a crowd
      // until the volley evolved (tools/rank-test.js KIND=pair).
      dmgMult: 1.10,
      apply: (w1, w2, c) => { w1.mods.homing = true; w1.mods.damageMult = (w1.mods.damageMult || 1) * c.dmgMult; },
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
      description: 'The shield judges from hallowed ground: +{extraBounces} ricochets and {dmgMult*%}% more damage.',
      hint: 'A shield thrown from sacred ground carries a verdict.',
      extraBounces: 3, dmgMult: 1.30,
      apply: (w1, w2, c) => {
        w1.mods.extraBounces = (w1.mods.extraBounces || 0) + c.extraBounces;
        w1.mods.damageMult = (w1.mods.damageMult || 1) * c.dmgMult;
      },
    },
    curdle: {
      name: 'Curdle', weapons: ['dawnpulse', 'hallowed_ring'],
      description: 'Both hallowed rites mend you for {healBonus} more, even unevolved. What your wounds cannot drink, rots.',
      hint: 'Two holy rites in one vessel. The Light has to go somewhere...',
      healBonus: 2,
      apply: (w1, w2, c) => {
        w1.mods.healBonus = (w1.mods.healBonus || 0) + c.healBonus;
        w2.mods.healBonus = (w2.mods.healBonus || 0) + c.healBonus;
      },
    },

    /* ------------------------------------------ the monk's and druid's -- */
    thunderpalm: {
      name: 'Thunderpalm', weapons: ['iron_palms', 'arcweb'],
      description: 'Iron Palms carry the storm: {procChain%}% of strikes loose arcweb from what they hit.',
      hint: 'An open hand can hold lightning, if it is quick enough.',
      procChain: 0.18,
      apply: (w1, w2, c) => { w1.mods.procChain = WS.max(w1.mods.procChain || 0, c.procChain); },
    },
    whirling_discipline: {
      name: 'Whirling Discipline', weapons: ['iron_palms', 'axe_gyre'],
      description: 'One more palm in every flurry, each palm draws the crowd IN toward the blades instead of shoving it away, and the gyre spins {dmgMult*%}% harder.',
      hint: 'The monk and the axe keep the same tempo.',
      extraProjectiles: 1, dmgMult: 1.10,
      apply: (w1, w2, c) => {
        w1.mods.extraProjectiles = (w1.mods.extraProjectiles || 0) + c.extraProjectiles;
        w1.mods.pull = true;
        w2.mods.damageMult = (w2.mods.damageMult || 1) * c.dmgMult;
      },
    },
    hallowed_hands: {
      name: 'Hallowed Hands', weapons: ['iron_palms', 'hallowed_ring'],
      description: 'Every flurry mends you for {healBonus}, and the hallowed ground spreads {areaMult*%}% wider.',
      hint: 'Hands that strike can also bless.',
      healBonus: 1, areaMult: 1.15,
      apply: (w1, w2, c) => {
        w1.mods.healBonus = (w1.mods.healBonus || 0) + c.healBonus;
        w2.mods.areaMult = (w2.mods.areaMult || 1) * c.areaMult;
      },
    },
    moonlit_herd: {
      name: 'Moonlit Herd', weapons: ['spirit_herd', 'moonbrand'],
      description: 'One more beast in the herd, running {dmgMult*%}% harder, and each ends its run in a burst of moonlight.',
      hint: 'Some herds only run under a full moon.',
      // The beast and the burst were +22% at 5:00 and +3% to +7% after.
      extraProjectiles: 1, endBurst: 60, dmgMult: 1.12,
      apply: (w1, w2, c) => {
        w1.mods.damageMult = (w1.mods.damageMult || 1) * c.dmgMult;
        w1.mods.extraProjectiles = (w1.mods.extraProjectiles || 0) + c.extraProjectiles;
        w1.mods.endBurst = WS.max(w1.mods.endBurst || 0, c.endBurst);
      },
    },
    bramble_run: {
      name: 'Bramble Run', weapons: ['spirit_herd', 'thornbloom'],
      description: 'Where the herd stops running, brambles grow: a small slowing thicket at the end of every run.',
      hint: 'Seeds travel far on a running hide.',
      apply: (w1) => { w1.mods.endZone = true; },
    },
    hailwheel: {
      name: 'Hailwheel', weapons: ['gale_chakram', 'rimeshard'],
      description: 'The chakram rimes whatever it cuts, and both hit {dmgMult*%}% harder.',
      hint: 'A spinning edge through a hailstorm comes back cold.',
      slowFactor: 0.60, slowDuration: 1.2, dmgMult: 1.15,
      apply: (w1, w2, c) => {
        w1.mods.slowFactor = c.slowFactor; w1.mods.slowDuration = c.slowDuration;
        w1.mods.damageMult = (w1.mods.damageMult || 1) * c.dmgMult;
        w2.mods.damageMult = (w2.mods.damageMult || 1) * c.dmgMult;
      },
    },
    razor_wind: {
      name: 'Razor Wind', weapons: ['gale_chakram', 'knifestorm'],
      description: 'One more ring in every throw, cutting {dmgMult*%}% deeper.',
      hint: 'Every blade that flies wants a blade beside it.',
      extraProjectiles: 1, dmgMult: 1.15,
      apply: (w1, w2, c) => {
        w1.mods.extraProjectiles = (w1.mods.extraProjectiles || 0) + c.extraProjectiles;
        w1.mods.damageMult = (w1.mods.damageMult || 1) * c.dmgMult;
      },
    },
    rotbloom: {
      name: 'Rotbloom', weapons: ['thornbloom', 'blightfield'],
      description: 'Rot feeds the thicket: both fields hit {dmgMult*%}% harder and the brambles hold faster.',
      hint: 'Nothing grows as well as it does on something dead.',
      dmgMult: 1.12, slowFactor: 0.40,
      apply: (w1, w2, c) => {
        w1.mods.damageMult = (w1.mods.damageMult || 1) * c.dmgMult;
        w2.mods.damageMult = (w2.mods.damageMult || 1) * c.dmgMult;
        w1.mods.slowFactor = c.slowFactor;
      },
    },
  };

  WS.ComboOrder = [
    'frostfire', 'shadowflame', 'deadly_brew', 'tempest_pact',
    'radiant_gyre', 'truestrike', 'celestial', 'verdict', 'curdle',
    'thunderpalm', 'whirling_discipline', 'hallowed_hands', 'moonlit_herd',
    'bramble_run', 'hailwheel', 'razor_wind', 'rotbloom',
  ];

})(window.WS);
