/* Boot and the frame loop. Everything else has already registered itself on
 * the WS namespace by the time this runs (script order is index.html). */
'use strict';
(function (WS) {

  let last = 0;

  /* The frame boundary.
   *
   * requestAnimationFrame does not re-arm itself: whatever schedules the next
   * frame lives at the END of this function, so ONE thrown error anywhere in
   * the game - a renderer edge case, a bad save, a weapon combination nobody
   * tried - meant the callback never ran again. Measured before this existed:
   * frames after a single synthetic throw, zero; recovered, never. The screen
   * froze on the last good frame and stayed there. In a game where a run is
   * half an hour of accumulated build, that is the worst outcome the software
   * has: silent, permanent, and it takes the run with it.
   *
   * So the loop is now unkillable. rAF is re-armed in a `finally`, before
   * anything else can go wrong, and a throw costs one frame instead of the
   * session. Faults are counted rather than spammed: the first is reported in
   * full, the rest are tallied, and if they keep coming the player is told
   * plainly and offered the way out that saves their gold, instead of being
   * left to wonder why the game stopped moving.
   *
   * This is a net, not a fix. Anything caught here is a bug that should be
   * found and killed - console.error carries the stack for exactly that. */
  const faults = { count: 0, sinceReport: 0, notified: false, lastMessage: '' };

  function onFault(err) {
    faults.count++;
    faults.sinceReport++;
    const msg = (err && err.message) || String(err);
    if (faults.count === 1) {
      console.error('[The Ember Watch] recovered from an error in the frame loop:', err);
      faults.lastMessage = msg;
    } else if (faults.sinceReport >= 60) {
      // A fault every frame is a broken build, not a blip. Say so once a
      // second at most, so the console stays readable enough to debug from.
      faults.sinceReport = 0;
      console.error(`[The Ember Watch] ${faults.count} frame errors so far, latest:`, err);
    }
    // Persistent faults mean the frame is not doing its job any more. Tell the
    // player rather than letting them stare at a stuttering screen - and do it
    // through the toast channel, which costs nothing if it is also broken.
    if (faults.count === 30 && !faults.notified) {
      faults.notified = true;
      try {
        WS.Game.toast('Something went wrong',
          'The game hit a repeated error and is running rough. Esc to pause - quitting to the menu keeps your gold.');
      } catch (e) { /* the UI is the thing that is broken; nothing else to try */ }
    }
  }

  function frame(now) {
    try {
      const dt = last ? WS.min((now - last) / 1000, 0.25) : 0;
      last = now;
      WS.Game.update(dt);
      WS.Renderer.draw(now / 1000);
      WS.UI.pollMenuPad(dt);
      if (WS.Game.player) WS.UI.updateHUD();
    } catch (err) {
      onFault(err);
    } finally {
      requestAnimationFrame(frame);
    }
  }

  /** Exposed so the guard rail can assert the loop actually survives. */
  WS.faultCount = () => faults.count;

  /* ---------------------------------------------------------- steering --- */
  /** A floating stick: press anywhere on the field and drag to steer.
   *
   *  One path for touch, mouse and pen, because they are the same gesture and
   *  Pointer Events already unify them. Sharing it is what gives the game
   *  one-handed play on a desktop - hold the mouse and steer - rather than a
   *  second implementation that drifts from the first.
   *
   *  Two details keep it from fighting the keyboard. It only takes over once
   *  the drag passes ENGAGE, so a stray click cannot latch a zero vector and
   *  stop a player who is holding WASD; and on release it hands control back
   *  rather than calling releaseAll(), which would wipe keys that are still
   *  physically down. Input resolves from `held` every tick for exactly that.
   */
  const ENGAGE = 14;          // px of drag before the stick takes the wheel

  function initStick(stage, stick) {
    if ('ontouchstart' in window) document.body.classList.add('touch');
    const nub = stick.querySelector('.nub');
    let id = null, ox = 0, oy = 0, engaged = false;

    const place = (dx, dy) => {
      const len = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(len, 52);
      nub.style.left = (40 + dx / len * clamped) + 'px';
      nub.style.top = (40 + dy / len * clamped) + 'px';
      WS.Input.setTouchVector({ x: dx / Math.max(len, 40), y: dy / Math.max(len, 40) });
    };

    stage.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        if (!WS.Save.settings.mouseSteer) return;
      }
      if (WS.Game.state !== 'playing') return;
      id = e.pointerId; ox = e.clientX; oy = e.clientY; engaged = false;
      stick.style.left = (ox - 66) + 'px';
      stick.style.top = (oy - 66) + 'px';
      stick.classList.add('active');
      try { stage.setPointerCapture(id); } catch (err) { /* not capturable */ }
    });

    stage.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - ox, dy = e.clientY - oy;
      if (!engaged) {
        if (Math.hypot(dx, dy) < ENGAGE) return;
        engaged = true;
      }
      place(dx, dy);
    });

    const end = (e) => {
      if (e.pointerId !== id) return;
      try { stage.releasePointerCapture(id); } catch (err) { /* already gone */ }
      id = null; engaged = false;
      stick.classList.remove('active');
      nub.style.left = '40px'; nub.style.top = '40px';
      // Hand back to the keyboard. NOT releaseAll: those keys may still be down.
      WS.Input.setTouchVector(null);
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }

  function boot() {
    const stage = document.getElementById('stage');
    const canvas = document.getElementById('game-canvas');
    const overlay = document.getElementById('overlay');
    const hud = document.getElementById('hud');
    const stick = document.getElementById('stick');

    WS.Save.load();
    /* cinematic.js picks a version at load time, when the save is still the
       defaults. This is the first moment the player's actual choice exists. */
    if (WS.Cinematic) WS.Cinematic.select(WS.Cinematic.wanted());
    WS.Input.init();
    WS.Renderer.init(canvas);
    WS.Game.init();
    WS.Game.watchOrientation();
    WS.UI.init(stage, overlay, hud);
    initStick(stage, stick);

    // Audio needs a user gesture; arm it on the first interaction of any kind.
    const arm = () => {
      WS.Audio.init();
      WS.Audio.resume();
      WS.Audio.applySettings();
      if (WS.Game.state === 'menu') WS.Audio.playMusic('menu');
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);

    /* Bank the account on the way out.
     *
     * Both events, because neither alone is enough. `pagehide` is the one that
     * fires reliably when a mobile browser suspends or discards a tab, where
     * `beforeunload` is ignored outright; `visibilitychange` catches the far
     * commoner case of someone switching tabs or apps and never coming back
     * to this one. Writing twice costs a tenth of a millisecond and removes
     * every argument about which one you can trust. */
    const bank = () => { try { WS.Save.flush(); } catch (e) { /* nothing left to try */ } };
    window.addEventListener('pagehide', bank);
    document.addEventListener('visibilitychange', () => {
      const hidden = document.visibilityState === 'hidden';
      if (hidden) bank();
      /* And go quiet. A browser will happily keep a hidden tab's audio playing
       * - that is the right default for a music player and the wrong one for a
       * game, where the drone follows the player into whatever they switched
       * to. Stopping the clock also stops the score's scheduler, so nothing
       * queues up while they are away and coming back is silent until
       * something happens. */
      WS.Audio.setAttentive(!hidden);
    });

    WS.Renderer.buildScenery(WS.Maps[WS.Config.startMap]);
    /* A survivors-like has one rule nobody can guess - that you never attack -
     * and a player who does not know it reads their first run as broken
     * controls. So the manual greets a brand new save once, before the menu,
     * and is never shown again unprompted; it stays reachable from the menu
     * footer and the pause screen for anyone who wants it back. */
    /* Order matters: the prologue says WHY, the manual says HOW, and a player
     * who is told how to hold a light before being told what one is has been
     * handed a control scheme rather than a game. Both are once-only and both
     * stay reachable from the menu footer afterwards. */
    const toMenu = () => WS.UI.openMenu();
    const primer = () => {
      if (WS.Save.db.seenManual) return toMenu();
      WS.UI.openManual(() => {
        WS.Save.db.seenManual = true;
        WS.Save.save();
        toMenu();
      });
    };
    if (!WS.Save.db.seenPrologue) {
      WS.Save.db.seenPrologue = true;
      WS.Save.save();
      // Armed before the first frame, so the very first thing drawn is night.
      WS.Prologue.begin(primer);
    } else {
      primer();
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window.WS);
