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

  /* ---------------------------------------------------------------- room --
   * The beat must not reorganise the screen it is playing on.
   *
   * It lifts the chosen card and shrinks the others, and transformed content
   * still counts toward a scroll container's overflow area - so with the row
   * sized exactly to the cards those few pixels escaped the port. Measured:
   * scrollHeight went 316 -> 318 against a clientHeight of 316, flashing a
   * scrollbar in for the length of the beat, and the chosen card's top landed
   * twelve pixels above the top of the port and was clipped there, at exactly
   * the moment it is meant to be the thing you are looking at.
   *
   * Both halves are one question - does anything leave the box - so both are
   * asked here, before and during. */
  /* The states are put on by hand rather than by clicking a card. The beat only
     lasts 155ms and its transform takes 180ms to travel, so a probe hung off a
     real click either samples before anything has moved or races the moment the
     row is re-dealt - measured, a sabotage that reintroduced the overflow
     sailed through at 40ms because the card had shifted two pixels so far. This
     asks the CSS the question directly, and gets to wait for it to finish. */
  const roomBefore = await page.evaluate(() => {
    const body = document.querySelector('.overlay-body');
    return { scrolls: body.scrollHeight > body.clientHeight };
  });
  await page.evaluate(() => {
    document.querySelectorAll('.card')[1].classList.add('chosen');
    document.querySelector('.card-row').classList.add('committing');
  });
  await page.waitForTimeout(280);          // the lift travels for 180ms
  const room = await page.evaluate(() => {
    const body = document.querySelector('.overlay-body');
    const b = body.getBoundingClientRect();
    const cards = [...document.querySelectorAll('.card')].map((c) => c.getBoundingClientRect());
    return {
      scrolls: body.scrollHeight > body.clientHeight,
      over: Math.round(Math.max(0, b.top - Math.min(...cards.map((r) => r.top)))),
      under: Math.round(Math.max(0, Math.max(...cards.map((r) => r.bottom)) - b.bottom)),
    };
  });
  await page.evaluate(() => {
    document.querySelectorAll('.card').forEach((c) => c.classList.remove('chosen'));
    document.querySelector('.card-row').classList.remove('committing');
  });
  await page.waitForTimeout(220);

  // and now the real thing, which the beat check below is about
  await page.evaluate(() => document.querySelectorAll('.card')[1].click());
  await page.waitForTimeout(40);
  if (room.scrolls && !roomBefore.scrolls) {
    fail.push('picking a card makes the screen scroll - the beat pushes the cards past the '
      + 'edge of their own scroll port and a scrollbar flashes in for its duration');
  }
  if (room.over > 0 || room.under > 0) {
    fail.push(`the chosen card is clipped by its scroll port (${room.over}px off the top, `
      + `${room.under}px off the bottom) at the moment it is meant to be what you are `
      + 'looking at');
  }
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
    note.push('the card you pick holds the frame while the two you passed over step back, '
      + 'without pushing anything out of its own scroll port');
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

  /* ---- two blessings, and the second one lands at the halfway mark ------
   * A run used to hand out exactly one, at the start, and never another -
   * even though buildBlessingChoices filters out what you already hold and
   * the survivor keeps a LIST of blessing names. Fourteen of the fifteen
   * never appeared in a run. There is one more now, at fifteen minutes, and
   * the two things worth guarding are that it arrives exactly once and that
   * it HANDS THE RUN BACK: the opening draft starts the waves and this one
   * must not, or a fresh headstart fires in the middle of a fight. */
  const arc = await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Game.startRun('thornhollow', 'shaman');
    const pl = WS.Game.player;
    const at = [];
    let resumedRunning = true;
    for (let i = 0; i < 60 * 60 * 31; i++) {
      if (WS.Game.state === 'blessing') {
        at.push(Math.round(WS.Game.run.time));
        WS.Game.chooseBlessing(WS.Game.blessingChoices[0]);
        if (at.length > 1 && !WS.Game.running) resumedRunning = false;
        continue;
      }
      if (WS.Game.state === 'levelup') { WS.Game.chooseLevelUp(WS.Game.levelChoices[0]); continue; }
      if (WS.Game.state !== 'playing') break;
      pl.health = pl.maxHealth;
      WS.Game.tick(WS.CONST.TICK_RATE);
      // the clock-driven half of the loop, which is where the offer lives
      WS.Game.update(WS.CONST.TICK_RATE);
    }
    return { at, held: pl.blessingNames.slice(), resumedRunning,
      minutes: Math.round(WS.Game.run.time / 60), want: WS.Config.secondBlessingAt };
  });
  if (arc.at.length !== 2) {
    fail.push(`a full run offered ${arc.at.length} blessing drafts, not two (at ${arc.at})`);
  } else {
    if (arc.at[0] !== 0) fail.push(`the opening draft came at ${arc.at[0]}s, not at the start`);
    if (Math.abs(arc.at[1] - arc.want) > 2) {
      fail.push(`the second blessing came at ${arc.at[1]}s rather than ${arc.want}s`);
    }
    if (arc.held.length !== 2 || arc.held[0] === arc.held[1]) {
      fail.push(`the second draft did not add a different blessing (${arc.held.join(', ')})`);
    }
    if (!arc.resumedRunning) fail.push('the midpoint draft stopped the run instead of pausing it');
    if (arc.minutes < 30) fail.push(`the run ended at ${arc.minutes} minutes`);
    note.push(`a run draws two blessings, at ${arc.at[0]}s and ${arc.at[1]}s, and no more`);
  }

  /* ---- a card says what it is and what it will do -----------------------
   * A card gave a name, a rank as text, and a sentence. Two things were
   * missing and both are the game's own subject matter.
   *
   * Escalation: a card taking a weapon to its LAST rank looked exactly like
   * one taking a passive to its second. Rank is a row of pips now, and a card
   * that finishes a track - a final rank, an evolution, a union - is crowned.
   *
   * Reaction: this whole game is things combining. A weapon and a passive
   * become an evolution, two weapons a discovery, two evolutions a union -
   * and the card said none of it. A survivor holding Cinderfall and offered
   * Rimeshard was being offered Frostfire with no way to know. */
  const cards = await page.evaluate(async () => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Game.startRun('thornhollow', 'shaman');
    if (WS.Game.state === 'blessing') WS.Game.chooseBlessing(WS.Game.blessingChoices[0]);
    const pl = WS.Game.player;
    pl.weapons.length = 0; pl.weaponLevels = {}; pl.combosActive = {};
    WS.Player.addWeapon(pl, 'cinderfall');
    WS.Player.getWeapon(pl, 'cinderfall').level = 7; pl.weaponLevels.cinderfall = 7;
    pl.upgradeLevels = { area: 1 };
    const W = WS.Weapons;
    const mine = [
      // finishes a track: should be crowned, all pips lit
      { type: 'weapon_rank', id: 'cinderfall', art: W.cinderfall.art, name: W.cinderfall.name,
        description: 'x', note: 'Rank 7 > 8', rank: 8, maxRank: 8,
        reacts: WS.LevelUp.reactionsFor(pl, 'cinderfall', 'weapon_rank', 8) },
      // mid-track: plain
      { type: 'new_weapon', id: 'knifestorm', art: W.knifestorm.art, name: W.knifestorm.name,
        description: 'x', note: 'New', rank: 1, maxRank: 8,
        reacts: WS.LevelUp.reactionsFor(pl, 'knifestorm', 'new_weapon', 1) },
      // completes a discovery with what is already carried: a READY reaction
      { type: 'new_weapon', id: 'rimeshard', art: W.rimeshard.art, name: W.rimeshard.name,
        description: 'x', note: 'New', rank: 1, maxRank: 8,
        reacts: WS.LevelUp.reactionsFor(pl, 'rimeshard', 'new_weapon', 1) },
    ];
    WS.UI.openLevelUp(mine);
    /* The page's frame loop is live and the opening headstart's settle timer
       re-deals a few frames after this runs, over anything set here. */
    await new Promise((r) => setTimeout(r, 700));
    WS.Game.settle = 0; WS.Game.pendingLevelUps = 0; WS.Game.leveling = false;
    WS.UI.fillLevelChoices(mine);
    await new Promise((r) => setTimeout(r, 200));
    const els = [...document.querySelectorAll('#overlay .card')];
    return els.map((c) => ({
      name: (c.querySelector('.card-name') || {}).textContent,
      crowning: c.classList.contains('crowning'),
      pips: c.querySelectorAll('.card-pips i').length,
      lit: c.querySelectorAll('.card-pips i.on').length,
      reacts: c.querySelectorAll('.card-reacts .react').length,
      ready: c.querySelectorAll('.card-reacts .react.ready').length,
    }));
  });
  if (cards.length !== 3) {
    fail.push(`the card probe rendered ${cards.length} cards, not three`);
  } else {
    const [last, mid, disc] = cards;
    if (!last.crowning) fail.push('a card taking a weapon to its last rank is not crowned');
    if (last.pips !== 8 || last.lit !== 8) {
      fail.push(`the final-rank card shows ${last.lit}/${last.pips} pips lit, not 8 of 8`);
    }
    if (mid.crowning) fail.push('a mid-track card is crowned, so crowning says nothing');
    if (mid.pips !== 8 || mid.lit !== 1) {
      fail.push(`a rank-1 card shows ${mid.lit}/${mid.pips} pips lit, not 1 of 8`);
    }
    if (!disc.reacts) fail.push('a card that completes a discovery lists no reactions');
    if (!disc.ready) {
      fail.push('a card that completes a discovery with a weapon already carried does not '
        + 'mark it as available - the player cannot tell it from one they cannot have yet');
    }
    if (mid.ready) {
      fail.push('a card marks a reaction as available that the player has nothing for');
    }
    note.push(`a card carries its rank as ${last.pips} pips, crowns the one that finishes a `
      + 'track, and names what it will react with');
  }

  /* ...and the strip says which weapon is ready to go somewhere. */
  const strip = await page.evaluate(() => {
    const pl = WS.Game.player;
    pl.weapons.length = 0; pl.weaponLevels = {}; pl.combosActive = {};
    WS.Player.addWeapon(pl, 'cinderfall');
    WS.Player.addWeapon(pl, 'knifestorm');
    WS.Player.getWeapon(pl, 'cinderfall').level = 8; pl.weaponLevels.cinderfall = 8;
    WS.Player.getWeapon(pl, 'knifestorm').level = 3; pl.weaponLevels.knifestorm = 3;
    pl.upgradeLevels = { area: 1 };
    WS.UI.rebuildWeapons();
    const s = [...document.querySelectorAll('.wslot')].slice(0, 2);
    return s.map((x) => ({ pip: !!x.querySelector('.slot-pip'),
      says: /Ready to evolve/.test(x.title || '') }));
  });
  if (!strip[0] || !strip[0].pip || !strip[0].says) {
    fail.push('a weapon at its last rank with its paired passive learned shows nothing on '
      + 'the HUD to say it is one level-up from evolving');
  }
  if (strip[1] && strip[1].pip) {
    fail.push('a weapon with nowhere to go is marked ready on the HUD');
  }

  await b.close();

  if (fail.length) {
    console.log('FAIL');
    for (const f of fail) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('OK  ' + note.join('; ') + '.');
})();
