#!/usr/bin/env node
/* Repetition's guard rail. Every rule here was written after measuring the
 * thing it now forbids, off the real effect and music buses in a real browser.
 *
 *   same      A sound is not annoying because it is loud, or because it is
 *             often. It is annoying because it is IDENTICAL - past some
 *             number of exact repeats the ear stops hearing an event and
 *             starts hearing a mechanism, and no amount of mixing fixes that.
 *             Measured: every noise-based voice in the game read from sample
 *             zero of one shared buffer, so every hit, crit and explosion in
 *             a run was the same two hundred milliseconds of the same noise;
 *             and pitch jitter existed only on the chatter kits and only as a
 *             function of how crowded the field was, which at one hit - most
 *             of a run - was a five per cent spread nobody can hear. `warn`
 *             measured 0.08 on the scale below. It was the same sound.
 *
 *   period    The weather bed is one looping buffer, and a loop has a period
 *             whether or not anyone chose one. At 1.2 seconds its envelope
 *             autocorrelated 0.90 against itself one loop later, with
 *             harmonics at 2.4, 3.6 and 4.8 - a texture repeating fifty times
 *             a minute, which is what "a grainy hum" IS. A drifting filter
 *             over the top never touched the period underneath it.
 *
 *   moves     The chord bed was root, fifth and octave stacked on whatever
 *             degree the arpeggio had just landed on: the same interval
 *             stack, forever, sliding in parallel. A zone was ONE CHORD for
 *             as long as the player stood in it, and a phrase table over a
 *             piece with no harmonic movement is only a more varied way of
 *             saying the same thing. Every score now names four centres.
 *
 * ON THE SCALE `same` USES. It is the mean absolute difference, per bin,
 * between the peak-held spectra of two plays, after each spectrum has had its
 * own mean taken out - shape, not level, because a fifty-millisecond blip
 * sampled by a forty-six-millisecond analyser window lands somewhere
 * different in its own envelope every time, and that alone put two provably
 * identical square tones five decibels apart before the normalisation went
 * in. It is NOT comparable between a tonal kit and a noisy one: a narrow peak
 * shifted by four per cent crosses FFT bins and scores enormously, while the
 * same four per cent on a band of noise barely registers. Read it only as
 * "this kit does / does not vary", which is the only question being asked.
 *
 * NEGATIVE TESTS - each RUN against a sabotaged build, not assumed:
 * emptying VARY gives "hover plays the identical sound every time (0.21)" and
 * seven more; setting every zone's prog to [0, 0, 0, 0] and putting the old
 * [deg, deg+7, deg+12] stack back gives "plains never leaves its first chord"
 * and six more; putting the shared noise buffer back to 1.2s gives "the
 * weather finds itself again every 3.6s (0.494)".
 *
 * The third of those is the one worth reading. It PASSED the first time it
 * was run, at a threshold set from a measurement of the original one-layer
 * bed, and the rule had to be re-set against the build the game actually
 * ships before it caught anything. A negative test that is written down
 * rather than run is a claim, not a test.
 *
 *   node tools/check-voices.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');

/* How many times each kit is played. Six gives fifteen pairs, which is enough
 * that one unlucky draw cannot carry the mean on its own. */
const PLAYS = 6;
/* Below this, a kit is playing the same sound every time. Measured against a
 * build with the pitch spread removed entirely, the kits that then repeat
 * measure 0.21 to 1.32; the quietest kit that does vary measures 2.4. 1.6
 * sits between them.
 *
 * It sits there because two kits were WIDENED to put it there. `potion` and
 * `playerHurt` were pitch-only, and pitch alone on a pair of sine sweeps is
 * not much: potion drew 1.5 on one run with nothing about it changed, which
 * is inside the band this rule calls identical. Both now vary where the sound
 * actually lives - how far the swell climbs and how long it takes - and the
 * gap is real rather than nearly. */
const SAME = 1.6;
/* How strongly the weather may autocorrelate against itself at any lag under
 * ten seconds.
 *
 * SET FROM BOTH SIDES, and the first attempt was set from one. The single
 * looping buffer that started all this measured 0.90 at 1.2s, so 0.62 looked
 * like plenty of room - and then the shipping build with its buffer put back
 * to 1.2s PASSED at 0.494, because the second layer at 0.79x does not repeat
 * on the first one's period and halves the correlation at that lag all on its
 * own. The threshold had been set against a bed the game no longer plays.
 * Measured on what it does play: 0.057, 0.058, 0.074 across three runs of the
 * fixed build, against 0.494 for the short buffer. A quarter sits an order of
 * magnitude above the noise and half an order below the bug. */
