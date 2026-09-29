#!/usr/bin/env node
/* THE LISTENING ROOM: what a night actually sounds like, as a file.
 *
 * Every other audio tool measures one mechanism at a time (tools/check-audio.js
 * pans a hit, mutes the score, stalls the clock). None of them could answer
 * "what does minute twenty-one on the Pale Wastes sound like", because the
 * engine only ever plays into a live AudioContext and a headless browser has
 * nobody listening. This does it in two passes, in one page:
 *
 *   1. CAPTURE. A real night, stepped a tick at a time the way the balance
 *      harnesses do (tools/meter-test.js), with the bot's pilot at the stick
 *      and a fixed build. Every call into WS.Audio is logged with the sim
 *      clock and where the survivor stood, instead of played. Timers the game
 *      sets (a boss's yell comes 650ms after its horn) run on the sim clock.
 *
 *   2. RENDER. The real engine, pointed at an OfflineAudioContext whose clock
 *      is whatever the replay says it is. The log is played back in order and
 *      the score's look-ahead scheduler - a setInterval in the game - is ticked
 *      by the same virtual clock, so the music is the music the night would
 *      have had, not a separate composition. Rendered three times: the mix,
 *      the score alone and the effects alone.
 *
 * It then measures what an ear would: loudness over time, peaks, how the mix
 * sits in six bands, how wide it is, how much of it is the score, and how
 * dense the effects are. And it writes the WAVs, and MP3s when ffmpeg is
 * there (FFMPEG=/path), so a person can listen to what was measured.
 *
 *   node tools/audio-render.js                       every scene
 *   SCENES=late,boss LABEL=after node tools/audio-render.js
 *   OUT=/some/dir   (default: tmp)   node tools/audio-render.js --compare dirA dirB
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const SR = 44100;

/* The scenes. A night is mostly its middle, so three of the five are combat:
   an early field, a boss arriving, a late siege at full danger. */
const SCENES = {
  menu: { music: 'menu', secs: 30, ui: true },
  early: { map: 'thornhollow', hero: 'mage', at: 150, secs: 40,
    build: 'cinderfall:3,rimeshard:3,arcweb:2', passives: 2 },
  boss: { map: 'dustreach', hero: 'warrior', at: 288, secs: 45,
    build: 'reaving_arc:5,knifestorm:5,volley:4,seeking_motes:4', passives: 4 },
  late: { map: 'palewastes', hero: 'shaman', at: 1170, secs: 45,
    build: 'arcweb:8E,knifestorm:8E,volley:8E,umbral_bolt:8,reaving_arc:8', passives: 9 },
  // The last stretch before dawn, where the score should be turning.
  dawn: { map: 'ochre', hero: 'paladin', at: 1580, secs: 40,
    build: 'hallowed_ring:8E,judgement_disc:8,volley:8,seeking_motes:8,cinderfall:7', passives: 7 },
  moor: { map: 'highmoor', hero: 'monk', at: 720, secs: 40,
    build: 'reaving_arc:6,gale_chakram:6,volley:5,seeking_motes:5', passives: 6 },
};

/* ------------------------------------------------------------ in the page */
/* A clock the page's timers run on, so a capture and a render both happen on
   simulated time and nothing fires on the wall clock behind them. */
