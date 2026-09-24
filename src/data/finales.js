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
        ringDamage: 30, ringSpeed: 190,
        lamplings: 10,
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
        grapeDamage: 26, kegDamage: 46, kegRadius: 80, kegTele: 1.2,
        dashDamage: 50, dashWindup: 0.55, dashTime: 0.35, dashRange: 340,
        // The second and third dash of a set: quicker, but still a human's
        // reaction plus a step - below ~0.5s a lane this wide cannot be left.
        dashChainWindup: 0.5,
        pistolDamage: 30, boarders: 8, rally: 4,
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
        kneel: ['grimtunnel', 'Knees! Why does it have KNEES? Fine - fortress mode!'],
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
        pylonShield: 0.30, reraiseAt: 0.50, shockEvery: 8,
        // Near-lethal on Ochre's 30:00 curve (x8.3): hide, or be carried out.
        destructTime: 7, destructDamage: 90,
        stompDamage: 46, stompRadius: 76, stompTele: 0.9,
        beamDamage: 42, beamTele: 1.4, beamSpin: 0.6, beamTime: 4.5, beamWidth: 46,
        fenceDamage: 30, missileDamage: 40, missileRadius: 70, missileTele: 1.05,
        karrash: 5,
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
        novaDamage: 50, novaSpeed: 200, novaGap: 30,
        gridDamage: 56, gridTele: 1.35, spikeDamage: 44,
        ghouls: 10,
      },
    },
  };

})(window.WS);
