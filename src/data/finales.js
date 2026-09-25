/* The finales: what is waiting at 30:00.
 *
 * Holding until dawn used to be the whole game - reach thirty minutes and the
 * results panel slid up. Now dawn is where the story is. At 30:00 the first
 * light burns the horde off the field, the survivor gets thirty seconds and a
 * third blessing, and then whatever has been driving the night arrives in
 * person. Victory is beating it.
 *
 * THE ARC, one map at a time. The dark comes up out of the ground because
 * someone has been digging the ember out from under it:
 *
 *   Thornhollow   Foreman Grimtunnel, a lampling with a mining claim and a
 *                 war machine - the Candlecrawler. Beaten, he ejects and
 *                 floats off toward the Dustreach.
 *   Dustreach     His hired muscle: the Masked Admiral and the Dust Galleon, a
 *                 land-ship that sails the top of the field. Sink it and the
 *                 Admiral fights on foot. She strikes her colours and says
 *                 where the ember is going.
 *   Mourneholt    Mordecai, paid in stolen ember and bound to four lanterns
 *                 of it. Grimtunnel swoops in at the end and steals the lot.
 *   Ochre Plains  Grimtunnel again, in a walking fortress built from what he
 *                 stole. It cannot be killed - it can only be driven to blow
 *                 itself up, which it does, and he retreats into the Pale.
 *   Pale Wastes   His last machine drills into the heart of the dark, and
 *                 wakes what lives there. Marrowfrost, the Pale Lord, in two
 *                 forms. The ultimate fight.
 *
 * THE RULE every finale follows: each one carries both kinds of target.
 * Fodder, in numbers, for a build that has spent thirty minutes on area - and
 * a small set of priority targets (turrets, cannons, lanterns, legs, pipes,
 * shards) that decide how the fight goes, for a build that hits one thing
 * very hard. Neither build is locked out; each has a part of every fight
 * that is its best moment and a part that is its worst.
 *
 * Health is the number at 30:00 on this map before difficulty and Hyper.
 * Measured against a finished build's single-target damage at 30:00
 * (roughly 2,000 unevolved to 5,300 fully evolved), each finale is sized to
 * run two to four minutes. Mechanics are code (src/game/finale.js); every
 * number they read is here so the bench can reach it.
 */
