/* In-run passive boons offered on level-up. `apply(player, up)` reads its
 * magnitude from the upgrade's own `v`, so one number retunes the passive. */
'use strict';
(function (WS) {

  WS.Upgrades = {
    might: {
      name: 'Might', art: 'fist', quality: 'common',
      description: '+10% weapon damage', max: 5, v: 0.10,
      detail: 'Multiplies the damage of every weapon you carry.',
      apply: (p, up) => { p.damageMultiplier += up.v; },
    },
    haste: {
      name: 'Haste', art: 'wing', quality: 'common',
      description: '-8% weapon cooldowns', max: 5, v: 0.92,
      detail: 'Every weapon fires more often. Ranks stack multiplicatively.',
      apply: (p, up) => { p.cooldownMultiplier *= up.v; },
    },
    fleetfoot: {
      name: 'Fleetfoot', art: 'boot', quality: 'common',
      description: '+12% movement speed', max: 5, v: 1.12,
      detail: 'You move faster.',
      apply: (p, up) => { p.moveSpeed *= up.v; },
    },
    magnet: {
      name: "Greed's Pull", art: 'magnet', quality: 'common',
      description: '+25 pickup radius', max: 5, v: 25,
      detail: 'Gems, coins, and potions fly to you from farther away.',
      apply: (p, up) => { p.pickupRadius += up.v; },
    },
    vitality: {
      name: 'Vitality', art: 'heart', quality: 'common',
      description: '+25 maximum health (and heals it)', max: 5, v: 25,
      detail: 'A bigger health pool, plus a free heal when taken.',
      apply: (p, up) => { p.maxHealth += up.v; WS.Player.heal(p, up.v, 'vitality'); },
    },
    armor: {
      name: 'Ironhide', art: 'shield', quality: 'common',
      description: '+2 armor (diminishing damage reduction)', max: 5, v: 2,
      detail: 'Every hit is cut by a share based on your armor - each point helps a little less than the last, and it never blocks a hit completely.',
      apply: (p, up) => { p.armor += up.v; },
    },
    precision: {
      name: 'Precision', art: 'crosshair', quality: 'uncommon',
      description: '+7% critical strike chance', max: 5, v: 0.07,
      detail: 'Chance for any weapon hit to strike critically.',
      apply: (p, up) => { p.critChance += up.v; },
    },
    ferocity: {
      name: 'Ferocity', art: 'claw', quality: 'uncommon',
      description: '+25% critical strike damage', max: 4, v: 0.25,
      detail: 'Your critical strikes hit even harder.',
      apply: (p, up) => { p.critDamage += up.v; },
    },
    area: {
      name: 'Expanse', art: 'expand', quality: 'uncommon',
      description: '+12% effect area', max: 5, v: 0.12,
      detail: 'Bigger auras and splashes, wider orbits, longer chain leaps.',
      apply: (p, up) => { p.areaMultiplier += up.v; },
    },
    quantity: {
      name: 'Duplicity', art: 'triple', quality: 'rare',
      description: '+1 projectile for volley weapons', max: 3, v: 1,
      detail: 'Adds a projectile to bolts, knives, arrows, axes, shields, storm strikes, and chain leaps. Auras are unaffected.',
      apply: (p, up) => { p.projectileBonus += up.v; },
    },
    luck: {
      name: 'Fortune', art: 'coin', quality: 'uncommon',
      description: '+15% luck (better and more drops)', max: 4, v: 0.15,
      detail: 'Better odds of coins, potions, sapper charges, and lodestones.',
      apply: (p, up) => { p.luck += up.v; },
    },
    wisdom: {
      name: 'Wisdom', art: 'book', quality: 'uncommon',
      description: '+10% experience gained', max: 4, v: 0.10,
      detail: 'Every gem is worth more experience.',
      apply: (p, up) => { p.xpMultiplier += up.v; },
    },
    recovery: {
      name: 'Recovery', art: 'leaf', quality: 'common',
      description: '+0.5 health regenerated per second', max: 4, v: 0.5,
      detail: 'Steady healing, always ticking.',
      apply: (p, up) => { p.healthRegen += up.v; },
    },
    velocity: {
      name: 'Velocity', art: 'spear', quality: 'common',
      description: '+15% projectile speed', max: 3, v: 0.15,
      detail: 'Bolts, knives, arrows, and shields fly faster. No effect on chains, auras, whirlwinds, or storms.',
      apply: (p, up) => { p.projectileSpeed += up.v; },
    },
    dark_bargain: {
      name: 'Dark Bargain', art: 'skull', quality: 'epic',
      description: 'The horde grows: +20% spawns, +8% enemy speed. You grow too: +15% XP and gold.',
      max: 3, v: 0.15,
      detail: 'A curse you choose. More enemies means more gems, more gold, more danger. Stacks.',
      apply: (p, up) => { p.curse += 1; p.xpMultiplier += up.v; p.goldMultiplier += up.v; },
    },
    divine_bulwark: {
      name: 'Divine Bulwark', art: 'aegis', quality: 'rare',
      description: 'A holy shield blocks one hit entirely. Recharges over time.', max: 3,
      detail: 'Blocks one hit every 30 / 22 / 15 seconds by rank.',
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
      detail: 'Each rank calls another spirit wolf. They chase down the nearest enemies and maul them - bites deal area damage that scales with your damage and level.',
      apply: () => { WS.Familiar.add('wolf'); },
    },
    raise_dead: {
      name: 'Raise Dead', art: 'risen', quality: 'rare',
      description: 'Raise a ghoul to shamble after the horde.', max: 3,
      detail: 'Each rank raises another ghoul. Slower than a spirit wolf and slower to swing, but it hits far harder and its claws sweep a wider arc.',
      apply: () => { WS.Familiar.add('ghoul'); },
    },
    unholy_command: {
      name: 'Unholy Command', art: 'command', quality: 'epic',
      description: '+30% summon damage and +10% summon attack speed', max: 5,
      detail: 'Drives everything you have summoned - spirit wolves and ghouls alike - to strike harder and more often. Worthless without something to command.',
      offer: (p) => (p.upgradeLevels.spirit_companion || 0) > 0 || (p.upgradeLevels.raise_dead || 0) > 0,
      v: 0.30, haste: 0.10,
      apply: (p, up) => { p.summonDamage += up.v; p.summonHaste += up.haste; },
    },

    /* ------------------------------------------------ tank / defensive --- */
    thorns: {
      name: 'Thorns', art: 'thorn', quality: 'uncommon',
      description: 'Attackers take damage back - melee and ranged.', max: 5,
      detail: 'Any enemy that hits you - a melee swing OR a ranged bolt - takes 10 + 40% of that damage back per rank (even if you dodge or block). Ranged bolts reflect to the caster that fired them.',
      apply: (p) => { p.thornsRank += 1; },
    },
    desecration: {
      name: 'Desecration', art: 'desecrate', quality: 'epic',
      description: '+15% of your healing lashes out as shadow damage', max: 5, v: 0.15,
      detail: 'Healing you cannot use rots instead of going to waste: overheal erupts around you, and a growing share of the healing that does land strikes with it. Feeds on regeneration, lifesteal, and healing weapons.',
      offer: (p) => p.desecration > 0 || p.healthRegen > 0 || p.lifesteal > 0,
      apply: (p, up) => {
        p.desecration += 1;
        p.desecrationOverheal = WS.max(p.desecrationOverheal, WS.Config.desecrationOverheal);
        p.desecrationShare += up.v;
      },
    },
    soul_rending: {
      name: 'Soul Rending', art: 'soulrend', quality: 'epic',
      description: '+25% fel from overkill, and +1s of Metamorphosis', max: 5, v: 0.25,
      detail: 'Every scrap of overkill feeds the fel faster, and the transformation holds a second longer per rank.',
      offer: (p) => p.felAttuned > 0,
      apply: (p) => { p.soulRending += 1; },
    },
    retribution: {
      name: 'Retribution Aura', art: 'retaura', quality: 'rare',
      description: 'A holy aura sears nearby enemies.', max: 4,
      detail: 'Burns enemies around you twice per second (damage and radius grow with rank, damage%, and effect area). Lets tanks deal damage while standing firm.',
      apply: (p) => { p.retRank += 1; },
    },
    dodge: {
      name: 'Evasion', art: 'feint', quality: 'uncommon',
      description: '+8% chance to avoid a hit entirely.', max: 4, v: 0.08,
      detail: 'Each rank adds a chance to completely dodge an incoming hit. Stacks with armor and blocks.',
      apply: (p, up) => { p.dodgeChance += up.v; },
    },
  };

  WS.UpgradeOrder = [
    'might', 'haste', 'fleetfoot', 'magnet', 'vitality', 'armor', 'precision',
    'ferocity', 'area', 'quantity', 'luck', 'wisdom', 'recovery', 'velocity',
    'dark_bargain', 'divine_bulwark', 'chilling_presence', 'spirit_companion',
    'thorns', 'retribution', 'dodge', 'desecration', 'soul_rending',
    'raise_dead', 'unholy_command',
  ];

})(window.WS);
