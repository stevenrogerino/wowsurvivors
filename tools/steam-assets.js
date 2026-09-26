#!/usr/bin/env node
/* Everything the Steam store page and library ask for, drawn by the game.
 *
 * Nothing here is painted by hand. The capsules and library art are
 * WS.Vignette.keyArt - the watch fire, the survivors around it, the horde in
 * the treeline - and WS.Vignette.logo, the menu's own logotype, rendered at
 * each size Steam wants. The screenshots are real runs, played headlessly on
 * a fixed seed and photographed. The achievement icons are the icons the
 * codex shows, one per achievement, with the API names Steam must be given.
 *
 *   node tools/steam-assets.js                   everything but the trailer
 *   node tools/steam-assets.js --only art        capsules and library art
 *   node tools/steam-assets.js --only shots      screenshots
 *   node tools/steam-assets.js --only achievements
 *   node tools/steam-assets.js --only trailer    the 1080p trailer, scored, with the game's sound
 *
 * Writes steam/store, steam/library, steam/screenshots, steam/achievements,
 * steam/wallpapers
 * and (the trailer) steam/trailer, which is not committed. The trailer needs
 * ffmpeg: on PATH, in FFMPEG, or from the ffmpeg-static package.
 *
 * Time in the page is virtual: requestAnimationFrame and performance.now are
 * replaced before any script runs, so a frame is exactly 1/60s of game no
 * matter how long the machine takes to draw and photograph it. Same seed,
 * same pictures, every time.
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'steam');
const argOnly = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const want = (k) => (argOnly ? argOnly.includes(k) : k !== 'trailer');

/* ------------------------------------------------------------ the page -- */
function virtualTime() {
  /* Runs before any game script. The game's loop, the vignettes and every
     animation clock read these two, so this is the whole of time. */
  let now = 0;
  let q = [];
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  performance.now = () => now;
  window.__pump = (n, dt) => {
    for (let i = 0; i < n; i++) {
      now += dt * 1000;
      const run = q; q = [];
      for (const cb of run) { try { cb(now); } catch (e) { console.error(e && e.message); } }
    }
  };
}

async function openGame(browser, w, h, scale) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale || 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(virtualTime);
  await page.goto(GAME);
  await page.waitForFunction(() => window.WS && WS.Game && WS.Vignette && WS.Save && WS.Save.db);
  await page.evaluate(async () => {
    await Promise.all(['700 80px Alegreya', 'italic 500 40px Alegreya', '500 20px Archivo', '400 20px Archivo']
      .map((f) => document.fonts.load(f)));
    __pump(3, 1 / 60);
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Save.settings.victoryCinematic = false;
  });
  return { page, ctx, errors };
}

const write = (file, dataUrl) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
};
const rel = (f) => path.relative(ROOT, f);

/* --------------------------------------------------------- the key art -- */
/* The group around the fire, as fractions of the picture. Back row first in
   the list reads left to right; the painter sorts by depth itself. */
const CAST7 = [
  { id: 'warrior', x: 0.50, y: 0.78, k: 0.92 },
  { id: 'hunter', x: 0.37, y: 0.81, k: 0.92 },
  { id: 'rogue', x: 0.63, y: 0.81, k: 0.92 },
  { id: 'priest', x: 0.25, y: 0.86, k: 0.92 },
  { id: 'ruinseeker', x: 0.75, y: 0.86, k: 0.92 },
  { id: 'shaman', x: 0.13, y: 0.92, k: 0.92 },
  { id: 'monk', x: 0.87, y: 0.92, k: 0.92 },
];
/* The whole cast at 16:9: six at the back, six at the front with the fire
   between them. The trailer's cards use the same group. */
