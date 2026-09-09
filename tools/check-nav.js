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
 * AND THEN IT WALKS EVERY SCREEN.
 *
 * The spatial test above only ever looked at one of them - the roster tab of
 * the main menu - which meant the level-up cards, the pause screen, the
 * manual, the death screen and six other tabs were unguarded, and every new
 * screen added to the game arrived unguarded too. "Can you play the whole
 * thing on a stick" is the question a handheld storefront actually asks, and
 * it is not a question one screen can answer.
 *
 * So for each screen this builds the real reachability graph: from the control
 * that starts focused, it drives UI.navigate - the same function the arrow
 * keys call, not a simulation of it - in all four directions from every node
 * it reaches, and fails on any control a player could never get to. An
 * unreachable button is a button that does not exist for anyone without a
 * mouse.
 *
 * It also checks every control is ON SCREEN, which reachability alone does
 * not. Writing the negative test for this found the hole: a button parked at
 * -400,-400 is perfectly reachable - it lies in the direction the arrow was
 * pressed - so the walk arrowed happily onto something no player could see.
 * Being able to focus a control you cannot look at is worse than not being
 * able to reach it, because the focus ring goes somewhere and the screen does
 * not change.
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
  await page.evaluate(() => {
    // A fresh profile gets the prologue, and its layer covers the screen.
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.unlockAll(); WS.UI.tab = 'roster'; WS.UI.openMenu();
  });
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

  /* ---- every screen, walked ---------------------------------------------- */
  const screens = await page.evaluate(() => {
    const out = [];
    /* Each entry opens a screen and leaves it on screen. Everything the player
     * can reach from the menu or mid-run is here; if a screen is added to the
     * game and not to this list, that is the gap this tool exists to close. */
    const SCREENS = {};
    for (const tab of ['roster', 'battlefields', 'trainer', 'codex', 'bestiary',
      'stats', 'settings']) {
      SCREENS['menu/' + tab] = () => { WS.UI.tab = tab; WS.UI.openMenu(); };
    }
    SCREENS.manual = () => WS.UI.openManual();
    SCREENS.levelup = () => {
      WS.Game.startRun('thornhollow', 'mage');
      WS.Game.leveling = false;
      WS.Game.pendingLevelUps = 1;
      WS.Game.openLevelUp();
    };
    SCREENS.pause = () => { WS.Game.startRun('thornhollow', 'mage'); WS.UI.openPause(); };
    SCREENS.over = () => { WS.Game.startRun('thornhollow', 'mage'); WS.Game.endRun(false); };

    for (const [name, open] of Object.entries(SCREENS)) {
      try { open(); } catch (e) { out.push({ name, error: e.message }); continue; }
      const items = WS.UI.focusables();
      if (!items.length) { out.push({ name, count: 0, unreachable: [], empty: true }); continue; }
      items.forEach((n, i) => { n.dataset.navid = String(i); });
      const idOf = () => {
        const a = document.activeElement;
        return a && a.dataset && a.dataset.navid !== undefined ? +a.dataset.navid : -1;
      };
      // Start where the screen itself puts focus, or at the first control -
      // which is exactly what a player arriving with a pad would have.
      let startId = idOf();
      if (startId < 0) { items[0].focus(); startId = 0; }

      const seen = new Set([startId]);
      const queue = [startId];
      while (queue.length) {
        const id = queue.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          items[id].focus();
          WS.UI.navigate(dx, dy);
          const next = idOf();
          if (next >= 0 && !seen.has(next)) { seen.add(next); queue.push(next); }
        }
      }
      const label = (n) => ((n.textContent || '').trim().split('\n')[0].slice(0, 22)
        || n.className || 'unnamed');
      const unreachable = [], offscreen = [];
      items.forEach((n, i) => {
        if (!seen.has(i)) unreachable.push(label(n));
        n.focus();                       // the only moment the question means anything
        const r = n.getBoundingClientRect();
        if (r.right < 2 || r.bottom < 2 || r.left > innerWidth - 2 || r.top > innerHeight - 2) {
          offscreen.push(label(n));
        }
      });
      out.push({ name, count: items.length, unreachable, offscreen });
    }
    return out;
  });

  let walked = 0, controls = 0;
  for (const s of screens) {
    if (s.error) { fail.push(`${s.name}: could not be opened - ${s.error}`); continue; }
    if (s.empty) { fail.push(`${s.name}: has no focusable control at all`); continue; }
    walked++; controls += s.count;
    if (s.offscreen && s.offscreen.length) {
      fail.push(`${s.name}: ${s.offscreen.length} focusable control(s) sit off the `
        + `screen - ${s.offscreen.slice(0, 4).join(', ')}`);
    }
    if (s.unreachable.length) {
      fail.push(`${s.name}: ${s.unreachable.length} of ${s.count} controls cannot be `
        + `reached with a pad - ${s.unreachable.slice(0, 4).join(', ')}`
        + (s.unreachable.length > 4 ? ', ...' : ''));
    }
  }

  console.log(fail.length ? fail.join('\n')
    : `ok: arrows walk the grid spatially, ring is ${ring.width} ${ring.style} ${ring.colour},`
      + ` a pointer clears it, and every one of ${controls} controls across `
      + `${walked} screens can be reached with a pad`);
  await b.close();
  process.exitCode = fail.length ? 1 : 0;
})();
