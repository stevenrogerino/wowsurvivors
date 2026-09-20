#!/usr/bin/env node
/* Can the player see the thing they are supposed to walk to?
 *
 * MEASURED IN COLOUR, NOT IN BRIGHTNESS. This is the whole reason the tool
 * exists in the form it does. The first version of this measurement read
 * luminance and cheerfully reported that every gem cleared its ground by 64 to
 * 76 - while a screenshot showed green gems sitting invisibly on Thornhollow's
 * green grass. Of course it did: green on green fails in HUE, and a metric
 * that throws hue away cannot see the one defect it was pointed at. The
 * reading here is the distance in RGB between the item and the floor beside
 * it, which counts a colour collision as the miss it is - and by that reading
 * the same gem scored 89 across twenty-one pixels.
 *
 *   found      Every gem tier and every pickup kind must stand off the floor
 *              of every map by DIST. The fix was not a new palette but a
 *              structure: a dark pad that removes the ground underneath, the
 *              item, and a core brighter than any floor in the game. Both
 *              outer layers are value, so the read no longer depends on the
 *              tier colour at all - which frees the colour to go back to
 *              saying how much the gem is worth.
 *
 *   presence   And it must do it across enough pixels to be a landmark. A
 *              three-pixel spark can score enormous contrast and still be
 *              unfindable in a field of two hundred enemies: the bomb managed
 *              274 of colour distance across THIRTY-FOUR PIXELS.
 *
 *   hierarchy  The five pickups that change a run - a bomb, a lodestone, an
 *              hourglass, a chest, a supply crate - must be louder than a
 *              coin. They are the decisions on the field, the moments a player
 *              breaks off what they are doing and goes to get something, and
 *              they were quieter than the currency: 34 pixels against the
 *              coin's 79. This is the rule that keeps them focal.
 *
 * The floor is read from four sides and the median taken, because a single
 * offset can land on a rock or a tree and then the "ground" being compared
 * against is not ground - which made one tier look far worse on one map than
 * on any other, for no reason at all.
 *
 * NEGATIVE TESTS - both confirmed against the code as it was: restoring the
 * additive gems at 0.26 alpha with no pad gives "gem low reads 89 against
 * thornhollow"; removing the pickup pad and ring gives "bomb is quieter than a
 * coin on the same ground (34px against 79px)".
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-loot.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const DIST = 150;        // colour distance an item must put between it and the floor
const GEM_PX = 12;       // pixels of a gem that must clearly not be ground
const PICK_PX = 50;      // and of a pickup, which is a bigger object
const LOUDER = 2.0;      // how much more presence a run-changing pickup needs

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const fail = [];
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && window.WS.Game);

  const rows = await page.evaluate(() => {
    /* A fresh profile gets the prologue, and its layer covers the whole
       screen - which is the point of it. A harness has to walk past it
       before it can drive anything. */
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    const R = WS.Renderer;
    const ctx = document.getElementById('game-canvas').getContext('2d');
    const out = [];

    const grab = (wx, wy, half) => {
      const sx = Math.round((R.offsetX + (wx - half) * R.scale) * R.dpr);
      const sy = Math.round((R.offsetY + (wy - half) * R.scale) * R.dpr);
      const n = Math.max(4, Math.round(half * 2 * R.scale * R.dpr));
      return ctx.getImageData(sx, sy, n, n).data;
    };
    const meanOf = (d) => {
      let r = 0, g = 0, b = 0, c = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; c++; }
      return [r / c, g / c, b / c];
    };
    const readAgainst = (d, floor) => {
      let best = 0, strong = 0;
      for (let i = 0; i < d.length; i += 4) {
        const dr = d[i] - floor[0], dg = d[i + 1] - floor[1], db = d[i + 2] - floor[2];
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist > best) best = dist;
        if (dist > 45) strong++;
      }
      return { best: Math.round(best), strong };
    };

    const KINDS = ['coin', 'potion', 'chest', 'bomb', 'stone', 'hourglass', 'cache'];
    /* Both quality settings. Balanced drops trails and glows for frames, and
     * it must not be allowed to drop the thing that makes loot findable - a
     * setting that trades away legibility is not a quality setting, it is a
     * different game. */
    for (const quality of ['high', 'balanced'])
    for (const map of Object.keys(WS.Maps)) {
      WS.Save.settings.quality = quality;
      R.applyQuality();
      WS.Game.startRun(map, 'mage');
      WS.Enemy.pool.releaseAll();
      WS.XP.pool.releaseAll();
      WS.Pickup.pool.releaseAll();
      // Far from the survivor, so nothing is magnetised or lit by nearness -
      // loot the player has not walked to yet is the case that matters.
      WS.Game.player.x = 200; WS.Game.player.y = 620;
      WS.setSeed(20260908);   // fixed bob phases, so only the drawing varies

      const spots = [];
      let k = 0;
      const place = (label, fn) => {
        const x = 360 + (k % 6) * 150, y = 140 + Math.floor(k / 6) * 150;
        fn(x, y); spots.push({ label, x, y }); k++;
      };
      place('gem low', (x, y) => WS.XP.spawnGem(x, y, 1));
      place('gem mid', (x, y) => WS.XP.spawnGem(x, y, 10));
      place('gem high', (x, y) => WS.XP.spawnGem(x, y, 40));
      for (const kind of KINDS) place(kind, (x, y) => WS.Pickup.spawn(kind, x, y, 10));

      /* Read at the DIMMEST point of the pulse, not at whatever moment the
       * test happened to catch.
       *
       * The callout halo and the bob both ride sine waves seeded off a random
       * per-pickup phase, so a single frame samples each item at an arbitrary
       * point in its cycle - and the chest slid from 2.17x the coin to 1.98x
       * between two runs of this check with nothing changed. A threshold that
       * a die roll can cross is not measuring the game. Four frames spread
       * across the cycle, worst reading kept, and what is asserted is the
       * trough - which is also the moment the player is actually least likely
       * to spot the thing. */
      const worst = spots.map(() => ({ dist: 1e9, px: 1e9 }));
      for (const t of [3, 3.6, 4.2, 4.8]) {
        R.draw(t);
        spots.forEach((s, si) => {
          const around = [[62, 0], [-62, 0], [0, 58], [0, -58]]
            .map(([dx, dy]) => meanOf(grab(s.x + dx, s.y + dy, 14)));
          const med = (j) => {
            const v = around.map((a) => a[j]).sort((x, y) => x - y);
            return (v[1] + v[2]) / 2;
          };
          const r = readAgainst(grab(s.x, s.y, 14), [med(0), med(1), med(2)]);
          if (r.best < worst[si].dist) worst[si].dist = r.best;
          if (r.strong < worst[si].px) worst[si].px = r.strong;
        });
      }
      spots.forEach((s, si) => {
        out.push({ map: map + '/' + quality, label: s.label, dist: worst[si].dist, px: worst[si].px });
      });
    }
    return out;
  });

  const CALLOUT = ['bomb', 'stone', 'hourglass', 'chest', 'cache'];
  for (const r of rows) {
    if (r.dist < DIST) {
      fail.push(`${r.label} reads ${r.dist} against ${r.map} - it is the colour `
        + 'of the ground it is lying on');
    }
    const floorPx = r.label.startsWith('gem') ? GEM_PX : PICK_PX;
    if (r.px < floorPx) {
      fail.push(`${r.label} on ${r.map} is only ${r.px}px of anything - a spark, `
        + 'not a landmark');
    }
  }
  for (const map of [...new Set(rows.map((r) => r.map))]) {
    const coin = rows.find((r) => r.map === map && r.label === 'coin');
    for (const kind of CALLOUT) {
      const c = rows.find((r) => r.map === map && r.label === kind);
      if (c && coin && c.px < coin.px * LOUDER) {
        fail.push(`${kind} is quieter than a coin on ${map} (${c.px}px against `
          + `${coin.px}px) - it changes the run and it does not look like it`);
      }
    }
  }

  /* --------------------------------------------------- and does it DROP? --
   *
   * Visibility is worth nothing if the thing never appears. Both loot pools
   * saturate in a late run and neither had any way to release anything - a
   * gem leaves only when it is collected, and `pickup.life` was incremented
   * every frame and never read by anything.
   *
   * Standing still in the middle for three minutes, as reported: the 260 gem
   * slots filled by t=60 and from then on every kill folded its value into a
   * RANDOM gem somewhere on the field - 13,518 of them, while the last new
   * gem to appear anywhere had done so a minute earlier. The 48 pickup slots
   * filled by t=120, and from then on Pickup.spawn returned null, which every
   * caller treats as "no drop": 164 potions, chests and crates destroyed
   * outright.
   *
   * So this measures the only thing that matters to the player holding the
   * controller - when something dies, does loot appear WHERE IT DIED - and it
   * runs long enough to get past both caps, because before the caps every
   * version of this code passes. */
  const sim = fs.readFileSync(path.resolve(__dirname, 'sim-core.js'), 'utf8');
  await page.evaluate(sim);
  const drops = await page.evaluate(() => {
    const WS = window.WS, STEP = 1 / 60;
    WS.setSeed(4242);
    WS.Game.startRun('thornhollow', 'mage');
    if (WS.Game.blessingChoices) WS.Game.chooseBlessing(0);
    const p = WS.Game.player;
    WS.WaveManager.update = function () {};
    WS.Game.openLevelUp = function () { this.pendingLevelUps = 0; };
    WS.Game.presentLevelUp = function () { this.pendingLevelUps = 0; };
    WS.Enemy.pool.releaseAll(); WS.Pickup.clear(); WS.XP.clear();
    WS.Projectile.clear(); WS.FX.clear();
    WS.Input.poll = function () {};
    p.weapons.length = 0; p.weaponLevels = {}; p.combosActive = {};
    for (const id of Object.keys(WS.Weapons).slice(0, 6)) {
      WS.Player.addWeapon(p, id);
      const w = WS.Player.getWeapon(p, id);
      if (w) { w.level = 8; p.weaponLevels[id] = 8; }
    }
    p.damageMultiplier *= 4;
    p.maxHealth = 1e9; p.health = 1e9;
    p.x = 640; p.y = 360;

    let hit = 0, miss = 0, lost = 0, landed = 0, xpIn = 0;
    const origGem = WS.XP.spawnGem;
    WS.XP.spawnGem = function (x, y, v) {
      const r = origGem.apply(this, arguments);
      if (v > 0) {
        xpIn += v;
        let near = false;
        for (let i = 0; i < this.pool.count; i++) {
          const g = this.pool.active[i];
          const dx = g.x - x, dy = g.y - y;
          if (dx * dx + dy * dy < 40 * 40) { near = true; break; }
        }
        if (near) hit++; else miss++;
      }
      return r;
    };
    const origPick = WS.Pickup.spawn;
    WS.Pickup.spawn = function () {
      const r = origPick.apply(this, arguments);
      if (r) landed++; else lost++;
      return r;
    };

    const script = window.WSSim.siegeScript();
    let next = 0, t = 0;
    while (t < 180) {
      while (next < script.length && script[next].t <= t) {
        const s = script[next++];
        WS.Enemy.spawn(s.id, s.x, s.y, 1, true);
      }
      if (next >= script.length) next = 0;      // keep the pressure up past 90s
      WS.Game.update(STEP);
      if (!WS.Game.running) break;
      t += STEP;
    }
    let onField = 0;
    for (let i = 0; i < WS.XP.pool.count; i++) onField += WS.XP.pool.active[i].value;
    return { hit, miss, lost, landed, xpIn, onField, seconds: t,
      gems: WS.XP.pool.count, picks: WS.Pickup.pool.count,
      maxGems: WS.CONST.MAX_GEMS, maxPicks: WS.CONST.MAX_PICKUPS };
  });

  // The measurement is only worth anything if it got past the caps.
  if (drops.gems < drops.maxGems || drops.picks < drops.maxPicks) {
    fail.push(`the drop run never saturated (${drops.gems}/${drops.maxGems} gems, `
      + `${drops.picks}/${drops.maxPicks} pickups) - it cannot have tested what `
      + 'happens at the cap');
  }
  if (drops.miss > 0) {
    fail.push(`${drops.miss} of ${drops.hit + drops.miss} kills left no gem within 40px of `
      + 'the corpse - with the field at its cap the drop has to appear where the enemy '
      + 'died, not fold into something off-screen');
  }
  if (drops.lost > 0) {
    fail.push(`${drops.lost} pickups were destroyed because the field was full - `
      + 'a potion or a chest that never spawns is a lost drop, not a full field');
  }

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail.slice(0, 14)) console.error('  - ' + f);
    if (fail.length > 14) console.error(`  ... and ${fail.length - 14} more`);
    process.exit(1);
  }
  const gems = rows.filter((r) => r.label.startsWith('gem'));
  const worstGem = gems.reduce((a, r) => (r.dist < a.dist ? r : a));
  const calls = rows.filter((r) => CALLOUT.includes(r.label));
  const quietest = calls.reduce((a, r) => (r.px < a.px ? r : a));
  console.log(`ok: ${rows.length} readings across ${new Set(rows.map((r) => r.map)).size} maps; `
    + `the least visible gem (${worstGem.label} on ${worstGem.map}) still stands `
    + `${worstGem.dist} off its ground, and the quietest run-changing pickup `
    + `(${quietest.label} on ${quietest.map}) covers ${quietest.px}px; and over `
    + `${Math.round(drops.seconds)}s of standing still with both fields at their cap `
    + `(${drops.gems}/${drops.maxGems} gems, ${drops.picks}/${drops.maxPicks} pickups) `
    + `all ${drops.hit} kills left a gem at the corpse and all ${drops.landed} pickups `
    + 'reached the ground');
})();
