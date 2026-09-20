#!/usr/bin/env node
/* The horde, measured the way the survivors are.
 *
 * check-hero.js has held the ten survivors to framing, silhouette, value and
 * modelling since the first art pass, and every one of those rules exists
 * because the rule was broken first. The twenty-two creatures they fight had
 * NO equivalent, and it showed the moment the two were put side by side: the
 * bestiary measured 22.1% interior detail against the cast's 41.0%, which is
 * almost exactly where the survivors sat before they were given edges. Smooth
 * airbrushed blobs on stick legs, and one pale four-point kite standing in for
 * every weapon in the game.
 *
 *   drawn      Interior detail: the share of inside pixels where the local
 *              gradient is steep. Silhouette edges are excluded because those
 *              are free - what is counted is what is happening WITHIN the
 *              outline. A creature built from one radial ramp scores near
 *              nothing however good its shape is.
 *
 *   visible    Every creature must out-value the ground it stands on, by the
 *              same margin the survivors must. A thing that walks at you and
 *              cannot be seen against the floor is not a difficulty, it is a
 *              defect, and the maps' luminance is read off the maps rather
 *              than assumed.
 *
 *   apart      No two creatures may share a silhouette. They are told apart
 *              at a glance or they are one enemy wearing twenty-two hats, and
 *              colour cannot carry it - check-behaviour already settled that
 *              for the casters and their melee twins.
 *
 *   framed     Nothing touches the edge of its own tile. The interior edges
 *              added in this pass are drawn CLIPPED for exactly this reason -
 *              a stroke laid on a shape grows it by half a line width, and
 *              half a line width is how a wing ends up sheared off.
 *
 * NEGATIVE TESTS - and an honest account of what is NOT covered.
 *
 * Confirmed: putting shaded() back to the single radial ramp it was gives
 * "the bestiary averages 26.9% interior detail, below the floor of 27" and
 * "spider is drawn at 16.4%, below the floor of 17". That is the change this
 * file's detail rules actually hold in place.
 *
 * Confirmed on the framing rule, by finding real bugs rather than by
 * sabotage: the first run of this harness reported the golem 31px and the
 * abomination 37px over the right edge of their own tiles. Both had been
 * drawn that way from the start - a blade tip past the canvas, sheared off on
 * every frame - and nothing in the suite had ever looked.
 *
 * NOT covered, and worth knowing: giving poly() an interior is worth only
 * 0.7 points on this metric (31.0% with, 30.3% without), because the wings,
 * ears, talons and plates it draws are a small share of a creature's pixels.
 * Removing it does NOT fail this file. It stays because it is visibly right -
 * a wing with a shaded side reads as a wing - but the number cannot see it,
 * and pretending otherwise would be the same mistake as the material pass on
 * the survivors, which measured 0.3 points and was reported as a win.
 *
 *   node tools/check-bestiary.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');

/* Floors. Each is set below where the bestiary measures today and above where
 * it measured before the pass, so the rule has room to breathe and still
 * fails the thing it was written about. */
const DETAIL_FLOOR = 27;         // bestiary average, %
const WORST_FLOOR = 17;          // the flattest single creature, %
const MARGIN = 14;               // luminance a creature must clear the ground by

/* APART is set from what the bestiary HONESTLY IS, and it is worth saying why
 * it is not higher.
 *
 * Twenty-two creatures share a small number of body plans - a great many of
 * them are a centred mass with a limb either side, because a great many
 * monsters are. At a 0.30 floor, fourteen pairs failed, and the first attempt
 * at fixing that by hand made the drawings WORSE: rebuilding the wolf on
 * hip-chest-shoulder masses moved the number and turned the animal into a
 * caterpillar. The metric is a constraint, not a goal, and optimising it
 * directly is how a bestiary ends up full of shapes nobody recognises.
 *
 * So four creatures that were genuinely interchangeable were rebuilt - the
 * cat on an arched back against the wolf's level one, the mongrel narrow and
 * hunched, the brute wide and low, the abomination lopsided - and the floor
 * sits just above where the bestiary measured BEFORE that work (0.207) and
 * below where it measures after (0.234). It catches a slide back; it does not
 * claim all twenty-two are maximally distinct, and they are not. */
const APART = 0.21;

