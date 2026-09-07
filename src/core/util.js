/* WoWSurvivors 2 - core utilities.
 * Loaded first; every other file hangs off the global WS namespace, mirroring
 * the addon's `WS` table so ported logic reads the same. Classic scripts (no
 * ES modules) so the game runs straight off the filesystem. */
'use strict';
window.WS = window.WS || {};
(function (WS) {

  const M = Math;
  WS.PI = M.PI; WS.TAU = M.PI * 2;
  WS.min = M.min; WS.max = M.max; WS.abs = M.abs;
  WS.floor = M.floor; WS.ceil = M.ceil; WS.round = M.round;
  WS.sqrt = M.sqrt; WS.sin = M.sin; WS.cos = M.cos; WS.atan2 = M.atan2;

  WS.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  WS.lerp = (a, b, t) => a + (b - a) * t;

  /** Returns unit dx, dy and the original length. Zero-safe. */
  WS.normalize = function (dx, dy) {
    const d = M.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) return [0, 0, 0];
    return [dx / d, dy / d, d];
  };
  WS.dist = (ax, ay, bx, by) => M.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
  WS.dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);

  /* ---------------------------------------------------------------- random */
  // Deterministic-ish xorshift so a seeded run can be reproduced for debugging.
  let seed = (Date.now() ^ 0x9e3779b9) >>> 0;
  WS.setSeed = (s) => { seed = (s >>> 0) || 1; };
  WS.random = function () {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  /** Inclusive integer range, or [0, a] when b is omitted. */
  WS.randInt = function (a, b) {
    if (b === undefined) { b = a; a = 0; }
    return a + WS.floor(WS.random() * (b - a + 1));
  };
  WS.randRange = (a, b) => a + WS.random() * (b - a);
  WS.pick = (arr) => arr[WS.floor(WS.random() * arr.length)];
  WS.chance = (p) => WS.random() < p;

  /** Weighted pick over [{weight}] entries. */
  WS.weightedPick = function (list) {
    let total = 0;
    for (const e of list) total += (e.weight || 1);
    let roll = WS.random() * total;
    for (const e of list) {
      roll -= (e.weight || 1);
      if (roll <= 0) return e;
    }
    return list[list.length - 1];
  };

  /** Weighted pick that also removes the winner (sampling without replacement). */
  WS.takeWeighted = function (list) {
    if (!list.length) return null;
    const chosen = WS.weightedPick(list);
    const i = list.indexOf(chosen);
    if (i >= 0) list.splice(i, 1);
    return chosen;
  };

  WS.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = WS.floor(WS.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  /* ---------------------------------------------------------------- format */
  WS.formatTime = function (seconds) {
    const s = WS.max(0, WS.floor(seconds));
    return `${WS.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  WS.formatNumber = function (n) {
    n = WS.floor(n);
    return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M'
      : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k'
        : String(n);
  };
  WS.rgb = (c, a) => a === undefined
    ? `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`
    : `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;
  WS.hex = function (c) {
    const h = (v) => WS.clamp(WS.round(v * 255), 0, 255).toString(16).padStart(2, '0');
    return '#' + h(c[0]) + h(c[1]) + h(c[2]);
  };
  WS.shade = (c, k) => [WS.clamp(c[0] * k, 0, 1), WS.clamp(c[1] * k, 0, 1), WS.clamp(c[2] * k, 0, 1)];
  WS.mix = (a, b, t) => [WS.lerp(a[0], b[0], t), WS.lerp(a[1], b[1], t), WS.lerp(a[2], b[2], t)];

  /* ------------------------------------------------------------------ pool */
  /** Fixed-capacity object pool. `active` is a dense array; Release swaps the
   *  tail into the freed slot, so iteration must handle in-place removal. */
  WS.Pool = class Pool {
    constructor(factory, reset, cap) {
      this.factory = factory; this.reset = reset; this.cap = cap || 512;
      this.active = []; this.free = [];
    }
    get count() { return this.active.length; }
    acquire() {
      if (this.active.length >= this.cap) return null;
      const o = this.free.pop() || this.factory();
      o._dead = false;
      this.active.push(o);
      return o;
    }
    release(o) {
      const i = this.active.indexOf(o);
      if (i < 0) return;
      this.active[i] = this.active[this.active.length - 1];
      this.active.pop();
      o._dead = true;
      if (this.reset) this.reset(o);
      this.free.push(o);
    }
    releaseAt(i) {
      const o = this.active[i];
      this.active[i] = this.active[this.active.length - 1];
      this.active.pop();
      o._dead = true;
      if (this.reset) this.reset(o);
      this.free.push(o);
      return o;
    }
    releaseAll() {
      while (this.active.length) this.releaseAt(this.active.length - 1);
    }
  };

  /* ---------------------------------------------------------- spatial hash */
  /** Uniform grid over the world, rebuilt once per tick. Collision queries in
   *  the addon used an 80px hash; same here. */
  WS.Grid = class Grid {
    constructor(cell) { this.cell = cell || 80; this.buckets = new Map(); }
    clear() { this.buckets.clear(); }
    key(x, y) { return ((y / this.cell) | 0) * 4096 + ((x / this.cell) | 0); }
    insert(e) {
      const k = this.key(e.x, e.y);
      let b = this.buckets.get(k);
      if (!b) { b = []; this.buckets.set(k, b); }
      b.push(e);
    }
    /** Calls fn(entity) for everything in the cells overlapping the radius. */
    query(x, y, radius, fn) {
      const c = this.cell;
      const x0 = ((x - radius) / c) | 0, x1 = ((x + radius) / c) | 0;
      const y0 = ((y - radius) / c) | 0, y1 = ((y + radius) / c) | 0;
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const b = this.buckets.get(gy * 4096 + gx);
          if (!b) continue;
          for (let i = 0; i < b.length; i++) fn(b[i]);
        }
      }
    }
  };

  /* --------------------------------------------------------------- helpers */
  /** Substitutes {field}, {field%}, {field*%} and {field~%} in a description,
   *  exactly like the addon's tooltip templating:
   *    {v}    -> raw value            {v%}   -> value x100
   *    {v*%}  -> (value-1) x100       {v~%}  -> (1-value) x100 */
  WS.template = function (text, source) {
    if (!text) return '';
    return text.replace(/\{(\w+)([%*~]*)\}/g, (all, key, op) => {
      const v = source[key];
      if (v === undefined) return all;
      if (op === '%') return String(WS.round(v * 100));
      if (op === '*%') return String(WS.round((v - 1) * 100));
      if (op === '~%') return String(WS.round((1 - v) * 100));
      return String(WS.round(v * 100) / 100);
    });
  };

  WS.CONST = {
    TICK_RATE: 1 / 60,          // the browser build simulates at 60 Hz
    MAX_TICKS_PER_FRAME: 5,
    PLAYER_DAMAGE_SCALE: 0.91,
    PLAYER_SPEED_SCALE: 0.91,
    PLAYER_COOLDOWN_SCALE: 1.099,
    ENEMY_SCALE: 1.08,
    WORLD_WIDTH: 1280,
    WORLD_HEIGHT: 720,
    MAX_ENEMIES: 320,
    MAX_PROJECTILES: 460,
    MAX_GEMS: 260,
    MAX_PICKUPS: 48,
    MAX_FLOATING_TEXT: 64,
    PLAYER_RADIUS: 18,
    COLORS: {
      physical: [0.90, 0.80, 0.60],
      arcane: [0.55, 0.45, 1.00],
      fire: [1.00, 0.45, 0.10],
      frost: [0.35, 0.75, 1.00],
      nature: [0.35, 0.85, 0.35],
      holy: [1.00, 0.88, 0.35],
      shadow: [0.70, 0.30, 0.95],
      enemy: [1.00, 0.30, 0.25],
      elite: [1.00, 0.70, 0.10],
      boss: [0.90, 0.20, 0.90],
      gold: [1.00, 0.82, 0.10],
      heal: [0.25, 0.90, 0.30],
      gemLow: [0.30, 0.95, 0.40],
      gemMid: [0.25, 0.55, 1.00],
      gemHigh: [0.75, 0.35, 1.00],
      arc: [0.96, 0.77, 0.42],
    },
    QUALITY: {
      common: [0.91, 0.93, 0.96],
      uncommon: [0.24, 0.86, 0.48],
      rare: [0.35, 0.75, 1.00],
      epic: [0.70, 0.31, 0.95],
      legendary: [0.96, 0.77, 0.42],
    },
  };

})(window.WS);
