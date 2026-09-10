#!/usr/bin/env node
/* Discoveries: does carrying the pair actually DO the thing it says?
 *
 * A combo is a line of data that pokes a value into `w.mods`, and something
 * elsewhere has to read that value back out. Nothing connects the two - no
 * type, no registry, no call - so a combo whose mod nobody reads sets its
 * flag, toasts "Discovery!", writes itself into the codex, and changes
 * absolutely nothing about the game. It looks completely correct from every
 * angle except playing it.
 *
 * That is not hypothetical. Truestrike sets `homing` on Volley, and homing was
 * only ever read inside fireAimedShot - the `aimed` path. Volley is `spray`.
 * So the discovery that exists to make arrows curve had never once made an
 * arrow curve.
 *
 * The rule here is therefore not "the mod was set". It is: with the pair and
 * without it, the same loadout has to behave DIFFERENTLY. Same weapons, same
 * seed, same dummies, same number of ticks - the only difference is whether
 * combo.apply ran. If the two runs are indistinguishable, the discovery is
 * decorative.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-combos.js
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
  await page.waitForFunction(() => window.WS && WS.Combos);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay();
    WS.Save.db.seenManual = true;
  });

  const report = await page.evaluate(() => {
    /* One controlled fight, run twice per combo.
     *
     * Both runs carry BOTH weapons - it is the mods that differ, not the
     * loadout - so anything that moves is the discovery and not the extra
     * weapon. The dummies are immortal and rooted, which keeps the whole thing
     * deterministic: nothing dies, so nothing drops, so no level-up and no
     * change of build partway through. */
    const SEED = 31337;
    const SECONDS = 6;

    const trial = (comboId, withCombo) => {
      WS.setSeed(SEED);
      WS.Game.startRun('thornhollow', 'mage');
      WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
      const p = WS.Game.player;
      p.weapons.length = 0;
      p.weaponLevels = {};
      p.combosActive = {};
      const c = WS.Combos[comboId];
      /* Suppressing the discovery means telling the game it has ALREADY been
       * found, which is the one flag ComboSystem.check consults before it
       * applies anything. Nothing else works: Player.addWeapon calls check
       * itself, so by the time a caller could intervene the mods are already
       * on the weapon.
       *
       * The first version of this file got that wrong and applied the combo a
       * SECOND time in the "with" run, which measured something else entirely.
       * Four combos accumulate (`(x || 1) * mult`, `(x || 0) + n`) and five
       * assign (`= value`), so the four appeared to work - they were doubled -
       * and the five appeared dead, when in truth every one of them was
       * active in both runs and nothing was being tested at all. */
      if (!withCombo) p.combosActive[comboId] = true;
      for (const id of c.weapons) WS.Player.addWeapon(p, id);

      WS.Enemy.pool.releaseAll();
      WS.Hazard.pool.releaseAll();
      WS.Projectile.bolts.releaseAll();
      const HP = 1e12;
      const dummies = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const d = 60 + (i % 4) * 62;                 // 60 to 246 out
        const e = WS.Enemy.spawn('mongrel',
          640 + Math.cos(a) * d, 360 + Math.sin(a) * d, 1);
        if (!e) continue;
        e.maxHealth = HP; e.health = HP; e.speed = 0; e.template = Object.assign(
          Object.create(Object.getPrototypeOf(e.template)), e.template, { speed: 0 });
        dummies.push(e);
      }

      /* What each weapon actually emits, recorded at the moment it emits it.
         This is the honest place to look: a spec is what the behaviour decided,
         before anything downstream has a chance to lose it. */
      const emitted = [];
      const realLaunch = WS.Projectile.launchBolt;
      WS.Projectile.launchBolt = function (x, y, vx, vy, spec) {
        emitted.push({ src: spec.source,
          homing: !!spec.homingTarget || !!spec.homing,
          splash: Math.round(spec.splash || 0),
          slow: +(spec.slowFactor || 0).toFixed(2),
          bounces: spec.bounces || 0,
          proc: +(spec.procChain || 0).toFixed(2),
          heal: +(spec.heal || 0).toFixed(2),
          dmg: Math.round(spec.damage || 0) });
        return realLaunch.apply(this, arguments);
      };
      let healed = 0;
      const realHeal = WS.Player.heal;
      WS.Player.heal = function (pl, amount, source) {
        healed += amount || 0;
        return realHeal.apply(this, arguments);
      };
      let hazards = 0;
      const realHazard = WS.Hazard.spawn;
      WS.Hazard.spawn = function () { hazards++; return realHazard.apply(this, arguments); };

      p.x = 640; p.y = 360;
      WS.WaveManager.spawnTimer = 1e9;
      const step = WS.CONST.TICK_RATE;
      for (let i = 0; i < 60 * SECONDS; i++) {
        WS.WaveManager.spawnTimer = 1e9;
        p.health = p.maxHealth * 0.5;      // leave room for a heal to register
        WS.Game.tick(step);
        if (WS.Game.state !== 'playing') break;
      }
      WS.Projectile.launchBolt = realLaunch;
      WS.Player.heal = realHeal;
      WS.Hazard.spawn = realHazard;

      const dealt = dummies.reduce((a, e) => a + (HP - e.health), 0);
      const per = {};
      for (const e of emitted) {
        const s = per[e.src] || (per[e.src] = { n: 0, homing: 0, splash: 0, slow: 0,
          bounces: 0, proc: 0, heal: 0, dmg: 0 });
        s.n++;
        if (e.homing) s.homing++;
        s.splash = Math.max(s.splash, e.splash);
        s.slow = Math.max(s.slow, e.slow);
        s.bounces = Math.max(s.bounces, e.bounces);
        s.proc = Math.max(s.proc, e.proc);
        s.heal = Math.max(s.heal, e.heal);
        s.dmg = Math.max(s.dmg, e.dmg);
      }
      return { dealt: Math.round(dealt), healed: Math.round(healed * 100) / 100,
        hazards, bolts: emitted.length, per };
    };

    const out = [];
    for (const id of WS.ComboOrder) {
      const c = WS.Combos[id];
      out.push({ id, name: c.name, weapons: c.weapons.slice(),
        behaviors: c.weapons.map((w) => WS.Weapons[w].behavior),
        off: trial(id, false), on: trial(id, true) });
    }
    return out;
  });

  /** Everything that could have moved, as one comparable shape. */
  const shape = (t) => JSON.stringify({ dealt: t.dealt, healed: t.healed,
    hazards: t.hazards, bolts: t.bolts, per: t.per });

  const inert = [];
  for (const c of report) {
    if (shape(c.off) === shape(c.on)) {
      inert.push(c);
      fail.push(`${c.name} (${c.weapons.join(' + ')}) changes NOTHING - `
        + `${c.behaviors.join(' + ')} - same damage (${c.on.dealt}), same healing, same `
        + `${c.on.bolts} projectiles with identical properties whether the discovery is `
        + 'applied or not');
    }
  }

  /* And the one it was written for, said out loud: Truestrike exists to make
     arrows curve, so an arrow has to come out able to curve. */
  const ts = report.find((c) => c.id === 'truestrike');
  if (ts) {
    const on = (ts.on.per.volley || {}).homing || 0;
    const n = (ts.on.per.volley || {}).n || 0;
    if (!n) fail.push('Truestrike: the volley never fired, so nothing was measured');
    else if (!on) {
      fail.push(`Truestrike: ${n} arrows left the bow and not one of them can seek - `
        + 'the discovery that exists to make arrows curve does not reach the weapon '
        + 'that fires them');
    }
  }

  await browser.close();

  const table = report.map((c) => {
    const d = c.off.dealt ? ((c.on.dealt / c.off.dealt - 1) * 100).toFixed(0) : '0';
    return `${c.name}: ${d > 0 ? '+' : ''}${d}% damage`;
  });
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    console.error('');
    console.error('  measured, off -> on:');
    for (const c of report) {
      console.error(`    ${c.name.padEnd(20)} damage ${String(c.off.dealt).padStart(7)} -> `
        + `${String(c.on.dealt).padStart(7)}   heal ${c.off.healed} -> ${c.on.healed}`
        + `   bolts ${c.off.bolts} -> ${c.on.bolts}`);
    }
    process.exit(1);
  }
  console.log(`ok: all ${report.length} discoveries change what the same loadout does - `
    + table.join(', '));
})();
