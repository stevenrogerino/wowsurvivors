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
  };

})(window.WS);
