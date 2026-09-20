#!/usr/bin/env node
/* The survivor, measured.
 *
 * src/render/hero.js draws the most-looked-at thing in the game, and the ways
 * a character sprite goes wrong are all invisible in code review and obvious
 * in a measurement. Every rule below is one that was actually broken.
 *
 *   posed      A flinch and a death, held to every rule the walk is. A pose
 *              moves the WHOLE figure - going down turns about the feet and
 *              ends lying across the tile - which is a new and very easy way
 *              to run out of canvas, and the first version did exactly that:
 *              the last four frames of the death were a stump. Every frame of
 *              every pose on every survivor is read here.
 *
 *   dies       And the moment itself: it must start, the world must be FROZEN
 *              while it plays, the pose must advance, and it must end on the
 *              death screen. Negative tests, all confirmed - going straight to
 *              the results panel gives "running out of health went straight to
 *              over"; letting the horde keep moving gives "the horde kept
 *              moving during the death (8.0px)"; and putting the cloak's
 *              translate back gives "mage's down pose is cut off by the frame
 *              at frame 7", which is the bug that a crouch is a negative lift
 *              and a hem does not sink through a floor.
 *
 *   framed     Nothing may touch the edge of the sprite's own canvas. A sprite
 *              is one square image and anything past its edge is cut with a
 *              straight line, which on a halo or a glow reads instantly as a
 *              flat top. Measured before the CEIL constant existed: the priest
 *              and paladin haloes bled 64 pixels into the frame each, the
 *              mage's staff gem 25, the ruinseeker's horns 13.
 *
 *   planted    The feet must land where the renderer and the portrait both
 *              believe they land. Both position the image by that anchor and
 *              neither can see it move, so a rig change that lifted the figure
 *              two units would have every survivor hovering and nothing would
 *              say so.
 *
 *   distinct   No two survivors may share a silhouette. At the size this is
 *              played nobody reads a face - they read an outline - so classes
 *              that overlap are classes a player cannot tell apart. Measured
 *              as intersection-over-union of the two alpha masks. The mage,
 *              warlock and shaman were all slim, robed and long-cloaked, which
 *              put mage/warlock at 0.855 of the same shape; legs for the
 *              shaman, a heavier build and a ragged hem for the warlock took
 *              the worst pair to 0.79.
 *
 *   individual And no two may be the same DRAWING, which is a different
 *              question from the same outline. Compared with every survivor
 *              forced to one grey - so what is measured is the character and
 *              not the tint, since two identical figures in different colours
 *              are still one character - each pair must differ across DIFF of
 *              the pixels either of them covers. This is what keeps the
 *              per-survivor marks (a sash, a stole, a scarf, a pelt, horns on
 *              the helm, chains, a tome, a charge, a notched blade) from being
 *              quietly dropped or duplicated later.
 *
 *   walks      The stride must be a walk and not a hop. Every survivor is
 *              baked into a cycle of frames, and three things have to hold
 *              across it: the FEET STAY DOWN (the first version lifted the
 *              whole figure, legs included, and both boots came off the floor
 *              twice a stride - a walk where nobody is touching the ground is
 *              a hop); the standing frame PLANTS WHERE THE WALKING ONES DO,
 *              or the survivor jumps a pixel the moment the player presses a
 *              key; and the drawing has to actually CHANGE, or the cycle is
 *              eight copies of a statue and the whole thing is decoration in
 *              the cache.
 *
 *   visible    Every survivor must out-value the ground they stand on. The
 *              identity colours run from [1,1,1] to [0,0.44,0.87], so painting
 *              the body in them made the priest a white cut-out and the shaman
 *              nearly the colour of the floor. Ground luminance is measured
 *              from the maps themselves rather than assumed - the brightest is
 *              Dustreach at 40, the darkest the arena at 15 - and no survivor
 *              may come within MARGIN of the brightest.
 *
 *   modelled   Each figure must span a real range of value. A flat fill is a
 *              cut-out however good the outline is; one consistent light is
 *              most of what separates a drawing from a diagram.
 *
 *   repeatable Two draws with the same arguments must be the same pixels. The
 *              whole cast is cached by (id, tint, size) and served from that
 *              cache for the life of the page, so a sprite that varied per
 *              draw would freeze whichever variant happened to be first.
 *
 * NEGATIVE TESTS - every one confirmed to fail against a build with the fix
 * removed: restoring the old halo height gives "priest is cut off by the frame
 * (64px against the edge)"; lifting the rig gives "mage plants its feet at
 * 0.85 of the box, not 0.87"; restoring the robed slim shaman gives "mage and
 * warlock share 0.86 of one silhouette"; darkening the garments past the floor
 * gives "warlock reads at 50 against ground that reaches 41"; randomising the
 * axe head gives "two identical draws of the warrior differ in 2912 bytes" -
 * which the first version of that check MISSED, because it tested one survivor
 * and the one it tested carried a greatsword. Giving two survivors the same
 * configuration gives "mage and priest differ across only 3% of their drawing
 * with the tint removed - in one colour they are the same character". Lifting
 * the whole figure again gives "hunter's feet travel 6.7px over the stride -
 * both boots leave the floor, which is a hop, not a walk"; flattening the
 * stride gives "mage only changes 0.0% a frame - the stride is a statue copied
 * eight times".
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-hero.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const ANCHOR = [0.855, 0.885];   // where the feet land, as a fraction of the box
const IOU = 0.84;                // two survivors may not share more shape than this
const DIFF = 0.35;               // and must differ across this much of their drawing
const MARGIN = 18;               // luminance a survivor must clear the ground by
/* How much DRAWING is inside the outline: the share of interior pixels where
 * the local gradient is steep, silhouette edges excluded because those are
 * free. The cast sat at 41% while the horde it fights was brought to 40, and
 * the survivors are the most-looked-at thing in the game - so they were taken
 * to 50 and the number is held here. A mean can be carried by the good ones,
 * so the flattest single survivor has a floor too. */
