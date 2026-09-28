#!/usr/bin/env node
/* A seed is the same night on every machine.
 *
 * The simulation steps at 60 a second whatever the screen does; a 144Hz
 * screen draws more frames per step than a 60Hz one. Drawing used to spend
 * the SEEDED dice (a storm mark's crackle, a machine's jolt), so the faster
 * the screen, the more of the stream the draw ate and the different the
 * night: measured on Highmoor, seed 77 ended with 108 kills undrawn and 96
 * drawn - and a Nightly is meant to be the same night for everyone.
 *
 * Each run is a fresh page (state carried between runs on one page is its
 * own question). NEGATIVE TEST: take the swap out of Renderer.draw and
 * Highmoor reports DIFFERENT.
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const once = async (draws, map) => {
    const page = await b.newPage();
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto('file://' + require('path').resolve(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
    const r = await page.evaluate(({ draws, map }) => {
      if (WS.Prologue.active) WS.Prologue.finish(); WS.UI.closeOverlay(); WS.Save.unlockAll();
      WS.setSeed(77); WS.Game.startRun(map, 'mage'); WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
      WS.Game.openLevelUp = () => {}; WS.Game.presentLevelUp = () => {};
      const p = WS.Game.player; p.maxHealth = p.health = 1e9;
      for (let i = 0; i < 60 * 40; i++) { WS.Game.update(1 / 60); for (let d = 0; d < draws; d++) WS.Renderer.draw(i / 60 + d / 240); }
      return [WS.Game.run.kills, WS.Enemy.count(), WS.random().toFixed(6)].join(',');
    }, { draws, map });
    await page.close();
    return r;
  };
  const fail = [];
  for (const map of ['highmoor', 'palewastes', 'thornhollow']) {
    const r = [await once(0, map), await once(1, map), await once(3, map)];
    if (!r.every((x) => x === r[0])) fail.push(map + ': 0, 1 and 3 frames a step ended as ' + r.join(' / '));
  }
  await b.close();
  if (fail.length) { console.log('FAIL\n  - ' + fail.join('\n  - ')); process.exitCode = 1; }
  else console.log('ok: a seed plays the same night whether 0, 1 or 3 frames are drawn per step, on Highmoor, the Pale Wastes and Thornhollow');
})();
