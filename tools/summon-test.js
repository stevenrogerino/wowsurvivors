#!/usr/bin/env node
/* THE SUMMON TEST: what spirit wolves and ghouls each actually do.
 *
 * Both are rare passives with three ranks, and they were one creature with
 * different numbers: the same hunt, the same targets, the same area bite.
 * This drops a survivor with one weapon into the real waves at MINUTE on
 * MAP, gives them three wolves or three ghouls (or neither), kites for WARM
 * seconds and counts for LIMIT, over SEEDS seeds each:
 *
 *   summon    damage per second the summons landed (capped at the health a
 *             creature had left, as a meter counts it)
 *   weapon    damage per second the weapon landed alongside them
 *   kills     creatures killed per minute, by anyone
 *   casters   of the creatures that shoot, how many died per minute
 *   hurt      damage per second that reached the survivor (who cannot die)
 *   near      creatures within 120px of the survivor, on average
 *
 *   node tools/summon-test.js
 *   MAP=mourneholt MINUTE=14 RANKS=3 SEEDS=4 node tools/summon-test.js
 *   GATE=1 node tools/summon-test.js && GATE=1 BOSS=murkgill node tools/summon-test.js
 *                                                     exit 1 if the two blur
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const S = {
  MAP: env('MAP', 'dustreach'), MINUTE: +env('MINUTE', 10), RANKS: +env('RANKS', 3),
  SEEDS: +env('SEEDS', 3), WARM: +env('WARM', 8), LIMIT: +env('LIMIT', 50),
  WEAPON: env('WEAPON', 'volley:5'), HERO: env('HERO', 'hunter'),
  // BOSS=murkgill: also a boss that cannot die, standing 200px off, and
  // the summons' damage to it counted apart (bossdmg/s).
  BOSS: env('BOSS', ''),
  /* LEVEL: the survivor's level. By default the level a real night has
     reached at MINUTE (the bot's nights: about 50 at 5:00, 78 at 12:00, 110
     at 20:00, 138 at 30:00). It used to be 12 + 2 x MINUTE - 36 at 12:00,
     half the real level, which understated anything that scales with it. */
  LEVEL: +env('LEVEL', 0),
  // TUNE='dmgPerLevel=0.15,ghoulRot=1.1': Familiar.tuning overrides to try.
  TUNE: env('TUNE', ''),
};
const LEVEL_AT = [[0, 1], [5, 50], [12, 78], [20, 110], [30, 138]];
function levelAt(m) {
  for (let i = 1; i < LEVEL_AT.length; i++) {
    const [m0, l0] = LEVEL_AT[i - 1], [m1, l1] = LEVEL_AT[i];
    if (m <= m1) return Math.round(l0 + (l1 - l0) * (m - m0) / (m1 - m0));
  }
  return 138;
}
if (!S.LEVEL) S.LEVEL = levelAt(S.MINUTE);
console.log(`summons at ${S.MINUTE}:00 on ${S.MAP}, level ${S.LEVEL}, ${S.RANKS} ranks, beside ${S.WEAPON}${S.TUNE ? ', tuning ' + S.TUNE : ''}`);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const rows = [];
  for (const kind of ['none', 'wolf', 'ghoul']) {
    const acc = { summon: 0, weapon: 0, kills: 0, casters: 0, hurt: 0, near: 0, boss: 0 };
    for (let seed = 0; seed < S.SEEDS; seed++) {
      const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('pageerror', (e) => console.error(kind + ': ' + e.message));
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
      await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
      const r = await page.evaluate(({ S, kind, seed }) => {
        if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
        WS.UI.closeOverlay();
        WS.Save.db.seenManual = true; WS.Save.unlockAll();
        WS.Save.save = () => {}; WS.Save.flush = () => {};
        WS.Save.settings.difficulty = 'professional';
        WS.setSeed(9100 + seed);
        const G = WS.Game;
        let hurt = 0, hurting = false;
        WS.Player.takeDamage = (pl, amount) => { if (hurting && amount > 0) hurt += amount; return false; };
        G.startRun(S.MAP, S.HERO);
        G.chooseBlessing({ type: 'blessing', id: 'kings' });
        const p = G.player;
        G.openLevelUp = () => {}; G.presentLevelUp = () => {};
        G.state = 'playing'; WS.UI.closeOverlay();
        p.weapons.length = 0; p.weaponLevels = {};
        const [wid, wr] = S.WEAPON.split(':');
        const w = WS.Player.addWeapon(p, wid);
        w.level = parseInt(wr, 10); p.weaponLevels[wid] = w.level;
        w.evolved = /E$/.test(wr);   // volley:8E is the evolved weapon
        p.level = S.LEVEL;
        for (const kv of S.TUNE.split(',').filter(Boolean)) { const [k, v] = kv.split('='); WS.Familiar.tuning[k] = +v; }
        const up = kind === 'wolf' ? 'spirit_companion' : kind === 'ghoul' ? 'grave_call' : null;
        if (up) for (let k = 0; k < S.RANKS; k++) { WS.Upgrades[up].apply(p, WS.Upgrades[up]); p.upgradeLevels[up] = k + 1; }
        WS.Input.poll = () => {};
        for (const k of Object.keys(WS.Input.keys)) WS.Input.keys[k] = false;
        const cx = WS.CONST.WORLD_WIDTH / 2, cy = WS.CONST.WORLD_HEIGHT / 2;
        p.x = cx; p.y = cy;
        G.run.time = S.MINUTE * 60 - S.WARM;
        const kite = () => {
          const t = G.run.time;
          let tx = cx + Math.cos(t * 0.5) * 240, ty = cy + Math.sin(t * 0.5) * 170;
          const n = WS.Enemy.findNearest(p.x, p.y, 150);
          if (n) { const dx = p.x - n.x, dy = p.y - n.y, d = Math.hypot(dx, dy) || 1; tx = p.x + dx / d * 250; ty = p.y + dy / d * 250; }
          const K = WS.Input.keys, H = WS.Input.held || {};
          K.left = H.left = tx - p.x < -6; K.right = H.right = tx - p.x > 6; K.up = H.up = ty - p.y < -6; K.down = H.down = ty - p.y > 6;
        };
        const landed = {};
        let counting = false;
        const dmg = WS.Enemy.damage;
        WS.Enemy.damage = function (e, amount, crit, source) {
          if (counting && e && !e._dead && !(e.invuln > 0)) landed[source || '?'] = (landed[source || '?'] || 0) + Math.min(amount, Math.max(0, e.health));
          return dmg.apply(this, arguments);
        };
        let casters = 0;
        const kill = WS.Enemy.kill;
        WS.Enemy.kill = function (e) { if (counting && e.template && e.template.ranged) casters++; return kill.apply(this, arguments); };
        const tick = () => { G.pendingLevelUps = 0; G.leveling = false; if (G.state !== 'playing') { WS.UI.closeOverlay(); G.state = 'playing'; } p.health = p.maxHealth; kite(); G.update(1 / 60); };
        for (let i = 0; i < S.WARM * 60; i++) tick();
        let boss = null;
        if (S.BOSS) {
          boss = WS.Enemy.spawn(S.BOSS, p.x + 200, p.y, 1, true);
          if (boss) { boss.maxHealth = boss.health = 1e12; }
        }
        let bossHit = 0;
        const dmg2 = WS.Enemy.damage;
        WS.Enemy.damage = function (e, amount, crit, source) {
          if (counting && e === boss && (source === 'wolves' || source === 'ghouls')) bossHit += amount;
          return dmg2.apply(this, arguments);
        };
        const k0 = G.run.kills; counting = true; hurting = true;
        let near = 0;
        for (let i = 0; i < S.LIMIT * 60; i++) {
          tick();
          if (i % 30 === 0) { let n = 0; for (let j = 0; j < WS.Enemy.pool.count; j++) { const e = WS.Enemy.pool.active[j]; if (!e._dead && WS.dist2(e.x, e.y, p.x, p.y) < 14400) n++; } near += n; }
        }
        const src = kind === 'wolf' ? 'wolves' : 'ghouls';
        return { summon: (landed[src] || 0) / S.LIMIT, weapon: (landed[wid] || 0) / S.LIMIT,
          kills: (G.run.kills - k0) * 60 / S.LIMIT, casters: casters * 60 / S.LIMIT,
          hurt: hurt / S.LIMIT, near: near / (S.LIMIT * 2), boss: bossHit / S.LIMIT };
      }, { S, kind, seed });
      await page.close();
      for (const k in acc) acc[k] += r[k] / S.SEEDS;
    }
    rows.push([kind, acc]);
  }
  await b.close();
  console.log(`${S.MAP} ${S.MINUTE}:00, ${S.HERO} with ${S.WEAPON}, ${S.RANKS} ranks, ${S.SEEDS} seeds x ${S.LIMIT}s`);
  console.log('summons'.padEnd(9) + ['summon/s', 'weapon/s', 'kills/m', 'casters/m', 'hurt/s', 'near', 'bossdmg/s'].map((c) => c.padStart(11)).join(''));
  for (const [k, a] of rows) {
    console.log(k.padEnd(9) + [a.summon, a.weapon, a.kills, a.casters, a.hurt, a.near, a.boss].map((v) => v.toFixed(1).padStart(11)).join(''));
  }
  /* GATE=1: the two have to stay two things - in a horde (no BOSS) the
     guard, the rot and the parity; against a boss (BOSS set) the pack. Run
     both for the full gate. Each rule was a
     sameness this rework removed; measured at the rework, wolves did 5x the
     ghouls' damage to a boss, ghouls let through 0.62x the harm and lifted the
     weapon beside them 1.22x, and their total damage was within 10%. */
  if (process.env.GATE) {
    const W = rows.find((r) => r[0] === 'wolf')[1], G = rows.find((r) => r[0] === 'ghoul')[1];
    const fail = [];
    if (S.BOSS && !(W.boss > G.boss * 2)) fail.push(`wolves do ${(W.boss / (G.boss || 1)).toFixed(2)}x the ghouls' damage to a boss - the pack is not going for the big thing`);
    if (!S.BOSS && !(G.hurt < W.hurt * 0.85)) fail.push(`ghouls let through ${(G.hurt / W.hurt).toFixed(2)}x the harm wolves do - the guard is not guarding`);
    if (!S.BOSS && !(G.weapon > W.weapon * 1.05)) fail.push(`the weapon beside ghouls lands ${(G.weapon / W.weapon).toFixed(2)}x what it does beside wolves - the rot is not biting`);
    const ratio = W.summon / (G.summon || 1);
    if (!S.BOSS && !(ratio > 0.6 && ratio < 1.67)) fail.push(`wolves do ${ratio.toFixed(2)}x the ghouls' total damage - one of the two is simply better`);
    if (fail.length) { console.log('FAIL\n  - ' + fail.join('\n  - ')); process.exitCode = 1; }
    else console.log(S.BOSS ? 'ok: the pack goes for the big thing'
      : 'ok: the guard keeps the crowd off and rots it for your weapons, and neither simply outdamages the other');
  }
})();
