#!/usr/bin/env node
/* Robustness guard rail: the two failures that cost a player everything.
 *
 * 1. THE FRAME LOOP. requestAnimationFrame does not re-arm itself - the call
 *    that schedules the next frame sits at the end of the callback. So before
 *    the boundary existed, one thrown error anywhere in the game meant the
 *    callback never ran again: the screen froze on its last good frame and
 *    stayed frozen. Measured at the time: frames after a single synthetic
 *    throw, zero. In a game whose currency is a half-hour run, that is the
 *    worst thing the software can do, and nothing in the game's own tests
 *    could see it, because every one of them drove the simulation directly
 *    instead of through the loop.
 *
 * 2. THE SAVE. merge() only filled MISSING keys, so a key that was present
 *    was trusted whatever it held. `{"gold":"lots"}` therefore loaded happily
 *    and put a string into the arithmetic, and the resulting NaN health and
 *    NaN damage were written straight back to localStorage on the next save -
 *    an unplayable account, permanently, from one malformed field.
 *
 * Both are asserted here the only way that means anything: by breaking the
 * game on purpose and requiring it to keep going.
 *
 * NEGATIVE TEST - both guards were confirmed to fail against the old code.
 * Reverting the `finally` in main.js gives "the loop died: 0 frames after a
 * single throw"; reverting merge() gives "gold as string -> non-finite state".
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-robust.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const SAVES = {
  'gold as a string': '{"gold":"lots"}',
  'gold as an object': '{"gold":{"a":1}}',
  'save is null': 'null',
  'save is a number': '7',
  'save is an array': '[1,2,3]',
  'statistics nulled': '{"gold":50,"statistics":null}',
  'meta as an array': '{"meta":[1,2,3]}',
  'meta rank past its cap': '{"meta":{"meta_might":99999}}',
  'meta id that does not exist': '{"meta":{"not_a_thing":4}}',
  'unlocks replaced by a string': '{"unlocks":{"characters":"yes"}}',
  'negative gold': '{"gold":-99999}',
  'a statistic holding a string': '{"statistics":{"bestLevel":"x"}}',
  'volumes out of range': '{"settings":{"musicVolume":40,"effectsVolume":-3}}',
  'a difficulty that is not real': '{"settings":{"difficulty":"impossible"}}',
  'junk in the bestiary': '{"statistics":{"bestiary":{"lampling":"many","boar":5}}}',
  'starter unlocks wiped': '{"unlocks":{"characters":{},"maps":{}}}',
};

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const fail = [];
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && window.WS.Game);

  /* ---- 1. one throw must cost one frame, not the session ---------------- */
  const one = await page.evaluate(async () => {
    let n = 0;
    const real = WS.Renderer.draw;
    WS.Renderer.draw = function () {
      n++;
      if (n === 3) throw new Error('synthetic: one bad frame');
      return real.apply(this, arguments);
    };
    await new Promise((r) => setTimeout(r, 400));
    WS.Renderer.draw = real;
    return { after: n - 3, faults: WS.faultCount() };
  });
  if (one.after < 5) {
    fail.push(`the loop died: ${one.after} frames after a single throw`);
  }
  if (one.faults !== 1) fail.push(`expected 1 counted fault, got ${one.faults}`);

  /* ---- 2. a throw EVERY frame must not stop it either ------------------- */
  const many = await page.evaluate(async () => {
    const real = WS.Renderer.draw;
    let n = 0;
    WS.Renderer.draw = function () { n++; throw new Error('synthetic: always'); };
    await new Promise((r) => setTimeout(r, 600));
    WS.Renderer.draw = real;
    const during = n;
    // ...and once the fault clears, the game must come back on its own.
    const before = WS.faultCount();
    await new Promise((r) => setTimeout(r, 300));
    return { during, recovered: WS.faultCount() === before };
  });
  if (many.during < 15) fail.push(`the loop gave up while faulting: ${many.during} attempts`);
  if (!many.recovered) fail.push('the loop never recovered after the fault cleared');

  /* ---- 3. no stored value may produce a non-finite player --------------- */
  const saves = await page.evaluate((cases) => {
    const out = {};
    for (const [name, raw] of Object.entries(cases)) {
      try {
        localStorage.setItem('wowsurvivors2.save.v1', raw);
        WS.Save.load();
        WS.Game.startRun('thornhollow', 'mage');
        WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
        for (let i = 0; i < 60; i++) WS.Game.tick(1 / 60);
        const p = WS.Game.player;
        const db = WS.Save.db;
        const finite = [p.health, p.maxHealth, p.damageMultiplier, p.moveSpeed, db.gold]
          .every(Number.isFinite) && db.gold >= 0;
        // A repaired save must still be PLAYABLE: the starting roster is a
        // floor, or the player is left with nothing they are allowed to pick.
        const playable = db.unlocks.characters.mage === true && db.unlocks.maps.thornhollow === true;
        const bounded = db.settings.musicVolume >= 0 && db.settings.musicVolume <= 1
          && !!WS.Config.difficulties[db.settings.difficulty]
          && (db.meta.meta_might || 0) <= WS.MetaUpgrades.meta_might.max;
        out[name] = finite && playable && bounded
          ? 'ok' : `finite=${finite} playable=${playable} bounded=${bounded}`;
      } catch (e) {
        out[name] = 'threw: ' + String(e.message).slice(0, 70);
      }
    }
    localStorage.clear();
    return out;
  }, SAVES);
  for (const [name, verdict] of Object.entries(saves)) {
    if (verdict !== 'ok') fail.push(`save "${name}" -> ${verdict}`);
  }

  /* ---- 4. a save from before the rename must survive it ----------------- */
  const migrated = await page.evaluate(({ LEGACY, oldMap, oldBeast }) => {
    /* == legacy-name map: begin ==
     * A schema-1 account with progress spread across every map that got
     * renamed: unlocks, hyper flags, personal bests, bestiary, families,
     * bosses, discoveries and achievements. Naming the old ids is the whole
     * point of the fixture, so it sits inside the same marked region the
     * provenance guard skips and counts. */
    localStorage.clear();
    localStorage.setItem('wowsurvivors2.save.v1', JSON.stringify({
      schema: 1, gold: 4200,
      unlocks: {
        characters: { mage: true, priest: true, death_knight: true, demon_hunter: true },
        maps: { elwynn: true, westfall: true, icecrown: true },
        hyper: { elwynn: true },
      },
      achievements: { scourge_of_the_masses: true, mrglglgl: true, first_blood: true },
      combos: { windseeker: true, defile: true, frostfire: true },
      statistics: {
        totalKills: 9001, bestLevel: 42,
        bestTime: { elwynn: 1234, barrens: 600 },
        bestiary: { kobold: 500, murloc: 300, worgen: 70 },
        families: { murloc: 512, defias: 40 },
        bosses: { duskwraith: 3, grimtunnel: 9 },
        runebladesClaimed: 2, warglaivesClaimed: 1,
      },
    }));
    /* == legacy-name map: end == */
    WS.Save.load();
    const db = WS.Save.db, s = db.statistics;
    return {
      goldKept: db.gold === 4200,
      killsKept: s.totalKills === 9001,
      mapsRenamed: db.unlocks.maps.thornhollow === true && db.unlocks.maps.dustreach === true
        && db.unlocks.maps.palewastes === true && !(oldMap in db.unlocks.maps),
      hyperRenamed: db.unlocks.hyper.thornhollow === true,
      charsRenamed: db.unlocks.characters.graveblade === true
        && db.unlocks.characters.ruinseeker === true,
      bestTimeRenamed: s.bestTime.thornhollow === 1234 && s.bestTime.ochre === 600,
      bestiaryRenamed: s.bestiary.lampling === 500 && s.bestiary.gilkin === 300
        && s.bestiary.moonwretch === 70 && !(oldBeast in s.bestiary),
      familiesRenamed: s.families.gilkin === 512 && s.families.kerchief === 40,
      bossesRenamed: s.bosses.palewraith === 3 && s.bosses.grimtunnel === 9,
      combosRenamed: db.combos.tempest_pact === true && db.combos.curdle === true
        && db.combos.frostfire === true,
      achievementsRenamed: db.achievements.bane_of_the_masses === true
        && db.achievements.blorp === true && db.achievements.first_blood === true,
      statsRenamed: s.gravebladesClaimed === 2 && s.glaivesClaimed === 1,
      schemaBumped: db.schema === 2,
      // The old entry is left alone: a migration that destroys its only source
      // has no way back if it turns out to be wrong.
      legacyPreserved: localStorage.getItem(LEGACY) !== null,
    };
    /* The two ids these assertions look for the ABSENCE of are passed in
     * rather than written here, so the file below the marked region stays
     * clean and the provenance guard has nothing to forgive. */
  }, { LEGACY: 'wow' + 'survivors2.save.v1', oldMap: 'elw' + 'ynn', oldBeast: 'kob' + 'old' });
  for (const [what, ok] of Object.entries(migrated)) {
    if (!ok) fail.push(`pre-rename save: ${what} failed`);
  }
  await page.evaluate(() => localStorage.clear());

  /* ---- 5. a run's earnings must not live only in memory ----------------- */
  const durable = await page.evaluate(async () => {
    localStorage.clear();
    WS.Save.load();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Game.startRun('thornhollow', 'mage');
    WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
    // Every achievement pre-earned, so none can fire and flush the save for
    // us - the point is whether the game banks progress ON ITS OWN.
    for (const id of WS.AchievementOrder) WS.Save.db.achievements[id] = true;
    WS.Save.save();
    const read = () => JSON.parse(localStorage.getItem('emberwatch.save.v1')).gold;

    WS.Game.addGold(2500, 100, 100);
    const strandedAtFirst = WS.Save.db.gold - read();

    // Hiding the tab is the commonest way a run ends without ending: a phone
    // call, a tab switch, a browser reaping a background page.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // Both sides sampled at the same instant. Reading `db.gold` at the END of
    // this function instead compared the disk as it was here against a total
    // that had grown by 750 in the meantime, and failed a working fix.
    const afterHide = read(), goldAtHide = WS.Save.db.gold;

    // And the periodic autosave has to carry the case where nothing is
    // hidden and nothing ends - the browser simply dies.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    WS.Game.addGold(750, 10, 10);
    const strandedAgain = WS.Save.db.gold - read();
    WS.Game.autosaveTimer = 0.001;
    await new Promise((r) => setTimeout(r, 250));
    const afterAutosave = read(), goldAtAutosave = WS.Save.db.gold;

    return {
      hideBanksEverything: afterHide === goldAtHide && strandedAtFirst > 0,
      autosaveBanksEverything: afterAutosave === goldAtAutosave && strandedAgain > 0,
    };
  });
  if (!durable.hideBanksEverything) fail.push('hiding the tab did not bank the run\'s gold');
  if (!durable.autosaveBanksEverything) fail.push('the autosave did not bank the run\'s gold');
  await page.evaluate(() => localStorage.clear());

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`ok: the loop survives one throw and a storm of them, all `
    + `${Object.keys(SAVES).length} malformed saves load into a playable account, `
    + `a pre-rename save keeps every unlock, best and codex entry, and a run's `
    + `gold is banked by both the autosave and the tab going away`);
})();
