/* The store trailer, filmed and scored from the game (run by
 * tools/steam-assets.js --only trailer).
 *
 * Picture. Every frame is the game's own: the opening and closing cards are
 * the key art painted live (the fire burning, the whole cast around it), and
 * everything in between is real play on a fixed seed, steered by the same
 * kiting bot the screenshots use. Time is virtual (see steam-assets.js), so
 * each frame is exactly 1/30s of game however long it takes to photograph.
 *
 * Sound, in two layers, both rendered offline by WebAudio (no sound card is
 * needed and nothing is recorded in real time):
 *
 *   score    tools/steam-score.js: a trailer cue written to this cut. Every
 *            cut lands on a bar line at 120bpm, and the three biggest hits
 *            drop to silence (and black) for a quarter second first.
 *   effects  while filming, every sound the game asks for (a hit, a level-up,
 *            a boss's horn, a finale's voice) is logged with the frame it
 *            happened on. Afterwards the log is replayed through the game's
 *            real audio engine into an offline context on a fake clock, so
 *            the effects are exactly the game's, exactly in sync.
 *
 * Out come the trailer with both mixed in, plus the score and the effects as
 * separate WAVs for anyone who wants to remix it in an editor.
 *
 * The numbers in the captions are counted from the game's data when it is
 * filmed, so they cannot go stale. */
'use strict';
const path = require('path');
const fs = require('fs');

const FPS = 30;

