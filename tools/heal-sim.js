#!/usr/bin/env node
/* How much each healing weapon actually heals, in a real fight.
 *
 * Not a guard: the instrument the healing numbers in src/data/weapons.js were
 * fitted with, kept so the fitting can be repeated. A tester found Grave
 * Tether a must-take on the hard settings and every other healer an
 * afterthought; this puts a number on both halves of that.
 *
 * Each healer is put in the same build - three evolved damage weapons that
 * do not heal (Arcweb, Knifestorm, Volley) - and dropped into real waves at
 * TIME seconds on the hardest night there is: Professional, the Pale Wastes,
 * Hyper (MAP, DIFF and HYPER=0 change that). Twenty seconds of fight, health pinned at
 * half so no heal is refused, and every Player.heal counted by its source.
 * Two rows per weapon: rank 4, and rank 8 evolved. The STACKED column adds
 * three Duplicity and five Expanse, the build a player chasing sustain
 * makes, which is where a per-hit heal runs away from a per-cast one.
 *
 *   node tools/heal-sim.js
 *   TIME=1260 SEEDS=5 node tools/heal-sim.js
 *
 * STACK='haste:5,perennial:5' stacks those passives instead of Duplicity and
 * Expanse: a zone that heals per tick heals once per zone, so what makes
 * zones overlap - Haste (more often) and Perennial (longer) - multiplies it,
 * and the default stack never looked. DISCOVER=1 also hands each healer the
 * discoveries it can be part of (its own half), as a found one does.
 * ONLY=hallowed_ring,grave_tether measures just those.
 *
 * For scale, a survivor's health is 110-160 at the start and the potion is
 * a quarter of it. Set CHROME to point at an existing Chromium binary. */
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

  const TIME = +(process.env.TIME || 900);
  const N = +(process.env.SEEDS || 3);
  const MAP = process.env.MAP || 'palewastes', DIFF = process.env.DIFF || 'professional';
  const HYPER = process.env.HYPER !== '0';
  const STACK = (process.env.STACK || 'quantity:3,area:5').split(',').filter(Boolean).map((x) => x.split(':')).map(([id, n]) => [id, +(n || 1)]);
  const DISCOVER = process.env.DISCOVER === '1', ONLY = process.env.ONLY || '';
  const rows = await page.evaluate(({ TIME, N, MAP, DIFF, HYPER, STACK, DISCOVER, ONLY }) => {
    const HEALERS = Object.keys(WS.Weapons).filter((id) => {
      const d = WS.Weapons[id];
      return (d.healPer || 0) > 0 && (!ONLY || ONLY.split(',').includes(id));
    });
    const SUPPORT = ['arcweb', 'knifestorm', 'volley'];
    WS.Save.unlockAll();
    WS.Save.settings.difficulty = DIFF;
    WS.Save.db.unlocks.hyper[MAP] = true;
    if (HYPER) { WS.Save.db.oaths = Object.assign({}, WS.Save.db.oaths, { hyper: true }); WS.Save.stats.totalVictories = Math.max(1, WS.Save.stats.totalVictories || 0); } else if (WS.Save.db.oaths) delete WS.Save.db.oaths.hyper;  // Hyper is an Oath
    // Nothing may stop the clock to ask a question: level-up cards, the
    // midnight blessing, a merchant.
    WS.Game.openLevelUp = () => {}; WS.Game.presentLevelUp = () => {};
    const keepPlaying = () => {
      WS.Game.pendingLevelUps = 0; WS.Game.leveling = false;
      if (WS.Game.state !== 'playing' && WS.Game.state !== 'over') { WS.UI.closeOverlay(); WS.Game.state = 'playing'; }
      WS.Game.timeScale = 1;
    };

    const give = (pl, id, level, evolved) => {
      const w = WS.Player.addWeapon(pl, id);
      w.level = level; pl.weaponLevels[id] = level; w.evolved = evolved;
    };
    const live = (id, level, evolved, stacked, seed) => {
      WS.setSeed(seed);
      WS.Game.startRun(MAP, 'mage');
      WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
      const pl = WS.Game.player;
      pl.weapons.length = 0; pl.weaponLevels = {};
      for (const s of SUPPORT) give(pl, s, WS.WEAPON_MAX_LEVEL, true);
      give(pl, id, level, evolved);
      if (DISCOVER) {
        const w = WS.Player.getWeapon(pl, id);
        for (const cid of WS.ComboOrder) {
          const c = WS.Combos[cid];
          if (!Array.isArray(c.weapons) || !c.weapons.includes(id)) continue;
          c.apply(c.weapons[0] === id ? w : { mods: {} }, c.weapons[1] === id ? w : { mods: {} }, c);
        }
      }
      if (stacked) {
        for (const [sid, n] of STACK) for (let i = 0; i < n; i++) WS.LevelUp.apply(pl, { type: 'stat', id: sid });
      }
      WS.Enemy.pool.releaseAll(); WS.Hazard.pool.releaseAll(); WS.Projectile.bolts.releaseAll();
      WS.Game.run.time = TIME;
      pl.x = 640; pl.y = 360;
      let healed = 0;
      const real = WS.Player.heal;
      WS.Player.heal = function (p, amount, source) {
        if (source === id) healed += amount * (p.healingMult || 1);
        return real.apply(this, arguments);
      };
      const T = 20;
      for (let i = 0; i < 60 * T; i++) {
        pl.health = pl.maxHealth * 0.5; pl.invulnerable = 1;
        keepPlaying();
        WS.Game.tick(WS.CONST.TICK_RATE);
      }
      WS.Player.heal = real;
      return healed / T;
    };
    const SEEDS = Array.from({ length: N }, (_, i) => 7 + i * 17);
    const avg = (f) => SEEDS.reduce((s, x) => s + f(x), 0) / SEEDS.length;
    const out = [];
    for (const id of HEALERS) {
      if (WS.Weapons[id].isUnion) {        // a union has one rank, as forged
        out.push({ name: WS.Weapons[id].name, rank: 'as forged',
          bare: avg((s) => live(id, WS.WEAPON_MAX_LEVEL, false, false, s)),
          stacked: avg((s) => live(id, WS.WEAPON_MAX_LEVEL, false, true, s)) });
        continue;
      }
      out.push({ name: WS.Weapons[id].name, rank: 'rank 4',
        bare: avg((s) => live(id, 4, false, false, s)), stacked: avg((s) => live(id, 4, false, true, s)) });
      out.push({ name: WS.Weapons[id].name, rank: 'rank 8 evolved',
        bare: avg((s) => live(id, WS.WEAPON_MAX_LEVEL, true, false, s)),
        stacked: avg((s) => live(id, WS.WEAPON_MAX_LEVEL, true, true, s)) });
    }
    return out;
  }, { TIME, N, MAP, DIFF, HYPER, STACK, DISCOVER, ONLY });

  console.log(`healing per second at t=${TIME}s, ${MAP}, ${DIFF}${HYPER ? ', Hyper' : ''}, ${N} seeds; stacked = `
    + STACK.map((x) => x.join(' x')).join(', ') + (DISCOVER ? '; discoveries carried' : ''));
  console.log('  ' + 'weapon'.padEnd(18) + 'rank'.padEnd(16) + 'bare'.padStart(8) + 'stacked'.padStart(10));
  for (const r of rows) {
    console.log('  ' + r.name.padEnd(18) + r.rank.padEnd(16) + r.bare.toFixed(1).padStart(8) + r.stacked.toFixed(1).padStart(10));
  }
  await b.close();
})();
