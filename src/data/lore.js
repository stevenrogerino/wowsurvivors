/* The prologue, as data.
 *
 * The game has always said what ember DOES - you walk over a gem, a number
 * goes up, you get stronger - and never once said what it IS. A survivors-like
 * can get away with that for a while, and then a player asks why they are out
 * here, and there is no answer in the build.
 *
 * So: ember is power, and it does not belong to you. It is in the stones. You
 * break something, the stone falls, you take the light out of it, and for as
 * long as you hold it you can hold the line. That is the whole mechanic said
 * out loud, which is the only kind of lore worth writing - it tells you how to
 * play while it tells you where you are.
 *
 * Every line below is data, so the tuning bench can rewrite the entire
 * prologue without touching a line of code: Codex -> Prologue.
 *
 *   beat   which visual the renderer paints (see render/prologue.js)
 *   hold   seconds this scene lasts
 *   lines  what is on screen for it; an empty list is a beat with no words
 */
'use strict';
(function (WS) {

  WS.Lore = {
    /* The manual. It lived in ui.js as two array literals, which made the
     * longest run of player-facing prose in the game the only text that could
     * not be tuned - and it quotes numbers, which is worse: "six weapons",
     * "rank a weapon to 8", "thirty minutes" were all written out by hand
     * beside constants that the bench can now change. Templated, so they
     * cannot drift, and here, so they can be rewritten without editing the
     * interface. */
    manual: {
      title: 'How to play',
      subtitle: 'Ninety seconds, and you will not need it again.',
      ledeTitle: 'You only move.',
      ledeBody: 'Your weapons attack on their own. Everything else is a consequence of where you choose to stand.',
      runTitle: 'The run',
      controlsTitle: 'Controls',
      loop: [
        { name: 'Your weapons fire themselves',
          text: 'You never press an attack button. Everything you carry swings, casts and reloads on its own timer, at whatever is nearest. Your whole job is where you stand.' },
        { name: 'Walk over the gems',
          text: 'Everything you kill drops experience. Gather enough and you level, and a level is a choice of three: a new weapon, a rank on one you carry, or a passive.' },
        { name: '{Config.maxWeapons} weapons, and no more',
          text: 'Take one more and you cannot. Ranking a weapon to {Config.weaponMaxLevel} and learning its paired passive evolves it into something far stronger. The card tells you which passive it wants.' },
        { name: 'Two evolved weapons can become one',
          text: 'Some pairs merge into a single greater weapon and give you the slot back. The Codex remembers every pairing you find.' },
        { name: 'Thirty minutes is the win, and then a choice',
          text: 'Bosses arrive on a schedule and the horde never stops thickening. Survive to 30:00 and the win is banked. Then choose. Face whatever has been driving the night: first light clears the field, you get thirty seconds and a third blessing, and the finale begins. Or stay out for Death, who always comes.' },
        { name: 'Gold outlives the run',
          text: 'You keep every coin whether you win, die or walk away. Spend it with the Trainer on permanent lessons that apply to every run after.' },
        { name: 'Every night has a score',
          text: 'Time held, what you put down and how the night ended, multiplied by the battlefield, the difficulty, Hyper and any Oaths you swore. The Statistics tab keeps the ledger and your best on every field and with every survivor.' },
        { name: 'Oaths and the Nightly',
          text: 'Once you have held any battlefield to dawn, you can swear Oaths from the menu: harder nights for a bigger score. The Nightly is one run a day, the same for everyone: a battlefield, a survivor, two Oaths and the same cards dealt for the same picks.' },
      ],
      /* The words the cards use, each said once in plain terms. The
         question players asked was "does this do anything for MY build",
         so the last line says where that answer lives. */
      statsTitle: 'What the stats mean',
      stats: [
        { name: 'Damage', text: 'How hard every weapon hits. Helps everything.' },
        { name: 'Cooldown', text: 'How long a weapon waits between attacks. Lower is faster. Helps everything.' },
        { name: 'Area', text: 'How big things are: novas, fields, orbits, storms, auras and splashes. Chains, beams, palms and rings reach farther instead.' },
        { name: 'Projectiles', text: 'How many of a thing a weapon sends out at once: bolts, arrows, knives, blades, strikes, leaps, palms, beasts. A nova or a beam sends out none.' },
        { name: 'Duration', text: 'How long something stays on the field: fields, spinning blades, a running herd.' },
        { name: 'Projectile speed', text: 'How fast what you send out travels. Only matters for things that fly.' },
        { name: 'Which of these help you?', text: 'Hover over any level-up card, or any weapon in your bar or the pause screen. A weapon says what it grows with; a passive lists which of your weapons it helps and which it does nothing for.' },
      ],
      controls: [
        { key: '{kMove}  /  arrow keys', text: 'Move. On a pad, the left stick or the d-pad.' },
        { key: 'Touch, or hold the mouse', text: 'Drag anywhere on the field to steer. Mouse steering is off until you turn it on in Settings.' },
        { key: '1  2  3', text: 'Take the matching card when you level up.' },
        { key: '{kReroll}  /  {kBanish}', text: 'Reroll or banish the cards on offer, if you have any left.' },
        { key: '{kPause}', text: 'Pause. Your build, the damage meter and the settings are in there.' },
        { key: 'Arrow keys  /  pad', text: 'Move around any menu. Enter or A picks.' },
      ],
    },
    prologue: {
      /* An input steps to the next scene rather than ending the piece, so the
         corner says so. Escape ends it outright and is deliberately absent
         from here: a screen offering to skip is a screen suggesting you
         should, and this one has thirty seconds of work in it. */
      next: 'next',
      /* Shown only when the browser has not yet let the game have a
         voice - see P.arm. It asks for the keypress that buys one. */
      begin: 'Press any key, or tap, to begin',
      title: 'The Ember Watch',
      subtitle: 'Thirty minutes until dawn',
      /* Rewritten once the story had villains in it. The first draft said
         what ember is and never who wants it, so the piece ended on a
         mechanic rather than a threat. It still teaches the loop - the dead
         leave stones, you take the light, the light draws them - and then it
         names the two things the finales are about: the thief on the ridges
         who is selling the light (Grimtunnel), and the thing in the Pale
         that wants all of it back (Marrowfrost) - and only then brings the
         horde in, as his. "He wants them back" is
         set up here so that "Tonight I take it back" lands at the end - and
         "every light we burn, he CALLS his" is a claim, not a fact, so that
         "the ember was never mine either" can turn it over. */
      scenes: [
        { beat: 'night', hold: 4.6, lines: [
          'The dark does not fall here.',
          'It climbs.'] },
        { beat: 'rise', hold: 5.0, lines: [
          'Up through the furrows and the open graves,',
          'every night, until morning.'] },
        { beat: 'ember', hold: 5.6, lines: [
          'The dead leave a stone behind, with light still in it.',
          'We call it ember.'] },
        { beat: 'draw', hold: 5.6, lines: [
          'Break the stone and take the light.',
          'For as long as you carry it, you burn.'] },
        { beat: 'thief', hold: 6.0, lines: [
          'Out on the ridges, someone is digging up the dead for it',
          'and selling their light by the pound.'] },
        { beat: 'pale', hold: 6.0, lines: [
          'And far to the north, in the Pale,',
          'something older than the dark is keeping count.'] },
        { beat: 'pale', hold: 6.2, lines: [
          'His name is Marrowfrost. Every light we burn, he calls his.',
          'He wants them back.'] },
        { beat: 'horde', hold: 5.4, lines: [
          'Everything that climbs out of the ground is his,',
          'and every one of them can see you burning.'] },
        { beat: 'horde', hold: 5.0, lines: [
          'Every watch before yours carried a light.',
          'Every light went out.'] },
        { beat: 'stand', hold: 5.6, lines: [
          'Nobody kills their way to morning.',
          'Burn brighter than they can bear, and keep moving.'] },
        { beat: 'dawn', hold: 7.2, lines: [
          'Thirty minutes until dawn.',
          'Hold the line until the light comes back.'] },
        { beat: 'title', hold: 5.0, lines: [] },
      ],
    },

    /* The other end of it.
     *
     * The prologue says "Hold until the light comes back." Thirty minutes
     * later the light comes back, and for the whole life of this game that was
     * a results panel sliding up over a battlefield. This is the sentence
     * being finished.
     *
     * It stars whoever the player actually ran, so {name}, {title} and
     * {class} are filled in from their survivor and {map} from the ground they
     * held. Twenty-three seconds - a fifth of what the prologue takes, because
     * this one arrives after half an hour of play and nobody wants a lecture
     * at the end of a marathon.
     */
    victory: {
      next: 'next',
      scenes: [
        { beat: 'last', hold: 4.0, lines: [
          'The last of them come out of the ground.'] },
        { beat: 'break', hold: 4.5, lines: [
          'And the night runs out of dark.'] },
        { beat: 'burn', hold: 5.0, lines: [
          'Nothing that lives down there can hold what you held.'] },
        { beat: 'named', hold: 5.0, lines: [
          '{name}', '{title}'] },
        { beat: 'day', hold: 4.5, lines: [
          'You kept the watch at {map} until dawn.'] },
      ],
    },

    /* The bestiary's field notes: what the Watch has written down about each
     * thing that has come out of the dark, in the Watch's own voice. One or
     * two sentences each - a page, not an essay - and where there is a lesson
     * in how it fights, the note gives it. The book shows a note only once
     * the thing has been put down at least once. */
    bestiary: {
      // Thornhollow
      lampling: 'They dig toward light the way moths fly at it. A lampling will chew through a cellar wall to sit beside your candle, and then through you to keep it.',
      boar: 'Charges whatever moved last. In Thornhollow that is usually you.',
      wolf: 'Never alone. If you have counted one, count again.',
      gilkin: 'Small, green and certain that everything in reach is food. The Watch has found gilkin teeth marks in lantern brass.',
      gilkin_tidecaller: 'Sings the river up out of its banks and throws it at you in pieces. Cold pieces. Close the distance; they do not like it close.',
      mongrel: 'Half dog, half grudge. The Snarlpack were somebody\'s hounds once, and nobody has come forward to claim them.',
      kerchief: 'Red cloth over the face and quick hands under it. They rob the dead first and the living second, which is at least an order.',
      // The Dustreach
      kerchief_pillager: 'The ones who throw. Firepots, bottles, once a boot: whatever the last farm had in it.',
      harvest_reaper: 'The threshing engines never stopped when the farmers did. They are still bringing in the harvest. Stand clear when one breaks: it takes its last swing on the way down.',
      fleshripper: 'Circles until you tire, then lands. The trick is not to tire.',
      coyote: 'You will hear them laughing before you see them. Keep walking.',
      bruiser: 'What the Kerchiefs send when the footpads come back empty-handed.',
      // Mourneholt
      ghoul: 'Slow, stupid, and there are always more of them than you left behind.',
      skeleton: 'Still holding the sword it was buried with. Most of them are still holding the grudge, too.',
      skeletal_mage: 'The cold in Mourneholt is not weather. It is these.',
      moonwretch: 'Something that was a wolf once, and then looked at the moon for too long.',
      spider: 'Leaves its venom on the ground behind it. Never follow a spider; go around.',
      // The Ochre Plains
      longstrider: 'Tall as a watchtower and about as easy to turn.',
      raptor: 'Hunts in the heat of the day, which on the Ochre Plains is all of it.',
      bristlekin: 'Grows its armour. The old ones are more quill than beast.',
      shrikewing: 'Rides the updraft over you and calls the wind down in knives. Keep moving, so it has to keep turning.',
      karrash: 'The Karrash send their young to run down strangers. It is how they grow up. Do not be how they grow up.',
      lion: 'Waits in grass the colour of itself.',
      // The Pale Wastes
      pale_ghoul: 'The cold keeps them. They are older than the others, and hungrier for it.',
      crypt_fiend: 'Too many legs for a thing that used to be a person.',
      necromancer: 'Throws the grave\'s own cold at you from behind its dead. Get past the dead.',
      abomination: 'Sewn together from what the cult had spare. It comes apart when it dies, and the parts still want you.',
      geist: 'A hunger with nothing left around it. It bursts where it falls. Do not be standing there.',
      // Highmoor
      stormhorn_ram: 'The storm lives in their horns. You can hear it building before they charge, the way you can hear a kettle.',
      galewing_harpy: 'Rides the gusts off the high tors and drops what it throws from wherever the wind happens to be. Stand under the lightning and it will not follow you in.',
      stonehide: 'Moss on the back, granite underneath, and a temper that takes a century to wake and another to go back to sleep. Let the storm find it: nothing else hurts it much.',
      stormwisp: 'A piece of the storm that got lost on the way down. It comes apart where it falls, all at once.',
      // Elites
      thunderscale: 'Sleeps in the thunderheads and comes down with them. Plants, picks you, and runs the line. Be off the line.',
      snarlpack_bonesnapper: 'The Snarlpack\'s biggest, fed first and meanest for it.',
      kerchief_enforcer: 'Plants its feet, picks you, and comes straight down the line. Step off the line.',
      bone_sentinel: 'A knight once, and still standing a knight\'s watch, over the wrong side.',
      karrash_battlelord: 'Charges once it has chosen you: everything the Karrash believe about glory, in one straight line. Be somewhere else when it arrives.',
      deathbound_vanguard: 'The front rank of the Pale. It does not break, because there is nothing left in it to break.',
      shadow_weaver: 'A shape the dark makes when it wants hands.',
      // Bosses
      grimtunnel: 'Stole the Watch\'s light and ran it down a mine shaft. He has hoarded flames ever since, and every one he takes makes the night a little longer.',
      murkgill: 'The oldest gilkin in the river, and the loudest. Nobody knows what "blorp" means. Everybody knows what it means when he says it twice.',
      gnarlfang: 'Leads the Snarlpack by the simple method of having bitten everyone else in it.',
      redcowl: 'Captain of the Kerchiefs. Polite in the way a knife is sharp.',
      fenroth: 'The Vale\'s oldest wolf, and the reason there are no shepherds left in it.',
      harvestking: 'The greatest of the threshing engines, crowned in rusted scythes. It still keeps the harvest. It has only changed its mind about the crop.',
      masked_admiral: 'Commands a fleet with no sea. Somewhere out in the Dustreach there is a ship on dry land, and a very long story.',
      barkfang: 'Old, grey and patient. The moonwretches follow him because he has never once been in a hurry.',
      silkfang: 'Mother of every web in Mourneholt. She does not speak; the sound she makes instead is worse.',
      mordecai: 'A necromancer who died and did not accept it. The Watch has put him down four times that it knows of.',
      palewraith: 'Where it passes, the candles gutter out. The Watch keeps spares.',
      thornmane: 'The Thornhide say the plains were theirs before anyone walked them. He intends to prove it on you.',
      shriekfeather: 'Matron of the Shrikewings. The wind she calls has taken roofs off, and the people under them.',
      kazrok: 'Warlord of the Karrash, who has never let a stranger cross the plains alive. There is a first time for things.',
      stormhide: 'When it walks, the plains thunder. When it charges, they do not have time to.',
      hornlord: 'The oldest ram on the moor, with horns that have been struck by lightning so often they have started to like it. He calls it down on you now.',
      skreeva: 'Queen of the Galewing. She has never once landed where anyone could reach her, and she considers this the whole of good manners.',
      mossback: 'The Stonehide elder, asleep under the moor since before the moor. The storm woke him and he has been in a mood about it ever since.',
      boneweaver: 'Builds with bones the way a mason builds with stone. The Pale\'s architect.',
      gorestitch: 'Every Stitched Horror that ever fell went into this one. It remembers all of them.',
      marrowfrost: 'The Pale Lord\'s herald, sent ahead to count the lights and put some out. Where it stands, the frost grows toward you.',
      death_itself: 'Walks when the night runs past its hour. It is not cruel, and it does not stop.',
      aethelgard: 'The Eclipse Sovereign, who took the sun into its crown and would not give it back. The fight that ends in daylight, if it ends.',
      // The finales
      candlecrawler: 'Grimtunnel\'s digging engine: a mine on legs, hung with the lamps he stole. It burrows when it is losing, which is often. Break the lamps.',
      dust_galleon: 'A warship that sails the Dustreach on wheels and spite, firing on anything that carries a light. Hired, not loyal. The Admiral will tell you so herself.',
      admiral_ashore: 'The Masked Admiral, off her ship and out of patience. She fights better than she sails.',
      mordecai_bound: 'Mordecai again, bound into four lanterns of stolen ember: four lives to spend, one lantern each. Break the lanterns and he runs out.',
      stormbreaker: 'Grimtunnel\'s walking fortress: forty tons of stolen ember and very confident engineering. Its shield hangs off the pylons; bring down the pylons and the shield goes with them.',
      heart_drill: 'Grimtunnel\'s last machine, sunk into the Pale Wastes to reach the heart of the dark. He reached it. It was awake.',
      kael_stormbound: 'A monk of the Quiet Ascent who went up onto Highmoor to learn stillness from the storm and stood in it so long he became what held it there. Break the stones that bind it to him, and then find the quiet at the middle of it.',
      pale_lord: 'Marrowfrost, the Pale Lord: the dark itself, woken at the bottom of the world and crowned in rime. Every ember the Watch has ever burned was taken from him, and tonight he came for all of it.',
    },

    /* The watchers: the Watch's record of each of its own. Rendered in the
     * survivor's record page and on the roster.
     *   record  the entry, a few short paragraphs, in the Watch's voice
     *   says    a line in their own
     *   rumor   what the Watch has heard of one not yet found - where to look,
     *           and what it will take. Templated against Config.encounters.
     *   found   for the five met on the field: the banner when they appear,
     *           what you are doing while you stand with them, and the banner
     *           when they join. */
    watchers: {
      mage: {
        record: [
          'Zul is a baron of a barony that is, by his own account, mostly bog. He sold the dry half to pay his tuition at the Low Cloister, where mages are taught in the cellars and promoted by the stair.',
          'He has been an apprentice for eleven years. The Cloister will not pass him until he has done field work, and the only field left with any work in it is the one the Watch stands in.',
          'He never did learn to aim. His motes find their own way, and he has decided to call that a technique.',
        ],
        says: 'I am told the field work counts double if I survive it.',
      },
      priest: {
        record: [
          'The Order of the Morning Light named her the Fool as an insult. She blessed a well that had already run dry, and it filled. She took the name as a rank and has signed it that way ever since.',
          'Chid heals because nobody has ever managed to explain to her why she should not be able to. The Light seems to have given up arguing.',
          'She was the first to sit down at the Watch\'s fire and the last to leave it, every night, for as long as anyone there can remember.',
        ],
        says: 'The dark is only the Light, waiting for somebody to be foolish enough.',
      },
      rogue: {
        record: [
          'The doctorate is self-awarded. So is most of Rav\'s history, which changes depending on who is buying.',
          'What the Watch can confirm: he was the Kerchiefs\' quartermaster for six years, and the winter they raided a Watch fire for its ember, and a village froze for it, he walked out on them with their payroll and every knife in the armoury.',
          'The Kerchiefs caught him on the road and tied him up in the open, as a lesson to the others. The Watch cut him loose. He has been teaching lessons of his own since.',
        ],
        says: 'I did not steal the knives. I liberated them. There is paperwork. Somewhere.',
        rumor: 'The Kerchiefs have one of their own tied up somewhere, and they want it seen. Put down {kerchiefs} of them in a single night and you will find where they keep him.',
        found: {
          arrive: ['The Kerchiefs have a prisoner', 'One of their own, tied up in the open. Get to him.'],
          hold: 'Cutting him loose',
          joined: ['Dr. Rav McBreathless joins the Watch', 'He has already been through your pockets. Out of habit.'],
        },
      },
      hunter: {
        record: [
          'Ashford Garrison held the eastern woods for forty years. It held out against the Snarlpack for eleven days. Maeca was out on patrol when it fell, and she has been hunting the pack that took it ever since.',
          'She walks barefoot to feel the ground, and she never wastes an arrow, because most nights she has only a few.',
          'The Watch found her treed by wolves in Thornhollow, down to her last quiver and still counting shots. She accepted help on the understanding that it was a temporary arrangement. It has not ended.',
        ],
        says: 'Count your arrows before you count their wolves.',
        rumor: 'A ranger has been hunting the beasts of these woods alone, and they have started hunting her back. Put down {beasts} beasts in a single night and you will hear where she is holding out.',
        found: {
          arrive: ['A ranger is holding off a pack', 'Last quiver, back to a tree. Stand with her.'],
          hold: 'Standing with her',
          joined: ['Maeca Barefoot joins the Watch', 'She counts your arrows before she thanks you.'],
        },
      },
      warrior: {
        record: [
          'He fell at the Battle of the Low Ford, a hundred years ago, in the middle of a charge and the middle of a battle cry. They raised a cairn over him where he lay. The cry never stopped.',
          'For a century, travellers on the ford road heard the ground screaming and walked a little faster. Then the Watch put down enough of the night\'s worst in one night to wake him, and he came out of the cairn still charging.',
          'When the Watch asked for his name for the book, that is what he said. It has been written down exactly.',
        ],
        says: 'AAAAAAAAA!',
        rumor: 'Somewhere under a cairn, a hero is still screaming the battle cry he died on. He answers to a fight worth waking for: put down {bosses} of the night\'s worst in a single night.',
        found: {
          arrive: ['The ground is screaming', 'A cairn, and something under it still in the middle of a charge. Dig.'],
          hold: 'Digging',
          joined: ['AAAAAAAAA joins the Watch', 'He is still screaming. That is fine. That is just his name.'],
        },
      },
      warlock: {
        record: [
          'When the blight came to the Gloaming Grove, Nim saved it the only way he knew: he drank the sickness out of it, and a great deal of the grove along with it. The grove lived. The druids exiled him for how.',
          'The hunger never left his hands. It goes quiet only when there is a great deal to drink at once, which is why he is always found at the edge of a slaughter, watching.',
          'He joined the Watch on the reasoning that the Watch would never run out of things for him to drink. So far he has been right.',
        ],
        says: 'The grove forgave the blight. It never forgave the cure.',
        rumor: 'Someone in the dark follows the worst of the killing, and waits at its edge. Put {slaughter} of them down inside a breath or two, and he will come to see who did it.',
        found: {
          arrive: ['Something in the dark enjoyed that', 'A hooded figure at the edge of the slaughter. He will not wait long.'],
          hold: 'Hearing him out',
          joined: ['Nim B\'ladin joins the Watch', 'He thanks you for the meal.'],
          left: ['Nim B\'ladin steps back into the dark', 'He will come again for a slaughter worth watching.'],
        },
      },
      shaman: {
        record: [
          'Vonnra keeps the Waystation, where the last three roads meet and nothing gets through without paying her toll. She reads fortunes in the storm, and the storm has never once been wrong about who can afford her.',
          'She saw the Watch in the lightning years ago and has been sending it invoices ever since, for services she had not yet rendered.',
          'She came to the field herself the night a watcher finally had enough gold to be worth the trip. She has not left, and the invoices have not stopped.',
        ],
        says: 'I have seen how this ends. The fee is the same either way.',
        rumor: 'A far seer reads fortunes in the storm, and only for those who can pay. Carry {gold} gold in a single night and her storm will find you. She will not wait for it to pass.',
        found: {
          arrive: ['A storm gathers around a stranger', 'The far seer has come to read your fortune. She will not wait.'],
          hold: 'Having your fortune read',
          joined: ['Vonnra Hydrocheck joins the Watch', 'Your fortune is excellent. Her rates have gone up.'],
          left: ['The storm moves on', 'Vonnra will read for you another night, if you can still pay.'],
        },
      },
      paladin: {
        record: [
          'Professor Keegan fainted during his own knighting and was declared dead by a clerk who wanted to go home. He was buried in Thornhollow with full honours and the wrong paperwork.',
          'He dug himself out three days later, walked to the Argent Vigil and filed a complaint, which is still under review. Until it is resolved his knighthood remains probationary.',
          'He kept the shield. He says he has earned it twice.',
        ],
        says: 'I have been buried once already. I did not care for it.',
        rumor: 'Somewhere in Thornhollow, an adequate knight lies buried by mistake. Hold the woods long enough and his coffin will come up.',
      },
      graveblade: {
        record: [
          'DZ was a healer once, and a good one. He healed past the point where anyone should, and the Light in him curdled into something colder that did not want to mend.',
          'He was buried with his blade the first time. He did not stay. He has not stayed buried since, and he has stopped expecting to.',
          'He keeps the Watch because it is the only place where what he has become is useful.',
        ],
        says: 'The Light rots, if you ask too much of it. Mine did.',
        rumor: 'Heal past the point of healing. When enough Light has curdled in one night, a blade will break the ground where it fell.',
      },
      ruinseeker: {
        record: [
          'Nerosus burned out both eyes to see the ruin clearly. He says it was worth it. He has not blinked since, which the others find harder to live with than the eyes.',
          'The ruin is what is left when a thing has been used past its end, and he sees it in everything: in the horde, in the Watch, in the fire itself. He has decided it is beautiful.',
          'The twin glaives found him the night he gave himself to the fel for the last time and came back. He has been giving himself to it ever since.',
        ],
        says: 'Everything ends. I only want to be there when it does.',
        rumor: 'Give yourself to the ruin, again and again in one night. When it has taken enough of you, two glaives will be waiting.',
      },
      druid: {
        record: [
          'Milksupply kept the herds of the Long Pasture for longer than anyone kept count, and knew every calf by name, and by the name of its mother, and of hers.',
          'When the dark came down over the pasture she took the old shapes to stand in front of it: the bear when it came close, the owlbear when it came from far off. The herd got out. She stayed long enough to be sure.',
          'Three of the calves were never found. She came to the Watch because the Watch is where lost things end up, and she has not stopped looking.',
        ],
        says: 'Everything out there was somebody\'s calf once. I try to remember that. It does not always help.',
        rumor: 'Take the old shapes, again and again in one night, and three lost calves may stray onto the field. Bring them home before the dark does, and someone large will come looking for them.',
      },
      monk: {
        record: [
          'Abbot Eisen kept the Quiet Ascent, a monastery so high that the snow there had never been walked on. He shaved his head the day he took the vow and has not had cause to regret it.',
          'He teaches one thing, and it takes the whole of a life to learn: that you do not have to be where the blow lands. He has not been struck since the spring before last, and he counts.',
          'He came down the mountain to see whether anyone below had learned it on their own. He came to the Watch because it looked like the likeliest place to find out.',
        ],
        says: 'Stand still inside the storm. Then do not be there.',
        rumor: 'Step through blow after blow in one night and the Still Hand will start watching. Then let nothing land on you, for as long as it asks, and the abbot will come to meet whoever taught you.',
      },
    },
  };

})(window.WS);
