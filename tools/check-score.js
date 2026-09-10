#!/usr/bin/env node
/* The score's guard rail. Every rule here was written after measuring the
 * thing it now forbids, off the real music bus in a real browser.
 *
 *   places    Six battlefields shared one piece in six keys. Measured as the
 *             mean dB difference between two averaged spectra, counting only
 *             bins where either side has real signal, two zones came out
 *             about 3dB apart - and The Dustreach and the MAIN MENU came out
 *             0.35dB apart, so the busiest ground in the game sounded like
 *             the screen you pick it from. Rhythm and weather are what fixed
 *             it, and this is what stops them being tuned back out.
 *
 *   boss      A boss arriving changed the mix by 0.79dB, against ~3dB for
 *             walking between maps: the biggest event in a run was a quarter
 *             as audible as a menu click. It is a layer that also pushes the
 *             zone's own melody down, so the SHAPE of the mix changes.
 *
 *   quiet     ...and it has to give the zone back. A boss layer left up, or
 *             a duck never released, means every run after the first boss is
 *             quieter than the first.
 *
 *   cues      The cinematics had one sound between them: the menu loop. Every
 *             beat of both scripts now has a cue, and every cue has to make a
 *             noise - a table entry that builds a silent graph is worse than
 *             no entry, because nothing ever reports it.
 *
 *   script    A beat with no cue is silence at a moment the piece meant to
 *             say something. The script and the score are written in
 *             different files by different hands; this is what keeps them
 *             together.
 *
 *   heard     THE ONE THAT MATTERED MOST. The prologue starts on boot, and no
 *             browser will give a page an AudioContext before a gesture -
 *             measured on a fresh profile under the shipping autoplay policy
 *             there was no context at all, not even a suspended one, for the
 *             whole piece. And the one gesture that would have created it, a
 *             keypress, was wired to SKIP the prologue. The best thing in the
 *             game could not be heard by anybody, ever.
 *
 *   muted     Turning music off has to stop the new nodes too. The air bed
 *             and the boss layer are both permanently-running sources, which
 *             is exactly the shape of the bug the original mute had.
 *
 * NEGATIVE TESTS - each confirmed to fail against the code as it was:
 * giving every zone the menu's voicing gives "plains and menu are 0.4dB
 * apart"; dropping the zone duck from setBoss gives "a boss changes the mix
 * by 1.5dB"; never clearing the boss gives "the score did not come back";
 * emptying one cue's body gives "pro:dawn made no sound"; deleting a cue
 * gives "the beat 'dawn' has no cue"; restoring the old skip-on-keydown
 * handler gives "a key ended the prologue instead of starting it".
 *
 *   node tools/check-score.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');

/* How far apart two battlefields have to sound. Measured figures for the
 * pairs this is meant to protect run 4-16dB in these units; the two that
 * were actually broken measured 1.6 and 0.9. Three sits above both and below
 * every pair the fixed build produces. */
const PLACES = 3;
/* And how much a boss has to change the mix it arrives in. Same units. The
 * old layer, buried under a 620Hz lowpass in the octave the zone drone
 * already owned, measured 1.5. This is a FLOOR and not the mechanism: healthy
 * runs measure 4.5-4.8 and a sabotaged one measured 3.9, which overlaps, so
 * the parts a boss is actually made of are asserted directly below instead. */
const BOSS = 3.5;
/* A cue has to be at least this far above the quiet before it. */
const AUDIBLE = 12;

