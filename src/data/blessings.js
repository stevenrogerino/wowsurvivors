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
      description: '+{area%}% Area on every weapon: the same stat Expanse raises.',
      area: 0.15,
      apply: (p, b) => { p.areaMultiplier += b.area; },
    },
    fortune: {
      name: 'Gift of the Hourglass', art: 'hourglass', quality: 'rare',
      description: '+{gold%}% gold found and +{luck%}% luck.',
      gold: 0.20, luck: 0.075,
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
      description: 'Your projectiles drain life: heal for {lifesteal%}% of the damage they deal, up to {Config.lifestealCapPct%}% of your max health each second.',
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
      description: 'Every {killInterval} kills restore {healPct%}% +{healFlat} health, at most once every {Config.bloodthirstCooldown}s. The horde is your medicine.',
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
    /* THE CALLINGS - the first eight survivors' own powers, run by
       src/game/callings.js with their numbers in Config under CALLINGS. Like
       the four above them, anyone can take one; the survivor it belongs to
       (characters.js) is a quarter further along one number of it. The
       description says how to get there; `detail`, in the hover tooltip,
       says what you get. */
    arcane_surge: {
      name: 'Spellflood', art: 'arcane', quality: 'legendary',
      description: 'Every gem you gather swells the Flood. Full, all your weapons fire at once and the tide runs fast for a while.',
      detail: 'Flood tide, {Config.surgeDuration}s: weapons {Config.surgeCooldownMult~%}% faster\n'
        + 'The Flood needs more gems as the night goes on\n'
        + 'Baron Zul fills it {Config.callingEdge%}% faster',
      apply: (p) => { p.overflowAttuned += 1; },
    },
    radiant_barrier: {
      name: 'Radiant Barrier', art: 'ankh', quality: 'legendary',
      description: 'Healing you cannot use is not wasted: it becomes a barrier that takes hits before you do, and bursts as Light when it breaks.',
      detail: 'All overheal and {Config.barrierFromHeal%}% of healing that lands feed the barrier\n'
        + 'Holds up to {Config.barrierCapPct%}% of your max health\n'
        + 'After it takes a hit it stops refilling for {Config.barrierDelay}s; broken, it stays down for {Config.barrierBrokenDelay}s\n'
        + 'Broken after filling past {Config.barrierBurstMin%}%, it sears everything near you\n'
        + "Chid's barrier holds {Config.callingEdge%}% more",
      apply: (p) => { p.barrierAttuned += 1; },
    },
    opportunist: {
      name: 'Opportunist', art: 'mask', quality: 'legendary',
      description: 'Critical hits build your Edge. At full, a Cutthroat blow on the toughest thing near you, and you Slip out of sight for a moment.',
      detail: '{Config.comboNeed} Edge, at most one every {Config.comboGate}s\n'
        + 'Cutthroat: a critical strike that grows with level and Damage\n'
        + 'Slip: untouchable for {Config.vanishTime}s, then {Config.comboLock}s to regroup\n'
        + 'Rav builds Edge {Config.callingEdge%}% faster',
      apply: (p) => { p.comboAttuned += 1; },
    },
    quarry: {
      name: 'The Quarry', art: 'crosshair', quality: 'legendary',
      description: 'Every few seconds the toughest enemy in sight becomes your Quarry. It takes more from everything, and bringing it down readies every weapon and mends you.',
      detail: 'A new Quarry every {Config.markEvery}s, held up to {Config.markLife}s (a boss only when nothing else is near)\n'
        + 'Quarry: +{Config.markBonus%}% damage taken (bosses +{Config.markBossBonus%}%)\n'
        + 'The kill: every weapon ready, +{Config.markHeal%}% health\n'
        + 'Maeca finds her Quarry {Config.callingEdge%}% sooner',
      apply: (p) => { p.markAttuned += 1; },
    },
    seething_blood: {
      name: 'Seething Blood', art: 'claw', quality: 'legendary',
      description: 'Every blow you take heats your blood, and every kill at arm\'s length. The heat is armor and fury. Fill it and you Boil Over.',
      detail: 'Heat: up to +{Config.rageArmor} armor and +{Config.rageDamage%}% damage; it cools when the blows stop\n'
        + 'Boil Over, {Config.enrageTime}s: +{Config.enrageArmor} armor, +{Config.enrageDamage%}% damage, thorns x{Config.enrageThorns}, mending {Config.enrageRegen%}% health a second\n'
        + 'AAAAAAAAA heats {Config.callingEdge%}% faster',
      apply: (p) => { p.rageAttuned += 1; },
    },
    reapers_tithe: {
      name: "Reaper's Tithe", art: 'skull', quality: 'legendary',
      description: 'Every kill pays into the Tithe. Over half paid it empowers you; paid in full, a Reaping tears at everything near and heals you for it.',
      detail: 'Over half paid: +{Config.soulEmpower%}% damage\n'
        + 'The Reaping heals {Config.rendHealPer%}% of max health per enemy struck (up to {Config.rendHealCap%}%)\n'
        + 'After a Reaping the Tithe rests {Config.soulLock}s before it gathers again\n'
        + 'The Tithe asks more as the night goes on\n'
        + "Nim's Tithe fills {Config.callingEdge%}% faster",
      apply: (p) => { p.soulAttuned += 1; },
    },
    waystones: {
      name: 'Waystones', art: 'totem', quality: 'legendary',
      description: 'Three stones, each built by how you fight: the Ember by damage dealt close, the Spring by healing, the Gale by ground covered. Full, it rises where you stand.',
      detail: 'Each stands {Config.totemLife}s; a new one of a kind replaces the old\n'
        + 'Ember: erupts as it rises, then burns everything near it\n'
        + 'Spring: rains pools near you; standing in one mends {Config.springPoolHeal%}% health a second\n'
        + 'Gale: weapons {Config.totemHaste~%}% faster while you are near\n'
        + "Vonnra's stones reach {Config.callingEdge%}% farther",
      apply: (p) => { p.totemAttuned += 1; },
    },
    conviction: {
      name: 'Conviction', art: 'sun', quality: 'legendary',
      description: 'Blows you take and healing you receive build Conviction. At {Config.holyNeed}, Judgement falls on the whole field and an Aegis covers you.',
      detail: 'A hit taken: {Config.holyPerHit} Conviction. Every {Config.holyHealPct%}% of your health healed: one more\n'
        + 'Judgement: every creature on the field struck down, and bosses lose {Config.judgementBossPct%}% of their health. Aegis: untouchable for {Config.divineShield}s\n'
        + 'Then {Config.holyLock}s to gather again\n'
        + 'Keegan builds Conviction {Config.callingEdge%}% faster',
      apply: (p) => { p.holyAttuned += 1; },
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
      /* What the monster IS, shown in the card's hover tooltip (not on the
         card, which stays its usual height). The line above says how to get
         there and the card never said what you get. */
      detail: 'Ruinform, {Config.metaDuration}s: x{Config.metaDamageMult} damage · weapons {Config.metaCooldownMult~%}% faster · wider beams\n'
        + 'Then the ruin rests {Config.metaRecovery}s ({Config.metaRecoveryBorn}s for a Ruinseeker)\n'
        + 'Ruin Hunger: longer form, shorter rest',
      felGain: 0.30,
      apply: (p, b) => {
        p.felAttuned += 1; p.felBonus += b.felGain;
        // Ruinborn is what only the Ruinseeker's own oath grants - see characters.js.
        if (p.characterId === 'ruinseeker') p.ruinborn += 1;
      },
    },
    /* The two newest identity powers - src/game/primal.js runs them, and the
       numbers behind both are in Config under WILDSHAPE and STILLWATER. */
    wildshape: {
      name: 'The Old Shapes', art: 'paw', quality: 'legendary',
      description: 'The hunt wakes the beast in you. Every kill feeds the Wild, close kills twice over; fill it and you take the shape your arsenal leans to: a Bear if you fight with steel, an Owlbear if you fight with spells.',
      detail: 'Bear (steel): -{Config.bearMitigation%}% damage taken · +{Config.bearPhysical%}% physical damage · a maul around you every {Config.maulEvery}s · {Config.bearMoveMult~%}% slower\n'
        + 'Owlbear (spells): +{Config.owlMagic%}% spell damage · weapons {Config.owlCooldownMult~%}% faster · a falling star every {Config.owlStarEvery}s\n'
        + 'Evenly balanced? A coin toss, every time.\n'
        + 'A shape lasts {Config.formDuration}s, then the Wild sleeps {Config.wildLock}s. Your weapons keep firing.',
      apply: (p) => { p.wildAttuned += 1; },
    },
    stillwater: {
      name: 'Stillwater Step', art: 'step', quality: 'legendary',
      description: 'You are not where the blow lands. {Config.flowSteps} steps: a hit you would take becomes a step through it, a palm on everything you pass, and a stack of Poise (+{Config.poiseDamage%}% damage each). Steps come back on their own.',
      apply: (p) => {
        p.flowAttuned += 1;
        p.flowSteps = WS.Primal.maxSteps(p);
      },
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
    'ruinous_pact', 'unyielding', 'wildshape', 'stillwater',
    'arcane_surge', 'radiant_barrier', 'opportunist', 'quarry', 'seething_blood', 'reapers_tithe', 'waystones', 'conviction',
  ];

})(window.WS);
