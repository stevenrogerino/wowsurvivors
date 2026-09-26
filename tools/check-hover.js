#!/usr/bin/env node
/* Hovering the bottom edge of anything that lifts must not flicker.
 *
 * A tile that rises on hover (translateY) takes its hit box with it. With the
 * pointer resting in the few pixels at the bottom edge, the lift carries the
 * edge above the pointer, the hover ends, the tile drops back under it, the
 * hover starts again - many times a second, the "violent flicker" a tester
 * filmed on the level-up cards.
 *
 * For each kind of lifting tile this parks the pointer 1px above the bottom
 * edge, lets the lift settle, then samples :hover over a run of frames. It
 * must be hovered on every one: steady, not strobing. It also checks the
 * other side of the promise: 3px BELOW the resting bottom edge the tile is
 * not hovered at all, so the fix cannot grow a sticky halo.
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(GAME);
  await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
  await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
  });
  const fails = [];

  /* Park the pointer near the bottom of `sel` (the n-th match) and watch. */
  async function probe(name, sel, n) {
    const box = await page.evaluate(([sel, n]) => {
      const el = document.querySelectorAll(sel)[n || 0];
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, bottom: r.bottom };
    }, [sel, n]);
    if (!box) { fails.push(`${name}: no "${sel}" on screen to test`); return; }
    await page.mouse.move(5, 5);
    await page.waitForTimeout(250);
    await page.mouse.move(box.x, box.bottom - 1);
    await page.waitForTimeout(400);
    const states = await page.evaluate(([sel, n]) => new Promise((res) => {
      const el = document.querySelectorAll(sel)[n || 0];
      const out = [];
      const tick = () => {
        out.push(el.matches(':hover') ? 1 : 0);
        if (out.length < 40) requestAnimationFrame(tick); else res(out);
      };
      requestAnimationFrame(tick);
    }), [sel, n]);
    const on = states.filter(Boolean).length;
    if (on !== states.length) fails.push(`${name}: pointer at the bottom edge, hovered on ${on} of ${states.length} frames (flicker)`);
    // And not a halo: just below where the tile rests, nothing is hovered.
    await page.mouse.move(5, 5);
    await page.waitForTimeout(250);
    await page.mouse.move(box.x, box.bottom + 3);
    await page.waitForTimeout(300);
    const halo = await page.evaluate(([sel, n]) => document.querySelectorAll(sel)[n || 0].matches(':hover'), [sel, n]);
    if (halo) fails.push(`${name}: hovered with the pointer 3px below it`);
    await page.mouse.move(5, 5);
    return on;
  }

  // The level-up cards.
  await page.evaluate(() => {
    WS.Game.startRun('thornhollow', 'mage');
    if (WS.Game.state === 'blessing') WS.Game.chooseBlessing(WS.Game.blessingChoices[0]);
    WS.Game.state = 'playing';
    WS.UI.closeOverlay();
    WS.Game.pendingLevelUps = 1; WS.Game.leveling = false;
    WS.Game.presentLevelUp();
  });
  await page.waitForSelector('#overlay:not(.hidden) .card');
  await page.waitForTimeout(700);   // the deal animation
  await probe('level-up card', '#overlay:not(.hidden) .card', 1);

  // The menu's picks and the bestiary's tiles.
  await page.evaluate(() => { WS.Game.quitToMenu(); WS.UI.openMenu(); });
  await page.waitForTimeout(500);
  await probe('survivor pick', '.pick', 0);
  const tab = async (label) => page.evaluate((label) => {
    const t = [...document.querySelectorAll('.tabs .tab')].find((x) => x.textContent.trim() === label);
    if (t) t.click();
    return !!t;
  }, label);
  if (await tab('Bestiary')) { await page.waitForTimeout(500); await probe('bestiary tile', '.book-tab', 0); }

  await browser.close();
  if (errors.length) fails.push('page errors: ' + errors.slice(0, 3).join(' | '));
  if (fails.length) {
    console.log('FAIL');
    for (const f of fails) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('ok: a level-up card, a survivor pick and a bestiary tile each hold their hover steadily with '
    + 'the pointer at their bottom edge, and none is hovered from below it');
})();
