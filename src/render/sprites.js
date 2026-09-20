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
      // the hunch: a shoulder mass standing proud of the back
      shaded(g, cx + 5 * u, cy - 12 * u, 14 * u, 10 * u, p, 0.3);
      shaded(g, cx - 16 * u, cy + 4 * u, 6 * u, 14 * u, p, -0.5);  // arms, long
      shaded(g, cx + 17 * u, cy + 2 * u, 6 * u, 14 * u, p, 0.5);
      shaded(g, cx - 10 * u, cy - 17 * u, 12 * u, 10 * u, p, -0.18); // head, forward
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
      shaded(g, cx, cy - 20 * u, 11 * u, 11 * u, { hi: '#d6c2a8', mid: '#b89b7c', lo: '#7a6350', line: '#4a3b2f', glow: '#fff' });
      g.fillStyle = p.mid;                                        // red bandana
      g.beginPath(); g.ellipse(cx, cy - 18 * u, 11.5 * u, 5 * u, 0, WS.PI, WS.TAU); g.fill();
      g.fillStyle = p.lo;
      g.fillRect(cx - 12 * u, cy - 20 * u, 24 * u, 4 * u);
      eyes(g, cx, cy - 22 * u, 4 * u, 1.5 * u, '#fff0d0');
      blade(g, cx + 20 * u, cy + 4 * u, 26 * u, 4 * u, 0.7, '#d7dbe6', '#767c8c');
    },

    brute(g, s, p) {
      /* A WALL - the opposite proportion to the mongrel above, which it used
         to be within a few units of. Wide and low, no neck at all, the head
         sunk between shoulders that are the widest thing on the field, and
         the knuckles on the ground where an animal this top-heavy would have
         to put them. */
      const cx = s / 2, cy = s * 0.54, u = s / 100;
      legs(g, p, cx, cy + 26 * u, u, [-13, 13], 7, 8);
      shaded(g, cx, cy + 10 * u, 34 * u, 19 * u, p);               // wide, low trunk
      // the shoulders: one mass across the top, the widest part of the figure
      shaded(g, cx, cy - 10 * u, 30 * u, 13 * u, p);
      shaded(g, cx - 30 * u, cy + 6 * u, 9 * u, 16 * u, p, -0.16);
      shaded(g, cx + 30 * u, cy + 6 * u, 9 * u, 16 * u, p, 0.16);
      // knuckles on the ground - shaded like everything else, not flat discs
      shaded(g, cx - 31 * u, cy + 20 * u, 9 * u, 8 * u, STONE);
      shaded(g, cx + 31 * u, cy + 20 * u, 9 * u, 8 * u, STONE);
      shaded(g, cx, cy - 17 * u, 11 * u, 9 * u, p);                // head, sunk in
      g.fillStyle = p.lo; g.fillRect(cx - 12 * u, cy - 19 * u, 24 * u, 4 * u);
      eyes(g, cx, cy - 18 * u, 4.5 * u, 1.7 * u, '#ff8f6b');
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
      g.fillStyle = '#141a20';                                     // stitched mask
      g.fillRect(cx - 11 * u, cy - 19 * u, 22 * u, 6 * u);
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
      g.strokeStyle = p.dark; g.lineWidth = 2 * u;                 // stitches
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(cx + i * 9 * u, cy - 14 * u);
        g.lineTo(cx + i * 9 * u, cy + 26 * u);
        g.stroke();
      }
      shaded(g, cx - 29 * u, cy - 1 * u, 8 * u, 14 * u, p, -0.35);  // the small arm
      shaded(g, cx + 31 * u, cy + 1 * u, 12 * u, 19 * u, p, 0.32);  // and the heavy one
      blade(g, cx + 19 * u, cy + 6 * u, 30 * u, 8 * u, 0.75, '#aeb6c4', '#5a6070', 'heavy');
      shaded(g, cx - 4 * u, cy - 24 * u, 13 * u, 11 * u, p, -0.2); // sagging head
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
      // folds down the cloth, gathering toward the hood
      g.save();
      shroud(); g.clip();
      for (const k of [-0.62, -0.2, 0.24, 0.66]) {
        const tx = cx + k * 8 * u, bx = cx + k * 19 * u;
        const w = (2 + 1.4 * Math.abs(k)) * u;
        const fg = g.createLinearGradient(bx - w, 0, bx + w, 0);
        fg.addColorStop(0, 'rgba(0,0,0,.26)');
        fg.addColorStop(0.55, 'rgba(0,0,0,0)');
        fg.addColorStop(0.78, 'rgba(255,255,255,.16)');
        fg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = fg;
        g.beginPath();
        g.moveTo(tx - u, cy - 30 * u); g.lineTo(tx + u, cy - 30 * u);
        g.lineTo(bx + w, cy + 30 * u); g.lineTo(bx - w, cy + 30 * u);
        g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.24)'; g.lineWidth = 0.9 * u;
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
      grd.addColorStop(0, '#2c1d४a'.replace('४', '4'));
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
      poly(g, [[cx + 22 * u, cy - 1 * u], [cx + 42 * u, cy - 9 * u],
        [cx + 44 * u, cy - 1 * u], [cx + 26 * u, cy + 7 * u]], p.lo, p.line, u); // brush
      shaded(g, cx - 22 * u, cy - 6 * u, 13 * u, 11 * u, p);       // head
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

    boar(g, s, p) {
      const cx = s / 2, cy = s * 0.55, u = s / 100;
      // Stubby trotters: short, but they still have to clear the barrel.
      legs(g, p, cx + 2 * u, cy + 18 * u, u, [-13, -4, 7, 16], 11, 5);
      /* A boar is a high hump with the head slung low and forward. Sitting the
         head at the body's own centre height, as this did, just made two
         spheres of the same size in a row. */
      shaded(g, cx + 3 * u, cy - 1 * u, 23 * u, 18 * u, p);         // humped body
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

    moonwretch(g, s, p) {
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
      // Four legs with feet on them, like every other quadruped here. These
      // were four bare round-capped strokes - the only limbs in the bestiary
      // that did not stand on anything.
      legs(g, p, cx, cy + 18 * u, u, [-14, -4, 12, 22], 14, 4);
      poly(g, [[cx + 28 * u, cy + 4 * u], [cx + 44 * u, cy - 6 * u], [cx + 30 * u, cy + 12 * u]], p.lo, p.line, u);
      shaded(g, cx - 12 * u, cy - 14 * u, 13 * u, 16 * u, p);      // humanoid torso
      shaded(g, cx - 12 * u, cy - 32 * u, 10 * u, 9 * u, p);
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
      const body = make(res, res);
      const draw = CREATURES[art] || CREATURES.lampling;
      draw(body.getContext('2d'), res, palette(tint));
      c = outline(body, res, palette(tint));
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
    clear() { cache.clear(); },
  };

})(window.WS);
