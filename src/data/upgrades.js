/* In-run passive boons offered on level-up. `apply(player, up)` reads its
 * magnitude from the upgrade's own `v`, so one number retunes the passive. */
'use strict';
(function (WS) {

  WS.Upgrades = {
    might: {
      name: 'Might', art: 'fist', quality: 'common',
      description: '+{v%}% Damage on every weapon', max: 5, v: 0.10,
      detail: 'Multiplies the damage of every weapon you carry.',
      apply: (p, up) => { p.damageMultiplier += up.v; },
    },
    haste: {
      name: 'Haste', art: 'wing', quality: 'common',
      description: '-{v~%}% Cooldown on every weapon', max: 5, v: 0.92,
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
      description: '+{v} armor (diminishing damage reduction)', max: 5, v: 3,
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
      description: '+{v%}% Area', max: 5, v: 0.12,
      detail: 'Area is one stat, shared with Grace of the Moon. It makes novas, fields, orbits, '
        + 'storms and auras bigger, and gives chains, beams and palms longer reach. It never adds damage.',
      apply: (p, up) => { p.areaMultiplier += up.v; },
    },
    quantity: {
      name: 'Duplicity', art: 'triple', quality: 'rare',
      description: '+{v} Projectile', max: 3, v: 1,
      detail: 'A projectile is one of whatever a weapon sends out: a bolt, arrow, knife, axe, ricochet, '
        + 'storm strike, chain leap, palm, beast or ring. Novas, fields, auras and beams send out none, so this does nothing for them.',
      apply: (p, up) => { p.projectileBonus += up.v; },
    },
    luck: {
      name: 'Fortune', art: 'coin', quality: 'uncommon',
      description: '+{v%}% luck (better and more drops)', max: 4, v: 0.075,
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
      heals: true,
      apply: (p, up) => { p.healthRegen += up.v; },
    },
    velocity: {
      name: 'Velocity', art: 'spear', quality: 'common',
      description: '+{v%}% Projectile speed, and they hit {hit%}% harder', max: 3, v: 0.15, hit: 0.075,
      detail: 'Bolts, arrows, knives, shields, rings and beasts travel faster, so they reach foes sooner, and strike harder for it. No effect on anything that does not travel.',
      apply: (p, up) => { p.projectileSpeed += up.v; p.projectileImpact = (p.projectileImpact || 0) + up.hit; },
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
      detail: 'Slows non-boss enemies within a widening frost aura (stronger and wider per rank). The aura grows with Area (Expanse, Grace of the Moon).',
      apply: (p) => { p.chillRank += 1; },
    },
    spirit_companion: {
      name: 'Spirit Companion', art: 'spiritwolf', quality: 'rare',
      description: 'Summon a spirit wolf. The pack runs down bosses, elites and archers.', max: 3,
      detail: 'Each rank calls another spirit wolf. Fast, and far-ranging. When a boss, an elite or something that shoots is in reach, the whole pack goes for it, and every wolf already on it makes the next bite {Familiar.tuning.packBonus%}% harder. A pounce mauls what is around the quarry for less. Otherwise each wolf works the herd on its own. Scales with your damage and level.',
      apply: () => { WS.Familiar.add('wolf'); },
    },
    grave_call: {
      name: 'Grave Call', art: 'risen', quality: 'rare',
      description: 'Raise a ghoul to guard you. Its claws slow and rot what they rake.', max: 3,
      detail: 'Each rank raises another ghoul. Slow, and it stays close, turning on whatever is nearest you. Its claws sweep a wide arc, slow what they hit by {Familiar.tuning.ghoulSlow~%}% and leave it rotting: rotting creatures take {Familiar.tuning.ghoulRot*%}% more damage from everything, yours included, for {Familiar.tuning.ghoulRotTime}s. A ghoul with nothing near you to rake for {Familiar.tuning.ghoulRestless}s breaks loose, one at a time: it runs to the thickest of the crowd and bursts there, rotting everything around it for {Familiar.tuning.ghoulBurstMult}x a rake, and rises again at your side {Familiar.tuning.ghoulRespawn}s later. Scales with your damage and level.',
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
      description: 'Every rank: attackers take {Config.thornsFlat} + {Config.thornsDamagePct%}% of their blow back, melee and ranged', max: 5,
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
        + 'and the ruin rests {Config.metaRecoveryPerRank}s less after it', max: 5,
      detail: 'For the Ruinous Pact. Ruinform is x{Config.metaDamageMult} damage and '
        + '{Config.metaCooldownMult~%}% faster weapons; every rank fills it faster, holds it a second longer '
        + 'and shortens the rest after it, down to {Config.metaRecoveryFloor}s '
        + '({Config.metaRecoveryBornFloor}s for a Ruinseeker).',
      offer: (p) => p.felAttuned > 0,
      apply: (p) => { p.soulRending += 1; },
    },
    primal_kinship: {
      name: 'Primal Kinship', art: 'paw', quality: 'epic',
      description: '+{Config.wildPerRank%}% Wild from every kill, +{Config.formDurationPerRank}s in a shape, '
        + '+{Config.kinshipDamage%}% damage while you wear one, and the Wild wakes {Config.wildLockPerRank}s sooner', max: 5,
      detail: 'For The Old Shapes. Every rank makes the Bear and the Owlbear come sooner, last longer and '
        + 'hit harder, and shortens the Wild\'s sleep after a shape (never below {Config.wildLockFloor}s). '
        + 'What the shapes themselves give is on the blessing.',
      offer: (p) => p.wildAttuned > 0,
      apply: (p) => { p.kinship += 1; },
    },
    serenity: {
      name: 'Serenity', art: 'step', quality: 'epic',
      description: 'Steps return {Config.flowRechargePerRank}s sooner and palm {Config.serenityStrike%}% harder; '
        + 'a third step at rank {Config.serenityThirdStep} and a fourth at rank {Config.serenityFourthStep}', max: 5,
      detail: 'Stillwater Step, deepened: every rank shortens the wait for a step (never below '
        + '{Config.flowRechargeFloor}s) and strengthens the palm that lands along it.',
      offer: (p) => p.flowAttuned > 0,
      apply: (p) => {
        const before = WS.Primal.maxSteps(p);
        p.serenity += 1;
        p.flowSteps += WS.Primal.maxSteps(p) - before;
      },
    },
    /* ------------------------------------------- the callings' passives ---
       One for each of the eight callings (callings.js), as Ruin Hunger,
       Primal Kinship and Serenity are for theirs: offered once you hold the
       calling. Four also carry over, offered to a build that could use their
       smaller half without the calling, as Curdled Light is; with the calling
       only the calling's half applies. Every number is in Config. */
    undertow: {
      name: 'Undertow', art: 'arcane', quality: 'epic', max: 5, calling: 'overflowAttuned',
      description: 'The Flood fills {Config.undertowFill%}% faster and its tide runs {Config.undertowTide}s longer',
      alone: 'Every {Config.undertowGems} gems you gather cut {Config.undertowCut%}% off your slowest weapon\'s wait',
      detail: 'For Spellflood, and offered once you take Greed\'s Pull too. Without Spellflood it works on its own: '
        + 'every {Config.undertowGems} gems cut {Config.undertowCut%}% per rank off the wait of whichever weapon has longest left, '
        + 'so at full ranks the gems ready it outright. With Spellflood, only the Flood\'s half applies.',
      offer: (p) => p.undertow > 0 || p.overflowAttuned > 0 || (p.upgradeLevels.magnet || 0) > 0,
      apply: (p) => { p.undertow += 1; },
    },
    hallowed: {
      name: 'Hallowed Mending', art: 'ankh', quality: 'epic', max: 5, calling: 'barrierAttuned',
      description: 'Your barrier holds {Config.hallowedCap%}% more, and bursts {Config.hallowedBurst%}% harder and {Config.hallowedReach%}% wider',
      alone: 'Healing you cannot use becomes a Ward of up to {Config.hallowedWard%}% of your max health',
      heals: true,
      detail: 'For Radiant Barrier, and offered once anything heals you: regeneration, lifesteal or a healing weapon. '
        + 'Without the calling it works on its own: overheal becomes a Ward of up to {Config.hallowedWard%}% of your max health '
        + 'per rank. It takes hits before your health does and stops refilling while it is being struck, like the barrier, '
        + 'but it never bursts. With Radiant Barrier, only the barrier\'s half applies.',
      offer: (p) => p.hallowed > 0 || p.barrierAttuned > 0 || p.healthRegen > 0 || p.lifesteal > 0
        || p.weapons.some((w) => (WS.Weapons[w.id] || {}).healPer > 0),
      apply: (p) => { p.hallowed += 1; },
    },
    ruthless: {
      name: 'Ruthless', art: 'mask', quality: 'epic', max: 5, calling: 'comboAttuned',
      description: '+{Config.ruthlessEdge%}% Edge from a crit, a Cutthroat {Config.ruthlessBlow%}% harder, and {Config.ruthlessRegroup}s less to regroup',
      alone: 'A crit that leaves an ordinary creature under {Config.ruthlessExecute%}% health per rank finishes it',
      detail: 'For Opportunist, and offered once you take Precision. Without the calling it works on its own: a critical '
        + 'strike finishes a creature it leaves below {Config.ruthlessExecute%}% of its health per rank. It never touches '
        + 'elites, bosses or the finales. With Opportunist, only the Cutthroat\'s half applies.',
      offer: (p) => p.ruthless > 0 || p.comboAttuned > 0 || (p.upgradeLevels.precision || 0) > 0,
      apply: (p) => { p.ruthless += 1; },
    },
    stalker: {
      name: 'Stalker\'s Patience', art: 'crosshair', quality: 'epic',
      description: 'A Quarry {Config.stalkerHaste%}% sooner, held {Config.stalkerLife}s longer, and it takes {Config.stalkerBonus%}% more from everything', max: 5,
      detail: 'For The Quarry. Every rank finds the next Quarry sooner, keeps it marked longer, and makes the mark bite harder, '
        + 'bosses included.',
      offer: (p) => p.markAttuned > 0,
      apply: (p) => { p.stalker += 1; },
    },
    slow_burn: {
      name: 'Slow Burn', art: 'claw', quality: 'epic', max: 5, calling: 'rageAttuned',
      description: 'Heat builds {Config.slowBurnHeat%}% faster and cools {Config.slowBurnCool%}% slower, and you Boil Over {Config.slowBurnBoil}s longer',
      alone: 'Every blow you take Smoulders: +{Config.slowBurnStack%}% damage a stack, up to {Config.slowBurnMax}',
      detail: 'For Seething Blood, and offered once you take Thorns or Ironhide. Without the calling it works on its own: '
        + 'every blow that lands is a stack of Smoulder, +{Config.slowBurnStack%}% damage per rank, up to {Config.slowBurnMax} '
        + 'stacks, all gone {Config.slowBurnTime}s after the last blow. A dodged or blocked blow does not count. '
        + 'With Seething Blood, only the heat\'s half applies.',
      offer: (p) => p.slowBurn > 0 || p.rageAttuned > 0 || p.thornsRank > 0 || (p.upgradeLevels.armor || 0) > 0,
      apply: (p) => { p.slowBurn += 1; },
    },
    bountiful: {
      name: 'Bountiful Tithe', art: 'skull', quality: 'epic',
      description: 'The Tithe fills {Config.bountifulFill%}% faster; a Reaping reaches {Config.bountifulReach%}% wider '
        + 'and may heal {Config.bountifulHeal%}% more of your health', max: 5,
      heals: true,
      detail: 'For Reaper\'s Tithe. Every rank brings the Reaping sooner, widens it and raises the most it can heal you.',
      offer: (p) => p.soulAttuned > 0,
      apply: (p) => { p.bountiful += 1; },
    },
    deep_roots: {
      name: 'Deep Roots', art: 'totem', quality: 'epic',
      description: 'Waystones stand {Config.deepRootsLife}s longer and reach {Config.deepRootsReach%}% farther; '
        + 'at rank {Config.deepRootsPair}, two of each kind stand at once', max: 5,
      detail: 'For Waystones. With two of a kind standing, two embers burn twice and two springs rain twice as many pools; '
        + 'two gales still hasten once, over more ground.',
      offer: (p) => p.totemAttuned > 0,
      apply: (p) => { p.deepRoots += 1; },
    },
    fervor: {
      name: 'Fervor', art: 'sun', quality: 'epic',
      description: 'Conviction builds {Config.fervorBuild%}% faster, Judgement takes {Config.fervorJudge%}% more of a boss, '
        + 'the Aegis holds {Config.fervorAegis}s longer', max: 5,
      detail: 'For Conviction. Every rank brings the Judgement sooner, and makes it and the Aegis after it count for more.',
      offer: (p) => p.holyAttuned > 0,
      apply: (p) => { p.fervor += 1; },
    },
    serration: {
      name: 'Serration', art: 'bleed', quality: 'uncommon',
      description: 'Critical strikes open a wound that bleeds {Config.serrationShare%}% of the blow per rank', max: 4,
      detail: 'The bleed runs over {Config.bleedTime}s and ticks every {Config.bleedTick}s. A fresh crit reopens the wound at whichever bleed is worse, so it rewards crit chance and big hits alike.',
      apply: (p) => { p.serration += 1; },
    },
    perennial: {
      name: 'Perennial', art: 'perennial', quality: 'common',
      description: '+{v%}% Duration', max: 5, v: 0.10,
      detail: 'Zones, gyres, beasts and anything else with a lifetime stays on the field longer. It does not change how often a weapon fires.',
      apply: (p, up) => { p.durationMult += up.v; },
    },
    searing: {
      name: 'Searing Aura', art: 'retaura', quality: 'rare',
      description: 'A holy aura sears nearby enemies.', max: 4,
      detail: 'Burns enemies around you twice per second. Damage grows with rank, Damage and your armor (+{Config.retributionArmorScale%}% per point); the radius grows with rank and Area. The heavier the tank, the hotter it burns.',
      apply: (p) => { p.retRank += 1; },
    },
    dodge: {
      name: 'Evasion', art: 'feint', quality: 'uncommon',
      description: '+{v%}% chance to avoid a hit entirely.', max: 4, v: 0.08,
      detail: 'Each rank adds a chance to completely dodge an incoming hit. Stacks with armor and blocks.',
      apply: (p, up) => { p.dodgeChance += up.v; },
    },
  };

  /** What a passive's card says to THIS survivor. A calling's passive that
   *  also works alone (`alone`) says whichever half they would get: the
   *  calling's if they hold it, its own if they do not. Without a survivor
   *  (the wiki, the codex) it is the calling's. */
  WS.upgradeText = function (up, p) {
    const own = up.alone && p && !(p[up.calling] > 0);
    return WS.template(own ? up.alone : up.description, up);
  };

  WS.UpgradeOrder = [
    'might', 'haste', 'fleetfoot', 'magnet', 'vitality', 'armor', 'precision',
    'ferocity', 'area', 'quantity', 'luck', 'wisdom', 'recovery', 'velocity',
    'dark_bargain', 'warding_light', 'chilling_presence', 'spirit_companion',
    'thorns', 'searing', 'dodge', 'curdled', 'ruin_hunger',
    'grave_call', 'dread_command', 'primal_kinship', 'serenity',
    'serration', 'perennial',
    'undertow', 'hallowed', 'ruthless', 'stalker', 'slow_burn', 'bountiful', 'deep_roots', 'fervor',
  ];

})(window.WS);
