#!/usr/bin/env node
/* Adaptive quality's guard rail (render/renderer.js, adaptResolution).
 *
 * The renderer watches its own frame time and, when a fight runs slow for a
 * sustained stretch, gives something up: first the night's effects (the
 * bloom, then the mist, then the light), one rung at a time, and only then
 * resolution. Every step is a trial kept only if frames got faster. A real
 * machine cannot be made slow on demand, so this feeds the controller frame
 * times from a cost model - what a frame would take at a given rung and
 * resolution - and reads what it chose.
 *
 *   ladder    Where every rung pays, a slow machine sheds all three effects
 *             before it touches resolution.
 *   useless   Where only the bloom pays, the bloom stays off, the mist rung
 *             is put back, and resolution is tried next.
 *   nothing   Where nothing pays (software compositing, where a smaller
 *             canvas is dearer to stretch), everything is put back.
 *   fast      A machine with frames to spare sheds nothing.
 *   reset     A new run starts with everything on again.
 *   off       With the setting off, nothing is shed.
 *
 * NEGATIVE TESTS - each confirmed to fail against a sabotaged controller:
 * skipping the shed branch gives "shed nothing before resolution"; never
 * reverting a rung gives "the mist rung bought nothing and stayed shed";
 * not clearing shed when the run ends gives "a new run started with 1
 * effects shed".
 *
 *   node tools/check-adapt.js
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Game && WS.Renderer && WS.Save && WS.Save.db);

  const res = await page.evaluate(() => {
    const R = WS.Renderer, G = WS.Game;
    const st = WS.Save.settings;
    /* A frame's cost: `base` at full resolution with nothing shed, less what
       each shed rung saves, scaled by the pixels drawn (plus `stretch`, what
       drawing below full size costs to scale back up). */
    const run = (model, seconds) => {
      G.running = true; G.run = { time: 60 };
      const log = [];
      for (let t = 0; t < seconds * 1000;) {
        let ms = model.base;
        for (let k = 0; k < R.shed; k++) ms -= model.saves[k] || 0;
        const px = R.renderScale * R.renderScale;
        ms = ms * (model.pixels ? (1 - model.pixels + model.pixels * px) : 1) + (R.renderScale < 1 ? (model.stretch || 0) : 0);
        R.adaptResolution(ms);
        const last = log[log.length - 1], scale = +R.renderScale.toFixed(2);
        if (!last || last.shed !== R.shed || last.scale !== scale) log.push({ t: Math.round(t), shed: R.shed, scale });
        t += ms;
        G.run.time = 60 + t / 1000;
      }
      return log;
    };
    // The end of a run; each scenario also starts from full resolution, which
    // a real machine carries between runs and a scenario here must not.
    const end = () => { G.running = false; R.adaptResolution(16); R.renderScale = 1; R.resize(); };
    const out = {};
    st.dynamicResolution = true;
    end();
    // Every rung pays and it is still slow after two: 44ms -> the bloom saves
    // 8, the mist 4, the light 9.
    out.ladder = run({ base: 44, saves: [8, 4, 9], pixels: 0.6 }, 30);
    end();
    // Only the bloom pays.
    out.useless = run({ base: 36, saves: [8, 0, 0], pixels: 0.6 }, 30);
    end();
    // Nothing pays, and a smaller canvas costs more to stretch.
    out.nothing = run({ base: 36, saves: [0, 0, 0], pixels: 0.1, stretch: 6 }, 30);
    end();
    out.fast = run({ base: 12, saves: [3, 1, 3], pixels: 0.6 }, 30);
    // Mid-run with a rung shed, then the run ends.
    end();
    run({ base: 36, saves: [8, 4, 9], pixels: 0.6 }, 3.5);
    out.shedMidRun = R.shed;
    end();
    out.afterEnd = R.shed;
    // Off.
    st.dynamicResolution = false;
    out.off = run({ base: 36, saves: [8, 4, 9], pixels: 0.6 }, 30);
    st.dynamicResolution = true;
    end();
    return out;
  });

  const fail = [];
  const final = (log) => log[log.length - 1];
  const firstScale = (log) => log.find((e) => e.scale < 1);
  const L = res.ladder;
  if (!(final(L).shed === 3)) fail.push(`ladder: every rung paid and the controller shed ${final(L).shed} of 3 effects`);
  const lowered = firstScale(L);
  if (lowered && lowered.shed < 3) fail.push(`ladder: resolution dropped at ${lowered.t}ms with only ${lowered.shed} effects shed - shed nothing before resolution`);
  const U = res.useless;
  if (!(final(U).shed === 1)) fail.push(`useless: only the bloom paid, and ${final(U).shed} effects ended shed - the mist rung bought nothing and stayed shed`);
  if (!firstScale(U)) fail.push('useless: with the effects exhausted and frames still slow, resolution was never tried');
  const N = res.nothing;
  if (!(final(N).shed === 0 && final(N).scale === 1)) fail.push(`nothing: no step paid and the controller ended at ${final(N).shed} shed, ${final(N).scale} scale - it kept something that did not help`);
  const F = res.fast;
  if (!(final(F).shed === 0 && final(F).scale === 1)) fail.push(`fast: a machine with frames to spare ended at ${final(F).shed} shed, ${final(F).scale} scale`);
  if (!(res.shedMidRun >= 1)) fail.push(`reset: the mid-run setup never shed anything (${res.shedMidRun}), so the reset below proves nothing`);
  if (res.afterEnd !== 0) fail.push(`reset: a new run started with ${res.afterEnd} effects shed`);
  if (!(final(res.off).shed === 0 && final(res.off).scale === 1)) fail.push(`off: with adaptive quality off, the controller still shed ${final(res.off).shed} and scaled to ${final(res.off).scale}`);
  if (errs.length) fail.push('page errors: ' + errs.slice(0, 2).join(' | '));

  const fmt = (log) => log.map((e) => `${(e.t / 1000).toFixed(1)}s:${e.shed}/${e.scale}`).join(' ');
  console.log('ladder   ' + fmt(L));
  console.log('useless  ' + fmt(U));
  console.log('nothing  ' + fmt(N));
  console.log('fast     ' + fmt(F));
  await browser.close();
  if (fail.length) { console.log('FAIL\n  - ' + fail.join('\n  - ')); process.exit(1); }
  console.log('ok: a slow machine sheds the bloom, the mist and the light before any resolution, keeps only the steps that '
    + 'paid, puts back the ones that did not, sheds nothing when it has frames to spare or the setting is off, and starts every run whole');
})();
