/* The finale, drawn.
 *
 * The machines are drawn live, every frame, in world units scaled from their
 * own radius: a drill that turns, treads that roll, sails that fill, a
 * cockpit that pops open when it overheats. The same painters, called once
 * with `still`, become the portraits the boss banner and the bestiary use.
 *
 * Telegraphs follow the rule the Eclipse Arena settled: a thing you must
 * react to cannot be told by colour alone. Doomed ground is hatched and the
 * hatching tightens as it lands; safe ground wears corner brackets.
 */
'use strict';
(function (WS) {

  const UI_FONT = "'Archivo', 'Segoe UI', system-ui, sans-serif";
  // The storyteller's face - the one every speaking part in the menus uses.
  const VOICE_FONT = "'Alegreya', 'Iowan Old Style', Georgia, serif";
  const A = {};

  const rgba = (c, a) => WS.rgb(c, WS.clamp(a, 0, 1));
  function pal(tint) {
    return {
      hi: WS.hex(WS.mix(tint, [1, 1, 1], 0.35)), mid: WS.hex(WS.shade(tint, 0.85)),
      lo: WS.hex(WS.shade(tint, 0.5)), dark: WS.hex(WS.shade(tint, 0.26)),
      line: WS.hex(WS.shade(tint, 0.1)),
    };
  }
  const IRON = pal([0.42, 0.42, 0.46]);
  const BRASS = pal([0.86, 0.66, 0.32]);
  const WOOD = pal([0.52, 0.34, 0.2]);

  function rrect(ctx, x, y, w, h, r) {
    r = WS.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function plate(ctx, x, y, w, h, r, p) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, p.hi); g.addColorStop(0.45, p.mid); g.addColorStop(1, p.lo);
    rrect(ctx, x, y, w, h, r);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = WS.max(1.5, h * 0.05); ctx.strokeStyle = p.line; ctx.stroke();
  }

  function shape(ctx, pts, p, lw) {
    let minY = 1e9, maxY = -1e9;
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      minY = WS.min(minY, y); maxY = WS.max(maxY, y);
    });
    ctx.closePath();
    const g = ctx.createLinearGradient(0, minY, 0, maxY);
    g.addColorStop(0, p.hi); g.addColorStop(0.5, p.mid); g.addColorStop(1, p.lo);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = lw || 2; ctx.strokeStyle = p.line; ctx.stroke();
  }

  function rivets(ctx, x0, x1, y, n, r) {
    ctx.fillStyle = 'rgba(20,16,12,.55)';
    for (let i = 0; i < n; i++) {
      const x = x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1));
      ctx.beginPath(); ctx.arc(x, y, r, 0, WS.TAU); ctx.fill();
    }
  }

  /* ---------------------------------------------------------- material -- */
  /* The machines were plates and rivets in flat gradients - clip-art beside
   * Marrowfrost. What a made thing has that a diagram of it does not is
   * WEAR: seams where two plates meet, bolts that catch the light, soot
   * where the heat goes, scratches where things hit it. These are the marks,
   * laid inside whatever the caller has clipped to, so none of them can grow
   * a silhouette. All deterministic from a seed: a machine does not get new
   * scratches every frame. */
  function hsh(n) { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }

  /** An engraved line: a dark cut with a lit lip on its lower side. */
  function seam(ctx, x0, y0, x1, y1, w) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(12,8,6,.55)'; ctx.lineWidth = w || 1.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,215,.18)'; ctx.lineWidth = (w || 1.4) * 0.7;
    ctx.beginPath(); ctx.moveTo(x0 + 0.8, y0 + 1.1); ctx.lineTo(x1 + 0.8, y1 + 1.1); ctx.stroke();
    ctx.restore();
  }

  /** A bolt head: a dark ring, a body, and a point of light upper left. */
  function bolt(ctx, x, y, r, p) {
    ctx.fillStyle = 'rgba(10,8,6,.6)';
    ctx.beginPath(); ctx.arc(x + r * 0.2, y + r * 0.25, r * 1.15, 0, WS.TAU); ctx.fill();
    ctx.fillStyle = (p || IRON).mid;
    ctx.beginPath(); ctx.arc(x, y, r, 0, WS.TAU); ctx.fill();
    ctx.fillStyle = (p || IRON).hi;
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.4, 0, WS.TAU); ctx.fill();
  }
  function boltRow(ctx, x0, x1, y, n, r, p) {
    for (let i = 0; i < n; i++) bolt(ctx, x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1)), y, r, p);
  }

  /** Scratches and soot over a box, from a seed. */
  function wear(ctx, x, y, w, h, seed, n, soot) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const sx = x + hsh(seed + i) * w, sy = y + hsh(seed + i * 3.1) * h;
      const len = (0.04 + hsh(seed + i * 7.3) * 0.08) * w, a = -0.4 + hsh(seed + i * 5.7) * 0.8;
      ctx.strokeStyle = 'rgba(255,245,225,.22)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.moveTo(sx, sy + 1); ctx.lineTo(sx + Math.cos(a) * len, sy + 1 + Math.sin(a) * len); ctx.stroke();
    }
    for (let i = 0; i < (soot || 0); i++) {
      const sx = x + hsh(seed + 40 + i) * w, sy = y + hsh(seed + 60 + i) * h, r = (0.08 + hsh(seed + 80 + i) * 0.14) * w;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, 'rgba(18,12,8,.32)'); g.addColorStop(1, 'rgba(18,12,8,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, WS.TAU); ctx.fill();
    }
    ctx.restore();
  }

  /** Drips running down from a line: wax, rust, oil - whatever `col` is. */
  function drips(ctx, x0, x1, y, n, len, w, col, seed) {
    ctx.save();
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const dx = x0 + (x1 - x0) * ((i + 0.5) / n) + (hsh(seed + i) - 0.5) * (x1 - x0) / n * 0.6;
      const l = len * (0.35 + hsh(seed + i * 2.3) * 0.65), ww = w * (0.7 + hsh(seed + i * 4.1) * 0.5);
      ctx.beginPath();
      ctx.moveTo(dx - ww, y);
      ctx.lineTo(dx - ww * 0.7, y + l);
      ctx.arc(dx, y + l, ww * 0.75, WS.PI, 0, true);
      ctx.lineTo(dx + ww, y);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function glow(ctx, x, y, r, col, a) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, WS.TAU); ctx.fill();
    ctx.restore();
  }

  function flame(ctx, x, y, h, t) {
    const f = 1 + 0.18 * WS.sin(t * 17) + 0.1 * WS.sin(t * 29);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y - h * 0.4, 0, x, y - h * 0.4, h * f);
    g.addColorStop(0, 'rgba(255,240,190,.95)');
    g.addColorStop(0.45, 'rgba(255,170,60,.7)');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.45 * f, h * 0.32, h * 0.7 * f, 0, 0, WS.TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Grimtunnel himself, in a glass bubble - he is in every one of them. */
  function pilot(ctx, x, y, r, t, still) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, WS.TAU); ctx.clip();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
    g.addColorStop(0, 'rgba(190,225,255,.55)');
    g.addColorStop(1, 'rgba(30,45,70,.75)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    /* His head and shoulders, not the whole of him: the bubble is a
       cockpit window and he is leaning into it. */
    const sz = WS.round(r * 4.2);
    const bob = still ? 0 : WS.sin(t * 5) * r * 0.05;
    ctx.drawImage(WS.Sprites.creature('grimtunnel', [1.0, 0.86, 0.5], sz),
      x - sz * 0.47, y - sz * 0.35 + bob, sz, sz);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = WS.max(2, r * 0.14);
    ctx.strokeStyle = BRASS.lo;
    ctx.beginPath(); ctx.arc(x, y, r, 0, WS.TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = WS.max(1, r * 0.08);
    ctx.beginPath(); ctx.arc(x, y, r * 0.78, WS.PI * 1.15, WS.PI * 1.55); ctx.stroke();
    ctx.restore();
  }

  function aimAt(e, still) {
    const p = WS.Game.player;
    if (still || !p) return -WS.PI / 2;
    return WS.atan2(p.y - e.y, p.x - e.x);
  }

  /* ------------------------------------------------------------ machines -- */
  const M = {};

  M.candlecrawler = function (ctx, e, t, o) {
    const R = e.radius, x = e.x, y = e.y, f = e.facing < 0 ? -1 : 1;
    const busy = !o.still && (e.windup > 0 || e.chargeTimer > 0);
    const rise = e.rise === undefined ? 1 : e.rise;
    ctx.save();
    if (rise < 1) {
      ctx.beginPath(); ctx.rect(x - R * 3, y - R * 3, R * 6, R * 3.9); ctx.clip();
      ctx.translate(0, (1 - rise) * R * 1.8);
    }
    if (busy && e.windup > 0) ctx.translate(WS.randRange(-2, 2), WS.randRange(-2, 2));
    const p = pal(e.template.tint);
    const WAX = pal([0.96, 0.9, 0.74]);

    // the exhaust, behind everything: a bent stack and what comes out of it
    const ex = x - f * R * 0.98, ey = y - R * 0.3;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = IRON.line; ctx.lineWidth = R * 0.16;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - f * R * 0.08, ey - R * 0.5); ctx.lineTo(ex - f * R * 0.22, ey - R * 0.62); ctx.stroke();
    ctx.strokeStyle = IRON.mid; ctx.lineWidth = R * 0.1;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - f * R * 0.08, ey - R * 0.5); ctx.lineTo(ex - f * R * 0.22, ey - R * 0.62); ctx.stroke();
    ctx.restore();
    if (!o.wreck) {
      for (let i = 0; i < 4; i++) {
        const k = o.still ? i / 4 : ((t * (busy ? 1.4 : 0.6) + i / 4) % 1);
        ctx.save();
        ctx.globalAlpha = 0.34 * (1 - k);
        ctx.fillStyle = '#4a4440';
        ctx.beginPath();
        ctx.arc(ex - f * R * (0.26 + k * 0.5), ey - R * (0.66 + k * 0.7), R * (0.07 + k * 0.16), 0, WS.TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    // tracks: a belt of plates round five road wheels and two sprockets
    const treadOff = o.still ? 0 : (t * (e.chargeTimer > 0 ? 260 : 40)) % 14;
    plate(ctx, x - R * 1.25, y + R * 0.3, R * 2.5, R * 0.6, R * 0.3, IRON);
    ctx.save();
    rrect(ctx, x - R * 1.25, y + R * 0.3, R * 2.5, R * 0.6, R * 0.3); ctx.clip();
    for (let tx = x - R * 1.3 - treadOff * f; tx < x + R * 1.3; tx += 14) {
      ctx.strokeStyle = 'rgba(10,10,12,.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(tx, y + R * 0.3); ctx.lineTo(tx + 4, y + R * 0.9); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(tx + 2.4, y + R * 0.3); ctx.lineTo(tx + 6.4, y + R * 0.9); ctx.stroke();
    }
    // mud packed in the lower run
    const mud = ctx.createLinearGradient(0, y + R * 0.62, 0, y + R * 0.9);
    mud.addColorStop(0, 'rgba(60,44,28,0)'); mud.addColorStop(1, 'rgba(60,44,28,.55)');
    ctx.fillStyle = mud; ctx.fillRect(x - R * 1.3, y + R * 0.6, R * 2.6, R * 0.32);
    ctx.restore();
    // the inner run the wheels sit in
    rrect(ctx, x - R * 1.08, y + R * 0.43, R * 2.16, R * 0.34, R * 0.17);
    ctx.fillStyle = 'rgba(14,14,18,.8)'; ctx.fill();
    for (let i = 0; i < 5; i++) {
      const wx = x - R * 0.95 + i * R * 0.475, wr = R * 0.17;
      ctx.fillStyle = IRON.dark;
      ctx.beginPath(); ctx.arc(wx, y + R * 0.6, wr, 0, WS.TAU); ctx.fill();
      const wg = ctx.createRadialGradient(wx - wr * 0.3, y + R * 0.6 - wr * 0.3, 0, wx, y + R * 0.6, wr * 0.8);
      wg.addColorStop(0, IRON.hi); wg.addColorStop(1, IRON.lo);
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(wx, y + R * 0.6, wr * 0.72, 0, WS.TAU); ctx.fill();
      const spin = o.still ? 0 : -t * (e.chargeTimer > 0 ? 18 : 3) * f;
      for (let k = 0; k < 5; k++) {
        const a = spin + k * WS.TAU / 5;
        ctx.fillStyle = IRON.dark;
        ctx.beginPath(); ctx.arc(wx + Math.cos(a) * wr * 0.45, y + R * 0.6 + Math.sin(a) * wr * 0.45, wr * 0.09, 0, WS.TAU); ctx.fill();
      }
      bolt(ctx, wx, y + R * 0.6, wr * 0.2, BRASS);
    }

    // candle smokestacks at the back: wax, dripping, in iron collars
    for (let k = 0; k < 2; k++) {
      const sx = x - f * R * (0.55 + k * 0.3), sy = y - R * 0.3;
      const h = R * (0.62 - k * 0.14);
      plate(ctx, sx - R * 0.1, sy - h, R * 0.2, h, R * 0.06, WAX);
      ctx.save();
      rrect(ctx, sx - R * 0.1, sy - h, R * 0.2, h, R * 0.06); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.fillRect(sx - R * 0.07, sy - h, R * 0.035, h);
      drips(ctx, sx - R * 0.1, sx + R * 0.1, sy - h, 3, h * 0.45, R * 0.022, '#fff8e6', 11 + k * 7);
      ctx.restore();
      ctx.fillStyle = IRON.mid; ctx.strokeStyle = IRON.line; ctx.lineWidth = 1.5;
      rrect(ctx, sx - R * 0.13, sy - h * 0.22, R * 0.26, R * 0.07, R * 0.02); ctx.fill(); ctx.stroke();
      if (!o.wreck) flame(ctx, sx, sy - h, R * 0.28, t + k);
      else {
        ctx.fillStyle = '#1a1612';
        ctx.beginPath(); ctx.ellipse(sx, sy - h, R * 0.08, R * 0.03, 0, 0, WS.TAU); ctx.fill();
      }
    }

    // the hull: a riveted wedge, plated, scorched and scratched
    const hull = [[x - R * 1.1, y + R * 0.38], [x + R * 1.1, y + R * 0.38],
      [x + R * 0.85 * f, y - R * 0.36], [x - R * 0.95 * f, y - R * 0.36]];
    shape(ctx, hull, p, 2.5);
    ctx.save();
    ctx.beginPath(); hull.forEach(([hx, hy], i) => (i ? ctx.lineTo(hx, hy) : ctx.moveTo(hx, hy))); ctx.closePath();
    ctx.clip();
    // plate seams: two uprights and a waist
    seam(ctx, x - R * 0.35, y - R * 0.4, x - R * 0.42, y + R * 0.2);
    seam(ctx, x + R * 0.4, y - R * 0.4, x + R * 0.46, y + R * 0.2);
    seam(ctx, x - R * 1.2, y - R * 0.02, x + R * 1.2, y - R * 0.02);
    // soot up the back where the stacks burn
    const soot = ctx.createRadialGradient(x - f * R * 0.7, y - R * 0.4, 0, x - f * R * 0.7, y - R * 0.4, R * 0.7);
    soot.addColorStop(0, 'rgba(20,12,6,.45)'); soot.addColorStop(1, 'rgba(20,12,6,0)');
    ctx.fillStyle = soot; ctx.fillRect(x - R * 1.2, y - R * 0.5, R * 2.4, R * 0.9);
    wear(ctx, x - R * 1.1, y - R * 0.36, R * 2.2, R * 0.5, 17, 9, 3);
    // wax that ran off the stacks and down the plates
    drips(ctx, x - f * R * 0.88 - R * 0.14, x - f * R * 0.88 + R * 0.14, y - R * 0.37, 2, R * 0.3, R * 0.03, 'rgba(255,246,222,.85)', 5);
    ctx.restore();
    // hazard band, chipped
    ctx.save();
    ctx.beginPath(); ctx.rect(x - R * 1.08, y + R * 0.16, R * 2.16, R * 0.18); ctx.clip();
    ctx.fillStyle = '#e8b73a'; ctx.fillRect(x - R * 1.1, y + R * 0.16, R * 2.2, R * 0.18);
    ctx.fillStyle = '#1c1812';
    for (let bx = x - R * 1.2; bx < x + R * 1.2; bx += R * 0.24) {
      ctx.beginPath();
      ctx.moveTo(bx, y + R * 0.34); ctx.lineTo(bx + R * 0.12, y + R * 0.16);
      ctx.lineTo(bx + R * 0.22, y + R * 0.16); ctx.lineTo(bx + R * 0.1, y + R * 0.34);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(90,80,70,.8)';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.ellipse(x - R + hsh(i + 3) * R * 2, y + R * (0.17 + hsh(i + 9) * 0.15), R * (0.02 + hsh(i) * 0.04), R * 0.02, 0, 0, WS.TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x - R * 1.1, y + R * 0.16, R * 2.2, R * 0.02);
    ctx.restore();
    boltRow(ctx, x - R * 0.9, x + R * 0.9, y - R * 0.22, 7, R * 0.035);
    boltRow(ctx, x - R * 1.0, x + R * 1.0, y + R * 0.08, 9, R * 0.028);
    // the drill: a bit with a spiral flute, a brass collar, and a glint
    const dx0 = x + f * R * 0.95, dy0 = y + R * 0.02;
    const len = R * 0.95, half = R * 0.36;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx0, dy0 - half); ctx.lineTo(dx0 + f * len, dy0); ctx.lineTo(dx0, dy0 + half);
    ctx.closePath();
    const dg = ctx.createLinearGradient(0, dy0 - half, 0, dy0 + half);
    dg.addColorStop(0, '#f2eee6'); dg.addColorStop(0.35, '#b3afa8'); dg.addColorStop(0.7, '#6a6763'); dg.addColorStop(1, '#2e2c2a');
    ctx.fillStyle = dg; ctx.fill();
    ctx.strokeStyle = '#1b1a18'; ctx.lineWidth = 2; ctx.stroke();
    ctx.clip();
    const spin = o.still ? 0 : (t * (busy ? 16 : 5)) % 1;
    for (let s = -1; s < 7; s++) {
      const u = (s + spin) / 6;
      const sx = dx0 + f * len * u;
      ctx.strokeStyle = 'rgba(20,20,22,.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx, dy0 - half); ctx.lineTo(sx + f * len * 0.14, dy0 + half); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx + f * 3, dy0 - half); ctx.lineTo(sx + f * (3 + len * 0.14), dy0 + half); ctx.stroke();
    }
    // earth caked on the flutes nearest the hull
    const earth = ctx.createLinearGradient(dx0, 0, dx0 + f * len * 0.5, 0);
    earth.addColorStop(0, 'rgba(70,50,30,.55)'); earth.addColorStop(1, 'rgba(70,50,30,0)');
    ctx.fillStyle = earth; ctx.fillRect(WS.min(dx0, dx0 + f * len), dy0 - half, len, half * 2);
    ctx.restore();
    // the collar the bit turns in
    ctx.save();
    ctx.translate(dx0, dy0);
    const cg = ctx.createLinearGradient(0, -half * 1.1, 0, half * 1.1);
    cg.addColorStop(0, BRASS.hi); cg.addColorStop(0.5, BRASS.mid); cg.addColorStop(1, BRASS.dark);
    ctx.fillStyle = cg; ctx.strokeStyle = BRASS.line; ctx.lineWidth = 2;
    rrect(ctx, -R * 0.07, -half * 1.12, R * 0.14, half * 2.24, R * 0.04); ctx.fill(); ctx.stroke();
    for (const k of [-0.75, 0, 0.75]) bolt(ctx, 0, half * k, R * 0.03, BRASS);
    ctx.restore();
    if (!o.wreck) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      const gx = dx0 + f * len * 0.97, gy = dy0 - half * 0.02;
      ctx.beginPath();
      ctx.moveTo(gx - R * 0.09, gy); ctx.lineTo(gx, gy - R * 0.015); ctx.lineTo(gx + R * 0.09, gy); ctx.lineTo(gx, gy + R * 0.015);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (busy && e.chargeTimer > 0) {
      glow(ctx, dx0 + f * len, dy0, R * 0.6, [1.0, 0.7, 0.3], 0.6);
    }
    // headlamp: a brass hood, glass, and its beam on the ground ahead
    const hx = x + f * R * 0.62, hy = y - R * 0.2;
    if (!o.wreck) glow(ctx, hx + f * R * 0.2, hy + R * 0.1, R * 0.55, [1.0, 0.92, 0.6], 0.45);
    ctx.fillStyle = BRASS.mid; ctx.strokeStyle = BRASS.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx, hy, R * 0.12, 0, WS.TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = o.wreck ? '#2a2620' : '#fff3c8';
    ctx.beginPath(); ctx.arc(hx + f * R * 0.02, hy, R * 0.075, 0, WS.TAU); ctx.fill();
    if (!o.wreck) glow(ctx, hx, hy, R * 0.35, [1.0, 0.92, 0.6], 0.8);
    // a brass nameplate on the bow: the works number, as if anyone asked
    ctx.fillStyle = BRASS.mid; ctx.strokeStyle = BRASS.line; ctx.lineWidth = 1.2;
    rrect(ctx, x + f * R * 0.36 - R * 0.13, y - R * 0.13, R * 0.26, R * 0.09, R * 0.02); ctx.fill(); ctx.stroke();
    ctx.fillStyle = BRASS.line;
    for (let i = 0; i < 4; i++) ctx.fillRect(x + f * R * 0.36 - R * 0.09 + i * R * 0.05, y - R * 0.1, R * 0.03, R * 0.03);

    // cockpit
    const open = !o.still && e.dmgTaken > 1 && !e.untargetable;
    pilot(ctx, x - f * R * 0.05, y - R * 0.5, R * 0.38, t, o.still);
    if (open) {
      ctx.save();
      ctx.translate(x - f * R * 0.05 - f * R * 0.36, y - R * 0.55);
      ctx.rotate(-f * (0.9 + 0.08 * WS.sin(t * 8)));
      ctx.fillStyle = BRASS.mid; ctx.strokeStyle = BRASS.line; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f * R * 0.36, 0, R * 0.4, WS.PI, 0); ctx.fill(); ctx.stroke();
      ctx.restore();
      glow(ctx, x, y - R * 0.5, R * 0.9, [1.0, 0.3, 0.2], 0.35 + 0.2 * WS.sin(t * 10));
    }
    if (!o.still && !o.wreck && e.health / e.maxHealth < 0.25 && !e.untargetable) {
      glow(ctx, x, y, R * 1.5, [1.0, 0.25, 0.1], 0.18 + 0.12 * WS.sin(t * 7));
    }
    ctx.restore();
  };

  M.turret = function (ctx, e, t, o) {
    const R = e.radius, x = e.x, y = e.y;
    const p = pal(e.template.tint);
    // the mount: a bolted plinth
    plate(ctx, x - R * 0.9, y + R * 0.1, R * 1.8, R * 0.6, R * 0.2, IRON);
    boltRow(ctx, x - R * 0.7, x + R * 0.7, y + R * 0.4, 4, R * 0.05);
    const ang = aimAt(e, o.still);
    ctx.save();
    ctx.translate(x, y - R * 0.1); ctx.rotate(ang);
    plate(ctx, 0, -R * 0.2, R * 1.3, R * 0.4, R * 0.1, IRON);
    for (const k of [0.45, 0.95]) {
      ctx.fillStyle = BRASS.mid; ctx.strokeStyle = BRASS.line; ctx.lineWidth = 1.2;
      rrect(ctx, R * k, -R * 0.23, R * 0.1, R * 0.46, R * 0.03); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#16120e';
    ctx.beginPath(); ctx.ellipse(R * 1.3, 0, R * 0.08, R * 0.2, 0, 0, WS.TAU); ctx.fill();
    ctx.restore();
    // the lantern: a cap, a ring, panes in a frame, and the flame
    const lx = x - R * 0.55, ly = y - R * 0.75, lw = R * 1.1, lh = R * 0.95;
    rrect(ctx, lx, ly, lw, lh, R * 0.3);
    const lg = ctx.createRadialGradient(x, y - R * 0.3, 1, x, y - R * 0.3, R * 0.7);
    lg.addColorStop(0, '#fff3c4'); lg.addColorStop(0.5, p.hi); lg.addColorStop(1, p.lo);
    ctx.fillStyle = lg; ctx.fill();
    ctx.save(); ctx.clip();
    if (!o.wreck) flame(ctx, x, y - R * 0.05, R * 0.55, t + x * 0.01);
    ctx.fillStyle = 'rgba(40,20,6,.3)';
    ctx.beginPath(); ctx.ellipse(x - R * 0.3, ly + R * 0.1, R * 0.3, R * 0.14, 0, 0, WS.TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = IRON.dark; ctx.lineWidth = 2.5;
    rrect(ctx, lx, ly, lw, lh, R * 0.3); ctx.stroke();
    ctx.strokeStyle = 'rgba(30,24,20,.7)'; ctx.lineWidth = 1.8;
    for (const dx of [-0.2, 0.2]) {
      ctx.beginPath(); ctx.moveTo(x + R * dx, ly); ctx.lineTo(x + R * dx, y + R * 0.2); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - R * 0.42, ly + R * 0.2); ctx.lineTo(x - R * 0.42, y - R * 0.05); ctx.stroke();
    // the cap and its ring
    ctx.fillStyle = IRON.mid; ctx.strokeStyle = IRON.line; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lx - R * 0.08, ly + R * 0.08); ctx.lineTo(x, ly - R * 0.3); ctx.lineTo(lx + lw + R * 0.08, ly + R * 0.08); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = IRON.hi; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx, ly + R * 0.04); ctx.lineTo(x, ly - R * 0.26); ctx.stroke();
    ctx.strokeStyle = IRON.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, ly - R * 0.4, R * 0.1, 0, WS.TAU); ctx.stroke();
    if (!o.wreck) glow(ctx, x, y - R * 0.3, R * 1.4, [1.0, 0.8, 0.4], 0.45 + 0.15 * WS.sin(t * 6 + x));
  };

  M.cannon = function (ctx, e, t, o) {
    const R = e.radius, x = e.x, y = e.y;
    // the port: dark inside, framed in gilt, its lid hinged up
    rrect(ctx, x - R * 0.7, y - R * 0.7, R * 1.4, R * 1.2, R * 0.12);
    ctx.fillStyle = WOOD.dark; ctx.fill();
    ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,200,.35)'; ctx.lineWidth = 1;
    rrect(ctx, x - R * 0.62, y - R * 0.62, R * 1.24, R * 1.04, R * 0.1); ctx.stroke();
    ctx.fillStyle = '#c3322c'; ctx.strokeStyle = WOOD.line; ctx.lineWidth = 1.5;
    rrect(ctx, x - R * 0.72, y - R * 1.02, R * 1.44, R * 0.26, R * 0.05); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - R * 0.7, y - R * 0.86, R * 1.4, R * 0.08);
    for (const k of [-0.45, 0.45]) bolt(ctx, x + R * k, y - R * 0.76, R * 0.05, BRASS);
    const ang = o.still ? WS.PI / 2 : WS.clamp(aimAt(e, false), 0.2, WS.PI - 0.2);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    // the barrel: iron, banded, a swelled muzzle
    const bg = ctx.createLinearGradient(0, -R * 0.3, 0, R * 0.3);
    bg.addColorStop(0, '#6a6c74'); bg.addColorStop(0.35, '#3c3e44'); bg.addColorStop(1, '#141418');
    ctx.fillStyle = bg; ctx.strokeStyle = '#0a0a0c'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-R * 0.25, -R * 0.3); ctx.lineTo(R * 1.0, -R * 0.22); ctx.lineTo(R * 1.0, R * 0.22); ctx.lineTo(-R * 0.25, R * 0.3);
    ctx.quadraticCurveTo(-R * 0.45, 0, -R * 0.25, -R * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
    rrect(ctx, R * 0.95, -R * 0.3, R * 0.22, R * 0.6, R * 0.08); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#7a7c84'; ctx.lineWidth = 2.5;
    for (const k of [0.1, 0.55]) { ctx.beginPath(); ctx.moveTo(R * k, -R * 0.27); ctx.lineTo(R * k, R * 0.27); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-R * 0.2, -R * 0.2); ctx.lineTo(R * 1.1, -R * 0.14); ctx.stroke();
    ctx.fillStyle = '#0b0a09';
    ctx.beginPath(); ctx.ellipse(R * 1.17, 0, R * 0.1, R * 0.2, 0, 0, WS.TAU); ctx.fill();
    ctx.restore();
  };

  /** The Kerchief colours: a skull in the family bandana over crossed cutlasses. */
  function kerchiefMark(ctx, cx, cy, s, wreck) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineCap = 'round';
    for (const d of [-1, 1]) {
      ctx.save();
      ctx.rotate(d * 0.75);
      ctx.strokeStyle = wreck ? '#3a3228' : '#2a2622'; ctx.lineWidth = s * 0.16;
      ctx.beginPath(); ctx.moveTo(0, s * 1.05); ctx.quadraticCurveTo(d * s * 0.18, 0, 0, -s * 1.05); ctx.stroke();
      ctx.strokeStyle = wreck ? '#4a4034' : '#b9bec8'; ctx.lineWidth = s * 0.09;
      ctx.beginPath(); ctx.moveTo(0, s * 0.95); ctx.quadraticCurveTo(d * s * 0.18, 0, 0, -s * 0.95); ctx.stroke();
      ctx.fillStyle = wreck ? '#4a4034' : '#c9a24a';
      ctx.fillRect(-s * 0.2, s * 0.7, s * 0.4, s * 0.08);
      ctx.restore();
    }
    // the skull
    ctx.fillStyle = wreck ? '#6d6153' : '#f3ecdc';
    ctx.strokeStyle = wreck ? '#2a2019' : '#3a3026'; ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(-s * 0.46, -s * 0.05);
    ctx.quadraticCurveTo(-s * 0.5, -s * 0.62, 0, -s * 0.64);
    ctx.quadraticCurveTo(s * 0.5, -s * 0.62, s * 0.46, -s * 0.05);
    ctx.quadraticCurveTo(s * 0.44, s * 0.2, s * 0.26, s * 0.3);
    ctx.lineTo(s * 0.24, s * 0.5); ctx.lineTo(-s * 0.24, s * 0.5); ctx.lineTo(-s * 0.26, s * 0.3);
    ctx.quadraticCurveTo(-s * 0.44, s * 0.2, -s * 0.46, -s * 0.05);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // the bandana up over the jaw, knotted at the side
    ctx.fillStyle = wreck ? '#4a2a24' : '#c3322c';
    ctx.beginPath();
    ctx.moveTo(-s * 0.48, s * 0.02); ctx.lineTo(s * 0.48, s * 0.02);
    ctx.lineTo(s * 0.3, s * 0.42); ctx.lineTo(0, s * 0.56); ctx.lineTo(-s * 0.3, s * 0.42); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.46, s * 0.04); ctx.lineTo(s * 0.72, s * 0.2); ctx.lineTo(s * 0.6, s * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,220,.6)';
    for (const [dx, dy] of [[-0.24, 0.16], [0, 0.26], [0.22, 0.14], [-0.1, 0.38], [0.12, 0.38]]) {
      ctx.beginPath(); ctx.arc(dx * s, dy * s, s * 0.035, 0, WS.TAU); ctx.fill();
    }
    // the sockets
    ctx.fillStyle = '#1a1210';
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * s * 0.19, -s * 0.2, s * 0.13, s * 0.15, d * 0.2, 0, WS.TAU); ctx.fill(); }
    ctx.restore();
  }

  M.galleon = function (ctx, e, t, o) {
    const R = e.radius, x = e.x, y = e.y, f = e.facing < 0 ? -1 : 1;
    const wreck = !!o.wreck;
    if (!o.still && !wreck) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(x, y + R * 2.1, R * 1.5, R * 0.22, 0, 0, WS.TAU); ctx.fill();
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const k = ((t * 0.8 + i / 3) % 1);
        ctx.save();
        ctx.globalAlpha = 0.25 * (1 - k);
        ctx.fillStyle = '#c9a877';
        ctx.beginPath();
        ctx.ellipse(x - f * R * (0.4 + k * 1.2), y + R * (0.75 + k * 0.5), R * (0.2 + k * 0.4),
          R * (0.1 + k * 0.15), 0, 0, WS.TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    const billow = o.still ? 0.1 : 0.1 + 0.05 * WS.sin(t * 2.1);
    const masts = wreck ? [[0.5, 0.9]] : [[-0.55, 1.95], [0.5, 1.75]];

    // the bowsprit and its line to the foremast, behind the sails
    const bowX = x + f * R * 1.8, bowY = y - R * 0.3;
    if (!wreck) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = WOOD.line; ctx.lineWidth = R * 0.06;
      ctx.beginPath(); ctx.moveTo(bowX - f * R * 0.2, bowY + R * 0.02); ctx.lineTo(bowX + f * R * 0.5, bowY - R * 0.36); ctx.stroke();
      ctx.strokeStyle = WOOD.hi; ctx.lineWidth = R * 0.02;
      ctx.beginPath(); ctx.moveTo(bowX - f * R * 0.2, bowY + R * 0.0); ctx.lineTo(bowX + f * R * 0.5, bowY - R * 0.38); ctx.stroke();
      ctx.strokeStyle = 'rgba(40,30,20,.7)'; ctx.lineWidth = 1;
      const fore = x + f * R * masts[masts.length - 1][0];
      ctx.beginPath(); ctx.moveTo(bowX + f * R * 0.48, bowY - R * 0.36); ctx.lineTo(fore, y - R * masts[masts.length - 1][1] * 0.92); ctx.stroke();
      // a jib, bellied on that line
      ctx.beginPath();
      ctx.moveTo(bowX + f * R * 0.4, bowY - R * 0.32);
      ctx.lineTo(fore + f * R * 0.12, y - R * masts[masts.length - 1][1] * 0.82);
      ctx.quadraticCurveTo(fore + f * R * (0.5 + billow), y - R * 0.9, fore + f * R * 0.2, y - R * 0.5);
      ctx.closePath();
      const jg = ctx.createLinearGradient(fore, 0, bowX, 0);
      jg.addColorStop(0, '#d8c9a8'); jg.addColorStop(1, '#f0e6cf');
      ctx.fillStyle = jg; ctx.fill();
      ctx.strokeStyle = '#6b5a40'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }

    // masts and sails, behind the hull's rail
    for (const [mx, mh] of masts) {
      const px = x + f * R * mx;
      // shrouds from the top down to the rail, with ratlines across
      if (!wreck) {
        ctx.save();
        ctx.strokeStyle = 'rgba(40,30,20,.55)'; ctx.lineWidth = 1;
        const top = y - R * (mh - 0.1), baseY = y - R * 0.38;
        for (const d of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px + d * R * 0.34, baseY); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(40,30,20,.35)';
        for (let k = 1; k < 6; k++) {
          const yy = top + (baseY - top) * (0.55 + k * 0.08), w = R * 0.34 * (0.55 + k * 0.08);
          ctx.beginPath(); ctx.moveTo(px - w, yy); ctx.lineTo(px + w, yy); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.strokeStyle = WOOD.line; ctx.lineWidth = R * 0.07;
      ctx.beginPath(); ctx.moveTo(px, y - R * 0.2); ctx.lineTo(px, y - R * mh); ctx.stroke();
      ctx.strokeStyle = WOOD.hi; ctx.lineWidth = R * 0.025;
      ctx.beginPath(); ctx.moveTo(px - R * 0.015, y - R * 0.2); ctx.lineTo(px - R * 0.015, y - R * mh); ctx.stroke();
      const sw = R * 0.55, top = y - R * (mh - 0.15), bot = y - R * 0.45;
      const sail = () => {
        ctx.beginPath();
        ctx.moveTo(px - sw, top);
        ctx.quadraticCurveTo(px + f * R * billow * 2, top - R * 0.08, px + sw, top);
        ctx.quadraticCurveTo(px + sw + f * R * billow * 3, (top + bot) / 2, px + sw * 0.92, bot);
        ctx.quadraticCurveTo(px, bot + R * 0.06, px - sw * 0.92, bot);
        ctx.quadraticCurveTo(px - sw + f * R * billow * 3, (top + bot) / 2, px - sw, top);
      };
      sail();
      const sg = ctx.createLinearGradient(px - sw, 0, px + sw, 0);
      sg.addColorStop(0, wreck ? '#6d6153' : '#f4ead2');
      sg.addColorStop(0.55, wreck ? '#5a4f42' : '#e3d4b2');
      sg.addColorStop(1, wreck ? '#4a4034' : '#bba77f');
      ctx.fillStyle = sg; ctx.fill();
      ctx.save();
      ctx.clip();
      // the cloths it is sewn from, and the belly the wind puts in it
      for (let k = -2; k <= 2; k++) {
        const sx = px + k * sw * 0.36;
        ctx.strokeStyle = 'rgba(110,90,60,.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, top - R * 0.1); ctx.quadraticCurveTo(sx + f * R * billow * 2.4, (top + bot) / 2, sx, bot + R * 0.1); ctx.stroke();
      }
      const belly = ctx.createRadialGradient(px + f * sw * 0.3, (top + bot) / 2, 0, px + f * sw * 0.3, (top + bot) / 2, sw * 1.1);
      belly.addColorStop(0, 'rgba(255,255,255,.14)'); belly.addColorStop(1, 'rgba(60,40,20,.18)');
      ctx.fillStyle = belly; ctx.fillRect(px - sw * 1.2, top - R * 0.1, sw * 2.4, bot - top + R * 0.2);
      // reef points in a row under the yard
      ctx.fillStyle = 'rgba(90,70,45,.6)';
      for (let k = 0; k < 9; k++) ctx.fillRect(px - sw * 0.85 + k * sw * 0.21, top + R * 0.1, 1.2, R * 0.05);
      // a patch, sewn on crooked
      if (!wreck && mx < 0) {
        ctx.fillStyle = 'rgba(200,180,140,.9)';
        ctx.save(); ctx.translate(px - f * sw * 0.5, bot - R * 0.22); ctx.rotate(0.12);
        ctx.fillRect(-R * 0.1, -R * 0.08, R * 0.2, R * 0.16);
        ctx.strokeStyle = 'rgba(90,70,45,.7)'; ctx.setLineDash([2, 2]); ctx.lineWidth = 0.8;
        ctx.strokeRect(-R * 0.1, -R * 0.08, R * 0.2, R * 0.16);
        ctx.restore();
      }
      ctx.restore();
      sail();
      ctx.strokeStyle = '#6b5a40'; ctx.lineWidth = 1.5; ctx.stroke();
      // the yards the sail hangs from and is sheeted to
      ctx.save();
      ctx.lineCap = 'round';
      for (const [yy, ww] of [[top, sw * 1.08], [bot, sw * 0.98]]) {
        ctx.strokeStyle = WOOD.line; ctx.lineWidth = R * 0.05;
        ctx.beginPath(); ctx.moveTo(px - ww, yy); ctx.lineTo(px + ww, yy); ctx.stroke();
        ctx.strokeStyle = WOOD.hi; ctx.lineWidth = R * 0.016;
        ctx.beginPath(); ctx.moveTo(px - ww, yy - R * 0.012); ctx.lineTo(px + ww, yy - R * 0.012); ctx.stroke();
      }
      ctx.restore();
      if (wreck) {
        ctx.fillStyle = '#1a1612';
        ctx.beginPath(); ctx.arc(px + sw * 0.3, (top + bot) / 2, R * 0.14, 0, WS.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(px - sw * 0.35, (top + bot) / 2 + R * 0.15, R * 0.08, 0, WS.TAU); ctx.fill();
      } else {
        kerchiefMark(ctx, px + f * R * billow * 1.2, (top + bot) / 2 + R * 0.02, R * 0.2, false);
      }
      if (!wreck) {
        const fx = px, fy = y - R * mh;
        // the crow's nest on the tallest
        if (mh > 1.9) {
          ctx.fillStyle = WOOD.mid; ctx.strokeStyle = WOOD.line; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px - R * 0.14, fy + R * 0.2); ctx.lineTo(px + R * 0.14, fy + R * 0.2);
          ctx.lineTo(px + R * 0.11, fy + R * 0.32); ctx.lineTo(px - R * 0.11, fy + R * 0.32); ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.strokeStyle = WOOD.hi; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px - R * 0.13, fy + R * 0.22); ctx.lineTo(px + R * 0.13, fy + R * 0.22); ctx.stroke();
        }
        ctx.fillStyle = '#c3322c';
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(fx - f * R * 0.2, fy + R * (0.05 + 0.04 * WS.sin(t * 6 + mx)),
          fx - f * R * 0.4, fy + R * 0.02);
        ctx.lineTo(fx - f * R * 0.36, fy + R * 0.14);
        ctx.lineTo(fx, fy + R * 0.14);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.moveTo(fx, fy + R * 0.09); ctx.lineTo(fx - f * R * 0.37, fy + R * 0.1); ctx.lineTo(fx - f * R * 0.36, fy + R * 0.14); ctx.lineTo(fx, fy + R * 0.14); ctx.fill();
      }
    }
    // the hull
    const hullPath = () => {
      ctx.beginPath();
      ctx.moveTo(x + f * R * 1.8, y - R * 0.3);
      ctx.quadraticCurveTo(x + f * R * 1.3, y + R * 0.55, x, y + R * 0.62);
      ctx.quadraticCurveTo(x - f * R * 1.2, y + R * 0.5, x - f * R * 1.6, y - R * 0.45);
      ctx.lineTo(x - f * R * 1.35, y - R * 0.5);
      ctx.lineTo(x + f * R * 1.55, y - R * 0.32);
      ctx.closePath();
    };
    hullPath();
    const hg = ctx.createLinearGradient(0, y - R * 0.5, 0, y + R * 0.62);
    hg.addColorStop(0, wreck ? '#3a2c22' : WOOD.hi); hg.addColorStop(0.45, wreck ? '#2a2019' : WOOD.mid);
    hg.addColorStop(1, wreck ? '#140f0c' : WOOD.dark);
    ctx.fillStyle = hg; ctx.fill();
    ctx.save();
    ctx.clip();
    // strakes: each plank its own board, butt joints staggered, pegged
    let row = 0;
    for (let py = y - R * 0.3; py < y + R * 0.65; py += R * 0.14, row++) {
      ctx.fillStyle = row % 2 ? 'rgba(0,0,0,.08)' : 'rgba(255,230,190,.05)';
      ctx.beginPath();
      ctx.moveTo(x - R * 2, py); ctx.lineTo(x + R * 2, py + R * 0.06);
      ctx.lineTo(x + R * 2, py + R * 0.2); ctx.lineTo(x - R * 2, py + R * 0.14); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(20,12,8,.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - R * 2, py); ctx.lineTo(x + R * 2, py + R * 0.06); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,190,.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - R * 2, py + 1.6); ctx.lineTo(x + R * 2, py + R * 0.06 + 1.6); ctx.stroke();
      for (let k = 0; k < 5; k++) {
        const jx = x - R * 1.7 + ((k + (row % 2) * 0.5) / 4.5) * R * 3.4;
        const jy = py + ((jx - (x - R * 2)) / (R * 4)) * R * 0.06;
        ctx.strokeStyle = 'rgba(20,12,8,.45)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(jx, jy + 1); ctx.lineTo(jx, jy + R * 0.13); ctx.stroke();
        ctx.fillStyle = 'rgba(20,12,8,.5)';
        ctx.beginPath(); ctx.arc(jx + R * 0.035, jy + R * 0.07, 1.3, 0, WS.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(jx - R * 0.035, jy + R * 0.07, 1.3, 0, WS.TAU); ctx.fill();
      }
    }
    // the sand it sails through, scoured into the bottom boards
    const sand = ctx.createLinearGradient(0, y + R * 0.2, 0, y + R * 0.62);
    sand.addColorStop(0, 'rgba(201,168,119,0)'); sand.addColorStop(1, 'rgba(201,168,119,.35)');
    ctx.fillStyle = sand; ctx.fillRect(x - R * 2, y + R * 0.2, R * 4, R * 0.5);
    wear(ctx, x - R * 1.5, y - R * 0.3, R * 3, R * 0.8, 29, 12, 4);
    ctx.restore();
    hullPath();
    ctx.strokeStyle = WOOD.line; ctx.lineWidth = 3; ctx.stroke();
    // the wale: a heavy gilded band along the sheer, with its shadow
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(10,6,4,.5)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x - f * R * 1.45, y - R * 0.33); ctx.lineTo(x + f * R * 1.6, y - R * 0.17); ctx.stroke();
    ctx.strokeStyle = wreck ? '#5a4a30' : '#d8b04a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - f * R * 1.45, y - R * 0.36); ctx.lineTo(x + f * R * 1.6, y - R * 0.2); ctx.stroke();
    ctx.strokeStyle = wreck ? '#6a5a40' : '#fff0b0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - f * R * 1.45, y - R * 0.375); ctx.lineTo(x + f * R * 1.6, y - R * 0.215); ctx.stroke();
    ctx.restore();
    // the rail above it, on stanchions
    if (!wreck) {
      ctx.strokeStyle = WOOD.line; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - f * R * 1.3, y - R * 0.56); ctx.lineTo(x + f * R * 1.5, y - R * 0.4); ctx.stroke();
      for (let k = 0; k < 12; k++) {
        const sx = x - f * R * 1.3 + f * k * R * 0.25, sy = y - R * 0.56 + k * R * 0.0145;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + R * 0.13); ctx.stroke();
      }
    }
    // the figurehead: a gilded skull at the bow, in its kerchief
    kerchiefMark(ctx, x + f * R * 1.62, y - R * 0.14, R * 0.13, wreck);
    // stern windows, in a carved gilt frame
    ctx.fillStyle = wreck ? '#2a2019' : '#8a6118';
    rrect(ctx, x - f * R * 1.27 - R * 0.08 - (f < 0 ? R * 0.28 : 0), y - R * 0.29, R * 0.44, R * 0.2, R * 0.04);
    ctx.fill();
    if (!wreck) {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = `rgba(255,210,120,${0.7 + 0.2 * WS.sin(t * 3 + i)})`;
        ctx.fillRect(x - f * R * (1.25 - i * 0.14) - R * 0.04, y - R * 0.25, R * 0.08, R * 0.12);
      }
      glow(ctx, x - f * R * 1.11, y - R * 0.19, R * 0.4, [1.0, 0.8, 0.45], 0.3);
      // the stern lantern on its bracket
      const lx = x - f * R * 1.5, ly = y - R * 0.78;
      ctx.strokeStyle = IRON.line; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - f * R * 1.36, y - R * 0.5); ctx.lineTo(lx, ly - R * 0.08); ctx.stroke();
      ctx.fillStyle = BRASS.mid; ctx.strokeStyle = BRASS.line; ctx.lineWidth = 1.2;
      rrect(ctx, lx - R * 0.06, ly - R * 0.08, R * 0.12, R * 0.16, R * 0.03); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff1c4'; ctx.fillRect(lx - R * 0.035, ly - R * 0.05, R * 0.07, R * 0.1);
      glow(ctx, lx, ly, R * 0.4, [1.0, 0.8, 0.45], 0.55 + 0.1 * WS.sin(t * 5));
    }
    // the Admiral on the quarterdeck
    if (!wreck && !o.still) {
      const sz = WS.round(R * 0.95);
      ctx.save();
      ctx.translate(x - f * R * 1.05, 0);
      if (f > 0) ctx.scale(-1, 1);
      ctx.drawImage(WS.Sprites.creature('admiral', [0.92, 0.22, 0.28], sz),
        -sz / 2, y - R * 0.45 - sz * 0.62, sz, sz);
      ctx.restore();
    }
    if (wreck) {
      glow(ctx, x - R * 0.4, y, R * 0.9, [1.0, 0.45, 0.15], 0.4 + 0.2 * WS.sin(t * 9));
      glow(ctx, x + R * 0.6, y - R * 0.2, R * 0.6, [1.0, 0.55, 0.2], 0.35 + 0.2 * WS.sin(t * 7));
    }
  };

  M.soullantern = function (ctx, e, t, o) {
    const R = e.radius, x = e.x, y = e.y;
    // a grave-post: black iron, a scrolled bracket, a spike on top
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = IRON.line; ctx.lineWidth = R * 0.18;
    ctx.beginPath(); ctx.moveTo(x, y + R * 0.9); ctx.lineTo(x, y - R * 1.3); ctx.lineTo(x + R * 0.5, y - R * 1.3); ctx.stroke();
    ctx.strokeStyle = IRON.mid; ctx.lineWidth = R * 0.07;
    ctx.beginPath(); ctx.moveTo(x - R * 0.03, y + R * 0.9); ctx.lineTo(x - R * 0.03, y - R * 1.25); ctx.stroke();
    ctx.strokeStyle = IRON.line; ctx.lineWidth = R * 0.06;
    ctx.beginPath(); ctx.moveTo(x, y - R * 1.0); ctx.quadraticCurveTo(x + R * 0.35, y - R * 1.02, x + R * 0.38, y - R * 1.28); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + R * 0.12, y - R * 1.06, R * 0.07, 0, WS.TAU); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = IRON.mid; ctx.strokeStyle = IRON.line; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - R * 0.08, y - R * 1.36); ctx.lineTo(x, y - R * 1.62); ctx.lineTo(x + R * 0.08, y - R * 1.36); ctx.closePath(); ctx.fill(); ctx.stroke();
    // the base, sunk in grave-earth
    ctx.fillStyle = '#2a2018';
    ctx.beginPath(); ctx.ellipse(x, y + R * 0.9, R * 0.45, R * 0.14, 0, 0, WS.TAU); ctx.fill();
    const sway = o.still ? 0 : WS.sin(t * 1.6 + x) * 0.12;
    ctx.save();
    ctx.translate(x + R * 0.5, y - R * 1.3); ctx.rotate(sway);
    ctx.strokeStyle = IRON.line; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, R * 0.35); ctx.stroke();
    const pulse = o.still ? 1 : 0.8 + 0.2 * WS.sin(t * 5 + x);
    ctx.beginPath();
    ctx.moveTo(-R * 0.35, R * 0.4); ctx.lineTo(R * 0.35, R * 0.4); ctx.lineTo(R * 0.45, R * 1.3);
    ctx.lineTo(-R * 0.45, R * 1.3); ctx.closePath();
    ctx.fillStyle = 'rgba(40,70,55,.8)'; ctx.fill();
    ctx.save(); ctx.clip();
    glow(ctx, 0, R * 0.85, R * 0.55 * pulse, [0.6, 1.0, 0.75], 0.95);
    // the face in the flame
    ctx.fillStyle = 'rgba(10,40,25,.55)';
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * R * 0.1, R * 0.78, R * 0.05, R * 0.07, 0, 0, WS.TAU); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(0, R * 0.98, R * 0.06, R * 0.1, 0, 0, WS.TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = IRON.dark; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.lineWidth = 1.5;
    for (const k of [-0.15, 0.15]) { ctx.beginPath(); ctx.moveTo(k * R, R * 0.4); ctx.lineTo(k * R * 1.3, R * 1.3); ctx.stroke(); }
    // the roof
    ctx.fillStyle = IRON.mid; ctx.strokeStyle = IRON.line; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-R * 0.45, R * 0.42); ctx.lineTo(0, R * 0.2); ctx.lineTo(R * 0.45, R * 0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
    glow(ctx, 0, R * 0.85, R * 2.2, [0.45, 1.0, 0.7], 0.35 * pulse);
    ctx.restore();
  };

  /** A walker's limb: armoured struts, a piston riding beside them, a
   *  bolted knee and a three-toed foot. Shared by the back legs and the
   *  front legs that are their own targets. */
  function limb(ctx, hx, hy, kx, ky, fx, fy, w, d, glowKnee) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the piston, offset toward the viewer from hip to shin
    const px0 = hx + (kx - hx) * 0.2, py0 = hy + (ky - hy) * 0.2 + w * 0.5;
    const px1 = kx + (fx - kx) * 0.55, py1 = ky + (fy - ky) * 0.55 + w * 0.2;
    ctx.strokeStyle = IRON.line; ctx.lineWidth = w * 0.34;
    ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px1, py1); ctx.stroke();
    ctx.strokeStyle = '#d9dde4'; ctx.lineWidth = w * 0.16;
    ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo((px0 + px1) / 2, (py0 + py1) / 2); ctx.stroke();
    ctx.strokeStyle = BRASS.mid; ctx.lineWidth = w * 0.26;
    ctx.beginPath(); ctx.moveTo((px0 + px1) / 2, (py0 + py1) / 2); ctx.lineTo(px1, py1); ctx.stroke();
    // the struts
    ctx.strokeStyle = IRON.line; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = IRON.lo; ctx.lineWidth = w * 0.7;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = IRON.mid; ctx.lineWidth = w * 0.3;
    ctx.beginPath(); ctx.moveTo(hx - w * 0.12, hy - w * 0.12); ctx.lineTo(kx - w * 0.12, ky - w * 0.12); ctx.lineTo(fx - w * 0.12, fy - w * 0.12); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = w * 0.08;
    ctx.beginPath(); ctx.moveTo(hx - w * 0.22, hy - w * 0.2); ctx.lineTo(kx - w * 0.22, ky - w * 0.2); ctx.stroke();
    ctx.restore();
    // the knee
    const kr = w * 0.62;
    const kg = ctx.createRadialGradient(kx - kr * 0.3, ky - kr * 0.3, 0, kx, ky, kr);
    kg.addColorStop(0, IRON.hi); kg.addColorStop(0.6, IRON.mid); kg.addColorStop(1, IRON.dark);
    ctx.fillStyle = kg; ctx.strokeStyle = IRON.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(kx, ky, kr, 0, WS.TAU); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = i * WS.TAU / 6;
      bolt(ctx, kx + Math.cos(a) * kr * 0.68, ky + Math.sin(a) * kr * 0.68, kr * 0.1);
    }
    if (glowKnee) {
      ctx.fillStyle = '#9fd6ff';
      ctx.beginPath(); ctx.arc(kx, ky, kr * 0.3, 0, WS.TAU); ctx.fill();
      glow(ctx, kx, ky, kr * 0.9, [0.55, 0.85, 1.0], 0.6);
    } else bolt(ctx, kx, ky, kr * 0.26);
    // the foot: a pad and three claws
    ctx.fillStyle = IRON.dark; ctx.strokeStyle = IRON.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(fx, fy + w * 0.2, w * 0.95, w * 0.34, 0, 0, WS.TAU); ctx.fill(); ctx.stroke();
    for (const k of [-1, 0, 1]) {
      ctx.fillStyle = IRON.mid;
      ctx.beginPath();
      ctx.moveTo(fx + k * w * 0.6 - w * 0.16, fy + w * 0.3);
      ctx.lineTo(fx + k * w * 0.86 + d * w * 0.1, fy + w * 0.62);
      ctx.lineTo(fx + k * w * 0.6 + w * 0.16, fy + w * 0.3);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  /** Front legs are separate targets; everything else is drawn with the body. */
  M.stormbreaker = function (ctx, e, t, o) {
    const R = e.radius, x = e.x, y = e.y;
    const p = pal(e.template.tint);
    const s = WS.Finale.s;
    const jolt = e.shake ? e.shake * 5 : 0;
    ctx.save();
    if (jolt) ctx.translate(WS.randRange(-jolt, jolt), WS.randRange(-jolt, jolt));
    const kneel = s && s.kneel ? s.kneel : 0;
    const phase = e.walkPhase || 0;
    // back legs
    for (const d of [-1, 1]) {
      const lift = o.still ? 0 : WS.max(0, WS.sin(phase + (d < 0 ? WS.PI / 2 : WS.PI * 1.5))) * 12;
      const hx = x + d * R * 0.9, hy = y;
      const fx = x + d * R * (1.6 - kneel * 0.3), fy = y + R * (1.0 - kneel * 0.5) - lift;
      const kx = x + d * R * 1.55, ky = y - R * (0.35 + kneel * 0.2);
      limb(ctx, hx, hy, kx, ky, fx, fy, R * 0.26, d, false);
    }
    // front-leg stumps once the legs are gone
    const legsGone = s && s.core === e && s.legs && !s.legs.length && s.mode !== 'enter';
    if (legsGone) {
      for (const d of [-1, 1]) {
        plate(ctx, x + d * R * 0.62 - R * 0.14, y + R * 0.2, R * 0.28, R * 0.45, R * 0.08, IRON);
        if (!o.still && WS.random() < 0.3) glow(ctx, x + d * R * 0.62, y + R * 0.65, R * 0.25, [0.6, 0.85, 1.0], 0.9);
      }
    }
    // the coils on its back, behind the dome
    for (const d of [-1, 1]) {
      const cx = x + d * R * 0.72, cy = y - R * 0.62;
      ctx.fillStyle = IRON.mid; ctx.strokeStyle = IRON.line; ctx.lineWidth = 2;
      rrect(ctx, cx - R * 0.1, cy - R * 0.45, R * 0.2, R * 0.5, R * 0.05); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const ry = cy - R * 0.4 + i * R * 0.09;
        ctx.strokeStyle = '#8a4e22'; ctx.lineWidth = R * 0.05;
        ctx.beginPath(); ctx.ellipse(cx, ry, R * 0.13, R * 0.035, 0, 0, WS.PI); ctx.stroke();
        ctx.strokeStyle = '#f0a860'; ctx.lineWidth = R * 0.018;
        ctx.beginPath(); ctx.ellipse(cx, ry - R * 0.008, R * 0.12, R * 0.03, 0, WS.PI * 0.1, WS.PI * 0.6); ctx.stroke();
      }
      ctx.fillStyle = '#e8f6ff';
      ctx.beginPath(); ctx.arc(cx, cy - R * 0.52, R * 0.09, 0, WS.TAU); ctx.fill();
      glow(ctx, cx, cy - R * 0.52, R * 0.4, [0.55, 0.85, 1.0], o.still ? 0.6 : 0.45 + 0.3 * WS.sin(t * 11 + d));
      if (!o.still && WS.random() < 0.35) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(190,230,255,.85)'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(cx, cy - R * 0.52);
        let lx = cx, ly = cy - R * 0.52;
        for (let i = 0; i < 4; i++) { lx += d * WS.randRange(2, 9); ly += WS.randRange(-9, 5); ctx.lineTo(lx, ly); }
        ctx.stroke();
        ctx.restore();
      }
    }
    // the antenna, with a lamp that blinks
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = IRON.line; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + R * 0.35, y - R * 0.74); ctx.lineTo(x + R * 0.48, y - R * 1.25); ctx.stroke();
    ctx.restore();
    const blink = o.still || WS.sin(t * 5) > 0.3;
    ctx.fillStyle = blink ? '#ff5a4a' : '#5a1a14';
    ctx.beginPath(); ctx.arc(x + R * 0.48, y - R * 1.27, R * 0.045, 0, WS.TAU); ctx.fill();
    if (blink) glow(ctx, x + R * 0.48, y - R * 1.27, R * 0.18, [1.0, 0.3, 0.2], 0.7);
    // body
    const dome = () => {
      ctx.beginPath();
      ctx.moveTo(x - R * 1.25, y + R * 0.2);
      ctx.quadraticCurveTo(x - R * 1.3, y - R * 0.6, x - R * 0.5, y - R * 0.78);
      ctx.lineTo(x + R * 0.5, y - R * 0.78);
      ctx.quadraticCurveTo(x + R * 1.3, y - R * 0.6, x + R * 1.25, y + R * 0.2);
      ctx.quadraticCurveTo(x, y + R * 0.62, x - R * 1.25, y + R * 0.2);
      ctx.closePath();
    };
    dome();
    const bg = ctx.createLinearGradient(0, y - R * 0.8, 0, y + R * 0.6);
    bg.addColorStop(0, p.hi); bg.addColorStop(0.5, p.mid); bg.addColorStop(1, p.dark);
    ctx.fillStyle = bg; ctx.fill();
    ctx.save(); ctx.clip();
    // light from the upper left across the curve of it
    const sheen = ctx.createRadialGradient(x - R * 0.5, y - R * 0.6, 0, x - R * 0.5, y - R * 0.6, R * 1.2);
    sheen.addColorStop(0, 'rgba(255,255,255,.22)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen; ctx.fillRect(x - R * 1.4, y - R * 0.9, R * 2.8, R * 1.6);
    // the plates: curved bands and radial seams between them
    for (const band of [-0.45, -0.1, 0.25]) {
      ctx.strokeStyle = 'rgba(10,14,20,.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - R * 1.4, y + R * band); ctx.quadraticCurveTo(x, y + R * (band + 0.18), x + R * 1.4, y + R * band); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - R * 1.4, y + R * band + 2); ctx.quadraticCurveTo(x, y + R * (band + 0.18) + 2, x + R * 1.4, y + R * band + 2); ctx.stroke();
    }
    for (const k of [-0.75, -0.4, 0.4, 0.75]) seam(ctx, x + R * k, y - R * 0.8, x + R * k * 1.15, y + R * 0.5, 1.6);
    // vents on the flanks, the heat showing through the slats
    for (const d of [-1, 1]) {
      const vx = x + d * R * 0.95, vy = y - R * 0.12;
      glow(ctx, vx, vy, R * 0.22, [1.0, 0.55, 0.2], 0.35);
      ctx.strokeStyle = 'rgba(10,12,16,.8)'; ctx.lineWidth = 2.4;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(vx - R * 0.14, vy - R * 0.12 + i * R * 0.07); ctx.lineTo(vx + R * 0.14, vy - R * 0.1 + i * R * 0.07); ctx.stroke();
      }
    }
    // rust run down from the bolts, and the scuffs of forty tons walking
    drips(ctx, x - R * 1.0, x + R * 1.0, y - R * 0.58, 8, R * 0.35, R * 0.018, 'rgba(120,60,24,.4)', 41);
    wear(ctx, x - R * 1.2, y - R * 0.8, R * 2.4, R * 1.2, 53, 14, 3);
    // hazard skirt round the bottom
    ctx.beginPath();
    ctx.moveTo(x - R * 1.4, y + R * 0.14); ctx.quadraticCurveTo(x, y + R * 0.52, x + R * 1.4, y + R * 0.14);
    ctx.lineTo(x + R * 1.4, y + R * 0.7); ctx.lineTo(x - R * 1.4, y + R * 0.7); ctx.closePath();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#e8b73a'; ctx.fillRect(x - R * 1.4, y, R * 2.8, R * 0.8);
    ctx.fillStyle = '#1c1812';
    for (let bx = x - R * 1.5; bx < x + R * 1.5; bx += R * 0.2) {
      ctx.beginPath(); ctx.moveTo(bx, y + R * 0.7); ctx.lineTo(bx + R * 0.2, y); ctx.lineTo(bx + R * 0.3, y); ctx.lineTo(bx + R * 0.1, y + R * 0.7); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
    dome();
    ctx.strokeStyle = p.line; ctx.lineWidth = 3; ctx.stroke();
    boltRow(ctx, x - R * 1.0, x + R * 1.0, y - R * 0.6, 9, R * 0.03);
    // the stolen ember, behind a grille in a frame
    const heat = o.still ? 0.8 : 0.7 + 0.3 * WS.sin(t * 3);
    ctx.fillStyle = '#2a1a10';
    rrect(ctx, x - R * 0.3, y - R * 0.36, R * 0.6, R * 0.62, R * 0.08); ctx.fill();
    glow(ctx, x, y - R * 0.05, R * 0.55, [1.0, 0.6, 0.25], 0.8 * heat);
    ctx.strokeStyle = 'rgba(20,20,24,.85)'; ctx.lineWidth = 2.4;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(x + i * R * 0.1, y - R * 0.3); ctx.lineTo(x + i * R * 0.1, y + R * 0.2); ctx.stroke();
    }
    ctx.strokeStyle = IRON.mid; ctx.lineWidth = 3;
    rrect(ctx, x - R * 0.3, y - R * 0.36, R * 0.6, R * 0.62, R * 0.08); ctx.stroke();
    for (const [bx, by] of [[-0.24, -0.3], [0.24, -0.3], [-0.24, 0.2], [0.24, 0.2]]) bolt(ctx, x + R * bx, y + R * by, R * 0.03);
    pilot(ctx, x, y - R * 0.62, R * 0.24, t, o.still);
    // belly cannon: a brass housing and a lens
    plate(ctx, x - R * 0.2, y + R * 0.38, R * 0.4, R * 0.36, R * 0.1, pal([0.72, 0.52, 0.3]));
    boltRow(ctx, x - R * 0.13, x + R * 0.13, y + R * 0.44, 3, R * 0.025, BRASS);
    ctx.fillStyle = '#10161e';
    ctx.beginPath(); ctx.arc(x, y + R * 0.62, R * 0.1, 0, WS.TAU); ctx.fill();
    const firing = !o.still && WS.Finale.marks.some((m) => m.kind === 'sweep' && m.follow === e);
    glow(ctx, x, y + R * 0.78, R * (firing ? 0.7 : 0.3), [0.55, 0.85, 1.0], firing ? 0.95 : 0.5);
    if (s && s.mode === 'destruct' && s.core === e) {
      const blink2 = WS.sin(t * 18) > 0;
      glow(ctx, x, y, R * 2, [1.0, 0.2, 0.1], blink2 ? 0.4 : 0.15);
    }
    ctx.restore();
  };

  M.leg = function (ctx, e, t, o) {
    const R = e.radius;
    const host = e.host;
    const d = e.ox < 0 ? -1 : 1;
    const hx = host ? host.x + d * host.radius * 0.62 : e.x - d * R;
    const hy = host ? host.y + host.radius * 0.15 : e.y - R * 2;
    const phase = host && host.walkPhase ? host.walkPhase : 0;
    const lift = o.still ? 0 : WS.max(0, WS.sin(phase + (d < 0 ? 0 : WS.PI))) * 16;
    const fx = e.x, fy = e.y + R * 0.6 - lift;
    const kx = (hx + fx) / 2 + d * R * 0.7, ky = (hy + fy) / 2 - R * 0.2;
    limb(ctx, hx, hy, kx, ky, fx, fy, R * 0.5, d, true);
  };

  M.pylon = function (ctx, e, t, o) {
    const R = e.radius, x = e.x, y = e.y;
    plate(ctx, x - R * 0.7, y + R * 0.2, R * 1.4, R * 0.5, R * 0.12, IRON);
    plate(ctx, x - R * 0.22, y - R * 1.5, R * 0.44, R * 1.75, R * 0.1, pal([0.72, 0.5, 0.3]));
    ctx.strokeStyle = '#d9914a'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const ry = y - R * 1.3 + i * R * 0.26;
      ctx.beginPath(); ctx.ellipse(x, ry, R * 0.34, R * 0.08, 0, 0, WS.TAU); ctx.stroke();
    }
    ctx.fillStyle = '#cfe8ff';
    ctx.beginPath(); ctx.arc(x, y - R * 1.65, R * 0.3, 0, WS.TAU); ctx.fill();
    glow(ctx, x, y - R * 1.65, R * 1.1, [0.55, 0.85, 1.0], o.still ? 0.6 : 0.5 + 0.3 * WS.sin(t * 13 + x));
    if (!o.still && WS.random() < 0.5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(180,225,255,.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y - R * 1.65);
      let px = x, py = y - R * 1.65;
      for (let i = 0; i < 4; i++) { px += WS.randRange(-8, 8); py += WS.randRange(-9, 3); ctx.lineTo(px, py); }
      ctx.stroke();
      ctx.restore();
    }
  };

  M.pipe = function (ctx, e, t, o) {
    const R = e.radius, x = e.x, y = e.y;
    ctx.fillStyle = IRON.dark;
    ctx.beginPath(); ctx.arc(x, y, R, 0, WS.TAU); ctx.fill();
    ctx.strokeStyle = IRON.hi; ctx.lineWidth = 2.5; ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * WS.TAU;
      ctx.fillStyle = IRON.hi;
      ctx.beginPath(); ctx.arc(x + WS.cos(a) * R * 0.82, y + WS.sin(a) * R * 0.82, R * 0.07, 0, WS.TAU); ctx.fill();
    }
    glow(ctx, x, y, R * 0.8, [1.0, 0.55, 0.2], o.still ? 0.8 : 0.65 + 0.25 * WS.sin(t * 4 + x));
    const rot = o.still ? 0 : t * 0.8;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.strokeStyle = '#b8392a'; ctx.lineWidth = R * 0.14;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, WS.TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.rotate(WS.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * 0.5, 0); ctx.stroke();
    }
    ctx.restore();
  };

  M.shard = function (ctx, e, t, o) {
    const R = e.radius, x = e.x, y = e.y + (o.still ? 0 : WS.sin(t * 3 + e.spawnId) * 4);
    const rot = o.still ? 0 : t * 1.4 + e.spawnId;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(WS.sin(rot) * 0.3);
    const g = ctx.createLinearGradient(-R, -R * 1.5, R, R * 1.5);
    g.addColorStop(0, '#f3fbff'); g.addColorStop(0.5, '#9fd4f5'); g.addColorStop(1, '#3f7ea8');
    ctx.beginPath();
    ctx.moveTo(0, -R * 1.5); ctx.lineTo(R * 0.7, -R * 0.2); ctx.lineTo(R * 0.4, R * 1.2);
    ctx.lineTo(-R * 0.4, R * 1.2); ctx.lineTo(-R * 0.7, -R * 0.2); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#1e4a6a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -R * 1.5); ctx.lineTo(0, R * 1.2); ctx.stroke();
    ctx.restore();
    glow(ctx, x, y, R * 1.6, [0.7, 0.92, 1.0], 0.4);
  };

  M.heartdrill = function (ctx, e, t, o) {
    const R = e.radius, x = e.x, y = e.y;
    const wreck = !!o.wreck;
    const IR = wreck ? pal([0.2, 0.24, 0.3]) : IRON;
    // the bore: a hole in the world, a lip of broken rock, heat coming up
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y + R * 1.0, R * 0.75, R * 0.26, 0, 0, WS.TAU);
    const bore = ctx.createRadialGradient(x, y + R * 1.02, 0, x, y + R * 1.0, R * 0.75);
    bore.addColorStop(0, wreck ? '#1a2a38' : '#3a1206'); bore.addColorStop(0.5, '#0a0706'); bore.addColorStop(1, '#07090d');
    ctx.fillStyle = bore; ctx.fill();
    ctx.strokeStyle = wreck ? '#bfe6ff' : '#5a3a24'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    glow(ctx, x, y + R * 1.0, R * 0.8, wreck ? [0.7, 0.9, 1.0] : [1.0, 0.45, 0.2], 0.55);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * WS.TAU + hsh(i) * 0.3;
      const rx = x + Math.cos(a) * R * (0.78 + hsh(i + 5) * 0.1), ry = y + R * 1.0 + Math.sin(a) * R * (0.28 + hsh(i + 9) * 0.05);
      const rr = R * (0.05 + hsh(i + 13) * 0.05);
      ctx.fillStyle = wreck ? '#3a4450' : (Math.sin(a) > 0 ? '#4a3a2c' : '#6e5a44');
      ctx.strokeStyle = '#1a120c'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(rx - rr, ry + rr * 0.4); ctx.lineTo(rx - rr * 0.4, ry - rr * 0.7); ctx.lineTo(rx + rr * 0.7, ry - rr * 0.5); ctx.lineTo(rx + rr, ry + rr * 0.4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // derrick: double girders, cross-braced, a crown block at the top
    const apexX = x + (wreck ? R * 0.5 : 0), apexY = y - R * (wreck ? 1.0 : 1.55);
    const legA = [x - R * 0.95, y + R * 0.85], legB = [x + R * 0.95, y + R * 0.85];
    const at = (leg, k) => [leg[0] + (apexX - leg[0]) * k, leg[1] + (apexY - leg[1]) * k];
    ctx.save();
    ctx.lineCap = 'round';
    for (const leg of [legA, legB]) {
      for (const off of [-R * 0.04, R * 0.04]) {
        ctx.strokeStyle = wreck ? '#2c3440' : IRON.line; ctx.lineWidth = R * 0.05;
        ctx.beginPath(); ctx.moveTo(leg[0] + off, leg[1]); ctx.lineTo(apexX + off * 0.3, apexY); ctx.stroke();
        ctx.strokeStyle = wreck ? '#4a5560' : IRON.mid; ctx.lineWidth = R * 0.022;
        ctx.beginPath(); ctx.moveTo(leg[0] + off - 1, leg[1]); ctx.lineTo(apexX + off * 0.3 - 1, apexY); ctx.stroke();
      }
      // the foot: a plate bolted to the ground
      ctx.fillStyle = IR.mid; ctx.strokeStyle = IR.line; ctx.lineWidth = 1.5;
      rrect(ctx, leg[0] - R * 0.14, leg[1] - R * 0.03, R * 0.28, R * 0.08, R * 0.02); ctx.fill(); ctx.stroke();
      bolt(ctx, leg[0] - R * 0.09, leg[1], R * 0.02, IR); bolt(ctx, leg[0] + R * 0.09, leg[1], R * 0.02, IR);
    }
    ctx.strokeStyle = wreck ? '#3c4550' : IRON.lo; ctx.lineWidth = R * 0.03;
    for (let i = 0; i < 6; i++) {
      const k0 = i / 6, k1 = (i + 1) / 6;
      const a0 = at(legA, k0), a1 = at(legA, k1), b0 = at(legB, k0), b1 = at(legB, k1);
      ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
      if (i < 5) {
        ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
      }
    }
    ctx.restore();
    // the crown block: a pulley, and the cable down to the swivel
    const pr = R * 0.1;
    ctx.fillStyle = IR.mid; ctx.strokeStyle = IR.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(apexX, apexY + pr * 0.4, pr, 0, WS.TAU); ctx.fill(); ctx.stroke();
    const spinP = o.still || wreck ? 0 : t * 3;
    ctx.strokeStyle = IR.dark || IR.lo; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const a = spinP + i * WS.TAU / 3;
      ctx.beginPath(); ctx.moveTo(apexX, apexY + pr * 0.4); ctx.lineTo(apexX + Math.cos(a) * pr * 0.8, apexY + pr * 0.4 + Math.sin(a) * pr * 0.8); ctx.stroke();
    }
    if (!wreck) {
      ctx.strokeStyle = 'rgba(30,26,22,.9)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(apexX - pr * 0.9, apexY + pr * 0.4); ctx.lineTo(x - R * 0.05, y - R * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(apexX + pr * 0.9, apexY + pr * 0.4); ctx.lineTo(x + R * 0.05, y - R * 0.42); ctx.stroke();
      // a warning lamp on the crown
      const on = o.still || WS.sin(t * 4) > 0;
      ctx.fillStyle = on ? '#ffb040' : '#5a3a14';
      ctx.beginPath(); ctx.arc(apexX, apexY - pr * 0.9, R * 0.04, 0, WS.TAU); ctx.fill();
      if (on) glow(ctx, apexX, apexY - pr * 0.9, R * 0.2, [1.0, 0.65, 0.2], 0.7);
    }
    // shaft
    const spin = o.still || wreck ? 0 : ((e.drillSpin || 0) % 1);
    ctx.save();
    rrect(ctx, x - R * 0.16, y + R * 0.2, R * 0.32, R * 0.85, R * 0.05);
    const shg = ctx.createLinearGradient(x - R * 0.16, 0, x + R * 0.16, 0);
    shg.addColorStop(0, '#a9a59f'); shg.addColorStop(0.4, '#7a7672'); shg.addColorStop(1, '#3a3836');
    ctx.fillStyle = shg; ctx.fill(); ctx.clip();
    for (let i = -1; i < 7; i++) {
      const sy = y + R * 0.2 + ((i + spin) / 6) * R * 0.85;
      ctx.strokeStyle = 'rgba(20,20,22,.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - R * 0.2, sy); ctx.lineTo(x + R * 0.2, sy + R * 0.1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - R * 0.2, sy - 2.4); ctx.lineTo(x + R * 0.2, sy + R * 0.1 - 2.4); ctx.stroke();
    }
    ctx.restore();
    // steam pipes from the drum down to the ground, flanged at the joints
    for (const d of [-1, 1]) {
      const sx = x + d * R * 0.78, sy = y - R * 0.1;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = IR.line; ctx.lineWidth = R * 0.13;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + d * R * 0.22, sy); ctx.quadraticCurveTo(sx + d * R * 0.34, sy, sx + d * R * 0.34, sy + R * 0.15); ctx.lineTo(sx + d * R * 0.34, y + R * 0.8); ctx.stroke();
      ctx.strokeStyle = wreck ? '#4a5560' : '#b8673a'; ctx.lineWidth = R * 0.08;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + d * R * 0.22, sy); ctx.quadraticCurveTo(sx + d * R * 0.34, sy, sx + d * R * 0.34, sy + R * 0.15); ctx.lineTo(sx + d * R * 0.34, y + R * 0.8); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,180,.4)'; ctx.lineWidth = R * 0.02;
      ctx.beginPath(); ctx.moveTo(sx + d * R * 0.34 - R * 0.025, sy + R * 0.2); ctx.lineTo(sx + d * R * 0.34 - R * 0.025, y + R * 0.78); ctx.stroke();
      ctx.restore();
      for (const fy of [sy + R * 0.35, y + R * 0.55]) {
        ctx.fillStyle = IR.mid; ctx.strokeStyle = IR.line; ctx.lineWidth = 1.2;
        rrect(ctx, sx + d * R * 0.34 - R * 0.09, fy - R * 0.025, R * 0.18, R * 0.05, R * 0.015); ctx.fill(); ctx.stroke();
      }
    }
    // engine drum
    const drumP = wreck ? pal([0.3, 0.34, 0.4]) : pal(e.template.tint);
    plate(ctx, x - R * 0.78, y - R * 0.42, R * 1.56, R * 0.72, R * 0.2, drumP);
    ctx.save();
    rrect(ctx, x - R * 0.78, y - R * 0.42, R * 1.56, R * 0.72, R * 0.2); ctx.clip();
    for (const k of [-0.45, 0.45]) seam(ctx, x + R * k, y - R * 0.44, x + R * k, y + R * 0.32, 1.6);
    wear(ctx, x - R * 0.78, y - R * 0.42, R * 1.56, R * 0.72, 71, 10, 3);
    // hazard band along the foot of the drum
    ctx.fillStyle = '#e8b73a'; ctx.fillRect(x - R * 0.8, y + R * 0.18, R * 1.6, R * 0.12);
    ctx.fillStyle = '#1c1812';
    for (let bx = x - R * 0.9; bx < x + R * 0.9; bx += R * 0.16) {
      ctx.beginPath(); ctx.moveTo(bx, y + R * 0.3); ctx.lineTo(bx + R * 0.08, y + R * 0.18); ctx.lineTo(bx + R * 0.15, y + R * 0.18); ctx.lineTo(bx + R * 0.07, y + R * 0.3); ctx.fill();
    }
    ctx.restore();
    boltRow(ctx, x - R * 0.62, x + R * 0.62, y - R * 0.3, 8, R * 0.03);
    if (!wreck) {
      // gauges: brass bezels, a red zone, and needles that do not agree
      for (let i = 0; i < 3; i++) {
        const gx = x - R * 0.4 + i * R * 0.4, gy = y - R * 0.05, gr = R * 0.12;
        ctx.fillStyle = BRASS.mid; ctx.strokeStyle = BRASS.line; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(gx, gy, gr * 1.28, 0, WS.TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#efe8d6';
        ctx.beginPath(); ctx.arc(gx, gy, gr, 0, WS.TAU); ctx.fill();
        ctx.strokeStyle = '#c3322c'; ctx.lineWidth = gr * 0.25;
        ctx.beginPath(); ctx.arc(gx, gy, gr * 0.78, WS.PI * 1.75, WS.PI * 2.2); ctx.stroke();
        ctx.strokeStyle = '#3a3026'; ctx.lineWidth = 1;
        for (let k = 0; k < 7; k++) {
          const a = WS.PI * 0.8 + k * (WS.PI * 1.4 / 6);
          ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * gr * 0.85, gy + Math.sin(a) * gr * 0.85); ctx.lineTo(gx + Math.cos(a) * gr * 0.65, gy + Math.sin(a) * gr * 0.65); ctx.stroke();
        }
        ctx.strokeStyle = '#1a1612'; ctx.lineWidth = 2;
        const a = WS.PI * 0.8 + (o.still ? 0.5 : 0.5 + 0.4 * WS.sin(t * (2 + i))) * WS.PI;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + WS.cos(a) * gr * 0.8, gy + WS.sin(a) * gr * 0.8); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.beginPath(); ctx.ellipse(gx - gr * 0.35, gy - gr * 0.4, gr * 0.3, gr * 0.14, -0.6, 0, WS.TAU); ctx.fill();
      }
      // the valve wheel on top, and the whistle beside it
      const vx = x - R * 0.35, vy = y - R * 0.5;
      ctx.strokeStyle = IRON.line; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(vx, y - R * 0.42); ctx.lineTo(vx, vy); ctx.stroke();
      ctx.strokeStyle = '#c3322c'; ctx.lineWidth = R * 0.03;
      ctx.beginPath(); ctx.ellipse(vx, vy, R * 0.12, R * 0.04, 0, 0, WS.TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(vx - R * 0.12, vy); ctx.lineTo(vx + R * 0.12, vy); ctx.stroke();
      ctx.fillStyle = BRASS.mid; ctx.strokeStyle = BRASS.line; ctx.lineWidth = 1.2;
      rrect(ctx, x + R * 0.3, y - R * 0.62, R * 0.08, R * 0.2, R * 0.03); ctx.fill(); ctx.stroke();
      pilot(ctx, x + R * 0.95, y - R * 0.4, R * 0.24, t, o.still);
      for (const sx of [-0.55, 0.55]) {
        if (!o.still && WS.random() < 0.25) {
          WS.FX.burst(x + sx * R, y - R * 0.5, 1, '#7a7470', 40, 1.0, 4);
        }
      }
    } else {
      ctx.fillStyle = 'rgba(200,235,255,.35)';
      ctx.fillRect(x - R * 0.78, y - R * 0.5, R * 1.56, R * 0.15);
    }
  };

  /** The Admiral on one knee, colours struck. */
  M.surrender = function (ctx, e, t) {
    const R = e.radius, x = e.x, y = e.y;
    const sz = WS.round(R * 3.1);
    ctx.save();
    ctx.translate(x, y + R * 0.3);
    ctx.scale(1, 0.82);
    ctx.drawImage(WS.Sprites.creature('admiral', e.template.tint, sz),
      -sz / 2, -sz * 0.62, sz, sz);
    ctx.restore();
    const px = x + R * 0.9, top = y - R * 2.2;
    ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(px, y + R * 0.6); ctx.lineTo(px, top); ctx.stroke();
    const wave = WS.sin(t * 4) * R * 0.12;
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.quadraticCurveTo(px + R * 0.6, top + wave, px + R * 1.1, top + R * 0.1);
    ctx.lineTo(px + R * 1.05, top + R * 0.75);
    ctx.quadraticCurveTo(px + R * 0.55, top + R * 0.7 - wave, px, top + R * 0.7);
    ctx.closePath();
    ctx.fillStyle = '#f4efe4'; ctx.fill();
    ctx.strokeStyle = 'rgba(80,70,60,.6)'; ctx.lineWidth = 1.2; ctx.stroke();
  };

  /* Wrecks: the machine, darkened, tilted, smoking, with nothing moving. */
  function drawWreck(ctx, w, time) {
    const painter = M[w.kind];
    if (!painter) return;
    const fade = WS.clamp(w.life / 1.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(w.x, w.y); ctx.rotate(w.rot || 0.08); ctx.translate(-w.x, -w.y);
    if (w.kind !== 'galleon' && w.kind !== 'surrender') ctx.filter = 'brightness(.42) saturate(.5)';
    const fake = { x: w.x, y: w.y, radius: w.radius || 60, facing: 1, template: { tint: w.tint },
      dmgTaken: 1, untargetable: false, health: 1, maxHealth: 1, spawnId: 1 };
    painter(ctx, fake, time, { wreck: true, still: true });
    ctx.restore();
  }

  /* ------------------------------------------------------ units and wards -- */
  A.drawUnit = function (ctx, e, time) {
    const painter = M[e.template.machine];
    if (!painter) return;
    // Every machine sits on the ground with a contact shadow, like the rest.
    if (e.template.machine !== 'galleon') {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.radius * 0.85, e.radius * 1.2, e.radius * 0.3, 0, 0, WS.TAU);
      ctx.fill();
      ctx.restore();
    }
    if (e.fade !== undefined && e.fade <= 0) return;
    const ds = e.template.drawScale || 1;
    if (e.fade !== undefined && e.fade < 1) { ctx.save(); ctx.globalAlpha = e.fade; }
    if (ds !== 1) {
      ctx.save();
      ctx.translate(e.x, e.y); ctx.scale(ds, ds); ctx.translate(-e.x, -e.y);
    }
    painter(ctx, e, time, {});
    if (ds !== 1) ctx.restore();
    if (e.fade !== undefined && e.fade < 1) { ctx.restore(); return; }
    if (e.flash > 0) {
      ctx.save();
      ctx.globalAlpha = WS.clamp(e.flash / 0.09, 0, 1) * 0.35;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = e.flashCrit ? '#ffd45c' : '#ff6b5c';
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.radius * 1.1, e.radius * 0.9, 0, 0, WS.TAU); ctx.fill();
      ctx.restore();
    }
    A.adorn(ctx, e, time);
  };

  /** Shields, openings and armour, drawn the same way on every finale unit. */
  A.adorn = function (ctx, e, time) {
    if (e.hidden || (e.rise !== undefined && e.rise < 1)) return;
    const R = e.radius;
    const big = e.template.machine && e.boss ? 1.55 : 1.35;
    if (e.untargetable) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const tint = e.template.tint;
      ctx.globalAlpha = 0.28 + 0.1 * WS.sin(time * 3);
      ctx.strokeStyle = WS.rgb(WS.mix(tint, [1, 1, 1], 0.4), 1);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - R * 0.1, R * big, R * big * 0.82, 0, 0, WS.TAU); ctx.stroke();
      // hex facets, so a ward reads as a shape and not only a tint
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * WS.TAU + time * 0.3;
        const rx = WS.cos(a) * R * big * 0.8, ry = WS.sin(a) * R * big * 0.65;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const ha = (k / 6) * WS.TAU;
          const px = e.x + rx + WS.cos(ha) * R * 0.18, py = e.y - R * 0.1 + ry + WS.sin(ha) * R * 0.18;
          if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      }
      ctx.restore();
    } else if (e.dmgTaken > 1) {
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.3 * WS.sin(time * 8);
      ctx.strokeStyle = '#ff5a4a';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = -time * 40;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + R * 0.55, R * 1.35, R * 0.45, 0, 0, WS.TAU); ctx.stroke();
      ctx.restore();
    } else if (e.dmgTaken < 1 && e.boss) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#cfd6e2';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + R * 0.55, R * 1.3, R * 0.42, 0, 0, WS.TAU); ctx.stroke();
      ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.ellipse(e.x, e.y + R * 0.55, R * 1.45, R * 0.5, 0, 0, WS.TAU); ctx.stroke();
      ctx.restore();
    }
  };

  /* ------------------------------------------------------------ the pod -- */
  function drawPod(ctx, pod, time) {
    const x = pod.x, y = pod.y + (pod.frozen ? 0 : WS.sin(time * 4) * 3);
    if (pod.carrying) {
      ctx.strokeStyle = 'rgba(40,30,20,.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y + 18); ctx.lineTo(x, y + 40); ctx.stroke();
      glow(ctx, x, y + 46, 18, [0.55, 1.0, 0.75], 0.9);
    }
    if (!pod.frozen && !pod.done) {
      glow(ctx, x, y + 22, 14 + WS.sin(time * 30) * 3, [1.0, 0.6, 0.25], 0.9);
    }
    // propeller
    ctx.save();
    ctx.translate(x, y - 22);
    ctx.fillStyle = BRASS.lo;
    ctx.fillRect(-2, 0, 4, 6);
    const w = pod.frozen ? 14 : 16 * WS.abs(WS.cos(time * 25));
    ctx.fillStyle = '#6b5a40';
    ctx.fillRect(-w, -2, w * 2, 3);
    ctx.restore();
    pilot(ctx, x, y, 18, time, false);
    if (pod.frozen) {
      ctx.save();
      rrect(ctx, x - 28, y - 30, 56, 58, 6);
      ctx.fillStyle = 'rgba(190,230,255,.45)'; ctx.fill();
      ctx.strokeStyle = 'rgba(240,250,255,.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 20, y - 22); ctx.lineTo(x - 6, y + 8); ctx.moveTo(x + 14, y - 24); ctx.lineTo(x + 20, y + 4); ctx.stroke();
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------- marks --- */
  function hatch(ctx, x0, y0, w, h, gap, col, lw) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    for (let d = -h; d < w; d += gap) {
      ctx.moveTo(x0 + d, y0 + h); ctx.lineTo(x0 + d + h, y0);
    }
    ctx.stroke();
  }

  function drawCircle(ctx, m, time) {
    const k = WS.clamp(1 - m.tele / m.maxTele, 0, 1);
    const c = m.tint;
    ctx.save();
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, WS.TAU);
    ctx.fillStyle = rgba(c, 0.08 + 0.12 * k); ctx.fill();
    ctx.save(); ctx.clip();
    hatch(ctx, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2, 16 - 8 * k, rgba(c, 0.22 + 0.4 * k), 1 + 1.4 * k);
    ctx.restore();
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * k, 0, WS.TAU);
    ctx.fillStyle = rgba(c, 0.16 + 0.22 * k); ctx.fill();
    ctx.lineWidth = 2 + 1.5 * k;
    ctx.strokeStyle = rgba(WS.mix(c, [1, 1, 1], 0.3), 0.55 + 0.4 * k);
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, WS.TAU); ctx.stroke();
    if (m.style === 'hands' && k > 0.4) {
      ctx.strokeStyle = rgba([0.85, 1.0, 0.9], (k - 0.4) * 1.4);
      ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const a = -WS.PI / 2 + (i - 2) * 0.35;
        const L = m.r * 0.55 * (k - 0.4) / 0.6;
        ctx.beginPath(); ctx.moveTo(m.x + (i - 2) * 6, m.y + 6);
        ctx.lineTo(m.x + (i - 2) * 6 + WS.cos(a) * L, m.y + 6 + WS.sin(a) * L); ctx.stroke();
      }
    }
    if (m.style === 'erupt' || m.style === 'stomp') {
      ctx.strokeStyle = rgba([0.2, 0.14, 0.1], 0.5 * k); ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * WS.TAU + m.x;
        ctx.beginPath(); ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x + WS.cos(a) * m.r * 0.9 * k, m.y + WS.sin(a) * m.r * 0.9 * k); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawShell(ctx, m, time) {
    const k = WS.clamp(1 - m.tele / m.maxTele, 0, 1);
    if (m.style === 'ice') {
      const y = m.y - (1 - k) * 360;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#dff3ff'; ctx.strokeStyle = '#3f7ea8'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x, y + 16); ctx.lineTo(m.x + 10, y - 6); ctx.lineTo(m.x, y - 20); ctx.lineTo(m.x - 10, y - 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      return;
    }
    if (!m.from) return;
    const x = m.from.x + (m.x - m.from.x) * k;
    const y = m.from.y + (m.y - m.from.y) * k - WS.sin(k * WS.PI) * 160;
    ctx.save();
    ctx.fillStyle = '#211b16';
    ctx.beginPath(); ctx.arc(x, y, 7, 0, WS.TAU); ctx.fill();
    glow(ctx, x, y, 12, m.tint, 0.8);
    ctx.restore();
  }

  function drawLane(ctx, m, time) {
    ctx.save();
    ctx.translate(m.x, m.y); ctx.rotate(m.ang);
    const c = m.tint;
    if (m.tele > 0) {
      const k = WS.clamp(1 - m.tele / m.maxTele, 0, 1);
      ctx.fillStyle = rgba(c, 0.07 + 0.12 * k);
      ctx.fillRect(0, -m.w / 2, m.len, m.w);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, -m.w / 2, m.len, m.w); ctx.clip();
      hatch(ctx, 0, -m.w / 2, m.len, m.w, 18 - 8 * k, rgba(c, 0.2 + 0.35 * k), 1 + k);
      ctx.restore();
      ctx.strokeStyle = rgba(c, 0.5 + 0.4 * k); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -m.w / 2); ctx.lineTo(m.len, -m.w / 2);
      ctx.moveTo(0, m.w / 2); ctx.lineTo(m.len, m.w / 2); ctx.stroke();
      ctx.fillStyle = rgba([1, 1, 1], 0.2 + 0.4 * k);
      const off = (time * 220) % 60;
      for (let d = off; d < m.len; d += 60) {
        ctx.beginPath(); ctx.moveTo(d, -m.w * 0.2); ctx.lineTo(d + 14, 0); ctx.lineTo(d, m.w * 0.2); ctx.fill();
      }
    } else {
      ctx.globalCompositeOperation = 'lighter';
      const a = WS.clamp(m.active / 0.35, 0, 1);
      ctx.fillStyle = rgba(c, 0.55 * a);
      ctx.fillRect(0, -m.w / 2, m.len, m.w);
      ctx.fillStyle = `rgba(255,245,220,${(0.8 * a).toFixed(3)})`;
      ctx.fillRect(0, -m.w * 0.15, m.len, m.w * 0.3);
    }
    ctx.restore();
  }

  function drawRing(ctx, m) {
    if (m.delay > 0) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = rgba(m.tint, 1); ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(m.cx, m.cy, 40, 0, WS.TAU); ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.lineWidth = m.thick;
    ctx.strokeStyle = rgba(m.tint, 0.5);
    const steps = 160;
    ctx.beginPath();
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * WS.TAU;
      if (WS.Finale.inGap(m, a0 + WS.TAU / steps / 2)) continue;
      ctx.moveTo(m.cx + WS.cos(a0) * m.r, m.cy + WS.sin(a0) * m.r);
      ctx.arc(m.cx, m.cy, m.r, a0, a0 + WS.TAU / steps);
    }
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(WS.mix(m.tint, [1, 1, 1], 0.5), 0.9);
    ctx.beginPath();
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * WS.TAU;
      if (WS.Finale.inGap(m, a0 + WS.TAU / steps / 2)) continue;
      const rr = m.r + m.thick * 0.5;
      ctx.moveTo(m.cx + WS.cos(a0) * rr, m.cy + WS.sin(a0) * rr);
      ctx.arc(m.cx, m.cy, rr, a0, a0 + WS.TAU / steps);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawSweep(ctx, m, time) {
    ctx.save();
    for (let a = 0; a < m.arms; a++) {
      const ang = m.ang + (a / m.arms) * WS.TAU;
      const ex = m.cx + WS.cos(ang) * m.len, ey = m.cy + WS.sin(ang) * m.len;
      if (m.tele > 0) {
        const k = WS.clamp(1 - m.tele / m.maxTele, 0, 1);
        ctx.globalAlpha = 0.35 + 0.45 * k;
        ctx.strokeStyle = rgba(m.tint, 1);
        ctx.lineWidth = 2 + m.w * 0.15 * k;
        ctx.setLineDash([12, 10]);
        ctx.lineDashOffset = -time * 60;
        ctx.beginPath(); ctx.moveTo(m.cx, m.cy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        // which way it will turn
        const r = 150, sgn = m.spin >= 0 ? 1 : -1;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(m.cx, m.cy, r, ang, ang + sgn * 0.7, sgn < 0); ctx.stroke();
        const ha = ang + sgn * 0.7;
        const hx = m.cx + WS.cos(ha) * r, hy = m.cy + WS.sin(ha) * r;
        const tang = ha + sgn * WS.PI / 2;
        ctx.beginPath();
        ctx.moveTo(hx + WS.cos(tang) * 12, hy + WS.sin(tang) * 12);
        ctx.lineTo(hx + WS.cos(tang + 2.5) * 10, hy + WS.sin(tang + 2.5) * 10);
        ctx.lineTo(hx + WS.cos(tang - 2.5) * 10, hy + WS.sin(tang - 2.5) * 10);
        ctx.closePath(); ctx.fillStyle = rgba(m.tint, 1); ctx.fill();
      } else {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(m.tint, 0.35);
        ctx.lineWidth = m.w * (1 + 0.1 * WS.sin(time * 40));
        ctx.beginPath(); ctx.moveTo(m.cx, m.cy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.lineWidth = m.w * 0.28;
        ctx.beginPath(); ctx.moveTo(m.cx, m.cy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  }

  function drawGrid(ctx, m) {
    const k = WS.clamp(1 - m.tele / m.maxTele, 0, 1);
    ctx.save();
    for (const c of m.cells) {
      const x = c.x + 3, y = c.y + 3, w = c.w - 6, h = c.h - 6;
      if (c.safe) {
        ctx.fillStyle = 'rgba(61,220,122,.13)'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(120,245,170,.85)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        const b = WS.min(w, h) * 0.26;
        for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
          ctx.beginPath(); ctx.moveTo(cx + sx * b, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * b); ctx.stroke();
        }
      } else {
        ctx.fillStyle = rgba(m.tint, 0.1 + 0.2 * k); ctx.fillRect(x, y, w, h);
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        hatch(ctx, x, y, w, h, 18 - 8 * k, rgba(m.tint, 0.3 + 0.5 * k), 1 + 1.6 * k);
        ctx.restore();
        ctx.strokeStyle = rgba(m.tint, 0.5 + 0.45 * k); ctx.lineWidth = 2 + 1.5 * k;
        ctx.strokeRect(x, y, w, h);
      }
    }
    ctx.restore();
  }

  function drawSafe(ctx, m, time) {
    const k = WS.clamp(1 - m.tele / m.maxTele, 0, 1);
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    for (const z of m.zones) { ctx.moveTo(z.x + z.r, z.y); ctx.arc(z.x, z.y, z.r, 0, WS.TAU, true); }
    ctx.fillStyle = `rgba(226,72,61,${(0.08 + 0.2 * k + 0.06 * WS.sin(time * 10)).toFixed(3)})`;
    ctx.fill('evenodd');
    ctx.clip('evenodd');
    hatch(ctx, 0, 0, W, H, 30 - 14 * k, `rgba(255,150,120,${(0.15 + 0.3 * k).toFixed(3)})`, 1 + k);
    ctx.restore();
    for (const z of m.zones) {
      const rock = WS.Sprites.prop('rock', WS.round(z.r * 1.3));
      ctx.drawImage(rock, z.x - z.r * 0.65, z.y - z.r * 1.15, z.r * 1.3, z.r * 1.3);
      ctx.save();
      ctx.strokeStyle = 'rgba(120,245,170,.9)'; ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]); ctx.lineDashOffset = -time * 30;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, WS.TAU); ctx.stroke();
      ctx.restore();
    }
  }

  function drawFence(ctx, m, time) {
    if (!WS.Finale.live(m.a) || !WS.Finale.live(m.b)) return;
    const ax = m.a.x, ay = m.a.y - m.a.radius * 1.6, bx = m.b.x, by = m.b.y - m.b.radius * 1.6;
    const [nx, ny] = WS.normalize(-(by - ay), bx - ax);
    const pts = [];
    const segs = 14;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      const j = (i === 0 || i === segs) ? 0 : WS.randRange(-9, 9);
      pts.push([ax + (bx - ax) * k + nx * j, ay + (by - ay) * k + ny * j]);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [lw, col] of [[8, 'rgba(90,170,255,.35)'], [2.5, 'rgba(220,240,255,.95)']]) {
      ctx.lineWidth = lw; ctx.strokeStyle = col;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.restore();
    // and the ground under it, so the line reads where the feet go
    ctx.save();
    ctx.strokeStyle = 'rgba(120,190,255,.35)'; ctx.lineWidth = 4; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(m.a.x, m.a.y); ctx.lineTo(m.b.x, m.b.y); ctx.stroke();
    ctx.restore();
  }

  /* --------------------------------------------------------- the layers -- */
  A.drawGround = function (ctx, time) {
    const F = WS.Finale;
    const p = WS.Game.player;
    const s = F.s;

    if (F.bounds) {
      const b = F.bounds, W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.rect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
      ctx.fillStyle = 'rgba(200,225,255,.22)';
      ctx.fill('evenodd');
      ctx.clip('evenodd');
      ctx.strokeStyle = 'rgba(240,250,255,.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 90; i++) {
        const sx = ((i * 137 + time * 240) % (W + 200)) - 100;
        const sy = ((i * 89 + time * 60) % H);
        ctx.moveTo(sx, sy); ctx.lineTo(sx - 18, sy + 6);
      }
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(190,230,255,.75)'; ctx.lineWidth = 3;
      ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
      ctx.restore();
    }

    for (const w of F.wrecks) drawWreck(ctx, w, time);

    if (F.stage === 'purge' && p) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const r = F.purgeR;
      const g = ctx.createRadialGradient(p.x, p.y, WS.max(0, r - 90), p.x, p.y, r);
      g.addColorStop(0, 'rgba(255,230,170,0)');
      g.addColorStop(0.8, 'rgba(255,230,170,.35)');
      g.addColorStop(1, 'rgba(255,250,230,.9)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, WS.TAU); ctx.fill();
      ctx.restore();
    }

    if (s) {
      // Mordecai's tethers to his lanterns
      if (s.lanterns && F.live(s.core) && s.mode === 'warded') {
        ctx.save();
        ctx.strokeStyle = 'rgba(140,255,190,.5)'; ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 7]); ctx.lineDashOffset = -time * 50;
        for (const l of s.lanterns) {
          if (!F.live(l)) continue;
          ctx.beginPath(); ctx.moveTo(l.x + l.radius * 0.5, l.y - l.radius * 0.5);
          ctx.lineTo(s.core.x, s.core.y - s.core.radius * 0.5); ctx.stroke();
        }
        ctx.restore();
      }
      // the Heart-Drill's coolant lines
      if (s.pipes && F.live(s.core)) {
        for (const q of s.pipes) {
          if (!F.live(q)) continue;
          ctx.save();
          ctx.lineCap = 'round';
          ctx.strokeStyle = IRON.line; ctx.lineWidth = 18;
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(s.core.x, s.core.y + s.core.radius * 0.2); ctx.stroke();
          ctx.strokeStyle = IRON.mid; ctx.lineWidth = 12;
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(s.core.x, s.core.y + s.core.radius * 0.2); ctx.stroke();
          ctx.strokeStyle = `rgba(255,150,60,${(0.5 + 0.3 * WS.sin(time * 5)).toFixed(2)})`; ctx.lineWidth = 3;
          ctx.setLineDash([10, 12]); ctx.lineDashOffset = time * 60;
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(s.core.x, s.core.y + s.core.radius * 0.2); ctx.stroke();
          ctx.restore();
        }
      }
      // the Candlecrawler, underground
      if (s.mode === 'burrow') {
        ctx.save();
        ctx.fillStyle = 'rgba(70,50,32,.85)';
        ctx.beginPath(); ctx.ellipse(s.mx, s.my, 46, 20, 0, 0, WS.TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(30,20,12,.8)'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * WS.TAU + time;
          ctx.beginPath(); ctx.moveTo(s.mx, s.my);
          ctx.lineTo(s.mx + WS.cos(a) * 60, s.my + WS.sin(a) * 26); ctx.stroke();
        }
        ctx.restore();
      }
      if (s.dropping && s.core) {
        const k = WS.clamp(1 - (225 - s.core.y) / 525, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.15 + 0.45 * k;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(640, 225 + 70, 60 + 90 * k, 16 + 22 * k, 0, 0, WS.TAU); ctx.fill();
        ctx.restore();
      }
      if (s.orb && !F.pods.some((q) => q.carrying)) glow(ctx, s.orb.x, s.orb.y, 22, [0.55, 1.0, 0.75], 0.9);
    }

    for (const m of F.marks) {
      if (m.kind === 'circle') drawCircle(ctx, m, time);
      else if (m.kind === 'lane') drawLane(ctx, m, time);
      else if (m.kind === 'ring') drawRing(ctx, m);
      else if (m.kind === 'grid') drawGrid(ctx, m);
      else if (m.kind === 'safe') drawSafe(ctx, m, time);
    }
  };

  A.drawAir = function (ctx, time) {
    const F = WS.Finale;
    for (const m of F.marks) {
      if (m.kind === 'sweep') drawSweep(ctx, m, time);
      else if (m.kind === 'fence') drawFence(ctx, m, time);
      else if (m.kind === 'circle' && (m.from || m.style === 'ice')) drawShell(ctx, m, time);
    }
    for (const pod of F.pods) {
      if (pod.x < -120 || pod.x > WS.CONST.WORLD_WIDTH + 120 || pod.y < -120) continue;
      drawPod(ctx, pod, time);
    }
  };

  function wrap(ctx, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /** Screen space: the dark, the letterbox, who is talking, the countdown. */
  A.drawOverlay = function (ctx, time, R) {
    const F = WS.Finale;
    const p = WS.Game.player;
    const vw = R.viewW, vh = R.viewH;

    if (F.darkness > 0.01 && p) {
      const cx = R.offsetX + p.x * R.scale, cy = R.offsetY + p.y * R.scale;
      const r = (360 - 150 * F.darkness) * R.scale;
      const g = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(2,4,8,${(0.85 * F.darkness).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
    }

    if (F.cinema > 0 && F.cinemaMax > 0) {
      const inA = WS.clamp((F.cinemaMax - F.cinema) / 0.5, 0, 1);
      const outA = WS.clamp(F.cinema / 0.5, 0, 1);
      const k = WS.min(inA, outA);
      const bar = vh * 0.085 * (1 - (1 - k) * (1 - k));
      ctx.fillStyle = '#030406';
      ctx.fillRect(0, 0, vw, bar);
      ctx.fillRect(0, vh - bar, vw, bar);
    }

    const covered = WS.Game.overlayCovers();
    if (F.stage === 'breather' && !covered) {
      const n = WS.max(0, WS.ceil(F.timer));
      ctx.save();
      ctx.textAlign = 'center';
      // said, not labelled: the voice, not the interface's spaced capitals
      ctx.fillStyle = 'rgba(245,215,160,.92)';
      ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 8;
      ctx.font = `italic 500 ${WS.round(17 * R.scale + 6)}px ${VOICE_FONT}`;
      ctx.fillText('The field is clear. Breathe.', vw / 2, vh * 0.16);
      ctx.shadowBlur = 0;
      if (F.timer <= 10) {
        const k = F.timer - WS.floor(F.timer);
        ctx.globalAlpha = 0.5 + 0.5 * k;
        ctx.font = `700 ${WS.round((42 + 20 * k) * R.scale + 10)}px ${UI_FONT}`;
        ctx.fillStyle = F.timer <= 3 ? '#ff7a64' : '#ffe6ae';
        ctx.fillText(String(n), vw / 2, vh * 0.16 + (54 * R.scale + 14));
      }
      ctx.restore();
    }

    if (F.s && F.s.mode === 'destruct' && F.s.destructT > 0 && !covered) {
      ctx.save();
      ctx.textAlign = 'center';
      const k = F.s.destructT - WS.floor(F.s.destructT);
      ctx.font = `800 ${WS.round((60 + 30 * k) * R.scale + 10)}px ${UI_FONT}`;
      ctx.fillStyle = `rgba(255,96,72,${(0.6 + 0.4 * k).toFixed(2)})`;
      ctx.fillText(String(WS.ceil(F.s.destructT)), vw / 2, vh * 0.3);
      ctx.restore();
    }

    /* WHO IS TALKING, AND HOW.
     *
     * This was the last box in the game drawn the old way: a flat grey slab
     * with a hairline, a name in spaced sans capitals and the line in the
     * interface face - the villains' whole voice, in the one font the game
     * uses for numbers and settings. Every other speaking part in the game
     * is set in Alegreya on an inked panel, so this is too: a warm dark
     * plate with a gilt edge and an inner rule, the speaker's colour across
     * the top, their face in a gilt medallion, and the words arriving at a
     * speaking pace rather than all at once, in time with the babble that
     * carries them. The layout is measured on the whole line first, so the
     * box never grows while the words fill it. */
    const line = F.line;
    if (line && !covered) {
      const sp = WS.FinaleSpeakers[line.who] || WS.FinaleSpeakers.narrator;
      const age = line.dur - line.life;
      const a = WS.min(WS.clamp(age / 0.25, 0, 1), WS.clamp(line.life / 0.35, 0, 1));
      const fs = WS.round(WS.clamp(16 * R.scale + 5, 15, 24));
      const narr = !sp.name;
      ctx.save();
      ctx.globalAlpha = a;
      const face = `${narr ? 'italic 500' : '400'} ${fs}px ${VOICE_FONT}`;
      ctx.font = face;
      const maxW = WS.min(vw * 0.58, 720);
      const lines = wrap(ctx, line.text, maxW);
      let wmax = 0;
      for (const l of lines) wmax = WS.max(wmax, ctx.measureText(l).width);
      const portrait = sp.art ? fs * 3.3 : 0;
      const padX = fs * 1.1, padY = fs * 0.8;
      const nameH = sp.name ? fs * 1.15 : 0;
      const boxW = wmax + padX * 2 + (portrait ? portrait + fs * 0.4 : 0);
      const boxH = WS.max(portrait + fs * 0.2, nameH + lines.length * fs * 1.34) + padY * 2;
      const bx = WS.round(vw / 2 - boxW / 2);
      const by = WS.round(vh * 0.78 - boxH / 2);
      const col = sp.colour || '#f5c56b';
      // the plate, lifted off the field by its own shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 6;
      rrect(ctx, bx, by, boxW, boxH, 7);
      const plate = ctx.createLinearGradient(0, by, 0, by + boxH);
      plate.addColorStop(0, 'rgba(30,25,22,.95)');
      plate.addColorStop(1, 'rgba(11,11,15,.95)');
      ctx.fillStyle = plate; ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(245,197,107,.5)'; ctx.lineWidth = 1;
      rrect(ctx, bx + 0.5, by + 0.5, boxW - 1, boxH - 1, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(245,197,107,.14)';
      rrect(ctx, bx + 4.5, by + 4.5, boxW - 9, boxH - 9, 4); ctx.stroke();
      // the speaker's colour across the top, fading at both ends
      const rule = ctx.createLinearGradient(bx, 0, bx + boxW, 0);
      rule.addColorStop(0, 'rgba(0,0,0,0)'); rule.addColorStop(0.2, col);
      rule.addColorStop(0.8, col); rule.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rule;
      ctx.fillRect(bx + 8, by - 1, boxW - 16, 2);
      // two ember diamonds where the rule meets the frame
      for (const dx of [bx + boxW * 0.2, bx + boxW * 0.8]) {
        ctx.save(); ctx.translate(dx, by); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#f5c56b'; ctx.fillRect(-2.5, -2.5, 5, 5);
        ctx.restore();
      }
      if (sp.art) {
        const ps = WS.round(portrait);
        const cx = bx + padX * 0.7 + ps / 2, cy = by + boxH / 2;
        const r0 = ps * 0.47;
        const halo = ctx.createRadialGradient(cx, cy, r0 * 0.2, cx, cy, r0);
        halo.addColorStop(0, 'rgba(60,48,40,.95)'); halo.addColorStop(1, 'rgba(18,15,14,.95)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(cx, cy, r0, 0, WS.TAU); ctx.fill();
        const pimg = WS.Sprites.creature(sp.art, sp.tint, ps, sp.kit);
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r0 - 1, 0, WS.TAU); ctx.clip();
        ctx.drawImage(pimg, cx - ps / 2, cy - ps / 2 + 3, ps, ps);
        ctx.restore();
        ctx.strokeStyle = '#c9a24e'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r0, 0, WS.TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,236,190,.45)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, r0 + 2.5, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
      }
      const tx = bx + padX + (portrait ? portrait + fs * 0.4 : 0);
      let ty = by + padY + fs * 0.92;
      ctx.textAlign = 'left';
      if (sp.name) {
        ctx.font = `700 ${WS.round(fs * 0.74)}px ${VOICE_FONT}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0.14em';
        ctx.fillStyle = col;
        ctx.fillText(sp.name.toUpperCase(), tx, ty - fs * 0.12);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        ty += nameH;
      }
      // the words, arriving at a speaking pace
      ctx.font = face;
      ctx.fillStyle = narr ? '#e6dcc8' : '#f4eee2';
      let left = WS.floor(age * 52);
      for (const l of lines) {
        if (left <= 0) break;
        ctx.fillText(left >= l.length ? l : l.slice(0, left), tx, ty);
        left -= l.length + 1;
        ty += fs * 1.34;
      }
      ctx.restore();
    }
  };

  /* ------------------------------------------------------------ portraits -- */
  function portrait(kind, tint, fr, fy) {
    return function (g, s) {
      const e = { x: s / 2, y: s * fy, radius: s * fr, facing: 1, template: { tint },
        dmgTaken: 1, untargetable: false, health: 1, maxHealth: 1, spawnId: 3, rise: 1 };
      M[kind](g, e, 0, { still: true });
    };
  }
  WS.Sprites.define('candlecrawler', portrait('candlecrawler', [0.95, 0.66, 0.30], 0.25, 0.6));
  WS.Sprites.define('galleon', portrait('galleon', [0.72, 0.48, 0.30], 0.2, 0.7));
  WS.Sprites.define('stormbreaker', portrait('stormbreaker', [0.62, 0.70, 0.82], 0.22, 0.44));
  WS.Sprites.define('heartdrill', portrait('heartdrill', [0.86, 0.52, 0.26], 0.23, 0.56));
  WS.Sprites.define('turret', portrait('turret', [1.0, 0.78, 0.38], 0.3, 0.62));
  /* Marrowfrost's portrait is his own sprite, cropped to the skull and the
     crown: the full figure in a dialogue circle is a face three pixels
     wide, and he is the one speaker whose face has to land. */
  WS.Sprites.define('marrowfrost_face', function (g, s) {
    const full = WS.Sprites.creature('marrowfrost', [0.62, 0.88, 1.0], WS.round(s));
    const z = 2.3;
    g.drawImage(full, s / 2 - s * z * 0.5, s * 0.50 - s * z * 0.27, s * z, s * z);
  });

  A.machines = M;
  WS.FinaleArt = A;

})(window.WS);
