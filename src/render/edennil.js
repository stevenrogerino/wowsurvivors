/* Edennil, who brings the Watch its supplies, and the crate Edennil brings.
 *
 * A horned owl, near black above and broken up with bold cream blotches, a
 * grey face, black ear tufts edged in cream, and eyes the colour of a banked
 * fire - the brightest thing on him. Seen from above in flight, because the field
 * is seen from above: long broad wings along the heading, the leading edge
 * clean, the coverts laid over the arm, a scalloped row of secondaries along
 * the trailing edge, and ten barred primaries fanned out to fingered tips.
 *
 * The head is its own sprite, seen from above too - the crown with the ear
 * tufts laid back along it, and at the front the rim of the facial disc with
 * the eyes under the brow - because it
 * TURNS: the renderer swivels it on the neck to watch the survivor as he
 * passes over, which is the one thing an owl does that no other bird can.
 *
 *   edennil_w0 .. edennil_w7   body and wings, heading up the tile, one frame
 *                              per eighth of a wingbeat
 *   edennil_head               the head from above, facing up the tile
 *   supply_crate               what he carries: an iron-cornered crate with
 *                              the Watch's ember burned into the lid
 *
 * The parachute is not a sprite: it breathes and sways and collapses, so the
 * renderer draws it (Renderer.drawAirdropSky). */
