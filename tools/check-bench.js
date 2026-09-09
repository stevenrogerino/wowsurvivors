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
      const labels = [...first.querySelectorAll('.grid > label')].map((l) => l.title);
      const id = first.dataset.path.split('.')[1];
      return {
        cards: cards.length,
        weapons: Object.keys(game.Weapons).length,
        labels,
        fields: Object.keys(game.Weapons[id]).map((k) => 'Weapons.' + id + '.' + k),
        derived: !!first.querySelector('.derived'),
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
    if (!built.derived) fail.push('the weapon card shows no derived rank-1 output');

    /* A field NOBODY wrote a form for. If the bench is really introspective,
       inventing a field on a live object makes an editor for it appear. */
    const invented = await page.evaluate(() => {
      const game = document.querySelector('#frame').contentWindow.WS;
      game.Weapons.cinderfall.wobbliness = 3;
      game.Weapons.cinderfall.epithet = 'the slow heavy one';
      document.querySelector('nav button[data-root="Weapons"]').click();
      const card = document.querySelector('#main .entry[data-path="Weapons.cinderfall"]');
      const got = [...card.querySelectorAll('.grid > label')].map((l) => l.title);
      const kinds = {};
      for (const k of ['wobbliness', 'epithet']) {
        const lab = [...card.querySelectorAll('.grid > label')]
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

    /* ---- live ----------------------------------------------------------- */
    const live = await page.evaluate(async () => {
      const game = document.querySelector('#frame').contentWindow.WS;
      const before = game.Weapons.cinderfall.damage;
      document.querySelector('nav button[data-root="Weapons"]').click();
      const card = document.querySelector('#main .entry[data-path="Weapons.cinderfall"]');
      const lab = [...card.querySelectorAll('.grid > label')]
        .find((l) => l.title === 'Weapons.cinderfall.damage');
      const input = lab.nextElementSibling.querySelector('input');
      input.value = String(before + 11);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // and a rename, because "renamed" is half of what this tool is for
      const nlab = [...card.querySelectorAll('.grid > label')]
        .find((l) => l.title === 'Weapons.cinderfall.name');
      const ninput = nlab.nextElementSibling.querySelector('input,textarea');
      ninput.value = 'Emberfall';
      ninput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
      return { before, after: game.Weapons.cinderfall.damage,
        name: game.Weapons.cinderfall.name,
        shipped: game.Tuning.shippedValue('Weapons.cinderfall.damage'),
        count: document.querySelector('#count').textContent,
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
    if (!/2 changes/.test(live.count)) fail.push(`the change counter says "${live.count}"`);
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