const PERIOD = 0.25;
/* Distinct chords a zone has to pass through in four bars. Three is a
 * progression; two is a see-saw; one is what it used to be. */
const CHORDS = 3;
/* The kits a player hears often enough that repetition becomes a mechanism,
 * listed HERE rather than read off the game's own table of which kits vary.
 * Reading that table would have made this rule a mirror: emptying it would
 * have emptied the list of things to check and the harness would have passed
 * with every sound in the game identical. A harness states the requirement;
 * the game either meets it or does not.
 *
 * The fanfares are deliberately absent. level, evolve, victory, boss and
 * death are melodies, a melody that drifts in pitch between plays is a melody
 * out of tune, and they fire a handful of times a run rather than a hundred -
 * they have no repetition problem to solve. */
const OFTEN = ['hit', 'crit', 'enemyHit', 'cast', 'gem', 'coin', 'explode',
  'freeze', 'playerHurt', 'potion', 'chest', 'ui', 'hover', 'select', 'warn'];

const fail = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));
  await page.goto(INDEX);
  await page.waitForFunction(() => window.WS && window.WS.Audio);

  /* Bring the context up FIRST. The weather's buffer is built on demand, so
     asking the game how long it is before there is a context to build it in
     returns zero - and the rule below then rendered a zero-length bed and
     died inside createBuffer instead of reporting anything. */
  const ready = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true; WS.Save.unlockAll();
    WS.Audio.init(); WS.Audio.resume(); WS.Audio.applySettings();
    WS.Audio.stopMusic();
    await sleep(200);
    if (!WS.Audio.ctx) return 'no AudioContext';
    if (WS.Audio.ctx.state !== 'running') return 'the context never started: ' + WS.Audio.ctx.state;
    if (!(WS.Audio.weather().seconds > 0)) return 'the weather bed has no buffer';
    return null;
  });
  if (ready) {
    console.error('FAIL\n  - ' + ready);
    await browser.close();
    process.exit(1);
  }

  /* ---- moves: the harmony goes somewhere ------------------------------- */
  /* Read off the tables rather than off the bus. What a chord is MADE of is a
     fact about the score, and a spectral reading of it would be fighting the
     arpeggio, the drone, the weather and the percussion for the same bins. */
  const harmony = await page.evaluate(() => {
    const out = {};
    for (const [key, sc] of Object.entries(WS.Audio.scores())) {
      const prog = sc.prog || [];
      const seen = [];
      for (const i of prog) {
        const c = WS.Audio.chordAt(sc.scale, i, false).join(',');
        if (seen.indexOf(c) < 0) seen.push(c);
      }
      out[key] = { bars: prog.length, chords: seen.length };
    }
    return out;
  });
  for (const [key, h] of Object.entries(harmony)) {
    if (h.bars < 4) fail.push(`${key} names ${h.bars} bars of harmony, not four`);
    else if (h.chords < CHORDS) {
      fail.push(`${key} never leaves its first chord (${h.chords} distinct in ${h.bars} bars)`);
    }
  }

  /* ---- period: the weather does not find itself ------------------------ */
  const period = await page.evaluate(async () => {
    /* Rendered offline, at length, because the question is about a period of
       seconds and a live analyser cannot be read faster than a frame. */
    const SR = 22050, SECS = 26;
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OC) return { skip: 'no OfflineAudioContext' };
    const oc = new OC(1, SR * SECS, SR);
    const spec = WS.Audio.scores().glacier.air;   // the brightest, grainiest bed
    /* THE GAME'S buffer length and THE GAME'S layers. Writing 11.3 and
       [[1, 1], [0.79, 0.72]] in here instead - which is what this did first -
       meant the rule rendered a bed the game might no longer be playing, and
       would have gone on passing with the shipping buffer back at 1.2s. */
    const air = WS.Audio.weather();
    const buf = oc.createBuffer(1, Math.floor(SR * air.seconds), SR);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const f = oc.createBiquadFilter();
    f.type = spec.type || 'lowpass'; f.frequency.value = spec.cut; f.Q.value = spec.q;
    f.connect(oc.destination);
    for (const [rate, level] of air.layers) {
      const src = oc.createBufferSource();
      src.buffer = buf; src.loop = true; src.playbackRate.value = rate;
      const g = oc.createGain(); g.gain.value = level;
      src.connect(g); g.connect(f); src.start(0);
    }
    const rendered = await oc.startRendering();
    const pcm = rendered.getChannelData(0);
    /* The ENVELOPE, not the waveform. Two different stretches of white noise
       never correlate sample for sample however identical their character;
       what the ear hears repeating in a bed is its shape over time. */
    const HOP = 256;
    const env = new Float64Array(Math.floor(pcm.length / HOP));
    for (let i = 0; i < env.length; i++) {
      let e = 0;
      for (let j = 0; j < HOP; j++) e += Math.abs(pcm[i * HOP + j]);
      env[i] = e / HOP;
    }
    let mean = 0;
    for (let i = 0; i < env.length; i++) mean += env[i];
    mean /= env.length;
    for (let i = 0; i < env.length; i++) env[i] -= mean;
    let power = 0;
    for (let i = 0; i < env.length; i++) power += env[i] * env[i];
    const perHop = HOP / SR;
    let worst = { r: 0, lag: 0 };
    // Lags from a fifth of a second (below that it is timbre, not repetition)
    // out to ten seconds (beyond that the player has moved on).
    for (let lag = Math.round(0.2 / perHop); lag < Math.round(10 / perHop); lag++) {
      let s = 0;
      for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag];
      const r = s / power;
      if (r > worst.r) worst = { r: +r.toFixed(3), lag: +(lag * perHop).toFixed(2) };
    }
    return worst;
  });
  if (period.skip) console.log('  (period: ' + period.skip + ')');
  else if (period.r > PERIOD) {
    fail.push(`the weather finds itself again every ${period.lag}s (${period.r})`);
  }

  /* ---- same: no voice is the same voice twice -------------------------- */
  const voices = await page.evaluate(async ([PLAYS, OFTEN]) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ctx = WS.Audio.ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 2048; an.smoothingTimeConstant = 0;
    WS.Audio.sfxGain.connect(an);
    const bins = new Float32Array(an.frequencyBinCount);
    const shot = async (ms) => {
      const best = new Float32Array(bins.length).fill(-140);
      const until = performance.now() + ms;
      while (performance.now() < until) {
        an.getFloatFrequencyData(bins);
        for (let i = 0; i < bins.length; i++) if (bins[i] > best[i]) best[i] = bins[i];
        await sleep(8);
      }
      return Array.from(best, (v) => Math.max(-110, v));
    };
    const norm = (a) => {
      let m = 0, n = 0;
      for (let i = 1; i < a.length; i++) if (a[i] > -105) { m += a[i]; n++; }
      m = n ? m / n : 0;
      return a.map((v) => v - m);
    };
    const dist = (a0, c0) => {
      const a = norm(a0), c = norm(c0);
      let s = 0, n = 0;
      for (let i = 1; i < a.length; i++) {
        if (a0[i] > -105 || c0[i] > -105) { s += Math.abs(a[i] - c[i]); n++; }
      }
      return n ? s / n : 0;
    };
    const out = {};
    for (const kit of OFTEN) {
      const shots = [];
      for (let i = 0; i < PLAYS; i++) {
        await sleep(420);          // clear of every throttle gap in THROTTLE
        WS.Audio.play(kit);
        shots.push(await shot(360));
      }
      let s = 0, n = 0;
      for (let i = 0; i < PLAYS; i++) {
        for (let j = i + 1; j < PLAYS; j++) { s += dist(shots[i], shots[j]); n++; }
      }
      out[kit] = +(s / n).toFixed(2);
    }
    return out;
  }, [PLAYS, OFTEN]);

  if (voices.fatal) {
    console.error('FAIL\n  - ' + voices.fatal);
    await browser.close();
    process.exit(1);
  }
  for (const [kit, v] of Object.entries(voices)) {
    if (v < SAME) fail.push(`${kit} plays the identical sound every time (${v})`);
  }

  console.log('harmony   ' + Object.entries(harmony)
    .map(([k, h]) => `${k} ${h.chords}/${h.bars}`).join('  '));
  if (!period.skip) console.log(`weather   worst ${period.r} at ${period.lag}s`);
  console.log('voices    ' + Object.entries(voices)
    .sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} ${v}`).join('  '));

  await browser.close();
  if (fail.length) {
    console.error('FAIL\n  - ' + fail.join('\n  - '));
    process.exit(1);
  }
  console.log('OK');
})();
