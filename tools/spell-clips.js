#!/usr/bin/env node
/* Records a short looping clip of every spell, for the Spellbook.
 *
 * A tester: once you have taken a few weapons you no longer know which of
 * the things on screen is which. The spotlight answers that during a run;
 * this answers "what does this one look like" anywhere a spell is shown - a
 * click on it plays its clip.
 *
 * Each clip is the real game: the survivor alone in the middle of the field
 * with just that one weapon, a crowd walking in, filmed on a fixed seed once
 * the effect has filled the screen - three times, so a player sees what it
 * looks like when they first take it as well as what it grows into:
 *
 *   <id>_early.webp    rank 1, as it is first offered
 *   <id>_middle.webp   rank 5
 *   <id>_late.webp     rank 8 and evolved (unions: as forged, the only tier)
 *
 * Filmed at twice the pixel density (the game draws its canvas at up to 2x,
 * so this is what a sharp screen shows), thirty frames a second, and written
 * as short VP9 WebM videos to spells/ (a link to site/spells) - a real video codec, so a clip is
 * sharp and smooth at a size an animated image could not get near. The game
 * loads a clip only when it is asked for; copies go beside the built pages
 * (site/, desktop/game/).
 *
 *   node tools/spell-clips.js                 every weapon and union
 *   node tools/spell-clips.js --only rimeshard
 *
 * Needs ffmpeg with libvpx-vp9 (tools look in node_modules/ffmpeg-static, then
 * $FFMPEG, then PATH). Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'spells');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const ONLY = arg('--only');
// --shard 2/4: every fourth job from the second, so several can film at once
const SHARD = (arg('--shard') || '1/1').split('/').map(Number);
const FPS = 30, SECONDS = 4, WARM = 3.2;
const STEP = 60 / FPS;                  // game frames (1/60 s) per clip frame
const DPR = 2;                          // filmed at twice the page's pixels
const CROP = { w: 640, h: 400 };       // around the survivor, in page pixels
const SIZE = +(process.env.SIZE || 960);    // clip width in pixels (1.5x the viewer)
const CRF = +(process.env.CRF || 37);       // VP9 quality: lower is better and larger

function ffmpeg() {
  const cands = [process.env.FFMPEG, path.join(ROOT, 'node_modules/ffmpeg-static/ffmpeg'), 'ffmpeg'].filter(Boolean);
  for (const c of cands) {
    try { execFileSync(c, ['-hide_banner', '-version'], { stdio: 'ignore' }); return c; } catch (e) { /* next */ }
  }
  throw new Error('ffmpeg not found: set FFMPEG');
}

