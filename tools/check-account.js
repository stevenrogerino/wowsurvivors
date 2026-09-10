#!/usr/bin/env node
/* Can a player get their account off this machine, and back onto another one?
 *
 * Everything a player earns lives in one browser's localStorage. That is one
 * cleared cache, one reinstall, one new laptop away from thirty hours of
 * unlocks being gone with nothing anybody can do about it - and there was no
 * way to move an account between two machines at all. Of every hole left in
 * this game, it is the only one that can cost somebody something they cannot
 * get back.
 *
 * So there are two shapes of the same payload and this drives both:
 *
 *   round trip   A full account - gold, unlocks, Trainer ranks, statistics,
 *                the codex - must come out and go back in IDENTICAL. Not
 *                approximately: this compares the whole database.
 *
 *   two ways     A code (base64, one line, survives a chat client) and a file
 *                (plain JSON, because a backup you cannot read is a backup you
 *                cannot trust). Either must import.
 *
 *   truncation   The failure that actually happens is a paste that lost its
 *                tail - copied out of a scrolled box, cut short by a message
 *                limit. Half an account must be REFUSED, not imported, or the
 *                player loses the rest and is never told.
 *
 *   hostile      An import is exactly as untrusted as localStorage, so it goes
 *                through the same migrate/merge/sanitize path a stored save
 *                does. Garbage, a primitive, a save from before the rename, an
 *                account with a negative balance and weapons that do not
 *                exist - all must either be refused or repaired into something
 *                playable. Never accepted as-is.
 *
 *   consent      And nothing writes until the player has been shown what is in
 *                the incoming account AND what it would replace. Parsing is
 *                not importing.
 *
 * NEGATIVE TESTS, all confirmed: dropping the checksum comparison fails at "a
 * save that was altered after export imported without complaint"; having
 * parseImport commit as it parses fails at "merely parsing an import replaced
 * the account"; and skipping sanitize on the way in fails at "a save with -999
 * gold imported unrepaired".
 *
 * The first of those did not fail on the first attempt, and the reason is
 * worth writing down: a truncated CODE is caught by base64 decoding and
 * truncated JSON by the parser, both long before any checksum runs. The digest
 * is not what catches a short paste - it is what catches damage that still
 * parses, which is the quieter and worse failure.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-account.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const fail = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));
  await page.goto(GAME);
  await page.waitForFunction(() => window.WS && WS.Save && WS.Save.export);
  await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
  });

  /* ---- a real account, round-tripped both ways --------------------------- */
  const trip = await page.evaluate(() => {
    // Something worth losing: everything unlocked, gold banked, Trainer ranks
    // bought, statistics accumulated, a codex with entries in it.
    WS.Save.unlockAll();
    WS.Save.db.gold = 999999;
    for (const id of WS.MetaUpgradeOrder) {
      for (let i = 0; i < 4 && WS.Save.metaCost(id) !== null; i++) WS.Save.buyMeta(id);
    }
    WS.Save.db.gold = 48211;      // after the shopping, or the ranks spend it
    WS.Save.db.statistics.totalRuns = 143;
    WS.Save.db.statistics.totalVictories = 11;
    WS.Save.db.statistics.bestTime.thornhollow = 1800;
    WS.Save.db.combos.frostfire = true;
    WS.Save.db.settings.musicVolume = 0.31;
    WS.Save.save();
    const before = JSON.stringify(WS.Save.db);
    const out = WS.Save.export();

    const viaCode = WS.Save.parseImport(out.code);
    const viaFile = WS.Save.parseImport(out.json);
    return {
      before, code: out.code, json: out.json,
      summary: out.summary,
      codeOk: viaCode.ok, fileOk: viaFile.ok,
      codeErr: viaCode.error, fileErr: viaFile.error,
      codeSame: viaCode.ok && JSON.stringify(viaCode.db) === before,
      fileSame: viaFile.ok && JSON.stringify(viaFile.db) === before,
      readable: /"gold": 48211/.test(out.json),
      oneLine: !/\s/.test(out.code),
    };
  });
  if (!trip.codeOk) fail.push('the exported code would not import: ' + trip.codeErr);
  if (!trip.fileOk) fail.push('the exported file would not import: ' + trip.fileErr);
  if (!trip.codeSame) fail.push('a code round trip did not give back the same account');
  if (!trip.fileSame) fail.push('a file round trip did not give back the same account');
  if (!trip.readable) {
    fail.push('the exported file is not readable JSON - a backup you cannot open is a '
      + 'backup you cannot repair');
  }
  if (!trip.oneLine) fail.push('the code is not one unbroken line, so pasting it will break it');
  if (trip.summary.gold !== 48211 || trip.summary.characters < 10) {
    fail.push(`the export describes itself as ${JSON.stringify(trip.summary)}`);
  }

  /* ---- truncation, the failure that actually happens ---------------------- */
  const cut = await page.evaluate((code) => {
    const half = code.slice(0, Math.floor(code.length * 0.6));
    const chopped = code.slice(0, code.length - 12);
    return {
      half: WS.Save.parseImport(half),
      chopped: WS.Save.parseImport(chopped),
      spaced: WS.Save.parseImport(code.replace(/(.{40})/g, '$1\n')),
    };
  }, trip.code);
  if (cut.half.ok) fail.push('a truncated code was accepted - the player would silently '
    + 'lose everything after the cut');
  if (cut.chopped.ok) fail.push('a code missing its tail was accepted');
  if (!cut.spaced.ok) {
    fail.push('a code that picked up line breaks in transit was refused - which is what '
      + 'every chat client does to it');
  }

  /* And the case the checksum is actually FOR.
   *
   * A truncated code is caught by base64 decoding before any checksum runs,
   * and truncated JSON is caught by the parser - so neither of those is what
   * the digest earns its place on. What it catches is damage that still
   * PARSES: a hand-edit, a merge conflict resolved badly, a byte mangled by an
   * encoding round trip. Without it that imports silently, and the player's
   * account is quietly not the one they backed up. */
  const tampered = await page.evaluate((json) => {
    const outer = JSON.parse(json);
    outer.save.gold = 999999;            // still perfectly valid JSON
    return WS.Save.parseImport(JSON.stringify(outer));
  }, trip.json);
  if (tampered.ok) {
    fail.push('a save that was altered after export imported without complaint - the '
      + 'checksum is not being checked');
  }

  /* ---- hostile and broken input ------------------------------------------ */
  const nasty = await page.evaluate(() => {
    const cases = {
      empty: '',
      junk: 'hello',
      html: '<!doctype html><title>not a save</title>',
      primitive: '7',
      nullish: 'null',
      array: '[1,2,3]',
      emptyObject: '{}',
      bareAccount: JSON.stringify({ gold: 900, unlocks: { characters: { rogue: true } } }),
      /* == legacy-name map: begin ==
         A backup taken before the rename is exactly the case migrate() exists
         for, and testing it means naming what things used to be called. Same
         shim allowance as save.js and check-robust.js, for the same reason -
         these strings are read by a compatibility table and are never shown to
         a player. */
      preRename: JSON.stringify({ gold: 50, unlocks: { characters: { death_knight: true },
        maps: { elwynn: true } } }),
      /* == legacy-name map: end == */
      hostile: JSON.stringify({ gold: -999, unlocks: { characters: { nobody: true } },
        weapons: 'not an object', statistics: 7, meta: { fake_upgrade: 99 } }),
      proto: '{"__proto__":{"polluted":1},"gold":5}',
    };
    const out = {};
    for (const [name, text] of Object.entries(cases)) {
      const r = WS.Save.parseImport(text);
      out[name] = { ok: r.ok, error: r.error,
        gold: r.ok ? r.db.gold : null,
        playable: r.ok ? !!(r.db.unlocks && r.db.unlocks.characters
          && r.db.unlocks.characters.mage) : null,
        keptFake: r.ok ? !!(r.db.unlocks.characters.nobody) : null,
        schema: r.ok ? r.db.schema : null };
    }
    out.polluted = ({}).polluted;
    return out;
  });
  for (const name of ['empty', 'junk', 'html', 'primitive', 'nullish', 'array']) {
    if (nasty[name].ok) fail.push(`"${name}" was accepted as a save`);
    if (!nasty[name].ok && !nasty[name].error) fail.push(`"${name}" was refused with no reason`);
  }
  for (const name of ['emptyObject', 'bareAccount', 'preRename', 'hostile', 'proto']) {
    const c = nasty[name];
    if (!c.ok) { fail.push(`"${name}" could not be repaired into an account: ${c.error}`); continue; }
    if (!c.playable) {
      fail.push(`"${name}" imported into an account with nothing playable in it`);
    }
    if (c.schema === null || c.schema === undefined) {
      fail.push(`"${name}" imported without a schema stamp`);
    }
  }
  if (nasty.hostile.ok && nasty.hostile.gold < 0) {
    fail.push(`a save with ${nasty.hostile.gold} gold imported unrepaired`);
  }
  if (nasty.hostile.ok && nasty.hostile.keptFake) {
    fail.push('an account with a survivor that does not exist imported unrepaired');
  }
  if (nasty.polluted !== undefined) {
    fail.push('an imported save reached Object.prototype');
  }
  // the rename table has to survive the trip too, or an old backup loses unlocks
  /* == legacy-name map: begin == the old names, for the migration test only */
  const renamed = await page.evaluate(() => {
    const r = WS.Save.parseImport(JSON.stringify({ gold: 50,
      unlocks: { characters: { death_knight: true }, maps: { elwynn: true } } }));
    return r.ok && { gb: !!r.db.unlocks.characters.graveblade,
      th: !!r.db.unlocks.maps.thornhollow };
  });
  if (!renamed || !renamed.gb) {
    fail.push('a backup taken before the rename lost its unlocked survivor on import');
  }
  /* == legacy-name map: end == */

  /* ---- parsing is not importing ------------------------------------------ */
  const consent = await page.evaluate(() => {
    const mine = JSON.stringify(WS.Save.db);
    const other = WS.Save.parseImport(JSON.stringify({ gold: 1, unlocks: {} }));
    const untouched = JSON.stringify(WS.Save.db) === mine;
    const shown = other.ok && other.summary && other.replacing
      && typeof other.replacing.gold === 'number';
    // and adopting really does replace it
    WS.Save.adopt(other.db);
    const swapped = WS.Save.db.gold === 1;
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem('emberwatch.save.v1')).gold; } catch (e) {}
    return { untouched, shown, swapped, stored };
  });
  if (!consent.untouched) {
    fail.push('merely parsing an import replaced the account - nothing may write until '
      + 'the player says so');
  }
  if (!consent.shown) {
    fail.push('an import does not say what it contains and what it would replace');
  }
  if (!consent.swapped) fail.push('adopting an import did not replace the account');
  if (consent.stored !== 1) fail.push('an adopted account was not written to storage');

  /* ---- and the whole thing works from the actual settings screen ---------- */
  const ui = await page.evaluate(async () => {
    WS.Save.load();
    WS.Save.unlockAll();
    WS.Save.db.gold = 777;
    WS.UI.tab = 'settings';
    WS.UI.openMenu();
    await new Promise((r) => setTimeout(r, 60));
    const btns = [...document.querySelectorAll('#overlay button')];
    const find = (re) => btns.find((b) => re.test(b.textContent));
    const load = find(/^load from/i);
    if (!load) return { found: false, labels: btns.map((b) => b.textContent).slice(0, 20) };
    load.click();
    await new Promise((r) => setTimeout(r, 40));
    const box = document.querySelector('.import-box');
    if (!box || box.classList.contains('hidden')) return { found: true, box: false };
    box.value = 'EMBERWATCH1:' + btoa(unescape(encodeURIComponent(
      JSON.stringify({ save: { gold: 4242 }, sum: WS.Save.digest(JSON.stringify({ gold: 4242 })) }))));
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const go = [...document.querySelectorAll('#overlay button')]
      .find((b) => /replace my progress/i.test(b.textContent));
    const offered = !!go && !go.classList.contains('hidden');
    if (offered) go.click();
    await new Promise((r) => setTimeout(r, 80));
    return { found: true, box: true, offered, gold: WS.Save.db.gold,
      exportables: ['copy code', 'save to file'].filter((t) =>
        btns.some((b) => b.textContent.toLowerCase().includes(t))).length };
  });
  if (!ui.found) {
    fail.push('there is no way to import an account from the settings screen '
      + `(buttons: ${(ui.labels || []).join(', ')})`);
  } else {
    if (!ui.box) fail.push('the import control does not open a box to paste into');
    if (!ui.offered) fail.push('pasting a valid code did not offer to import it');
    if (ui.gold !== 4242) fail.push(`importing from the screen left ${ui.gold} gold, not 4242`);
    if (ui.exportables !== 2) fail.push('the settings screen does not offer both a code and a file');
  }

  /* ---- the short code, and the drop that means nobody needs it ------------
   * A played account base64s to about six thousand characters, which is not a
   * thing anybody pastes - it is a thing they give up on. Two answers: the
   * code is gzipped now, and a file dropped on the window skips the paste
   * entirely.
   *
   * The rules are that the short code round-trips, that every older format
   * still reads (a code someone saved last month has to keep working), that a
   * packed code reaching parseImport un-unpacked says something useful rather
   * than "that is not an Ember Watch save", and above all that a DROP DOES NOT
   * WRITE. A dropped file replaces an account that may be thirty hours old, so
   * it has to stop and ask, exactly like the settings screen does. */
  const transport = await page.evaluate(async () => {
    WS.Save.reset();
    WS.Save.unlockAll();
    WS.Save.db.gold = 424242;
    const s = WS.Save.db.statistics;
    s.totalKills = 421339; s.totalRuns = 214;
    for (const id of Object.keys(WS.Enemies)) s.bestiary[id] = 1000;
    for (const id of Object.keys(WS.Achievements)) WS.Save.db.achievements[id] = true;
    const old = WS.Save.export();
    const packed = await WS.Save.pack();
    const back = WS.Save.parseImport(await WS.Save.unpack(packed));
    return {
      oldLen: old.code.length, newLen: packed.length,
      packedOk: back.ok && back.db.gold === 424242
        && back.db.statistics.totalKills === 421339,
      // every older shape still reads
      v1: WS.Save.parseImport(old.code).ok,
      rawJson: WS.Save.parseImport(old.json).ok,
      // and unpack leaves anything that is not a packed code alone
      passthrough: (await WS.Save.unpack(old.code)) === old.code,
      // a packed code that skipped unpack has to explain itself
      bare: WS.Save.parseImport(packed).error || '',
    };
  });
  if (!transport.packedOk) fail.push('the compressed code does not round-trip');
  if (!transport.v1) fail.push('an older EMBERWATCH1 code no longer imports');
  if (!transport.rawJson) fail.push('a plain JSON file no longer imports');
  if (!transport.passthrough) {
    fail.push('unpack mangles input that is not a packed code, so a caller cannot run it '
      + 'over whatever it was given');
  }
  if (!/compressed|unpack|file instead/i.test(transport.bare)) {
    fail.push('a packed code handed straight to parseImport says "' + transport.bare
      + '" instead of naming the problem');
  }
  if (!(transport.newLen < transport.oldLen * 0.5)) {
    fail.push(`the compressed code is ${transport.newLen} characters against the old `
      + `${transport.oldLen} - that is not worth a format`);
  }

  const drop = await page.evaluate(async () => {
    const json = WS.Save.export().json;
    WS.Save.reset();
    WS.Save.db.seenManual = true; WS.Save.db.seenPrologue = true;
    WS.Game.state = 'menu'; WS.Game.player = null;
    WS.UI.openMenu();
    const goldBefore = WS.Save.db.gold;
    const dt = new DataTransfer();
    dt.items.add(new File([json], 'dropped.json', { type: 'application/json' }));
    const stage = document.getElementById('stage');
    stage.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    const litOnDrag = stage.classList.contains('dropping');
    stage.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const title = (document.querySelector('.overlay-head h1') || {}).textContent || '';
    const go = [...document.querySelectorAll('#overlay button')]
      .find((b) => /replace my progress/i.test(b.textContent));
    const goldAtOffer = WS.Save.db.gold;
    if (go) go.click();
    await new Promise((r) => setTimeout(r, 300));
    return { litOnDrag, title, offered: !!go, goldBefore, goldAtOffer,
      goldAfter: WS.Save.db.gold, stillLit: stage.classList.contains('dropping') };
  });
  if (!drop.offered) {
    fail.push(`dropping a save file on the window did nothing (the screen said `
      + `"${drop.title}")`);
  } else {
    if (drop.goldAtOffer !== drop.goldBefore) {
      fail.push('dropping a file WROTE before anyone confirmed - it went from '
        + `${drop.goldBefore} to ${drop.goldAtOffer} gold just by being dropped`);
    }
    if (drop.goldAfter === drop.goldBefore) {
      fail.push('confirming the dropped account did not load it');
    }
  }
  if (!drop.litOnDrag) fail.push('dragging a file over the window shows no sign it can be dropped');
  if (drop.stillLit) fail.push('the drop highlight never cleared');

  const midRun = await page.evaluate(async () => {
    const json = WS.Save.export().json;
    WS.Game.startRun('thornhollow', 'mage');
    const gold = WS.Save.db.gold;
    const dt = new DataTransfer();
    dt.items.add(new File([json], 'dropped.json', { type: 'application/json' }));
    document.getElementById('stage').dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const offered = [...document.querySelectorAll('#overlay button')]
      .some((b) => /replace my progress/i.test(b.textContent));
    WS.Game.quitToMenu();
    return { offered, changed: WS.Save.db.gold !== gold };
  });
  if (midRun.offered || midRun.changed) {
    fail.push('a save file dropped DURING a run was accepted - swapping the account out '
      + 'from under a live run leaves it pointing at unlocks that no longer exist');
  }

  /* ---- the beta save files still load ------------------------------------
   * beta/ holds two accounts handed to testers, and they are a static artefact
   * checked into the repository: nothing exercises them, so if the save format
   * moves they rot silently and the first person to find out is somebody who
   * needed one. They are generated by node tools/make-saves.js, through the
   * game's own export, so this checks the ones actually committed. */
  const betaDir = path.resolve(__dirname, '..', 'beta');
  let betaFiles = [];
  try { betaFiles = fs.readdirSync(betaDir).filter((f) => f.endsWith('.json')); } catch (e) {}
  if (!betaFiles.length) {
    fail.push('there are no beta save files in beta/ - run node tools/make-saves.js');
  }
  let betaOk = 0;
  for (const f of betaFiles) {
    const body = fs.readFileSync(path.join(betaDir, f), 'utf8');
    const page3 = await browser.newPage();
    await page3.goto(GAME);
    await page3.waitForFunction(() => window.WS && WS.Save && WS.Save.db);
    await page3.waitForTimeout(250);
    const got = await page3.evaluate((body) => {
      const r = WS.Save.parseImport(body);
      if (!r.ok) return { ok: false, error: r.error };
      WS.Save.adopt(r.db);
      const all = (have, want) => want.every((id) => have[id]);
      return { ok: true,
        chars: all(WS.Save.db.unlocks.characters, WS.CharacterOrder),
        maps: all(WS.Save.db.unlocks.maps, WS.MapOrder),
        gold: WS.Save.db.gold,
        seen: !!WS.Save.db.seenPrologue && !!WS.Save.db.seenManual };
    }, body);
    await page3.close();
    if (!got.ok) { fail.push(`beta/${f} no longer imports: ${got.error}`); continue; }
    if (!got.chars) fail.push(`beta/${f} does not unlock the whole roster`);
    if (!got.maps) fail.push(`beta/${f} does not unlock every battlefield`);
    if (!(got.gold > 10000)) fail.push(`beta/${f} banks only ${got.gold} gold`);
    if (!got.seen) {
      fail.push(`beta/${f} makes a tester sit through the prologue and the manual`);
    }
    if (got.ok && got.chars && got.maps) betaOk++;
  }

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail.slice(0, 14)) console.error('  - ' + f);
    if (fail.length > 14) console.error(`  ... and ${fail.length - 14} more`);
    process.exit(1);
  }
  console.log(`ok: a ${(trip.json.length / 1024).toFixed(1)}KB account round-trips identically `
    + 'as a one-line code and as readable JSON, a truncated paste is refused rather than '
    + 'half-imported, eleven kinds of broken or hostile save are either refused or repaired '
    + 'into something playable, a backup from before the rename keeps its unlocks, parsing '
    + 'never writes, the whole thing works from the settings screen, a played account '
    + `packs from ${transport.oldLen} characters down to ${transport.newLen} while every `
    + 'older format still reads, a save file dropped on the window asks before it writes '
    + 'and is refused mid-run, and '
    + `${betaOk} beta save file${betaOk === 1 ? '' : 's'} still import with the whole roster `
    + 'and every battlefield open');
})();
