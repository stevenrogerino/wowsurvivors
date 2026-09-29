/* LIGHT. The night had no light in it.
 *
 * Every battlefield was lit the same from edge to edge: a bolt of frostfire
 * crossing the field left the ground under it exactly as it was, the survivor
 * stood in no more light than a creature at the far edge, and midnight looked
 * like dusk. The art was all there; the air between it was not.
 *
 * So the lit world (ground, props, ground effects, creatures) is laid under a
 * light map before anything that glows is drawn on it:
 *
 *   ambient   the night itself: a tint per battlefield, deepest at midnight
 *             and warming toward dawn, multiplied over the field.
 *   lights    every source adds to it: the survivor's own glow, each bolt,
 *             blade, beam and flash in its colour, fields and hazards,
 *             telegraphed danger, loot, and anything on the map that glows.
 *   spill     the same lights added once more, faintly, in colour - which is
 *             what makes a blue bolt turn the ground blue as it passes.
 *
 * Both maps are a quarter of the world's size and drawn with cached sprites,
 * so a full late-game frame costs a few hundred small drawImage calls on a
 * 320x180 canvas and two full-size composites. Spells, particles and numbers
 * are drawn after it and are not darkened: they are the light.
 *
 * Bloom comes last (R.bloom below the light code): a small copy of the finished
 * field, multiplied by itself until only what was bright is left, softened
 * by scaling and added back. It is taken from the frame, so it needs nothing
 * from the systems that drew it.
 *
 * Readability is the rule, not an afterthought: the night never takes the
 * field below AMB_FLOOR, telegraphed danger is a light of its own, and the
 * warnings that restate danger are drawn after all of this. */
