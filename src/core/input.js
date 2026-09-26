/* Keyboard, gamepad and touch input, normalised to one direction state.
 * Key handling is intentionally layout-agnostic where it can be: WASD and the
 * arrows both move, and `code` is used so AZERTY/Dvorak still walk. */
'use strict';
(function (WS) {

  /* Two layers, deliberately.
   *
   * `held` is what the player is physically holding on the keyboard. `keys` is
   * what the simulation reads, resolved every tick from the stick, the pad and
   * `held` in that order. They used to be one object, which meant a stick had
   * to overwrite the keyboard to steer and then had nothing to hand back to on
   * release - the old touch code papered over that by calling releaseAll(),
   * which on a desktop wipes the WASD the player is still holding down. */
  const Input = {
    keys: { up: false, down: false, left: false, right: false },
    held: { up: false, down: false, left: false, right: false },
    pressed: new Set(),
    onKey: null,        // set by the UI for menu navigation / hotkeys
    chaseTarget: null,
    gamepadIndex: null,
  };

  /* Movement keys: the player's own bindings (Settings) plus the arrows,
     which always move so nobody can bind themselves out of the game. */
  let MAP = {};
  Input.rebind = function () {
    const k = (WS.Save && WS.Save.db && WS.Save.settings.keys) || WS.Config.defaultSettings.keys;
    MAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    for (const dir of ['up', 'down', 'left', 'right']) if (k[dir]) MAP[k[dir]] = dir;
  };
  /** The action a key is bound to (pause, reroll, banish), or null. */
  Input.action = function (code) {
    const k = (WS.Save && WS.Save.db && WS.Save.settings.keys) || WS.Config.defaultSettings.keys;
    if (code === k.pause || code === 'Escape') return 'pause';
    if (code === k.reroll) return 'reroll';
    if (code === k.banish) return 'banish';
    return null;
  };
  /** A key code as a player would name it. */
  Input.keyName = function (code) {
    if (!code) return '';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Arrow')) return code.slice(5) + ' arrow';
    return code.replace(/Left$|Right$/, (m) => ' ' + m.toLowerCase());
  };

  Input.init = function () {
    this.rebind();
    window.addEventListener('keydown', (e) => {
      const dir = MAP[e.code];
      if (dir) { this.held[dir] = true; this.keys[dir] = true; e.preventDefault(); }
      if (!this.pressed.has(e.code)) {
        this.pressed.add(e.code);
        if (this.onKey) this.onKey(e);
      }
      // Keep the page from scrolling under the canvas.
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      const dir = MAP[e.code];
      if (dir) { this.held[dir] = false; this.keys[dir] = false; }
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
    this.held.up = this.held.down = this.held.left = this.held.right = false;
    this.pressed.clear();
  };

  /** A world-space point to walk toward, fed by mouse drag and touch alike.
   *
   *  This used to be a fixed vector, latched once from the drag at the
   *  moment the pointer moved and never revisited: point the mouse somewhere
   *  close and hold still, and the survivor walked that original heading
   *  forever, sailing straight past the spot the player was aiming at. A
   *  target is re-aimed at from wherever the survivor actually is, every
   *  tick, so it is chased rather than launched toward - it closes in, and
   *  it stops when it arrives instead of orbiting or overshooting. */
  Input.setChaseTarget = function (pt) { this.chaseTarget = pt; };

  /** Folds gamepad + touch into the same boolean directions the sim reads. */
  Input.poll = function () {
    const target = this.chaseTarget;
    const p = WS.Game && WS.Game.player;
    if (target && p) {
      const [nx, ny, len] = WS.normalize(target.x - p.x, target.y - p.y);
      // Closer than this and re-aiming only makes the survivor twitch in
      // place, chasing a point it has effectively already reached.
      const ARRIVED = 10;
      if (len < ARRIVED) {
        this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
      } else {
        this.keys.left = nx < -0.3; this.keys.right = nx > 0.3;
        this.keys.up = ny < -0.3; this.keys.down = ny > 0.3;
      }
      return;
    }
    /* No stick: the keyboard is in charge again. Resolving from `held` every
       tick is what lets a stick be released without stranding its last
       direction, and without touching keys the player is still holding. */
    this.keys.up = this.held.up; this.keys.down = this.held.down;
    this.keys.left = this.held.left; this.keys.right = this.held.right;
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
