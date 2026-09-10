#!/usr/bin/env node
/* Do the passives reach every weapon they claim to?
 *
 * A passive is a number on the player and a read somewhere in weapon.js, and
 * there are ten behaviours that each decide for themselves whether to do the
 * read. Nothing connects the two. So a passive can be perfectly implemented,
 * described accurately on its card, bought three times - and do nothing at all
 * for the weapon in your hand, with no symptom except that the run feels off.
 *
 * Duplicity is the case this file was written for. Its own detail says it adds
 * a projectile to "bolts, knives, arrows, axes, shields, storm strikes, and
 * chain leaps", and that "auras are unaffected". Measured, six of those seven
 * were true and SHIELDS were not: the bounce behaviour raised the ricochet
 * budget correctly and the shield still landed exactly four hits whether its
 * budget was three, six or eleven, because a ricochet picked its next mark
 * excluding only the enemy it had just left - so it bounced back onto someone
 * it had already hit, passed straight through (hitBy stops a second hit) and
 * flew off the field with the whole extra budget unspent.
 *
 * The table below is the CLAIM, written out. Every behaviour is listed and
 * marked affected or not, so adding a behaviour without deciding what a
 * passive means for it fails here rather than shipping silently.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-scaling.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const fail = [];

/* What Duplicity says it does, behaviour by behaviour. The words in brackets
   are the ones its own detail line uses, so the two can be compared by eye. */
const DUPLICITY = {
  aimed: true,     // "bolts"
  spray: true,     // "arrows"
  ring: true,      // "knives"
  orbit: true,     // "axes"
  bounce: true,    // "shields"
  storm: true,     // "storm strikes"
  chain: true,     // "chain leaps"
  nova: false,     // "auras are unaffected"
  zone: false,     // "auras are unaffected"
  beam: false,     // a lance is one line; the detail claims nothing for it
};

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));
  await page.goto(GAME);
  await page.waitForFunction(() => window.WS && WS.Weapons);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay();
    WS.Save.db.seenManual = true;
  });

  const report = await page.evaluate(() => {
    /* One weapon per behaviour, fired at a fixed ring of immortal, rooted
       dummies spread from close to far, so a whirl and a storm are both given
       something to hit and the run is deterministic. */
    const pick = {};
    for (const id of Object.keys(WS.Weapons)) {
      const d = WS.Weapons[id];
      if (!pick[d.behavior]) pick[d.behavior] = id;
    }
    const trial = (id, bonus) => {
      WS.setSeed(555);
      WS.Game.startRun('thornhollow', 'mage');
      WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
      const pl = WS.Game.player;
      pl.weapons.length = 0; pl.weaponLevels = {};
      for (const c of WS.ComboOrder) pl.combosActive[c] = true;   // guarded elsewhere
      WS.Player.addWeapon(pl, id);
      pl.projectileBonus = bonus;
      WS.Enemy.pool.releaseAll();
      WS.Hazard.pool.releaseAll();
      WS.Projectile.bolts.releaseAll();
      const HP = 1e12, ds = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, d = 55 + (i % 4) * 60;
        const e = WS.Enemy.spawn('mongrel', 640 + Math.cos(a) * d, 360 + Math.sin(a) * d, 1);
        if (!e) continue;
        e.maxHealth = HP; e.health = HP; e.speed = 0; ds.push(e);
      }
      pl.x = 640; pl.y = 360;
      for (let i = 0; i < 60 * 8; i++) {
        WS.WaveManager.spawnTimer = 1e9;
        pl.health = pl.maxHealth;
        WS.Game.tick(WS.CONST.TICK_RATE);
        if (WS.Game.state !== 'playing') break;
      }
      return Math.round(ds.reduce((a, e) => a + (HP - e.health), 0));
    };
    const out = [];
    for (const beh of Object.keys(pick)) {
      const id = pick[beh];
      const base = trial(id, 0), boosted = trial(id, 3);
      out.push({ beh, id, name: WS.Weapons[id].name, base, boosted,
        pct: base ? Math.round((boosted / base - 1) * 100) : 0 });
    }
    return { rows: out, behaviours: Object.keys(WS.Weapon.behaviors),
      detail: WS.Upgrades.quantity.detail, description: WS.Upgrades.quantity.description };
  });

  for (const b of report.behaviours) {
    if (!(b in DUPLICITY)) {
      fail.push(`the "${b}" behaviour exists and nothing here says whether Duplicity is `
        + 'meant to reach it - decide, and put it in the table at the top of this file');
    }
  }
  for (const r of report.rows) {
    const want = DUPLICITY[r.beh];
    if (want === undefined) continue;
    if (want && r.pct <= 0) {
      fail.push(`Duplicity does nothing for ${r.name} (${r.beh}) - three ranks of it leave `
        + `the damage at exactly ${r.base}, and the upgrade's own detail says it applies`);
    }
    if (!want && r.pct > 0) {
      fail.push(`Duplicity changes ${r.name} (${r.beh}) by ${r.pct}% and the upgrade's own `
        + 'detail says it does not - one of the two is lying to the player');
    }
  }
  // and the card has to keep naming the exclusions, or the measurement above
  // is a rule nobody reading the game could have predicted
  for (const word of ['aura', 'beam']) {
    if (!new RegExp(word, 'i').test(report.detail)) {
      fail.push(`Duplicity's detail does not mention ${word}s, and ${word}s do not get it - `
        + `"${report.detail}"`);
    }
  }

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    console.error('');
    for (const r of report.rows.slice().sort((a, b) => a.pct - b.pct)) {
      console.error(`    ${r.beh.padEnd(7)} ${r.name.padEnd(16)} `
        + `${String(r.base).padStart(6)} -> ${String(r.boosted).padStart(6)}  `
        + `${r.pct >= 0 ? '+' : ''}${r.pct}%   (expected ${DUPLICITY[r.beh] ? 'a gain' : 'nothing'})`);
    }
    process.exit(1);
  }
  const on = report.rows.filter((r) => DUPLICITY[r.beh]).sort((a, b) => a.pct - b.pct);
  console.log(`ok: three ranks of Duplicity reach all ${on.length} behaviours its card claims `
    + `(${on.map((r) => `${r.beh} +${r.pct}%`).join(', ')}) and none of the `
    + `${report.rows.length - on.length} it excludes`);
})();