const CAST12 = [
  { id: 'mage', x: 0.155, y: 0.765, k: 0.72 }, { id: 'warlock', x: 0.27, y: 0.76, k: 0.72 },
  { id: 'warrior', x: 0.43, y: 0.75, k: 0.74 }, { id: 'paladin', x: 0.57, y: 0.75, k: 0.74 },
  { id: 'graveblade', x: 0.73, y: 0.76, k: 0.72 }, { id: 'ruinseeker', x: 0.845, y: 0.765, k: 0.72 },
  { id: 'shaman', x: 0.1, y: 0.92, k: 0.86 }, { id: 'priest', x: 0.21, y: 0.9, k: 0.86 },
  { id: 'hunter', x: 0.33, y: 0.885, k: 0.86 }, { id: 'rogue', x: 0.67, y: 0.885, k: 0.86 },
  { id: 'monk', x: 0.79, y: 0.9, k: 0.86 }, { id: 'druid', x: 0.9, y: 0.92, k: 0.86 },
];
/* The whole cast in one shallow arc, for the very wide library hero. */
const ARC12 = ['druid', 'mage', 'shaman', 'priest', 'hunter', 'warrior', 'rogue', 'ruinseeker',
  'warlock', 'monk', 'graveblade', 'paladin'].map((id, i) => {
  const d = Math.abs(i - 5.5) / 5.5;
  return { id, x: 0.6 + (i - 5.5) * 0.058, y: 0.79 + 0.15 * Math.pow(d, 1.4), k: 0.78 };
});
const HORDE = (spread) => [
  { art: 'wolf', x: 0.04 * spread, y: 0.76, k: 1.1 },
  { art: 'skeleton', x: 0.09 * spread, y: 0.67, k: 0.8 },
  { art: 'brute', x: 0.025 * spread, y: 0.64, k: 1.1 },
  { art: 'ghoul', x: 1 - 0.04 * spread, y: 0.77, k: 1.1, flip: true },
  { art: 'wraith', x: 1 - 0.09 * spread, y: 0.66, k: 0.9, flip: true },
  { art: 'moonwretch', x: 1 - 0.015 * spread, y: 0.63, k: 1, flip: true },
];
const shift = (cast, dx, dy, k, xs) => cast.map((c) => Object.assign({}, c,
  { x: 0.5 + (c.x - 0.5) * (xs || 1) + (dx || 0), y: c.y + (dy || 0), k: c.k * (k || 1) }));

const ART = [
  { file: 'store/header_capsule.png', w: 920, h: 430, note: 'Header capsule',
    o: { horizon: 0.55, moon: { x: 0.9, y: 0.15, k: 0.9 }, fire: { x: 0.5, y: 0.96, k: 1.6 },
      cast: shift(CAST7, 0, 0.05, 0.88, 0.92), horde: HORDE(1) },
    logo: { x: 0.5, y: 0.045, size: 0.2, align: 'center' } },
  { file: 'store/small_capsule.png', w: 462, h: 174, note: 'Small capsule',
    o: { horizon: 0.7, moon: { x: 0.94, y: 0.2, k: 0.7 }, fire: { x: 0.5, y: 1.0, k: 0.9 }, stars: 70,
      cast: [], horde: [], vignette: 0.5 },
    logo: { x: 0.5, y: 0.22, size: 0.33, align: 'center' } },
  { file: 'store/main_capsule.png', w: 1232, h: 706, note: 'Main capsule',
    o: { horizon: 0.56, moon: { x: 0.86, y: 0.14 }, fire: { x: 0.5, y: 0.95, k: 1.7 },
      cast: CAST7, horde: HORDE(1) },
    logo: { x: 0.5, y: 0.05, size: 0.13, align: 'center', sub: true } },
  { file: 'store/vertical_capsule.png', w: 748, h: 896, note: 'Vertical capsule',
    o: { horizon: 0.5, moon: { x: 0.86, y: 0.07, k: 0.6 }, fire: { x: 0.5, y: 0.96, k: 1.2 },
      cast: [
        { id: 'warrior', x: 0.5, y: 0.74, k: 0.62 }, { id: 'hunter', x: 0.28, y: 0.76, k: 0.62 },
        { id: 'rogue', x: 0.72, y: 0.76, k: 0.62 }, { id: 'priest', x: 0.16, y: 0.9, k: 0.66 },
        { id: 'ruinseeker', x: 0.84, y: 0.9, k: 0.66 },
      ], horde: HORDE(0.8).map((m) => Object.assign({}, m, { y: m.y - 0.1, k: m.k * 0.7 })) },
    logo: { x: 0.5, y: 0.05, size: 0.12, align: 'center', stack: true } },
  { file: 'store/page_background.png', w: 1438, h: 810, note: 'Page background (Steam darkens it further)',
    o: { horizon: 0.58, moon: { x: 0.8, y: 0.16 }, fire: { x: 0.5, y: 1.04, k: 1.5 }, cast: [],
      horde: HORDE(1).map((m) => Object.assign({}, m, { y: m.y + 0.05 })), dim: 0.25, vignette: 0.75 } },
  { file: 'library/library_capsule.png', w: 600, h: 900, note: 'Library capsule',
    o: { horizon: 0.52, moon: { x: 0.85, y: 0.07, k: 0.55 }, fire: { x: 0.5, y: 0.97, k: 1.1 },
      cast: [
        { id: 'warrior', x: 0.5, y: 0.77, k: 0.5 }, { id: 'hunter', x: 0.26, y: 0.8, k: 0.5 },
        { id: 'rogue', x: 0.74, y: 0.8, k: 0.5 }, { id: 'priest', x: 0.14, y: 0.93, k: 0.55 },
        { id: 'ruinseeker', x: 0.86, y: 0.93, k: 0.55 },
      ], horde: HORDE(0.7).map((m) => Object.assign({}, m, { y: m.y - 0.08, k: m.k * 0.55 })) },
    logo: { x: 0.5, y: 0.06, size: 0.12, align: 'center', stack: true } },
  { file: 'library/library_hero.png', w: 3840, h: 1240, note: 'Library hero (no text: Steam lays the logo over it)',
    o: { horizon: 0.5, moon: { x: 0.12, y: 0.2, k: 1 }, fire: { x: 0.6, y: 0.95, k: 1.3 },
      cast: ARC12,
      horde: [
        { art: 'wolf', x: 0.24, y: 0.78, k: 1.1 }, { art: 'skeleton', x: 0.2, y: 0.66, k: 0.8 },
        { art: 'ghoul', x: 0.15, y: 0.72, k: 1 }, { art: 'brute', x: 0.08, y: 0.64, k: 1.1 },
        { art: 'wraith', x: 0.03, y: 0.6, k: 0.9 },
        { art: 'moonwretch', x: 0.95, y: 0.74, k: 1.1, flip: true }, { art: 'geist', x: 0.91, y: 0.64, k: 0.9, flip: true },
        { art: 'abomination', x: 0.99, y: 0.66, k: 1.2, flip: true },
      ] } },
  // Desktop wallpapers: the whole cast and the name, at the common sizes.
  ...[[3840, 2160], [2560, 1440], [1920, 1080]].map(([w, h]) => ({
    file: `wallpapers/the-ember-watch-${w}x${h}.jpg`, w, h, note: 'Wallpaper',
    o: { horizon: 0.56, moon: { x: 0.86, y: 0.14 }, fire: { x: 0.5, y: 0.97, k: 1.5 },
      cast: CAST12, horde: HORDE(1) },
    logo: { x: 0.5, y: 0.05, size: 0.12, align: 'center', sub: true } })),
];

