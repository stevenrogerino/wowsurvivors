#!/usr/bin/env node
/* How a union measures against the pair of evolved weapons it consumes.
 *
 * Not a guard - there is nothing here to pass or fail. It is the instrument
 * the union numbers in src/data/weapons.js were fitted with, kept so the
 * fitting can be repeated with a longer sample than a conversation allows.
 *
 *   TIME=1260 node tools/tune-unions.js
 *   TIME=600 SEEDS=12 node tools/tune-unions.js
 *   MULTS='{"union_firmament":1.4}' node tools/tune-unions.js
 *
 * TIME is where in the run to measure, in seconds, and it matters more than
 * anything else here: a union cannot exist until two weapons are at rank 8 and
 * evolved, so the fight it lives in is the late one. Firmament reads 78% of
 * its pair at 10:00 and 60% at 21:00. Measuring at the wrong minute balances a
 * different weapon.
 *
 * Two columns, because they disagree and the disagreement is informative.
 * effDmg% is damage that actually came off health - overkill clipped, since
 * run.damageDone books the whole swing and that flatters anything hitting far
 * harder than an enemy has health. kills% is clear rate, which is what a
 * player feels and cannot be inflated by overkill. Ruin Unbound has measured
 * 93% on the first and 106% on the second in the same run.
 *
 * peak field is there so saturation is visible rather than assumed: if the
 * crowd is not growing, both builds are killing everything that arrives and
 * the ratio means nothing.
 *
 * EXPECT NOISE of roughly ten points at five seeds. Three of the five unions
 * sit inside that band of each other, which is why only the two clear outliers
 * were ever moved. Raise SEEDS before believing a small difference.
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.waitForFunction(() => window.WS && WS.Unions);
  await p.waitForTimeout(400);
  await p.evaluate(() => { if (WS.Prologue.active) WS.Prologue.finish(); WS.UI.closeOverlay();
    WS.Save.db.seenManual = true; });

  const TIME = +(process.env.TIME || 600);
  const N = +(process.env.SEEDS || 5);
  const r = await p.evaluate(({ mults, TIME, N }) => {
    if (!window.__base) { window.__base = {};
      for (const r of WS.Unions) window.__base[r.result] = WS.Weapons[r.result].damage; }
    for (const r of WS.Unions)
      WS.Weapons[r.result].damage = window.__base[r.result] * (mults[r.result] || 1);

    const evolve = (pl, id) => { const w = WS.Player.addWeapon(pl, id);
      w.level = WS.WEAPON_MAX_LEVEL; pl.weaponLevels[id] = w.level; w.evolved = true; };
    const union = (pl, id) => { const w = WS.Player.addWeapon(pl, id);
      w.level = WS.WEAPON_MAX_LEVEL; pl.weaponLevels[id] = w.level; };

    /* Real waves ten minutes in. Effective damage only - overkill is clipped,
       because run.damageDone books the whole swing and that flatters anything
       that hits far harder than an enemy has health. Kills and the final field
       size come too, so saturation is visible rather than assumed. */
    const live = (build, seed) => {
      WS.setSeed(seed);
      WS.Game.startRun('thornhollow', 'mage');
      WS.Game.chooseBlessing({ type: 'blessing', id: 'kings' });
      const pl = WS.Game.player;
      pl.weapons.length = 0; pl.weaponLevels = {};
      for (const c of WS.ComboOrder) pl.combosActive[c] = true;
      build(pl);
      WS.Enemy.pool.releaseAll(); WS.Hazard.pool.releaseAll(); WS.Projectile.bolts.releaseAll();
      WS.Game.run.time = TIME;
      pl.x = 640; pl.y = 360;
      let eff = 0, kills = 0;
      const realDamage = WS.Enemy.damage;
      WS.Enemy.damage = function (e, amount, isCrit, source) {
        if (e && !e._dead && e.invuln <= 0) {
          eff += Math.min(amount, Math.max(0, e.health));
          if (amount >= e.health) kills++;
        }
        return realDamage.apply(this, arguments);
      };
      let peak = 0;
      for (let i = 0; i < 60 * 20; i++) {
        pl.health = pl.maxHealth;
        WS.Game.tick(WS.CONST.TICK_RATE);
        if (i % 30 === 0) peak = Math.max(peak, WS.Enemy.pool.count);
        if (WS.Game.state !== 'playing') break;
      }
      WS.Enemy.damage = realDamage;
      return { eff: Math.round(eff), kills, field: WS.Enemy.pool.count, peak };
    };

    const SEEDS = Array.from({ length: N }, (_, i) => 11 + i * 13);
    void 0;
    const out = [];
    for (const r of WS.Unions) {
      const acc = { pe: 0, pk: 0, ue: 0, uk: 0, pf: 0, uf: 0 };
      for (const s of SEEDS) {
        const a = live(pl => { evolve(pl, r.from[0]); evolve(pl, r.from[1]); }, s);
        const c = live(pl => union(pl, r.result), s);
        acc.pe += a.eff; acc.pk += a.kills; acc.pf += a.peak;
        acc.ue += c.eff; acc.uk += c.kills; acc.uf += c.peak;
      }
      const n = SEEDS.length;
      out.push({ name: WS.Weapons[r.result].name, id: r.result,
        dmg: +WS.Weapons[r.result].damage.toFixed(2),
        effRatio: acc.ue / acc.pe, killRatio: acc.uk / acc.pk,
        pairKills: Math.round(acc.pk/n), unionKills: Math.round(acc.uk/n),
        pairField: Math.round(acc.pf/n), unionField: Math.round(acc.uf/n) });
    }
    return out;
  }, { mults: JSON.parse(process.env.MULTS || '{}'), TIME, N });

  console.log('at t=' + TIME + 's over ' + N + ' seeds');
  console.log('  ' + 'union'.padEnd(15) + 'dmg'.padStart(6) + '  effDmg%  kills%   kills(pair->union)  peak field');
  r.forEach(x => console.log('  ' + x.name.padEnd(15) + String(x.dmg).padStart(6)
    + (x.effRatio*100).toFixed(0).padStart(8) + '%'
    + (x.killRatio*100).toFixed(0).padStart(7) + '%'
    + ('   ' + x.pairKills + ' -> ' + x.unionKills).padEnd(22)
    + x.pairField + ' / ' + x.unionField));
  await b.close();
})();
