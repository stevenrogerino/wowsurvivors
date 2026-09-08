/* Screen effects: floating combat text, expanding flashes, particles, shake.
 * All pooled; nothing here allocates during combat. */
'use strict';
(function (WS) {

  const FX = {
    texts: null,
    flashes: null,
    particles: null,
    corpses: null,
    shakeMag: 0,
    shakeTime: 0,
    shakeX: 0,
    shakeY: 0,
    bigHit: 0,        // rolling mean hit, the bar a number must clear when busy
    flashScreen: null,
    hitStop: 0,       // seconds of frozen simulation left, for weight
    hurtPulse: 0,     // 0..1, red rim when the survivor is struck
  };

  FX.init = function () {
    this.texts = new WS.Pool(() => ({}), null, WS.CONST.MAX_FLOATING_TEXT);
    this.flashes = new WS.Pool(() => ({}), null, 90);
    this.particles = new WS.Pool(() => ({}), null, 400);
    this.corpses = new WS.Pool(() => ({}), null, 60);
    this.hitStop = 0;
    this.hurtPulse = 0;
    this.bigHit = 0;
  };

  FX.clear = function () {
    this.texts.releaseAll();
    this.flashes.releaseAll();
    this.particles.releaseAll();
    this.corpses.releaseAll();
    this.hitStop = 0;
    this.hurtPulse = 0;
    this.shakeMag = 0; this.shakeTime = 0; this.shakeX = 0; this.shakeY = 0;
    this.flashScreen = null;
  };

  /* ---------------------------------------------------------------- text -- */
  let fanIndex = 0;
  function push(x, y, text, colour, size, life, rise, pop) {
    const t = FX.texts.acquire();
    if (!t) return null;
    t.x = x; t.y = y; t.text = text; t.colour = colour;
    t.size = size; t.life = life; t.maxLife = life;
    // Successive numbers fan out along an arc instead of stacking on one spot,
    // which is the difference between a readable hit and a smear of digits.
    const a = (fanIndex++ % 7) / 7 * WS.TAU;
    t.vx = WS.cos(a) * 34 + WS.randRange(-6, 6);
    t.vy = rise + WS.sin(a) * 12;
    t.pop = pop || 0;
    return t;
  }

  FX.damage = function (x, y, amount, crit) {
    if (!WS.Save.settings.damageNumbers) return;
    // Budget: past two-thirds full, small non-crit hits stop printing. A wall
    // of tiny digits is less information than a few readable ones.
    if (!crit && FX.texts.count > FX.texts.cap * 0.66) {
      if (amount < FX.bigHit) return;
    }
    FX.bigHit = FX.bigHit * 0.995 + amount * 0.005;
    push(x, y - 8, String(WS.floor(amount)),
      crit ? '#ffd45c' : '#f2f4f8', crit ? 21 : 14, crit ? 0.85 : 0.6, -46,
      crit ? 1 : 0.35);
  };

  FX.playerHurt = function (x, y, amount) {
    push(x, y - 20, '-' + WS.floor(amount), '#ff6b5c', 20, 0.9, -50, 1);
    this.hurtPulse = 1;
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

  /** A death: the creature's silhouette squashes into the ground and fades.
   *  Far more legible than a puff of particles, and it costs one draw. */
  FX.corpse = function (enemy) {
    const c = FX.corpses.acquire();
    if (!c) return;
    c.x = enemy.x; c.y = enemy.y;
    c.art = enemy.template.art;
    c.tint = enemy.template.tint;
    c.size = enemy.spriteSize;
    c.facing = enemy.facing;
    c.life = enemy.boss ? 0.9 : 0.42;
    c.maxLife = c.life;
    c.boss = enemy.boss;
  };

  /** Freezes the simulation for a beat, so a heavy hit lands with weight. */
  FX.stop = function (seconds) {
    FX.hitStop = WS.max(FX.hitStop, seconds);
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
    while (i < this.corpses.count) {
      const c = this.corpses.active[i];
      c.life -= dt;
      if (c.life <= 0) { this.corpses.releaseAt(i); continue; }
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

    if (this.hurtPulse > 0) {
      this.hurtPulse = WS.max(0, this.hurtPulse - dt * 2.4);
    }
  };

  WS.FX = FX;

})(window.WS);