async function art(browser) {
  const { page, ctx, errors } = await openGame(browser, 800, 600);
  const made = [];
  for (const a of ART) {
    const url = await page.evaluate((a) => {
      const c = document.createElement('canvas'); c.width = a.w; c.height = a.h;
      const g = c.getContext('2d');
      WS.Vignette.keyArt(g, a.w, a.h, a.o);
      if (a.logo) WS.Vignette.logo(g, a.logo.x * a.w, a.logo.y * a.h, a.logo.size * a.h, a.logo);
      return a.file.endsWith('.jpg') ? c.toDataURL('image/jpeg', 0.95) : c.toDataURL('image/png');
    }, a);
    write(path.join(OUT, a.file), url);
    made.push(`${a.file} (${a.w}x${a.h}) ${a.note}`);
  }
  /* The library logo: the logotype alone on transparency, as large as fits
     1280x720 with a margin, which is how Steam wants it. */
  const logo = await page.evaluate(() => {
    const W = 1280, H = 720;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const probe = WS.Vignette.logo(document.createElement('canvas').getContext('2d'), 0, 0, 100, { stack: true });
    const size = Math.min((W * 0.92) / probe.w, (H * 0.9) / probe.h) * 100;
    const box = WS.Vignette.logo(document.createElement('canvas').getContext('2d'), 0, 0, size, { stack: true });
    WS.Vignette.logo(g, W / 2, (H - box.h) / 2, size, { stack: true, align: 'center' });
    return c.toDataURL('image/png');
  });
  write(path.join(OUT, 'library/library_logo.png'), logo);
  made.push('library/library_logo.png (1280x720) Library logo, transparent');
  /* The community icon and the client icon: the fire alone, close up. */
  for (const [file, s] of [['store/community_icon.png', 184], ['library/client_icon.png', 32], ['library/client_icon_256.png', 256]]) {
    const url = await page.evaluate((s) => {
      const c = document.createElement('canvas'); c.width = s; c.height = s;
      WS.Vignette.keyArt(c.getContext('2d'), s, s, { horizon: 0.58, fire: { x: 0.5, y: 0.84, k: 1.7 },
        cast: [], horde: [], stars: 14, vignette: 0.7, t: 3.1 });
      return c.toDataURL('image/png');
    }, s);
    write(path.join(OUT, file), url);
    made.push(`${file} (${s}x${s})`);
  }
  await ctx.close();
  return { made, errors };
}

