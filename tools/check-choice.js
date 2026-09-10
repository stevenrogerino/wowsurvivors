#!/usr/bin/env node
/* The choice screens: level-up, and the opening blessing draft.
 *
 * This is the only place in the game where the player stops and decides
 * something, and it was the roughest surface in the build. Five separate
 * things were wrong with it and not one of them looked like a bug - they
 * looked like the way the screen was meant to be. All five are measured here
 * so they cannot come back quietly.
 *
 *   lift    Hovering a card must move it. It did not. `card-in` animated
 *           `transform` with fill-mode `both`, so its last keyframe -
 *           transform: none - kept applying for the life of the card, and a
 *           CSS animation outranks a normal declaration: the hover rule
 *           `transform: translateY(-5px)` was in the stylesheet, was matched,
 *           and was never applied. Measured: hovering a level-up card moved it
 *           0.00 pixels. The deal now moves `translate`/`scale`, which compose
 *           with `transform` instead of replacing it.
 *
 *   frame   Two levels at once must keep the frame. Gaining two levels off one
 *           gem is the most ordinary event in this game, and it used to tear
 *           the screen down between them - a new shell handed to show(), the
 *           overlay animation replayed, the scroll port re-measured. Measured:
 *           the .overlay-inner after the first pick was a different element
 *           from the one before it.
 *
 *   beat    A pick must be answered before it resolves. Clicking a card used
 *           to make the entire screen cease to exist on the next frame. The
 *           card now holds the frame for ~155ms while the world is still
 *           frozen, so the beat is free.
 *
 *   exit    The overlay must leave over time. It was `classList.add('hidden')`
 *           and `innerHTML = ''` in the same statement, which snapped a 4px
 *           backdrop blur and a black scrim off the battlefield in one frame.
 *
 *   settle  The world must slow into the choice. game.js has claimed since it
 *           was written that timeScale "ramps down into a level-up and back
 *           out of it"; only the ramp out was ever built. The battlefield went
 *           from full speed to frozen between two frames.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-choice.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const fail = [];
const note = [];

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1440, height: 810 } });
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(700);
  await page.evaluate(() => { if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish(); });

  const intoRun = () => page.evaluate(() => {
    WS.Game.startRun('thornhollow', 'mage');
    WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
  });

  /* ------------------------------------------------------------- settle --
   * Sampled per animation frame from the moment a level is owed. The world has
   * to be seen at speeds between 1 and 0 while still playing; a build that
   * jumps straight to the menu never reports one. */
  await intoRun();
  await page.waitForTimeout(500);
  const settle = await page.evaluate(async () => {
    const t = [];
    WS.Game.pendingLevelUps = 1;
    WS.Game.openLevelUp();
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      t.push({ s: WS.Game.state, ts: WS.Game.timeScale });
      if (WS.Game.state === 'levelup' && i > 2) break;
    }
    return t;
  });
  const slowed = settle.filter((f) => f.s === 'playing' && f.ts < 0.95 && f.ts > 0.02);
  const slowest = Math.min(...settle.filter((f) => f.s === 'playing').map((f) => f.ts), 1);
  if (slowed.length < 3) {
    fail.push(`settle: the world stops dead in front of a level-up - only ${slowed.length}`
      + ' frame(s) ran at a reduced speed before the cards arrived');
  } else {
    note.push(`the world takes ${slowed.length} frames to come to a stop before the cards`
      + ` (down to ${(slowest * 100).toFixed(0)}% speed)`);
  }
  if (!settle.some((f) => f.s === 'levelup')) fail.push('settle: the level-up never opened');

  /* --------------------------------------------------------------- lift -- */
  await page.waitForTimeout(300);
  const first = await page.$('.card');
  if (!first) { fail.push('lift: no cards on screen'); }
  else {
    const before = await first.boundingBox();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.waitForTimeout(350);
    const after = await (await page.$('.card')).boundingBox();
    const dy = after.y - before.y;
    if (dy > -2) {
      fail.push(`lift: hovering a card moves it ${dy.toFixed(2)}px - the hover rule is being`
        + ' overridden by the deal-in animation (fill-mode both on transform)');
    } else {
      note.push(`a hovered card lifts ${(-dy).toFixed(1)}px`);
    }
    await page.mouse.move(4, 4);
    await page.waitForTimeout(250);
  }

  /* --------------------------------------------------------- beat, frame --
   * Two levels are owed. Picking the first must (a) hold the chosen card for a
   * beat with the overlay still up, and (b) land in the SAME shell. */
  await page.evaluate(() => { WS.Game.pendingLevelUps = 2; });
  await page.waitForTimeout(60);
  const staged = await page.evaluate(() => {
    // Re-open so the heading counts against a known number of pending levels.
    WS.Game.leveling = false;
    WS.Game.presentLevelUp();
    window.__inner = document.querySelector('.overlay-inner');
    return { pending: WS.Game.pendingLevelUps,
      sub: document.querySelector('.overlay-head .sub').textContent };
  });
  if (!/more after this one/.test(staged.sub)) {
    fail.push(`beat: with ${staged.pending} levels owed the subtitle reads "${staged.sub}"`);
  }
  await page.waitForTimeout(420);

  await page.evaluate(() => document.querySelectorAll('.card')[1].click());
  await page.waitForTimeout(40);
  const beat = await page.evaluate(() => ({
    chosen: document.querySelectorAll('.card.chosen').length,
    dimmed: !!document.querySelector('.card-row.committing'),
    up: !document.getElementById('overlay').classList.contains('hidden'),
    state: WS.Game.state,
  }));
  if (!beat.chosen || !beat.dimmed || !beat.up) {
    fail.push('beat: a pick is not acknowledged - 40ms after the click, chosen='
      + beat.chosen + ' dimmed=' + beat.dimmed + ' overlay up=' + beat.up);
  } else {
    note.push('the card you pick holds the frame while the two you passed over step back');
  }

  await page.waitForTimeout(420);
  const frame = await page.evaluate(() => ({
    same: window.__inner === document.querySelector('.overlay-inner'),
    inDoc: document.contains(window.__inner),
    cards: document.querySelectorAll('.card').length,
    committing: !!document.querySelector('.card-row.committing'),
    state: WS.Game.state,
  }));
  if (frame.state !== 'levelup') {
    fail.push('frame: the second of two owed levels never opened (state ' + frame.state + ')');
  } else if (!frame.same) {
    fail.push('frame: the second of two stacked level-ups rebuilt the whole screen -'
      + ' the overlay panel is a different element and the one before it left the document'
      + ' (' + frame.inDoc + ')');
  } else {
    note.push('a second owed level re-deals three cards into the frame that is already up');
  }
  if (frame.committing) fail.push('frame: the re-dealt cards are still wearing the dimmed state');

  /* --------------------------------------------------------------- exit -- */
  const exit = await page.evaluate(async () => {
    const o = document.getElementById('overlay');
    const seen = [];
    document.querySelector('.card').click();
    for (let i = 0; i < 26; i++) {
      await new Promise((r) => setTimeout(r, 20));
      seen.push(o.classList.contains('hidden') ? 'gone'
        : (o.classList.contains('leaving') ? 'leaving' : 'up'));
    }
    return seen;
  });
  const leaving = exit.filter((v) => v === 'leaving').length;
  if (leaving < 3) {
    fail.push(`exit: the overlay is cut rather than faded - ${leaving} sample(s) of 20ms`
      + ' caught it on its way out');
  } else {
    note.push(`the overlay fades out over ~${leaving * 20}ms instead of vanishing in a frame`);
  }
  if (exit[exit.length - 1] !== 'gone') fail.push('exit: the overlay never finished leaving');

  await page.waitForTimeout(200);
  const back = await page.evaluate(() => ({
    state: WS.Game.state,
    kids: document.getElementById('overlay').childElementCount,
  }));
  if (back.state !== 'playing') fail.push('exit: play did not resume (state ' + back.state + ')');
  if (back.kids !== 0) fail.push('exit: the overlay kept its children after leaving');

  /* ----------------------------------------------------------- blessing --
   * The draft that opens every run runs the same beat, and it is the first
   * screen a new player ever touches. */
  await page.evaluate(() => { WS.Game.quitToMenu(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => WS.Game.startRun('thornhollow', 'mage'));
  await page.waitForTimeout(450);
  const bless = await page.evaluate(async () => {
    const n = document.querySelectorAll('.card').length;
    document.querySelector('.card').click();
    await new Promise((r) => setTimeout(r, 40));
    return { n, chosen: document.querySelectorAll('.card.chosen').length,
      state: WS.Game.state };
  });
  if (bless.n < 1) fail.push('blessing: the draft offered no cards');
  else if (!bless.chosen || bless.state !== 'blessing') {
    fail.push('blessing: the draft resolves without acknowledging the pick'
      + ' (chosen=' + bless.chosen + ' state=' + bless.state + ')');
  } else {
    note.push('the blessing draft answers a pick the same way the level-up does');
  }
  await page.waitForTimeout(500);
  const played = await page.evaluate(() => WS.Game.state);
  if (played !== 'playing') fail.push('blessing: the run did not begin (state ' + played + ')');

  await b.close();

  if (fail.length) {
    console.log('FAIL');
    for (const f of fail) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('OK  ' + note.join('; ') + '.');
})();
