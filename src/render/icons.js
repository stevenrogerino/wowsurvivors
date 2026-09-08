/* Procedural ability icons, drawn to one system.
 *
 * THE SYSTEM - every glyph obeys it, which is what makes sixty of them read as
 * one set rather than sixty drawings:
 *   - a 100x100 field, with all marks inside an optical circle of radius 36
 *     centred at (50,50). Nothing touches the plate edge.
 *   - two stroke weights only: STROKE for the subject, HAIR for detail. Round
 *     caps and joins throughout.
 *   - one density target: a glyph covers roughly a third of its optical circle,
 *     so a stroked icon never looks starved beside a filled one.
 *   - one treatment per glyph. A shape is drawn OR outlined, never a hairline
 *     stapled to a heavy fill.
 *   - a distinct silhouette. Five weapons must not all be a thin vertical.
 *
 * The plate is a chamfered machined tile - an octagon, not a rounded rectangle -
 * with an outer rim, an inner bevel lit from the top, an accent hairline inlaid
 * three units in, and a pool of light behind the subject.
 */
'use strict';
(function (WS) {

  const cache = new Map();

  const R = 36;        // optical radius; no mark may exceed it
  const STROKE = 8;    // the subject
  const HAIR = 4.5;    // detail

  /* ------------------------------------------------------------ drawing -- */
  function line(g, c, w) {
    g.strokeStyle = c; g.lineWidth = w || STROKE;
    g.lineCap = 'round'; g.lineJoin = 'round';
  }
  function path(g, pts, close) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    if (close) g.closePath();
  }
  function shape(g, pts, fillC, strokeC) {
    path(g, pts, true);
    if (fillC) { g.fillStyle = fillC; g.fill(); }
    if (strokeC) { line(g, strokeC, HAIR); g.stroke(); }
  }
  function disc(g, x, y, r, c) {
    g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, WS.TAU); g.fill();
  }
  function circle(g, x, y, r, c, w) {
    line(g, c, w || STROKE); g.beginPath(); g.arc(x, y, r, 0, WS.TAU); g.stroke();
  }
  function arcAt(g, x, y, r, a0, a1, c, w) {
    line(g, c, w || STROKE); g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke();
  }
  /** A leaf-shaped blade: the common silhouette for anything edged. */
  function leafBlade(g, cx, cy, len, wide, rot, fillC, edgeC) {
    g.save();
    g.translate(cx, cy); g.rotate(rot);
    g.beginPath();
    g.moveTo(0, -len);
    g.quadraticCurveTo(wide, -len * 0.15, 0, len);
    g.quadraticCurveTo(-wide, -len * 0.15, 0, -len);
    g.fillStyle = fillC; g.fill();
    if (edgeC) { line(g, edgeC, 2.5); g.stroke(); }
    g.restore();
  }
  /** A tapered spike, for claws, quills and rays. */
  function spike(g, x, y, len, wide, rot, c) {
    g.save(); g.translate(x, y); g.rotate(rot);
    shape(g, [[0, -len], [wide, len * 0.4], [0, len * 0.15], [-wide, len * 0.4]], c);
    g.restore();
  }
  const dim = (c) => c + '66';     // the accent at low alpha, for detail
  const lit = '#ffffff';

  /* ------------------------------------------------------------- glyphs -- */
  const G = {

    /* ---- projectiles and spells ---------------------------------------- */
    missile(g, c) {
      // Three seeking bolts on parallel arcs, thickest in front.
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 13;
        line(g, i === 1 ? c : dim(c), i === 1 ? STROKE : HAIR + 1);
        g.beginPath();
        g.moveTo(18, 62 + off * 0.5);
        g.quadraticCurveTo(48, 34 + off, 80, 46 + off);
        g.stroke();
      }
      disc(g, 80, 46, 6, lit);
    },
    ember(g, c) {
      shape(g, [[50, 14], [66, 40], [62, 56], [50, 86], [38, 56], [34, 40]], c);
      disc(g, 50, 62, 12, lit);
    },
    shard(g, c) {
      shape(g, [[50, 14], [74, 46], [50, 86], [26, 46]], c);
      shape(g, [[50, 14], [50, 86], [26, 46]], lit + '55');
    },
    spark(g, c) {
      line(g, c, STROKE + 1);
      path(g, [[62, 14], [36, 48], [56, 51], [34, 86]]);
      g.stroke();
    },
    ring(g, c) {
      circle(g, 50, 50, 30, c, STROKE);
      circle(g, 50, 50, 17, dim(c), HAIR);
    },
    zone(g, c) {
      // A field seen in perspective, with rot rising from it.
      line(g, c, STROKE);
      g.beginPath(); g.ellipse(50, 62, 32, 17, 0, 0, WS.TAU); g.stroke();
      g.fillStyle = c + '30';
      g.beginPath(); g.ellipse(50, 62, 32, 17, 0, 0, WS.TAU); g.fill();
      line(g, c, HAIR + 1);
      for (const [x, h] of [[32, 30], [50, 22], [68, 32]]) {
        g.beginPath(); g.moveTo(x, 56); g.lineTo(x + (x - 50) * 0.12, h); g.stroke();
      }
    },
    bolt(g, c) {
      leafBlade(g, 50, 50, 34, 22, 0.5, c);
      leafBlade(g, 50, 50, 20, 11, 0.5, lit + '77');
    },
    coil(g, c) {
      // A spiral drawn with even spacing so it reads as a coil, not a scribble.
      line(g, c, STROKE - 1);
      g.beginPath();
      for (let i = 0; i <= 46; i++) {
        const t = i / 46, a = t * WS.TAU * 1.55 - 1.2, r = 9 + t * 26;
        const x = 50 + WS.cos(a) * r, y = 50 + WS.sin(a) * r;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      disc(g, 50 + WS.cos(-1.2) * 9, 50 + WS.sin(-1.2) * 9, 5, lit);
    },
    beam(g, c) {
      const grd = g.createLinearGradient(14, 0, 86, 0);
      grd.addColorStop(0, c + '00'); grd.addColorStop(.5, c); grd.addColorStop(1, lit);
      g.fillStyle = grd;
      shape(g, [[14, 44], [86, 36], [86, 64], [14, 56]], null);
      g.fill();
      g.fillStyle = lit;
      shape(g, [[24, 48], [86, 45], [86, 55], [24, 52]], null);
      g.fill();
    },
    chaos(g, c) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * WS.TAU - 1.2;
        spike(g, 50, 50, 34, 9, a, i % 2 ? c : dim(c));
      }
      disc(g, 50, 50, 11, lit);
    },
    moon(g, c) {
      g.save();
      disc(g, 50, 50, 32, c);
      g.globalCompositeOperation = 'destination-out';
      disc(g, 68, 38, 27, '#000');
      g.restore();
      disc(g, 34, 60, 4, lit);
    },

    /* ---- edged weapons: each gets its own silhouette -------------------- */
    dagger(g) {
      leafBlade(g, 50, 40, 28, 12, 0, '#dfe4ee', '#8b93a7');
      g.fillStyle = '#8a6a45';
      shape(g, [[42, 66], [58, 66], [56, 86], [44, 86]], '#8a6a45');
      shape(g, [[32, 62], [68, 62], [66, 70], [34, 70]], '#b0b7c4');
    },
    sword(g) {
      leafBlade(g, 50, 36, 34, 11, 0, '#e4e9f2', '#8b93a7');
      shape(g, [[44, 68], [56, 68], [54, 88], [46, 88]], '#8a6a45');
      shape(g, [[28, 62], [72, 62], [70, 71], [30, 71]], '#c2c9d6');
      disc(g, 50, 90, 5, '#c2c9d6');
    },
    blade(g, c) {
      // Two crossed slashes: a kill mark, not another vertical.
      for (const s2 of [-1, 1]) {
        g.save();
        g.translate(50, 50); g.rotate(s2 * 0.5);
        const grd = g.createLinearGradient(0, -34, 0, 34);
        grd.addColorStop(0, '#ffffff00');
        grd.addColorStop(.45, '#e9edf6');
        grd.addColorStop(1, '#ffffff00');
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(0, -34); g.quadraticCurveTo(9, 0, 0, 34);
        g.quadraticCurveTo(-9, 0, 0, -34);
        g.fill();
        g.restore();
      }
      disc(g, 50, 50, 6, c || '#e9edf6');
    },
    axe(g) {
      line(g, '#8a6a45', STROKE);
      g.beginPath(); g.moveTo(50, 88); g.lineTo(50, 28); g.stroke();
      g.fillStyle = '#d8dee9';
      g.beginPath();
      g.moveTo(50, 18); g.quadraticCurveTo(84, 26, 76, 54);
      g.quadraticCurveTo(62, 44, 50, 46); g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(50, 18); g.quadraticCurveTo(16, 26, 24, 54);
      g.quadraticCurveTo(38, 44, 50, 46); g.closePath(); g.fill();
      line(g, '#8b93a7', 2.5); g.stroke();
    },
    spear(g) {
      line(g, '#8a6a45', STROKE - 2);
      g.beginPath(); g.moveTo(22, 86); g.lineTo(64, 36); g.stroke();
      leafBlade(g, 73, 25, 22, 11, 0.7, '#e4e9f2', '#8b93a7');
      shape(g, [[54, 44], [70, 38], [72, 46], [58, 52]], '#c2c9d6');   // collar
      // Motion trail, so it reads as a thrown weapon rather than a stick.
      line(g, '#ffffff44', 3);
      g.beginPath(); g.moveTo(16, 78); g.lineTo(34, 58); g.stroke();
      g.beginPath(); g.moveTo(24, 88); g.lineTo(42, 68); g.stroke();
    },
    arrow(g, c) {
      // Three arrows in flight - a volley, which is what the weapon is.
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 17;
        const col = i === 1 ? '#e4e9f2' : '#aeb6c4';
        line(g, '#a97f4a', i === 1 ? HAIR + 1 : HAIR - 0.5);
        g.beginPath();
        g.moveTo(18 + off * 0.5, 74 + off * 0.55);
        g.lineTo(66 + off * 0.5, 30 + off * 0.55);
        g.stroke();
        shape(g, [[78 + off * 0.5, 20 + off * 0.55], [58 + off * 0.5, 26 + off * 0.55],
        [70 + off * 0.5, 38 + off * 0.55]], col);
      }
    },
    shield(g, c) {
      shape(g, [[50, 16], [80, 28], [78, 58], [50, 84], [22, 58], [20, 28]], c || '#e0d3a8', '#00000055');
      line(g, lit + '99', HAIR);
      g.beginPath(); g.moveTo(50, 26); g.lineTo(50, 74); g.stroke();
    },
    aegis(g, c) {
      shape(g, [[50, 16], [80, 28], [78, 58], [50, 84], [22, 58], [20, 28]], c || '#ffdf7a', '#00000055');
      line(g, '#2a2416', HAIR + 1);
      g.beginPath(); g.moveTo(50, 30); g.lineTo(50, 72); g.stroke();
      g.beginPath(); g.moveTo(34, 44); g.lineTo(66, 44); g.stroke();
    },

    /* ---- passives ------------------------------------------------------- */
    fist(g, c) {
      // A struck blow: an impact star behind a closed fist.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * WS.TAU + 0.2;
        spike(g, 50 + WS.cos(a) * 30, 50 + WS.sin(a) * 30, 12, 5, a + WS.PI / 2, dim(c));
      }
      g.fillStyle = c;
      g.beginPath(); g.roundRect(30, 38, 40, 30, 8); g.fill();
      g.beginPath(); g.roundRect(34, 30, 32, 13, 6); g.fill();
      line(g, '#00000066', 2.5);
      for (let i = 1; i < 4; i++) {
        g.beginPath(); g.moveTo(30 + i * 10, 44); g.lineTo(30 + i * 10, 65); g.stroke();
      }
    },
    wing(g, c) {
      /* Five primaries off one shoulder, in alternating tones. Absolute
         coordinates rather than a rotated fan - the fan version swept down and
         left from its pivot, which is easy to get backwards and did, throwing
         the longest primary clean out of the field. Separate filled feathers
         rather than one mass with hairlines scored on it, because at icon size
         the glow washes a hairline out and the wing goes back to being a shell.
      */
      const sx = 22, sy = 28;
      const tips = [[88, 44], [80, 58], [68, 70], [54, 75], [40, 70]];
      tips.forEach(([tx, ty], i) => {
        g.fillStyle = i % 2 ? c : dim(c);
        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo((sx + tx) / 2 + 7, (sy + ty) / 2 - 9, tx, ty);
        g.quadraticCurveTo((sx + tx) / 2 - 5, (sy + ty) / 2 + 7, sx, sy);
        g.closePath();
        g.fill();
      });
      // The shoulder joint, which is what stops five wedges reading as a fan.
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(sx + 2, sy + 2, 9, 7, -0.5, 0, WS.TAU);
      g.fill();
    },

    boot(g, c) {
      // A boot in profile: shaft, instep, and a sole that reads as a sole.
      line(g, dim(c), HAIR);
      for (const y of [34, 48, 62]) {
        g.beginPath(); g.moveTo(10, y); g.lineTo(28, y + 2); g.stroke();
      }
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(36, 18);
      g.lineTo(60, 18);
      g.quadraticCurveTo(62, 46, 66, 58);
      g.quadraticCurveTo(80, 62, 86, 70);
      g.lineTo(86, 76);
      g.lineTo(34, 76);
      g.quadraticCurveTo(32, 44, 36, 18);
      g.fill();
      g.fillStyle = '#00000055';
      g.beginPath(); g.roundRect(32, 76, 56, 8, 2); g.fill();
      g.fillStyle = dim(c);
      g.beginPath(); g.roundRect(34, 22, 28, 7, 3); g.fill();
    },
    magnet(g, c) {
      // The horseshoe with its poles clearly capped, and filings drawn in.
      arcAt(g, 50, 48, 24, WS.PI, 0, c, 16);
      g.fillStyle = c;
      g.fillRect(18, 48, 16, 14); g.fillRect(66, 48, 16, 14);
      // Bright steel poles below the arch, with a dark gap so they separate.
      g.fillStyle = '#0b0d12';
      g.fillRect(16, 61, 20, 4); g.fillRect(64, 61, 20, 4);
      g.fillStyle = '#eef2f8';
      g.beginPath(); g.roundRect(17, 64, 18, 16, 2); g.fill();
      g.beginPath(); g.roundRect(65, 64, 18, 16, 2); g.fill();
      line(g, dim(c), 3.5);
      for (const [x, y] of [[38, 30], [50, 22], [62, 30]]) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (x - 50) * 0.5, y - 10); g.stroke();
      }
    },
    heart(g, c) {
      g.fillStyle = c;
      g.beginPath(); g.moveTo(50, 84);
      g.bezierCurveTo(14, 58, 22, 20, 50, 38);
      g.bezierCurveTo(78, 20, 86, 58, 50, 84);
      g.fill();
      g.fillStyle = lit + '55';
      g.beginPath(); g.ellipse(38, 42, 7, 10, -0.5, 0, WS.TAU); g.fill();
    },
    crosshair(g, c) {
      circle(g, 50, 50, 26, c, HAIR + 1.5);
      line(g, c, STROKE - 1);
      for (const [x1, y1, x2, y2] of [[50, 14, 50, 30], [50, 70, 50, 86], [14, 50, 30, 50], [70, 50, 86, 50]]) {
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
      disc(g, 50, 50, 7, c);
    },
    claw(g, c) {
      // Three hooked talons off a knuckle - curved, so they cannot be mistaken
      // for the straight strokes of Thorns. Absolute coordinates, symmetric
      // about the vertical, all of it well inside the field.
      const T = [[38, 18, 30, 24, 0], [50, 47, 16, 42, 1], [62, 82, 30, 76, 0]];
      for (const [bx, tx, ty, bow, hot] of T) {
        g.fillStyle = hot ? c : dim(c);
        g.beginPath();
        g.moveTo(bx - 6, 78);
        g.quadraticCurveTo(bow - 4, 50, tx, ty);
        g.quadraticCurveTo(bow + 8, 54, bx + 6, 78);
        g.closePath();
        g.fill();
      }
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(50, 79, 22, 9, 0, 0, WS.TAU);
      g.fill();
    },

    expand(g, c) {
      circle(g, 50, 50, 14, c, STROKE - 1);
      circle(g, 50, 50, 26, dim(c), HAIR + 1);
      circle(g, 50, 50, 36, dim(c), 2.5);
    },
    triple(g, c) {
      for (const dx of [-23, 0, 23]) leafBlade(g, 50 + dx, 50, 26, 10, 0, dx ? dim(c) : c);
      disc(g, 50, 26, 5, lit);
    },
    coin(g, c) {
      disc(g, 50, 50, 30, c || '#ffd35c');
      circle(g, 50, 50, 30, '#00000055', 3);
      circle(g, 50, 50, 22, '#00000033', 2.5);
      g.fillStyle = '#7a5a1c';
      g.font = 'bold 30px Archivo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('G', 50, 52);
    },
    book(g, c) {
      shape(g, [[18, 26], [50, 34], [50, 80], [18, 72]], '#c8b48c');
      shape(g, [[82, 26], [50, 34], [50, 80], [82, 72]], '#b3a07c');
      line(g, c, HAIR);
      g.beginPath(); g.moveTo(50, 34); g.lineTo(50, 80); g.stroke();
      line(g, '#8a7450', 2.5);
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.moveTo(26, 44 + i * 10); g.lineTo(43, 47 + i * 10); g.stroke();
        g.beginPath(); g.moveTo(57, 47 + i * 10); g.lineTo(74, 44 + i * 10); g.stroke();
      }
    },
    leaf(g, c) {
      g.fillStyle = c || '#5fcf6a';
      g.beginPath();
      g.moveTo(22, 80); g.quadraticCurveTo(24, 24, 78, 20);
      g.quadraticCurveTo(78, 74, 22, 80); g.fill();
      line(g, '#00000055', HAIR);
      g.beginPath(); g.moveTo(22, 80); g.quadraticCurveTo(52, 56, 76, 24); g.stroke();
    },
    skull(g, c) {
      g.fillStyle = c || '#cfd5e0';
      g.beginPath(); g.arc(50, 46, 28, WS.PI, 0); g.lineTo(76, 62); g.lineTo(24, 62); g.closePath(); g.fill();
      g.beginPath(); g.roundRect(34, 62, 32, 20, 4); g.fill();
      g.fillStyle = '#12141a';
      g.beginPath(); g.ellipse(39, 46, 8, 10, 0, 0, WS.TAU); g.fill();
      g.beginPath(); g.ellipse(61, 46, 8, 10, 0, 0, WS.TAU); g.fill();
      g.fillRect(46, 64, 8, 13);
      line(g, '#12141a', 2);
      g.beginPath(); g.moveTo(40, 64); g.lineTo(40, 77); g.stroke();
      g.beginPath(); g.moveTo(60, 64); g.lineTo(60, 77); g.stroke();
    },
    frostaura(g, c) {
      const col = c || '#7fd4ff';
      for (let i = 0; i < 6; i++) {
        g.save(); g.translate(50, 50); g.rotate((i / 6) * WS.TAU);
        line(g, col, HAIR + 1.5);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -34); g.stroke();
        line(g, col, HAIR - 1);
        g.beginPath(); g.moveTo(0, -20); g.lineTo(-9, -29); g.stroke();
        g.beginPath(); g.moveTo(0, -20); g.lineTo(9, -29); g.stroke();
        g.restore();
      }
      disc(g, 50, 50, 6, lit);
    },
    spiritwolf(g, c) {
      const col = c || '#7fd4ff';
      g.fillStyle = col;
      g.beginPath(); g.ellipse(56, 58, 24, 15, -0.1, 0, WS.TAU); g.fill();
      g.beginPath(); g.ellipse(28, 42, 15, 13, 0, 0, WS.TAU); g.fill();
      shape(g, [[18, 32], [16, 14], [30, 30]], col);
      shape(g, [[34, 30], [40, 13], [45, 31]], col);
      shape(g, [[76, 48], [92, 28], [80, 62]], col);
      shape(g, [[14, 44], [4, 47], [16, 52]], col);
      disc(g, 24, 40, 4, '#0b0d12');
      line(g, col, HAIR + 1);
      for (const dx of [-6, 10, 22]) {
        g.beginPath(); g.moveTo(50 + dx, 70); g.lineTo(50 + dx, 84); g.stroke();
      }
    },
    risen(g, c) {
      const col = c || '#9fd66b';
      g.fillStyle = col;
      g.beginPath(); g.ellipse(50, 34, 17, 19, 0, 0, WS.TAU); g.fill();
      g.fillStyle = '#12141a';
      disc(g, 43, 32, 4, '#12141a'); disc(g, 57, 32, 4, '#12141a');
      line(g, col, STROKE - 1);
      g.beginPath(); g.moveTo(50, 52); g.lineTo(50, 74); g.stroke();
      g.beginPath(); g.moveTo(50, 58); g.lineTo(28, 68); g.stroke();
      g.beginPath(); g.moveTo(50, 58); g.lineTo(72, 68); g.stroke();
      g.beginPath(); g.moveTo(50, 74); g.lineTo(38, 88); g.stroke();
      g.beginPath(); g.moveTo(50, 74); g.lineTo(62, 88); g.stroke();
    },
    command(g, c) {
      // A hand of command: three thralls bound to one point.
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * WS.TAU - WS.PI / 2;
        const x = 50 + WS.cos(a) * 28, y = 50 + WS.sin(a) * 28;
        line(g, dim(c), 3.5);
        g.beginPath(); g.moveTo(50, 50); g.lineTo(x, y); g.stroke();
        disc(g, x, y, 10, c);
        disc(g, x, y, 4.5, '#0b0d12');
      }
      disc(g, 50, 50, 12, c);
      disc(g, 50, 50, 6, lit);
    },
    thorn(g, c) {
      // A bramble ring: barbs facing outward, which is exactly what the passive
      // does, and a silhouette nothing else in the set shares.
      const col = c || '#6fbf5a';
      circle(g, 50, 50, 22, col, HAIR + 2);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * WS.TAU + 0.3;
        spike(g, 50 + WS.cos(a) * 28, 50 + WS.sin(a) * 28, 14, 5.5, a + WS.PI / 2, col);
      }
      disc(g, 50, 50, 6, dim(col));
    },
    desecrate(g, c) {
      g.fillStyle = '#5a1f7a';
      g.beginPath(); g.ellipse(50, 64, 34, 18, 0, 0, WS.TAU); g.fill();
      g.fillStyle = c || '#8cf24a';
      g.beginPath(); g.ellipse(50, 64, 20, 10, 0, 0, WS.TAU); g.fill();
      line(g, '#c77dff', HAIR + 1);
      for (const [dx, h] of [[-20, 30], [0, 22], [20, 32]]) {
        g.beginPath(); g.moveTo(50 + dx, 56); g.lineTo(50 + dx * 0.75, h); g.stroke();
      }
    },
    soulrend(g, c) {
      const col = c || '#8cf24a';
      // A torn ring: two arcs pulled apart, with the tear lit between them.
      arcAt(g, 50, 50, 28, -1.05, 1.35, col, STROKE);
      arcAt(g, 50, 50, 28, 1.85, -1.55, col, STROKE);
      line(g, lit, HAIR - 1);
      g.beginPath(); g.moveTo(70, 34); g.lineTo(60, 50); g.lineTo(72, 62); g.stroke();
      disc(g, 50, 50, 6, col);
    },
    retaura(g, c) {
      const col = c || '#ffdf7a';
      circle(g, 50, 50, 24, col, HAIR + 1);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * WS.TAU;
        spike(g, 50 + WS.cos(a) * 32, 50 + WS.sin(a) * 32, 10, 4.5, a + WS.PI / 2, col);
      }
      disc(g, 50, 50, 11, col);
    },
    feint(g, c) {
      // A figure stepping clear of its own after-image: two humanoid marks,
      // one ghosted, which reads as a dodge and not as two leaves.
      const figure = (x, alpha) => {
        g.save();
        g.globalAlpha = alpha;
        g.fillStyle = c;
        disc(g, x, 28, 10, c);
        g.beginPath();
        g.moveTo(x - 12, 44);
        g.quadraticCurveTo(x, 38, x + 12, 44);
        g.lineTo(x + 9, 72);
        g.lineTo(x - 9, 72);
        g.fill();
        g.beginPath(); g.roundRect(x - 9, 70, 7, 18, 3); g.fill();
        g.beginPath(); g.roundRect(x + 2, 70, 7, 18, 3); g.fill();
        g.restore();
      };
      figure(33, 0.28);
      figure(62, 1);
    },

    /* ---- meta ----------------------------------------------------------- */
    clover(g, c) {
      const col = c || '#4fd67a';
      // Heart-shaped leaves with a notch, so it is a clover and not four dots.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * WS.TAU + WS.PI / 4;
        g.save();
        g.translate(50 + WS.cos(a) * 15, 44 + WS.sin(a) * 15);
        g.rotate(a + WS.PI / 2);
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, 15);
        g.bezierCurveTo(-17, 2, -9, -14, 0, -4);
        g.bezierCurveTo(9, -14, 17, 2, 0, 15);
        g.fill();
        g.restore();
      }
      line(g, '#2f7a45', HAIR);
      g.beginPath(); g.moveTo(50, 58); g.quadraticCurveTo(61, 74, 46, 86); g.stroke();
    },
    reroll(g, c) {
      arcAt(g, 50, 52, 27, 0.55, WS.TAU - 0.25, c, STROKE - 1);
      shape(g, [[76, 18], [86, 44], [58, 40]], c);
    },
    banish(g, c) {
      circle(g, 50, 50, 27, c, STROKE - 1);
      line(g, c, STROKE - 1);
      g.beginPath(); g.moveTo(31, 31); g.lineTo(69, 69); g.stroke();
    },
    hourglass(g, c) {
      const col = c || '#7fd4ff';
      g.fillStyle = '#b98f4c';
      g.beginPath(); g.roundRect(24, 14, 52, 8, 2); g.fill();
      g.beginPath(); g.roundRect(24, 78, 52, 8, 2); g.fill();
      shape(g, [[31, 22], [69, 22], [53, 50], [69, 78], [31, 78], [47, 50]], col);
      disc(g, 50, 50, 3.5, lit);
    },
    ankh(g, c) {
      const col = c || '#ffd35c';
      circle(g, 50, 32, 15, col, STROKE);
      line(g, col, STROKE);
      g.beginPath(); g.moveTo(50, 47); g.lineTo(50, 86); g.stroke();
      g.beginPath(); g.moveTo(29, 58); g.lineTo(71, 58); g.stroke();
    },
    egg(g, c) {
      g.fillStyle = c || '#f0e6cf';
      g.beginPath(); g.ellipse(50, 54, 25, 32, 0, 0, WS.TAU); g.fill();
      line(g, '#00000044', 3); g.stroke();
      g.fillStyle = lit + '77';
      g.beginPath(); g.ellipse(41, 40, 7, 11, -0.4, 0, WS.TAU); g.fill();
    },

    /* ---- blessings ------------------------------------------------------ */
    crown(g, c) {
      shape(g, [[18, 74], [24, 32], [37, 52], [50, 22], [63, 52], [76, 32], [82, 74]],
        c || '#ffd35c', '#00000055');
      g.fillStyle = '#00000044'; g.fillRect(20, 74, 60, 8);
      disc(g, 50, 40, 5, lit);
    },
    drain(g, c) {
      const col = c || '#c94f8a';
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(50, 16); g.quadraticCurveTo(78, 52, 68, 70);
      g.quadraticCurveTo(50, 92, 32, 70);
      g.quadraticCurveTo(22, 52, 50, 16); g.fill();
      line(g, lit + '99', HAIR);
      g.beginPath(); g.arc(41, 62, 10, 0.5, 2.7); g.stroke();
    },
    flame(g, c) { G.ember(g, c || '#ff8a3c'); },
    arcane(g, c) {
      const col = c || '#8f7bff';
      for (let i = 0; i < 3; i++) {
        g.save(); g.translate(50, 50); g.rotate((i / 3) * WS.PI);
        line(g, i === 0 ? col : dim(col), HAIR + 1);
        g.beginPath(); g.ellipse(0, 0, 34, 13, 0, 0, WS.TAU); g.stroke();
        g.restore();
      }
      disc(g, 50, 50, 10, lit);
    },

    /* ---- world objects and achievements --------------------------------- */
    candle(g, c) {
      g.fillStyle = '#e8dfc8';
      g.beginPath(); g.roundRect(38, 44, 24, 42, 3); g.fill();
      g.fillStyle = '#00000033'; g.fillRect(38, 44, 24, 5);
      g.fillStyle = c || '#ffd166';
      g.beginPath(); g.moveTo(50, 14); g.quadraticCurveTo(66, 32, 50, 44);
      g.quadraticCurveTo(34, 32, 50, 14); g.fill();
      disc(g, 50, 34, 6, lit);
    },
    mask(g, c) {
      // A bandit's kerchief: a knotted band across the face, not a domino.
      g.fillStyle = c || '#c33b3b';
      g.beginPath();
      g.moveTo(14, 38); g.quadraticCurveTo(50, 26, 86, 38);
      g.quadraticCurveTo(84, 58, 50, 70);
      g.quadraticCurveTo(16, 58, 14, 38); g.fill();
      shape(g, [[14, 38], [4, 30], [8, 52], [16, 52]], c || '#c33b3b');
      g.fillStyle = '#00000055';
      g.beginPath();
      g.moveTo(14, 38); g.quadraticCurveTo(50, 48, 86, 38);
      g.quadraticCurveTo(84, 46, 50, 56);
      g.quadraticCurveTo(16, 46, 14, 38); g.fill();
      disc(g, 37, 42, 5, '#12141a');
      disc(g, 63, 42, 5, '#12141a');
    },
    deadtree(g, c) {
      const col = c || '#7a7080';
      line(g, col, STROKE);
      g.beginPath(); g.moveTo(50, 88); g.lineTo(50, 42); g.stroke();
      line(g, col, HAIR + 1);
      for (const [x, y] of [[24, 26], [76, 20], [32, 14], [70, 42]]) {
        g.beginPath(); g.moveTo(50, 52); g.lineTo(x, y); g.stroke();
      }
      line(g, col, HAIR - 1);
      g.beginPath(); g.moveTo(38, 66); g.lineTo(26, 56); g.stroke();
      g.beginPath(); g.moveTo(62, 62); g.lineTo(74, 54); g.stroke();
    },
    sun(g, c) {
      const col = c || '#ffdf7a';
      disc(g, 50, 50, 19, col);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * WS.TAU;
        spike(g, 50 + WS.cos(a) * 30, 50 + WS.sin(a) * 30, 11, 5, a + WS.PI / 2, col);
      }
    },
    crystal(g, c) {
      shape(g, [[50, 14], [74, 44], [50, 86], [26, 44]], c || '#7fd4ff', lit + '99');
      shape(g, [[50, 14], [50, 86], [26, 44]], lit + '44');
    },
    gilkin(g, c) {
      const col = c || '#5fd68a';
      g.fillStyle = col;
      g.beginPath(); g.ellipse(50, 54, 25, 29, 0, 0, WS.TAU); g.fill();
      shape(g, [[27, 40], [8, 22], [29, 54]], col);
      shape(g, [[73, 40], [92, 22], [71, 54]], col);
      g.fillStyle = '#0e1218';
      g.beginPath(); g.ellipse(50, 68, 15, 8, 0, 0, WS.PI); g.fill();
      disc(g, 39, 44, 8, '#eaffd8'); disc(g, 61, 44, 8, '#eaffd8');
      disc(g, 39, 44, 3.5, '#12141a'); disc(g, 61, 44, 3.5, '#12141a');
    },
    anvil(g, c) {
      shape(g, [[16, 34], [84, 34], [68, 52], [60, 52], [62, 70], [76, 84],
      [24, 84], [38, 70], [40, 52], [32, 52]], c || '#8b93a7');
      g.fillStyle = '#00000033'; g.fillRect(24, 78, 52, 6);
    },
    grave(g, c) {
      g.fillStyle = c || '#8b93a7';
      g.beginPath();
      g.moveTo(26, 86); g.lineTo(26, 42); g.arc(50, 42, 24, WS.PI, 0);
      g.lineTo(74, 86); g.closePath(); g.fill();
      line(g, '#2b303a', STROKE - 2);
      g.beginPath(); g.moveTo(50, 34); g.lineTo(50, 70); g.stroke();
      g.beginPath(); g.moveTo(34, 48); g.lineTo(66, 48); g.stroke();
    },
    sovereign(g, c) {
      const col = c || '#ffe6ae';
      disc(g, 50, 50, 25, '#150e28');
      circle(g, 50, 50, 25, col, HAIR + 1);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * WS.TAU;
        spike(g, 50 + WS.cos(a) * 32, 50 + WS.sin(a) * 32, 10, 4, a + WS.PI / 2, col);
      }
      disc(g, 50, 50, 7, col);
    },
    wheat(g, c) {
      const col = c || '#c9a94c';
      for (const dx of [-19, 0, 19]) {
        line(g, '#8f7a3c', HAIR - 1);
        g.beginPath(); g.moveTo(50 + dx, 88); g.quadraticCurveTo(50 + dx + 7, 58, 50 + dx, 30); g.stroke();
        leafBlade(g, 50 + dx, 30, 16, 8, 0, col);
      }
    },

    /* ---- pickups -------------------------------------------------------- */
    potion(g, c) {
      g.fillStyle = '#8a8f9c';
      g.beginPath(); g.roundRect(41, 12, 18, 12, 2); g.fill();
      g.fillStyle = c || '#e2483d';
      g.beginPath();
      g.moveTo(40, 24); g.lineTo(60, 24); g.lineTo(74, 58);
      g.quadraticCurveTo(74, 88, 50, 88);
      g.quadraticCurveTo(26, 88, 26, 58); g.closePath(); g.fill();
      g.fillStyle = lit + '66';
      g.beginPath(); g.ellipse(38, 58, 5, 13, -0.3, 0, WS.TAU); g.fill();
    },
    chest(g, c) {
      g.fillStyle = '#6b4a2c';
      g.beginPath(); g.roundRect(18, 46, 64, 36, 3); g.fill();
      g.fillStyle = '#8a6238';
      g.beginPath(); g.moveTo(18, 46); g.arc(50, 46, 32, WS.PI, 0); g.closePath(); g.fill();
      g.fillStyle = c || '#f5c56b';
      g.fillRect(18, 42, 64, 7); g.fillRect(44, 42, 12, 26);
      disc(g, 50, 60, 5, '#2b2f36');
    },
    bomb(g, c) {
      disc(g, 47, 62, 26, '#2b2f36');
      disc(g, 40, 54, 8, '#4a505c');
      line(g, '#8a6238', HAIR + 1);
      g.beginPath(); g.moveTo(62, 42); g.quadraticCurveTo(78, 28, 70, 14); g.stroke();
      disc(g, 70, 12, 7, c || '#ffd166');
      disc(g, 70, 12, 3, lit);
    },
    stone(g, c) {
      const col = c || '#59bfff';
      shape(g, [[50, 18], [74, 42], [66, 80], [34, 80], [26, 42]], col, lit + '77');
      circle(g, 50, 52, 32, col, 2.5);
    },
    cache(g, c) {
      g.fillStyle = '#7a5f3a';
      g.beginPath(); g.roundRect(20, 26, 60, 58, 3); g.fill();
      line(g, '#4a3a24', HAIR);
      g.strokeRect(20, 26, 60, 58);
      g.beginPath(); g.moveTo(20, 26); g.lineTo(80, 84); g.stroke();
      g.beginPath(); g.moveTo(80, 26); g.lineTo(20, 84); g.stroke();
      g.fillStyle = c || '#f5c56b'; g.fillRect(20, 20, 60, 8);
    },
    coffin(g, c) {
      shape(g, [[50, 12], [74, 36], [64, 88], [36, 88], [26, 36]], '#5a5f6b');
      line(g, c || '#d8dce6', STROKE - 2);
      g.beginPath(); g.moveTo(50, 30); g.lineTo(50, 66); g.stroke();
      g.beginPath(); g.moveTo(35, 44); g.lineTo(65, 44); g.stroke();
    },
    graveblade(g, c) {
      leafBlade(g, 50, 40, 32, 11, 0, '#cfd8e6', '#5f6878');
      shape(g, [[44, 70], [56, 70], [54, 88], [46, 88]], '#3a2020');
      shape(g, [[31, 64], [69, 64], [67, 72], [33, 72]], '#b0b7c4');
      line(g, c || '#e2483d', 3);
      g.beginPath(); g.moveTo(50, 22); g.lineTo(50, 58); g.stroke();
    },
    twinglaive(g, c) {
      const col = c || '#8cf24a';
      arcAt(g, 50, 50, 30, -1.0, 1.5, col, STROKE);
      arcAt(g, 50, 50, 17, 1.5, -1.0, col, STROKE - 2);
      g.fillStyle = '#2b2f36';
      g.beginPath(); g.roundRect(44, 40, 12, 24, 3); g.fill();
    },
    merchant(g, c) {
      g.fillStyle = '#7a5f3a';
      g.beginPath(); g.roundRect(20, 46, 60, 38, 2); g.fill();
      shape(g, [[12, 46], [50, 22], [88, 46]], c || '#f5c56b');
      g.fillStyle = '#e8dfc8';
      g.beginPath(); g.ellipse(50, 66, 13, 16, 0, 0, WS.TAU); g.fill();
      line(g, '#b6a680', 2.5); g.stroke();
    },

    /* ---- fallback -------------------------------------------------------- */
    rune(g, c) {
      line(g, c, STROKE);
      path(g, [[32, 20], [32, 80], [68, 50], [68, 20]]);
      g.stroke();
      disc(g, 68, 80, 5, c);
    },
  };

  /* --------------------------------------------------------------- plate -- */
  /** A chamfered machined tile. Eight sides, not a rounded rectangle: an outer
   *  rim, a bevel lit from the top, an accent hairline inlaid three units in,
   *  and a pool of light for the subject to sit in. */
  function chamfer(g, s, inset, cut) {
    const a = inset, b = s - inset, k = cut;
    g.beginPath();
    g.moveTo(a + k, a);
    g.lineTo(b - k, a);
    g.lineTo(b, a + k);
    g.lineTo(b, b - k);
    g.lineTo(b - k, b);
    g.lineTo(a + k, b);
    g.lineTo(a, b - k);
    g.lineTo(a, a + k);
    g.closePath();
  }

  function plate(g, s, accent) {
    const cut = s * 0.17;

    // Body: a vertical gradient, darker at the foot.
    const body = g.createLinearGradient(0, 0, 0, s);
    body.addColorStop(0, '#1b212e');
    body.addColorStop(0.55, '#10141c');
    body.addColorStop(1, '#080a0f');
    chamfer(g, s, 0.5, cut);
    g.fillStyle = body;
    g.fill();

    // A pool of light behind the subject, in the accent.
    g.save();
    chamfer(g, s, 0.5, cut);
    g.clip();
    const pool = g.createRadialGradient(s * 0.5, s * 0.42, 0, s * 0.5, s * 0.42, s * 0.62);
    pool.addColorStop(0, accent + '26');
    pool.addColorStop(1, accent + '00');
    g.fillStyle = pool;
    g.fillRect(0, 0, s, s);
    g.restore();

    // Bevel: a light inner edge along the top, dark along the foot.
    g.save();
    chamfer(g, s, 0.5, cut);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 2;
    chamfer(g, s, 1.5, cut);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.lineWidth = 2;
    g.save();
    g.translate(0, 2);
    chamfer(g, s, 1.5, cut);
    g.stroke();
    g.restore();
    g.restore();

    // The rim, and the accent hairline inlaid inside it.
    chamfer(g, s, 0.5, cut);
    g.strokeStyle = 'rgba(255,255,255,.13)';
    g.lineWidth = 1;
    g.stroke();

    // Below 40px the inlay and the arc would collapse into each other, so the
    // plate keeps only its rim and bevel at pip sizes.
    if (s >= 40) {
      g.save();
      g.globalAlpha = 0.42;
      chamfer(g, s, s * 0.075, cut * 0.72);
      g.strokeStyle = accent;
      g.lineWidth = 1;
      g.stroke();
      g.restore();
    }

    /* No ring, no arc.
     *
     * This carried a short bright arc over the top-left chamfer, which read as
     * a stray mark: it traced a circle the octagonal plate does not have, and
     * a partial arc is already the HUD's word for a quantity - the health and
     * experience gauges and the weapon cooldowns are each a faint full ring
     * with a bright arc riding it, where the arc means how much. A fragment on
     * a static icon was decoration impersonating information.
     *
     * Closing it into a full ring fixed the stray-mark half and broke
     * something else: on any glyph that is itself circular it stacked into
     * concentric rings and the icon stopped reading at a glance.
     *
     * So the plate carries no circle at all. It has a chamfered rim, a bevel,
     * an accent inlay and a pool of light, which is enough to seat a subject -
     * and the ring stays where it earns its keep, on the gauges that are
     * actually measuring something. A motif spent everywhere is not a motif.
     */
  }

  /* ----------------------------------------------------------------- API -- */
  const SS = 2;    // rasterise at 2x and draw down

  function render(size, accent, art, withPlate) {
    const res = size * SS;
    const c = document.createElement('canvas');
    c.width = res; c.height = res;
    const g = c.getContext('2d');
    g.scale(SS, SS);
    if (withPlate) plate(g, size, accent);
    g.save();
    // Every glyph draws in the same 100-unit field, inset so the optical circle
    // clears the plate's inlay.
    const inset = withPlate ? size * 0.15 : size * 0.06;
    g.translate(inset, inset);
    g.scale((size - inset * 2) / 100, (size - inset * 2) / 100);
    g.save();
    g.shadowColor = accent;
    g.shadowBlur = withPlate ? 9 : 12;
    (G[art] || G.rune)(g, accent);
    g.restore();
    g.restore();
    c.displaySize = size;
    return c;
  }

  WS.Icons = {
    /** Cached icon on its plate. `art` is a glyph name, `color` an [r,g,b]. */
    get(art, color, size) {
      size = WS.round(size || 64);
      const accent = WS.hex(color || WS.CONST.COLORS.arc);
      const key = `i:${art}:${accent}:${size}`;
      let c = cache.get(key);
      if (c) return c;
      c = render(size, accent, art, true);
      cache.set(key, c);
      return c;
    },

    /** The bare glyph with no plate, for world-space objects: a coin lying in
     *  the grass should not look like a UI tile. */
    glyph(art, color, size) {
      size = WS.round(size || 32);
      const accent = WS.hex(color || WS.CONST.COLORS.arc);
      const key = `w:${art}:${accent}:${size}`;
      let c = cache.get(key);
      if (c) return c;
      c = render(size, accent, art, false);
      cache.set(key, c);
      return c;
    },

    /** Data URL for CSS/img elements (the DOM-side UI). */
    url(art, color, size) { return this.get(art, color, size).toDataURL(); },

    has(art) { return !!G[art]; },
    names() { return Object.keys(G); },
  };

})(window.WS);
