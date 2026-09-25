#!/usr/bin/env node
/* What never stops? Each zone's score is three things on one bed - the drone,
 * the weather, and the zone's music (melody, chords, rhythm) - and a listener
 * who says "there is a constant noise on this map" is describing whichever of
 * them is loud and never lets up. This plays each zone with one layer at a
 * time and reports, per layer:
 *
 *   level   its average loudness on the music bus, dB
 *   floor   its quietest half-second against its loudest (dB). Near zero is
 *           a sound held at one level forever; music that breathes reads -15
 *           or lower
 *   top     the share of its energy above 5kHz - hiss, whatever its level
 *
 *   node tools/ambient-probe.js                 every zone
 *   node tools/ambient-probe.js plains forest   just these
 *
 * Real time, off a real AudioContext: about a minute per zone. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ZONES = want.length ? want : ['forest', 'plains', 'cursed', 'savannah', 'glacier', 'highmoor', 'eclipse'];
const SECONDS = 16;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.goto(INDEX);
  await page.waitForFunction(() => window.WS && window.WS.Audio);
  const out = await page.evaluate(async ([zones, seconds]) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Audio.init(); WS.Audio.resume(); WS.Audio.applySettings();
    const ctx = WS.Audio.ctx;
    await sleep(150);
    const an = ctx.createAnalyser();
    an.fftSize = 4096; an.smoothingTimeConstant = 0;
    WS.Audio.musicGain.connect(an);
    const bins = new Float32Array(an.frequencyBinCount);
    const hz = ctx.sampleRate / an.fftSize;
    const cut = Math.round(5000 / hz);

    async function listen(ms) {
      const wins = []; let top = 0, all = 0;
      const until = performance.now() + ms;
      let acc = 0, n = 0, t = performance.now();
      while (performance.now() < until) {
        an.getFloatFrequencyData(bins);
        let e = 0;
        for (let i = 1; i < bins.length; i++) {
          const p = Math.pow(10, Math.max(-140, bins[i]) / 10);
          e += p; all += p; if (i >= cut) top += p;
        }
        acc += e; n++;
        if (performance.now() - t >= 500) { wins.push(10 * Math.log10(acc / n)); acc = 0; n = 0; t = performance.now(); }
        await sleep(20);
      }
      wins.sort((a, b) => a - b);
      const mean = 10 * Math.log10(wins.reduce((s, w) => s + Math.pow(10, w / 10), 0) / wins.length);
      const lo = wins[Math.floor(wins.length * 0.1)], hi = wins[Math.floor(wins.length * 0.9)];
      return { level: +mean.toFixed(1), floor: +(lo - hi).toFixed(1), top: +(top / all).toFixed(3) };
    }

    const res = {};
    for (const z of zones) {
      res[z] = {};
      for (const layer of ['drone', 'air', 'music']) {
        WS.Audio.stopMusic();
        WS.Audio.playMusic(z);
        const m = WS.Audio._music;
        m.intensity = 0; m.want = 0;
        // Silence everything but the layer under test.
        if (layer !== 'drone') m.drone.disconnect();
        if (layer !== 'air' && m.air) m.air.gain.disconnect();
        if (layer !== 'music') m.zone.disconnect();
        await sleep(2500);
        res[z][layer] = await listen(seconds * 1000);
      }
    }
    WS.Audio.stopMusic();
    return res;
  }, [ZONES, SECONDS]);
  console.log('zone       layer   level   floor    top>5k');
  for (const [z, layers] of Object.entries(out)) {
    for (const [l, r] of Object.entries(layers)) {
      console.log(`${z.padEnd(10)} ${l.padEnd(6)} ${String(r.level).padStart(6)}  ${String(r.floor).padStart(6)}   ${r.top}`);
    }
  }
  await browser.close();
})();
