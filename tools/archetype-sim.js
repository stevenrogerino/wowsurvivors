#!/usr/bin/env node
/* Archetype simulator: answers a question tools/sim.js cannot, because it
 * deliberately suppresses the wave director and levels. This plays the REAL
 * game end to end -- real wave director, real level-up RNG, real blessing
 * draft -- for a roster of build archetypes, each with its own decision
 * policy (which weapons/passives/blessings it prefers when offered). One
 * fresh page per (archetype, seed) run, matching tools/sim.js's own lesson
 * about state leaking between runs on a shared page.
 *
 * At fixed time checkpoints (1/2/3/5/8/10/15/20/27 minutes) it snapshots real
 * power via WS.Weapon.reach() -- the game's own crowd-aware DPS model, not a
 * re-derivation -- summed over every weapon currently owned, at its current
 * rank/evolution. That is the same instrument the tuning bench itself trusts.
 * It also records whether the run survived to 30:00, when it died if not, the
 * lowest HP% ever reached, kills, and damage taken -- the numbers
 * tools/sim.js's suppressed-level scenarios cannot produce at all.
 *
 * Reach for this over tools/sim.js whenever a change touches a starting kit, a
 * class perk, or a blessing: those only show up in what a full, RNG'd run
 * actually does, not in an isolated rank-8 comparison. Run at 8+ seeds before
 * trusting a borderline result; 3-5 is enough to tell "structurally weak"
 * from "structurally strong" but not to call a close race.
 *
 *   node tools/archetype-sim.js --json out.json
 *   node tools/archetype-sim.js --only warrior --seeds 3   (quick check)
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const GAME_ROOT = path.resolve(__dirname, '..');

const CHECKPOINTS = [60, 120, 180, 300, 480, 600, 900, 1200, 1620];
const RUN_SECONDS = 1800;
const CROWD_SAMPLE = 40; // nominal crowd size for the reach model at each checkpoint

/* --------------------------------------------------------- archetypes -- */
/* Each archetype is a character plus three priority lists. The decision
 * policy (in-page, see POLICY_SRC below) scores every offered card by how
 * well it matches these lists; ties go to whatever the real game's own
 * weighted offer table put first. */
