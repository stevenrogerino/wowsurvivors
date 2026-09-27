#!/usr/bin/env node
/* The callings (src/game/callings.js): the first eight survivors' own powers.
 *
 * A guard, and it checks the promises the callings make:
 *
 *   - every survivor has a signature blessing, it exists, and it is in the
 *     draft; every blessing in the game is in the draft order, and nothing in
 *     the order is missing (a rewrite once dropped five of the older
 *     blessings from blessings.js and the midnight draft threw on the gap)
 *   - a calling is a blessing ANYONE can take: on a survivor it does not
 *     belong to, taking it turns the system on
 *   - a survivor's edge is small and inert: it is exactly Config.callingEdge
 *     on one number, and before the blessing is taken nothing is running
 *     (no meter, no system)
 *   - in real waves each of the eight actually fires - the Flood tide, a
 *     barrier breaking, a Cutthroat, a Quarry taken, a Boil Over, a Reaping,
 *     a waystone, a Hammerfall - and each has its meter on the HUD
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => {
    let now = 0, q = [];
    window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
    performance.now = () => now;
    window.__pump = (n, dt) => { for (let i = 0; i < n; i++) { now += dt * 1000; const r = q; q = []; for (const cb of r) cb(now); } };
  });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);

  const r = await page.evaluate(() => {
    const fail = [];
    __pump(2, 1 / 60);
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay(); WS.Save.db.seenManual = true; WS.Save.unlockAll();
    WS.Save.settings.difficulty = 'veteran';
    WS.Game.openLevelUp = () => {}; WS.Game.presentLevelUp = () => {};

    // The draft is whole.
    const missing = WS.BlessingOrder.filter((id) => !WS.Blessings[id]);
    const unordered = Object.keys(WS.Blessings).filter((id) => !WS.BlessingOrder.includes(id));
    if (missing.length) fail.push('in the draft order but not defined: ' + missing.join(', '));
    if (unordered.length) fail.push('defined but never offered: ' + unordered.join(', '));
    for (const id of WS.CharacterOrder) {
      const sig = WS.Characters[id].signatureBlessing;
      if (!sig || !WS.Blessings[sig]) fail.push(id + ' has no signature blessing');
    }

    const CALLINGS = {
      mage: ['arcane_surge', 'overflowAttuned', 'overflowBonus', 'overflows'],
      priest: ['radiant_barrier', 'barrierAttuned', 'barrierBonus', 'barriersBroken'],
      rogue: ['opportunist', 'comboAttuned', 'comboBonus', 'eviscerates'],
      hunter: ['quarry', 'markAttuned', 'markHaste', 'marksClaimed'],
      warrior: ['seething_blood', 'rageAttuned', 'rageBonus', 'enrages'],
      warlock: ['reapers_tithe', 'soulAttuned', 'soulBonus', 'rends'],
      shaman: ['waystones', 'totemAttuned', 'totemReach', 'waystones'],
      paladin: ['conviction', 'holyAttuned', 'holyBonus', 'storms'],
    };
    const edge = WS.Config.callingEdge;
    // Walk like a player (tools/dawn-fight.js): gems are gathered on foot.
    const kite = (p) => {
      const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT, t = WS.Game.run.time;
      let tx = W / 2 + Math.cos(t * 0.5) * 240, ty = H / 2 + Math.sin(t * 0.5) * 170;
      const near = WS.Enemy.findNearest(p.x, p.y, 160);
      if (near) {
        const dx = p.x - near.x, dy = p.y - near.y, d = Math.hypot(dx, dy) || 1;
        tx = p.x + dx / d * 250; ty = p.y + dy / d * 250;
      }
      const k = WS.Input.keys, h = WS.Input.held;
      k.left = h.left = tx - p.x < -6; k.right = h.right = tx - p.x > 6;
      k.up = h.up = ty - p.y < -6; k.down = h.down = ty - p.y > 6;
    };
    const fired = {};
    for (const [hero, [bl, flag, bonus, counter]] of Object.entries(CALLINGS)) {
      if (WS.Characters[hero].signatureBlessing !== bl) fail.push(`${hero}'s signature is not ${bl}`);
      // The edge: exactly callingEdge (the hunter's is expressed as a wait a
      // fifth shorter, which IS a quarter sooner), and nothing running yet.
      WS.setSeed(3); WS.Game.startRun('thornhollow', hero);
      let p = WS.Game.player;
      const want = hero === 'hunter' ? 1 - 1 / (1 + edge) : edge;
      if (Math.abs(p[bonus] - want) > 1e-9) fail.push(`${hero}'s edge ${bonus} is ${p[bonus]}, not ${want}`);
      if (p[flag] > 0) fail.push(`${hero} starts with ${bl} already running`);
      if (WS.Calling.meters(p).length) fail.push(`${hero} shows a calling meter before taking it`);
      // Anyone can take it: the paladin takes the mage's, everyone else the
      // paladin takes... any survivor who is not the owner.
      const other = hero === 'paladin' ? 'mage' : 'paladin';
      WS.setSeed(3); WS.Game.startRun('thornhollow', other);
      WS.Game.chooseBlessing({ type: 'blessing', id: bl });
      p = WS.Game.player;
      if (!(p[flag] > 0)) fail.push(`${bl} taken by the ${other} did not turn on`);
      // In real waves, on its owner, with a real arsenal: does it fire?
      WS.setSeed(5); WS.Game.startRun('thornhollow', hero);
      WS.Game.chooseBlessing({ type: 'blessing', id: bl });
      p = WS.Game.player;
      for (const id of ['volley', 'arcweb', 'axe_gyre', 'knifestorm']) {
        const w = WS.Player.addWeapon(p, id);
        if (w) { w.level = WS.WEAPON_MAX_LEVEL; p.weaponLevels[id] = w.level; w.evolved = true; }
      }
      p.critChance += 0.3;                    // the rogue's needs crits to happen
      WS.Game.run.time = 540;
      let hud = false;
      for (let i = 0; i < 60 * 50; i++) {
        WS.Game.pendingLevelUps = 0; WS.Game.leveling = false;
        if (WS.Game.state !== 'playing') { WS.UI.closeOverlay(); WS.Game.state = 'playing'; }
        // Hurt enough to heal, never enough to fall.
        p.health = Math.max(p.health, p.maxHealth * 0.35);
        if (hero === 'priest' && i % 120 === 0) WS.Player.heal(p, p.maxHealth, 'potion');
        if (hero === 'priest' && i % 120 === 60) { p.invulnerable = 0; WS.Player.takeDamage(p, p.maxHealth * 0.5, 'test'); }
        // The tanks' callings are fed by blows: a kiting bot barely takes
        // any, so these two are handed one a second, as standing in it would.
        if ((hero === 'warrior' || hero === 'paladin') && i % 60 === 30) {
          p.invulnerable = 0; WS.Player.takeDamage(p, p.maxHealth * 0.08, 'test');
        }
        kite(p);
        __pump(1, 1 / 60);
        if (i % 60 === 0 && document.querySelector('#hud .meter.calling')) hud = true;
      }
      fired[hero] = WS.Game.run[counter] || 0;
      if (!fired[hero]) fail.push(`${bl} never fired in 50s of waves on the ${hero}`);
      if (!hud) fail.push(`${bl} has no meter on the HUD`);
    }
    return { fail, fired };
  });
  if (errs.length) r.fail.push('page errors: ' + errs.slice(0, 3).join(' | '));
  if (r.fail.length) {
    console.log('FAIL');
    for (const f of r.fail) console.log('  - ' + f);
    process.exitCode = 1;
  } else {
    const f = r.fired;
    console.log(`ok: all 12 survivors have a signature blessing and every blessing is in the draft; each of the eight callings turns on for anyone who takes it, the owner's edge is exactly ${'a quarter'} and runs nothing until then, and in 50s of waves each fired - ${f.mage} floods, ${f.priest} barriers broken, ${f.rogue} cutthroats, ${f.hunter} quarry taken, ${f.warrior} boil overs, ${f.warlock} reapings, ${f.shaman} waystones, ${f.paladin} hammerfalls - with its meter on the HUD`);
  }
  await b.close();
})();
