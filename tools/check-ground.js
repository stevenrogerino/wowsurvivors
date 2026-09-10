#!/usr/bin/env node
/* Does the field look like ground, or like a tile?
 *
 * It was a 256px canvas of mottle repeated across the world, and that is
 * visible for two separate reasons - only one of which is the repetition.
 *
 * The obvious one: the same two hundred blobs appear fifteen times on a
 * 1280x720 field, and the eye finds a repeat that large immediately.
 *
 * The worse one, and the one a player actually described as a grid: the blobs
 * were drawn at random positions inside the tile and never wrapped, so every
 * blob near an edge was sliced off flat. That put a straight hard cut down
 * every seam - a row of clipped ellipse edges every 256 pixels in both
 * directions. Repetition is a texture you get bored of; a seam is a LINE, and
 * a line on the ground reads as a rendering fault.
 *
 * So three measurements, on the bare ground of every battlefield with nothing
 * else on the field:
 *
 *   period    A tile shows up as a LOCAL MINIMUM in the curve of "how much
 *             does this image differ from itself, shifted by n". Two earlier
 *             formulations of this measured the wrong thing and both passed a
 *             seamless field while calling it a tile. An absolute threshold
 *             just measures darkness - on dim ground every shift comes back
 *             within a luminance unit or two. A ratio against the median shift
 *             just measures smoothness - nearby pixels are alike, so every
 *             small shift "dips". What is actually diagnostic is a dip
 *             against its OWN NEIGHBOURS: a tiled ground matches itself far
 *             better at exactly 256 than at 236 or 276, and nothing else in
 *             nature does that.
 *
 *   seams     A column that is a seam has a much bigger step across it than
 *             its neighbours. Every column's mean absolute difference from the
 *             one before it is measured, and the worst may not be an outlier
 *             against the median. Same for rows. This is the one that catches
 *             the clipped-blob edge, which the period test alone would not:
 *             a seam is visible even in a ground that never repeats.
 *
 *   texture   And having removed the grid, the ground must still BE something.
 *             Local contrast is measured in small windows - a field of soft
 *             low-alpha blobs averages into a smooth wash, which is what the
 *             first attempt at this produced. Grain needs a hard middle.
 *
 * It also pins the overall brightness of each map, because check-loot and
 * check-hero both measure things AGAINST the ground and a quiet change here
 * would move their thresholds without either of them explaining why.
 *
 * NEGATIVE TESTS, both confirmed. Restoring the 256px repeating pattern fails
 * twice over, which is the point of having two rules: "thornhollow repeats
 * itself every 256px: it matches itself 2.08x better at exactly that shift
 * than 22px either side" AND "thornhollow has a seam at x=512: the step across
 * that column is 3.7x the typical one". And rebuilding each blob's gradient in
 * the wrong user space - the real bug this file caught while it was being
 * written - fails at "thornhollow is smooth - local contrast 1.6".
 *
 * That last one is worth the space. Every blob's gradient was created at (x,y)
 * and then drawn inside a translate to (x,y), so each one was centred a full
 * blob away from the circle it was filling and painted nothing. The field came
 * out a flat fill, and turning the alpha up moved the measured contrast by a
 * hundredth of a unit. A number that will not move is not a weak effect; it is
 * an effect that is not running, and that was the tell.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-ground.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const PERIODS = [64, 128, 192, 256, 320, 384, 512];
const NEAR = 22;         // how far either side of a period counts as its neighbourhood
const DIP = 0.80;        // a period this much more alike than its neighbours IS a tile
const SEAM = 3.0;        // a column step may not exceed this many times the median
const TEXTURE = 5.0;     // mean local contrast the ground must carry
const fail = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && window.WS.Renderer);

  const rows = await page.evaluate((PER) => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    const out = [];
    for (const map of Object.keys(WS.Maps)) {
      if (WS.Maps[map].arena) continue;
      WS.Game.startRun(map, 'mage');
      /* Straight to the game, not through the card.
         Picking a card is a UI act and the UI now holds the frame for a beat
         before it resolves - which a harness that drives Game.update in a
         synchronous loop can never wait out. The choice screens have their own
         guard in tools/check-choice.js; what this file is measuring is what
         happens after one. */
      WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
      /* Bare ground and nothing else: no horde, no loot, no survivor, no
         props. Props are legitimately repeated art and would swamp every
         measurement here with their own similarity. */
      WS.Enemy.pool.releaseAll(); WS.XP.pool.releaseAll();
      WS.Pickup.pool.releaseAll(); WS.Hazard.pool.releaseAll();
      const keepProps = WS.Renderer.props.slice();
      WS.Renderer.props.length = 0;
      WS.Game.player.x = -900; WS.Game.player.y = -900;
      WS.Renderer.draw(3);
      WS.Renderer.props.push(...keepProps);

      const R = WS.Renderer, dpr = R.dpr;
      const ctx = document.getElementById('game-canvas').getContext('2d');
      // A square of the field, well inside the letterbox and away from the HUD.
      const S = 640;
      const px = Math.round((R.offsetX + 320 * R.scale) * dpr);
      const py = Math.round((R.offsetY + 60 * R.scale) * dpr);
      const n = Math.round(S * R.scale * dpr);
      const img = ctx.getImageData(px, py, n, n).data;
      // luminance only: a repeat is a repeat whatever colour it is in
      const L = new Float32Array(n * n);
      let sum = 0;
      for (let i = 0, j = 0; i < img.length; i += 4, j++) {
        L[j] = 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
        sum += L[j];
      }
      const mean = sum / (n * n);

      // --- period: the image against itself, shifted
      const madAt = (p) => {
        const shift = Math.round(p * R.scale * dpr);
        if (shift >= n - 8) return null;
        let d = 0, c = 0;
        for (let y = 0; y < n; y += 2) {
          for (let x = 0; x + shift < n; x += 2) {
            d += Math.abs(L[y * n + x] - L[y * n + x + shift]); c++;
          }
        }
        return d / c;
      };
      const periods = [];
      for (const p of PER.periods) {
        const m = madAt(p);
        if (m === null) continue;
        // its own neighbourhood, which is what makes this a dip test
        const lo = madAt(p - PER.near), hi = madAt(p + PER.near);
        const around = [lo, hi].filter((v) => v !== null);
        if (!around.length) continue;
        const near = around.reduce((a, b) => a + b, 0) / around.length;
        periods.push({ p, mad: m, ratio: m / (near || 0.0001) });
      }

      // --- seams: the step across each column, against the typical step
      const step = new Float64Array(n);
      for (let x = 1; x < n; x++) {
        let d = 0;
        for (let y = 0; y < n; y++) d += Math.abs(L[y * n + x] - L[y * n + x - 1]);
        step[x] = d / n;
      }
      const sorted = [...step].slice(1).sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)] || 0.0001;
      let worstStep = 0, worstAt = 0;
      for (let x = 1; x < n; x++) if (step[x] > worstStep) { worstStep = step[x]; worstAt = x; }

      // --- texture: local contrast in small windows
      let cSum = 0, cN = 0;
      for (let y = 0; y + 8 < n; y += 8) {
        for (let x = 0; x + 8 < n; x += 8) {
          let lo = 1e9, hi = -1;
          for (let j = 0; j < 8; j++) {
            for (let i = 0; i < 8; i++) {
              const v = L[(y + j) * n + x + i];
              if (v < lo) lo = v; if (v > hi) hi = v;
            }
          }
          cSum += hi - lo; cN++;
        }
      }
      out.push({ map, mean, periods, texture: cSum / cN,
        seam: worstStep / med, seamAt: Math.round(worstAt / (R.scale * dpr)) + 320,
        px: n });
    }
    return out;
  }, { periods: PERIODS, near: NEAR });

  for (const r of rows) {
    for (const q of r.periods) {
      if (q.ratio < DIP) {
        fail.push(`${r.map} repeats itself every ${q.p}px: it matches itself `
          + `${(1 / q.ratio).toFixed(2)}x better at exactly that shift than ${NEAR}px `
          + 'either side of it - that is a tile, and the eye finds it');
      }
    }
    if (r.seam > SEAM) {
      fail.push(`${r.map} has a seam at x=${r.seamAt}: the step across that column is `
        + `${r.seam.toFixed(1)}x the typical one - a line on the ground reads as a fault`);
    }
    if (r.texture < TEXTURE) {
      fail.push(`${r.map} is smooth - local contrast ${r.texture.toFixed(1)}. Removing a `
        + 'grid is not the same as having ground');
    }
    if (r.mean > 70) {
      fail.push(`${r.map}'s ground reads ${r.mean.toFixed(0)} bright - the loot and the `
        + 'survivors are measured against it, and above this they stop clearing it');
    }
  }

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail.slice(0, 12)) console.error('  - ' + f);
    if (fail.length > 12) console.error(`  ... and ${fail.length - 12} more`);
    process.exit(1);
  }
  const worstP = rows.reduce((a, r) => {
    const m = r.periods.reduce((x, q) => (q.ratio < x.ratio ? q : x));
    return m.ratio < a.ratio ? { map: r.map, ...m } : a;
  }, { ratio: 1e9 });
  const worstS = rows.reduce((a, r) => (r.seam > a.seam ? r : a));
  const flattest = rows.reduce((a, r) => (r.texture < a.texture ? r : a));
  console.log(`ok: ${rows.length} battlefields, none of them a tile - the closest any comes `
    + `to repeating is ${worstP.map} at ${worstP.p}px, and even there it is only `
    + `${(1 / worstP.ratio).toFixed(2)}x more like itself than at shifts either side `
    + `(${(1 / DIP).toFixed(2)}x would be a tile); the sharpest column step anywhere is `
    + `${worstS.seam.toFixed(1)}x the typical one on ${worstS.map}; and the flattest ground `
    + `(${flattest.map}) still carries ${flattest.texture.toFixed(1)} of local contrast`);
})();
