/* Weapon definitions. `behavior` selects a handler in src/game/weapon.js:
 *   aimed | spray | ring | nova | zone | chain | orbit | storm | bounce | beam
 * Weapons rank to 8; a rank-8 weapon whose `evolvePairing` passive has been
 * learned may evolve. `art` names a procedural projectile sprite.
 *
 * `bossDamage` multiplies what a weapon does to bosses, elites and the
 * finales' machines and parts (Enemy.hit). Weapons built for crowds hit one
 * big target softly; these factors were set from what each weapon measurably
 * did to late scheduled bosses at rank 7+, so every weapon lands within a
 * few times of the others single-target. Absent means 1.
 *
 * `evolve*` on a weapon replaces the shared evolution bonus in Config
 * (evolveDamageMult, evolveProjectiles, evolvePierce, evolveChains,
 * evolveChainFalloff, evolveBounces, evolveStrikes, evolveOrbitBlades,
 * evolveAreaMult, evolveCooldownMult), and `evolveSplash` gives a splash
 * the weapon did not have. `rankDamageStep` is the damage a rank adds
 * (Config's 0.20 when absent).
 *
 * How these were set. At 20:00 on the hardest night (tools/slot-test.js:
 * 320 dummies standing where a real horde stands, and one drifting boss)
 * the evolved weapons ran from 3k to 552k a second on the crowd; they were
 * brought into one band on evolution and the unions. Then the whole night
 * (tools/rank-test.js: rank 1 at 1:00 to evolved at 20:00, each with that
 * minute's share of passives, against the crowd a kiting survivor faces
 * then, a boss, and the real waves) showed the same gap before evolving -
 * area weapons two to five times the average, chains, bounces and bolts a
 * fifth of it, 33x apart at 5:00. So base damage, rank growth, pierce, hops
 * and ricochets were fitted to a band per role at every stage (area high
 * on a crowd and low on a boss, bolts the reverse), with evolution re-set
 * so 20:00 held. A bot playing every survivor on the Pale Wastes,
 * Professional, Hyper lasted 1.5 to 12.8 minutes by starting weapon
 * before, and 5.0 to 11.4 after, with the same average. */
