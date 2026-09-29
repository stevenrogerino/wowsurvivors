/* THE AIR. Between the ground and the light there was nothing: no mist lying
 * in the low places, nothing drifting through a lantern's glow, no weather.
 * Each battlefield now has air of its own.
 *
 *   mist     a few broad banks of low fog, drifting, drawn over the field
 *            BEFORE the light (WS.Lighting) - so the night takes them away
 *            where it is dark and they show where light falls on them, which
 *            is what fog does and why it reads as depth.
 *   motes    what the air carries on this battlefield: fireflies in the
 *            forest, dust off the plains, snow on the Wastes, wisps over the
 *            graves, drizzle on the moor. Drawn after the light: fireflies
 *            and wisps glow, and a snowflake is the colour of snow.
 *
 * Neither keeps any state. Every mote's place is a function of its index and
 * the clock (wrapped to the field), so there is nothing to spawn, pool or
 * reset, and a paused frame is the same frame. Balanced quality keeps the
 * motes at half and draws no mist. */
'use strict';
(function (WS) {
  const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
  const Air = WS.Atmosphere = {};

  /* Per battlefield. mist: [colour, strength]; motes: what they are, how
     many, their colour, and how they move. */
  const AIR = {
    thornhollow: { mist: [[0.55, 0.75, 0.62], 0.10], motes: { kind: 'firefly', n: 46, c: [0.85, 1.0, 0.45] } },
    dustreach: { mist: [[0.85, 0.70, 0.55], 0.08], motes: { kind: 'dust', n: 70, c: [1.0, 0.86, 0.62] } },
    mourneholt: { mist: [[0.55, 0.62, 0.85], 0.14], motes: { kind: 'wisp', n: 26, c: [0.62, 0.78, 1.0] } },
    ochre: { mist: [[0.9, 0.68, 0.48], 0.07], motes: { kind: 'dust', n: 80, c: [1.0, 0.78, 0.5] } },
    palewastes: { mist: [[0.75, 0.85, 1.0], 0.12], motes: { kind: 'snow', n: 110, c: [0.92, 0.96, 1.0] } },
    highmoor: { mist: [[0.62, 0.70, 0.82], 0.13], motes: { kind: 'rain', n: 90, c: [0.72, 0.82, 1.0] } },
  };

  // A hash to a 0..1 value: the same index is always the same mote.
  function h(i, k) {
    let x = (i * 374761393 + k * 668265263) | 0;
    x = (x ^ (x >>> 13)) * 1274126177 | 0;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }
  const wrap = (v, m) => ((v % m) + m) % m;

  /* A bank of fog: a soft irregular cloud, painted once per colour. */
  const banks = new Map();
  function bank(c) {
    const k = WS.hex(c);
    let cv = banks.get(k);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = 512; cv.height = 256;
    const g = cv.getContext('2d');
    const rgb = `${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0}`;
    for (let i = 0; i < 26; i++) {
      const x = 80 + h(i, 1) * 352, y = 70 + h(i, 2) * 116, r = 40 + h(i, 3) * 70;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(${rgb},0.16)`);
      grd.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    banks.set(k, cv);
    return cv;
  }

  function airOf() {
    const run = WS.Game.run;
    if (!run || !WS.Game.player || (WS.Arena && WS.Arena.active)) return null;
    return AIR[run.mapId] || null;
  }

  /** Low mist, before the light. ctx in world space. */
  Air.mist = function (ctx, R, time) {
    const a = airOf();
    if (!a || R.lite || WS.Save.settings.atmosphere === false) return;
    const img = bank(a.mist[0]);
    ctx.save();
    ctx.globalAlpha = a.mist[1] * 3.2;
    ctx.globalCompositeOperation = 'screen';
    // Five banks crossing the field at different heights and speeds.
    for (let i = 0; i < 5; i++) {
      const w = 700 + h(i, 5) * 500, hh = w * 0.42;
      const sp = 6 + h(i, 6) * 10;
      const x = wrap(h(i, 7) * (W + w) + time * sp, W + w) - w;
      const y = h(i, 8) * (H - hh * 0.4) - hh * 0.3 + Math.sin(time * 0.05 + i) * 20;
      ctx.drawImage(img, x, y, w, hh);
    }
    ctx.restore();
  };

  /** What the air carries, after the light. ctx in world space. */
  Air.motes = function (ctx, R, time) {
    const a = airOf();
    if (!a || WS.Save.settings.atmosphere === false) return;
    const m = a.motes;
    const n = R.lite ? m.n >> 1 : m.n;
    const col = WS.hex(m.c);
    ctx.save();
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    if (m.kind === 'firefly' || m.kind === 'wisp') ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const r0 = h(i, 11), r1 = h(i, 12), r2 = h(i, 13), r3 = h(i, 14);
      let x, y, alpha, size;
      if (m.kind === 'firefly') {
        // Wander on slow loops; blink on their own clocks.
        x = r0 * W + Math.sin(time * (0.2 + r2 * 0.3) + r3 * 9) * 60;
        y = r1 * H + Math.cos(time * (0.17 + r3 * 0.3) + r2 * 7) * 45;
        const blink = Math.sin(time * (1.2 + r2 * 1.6) + r3 * 20);
        alpha = blink > 0.2 ? (blink - 0.2) / 0.8 : 0;
        /* Specks, not orbs: anything round and green on this field is a
           pickup, so a firefly stays a point of light with a faint halo. */
        size = 0.9 + r2 * 0.7;
        if (alpha > 0.02) {
          ctx.globalAlpha = alpha * 0.16;
          ctx.beginPath(); ctx.arc(x, y, size * 3, 0, WS.TAU); ctx.fill();
          ctx.globalAlpha = alpha * 0.9;
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
        }
      } else if (m.kind === 'wisp') {
        // Drift up out of the ground and fade.
        const life = 9 + r2 * 6;
        const t = wrap(time + r3 * life, life) / life;
        x = r0 * W + Math.sin(time * 0.6 + r1 * 8) * 18;
        y = r1 * H - t * 90;
        alpha = Math.sin(t * Math.PI) * 0.6;
        // A spark with a thin trail, never a disc: round and pale is a pickup.
        size = 1 + r2 * 0.8;
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillRect(x - size * 0.3, y, size * 0.6, 7 + r2 * 6);
        ctx.globalAlpha = alpha * 0.15;
        ctx.beginPath(); ctx.arc(x, y, size * 2.6, 0, WS.TAU); ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      } else if (m.kind === 'dust') {
        x = wrap(r0 * W + time * (14 + r2 * 22), W);
        y = wrap(r1 * H + Math.sin(time * 0.4 + r3 * 9) * 14 + time * (2 + r3 * 4), H);
        alpha = 0.18 + r3 * 0.3;
        size = 0.8 + r2 * 1.4;
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y, size, size);
      } else if (m.kind === 'snow') {
        x = wrap(r0 * W + Math.sin(time * (0.5 + r2) + r3 * 9) * 22 + time * 8, W);
        y = wrap(r1 * H + time * (18 + r2 * 26), H);
        alpha = 0.35 + r3 * 0.45;
        size = 1 + r2 * 1.8;
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(x, y, size, 0, WS.TAU); ctx.fill();
      } else if (m.kind === 'rain') {
        const vx = 90, vy = 520 + r2 * 160;
        x = wrap(r0 * W + time * vx, W);
        y = wrap(r1 * H + time * vy, H);
        ctx.globalAlpha = 0.14 + r3 * 0.16;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 0.03, y - vy * 0.03); ctx.stroke();
      }
    }
    ctx.restore();
  };
})(window.WS);
