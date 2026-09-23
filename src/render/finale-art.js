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
    const sz = WS.round(r * 2.3);
    const bob = still ? 0 : WS.sin(t * 5) * r * 0.05;
    ctx.drawImage(WS.Sprites.creature('lampling', [1.0, 0.86, 0.5], sz),
      x - sz / 2, y - sz * 0.5 + bob, sz, sz);
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
    // tracks
    const treadOff = o.still ? 0 : (t * (e.chargeTimer > 0 ? 260 : 40)) % 14;
    plate(ctx, x - R * 1.25, y + R * 0.3, R * 2.5, R * 0.6, R * 0.3, IRON);
    ctx.save();
    rrect(ctx, x - R * 1.25, y + R * 0.3, R * 2.5, R * 0.6, R * 0.3); ctx.clip();
    ctx.strokeStyle = 'rgba(10,10,12,.6)'; ctx.lineWidth = 3;
    for (let tx = x - R * 1.3 - treadOff * f; tx < x + R * 1.3; tx += 14) {
      ctx.beginPath(); ctx.moveTo(tx, y + R * 0.3); ctx.lineTo(tx + 4, y + R * 0.9); ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 5; i++) {
      const wx = x - R * 0.95 + i * R * 0.475;
      ctx.fillStyle = IRON.dark;
      ctx.beginPath(); ctx.arc(wx, y + R * 0.6, R * 0.17, 0, WS.TAU); ctx.fill();
      ctx.fillStyle = IRON.hi;
      ctx.beginPath(); ctx.arc(wx, y + R * 0.6, R * 0.06, 0, WS.TAU); ctx.fill();
    }
    // candle smokestacks at the back
    for (let k = 0; k < 2; k++) {
      const sx = x - f * R * (0.55 + k * 0.3), sy = y - R * 0.3;
      const h = R * (0.62 - k * 0.14);
      plate(ctx, sx - R * 0.1, sy - h, R * 0.2, h, R * 0.06, pal([0.96, 0.9, 0.74]));
      if (!o.wreck) flame(ctx, sx, sy - h, R * 0.28, t + k);
    }
    // the hull
    shape(ctx, [[x - R * 1.1, y + R * 0.38], [x + R * 1.1, y + R * 0.38],
      [x + R * 0.85 * f + (f < 0 ? 0 : 0), y - R * 0.36], [x - R * 0.95 * f, y - R * 0.36]]
      .map(([px, py]) => [px, py]), p, 2.5);
    // hazard band
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
    ctx.restore();
    rivets(ctx, x - R * 0.9, x + R * 0.9, y - R * 0.22, 7, R * 0.035);
    // the drill
    const dx0 = x + f * R * 0.95, dy0 = y + R * 0.02;
    const len = R * 0.95, half = R * 0.36;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx0, dy0 - half); ctx.lineTo(dx0 + f * len, dy0); ctx.lineTo(dx0, dy0 + half);
    ctx.closePath();
    const dg = ctx.createLinearGradient(0, dy0 - half, 0, dy0 + half);
    dg.addColorStop(0, '#e6e2da'); dg.addColorStop(0.5, '#8d8a86'); dg.addColorStop(1, '#3a3836');
    ctx.fillStyle = dg; ctx.fill();
    ctx.strokeStyle = '#1b1a18'; ctx.lineWidth = 2; ctx.stroke();
    ctx.clip();
    const spin = o.still ? 0 : (t * (busy ? 16 : 5)) % 1;
    ctx.strokeStyle = 'rgba(20,20,22,.7)'; ctx.lineWidth = 3;
    for (let s = -1; s < 7; s++) {
      const u = (s + spin) / 6;
      const sx = dx0 + f * len * u;
      ctx.beginPath();
      ctx.moveTo(sx, dy0 - half); ctx.lineTo(sx + f * len * 0.14, dy0 + half); ctx.stroke();
    }
    ctx.restore();
    if (busy && e.chargeTimer > 0) {
      glow(ctx, dx0 + f * len, dy0, R * 0.6, [1.0, 0.7, 0.3], 0.6);
    }
    // headlamp
    if (!o.wreck) glow(ctx, x + f * R * 0.62, y - R * 0.2, R * 0.35, [1.0, 0.92, 0.6], 0.8);
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
    plate(ctx, x - R * 0.9, y + R * 0.1, R * 1.8, R * 0.6, R * 0.2, IRON);
    const ang = aimAt(e, o.still);
    ctx.save();
    ctx.translate(x, y - R * 0.1); ctx.rotate(ang);
    plate(ctx, 0, -R * 0.2, R * 1.3, R * 0.4, R * 0.1, IRON);
    ctx.fillStyle = '#16120e';
    ctx.beginPath(); ctx.ellipse(R * 1.3, 0, R * 0.08, R * 0.2, 0, 0, WS.TAU); ctx.fill();
    ctx.restore();
    // the lantern
    rrect(ctx, x - R * 0.55, y - R * 0.75, R * 1.1, R * 0.95, R * 0.3);
    const lg = ctx.createRadialGradient(x, y - R * 0.3, 1, x, y - R * 0.3, R * 0.7);
    lg.addColorStop(0, '#fff3c4'); lg.addColorStop(0.5, p.hi); lg.addColorStop(1, p.lo);
    ctx.fillStyle = lg; ctx.fill();
    ctx.strokeStyle = IRON.dark; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(30,24,20,.6)'; ctx.lineWidth = 1.6;
    for (const dx of [-0.2, 0.2]) {
      ctx.beginPath(); ctx.moveTo(x + R * dx, y - R * 0.75); ctx.lineTo(x + R * dx, y + R * 0.2); ctx.stroke();
    }
    if (!o.wreck) glow(ctx, x, y - R * 0.3, R * 1.4, [1.0, 0.8, 0.4], 0.45 + 0.15 * WS.sin(t * 6 + x));
  };

  M.cannon = function (ctx, e, t, o) {
    const R = e.radius, x = e.x, y = e.y;
    rrect(ctx, x - R * 0.7, y - R * 0.7, R * 1.4, R * 1.2, R * 0.12);
    ctx.fillStyle = WOOD.dark; ctx.fill();
    ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 2; ctx.stroke();
    const ang = o.still ? WS.PI / 2 : WS.clamp(aimAt(e, false), 0.2, WS.PI - 0.2);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    plate(ctx, -R * 0.2, -R * 0.3, R * 1.3, R * 0.6, R * 0.2, pal([0.24, 0.24, 0.27]));
    ctx.fillStyle = '#0b0a09';
    ctx.beginPath(); ctx.ellipse(R * 1.1, 0, R * 0.12, R * 0.25, 0, 0, WS.TAU); ctx.fill();
    ctx.restore();
  };

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
    // masts and sails, behind the hull's rail
    const billow = o.still ? 0.1 : 0.1 + 0.05 * WS.sin(t * 2.1);
    const masts = wreck ? [[0.5, 0.9]] : [[-0.55, 1.95], [0.5, 1.75]];
    for (const [mx, mh] of masts) {
      const px = x + f * R * mx;
      ctx.strokeStyle = WOOD.line; ctx.lineWidth = R * 0.07;
      ctx.beginPath(); ctx.moveTo(px, y - R * 0.2); ctx.lineTo(px, y - R * mh); ctx.stroke();
      ctx.strokeStyle = WOOD.hi; ctx.lineWidth = R * 0.025;
      ctx.beginPath(); ctx.moveTo(px - R * 0.015, y - R * 0.2); ctx.lineTo(px - R * 0.015, y - R * mh); ctx.stroke();
      const sw = R * 0.55, top = y - R * (mh - 0.15), bot = y - R * 0.45;
      ctx.beginPath();
      ctx.moveTo(px - sw, top);
      ctx.quadraticCurveTo(px + f * R * billow * 2, top - R * 0.08, px + sw, top);
      ctx.quadraticCurveTo(px + sw + f * R * billow * 3, (top + bot) / 2, px + sw * 0.92, bot);
      ctx.quadraticCurveTo(px, bot + R * 0.06, px - sw * 0.92, bot);
      ctx.quadraticCurveTo(px - sw + f * R * billow * 3, (top + bot) / 2, px - sw, top);
      const sg = ctx.createLinearGradient(px - sw, 0, px + sw, 0);
      sg.addColorStop(0, wreck ? '#6d6153' : '#efe3c8'); sg.addColorStop(1, wreck ? '#4a4034' : '#c8b893');
      ctx.fillStyle = sg; ctx.fill();
      ctx.strokeStyle = '#6b5a40'; ctx.lineWidth = 1.5; ctx.stroke();
      if (wreck) {
        ctx.fillStyle = '#1a1612';
        ctx.beginPath(); ctx.arc(px + sw * 0.3, (top + bot) / 2, R * 0.14, 0, WS.TAU); ctx.fill();
      } else {
        // the Kerchief mask
        const my = (top + bot) / 2;
        ctx.fillStyle = '#c3322c';
        ctx.beginPath(); ctx.ellipse(px, my, sw * 0.42, R * 0.18, 0, 0, WS.TAU); ctx.fill();
        ctx.fillStyle = '#1a1210';
        for (const d of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(px + d * sw * 0.17, my - R * 0.02, sw * 0.1, R * 0.06, 0, 0, WS.TAU); ctx.fill();
        }
      }
      if (!wreck) {
        const fx = px, fy = y - R * mh;
        ctx.fillStyle = '#c3322c';
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(fx - f * R * 0.2, fy + R * (0.05 + 0.04 * WS.sin(t * 6 + mx)),
          fx - f * R * 0.4, fy + R * 0.02);
        ctx.lineTo(fx - f * R * 0.36, fy + R * 0.14);
        ctx.lineTo(fx, fy + R * 0.14);
        ctx.fill();
      }
    }
    // the hull
    ctx.beginPath();
    ctx.moveTo(x + f * R * 1.8, y - R * 0.3);
    ctx.quadraticCurveTo(x + f * R * 1.3, y + R * 0.55, x, y + R * 0.62);
    ctx.quadraticCurveTo(x - f * R * 1.2, y + R * 0.5, x - f * R * 1.6, y - R * 0.45);
    ctx.lineTo(x - f * R * 1.35, y - R * 0.5);
    ctx.lineTo(x + f * R * 1.55, y - R * 0.32);
    ctx.closePath();
    const hg = ctx.createLinearGradient(0, y - R * 0.5, 0, y + R * 0.62);
    hg.addColorStop(0, wreck ? '#3a2c22' : WOOD.hi); hg.addColorStop(0.45, wreck ? '#2a2019' : WOOD.mid);
    hg.addColorStop(1, wreck ? '#140f0c' : WOOD.dark);
    ctx.fillStyle = hg; ctx.fill();
    ctx.strokeStyle = WOOD.line; ctx.lineWidth = 3; ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(20,12,8,.45)'; ctx.lineWidth = 1.5;
    for (let py = y - R * 0.3; py < y + R * 0.65; py += R * 0.14) {
      ctx.beginPath(); ctx.moveTo(x - R * 2, py); ctx.lineTo(x + R * 2, py + R * 0.06); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = wreck ? '#5a4a30' : '#d8b04a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - f * R * 1.45, y - R * 0.36); ctx.lineTo(x + f * R * 1.6, y - R * 0.2); ctx.stroke();
    // stern windows
    if (!wreck) {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = `rgba(255,210,120,${0.7 + 0.2 * WS.sin(t * 3 + i)})`;
        ctx.fillRect(x - f * R * (1.25 - i * 0.14) - R * 0.04, y - R * 0.25, R * 0.08, R * 0.12);
      }
    }
    // the Admiral on the quarterdeck
    if (!wreck && !o.still) {
      const sz = WS.round(R * 0.95);
      ctx.drawImage(WS.Sprites.creature('bandit', [0.92, 0.22, 0.28], sz, ['plumehat', 'pauldrons']),
        x - f * R * 1.05 - sz / 2, y - R * 0.45 - sz * 0.62, sz, sz);
    }
    if (wreck) {
      glow(ctx, x - R * 0.4, y, R * 0.9, [1.0, 0.45, 0.15], 0.4 + 0.2 * WS.sin(t * 9));
      glow(ctx, x + R * 0.6, y - R * 0.2, R * 0.6, [1.0, 0.55, 0.2], 0.35 + 0.2 * WS.sin(t * 7));
    }
  };

  M.soullantern = function (ctx, e, t, o) {
    const R = e.radius, x = e.x, y = e.y;
    ctx.strokeStyle = IRON.line; ctx.lineWidth = R * 0.18;
    ctx.beginPath(); ctx.moveTo(x, y + R * 0.9); ctx.lineTo(x, y - R * 1.3); ctx.lineTo(x + R * 0.5, y - R * 1.3); ctx.stroke();
    ctx.strokeStyle = IRON.mid; ctx.lineWidth = R * 0.07;
    ctx.beginPath(); ctx.moveTo(x - R * 0.03, y + R * 0.9); ctx.lineTo(x - R * 0.03, y - R * 1.25); ctx.stroke();
    const sway = o.still ? 0 : WS.sin(t * 1.6 + x) * 0.12;
    ctx.save();
    ctx.translate(x + R * 0.5, y - R * 1.3); ctx.rotate(sway);
    ctx.strokeStyle = IRON.line; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, R * 0.35); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-R * 0.35, R * 0.4); ctx.lineTo(R * 0.35, R * 0.4); ctx.lineTo(R * 0.45, R * 1.3);
    ctx.lineTo(-R * 0.45, R * 1.3); ctx.closePath();
    ctx.fillStyle = 'rgba(40,70,55,.8)'; ctx.fill();
    ctx.strokeStyle = IRON.dark; ctx.lineWidth = 2.5; ctx.stroke();
    const pulse = o.still ? 1 : 0.8 + 0.2 * WS.sin(t * 5 + x);
    glow(ctx, 0, R * 0.85, R * 0.55 * pulse, [0.6, 1.0, 0.75], 0.95);
    glow(ctx, 0, R * 0.85, R * 2.2, [0.45, 1.0, 0.7], 0.35 * pulse);
    ctx.restore();
  };

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
      ctx.lineCap = 'round';
      ctx.strokeStyle = IRON.line; ctx.lineWidth = R * 0.3;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.strokeStyle = IRON.lo; ctx.lineWidth = R * 0.2;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.fillStyle = IRON.dark;
      ctx.beginPath(); ctx.ellipse(fx, fy + R * 0.08, R * 0.26, R * 0.1, 0, 0, WS.TAU); ctx.fill();
    }
    // front-leg stumps once the legs are gone
    const legsGone = s && s.core === e && s.legs && !s.legs.length && s.mode !== 'enter';
    if (legsGone) {
      for (const d of [-1, 1]) {
        plate(ctx, x + d * R * 0.62 - R * 0.14, y + R * 0.2, R * 0.28, R * 0.45, R * 0.08, IRON);
        if (!o.still && WS.random() < 0.3) glow(ctx, x + d * R * 0.62, y + R * 0.65, R * 0.25, [0.6, 0.85, 1.0], 0.9);
      }
    }
    // body
    ctx.beginPath();
    ctx.moveTo(x - R * 1.25, y + R * 0.2);
    ctx.quadraticCurveTo(x - R * 1.3, y - R * 0.6, x - R * 0.5, y - R * 0.78);
    ctx.lineTo(x + R * 0.5, y - R * 0.78);
    ctx.quadraticCurveTo(x + R * 1.3, y - R * 0.6, x + R * 1.25, y + R * 0.2);
    ctx.quadraticCurveTo(x, y + R * 0.62, x - R * 1.25, y + R * 0.2);
    ctx.closePath();
    const bg = ctx.createLinearGradient(0, y - R * 0.8, 0, y + R * 0.6);
    bg.addColorStop(0, p.hi); bg.addColorStop(0.5, p.mid); bg.addColorStop(1, p.dark);
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = p.line; ctx.lineWidth = 3; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(10,14,20,.35)'; ctx.lineWidth = 2;
    for (const band of [-0.45, -0.1, 0.25]) {
      ctx.beginPath(); ctx.moveTo(x - R * 1.4, y + R * band); ctx.quadraticCurveTo(x, y + R * (band + 0.18), x + R * 1.4, y + R * band); ctx.stroke();
    }
    ctx.restore();
    rivets(ctx, x - R * 1.0, x + R * 1.0, y - R * 0.6, 9, R * 0.03);
    // the stolen ember, behind a grille
    const heat = o.still ? 0.8 : 0.7 + 0.3 * WS.sin(t * 3);
    glow(ctx, x, y - R * 0.05, R * 0.55, [1.0, 0.6, 0.25], 0.8 * heat);
    ctx.strokeStyle = 'rgba(20,20,24,.8)'; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(x + i * R * 0.1, y - R * 0.3); ctx.lineTo(x + i * R * 0.1, y + R * 0.2); ctx.stroke();
    }
    pilot(ctx, x, y - R * 0.62, R * 0.24, t, o.still);
    // belly cannon
    plate(ctx, x - R * 0.2, y + R * 0.38, R * 0.4, R * 0.36, R * 0.1, pal([0.72, 0.52, 0.3]));
    const firing = !o.still && WS.Finale.marks.some((m) => m.kind === 'sweep' && m.follow === e);
    glow(ctx, x, y + R * 0.78, R * (firing ? 0.7 : 0.3), [0.55, 0.85, 1.0], firing ? 0.95 : 0.5);
    if (s && s.mode === 'destruct' && s.core === e) {
      const blink = WS.sin(t * 18) > 0;
      glow(ctx, x, y, R * 2, [1.0, 0.2, 0.1], blink ? 0.4 : 0.15);
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
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = IRON.line; ctx.lineWidth = R * 0.62;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = IRON.mid; ctx.lineWidth = R * 0.44;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = IRON.hi; ctx.lineWidth = R * 0.1;
    ctx.beginPath(); ctx.moveTo(hx - 3, hy - 3); ctx.lineTo(kx - 3, ky - 3); ctx.lineTo(fx - 3, fy - 3); ctx.stroke();
    ctx.fillStyle = IRON.dark;
    ctx.beginPath(); ctx.arc(kx, ky, R * 0.3, 0, WS.TAU); ctx.fill();
    ctx.fillStyle = '#9fd6ff';
    ctx.beginPath(); ctx.arc(kx, ky, R * 0.1, 0, WS.TAU); ctx.fill();
    plate(ctx, fx - R * 0.55, fy - R * 0.1, R * 1.1, R * 0.3, R * 0.1, IRON);
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
    // the bore
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y + R * 1.0, R * 0.75, R * 0.26, 0, 0, WS.TAU);
    ctx.fillStyle = '#07090d'; ctx.fill();
    ctx.strokeStyle = '#bfe6ff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    glow(ctx, x, y + R * 1.0, R * 0.8, wreck ? [0.7, 0.9, 1.0] : [1.0, 0.45, 0.2], 0.55);
    // derrick
    ctx.lineCap = 'round';
    ctx.strokeStyle = wreck ? '#2c3440' : IRON.line; ctx.lineWidth = R * 0.1;
    const apexX = x + (wreck ? R * 0.5 : 0), apexY = y - R * (wreck ? 1.0 : 1.55);
    ctx.beginPath();
    ctx.moveTo(x - R * 0.95, y + R * 0.85); ctx.lineTo(apexX, apexY); ctx.lineTo(x + R * 0.95, y + R * 0.85);
    ctx.stroke();
    ctx.strokeStyle = wreck ? '#3c4550' : IRON.lo; ctx.lineWidth = R * 0.04;
    for (let i = 1; i < 6; i++) {
      const k = i / 6;
      const lx = x - R * 0.95 + (apexX - x + R * 0.95) * k, ly = y + R * 0.85 + (apexY - y - R * 0.85) * k;
      const rx = x + R * 0.95 + (apexX - x - R * 0.95) * k;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ly); ctx.stroke();
      if (i < 5) {
        const k2 = (i + 1) / 6;
        const ly2 = y + R * 0.85 + (apexY - y - R * 0.85) * k2;
        const rx2 = x + R * 0.95 + (apexX - x - R * 0.95) * k2;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx2, ly2); ctx.stroke();
      }
    }
    // shaft
    const spin = o.still || wreck ? 0 : ((e.drillSpin || 0) % 1);
    ctx.save();
    rrect(ctx, x - R * 0.16, y + R * 0.2, R * 0.32, R * 0.85, R * 0.05);
    ctx.fillStyle = '#6d6a66'; ctx.fill(); ctx.clip();
    ctx.strokeStyle = 'rgba(20,20,22,.7)'; ctx.lineWidth = 3;
    for (let i = -1; i < 7; i++) {
      const sy = y + R * 0.2 + ((i + spin) / 6) * R * 0.85;
      ctx.beginPath(); ctx.moveTo(x - R * 0.2, sy); ctx.lineTo(x + R * 0.2, sy + R * 0.1); ctx.stroke();
    }
    ctx.restore();
    // engine drum
    plate(ctx, x - R * 0.78, y - R * 0.42, R * 1.56, R * 0.72, R * 0.2, wreck ? pal([0.3, 0.34, 0.4]) : pal(e.template.tint));
    rivets(ctx, x - R * 0.62, x + R * 0.62, y - R * 0.3, 8, R * 0.03);
    if (!wreck) {
      for (let i = 0; i < 3; i++) {
        const gx = x - R * 0.4 + i * R * 0.4;
        ctx.fillStyle = '#10131a';
        ctx.beginPath(); ctx.arc(gx, y - R * 0.05, R * 0.12, 0, WS.TAU); ctx.fill();
        ctx.strokeStyle = '#ffcf6b'; ctx.lineWidth = 2;
        const a = WS.PI * 0.8 + (o.still ? 0.5 : 0.5 + 0.4 * WS.sin(t * (2 + i))) * WS.PI;
        ctx.beginPath(); ctx.moveTo(gx, y - R * 0.05); ctx.lineTo(gx + WS.cos(a) * R * 0.1, y - R * 0.05 + WS.sin(a) * R * 0.1); ctx.stroke();
      }
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
    ctx.drawImage(WS.Sprites.creature('bandit', e.template.tint, sz, ['plumehat', 'pauldrons']),
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
      ctx.fillStyle = 'rgba(245,197,107,.85)';
      ctx.font = `600 ${WS.round(13 * R.scale + 4)}px ${UI_FONT}`;
      ctx.fillText('THE FIELD IS CLEAR · BREATHE', vw / 2, vh * 0.16);
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

    const line = F.line;
    if (line && !covered) {
      const sp = WS.FinaleSpeakers[line.who] || WS.FinaleSpeakers.narrator;
      const age = line.dur - line.life;
      const a = WS.min(WS.clamp(age / 0.25, 0, 1), WS.clamp(line.life / 0.35, 0, 1));
      const fs = WS.round(WS.clamp(15 * R.scale + 4, 14, 22));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `500 ${fs}px ${UI_FONT}`;
      const maxW = WS.min(vw * 0.6, 760);
      const lines = wrap(ctx, line.text, maxW);
      let wmax = 0;
      for (const l of lines) wmax = WS.max(wmax, ctx.measureText(l).width);
      const portrait = sp.art ? fs * 3.2 : 0;
      const padX = fs, padY = fs * 0.75;
      const nameH = sp.name ? fs * 1.1 : 0;
      const boxW = wmax + padX * 2 + portrait;
      const boxH = WS.max(portrait, nameH + lines.length * fs * 1.35) + padY * 2;
      const bx = vw / 2 - boxW / 2;
      const by = vh * 0.78 - boxH / 2;
      rrect(ctx, bx, by, boxW, boxH, 6);
      ctx.fillStyle = 'rgba(8,9,13,.86)'; ctx.fill();
      ctx.strokeStyle = 'rgba(245,197,107,.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = sp.colour;
      ctx.fillRect(bx + 10, by, boxW - 20, 2);
      if (sp.art) {
        const ps = WS.round(portrait);
        const pimg = WS.Sprites.creature(sp.art, sp.tint, ps, sp.kit);
        ctx.save();
        ctx.beginPath(); ctx.arc(bx + padX * 0.6 + ps / 2, by + boxH / 2, ps * 0.46, 0, WS.TAU);
        ctx.fillStyle = 'rgba(40,34,30,.9)'; ctx.fill(); ctx.clip();
        ctx.drawImage(pimg, bx + padX * 0.6, by + boxH / 2 - ps / 2 + 3, ps, ps);
        ctx.restore();
      }
      const tx = bx + padX + portrait;
      let ty = by + padY + fs * 0.9;
      ctx.textAlign = 'left';
      if (sp.name) {
        ctx.font = `700 ${WS.round(fs * 0.72)}px ${UI_FONT}`;
        ctx.fillStyle = sp.colour;
        ctx.fillText(sp.name.toUpperCase(), tx, ty - fs * 0.15);
        ty += nameH;
      }
      ctx.font = `${sp.name ? 500 : 'italic 500'} ${fs}px ${UI_FONT}`;
      ctx.fillStyle = '#f1ebdf';
      for (const l of lines) { ctx.fillText(l, tx, ty); ty += fs * 1.35; }
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
  WS.Sprites.define('galleon', portrait('galleon', [0.72, 0.48, 0.30], 0.24, 0.68));
  WS.Sprites.define('stormbreaker', portrait('stormbreaker', [0.62, 0.70, 0.82], 0.22, 0.44));
  WS.Sprites.define('heartdrill', portrait('heartdrill', [0.86, 0.52, 0.26], 0.23, 0.56));
  WS.Sprites.define('turret', portrait('turret', [1.0, 0.78, 0.38], 0.3, 0.62));

  A.machines = M;
  WS.FinaleArt = A;

})(window.WS);
