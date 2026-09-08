/* Boot and the frame loop. Everything else has already registered itself on
 * the WS namespace by the time this runs (script order is index.html). */
'use strict';
(function (WS) {

  let last = 0;

  function frame(now) {
    const dt = last ? WS.min((now - last) / 1000, 0.25) : 0;
    last = now;
    WS.Game.update(dt);
    WS.Renderer.draw(now / 1000);
    WS.UI.pollMenuPad(dt);
    if (WS.Game.player) WS.UI.updateHUD();
    requestAnimationFrame(frame);
  }

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
    WS.Input.init();
    WS.Renderer.init(canvas);
    WS.Game.init();
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

    WS.Renderer.buildScenery(WS.Maps[WS.Config.startMap]);
    WS.UI.openMenu();
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window.WS);