/* ------------------------------------------------------ achievements -- */
async function achievements(browser) {
  const { page, ctx, errors } = await openGame(browser, 800, 600);
  const list = await page.evaluate(() => {
    const out = [];
    const grey = (src) => {
      const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
      const g = c.getContext('2d');
      g.filter = 'grayscale(1) brightness(.7)';
      g.drawImage(src, 0, 0);
      return c;
    };
    for (const id of WS.AchievementOrder) {
      const a = WS.Achievements[id];
      const on = WS.Icons.get(a.art, WS.CONST.QUALITY.uncommon, 256);
      const off = grey(WS.Icons.get(a.art, [0.35, 0.38, 0.45], 256));
      const png = (c) => {
        // Exactly 256x256 whatever the icon cache's own resolution is.
        const o = document.createElement('canvas'); o.width = 256; o.height = 256;
        o.getContext('2d').drawImage(c, 0, 0, 256, 256);
        return o.toDataURL('image/png');
      };
      out.push({ id, api: WS.Platform.apiName(id), name: a.name,
        desc: WS.template(a.description, a), on: png(on), off: png(off) });
    }
    return out;
  });
  const dir = path.join(OUT, 'achievements');
  const csv = ['API Name,Display Name,Description,Achieved Icon,Unachieved Icon'];
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  for (const a of list) {
    write(path.join(dir, `${a.api}.png`), a.on);
    write(path.join(dir, `${a.api}_locked.png`), a.off);
    csv.push([a.api, q(a.name), q(a.desc), `${a.api}.png`, `${a.api}_locked.png`].join(','));
  }
  fs.writeFileSync(path.join(dir, 'achievements.csv'), csv.join('\n') + '\n');
  await ctx.close();
  return { made: [`achievements/ (${list.length} achievements, 2 icons each, achievements.csv)`], errors };
}

/* ------------------------------------------------------------- scenes -- */
/* A run, set up in the page: the map, the survivor, a finished kit, the clock
   moved on, and then real play (a kiting bot, kept alive) until the field
   looks like that moment of the night. */
