#!/usr/bin/env node
/* Audio guard rail. Five rules, every one of them written after measuring the
 * thing it now forbids.
 *
 *   placed    A game whose whole threat model is "they come from every side"
 *             was mixed dead centre. There is no camera - the entire field is
 *             on screen - so a sound's x IS its x on the player's monitor, and
 *             placing it costs one node. Measured off the real master bus, an
 *             enemy struck on the left now puts 4.4x the energy in the left
 *             channel, one on the right 4.3x in the right, and anything the
 *             game means as an announcement stays at exactly 1.00.
 *
 *   muted     Turning music off only turned its gain to zero. The score kept
 *             running into silence: measured, a muted game still built ten
 *             nodes and five notes every two and a half seconds, forever, plus
 *             a drone oscillator that never stopped. A switch that only turns
 *             the volume down is not a switch.
 *
 *   asleep    Everything schedules against ctx.currentTime, and a suspended
 *             context - a hidden tab, a locked phone, a call - freezes that
 *             clock without refusing the work. Measured: twelve level-up
 *             fanfares played while suspended built 96 nodes and queued 48
 *             oscillators, all stamped with the same instant, so they arrived
 *             as one blast when the player came back.
 *
 *   stall     The score is a look-ahead scheduler on a 250ms interval. An
 *             interval that does not run - a GC pause, a background tab where
 *             timers are clamped to a second or a minute - leaves it behind
 *             the clock, and it then honoured every beat it had missed, each
 *             stamped with a moment already gone. WebAudio starts a note
 *             scheduled in the past immediately. Measured: a three-second
 *             stall fired a note 1.42s late; a minute in a background tab
 *             would empty seventy-odd notes into a single chord.
 *
 *   attention A hidden tab must go quiet. Browsers keep a background tab's
 *             audio playing, which is right for a music player and wrong for
 *             a game, where the drone follows the player into whatever they
 *             switched to.
 *
 * NEGATIVE TESTS - each was confirmed to fail against the code as it was:
 * dropping the pan argument gives "left and right are mixed identically";
 * restoring the gain-only mute gives "muted music still built 10 nodes";
 * removing the running-clock guard gives "48 voices queued against a stopped
 * clock"; removing the resync gives "the score fired 4 notes up to 1.42s in
 * the past"; removing setAttentive gives "a hidden page kept the clock
 * running".
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-audio.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

// How lopsided a placed sound must be before it counts as placed at all. The
// panner law alone predicts 2x; the measured figure is 4.4x, and 2.5x sits
// clear of both that and the 1.00 a centred sound produces.
const PLACED = 2.5;

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    // Headless Chromium will not start a context behind a gesture policy, and
    // without a running context none of this measures anything.
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const fail = [];
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));

  // Let the page believe it can be hidden, so the real handler can be exercised.
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'visibilityState',
      { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    window.__setHidden = (v) => {
      hidden = v;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && window.WS.Audio);

  const report = await page.evaluate(async ([placedBar]) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Audio.init(); WS.Audio.resume(); WS.Audio.applySettings();
    const ctx = WS.Audio.ctx;
    if (!ctx) return { fatal: 'no AudioContext' };
    await sleep(120);
    if (ctx.state !== 'running') return { fatal: 'the context never started: ' + ctx.state };

    // Census of everything the graph builds, and of when every note is due.
    let nodes = 0;
    for (const m of ['createOscillator', 'createGain', 'createBiquadFilter', 'createBufferSource']) {
      const orig = ctx[m].bind(ctx);
      ctx[m] = function () { nodes++; return orig(); };
    }
    const due = [];
    const oscStart = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (t) {
      due.push((t === undefined ? ctx.currentTime : t) - ctx.currentTime);
      return oscStart.call(this, t);
    };
    const out = {};

    /* ---- placed: read the two channels apart, off the real output --------- */
    WS.Save.settings.music = false; WS.Audio.applySettings();
    WS.Game.startRun('thornhollow', 'mage');
    await sleep(120);
    const split = ctx.createChannelSplitter(2);
    const AL = ctx.createAnalyser(), AR = ctx.createAnalyser();
    AL.fftSize = 2048; AR.fftSize = 2048;
    WS.Audio.master.connect(split);
    split.connect(AL, 0); split.connect(AR, 1);
    const bl = new Float32Array(AL.fftSize), br = new Float32Array(AR.fftSize);
    const rms = (a) => { let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / a.length); };
    /* Summed energy over a window, not a peak: a peak taken by an
     * unsynchronised sampler catches whichever frame it happens to land on,
     * and the first version of this measurement reported 4.4x one way and
     * 1.25x the other for what is a symmetrical pan law. */
    const listen = async (dx) => {
      await sleep(500);                       // let the previous tail die
      const px = WS.Game.player.x;
      let l = 0, r = 0;
      for (let i = 0; i < 40; i++) {
        if (i % 5 === 0) WS.Audio.play('hit', dx === null ? undefined : px + dx);
        await sleep(11);
        AL.getFloatTimeDomainData(bl); AR.getFloatTimeDomainData(br);
        l += rms(bl); r += rms(br);
      }
      return l / Math.max(1e-9, r);
    };
    out.placed = {
      left: +(await listen(-400)).toFixed(2),
      right: +(await listen(400)).toFixed(2),
      centre: +(await listen(0)).toFixed(2),
      announce: +(await listen(null)).toFixed(2),
      bar: placedBar,
    };

    /* ---- muted: the score stops, it does not just go quiet ---------------- */
    WS.Save.settings.music = true; WS.Audio.applySettings();
    WS.Audio.playMusic('forest');
    await sleep(400);
    WS.Save.settings.music = false; WS.Audio.applySettings();
    await sleep(100);
    let n0 = nodes, d0 = due.length;
    await sleep(2500);
    out.muted = { nodes: nodes - n0, notes: due.length - d0, pumping: !!WS.Audio._music };

    /* ...and comes back on the zone it was on, not silence for the rest of
     * the run. */
    WS.Save.settings.music = true; WS.Audio.applySettings();
    await sleep(100);
    out.unmuted = { playing: !!WS.Audio._music, key: WS.Audio._music && WS.Audio._music.key };

    /* ---- asleep: a stopped clock takes no bookings ------------------------ */
    await ctx.suspend();
    const frozen = ctx.currentTime;
    n0 = nodes; d0 = due.length;
    for (let i = 0; i < 12; i++) { WS.Audio.play('level'); await sleep(30); }
    await sleep(600);                          // let the music pump tick twice
    out.asleep = { nodes: nodes - n0, queued: due.length - d0,
      clockMoved: +(ctx.currentTime - frozen).toFixed(3) };
    await ctx.resume();
    await sleep(300);

    /* ---- stall: the score picks up from here, it does not catch up -------- */
    WS.Audio.playMusic('cursed');
    await sleep(300);
    due.length = 0;
    const until = performance.now() + 3000;
    while (performance.now() < until) { /* the main thread, taken away */ }
    await sleep(600);
    const late = due.filter((d) => d < -0.02);
    out.stall = { notes: due.length, late: late.length,
      worst: late.length ? +Math.min(...late).toFixed(2) : 0 };
    return out;
  }, [PLACED]);

  if (report.fatal) {
    console.error('FAIL\n  - ' + report.fatal);
    await browser.close();
    process.exit(1);
  }

  const p = report.placed;
  if (p.left < PLACED) {
    fail.push(`placed: a sound 400px to the left is only ${p.left}x louder in the `
      + 'left channel - left and right are mixed identically');
  }
  if (p.right > 1 / PLACED) {
    fail.push(`placed: a sound 400px to the right is only ${(1 / p.right).toFixed(2)}x `
      + 'louder in the right channel - left and right are mixed identically');
  }
  // Symmetry, because a pan that leans is worse than none at all.
  if (Math.abs(p.centre - 1) > 0.08) {
    fail.push(`placed: a sound at the player's feet leans ${p.centre} to one side`);
  }
  if (Math.abs(p.announce - 1) > 0.08) {
    fail.push(`placed: an announcement leans ${p.announce} to one side - things `
      + 'the game says about the run belong in the middle');
  }
  if (report.muted.nodes > 0 || report.muted.pumping) {
    fail.push(`muted: music switched off still built ${report.muted.nodes} nodes and `
      + `${report.muted.notes} notes in two and a half seconds`
      + (report.muted.pumping ? ', and the pump is still running' : ''));
  }
  if (!report.unmuted.playing) fail.push('muted: switching music back on left it silent');
  if (report.asleep.nodes > 0) {
    fail.push(`asleep: ${report.asleep.queued} voices queued against a stopped clock `
      + `(${report.asleep.nodes} nodes), every one of them due at the same instant`);
  }
  if (report.stall.late > 0) {
    fail.push(`stall: the score fired ${report.stall.late} notes up to `
      + `${Math.abs(report.stall.worst)}s in the past after a three-second stall`);
  }

  /* ---- attention: a hidden page goes quiet ------------------------------- */
  await page.evaluate(() => window.__setHidden(true));
  await page.waitForTimeout(250);
  const hiddenState = await page.evaluate(() => WS.Audio.ctx.state);
  await page.evaluate(() => window.__setHidden(false));
  await page.waitForTimeout(250);
  const shownState = await page.evaluate(() => WS.Audio.ctx.state);
  if (hiddenState === 'running') fail.push('attention: a hidden page kept the clock running');
  if (shownState !== 'running') fail.push(`attention: coming back left the clock ${shownState}`);

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`ok: sound is placed in the field (${p.left}x left, `
    + `${(1 / p.right).toFixed(2)}x right, ${p.centre} centred, ${p.announce} announcing), `
    + 'muting stops the score rather than hiding it, a stopped clock takes no '
    + 'bookings, a three-second stall costs no notes, and a hidden page goes quiet');
})();