const ARCHETYPES = [
  { name: 'mage_arcane_bolt', character: 'mage', core: ['seeking_motes', 'moonbrand'],
    weapons: ['seeking_motes', 'moonbrand', 'umbral_bolt', 'rimeshard'],
    upgrades: ['haste', 'might', 'precision', 'ferocity', 'quantity'],
    blessings: ['air', 'kings', 'wisdom'] },
  { name: 'priest_holy_zones', character: 'priest', core: ['dawnpulse', 'hallowed_ring'],
    weapons: ['dawnpulse', 'hallowed_ring', 'judgement_disc'],
    upgrades: ['recovery', 'area', 'vitality', 'might', 'armor'],
    blessings: ['ancestors', 'wild', 'kings'] },
  { name: 'rogue_knife_crit', character: 'rogue', core: ['knifestorm', 'volley'],
    weapons: ['knifestorm', 'volley', 'rimeshard'],
    upgrades: ['precision', 'ferocity', 'fleetfoot', 'haste', 'quantity'],
    blessings: ['kings', 'air', 'fel'] },
  { name: 'hunter_volley_velocity', character: 'hunter', core: ['volley', 'seeking_motes'],
    weapons: ['volley', 'seeking_motes', 'moonbrand'],
    upgrades: ['velocity', 'quantity', 'might', 'precision', 'magnet'],
    blessings: ['kings', 'wisdom', 'moonlit'] },
  { name: 'warrior_axe_tank', character: 'warrior', core: ['axe_gyre', 'arcweb'],
    weapons: ['axe_gyre', 'arcweb', 'reaving_arc'],
    upgrades: ['armor', 'vitality', 'might', 'area', 'dodge'],
    blessings: ['wild', 'kings', 'unyielding'] },
  { name: 'warlock_umbral_damage', character: 'warlock', core: ['umbral_bolt', 'cinderfall'],
    weapons: ['umbral_bolt', 'cinderfall', 'grave_tether'],
    upgrades: ['might', 'ferocity', 'precision', 'haste', 'quantity'],
    blessings: ['kings', 'fel', 'glass_cannon'] },
  { name: 'shaman_arcweb_area', character: 'shaman', core: ['arcweb', 'axe_gyre'],
    weapons: ['arcweb', 'axe_gyre', 'blightfield'],
    upgrades: ['area', 'might', 'haste', 'luck', 'quantity'],
    blessings: ['moonlit', 'kings', 'fortune'] },
  { name: 'paladin_disc_block', character: 'paladin', core: ['judgement_disc', 'hallowed_ring'],
    weapons: ['judgement_disc', 'hallowed_ring', 'dawnpulse'],
    upgrades: ['armor', 'warding_light', 'might', 'vitality', 'area'],
    blessings: ['unyielding', 'wild', 'kings'] },
  { name: 'graveblade_curdled', character: 'graveblade', core: ['reaving_arc', 'grave_tether'],
    weapons: ['reaving_arc', 'grave_tether', 'dawnpulse'],
    upgrades: ['curdled', 'recovery', 'might', 'vitality', 'area'],
    blessings: ['blood_rite', 'ancestors', 'kings'] },
  { name: 'ruinseeker_ruinform', character: 'ruinseeker', core: ['verdant_lance', 'umbral_bolt'],
    weapons: ['verdant_lance', 'umbral_bolt', 'cinderfall'],
    upgrades: ['ruin_hunger', 'might', 'area', 'haste', 'quantity'],
    blessings: ['ruinous_pact', 'kings', 'fel'] },

  { name: 'glass_cannon_burst', character: 'mage', core: ['seeking_motes', 'moonbrand'],
    weapons: ['seeking_motes', 'moonbrand', 'umbral_bolt'],
    upgrades: ['might', 'ferocity', 'precision', 'quantity', 'haste'],
    blessings: ['glass_cannon', 'kings', 'air'] },
  { name: 'arcane_overflow_scaling', character: 'mage', core: ['seeking_motes', 'moonbrand'],
    weapons: ['seeking_motes', 'moonbrand', 'umbral_bolt', 'rimeshard', 'volley', 'arcweb'],
    upgrades: ['haste', 'wisdom', 'quantity', 'might', 'area'],
    blessings: ['arcane_overflow', 'wisdom', 'kings'] },
  { name: 'unyielding_defensive', character: 'paladin', core: ['judgement_disc', 'hallowed_ring'],
    weapons: ['judgement_disc', 'hallowed_ring', 'dawnpulse'],
    upgrades: ['armor', 'vitality', 'dodge', 'warding_light', 'recovery'],
    blessings: ['unyielding', 'wild', 'ancestors'] },
  { name: 'greed_economy', character: 'hunter', core: ['volley', 'seeking_motes'],
    weapons: ['volley', 'seeking_motes', 'moonbrand'],
    upgrades: ['luck', 'wisdom', 'dark_bargain', 'magnet', 'might'],
    blessings: ['fortune', 'wisdom', 'kings'] },
  { name: 'momentum_kiter', character: 'rogue', core: ['knifestorm', 'volley'],
    weapons: ['knifestorm', 'volley', 'seeking_motes'],
    upgrades: ['fleetfoot', 'haste', 'might', 'precision', 'quantity'],
    blessings: ['momentum', 'kings', 'air'] },
  { name: 'bloodthirst_sustain', character: 'warrior', core: ['axe_gyre', 'reaving_arc'],
    weapons: ['axe_gyre', 'reaving_arc', 'arcweb'],
    upgrades: ['vitality', 'might', 'armor', 'recovery', 'area'],
    blessings: ['bloodthirst', 'wild', 'kings'] },
];

/* ------------------------------------------------------ in-page policy -- */
/* Runs inside the browser. Scores every offered level-up/blessing card
 * against the archetype's priority lists and picks the best. This is a
 * heuristic autopilot, not optimal play -- it mirrors the project's own
 * playtest.js/endure.js pattern of driving real RNG'd runs with a fixed
 * policy, just one that pursues each archetype's stated identity instead of
 * a single global greedy rule. */
