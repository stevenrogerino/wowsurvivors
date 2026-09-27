/* Edennil, who brings the Watch its supplies, and the crate Edennil brings.
 *
 * An eagle owl: tawny and dark-mottled, ear tufts up, a pale throat, eyes the
 * colour of a banked fire. Seen from above in flight, because the field is
 * seen from above - body and wings along the heading, the tail fanned, the
 * primaries fingered at the wingtips and barred across - with the head drawn
 * separately and turned to look DOWN at the survivor, which is the one thing
 * an owl can do that no other bird can and the thing that makes it Edennil
 * rather than a bird going past.
 *
 *   edennil_w0 .. edennil_w5   the body and wings, heading up the tile, one
 *                              frame per sixth of a wingbeat
 *   edennil_face               the head, turned to the camera
 *   supply_crate               what it carries: an iron-cornered crate with
 *                              the Watch's ember burned into the lid
 *
 * The parachute is not a sprite: it breathes and sways and collapses, so the
 * renderer draws it (Renderer.drawAirdrops). */
'use strict';
(function (WS) {

  const TAWNY = '#9a6436', DARK = '#3a2414', MID = '#6e4526', BUFF = '#d8b07a', PALE = '#efdcb6';
  const INK = '#1c120a';
  const FRAMES = 6;

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

  /** One feather: a long rounded blade from (x, y) at `ang`, barred. */
  function feather(g, u, x, y, ang, len, wid, bars) {
    g.save();
    g.translate(x * u, y * u); g.rotate(ang);
    const L = len * u, W = wid * u;
    g.beginPath();
    g.moveTo(0, -W * 0.45);
    g.quadraticCurveTo(L * 0.7, -W * 0.62, L, -W * 0.08);
    g.quadraticCurveTo(L * 1.02, W * 0.3, L * 0.86, W * 0.44);
    g.quadraticCurveTo(L * 0.5, W * 0.62, 0, W * 0.45);
    g.closePath();
    const gr = g.createLinearGradient(0, 0, L, 0);
    gr.addColorStop(0, MID); gr.addColorStop(0.55, TAWNY); gr.addColorStop(1, BUFF);
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    g.fillStyle = 'rgba(40,24,12,.55)';
    for (let i = 1; i <= bars; i++) g.fillRect(L * (i / (bars + 1)) - u * 0.8, -W, u * 1.6, W * 2);
    // the shaft
    g.strokeStyle = 'rgba(239,220,182,.45)'; g.lineWidth = u * 0.45;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.92, 0); g.stroke();
    g.restore();
    g.strokeStyle = INK; g.lineWidth = u * 0.7; g.stroke();
    g.restore();
  }

  /** One wing, the left, spread by `k` (about 0.6 .. 1). Built the way a
   *  wing is: the long primaries fanned from the wrist like fingers, a row
   *  of rounded secondaries along the trailing edge, and the coverts laid
   *  over the bases of both. */
  function wing(g, u, k, beat) {
    const X = (x) => x * u, Y = (y) => y * u;
    const wx = 50 - 20 * k, wy = 38 - 2 * beat;   // the wrist
    // Primaries: seven, fanned from the wrist into a broad rounded tip -
    // the forward ones reaching out, the back ones sweeping toward the tail.
    const fan = 0.75 + 0.35 * k;
    for (let i = 6; i >= 0; i--) {
      const t = i / 6;
      const ang = Math.PI - 0.22 + t * fan;
      const len = (25 + 9 * Math.sin(t * Math.PI * 0.85 + 0.25)) * (0.7 + 0.3 * k);
      feather(g, u, wx + t * 5, wy + 1 + t * 8, ang, len, 9.5, 4);
    }
    // Secondaries: deep, along the trailing edge, pointing back.
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x = wx + 4 + t * (45 - wx - 4), y = wy + 4 + t * 4;
      feather(g, u, x, y, Math.PI / 2 + 0.3 - t * 0.28, 19 - t * 4, 8, 3);
    }
    // Coverts: the arm of the wing, over the bases of both.
    const cov = [[X(46), Y(34)], [X(38), Y(28), X(wx - 3), Y(wy - 4)],
      [X(wx - 6), Y(wy + 4), X(wx + 6), Y(wy + 8)], [X(34), Y(50), X(46), Y(49)]];
    const cg = g.createLinearGradient(X(wx), Y(wy - 4), X(44), Y(58));
    cg.addColorStop(0, MID); cg.addColorStop(1, TAWNY);
    path(g, cov); g.fillStyle = cg; g.fill();
    g.save(); path(g, cov); g.clip();
    // Mottling: dark flecks and pale spots, as an eagle owl is.
    for (let i = 0; i < 30; i++) {
      const x = wx - 4 + ((i * 37) % 100) / 100 * (50 - wx), y = wy - 4 + ((i * 53) % 100) / 100 * 13;
      g.fillStyle = i % 3 ? 'rgba(40,24,12,.5)' : 'rgba(239,220,182,.55)';
      g.beginPath(); g.ellipse(X(x), Y(y), u * (0.9 + (i % 2) * 0.6), u * 0.65, 0.3, 0, WS.TAU); g.fill();
    }
    // A pale bar where the coverts end: the line an owl's wing shows in flight.
    g.strokeStyle = 'rgba(239,220,182,.35)'; g.lineWidth = u * 1.4;
    g.beginPath(); g.moveTo(X(wx), Y(wy + 5)); g.quadraticCurveTo(X(36), Y(48), X(46), Y(47)); g.stroke();
    g.restore();
    path(g, cov); g.strokeStyle = INK; g.lineWidth = u * 0.8; g.stroke();
  }

  /** The body and both wings, heading up. `ph` is 0..1 of a wingbeat. */
  function body(g, s, ph) {
    const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
    const beat = Math.sin(ph * WS.TAU);             // +1 top of the stroke
    const k = 0.82 + 0.18 * beat;
    // Tail: a barred fan.
    const tail = [[X(44), Y(64)], [X(40), Y(80), X(45), Y(84)], [X(50), Y(86), X(55), Y(84)], [X(60), Y(80), X(56), Y(64)]];
    path(g, tail); g.fillStyle = TAWNY; g.fill();
    g.save(); path(g, tail); g.clip();
    g.strokeStyle = 'rgba(40,24,12,.6)'; g.lineWidth = u * 1.6;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(X(40), Y(69 + i * 4)); g.lineTo(X(60), Y(69 + i * 4)); g.stroke(); }
    g.restore();
    path(g, tail); g.strokeStyle = INK; g.lineWidth = u * 0.8; g.stroke();
    // Wings, the right one mirrored.
    wing(g, u, k, beat);
    g.save(); g.translate(s, 0); g.scale(-1, 1); wing(g, u, k, beat); g.restore();
    // Body: a heavy teardrop, streaked.
    const bodyPts = [[X(50), Y(26)], [X(62), Y(34), X(60), Y(52)], [X(58), Y(66), X(50), Y(68)], [X(42), Y(66), X(40), Y(52)], [X(38), Y(34), X(50), Y(26)]];
    const bg = g.createLinearGradient(X(40), Y(30), X(60), Y(66));
    bg.addColorStop(0, TAWNY); bg.addColorStop(1, MID);
    path(g, bodyPts); g.fillStyle = bg; g.fill();
    g.save(); path(g, bodyPts); g.clip();
    g.strokeStyle = 'rgba(40,24,12,.65)'; g.lineWidth = u * 1.1;
    for (let i = 0; i < 7; i++) {
      const x = 43 + i * 2.4;
      g.beginPath(); g.moveTo(X(x), Y(36 + (i % 2) * 3)); g.lineTo(X(x + 0.4), Y(46 + (i % 3) * 3)); g.stroke();
    }
    g.fillStyle = 'rgba(239,220,182,.35)';
    g.beginPath(); g.ellipse(X(50), Y(40), X(5), Y(8), 0, 0, WS.TAU); g.fill();
    g.restore();
    path(g, bodyPts); g.strokeStyle = INK; g.lineWidth = u * 0.8; g.stroke();
  }

  /** The head, turned to look down at the field. */
  function face(g, s) {
    const u = s / 100, X = (x) => x * u, Y = (y) => y * u;
    // Ear tufts.
    for (const side of [-1, 1]) {
      path(g, [[X(50 + side * 12), Y(34)], [X(50 + side * 22), Y(14), X(50 + side * 26), Y(8)],
        [X(50 + side * 22), Y(24), X(50 + side * 20), Y(36)]]);
      g.fillStyle = MID; g.fill(); g.strokeStyle = INK; g.lineWidth = u * 1.2; g.stroke();
    }
    // The head.
    g.beginPath(); g.ellipse(X(50), Y(52), X(30), Y(28), 0, 0, WS.TAU);
    const hg = g.createRadialGradient(X(46), Y(44), X(4), X(50), Y(52), X(32));
    hg.addColorStop(0, TAWNY); hg.addColorStop(1, MID);
    g.fillStyle = hg; g.fill();
    g.strokeStyle = INK; g.lineWidth = u * 1.4; g.stroke();
    // Streaks on the crown.
    g.strokeStyle = 'rgba(40,24,12,.6)'; g.lineWidth = u * 1.3;
    for (let i = 0; i < 6; i++) {
      const x = 38 + i * 5;
      g.beginPath(); g.moveTo(X(x), Y(28 + (i % 2) * 2)); g.lineTo(X(x + 1), Y(35)); g.stroke();
    }
    // The facial disc: two buff rounds with a dark rim.
    for (const side of [-1, 1]) {
      g.beginPath(); g.ellipse(X(50 + side * 12), Y(54), X(15), Y(15), 0, 0, WS.TAU);
      g.fillStyle = BUFF; g.fill();
      g.strokeStyle = DARK; g.lineWidth = u * 2.2; g.stroke();
    }
    // A pale brow between the eyes, down to the beak.
    path(g, [[X(44), Y(40)], [X(50), Y(48), X(56), Y(40)], [X(53), Y(58)], [X(47), Y(58)]]);
    g.fillStyle = PALE; g.fill();
    // Eyes: banked fire, huge, with a hard black pupil and a catchlight.
    for (const side of [-1, 1]) {
      const ex = X(50 + side * 12), ey = Y(53);
      const eg = g.createRadialGradient(ex, ey, X(1), ex, ey, X(8.5));
      eg.addColorStop(0, '#ffcf5a'); eg.addColorStop(0.7, '#f08a1c'); eg.addColorStop(1, '#a8480e');
      g.beginPath(); g.arc(ex, ey, X(8.5), 0, WS.TAU); g.fillStyle = eg; g.fill();
      g.strokeStyle = INK; g.lineWidth = u * 1.6; g.stroke();
      g.beginPath(); g.arc(ex, ey, X(4.2), 0, WS.TAU); g.fillStyle = '#0c0704'; g.fill();
      g.beginPath(); g.arc(ex - X(2.4), ey - X(2.6), X(1.6), 0, WS.TAU); g.fillStyle = 'rgba(255,255,255,.9)'; g.fill();
      // A heavy lid, which is where the owl's glare comes from.
      g.beginPath();
      g.moveTo(ex - X(9.5), ey - X(2.5)); g.quadraticCurveTo(ex, ey - X(10 + side * 0), ex + X(9.5), ey - X(2.5 + side * 1.5));
      g.strokeStyle = DARK; g.lineWidth = u * 2.6; g.stroke();
    }
    // Beak: dark, hooked, between the eyes.
    path(g, [[X(47), Y(58)], [X(50), Y(56)], [X(53), Y(58)], [X(51), Y(66), X(50), Y(68)], [X(48), Y(64)]]);
    g.fillStyle = '#2a1e18'; g.fill(); g.strokeStyle = INK; g.lineWidth = u * 0.8; g.stroke();
    // The white throat, under the disc.
    g.beginPath(); g.ellipse(X(50), Y(76), X(12), Y(4.5), 0, 0, WS.TAU);
    g.fillStyle = PALE; g.fill();
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
  WS.Sprites.define('edennil_face', (g, s) => face(g, s));
  WS.Sprites.define('supply_crate', (g, s) => crate(g, s));

  WS.EdennilArt = { frames: FRAMES };

})(window.WS);
