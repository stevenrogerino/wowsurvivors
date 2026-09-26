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
  const urls = new WeakMap();
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
  /** Beans' frog: a small green pond frog, round and pleased with itself,
   *  who follows her stall around trying to eat the stock. Sitting, or in
   *  the air mid-hop with its legs thrown out behind. Facing left. The
   *  tongue is not drawn here: the renderer flicks it at whatever the frog
   *  is after. */
  function drawFrog(g, s, p, hop) {
    const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
    const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
    const belly = { hi: '#fffbe0', mid: '#f1e7a6', lo: '#c9bc6c', dark: '#8a7c3a', line: p.line, glow: '#fff' };
    const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
    g.save();
    if (hop) { g.translate(X(50), Y(62)); g.rotate(-0.32); g.translate(-X(50), -Y(62)); }
    // hind legs: folded under when sitting, thrown out behind in the air
    if (hop) {
      limb(g, P([[64, 66], [78, 72], [90, 70], [97, 74]]), [8, 5.4, 3.6, 3.2].map(X), far);
      limb(g, P([[62, 70], [76, 80], [88, 82], [96, 86]]), [9, 6, 4, 3.4].map(X), p);
      for (const [fx, fy] of [[97, 74], [96, 86]]) poly(g, P([[fx, fy - 2.4], [fx + 5, fy - 3], [fx + 5.6, fy + 0.6], [fx + 4.6, fy + 3.2], [fx, fy + 2]]), p.mid, p.line, u * 0.5);
    } else {
      shaded(g, X(66), Y(76), X(14), X(10), far, -0.2);
      shaded(g, X(62), Y(80), X(15), X(10.4), p, -0.25);
      poly(g, P([[48, 86], [66, 86], [70, 89], [64, 91], [58, 89.4], [52, 91], [46, 89]]), p.mid, p.line, u * 0.6);
    }
    // the body: a round low teardrop, the head part of it
    const body = mass(g, P([[18, 60], [24, 50], [36, 45], [52, 47], [66, 54], [72, 66], [66, 78], [50, 83], [32, 82], [20, 74]]), p);
    g.save(); body(); g.clip();
    shaded(g, X(38), Y(76), X(20), X(9), belly);
    // spots, darker, of different sizes
    for (const [sx, sy, r] of [[50, 56, 3.4], [60, 62, 2.6], [42, 52, 2.2], [56, 71, 2.8], [66, 58, 1.8]]) {
      shaded(g, X(sx), Y(sy), X(r), X(r * 0.8), far);
    }
    g.restore();
    // the eyes: two domes on top, gold with a bar pupil, a catchlight each
    for (const [ex, ey, r] of [[31, 45, 7], [45, 43.4, 7.4]]) {
      shaded(g, X(ex), Y(ey), X(r), X(r * 0.92), p);
      const iris = g.createRadialGradient(X(ex - 1.4), Y(ey - 1.6), X(0.4), X(ex), Y(ey), X(r * 0.7));
      iris.addColorStop(0, '#fff6c0'); iris.addColorStop(0.6, '#e8c040'); iris.addColorStop(1, '#9a6a10');
      g.fillStyle = iris;
      g.beginPath(); g.arc(X(ex), Y(ey), X(r * 0.68), 0, WS.TAU); g.fill();
      g.fillStyle = '#0d0a06';
      g.beginPath(); g.ellipse(X(ex), Y(ey + 0.2), X(r * 0.42), X(r * 0.2), 0, 0, WS.TAU); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(X(ex - r * 0.28), Y(ey - r * 0.3), X(r * 0.16), 0, WS.TAU); g.fill();
      g.strokeStyle = p.line; g.lineWidth = u * 0.8;
      g.beginPath(); g.arc(X(ex), Y(ey), X(r * 0.68), WS.PI * 1.1, WS.PI * 1.9); g.stroke();
    }
    // the mouth: a long pleased line, a nostril, a blush
    g.strokeStyle = p.line; g.lineWidth = u * 1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(X(19), Y(61)); g.quadraticCurveTo(X(30), Y(67), X(44), Y(62)); g.stroke();
    g.fillStyle = p.line;
    g.beginPath(); g.arc(X(21.4), Y(54.4), X(0.7), 0, WS.TAU); g.fill();
    g.fillStyle = 'rgba(255,140,140,.3)';
    g.beginPath(); g.ellipse(X(40), Y(62), X(3), X(1.6), 0, 0, WS.TAU); g.fill();
    // front legs: planted when sitting, reaching forward in the air
    if (hop) {
      limb(g, P([[26, 72], [16, 78], [8, 76]]), [4.4, 3.4, 3].map(X), p);
      poly(g, P([[8, 73.6], [2, 72.6], [1.4, 76.4], [3.4, 79], [8, 78.4]]), p.mid, p.line, u * 0.5);
    } else {
      limb(g, P([[28, 74], [26, 82], [24, 88]]), [4.6, 3.6, 3.2].map(X), p);
      poly(g, P([[18, 88], [30, 88], [31, 90.6], [18.6, 91]]), p.mid, p.line, u * 0.5);
    }
    g.restore();
  }

  /** Where the head (and the shoulders) are, in the 100-unit box, for arts
   *  the crown line cannot find by width alone: [x, y, width] of each row. */
  const HEAD_AT = {
    shrikewing: { crown: [50, 20.6, 22] },
    ram: { crown: [27, 29, 14], shoulder: [56, 34, 26], plate: 0.6 },
    galewing: { crown: [50, 19, 16], shoulder: [50, 37, 22], plate: 0.55 },
    stonehide: { crown: [20, 46, 14], shoulder: [56, 28, 30], plate: 0.7 },
    karrash: { crown: [36.6, 12.6, 13], shoulder: [39.4, 26.4, 17], plate: 0.58 },
  };

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
        const y = b.crownY + 1 * u, x = b.mid(b.crownY), wr = WS.max(b.width(b.crownY) * 0.5, b.anchored ? 0 : b.w * 0.14);
        for (let i = -2; i <= 2; i++) {
          const h = (i === 0 ? 15 : Math.abs(i) === 1 ? 11 : 7) * u;
          poly(g, [[x + (i * 0.42 - 0.2) * wr, y], [x + i * 0.42 * wr, y - h],
            [x + (i * 0.42 + 0.2) * wr, y]], gold.mid, gold.line, u * 0.9);
        }
        poly(g, [[x - wr, y - 1 * u], [x + wr, y - 1 * u],
          [x + wr * 0.92, y + 4 * u], [x - wr * 0.92, y + 4 * u]], gold.hi, gold.line, u);
        // a finial on every point, and a line engraved along the band
        for (let i = -2; i <= 2; i++) {
          const h = (i === 0 ? 15 : Math.abs(i) === 1 ? 11 : 7) * u;
          const fx = x + i * 0.42 * wr, fy = y - h;
          g.fillStyle = gold.line; g.beginPath(); g.arc(fx, fy, 1.6 * u, 0, WS.TAU); g.fill();
          g.fillStyle = gold.hi; g.beginPath(); g.arc(fx - 0.3 * u, fy - 0.3 * u, 1.05 * u, 0, WS.TAU); g.fill();
        }
        g.strokeStyle = gold.lo; g.lineWidth = 0.6 * u;
        g.beginPath(); g.moveTo(x - wr * 0.9, y - 0.1 * u); g.lineTo(x + wr * 0.9, y - 0.1 * u); g.stroke();
        g.beginPath(); g.moveTo(x - wr * 0.86, y + 3.3 * u); g.lineTo(x + wr * 0.86, y + 3.3 * u); g.stroke();
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
        const y = b.crownY + 4 * u, x = b.mid(b.crownY), r = WS.max(b.width(b.crownY), b.anchored ? 0 : b.w * 0.34) * 0.62;
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
        /* Plate, not a slab. They were one grey quad with a row of teeth
           under it - read at boss size as a filing cabinet on each shoulder.
           A pauldron is three lames lapped over each other, a rolled and
           gilded edge, rivets where they are hung, and a spike to say what
           it is for. */
        const y = b.shoulderY !== undefined ? b.shoulderY : b.top + b.h * 0.40;
        const wr = b.width(y) * 0.46;
        for (const dir of [-1, 1]) {
          const x = b.mid(y) + dir * wr;
          // tilted down and out over the shoulder, and a touch smaller
          const tc = Math.cos(0.42), ts = Math.sin(0.42), sc = 0.86 * (b.plateScale || 1);
          const at = (dx, dy) => {
            const rx = dx * tc - dy * ts, ry = dx * ts + dy * tc;
            return [x + dir * rx * sc * u, y + ry * sc * u];
          };
          // the spike, behind the plates
          poly(g, [at(-1, -6), at(3, -17), at(5, -6)], iron.hi, iron.line, u * 0.8);
          // three lames, each a dome lapped over the one below it
          const dome = (cy, rx, ry) => {
            const pts = [];
            for (let i = 0; i <= 10; i++) {
              const a = WS.PI + (i / 10) * WS.PI;
              pts.push(at(1 + Math.cos(a) * rx, cy + Math.sin(a) * ry));
            }
            pts.push(at(1 + rx * 0.9, cy + 2.2), at(1 - rx * 0.9, cy + 2.2));
            return pts;
          };
          for (let k = 2; k >= 0; k--) {
            const cy = 0 + k * 3.2, rx = 10.5 - k * 1.2, ry = 6 - k * 1.4;
            poly(g, dome(cy, rx, ry), k ? iron.mid : iron.hi, iron.line, u * 0.8);
            const l = at(1 - rx * 0.9, cy + 2), r = at(1 + rx * 0.9, cy + 2);
            g.strokeStyle = gold.mid; g.lineWidth = 1.3 * u; g.lineCap = 'round';
            g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(r[0], r[1]); g.stroke();
            g.strokeStyle = gold.hi; g.lineWidth = 0.5 * u;
            g.beginPath(); g.moveTo(l[0], l[1] - 0.5 * u); g.lineTo(r[0], r[1] - 0.5 * u); g.stroke();
          }
          // light along the crown of the top plate
          g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 0.9 * u;
          g.beginPath();
          const c0 = at(-5.5, -4.6), c1 = at(-1, -7.2), c2 = at(3.5, -7);
          g.moveTo(c0[0], c0[1]); g.quadraticCurveTo(c1[0], c1[1], c2[0], c2[1]); g.stroke();
          for (const [rx, ry] of [[-5.5, 0.2], [7.4, 0.2]]) {
            const [px, py] = at(rx, ry);
            g.fillStyle = iron.line; g.beginPath(); g.arc(px, py + 0.3 * u, 1.1 * u, 0, WS.TAU); g.fill();
            g.fillStyle = gold.hi; g.beginPath(); g.arc(px - 0.2 * u, py, 0.7 * u, 0, WS.TAU); g.fill();
          }
        }

      } else if (mark === 'banner') {
        const x = b.cx + b.w * 0.40, y0 = b.top - b.h * 0.22, y1 = b.bottom - b.h * 0.1;
        g.strokeStyle = '#6d5233'; g.lineWidth = 2.6 * u; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y0); g.lineTo(x - 3 * u, y1); g.stroke();
        poly(g, [[x, y0 + 3 * u], [x + b.w * 0.24, y0 + 7 * u],
          [x + b.w * 0.19, y0 + b.h * 0.24], [x - 1 * u, y0 + b.h * 0.3]],
          p.mid, p.line, u);
        // a gold fringe along the fly and the foot
        g.strokeStyle = gold.mid; g.lineWidth = 0.8 * u;
        for (let k = 0; k < 6; k++) {
          const t = k / 5;
          const fx = x + b.w * 0.19 * t - 1 * u * (1 - t), fy = y0 + b.h * (0.3 - 0.06 * t);
          g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx - 0.5 * u, fy + 3 * u); g.stroke();
        }
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
          // the nose, the teeth, and the crack a trophy gets from being taken
          g.beginPath(); g.moveTo(x, y + drop + 4.8 * u); g.lineTo(x - 0.6 * u, y + drop + 5.9 * u);
          g.lineTo(x + 0.6 * u, y + drop + 5.9 * u); g.closePath(); g.fill();
          g.strokeStyle = bone.line; g.lineWidth = 0.5 * u;
          for (let k = -1; k <= 1; k++) {
            g.beginPath(); g.moveTo(x + k * 1.2 * u, y + drop + 6.6 * u); g.lineTo(x + k * 1.2 * u, y + drop + 7.8 * u); g.stroke();
          }
          g.beginPath(); g.moveTo(x + 1 * u, y + drop + 0.4 * u); g.lineTo(x + 0.2 * u, y + drop + 1.8 * u);
          g.lineTo(x + 0.9 * u, y + drop + 2.6 * u); g.stroke();
        }

      } else if (mark === 'brand') {
        /* A sigil burned into the chest, in the creature's OWN light. It was
           one gold triangle with a circle in it on four very different
           bosses - a harvest golem, a wraith, a colossus and Death - which is
           a logo, not a mark. Now a ring with its ticks, a star of four
           points inside it, and a hot centre, all in the creature's glow. */
        const y = b.top + b.h * 0.52, x = b.mid(y), r = WS.max(b.width(y) * 0.22, b.w * 0.1);
        const glowHex = p.glow;
        g.save();
        g.globalCompositeOperation = 'lighter';
        const gl = g.createRadialGradient(x, y, 1, x, y, r * 2.2);
        gl.addColorStop(0, glowHex + '80');
        gl.addColorStop(1, glowHex + '00');
        g.fillStyle = gl;
        g.beginPath(); g.arc(x, y, r * 2.2, 0, WS.TAU); g.fill();
        g.restore();
        g.save();
        g.shadowColor = glowHex; g.shadowBlur = 4 * u;
        g.strokeStyle = glowHex; g.lineWidth = 1.3 * u; g.lineCap = 'round';
        g.beginPath(); g.arc(x, y, r, 0, WS.TAU); g.stroke();
        for (let i = 0; i < 12; i++) {
          const a = i * WS.TAU / 12, r0 = r * 1.08, r1 = r * (i % 3 ? 1.2 : 1.34);
          g.beginPath(); g.moveTo(x + WS.cos(a) * r0, y + WS.sin(a) * r0); g.lineTo(x + WS.cos(a) * r1, y + WS.sin(a) * r1); g.stroke();
        }
        g.fillStyle = glowHex;
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = -WS.PI / 2 + i * WS.PI / 4, rr = i % 2 ? r * 0.22 : r * 0.78;
          if (i) g.lineTo(x + WS.cos(a) * rr, y + WS.sin(a) * rr); else g.moveTo(x + WS.cos(a) * rr, y + WS.sin(a) * rr);
        }
        g.closePath(); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(x, y, r * 0.16, 0, WS.TAU); g.fill();
        g.restore();

      } else if (mark === 'plumehat') {
        // A wide brim and a feather: a captain, not a private.
        const y = b.crownY + 3 * u, x = b.mid(b.crownY), wr = WS.max(b.width(b.crownY) * 0.68, b.anchored ? 0 : b.w * 0.2);
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

  /** A LIMB, as one tapered form from hip to foot.
   *
   *  The beasts' legs were stacks of ellipses - a thigh, a shin, a foot -
   *  and a stack of ellipses has a seam at every joint: a waist where two
   *  ovals meet, and a disc where the thigh sits on the body. A leg is one
   *  surface that narrows and bends. So this walks a centreline through the
   *  joints with a width at each, builds the outline either side of it, and
   *  shades it across its own axis, lit on the left like everything else.
   *  Coordinates and widths are in pixels; the ends are rounded.
   */
  function limb(g, pts, ws, p) {
    const n = pts.length;
    if (n < 2) return;
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[WS.max(0, i - 1)], b = pts[WS.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const h = ws[i] / 2;
      L.push([pts[i][0] + dy * h, pts[i][1] - dx * h]);
      R.push([pts[i][0] - dy * h, pts[i][1] + dx * h]);
    }
    const trace = () => {
      g.beginPath();
      g.moveTo(L[0][0], L[0][1]);
      for (let i = 1; i < n; i++) {
        const m = [(L[i - 1][0] + L[i][0]) / 2, (L[i - 1][1] + L[i][1]) / 2];
        if (i === 1) g.lineTo(m[0], m[1]); else g.quadraticCurveTo(L[i - 1][0], L[i - 1][1], m[0], m[1]);
      }
      g.lineTo(L[n - 1][0], L[n - 1][1]);
      const e = pts[n - 1], ea = Math.atan2(L[n - 1][1] - e[1], L[n - 1][0] - e[0]);
      g.arc(e[0], e[1], ws[n - 1] / 2, ea, ea + WS.PI, false);
      for (let i = n - 1; i > 0; i--) {
        const m = [(R[i - 1][0] + R[i][0]) / 2, (R[i - 1][1] + R[i][1]) / 2];
        if (i === n - 1) g.lineTo(m[0], m[1]); else g.quadraticCurveTo(R[i][0], R[i][1], m[0], m[1]);
      }
      g.lineTo(R[0][0], R[0][1]);
      const sa = Math.atan2(R[0][1] - pts[0][1], R[0][0] - pts[0][0]);
      g.arc(pts[0][0], pts[0][1], ws[0] / 2, sa, sa + WS.PI, false);
      g.closePath();
    };
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const q of L.concat(R)) {
      minX = WS.min(minX, q[0]); maxX = WS.max(maxX, q[0]); minY = WS.min(minY, q[1]); maxY = WS.max(maxY, q[1]);
    }
    const grd = g.createLinearGradient(minX, minY, maxX, minY + (maxX - minX) * 0.3);
    grd.addColorStop(0, p.hi); grd.addColorStop(0.4, p.mid); grd.addColorStop(1, p.lo);
    trace(); g.fillStyle = grd; g.fill();
    g.save();
    trace(); g.clip();
    // the ground under it: the foot end is darker than the hip
    const floor = g.createLinearGradient(0, minY, 0, maxY);
    floor.addColorStop(0, 'rgba(0,0,0,0)'); floor.addColorStop(1, 'rgba(0,0,0,.3)');
    g.fillStyle = floor; g.fillRect(minX - 2, minY - 2, maxX - minX + 4, maxY - minY + 4);
    // an inner edge, and a lit line down the front of it
    g.globalAlpha = 0.42; g.strokeStyle = p.line;
    g.lineWidth = WS.max(1.2, ws[0] * 0.16) * 2;
    trace(); g.stroke();
    g.globalAlpha = 0.4; g.strokeStyle = p.hi; g.lineCap = 'round';
    g.lineWidth = WS.max(0.8, ws[0] * 0.1);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const x = pts[i][0] * 0.55 + L[i][0] * 0.45, y = pts[i][1] * 0.55 + L[i][1] * 0.45;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
    g.restore();
  }

  /** A BODY, as one outline.
   *
   *  shaded() is an ellipse, and an animal built from ellipses has a seam
   *  wherever two of them overlap - the inner edge each one draws is a ring
   *  across whatever it is laid on. A stalking cat's back is not three
   *  circles: it is one line that rises over the shoulder blades, dips at
   *  the waist and rises again at the hips. This takes that line as points,
   *  runs a smooth closed curve through them, and lights it the way shaded()
   *  lights an ellipse - lit up and to the left, darker toward the ground,
   *  an inner edge, and light along the top. Returns the tracer, so a coat
   *  or markings can be clipped to exactly this outline.
   */
  function mass(g, pts, p) {
    const n = pts.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const trace = () => {
      g.beginPath();
      const m0 = mid(pts[n - 1], pts[0]);
      g.moveTo(m0[0], m0[1]);
      for (let i = 0; i < n; i++) {
        const m = mid(pts[i], pts[(i + 1) % n]);
        g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
      }
      g.closePath();
    };
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const q of pts) {
      minX = WS.min(minX, q[0]); maxX = WS.max(maxX, q[0]); minY = WS.min(minY, q[1]); maxY = WS.max(maxY, q[1]);
    }
    const w = maxX - minX, h = maxY - minY;
    const grd = g.createRadialGradient(minX + w * 0.32, minY + h * 0.22, WS.min(w, h) * 0.08,
      minX + w * 0.45, minY + h * 0.45, WS.max(w, h) * 0.8);
    grd.addColorStop(0, p.hi); grd.addColorStop(0.45, p.mid); grd.addColorStop(1, p.lo);
    trace(); g.fillStyle = grd; g.fill();
    g.save();
    trace(); g.clip();
    const floor = g.createLinearGradient(0, minY + h * 0.45, 0, maxY);
    floor.addColorStop(0, 'rgba(0,0,0,0)'); floor.addColorStop(1, 'rgba(0,0,0,.34)');
    g.fillStyle = floor; g.fillRect(minX - 2, minY - 2, w + 4, h + 4);
    g.globalAlpha = 0.34; g.strokeStyle = p.line;
    g.lineWidth = WS.max(1.4, WS.min(w, h) * 0.07) * 2;
    trace(); g.stroke();
    // light along the top of the form, fading down it
    g.save();
    g.beginPath(); g.rect(minX - 2, minY - 2, w + 4, h * 0.42); g.clip();
    g.globalAlpha = 0.38; g.strokeStyle = p.hi; g.lineWidth = WS.max(1, WS.min(w, h) * 0.05) * 2;
    trace(); g.stroke();
    g.restore();
    g.restore();
    return trace;
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
      /* A LAMPLING IS A LAMP THAT WALKS - the foreman's kind, and the first
         thing in the game that comes for you, so it should look like his
         family and not like an egg. A wax body with a pane of glass in the
         belly and a flame behind it, long lamp-fin ears, the family candle
         burning on its head, stubby legs, and a miner's pick over one
         shoulder that is much too big for it. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const BRASS = { hi: '#ffe7a8', mid: '#d4a04a', lo: '#8c5a1c', dark: '#5a3a10', line: '#3a2208', glow: '#fff' };
      const IRON = { hi: '#dfe3ea', mid: '#8d94a1', line: '#1d2129' };
      // the pick, over the far shoulder, behind the body
      g.save();
      g.lineCap = 'round';
      g.strokeStyle = '#2a1a0c'; g.lineWidth = 3.4 * u;
      g.beginPath(); g.moveTo(X(70), Y(78)); g.lineTo(X(62), Y(30)); g.stroke();
      g.strokeStyle = '#7a5530'; g.lineWidth = 2 * u;
      g.beginPath(); g.moveTo(X(70), Y(78)); g.lineTo(X(62), Y(30)); g.stroke();
      g.restore();
      poly(g, P([[50, 30], [60, 26], [74, 27], [84, 34], [74, 31], [62, 32]]), IRON.mid, IRON.line, u * 0.8);
      g.strokeStyle = IRON.hi; g.lineWidth = u * 0.7;
      g.beginPath(); g.moveTo(X(56), Y(28.4)); g.lineTo(X(72), Y(28)); g.stroke();
      // legs and feet
      for (const [lx, d] of [[42, -1], [58, 1]]) {
        shaded(g, X(lx), Y(80), X(4), X(6), p);
        shaded(g, X(lx - 1.4), Y(86.6), X(6), X(3), { hi: '#8a5a34', mid: '#5e3a1f', lo: '#35200f', dark: '#35200f', line: '#1e1108', glow: '#fff' });
        void d;
      }
      // the body: a squat lamp of wax
      shaded(g, X(50), Y(62), X(19), X(19), p);
      // the glass in its belly, and the light behind it
      g.save();
      g.beginPath();
      g.moveTo(X(40), Y(56)); g.lineTo(X(60), Y(56)); g.lineTo(X(58), Y(74)); g.lineTo(X(42), Y(74)); g.closePath();
      const gl = g.createLinearGradient(0, Y(56), 0, Y(74));
      gl.addColorStop(0, '#6a3a10'); gl.addColorStop(1, '#ffb44a');
      g.fillStyle = gl; g.fill();
      g.clip();
      g.globalCompositeOperation = 'lighter';
      const fl = g.createRadialGradient(X(50), Y(67), 0, X(50), Y(67), X(9));
      fl.addColorStop(0, 'rgba(255,230,160,.95)'); fl.addColorStop(1, 'rgba(255,160,60,0)');
      g.fillStyle = fl; g.fillRect(X(38), Y(54), X(24), Y(22));
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = u * 1;
      g.beginPath(); g.moveTo(X(43), Y(59)); g.lineTo(X(42), Y(69)); g.stroke();
      g.restore();
      g.strokeStyle = BRASS.line; g.lineWidth = u * 2;
      g.beginPath(); g.moveTo(X(40), Y(56)); g.lineTo(X(60), Y(56)); g.lineTo(X(58), Y(74)); g.lineTo(X(42), Y(74)); g.closePath(); g.stroke();
      g.strokeStyle = BRASS.mid; g.lineWidth = u * 1.1; g.stroke();
      g.beginPath(); g.moveTo(X(50), Y(56)); g.lineTo(X(50), Y(74)); g.stroke();
      // a belt with a buckle, and a strap across
      poly(g, P([[32, 72], [68, 72], [67, 76], [33, 76]]), '#5e3a1f', '#1e1108', u * 0.7);
      poly(g, P([[47.4, 71.4], [52.6, 71.4], [52.6, 76.6], [47.4, 76.6]]), BRASS.mid, BRASS.line, u * 0.6);
      // arms: the near one holding the haft, the far one on it too
      shaded(g, X(63), Y(56), X(4.4), X(7.4), p, 0.4);
      shaded(g, X(65.4), Y(50), X(3.6), X(3.2), p);
      shaded(g, X(35), Y(60), X(4.4), X(7.4), p, -0.4);
      shaded(g, X(33), Y(67), X(3.6), X(3.2), p);
      // the head, sunk into the body
      shaded(g, X(49), Y(40), X(13), X(12), p);
      // ear-fins, the family's, long and swept
      poly(g, P([[38, 38], [22, 28], [27, 35], [24, 36.4], [37, 43]]), p.mid, p.line, u * 0.9);
      poly(g, P([[60, 36], [74, 25], [70, 32], [73, 33.4], [61, 41]]), p.lo, p.line, u * 0.9);
      // eyes, a snub nose, and a grin with one tooth
      eyes(g, X(46), Y(40), X(4.2), X(1.6), '#ffcf5c');
      shaded(g, X(44.6), Y(44.4), X(2.6), X(2.2), { hi: '#ffc59a', mid: '#d9895e', lo: '#8a4a2c', dark: '#8a4a2c', line: '#4a2414', glow: '#fff' });
      g.strokeStyle = p.line; g.lineWidth = u * 0.9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(40), Y(47.4)); g.quadraticCurveTo(X(45), Y(50.4), X(51), Y(47.4)); g.stroke();
      poly(g, P([[44, 48.6], [45.6, 48.8], [44.8, 50.6]]), '#fff', '#8a8a8a', u * 0.3);
      // the candle on its head, and the flame
      poly(g, P([[46, 29], [52, 29], [52, 18], [46, 18]]), p.glow, p.line, u * 0.8);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(X(46.8), Y(18.4), X(1.4), Y(10));
      g.fillStyle = p.glow;
      for (const [x, len] of [[47.2, 4], [50.6, 6]]) {
        g.beginPath(); g.moveTo(X(x - 0.8), Y(18.4)); g.lineTo(X(x - 0.6), Y(18.4 + len));
        g.arc(X(x), Y(18.4 + len), X(0.7), WS.PI, 0, true); g.lineTo(X(x + 0.8), Y(18.4)); g.fill();
      }
      poly(g, P([[44.6, 29], [53.4, 29], [53, 31.4], [45, 31.4]]), BRASS.mid, BRASS.line, u * 0.6);
      g.save(); g.shadowColor = '#ffcf6b'; g.shadowBlur = 10 * u;
      g.fillStyle = '#ffe6a8';
      g.beginPath(); g.ellipse(X(49), Y(13.6), X(2.4), X(4.2), 0, 0, WS.TAU); g.fill();
      g.fillStyle = '#fffaf0';
      g.beginPath(); g.ellipse(X(49), Y(15), X(1.1), X(2), 0, 0, WS.TAU); g.fill();
      g.restore();
    },

    mongrel(g, s, p) {
      /* THE SNARLPACK: hyena-men, not an egg with ears. What reads as a
         scavenger pack is the hyena's own shape - shoulders high and hips
         low so the back slopes away, a bristling mane down it, a spotted
         coat, round ears, and a long grinning snout thrust out in front on a
         thick neck. They stand, just, on bent legs, with a rag of a
         loincloth and a cleaver made of a bone and a piece of iron. The
         Bonesnapper and Gnarlfang wear this body too. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const spots = (cx, cy, rx, ry, rot, n, seed) => {
        g.save();
        g.beginPath(); g.ellipse(X(cx), Y(cy), X(rx), X(ry), rot, 0, WS.TAU); g.clip();
        g.fillStyle = p.dark; g.globalAlpha = 0.45;
        for (let i = 0; i < n; i++) {
          const h = Math.sin((i + seed) * 91.7) * 43758.5; const r = h - Math.floor(h);
          const h2 = Math.sin((i + seed) * 17.3) * 12345.6; const r2 = h2 - Math.floor(h2);
          g.beginPath();
          g.ellipse(X(cx - rx + r * rx * 2), Y(cy - ry + r2 * ry * 2), X(1.2 + r * 1.4), X(0.9 + r2), r * 3, 0, WS.TAU);
          g.fill();
        }
        g.restore();
      };
      // far leg, far arm with the cleaver held back
      shaded(g, X(60), Y(74), X(4.6), X(8), far, -0.3);
      shaded(g, X(63), Y(83), X(2.6), X(5.4), far, 0.35);
      poly(g, P([[58, 86.4], [64, 86.4], [64.6, 89.6], [55.6, 89.8]]), far.mid, far.line, u * 0.6);
      // the cleaver: a long bone for a haft, a slab of iron lashed to it
      g.save();
      g.lineCap = 'round';
      g.strokeStyle = '#3d392f'; g.lineWidth = u * 3.2;
      g.beginPath(); g.moveTo(X(70), Y(58)); g.lineTo(X(78), Y(30)); g.stroke();
      g.strokeStyle = '#d8d0bd'; g.lineWidth = u * 2;
      g.beginPath(); g.moveTo(X(70), Y(58)); g.lineTo(X(78), Y(30)); g.stroke();
      g.restore();
      shaded(g, X(78.4), Y(29.4), X(2.4), X(2.2), { hi: '#f2ede0', mid: '#d8d0bd', lo: '#9a9280', dark: '#5e594c', line: '#3d392f', glow: '#fff' });
      poly(g, P([[74, 32], [86, 26], [89, 36], [78, 42]]), '#8a8f98', '#2a2e36', u * 0.8);
      g.fillStyle = 'rgba(140,70,30,.5)';
      g.beginPath(); g.ellipse(X(84), Y(33), X(2.4), X(1.6), 0.4, 0, WS.TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = u * 0.6;
      g.beginPath(); g.moveTo(X(86.2), Y(27)); g.lineTo(X(88.6), Y(35)); g.stroke();
      g.strokeStyle = '#4a3a28'; g.lineWidth = u * 1.1;
      for (const t of [0.2, 0.34]) { g.beginPath(); g.moveTo(X(74.6 + t * 4), Y(38 - t * 16)); g.lineTo(X(78.6 + t * 4), Y(36 - t * 16)); g.stroke(); }
      shaded(g, X(64), Y(52), X(3.8), X(9), far, -0.7);
      shaded(g, X(69.4), Y(57.4), X(2.8), X(2.6), far);
      // the body: high shoulders, the back sloping down to low hips
      shaded(g, X(56), Y(66), X(10), X(9), p, 0.3);
      shaded(g, X(45), Y(52), X(15), X(13), p, -0.5);
      spots(45, 52, 15, 13, -0.5, 12, 3);
      spots(56, 66, 10, 9, 0.3, 6, 11);
      // the pale throat and belly
      g.save();
      g.beginPath(); g.ellipse(X(45), Y(52), X(15), X(13), -0.5, 0, WS.TAU); g.clip();
      g.fillStyle = 'rgba(255,248,232,.16)';
      g.beginPath(); g.ellipse(X(36), Y(58), X(6), X(10), -0.4, 0, WS.TAU); g.fill();
      g.restore();
      // the loincloth, and a belt of trinkets
      poly(g, P([[48, 64], [64, 66], [63, 72], [58, 78], [55, 71], [50, 76], [47, 70]]), '#4a3a2a', '#1a1208', u * 0.6);
      g.strokeStyle = '#2a1e14'; g.lineWidth = u * 1.6;
      g.beginPath(); g.moveTo(X(47), Y(65)); g.lineTo(X(64), Y(67)); g.stroke();
      for (const [tx, ty] of [[52, 66.4], [58, 67.2]]) {
        g.fillStyle = '#e6dcc0';
        g.beginPath(); g.moveTo(X(tx - 0.8), Y(ty)); g.lineTo(X(tx), Y(ty + 3.4)); g.lineTo(X(tx + 0.8), Y(ty)); g.fill();
      }
      // near leg: bent, a long foot, claws
      shaded(g, X(49), Y(74), X(5.2), X(8.4), p, -0.35);
      shaded(g, X(46.4), Y(83), X(3), X(5.6), p, 0.25);
      poly(g, P([[43, 86], [50, 86.2], [50.4, 89.6], [39, 89.8], [39.6, 88]]), p.mid, p.line, u * 0.6);
      for (let i = 0; i < 3; i++) poly(g, P([[39.6 + i * 1.6, 88.6], [37.6 + i * 1.6, 90], [40.4 + i * 1.6, 89.6]]), '#e9edf5', '#6a7080', u * 0.4);
      // the mane: a ridge of bristles from the crown down the slope of the back
      for (let i = 0; i < 10; i++) {
        const t = i / 9, bx = 38 + t * 24, by = 36 + t * 22 - Math.sin(t * WS.PI) * 4;
        const len = 5 + Math.sin(t * WS.PI) * 4;
        poly(g, P([[bx - 1.8, by + 1.6], [bx + 1.8 - len * 0.1, by - len], [bx + 2.2, by + 1.6]]), i % 2 ? p.dark : p.lo, p.line, u * 0.5);
      }
      // the near arm, long, reaching forward with the claws out
      shaded(g, X(37), Y(56), X(3.8), X(9), p, 0.5);
      shaded(g, X(31), Y(66), X(3.2), X(7), p, 0.15);
      for (let i = 0; i < 3; i++) {
        const cx = 28.4 + i * 1.8;
        poly(g, P([[cx - 0.8, 71.6], [cx - 1.6, 75.4], [cx + 0.6, 72]]), '#e9edf5', '#6a7080', u * 0.4);
      }
      // the neck, thick, and the head thrust out in front
      shaded(g, X(33), Y(38), X(7), X(8), p, -0.8);
      shaded(g, X(24), Y(33), X(8.4), X(7.4), p);
      spots(24, 33, 8.4, 7.4, 0, 4, 21);
      // round ears, one cocked
      poly(g, P([[25.6, 28], [27.4, 20.6], [29.6, 19.8], [31, 22], [29.6, 28.6]]), p.lo, p.line, u * 0.6);
      poly(g, P([[20, 27.4], [20.6, 21.2], [22.6, 20.4], [23.8, 22.6], [23.4, 27.8]]), p.mid, p.line, u * 0.6);
      g.fillStyle = 'rgba(40,20,20,.5)';
      g.beginPath(); g.ellipse(X(28.6), Y(23.8), X(0.9), X(2.2), 0.3, 0, WS.TAU); g.fill();
      // the snout: long, dark at the muzzle, grinning
      poly(g, P([[18, 29], [6, 32], [5, 35.6], [9, 37], [18, 37]]), p.mid, p.line, u * 0.8);
      poly(g, P([[9, 33], [5.2, 32.6], [5, 35.6], [9, 36.4]]), '#1e1614', '#0a0706', u * 0.5);
      g.fillStyle = '#0a0706';
      g.beginPath(); g.ellipse(X(5.8), Y(33.4), X(1.2), X(1), 0, 0, WS.TAU); g.fill();
      g.strokeStyle = '#1e1414'; g.lineWidth = u * 0.8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(7), Y(36.2)); g.quadraticCurveTo(X(13), Y(38), X(19), Y(35.4)); g.stroke();
      for (let i = 0; i < 4; i++) poly(g, P([[9 + i * 2.4, 36.4], [9.7 + i * 2.4, 38.4], [10.4 + i * 2.4, 36.6]]), '#fff', '#8a8a8a', u * 0.3);
      eyes(g, X(21), Y(30.4), X(0.01), X(1.7), '#ffb347');
      g.strokeStyle = p.line; g.lineWidth = u * 1; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(17.6), Y(28.6)); g.lineTo(X(23.6), Y(28)); g.stroke();
    },

    bandit(g, s, p) {
      /* A KERCHIEF: a cutthroat, lean and quick, not an egg in a coat. The
         family colour is the kerchief up over the face and the sash round
         the waist - the Admiral's men dress like him on a smaller budget -
         with a leather vest over a loose shirt, breeches into boots, a
         hood pushed back, and a curved knife held low. Captain Redcowl is
         drawn on this, so the hat and plate he wears land on a person. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const SKIN = { hi: '#e2c7a8', mid: '#bf9d7c', lo: '#7c604a', dark: '#5e4b3c', line: '#46362a', glow: '#fff' };
      const LEATHER = { hi: '#8a6a4a', mid: '#5e4430', lo: '#35261a', dark: '#2a1e14', line: '#1a120c', glow: '#fff' };
      const SHIRT = '#d9d0bc', SHIRT_LO = '#9c927e';
      const BOOT = '#241a14';
      // legs: breeches into boots, a stride
      for (const [hx, fx, far] of [[55, 60, 1], [45, 39, 0]]) {
        poly(g, P([[hx - 4, 62], [hx + 4, 62], [fx + 3.6, 76], [fx - 3.6, 76]]), far ? LEATHER.lo : LEATHER.mid, LEATHER.line, u * 0.7);
        poly(g, P([[fx - 3.8, 74], [fx + 3.8, 74], [fx + 3.6, 86], [fx - 3.6, 86]]), BOOT, '#0a0604', u * 0.7);
        poly(g, P([[fx - 4.4, 73], [fx + 4.4, 73], [fx + 4, 76], [fx - 4, 76]]), '#3a2a1e', '#0a0604', u * 0.6);
        poly(g, P([[fx - 3.6, 85], [fx + 3.6, 85], [fx + 3.2, 89], [fx - 8, 89.4], [fx - 7.6, 87]]), BOOT, '#0a0604', u * 0.6);
      }
      // the body: a shirt under an open leather vest
      poly(g, P([[38, 36], [62, 36], [64, 62], [36, 62]]), SHIRT, SHIRT_LO, u * 0.8);
      g.save();
      g.beginPath(); P([[38, 36], [62, 36], [64, 62], [36, 62]]).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
      g.strokeStyle = 'rgba(80,70,56,.45)'; g.lineWidth = u * 0.8;
      for (const x of [44, 50, 56]) { g.beginPath(); g.moveTo(X(x), Y(38)); g.quadraticCurveTo(X(x + 1), Y(50), X(x - 1), Y(62)); g.stroke(); }
      g.restore();
      for (const d of [-1, 1]) {
        poly(g, P([[50 + d * 3, 36], [50 + d * 13, 36], [50 + d * 14.6, 62], [50 + d * 6, 62], [50 + d * 4, 46]]), d > 0 ? LEATHER.lo : LEATHER.mid, LEATHER.line, u * 0.8);
      }
      g.strokeStyle = LEATHER.hi; g.lineWidth = u * 0.6;
      g.beginPath(); g.moveTo(X(46), Y(37)); g.lineTo(X(45.4), Y(46)); g.stroke();
      // the sash, red, knotted at the hip with the ends hanging
      poly(g, P([[35, 56], [65, 56], [65.6, 62], [34.4, 62]]), p.mid, p.line, u * 0.7);
      g.strokeStyle = p.hi; g.lineWidth = u * 0.6; g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(X(35), Y(57.4)); g.lineTo(X(65), Y(57.4)); g.stroke(); g.globalAlpha = 1;
      poly(g, P([[60, 60], [64, 61], [63, 72], [60.6, 70]]), p.lo, p.line, u * 0.6);
      poly(g, P([[62.6, 60], [66, 61], [67, 69], [64.6, 68]]), p.mid, p.line, u * 0.6);
      // arms: the far one back, the near one forward and low with the knife
      poly(g, P([[62, 37], [67, 39], [69, 52], [65, 53], [63, 44]]), SHIRT, SHIRT_LO, u * 0.7);
      shaded(g, X(67), Y(55), X(2.6), X(2.4), SKIN);
      poly(g, P([[38, 37], [33, 40], [28, 52], [32, 54], [36, 45]]), SHIRT, SHIRT_LO, u * 0.7);
      poly(g, P([[27.6, 50], [32.6, 52.4], [31.6, 55], [27, 53]]), LEATHER.mid, LEATHER.line, u * 0.6);   // bracer
      shaded(g, X(28.4), Y(56), X(2.8), X(2.6), SKIN);
      // the knife: curved, held low and forward
      g.save();
      g.translate(X(27), Y(57)); g.rotate(-0.6);
      poly(g, [[-X(0.8), 0], [X(0.8), 0], [X(1.6), -Y(9)], [-X(2.6), -Y(15)], [-X(0.8), -Y(8)]], '#d7dbe6', '#4a5160', u * 0.5);
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = u * 0.4;
      g.beginPath(); g.moveTo(X(0.4), -Y(1)); g.lineTo(-X(1.6), -Y(13)); g.stroke();
      poly(g, [[-X(2.4), -Y(0.4)], [X(2.4), -Y(0.4)], [X(2.4), Y(0.8)], [-X(2.4), Y(0.8)]], '#8a6118', '#3a2606', u * 0.4);
      poly(g, [[-X(0.9), Y(0.8)], [X(0.9), Y(0.8)], [X(0.9), Y(5)], [-X(0.9), Y(5)]], LEATHER.lo, LEATHER.line, u * 0.4);
      g.restore();
      // the head: a hood pushed back, the kerchief up over the face
      poly(g, P([[39, 36], [42, 21], [53, 17], [61, 23], [62, 36]]), LEATHER.lo, LEATHER.line, u * 0.8);
      shaded(g, X(49), Y(27), X(8.4), X(9), SKIN);
      poly(g, P([[40.4, 20], [49, 17.4], [57.4, 20.4], [57, 24.6], [49, 22.6], [41, 24.4]]), '#2a1e18', '#0f0a08', u * 0.6);   // hair
      poly(g, P([[40.2, 27.6], [57.8, 27], [57, 33], [49, 37.6], [41.2, 33.4]]), p.mid, p.line, u * 0.8);                 // kerchief
      g.save();
      g.beginPath(); P([[40.2, 27.6], [57.8, 27], [57, 33], [49, 37.6], [41.2, 33.4]]).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
      g.fillStyle = 'rgba(255,230,220,.5)';
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(X(42.6 + i * 3.4), Y(30.4 + (i % 2)), X(0.5), 0, WS.TAU); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(X(53), Y(33), X(5), X(3.4), 0, 0, WS.TAU); g.fill();
      g.restore();
      poly(g, P([[57.4, 27.6], [62, 29.4], [60.6, 31.6], [57.6, 30.6]]), p.lo, p.line, u * 0.6);
      eyes(g, X(47.6), Y(25.2), X(3.6), X(1.3), '#fff0d0');
      g.strokeStyle = SKIN.line; g.lineWidth = u * 0.8; g.lineCap = 'round';
      for (const d of [-1, 1]) { g.beginPath(); g.moveTo(X(47.6 + d * 1.6), Y(23)); g.lineTo(X(47.6 + d * 5.6), Y(22.2)); g.stroke(); }
    },

    brute(g, s, p) {
      /* THE BRUISER, redrawn. It was a round red ball with two fists - a
         likeable shape, and not a person. The Kerchiefs' muscle is a big man:
         a barrel chest under a shirt in the gang's colour, a leather vest,
         arms thicker than his legs ending in brass knuckles, a small bald
         head on no neck at all, and the red kerchief over his face that says
         whose he is. Width is still what tells him from the footpads. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const skin = { hi: '#e0b08c', mid: '#b98462', lo: '#8a5c42', dark: '#5a3a28', line: '#2a180e', glow: '#fff' };
      const skinFar = { hi: skin.mid, mid: skin.lo, lo: skin.dark, dark: skin.dark, line: skin.line, glow: '#fff' };
      const leather = { hi: '#8a6440', mid: '#5e4228', lo: '#402c1a', dark: '#28190e', line: '#140c06', glow: '#fff' };
      const trouser = { hi: '#5a5660', mid: '#3e3a44', lo: '#2a2830', dark: '#1a181e', line: '#0c0a0e', glow: '#fff' };
      const brass = { hi: '#ffe0a0', mid: '#d8a848', lo: '#9a7020', dark: '#5a400e', line: '#2a1c06', glow: '#fff' };
      // legs, short and planted, in boots
      for (const [x0, x1, pal] of [[57, 58, trouser], [43, 41, trouser]]) {
        limb(g, P([[x0, 64], [x1, 76], [x1, 84]]), [13, 11, 10].map(X), pal);
        shaded(g, X(x1 - 1.5), Y(86), X(8), X(3.4), leather);
      }
      // far arm, hanging at his side with its fist
      limb(g, P([[66, 34], [75, 48], [71, 60]]), [13, 11, 10].map(X), skinFar);
      shaded(g, X(71), Y(62), X(6.5), X(6), skinFar);
      // the body: a barrel, in the gang's colour
      const body = mass(g, P([[30, 38], [38, 28], [50, 26], [62, 28], [71, 38], [71, 54], [64, 67], [36, 67], [29, 54]]), p);
      g.save(); body(); g.clip();
      // the vest: two leather panels either side of the shirt
      poly(g, P([[26, 30], [42, 28], [40, 70], [26, 70]]), leather.mid, leather.line, u * 0.6);
      poly(g, P([[58, 28], [74, 30], [74, 70], [60, 70]]), leather.lo, leather.line, u * 0.6);
      g.strokeStyle = 'rgba(255,230,190,.35)'; g.lineWidth = u * 0.6; g.setLineDash([X(1.4), X(1.4)]);
      g.beginPath(); g.moveTo(X(40), Y(30)); g.lineTo(X(38.5), Y(66)); g.moveTo(X(60), Y(30)); g.lineTo(X(61.5), Y(66)); g.stroke();
      g.setLineDash([]);
      // the belly, and the belt that is losing the argument with it
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.beginPath(); g.ellipse(X(50), Y(52), X(11), X(10), 0, 0, WS.TAU); g.fill();
      g.restore();
      poly(g, P([[33, 58], [67, 58], [67, 63], [33, 63]]), leather.mid, leather.line, u * 0.6);
      poly(g, P([[46, 57], [54, 57], [54, 64], [46, 64]]), brass.mid, brass.line, u * 0.6);
      poly(g, P([[48, 59], [52, 59], [52, 62], [48, 62]]), leather.dark, brass.line, u * 0.4);
      // the head: small, bald, sunk between the shoulders
      const head = mass(g, P([[42, 22], [44, 13], [50, 10], [57, 13], [58, 22], [55, 29], [45, 29]]), skin);
      g.save(); head(); g.clip();
      g.fillStyle = 'rgba(255,245,230,.35)';
      g.beginPath(); g.ellipse(X(48), Y(14), X(4), X(2.4), -0.3, 0, WS.TAU); g.fill();
      g.restore();
      shaded(g, X(57.5), Y(20), X(1.8), X(2.6), skin);                 // ear
      // brows down, eyes narrow
      g.strokeStyle = skin.line; g.lineWidth = u * 1.3; g.lineCap = 'round';
      for (const [x0, y0, x1, y1] of [[43.5, 16.4], [51, 16.6]].map(([x, y]) => [x, y, x + 4.6, y + 1.2])) {
        g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke();
      }
      g.fillStyle = '#1a0e08';
      for (const x of [46, 53]) { g.beginPath(); g.ellipse(X(x), Y(19), X(1.1), X(0.8), 0, 0, WS.TAU); g.fill(); }
      // the kerchief, over the nose and mouth, knotted behind
      const kp = P([[42.6, 21], [57.4, 21], [56, 26], [50, 31], [44, 26]]);
      poly(g, kp, p.mid, p.line, u * 0.6);
      g.fillStyle = 'rgba(255,240,230,.7)';
      for (const [x, y] of [[46, 23], [50, 25], [54, 23], [49, 28]]) { g.beginPath(); g.arc(X(x), Y(y), X(0.6), 0, WS.TAU); g.fill(); }
      poly(g, P([[57, 21.5], [61, 20], [60.5, 24], [57, 23]]), p.lo, p.line, u * 0.5);
      // near arm: the big one, fist forward, in brass knuckles
      limb(g, P([[34, 34], [24, 46], [25, 58]]), [14, 12, 11].map(X), skin);
      shaded(g, X(25), Y(61), X(7.4), X(6.6), skin);
      for (let k = 0; k < 4; k++) shaded(g, X(20.5 + k * 3), Y(63.6), X(1.8), X(1.5), brass);
      poly(g, P([[19, 62.4], [31.5, 62.4], [31.5, 64.4], [19, 64.4]]), brass.mid, brass.line, u * 0.5);
    },

    rumblegut(g, s, p) {
      /* THE RUMBLEGUT: the Kerchiefs' old brute, back by popular demand.
         The Bruiser and the Enforcer were redrawn as men in 335cfd7, and a
         tester missed the round red thing they used to be - so it came back
         as a creature of its own rather than being lost. Drawn exactly as it
         was: one round mass, a head sunk into it, iron knuckles, and eyes. */
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
      /* THE GILKIN, redrawn. It was two stacked green ovals seen from the
         front - a perfect outline with nothing inside it, on the first map
         every player sees. A gilkin is a hunched thing from the riverbank
         that walks like it has not quite decided to: side-on, head slung
         forward and low, a mouth that goes most of the way round it, eyes
         sitting up on top like a frog's, a spined fin down the back, gangly
         arms and big splayed webbed feet. Faces left like everything else. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const web = (pts, pal) => poly(g, P(pts), pal.lo, pal.line, u * 0.6);
      // far leg and foot
      limb(g, P([[58, 62], [66, 73], [60, 84]]), [8, 6, 4.5].map(X), far);
      web([[53, 86], [58, 82], [64, 83], [68, 87], [62, 88]], far);
      // the dorsal fin, behind the body: a membrane between spines
      const fin = [[46, 30], [50, 20], [55, 27], [58, 19], [62, 30], [66, 25], [67, 37], [72, 34], [70, 48]];
      poly(g, P(fin.concat([[64, 44], [52, 36]])), p.lo, p.line, u * 0.6);
      g.save(); g.strokeStyle = p.line; g.globalAlpha = 0.6; g.lineWidth = u * 0.8;
      for (const [x, y] of [[50, 20], [58, 19], [66, 25], [72, 34]]) { g.beginPath(); g.moveTo(X(x), Y(y)); g.lineTo(X(x - 2), Y(y + 14)); g.stroke(); }
      g.restore();
      // far arm, hanging forward
      limb(g, P([[50, 44], [42, 54], [34, 59]]), [6, 4.4, 3.6].map(X), far);
      web([[29, 58], [33, 56], [36, 60], [33, 64], [29, 63]], far);
      // the body: a hunched pear
      const body = mass(g, P([[40, 44], [47, 35], [60, 34], [68, 42], [71, 56], [66, 67], [52, 71], [41, 66], [36, 55]]), p);
      g.save(); body();  g.clip();
      g.fillStyle = 'rgba(255,255,240,.28)';
      g.beginPath(); g.ellipse(X(46), Y(59), X(10), X(11), -0.2, 0, WS.TAU); g.fill();
      g.strokeStyle = p.line; g.globalAlpha = 0.3; g.lineWidth = u * 0.9;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(X(38), Y(52 + i * 4.5)); g.quadraticCurveTo(X(46), Y(55 + i * 4.5), X(54), Y(52 + i * 4.5)); g.stroke(); }
      g.globalAlpha = 0.32; g.fillStyle = p.dark;
      for (const [x, y, r] of [[60, 42, 3], [65, 52, 2.4], [56, 50, 1.8], [62, 60, 2.2]]) {
        g.beginPath(); g.ellipse(X(x), Y(y), X(r), X(r * 0.7), 0, 0, WS.TAU); g.fill();
      }
      g.restore();
      // near leg: bent, knee forward, and a big splayed foot
      limb(g, P([[50, 64], [57, 75], [48, 85]]), [9, 7, 5].map(X), p);
      web([[38, 88], [43, 83], [50, 83], [55, 88], [48, 90]], p);
      g.save(); g.strokeStyle = p.line; g.lineWidth = u * 0.6; g.globalAlpha = 0.7;
      for (const [x0, y0, x1, y1] of [[43, 84, 39, 88], [47, 84, 46, 89], [51, 84, 53, 89]]) { g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke(); }
      g.restore();
      // the head, slung forward and low
      const head = mass(g, P([[16, 36], [21, 26], [33, 21], [45, 24], [51, 33], [48, 43], [34, 49], [20, 47]]), p);
      g.save(); head(); g.clip();
      g.fillStyle = 'rgba(255,255,240,.22)';
      g.beginPath(); g.ellipse(X(30), Y(46), X(14), X(5), 0, 0, WS.TAU); g.fill();
      g.restore();
      // side frill behind the jaw
      poly(g, P([[44, 28], [55, 22], [54, 30], [58, 33], [48, 38]]), p.lo, p.line, u * 0.6);
      // gills
      g.save(); g.strokeStyle = p.line; g.globalAlpha = 0.65; g.lineWidth = u; g.lineCap = 'round';
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(X(42 + i * 2.6), Y(34)); g.quadraticCurveTo(X(40 + i * 2.6), Y(38), X(42 + i * 2.6), Y(42)); g.stroke(); }
      g.restore();
      // the mouth: most of the way round the head, with small teeth
      g.fillStyle = '#1a0e0c';
      g.beginPath(); g.moveTo(X(15.5), Y(37)); g.quadraticCurveTo(X(26), Y(46), X(41), Y(41));
      g.quadraticCurveTo(X(27), Y(41.5), X(15.5), Y(37)); g.fill();
      g.fillStyle = '#f4efe0';
      for (let i = 0; i < 6; i++) {
        const t = 0.1 + i * 0.15, x = 15.5 + (41 - 15.5) * t, y = 37 + (41 - 37) * t + Math.sin(t * Math.PI) * 2.6;
        g.beginPath(); g.moveTo(X(x - 0.8), Y(y - 0.6)); g.lineTo(X(x), Y(y + 1.2)); g.lineTo(X(x + 0.8), Y(y - 0.6)); g.fill();
      }
      // eyes up on top, bulging, the far one smaller
      for (const [x, y, r] of [[38, 21, 3.6], [27, 22, 4.6]]) {
        shaded(g, X(x), Y(y), X(r), X(r), { hi: '#fbfff0', mid: '#e2ecd0', lo: '#a8b894', dark: '#6a7a58', line: p.line, glow: '#fff' });
        g.fillStyle = '#0c1208';
        g.beginPath(); g.ellipse(X(x - r * 0.3), Y(y + r * 0.1), X(r * 0.42), X(r * 0.6), 0, 0, WS.TAU); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(X(x - r * 0.45), Y(y - r * 0.25), X(r * 0.18), 0, WS.TAU); g.fill();
      }
      // near arm, reaching, with a webbed three-fingered hand
      limb(g, P([[54, 46], [48, 58], [38, 64]]), [6.4, 4.8, 3.8].map(X), p);
      web([[31, 62], [35, 59], [39, 62], [38, 67], [32, 68]], p);
    },

    necromancer(g, s, p) {
      /* A CULTIST, not a cone. The robe keeps its bell - it is the family
         silhouette and the casters are marked from above by the renderer -
         but it is now a figure wearing it: a deep peaked hood with a face
         in the dark, a mantle over the shoulders, sleeves with the hands
         out of them working the orb, a sash with the cult's sigil hanging
         from it, candles and a skull at the belt, and a ragged, layered hem. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const hexA = (hex, a) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;
      const SKIN = { hi: '#c9d0c0', mid: '#8e9888', lo: '#4a5246', dark: '#2a302a', line: '#1a1e1a', glow: '#fff' };
      const BONE = { hi: '#f2ede0', mid: '#d8d0bd', lo: '#9a9280', dark: '#5e594c', line: '#3d392f', glow: '#fff' };
      // the robe: a bell, with a ragged hem in two layers
      const hem = [];
      for (let i = 0; i <= 10; i++) hem.push([72 - i * 4.4, 88 + (i % 2 ? -3 : 0.8)]);
      const robe = [[40, 36], [60, 36], [66, 60], [72, 88]].concat(hem, [[34, 60]]);
      g.save();
      g.beginPath(); P(robe).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      const rg = g.createLinearGradient(0, Y(36), 0, Y(90));
      rg.addColorStop(0, p.mid); rg.addColorStop(0.6, p.lo); rg.addColorStop(1, p.dark);
      g.fillStyle = rg; g.fill();
      g.clip();
      for (const [x0, x1] of [[43, 33], [47, 44], [53, 56], [57, 67]]) {
        const fg = g.createLinearGradient(X(x1 - 3), 0, X(x1 + 3), 0);
        fg.addColorStop(0, 'rgba(0,0,0,.36)'); fg.addColorStop(0.62, 'rgba(255,255,255,.12)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = fg;
        g.beginPath(); g.moveTo(X(x0 - 1), Y(38)); g.lineTo(X(x0 + 1), Y(38));
        g.lineTo(X(x1 + 3), Y(90)); g.lineTo(X(x1 - 3), Y(90)); g.closePath(); g.fill();
      }
      // an inner hem showing under the outer one, in a darker cloth
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.fillRect(X(26), Y(82), X(48), Y(9));
      g.restore();
      // the sash down the front, and the sigil on it
      poly(g, P([[47, 48], [53, 48], [54, 78], [50, 82], [46, 78]]), p.dark, p.line, u * 0.6);
      g.save();
      g.strokeStyle = p.glow; g.globalAlpha = 0.85; g.lineWidth = u * 0.8; g.lineCap = 'round';
      g.shadowColor = p.glow; g.shadowBlur = 3 * u;
      // an eye in a falling triangle: the cult watches from below
      g.beginPath(); g.moveTo(X(46.6), Y(59)); g.lineTo(X(53.4), Y(59)); g.lineTo(X(50), Y(67)); g.closePath(); g.stroke();
      g.beginPath(); g.ellipse(X(50), Y(61.8), X(1.8), X(1), 0, 0, WS.TAU); g.stroke();
      g.fillStyle = p.glow; g.beginPath(); g.arc(X(50), Y(61.8), X(0.55), 0, WS.TAU); g.fill();
      g.restore();
      // the belt: a cord, a skull, and two stubs of candle
      g.strokeStyle = '#2a2218'; g.lineWidth = u * 1.6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(37), Y(50)); g.quadraticCurveTo(X(50), Y(53), X(63), Y(50)); g.stroke();
      shaded(g, X(40), Y(56), X(3), X(3.2), BONE);
      g.fillStyle = BONE.line;
      g.beginPath(); g.arc(X(39), Y(55.6), X(0.8), 0, WS.TAU); g.fill();
      g.beginPath(); g.arc(X(41), Y(55.6), X(0.8), 0, WS.TAU); g.fill();
      for (const cx of [58, 61]) {
        poly(g, P([[cx - 1, 52], [cx + 1, 52], [cx + 1, 57], [cx - 1, 57]]), '#efe6cc', '#6a604a', u * 0.4);
        g.save(); g.shadowColor = '#ffb040'; g.shadowBlur = 3 * u; g.fillStyle = '#ffd890';
        g.beginPath(); g.ellipse(X(cx), Y(50.8), X(0.6), X(1.1), 0, 0, WS.TAU); g.fill(); g.restore();
      }
      // sleeves, and the hands out of them, raised to the orb
      for (const dir of [-1, 1]) {
        poly(g, P([[50 + dir * 9, 38], [50 + dir * 22, 46], [50 + dir * 24, 56], [50 + dir * 16, 54], [50 + dir * 10, 46]]), p.mid, p.line, u * 0.8);
        poly(g, P([[50 + dir * 16, 53], [50 + dir * 24.6, 55.4], [50 + dir * 23, 58.6], [50 + dir * 15.4, 56.6]]), p.hi, p.line, u * 0.6);
        shaded(g, X(50 + dir * 21), Y(59.6), X(2.6), X(2.4), SKIN);
      }
      // the orb, held between them in the near hand
      g.save(); g.shadowColor = p.glow; g.shadowBlur = 14 * u;
      g.fillStyle = hexA(p.glow, 0.95);
      g.beginPath(); g.arc(X(74), Y(55), X(4.6), 0, WS.TAU); g.fill();
      g.restore();
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.beginPath(); g.arc(X(72.6), Y(53.6), X(1.4), 0, WS.TAU); g.fill();
      // the mantle over the shoulders
      poly(g, P([[34, 44], [40, 34], [60, 34], [66, 44], [58, 47], [50, 45], [42, 47]]), p.mid, p.line, u * 0.8);
      g.strokeStyle = hexA(p.hi, 0.5); g.lineWidth = u * 0.7;
      g.beginPath(); g.moveTo(X(35), Y(43.4)); g.lineTo(X(40.4), Y(35)); g.stroke();
      // the hood: peaked, deep, and a face at the back of it
      poly(g, P([[38, 38], [42, 22], [50, 10], [58, 22], [62, 38]]), p.lo, p.line, u * 0.9);
      g.save();
      g.beginPath(); g.ellipse(X(50), Y(29), X(7.4), X(8.4), 0, 0, WS.TAU);
      const hg = g.createRadialGradient(X(50), Y(30), 0, X(50), Y(29), X(8.4));
      hg.addColorStop(0, '#16121c'); hg.addColorStop(1, '#050408');
      g.fillStyle = hg; g.fill();
      g.clip();
      // a chin and a mouth, just, where the light from the orb reaches
      g.fillStyle = hexA(SKIN.lo, 0.8);
      g.beginPath(); g.ellipse(X(50), Y(35.6), X(3.6), X(2.4), 0, 0, WS.TAU); g.fill();
      g.strokeStyle = '#0a080c'; g.lineWidth = u * 0.6;
      g.beginPath(); g.moveTo(X(48), Y(35.4)); g.quadraticCurveTo(X(50), Y(36.4), X(52), Y(35.2)); g.stroke();
      g.restore();
      g.strokeStyle = hexA(p.hi, 0.45); g.lineWidth = u * 0.7;
      g.beginPath(); g.moveTo(X(38.6), Y(37)); g.lineTo(X(42.4), Y(22.4)); g.lineTo(X(50), Y(11)); g.stroke();
      eyes(g, X(50), Y(28), X(3), X(1.6), p.glow);
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
      /* A SKELETON THAT CRAWLS. The first one had no legs, and the player
         said what that made it: something hauling itself at you on its arms.
         So that is what it is, drawn properly - the ribcage held up off the
         ground, the spine trailing behind it vertebra by vertebra with a
         rag still knotted round it, both arms planted and pulling, the bony
         hands splayed on the ground, and the rusted sword driven in point
         first as a crutch. Two common undead and two champions wear it. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const BONE = { hi: p.hi, mid: p.mid, lo: p.lo, dark: p.dark, line: p.line, glow: p.glow };
      const bone = (x0, y0, x1, y1, w) => {
        const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        const q = (t, k) => [X(x0 + dx * t + nx * w * k), Y(y0 + dy * t + ny * w * k)];
        poly(g, [q(0.1, -0.8), q(0.5, -0.55), q(0.9, -0.8), q(0.9, 0.8), q(0.5, 0.55), q(0.1, 0.8)], BONE.mid, BONE.line, u * 0.6);
        for (const t of [0.04, 0.96]) {
          const cx0 = x0 + dx * t, cy0 = y0 + dy * t;
          shaded(g, X(cx0 + nx * w * 0.45), Y(cy0 + ny * w * 0.45), X(w * 0.62), X(w * 0.62), BONE);
          shaded(g, X(cx0 - nx * w * 0.45), Y(cy0 - ny * w * 0.45), X(w * 0.62), X(w * 0.62), BONE);
        }
        g.strokeStyle = BONE.hi; g.globalAlpha = 0.6; g.lineWidth = u * 0.5; g.lineCap = 'round';
        const a = q(0.15, -0.35), b = q(0.85, -0.35);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        g.globalAlpha = 1;
      };
      /* Leaning forward over its arms: everything above the hips is sheared
         toward the survivor, the way a thing pulling itself along carries
         its weight out in front. K() is that lean, for the joints that have
         to meet the unleaned arms and the ground. */
      const LEAN = 0.3, HIP = 62;
      const K = (x, y) => [x + LEAN * (y - HIP), y];
      const lean = () => { g.save(); g.transform(1, 0, LEAN, 1, -LEAN * Y(HIP), 0); };
      // the skull is carried, not sheared: it moves with the lean and keeps its shape
      const carry = (y) => { g.save(); g.translate(X(LEAN * (y - HIP)), 0); };
      /** A hand of bone, flat on the ground, the fingers splayed and dug in. */
      const hand = (x, y, dir) => {
        shaded(g, X(x), Y(y), X(2.6), X(1.8), BONE);
        g.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const a = WS.PI / 2 + dir * (0.9 - i * 0.45);
          const k1x = x + Math.cos(a) * 2.6 - dir * 1.4, k1y = y + Math.sin(a) * 1.4 + 1.2;
          const tx = k1x - dir * 2.2 + (i - 1.5) * 0.6, ty = k1y + 1.6;
          g.strokeStyle = BONE.line; g.lineWidth = u * 1.5;
          g.beginPath(); g.moveTo(X(x), Y(y)); g.lineTo(X(k1x), Y(k1y)); g.lineTo(X(tx), Y(ty)); g.stroke();
          g.strokeStyle = BONE.mid; g.lineWidth = u * 0.8;
          g.beginPath(); g.moveTo(X(x), Y(y)); g.lineTo(X(k1x), Y(k1y)); g.lineTo(X(tx), Y(ty)); g.stroke();
        }
      };
      // the scrape it leaves: dirt thrown up behind the dragging spine
      g.fillStyle = 'rgba(40,32,24,.35)';
      g.beginPath(); g.ellipse(X(64), Y(86), X(16), X(3), 0, 0, WS.TAU); g.fill();
      // the spine, trailing behind and down to the ground, a rag round it
      const trail = [[50, 61], [54, 65.5], [58.5, 70], [63, 74.5], [67.5, 78.5], [72, 82], [76.5, 85]];
      trail.forEach(([x, y], i) => shaded(g, X(x), Y(y), X(2.3 - i * 0.18), X(1.6 - i * 0.12), BONE));
      poly(g, [[X(48), Y(60)], [X(57), Y(61)], [X(62), Y(70)], [X(56), Y(74)], [X(54), Y(68)], [X(50), Y(71)]], '#3a3028', '#15100c', u * 0.6);
      // the sword, point down in the ground, the far hand on its hilt
      g.save();
      g.translate(X(74), Y(88)); g.rotate(0.12);
      poly(g, [[-X(1.6), -Y(22)], [X(1.6), -Y(22)], [X(1.4), -Y(3)], [0, 0], [-X(1.4), -Y(3)]], '#9aa0a8', '#3a3e46', u * 0.6);
      g.fillStyle = 'rgba(140,70,30,.55)';
      g.beginPath(); g.ellipse(X(0.4), -Y(9), X(1.1), X(2.6), 0, 0, WS.TAU); g.fill();
      g.fillStyle = '#3a3e46';
      for (const y of [6, 14]) { g.beginPath(); g.moveTo(X(1.6), -Y(y)); g.lineTo(X(0.6), -Y(y + 1)); g.lineTo(X(1.5), -Y(y + 2)); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = u * 0.5;
      g.beginPath(); g.moveTo(-X(0.6), -Y(20)); g.lineTo(-X(0.6), -Y(4)); g.stroke();
      poly(g, [[-X(5), -Y(23)], [X(5), -Y(23)], [X(5), -Y(21.2)], [-X(5), -Y(21.2)]], '#6a5a40', '#2a2010', u * 0.5);
      poly(g, [[-X(1), -Y(29)], [X(1), -Y(29)], [X(1), -Y(23)], [-X(1), -Y(23)]], '#4a3a2a', '#1a1208', u * 0.5);
      g.restore();
      // the far arm: shoulder to elbow, forearm down to the hilt
      { const [ex, ey] = K(70, 54); lean(); bone(61, 43, 70, 54, 1.8); g.restore(); bone(ex, ey, 73, 63, 1.6); }
      shaded(g, X(73.4), Y(64), X(2.4), X(2.2), BONE);
      // the ribcage, leaning out over its arms
      lean();
      for (let i = 0; i < 5; i++) {
        const y = 42 + i * 3.6, w = 11 - i * 1, drop = 3.2 - i * 0.2;
        for (const d of [-1, 1]) {
          g.lineCap = 'round';
          g.strokeStyle = BONE.line; g.lineWidth = u * 2.6;
          g.beginPath(); g.moveTo(X(50), Y(y)); g.quadraticCurveTo(X(50 + d * w), Y(y - 1.4), X(50 + d * (w - 1.8)), Y(y + drop)); g.stroke();
          g.strokeStyle = BONE.mid; g.lineWidth = u * 1.7;
          g.beginPath(); g.moveTo(X(50), Y(y)); g.quadraticCurveTo(X(50 + d * w), Y(y - 1.4), X(50 + d * (w - 1.8)), Y(y + drop)); g.stroke();
          g.strokeStyle = BONE.hi; g.lineWidth = u * 0.6;
          g.beginPath(); g.moveTo(X(50 + d * 1.5), Y(y - 0.5)); g.quadraticCurveTo(X(50 + d * (w - 1)), Y(y - 1.8), X(50 + d * (w - 1.2)), Y(y + drop - 1.4)); g.stroke();
        }
      }
      for (let i = 0; i < 6; i++) shaded(g, X(50 + i * 0.4), Y(41 + i * 3.6), X(2), X(1.4), BONE);
      poly(g, [[X(48.6), Y(40)], [X(51.4), Y(40)], [X(51), Y(54)], [X(49), Y(54)]], BONE.hi, BONE.line, u * 0.5);
      bone(38, 39, 49, 38, 1.6); bone(51, 38, 62, 39, 1.6);
      bone(38, 41, 29, 55, 1.9);
      g.restore();
      // the near forearm, from the leaned elbow down to the planted hand
      { const [ex, ey] = K(29, 55); bone(ex, ey, 21, 80, 1.7); }
      hand(20, 82, -1);
      // the skull, low and forward, the jaw hanging open as it comes
      carry(30);
      shaded(g, X(44), Y(34), X(5.4), X(3), BONE, 0.15);
      g.fillStyle = BONE.line;
      for (let i = -2; i <= 2; i++) g.fillRect(X(43.4 + i * 1.9), Y(32.6), X(1.1), Y(1.6));
      shaded(g, X(45), Y(24.4), X(9.4), X(8.8), BONE);
      g.save();
      g.beginPath(); g.ellipse(X(45), Y(24.4), X(9.4), X(8.8), 0, 0, WS.TAU); g.clip();
      g.fillStyle = BONE.lo; g.globalAlpha = 0.5;
      g.beginPath(); g.ellipse(X(45), Y(31.4), X(6), X(3), 0, 0, WS.TAU); g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 0.9 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(39), Y(17.6)); g.quadraticCurveTo(X(42), Y(21.6), X(40.6), Y(26.6)); g.stroke();
      g.restore();
      g.fillStyle = '#101018';
      g.beginPath(); g.ellipse(X(41), Y(24.8), X(2.8), X(3.2), 0, 0, WS.TAU); g.fill();
      g.beginPath(); g.ellipse(X(49), Y(24.8), X(2.8), X(3.2), 0, 0, WS.TAU); g.fill();
      g.beginPath(); g.moveTo(X(45), Y(27.8)); g.lineTo(X(43.6), Y(30.8)); g.lineTo(X(46.4), Y(30.8)); g.closePath(); g.fill();
      for (let i = -2; i <= 2; i++) g.fillRect(X(44.4 + i * 2), Y(31.2), X(1.1), Y(1.5));
      eyes(g, X(45), Y(25), X(4), X(1.3), '#8fe6ff');
      g.restore();
    },

    ghoul(g, s, p) {
      /* A CORPSE THAT IS STILL WALKING, not a pebble with an arm. Hunched
         over its own belly, one arm reaching for you and the other dragging,
         the burial clothes rotted to rags, ribs through the side, the jaw
         hanging. In profile, looking left, like the rest of the bestiary. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const RAG = '#3c3a34', RAG_LO = '#1e1c18';
      // far leg and far arm, dragging
      shaded(g, X(58), Y(78), X(4.4), X(10), far, 0.2);
      poly(g, P([[56, 85.4], [62, 85.4], [63, 89.4], [54, 89.6]]), far.mid, far.line, u * 0.6);
      shaded(g, X(58), Y(58), X(4), X(11), far, -0.3);
      shaded(g, X(62), Y(72), X(3.4), X(3.2), far);
      // near leg, bent at the knee
      shaded(g, X(46), Y(74), X(5), X(8), p, -0.35);
      shaded(g, X(43.4), Y(81), X(4), X(6), p, 0.2);
      poly(g, P([[40, 85.6], [46, 85.8], [46.4, 89.6], [36, 89.8], [36.6, 87.8]]), p.mid, p.line, u * 0.6);
      // the rag breeches, torn at the knee
      poly(g, P([[42, 62], [62, 62], [63, 72], [57, 76], [54, 70], [50, 77], [44, 75], [41, 70]]), RAG, RAG_LO, u * 0.7);
      // the body, hunched forward over its belly
      shaded(g, X(52), Y(52), X(15), X(14), p, -0.5);
      g.save();
      g.beginPath(); g.ellipse(X(52), Y(52), X(15), X(14), -0.5, 0, WS.TAU); g.clip();
      // the rotted shirt across the back, open at the side
      g.fillStyle = RAG;
      g.beginPath();
      g.moveTo(X(46), Y(36)); g.lineTo(X(70), Y(44)); g.lineTo(X(68), Y(64)); g.lineTo(X(60), Y(60)); g.lineTo(X(56), Y(66));
      g.lineTo(X(52), Y(56)); g.lineTo(X(55), Y(46)); g.closePath(); g.fill();
      // the side where the flesh has gone: ribs
      const hollow = g.createRadialGradient(X(46), Y(54), 1, X(46), Y(54), X(9));
      hollow.addColorStop(0, 'rgba(18,10,8,.7)'); hollow.addColorStop(1, 'rgba(18,10,8,0)');
      g.fillStyle = hollow; g.beginPath(); g.arc(X(46), Y(54), X(9), 0, WS.TAU); g.fill();
      g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const y = 48 + i * 3.6;
        g.strokeStyle = 'rgba(232,226,204,.7)'; g.lineWidth = u * 1.3;
        g.beginPath(); g.moveTo(X(52), Y(y - 1)); g.quadraticCurveTo(X(44), Y(y), X(40 + i), Y(y + 3)); g.stroke();
      }
      g.restore();
      // the reaching arm, out in front, fingers crooked
      shaded(g, X(38), Y(46), X(9), X(4.2), p, -0.2);
      shaded(g, X(26), Y(47), X(8), X(3.4), p, 0.15);
      g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const a = WS.PI + (-0.5 + i * 0.32);
        const k1x = 19 + Math.cos(a) * 3.6, k1y = 47 + Math.sin(a) * 3.6;
        const tx = k1x + Math.cos(a + 0.7) * 3, ty = k1y + Math.sin(a + 0.7) * 3;
        g.strokeStyle = p.line; g.lineWidth = u * 1.5;
        g.beginPath(); g.moveTo(X(19), Y(47)); g.lineTo(X(k1x), Y(k1y)); g.lineTo(X(tx), Y(ty)); g.stroke();
        g.strokeStyle = p.hi; g.lineWidth = u * 0.8;
        g.beginPath(); g.moveTo(X(19), Y(47)); g.lineTo(X(k1x), Y(k1y)); g.lineTo(X(tx), Y(ty)); g.stroke();
      }
      // a rag hanging off the forearm
      poly(g, P([[30, 48], [36, 48.6], [35, 55], [32, 53], [30, 56]]), RAG, RAG_LO, u * 0.5);
      // the head, low and forward, the jaw hanging
      shaded(g, X(38), Y(33), X(9.6), X(9), p, -0.2);
      g.save();
      g.beginPath(); g.ellipse(X(38), Y(33), X(9.6), X(9), -0.2, 0, WS.TAU); g.clip();
      g.fillStyle = 'rgba(18,10,8,.35)';
      g.beginPath(); g.ellipse(X(36), Y(37), X(4), X(3), 0, 0, WS.TAU); g.fill();       // the sunk cheek
      g.strokeStyle = 'rgba(20,14,10,.5)'; g.lineWidth = u * 0.6;
      g.beginPath(); g.moveTo(X(41), Y(26)); g.lineTo(X(43), Y(29)); g.lineTo(X(42), Y(31)); g.stroke();   // a split in the scalp
      g.restore();
      // lank hair down the back of the skull
      g.strokeStyle = 'rgba(40,36,30,.8)'; g.lineWidth = u * 0.8; g.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        g.beginPath(); g.moveTo(X(41 + i * 1.4), Y(25.4 + i * 0.6));
        g.quadraticCurveTo(X(46 + i * 1.2), Y(32), X(45 + i * 1.6), Y(40)); g.stroke();
      }
      // the jaw, hanging open
      poly(g, P([[30, 37], [38, 38.4], [37, 44], [31, 43]]), p.lo, p.line, u * 0.6);
      g.fillStyle = '#2a1414';
      g.beginPath(); g.moveTo(X(30.4), Y(36.4)); g.lineTo(X(37.4), Y(37.6)); g.lineTo(X(36.4), Y(41)); g.lineTo(X(31), Y(40.4)); g.closePath(); g.fill();
      for (let i = 0; i < 3; i++) g.fillStyle = '#e6dcc0', g.fillRect(X(31.4 + i * 1.9), Y(36.6), X(1), Y(1.4));
      eyes(g, X(34.4), Y(31), X(2.6), X(1.4), '#d9ff7a');
    },

    geist(g, s, p) {
      /* A HUNGRY THING, wound in its grave-cloth and floating. It was a pale
         ball with two strokes for arms and a bar across its face. Now: a
         body that tapers away to nothing, wrapped in strips of linen that
         have come loose and trail behind it, two long arms reaching with
         the fingers hooked, and the mouth that was sewn shut torn open.
         It bursts where it dies, so it should look full of something. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const hexA = (hex, a) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;
      // the cold it is full of, showing through
      g.save();
      g.globalCompositeOperation = 'lighter';
      const gl = g.createRadialGradient(X(50), Y(52), 0, X(50), Y(52), X(30));
      gl.addColorStop(0, hexA(p.glow, 0.3)); gl.addColorStop(1, hexA(p.glow, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(X(50), Y(52), X(30), 0, WS.TAU); g.fill();
      g.restore();
      // loose wrappings trailing behind, fading out
      g.save();
      g.lineCap = 'round';
      for (const [x0, y0, x1, y1, x2, y2] of [[58, 64, 72, 74, 80, 86], [52, 70, 58, 80, 54, 92], [44, 66, 36, 78, 40, 90]]) {
        const tg = g.createLinearGradient(X(x0), Y(y0), X(x2), Y(y2));
        tg.addColorStop(0, p.mid); tg.addColorStop(1, hexA(p.mid, 0));
        g.strokeStyle = tg; g.lineWidth = u * 3.4;
        g.beginPath(); g.moveTo(X(x0), Y(y0)); g.quadraticCurveTo(X(x1), Y(y1), X(x2), Y(y2)); g.stroke();
      }
      g.restore();
      // the body, tapering to a tail of cloth
      const body = [[38, 40], [50, 32], [62, 40], [64, 56], [58, 70], [52, 82], [48, 72], [40, 60]];
      poly(g, P(body), p.mid, p.line, u * 0.8);
      g.save();
      g.beginPath(); P(body).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
      // the wrappings, each strip its own band, wound on the slant
      for (let i = 0; i < 8; i++) {
        const y = 38 + i * 5.4, tilt = i % 2 ? 2.4 : -2;
        g.fillStyle = i % 2 ? p.hi : p.mid;
        g.beginPath();
        g.moveTo(X(34), Y(y - tilt)); g.lineTo(X(66), Y(y + tilt)); g.lineTo(X(66), Y(y + tilt + 4)); g.lineTo(X(34), Y(y - tilt + 4));
        g.closePath(); g.fill();
        g.strokeStyle = p.line; g.globalAlpha = 0.45; g.lineWidth = u * 0.7;
        g.beginPath(); g.moveTo(X(34), Y(y - tilt)); g.lineTo(X(66), Y(y + tilt)); g.stroke();
        g.globalAlpha = 1;
      }
      // a gap in the wrappings, and the light inside
      g.globalCompositeOperation = 'lighter';
      const gap = g.createRadialGradient(X(53), Y(56), 0, X(53), Y(56), X(6));
      gap.addColorStop(0, hexA(p.glow, 0.9)); gap.addColorStop(1, hexA(p.glow, 0));
      g.fillStyle = gap; g.beginPath(); g.arc(X(53), Y(56), X(6), 0, WS.TAU); g.fill();
      g.restore();
      // arms: long, wrapped, reaching out and down, fingers hooked
      for (const d of [-1, 1]) {
        const sx = 50 + d * 11, sy = 42, ex = 50 + d * 24, ey = 50, hx = 50 + d * 29, hy = 58;
        g.save();
        g.lineCap = 'round';
        g.strokeStyle = p.line; g.lineWidth = u * 4.4;
        g.beginPath(); g.moveTo(X(sx), Y(sy)); g.lineTo(X(ex), Y(ey)); g.lineTo(X(hx), Y(hy)); g.stroke();
        g.strokeStyle = p.mid; g.lineWidth = u * 3.2;
        g.beginPath(); g.moveTo(X(sx), Y(sy)); g.lineTo(X(ex), Y(ey)); g.lineTo(X(hx), Y(hy)); g.stroke();
        g.strokeStyle = p.hi; g.lineWidth = u * 0.8;
        for (let k = 1; k < 5; k++) {
          const t = k / 5, mx = sx + (ex - sx) * t, my = sy + (ey - sy) * t;
          g.beginPath(); g.moveTo(X(mx - 1), Y(my - 1.6)); g.lineTo(X(mx + 1), Y(my + 1.6)); g.stroke();
        }
        for (let f = 0; f < 3; f++) {
          const a = WS.PI / 2 + d * (0.2 - f * 0.35);
          const k1x = hx + Math.cos(a) * 3.2, k1y = hy + Math.sin(a) * 3.2;
          g.strokeStyle = p.line; g.lineWidth = u * 1.3;
          g.beginPath(); g.moveTo(X(hx), Y(hy)); g.lineTo(X(k1x), Y(k1y)); g.lineTo(X(k1x - d * 1.6), Y(k1y + 1.8)); g.stroke();
          g.strokeStyle = p.hi; g.lineWidth = u * 0.6;
          g.beginPath(); g.moveTo(X(hx), Y(hy)); g.lineTo(X(k1x), Y(k1y)); g.lineTo(X(k1x - d * 1.6), Y(k1y + 1.8)); g.stroke();
        }
        g.restore();
      }
      // the head, wrapped too, and the mouth torn open through the stitches
      shaded(g, X(50), Y(28), X(10), X(10), p);
      g.save();
      g.beginPath(); g.ellipse(X(50), Y(28), X(10), X(10), 0, 0, WS.TAU); g.clip();
      for (let i = 0; i < 4; i++) {
        const y = 20 + i * 5;
        g.strokeStyle = p.line; g.globalAlpha = 0.4; g.lineWidth = u * 0.8;
        g.beginPath(); g.moveTo(X(38), Y(y + (i % 2 ? 1.5 : -1))); g.lineTo(X(62), Y(y + (i % 2 ? -1 : 1.5))); g.stroke();
      }
      g.restore();
      g.fillStyle = '#10141a';
      g.beginPath(); g.ellipse(X(50), Y(33), X(5), X(3.4), 0, 0, WS.TAU); g.fill();
      g.fillStyle = hexA(p.glow, 0.7);
      g.beginPath(); g.ellipse(X(50), Y(33.6), X(3), X(1.6), 0, 0, WS.TAU); g.fill();
      g.strokeStyle = 'rgba(214,222,232,.8)'; g.lineWidth = u * 0.6;
      for (let i = -2; i <= 2; i++) {
        g.beginPath(); g.moveTo(X(50 + i * 2), Y(29.4)); g.lineTo(X(50 + i * 2.2), Y(30.8)); g.stroke();
        g.beginPath(); g.moveTo(X(50 + i * 2), Y(35.6)); g.lineTo(X(50 + i * 2.2), Y(37)); g.stroke();
      }
      eyes(g, X(50), Y(25.4), X(3.8), X(1.5), '#9ff5ff');
    },

    abomination(g, s, p) {
      /* THE STITCHED HORROR, redrawn. It was a green ball with a blade stuck
         on. It is sewn together from what the cult had spare, and it should
         look it: a huge hunched torso and a gut, a small head buried in the
         shoulders, one arm a butcher's cleaver and the other ending in a
         hook on a chain, legs that do not match, and stitches everywhere -
         the seams are the whole character. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const grey = { hi: '#b8b4b0', mid: '#8a8480', lo: '#5e5854', dark: '#3a3432', line: '#1a1614', glow: '#fff' };
      const STEEL = { hi: '#e0e4ea', mid: '#a8aeb8', lo: '#6a707c', dark: '#3a3e46', line: '#16181c', glow: '#fff' };
      const stitch = (pts) => {
        g.save(); g.strokeStyle = '#1e1410'; g.lineWidth = u * 0.9; g.lineCap = 'round';
        g.beginPath(); P(pts).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
          const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2.4));
          const nx = -(y1 - y0), ny = x1 - x0, d = Math.hypot(nx, ny) || 1;
          for (let k = 0; k <= n; k++) {
            const t = k / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
            g.beginPath(); g.moveTo(X(x + nx / d * 1.3), Y(y + ny / d * 1.3)); g.lineTo(X(x - nx / d * 1.3), Y(y - ny / d * 1.3)); g.stroke();
          }
        }
        g.restore();
      };
      // the hook on its chain, behind, from the far arm
      limb(g, P([[70, 34], [80, 46], [80, 58]]), [11, 9, 7].map(X), far);
      g.strokeStyle = STEEL.lo; g.lineWidth = u * 1.1;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(X(80), Y(61 + k * 3), X(1.1), X(1.6), 0, 0, WS.TAU); g.stroke(); }
      g.strokeStyle = STEEL.mid; g.lineWidth = u * 2.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(80), Y(73)); g.lineTo(X(80), Y(78)); g.arc(X(76), Y(78), X(4), 0, Math.PI * 0.9); g.stroke();
      // legs that do not match: a thick grey one and a thin green one
      limb(g, P([[60, 64], [64, 75], [62, 86]]), [13, 11, 10].map(X), grey);
      limb(g, P([[42, 66], [40, 76], [42, 86]]), [9, 7, 6].map(X), p);
      shaded(g, X(62), Y(87), X(7), X(2.6), grey);
      shaded(g, X(41), Y(87), X(5.5), X(2.2), p);
      // the body: a hunched mountain with a gut
      const body = mass(g, P([[26, 36], [34, 22], [52, 16], [70, 22], [78, 36], [76, 54], [66, 70], [44, 72], [28, 62], [22, 48]]), p);
      g.save(); body(); g.clip();
      // a sewn-on patch of someone else, greyer
      poly(g, P([[52, 20], [72, 24], [74, 42], [56, 40]]), grey.mid, grey.line, u * 0.5);
      g.fillStyle = 'rgba(255,255,240,.16)';
      g.beginPath(); g.ellipse(X(46), Y(56), X(15), X(12), 0, 0, WS.TAU); g.fill();
      g.restore();
      stitch([[52, 20], [72, 24], [74, 42], [56, 40], [52, 20]]);
      stitch([[30, 50], [44, 58], [62, 56]]);
      stitch([[40, 26], [38, 40]]);
      // the head, small and sunk into the shoulders, sewn shut on one side
      const head = mass(g, P([[34, 22], [38, 14], [46, 12], [52, 16], [52, 24], [46, 28], [38, 28]]), grey);
      stitch([[42, 13], [44, 27]]);
      eyes(g, X(39), Y(19), X(0.01), X(1.6), '#e8ff6a');
      g.strokeStyle = '#1e1410'; g.lineWidth = u;
      g.beginPath(); g.moveTo(X(46), Y(18)); g.lineTo(X(50), Y(21)); g.moveTo(X(50), Y(18)); g.lineTo(X(46), Y(21)); g.stroke();
      g.beginPath(); g.moveTo(X(37), Y(24)); g.quadraticCurveTo(X(42), Y(26.5), X(47), Y(24)); g.stroke();
      // near arm: a cleaver where the hand should be
      limb(g, P([[30, 34], [20, 46], [18, 56]]), [12, 10, 8].map(X), p);
      stitch([[26, 38], [20, 48]]);
      poly(g, P([[8, 54], [22, 52], [23, 68], [9, 72]]), STEEL.mid, STEEL.line, u * 0.8);
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath(); g.moveTo(X(9), Y(55)); g.lineTo(X(12), Y(54.5)); g.lineTo(X(12), Y(70)); g.lineTo(X(9.5), Y(71)); g.fill();
      g.fillStyle = 'rgba(120,20,20,.5)';
      g.beginPath(); g.ellipse(X(12), Y(68), X(3), X(2.2), 0.2, 0, WS.TAU); g.fill();
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
      /* A BAND OF RUNES round the face, cut into the crust and lit from
         behind like the fissures: the sovereign is a made thing, a crown
         the size of a sun, and it carries the script of whoever made it.
         Two engraved rings and twelve glyphs between them, no two alike. */
      g.save();
      g.beginPath(); g.arc(cx, cy, R, 0, WS.TAU); g.clip();
      for (const rr of [0.5, 0.72]) {
        g.strokeStyle = 'rgba(5,3,12,.6)'; g.lineWidth = 1.2 * u;
        g.beginPath(); g.arc(cx, cy - 1 * u, R * rr, 0, WS.TAU); g.stroke();
        g.strokeStyle = 'rgba(255,214,150,.22)'; g.lineWidth = 0.5 * u;
        g.beginPath(); g.arc(cx, cy - 1 * u + 0.6 * u, R * rr, 0, WS.TAU); g.stroke();
      }
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(255,222,160,.55)'; g.lineWidth = 0.7 * u; g.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * WS.TAU + 0.26, rm = R * 0.61;
        const gx = cx + WS.cos(a) * rm, gy = cy - 1 * u + WS.sin(a) * rm;
        const k = (i * 7) % 5, h = 2.2 * u, w = 1.3 * u;
        g.save(); g.translate(gx, gy); g.rotate(a + WS.PI / 2);
        g.beginPath();
        g.moveTo(0, -h); g.lineTo(0, h);
        if (k === 0) { g.moveTo(-w, -h * 0.4); g.lineTo(w, h * 0.2); }
        else if (k === 1) { g.moveTo(0, -h * 0.2); g.lineTo(w, -h); g.moveTo(0, h * 0.3); g.lineTo(-w, h * 0.9); }
        else if (k === 2) { g.moveTo(-w, -h); g.lineTo(0, -h * 0.2); g.lineTo(w, -h); }
        else if (k === 3) { g.moveTo(-w, 0); g.lineTo(w, 0); g.moveTo(-w * 0.6, h); g.lineTo(w * 0.6, h); }
        else { g.moveTo(0, -h * 0.5); g.lineTo(w, 0); g.lineTo(0, h * 0.5); }
        g.stroke();
        g.restore();
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
      /* THE LONGTOOTH WOLF, and the coyote packrunner in a paler coat.
         It was a box on four pegs with a triangle for a face - the drawing
         the rest of the beasts left behind when the mongrel and the
         moonwretch were rebuilt. What says wolf is the NECK: the head held
         forward and a little low on a thick one, ears up, a long muzzle, a
         deep chest that tucks up to a narrow waist, and hind legs that bend
         backward at the hock. The body is one long mass with the chest and
         the haunch laid ON it rather than three equal lumps in a row - the
         row is what made the last rebuild a caterpillar. The fang is the
         name. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const CLAW = '#e9edf5', CLAW_LINE = '#6a7080';
      const claws = (x, y, n) => {
        for (let i = 0; i < n; i++) {
          const ox = x - i * 1.5;
          poly(g, P([[ox + 0.6, y - 0.6], [ox - 1.6, y + 1.2], [ox - 0.2, y + 0.6]]), CLAW, CLAW_LINE, u * 0.4);
        }
      };
      // the brush: thick at the root, full, hanging low, ragged at the tip
      const tail = P([[76, 47], [84, 50], [90, 57], [92.6, 66], [91, 73], [88.6, 70], [87, 75], [84.4, 69],
        [82, 71], [81.4, 63], [77, 56]]);
      poly(g, tail, p.lo, p.line, u * 0.8);
      g.save();
      g.beginPath(); g.moveTo(tail[0][0], tail[0][1]); for (const q of tail) g.lineTo(q[0], q[1]); g.closePath(); g.clip();
      g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const t = i / 5, x = 79 + t * 10, y = 50 + t * 12;
        g.globalAlpha = 0.4; g.strokeStyle = p.line; g.lineWidth = u;
        g.beginPath(); g.moveTo(X(x), Y(y)); g.quadraticCurveTo(X(x + 2), Y(y + 5), X(x + 1), Y(y + 11)); g.stroke();
        g.globalAlpha = 0.3; g.strokeStyle = p.hi;
        g.beginPath(); g.moveTo(X(x + 1.2), Y(y)); g.quadraticCurveTo(X(x + 3.2), Y(y + 5), X(x + 2.2), Y(y + 10)); g.stroke();
      }
      g.fillStyle = p.dark; g.globalAlpha = 0.7;
      g.beginPath(); g.ellipse(X(89), Y(70), X(3), X(4.4), 0.3, 0, WS.TAU); g.fill();
      g.restore();
      // far legs, in the shade of the body
      limb(g, P([[73, 55], [75, 66], [79.4, 75.6], [77.6, 86.4]]), [11, 6.4, 4, 3.4].map(X), far);
      shaded(g, X(75.8), Y(88.2), X(3.6), X(1.7), far);
      limb(g, P([[47, 57], [47.4, 70], [47, 81], [46.4, 86.4]]), [8, 5, 3.6, 3.4].map(X), far);
      shaded(g, X(44.8), Y(88.2), X(3.6), X(1.7), far);
      // near hind leg: a heavy thigh, the hock bent back, a long foot
      limb(g, P([[68, 55], [70.4, 66], [75, 76], [73.2, 86.6]]), [14, 8.4, 4.6, 3.8].map(X), p);
      shaded(g, X(71.2), Y(88.6), X(4), X(1.9), p);
      claws(68.4, 88.6, 3);
      // near foreleg: straight, long, a paw that stands on something
      limb(g, P([[41, 57], [40.4, 70], [39.8, 81.4], [38.8, 86.8]]), [10.4, 6.2, 4.2, 3.8].map(X), p);
      shaded(g, X(37), Y(88.6), X(4), X(1.9), p);
      claws(34.2, 88.8, 3);
      /* The body, one line: the chest deep in front, the back level, the
         waist tucked up underneath, the haunch rounding off into the tail. */
      const body = mass(g, P([[31, 47], [38, 42.6], [48, 42], [60, 42.6], [70, 41.6], [77.4, 44],
        [81.4, 50.6], [80.6, 58.6], [76.4, 64.6], [70, 66], [63, 62.6], [55, 61.8], [47, 65.4],
        [40.6, 67.6], [34.4, 64.8], [30.2, 56.6]]), p);
      g.save();
      body(); g.clip();
      pelt(g, p, X(56), Y(53), X(27), X(13), 0.02, 8, 0.55, 0.42);
      // the pale underside, throat to belly; a dark saddle along the back
      g.fillStyle = 'rgba(255,248,232,.2)';
      g.beginPath(); g.ellipse(X(37), Y(62), X(7), X(8), -0.3, 0, WS.TAU); g.fill();
      g.fillStyle = 'rgba(255,248,232,.12)';
      g.beginPath(); g.ellipse(X(55), Y(63), X(12), X(3), 0, 0, WS.TAU); g.fill();
      g.fillStyle = p.dark; g.globalAlpha = 0.34;
      g.beginPath(); g.ellipse(X(60), Y(42), X(20), X(4.6), 0.02, 0, WS.TAU); g.fill();
      // the muscle under the coat: haunch and shoulder
      g.strokeStyle = p.lo; g.globalAlpha = 0.55; g.lineWidth = u * 1.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(66), Y(64)); g.quadraticCurveTo(X(63.6), Y(52), X(72), Y(46.4)); g.stroke();
      g.beginPath(); g.moveTo(X(44), Y(65)); g.quadraticCurveTo(X(49), Y(55), X(46), Y(45)); g.stroke();
      g.strokeStyle = p.hi; g.globalAlpha = 0.35; g.lineWidth = u * 0.9;
      g.beginPath(); g.moveTo(X(67.2), Y(62)); g.quadraticCurveTo(X(65), Y(53), X(72.6), Y(48)); g.stroke();
      g.restore();
      // hackles up over the shoulders
      for (let i = 0; i < 7; i++) {
        const t = i / 6, bx = 37 + t * 20, by = 42.6 + t * 0.6 - Math.sin(t * WS.PI) * 2;
        const len = 3.4 + Math.sin(t * WS.PI) * 2.6;
        poly(g, P([[bx - 1.6, by + 1.6], [bx + 1.8 - len * 0.1, by - len], [bx + 2, by + 1.6]]), i % 2 ? p.dark : p.lo, p.line, u * 0.5);
      }
      // the neck, thick, carrying the head forward
      shaded(g, X(32), Y(44), X(8.4), X(9.6), p, -0.8);
      pelt(g, p, X(32), Y(44), X(8.4), X(9.6), -0.8, 3, 0.3, 0.32);
      // a ruff at the cheek
      poly(g, P([[27, 41], [25, 47.6], [28.4, 45.8], [28.6, 50], [31.6, 46], [33.4, 49], [34, 42]]), p.mid, p.line, u * 0.6);
      // the head
      shaded(g, X(23.4), Y(37.4), X(9.4), X(7.6), p, 0.12);
      pelt(g, p, X(23.4), Y(37.4), X(9.4), X(7.6), 0.12, 3, 0.4, 0.26);
      // ears, up and forward
      poly(g, P([[20.4, 32], [21.2, 21.6], [26.4, 30.4]]), p.mid, p.line, u * 0.7);
      poly(g, P([[25, 31.4], [28.6, 21], [31, 31.6]]), p.lo, p.line, u * 0.7);
      g.fillStyle = 'rgba(30,14,14,.55)';
      g.beginPath(); g.moveTo(X(26.6), Y(30.4)); g.lineTo(X(28.4), Y(24.4)); g.lineTo(X(29.6), Y(30.6)); g.closePath(); g.fill();
      // the muzzle: long, tapering, dark at the nose; the jaw under it
      poly(g, P([[17.6, 34.6], [6.6, 37.8], [5, 40.6], [7.6, 42.4], [18.4, 42.6]]), p.mid, p.line, u * 0.8);
      poly(g, P([[18.4, 42.6], [8.6, 42.6], [9.6, 44.8], [18, 45.4]]), p.lo, p.line, u * 0.7);
      g.fillStyle = 'rgba(255,248,232,.22)';
      g.beginPath(); g.ellipse(X(12), Y(41.4), X(5), X(1.2), 0.1, 0, WS.TAU); g.fill();
      g.fillStyle = '#141014';
      g.beginPath(); g.ellipse(X(6.2), Y(38.8), X(1.6), X(1.3), 0, 0, WS.TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.beginPath(); g.arc(X(5.8), Y(38.2), X(0.5), 0, WS.TAU); g.fill();
      g.strokeStyle = '#1e1414'; g.lineWidth = u * 0.7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(8), Y(42.6)); g.quadraticCurveTo(X(13), Y(43.4), X(19), Y(42)); g.stroke();
      // the long tooth, down over the lip
      poly(g, P([[11.6, 42.4], [12.6, 47.2], [13.8, 42.6]]), '#fbf7ee', '#7a766c', u * 0.4);
      poly(g, P([[15.4, 42.4], [16, 44.6], [16.8, 42.5]]), '#fbf7ee', '#7a766c', u * 0.3);
      eyes(g, X(19.4), Y(35.4), X(0.01), X(1.6), '#ffe08a');
      g.strokeStyle = p.line; g.lineWidth = u * 1; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(16.4), Y(33.8)); g.lineTo(X(22.4), Y(33.2)); g.stroke();
    },

    cat(g, s, p) {
      /* THE SAVANNAH PROWLER: a big cat on the stalk, not three balls in a
         row. Everything about it is the opposite of the wolf beside it: the
         body long and LOW between short heavy legs, the shoulder blades
         standing up out of the back as it creeps, the head round and carried
         low in front of them with a short muzzle, round ears, and a long tail
         that climbs behind it and hooks over at a dark tuft - the one
         vertical on a low animal. One forepaw is lifted mid-step. The coat
         is tawny, barred faintly along the flank, pale underneath, with a
         dark tear-line from the eye. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      // the tail: a tapered stroke climbing and hooking over, then the tuft
      const tailPts = [[74, 54], [84, 55], [90, 47], [90, 36], [86, 28], [80.4, 27]];
      limb(g, P(tailPts), [5.4, 4.6, 4, 3.6, 3.2, 2.8].map(X), p);
      poly(g, P([[84.4, 25.8], [81.6, 23.2], [77.4, 23.6], [75, 26.8], [75.8, 30], [79.2, 31.2], [83, 29.8]]), p.dark, p.line, u * 0.6);
      // far legs, in shade: the hind planted, the fore planted under the chest
      limb(g, P([[70, 57], [72, 66], [75.6, 72], [74, 86.2]]), [12, 7.4, 5, 4.6].map(X), far);
      shaded(g, X(72), Y(87.8), X(4.4), X(2), far);
      limb(g, P([[45, 59], [46, 70], [46.4, 80], [45.6, 86.2]]), [9, 6.4, 5, 4.6].map(X), far);
      shaded(g, X(43.8), Y(87.8), X(4.4), X(2), far);
      // the near legs, their tops tucked under the body that follows
      limb(g, P([[67, 58], [69, 67], [73.4, 74], [71.6, 86.6]]), [13.4, 8.2, 5.2, 4.8].map(X), p);
      shaded(g, X(69.6), Y(88.4), X(4.6), X(2.1), p);
      limb(g, P([[40, 60], [36, 69], [32.4, 75.6], [30, 79.6]]), [10.4, 6.6, 5.2, 5].map(X), p);
      shaded(g, X(29.6), Y(80.4), X(3.4), X(2.2), p, 0.5);
      /* The body, one line: up over the shoulder blades, down into the
         waist, up over the hips, round the rump, and back along a belly
         that sags a little between them. The neck comes down off the front
         of it to the head. */
      const body = mass(g, P([[31, 49], [37, 45], [44, 41.8], [50, 45.4], [57, 48.6], [64, 47.4],
        [71, 45], [77.4, 47.6], [81, 54], [79.6, 62], [75, 67.4], [68, 69], [60, 68.4], [52, 70],
        [44, 70], [37.6, 66.6], [32, 62.4], [28.6, 56]]), p);
      g.save();
      body(); g.clip();
      pelt(g, p, X(56), Y(57), X(26), X(13), 0.03, 8, 0.5, 0.3);
      // faint bars down the flank, the pale belly under them
      g.strokeStyle = p.dark; g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const x = 47 + i * 5.2;
        g.globalAlpha = 0.32; g.lineWidth = u * (1.8 - i * 0.12);
        g.beginPath(); g.moveTo(X(x), Y(47)); g.quadraticCurveTo(X(x + 2.6), Y(53), X(x + 1), Y(59)); g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,246,226,.2)';
      g.beginPath(); g.ellipse(X(54), Y(69), X(18), X(4.4), 0, 0, WS.TAU); g.fill();
      // the muscle under the coat: the haunch, the shoulder, the blade
      g.strokeStyle = p.lo; g.globalAlpha = 0.55; g.lineWidth = u * 1.2;
      g.beginPath(); g.moveTo(X(64), Y(66)); g.quadraticCurveTo(X(62), Y(54), X(70), Y(49.6)); g.stroke();
      g.beginPath(); g.moveTo(X(41), Y(66)); g.quadraticCurveTo(X(47), Y(57), X(45), Y(46)); g.stroke();
      g.strokeStyle = p.hi; g.globalAlpha = 0.35; g.lineWidth = u * 0.9;
      g.beginPath(); g.moveTo(X(65.2), Y(64)); g.quadraticCurveTo(X(63.4), Y(55), X(70.6), Y(51)); g.stroke();
      g.beginPath(); g.moveTo(X(40), Y(62)); g.quadraticCurveTo(X(36), Y(52), X(41.6), Y(45.4)); g.stroke();
      g.restore();
      // round ears, set wide, with dark backs
      poly(g, P([[18.6, 47.4], [19.2, 41.6], [22.4, 40.2], [24.6, 44.6]]), p.lo, p.line, u * 0.6);
      poly(g, P([[26.4, 44.6], [28.6, 40], [32, 40.8], [32.4, 46]]), p.dark, p.line, u * 0.6);
      g.fillStyle = 'rgba(255,240,220,.35)';
      g.beginPath(); g.ellipse(X(21.4), Y(44), X(1.2), X(2), 0.3, 0, WS.TAU); g.fill();
      // the head: round, broad at the cheek
      const head = mass(g, P([[13.4, 50.8], [16.5, 45.6], [22.8, 43.1], [29.9, 44.7], [34.4, 50.1],
        [33.3, 57.0], [27.7, 61.5], [20.1, 62.0], [14.5, 58.6]]), p);
      g.save(); head(); g.clip();
      pelt(g, p, X(24), Y(52), X(10), X(8.6), 0.08, 3, 0.3, 0.22);
      // the ruff of the cheek
      g.strokeStyle = p.lo; g.globalAlpha = 0.5; g.lineWidth = u;
      g.beginPath(); g.moveTo(X(27.4), Y(49)); g.quadraticCurveTo(X(30.6), Y(54), X(26.4), Y(59.4)); g.stroke();
      g.restore();
      // the muzzle, short and pale, the nose, the mouth, the chin
      shaded(g, X(17.6), Y(57.4), X(4.6), X(3.6), { hi: '#fff6e4', mid: p.glow, lo: p.hi, dark: p.mid, line: p.line, glow: '#fff' }, 0.1);
      poly(g, P([[13.4, 54.6], [16.6, 54.2], [15.2, 56.4]]), '#3a2622', '#1a0f0d', u * 0.4);
      g.strokeStyle = '#2a1a16'; g.lineWidth = u * 0.6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(15), Y(56.4)); g.lineTo(X(15.2), Y(58.4)); g.quadraticCurveTo(X(17.4), Y(60), X(19.6), Y(58.8)); g.stroke();
      g.beginPath(); g.moveTo(X(15.2), Y(58.4)); g.quadraticCurveTo(X(13.6), Y(59.6), X(12.6), Y(58.6)); g.stroke();
      // whiskers, and the tear-line from the eye to the mouth
      g.strokeStyle = 'rgba(255,250,240,.7)'; g.lineWidth = u * 0.35;
      for (const [dx, dy] of [[-7, -1.6], [-7.4, 0.4], [-6.6, 2.2]]) {
        g.beginPath(); g.moveTo(X(15.4), Y(57.4)); g.lineTo(X(15.4 + dx), Y(57.4 + dy)); g.stroke();
      }
      g.strokeStyle = p.dark; g.lineWidth = u * 1.1; g.globalAlpha = 0.7;
      g.beginPath(); g.moveTo(X(19.4), Y(52.4)); g.quadraticCurveTo(X(18.4), Y(55), X(19.6), Y(57)); g.stroke();
      g.globalAlpha = 1;
      eyes(g, X(20), Y(50.6), X(0.01), X(1.8), '#c9f26b');
      g.fillStyle = '#0a0806';
      g.beginPath(); g.ellipse(X(20), Y(50.6), X(0.4), X(1.4), 0, 0, WS.TAU); g.fill();
      g.strokeStyle = p.line; g.lineWidth = u * 0.9;
      g.beginPath(); g.moveTo(X(17.4), Y(48.6)); g.lineTo(X(22.6), Y(48.2)); g.stroke();
    },

    frog(g, s, p) { drawFrog(g, s, p, false); },
    frog_hop(g, s, p) { drawFrog(g, s, p, true); },

    beans(g, s, p) {
      /* BEANS, the cat druid who keeps the egg stall - drawn to the same
         standard as the creatures around her rather than as the flat polygon
         sketch she started as. A tabby sat up behind her basket with both
         forepaws on the rim, the way a cat drapes itself over whatever it is
         guarding; a hooded druid's cloak thrown over the back of her with a
         leaf-stitched hem; a strap across the chest and a pouch of her own
         namesake beans at the hip; a vine-wound staff planted beside her with
         a seed glowing in its crook and a little painted shop tag hanging off
         it. The eggs are what she is FOR, so they are the brightest things
         on her: five curious eggs in a woven basket, each its own colour and
         pattern, on a gingham cloth. Facing left, like the wild cat. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const robe = palette([0.34, 0.58, 0.32]);
      const robeIn = palette([0.16, 0.30, 0.18]);
      const wood = palette([0.46, 0.32, 0.20]);
      const wicker = palette([0.78, 0.60, 0.34]);
      const leather = palette([0.42, 0.26, 0.16]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const pale = { hi: '#fff8ec', mid: '#f6e4c8', lo: '#d9bc94', dark: '#a88a64', line: p.line, glow: '#fff' };

      /* ---- the staff, planted behind her right side ---- */
      limb(g, P([[86, 97], [84, 76], [87, 54], [84, 34], [86, 18]]), [3.4, 3.2, 3.0, 2.8, 2.6].map(X), wood);
      // knots, and a vine climbing it
      g.fillStyle = wood.dark;
      for (const [kx, ky] of [[85.2, 66], [86, 44], [84.6, 27]]) { g.beginPath(); g.ellipse(X(kx), Y(ky), X(1.1), X(0.7), 0.3, 0, WS.TAU); g.fill(); }
      g.strokeStyle = robe.mid; g.lineWidth = u * 1.1; g.lineCap = 'round';
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const t = k / 24, y = 88 - t * 66, x = 85.6 + Math.sin(t * 13) * 2.4;
        if (!k) g.moveTo(X(x), Y(y)); else g.lineTo(X(x), Y(y));
      }
      g.stroke();
      for (let k = 0; k < 6; k++) {
        const t = (k + 0.5) / 6, y = 88 - t * 66, x = 85.6 + Math.sin(t * 13) * 2.4;
        const d = k % 2 ? 1 : -1;
        poly(g, P([[x, y], [x + d * 3.2, y - 2.2], [x + d * 4.2, y + 0.6], [x + d * 1.4, y + 1.2]]), robe.hi, robe.line, u * 0.4);
      }
      // the crook, holding a glowing seed between two leaves
      g.strokeStyle = wood.mid; g.lineWidth = u * 2.4;
      g.beginPath(); g.moveTo(X(86), Y(19)); g.quadraticCurveTo(X(88), Y(8), X(81.6), Y(8.4)); g.stroke();
      const orb = g.createRadialGradient(X(84), Y(14), 0.4 * u, X(84), Y(14), 8 * u);
      orb.addColorStop(0, '#fbfff0'); orb.addColorStop(0.3, '#d8f79c'); orb.addColorStop(0.62, 'rgba(160,226,96,.45)'); orb.addColorStop(1, 'rgba(160,226,96,0)');
      g.fillStyle = orb; g.beginPath(); g.arc(X(84), Y(14), X(8), 0, WS.TAU); g.fill();
      shaded(g, X(84), Y(14), X(2.4), X(2.8), { hi: '#ffffff', mid: '#e4fbb8', lo: '#9ed45a', dark: '#6a9a38', line: '#3c5a1c', glow: '#fff' });
      poly(g, P([[84, 16], [78.6, 19.4], [80.4, 14.6]]), robe.hi, robe.line, u * 0.5);
      poly(g, P([[84, 16], [89.6, 19], [88, 14.2]]), robe.mid, robe.line, u * 0.5);
      // the shop tag: a little board on a string, an egg and a bean painted on
      g.strokeStyle = '#2a1d12'; g.lineWidth = u * 0.5;
      g.beginPath(); g.moveTo(X(85.6), Y(30)); g.lineTo(X(80.6), Y(35)); g.moveTo(X(85.6), Y(30)); g.lineTo(X(90.6), Y(35)); g.stroke();
      poly(g, P([[78.6, 35], [92.6, 35], [92, 44], [79.2, 44]]), '#caa46a', '#4a3218', u * 0.6);
      shaded(g, X(82.8), Y(39.6), X(1.9), X(2.5), { hi: '#fffaf0', mid: '#f3e2c8', lo: '#c9a878', dark: '#8a6a44', line: '#4a3218', glow: '#fff' });
      g.save(); g.translate(X(88.6), Y(39.8)); g.rotate(-0.5);
      g.fillStyle = '#7a4a1e'; g.beginPath(); g.ellipse(0, 0, X(2.2), X(1.4), 0, 0, WS.TAU); g.fill();
      g.strokeStyle = '#e8c48a'; g.lineWidth = u * 0.4; g.beginPath(); g.moveTo(-X(1), -X(0.2)); g.quadraticCurveTo(0, X(0.5), X(1), -X(0.2)); g.stroke();
      g.restore();

      /* ---- the tail, curled round the base of the staff ---- */
      const tailPts = [[76, 88], [86, 90], [92, 86], [93.6, 80], [90.4, 76.4]];
      limb(g, P(tailPts), [5.2, 4.8, 4.4, 4, 3.6].map(X), p);
      g.strokeStyle = p.dark; g.globalAlpha = 0.55; g.lineWidth = u * 1.3;
      for (const [x0, y0, x1, y1] of [[84, 87.6, 83.4, 92.4], [89.4, 85.4, 91.6, 89.8], [91.2, 79, 95.4, 81.4]]) {
        g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke();
      }
      g.globalAlpha = 1;
      shaded(g, X(90), Y(75.6), X(3.2), X(2.8), pale);

      /* ---- the haunches, sat down ---- */
      const haunch = mass(g, P([[52, 62], [66, 55], [78, 60], [83, 72], [80, 88], [66, 94], [50, 92], [45, 78]]), p);
      g.save(); haunch(); g.clip();
      pelt(g, p, X(66), Y(76), X(17), X(17), 0.05, 5, 0.4, 0.3);
      g.strokeStyle = p.dark; g.globalAlpha = 0.38; g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        g.lineWidth = u * (2 - i * 0.2);
        g.beginPath(); g.moveTo(X(62 + i * 5), Y(60 + i * 1.5)); g.quadraticCurveTo(X(66 + i * 5), Y(68), X(63 + i * 5), Y(76)); g.stroke();
      }
      g.restore();

      /* ---- the cloak over her back, and the hood hanging behind her head ---- */
      // The hood, thrown back: a fold of cloth framing the head from behind,
      // lined dark, with its lit edge showing where it turns.
      const hood = mass(g, P([[12, 38], [13, 20], [26, 7], [44, 6], [58, 18], [60, 36], [52, 48], [30, 50], [16, 48]]), robe);
      g.save(); hood(); g.clip();
      g.fillStyle = robeIn.mid; g.globalAlpha = 0.9;
      g.beginPath(); g.ellipse(X(35), Y(30), X(20), X(17), 0, 0, WS.TAU); g.fill();
      g.restore();
      g.strokeStyle = robe.hi; g.globalAlpha = 0.55; g.lineWidth = u * 1.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(14.6), Y(30)); g.quadraticCurveTo(X(18), Y(12), X(36), Y(8.4)); g.quadraticCurveTo(X(52), Y(9), X(58), Y(24)); g.stroke();
      g.globalAlpha = 1;
      const cloak = mass(g, P([[40, 38], [52, 30], [64, 36], [76, 50], [84, 66], [86, 82], [78, 90], [70, 86],
        [62, 72], [54, 62], [44, 56], [36, 50]]), robe);
      g.save(); cloak(); g.clip();
      // folds falling from the shoulder
      g.lineCap = 'round';
      for (const [x0, y0, x1, y1, x2, y2] of [[52, 34, 60, 54, 58, 70], [60, 38, 70, 56, 72, 80], [68, 44, 78, 62, 80, 84]]) {
        g.strokeStyle = robe.dark; g.globalAlpha = 0.45; g.lineWidth = u * 1.8;
        g.beginPath(); g.moveTo(X(x0), Y(y0)); g.quadraticCurveTo(X(x1), Y(y1), X(x2), Y(y2)); g.stroke();
        g.strokeStyle = robe.hi; g.globalAlpha = 0.35; g.lineWidth = u * 0.9;
        g.beginPath(); g.moveTo(X(x0 + 1.6), Y(y0)); g.quadraticCurveTo(X(x1 + 1.6), Y(y1), X(x2 + 1.6), Y(y2)); g.stroke();
      }
      g.restore();
      // the hem: a gold stitched band, and leaves worked into it
      g.strokeStyle = '#d9b45a'; g.lineWidth = u * 1.3; g.globalAlpha = 0.9;
      g.beginPath(); g.moveTo(X(86), Y(80.4)); g.quadraticCurveTo(X(83), Y(88), X(78), Y(88.4)); g.quadraticCurveTo(X(72), Y(86), X(69), Y(82)); g.stroke();
      g.globalAlpha = 1;
      for (const [lx, ly, r] of [[84.4, 84.6, -0.6], [79.6, 87.4, 0.2], [73.4, 85.6, 0.8]]) {
        g.save(); g.translate(X(lx), Y(ly)); g.rotate(r);
        g.fillStyle = '#e8d07a'; g.beginPath(); g.ellipse(0, 0, X(1.5), X(0.8), 0, 0, WS.TAU); g.fill();
        g.restore();
      }

      /* ---- the chest, and a strap across it ---- */
      const chest = mass(g, P([[30, 48], [40, 42], [50, 46], [56, 60], [52, 74], [38, 78], [28, 68]]), p);
      g.save(); chest(); g.clip();
      shaded(g, X(40), Y(62), X(9), X(13), pale);
      pelt(g, pale, X(40), Y(62), X(9), X(13), 0, 3, 0.2, 0.25);
      g.restore();
      poly(g, P([[38, 44], [42, 43], [66, 76], [62, 78]]), leather.mid, leather.line, u * 0.6);
      // the cloak's front edge, over the near shoulder, and the clasp
      poly(g, P([[44, 44], [54, 40], [58, 50], [56, 64], [52, 60], [48, 52]]), robe.mid, robe.line, u * 0.8);
      g.strokeStyle = '#d9b45a'; g.lineWidth = u * 1; g.globalAlpha = 0.85;
      g.beginPath(); g.moveTo(X(44.6), Y(45)); g.quadraticCurveTo(X(49), Y(50), X(52.4), Y(60)); g.stroke();
      g.globalAlpha = 1;
      shaded(g, X(45.4), Y(46), X(2.6), X(2.6), { hi: '#fff2c0', mid: '#e0b84a', lo: '#8a6a1a', dark: '#5a4210', line: '#3a2a08', glow: '#fff' });
      poly(g, P([[45.4, 43.8], [46.8, 46], [45.4, 48.2], [44, 46]]), '#7ac25a', '#2a4a18', u * 0.4);
      poly(g, P([[48.6, 57.4], [52.6, 57.4], [52.6, 61.4], [48.6, 61.4]]), '#d9b45a', '#5a4214', u * 0.5);
      // the bean pouch at her hip, open, a few beans showing at the neck
      const pouch = mass(g, P([[60, 72], [70, 71], [73, 78], [70, 85], [61, 85], [58, 78]]), leather);
      void pouch;
      g.strokeStyle = leather.dark; g.lineWidth = u * 0.9;
      g.beginPath(); g.moveTo(X(60.4), Y(74.6)); g.quadraticCurveTo(X(65.4), Y(76.6), X(71), Y(74.4)); g.stroke();
      const beanC = { hi: '#f0c070', mid: '#c2873c', lo: '#7a4a1e', dark: '#4a2a10', line: '#2a160a', glow: '#fff' };
      for (const [bx, by, br, rot] of [[62.6, 72.4, 1.7, 0.4], [65.6, 71.4, 1.6, -0.3], [68.4, 72.4, 1.5, 0.7]]) {
        shaded(g, X(bx), Y(by), X(br), X(br * 0.7), beanC, rot);
      }

      /* ---- the head: big, round and friendly, in the mouth of the hood ---- */
      poly(g, P([[18, 28], [15.6, 11], [28.6, 21]]), p.mid, p.line, u * 0.6);     // far ear
      g.fillStyle = '#f2a3a0'; g.globalAlpha = 0.8;
      g.beginPath(); g.moveTo(X(19.4), Y(25)); g.lineTo(X(17.6), Y(15.4)); g.lineTo(X(25), Y(21.4)); g.closePath(); g.fill();
      g.globalAlpha = 1;
      const head = mass(g, P([[14, 34], [18, 24], [28, 19], [40, 20], [47, 28], [47, 39], [41, 46], [29, 48], [19, 44]]), p);
      g.save(); head(); g.clip();
      pelt(g, p, X(31), X(33), X(15), X(13), 0.05, 4, 0.3, 0.22);
      // tabby marks on the brow
      g.strokeStyle = p.dark; g.globalAlpha = 0.5; g.lineWidth = u * 1.3; g.lineCap = 'round';
      for (const [x0, y0, x1, y1] of [[28, 20.6, 29, 25.4], [32, 20.4, 32.4, 25.6], [36, 21, 35.4, 25.6]]) {
        g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke();
      }
      // the pale muzzle and cheeks
      g.globalAlpha = 1;
      shaded(g, X(27), Y(40.6), X(8.4), X(5.4), pale);
      g.restore();
      poly(g, P([[34, 22], [40, 6], [45, 25]]), p.lo, p.line, u * 0.6);           // near ear
      g.fillStyle = '#f2a3a0'; g.globalAlpha = 0.85;
      g.beginPath(); g.moveTo(X(36.4), Y(21.4)); g.lineTo(X(40), Y(10.6)); g.lineTo(X(43), Y(23.2)); g.closePath(); g.fill();
      g.globalAlpha = 1;
      // a circlet of leaves across the brow: the druid, in one line
      g.strokeStyle = robe.lo; g.lineWidth = u * 1.2;
      g.beginPath(); g.moveTo(X(17.4), Y(27)); g.quadraticCurveTo(X(30), Y(19.6), X(45.6), Y(26)); g.stroke();
      for (const [lx, ly, r, c] of [[21, 24.4, -0.8, robe.hi], [29, 21.6, -0.2, robe.mid], [37, 21.8, 0.4, robe.hi], [43.6, 24.4, 0.9, robe.mid]]) {
        g.save(); g.translate(X(lx), Y(ly)); g.rotate(r);
        poly(g, [[0, -X(2.6)], [X(1.4), 0], [0, X(1.2)], [-X(1.4), 0]], c, robe.line, u * 0.4);
        g.restore();
      }
      // the eyes: big and bright, pupils slit, a catchlight each
      for (const [ex, ey, rx] of [[23.6, 33.2, 3.2], [35.4, 33.2, 3.4]]) {
        g.fillStyle = 'rgba(20,10,6,.55)';
        g.beginPath(); g.ellipse(X(ex), Y(ey), X(rx + 0.8), X(rx + 0.4), 0, 0, WS.TAU); g.fill();
        const iris = g.createRadialGradient(X(ex - 0.6), Y(ey - 0.8), X(0.3), X(ex), Y(ey), X(rx));
        iris.addColorStop(0, '#f4ffb0'); iris.addColorStop(0.55, '#a8e04a'); iris.addColorStop(1, '#4e8a1c');
        g.fillStyle = iris;
        g.beginPath(); g.ellipse(X(ex), Y(ey), X(rx), X(rx * 0.95), 0, 0, WS.TAU); g.fill();
        g.fillStyle = '#0d0806';
        g.beginPath(); g.ellipse(X(ex + 0.2), Y(ey + 0.2), X(0.8), X(rx * 0.78), 0, 0, WS.TAU); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(X(ex - 1.1), Y(ey - 1.2), X(0.9), 0, WS.TAU); g.fill();
        g.beginPath(); g.arc(X(ex + 1), Y(ey + 1), X(0.4), 0, WS.TAU); g.fill();
        g.strokeStyle = p.line; g.lineWidth = u * 0.7;
        g.beginPath(); g.ellipse(X(ex), Y(ey), X(rx), X(rx * 0.95), 0, WS.PI * 1.08, WS.PI * 1.92); g.stroke();
      }
      // blush, nose, a smile, whiskers
      g.fillStyle = 'rgba(255,120,120,.28)';
      g.beginPath(); g.ellipse(X(19.6), Y(39.6), X(2.6), X(1.4), 0, 0, WS.TAU); g.fill();
      g.beginPath(); g.ellipse(X(39.6), Y(39.6), X(2.6), X(1.4), 0, 0, WS.TAU); g.fill();
      poly(g, P([[27.4, 38], [31, 38], [29.2, 40.2]]), '#e07a86', '#4a1c1c', u * 0.4);
      g.strokeStyle = '#3a1e18'; g.lineWidth = u * 0.7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(29.2), Y(40.2)); g.lineTo(X(29.2), Y(41.4));
      g.quadraticCurveTo(X(27.2), Y(43.6), X(25.4), Y(41.8));
      g.moveTo(X(29.2), Y(41.4)); g.quadraticCurveTo(X(31.2), Y(43.6), X(33), Y(41.8)); g.stroke();
      g.strokeStyle = 'rgba(255,250,240,.75)'; g.lineWidth = u * 0.4;
      for (const [x0, y0, x1, y1] of [[24, 40.6, 12, 38.4], [24, 41.8, 11.6, 42.4], [34.4, 40.6, 45.6, 38.6], [34.4, 41.8, 46, 42.6]]) {
        g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke();
      }

      /* ---- the stall: a woven basket, a gingham cloth, five curious eggs ---- */
      // the back rim first, so the eggs sit IN the basket rather than on it
      g.fillStyle = wicker.dark;
      g.beginPath(); g.ellipse(X(35), Y(74.4), X(24), X(3.6), 0, 0, WS.TAU); g.fill();
      const EGGS = [
        [17.6, 71.4, 4.2, 5.4, ['#9fd0f2', '#5a9ad0'], 'dots'],
        [26.6, 69.2, 4.6, 5.8, ['#f7b4cf', '#d86a98'], 'zig'],
        [36, 70.6, 4.4, 5.6, ['#f6d774', '#c99a2c'], 'dots'],
        [45, 69.6, 4.2, 5.4, ['#a8e0a0', '#58a458'], 'swirl'],
        [53, 71.6, 3.8, 5, ['#fff4e2', '#d8c09a'], 'plain'],
      ];
      for (const [ex, ey, rx, ry, [c0, c1], pat] of EGGS) {
        const eg = g.createRadialGradient(X(ex - rx * 0.35), Y(ey - ry * 0.4), X(0.4), X(ex), Y(ey), X(ry * 1.2));
        eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.35, c0); eg.addColorStop(1, c1);
        g.save();
        g.beginPath(); g.ellipse(X(ex), Y(ey), X(rx), X(ry), 0, 0, WS.TAU);
        g.fillStyle = eg; g.fill();
        g.clip();
        g.fillStyle = c1; g.strokeStyle = c1; g.lineWidth = u * 0.8; g.globalAlpha = 0.8;
        if (pat === 'dots') {
          for (const [dx, dy, dr] of [[-1.6, -1.8, 0.8], [1.4, -0.6, 0.7], [-0.4, 1.6, 0.9], [2, 2.4, 0.6], [-2.2, 1, 0.5]]) {
            g.beginPath(); g.arc(X(ex + dx), Y(ey + dy), X(dr), 0, WS.TAU); g.fill();
          }
        } else if (pat === 'zig') {
          g.beginPath();
          for (let k = 0; k <= 6; k++) g.lineTo(X(ex - rx + k * rx / 3), Y(ey + (k % 2 ? -1 : 1) * 1.1));
          g.stroke();
        } else if (pat === 'swirl') {
          g.beginPath(); g.arc(X(ex), Y(ey), X(1.8), 0.2, WS.TAU * 0.85); g.stroke();
        }
        g.restore();
        g.strokeStyle = 'rgba(40,24,12,.55)'; g.lineWidth = u * 0.6;
        g.beginPath(); g.ellipse(X(ex), Y(ey), X(rx), X(ry), 0, 0, WS.TAU); g.stroke();
      }
      // the basket body, woven: stakes down, weavers across, over and under
      const body = P([[11, 74], [59, 74], [55, 96], [15, 97]]);
      poly(g, body, wicker.mid, wicker.line, u * 1);
      g.save();
      g.beginPath(); g.moveTo(body[0][0], body[0][1]); body.slice(1).forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.clip();
      for (let row = 0; row < 5; row++) {
        const y0 = 76 + row * 4.2;
        for (let col = 0; col < 12; col++) {
          const x0 = 11 + col * 4.2 + (row % 2) * 2.1;
          const wv = g.createLinearGradient(0, Y(y0), 0, Y(y0 + 3.6));
          wv.addColorStop(0, wicker.hi); wv.addColorStop(0.5, wicker.mid); wv.addColorStop(1, wicker.lo);
          g.fillStyle = wv;
          g.beginPath(); g.ellipse(X(x0 + 2), Y(y0 + 1.8), X(2.1), X(1.7), 0, 0, WS.TAU); g.fill();
        }
      }
      g.strokeStyle = wicker.dark; g.globalAlpha = 0.6; g.lineWidth = u * 0.7;
      for (let col = 0; col < 13; col++) {
        const x = 12 + col * 3.8;
        g.beginPath(); g.moveTo(X(x), Y(74)); g.lineTo(X(x + (35 - x) * 0.08), Y(97)); g.stroke();
      }
      g.globalAlpha = 1;
      const shade = g.createLinearGradient(X(11), 0, X(59), 0);
      shade.addColorStop(0, 'rgba(0,0,0,.28)'); shade.addColorStop(0.4, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.22)');
      g.fillStyle = shade; g.fillRect(X(10), Y(73), X(50), Y(26));
      g.restore();
      // the front rim: a braided roll
      g.strokeStyle = wicker.lo; g.lineWidth = u * 3.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(11.4), Y(74.6)); g.lineTo(X(58.6), Y(74.6)); g.stroke();
      g.strokeStyle = wicker.hi; g.lineWidth = u * 1;
      for (let k = 0; k < 12; k++) {
        const x = 12.6 + k * 3.9;
        g.beginPath(); g.moveTo(X(x), Y(73.2)); g.lineTo(X(x + 2.4), Y(75.8)); g.stroke();
      }
      // the gingham cloth, tucked over the front with a scalloped edge
      const cloth = P([[18, 75], [40, 75], [38, 84], [34, 82.6], [30, 85], [26, 82.8], [22, 85.2], [19, 83]]);
      poly(g, cloth, '#f2e6d2', '#6a2a22', u * 0.7);
      g.save();
      g.beginPath(); g.moveTo(cloth[0][0], cloth[0][1]); cloth.slice(1).forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.clip();
      g.fillStyle = 'rgba(200,52,48,.55)';
      for (let k = 0; k < 6; k++) g.fillRect(X(18 + k * 4), Y(74), X(2), Y(12));
      for (let k = 0; k < 3; k++) g.fillRect(X(17), Y(75.6 + k * 4), X(24), Y(2));
      g.restore();

      /* ---- her forepaws, on the rim ---- */
      for (const [px, py] of [[46.6, 72.8], [56, 72.4]]) {
        // an orange paw with pale toes, so it reads as HER rather than a
        // sixth egg sat on the rim
        shaded(g, X(px), Y(py - 0.6), X(4.2), X(3), p);
        shaded(g, X(px - 0.6), Y(py + 0.8), X(3.2), X(1.7), pale);
        g.strokeStyle = p.line; g.lineWidth = u * 0.55;
        for (const dx of [-2, -0.4, 1.2]) { g.beginPath(); g.moveTo(X(px + dx), Y(py + 0.2)); g.lineTo(X(px + dx), Y(py + 2.2)); g.stroke(); }
      }
      void far;
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
      /* THE THORNHIDE BATTLEGUARD, redrawn. It was a round ball with quills
         on it. A battleguard is a boar that stands up and fights: a heavy
         tusked head slung forward, a crest of quills from the brow all the
         way down the back - long ones and short ones, a mane, not a comb -
         a hunched hide-armoured body, hooves, and a spear held low. The
         quills are the silhouette; everything else is what carries them. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const hide = { hi: '#9a7048', mid: '#6e4c2e', lo: '#4a321c', dark: '#2e1e10', line: '#160e06', glow: '#fff' };
      const QUILL = '#efe4cc', QUILL_TIP = '#3a2a1c';
      // the spear, behind everything, held low and pointed forward
      g.strokeStyle = '#5a4028'; g.lineWidth = u * 2.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(78), Y(46)); g.lineTo(X(10), Y(66)); g.stroke();
      poly(g, P([[4, 68], [13, 62.5], [14.5, 67.5]]), '#d8dce4', '#3a3e46', u * 0.6);
      // far leg
      limb(g, P([[58, 64], [62, 74], [60, 84]]), [9, 7, 5].map(X), far);
      poly(g, P([[56, 84], [63, 84], [64, 88], [55, 88]]), '#2a1e14', '#0e0804', u * 0.5);
      // the quill mane: from the brow down the back, long and short
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < 15; i++) {
          const t = i / 14;
          const bx = 40 + t * 34, by = 22 + t * 26 + Math.sin(t * Math.PI) * -4;
          const a = -1.9 + t * 1.5 + (i % 2 ? 0.12 : -0.08);
          const len = (i % 2 ? 11 : 17) * (1 - Math.abs(t - 0.4) * 0.6) * (pass ? 0.8 : 1);
          if ((i % 2) !== pass) continue;
          const tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len;
          const nx = -Math.sin(a) * 1.5, ny = Math.cos(a) * 1.5;
          poly(g, P([[bx - nx, by - ny], [tx, ty], [bx + nx, by + ny]]), QUILL, '#6a5a44', u * 0.4);
          g.strokeStyle = QUILL_TIP; g.lineWidth = u * 1.2;
          g.beginPath(); g.moveTo(X(bx + (tx - bx) * 0.72), Y(by + (ty - by) * 0.72)); g.lineTo(X(tx), Y(ty)); g.stroke();
        }
      }
      // the body: hunched, in hide armour
      const body = mass(g, P([[36, 40], [44, 30], [58, 30], [70, 40], [72, 54], [66, 66], [48, 68], [38, 60]]), p);
      g.save(); body(); g.clip();
      poly(g, P([[34, 52], [74, 52], [74, 70], [34, 70]]), hide.mid, hide.line, u * 0.6);
      g.strokeStyle = hide.line; g.lineWidth = u * 0.7; g.globalAlpha = 0.6;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(X(38 + k * 8), Y(52)); g.lineTo(X(36 + k * 8), Y(68)); g.stroke(); }
      g.globalAlpha = 1;
      poly(g, P([[40, 36], [66, 44], [64, 48], [38, 41]]), hide.lo, hide.line, u * 0.5);     // strap
      g.restore();
      // near leg, hoofed
      limb(g, P([[46, 64], [44, 75], [46, 84]]), [10, 8, 6].map(X), p);
      poly(g, P([[41, 84], [49, 84], [50, 88.5], [40, 88.5]]), '#2a1e14', '#0e0804', u * 0.5);
      g.strokeStyle = '#0e0804'; g.lineWidth = u * 0.6;
      g.beginPath(); g.moveTo(X(45), Y(84.5)); g.lineTo(X(45), Y(88.5)); g.stroke();
      // the head: heavy, slung forward, snout and tusks
      const head = mass(g, P([[20, 34], [26, 24], [36, 20], [46, 24], [48, 34], [42, 42], [28, 44], [18, 41]]), p);
      g.save(); head(); g.clip();
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(X(14), Y(36), X(40), X(12));
      g.restore();
      shaded(g, X(40), Y(22), X(3.6), X(4.6), p, 0.4);                 // ear
      mass(g, P([[12, 34], [18, 31], [23, 34], [22, 41], [14, 42]]), { hi: p.glow, mid: p.hi, lo: p.mid, dark: p.lo, line: p.line, glow: '#fff' });
      g.fillStyle = '#1a0c08';
      for (const [x, y] of [[14.4, 36.4], [17.4, 36]]) { g.beginPath(); g.ellipse(X(x), Y(y), X(0.9), X(1.2), 0, 0, WS.TAU); g.fill(); }
      // tusks
      g.strokeStyle = '#f4ecdc'; g.lineWidth = u * 2.4; g.lineCap = 'round';
      for (const [x, y] of [[20, 41], [25, 42.5]]) {
        g.beginPath(); g.moveTo(X(x), Y(y)); g.quadraticCurveTo(X(x - 5), Y(y - 1), X(x - 5.5), Y(y - 7)); g.stroke();
      }
      eyes(g, X(29), Y(30), X(0.01), X(1.5), '#ff9d4a');
      g.strokeStyle = p.line; g.lineWidth = u;
      g.beginPath(); g.moveTo(X(26), Y(27.6)); g.lineTo(X(32), Y(29)); g.stroke();
      // near arm, gripping the spear
      limb(g, P([[42, 40], [36, 52], [32, 60]]), [8, 6.4, 5.6].map(X), p);
      shaded(g, X(31), Y(61), X(3.8), X(3.4), p);
    },

    raptor(g, s, p) {
      /* THE SUNHIDE RAPTOR. It was an egg with a beak on a single stick
         leg. A raptor is a line: a long jaw, an S of a neck, a body slung
         level between the hips, and a stiff tail held out straight behind
         to balance it - and under the hips two legs that bend forward at
         the knee and back at the ankle, walking on the toes with the
         killing claw held up off the ground. Small clawed arms tucked at
         the chest, a crest of quills, and the banding of a reptile running
         across it rather than fur running along it. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const CLAW = '#f3efe4', CLAW_LINE = '#6a6458';
      const foot = (x, y, pal) => {
        // three toes forward on the ground, the sickle claw raised
        for (const [dx, len] of [[-2, 5.6], [0.8, 7.2]]) {
          limb(g, P([[x + dx + 1, y - 1.4], [x + dx - len, y]]), [3.2 * u, 2.4 * u], pal);
          poly(g, P([[x + dx - len, y - 0.8], [x + dx - len - 2.2, y + 0.6], [x + dx - len + 0.2, y + 0.8]]), CLAW, CLAW_LINE, u * 0.4);
        }
        g.save();
        g.strokeStyle = CLAW_LINE; g.lineWidth = u * 1.6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(X(x - 0.6), Y(y - 1.6)); g.quadraticCurveTo(X(x - 3.6), Y(y - 6), X(x - 6.4), Y(y - 4.4)); g.stroke();
        g.strokeStyle = CLAW; g.lineWidth = u * 1.0;
        g.beginPath(); g.moveTo(X(x - 0.6), Y(y - 1.6)); g.quadraticCurveTo(X(x - 3.6), Y(y - 6), X(x - 6.4), Y(y - 4.4)); g.stroke();
        g.restore();
      };
      // the far leg, in shade
      limb(g, P([[71, 48], [68.6, 61], [75, 73.4], [72.8, 85.6]]), [11, 6.4, 3.8, 3.2].map(X), far);
      foot(72.8, 86.6, far);
      /* The body and the tail, one line: up the back of the neck's root,
         level along the spine, out along the tail to its point and back
         under it, round the belly and the chest. */
      const body = mass(g, P([[35, 42], [42, 38.6], [52, 38.4], [62, 39.4], [72, 39.4], [83, 36.8],
        [93.4, 34.2], [93.4, 36.4], [84, 41.6], [74, 47], [67, 54.6], [58, 57.8], [47, 57.4],
        [39.4, 53.4], [34.4, 47.6]]), p);
      g.save();
      body(); g.clip();
      // bands across the back and down the tail
      g.strokeStyle = p.dark; g.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const x = 42 + i * 6, top = 36 - WS.max(0, i - 4) * 1.2;
        g.globalAlpha = 0.5; g.lineWidth = u * (2.4 - i * 0.14);
        g.beginPath(); g.moveTo(X(x), Y(top)); g.quadraticCurveTo(X(x + 2.6), Y(top + 6), X(x + 0.6), Y(top + 12 - i * 0.6)); g.stroke();
      }
      // the pale belly and throat
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,244,214,.26)';
      g.beginPath(); g.ellipse(X(50), Y(57), X(14), X(4.6), 0.05, 0, WS.TAU); g.fill();
      g.restore();
      // the arm, small, folded at the chest, three claws
      limb(g, P([[44, 50], [45.4, 57], [40, 61]]), [4.6, 3, 2.6].map(X), p);
      for (let i = 0; i < 3; i++) {
        const cx = 39.6 - i * 1.2;
        poly(g, P([[cx, 60], [cx - 1.8, 63.4], [cx + 0.6, 61.4]]), CLAW, CLAW_LINE, u * 0.35);
      }
      poly(g, P([[44, 53], [41, 55], [45.4, 57.6], [43, 59.6], [47, 58.6]]), p.hi, p.line, u * 0.4);
      // the near leg: the drumstick of a thigh, the shin forward, the ankle back
      limb(g, P([[62, 50], [58, 63], [64.6, 75], [62.4, 86]]), [12.4, 7.2, 4.2, 3.6].map(X), p);
      shaded(g, X(61), Y(53.4), X(7.6), X(10.6), p, -0.4);
      g.save();
      g.beginPath(); g.ellipse(X(61), Y(53.4), X(7.6), X(10.6), -0.4, 0, WS.TAU); g.clip();
      g.strokeStyle = p.dark; g.globalAlpha = 0.45; g.lineWidth = u * 1.6;
      for (const y of [47, 52, 57]) { g.beginPath(); g.moveTo(X(53), Y(y)); g.quadraticCurveTo(X(61), Y(y + 3), X(69), Y(y - 1)); g.stroke(); }
      g.restore();
      foot(62.4, 87, p);
      // the neck and the head, one long line from the chest to the snout
      const head = mass(g, P([[36, 50], [33.6, 42], [30, 35.6], [24, 31.4], [16, 31.2], [8, 33.4],
        [3.8, 36], [5, 38.4], [11, 38.6], [8, 41], [16, 42.2], [22.4, 41.6], [27.4, 44], [30.6, 51]]), p);
      g.save(); head(); g.clip();
      g.strokeStyle = p.dark; g.globalAlpha = 0.45; g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        g.lineWidth = u * 1.6;
        g.beginPath(); g.moveTo(X(26 + i * 3.6), Y(33 + i * 2)); g.quadraticCurveTo(X(29 + i * 3.6), Y(38 + i * 2), X(26.6 + i * 3.6), Y(43 + i * 2)); g.stroke();
      }
      g.restore();
      // the mouth: a long line and a row of teeth
      g.fillStyle = '#2a0e0a';
      g.beginPath(); g.moveTo(X(5), Y(38.2)); g.lineTo(X(20), Y(39)); g.lineTo(X(20), Y(40)); g.lineTo(X(9.4), Y(40.4)); g.closePath(); g.fill();
      for (let i = 0; i < 5; i++) {
        const x = 7 + i * 2.6;
        poly(g, P([[x, 38.1], [x + 0.7, 40], [x + 1.4, 38.2]]), '#fffaf0', '#8a847a', u * 0.3);
      }
      g.fillStyle = '#1a0e0a';
      g.beginPath(); g.ellipse(X(6.4), Y(34.8), X(0.9), X(0.6), 0.3, 0, WS.TAU); g.fill();
      // the crest: quills swept back off the skull and down the neck
      const Q = [[22, 31.6, 30, 22.4], [25.6, 32.4, 34.6, 25], [28.4, 34, 37.6, 29], [31, 37, 40, 33.6], [34, 40.6, 42, 38]];
      Q.forEach(([x0, y0, x1, y1], i) => {
        poly(g, P([[x0 - 1.4, y0 + 0.6], [x1, y1], [x0 + 1.8, y0 + 1]]), i % 2 ? p.hi : '#e8503a', p.line, u * 0.5);
      });
      eyes(g, X(17), Y(34.4), X(0.01), X(1.5), '#ffe066');
      g.fillStyle = '#0a0806';
      g.beginPath(); g.ellipse(X(17), Y(34.4), X(0.35), X(1.1), 0, 0, WS.TAU); g.fill();
      g.strokeStyle = p.line; g.lineWidth = u * 1; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(14), Y(32.6)); g.lineTo(X(19.6), Y(32.4)); g.stroke();
    },

    strider(g, s, p) {
      /* A TERROR-BIRD, not a balloon on stilts. Long scaled legs with the
         backward knee and three toes; a body of layered feathers with a
         folded wing and a plumed tail held up behind; a long neck with a
         crest down the back of it; and a hooked beak made for tearing. The
         Stormhide Colossus wears this body, so it has to carry plate. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const SCALE = { hi: '#d9c9a0', mid: '#a08a5c', lo: '#5e4e30', line: '#2a2214' };
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      // legs: thigh in the feathers, a long scaled shank, three toes
      const leg = (hx, kx, ky, fx, col) => {
        shaded(g, X(hx), Y(62), X(5), X(8), col, 0.2);
        g.save(); g.lineCap = 'round';
        g.strokeStyle = SCALE.line; g.lineWidth = u * 3.6;
        g.beginPath(); g.moveTo(X(hx + 1), Y(66)); g.lineTo(X(kx), Y(ky)); g.lineTo(X(fx), Y(86)); g.stroke();
        g.strokeStyle = SCALE.mid; g.lineWidth = u * 2.4;
        g.beginPath(); g.moveTo(X(hx + 1), Y(66)); g.lineTo(X(kx), Y(ky)); g.lineTo(X(fx), Y(86)); g.stroke();
        g.strokeStyle = SCALE.line; g.lineWidth = u * 0.5;
        for (let k = 1; k < 6; k++) {
          const t = k / 6, sx = kx + (fx - kx) * t, sy = ky + (86 - ky) * t;
          g.beginPath(); g.moveTo(X(sx - 1.2), Y(sy)); g.lineTo(X(sx + 1.2), Y(sy - 0.4)); g.stroke();
        }
        g.restore();
        for (const [dx, dy] of [[-6, 1.6], [-3, 3], [3, 2.4]]) {
          g.save(); g.lineCap = 'round';
          g.strokeStyle = SCALE.line; g.lineWidth = u * 1.8;
          g.beginPath(); g.moveTo(X(fx), Y(86)); g.lineTo(X(fx + dx), Y(86 + dy)); g.stroke();
          g.strokeStyle = '#e9edf5'; g.lineWidth = u * 0.8;
          g.beginPath(); g.moveTo(X(fx + dx * 0.8), Y(86 + dy * 0.8)); g.lineTo(X(fx + dx * 1.15), Y(86 + dy * 1.1)); g.stroke();
          g.restore();
        }
      };
      leg(58, 64, 74, 60, far);
      // the tail: a fan of plumes held up behind
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.28, len = 20 - Math.abs(i - 2) * 2;
        const bx = 66, by = 50, tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len;
        poly(g, P([[bx, by - 1.6], [tx, ty], [bx, by + 1.6]]), i % 2 ? p.mid : p.lo, p.line, u * 0.6);
      }
      // the body: layered feathers
      shaded(g, X(52), Y(54), X(17), X(13), p, 0.15);
      g.save();
      g.beginPath(); g.ellipse(X(52), Y(54), X(17), X(13), 0.15, 0, WS.TAU); g.clip();
      for (let row = 0; row < 4; row++) {
        for (let i = 0; i < 6; i++) {
          const x = 38 + i * 6 + (row % 2) * 3, y = 44 + row * 5;
          g.strokeStyle = p.line; g.globalAlpha = 0.4; g.lineWidth = u * 0.8;
          g.beginPath(); g.arc(X(x), Y(y), X(3.2), 0.2, WS.PI - 0.2); g.stroke();
          g.strokeStyle = p.hi; g.globalAlpha = 0.25;
          g.beginPath(); g.arc(X(x), Y(y - 0.8), X(3.2), 0.4, WS.PI - 0.6); g.stroke();
        }
      }
      g.globalAlpha = 1;
      g.restore();
      // the folded wing along the flank
      poly(g, P([[42, 48], [60, 46], [70, 54], [62, 60], [48, 58]]), p.lo, p.line, u * 0.8);
      g.strokeStyle = p.line; g.globalAlpha = 0.5; g.lineWidth = u * 0.7;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(X(48 + i * 4), Y(50)); g.lineTo(X(56 + i * 4), Y(58.6 - i * 0.6)); g.stroke(); }
      g.globalAlpha = 1;
      leg(46, 42, 72, 44, p);
      // the neck, long and curved, and a crest down it
      g.save(); g.lineCap = 'round';
      g.strokeStyle = p.line; g.lineWidth = u * 7.4;
      g.beginPath(); g.moveTo(X(42), Y(48)); g.quadraticCurveTo(X(30), Y(34), X(34), Y(20)); g.stroke();
      g.strokeStyle = p.mid; g.lineWidth = u * 6;
      g.beginPath(); g.moveTo(X(42), Y(48)); g.quadraticCurveTo(X(30), Y(34), X(34), Y(20)); g.stroke();
      g.strokeStyle = p.hi; g.lineWidth = u * 1.2; g.globalAlpha = 0.6;
      g.beginPath(); g.moveTo(X(39), Y(46)); g.quadraticCurveTo(X(28.6), Y(34), X(32), Y(22)); g.stroke();
      g.restore();
      for (let i = 0; i < 5; i++) {
        const t = i / 4, bx = 38 - t * 3 + Math.sin(t * 2) * 1, by = 22 + t * 20;
        poly(g, P([[bx, by - 1.6], [bx + 6 - t * 2, by - 3 - t], [bx + 0.6, by + 1.6]]), p.lo, p.line, u * 0.5);
      }
      // the head, the hooked beak, the eye
      shaded(g, X(33), Y(18), X(6.6), X(5.8), p);
      poly(g, P([[28, 15.6], [16, 17.4], [13.4, 21], [16, 20.6], [28, 21]]), '#e8c878', '#4a3a14', u * 0.7);
      g.strokeStyle = '#4a3a14'; g.lineWidth = u * 0.6;
      g.beginPath(); g.moveTo(X(27.6), Y(19)); g.lineTo(X(17), Y(19.2)); g.stroke();
      poly(g, P([[34, 12.6], [42, 6], [39, 13], [44, 10], [38, 16]]), p.hi, p.line, u * 0.6);   // head plumes
      eyes(g, X(31.4), Y(17), X(0.01), X(1.5), '#ffe9a8');
    },

    vulture(g, s, p) {
      /* THE FLESHRIPPER, on the ground and over something. It was an egg
         with two slabs for wings, facing the camera like the windcaller -
         two birds with one outline. A vulture is known by its SHAPE ON THE
         GROUND: hunched, wings half-raised and mantled over whatever it has
         found, a bare pink head on a thin neck coming out of a white ruff,
         a heavy hooked beak, and grey scaled shanks. So it is side-on, and
         the windcaller is the one in the air. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const skin = palette([0.88, 0.46, 0.44]);
      const shank = palette([0.62, 0.6, 0.58]);
      const CLAW = '#2a2420', CLAW_LINE = '#0e0b09';
      const feathers = (pts, pal, splits) => {
        poly(g, P(pts), pal.lo, pal.line, u * 0.7);
        g.save();
        g.beginPath(); P(pts).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
        g.lineCap = 'round';
        for (const [x0, y0, x1, y1] of splits) {
          g.globalAlpha = 0.55; g.strokeStyle = pal.line; g.lineWidth = u * 0.9;
          g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke();
          g.globalAlpha = 0.3; g.strokeStyle = pal.hi; g.lineWidth = u * 0.6;
          g.beginPath(); g.moveTo(X(x0 + 0.8), Y(y0)); g.lineTo(X(x1 + 0.8), Y(y1)); g.stroke();
        }
        g.restore();
      };
      const talons = (x, y, pal) => {
        for (const [dx, len] of [[-1, 4.4], [0.6, 5.6], [2.2, 3.6]]) {
          limb(g, P([[x + dx + 1, y - 1], [x + dx - len * 0.8, y + 0.6]]), [2.4 * u, 1.8 * u], pal);
          poly(g, P([[x + dx - len * 0.8, y], [x + dx - len * 0.8 - 1.8, y + 1.8], [x + dx - len * 0.8 + 0.4, y + 1.2]]), CLAW, CLAW_LINE, u * 0.3);
        }
      };
      // the far wing, raised and back, fingered at the tip
      feathers([[50, 44], [60, 26], [70, 16], [82, 11], [90, 14], [87.6, 19], [92, 22], [87, 25.6], [91, 30],
        [85, 32], [88, 38], [81, 39], [82, 46], [72, 50], [60, 54]], far,
        [[70, 22, 86, 17], [72, 27, 88, 24], [72, 32, 87, 30], [70, 37, 85, 36], [68, 42, 80, 43]]);
      // the tail, a short dark wedge
      poly(g, P([[70, 58], [86, 68], [84, 71.4], [80, 70.6], [78, 73], [68, 66]]), p.dark, p.line, u * 0.6);
      // the far leg
      limb(g, P([[62, 64], [62.6, 76], [61.6, 85.4]]), [5.4, 3.2, 3].map(X), { hi: shank.mid, mid: shank.lo, lo: shank.dark, dark: shank.dark, line: shank.line });
      talons(61.6, 86.2, shank);
      // the body: hunched, round-shouldered, over its own feet
      const body = mass(g, P([[41, 50], [46, 43], [56, 40.6], [66, 44], [73, 51], [75, 59], [71, 66.4],
        [62, 70], [52, 69], [45, 64], [41.4, 57]]), p);
      g.save(); body(); g.clip();
      pelt(g, p, X(58), Y(56), X(18), X(15), -0.3, 6, 0.3, 0.4);
      g.restore();
      // the near leg: feathered trousers, then a bare scaled shank
      limb(g, P([[55, 66], [54.4, 77], [53, 86]]), [5.6, 3.4, 3.2].map(X), shank);
      g.save();
      g.strokeStyle = shank.line; g.globalAlpha = 0.4; g.lineWidth = u * 0.5;
      for (let i = 0; i < 4; i++) { const y = 76 + i * 2.4; g.beginPath(); g.moveTo(X(52.4), Y(y)); g.lineTo(X(56), Y(y + 0.6)); g.stroke(); }
      g.restore();
      poly(g, P([[50.6, 62], [60, 62], [60.4, 70], [57.4, 72.6], [55, 70.4], [52.4, 73], [50, 69]]), p.lo, p.line, u * 0.6);
      talons(53, 86.8, shank);
      // the near wing, half-open over the back, coverts in rows, fingers at the end
      feathers([[46, 46], [54, 34], [62, 28], [72, 29], [82, 33], [89, 38], [84.6, 40], [89.4, 44],
        [83, 45.6], [86.6, 50], [79.6, 51], [81, 56], [72, 60], [60, 62], [49, 58]], p,
        [[70, 40, 86, 40], [70, 45, 85, 47], [68, 50, 80, 53], [64, 54, 76, 58]]);
      g.save();
      g.beginPath(); g.moveTo(X(46), Y(46)); g.lineTo(X(54), Y(34)); g.lineTo(X(62), Y(28)); g.lineTo(X(72), Y(29));
      g.lineTo(X(70), Y(56)); g.lineTo(X(49), Y(58)); g.closePath(); g.clip();
      g.strokeStyle = p.line; g.lineWidth = u * 0.8; g.globalAlpha = 0.45;
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 5; i++) {
          const x = 52 + i * 4.2 + r * 1.6, y = 38 + r * 6 + i * 0.4;
          g.beginPath(); g.arc(X(x), Y(y), X(2.6), 0.1, WS.PI - 0.1); g.stroke();
        }
      }
      g.restore();
      // the ruff: a collar of white down where the bare neck comes out
      const ruff = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * WS.TAU, r = i % 2 ? 5.2 : 7;
        ruff.push([43.4 + Math.cos(a) * r, 45.4 + Math.sin(a) * r * 0.78]);
      }
      poly(g, P(ruff), '#efe9dd', '#6e685e', u * 0.5);
      g.save();
      g.strokeStyle = 'rgba(110,104,94,.5)'; g.lineWidth = u * 0.5; g.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * WS.TAU + 0.2;
        g.beginPath(); g.moveTo(X(43.4 + Math.cos(a) * 2), Y(45.4 + Math.sin(a) * 1.6));
        g.lineTo(X(43.4 + Math.cos(a) * 5), Y(45.4 + Math.sin(a) * 3.9)); g.stroke();
      }
      g.restore();
      // the neck: bare, thin, and bent down toward whatever it has found
      limb(g, P([[43, 44], [38, 36], [33.6, 30.6], [30, 28]]), [5.4, 4, 3.6, 3.6].map(X), skin);
      // the head, bald and wrinkled
      const head = mass(g, P([[22.6, 25.6], [26.4, 21.6], [32, 21.6], [35.4, 25.4], [34, 30.4], [29, 32.4], [23.6, 31.4]]), skin);
      g.save(); head(); g.clip();
      g.strokeStyle = skin.dark; g.globalAlpha = 0.45; g.lineWidth = u * 0.6;
      for (const [x0, y0, x1, y1] of [[27, 23, 33, 24], [28, 29.6, 33.4, 28.4], [30, 26, 34.4, 26.6]]) {
        g.beginPath(); g.moveTo(X(x0), Y(y0)); g.quadraticCurveTo(X((x0 + x1) / 2), Y(y0 + 1.2), X(x1), Y(y1)); g.stroke();
      }
      g.restore();
      // the beak: heavy, hooked, a fleshy cere at its root
      poly(g, P([[24, 24.6], [15.4, 25.6], [11.4, 28], [11.2, 32], [13.2, 30.6], [15.6, 30.4], [24.2, 30.8]]), '#e2d2a2', '#5e5030', u * 0.6);
      poly(g, P([[11.4, 28], [11.2, 32], [13.2, 30.6], [13.6, 28.4]]), '#3a3226', '#16120c', u * 0.4);
      g.strokeStyle = '#5e5030'; g.lineWidth = u * 0.6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(14), Y(29.2)); g.lineTo(X(23.6), Y(29)); g.stroke();
      poly(g, P([[22, 24], [25.6, 23.6], [25.6, 31], [22, 30.8]]), skin.lo, skin.line, u * 0.4);
      g.fillStyle = '#1a1410';
      g.beginPath(); g.ellipse(X(19.4), Y(27), X(0.9), X(0.55), 0, 0, WS.TAU); g.fill();
      eyes(g, X(27.6), Y(25.6), X(0.01), X(1.3), '#ffd166');
      g.strokeStyle = skin.line; g.lineWidth = u * 0.9;
      g.beginPath(); g.moveTo(X(25.4), Y(24.2)); g.lineTo(X(30), Y(23.6)); g.stroke();
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
      /* A WEREWOLF, in profile, looking the way the rest of the beasts look.
         It was a round furred body with a big oval arm each side and a head
         on top - which is how the mongrel, the bristlekin and the golem were
         drawn too, and measured it shared most of its outline with all
         three. What says "moon-cursed wolf" is the hunch: shoulders higher
         than the head, a head thrust forward on a thick neck with the jaws
         apart, arms long enough to reach the ground, and legs that bend the
         wrong way. Three of the game's bosses wear this body. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const CLAW = '#e9edf5', CLAW_LINE = '#6a7080';
      const claws = (x, y, dir, n, len) => {
        for (let i = 0; i < n; i++) {
          const ox = x + (i - (n - 1) / 2) * 2.2;
          poly(g, P([[ox - 0.9, y], [ox + dir * len * 0.4, y + len], [ox + 0.9, y]]), CLAW, CLAW_LINE, u * 0.5);
        }
      };
      // the tail, low and bushy, behind everything
      poly(g, P([[70, 62], [78, 64], [86, 72], [90, 80], [85, 77], [83, 80], [78, 73], [72, 69]]), p.mid, p.line, u * 0.8);
      g.strokeStyle = p.line; g.globalAlpha = 0.4; g.lineWidth = u * 0.7; g.lineCap = 'round';
      for (const [x0, y0, x1, y1] of [[74, 65, 80, 71], [77, 67, 84, 75], [73, 67, 79, 72]]) {
        g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke();
      }
      g.globalAlpha = 1;
      // far leg and far arm, darker - the side away from the light
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      shaded(g, X(66), Y(72), X(6), X(9), far, -0.4);
      shaded(g, X(68), Y(82), X(3.2), X(6.4), far, 0.35);
      shaded(g, X(64.6), Y(88.6), X(5), X(2), far);
      shaded(g, X(52), Y(58), X(4.8), X(11), far, 0.3);
      shaded(g, X(46.6), Y(76), X(4), X(9), far, 0.1);
      claws(45.6, 84, -1, 3, 3.4);
      // the body: a heavy chest, a waist, haunches
      shaded(g, X(62), Y(66), X(12), X(10), p, 0.3);
      shaded(g, X(52), Y(50), X(20), X(16), p, -0.35);
      pelt(g, p, X(52), Y(50), X(20), X(16), -0.35, 6, 0.4, 0.42);
      pelt(g, p, X(62), Y(66), X(12), X(10), 0.3, 4, 0.5, 0.36);
      // the pale belly fur down the front of the chest
      g.save();
      g.beginPath(); g.ellipse(X(52), Y(50), X(20), X(16), -0.35, 0, WS.TAU); g.clip();
      g.fillStyle = 'rgba(255,248,232,.16)';
      g.beginPath(); g.ellipse(X(40), Y(58), X(8), X(12), -0.5, 0, WS.TAU); g.fill();
      g.restore();
      // near leg: thigh, backward knee, long foot
      shaded(g, X(62), Y(72), X(7), X(9), p, -0.45);
      pelt(g, p, X(62), Y(72), X(7), X(9), -0.45, 3, 0.4, 0.34);
      shaded(g, X(65), Y(81), X(3.4), X(6.6), p, 0.4);
      shaded(g, X(61.4), Y(88.4), X(5.4), X(2.2), p);
      claws(57.6, 88.6, -1, 3, 2.6);
      // the mane: a ridge of hackles from the skull down the hunch
      for (let i = 0; i < 9; i++) {
        const t = i / 8, bx = 33 + t * 32, by = 30 + t * 12 - Math.sin(t * WS.PI) * 6;
        const len = 7 + Math.sin(t * WS.PI) * 6;
        poly(g, P([[bx - 2.4, by + 2], [bx + 2 - len * 0.2, by - len], [bx + 2.4, by + 2]]), i % 2 ? p.mid : p.lo, p.line, u * 0.6);
      }
      // near arm: long, hanging forward, the hand nearly on the ground
      shaded(g, X(40), Y(54), X(6.4), X(12), p, 0.45);
      pelt(g, p, X(40), Y(54), X(6.4), X(12), 0.45, 3, 0.3, 0.3);
      shaded(g, X(33.6), Y(71), X(4.6), X(10), p, 0.15);
      shaded(g, X(31.6), Y(81), X(5), X(3.4), p);
      claws(31, 83.4, -1, 4, 4);
      // the neck and the head, thrust forward and low
      shaded(g, X(36), Y(38), X(9), X(8), p, -0.6);
      shaded(g, X(28), Y(33), X(10), X(9), p);
      pelt(g, p, X(28), Y(33), X(10), X(9), 0, 4, 0.3, 0.3);
      // ears, pinned back
      poly(g, P([[29, 26], [38, 13], [35, 27]]), p.lo, p.line, u * 0.8);
      poly(g, P([[24, 26], [29, 12], [30, 26]]), p.mid, p.line, u * 0.8);
      g.strokeStyle = p.line; g.globalAlpha = 0.4; g.lineWidth = u * 0.8;
      g.beginPath(); g.moveTo(X(27), Y(24)); g.lineTo(X(28.8), Y(16)); g.stroke();
      g.globalAlpha = 1;
      // the muzzle and the jaws, open
      poly(g, P([[22, 29], [8, 32.6], [7.4, 35], [21, 36]]), p.mid, p.line, u * 0.8);   // upper jaw
      poly(g, P([[21, 37.4], [10, 39], [10.6, 41.4], [22, 41]]), p.lo, p.line, u * 0.8); // lower jaw
      g.fillStyle = '#2a0e0e';
      g.beginPath();
      g.moveTo(X(21), Y(36)); g.lineTo(X(8.6), Y(35)); g.lineTo(X(10.4), Y(39)); g.lineTo(X(21.4), Y(37.6));
      g.closePath(); g.fill();
      for (let i = 0; i < 4; i++) {
        const x = 11 + i * 2.6;
        poly(g, P([[x, 35.2], [x + 0.7, 37.6], [x + 1.4, 35.3]]), '#fff', '#8a8a8a', u * 0.3);
        poly(g, P([[x + 0.6, 38.8], [x + 1.2, 36.8], [x + 1.9, 38.7]]), '#fff', '#8a8a8a', u * 0.3);
      }
      g.fillStyle = '#141014';
      g.beginPath(); g.ellipse(X(8.4), Y(32.8), X(1.6), X(1.2), 0, 0, WS.TAU); g.fill();      // the nose
      g.fillStyle = 'rgba(255,255,255,.4)';
      g.beginPath(); g.arc(X(8), Y(32.3), X(0.5), 0, WS.TAU); g.fill();
      // a heavy brow over one burning eye
      eyes(g, X(24.6), Y(30.6), X(0.01), X(1.9), '#ffe14d');
      g.strokeStyle = p.line; g.lineWidth = u * 1.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(20), Y(28.4)); g.lineTo(X(27.4), Y(27.6)); g.stroke();
    },

    shrikewing(g, s, p) {
      /* THE WINDCALLER, in the air. It was an egg with a fan of triangles
         either side. A shrike is known by three things - the black MASK
         through the eye, the hooked beak, and black wings with a white flash
         across them - and a caster of the wind should be seen holding
         itself up on it: wings spread and fingered, the tail fanned, talons
         drawn up, and the air turning round it. Front-on, so the
         fleshripper on the ground and this one in the sky do not share a
         silhouette. The wing tips stay below the crown of the head, where
         the Windmatron's hat and crown are hung. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const wing = { hi: p.lo, mid: p.dark, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const WHITE = '#f3f6fa', WHITE_LINE = '#5a6470';
      // the wind, behind everything: two currents curling up round it
      g.save();
      g.lineCap = 'round'; g.strokeStyle = p.glow;
      for (const [dir, al] of [[-1, 0.45], [1, 0.35]]) {
        g.globalAlpha = al; g.lineWidth = u * 1.6;
        g.beginPath();
        g.moveTo(X(50 + dir * 8), Y(86));
        g.bezierCurveTo(X(50 + dir * 30), Y(84), X(50 + dir * 32), Y(66), X(50 + dir * 20), Y(60));
        g.stroke();
        g.globalAlpha = al * 0.6; g.lineWidth = u;
        g.beginPath();
        g.moveTo(X(50 + dir * 14), Y(80));
        g.quadraticCurveTo(X(50 + dir * 25), Y(74), X(50 + dir * 22), Y(66));
        g.stroke();
      }
      g.restore();
      // the tail, fanned: black feathers edged white
      for (let i = -2; i <= 2; i++) {
        const a = WS.PI / 2 + i * 0.2, len = 22 - Math.abs(i) * 2;
        const x0 = 50 + i * 1.2, y0 = 64;
        const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
        const nx = -Math.sin(a) * 2.4, ny = Math.cos(a) * 2.4;
        poly(g, P([[x0 - nx * 0.6, y0 - ny * 0.6], [x1 - nx, y1 - ny], [x1, y1 + 1.2], [x1 + nx, y1 + ny], [x0 + nx * 0.6, y0 + ny * 0.6]]),
          Math.abs(i) === 2 ? WHITE : p.dark, Math.abs(i) === 2 ? WHITE_LINE : p.line, u * 0.5);
      }
      // the wings: coverts at the arm, primaries fingered out past the wrist
      for (const dir of [-1, 1]) {
        const wx = 50 + dir * 25, wy = 38;
        for (let k = 5; k >= 0; k--) {
          const a = (dir < 0 ? WS.PI : 0) + dir * (-0.42 + k * 0.2);
          const len = 21 - k * 1.6;
          const x1 = wx + Math.cos(a) * len, y1 = wy + Math.sin(a) * len;
          const nx = -Math.sin(a) * 2.6, ny = Math.cos(a) * 2.6;
          poly(g, P([[wx - nx, wy - ny], [x1 - nx * 0.7, y1 - ny * 0.7], [x1 + Math.cos(a) * 1.6, y1 + Math.sin(a) * 1.6],
            [x1 + nx * 0.7, y1 + ny * 0.7], [wx + nx, wy + ny]]), k % 2 ? p.dark : wing.hi, p.line, u * 0.5);
        }
        // the white flash across the primaries' roots
        poly(g, P([[wx + dir * 3, wy - 4.6], [wx + dir * 6.4, wy - 5.4], [wx + dir * 7.4, wy + 4.2], [wx + dir * 4, wy + 5]]), '#e8edf3', WHITE_LINE, u * 0.5);
        // the arm of the wing, and its coverts
        const arm = [[50 + dir * 7, 44], [50 + dir * 16, 34.6], [wx + dir * 2, 32.6], [wx + dir * 3, 40], [50 + dir * 16, 48], [50 + dir * 8, 54]];
        poly(g, P(arm), p.mid, p.line, u * 0.6);
        g.save();
        g.beginPath(); P(arm).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
        g.strokeStyle = p.line; g.globalAlpha = 0.45; g.lineWidth = u * 0.7;
        for (let r = 0; r < 3; r++) {
          for (let i = 0; i < 4; i++) {
            const x = 50 + dir * (10 + i * 4.6 + r * 1.4), y = 38 + r * 4.4 + i * 0.4;
            g.beginPath(); g.arc(X(x), Y(y), X(2.2), 0.15, WS.PI - 0.15); g.stroke();
          }
        }
        g.restore();
      }
      // the talons, drawn up under it
      for (const dir of [-1, 1]) {
        limb(g, P([[50 + dir * 4, 62], [50 + dir * 5, 70], [50 + dir * 3.6, 74]]), [3.6, 2.4, 2.2].map(X), palette([0.86, 0.76, 0.52]));
        for (let i = -1; i <= 1; i++) {
          poly(g, P([[50 + dir * 3.6 + i * 1.4, 74], [50 + dir * 3.6 + i * 1.8, 77.4], [50 + dir * 3.6 + i * 1.4 + 0.8, 74.4]]), '#1e1a16', '#0a0806', u * 0.3);
        }
      }
      // the body: a pale breast under a grey back
      const body = mass(g, P([[50, 39], [57.4, 42.4], [61, 51], [59, 60.6], [54, 66.6], [50, 67.6], [46, 66.6],
        [41, 60.6], [39, 51], [42.6, 42.4]]), p);
      g.save(); body(); g.clip();
      g.fillStyle = 'rgba(248,250,252,.5)';
      g.beginPath(); g.ellipse(X(50), Y(58), X(7.4), X(10), 0, 0, WS.TAU); g.fill();
      g.strokeStyle = p.lo; g.globalAlpha = 0.4; g.lineWidth = u * 0.6;
      for (let r = 0; r < 4; r++) {
        for (let i = -1; i <= 1; i++) {
          g.beginPath(); g.arc(X(50 + i * 3.4 + (r % 2) * 1.7), Y(50 + r * 3.8), X(1.8), 0.2, WS.PI - 0.2); g.stroke();
        }
      }
      g.restore();
      // the head
      const head = mass(g, P([[50, 22.4], [56.6, 24.6], [59.6, 31], [57.4, 37.4], [50, 40], [42.6, 37.4], [40.4, 31], [43.4, 24.6]]), p);
      // a small crest
      poly(g, P([[47, 24], [48.6, 17.6], [50.4, 22], [52.4, 17], [53.4, 24]]), p.mid, p.line, u * 0.5);
      // the MASK: a black band through both eyes, swept back at the ends
      poly(g, P([[39.6, 29.4], [45, 28.6], [50, 30.2], [55, 28.6], [60.4, 29.4], [59, 33.4], [54, 34], [50, 33.4], [46, 34], [41, 33.4]]),
        '#14161c', '#050608', u * 0.5);
      g.save(); head(); g.clip();
      g.fillStyle = 'rgba(250,252,255,.4)';
      g.beginPath(); g.ellipse(X(50), Y(38), X(5.4), X(2.6), 0, 0, WS.TAU); g.fill();
      g.restore();
      eyes(g, X(50), Y(31.2), X(4.4), X(1.4), '#d9f4ff');
      // the beak: short, black, hooked at the tip
      poly(g, P([[47.4, 33.4], [52.6, 33.4], [51.4, 38], [50, 40.4], [48.8, 38.6]]), '#23252c', '#08090b', u * 0.5);
      poly(g, P([[49.4, 38.6], [50, 40.4], [50.8, 38.4]]), '#3e424c', '#08090b', u * 0.3);
    },

    /* ---------------------------------------------------- Highmoor ---- */
    ram(g, s, p) {
      /* THE STORMHORN RAM. A heavy fleece on thin dark legs and a head
         carried low - and the horns, curled right round once, with the storm
         in them: a cold light along the ridges. The curl is the whole
         silhouette; everything else on the moor is a straight line. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const shin = { hi: '#5a524a', mid: '#3a342e', lo: '#2a2622', dark: '#1a1714', line: '#0c0a08', glow: '#fff' };
      const farShin = { hi: '#3a342e', mid: '#2a2622', lo: '#1a1714', dark: '#100e0c', line: '#0c0a08', glow: '#fff' };
      for (const x of [46, 72]) {
        limb(g, P([[x, 60], [x + 1, 72], [x, 84]]), [6, 3.6, 3].map(X), farShin);
        shaded(g, X(x), Y(85), X(2.8), X(1.6), farShin);
      }
      const body = mass(g, P([[32, 46], [36, 38], [46, 33], [58, 32], [70, 34], [80, 39], [85, 48], [82, 58],
        [74, 64], [60, 66], [46, 65], [36, 61], [30, 54]]), p);
      g.save(); body(); g.clip();
      // the fleece: rows of curls
      g.strokeStyle = p.lo; g.lineWidth = u * 1.1; g.globalAlpha = 0.55;
      for (let r = 0; r < 6; r++) {
        for (let i = 0; i < 9; i++) {
          const cx = 34 + i * 6 + (r % 2) * 3, cy = 36 + r * 5.4;
          g.beginPath(); g.arc(X(cx), Y(cy), X(2.6), 0.3, WS.PI + 0.9); g.stroke();
        }
      }
      g.globalAlpha = 1;
      const lit = g.createLinearGradient(0, Y(32), 0, Y(66));
      lit.addColorStop(0, 'rgba(255,255,255,.16)'); lit.addColorStop(1, 'rgba(0,0,0,.22)');
      g.fillStyle = lit; g.fillRect(0, Y(30), s, Y(40));
      g.restore();
      for (const x of [40, 66]) {
        limb(g, P([[x, 60], [x - 1, 72], [x, 84]]), [7, 4, 3.2].map(X), shin);
        shaded(g, X(x), Y(85.2), X(3), X(1.8), shin);
      }
      // the head, low and long, darker than the fleece
      const face = { hi: '#8a8076', mid: '#6a6058', lo: '#4a423c', dark: '#2e2824', line: '#14100e', glow: '#fff' };
      mass(g, P([[16, 46], [20, 36], [28, 32], [35, 36], [36, 46], [30, 56], [20, 58], [13, 53]]), face);
      // wool cap between the horns
      mass(g, P([[24, 34], [29, 28], [36, 30], [37, 37], [30, 38]]), p);
      // the horn: a thick band curled round once, ridged, and lit by the storm
      const HORN = { hi: '#e8e0cc', mid: '#c4b898', lo: '#8c806a', dark: '#5a5040', line: '#2a2418', glow: '#fff' };
      const cx = 35, cy = 41, pts = [], ws = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, a = -2.5 + t * 5.6, r = 14.5 - t * 8.5;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.95]);
        ws.push(9.6 - t * 6.8);
      }
      limb(g, P(pts), ws.map(X), HORN);
      g.strokeStyle = HORN.line; g.globalAlpha = 0.55; g.lineWidth = u * 0.7;
      for (let i = 1; i < 14; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        const nx = -(y1 - y0), ny = x1 - x0, d = Math.hypot(nx, ny) || 1, w = ws[i] * 0.5;
        g.beginPath(); g.moveTo(X(x0 + nx / d * w), Y(y0 + ny / d * w)); g.lineTo(X(x0 - nx / d * w), Y(y0 - ny / d * w)); g.stroke();
      }
      g.globalAlpha = 1;
      // the storm in it
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(160,200,255,.85)'; g.lineWidth = u * 1.1; g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < 9; i++) {
        const [x, y] = pts[i];
        const j = (i % 2 ? 1.6 : -1.6);
        if (i) g.lineTo(X(x + j * 0.4), Y(y - ws[i] * 0.3 + j * 0.3)); else g.moveTo(X(x), Y(y - ws[i] * 0.3));
      }
      g.stroke();
      g.restore();
      // muzzle and eye
      g.fillStyle = '#1a1512';
      g.beginPath(); g.ellipse(X(15.4), Y(52), X(1.2), X(0.9), 0.3, 0, WS.TAU); g.fill();
      g.strokeStyle = '#1a1512'; g.lineWidth = u * 0.8;
      g.beginPath(); g.moveTo(X(15), Y(55.6)); g.quadraticCurveTo(X(19), Y(57), X(22), Y(55)); g.stroke();
      eyes(g, X(22), Y(42.6), X(0.01), X(1.5), '#ffd96a');
      g.strokeStyle = '#14100e'; g.lineWidth = u * 0.9;
      g.beginPath(); g.moveTo(X(19.4), Y(40.4)); g.lineTo(X(24.6), Y(41.2)); g.stroke();
    },

    galewing(g, s, p) {
      /* THE GALEWING HARPY. Front-on like the windcaller, so the two share a
         sky and not a shape: the windcaller is a bird, and this is a woman
         from the waist up with wings where her arms should be, talons below,
         and hair that is mostly feathers blown straight up by the wind she
         rides. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const skin = { hi: '#e8d4c4', mid: '#c8ab98', lo: '#8e7262', dark: '#5a463a', line: '#2c1e18', glow: '#fff' };
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      // wings: three ranks of long feathers from shoulder to tip, swept up
      for (const dir of [-1, 1]) {
        for (let k = 6; k >= 0; k--) {
          const a = (dir < 0 ? WS.PI : 0) + dir * (-0.75 + k * 0.2);
          const len = 30 - k * 2.2, wx = 50 + dir * 10, wy = 38;
          const x1 = wx + Math.cos(a) * len, y1 = wy + Math.sin(a) * len;
          const nx = -Math.sin(a) * 3, ny = Math.cos(a) * 3;
          poly(g, P([[wx - nx, wy - ny], [x1 - nx * 0.6, y1 - ny * 0.6], [x1 + Math.cos(a) * 2, y1 + Math.sin(a) * 2],
            [x1 + nx * 0.6, y1 + ny * 0.6], [wx + nx, wy + ny]]), k % 2 ? far.hi : p.hi, p.line, u * 0.5);
        }
        mass(g, P([[50 + dir * 6, 36], [50 + dir * 18, 30], [50 + dir * 26, 33], [50 + dir * 20, 42], [50 + dir * 9, 46]]), p);
      }
      // legs: feathered thighs into scaled shins and talons
      for (const dir of [-1, 1]) {
        mass(g, P([[50 + dir * 2, 60], [50 + dir * 9, 62], [50 + dir * 9, 72], [50 + dir * 4, 74]]), p);
        limb(g, P([[50 + dir * 6.5, 72], [50 + dir * 7, 80], [50 + dir * 6, 86]]), [3.4, 2.4, 2].map(X), palette([0.8, 0.66, 0.4]));
        for (let i = -1; i <= 1; i++) {
          poly(g, P([[50 + dir * 6 + i * 1.6, 86], [50 + dir * 6 + i * 2.4, 90], [50 + dir * 6 + i * 1.6 + 0.9, 86.4]]), '#1a1612', '#080604', u * 0.3);
        }
      }
      // the torso: bare shoulders, a feathered front from the chest down
      mass(g, P([[43, 38], [50, 35], [57, 38], [58, 50], [56, 62], [50, 64], [44, 62], [42, 50]]), skin);
      const front = mass(g, P([[43.5, 46], [50, 44], [56.5, 46], [57, 56], [55, 63], [50, 65], [45, 63], [43, 56]]), p);
      g.save(); front(); g.clip();
      g.strokeStyle = p.line; g.globalAlpha = 0.4; g.lineWidth = u * 0.6;
      for (let r = 0; r < 5; r++) for (let i = -2; i <= 2; i++) {
        g.beginPath(); g.arc(X(50 + i * 3 + (r % 2) * 1.5), Y(48 + r * 3.6), X(1.7), 0.2, WS.PI - 0.2); g.stroke();
      }
      g.restore();
      // hair: feathers blown straight up and back
      for (let i = -3; i <= 3; i++) {
        const a = -WS.PI / 2 + i * 0.22, len = 16 - Math.abs(i) * 1.6;
        const x0 = 50 + i * 1.8, y0 = 22;
        poly(g, P([[x0 - 1.6, y0 + 2], [x0 + Math.cos(a) * len, y0 + Math.sin(a) * len], [x0 + 1.6, y0 + 2]]),
          i % 2 ? p.mid : p.lo, p.line, u * 0.4);
      }
      // the head
      mass(g, P([[50, 18], [55.6, 21], [57, 27.6], [54.4, 33.4], [50, 35], [45.6, 33.4], [43, 27.6], [44.4, 21]]), skin);
      poly(g, P([[43, 22], [50, 17], [57, 22], [57.6, 27], [55, 23.4], [50, 22], [45, 23.4], [42.4, 27]]), p.lo, p.line, u * 0.5);
      eyes(g, X(50), Y(27.6), X(3.4), X(1.3), '#e8ff9a');
      g.strokeStyle = '#2c1e18'; g.lineWidth = u * 0.7;
      g.beginPath(); g.moveTo(X(47.6), Y(31.6)); g.quadraticCurveTo(X(50), Y(32.8), X(52.4), Y(31.6)); g.stroke();
    },

    stonehide(g, s, p) {
      /* THE STONEHIDE. A boulder that walks: a hunched granite back in
         plates, moss grown over the top of it, short pillar legs, and a
         small low head with two stubby horns and eyes like banked coals. It
         is the widest thing on the moor and the lowest. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      for (const x of [40, 74]) {
        limb(g, P([[x, 64], [x, 74], [x + 1, 84]]), [11, 10, 10].map(X), far);
        shaded(g, X(x + 1), Y(85), X(6), X(2.2), far);
      }
      const body = mass(g, P([[22, 58], [26, 42], [38, 30], [56, 26], [74, 30], [86, 42], [90, 56], [84, 68],
        [66, 72], [42, 72], [28, 68]]), p);
      g.save(); body(); g.clip();
      // the plates: facets of stone with dark seams between them
      const plates = [
        [[26, 44], [38, 32], [46, 42], [36, 54]], [[38, 32], [56, 27], [58, 40], [46, 42]],
        [[56, 27], [74, 31], [70, 44], [58, 40]], [[74, 31], [86, 43], [80, 52], [70, 44]],
        [[36, 54], [46, 42], [58, 40], [56, 56], [42, 62]], [[58, 40], [70, 44], [80, 52], [72, 62], [56, 56]],
        [[80, 52], [90, 56], [84, 68], [72, 62]], [[24, 58], [36, 54], [42, 62], [30, 68]],
      ];
      plates.forEach((pl, i) => {
        poly(g, P(pl), i % 3 === 0 ? p.hi : i % 3 === 1 ? p.mid : p.lo, p.dark, u * 1.2);
      });
      // moss over the top
      g.fillStyle = '#4f6b2c';
      g.beginPath();
      g.moveTo(X(28), Y(42));
      for (let i = 0; i <= 14; i++) {
        const x = 28 + i * 4.2, y = 34 - Math.sin((i / 14) * WS.PI) * 8 + (i % 2 ? 2.4 : 0);
        g.lineTo(X(x), Y(y + 6));
      }
      g.lineTo(X(86), Y(40)); g.lineTo(X(84), Y(26)); g.lineTo(X(26), Y(26)); g.closePath();
      g.globalAlpha = 0.85; g.fill();
      g.fillStyle = '#7e9c48'; g.globalAlpha = 0.6;
      for (let i = 0; i < 16; i++) {
        g.beginPath(); g.arc(X(32 + i * 3.4), Y(31 + Math.sin(i * 1.7) * 3), X(1.4), 0, WS.TAU); g.fill();
      }
      g.restore();
      for (const x of [34, 66]) {
        limb(g, P([[x, 64], [x, 74], [x - 1, 84]]), [12, 11, 11].map(X), p);
        shaded(g, X(x - 1), Y(85.2), X(6.4), X(2.4), p);
        for (let i = -1; i <= 1; i++) poly(g, P([[x - 1 + i * 3.4 - 1.2, 85], [x - 1 + i * 3.4, 87.6], [x - 1 + i * 3.4 + 1.2, 85]]), '#d8d0bd', '#3d392f', u * 0.4);
      }
      // the head, low at the front of the boulder
      const head = mass(g, P([[10, 56], [14, 48], [24, 46], [30, 52], [28, 62], [18, 66], [10, 63]]), p);
      g.save(); head(); g.clip();
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(X(8), Y(58), X(24), X(10));
      g.restore();
      for (const [x, y] of [[16, 48], [24, 47]]) {
        poly(g, P([[x - 2.4, y + 1], [x - 0.6, y - 5], [x + 2.2, y + 1]]), '#d8d0bd', '#3d392f', u * 0.5);
      }
      eyes(g, X(18), Y(54.6), X(3.2), X(1.3), '#ffae4a');
      g.strokeStyle = p.line; g.lineWidth = u;
      g.beginPath(); g.moveTo(X(11), Y(61)); g.lineTo(X(20), Y(62.4)); g.stroke();
    },

    wisp(g, s, p) {
      /* A STORMWISP: a knot of the storm with a face in it. A bright core,
         a ragged corona, a tail of spent light behind it, and forks of
         lightning breaking off the edge. It has no feet, so it has no
         shadow on the ground worth drawing. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const halo = g.createRadialGradient(X(46), Y(50), 0, X(46), Y(50), X(34));
      halo.addColorStop(0, 'rgba(210,230,255,.85)');
      halo.addColorStop(0.4, p.glow + '99');
      halo.addColorStop(1, 'rgba(90,130,255,0)');
      g.fillStyle = halo;
      g.beginPath(); g.arc(X(46), Y(50), X(34), 0, WS.TAU); g.fill();
      // the tail, streaming right (it faces left)
      g.fillStyle = 'rgba(150,190,255,.35)';
      g.beginPath();
      g.moveTo(X(52), Y(40)); g.quadraticCurveTo(X(78), Y(44), X(90), Y(58));
      g.quadraticCurveTo(X(76), Y(56), X(54), Y(62)); g.closePath(); g.fill();
      g.restore();
      // the core
      const core = g.createRadialGradient(X(44), Y(47), X(2), X(46), Y(50), X(17));
      core.addColorStop(0, '#ffffff'); core.addColorStop(0.5, p.hi); core.addColorStop(1, p.lo);
      g.fillStyle = core;
      g.beginPath();
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * WS.TAU, r = 17 + (i % 2 ? 2.4 : -1.2);
        const x = 46 + Math.cos(a) * r, y = 50 + Math.sin(a) * r;
        if (i) g.lineTo(X(x), Y(y)); else g.moveTo(X(x), Y(y));
      }
      g.closePath(); g.fill();
      g.strokeStyle = p.line; g.lineWidth = u * 0.8; g.stroke();
      // forks
      g.strokeStyle = '#eaf2ff'; g.lineWidth = u * 1.2; g.lineCap = 'round';
      for (const [a, len] of [[-2.4, 16], [-0.6, 14], [1.9, 13], [3.0, 11]]) {
        let x = 46 + Math.cos(a) * 17, y = 50 + Math.sin(a) * 17;
        g.beginPath(); g.moveTo(X(x), Y(y));
        for (let k = 0; k < 3; k++) {
          x += Math.cos(a + (k % 2 ? 0.6 : -0.6)) * len / 3; y += Math.sin(a + (k % 2 ? 0.6 : -0.6)) * len / 3;
          g.lineTo(X(x), Y(y));
        }
        g.stroke();
      }
      // a face: two hollow eyes and a mouth, dark in the light
      g.fillStyle = 'rgba(20,30,70,.85)';
      for (const dx of [-4.6, 3.4]) { g.beginPath(); g.ellipse(X(44 + dx), Y(47), X(2), X(2.8), 0, 0, WS.TAU); g.fill(); }
      g.beginPath(); g.ellipse(X(43.4), Y(55), X(3.4), X(1.6), 0, 0, WS.TAU); g.fill();
    },

    kael(g, s, p) {
      /* BROTHER KAEL, THE STORMBOUND. A monk of the Quiet Ascent, like the
         abbot - bald, robed, barefoot once - off the ground now, arms held
         out and down, the storm he was holding pouring out of both palms.
         Iron cuffs on the wrists with the chains snapped off short: he was
         bound to the stones and something broke. His tattoos are the only
         lit thing on him that is not lightning. The robe ends in rags where
         feet should be, because he has not stood on anything for a while. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const robe = { hi: '#8a90a8', mid: '#5e647c', lo: '#3c4054', dark: '#24273a', line: '#101220', glow: '#fff' };
      const skin = { hi: '#e2c8b0', mid: '#bf9f86', lo: '#8a6c58', dark: '#5a4436', line: '#2a1e16', glow: '#fff' };
      const IRON = { hi: '#9aa0ac', mid: '#6a707c', lo: '#434852', dark: '#262a32', line: '#101216', glow: '#fff' };
      // the storm behind him
      g.save();
      g.globalCompositeOperation = 'lighter';
      const halo = g.createRadialGradient(X(50), Y(48), 0, X(50), Y(48), X(46));
      halo.addColorStop(0, 'rgba(150,175,255,.4)'); halo.addColorStop(1, 'rgba(90,110,255,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(X(50), Y(48), X(46), 0, WS.TAU); g.fill();
      g.restore();
      // the robe: shoulders to rags, and the rags lift
      const body = mass(g, P([[40, 34], [50, 31], [60, 34], [64, 50], [68, 70], [66, 80], [60, 76], [56, 84],
        [50, 78], [44, 85], [40, 77], [34, 81], [32, 70], [36, 50]]), robe);
      g.save(); body(); g.clip();
      g.fillStyle = 'rgba(0,0,0,.25)';
      for (const x of [42, 50, 58]) {
        g.beginPath(); g.moveTo(X(x), Y(40)); g.lineTo(X(x - 3), Y(86)); g.lineTo(X(x + 1), Y(86)); g.closePath(); g.fill();
      }
      g.fillStyle = p.mid;
      g.fillRect(X(36), Y(52), X(30), X(4));
      g.restore();
      // the arms, out and down, and the cuffs with their broken chains
      for (const dir of [-1, 1]) {
        limb(g, P([[50 + dir * 9, 36], [50 + dir * 17, 46], [50 + dir * 25, 54]]), [6.4, 5.2, 4.4].map(X), robe);
        limb(g, P([[50 + dir * 24, 53], [50 + dir * 29, 57]]), [3.8, 3.4].map(X), skin);
        shaded(g, X(50 + dir * 30), Y(58), X(2.8), X(3.2), skin);
        poly(g, P([[50 + dir * 22.4, 50.6], [50 + dir * 26.4, 52.6], [50 + dir * 25, 56.4], [50 + dir * 21, 54.4]]), IRON.mid, IRON.line, u * 0.5);
        g.strokeStyle = IRON.lo; g.lineWidth = u * 1.1;
        for (let k = 0; k < 3; k++) {
          g.beginPath(); g.ellipse(X(50 + dir * (24 + k * 1.6)), Y(58 + k * 2.4), X(1), X(1.4), dir * 0.5, 0, WS.TAU); g.stroke();
        }
        // lightning out of the palm
        g.save(); g.globalCompositeOperation = 'lighter';
        g.strokeStyle = 'rgba(200,215,255,.95)'; g.lineWidth = u * 1.3; g.lineCap = 'round';
        let x = 50 + dir * 30, y = 59;
        g.beginPath(); g.moveTo(X(x), Y(y));
        for (let k = 0; k < 5; k++) { x += dir * (2 + (k % 2) * 1.5); y += 3 + (k % 2 ? -1.6 : 1.4); g.lineTo(X(x), Y(y)); }
        g.stroke();
        g.restore();
      }
      // the head: bald, a short dark beard, and the storm in his tattoos
      const head = mass(g, P([[50, 14], [56.4, 17], [58, 24], [56.6, 30.6], [50, 34], [43.4, 30.6], [42, 24], [43.6, 17]]), skin);
      mass(g, P([[44.4, 28], [50, 30], [55.6, 28], [54.6, 33], [50, 36.4], [45.4, 33]]), { hi: '#4a3a30', mid: '#34281f', lo: '#241a14', dark: '#160f0b', line: '#0a0604', glow: '#fff' });
      g.save(); head(); g.clip();
      const sheen = g.createRadialGradient(X(47), Y(16), 0, X(47), Y(16), X(7));
      sheen.addColorStop(0, 'rgba(255,240,225,.5)'); sheen.addColorStop(1, 'rgba(255,240,225,0)');
      g.fillStyle = sheen; g.fillRect(X(40), Y(10), X(20), X(12));
      g.restore();
      g.save(); g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(150,185,255,.9)'; g.lineWidth = u * 0.8;
      g.beginPath(); g.moveTo(X(50), Y(15)); g.lineTo(X(49), Y(18)); g.lineTo(X(51), Y(20)); g.lineTo(X(50), Y(22.4)); g.stroke();
      for (const dir of [-1, 1]) {
        g.beginPath(); g.moveTo(X(50 + dir * 5), Y(17)); g.lineTo(X(50 + dir * 7), Y(20)); g.lineTo(X(50 + dir * 6), Y(23)); g.stroke();
      }
      g.restore();
      eyes(g, X(50), Y(25), X(3.2), X(1.3), '#dbe6ff');
    },

    calf(g, s, p) {
      /* One of the Lost Calves. Big head, long legs it has not grown into,
         patched hide, and a bell. Faces left; the renderer turns it with
         the way it is wandering. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const HOOF = '#2a2420';
      // legs: far pair, then body, then near pair
      for (const x of [44, 70]) {
        limb(g, P([[x, 60], [x + 1, 72], [x, 84]]), [5.6, 3.8, 3.2].map(X), far);
        shaded(g, X(x), Y(85), X(2.8), X(1.8), { hi: HOOF, mid: HOOF, lo: HOOF, dark: HOOF, line: HOOF, glow: HOOF });
      }
      const body = mass(g, P([[36, 50], [46, 42], [66, 41], [79, 46], [80, 58], [72, 66], [48, 67], [38, 62]]), p);
      g.save(); body(); g.clip();
      g.fillStyle = 'rgba(30,24,22,.88)';
      g.beginPath(); g.ellipse(X(62), Y(47), X(8), X(6), 0.3, 0, WS.TAU); g.fill();
      g.beginPath(); g.ellipse(X(74), Y(60), X(6), X(5), -0.2, 0, WS.TAU); g.fill();
      g.beginPath(); g.ellipse(X(47), Y(62), X(4), X(3), 0, 0, WS.TAU); g.fill();
      g.fillStyle = 'rgba(255,245,230,.18)';
      g.beginPath(); g.ellipse(X(56), Y(63), X(14), X(4), 0, 0, WS.TAU); g.fill();
      g.restore();
      // tail
      g.strokeStyle = p.lo; g.lineWidth = X(1.6); g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(79), Y(48)); g.quadraticCurveTo(X(86), Y(52), X(84), Y(62)); g.stroke();
      g.fillStyle = '#2a2420';
      g.beginPath(); g.ellipse(X(84), Y(63), X(1.6), X(2.4), 0, 0, WS.TAU); g.fill();
      for (const x of [40, 66]) {
        limb(g, P([[x, 60], [x - 1, 72], [x, 84]]), [6, 4.2, 3.4].map(X), p);
        shaded(g, X(x), Y(85.2), X(3), X(1.9), { hi: '#4a4038', mid: HOOF, lo: HOOF, dark: HOOF, line: HOOF, glow: HOOF });
      }
      // head, big for the body, and ears out sideways
      mass(g, P([[36, 34], [40, 38], [38, 42], [33, 40]]), far);                 // far ear
      const head = mass(g, P([[20, 36], [24, 26], [34, 24], [40, 30], [40, 42], [32, 52], [22, 53], [16, 48]]), p);
      g.save(); head(); g.clip();
      g.fillStyle = 'rgba(30,24,22,.88)';
      g.beginPath(); g.ellipse(X(32), Y(30), X(7), X(6), 0.4, 0, WS.TAU); g.fill();
      g.restore();
      mass(g, P([[16, 44], [14, 50], [19, 54], [28, 54], [29, 47]]),
        { hi: '#f4c8c0', mid: '#e0a8a0', lo: '#b87c76', dark: '#8a5650', line: '#4a2a26', glow: '#fff' });
      g.fillStyle = '#4a2a26';
      g.beginPath(); g.ellipse(X(17.5), Y(49), X(1.1), X(1.4), 0, 0, WS.TAU); g.fill();
      mass(g, P([[36, 30], [46, 28], [48, 33], [40, 34]]), p);                   // near ear
      g.fillStyle = 'rgba(220,150,150,.6)';
      g.beginPath(); g.ellipse(X(43), Y(31), X(3), X(1.3), -0.1, 0, WS.TAU); g.fill();
      // horn nubs
      for (const x of [27, 33]) shaded(g, X(x), Y(24.5), X(1.8), X(1.5), { hi: '#f0e6d0', mid: '#d8ccb0', lo: '#a89878', dark: '#786848', line: '#403420', glow: '#fff' });
      eyes(g, X(27), Y(37), X(0.01), X(1.9), '#2a1a14');
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.beginPath(); g.arc(X(26.4), Y(36.2), X(0.6), 0, WS.TAU); g.fill();
      // the bell collar
      g.strokeStyle = '#6a3a22'; g.lineWidth = X(2.2);
      g.beginPath(); g.moveTo(X(34), Y(50)); g.quadraticCurveTo(X(38), Y(46), X(41), Y(40)); g.stroke();
      poly(g, P([[33.5, 51], [37.5, 51], [38.6, 57], [32.4, 57]]), '#d8a840', '#5a3e10', u * 0.6);
    },

    bearform(g, s, p) {
      /* THE BEAR, as a survivor wears it: reared up on its hind legs, one
         forepaw raised to swing, head low and forward. Upright on purpose -
         every creature that comes at you walks on four, and the one on your
         side should not be mistaken for any of them. Faces left like every
         creature; the renderer turns it with the survivor. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const CLAW = '#efe8d8', CLAW_LINE = '#5e5648';
      const claws = (x, y, dir, n) => {
        for (let i = 0; i < n; i++) {
          const ox = x + (i - (n - 1) / 2) * 2.4;
          poly(g, P([[ox - 1, y], [ox + dir * 1.8, y + 4.2], [ox + 1, y + 0.4]]), CLAW, CLAW_LINE, u * 0.4);
        }
      };
      // far arm and far leg, in the shade of the body
      limb(g, P([[60, 36], [68, 48], [66, 58]]), [10, 8, 7].map(X), far);
      limb(g, P([[58, 68], [62, 78], [60, 87]]), [13, 10, 8].map(X), far);
      shaded(g, X(58), Y(88.4), X(6), X(2.4), far);
      // the body: a heavy pear, shoulders hunched high
      const body = mass(g, P([[34, 42], [38, 30], [50, 24], [63, 28], [70, 42], [71, 58], [66, 72],
        [54, 80], [42, 77], [34, 66], [31, 54]]), p);
      g.save(); body(); g.clip();
      pelt(g, p, X(52), Y(52), X(22), X(30), 0.1, 7, 0.4, 0.46);
      g.fillStyle = 'rgba(255,240,214,.14)';
      g.beginPath(); g.ellipse(X(44), Y(60), X(9), X(14), 0.2, 0, WS.TAU); g.fill();
      g.restore();
      // near leg: a thick haunch and a flat, clawed foot
      limb(g, P([[46, 68], [44, 79], [44, 87]]), [16, 12, 9].map(X), p);
      shaded(g, X(42), Y(88.6), X(7), X(2.6), p);
      claws(37, 87.6, -1, 3);
      // the head, low and forward, a long snout
      const head = mass(g, P([[26, 24], [30, 14], [40, 10], [50, 13], [55, 22], [51, 31], [40, 34], [30, 32]]), p);
      g.save(); head(); g.clip(); pelt(g, p, X(41), Y(22), X(15), X(12), 0, 4, 0.3, 0.3); g.restore();
      for (const [x, y] of [[33, 12], [48, 11]]) {
        shaded(g, X(x), Y(y), X(5), X(4.6), p);
        g.fillStyle = 'rgba(40,20,14,.55)';
        g.beginPath(); g.ellipse(X(x), Y(y + 0.6), X(2.4), X(2.2), 0, 0, WS.TAU); g.fill();
      }
      const muzzle = { hi: '#f2dcc0', mid: p.glow, lo: p.hi, dark: p.mid, line: p.line, glow: '#fff' };
      mass(g, P([[28, 21], [17, 23], [15, 28], [19, 31], [29, 31]]), muzzle);
      g.fillStyle = '#16100c';
      g.beginPath(); g.ellipse(X(16.4), Y(24.6), X(2.2), X(1.7), 0, 0, WS.TAU); g.fill();
      g.strokeStyle = '#2a1812'; g.lineWidth = u * 0.8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(17), Y(29.4)); g.quadraticCurveTo(X(22), Y(31.4), X(28), Y(30)); g.stroke();
      for (let i = 0; i < 3; i++) poly(g, P([[19 + i * 2.6, 29.8], [19.6 + i * 2.6, 32.2], [20.3 + i * 2.6, 29.9]]), '#fffaf0', '#8a847a', u * 0.3);
      eyes(g, X(34), Y(19.6), X(0.01), X(1.6), '#ffd070');
      g.strokeStyle = p.line; g.lineWidth = u;
      g.beginPath(); g.moveTo(X(30), Y(17.6)); g.lineTo(X(37), Y(17)); g.stroke();
      // the near arm, raised to swing, claws out
      limb(g, P([[44, 38], [33, 44], [23, 44]]), [12, 9, 8].map(X), p);
      shaded(g, X(21), Y(44), X(5.4), X(4.6), p, -0.2);
      claws(17, 46, -1, 4);
    },

    owlbearform(g, s, p) {
      /* THE OWLBEAR: the bear's weight with an owl's face on it - a round
         feathered face-disc, great eyes, a hooked beak and two ear-tufts -
         and a chest of scalloped feathers where the bear has fur. Its forelimbs
         end in talons and trail a fringe of pinions, so when it lifts them
         it looks half about to fly and half about to tear something open. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const TALON = '#2a2430', TALON_LINE = '#0c0a10';
      const pinions = (pts, pal) => {
        for (let i = 0; i < pts.length; i++) {
          const [x, y, len, a] = pts[i];
          const nx = Math.cos(a), ny = Math.sin(a);
          poly(g, P([[x - ny * 1.8, y + nx * 1.8], [x + nx * len, y + ny * len], [x + ny * 1.8, y - nx * 1.8]]),
            i % 2 ? pal.lo : pal.mid, pal.line, u * 0.5);
        }
      };
      // far wing-arm and leg
      pinions([[64, 48, 12, 1.2], [66, 52, 12, 1.35], [66, 44, 10, 1.05]], far);
      limb(g, P([[60, 36], [68, 46], [66, 56]]), [10, 8, 7].map(X), far);
      limb(g, P([[58, 68], [62, 78], [60, 87]]), [12, 9, 7].map(X), far);
      poly(g, P([[55, 86], [64, 86], [65, 89.6], [53, 89.8]]), TALON, TALON_LINE, u * 0.5);
      const body = mass(g, P([[34, 42], [38, 30], [50, 25], [63, 29], [69, 42], [70, 58], [65, 72],
        [54, 80], [42, 77], [34, 66], [31, 54]]), p);
      // a chest of scalloped feathers, pale, over the fur of the flanks
      g.save(); body(); g.clip();
      pelt(g, p, X(56), Y(56), X(18), X(28), 0.1, 5, 0.4, 0.34);
      g.fillStyle = 'rgba(255,250,240,.2)';
      g.beginPath(); g.ellipse(X(44), Y(56), X(11), X(19), 0.15, 0, WS.TAU); g.fill();
      g.strokeStyle = p.lo; g.lineWidth = u * 0.9; g.globalAlpha = 0.7;
      for (let r = 0; r < 6; r++) {
        for (let i = 0; i < 3; i++) {
          g.beginPath(); g.arc(X(37 + i * 5 + (r % 2) * 2.5), Y(40 + r * 5.6), X(2.8), 0.2, WS.PI - 0.2); g.stroke();
        }
      }
      g.restore();
      limb(g, P([[46, 68], [44, 79], [44, 87]]), [15, 11, 8].map(X), p);
      poly(g, P([[36, 86], [47, 86], [48, 89.8], [34, 90]]), TALON, TALON_LINE, u * 0.5);
      for (let i = 0; i < 3; i++) poly(g, P([[35.4 + i * 3, 89], [33.4 + i * 3, 91.6], [36.6 + i * 3, 90.2]]), TALON, TALON_LINE, u * 0.3);
      // the head: an owl's disc on a bear's neck
      const head = mass(g, P([[27, 22], [30, 12], [40, 8], [51, 11], [55, 20], [52, 30], [41, 34], [30, 31]]), p);
      // ear-tufts, swept back
      poly(g, P([[31, 13], [27, 1], [37, 10]]), p.lo, p.line, u * 0.6);
      poly(g, P([[44, 9], [47, -0.5], [51, 11]]), p.mid, p.line, u * 0.6);
      const disc = { hi: '#faf4ea', mid: p.glow, lo: p.hi, dark: p.mid, line: p.line, glow: '#fff' };
      const face = mass(g, P([[28, 20], [32, 13], [39, 12], [44, 16], [44, 25], [39, 31], [31, 30], [27, 26]]), disc);
      g.save(); face(); g.clip();
      g.strokeStyle = p.mid; g.globalAlpha = 0.45; g.lineWidth = u * 0.6;
      for (let r = 4; r <= 9; r += 2.5) { g.beginPath(); g.arc(X(36), Y(21), X(r), 0, WS.TAU); g.stroke(); }
      g.restore();
      // great eyes, the owl's whole face, and the beak between them
      for (const x of [32.4, 39.6]) {
        g.fillStyle = '#1a1206';
        g.beginPath(); g.arc(X(x), Y(19.6), X(3.2), 0, WS.TAU); g.fill();
      }
      eyes(g, X(36), Y(19.6), X(3.6), X(2.2), '#ffb02e');
      poly(g, P([[34.6, 22], [37.4, 22], [36.6, 28], [35.2, 27.2]]), '#e8c070', '#5a3c10', u * 0.5);
      // the near wing-arm, raised, talons and a fringe of pinions
      pinions([[34, 42, 13, 1.9], [30, 44, 12, 2.05], [26, 42, 11, 2.2], [23, 38, 10, 2.4]], p);
      limb(g, P([[44, 36], [32, 38], [22, 30]]), [12, 9, 7].map(X), p);
      for (let i = 0; i < 3; i++) {
        const ox = 20 + i * 2.4;
        poly(g, P([[ox - 1, 28], [ox - 3, 23], [ox + 1, 27.4]]), TALON, TALON_LINE, u * 0.4);
      }
    },

    karrash(g, s, p) {
      /* THE KARRASH: centaurs of the plains, and they were drawn as a ball
         on a ball on a barrel. A centaur is two animals joined at the
         waist, and each half has to read as what it is: a horse's body in
         stride - deep chest, level back, a round rump and a tail of hair,
         legs that bend at the knee and the hock and stand on hooves - and,
         rising out of its shoulders, a man's torso leaning into the charge.
         The Karrash are not men, though: a heavy brow, a jaw that juts,
         tusks, a mane of braids down the back, and war paint across the
         flank. The spear is carried level, couched for the run. The
         Battlelord's horns and Kazrok's pauldrons hang on the head and
         shoulders named in HEAD_AT above. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const far = { hi: p.mid, mid: p.lo, lo: p.dark, dark: p.dark, line: p.line, glow: p.glow };
      const HOOF = '#2a2420', HOOF_LINE = '#0c0a08';
      const hoof = (x, y, pal) => {
        poly(g, P([[x - 2.4, y - 2.4], [x + 2.2, y - 2.4], [x + 2.8, y + 1.2], [x - 3, y + 1.2]]), HOOF, HOOF_LINE, u * 0.5);
        // the feathering of hair over it
        poly(g, P([[x - 2.6, y - 4.4], [x + 2.4, y - 4.4], [x + 2.8, y - 2], [x + 1.2, y - 1.4], [x, y - 2.2], [x - 1.4, y - 1.4], [x - 3, y - 2]]), pal.lo, pal.line, u * 0.4);
      };
      // the tail: a fall of hair from the rump
      const tail = P([[80, 48], [86, 49], [91, 56], [93.4, 66], [92, 76], [89.4, 72], [88, 78], [86, 70], [84, 60], [80.6, 54]]);
      poly(g, tail, p.dark, p.line, u * 0.6);
      g.save();
      g.beginPath(); tail.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
      g.strokeStyle = p.lo; g.globalAlpha = 0.6; g.lineWidth = u * 0.7; g.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        g.beginPath(); g.moveTo(X(82 + i * 1.6), Y(50)); g.quadraticCurveTo(X(88 + i * 1.2), Y(60), X(86 + i * 1.6), Y(76)); g.stroke();
      }
      g.restore();
      // the far legs: the fore lifted mid-stride, the hind driving
      limb(g, P([[41, 60], [37, 70], [40, 77.6], [36.4, 81.6]]), [8, 4.6, 3.4, 3.2].map(X), far);
      poly(g, P([[33.8, 80], [37.6, 79], [38.6, 83], [34.2, 83.8]]), HOOF, HOOF_LINE, u * 0.5);
      limb(g, P([[77, 58], [79, 68], [83.4, 76], [81.4, 85.2]]), [11, 6, 3.6, 3.2].map(X), far);
      hoof(81.4, 86.6, far);
      // the near legs, their tops under the body
      limb(g, P([[47, 60], [46.4, 72], [46, 80.6], [45.6, 85.2]]), [9, 5, 3.6, 3.4].map(X), p);
      hoof(45.6, 86.8, p);
      limb(g, P([[72, 58], [74.6, 68], [79, 76.4], [76.8, 85.4]]), [13, 7, 3.8, 3.4].map(X), p);
      hoof(76.8, 87, p);
      // the horse: deep chest, level back, round rump, the belly tucked
      const body = mass(g, P([[37, 52], [42, 46.6], [52, 45.6], [63, 46.2], [73, 44.4], [80.6, 46.6], [84.4, 52.6],
        [83.4, 60.4], [78.6, 65.4], [70, 66], [61, 63.4], [52, 64.6], [44, 64], [38, 59.4]]), p);
      g.save(); body(); g.clip();
      pelt(g, p, X(60), Y(55), X(26), X(11), 0, 8, 0.5, 0.38);
      g.fillStyle = 'rgba(255,246,226,.16)';
      g.beginPath(); g.ellipse(X(56), Y(64), X(16), X(3.4), 0, 0, WS.TAU); g.fill();
      // war paint: three pale slashes across the flank, a hand on the haunch
      g.strokeStyle = 'rgba(244,236,214,.78)'; g.lineCap = 'round'; g.lineWidth = u * 1.5;
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.moveTo(X(55 + i * 4), Y(49)); g.lineTo(X(52 + i * 4), Y(58)); g.stroke();
      }
      g.fillStyle = 'rgba(190,60,40,.7)';
      g.beginPath(); g.ellipse(X(76), Y(53), X(2.6), X(3), 0.2, 0, WS.TAU); g.fill();
      for (let i = 0; i < 4; i++) {
        g.beginPath(); g.ellipse(X(74 + i * 1.6), Y(49.4 - (i % 3 ? 1 : 0)), X(0.7), X(1.8), 0.2, 0, WS.TAU); g.fill();
      }
      g.strokeStyle = p.lo; g.globalAlpha = 0.55; g.lineWidth = u * 1.2;
      g.beginPath(); g.moveTo(X(69), Y(64)); g.quadraticCurveTo(X(67), Y(53), X(74), Y(47.6)); g.stroke();
      g.restore();
      // the braids, falling down the back behind the torso
      poly(g, P([[38, 14], [44, 16], [49, 24], [52, 34], [50.6, 40], [48, 36], [46.6, 42], [44.6, 34], [42, 26], [37, 22]]), p.dark, p.line, u * 0.6);
      for (const [x, y] of [[48.4, 33], [46, 39]]) {
        g.fillStyle = '#c9a25a'; g.beginPath(); g.ellipse(X(x), Y(y), X(1.1), X(0.8), 0.4, 0, WS.TAU); g.fill();
      }
      poly(g, P([[49.6, 38], [54, 46], [52.4, 46.4], [48.4, 40]]), '#e9e2d0', '#6a6254', u * 0.4);   // a feather in the braid
      // the far arm, reaching across to the spear
      limb(g, P([[44, 28], [44, 36], [37, 40]]), [5, 4, 3.6].map(X), far);
      // the torso: a man's, leaning into the run, rising out of the chest
      const torso = mass(g, P([[35, 50], [32.4, 42], [31.4, 33], [33.4, 26], [38.6, 23], [44.4, 24.4], [47.6, 30],
        [47, 38], [46.6, 46], [44, 52]]), p);
      g.save(); torso(); g.clip();
      g.strokeStyle = p.lo; g.globalAlpha = 0.5; g.lineWidth = u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(34), Y(33.4)); g.quadraticCurveTo(X(39), Y(36), X(44.6), Y(33)); g.stroke();   // the chest
      for (const y of [38.6, 42.4]) { g.beginPath(); g.moveTo(X(35), Y(y)); g.lineTo(X(42), Y(y + 0.4)); g.stroke(); }
      g.beginPath(); g.moveTo(X(38.4), Y(34.6)); g.lineTo(X(38.6), Y(45.6)); g.stroke();
      // a band of paint across the ribs
      g.strokeStyle = 'rgba(244,236,214,.7)'; g.globalAlpha = 1; g.lineWidth = u * 1.3;
      g.beginPath(); g.moveTo(X(32.6), Y(29.6)); g.lineTo(X(46), Y(31.6)); g.stroke();
      g.restore();
      // the belt where the man becomes the horse, and a hide apron
      poly(g, P([[33.4, 46], [46.8, 47.6], [46.4, 50.6], [33.8, 49.4]]), '#5a3e26', '#1e140a', u * 0.5);
      poly(g, P([[35, 49.4], [42, 50.2], [41, 56], [38.4, 54], [36, 56.4]]), '#7a5a3a', '#2a1c10', u * 0.5);
      for (const x of [36.6, 43.4]) { g.fillStyle = '#d8c89a'; g.beginPath(); g.arc(X(x), Y(48), X(0.9), 0, WS.TAU); g.fill(); }
      // the head: brow, jutting jaw, tusks, a pointed ear
      poly(g, P([[40.6, 16], [45.6, 11.6], [43.4, 18.2]]), p.lo, p.line, u * 0.5);
      const head = mass(g, P([[31.6, 16.6], [33.6, 12.4], [38.4, 11.4], [42.4, 14], [42.8, 19.6], [40.6, 24],
        [35.6, 25.4], [31.2, 23.4], [30, 20.6]]), p);
      g.save(); head(); g.clip();
      g.fillStyle = p.dark; g.globalAlpha = 0.45;
      g.beginPath(); g.ellipse(X(34.6), Y(16.4), X(4.2), X(1.4), -0.1, 0, WS.TAU); g.fill();
      g.restore();
      poly(g, P([[29.4, 18.6], [31.8, 17.8], [31.6, 21.2]]), p.mid, p.line, u * 0.4);           // the nose
      for (const [x, y] of [[31.6, 23.4], [34.4, 24.2]]) {
        poly(g, P([[x - 0.7, y], [x - 0.2, y - 3.2], [x + 0.7, y]]), '#f4efe2', '#6a665c', u * 0.35);
      }
      eyes(g, X(33.6), Y(18), X(0.01), X(1.3), '#ffd98f');
      g.strokeStyle = p.line; g.lineWidth = u * 1.1; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(31), Y(16.2)); g.lineTo(X(36.4), Y(15.6)); g.stroke();
      // the spear, level, couched for the charge
      const bx = 60, by = 28.6, tx = 15, ty = 41.4;
      g.save();
      g.lineCap = 'round';
      const haft = g.createLinearGradient(X(bx), Y(by), X(tx), Y(ty));
      haft.addColorStop(0, '#6d5233'); haft.addColorStop(0.5, '#a6845a'); haft.addColorStop(1, '#6d5233');
      g.strokeStyle = haft; g.lineWidth = u * 2.6;
      g.beginPath(); g.moveTo(X(bx), Y(by)); g.lineTo(X(tx), Y(ty)); g.stroke();
      g.strokeStyle = '#4c3721'; g.lineWidth = u * 0.8;
      const dx = tx - bx, dy = ty - by, len = Math.hypot(dx, dy);
      const nx = -dy / len * 1.6, ny = dx / len * 1.6;
      for (const t of [0.62, 0.66, 0.70, 0.84, 0.88]) {
        const mx = bx + dx * t, my = by + dy * t;
        g.beginPath(); g.moveTo(X(mx - nx), Y(my - ny)); g.lineTo(X(mx + nx), Y(my + ny)); g.stroke();
      }
      g.restore();
      // feathers tied under the head of it
      poly(g, P([[18, 40], [16.6, 47.4], [15.4, 47], [16.6, 40.6]]), '#b3402e', '#3a120c', u * 0.4);
      poly(g, P([[20, 39.6], [19.6, 46], [18.4, 45.8], [18.8, 40]]), '#e9e2d0', '#6a6254', u * 0.4);
      blade(g, X(tx), Y(ty), X(12), X(2.8), Math.atan2(dx, -dy), '#e7ecf5', '#8a90a0');
      // the near arm: shoulder, elbow down, the fist closed on the haft
      limb(g, P([[36, 27], [31.6, 35], [26.6, 38.6]]), [6, 4.6, 4].map(X), p);
      shaded(g, X(26), Y(38.8), X(2.6), X(2.4), p);
      shaded(g, X(36.4), Y(27.4), X(4.4), X(3.8), p, -0.3);
    },

    golem(g, s, p) {
      /* A HARVESTER THAT WALKS. It was a box with a blade - angular, which
         is right, and nothing else, which is not. Now a clockwork thing a
         farm built and the dark took: a riveted barrel body with a window
         onto the grain inside, a gear turning in its side, a sickle for one
         arm and a pitchfork for the other, piston legs, and a head like a
         lantern under a straw hat with light for eyes. The Harvest King
         wears this body with a crown on it. */
      const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
      const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
      const IRON = { hi: '#c9ced6', mid: '#7c828e', lo: '#3f4450', dark: '#23272f', line: '#15181e', glow: '#fff' };
      const WOOD = { hi: '#b08a5a', mid: '#7a5a36', lo: '#4a3420', line: '#241810' };
      const STRAW = { hi: '#fff0b0', mid: '#e6c86a', lo: '#9a7a30', line: '#4a3810' };
      const bolt = (x, y, r) => {
        g.fillStyle = p.line; g.beginPath(); g.arc(X(x + 0.2), Y(y + 0.3), X(r * 1.1), 0, WS.TAU); g.fill();
        g.fillStyle = p.hi; g.beginPath(); g.arc(X(x - 0.2), Y(y - 0.2), X(r * 0.6), 0, WS.TAU); g.fill();
      };
      // piston legs and splayed iron feet
      for (const [x, d] of [[42, -1], [58, 1]]) {
        poly(g, P([[x - 3, 64], [x + 3, 64], [x + 2.4, 76], [x - 2.4, 76]]), IRON.mid, IRON.line, u * 0.7);
        poly(g, P([[x - 1.6, 74], [x + 1.6, 74], [x + 1.6, 85], [x - 1.6, 85]]), '#d9dde4', IRON.line, u * 0.6);
        shaded(g, X(x), Y(75), X(3.2), X(2.6), IRON);
        poly(g, P([[x - 6 + d, 85], [x + 6 + d, 85], [x + 7 + d, 89.6], [x - 7 + d, 89.6]]), IRON.lo, IRON.line, u * 0.7);
      }
      // the far arm: a pitchfork, tines up behind the body
      g.save(); g.lineCap = 'round';
      g.strokeStyle = WOOD.line; g.lineWidth = u * 2.8;
      g.beginPath(); g.moveTo(X(70), Y(78)); g.lineTo(X(76), Y(22)); g.stroke();
      g.strokeStyle = WOOD.mid; g.lineWidth = u * 1.6;
      g.beginPath(); g.moveTo(X(70), Y(78)); g.lineTo(X(76), Y(22)); g.stroke();
      g.strokeStyle = IRON.mid; g.lineWidth = u * 1.2;
      g.beginPath(); g.moveTo(X(72), Y(24)); g.lineTo(X(80), Y(25)); g.stroke();
      for (const x of [72, 76, 80]) { g.beginPath(); g.moveTo(X(x), Y(24.4)); g.lineTo(X(x + 0.6), Y(14)); g.stroke(); }
      g.restore();
      poly(g, P([[62, 42], [68, 44], [72, 56], [67, 58]]), IRON.mid, IRON.line, u * 0.7);
      shaded(g, X(70.6), Y(58), X(3), X(3), IRON);
      // the body: a riveted barrel
      const body = [[34, 38], [66, 38], [68, 52], [64, 66], [36, 66], [32, 52]];
      poly(g, P(body), p.mid, p.line, u);
      g.save();
      g.beginPath(); P(body).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
      const bg = g.createLinearGradient(X(32), 0, X(68), 0);
      bg.addColorStop(0, 'rgba(255,250,220,.28)'); bg.addColorStop(0.4, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(0,0,0,.34)');
      g.fillStyle = bg; g.fillRect(X(30), Y(36), X(40), Y(32));
      // hoops round the barrel
      for (const y of [43, 61]) {
        g.fillStyle = IRON.lo; g.fillRect(X(30), Y(y - 1.4), X(40), Y(2.8));
        g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(X(30), Y(y - 1.4), X(40), Y(0.6));
      }
      g.restore();
      for (const x of [36, 43, 50, 57, 64]) { bolt(x, 43, 0.7); bolt(x, 61, 0.7); }
      // the window, and the grain behind it
      poly(g, P([[40, 46.6], [52, 46.6], [52, 57.6], [40, 57.6]]), '#3a2a14', IRON.line, u * 0.8);
      g.save();
      g.beginPath(); g.rect(X(40.6), Y(47.2), X(10.8), Y(9.8)); g.clip();
      g.fillStyle = STRAW.mid; g.beginPath(); g.moveTo(X(40), Y(58)); g.lineTo(X(40), Y(52)); g.quadraticCurveTo(X(46), Y(50), X(52), Y(53)); g.lineTo(X(52), Y(58)); g.fill();
      g.fillStyle = STRAW.hi;
      for (let i = 0; i < 10; i++) { g.beginPath(); g.ellipse(X(41 + (i * 1.1) % 10), Y(53.6 + (i % 3) * 1.2), X(0.5), X(0.35), 0.6, 0, WS.TAU); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = u * 0.7;
      g.beginPath(); g.moveTo(X(42), Y(48.4)); g.lineTo(X(42), Y(55)); g.stroke();
      g.restore();
      // the gear in its flank, a cog of teeth with a hub
      const gx = 59, gy = 52, gr = 5;
      g.fillStyle = IRON.mid; g.strokeStyle = IRON.line; g.lineWidth = u * 0.6;
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = i * WS.TAU / 16, r = i % 2 ? gr : gr * 1.25;
        const px = X(gx + Math.cos(a) * r), py = Y(gy + Math.sin(a) * r);
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = IRON.dark; g.beginPath(); g.arc(X(gx), Y(gy), X(2), 0, WS.TAU); g.fill();
      bolt(gx, gy, 0.9);
      // the near arm: a sickle
      poly(g, P([[36, 42], [30, 45], [26, 56], [30, 58], [34, 49]]), IRON.mid, IRON.line, u * 0.7);
      shaded(g, X(28), Y(58), X(3), X(3), IRON);
      g.save();
      g.translate(X(28), Y(59));
      g.beginPath();
      g.moveTo(0, 0); g.quadraticCurveTo(-X(14), Y(2), -X(16), Y(14)); g.quadraticCurveTo(-X(12), Y(6), -X(1), Y(3)); g.closePath();
      g.fillStyle = '#dfe4ec'; g.fill(); g.strokeStyle = '#4a5160'; g.lineWidth = u * 0.7; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = u * 0.5;
      g.beginPath(); g.moveTo(-X(1), Y(2.4)); g.quadraticCurveTo(-X(11.4), Y(5), -X(15.4), Y(13)); g.stroke();
      g.restore();
      // the head: a lantern, iron-framed, eyes of light, under a straw hat
      poly(g, P([[42, 22], [58, 22], [59, 38], [41, 38]]), IRON.lo, IRON.line, u * 0.8);
      g.save();
      g.beginPath(); g.rect(X(43.4), Y(24), X(13.2), Y(12.4)); g.clip();
      const hg = g.createRadialGradient(X(50), Y(30), 0, X(50), Y(30), X(9));
      hg.addColorStop(0, '#fff3c4'); hg.addColorStop(0.5, p.hi); hg.addColorStop(1, p.lo);
      g.fillStyle = hg; g.fillRect(X(43), Y(23), X(14), Y(14));
      g.restore();
      g.fillStyle = IRON.line;
      g.fillRect(X(49.4), Y(24), X(1.2), Y(12.4));
      g.fillRect(X(43.4), Y(33), X(13.2), Y(1.2));
      eyes(g, X(50), Y(28.6), X(3.6), X(1.4), '#fff6d8');
      // the hat: a wide brim of straw, frayed, and a crown with a band
      poly(g, P([[30, 23], [70, 21], [66, 25], [34, 26.6]]), STRAW.mid, STRAW.line, u * 0.8);
      poly(g, P([[40, 22.4], [42, 12], [58, 11], [60, 21.4]]), STRAW.hi, STRAW.line, u * 0.8);
      poly(g, P([[40.6, 18.6], [59.4, 17.8], [59.8, 21], [40.2, 21.8]]), '#8a2a20', '#3a100a', u * 0.6);
      g.strokeStyle = STRAW.lo; g.lineWidth = u * 0.5;
      for (let i = 0; i < 12; i++) {
        const x = 31 + i * 3.4;
        g.beginPath(); g.moveTo(X(x), Y(24.2 - i * 0.1)); g.lineTo(X(x - 0.8), Y(27 - i * 0.1)); g.stroke();
      }
      for (let i = 0; i < 5; i++) {
        g.beginPath(); g.moveTo(X(43 + i * 3.4), Y(12.4)); g.lineTo(X(43.4 + i * 3.4), Y(17.6)); g.stroke();
      }
    }
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
    druid: { accessory: 'staff', bulk: 1.15, horns: true },
    monk: { accessory: 'daggers' },
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
    /* Highmoor's furniture. A standing stone is taller than it is wide and
       leans a little, with a lichen crust and one carved line; heather is a
       purple mound of flowering spikes; a cairn is a pile somebody built on
       purpose, which is the difference between it and a rock. */
    standing(g, s) {
      const u = s / 100, cx = s / 2;
      g.globalAlpha = 0.35; g.fillStyle = '#000';
      g.beginPath(); g.ellipse(cx + 4 * u, s * 0.78, 14 * u, 4 * u, 0, 0, WS.TAU); g.fill();
      g.globalAlpha = 1;
      const hull = [[cx - 11 * u, s * 0.78], [cx - 9 * u, s * 0.2], [cx - 2 * u, s * 0.12], [cx + 8 * u, s * 0.18],
        [cx + 12 * u, s * 0.78]];
      poly(g, hull, '#5a5c60', '#26282c', u);
      poly(g, [[cx + 2 * u, s * 0.16], [cx + 8 * u, s * 0.18], [cx + 12 * u, s * 0.78], [cx + 3 * u, s * 0.78]],
        '#3c3e44', '#26282c', u * 0.6);
      g.fillStyle = 'rgba(160,170,110,.5)';
      for (const [x, y, r] of [[-5, 0.3, 3], [4, 0.5, 2.4], [-3, 0.62, 2]]) {
        g.beginPath(); g.arc(cx + x * u, s * y, r * u, 0, WS.TAU); g.fill();
      }
      g.strokeStyle = 'rgba(20,20,24,.7)'; g.lineWidth = 1.4 * u;
      g.beginPath(); g.moveTo(cx - 3 * u, s * 0.3); g.lineTo(cx - 2 * u, s * 0.46); g.lineTo(cx - 5 * u, s * 0.52); g.stroke();
    },
    heather(g, s) {
      const u = s / 100, cx = s / 2;
      g.fillStyle = '#2e2a22';
      g.beginPath(); g.ellipse(cx, s * 0.7, 16 * u, 6 * u, 0, 0, WS.TAU); g.fill();
      g.lineCap = 'round';
      for (let i = -6; i <= 6; i++) {
        const x = cx + i * 2.4 * u, h = (14 - Math.abs(i)) * u;
        g.strokeStyle = '#4a4a30'; g.lineWidth = 1.4 * u;
        g.beginPath(); g.moveTo(x, s * 0.7); g.lineTo(x + i * 0.4 * u, s * 0.7 - h); g.stroke();
        g.fillStyle = i % 2 ? '#9a5aa6' : '#b478c0';
        for (let k = 0; k < 3; k++) {
          g.beginPath(); g.arc(x + i * 0.4 * u, s * 0.7 - h + k * 2.4 * u, 1.5 * u, 0, WS.TAU); g.fill();
        }
      }
    },
    cairn(g, s) {
      const u = s / 100, cx = s / 2;
      g.globalAlpha = 0.35; g.fillStyle = '#000';
      g.beginPath(); g.ellipse(cx + 3 * u, s * 0.76, 18 * u, 5 * u, 0, 0, WS.TAU); g.fill();
      g.globalAlpha = 1;
      const rocks = [[-10, 0.7, 9, 6], [6, 0.71, 10, 6], [-2, 0.6, 9, 5.4], [-5, 0.5, 7, 4.6], [3, 0.49, 6, 4], [-1, 0.4, 5, 3.6], [0, 0.32, 3.6, 2.8]];
      rocks.forEach(([x, y, rx, ry], i) => {
        g.fillStyle = i % 2 ? '#62646a' : '#74767c';
        g.strokeStyle = '#2a2c30'; g.lineWidth = u;
        g.beginPath(); g.ellipse(cx + x * u, s * y, rx * u, ry * u, (i % 3 - 1) * 0.15, 0, WS.TAU); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.beginPath(); g.ellipse(cx + x * u - rx * 0.3 * u, s * y - ry * 0.35 * u, rx * 0.5 * u, ry * 0.3 * u, 0, 0, WS.TAU); g.fill();
      });
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
        /* A creature whose widest early row is not its head - a bird with
           its wings spread level with its eyes - says where the head is,
           rather than the crown being hung across its face. */
        const at = HEAD_AT[art];
        if (b && at) {
          const uu = res / 100, w0 = b.width, m0 = b.mid;
          const rows = [at.crown, at.shoulder].filter(Boolean).map(([x, y, w]) => [x * uu, y * uu, w * uu]);
          const row = (y) => rows.find((r) => Math.abs(y - r[1]) < 0.5);
          b.crownY = rows[0][1];
          b.anchored = true;
          b.plateScale = at.plate || 1;
          if (at.shoulder) b.shoulderY = rows[1][1];
          b.mid = (y) => { const r = row(y); return r ? r[0] : m0(y); };
          b.width = (y) => { const r = row(y); return r ? r[2] : w0(y); };
        }
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

    /** A canvas as a data URL, encoded once.
     *
     *  Every tile in the menu - the roster's faces, the bestiary's sixty-odd
     *  creatures, the icons - was re-encoded as a PNG each time its pane was
     *  built, which is every tab switch. Measured: the Bestiary spent 190 to
     *  300ms of a click just on that. The canvases are already cached, so
     *  their encodings can be too, keyed on the canvas itself. */
    dataURL(canvas) {
      let u = urls.get(canvas);
      if (!u) { u = canvas.toDataURL(); urls.set(canvas, u); }
      return u;
    },

    /** A creature as a shape and nothing else - for what has not been met.
     *  The sprite's alpha, flooded with one colour and a faint cold rim, so
     *  it reads as something out there without giving away what. */
    silhouette(art, size, kit) {
      const key = `sil:${art}:${size}:${kit ? kit.join('') : ''}`;
      let c = cache.get(key);
      if (c) return c;
      const src = this.creature(art, [0.5, 0.5, 0.5], size, kit);
      const flood = (colour) => {
        const f = make(src.width, src.height), fg = f.getContext('2d');
        fg.drawImage(src, 0, 0);
        fg.globalCompositeOperation = 'source-in';
        fg.fillStyle = colour; fg.fillRect(0, 0, f.width, f.height);
        return f;
      };
      c = make(src.width, src.height);
      const g = c.getContext('2d');
      const k = WS.max(1, src.width / 90);
      g.drawImage(flood('rgba(150,176,220,.75)'), -k, -k);   // the moon catching its edge
      g.drawImage(flood('#12141c'), 0, 0);
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
