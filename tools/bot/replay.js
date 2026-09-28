#!/usr/bin/env node
/* Watch the pilot: replay one seeded run and photograph a stretch of it.
 *
 * A ledger says what hurt; it cannot say whether the pilot could have done
 * better. This plays the same run tools/botlab.js played - same survivor,
 * battlefield, difficulty and seed, so the same night - and from FROM to TO
 * (seconds of run time) draws the real frame every EVERY seconds with the
 * pilot's decision over it: the move it chose (the arrow), the goal it is
 * walking to (the ring) and the plan it scored cheapest (the dots). Frames
 * land in OUT as PNGs, plus a contact sheet if ffmpeg is at FFMPEG.
 *
 *   HERO=rogue MAP=highmoor DIFF=professional SEED=101 FROM=150 TO=168 \
 *     OUT=/tmp/replay node tools/bot/replay.js
 *
 * For a clip rather than a diagnosis: OVERLAY=0 draws the game alone,
 * TOUGH=1 keeps the survivor standing so it reaches the late game, and
 * VIDEO=reel.mp4 (with FFMPEG) encodes the frames at 1/EVERY a second:
 *
 *   OVERLAY=0 EVERY=0.0333 FROM=600 TO=612 VIDEO=/tmp/reel.mp4 FFMPEG=... \
 *     node tools/bot/replay.js
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { installPilot } = require('./pilot.js');
const { installDrafter } = require('./draft.js');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const S = {
  HERO: env('HERO', 'mage'), MAP: env('MAP', 'thornhollow'), DIFF: env('DIFF', 'veteran'),
  HYPER: env('HYPER', '0') === '1', SEED: +env('SEED', 101), FROM: +env('FROM', 60), TO: +env('TO', 70),
  EVERY: +env('EVERY', 0.5), BLESS: env('BLESS', 'auto'), OVERLAY: env('OVERLAY', '1') !== '0',
  TOUGH: env('TOUGH', '0') === '1',
  PILOT_OPTS: JSON.parse(env('PILOT_OPTS', '{}')), DRAFT_OPTS: JSON.parse(env('DRAFT_OPTS', '{}')),
};
const OUT = env('OUT', path.join(require('os').tmpdir(), 'replay'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('file://' + path.resolve(__dirname, '..', '..', 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
  await page.evaluate(({ S, pilot, drafter }) => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay();
    WS.Save.db.seenManual = true; WS.Save.unlockAll();
    WS.Save.settings.difficulty = S.DIFF;
    WS.Save.db.unlocks.hyper[S.MAP] = true; WS.Save.db.hyperArmed = S.HYPER;
    WS.Save.save = () => {}; WS.Save.flush = () => {};
    WS.setSeed(S.SEED);
    WS.Game.startRun(S.MAP, S.HERO);
    window.__P = (0, eval)('(' + pilot + ')')(Object.assign({ trace: false }, S.PILOT_OPTS));
    window.__D = (0, eval)('(' + drafter + ')')(Object.assign({ blessing: S.BLESS === 'auto' ? null : S.BLESS }, S.DRAFT_OPTS));
    WS.Input.poll = function () {};
    /** Advance to run time `t` exactly as tools/botlab.js does. */
    window.__advance = function (t) {
      const G = WS.Game;
      for (let i = 0; i < 400000 && G.run.time < t; i++) {
        const p = G.player;
        if (G.state === 'blessing') { G.chooseBlessing(window.__D.pickBlessing(p, G.blessingChoices || [])); continue; }
        if (G.state === 'levelup') { const c = window.__D.pickLevel(p, G.levelChoices || []); if (c) G.chooseLevelUp(c); continue; }
        if (G.state === 'dying') { G.update(1 / 60); continue; }
        if (G.state !== 'playing') return false;
        window.__P.step(1 / 60);
        G.update(1 / 60);
        // TOUGH=1: the survivor cannot fall, so a clip can reach the late game.
        if (S.TOUGH && G.player) G.player.health = G.player.maxHealth;
      }
      // A card screen that opened on the last tick is answered now, not
      // mistaken for the end of the run.
      for (let i = 0; i < 20 && (G.state === 'blessing' || G.state === 'levelup'); i++) {
        const p = G.player;
        if (G.state === 'blessing') G.chooseBlessing(window.__D.pickBlessing(p, G.blessingChoices || []));
        else { const c = window.__D.pickLevel(p, G.levelChoices || []); if (c) G.chooseLevelUp(c); }
      }
      return G.state === 'playing' || G.state === 'dying';
    };
    /** Draw the frame, then the pilot's mind on top of it. */
    window.__draw = function () {
      WS.Renderer.draw(WS.Game.run.time);
      // The page's own loop (stopped here) is what keeps the HUD current.
      if (WS.Game.player) WS.UI.updateHUD();
      if (!S.OVERLAY) return;
      const cv = document.querySelector('canvas');
      const g = cv.getContext('2d');
      const sx = cv.width / WS.CONST.WORLD_WIDTH, sy = cv.height / WS.CONST.WORLD_HEIGHT;
      const p = WS.Game.player, P = window.__P;
      g.save(); g.setTransform(sx, 0, 0, sy, 0, 0);
      const D8 = [[0, 0], [1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];
      const d = D8[P.dir];
      g.strokeStyle = '#00ff88'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + d[0] * 70, p.y + d[1] * 70); g.stroke();
      if (P.goal) {
        g.strokeStyle = '#ffd24a'; g.lineWidth = 2;
        g.beginPath(); g.arc(P.goal.x, P.goal.y, 14, 0, Math.PI * 2); g.stroke();
        g.setLineDash([6, 6]); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(P.goal.x, P.goal.y); g.stroke(); g.setLineDash([]);
      }
      g.fillStyle = '#fff'; g.font = 'bold 18px monospace';
      g.fillText(`${WS.formatTime(WS.Game.run.time)}  hp ${Math.round(p.health)}/${Math.round(p.maxHealth)}  lvl ${p.level}  foes ${WS.Enemy.pool.count}`, 16, 700);
      g.restore();
    };
  }, { S, pilot: installPilot.toString(), drafter: installDrafter.toString() });

  let ok = await page.evaluate((t) => window.__advance(t), S.FROM);
  if (!ok) console.log("stopped before FROM:", await page.evaluate(() => WS.Game.state + " at " + WS.Game.run.time.toFixed(1)));
  const files = [];
  for (let t = S.FROM, n = 0; ok && t <= S.TO + 1e-9; t += S.EVERY, n++) {
    ok = await page.evaluate((t) => window.__advance(t), t);
    await page.evaluate(() => window.__draw());
    const f = path.join(OUT, `f${String(n).padStart(3, '0')}.png`);
    await page.locator('canvas').first().screenshot({ path: f });
    files.push(f);
  }
  await b.close();
  console.log(`${files.length} frames in ${OUT}`);
  const ff = env('FFMPEG', null);
  const video = env('VIDEO', null);
  if (ff && video && files.length) {
    execFileSync(ff, ['-y', '-loglevel', 'error', '-framerate', String(Math.round(1 / S.EVERY)),
      '-i', path.join(OUT, 'f%03d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', video]);
    console.log('video: ' + video);
  } else if (ff && files.length) {
    const cols = Math.min(4, files.length), rows = Math.ceil(files.length / cols);
    execFileSync(ff, ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'f%03d.png'),
      '-vf', `scale=480:-1,tile=${cols}x${rows}`, '-frames:v', '1', path.join(OUT, 'sheet.png')]);
    console.log('contact sheet: ' + path.join(OUT, 'sheet.png'));
  }
})();
