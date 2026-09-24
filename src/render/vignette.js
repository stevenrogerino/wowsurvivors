/* Living pictures for the menu.
 *
 * The two cartouches - the survivor you are about to be and the place you are
 * about to stand in - used to hold a still: a sprite in a lit box, and a dusk
 * gradient with a row of props along it. Both were correct and neither was a
 * place. These are small scenes that keep moving while you read the panel
 * beside them: a survivor keeping watch at a fire with something in the trees
 * watching back, and each battlefield in its own weather.
 *
 * They are made of what the rest of the game is made of - the hero rig, the
 * bestiary, the props - and nothing is loaded. Randomness here comes from a
 * local generator, never WS.random: a menu that burned draws off the game's
 * seeded stream would change the run it is about to start.
 *
 * One animation loop serves every live picture, at ~30fps, and a picture
 * drops out of it the moment its canvas leaves the page. With reduced motion
 * asked for, each is painted once and left still.
 */
'use strict';
(function (WS) {

  const live = new Set();
  let raf = 0;
  const FRAME = 1 / 30;

  function still() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /** mulberry32. Small, fast, and nobody else's stream. */
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /** Smooth, cheap, non-repeating wobble in [-1, 1]. */
  function wob(t, a) {
    return (Math.sin(t * 1.7 + a) * 0.5 + Math.sin(t * 2.9 + a * 1.3) * 0.3
      + Math.sin(t * 5.3 + a * 2.1) * 0.2);
  }

  function mount(key, paint, opts) {
    const canvas = document.createElement('canvas');
    canvas.className = 'vignette';
    const v = { canvas, paint, opts: opts || {}, rnd: rng(hash(key)), s: null,
      born: performance.now() / 1000, last: -1, idle: 0, painted: false };
    live.add(v);
    if (!raf) raf = requestAnimationFrame(tick);
    return canvas;
  }

  function tick(ms) {
    raf = 0;
    const now = ms / 1000;
    const calm = still();
    for (const v of live) {
      if (!v.canvas.isConnected) {
        // Built and never shown, or shown and since replaced: either way done.
        if (v.painted || ++v.idle > 90) live.delete(v);
        continue;
      }
      if (calm && v.painted) { live.delete(v); continue; }
      if (now - v.last < FRAME) continue;
      v.last = now;
      frame(v, calm ? 7.5 : now - v.born + 3);
    }
    if (live.size) raf = requestAnimationFrame(tick);
  }

  function frame(v, t) {
    const c = v.canvas;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    const dpr = WS.min(2, window.devicePixelRatio || 1);
    const bw = WS.round(w * dpr), bh = WS.round(h * dpr);
    if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; v.s = null; }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!v.s) { v.s = {}; v.rnd = rng(hash(String(v.opts.key || '')) ^ bw); }
    g.save();
    v.paint(g, w, h, t, v);
    g.restore();
    v.painted = true;
  }

  /* --------------------------------------------------------- shared bits -- */
  function skyFill(g, w, top, stops) {
    const sky = g.createLinearGradient(0, 0, 0, top);
    stops.forEach((c, i) => sky.addColorStop(i / (stops.length - 1), c));
    g.fillStyle = sky;
    g.fillRect(0, 0, w, top + 1);
  }

  function stars(g, v, w, top, t, n, tint) {
    if (!v.s.stars) {
      v.s.stars = [];
      for (let i = 0; i < n; i++) {
        v.s.stars.push({ x: v.rnd(), y: v.rnd() * v.rnd(), r: 0.3 + v.rnd() * 0.8,
          ph: v.rnd() * 6.28, big: v.rnd() < 0.08 });
      }
    }
    g.fillStyle = tint || '#dfe6ff';
    for (const s of v.s.stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * (1.1 + s.ph * 0.2) + s.ph);
      g.globalAlpha = (s.big ? 0.9 : 0.45) * tw;
      g.beginPath(); g.arc(s.x * w, s.y * top * 0.95, s.big ? s.r + 0.5 : s.r, 0, WS.TAU); g.fill();
    }
    g.globalAlpha = 1;
  }

  /** A range of hills as one filled silhouette, stable per picture. */
  function ridge(g, v, name, w, base, lo, hi, colour, peaks) {
    if (!v.s[name]) {
      const pts = [];
      const n = peaks || 7;
      for (let i = 0; i <= n; i++) pts.push({ x: (i + (v.rnd() - 0.5) * 0.6) / n, y: lo + v.rnd() * (hi - lo) });
      v.s[name] = pts;
    }
    const pts = v.s[name];
    g.fillStyle = colour;
    g.beginPath();
    g.moveTo(-2, base + 2);
    g.lineTo(-2, base - pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const mx = (a.x + b.x) / 2 * w, my = base - (a.y + b.y) / 2 + (hi - lo) * 0.35;
      g.quadraticCurveTo(a.x * w, base - a.y, mx, my);
    }
    const last = pts[pts.length - 1];
    g.lineTo(w + 2, base - last.y);
    g.lineTo(w + 2, base + 2);
    g.closePath();
    g.fill();
  }

  /** A row of conifers, as a jagged band. */
  function pines(g, v, name, w, base, size, colour, density) {
    if (!v.s[name]) {
      const trees = [];
      let x = -size;
      while (x < w + size) {
        trees.push({ x, h: size * (0.55 + v.rnd() * 0.7), wd: size * (0.26 + v.rnd() * 0.14) });
        x += size * (density || 0.34) * (0.6 + v.rnd() * 0.8);
      }
      v.s[name] = trees;
    }
    g.fillStyle = colour;
    g.beginPath();
    g.moveTo(-size, base + 2);
    for (const tr of v.s[name]) {
      // Three tiers per tree: a pine is a stack of skirts, not one triangle.
      const x = tr.x, b = base, hh = tr.h, wd = tr.wd;
      g.lineTo(x - wd, b);
      g.lineTo(x - wd * 0.35, b - hh * 0.38);
      g.lineTo(x - wd * 0.7, b - hh * 0.36);
      g.lineTo(x - wd * 0.22, b - hh * 0.7);
      g.lineTo(x - wd * 0.45, b - hh * 0.68);
      g.lineTo(x, b - hh);
      g.lineTo(x + wd * 0.45, b - hh * 0.68);
      g.lineTo(x + wd * 0.22, b - hh * 0.7);
      g.lineTo(x + wd * 0.7, b - hh * 0.36);
      g.lineTo(x + wd * 0.35, b - hh * 0.38);
      g.lineTo(x + wd, b);
    }
    g.lineTo(w + size, base + 2);
    g.closePath();
    g.fill();
  }

  /** A sprite flooded to one colour - the silhouette of a thing against sky. */
  const SIL = new Map();
  function sil(src, colour) {
    const key = (src.__vk || (src.__vk = 'v' + SIL.size + ':' + Math.random())) + colour;
    let c = SIL.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = colour;
    x.fillRect(0, 0, c.width, c.height);
    SIL.set(key, c);
    return c;
  }

  function beast(art, size, colour) {
    if (!WS.Sprites.has(art)) return null;
    return sil(WS.Sprites.creature(art, [1, 1, 1], WS.round(size)), colour);
  }

  /** A row of the battlefield's own props standing on the skyline. */
  function propLine(g, v, map, w, base, size, colour, count) {
    if (!map.props || !map.props.length) return;
    if (!v.s.props) {
      v.s.props = [];
      for (let i = 0; i < count; i++) {
        v.s.props.push({ kind: map.props[WS.floor(v.rnd() * map.props.length)],
          x: (i + v.rnd() * 0.8) / count, k: 0.7 + v.rnd() * 0.6 });
      }
    }
    for (const p of v.s.props) {
      const ps = WS.round(size * p.k);
      const art = sil(WS.Sprites.prop(p.kind, ps), colour);
      g.drawImage(art, p.x * w - ps / 2, base - ps * 0.78, ps, ps);
    }
  }

  function motes(g, v, name, n, make, draw, t) {
    if (!v.s[name]) { v.s[name] = []; for (let i = 0; i < n; i++) v.s[name].push(make(v.rnd, i)); }
    for (const m of v.s[name]) draw(m, t);
  }

  function frameClose(g, w, h, depth) {
    const vg = g.createRadialGradient(w / 2, h * 0.52, WS.min(w, h) * 0.28, w / 2, h * 0.5, WS.max(w, h) * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${depth})`);
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
  }

  function glow(g, x, y, r, colour, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${colour},${a})`);
    gr.addColorStop(1, `rgba(${colour},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* ------------------------------------------------------ the watch fire -- */
  /* The survivor on watch. The fire is to their left and behind the frame's
   * middle; they stand facing out into the dark, lit along one side and lost
   * on the other. In the treeline, now and then, something opens its eyes. */
  function watchFire(g, w, h, t, v) {
    const o = v.opts;
    const s = WS.min(w, h);
    const horizon = h * 0.60;
    const floor = h * 0.86;
    const fx = w / 2 - s * 0.23, fy = floor + s * 0.01;
    // One flicker drives every light the fire casts, so they breathe together.
    const flick = 0.82 + 0.12 * wob(t * 3.1, 0.4) + 0.06 * Math.sin(t * 17.3);

    skyFill(g, w, horizon, ['#04060c', '#080c18', '#121626', '#1b1a26']);
    stars(g, v, w, horizon, t, 46);

    // A low, thin moon behind cloud, far right.
    const mx = w * 0.82, my = h * 0.17, mr = s * 0.045;
    crescent(g, v, mx, my, mr);
    // Cloud sliding across it.
    const cx = ((t * 3.2) % (w * 1.6)) - w * 0.3;
    g.fillStyle = 'rgba(14,17,28,.8)';
    g.beginPath(); g.ellipse(cx, my + mr * 0.8, s * 0.2, s * 0.028, 0, 0, WS.TAU); g.fill();
    g.beginPath(); g.ellipse(cx + s * 0.1, my + mr * 0.2, s * 0.13, s * 0.02, 0, 0, WS.TAU); g.fill();

    ridge(g, v, 'far', w, horizon, s * 0.05, s * 0.13, '#0d1120', 6);
    pines(g, v, 'wood', w, horizon + s * 0.02, s * 0.2, '#05070c', 0.3);

    /* The eyes. A long cycle so they are something you catch rather than
       something that happens; two blinks while they are open. */
    const cyc = (t + 4) % 11;
    if (cyc > 6.4 && cyc < 9.6) {
      const open = WS.clamp((cyc - 6.4) * 3, 0, 1) * WS.clamp((9.6 - cyc) * 3, 0, 1);
      const blink = (Math.abs(cyc - 7.7) < 0.07 || Math.abs(cyc - 8.9) < 0.06) ? 0.1 : 1;
      const ex = w / 2 + s * 0.4, ey = horizon - s * 0.045;
      g.save();
      g.globalCompositeOperation = 'lighter';
      glow(g, ex, ey, s * 0.05, '255,60,40', 0.16 * open);
      g.fillStyle = `rgba(255,120,90,${0.95 * open})`;
      for (const dx of [-1, 1]) {
        g.beginPath(); g.ellipse(ex + dx * s * 0.014, ey, s * 0.007, s * 0.0045 * blink, 0, 0, WS.TAU); g.fill();
      }
      g.restore();
    }

    // Ground: the clearing, dark earth warmed where the fire reaches it.
    const gr = g.createLinearGradient(0, horizon, 0, h);
    gr.addColorStop(0, '#07080b');
    gr.addColorStop(1, '#0d0b0a');
    g.fillStyle = gr;
    g.fillRect(0, horizon + s * 0.015, w, h - horizon);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.beginPath(); g.ellipse(fx, fy, s * 0.62 * flick, s * 0.16 * flick, 0, 0, WS.TAU);
    g.clip();
    glow(g, fx, fy, s * 0.62 * flick, '255,120,40', 0.28);
    g.restore();

    // The survivor, baked once per picture, relit every frame.
    const hs = WS.round(s * 0.58);
    const hero = WS.Sprites.hero(o.id, o.tint, hs, false, undefined, undefined, o.rank || 0);
    const hx = w / 2 + s * 0.1, hy = floor - s * 0.01;
    if (!v.s.lit || v.s.lit.width !== hero.width) {
      v.s.lit = document.createElement('canvas');
      v.s.lit.width = hero.width; v.s.lit.height = hero.height;
    }
    const lit = v.s.lit, lg = lit.getContext('2d');
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, lit.width, lit.height);
    lg.drawImage(hero, 0, 0);
    lg.globalCompositeOperation = 'source-atop';
    // Firelight along the near side, night along the far one.
    const side = lg.createLinearGradient(0, 0, lit.width, 0);
    side.addColorStop(0.18, `rgba(255,150,70,${0.42 * flick})`);
    side.addColorStop(0.52, 'rgba(255,150,70,0)');
    side.addColorStop(0.62, 'rgba(6,8,16,0)');
    side.addColorStop(0.9, 'rgba(6,8,16,.55)');
    lg.fillStyle = side;
    lg.fillRect(0, 0, lit.width, lit.height);

    // Shadows first: a contact shadow, and the long one the fire throws.
    g.save();
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.beginPath(); g.ellipse(hx, hy, s * 0.1, s * 0.022, 0, 0, WS.TAU); g.fill();
    g.globalAlpha = 0.34 * flick;
    g.translate(hx, hy);
    g.transform(1, 0, -1.6, 0.26, 0, 0);
    g.drawImage(sil(hero, '#000'), -hs / 2, -hs * 0.72, hs, hs);
    g.restore();

    // A slow breath - two percent of height, so they are standing, not posed.
    const breath = 1 + 0.008 * Math.sin(t * 1.5);
    g.save();
    g.translate(hx, hy);
    g.scale(1, breath);
    g.drawImage(lit, -hs / 2, -hs * 0.72, hs, hs);
    g.restore();

    fire(g, v, fx, fy, s, t, flick);

    // The light the fire throws over everything, very softly.
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, fx, fy - s * 0.08, s * 0.75, '255,110,40', 0.09 * flick);
    g.restore();

    frameClose(g, w, h, 0.62);
  }

  function fire(g, v, fx, fy, s, t, flick) {
    // Stones.
    g.fillStyle = '#16161a';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.05 + i * 0.15);
      g.beginPath();
      g.ellipse(fx + Math.cos(a) * s * 0.085 * (i % 2 ? 1 : 0.94), fy + s * 0.004 - Math.sin(a) * s * -0.012,
        s * 0.02, s * 0.012, 0, 0, WS.TAU);
      g.fill();
    }
    // Logs, crossed, their ends glowing.
    g.save();
    g.translate(fx, fy - s * 0.008);
    for (const r of [-0.32, 0.3]) {
      g.save(); g.rotate(r);
      g.fillStyle = '#2a1a12';
      g.fillRect(-s * 0.075, -s * 0.011, s * 0.15, s * 0.022);
      g.fillStyle = `rgba(255,120,40,${0.7 * flick})`;
      g.fillRect(-s * 0.02, -s * 0.011, s * 0.04, s * 0.022);
      g.restore();
    }
    g.restore();

    // Flames: five tongues, each on its own clock, three colours deep.
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, fx, fy - s * 0.04, s * 0.2 * flick, '255,140,50', 0.5);
    const layers = [['194,58,22', 1.0, 0.8], ['255,128,40', 0.78, 0.85], ['255,206,110', 0.52, 0.9], ['255,246,214', 0.3, 0.9]];
    for (const [col, k, a] of layers) {
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * s * 0.022 * k;
        const ht = s * 0.17 * k * (0.62 + 0.38 * (0.5 + 0.5 * wob(t * 3.3, i * 1.9))) * (i === 2 ? 1.15 : 0.85);
        const sway = wob(t * 2.2, i * 2.7 + 1) * s * 0.018;
        const bw = s * 0.03 * k;
        g.fillStyle = `rgba(${col},${a})`;
        g.beginPath();
        g.moveTo(fx + off - bw, fy - s * 0.01);
        g.quadraticCurveTo(fx + off - bw * 0.9, fy - ht * 0.55, fx + off + sway, fy - ht);
        g.quadraticCurveTo(fx + off + bw * 0.9, fy - ht * 0.5, fx + off + bw, fy - s * 0.01);
        g.closePath();
        g.fill();
      }
    }
    // Embers, lifted and turned by the heat.
    motes(g, v, 'embers', 22, (r) => ({ off: r() * 10, life: 1.6 + r() * 1.8, dx: (r() - 0.5) * 2, r: 0.5 + r() * 0.9, ph: r() * 6 }),
      (m, tt) => {
        const p = ((tt + m.off) % m.life) / m.life;
        const x = fx + m.dx * s * 0.05 * p + Math.sin(tt * 3 + m.ph) * s * 0.02 * p;
        const y = fy - s * 0.06 - p * s * 0.62;
        g.fillStyle = `rgba(255,${WS.round(190 - 90 * p)},90,${(1 - p) * 0.95})`;
        g.beginPath(); g.arc(x, y, m.r * (1 - p * 0.5), 0, WS.TAU); g.fill();
      }, t);
    g.restore();

    // Smoke, barely there.
    motes(g, v, 'smoke', 5, (r, i) => ({ off: i * 1.3, life: 6.5 }), (m, tt) => {
      const p = ((tt + m.off) % m.life) / m.life;
      g.fillStyle = `rgba(120,120,135,${0.07 * Math.sin(p * Math.PI)})`;
      g.beginPath();
      g.arc(fx + Math.sin(tt * 0.5 + m.off) * s * 0.04 + p * s * 0.08, fy - s * 0.2 - p * s * 0.45, s * (0.04 + p * 0.09), 0, WS.TAU);
      g.fill();
    }, t);
  }

  /* -------------------------------------------------------- battlefields -- */
  /* Each place in its own weather. One painter per art key; the palette comes
   * from the map so a retuned battlefield keeps its picture honest. */
  const PLACES = {
    forest(g, w, h, t, v, m) {
      const s = WS.min(w, h), horizon = h * 0.62;
      skyFill(g, w, horizon, ['#03070a', '#07120f', '#10231c', '#1c3226']);
      stars(g, v, w, horizon, t, 40, '#e4f2e8');
      moonDisc(g, w * 0.74, h * 0.2, s * 0.06, '#e6f0dc', '170,210,170', 0.12);
      ridge(g, v, 'far', w, horizon, s * 0.06, s * 0.16, '#0b1814', 6);
      pines(g, v, 'far-wood', w, horizon + s * 0.01, s * 0.18, '#08120e', 0.26);
      inn(g, w * 0.3, horizon + s * 0.005, s, t);
      fog(g, v, 'fog', w, horizon - s * 0.02, s, t, '160,210,180', 0.07);
      ground(g, w, h, horizon + s * 0.02, '#07100a', '#0c160f');
      pines(g, v, 'near-wood', w, h * 1.02, s * 0.34, '#030504', 0.9);
      walker(g, v, 'wolf', s * 0.18, horizon + s * 0.2, w, t, 14, 0.45, '#020403', '255,210,120');
      // Fireflies: the one warm thing in these woods that is not a lamp.
      motes(g, v, 'flies', 16, (r) => ({ x: r(), y: 0.5 + r() * 0.45, ph: r() * 9, sp: 0.4 + r() * 0.5 }), (f, tt) => {
        const on = Math.max(0, Math.sin(tt * f.sp * 2 + f.ph));
        if (on < 0.05) return;
        const x = (f.x + Math.sin(tt * 0.3 * f.sp + f.ph) * 0.05) * w;
        const y = f.y * h + Math.cos(tt * 0.4 + f.ph) * s * 0.03;
        g.save(); g.globalCompositeOperation = 'lighter';
        glow(g, x, y, s * 0.03, '210,255,120', 0.35 * on);
        g.fillStyle = `rgba(236,255,170,${on})`;
        g.beginPath(); g.arc(x, y, 1.1, 0, WS.TAU); g.fill();
        g.restore();
      }, t);
      frameClose(g, w, h, 0.6);
    },

    plains(g, w, h, t, v, m) {
      const s = WS.min(w, h), horizon = h * 0.64;
      skyFill(g, w, horizon, ['#140c0c', '#3a1c12', '#8a4418', '#d9892e']);
      // A low sun, half down, and a haze band across it.
      const sx = w * 0.34, sy = horizon - s * 0.02, sr = s * 0.16;
      glow(g, sx, sy, sr * 3.2, '255,170,80', 0.35);
      g.fillStyle = '#ffd98a';
      g.beginPath(); g.arc(sx, sy, sr, 0, WS.TAU); g.fill();
      g.fillStyle = 'rgba(160,70,30,.35)';
      for (let i = 0; i < 3; i++) g.fillRect(0, sy - sr * (0.2 + i * 0.3), w, s * 0.012);
      ridge(g, v, 'far', w, horizon, s * 0.02, s * 0.07, '#4a2412', 5);
      propLine(g, v, m, w, horizon + s * 0.02, s * 0.2, '#1e0e07', 7);
      ground(g, w, h, horizon + s * 0.015, '#1c0f07', '#120904');
      // A vulture, patient, circling.
      const va = t * 0.45;
      const vb = beast('vulture', s * 0.16, '#160906');
      if (vb) {
        const vx = w * 0.64 + Math.cos(va) * s * 0.16, vy = h * 0.2 + Math.sin(va) * s * 0.05;
        g.save(); g.translate(vx, vy); if (Math.sin(va) > 0) g.scale(-1, 1);
        g.drawImage(vb, -s * 0.08, -s * 0.08, s * 0.16, s * 0.16); g.restore();
      }
      // Dust on the wind, always going the same way.
      motes(g, v, 'dust', 34, (r) => ({ y: r(), off: r(), sp: 0.25 + r() * 0.35, len: 4 + r() * 10 }), (d, tt) => {
        const x = ((d.off + tt * d.sp) % 1.2 - 0.1) * w;
        const y = horizon - s * 0.1 + d.y * (h - horizon + s * 0.1) + Math.sin(tt + d.off * 9) * 2;
        g.strokeStyle = 'rgba(240,190,120,.18)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + d.len, y - 0.6); g.stroke();
      }, t);
      frameClose(g, w, h, 0.55);
    },

    haunted(g, w, h, t, v, m) {
      const s = WS.min(w, h), horizon = h * 0.64;
      skyFill(g, w, horizon, ['#030208', '#0a0816', '#16112a', '#231a36']);
      stars(g, v, w, horizon, t, 30, '#d8d2f0');
      // The moon, too big and too close, and cloud crossing it.
      const mx = w * 0.56, my = h * 0.3, mr = s * 0.17;
      glow(g, mx, my, mr * 2.6, '200,190,240', 0.16);
      const face = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr);
      face.addColorStop(0, '#efeaf8'); face.addColorStop(1, '#a9a2c4');
      g.fillStyle = face;
      g.beginPath(); g.arc(mx, my, mr, 0, WS.TAU); g.fill();
      g.fillStyle = 'rgba(120,110,150,.35)';
      for (const [dx, dy, r] of [[-0.3, -0.1, 0.22], [0.25, 0.3, 0.16], [0.1, -0.4, 0.1], [-0.1, 0.35, 0.09]]) {
        g.beginPath(); g.arc(mx + dx * mr, my + dy * mr, r * mr, 0, WS.TAU); g.fill();
      }
      for (let i = 0; i < 3; i++) {
        const cx = ((t * (4 + i * 2) + i * w * 0.5) % (w * 1.8)) - w * 0.4;
        g.fillStyle = `rgba(8,6,16,${0.7 - i * 0.12})`;
        g.beginPath(); g.ellipse(cx, my + (i - 1) * mr * 0.55, s * (0.22 + i * 0.05), s * 0.03, 0, 0, WS.TAU); g.fill();
      }
      ridge(g, v, 'far', w, horizon, s * 0.03, s * 0.09, '#0c0916', 6);
      propLine(g, v, m, w, horizon + s * 0.03, s * 0.28, '#050409', 7);
      ground(g, w, h, horizon + s * 0.02, '#07060c', '#0b0913');
      // Something pale drifting between the stones.
      const wr = beast('wraith', s * 0.26, 'rgba(190,200,230,1)');
      if (wr) {
        const p = ((t / 22) % 1);
        const x = w * (1.15 - p * 1.3), y = horizon + s * 0.02 + Math.sin(t * 1.3) * s * 0.02;
        g.save(); g.globalAlpha = 0.16 + 0.1 * Math.sin(t * 0.9);
        g.drawImage(wr, x - s * 0.13, y - s * 0.2, s * 0.26, s * 0.26); g.restore();
      }
      fog(g, v, 'fog', w, horizon + s * 0.06, s, t, '150,130,200', 0.1);
      // Corpse-lights.
      motes(g, v, 'wisps', 5, (r) => ({ x: 0.1 + r() * 0.8, y: 0.7 + r() * 0.2, ph: r() * 9 }), (d, tt) => {
        const x = d.x * w + Math.sin(tt * 0.5 + d.ph) * s * 0.05;
        const y = d.y * h + Math.sin(tt * 0.8 + d.ph * 2) * s * 0.03;
        const a = 0.5 + 0.5 * Math.sin(tt * 1.2 + d.ph);
        g.save(); g.globalCompositeOperation = 'lighter';
        glow(g, x, y, s * 0.05, '140,255,190', 0.3 * a);
        g.restore();
      }, t);
      frameClose(g, w, h, 0.66);
    },

    savannah(g, w, h, t, v, m) {
      const s = WS.min(w, h), horizon = h * 0.62;
      skyFill(g, w, horizon, ['#2a0a0a', '#6a1a10', '#b93a16', '#f07a2a']);
      // "Red earth, white sun." It sits high and it does not blink.
      const sx = w * 0.64, sy = h * 0.24, sr = s * 0.08;
      glow(g, sx, sy, sr * 5, '255,236,200', 0.3);
      glow(g, sx, sy, sr * 2, '255,250,235', 0.6);
      g.fillStyle = '#fffaf0';
      g.beginPath(); g.arc(sx, sy, sr, 0, WS.TAU); g.fill();
      ridge(g, v, 'far', w, horizon, s * 0.03, s * 0.1, '#6e1e10', 4);
      // Heat, warping the skyline.
      g.save();
      for (let i = 0; i < 5; i++) {
        const y = horizon - s * 0.05 + i * s * 0.02;
        g.fillStyle = `rgba(255,170,110,${0.06 + 0.04 * Math.sin(t * 3 + i)})`;
        g.fillRect(Math.sin(t * 2 + i) * 3, y, w, s * 0.008);
      }
      g.restore();
      propLine(g, v, m, w, horizon + s * 0.02, s * 0.22, '#2c0b06', 6);
      ground(g, w, h, horizon + s * 0.015, '#3a1208', '#1e0804');
      cracks(g, v, w, h, horizon + s * 0.05, s);
      walker(g, v, 'raptor', s * 0.2, horizon + s * 0.2, w, t, 11, 0.55, '#1a0603', null, -1);
      walker(g, v, 'raptor', s * 0.15, horizon + s * 0.12, w, t + 2.1, 13, 0.55, '#260905', null, -1);
      frameClose(g, w, h, 0.55);
    },

    glacier(g, w, h, t, v, m) {
      const s = WS.min(w, h), horizon = h * 0.64;
      skyFill(g, w, horizon, ['#02040a', '#050d1e', '#0b1d34', '#163150']);
      stars(g, v, w, horizon, t, 60, '#e2f0ff');
      aurora(g, w, h, s, t);
      ridge(g, v, 'far', w, horizon, s * 0.06, s * 0.2, '#1a2e4a', 5);
      ridge(g, v, 'mid', w, horizon + s * 0.01, s * 0.01, s * 0.06, '#101f36', 7);
      // Him. Far off, on the ridge, not moving. You notice him late.
      const ms = s * 0.2;
      const mf = beast('marrowfrost', ms, '#03060d');
      if (mf) {
        const x = w * 0.62, y = horizon + s * 0.005;
        g.drawImage(mf, x - ms / 2, y - ms * 0.76, ms, ms);
        const a = 0.55 + 0.45 * Math.sin(t * 0.7);
        g.save(); g.globalCompositeOperation = 'lighter';
        glow(g, x, y - ms * 0.52, s * 0.05, '160,230,255', 0.5 * a);
        g.fillStyle = `rgba(220,248,255,${a})`;
        g.fillRect(x - ms * 0.06, y - ms * 0.53, 1.6, 1.3);
        g.fillRect(x + ms * 0.03, y - ms * 0.53, 1.6, 1.3);
        g.restore();
      }
      propLine(g, v, m, w, horizon + s * 0.03, s * 0.24, '#07101e', 6);
      ground(g, w, h, horizon + s * 0.02, '#0e1a2c', '#172840');
      motes(g, v, 'snow', 46, (r) => ({ x: r(), off: r(), sp: 0.05 + r() * 0.08, r: 0.4 + r() * 1.1, ph: r() * 9 }), (f, tt) => {
        const y = ((f.off + tt * f.sp) % 1.05) * h;
        const x = (f.x + Math.sin(tt * 0.6 + f.ph) * 0.02 - tt * 0.006) % 1;
        g.fillStyle = `rgba(230,244,255,${0.35 + f.r * 0.3})`;
        g.beginPath(); g.arc((x < 0 ? x + 1 : x) * w, y, f.r, 0, WS.TAU); g.fill();
      }, t);
      frameClose(g, w, h, 0.6);
    },

    arena(g, w, h, t, v, m) {
      const s = WS.min(w, h), horizon = h * 0.66;
      skyFill(g, w, horizon, ['#040208', '#0d0618', '#1d0c2a', '#35163a']);
      stars(g, v, w, horizon, t, 36, '#f0dcff');
      // The eclipse: a black disc and a corona that will not sit still.
      const ex = w * 0.5, ey = h * 0.32, er = s * 0.14;
      glow(g, ex, ey, er * 3.4, '190,120,255', 0.22);
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * WS.TAU + t * 0.1;
        const len = er * (0.25 + 0.35 * (0.5 + 0.5 * wob(t * 1.4, i * 1.7)));
        g.strokeStyle = 'rgba(230,190,255,.22)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(ex + Math.cos(a) * er, ey + Math.sin(a) * er);
        g.lineTo(ex + Math.cos(a) * (er + len), ey + Math.sin(a) * (er + len));
        g.stroke();
      }
      glow(g, ex, ey, er * 1.35, '255,230,255', 0.55);
      g.restore();
      g.fillStyle = '#030106';
      g.beginPath(); g.arc(ex, ey, er, 0, WS.TAU); g.fill();
      ridge(g, v, 'far', w, horizon, s * 0.02, s * 0.06, '#100818', 5);
      // Broken columns, the arena's ring.
      g.fillStyle = '#07040c';
      for (const [x, ht, br] of [[0.08, 0.34, 0.1], [0.24, 0.22, 0.05], [0.78, 0.28, 0.08], [0.93, 0.4, 0.04]]) {
        const cx = x * w, cw = s * 0.07, top = horizon - s * ht;
        g.fillRect(cx - cw / 2, top, cw, horizon - top + 2);
        g.fillRect(cx - cw * 0.7, horizon - s * 0.02, cw * 1.4, s * 0.03);
        g.beginPath(); g.moveTo(cx - cw / 2, top); g.lineTo(cx, top - s * br); g.lineTo(cx + cw / 2, top + s * 0.02); g.fill();
      }
      ground(g, w, h, horizon, '#0a0612', '#120a1c');
      motes(g, v, 'sparks', 24, (r) => ({ x: r(), off: r() * 8, life: 3 + r() * 3, r: 0.5 + r() }), (d, tt) => {
        const p = ((tt + d.off) % d.life) / d.life;
        const x = (d.x + Math.sin(tt * 0.7 + d.off) * 0.02) * w;
        const y = h - p * h * 0.9;
        g.fillStyle = `rgba(214,160,255,${Math.sin(p * Math.PI) * 0.7})`;
        g.beginPath(); g.arc(x, y, d.r, 0, WS.TAU); g.fill();
      }, t);
      frameClose(g, w, h, 0.62);
    },
  };

  /** A crescent, cut properly - a darker disc laid over it shows as a disc. */
  function crescent(g, v, x, y, r) {
    const px = WS.ceil(r * 2 + 4) * 2;
    if (!v.s.moon || v.s.moon.width !== px) {
      const c = document.createElement('canvas');
      c.width = c.height = px;
      const m = c.getContext('2d');
      const k = px / 2, rr = r * 2;
      const face = m.createRadialGradient(k - rr * 0.3, k - rr * 0.3, 0, k, k, rr);
      face.addColorStop(0, '#f1f4ff'); face.addColorStop(1, '#b7c3de');
      m.fillStyle = face;
      m.beginPath(); m.arc(k, k, rr, 0, WS.TAU); m.fill();
      m.globalCompositeOperation = 'destination-out';
      m.beginPath(); m.arc(k - rr * 0.45, k - rr * 0.2, rr * 0.93, 0, WS.TAU); m.fill();
      v.s.moon = c;
    }
    glow(g, x, y, r * 6, '170,186,226', 0.10);
    g.drawImage(v.s.moon, x - px / 4, y - px / 4, px / 2, px / 2);
  }

  /** Baked earth, split into plates. */
  function cracks(g, v, w, h, top, s) {
    if (!v.s.cracks) {
      v.s.cracks = [];
      for (let i = 0; i < 16; i++) {
        const pts = [];
        let x = v.rnd() * w, y = top + v.rnd() * (h - top);
        for (let j = 0; j < 4; j++) { pts.push([x, y]); x += (v.rnd() - 0.5) * s * 0.18; y += (v.rnd() - 0.3) * s * 0.05; }
        v.s.cracks.push(pts);
      }
    }
    g.strokeStyle = 'rgba(12,3,2,.55)';
    g.lineWidth = 1;
    for (const pts of v.s.cracks) {
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) g.lineTo(p[0], p[1]);
      g.stroke();
    }
  }

  /** The last inn: a roofline, a chimney, and one window someone left lit. */
  function inn(g, x, base, s, t) {
    const bw = s * 0.16, bh = s * 0.07;
    g.fillStyle = '#050a08';
    g.fillRect(x - bw / 2, base - bh, bw, bh + 2);
    g.beginPath();
    g.moveTo(x - bw * 0.6, base - bh); g.lineTo(x - bw * 0.1, base - bh - s * 0.06);
    g.lineTo(x + bw * 0.2, base - bh - s * 0.06); g.lineTo(x + bw * 0.62, base - bh); g.fill();
    g.fillRect(x + bw * 0.22, base - bh - s * 0.075, s * 0.014, s * 0.04);
    const lamp = 0.8 + 0.2 * wob(t * 2, 3);
    g.save(); g.globalCompositeOperation = 'lighter';
    glow(g, x - bw * 0.18, base - bh * 0.5, s * 0.07, '255,180,90', 0.35 * lamp);
    g.fillStyle = `rgba(255,200,120,${0.95 * lamp})`;
    g.fillRect(x - bw * 0.24, base - bh * 0.66, s * 0.016, s * 0.02);
    g.fillRect(x + bw * 0.12, base - bh * 0.66, s * 0.016, s * 0.02);
    g.restore();
    for (let i = 0; i < 4; i++) {
      const p = ((t * 0.12 + i / 4) % 1);
      g.fillStyle = `rgba(150,170,160,${0.1 * Math.sin(p * Math.PI)})`;
      g.beginPath();
      g.arc(x + bw * 0.23 + p * s * 0.06, base - bh - s * 0.08 - p * s * 0.14, s * (0.012 + p * 0.03), 0, WS.TAU);
      g.fill();
    }
  }

  function moonDisc(g, x, y, r, face, halo, a) {
    glow(g, x, y, r * 5, halo, a);
    g.fillStyle = face;
    g.beginPath(); g.arc(x, y, r, 0, WS.TAU); g.fill();
  }

  function ground(g, w, h, top, a, b) {
    const gr = g.createLinearGradient(0, top, 0, h);
    gr.addColorStop(0, a); gr.addColorStop(1, b);
    g.fillStyle = gr;
    g.fillRect(0, top, w, h - top);
  }

  function fog(g, v, name, w, y, s, t, rgb, a) {
    for (let i = 0; i < 3; i++) {
      const x = ((t * (5 + i * 3) + i * w * 0.6) % (w * 1.6)) - w * 0.3;
      const gr = g.createRadialGradient(x, y + i * s * 0.03, 0, x, y + i * s * 0.03, s * 0.5);
      gr.addColorStop(0, `rgba(${rgb},${a})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.save();
      g.translate(0, y); g.scale(1, 0.25); g.translate(0, -y);
      g.fillStyle = gr;
      g.fillRect(x - s * 0.5, y - s * 0.5, s, s * 1.2);
      g.restore();
    }
    void v; void name;
  }

  function aurora(g, w, h, s, t) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const bands = [['80,255,190', 0.26, 0.14, 0.0], ['90,200,255', 0.16, 0.24, 1.7], ['170,120,255', 0.1, 0.1, 3.1]];
    for (const [rgb, a, y0, ph] of bands) {
      for (let x = 0; x < w; x += 2) {
        const k = x / w;
        const top = h * (y0 + 0.06 * Math.sin(k * 5 + t * 0.35 + ph) + 0.03 * Math.sin(k * 11 - t * 0.6 + ph));
        const len = h * (0.14 + 0.06 * Math.sin(k * 7 + t * 0.5 + ph));
        const shimmer = 0.6 + 0.4 * Math.sin(k * 23 + t * 1.3 + ph);
        const gr = g.createLinearGradient(0, top, 0, top + len);
        gr.addColorStop(0, `rgba(${rgb},0)`);
        gr.addColorStop(0.25, `rgba(${rgb},${a * shimmer})`);
        gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr;
        g.fillRect(x, top, 2, len);
      }
    }
    g.restore();
    void s;
  }

  /** Something crossing the frame on the ground, now and then. */
  function walker(g, v, art, size, y, w, t, period, duty, colour, eyes, dir) {
    const b = beast(art, size, colour);
    if (!b) return;
    const p = (t % period) / period;
    if (p > duty) return;
    const k = p / duty;
    const d = dir || 1;
    const x = d > 0 ? -size + k * (w + size * 2) : w + size - k * (w + size * 2);
    const bob = Math.abs(Math.sin(t * 9)) * size * 0.03;
    g.save();
    g.translate(x, y - bob);
    if (d < 0) g.scale(-1, 1);
    g.drawImage(b, -size / 2, -size * 0.7, size, size);
    g.restore();
    if (eyes) {
      g.save(); g.globalCompositeOperation = 'lighter';
      glow(g, x + d * size * 0.2, y - size * 0.38 - bob, size * 0.08, eyes, 0.6);
      g.restore();
    }
    void v;
  }

  WS.Vignette = {
    /** The survivor, on watch. */
    survivor(id, tint, rank) {
      return mount('s:' + id, watchFire, { key: 's:' + id, id, tint, rank });
    },
    /** A battlefield, in its own weather. */
    battlefield(id) {
      const m = WS.Maps[id];
      const paint = PLACES[m.art] || PLACES.forest;
      return mount('m:' + id, (g, w, h, t, v) => paint(g, w, h, t, v, m), { key: 'm:' + id });
    },
    /** How many pictures are currently animating - for the checks. */
    get live() { return live.size; },
  };

})(window.WS);
