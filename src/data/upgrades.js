/* In-run passive boons offered on level-up. `apply(player, up)` reads its
 * magnitude from the upgrade's own `v`, so one number retunes the passive. */
'use strict';
(function (WS) {

  WS.Upgrades = {
    might: {
      name: 'Might', art: 'fist', quality: 'common',
      description: '+{v%}% weapon damage', max: 5, v: 0.10,
      detail: 'Multiplies the damage of every weapon you carry.',
      apply: (p, up) => { p.damageMultiplier += up.v; },
    },
    haste: {
      name: 'Haste', art: 'wing', quality: 'common',
      description: '-{v~%}% weapon cooldowns', max: 5, v: 0.92,
      detail: 'Every weapon fires more often. Ranks stack multiplicatively.',
      apply: (p, up) => { p.cooldownMultiplier *= up.v; },
    },
    fleetfoot: {
      name: 'Fleetfoot', art: 'boot', quality: 'common',
      description: '+{v*%}% movement speed', max: 5, v: 1.12,
      detail: 'You move faster.',
      apply: (p, up) => { p.moveSpeed *= up.v; },
    },
    magnet: {
      name: "Greed's Pull", art: 'magnet', quality: 'common',
      description: '+{v} pickup radius', max: 5, v: 25,
      detail: 'Gems, coins, and potions fly to you from farther away.',
      apply: (p, up) => { p.pickupRadius += up.v; },
    },
    vitality: {
      name: 'Vitality', art: 'heart', quality: 'common',
      description: '+{v} maximum health (and heals it)', max: 5, v: 25,
      detail: 'A bigger health pool, plus a free heal when taken.',
      apply: (p, up) => { p.maxHealth += up.v; WS.Player.heal(p, up.v, 'vitality'); },
    },
    armor: {
      name: 'Ironhide', art: 'shield', quality: 'common',
      description: '+{v} armor (diminishing damage reduction)', max: 5, v: 2,
      detail: 'Every hit is cut by a share based on your armor. Each point helps a little less than the last, and it never blocks a hit completely.',
      apply: (p, up) => { p.armor += up.v; },
    },
    precision: {
      name: 'Precision', art: 'crosshair', quality: 'uncommon',
      description: '+{v%}% critical strike chance', max: 5, v: 0.07,
      detail: 'Chance for any weapon hit to strike critically.',
      apply: (p, up) => { p.critChance += up.v; },
    },
    ferocity: {
      name: 'Ferocity', art: 'claw', quality: 'uncommon',
      description: '+{v%}% critical strike damage', max: 4, v: 0.25,
      detail: 'Your critical strikes hit even harder.',
      apply: (p, up) => { p.critDamage += up.v; },
    },
    area: {
      name: 'Expanse', art: 'expand', quality: 'uncommon',
      description: '+{v%}% effect area', max: 5, v: 0.12,
      detail: 'Bigger auras, zones, orbits and novas. Chain and beam weapons gain REACH from '
        + 'this (longer leaps, longer lines), not damage. Look to pierce or count for those instead.',
      apply: (p, up) => { p.areaMultiplier += up.v; },
    },
    quantity: {
      name: 'Duplicity', art: 'triple', quality: 'rare',
      description: '+{v} projectile for volley weapons', max: 3, v: 1,
      detail: 'Adds a projectile to bolts, knives, arrows, axes, shields, storm strikes, and chain leaps. Auras and beams are unaffected.',
      apply: (p, up) => { p.projectileBonus += up.v; },
    },
    luck: {
      name: 'Fortune', art: 'coin', quality: 'uncommon',
      description: '+{v%}% luck (better and more drops)', max: 4, v: 0.15,
      detail: 'Better odds of coins, potions, sapper charges, and lodestones, but every rank here '
        + 'is a rank not spent on clear speed, which is what actually keeps a build alive early. '
        + 'A strong late-game luxury, a weak early priority.',
      apply: (p, up) => { p.luck += up.v; },
    },
    wisdom: {
      name: 'Wisdom', art: 'book', quality: 'uncommon',
      description: '+{v%}% experience gained', max: 4, v: 0.10,
      detail: 'Every gem is worth more experience.',
      apply: (p, up) => { p.xpMultiplier += up.v; },
    },
    recovery: {
      name: 'Recovery', art: 'leaf', quality: 'common',
      description: '+{v} health regenerated per second', max: 4, v: 0.5,
      detail: 'Steady healing, always ticking.',
      apply: (p, up) => { p.healthRegen += up.v; },
    },
    velocity: {
      name: 'Velocity', art: 'spear', quality: 'common',
      description: '+{v%}% projectile speed', max: 3, v: 0.15,
      detail: 'Bolts, knives, arrows, and shields fly faster. No effect on chains, auras, gyres, or storms.',
      apply: (p, up) => { p.projectileSpeed += up.v; },
    },
    dark_bargain: {
      name: 'Dark Bargain', art: 'skull', quality: 'epic',
      description: 'The horde grows: +{Config.curseSpawnRate%}% spawns, +{Config.curseEnemySpeed%}% enemy speed. You grow too: +{v%}% XP and gold.',
      max: 3, v: 0.15,
      detail: 'A curse you choose. More enemies means more gems, more gold, more danger. Stacks.',
      apply: (p, up) => { p.curse += 1; p.xpMultiplier += up.v; p.goldMultiplier += up.v; },
    },
    warding_light: {
      name: 'Warding Light', art: 'aegis', quality: 'rare',
      description: 'Blocks the next single hit against you completely, then recharges.', max: 3,
      detail: 'Blocks one hit every {Config.blockInterval1} / {Config.blockInterval2} / {Config.blockInterval3} seconds by rank.',
      apply: (p) => {
        const c = WS.Config;
        const intervals = [c.blockInterval1, c.blockInterval2, c.blockInterval3];
        p.blockRank += 1;
        p.blockInterval = intervals[WS.min(p.blockRank, 3) - 1];
      },
    },
    chilling_presence: {
      name: 'Chilling Presence', art: 'frostaura', quality: 'rare',
      description: 'Enemies near you are slowed by cold.', max: 3,
      detail: 'Slows non-boss enemies within a widening frost aura (stronger and wider per rank). The aura grows with effect area.',
      apply: (p) => { p.chillRank += 1; },
    },
    spirit_companion: {
      name: 'Spirit Companion', art: 'spiritwolf', quality: 'rare',
      description: 'Summon a spirit wolf that hunts the horde.', max: 3,
      detail: 'Each rank calls another spirit wolf. They chase down the nearest enemies and maul them. Bites deal area damage that scales with your damage and level.',
      apply: () => { WS.Familiar.add('wolf'); },
    },
    grave_call: {
      name: 'Grave Call', art: 'risen', quality: 'rare',
      description: 'Raise a ghoul to shamble after the horde.', max: 3,
      detail: 'Each rank raises another ghoul. Slower than a spirit wolf and slower to swing, but it hits far harder and its claws sweep a wider arc.',
      apply: () => { WS.Familiar.add('ghoul'); },
    },
    dread_command: {
      name: 'Dread Command', art: 'command', quality: 'epic',
      description: '+{v%}% summon damage and +{haste%}% summon attack speed', max: 5,
      detail: 'Drives everything you have summoned, spirit wolves and ghouls alike, to strike harder and more often. Worthless without something to command.',
      offer: (p) => (p.upgradeLevels.spirit_companion || 0) > 0 || (p.upgradeLevels.grave_call || 0) > 0,
      v: 0.30, haste: 0.10,
      apply: (p, up) => { p.summonDamage += up.v; p.summonHaste += up.haste; },
    },

    /* ------------------------------------------------ tank / defensive --- */
    thorns: {
      name: 'Thorns', art: 'thorn', quality: 'uncommon',
      description: 'Attackers take damage back, melee and ranged.', max: 5,
      detail: 'Any enemy that hits you, with a melee swing OR a ranged bolt, takes {Config.thornsFlat} + {Config.thornsDamagePct%}% of that damage back per rank (even if you dodge or block). Ranged bolts reflect to the caster that fired them.',
      apply: (p) => { p.thornsRank += 1; },
    },
    curdled: {
      name: 'Curdled Light', art: 'desecrate', quality: 'epic',
      description: '+{v%}% of your healing lashes out as shadow damage', max: 5, v: 0.15,
      detail: 'Healing you cannot use rots instead of going to waste: overheal erupts around you, and a growing share of the healing that does land strikes with it. Feeds on regeneration, lifesteal, and healing weapons.',
      offer: (p) => p.curdled > 0 || p.healthRegen > 0 || p.lifesteal > 0,
      apply: (p, up) => {
        p.curdled += 1;
        p.curdleOverheal = WS.max(p.curdleOverheal, WS.Config.curdleOverheal);
        p.curdleShare += up.v;
      },
    },
    ruin_hunger: {
      name: 'Ruin Hunger', art: 'soulrend', quality: 'epic',
      /* The two figures here belong to Config and are applied from there -
         soulRending is a rank counter, and this upgrade's own `v` was a
         COPY of Config.felPerRank that nothing read. A duplicated number is
         a number that will disagree with itself eventually. */
      description: '+{Config.felPerRank%}% fel from overkill, +{Config.metaDurationPerRank}s of Ruinform, '
        + 'and a shorter wait before it can answer again', max: 5,
      detail: 'Every scrap of overkill feeds the ruin faster, the transformation holds a second longer '
        + 'per rank, and the recovery window after it ends shrinks too, though it never fully closes '
        + 'unless the ruin is already part of you.',
      offer: (p) => p.felAttuned > 0,
      apply: (p) => { p.soulRending += 1; },
    },
    primal_kinship: {
      name: 'Primal Kinship', art: 'paw', quality: 'epic',
      description: '+{Config.wildPerRank%}% Wild from every kill, +{Config.formDurationPerRank}s in a shape, '
        + '+{Config.kinshipDamage%}% damage while you wear one, and the Wild wakes sooner', max: 5,
      detail: 'The shapes come quicker, hold longer and hit harder, and the wait after one ends shrinks by '
        + '{Config.wildLockPerRank}s a rank, down to {Config.wildLockFloor}s.',
      offer: (p) => p.wildAttuned > 0,
      apply: (p) => { p.kinship += 1; },
    },
    serenity: {
      name: 'Serenity', art: 'step', quality: 'epic',
      description: 'Steps return {Config.flowRechargePerRank}s sooner and palm {Config.serenityStrike%}% harder; '
        + 'a third step at rank 3 and a fourth at rank 5', max: 5,
      detail: 'Stillwater Step, deepened: every rank shortens the wait for a step (never below '
        + '{Config.flowRechargeFloor}s) and strengthens the palm that lands along it.',
      offer: (p) => p.flowAttuned > 0,
      apply: (p) => {
        const before = WS.Primal.maxSteps(p);
        p.serenity += 1;
        p.flowSteps += WS.Primal.maxSteps(p) - before;
      },
    },
    serration: {
      name: 'Serration', art: 'bleed', quality: 'uncommon',
      description: 'Critical strikes open a wound that bleeds {Config.serrationShare%}% of the blow per rank', max: 4,
      detail: 'The bleed runs over {Config.bleedTime}s and ticks every {Config.bleedTick}s. A fresh crit reopens the wound at whichever bleed is worse, so it rewards crit chance and big hits alike.',
      apply: (p) => { p.serration += 1; },
    },
    perennial: {
      name: 'Perennial', art: 'perennial', quality: 'common',
      description: '+{v%}% duration on everything that lingers', max: 5, v: 0.10,
      detail: 'Zones, gyres, beasts and anything else with a lifetime stays on the field longer. It does not change how often a weapon fires.',
      apply: (p, up) => { p.durationMult += up.v; },
    },
    searing: {
      name: 'Searing Aura', art: 'retaura', quality: 'rare',
      description: 'A holy aura sears nearby enemies.', max: 4,
      detail: 'Burns enemies around you twice per second (damage and radius grow with rank, damage%, and effect area). Lets tanks deal damage while standing firm.',
      apply: (p) => { p.retRank += 1; },
    },
    dodge: {
      name: 'Evasion', art: 'feint', quality: 'uncommon',
      description: '+{v%}% chance to avoid a hit entirely.', max: 4, v: 0.08,
      detail: 'Each rank adds a chance to completely dodge an incoming hit. Stacks with armor and blocks.',
      apply: (p, up) => { p.dodgeChance += up.v; },
    },
  };

  WS.UpgradeOrder = [
    'might', 'haste', 'fleetfoot', 'magnet', 'vitality', 'armor', 'precision',
    'ferocity', 'area', 'quantity', 'luck', 'wisdom', 'recovery', 'velocity',
    'dark_bargain', 'warding_light', 'chilling_presence', 'spirit_companion',
    'thorns', 'searing', 'dodge', 'curdled', 'ruin_hunger',
    'grave_call', 'dread_command', 'primal_kinship', 'serenity',
    'serration', 'perennial',
  ];

})(window.WS);
