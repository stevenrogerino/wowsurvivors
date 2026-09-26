/* The store trailer, filmed from the game (run by tools/steam-assets.js
 * --only trailer).
 *
 * Every frame is the game's own: the opening and closing cards are the key
 * art painted live (the fire burning, the sparks rising), and everything in
 * between is real play on a fixed seed, steered by the same kiting bot the
 * screenshots use. Time is virtual (see steam-assets.js), so each frame is
 * exactly 1/30s of game however long it takes to photograph; the frames go
 * straight into ffmpeg as JPEGs and come out as H.264 at 1920x1080, 30fps.
 *
 * It is silent. Headless Chromium has no audio device to record from, and a
 * trailer's sound is a mix in its own right anyway: capture the game's music
 * and effects on a desktop (OBS, or the browser's own tab capture) and lay
 * them under this in an editor. The captions give the cut its beats.
 *
 * The numbers in the captions are counted from the game's data when it is
 * filmed, so they cannot go stale. */
'use strict';
const path = require('path');
const fs = require('fs');

const FPS = 30;

/* In the page: the overlay the cards and captions are drawn on. */
function overlayFns() {
  const c = document.createElement('canvas');
  c.id = '__film';
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr);
  Object.assign(c.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh',
    zIndex: 2147483647, pointerEvents: 'none' });
  document.body.appendChild(c);
  const art = document.createElement('canvas');
  art.width = c.width; art.height = c.height;
  const W = c.width, H = c.height;
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  window.__count = () => ({
    survivors: Object.keys(WS.Characters).length,
    fields: Object.values(WS.Maps).filter((m) => !m.arena).length,
    bosses: Object.keys(WS.Bosses).length,
    weapons: Object.keys(WS.Weapons).length,
  });

  const CAST = [
    { id: 'warrior', x: 0.50, y: 0.78, k: 0.92 }, { id: 'hunter', x: 0.37, y: 0.81, k: 0.92 },
    { id: 'rogue', x: 0.63, y: 0.81, k: 0.92 }, { id: 'priest', x: 0.25, y: 0.86, k: 0.92 },
    { id: 'ruinseeker', x: 0.75, y: 0.86, k: 0.92 }, { id: 'shaman', x: 0.13, y: 0.92, k: 0.92 },
    { id: 'monk', x: 0.87, y: 0.92, k: 0.92 },
  ];
  const HORDE = [
    { art: 'wolf', x: 0.04, y: 0.76, k: 1.1 }, { art: 'skeleton', x: 0.09, y: 0.67, k: 0.8 },
    { art: 'brute', x: 0.025, y: 0.64, k: 1.1 }, { art: 'ghoul', x: 0.96, y: 0.77, k: 1.1, flip: true },
    { art: 'wraith', x: 0.91, y: 0.66, k: 0.9, flip: true }, { art: 'moonwretch', x: 0.985, y: 0.63, k: 1, flip: true },
  ];

  /** One frame of a card: the key art at time t, pushed in by `zoom`, with
   *  the logotype and a line under it faded in by `a` and `b`. */
  window.__card = function (t, zoom, a, line, b, fade) {
    const g = c.getContext('2d');
    const ag = art.getContext('2d');
    WS.Vignette.keyArt(ag, W, H, { horizon: 0.56, moon: { x: 0.86, y: 0.14 },
      fire: { x: 0.5, y: 0.95, k: 1.7 }, cast: CAST, horde: HORDE, t });
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.save();
    g.translate(W / 2, H * 0.62); g.scale(zoom, zoom); g.translate(-W / 2, -H * 0.62);
    g.drawImage(art, 0, 0);
    g.restore();
    if (a > 0) {
      g.save(); g.globalAlpha = ease(a);
      WS.Vignette.logo(g, W / 2, H * 0.05, H * 0.13, { align: 'center', sub: true });
      g.restore();
    }
    if (line && b > 0) {
      g.save(); g.globalAlpha = ease(b);
      g.font = `italic 500 ${Math.round(H * 0.05)}px Alegreya, serif`;
      g.textAlign = 'center';
      g.fillStyle = 'rgba(0,0,0,.7)'; g.fillText(line, W / 2, H * 0.335 + H * 0.004);
      g.fillStyle = '#ffe0a2'; g.fillText(line, W / 2, H * 0.335);
      g.restore();
    }
    black(g, fade);
  };

  /** A caption over play: a line in the lower third, and the fade. */
  window.__caption = function (text, a, fade) {
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    if (text && a > 0) {
      const k = ease(a);
      const band = g.createLinearGradient(0, H * 0.7, 0, H * 0.86);
      band.addColorStop(0, 'rgba(4,5,9,0)'); band.addColorStop(0.5, `rgba(4,5,9,${0.62 * k})`); band.addColorStop(1, 'rgba(4,5,9,0)');
      g.fillStyle = band; g.fillRect(0, H * 0.7, W, H * 0.16);
      g.save(); g.globalAlpha = k;
      g.font = `italic 500 ${Math.round(H * 0.052)}px Alegreya, serif`;
      g.textAlign = 'center';
      g.fillStyle = 'rgba(0,0,0,.8)'; g.fillText(text, W / 2, H * 0.795 + H * 0.004);
      g.fillStyle = '#f4ead4'; g.fillText(text, W / 2, H * 0.795);
      g.restore();
    }
    black(g, fade);
  };

  function black(g, f) {
    if (f > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, f)})`; g.fillRect(0, 0, W, H); }
  }

  /** One frame of play: steer, keep the survivor standing, and step the
   *  game's own loop twice (60Hz game, 30fps film). */
  window.__steer = function () {
    const G = WS.Game, K = WS.Input.keys, pl = G.player;
    if (!pl || G.state !== 'playing') return;
    const Wd = WS.CONST.WORLD_WIDTH, Hd = WS.CONST.WORLD_HEIGHT, t = G.run.time;
    let tx = Wd / 2 + Math.cos(t * 0.4) * 200, ty = Hd / 2 + Math.sin(t * 0.4) * 130;
    const near = WS.Enemy.findNearest(pl.x, pl.y, 150);
    if (near) { const dx = pl.x - near.x, dy = pl.y - near.y, d = Math.hypot(dx, dy) || 1; tx = pl.x + dx / d * 200; ty = pl.y + dy / d * 200; }
    const lo = G.arenaBounds || { minX: 60, maxX: Wd - 60, minY: 60, maxY: Hd - 60 };
    tx = Math.max(lo.minX + 30, Math.min(lo.maxX - 30, tx));
    ty = Math.max(lo.minY + 30, Math.min(lo.maxY - 30, ty));
    K.left = tx - pl.x < -6; K.right = tx - pl.x > 6; K.up = ty - pl.y < -6; K.down = ty - pl.y > 6;
    pl.health = pl.maxHealth;
  };
  window.__film = function (steer) {
    for (let i = 0; i < 2; i++) { if (steer) __steer(); __pump(1, 1 / 60); }
    if (WS.Game.toasts) WS.Game.toasts.length = 0;
  };
  window.__filmClear = () => { c.getContext('2d').clearRect(0, 0, W, H); };
}

async function make(browser, env) {
  const { openGame, stageFns, ffmpeg, spawn, out } = env;
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, 'the-ember-watch-trailer.mp4');
  const { page, ctx, errors } = await openGame(browser, 1280, 720, 1.5);
  await page.evaluate(stageFns);
  await page.evaluate(overlayFns);
  const n = await page.evaluate(() => __count());

  const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS),
    '-c:v', 'mjpeg', '-i', '-', '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium',
    '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))); });
  let frames = 0;
  const frame = async () => {
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    frames++;
  };
  const fadeOf = (i, len) => Math.max(0, 1 - i / (0.4 * FPS), 1 - (len - 1 - i) / (0.4 * FPS));

  /* A card: seconds long, logo in at `logoAt`, a line in at `lineAt`. */
  const card = async (secs, o) => {
    const len = Math.round(secs * FPS);
    for (let i = 0; i < len; i++) {
      const t = 5 + i / FPS + (o.t0 || 0);
      await page.evaluate(([t, z, a, line, b, f]) => __card(t, z, a, line, b, f),
        [t, (o.z0 || 1) + ((o.z1 || 1) - (o.z0 || 1)) * (i / len),
          (i / FPS - o.logoAt) / 0.8, o.line || '', (i / FPS - (o.lineAt || 99)) / 0.8,
          o.fadeIn === false ? Math.max(0, 1 - (len - 1 - i) / (0.4 * FPS)) : fadeOf(i, len)]);
      await frame();
    }
  };
  /* Play: stage the scene, then film it with a caption over the middle. */
  const play = async (secs, stage, caption, extra) => {
    await page.evaluate((s) => { __filmClear(); __stage(s); __hold(true); }, stage);
    if (extra && extra.before) await page.evaluate(extra.before);
    const len = Math.round(secs * FPS);
    for (let i = 0; i < len; i++) {
      if (extra && extra.at && extra.at[i]) await page.evaluate(extra.at[i]);
      const cap = (i / FPS - 0.5) / 0.5;
      const out = ((len - i) / FPS - 0.9) / 0.5;
      await page.evaluate(([text, a, f]) => { __film(true); __caption(text, a, f); },
        [caption, Math.min(cap, out), fadeOf(i, len)]);
      await frame();
    }
    await page.evaluate(() => __hold(false));
  };

  // 0:00 The fire, the survivors, the name.
  await card(6, { logoAt: 1.6, z0: 1.08, z1: 1.0, line: '', fadeIn: true });
  // Play.
  await play(7, { map: 'thornhollow', char: 'hunter', time: 1060, settle: 30,
    kit: [['volley', 1], ['cinderfall', 1], ['arcweb', 0], ['hallowed_ring', 1], ['knifestorm', 0]] },
    'Hold the watch fire until dawn');
  await play(6, { map: 'dustreach', char: 'rogue', time: 540, settle: 20,
    kit: [['knifestorm', 1], ['umbral_bolt', 0], ['rimeshard', 0]] }, 'Every level, a choice', {
    at: {
      30: () => { __hold(false); const p = WS.Game.player; WS.Player.gainXP(p, p.xpToNext * 1.02); },
      110: () => { const G = WS.Game; if (G.state === 'levelup') G.chooseLevelUp(G.levelChoices[1] || G.levelChoices[0]); __hold(true); },
    } });
  await play(6, { map: 'mourneholt', char: 'warrior', time: 280, settle: 4, bossAgo: 0,
    kit: [['axe_gyre', 1], ['reaving_arc', 0], ['cinderfall', 1], ['blightfield', 0]] },
    `${n.bosses} bosses stalk the night`, { before: () => { WS.Game.run.time = WS.Game.run.map.bosses[0].at - 1; } });
  await play(5, { map: 'highmoor', char: 'shaman', time: 1260, settle: 30,
    kit: [['arcweb', 1], ['gale_chakram', 1], ['dawnpulse', 0], ['seeking_motes', 1]] },
    `${n.fields} battlefields, each with its own weather`);
  await play(6, { map: 'palewastes', char: 'monk', time: 1560, settle: 30,
    kit: [['iron_palms', 1], ['rimeshard', 1], ['hallowed_ring', 1], ['moonbrand', 0], ['thornbloom', 0]] },
    `${n.survivors} survivors, ${n.weapons} weapons, and what they become together`);
  await play(8, { map: 'ochre', char: 'paladin', time: 1799.5, settle: 0,
    kit: [['judgement_disc', 1], ['dawnpulse', 1], ['cinderfall', 1], ['arcweb', 1], ['hallowed_ring', 1], ['seeking_motes', 1]] },
    'At dawn, the night sends what it was saving', { before: () => {
      const G = WS.Game;
      for (let i = 0; i < 120 && G.state === 'playing'; i++) G.update(1 / 60);
      G.faceFinale();
      let guard = 0, fightAt = 0;
      while (guard++ < 60 * 200) {
        if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
        if (G.state === 'levelup') G.chooseLevelUp(G.levelChoices[0]);
        if (G.state !== 'playing') break;
        if (WS.Finale.stage === 'fight' && !fightAt) fightAt = G.run.time;
        if (fightAt && G.run.time - fightAt > 30) break;
        G.update(1 / 60);
        G.player.health = G.player.maxHealth;
      }
      if (G.toasts) G.toasts.length = 0;
    } });
  await play(5, { map: 'boss_arena', char: 'graveblade', time: 0, settle: 40 }, 'And past it all, the eclipse');
  // The end card.
  await card(6, { logoAt: 0.3, lineAt: 1.2, line: 'Wishlist on Steam', z0: 1.0, z1: 1.03, t0: 8 });

  ff.stdin.end();
  await done;
  await ctx.close();
  const secs = (frames / FPS).toFixed(1);
  return { made: [`${path.relative(path.resolve(__dirname, '..'), file)} (${frames} frames, ${secs}s, 1920x1080 H.264, silent)`], errors };
}

module.exports = { make };
