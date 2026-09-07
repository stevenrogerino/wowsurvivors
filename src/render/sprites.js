/* Procedural art. Every creature, prop, gem and UI glyph is drawn once into an
 * offscreen canvas at boot and cached by (kind, tint, size), so the game ships
 * with no image files and still gets per-enemy silhouettes.
 *
 * House style: a three-quarter-from-above view. Bodies are built from stacked
 * ellipses lit from the upper left, outlined in a darkened shade of their own
 * tint (never black), with one hot rim highlight - the Arclite arc - on the
 * upper-left edge, and glowing eyes as the read-at-a-glance focal point. */
'use strict';
(function (WS) {

  const cache = new Map();
  const SS = 2;   // supersample factor: rasterise at 2x, draw down

  function make(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /** Five-stop palette derived from a single tint, so every creature is lit
   *  consistently no matter what colour it was given. */
  function palette(tint) {
    return {
      hi: WS.hex(WS.mix(tint, [1, 1, 1], 0.30)),
      mid: WS.hex(WS.shade(tint, 0.82)),
      lo: WS.hex(WS.shade(tint, 0.42)),
      dark: WS.hex(WS.shade(tint, 0.22)),
      line: WS.hex(WS.shade(tint, 0.10)),
      glow: WS.hex(WS.mix(tint, [1, 1, 1], 0.7)),
    };
  }

  /* ------------------------------------------------------------- helpers - */
  function ellipse(g, x, y, rx, ry, fill, rot) {
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, WS.TAU);
    g.fillStyle = fill;
    g.fill();
    g.restore();
  }

  function shaded(g, x, y, rx, ry, p, rot) {
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    const grd = g.createRadialGradient(-rx * 0.35, -ry * 0.45, rx * 0.1, 0, 0, rx * 1.25);
    grd.addColorStop(0, p.hi);
    grd.addColorStop(0.45, p.mid);
    grd.addColorStop(1, p.lo);
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, WS.TAU);
    g.fillStyle = grd;
    g.fill();
    g.lineWidth = WS.max(1.6, rx * 0.16);
    g.strokeStyle = p.line;
    g.stroke();
    g.restore();
  }

  function poly(g, pts, fill, stroke, lw) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
  }

  function eyes(g, x, y, spread, r, colour) {
    g.save();
    g.shadowColor = colour; g.shadowBlur = r * 4;
    g.fillStyle = colour;
    g.beginPath(); g.arc(x - spread, y, r, 0, WS.TAU); g.fill();
    g.beginPath(); g.arc(x + spread, y, r, 0, WS.TAU); g.fill();
    g.restore();
  }

  /** The Arclite rim: a bright crescent along the upper-left of a body mass. */
  function rimLight(g, x, y, r, colour, alpha) {
    g.save();
    g.globalAlpha = alpha === undefined ? 0.5 : alpha;
    g.strokeStyle = colour;
    g.lineWidth = WS.max(1, r * 0.13);
    g.beginPath();
    g.arc(x, y, r * 0.92, WS.PI * 0.85, WS.PI * 1.75);
    g.stroke();
    g.restore();
  }

  function blade(g, x, y, len, wide, rot, edge, spine) {
    g.save();
    g.translate(x, y); g.rotate(rot);
    poly(g, [[0, 0], [wide, -len * 0.35], [0, -len], [-wide, -len * 0.35]], edge, spine, 1);
    g.restore();
  }

  /* ------------------------------------------------------- archetypes ---- */
  // Each draws into a size x size canvas centred on (size/2, size*0.55), with
  // the creature's "footprint" about 0.7 of the canvas so glows have room.
  const CREATURES = {

    /* --- humanoid frames -------------------------------------------------- */
    kobold(g, s, p) {
      const cx = s / 2, cy = s * 0.60, u = s / 100;
      shaded(g, cx, cy, 20 * u, 22 * u, p);                       // hunched body
      poly(g, [[cx - 4 * u, cy - 20 * u], [cx, cy - 46 * u], [cx + 4 * u, cy - 20 * u]], p.glow, p.line, u); // candle
      g.save(); g.shadowColor = '#ffcf6b'; g.shadowBlur = 10 * u;
      g.fillStyle = '#ffe6a8';
      g.beginPath(); g.ellipse(cx, cy - 48 * u, 2.4 * u, 4 * u, 0, 0, WS.TAU); g.fill();
      g.restore();
      shaded(g, cx, cy - 14 * u, 12 * u, 11 * u, p);              // head
      poly(g, [[cx - 11 * u, cy - 18 * u], [cx - 16 * u, cy - 30 * u], [cx - 6 * u, cy - 22 * u]], p.lo, p.line, u);
      poly(g, [[cx + 11 * u, cy - 18 * u], [cx + 16 * u, cy - 30 * u], [cx + 6 * u, cy - 22 * u]], p.lo, p.line, u);
      eyes(g, cx, cy - 14 * u, 4.5 * u, 1.7 * u, '#ffd36b');
      rimLight(g, cx, cy, 22 * u, p.hi);
    },

    gnoll(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      shaded(g, cx, cy + 4 * u, 24 * u, 25 * u, p);
      shaded(g, cx - 22 * u, cy - 2 * u, 7 * u, 12 * u, p, -0.4); // arms
      shaded(g, cx + 22 * u, cy - 2 * u, 7 * u, 12 * u, p, 0.4);
      shaded(g, cx, cy - 20 * u, 13 * u, 12 * u, p);              // head
      poly(g, [[cx - 6 * u, cy - 22 * u], [cx - 14 * u, cy - 38 * u], [cx - 2 * u, cy - 28 * u]], p.mid, p.line, u);
      poly(g, [[cx + 6 * u, cy - 22 * u], [cx + 14 * u, cy - 38 * u], [cx + 2 * u, cy - 28 * u]], p.mid, p.line, u);
      poly(g, [[cx - 5 * u, cy - 14 * u], [cx + 5 * u, cy - 14 * u], [cx, cy - 6 * u]], p.hi); // snout
      eyes(g, cx, cy - 22 * u, 5 * u, 1.9 * u, '#ffb347');
      blade(g, cx + 26 * u, cy + 2 * u, 30 * u, 5 * u, 0.5, '#c8ccd8', '#6a7080');
      rimLight(g, cx, cy, 26 * u, p.hi);
    },

    bandit(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      shaded(g, cx, cy + 4 * u, 18 * u, 24 * u, p);
      ellipse(g, cx, cy + 12 * u, 19 * u, 12 * u, p.dark);        // coat skirt
      shaded(g, cx, cy - 20 * u, 11 * u, 11 * u, { hi: '#d6c2a8', mid: '#b89b7c', lo: '#7a6350', line: '#4a3b2f', glow: '#fff' });
      g.fillStyle = p.mid;                                        // red bandana
      g.beginPath(); g.ellipse(cx, cy - 18 * u, 11.5 * u, 5 * u, 0, WS.PI, WS.TAU); g.fill();
      g.fillStyle = p.lo;
      g.fillRect(cx - 12 * u, cy - 20 * u, 24 * u, 4 * u);
      eyes(g, cx, cy - 22 * u, 4 * u, 1.5 * u, '#fff0d0');
      blade(g, cx + 20 * u, cy + 4 * u, 26 * u, 4 * u, 0.7, '#d7dbe6', '#767c8c');
      rimLight(g, cx, cy, 22 * u, p.hi);
    },

    brute(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      shaded(g, cx, cy + 6 * u, 26 * u, 26 * u, p);
      shaded(g, cx - 26 * u, cy + 2 * u, 10 * u, 14 * u, p, -0.3);
      shaded(g, cx + 26 * u, cy + 2 * u, 10 * u, 14 * u, p, 0.3);
      ellipse(g, cx - 30 * u, cy + 12 * u, 8 * u, 8 * u, '#8a8f9c');  // knuckles
      ellipse(g, cx + 30 * u, cy + 12 * u, 8 * u, 8 * u, '#8a8f9c');
      shaded(g, cx, cy - 20 * u, 12 * u, 11 * u, p);
      g.fillStyle = p.lo; g.fillRect(cx - 13 * u, cy - 22 * u, 26 * u, 5 * u);
      eyes(g, cx, cy - 21 * u, 4.5 * u, 1.7 * u, '#ff8f6b');
      rimLight(g, cx, cy, 28 * u, p.hi);
    },

    murloc(g, s, p) {
      const cx = s / 2, cy = s * 0.60, u = s / 100;
      shaded(g, cx, cy + 2 * u, 17 * u, 20 * u, p);
      poly(g, [[cx - 20 * u, cy - 12 * u], [cx - 34 * u, cy - 26 * u], [cx - 16 * u, cy + 2 * u]], p.lo, p.line, u); // fins
      poly(g, [[cx + 20 * u, cy - 12 * u], [cx + 34 * u, cy - 26 * u], [cx + 16 * u, cy + 2 * u]], p.lo, p.line, u);
      shaded(g, cx, cy - 18 * u, 15 * u, 13 * u, p);
      g.fillStyle = p.dark;                                        // wide gormless mouth
      g.beginPath(); g.ellipse(cx, cy - 12 * u, 9 * u, 4 * u, 0, 0, WS.PI); g.fill();
      eyes(g, cx, cy - 22 * u, 7 * u, 3 * u, '#e8ffd8');
      rimLight(g, cx, cy, 20 * u, p.hi);
    },

    necromancer(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      poly(g, [[cx - 22 * u, cy + 26 * u], [cx - 12 * u, cy - 22 * u], [cx + 12 * u, cy - 22 * u], [cx + 22 * u, cy + 26 * u]], p.mid, p.line, u);
      poly(g, [[cx - 12 * u, cy - 18 * u], [cx, cy - 40 * u], [cx + 12 * u, cy - 18 * u]], p.lo, p.line, u); // hood
      g.fillStyle = '#0a0a12';
      g.beginPath(); g.ellipse(cx, cy - 22 * u, 8 * u, 9 * u, 0, 0, WS.TAU); g.fill();
      eyes(g, cx, cy - 22 * u, 4 * u, 2 * u, '#c77dff');
      g.save(); g.shadowColor = '#a45bff'; g.shadowBlur = 14 * u;   // channelled orb
      g.fillStyle = '#c9a4ff';
      g.beginPath(); g.arc(cx + 24 * u, cy - 4 * u, 5 * u, 0, WS.TAU); g.fill();
      g.restore();
    },

    lich(g, s, p) {
      CREATURES.necromancer(g, s, p);
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      poly(g, [[cx - 14 * u, cy - 34 * u], [cx - 10 * u, cy - 50 * u], [cx - 4 * u, cy - 36 * u],
      [cx, cy - 54 * u], [cx + 4 * u, cy - 36 * u], [cx + 10 * u, cy - 50 * u],
      [cx + 14 * u, cy - 34 * u]], '#9fd8ff', '#5aa0d0', u);       // ice crown
    },

    warlock(g, s, p) { CREATURES.necromancer(g, s, p); },

    /* --- undead ----------------------------------------------------------- */
    skeleton(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      g.strokeStyle = p.mid; g.lineWidth = 4 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy - 8 * u); g.lineTo(cx, cy + 18 * u); g.stroke();
      for (let i = 0; i < 4; i++) {                                // ribs
        const ry = cy - 4 * u + i * 6 * u;
        g.beginPath(); g.ellipse(cx, ry, 12 * u - i * 1.2 * u, 3 * u, 0, WS.PI * 0.05, WS.PI * 0.95); g.stroke();
      }
      g.beginPath(); g.moveTo(cx - 14 * u, cy - 4 * u); g.lineTo(cx - 22 * u, cy + 14 * u); g.stroke();
      g.beginPath(); g.moveTo(cx + 14 * u, cy - 4 * u); g.lineTo(cx + 22 * u, cy + 14 * u); g.stroke();
      shaded(g, cx, cy - 20 * u, 11 * u, 11 * u, p);               // skull
      g.fillStyle = '#101018';
      g.beginPath(); g.ellipse(cx - 4 * u, cy - 21 * u, 3 * u, 3.6 * u, 0, 0, WS.TAU); g.fill();
      g.beginPath(); g.ellipse(cx + 4 * u, cy - 21 * u, 3 * u, 3.6 * u, 0, 0, WS.TAU); g.fill();
      eyes(g, cx, cy - 21 * u, 4 * u, 1.5 * u, '#8fe6ff');
      g.fillStyle = p.lo; g.fillRect(cx - 5 * u, cy - 13 * u, 10 * u, 3 * u);
      blade(g, cx + 24 * u, cy + 6 * u, 30 * u, 5 * u, 0.6, '#b9c0cc', '#5c6270');
    },

    ghoul(g, s, p) {
      const cx = s / 2, cy = s * 0.60, u = s / 100;
      shaded(g, cx + 3 * u, cy + 4 * u, 21 * u, 22 * u, p, 0.18);  // lopsided
      shaded(g, cx - 24 * u, cy + 6 * u, 8 * u, 15 * u, p, -0.6);  // dragging arm
      poly(g, [[cx - 32 * u, cy + 16 * u], [cx - 26 * u, cy + 26 * u], [cx - 22 * u, cy + 14 * u]], p.hi, p.line, u);
      shaded(g, cx - 2 * u, cy - 18 * u, 12 * u, 11 * u, p, -0.25);
      g.fillStyle = '#2a1414';                                     // hanging jaw
      g.beginPath(); g.ellipse(cx - 2 * u, cy - 10 * u, 6 * u, 5 * u, 0, 0, WS.TAU); g.fill();
      eyes(g, cx - 2 * u, cy - 21 * u, 4 * u, 1.8 * u, '#d9ff7a');
      rimLight(g, cx, cy, 24 * u, p.hi);
    },

    geist(g, s, p) {
      const cx = s / 2, cy = s * 0.62, u = s / 100;
      shaded(g, cx, cy, 15 * u, 14 * u, p);
      g.strokeStyle = p.lo; g.lineWidth = 3.5 * u; g.lineCap = 'round';
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + dir * 10 * u, cy - 2 * u);
        g.quadraticCurveTo(cx + dir * 30 * u, cy - 16 * u, cx + dir * 24 * u, cy + 16 * u);
        g.stroke();
      }
      shaded(g, cx, cy - 16 * u, 11 * u, 10 * u, p);
      g.fillStyle = '#141a20';                                     // stitched mask
      g.fillRect(cx - 11 * u, cy - 19 * u, 22 * u, 6 * u);
      eyes(g, cx, cy - 16 * u, 4.5 * u, 1.8 * u, '#9ff5ff');
    },

    abomination(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      shaded(g, cx, cy + 6 * u, 30 * u, 28 * u, p);
      g.strokeStyle = p.dark; g.lineWidth = 2 * u;                 // stitches
      for (let i = -2; i <= 2; i++) {
        g.beginPath(); g.moveTo(cx + i * 9 * u, cy - 14 * u); g.lineTo(cx + i * 9 * u, cy + 26 * u); g.stroke();
      }
      shaded(g, cx - 30 * u, cy - 2 * u, 11 * u, 17 * u, p, -0.35);
      shaded(g, cx + 30 * u, cy - 2 * u, 11 * u, 17 * u, p, 0.35);
      blade(g, cx + 38 * u, cy + 6 * u, 34 * u, 8 * u, 0.75, '#aeb6c4', '#5a6070');
      shaded(g, cx - 4 * u, cy - 24 * u, 13 * u, 11 * u, p, -0.2); // sagging head
      eyes(g, cx - 4 * u, cy - 25 * u, 5 * u, 2 * u, '#bfff6b');
      rimLight(g, cx, cy, 32 * u, p.hi);
    },

    wraith(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      g.save();
      const grd = g.createLinearGradient(0, cy - 34 * u, 0, cy + 30 * u);
      grd.addColorStop(0, p.hi); grd.addColorStop(0.6, p.mid); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(cx - 20 * u, cy + 30 * u);
      g.quadraticCurveTo(cx - 24 * u, cy - 22 * u, cx, cy - 36 * u);
      g.quadraticCurveTo(cx + 24 * u, cy - 22 * u, cx + 20 * u, cy + 30 * u);
      g.quadraticCurveTo(cx, cy + 18 * u, cx - 20 * u, cy + 30 * u);
      g.fill();
      g.restore();
      g.fillStyle = 'rgba(6,8,14,.85)';
      g.beginPath(); g.ellipse(cx, cy - 20 * u, 9 * u, 11 * u, 0, 0, WS.TAU); g.fill();
      eyes(g, cx, cy - 21 * u, 4 * u, 2.2 * u, '#cfe6ff');
    },

    reaper(g, s, p) {
      const cx = s / 2, cy = s * 0.56, u = s / 100;
      CREATURES.wraith(g, s, p);
      g.save();                                                    // the scythe
      g.strokeStyle = '#d8e4f2'; g.lineWidth = 3.5 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx + 26 * u, cy + 34 * u); g.lineTo(cx + 34 * u, cy - 40 * u); g.stroke();
      g.beginPath();
      g.moveTo(cx + 34 * u, cy - 40 * u);
      g.quadraticCurveTo(cx - 4 * u, cy - 52 * u, cx - 12 * u, cy - 24 * u);
      g.lineWidth = 5 * u; g.strokeStyle = '#eef6ff'; g.stroke();
      g.restore();
      g.save(); g.globalAlpha = 0.5; g.strokeStyle = '#9fd8ff'; g.lineWidth = 2 * u;
      g.beginPath(); g.arc(cx, cy, 44 * u, 0, WS.TAU); g.stroke();
      g.restore();
    },

    sovereign(g, s, p) {
      const cx = s / 2, cy = s * 0.55, u = s / 100;
      g.save();                                                    // eclipse disc
      const grd = g.createRadialGradient(cx, cy, 6 * u, cx, cy, 46 * u);
      grd.addColorStop(0, '#1a1030'); grd.addColorStop(0.7, '#2a1a4a'); grd.addColorStop(1, '#0d0820');
      g.fillStyle = grd;
      g.beginPath(); g.arc(cx, cy, 44 * u, 0, WS.TAU); g.fill();
      g.shadowColor = '#ffe6ae'; g.shadowBlur = 26 * u;
      g.strokeStyle = '#ffe6ae'; g.lineWidth = 3 * u;
      g.beginPath(); g.arc(cx, cy, 44 * u, 0, WS.TAU); g.stroke();
      g.restore();
      for (let i = 0; i < 8; i++) {                                // corona spears
        const a = (i / 8) * WS.TAU + 0.2;
        blade(g, cx + WS.cos(a) * 44 * u, cy + WS.sin(a) * 44 * u, 22 * u, 4 * u, a + WS.PI / 2, '#ffd98f', '#a97c2f');
      }
      g.fillStyle = '#0a0714';
      g.beginPath(); g.ellipse(cx, cy - 4 * u, 13 * u, 16 * u, 0, 0, WS.TAU); g.fill();
      eyes(g, cx, cy - 6 * u, 5 * u, 2.6 * u, '#fff3d0');
    },

    /* --- beasts ----------------------------------------------------------- */
    wolf(g, s, p) {
      const cx = s / 2, cy = s * 0.60, u = s / 100;
      shaded(g, cx - 2 * u, cy + 2 * u, 26 * u, 15 * u, p);        // long body
      poly(g, [[cx + 22 * u, cy - 2 * u], [cx + 40 * u, cy - 14 * u], [cx + 26 * u, cy + 6 * u]], p.lo, p.line, u); // tail
      shaded(g, cx - 22 * u, cy - 6 * u, 13 * u, 11 * u, p);       // head
      poly(g, [[cx - 34 * u, cy - 6 * u], [cx - 44 * u, cy - 2 * u], [cx - 32 * u, cy + 2 * u]], p.hi, p.line, u);  // muzzle
      poly(g, [[cx - 28 * u, cy - 14 * u], [cx - 30 * u, cy - 26 * u], [cx - 20 * u, cy - 16 * u]], p.lo, p.line, u);
      poly(g, [[cx - 16 * u, cy - 14 * u], [cx - 14 * u, cy - 26 * u], [cx - 8 * u, cy - 15 * u]], p.lo, p.line, u);
      eyes(g, cx - 26 * u, cy - 8 * u, 4 * u, 1.6 * u, '#ffe08a');
      g.strokeStyle = p.dark; g.lineWidth = 3 * u; g.lineCap = 'round';
      for (const dx of [-10, 4, 14]) {
        g.beginPath(); g.moveTo(cx + dx * u, cy + 10 * u); g.lineTo(cx + dx * u, cy + 20 * u); g.stroke();
      }
      rimLight(g, cx - 2 * u, cy, 24 * u, p.hi, 0.35);
    },

    cat(g, s, p) {
      const cx = s / 2, cy = s * 0.60, u = s / 100;
      shaded(g, cx - 2 * u, cy + 2 * u, 25 * u, 14 * u, p);        // low, long body
      g.strokeStyle = p.dark; g.lineWidth = 2.6 * u; g.lineCap = 'round';
      for (let i = -1; i <= 2; i++) {                              // stripes
        g.beginPath();
        g.moveTo(cx + i * 9 * u, cy - 9 * u);
        g.lineTo(cx + i * 9 * u + 4 * u, cy + 9 * u);
        g.stroke();
      }
      g.lineWidth = 4 * u;                                         // curled tail
      g.strokeStyle = p.lo;
      g.beginPath();
      g.moveTo(cx + 22 * u, cy);
      g.quadraticCurveTo(cx + 42 * u, cy - 6 * u, cx + 36 * u, cy - 24 * u);
      g.stroke();
      shaded(g, cx - 22 * u, cy - 6 * u, 12 * u, 11 * u, p);       // round head
      poly(g, [[cx - 30 * u, cy - 14 * u], [cx - 31 * u, cy - 24 * u], [cx - 22 * u, cy - 15 * u]], p.lo, p.line, u);
      poly(g, [[cx - 18 * u, cy - 15 * u], [cx - 15 * u, cy - 25 * u], [cx - 10 * u, cy - 14 * u]], p.lo, p.line, u);
      eyes(g, cx - 24 * u, cy - 7 * u, 4.5 * u, 1.8 * u, '#c9f26b');
      g.strokeStyle = p.dark; g.lineWidth = 3 * u;
      for (const dx of [-14, 0, 12]) {
        g.beginPath(); g.moveTo(cx + dx * u, cy + 9 * u); g.lineTo(cx + dx * u, cy + 19 * u); g.stroke();
      }
      rimLight(g, cx - 2 * u, cy, 24 * u, p.hi, 0.35);
    },

    boar(g, s, p) {
      const cx = s / 2, cy = s * 0.60, u = s / 100;
      shaded(g, cx, cy + 2 * u, 24 * u, 18 * u, p);
      g.strokeStyle = p.dark; g.lineWidth = 2.5 * u;               // bristles
      for (let i = -3; i <= 3; i++) {
        g.beginPath(); g.moveTo(cx + i * 6 * u, cy - 14 * u); g.lineTo(cx + i * 6 * u, cy - 24 * u); g.stroke();
      }
      shaded(g, cx - 22 * u, cy + 2 * u, 12 * u, 11 * u, p);
      poly(g, [[cx - 32 * u, cy + 4 * u], [cx - 42 * u, cy + 6 * u], [cx - 32 * u, cy + 10 * u]], p.hi, p.line, u);
      g.strokeStyle = '#efe3cc'; g.lineWidth = 3 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - 32 * u, cy + 6 * u); g.quadraticCurveTo(cx - 40 * u, cy - 2 * u, cx - 34 * u, cy - 8 * u); g.stroke();
      eyes(g, cx - 24 * u, cy - 2 * u, 4 * u, 1.4 * u, '#ff9d6b');
      rimLight(g, cx, cy, 24 * u, p.hi, 0.35);
    },

    quilboar(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      shaded(g, cx, cy + 4 * u, 22 * u, 24 * u, p);
      g.strokeStyle = p.hi; g.lineWidth = 3.4 * u; g.lineCap = 'round';
      for (let i = 0; i < 7; i++) {                                // quills
        const a = WS.PI * (0.15 + i * 0.1);
        g.beginPath();
        g.moveTo(cx - WS.cos(a) * 20 * u, cy - WS.sin(a) * 20 * u);
        g.lineTo(cx - WS.cos(a) * 36 * u, cy - WS.sin(a) * 36 * u);
        g.stroke();
      }
      shaded(g, cx, cy - 20 * u, 13 * u, 11 * u, p);
      poly(g, [[cx - 6 * u, cy - 14 * u], [cx + 6 * u, cy - 14 * u], [cx, cy - 6 * u]], p.hi);
      eyes(g, cx, cy - 22 * u, 5 * u, 1.8 * u, '#ffcf6b');
      blade(g, cx + 24 * u, cy + 4 * u, 28 * u, 6 * u, 0.55, '#cdd3de', '#6b7280');
    },

    raptor(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      shaded(g, cx + 2 * u, cy, 20 * u, 14 * u, p, -0.15);
      g.strokeStyle = p.lo; g.lineWidth = 5 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx + 16 * u, cy - 2 * u); g.quadraticCurveTo(cx + 40 * u, cy - 8 * u, cx + 44 * u, cy - 24 * u); g.stroke();
      g.strokeStyle = p.dark; g.lineWidth = 4 * u;                 // raised legs
      g.beginPath(); g.moveTo(cx, cy + 8 * u); g.lineTo(cx - 6 * u, cy + 22 * u); g.lineTo(cx + 4 * u, cy + 26 * u); g.stroke();
      shaded(g, cx - 20 * u, cy - 14 * u, 12 * u, 9 * u, p, -0.3);
      poly(g, [[cx - 30 * u, cy - 14 * u], [cx - 42 * u, cy - 10 * u], [cx - 28 * u, cy - 6 * u]], p.hi, p.line, u);
      poly(g, [[cx - 20 * u, cy - 22 * u], [cx - 12 * u, cy - 34 * u], [cx - 10 * u, cy - 20 * u]], p.lo, p.line, u); // crest
      eyes(g, cx - 23 * u, cy - 16 * u, 3.5 * u, 1.6 * u, '#ffe066');
    },

    strider(g, s, p) {
      const cx = s / 2, cy = s * 0.55, u = s / 100;
      g.strokeStyle = p.dark; g.lineWidth = 4 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - 6 * u, cy + 10 * u); g.lineTo(cx - 10 * u, cy + 32 * u); g.stroke();
      g.beginPath(); g.moveTo(cx + 6 * u, cy + 10 * u); g.lineTo(cx + 12 * u, cy + 32 * u); g.stroke();
      shaded(g, cx, cy, 20 * u, 17 * u, p);
      g.strokeStyle = p.lo; g.lineWidth = 5 * u;                   // long neck
      g.beginPath(); g.moveTo(cx - 8 * u, cy - 10 * u); g.quadraticCurveTo(cx - 22 * u, cy - 30 * u, cx - 14 * u, cy - 40 * u); g.stroke();
      shaded(g, cx - 14 * u, cy - 42 * u, 9 * u, 8 * u, p);
      poly(g, [[cx - 22 * u, cy - 42 * u], [cx - 34 * u, cy - 40 * u], [cx - 22 * u, cy - 36 * u]], p.hi, p.line, u);
      eyes(g, cx - 14 * u, cy - 44 * u, 3.5 * u, 1.5 * u, '#ffe9a8');
    },

    vulture(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      for (const dir of [-1, 1]) {                                 // layered wings
        poly(g, [[cx + dir * 5 * u, cy - 8 * u], [cx + dir * 46 * u, cy - 26 * u],
        [cx + dir * 40 * u, cy - 2 * u], [cx + dir * 14 * u, cy + 8 * u]], p.lo, p.line, u);
        poly(g, [[cx + dir * 8 * u, cy - 4 * u], [cx + dir * 38 * u, cy - 10 * u],
        [cx + dir * 20 * u, cy + 10 * u]], p.dark, p.line, u * 0.8);
      }
      shaded(g, cx, cy + 2 * u, 14 * u, 16 * u, p);
      shaded(g, cx, cy - 16 * u, 8 * u, 8 * u, p);
      poly(g, [[cx - 6 * u, cy - 16 * u], [cx - 20 * u, cy - 12 * u], [cx - 6 * u, cy - 10 * u]], '#e8b455', '#8a6420', u);
      eyes(g, cx + 1 * u, cy - 18 * u, 3 * u, 1.4 * u, '#ffd166');
    },

    spider(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      g.strokeStyle = p.lo; g.lineWidth = 3 * u; g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        for (const dir of [-1, 1]) {
          const a = -0.55 + i * 0.38;
          g.beginPath();
          g.moveTo(cx + dir * 6 * u, cy);
          g.quadraticCurveTo(cx + dir * (26 + i * 3) * u, cy + WS.sin(a) * 26 * u - 12 * u,
            cx + dir * (34 - i * 2) * u, cy + WS.sin(a) * 34 * u + 8 * u);
          g.stroke();
        }
      }
      shaded(g, cx + 4 * u, cy + 4 * u, 18 * u, 16 * u, p);        // abdomen
      shaded(g, cx - 14 * u, cy - 4 * u, 11 * u, 10 * u, p);       // cephalothorax
      g.save(); g.shadowColor = '#ff6b6b'; g.shadowBlur = 8 * u; g.fillStyle = '#ff8a8a';
      for (const [ox, oy] of [[-4, -3], [0, -5], [-6, 1], [1, 0]]) {
        g.beginPath(); g.arc(cx - 16 * u + ox * u, cy - 5 * u + oy * u, 1.5 * u, 0, WS.TAU); g.fill();
      }
      g.restore();
    },

    worgen(g, s, p) {
      const cx = s / 2, cy = s * 0.56, u = s / 100;
      shaded(g, cx, cy + 6 * u, 22 * u, 26 * u, p);
      shaded(g, cx - 24 * u, cy + 4 * u, 9 * u, 16 * u, p, -0.5);
      shaded(g, cx + 24 * u, cy + 4 * u, 9 * u, 16 * u, p, 0.5);
      for (const dir of [-1, 1]) {
        poly(g, [[cx + dir * 30 * u, cy + 16 * u], [cx + dir * 40 * u, cy + 24 * u], [cx + dir * 28 * u, cy + 24 * u]], '#e9edf5', '#8a90a0', u);
      }
      shaded(g, cx, cy - 22 * u, 13 * u, 12 * u, p);
      poly(g, [[cx - 8 * u, cy - 24 * u], [cx - 16 * u, cy - 42 * u], [cx - 2 * u, cy - 30 * u]], p.lo, p.line, u);
      poly(g, [[cx + 8 * u, cy - 24 * u], [cx + 16 * u, cy - 42 * u], [cx + 2 * u, cy - 30 * u]], p.lo, p.line, u);
      poly(g, [[cx - 7 * u, cy - 16 * u], [cx + 7 * u, cy - 16 * u], [cx, cy - 6 * u]], p.hi);
      g.fillStyle = '#fff'; // bared teeth
      for (let i = -2; i <= 2; i++) poly(g, [[cx + i * 3 * u, cy - 12 * u], [cx + i * 3 * u + 1.4 * u, cy - 8 * u], [cx + i * 3 * u + 2.8 * u, cy - 12 * u]], '#fff');
      eyes(g, cx, cy - 26 * u, 5 * u, 2 * u, '#ffe14d');
      rimLight(g, cx, cy, 26 * u, p.hi);
    },

    harpy(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      for (const dir of [-1, 1]) {                                 // feathered wings
        for (let i = 0; i < 4; i++) {
          poly(g, [
            [cx + dir * 8 * u, cy - 8 * u],
            [cx + dir * (24 + i * 8) * u, cy - (26 - i * 5) * u],
            [cx + dir * (18 + i * 7) * u, cy - (10 - i * 4) * u],
          ], i % 2 ? p.mid : p.lo, p.line, u * 0.8);
        }
      }
      shaded(g, cx, cy + 4 * u, 13 * u, 18 * u, p);
      shaded(g, cx, cy - 16 * u, 10 * u, 9 * u, p);
      poly(g, [[cx - 4 * u, cy - 16 * u], [cx - 16 * u, cy - 12 * u], [cx - 4 * u, cy - 10 * u]], '#f0c469', '#8a6420', u);
      eyes(g, cx + 1 * u, cy - 18 * u, 3.5 * u, 1.5 * u, '#d9f4ff');
      g.strokeStyle = '#e8c98f'; g.lineWidth = 2.5 * u;
      g.beginPath(); g.moveTo(cx - 5 * u, cy + 20 * u); g.lineTo(cx - 9 * u, cy + 30 * u); g.stroke();
      g.beginPath(); g.moveTo(cx + 5 * u, cy + 20 * u); g.lineTo(cx + 9 * u, cy + 30 * u); g.stroke();
    },

    centaur(g, s, p) {
      const cx = s / 2, cy = s * 0.60, u = s / 100;
      shaded(g, cx + 4 * u, cy + 8 * u, 26 * u, 15 * u, p);        // horse barrel
      g.strokeStyle = p.dark; g.lineWidth = 4 * u; g.lineCap = 'round';
      for (const dx of [-14, -4, 12, 22]) {
        g.beginPath(); g.moveTo(cx + dx * u, cy + 18 * u); g.lineTo(cx + dx * u + 2 * u, cy + 32 * u); g.stroke();
      }
      poly(g, [[cx + 28 * u, cy + 4 * u], [cx + 44 * u, cy - 6 * u], [cx + 30 * u, cy + 12 * u]], p.lo, p.line, u);
      shaded(g, cx - 12 * u, cy - 14 * u, 13 * u, 16 * u, p);      // humanoid torso
      shaded(g, cx - 12 * u, cy - 32 * u, 10 * u, 9 * u, p);
      eyes(g, cx - 12 * u, cy - 33 * u, 4 * u, 1.6 * u, '#ffd98f');
      g.strokeStyle = '#cfd6e2'; g.lineWidth = 3 * u;              // spear
      g.beginPath(); g.moveTo(cx - 30 * u, cy + 20 * u); g.lineTo(cx + 6 * u, cy - 44 * u); g.stroke();
      poly(g, [[cx + 6 * u, cy - 44 * u], [cx + 12 * u, cy - 34 * u], [cx, cy - 36 * u]], '#e7ecf5', '#8a90a0', u);
    },

    golem(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      g.fillStyle = p.mid; g.strokeStyle = p.line; g.lineWidth = 2 * u;
      g.fillRect(cx - 22 * u, cy - 14 * u, 44 * u, 38 * u);
      g.strokeRect(cx - 22 * u, cy - 14 * u, 44 * u, 38 * u);
      g.fillStyle = p.lo;
      g.fillRect(cx - 30 * u, cy - 8 * u, 10 * u, 26 * u);
      g.fillRect(cx + 20 * u, cy - 8 * u, 10 * u, 26 * u);
      g.fillStyle = p.hi;
      g.fillRect(cx - 14 * u, cy - 30 * u, 28 * u, 18 * u);        // head block
      g.strokeRect(cx - 14 * u, cy - 30 * u, 28 * u, 18 * u);
      g.save(); g.shadowColor = '#ff9d3c'; g.shadowBlur = 12 * u;  // furnace eye
      g.fillStyle = '#ffb45c';
      g.fillRect(cx - 8 * u, cy - 24 * u, 16 * u, 5 * u);
      g.fillRect(cx - 6 * u, cy + 2 * u, 12 * u, 12 * u);
      g.restore();
      blade(g, cx + 34 * u, cy + 6 * u, 30 * u, 9 * u, 0.9, '#b9c0cc', '#5c6270'); // scythe arm
    },
  };

  /* --------------------------------------------------------- the survivor - */
  // Player sprites share one frame and differ by robe/armour colour, silhouette
  // accessory (staff, blades, bow...) and a class glyph on the chest.
  const HEROES = {
    mage: { accessory: 'staff', cloak: true },
    priest: { accessory: 'staff', cloak: true, halo: true },
    rogue: { accessory: 'daggers', hood: true },
    hunter: { accessory: 'bow' },
    warrior: { accessory: 'axe', bulk: 1.15 },
    warlock: { accessory: 'orb', cloak: true, hood: true },
    shaman: { accessory: 'totem', cloak: true },
    paladin: { accessory: 'shield', bulk: 1.1, halo: true },
    death_knight: { accessory: 'runeblade', bulk: 1.1, cloak: true },
    demon_hunter: { accessory: 'glaives', horns: true },
  };

  function drawHero(g, s, tint, cfg, demon) {
    const cx = s / 2, cy = s * 0.56, u = s / 100;
    const p = palette(demon ? [0.45, 0.95, 0.25] : tint);
    const bulk = cfg.bulk || 1;

    if (cfg.cloak) {                                               // cloak behind
      poly(g, [[cx - 20 * u * bulk, cy + 30 * u], [cx - 13 * u, cy - 18 * u],
      [cx + 13 * u, cy - 18 * u], [cx + 20 * u * bulk, cy + 30 * u]],
        p.lo, p.line, u);
    }
    shaded(g, cx, cy + 6 * u, 15 * u * bulk, 20 * u, p);           // torso
    shaded(g, cx - 17 * u * bulk, cy + 2 * u, 6 * u, 12 * u, p, -0.35);
    shaded(g, cx + 17 * u * bulk, cy + 2 * u, 6 * u, 12 * u, p, 0.35);
    g.fillStyle = p.dark;                                          // legs
    g.fillRect(cx - 9 * u, cy + 20 * u, 7 * u, 14 * u);
    g.fillRect(cx + 2 * u, cy + 20 * u, 7 * u, 14 * u);

    const skin = { hi: '#f2d9bd', mid: '#d9b494', lo: '#a07f63', line: '#5d4738', glow: '#fff' };
    shaded(g, cx, cy - 16 * u, 10 * u, 10 * u, demon ? p : skin);
    if (cfg.hood) {
      poly(g, [[cx - 12 * u, cy - 12 * u], [cx, cy - 34 * u], [cx + 12 * u, cy - 12 * u]], p.mid, p.line, u);
      g.fillStyle = 'rgba(6,8,14,.8)';
      g.beginPath(); g.ellipse(cx, cy - 17 * u, 7 * u, 8 * u, 0, 0, WS.TAU); g.fill();
    }
    if (cfg.horns || demon) {
      poly(g, [[cx - 8 * u, cy - 22 * u], [cx - 18 * u, cy - 42 * u], [cx - 3 * u, cy - 26 * u]], p.hi, p.line, u);
      poly(g, [[cx + 8 * u, cy - 22 * u], [cx + 18 * u, cy - 42 * u], [cx + 3 * u, cy - 26 * u]], p.hi, p.line, u);
    }
    if (cfg.halo) {
      g.save(); g.globalAlpha = 0.85; g.shadowColor = '#ffe6ae'; g.shadowBlur = 12 * u;
      g.strokeStyle = '#ffe6ae'; g.lineWidth = 2 * u;
      g.beginPath(); g.ellipse(cx, cy - 32 * u, 12 * u, 4 * u, 0, 0, WS.TAU); g.stroke();
      g.restore();
    }
    eyes(g, cx, cy - 17 * u, 4 * u, 1.6 * u, demon ? '#d9ff6b' : '#8fd8ff');

    switch (cfg.accessory) {
      case 'staff':
        g.strokeStyle = '#8b6a44'; g.lineWidth = 3 * u; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx + 22 * u, cy + 28 * u); g.lineTo(cx + 26 * u, cy - 38 * u); g.stroke();
        g.save(); g.shadowColor = WS.hex(tint); g.shadowBlur = 16 * u;
        g.fillStyle = WS.hex(WS.mix(tint, [1, 1, 1], 0.5));
        g.beginPath(); g.arc(cx + 26 * u, cy - 42 * u, 6 * u, 0, WS.TAU); g.fill();
        g.restore();
        break;
      case 'daggers':
        blade(g, cx - 22 * u, cy + 10 * u, 20 * u, 4 * u, -0.5, '#e2e7f0', '#767c8c');
        blade(g, cx + 22 * u, cy + 10 * u, 20 * u, 4 * u, 0.5, '#e2e7f0', '#767c8c');
        break;
      case 'bow':
        g.strokeStyle = '#a97f4a'; g.lineWidth = 3 * u;
        g.beginPath(); g.arc(cx + 24 * u, cy, 22 * u, -1.1, 1.1); g.stroke();
        g.strokeStyle = '#e8edf6'; g.lineWidth = 1.2 * u;
        g.beginPath(); g.moveTo(cx + 34 * u, cy - 19 * u); g.lineTo(cx + 34 * u, cy + 19 * u); g.stroke();
        break;
      case 'axe':
        g.strokeStyle = '#8b6a44'; g.lineWidth = 3.5 * u;
        g.beginPath(); g.moveTo(cx + 20 * u, cy + 26 * u); g.lineTo(cx + 30 * u, cy - 26 * u); g.stroke();
        poly(g, [[cx + 30 * u, cy - 26 * u], [cx + 46 * u, cy - 18 * u], [cx + 30 * u, cy - 6 * u]], '#d4dae6', '#767c8c', u);
        poly(g, [[cx + 30 * u, cy - 26 * u], [cx + 16 * u, cy - 16 * u], [cx + 30 * u, cy - 6 * u]], '#b9c0cc', '#767c8c', u);
        break;
      case 'orb':
        g.save(); g.shadowColor = '#9d5bff'; g.shadowBlur = 18 * u;
        g.fillStyle = '#b98cff';
        g.beginPath(); g.arc(cx + 24 * u, cy - 4 * u, 7 * u, 0, WS.TAU); g.fill();
        g.restore();
        break;
      case 'totem':
        g.fillStyle = '#8b6a44'; g.fillRect(cx + 20 * u, cy - 20 * u, 9 * u, 44 * u);
        g.save(); g.shadowColor = '#4db8ff'; g.shadowBlur = 14 * u;
        g.fillStyle = '#7fd4ff'; g.fillRect(cx + 21 * u, cy - 14 * u, 7 * u, 7 * u);
        g.restore();
        break;
      case 'shield':
        poly(g, [[cx - 30 * u, cy - 14 * u], [cx - 14 * u, cy - 18 * u], [cx - 12 * u, cy + 8 * u],
        [cx - 22 * u, cy + 20 * u], [cx - 32 * u, cy + 6 * u]], '#e0d3a8', '#8a7440', u * 1.2);
        g.save(); g.shadowColor = '#ffe6ae'; g.shadowBlur = 10 * u;
        g.fillStyle = '#fff2cc';
        g.beginPath(); g.arc(cx - 22 * u, cy - 1 * u, 4 * u, 0, WS.TAU); g.fill();
        g.restore();
        break;
      case 'runeblade':
        blade(g, cx + 24 * u, cy + 26 * u, 52 * u, 6 * u, 0.32, '#cfd8e6', '#5f6878');
        g.save(); g.globalAlpha = 0.85; g.strokeStyle = '#5be0ff'; g.lineWidth = 1.6 * u;
        g.shadowColor = '#5be0ff'; g.shadowBlur = 10 * u;
        g.beginPath(); g.moveTo(cx + 26 * u, cy + 14 * u); g.lineTo(cx + 34 * u, cy - 22 * u); g.stroke();
        g.restore();
        break;
      case 'glaives':
        for (const dir of [-1, 1]) {
          g.save();
          g.translate(cx + dir * 26 * u, cy + 4 * u); g.rotate(dir * 0.5);
          g.strokeStyle = '#7dff45'; g.lineWidth = 2.4 * u;
          g.shadowColor = '#7dff45'; g.shadowBlur = 12 * u;
          g.beginPath(); g.arc(0, 0, 14 * u, -0.9, 1.4); g.stroke();
          g.beginPath(); g.arc(0, 0, 8 * u, 1.4, -0.9, true); g.stroke();
          g.restore();
        }
        break;
    }
    rimLight(g, cx, cy + 4 * u, 22 * u, p.hi, 0.4);
  }

  /* ------------------------------------------------------------- props ---- */
  const PROPS = {
    tree(g, s) {
      const u = s / 100, cx = s / 2, cy = s * 0.7;
      g.fillStyle = '#2a1f14'; g.fillRect(cx - 5 * u, cy - 6 * u, 10 * u, 30 * u);
      for (let i = 0; i < 3; i++) {
        ellipse(g, cx, cy - 18 * u - i * 14 * u, (32 - i * 7) * u, (18 - i * 3) * u,
          i === 2 ? '#2f4a26' : i === 1 ? '#26401f' : '#1e3419');
      }
    },
    deadtree(g, s) {
      const u = s / 100, cx = s / 2, cy = s * 0.8;
      g.strokeStyle = '#2c2a33'; g.lineWidth = 6 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - 44 * u); g.stroke();
      g.lineWidth = 3.5 * u;
      for (const [ax, ay] of [[-24, -30], [22, -36], [-16, -46], [18, -52]]) {
        g.beginPath(); g.moveTo(cx, cy - 26 * u); g.lineTo(cx + ax * u, cy + ay * u); g.stroke();
      }
    },
    stump(g, s) {
      const u = s / 100;
      ellipse(g, s / 2, s * 0.62, 20 * u, 12 * u, '#3b2c1c');
      ellipse(g, s / 2, s * 0.58, 15 * u, 8 * u, '#5a452c');
    },
    rock(g, s) {
      const u = s / 100;
      poly(g, [[s / 2 - 24 * u, s * 0.7], [s / 2 - 14 * u, s * 0.42], [s / 2 + 10 * u, s * 0.38],
      [s / 2 + 24 * u, s * 0.62], [s / 2 + 8 * u, s * 0.74]], '#3c4048', '#22252b', u);
    },
    flower(g, s) {
      const u = s / 100;
      g.strokeStyle = '#3f5a2c'; g.lineWidth = 2 * u;
      g.beginPath(); g.moveTo(s / 2, s * 0.72); g.lineTo(s / 2, s * 0.5); g.stroke();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * WS.TAU;
        ellipse(g, s / 2 + WS.cos(a) * 7 * u, s * 0.48 + WS.sin(a) * 7 * u, 5 * u, 5 * u, '#c98fd6');
      }
      ellipse(g, s / 2, s * 0.48, 4 * u, 4 * u, '#ffe27a');
    },
    mushroom(g, s) {
      const u = s / 100;
      g.fillStyle = '#c9c4b4'; g.fillRect(s / 2 - 4 * u, s * 0.52, 8 * u, 18 * u);
      ellipse(g, s / 2, s * 0.52, 18 * u, 11 * u, '#6b4a7a');
      ellipse(g, s / 2 - 6 * u, s * 0.5, 3 * u, 2 * u, '#d8cfe6');
    },
    grave(g, s) {
      const u = s / 100;
      g.fillStyle = '#4a4f58';
      g.beginPath();
      g.moveTo(s / 2 - 16 * u, s * 0.74); g.lineTo(s / 2 - 16 * u, s * 0.46);
      g.arc(s / 2, s * 0.46, 16 * u, WS.PI, 0);
      g.lineTo(s / 2 + 16 * u, s * 0.74); g.closePath(); g.fill();
      g.strokeStyle = '#2b2f36'; g.lineWidth = 2.5 * u;
      g.beginPath(); g.moveTo(s / 2, s * 0.44); g.lineTo(s / 2, s * 0.64); g.stroke();
      g.beginPath(); g.moveTo(s / 2 - 8 * u, s * 0.52); g.lineTo(s / 2 + 8 * u, s * 0.52); g.stroke();
    },
    bone(g, s) {
      const u = s / 100;
      g.strokeStyle = '#8f94a0'; g.lineWidth = 5 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(s / 2 - 18 * u, s * 0.6); g.lineTo(s / 2 + 18 * u, s * 0.56); g.stroke();
      g.fillStyle = '#a3a8b4';
      for (const [x, y] of [[-20, 56], [-18, 66], [20, 52], [22, 62]]) {
        ellipse(g, s / 2 + x * u, s * (y / 100), 5 * u, 5 * u, '#a3a8b4');
      }
    },
    skull(g, s) {
      const u = s / 100;
      ellipse(g, s / 2, s * 0.56, 16 * u, 15 * u, '#9aa0ac');
      g.fillStyle = '#20242c';
      ellipse(g, s / 2 - 6 * u, s * 0.55, 4 * u, 5 * u, '#20242c');
      ellipse(g, s / 2 + 6 * u, s * 0.55, 4 * u, 5 * u, '#20242c');
      g.fillRect(s / 2 - 6 * u, s * 0.64, 12 * u, 6 * u);
    },
    wheat(g, s) {
      const u = s / 100;
      g.strokeStyle = '#8f7a3c'; g.lineWidth = 2 * u;
      for (const dx of [-10, 0, 10]) {
        g.beginPath(); g.moveTo(s / 2 + dx * u, s * 0.74); g.quadraticCurveTo(s / 2 + dx * u + 4 * u, s * 0.56, s / 2 + dx * u, s * 0.4); g.stroke();
        ellipse(g, s / 2 + dx * u, s * 0.4, 4 * u, 8 * u, '#c9a94c');
      }
    },
    fence(g, s) {
      const u = s / 100;
      g.fillStyle = '#4a3a26';
      g.fillRect(s / 2 - 22 * u, s * 0.44, 5 * u, 30 * u);
      g.fillRect(s / 2 + 17 * u, s * 0.44, 5 * u, 30 * u);
      g.fillRect(s / 2 - 24 * u, s * 0.52, 48 * u, 4 * u);
      g.fillRect(s / 2 - 24 * u, s * 0.62, 48 * u, 4 * u);
    },
    gear(g, s) {
      const u = s / 100;
      g.save(); g.translate(s / 2, s * 0.58);
      g.fillStyle = '#585d68';
      for (let i = 0; i < 8; i++) {
        g.rotate(WS.TAU / 8);
        g.fillRect(-3 * u, -20 * u, 6 * u, 8 * u);
      }
      g.beginPath(); g.arc(0, 0, 14 * u, 0, WS.TAU); g.fill();
      g.fillStyle = '#2b2f36';
      g.beginPath(); g.arc(0, 0, 5 * u, 0, WS.TAU); g.fill();
      g.restore();
    },
    cactus(g, s) {
      const u = s / 100;
      g.fillStyle = '#3d5a34';
      g.fillRect(s / 2 - 6 * u, s * 0.36, 12 * u, 38 * u);
      g.fillRect(s / 2 - 18 * u, s * 0.5, 8 * u, 16 * u);
      g.fillRect(s / 2 + 10 * u, s * 0.46, 8 * u, 20 * u);
    },
    grass(g, s) {
      const u = s / 100;
      g.strokeStyle = '#6b6a3c'; g.lineWidth = 2 * u; g.lineCap = 'round';
      for (const dx of [-12, -4, 4, 12]) {
        g.beginPath(); g.moveTo(s / 2 + dx * u, s * 0.72);
        g.quadraticCurveTo(s / 2 + dx * u + 6 * u, s * 0.58, s / 2 + dx * u + 2 * u, s * 0.44); g.stroke();
      }
    },
    spire(g, s) {
      const u = s / 100;
      poly(g, [[s / 2 - 14 * u, s * 0.76], [s / 2 - 6 * u, s * 0.3], [s / 2 + 4 * u, s * 0.26],
      [s / 2 + 14 * u, s * 0.72]], '#39485c', '#22303f', u);
    },
    crystal(g, s) {
      const u = s / 100;
      g.save(); g.shadowColor = '#7fd4ff'; g.shadowBlur = 14 * u;
      poly(g, [[s / 2, s * 0.3], [s / 2 + 11 * u, s * 0.56], [s / 2, s * 0.72], [s / 2 - 11 * u, s * 0.56]],
        '#6fbfe8', '#a9e6ff', u);
      g.restore();
    },
    ice(g, s) {
      const u = s / 100;
      poly(g, [[s / 2 - 20 * u, s * 0.68], [s / 2 - 6 * u, s * 0.48], [s / 2 + 8 * u, s * 0.54],
      [s / 2 + 20 * u, s * 0.7]], 'rgba(160,210,240,.5)', 'rgba(210,240,255,.7)', u);
    },
  };

  /* -------------------------------------------------------------- API ----- */
  WS.Sprites = {
    /** Cached creature sprite. `size` is the full canvas edge in world units. */
    creature(art, tint, size) {
      size = WS.round(size);
      const key = `c:${art}:${WS.hex(tint)}:${size}`;
      let c = cache.get(key);
      if (c) return c;
      const res = size * SS;
      c = make(res, res);
      const g = c.getContext('2d');
      const draw = CREATURES[art] || CREATURES.kobold;
      draw(g, res, palette(tint));
      c.displaySize = size;
      cache.set(key, c);
      return c;
    },

    hero(id, tint, size, demon) {
      size = WS.round(size);
      const key = `h:${id}:${WS.hex(tint)}:${size}:${demon ? 1 : 0}`;
      let c = cache.get(key);
      if (c) return c;
      const res = size * SS;
      c = make(res, res);
      drawHero(c.getContext('2d'), res, tint, HEROES[id] || HEROES.mage, demon);
      c.displaySize = size;
      cache.set(key, c);
      return c;
    },

    prop(kind, size) {
      size = WS.round(size);
      const key = `p:${kind}:${size}`;
      let c = cache.get(key);
      if (c) return c;
      const res = size * SS;
      c = make(res, res);
      const draw = PROPS[kind] || PROPS.rock;
      draw(c.getContext('2d'), res);
      c.displaySize = size;
      cache.set(key, c);
      return c;
    },

    has(art) { return !!CREATURES[art]; },
    clear() { cache.clear(); },
  };

})(window.WS);
