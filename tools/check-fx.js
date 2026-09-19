#!/usr/bin/env node
/* Effects guard rail.
 *
 * FX.spray takes a DIRECTION. A call site handed it a projectile's raw
 * velocity instead, so every impact launched sparks at direction x speed -
 * tens of thousands of px/s - which crosses the whole 1280px world inside a
 * frame. On screen that read as tiny circles blinking at random places
 * whenever a shot connected, and nothing in the simulation was wrong enough
 * to notice: no NaN, no crash, no error. Only the particles' speed gave it
 * away.
 *
 * So that is what this measures. It plays a real run and asserts that no
 * particle ever moves faster than anything that spawns one asks for, and that
 * none of them end up outside the world.
 *
 * It checks seeking bolts for the mirror-image failure. Homing used to steer
 * by lerping the velocity toward target-direction x speed, and a lerp between
 * two vectors of equal length gives a chord - always shorter than the radius -
 * so every frame a bolt turned it lost a little speed. On the near-180-degree
 * turn a bolt makes right after piercing something it shed most of its speed
 * in a few frames and settled into a hover, sitting on the field like a mine.
 * A bolt now holds its launch speed exactly, so that is the assertion.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-fx.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

// The fastest particle any caller asks for. FX.burst tops out around 320 on a
// boss death; the ceiling is generous, because the failure it catches was two
// orders of magnitude over.
const MAX_SPEED = 1200;

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const fail = [];
  page.on('pageerror', (e) => fail.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
  });
  const worst = await page.evaluate((MAX_SPEED) => {
    WS.Game.startRun('thornhollow', 'mage');
      /* Straight to the game, not through the card.
         Picking a card is a UI act and the UI now holds the frame for a beat
         before it resolves - which a harness that drives Game.update in a
         synchronous loop can never wait out. The choice screens have their own
         guard in tools/check-choice.js; what this file is measuring is what
         happens after one. */
    const BLESSING = { type: 'blessing', id: 'kings' };
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT, K = WS.Input.keys;
    let maxSpeed = 0, offworld = 0, nan = 0, seen = 0, fastest = null;
    let slowestBolt = 1, boltSamples = 0, stalled = null;
    for (let i = 0; i < 60 * 240; i++) {
      if (WS.Game.state === 'blessing') { WS.Game.chooseBlessing(BLESSING); continue; }
      if (WS.Game.state === 'levelup') {
        WS.Game.chooseLevelUp(WS.Game.levelChoices[0]);
        continue;
      }
      if (WS.Game.state !== 'playing') break;
      const pl = WS.Game.player, t = WS.Game.run.time;
      let tx = W / 2 + Math.cos(t * 0.5) * 240, ty = H / 2 + Math.sin(t * 0.5) * 170;
      const near = WS.Enemy.findNearest(pl.x, pl.y, 160);
      if (near) {
        const dx = pl.x - near.x, dy = pl.y - near.y, d = Math.hypot(dx, dy) || 1;
        tx = pl.x + dx / d * 250; ty = pl.y + dy / d * 250;
      }
      tx = Math.max(80, Math.min(W - 80, tx)); ty = Math.max(80, Math.min(H - 80, ty));
      K.left = tx - pl.x < -6; K.right = tx - pl.x > 6;
      K.up = ty - pl.y < -6; K.down = ty - pl.y > 6;
      pl.health = pl.maxHealth;              // survive long enough to observe
      WS.Game.update(1 / 60);

      // Seeking bolts must not lose speed while they turn.
      const bolts = WS.Projectile.bolts;
      for (let n = 0; n < bolts.count; n++) {
        const bo = bolts.active[n];
        if (!bo.homing || !bo.speed) continue;
        boltSamples++;
        const ratio = Math.hypot(bo.vx, bo.vy) / bo.speed;
        if (ratio < slowestBolt) { slowestBolt = ratio; stalled = bo.art; }
      }

      const parts = WS.FX.particles;
      for (let n = 0; n < parts.count; n++) {
        const p = parts.active[n];
        seen++;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) ||
            !Number.isFinite(p.vx) || !Number.isFinite(p.vy)) { nan++; continue; }
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > maxSpeed) { maxSpeed = sp; fastest = p.colour; }
        if (p.x < -200 || p.x > W + 200 || p.y < -200 || p.y > H + 200) offworld++;
      }
    }
    return { maxSpeed, offworld, nan, seen, fastest, limit: MAX_SPEED,
      slowestBolt, boltSamples, stalled };
  }, MAX_SPEED);

  if (worst.seen === 0) fail.push('no particles observed at all - the harness never got into combat');
  if (worst.nan > 0) fail.push(`${worst.nan} particle samples had non-finite position or velocity`);
  if (worst.maxSpeed > MAX_SPEED) {
    fail.push(`fastest particle ${worst.maxSpeed.toFixed(0)} px/s exceeds the ${MAX_SPEED} px/s ceiling` +
      ` (colour ${worst.fastest}) - a caller is probably passing a velocity where a direction is expected`);
  }
  if (worst.offworld > 0) fail.push(`${worst.offworld} particle samples were outside the world`);
  if (worst.boltSamples === 0) fail.push('no seeking bolts observed - mage should fire them from the first shot');
  else if (worst.slowestBolt < 0.98) {
    fail.push(`a seeking bolt fell to ${(worst.slowestBolt * 100).toFixed(0)}% of its launch speed` +
      ` (art ${worst.stalled}) - steering is bleeding speed, and a bolt that stalls sits on the field like a mine`);
  }

  /* ---- the numbers do not land on each other ----------------------------
   * Measured across 778 sampled frames of a ten-minute run, 64% of the live
   * floating text was sitting on top of another number, and the worst frames
   * were at 100% - every number on screen overlapping another. Two things
   * fixed it: a number looks for a clear spot before it lands (the fan it had
   * was global, so two hits seven pushes apart got the same slot and the same
   * pixel), and repeat hits on one target add to the number already there
   * instead of stacking another beside it. */
  const text = await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Game.startRun('thornhollow', 'shaman');
    if (WS.Game.state === 'blessing') WS.Game.chooseBlessing(WS.Game.blessingChoices[0]);
    const pl = WS.Game.player;
    let over = 0, total = 0, samples = 0;
    const worstList = [];
    for (let i = 0; i < 60 * 540; i++) {
      if (WS.Game.state === 'levelup') { WS.Game.chooseLevelUp(WS.Game.levelChoices[0]); continue; }
      if (WS.Game.state === 'blessing') { WS.Game.chooseBlessing(WS.Game.blessingChoices[0]); continue; }
      if (WS.Game.state !== 'playing') break;
      pl.health = pl.maxHealth;
      WS.Game.tick(WS.CONST.TICK_RATE);
      WS.Game.update(WS.CONST.TICK_RATE);
      if (i < 60 * 120 || i % 41) continue;
      const pool = WS.FX.texts;
      const live = pool.active.slice(0, pool.count);
      const box = (t) => ({ x: t.x, y: t.y, w: t.text.length * t.size * 0.58, h: t.size });
      let hits = 0;
      for (let a = 0; a < live.length; a++) {
        const A = box(live[a]);
        for (let c = 0; c < live.length; c++) {
          if (c === a) continue;
          const B = box(live[c]);
          if (Math.abs(A.x - B.x) < (A.w + B.w) / 2 && Math.abs(A.y - B.y) < (A.h + B.h) / 2) {
            hits++; break;
          }
        }
      }
      total += live.length; over += hits; samples++;
      if (live.length) worstList.push(hits / live.length);
    }
    /* The 95th percentile, not the maximum. One frame's worth of numbers is a
       small sample and its extremum swings by twenty points between identical
       runs - a bound set on it fails for reasons that have nothing to do with
       the code. */
    worstList.sort((a, b) => a - b);
    const p95 = worstList.length ? worstList[Math.floor(worstList.length * 0.95)] : 0;
    return { pct: Math.round(over / Math.max(1, total) * 100),
      worst: Math.round(p95 * 100), total, samples };
  });
  if (text.samples < 40) fail.push(`only ${text.samples} frames of combat text sampled`);
  if (text.pct > 28) {
    fail.push(`${text.pct}% of floating combat text overlaps another number `
      + '- the field reads as a smear of digits rather than as feedback');
  }
  if (text.worst > 80) {
    fail.push(`in the busiest frames ${text.worst}% of the numbers were on top of each other`);
  }

  /* ---- a weapon starts modest and gets epic -----------------------------
   * Rank buys a weapon 20% more damage a step and two extra projectiles, and
   * bought its LOOK five percent of radius a step. Measured by rendering one
   * shot of each weapon at each rank against the same empty field, rank 8 was
   * between 0.93x and 2.67x the light of rank 1 - and the bottom of that
   * range is Arcweb, which got very slightly smaller, because the chain
   * behaviour never read w.level at all.
   *
   * None of what grows here touches a hitbox: a zone's radius, a beam's
   * width and an orbit's ring are all damage geometry and stay exactly where
   * they were. What grows is streak, corona, bloom and heat.
   *
   * One shot on an empty field, because measuring a live fight measures the
   * fight: with immortal dummies and a 12-second window the field saturates,
   * the projectile cap bites, and the same weapon reported 0.17x and 5.08x on
   * two different runs of the same build. */
  const ramp = await page.evaluate(() => {
    const pl = WS.Game.player;
    pl.x = 640; pl.y = 360;
    const cv = document.querySelector('canvas');
    const g = cv.getContext('2d');
    const ink = (fire) => {
      WS.Projectile.clear(); WS.FX.clear(); WS.Enemy.clear();
      WS.Pickup.clear(); WS.XP.clear();
      WS.Renderer.draw(5);
      const before = g.getImageData(0, 0, cv.width, cv.height).data;
      fire();
      WS.Renderer.draw(5);
      const after = g.getImageData(0, 0, cv.width, cv.height).data;
      let add = 0;
      for (let i = 0; i < after.length; i += 4) {
        const d0 = 0.2126 * before[i] + 0.7152 * before[i + 1] + 0.0722 * before[i + 2];
        const d1 = 0.2126 * after[i] + 0.7152 * after[i + 1] + 0.0722 * after[i + 2];
        if (d1 - d0 > 8) add += d1 - d0;
      }
      return add / 1000;
    };
    const shot = (id, level, evolved, partner) => {
      pl.weapons.length = 0; pl.weaponLevels = {}; pl.combosActive = {};
      WS.Player.addWeapon(pl, id);
      if (partner) WS.Player.addWeapon(pl, partner);
      const w = WS.Player.getWeapon(pl, id);
      if (!w) return -1;
      w.level = level; pl.weaponLevels[id] = level; w.evolved = !!evolved;
      return ink(() => {
        const e = WS.Enemy.spawn('lampling', 900, 360, 1, true);
        if (e) { e.maxHealth = 1e9; e.health = 1e9; e.speed = 0; }
        w.cooldown = 0;
        WS.Weapon.fire(pl, w);
      });
    };
    const out = [];
    for (const id of WS.WeaponOrder) {
      const r1 = shot(id, 1, false), r8 = shot(id, 8, false), ev = shot(id, 8, true);
      out.push({ id, growth: r1 > 0 ? +(r8 / r1).toFixed(2) : -1,
        evo: r8 > 0 ? +(ev / r8).toFixed(2) : -1 });
    }
    return out;
  });
  for (const r of ramp) {
    if (r.growth < 1.6) {
      fail.push(`${r.id} at rank 8 puts ${r.growth}x the light on the field that rank 1 does `
        + '- eight ranks of investment that cannot be seen');
    }
    if (r.evo < 1.2) {
      fail.push(`evolving ${r.id} changes its look by ${r.evo}x - an evolution should read `
        + 'as one');
    }
  }
  const flat = ramp.reduce((a, r) => Math.min(a, r.growth), 99);
  const big = ramp.reduce((a, r) => Math.max(a, r.growth), 0);

  /* ...and a discovery paints the weapons it combined. Nine of them changed
   * what a weapon DID and left it looking identical; the player was told once
   * by a toast and never saw it on the field again. */
  const combos = await page.evaluate(() => {
    const pl = WS.Game.player;
    pl.x = 640; pl.y = 360;
    const cv = document.querySelector('canvas');
    const g = cv.getContext('2d');
    const frame = (id, partner) => {
      pl.weapons.length = 0; pl.weaponLevels = {}; pl.combosActive = {};
      WS.Player.addWeapon(pl, id);
      if (partner) WS.Player.addWeapon(pl, partner);
      const w = WS.Player.getWeapon(pl, id);
      w.level = 6; pl.weaponLevels[id] = 6;
      WS.Projectile.clear(); WS.FX.clear(); WS.Enemy.clear();
      WS.Pickup.clear(); WS.XP.clear();
      const e = WS.Enemy.spawn('lampling', 900, 360, 1, true);
      if (e) { e.maxHealth = 1e9; e.health = 1e9; e.speed = 0; }
      WS.Renderer.draw(5);
      w.cooldown = 0; WS.Weapon.fire(pl, w);
      WS.Renderer.draw(5);
      return g.getImageData(0, 0, cv.width, cv.height).data;
    };
    const out = [];
    for (const cid of WS.ComboOrder) {
      const c = WS.Combos[cid];
      const [a, bq] = c.weapons;
      const alone = frame(a, null), paired = frame(a, bq);
      let n = 0;
      for (let i = 0; i < alone.length; i += 4) {
        const d = Math.abs(alone[i] - paired[i]) + Math.abs(alone[i + 1] - paired[i + 1])
          + Math.abs(alone[i + 2] - paired[i + 2]);
        if (d > 24) n++;
      }
      out.push({ id: cid, changed: n });
    }
    return out;
  });
  for (const c of combos) {
    /* 300, against a measured floor of about 500 for the two pairings that
       combine weapons of the SAME school - where the partner's colour is the
       weapon's own and only the pips carry the signal - and against 126 to
       149 for the code that had no signal at all. */
    if (c.changed < 300) {
      fail.push(`the discovery ${c.id} changes ${c.changed} pixels of what its weapon `
        + 'looks like - it alters what the weapon does and nothing the player can see');
    }
  }

  console.log(fail.length ? fail.join('\n')
    : `ok: ${worst.seen} particle samples, fastest ${worst.maxSpeed.toFixed(0)} px/s, none off-world;` +
      ` ${worst.boltSamples} seeking-bolt samples, slowest ${(worst.slowestBolt * 100).toFixed(0)}% of launch speed;` +
      ` ${text.pct}% of floating combat text overlaps another number, busiest frames ${text.worst}%;` +
      ` every weapon grows between ${flat}x and ${big}x in presence from rank 1 to rank 8,` +
      ` and all ${combos.length} discoveries repaint the weapons they combine`);
  await b.close();
  process.exitCode = fail.length ? 1 : 0;
})();
