/* The platform the game is running on, and what it offers.
 *
 * In a browser this is nothing at all: every call below is a no-op and the
 * game is exactly the game. In the desktop build on Steam, desktop/preload.js
 * hands the page a small bridge (`window.emberSteam`) and this file is the
 * only thing that talks to it:
 *
 *   achievements  each one the game awards is unlocked on Steam under its
 *                 API name (the id, upper-cased: first_blood -> FIRST_BLOOD),
 *                 and on the first launch with Steam every one already earned
 *                 is unlocked too, so an account that predates Steam loses
 *                 nothing.
 *   cloud         the account is mirrored to Steam Cloud as save.json a few
 *                 seconds after it changes and again on the way out; at
 *                 launch whichever copy was written last wins, so a second
 *                 machine picks up where the first left off.
 *   deck          whether this is a Steam Deck, for the report and for the
 *                 first-launch defaults.
 *
 * Loaded before save.js, because the save has to be able to ask for the
 * cloud copy while it loads. It touches nothing else until it is called. */
'use strict';
(function (WS) {

  const bridge = (typeof window !== 'undefined' && window.emberSteam) || null;
  let info = null;
  try { info = bridge && bridge.info ? bridge.info() : null; } catch (e) { info = null; }

  const Platform = {
    name: info && info.available ? 'steam' : 'web',
    steam: !!(info && info.available),
    deck: !!(info && info.deck),
    player: (info && info.player) || null,
    CLOUD_FILE: 'save.json',
  };

  /** Steam API name for an achievement id. */
  Platform.apiName = (id) => String(id).toUpperCase().replace(/[^A-Z0-9_]/g, '_');

  Platform.achievement = function (id) {
    if (!Platform.steam) return;
    try { bridge.unlock(Platform.apiName(id)); } catch (e) { /* Steam went away; the save still has it */ }
  };

  /** Every achievement the account already holds, unlocked on Steam. */
  Platform.syncAchievements = function (db) {
    if (!Platform.steam || !db || !db.achievements) return 0;
    let n = 0;
    for (const id of Object.keys(db.achievements)) {
      if (db.achievements[id]) { Platform.achievement(id); n++; }
    }
    return n;
  };

  /** The cloud copy of the account as text, or null. */
  Platform.cloudRead = function () {
    if (!Platform.steam) return null;
    try { return bridge.cloudRead(Platform.CLOUD_FILE) || null; } catch (e) { return null; }
  };

  let pending = null, timer = null;
  function push() {
    timer = null;
    if (pending === null) return;
    const text = pending; pending = null;
    try { bridge.cloudWrite(Platform.CLOUD_FILE, text); } catch (e) { /* retried on the next save */ }
  }
  /** Called by Save.save with the account as written. Coalesced: a run
   *  saves often, and the cloud only needs the latest. */
  Platform.saved = function (text) {
    if (!Platform.steam) return;
    pending = text;
    if (!timer) timer = setTimeout(push, 4000);
  };
  /** Now, not in four seconds: on the way out. */
  Platform.flush = function () {
    if (!Platform.steam) return;
    if (timer) { clearTimeout(timer); timer = null; }
    push();
  };
  if (bridge && typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => Platform.flush());
    window.addEventListener('beforeunload', () => Platform.flush());
  }

  WS.Platform = Platform;

})(window.WS);