'use strict';
(function (WS) {
  const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
  const S = 0.25;                         // light map scale
  const LW = Math.round(W * S), LH = Math.round(H * S);

  const Lit = WS.Lighting = { enabled: true };

  /* The night's colour, per battlefield: what the moon makes of it. Tints,
     not colours - multiplied over art that is already coloured. */
  const TINT = {
    thornhollow: [0.80, 0.92, 1.00],
    dustreach: [0.96, 0.86, 1.00],
    mourneholt: [0.80, 0.82, 1.00],
    ochre: [1.00, 0.88, 0.80],
    palewastes: [0.84, 0.94, 1.00],
    highmoor: [0.82, 0.88, 1.00],
    boss_arena: [0.86, 0.80, 1.00],
  };
  const DAWN = [1.00, 0.86, 0.72];
  // Brightness at dusk, at midnight, and the least it is ever allowed to be.
  const AMB_DUSK = 0.94, AMB_MIDNIGHT = 0.70, AMB_FLOOR = 0.66;
  const NIGHT = 1800;                     // the night runs to dawn at 30:00

  /* Things on the field that give off light of their own, by prop kind:
     [colour, radius as a share of the prop's size, strength]. */
  const GLOWS = {
    crystal: [[0.55, 0.85, 1.0], 1.3, 0.45],
    ice: [[0.6, 0.85, 1.0], 0.9, 0.22],
    mushroom: [[0.55, 1.0, 0.75], 1.1, 0.35],
    standing: [[0.6, 0.75, 1.0], 0.9, 0.18],
    grave: [[0.6, 0.7, 1.0], 0.6, 0.10],
    spire: [[0.6, 0.85, 1.0], 0.8, 0.2],
  };

  let map = null, mg = null, spill = null, sg = null;
  function canvases() {
    if (map) return;
    map = document.createElement('canvas'); map.width = LW; map.height = LH;
    mg = map.getContext('2d');
    spill = document.createElement('canvas'); spill.width = LW; spill.height = LH;
    sg = spill.getContext('2d');
  }

  /* One soft disc per colour, white at the centre in that colour and gone at
     the edge, cached by colour quantised to sixteen steps a channel - there
     are only so many colours of spell. The falloff is squared, which is how
     light fades and why a disc of it does not look like a disc. */
  const SPR = 64;
  const sprites = new Map();
  function sprite(c) {
    const r = (c[0] * 15 + 0.5) | 0, g = (c[1] * 15 + 0.5) | 0, b = (c[2] * 15 + 0.5) | 0;
    const k = (r << 8) | (g << 4) | b;
    let s = sprites.get(k);
    if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = SPR;
    const x = s.getContext('2d');
    const img = x.createImageData(SPR, SPR);
    const cr = r * 17, cg = g * 17, cb = b * 17;
    for (let py = 0; py < SPR; py++) {
      for (let px = 0; px < SPR; px++) {
        const dx = (px + 0.5) / SPR * 2 - 1, dy = (py + 0.5) / SPR * 2 - 1;
        const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
        const f = (1 - d) * (1 - d);
        const i = (py * SPR + px) * 4;
        img.data[i] = cr; img.data[i + 1] = cg; img.data[i + 2] = cb;
        img.data[i + 3] = Math.round(f * 255);
      }
    }
    x.putImageData(img, 0, 0);
    sprites.set(k, s);
    return s;
  }

  /* A light: position and radius in world units, strength 0..1. */
  let budget = 0;
  function add(x, y, r, c, a) {
    if (a <= 0.01 || r < 2 || budget-- <= 0) return;
    if (x + r < 0 || y + r < 0 || x - r > W || y - r > H) return;
    const s = sprite(c);
    const px = (x - r) * S, py = (y - r) * S, d = 2 * r * S;
    sg.globalAlpha = a > 1 ? 1 : a;
    sg.drawImage(s, px, py, d, d);
  }

  /** The night's ambient light now: [r, g, b], 0..1. */
  Lit.ambient = function (run) {
    const t = run ? WS.clamp((run.time || 0) / NIGHT, 0, 1) : 0.5;
    const mapId = run && run.mapId;
    const tint = TINT[mapId] || TINT.thornhollow;
    // Deepest at midnight, easing out both ways; the last fifth warms.
    const depth = 1 - Math.pow(Math.abs(t - 0.5) * 2, 1.6);
    let k = AMB_DUSK + (AMB_MIDNIGHT - AMB_DUSK) * depth;
    let c = tint;
    if (t > 0.8) c = WS.mix(tint, DAWN, (t - 0.8) / 0.2 * 0.55);
    if (run && run.finaleCleared) { c = DAWN; k = 1; }
    k = Math.max(AMB_FLOOR, k);
    return [WS.clamp(c[0] * k, 0, 1), WS.clamp(c[1] * k, 0, 1), WS.clamp(c[2] * k, 0, 1)];
  };

  const WARM = [1.0, 0.80, 0.55], DANGER = [1.0, 0.25, 0.18], GOLD = [1.0, 0.82, 0.4];

  /** Gather every light on the field into the spill map. */
  function gather(R, player, time) {
    sg.globalCompositeOperation = 'source-over';
    sg.globalAlpha = 1;
    sg.clearRect(0, 0, LW, LH);
    sg.globalCompositeOperation = 'lighter';
    budget = R.lite ? 160 : 420;

    // Anything on the map that glows of itself.
    for (const p of R.props) {
      const gl = GLOWS[p.kind];
      if (gl) add(p.x, p.y, p.size * gl[1], gl[0], gl[2] * (p.alpha === undefined ? 1 : p.alpha));
    }

    const P = WS.Projectile;
    // Bolts: small, many. A crowded frame lights every other one.
    const bolts = P.bolts;
    const step = bolts.count > 160 ? 2 : 1;
    for (let i = 0; i < bolts.count; i += step) {
      const b = bolts.active[i];
      if (!b.colour) continue;
      add(b.x, b.y, 34 + b.radius * 5, b.colour, 0.30 * step);
    }
    // Orbiting blades, where each one is.
    for (let i = 0; i < P.orbits.count; i++) {
      const o = P.orbits.active[i];
      if (!o.colour || !player) continue;
      const n = Math.min(o.count || 1, 8);
      for (let k = 0; k < n; k++) {
        const a = (o.angle || 0) + k * WS.TAU / (o.count || 1);
        add(player.x + Math.cos(a) * o.radius, player.y + Math.sin(a) * o.radius, 60 + (o.size || 8) * 2, o.colour, 0.28);
      }
    }
    // Beams: a light every so often along their length.
    for (let i = 0; i < P.beams.count; i++) {
      const b = P.beams.active[i];
      if (!b.colour) continue;
      const fade = WS.clamp(b.life / (b.maxLife || 1), 0, 1);
      const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
      const n = Math.min(8, 1 + (len / 90) | 0);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        add(b.x1 + (b.x2 - b.x1) * t, b.y1 + (b.y2 - b.y1) * t, 70 + (b.width || 6) * 3, b.colour, 0.34 * fade);
      }
    }
    // Lingering fields and their colour on the ground.
    for (let i = 0; i < P.zones.count; i++) {
      const z = P.zones.active[i];
      if (!z.colour) continue;
      add(z.x, z.y, z.radius * 1.35, z.colour, 0.22);
    }
    // Impacts: a flash lights what it hits, and is gone as fast.
    const FX = WS.FX;
    for (let i = 0; i < FX.flashes.count; i++) {
      const f = FX.flashes.active[i];
      if (!f.colour) continue;
      const k = WS.clamp(f.life / (f.maxLife || 1), 0, 1);
      add(f.x, f.y, Math.max(50, f.radius * 1.8), f.colour, 0.55 * k);
    }
    if (FX.strikes) {
      for (let i = 0; i < FX.strikes.count; i++) {
        const s = FX.strikes.active[i];
        if (!s.colour) continue;
        const k = WS.clamp(s.life / (s.maxLife || 1), 0, 1);
        add(s.x + Math.cos(s.aim || 0) * (s.reach || 0) * 0.5, s.y + Math.sin(s.aim || 0) * (s.reach || 0) * 0.5,
          (s.reach || 60) * 1.1, s.colour, 0.4 * k);
      }
    }
    // Hazards on the ground: what the creatures leave that can hurt you.
    const hz = WS.Hazard && WS.Hazard.pool;
    if (hz) {
      for (let i = 0; i < hz.count; i++) {
        const h = hz.active[i];
        add(h.x, h.y, (h.radius || 60) * 1.3, h.tint || DANGER, 0.18);
      }
    }
    // Loot glints.
    const pk = WS.Pickup && WS.Pickup.pool;
    if (pk) for (let i = 0; i < pk.count; i++) add(pk.active[i].x, pk.active[i].y, 46, GOLD, 0.3);
    const pool = WS.Enemy.pool;
    let warn = 12;                        // telegraph lights, at most
    for (let i = 0; i < pool.count; i++) {
      const e = pool.active[i];
      /* Telegraphed danger is a light of its own, so the night never hides
         it: a charge lights its lane, anything else the ground around it. */
      const t = e.telegraph;
      if (!t || warn <= 0) continue;
      const k = t.maxLife ? 1 - WS.clamp(t.life / t.maxLife, 0, 1) : 1;
      if (t.kind === 'lane' && t.length) {
        warn -= 2;
        const a = Math.atan2(t.dy || 0, t.dx || 1);
        const ox = t.firing && t.ox !== undefined ? t.ox : e.x, oy = t.firing && t.oy !== undefined ? t.oy : e.y;
        add(ox + Math.cos(a) * t.length * 0.35, oy + Math.sin(a) * t.length * 0.35, (t.width || 60) * 1.6, DANGER, 0.12 + 0.12 * k);
        add(ox + Math.cos(a) * t.length * 0.8, oy + Math.sin(a) * t.length * 0.8, (t.width || 60) * 1.6, DANGER, 0.12 + 0.12 * k);
      } else {
        warn--;
        add(e.x, e.y, (t.radius || e.radius * 3 || 80) * 1.2, DANGER, 0.1 + 0.15 * k);
      }
    }
  }

  /** Lay the night over the lit world. Call with ctx in world space. */
  Lit.apply = function (ctx, R, time) {
    if (!Lit.enabled || WS.Save.settings.lighting === false || R.shed >= 3) return;
    const game = WS.Game;
    if (!game.player || (WS.Arena && WS.Arena.active && WS.Arena.darkness > 0)) return;
    canvases();
    const amb = Lit.ambient(game.run);
    Lit.last = amb;
    gather(R, game.player, time);

    // The light map: ambient, plus every light on top of it.
    mg.globalCompositeOperation = 'source-over';
    mg.globalAlpha = 1;
    mg.fillStyle = WS.hex(amb);
    mg.fillRect(0, 0, LW, LH);
    mg.globalCompositeOperation = 'lighter';
    mg.drawImage(spill, 0, 0);
    /* The survivor carries the watch fire with them: a wide warm pool and a
       brighter heart, breathing very slightly so it reads as flame. It lights
       what stands near them; it does not colour it (so it is not in the
       spill), because a creature in the survivor's light is still the colour
       it is. */
    {
      const p = game.player;
      const f = 1 + 0.03 * Math.sin(time * 7.3) + 0.02 * Math.sin(time * 13.1);
      const s1 = sprite(WARM);
      mg.globalAlpha = 0.5;
      let r = 330 * f;
      mg.drawImage(s1, (p.x - r) * S, (p.y - r) * S, 2 * r * S, 2 * r * S);
      mg.globalAlpha = 0.4;
      r = 150 * f;
      mg.drawImage(s1, (p.x - r) * S, (p.y - r) * S, 2 * r * S, 2 * r * S);
      mg.globalAlpha = 1;
    }

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(map, 0, 0, W, H);
    // The spill: light in its own colour on what it falls on.
    if (!R.lite) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.13 * (R.lightDim || 1);
      ctx.drawImage(spill, 0, 0, W, H);
    }
    ctx.restore();
  };

  /* ---- bloom ------------------------------------------------------------ */
  let b1 = null, b2 = null, b3 = null;
  function bloomCanvases() {
    if (b1) return;
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    b1 = mk(Math.round(W / 4), Math.round(H / 4));
    b2 = mk(Math.round(W / 8), Math.round(H / 8));
    b3 = mk(Math.round(W / 16), Math.round(H / 16));
  }

  /* What glows, glowing. `src` is the whole canvas; `rect` is where the
     world sits in it, in device pixels. Call with ctx in world space. */
  Lit.bloom = function (ctx, R, src, rect) {
    if (R.lite || WS.Save.settings.bloom === false || R.shed >= 1 || !WS.Game.player) return;
    bloomCanvases();
    const g1 = b1.getContext('2d');
    g1.globalCompositeOperation = 'copy';
    g1.globalAlpha = 1;
    g1.imageSmoothingEnabled = true;
    g1.drawImage(src, rect[0], rect[1], rect[2], rect[3], 0, 0, b1.width, b1.height);
    // Keep only the near-white: x^16. A lit creature at 0.85 keeps 0.07; a
    // spell core at 0.98 keeps 0.72; the ground keeps nothing. (At x^8 a
    // crowd of creatures flashing as they were hit glowed as one mass.)
    g1.globalCompositeOperation = 'multiply';
    g1.drawImage(b1, 0, 0);
    g1.drawImage(b1, 0, 0);
    g1.drawImage(b1, 0, 0);
    g1.drawImage(b1, 0, 0);
    // Soften by scaling down twice and back up.
    const g2 = b2.getContext('2d'), g3 = b3.getContext('2d');
    g2.globalCompositeOperation = 'copy'; g2.imageSmoothingEnabled = true;
    g2.drawImage(b1, 0, 0, b2.width, b2.height);
    g3.globalCompositeOperation = 'copy'; g3.imageSmoothingEnabled = true;
    g3.drawImage(b2, 0, 0, b3.width, b3.height);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    // A busy frame is already light enough (R.lightDim, the light budget).
    const dim = R.lightDim || 1;
    ctx.globalAlpha = 0.24 * dim * dim;
    ctx.drawImage(b2, 0, 0, W, H);
    ctx.globalAlpha = 0.36 * dim * dim;
    ctx.drawImage(b3, 0, 0, W, H);
    ctx.restore();
  };
})(window.WS);
