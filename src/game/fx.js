/* Screen effects: floating combat text, expanding flashes, particles, shake.
 * All pooled; nothing here allocates during combat. */
'use strict';
(function (WS) {

  const FX = {
    texts: null,
    flashes: null,
    particles: null,
    shakeMag: 0,
    shakeTime: 0,
    shakeX: 0,
    shakeY: 0,
    flashScreen: null,
  };

  FX.init = function () {
    this.texts = new WS.Pool(() => ({}), null, WS.CONST.MAX_FLOATING_TEXT);
    this.flashes = new WS.Pool(() => ({}), null, 90);
    this.particles = new WS.Pool(() => ({}), null, 400);
  };

  FX.clear = function () {
    this.texts.releaseAll();
    this.flashes.releaseAll();
    this.particles.releaseAll();
    this.shakeMag = 0; this.shakeTime = 0; this.shakeX = 0; this.shakeY = 0;
    this.flashScreen = null;
  };

  /* ---------------------------------------------------------------- text -- */
  function push(x, y, text, colour, size, life, rise) {
    const t = FX.texts.acquire();
    if (!t) return;
    t.x = x; t.y = y; t.text = text; t.colour = colour;
    t.size = size; t.life = life; t.maxLife = life;
    t.vx = WS.randRange(-14, 14); t.vy = rise;
  }

  FX.damage = function (x, y, amount, crit) {
    if (!WS.Save.settings.damageNumbers) return;
    push(x + WS.randRange(-6, 6), y - 8, String(WS.floor(amount)),
      crit ? '#ffd45c' : '#f2f4f8', crit ? 20 : 14, crit ? 0.85 : 0.6, -46);
  };

  FX.playerHurt = function (x, y, amount) {
    push(x, y - 20, '-' + WS.floor(amount), '#ff6b5c', 20, 0.9, -50);
  };

  FX.heal = function (x, y, amount) {
    if (!WS.Save.settings.healNumbers) return;
    push(x, y - 26, '+' + WS.floor(amount), '#5fe08a', 16, 0.9, -40);
  };

  FX.notice = function (x, y, text, colour) {
    push(x, y - 30, text, colour || '#e8ecf6', 15, 1.1, -34);
  };

  FX.gold = function (x, y, amount) {
    push(x, y - 20, '+' + WS.floor(amount) + 'g', '#f5c56b', 15, 1.0, -38);
  };

  /* --------------------------------------------------------------- flash -- */
  /** An expanding ring of light: the workhorse impact effect. */
  FX.flash = function (x, y, radius, colour, life) {
    const f = FX.flashes.acquire();
    if (!f) return;
    f.x = x; f.y = y; f.radius = radius; f.colour = colour;
    f.life = life || 0.30; f.maxLife = f.life;
  };

  /** A screen-wide colour wash (metamorphosis, death, victory). */
  FX.screen = function (colour, life) {
    this.flashScreen = { colour, life, maxLife: life };
  };

  /* ----------------------------------------------------------- particles -- */
  FX.burst = function (x, y, count, colour, speed, life, size) {
    for (let i = 0; i < count; i++) {
      const p = FX.particles.acquire();
      if (!p) return;
      const a = WS.random() * WS.TAU;
      const v = speed * WS.randRange(0.35, 1);
      p.x = x; p.y = y;
      p.vx = WS.cos(a) * v; p.vy = WS.sin(a) * v;
      p.colour = colour; p.size = size || 3;
      p.life = life * WS.randRange(0.6, 1); p.maxLife = p.life;
      p.drag = 2.6;
    }
  };

  /** A directional spray, e.g. blood from a hit or sparks off a ricochet. */
  FX.spray = function (x, y, dx, dy, count, colour, speed, life) {
    for (let i = 0; i < count; i++) {
      const p = FX.particles.acquire();
      if (!p) return;
      const spread = WS.randRange(-0.6, 0.6);
      const c = WS.cos(spread), s = WS.sin(spread);
      const v = speed * WS.randRange(0.4, 1);
      p.x = x; p.y = y;
      p.vx = (dx * c - dy * s) * v; p.vy = (dx * s + dy * c) * v;
      p.colour = colour; p.size = 2.5;
      p.life = life * WS.randRange(0.6, 1); p.maxLife = p.life;
      p.drag = 3.4;
    }
  };

  /* --------------------------------------------------------------- shake -- */
  FX.shake = function (magnitude, duration) {
    if (!WS.Save.settings.screenShake) return;
    if (magnitude > this.shakeMag || this.shakeTime <= 0) {
      this.shakeMag = magnitude;
      this.shakeTime = duration;
      this.shakeMax = duration;
    }
  };

  /* -------------------------------------------------------------- update -- */
  FX.update = function (dt) {
    let i = 0;
    while (i < this.texts.count) {
      const t = this.texts.active[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.releaseAt(i); continue; }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vy += 42 * dt;                     // ease the rise into a settle
      i++;
    }

    i = 0;
    while (i < this.flashes.count) {
      const f = this.flashes.active[i];
      f.life -= dt;
      if (f.life <= 0) { this.flashes.releaseAt(i); continue; }
      i++;
    }

    i = 0;
    while (i < this.particles.count) {
      const p = this.particles.active[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.releaseAt(i); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = 1 - WS.min(1, p.drag * dt);
      p.vx *= drag; p.vy *= drag;
      i++;
    }

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = WS.max(0, this.shakeTime / this.shakeMax);
      const m = this.shakeMag * k;
      this.shakeX = WS.randRange(-m, m);
      this.shakeY = WS.randRange(-m, m);
      if (this.shakeTime <= 0) { this.shakeX = 0; this.shakeY = 0; this.shakeMag = 0; }
    }

    if (this.flashScreen) {
      this.flashScreen.life -= dt;
      if (this.flashScreen.life <= 0) this.flashScreen = null;
    }
  };

  WS.FX = FX;

})(window.WS);
