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
 *   framing   A bordered frame must never be the thing that scrolls. The run
 *             summary's panels carried the border, the inlay hairline and both
 *             corner brackets AND did their own scrolling, which meant the
 *             scrollbar was painted at the panel's own right edge - straight
 *             over the border - and the bottom-right bracket, being absolutely
 *             positioned inside a scroller, slid up out of its corner as you
 *             read. The edging came apart exactly when a build got interesting
 *             enough to overflow. The frame and the scroller are now two
 *             elements, and this fails the build if they are ever merged back.
 *   ledger    Every number the player budgets against must track the save it
 *             is drawn from. The menu footer's "Banked" total was built once
 *             when the menu opened and never touched again, while the Trainer
 *             - the only screen in the game that spends gold - redrew itself
 *             on every purchase. Measured: 100,000g, buy a 200g rank, the shop
 *             updates its prices and the footer still reads 100.0kg until the
 *             page is reloaded. A shop whose displayed balance is a lie is a
 *             shop nobody can plan a purchase in.
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
  /* A fresh profile gets the prologue, and its layer covers the whole screen -
     which is the point of it. A harness has to walk past it before it can
     drive anything, and this one clicks real buttons. */
  await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
  });

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

  /* Never measure a surface that is still moving.
   *
   * Every overlay deals itself in with a translate, and while that runs the
   * scroll geometry is briefly wrong: a level-up whose three cards fit exactly
   * reports 14px of overflow for the first few frames and settles to 0. The
   * scrim keys off an IntersectionObserver, which sees where the content
   * actually IS, so it correctly stays dark - and the check, reading
   * scrollHeight, called that a missing scrim. The two disagreed only because
   * one of them was asked during an animation. So wait for the geometry to
   * stop changing before asking anything, and a fixed sleep never has to be
   * guessed at again. */
  const settle = () => page.evaluate(() => new Promise((done) => {
    let last = null, still = 0, frames = 0;
    const tick = () => {
      const now = [...document.querySelectorAll('.overlay-body')]
        .map((b) => `${b.scrollHeight}/${b.clientHeight}`).join(',');
      still = now === last ? still + 1 : 0;
      last = now;
      // Three identical frames, or a second of trying: whichever comes first,
      // so an infinitely animating surface cannot hang the run.
      if (still >= 3 || ++frames > 60) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));

  const check = async (where) => {
    await settle();
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

  /* ---- the menu may not offer a mode the run will not be in --------------
   * Hyper is armed by one account-wide flag and applied per battlefield, so
   * the footer button and the run it starts can disagree - and for a long time
   * they did: armed, on a battlefield you had not won, the button read
   * "Hyper: ON" and Begin Run started an ordinary run. The summary afterwards
   * was honest, so the only place it lied was the moment you were choosing.
   *
   * The rule is the invariant rather than the wording: whatever the button
   * says about the selected battlefield has to be what run.hyper comes out as
   * on that battlefield. That survives somebody rewriting the label, and it
   * catches a drift in either direction. */
  const modes = await page.evaluate(() => {
    WS.Save.unlockAll();
    WS.Save.db.unlocks.hyper = { thornhollow: true };   // won on exactly one
    WS.Save.db.hyperArmed = true;
    const find = () => [...document.querySelectorAll('#overlay .overlay-foot button')]
      .find((b) => /hyper/i.test(b.textContent));
    const rows = [];
    for (const id of WS.MapOrder) {
      WS.Game.quitToMenu();
      WS.Game.selection.map = id;
      WS.UI.openMenu();
      if (WS.UI.syncModes) WS.UI.syncModes();
      const b = find();
      if (!b) { rows.push({ id, missing: true }); continue; }
      const row = { id, said: /\bON\b/.test(b.textContent), label: b.textContent,
        disabled: b.disabled, tip: b.title };
      WS.Game.startRun(id, 'mage');
      row.real = !!WS.Game.run.hyper;
      rows.push(row);
    }
    WS.Game.quitToMenu();
    return rows;
  });
  for (const r of modes) {
    if (r.missing) { seen.add('hyper: there is no Hyper control in the menu footer'); continue; }
    if (r.said !== r.real) {
      seen.add(`hyper: the menu says "${r.label}" for ${r.id} and the run comes out `
        + `hyper=${r.real} - the footer describes a different run from the one Begin Run `
        + 'starts');
    }
    if (!r.real && !r.disabled) {
      seen.add(`hyper: ${r.id} cannot be a Hyper run and its button is still live`);
    }
    if (r.disabled && !r.tip) {
      seen.add(`hyper: the button is disabled on ${r.id} and does not say why`);
    }
  }
  await page.evaluate(() => { WS.Save.reset(); WS.Save.db.seenManual = true; WS.UI.openMenu(); });
  await page.waitForTimeout(200);

  /* Arming banish is a mode change, not new content: nothing may move. */
  await page.evaluate(() => { WS.Game.startRun('thornhollow', 'mage'); });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const c = document.querySelector('#overlay:not(.hidden) .card'); if (c) c.click();
  });
  // Long enough for the commit beat AND the overlay's fade out to finish;
  // forcing a level-up on top of a half-resolved blessing is not the test.
  await page.waitForTimeout(500);
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
  /* Park the pointer in a corner first. A hovered card lifts five pixels -
     that is the point of it - and this harness had just clicked a card, so the
     "before" sample was taken with the cursor still resting on one and the
     "after" sample with it over the banish button. The five pixels that showed
     up were the hover releasing, not the mode change moving anything. */
  await page.mouse.move(3, 3);
  await page.waitForTimeout(260);
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

  /* ---- ledger: the footer total follows the purchases ------------------- *
   * Driven through real clicks on the real buttons, because the bug was
   * precisely that the code which changes the gold and the code which prints
   * it were never wired together - anything that calls a redraw by hand would
   * have passed while the bug was in. Three buys in a row, so a stale readout
   * cannot coincidentally match by being one purchase behind.
   *
   * NEGATIVE TEST: with the footer built once (the shipped bug), this reports
   * "ledger: 3 purchases spent 700g and the footer never moved off 100.0kg". */
  const ledger = await page.evaluate(async () => {
    WS.Game.state = 'menu';
    // The progress walk above deliberately maxes every rank, which leaves the
    // Trainer with nothing to sell. Roll it back so there is something to buy.
    WS.Save.db.meta = {};
    WS.Save.db.gold = 100000;
    WS.UI.tab = 'trainer';
    WS.UI.openMenu();
    await new Promise((r) => requestAnimationFrame(r));
    const read = () => (document.querySelector('.overlay-foot .bank .v') || {}).textContent;
    const steps = [];
    for (let i = 0; i < 3; i++) {
      const gold = WS.Save.db.gold, shown = read();
      const buy = document.querySelector('.overlay-body .btn.buy:not([disabled])');
      if (!buy) break;
      buy.click();
      await new Promise((r) => requestAnimationFrame(r));
      steps.push({
        gold, shown, spent: gold - WS.Save.db.gold, now: WS.Save.db.gold,
        nowShown: read(), want: WS.formatNumber(WS.Save.db.gold) + 'g',
      });
    }
    return steps;
  });
  if (ledger.length < 3) {
    seen.add(`ledger: only ${ledger.length} of 3 trainer purchases went through`);
  }
  const spent = ledger.reduce((t, s2) => t + s2.spent, 0);
  const moved = ledger.some((s2) => s2.nowShown !== s2.shown);
  if (spent <= 0) seen.add('ledger: the trainer purchases cost nothing');
  else if (!moved) {
    seen.add(`ledger: ${ledger.length} purchases spent ${spent}g and the footer `
      + `never moved off ${ledger[0].shown}`);
  }
  for (const st of ledger) {
    if (st.nowShown !== st.want) {
      seen.add(`ledger: ${st.now}g banked but the footer reads ${st.nowShown} (want ${st.want})`);
    }
  }

  /* ---- framing: nothing with an edge may scroll ------------------------- *
   * Walked on the run summary and the pause build sheet, which are where the
   * panels live and where the overflow actually happens.
   *
   * NEGATIVE TEST: moving the scroll back onto the panel reports
   * "framing: a .panel bracketed carries the border AND 203px of scroll". */
  const framing = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    WS.Game.state = 'playing';
    WS.Game.endRun(false);
    await sleep(400);
    const bad = [];
    let panels = 0, scrollers = 0;
    for (const n of document.querySelectorAll('.panel, .bracketed, .card')) {
      const over = n.scrollHeight - n.clientHeight;
      panels++;
      const cs = getComputedStyle(n);
      const bordered = parseFloat(cs.borderTopWidth) > 0
        || n.classList.contains('bracketed');
      if (bordered && over > 2) {
        bad.push(`a .${n.className} carries the border AND ${over}px of scroll`);
      }
    }
    for (const n of document.querySelectorAll('.panel-scroll')) {
      if (n.scrollHeight - n.clientHeight > 2) scrollers++;
    }
    return { bad, panels, scrollers };
  });
  for (const b of framing.bad) seen.add('framing: ' + b);
  if (framing.scrollers === 0) {
    seen.add('framing: no panel actually overflowed, so the check proved nothing');
  }

  console.log(seen.size ? [...seen].join('\n')
    : 'ok: no bracket collisions, no false scrims, a maxed save lays out clean,'
      + ` the Hyper control agrees with the run it starts on all ${modes.length} `
      + 'battlefields,'
      + ` arming banish moves nothing, and ${ledger.length} purchases totalling `
      + `${spent}g each land on the footer's banked total, and `
      + `${framing.panels} framed surfaces scroll from the inside`);
  await b.close();
  process.exitCode = seen.size ? 1 : 0;
})();
