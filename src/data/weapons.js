/* Weapon definitions. `behavior` selects a handler in src/game/weapon.js:
 *   aimed | spray | ring | nova | zone | chain | orbit | storm | bounce | beam
 * Weapons rank to 8; a rank-8 weapon whose `evolvePairing` passive has been
 * learned may evolve. `art` names a procedural projectile sprite.
 *
 * `bossDamage` multiplies what a weapon does to bosses, elites and the
 * finales' machines and parts (Enemy.hit). Weapons built for crowds hit one
 * big target softly; these factors were set from what each weapon measurably
 * did to late scheduled bosses at rank 7+, so every weapon lands within a
 * few times of the others single-target. Absent means 1. */
'use strict';
(function (WS) {

  WS.Weapons = {
    seeking_motes: {
      bossDamage: 1.7,
      name: 'Seeking Motes', school: 'arcane', behavior: 'aimed', art: 'missile',
      cooldown: 0.934, damage: 5.46, speed: 337, projectiles: 3, pierce: 2, range: 560,
      homing: true, life: 2.2, radius: 6, burst: true,
      description: 'A rapid volley of small seeking motes that curve through the crowd.',
      evolveName: 'Mote Cascade', evolvePairing: 'quantity',
      evolveDescription: 'The motes multiply beyond counting.',
    },
    cinderfall: {
      name: 'Cinderfall', school: 'fire', behavior: 'aimed', art: 'ember',
      cooldown: 1.758, damage: 30.94, speed: 346, projectiles: 1, pierce: 0, range: 600,
      splash: 70, life: 2.4, radius: 10,
      description: 'A slow, heavy cinder that bursts on impact.',
      evolveName: 'Fallen Star', evolvePairing: 'area',
      evolveDescription: 'The cinder becomes a falling star.',
    },
    rimeshard: {
      bossDamage: 1.1,
      name: 'Rimeshard', school: 'frost', behavior: 'aimed', art: 'shard',
      cooldown: 1.209, damage: 18.2, speed: 364, projectiles: 1, pierce: 2, range: 580,
      slowFactor: 0.55, slowDuration: 2.0, life: 2.2, radius: 9,
      description: 'Bitter cold that slows whatever it strikes.',
      evolveName: 'Deepwinter', evolvePairing: 'haste',
      evolveDescription: 'Winter itself takes the field.',
    },
    arcweb: {
      bossDamage: 3.5,
      name: 'Arcweb', school: 'nature', behavior: 'chain',
      color: [0.55, 0.80, 1.00], art: 'spark',
      cooldown: 1.649, damage: 27.3, chains: 5, range: 250,
      description: 'Lightning that leaps from foe to foe.',
      evolveName: 'Skybreak', evolvePairing: 'precision',
      evolveDescription: 'The sky answers every call.',
    },
    dawnpulse: {
      bossDamage: 2.4,
      name: 'Dawnpulse', school: 'holy', behavior: 'nova', art: 'ring',
      cooldown: 2.638, damage: 27.3, radius: 150, expandTime: 0.35, knockback: 26,
      description: 'A ring of Light erupts outward from the survivor.',
      evolveName: 'Circle of Dawn', evolvePairing: 'vitality',
      evolveDescription: 'Each dawn mends the faithful.', evolvedHeal: 3,
    },
    verdant_lance: {
      bossDamage: 2.45,
      name: 'Verdant Lance', school: 'nature', behavior: 'beam', art: 'beam',
      cooldown: 1.429, damage: 20.02, range: 620, beamWidth: 26,
      metaWidthMult: 1.8, color: [0.55, 1.00, 0.20],
      description: 'A lance of green fire that burns everything standing in its path.',
      evolveName: 'Verdant Gaze', evolvePairing: 'dodge',
      evolveDescription: 'The gaze widens until the world is a line of green fire.',
    },
    grave_tether: {
      name: 'Grave Tether', school: 'shadow', behavior: 'aimed', art: 'coil',
      cooldown: 1.594, damage: 25.48, speed: 382, projectiles: 1, pierce: 2,
      range: 600, life: 2.4, radius: 10, heal: 4, color: [0.55, 0.20, 0.75],
      description: 'A coil of dark magic that wounds the living and knits your own flesh back together.',
      evolveName: 'Tether of Anguish', evolvePairing: 'wisdom',
      evolveDescription: 'The tether takes more, and gives more back.', evolvedHeal: 5,
    },
    blightfield: {
      name: 'Blightfield', school: 'shadow', behavior: 'zone', art: 'zone',
      cooldown: 4.286, damage: 11.83, radius: 130, duration: 4.5, tickRate: 0.45,
      color: [0.45, 0.85, 0.35],
      description: 'Corrupts the ground underfoot; anything standing in it rots.',
      evolveName: 'Blighted Earth', evolvePairing: 'chilling_presence',
      evolveDescription: 'The blight spreads wider the longer it feeds.', evolvedHeal: 1,
    },
    reaving_arc: {
      bossDamage: 2.9,
      name: 'Reaving Arc', school: 'shadow', behavior: 'nova', art: 'ring',
      cooldown: 2.418, damage: 30.94, radius: 130, expandTime: 0.28, knockback: 20,
      heal: 6, color: [0.85, 0.15, 0.20],
      description: 'A sweeping graveblade that carves health out of the wound it makes.',
      evolveName: 'Rend and Mend', evolvePairing: 'recovery',
      evolveDescription: 'The blade drinks deeper than any wound can hold.', evolvedHeal: 6,
    },
    hallowed_ring: {
      bossDamage: 1.7,
      name: 'Hallowed Ring', school: 'holy', behavior: 'zone', art: 'zone',
      cooldown: 3.956, damage: 10.01, radius: 120, duration: 4.0, tickRate: 0.5,
      description: "Hallows the ground beneath the survivor's feet.",
      evolveName: 'Hallowed Ground', evolvePairing: 'armor',
      evolveDescription: 'Sacred ground that shelters as it burns.', evolvedHeal: 1,
    },
    umbral_bolt: {
      name: 'Umbral Bolt', school: 'shadow', behavior: 'aimed', art: 'bolt',
      cooldown: 1.099, damage: 23.66, speed: 364, projectiles: 1, pierce: 2, range: 580,
      life: 2.4, radius: 9,
      description: 'Bolts of shadow that tear straight through ranks.',
      evolveName: 'Ruin Bolt', evolvePairing: 'might',
      evolveDescription: 'Ruin that nothing can stop.',
    },
    knifestorm: {
      bossDamage: 2.9,
      name: 'Knifestorm', school: 'physical', behavior: 'ring', art: 'dagger',
      cooldown: 1.429, damage: 16.38, speed: 346, projectiles: 6, pierce: 1,
      life: 0.9, radius: 8,
      description: 'A whirling ring of thrown steel.',
      evolveName: 'Steel Flurry', evolvePairing: 'fleetfoot',
      evolveDescription: 'The steel never stops moving.',
    },
    axe_gyre: {
      name: 'Axe Gyre', school: 'physical', behavior: 'orbit', art: 'axe',
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
      cooldown: 4.616, damage: 23.66, projectiles: 3, orbitRadius: 85, orbitSpeed: 4.2,
      duration: 3.2, radius: 20,
      description: 'Axes circle the survivor, shredding all who close in.',
      evolveName: 'Gyrestorm', evolvePairing: 'ferocity',
      evolveDescription: 'Become the storm of blades.',
    },
    volley: {
      bossDamage: 1.4,
      name: 'Volley', school: 'physical', behavior: 'spray', art: 'arrow',
      cooldown: 1.539, damage: 15.47, speed: 419, projectiles: 3, pierce: 2, range: 620,
      spread: 0.16, life: 1.7, radius: 8,
      description: 'A widening spread of hunting arrows.',
      evolveName: 'Arrowfall', evolvePairing: 'velocity',
      evolveDescription: 'The sky darkens with arrows.',
    },
    moonbrand: {
      name: 'Moonbrand', school: 'arcane', behavior: 'aimed', art: 'moon',
      cooldown: 1.319, damage: 21.84, speed: 291, projectiles: 1, pierce: 0, range: 560,
      homing: true, life: 2.6, radius: 9,
      description: 'Moonlit flame that tracks its prey.',
      evolveName: 'Moonfall', evolvePairing: 'magnet',
      evolveDescription: 'Moons fall wherever enemies gather.',
      evolvedBehavior: 'storm', strikes: 5, stormRadius: 230, splash: 60,
    },
    judgement_disc: {
      bossDamage: 2.45,
      name: 'Judgement Disc', school: 'holy', behavior: 'bounce', art: 'shield',
      cooldown: 2.308, damage: 27.3, speed: 391, projectiles: 1, bounces: 5, range: 600,
      life: 3.0, radius: 11,
      description: 'A hurled shield that ricochets between enemies.',
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
      bossDamage: 1.15,
      name: 'Iron Palms', school: 'physical', behavior: 'palm', art: 'palm',
      cooldown: 0.95, damage: 15, projectiles: 3, reach: 118, arc: 1.25, knockback: 14,
      waveReach: 2.8, waveDamage: 0.8, waveSpeed: 520,
      color: [0.58, 0.92, 0.76], evolvedColor: [1.0, 0.84, 0.48],
      description: 'A flurry of open-handed strikes at whatever is closest, each one a short cone that hits everything in it. With nothing in reach, a single palm of air is thrown instead.',
      evolveName: 'Temple Breaker', evolvePairing: 'dodge',
      evolveDescription: 'Every palm lands like the temple bell.',
    },
    spirit_herd: {
      bossDamage: 1.8,
      name: 'Spirit Herd', school: 'nature', behavior: 'herd', art: 'herd',
      cooldown: 2.6, damage: 21, speed: 330, projectiles: 2, pierce: 99, range: 620,
      life: 1.8, radius: 16, knock: 22, color: [0.62, 0.92, 0.55],
      description: 'Spirit beasts of the long pasture stampede from behind you toward the nearest foe, trampling everything in the way.',
      evolveName: 'The Great Herd', evolvePairing: 'perennial',
      evolveDescription: 'The herd does not end. It only thins.',
    },
    thornbloom: {
      name: 'Thornbloom', school: 'nature', behavior: 'zone', art: 'bloom',
      cooldown: 3.8, damage: 11, radius: 92, duration: 4.0, tickRate: 0.5,
      atTarget: true, slowFactor: 0.55, color: [0.52, 0.86, 0.38],
      description: 'Brambles burst up under the nearest crowd, tearing at everything caught in them and holding it slow.',
      evolveName: 'Everbloom', evolvePairing: 'thorns',
      evolveDescription: 'The brambles flower, and the flowers have thorns too.',
    },
    gale_chakram: {
      bossDamage: 1.4,
      name: 'Gale Chakram', school: 'physical', behavior: 'chakram', art: 'chakram',
      cooldown: 1.7, damage: 16, speed: 380, projectiles: 1, range: 330, life: 2.6, radius: 12,
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
      name: 'Firmament', school: 'arcane', behavior: 'storm', isUnion: true, art: 'moon',
      cooldown: 1.154, damage: 18.2, strikes: 8, stormRadius: 270, splash: 72, radius: 12,
      description: 'Sun and moon rain from the heavens without end.',
    },
    union_ruin: {
      name: 'Ruin Unbound', school: 'shadow', behavior: 'aimed', isUnion: true, art: 'chaos',
      cooldown: 0.989, damage: 25.48, speed: 428, projectiles: 2, pierce: 4, range: 620,
      splash: 82, homing: true, life: 2.6, radius: 12, color: [0.60, 0.30, 1.00],
      description: 'Ruin that devours everything in its path.',
    },
    union_steel: {
      bossDamage: 1.6,
      name: 'Storm of Steel', school: 'physical', behavior: 'ring', isUnion: true, art: 'dagger',
      cooldown: 0.934, damage: 16.38, speed: 400, projectiles: 12, pierce: 3, life: 1.1, radius: 9,
      description: 'An unending cyclone of thrown steel.',
    },
    union_sanctuary: {
      bossDamage: 3.7,
      name: 'Sanctuary', school: 'holy', behavior: 'nova', isUnion: true, art: 'ring',
      cooldown: 1.978, damage: 23.66, radius: 205, expandTime: 0.4, knockback: 34,
      description: 'The Light claims this ground as its own.',
    },
    union_stormcall: {
      name: 'Stormcall', school: 'nature', behavior: 'orbit', isUnion: true, art: 'sword',
      cooldown: 5.055, damage: 23.66, projectiles: 5, orbitRadius: 95, orbitSpeed: 5.0,
      duration: 4.0, radius: 22, procChain: 0.35, color: [0.45, 0.85, 1.00],
      description: 'Blessed blade of the Tempest: a cyclone of steel that answers every cut with lightning.',
    },
    union_tempest_kata: {
      bossDamage: 1.8,
      name: 'Tempest Kata', school: 'physical', behavior: 'palm', isUnion: true, art: 'palm',
      cooldown: 1.0, damage: 9, projectiles: 3, reach: 135, arc: 6.2832, knockback: 10,
      color: [0.78, 0.92, 1.0],
      description: 'Palm and ring become one form: strikes in every direction at once, and the wind they leave behind cuts too.',
    },
    union_wild_hunt: {
      bossDamage: 1.55,
      name: 'The Wild Hunt', school: 'nature', behavior: 'herd', isUnion: true, art: 'herd',
      cooldown: 1.9, damage: 22, speed: 360, projectiles: 5, pierce: 99, range: 640,
      life: 2.1, radius: 19, knock: 26, endBurst: 76, color: [0.55, 1.0, 0.25],
      description: 'The herd runs in green fire, and every beast that reaches the end of its run goes up in it.',
    },
    union_rotwood: {
      name: 'Rotwood', school: 'nature', behavior: 'zone', isUnion: true, art: 'bloom',
      cooldown: 3.1, damage: 11, radius: 130, duration: 5.0, tickRate: 0.45,
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
