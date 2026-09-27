#!/usr/bin/env node
/* What each survivor's own power is worth, side by side.
 *
 * Not a guard: the instrument the calling numbers (Config, CALLINGS) were
 * fitted with. Twelve survivors, twelve signature blessings - the four
 * systems the newest four came with (Blood Rite, the Ruinous Pact, The Old
 * Shapes, Stillwater Step) and the eight callings the first eight were given
 * to match them (src/game/callings.js). A tester found the newest four the
 * strongest in the roster; the question here is whether the callings land in
 * the same band, and whether each survivor's own edge on theirs is the small
 * thing it is meant to be.
 *
 * Each survivor kites (the same simple autopilot as tools/dawn-fight.js -
 * circle the field, step away from anything within reach; STILL=1 stands
 * still instead) through real waves from TIME seconds with the same
 * build - their own starting weapon plus Volley, Arcweb and Axe Gyre, all
 * evolved - three times: with Warden's Charge (a plain blessing, the
 * baseline), with their signature blessing, and with the signature but their
 * edge taken away. Reported: effective damage per second (overkill clipped),
 * seconds survived (to LIMIT), and each against the baseline.
 *
 *   node tools/calling-sim.js
 *   TIME=900 MAP=palewastes DIFF=professional HYPER=1 node tools/calling-sim.js
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
    ONLY: process.env.ONLY || '', STILL: process.env.STILL === '1',
  };
  const rows = await page.evaluate(({ TIME, LIMIT, N, MAP, DIFF, HYPER, ONLY, STILL }) => {
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
    // Each survivor's edge, and the field that carries it (zeroed for "no edge").
    const EDGE = {
      mage: ['overflowBonus', 0], priest: ['barrierBonus', 0], rogue: ['comboBonus', 0], hunter: ['markHaste', 0],
      warrior: ['rageBonus', 0], warlock: ['soulBonus', 0], shaman: ['totemReach', 0], paladin: ['holyBonus', 0],
      graveblade: ['curdleShare', 0], ruinseeker: ['felBonus', 0], druid: ['wildBonus', 0], monk: ['flowBonusSteps', 0],
    };
    const run1 = (hero, blessing, noEdge, seed) => {
      WS.setSeed(seed);
      WS.Game.startRun(MAP, hero);
      const pl = WS.Game.player;
      if (noEdge) {
        const [k, v] = EDGE[hero]; pl[k] = v;
        if (hero === 'druid') pl.formBonus = 0;
        if (hero === 'monk') pl.flowRechargeMult = 1;
      }
      WS.Game.chooseBlessing({ type: 'blessing', id: blessing });
      const start = pl.weapons[0] && pl.weapons[0].id;
      pl.weapons.length = 0; pl.weaponLevels = {};
      for (const id of [start, 'volley', 'arcweb', 'axe_gyre']) {
        if (!id || pl.weaponLevels[id]) continue;
        const w = WS.Player.addWeapon(pl, id);
        w.level = WS.WEAPON_MAX_LEVEL; pl.weaponLevels[id] = w.level; w.evolved = true;
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
      return { dps: r.reduce((s, x) => s + x.dps, 0) / r.length, t: r.reduce((s, x) => s + x.t, 0) / r.length };
    };
    const out = [];
    for (const hero of WS.CharacterOrder) {
      if (ONLY && !ONLY.split(',').includes(hero)) continue;
      const sig = WS.Characters[hero].signatureBlessing;
      if (!sig) continue;
      const base = avg((s) => run1(hero, 'kings', false, s));
      const withSig = avg((s) => run1(hero, sig, false, s));
      const noEdge = avg((s) => run1(hero, sig, true, s));
      out.push({ hero, sig: WS.Blessings[sig].name, base, withSig, noEdge });
    }
    return out;
  }, opts);
  // (the autopilot's keys are released with the page)

  console.log(`each survivor ${opts.STILL ? 'standing' : 'kiting'} from t=${opts.TIME}s, ${opts.MAP}, ${opts.DIFF}${opts.HYPER ? ', Hyper' : ''}, limit ${opts.LIMIT}s, ${opts.N} seeds`);
  console.log('  ' + 'survivor'.padEnd(11) + 'signature'.padEnd(24) + 'dps vs plain'.padStart(13) + 'stood vs plain'.padStart(16)
    + 'edge: dps'.padStart(11) + 'stood'.padStart(8));
  const pc = (a, b) => ((a / b - 1) * 100).toFixed(0).padStart(4) + '%';
  for (const r of rows) {
    console.log('  ' + r.hero.padEnd(11) + r.sig.padEnd(24)
      + pc(r.withSig.dps, r.base.dps).padStart(13)
      + (`${r.withSig.t.toFixed(0)}s/${r.base.t.toFixed(0)}s`).padStart(16)
      + pc(r.withSig.dps, r.noEdge.dps).padStart(11)
      + (`${(r.withSig.t - r.noEdge.t).toFixed(1)}s`).padStart(8));
  }
  await b.close();
})();
