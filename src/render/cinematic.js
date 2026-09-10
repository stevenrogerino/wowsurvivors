/* Which cut of the prologue plays.
 *
 * There are two, and there are two on purpose: v1 is the one that shipped and
 * that the author liked, kept whole and untouched, and v2 is the one built
 * beside it. Until somebody has watched them back to back and picked, deleting
 * either would be a guess. So the choice is a setting, the setting is in the
 * Settings pane next to the other things about how the game looks, and
 * WS.Prologue is whichever of them is selected right now.
 *
 * WS.Prologue is a live global rather than a wrapper because that is what the
 * rest of the game already reads - the renderer checks WS.Prologue.active every
 * frame, the menu calls WS.Prologue.begin, eleven harnesses call
 * WS.Prologue.finish - and pointing the global at a different object is both
 * simpler and harder to get wrong than proxying nine members through a facade.
 *
 * When one of them is deleted, this file goes with it and prologue-<n>.js
 * assigns WS.Prologue directly again.
 */
'use strict';
(function (WS) {

  const Cinematic = {
    versions: [
      { n: 1, label: 'One', note: 'The original cut.' },
      { n: 2, label: 'Two', note: 'Parallax, dissolves, weather, and the roster at dawn.' },
    ],
    DEFAULT: 2,
  };

  Cinematic.impl = function (n) {
    return n === 1 ? WS.PrologueV1 : WS.PrologueV2;
  };

  /** The version the save asks for, falling back to whatever actually loaded.
   *  A setting naming a cut that has been deleted must not leave the game with
   *  no prologue at all. */
  Cinematic.wanted = function () {
    let n = this.DEFAULT;
    try {
      const s = WS.Save && WS.Save.settings && WS.Save.settings.cinematic;
      if (s === 1 || s === 2) n = s;
    } catch (e) { /* a save that has not loaded yet gets the default */ }
    return this.impl(n) ? n : (WS.PrologueV2 ? 2 : 1);
  };

  /** Point WS.Prologue at a version. Refuses while one is playing - swapping
   *  the implementation mid-piece would strand the running one with its layer
   *  still in the DOM and its keydown listener still bound. */
  Cinematic.select = function (n) {
    const impl = this.impl(n);
    if (!impl) return false;
    if (WS.Prologue && WS.Prologue.active && WS.Prologue !== impl) return false;
    WS.Prologue = impl;
    return true;
  };

  Cinematic.current = function () { return (WS.Prologue && WS.Prologue.version) || 0; };

  WS.Cinematic = Cinematic;
  Cinematic.select(Cinematic.wanted());

})(window.WS);
