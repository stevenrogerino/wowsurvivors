#!/usr/bin/env node
/* Can a survivor built to stand and take it actually stand and take it?
 *
 * Not a guard: the instrument the armour, thorns and aura numbers were fitted
 * with. A tester found that "stand there and tank" builds do not work - that
 * whatever you put into armour, health, thorns and auras, the only defence
 * that counts on a hard night is not being there.
 *
 * Each build stands still in the middle of the Pale Wastes on Professional
 * with Hyper (MAP, DIFF, HYPER=0 change that) from TIME seconds, and the
 * clock runs until it falls or LIMIT seconds pass. Reported: how long it
 * stood, damage taken and healed per second while it did, and how much of
 * the killing its thorns and aura did. Three builds:
 *
 *   glass     a mage with four evolved weapons and nothing defensive
 *   tank      a warrior with Unyielding Faith and every defensive passive at
 *             max (Ironhide, Vitality, Thorns, Warding Light, Chilling
 *             Presence, Searing Aura), four evolved close-range weapons
 *             including two healers
 *   tank-nh   the same tank with its two healers swapped for damage, so the
 *             armour and thorns are measured on their own
 *
 *   node tools/tank-sim.js
 *   TIME=600 LIMIT=90 SEEDS=3 node tools/tank-sim.js
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
  await page.waitForTimeout(300);
  await page.evaluate(() => { if (WS.Prologue.active) WS.Prologue.finish(); WS.UI.closeOverlay(); WS.Save.db.seenManual = true; });

  const opts = {
    TIME: +(process.env.TIME || 900), LIMIT: +(process.env.LIMIT || 60), N: +(process.env.SEEDS || 3),
    MAP: process.env.MAP || 'palewastes', DIFF: process.env.DIFF || 'professional', HYPER: process.env.HYPER !== '0',
  };
  const rows = await page.evaluate(({ TIME, LIMIT, N, MAP, DIFF, HYPER }) => {
    WS.Save.unlockAll();
    WS.Save.settings.difficulty = DIFF;
    WS.Save.db.unlocks.hyper[MAP] = true;
    WS.Save.db.hyperArmed = HYPER;
    WS.Game.openLevelUp = () => {}; WS.Game.presentLevelUp = () => {};
    const keepPlaying = () => {
      WS.Game.pendingLevelUps = 0; WS.Game.leveling = false;
      if (WS.Game.state !== 'playing' && WS.Game.state !== 'dying' && WS.Game.state !== 'over') {
        WS.UI.closeOverlay(); WS.Game.state = 'playing';
      }
      WS.Game.timeScale = 1;
    };
    const DEF = { armor: 5, vitality: 5, thorns: 5, warding_light: 3, chilling_presence: 3, searing: 5 };
    const BUILDS = {
      glass: { hero: 'mage', blessing: 'kings', weapons: ['seeking_motes', 'arcweb', 'volley', 'rimeshard'], passives: {} },
      tank: { hero: 'warrior', blessing: 'unyielding', weapons: ['axe_gyre', 'reaving_arc', 'hallowed_ring', 'dawnpulse'], passives: DEF },
      'tank-nh': { hero: 'warrior', blessing: 'unyielding', weapons: ['axe_gyre', 'arcweb', 'knifestorm', 'volley'], passives: DEF },
    };
    const run1 = (name, seed) => {
      const B = BUILDS[name];
      WS.setSeed(seed);
      WS.Game.startRun(MAP, B.hero);
      WS.Game.chooseBlessing({ type: 'blessing', id: B.blessing });
      const pl = WS.Game.player;
      pl.weapons.length = 0; pl.weaponLevels = {};
      for (const id of B.weapons) {
        const w = WS.Player.addWeapon(pl, id);
        w.level = WS.WEAPON_MAX_LEVEL; pl.weaponLevels[id] = w.level; w.evolved = true;
      }
      for (const [id, n] of Object.entries(B.passives)) {
        for (let i = 0; i < n; i++) WS.LevelUp.apply(pl, { type: 'stat', id });
      }
      pl.health = pl.maxHealth;
      WS.Enemy.pool.releaseAll(); WS.Hazard.pool.releaseAll(); WS.Projectile.bolts.releaseAll();
      WS.Game.run.time = TIME;
      pl.x = WS.CONST.WORLD_WIDTH / 2; pl.y = WS.CONST.WORLD_HEIGHT / 2;
      let taken = 0, healed = 0, thorns = 0, aura = 0, all = 0, t = 0;
      const rh = WS.Player.heal;
      WS.Player.heal = function (p, a) { healed += a * (p.healingMult || 1); return rh.apply(this, arguments); };
      const rd = WS.Enemy.damage;
      WS.Enemy.damage = function (e, amount, isCrit, source) {
        if (e && !e._dead && e.invuln <= 0) {
          const got = Math.min(amount, Math.max(0, e.health));
          all += got;
          if (source === 'thorns') thorns += got;
          if (source === 'searing') aura += got;
        }
        return rd.apply(this, arguments);
      };
      const before = WS.Game.run.damageTaken;
      for (let i = 0; i < 60 * LIMIT; i++) {
        keepPlaying();
        WS.Game.tick(WS.CONST.TICK_RATE);
        t += WS.CONST.TICK_RATE;
        if (WS.Game.state === 'dying' || WS.Game.state === 'over' || pl.health <= 0) break;
      }
      WS.Player.heal = rh; WS.Enemy.damage = rd;
      taken = WS.Game.run.damageTaken - before;
      return { t, taken: taken / t, healed: healed / t, thorns: all ? thorns / all : 0, aura: all ? aura / all : 0,
        hp: pl.maxHealth, armor: pl.armor };
    };
    const SEEDS = Array.from({ length: N }, (_, i) => 5 + i * 19);
    const out = [];
    for (const name of Object.keys(BUILDS)) {
      const r = SEEDS.map((s) => run1(name, s));
      const avg = (k) => r.reduce((s, x) => s + x[k], 0) / r.length;
      out.push({ name, t: avg('t'), taken: avg('taken'), healed: avg('healed'), thorns: avg('thorns'),
        aura: avg('aura'), hp: avg('hp'), armor: avg('armor') });
    }
    return out;
  }, opts);

  console.log(`standing still from t=${opts.TIME}s, ${opts.MAP}, ${opts.DIFF}${opts.HYPER ? ', Hyper' : ''}, limit ${opts.LIMIT}s, ${opts.N} seeds`);
  console.log('  ' + 'build'.padEnd(9) + 'hp'.padStart(6) + 'armor'.padStart(7) + 'stood'.padStart(8)
    + 'taken/s'.padStart(10) + 'healed/s'.padStart(10) + 'thorns'.padStart(8) + 'aura'.padStart(7));
  for (const r of rows) {
    console.log('  ' + r.name.padEnd(9) + r.hp.toFixed(0).padStart(6) + r.armor.toFixed(0).padStart(7)
      + (r.t.toFixed(1) + 's').padStart(8) + r.taken.toFixed(0).padStart(10) + r.healed.toFixed(0).padStart(10)
      + ((r.thorns * 100).toFixed(0) + '%').padStart(8) + ((r.aura * 100).toFixed(0) + '%').padStart(7));
  }
  await b.close();
})();
