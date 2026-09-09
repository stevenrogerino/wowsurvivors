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
    /* A fresh profile gets the prologue, and its layer covers the whole
       screen - which is the point of it. A harness has to walk past it
       before it can drive anything. */
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
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

    /* ---- the wall: chatter cannot drown what matters ----------------------
     *
     * Hits, kills, gems and casts are the game talking to itself, and the old
     * throttle allowed about sixty of them a second in a busy run, every one at
     * the same gain, all on the same bus as a level-up and a boss horn. That is
     * not feedback, it is a wall - and it is the reason a run's loudest moments
     * had nothing left to be loud with.
     *
     * Measured off the real master, not asserted from the graph: drive the
     * chatter as hard as the game ever can, and the sound that matters must
     * still come out clearly on top of it. */
    /* Measured at sfxGain, which is BEFORE the master limiter.
     *
     * The limiter's whole job is to pin the peak of whatever reaches it, so
     * measuring "does this cut through" at the master output asks a question
     * the limiter has already answered: both windows come back at the ceiling
     * and the comparison is meaningless. The claim is about the effects MIX,
     * and the effects mix is one node earlier. */
    const SL = ctx.createAnalyser(), SR = ctx.createAnalyser();
    SL.fftSize = 2048; SR.fftSize = 2048;
    const sfxSplit = ctx.createChannelSplitter(2);
    WS.Audio.sfxGain.connect(sfxSplit);
    sfxSplit.connect(SL, 0); sfxSplit.connect(SR, 1);
    const sl = new Float32Array(SL.fftSize), sr = new Float32Array(SR.fftSize);

    /* PEAK, not summed energy, for this one.
     *
     * The first version of this measurement compared total energy and reported
     * that a level-up made the mix 19% QUIETER - which was true and was the
     * ducking working exactly as intended. Total energy is the wrong question:
     * what matters is whether the important sound CUTS THROUGH, and that is a
     * peak. */
    const peak = async (ms, during) => {
      let hi = 0, e = 0;
      const until = performance.now() + ms;
      while (performance.now() < until) {
        if (during) during();
        await sleep(11);
        SL.getFloatTimeDomainData(sl); SR.getFloatTimeDomainData(sr);
        for (let i = 0; i < sl.length; i++) {
          const v = Math.abs(sl[i]) + Math.abs(sr[i]);
          if (v > hi) hi = v;
        }
        e += rms(sl) + rms(sr);
      }
      return { hi, e };
    };
    const px2 = WS.Game.player.x;
    // Everything the game can throw at once, called every frame like the real
    // thing does - the throttle is what decides how much of it sounds.
    const storm = () => {
      for (let i = 0; i < 6; i++) {
        WS.Audio.play('hit', px2 + (i - 3) * 90);
        WS.Audio.play('enemyHit', px2 + (i - 3) * 70);
        WS.Audio.play('cast', px2);
        WS.Audio.play('gem', px2 + i * 40);
      }
    };
    await sleep(400);
    out.quiet = await peak(500, null);
    await sleep(400);
    /* BEFORE and AFTER, both with the wall running.
     *
     * Comparing one long window against another does not work: the "with a
     * level-up" window still contains the un-ducked wall that came before the
     * level-up fired, and its peak is the peak of the whole window. The
     * question is whether the mix's peak RISES at the moment the important
     * sound arrives, so the windows have to be either side of that moment. */
    out.wallOnly = await peak(700, storm);
    WS.Audio.play('level');
    out.wallPlusLevel = await peak(700, storm);
    await sleep(800);
    out.levelAlone = await peak(700, (() => {
      let n = 0;
      return () => { if (n++ === 2) WS.Audio.play('level'); };
    })());
    out.hasChatterBus = !!(WS.Audio.chatter && WS.Audio.chatterGain);

    /* ---- density: a clump must not sound like a single event -------------- */
    /* The old throttle DROPPED everything it could not fit, so forty hits in a
     * tick sounded exactly like two and the player learned nothing from the
     * difference. They are counted now and the next voice carries them. */
    await sleep(600);
    // one event on a quiet field
    WS.Audio.play('hit', px2);
    const single = WS.Audio.lastShape;
    // then thirty in a tick, which the throttle will not let through - the
    // next voice out has to carry what they would have said
    await sleep(200);
    for (let i = 0; i < 30; i++) WS.Audio.play('hit', px2);
    /* Long enough that the WIDENED gap has elapsed - a clump deliberately
       spaces itself out, so 55ms was still inside it - and short enough that
       the backlog has not aged out. */
    await sleep(110);
    WS.Audio.play('hit', px2);
    const clump = WS.Audio.lastShape;
    out.density = { single, clump };

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


  /* ---- the score knows what is happening ---------------------------------
   *
   * Intensity had one driver and it was one expression: crowd size plus
   * elapsed time. The music therefore did not know a boss had walked onto the
   * field, did not know the survivor was two hits from dead, and rose steadily
   * whether or not anything was happening - so at minute twenty-five it was
   * pinned at maximum in a quiet moment and in the worst moment alike, which
   * is the one thing a score must not do.
   *
   * Danger is now the MAXIMUM of named terms rather than their sum, and this
   * checks the distinction, because a sum passes a naive "does it go up" test
   * while getting the important cases exactly wrong: a survivor at nine health
   * on an empty field is not calm, and a boss at 5% is not the same as a boss
   * at 95%. */
  const danger = await page.evaluate(() => {
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Game.startRun('thornhollow', 'mage');
    const card = document.querySelector('#overlay:not(.hidden) .card');
    if (card) card.click();
    const p = WS.Game.player, run = WS.Game.run;
    const clear = () => { WS.Enemy.pool.releaseAll(); p.health = p.maxHealth; run.time = 0; };
    const out = {};

    clear(); out.calm = WS.Game.danger();

    clear();
    for (let i = 0; i < 130; i++) WS.Enemy.spawn('lampling', 100 + i, 200, 1);
    out.crowded = WS.Game.danger();

    clear(); run.time = WS.Config.deathTime * 0.9;
    out.late = WS.Game.danger();

    // A survivor about to die on an EMPTY field. A sum would call this calm.
    clear(); p.health = p.maxHealth * 0.06;
    out.dying = WS.Game.danger();

    clear();
    const boss = WS.Enemy.spawn('gnarlfang', 400, 300, 1);
    out.bossFresh = WS.Game.danger();
    boss.health = boss.maxHealth * 0.05;
    out.bossNearlyDead = WS.Game.danger();

    clear();
    const death = WS.Enemy.spawn('death_itself', 400, 300, 1);
    out.death = WS.Game.danger();
    if (death) WS.Enemy.pool.releaseAll();

    // and the easing: a target must not land instantly
    clear();
    WS.Audio.setIntensity(1);
    out.easedNow = WS.Audio.intensity();
    out.target = WS.Audio._music ? WS.Audio._music.want : null;
    clear();
    return out;
  });
  /* ---- the wall, and the density shaping ---------------------------------- */
  if (!report.hasChatterBus) {
    fail.push('there is no chatter bus - the hits, kills and gems share one output with '
      + 'the sounds that matter, and out-number them sixty to one');
  }
  /* Does the important sound OWN its moment?
   *
   * The obvious comparison - is the mix louder with a level-up in it - is
   * exactly backwards, and measuring it said so: the mix gets 45% QUIETER,
   * because the chatter ducks out of the way. That is the system working. So
   * the two things worth asserting are that the wall does get out of the way,
   * and that what is left in the gap is mostly the level-up rather than the
   * remains of the wall.
   *
   * Measured: a full wall peaks 0.297; the same wall the instant a level-up
   * fires peaks 0.163; the level-up alone peaks 0.141. So four fifths of what
   * you hear in that moment is the level-up.
   */
  const gotOut = report.wallPlusLevel.hi / Math.max(1e-9, report.wallOnly.hi);
  const owns = report.wallPlusLevel.hi / Math.max(1e-9, report.levelAlone.hi);
  if (!(report.levelAlone.hi > 0.02)) {
    fail.push('a level-up on a silent field barely registers - the comparisons below '
      + 'would be measuring nothing');
  }
  if (!(report.wallOnly.e > report.quiet.e * 1.5)) {
    fail.push('driving every chatter kit as hard as the game can barely registers - '
      + 'this measurement is not reaching the mix');
  }
  if (!(gotOut < 0.85)) {
    fail.push(`a level-up over a full wall of chatter leaves the mix at `
      + `${(gotOut * 100).toFixed(0)}% of the wall's own peak - the chatter is not `
      + 'getting out of the way of the thing it is supposed to make room for');
  }
  if (!(owns < 1.7)) {
    fail.push(`in the moment a level-up fires, the mix peaks ${owns.toFixed(2)}x what the `
      + 'level-up makes on its own - most of what the player hears is still the wall');
  }

  const s1 = report.density.single, sc = report.density.clump;
  if (!s1 || !sc) fail.push('the chatter voices are not being shaped at all');
  else {
    if (!(sc.heft > 0.5)) {
      fail.push(`thirty hits in a tick left the next voice at heft ${sc.heft.toFixed(2)} - `
        + 'the events the throttle refused are being dropped rather than counted');
    }
    if (!(sc.gain > s1.gain * 1.4)) {
      fail.push(`a clump of thirty sounds ${(sc.gain / s1.gain).toFixed(2)}x a single hit - `
        + 'the player cannot hear the difference between killing three things and thirty');
    }
    if (!(sc.pitch < s1.pitch * 0.95)) {
      fail.push('a clump is not pitched below a single event, so it reads as more of the '
        + 'same rather than as something heavier');
    }
  }

  const D = danger;
  if (!(D.calm < 0.15)) fail.push(`an empty field at minute zero reads ${D.calm.toFixed(2)} danger`);
  if (!(D.crowded > 0.5)) fail.push(`a field of 130 reads ${D.crowded.toFixed(2)}`);
  if (!(D.late > 0.35)) fail.push(`the last minutes of the night read ${D.late.toFixed(2)}`);
  if (!(D.dying > 0.9)) {
    fail.push(`a survivor at 6% health on an empty field reads ${D.dying.toFixed(2)} danger - `
      + 'the score is describing the field rather than the run');
  }
  if (!(D.bossFresh > 0.6)) {
    fail.push(`a boss on the field reads ${D.bossFresh.toFixed(2)} - the score does not know `
      + 'it is there');
  }
  if (!(D.bossNearlyDead > D.bossFresh + 0.1)) {
    fail.push(`a boss at 5% reads ${D.bossNearlyDead.toFixed(2)} against ${D.bossFresh.toFixed(2)} `
      + 'at full - the end of a boss is the part that decides the run');
  }
  if (D.death !== undefined && !(D.death >= 0.99)) {
    fail.push(`Death itself on the field reads ${D.death.toFixed(2)}`);
  }
  /* The sum-versus-max distinction, stated as a rule: nothing may push the
     calm case up just by adding terms, and the dying case must not be diluted
     by the field being empty. */
  if (D.calm >= D.dying) fail.push('a dying survivor is not more dangerous than a calm one');
  if (D.target !== 1) fail.push('setIntensity did not record the target it was given');
  if (D.easedNow >= 0.5) {
    fail.push(`intensity jumped to ${D.easedNow.toFixed(2)} the instant it was set - it is `
      + 'meant to ease, or a crowd count that swings between waves reads as flutter');
  }

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`ok: sound is placed in the field (${p.left}x left, `
    + `${(1 / p.right).toFixed(2)}x right, ${p.centre} centred, ${p.announce} announcing), `
    + `a wall of chatter gets out of the way of a level-up (down to `
    + `${(gotOut * 100).toFixed(0)}% of its own peak, and ${(100 / owns).toFixed(0)}% of `
    + `what is left is the level-up itself) while a clump of thirty hits comes out `
    + `${(sc.gain / s1.gain).toFixed(1)}x heavier and `
    + `${((1 - sc.pitch / s1.pitch) * 100).toFixed(0)}% lower than a single one, `
    + `the score reads the run rather than the field (calm ${D.calm.toFixed(2)}, a dying `
    + `survivor on an empty field ${D.dying.toFixed(2)}, a fresh boss `
    + `${D.bossFresh.toFixed(2)}, one at 5% ${D.bossNearlyDead.toFixed(2)}) and eases `
    + 'toward it, muting stops the score rather than hiding it, a stopped clock takes no '
    + 'bookings, a three-second stall costs no notes, and a hidden page goes quiet');
})();