/* In the page: the overlay the cards and captions are drawn on. */
function overlayFns(cast) {
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
    // The ones that walk onto a battlefield on the clock; the finales, their
    // phases and the arena are counted apart, not padded into this.
    bosses: new Set(Object.values(WS.Maps).flatMap((m) => (m.bosses || []).map((b) => b.id))).size,
    finales: Object.keys(WS.Finales || {}).length,
    weapons: Object.keys(WS.Weapons).filter((k) => !k.startsWith('union_')).length,
  });

  // The whole cast, as tools/steam-assets.js arranges it (CAST12).
  const CAST = cast;
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
      fire: { x: 0.5, y: 0.97, k: 1.5 }, cast: CAST, horde: HORDE, t });
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
      // The call to action: a gilt-edged plate, like the game's own primary
      // button, rising into place.
      const k = ease(b);
      g.save(); g.globalAlpha = k;
      const fs = Math.round(H * 0.036);
      g.font = `700 ${fs}px Archivo, sans-serif`;
      g.letterSpacing = `${Math.round(fs * 0.22)}px`;
      const label = line.toUpperCase();
      const tw = g.measureText(label).width;
      const pw = tw + fs * 2.6, ph = fs * 2.3;
      const px = W / 2 - pw / 2, py = H * 0.305 + (1 - k) * H * 0.015;
      const r = ph / 2;
      const plate = () => { g.beginPath(); g.moveTo(px + r, py); g.arcTo(px + pw, py, px + pw, py + ph, r);
        g.arcTo(px + pw, py + ph, px, py + ph, r); g.arcTo(px, py + ph, px, py, r); g.arcTo(px, py, px + pw, py, r); g.closePath(); };
      g.shadowColor = 'rgba(245,197,107,.45)'; g.shadowBlur = H * 0.03;
      plate(); g.fillStyle = 'rgba(12,10,8,.82)'; g.fill();
      g.shadowBlur = 0;
      const edge = g.createLinearGradient(0, py, 0, py + ph);
      edge.addColorStop(0, '#ffe6ae'); edge.addColorStop(0.5, '#c8913d'); edge.addColorStop(1, '#ffe0a2');
      g.lineWidth = Math.max(2, H * 0.0028); g.strokeStyle = edge; plate(); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const metal = g.createLinearGradient(0, py + ph * 0.25, 0, py + ph * 0.75);
      metal.addColorStop(0, '#fff3d4'); metal.addColorStop(0.5, '#f5c56b'); metal.addColorStop(1, '#e6b45e');
      g.fillStyle = metal;
      g.fillText(label, W / 2 + fs * 0.11, py + ph / 2 + fs * 0.04);
      g.letterSpacing = '0px';
      g.restore();
    }
    black(g, fade);
  };

  /** A caption over play, in two tiers: a small gilt kicker (the fact) over
   *  a large line (the promise), on a dark band that holds its contrast over
   *  anything the game is drawing, between two gold rules. `a` fades it in
   *  and out; it rises a little as it arrives. */
  window.__caption = function (kicker, text, a, fade, low) {
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    if (text && a > 0) {
      const k = ease(a);
      // `low` drops the band over the (dimmed) HUD, for screens whose
      // content fills the middle of the frame.
      const dy = low ? H * 0.105 : 0;
      const top = H * 0.69 + dy, bot = H * 0.875 + dy;
      const across = (alpha, y0, h) => {
        const gr = g.createLinearGradient(0, 0, W, 0);
        gr.addColorStop(0, `rgba(4,5,9,0)`); gr.addColorStop(0.18, `rgba(4,5,9,${alpha})`);
        gr.addColorStop(0.82, `rgba(4,5,9,${alpha})`); gr.addColorStop(1, 'rgba(4,5,9,0)');
        g.fillStyle = gr; g.fillRect(0, y0, W, h);
      };
      across(0.8 * k, top, bot - top);
      const rule = (y) => {
        const gr = g.createLinearGradient(0, 0, W, 0);
        gr.addColorStop(0.12, 'rgba(245,197,107,0)'); gr.addColorStop(0.5, `rgba(245,197,107,${0.75 * k})`);
        gr.addColorStop(0.88, 'rgba(245,197,107,0)');
        g.fillStyle = gr; g.fillRect(0, y, W, Math.max(1, H * 0.0018));
      };
      rule(top); rule(bot);
      const rise = (1 - k) * H * 0.012;
      g.save(); g.globalAlpha = k; g.textAlign = 'center';
      if (kicker) {
        g.font = `600 ${Math.round(H * 0.026)}px Archivo, sans-serif`;
        g.letterSpacing = `${Math.round(H * 0.026 * 0.32)}px`;
        g.fillStyle = '#f5c56b';
        g.fillText(kicker.toUpperCase(), W / 2, H * 0.745 + dy + rise);
        g.letterSpacing = '0px';
      }
      g.font = `700 ${Math.round(H * 0.064)}px Alegreya, serif`;
      g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = H * 0.012; g.shadowOffsetY = H * 0.003;
      g.fillStyle = '#f7efdc';
      g.fillText(text, W / 2, H * 0.83 + dy + rise);
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
  window.__film = function (steer, t) {
    for (let i = 0; i < 2; i++) { window.__filmT = t + i / 60; if (steer) __steer(); __pump(1, 1 / 60); }
    if (WS.Game.toasts) WS.Game.toasts.length = 0;
  };

  /* The sound log. Headless, the engine has no context and plays nothing,
     but every call still arrives here first: what, when on the film's clock,
     and where the survivor stood (sounds pan against them). Only the
     outermost call is kept, so a cue that plays kits is not counted twice. */
  window.__sfx = []; window.__rec = false; window.__filmT = 0;
  let depth = 0;
  for (const name of ['play', 'cue', 'babble']) {
    const f = WS.Audio[name];
    WS.Audio[name] = function (...args) {
      if (window.__rec && depth === 0) {
        const p = WS.Game.player;
        try { __sfx.push([name, +window.__filmT.toFixed(4), p ? p.x : null, JSON.parse(JSON.stringify(args))]); } catch (e) { /* unserialisable: skip */ }
      }
      depth++;
      try { return f.apply(this, args); } finally { depth--; }
    };
  }
  window.__filmClear = () => { c.getContext('2d').clearRect(0, 0, W, H); };
}

/* The cut, in seconds. Two-second bars at 120bpm: every length is whole
   bars, so every cut is on a downbeat of the score. */
const EDIT = [
  ['open', 6], ['horde', 6], ['levelup', 6], ['boss', 6], ['highmoor', 6],
  ['pale', 6], ['finale', 8], ['arena', 6], ['end', 6],
];
const CUTS = (() => {
  const c = {}; let t = 0;
  for (const [k, d] of EDIT) { c[k] = t; t += d; }
  c.total = t;
  return c;
})();
// Cuts the score drops out before; the picture goes black with it.
const DROPS = new Set(['boss', 'finale', 'end']);

/* In the page: render the score and replay the logged effects through the
   game's own engine, both offline, and mix them. Returns 16-bit WAVs. */
async function renderAudioInPage({ scoreSrc, cuts, log, drops }) {
  const SR = 48000, N = Math.round(SR * cuts.total);
  const composeScore = eval('(' + scoreSrc + ')');

  // 1. The score.
  const oc1 = new OfflineAudioContext(2, N, SR);
  const out1 = oc1.createGain(); out1.connect(oc1.destination);
  composeScore(oc1, out1, cuts);
  const music = await oc1.startRendering();

  // 2. The effects: the game's engine, pointed at an offline context whose
  //    clock is whatever time the next logged sound happened at.
  window.setTimeout = () => 0;          // the engine's clean-up timers would
  window.setInterval = () => 0;         // disconnect voices mid-render
  const oc2 = new OfflineAudioContext(2, N, SR);
  let T = 0;
  Object.defineProperty(oc2, 'currentTime', { get: () => T });
  Object.defineProperty(oc2, 'state', { get: () => 'running' });
  oc2.resume = () => Promise.resolve();
  window.AudioContext = function () { return oc2; };
  window.webkitAudioContext = window.AudioContext;
  const st = WS.Save.settings;
  st.sound = true; st.effectsVolume = 0.8; st.music = false;
  WS.Audio.ambienceWanted = null; WS.Audio.wanted = null;
  WS.Audio.ctx = null;
  WS.Audio.init();
  const listener = { x: WS.CONST.WORLD_WIDTH / 2 };
  WS.Game.player = listener;
  let played = 0;
  for (const [name, t, px, args] of log) {
    T = t; listener.x = px === null ? WS.CONST.WORLD_WIDTH / 2 : px;
    try { WS.Audio[name](...args); played++; } catch (e) { /* one sound, not the reel */ }
  }
  const sfx = await oc2.startRendering();

  // 3. The mix: the score leads, the game sits under it, and both go quiet
  //    together for the drops.
  const SFX = 3.85;   // the game sits about 6dB under the score: heard, not in charge
  const L = new Float32Array(N), R = new Float32Array(N);
  const m0 = music.getChannelData(0), m1 = music.getChannelData(1);
  const s0 = sfx.getChannelData(0), s1 = sfx.getChannelData(1);
  const quiet = drops.map((t) => [Math.round((t - 0.26) * SR), Math.round(t * SR)]);
  let peak = 0;
  for (let i = 0; i < N; i++) {
    let k = SFX;
    for (const [a, b] of quiet) if (i >= a && i < b) k = 0;
    L[i] = m0[i] + s0[i] * k; R[i] = m1[i] + s1[i] * k;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const wav = (a, b, gain) => {
    const pcm = new Int16Array(N * 2);
    for (let i = 0; i < N; i++) {
      pcm[2 * i] = Math.tanh(a[i] * gain) * 32767;
      pcm[2 * i + 1] = Math.tanh(b[i] * gain) * 32767;
    }
    let bin = ''; const u8 = new Uint8Array(pcm.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const g = 0.93 / (peak || 1);
  return { played, mix: wav(L, R, g), music: wav(m0, m1, g), sfx: wav(s0, s1, g * SFX), SR };
}

function wavFile(b64, SR) {
  const pcm = Buffer.from(b64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function make(browser, env) {
  const { openGame, stageFns, cast, ffmpeg, spawn, out } = env;
  fs.mkdirSync(out, { recursive: true });
  const picture = path.join(out, 'picture.mp4');
  const file = path.join(out, 'the-ember-watch-trailer.mp4');
  const { page, ctx, errors } = await openGame(browser, 1280, 720, 1.5);
  await page.evaluate(stageFns);
  await page.evaluate(overlayFns, cast);
  const n = await page.evaluate(() => __count());

  const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS),
    '-c:v', 'mjpeg', '-i', '-', '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium',
    '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', picture], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))); });
  let frames = 0;
  const frame = async () => {
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    frames++;
  };
  /* How black a frame is: a tenth of a second's dip at an ordinary cut, and
     before a drop a quarter second of nothing, with the score. */
  const blackOf = (key, i, len) => {
    const next = EDIT[EDIT.findIndex(([k]) => k === key) + 1];
    const tail = next && DROPS.has(next[0]) ? 0.26 : 0.1;
    const inn = key === 'open' ? 0.6 : 0.1;
    const fromEnd = (len - i) / FPS;
    if (fromEnd <= tail) return 1;
    return Math.max(0, 1 - (i / FPS) / inn);
  };

  /* A card: logo in at `logoAt`, a line in at `lineAt`. */
  const card = async (key, o) => {
    const len = Math.round(EDIT.find(([k]) => k === key)[1] * FPS);
    for (let i = 0; i < len; i++) {
      const t = 5 + i / FPS + (o.t0 || 0);
      await page.evaluate(([t, z, a, line, b, f]) => __card(t, z, a, line, b, f),
        [t, (o.z0 || 1) + ((o.z1 || 1) - (o.z0 || 1)) * (i / len),
          (i / FPS - o.logoAt) / 0.8, o.line || '', (i / FPS - (o.lineAt || 99)) / 0.8,
          key === 'end' ? Math.max(0, ((i + 1) / FPS - (len / FPS - 1.2)) / 1.2) : blackOf(key, i, len)]);
      await frame();
    }
  };
  /* Play: stage the scene, then film it with its caption, logging sound. */
  const play = async (key, stage, kicker, line, extra) => {
    const low = !!(extra && extra.low);
    await page.evaluate((s) => { __filmClear(); __stage(s); __hold(true); }, stage);
    if (extra && extra.before) await page.evaluate(extra.before);
    const len = Math.round(EDIT.find(([k]) => k === key)[1] * FPS);
    const t0 = CUTS[key];
    await page.evaluate(() => { window.__rec = true; });
    for (let i = 0; i < len; i++) {
      if (extra && extra.at && extra.at[i]) await page.evaluate(extra.at[i]);
      const cap = (i / FPS - 0.35) / 0.35;
      const off = ((len - i) / FPS - 0.55) / 0.3;
      await page.evaluate(([kk, text, a, f, t, lo]) => { __film(true, t); __caption(kk, text, a, f, lo); },
        [kicker, line, Math.min(cap, off), blackOf(key, i, len), t0 + i / FPS, low]);
      await frame();
    }
    await page.evaluate(() => { window.__rec = false; __hold(false); });
  };

  await card('open', { logoAt: 1.6, z0: 1.08, z1: 1.0 });
  await play('horde', { map: 'thornhollow', char: 'hunter', time: 1060, settle: 30,
    kit: [['volley', 1], ['cinderfall', 1], ['arcweb', 0], ['hallowed_ring', 1], ['knifestorm', 0]] },
    'One night · thirty minutes', 'Hold the fire until dawn');
  await play('levelup', { map: 'dustreach', char: 'rogue', time: 540, settle: 20,
    kit: [['knifestorm', 1], ['umbral_bolt', 0], ['rimeshard', 0]] }, 'Every level', 'Choose what you become', {
    low: true,
    at: {
      24: () => { __hold(false); const p = WS.Game.player; WS.Player.gainXP(p, p.xpToNext * 1.02); },
      105: () => { const G = WS.Game; if (G.state === 'levelup') G.chooseLevelUp(G.levelChoices[1] || G.levelChoices[0]); __hold(true); },
    } });
  await play('boss', { map: 'mourneholt', char: 'warrior', time: 280, settle: 4, bossAgo: 0,
    kit: [['axe_gyre', 1], ['reaving_arc', 0], ['cinderfall', 1], ['blightfield', 0]] },
    `${n.bosses} bosses`, 'The night hunts back', { before: () => { WS.Game.run.time = WS.Game.run.map.bosses[0].at - 0.6; } });
  await play('highmoor', { map: 'highmoor', char: 'shaman', time: 1260, settle: 30,
    kit: [['arcweb', 1], ['gale_chakram', 1], ['dawnpulse', 0], ['seeking_motes', 1]] },
    `${n.fields} battlefields`, 'Each with its own weather');
  await play('pale', { map: 'palewastes', char: 'monk', time: 1560, settle: 30,
    kit: [['iron_palms', 1], ['rimeshard', 1], ['hallowed_ring', 1], ['moonbrand', 0], ['thornbloom', 0]] },
    `${n.survivors} survivors · ${n.weapons} weapons`, 'Build something unstoppable');
  await play('finale', { map: 'ochre', char: 'paladin', time: 1799.5, settle: 0,
    kit: [['judgement_disc', 1], ['dawnpulse', 1], ['cinderfall', 1], ['arcweb', 1], ['hallowed_ring', 1], ['seeking_motes', 1]] },
    `At dawn · ${n.finales} finales`, 'Face what the night was saving', { before: () => {
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
  await play('arena', { map: 'boss_arena', char: 'graveblade', time: 0, settle: 40 }, 'And beyond', 'Break the eclipse');
  await card('end', { logoAt: 0.3, lineAt: 1.2, line: 'Wishlist on Steam', z0: 1.0, z1: 1.03, t0: 8 });

  ff.stdin.end();
  await done;
  const log = await page.evaluate(() => __sfx);
  await ctx.close();

  // The sound, in a fresh page so the engine starts clean.
  const audio = await openGame(browser, 640, 360, 1);
  const r = await audio.page.evaluate(renderAudioInPage, {
    scoreSrc: require('./steam-score.js').composeScore.toString(),
    cuts: CUTS, log, drops: [...DROPS].map((k) => CUTS[k]) });
  errors.push(...audio.errors);
  await audio.ctx.close();
  const wavs = { mix: path.join(out, 'trailer-mix.wav'), music: path.join(out, 'trailer-score.wav'), sfx: path.join(out, 'trailer-effects.wav') };
  for (const k of Object.keys(wavs)) fs.writeFileSync(wavs[k], wavFile(r[k], r.SR));

  // Picture and sound together, at the usual trailer loudness (-14 LUFS).
  // Measured first and then moved by one fixed gain, with a limiter for the
  // peaks: a dynamic normaliser would lift the quiet opening and flatten the
  // arc the score is built on.
  const { spawnSync } = require('child_process');
  const meter = spawnSync(ffmpeg, ['-hide_banner', '-i', wavs.mix, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const I = Number((/I:\s+(-?[\d.]+) LUFS/.exec(meter.stderr.split('Summary').pop()) || [])[1]);
  const gain = Number.isFinite(I) ? -14 - I : 0;
  const mux = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', picture, '-i', wavs.mix,
    '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:attack=2:release=60:level=disabled`,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest', '-movflags', '+faststart', file], { stdio: 'inherit' });
  if (mux.status !== 0) throw new Error('ffmpeg could not mux the trailer');
  fs.unlinkSync(picture);

  const rel = (f) => path.relative(path.resolve(__dirname, '..'), f);
  return { made: [
    `${rel(file)} (${frames} frames, ${(frames / FPS).toFixed(1)}s, 1920x1080 H.264, AAC 320k)`,
    `${rel(wavs.music)}, ${rel(wavs.sfx)}, ${rel(wavs.mix)} (the score, the game's ${r.played} sounds, and the mix)`,
  ], errors };
}

module.exports = { make };
