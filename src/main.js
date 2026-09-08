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

  /* ------------------------------------------------------------ touch --- */
  /** A floating virtual stick: touch anywhere in the lower field to steer. */
  function initTouch(stage, stick) {
    if (!('ontouchstart' in window)) return;
    document.body.classList.add('touch');
    let id = null, ox = 0, oy = 0;
    const nub = stick.querySelector('.nub');

    stage.addEventListener('touchstart', (e) => {
      if (id !== null) return;
      const t = e.changedTouches[0];
      id = t.identifier; ox = t.clientX; oy = t.clientY;
      stick.style.left = (ox - 66) + 'px';
      stick.style.top = (oy - 66) + 'px';
      stick.classList.add('active');
    }, { passive: true });

    stage.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        const dx = t.clientX - ox, dy = t.clientY - oy;
        const len = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(len, 52);
        nub.style.left = (40 + dx / len * clamped) + 'px';
        nub.style.top = (40 + dy / len * clamped) + 'px';
        WS.Input.setTouchVector({ x: dx / Math.max(len, 40), y: dy / Math.max(len, 40) });
      }
    }, { passive: true });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        id = null;
        stick.classList.remove('active');
        nub.style.left = '40px'; nub.style.top = '40px';
        WS.Input.setTouchVector(null);
        WS.Input.releaseAll();
      }
    };
    stage.addEventListener('touchend', end, { passive: true });
    stage.addEventListener('touchcancel', end, { passive: true });
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
    initTouch(stage, stick);

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
