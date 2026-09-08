#!/usr/bin/env node
/* UI guard rail. Walks every surface in the game and checks two rules, both of
 * which have already broken silently once. Neither failure looked like a bug -
 * they looked like design choices - which is why they are tests and not code
 * review notes.
 *
 *   brackets  An element must not both carry .bracketed and define its own
 *             ::before/::after. There are only two pseudo elements and the two
 *             rule sets overwrite each other without warning; the card's
 *             quality arc collapsed to a 14px stub and nothing said so.
 *   scrim     The "more below" scrim must be off wherever the content fits.
 *             It once latched onto a transient first-layout measurement and
 *             painted a 44px black band across the feet of three level-up
 *             cards that fit perfectly well.
 *   progress  Every pane must survive a FULLY PROGRESSED save, not just the
 *             fresh one a test naturally starts from. That gap shipped a bug:
 *             the Trainer draws one cell per rank, Curious Egg goes to a
 *             hundred, and a hundred cells squeezed the name column to a
 *             two-letter word and stretched its row to a quarter of the page.
 *             Nothing in a fresh save shows it, because nothing there is
 *             bought. So this walks the panes with everything unlocked and
 *             ranks spent, and fails on rows of wildly unequal height or any
 *             element wider than the box holding it.
 *   banish    Arming banish must move nothing. It used to rebuild the whole
 *             overlay: the shell animation replayed, all three cards dealt
 *             themselves in again, the scroll port re-measured (a scrollbar
 *             flashing in and out), and the footer resized as the hint
 *             appeared. The player asked which card to remove and the screen
 *             answered by reloading itself.
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

  const seen = new Set();

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

  /* The scrim promises there is more below. If the surface does not scroll,
     that promise is a dark band over content the player can already see. */
  const scanScrim = () => page.evaluate(() => {
    const bad = [];
    for (const body of document.querySelectorAll('.overlay-body')) {
      const slack = body.scrollHeight - body.clientHeight;
      const lit = body.classList.contains('has-more');
      if (lit && slack <= 2) bad.push(`scrim lit with ${slack}px to scroll`);
      if (!lit && slack > 2 && body.scrollTop < slack - 2) {
        bad.push(`scrim dark with ${slack}px still below`);
      }
    }
    return bad;
  });

  const check = async (where) => {
    (await scan()).forEach((x) => seen.add(where + ' ' + x));
    (await scanScrim()).forEach((x) => seen.add(where + ' ' + x));
  };

  await page.evaluate(() => { WS.Save.unlockAll(); WS.UI.openMenu(); });
  await page.waitForTimeout(250);
  for (const t of ['roster', 'battlefields', 'trainer', 'codex', 'bestiary', 'stats', 'settings']) {
    await page.evaluate((x) => { WS.UI.tab = x; WS.UI.openMenu(); }, t);
    await page.waitForTimeout(120);
    await check('menu/' + t);
  }
  await page.evaluate(() => { WS.Game.startRun('thornhollow', 'mage'); });
  await page.waitForTimeout(300);
  await check('blessing');
  await page.click('.card'); await page.waitForTimeout(200);
  await page.evaluate(() => { WS.Game.pendingLevelUps = 1; WS.Game.openLevelUp(); });
  await page.waitForTimeout(250);
  await check('levelup');
  await page.evaluate(() => { WS.Game.chooseLevelUp(WS.Game.levelChoices[0]); WS.Game.pause(); });
  await page.waitForTimeout(250);
  await check('pause');
  await page.evaluate(() => { WS.Game.endRun('defeated'); });
  await page.waitForTimeout(250);
  await check('defeat');

  /* A fully progressed save: unlocked, ranked, discovered. */
  const scanProgress = (where) => page.evaluate((where) => {
    const bad = [];
    // Rows in one list should agree on height; a blowout is one row that does not.
    for (const list of document.querySelectorAll('#overlay .rows, #overlay .pick-grid')) {
      const kids = [...list.children].filter((k) => k.offsetParent !== null);
      if (kids.length < 2) continue;
      /* An OUTLIER, not variation. Settings rows legitimately come in two
         heights depending on whether a setting carries a description, and a
         pick tile grows when its name wraps - neither is a bug. What a
         blowout looks like is one row several times the median, which is
         what a hundred rank cells did to Curious Egg. */
      const hs = kids.map((k) => k.getBoundingClientRect().height).sort((a, b) => a - b);
      const median = hs[Math.floor(hs.length / 2)];
      const hi = hs[hs.length - 1];
      if (median > 0 && hi > median * 1.8) {
        const worst = kids.find((k) => k.getBoundingClientRect().height === hi);
        bad.push(`${where}: a row in .${list.className} is ${Math.round(hi)}px against a`
          + ` ${Math.round(median)}px median - "`
          + `${(worst.textContent || '').trim().split('\n')[0].slice(0, 30)}" has blown the layout out`);
      }
    }
    // Nothing may be wider than what holds it.
    for (const n of document.querySelectorAll('#overlay *')) {
      if (n.scrollWidth > n.clientWidth + 2 && getComputedStyle(n).overflowX === 'visible') {
        const r = n.getBoundingClientRect();
        if (r.width > 0) bad.push(`${where}: .${n.className} overflows horizontally` +
          ` (${n.scrollWidth} in ${n.clientWidth})`);
      }
    }
    return bad;
  }, where);

  await page.evaluate(() => {
    WS.Save.unlockAll();
    WS.Save.db.gold = 999999;
    for (const id of WS.MetaUpgradeOrder) {
      for (let i = 0; i < 200 && WS.Save.metaCost(id) !== null; i++) WS.Save.buyMeta(id);
    }
    WS.AchievementOrder.forEach((id) => { WS.Save.db.achievements[id] = true; });
    WS.ComboOrder.forEach((id) => { WS.Save.db.combos[id] = true; });
    Object.keys(WS.Enemies).forEach((id) => { WS.Save.stats.bestiary[id] = 1234; });
    Object.keys(WS.Bosses).forEach((id) => { WS.Save.stats.bosses[id] = 12; });
    WS.MapOrder.forEach((id) => { WS.Save.stats.bestTime[id] = 1800; });
  });
  for (const t of ['roster', 'battlefields', 'trainer', 'codex', 'bestiary', 'stats', 'settings']) {
    await page.evaluate((x) => { WS.UI.tab = x; WS.UI.openMenu(); }, t);
    await page.waitForTimeout(160);
    (await scanProgress('maxed/' + t)).forEach((x) => seen.add(x));
    (await scan()).forEach((x) => seen.add('maxed/' + t + ' ' + x));
  }

  /* Arming banish is a mode change, not new content: nothing may move. */
  await page.evaluate(() => { WS.Game.startRun('thornhollow', 'mage'); });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const c = document.querySelector('#overlay:not(.hidden) .card'); if (c) c.click();
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    WS.Game.player.banishes = 2; WS.Game.player.rerolls = 2;
    WS.Game.leveling = false; WS.Game.pendingLevelUps = 1; WS.Game.openLevelUp();
  });
  await page.waitForTimeout(900);              // let the deal animation settle
  const geometry = () => page.evaluate(() => {
    const box = (n) => { const r = n.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
    const body = document.querySelector('#overlay .overlay-body');
    return {
      cards: [...document.querySelectorAll('#overlay .card')].map(box),
      inner: box(document.querySelector('.overlay-inner')),
      bar: box(document.querySelector('.choice-bar')),
      names: [...document.querySelectorAll('#overlay .card-name')].map((n) => n.textContent),
      scrollable: body.scrollHeight > body.clientHeight,
    };
  });
  /* Stamp the live nodes, then arm banish and see whether the same nodes are
     still there. Node identity is the precise question - "was anything
     rebuilt?" - and unlike geometry it cannot be satisfied by a rebuild that
     happens to settle back to the same pixels, which is exactly how an earlier
     version of this check passed while the bug was still in. */
  const before = await geometry();
  if (!before.cards.length) seen.add('banish: no level-up cards to test against');
  else {
    await page.evaluate(() => {
      document.querySelectorAll('#overlay .card').forEach((c, i) => { c.dataset.stamp = 'c' + i; });
      document.querySelector('.overlay-inner').dataset.stamp = 'shell';
      document.querySelector('.choice-bar').dataset.stamp = 'bar';
    });
    await page.click('.choice-bar .btn:nth-child(2)');
    await page.waitForTimeout(600);
    const survived = await page.evaluate(() => ({
      cards: [...document.querySelectorAll('#overlay .card')].map((c) => c.dataset.stamp || 'NEW'),
      shell: (document.querySelector('.overlay-inner') || {}).dataset?.stamp || 'NEW',
      bar: (document.querySelector('.choice-bar') || {}).dataset?.stamp || 'NEW',
      armed: !!document.querySelector('.card-row.banish-mode'),
    }));
    if (survived.shell === 'NEW') seen.add('banish: arming it rebuilt the overlay shell');
    if (survived.bar === 'NEW') seen.add('banish: arming it rebuilt the button bar');
    if (survived.cards.includes('NEW')) {
      seen.add(`banish: arming it re-dealt the cards (${survived.cards.join(',')})`);
    }
    if (!survived.armed) seen.add('banish: arming it did not put the row into banish mode');

    const after = await geometry();
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    for (const k of ['cards', 'inner', 'bar', 'names']) {
      if (!same(before[k], after[k])) {
        seen.add(`banish: arming it changed ${k} - ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`);
      }
    }
    if (after.scrollable) seen.add('banish: arming it made the body scrollable');
  }

  console.log(seen.size ? [...seen].join('\n')
    : 'ok: no bracket collisions, no false scrims, a maxed save lays out clean,'
      + ' arming banish moves nothing');
  await b.close();
  process.exitCode = seen.size ? 1 : 0;
})();
