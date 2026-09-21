#!/usr/bin/env node
/* Siege fatigue's guard rail.
 *
 * The clump system (see VARY, HEFT in audio.js) solves a BURST: forty hits
 * landing in one tick reads as one heavy voice instead of forty identical
 * ones. It says nothing about a SIEGE - ten straight minutes of a packed
 * field throttles to the same clumped voice, at the same rate, at the same
 * gain, for the whole ten minutes, because heft only ever measures the last
 * instant. Audio.play now tracks a second, slower clock: fatigue, which
 * widens the gap between voices and quiets each one further the longer a
 * kit has gone without a real break.
 *
 * TWO BUGS FOUND WRITING THIS, both invisible without driving real time
 * through the real function:
 *
 *   1. Fatigue was first gated on heft itself ("only accrue while at full
 *      clump"), but heft is `waiting[kit] / HEFT` and waiting is zeroed the
 *      instant a voice fires - so heft is a sawtooth, back to 0 for every
 *      call right after every voice. Hammering `hit` for forty seconds
 *      measured fatigue at 0 for the entire forty seconds.
 *
 *   2. Un-gating it and tying it to the SAME "no real break" signal the
 *      backlog already resets on fixed that, and broke a second way: the
 *      reset compares the gap since the last voice against a fixed 3x the
 *      UNWIDENED throttle gap, but fatigue's own widening (on top of heft's)
 *      can push the true spacing between voices past that fixed line, so
 *      the siege's own throttling eventually looks like the silence that
 *      means it ended. Fatigue climbed for ~15-20s and then reset itself,
 *      over and over, sawing between 0 and ~0.4-0.6 instead of ever
 *      reaching 1. The reset threshold now scales with the actual widened
 *      gap last used, not the bare one.
 *
 *   node tools/check-fatigue.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');

/* A siege has to actually reach meaningful fatigue within a reasonable
 * fight - FATIGUE_GRACE(5) + FATIGUE_WINDOW(25) = 30s in the game's own
 * constants, so 35s of continuous hammering should be at or past full. */
const SIEGE_SECS = 38;
const MIN_FATIGUE = 0.85;
/* And it has to actually DO something once it gets there: quieter and
 * slower than the opening seconds, not just a number ticking up unread. */
const MIN_RATE_DROP = 0.15;    // voices/sec, last window vs first
const MIN_GAIN_DROP = 0.15;    // last voice's shaped gain vs the ceiling

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

  const windows = await page.evaluate(async ([secs]) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    WS.Audio.init(); WS.Audio.resume(); WS.Audio.applySettings();
    await sleep(150);
    if (!WS.Audio.ctx || WS.Audio.ctx.state !== 'running') return { fatal: 'no running AudioContext' };

    const before = WS.Audio.play;
    let fires = 0;
    WS.Audio.play = function (kit, x) {
      const prevShape = WS.Audio.lastShape;
      before.call(WS.Audio, kit, x);
      if (WS.Audio.lastShape !== prevShape) fires++;
    };

    const out = [];
    const t0 = performance.now();
    let windowStart = t0;
    while (performance.now() - t0 < secs * 1000) {
      // A worst-case continuous siege: many calls per JS turn, so real gaps
      // between them stay far under anything the throttle would read as a
      // break, however wide fatigue itself has pushed that throttle.
      for (let i = 0; i < 30; i++) WS.Audio.play('hit');
      if (performance.now() - windowStart > 5000) {
        out.push({
          atSec: Math.round((performance.now() - t0) / 1000),
          rate: +(fires / 5).toFixed(2),
          gain: WS.Audio.lastShape ? +WS.Audio.lastShape.gain.toFixed(3) : null,
          fatigue: WS.Audio.lastShape ? +WS.Audio.lastShape.fatigue.toFixed(3) : null,
        });
        fires = 0;
        windowStart = performance.now();
      }
      await sleep(0);
    }
    WS.Audio.play = before;
    return { windows: out };
  }, [SIEGE_SECS]);

  if (windows.fatal) {
    console.error('FAIL\n  - ' + windows.fatal);
    await browser.close();
    process.exit(1);
  }
  const w = windows.windows;
  const first = w[0], last = w[w.length - 1];
  const peakFatigue = Math.max(...w.map((x) => x.fatigue));

  if (peakFatigue < MIN_FATIGUE) {
    fail.push(`a ${SIEGE_SECS}s siege never reached fatigue - peak ${peakFatigue}, `
      + `wanted at least ${MIN_FATIGUE}`);
  }
  // Monotonic climb, not a sawtooth - the whole point of fixing bug #2.
  for (let i = 1; i < w.length; i++) {
    if (w[i].fatigue < w[i - 1].fatigue - 0.02) {
      fail.push(`fatigue fell from ${w[i - 1].fatigue} to ${w[i].fatigue} between `
        + `${w[i - 1].atSec}s and ${w[i].atSec}s - it reset mid-siege`);
      break;
    }
  }
  if (first.rate - last.rate < MIN_RATE_DROP * first.rate) {
    fail.push(`the voice rate barely moved: ${first.rate}/s at ${first.atSec}s, `
      + `${last.rate}/s at ${last.atSec}s`);
  }
  if (first.gain - last.gain < MIN_GAIN_DROP * first.gain) {
    fail.push(`the voice gain barely moved: ${first.gain} at ${first.atSec}s, `
      + `${last.gain} at ${last.atSec}s`);
  }

  console.log('siege     ' + w.map((x) => `${x.atSec}s:f${x.fatigue}`).join('  '));
  console.log(`rate      ${first.rate}/s -> ${last.rate}/s`);
  console.log(`gain      ${first.gain} -> ${last.gain}`);

  await browser.close();
  if (fail.length) {
    console.error('FAIL\n  - ' + fail.join('\n  - '));
    process.exit(1);
  }
  console.log(`OK: a sustained siege on one kit climbs to ${peakFatigue} fatigue without `
    + 'resetting itself, quieter and slower than it started');
})();