'use strict';
(function (WS) {

  /* Who is talking. The survivor is not in this list: their lines are
     written with {name} and take the colour of their own class. */
  WS.FinaleSpeakers = {
    grimtunnel: { name: 'Grimtunnel', colour: '#ffd36b', art: 'grimtunnel_face', tint: [1.0, 0.86, 0.5] },
    admiral: { name: 'The Masked Admiral', colour: '#ff8a7a', art: 'admiral_face',
      tint: [0.92, 0.22, 0.28] },
    mordecai: { name: 'Mordecai', colour: '#9fe6c0', art: 'mordecai_face',
      tint: [0.55, 0.92, 0.72] },
    marrowfrost: { name: 'Marrowfrost', colour: '#a9dcff', art: 'marrowfrost_face',
      tint: [0.62, 0.88, 1.0] },
    kael: { name: 'Brother Kael', colour: '#b9c8ff', art: 'kael_face', tint: [0.62, 0.72, 1.0] },
    narrator: { name: '', colour: '#e8dcc4' },
  };

  /* The machines and the people in them. These go in the bestiary with
     everything else, which is how a player finds out they have met them. */
  Object.assign(WS.Bosses, {
    candlecrawler: {
      name: 'The Candlecrawler', family: 'lampling', art: 'candlecrawler', machine: 'candlecrawler',
      tint: [0.95, 0.66, 0.30], health: 460000, speed: 0, damage: 34, xp: 900, radius: 64,
      gold: 400, drawScale: 1.3, interval: 99, finale: true, stationary: true, school: 'fire',
      yell: 'Candlecrawler! Dig me out a thief!',
    },
    dust_galleon: {
      name: 'The Dust Galleon', family: 'kerchief', art: 'galleon', machine: 'galleon',
      tint: [0.72, 0.48, 0.30], health: 240000, speed: 0, damage: 38, xp: 700, radius: 78,
      gold: 250, drawScale: 1.1, interval: 99, finale: true, stationary: true, school: 'physical',
      yell: 'Run out the guns!',
    },
    admiral_ashore: {
      name: 'The Masked Admiral, Ashore', family: 'kerchief', art: 'admiral',
      tint: [0.92, 0.22, 0.28], health: 230000, speed: 0, damage: 42, xp: 700, radius: 34,
      gold: 300, interval: 99, finale: true, stationary: true, school: 'physical',
      yell: 'Fine. I will do it myself.',
    },
    mordecai_bound: {
      name: 'Mordecai, Lantern-Bound', family: 'undead', art: 'mordecai',
      tint: [0.55, 0.92, 0.72], health: 420000, speed: 0, damage: 44, xp: 1200, radius: 42,
      gold: 500, interval: 99, finale: true, stationary: true, school: 'shadow',
      yell: 'Four lanterns, four lives. You have one.',
    },
    stormbreaker: {
      name: 'The Stormbreaker', family: 'mechanical', art: 'stormbreaker', machine: 'stormbreaker',
      tint: [0.62, 0.70, 0.82], health: 500000, speed: 0, damage: 52, xp: 1500, radius: 82,
      gold: 600, drawScale: 1.15, interval: 99, finale: true, stationary: true, school: 'nature',
      yell: 'Forty tons of stolen ember and ONE very good idea!',
    },
    heart_drill: {
      name: 'The Heart-Drill', family: 'mechanical', art: 'heartdrill', machine: 'heartdrill',
      tint: [0.86, 0.52, 0.26], health: 380000, speed: 0, damage: 56, xp: 1500, radius: 80,
      gold: 600, drawScale: 1.25, interval: 99, finale: true, stationary: true, school: 'fire',
      yell: 'One more meter and it is ALL mine!',
    },
    kael_stormbound: {
      name: 'Brother Kael, the Stormbound', family: 'highland', art: 'kael',
      tint: [0.62, 0.72, 1.00], health: 560000, speed: 0, damage: 60, xp: 2400, radius: 40,
      spriteScale: 1.15,
      gold: 1200, interval: 99, finale: true, stationary: true, school: 'nature',
      yell: 'Stand still. It is the only thing the storm cannot forgive.',
    },
    pale_lord: {
      // His own art (sprites.js), crown and all - no borrowed regalia.
      name: 'Marrowfrost, the Pale Lord', family: 'undead', art: 'marrowfrost',
      tint: [0.62, 0.88, 1.00], health: 700000, speed: 0, damage: 64, xp: 3000, radius: 56,
      spriteScale: 1.25,
      gold: 1500, interval: 99, finale: true, stationary: true, school: 'frost',
      yell: 'Every night your kind burns my ember. Tonight I take it back.',
    },
  });

  /* The parts. Not bosses - they do not take the boss arc and they do not get
     the boss funeral - but they always show their health, because a priority
     target you cannot see the progress on is not a decision, it is a guess. */
  WS.FinaleUnits = {
    lantern_turret: {
      name: 'Lantern Turret', family: 'mechanical', art: 'turret', machine: 'turret',
      tint: [1.00, 0.78, 0.38], health: 32000, speed: 0, damage: 24, xp: 90, radius: 24,
      finale: true, part: true, stationary: true,
    },
    galleon_cannon: {
      name: 'Gun Port', family: 'mechanical', art: 'turret', machine: 'cannon',
      tint: [0.62, 0.50, 0.40], health: 22000, speed: 0, damage: 30, xp: 90, radius: 24,
      finale: true, part: true, stationary: true,
    },
    soul_lantern: {
      name: 'Soul Lantern', family: 'undead', art: 'turret', machine: 'soullantern',
      tint: [0.55, 1.00, 0.75], health: 28000, speed: 0, damage: 20, xp: 120, radius: 26,
      finale: true, part: true, stationary: true,
    },
    walker_leg: {
      name: 'Stormbreaker Leg', family: 'mechanical', art: 'turret', machine: 'leg',
      tint: [0.60, 0.66, 0.78], health: 55000, speed: 0, damage: 40, xp: 160, radius: 34,
      finale: true, part: true, stationary: true,
    },
    tesla_pylon: {
      name: 'Tesla Pylon', family: 'mechanical', art: 'turret', machine: 'pylon',
      tint: [0.55, 0.85, 1.00], health: 24000, speed: 0, damage: 30, xp: 100, radius: 24,
      finale: true, part: true, stationary: true,
    },
    coolant_pipe: {
      name: 'Ember Coolant Line', family: 'mechanical', art: 'turret', machine: 'pipe',
      tint: [0.95, 0.55, 0.25], health: 40000, speed: 0, damage: 30, xp: 140, radius: 28,
      finale: true, part: true, stationary: true,
    },
    storm_stone: {
      name: 'Storm Stone', family: 'highland', art: 'turret', machine: 'stormstone',
      tint: [0.62, 0.72, 1.00], health: 30000, speed: 0, damage: 30, xp: 110, radius: 26,
      finale: true, part: true, stationary: true,
    },
    frost_shard: {
      name: 'Pale Shard', family: 'undead', art: 'turret', machine: 'shard',
      tint: [0.70, 0.92, 1.00], health: 16000, speed: 0, damage: 30, xp: 80, radius: 22,
      finale: true, part: true, stationary: true,
    },
  };

  /* One per map. `script` names the encounter in src/game/finale.js.
     Dialogue lines are [speaker, text]; `say` are the mid-fight lines the
     script calls by key. */
  WS.Finales = {
    thornhollow: {
      script: 'candlecrawler',
      title: 'Foreman Grimtunnel', subtitle: 'at the controls of the Candlecrawler',
      art: 'candlecrawler', tint: [0.95, 0.66, 0.30],
      intro: [
        ['grimtunnel', 'Thirty minutes. Thirty minutes of burning MY light.'],
        ['grimtunnel', 'Every stone you broke was on MY claim!'],
        ['grimtunnel', 'Candlecrawler! Dig me out a thief!'],
      ],
      say: {
        turretsDown: ['grimtunnel', 'The lamps! Who approved GLASS lamps?!'],
        turretsBack: ['grimtunnel', 'Bolt them back on! Faster!'],
        burrow: ['grimtunnel', 'Down we go! You cannot burn what you cannot find!'],
        surface: ['grimtunnel', 'Surprise! It is me! Again!'],
        meltdown: ['grimtunnel', 'It is fine! Red means FAST!'],
      },
      outro: [
        ['grimtunnel', 'Eject! EJECT!'],
        ['grimtunnel', 'Keep your dawn! There is more ember under the Dustreach than this whole forest!'],
        ['grimtunnel', 'My light! MIIINE!'],
      ],
      epilogue: ['Grimtunnel escapes', 'His pod drifts south, toward the Dustreach.'],
      tuning: {
        damage: 8,   // x difficulty x Hyper x Config.finaleDamage
        turretHpGrowth: 0.18, overheat: 10, overheatLines: [0.85, 0.70], overheatVuln: 1.5,
        burrowAt: 0.60, burrowTime: 12, meltdownAt: 0.25,
        bombDamage: 34, bombRadius: 64, bombTele: 1.1,
        drillDamage: 42, drillWindup: 1.1, drillChainWindup: 0.75, surfaceTele: 1.0, drillTime: 0.9, drillRange: 560,
        eruptDamage: 44, eruptRadius: 90, eruptTele: 1.3,
        ringDamage: 30, ringSpeed: 190, ringGaps: 2, ringGapWidth: 50,
        lamplings: 10, burrowLamplings: 16,
        riseTime: 1.8, burrowSpeed: 150, meltdownPace: 1.55,
        // It hunts from keepAway px, faster once it melts down.
        keepAway: 250, huntSpeed: 55, meltSpeed: 80, drillGirth: 1.5,
        bombs: 2, bombsStripped: 3, bombScatter: 150, bombStagger: 0.15, bombBurn: 2, meltBurn: 3,
        // The burning track a meltdown drill leaves behind it.
        trailRadius: 34, trailLife: 3.2, trailDamage: 12, trailTick: 0.45,
        // Seconds between each attack, and before the first of each.
        every: { erupt: 3.3, trail: 0.1, drill: 8, drillStripped: 6, bomb: 3.4, bombStripped: 4,
          hatch: 10, hatchStripped: 12, ring: 9 },
        opening: { bomb: 4.5, drill: 8, hatch: 7, ring: 9 },
        afterSurface: { drill: 3, ring: 5 },
      },
    },

    dustreach: {
      script: 'galleon',
      title: 'The Masked Admiral', subtitle: 'and the Dust Galleon, under contract',
      art: 'galleon', tint: [0.72, 0.48, 0.30],
      intro: [
        ['admiral', 'Ahoy, lamp-thief! The little foreman sends his regards.'],
        ['admiral', 'And his invoice.'],
        ['admiral', 'Run out the guns!'],
      ],
      say: {
        portDown: ['admiral', 'Patch that port, you bilge rats!'],
        boarders: ['admiral', 'Boarders away!'],
        crash: ['admiral', 'She is going down! ...Fine. I will do it myself.'],
        duel: ['admiral', 'En garde, and so on.'],
        low: ['admiral', 'You fight like a Kerchief. I mean that as an insult.'],
      },
      outro: [
        ['admiral', 'Enough. The foreman pays in ember, not gold. It was never going to be enough.'],
        ['admiral', 'The cargo is bound north. Gallowmere. Something there is being woken.'],
        ['admiral', 'Tell Redcowl the ship was my fault.'],
      ],
      epilogue: ['The Admiral strikes her colours', 'The stolen ember was bound for Mourneholt.'],
      tuning: {
        damage: 9,   // x difficulty x Hyper x Config.finaleDamage
        sailSpeed: 70, broadsideDamage: 40, broadsideTele: 1.2, broadsideWidth: 64,
        grapeDamage: 26, kegDamage: 40, kegRadius: 80, kegTele: 1.2,
        dashDamage: 42, dashWindup: 0.55, dashTime: 0.35, dashRange: 340,
        // The second and third dash of a set: quicker, but still a human's
        // reaction plus a step - below ~0.5s a lane this wide cannot be left.
        dashChainWindup: 0.5,
        pistolDamage: 30, boarders: 8, rally: 4,
        sailInSpeed: 260, crashTime: 2.6,
        // Broadsides fire straight down until the ship falls below aimBelow,
        // then at you; each port a broadsideStagger later than the last.
        aimBelow: 0.7, broadsideLength: 800, broadsideActive: 0.35, broadsideStagger: 0.3,
        grapeCount: 7, grapeSpread: 0.14, grapeSpeed: 300,
        kegs: 3, kegScatter: 120, kegStagger: 0.2, boardBruisers: 3,
        wreckFireDamage: 14, wreckFireRadius: 46, wreckFireTick: 0.5,
        // The duel: the Admiral circles at duelRange and hurries below duelLowAt.
        duelRange: 210, duelSpeed: 170, duelCircle: 0.9, duelLowAt: 0.3, duelLowPace: 1.35,
        dashChain: 2, dashGirth: 1.8, pistolCount: 5, pistolSpread: 0.12, pistolSpeed: 340,
        duelKegRing: 4, duelKegRange: 110, duelKegScale: 0.8, duelKegDelay: 0.3,
        every: { broadside: 6.5, grape: 4.2, keg: 7, board: 12, dash: 5.5, pistol: 2.6, duelKeg: 8, rally: 14 },
        opening: { broadside: 3.5, grape: 5, keg: 6.5, board: 8 },
        duelOpening: { dash: 3, pistol: 2, keg: 6, rally: 10 },
      },
    },

    mourneholt: {
      script: 'mordecai',
      title: 'Mordecai, Lantern-Bound', subtitle: 'paid in stolen ember',
      art: 'mordecai', tint: [0.55, 0.92, 0.72],
      intro: [
        ['mordecai', 'Death is a door. The foreman sold me the key.'],
        ['mordecai', 'Four lanterns, four lives. You have one.'],
      ],
      say: {
        exposed: ['mordecai', 'Darkness suits me better anyway.'],
        relight: ['mordecai', 'I said four lives. I never said only four.'],
        rise: ['mordecai', 'Gallowmere! RISE!'],
      },
      outro: [
        ['mordecai', 'The door... is closing...'],
        ['grimtunnel', 'I will be taking THAT, bone-bag. Pleasure doing business!'],
        ['grimtunnel', 'See you on the Ochre, thief! Bring a bigger light!'],
      ],
      epilogue: ['Grimtunnel steals the lantern-ember', 'His pod races east, over the Ochre Plains.'],
      tuning: {
        damage: 10.5,   // x difficulty x Hyper x Config.finaleDamage
        lanternBond: 0.05, exposedTime: 14, exposedVuln: 1.4, relight: 3,
        // His four lives: an exposed window cannot take him below the next.
        lives: [0.70, 0.45, 0.20],
        riseAt: 0.30, handDamage: 44, handRadius: 58, handTele: 1.0,
        knellDamage: 38, knellSpeed: 200, knellGap: 34,
        lanceDamage: 30, raise: 6,
        lanternHpGrowth: 0.15, lanternAdds: 2, riseSkeletons: 12, riseGhouls: 10, risenPace: 1.35,
        hands: 3, lanceCount: 5, lanceSpread: 0.16, lanceSpeed: 260, knellGaps: 3,
        // knellFast once he is exposed or risen; handStep between the hands of one volley.
        every: { spawn: 9, blink: 8, hand: 5, handStep: 0.45, lance: 4, knell: 11, knellFast: 7.5 },
        opening: { hand: 3, lance: 4, knell: 7, blink: 8, spawn: 6 },
      },
    },

    ochre: {
      script: 'stormbreaker',
      title: 'Grimtunnel, again', subtitle: 'in the Stormbreaker, his walking fortress',
      art: 'stormbreaker', tint: [0.62, 0.70, 0.82],
      intro: [
        ['grimtunnel', 'Behold! Forty tons of stolen ember and ONE very good idea!'],
        ['grimtunnel', 'The Karrash said it could not be done. So I stopped paying them!'],
      ],
      say: {
        legDown: ['grimtunnel', 'Is that a LEG? That was a leg!'],
        kneel: ['grimtunnel', 'Knees! Why does it have KNEES? Fine. FORTRESS MODE!'],
        pylons: ['grimtunnel', 'Pylons up! Let us see you walk through THAT!'],
        destruct: ['grimtunnel', 'You want the ember? HAVE ALL OF IT!'],
      },
      outro: [
        ['grimtunnel', 'You are still ALIVE?! Fine. FINE. I will go to the source!'],
        ['grimtunnel', 'The Pale! Every stone in the world gets its light from the Pale!'],
      ],
      epilogue: ['The Stormbreaker is scrap', 'Grimtunnel flees north, into the Pale Wastes.'],
      tuning: {
        damage: 12.5,   // x difficulty x Hyper x Config.finaleDamage
        standingArmor: 0.35, kneelVuln: 1.2, kneelStagger: 8, destructAt: 0.15,
        // The fortress: the pylons shield the hull, and they come back once.
        pylonShield: 0.30, reraiseAt: 0.50,
        // Near-lethal on Ochre's 30:00 curve (x8.3): hide, or be carried out.
        destructTime: 7, destructDamage: 90,
        stompDamage: 46, stompRadius: 76, stompTele: 0.9,
        beamDamage: 42, beamTele: 1.4, beamSpin: 0.6, beamTime: 4.5, beamWidth: 46,
        /* The fortress's lighthouse: two back-to-back beams, each through ~210
           degrees, so every bearing is crossed at least once. 0.52 rad/s is
           ~175 px/s at the cage's rim - a survivor can keep ahead of it, just. */
        fortSpin: 0.52, fortBeamTime: 7.0, fortBeamLength: 1400,
        // Each volley opens fortLead radians behind you, turning your way.
        fortLead: 0.85,
        // The walking cannon: starts beamArc off straight down, sweeping in.
        beamArc: 1.25, beamLength: 900,
        fenceDamage: 30, missileDamage: 40, missileRadius: 70, missileTele: 1.05,
        missiles: 5, missileScatter: 170, missileStagger: 0.12,
        boltCount: 16, boltSpeed: 200, boltDamage: 28,
        shockSpeed: 230, shockGaps: 3, shockGapWidth: 42,
        enterSpeed: 120, walkSpeed: 38,
        karrash: 5,
        every: { step: 1.3, sweep: 10, missile: 5.5, shock: 8, karrash: 13,
          lighthouse: 10.5, fortMissile: 5, bolts: 6.5, fortKarrash: 15 },
        opening: { step: 1.3, sweep: 6, missile: 5, karrash: 9 },
        fortOpening: { sweep: 3, missile: 2, bolts: 4 },
      },
    },

    palewastes: {
      script: 'paleheart',
      title: 'The Heart-Drill', subtitle: 'Grimtunnel’s last machine',
      art: 'heartdrill', tint: [0.86, 0.52, 0.26],
      intro: [
        ['grimtunnel', 'You are too late! One more meter and it is ALL mine!'],
        ['grimtunnel', 'The heart of the dark! Where every stone gets its light!'],
      ],
      say: {
        pipe: ['grimtunnel', 'That was a COOLANT line! Do you know what those COST?'],
        breach: ['grimtunnel', 'We are through! We are... wait. That is not light.'],
        wake: ['marrowfrost', 'Little candle. You dug so very deep.'],
        frozen: ['grimtunnel', 'Cold! COLD! Very cold!'],
        lord: ['marrowfrost', 'Every night your kind burns my ember. Tonight I take it back.'],
        shards: ['marrowfrost', 'The Pale remembers every shard of itself.'],
        winter: ['marrowfrost', 'Then let there be no dawn at all.'],
      },
      outro: [
        ['marrowfrost', 'The ember... was never mine either...'],
        ['narrator', 'The Pale breaks. For the first time in a thousand nights, nothing climbs out of the ground.'],
        ['grimtunnel', '...So. Truce? I could offer you a VERY reasonable share of the light.'],
      ],
      epilogue: ['The dark is broken', 'The Ember Watch holds. Dawn comes, and this time it stays.'],
      tuning: {
        damage: 13.5,   // x difficulty x Hyper x Config.finaleDamage
        // While a coolant line stands the drill takes pipeShield and cannot
        // be broken below drillFloor. Marrowfrost re-wards at wardLines and
        // cannot be taken past winterAt before the winter; the last of the
        // Pale wards him once more at lastWardAt inside it.
        pipeShield: 0.35, drillFloor: 0.45, wardLines: [0.80, 0.60], lastWardAt: 0.20,
        pipeBreak: 0.15, debrisDamage: 48, debrisRadius: 70, debrisTele: 1.1,
        ventDamage: 44, ventSpin: 0.7, ventTele: 1.2,
        shardReduce: 0.40, shardEvery: 30, winterAt: 0.40, winterEnrage: 130,
        novaDamage: 40, novaSpeed: 200, novaGap: 30,
        gridDamage: 56, gridTele: 1.35, spikeDamage: 44,
        ghouls: 10,
        dropGravity: 1100, breachTime: 7.4,
        debris: 4, debrisScatter: 190, debrisStagger: 0.15,
        ventLength: 900, ventWidth: 40, ventTime: 6, ventArms: 4,
        // Marrowfrost's frost cross, and the faster, wider one in the winter.
        crossSpin: 0.45, crossWidth: 34, crossTele: 1.2, crossTime: 6, crossArms: 2,
        winterCrossSpin: 0.5, winterCrossWidth: 36, winterCrossTele: 1.0, winterCrossTime: 8.2, winterCrossArms: 4,
        // The glacial grid: cols x rows, of which gridSafe cells are safe.
        gridCols: 5, gridRows: 4, gridSafe: 4,
        spikes: 14, spikeSpeed: 190, winterSpikes: 16, winterSpikeSpeed: 200,
        novaGaps: 3, novaSpin: 0.35, novaDelay: 1.3,
        shardCount: 4, tideSkeletons: 6, tideGhouls: 6,
        every: { debris: 4, vent: 11, ghoul: 12, nova: 9, cross: 15, grid: 14, spike: 5, tide: 16,
          winterCross: 8, winterNova: 7, winterGrid: 12, winterSpike: 4, winterEnd: 3 },
        opening: { debris: 3, vent: 7, ghoul: 6 },
        lordOpening: { nova: 4, grid: 9, spike: 3, tide: 8 },
      },
    },

    /* Highmoor is off the road the rest of the story takes. Grimtunnel never
       came here: the storm on this moor is older than his digging, and it
       has been held in place for thirty years by one monk of the Quiet
       Ascent standing in the middle of it - Abbot Eisen's student, who went
       up to learn to be still and stayed up there being it. Tonight the
       ember under the Pale was broken open, and the storm got into him. */
    highmoor: {
      script: 'tempest',
      title: 'Brother Kael, the Stormbound', subtitle: 'who has been holding the storm for thirty years',
      art: 'kael', tint: [0.62, 0.72, 1.0],
      intro: [
        ['kael', 'You walked up through the rain for this? Then you know what I am holding.'],
        ['kael', 'Thirty years I stood still inside it. Tonight it stood still inside me.'],
        ['kael', 'Topple the stones and it will have nowhere to go but through you.'],
      ],
      say: {
        stone: ['kael', 'That stone was older than the Watch. It did not mind. I did.'],
        unbound: ['kael', 'Nothing holds it now. Not the stones. Not me. Find the eye!'],
        eye: ['kael', 'Where it is quiet. Find where it is quiet!'],
        storm: ['kael', 'It is taking the rest of me. Be quick, whoever you are.'],
      },
      outro: [
        ['kael', 'Ah. There. That is... quiet.'],
        ['kael', 'Tell the abbot I stood still for as long as I could. Tell him it was a long time.'],
        ['narrator', 'The storm over Highmoor breaks for the first time in thirty years. Somewhere above the cloud, it is already morning.'],
      ],
      epilogue: ['The storm breaks', 'Brother Kael walks down off the moor, very slowly, in no particular hurry at all.'],
      tuning: {
        damage: 9.5,   // x difficulty x Hyper x Config.finaleDamage
        // While any storm stone stands he takes stoneShield and cannot be
        // broken below stoneFloor; each stone that falls takes stoneBreak of
        // him with it. Past stormAt the storm takes the rest of him.
        stoneShield: 0.30, stoneFloor: 0.55, stoneBreak: 0.08, stones: 3, stormAt: 0.30,
        stoneHpGrowth: 0.20, restoneTime: 26, fenceDamage: 30,
        boltDamage: 46, boltRadius: 72, boltTele: 1.25, bolts: 4, boltScatter: 200, boltStagger: 0.14,
        galeDamage: 40, galeWidth: 60, galeLength: 900, galeTele: 1.0,
        ringDamage: 42, ringSpeed: 210, ringGaps: 2, ringGap: 38,
        eyeDamage: 70, eyeTele: 3.2, eyeRadius: 90, eyes: 2,
        armDamage: 38, armSpin: 0.55, armWidth: 30, armTele: 1.1, armTime: 7, arms: 3, stormArms: 4,
        wisps: 8, harpies: 4,
        drift: 150, driftSpeed: 0.35,
        every: { bolt: 3.6, gale: 7.5, ring: 10, adds: 13, eye: 20, arm: 12,
          stormBolt: 2.6, stormRing: 7, stormArm: 9, stormEye: 15 },
        opening: { bolt: 3, gale: 6, ring: 9, adds: 5, eye: 99, arm: 99 },
      },
    },
  };

})(window.WS);
