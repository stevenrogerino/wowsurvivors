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
          text: 'Take one more and you cannot. Ranking a weapon to {Config.weaponMaxLevel} and learning its paired passive evolves it into something far stronger - the card tells you which passive it wants.' },
        { name: 'Two evolved weapons can become one',
          text: 'Some pairs merge into a single greater weapon and give you the slot back. The Codex remembers every pairing you find.' },
        { name: 'Thirty minutes is the win - and then a choice',
          text: 'Bosses arrive on a schedule and the horde never stops thickening. Survive to 30:00 and the win is banked. Then choose: face whatever has been driving the night - first light clears the field, you get thirty seconds and a third blessing, and the finale begins - or stay out for Death, who always comes.' },
        { name: 'Gold outlives the run',
          text: 'You keep every coin whether you win, die or walk away. Spend it with the Trainer on permanent lessons that apply to every run after.' },
      ],
      controls: [
        { key: 'WASD  /  arrow keys', text: 'Move. On a pad, the left stick or the d-pad.' },
        { key: 'Touch, or hold the mouse', text: 'Drag anywhere on the field to steer. Mouse steering is off until you turn it on in Settings.' },
        { key: '1  2  3', text: 'Take the matching card when you level up.' },
        { key: 'R  /  B', text: 'Reroll or banish the cards on offer, if you have any left.' },
        { key: 'Esc', text: 'Pause. Your build, the damage meter and the settings are in there.' },
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
      begin: 'press any key to begin',
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
        { beat: 'night', hold: 5.0, lines: [
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
      kerchief_pillager: 'The ones who throw. Firepots, bottles, once a boot - whatever the last farm had in it.',
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
      geist: 'A hunger with nothing left around it. It bursts where it falls - do not be standing there.',
      // Elites
      snarlpack_bonesnapper: 'The Snarlpack\'s biggest, fed first and meanest for it.',
      kerchief_enforcer: 'Plants its feet, picks you, and comes straight down the line. Step off the line.',
      bone_sentinel: 'A knight once, and still standing a knight\'s watch - over the wrong side.',
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
      boneweaver: 'Builds with bones the way a mason builds with stone. The Pale\'s architect.',
      gorestitch: 'Every Stitched Horror that ever fell went into this one. It remembers all of them.',
      marrowfrost: 'The Pale Lord\'s herald, sent ahead to count the lights and put some out. Where it stands, the frost grows toward you.',
      death_itself: 'Walks when the night runs past its hour. It is not cruel, and it does not stop.',
      aethelgard: 'The Eclipse Sovereign, who took the sun into its crown and would not give it back. The fight that ends in daylight - if it ends.',
      // The finales
      candlecrawler: 'Grimtunnel\'s digging engine: a mine on legs, hung with the lamps he stole. It burrows when it is losing, which is often. Break the lamps.',
      dust_galleon: 'A warship that sails the Dustreach on wheels and spite, firing on anything that carries a light. Hired, not loyal - the Admiral will tell you so herself.',
      admiral_ashore: 'The Masked Admiral, off her ship and out of patience. She fights better than she sails.',
      mordecai_bound: 'Mordecai again, bound into four lanterns of stolen ember - four lives to spend, one lantern each. Break the lanterns and he runs out.',
      stormbreaker: 'Grimtunnel\'s walking fortress: forty tons of stolen ember and very confident engineering. Its shield hangs off the pylons; bring down the pylons and the shield goes with them.',
      heart_drill: 'Grimtunnel\'s last machine, sunk into the Pale Wastes to reach the heart of the dark. He reached it. It was awake.',
      pale_lord: 'Marrowfrost, the Pale Lord: the dark itself, woken at the bottom of the world and crowned in rime. Every ember the Watch has ever burned was taken from him, and tonight he came for all of it.',
    },
  };

})(window.WS);