'use strict';
(function (WS) {

  // Near black to cream, a grey face, and one ember.
  const BLACK = '#0f0c0a', CHAR = '#1e1916', SLATE = '#2f2722', GREY = '#4d443d';
  const ASH = '#8e8a85', SILVER = '#c3c1bc', PALE = '#e9dfcc', CREAM = 'rgba(226,210,178,';
  const FRAMES = 8;

  function path(g, pts, close) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.length === 4) g.quadraticCurveTo(p[0], p[1], p[2], p[3]);
      else g.lineTo(p[0], p[1]);
    }
    if (close !== false) g.closePath();
  }

  /* A cheap, repeatable scatter, so every frame of the wingbeat carries the
     same flecks in the same places and the plumage does not boil. */
  function hash(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /** One flight feather from (x, y) at `ang`: a soft rounded blade, dark
   *  bars across it, a pale shaft, and - for a primary - a narrowed tip, the
   *  "finger" an owl's wingtip is made of. */
  function feather(g, u, x, y, ang, len, wid, o) {
    g.save();
    g.translate(x * u, y * u); g.rotate(ang);
    const L = len * u, W = wid * u, nip = o.finger ? 0.55 : 1;
    g.beginPath();
    g.moveTo(0, -W * 0.5);
    g.bezierCurveTo(L * 0.45, -W * 0.56, L * 0.8, -W * 0.5 * nip, L, -W * 0.1);
    g.quadraticCurveTo(L * 1.03, W * 0.2 * nip, L * 0.92, W * 0.42 * nip);
    g.bezierCurveTo(L * 0.7, W * 0.56, L * 0.3, W * 0.56, 0, W * 0.5);
    g.closePath();
    const gr = g.createLinearGradient(0, -W * 0.5, 0, W * 0.5);
    gr.addColorStop(0, o.lite || GREY); gr.addColorStop(1, o.base || SLATE);
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    // Bars: soft dark bands, a little curved, as an owl's flight feathers are.
    g.fillStyle = 'rgba(14,16,20,.62)';
    for (let i = 1; i <= o.bars; i++) {
      const bx = L * (i / (o.bars + 0.6));
      g.beginPath(); g.ellipse(bx, 0, u * 1.1, W * 0.7, 0, 0, WS.TAU); g.fill();
    }
    // The pale margin on the outer vane, which is what makes a wing of dark
    // feathers read as feathers rather than a dark wing.
    g.strokeStyle = 'rgba(214,219,225,.32)'; g.lineWidth = u * 0.7;
    g.beginPath(); g.moveTo(L * 0.1, -W * 0.44); g.bezierCurveTo(L * 0.5, -W * 0.5, L * 0.8, -W * 0.44 * nip, L * 0.98, -W * 0.08); g.stroke();
    g.strokeStyle = 'rgba(230,232,235,.35)'; g.lineWidth = u * 0.35;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.9, 0); g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(10,11,14,.55)'; g.lineWidth = u * 0.45; g.stroke();
    g.restore();
  }

  /** The left wing at full spread; body() foreshortens it for the beat.
   *  `fan` 0..1 is how far the primaries open, `lift` raises the hand. */
  function wing(g, u, fan, lift) {
    const X = (x) => x * u, Y = (y) => y * u;
    const rootX = 42, wx = 17, wy = 32 - lift;                 // the wrist
    // Primaries: nine, from the hand, reaching OUT - a tapered, fingered tip,
    // not a fan. Innermost first, so the outer ones lie over them.
    for (let i = 8; i >= 0; i--) {
      const t = i / 8;
      const ang = Math.PI + 0.16 - t * (0.42 + 0.28 * fan);
      const len = 15 + 8 * Math.sin(0.5 + t * 1.9) - t * 3;
      feather(g, u, wx + 1 + t * 4, wy + 1 + t * 8.5, ang, len, 5.2,
        { bars: 4, finger: i < 5, base: CHAR, lite: GREY });
    }
    // Secondaries: a scalloped row along the trailing edge, pointing back.
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = wx + 6 + t * (rootX - 1 - wx - 6), y = 43 + t * 6 - lift * 0.6 * (1 - t);
      feather(g, u, x, y, Math.PI / 2 + 0.3 - t * 0.24, 11 - t * 1.5, 6.2,
        { bars: 3, base: SLATE, lite: GREY });
    }
    // Greater coverts over their bases, each tipped with cream.
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const x = wx + 5 + t * (rootX - 2 - wx - 5), y = 39.5 + t * 5.5 - lift * 0.6 * (1 - t);
      feather(g, u, x, y, Math.PI / 2 + 0.22 - t * 0.16, 6.5, 5.4, { bars: 1, base: CHAR, lite: SLATE });
      g.fillStyle = CREAM + '.75)';
      g.beginPath(); g.ellipse(X(x + 0.6), Y(y + 5.2), u * 1.4, u * 0.95, 0, 0, WS.TAU); g.fill();
    }
    // The arm: lesser coverts from the leading edge back, near black and
    // broken with bold cream blotches.
    const arm = [[X(rootX), Y(34)], [X((rootX + wx) / 2), Y(wy - 3.2), X(wx - 1), Y(wy - 0.5)],
      [X(wx - 2), Y(wy + 3.5), X(wx + 5), Y(wy + 8)], [X((rootX + wx) / 2 + 3), Y(43), X(rootX), Y(46)]];
    const ag = g.createLinearGradient(0, Y(wy - 3), 0, Y(46));
    ag.addColorStop(0, GREY); ag.addColorStop(0.3, SLATE); ag.addColorStop(1, CHAR);
    path(g, arm); g.fillStyle = ag; g.fill();
    g.save(); path(g, arm); g.clip();
    for (let i = 0; i < 34; i++) {
      const x = wx - 1 + hash(i) * (rootX - wx + 1), y = wy - 3 + hash(i + 50) * 14;
      const cream = hash(i + 99) >= 0.5;
      g.fillStyle = cream ? CREAM + (0.6 + hash(i + 5) * 0.3) + ')' : 'rgba(10,8,6,.65)';
      g.beginPath();
      g.ellipse(X(x), Y(y), u * (cream ? 1.2 + hash(i + 7) * 1.2 : 0.8 + hash(i + 7) * 0.7), u * (cream ? 0.85 : 0.55), -0.2, 0, WS.TAU);
      g.fill();
    }
    g.restore();
    // Primary coverts: short feathers over the base of the hand, laid along
    // the primaries rather than a patch on top of them.
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      feather(g, u, wx + 3 + t * 3, wy + 1.5 + t * 6, Math.PI + 0.05 - t * 0.5, 6, 4.2, { bars: 1, base: SLATE, lite: GREY });
    }
    // The leading edge, catching the light.
    g.strokeStyle = CREAM + '.5)'; g.lineWidth = u * 0.9;
    g.beginPath(); g.moveTo(X(rootX - 1), Y(34.2)); g.quadraticCurveTo(X((rootX + wx) / 2), Y(wy - 2.4), X(wx), Y(wy + 0.2)); g.stroke();
  }

  /** The body and both wings, heading up. `ph` is 0..1 of a wingbeat. */
  function body(g, s, ph) {
    const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
    const beat = Math.sin(ph * WS.TAU);                 // +1 top of the stroke
    // Seen from above, a wing sweeping down and away is a wing foreshortened:
    // the whole of it squeezed toward the shoulder, most at the bottom of
    // the stroke, and its primaries closing as they push.
    const sp = 0.8 + 0.2 * beat;
    const fan = 0.5 + 0.5 * beat;
    const lift = 1.4 * beat;
    // Tail: short and rounded, barred, the feathers just parted.
    const tail = [[X(45), Y(58)], [X(41.5), Y(69), X(44.5), Y(74)], [X(50), Y(76.5), X(55.5), Y(74)], [X(58.5), Y(69), X(55), Y(58)]];
    const tg = g.createLinearGradient(0, Y(58), 0, Y(76));
    tg.addColorStop(0, CHAR); tg.addColorStop(1, SLATE);
    path(g, tail); g.fillStyle = tg; g.fill();
    g.save(); path(g, tail); g.clip();
    g.strokeStyle = 'rgba(226,210,178,.18)'; g.lineWidth = u * 1;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(X(40), Y(63 + i * 4)); g.quadraticCurveTo(X(50), Y(65 + i * 4), X(60), Y(63 + i * 4)); g.stroke(); }
    g.strokeStyle = 'rgba(10,8,6,.5)'; g.lineWidth = u * 0.4;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(X(50), Y(59)); g.lineTo(X(50 + i * 3.2), Y(76)); g.stroke(); }
    g.restore();
    // Wings, foreshortened about the shoulder; the right one mirrored.
    for (const side of [1, -1]) {
      g.save();
      if (side < 0) { g.translate(s, 0); g.scale(-1, 1); }
      g.translate(X(42), 0); g.scale(sp, 1); g.translate(-X(42), 0);
      wing(g, u, fan, lift);
      g.restore();
    }
    // Body: compact and broad-shouldered, as an owl is.
    const bodyPts = [[X(50), Y(29)], [X(60), Y(31), X(60.5), Y(41)], [X(60), Y(53), X(54.5), Y(60)],
      [X(50), Y(62), X(45.5), Y(60)], [X(40), Y(53), X(39.5), Y(41)], [X(40), Y(31), X(50), Y(29)]];
    const bg = g.createRadialGradient(X(47), Y(37), X(2), X(50), Y(45), X(18));
    bg.addColorStop(0, GREY); bg.addColorStop(0.5, SLATE); bg.addColorStop(1, CHAR);
    path(g, bodyPts); g.fillStyle = bg; g.fill();
    g.save(); path(g, bodyPts); g.clip();
    for (let i = 0; i < 18; i++) {
      const cream = hash(i + 11) > 0.35;
      g.fillStyle = cream ? CREAM + (0.55 + hash(i + 3) * 0.35) + ')' : 'rgba(10,8,6,.6)';
      g.beginPath();
      g.ellipse(X(41 + hash(i + 30) * 18), Y(32 + hash(i + 60) * 27), u * (1 + hash(i + 2)), u * 0.8, hash(i) - 0.5, 0, WS.TAU);
      g.fill();
    }
    // The scapulars: a cream line each side where the wing meets the back.
    g.strokeStyle = CREAM + '.22)'; g.lineWidth = u * 0.9;
    for (const side of [-1, 1]) {
      g.beginPath(); g.moveTo(X(50 + side * 8), Y(35)); g.quadraticCurveTo(X(50 + side * 9.5), Y(44), X(50 + side * 6.5), Y(53)); g.stroke();
    }
    g.restore();
    // The neck ruff the head sits in.
    g.fillStyle = CHAR;
    g.beginPath(); g.ellipse(X(50), Y(31), X(8.5), Y(5), 0, 0, WS.TAU); g.fill();
  }

  /** The head from above, facing up the tile. The renderer turns it. */
  function head(g, s) {
    const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
    // The crown: round, near black, with cream flecks.
    const cx = X(50), cy = Y(55), rx = X(26), ry = Y(25);
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, WS.TAU);
    const hg = g.createRadialGradient(X(46), Y(47), X(3), cx, cy, X(28));
    hg.addColorStop(0, GREY); hg.addColorStop(0.5, SLATE); hg.addColorStop(1, CHAR);
    g.fillStyle = hg; g.fill();
    g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, WS.TAU); g.clip();
    for (let i = 0; i < 26; i++) {
      const cream = hash(i + 21) > 0.3;
      g.fillStyle = cream ? CREAM + (0.55 + hash(i + 8) * 0.35) + ')' : 'rgba(10,8,6,.6)';
      g.beginPath();
      g.ellipse(X(28 + hash(i + 3) * 44), Y(44 + hash(i + 40) * 34), u * (1.3 + hash(i + 8) * 1.3), u * 1, hash(i) * 2, 0, WS.TAU);
      g.fill();
    }
    g.restore();
    // At the front, the top of a face looking down: the grey facial disc
    // showing as a rim, the eyes under heavy brows, the beak's hook.
    g.beginPath(); g.ellipse(X(50), Y(38), X(22), Y(9.5), 0, Math.PI, WS.TAU);
    g.lineTo(X(72), Y(40)); g.ellipse(X(50), Y(40), X(22), Y(4), 0, 0, Math.PI); g.closePath();
    g.fillStyle = ASH; g.fill();
    for (const side of [-1, 1]) {
      const ex = X(50 + side * 10), ey = Y(36);
      const eg = g.createRadialGradient(ex, ey + u, u * 0.5, ex, ey, X(6.8));
      eg.addColorStop(0, '#ffd27a'); eg.addColorStop(0.55, '#f08a1c'); eg.addColorStop(1, '#9c420c');
      g.beginPath(); g.ellipse(ex, ey, X(6.6), Y(4.6), 0, Math.PI * 0.92, Math.PI * 2.08);
      g.fillStyle = eg; g.fill();
      g.beginPath(); g.ellipse(ex, ey - u * 0.8, X(2.8), Y(2), 0, Math.PI, WS.TAU); g.fillStyle = BLACK; g.fill();
      g.strokeStyle = BLACK; g.lineWidth = u * 2.6;
      g.beginPath(); g.moveTo(ex - side * X(7.5), ey + u * 0.8); g.quadraticCurveTo(ex, ey + Y(5.2), ex + side * X(6.5), ey - u * 0.2); g.stroke();
    }
    // Pale brows meeting over the beak - soft, not a mask.
    g.strokeStyle = 'rgba(233,223,204,.6)'; g.lineWidth = u * 1.3;
    g.beginPath(); g.moveTo(X(39), Y(44)); g.quadraticCurveTo(X(46), Y(41.5), X(50), Y(35)); g.quadraticCurveTo(X(54), Y(41.5), X(61), Y(44)); g.stroke();
    path(g, [[X(47.5), Y(34)], [X(52.5), Y(34)], [X(51), Y(28.5), X(50), Y(27.5)], [X(49), Y(28.5)]]);
    g.fillStyle = '#34302e'; g.fill();
    // Ear tufts: rising from the brow BEHIND the eyes and laid back along the
    // crown by the wind of flight, the way a flying owl carries them - black,
    // broad at the root, cream along the inner edge. Drawn last: they stand
    // up off the head, so they lie over it.
    for (const side of [-1, 1]) {
      const tuft = [[X(50 + side * 8), Y(44)], [X(50 + side * 14), Y(42), X(50 + side * 20), Y(45)],
        [X(50 + side * 24), Y(56), X(50 + side * 25), Y(70)],
        [X(50 + side * 19), Y(61), X(50 + side * 11), Y(52)]];
      path(g, tuft); g.fillStyle = BLACK; g.fill();
      g.strokeStyle = CREAM + '.6)'; g.lineWidth = u * 1.1;
      g.beginPath(); g.moveTo(X(50 + side * 10), Y(48)); g.quadraticCurveTo(X(50 + side * 18), Y(55), X(50 + side * 24), Y(68)); g.stroke();
    }
  }

  /** The crate: planks, iron corners, rope, the Watch's ember on the lid. */
  function crate(g, s) {
    const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
    // The body of the box, three-quarter view: lid on top, face below.
    const lid = [[X(18), Y(34)], [X(50), Y(22)], [X(82), Y(34)], [X(50), Y(46)]];
    const left = [[X(18), Y(34)], [X(50), Y(46)], [X(50), Y(86)], [X(18), Y(72)]];
    const right = [[X(50), Y(46)], [X(82), Y(34)], [X(82), Y(72)], [X(50), Y(86)]];
    const wood = (pts, a, b) => {
      const gr = g.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
      gr.addColorStop(0, a); gr.addColorStop(1, b);
      path(g, pts); g.fillStyle = gr; g.fill();
    };
    wood(lid, '#c89458', '#9a6a38');
    wood(left, '#8a5a30', '#5e3a1c');
    wood(right, '#a8743e', '#6e4526');
    // Plank seams.
    g.strokeStyle = 'rgba(40,24,12,.6)'; g.lineWidth = u * 1.1;
    for (let i = 1; i < 3; i++) {
      const t = i / 3;
      g.beginPath(); g.moveTo(X(18), Y(34 + 38 * t)); g.lineTo(X(50), Y(46 + 40 * t)); g.stroke();
      g.beginPath(); g.moveTo(X(50), Y(46 + 40 * t)); g.lineTo(X(82), Y(34 + 38 * t)); g.stroke();
      g.beginPath(); g.moveTo(X(18 + 32 * t), Y(34 - 12 * t)); g.lineTo(X(50 + 32 * t), Y(46 - 12 * t)); g.stroke();
    }
    // Iron corners and edges.
    g.strokeStyle = '#2c2a28'; g.lineWidth = u * 2.6; g.lineJoin = 'round';
    for (const pts of [lid, left, right]) { path(g, pts); g.stroke(); }
    g.fillStyle = '#6a6660';
    for (const [x, y] of [[18, 34], [50, 46], [82, 34], [18, 72], [50, 86], [82, 72], [50, 22]]) {
      g.beginPath(); g.arc(X(x), Y(y), u * 2.4, 0, WS.TAU); g.fill();
    }
    // Rope, crossed over the lid.
    g.strokeStyle = '#d8c08a'; g.lineWidth = u * 1.8;
    g.beginPath(); g.moveTo(X(34), Y(28)); g.lineTo(X(66), Y(40)); g.moveTo(X(66), Y(28)); g.lineTo(X(34), Y(40)); g.stroke();
    // The Watch's ember, burned into the face.
    const fx = X(66), fy = Y(58);
    const fg = g.createRadialGradient(fx, fy, 0, fx, fy, X(9));
    fg.addColorStop(0, 'rgba(255,214,120,.95)'); fg.addColorStop(0.5, 'rgba(245,150,60,.8)'); fg.addColorStop(1, 'rgba(245,150,60,0)');
    g.fillStyle = fg; g.beginPath(); g.arc(fx, fy, X(9), 0, WS.TAU); g.fill();
    path(g, [[fx, fy - X(7)], [fx + X(4), fy], [fx, fy + X(6)], [fx - X(4), fy]]);
    g.fillStyle = '#fff1c8'; g.fill();
  }

  for (let i = 0; i < FRAMES; i++) {
    WS.Sprites.define('edennil_w' + i, (g, s) => body(g, s, i / FRAMES));
  }
  WS.Sprites.define('edennil_head', (g, s) => head(g, s));
  WS.Sprites.define('supply_crate', (g, s) => crate(g, s));

  WS.EdennilArt = { frames: FRAMES };

})(window.WS);
