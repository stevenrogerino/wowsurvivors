#!/usr/bin/env node
/* The victory cinematic: does it play, is it about the player, and can you
 * get out of it?
 *
 * This is the only piece of the game that a player reaches by being good at
 * it, which makes it the one nobody will ever see in testing unless something
 * drives a run to 30:00 on purpose. So:
 *
 *   plays     Reaching thirty minutes with the setting on plays it, and it
 *             hands over to the results panel afterwards. With the setting off
 *             the panel arrives directly and nothing is skipped or lost.
 *
 *   stars     It is ABOUT the survivor the player ran. Two runs with two
 *             different characters have to draw two different pictures and put
 *             two different names on screen - a cinematic that stars a
 *             hard-coded warrior no matter who you picked is the failure this
 *             whole feature exists to avoid, and it would look completely
 *             fine.
 *
 *   names     The script is data with {name}, {title} and {map} in it, so the
 *             substitutions have to actually resolve. WS.template was built
 *             for numbers and rounds by default; the first template with a
 *             name in it rendered "NAN" and looked deliberate.
 *
 *   frames    The battlefield furniture is not part of the shot. This runs
 *             mid-run, so unlike the prologue there is a live HUD over the top
 *             of it - a portrait, a clock reading 30:00, a gold column - and
 *             it has to be out of the way while the piece plays and back
 *             afterwards, because the player may choose to fight on.
 *
 *   smooth    No scene boundary may be a cut. Same rule and same measurement
 *             as the prologue: step at 15fps, diff consecutive frames, and a
 *             boundary that moves the picture far more than the frames either
 *             side of it is a cut rather than a transition.
 *
 *   lands     It has to arrive somewhere. The piece opens on the last of the
 *             night and closes on full morning, and if the end is not
 *             substantially brighter than the beginning then the sun did not
 *             come up.
 *
 *   ends      Key, pointer and pad all skip it.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-victory.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const fail = [];

/** Drive a fresh page to the moment of victory as `who`. */
async function toVictory(ctx, who, opts) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail.push(`page error (${who}): ` + e.message));
  await page.goto(GAME);
  await page.waitForFunction(() => window.WS && WS.Victory);
  await page.waitForTimeout(350);
  await page.evaluate(({ who, on }) => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Save.settings.victoryCinematic = on;
    WS.Game.startRun('thornhollow', who);
    WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
    WS.Game.run.time = WS.Config.deathTime;
    WS.Game.victory();
  }, { who, on: !opts || opts.on !== false });
  await page.waitForTimeout(350);
  return page;
}

