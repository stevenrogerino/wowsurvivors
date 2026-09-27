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
 * Written as looping animated WebP to spells/, which
 * the game loads only when a clip is asked for, and copied beside the built
 * pages (site/, desktop/game/).
 *
 *   node tools/spell-clips.js                 every weapon and union
 *   node tools/spell-clips.js --only rimeshard
 *
 * Needs ffmpeg with libwebp (tools look in node_modules/ffmpeg-static, then
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
const FPS = 10, SECONDS = 2.6, WARM = 3.2;
const CROP = { w: 560, h: 360 };       // around the survivor, in page pixels
const SIZE = 240;                       // clip width

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
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
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
  const todo = ONLY ? jobs.filter((j) => j.id === ONLY) : jobs;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clips-'));
  for (const job of todo) {
    const name = job.id + '_' + job.tier;
    const box = await page.evaluate(({ id, level, evolved }) => {
      __pump(2, 1 / 60);
      if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
      WS.UI.closeOverlay(); WS.Save.db.seenManual = true; WS.Save.unlockAll();
      WS.Save.settings.damageNumbers = false; WS.Save.settings.screenShake = false;
      WS.setSeed(7);
      WS.Game.startRun('thornhollow', 'mage');
      if (WS.Game.state === 'blessing') WS.Game.chooseBlessing(WS.Game.blessingChoices[0]);
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
      window.__crowd = () => {
        // A thin ring walking in - enough to show what the spell does to a
        // crowd, few enough that the spell, not the crowd, fills the frame.
        const want = 22 - WS.Enemy.pool.count;
        for (let i = 0; i < want; i++) {
          const a = Math.random() * Math.PI * 2;
          const e = WS.Enemy.spawn('lampling', p.x + Math.cos(a) * 240, p.y + Math.sin(a) * 160, 2.5);
          if (e) e.xpValue = 0;
        }
      };
      window.__crowd();
      return { x: p.x, y: p.y };
    }, job);
    // Warm up until the effect fills the frame, feeding the crowd.
    for (let t = 0; t < WARM; t += 0.5) {
      await page.evaluate(() => { __pump(30, 1 / 60); window.__crowd(); WS.Game.player.health = 1e7; if (WS.Game.toasts) WS.Game.toasts.length = 0; });
    }
    const frames = FPS * SECONDS;
    for (let f = 0; f < frames; f++) {
      await page.evaluate((f) => {
        __pump(6, 1 / 60);
        const p = WS.Game.player; p.health = 1e7;
        if (f % 5 === 0) window.__crowd();
        if (WS.Game.toasts) WS.Game.toasts.length = 0;
      }, f);
      const scale = await page.evaluate(() => ({ s: WS.Renderer.scale || 1, ox: WS.Renderer.offsetX || 0, oy: WS.Renderer.offsetY || 0 }));
      const cx = scale.ox + box.x * scale.s, cy = scale.oy + (box.y - 20) * scale.s;
      await page.screenshot({ path: path.join(tmp, `f${String(f).padStart(3, '0')}.png`),
        clip: { x: Math.max(0, cx - CROP.w / 2), y: Math.max(0, cy - CROP.h / 2), width: CROP.w, height: CROP.h } });
    }
    const dest = path.join(OUT, name + '.webp');
    execFileSync(ff, ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(tmp, 'f%03d.png'),
      '-vf', `scale=${SIZE}:-1:flags=lanczos`, '-c:v', 'libwebp_anim', '-loop', '0', '-quality', '50',
      '-compression_level', '6', dest]);
    if (process.env.KEEP) fs.copyFileSync(path.join(tmp, 'f012.png'), path.join(process.env.KEEP, name + '.png'));
    for (const f of fs.readdirSync(tmp)) fs.unlinkSync(path.join(tmp, f));
    console.log(`${name.padEnd(28)} ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
  }
  await browser.close();
  if (errs.length) console.log('page errors: ' + errs.slice(0, 3).join(' | '));
  // Beside the built pages, which load clips from ./spells/.
  for (const where of ['site/spells', 'desktop/game/spells']) {
    const d = path.join(ROOT, where);
    fs.mkdirSync(d, { recursive: true });
    for (const f of fs.readdirSync(OUT)) fs.copyFileSync(path.join(OUT, f), path.join(d, f));
  }
})();
