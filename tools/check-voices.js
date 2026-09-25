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
 *   hiss      There is no weather bed any more. It was a loop of filtered
 *             noise under every zone, and after every fix it could be given
 *             it was still heard as a hiss. This rule keeps it gone: no score
 *             names a noise bed, and no zone's top end reads as noise.
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
 * The two ceilings for `hiss`. Flatness is 1 for white noise and near 0 for
 * a few pure tones; the old weather beds made the top of every zone read as
 * noise. The share above 5kHz catches a bed that sits very high - the
 * Rimewaste's old highpass had nearly half its energy up there. Both are set
 * from the build that ships (see the figures the check prints) with room
 * either side; they are not tuned to pass. */
const HISS_FLAT = 0.2;
const HISS_HI = 0.6;
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

  /* ---- hiss: no place is built on a bed of noise ----------------------- *
   * This rule used to be `period`, and it policed the weather bed: a loop of
   * filtered white noise under every zone, which was measured, de-periodised,
   * split into two layers at irrational rates, given gusts and a drifting
   * filter - and was still, to the player who asked for it gone, "the fuzzy
   * hiss". It is gone. Places are made of what lives in them (LIFE in
   * audio.js), and every one of those voices is pitched and ends.
   *
   * So the rule now keeps it gone. No score may name a noise bed, and a zone
   * left playing with nothing else happening must not carry its energy in the
   * flat, noise-shaped top of the spectrum: measured as the share of the
   * music bus above 5kHz, and its spectral flatness from 2 to 11kHz, over a
   * long listen to every zone.
   *
   * NEGATIVE TEST, run: against the build before the beds came out this fails
   * with "<zone> names a noise bed" for all eight scores, and the Dustreach,
   * Ambergrass and the Rimewaste read 0.466, 0.454 and 0.461 flatness against
   * 0.006-0.118 for every zone of the build that ships. */
  const hiss = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { beds: [], zones: {} };
    const scores = WS.Audio.scores();
    for (const k of Object.keys(scores)) if (scores[k].air) out.beds.push(k);
    const ctx = WS.Audio.ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 4096; an.smoothingTimeConstant = 0;
    WS.Audio.musicGain.connect(an);
    const bins = new Float32Array(an.frequencyBinCount);
    const hz = ctx.sampleRate / an.fftSize;
    for (const k of ['forest', 'plains', 'cursed', 'savannah', 'glacier', 'highmoor', 'eclipse', 'menu']) {
      WS.Audio.stopMusic(); WS.Audio.playMusic(k);
      if (WS.Audio._music) { WS.Audio._music.intensity = 0; WS.Audio._music.want = 0; }
      await sleep(800);
      const acc = new Float64Array(bins.length);
      const until = performance.now() + 8000;
      while (performance.now() < until) {
        an.getFloatFrequencyData(bins);
        for (let i = 0; i < bins.length; i++) acc[i] += Math.pow(10, Math.max(-140, bins[i]) / 10);
        await sleep(30);
      }
      let tot = 0, hi = 0, logs = 0, lin = 0, n = 0;
      for (let i = 1; i < acc.length; i++) {
        tot += acc[i];
        if (i * hz > 5000) hi += acc[i];
        if (i * hz > 2000 && i * hz < 11000) { logs += Math.log(acc[i] + 1e-30); lin += acc[i]; n++; }
      }
      out.zones[k] = { hi: +(hi / tot).toFixed(3), flat: +(Math.exp(logs / n) / (lin / n)).toFixed(3) };
    }
    WS.Audio.stopMusic();
    try { WS.Audio.musicGain.disconnect(an); } catch (e) { /* gone */ }
    return out;
  });
  for (const k of hiss.beds) fail.push(`${k} names a noise bed - the hiss is back`);
  for (const [k, z] of Object.entries(hiss.zones)) {
    if (z.hi > HISS_HI) fail.push(`${k} carries ${Math.round(z.hi * 100)}% of its energy above 5kHz`);
    if (z.flat > HISS_FLAT) fail.push(`${k}'s top end is flat like noise (${z.flat})`);
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
  console.log('hiss      ' + Object.entries(hiss.zones).map(([k, z]) => `${k} ${z.hi}/${z.flat}`).join('  '));
  console.log('voices    ' + Object.entries(voices)
    .sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} ${v}`).join('  '));

  await browser.close();
  if (fail.length) {
    console.error('FAIL\n  - ' + fail.join('\n  - '));
    process.exit(1);
  }
  console.log('OK');
})();
