#!/usr/bin/env node
/* Two economies that were quietly wrong, measured.
 *
 * OVERHEAL is the part of a heal that would be wasted. It is not a thing that
 * only happens to the wounded, and it is not a reason to skip the heal. Both
 * of the repeating heal sources in the game - passive regeneration and
 * lifesteal - used to check `health < maxHealth` before firing, with an
 * `|| curdled > 0` escape hatch bolted on for the one blessing that reads the
 * overflow. So a survivor at full health without Curdled Light did not
 * regenerate at all, the Overhealing meter read zero for exactly the player
 * doing the most overhealing, and any future on-heal trigger would have had
 * to ask whether you were hurt before it fired. Here: sit at full health, run
 * the clock, and require that both sources still produce measured overheal.
 *
 * RUINFORM had no ceiling. The Ruinseeker's perk set `felAttuned` and nothing
 * else - the same flag the Ruinous Pact blessing hands to any class - and the
 * pact ALSO carried +30% fel gain, so a paladin holding it charged the meter
 * faster than the class the mechanic belongs to. Measured over a 90s siege,
 * every class sat at 93.2% uptime with a single entry: enter once at six
 * seconds, never come out, at every rank of Ruin Hunger including none.
 *
 * The fix is a recovery window after the form ends during which no fel can be
 * gathered at all, because that is the only kind of limit that survives the
 * throughput. A rate cannot cap uptime: late-run overkill measures about 4000
 * a second against a 3500 bar, so any in-form rate above a rounding error
 * refills it inside one form. Scaling that rate by rank was tried first and
 * moved the measured uptime by 0.0 points at every rank on every class. A
 * window the bar cannot move in gives a hard ceiling of
 * duration / (duration + recovery) whatever the overkill. Ruin Hunger buys it
 * down, and the ruinborn (a Ruinseeker who takes the Ruinous Pact) get a
 * shorter window than anyone else - a few points of uptime, never permanent.
 *
 * NEGATIVE TESTS, all confirmed against a build with the fix removed:
 *   - restoring the `health < maxHealth` gate on regen gives "a survivor at
 *     full health regenerated 0 overheal in 10s"
 *   - restoring the full-health early-out in Player.lifesteal gives
 *     "lifesteal at full health recorded 0 overheal"
 *   - returning 0 from ruinRecovery for everyone gives "paladin held Ruinform
 *     for 93.2% of the siege on 1 entry - that is permanent"
 *   - giving the ruinborn the same recovery as everyone else gives "the
 *     ruinborn edge at max Ruin Hunger is 0.0 points"
 *
 *   node tools/check-ruin.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SIM = fs.readFileSync(path.resolve(__dirname, 'sim-core.js'), 'utf8');
const fail = [];

/* A build that actually overkills, so the fel economy is measured in the
   regime it breaks in rather than in a quiet one. */