(async () => {
  const ff = ffmpeg();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: DPR })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => {
    let now = 0, q = [];
    window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
    performance.now = () => now;
    window.__pump = (n, dt) => { for (let i = 0; i < n; i++) { now += dt * 1000; const r = q; q = []; for (const cb of r) cb(now); } };
  });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
  const jobs = await page.evaluate(() => {
    const out = [];
    const max = WS.WEAPON_MAX_LEVEL;
    for (const id of WS.WeaponOrder) {
      out.push({ id, tier: 'early', level: 1, evolved: false });
      out.push({ id, tier: 'middle', level: 5, evolved: false });
      out.push({ id, tier: 'late', level: max, evolved: !!WS.Weapons[id].evolveName });
    }
    for (const u of WS.Unions) out.push({ id: u.result, tier: 'late', level: max, evolved: false });
    return out;
  });
  const todo = (ONLY ? jobs.filter((j) => j.id === ONLY) : jobs)
    .filter((j, k) => k % SHARD[1] === SHARD[0] - 1);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clips-'));
  for (const job of todo) {
    const name = job.id + '_' + job.tier;
    const box = await page.evaluate(({ id, tier, level, evolved, crop }) => {
      __pump(2, 1 / 60);
      if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
      WS.UI.closeOverlay(); WS.Save.db.seenManual = true; WS.Save.unlockAll();
      WS.Save.settings.damageNumbers = false; WS.Save.settings.screenShake = false;
      WS.setSeed(7);
      WS.Game.startRun('thornhollow', 'mage');
      // No blessing (an aura or a regeneration would be in every clip), and
      // no heal numbers floating off the survivor.
      WS.FX.heal = () => {};
      if (WS.Game.state === 'blessing') { WS.UI.closeOverlay(); WS.Game.beginWaves(); }
      WS.Game.timeScale = 1;
      WS.Game.openLevelUp = () => {}; WS.Game.presentLevelUp = () => {};
      WS.Game.pendingLevelUps = 0; WS.Game.leveling = false; WS.Game.state = 'playing';
      WS.UI.closeOverlay();
      document.getElementById('hud').classList.add('hidden');
      const p = WS.Game.player;
      p.maxHealth = 1e7; p.health = 1e7; p.invulnerable = 1e6;
      p.weapons.length = 0; p.weaponLevels = {};
      const w = WS.Player.addWeapon(p, id);
      w.level = level; p.weaponLevels[id] = level; w.evolved = evolved;
      p.x = WS.CONST.WORLD_WIDTH / 2; p.y = WS.CONST.WORLD_HEIGHT / 2;
      const WM = WS.WaveManager;
      WM.spawnTimer = 1e9; WM.cacheTimer = 1e9; WM.merchantTimer = 1e9;
      WS.Airdrop.clear();
      /* The crowd: a steady stream walking in from the edges of the frame,
         kept inside it - a spell that picks its targets (a meteor, a lance)
         then lands where the camera is - and sturdy enough to take a few
         hits at each tier, so the clip shows the spell working a crowd
         rather than one flash and an empty field. Anything knocked out of
         frame walks back in from the edge it left by. */
      const s = WS.Renderer.scale || 1;
      const RX = crop.w / 2 / s - 18, RY = crop.h / 2 / s - 16;
      const HP = { early: 3, middle: 7, late: 14 }[tier];
      window.__crowd = (burst) => {
        const E = WS.Enemy.pool;
        for (let i = 0; i < E.count; i++) {
          const e = E.active[i];
          const dx = (e.x - p.x) / (RX + 24), dy = (e.y - p.y) / (RY + 20);
          if (dx * dx + dy * dy > 1) {
            const a = Math.atan2(e.y - p.y, e.x - p.x);
            e.x = p.x + Math.cos(a) * RX; e.y = p.y + Math.sin(a) * RY;
          }
          // The survivor cannot be hurt, so nothing stops the crowd walking
          // into him and stacking out of sight under his sprite: each one
          // halts at its own distance instead, and they gather round.
          if (!e._stop) e._stop = 55 + Math.random() * 70;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < e._stop) {
            const a = d > 0.5 ? Math.atan2(e.y - p.y, e.x - p.x) : Math.random() * Math.PI * 2;
            e.x = p.x + Math.cos(a) * e._stop; e.y = p.y + Math.sin(a) * e._stop;
          }
        }
        const want = Math.min(18 - E.count, burst);
        for (let i = 0; i < want; i++) {
          const a = Math.random() * Math.PI * 2;
          const e = WS.Enemy.spawn('lampling', p.x + Math.cos(a) * RX, p.y + Math.sin(a) * RY, HP);
          if (e) e.xpValue = 0;
        }
      };
      // Only the spell and what it is hitting: no gems or drops on the
      // ground, no numbers floating up, no notices.
      window.__tidy = () => {
        WS.XP.clear(); WS.Pickup.clear();
        if (WS.FX.texts) WS.FX.texts.releaseAll();
        if (WS.Game.toasts) WS.Game.toasts.length = 0;
      };
      window.__crowd(18);
      return { x: p.x, y: p.y };
    }, { ...job, crop: CROP });
    // Warm up until the effect fills the frame, feeding the crowd.
    for (let t = 0; t < WARM; t += 0.5) {
      await page.evaluate(() => { for (let k = 0; k < 30; k++) { __pump(1, 1 / 60); window.__crowd(k % 5 ? 0 : 2); } WS.Game.player.health = 1e7; window.__tidy(); });
    }
    const frames = FPS * SECONDS;
    for (let f = 0; f < frames; f++) {
      await page.evaluate(({ f, STEP }) => {
        for (let k = 0; k < STEP; k++) { __pump(1, 1 / 60); window.__crowd(k ? 0 : 1); }
        const p = WS.Game.player; p.health = 1e7;
        window.__tidy();
      }, { f, STEP });
      const scale = await page.evaluate(() => ({ s: WS.Renderer.scale || 1, ox: WS.Renderer.offsetX || 0, oy: WS.Renderer.offsetY || 0 }));
      const cx = scale.ox + box.x * scale.s, cy = scale.oy + (box.y - 20) * scale.s;
      await page.screenshot({ path: path.join(tmp, `f${String(f).padStart(3, '0')}.png`),
        clip: { x: Math.max(0, cx - CROP.w / 2), y: Math.max(0, cy - CROP.h / 2), width: CROP.w, height: CROP.h } });
    }
    const dest = path.join(OUT, name + '.webm');
    execFileSync(ff, ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(tmp, 'f%03d.png'),
      '-vf', `scale=${SIZE}:-2:flags=lanczos`, '-c:v', 'libvpx-vp9', '-crf', String(CRF), '-b:v', '0',
      '-pix_fmt', 'yuv420p', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-an', dest]);
    // The animated images this replaced.
    const old = path.join(OUT, name + '.webp');
    if (fs.existsSync(old)) fs.unlinkSync(old);
    if (process.env.KEEP) fs.copyFileSync(path.join(tmp, 'f060.png'), path.join(process.env.KEEP, name + '.png'));
    for (const f of fs.readdirSync(tmp)) fs.unlinkSync(path.join(tmp, f));
    console.log(`${name.padEnd(28)} ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
  }
  await browser.close();
  if (errs.length) console.log('page errors: ' + errs.slice(0, 3).join(' | '));
  // Beside the built pages, which load clips from ./spells/.
  // (spells/ is a link to site/spells, the one stored copy; a folder that IS
  // the output is left alone rather than copied onto itself.)
  for (const where of ['site/spells', 'desktop/game/spells']) {
    const d = path.join(ROOT, where);
    fs.mkdirSync(d, { recursive: true });
    if (fs.realpathSync(d) === fs.realpathSync(OUT)) continue;
    const have = new Set(fs.readdirSync(OUT));
    for (const f of have) fs.copyFileSync(path.join(OUT, f), path.join(d, f));
    // a copy of a clip that is no longer made (the folder holds only clips)
    for (const f of fs.readdirSync(d)) if (!have.has(f)) fs.unlinkSync(path.join(d, f));
  }
})();
