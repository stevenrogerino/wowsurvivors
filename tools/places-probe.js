#!/usr/bin/env node
/* check-score's "places" rule, alone and with every pair printed. That rule
 * only reports the pairs that fail, and it takes ten minutes to say so; this
 * is the same measurement (eight log bands, amplitude-summed, 30s a zone) in
 * three and a half, for iterating on a zone's sound.
 *
 *   node tools/places-probe.js            all pairs, closest first
 *   node tools/places-probe.js --seconds 15   quicker, noisier */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');
const secArg = process.argv.indexOf('--seconds');
const SECONDS = secArg > 0 ? +process.argv[secArg + 1] : 30;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.goto(INDEX);
  await page.waitForFunction(() => window.WS && window.WS.Audio);
  const specs = await page.evaluate(async (seconds) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Audio.init(); WS.Audio.resume(); WS.Audio.applySettings();
    const ctx = WS.Audio.ctx;
    await sleep(150);
    const an = ctx.createAnalyser();
    an.fftSize = 4096; an.smoothingTimeConstant = 0;
    WS.Audio.musicGain.connect(an);
    const bins = new Float32Array(an.frequencyBinCount);
    const EDGES = [40, 110, 250, 550, 1200, 2600, 5200, 9000, 16000];
    const hz = ctx.sampleRate / an.fftSize;
    const bands = async (ms) => {
      const acc = new Float64Array(EDGES.length - 1);
      let n = 0;
      const until = performance.now() + ms;
      while (performance.now() < until) {
        an.getFloatFrequencyData(bins);
        for (let bi = 0; bi < EDGES.length - 1; bi++) {
          let e = 0;
          const lo = Math.round(EDGES[bi] / hz), hi = Math.round(EDGES[bi + 1] / hz);
          for (let i = lo; i < hi && i < bins.length; i++) e += Math.pow(10, Math.max(-140, bins[i]) / 20);
          acc[bi] += e;
        }
        n++; await sleep(25);
      }
      return Array.from(acc, (v) => 20 * Math.log10(v / n));
    };
    const out = {};
    for (const k of ['forest', 'plains', 'cursed', 'savannah', 'glacier', 'highmoor', 'eclipse', 'menu']) {
      WS.Audio.stopMusic();
      WS.Audio.playMusic(k);
      if (WS.Audio._music) { WS.Audio._music.intensity = 0; WS.Audio._music.want = 0; }
      await sleep(900);
      out[k] = await bands(seconds * 1000);
    }
    WS.Audio.stopMusic();
    return out;
  }, SECONDS);
  const keys = Object.keys(specs);
  const pairs = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = specs[keys[i]], b = specs[keys[j]];
      pairs.push([keys[i] + ' / ' + keys[j], a.reduce((s, v, k) => s + Math.abs(v - b[k]), 0) / a.length]);
    }
  }
  pairs.sort((x, y) => x[1] - y[1]);
  for (const [n, d] of pairs.slice(0, 8)) console.log(`${n.padEnd(22)} ${d.toFixed(2)}dB${d < 3 ? '   < 3 FAILS' : ''}`);
  console.log('\nbands (dB)  40  110  250  550  1.2k 2.6k 5.2k 9k');
  for (const k of keys) console.log(k.padEnd(10) + specs[k].map((v) => v.toFixed(0).padStart(5)).join(''));
  await browser.close();
})();
