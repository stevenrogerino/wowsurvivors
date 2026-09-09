#!/usr/bin/env node
/* The tuning bench, driven end to end.
 *
 * The bench exists so balance work costs nothing but time: it runs on the
 * machine in front of you, it edits the real game in a frame beside it, and
 * when you save it writes src/data/tuning.js and a patch-notes entry. That is
 * a loop with four places to break silently, so this drives the whole loop
 * rather than any one piece of it:
 *
 *   introspects  The bench is generated from the live WS tables, not written
 *                out by hand, so that a field added to any data file is
 *                tunable the moment it exists. This asserts it really is
 *                reading the game - it counts the editable fields it built
 *                against the fields actually on the objects, and it checks a
 *                value nobody wrote a form for.
 *
 *   live         A number typed in the bench must change the RUNNING game,
 *                not a copy of it.
 *
 *   writes       Save must produce a src/data/tuning.js the game can load,
 *                and patch notes that say what changed in words.
 *
 *   survives     And the point of all of it: reload, and the change is still
 *                there - applied over the shipped data, with the shipped
 *                value still known so it can be put back.
 *
 *   ranks        A boon's card has to say what rank 4 of it is worth, and the
 *                bench must MEASURE that by running the game's own apply()
 *                rather than assuming how ranks stack. Might adds and Haste
 *                multiplies, and the only thing that knows which is a
 *                one-line function on the data. So this checks Might rank 5
 *                is 1.5 and Haste rank 5 is 0.92^5, checks the Trainer's
 *                cumulative gold, and checks the weapon table agrees with
 *                WS.Weapon.preview to the digit.
 *
 *   solving      A rank table is a readout until you can type into it. "I want
 *                rank 8 to do 90 dps" must move the field that produces that
 *                number - and the game's own preview must then say 90.
 *
 *   projections  Three charts, each computed from the game rather than from a
 *                copy of its formulas, each offering a table view, none of
 *                them drawing a series flat because something of a different
 *                magnitude shares its axis, and all of them using the series
 *                colours that were put through the palette validator.
 *
 *   panes        The dividers move and the widths are remembered.
 *
 *   nothing      No control anywhere may read "undefined". Every apply() in
 *   undefined    the game used to render as an editable box containing that
 *                word, because JSON.stringify returns undefined for a
 *                function - and typing in it wrote garbage to the file.
 *
 * It also checks the shipped data files are NOT touched, because that is the
 * promise the override layer makes, and checks a hostile path is refused -
 * a tuning file is data, and data that can reach __proto__ is not data.
 *
 * The check runs against a COPY of the repository, so it never overwrites a
 * tuning file you are actually using.
 *
 * NEGATIVE TESTS, all four confirmed:
 *   - giving the bench a fixed list of weapon fields instead of reading them
 *     fails at "Weapons.seeking_motes.school exists in the game and has no
 *     control in the bench - the bench is not being generated from the data"
 *   - letting the bench record an edit without writing it through fails at
 *     "typing in the bench left the running game at 34, not 45"
 *   - restoring the object-literal forbidden-key list fails at "a tuning path
 *     reached outside the data tables" - which is how that bug was found in
 *     the first place, not a hypothetical
 *   - dropping the server's Origin check fails at "a page on another origin
 *     rewrote src/data/tuning.js"
 *   - having the rank table assume `v x rank` instead of running apply()
 *     fails at "Haste rank 5 shows 5.6, but Haste multiplies - 0.92^5 is
 *     0.659", which is the whole argument for measuring it
 *   - rendering functions as JSON again fails at "Characters.mage.apply ...
 *     render as editable boxes containing \"undefined\""
 *   - dropping CONST and Arena.tuning from the tuning layer fails at "the
 *     engine scalars and the Eclipse Arena fight cannot be tuned"
 *   - making the rank cells read-only again fails at "asked for 90 dps at rank
 *     8 and the game now reports 108.40 - the solve did not land"
 *   - putting the time-to-kill series back on one shared y-axis fails at "a
 *     time-to-kill series is drawn flat (0, 1, 36px tall)", which is exactly
 *     what it looked like before it became small multiples
 *   - swapping in chart colours nobody validated fails by naming them
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-bench.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const { execFileSync, spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const PORT = 8791;                 // not 8770: never fight a bench that is open
const fail = [];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // A scratch copy, so a real tuning session is never clobbered by a test.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'emberbench-'));
  execFileSync('git', ['-C', REPO, 'ls-files', '-z'], { encoding: 'buffer' })
    .toString('utf8').split('\0').filter(Boolean)
    .forEach((rel) => {
      const dst = path.join(work, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(REPO, rel), dst);
    });

  const shippedBefore = fs.readFileSync(path.join(work, 'src/data/weapons.js'), 'utf8');
  const server = spawn(process.execPath, [path.join(work, 'tools', 'bench.js'), String(PORT)],
    { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverErr = '';
  server.stderr.on('data', (d) => { serverErr += d; });
  const stop = () => { try { server.kill(); } catch (e) {} };

  try {
    // Wait for it to answer rather than guessing at a sleep.
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break; } catch (e) {}
      await wait(100);
    }

    const browser = await chromium.launch({
      executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    page.on('pageerror', (e) => fail.push('bench page error: ' + e.message));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => document.querySelectorAll('nav button').length > 5,
      null, { timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector('#main .empty'),
      null, { timeout: 20000 });

    /* ---- introspects ---------------------------------------------------- */
    await page.click('nav button[data-root="Weapons"]');
    await page.waitForTimeout(150);
    const built = await page.evaluate(() => {
      const game = document.querySelector('#frame').contentWindow.WS;
      const cards = [...document.querySelectorAll('#main .entry')];
      const first = cards[0];
      const labels = [...first.querySelectorAll('.field > label')].map((l) => l.title);
      const id = first.dataset.path.split('.')[1];
      return {
        cards: cards.length,
        weapons: Object.keys(game.Weapons).length,
        labels,
        fields: Object.keys(game.Weapons[id]).map((k) => 'Weapons.' + id + '.' + k),
        derived: !!first.querySelector('.ranks'),
      };
    });
    if (built.cards !== built.weapons) {
      fail.push(`the bench built ${built.cards} weapon cards for ${built.weapons} weapons`);
    }
    for (const f of built.fields) {
      if (!built.labels.some((l) => l === f || l.startsWith(f + '.'))) {
        fail.push(`${f} exists in the game and has no control in the bench - the bench `
          + 'is not being generated from the data');
      }
    }
    if (!built.derived) fail.push('the weapon card shows no rank table');

    /* A field NOBODY wrote a form for. If the bench is really introspective,
       inventing a field on a live object makes an editor for it appear. */
    const invented = await page.evaluate(() => {
      const game = document.querySelector('#frame').contentWindow.WS;
      game.Weapons.cinderfall.wobbliness = 3;
      game.Weapons.cinderfall.epithet = 'the slow heavy one';
      document.querySelector('nav button[data-root="Weapons"]').click();
      const card = document.querySelector('#main .entry[data-path="Weapons.cinderfall"]');
      const got = [...card.querySelectorAll('.field > label')].map((l) => l.title);
      const kinds = {};
      for (const k of ['wobbliness', 'epithet']) {
        const lab = [...card.querySelectorAll('.field > label')]
          .find((l) => l.title === 'Weapons.cinderfall.' + k);
        kinds[k] = lab ? lab.nextElementSibling.querySelector('.f').type
          || lab.nextElementSibling.querySelector('.f').tagName.toLowerCase() : null;
      }
      delete game.Weapons.cinderfall.wobbliness;
      delete game.Weapons.cinderfall.epithet;
      return { has: got.filter((g) => /wobbliness|epithet/.test(g)).length, kinds };
    });
    if (invented.has !== 2) {
      fail.push('a field added to a live object did not appear in the bench - it is a '
        + 'hand-written form, not an introspection');
    }
    if (invented.kinds.wobbliness !== 'number' || invented.kinds.epithet !== 'text') {
      fail.push(`the bench typed the invented fields as ${invented.kinds.wobbliness} `
        + `and ${invented.kinds.epithet}, not number and text`);
    }

    /* ---- nothing renders as an editable "undefined" --------------------- */
    /* JSON.stringify hands back undefined for a function, so every apply() in
       the game - and there is one on most upgrades, lessons and blessings -
       rendered as an editable box containing the word "undefined". Typing in
       it wrote garbage into the tuning file. This sweeps every table. */
    const undef = await page.evaluate(() => {
      const bad = [], code = [];
      for (const b of document.querySelectorAll('nav button')) {
        b.click();
        for (const f of document.querySelectorAll('#main .f')) {
          if (f.value === 'undefined' || f.value === '') {
            if (f.value === 'undefined') bad.push(f.closest('.field').querySelector('label').title);
          }
        }
        code.push(...[...document.querySelectorAll('#main .code')].map((c) => c.title));
      }
      return { bad: bad.slice(0, 5), codeShown: code.length };
    });
    if (undef.bad.length) {
      fail.push('these render as editable boxes containing "undefined": '
        + undef.bad.join(', ') + ' - a function is code, not data');
    }
    if (!undef.codeShown) {
      fail.push('no apply() function is shown anywhere - the most useful thing on a '
        + 'boon card is what its number feeds into');
    }

    /* ---- rank tables, measured rather than assumed ----------------------- */
    /* Might adds (rank 5 = 1.5) and Haste multiplies (rank 5 = 0.92^5 = 0.659),
       and the only way to know which is to run the apply(). A bench that
       displayed "v x rank" would get Haste wrong by a third and nobody would
       ever see it. */
    const ranks = await page.evaluate(() => {
      const read = (root, id) => {
        document.querySelector(`nav button[data-root="${root}"]`).click();
        const card = document.querySelector(`#main .entry[data-path="${root}.${id}"]`);
        if (!card) return null;
        card.open = true;
        const t = card.querySelector('.ranks table');
        if (!t) return null;
        return [...t.querySelectorAll('tr')].map((tr) =>
          [...tr.children].map((c) => c.textContent));
      };
      return { might: read('Upgrades', 'might'), haste: read('Upgrades', 'haste'),
        lesson: read('MetaUpgrades', 'meta_might'),
        motes: read('Weapons', 'seeking_motes'),
        live: (() => {
          const g = document.querySelector('#frame').contentWindow.WS;
          return g.Weapon.preview('seeking_motes', 7, false);
        })() };
    });
    for (const [what, rows] of Object.entries(ranks)) {
      if (what !== 'live' && !rows) fail.push(`no rank table on the ${what} card`);
    }
    if (ranks.might && ranks.might[5] && !/^1\.5$/.test(ranks.might[5][1])) {
      fail.push(`Might rank 5 shows ${ranks.might[5][1]}, not 1.5`);
    }
    if (ranks.haste && ranks.haste[5]) {
      const v = parseFloat(ranks.haste[5][1]);
      if (Math.abs(v - Math.pow(0.92, 5)) > 0.002) {
        fail.push(`Haste rank 5 shows ${ranks.haste[5][1]}, but Haste multiplies - `
          + `0.92^5 is ${Math.pow(0.92, 5).toFixed(3)}. The table is assuming how ranks `
          + 'stack instead of running the code');
      }
    }
    if (ranks.lesson && ranks.lesson[10]) {
      const row = ranks.lesson[10];
      if (row[row.length - 1] !== '11000g') {
        fail.push(`the Trainer table says rank 10 of a 200g lesson costs `
          + `${row[row.length - 1]} in total, not 11000g`);
      }
    }
    if (ranks.motes && ranks.live) {
      const row = ranks.motes[7];   // header + ranks 1..6, so this is rank 7
      if (!row || row[0] !== 'rank 7' || +row[1] !== +ranks.live.damage.toFixed(3)) {
        fail.push('the weapon rank table disagrees with WS.Weapon.preview - it is '
          + 'reimplementing the derivation instead of asking the game');
      }
    }

    /* ---- everything the tuning layer allows is reachable ----------------- */
    const reach = await page.evaluate(() => {
      const g = document.querySelector('#frame').contentWindow.WS;
      const nav = [...document.querySelectorAll('nav button')].map((b) => b.dataset.root);
      const missing = g.Tuning.roots.filter((r) => !nav.includes(r));
      // and the two that were reachable from nowhere until the bench looked
      const wrote = g.Tuning.set('CONST.ENEMY_SCALE', 1.5)
        && g.Tuning.set('Arena.tuning.ringDamage', 99);
      const landed = g.CONST.ENEMY_SCALE === 1.5 && g.Arena.tuning.ringDamage === 99;
      g.Tuning.clear('CONST.ENEMY_SCALE'); g.Tuning.clear('Arena.tuning.ringDamage');
      return { missing, wrote, landed,
        restored: g.CONST.ENEMY_SCALE !== 1.5 && g.Arena.tuning.ringDamage !== 99 };
    });
    if (reach.missing.length) {
      fail.push('the tuning layer allows roots the bench never shows: '
        + reach.missing.join(', '));
    }
    if (!reach.wrote || !reach.landed) {
      fail.push('the engine scalars and the Eclipse Arena fight cannot be tuned');
    }
    if (!reach.restored) fail.push('clearing an override did not put the value back');

    /* ---- typing into a rank solves backwards ---------------------------- */
    /* The rank tables show derived numbers, so being able to type "I want rank
       8 to do 90 dps" and have the bench work out the field that produces it
       is the difference between a readout and a tool. This checks the SOLVE,
       not the display: after typing, the game's own preview must return the
       number that was asked for. */
    const solved = await page.evaluate(async () => {
      const game = document.querySelector('#frame').contentWindow.WS;
      document.querySelector('nav button[data-root="Weapons"]').click();
      const card = document.querySelector('#main .entry[data-path="Weapons.rimeshard"]');
      card.open = true;
      const rows = [...card.querySelectorAll('.ranks tr')];
      const row8 = rows.find((r) => r.children[0].textContent === 'rank 8');
      const cell = row8.children[4];                       // the dps column
      const before = game.Weapon.preview('rimeshard', 8, false).dps;
      const step = game.Weapons.rimeshard.rankDamageStep;
      cell.textContent = '90';
      cell.dispatchEvent(new Event('blur'));
      await new Promise((r) => setTimeout(r, 120));
      const out = { before, after: game.Weapon.preview('rimeshard', 8, false).dps,
        stepBefore: step, stepAfter: game.Weapons.rimeshard.rankDamageStep,
        rank1: game.Weapon.preview('rimeshard', 1, false).dps,
        editable: cell.contentEditable === 'true',
        overridden: Object.keys(game.Tuning.overrides).filter((k) => /rimeshard/.test(k)) };
      // Put it back. The save test below counts overrides, and a leftover from
      // this one would quietly make that count a lie.
      for (const k of out.overridden) game.Tuning.clear(k);
      return out;
    });
    if (!solved.editable) fail.push('the rank cells cannot be typed into');
    if (Math.abs(solved.after - 90) > 0.05) {
      fail.push(`asked for 90 dps at rank 8 and the game now reports `
        + `${solved.after.toFixed(2)} - the solve did not land`);
    }
    if (solved.stepAfter === solved.stepBefore) {
      fail.push('typing into rank 8 did not move rankDamageStep');
    }
    if (!solved.overridden.some((k) => /rankDamageStep/.test(k))) {
      fail.push('the solved value was not recorded as an override, so it will not save');
    }

    /* ---- the projections ------------------------------------------------ */
    const viz = await page.evaluate(() => {
      const game = document.querySelector('#frame').contentWindow.WS;
      document.querySelector('nav button[data-root="#charts"]').click();
      const panels = [...document.querySelectorAll('#main .viz')];
      const cs = getComputedStyle(panels[0] || document.body);
      const marks = panels.map((p) =>
        p.querySelectorAll('svg circle, svg rect[rx], svg path').length);
      // every chart offers a table
      let tables = 0;
      for (const p of panels) {
        const b = p.querySelector('.as-table');
        if (b) { b.click(); if (p.querySelector('table')) tables++; b.click(); }
      }
      // the single-target chart must agree with the game about the biggest weapon
      const ids = (game.WeaponOrder || Object.keys(game.Weapons));
      let top = null, best = -1;
      for (const id of ids) {
        const q = game.Weapon.preview(id, 8, true);
        if (q && q.dps > best) { best = q.dps; top = game.Weapons[id].name; }
      }
      const firstLabel = panels[0].querySelector('svg text.name');
      // and the time-to-kill panel must not have flattened any series: measure
      // the drawn height of each line
      const ttk = panels[2];
      const heights = [...ttk.querySelectorAll('svg path')].map((pa) => {
        const b = pa.getBBox(); return Math.round(b.height);
      });
      return { panels: panels.length, marks, tables, top, firstLabel: firstLabel && firstLabel.textContent,
        heights, series: [cs.getPropertyValue('--s1').trim(),
          cs.getPropertyValue('--s2').trim(), cs.getPropertyValue('--s3').trim()] };
    });
    if (viz.panels !== 3) fail.push(`the projections tab drew ${viz.panels} charts, not 3`);
    if (viz.marks.some((m) => m < 3)) {
      fail.push('a chart drew almost nothing: marks per panel ' + viz.marks.join(', '));
    }
    if (viz.tables !== 3) {
      fail.push(`${viz.tables} of 3 charts offer a table view - every chart needs one`);
    }
    if (viz.firstLabel !== viz.top) {
      fail.push(`the single-target chart's top weapon is "${viz.firstLabel}" but the game `
        + `says it is "${viz.top}" - the chart is not computed from the game`);
    }
    /* The defect this replaced: one shared y-axis let a 637-second boss flatten
       both creature lines onto the baseline. Small multiples fixed it, and a
       flattened series is what regressing would look like. */
    if (viz.heights.some((h) => h < 12)) {
      fail.push('a time-to-kill series is drawn flat (' + viz.heights.join(', ') + 'px tall) '
        + '- something has put series of different magnitude back on one scale');
    }
    /* The three series hues are the first three slots of the reference
       categorical palette, stepped for dark, and were run through the dataviz
       validator against this page's own surface (#080b11, --pairs all): worst
       CVD deltaE 9.4, worst normal-vision 20.9, all over 3:1. Changing them
       without re-validating is how a chart quietly stops being readable. */
    const WANT = ['#3987e5', '#d95926', '#199e70'];
    if (viz.series.join(',').toLowerCase() !== WANT.join(',')) {
      fail.push(`the chart series colours are ${viz.series.join(', ')}, not the validated `
        + `${WANT.join(', ')} - re-run the palette validator if this is deliberate`);
    }

    /* ---- panes resize, and remember --------------------------------------- */
    const panes = await page.evaluate(async () => {
      const shell = document.querySelector('#shell');
      const before = getComputedStyle(shell).getPropertyValue('--aside-w').trim();
      const grip = document.querySelector('#grip-aside');
      const r = grip.getBoundingClientRect();
      grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1,
        clientX: r.x, clientY: r.y + 40 }));
      grip.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1,
        clientX: innerWidth - 620, clientY: r.y + 40 }));
      grip.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      await new Promise((res) => setTimeout(res, 60));
      return { before, after: getComputedStyle(shell).getPropertyValue('--aside-w').trim(),
        stored: localStorage.getItem('bench.--aside-w') };
    });
    if (panes.after === panes.before || !/\d/.test(panes.after)) {
      fail.push(`dragging the divider left the pane at ${panes.after}`);
    }
    if (!panes.stored) fail.push('a dragged pane width is not remembered');

    /* ---- live ----------------------------------------------------------- */
    const live = await page.evaluate(async () => {
      const game = document.querySelector('#frame').contentWindow.WS;
      const before = game.Weapons.cinderfall.damage;
      document.querySelector('nav button[data-root="Weapons"]').click();
      const card = document.querySelector('#main .entry[data-path="Weapons.cinderfall"]');
      const lab = [...card.querySelectorAll('.field > label')]
        .find((l) => l.title === 'Weapons.cinderfall.damage');
      const input = lab.nextElementSibling.querySelector('input');
      input.value = String(before + 11);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // and a rename, because "renamed" is half of what this tool is for
      const nlab = [...card.querySelectorAll('.field > label')]
        .find((l) => l.title === 'Weapons.cinderfall.name');
      const ninput = nlab.nextElementSibling.querySelector('input,textarea');
      ninput.value = 'Emberfall';
      ninput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
      return { before, after: game.Weapons.cinderfall.damage,
        name: game.Weapons.cinderfall.name,
        shipped: game.Tuning.shippedValue('Weapons.cinderfall.damage'),
        count: document.querySelector('#count').textContent,
        keys: Object.keys(game.Tuning.overrides).join(' '),
        notes: document.querySelector('#notes').textContent,
        marked: !!card.classList.contains('touched') };
    });
    if (live.after !== live.before + 11) {
      fail.push(`typing in the bench left the running game at ${live.after}, not `
        + `${live.before + 11} - the frame is not the game being edited`);
    }
    if (live.name !== 'Emberfall') fail.push('a rename did not reach the running game');
    if (live.shipped !== live.before) {
      fail.push(`the shipped value was lost: it reads ${live.shipped}, not ${live.before}`);
    }
    if (!/2 changes/.test(live.count)) fail.push(`the change counter says "${live.count}" (overrides: ${live.keys})`);
    if (!live.marked) fail.push('the edited card is not marked as changed');
    if (!/Emberfall/.test(live.notes) || !/damage/.test(live.notes)) {
      fail.push('the patch notes do not describe the change: ' + live.notes.slice(0, 90));
    }

    /* ---- writes --------------------------------------------------------- */
    await page.fill('#label', 'Bench self-check');
    await page.click('#save');
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#status').textContent)
      || /Could not/.test(document.querySelector('#status').textContent), null, { timeout: 10000 });
    const said = await page.textContent('#status');
    if (!/^Saved/.test(said.trim())) fail.push('save reported: ' + said);

    const written = fs.readFileSync(path.join(work, 'src/data/tuning.js'), 'utf8');
    if (!/Weapons\.cinderfall\.damage/.test(written) || !/Emberfall/.test(written)) {
      fail.push('src/data/tuning.js does not contain the change that was saved');
    }
    const log = fs.readFileSync(path.join(work, 'CHANGELOG-BALANCE.md'), 'utf8');
    if (!/Bench self-check/.test(log) || !/renamed/.test(log)) {
      fail.push('CHANGELOG-BALANCE.md did not get readable patch notes');
    }
    if (fs.readFileSync(path.join(work, 'src/data/weapons.js'), 'utf8') !== shippedBefore) {
      fail.push('the SHIPPED weapons file was modified - overrides must never edit it');
    }

    /* ---- survives ------------------------------------------------------- */
    const fresh = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    fresh.on('pageerror', (e) => fail.push('game page error after tuning: ' + e.message));
    await fresh.goto(`http://127.0.0.1:${PORT}/index.html`);
    await fresh.waitForFunction(() => window.WS && WS.Game && WS.Tuning);
    const reloaded = await fresh.evaluate(() => ({
      damage: WS.Weapons.cinderfall.damage,
      name: WS.Weapons.cinderfall.name,
      shipped: WS.Tuning.shippedValue('Weapons.cinderfall.damage'),
      stale: (WS.Tuning.stale || []).length,
      overrides: Object.keys(WS.Tuning.overrides).length,
      // and a path a tuning file must never be able to reach
      hostile: WS.Tuning.set('__proto__.polluted', 1)
        || WS.Tuning.set('Weapons.__proto__.polluted', 1)
        || WS.Tuning.set('Save.db.gold', 999999),
      polluted: ({}).polluted,
    }));
    if (reloaded.damage !== live.before + 11 || reloaded.name !== 'Emberfall') {
      fail.push(`after a reload the weapon reads ${reloaded.name}/${reloaded.damage}, `
        + 'not what was saved - the tuning did not survive');
    }
    if (reloaded.shipped !== live.before) {
      fail.push('after a reload the shipped value is no longer known, so nothing can '
        + 'be put back');
    }
    if (reloaded.stale) fail.push(`${reloaded.stale} saved override(s) no longer resolve`);
    if (reloaded.overrides !== 2) fail.push(`${reloaded.overrides} overrides loaded, expected 2`);
    if (reloaded.hostile || reloaded.polluted !== undefined) {
      fail.push('a tuning path reached outside the data tables - prototype pollution or '
        + 'a write into the save');
    }

    /* A page on ANOTHER ORIGIN must not be able to rewrite the repository
       while the bench is open. This has to be tested from a genuinely
       different origin - a fetch from the bench's own pages is same-origin
       and proves nothing - so a second throwaway server hosts the attacker.
       And what is asserted is the FILE, not the response code: `no-cors`
       sends the request whether or not the browser will let the page read
       the answer, so the only honest question is whether anything landed. */
    const evil = http.createServer((q, s2) => {
      s2.writeHead(200, { 'content-type': 'text/html' }); s2.end('<!doctype html><title>x</title>');
    });
    await new Promise((r) => evil.listen(PORT + 1, '127.0.0.1', r));
    const before = fs.readFileSync(path.join(work, 'src/data/tuning.js'), 'utf8');
    const attacker = await browser.newPage();
    await attacker.goto(`http://127.0.0.1:${PORT + 1}/`);
    await attacker.evaluate(async (port) => {
      try {
        await fetch(`http://127.0.0.1:${port}/api/save`, {
          method: 'POST', mode: 'no-cors', headers: { 'content-type': 'text/plain' },
          body: JSON.stringify({ overrides: { 'Config.xpBase': 1 },
            markdown: '## owned' }),
        });
      } catch (e) { /* the browser hiding the answer is not the protection */ }
    }, PORT);
    await wait(400);
    await attacker.close();
    evil.close();
    if (fs.readFileSync(path.join(work, 'src/data/tuning.js'), 'utf8') !== before) {
      fail.push('a page on another origin rewrote src/data/tuning.js - any site open '
        + 'in the browser could retune the game while the bench is running');
    }

    await browser.close();
  } finally {
    stop();
    fs.rmSync(work, { recursive: true, force: true });
  }

  if (serverErr.trim()) fail.push('the server printed to stderr: ' + serverErr.trim().slice(0, 200));
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail.slice(0, 12)) console.error('  - ' + f);
    if (fail.length > 12) console.error(`  ... and ${fail.length - 12} more`);
    process.exit(1);
  }
  console.log('ok: the bench builds itself from the live game (a field invented at runtime '
    + 'gets a correctly typed control), an edit reaches the running game, saving writes '
    + 'src/data/tuning.js and readable patch notes without touching a shipped data file, '
    + 'the change survives a reload with its shipped value still recoverable, and neither '
    + 'a hostile tuning path nor a cross-origin POST gets through');
})().catch((e) => { console.error('FAIL\n  - ' + (e.stack || e.message)); process.exit(1); });