function stageFns() {
  window.__bot = function (seconds) {
    const G = WS.Game, K = WS.Input.keys;
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
    const step = WS.CONST.TICK_RATE;
    const end = G.run.time + seconds;
    let guard = seconds * 70;
    while (G.run && G.run.time < end && guard-- > 0) {
      if (G.state === 'levelup') { G.chooseLevelUp(G.levelChoices[0]); continue; }
      if (G.state === 'blessing') { G.chooseBlessing(G.blessingChoices[0]); continue; }
      if (G.state !== 'playing') break;
      const pl = G.player, t = G.run.time;
      let tx = W / 2 + Math.cos(t * 0.4) * 200, ty = H / 2 + Math.sin(t * 0.4) * 130;
      const near = WS.Enemy.findNearest(pl.x, pl.y, 150);
      if (near) { const dx = pl.x - near.x, dy = pl.y - near.y, d = Math.hypot(dx, dy) || 1; tx = pl.x + dx / d * 200; ty = pl.y + dy / d * 200; }
      const lo = G.arenaBounds || { minX: 60, maxX: W - 60, minY: 60, maxY: H - 60 };
      tx = Math.max(lo.minX + 30, Math.min(lo.maxX - 30, tx));
      ty = Math.max(lo.minY + 30, Math.min(lo.maxY - 30, ty));
      K.left = tx - pl.x < -6; K.right = tx - pl.x > 6; K.up = ty - pl.y < -6; K.down = ty - pl.y > 6;
      pl.health = pl.maxHealth;
      G.tick(step);
    }
    for (const k of ['left', 'right', 'up', 'down']) K[k] = false;
    // Leave the field clear: no draft half-taken, no notice left over.
    for (let i = 0; i < 20 && G.state === 'levelup'; i++) G.chooseLevelUp(G.levelChoices[0]);
    if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
  };
  /** Hold the picture still for its photograph: no new draft opens while
     the last frames are drawn, and the corner notices and banners - whose
     clocks run in real play, not in a headless jump - are cleared. */
  window.__hold = function (on, keepBanner) {
    const G = WS.Game;
    if (!G.__open) G.__open = G.openLevelUp;
    G.openLevelUp = on ? function () {} : G.__open;
    if (on) {
      if (G.state === 'playing') {
        G.pendingLevelUps = 0; G.leveling = false; G.settle = 0; G.timeScale = 1;
      }
      if (G.toasts) G.toasts.length = 0;
      if (!keepBanner) G.banner = null;
    }
  };
  /** Start a run at `time` with `kit` and play `settle` seconds of it. */
  window.__stage = function (o) {
    const G = WS.Game;
    WS.setSeed(o.seed || 7);
    WS.UI.closeOverlay();
    G.startRun(o.map, o.char, o.opts);
    if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
    G.state = 'playing'; G.running = true;
    G.leveling = false; G.pendingLevelUps = 0; G.settle = 0;
    WS.UI.closeOverlay();
    const p = G.player;
    if (o.kit) {
      for (const [id, evolved] of o.kit) {
        if (!WS.Player.getWeapon(p, id)) WS.Player.addWeapon(p, id);
        const w = WS.Player.getWeapon(p, id);
        w.level = WS.WEAPON_MAX_LEVEL; p.weaponLevels[id] = WS.WEAPON_MAX_LEVEL; w.evolved = !!evolved;
      }
      for (const [id, n] of Object.entries(o.passives || { might: 3, haste: 3, area: 3, fleetfoot: 2, vitality: 3 })) {
        const up = WS.Upgrades[id];
        for (let i = 0; i < n; i++) up.apply(p, up);
        p.upgradeLevels[id] = n;
      }
      WS.ComboSystem.check(p);
      p.level = o.level || 38;
      p.xpToNext = WS.Player.xpForLevel(p.level);
    }
    p.maxHealth *= 40; p.health = p.maxHealth;
    if (o.time) {
      G.run.time = o.time;
      const M = WS.WaveManager, map = WS.Maps[o.map];
      // Scheduled bosses and swarms before this moment have already come and gone.
      if (map.bosses) M.bossIndex = map.bosses.filter((b) => b.at <= o.time - (o.bossAgo || 0)).length;
      if (map.events) M.eventIndex = map.events.filter((e) => e.at <= o.time).length;
    }
    WS.UI.closeOverlay();
    window.__bot(o.settle || 0);
    return { state: G.state, enemies: WS.Enemy.count(), time: G.run.time };
  };
}

const SHOTS = [
  { name: '01_horde', note: 'Thornhollow at 17:40, a finished bow build against the Kerchief horde',
    s: { map: 'thornhollow', char: 'hunter', time: 1060, settle: 40, bossAgo: 0,
      kit: [['volley', 1], ['cinderfall', 1], ['arcweb', 0], ['hallowed_ring', 1], ['knifestorm', 0]] } },
  { name: '02_boss', note: 'Mourneholt: a scheduled boss arrives',
    s: { map: 'mourneholt', char: 'warrior', time: 0, settle: 0,
      kit: [['axe_gyre', 1], ['reaving_arc', 0], ['cinderfall', 1], ['blightfield', 0]] }, boss: true },
  { name: '03_levelup', note: 'The level-up draft',
    s: { map: 'dustreach', char: 'rogue', time: 540, settle: 25,
      kit: [['knifestorm', 1], ['umbral_bolt', 0], ['rimeshard', 0]] }, levelup: true },
  { name: '04_highmoor', note: 'Highmoor at 21:00, storm cells over the moor',
    s: { map: 'highmoor', char: 'shaman', time: 1260, settle: 45,
      kit: [['arcweb', 1], ['gale_chakram', 1], ['dawnpulse', 0], ['seeking_motes', 1]] } },
  { name: '05_palewastes', note: 'The Pale Wastes at 26:00, the densest night',
    s: { map: 'palewastes', char: 'monk', time: 1560, settle: 40,
      kit: [['iron_palms', 1], ['rimeshard', 1], ['hallowed_ring', 1], ['moonbrand', 0], ['thornbloom', 0]] } },
  { name: '06_finale', note: 'Ochre Plains finale: the Stormbreaker',
    s: { map: 'ochre', char: 'paladin', time: 1799.5, settle: 0,
      kit: [['judgement_disc', 1], ['dawnpulse', 1], ['cinderfall', 1], ['arcweb', 1], ['hallowed_ring', 1], ['seeking_motes', 1]] }, finale: 55 },
  { name: '07_arena', note: 'The Eclipse Arena: Aethelgard',
    s: { map: 'boss_arena', char: 'graveblade', time: 0, settle: 50 } },
  { name: '08_roster', note: 'Choosing a survivor', menu: 'roster' },
];

