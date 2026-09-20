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
 * down; only the ruinborn can close it entirely.
 *
 * NEGATIVE TESTS, all confirmed against a build with the fix removed:
 *   - restoring the `health < maxHealth` gate on regen gives "a survivor at
 *     full health regenerated 0 overheal in 10s"
 *   - restoring the full-health early-out in Player.lifesteal gives
 *     "lifesteal at full health recorded 0 overheal"
 *   - returning 0 from ruinRecovery for everyone gives "paladin held Ruinform
 *     for 93.2% of the siege on 1 entry - that is permanent"
 *   - giving the ruinborn the same floor as everyone else gives "ruinseeker
 *     could not hold Ruinform at max Ruin Hunger (84.7%, 6 entries)"
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
  const CASES = [
    { id: 'ruinseeker', pact: false, rank: 5 },
    { id: 'ruinseeker', pact: false, rank: 0 },
    { id: 'paladin', pact: true, rank: 5 },
    { id: 'paladin', pact: true, rank: 0 },
  ];
  const ruin = [];
  for (const c of CASES) {
    const r = await page.evaluate(({ c, src }) => {
      const WS = window.WS, STEP = 1 / 60;
      const p = eval('(' + src + ')')(WS, c.id, { weapons:
        ['seeking_motes', 'cinderfall', 'rimeshard', 'arcweb', 'dawnpulse', 'verdant_lance'] });
      p.damageMultiplier *= 6;
      if (c.pact) { p.felAttuned += 1; p.felBonus += WS.Blessings.ruinous_pact.felGain; }
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
      return { uptime: ticks ? inForm / ticks : 0, entries,
        recovery: WS.Player.ruinRecovery(p), ruinborn: p.ruinborn };
    }, { c, src: setup.toString() });
    ruin.push({ ...c, ...r });
  }

  const by = (id, rank) => ruin.find((r) => r.id === id && r.rank === rank);
  const born5 = by('ruinseeker', 5), born0 = by('ruinseeker', 0);
  const pact5 = by('paladin', 5), pact0 = by('paladin', 0);

  /* The Ruinseeker at max Ruin Hunger holds it. "Holds it" is ONE entry, not a
     high percentage: a cycle that happens to be fast is still a cycle, and the
     percentage is dragged down by the seconds before the first entry however
     seamless the rest is. */
  if (born5.entries !== 1 || born5.recovery > 0) {
    fail.push(`ruinseeker could not hold Ruinform at max Ruin Hunger `
      + `(${(born5.uptime * 100).toFixed(1)}%, ${born5.entries} entries, `
      + `${born5.recovery}s of recovery) - that is the one build it is for`);
  }
  // and cannot hold it without the investment
  if (born0.entries <= 1) {
    fail.push('ruinseeker held Ruinform unbroken with no Ruin Hunger at all - '
      + 'the ranks have to buy something on the class they belong to');
  }
  // nobody else holds it, at any rank
  for (const r of [pact5, pact0]) {
    if (r.entries <= 1) {
      fail.push(`${r.id} held Ruinform for ${(r.uptime * 100).toFixed(1)}% of the siege `
        + `on ${r.entries} entry - that is permanent, and the Ruinous Pact is not `
        + 'supposed to hand another class the Ruinseeker\'s whole identity');
    }
    if (r.recovery <= 0) {
      fail.push(`${r.id}'s recovery window is ${r.recovery}s - without one there is no `
        + 'ceiling on uptime at all, whatever the rate');
    }
  }
  // but max Ruin Hunger must get them CLOSE, or the ranks are not worth taking
  if (!(pact5.uptime > 0.75)) {
    fail.push(`max Ruin Hunger off-class reached only ${(pact5.uptime * 100).toFixed(1)}% `
      + 'uptime - it should come close to permanent without being permanent');
  }
  if (!(pact5.uptime - pact0.uptime > 0.10)) {
    fail.push(`Ruin Hunger moved off-class uptime from ${(pact0.uptime * 100).toFixed(1)}% `
      + `to only ${(pact5.uptime * 100).toFixed(1)}% - five ranks have to be felt`);
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
    + 'left at 0 because none of it landed; and over a 90s siege the Ruinseeker holds '
    + `Ruinform unbroken at max Ruin Hunger (${(born5.uptime * 100).toFixed(1)}%, one entry, `
    + 'no recovery window) but not without it '
    + `(${(born0.uptime * 100).toFixed(1)}%, ${born0.entries} entries), while a Ruinous Pact `
    + `paladin gets close and no further (${(pact0.uptime * 100).toFixed(1)}% at no ranks, `
    + `${(pact5.uptime * 100).toFixed(1)}% at five, ${pact5.entries} entries, `
    + `${pact5.recovery}s of recovery it can never shed)`);
})();