function scoreChoice(build, p, choice) {
  const idx = (list, id) => { const i = list.indexOf(id); return i < 0 ? -1 : i; };
  if (choice.type === 'union') return 100;
  if (choice.type === 'evolve') {
    return idx(build.core, choice.id) >= 0 ? 92 : 70;
  }
  if (choice.type === 'new_weapon') {
    const i = idx(build.weapons, choice.id);
    if (i >= 0) return 80 - i * 6;
    return p.weapons.length < 4 ? 22 : 8; // still want SOME weapons early
  }
  if (choice.type === 'weapon_rank') {
    const i = idx(build.weapons, choice.id);
    if (idx(build.core, choice.id) >= 0) return 78;
    if (i >= 0) return 60 - i * 5;
    return 35;
  }
  if (choice.type === 'stat') {
    const i = idx(build.upgrades, choice.id);
    let s = i >= 0 ? 68 - i * 5 : 15;
    // Bonus for the passive that unlocks a core weapon's evolution.
    for (const wid of build.core) {
      const d = WS.Weapons[wid];
      if (d && d.evolvePairing === choice.id) s += 18;
    }
    return s;
  }
  if (choice.type === 'breaking_point') return 28;
  if (choice.type === 'bread') {
    const frac = p.health / Math.max(1, p.maxHealth);
    return frac < 0.35 ? 66 : 6;
  }
  return 10;
}

