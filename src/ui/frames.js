/* Frames drawn by hand.
 *
 * Every surface in the menus used to be edged with a perfect one-pixel rule,
 * a second perfect rule inset from it, and a pair of fourteen-pixel ticks in
 * opposite corners. It was tidy and it was the look of a component library.
 * The Watch keeps its books in a guardhouse; its frames should look like
 * someone inked them, and like they have been handled since.
 *
 * So the frames are pictures. Each is a small SVG: an outer line and an inner
 * one, pushed about by a low-frequency noise so they wander a fraction of a
 * pixel the way a pen does, worn through in places by a second noise so the
 * line breaks and resumes, and with corners that are chipped by different
 * amounts rather than cut square. They are applied as border-image over a
 * transparent one-pixel border, so nothing in the layout moves - the picture
 * paints inward over the padding.
 *
 * There are three wear patterns, so a column of identical rows does not show
 * the same scuff in the same place on every one of them, plus lit and gilt
 * versions for hover and selection. Everything is built once at load and
 * handed to the stylesheet as custom properties on :root.
 */
'use strict';
(function (WS) {

  const S = 600;          // source size; big, so a stretched edge stays fine-grained
  const SLICE = 24;       // border-image slice, in source pixels

  function svg(body, defs) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + S + '" height="' + S
      + '" viewBox="0 0 ' + S + ' ' + S + '"><defs>' + defs + '</defs>' + body + '</svg>';
  }

  function url(markup) {
    return 'url("data:image/svg+xml,' + encodeURIComponent(markup) + '")';
  }

  /** mulberry32, so every frame is the same frame on every load. */
  function rng(seed) {
    let t = (seed * 2654435761) >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  const f1 = (n) => n.toFixed(1);

  /**
   * One pen stroke from (x0,y0) to (x1,y1), as a filled outline: it bows a
   * little off true, swells and thins along its length, and tapers at both
   * ends. Drawn as geometry rather than pushed about by a filter - a
   * displacement filter samples without interpolation, and once an edge is
   * stretched across a wide row its one-pixel steps become visible jumps.
   *
   * The wobble is kept to one or two slow bends per edge on purpose: an edge
   * is stretched along its length to fit the element, and anything busier
   * turns to a zig-zag on a short side.
   */
  function ink(r, x0, y0, x1, y1, w, t0, t1) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    const a1 = 0.6 + r() * 0.9, p1 = r(), fq1 = 0.6 + r() * 0.8;
    const a2 = 0.25 + r() * 0.35, p2 = r(), fq2 = 2 + r() * 1.5;
    const wp = r(), wf = 1 + r() * 1.5;
    const n = 28, L = [], R = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * (i / n);
      const off = a1 * Math.sin(2 * Math.PI * (t * fq1 + p1)) + a2 * Math.sin(2 * Math.PI * (t * fq2 + p2));
      const k = i / n;
      const taper = Math.min(1, k * 6, (1 - k) * 6);
      const half = 0.5 * w * (0.7 + 0.45 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (t * wf + wp)))) * (0.35 + 0.65 * taper);
      const px = x0 + dx * t + nx * off, py = y0 + dy * t + ny * off;
      L.push(f1(px + nx * half) + ' ' + f1(py + ny * half));
      R.push(f1(px - nx * half) + ' ' + f1(py - ny * half));
    }
    return 'M' + L.join(' L') + ' L' + R.reverse().join(' L') + 'Z';
  }

  /** An edge, worn through in a place or two along its middle. The corners -
   *  the part of the picture border-image does not stretch - never wear. */
  function edge(r, x0, y0, x1, y1, w, wear) {
    const cuts = [];
    let gaps = 0;
    while (gaps < 3 && r() < wear) gaps++;
    for (let i = 0; i < gaps; i++) {
      const c = 0.12 + r() * 0.76, g = 0.02 + r() * 0.05 * (0.5 + wear);
      cuts.push([c - g / 2, c + g / 2]);
    }
    cuts.sort((a, b) => a[0] - b[0]);
    let d = '', t = 0;
    for (const [a, b] of cuts) {
      if (a > t + 0.01) d += ink(r, x0, y0, x1, y1, w, t, a);
      t = Math.max(t, b);
    }
    return d + ink(r, x0, y0, x1, y1, w, t, 1);
  }

  /** A rectangle of four strokes: run past each other at a crossed corner,
   *  stopped short of each other at a chipped one with a nick across it. */
  function box(r, k, chips, cross, w, wear) {
    const a = k, b = S - k;
    const c = chips, x = cross || [0, 0, 0, 0];
    const tl = cross ? -x[0] : c[0], tr = cross ? -x[1] : c[1];
    const br = cross ? -x[2] : c[2], bl = cross ? -x[3] : c[3];
    let d = edge(r, a + tl, a, b - tr, a, w, wear)          // top
      + edge(r, b, a + tr, b, b - br, w, wear)              // right
      + edge(r, b - br, b, a + bl, b, w, wear)              // bottom
      + edge(r, a, b - bl, a, a + tl, w, wear);             // left
    if (!cross) {
      d += ink(r, a, a + tl, a + tl, a, w * 0.8, 0, 1)
        + ink(r, b - tr, a, b, a + tr, w * 0.8, 0, 1)
        + ink(r, b, b - br, b - br, b, w * 0.8, 0, 1)
        + ink(r, a + bl, b, a, b - bl, w * 0.8, 0, 1);
    }
    return d;
  }

  /**
   * @param o.seed   wear pattern
   * @param o.outer  outer line colour
   * @param o.inner  inner line colour, or null for none
   * @param o.w      outer line width in source px (rendered at half)
   * @param o.chips  corner cuts [tl, tr, br, bl], source px
   * @param o.cross  overshoot at each corner instead of a cut
   * @param o.wear   0..1, how likely an edge is to have worn through
   * @param o.nails  colour of a nail at each inner corner, or none
   */
  function frame(o) {
    const r = rng(o.seed);
    const wear = o.wear === undefined ? 0.3 : o.wear;
    const c = o.chips || [6, 3, 8, 4];
    let body = `<path fill="${o.outer}" d="${box(r, 5, c, o.cross, o.w || 2.6, wear)}"/>`;
    if (o.inner) {
      body += `<path fill="${o.inner}" d="${box(r, 14, c.map((v) => v * 0.6), null, 1.6, Math.min(0.9, wear + 0.25))}"/>`;
    }
    if (o.nails) {
      for (const [x, y] of [[14, 14], [S - 14, 14], [S - 14, S - 14], [14, S - 14]]) {
        body += `<circle cx="${x}" cy="${y}" r="2.6" fill="${o.nails}"/>`;
      }
    }
    return url(svg(body, ''));
  }

  /** A surface: a slow mottle of darker and lighter patches, like slate or
   *  old leather, so a panel is a material and not a flat fill. Tiled; the
   *  noise is stitched so the tile has no seam. */
  function mottle() {
    const n = 320;
    const defs =
      `<filter id="m" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">`
      + `<feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="4" seed="7" stitchTiles="stitch"/>`
      + `<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0 0 0 -0.36"/>`
      + `</filter>`;
    return url('<svg xmlns="http://www.w3.org/2000/svg" width="' + n + '" height="' + n + '"><defs>'
      + defs + '</defs><rect width="100%" height="100%" filter="url(#m)"/></svg>');
  }

  /** The active tab's mark: a brush stroke rather than a ruled underline. */
  function stroke(colour) {
    const defs =
      `<filter id="b" x="-5%" y="-40%" width="110%" height="180%">`
      + `<feTurbulence type="fractalNoise" baseFrequency="0.09 0.6" numOctaves="2" seed="4" result="n"/>`
      + `<feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G"/>`
      + `</filter>`;
    const body = `<path filter="url(#b)" fill="${colour}" d="M4 6.2 C40 4.6 120 4.4 196 5.4 C198 6 198 7.2 195 7.8 `
      + `C130 8.6 60 8.4 6 8.2 C2 7.8 2 6.6 4 6.2Z"/>`;
    return url('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="12" viewBox="0 0 200 12" '
      + 'preserveAspectRatio="none"><defs>' + defs + '</defs>' + body + '</svg>');
  }

  const RIM = 'rgba(255,232,196,.30)';
  const RIM_IN = 'rgba(255,232,196,.10)';
  const LIT = 'rgba(255,232,196,.55)';
  const LIT_IN = 'rgba(255,232,196,.16)';
  const GILT = 'rgba(245,197,107,.95)';
  const GILT_IN = 'rgba(245,197,107,.34)';

  const vars = {
    '--frame-a': frame({ seed: 3, outer: RIM, inner: RIM_IN, chips: [7, 3, 9, 4], wear: 0.3, cross: [4, 1, 5, 2] }),
    '--frame-b': frame({ seed: 11, outer: RIM, inner: RIM_IN, chips: [4, 8, 5, 10], wear: 0.35 }),
    '--frame-c': frame({ seed: 23, outer: RIM, inner: RIM_IN, chips: [9, 5, 3, 7], wear: 0.3, cross: [2, 5, 1, 4] }),
    '--frame-lit': frame({ seed: 3, outer: LIT, inner: LIT_IN, chips: [7, 3, 9, 4], wear: 0.3, cross: [4, 1, 5, 2] }),
    '--frame-gilt': frame({ seed: 3, outer: GILT, inner: GILT_IN, chips: [7, 3, 9, 4], wear: 0.2,
      nails: 'rgba(255,214,140,.8)' }),
    // A level-up card is held in the hand: a firmer line, and nails.
    '--frame-card': frame({ seed: 41, outer: 'rgba(255,232,196,.36)', inner: RIM_IN, chips: [8, 4, 10, 5],
      wear: 0.25, nails: 'rgba(245,226,190,.35)' }),
    '--frame-card-lit': frame({ seed: 41, outer: LIT, inner: LIT_IN, chips: [8, 4, 10, 5],
      wear: 0.1, nails: 'rgba(255,214,140,.7)' }),
    // Small tiles in a dense grid: one line only, or the grid turns to lace.
    '--frame-quiet': frame({ seed: 13, outer: 'rgba(255,232,196,.24)', chips: [6, 3, 7, 3], wear: 0.25 }),
    '--frame-quiet-lit': frame({ seed: 13, outer: LIT, chips: [6, 3, 7, 3], wear: 0.1 }),
    // A picture hung in a panel: a firmer line with a dark mat inside it.
    '--frame-picture': frame({ seed: 47, outer: 'rgba(255,232,196,.46)', inner: 'rgba(255,232,196,.14)',
      chips: [6, 3, 7, 4], wear: 0.2, cross: [3, 5, 2, 4], nails: 'rgba(245,197,107,.55)' }),
    // Big surfaces - the cartouche and the sheet panels - carry nails.
    '--frame-panel': frame({ seed: 31, outer: RIM, inner: RIM_IN, chips: [10, 4, 12, 6], wear: 0.5,
      nails: 'rgba(245,197,107,.45)' }),
    // Buttons: no inner line, which would crowd the label at their size.
    '--frame-btn': frame({ seed: 5, outer: 'rgba(255,232,196,.34)', chips: [5, 2, 6, 3], wear: 0.05, w: 2.8 }),
    '--frame-btn-lit': frame({ seed: 5, outer: 'rgba(245,197,107,.8)', chips: [5, 2, 6, 3], wear: 0, w: 2.8 }),
    '--frame-btn-gilt': frame({ seed: 9, outer: 'rgba(245,197,107,.85)', inner: 'rgba(245,197,107,.25)',
      chips: [6, 3, 7, 3], wear: 0, w: 2.8 }),
    '--mottle': mottle(),
    '--brush': stroke('rgba(245,197,107,.95)'),
  };

  const root = document.documentElement;
  for (const k in vars) root.style.setProperty(k, vars[k]);

  WS.Frames = { SLICE, vars };

})(window.WS);