const sample = (page, t) => page.evaluate(async (tt) => {
  const canvas = document.getElementById('game-canvas');
  const g = canvas.getContext('2d');
  WS.Victory.t = tt; WS.Victory.last = null;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const N = 4096;
  const stride = Math.max(4, Math.floor(d.length / 4 / N) * 4);
  const px = [];
  let lum = 0;
  for (let i = 0; i < d.length && px.length < N; i += stride) {
    const v = d[i] + d[i + 1] + d[i + 2];
    px.push(v); lum += v;
  }
  const box = document.querySelector('#prologue .lines');
  const r = box ? box.getBoundingClientRect() : null;
  return { px, lum: lum / (px.length * 3), text: box ? box.textContent : '',
    rect: r && { top: Math.round(r.top), left: Math.round(r.left),
      right: Math.round(r.right), bottom: Math.round(r.bottom) } };
}, t);

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  /* ---- plays, and covers the battlefield while it does ------------------- */
  const page = await toVictory(ctx, 'mage');
  const opened = await page.evaluate(() => ({
    active: WS.Victory.active,
    state: WS.Game.state,
    seconds: WS.Victory.length(),
    layer: !!document.getElementById('prologue'),
    hud: document.getElementById('hud').classList.contains('hidden'),
    panel: !document.getElementById('overlay').classList.contains('hidden'),
  }));
  if (!opened.active) fail.push('reaching thirty minutes did not play the victory cinematic');
  if (opened.state !== 'cinematic') fail.push(`state is "${opened.state}" while it plays`);
  if (opened.seconds < 10) fail.push(`the whole piece is ${opened.seconds}s long`);
  if (!opened.hud) {
    fail.push('the HUD is still up over the cinematic - a portrait, a clock reading 30:00 '
      + 'and a gold column are not part of the shot');
  }
  if (opened.panel) fail.push('the results panel is already up underneath it');

  /* ---- every scene draws, says its line, and keeps it in its band -------- */
  const scenes = await page.evaluate(() => WS.Victory.scenes());
  let acc = 0;
  const marks = [];
  for (const sc of scenes) { marks.push({ beat: sc.beat, mid: acc + (sc.hold || 0) * 0.5,
    lines: sc.lines || [] }); acc += sc.hold || 0; }
  const seen = new Map();
  for (const m of marks) {
    const s = await sample(page, m.mid);
    const hash = s.px.reduce((a, v) => (a * 31 + v) | 0, 0);
    if (seen.has(hash)) {
      fail.push(`the ${m.beat} beat draws the same picture as ${seen.get(hash)}`);
    }
    seen.set(hash, m.beat);
    if (s.lum < 4) fail.push(`the ${m.beat} beat is a black screen (${s.lum.toFixed(1)})`);
    for (const line of m.lines) {
      // the raw line still has its {braces}; what reaches the screen must not
      const filled = await page.evaluate((l) => WS.Victory.fill(l), line);
      if (/[{}]/.test(filled) || /NaN/i.test(filled)) {
        fail.push(`"${line}" came out as "${filled}" - a substitution did not resolve`);
      }
      if (!s.text.includes(filled)) {
        fail.push(`no scene put "${filled.slice(0, 40)}" on screen`);
      }
    }
    if (m.lines.length && s.rect) {
      if (s.rect.top < 720 * 0.6) {
        fail.push(`the words are drawn over the scene (top ${s.rect.top}px of 720)`);
      }
      if (s.rect.left < 0 || s.rect.right > 1280 || s.rect.bottom > 720) {
        fail.push(`the words spill off the screen (${JSON.stringify(s.rect)})`);
      }
    }
  }

  /* ---- it lands somewhere brighter than it started ----------------------- */
  const first = await sample(page, 1.0);
  const last = await sample(page, (await page.evaluate(() => WS.Victory.length())) - 0.4);
  const lift = last.lum / Math.max(0.01, first.lum);
  if (lift < 2.2) {
    fail.push(`the piece opens at a luminance of ${first.lum.toFixed(0)} and closes at `
      + `${last.lum.toFixed(0)} - ${lift.toFixed(1)}x is not a sunrise`);
  }

  /* ---- and no boundary is a cut ------------------------------------------ */
  const walk = await page.evaluate(async () => {
    const canvas = document.getElementById('game-canvas');
    const g = canvas.getContext('2d');
    const total = WS.Victory.length();
    const N = 4096;
    const steps = [];
    let prev = null;
    for (let t = 0.2; t < total - 0.05; t += 1 / 15) {
      WS.Victory.t = t; WS.Victory.last = null;
      await new Promise((r) => requestAnimationFrame(r));
      const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
      const stride = Math.max(4, Math.floor(d.length / 4 / N) * 4);
      const cur = [];
      for (let i = 0; i < d.length && cur.length < N; i += stride) {
        cur.push(d[i] + d[i + 1] + d[i + 2]);
      }
      let diff = 0;
      if (prev) {
        for (let i = 0; i < cur.length; i++) diff += Math.abs(cur[i] - prev[i]);
        diff /= cur.length * 3;
      }
      steps.push({ t, diff });
      prev = cur;
    }
    const bounds = [];
    let a = 0;
    for (const sc of WS.Victory.scenes()) { a += sc.hold || 0; bounds.push(a); }
    bounds.pop();
    return { steps, bounds };
  });
  const diffs = walk.steps.map((r) => r.diff).sort((x, y) => x - y);
  const med = diffs[Math.floor(diffs.length / 2)] || 1e-6;
  let worst = { at: 0, ratio: 0 };
  for (const b of walk.bounds) {
    const near = walk.steps.filter((r) => r.t >= b - 0.02 && r.t <= b + 0.24);
    const hi = Math.max(0, ...near.map((r) => r.diff));
    if (hi / med > worst.ratio) worst = { at: b, ratio: hi / med };
  }
  if (worst.ratio > 6) {
    fail.push(`the scene boundary at ${worst.at.toFixed(1)}s is a cut, not a transition - `
      + `it moves the picture ${worst.ratio.toFixed(1)}x as much as a typical step`);
  }

  /* ---- it ends, three ways, and hands over ------------------------------- */
  const ends = await page.evaluate(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    return { active: WS.Victory.active, state: WS.Game.state,
      layer: !!document.getElementById('prologue'),
      hud: document.getElementById('hud').classList.contains('hidden'),
      panel: !document.getElementById('overlay').classList.contains('hidden') };
  });
  if (ends.active || ends.layer) fail.push('a key press did not end the cinematic');
  if (!ends.panel) fail.push('ending the cinematic did not put the results panel up');
  if (ends.state !== 'over') fail.push(`state after it is "${ends.state}", not "over"`);
  if (ends.hud) {
    fail.push('the HUD never came back - a player who chooses to fight on has no HUD');
  }

  const tap = await page.evaluate(async () => {
    WS.Victory.begin(WS.Game.player, WS.Game.run, () => {});
    const layer = document.getElementById('prologue');
    layer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    return WS.Victory.active;
  });
  if (tap) fail.push('tapping the screen did not end the cinematic');

  const pad = await page.evaluate(async () => {
    const real = navigator.getGamepads;
    navigator.getGamepads = () => [{ buttons: [{ pressed: true }], axes: [0, 0] }];
    WS.Victory.begin(WS.Game.player, WS.Game.run, () => {});
    WS.Victory.padCheck();
    const stopped = !WS.Victory.active;
    navigator.getGamepads = real;
    WS.Victory.finish();
    return stopped;
  });
  if (!pad) fail.push('a gamepad button did not end the cinematic');
  await page.close();

  /* ---- STARS THE PLAYER --------------------------------------------------
   * The whole point. Two runs, two survivors, and the pictures and the names
   * both have to differ. A hard-coded lead would sail through every other rule
   * in this file. */
  const shots = {};
  for (const who of ['priest', 'graveblade']) {
    const p = await toVictory(ctx, who);
    const s = await sample(p, 15.0);
    shots[who] = { hash: s.px.reduce((a, v) => (a * 31 + v) | 0, 0), text: s.text,
      name: await p.evaluate(() => WS.Characters[WS.Game.run.characterId].name) };
    let differing = 0;
    shots[who].px = s.px;
    await p.close();
    void differing;
  }
  const [a, b] = ['priest', 'graveblade'].map((k) => shots[k]);
  if (a.hash === b.hash) {
    fail.push('two different survivors draw the identical frame - the cinematic is not '
      + 'starring the one the player ran');
  } else {
    let n = 0;
    for (let i = 0; i < a.px.length; i++) if (Math.abs(a.px[i] - b.px[i]) > 12) n++;
    const pct = (100 * n) / a.px.length;
    if (pct < 0.4) {
      fail.push(`two different survivors differ across only ${pct.toFixed(2)}% of the frame `
        + '- that is not a picture of the one the player ran');
    }
    shots.pct = pct;
  }
  for (const who of ['priest', 'graveblade']) {
    if (!shots[who].text.includes(shots[who].name)) {
      fail.push(`running the ${who} put "${shots[who].text.slice(0, 30)}" on screen, `
        + `not "${shots[who].name}"`);
    }
  }

  /* ---- and the setting really turns it off ------------------------------- */
  const off = await toVictory(ctx, 'mage', { on: false });
  const skipped = await off.evaluate(() => ({
    active: WS.Victory.active,
    panel: !document.getElementById('overlay').classList.contains('hidden'),
    state: WS.Game.state,
  }));
  if (skipped.active) fail.push('the setting is off and the cinematic played anyway');
  if (!skipped.panel) {
    fail.push('with the cinematic off, the results panel did not arrive - turning it off '
      + 'has to leave the player somewhere');
  }
  await off.close();

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail.slice(0, 14)) console.error('  - ' + f);
    if (fail.length > 14) console.error(`  ... and ${fail.length - 14} more`);
    process.exit(1);
  }
  console.log(`ok: ${scenes.length} scenes over ${opened.seconds}s, each drawing its own `
    + `picture and saying its own line inside its own band; it brightens ${lift.toFixed(1)}x `
    + `from the last of the night to full morning with its worst scene boundary moving the `
    + `picture ${worst.ratio.toFixed(1)}x a typical step; two different survivors give two `
    + `pictures differing across ${shots.pct.toFixed(1)}% of the frame and two different `
    + 'names; a key, a tap and a pad each end it into the results panel with the HUD back; '
    + 'and the setting turns it off without losing the panel');
})();
