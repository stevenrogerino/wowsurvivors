#!/usr/bin/env node
/* What each calling's own passive is worth (upgrades.js: Undertow, Hallowed
 * Mending, Ruthless, Stalker's Patience, Slow Burn, Bountiful Tithe, Deep
 * Roots, Fervor), beside the four the newest survivors already had (Curdled
 * Light, Ruin Hunger, Primal Kinship, Serenity), which are the band to land in.
 *
 * Not a guard: the instrument the passives' numbers (Config, CALLING
 * PASSIVES) were fitted with. The same harness as tools/calling-sim.js -
 * each survivor kites through real waves from TIME with their starting
 * weapon plus Volley, Arcweb and Axe Gyre, all evolved - and:
 *
 *   calling   their signature blessing, without and with RANKS of its passive
 *   carry     a survivor who does NOT hold the calling (Warden's Charge), with
 *             the passive's condition met (Greed's Pull, Recovery, Precision,
 *             Ironhide + Thorns), without and with RANKS of the passive -
 *             only for the four that carry over. It should be clearly the
 *             smaller of the two.
 *
 *   node tools/calling-passives.js
 *   TIME=900 MAP=palewastes DIFF=professional HYPER=1 RANKS=5 node tools/calling-passives.js
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
    TIME: +(process.env.TIME || 600), LIMIT: +(process.env.LIMIT || 60), N: +(process.env.SEEDS || 3),
    MAP: process.env.MAP || 'thornhollow', DIFF: process.env.DIFF || 'veteran', HYPER: process.env.HYPER === '1',
    ONLY: process.env.ONLY || '', STILL: process.env.STILL === '1', RANKS: +(process.env.RANKS || 5),
  };
  const rows = await page.evaluate(({ TIME, LIMIT, N, MAP, DIFF, HYPER, ONLY, STILL, RANKS }) => {
    const kite = (p) => {
      const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT, t = WS.Game.run.time;
      let tx = W / 2 + Math.cos(t * 0.5) * 240, ty = H / 2 + Math.sin(t * 0.5) * 170;
      const near = WS.Enemy.findNearest(p.x, p.y, 160);
      if (near) {
        const dx = p.x - near.x, dy = p.y - near.y, d = Math.hypot(dx, dy) || 1;
        tx = p.x + dx / d * 250; ty = p.y + dy / d * 250;
      }
      tx = Math.max(80, Math.min(W - 80, tx)); ty = Math.max(80, Math.min(H - 80, ty));
      const k = WS.Input.keys, h = WS.Input.held;
      k.left = h.left = tx - p.x < -6; k.right = h.right = tx - p.x > 6;
      k.up = h.up = ty - p.y < -6; k.down = h.down = ty - p.y > 6;
    };
    WS.Save.unlockAll();
    WS.Save.settings.difficulty = DIFF;
    WS.Save.db.unlocks.hyper[MAP] = true;
    WS.Save.db.hyperArmed = HYPER;
    WS.Game.openLevelUp = () => {}; WS.Game.presentLevelUp = () => {};
    const keepPlaying = () => {
      WS.Game.pendingLevelUps = 0; WS.Game.leveling = false;
      if (WS.Game.state === 'blessing' || WS.Game.state === 'levelup' || WS.Game.state === 'merchant') {
        WS.UI.closeOverlay(); WS.Game.state = 'playing';
      }
      WS.Game.timeScale = 1;
    };
    const PASSIVE = {
      mage: 'undertow', priest: 'hallowed', rogue: 'ruthless', hunter: 'stalker', warrior: 'slow_burn',
      warlock: 'bountiful', shaman: 'deep_roots', paladin: 'fervor',
      graveblade: 'curdled', ruinseeker: 'ruin_hunger', druid: 'primal_kinship', monk: 'serenity',
    };
    // What a build without the calling needs before the carry-over is offered.
    const NEED = { undertow: { magnet: 3 }, hallowed: { recovery: 3 }, ruthless: { precision: 3 }, slow_burn: { armor: 3, thorns: 2 } };
    const take = (pl, id, n) => {
      const up = WS.Upgrades[id];
      for (let k = 0; k < n; k++) { up.apply(pl, up); pl.upgradeLevels[id] = (pl.upgradeLevels[id] || 0) + 1; }
    };
    const run1 = (hero, blessing, extra, seed) => {
      WS.setSeed(seed);
      WS.Game.startRun(MAP, hero);
      const pl = WS.Game.player;
      WS.Game.chooseBlessing({ type: 'blessing', id: blessing });
      const start = pl.weapons[0] && pl.weapons[0].id;
      pl.weapons.length = 0; pl.weaponLevels = {};
      for (const id of [start, 'volley', 'arcweb', 'axe_gyre']) {
        if (!id || pl.weaponLevels[id]) continue;
        const w = WS.Player.addWeapon(pl, id);
        w.level = WS.WEAPON_MAX_LEVEL; pl.weaponLevels[id] = w.level; w.evolved = true;
      }
      for (const [id, n] of Object.entries(extra)) {
        if (n > 0 && WS.Upgrades[id].offer && !WS.Upgrades[id].offer(pl)) return null;
        take(pl, id, n);
      }
      if (pl.flowAttuned > 0) pl.flowSteps = WS.Primal.maxSteps(pl);
      pl.health = pl.maxHealth;
      WS.Enemy.pool.releaseAll(); WS.Hazard.pool.releaseAll(); WS.Projectile.bolts.releaseAll();
      WS.Game.run.time = TIME;
      pl.x = WS.CONST.WORLD_WIDTH / 2; pl.y = WS.CONST.WORLD_HEIGHT / 2;
      let eff = 0, t = 0;
      const rd = WS.Enemy.damage;
      WS.Enemy.damage = function (e, amount) {
        if (e && !e._dead && e.invuln <= 0) eff += Math.min(amount, Math.max(0, e.health));
        return rd.apply(this, arguments);
      };
      for (let i = 0; i < 60 * LIMIT; i++) {
        keepPlaying();
        if (!STILL) kite(pl);
        WS.Game.tick(WS.CONST.TICK_RATE);
        t += WS.CONST.TICK_RATE;
        if (WS.Game.state === 'dying' || WS.Game.state === 'over' || pl.health <= 0) break;
      }
      WS.Enemy.damage = rd;
      return { dps: eff / t, t };
    };
    const SEEDS = Array.from({ length: N }, (_, i) => 5 + i * 23);
    const avg = (f) => {
      const r = SEEDS.map(f);
      if (r.some((x) => !x)) return null;
      return { dps: r.reduce((s, x) => s + x.dps, 0) / r.length, t: r.reduce((s, x) => s + x.t, 0) / r.length };
    };
    const out = [];
    for (const hero of WS.CharacterOrder) {
      if (ONLY && !ONLY.split(',').includes(hero)) continue;
      const sig = WS.Characters[hero].signatureBlessing, pid = PASSIVE[hero];
      if (!sig || !pid) continue;
      const row = { hero, passive: WS.Upgrades[pid].name };
      row.cBase = avg((s) => run1(hero, sig, {}, s));
      row.cWith = avg((s) => run1(hero, sig, { [pid]: RANKS }, s));
      if (NEED[pid]) {
        // A survivor the calling is not theirs, holding no calling at all.
        row.xBase = avg((s) => run1(hero, 'kings', NEED[pid], s));
        row.xWith = avg((s) => run1(hero, 'kings', Object.assign({}, NEED[pid], { [pid]: RANKS }), s));
      }
      out.push(row);
    }
    return out;
  }, opts);
  // (the autopilot's keys are released with the page)

  console.log(`each survivor ${opts.STILL ? 'standing' : 'kiting'} from t=${opts.TIME}s, ${opts.MAP}, ${opts.DIFF}${opts.HYPER ? ', Hyper' : ''}, `
    + `limit ${opts.LIMIT}s, ${opts.N} seeds, ${opts.RANKS} ranks`);
  console.log('  ' + 'survivor'.padEnd(11) + 'passive'.padEnd(20) + 'calling: dps'.padStart(13) + 'stood'.padStart(14)
    + 'carry: dps'.padStart(12) + 'stood'.padStart(14));
  const pc = (a, b) => ((a / b - 1) * 100).toFixed(0).padStart(4) + '%';
  for (const r of rows) {
    const x = r.xBase && r.xWith;
    console.log('  ' + r.hero.padEnd(11) + r.passive.padEnd(20)
      + (r.cWith ? pc(r.cWith.dps, r.cBase.dps) : '-').padStart(13)
      + (r.cWith ? `${r.cWith.t.toFixed(0)}s/${r.cBase.t.toFixed(0)}s` : '-').padStart(14)
      + (x ? pc(r.xWith.dps, r.xBase.dps) : '').padStart(12)
      + (x ? `${r.xWith.t.toFixed(0)}s/${r.xBase.t.toFixed(0)}s` : '').padStart(14));
  }
  await b.close();
})();
