#!/usr/bin/env node
/* Unions: two fully evolved weapons merged into one, and the slot handed back.
 *
 * This is the deepest thing a build can reach - two weapons taken to rank 8,
 * each paired with the right passive to evolve, and only then does the merge
 * appear. Almost nobody will see one by accident, which is exactly why it can
 * be broken for a long time without anybody noticing.
 *
 * Five things have to be true of every recipe, and each of them can fail while
 * the others hold:
 *
 *   reachable  Both sources must be evolvable at all - a source with no
 *              evolvePairing, or one pointing at a passive that does not
 *              exist, can never reach the state the merge asks for, so the
 *              union is unreachable content.
 *   offered    With both sources evolved, the level-up must actually offer
 *              the merge.
 *   forged     Taking it must consume both sources, grant the result at max
 *              rank, and give the slot back. A merge that leaves you with
 *              three weapons where you had two is worse than no merge.
 *   fires      The result must have a behaviour the game implements and must
 *              deal damage. A union whose behaviour string is a typo is a
 *              weapon that does nothing, in the slot you spent a whole run
 *              earning.
 *
 * WHAT THIS FILE DOES NOT DECIDE is whether a union is worth taking. It prints
 * the ratio against the pair it consumes on every run, because that number is
 * the whole promise of the feature and somebody should see it move - but the
 * balance is the author's, and the tuning bench is where it belongs. The only
 * damage rule here is a floor: a union at a quarter of the pair it eats is not
 * weak, it is a weapon that is barely working.
 *
 * Read that ratio with its bias in mind. These dummies are IMMORTAL and
 * ROOTED, which flatters anything that lays persistent damage on the ground: a
 * zone ticking into sixteen stationary targets for eight seconds scores far
 * better here than it would against a crowd that closes, scatters and dies.
 * Pairs containing a zone - Sanctuary's above all - are being measured against
 * an inflated opponent.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-unions.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const fail = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));
  await page.goto(GAME);
  await page.waitForFunction(() => window.WS && WS.Unions);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay();
    WS.Save.db.seenManual = true;
  });

  const report = await page.evaluate(() => {
    const SEED = 8642;
    const SECONDS = 8;

    /* A fight with a fixed cast of immortal, rooted dummies at a spread of
       ranges, so a short-range whirl and a long-range storm are both given
       something to hit and the whole thing stays deterministic. */
    const arena = (build) => {
      WS.setSeed(SEED);
      WS.Game.startRun('thornhollow', 'mage');
      WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
      const p = WS.Game.player;
      p.weapons.length = 0;
      p.weaponLevels = {};
      p.combosActive = {};
      // Discoveries are a separate feature with its own guard; they would
      // otherwise fire on some of these pairs and muddy the comparison.
      for (const id of WS.ComboOrder) p.combosActive[id] = true;
      build(p);

      WS.Enemy.pool.releaseAll();
      WS.Hazard.pool.releaseAll();
      WS.Projectile.bolts.releaseAll();
      const HP = 1e12;
      const dummies = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const d = 55 + (i % 4) * 60;
        const e = WS.Enemy.spawn('mongrel',
          640 + Math.cos(a) * d, 360 + Math.sin(a) * d, 1);
        if (!e) continue;
        e.maxHealth = HP; e.health = HP; e.speed = 0;
        dummies.push(e);
      }
      p.x = 640; p.y = 360;
      const step = WS.CONST.TICK_RATE;
      for (let i = 0; i < 60 * SECONDS; i++) {
        WS.WaveManager.spawnTimer = 1e9;
        p.health = p.maxHealth;
        WS.Game.tick(step);
        if (WS.Game.state !== 'playing') break;
      }
      return Math.round(dummies.reduce((a, e) => a + (HP - e.health), 0));
    };

    const evolve = (p, id) => {
      const w = WS.Player.addWeapon(p, id);
      w.level = WS.WEAPON_MAX_LEVEL;
      p.weaponLevels[id] = WS.WEAPON_MAX_LEVEL;
      w.evolved = true;
      return w;
    };

    const out = [];
    for (const recipe of WS.Unions) {
      const [a, b] = recipe.from;
      const res = WS.Weapons[recipe.result];
      const da = WS.Weapons[a], db = WS.Weapons[b];
      const row = { result: recipe.result, from: recipe.from,
        name: res && res.name, behavior: res && res.behavior,
        known: !!res, inWeaponOrder: WS.WeaponOrder.indexOf(recipe.result) >= 0,
        hasBehavior: !!(res && WS.Weapon.behaviors[res.behavior]) };

      /* ---- reachable: can both sources actually be evolved? ------------- */
      row.pairings = [a, b].map((id) => {
        const d = WS.Weapons[id];
        return { id, pairing: d && d.evolvePairing,
          real: !!(d && d.evolvePairing && WS.Upgrades[d.evolvePairing]),
          evolveName: d && d.evolveName };
      });

      /* ---- offered: does the level-up put the merge on the table? ------- */
      WS.Game.startRun('thornhollow', 'mage');
      WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
      const p = WS.Game.player;
      p.weapons.length = 0; p.weaponLevels = {}; p.unionsForged = {};
      for (const id of WS.ComboOrder) p.combosActive[id] = true;
      evolve(p, a); evolve(p, b);
      let offers = 0, sample = null;
      for (let i = 0; i < 80; i++) {
        for (const c of WS.LevelUp.buildChoices(p)) {
          if (c.type === 'union' && c.id === recipe.result) { offers++; sample = c; }
        }
      }
      row.offers = offers;
      row.note = sample && sample.note;

      /* ---- forged: what the merge leaves you holding -------------------- */
      const before = p.weapons.length;
      if (sample) WS.LevelUp.apply(p, sample);
      row.forged = {
        weaponsBefore: before, weaponsAfter: p.weapons.length,
        sourcesGone: !WS.Player.getWeapon(p, a) && !WS.Player.getWeapon(p, b),
        has: !!WS.Player.getWeapon(p, recipe.result),
        level: (WS.Player.getWeapon(p, recipe.result) || {}).level,
        maxLevel: WS.WEAPON_MAX_LEVEL,
        reoffered: WS.LevelUp.buildChoices(p)
          .some((c) => c.type === 'union' && c.id === recipe.result),
      };

      /* ---- fires, and how it compares with what it replaced ------------- */
      row.pairDamage = arena((pl) => { evolve(pl, a); evolve(pl, b); });
      row.unionDamage = arena((pl) => {
        const w = WS.Player.addWeapon(pl, recipe.result);
        if (w) { w.level = WS.WEAPON_MAX_LEVEL; pl.weaponLevels[recipe.result] = w.level; }
      });
      out.push(row);
    }
    return out;
  });

  for (const u of report) {
    const tag = `${u.name || u.result} (${u.from.join(' + ')})`;
    if (!u.known) { fail.push(`${tag}: there is no such weapon in WS.Weapons`); continue; }
    if (!u.hasBehavior) {
      fail.push(`${tag}: its behaviour "${u.behavior}" is not one the game implements, so `
        + 'the weapon you spent a run earning does nothing');
    }
    if (u.inWeaponOrder) {
      fail.push(`${tag}: it is in WeaponOrder, so it can be handed out as an ordinary new `
        + 'weapon without ever merging anything');
    }
    for (const p of u.pairings) {
      if (!p.pairing) {
        fail.push(`${tag}: ${p.id} has no evolvePairing, so it can never evolve and the `
          + 'union is unreachable');
      } else if (!p.real) {
        fail.push(`${tag}: ${p.id} evolves with "${p.pairing}", which is not a passive that `
          + 'exists - the union is unreachable');
      }
    }
    if (!u.offers) {
      fail.push(`${tag}: both sources fully evolved and the merge was never offered in 80 `
        + 'level-ups');
    }
    if (!u.forged.has) fail.push(`${tag}: taking the merge did not grant the weapon`);
    if (!u.forged.sourcesGone) {
      fail.push(`${tag}: the merge left its sources in place - ${u.forged.weaponsBefore} `
        + `weapons became ${u.forged.weaponsAfter}, and the slot it promises back never came`);
    }
    if (u.forged.level !== u.forged.maxLevel) {
      fail.push(`${tag}: forged at rank ${u.forged.level}, not ${u.forged.maxLevel}`);
    }
    if (u.forged.reoffered) {
      fail.push(`${tag}: it is still on the table after being forged, so it can be taken twice`);
    }
    if (!(u.unionDamage > 0)) {
      fail.push(`${tag}: the forged weapon dealt no damage at all in 8 seconds surrounded `
        + 'by targets');
    } else if (u.unionDamage < u.pairDamage * 0.25) {
      /* Not a balance rule - a floor. A union at a quarter of the pair it eats
         is not weak, it is a weapon that is barely functioning, and the cause
         of that is a bug rather than a number somebody chose. */
      fail.push(`${tag}: it deals ${u.unionDamage} against the pair's ${u.pairDamage} `
        + `(${Math.round(100 * u.unionDamage / u.pairDamage)}%) - that is not tuning, `
        + 'something about the weapon is not working');
    }
  }

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    console.error('');
    for (const u of report) {
      console.error(`    ${(u.name || u.result).padEnd(14)} ${String(u.behavior).padEnd(7)} `
        + `offered ${String(u.offers).padStart(3)}x   pair ${String(u.pairDamage).padStart(7)} `
        + `-> union ${String(u.unionDamage).padStart(7)}`);
    }
    process.exit(1);
  }
  const ratio = (u) => Math.round(100 * u.unionDamage / u.pairDamage);
  const under = report.filter((u) => ratio(u) < 100);
  console.log(`ok: all ${report.length} unions are reachable, offered once both sources are `
    + 'evolved, consume both and hand the slot back, cannot be taken twice, and every one of '
    + 'them fires. Against the evolved pair each one eats, on rooted dummies: '
    + report.map((u) => `${u.name} ${ratio(u)}%`).join(', ')
    + (under.length ? ` - ${under.length} of ${report.length} come out BELOW the pair they `
      + "replace, which is the author's to tune and not this file's to fail on." : '.'));
})();
