/* THE ARSENAL, AS OBJECTS.
 *
 * Every bolt in the game was a white shape in a coloured glow: a white
 * diamond for a mote, a white hexagon for an icicle, a white kite for a
 * burning coal. The glow said which school, the silhouette said which
 * weapon, and nothing said what the thing was MADE of - so a Cinderfall
 * read as a lit envelope and a Judgement Disc as a white dot. Photographed
 * up close, the only difference between the arsenal and a sheet of stickers
 * was the halo.
 *
 * So each one is painted here as a material: a coal with a crust and cracks
 * of fire in it, a cut crystal with a lit face and a shadowed one, steel
 * with a bevel and a leather grip, a gilded disc with an engraved rim. The
 * silhouettes are the ones the renderer always drew - boltPath lives here
 * now so there is one copy of each - and every stroke stays inside them, so
 * nothing about where a shot is or what it hits has moved.
 *
 * They are CACHED. A shape was a path, a fill, a clip, a second path and a
 * stroke for every bolt on every frame; a painted bolt is one drawImage of
 * a canvas made once per shape, colour and size. The detail is paid for
 * once, and a busy frame gets cheaper rather than dearer. */
(function () {
  'use strict';

  const SA = {};
  const TAU = Math.PI * 2;
  // Painted at twice the size they are drawn, so a 2x display stays sharp.
  const Q = 2;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const rgba = (c, a) => `rgba(${Math.round(clamp01(c[0]) * 255)},${Math.round(clamp01(c[1]) * 255)},${Math.round(clamp01(c[2]) * 255)},${a === undefined ? 1 : a})`;
  // Towards white, and towards black - the two directions a material has.
  const lift = (c, t) => [c[0] + (1 - c[0]) * t, c[1] + (1 - c[1]) * t, c[2] + (1 - c[2]) * t];
  const sink = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const keyOf = (c) => ((Math.round(clamp01(c[0]) * 63) << 12) | (Math.round(clamp01(c[1]) * 63) << 6) | Math.round(clamp01(c[2]) * 63));

  /* --------------------------------------------------------------- shapes */
  /* The silhouettes, unchanged from the renderer's boltPath: the same
     points, so a painted bolt covers exactly the pixels a white one did. */
  SA.path = function (ctx, art, r) {
    switch (art) {
      case 'dagger':
        ctx.beginPath();
        ctx.moveTo(r * 1.9, 0);
        ctx.lineTo(r * 0.32, -r * 0.42); ctx.lineTo(r * 0.14, -r * 0.16);
        ctx.lineTo(-r * 0.95, -r * 0.20); ctx.lineTo(-r * 0.95, r * 0.20);
        ctx.lineTo(r * 0.14, r * 0.16); ctx.lineTo(r * 0.32, r * 0.42);
        ctx.closePath();
        break;
      case 'arrow':
        ctx.beginPath();
        ctx.moveTo(r * 1.9, 0);
        ctx.lineTo(r * 0.7, -r * 0.55); ctx.lineTo(r * 0.7, -r * 0.16);
        ctx.lineTo(-r * 1.6, -r * 0.16); ctx.lineTo(-r * 1.6, r * 0.16);
        ctx.lineTo(r * 0.7, r * 0.16); ctx.lineTo(r * 0.7, r * 0.55);
        ctx.closePath();
        break;
      case 'axe':
      case 'sword':
        ctx.beginPath();
        ctx.moveTo(r * 1.7, 0); ctx.lineTo(0, -r * 0.75);
        ctx.lineTo(-r * 1.2, 0); ctx.lineTo(0, r * 0.75);
        ctx.closePath();
        break;
      case 'shield':
        ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, TAU);
        break;
      case 'missile':
        ctx.beginPath();
        ctx.moveTo(r * 1.6, 0); ctx.lineTo(r * 0.15, -r * 0.85);
        ctx.lineTo(-r * 0.9, 0); ctx.lineTo(r * 0.15, r * 0.85);
        ctx.closePath();
        break;
      case 'ember':
        ctx.beginPath();
        ctx.moveTo(r * 1.5, 0); ctx.lineTo(r * 0.7, -r * 0.95);
        ctx.lineTo(-r * 0.55, -r * 0.8); ctx.lineTo(-r * 1.35, -r * 0.15);
        ctx.lineTo(-r * 0.85, r * 0.9); ctx.lineTo(r * 0.5, r * 0.75);
        ctx.closePath();
        break;
      case 'shard':
        ctx.beginPath();
        ctx.moveTo(r * 2.1, 0); ctx.lineTo(r * 0.5, -r * 0.5);
        ctx.lineTo(-r * 1.1, -r * 0.34); ctx.lineTo(-r * 1.5, 0);
        ctx.lineTo(-r * 1.1, r * 0.34); ctx.lineTo(r * 0.5, r * 0.5);
        ctx.closePath();
        break;
      case 'coil':
        ctx.beginPath();
        ctx.moveTo(r * 1.5, -r * 0.1);
        ctx.quadraticCurveTo(r * 0.2, -r * 1.25, -r * 1.15, -r * 0.55);
        ctx.quadraticCurveTo(-r * 1.95, -r * 0.15, -r * 1.5, r * 0.5);
        ctx.quadraticCurveTo(-r * 1.2, r * 0.15, -r * 0.75, r * 0.05);
        ctx.quadraticCurveTo(-r * 0.15, -r * 0.25, r * 0.75, r * 0.25);
        ctx.closePath();
        break;
      case 'bolt':
        ctx.beginPath();
        ctx.moveTo(r * 1.9, 0); ctx.lineTo(r * 0.3, -r * 0.5);
        ctx.lineTo(-r * 0.5, -r * 0.15); ctx.lineTo(-r * 1.6, -r * 0.6);
        ctx.lineTo(-r * 0.9, r * 0.02); ctx.lineTo(-r * 1.5, r * 0.55);
        ctx.lineTo(-r * 0.1, r * 0.12); ctx.lineTo(r * 0.5, r * 0.55);
        ctx.closePath();
        break;
      case 'moon':
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.05, 0.6, -0.6, true);
        ctx.arc(r * 0.55, 0, r * 0.92, -2.5, 2.5, false);
        break;
      case 'chaos':
        ctx.beginPath();
        ctx.moveTo(r * 2.0, 0); ctx.lineTo(r * 0.5, -r * 0.4);
        ctx.lineTo(r * 0.7, -r * 1.1); ctx.lineTo(-r * 0.2, -r * 0.5);
        ctx.lineTo(-r * 1.0, -r * 0.9); ctx.lineTo(-r * 0.9, -r * 0.05);
        ctx.lineTo(-r * 1.6, r * 0.25); ctx.lineTo(-r * 0.7, r * 0.35);
        ctx.lineTo(-r * 0.85, r * 1.0); ctx.lineTo(r * 0.1, r * 0.4);
        ctx.lineTo(r * 0.5, r * 0.75);
        ctx.closePath();
        break;
      case 'herd':
        /* A spirit bull from above, head down: the barrel of the body, the
           hump at the shoulder, the head, and the horns swept out to both
           sides and forward. Symmetric about its line of travel, so it
           reads the same whichever way the herd runs. */
        ctx.beginPath();
        ctx.moveTo(r * 1.62, 0);
        ctx.quadraticCurveTo(r * 1.55, -r * 0.36, r * 1.15, -r * 0.40);
        ctx.quadraticCurveTo(r * 1.45, -r * 0.95, r * 1.95, -r * 1.05);
        ctx.quadraticCurveTo(r * 1.35, -r * 1.32, r * 0.92, -r * 0.62);
        ctx.quadraticCurveTo(r * 0.55, -r * 0.9, -r * 0.2, -r * 0.82);
        ctx.quadraticCurveTo(-r * 1.4, -r * 0.78, -r * 1.75, -r * 0.2);
        ctx.lineTo(-r * 2.2, 0);
        ctx.lineTo(-r * 1.75, r * 0.2);
        ctx.quadraticCurveTo(-r * 1.4, r * 0.78, -r * 0.2, r * 0.82);
        ctx.quadraticCurveTo(r * 0.55, r * 0.9, r * 0.92, r * 0.62);
        ctx.quadraticCurveTo(r * 1.35, r * 1.32, r * 1.95, r * 1.05);
        ctx.quadraticCurveTo(r * 1.45, r * 0.95, r * 1.15, r * 0.40);
        ctx.quadraticCurveTo(r * 1.55, r * 0.36, r * 1.62, 0);
        ctx.closePath();
        break;
      case 'chakram': {
        /* A war ring: six hooked edges round a hole you could put a hand
           through. Drawn with the hole, so it is filled even-odd. */
        ctx.beginPath();
        const n = 6;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * TAU, a1 = a0 + TAU / n * 0.62, a2 = a0 + TAU / n;
          const r0 = r * 1.0, rt = r * 1.38;
          const p0x = Math.cos(a0) * r0, p0y = Math.sin(a0) * r0;
          if (i === 0) ctx.moveTo(p0x, p0y);
          ctx.quadraticCurveTo(Math.cos(a0 + 0.3) * r * 1.3, Math.sin(a0 + 0.3) * r * 1.3, Math.cos(a1) * rt, Math.sin(a1) * rt);
          ctx.lineTo(Math.cos(a2) * r0, Math.sin(a2) * r0);
        }
        ctx.closePath();
        ctx.moveTo(r * 0.52, 0);
        ctx.arc(0, 0, r * 0.52, 0, TAU, true);
        break;
      }
      default:
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.2, r * 0.55, 0, 0, TAU);
    }
  };

  function poly(g, pts) {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
  }
  function line(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  // A four-point glint: the one mark that says "this surface is hard".
  function glint(g, x, y, s, a) {
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.beginPath();
    g.moveTo(x + s, y); g.lineTo(x + s * 0.18, y + s * 0.18); g.lineTo(x, y + s);
    g.lineTo(x - s * 0.18, y + s * 0.18); g.lineTo(x - s, y); g.lineTo(x - s * 0.18, y - s * 0.18);
    g.lineTo(x, y - s); g.lineTo(x + s * 0.18, y - s * 0.18);
    g.closePath(); g.fill();
  }
  function steel(g, top, bot, tone) {
    const s = g.createLinearGradient(0, top, 0, bot);
    s.addColorStop(0, rgba(mix([0.97, 0.98, 1.0], tone, 0.10)));
    s.addColorStop(0.45, rgba(mix([0.80, 0.83, 0.88], tone, 0.18)));
    s.addColorStop(1, rgba(mix([0.42, 0.46, 0.54], tone, 0.22)));
    return s;
  }
  // The dark edge every bolt is held by, inside its own silhouette.
  function rim(g, art, r, c, w) {
    g.save();
    SA.path(g, art, r); g.clip('evenodd');
    g.strokeStyle = rgba(sink(c, 0.16), 0.9);
    g.lineWidth = Math.max(1, r * (w || 0.2));
    SA.path(g, art, r); g.stroke();
    g.restore();
  }

  /* ------------------------------------------------------------ materials */
  const PAINT = {
    /* Cinderfall: a coal. A crust gone nearly black, split by cracks that
       run white at the middle and orange at the edge, with the hot face
       forward where the air hits it. */
    ember(g, r, c) {
      const hot = mix(c, [1, 0.86, 0.45], 0.55);
      SA.path(g, 'ember', r);
      const crust = g.createLinearGradient(r * 1.4, 0, -r * 1.3, 0);
      crust.addColorStop(0, rgba(sink(c, 0.62)));
      crust.addColorStop(0.5, rgba(sink(c, 0.30)));
      crust.addColorStop(1, rgba(sink(c, 0.16)));
      g.fillStyle = crust; g.fill('evenodd');
      g.save();
      SA.path(g, 'ember', r); g.clip('evenodd');
      const face = g.createRadialGradient(r * 0.95, -r * 0.1, 0, r * 0.95, -r * 0.1, r * 1.25);
      face.addColorStop(0, 'rgba(255,248,214,.95)');
      face.addColorStop(0.35, rgba(hot, 0.85));
      face.addColorStop(1, rgba(c, 0));
      g.fillStyle = face; g.fillRect(-r * 2, -r * 2, r * 4, r * 4);
      g.lineCap = 'round'; g.lineJoin = 'round';
      const cracks = [
        [0.15, -0.05, 0.7, -0.95], [0.15, -0.05, -0.55, -0.55], [-0.55, -0.55, -0.9, -0.75],
        [0.15, -0.05, -0.75, 0.15], [-0.75, 0.15, -1.3, -0.1], [-0.75, 0.15, -0.7, 0.85],
        [0.15, -0.05, 0.35, 0.72], [0.15, -0.05, 1.45, 0.02],
      ];
      for (const [w, col] of [[0.30, rgba(hot, 0.95)], [0.12, 'rgba(255,246,210,.95)']]) {
        g.strokeStyle = col; g.lineWidth = Math.max(0.8, r * w);
        for (const k of cracks) line(g, k[0] * r, k[1] * r, k[2] * r, k[3] * r);
      }
      g.restore();
      rim(g, 'ember', r, c, 0.16);
    },

    /* Rimeshard: cut ice. A lit upper face and a shadowed lower one,
       split by the spine, a frost fracture inside and a glint at the point. */
    shard(g, r, c) {
      SA.path(g, 'shard', r);
      const body = g.createLinearGradient(r * 2.1, 0, -r * 1.5, 0);
      body.addColorStop(0, rgba(lift(c, 0.92)));
      body.addColorStop(0.45, rgba(lift(c, 0.45)));
      body.addColorStop(1, rgba(sink(c, 0.62)));
      g.fillStyle = body; g.fill();
      g.save();
      SA.path(g, 'shard', r); g.clip();
      g.fillStyle = rgba(sink(c, 0.28), 0.55);
      poly(g, [r * 2.1, 0, r * 0.5, r * 0.5, -r * 1.1, r * 0.34, -r * 1.5, 0]); g.fill();
      g.fillStyle = 'rgba(255,255,255,.42)';
      poly(g, [r * 2.1, 0, r * 0.5, -r * 0.5, r * 0.1, -r * 0.1]); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(0.7, r * 0.07);
      line(g, r * 2.0, 0, -r * 1.45, 0);
      g.strokeStyle = rgba(lift(c, 0.8), 0.7); g.lineWidth = Math.max(0.6, r * 0.05);
      line(g, r * 0.5, -r * 0.5, -r * 0.3, 0);
      line(g, r * 0.5, r * 0.5, -r * 0.3, 0);
      line(g, -r * 0.4, -r * 0.05, -r * 0.8, -r * 0.24);
      line(g, -r * 0.6, 0.02 * r, -r * 0.95, r * 0.2);
      g.restore();
      rim(g, 'shard', r, c, 0.13);
      glint(g, r * 1.35, -r * 0.12, r * 0.42, 0.9);
    },

    /* Seeking Motes: a gem, cut in four faces round a table. */
    missile(g, r, c) {
      const T = [r * 1.6, 0], U = [r * 0.15, -r * 0.85], B = [-r * 0.9, 0], D = [r * 0.15, r * 0.85];
      const C = [r * 0.42, -r * 0.06];
      const faces = [[T, U, lift(c, 0.78)], [U, B, lift(c, 0.30)], [B, D, sink(c, 0.55)], [D, T, mix(c, lift(c, 0.4), 0.4)]];
      for (const [a, b, col] of faces) {
        g.fillStyle = rgba(col);
        poly(g, [a[0], a[1], b[0], b[1], C[0], C[1]]); g.fill();
      }
      g.strokeStyle = rgba(lift(c, 0.9), 0.65); g.lineWidth = Math.max(0.6, r * 0.06);
      for (const p of [T, U, B, D]) line(g, C[0], C[1], p[0], p[1]);
      rim(g, 'missile', r, c, 0.16);
      glint(g, C[0], C[1], r * 0.5, 0.95);
    },

    /* Knifestorm and Storm of Steel: a knife - a bevelled blade, a brass
       guard at the shoulder and a wrapped grip. */
    dagger(g, r, c) {
      g.save();
      SA.path(g, 'dagger', r); g.clip();
      g.fillStyle = steel(g, -r * 0.42, r * 0.42, c);
      g.fillRect(r * 0.14, -r * 0.5, r * 1.9, r);
      // the lower bevel: the same blade, turned from the light
      g.fillStyle = 'rgba(40,46,60,.28)';
      poly(g, [r * 1.9, 0, r * 0.32, r * 0.42, r * 0.32, 0]); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = Math.max(0.6, r * 0.06);
      line(g, r * 1.8, -r * 0.02, r * 0.4, -r * 0.34);
      g.strokeStyle = 'rgba(30,34,44,.55)'; g.lineWidth = Math.max(0.6, r * 0.07);
      line(g, r * 1.35, 0, r * 0.42, 0);
      const brass = g.createLinearGradient(0, -r * 0.42, 0, r * 0.42);
      brass.addColorStop(0, '#f3d98f'); brass.addColorStop(0.5, '#c79a45'); brass.addColorStop(1, '#6e4f1c');
      g.fillStyle = brass; g.fillRect(r * 0.12, -r * 0.5, r * 0.22, r);
      g.fillStyle = '#5c3d24'; g.fillRect(-r * 0.95, -r * 0.22, r * 1.08, r * 0.44);
      g.strokeStyle = 'rgba(20,10,4,.7)'; g.lineWidth = Math.max(0.6, r * 0.07);
      for (let k = 0; k < 4; k++) {
        const x = -r * 0.78 + k * r * 0.24;
        line(g, x, -r * 0.2, x + r * 0.12, r * 0.2);
      }
      g.fillStyle = 'rgba(255,220,170,.28)'; g.fillRect(-r * 0.95, -r * 0.2, r * 1.08, r * 0.1);
      g.fillStyle = brass; g.fillRect(-r * 0.95, -r * 0.2, r * 0.14, r * 0.4);
      g.restore();
      rim(g, 'dagger', r, [0.5, 0.52, 0.6], 0.14);
    },

    /* Volley: an arrow - a bodkin head, an ash shaft, and fletching, which
       sits just behind the shaft's end and hits nothing. */
    arrow(g, r, c) {
      const feather = mix([0.72, 0.22, 0.16], c, 0.25);
      for (const s of [-1, 1]) {
        g.fillStyle = rgba(feather);
        poly(g, [-r * 1.05, s * r * 0.12, -r * 1.55, s * r * 0.52, -r * 2.0, s * r * 0.5, -r * 1.7, s * r * 0.12]);
        g.fill();
        g.fillStyle = 'rgba(245,236,220,.9)';
        poly(g, [-r * 1.55, s * r * 0.52, -r * 2.0, s * r * 0.5, -r * 1.86, s * r * 0.34, -r * 1.45, s * r * 0.36]);
        g.fill();
        g.strokeStyle = 'rgba(30,14,10,.7)'; g.lineWidth = Math.max(0.6, r * 0.07);
        poly(g, [-r * 1.05, s * r * 0.12, -r * 1.55, s * r * 0.52, -r * 2.0, s * r * 0.5, -r * 1.7, s * r * 0.12]);
        g.stroke();
      }
      g.save();
      SA.path(g, 'arrow', r); g.clip();
      const wood = g.createLinearGradient(0, -r * 0.16, 0, r * 0.16);
      wood.addColorStop(0, '#d9a868'); wood.addColorStop(1, '#7a4f26');
      g.fillStyle = wood; g.fillRect(-r * 1.7, -r * 0.2, r * 2.5, r * 0.4);
      g.fillStyle = steel(g, -r * 0.55, r * 0.55, c);
      g.fillRect(r * 0.66, -r * 0.6, r * 1.3, r * 1.2);
      g.fillStyle = 'rgba(40,46,60,.3)';
      poly(g, [r * 1.9, 0, r * 0.7, r * 0.55, r * 0.7, 0]); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = Math.max(0.6, r * 0.06);
      line(g, r * 1.8, -r * 0.03, r * 0.8, -r * 0.46);
      g.fillStyle = '#3a2a1a'; g.fillRect(r * 0.5, -r * 0.18, r * 0.2, r * 0.36);
      g.restore();
      rim(g, 'arrow', r, [0.4, 0.3, 0.2], 0.14);
    },

    /* Umbral Bolt: a rent in the light. Near-black inside, the edge burning
       in the school's colour, and a seam of white down the middle. */
    bolt(g, r, c) {
      SA.path(g, 'bolt', r);
      const v = g.createRadialGradient(0, 0, 0, 0, 0, r * 1.8);
      v.addColorStop(0, rgba(sink(c, 0.10)));
      v.addColorStop(1, rgba(sink(c, 0.35)));
      g.fillStyle = v; g.fill();
      g.save();
      SA.path(g, 'bolt', r); g.clip();
      g.strokeStyle = rgba(lift(c, 0.35), 0.95); g.lineWidth = Math.max(1, r * 0.34);
      g.lineJoin = 'round';
      SA.path(g, 'bolt', r); g.stroke();
      g.strokeStyle = rgba(lift(c, 0.75), 0.9); g.lineWidth = Math.max(0.6, r * 0.1);
      g.beginPath();
      g.moveTo(r * 1.7, 0); g.lineTo(r * 0.3, -r * 0.18); g.lineTo(-r * 0.5, r * 0.05);
      g.lineTo(-r * 1.3, -r * 0.3); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = Math.max(0.5, r * 0.04);
      g.stroke();
      g.restore();
      g.strokeStyle = 'rgba(6,2,12,.8)'; g.lineWidth = Math.max(0.6, r * 0.06);
      SA.path(g, 'bolt', r); g.stroke();
    },

    /* Moonbrand and Firmament: a sickle of moon, silvered on its outer edge
       and pocked with craters. */
    moon(g, r, c) {
      SA.path(g, 'moon', r);
      const m = g.createLinearGradient(-r * 1.05, 0, r * 0.4, 0);
      m.addColorStop(0, rgba(lift(c, 0.97)));
      m.addColorStop(0.5, rgba(lift(c, 0.78)));
      m.addColorStop(1, rgba(lift(c, 0.45)));
      g.fillStyle = m; g.fill('evenodd');
      g.save();
      SA.path(g, 'moon', r); g.clip('evenodd');
      for (const [x, y, s] of [[-0.72, -0.3, 0.17], [-0.8, 0.35, 0.12], [-0.45, 0.72, 0.1], [-0.4, -0.75, 0.09]]) {
        g.fillStyle = rgba(sink(c, 0.62), 0.6);
        g.beginPath(); g.arc(x * r, y * r, s * r, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(0.5, r * 0.04);
        g.beginPath(); g.arc(x * r + s * r * 0.2, y * r + s * r * 0.2, s * r, 3.4, 5.4); g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = Math.max(0.7, r * 0.08);
      g.beginPath(); g.arc(0, 0, r * 0.98, 2.2, 4.1); g.stroke();
      g.restore();
      rim(g, 'moon', r, c, 0.12);
    },

    /* Grave Tether: a talon of bone, ridged, going to shadow at the root. */
    coil(g, r, c) {
      SA.path(g, 'coil', r);
      const b = g.createLinearGradient(r * 1.5, 0, -r * 1.6, 0);
      b.addColorStop(0, rgba(mix([0.95, 0.92, 0.86], c, 0.15)));
      b.addColorStop(0.5, rgba(mix([0.78, 0.72, 0.70], c, 0.40)));
      b.addColorStop(1, rgba(sink(c, 0.45)));
      g.fillStyle = b; g.fill();
      g.save();
      SA.path(g, 'coil', r); g.clip();
      g.strokeStyle = rgba(sink(c, 0.25), 0.6); g.lineWidth = Math.max(0.6, r * 0.09);
      for (const [x1, y1, x2, y2] of [[0.6, -0.72, 0.85, 0.05], [0.0, -0.9, 0.2, -0.1], [-0.6, -0.8, -0.45, -0.1], [-1.2, -0.45, -0.95, 0.1]]) {
        line(g, x1 * r, y1 * r, x2 * r, y2 * r);
      }
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = Math.max(0.6, r * 0.06);
      g.beginPath(); g.moveTo(r * 1.35, -r * 0.14);
      g.quadraticCurveTo(r * 0.2, -r * 1.0, -r * 1.0, -r * 0.5); g.stroke();
      g.restore();
      rim(g, 'coil', r, c, 0.14);
    },

    /* Ruin Unbound: shards fused by force, each face its own shade, the
       seams between them still white-hot. */
    chaos(g, r, c) {
      const pts = [[2.0, 0], [0.5, -0.4], [0.7, -1.1], [-0.2, -0.5], [-1.0, -0.9], [-0.9, -0.05],
        [-1.6, 0.25], [-0.7, 0.35], [-0.85, 1.0], [0.1, 0.4], [0.5, 0.75]];
      const C = [0.05, 0.02];
      const shades = [lift(c, 0.55), sink(c, 0.45), c, sink(c, 0.25), lift(c, 0.3), sink(c, 0.6)];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        g.fillStyle = rgba(shades[i % shades.length]);
        poly(g, [a[0] * r, a[1] * r, b[0] * r, b[1] * r, C[0] * r, C[1] * r]); g.fill();
      }
      g.save();
      SA.path(g, 'chaos', r); g.clip();
      g.lineCap = 'round';
      for (const [w, col] of [[0.16, rgba(lift(c, 0.6), 0.9)], [0.06, 'rgba(255,255,255,.95)']]) {
        g.strokeStyle = col; g.lineWidth = Math.max(0.5, r * w);
        for (const i of [0, 2, 4, 6, 8]) line(g, C[0] * r, C[1] * r, pts[i][0] * r, pts[i][1] * r);
      }
      g.restore();
      rim(g, 'chaos', r, c, 0.14);
    },

    /* Judgement Disc: a gilded chakram. A rim with twelve graduations cut
       in it, an enamelled field, a star, and a jewel at the hub. */
    shield(g, r, c) {
      const R = r * 1.1;
      const gold = g.createLinearGradient(-R, -R, R, R);
      gold.addColorStop(0, rgba(lift(c, 0.8)));
      gold.addColorStop(0.5, rgba(c));
      gold.addColorStop(1, rgba(sink(c, 0.45)));
      g.fillStyle = gold;
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
      const field = g.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r * 0.74);
      field.addColorStop(0, rgba(sink(c, 0.7)));
      field.addColorStop(1, rgba(sink(c, 0.32)));
      g.fillStyle = field;
      g.beginPath(); g.arc(0, 0, r * 0.74, 0, TAU); g.fill();
      g.strokeStyle = rgba(sink(c, 0.2), 0.85); g.lineWidth = Math.max(0.6, r * 0.08);
      g.beginPath(); g.arc(0, 0, r * 0.74, 0, TAU); g.stroke();
      for (let n = 0; n < 12; n++) {
        const a = (n / 12) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        line(g, ca * r * 0.8, sa * r * 0.8, ca * r * 1.02, sa * r * 1.02);
      }
      g.fillStyle = rgba(lift(c, 0.85));
      g.beginPath();
      for (let n = 0; n < 8; n++) {
        const a = (n / 8) * TAU - Math.PI / 2, rr = n % 2 ? r * 0.2 : r * 0.62;
        if (n) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath(); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(0, 0, r * 0.17, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = Math.max(0.6, r * 0.09);
      g.beginPath(); g.arc(0, 0, R * 0.9, 3.5, 4.9); g.stroke();
      g.strokeStyle = rgba(sink(c, 0.16), 0.9); g.lineWidth = Math.max(0.8, r * 0.12);
      g.beginPath(); g.arc(0, 0, R - r * 0.06, 0, TAU); g.stroke();
    },

    // An axe or sword thrown as a bolt: a steel lozenge with a fuller.
    axe(g, r, c) {
      g.save();
      SA.path(g, 'axe', r); g.clip();
      g.fillStyle = steel(g, -r * 0.75, r * 0.75, c); g.fillRect(-r * 1.3, -r, r * 3.1, r * 2);
      g.strokeStyle = 'rgba(30,34,44,.55)'; g.lineWidth = Math.max(0.6, r * 0.08);
      line(g, r * 1.3, 0, -r * 0.8, 0);
      g.restore();
      rim(g, 'axe', r, [0.5, 0.52, 0.6], 0.14);
    },

    /* Spirit Herd: a bull made of moss-light. A pale hide lit from the
       head, a darker spine, the horns bone-white, and the breath of it
       glowing at the muzzle. */
    herd(g, r, c) {
      const spirit = mix(c, [0.85, 1.0, 0.8], 0.35);
      SA.path(g, 'herd', r);
      const hide = g.createLinearGradient(r * 1.6, 0, -r * 2.2, 0);
      hide.addColorStop(0, rgba(lift(spirit, 0.7), 0.95));
      hide.addColorStop(0.5, rgba(spirit, 0.85));
      hide.addColorStop(1, rgba(sink(c, 0.5), 0.35));
      g.fillStyle = hide; g.fill();
      g.save();
      SA.path(g, 'herd', r); g.clip();
      // the spine and the hump
      g.fillStyle = rgba(sink(c, 0.45), 0.55);
      g.beginPath(); g.ellipse(-r * 0.3, 0, r * 1.2, r * 0.22, 0, 0, TAU); g.fill();
      g.fillStyle = rgba(sink(c, 0.35), 0.5);
      g.beginPath(); g.ellipse(r * 0.55, 0, r * 0.36, r * 0.46, 0, 0, TAU); g.fill();
      // horns: bone, tipped dark
      g.strokeStyle = 'rgba(250,244,222,.95)'; g.lineWidth = Math.max(0.9, r * 0.2); g.lineCap = 'round';
      for (const sy of [-1, 1]) {
        g.beginPath(); g.moveTo(r * 1.1, sy * r * 0.42);
        g.quadraticCurveTo(r * 1.4, sy * r * 0.95, r * 1.85, sy * r * 1.0); g.stroke();
      }
      // breath at the muzzle
      const br = g.createRadialGradient(r * 1.6, 0, 0, r * 1.6, 0, r * 0.7);
      br.addColorStop(0, 'rgba(255,255,240,.95)'); br.addColorStop(1, rgba(lift(c, 0.6), 0));
      g.fillStyle = br; g.fillRect(r * 0.9, -r, r * 1.4, r * 2);
      g.restore();
      rim(g, 'herd', r, c, 0.12);
      // eyes: two points of light either side of the brow
      g.fillStyle = 'rgba(255,255,230,.95)';
      for (const sy of [-1, 1]) { g.beginPath(); g.arc(r * 1.22, sy * r * 0.2, Math.max(0.6, r * 0.09), 0, TAU); g.fill(); }
    },

    /* Gale Chakram: a steel ring, the edges ground bright, a darker
       inner band where the hand holds it, and a wind-blue sheen. */
    chakram(g, r, c) {
      SA.path(g, 'chakram', r);
      g.fillStyle = steel(g, -r * 1.3, r * 1.3, c); g.fill('evenodd');
      g.save();
      SA.path(g, 'chakram', r); g.clip('evenodd');
      g.strokeStyle = rgba(sink(mix([0.5, 0.52, 0.6], c, 0.3), 0.7), 0.8);
      g.lineWidth = Math.max(0.8, r * 0.16);
      g.beginPath(); g.arc(0, 0, r * 0.66, 0, TAU); g.stroke();
      g.strokeStyle = rgba(lift(c, 0.55), 0.7); g.lineWidth = Math.max(0.6, r * 0.07);
      g.beginPath(); g.arc(0, 0, r * 0.95, -2.2, -0.3); g.stroke();
      g.restore();
      rim(g, 'chakram', r, [0.5, 0.52, 0.6], 0.12);
      glint(g, -r * 0.5, -r * 0.85, r * 0.4, 0.85);
    },
  };
  PAINT.sword = PAINT.axe;

  function plain(g, r, c, art) {
    SA.path(g, art, r);
    const e = g.createLinearGradient(0, -r, 0, r);
    e.addColorStop(0, rgba(lift(c, 0.9)));
    e.addColorStop(1, rgba(lift(c, 0.3)));
    g.fillStyle = e; g.fill('evenodd');
    rim(g, art, r, c, 0.16);
  }

  /* ---------------------------------------------------------------- cache */
  const bolts = new Map();
  // Where each painted bolt's origin sits in its canvas, in drawn pixels.
  const EXT_X0 = 2.25, EXT_X1 = 2.35, EXT_Y = 1.45;

  /** The painted bolt for this shape, colour and radius - made once. */
  SA.bolt = function (art, colour, r) {
    const rr = Math.max(1, Math.round(r * 2) / 2);
    const key = (art || '') + '|' + keyOf(colour) + '|' + rr;
    let s = bolts.get(key);
    if (s) return s;
    if (bolts.size > 480) bolts.clear();
    const pad = 2;
    const w = Math.ceil((rr * (EXT_X0 + EXT_X1) + pad * 2) * Q);
    const h = Math.ceil((rr * EXT_Y * 2 + pad * 2) * Q);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.scale(Q, Q);
    g.translate(pad + rr * EXT_X0, pad + rr * EXT_Y);
    g.lineJoin = 'round';
    (PAINT[art] || ((gg, r2, c2) => plain(gg, r2, c2, art)))(g, rr, colour);
    s = { canvas: cv, ox: pad + rr * EXT_X0, oy: pad + rr * EXT_Y, w: w / Q, h: h / Q };
    bolts.set(key, s);
    return s;
  };

  /** Stamp a painted bolt at the current origin, pointing along +x. */
  SA.drawBolt = function (ctx, art, colour, r) {
    const s = SA.bolt(art, colour, r);
    const k = r / Math.max(1, Math.round(r * 2) / 2);
    ctx.drawImage(s.canvas, -s.ox * k, -s.oy * k, s.w * k, s.h * k);
  };

  /* ------------------------------------------------------- orbiting blades */
  /* The whirling axe keeps its silhouette to the pixel - the poll block and
     the wedge are the shapes that were chosen over every alternative - and
     trades its white fill for steel: a bright cutting edge, a darker cheek,
     a bevel along the bit, and a haft with grain and a wrapped grip. */
  const blades = new Map();
  function axeHead(g, S) {
    g.beginPath();
    g.moveTo(S * 0.10, -S * 0.24); g.lineTo(S * 0.46, -S * 0.24);
    g.lineTo(S * 0.46, -S * 0.04); g.lineTo(S * 0.10, 0);
    g.closePath();
    g.moveTo(S * 0.10, S * 0.04); g.lineTo(S * 0.40, 0);
    g.lineTo(S * 1.45, S * 0.20); g.lineTo(S * 0.95, S * 0.72);
    g.lineTo(S * 0.28, S * 0.44); g.lineTo(S * 0.10, S * 0.20);
    g.closePath();
  }
  SA.axeHead = axeHead;

  SA.blade = function (art, colour, S) {
    const ss = Math.max(4, Math.round(S));
    const key = art + '|' + keyOf(colour) + '|' + ss;
    let b = blades.get(key);
    if (b) return b;
    if (blades.size > 120) blades.clear();
    const pad = 2, x0 = 1.05, x1 = 1.55, y0 = 0.4, y1 = 0.85;
    const w = Math.ceil((ss * (x0 + x1) + pad * 2) * Q), h = Math.ceil((ss * (y0 + y1) + pad * 2) * Q);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.scale(Q, Q); g.translate(pad + ss * x0, pad + ss * y0);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const c = colour;
    // the haft: ash, lit along its upper side, bound in two places
    const hx = -ss * 0.95, hw = ss * 1.0, hh = ss * 0.17;
    const wood = g.createLinearGradient(0, -hh / 2, 0, hh / 2);
    wood.addColorStop(0, '#c89560'); wood.addColorStop(0.5, '#8b6a44'); wood.addColorStop(1, '#4e3620');
    g.fillStyle = wood; g.fillRect(hx, -hh / 2, hw, hh);
    g.strokeStyle = 'rgba(40,22,10,.5)'; g.lineWidth = Math.max(0.5, ss * 0.02);
    line(g, hx + ss * 0.1, -hh * 0.1, hx + hw * 0.8, hh * 0.05);
    g.fillStyle = '#3b2a1c';
    g.fillRect(hx, -hh * 0.62, ss * 0.26, hh * 1.24);
    g.strokeStyle = 'rgba(230,200,150,.35)';
    for (let k = 0; k < 3; k++) line(g, hx + ss * (0.05 + k * 0.08), -hh * 0.6, hx + ss * (0.1 + k * 0.08), hh * 0.6);
    g.strokeStyle = 'rgba(12,10,8,.75)'; g.lineWidth = Math.max(0.8, ss * 0.035);
    g.strokeRect(hx, -hh / 2, hw, hh);
    // the head
    g.save();
    axeHead(g, ss); g.clip();
    g.fillStyle = steel(g, -ss * 0.24, ss * 0.72, c);
    g.fillRect(0, -ss * 0.3, ss * 1.5, ss * 1.1);
    // the cheek, set back from the edge and a shade darker
    g.fillStyle = 'rgba(52,58,72,.32)';
    poly(g, [ss * 0.10, ss * 0.04, ss * 0.40, 0, ss * 1.05, ss * 0.16, ss * 0.8, ss * 0.5, ss * 0.28, ss * 0.44, ss * 0.10, ss * 0.20]);
    g.fill();
    // the edge, honed bright, carrying the school's colour
    g.strokeStyle = rgba(lift(c, 0.55), 0.95); g.lineWidth = Math.max(1, ss * 0.1);
    g.beginPath(); g.moveTo(ss * 1.45, ss * 0.2); g.lineTo(ss * 0.95, ss * 0.72); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = Math.max(0.6, ss * 0.04);
    g.stroke();
    g.strokeStyle = 'rgba(8,10,16,.72)'; g.lineWidth = Math.max(1, ss * 0.06);
    line(g, ss * 0.24, -ss * 0.24, ss * 0.24, -ss * 0.04);
    g.beginPath(); g.moveTo(ss * 0.46, ss * 0.12); g.lineTo(ss * 1.28, ss * 0.24); g.lineTo(ss * 0.95, ss * 0.66); g.stroke();
    g.beginPath(); g.moveTo(ss * 0.10, -ss * 0.14); g.lineTo(ss * 0.46, -ss * 0.14); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(0.6, ss * 0.03);
    line(g, ss * 0.32, ss * 0.06, ss * 1.1, ss * 0.2);
    g.restore();
    g.fillStyle = 'rgba(8,10,16,.7)';
    for (const x of [0.20, 0.36]) { g.beginPath(); g.arc(ss * x, -ss * 0.19, Math.max(0.6, ss * 0.025), 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(8,10,16,.8)'; g.lineWidth = Math.max(0.8, ss * 0.035);
    axeHead(g, ss); g.stroke();
    b = { canvas: cv, ox: pad + ss * x0, oy: pad + ss * y0, w: w / Q, h: h / Q, s: ss };
    blades.set(key, b);
    return b;
  };

  SA.drawBlade = function (ctx, art, colour, S) {
    const b = SA.blade(art, colour, S);
    const k = S / b.s;
    ctx.drawImage(b.canvas, -b.ox * k, -b.oy * k, b.w * k, b.h * k);
  };

  /* --------------------------------------------------------------- glows */
  /* A hollow radial glow, baked once per colour and size and stamped with
     drawImage. The gyre's blade corona was a fresh radial gradient per blade
     per frame, and a whirl that recasts before the last ring ends keeps two
     rings - thirty-odd blades at full rank - each with its own; the gradient
     objects were the main-thread cost and the pixels under them the rest.
     `inner` is where the light starts as a fraction of the radius, and the
     three stops are the alphas at the inner edge, 30% of the way out, and the
     rim - which is always zero. */
  const glows = new Map();
  SA.glow = function (colour, radius, inner, a0, a1) {
    const rr = Math.max(4, Math.round(radius / 2) * 2);
    const key = keyOf(colour) + '|' + rr + '|' + Math.round(inner * 20) + '|' + Math.round(a0 * 40) + '|' + Math.round(a1 * 40);
    let cv = glows.get(key);
    if (cv) return cv;
    if (glows.size > 160) glows.clear();
    cv = document.createElement('canvas');
    cv.width = cv.height = rr * 2;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(rr, rr, rr * inner, rr, rr, rr);
    grd.addColorStop(0, rgba(colour, a0));
    grd.addColorStop(0.30, rgba(colour, a1));
    grd.addColorStop(1, rgba(colour, 0));
    g.fillStyle = grd;
    g.beginPath(); g.arc(rr, rr, rr, 0, TAU); g.fill();
    glows.set(key, cv);
    return cv;
  };

  /* --------------------------------------------------------- struck flash */
  /* A hit used to lay a tinted ELLIPSE over the creature - a red disc the
     size of its hitbox, over grass and all, which on a pack of hyenas read
     as a row of coins. The flash is the creature's own shape now: the
     sprite, filled solid, laid over itself. */
  const struck = new WeakMap();
  SA.flashOf = function (sprite, colour) {
    let m = struck.get(sprite);
    if (!m) { m = new Map(); struck.set(sprite, m); }
    let cv = m.get(colour);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = sprite.width; cv.height = sprite.height;
    const g = cv.getContext('2d');
    g.drawImage(sprite, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = colour;
    g.fillRect(0, 0, cv.width, cv.height);
    m.set(colour, cv);
    return cv;
  };

  /* ---------------------------------------------------------- lightning */
  /* A seeded walk from one end to the other, pinned at both, so the bolt
     always lands where the damage did. `seed` changes every couple of
     frames and the whole shape re-strikes - lightning that holds still is a
     wire. */
  function rnd(s) { s = (s * 1664525 + 1013904223) >>> 0; return s; }
  SA.lightning = function (ctx, len, hw, colour, fade, seed, forks, reach) {
    const segs = Math.max(4, Math.min(14, Math.round(len / 16)));
    const jag = Math.min(len * 0.14, 10 + hw * 2.2);
    const xs = [0], ys = [0];
    let s = seed >>> 0;
    for (let i = 1; i < segs; i++) {
      s = rnd(s);
      const t = i / segs;
      const env = Math.sin(t * Math.PI);
      xs.push(len * t + (((s >>> 9) % 1000) / 1000 - 0.5) * (len / segs) * 0.5);
      s = rnd(s);
      ys.push((((s >>> 9) % 1000) / 1000 - 0.5) * 2 * jag * (0.45 + 0.55 * env));
    }
    xs.push(len); ys.push(0);
    const stroke = () => {
      ctx.beginPath(); ctx.moveTo(xs[0], ys[0]);
      for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
      ctx.stroke();
    };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(colour, 0.22 * fade); ctx.lineWidth = hw * 4.2; stroke();
    ctx.strokeStyle = rgba(colour, 0.85 * fade); ctx.lineWidth = hw * 1.5; stroke();
    ctx.strokeStyle = `rgba(255,255,255,${(0.95 * fade).toFixed(3)})`; ctx.lineWidth = Math.max(1, hw * 0.55); stroke();
    // branches: short, thin, leaving at a slant and fading with distance
    for (let f = 0; f < forks; f++) {
      s = rnd(s);
      const i = 1 + ((s >>> 9) % (segs - 1));
      s = rnd(s);
      const side = (s >>> 12) & 1 ? 1 : -1;
      let x = xs[i], y = ys[i];
      ctx.beginPath(); ctx.moveTo(x, y);
      const step = len / segs * 0.7 * (reach || 1);
      for (let k = 0; k < 3; k++) {
        s = rnd(s);
        x += step * (0.6 + ((s >>> 9) % 100) / 250);
        s = rnd(s);
        y += side * step * (0.35 + ((s >>> 9) % 100) / 200);
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(colour, 0.7 * fade); ctx.lineWidth = Math.max(1, hw * 0.7); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${(0.6 * fade).toFixed(3)})`; ctx.lineWidth = Math.max(0.6, hw * 0.25); ctx.stroke();
    }
  };

  WS.SpellArt = SA;
})();