async function shots(browser) {
  /* 1280x720 at 1.5x: the size the game is laid out for, delivered at the
     1920x1080 Steam asks for, so the interface reads at store size. */
  const { page, ctx, errors } = await openGame(browser, 1280, 720, 1.5);
  await page.evaluate(stageFns);
  const made = [];
  const snap = async (name) => {
    await page.evaluate(() => __pump(2, 1 / 60));
    const file = path.join(OUT, 'screenshots', name + '.jpg');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    return file;
  };
  for (const sh of SHOTS) {
    if (sh.menu) {
      await page.evaluate(() => { if (WS.Game.state !== 'menu') WS.Game.quitToMenu(); WS.UI.openMenu(); });
      await page.evaluate(() => __pump(60, 1 / 60));
      made.push(rel(await snap(sh.name)) + '  ' + sh.note);
      continue;
    }
    await page.evaluate((s) => __stage(s), sh.s);
    if (sh.boss) {
      // Play on to the first scheduled boss, and a few seconds into the fight.
      await page.evaluate(() => {
        const at = WS.Game.run.map.bosses[0].at;
        WS.Game.run.time = at - 20;
        __bot(24);
      });
    }
    if (sh.finale) {
      await page.evaluate((secs) => {
        const G = WS.Game;
        for (let i = 0; i < 120 && G.state === 'playing'; i++) G.update(1 / 60);
        G.faceFinale();
        let guard = 0, fightAt = 0;
        while (guard++ < 60 * 200) {
          if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
          if (G.state === 'levelup') G.chooseLevelUp(G.levelChoices[0]);
          if (G.state !== 'playing') break;
          if (WS.Finale.stage === 'fight' && !fightAt) fightAt = G.run.time;
          if (fightAt && G.run.time - fightAt > secs) break;
          G.update(1 / 60);
          G.player.health = G.player.maxHealth;
        }
      }, sh.finale);
    }
    await page.evaluate((l) => __hold(!l), !!sh.levelup);
    if (sh.levelup) {
      await page.evaluate(() => {
        const p = WS.Game.player;
        WS.Player.gainXP(p, WS.Player.xpForLevel(p.level) * 1.05);
        for (let i = 0; i < 30 && WS.Game.state === 'playing'; i++) WS.Game.tick(WS.CONST.TICK_RATE);
      });
      await page.evaluate(() => __pump(40, 1 / 60));
    } else {
      // Let the renderer's own trails, numbers and flashes catch up.
      await page.evaluate(() => __pump(20, 1 / 60));
    }
    await page.evaluate(() => __hold(true));
    made.push(rel(await snap(sh.name)) + '  ' + sh.note);
    await page.evaluate(() => __hold(false));
  }
  await ctx.close();
  return { made, errors };
}

/* ------------------------------------------------------------ trailer -- */
function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch (e) { /* not on PATH */ }
  try { return require('ffmpeg-static'); } catch (e) { return null; }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const report = [];
  const errors = [];
  const run = async (key, fn) => {
    if (!want(key)) return;
    const r = await fn(browser);
    report.push(...r.made);
    errors.push(...r.errors);
  };
  await run('art', art);
  await run('achievements', achievements);
  await run('shots', shots);
  if (want('trailer')) {
    const trailer = require('./steam-trailer.js');
    const ff = ffmpegPath();
    if (!ff) { console.log('trailer: no ffmpeg (set FFMPEG, put it on PATH, or npm i ffmpeg-static)'); process.exitCode = 1; }
    else {
      const r = await trailer.make(browser, { openGame, stageFns, cast: CAST12, ffmpeg: ff, spawn, out: path.join(OUT, 'trailer') });
      report.push(...r.made); errors.push(...r.errors);
    }
  }
  await browser.close();
  for (const line of report) console.log('  ' + line);
  if (errors.length) {
    console.log('page errors:');
    for (const e of [...new Set(errors)].slice(0, 8)) console.log('  - ' + e);
    process.exitCode = 1;
  }
})();
