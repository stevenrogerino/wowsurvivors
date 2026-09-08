#!/usr/bin/env node
/* UI guard rail. Walks every surface in the game and checks the one rule that
 * has already broken silently once: an element must not both carry .bracketed
 * and define its own ::before/::after, because there are only two pseudo
 * elements and the two rule sets overwrite each other without warning. A
 * collapsed quality arc looks like a design choice, not a bug, which is why
 * this is a test and not a code review note.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-ui.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1440, height: 810 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(700);

  const scan = () => page.evaluate(() => {
    const bad = [];
    for (const n of document.querySelectorAll('.bracketed')) {
      // A bracket is exactly 14x14 with one horizontal and one vertical border.
      for (const pseudo of ['::before', '::after']) {
        const cs = getComputedStyle(n, pseudo);
        if (cs.content === 'none') continue;
        const w = parseFloat(cs.width), h = parseFloat(cs.height);
        const hasBorder = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) > 0;
        const hasBg = cs.backgroundImage !== 'none';
        if (hasBg || !hasBorder || w !== 14 || h !== 14) {
          bad.push(`${n.className}${pseudo} -> ${w}x${h} border=${hasBorder} bg=${hasBg}`);
        }
      }
    }
    return bad;
  });

  const seen = new Set();
  await page.evaluate(() => { WS.Save.unlockAll(); WS.UI.openMenu(); });
  await page.waitForTimeout(250);
  for (const t of ['roster', 'battlefields', 'trainer', 'codex', 'bestiary', 'stats', 'settings']) {
    await page.evaluate((x) => { WS.UI.tab = x; WS.UI.openMenu(); }, t);
    await page.waitForTimeout(120);
    (await scan()).forEach((x) => seen.add('menu/' + t + ' ' + x));
  }
  await page.evaluate(() => { WS.Game.startRun('elwynn', 'mage'); });
  await page.waitForTimeout(300);
  (await scan()).forEach((x) => seen.add('blessing ' + x));
  await page.click('.card'); await page.waitForTimeout(200);
  await page.evaluate(() => { WS.Game.pendingLevelUps = 1; WS.Game.openLevelUp(); });
  await page.waitForTimeout(250);
  (await scan()).forEach((x) => seen.add('levelup ' + x));
  await page.evaluate(() => { WS.Game.chooseLevelUp(WS.Game.levelChoices[0]); WS.Game.pause(); });
  await page.waitForTimeout(250);
  (await scan()).forEach((x) => seen.add('pause ' + x));
  await page.evaluate(() => { WS.Game.endRun('defeated'); });
  await page.waitForTimeout(250);
  (await scan()).forEach((x) => seen.add('defeat ' + x));

  console.log(seen.size ? [...seen].join('\n') : 'no bracket collisions');
  await b.close();
  process.exitCode = seen.size ? 1 : 0;
})();