const fail = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.WS && window.WS.Sprites && window.WS.Enemies);

  const report = await page.evaluate(({ APART }) => {
    const S = 220;

    /* One entry per ART, not per enemy: a dozen enemies share an art with a
       different tint, and measuring those as separate creatures would report
       twelve passes for one drawing.
       
       BOSSES ARE INCLUDED, and they were not at first. This file iterated
       WS.Enemies only, so the four arts used by nothing but a boss - wraith,
       lich, reaper, sovereign - were never measured by anything. They were
       the four weakest drawings in the game when they were finally looked at:
       the Pale Wraith was a teardrop with two dots on it and Death Itself
       carried a scythe made out of a stroked circle. A rule that skips the
       bosses is a rule that guards the trash mobs. */
    const byArt = {};
    for (const src of [WS.Enemies, WS.Bosses]) {
      for (const id of Object.keys(src)) {
        const t = src[id];
        if (t.art && !byArt[t.art]) byArt[t.art] = { tint: t.tint, id };
      }
    }
    const arts = Object.keys(byArt);

    // The ground, read off the maps rather than guessed at.
    const ground = {};
    for (const m of Object.keys(WS.Maps)) {
      WS.Game.startRun(m, 'mage');
      WS.Renderer.draw(4);
      const ctx = document.getElementById('game-canvas').getContext('2d');
      const R = WS.Renderer, d = R.dpr;
      const img = ctx.getImageData(Math.round((R.offsetX + 300 * R.scale) * d),
        Math.round((R.offsetY + 220 * R.scale) * d), 120, 120).data;
      let s = 0, n = 0;
      for (let i = 0; i < img.length; i += 4) {
        s += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2]; n++;
      }
      ground[m] = s / n;
    }
    if (WS.Game.quitToMenu) WS.Game.quitToMenu();

    const rows = [], shapes = {};
    for (const art of arts) {
      const sp = WS.Sprites.creature(art, byArt[art].tint, S);
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const g = cv.getContext('2d');
      g.drawImage(sp, 0, 0, S, S);
      const d = g.getImageData(0, 0, S, S).data;
      const L = new Float32Array(S * S), A = new Uint8Array(S * S);
      for (let i = 0; i < S * S; i++) {
        L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
        A[i] = d[i * 4 + 3];
      }
      let inside = 0, steep = 0, lum = 0, lumN = 0;
      const solid = new Uint8Array(S * S);
      for (let y = 1; y < S - 1; y++) {
        for (let x = 1; x < S - 1; x++) {
          const i = y * S + x;
          if (A[i] < 200) continue;
          solid[i] = 1;
          lum += L[i]; lumN++;
          if (A[i - 1] < 200 || A[i + 1] < 200 || A[i - S] < 200 || A[i + S] < 200) continue;
          inside++;
          const m = Math.max(Math.abs(L[i + 1] - L[i - 1]), Math.abs(L[i + S] - L[i - S]));
          if (m > 14) steep++;
        }
      }
      shapes[art] = solid;

      // framing: any visible pixel on any border of its own tile
      let edge = 0;
      for (let x = 0; x < S; x++) {
        if (d[x * 4 + 3] > 40) edge++;
        if (d[((S - 1) * S + x) * 4 + 3] > 40) edge++;
      }
      for (let y = 0; y < S; y++) {
        if (d[y * S * 4 + 3] > 40) edge++;
        if (d[(y * S + S - 1) * 4 + 3] > 40) edge++;
      }
      rows.push({ art, inside, edge,
        detail: +(100 * steep / Math.max(1, inside)).toFixed(1),
        mean: +(lum / Math.max(1, lumN)).toFixed(1) });
    }

    // the closest pair, by how much of the union of two silhouettes differs
    let close = { pair: '', v: 2 };
    for (let i = 0; i < arts.length; i++) {
      for (let j = i + 1; j < arts.length; j++) {
        const a = shapes[arts[i]], b = shapes[arts[j]];
        let diff = 0, union = 0;
        for (let k = 0; k < a.length; k++) {
          if (a[k] || b[k]) { union++; if (a[k] !== b[k]) diff++; }
        }
        const v = diff / Math.max(1, union);
        if (v < close.v) close = { pair: `${arts[i]} and ${arts[j]}`, v: +v.toFixed(3) };
      }
    }
    void APART;

    let brightest = { map: '', v: -1 };
    for (const m of Object.keys(ground)) {
      if (ground[m] > brightest.v) brightest = { map: m, v: ground[m] };
    }
    return { rows, close, brightest: { map: brightest.map, v: +brightest.v.toFixed(1) } };
  }, { APART });

  const { rows, close, brightest } = report;
  const avg = rows.reduce((n, r) => n + r.detail, 0) / rows.length;
  const worst = rows.reduce((a, r) => (r.detail < a.detail ? r : a));
  const dimmest = rows.reduce((a, r) => (r.mean < a.mean ? r : a));

  if (avg < DETAIL_FLOOR) {
    fail.push(`the bestiary averages ${avg.toFixed(1)}% interior detail, below the floor `
      + `of ${DETAIL_FLOOR} - a horde of flat fills has a good silhouette and nothing `
      + 'inside it, which is where this started');
  }
  if (worst.detail < WORST_FLOOR) {
    fail.push(`${worst.art} is drawn at ${worst.detail}% interior detail, below the floor `
      + `of ${WORST_FLOOR} - the average can be carried by the good ones`);
  }
  if (dimmest.mean < brightest.v + MARGIN) {
    fail.push(`${dimmest.art} reads at ${dimmest.mean} against ground that reaches `
      + `${brightest.v} on ${brightest.map} - a creature that walks at you and cannot `
      + 'be seen against the floor is a defect, not a difficulty');
  }
  if (close.v < APART) {
    fail.push(`${close.pair} share their silhouette - only ${(close.v * 100).toFixed(1)}% `
      + `of the two drawings differs, against a floor of ${APART * 100}%`);
  }
  for (const r of rows) {
    if (r.edge > 0) {
      fail.push(`${r.art} touches the edge of its own tile (${r.edge}px) - an interior `
        + 'edge has to be clipped, or it grows the shape it was drawn on');
    }
  }

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail.slice(0, 12)) console.error('  - ' + f);
    if (fail.length > 12) console.error(`  ... and ${fail.length - 12} more`);
    process.exit(1);
  }
  console.log(`ok: ${rows.length} creatures, none touching the frame; they average `
    + `${avg.toFixed(1)}% interior detail with the flattest (${worst.art}) at `
    + `${worst.detail}%; the dimmest (${dimmest.art}, ${dimmest.mean}) still clears the `
    + `brightest ground (${brightest.map}, ${brightest.v}) by `
    + `${(dimmest.mean - brightest.v).toFixed(0)}; and the most alike pair `
    + `(${close.pair}) still differ across ${(close.v * 100).toFixed(0)}% of their drawing`);
})();
