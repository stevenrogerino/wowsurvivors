/* Procedural art. Every creature, prop, gem and UI glyph is drawn once into an
 * offscreen canvas at boot and cached by (kind, tint, size), so the game ships
 * with no image files and still gets per-enemy silhouettes.
 *
 * House style: a three-quarter-from-above view. Bodies are built from stacked
 * ellipses lit from the upper left, outlined in a darkened shade of their own
 * tint (never black), with one hot rim highlight - the Arclight arc - on the
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

  /** ONE line round the whole creature.
   *
   *  Drawn from the finished sprite rather than per shape: the alpha is
   *  thresholded into a hard silhouette, that silhouette is stamped eight ways
   *  round a small circle to dilate it by a pixel, the result is tinted, and
   *  the creature is laid back on top. What survives is exactly the outer
   *  boundary and nothing else - no seam where two masses overlap, and no ring
   *  round a head that is sunk into a chest.
   *
   *  The threshold is what makes this safe around light. Several creatures
   *  carry a glow, and glow is a wide skirt of half-transparent pixels; tracing
   *  the sprite's alpha directly would draw a dark line round the outside of
   *  the light, which is the one place a line must never be.
   *
   *  The line is the creature's own darkened colour rather than black, for the
   *  same reason the survivors' edges are: black reads as ink round a sticker,
   *  and a shape's own shadow reads as the shape turning away.
   */
  function outline(src, res, p) {
    const W = 2;                          // device pixels, so 1 at world scale
    const mask = make(res, res);
    const mg = mask.getContext('2d');
    mg.drawImage(src, 0, 0);
    const img = mg.getImageData(0, 0, res, res);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 170 ? 255 : 0;
    mg.putImageData(img, 0, 0);

    const ring = make(res, res);
    const rg = ring.getContext('2d');
    for (let k = 0; k < 8; k++) {
      const a = k * WS.PI / 4;
      rg.drawImage(mask, WS.cos(a) * W, WS.sin(a) * W);
    }
    rg.globalCompositeOperation = 'source-in';
    rg.fillStyle = p.line;
    rg.fillRect(0, 0, res, res);

    const out = make(res, res);
    const og = out.getContext('2d');
    og.globalAlpha = 0.85;
    og.drawImage(ring, 0, 0);
    og.globalAlpha = 1;
    og.drawImage(src, 0, 0);
    return out;
  }

  /** Where a creature actually IS inside its canvas.
   *
   *  Read off the drawn pixels rather than assumed, because every art function
   *  puts its animal somewhere different - a strider's head is at the top of
   *  the frame and a spider's is halfway down the left. Boss regalia has to
   *  sit on the creature it is given, so it asks the drawing where the head
   *  and the shoulders are instead of being told. */
  function bounds(src, res) {
    const c = make(res, res);
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, res, res).data;
    let top = res, bottom = 0, left = res, right = 0, headTop = res, headX = res / 2;
    const band = [Math.floor(res * 0.34), Math.ceil(res * 0.66)];
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        if (d[(y * res + x) * 4 + 3] < 170) continue;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
        if (x >= band[0] && x <= band[1] && y < headTop) { headTop = y; headX = x; }
      }
    }
    if (top > bottom) return null;            // nothing was drawn
    if (headTop === res) { headTop = top; headX = (left + right) / 2; }

    /* PER-ROW EXTENTS, because a bounding box is not a body.
     *
     * Hung off the box alone, a crown sat on the topmost pixel in the middle
     * third - which on the lampling is the tip of its flame and on the gilkin
     * the top of a head fin, so the crown floated in the air above the animal.
     * Pauldrons went on at 0.46 of the box width and ended up outside
     * anything on the narrow ones. Both want to know how wide the creature
     * actually is AT A GIVEN HEIGHT, so that is what this returns. */
    const rows = new Int32Array(res * 2);
    for (let y = 0; y < res; y++) {
      let l = -1, r = -1;
      for (let x = 0; x < res; x++) {
        if (d[(y * res + x) * 4 + 3] < 170) continue;
        if (l < 0) l = x;
        r = x;
      }
      rows[y * 2] = l; rows[y * 2 + 1] = r;
    }
    const width = (y) => {
      const yy = Math.max(0, Math.min(res - 1, Math.round(y)));
      return rows[yy * 2] < 0 ? 0 : rows[yy * 2 + 1] - rows[yy * 2];
    };
    const mid = (y) => {
      const yy = Math.max(0, Math.min(res - 1, Math.round(y)));
      return rows[yy * 2] < 0 ? (left + right) / 2 : (rows[yy * 2] + rows[yy * 2 + 1]) / 2;
    };
    // the crown line: the first row down from the top that is actually a HEAD
    // rather than the tip of a horn, a fin or a flame
    const full = right - left;
    let crownY = top;
    for (let y = top; y <= bottom; y++) {
      if (width(y) >= full * 0.26) { crownY = y; break; }
    }
    return { top, bottom, left, right, headTop, headX, crownY,
      w: full, h: bottom - top, cx: (left + right) / 2, width, mid };
  }

  /** REGALIA.
   *
   *  Sixteen of the twenty bosses were a common creature in a different
   *  colour: Captain Redcowl and the Masked Admiral were both the bandit,
   *  Mordecai and Ossuar were both the necromancer, and a boss that is a
   *  trash mob with the saturation turned up is not an event. Rather than
   *  twenty more art functions, each boss declares a KIT - a crown, a mane,
   *  pauldrons, a banner - and it is hung on the creature where the creature
   *  actually is.
   */
  function regalia(g, res, p, kit, b) {
    const u = res / 100;
    const gold = { hi: '#ffe9b0', mid: '#e8b860', lo: '#a97c2f', dark: '#5e4416',
      line: '#3e2d0e', glow: '#fff6d8' };
    const bone = { hi: '#f2ede0', mid: '#d8d0bd', lo: '#9a9280', dark: '#5e594c',
      line: '#3d392f', glow: '#fff' };
    const iron = { hi: '#cfd6e2', mid: '#9aa2b2', lo: '#5f6878', dark: '#333a46',
      line: '#1e232c', glow: '#fff' };

    for (const mark of kit) {
      if (mark === 'crown') {
        const y = b.crownY + 1 * u, x = b.mid(b.crownY), wr = WS.max(b.width(b.crownY) * 0.5, b.w * 0.14);
        for (let i = -2; i <= 2; i++) {
          const h = (i === 0 ? 15 : Math.abs(i) === 1 ? 11 : 7) * u;
          poly(g, [[x + (i * 0.42 - 0.2) * wr, y], [x + i * 0.42 * wr, y - h],
            [x + (i * 0.42 + 0.2) * wr, y]], gold.mid, gold.line, u * 0.9);
        }
        poly(g, [[x - wr, y - 1 * u], [x + wr, y - 1 * u],
          [x + wr * 0.92, y + 4 * u], [x - wr * 0.92, y + 4 * u]], gold.hi, gold.line, u);
        // stones set in the band - a crown without them is a paper hat
        for (let i = -1; i <= 1; i++) {
          const sx = x + i * wr * 0.52;
          g.fillStyle = gold.line;
          g.beginPath(); g.ellipse(sx, y + 1.9 * u, 1.9 * u, 1.7 * u, 0, 0, WS.TAU); g.fill();
          g.fillStyle = i ? '#7fd8ff' : '#ff8f6b';
          g.beginPath(); g.ellipse(sx, y + 1.6 * u, 1.2 * u, 1.1 * u, 0, 0, WS.TAU); g.fill();
        }
        g.save();
        g.globalCompositeOperation = 'lighter';
        const cg = g.createRadialGradient(x, y - 4 * u, 1, x, y - 4 * u, 14 * u);
        cg.addColorStop(0, 'rgba(255,225,150,.34)');
        cg.addColorStop(1, 'rgba(255,225,150,0)');
        g.fillStyle = cg;
        g.beginPath(); g.arc(x, y - 4 * u, 14 * u, 0, WS.TAU); g.fill();
        g.restore();

      } else if (mark === 'horns') {
        const y = b.crownY + 4 * u, x = b.mid(b.crownY), r = WS.max(b.width(b.crownY), b.w * 0.34) * 0.62;
        for (const dir of [-1, 1]) {
          // a swept cone, walked as a centreline with a half-width so the
          // taper actually reaches a point
          const P = (t) => {
            const uu = 1 - t;
            return [uu * uu * (x + dir * r * 0.32) + 2 * uu * t * (x + dir * r * 1.15)
              + t * t * (x + dir * r * 1.05),
            uu * uu * y + 2 * uu * t * (y - r * 0.25) + t * t * (y - r * 0.95)];
          };
          const W = (t) => r * 0.15 * Math.pow(1 - t, 0.75);
          const N = 14, pts = [];
          for (let i = 0; i <= N; i++) {
            const t = i / N;
            const a = P(t), n1 = P(Math.min(1, t + 0.02)), n0 = P(Math.max(0, t - 0.02));
            const ddx = n1[0] - n0[0], ddy = n1[1] - n0[1];
            const L = Math.hypot(ddx, ddy) || 1;
            pts.push({ x: a[0], y: a[1], nx: -ddy / L, ny: ddx / L, w: W(t) });
          }
          const grd = g.createLinearGradient(x, y, x + dir * r, y - r);
          grd.addColorStop(0, bone.lo);
          grd.addColorStop(0.45, bone.mid);
          grd.addColorStop(1, bone.hi);
          g.fillStyle = grd;
          g.beginPath();
          g.moveTo(pts[0].x + pts[0].nx * pts[0].w, pts[0].y + pts[0].ny * pts[0].w);
          for (let i = 1; i <= N; i++) g.lineTo(pts[i].x + pts[i].nx * pts[i].w, pts[i].y + pts[i].ny * pts[i].w);
          for (let i = N; i >= 0; i--) g.lineTo(pts[i].x - pts[i].nx * pts[i].w, pts[i].y - pts[i].ny * pts[i].w);
          g.closePath(); g.fill();
          // growth rings, crowded at the root
          g.save();
          g.strokeStyle = bone.line; g.lineWidth = 1.1 * u;
          for (let i = 1; i <= 7; i++) {
            const t = Math.pow(i / 8, 1.3) * 0.82;
            const a = P(t), n1 = P(t + 0.02), n0 = P(t - 0.02);
            const ddx = n1[0] - n0[0], ddy = n1[1] - n0[1];
            const L = Math.hypot(ddx, ddy) || 1;
            const nx = -ddy / L, ny = ddx / L, w = W(t) * 0.9;
            g.globalAlpha = 0.62 * (1 - t * 0.7);
            g.beginPath();
            g.moveTo(a[0] + nx * w, a[1] + ny * w);
            g.lineTo(a[0] - nx * w, a[1] - ny * w);
            g.stroke();
          }
          g.restore();
        }

      } else if (mark === 'mane') {
        const y = b.top + b.h * 0.30, x = b.mid(y), wr = WS.max(b.width(y), b.w * 0.4) * 0.56;
        for (let i = 0; i < 15; i++) {
          const a = WS.PI * (1.04 + i * 0.062);
          const len = (i % 2 ? 0.78 : 1) * b.h * 0.19;
          const x0 = x + WS.cos(a) * wr * 0.62, y0 = y + WS.sin(a) * wr * 0.4;
          const x1 = x + WS.cos(a) * (wr * 0.62 + len), y1 = y + WS.sin(a) * (wr * 0.4 + len);
          const nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1;
          const w = u * (i % 2 ? 2 : 3);
          g.fillStyle = i % 2 ? p.mid : p.lo;
          g.beginPath();
          g.moveTo(x0 + nx / L * w, y0 + ny / L * w);
          g.lineTo(x1, y1);
          g.lineTo(x0 - nx / L * w, y0 - ny / L * w);
          g.closePath(); g.fill();
          // a spine down each tuft, so the mane is hair and not a paper fan
          g.strokeStyle = p.line; g.globalAlpha = 0.45; g.lineWidth = 0.7 * u;
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
          g.globalAlpha = 1;
        }

      } else if (mark === 'pauldrons') {
        /* On the EDGE of the body at shoulder height, with no floor under the
           width. Keeping a `max(..., 0.18 of the box)` fallback pushed the
           plates outside anything narrow - the lich and the strider wore them
           hovering in the air beside themselves. If the creature is thin
           there, the pauldrons are close in, which is what a pauldron does. */
        const y = b.top + b.h * 0.40;
        const wr = b.width(y) * 0.46;
        for (const dir of [-1, 1]) {
          const x = b.mid(y) + dir * wr;
          poly(g, [[x - dir * 9 * u, y - 7 * u], [x + dir * 9 * u, y - 2 * u],
            [x + dir * 8 * u, y + 8 * u], [x - dir * 9 * u, y + 6 * u]],
            iron.mid, iron.line, u);
          poly(g, [[x - dir * 7 * u, y - 4 * u], [x + dir * 7 * u, y],
            [x + dir * 6 * u, y + 3 * u], [x - dir * 7 * u, y + 1 * u]],
            iron.hi, iron.line, u * 0.8);
          for (let i = 0; i < 3; i++) {
            poly(g, [[x + dir * (3 + i * 3) * u, y + 7 * u],
              [x + dir * (5 + i * 3) * u, y + 14 * u],
              [x + dir * (6 + i * 3) * u, y + 7 * u]], iron.lo, iron.line, u * 0.7);
          }
        }

      } else if (mark === 'banner') {
        const x = b.cx + b.w * 0.40, y0 = b.top - b.h * 0.22, y1 = b.bottom - b.h * 0.1;
        g.strokeStyle = '#6d5233'; g.lineWidth = 2.6 * u; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y0); g.lineTo(x - 3 * u, y1); g.stroke();
        poly(g, [[x, y0 + 3 * u], [x + b.w * 0.24, y0 + 7 * u],
          [x + b.w * 0.19, y0 + b.h * 0.24], [x - 1 * u, y0 + b.h * 0.3]],
          p.mid, p.line, u);
        poly(g, [[x + b.w * 0.05, y0 + b.h * 0.13], [x + b.w * 0.17, y0 + b.h * 0.15],
          [x + b.w * 0.12, y0 + b.h * 0.22]], gold.mid, gold.line, u * 0.8);
        poly(g, [[x - 4 * u, y0 - 4 * u], [x + 4 * u, y0 - 4 * u], [x, y0 - 12 * u]],
          gold.hi, gold.line, u * 0.8);

      } else if (mark === 'trophies') {
        // Hung ON the body: the cord starts inside the silhouette, so the
        // skull below it reads as carried rather than as falling past.
        const y = b.top + b.h * 0.56;
        const half = b.width(y) * 0.5;
        for (let i = -2; i <= 2; i++) {
          if (!i) continue;
          const x = b.mid(y) + i * half * 0.46, drop = (5 + Math.abs(i) * 3) * u;
          g.strokeStyle = bone.dark; g.lineWidth = 1 * u;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + drop); g.stroke();
          shaded(g, x, y + drop + 4 * u, 4.4 * u, 4 * u, bone);
          g.fillStyle = bone.line;
          g.beginPath(); g.arc(x - 1.6 * u, y + drop + 3.6 * u, 1.1 * u, 0, WS.TAU); g.fill();
          g.beginPath(); g.arc(x + 1.6 * u, y + drop + 3.6 * u, 1.1 * u, 0, WS.TAU); g.fill();
        }

      } else if (mark === 'brand') {
        const y = b.top + b.h * 0.52, x = b.mid(y), r = WS.max(b.width(y) * 0.22, b.w * 0.1);
        g.save();
        g.globalCompositeOperation = 'lighter';
        const gl = g.createRadialGradient(x, y, 1, x, y, r * 2.2);
        gl.addColorStop(0, WS.rgb([1, 0.86, 0.5], 0.5));
        gl.addColorStop(1, WS.rgb([1, 0.86, 0.5], 0));
        g.fillStyle = gl;
        g.beginPath(); g.arc(x, y, r * 2.2, 0, WS.TAU); g.fill();
        g.strokeStyle = '#ffe9b0'; g.lineWidth = 1.8 * u; g.lineJoin = 'round';
        g.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = -WS.PI / 2 + i * (WS.TAU / 3);
          const bx = x + WS.cos(a) * r, by = y + WS.sin(a) * r;
          if (i) g.lineTo(bx, by); else g.moveTo(bx, by);
        }
        g.closePath(); g.stroke();
        g.beginPath(); g.arc(x, y, r * 0.42, 0, WS.TAU); g.stroke();
        g.restore();

      } else if (mark === 'plumehat') {
        // A wide brim and a feather: a captain, not a private.
        const y = b.crownY + 3 * u, x = b.mid(b.crownY), wr = WS.max(b.width(b.crownY) * 0.68, b.w * 0.2);
        poly(g, [[x - wr, y], [x - wr * 0.5, y - 9 * u], [x + wr * 0.5, y - 9 * u],
          [x + wr, y], [x + wr * 0.6, y + 4 * u], [x - wr * 0.6, y + 4 * u]],
          p.lo, p.line, u);
        poly(g, [[x - wr * 0.46, y - 8 * u], [x - wr * 0.3, y - 17 * u],
          [x + wr * 0.3, y - 17 * u], [x + wr * 0.46, y - 8 * u]], p.mid, p.line, u);
        poly(g, [[x - wr * 0.5, y - 8 * u], [x + wr * 0.5, y - 8 * u],
          [x + wr * 0.5, y - 5 * u], [x - wr * 0.5, y - 5 * u]], gold.mid, gold.line, u * 0.8);
        // the plume, sweeping back off the band
        g.save();
        g.strokeStyle = bone.hi; g.lineWidth = 2.6 * u; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x + wr * 0.4, y - 7 * u);
        g.quadraticCurveTo(x + wr * 1.5, y - 22 * u, x + wr * 1.9, y - 8 * u);
        g.stroke();
        g.strokeStyle = bone.lo; g.lineWidth = 1 * u;
        for (let i = 1; i <= 4; i++) {
          const t = i / 5;
          const px = x + wr * (0.4 + t * 1.2), py = y - (7 + Math.sin(t * 3) * 12) * u;
          g.beginPath();
          g.moveTo(px, py); g.lineTo(px + 3 * u, py + 5 * u);
          g.stroke();
        }
        g.restore();

      } else if (mark === 'spines') {
        const y = b.top + b.h * 0.38, x = b.mid(y);
        for (let i = 0; i < 9; i++) {
          const a = WS.PI * (1.08 + i * 0.105);
          const r0 = WS.max(b.width(y) * 0.48, b.w * 0.2), len = b.h * (i % 2 ? 0.1 : 0.17);
          const x0 = x + WS.cos(a) * r0, y0 = y + WS.sin(a) * r0 * 0.7;
          poly(g, [[x0 - 2.4 * u, y0], [x0 + WS.cos(a) * len, y0 + WS.sin(a) * len],
            [x0 + 2.4 * u, y0]], bone.mid, bone.line, u * 0.8);
        }
      }
    }
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

  /** Grey, for the parts of a creature that are not made of the creature -
   *  knuckles, bone, stone. Built once rather than per-call. */
  const STONE = palette([0.56, 0.58, 0.63]);

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
    /* NO FULL OUTLINE.
     *
     * Every mass used to stroke its whole boundary, and every creature here is
     * built from four or five overlapping masses - so each one drew a complete
     * dark ring straight across the body behind it. The cat came out three
     * segments bolted together, the gilkin wore a ring round its head, and the
     * vulture's neck cut a line through its own chest. None of those rings sat
     * on a real edge of the form; they were the seams of the construction
     * showing through.
     *
     * The silhouette is drawn ONCE for the whole creature, in creature()
     * below. What is left here is a soft inner edge, clipped so it cannot
     * bulge the shape, which is enough to say a limb is in front of a body
     * without stamping a hoop on it. */
    g.save();
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, WS.TAU);
    g.clip();
    g.globalAlpha = 0.34;
    g.strokeStyle = p.line;
    g.lineWidth = WS.max(1.4, rx * 0.15) * 2;
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, WS.TAU);
    g.stroke();
    g.restore();
    /* The lit edge, along THIS body's own ellipse and clipped inside it, so
       only the inner half of the stroke shows and it reads as light catching
       the form. It used to be a separate circular arc laid over the body at a
       fixed radius, which on anything that was not a circle cut across the
       shape instead of hugging it - a stray half-ring floating on every
       creature and every survivor. Light belongs in the form, not on top. */
    g.save();
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, WS.TAU);
    g.clip();
    /* Struck in three passes that shorten and brighten, so the highlight
       FADES OUT at both ends. One arc at one alpha stopped dead mid-body and
       read as a scratch on the paint rather than as light on a curve. */
    g.strokeStyle = p.hi;
    const arc = [[0.92, 1.72, 0.22], [1.00, 1.64, 0.22], [1.10, 1.54, 0.26]];
    for (const [a0, a1, al] of arc) {
      g.globalAlpha = al;
      g.lineWidth = WS.max(1.6, rx * 0.2);
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, WS.PI * a0, WS.PI * a1);
      g.stroke();
    }

    /* THE FORM, not just the light on it.
     *
     * Everything above this was one radial ramp, and a ramp has no steep
     * change anywhere in it - the whole bestiary measured 22% interior detail
     * against the survivors' 41%, which is where the survivors were before
     * they were given edges. The same three marks that fixed them fix a body:
     *
     *   terminator   the LINE where the lit side turns away. A gradient says
     *                where the light is; the terminator is what says the
     *                surface is curved, and unlike the gradient it is an edge
     *                and so it reads at 36px and it measures.
     *   contact      the underside is darker than the shadow side, because
     *                the ground is right there and the light bouncing off it
     *                never reaches underneath.
     *   bounce       and a thin bright rim on the shadow side, which IS that
     *                bounced light. Without it a body lit from one side reads
     *                as a half-moon sticker.
     */
    g.globalAlpha = 0.34;
    g.strokeStyle = p.lo;
    g.lineWidth = WS.max(1.1, rx * 0.075);
    g.beginPath();
    g.ellipse(-rx * 0.16, -ry * 0.12, rx * 0.86, ry * 0.88, 0,
      WS.PI * 1.80, WS.PI * 0.70);
    g.stroke();

    const floor = g.createLinearGradient(0, ry * 0.18, 0, ry);
    floor.addColorStop(0, 'rgba(0,0,0,0)');
    floor.addColorStop(1, 'rgba(0,0,0,.34)');
    g.globalAlpha = 1;
    g.fillStyle = floor;
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, WS.TAU);
    g.fill();

    g.globalAlpha = 0.5;
    g.strokeStyle = p.hi;
    g.lineWidth = WS.max(0.9, rx * 0.06);
    g.beginPath();
    g.ellipse(0, 0, rx * 0.995, ry * 0.995, 0, WS.PI * 0.10, WS.PI * 0.62);
    g.stroke();
    g.restore();
    g.restore();
  }

  /** A flat polygon with an inside.
   *
   *  Every wing, horn, spike, talon, plate and fin in the bestiary is one of
   *  these, and every one of them was a flat fill with an outline round it -
   *  a cut-out. The survivors learned this the expensive way: smooth shading
   *  alone moved their interior detail by 0.3 points, and what actually
   *  separates a drawing from a set of stickers is where one surface STOPS,
   *  which is a line and not a ramp.
   *
   *  So the fill is followed by two things clipped inside the shape: a
   *  directional darkening away from the light, and an inner edge in the
   *  shape's own darkened colour. Both are clipped, so the silhouette this
   *  polygon had before is the silhouette it has now - nothing here can grow
   *  a shape by a pixel, which matters because the framing rules are measured
   *  on the outline.
   */
  function poly(g, pts, fill, stroke, lw) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const [x, y] of pts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const trace = () => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
    };
    trace();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
    if (!fill) return;
    const w = maxX - minX, h = maxY - minY;
    if (w < 2 || h < 2) return;                 // too small to hold anything
    g.save();
    trace(); g.clip();
    const grd = g.createLinearGradient(minX, minY, maxX, maxY);
    grd.addColorStop(0, 'rgba(255,255,255,.10)');
    grd.addColorStop(0.45, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,.26)');
    g.fillStyle = grd;
    g.fillRect(minX, minY, w, h);
    /* And the edge. Stroked at DOUBLE width with the clip still on, so the
       outer half is thrown away and the line sits wholly inside - the same
       trick the survivors' plates use, and the reason adding it cannot push
       anything past its own tile. */
    g.strokeStyle = stroke || 'rgba(0,0,0,.34)';
    g.globalAlpha = stroke ? 0.5 : 0.34;
    g.lineWidth = (lw || 1) * 2;
    trace(); g.stroke();
    g.restore();
  }

  /** Eyes, in SOCKETS.
   *
   *  These were two glowing dots laid straight on the body. A bright mark on
   *  a lit ground has no weight - the survivors hit exactly this and the fix
   *  was the same: put something dark behind it. A monster's eye is allowed
   *  to be the brightest thing on it, but only if it is sitting in a hole,
   *  and the hole is what turns a pair of dots into a face.
   */
  function eyes(g, x, y, spread, r, colour) {
    g.save();
    for (const dir of [-1, 1]) {
      const ex = x + dir * spread;
      // the socket: a dark well, wider than the light in it
      /* Tuned down from r*2.5 at .85, which at portrait size stopped being a
         socket and became a pair of goggles - the skeleton in particular came
         out wearing them. A socket is a shadow the eye sits in, not a ring
         around it. */
      const well = g.createRadialGradient(ex, y, r * 0.3, ex, y, r * 1.85);
      well.addColorStop(0, 'rgba(6,5,10,.6)');
      well.addColorStop(1, 'rgba(6,5,10,0)');
      g.fillStyle = well;
      g.beginPath(); g.arc(ex, y, r * 1.85, 0, WS.TAU); g.fill();
      // a hard rim under the brow, so the socket has a top edge
      g.strokeStyle = 'rgba(6,5,10,.45)';
      g.lineWidth = WS.max(0.6, r * 0.28);
      g.beginPath();
      g.arc(ex, y, r * 1.35, WS.PI * 1.10, WS.PI * 1.90);
      g.stroke();
    }
    g.shadowColor = colour; g.shadowBlur = r * 4;
    g.fillStyle = colour;
    g.beginPath(); g.arc(x - spread, y, r, 0, WS.TAU); g.fill();
    g.beginPath(); g.arc(x + spread, y, r, 0, WS.TAU); g.fill();
    g.shadowBlur = 0;
    // a hot core, so the eye has a centre rather than being one flat disc
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.beginPath(); g.arc(x - spread, y - r * 0.2, r * 0.42, 0, WS.TAU); g.fill();
    g.beginPath(); g.arc(x + spread, y - r * 0.2, r * 0.42, 0, WS.TAU); g.fill();
    g.restore();
  }

  /** Legs, drawn BEFORE the body so they read as attached rather than stuck on.
   *
   *  `bottom` is the body's own lowest edge; `drop` is how far past it the foot
   *  goes, and that is the whole point. Every quadruped here used to run its
   *  legs from inside the body to about 3u past it - at a 36px sprite that is
   *  one pixel of visible leg, which is why the wolf, the cat and the boar all
   *  read as lumps on the field. A limb has to clear the mass it hangs from by
   *  more than its own width, or at gameplay size it does not exist.
   *
   *  The foot pads matter as much as the length: bare strokes read as sticks,
   *  a pad reads as an animal standing on something. */
  function legs(g, p, cx, bottom, u, xs, drop, w) {
    g.save();
    g.lineCap = 'round';
    for (const dx of xs) {
      const lx = cx + dx * u, top = bottom - 6 * u, foot = bottom + drop * u;
      /* Thicker at the body and thinner at the foot, like every other limb in
         this game. A stroke of one width from hip to toe is a stick, and the
         whole bestiary was standing on sticks. */
      g.strokeStyle = p.lo;
      g.lineWidth = w * u * 1.25;
      g.beginPath(); g.moveTo(lx, top); g.lineTo(lx, top + (foot - top) * 0.55); g.stroke();
      g.strokeStyle = p.dark;
      g.lineWidth = w * u * 0.85;
      g.beginPath();
      g.moveTo(lx, top + (foot - top) * 0.5); g.lineTo(lx, foot);
      g.stroke();
      // the joint, where the two meet
      g.fillStyle = p.lo;
      g.beginPath();
      g.ellipse(lx, top + (foot - top) * 0.52, w * u * 0.72, w * u * 0.62, 0, 0, WS.TAU);
      g.fill();
      /* And bands down the shank. Nine creatures take their legs from here,
         and a limb that is one colour from joint to toe is the same bare
         column the bodies used to be - the last unworked surface left on the
         bestiary, repeated four times per animal. */
      g.save();
      g.strokeStyle = p.line;
      g.globalAlpha = 0.4;
      g.lineWidth = WS.max(0.7, w * u * 0.18);
      for (const t of [0.66, 0.8]) {
        const by = top + (foot - top) * t;
        g.beginPath();
        g.moveTo(lx - w * u * 0.42, by);
        g.lineTo(lx + w * u * 0.42, by + w * u * 0.16);
        g.stroke();
      }
      g.globalAlpha = 0.26;
      g.strokeStyle = p.hi;
      g.beginPath();
      g.moveTo(lx - w * u * 0.3, top + (foot - top) * 0.3);
      g.lineTo(lx - w * u * 0.22, top + (foot - top) * 0.62);
      g.stroke();
      g.restore();
    }
    for (const dx of xs) {
      const lx = cx + dx * u, foot = bottom + drop * u;
      g.fillStyle = p.dark;
      g.beginPath();
      g.ellipse(lx, foot, w * 0.8 * u, w * 0.55 * u, 0, 0, WS.TAU);
      g.fill();
      // toes: a pad with no division reads as a peg, and these are animals
      g.strokeStyle = 'rgba(0,0,0,.45)';
      g.lineWidth = WS.max(0.6, w * u * 0.2);
      for (const k of [-1, 1]) {
        g.beginPath();
        g.moveTo(lx + k * w * 0.26 * u, foot - w * 0.1 * u);
        g.lineTo(lx + k * w * 0.42 * u, foot + w * 0.4 * u);
        g.stroke();
      }
    }
    g.restore();
  }

  /** A blade, and a blade is not a shard.
   *
   *  Eleven creatures carried this and every one of them carried the SAME
   *  four-point kite in a slightly different grey - the most repeated and
   *  least worked object in the bestiary, and at play size a paper dart
   *  rather than something that cuts. What makes steel read is a profile that
   *  is widest near the guard and tapers, a fuller down the middle, one
   *  bright line where the edge is thinnest, and the fact that somebody is
   *  HOLDING it: a guard and a haft below the hand.
   *
   *  `kind` shapes it without touching the eleven call sites that do not pass
   *  one - 'curve' for a scythe or a claw, 'heavy' for a cleaver.
   */
  /** A COAT on a mass, clipped inside it.
   *
   *  Half the bestiary is a furred or feathered animal drawn as one smooth
   *  ellipse - a perfect outline with nothing happening under it. Fur is not
   *  a texture at this size, it is a small number of TUFTS that break the
   *  surface: a dark stroke with a light one beside it, laid along the way
   *  the coat lies. The same shape serves a wolf's hackles, a boar's hide and
   *  a bird's coverts; only the direction and the count change.
   *
   *  Clipped, always, so nothing here can alter the silhouette the animal was
   *  built with.
   */
  function pelt(g, p, cx, cy, rx, ry, rot, n, lean, alpha) {
    /* TUFTS, in two staggered rows.
     *
     * The first version struck one long stroke per tuft at even spacing and a
     * constant angle, and a row of evenly spaced parallel lines down a body is
     * not fur - it is corrugation. The wolf came out ribbed like a radiator.
     * Fur at this size is a small number of SHORT marks that disagree with
     * each other: varied in length, varied in angle, and staggered so no two
     * rows line up. */
    g.save();
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, rot || 0, 0, WS.TAU);
    g.clip();
    g.lineCap = 'round';
    const a0 = alpha === undefined ? 0.4 : alpha;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < n; i++) {
        const t = (i + (row ? 0.5 : 0)) / n;
        const x = cx - rx * 0.78 + rx * 1.56 * t;
        const y = cy - ry * 0.55 + row * ry * 0.42 + Math.sin(t * 7.1 + row) * ry * 0.1;
        // every tuft its own length and its own tilt
        const len = ry * (0.16 + 0.12 * Math.abs(Math.sin(t * 11 + row * 2)));
        const tilt = lean + 0.5 * Math.sin(t * 9.3 + row * 1.7);
        g.globalAlpha = a0 * (row === 1 ? 0.85 : row === 2 ? 0.7 : 1);
        g.strokeStyle = p.line;
        g.lineWidth = Math.max(0.7, rx * 0.035);
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + tilt * len * 0.4, y + len * 0.7, x + tilt * len, y + len);
        g.stroke();
        g.globalAlpha = a0 * 0.55;
        g.strokeStyle = p.hi;
        g.beginPath();
        g.moveTo(x + rx * 0.035, y);
        g.quadraticCurveTo(x + rx * 0.035 + tilt * len * 0.4, y + len * 0.7,
          x + rx * 0.035 + tilt * len, y + len);
        g.stroke();
      }
    }
    g.restore();
  }

  function blade(g, x, y, len, wide, rot, edge, spine, kind) {
    g.save();
    g.translate(x, y); g.rotate(rot);
    const bow = kind === 'curve' ? wide * 0.9 : 0;
    const belly = kind === 'heavy' ? 1.25 : 1;
    g.beginPath();
    g.moveTo(-wide * 0.55, 0);
    // the edge side, bellying out and running to the point
    g.quadraticCurveTo(wide * belly + bow * 0.4, -len * 0.30,
      wide * 0.82 * belly + bow, -len * 0.66);
    g.quadraticCurveTo(wide * 0.5 + bow * 1.1, -len * 0.90, bow * 1.2, -len);
    // and the spine side, straighter, back down to the guard
    g.quadraticCurveTo(-wide * 0.42 + bow * 0.7, -len * 0.74,
      -wide * 0.62 + bow * 0.2, -len * 0.34);
    g.closePath();
    g.fillStyle = edge; g.fill();
    g.strokeStyle = spine; g.lineWidth = WS.max(0.8, wide * 0.16); g.stroke();
    g.save();
    g.clip();
    // the fuller: a groove, which is a dark line with a light one beside it
    g.strokeStyle = spine;
    g.globalAlpha = 0.55;
    g.lineWidth = WS.max(0.7, wide * 0.24);
    g.beginPath();
    g.moveTo(-wide * 0.05, -len * 0.14);
    g.quadraticCurveTo(bow * 0.4, -len * 0.5, bow * 0.85, -len * 0.82);
    g.stroke();
    // and the edge itself, one bright line where the steel is thinnest
    g.strokeStyle = 'rgba(255,255,255,.7)';
    g.globalAlpha = 0.8;
    g.lineWidth = WS.max(0.6, wide * 0.18);
    g.beginPath();
    g.moveTo(wide * 0.2, -len * 0.06);
    g.quadraticCurveTo(wide * belly + bow * 0.4, -len * 0.30,
      wide * 0.78 * belly + bow, -len * 0.66);
    g.quadraticCurveTo(wide * 0.46 + bow * 1.1, -len * 0.88, bow * 1.2, -len * 0.97);
    g.stroke();
    g.restore();
    /* Held: a guard across the base and a haft below it - but only if
       somebody is holding it. A scythe head is socketed onto a pole and a
       sun's corona is not held by anyone, and on both of those the guard and
       grip showed up as a dark blob floating where the hand would have been. */
    if (kind !== 'curve' && kind !== 'ray') {
      g.fillStyle = spine;
      g.beginPath();
      g.ellipse(0, wide * 0.18, wide * 1.15, wide * 0.42, 0, 0, WS.TAU);
      g.fill();
      g.fillStyle = 'rgba(28,22,18,.85)';
      g.beginPath();
      g.ellipse(0, wide * 1.5, wide * 0.42, wide * 1.15, 0, 0, WS.TAU);
      g.fill();
    }
    g.restore();
  }

  /* ------------------------------------------------------- archetypes ---- */
  // Each draws into a size x size canvas centred on (size/2, size*0.55), with
  // the creature's "footprint" about 0.7 of the canvas so glows have room.
  const CREATURES = {

    /* --- humanoid frames -------------------------------------------------- */
    lampling(g, s, p) {
      // (the frame goes on after the body, below)
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
      /* A LAMPLING IS A LAMP, and it was a smooth egg with a flame on top.
         Panes in a frame, a collar where the glass meets the housing and a
         foot under it - all of which are hard lines, and none of which touch
         the outline. */
      {
        const cx2 = s / 2, cy2 = s * 0.56, u2 = s / 100;
        g.save();
        g.beginPath(); g.ellipse(cx2, cy2, 24 * u2, 27 * u2, 0, 0, WS.TAU); g.clip();
        g.strokeStyle = p.line; g.globalAlpha = 0.45; g.lineWidth = 1.6 * u2;
        for (const dx of [-11, 0, 11]) {
          g.beginPath();
          g.moveTo(cx2 + dx * u2, cy2 - 30 * u2);
          g.quadraticCurveTo(cx2 + dx * 1.2 * u2, cy2, cx2 + dx * u2, cy2 + 30 * u2);
          g.stroke();
        }
        g.globalAlpha = 0.28; g.strokeStyle = p.hi; g.lineWidth = 1.1 * u2;
        for (const dx of [-11, 0, 11]) {
          g.beginPath();
          g.moveTo(cx2 + (dx + 2) * u2, cy2 - 30 * u2);
          g.quadraticCurveTo(cx2 + (dx + 2) * 1.2 * u2, cy2, cx2 + (dx + 2) * u2, cy2 + 30 * u2);
          g.stroke();
        }
        g.globalAlpha = 0.4; g.strokeStyle = p.line; g.lineWidth = 2 * u2;
        for (const dy of [-13, 13]) {
          g.beginPath();
          g.moveTo(cx2 - 26 * u2, cy2 + dy * u2);
          g.quadraticCurveTo(cx2, cy2 + (dy + 3) * u2, cx2 + 26 * u2, cy2 + dy * u2);
          g.stroke();
        }
        g.restore();
      }
    },

    mongrel(g, s, p) {
      /* HUNCHED, and narrow. Half the bestiary was the same three ellipses -
         a round body this wide, an arm blob each side, a head on top - and
         measured on a common grid the mongrel shared 79% of its silhouette
         with the moonwretch, 78% with the bristlekin and 75% with the golem.
         Nothing was wrong with any one of them; they were all the same
         animal. This one is a scavenger: narrow, tall, leaning forward over
         its own feet, with the head thrust out in front of the chest rather
         than balanced on top of it. */
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      legs(g, p, cx, cy + 26 * u, u, [-8, 7], 8, 4.4);
      shaded(g, cx + 2 * u, cy + 6 * u, 15 * u, 22 * u, p, 0.12);  // narrow trunk
      /* Mangy fur down the trunk - every mass on this one was a plain
         gradient fill and nothing else, which measured 36.1% interior
         detail against a 41% average. A scavenger is unkempt; the coat
         should look like it, not like the boar's or the brute's. */
      pelt(g, p, cx + 2 * u, cy + 6 * u, 15 * u, 22 * u, 0.12, 5, 0.5, 0.36);
      // the hunch: a shoulder mass standing proud of the back
      shaded(g, cx + 5 * u, cy - 12 * u, 14 * u, 10 * u, p, 0.3);
      pelt(g, p, cx + 5 * u, cy - 12 * u, 14 * u, 10 * u, 0.3, 4, 0.4, 0.32);
      shaded(g, cx - 16 * u, cy + 4 * u, 6 * u, 14 * u, p, -0.5);  // arms, long
      shaded(g, cx + 17 * u, cy + 2 * u, 6 * u, 14 * u, p, 0.5);
      shaded(g, cx - 10 * u, cy - 17 * u, 12 * u, 10 * u, p, -0.18); // head, forward
      pelt(g, p, cx - 10 * u, cy - 17 * u, 12 * u, 10 * u, -0.18, 4, 0.4, 0.3);
      poly(g, [[cx - 14 * u, cy - 21 * u], [cx - 24 * u, cy - 36 * u],
        [cx - 9 * u, cy - 26 * u]], p.mid, p.line, u);
      poly(g, [[cx - 4 * u, cy - 22 * u], [cx + 4 * u, cy - 36 * u],
        [cx - 1 * u, cy - 25 * u]], p.mid, p.line, u);
      poly(g, [[cx - 19 * u, cy - 15 * u], [cx - 26 * u, cy - 11 * u],
        [cx - 16 * u, cy - 9 * u]], p.hi, p.line, u);              // snout, out front
      eyes(g, cx - 12 * u, cy - 19 * u, 4.5 * u, 1.9 * u, '#ffb347');
      blade(g, cx + 22 * u, cy + 2 * u, 26 * u, 5 * u, 0.5, '#c8ccd8', '#6a7080');
    },

    bandit(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      legs(g, p, cx, cy + 24 * u, u, [-8, 8], 9, 5);
      shaded(g, cx, cy + 4 * u, 18 * u, 24 * u, p);
      // The coat skirt, shaded and cut rather than a flat dark disc laid
      // over the body.
      shaded(g, cx, cy + 12 * u, 19 * u, 12 * u,
        { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow });
      /* Buttons and a lapel. The bandit is a person in a coat and the coat
         had no fastenings on it at all - and a row of buttons is the cheapest
         hard-edged thing a garment can carry. */
      g.save();
      g.beginPath(); g.ellipse(cx, cy + 4 * u, 18 * u, 24 * u, 0, 0, WS.TAU); g.clip();
      g.strokeStyle = p.line; g.globalAlpha = 0.5; g.lineWidth = 1.2 * u;
      g.beginPath();
      g.moveTo(cx - 8 * u, cy - 16 * u);
      g.quadraticCurveTo(cx - 2 * u, cy - 8 * u, cx - 3 * u, cy + 18 * u);
      g.stroke();
      /* The lapel was one fold on one side of a symmetric coat, and the
         skirt below the buttons - the widest, lowest part of the mass - had
         nothing on it at all. Measured at 36.2% interior detail against a
         41% average: a matching fold on the near side, a belt at the waist,
         and a couple of the same creases the skirt would actually gather
         into when a coat this heavy is cinched. */
      g.beginPath();
      g.moveTo(cx + 9 * u, cy - 15 * u);
      g.quadraticCurveTo(cx + 5 * u, cy - 6 * u, cx + 6 * u, cy + 17 * u);
      g.stroke();
      g.lineWidth = 1.6 * u;
      g.beginPath();
      g.moveTo(cx - 16 * u, cy + 8 * u); g.lineTo(cx + 16 * u, cy + 8 * u);
      g.stroke();
      g.lineWidth = 1 * u; g.globalAlpha = 0.34;
      for (const dx of [-9, 9]) {
        g.beginPath();
        g.moveTo(cx + dx * u, cy + 9 * u);
        g.quadraticCurveTo(cx + dx * 1.2 * u, cy + 16 * u, cx + dx * 0.7 * u, cy + 23 * u);
        g.stroke();
      }
      g.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const by = cy + (-10 + i * 7) * u;
        g.fillStyle = p.line;
        g.beginPath(); g.ellipse(cx + 1 * u, by + 0.6 * u, 1.9 * u, 1.7 * u, 0, 0, WS.TAU); g.fill();
        g.fillStyle = p.hi;
        g.beginPath(); g.ellipse(cx + 0.7 * u, by, 1.3 * u, 1.2 * u, 0, 0, WS.TAU); g.fill();
      }
      g.restore();
      shaded(g, cx, cy - 20 * u, 11 * u, 11 * u, { hi: '#d6c2a8', mid: '#b89b7c', lo: '#7a6350', dark: '#5e4b3c', line: '#4a3b2f', glow: '#fff' });
      g.fillStyle = p.mid;                                        // red bandana
      g.beginPath(); g.ellipse(cx, cy - 18 * u, 11.5 * u, 5 * u, 0, WS.PI, WS.TAU); g.fill();
      g.fillStyle = p.lo;
      g.fillRect(cx - 12 * u, cy - 20 * u, 24 * u, 4 * u);
      eyes(g, cx, cy - 22 * u, 4 * u, 1.5 * u, '#fff0d0');
      blade(g, cx + 20 * u, cy + 4 * u, 26 * u, 4 * u, 0.7, '#d7dbe6', '#767c8c');
    },

    brute(g, s, p) {
      /* ONE round mass, wide.
       *
       * Separating the shoulders from the trunk gave each of them its own
       * shaded edge, and two stacked domes with a seam between them read as a
       * cooking pot with a lid on it - which is what this had become. Wide is
       * what tells a brute from a mongrel; ROUND is what made it likeable,
       * and roundness is one continuous surface or it is nothing. The
       * shoulders are a swell in the same body now, not a second body. */
      const cx = s / 2, cy = s * 0.54, u = s / 100;
      legs(g, p, cx, cy + 24 * u, u, [-13, 13], 8, 8);
      shaded(g, cx - 30 * u, cy + 4 * u, 9 * u, 17 * u, p, -0.16);
      shaded(g, cx + 30 * u, cy + 4 * u, 9 * u, 17 * u, p, 0.16);
      // the arms carry the same coat the body does - they were the last bare
      // masses on him and they are a fifth of his area
      for (const dir of [-1, 1]) {
        pelt(g, p, cx + dir * 30 * u, cy + 4 * u, 9 * u, 17 * u, dir * 0.16, 3, 0.3, 0.3);
      }
      shaded(g, cx, cy + 2 * u, 31 * u, 25 * u, p);               // the one mass
      pelt(g, p, cx, cy + 2 * u, 31 * u, 25 * u, 0, 8, 0.4, 0.34);
      /* The shoulders, as a light on the same form rather than a shape on top
         of it: a highlight across the top of the mass, clipped inside it. */
      g.save();
      g.beginPath(); g.ellipse(cx, cy + 2 * u, 31 * u, 25 * u, 0, 0, WS.TAU); g.clip();
      const yoke = g.createRadialGradient(cx, cy - 14 * u, 2 * u, cx, cy - 8 * u, 30 * u);
      yoke.addColorStop(0, 'rgba(255,255,255,.16)');
      yoke.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = yoke;
      g.beginPath(); g.ellipse(cx, cy - 12 * u, 26 * u, 13 * u, 0, 0, WS.TAU); g.fill();
      // and a fold under them, which is where a neckless thing creases
      g.strokeStyle = p.line; g.globalAlpha = 0.28; g.lineWidth = 1.4 * u;
      g.beginPath();
      g.moveTo(cx - 22 * u, cy - 2 * u);
      g.quadraticCurveTo(cx, cy + 4 * u, cx + 22 * u, cy - 2 * u);
      g.stroke();
      /* HIDE, on the one mass - the brute is deliberately one continuous
         surface, so everything here has to be marks ON it rather than shapes
         cutting it up. Old scars across the shoulder, a pale chest, and the
         creases where a fat thing folds at the sides.

         Measured against the bestiary's own interior-detail metric, brute
         came out at 32.8% against an average of 41% - every mark here was
         real but faint, 0.2 to 0.3 alpha on a body that is otherwise one
         smooth gradient, and the belly below the shoulder scars had nothing
         on it at all. Strengthened rather than redrawn, and given two more
         scars low on the gut, where a brute actually takes most of its
         hits. */
      g.globalAlpha = 0.5;
      g.lineWidth = 1.2 * u;
      for (const [x0, y0, x1, y1] of [[-18, -14, -6, -6], [-14, -17, -3, -10],
        [12, -12, 20, -3], [-16, 12, -4, 18], [6, 16, 18, 10]]) {
        g.beginPath();
        g.moveTo(cx + x0 * u, cy + y0 * u);
        g.quadraticCurveTo(cx + (x0 + x1) / 2 * u, cy + (y0 + y1) / 2 * u - 2 * u,
          cx + x1 * u, cy + y1 * u);
        g.stroke();
      }
      /* The side folds were struck as arcs centred outside the body, which
         drew two big circles ON him rather than creases IN him. A fold on a
         round animal is a short comma that follows the surface, not a ring. */
      g.globalAlpha = 0.32;
      for (const dir of [-1, 1]) {
        for (const dy of [2, 10]) {
          g.beginPath();
          g.moveTo(cx + dir * 24 * u, cy + (dy - 4) * u);
          g.quadraticCurveTo(cx + dir * 20 * u, cy + dy * u,
            cx + dir * 23 * u, cy + (dy + 5) * u);
          g.stroke();
        }
      }
      const chest = g.createRadialGradient(cx, cy + 14 * u, 2 * u, cx, cy + 14 * u, 24 * u);
      chest.addColorStop(0, 'rgba(255,238,214,.16)');
      chest.addColorStop(1, 'rgba(255,238,214,0)');
      g.globalAlpha = 1;
      g.fillStyle = chest;
      g.beginPath(); g.ellipse(cx, cy + 14 * u, 19 * u, 12 * u, 0, 0, WS.TAU); g.fill();
      g.restore();
      shaded(g, cx - 31 * u, cy + 19 * u, 9 * u, 8 * u, STONE);   // knuckles down
      shaded(g, cx + 31 * u, cy + 19 * u, 9 * u, 8 * u, STONE);
      shaded(g, cx, cy - 16 * u, 11 * u, 9 * u, p);               // head, sunk in
      g.fillStyle = p.lo; g.fillRect(cx - 12 * u, cy - 18 * u, 24 * u, 4 * u);
      g.save();
      g.strokeStyle = p.line; g.globalAlpha = 0.5; g.lineWidth = 1.2 * u;
      g.beginPath();                                               // the jaw
      g.moveTo(cx - 8 * u, cy - 11 * u);
      g.quadraticCurveTo(cx, cy - 8 * u, cx + 8 * u, cy - 11 * u);
      g.stroke();
      g.globalAlpha = 0.3; g.strokeStyle = p.hi;
      g.beginPath();
      g.moveTo(cx - 8 * u, cy - 12.4 * u);
      g.quadraticCurveTo(cx, cy - 9.4 * u, cx + 8 * u, cy - 12.4 * u);
      g.stroke();
      g.restore();
      eyes(g, cx, cy - 17 * u, 4.5 * u, 1.7 * u, '#ff8f6b');
    },

    gilkin(g, s, p) {
      const cx = s / 2, cy = s * 0.54, u = s / 100;
      // Splayed webbed feet, and the head lifted clear of the shoulders. The
      // head used to overlap the body by half its own height, which merged the
      // two masses into one green pebble.
      legs(g, p, cx, cy + 22 * u, u, [-8, 8], 11, 5);
      /* Head fins fan sideways off the skull, which is where a gilkin's are.
         They used to be long thin triangles rising off the shoulders, and at
         36px that read as two blades of grass growing behind it. */
      for (const dir of [-1, 1]) {
        poly(g, [[cx + dir * 11 * u, cy - 24 * u], [cx + dir * 31 * u, cy - 32 * u],
        [cx + dir * 30 * u, cy - 18 * u], [cx + dir * 12 * u, cy - 17 * u]], p.lo, p.line, u);
        shaded(g, cx + dir * 19 * u, cy + 2 * u, 5 * u, 9 * u, p, dir * 0.3);   // arms
      }
      shaded(g, cx, cy + 2 * u, 17 * u, 20 * u, p);
      shaded(g, cx, cy - 22 * u, 15 * u, 13 * u, p);
      /* A PALE BELLY AND GILLS. The gilkin was two smooth green masses with a
         mouth on it - the kind of shape that has a perfect outline and
         nothing whatever inside it. Every amphibian is darker on top than
         underneath, and that one change does more for the read than any
         amount of shading, because it says which way up the animal is. */
      g.save();
      g.beginPath(); g.ellipse(cx, cy + 2 * u, 17 * u, 20 * u, 0, 0, WS.TAU); g.clip();
      const bel = g.createLinearGradient(0, cy + 2 * u, 0, cy + 22 * u);
      bel.addColorStop(0, 'rgba(255,255,255,0)');
      bel.addColorStop(1, 'rgba(255,255,255,.26)');
      g.fillStyle = bel;
      g.beginPath(); g.ellipse(cx, cy + 10 * u, 11 * u, 14 * u, 0, 0, WS.TAU); g.fill();
      // and the plates across it, which is what a belly like that is made of
      g.strokeStyle = p.line; g.globalAlpha = 0.34; g.lineWidth = 1 * u;
      for (let i = 0; i < 4; i++) {
        const y = cy + (2 + i * 5) * u;
        g.beginPath();
        g.moveTo(cx - 10 * u, y);
        g.quadraticCurveTo(cx, y + 2.4 * u, cx + 10 * u, y);
        g.stroke();
      }
      g.restore();
      /* The dorsal mass - head and back - carried the whole outline and none
         of the texture; every mark on a gilkin lived on the pale belly, so
         the darker two-thirds of the animal stayed a flat green pebble.
         Mottling, the way a real amphibian's back actually varies. */
      g.save();
      g.beginPath(); g.ellipse(cx, cy + 2 * u, 17 * u, 20 * u, 0, 0, WS.TAU); g.clip();
      g.fillStyle = p.dark; g.globalAlpha = 0.3;
      for (const [dx, dy, r] of [[-9, -8, 3.2], [8, -3, 2.6], [-4, 8, 3], [10, 14, 2.4]]) {
        g.beginPath(); g.ellipse(cx + dx * u, cy + dy * u, r * u, r * 0.7 * u, 0, 0, WS.TAU); g.fill();
      }
      g.restore();
      // gill slits, on the side of the neck where they belong
      g.save();
      g.strokeStyle = p.line; g.globalAlpha = 0.6; g.lineWidth = 1.4 * u;
      g.lineCap = 'round';
      for (const dir of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.moveTo(cx + dir * (11 + i * 2.8) * u, cy - 8 * u);
          g.lineTo(cx + dir * (12 + i * 2.8) * u, cy - 1 * u);
          g.stroke();
        }
      }
      g.restore();
      g.fillStyle = p.dark;                                        // wide gormless mouth
      g.beginPath(); g.ellipse(cx, cy - 16 * u, 9 * u, 4.5 * u, 0, 0, WS.PI); g.fill();
      eyes(g, cx, cy - 26 * u, 7 * u, 3 * u, '#e8ffd8');
    },

    necromancer(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      // Sleeves first, so the robe reads as a figure with arms rather than a
      // traffic cone with a face painted on it.
      for (const dir of [-1, 1]) {
        poly(g, [[cx + dir * 10 * u, cy - 16 * u], [cx + dir * 27 * u, cy - 5 * u],
        [cx + dir * 23 * u, cy + 9 * u], [cx + dir * 10 * u, cy - 2 * u]], p.mid, p.line, u);
        // A pale cuff at the wrist. The sleeve in the robe's own shadow tone
        // vanished into it; the cuff is what makes the arm a separate mass.
        shaded(g, cx + dir * 24 * u, cy + 2 * u, 5 * u, 4 * u, p);
      }
      const robe = [[cx - 22 * u, cy + 26 * u], [cx - 12 * u, cy - 22 * u],
        [cx + 12 * u, cy - 22 * u], [cx + 22 * u, cy + 26 * u]];
      poly(g, robe, p.mid, p.line, u);
      /* FOLDS, and a cord at the waist. The necromancer measured the flattest
         thing in the bestiary at 19% - a plain trapezoid of one colour, which
         is a traffic cone however good the hood on top of it is. Cloth hanging
         from a cord gathers, and a gather is a shaded side with a LIT CREST
         beside it and a hard line where the surface turns. The survivors'
         robes were fixed the same way, and there the gradients alone measured
         nothing until the terminator went in. */
      g.save();
      g.beginPath();
      g.moveTo(robe[0][0], robe[0][1]);
      for (let i = 1; i < robe.length; i++) g.lineTo(robe[i][0], robe[i][1]);
      g.closePath(); g.clip();
      for (const k of [-0.68, -0.26, 0.18, 0.62]) {
        const topX = cx + k * 11 * u, botX = cx + k * 21 * u;
        const w0 = 1.4 * u, w1 = (2.6 + 1.4 * Math.abs(k)) * u;
        const grd = g.createLinearGradient(botX - w1, 0, botX + w1, 0);
        grd.addColorStop(0, 'rgba(0,0,0,.30)');
        grd.addColorStop(0.5, 'rgba(0,0,0,.03)');
        grd.addColorStop(0.72, 'rgba(255,255,255,.20)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(topX - w0, cy - 22 * u); g.lineTo(topX + w0, cy - 22 * u);
        g.lineTo(botX + w1, cy + 26 * u); g.lineTo(botX - w1, cy + 26 * u);
        g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 0.9 * u;
        g.beginPath();
        g.moveTo(topX - w0, cy - 22 * u); g.lineTo(botX - w1, cy + 26 * u);
        g.stroke();
      }
      // the cord, knotted at the waist
      g.strokeStyle = p.dark; g.globalAlpha = 0.55; g.lineWidth = 1.4 * u;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - 14 * u, cy - 3 * u);
      g.quadraticCurveTo(cx, cy + 1 * u, cx + 14 * u, cy - 3 * u);
      g.stroke();
      g.strokeStyle = p.hi; g.globalAlpha = 0.22;
      g.beginPath();
      g.moveTo(cx - 14 * u, cy - 4.2 * u);
      g.quadraticCurveTo(cx, cy - 0.2 * u, cx + 14 * u, cy - 4.2 * u);
      g.stroke();
      g.strokeStyle = p.dark; g.globalAlpha = 0.45; g.lineWidth = 1 * u;
      g.beginPath();
      g.moveTo(cx + 3 * u, cy + 0.4 * u); g.lineTo(cx + 5 * u, cy + 9 * u);
      g.stroke();
      g.restore();
      /* A hem, so the robe has a foot instead of dissolving into the ground.
         It was a flat disc of the darkest tone, which on the one creature in
         the bestiary with no interior structure at all was the largest
         unlit shape on the field. */
      shaded(g, cx, cy + 26 * u, 22 * u, 5 * u,
        { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow });
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
      /* A crown of ICE, which means it is lit from inside and its facets do
         not agree with each other. Flat pale-blue triangles with one outline
         read as cut paper - the same fault as everything else in here before
         it was fixed, and on a boss. Rime on the hem to match, because a lich
         that freezes things should be freezing the ground it stands on. */
      g.save();
      g.globalCompositeOperation = 'lighter';
      const cold = g.createRadialGradient(cx, cy - 40 * u, 2 * u, cx, cy - 40 * u, 20 * u);
      cold.addColorStop(0, 'rgba(150,215,255,.30)');
      cold.addColorStop(1, 'rgba(150,215,255,0)');
      g.fillStyle = cold;
      g.beginPath(); g.arc(cx, cy - 40 * u, 20 * u, 0, WS.TAU); g.fill();
      g.restore();
      const spikes = [[-14, -34, -10, -47, -4, -36], [-4, -36, 0, -52, 4, -36],
        [4, -36, 10, -47, 14, -34]];
      for (const [x0, y0, x1, y1, x2, y2] of spikes) {
        // each spike in two facets, one lit and one turned away
        poly(g, [[cx + x0 * u, cy + y0 * u], [cx + x1 * u, cy + y1 * u],
          [cx + (x1 + x2) / 2 * u, cy + (y1 + y2) / 2 * u]], '#cfeaff', '#6fb0da', u * 0.8);
        poly(g, [[cx + (x1 + x2) / 2 * u, cy + (y1 + y2) / 2 * u],
          [cx + x1 * u, cy + y1 * u], [cx + x2 * u, cy + y2 * u]], '#7fb8dd', '#4d8cb4', u * 0.8);
      }
      // the band the spikes stand on
      poly(g, [[cx - 15 * u, cy - 31 * u], [cx + 15 * u, cy - 31 * u],
        [cx + 14 * u, cy - 35 * u], [cx - 14 * u, cy - 35 * u]], '#a9d6f0', '#5e9cc4', u * 0.8);
      /* A HIGH COLLAR, flared behind the hood. lich() draws necromancer() and
         adds to it, so the two shared 88% of a silhouette - a boss that is a
         trash mob in a hat. The collar is the cheapest thing that changes the
         OUTLINE rather than the surface, which is the only kind of change
         that separates two shapes. */
      for (const dir of [-1, 1]) {
        poly(g, [[cx + dir * 6 * u, cy - 28 * u], [cx + dir * 26 * u, cy - 40 * u],
          [cx + dir * 30 * u, cy - 20 * u], [cx + dir * 9 * u, cy - 16 * u]],
          '#8fc4e2', '#4d8cb4', u);
        poly(g, [[cx + dir * 9 * u, cy - 24 * u], [cx + dir * 24 * u, cy - 33 * u],
          [cx + dir * 26 * u, cy - 23 * u], [cx + dir * 11 * u, cy - 18 * u]],
          '#c4e6f8', '#6fb0da', u * 0.8);
      }
      // rime along the hem
      g.save();
      g.globalAlpha = 0.7;
      for (let i = -5; i <= 5; i++) {
        const x = cx + i * 4 * u;
        poly(g, [[x - 1.6 * u, cy + 27 * u], [x, cy + (20 - Math.abs(i) * 0.9) * u],
          [x + 1.6 * u, cy + 27 * u]], 'rgba(200,236,255,.8)', 'rgba(120,180,215,.8)', u * 0.6);
      }
      g.restore();
    },

    warlock(g, s, p) { CREATURES.necromancer(g, s, p); },

    /* MARROWFROST, THE PALE LORD - the last thing in the story, and the one
     * creature here drawn to be looked at rather than recognised at 40px.
     * He used to be the lich with a bigger collar, which is to say a
     * necromancer in a hat; the villain the whole game points at cannot
     * share a silhouette with trash.
     *
     * Read from the outline in: a mantle that flares wider than anything on
     * the field, ice pauldrons that break the shoulder line, a crown taller
     * than his head, a staff that stands above him. Then the story in the
     * details: a stolen ember caged in ice in his chest, and more of it
     * trapped in the crystal on his staff - "every night your kind burns MY
     * ember" is on him before he says it. Fixed colours rather than the
     * palette, because he is not a tint of anything. Deterministic: this is
     * baked lazily mid-run, and drawing from WS.random would move the
     * game's own stream. */
    marrowfrost(g, s, p) {
      const u = s / 100;
      const X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
      const ICE_LIT = '#e8f7ff', ICE_MID = '#9fd0ee', ICE_SHADE = '#5f9cc6', ICE_EDGE = '#2c5a80';
      const ROBE_HI = '#2b4266', ROBE = '#18263f', ROBE_LO = '#0a1120';
      const BONE_HI = '#f1f4f2', BONE = '#c9d2d6', BONE_LO = '#7d8b94';
      const EMBER = '#7cf0a0';

      /** A crystal in two facets, one turned to the light and one away. */
      const crystal = (x, y, w, h, rot) => {
        g.save();
        g.translate(X(x), Y(y)); g.rotate(rot || 0);
        const hw = X(w) / 2, hh = Y(h) / 2;
        poly(g, [[0, -hh], [hw, -hh * 0.15], [0, hh], [0, -hh]], ICE_SHADE, ICE_EDGE, u * 0.7);
        poly(g, [[0, -hh], [-hw, -hh * 0.15], [0, hh], [0, -hh]], ICE_LIT, ICE_EDGE, u * 0.7);
        g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = u * 0.6;
        g.beginPath(); g.moveTo(0, -hh * 0.85); g.lineTo(-hw * 0.45, -hh * 0.1); g.stroke();
        g.restore();
      };
      const glowAt = (x, y, r, rgba) => {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), X(r));
        gr.addColorStop(0, rgba); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(X(x), Y(y), X(r), 0, WS.TAU); g.fill();
        g.restore();
      };

      // 1. the cold he stands in
      glowAt(50, 42, 40, 'rgba(120,190,255,.20)');

      // 2. shards of the Pale, circling behind him
      crystal(14, 36, 6, 15, -0.35);
      crystal(86, 36, 6, 15, 0.35);
      crystal(11, 62, 4.5, 11, -0.6);
      crystal(89, 62, 4.5, 11, 0.6);

      // 3. the mantle: wider than anything on the field, torn at the hem
      const hem = [];
      for (let i = 0; i <= 12; i++) {
        const x = 9 + i * (82 / 12);
        hem.push([x, 90 + (i % 2 ? -4 - hash(i) * 4 : 1.5)]);
      }
      const mantle = [[34, 30], [66, 30], [80, 52], [91, 90]].concat(hem.reverse(), [[20, 52]]);
      g.save();
      const mg = g.createLinearGradient(0, Y(30), 0, Y(92));
      mg.addColorStop(0, ROBE_HI); mg.addColorStop(0.5, ROBE); mg.addColorStop(1, ROBE_LO);
      g.beginPath();
      P(mantle).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fillStyle = mg; g.fill();
      g.clip();
      // folds falling from the shoulders
      for (const [x0, x1] of [[36, 16], [41, 28], [59, 72], [64, 84]]) {
        const fg = g.createLinearGradient(X(x1 - 4), 0, X(x1 + 4), 0);
        fg.addColorStop(0, 'rgba(0,0,0,.35)'); fg.addColorStop(0.6, 'rgba(160,210,255,.10)');
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = fg;
        g.beginPath(); g.moveTo(X(x0 - 1), Y(32)); g.lineTo(X(x0 + 1), Y(32));
        g.lineTo(X(x1 + 4), Y(92)); g.lineTo(X(x1 - 4), Y(92)); g.closePath(); g.fill();
      }
      // rim light down the lit edge: the aurora is behind him
      g.strokeStyle = 'rgba(170,225,255,.55)'; g.lineWidth = u * 1.2;
      g.beginPath(); g.moveTo(X(66), Y(30)); g.lineTo(X(80), Y(52)); g.lineTo(X(91), Y(90)); g.stroke();
      g.restore();
      // rime crusted along the torn hem
      for (let i = 0; i < 14; i++) {
        const x = 12 + i * 5.6, y = 86 - hash(i + 20) * 3;
        poly(g, P([[x - 1.4, y + 3], [x, y - 2 - hash(i) * 3], [x + 1.4, y + 3]]),
          'rgba(210,240,255,.85)', 'rgba(90,150,200,.8)', u * 0.5);
      }

      // 4. the robe in front, and the runes down it
      const robe = [[39, 38], [61, 38], [69, 90], [31, 90]];
      poly(g, P(robe), ROBE, ROBE_LO, u);
      g.save();
      g.beginPath(); P(robe).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath(); g.clip();
      const pg = g.createLinearGradient(X(44), 0, X(56), 0);
      pg.addColorStop(0, '#101a2e'); pg.addColorStop(0.5, '#1f3152'); pg.addColorStop(1, '#101a2e');
      g.fillStyle = pg; g.fillRect(X(44), Y(56), X(12), Y(36));
      g.strokeStyle = 'rgba(150,225,255,.75)'; g.lineWidth = u * 0.7; g.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const y = 66 + i * 5;
        g.beginPath();
        g.moveTo(X(48), Y(y)); g.lineTo(X(50), Y(y - 2)); g.lineTo(X(52), Y(y));
        if (i % 2) { g.moveTo(X(50), Y(y - 2)); g.lineTo(X(50), Y(y + 2)); }
        g.stroke();
      }
      g.restore();
      glowAt(50, 76, 8, 'rgba(120,210,255,.18)');

      // 5. the belt, and a clasp of ice
      poly(g, P([[38, 60], [62, 60], [63, 64], [37, 64]]), '#0c1424', '#050910', u * 0.8);
      crystal(50, 62, 4, 6, 0);

      // 6. the stolen ember, caged in ice in his chest
      glowAt(50, 49, 11, 'rgba(124,240,160,.45)');
      g.save();
      g.fillStyle = EMBER; g.shadowColor = EMBER; g.shadowBlur = X(3);
      g.beginPath();
      g.moveTo(X(50), Y(45)); g.lineTo(X(53), Y(49)); g.lineTo(X(50), Y(53)); g.lineTo(X(47), Y(49));
      g.closePath(); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.beginPath(); g.arc(X(49.4), Y(48), X(0.9), 0, WS.TAU); g.fill();
      g.strokeStyle = 'rgba(200,238,255,.9)'; g.lineWidth = u * 0.8;
      for (const [x0, y0, x1, y1] of [[45, 43, 50, 55], [55, 43, 50, 55], [44, 49, 56, 49], [50, 42, 50, 56]]) {
        g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke();
      }
      g.restore();

      // 7. the staff: black iron, taller than he is, and a crystal full of stolen light
      g.save();
      g.lineCap = 'round';
      g.strokeStyle = '#070b14'; g.lineWidth = u * 3.2;
      g.beginPath(); g.moveTo(X(21), Y(20)); g.lineTo(X(24), Y(93)); g.stroke();
      g.strokeStyle = '#3a4a66'; g.lineWidth = u * 1.1;
      g.beginPath(); g.moveTo(X(20.6), Y(22)); g.lineTo(X(23.4), Y(90)); g.stroke();
      for (const y of [34, 52, 72]) {
        g.strokeStyle = '#9fd0ee'; g.lineWidth = u * 1.2;
        g.beginPath(); g.moveTo(X(19.2), Y(y)); g.lineTo(X(23.8 + (y - 34) * 0.03), Y(y + 1)); g.stroke();
      }
      g.restore();
      // the prongs that hold the crystal
      g.strokeStyle = '#0a0f1a'; g.lineWidth = u * 1.6; g.lineCap = 'round';
      for (const d of [-1, 1]) {
        g.beginPath(); g.moveTo(X(21), Y(21)); g.quadraticCurveTo(X(21 + d * 6), Y(17), X(21 + d * 3.5), Y(9)); g.stroke();
      }
      glowAt(21, 13, 11, 'rgba(124,240,160,.40)');
      crystal(21, 13, 8, 15, 0.08);
      g.save();
      g.fillStyle = EMBER; g.shadowColor = EMBER; g.shadowBlur = X(2.5);
      g.beginPath(); g.arc(X(21), Y(14), X(1.6), 0, WS.TAU); g.fill();
      g.restore();

      // 8. arms: the near one down the staff, the far one raised and trailing frost
      poly(g, P([[37, 36], [31, 40], [24, 55], [28, 58], [36, 46]]), ROBE_HI, ROBE_LO, u);
      poly(g, P([[63, 36], [70, 38], [80, 47], [77, 51], [67, 45]]), ROBE_HI, ROBE_LO, u);
      // hands of bone
      g.save();
      g.strokeStyle = BONE; g.lineCap = 'round'; g.lineWidth = u * 1.3;
      for (let i = 0; i < 4; i++) {                 // gripping the staff
        g.beginPath(); g.moveTo(X(26), Y(55 + i * 1.3)); g.lineTo(X(21.5), Y(56.5 + i * 1.3)); g.stroke();
      }
      // open and raised: four long jointed fingers, not a glove
      g.lineWidth = u * 0.75;
      for (let i = 0; i < 4; i++) {
        const a = -1.35 + i * 0.3;
        const k1x = 80 + Math.cos(a) * 3.4, k1y = 48 + Math.sin(a) * 3.4;
        const a2 = a - 0.35;
        const tx = k1x + Math.cos(a2) * 3.6, ty = k1y + Math.sin(a2) * 3.6;
        g.strokeStyle = BONE;
        g.beginPath(); g.moveTo(X(80), Y(48)); g.lineTo(X(k1x), Y(k1y)); g.lineTo(X(tx), Y(ty)); g.stroke();
        g.fillStyle = BONE_HI;
        g.beginPath(); g.arc(X(k1x), Y(k1y), X(0.55), 0, WS.TAU); g.fill();
      }
      g.lineWidth = u * 0.9; g.strokeStyle = BONE;
      g.beginPath(); g.moveTo(X(78), Y(50)); g.lineTo(X(80.5), Y(47.5)); g.stroke();
      g.restore();
      // frost wisps off the raised hand
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(170,225,255,.55)'; g.lineWidth = u * 0.9; g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.moveTo(X(82 + i), Y(42 - i * 2));
        g.bezierCurveTo(X(86 + i * 2), Y(36 - i * 3), X(80 + i), Y(32 - i * 2), X(85 + i * 2), Y(26 - i * 3));
        g.stroke();
      }
      g.restore();

      // 9. pauldrons of ice, breaking the shoulder line
      for (const d of [-1, 1]) {
        const bx = 50 + d * 15, by = 33;
        poly(g, P([[bx - 7, by + 4], [bx + 7, by + 4], [bx + d * 9, by - 2], [bx - d * 2, by - 4]]),
          ICE_MID, ICE_EDGE, u * 0.8);
        crystal(bx + d * 6, by - 6, 4, 11, d * 0.55);
        crystal(bx + d * 11, by - 2, 3.5, 9, d * 1.0);
        crystal(bx + d * 1, by - 7, 3, 8, d * 0.2);
      }

      // 10. the hood, and the skull in it
      g.save();
      const hg = g.createRadialGradient(X(50), Y(26), X(2), X(50), Y(29), X(14));
      hg.addColorStop(0, '#05080f'); hg.addColorStop(0.7, ROBE); hg.addColorStop(1, ROBE_HI);
      g.fillStyle = hg;
      g.beginPath();
      g.moveTo(X(38), Y(38)); g.quadraticCurveTo(X(37), Y(18), X(50), Y(16));
      g.quadraticCurveTo(X(63), Y(18), X(62), Y(38)); g.closePath(); g.fill();
      // rime along the hood's edge
      g.strokeStyle = 'rgba(190,232,255,.6)'; g.lineWidth = u * 0.8;
      g.beginPath(); g.moveTo(X(38.6), Y(37)); g.quadraticCurveTo(X(37.8), Y(18.8), X(50), Y(16.8));
      g.quadraticCurveTo(X(62.2), Y(18.8), X(61.4), Y(37)); g.stroke();
      g.restore();
      // the skull: long, narrow at the jaw, and in the hood's shadow
      g.save();
      const sg = g.createLinearGradient(0, Y(21), 0, Y(37));
      sg.addColorStop(0, BONE_HI); sg.addColorStop(0.55, BONE); sg.addColorStop(1, BONE_LO);
      g.fillStyle = sg;
      g.beginPath();
      g.moveTo(X(44), Y(27)); g.quadraticCurveTo(X(44), Y(21), X(50), Y(21));
      g.quadraticCurveTo(X(56), Y(21), X(56), Y(27));
      g.quadraticCurveTo(X(56), Y(32), X(53.5), Y(34.5)); g.lineTo(X(52.5), Y(37));
      g.lineTo(X(47.5), Y(37)); g.lineTo(X(46.5), Y(34.5));
      g.quadraticCurveTo(X(44), Y(32), X(44), Y(27)); g.closePath(); g.fill();
      // the hood's shadow across the top of it
      const hs = g.createLinearGradient(0, Y(21), 0, Y(27));
      hs.addColorStop(0, 'rgba(5,8,15,.75)'); hs.addColorStop(1, 'rgba(5,8,15,0)');
      g.fillStyle = hs; g.fillRect(X(43), Y(20), X(14), Y(7));
      g.restore();
      // a heavy brow, hollow cheeks, a crack through the temple
      g.strokeStyle = 'rgba(12,18,28,.8)'; g.lineWidth = u * 0.9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(45.2), Y(26.6)); g.lineTo(X(48.8), Y(27.6)); g.stroke();
      g.beginPath(); g.moveTo(X(54.8), Y(26.6)); g.lineTo(X(51.2), Y(27.6)); g.stroke();
      g.fillStyle = 'rgba(20,28,40,.6)';
      g.beginPath(); g.ellipse(X(46.2), Y(32.2), X(1.1), X(2.2), 0.25, 0, WS.TAU); g.fill();
      g.beginPath(); g.ellipse(X(53.8), Y(32.2), X(1.1), X(2.2), -0.25, 0, WS.TAU); g.fill();
      g.strokeStyle = 'rgba(20,28,40,.7)'; g.lineWidth = u * 0.45;
      g.beginPath(); g.moveTo(X(54.5), Y(22.5)); g.lineTo(X(53.2), Y(24.6)); g.lineTo(X(54), Y(26)); g.stroke();
      g.fillStyle = '#0c1018';
      g.beginPath(); g.moveTo(X(50), Y(31)); g.lineTo(X(48.8), Y(33.6)); g.lineTo(X(51.2), Y(33.6)); g.closePath(); g.fill();
      g.strokeStyle = '#2a3036'; g.lineWidth = u * 0.6;
      for (let i = -2; i <= 2; i++) {
        g.beginPath(); g.moveTo(X(50 + i * 1.3), Y(35)); g.lineTo(X(50 + i * 1.3), Y(36.6)); g.stroke();
      }
      eyes(g, X(50), Y(29), X(2.7), X(1.15), '#bfeaff');
      // the beard: icicles hanging from the jaw
      for (let i = 0; i < 5; i++) {
        const x = 46.4 + i * 1.8, len = 4 + (i === 2 ? 4 : hash(i + 7) * 3);
        poly(g, P([[x - 0.8, 36.8], [x + 0.8, 36.8], [x, 36.8 + len]]), ICE_LIT, ICE_SHADE, u * 0.5);
      }

      // 11. the crown: taller than his head, and lit from inside
      glowAt(50, 14, 14, 'rgba(160,220,255,.35)');
      const spikes = [[-9, 7], [-6, 10], [-3, 14], [0, 18], [3, 14], [6, 10], [9, 7]];
      for (const [dx, h] of spikes) {
        const x = 50 + dx;
        poly(g, P([[x - 1.6, 21], [x, 21 - h], [x, 21]]), ICE_LIT, ICE_EDGE, u * 0.6);
        poly(g, P([[x, 21 - h], [x + 1.6, 21], [x, 21]]), ICE_SHADE, ICE_EDGE, u * 0.6);
      }
      poly(g, P([[39.5, 20], [60.5, 20], [59.5, 23.4], [40.5, 23.4]]), ICE_MID, ICE_EDGE, u * 0.7);
      g.save();
      g.fillStyle = EMBER; g.shadowColor = EMBER; g.shadowBlur = X(2);
      g.beginPath(); g.arc(X(50), Y(21.7), X(1.1), 0, WS.TAU); g.fill();
      g.restore();

      // 12. snow in the air round him
      g.fillStyle = 'rgba(235,246,255,.85)';
      for (let i = 0; i < 16; i++) {
        const side = i % 2 ? 1 : -1;
        const x = 50 + side * (32 + hash(i + 40) * 14), y = 8 + hash(i + 80) * 60;
        g.beginPath(); g.arc(X(x), Y(y), X(0.4 + hash(i) * 0.3), 0, WS.TAU); g.fill();
      }
    },

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
      /* Almost the whole rig here is bone-thin strokes, which the interior-
         detail metric barely sees - it wants luminance change between
         neighbouring FILLED pixels, and a 4px-wide rib gives it almost none
         to work with. The skull is the one real mass, so the nasal cavity
         and a hairline crack go here rather than on more bones. */
      g.fillStyle = '#101018';
      g.beginPath(); g.moveTo(cx, cy - 16 * u); g.lineTo(cx - 2 * u, cy - 12 * u);
      g.lineTo(cx + 2 * u, cy - 12 * u); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 0.9 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - 7 * u, cy - 27 * u); g.quadraticCurveTo(cx - 3 * u, cy - 22 * u, cx - 5 * u, cy - 16 * u); g.stroke();
      g.beginPath(); g.ellipse(cx - 4 * u, cy - 21 * u, 3 * u, 3.6 * u, 0, 0, WS.TAU); g.fill();
      g.beginPath(); g.ellipse(cx + 4 * u, cy - 21 * u, 3 * u, 3.6 * u, 0, 0, WS.TAU); g.fill();
      eyes(g, cx, cy - 21 * u, 4 * u, 1.5 * u, '#8fe6ff');
      g.fillStyle = p.lo; g.fillRect(cx - 5 * u, cy - 13 * u, 10 * u, 3 * u);
      blade(g, cx + 24 * u, cy + 6 * u, 30 * u, 5 * u, 0.6, '#b9c0cc', '#5c6270');
    },

    ghoul(g, s, p) {
      const cx = s / 2, cy = s * 0.60, u = s / 100;
      shaded(g, cx + 3 * u, cy + 4 * u, 21 * u, 22 * u, p, 0.18);  // lopsided
      /* THE DRAGGING ARM, as a limb rather than an ellipse.
         A rotated oval beside the body traces its own pointed outline and
         reads as a leaf stuck to the ghoul's side - which is what this was.
         An arm is wide at the shoulder and narrow at the wrist, it comes OUT
         of the mass rather than sitting next to it, and there is a hand on
         the end of it. */
      poly(g, [
        [cx - 9 * u, cy - 6 * u], [cx - 16 * u, cy - 4 * u],
        [cx - 21 * u, cy + 16 * u], [cx - 16 * u, cy + 18 * u],
        [cx - 13 * u, cy + 2 * u],
      ], p.lo, p.line, u);
      shaded(g, cx - 19 * u, cy + 18 * u, 4.5 * u, 4 * u, p);
      for (const k of [-1, 0, 1]) {
        poly(g, [
          [cx + (-20 + k * 2.6) * u, cy + 20 * u],
          [cx + (-20.5 + k * 3.4) * u, cy + 27 * u],
          [cx + (-18.4 + k * 2.6) * u, cy + 20 * u],
        ], p.hi, p.line, u * 0.8);
      }
      /* RIBS. A rotting thing should be coming apart, and the ghoul was as
         smooth and whole as an apple. Four bones showing through the hide and
         a hollow where the belly has gone - two marks, and it stops being a
         green pebble and starts being a corpse that is still walking. */
      g.save();
      g.beginPath(); g.ellipse(cx + 3 * u, cy + 4 * u, 21 * u, 22 * u, 0.18, 0, WS.TAU); g.clip();
      const hollow = g.createRadialGradient(cx + 4 * u, cy + 12 * u, 1 * u,
        cx + 4 * u, cy + 12 * u, 13 * u);
      hollow.addColorStop(0, 'rgba(18,10,8,.62)');
      hollow.addColorStop(1, 'rgba(18,10,8,0)');
      g.fillStyle = hollow;
      g.beginPath(); g.ellipse(cx + 4 * u, cy + 12 * u, 13 * u, 11 * u, 0, 0, WS.TAU); g.fill();
      g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const y = cy + (-8 + i * 5) * u, w = (13 - i * 1.2) * u;
        g.strokeStyle = 'rgba(20,14,10,.5)'; g.lineWidth = 2.6 * u;
        g.beginPath();
        g.moveTo(cx + 3 * u - w, y);
        g.quadraticCurveTo(cx + 3 * u, y + 4 * u, cx + 3 * u + w, y);
        g.stroke();
        g.strokeStyle = 'rgba(232,226,204,.5)'; g.lineWidth = 1.5 * u;
        g.beginPath();
        g.moveTo(cx + 3 * u - w, y - 0.8 * u);
        g.quadraticCurveTo(cx + 3 * u, y + 3.2 * u, cx + 3 * u + w, y - 0.8 * u);
        g.stroke();
      }
      g.restore();
      shaded(g, cx - 2 * u, cy - 18 * u, 12 * u, 11 * u, p, -0.25);
      g.fillStyle = '#2a1414';                                     // hanging jaw
      g.beginPath(); g.ellipse(cx - 2 * u, cy - 10 * u, 6 * u, 5 * u, 0, 0, WS.TAU); g.fill();
      eyes(g, cx - 2 * u, cy - 21 * u, 4 * u, 1.8 * u, '#d9ff7a');
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
      /* Wrappings. A geist is a bound thing and this was a smooth pale ball -
         the cloth it is wound in is the whole of what it wears. */
      g.save();
      g.beginPath(); g.ellipse(cx, cy, 15 * u, 14 * u, 0, 0, WS.TAU); g.clip();
      g.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const y = cy + (-10 + i * 5.5) * u;
        g.strokeStyle = p.line; g.globalAlpha = 0.4; g.lineWidth = 1.4 * u;
        g.beginPath();
        g.moveTo(cx - 17 * u, y);
        g.quadraticCurveTo(cx, y + 2.6 * u, cx + 17 * u, y - 1 * u);
        g.stroke();
        g.strokeStyle = p.hi; g.globalAlpha = 0.24; g.lineWidth = 1.1 * u;
        g.beginPath();
        g.moveTo(cx - 17 * u, y + 1.8 * u);
        g.quadraticCurveTo(cx, y + 4.4 * u, cx + 17 * u, y + 0.8 * u);
        g.stroke();
      }
      g.restore();
      g.fillStyle = '#141a20';                                     // stitched mask
      g.fillRect(cx - 11 * u, cy - 19 * u, 22 * u, 6 * u);
      g.save();                                                    // and its stitches
      g.strokeStyle = 'rgba(214,222,232,.7)'; g.lineWidth = 0.9 * u;
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.moveTo(cx + i * 3 * u - 1.2 * u, cy - 19 * u);
        g.lineTo(cx + i * 3 * u + 1.2 * u, cy - 13 * u);
        g.stroke();
      }
      g.restore();
      eyes(g, cx, cy - 16 * u, 4.5 * u, 1.8 * u, '#9ff5ff');
    },

    abomination(g, s, p) {
      /* Its own shape, with ONE asymmetry rather than a rebuild.
       *
       * This is the second thing in this pass where the distinctness metric
       * drove the drawing and the drawing lost. It measured 78% the same
       * silhouette as the brute, so it was made lopsided, then tall and
       * narrow to get further from the brute again - and a tall trunk
       * swallowed its head, leaving an egg with eyes on top, and a hump the
       * size of the head beside the head read as two heads. Every version
       * scored better than this one and every version looked worse.
       *
       * So: the mass it always had, the sagging head it always had, and the
       * near arm left bigger than the far one - which is true of a thing
       * stitched together out of parts and costs the drawing nothing. The
       * brute pair is reported honestly below instead of being engineered
       * away. */
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      shaded(g, cx, cy + 6 * u, 30 * u, 28 * u, p);
      /* STITCHES, not bars. Five hard full-length lines at even spacing read
         as a cage laid over the creature; a seam is a thread that crosses a
         join, so it is short, it is crossed, and it only runs where two
         pieces meet. */
      g.save();
      g.beginPath(); g.ellipse(cx, cy + 6 * u, 30 * u, 28 * u, 0, 0, WS.TAU); g.clip();
      g.strokeStyle = p.dark; g.globalAlpha = 0.55; g.lineCap = 'round';
      /* Measured at 33.8% interior detail against a 41% average, and the
         three stitches - real as they are - left the outer third of the
         mass on either side bare: a seam close to each rim, at -27 and +27,
         costs nothing the first three did not already pay for. */
      for (const [sx, sy, ex, ey] of [[-16, -10, -13, 20], [2, -14, 6, 16],
        [17, -6, 13, 22], [-27, -2, -24, 18], [26, -8, 24, 16]]) {
        g.lineWidth = 1.4 * u;
        g.beginPath();
        g.moveTo(cx + sx * u, cy + sy * u);
        g.quadraticCurveTo(cx + (sx + ex) / 2 * u + 2 * u, cy + (sy + ey) / 2 * u,
          cx + ex * u, cy + ey * u);
        g.stroke();
        g.lineWidth = 1.1 * u;
        const n = 6;
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const mx = cx + (sx + (ex - sx) * t) * u + 2 * u * (1 - Math.abs(t - 0.5) * 2);
          const my = cy + (sy + (ey - sy) * t) * u;
          g.beginPath();
          g.moveTo(mx - 2.6 * u, my - 1.6 * u);
          g.lineTo(mx + 2.6 * u, my + 1.6 * u);
          g.stroke();
        }
      }
      g.restore();
      shaded(g, cx - 29 * u, cy - 1 * u, 8 * u, 14 * u, p, -0.35);  // the small arm
      shaded(g, cx + 31 * u, cy + 1 * u, 12 * u, 19 * u, p, 0.32);  // and the heavy one
      blade(g, cx + 19 * u, cy + 6 * u, 30 * u, 8 * u, 0.75, '#aeb6c4', '#5a6070', 'heavy');
      shaded(g, cx - 4 * u, cy - 24 * u, 13 * u, 11 * u, p, -0.2); // sagging head
      // the head is stitched on too - it's a part like any other
      g.strokeStyle = p.dark; g.globalAlpha = 0.5; g.lineCap = 'round'; g.lineWidth = 1.2 * u;
      g.beginPath(); g.moveTo(cx - 12 * u, cy - 30 * u); g.lineTo(cx - 8 * u, cy - 18 * u); g.stroke();
      for (const t of [0.25, 0.5, 0.75]) {
        const mx = cx - 12 * u + 4 * t * u, my = cy - 30 * u + 12 * t * u;
        g.beginPath(); g.moveTo(mx - 2 * u, my - 1.3 * u); g.lineTo(mx + 2 * u, my + 1.3 * u); g.stroke();
      }
      g.globalAlpha = 1;
      eyes(g, cx - 4 * u, cy - 25 * u, 5 * u, 2 * u, '#bfff6b');
    },

    wraith(g, s, p) {
      /* A shroud with something in it, rather than a teardrop with two dots.
         The shape was right - it fades out at the hem, which is the whole
         idea - and it had nothing else at all: no folds, no hands, no light
         in the hood. This is a boss. */
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      const shroud = () => {
        g.beginPath();
        g.moveTo(cx - 20 * u, cy + 30 * u);
        g.quadraticCurveTo(cx - 24 * u, cy - 22 * u, cx, cy - 36 * u);
        g.quadraticCurveTo(cx + 24 * u, cy - 22 * u, cx + 20 * u, cy + 30 * u);
        g.quadraticCurveTo(cx, cy + 18 * u, cx - 20 * u, cy + 30 * u);
      };
      g.save();
      const grd = g.createLinearGradient(0, cy - 34 * u, 0, cy + 30 * u);
      grd.addColorStop(0, p.hi); grd.addColorStop(0.6, p.mid); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      shroud();
      g.fill();
      /* folds down the cloth, gathering toward the hood.
         Measured at 34.1% interior detail against a 41% average - every one
         of these four was real cloth, not a flat fill, but 0.16 to 0.26
         alpha on top of the shroud's own soft gradient left the fold nearly
         as smooth as the fabric around it. Darkened, and a fifth fold added
         where the widest gap between the first four left the hem bare. */
      g.save();
      shroud(); g.clip();
      for (const k of [-0.62, -0.32, -0.04, 0.24, 0.66]) {
        const tx = cx + k * 8 * u, bx = cx + k * 19 * u;
        const w = (2 + 1.4 * Math.abs(k)) * u;
        const fg = g.createLinearGradient(bx - w, 0, bx + w, 0);
        fg.addColorStop(0, 'rgba(0,0,0,.42)');
        fg.addColorStop(0.55, 'rgba(0,0,0,0)');
        fg.addColorStop(0.78, 'rgba(255,255,255,.28)');
        fg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = fg;
        g.beginPath();
        g.moveTo(tx - u, cy - 30 * u); g.lineTo(tx + u, cy - 30 * u);
        g.lineTo(bx + w, cy + 30 * u); g.lineTo(bx - w, cy + 30 * u);
        g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 0.9 * u;
        g.beginPath();
        g.moveTo(tx - u, cy - 30 * u); g.lineTo(bx - w, cy + 30 * u);
        g.stroke();
      }
      g.restore();
      g.restore();
      // bone hands, out of the sleeves
      for (const dir of [-1, 1]) {
        g.save();
        g.globalAlpha = 0.9;
        poly(g, [[cx + dir * 13 * u, cy - 4 * u], [cx + dir * 22 * u, cy + 2 * u],
          [cx + dir * 20 * u, cy + 9 * u], [cx + dir * 12 * u, cy + 4 * u]],
          'rgba(222,228,238,.85)', 'rgba(120,132,150,.9)', u);
        for (let k = 0; k < 3; k++) {
          poly(g, [
            [cx + dir * (20 + k * 1.2) * u, cy + (2 + k * 2.2) * u],
            [cx + dir * (27 + k * 0.6) * u, cy + (5 + k * 2.6) * u],
            [cx + dir * (20 + k * 1.2) * u, cy + (5 + k * 2.2) * u],
          ], 'rgba(232,238,248,.9)', 'rgba(120,132,150,.8)', u * 0.7);
        }
        g.restore();
      }
      // the hood, and the cold inside it
      g.fillStyle = 'rgba(6,8,14,.85)';
      g.beginPath(); g.ellipse(cx, cy - 20 * u, 9 * u, 11 * u, 0, 0, WS.TAU); g.fill();
      g.save();
      g.globalCompositeOperation = 'lighter';
      const halo = g.createRadialGradient(cx, cy - 20 * u, 1 * u, cx, cy - 20 * u, 13 * u);
      halo.addColorStop(0, 'rgba(150,200,255,.30)');
      halo.addColorStop(1, 'rgba(150,200,255,0)');
      g.fillStyle = halo;
      g.beginPath(); g.arc(cx, cy - 20 * u, 13 * u, 0, WS.TAU); g.fill();
      g.restore();
      eyes(g, cx, cy - 21 * u, 4 * u, 2.2 * u, '#cfe6ff');
    },

    reaper(g, s, p) {
      /* Death Itself, and its scythe was two strokes and a circle.
         A constant-width line from hip to head with a second line curling off
         the top is not a scythe, it is a diagram of one - and the "aura" was
         a plain stroked circle sitting on top of the art like a compass mark.
         A scythe is a HAFT somebody holds and a BLADE that sweeps, and an
         aura is light, which means it has no edge at all. */
      const cx = s / 2, cy = s * 0.56, u = s / 100;
      // the aura first, behind everything
      g.save();
      g.globalCompositeOperation = 'lighter';
      const aur = g.createRadialGradient(cx, cy, 20 * u, cx, cy, 48 * u);
      aur.addColorStop(0, 'rgba(120,190,255,0)');
      aur.addColorStop(0.55, 'rgba(120,190,255,.07)');
      aur.addColorStop(0.8, 'rgba(180,225,255,.12)');
      aur.addColorStop(0.93, 'rgba(150,205,255,.05)');
      aur.addColorStop(1, 'rgba(120,190,255,0)');
      g.fillStyle = aur;
      g.beginPath(); g.arc(cx, cy, 48 * u, 0, WS.TAU); g.fill();
      g.restore();
      CREATURES.wraith(g, s, p);
      // the haft: bone, tapering, bound where the hand closes on it
      const bx = cx + 25 * u, by = cy + 33 * u, tx = cx + 33 * u, ty = cy - 38 * u;
      g.save();
      g.lineCap = 'round';
      const haft = g.createLinearGradient(bx, by, tx, ty);
      haft.addColorStop(0, '#8d94a4');
      haft.addColorStop(0.45, '#dfe5f0');
      haft.addColorStop(1, '#9aa2b2');
      g.strokeStyle = haft; g.lineWidth = 3.2 * u;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.stroke();
      const dx = tx - bx, dy = ty - by, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * 1.8 * u, ny = dx / len * 1.8 * u;
      g.strokeStyle = 'rgba(40,50,66,.8)'; g.lineWidth = 0.9 * u;
      for (const t of [0.44, 0.50, 0.56, 0.62]) {
        const mx = bx + dx * t, my = by + dy * t;
        g.beginPath(); g.moveTo(mx - nx, my - ny); g.lineTo(mx + nx, my + ny); g.stroke();
      }
      g.restore();
      // and the blade, sweeping back over the hood
      blade(g, tx, ty, 40 * u, 7 * u, -1.72, '#eef6ff', '#6d7a8e', 'curve');
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(170,220,255,.5)'; g.lineWidth = 1.4 * u;
      g.beginPath();
      g.moveTo(tx, ty);
      g.quadraticCurveTo(cx + 2 * u, cy - 54 * u, cx - 10 * u, cy - 30 * u);
      g.stroke();
      g.restore();
    },

    sovereign(g, s, p) {
      /* Aethelgard: a black sun. The idea was right and the execution was a
         flat disc with eight identical spikes stuck round it at even spacing -
         which is a compass rose. A corona is not regular, a star's limb is
         darker than its middle, and the thing that makes an eclipse an
         eclipse is the ring of light escaping round the edge. */
      const cx = s / 2, cy = s * 0.55, u = s / 100;
      /* R was 44u with 22u spears on top of it, reaching 66u from the centre
         of a canvas that is 50u to the edge - so Aethelgard has been drawn
         with its corona sheared off since the day it was made, and nothing
         was measuring the bosses. Sized to fit, and the loss of presence is
         bought back with spriteScale on the boss rather than by drawing
         outside the frame. */
      const R = 30 * u;
      // the corona, behind: long and short spears at uneven angles
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * WS.TAU + 0.18 + (i % 3) * 0.05;
        const long = i % 3 === 0;
        blade(g, cx + WS.cos(a) * R * 0.96, cy + WS.sin(a) * R * 0.96,
          (long ? 14 : 9) * u, (long ? 3.4 : 2.4) * u, a + WS.PI / 2,
          '#ffd98f', '#a97c2f', 'ray');
      }
      g.save();
      g.globalCompositeOperation = 'lighter';
      const flare = g.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.42);
      flare.addColorStop(0, 'rgba(255,214,140,.30)');
      flare.addColorStop(0.35, 'rgba(255,190,110,.13)');
      flare.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = flare;
      g.beginPath(); g.arc(cx, cy, R * 1.42, 0, WS.TAU); g.fill();
      g.restore();
      // the disc, dark and limb-darkened
      g.save();
      const grd = g.createRadialGradient(cx - R * 0.2, cy - R * 0.24, 4 * u, cx, cy, R);
      grd.addColorStop(0, '#2c1d4a');
      grd.addColorStop(0.62, '#221545');
      grd.addColorStop(1, '#0b0718');
      g.fillStyle = grd;
      g.beginPath(); g.arc(cx, cy, R, 0, WS.TAU); g.fill();
      g.restore();
      // the ring of light escaping round the edge - brightest at one side,
      // because a light behind a disc is never centred on it
      g.save();
      g.globalCompositeOperation = 'lighter';
      const ring = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      ring.addColorStop(0, 'rgba(255,246,214,.95)');
      ring.addColorStop(0.5, 'rgba(255,214,140,.55)');
      ring.addColorStop(1, 'rgba(255,196,110,.28)');
      g.strokeStyle = ring;
      g.lineWidth = 2.6 * u;
      g.beginPath(); g.arc(cx, cy, R - 1.2 * u, 0, WS.TAU); g.stroke();
      g.lineWidth = 6 * u;
      g.globalAlpha = 0.28;
      g.beginPath(); g.arc(cx, cy, R - 2.4 * u, 0, WS.TAU); g.stroke();
      g.restore();
      /* FISSURES: light escaping through the crust, not just at the rim.
         The disc between the face and the ring was a smooth radial fill and
         nothing else - the last boss in the game measured 29% interior
         detail against a bestiary averaging 41%, because a gradient reads as
         nothing and this whole file exists on the premise that an EDGE is
         what separates a drawing from a blob. Four cracks, uneven in length,
         angle and curve - a shattered thing does not break symmetrically,
         which is the same argument the corona already makes with its spears. */
      g.save();
      g.beginPath(); g.arc(cx, cy, R, 0, WS.TAU); g.clip();
      const fissures = [
        { a: 0.85, len: 0.86, bow: 2.5 },
        { a: 2.55, len: 0.62, bow: -1.8 },
        { a: 3.95, len: 0.95, bow: 2.2 },
        { a: 5.35, len: 0.70, bow: -2.6 },
      ];
      for (const f of fissures) {
        /* Starting past the face, not at it - anchored right against the
           eyes the first attempt read as antennae sprouting off an insect,
           which is a worse silhouette than the blank disc it replaced. */
        const x1 = cx + WS.cos(f.a) * 13 * u, y1 = cy - 2 * u + WS.sin(f.a) * 13 * u;
        const x2 = cx + WS.cos(f.a) * R * f.len, y2 = cy - 2 * u + WS.sin(f.a) * R * f.len;
        const mx = (x1 + x2) / 2 + WS.cos(f.a + WS.PI / 2) * f.bow * u;
        const my = (y1 + y2) / 2 + WS.sin(f.a + WS.PI / 2) * f.bow * u;
        /* A groove first, in the disc's own darkest tone - a fissure has
           depth before it has light in it, and a bright line laid straight
           onto the gradient fill was one soft edge, not two. Thin, though:
           wide enough to darken and no wider, because a groove bold enough
           to read on its own stops being the setting for the light and
           becomes the drawing. */
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = 'rgba(5,3,12,.55)';
        g.lineWidth = 1.7 * u;
        g.beginPath();
        g.moveTo(x1, y1);
        g.quadraticCurveTo(mx, my, x2, y2);
        g.stroke();
        // And the light escaping through it, narrower than the groove so the
        // dark lip on either side of it stays an edge and not a blend.
        g.globalCompositeOperation = 'lighter';
        const glow = g.createLinearGradient(x1, y1, x2, y2);
        glow.addColorStop(0, 'rgba(255,236,195,.9)');
        glow.addColorStop(0.55, 'rgba(255,205,135,.5)');
        glow.addColorStop(1, 'rgba(255,190,110,0)');
        g.strokeStyle = glow;
        g.lineWidth = 0.9 * u;
        g.beginPath();
        g.moveTo(x1, y1);
        g.quadraticCurveTo(mx, my, x2, y2);
        g.stroke();
      }
      g.restore();
      // and the face inside it
      g.fillStyle = '#07040f';
      g.beginPath(); g.ellipse(cx, cy - 2 * u, 10 * u, 12 * u, 0, 0, WS.TAU); g.fill();
      g.save();
      g.globalAlpha = 0.5;
      g.strokeStyle = '#ffe6ae'; g.lineWidth = 1 * u;
      g.beginPath(); g.ellipse(cx, cy - 2 * u, 10 * u, 12 * u, 0, 0, WS.TAU); g.stroke();
      g.restore();
      /* A SEAM OF LIGHT, and nothing else.
         The first attempt put a crown of short strokes above the eyes and a
         curve below them, meaning to read as radiance and a mouth. They read
         as eyelashes and a grin: the last boss in the game came out smiling.
         What is left is one crack of light down the middle of the void, which
         says there is something burning behind the face without giving it an
         expression. */
      g.save();
      g.beginPath(); g.ellipse(cx, cy - 2 * u, 10 * u, 12 * u, 0, 0, WS.TAU); g.clip();
      g.globalCompositeOperation = 'lighter';
      const seam = g.createLinearGradient(cx, cy - 20 * u, cx, cy + 14 * u);
      seam.addColorStop(0, 'rgba(255,240,200,0)');
      seam.addColorStop(0.35, 'rgba(255,232,180,.55)');
      seam.addColorStop(1, 'rgba(255,214,140,0)');
      g.strokeStyle = seam;
      g.lineWidth = 1.3 * u;
      g.beginPath();
      g.moveTo(cx - 0.6 * u, cy - 20 * u);
      g.quadraticCurveTo(cx + 1.4 * u, cy - 6 * u, cx - 0.4 * u, cy + 14 * u);
      g.stroke();
      g.restore();
      eyes(g, cx, cy - 4 * u, 3.8 * u, 2.1 * u, '#fff3d0');
    },

    /* --- beasts ----------------------------------------------------------- */
    wolf(g, s, p) {
      /* The wolf and the cat were the same drawing within a unit or two -
         same body, same head at the same height, same four legs, and only the
         tail to tell them apart: 80% of one silhouette shared with the other.
         The CAT is what changed (see below - arched back, upright tail, head
         carried high); the wolf keeps the shape that already read as a wolf,
         and takes only what is true of one and not the other: it stands
         taller, and its tail is a low straight brush rather than a curl.

         An earlier attempt rebuilt this one instead, on hip-chest-shoulder
         masses with the head slung into the chest. Three overlapping ellipses
         read as SEGMENTS and it came out a caterpillar; burying the head took
         away the neck, which is most of what says wolf at all. The number
         improved and the drawing got worse, which is the wrong trade and the
         reason the floor below is set from what the bestiary honestly is. */
      const cx = s / 2, cy = s * 0.56, u = s / 100;
      legs(g, p, cx, cy + 15 * u, u, [-16, -6, 8, 18], 17, 4.2);
      shaded(g, cx - 2 * u, cy + 2 * u, 26 * u, 15 * u, p);        // long body
      pelt(g, p, cx - 2 * u, cy + 2 * u, 26 * u, 15 * u, 0, 7, 0.5, 0.44);
      /* THE BRUSH. Four points made a plank; a wolf's tail is thick at the
         root, fuller in the middle and ragged at the tip, and it is the one
         part of the animal that is pure fur. */
      poly(g, [[cx + 21 * u, cy - 3 * u], [cx + 31 * u, cy - 10 * u],
        [cx + 41 * u, cy - 9 * u], [cx + 45 * u, cy - 2 * u],
        [cx + 40 * u, cy + 3 * u], [cx + 30 * u, cy + 4 * u],
        [cx + 24 * u, cy + 7 * u]], p.lo, p.line, u);
      g.save();
      g.beginPath();
      g.moveTo(cx + 21 * u, cy - 3 * u);
      g.lineTo(cx + 31 * u, cy - 10 * u); g.lineTo(cx + 41 * u, cy - 9 * u);
      g.lineTo(cx + 45 * u, cy - 2 * u); g.lineTo(cx + 40 * u, cy + 3 * u);
      g.lineTo(cx + 30 * u, cy + 4 * u); g.lineTo(cx + 24 * u, cy + 7 * u);
      g.closePath(); g.clip();
      g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const x = cx + (23 + t * 20) * u, y = cy + (-7 + t * 3) * u;
        g.globalAlpha = 0.34; g.strokeStyle = p.line; g.lineWidth = 1.1 * u;
        g.beginPath();
        g.moveTo(x, y); g.quadraticCurveTo(x + 5 * u, y + 4 * u, x + 8 * u, y + 9 * u);
        g.stroke();
        g.globalAlpha = 0.24; g.strokeStyle = p.hi;
        g.beginPath();
        g.moveTo(x + 1.4 * u, y); g.quadraticCurveTo(x + 6.4 * u, y + 4 * u, x + 9.4 * u, y + 9 * u);
        g.stroke();
      }
      g.restore();
      shaded(g, cx - 22 * u, cy - 6 * u, 13 * u, 11 * u, p);       // head
      pelt(g, p, cx - 22 * u, cy - 6 * u, 13 * u, 11 * u, 0, 4, 0.4, 0.3);
      poly(g, [[cx - 34 * u, cy - 6 * u], [cx - 44 * u, cy - 2 * u], [cx - 32 * u, cy + 2 * u]], p.hi, p.line, u);  // muzzle
      poly(g, [[cx - 28 * u, cy - 14 * u], [cx - 30 * u, cy - 26 * u], [cx - 20 * u, cy - 16 * u]], p.lo, p.line, u);
      poly(g, [[cx - 16 * u, cy - 14 * u], [cx - 14 * u, cy - 26 * u], [cx - 8 * u, cy - 15 * u]], p.lo, p.line, u);
      eyes(g, cx - 26 * u, cy - 8 * u, 4 * u, 1.6 * u, '#ffe08a');
    },

    cat(g, s, p) {
      /* And a CAT, on the opposite skeleton to the wolf above. Short legs, a
         high ARCHED back rather than a level one, the head carried up and
         tucked close instead of slung forward, and a tail straight up. The two
         used to share 80% of a silhouette; nothing in this outline is a
         wolf. */
      const cx = s / 2, cy = s * 0.56, u = s / 100;
      legs(g, p, cx, cy + 14 * u, u, [-13, -5, 7, 15], 9, 3.4);
      // the tail, straight up with a hook - the one vertical on a low animal
      g.strokeStyle = p.lo; g.lineWidth = 4 * u; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx + 17 * u, cy + 2 * u);
      g.quadraticCurveTo(cx + 30 * u, cy - 6 * u, cx + 28 * u, cy - 30 * u);
      g.quadraticCurveTo(cx + 27 * u, cy - 38 * u, cx + 20 * u, cy - 36 * u);
      g.stroke();
      // the arch: a haunch behind, a dip at the waist, shoulders in front
      shaded(g, cx + 10 * u, cy - 2 * u, 14 * u, 14 * u, p);       // haunch, high
      shaded(g, cx - 2 * u, cy + 3 * u, 15 * u, 10 * u, p);        // the dip
      shaded(g, cx - 13 * u, cy - 1 * u, 12 * u, 12 * u, p);       // shoulders
      g.strokeStyle = p.dark; g.lineWidth = 2.6 * u;
      for (let i = -1; i <= 2; i++) {                              // stripes
        g.beginPath();
        g.moveTo(cx + i * 8 * u, cy - 10 * u);
        g.lineTo(cx + i * 8 * u + 3 * u, cy + 6 * u);
        g.stroke();
      }
      shaded(g, cx - 20 * u, cy - 13 * u, 11 * u, 10 * u, p);      // head, carried HIGH
      poly(g, [[cx - 28 * u, cy - 20 * u], [cx - 29 * u, cy - 32 * u],
        [cx - 20 * u, cy - 21 * u]], p.lo, p.line, u);
      poly(g, [[cx - 16 * u, cy - 21 * u], [cx - 13 * u, cy - 32 * u],
        [cx - 9 * u, cy - 20 * u]], p.lo, p.line, u);
      poly(g, [[cx - 27 * u, cy - 11 * u], [cx - 33 * u, cy - 9 * u],
        [cx - 27 * u, cy - 7 * u]], p.hi, p.line, u);              // short muzzle
      eyes(g, cx - 22 * u, cy - 14 * u, 4.5 * u, 1.8 * u, '#c9f26b');
    },

    beans(g, s, p) {
      /* Beans: the cat druid who runs the egg stall. A sitting pose rather
         than the prowling cat's arched-and-running one, because a merchant
         has to read as WAITING rather than about to move - haunches down,
         tail curled round to the front paws, staff planted and idle. The
         druid identity is a cloak and a leaf-topped staff laid over the same
         cat skeleton above, not a second body: robe and satchel are flat
         polys on top of a creature that is still unmistakably a cat first. */
      const cx = s / 2, cy = s * 0.60, u = s / 100;
      const robe = palette([0.36, 0.56, 0.30]);   // druid green, independent of fur tint
      const wood = palette([0.42, 0.30, 0.20]);   // staff

      // the tail, curled round in front rather than up - a sitting curl, not
      // a hunting hook - drawn first so the body sits in front of its base
      g.strokeStyle = p.lo; g.lineWidth = 4.4 * u; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx + 20 * u, cy + 8 * u);
      g.quadraticCurveTo(cx + 30 * u, cy + 18 * u, cx + 22 * u, cy + 26 * u);
      g.quadraticCurveTo(cx + 14 * u, cy + 33 * u, cx + 2 * u, cy + 28 * u);
      g.stroke();

      // haunches: the seat. Wide and low, the mass a sitting cat rests on.
      shaded(g, cx + 6 * u, cy + 9 * u, 20 * u, 17 * u, p);
      pelt(g, p, cx + 6 * u, cy + 9 * u, 20 * u, 17 * u, 0, 7, 0.35, 0.32);
      // chest, up and forward of the haunches, narrower and carried high
      shaded(g, cx - 6 * u, cy - 8 * u, 15 * u, 18 * u, p);
      pelt(g, p, cx - 6 * u, cy - 8 * u, 15 * u, 18 * u, 0, 5, 0.3, 0.26);
      // a pale chest patch, so the silhouette isn't one flat colour front-on
      g.save();
      g.beginPath(); g.ellipse(cx - 6 * u, cy - 8 * u, 15 * u, 18 * u, 0, 0, WS.TAU); g.clip();
      g.globalAlpha = 0.55;
      g.fillStyle = p.hi;
      g.beginPath(); g.ellipse(cx - 7 * u, cy - 1 * u, 8 * u, 12 * u, 0, 0, WS.TAU); g.fill();
      g.restore();
      // stripes over the haunch, the same tabby marks as the wild cat
      g.strokeStyle = p.dark; g.lineWidth = 2.4 * u;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(cx + (2 + i * 8) * u, cy - 2 * u);
        g.lineTo(cx + (5 + i * 8) * u, cy + 14 * u);
        g.stroke();
      }
      // a little drawstring pouch at her hip - a few of her own namesake
      // beans painted right on the character, not just thrown around her
      poly(g, [[cx + 17 * u, cy + 1 * u], [cx + 25 * u, cy + 2 * u],
        [cx + 24 * u, cy + 11 * u], [cx + 16 * u, cy + 10 * u]], wood.lo, wood.line, u * 0.7);
      g.strokeStyle = wood.dark; g.lineWidth = 1 * u;
      g.beginPath(); g.moveTo(cx + 17 * u, cy + 2 * u); g.lineTo(cx + 24 * u, cy + 3 * u); g.stroke();
      const beanC = palette([0.62, 0.42, 0.20]);
      for (const [bx2, by2, br2] of [[20, 6.5, 1.6], [22.6, 8, 1.4], [18.3, 8.6, 1.3]]) {
        shaded(g, cx + bx2 * u, cy + by2 * u, br2 * u, br2 * 0.78 * u, beanC);
      }
      /* Front paws were here, but they sat in exactly the footprint the
         crate of eggs is drawn in a few lines down - the crate is drawn
         AFTER the body, so it always won, and the paws underneath it just
         muddled the edge between orange fur and brown crate into one messy
         patch. The crate reads as her forepaws' resting place now, the way
         a real cat drapes a paw over whatever it's sitting behind. */

      // the druid cloak: draped over the back and one shoulder, NOT the
      // face - the eyes stay the focal point, the same rule the hood-cast
      // survivors follow. A low hood-peak behind the head reads as
      // "druid" without ever competing with the cat's own head shape.
      poly(g, [
        [cx + 20 * u, cy - 2 * u], [cx + 10 * u, cy - 24 * u], [cx - 4 * u, cy - 30 * u],
        [cx - 16 * u, cy - 23 * u], [cx - 21 * u, cy - 6 * u], [cx - 15 * u, cy + 6 * u],
        [cx - 4 * u, cy - 2 * u], [cx + 8 * u, cy + 4 * u],
      ], robe.mid, robe.line, u * 1.1);
      g.save();
      g.globalAlpha = 0.4; g.strokeStyle = robe.hi; g.lineWidth = u * 1.3;
      g.beginPath();
      g.moveTo(cx + 16 * u, cy - 6 * u);
      g.quadraticCurveTo(cx, cy - 26 * u, cx - 13 * u, cy - 20 * u);
      g.stroke();
      g.restore();
      // a small leaf clasp where the cloak crosses the chest
      poly(g, [[cx - 3 * u, cy - 3 * u], [cx + 2 * u, cy - 8 * u], [cx + 6 * u, cy - 2 * u],
        [cx + 1 * u, cy + 2 * u]], robe.hi, robe.line, u * 0.7);

      // head, carried high and clear of the cloak
      shaded(g, cx - 20 * u, cy - 17 * u, 11 * u, 10 * u, p);
      pelt(g, p, cx - 20 * u, cy - 17 * u, 11 * u, 10 * u, 0, 4, 0.35, 0.24);
      poly(g, [[cx - 28 * u, cy - 24 * u], [cx - 29 * u, cy - 36 * u],
        [cx - 20 * u, cy - 25 * u]], p.lo, p.line, u);
      poly(g, [[cx - 16 * u, cy - 25 * u], [cx - 13 * u, cy - 36 * u],
        [cx - 9 * u, cy - 24 * u]], p.lo, p.line, u);
      // a soft hood-peak, low behind the ears rather than over them
      poly(g, [[cx - 24 * u, cy - 27 * u], [cx - 19 * u, cy - 39 * u], [cx - 12 * u, cy - 28 * u]],
        robe.mid, robe.line, u * 0.9);
      poly(g, [[cx - 27 * u, cy - 15 * u], [cx - 33 * u, cy - 13 * u],
        [cx - 27 * u, cy - 11 * u]], p.hi, p.line, u);      // muzzle
      // nose and whiskers - the two marks that turn a muzzle into a face
      g.fillStyle = p.dark;
      g.beginPath(); g.moveTo(cx - 31 * u, cy - 14 * u); g.lineTo(cx - 28.5 * u, cy - 15 * u);
      g.lineTo(cx - 28.5 * u, cy - 12.6 * u); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 0.5 * u; g.lineCap = 'round';
      for (const wy of [-15.6, -13.6, -11.6]) {
        g.beginPath(); g.moveTo(cx - 30 * u, cy + wy * u); g.lineTo(cx - 40 * u, cy + (wy - 1.2) * u); g.stroke();
      }
      eyes(g, cx - 22 * u, cy - 18 * u, 4.5 * u, 1.9 * u, '#a8f26a');

      // the staff: planted beside the stall, a gnarled length of wood
      // topped with a leaf-wrapped glow - the "shop sign" a passer-by
      // actually reads before they ever look at the crate of eggs.
      g.save();
      g.strokeStyle = wood.dark; g.lineWidth = 3 * u; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx + 26 * u, cy + 24 * u);
      g.quadraticCurveTo(cx + 22 * u, cy - 4 * u, cx + 27 * u, cy - 30 * u);
      g.stroke();
      g.strokeStyle = wood.lo; g.lineWidth = 1.1 * u; g.globalAlpha = 0.6;
      g.beginPath();
      g.moveTo(cx + 25 * u, cy + 18 * u);
      g.quadraticCurveTo(cx + 21 * u, cy - 4 * u, cx + 26 * u, cy - 26 * u);
      g.stroke();
      g.restore();
      const orb = g.createRadialGradient(cx + 27 * u, cy - 32 * u, 0.5 * u, cx + 27 * u, cy - 32 * u, 8 * u);
      orb.addColorStop(0, '#eafccb'); orb.addColorStop(0.5, '#a8e06a'); orb.addColorStop(1, 'rgba(168,224,106,0)');
      g.fillStyle = orb;
      g.beginPath(); g.arc(cx + 27 * u, cy - 32 * u, 8 * u, 0, WS.TAU); g.fill();
      poly(g, [[cx + 27 * u, cy - 32 * u], [cx + 20 * u, cy - 36 * u], [cx + 24 * u, cy - 27 * u]],
        robe.hi, robe.line, u * 0.6);
      poly(g, [[cx + 27 * u, cy - 32 * u], [cx + 34 * u, cy - 35 * u], [cx + 31 * u, cy - 26 * u]],
        robe.mid, robe.line, u * 0.6);

      /* The stall. This used to be a small crate tucked beside her - correct
         in idea, wrong in scale: from across the field the eggs are what
         she's FOR, and a shape a third the size of her own head read as an
         afterthought. It now takes the whole lower body, the way a market
         stall's actual counter would, with a woven basket in place of the
         old plain wooden box - a handle arc, and hatching instead of grain,
         so it reads as basket rather than crate at a glance. */
      const basket = [[cx - 19 * u, cy + 13 * u], [cx + 22 * u, cy + 11 * u],
        [cx + 25 * u, cy + 26 * u], [cx + 19 * u, cy + 38 * u],
        [cx - 16 * u, cy + 39 * u], [cx - 23 * u, cy + 25 * u]];
      poly(g, basket, wood.mid, wood.line, u * 1.1);
      g.save();
      g.beginPath();
      g.moveTo(basket[0][0], basket[0][1]);
      for (let i = 1; i < basket.length; i++) g.lineTo(basket[i][0], basket[i][1]);
      g.closePath(); g.clip();
      g.strokeStyle = wood.line; g.globalAlpha = 0.45; g.lineWidth = 0.8 * u;
      for (let i = -3; i < 9; i++) {
        g.beginPath();
        g.moveTo(cx - 24 * u + i * 6 * u, cy + 8 * u); g.lineTo(cx - 34 * u + i * 6 * u, cy + 42 * u);
        g.stroke();
      }
      g.strokeStyle = wood.dark; g.globalAlpha = 0.5;
      for (const hy of [19, 27, 34]) {
        g.beginPath(); g.moveTo(cx - 24 * u, cy + hy * u); g.lineTo(cx + 26 * u, cy + (hy - 2) * u); g.stroke();
      }
      g.restore();
      // the handle, arcing over the rim
      g.strokeStyle = wood.dark; g.lineWidth = 1.6 * u; g.globalAlpha = 1;
      g.beginPath();
      g.moveTo(cx - 14 * u, cy + 13 * u);
      g.quadraticCurveTo(cx + 2 * u, cy + 1 * u, cx + 17 * u, cy + 12 * u);
      g.stroke();

      const eggC = palette([0.94, 0.88, 0.72]);
      shaded(g, cx - 6 * u, cy + 10 * u, 5.6 * u, 6.8 * u, eggC);
      shaded(g, cx + 4 * u, cy + 7 * u, 5.2 * u, 6.4 * u, eggC);
      shaded(g, cx + 13 * u, cy + 10 * u, 5.4 * u, 6.6 * u, eggC);
    },

    boar(g, s, p) {
      const cx = s / 2, cy = s * 0.55, u = s / 100;
      // Stubby trotters: short, but they still have to clear the barrel.
      legs(g, p, cx + 2 * u, cy + 18 * u, u, [-13, -4, 7, 16], 11, 5);
      /* A boar is a high hump with the head slung low and forward. Sitting the
         head at the body's own centre height, as this did, just made two
         spheres of the same size in a row. */
      shaded(g, cx + 3 * u, cy - 1 * u, 23 * u, 18 * u, p);         // humped body
      pelt(g, p, cx + 3 * u, cy - 1 * u, 23 * u, 18 * u, 0, 8, 0.55, 0.42);
      /* Hide. A boar is a slab of muscle under a thick coat and this was one
         smooth egg - second flattest in the bestiary at 22.6%. A shoulder
         mass lit from above, two creases behind it where the hide folds, and
         a lighter belly. All of it clipped inside the body, so the fat round
         silhouette that makes it a boar is untouched. */
      g.save();
      g.beginPath(); g.ellipse(cx + 3 * u, cy - 1 * u, 23 * u, 18 * u, 0, 0, WS.TAU); g.clip();
      const shoulder = g.createRadialGradient(cx - 6 * u, cy - 10 * u, 2 * u,
        cx - 4 * u, cy - 4 * u, 22 * u);
      shoulder.addColorStop(0, 'rgba(255,255,255,.17)');
      shoulder.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = shoulder;
      g.beginPath(); g.ellipse(cx - 5 * u, cy - 6 * u, 16 * u, 14 * u, 0, 0, WS.TAU); g.fill();
      g.strokeStyle = p.line; g.globalAlpha = 0.44; g.lineWidth = 1.5 * u;
      for (const dx of [-12, 2, 9]) {
        g.beginPath();
        g.moveTo(cx + dx * u, cy - 18 * u);
        g.quadraticCurveTo(cx + (dx + 4) * u, cy - 2 * u, cx + (dx + 1) * u, cy + 16 * u);
        g.stroke();
      }
      const belly = g.createLinearGradient(0, cy + 4 * u, 0, cy + 17 * u);
      belly.addColorStop(0, 'rgba(255,240,220,0)');
      belly.addColorStop(1, 'rgba(255,240,220,.16)');
      g.globalAlpha = 1;
      g.fillStyle = belly;
      g.beginPath(); g.ellipse(cx + 3 * u, cy + 10 * u, 20 * u, 9 * u, 0, 0, WS.TAU); g.fill();
      g.restore();
      g.strokeStyle = p.dark; g.lineWidth = 2.6 * u; g.lineCap = 'round';
      for (let i = -3; i <= 3; i++) {                               // bristles, over the hump
        const a = WS.PI * (0.62 + i * 0.055);
        const bx = cx + 3 * u + WS.cos(a) * 22 * u, by = cy - 1 * u - WS.sin(a) * 17 * u;
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx + WS.cos(a) * 8 * u, by - WS.sin(a) * 9 * u);
        g.stroke();
      }
      shaded(g, cx - 21 * u, cy + 6 * u, 13 * u, 12 * u, p);        // low head
      pelt(g, p, cx - 21 * u, cy + 6 * u, 13 * u, 12 * u, 0, 4, 0.35, 0.4);
      poly(g, [[cx - 30 * u, cy + 7 * u], [cx - 41 * u, cy + 11 * u], [cx - 29 * u, cy + 15 * u]],
        p.hi, p.line, u);                                          // snout
      /* Tusks. They have to grow out of the snout and curl only a little: an
         earlier pass swept them up past the ears, where they read as two loose
         white crescents floating beside the animal rather than as teeth. */
      g.strokeStyle = '#f4ecdc'; g.lineWidth = 3.6 * u; g.lineCap = 'round';
      for (const dy of [13, 8]) {
        g.beginPath();
        g.moveTo(cx - 33 * u, cy + dy * u);
        g.quadraticCurveTo(cx - 43 * u, cy + (dy - 2) * u, cx - 41 * u, cy + (dy - 9) * u);
        g.stroke();
      }
      eyes(g, cx - 22 * u, cy + 1 * u, 4.5 * u, 1.6 * u, '#ff9d6b');
    },

    bristlekin(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      shaded(g, cx, cy + 4 * u, 22 * u, 24 * u, p);
      /* QUILLS THAT TAPER, and short ones between the long. Seven strokes of
         one width at even spacing read as a comb - which is what this was -
         and a creature covered in spines should not have its spines all the
         same length. */
      for (let i = 0; i < 13; i++) {
        const a = WS.PI * (0.13 + i * 0.054);
        const long = i % 2 === 0;
        const r0 = 19 * u, r1 = (long ? 36 : 28) * u;
        const x0 = cx - WS.cos(a) * r0, y0 = cy - WS.sin(a) * r0;
        const x1 = cx - WS.cos(a) * r1, y1 = cy - WS.sin(a) * r1;
        const w = (long ? 3.2 : 2.2) * u;
        const nx = -(y1 - y0), ny = x1 - x0;
        const L = Math.hypot(nx, ny) || 1;
        g.fillStyle = long ? p.hi : p.mid;
        g.beginPath();
        g.moveTo(x0 + nx / L * w, y0 + ny / L * w);
        g.lineTo(x1, y1);
        g.lineTo(x0 - nx / L * w, y0 - ny / L * w);
        g.closePath(); g.fill();
        g.strokeStyle = p.line; g.globalAlpha = 0.4; g.lineWidth = 0.7 * u;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.globalAlpha = 1;
      }
      // and a bristled hide under them
      g.save();
      g.beginPath(); g.ellipse(cx, cy + 4 * u, 22 * u, 24 * u, 0, 0, WS.TAU); g.clip();
      g.strokeStyle = p.line; g.globalAlpha = 0.54; g.lineWidth = 1.1 * u;
      for (let i = 0; i < 15; i++) {
        const a = WS.PI * (0.08 + i * 0.056);
        g.beginPath();
        g.moveTo(cx - WS.cos(a) * 20 * u, cy - WS.sin(a) * 20 * u);
        g.lineTo(cx - WS.cos(a) * 9 * u, cy - WS.sin(a) * 9 * u + 4 * u);
        g.stroke();
      }
      g.restore();
      shaded(g, cx, cy - 20 * u, 13 * u, 11 * u, p);
      // the head bristles too - it's not a bald patch on a spined animal
      g.save();
      g.beginPath(); g.ellipse(cx, cy - 20 * u, 13 * u, 11 * u, 0, 0, WS.TAU); g.clip();
      g.strokeStyle = p.line; g.globalAlpha = 0.4; g.lineWidth = 0.9 * u;
      for (let i = 0; i < 6; i++) {
        const a = WS.PI * (0.15 + i * 0.12);
        g.beginPath();
        g.moveTo(cx - WS.cos(a) * 11 * u, cy - 20 * u - WS.sin(a) * 9 * u);
        g.lineTo(cx - WS.cos(a) * 5 * u, cy - 20 * u - WS.sin(a) * 4 * u);
        g.stroke();
      }
      g.restore();
      poly(g, [[cx - 6 * u, cy - 14 * u], [cx + 6 * u, cy - 14 * u], [cx, cy - 6 * u]], p.hi);
      eyes(g, cx, cy - 22 * u, 5 * u, 1.8 * u, '#ffcf6b');
      blade(g, cx + 24 * u, cy + 4 * u, 28 * u, 6 * u, 0.55, '#cdd3de', '#6b7280');
    },

    raptor(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      shaded(g, cx + 2 * u, cy, 20 * u, 14 * u, p, -0.15);
      /* Scale banding, not fur: a raptor is a reptile and the bands run
         ACROSS it. Same job as the pelt on the furred ones - break a smooth
         mass - done in the surface the animal actually has. */
      g.save();
      g.beginPath(); g.ellipse(cx + 2 * u, cy, 20 * u, 14 * u, -0.15, 0, WS.TAU); g.clip();
      for (let i = 0; i < 5; i++) {
        const x = cx + (-12 + i * 7) * u;
        g.globalAlpha = 0.4; g.strokeStyle = p.line; g.lineWidth = 2.4 * u;
        g.beginPath();
        g.moveTo(x, cy - 14 * u);
        g.quadraticCurveTo(x + 3 * u, cy, x - 1 * u, cy + 14 * u);
        g.stroke();
        g.globalAlpha = 0.28; g.strokeStyle = p.hi; g.lineWidth = 1.6 * u;
        g.beginPath();
        g.moveTo(x + 2 * u, cy - 14 * u);
        g.quadraticCurveTo(x + 5 * u, cy, x + 1 * u, cy + 14 * u);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = p.lo; g.lineWidth = 5 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx + 16 * u, cy - 2 * u); g.quadraticCurveTo(cx + 40 * u, cy - 8 * u, cx + 44 * u, cy - 24 * u); g.stroke();
      g.strokeStyle = p.dark; g.lineWidth = 4 * u;                 // raised legs
      g.beginPath(); g.moveTo(cx, cy + 8 * u); g.lineTo(cx - 6 * u, cy + 22 * u); g.lineTo(cx + 4 * u, cy + 26 * u); g.stroke();
      g.fillStyle = p.dark;
      g.beginPath(); g.ellipse(cx + 4 * u, cy + 27 * u, 5 * u, 2.4 * u, 0, 0, WS.TAU); g.fill();
      g.strokeStyle = p.hi; g.lineWidth = 1.4 * u;                 // the killing claw
      g.beginPath();
      g.moveTo(cx + 1 * u, cy + 22 * u);
      g.quadraticCurveTo(cx + 6 * u, cy + 19 * u, cx + 7 * u, cy + 14 * u);
      g.stroke();
      shaded(g, cx - 20 * u, cy - 14 * u, 12 * u, 9 * u, p, -0.3);
      poly(g, [[cx - 30 * u, cy - 14 * u], [cx - 42 * u, cy - 10 * u], [cx - 28 * u, cy - 6 * u]], p.hi, p.line, u);
      poly(g, [[cx - 20 * u, cy - 22 * u], [cx - 12 * u, cy - 34 * u], [cx - 10 * u, cy - 20 * u]], p.lo, p.line, u); // crest
      eyes(g, cx - 23 * u, cy - 16 * u, 3.5 * u, 1.6 * u, '#ffe066');
    },

    strider(g, s, p) {
      const cx = s / 2, cy = s * 0.55, u = s / 100;
      /* Legs with a backward knee, which is what a running bird has, and a
         foot to stand on. Two straight strokes with round caps were neither. */
      for (const [hx, kx, fx] of [[-6, -13, -9], [6, 13, 11]]) {
        g.strokeStyle = p.lo; g.lineWidth = 5 * u; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx + hx * u, cy + 10 * u);
        g.quadraticCurveTo(cx + kx * u, cy + 16 * u, cx + kx * u, cy + 22 * u);
        g.stroke();
        g.strokeStyle = p.dark; g.lineWidth = 3 * u;
        g.beginPath();
        g.moveTo(cx + kx * u, cy + 22 * u);
        g.quadraticCurveTo(cx + kx * u, cy + 28 * u, cx + fx * u, cy + 33 * u);
        g.stroke();
        g.fillStyle = p.lo;
        g.beginPath(); g.ellipse(cx + kx * u, cy + 21 * u, 3 * u, 2.6 * u, 0, 0, WS.TAU); g.fill();
        g.fillStyle = p.dark;
        g.beginPath(); g.ellipse(cx + fx * u, cy + 34 * u, 5 * u, 2.4 * u, 0, 0, WS.TAU); g.fill();
      }
      shaded(g, cx, cy, 20 * u, 17 * u, p);
      /* Measured at 36.6% interior detail against a 41% average - the
         plainest body in the bestiary before this, one soft ring of down
         and three faint coverts on top of it. Both strengthened. */
      pelt(g, p, cx, cy, 20 * u, 17 * u, 0, 7, 0.4, 0.4);
      // plumage: three overlapping coverts down the flank
      g.save();
      g.beginPath(); g.ellipse(cx, cy, 20 * u, 17 * u, 0, 0, WS.TAU); g.clip();
      g.strokeStyle = p.line; g.globalAlpha = 0.48; g.lineWidth = 1.3 * u;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(cx + (10 - i * 7) * u, cy - 6 * u, (14 + i * 3) * u, 0.15, 1.5);
        g.stroke();
      }
      g.restore();
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
        /* PRIMARIES. The wings were two flat slabs, and a wing is made of
           separate feathers - at the trailing edge especially, where they
           part. Five splits along the back of each wing is the whole of what
           tells a wing from a cape. */
        g.save();
        g.beginPath();
        g.moveTo(cx + dir * 5 * u, cy - 8 * u);
        g.lineTo(cx + dir * 46 * u, cy - 26 * u);
        g.lineTo(cx + dir * 40 * u, cy - 2 * u);
        g.lineTo(cx + dir * 14 * u, cy + 8 * u);
        g.closePath(); g.clip();
        g.strokeStyle = p.line; g.globalAlpha = 0.45; g.lineWidth = 1.1 * u;
        for (let i = 1; i <= 5; i++) {
          const t = i / 6;
          g.beginPath();
          g.moveTo(cx + dir * (10 + t * 30) * u, cy + (-9 - t * 14) * u);
          g.lineTo(cx + dir * (14 + t * 26) * u, cy + (8 - t * 8) * u);
          g.stroke();
        }
        g.globalAlpha = 0.22;
        g.strokeStyle = p.hi;
        for (let i = 1; i <= 5; i++) {
          const t = i / 6;
          g.beginPath();
          g.moveTo(cx + dir * (11 + t * 30) * u, cy + (-9 - t * 14) * u);
          g.lineTo(cx + dir * (15 + t * 26) * u, cy + (8 - t * 8) * u);
          g.stroke();
        }
        g.restore();
      }
      legs(g, p, cx, cy + 16 * u, u, [-6, 6], 9, 3.4);
      shaded(g, cx, cy + 2 * u, 14 * u, 16 * u, p);
      // A neck. Without one the head sat inside the body and the bird read as
      // a torso with wings - no beak, no direction, no animal.
      g.strokeStyle = p.lo; g.lineWidth = 6 * u; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx + 2 * u, cy - 8 * u);
      g.quadraticCurveTo(cx - 4 * u, cy - 20 * u, cx - 1 * u, cy - 26 * u);
      g.stroke();
      shaded(g, cx - 1 * u, cy - 28 * u, 8 * u, 8 * u, p);
      poly(g, [[cx - 7 * u, cy - 28 * u], [cx - 22 * u, cy - 24 * u], [cx - 7 * u, cy - 21 * u]], '#e8b455', '#8a6420', u);
      eyes(g, cx, cy - 30 * u, 3 * u, 1.5 * u, '#ffd166');
    },

    spider(g, s, p) {
      const cx = s / 2, cy = s * 0.58, u = s / 100;
      /* Legs in two segments with a KNEE, which is the whole shape of a
         spider's leg - up from the body, then down to the ground - and a
         taper, because the flattest creature in the bestiary at 19% was eight
         constant-width strokes and two smooth spheres. */
      g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        for (const dir of [-1, 1]) {
          const a = -0.55 + i * 0.38;
          const kx = cx + dir * (24 + i * 3) * u;
          const ky = cy + WS.sin(a) * 24 * u - 15 * u;
          const fx = cx + dir * (34 - i * 2) * u;
          const fy = cy + WS.sin(a) * 34 * u + 8 * u;
          g.strokeStyle = p.lo; g.lineWidth = 3.4 * u;
          g.beginPath();
          g.moveTo(cx + dir * 6 * u, cy);
          g.quadraticCurveTo(cx + dir * 16 * u, ky + 3 * u, kx, ky);
          g.stroke();
          g.strokeStyle = p.dark; g.lineWidth = 2.2 * u;
          g.beginPath();
          g.moveTo(kx, ky);
          g.quadraticCurveTo(kx + dir * 5 * u, fy - 9 * u, fx, fy);
          g.stroke();
          // bands down the leg, which is where a spider's pattern actually is
          g.strokeStyle = p.dark;
          g.lineWidth = 3.6 * u;
          for (let q = 1; q <= 3; q++) {
            const t = q / 4;
            const bx = cx + dir * 6 * u + (kx - cx - dir * 6 * u) * t;
            const by = cy + (ky - cy) * t;
            g.beginPath();
            g.moveTo(bx - dir * 1.4 * u, by - 1 * u);
            g.lineTo(bx + dir * 1.4 * u, by + 1 * u);
            g.stroke();
          }
          // the joint, and hairs off the upper segment
          g.fillStyle = p.lo;
          g.beginPath(); g.ellipse(kx, ky, 2.2 * u, 2 * u, 0, 0, WS.TAU); g.fill();
          g.strokeStyle = p.dark; g.lineWidth = 0.8 * u;
          for (let h = 1; h <= 3; h++) {
            const t = h / 4;
            const hx = cx + dir * 6 * u + (kx - cx - dir * 6 * u) * t;
            const hy = cy + (ky - cy) * t;
            g.beginPath();
            g.moveTo(hx, hy); g.lineTo(hx + dir * 1.5 * u, hy - 4 * u);
            g.stroke();
          }
        }
      }
      shaded(g, cx + 4 * u, cy + 4 * u, 18 * u, 16 * u, p);        // abdomen
      /* The abdomen is BANDED. A spider's is the one part of it that is
         patterned, and this one was a bare sphere. */
      /* A MARKING, with edges.
         The first pass banded the abdomen with soft concentric ellipses and
         moved the number by nothing - a ramp inside a ramp, which is the
         lesson this project keeps relearning. What a spider actually carries
         is a hard-edged mark: chevrons down the back, pale against the shell,
         with the chitin plates seamed between them. */
      g.save();
      g.beginPath(); g.ellipse(cx + 4 * u, cy + 4 * u, 18 * u, 16 * u, 0, 0, WS.TAU); g.clip();
      for (let i = 0; i < 4; i++) {
        const y = cy + (-7 + i * 5.5) * u, w = (11 - i * 1.6) * u;
        g.fillStyle = 'rgba(255,240,220,.46)';
        g.beginPath();
        g.moveTo(cx + 5 * u - w, y);
        g.lineTo(cx + 5 * u, y + 4.2 * u);
        g.lineTo(cx + 5 * u + w, y);
        g.lineTo(cx + 5 * u, y + 1.6 * u);
        g.closePath(); g.fill();
        g.strokeStyle = p.line; g.globalAlpha = 0.72; g.lineWidth = 1.4 * u;
        g.beginPath();
        g.moveTo(cx + 5 * u - w, y);
        g.lineTo(cx + 5 * u, y + 4.2 * u);
        g.lineTo(cx + 5 * u + w, y);
        g.stroke();
        g.globalAlpha = 1;
      }
      // the seam down the middle of the shell
      g.strokeStyle = p.line; g.globalAlpha = 0.4; g.lineWidth = 1.2 * u;
      g.beginPath();
      g.moveTo(cx + 5 * u, cy - 11 * u); g.lineTo(cx + 5 * u, cy + 18 * u);
      g.stroke();
      g.restore();
      /* The cephalothorax's own base fill used to be painted AFTER the
         plates, bristles and veins below rather than before them - every
         mark in this block was there in the code and invisible on screen,
         opaque-overwritten by shaded() the instant it ran. Moved ahead of
         the detail it was erasing. */
      shaded(g, cx - 14 * u, cy - 4 * u, 11 * u, 10 * u, p);
      // and plates on the cephalothorax
      g.save();
      g.beginPath(); g.ellipse(cx - 14 * u, cy - 4 * u, 11 * u, 10 * u, 0, 0, WS.TAU); g.clip();
      g.fillStyle = 'rgba(255,240,220,.28)';
      g.beginPath();
      g.moveTo(cx - 20 * u, cy - 9 * u);
      g.lineTo(cx - 8 * u, cy - 6 * u);
      g.lineTo(cx - 20 * u, cy - 2 * u);
      g.closePath(); g.fill();
      g.strokeStyle = p.line; g.globalAlpha = 0.5; g.lineWidth = 0.9 * u;
      g.lineCap = 'round';
      for (let i = 0; i < 7; i++) {                                // bristles
        const a = WS.PI * (1.05 + i * 0.13);
        g.beginPath();
        g.moveTo(cx - 14 * u + WS.cos(a) * 9 * u, cy - 4 * u + WS.sin(a) * 8 * u);
        g.lineTo(cx - 14 * u + WS.cos(a) * 13 * u, cy - 4 * u + WS.sin(a) * 12 * u);
        g.stroke();
      }
      g.strokeStyle = p.line; g.globalAlpha = 0.6; g.lineWidth = 1.3 * u;
      for (const dy of [-3, 1, 5]) {
        g.beginPath();
        g.moveTo(cx - 25 * u, cy + dy * u);
        g.quadraticCurveTo(cx - 14 * u, cy + (dy + 3) * u, cx - 3 * u, cy + dy * u);
        g.stroke();
      }
      g.restore();
      // fangs, under the head end
      for (const dir of [-1, 1]) {
        poly(g, [[cx + (-17 + dir * 3) * u, cy + 2 * u],
          [cx + (-18 + dir * 5) * u, cy + 10 * u],
          [cx + (-13 + dir * 4) * u, cy + 3 * u]], p.dark, p.line, u * 0.8);
      }
      g.save(); g.shadowColor = '#ff6b6b'; g.shadowBlur = 8 * u; g.fillStyle = '#ff8a8a';
      for (const [ox, oy] of [[-4, -3], [0, -5], [-6, 1], [1, 0]]) {
        g.beginPath(); g.arc(cx - 16 * u + ox * u, cy - 5 * u + oy * u, 1.5 * u, 0, WS.TAU); g.fill();
      }
      g.restore();
    },

    moonwretch(g, s, p) {
      const cx = s / 2, cy = s * 0.56, u = s / 100;
      shaded(g, cx, cy + 6 * u, 22 * u, 26 * u, p);
      pelt(g, p, cx, cy + 6 * u, 22 * u, 26 * u, 0, 6, 0.35, 0.44);
      // the pale bib every furred predator carries down its front
      g.save();
      g.beginPath(); g.ellipse(cx, cy + 6 * u, 22 * u, 26 * u, 0, 0, WS.TAU); g.clip();
      g.fillStyle = 'rgba(255,248,232,.17)';
      g.beginPath();
      g.moveTo(cx - 9 * u, cy - 12 * u);
      g.quadraticCurveTo(cx, cy + 6 * u, cx - 3 * u, cy + 30 * u);
      g.quadraticCurveTo(cx + 5 * u, cy + 8 * u, cx + 9 * u, cy - 12 * u);
      g.closePath(); g.fill();
      g.strokeStyle = p.line; g.globalAlpha = 0.34; g.lineWidth = 1.1 * u;
      g.beginPath();
      g.moveTo(cx - 9 * u, cy - 12 * u);
      g.quadraticCurveTo(cx, cy + 6 * u, cx - 3 * u, cy + 30 * u);
      g.stroke();
      g.restore();
      shaded(g, cx - 24 * u, cy + 4 * u, 9 * u, 16 * u, p, -0.5);
      shaded(g, cx + 24 * u, cy + 4 * u, 9 * u, 16 * u, p, 0.5);
      for (const dir of [-1, 1]) {
        pelt(g, p, cx + dir * 24 * u, cy + 4 * u, 9 * u, 16 * u, dir * 0.5, 3, 0.3, 0.3);
      }
      for (const dir of [-1, 1]) {
        poly(g, [[cx + dir * 30 * u, cy + 16 * u], [cx + dir * 40 * u, cy + 24 * u], [cx + dir * 28 * u, cy + 24 * u]], '#e9edf5', '#8a90a0', u);
      }
      // veins in the ears, which are the moonwretch's biggest single shapes
      g.save();
      g.strokeStyle = p.line; g.globalAlpha = 0.4; g.lineWidth = 1.1 * u;
      for (const dir of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.moveTo(cx + dir * 24 * u, cy + (2 - i * 5) * u);
          g.lineTo(cx + dir * (30 + i * 2) * u, cy + (-4 - i * 5) * u);
          g.stroke();
        }
      }
      g.restore();
      shaded(g, cx, cy - 22 * u, 13 * u, 12 * u, p);
      pelt(g, p, cx, cy - 22 * u, 13 * u, 12 * u, 0, 4, 0.4, 0.3);
      poly(g, [[cx - 8 * u, cy - 24 * u], [cx - 16 * u, cy - 42 * u], [cx - 2 * u, cy - 30 * u]], p.lo, p.line, u);
      poly(g, [[cx + 8 * u, cy - 24 * u], [cx + 16 * u, cy - 42 * u], [cx + 2 * u, cy - 30 * u]], p.lo, p.line, u);
      poly(g, [[cx - 7 * u, cy - 16 * u], [cx + 7 * u, cy - 16 * u], [cx, cy - 6 * u]], p.hi);
      g.fillStyle = '#fff'; // bared teeth
      for (let i = -2; i <= 2; i++) poly(g, [[cx + i * 3 * u, cy - 12 * u], [cx + i * 3 * u + 1.4 * u, cy - 8 * u], [cx + i * 3 * u + 2.8 * u, cy - 12 * u]], '#fff');
      eyes(g, cx, cy - 26 * u, 5 * u, 2 * u, '#ffe14d');
    },

    shrikewing(g, s, p) {
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

    karrash(g, s, p) {
      const cx = s / 2, cy = s * 0.60, u = s / 100;
      shaded(g, cx + 4 * u, cy + 8 * u, 26 * u, 15 * u, p);        // horse barrel
      /* Measured at 37.9% interior detail against a 41% average - the
         barrel's coat was the faintest pelt call in the bestiary. */
      pelt(g, p, cx + 4 * u, cy + 8 * u, 26 * u, 15 * u, 0, 7, 0.45, 0.4);
      // Four legs with feet on them, like every other quadruped here. These
      // were four bare round-capped strokes - the only limbs in the bestiary
      // that did not stand on anything.
      legs(g, p, cx, cy + 18 * u, u, [-14, -4, 12, 22], 14, 4);
      poly(g, [[cx + 28 * u, cy + 4 * u], [cx + 44 * u, cy - 6 * u], [cx + 30 * u, cy + 12 * u]], p.lo, p.line, u);
      shaded(g, cx - 12 * u, cy - 14 * u, 13 * u, 16 * u, p);      // humanoid torso
      pelt(g, p, cx - 12 * u, cy - 14 * u, 13 * u, 16 * u, 0, 4, 0.3, 0.42);
      shaded(g, cx - 12 * u, cy - 32 * u, 10 * u, 9 * u, p);
      pelt(g, p, cx - 12 * u, cy - 32 * u, 10 * u, 9 * u, 0, 4, 0.4, 0.3);
      eyes(g, cx - 12 * u, cy - 33 * u, 4 * u, 1.6 * u, '#ffd98f');
      /* A SPEAR, not a scratch. This was one 3u white stroke of constant width
         from hip to point with a flat triangle stuck on the end - no haft, no
         grip, no material, and at any size it read as a line somebody had
         drawn across the drawing. A haft is wood, it is bound where the hand
         closes on it, and the head is steel with an edge. */
      const bx = cx - 30 * u, by = cy + 20 * u, tx = cx + 4 * u, ty = cy - 34 * u;
      g.save();
      g.lineCap = 'round';
      const haft = g.createLinearGradient(bx, by, tx, ty);
      haft.addColorStop(0, '#6d5233');
      haft.addColorStop(0.5, '#9c7b4d');
      haft.addColorStop(1, '#6d5233');
      g.strokeStyle = haft; g.lineWidth = 3.4 * u;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.stroke();
      // the binding, across the haft where the hand is
      g.strokeStyle = '#4c3721'; g.lineWidth = 0.9 * u;
      const dx = tx - bx, dy = ty - by, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * 1.9 * u, ny = dx / len * 1.9 * u;
      for (const t of [0.30, 0.36, 0.42, 0.48]) {
        const mx = bx + dx * t, my = by + dy * t;
        g.beginPath(); g.moveTo(mx - nx, my - ny); g.lineTo(mx + nx, my + ny); g.stroke();
      }
      g.restore();
      blade(g, tx, ty, 16 * u, 3.4 * u, Math.atan2(dx, -dy), '#e7ecf5', '#8a90a0');
    },

    golem(g, s, p) {
      /* The one creature that was flat fillRects - no shading, no bevel, no
         legs - which is why it read as furniture rather than a thing that
         walks at you. It stays angular, because that is the point of a golem,
         but it now takes the same light as everything else: lit along the top
         and left, shadowed at the foot, and standing on something. */
      const cx = s / 2, cy = s * 0.54, u = s / 100;
      const plate = (x, y, w, h, lit) => {
        const grd = g.createLinearGradient(x, y, x + w * 0.4, y + h);
        grd.addColorStop(0, lit ? p.hi : p.mid);
        grd.addColorStop(0.55, p.mid);
        grd.addColorStop(1, p.lo);
        g.fillStyle = grd;
        g.fillRect(x, y, w, h);
        g.strokeStyle = p.line; g.lineWidth = 2 * u;
        g.strokeRect(x, y, w, h);
        // The Arclight bevel, in stone: a lit top edge and a dark foot.
        g.fillStyle = 'rgba(255,244,224,.16)'; g.fillRect(x, y, w, 2 * u);
        g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(x, y + h - 2 * u, w, 2 * u);
        /* PINS AND A CRACK. A golem is cut stone held together, and every
           block on it was a smooth panel with a bevel - the one creature in
           the game made entirely of hard edges had no hard edges inside it. */
        g.save();
        g.beginPath(); g.rect(x, y, w, h); g.clip();
        g.strokeStyle = 'rgba(0,0,0,.48)'; g.lineWidth = 1.1 * u;
        g.beginPath();
        g.moveTo(x + w * 0.22, y);
        g.lineTo(x + w * 0.38, y + h * 0.45);
        g.lineTo(x + w * 0.3, y + h);
        g.stroke();
        g.strokeStyle = 'rgba(255,244,224,.22)';
        g.beginPath();
        g.moveTo(x + w * 0.22 + 1.2 * u, y);
        g.lineTo(x + w * 0.38 + 1.2 * u, y + h * 0.45);
        g.lineTo(x + w * 0.3 + 1.2 * u, y + h);
        g.stroke();
        g.restore();
        for (const [px2, py2] of [[x + 3 * u, y + 3 * u], [x + w - 3 * u, y + 3 * u],
          [x + 3 * u, y + h - 3 * u], [x + w - 3 * u, y + h - 3 * u]]) {
          g.fillStyle = 'rgba(0,0,0,.4)';
          g.beginPath(); g.arc(px2, py2 + 0.5 * u, 1.5 * u, 0, WS.TAU); g.fill();
          g.fillStyle = 'rgba(255,244,224,.35)';
          g.beginPath(); g.arc(px2 - 0.2 * u, py2 - 0.3 * u, 1 * u, 0, WS.TAU); g.fill();
        }
      };

      // Squat legs, angular to match, with a foot slab each.
      plate(cx - 17 * u, cy + 20 * u, 12 * u, 14 * u);
      plate(cx + 5 * u, cy + 20 * u, 12 * u, 14 * u);
      plate(cx - 20 * u, cy + 32 * u, 18 * u, 6 * u);
      plate(cx + 2 * u, cy + 32 * u, 18 * u, 6 * u);

      plate(cx - 30 * u, cy - 8 * u, 10 * u, 26 * u);              // arms
      plate(cx + 20 * u, cy - 8 * u, 10 * u, 26 * u);
      plate(cx - 22 * u, cy - 14 * u, 44 * u, 36 * u, true);       // torso
      plate(cx - 14 * u, cy - 32 * u, 28 * u, 18 * u, true);       // head block

      g.save(); g.shadowColor = '#ff9d3c'; g.shadowBlur = 12 * u;  // furnace
      g.fillStyle = '#ffb45c';
      g.fillRect(cx - 8 * u, cy - 26 * u, 16 * u, 5 * u);
      g.fillRect(cx - 6 * u, cy + 2 * u, 12 * u, 12 * u);
      g.restore();
      /* Pulled in and shortened until the tip lands inside its own tile. At
         cx+34u and 30u long on a 0.9 rotation the point sat 9u past the right
         edge and had done since the golem was drawn - sheared off on every
         frame, which nothing was measuring. */
      blade(g, cx + 19 * u, cy + 6 * u, 26 * u, 9 * u, 0.9, '#b9c0cc', '#5c6270', 'heavy');
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
    graveblade: { accessory: 'graveblade', bulk: 1.1, cloak: true },
    ruinseeker: { accessory: 'glaives', horns: true },
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
      case 'graveblade':
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
  }

  /* ------------------------------------------------------------- props ---- */
  const PROPS = {
    tree(g, s) {
      /* Three flat ellipses and a brown rectangle. A canopy is a mass of
         clumps catching light on their tops, and a trunk is round. */
      const u = s / 100, cx = s / 2, cy = s * 0.7;
      const bark = { hi: '#4a3722', mid: '#33251643'.slice(0, 7), lo: '#241a10',
        dark: '#160f09', line: '#120c07', glow: '#fff' };
      shaded(g, cx, cy + 6 * u, 6 * u, 16 * u, bark);
      g.save();
      g.strokeStyle = 'rgba(14,10,6,.5)'; g.lineWidth = 0.9 * u;
      for (const dx of [-2.4, 0.6, 2.8]) {
        g.beginPath();
        g.moveTo(cx + dx * u, cy - 8 * u);
        g.quadraticCurveTo(cx + dx * 1.4 * u, cy + 6 * u, cx + dx * u, cy + 20 * u);
        g.stroke();
      }
      g.restore();
      const leaf = [['#1e3419', '#16280f'], ['#26401f', '#1b3016'], ['#35552a', '#24401d']];
      for (let i = 0; i < 3; i++) {
        const [fill, edge] = leaf[i];
        const ry = (18 - i * 3) * u, rx = (32 - i * 7) * u;
        const y = cy - 18 * u - i * 14 * u;
        // the clump, as overlapping lobes rather than one oval
        for (let k = -2; k <= 2; k++) {
          ellipse(g, cx + k * rx * 0.34, y + Math.abs(k) * ry * 0.16,
            rx * 0.44, ry * 0.78, k % 2 ? edge : fill);
        }
        ellipse(g, cx, y - ry * 0.22, rx * 0.72, ry * 0.6, fill);
        // and the light on top of it
        g.save();
        g.globalAlpha = 0.24;
        ellipse(g, cx - rx * 0.16, y - ry * 0.5, rx * 0.5, ry * 0.34, '#7fae5a');
        g.restore();
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
      /* A rock is FACETED. One flat polygon with an outline is a paper cut-out
         of a rock, and these are the most common object on three of the five
         maps. Three planes - a lit top, a turned side and a shadowed foot -
         and a crack across the biggest of them. */
      const u = s / 100, cx = s / 2;
      const hull = [[cx - 24 * u, s * 0.7], [cx - 14 * u, s * 0.42], [cx + 10 * u, s * 0.38],
        [cx + 24 * u, s * 0.62], [cx + 8 * u, s * 0.74]];
      poly(g, hull, '#3c4048', '#22252b', u);
      poly(g, [[cx - 14 * u, s * 0.42], [cx + 10 * u, s * 0.38], [cx + 6 * u, s * 0.53],
        [cx - 10 * u, s * 0.56]], '#575d68', '#31353e', u * 0.8);
      poly(g, [[cx + 10 * u, s * 0.38], [cx + 24 * u, s * 0.62], [cx + 12 * u, s * 0.66],
        [cx + 6 * u, s * 0.53]], '#2f333b', '#1d2026', u * 0.8);
      g.save();
      g.strokeStyle = 'rgba(20,23,28,.6)'; g.lineWidth = 1.2 * u; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - 12 * u, s * 0.48);
      g.lineTo(cx - 4 * u, s * 0.58);
      g.lineTo(cx - 7 * u, s * 0.69);
      g.stroke();
      g.strokeStyle = 'rgba(190,200,215,.2)';
      g.beginPath();
      g.moveTo(cx - 10.6 * u, s * 0.48);
      g.lineTo(cx - 2.6 * u, s * 0.58);
      g.stroke();
      g.restore();
    },
    flower(g, s) {
      const u = s / 100, cx = s / 2;
      g.strokeStyle = '#3f5a2c'; g.lineWidth = 2 * u; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, s * 0.74);
      g.quadraticCurveTo(cx + 2 * u, s * 0.6, cx, s * 0.5);
      g.stroke();
      // leaves, which every flower has and this one did not
      for (const dir of [-1, 1]) {
        g.fillStyle = '#3f5a2c';
        g.beginPath();
        g.moveTo(cx, s * 0.66);
        g.quadraticCurveTo(cx + dir * 11 * u, s * 0.6, cx + dir * 13 * u, s * 0.7);
        g.quadraticCurveTo(cx + dir * 6 * u, s * 0.68, cx, s * 0.66);
        g.closePath(); g.fill();
      }
      // petals with a crease, and a shaded side
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * WS.TAU - 0.4;
        const px = cx + WS.cos(a) * 7 * u, py = s * 0.48 + WS.sin(a) * 7 * u;
        ellipse(g, px, py, 5.4 * u, 4.6 * u, '#b678c6', a);
        ellipse(g, px - WS.cos(a) * 1.2 * u, py - WS.sin(a) * 1.2 * u,
          4 * u, 3.2 * u, '#d9a6e6', a);
        g.save();
        g.strokeStyle = 'rgba(90,50,105,.4)'; g.lineWidth = 0.8 * u;
        g.beginPath();
        g.moveTo(cx + WS.cos(a) * 2.5 * u, s * 0.48 + WS.sin(a) * 2.5 * u);
        g.lineTo(cx + WS.cos(a) * 10 * u, s * 0.48 + WS.sin(a) * 10 * u);
        g.stroke();
        g.restore();
      }
      ellipse(g, cx, s * 0.48, 4 * u, 4 * u, '#ffe27a');
      ellipse(g, cx - 1.1 * u, s * 0.475, 2 * u, 1.8 * u, '#fff6cf');
    },
    mushroom(g, s) {
      const u = s / 100, cx = s / 2;
      const stalk = { hi: '#e2ddcd', mid: '#c9c4b4', lo: '#948f80', dark: '#5e5a4e',
        line: '#46423a', glow: '#fff' };
      shaded(g, cx, s * 0.61, 4.4 * u, 10 * u, stalk);
      // gills under the cap - the one part of a mushroom anybody can name
      g.save();
      g.strokeStyle = 'rgba(58,38,68,.75)'; g.lineWidth = 1 * u;
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.moveTo(cx + i * 2.4 * u, s * 0.525);
        g.lineTo(cx + i * 4.6 * u, s * 0.555);
        g.stroke();
      }
      g.restore();
      const cap = { hi: '#9a76a8', mid: '#6b4a7a', lo: '#472f52', dark: '#2c1c34',
        line: '#1f1326', glow: '#fff' };
      g.save();
      g.beginPath();
      g.ellipse(cx, s * 0.525, 18 * u, 11 * u, 0, WS.PI, WS.TAU);
      g.closePath();
      g.clip();
      shaded(g, cx, s * 0.525, 18 * u, 11 * u, cap);
      g.restore();
      for (const [dx, dy, r] of [[-6, -2.5, 3], [4, -3.5, 2.2], [9, -1, 1.6]]) {
        ellipse(g, cx + dx * u, s * 0.525 + dy * u, r * u, r * 0.8 * u, '#e6dced');
      }
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
      /* Weathering. A headstone that has stood long enough to be in a field
         full of monsters is chipped, streaked and half taken by moss. */
      g.save();
      g.beginPath();
      g.moveTo(s / 2 - 16 * u, s * 0.74); g.lineTo(s / 2 - 16 * u, s * 0.46);
      g.arc(s / 2, s * 0.46, 16 * u, WS.PI, 0);
      g.lineTo(s / 2 + 16 * u, s * 0.74); g.closePath();
      g.clip();
      const face = g.createLinearGradient(s / 2 - 16 * u, 0, s / 2 + 16 * u, 0);
      face.addColorStop(0, 'rgba(255,255,255,.14)');
      face.addColorStop(0.5, 'rgba(255,255,255,0)');
      face.addColorStop(1, 'rgba(0,0,0,.3)');
      g.fillStyle = face;
      g.fillRect(s / 2 - 16 * u, s * 0.3, 32 * u, s * 0.5);
      g.fillStyle = 'rgba(70,92,54,.42)';                          // moss at the foot
      g.beginPath();
      g.moveTo(s / 2 - 16 * u, s * 0.74);
      g.quadraticCurveTo(s / 2 - 4 * u, s * 0.63, s / 2 + 6 * u, s * 0.7);
      g.quadraticCurveTo(s / 2 + 12 * u, s * 0.66, s / 2 + 16 * u, s * 0.72);
      g.lineTo(s / 2 + 16 * u, s * 0.74);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(20,23,28,.4)'; g.lineWidth = 0.9 * u;  // a crack
      g.beginPath();
      g.moveTo(s / 2 + 9 * u, s * 0.4);
      g.lineTo(s / 2 + 6 * u, s * 0.56);
      g.lineTo(s / 2 + 11 * u, s * 0.72);
      g.stroke();
      g.restore();
      // and a chip out of the top edge
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(s / 2 + 12 * u, s * 0.41, 4 * u, 0, WS.TAU);
      g.fill();
      g.globalCompositeOperation = 'source-over';
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
      /* Two black dots on a grey circle is an emoji. A skull is a cranium
         with a brow over sunken sockets, a nasal cavity between them and a
         jaw hinged below - and on two of the five maps these are scattered
         everywhere the player looks. */
      const u = s / 100, cx = s / 2, cy = s * 0.55;
      const bone2 = { hi: '#d8dce4', mid: '#9aa0ac', lo: '#6b717c', dark: '#3f444d',
        line: '#282c33', glow: '#fff' };
      shaded(g, cx, cy, 16 * u, 14 * u, bone2);
      // the jaw, set back and below
      shaded(g, cx, cy + 12 * u, 10 * u, 6 * u, bone2);
      g.save();
      g.beginPath(); g.ellipse(cx, cy, 16 * u, 14 * u, 0, 0, WS.TAU); g.clip();
      // sockets, with a brow shadow over them
      for (const dir of [-1, 1]) {
        const ex = cx + dir * 6.4 * u;
        g.fillStyle = '#15181d';
        g.beginPath(); g.ellipse(ex, cy - 0.6 * u, 4.4 * u, 5 * u, dir * 0.12, 0, WS.TAU); g.fill();
        g.fillStyle = 'rgba(120,128,140,.35)';
        g.beginPath(); g.ellipse(ex + dir * 1.2 * u, cy + 1.8 * u, 2 * u, 1.6 * u, 0, 0, WS.TAU); g.fill();
      }
      g.fillStyle = 'rgba(21,24,29,.9)';
      g.beginPath();
      g.moveTo(cx, cy + 2 * u);
      g.lineTo(cx + 2.4 * u, cy + 7 * u);
      g.lineTo(cx - 2.4 * u, cy + 7 * u);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,44,51,.6)'; g.lineWidth = 1 * u;
      g.beginPath();
      g.moveTo(cx - 13 * u, cy - 5 * u);
      g.quadraticCurveTo(cx, cy - 9 * u, cx + 13 * u, cy - 5 * u);
      g.stroke();
      g.restore();
      // teeth
      g.fillStyle = '#1d2027';
      g.fillRect(cx - 6 * u, cy + 8.5 * u, 12 * u, 4 * u);
      g.fillStyle = 'rgba(216,220,228,.85)';
      for (let i = -2; i <= 2; i++) g.fillRect(cx + i * 2.4 * u - 0.5 * u, cy + 8.5 * u, 1.3 * u, 4 * u);
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
      /* Three green rectangles. A cactus is a set of ROUNDED columns with
         ribs down them and spines along the ribs - and on Ochre it is the
         only living thing on the map, so it can afford the three marks. */
      const u = s / 100, cx = s / 2;
      const flesh = { hi: '#6f9a5e', mid: '#4d7040', lo: '#2f4a28', dark: '#1c2e18',
        line: '#13200f', glow: '#fff' };
      const arm = (x, y, w, h) => {
        g.save();
        g.beginPath();
        g.moveTo(x - w, y + h);
        g.lineTo(x - w, y + w);
        g.quadraticCurveTo(x - w, y, x, y);
        g.quadraticCurveTo(x + w, y, x + w, y + w);
        g.lineTo(x + w, y + h);
        g.closePath();
        const grd = g.createLinearGradient(x - w, y, x + w, y);
        grd.addColorStop(0, flesh.lo);
        grd.addColorStop(0.4, flesh.mid);
        grd.addColorStop(0.72, flesh.hi);
        grd.addColorStop(1, flesh.lo);
        g.fillStyle = grd; g.fill();
        g.strokeStyle = flesh.line; g.lineWidth = 1.1 * u; g.stroke();
        g.save(); g.clip();
        g.strokeStyle = flesh.line; g.globalAlpha = 0.5; g.lineWidth = 0.9 * u;
        for (const k of [-0.45, 0.1, 0.55]) {
          g.beginPath();
          g.moveTo(x + k * w, y - 2 * u); g.lineTo(x + k * w, y + h);
          g.stroke();
        }
        g.restore();
        g.strokeStyle = 'rgba(226,222,190,.65)'; g.lineWidth = 0.8 * u;
        for (let i = 0; i < 5; i++) {
          const sy = y + w + (h - w) * (i / 5);
          for (const dir of [-1, 1]) {
            g.beginPath();
            g.moveTo(x + dir * w * 0.9, sy);
            g.lineTo(x + dir * (w + 2.6 * u), sy - 1.6 * u);
            g.stroke();
          }
        }
        g.restore();
      };
      arm(cx, s * 0.36, 6 * u, 38 * u);
      arm(cx - 14 * u, s * 0.5, 4 * u, 16 * u);
      arm(cx + 14 * u, s * 0.46, 4 * u, 20 * u);
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
    creature(art, tint, size, kit) {
      size = WS.round(size);
      const marks = (kit && kit.length) ? kit : null;
      const key = `c:${art}:${WS.hex(tint)}:${size}:${marks ? marks.join('') : ''}`;
      let c = cache.get(key);
      if (c) return c;
      const res = size * SS;
      const body = make(res, res);
      const p = palette(tint);
      const draw = CREATURES[art] || CREATURES.lampling;
      draw(body.getContext('2d'), res, p);
      /* The regalia goes on before the outline, so a crown gets the same one
         line round it that the creature does and the two read as one object
         rather than as a sticker on a sprite. */
      if (marks) {
        const b = bounds(body, res);
        if (b) regalia(body.getContext('2d'), res, p, marks, b);
      }
      c = outline(body, res, p);
      c.displaySize = size;
      cache.set(key, c);
      return c;
    },

    /** @param {number} [frame] stride frame, or undefined for standing. */
    hero(id, tint, size, demon, frame, pose, rank) {
      size = WS.round(size);
      /* Rank is part of the key for the same reason `demon` is: it changes
         what is drawn, so a survivor who earns something must not be served
         the canvas they had before it. Each rank bakes its own frames, which
         costs a few dozen more small canvases - the same as the demon form
         has always cost. */
      const r = rank ? WS.clamp(WS.floor(rank), 0, WS.Hero.maxRank) : 0;
      const key = `h:${id}:${WS.hex(tint)}:${size}:${demon ? 1 : 0}:${r}:`
        + (pose ? `${pose.kind}${pose.frame}` : (frame === undefined ? 'x' : frame));
      let c = cache.get(key);
      if (c) return c;
      const res = size * SS;
      c = make(res, res);
      // The survivor is drawn by src/render/hero.js, which owns the rig, the
      // roster and the light. This is the cache in front of it.
      /* One canvas per stride frame. Baked rather than transformed because
       * the parts that move are inside the drawing - a leg swinging from the
       * hip, a hem lagging the body - and only the size the game is played at
       * ever asks for more than the standing frame, so the cache grows by a
       * few dozen small canvases and nothing else changes. */
      if (pose) {
        /* A pose is baked like a stride frame and for the same reason: what
           moves is inside the drawing. The counts are small - four frames of
           a flinch, twelve of going down - so the cache grows by sixteen
           canvases for a survivor who has been hit, and by nothing at all for
           one who has not. */
        const n = WS.max(1, WS.Hero.poseFrames[pose.kind] || 1);
        WS.Hero.draw(c.getContext('2d'), res, id, tint, demon, undefined,
          { kind: pose.kind, k: n === 1 ? 0 : pose.frame / (n - 1) }, r);
        cache.set(key, c);
        return c;
      }
      WS.Hero.draw(c.getContext('2d'), res, id, tint, demon,
        frame === undefined ? undefined : frame / WS.Hero.frames, null, r);
      c.displaySize = size;
      cache.set(key, c);
      return c;
    },

    /** A character portrait: the survivor standing in their own light.
     *
     *  The roster used to show a 116px sprite floating in a grey box, which is
     *  the difference between a game's character select and a settings row.
     *  Same materials as everything else - there is no artwork to load - but
     *  composed as a picture: a lit ground they stand ON, a shadow that seats
     *  them, a wash of their own class colour behind, and a vignette to close
     *  the frame. */
    portrait(id, tint, size) {
      size = WS.round(size);
      const key = `pt:${id}:${WS.hex(tint)}:${size}`;
      let c = cache.get(key);
      if (c) return c;
      const res = size * SS;
      c = make(res, res);
      const g = c.getContext('2d');
      const u = res / 100;
      const p = palette(tint);
      const horizon = res * 0.67;

      // The room: dark at the edges, warmer where the subject stands.
      const room = g.createRadialGradient(res * 0.5, res * 0.46, 0, res * 0.5, res * 0.5, res * 0.72);
      room.addColorStop(0, '#171a24');
      room.addColorStop(0.55, '#0f121a');
      room.addColorStop(1, '#07080c');
      g.fillStyle = room;
      g.fillRect(0, 0, res, res);

      // Their colour, thrown up the back wall.
      const wash = g.createRadialGradient(res * 0.5, res * 0.58, 0, res * 0.5, res * 0.58, res * 0.5);
      wash.addColorStop(0, WS.rgb(tint, 0.24));
      wash.addColorStop(1, WS.rgb(tint, 0));
      g.fillStyle = wash;
      g.fillRect(0, 0, res, res);

      // The floor they are standing on, and its horizon line.
      const floor = g.createLinearGradient(0, horizon - 6 * u, 0, res);
      floor.addColorStop(0, 'rgba(0,0,0,.42)');
      floor.addColorStop(1, 'rgba(0,0,0,.08)');
      g.fillStyle = floor;
      g.fillRect(0, horizon - 6 * u, res, res - horizon + 6 * u);
      g.fillStyle = WS.rgb(tint, 0.16);
      g.fillRect(0, horizon - 1 * u, res, 1 * u);

      // A pool of light on the floor, then the shadow inside it.
      const pool = g.createRadialGradient(res * 0.5, horizon + 4 * u, 0, res * 0.5, horizon + 4 * u, res * 0.4);
      pool.addColorStop(0, WS.rgb(tint, 0.2));
      pool.addColorStop(1, WS.rgb(tint, 0));
      g.fillStyle = pool;
      g.beginPath();
      g.ellipse(res * 0.5, horizon + 4 * u, res * 0.4, res * 0.12, 0, 0, WS.TAU);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.beginPath();
      g.ellipse(res * 0.5, horizon + 5 * u, res * 0.17, res * 0.045, 0, 0, WS.TAU);
      g.fill();

      // The survivor, large enough to be a portrait rather than a token.
      const hs = WS.round(size * 0.66);
      const hero = WS.Sprites.hero(id, tint, hs);
      // The hero sprite plants its feet at 0.72 of its own canvas, so line that
      // up with the horizon rather than the sprite's box.
      g.drawImage(hero, (res - hs * SS) / 2, horizon - hs * SS * 0.72, hs * SS, hs * SS);

      // Close the frame.
      const vig = g.createRadialGradient(res * 0.5, res * 0.5, res * 0.3, res * 0.5, res * 0.5, res * 0.72);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,.5)');
      g.fillStyle = vig;
      g.fillRect(0, 0, res, res);

      c.displaySize = size;
      cache.set(key, c);
      return c;
    },

    /** A zone card: the battlefield at dusk, from its own palette.
     *
     *  The survivor gets a portrait, so a battlefield gets a landscape - a
     *  116px glyph adrift in a 184px frame was the one place the two halves of
     *  the picker did not match. No sigil struck over it: the zone's name is
     *  already set in 24px beside the card, and a symbol laid over a scene
     *  only competes with it. The tiles keep their glyph plates; this is the
     *  place itself.
     */
    zoneCard(map, sigil, size) {
      size = WS.round(size);
      const key = `zc:${map.name}:${size}`;
      let c = cache.get(key);
      if (c) return c;
      const res = size * SS;
      c = make(res, res);
      const g = c.getContext('2d');
      const horizon = res * 0.58;
      // Scattered once and cached by key, so the card is stable for the run.
      const rnd = WS.random;

      // Dusk, in the zone's own light: dark overhead, its accent at the skyline.
      const sky = g.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, WS.hex(WS.shade(map.ground, 0.30)));
      sky.addColorStop(0.62, WS.hex(WS.shade(map.groundAlt, 0.62)));
      sky.addColorStop(1, WS.hex(WS.mix(map.groundAlt, [1, 1, 1], 0.30)));
      g.fillStyle = sky;
      g.fillRect(0, 0, res, horizon);

      // A low sun sitting on the skyline - the one warm thing in the picture.
      const sun = g.createRadialGradient(res * 0.66, horizon, 0, res * 0.66, horizon, res * 0.34);
      sun.addColorStop(0, WS.rgb(WS.mix(map.groundAlt, [1, 1, 1], 0.7), 0.6));
      sun.addColorStop(1, WS.rgb(map.groundAlt, 0));
      g.fillStyle = sun;
      g.fillRect(0, 0, res, horizon);

      // Ground, mottled the way the battlefield itself is.
      g.fillStyle = WS.hex(WS.shade(map.ground, 0.9));
      g.fillRect(0, horizon, res, res - horizon);
      for (let i = 0; i < 120; i++) {
        const x = rnd() * res, y = horizon + rnd() * (res - horizon);
        const r = res * (0.02 + rnd() * 0.09);
        g.globalAlpha = 0.05 + rnd() * 0.12;
        g.fillStyle = WS.hex(rnd() < 0.5 ? map.groundAlt : WS.shade(map.ground, 0.5));
        g.beginPath(); g.ellipse(x, y, r, r * 0.45, 0, 0, WS.TAU); g.fill();
      }
      g.globalAlpha = 1;

      /* A treeline standing ON the horizon, in silhouette. prop() takes a
         DISPLAY size and rasterises at SS internally, so the size handed in
         and the size drawn at are not the same number - getting that backwards
         is why an earlier version had a row of specks. */
      if (map.props && map.props.length) {
        for (let i = 0; i < 11; i++) {
          const kind = map.props[WS.floor(rnd() * map.props.length)];
          const pd = WS.round(size * (0.16 + rnd() * 0.14));
          const sprite = WS.Sprites.prop(kind, pd);
          const px = (i / 10) * (res + pd * SS) - pd * SS * 0.5;
          g.save();
          g.globalAlpha = 0.7;
          // Darkened to a silhouette so the skyline reads as depth, not clutter.
          g.filter = 'brightness(.42) saturate(.7)';
          g.drawImage(sprite, px, horizon - pd * SS * 0.78, pd * SS, pd * SS);
          g.restore();
        }
      }

      // Ground haze along the skyline, then the frame closes.
      const haze = g.createLinearGradient(0, horizon - res * 0.06, 0, horizon + res * 0.1);
      haze.addColorStop(0, WS.rgb(map.groundAlt, 0.22));
      haze.addColorStop(1, WS.rgb(map.groundAlt, 0));
      g.fillStyle = haze;
      g.fillRect(0, horizon - res * 0.06, res, res * 0.16);

      const vig = g.createRadialGradient(res * 0.5, res * 0.5, res * 0.3, res * 0.5, res * 0.5, res * 0.76);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,.62)');
      g.fillStyle = vig;
      g.fillRect(0, 0, res, res);

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
    /** The house brushes, for painters that live outside this file - the
     *  finale's villains (src/render/villains.js) are drawn with the same
     *  shaded masses, cut polygons and socketed eyes as everything here. */
    paint: { palette, shaded, poly, eyes, ellipse, blade, legs, pelt, STONE },
    /** Adds an art from outside this file - the finale's machines are drawn
     *  by src/render/finale-art.js and their portraits come through here. */
    define(art, painter) { CREATURES[art] = painter; },
    clear() { cache.clear(); },
  };

})(window.WS);
