/* Keyboard, gamepad and touch input, normalised to one direction state.
 * Key handling is intentionally layout-agnostic where it can be: WASD and the
 * arrows both move, and `code` is used so AZERTY/Dvorak still walk. */
'use strict';
(function (WS) {

  const Input = {
    keys: { up: false, down: false, left: false, right: false },
    pressed: new Set(),
    onKey: null,        // set by the UI for menu navigation / hotkeys
    touchVector: null,
    gamepadIndex: null,
  };

  const MAP = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
  };

  Input.init = function () {
    window.addEventListener('keydown', (e) => {
      const dir = MAP[e.code];
      if (dir) { this.keys[dir] = true; e.preventDefault(); }
      if (!this.pressed.has(e.code)) {
        this.pressed.add(e.code);
        if (this.onKey) this.onKey(e);
      }
      // Keep the page from scrolling under the canvas.
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      const dir = MAP[e.code];
      if (dir) this.keys[dir] = false;
      this.pressed.delete(e.code);
    });

    // Losing focus mid-run must not leave the survivor sprinting into a wall.
    window.addEventListener('blur', () => this.releaseAll());

    window.addEventListener('gamepadconnected', (e) => { this.gamepadIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadIndex = null; });
  };

  /** Hard reset of every held key.
   *
   *  Only for input whose end we cannot observe: window blur, and lifting the
   *  virtual stick. Never call it while the window has focus and keys are
   *  down - keydown auto-repeat only re-fires for the most recently pressed
   *  key, so a wipe mid-hold silently drops every other direction. */
  Input.releaseAll = function () {
    this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
    this.pressed.clear();
  };

  /** Virtual stick for touch devices; the UI feeds it a unit vector. */
  Input.setTouchVector = function (v) { this.touchVector = v; };

  /** Folds gamepad + touch into the same boolean directions the sim reads. */
  Input.poll = function () {
    const t = this.touchVector;
    if (t) {
      this.keys.left = t.x < -0.3; this.keys.right = t.x > 0.3;
      this.keys.up = t.y < -0.3; this.keys.down = t.y > 0.3;
      return;
    }
    if (this.gamepadIndex === null || !navigator.getGamepads) return;
    const pad = navigator.getGamepads()[this.gamepadIndex];
    if (!pad) return;
    const dead = 0.28;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    if (WS.abs(ax) > dead || WS.abs(ay) > dead) {
      this.keys.left = ax < -dead; this.keys.right = ax > dead;
      this.keys.up = ay < -dead; this.keys.down = ay > dead;
    }
    // D-pad, for pads that report it as buttons 12-15.
    if (pad.buttons.length > 15) {
      if (pad.buttons[12].pressed) this.keys.up = true;
      if (pad.buttons[13].pressed) this.keys.down = true;
      if (pad.buttons[14].pressed) this.keys.left = true;
      if (pad.buttons[15].pressed) this.keys.right = true;
    }
  };

  WS.Input = Input;

})(window.WS);