function setup(WS, id, opts) {
  WS.setSeed(1234567);
  WS.Game.startRun('thornhollow', id);
  if (WS.Game.blessingChoices) WS.Game.chooseBlessing(0);
  const p = WS.Game.player;
  WS.WaveManager.update = function () {};
  WS.Game.openLevelUp = function () { this.pendingLevelUps = 0; };
  WS.Game.presentLevelUp = function () { this.pendingLevelUps = 0; };
  WS.Enemy.pool.releaseAll(); WS.Pickup.clear(); WS.XP.clear();
  WS.Projectile.clear(); WS.FX.clear();
  WS.Input.poll = function () {};
  p.weapons.length = 0; p.weaponLevels = {}; p.combosActive = {};
  for (const w of (opts.weapons || [])) {
    WS.Player.addWeapon(p, w);
    const got = WS.Player.getWeapon(p, w);
    if (got) { got.level = 8; p.weaponLevels[w] = 8; }
  }
  p.x = 640; p.y = 360;
  p.maxHealth = 1e9; p.health = 1e9;
  return p;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.WS && window.WS.Game);
  await page.evaluate(SIM);

  /* ---------------------------------------------------- overheal at full -- */
  const heal = await page.evaluate(() => {
    const WS = window.WS, STEP = 1 / 60;
    const out = {};

    // regen, at full health, with no Curdled Light anywhere near it
    WS.setSeed(99);
    WS.Game.startRun('thornhollow', 'priest');
    if (WS.Game.blessingChoices) WS.Game.chooseBlessing(0);
    let p = WS.Game.player;
    WS.WaveManager.update = function () {};
    WS.Game.openLevelUp = function () { this.pendingLevelUps = 0; };
    WS.Game.presentLevelUp = function () { this.pendingLevelUps = 0; };
    WS.Enemy.pool.releaseAll(); WS.Input.poll = function () {};
    p.curdled = 0; p.curdlePool = 0;
    p.healthRegen = 20; p.healingMult = 1;
    p.health = p.maxHealth;
    const before = WS.Game.run.overhealDone;
    for (let i = 0; i < 600; i++) WS.Game.update(STEP);
    out.regen = WS.Game.run.overhealDone - before;
    out.regenHealed = WS.Game.run.healingDone;
    out.stillFull = p.health >= p.maxHealth;

    // lifesteal, at full health, likewise
    p.curdled = 0;
    const b2 = WS.Game.run.overhealDone;
    p.lifesteal = 0.5;
    for (let i = 0; i < 40; i++) WS.Player.lifesteal(p, 10);
    out.lifesteal = WS.Game.run.overhealDone - b2;

    // and the meter has to attribute it, not just total it
    out.sources = Object.keys(WS.Game.run.overhealBySource);
    return out;
  });

  if (!(heal.regen > 0)) {
    fail.push(`a survivor at full health regenerated ${heal.regen} overheal in 10s - `
      + 'overheal is the part of a heal that would be wasted, so a heal that would '
      + 'happen has to happen and be measured');
  }
  if (!(heal.lifesteal > 0)) {
    fail.push(`lifesteal at full health recorded ${heal.lifesteal} overheal`);
  }
  if (heal.regenHealed !== 0) {
    fail.push(`healing at full health recorded ${heal.regenHealed} of real healing - `
      + 'nothing landed, so the healing meter must stay at zero');
  }
  if (!heal.sources.includes('regen') || !heal.sources.includes('lifesteal')) {
    fail.push(`overheal was totalled but not attributed (${heal.sources.join(', ') || 'nothing'})`);
  }

  /* ------------------------------------------------------ ruinform uptime -- */
  /* Everyone reaches Ruinform through the Ruinous Pact now - the Ruinseeker
     is offered it rather than born with it - and taking it is what makes the
     Ruinseeker ruinborn. So every case takes it the way a player does, by
     the blessing's own apply. */
  const CASES = [
    { id: 'ruinseeker', rank: 5 },
    { id: 'ruinseeker', rank: 0 },
    { id: 'paladin', rank: 5 },
    { id: 'paladin', rank: 0 },
  ];
  const ruin = [];
  for (const c of CASES) {
    const r = await page.evaluate(({ c, src }) => {
      const WS = window.WS, STEP = 1 / 60;
      const p = eval('(' + src + ')')(WS, c.id, { weapons:
        ['seeking_motes', 'cinderfall', 'rimeshard', 'arcweb', 'dawnpulse', 'verdant_lance'] });
      p.damageMultiplier *= 6;
      WS.Blessings.ruinous_pact.apply(p, WS.Blessings.ruinous_pact);
      p.soulRending = c.rank;
      const script = window.WSSim.siegeScript();
      let next = 0, t = 0, inForm = 0, ticks = 0, entries = 0, wasIn = false;
      while (t < 90) {
        while (next < script.length && script[next].t <= t) {
          const s = script[next++]; WS.Enemy.spawn(s.id, s.x, s.y, 1, true);
        }
        const leg = Math.floor(t / 4) % 4, k = WS.Input.keys;
        k.up = leg === 0; k.right = leg === 1; k.down = leg === 2; k.left = leg === 3;
        WS.Game.update(STEP);
        if (!WS.Game.running) break;
        const now = p.metaTimer > 0;
        if (now && !wasIn) entries++;
        wasIn = now;
        if (now) inForm++;
        ticks++; t += STEP;
      }
      const dur = WS.Config.metaDuration + WS.Config.metaDurationPerRank * c.rank;
      const rec = WS.Player.ruinRecovery(p);
      return { uptime: ticks ? inForm / ticks : 0, entries,
        recovery: rec, ruinborn: p.ruinborn, ceiling: dur / (dur + rec) };
    }, { c, src: setup.toString() });
    ruin.push({ ...c, ...r });
  }

  const by = (id, rank) => ruin.find((r) => r.id === id && r.rank === rank);
  const born5 = by('ruinseeker', 5), born0 = by('ruinseeker', 0);
  const pact5 = by('paladin', 5), pact0 = by('paladin', 0);

  /* The current design, in the four rules it rests on:
       - nobody holds it forever: every case cycles, with a recovery window
         it cannot shed, the ruinborn included;
       - the ceiling is real: measured uptime never beats
         duration / (duration + recovery), whatever the overkill;
       - the ruinborn edge is small and real: ahead of any other class at
         the same rank, by a few points, not by a different game;
       - Ruin Hunger is felt on both. */
  for (const r of ruin) {
    if (r.entries <= 1) {
      fail.push(`${r.id} (rank ${r.rank}) held Ruinform on ${r.entries} entry `
        + `(${(r.uptime * 100).toFixed(1)}%) - nobody holds it permanently any more`);
    }
    if (r.recovery <= 0) fail.push(`${r.id} (rank ${r.rank}) has no recovery window`);
    if (r.uptime > r.ceiling + 0.02) {
      fail.push(`${r.id} (rank ${r.rank}) held Ruinform ${(r.uptime * 100).toFixed(1)}% of the `
        + `siege, above its ${(r.ceiling * 100).toFixed(1)}% ceiling`);
    }
  }
  if (born5.ruinborn <= 0) fail.push('the Ruinous Pact did not make the Ruinseeker ruinborn');
  if (!(born5.uptime - pact5.uptime > 0.03)) {
    fail.push(`the ruinborn edge at max Ruin Hunger is ${((born5.uptime - pact5.uptime) * 100).toFixed(1)} `
      + 'points - the class it belongs to has to be ahead');
  }
  if (!(pact5.uptime > 0.6)) {
    fail.push(`max Ruin Hunger off-class reached only ${(pact5.uptime * 100).toFixed(1)}% - `
      + 'the Pact has to stay worth building for everyone');
  }
  for (const [lo, hi] of [[born0, born5], [pact0, pact5]]) {
    if (!(hi.uptime - lo.uptime > 0.05)) {
      fail.push(`Ruin Hunger moved ${hi.id} from ${(lo.uptime * 100).toFixed(1)}% to only `
        + `${(hi.uptime * 100).toFixed(1)}% - five ranks have to be felt`);
    }
  }

  await browser.close();
  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    process.exit(1);
  }
  console.log('ok: at full health a survivor still regenerates '
    + `(${Math.round(heal.regen)} overheal in 10s) and still lifesteals `
    + `(${Math.round(heal.lifesteal)}), both attributed by source, with the healing meter `
    + 'left at 0 because none of it landed; and over a 90s siege Ruinform cycles for everyone - '
    + `the Ruinseeker ${(born0.uptime * 100).toFixed(1)}% -> ${(born5.uptime * 100).toFixed(1)}% `
    + `(ceiling ${(born5.ceiling * 100).toFixed(1)}%, ${born5.recovery}s recovery), a Pact paladin `
    + `${(pact0.uptime * 100).toFixed(1)}% -> ${(pact5.uptime * 100).toFixed(1)}% `
    + `(ceiling ${(pact5.ceiling * 100).toFixed(1)}%, ${pact5.recovery}s)`);
})();
