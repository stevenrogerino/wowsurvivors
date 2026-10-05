#!/usr/bin/env node
/* Every source of healing that is not a weapon, on one scale.
 *
 * tools/heal-sim.js measures the healing weapons; this measures everything
 * else - the passives, the blessings, the callings that mend and the
 * discoveries that add to a mend - in the same fight, so a weapon's 60 a
 * second and a blessing's can be read side by side.
 *
 * The fight is heal-sim's: the Mage with three evolved weapons that do not
 * heal (Arcweb, Knifestorm, Volley), dropped into the real waves at TIME on
 * the hardest night (Professional, the Pale Wastes, Hyper), twenty seconds,
 * health pinned at half so no heal is refused, and every Player.heal
 * counted by source. The kiting the callings need to fire (the Quarry, the
 * Tithe) is the same simple loop the calling tools use. Reported: healing a
 * second, and as a share of the Mage's health, which is what matters when a
 * survivor has more of it.
 *
 *   node tools/heal-sources.js
 *   TIME=900 SEEDS=5 node tools/heal-sources.js
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
  const TIME = +(process.env.TIME || 1260), N = +(process.env.SEEDS || 3);
  const rows = await page.evaluate(({ TIME, N }) => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay(); WS.Save.db.seenManual = true; WS.Save.unlockAll();
    WS.Save.save = () => {};
    WS.Save.settings.difficulty = 'professional';
    WS.Save.db.unlocks.hyper.palewastes = true; if (true) { WS.Save.db.oaths = Object.assign({}, WS.Save.db.oaths, { hyper: true }); WS.Save.stats.totalVictories = Math.max(1, WS.Save.stats.totalVictories || 0); } else if (WS.Save.db.oaths) delete WS.Save.db.oaths.hyper;  // Hyper is an Oath
    WS.Game.openLevelUp = () => {}; WS.Game.presentLevelUp = () => {};
    const up = (pl, id, n) => { const u = WS.Upgrades[id]; for (let i = 0; i < n; i++) { u.apply(pl, u); pl.upgradeLevels[id] = (pl.upgradeLevels[id] || 0) + 1; } };
    const SOURCES = [
      ['Recovery x4 (passive)', (pl) => up(pl, 'recovery', 4)],
      ["Ancestral Grace (blessing)", 'ancestors'],
      ['Leech Pact (blessing)', 'fel'],
      ['Bloodthirst (blessing)', 'bloodthirst'],
      ["Reaper's Tithe (calling)", 'reapers_tithe'],
      ['Waystones, Spring (calling)', 'waystones', (pl) => up(pl, 'recovery', 4)],
      ['Seething Blood (calling)', 'seething_blood'],
      ['The Quarry (calling)', 'quarry'],
      ['Unyielding Faith + Recovery x4', 'unyielding', (pl) => up(pl, 'recovery', 4)],
    ];
    const kite = (pl) => {
      const t = WS.Game.run.time;
      let tx = 640 + Math.cos(t * 0.5) * 240, ty = 360 + Math.sin(t * 0.5) * 170;
      const n = WS.Enemy.findNearest(pl.x, pl.y, 160);
      if (n) { const dx = pl.x - n.x, dy = pl.y - n.y, d = Math.hypot(dx, dy) || 1; tx = pl.x + dx / d * 250; ty = pl.y + dy / d * 250; }
      const K = WS.Input.keys, H = WS.Input.held;
      K.left = H.left = tx - pl.x < -6; K.right = H.right = tx - pl.x > 6; K.up = H.up = ty - pl.y < -6; K.down = H.down = ty - pl.y > 6;
    };
    const live = (spec, seed) => {
      const [, bl, extra] = typeof spec[1] === 'function' ? [spec[0], 'kings', spec[1]] : spec;
      WS.setSeed(seed);
      WS.Game.startRun('palewastes', 'mage');
      WS.Game.chooseBlessing({ type: 'blessing', id: bl });
      const pl = WS.Game.player;
      pl.weapons.length = 0; pl.weaponLevels = {};
      for (const id of ['arcweb', 'knifestorm', 'volley']) { const w = WS.Player.addWeapon(pl, id); w.level = WS.WEAPON_MAX_LEVEL; pl.weaponLevels[id] = w.level; w.evolved = true; }
      if (extra) extra(pl);
      WS.Enemy.pool.releaseAll(); WS.Hazard.pool.releaseAll(); WS.Projectile.bolts.releaseAll();
      WS.Game.run.time = TIME; pl.x = 640; pl.y = 360;
      let healed = 0;
      // Counted where every heal lands - regeneration does not pass through
      // Player.heal - as the health it actually restored.
      const real = WS.Player.applyHeal;
      WS.Player.applyHeal = function (p, amount, source) {
        const before = p.health; const r = real.apply(this, arguments);
        if (source !== 'potion') healed += Math.max(0, p.health - before);
        return r;
      };
      // Blows land (Seething Blood heats on them) but never end the run.
      const die = WS.Game.beginDeath; WS.Game.beginDeath = () => {};
      const T = 20;
      for (let i = 0; i < 60 * T; i++) {
        WS.Game.pendingLevelUps = 0; WS.Game.leveling = false;
        if (WS.Game.state !== 'playing') { WS.UI.closeOverlay(); WS.Game.state = 'playing'; }
        pl.health = pl.maxHealth * 0.5;
        kite(pl);
        WS.Game.tick(WS.CONST.TICK_RATE);
      }
      WS.Player.applyHeal = real; WS.Game.beginDeath = die;
      return { hps: healed / T, max: pl.maxHealth };
    };
    const out = [];
    for (const s of SOURCES) {
      let h = 0, m = 0;
      for (let k = 0; k < N; k++) { const r = live(s, 7 + k * 17); h += r.hps; m += r.max; }
      out.push({ name: s[0], hps: h / N, max: m / N });
    }
    return out;
  }, { TIME, N });
  console.log(`healing a second from each non-weapon source at t=${TIME}s, Pale Wastes, Professional, Hyper, ${N} seeds (the Mage, health held at half, kiting)`);
  console.log('  ' + 'source'.padEnd(34) + 'heal/s'.padStart(8) + '  % of max health/s');
  for (const r of rows) console.log('  ' + r.name.padEnd(34) + r.hps.toFixed(1).padStart(8) + ((r.hps / r.max * 100).toFixed(2) + '%').padStart(12));
  await b.close();
})();