const fail = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    // Headless Chromium will not start a context behind a gesture policy, and
    // without a running context none of this measures anything.
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));
  await page.goto(INDEX);
  await page.waitForFunction(() => window.WS && window.WS.Audio);

  const report = await page.evaluate(async ([PLACES, BOSS, AUDIBLE]) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Audio.init(); WS.Audio.resume(); WS.Audio.applySettings();
    const ctx = WS.Audio.ctx;
    if (!ctx) return { fatal: 'no AudioContext' };
    await sleep(150);
    if (ctx.state !== 'running') return { fatal: 'the context never started: ' + ctx.state };

    let nodes = 0;
    for (const m of ['createOscillator', 'createGain', 'createBiquadFilter', 'createBufferSource']) {
      const orig = ctx[m].bind(ctx);
      ctx[m] = function () { nodes++; return orig(); };
    }

    const an = ctx.createAnalyser();
    an.fftSize = 4096; an.smoothingTimeConstant = 0;
    WS.Audio.musicGain.connect(an);
    const bins = new Float32Array(an.frequencyBinCount);

    const peak = async (ms) => {
      let best = -140;
      const until = performance.now() + ms;
      while (performance.now() < until) {
        an.getFloatFrequencyData(bins);
        for (let i = 1; i < bins.length; i++) if (bins[i] > best) best = bins[i];
        await sleep(16);
      }
      return +best.toFixed(1);
    };
    /* Compare BANDS, not bins.
     *
     * Two metrics were tried and thrown away first, and the second one is the
     * cautionary tale. Averaging |dB difference| per bin over the whole
     * spectrum counts hundreds of bins near the noise floor on both sides and
     * dilutes a real difference. The obvious fix - ignore bins below a floor
     * - was calibrated in the wrong units: a band carrying -55dB spreads it
     * over ~180 bins, so each bin reads about -100, and a -95 floor threw
     * away almost the entire spectrum and compared only the loudest few bins
     * at the bottom, which every zone shares. It confidently reported the
     * Dustreach and the menu as 0.5dB apart at a moment when their top three
     * octaves were 30dB apart, and it would have passed the exact bug this
     * file exists to catch.
     *
     * Summed energy in eight log bands has neither failure. It is also the
     * only version a person can read: eight numbers per zone, and the bug is
     * visible in them. */
    const EDGES = [40, 110, 250, 550, 1200, 2600, 5200, 9000, 16000];
    const hz = ctx.sampleRate / an.fftSize;
    const bands = async (ms) => {
      const acc = new Float64Array(EDGES.length - 1);
      let n = 0;
      const until = performance.now() + ms;
      while (performance.now() < until) {
        an.getFloatFrequencyData(bins);
        for (let bi = 0; bi < EDGES.length - 1; bi++) {
          let e = 0;
          const lo = Math.round(EDGES[bi] / hz), hi = Math.round(EDGES[bi + 1] / hz);
          for (let i = lo; i < hi && i < bins.length; i++) {
            e += Math.pow(10, Math.max(-140, bins[i]) / 20);
          }
          acc[bi] += e;
        }
        n++; await sleep(25);
      }
      return Array.from(acc, (v) => 20 * Math.log10(v / n));
    };
    const dist = (a, c) => {
      let s = 0;
      for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - c[i]);
      return +(s / a.length).toFixed(2);
    };

    /* ---- places: no two of them sound the same --------------------------- */
    /* A bar is sixteen steps and the slowest zone's is seventeen seconds, so
       a shorter window can miss a zone's rhythm entirely and report two
       places as identical when only the sampling was. */
    const keys = ['forest', 'plains', 'cursed', 'savannah', 'glacier', 'eclipse', 'menu'];
    const specs = {};
    for (const k of keys) {
      WS.Audio.stopMusic();
      WS.Audio.playMusic(k);
      if (WS.Audio._music) { WS.Audio._music.intensity = 0; WS.Audio._music.want = 0; }
      await sleep(900);
      specs[k] = await bands(18000);
    }
    const alike = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const d = dist(specs[keys[i]], specs[keys[j]]);
        if (d < PLACES) alike.push(`${keys[i]} and ${keys[j]} are ${d}dB apart`);
      }
    }

    /* ---- boss: the fight takes the score over, and gives it back --------- */
    WS.Audio.stopMusic();
    WS.Audio.playMusic('forest');
    if (WS.Audio._music) { WS.Audio._music.intensity = 0; WS.Audio._music.want = 0; }
    await sleep(900);
    const calm = await bands(16000);
    WS.Audio.setBoss('boss');
    if (WS.Audio._music) { WS.Audio._music.intensity = 0.9; WS.Audio._music.want = 0.9; }
    await sleep(2600);
    /* Read the duck WHILE the boss is up, rather than inferring it from the
       spectrum afterwards. Deleting it outright cost a quarter of a decibel
       on the aggregate - well inside the run-to-run spread - so an averaged
       number cannot police it and this does. */
    const duckedTo = WS.Audio._music ? +WS.Audio._music.zone.gain.value.toFixed(2) : -1;
    const layered = !!(WS.Audio._music && WS.Audio._music.bossGain);
    const onBoss = await bands(16000);
    WS.Audio.setBoss('death');
    await sleep(2600);
    const onDeath = await bands(16000);
    WS.Audio.setBoss(null);
    if (WS.Audio._music) { WS.Audio._music.intensity = 0; WS.Audio._music.want = 0; }
    await sleep(7000);
    const after = await bands(12000);
    const boss = {
      arrives: dist(calm, onBoss),
      death: dist(onBoss, onDeath),
      leaves: dist(calm, after),
      cleared: WS.Audio.boss(),
      restored: WS.Audio._music ? +WS.Audio._music.zone.gain.value.toFixed(2) : -1,
      duckedTo, layered,
    };

    /* ---- cues: every one of them makes a noise --------------------------- */
    WS.Audio.stopMusic();
    await sleep(1500);
    const cues = WS.Audio.cues();
    const silent = [];
    for (const name of cues) {
      await sleep(600);
      const before = await peak(240);
      WS.Audio.cue(name);
      /* Long enough for the slowest of them. The dawn swell takes five
         seconds to crest, and a shorter listen reported the best moment in
         the prologue as the quietest thing in it. */
      const after2 = await peak(6200);
      if (after2 - before < AUDIBLE) {
        silent.push(`${name} made no sound (${before} -> ${after2})`);
      }
    }

    /* ---- muted: the new permanent sources stop too ----------------------- */
    WS.Save.settings.music = true; WS.Audio.applySettings();
    WS.Audio.playMusic('savannah');
    await sleep(400);
    WS.Audio.setBoss('boss');
    await sleep(400);
    WS.Save.settings.music = false; WS.Audio.applySettings();
    await sleep(200);
    const n0 = nodes;
    await sleep(2500);
    const muted = { nodes: nodes - n0, pumping: !!WS.Audio._music };
    WS.Save.settings.music = true; WS.Audio.applySettings();

    return { alike, boss, silent, muted, cues };
  }, [PLACES, BOSS, AUDIBLE]);

  if (report.fatal) {
    console.error('FAIL\n  - ' + report.fatal);
    await browser.close();
    process.exit(1);
  }

  for (const a of report.alike) fail.push(a);
  if (report.boss.arrives < BOSS) {
    fail.push(`a boss changes the mix by ${report.boss.arrives}dB, which is not a boss fight`);
  }
  if (report.boss.death < 1) {
    fail.push(`Death sounds the same as any other boss (${report.boss.death}dB apart)`);
  }
  if (report.boss.leaves > 3) {
    fail.push(`the score did not come back after the boss (${report.boss.leaves}dB from where it started)`);
  }
  if (report.boss.cleared !== null) fail.push('the boss layer was never cleared');
  if (!report.boss.layered) fail.push('a boss put no layer into the score at all');
  if (report.boss.duckedTo > 0.6) {
    fail.push(`the zone did not get out of the way for the boss (held at ${report.boss.duckedTo})`);
  }
  if (report.boss.restored < 0.9) {
    fail.push(`the zone was left ducked at ${report.boss.restored} after the boss died`);
  }
  for (const s of report.silent) fail.push(s);
  if (report.muted.nodes > 4) {
    fail.push(`muted music still built ${report.muted.nodes} nodes in two and a half seconds`);
  }
  if (report.muted.pumping) fail.push('muting left the score running');

  /* ---- script: every beat of both cinematics is scored ------------------- */
  const beats = await page.evaluate(() => {
    const seen = { pro: [], vic: [] };
    for (const s of (WS.Lore.prologue.scenes || [])) {
      if (seen.pro.indexOf(s.beat) < 0) seen.pro.push(s.beat);
    }
    for (const s of (WS.Lore.victory.scenes || [])) {
      if (seen.vic.indexOf(s.beat) < 0) seen.vic.push(s.beat);
    }
    return seen;
  });
  const known = report.cues;
  for (const p of ['pro', 'vic']) {
    for (const b of beats[p]) {
      if (known.indexOf(p + ':' + b) < 0) {
        fail.push(`the beat '${b}' has no cue (${p}:${b} is not in the score)`);
      }
    }
  }

  /* ---- heard: the first-run prologue can be heard at all -----------------
   * A SEPARATE BROWSER, with no autoplay flag, because the flag is the whole
   * thing being tested. This is what a player's machine does. */
  const strict = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: ['--no-sandbox'],
  });
  const sp = await strict.newPage({ viewport: { width: 1280, height: 720 } });
  sp.on('pageerror', (e) => fail.push('page error on a fresh profile: ' + e.message));
  await sp.goto(INDEX);
  await sp.waitForFunction(() => window.WS && window.WS.Prologue);
  await sp.waitForTimeout(1600);

  const held = await sp.evaluate(() => ({
    active: WS.Prologue.active,
    armed: WS.Prologue.armed,
    t: +WS.Prologue.t.toFixed(2),
    prompted: !!(WS.Prologue.layer && WS.Prologue.layer.classList.contains('waiting')),
    visible: (() => {
      const w = document.querySelector('#prologue .wake');
      return !!w && getComputedStyle(w).visibility === 'visible';
    })(),
  }));
  if (!held.active) fail.push('the prologue did not start on a fresh profile');
  if (held.armed) fail.push('the prologue believed it had a voice before any gesture');
  if (held.t > 0.5) fail.push(`the prologue played ${held.t}s of itself in silence`);
  if (!held.prompted || !held.visible) fail.push('nothing on screen asked for the key that would start it');

  await sp.keyboard.press('Space');
  await sp.waitForTimeout(1200);
  const woke = await sp.evaluate(() => ({
    active: WS.Prologue.active,
    armed: WS.Prologue.armed,
    t: +WS.Prologue.t.toFixed(2),
    ctx: WS.Audio.ctx ? WS.Audio.ctx.state : 'none',
    music: WS.Audio._music && WS.Audio._music.key,
    prompted: !!(WS.Prologue.layer && WS.Prologue.layer.classList.contains('waiting')),
  }));
  if (!woke.active) fail.push('a key ended the prologue instead of starting it');
  if (!woke.armed || woke.ctx !== 'running') fail.push(`the prologue still had no voice after a key (${woke.ctx})`);
  if (!woke.music) fail.push('the prologue started without a score');
  if (woke.t <= 0) fail.push('the prologue was armed but its clock never started');
  if (woke.prompted) fail.push('the prompt stayed up after the piece began');

  /* ...and once it is running, a second key STEPS rather than ending it.
   *
   * The gate would otherwise have been paid for by making the piece easier to
   * lose: the same press that used to skip is now the one that starts it, so
   * the very next press falling through to a skip would put a player one
   * keystroke from throwing away the thing they had just asked to see. */
  const stepped = await sp.evaluate(async () => {
    const before = WS.Prologue.t;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    return { active: WS.Prologue.active, moved: WS.Prologue.t > before };
  });
  if (!stepped.active) fail.push('the key after the one that started it ended the piece');
  if (!stepped.moved) fail.push('a key did not step the prologue on');

  // Escape leaves, and nothing on screen advertises it.
  const quiet = await sp.evaluate(() => {
    const t = (document.querySelector('#prologue .step') || {}).textContent || '';
    return /skip|esc/i.test(t + ' ' + (WS.Lore.prologue.next || ''));
  });
  if (quiet) fail.push('the prologue advertises the escape hatch it is meant to keep quiet');
  await sp.keyboard.press('Escape');
  await sp.waitForTimeout(400);
  const gone = await sp.evaluate(() => WS.Prologue.active);
  if (gone) fail.push('escape did not leave the prologue');

  await strict.close();
  await browser.close();

  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`ok: seven scores that sound like seven different places, a boss that takes the `
    + `score over by ${report.boss.arrives}dB and gives it back, Death that does not sound like `
    + `any other boss, ${report.cues.length} cinematic cues that all make a noise, every beat of `
    + `both scripts scored, a first-run prologue that can actually be heard, and a key that steps it on rather than throwing it away`);
})();
