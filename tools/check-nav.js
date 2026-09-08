#!/usr/bin/env node
/* Navigation guard rail.
 *
 * The game takes a gamepad on the battlefield and used to hand you back to a
 * mouse the moment a menu opened. Everything in the overlay is a real button,
 * so the missing half was only a way to move between them - and the way has
 * to be SPATIAL. With a grid of ten survivors, "down" means the tile below,
 * not the next node in the document, and tab order cannot tell the
 * difference. This drives the arrow keys through a real grid and checks the
 * focus lands where a player would point.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-nav.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const fail = [];
  page.on('pageerror', (e) => fail.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(700);
  await page.evaluate(() => { WS.Save.unlockAll(); WS.UI.tab = 'roster'; WS.UI.openMenu(); });
  await page.waitForTimeout(300);

  const where = () => page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return null;
    const r = a.getBoundingClientRect();
    return { name: (a.textContent || '').trim().split('\n')[0].slice(0, 26),
      cls: a.className, x: Math.round(r.x), y: Math.round(r.y) };
  });

  // Focus the first roster tile, then walk the grid.
  await page.evaluate(() => document.querySelectorAll('.pick')[0].focus());
  const start = await where();
  if (!start || !/pick/.test(start.cls)) fail.push('could not focus the first roster tile');

  await page.keyboard.press('ArrowRight');
  const right = await where();
  if (right && right.y !== start.y) fail.push(`right left the row: ${start.y} -> ${right.y}`);
  if (right && right.x <= start.x) fail.push('right did not move right');

  await page.keyboard.press('ArrowDown');
  const down = await where();
  if (down && down.y <= (right || start).y) fail.push('down did not move down a row');
  if (down && right && Math.abs(down.x - right.x) > 8) {
    fail.push(`down drifted across columns: x ${right.x} -> ${down.x}`);
  }

  await page.keyboard.press('ArrowUp');
  const back = await where();
  if (back && right && (back.x !== right.x || back.y !== right.y)) {
    fail.push(`up did not return to the tile above: expected ${right.x},${right.y}` +
      ` got ${back.x},${back.y}`);
  }

  // The ring has to be visible, or none of this is usable.
  /* The ring has to be the game's, not the browser's 1px default, and it has
     to be there for focus the navigator moved - which is the whole point. */
  const ring = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement);
    return { width: cs.outlineWidth, style: cs.outlineStyle, colour: cs.outlineColor,
      navMode: document.body.classList.contains('nav-active') };
  });
  if (!ring.navMode) fail.push('arrowing did not put the page into keyboard-navigation mode');
  if (parseFloat(ring.width) < 2 || ring.style !== 'solid') {
    fail.push(`the focused control shows ${ring.width} ${ring.style}, not the game's 2px ring` +
      ' - it is falling back to the browser default');
  }

  // And a pointer must put the rings away again.
  await page.mouse.move(400, 400);
  await page.waitForTimeout(60);
  if (await page.evaluate(() => document.body.classList.contains('nav-active'))) {
    fail.push('moving the pointer did not clear keyboard-navigation mode');
  }

  console.log(fail.length ? fail.join('\n')
    : `ok: arrows walk the grid spatially, ring is ${ring.width} ${ring.style} ${ring.colour},`
      + ' and a pointer clears it');
  await b.close();
  process.exitCode = fail.length ? 1 : 0;
})();