const DETAIL_FLOOR = 50;         // cast average, %
const THINNEST = 44;             // the flattest single survivor, %
const RANGE = 120;               // luminance a survivor must span, to have form
const FILL = [0.10, 0.42];       // how much of the box the figure fills at 34px
/* px a foot may travel over the stride, at a 120px sprite. Set from BOTH
 * sides and it had to be: the walking build measures 2.0 and the hop measures
 * 4.0, so the 4 this started at would have passed the exact bug it was written
 * for. Nearly the third guard this session whose threshold was wrong before
 * the code was. */
const FOOT = 3;
const STEP = 0.005;              // how far the standing plant may sit from walking
const MOTION = 0.04;             // fraction of the figure that must move per frame

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const fail = [];
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && window.WS.Sprites && window.WS.Hero);

  const report = await page.evaluate(() => {
    /* A fresh profile gets the prologue, and its layer covers the whole
       screen - which is the point of it. A harness has to walk past it
       before it can drive anything. */
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    const ids = Object.keys(WS.Characters);

    /* The ground, read off the maps rather than guessed at. A survivor is only
     * as visible as the darkest thing they are NOT, so the bar has to come
     * from the brightest floor in the game. */
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
    WS.Game.quitToMenu ? WS.Game.quitToMenu() : 0;

    const read = (id, size, pose, rank) => {
      const c = WS.Sprites.hero(id, WS.Characters[id].color, size, false, undefined, pose, rank);
      const w = c.width, h = c.height;
      const d = c.getContext('2d').getImageData(0, 0, w, h).data;
      const solid = new Uint8Array(w * h);
      let lo = 1e9, hi = -1, sum = 0, n = 0, bottom = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          // Solid only: the ground shadow and the rim stamp are both partly
          // transparent, and neither is part of the figure's shape.
          if (d[i + 3] <= 200) continue;
          solid[y * w + x] = 1;
          const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          sum += L; n++;
          if (L < lo) lo = L;
          if (L > hi) hi = L;
          if (y > bottom) bottom = y;
        }
      }
      // Framing is judged on ANY visible pixel, however faint - a clipped glow
      // is a straight line across a soft edge, which is worse than a hard one.
      let edge = 0;
      for (let x = 0; x < w; x++) {
        if (d[x * 4 + 3] > 40) edge++;
        if (d[((h - 1) * w + x) * 4 + 3] > 40) edge++;
      }
      for (let y = 0; y < h; y++) {
        if (d[y * w * 4 + 3] > 40) edge++;
        if (d[(y * w + w - 1) * 4 + 3] > 40) edge++;
      }
    return { solid, w, h, mean: sum / Math.max(1, n), range: hi - lo, n, bottom, edge };
    };

    const big = {}, small = {};
    for (const id of ids) { big[id] = read(id, 140); small[id] = read(id, 34); }

    /* ---- what a survivor EARNS, held to the same three rules -------------
     *
     * The rank ladder adds parts to the kit, and every rule this file exists
     * to enforce applies to a survivor who has earned something just as much
     * as to one who has not:
     *
     *   framed    A crown sits nearer the top of the tile than anything else
     *             in the rig. If it is going to be cut by the canvas edge,
     *             this is where that gets caught.
     *   distinct  No two survivors may share a silhouette - and the danger
     *             with a ladder is that everyone converges on the same
     *             embellishments and arrives at the same figure. The ladder
     *             is deliberately ONE set of parts for the whole cast, so
     *             this is the check that says whether that was affordable.
     *   earned    A rank that changes nothing is not a rank. Measured at the
     *             78px the game actually draws, the first version of rank 3
     *             moved NINE pixels on the mage, because it was drawn inside
     *             a cloak the mage already wore. */
    const MAXR = WS.Hero.maxRank;
    const ranked = {};
    for (const id of ids) {
      ranked[id] = [];
      for (let r = 0; r <= MAXR; r++) ranked[id].push(read(id, 140, undefined, r));
    }

    // framed, at every rank
    const clipped = [];
    for (const id of ids) {
      for (let r = 1; r <= MAXR; r++) {
        if (ranked[id][r].edge > 0) clipped.push(`${id} at rank ${r} (${ranked[id][r].edge}px)`);
      }
    }

    // earned: each rank against the one below it, at play size
    const grey2 = [0.55, 0.55, 0.58];
    const steps = [];
    for (const id of ids) {
      for (let r = 1; r <= MAXR; r++) {
        const a = WS.Sprites.hero(id, grey2, 78, false, undefined, null, r);
        const b = WS.Sprites.hero(id, grey2, 78, false, undefined, null, r - 1);
        const A = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
        const B = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
        let n = 0;
        for (let k = 0; k < A.length; k += 4) {
          const d = Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1])
            + Math.abs(A[k + 2] - B[k + 2]) + Math.abs(A[k + 3] - B[k + 3]);
          if (d > 60) n++;
        }
        steps.push({ id, r, n });
      }
    }

    // distinct, with the whole cast raised to the top of the ladder
    const flatTop = {};
    for (const id of ids) {
      const c = WS.Sprites.hero(id, grey2, 76, false, undefined, null, MAXR);
      flatTop[id] = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    }
    let sameTop = { pair: '', v: 2 };
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const A = flatTop[ids[i]], B = flatTop[ids[j]];
        let seen = 0, diff = 0;
        for (let k = 0; k < A.length; k += 4) {
          if (A[k + 3] < 60 && B[k + 3] < 60) continue;
          seen++;
          const d = Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1])
            + Math.abs(A[k + 2] - B[k + 2]) + Math.abs(A[k + 3] - B[k + 3]);
          if (d > 60) diff++;
        }
        const v = diff / Math.max(1, seen);
        if (v < sameTop.v) sameTop = { pair: ids[i] + ' and ' + ids[j], v };
      }
    }

    /* THE POSES, held to the same frame rule as the walk.
     *
     * A pose moves the whole figure - a survivor going down turns about their
     * feet and ends up lying across the tile - which is a new and very easy
     * way to run out of canvas. The first version of the death did exactly
     * that: the last four frames were a stump with the head cut off at x=0,
     * and it looked like a rendering fault rather than a fall. Every frame of
     * every pose is read here, on every survivor, for the same reason the
     * standing sprite is. */
    const posed = [];
    for (const kind of Object.keys(WS.Hero.poseFrames)) {
      const n = WS.Hero.poseFrames[kind];
      for (const id of ids) {
        for (let f = 0; f < n; f++) {
          const r = read(id, 128, { kind, frame: f });
          posed.push({ id, kind, frame: f, edge: r.edge, n: r.n });
        }
      }
    }


    let worst = { pair: '', v: -1 };
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const A = big[ids[i]], B = big[ids[j]];
        let inter = 0, uni = 0;
        for (let k = 0; k < A.solid.length; k++) {
          if (A.solid[k] || B.solid[k]) uni++;
          if (A.solid[k] && B.solid[k]) inter++;
        }
        const v = inter / uni;
        if (v > worst.v) worst = { pair: ids[i] + ' and ' + ids[j], v };
      }
    }

    /* The walk, read off the baked frames. */
    const N = WS.Hero.frames, WSZ = 120;
    const gait = ids.map((id) => {
      const masks = [], feet = [];
      for (let f = 0; f < N; f++) {
        const c = WS.Sprites.hero(id, WS.Characters[id].color, WSZ, false, f);
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const m = new Uint8Array(c.width * c.height);
        let bottom = -1;
        for (let i = 0, k = 0; i < d.length; i += 4, k++) {
          if (d[i + 3] > 200) { m[k] = 1; const y = (k / c.width) | 0; if (y > bottom) bottom = y; }
        }
        masks.push(m); feet.push(bottom / c.height);
      }
      const st = WS.Sprites.hero(id, WS.Characters[id].color, WSZ);
      const sd = st.getContext('2d').getImageData(0, 0, st.width, st.height).data;
      let sf = -1;
      for (let i = 0, k = 0; i < sd.length; i += 4, k++) {
        if (sd[i + 3] > 200) { const y = (k / st.width) | 0; if (y > sf) sf = y; }
      }
      let motion = 0;
      for (let f = 0; f < N; f++) {
        const A = masks[f], B = masks[(f + 1) % N];
        let diff = 0, area = 0;
        for (let k = 0; k < A.length; k++) { if (A[k] || B[k]) area++; if (A[k] !== B[k]) diff++; }
        motion += diff / Math.max(1, area);
      }
      return {
        id,
        foot: (Math.max(...feet) - Math.min(...feet)) * WSZ,
        step: Math.abs(sf / st.height - feet[0]),
        motion: motion / N,
      };
    });

    /* Individuality, with the tint taken out of it. */
    const grey = [0.55, 0.55, 0.58];
    const flat = {};
    for (const id of ids) {
      const c = WS.Sprites.hero(id, grey, 76);
      flat[id] = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    }
    let same = { pair: '', v: 2 };
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const A = flat[ids[i]], B = flat[ids[j]];
        let seen = 0, diff = 0;
        for (let k = 0; k < A.length; k += 4) {
          if (A[k + 3] < 60 && B[k + 3] < 60) continue;
          seen++;
          const d = Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1])
            + Math.abs(A[k + 2] - B[k + 2]) + Math.abs(A[k + 3] - B[k + 3]);
          if (d > 60) diff++;
        }
        const v = diff / Math.max(1, seen);
        if (v < same.v) same = { pair: ids[i] + ' and ' + ids[j], v };
      }
    }

    /* Two draws, same arguments, straight past the cache - for EVERY survivor.
     * Checking one of them let a randomised axe head through unnoticed, because
     * the one being checked carried a greatsword. A cast-wide property needs a
     * cast-wide test. */
    const draw = (id) => {
      const c = document.createElement('canvas');
      c.width = c.height = 140;
      WS.Hero.draw(c.getContext('2d'), 140, id, WS.Characters[id].color);
      return c.getContext('2d').getImageData(0, 0, 140, 140).data;
    };
    let drift = 0, drifted = '';
    for (const id of ids) {
      const a = draw(id), b = draw(id);
      let d = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
      if (d > drift) { drift = d; drifted = id; }
    }

    return {
      ground, posed,
      worst, same, gait,
      drift, drifted,
      rank: { maxR: MAXR, clipped, steps, sameTop },
      cast: ids.map((id) => ({
        id,
        edge: big[id].edge,
        anchor: big[id].bottom / big[id].h,
        mean: big[id].mean,
        range: big[id].range,
        fill: small[id].n / (small[id].w * small[id].h),
      })),
    };
  });

  /* ------------------------------------------ how much is inside the line --
   *
   * The share of interior pixels where the local gradient is steep, silhouette
   * edges excluded because those are free. Measured in its own pass rather
   * than folded into `read`, because it wants the whole figure at a size where
   * a rivet is more than one pixel.
   *
   * The cast sat at 41% while the horde it fights was being brought to 40, and
   * these are the most-looked-at drawings in the game - so they were taken to
   * 50 and the number is held here rather than left to drift. */
  const drawn = await page.evaluate(() => {
    const S = 220;
    return WS.Hero.ids.map((id) => {
      const sp = WS.Sprites.hero(id, WS.Characters[id].color, S, false, undefined, null, 0);
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
      let inside = 0, steep = 0;
      for (let y = 1; y < S - 1; y++) {
        for (let x = 1; x < S - 1; x++) {
          const i = y * S + x;
          if (A[i] < 200) continue;
          if (A[i - 1] < 200 || A[i + 1] < 200 || A[i - S] < 200 || A[i + S] < 200) continue;
          inside++;
          const m = Math.max(Math.abs(L[i + 1] - L[i - 1]), Math.abs(L[i + S] - L[i - S]));
          if (m > 14) steep++;
        }
      }
      return { id, v: +((100 * steep) / Math.max(1, inside)).toFixed(1) };
    });
  });
  const drawnAvg = drawn.reduce((n, r) => n + r.v, 0) / drawn.length;
  const flattest = drawn.reduce((a, r) => (r.v < a.v ? r : a));
  if (drawnAvg < DETAIL_FLOOR) {
    fail.push(`the cast averages ${drawnAvg.toFixed(1)}% interior detail, below the floor `
      + `of ${DETAIL_FLOOR} - a strong outline with nothing inside it is a cut-out`);
  }
  if (flattest.v < THINNEST) {
    fail.push(`${flattest.id} is drawn at ${flattest.v}% interior detail, below the floor `
      + `of ${THINNEST} - the average can be carried by the good ones`);
  }

  const brightest = Math.max(...Object.values(report.ground));
  const brightestMap = Object.keys(report.ground)
    .find((k) => report.ground[k] === brightest);

  for (const c of report.cast) {
    if (c.edge > 0) {
      fail.push(`${c.id} is cut off by the frame (${c.edge}px against the edge)`);
    }
    if (c.anchor < ANCHOR[0] || c.anchor > ANCHOR[1]) {
      fail.push(`${c.id} plants its feet at ${c.anchor.toFixed(3)} of the box, `
        + `not ${ANCHOR[0]}..${ANCHOR[1]}`);
    }
    if (c.mean < brightest + MARGIN) {
      fail.push(`${c.id} reads at ${c.mean.toFixed(0)} against ground that reaches `
        + `${brightest.toFixed(0)} on ${brightestMap} - too close to disappear into it`);
    }
    if (c.range < RANGE) {
      fail.push(`${c.id} spans only ${c.range.toFixed(0)} of luminance - a flat `
        + 'cut-out rather than a lit figure');
    }
    if (c.fill < FILL[0] || c.fill > FILL[1]) {
      fail.push(`${c.id} fills ${(c.fill * 100).toFixed(0)}% of the box at 34px`);
    }
  }
  if (report.worst.v > IOU) {
    fail.push(`${report.worst.pair} share ${report.worst.v.toFixed(2)} of one `
      + 'silhouette - at play size they are the same character');
  }
  for (const g of report.gait) {
    if (g.foot > FOOT) {
      fail.push(`${g.id}'s feet travel ${g.foot.toFixed(1)}px over the stride `
        + '- both boots leave the floor, which is a hop, not a walk');
    }
    if (g.step > STEP) {
      fail.push(`${g.id} plants ${(g.step * 100).toFixed(1)}% of a body differently `
        + 'standing than walking - they jump the moment a key goes down');
    }
    if (g.motion < MOTION) {
      fail.push(`${g.id} only changes ${(g.motion * 100).toFixed(1)}% a frame `
        + '- the stride is a statue copied eight times');
    }
  }
  if (report.same.v < DIFF) {
    fail.push(`${report.same.pair} differ across only `
      + `${(report.same.v * 100).toFixed(0)}% of their drawing with the tint removed `
      + '- in one colour they are the same character');
  }
  if (report.drift > 0) {
    fail.push(`two identical draws of the ${report.drifted} differ in `
      + `${report.drift} bytes - the sprite cache would freeze whichever came first`);
  }

  /* ---- and the moment it is actually used ------------------------------
   *
   * Running out of health used to be instantaneous: the survivor stopped
   * being drawn and a results panel slid over the field they died on. Half an
   * hour of accumulated build ended like a dropped connection. So death is a
   * state that lasts a second and a half, and this checks the whole of it -
   * that it starts, that the simulation is FROZEN while it plays (the last
   * frame should be the picture of what actually got you), that the pose
   * advances rather than sitting on frame zero, that the light the survivor
   * was carrying goes out, and that it ends on the death screen rather than
   * anywhere else. */
  const death = await page.evaluate(async () => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true;
    WS.Game.startRun('thornhollow', 'mage');
    WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
    const p = WS.Game.player;
    /* No Ashen Ankh. This harness calls Save.unlockAll() further up to get the
       whole roster on screen, and unlockAll now opens the Trainer too - which
       includes the rank that lets you cheat death once per run. So the killing
       blow below stopped killing: the survivor came back at half health and
       the run carried on, and this read as "there is no moment of dying at
       all". What is being measured here is the death, so the revive goes. */
    p.revives = 0;
    // Something on the field, so we can tell whether the world froze.
    WS.Enemy.pool.releaseAll();
    const e = WS.Enemy.spawn('mongrel', 300, 300, 1);
    const seen = [];
    /* Count what the death actually says. There is a beat between the blow and
       the results panel now, and both ends of it used to play the death kit -
       so a single death was heard twice, a second and a half apart. */
    const heard = [];
    const realPlay = WS.Audio.play;
    WS.Audio.play = function (kit, x) { heard.push(kit); return realPlay.call(this, kit, x); };
    p.health = 1;
    WS.Player.takeDamage(p, 9999, 'the check');
    const started = WS.Game.state;
    const where = { x: e.x, y: e.y };
    const frames = [];
    for (let i = 0; i < 8; i++) {
      WS.Game.update(0.1);
      frames.push({ k: +WS.Game.deathProgress().toFixed(3), state: WS.Game.state });
      seen.push(WS.Renderer && 1);
    }
    const moved = Math.hypot(e.x - where.x, e.y - where.y);
    // and run it out
    for (let i = 0; i < 30 && WS.Game.state === 'dying'; i++) WS.Game.update(0.1);
    WS.Audio.play = realPlay;
    return { started, frames, moved, ended: WS.Game.state,
      deaths: heard.filter((k) => k === 'death').length,
      overlay: !document.getElementById('overlay').classList.contains('hidden'),
      beat: WS.Config.deathBeat };
  });
  if (death.started !== 'dying') {
    fail.push(`running out of health went straight to "${death.started}" - there is no `
      + 'moment of dying at all');
  }
  if (!(death.frames.length && death.frames[death.frames.length - 1].k > 0.4)) {
    fail.push('the death does not advance - the pose would sit on its first frame');
  }
  if (death.moved > 0.01) {
    fail.push(`the horde kept moving during the death (${death.moved.toFixed(1)}px) - the `
      + 'last frame of a run should be the picture of what got you');
  }
  if (death.ended !== 'over') {
    fail.push(`the death ended in state "${death.ended}", not on the death screen`);
  }
  if (!death.overlay) fail.push('the death screen never arrived');
  if (death.deaths !== 1) {
    fail.push(`dying once played the death sound ${death.deaths} times - it belongs at the `
      + 'blow, and the results panel is not a second death');
  }

  await browser.close();
  /* Poses obey the frame rule too, and must actually be drawings - a pose
     that silently rendered nothing would otherwise pass a rule about edges. */
  const poseKinds = new Set();
  for (const q of report.posed) {
    poseKinds.add(q.kind);
    if (q.edge > 0) {
      fail.push(`${q.id}'s ${q.kind} pose is cut off by the frame at frame ${q.frame} `
        + `(${q.edge}px against the edge)`);
    }
    if (q.n < 200) {
      fail.push(`${q.id}'s ${q.kind} pose draws almost nothing at frame ${q.frame} `
        + `(${q.n} pixels)`);
    }
  }

  /* ---- the rank ladder -------------------------------------------------- */
  const rk = report.rank;
  for (const c of rk.clipped) {
    fail.push(`${c} is cut by the edge of its own tile - a crown sits nearer the `
      + 'top than anything else in the rig, and this is where that shows');
  }
  /* 120 changed pixels of a 78px tile, which is 2%. Under that a rank is a
     rumour: rank 3 measured NINE on the mage when it was drawn inside a cloak
     the mage already wore, and rank 2 measured eighteen on the rogue when the
     mantle sat inside a sleeve. */
  const thin = rk.steps.filter((x) => x.n < 120);
  for (const x of thin.slice(0, 4)) {
    fail.push(`${x.id} rank ${x.r} changes ${x.n} pixels of the survivor - `
      + 'nothing a player would see for having earned it');
  }
  /* The ladder is one set of parts for the whole cast, so the question is
     whether the cast is still ten people once every one of them has climbed
     it. Held to DIFF - the SAME floor the base roster is held to, not a
     slacker one invented for the occasion. (The first version of this line
     compared against 0.55, which is not a floor at all: it confused the
     fraction that DIFFERS with the share that matches, and would have failed
     the shipped roster.) */
  if (rk.sameTop.v < DIFF) {
    fail.push(`at the top of the ladder ${rk.sameTop.pair} share `
      + `${(1 - rk.sameTop.v).toFixed(2)} of a silhouette - the ranks are `
      + 'turning the cast into one character');
  }

  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    process.exit(1);
  }
  const dim = report.cast.reduce((a, c) => (c.mean < a.mean ? c : a));
  console.log(`ok: ${report.cast.length} survivors averaging ${drawnAvg.toFixed(1)}% interior detail (thinnest ${flattest.id}, ${flattest.v}%), none touching the frame, all `
    + `planted at 0.86-0.88; the closest pair (${report.worst.pair}) share `
    + `${report.worst.v.toFixed(2)} of a silhouette; every survivor climbs `
    + `${rk.maxR} ranks with the thinnest step still moving `
    + `${Math.min(...rk.steps.map((x) => x.n))} pixels and the closest pair at the `
    + `top still ${(1 - rk.sameTop.v).toFixed(2)} apart; the dimmest (${dim.id}, `
    + `${dim.mean.toFixed(0)}) still clears the brightest ground `
    + `(${brightestMap}, ${brightest.toFixed(0)}) by ${(dim.mean - brightest).toFixed(0)}; `
    + `the most alike pair (${report.same.pair}) still differ across `
    + `${(report.same.v * 100).toFixed(0)}% of their drawing in one colour; `
    + `every survivor draws the same pixels twice; and the walk keeps its feet `
    + `down (${Math.max(...report.gait.map((g) => g.foot)).toFixed(1)}px of travel) `
    + `while moving at least `
    + `${(Math.min(...report.gait.map((g) => g.motion)) * 100).toFixed(0)}% a frame; `
    + `${report.posed.length} frames of ${poseKinds.size} poses (a flinch and going down) `
    + `stay inside their own tile on every survivor, and running out of health holds the `
    + `world still for ${death.beat}s while they go over`);
})();