'use strict';
(function (WS) {

  /* A SECOND JOB COSTS DAMAGE. A weapon that heals, or slows, and deals as
   * much as one that only deals damage is simply better in every way - so
   * the weapons with a second job are held below the pure-damage ones on the
   * meter (tools/meter-test.js ROLES): healers at about 0.8 of the pure mean,
   * slows at about 0.92. Fitted in the real waves with every passive at its
   * cap (120 five-weapon builds), where Grave Tether and Blightfield had
   * been taking MORE than a fair share while healing best of all:
   *   Grave Tether 50.77 -> 35.54, Blightfield 1.8 -> 1.26, Hallowed Ring
   *   2.22 -> 1.954, Dawnpulse 19.1 -> 18.34, Reaving Arc 16.73 -> 18.74
   *   (it was below even the healers' mark), Thornbloom 2.07 -> 1.697,
   *   Rimeshard 33.15 -> 29.84. And the pure outliers, while fitting:
   *   Moonbrand 28.53 -> 24.25 and Skybreak's Arcweb 58.83 -> 51.77 (it
   *   topped the meter in 12 of 28 builds; now 3), Knifestorm 15.57 ->
   *   19.46 and Axe Gyre 9.02 -> 10.10, both low. Healers now 0.80-0.81 of
   *   the pure mean, slows 0.89-0.93, every pure weapon 19.4%-22.8%. */
  WS.Weapons = {
    seeking_motes: {
      damage: 8.84, evolveDamageMult: 0.649, bossDamage: 1.291, evolvedBossDamage: 2.644,
      name: 'Seeking Motes', school: 'arcane', behavior: 'aimed', art: 'missile',
      rankDamageStep: 0.293,
      cooldown: 0.934, speed: 337, projectiles: 4, pierce: 4, range: 560,
      homing: true, life: 2.2, radius: 6, burst: true,
      description: 'A rapid volley of small seeking motes that curve through the crowd.',
      evolveProjectiles: 6, evolvePierce: 4, evolveSplash: 11,
      evolveName: 'Mote Cascade', evolvePairing: 'quantity',
      evolveDescription: 'The motes multiply beyond counting.',
    },
    cinderfall: {
      damage: 29.61, evolveDamageMult: 1.354, bossDamage: 1.161, evolvedBossDamage: 1.73,
      name: 'Cinderfall', school: 'fire', behavior: 'aimed', art: 'ember',
      rankDamageStep: 0.1,
      cooldown: 1.758, speed: 346, projectiles: 1, pierce: 0, range: 600,
      splash: 70, life: 2.4, radius: 10,
      description: 'A slow, heavy cinder that bursts on impact.',
      evolveName: 'Fallen Star', evolvePairing: 'area',
      evolveDescription: 'The cinder becomes a falling star.',
    },
    rimeshard: {
      damage: 29.84, evolveDamageMult: 2.141, bossDamage: 1.31, evolvedBossDamage: 1.353,
      name: 'Rimeshard', school: 'frost', behavior: 'aimed', art: 'shard',
      rankDamageStep: 0.1,
      cooldown: 1.209, speed: 364, projectiles: 1, pierce: 6, range: 580,
      slowFactor: 0.55, slowDuration: 2.0, life: 2.2, radius: 9,
      description: 'Bitter cold that slows whatever it strikes.',
      evolveSplash: 12,
      evolveName: 'Deepwinter', evolvePairing: 'haste',
      evolveDescription: 'Winter itself takes the field.',
    },
    arcweb: {
      damage: 51.77, evolveDamageMult: 0.922, bossDamage: 0.864, evolvedBossDamage: 1.52, evolveChains: 14, evolveChainFalloff: 0.03,
      name: 'Arcweb', school: 'nature', behavior: 'chain',
      rankDamageStep: 0.45,
      color: [0.55, 0.80, 1.00], art: 'spark',
      cooldown: 1.649, chains: 10, range: 250,
      description: 'Lightning that leaps from foe to foe.',
      evolveCooldownMult: 0.5,
      evolveName: 'Skybreak', evolvePairing: 'precision',
      evolveDescription: 'The sky answers every call.',
    },
    dawnpulse: {
      damage: 18.34, evolveDamageMult: 4.902, bossDamage: 3.023, evolvedBossDamage: 2.939,
      name: 'Dawnpulse', school: 'holy', behavior: 'nova', art: 'ring',
      rankDamageStep: 0.258,
      cooldown: 2.638, radius: 150, expandTime: 0.35, knockback: 26,
      description: 'A ring of Light erupts outward from the survivor.',
      evolveName: 'Circle of Dawn', evolvePairing: 'vitality',
      evolveDescription: 'Each dawn mends the faithful.',
      // Heals per enemy struck, capped per pulse (Weapon.healOf).
      healPer: 3, evolvedHealPer: 2, healCap: 30, healCapRank: 8, evolvedHealCap: 44,
    },
    verdant_lance: {
      damage: 22.44, evolveDamageMult: 5.83, bossDamage: 1.439, evolvedBossDamage: 1.509,
      name: 'Verdant Lance', school: 'nature', behavior: 'beam', art: 'beam',
      rankDamageStep: 0.45,
      cooldown: 1.429, range: 620, beamWidth: 26,
      metaWidthMult: 1.8, color: [0.55, 1.00, 0.20],
      description: 'A lance of green fire that burns everything standing in its path.',
      evolveAreaMult: 3,
      evolveName: 'Verdant Gaze', evolvePairing: 'dodge',
      evolveDescription: 'The gaze widens until the world is a line of green fire.',
    },
    grave_tether: {
      damage: 35.54, evolveDamageMult: 2.1, bossDamage: 1.132, evolvedBossDamage: 1.276,
      name: 'Grave Tether', school: 'shadow', behavior: 'aimed', art: 'coil',
      rankDamageStep: 0.1,
      cooldown: 1.594, speed: 382, projectiles: 1, pierce: 6,
      range: 600, life: 2.4, radius: 10, color: [0.55, 0.20, 0.75],
      // Per enemy the coils strike, capped per volley: it used to have no cap.
      healPer: 5, evolvedHealPer: 4, healCap: 20, healCapRank: 6, evolvedHealCap: 18,
      /* Evolved, it mends in full at or below half health and tapers to this
         much of it at full; the rest is overheal (Curdled Light still eats
         it). Its ~59 a second from range was immortality while kiting. */
      evolvedHealTaper: 0.35,
      description: 'A coil of dark magic that wounds the living and knits your own flesh back together.',
      evolvePierce: 99,
      evolveName: 'Tether of Anguish', evolvePairing: 'wisdom',
      evolveDescription: 'The tether takes more, and gives back more the deeper you are hurt: full mending at half health or below, about a third at full health, and the rest is overheal.',
    },
    blightfield: {
      damage: 1.26, evolveDamageMult: 6.031, bossDamage: 6.219, evolvedBossDamage: 3.818,
      name: 'Blightfield', school: 'shadow', behavior: 'zone', art: 'zone',
      rankDamageStep: 0.211,
      cooldown: 4.286, radius: 130, duration: 4.5, tickRate: 0.45,
      color: [0.45, 0.85, 0.35],
      description: 'Corrupts the ground underfoot; anything standing in it rots.',
      evolveName: 'Blighted Earth', evolvePairing: 'chilling_presence',
      evolveDescription: 'The blight spreads wider the longer it feeds.',
      // While you stand in it: per enemy it rots, capped per tick. Refitted
      // when overlapping ground stopped paying out once per layer
      // (projectile.js): the old figures had the overlap priced in.
      healPer: 1.5, evolvedHealPer: 1.5, healCap: 5, healCapRank: 1.67, evolvedHealCap: 15.3,
    },
    reaving_arc: {
      damage: 18.74, evolveDamageMult: 5.93, bossDamage: 2.504, evolvedBossDamage: 2.452,
      name: 'Reaving Arc', school: 'shadow', behavior: 'nova', art: 'ring',
      rankDamageStep: 0.45,
      cooldown: 2.418, radius: 130, expandTime: 0.28, knockback: 20,
      color: [0.85, 0.15, 0.20],
      healPer: 3, evolvedHealPer: 2, healCap: 28, healCapRank: 7, evolvedHealCap: 43,
      description: 'A sweeping graveblade that carves health out of the wound it makes.',
      evolveName: 'Rend and Mend', evolvePairing: 'recovery',
      evolveDescription: 'The blade drinks deeper than any wound can hold.',
    },
    hallowed_ring: {
      damage: 1.954, evolveDamageMult: 6.298, bossDamage: 5.989, evolvedBossDamage: 3.719,
      name: 'Hallowed Ring', school: 'holy', behavior: 'zone', art: 'zone',
      rankDamageStep: 0.222,
      cooldown: 3.956, radius: 120, duration: 4.0, tickRate: 0.5,
      description: "Hallows the ground beneath the survivor's feet.",
      evolveName: 'Hallowed Ground', evolvePairing: 'armor',
      evolveDescription: 'Sacred ground that shelters as it burns.',
      // While you stand in it: per enemy it burns, capped per tick. Refitted
      // when overlapping ground stopped paying out once per layer
      // (projectile.js): the old figures had the overlap priced in.
      healPer: 3, evolvedHealPer: 2, healCap: 8, healCapRank: 3, evolvedHealCap: 14,
    },
    umbral_bolt: {
      damage: 30.51, evolveDamageMult: 2.057, bossDamage: 1.337, evolvedBossDamage: 1.427,
      name: 'Umbral Bolt', school: 'shadow', behavior: 'aimed', art: 'bolt',
      rankDamageStep: 0.1,
      cooldown: 1.099, speed: 364, projectiles: 1, pierce: 6, range: 580,
      life: 2.4, radius: 9,
      description: 'Bolts of shadow that tear straight through ranks.',
      evolvePierce: 99,
      evolveName: 'Ruin Bolt', evolvePairing: 'might',
      evolveDescription: 'Ruin that nothing can stop.',
    },
    knifestorm: {
      damage: 19.46, evolveDamageMult: 3.285, bossDamage: 2.787, evolvedBossDamage: 2.315,
      name: 'Knifestorm', school: 'physical', behavior: 'ring', art: 'dagger',
      rankDamageStep: 0.266,
      cooldown: 1.429, speed: 346, projectiles: 6, pierce: 4,
      life: 0.9, radius: 8,
      description: 'A whirling ring of thrown steel.',
      evolvePierce: 6, evolveProjectiles: 4,
      evolveName: 'Steel Flurry', evolvePairing: 'fleetfoot',
      evolveDescription: 'The steel never stops moving.',
    },
    axe_gyre: {
      damage: 10.1, evolveDamageMult: 10.15, bossDamage: 2.895, evolvedBossDamage: 0.707,
      name: 'Axe Gyre', school: 'physical', behavior: 'orbit', art: 'axe',
      rankDamageStep: 0.1,
      color: [0.85, 0.88, 0.96], evolvedColor: [1.00, 0.55, 0.25],
      /* Three blades and a shorter breath between gyres. Measured in the
         training ground, the old pair at a 5.5s cooldown cleared 8 of 282 at
         rank 1 against a median of 60, and 125 at rank 8 against a median of
         183 - last in the game while taking the most damage of any build.
         Most of that was the hit model, which tested for contact once every
         0.18s and shared one re-hit ledger across every blade, so a third
         blade would have bought exactly nothing; see Projectile.update. With
         each blade hitting what it sweeps through and keeping its own ledger,
         blades are worth something, and these two numbers put the weapon at
         164 with the second-lowest damage taken - a short-range orbiter that
         keeps things off you, rather than the worst weapon on the list. The
         cooldown stays above the duration on purpose: at 3.4 it measured 174
         but never stops turning, and the weapon loses its rhythm. */
      cooldown: 4.616, projectiles: 3, orbitRadius: 85, orbitSpeed: 4.2,
      duration: 3.2, radius: 20,
      description: 'Axes circle the survivor, shredding all who close in.',
      evolveOrbitBlades: 0,
      evolveName: 'Gyrestorm', evolvePairing: 'ferocity',
      evolveDescription: 'Become the storm of blades.',
    },
    volley: {
      damage: 19, evolveDamageMult: 2.029, bossDamage: 1.052, evolvedBossDamage: 1.74,
      name: 'Volley', school: 'physical', behavior: 'spray', art: 'arrow',
      rankDamageStep: 0.238,
      cooldown: 1.539, speed: 419, projectiles: 3, pierce: 6, range: 620,
      spread: 0.16, life: 1.7, radius: 8,
      description: 'A widening spread of hunting arrows.',
      evolvePierce: 30,
      evolveName: 'Arrowfall', evolvePairing: 'velocity',
      evolveDescription: 'The sky darkens with arrows.',
    },
    moonbrand: {
      damage: 24.25, evolveDamageMult: 1.955, bossDamage: 0.793, evolvedBossDamage: 1.13,
      name: 'Moonbrand', school: 'arcane', behavior: 'aimed', art: 'moon',
      rankDamageStep: 0.1,
      cooldown: 1.319, speed: 291, projectiles: 1, pierce: 0, range: 560,
      homing: true, life: 2.6, radius: 9,
      description: 'Moonlit flame that tracks its prey.',
      evolveStrikes: 0,
      evolveName: 'Moonfall', evolvePairing: 'magnet',
      evolveDescription: 'Moons fall wherever enemies gather.',
      evolvedBehavior: 'storm', strikes: 5, stormRadius: 230, splash: 60,
    },
    judgement_disc: {
      damage: 31.36, evolveDamageMult: 0.583, bossDamage: 2.18, evolvedBossDamage: 6.352,
      name: 'Judgement Disc', school: 'holy', behavior: 'bounce', art: 'shield',
      rankDamageStep: 0.45,
      cooldown: 2.308, speed: 391, projectiles: 1, bounces: 12, range: 600,
      life: 3.0, radius: 11,
      description: 'A hurled shield that ricochets between enemies.',
      evolveBounces: 30,
      evolveName: 'Reckoning', evolvePairing: 'luck',
      evolveDescription: 'Judgment finds every last one of them.',
    },

    /* ---- The Old Shapes and the Stillwater Step brought four more ---------
     *
     * Iron Palms is the first weapon in the game that has to be close to work
     * at all, so it is paid for that: its reach is a short cone and it does
     * the most per hit of anything its speed. Spirit Herd tramples a lane
     * wide enough to matter. Thornbloom is the first field that goes where
     * the crowd is rather than where you are. Gale Chakram cuts twice, out
     * and back. Every figure was fitted against the rest of the arsenal in
     * tools/sim.js, alone at rank 1 and rank 8. */
    iron_palms: {
      damage: 7.49, evolveDamageMult: 4.813, bossDamage: 0.991, evolvedBossDamage: 0.689,
      name: 'Iron Palms', school: 'physical', behavior: 'palm', art: 'palm',
      rankDamageStep: 0.152,
      cooldown: 0.95, projectiles: 3, reach: 118, arc: 1.25, knockback: 14,
      waveReach: 2.8, waveDamage: 0.8, waveSpeed: 520,
      color: [0.58, 0.92, 0.76], evolvedColor: [1.0, 0.84, 0.48],
      description: 'A flurry of open-handed strikes at whatever is closest, each one a short cone that hits everything in it. With nothing in reach, a single palm of air is thrown instead.',
      evolveName: 'Temple Breaker', evolvePairing: 'dodge',
      evolveDescription: 'Every palm lands like the temple bell.',
    },
    spirit_herd: {
      damage: 9.23, evolveDamageMult: 4.933, bossDamage: 4.869, evolvedBossDamage: 2.855,
      name: 'Spirit Herd', school: 'nature', behavior: 'herd', art: 'herd',
      rankDamageStep: 0.28,
      cooldown: 2.6, speed: 330, projectiles: 2, pierce: 99, range: 620,
      life: 1.8, radius: 16, knock: 22, color: [0.62, 0.92, 0.55],
      description: 'Spirit beasts of the long pasture stampede from behind you toward the nearest foe, trampling everything in the way.',
      evolveName: 'The Great Herd', evolvePairing: 'perennial',
      evolveDescription: 'The herd does not end. It only thins.',
    },
    thornbloom: {
      damage: 1.697, evolveDamageMult: 6.88, bossDamage: 3.383, evolvedBossDamage: 2.734,
      name: 'Thornbloom', school: 'nature', behavior: 'zone', art: 'bloom',
      rankDamageStep: 0.45,
      cooldown: 3.8, radius: 92, duration: 4.0, tickRate: 0.5,
      atTarget: true, slowFactor: 0.55, color: [0.52, 0.86, 0.38],
      description: 'Brambles burst up under the nearest crowd, tearing at everything caught in them and holding it slow.',
      evolveName: 'Everbloom', evolvePairing: 'thorns',
      evolveDescription: 'The brambles flower, and the flowers have thorns too.',
    },
    gale_chakram: {
      damage: 12.68, evolveDamageMult: 3.684, bossDamage: 2.167, evolvedBossDamage: 2.681,
      name: 'Gale Chakram', school: 'physical', behavior: 'chakram', art: 'chakram',
      rankDamageStep: 0.1,
      cooldown: 1.7, speed: 380, projectiles: 1, range: 330, life: 2.6, radius: 12,
      color: [0.78, 0.92, 1.0],
      description: 'A bladed ring thrown out on the wind. It cuts everything on the way out, turns, and cuts everything on the way back.',
      evolveName: 'Razorgale', evolvePairing: 'serration',
      evolveDescription: 'The ring splits the wind in two and comes back sharper.',
    },

    /* ---- Union super-weapons: never offered as ordinary new weapons ------
     *
     * TUNED AGAINST THE PAIR EACH ONE EATS, at roughly 82% of it. Below the
     * pair on purpose: merging hands a weapon slot back, and what goes in that
     * slot is the rest of the trade. Too far below and the deepest thing a
     * build can reach feels like a punishment.
     *
     * The numbers came from measuring effective damage - overkill clipped -
     * over twenty seconds of real waves ten minutes into a run, five seeds,
     * against the two evolved weapons the merge consumes. Not from dummies: a
     * ring of rooted immortal targets flatters persistent ground damage so
     * badly that it rated Sanctuary at 31% of its pair when a live fight rates
     * it 86%.
     *
     * MEASURED AT TWENTY-ONE MINUTES, not ten. A union cannot exist until two
     * weapons are at rank 8 AND evolved, so the fight it is balanced for is
     * the late one - where enemies carry far more health and a weapon that
     * looked fine at ten minutes can have fallen off badly. Firmament reads
     * 78% of its pair at 10:00 and 60% at 21:00; Stormcall reads 78% and then
     * 109%. Balancing these at the wrong minute balances a different weapon.
     *
     * COOLDOWN LAST. Cast rate changes how a weapon FEELS more than how strong
     * it is, so it is not the first knob to reach for - but it is the right
     * one when a weapon is genuinely rate-limited rather than reach-limited.
     * None of the five needed it. Each is tuned on whatever it is actually
     * limited by, and that turns out to be structural per behaviour:
     *
     *   storm   strikes   - each bolt already kills what it lands on, so what
     *                       limits Firmament is how much ground it covers.
     *                       +40% damage moved it three points.
     *   aimed   splash    - Ruin Unbound one-shots; its blast radius is reach.
     *   ring    knives    - same: coverage, not per-knife damage.
     *   nova    radius    - area goes as the square, so 205 -> 190 is -14%.
     *   orbit   blades    - Stormcall. Damage looked like the knob once (+40%
     *                       took it from 109% of its pair to 139%) and then
     *                       did nothing on a longer sample, which is how you
     *                       find out you were reading noise. A blade is a
     *                       coverage change and it moved consistently.
     *
     * The target is 82%, moved either way by how a union AGES - but only two of
     * the five were moved, because only two showed a signal bigger than the
     * measurement. Run to run, twenty seconds of real waves over several seeds
     * varies by about ten points; three of these sit between 73% and 92%,
     * which is inside that. Firmament at 60% and Stormcall at 109% are not,
     * and they are the two that changed. Fitting the middle three any closer
     * would be fitting noise, and the tuning bench is a better place to do it
     * with a longer sample than a comment block is to pretend otherwise.
     *
     * And CLEAR RATE is the target, not raw output. The two disagree: Ruin
     * Unbound measured 93% of its pair on effective damage while killing 106%
     * as many things, because it is a precision nuke that overkills what it
     * touches. Kills is what a player feels and it cannot be inflated by
     * overkill, so it is the number these were fitted to.
     *
     * Expect the response to be SUB-LINEAR. Slowing a weapon leaves more alive,
     * a denser field gives the next swing more to hit, and the ratio drifts
     * back: a 24% longer cooldown on Ruin Unbound bought only nine points.
     * Every change here is over-applied by about half to account for it.
     *
     * COOLDOWN is the knob, not damage. This deep into a run these weapons
     * already kill most of what they touch in one blow, so per-hit damage
     * mostly moves overkill: Ruin Unbound's damage was cut 42% in testing and
     * its effective output fell only from 102% to 91%. How often it goes off
     * is what actually limits it.
     */
    union_firmament: {
      bossDamage: 2.4,
      name: 'Firmament', school: 'arcane', behavior: 'storm', isUnion: true, art: 'moon',
      cooldown: 1.154, damage: 24.2, strikes: 8, stormRadius: 270, splash: 72, radius: 12,
      description: 'Sun and moon rain from the heavens without end.',
    },
    /* A tester: "every time I used it, it was 50% of my damage". Measured on
       the hardest night at 21:00 (tools/tune-unions.js): 148% of the pair it
       eats and 59% of a five-weapon build's meter, because homing, piercing,
       splashing bolts reach the crowd first and take every kill. Damage
       25.5 -> 20.4 and splash 82 -> 55 put it at 55% of its pair and 27% of
       the meter, beside Firmament. Then the weapons were brought into one
       band on evolution and every union set to what its two evolved parts
       did (tools/slot-test.js): 20.4 -> 37.9, since Umbral Bolt now pierces
       everything and the pair it eats is worth far more than it was. On
       the meter (tune-unions SHARE=1, 8 seeds) that is 16% of a build: the
       tester's half is gone. Storm of Steel, The Wild Hunt and Sanctuary,
       raised to their parts against dummies, took 47%, 33% and 30% in the
       real horde (fast and close, they reach the crowd first and take the
       kills), so they were trimmed; with Steel and Stormcall nudged back
       over check-unions' floor, every union sits at 18-29% of a build
       (8 seeds, and the same numbers move up to eight points run to run).

       And every one of those fits was made with NO passives, which is where
       Ruin Unbound hid. Two bolts, each a seeking, piercing, splashing nuke:
       Duplicity's three ranks took it to five, x1.85 (the median weapon
       gets x1.28), and Velocity and Expanse stack on top. A tester's build
       full of all three had it at the top of the meter; measured with every
       passive at its cap and its discoveries carried (tune-unions SHARE=1
       PASSIVES=... DISCOVER=1), it took 45% of a build. Three lighter bolts
       are the same union bare and a third less for each extra one: 37.9 x2
       -> 24 x3 put it at 34% of a full build (Wild Hunt 34%, Steel 28%) and
       17% of a bare one (tools/synergy-sweep.js shows every passive's gain). */
    union_ruin: {
      bossDamage: 1.95,
      name: 'Ruin Unbound', school: 'shadow', behavior: 'aimed', isUnion: true, art: 'chaos',
      cooldown: 0.989, damage: 24, speed: 428, projectiles: 3, pierce: 4, range: 620,
      splash: 55, homing: true, life: 2.6, radius: 12, color: [0.60, 0.30, 1.00],
      description: 'Ruin that devours everything in its path.',
    },
    union_steel: {
      bossDamage: 5.3,
      name: 'Storm of Steel', school: 'physical', behavior: 'ring', isUnion: true, art: 'dagger',
      cooldown: 0.934, damage: 25, speed: 400, projectiles: 12, pierce: 12, life: 1.1, radius: 9,
      description: 'An unending cyclone of thrown steel.',
    },
    /* With every passive at its cap, Sanctuary took 56% of a build's damage
       in the real horde (tune-unions SHARE=1 PASSIVES=... DISCOVER=1): a
       nova as wide as the ground the horde stands on, at Expanse's cap, kills
       whatever arrives before anything else can. Not raw power - on dummies
       it sat below the union median and weak on bosses - but reach. Radius
       alone moved it little (205 -> 170: 56% -> 46%, the denser field
       answering back); how often it goes off is what limits a nova that
       kills what it touches. Cooldown 1.978 -> 3.0 and radius 205 -> 185:
       36% of a full build (Ruin Unbound 35%, Wild Hunt 35%), 17% bare.
       The boss factor is raised by the cast rate lost (5.3 -> 8.0: 3095 ->
       2951 a second on the boss dummy). In a 21:00 field the heal is held by
       its cap per cast, not by what it strikes, and slower casts find more
       gathered: cap 130 -> 146 keeps the ~7 a second it mended before. */
    union_sanctuary: {
      bossDamage: 8.0,
      name: 'Sanctuary', school: 'holy', behavior: 'nova', isUnion: true, art: 'ring',
      cooldown: 3.0, damage: 109, radius: 185, expandTime: 0.4, knockback: 34,
      // Forged from the two holy healers, and it used to heal not at all:
      // taking it threw your healing away. It mends as they did together.
      healPer: 5, healCap: 146,
      description: 'The Light claims this ground as its own, and mends whoever keeps it.',
    },
    /* Stormcall ate Skybreak and Gyrestorm and was flat worse than them: in
       the real waves 61% of their damage and 29% of their kills, and 12% of a
       fully passived build, last of the unions. Some step down is the price
       of the slot a union frees; that was too much. Its limit was reach -
       the blades circle close, where Skybreak's chain had killed far out -
       and the fix is its own lightning, the half it took from Skybreak:
       blades 5 -> 7 and the chance a cut calls lightning 0.35 -> 0.5. */
    union_stormcall: {
      bossDamage: 2.5,
      name: 'Stormcall', school: 'nature', behavior: 'orbit', isUnion: true, art: 'sword',
      cooldown: 5.055, damage: 29, projectiles: 7, orbitRadius: 95, orbitSpeed: 5.0,
      duration: 4.0, radius: 22, procChain: 0.5, color: [0.45, 0.85, 1.00],
      description: 'Blessed blade of the Tempest: a cyclone of steel that answers every cut with lightning.',
    },
    union_tempest_kata: {
      bossDamage: 4.8,
      name: 'Tempest Kata', school: 'physical', behavior: 'palm', isUnion: true, art: 'palm',
      cooldown: 1.0, damage: 13.2, projectiles: 3, reach: 135, arc: 6.2832, knockback: 10,
      color: [0.78, 0.92, 1.0],
      description: 'Palm and ring become one form: strikes in every direction at once, and the wind they leave behind cuts too.',
    },
    union_wild_hunt: {
      bossDamage: 4.8,
      name: 'The Wild Hunt', school: 'nature', behavior: 'herd', isUnion: true, art: 'herd',
      cooldown: 1.9, damage: 46, speed: 360, projectiles: 5, pierce: 99, range: 640,
      life: 2.1, radius: 19, knock: 26, endBurst: 76, color: [0.55, 1.0, 0.25],
      description: 'The herd runs in green fire, and every beast that reaches the end of its run goes up in it.',
    },
    union_rotwood: {
      bossDamage: 3.2,
      name: 'Rotwood', school: 'nature', behavior: 'zone', isUnion: true, art: 'bloom',
      cooldown: 3.1, damage: 13.4, radius: 130, duration: 5.0, tickRate: 0.45,
      atTarget: true, slowFactor: 0.45, color: [0.60, 0.80, 0.28],
      description: 'A grove of blighted brambles grows up under the crowd and rots everything it holds.',
    },
  };

  // Shared level-up pool. Every class's starting weapon is findable by anyone.
  WS.WeaponOrder = [
    'seeking_motes', 'cinderfall', 'rimeshard', 'arcweb', 'dawnpulse',
    'hallowed_ring', 'umbral_bolt', 'knifestorm', 'axe_gyre', 'volley',
    'moonbrand', 'judgement_disc', 'reaving_arc', 'verdant_lance',
    'grave_tether', 'blightfield', 'iron_palms', 'spirit_herd', 'thornbloom',
    'gale_chakram',
  ];

  // Both sources must be fully evolved to merge; the union frees a slot.
  WS.Unions = [
    { result: 'union_firmament', from: ['seeking_motes', 'moonbrand'] },
    { result: 'union_ruin', from: ['cinderfall', 'umbral_bolt'] },
    { result: 'union_steel', from: ['knifestorm', 'volley'] },
    { result: 'union_sanctuary', from: ['dawnpulse', 'hallowed_ring'] },
    { result: 'union_stormcall', from: ['axe_gyre', 'arcweb'] },
    { result: 'union_tempest_kata', from: ['iron_palms', 'gale_chakram'] },
    { result: 'union_wild_hunt', from: ['spirit_herd', 'verdant_lance'] },
    { result: 'union_rotwood', from: ['thornbloom', 'blightfield'] },
  ];

})(window.WS);
