#!/usr/bin/env node
/* The prologue: does it play, does it say what it was written to say, and can
 * you get out of it?
 *
 * A cinematic is the one part of a game a player cannot skip past by being
 * good at it, so every way it can go wrong is a way to lose somebody in the
 * first minute. The failures worth guarding are not subtle:
 *
 *   plays      A brand-new save must see it, before the manual - the prologue
 *              says WHY and the manual says HOW, and a player handed the
 *              controls before the reason has been handed a control scheme
 *              rather than a game. A returning save must never see it again.
 *
 *   says       Every line in WS.Lore must actually reach the screen at its
 *              scene. The script is data so the tuning bench can rewrite it,
 *              which means a line can be edited into a scene that never plays
 *              and nothing would say so.
 *
 *   shows      Every beat must draw something, and draw something DIFFERENT
 *              from its neighbours. A beat that quietly paints an empty night
 *              is the exact bug you do not notice while writing the words.
 *
 *   reads      The words must sit in their own band, clear of the figure and
 *              inside the screen. The first version had the horde walking
 *              through the sentence describing it.
 *
 *   ends       Key, pointer and pad must all skip it, and skipping must land
 *              in the menu rather than nowhere.
 *
 *   borrows    And it must hand the random stream back. The starfield seeds
 *              the RNG so two playthroughs match; leaving it seeded would make
 *              every run after the prologue deterministic in a way nobody
 *              asked for.
 *
 * ALL OF IT, TWICE. There are two cuts of the prologue while the author decides
 * which one to keep - src/render/prologue-v1.js and -v2.js, chosen by a setting
 * and pointed at by src/render/cinematic.js. The whole suite runs against each
 * of them, because the one that is not currently selected is exactly the one
 * that will rot: nobody watches it, so nothing would say when a change to the
 * shared lore, the shared sprites or the shared layer CSS broke it. When one of
 * the two is deleted, VERSIONS below becomes a single entry.
 *
 * NEGATIVE TESTS, all four confirmed: making every beat draw the same night
 * fails at "the ember beat draws the same picture as night"; dropping a
 * scene's lines from the DOM fails at "no scene put ... on screen"; not
 * restoring the seed fails at "the prologue left the random stream seeded
 * (12345 -> 2259796438)"; and centring the words fails at "the words are drawn
 * over the scene (top 311px of 720)".
 *
 * The first and the last of those did NOT fail on the first attempt, and both
 * were holes in this file rather than in the game. The beat comparison
 * sampled each beat at its own midpoint, which compares two different moments
 * as well as two different beats - so seven identical beats all looked
 * distinct. It now draws them at the same t and k.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-prologue.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const fail = [];

const VERSIONS = [2, 1];
const say = (v, msg) => fail.push(`v${v}: ${msg}`);

async function pass(browser, version) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => say(version, 'page error: ' + e.message));

  /* A fresh profile boots straight into whatever cinematic.js picked, so the
     version under test is set on the first visit and the page is reloaded with
     seenPrologue cleared - which is the only way to watch a given cut arrive
     the way a new player gets it. */
  await page.goto(GAME);
  await page.waitForFunction(() => window.WS && WS.Prologue);
  await page.waitForTimeout(300);
  await page.evaluate((v) => {
    if (WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay();
    WS.Save.settings.cinematic = v;
    WS.Save.db.seenPrologue = false;
    WS.Save.db.seenManual = true;
    WS.Save.save();
    WS.Save.flush();
  }, version);
  await page.reload();
  await page.waitForFunction(() => window.WS && WS.Prologue);
  await page.waitForTimeout(400);

  const running = await page.evaluate(() => (WS.Prologue && WS.Prologue.version) || 0);
  if (running !== version) {
    say(version, `the setting asks for cut ${version} and cut ${running} is what plays`);
  }

  /* ---- plays, unprompted, on a new save ---------------------------------- */
  const first = await page.evaluate(() => ({
    active: WS.Prologue.active,
    state: WS.Game.state,
    marked: WS.Save.db.seenPrologue,
    manualUp: !!document.querySelector('#overlay:not(.hidden) .manual, #overlay:not(.hidden)'),
    seconds: WS.Prologue.length(),
    scenes: WS.Prologue.scenes().length,
  }));
  if (!first.active) say(version, 'a brand-new save did not get the prologue');
  if (first.state !== 'prologue') say(version, `state is "${first.state}" during the prologue`);
  if (!first.marked) say(version, 'the prologue did not record that it had been seen');
  if (first.seconds < 20) say(version, `the whole prologue is ${first.seconds}s long`);

  /* ---- every beat draws, and draws something of its own ------------------ */
  const beats = await page.evaluate(async () => {
    const canvas = document.getElementById('game-canvas');
    const g = canvas.getContext('2d');
    const list = WS.Prologue.scenes();
    const out = [];
    let acc = 0;
    for (const sc of list) {
      const mid = acc + (sc.hold || 0) * 0.5;
      acc += sc.hold || 0;
      WS.Prologue.t = mid; WS.Prologue.last = null;
      // two frames: one to advance, one to settle the DOM fade
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 0, lit = 0;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 379) {
        const v = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        hash = (hash * 31 + v) | 0;
        if (d[i] + d[i + 1] + d[i + 2] > 40) lit++;
        seen.add(v >> 3);
      }
      const box = document.querySelector('#prologue .lines');
      const r = box ? box.getBoundingClientRect() : null;
      out.push({ beat: sc.beat, mid, hash, lit, colours: seen.size,
        text: box ? box.textContent : '',
        rect: r && { top: Math.round(r.top), bottom: Math.round(r.bottom),
          left: Math.round(r.left), right: Math.round(r.right) },
        lines: sc.lines || [] });
    }
    return out;
  });

  for (const b of beats) {
    if (b.colours < 12 || b.lit < 40) {
      say(version, `the ${b.beat} beat draws almost nothing (${b.colours} colours, `
        + `${b.lit} lit samples) - an empty night is not a scene`);
    }
    for (const line of b.lines) {
      if (!b.text.includes(line)) {
        say(version, `no scene put "${line.slice(0, 42)}..." on screen - a line in the `
          + 'script never reaches the player');
      }
    }
    if (b.lines.length && b.rect) {
      if (b.rect.top < 720 * 0.6) {
        say(version, `the words are drawn over the scene (top ${b.rect.top}px of 720) - `
          + 'they belong in their own band');
      }
      if (b.rect.left < 0 || b.rect.right > 1280 || b.rect.bottom > 720) {
        say(version, `the words spill off the screen (${JSON.stringify(b.rect)})`);
      }
    }
  }
  /* Distinct beats must look distinct - measured at the SAME moment.
     Sampling each beat at its own midpoint compares two different times as
     well as two different beats, so every beat came out "distinct" even when
     they were all secretly the same one. This draws each beat at an identical
     t and k and hashes that. */
  const shapes = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas');
    const g = canvas.getContext('2d');
    const R = WS.Renderer;
    const out = {};
    for (const name of Object.keys(WS.Prologue.beats)) {
      g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
      g.clearRect(0, 0, R.viewW, R.viewH);
      g.save();
      g.translate(R.offsetX, R.offsetY);
      g.scale(R.scale, R.scale);
      WS.Prologue.beats[name](g, 3.0, 0.5);
      g.restore();
      const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 0;
      for (let i = 0; i < d.length; i += 4 * 137) {
        hash = (hash * 31 + ((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])) | 0;
      }
      out[name] = hash;
    }
    return out;
  });
  const byBeat = new Map();
  for (const b of beats) if (!byBeat.has(b.beat)) byBeat.set(b.beat, b);
  const seenShape = new Map();
  for (const [name, hash] of Object.entries(shapes)) {
    if (seenShape.has(hash)) {
      say(version, `the ${name} beat draws the same picture as ${seenShape.get(hash)}`);
    }
    seenShape.set(hash, name);
  }

  /* ---- the random stream is handed back ---------------------------------- */
  const seeds = await page.evaluate(() => {
    WS.setSeed(12345);
    const before = WS.getSeed();
    WS.Prologue.finish();
    WS.Prologue.begin(() => {});
    const after = WS.getSeed();
    WS.Prologue.finish();
    return { before, after };
  });
  if (seeds.before !== seeds.after) {
    say(version, `the prologue left the random stream seeded (${seeds.before} -> `
      + `${seeds.after}) - every run after it would be the same run`);
  }

  /* ---- it ends, three ways ----------------------------------------------- */
  const ends = {};
  ends.key = await page.evaluate(async () => {
    WS.Prologue.begin(() => { window.__landed = 'yes'; });
    window.__landed = null;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    return { active: WS.Prologue.active, landed: window.__landed,
      layer: !!document.getElementById('prologue') };
  });
  if (ends.key.active || ends.key.layer) say(version, 'a key press did not end the prologue');
  if (ends.key.landed !== 'yes') say(version, 'skipping the prologue did not hand back to the game');

  ends.tap = await page.evaluate(async () => {
    WS.Prologue.begin(() => {});
    const layer = document.getElementById('prologue');
    layer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    return WS.Prologue.active;
  });
  if (ends.tap) say(version, 'tapping the screen did not end the prologue');

  /* A pad is the one input that cannot dispatch a DOM event, so the prologue
     polls for it - and a poll that never runs is a player stuck on a sofa. */
  ends.pad = await page.evaluate(async () => {
    const real = navigator.getGamepads;
    navigator.getGamepads = () => [{ buttons: [{ pressed: true }], axes: [0, 0] }];
    WS.Prologue.begin(() => {});
    WS.Prologue.padCheck();
    const stopped = !WS.Prologue.active;
    navigator.getGamepads = real;
    WS.Prologue.finish();
    return stopped;
  });
  if (!ends.pad) say(version, 'a gamepad button did not end the prologue');

  /* ---- and it is still reachable afterwards ------------------------------ */
  const again = await page.evaluate(async () => {
    WS.Save.db.seenManual = true;
    WS.UI.openMenu();
    const btn = [...document.querySelectorAll('#overlay button')]
      .find((b) => /prologue/i.test(b.textContent));
    if (!btn) return { found: false };
    btn.click();
    await new Promise((r) => setTimeout(r, 80));
    const active = WS.Prologue.active;
    WS.Prologue.finish();
    await new Promise((r) => setTimeout(r, 80));
    return { found: true, active, back: WS.Game.state,
      menu: !document.getElementById('overlay').classList.contains('hidden') };
  });
  if (!again.found) say(version, 'there is no way to watch the prologue again from the menu');
  else {
    if (!again.active) say(version, 'the menu button did not start the prologue');
    if (!again.menu) say(version, 'leaving the prologue did not put the menu back');
  }

  /* ---- a returning save is left alone ------------------------------------ */
  const page2 = await ctx.newPage();
  page2.on('pageerror', (e) => say(version, 'page error on the second visit: ' + e.message));
  await page2.goto(GAME);
  await page2.waitForFunction(() => window.WS && WS.Prologue);
  await page2.waitForTimeout(500);
  const second = await page2.evaluate(() => ({
    active: WS.Prologue.active, seen: WS.Save.db.seenPrologue }));
  if (!second.seen) say(version, 'the second visit did not remember it had been seen');
  if (second.active) say(version, 'a returning player was made to watch the prologue again');

  await ctx.close();
  return { scenes: first.scenes, seconds: first.seconds, beats: byBeat.size };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const seen = [];
  for (const v of VERSIONS) seen.push([v, await pass(browser, v)]);
  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail.slice(0, 14)) console.error('  - ' + f);
    if (fail.length > 14) console.error(`  ... and ${fail.length - 14} more`);
    process.exit(1);
  }
  const each = seen.map(([v, r]) => `cut ${v} runs ${r.scenes} scenes over `
    + `${r.seconds.toFixed(0)}s in ${r.beats} distinct beats`).join(', ');
  console.log(`ok: ${each} - in both, every scripted line reaches the screen inside its own `
    + 'band, every beat draws its own picture, a key, a tap and a pad each end it, the '
    + 'random stream comes back untouched, it is watchable again from the menu, and a '
    + 'returning save is left alone');
})();