function installClock() {
  const C = window.__clock = { V: 0, seq: 0, timers: [] };
  window.setTimeout = (fn, ms) => { const id = ++C.seq; C.timers.push({ id, at: C.V + (ms || 0) / 1000, fn, every: 0 }); return id; };
  window.setInterval = (fn, ms) => { const id = ++C.seq; C.timers.push({ id, at: C.V + (ms || 0) / 1000, fn, every: Math.max(1, ms || 0) / 1000 }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { const i = C.timers.findIndex((t) => t.id === id); if (i >= 0) C.timers.splice(i, 1); };
  C.run = (upTo) => {
    for (;;) {
      let best = null;
      for (const t of C.timers) if (t.at <= upTo && (!best || t.at < best.at)) best = t;
      if (!best) { C.V = upTo; return; }
      C.V = best.at;
      if (best.every) best.at += best.every; else C.timers.splice(C.timers.indexOf(best), 1);
      try { best.fn(); } catch (e) { /* one timer, not the night */ }
    }
  };
  if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
  WS.UI.closeOverlay();
  WS.Save.db.seenManual = true; WS.Save.unlockAll();
  WS.Save.save = () => {}; WS.Save.flush = () => {};
  WS.Save.settings.sound = true; WS.Save.settings.music = true;
}

/** 1. CAPTURE: a night stepped a tick at a time, every WS.Audio call logged. */
function capture({ scene, pilotSrc }) {
  const C = window.__clock;
  const A = WS.Audio;
  const LOGGED = ['play', 'cue', 'babble', 'playMusic', 'setIntensity', 'setPeril', 'setBoss',
    'setAmbience', 'stopMusic', 'stopAmbience', 'startHearth'];
  const log = [];
  let simT = 0;
  let lastI = -1, lastP = -1, lastB;
  for (const k of LOGGED) {
    A[k] = function (...args) {
      // The dials are turned every frame; the score reads them four times a
      // second, so a change is what is worth keeping.
      if (k === 'setIntensity') { if (Math.abs(args[0] - lastI) < 0.01) return; lastI = args[0]; }
      if (k === 'setPeril') { if (Math.abs(args[0] - lastP) < 0.01) return; lastP = args[0]; }
      if (k === 'setBoss') { if (args[0] === lastB) return; lastB = args[0]; }
      log.push([k, simT, WS.Game.player ? WS.Game.player.x : null, args]);
    };
  }
  for (const k of ['init', 'resume', 'applySettings']) A[k] = () => {};

  const G = WS.Game;
  let kills = 0, levels = 0;
  if (scene.music) {
    // The menu: its score, and a hand on the interface now and then.
    A.playMusic(scene.music);
    for (let t = 2; t < scene.secs - 2; t += 1.7 + (t * 7 % 3)) {
      simT = t; A.play('hover');
      if ((t | 0) % 3 === 0) { simT = t + 0.35; A.play('ui'); }
      if ((t | 0) % 7 === 0) { simT = t + 0.8; A.play('page'); }
    }
    return { log, kills, levels };
  }
  WS.Save.settings.difficulty = 'professional';
  WS.setSeed(4242);
  G.startRun(scene.map, scene.hero);
  G.chooseBlessing({ type: 'blessing', id: 'kings' });
  const p = G.player;
  G.run.secondBlessing = true;
  // A level-up is a sound and a pause; the pause is not what is measured.
  let lastLevel = -99;
  G.openLevelUp = () => { if (simT - lastLevel > 9) { lastLevel = simT; levels++; A.play('level'); } };
  G.presentLevelUp = () => {};
  G.state = 'playing'; WS.UI.closeOverlay();
  p.weapons.length = 0; p.weaponLevels = {};
  for (const spec of scene.build.split(',')) {
    const [id, rk] = spec.split(':');
    const w = WS.Player.addWeapon(p, id);
    if (!w) continue;
    w.level = parseInt(rk); p.weaponLevels[id] = w.level;
    w.evolved = rk.endsWith('E');
  }
  WS.ComboSystem.check(p);
  const DMG = ['might', 'haste', 'precision', 'ferocity', 'area', 'quantity', 'velocity', 'perennial', 'serration'];
  for (const id of DMG.slice(0, scene.passives)) {
    const up = WS.Upgrades[id];
    const n = Math.ceil(up.max * 0.75);
    for (let k = 0; k < n; k++) up.apply(p, up);
    p.upgradeLevels[id] = n;
  }
  p.level = 20 + ((scene.at / 30) | 0);
  WS.Input.poll = () => {};
  for (const k of Object.keys(WS.Input.keys)) WS.Input.keys[k] = false;
  const WARM = 8;
  G.run.time = Math.max(0, scene.at - WARM);
  p.x = WS.CONST.WORLD_WIDTH / 2; p.y = WS.CONST.WORLD_HEIGHT / 2;
  const pilot = (0, eval)('(' + pilotSrc + ')')({});
  const takeDamage = WS.Player.takeDamage;
  WS.Player.takeDamage = function (pl, amount) {
    if (pl.health - amount < pl.maxHealth * 0.3) pl.health = pl.maxHealth;
    return takeDamage.apply(this, arguments);
  };
  const tick = () => {
    G.pendingLevelUps = 0; G.leveling = false;
    if (G.state !== 'playing') { WS.UI.closeOverlay(); G.state = 'playing'; }
    // Hurt is heard, but nobody dies before the scene ends.
    if (p.health < p.maxHealth * 0.5) p.health = p.maxHealth * 0.5;
    pilot.step(1 / 60); G.update(1 / 60);
  };
  for (let i = 0; i < WARM * 60; i++) { C.run(i / 60); tick(); }
  // The clock starts with the score: whatever the warm-up said is dropped,
  // and the dials are re-read on the first tick.
  log.length = 0;
  lastI = lastP = -1; lastB = undefined;
  log.push(['playMusic', 0, null, [G.run.map.music]]);
  C.timers.length = 0; C.V = 0;
  const k0 = G.run.kills;
  for (let i = 0; i < scene.secs * 60; i++) { simT = i / 60; C.run(simT); tick(); }
  kills = G.run.kills - k0;
  return { log, kills, levels };
}

/** 2. RENDER: the real engine, offline, fed the log. One stem per fresh page,
 *  because the engine keeps module state (throttles, backlog) that must start
 *  from nothing each time. */
async function render({ scene, SR, log, stem }) {
  const C = window.__clock;
  const A = WS.Audio, G = WS.Game;
  const N = Math.round(SR * scene.secs);
  const oc = new OfflineAudioContext(2, N, SR);
  Object.defineProperty(oc, 'currentTime', { get: () => C.V });
  Object.defineProperty(oc, 'state', { get: () => 'running' });
  oc.resume = () => Promise.resolve();
  window.AudioContext = function () { return oc; };
  window.webkitAudioContext = window.AudioContext;
  A.init();
  const listener = { x: WS.CONST.WORLD_WIDTH / 2, y: 0, health: 1, maxHealth: 1 };
  G.player = listener;
  // The score reads the hour of the night off the run (the night arc).
  const song = log.find((e) => e[0] === 'playMusic');
  G.run = scene.map ? { get time() { return scene.at + C.V; }, mapId: scene.map,
    map: { music: song && song[3][0], arena: false } } : null;
  for (const [k, t, x, args] of log) {
    const isMusic = k === 'playMusic' || k === 'setAmbience' || k === 'startHearth';
    if (stem === 'music' && (k === 'play' || k === 'cue' || k === 'babble')) continue;
    if (stem === 'sfx' && isMusic) continue;
    C.run(t);
    listener.x = x === null ? WS.CONST.WORLD_WIDTH / 2 : x;
    try { A[k](...args); } catch (e) { /* one call, not the render */ }
  }
  C.run(scene.secs - 1.05);
  const buf = await oc.startRendering();
  const l = buf.getChannelData(0), r = buf.getChannelData(1);
  // Float32 -> base64 of int16, clipped honestly: nothing is normalised, so
  // two renders compare at the level a player hears them.
  const pcm = new Int16Array(l.length * 2);
  for (let i = 0; i < l.length; i++) {
    pcm[2 * i] = Math.max(-1, Math.min(1, l[i])) * 32767;
    pcm[2 * i + 1] = Math.max(-1, Math.min(1, r[i])) * 32767;
  }
  let bin = ''; const u8 = new Uint8Array(pcm.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* ------------------------------------------------------------ in node */
function wavFile(b64, sr) {
  const pcm = Buffer.from(b64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
function readWav(file) {
  const b = fs.readFileSync(file);
  const n = (b.length - 44) / 4, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = b.readInt16LE(44 + 4 * i) / 32768; R[i] = b.readInt16LE(46 + 4 * i) / 32768; }
  return [L, R];
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

const BANDS = [['sub', 20, 60], ['low', 60, 250], ['lowmid', 250, 1000], ['mid', 1000, 4000], ['high', 4000, 10000], ['air', 10000, 20000]];
const db = (x) => (x > 0 ? 10 * Math.log10(x) : -120);

/** What an ear would notice, in numbers. */
function measure([L, R], sr) {
  const n = L.length;
  let sum = 0, peak = 0, mid = 0, side = 0, lr = 0, ll = 0, rr = 0;
  for (let i = 0; i < n; i++) {
    const l = L[i], r = R[i];
    sum += (l * l + r * r) / 2; peak = Math.max(peak, Math.abs(l), Math.abs(r));
    mid += ((l + r) / 2) ** 2; side += ((l - r) / 2) ** 2;
    lr += l * r; ll += l * l; rr += r * r;
  }
  // Short-term loudness: 400ms windows, and the spread between the loud and
  // quiet ends of them - a mix that never moves has a spread near zero.
  const W = Math.round(sr * 0.4), st = [];
  for (let i = 0; i + W <= n; i += W / 2) {
    let s = 0;
    for (let j = i; j < i + W; j++) s += (L[j] * L[j] + R[j] * R[j]) / 2;
    st.push(db(s / W));
  }
  const sorted = st.filter((v) => v > -70).sort((a, b) => a - b);
  const pct = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : -120);
  // Bands: the mean power spectrum over 4096-sample windows.
  const F = 4096, spec = new Float64Array(F / 2);
  let frames = 0;
  const win = new Float64Array(F).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (F - 1)));
  for (let i = 0; i + F <= n; i += F) {
    const re = new Float64Array(F), im = new Float64Array(F);
    for (let j = 0; j < F; j++) re[j] = (L[i + j] + R[i + j]) / 2 * win[j];
    fft(re, im);
    for (let k = 0; k < F / 2; k++) spec[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  const bands = {};
  let tot = 0;
  for (const [, lo, hi] of BANDS) for (let k = Math.ceil(lo * F / sr); k < Math.min(F / 2, hi * F / sr); k++) tot += spec[k];
  for (const [name, lo, hi] of BANDS) {
    let s = 0;
    for (let k = Math.ceil(lo * F / sr); k < Math.min(F / 2, hi * F / sr); k++) s += spec[k];
    bands[name] = +(100 * s / (tot || 1)).toFixed(1);
  }
  // Onsets: 20ms energy frames that jump 6dB over the one before.
  const O = Math.round(sr * 0.02);
  let onsets = 0, prev = -120;
  for (let i = 0; i + O <= n; i += O) {
    let s = 0;
    for (let j = i; j < i + O; j++) s += (L[j] * L[j] + R[j] * R[j]) / 2;
    const d = db(s / O);
    if (d > -50 && d - prev > 6) onsets++;
    prev = d;
  }
  return {
    rms: +db(sum / n).toFixed(1),
    peak: +(20 * Math.log10(peak || 1e-9)).toFixed(1),
    crest: +(20 * Math.log10(peak || 1e-9) - db(sum / n)).toFixed(1),
    loud: +pct(0.9).toFixed(1), quiet: +pct(0.1).toFixed(1), range: +(pct(0.9) - pct(0.1)).toFixed(1),
    width: +(side / (mid || 1e-12)).toFixed(3),
    corr: +(lr / Math.sqrt(ll * rr || 1e-12)).toFixed(2),
    onsets: +(onsets / (n / sr)).toFixed(1),
    bands,
  };
}

function printTable(rows) {
  const cols = ['rms', 'loud', 'quiet', 'range', 'peak', 'crest', 'width', 'onsets'];
  console.log('scene/stem'.padEnd(16) + cols.map((c) => c.padStart(8)).join('') + '   ' + BANDS.map((b) => b[0].padStart(7)).join(''));
  for (const [name, m] of rows) {
    console.log(name.padEnd(16) + cols.map((c) => String(m[c]).padStart(8)).join('') + '   '
      + BANDS.map((b) => (m.bands[b[0]] + '%').padStart(7)).join(''));
  }
}

async function main() {
  if (process.argv[2] === '--compare') {
    const [a, b] = process.argv.slice(3);
    for (const f of fs.readdirSync(a).filter((x) => x.endsWith('.wav')).sort()) {
      if (!fs.existsSync(path.join(b, f))) continue;
      printTable([[path.basename(a) + ' ' + f.replace('.wav', ''), measure(readWav(path.join(a, f)), SR)],
        [path.basename(b) + ' ' + f.replace('.wav', ''), measure(readWav(path.join(b, f)), SR)]]);
      console.log('');
    }
    return;
  }
  const out = path.resolve(env('OUT', path.join(os.tmpdir(), 'ember-audio')), env('LABEL', 'render'));
  fs.mkdirSync(out, { recursive: true });
  const names = env('SCENES', Object.keys(SCENES).join(',')).split(',');
  const ffmpeg = env('FFMPEG', '');
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const pilotSrc = require('./bot/pilot.js').installPilot.toString();
  const rows = [], summary = {};
  for (const name of names) {
    const scene = SCENES[name];
    if (!scene) { console.error('no scene ' + name); continue; }
    const open = async () => {
      const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('pageerror', (e) => console.error(name + ': page error: ' + e.message));
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
      await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db && WS.Audio);
      await page.evaluate(installClock);
      return page;
    };
    const page = await open();
    const r = await page.evaluate(capture, { scene, pilotSrc });
    await page.close();
    fs.writeFileSync(path.join(out, `${name}-log.json`), JSON.stringify(r.log));
    for (const stem of ['mix', 'music', 'sfx']) {
      const pg = await open();
      const b64 = await pg.evaluate(render, { scene, SR, log: r.log, stem });
      await pg.close();
      const file = path.join(out, `${name}-${stem}.wav`);
      fs.writeFileSync(file, wavFile(b64, SR));
      rows.push([name + ' ' + stem, measure(readWav(file), SR)]);
      if (ffmpeg && stem === 'mix') {
        execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', file, '-codec:a', 'libmp3lame', '-b:a', '192k', file.replace('.wav', '.mp3')]);
      }
    }
    const calls = {};
    for (const [k, , , args] of r.log) { const key = k === 'play' ? args[0] : k; calls[key] = (calls[key] || 0) + 1; }
    r.calls = calls; r.events = r.log.length;
    summary[name] = { calls: r.calls, kills: r.kills, levels: r.levels, events: r.events };
    console.error(`${name}: ${r.events} calls, ${r.kills} kills, ${r.levels} level-ups`);
  }
  await b.close();
  printTable(rows);
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ summary, rows }, null, 1));
  console.log('\nwritten to ' + out);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
