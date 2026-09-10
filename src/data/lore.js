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
    prologue: {
      skip: 'any key to skip',
      title: 'The Ember Watch',
      subtitle: 'Thirty minutes until dawn',
      scenes: [
        { beat: 'night', hold: 5.0, lines: [
          'Every night, the dark comes up out of the ground.'] },
        { beat: 'night', hold: 4.6, lines: [
          'It has taken every watch before this one.'] },
        { beat: 'ember', hold: 5.4, lines: [
          'What holds it back is ember.',
          'and ember will not burn on its own.'] },
        { beat: 'ember', hold: 5.0, lines: [
          'It sleeps in the stones the dead leave behind.'] },
        { beat: 'draw', hold: 5.6, lines: [
          'Break the stone. Take the light out of it.',
          'While you carry it, you burn.'] },
        { beat: 'horde', hold: 5.2, lines: [
          'They can smell a light from a long way off.'] },
        { beat: 'stand', hold: 5.4, lines: [
          'You will not kill your way out of this.',
          'Nobody ever has.'] },
        { beat: 'stand', hold: 4.6, lines: [
          'You will out-burn it, and you will keep moving.'] },
        { beat: 'dawn', hold: 6.5, lines: [
          'Hold until the light comes back.'] },
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
      skip: 'any key to skip',
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