function pickBest(build, p, choices) {
  let best = 0, bestScore = -1;
  for (let i = 0; i < choices.length; i++) {
    const s = scoreChoice(build, p, choices[i]);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return choices[best];
}

function pickBlessing(build, choices) {
  for (const id of build.blessings) {
    const c = choices.find((x) => x.id === id);
    if (c) return c;
  }
  return choices[0];
}

/* --------------------------------------------------------------- run --- */
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const errs = [];

  const argv = process.argv.slice(2);
  const onlyAt = argv.indexOf('--only');
  const only = onlyAt >= 0 ? argv[onlyAt + 1] : null;
  const seedsAt = argv.indexOf('--seeds');
  const NSEEDS = seedsAt >= 0 ? +argv[seedsAt + 1] : 5;
  const SEEDS = Array.from({ length: NSEEDS }, (_, i) => 1000 + i * 977);

  const roster = only ? ARCHETYPES.filter((a) => a.name.includes(only)) : ARCHETYPES;

  const fresh = async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('file://' + path.resolve(GAME_ROOT, 'index.html'));
    await page.waitForFunction(() => window.WS && window.WS.Game);
    await page.evaluate(() => {
      if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
      WS.Save.db.seenManual = true;
      WS.Save.unlockAll();
    });
    return page;
  };

  async function runOne(page, build, seed) {
    return page.evaluate(([build, seed, checkpoints, seconds, crowdSample, scoreFn, pickFn, blessFn]) => {
      /* eslint-disable no-eval */
      const scoreChoice = eval('(' + scoreFn + ')');
      const pickBest = eval('(' + pickFn + ')');
      const pickBlessing = eval('(' + blessFn + ')');

      WS.setSeed(seed);
      WS.Input.poll = function () {};
      WS.Game.startRun('thornhollow', build.character);
      const p = WS.Game.player;

      const snapshots = [];
      let ci = 0;
      const power = () => {
        let dps = 0;
        for (const w of p.weapons) {
          const r = WS.Weapon.reach(w.id, w.level, !!w.evolved, crowdSample, p);
          if (r) dps += r.dps;
        }
        return dps;
      };
      const snap = (t) => {
        snapshots.push({
          t: Math.round(t), level: p.level, weapons: p.weapons.length,
          maxRankWeapons: p.weapons.filter((w) => w.level >= WS.WEAPON_MAX_LEVEL).length,
          evolved: p.weapons.filter((w) => w.evolved).length,
          power: Math.round(power()),
          hpFrac: Math.round((p.health / Math.max(1, p.maxHealth)) * 100),
          kills: WS.Game.run.kills, gold: WS.Game.run.gold,
          damageDone: Math.round(WS.Game.run.damageDone),
          damageTaken: Math.round(WS.Game.run.damageTaken),
          onField: WS.Enemy.pool.count,
        });
      };

      /* Reactive kiting bot, matching tools/playtest.js: patrol a slow ellipse
         around the map center, but flee directly away from anything that gets
         within 160px. A fixed patrol (this script's first draft) walks a build
         through danger it could trivially have sidestepped, which understates
         every build's real survivability by the same amount a real player's
         reflexes would recover -- reusing the project's own established bot
         keeps the comparison to what the project already trusts. */
      const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
      const drive = () => {
        const t = WS.Game.run.time;
        let tx = W / 2 + Math.cos(t * 0.5) * 240, ty = H / 2 + Math.sin(t * 0.5) * 170;
        const near = WS.Enemy.findNearest(p.x, p.y, 160);
        if (near) {
          const dx = p.x - near.x, dy = p.y - near.y, d = Math.hypot(dx, dy) || 1;
          tx = p.x + dx / d * 250; ty = p.y + dy / d * 250;
        }
        const bnd = WS.Game.arenaBounds;
        const lo = bnd || { minX: 60, maxX: W - 60, minY: 60, maxY: H - 60 };
        tx = Math.max(lo.minX + 20, Math.min(lo.maxX - 20, tx));
        ty = Math.max(lo.minY + 20, Math.min(lo.maxY - 20, ty));
        const k = WS.Input.keys;
        k.left = tx - p.x < -6; k.right = tx - p.x > 6; k.up = ty - p.y < -6; k.down = ty - p.y > 6;
      };

      let lowestHpFrac = 1, maxEnemies = 0, died = false;
      const STEP = 1 / 60;
      /* Generous safety cap, not the real stopping condition: hit-stop and the
         settle-into-levelup slowdown both call Game.update() without
         advancing run.time by a full 1/60s, so a fixed seconds*60 iteration
         budget runs out a little short of the real deathTime on a busy build.
         The loop below stops on run.time reaching `seconds`, same as the game
         itself; this cap only guards against a genuine stall. */
      const totalTicks = seconds * 120;
      for (let i = 0; i < totalTicks; i++) {
        if (WS.Game.state === 'blessing') {
          const choice = pickBlessing(build, WS.Game.blessingChoices || []);
          if (choice) WS.Game.chooseBlessing(choice);
          WS.Game.update(STEP);
          continue;
        }
        if (WS.Game.state === 'levelup') {
          const choice = pickBest(build, p, WS.Game.levelChoices || []);
          if (choice) WS.Game.chooseLevelUp(choice);
          WS.Game.update(STEP);
          continue;
        }
        if (!WS.Game.running && WS.Game.state !== 'dying') {
          died = !(WS.Game.run && WS.Game.run.victorious);
          break;
        }
        if (WS.Game.state !== 'playing') { WS.Game.update(STEP); continue; }
        drive();
        WS.Game.update(STEP);
        const frac = p.health / Math.max(1, p.maxHealth);
        if (frac < lowestHpFrac) lowestHpFrac = frac;
        if (WS.Enemy.pool.count > maxEnemies) maxEnemies = WS.Enemy.pool.count;
        const t = WS.Game.run.time;
        while (ci < checkpoints.length && checkpoints[ci] <= t) { snap(t); ci++; }
        if (t >= seconds || WS.Game.run.victorious) break;
      }
      // final snapshot regardless of how the run ended
      snap(WS.Game.run ? WS.Game.run.time : 0);

      const run = WS.Game.run;
      return {
        archetype: build.name, seed,
        survived: run ? Math.round(run.time) : 0,
        died, victorious: run ? run.victorious : false,
        level: p.level, kills: run ? run.kills : 0,
        bosses: run ? run.bossesSlain : 0,
        gold: run ? run.gold : 0,
        damageDone: run ? Math.round(run.damageDone) : 0,
        damageTaken: run ? Math.round(run.damageTaken) : 0,
        lowestHpPct: Math.round(lowestHpFrac * 100),
        maxEnemies,
        weapons: p.weapons.map((w) => w.id + ':' + w.level + (w.evolved ? 'E' : '')),
        passives: Object.keys(p.upgradeLevels),
        blessings: p.blessingNames.slice(),
        snapshots,
      };
    }, [build, seed, CHECKPOINTS, RUN_SECONDS, CROWD_SAMPLE,
      scoreChoice.toString(), pickBest.toString(), pickBlessing.toString()]);
  }

  const results = [];
  let n = 0, total = roster.length * SEEDS.length;
  for (const build of roster) {
    for (const seed of SEEDS) {
      const page = await fresh();
      let r;
      try {
        r = await runOne(page, build, seed);
      } catch (e) {
        errs.push(build.name + '/' + seed + ': ' + e.message);
        r = null;
      }
      await page.close();
      if (r) results.push(r);
      n++;
      process.stderr.write(`\r${n}/${total} (${build.name} seed=${seed})          `);
    }
  }
  process.stderr.write('\n');
  await browser.close();
  if (errs.length) {
    console.error('errors:');
    for (const e of errs.slice(0, 20)) console.error('  ' + e);
  }

  const outAt = argv.indexOf('--json');
  const outPath = outAt >= 0 ? argv[outAt + 1] : null;
  const payload = { when: new Date().toISOString(), seeds: SEEDS, checkpoints: CHECKPOINTS, results };
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 1));
    console.log('wrote ' + outPath + ' (' + results.length + ' runs)');
  } else {
    console.log(JSON.stringify(payload, null, 1));
  }
})();
