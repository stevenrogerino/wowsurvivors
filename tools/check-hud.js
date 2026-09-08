#!/usr/bin/env node
/* Heads-up display guard rail: what the player can see, and can see past.
 *
 * 1. NOTHING MAY LEAVE THE SCREEN. #hud-boss carried `transform:
 *    translateX(-50%)` for centring AND `animation: sweep-in`, and sweep-in
 *    animates `transform` - so for the 300ms of its entrance the animation's
 *    transform REPLACED the centring one and the bar drew from `left: 50%`
 *    with nothing pulling it back. Measured at 1280x720: it entered at
 *    x=642..1398, 380px right of true centre and 118px past the right edge of
 *    the window, then snapped into place when the animation ended. Every boss
 *    arrival, on the loudest beat in the game. A transform cannot be
 *    half-overridden, so the centring now lives inside the keyframes.
 *
 * 2. THE MIDDLE OF THE FIELD BELONGS TO THE PLAYER. Toasts were centred and
 *    460px wide, which put them at y 441..628 of a 720-tall field - the ground
 *    directly under a survivor who spends the whole run near the middle
 *    because the horde comes from every side.
 *
 * 3. SURVIVAL MUST NOT DEPEND ON HUE. The arena's Sunfall Spears told safe
 *    ground from doomed ground with a green wash against a red one and nothing
 *    else. Red against green is the commonest colour blindness there is, and
 *    both fills were dark and desaturated, so for those players the arena's
 *    signature mechanic was a grid of identical rectangles. The check measures
 *    the two kinds of cell in LUMINANCE ONLY - all colour discarded - and
 *    demands they still separate.
 *
 * NEGATIVE TEST - all three were confirmed to fail against the old code:
 * restoring `animation: sweep-in` on #hud-boss gives "#hud-boss is 118px off
 * the right edge"; re-centring #hud-toasts gives "toasts sit over the middle
 * of the playfield"; dropping the hatching gives "safe and doomed ground are
 * separated by 0.2 in luminance and 7.4 in texture - indistinguishable
 * without colour". The texture bar is 15 rather than the 6 it started at,
 * because 6 PASSED the broken build - the cell borders alone measure 7.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-hud.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const SIZES = [
  { width: 1280, height: 720 },   // the reference 16:9
  { width: 1366, height: 768 },   // the commonest laptop panel there is
  { width: 1440, height: 900 },   // 16:10, letterboxed top and bottom
  { width: 1920, height: 1080 },
  { width: 2560, height: 1080 },  // ultrawide, letterboxed left and right
  { width: 1024, height: 768 },   // 4:3, the tightest thing we claim to fit
];

// How much of the field's own width and height counts as "the middle", where
// the survivor actually stands and nothing chrome-like may sit.
const CORE = 0.42;

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const fail = [];
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');

  /* ---- 1 & 2: geometry, at every size and both HUD layouts -------------- */
  for (const size of SIZES) {
    for (const layout of ['strip', 'rail']) {
      const page = await browser.newPage({ viewport: size });
      page.on('pageerror', (e) => fail.push(`${size.width}x${size.height}: ${e.message}`));
      await page.goto(url);
      await page.waitForFunction(() => window.WS && window.WS.Game);

      const report = await page.evaluate(async ([hudLayout, core]) => {
        WS.Save.db.seenManual = true;
        WS.Save.settings.hudLayout = hudLayout;
        WS.UI.applyHudLayout();
        WS.Save.unlockAll();
        WS.Game.startRun('thornhollow', 'mage');
        WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
        // A boss, a full passive rack and a stack of toasts: the busiest the
        // HUD ever is, which is when it runs out of room.
        WS.WaveManager.spawnBoss('murkgill', 3, false);
        for (const id of WS.UpgradeOrder.slice(0, 14)) {
          const up = WS.Upgrades[id];
          try { up.apply(WS.Game.player, up); } catch (e) { /* needs a target */ }
          WS.Game.player.upgradeLevels[id] = 3;
        }
        for (const id of WS.WeaponOrder.slice(0, 6)) WS.Player.addWeapon(WS.Game.player, id);
        WS.Game.toast('One', 'A line of body text that is about as long as they get.');
        WS.Game.toast('Two', 'A line of body text that is about as long as they get.');
        WS.Game.toast('Three', 'A line of body text that is about as long as they get.');
        WS.UI.updateHUD();
        // Measure DURING the entrance, which is when the bug showed.
        await new Promise((r) => requestAnimationFrame(r));

        const R = WS.Renderer;
        const field = {
          l: R.offsetX, t: R.offsetY,
          r: R.offsetX + 1280 * R.scale, b: R.offsetY + 720 * R.scale,
        };
        const midX = (field.l + field.r) / 2, midY = (field.t + field.b) / 2;
        const halfW = (field.r - field.l) * core / 2, halfH = (field.b - field.t) * core / 2;
        const box = { l: midX - halfW, r: midX + halfW, t: midY - halfH, b: midY + halfH };

        const out = { boxes: {} };
        for (const sel of ['#hud-portrait', '#hud-timer', '#hud-boss', '#hud-stats',
          '#hud-weapons', '#hud-passives', '#hud-toasts']) {
          const n = document.querySelector(sel);
          if (!n || !n.offsetParent) continue;
          const c = n.getBoundingClientRect();
          if (c.width === 0 && c.height === 0) continue;
          out.boxes[sel] = {
            offLeft: Math.round(0 - c.left), offRight: Math.round(c.right - innerWidth),
            offTop: Math.round(0 - c.top), offBottom: Math.round(c.bottom - innerHeight),
            inCore: c.right > box.l && c.left < box.r && c.bottom > box.t && c.top < box.b,
          };
        }
        return out;
      }, [layout, CORE]);

      const where = `${size.width}x${size.height} ${layout}`;
      for (const [sel, b] of Object.entries(report.boxes)) {
        for (const [edge, px] of [['right', b.offRight], ['left', b.offLeft],
          ['top', b.offTop], ['bottom', b.offBottom]]) {
          // A pixel of rounding is not a bug; a visible slice hanging off is.
          if (px > 2) fail.push(`${where}: ${sel} is ${px}px off the ${edge} edge`);
        }
        if (b.inCore) fail.push(`${where}: ${sel} sits over the middle of the playfield`);
      }
      await page.close();
    }
  }

  /* ---- 3: the arena, read with every trace of colour thrown away -------- */
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => fail.push('arena: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.WS && window.WS.Game);
  const arena = await page.evaluate(() => {
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Game.startRun('boss_arena', 'paladin');
    WS.Arena.hazards.length = 0;
    // Seeded, because spears() shuffles which cells are safe and an unseeded
    // layout moved the measurement between 16 and 29 from run to run - a range
    // wide enough that the threshold was deciding on the roll of a die rather
    // than on the drawing.
    WS.setSeed(20260908);
    WS.Arena.spears(5);
    // Half way through the telegraph: the hardest moment to read, because the
    // doomed cells have not yet reached full contrast.
    for (const h of WS.Arena.hazards) {
      if (h.shape === 'square') h.telegraph = WS.Arena.tuning.spearTele * 0.5;
    }
    WS.Renderer.draw(3);

    const ctx = document.getElementById('game-canvas').getContext('2d');
    const R = WS.Renderer, dpr = R.dpr;
    const groups = { safe: [], doomed: [] };
    for (const h of WS.Arena.hazards) {
      if (h.shape !== 'square') continue;
      const sx = Math.round((R.offsetX + (h.x + h.w * 0.25) * R.scale) * dpr);
      const sy = Math.round((R.offsetY + (h.y + h.h * 0.25) * R.scale) * dpr);
      const sw = Math.max(8, Math.round(h.w * 0.5 * R.scale * dpr));
      const sh = Math.max(8, Math.round(h.h * 0.5 * R.scale * dpr));
      const d = ctx.getImageData(sx, sy, sw, sh).data;
      const lum = [];
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        lum.push(L); sum += L;
      }
      const mean = sum / lum.length;
      let v = 0;
      for (const L of lum) v += (L - mean) * (L - mean);
      groups[h.safe ? 'safe' : 'doomed'].push({ mean, sd: Math.sqrt(v / lum.length) });
    }
    const avg = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
    return {
      cells: groups.safe.length + groups.doomed.length,
      brightness: Math.abs(avg(groups.safe, 'mean') - avg(groups.doomed, 'mean')),
      // Texture is the channel that carries the read: hatching versus flat.
      texture: Math.abs(avg(groups.safe, 'sd') - avg(groups.doomed, 'sd')),
    };
  });
  await page.close();

  /* The bar is set from both sides rather than guessed at. With the hatching
   * the two kinds of cell separate by 29 in texture; with it removed - which
   * is to say, back to hue and nothing else - they still measure 7, because
   * the cell borders alone put some variance in the sample. A threshold of 6
   * therefore PASSED the broken build, which the negative test caught and no
   * amount of re-reading the code would have. 15 sits clear of both. */
  if (arena.cells < 10) fail.push(`arena: only ${arena.cells} cells telegraphed`);
  if (arena.texture < 15 && arena.brightness < 25) {
    fail.push(`safe and doomed ground are separated by ${arena.brightness.toFixed(1)} in `
      + `luminance and ${arena.texture.toFixed(1)} in texture - indistinguishable without colour`);
  }

  /* ---- 4: a phone held upright is told, and not quietly killed ---------- */
  const upright = await browser.newPage({ viewport: { width: 390, height: 844 } });
  upright.on('pageerror', (e) => fail.push('portrait: ' + e.message));
  await upright.goto(url);
  await upright.waitForFunction(() => window.WS && window.WS.Game);
  const portrait = await upright.evaluate(async () => {
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Game.startRun('thornhollow', 'mage');
    WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
    await new Promise((r) => setTimeout(r, 250));
    const before = WS.Game.run.time;
    await new Promise((r) => setTimeout(r, 400));
    const R = WS.Renderer;
    return {
      prompted: getComputedStyle(document.getElementById('rotate')).display !== 'none',
      // The simulation must be stopped, not merely hidden: dying behind a
      // full-screen prompt you cannot see through is the worst of both.
      frozen: WS.Game.run.time === before,
      // And the field really is that small - this is the reason for all of it.
      playAreaPct: (1280 * R.scale * 720 * R.scale) / (innerWidth * innerHeight) * 100,
    };
  });
  if (!portrait.prompted) fail.push('a phone held upright gets no prompt to rotate');
  if (!portrait.frozen) fail.push('the simulation keeps running behind the rotate prompt');
  await upright.close();

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`ok: the HUD stays on screen and off the middle at ${SIZES.length} sizes in both `
    + `layouts, and the arena reads at ${arena.texture.toFixed(0)} texture / `
    + `${arena.brightness.toFixed(0)} brightness with no colour at all; a phone `
  + `held upright (${portrait.playAreaPct.toFixed(0)}% play area) is told to turn`);
})();
