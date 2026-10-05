#!/usr/bin/env node
/* THE FINALE BENCH: the six finales and the Eclipse Arena, fought by the
 * bot pilot (tools/bot/pilot.js) against the build that reaches 30:00 -
 * fast enough to tune with, where a full night (tools/botlab.js FINALE=1)
 * is the confirmation.
 *
 * The build is the median of tools/bot/boss-snapshots.json finaleBuilds
 * (478 bot nights still standing at 30:00): six weapons, four of them
 * evolved, 727 health, 14 armour. The finale sizes its health to the build
 * on its own (Config.finaleRefSingle), so how long it takes is the fight's
 * doing. Nothing heals: what is reported is what the fight TAKES, which is
 * what dodging decides.
 *
 * Per fight and pilot: did it win (or die, or run past LIMIT), how long,
 * health taken a minute as a share of the bar, how many blows took 15% or
 * more, and the three mechanics that took most.
 *
 *   node tools/finale-bench.js                         every fight, strong + human + sloppy
 *   ONLY=palewastes PILOTS=strong DIFF=professional HYPER=1 node tools/finale-bench.js
 *   SEEDS=3 ...                                        more fights per cell
 *
 * Pilots: strong (the default bot), human (it sees a telegraph 0.25s late
 * and reads bolts 10 degrees off: tools/bot/pilot.js react, misread), sloppy
 * (replan 0.2, noise 25: the night's sloppy player).
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { installPilot } = require('./bot/pilot.js');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const MAPS = env('ONLY', 'thornhollow,dustreach,mourneholt,ochre,palewastes,highmoor,boss_arena').split(',');
const PILOTS = {
  strong: {},
  human: { react: 0.25, misread: 10, replan: 0.15 },
  sloppy: { replan: 0.2, noise: 25 },
};
const USE = env('PILOTS', 'strong,human,sloppy').split(',');
const DIFF = env('DIFF', 'professional'), HYPER = env('HYPER', '0') === '1';
const SEEDS = +env('SEEDS', 2), LIMIT = +env('LIMIT', 600);
const CONFIG = JSON.parse(env('CONFIG', '{}'));
// The median finale build (tools/bot/boss-snapshots.json finaleBuilds).
const BUILD = JSON.parse(env('BUILD', JSON.stringify({
  weapons: { seeking_motes: '8E', knifestorm: '8E', rimeshard: '8E', reaving_arc: '8E', gale_chakram: 4, judgement_disc: 6 },
  maxHp: 727, armor: 14, level: 102,
})));

async function fight(browser, map, pilot, seed) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(GAME);
  await page.waitForFunction(() => window.WS && WS.Game && WS.Finale);
  const r = await page.evaluate(({ map, popts, seed, src, BUILD, DIFF, HYPER, LIMIT, CONFIG }) => {
    /* eslint-disable no-eval */
    const install = (0, eval)('(' + src + ')');
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay();
    WS.Save.db.seenManual = true; WS.Save.unlockAll(); WS.Save.settings.victoryCinematic = false;
    WS.Save.save = function () {}; WS.Save.flush = function () {};
    Object.assign(WS.Config, CONFIG);
    WS.Save.settings.difficulty = DIFF;
    WS.setSeed(seed);
    const G = WS.Game, F = WS.Finale, A = WS.Arena;
    G.startRun(map, 'mage');
    G.run.diffScale = WS.Config.difficulties[DIFF].scale;
    G.run.hyper = HYPER;
    if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
    G.state = 'playing'; G.running = true; G.leveling = false; G.pendingLevelUps = 0;
    WS.UI.closeOverlay();
    const p = G.player;
    const arena = !!G.run.map.arena;
    if (!arena) {
      p.weapons.length = 0; p.weaponLevels = {};
      for (const [id, rk] of Object.entries(BUILD.weapons)) {
        const w = WS.Player.addWeapon(p, id);
        if (!w) continue;
        const lv = parseInt(rk, 10);
        w.level = lv; p.weaponLevels[id] = lv; w.evolved = String(rk).endsWith('E');
      }
      p.maxHealth = BUILD.maxHp; p.armor = BUILD.armor;
      G.run.secondBlessing = true;
      G.run.time = WS.Config.deathTime - 0.5;
      for (let i = 0; i < 120; i++) { G.pendingLevelUps = 0; G.leveling = false; G.state = 'playing'; p.health = p.maxHealth; p.invulnerable = 1; G.update(1 / 60); }
      G.faceFinale();
    }
    const pilot = install(popts);
    WS.Input.poll = function () {};
    // Every blow, by what dealt it; no healing, so this is what it took.
    const by = {}; let big = 0, taken = 0;
    const orig = WS.Player.takeDamage;
    WS.Player.takeDamage = function (pl, amount, name) {
      const before = pl.health;
      const res = orig.apply(this, arguments);
      const lost = before - pl.health;
      if (lost > 0 && (arena ? A.active : F.stage === 'fight')) {
        const k = name || '?';
        by[k] = (by[k] || 0) + lost / pl.maxHealth * 100;
        taken += lost / pl.maxHealth * 100;
        if (lost >= pl.maxHealth * 0.15) big++;
      }
      return res;
    };
    WS.Player.heal = function () { return 0; };
    let fightT = 0, out = 'limit', healthy = p.maxHealth;
    for (let i = 0; i < 60 * (LIMIT + 120); i++) {
      if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
      G.pendingLevelUps = 0; G.leveling = false;
      if (G.state === 'levelup') G.state = 'playing';
      // The arena ends the run when Aethelgard falls: that end is a win.
      if (arena && !A.active && i > 300 && p.health > 0) { out = 'won'; break; }
      if (G.state === 'dying' || G.state === 'over' || p.health <= 0) { out = 'died'; break; }
      if (G.state !== 'playing') { WS.UI.closeOverlay(); G.state = 'playing'; }
      const fighting = arena ? A.active : F.stage === 'fight';
      if (!fighting && (F.stage === 'outro' || F.stage === 'done' || (arena && i > 300))) { out = 'won'; break; }
      // Full health into the fight; the breather tops it up anyway.
      if (!fighting) { p.health = p.maxHealth; healthy = p.maxHealth; }
      pilot.step(1 / 60);
      G.update(1 / 60);
      if (fighting) { fightT += 1 / 60; if (fightT > LIMIT) break; }
    }
    return { out, fightT: Math.round(fightT), taken: Math.round(taken), big, by, power: +(F.power || 1).toFixed(2) };
  }, { map, popts: PILOTS[pilot], seed, src: installPilot.toString(), BUILD, DIFF, HYPER, LIMIT, CONFIG });
  await page.close();
  if (errs.length) r.errs = errs.slice(0, 3);
  return r;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const jobs = [];
  for (const map of MAPS) for (const pilot of USE) for (let s = 0; s < SEEDS; s++) jobs.push([map, pilot, 11 + s * 101]);
  const results = {};
  const par = +env('PAR', 4);
  let next = 0;
  await Promise.all(Array.from({ length: par }, async () => {
    while (next < jobs.length) {
      const [map, pilot, seed] = jobs[next++];
      const r = await fight(browser, map, pilot, seed);
      (results[map + ' ' + pilot] = results[map + ' ' + pilot] || []).push(r);
    }
  }));
  await browser.close();
  console.log(`finale bench · ${DIFF}${HYPER ? ' + Hyper' : ''} · median build (${Object.keys(BUILD.weapons).length} weapons, ${BUILD.maxHp} hp, ${BUILD.armor} armour), no healing`);
  console.log('fight          pilot     won/n   fight s   taken %/min   15%+ hits   took most');
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  for (const map of MAPS) for (const pilot of USE) {
    const rs = results[map + ' ' + pilot] || [];
    const won = rs.filter((r) => r.out === 'won').length, died = rs.filter((r) => r.out === 'died').length;
    const per = rs.map((r) => r.taken / Math.max(1, r.fightT / 60));
    const by = {};
    for (const r of rs) for (const [k, v] of Object.entries(r.by)) by[k] = (by[k] || 0) + v / rs.length;
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round(v)}%`).join(', ');
    console.log(map.padEnd(15) + pilot.padEnd(9) + `${won}/${rs.length}${died ? ' (' + died + ' died)' : ''}`.padEnd(14)
      + String(med(rs.map((r) => r.fightT))).padStart(6) + String(Math.round(med(per))).padStart(12)
      + String(med(rs.map((r) => r.big))).padStart(12) + '   ' + top);
    for (const r of rs) if (r.errs) console.log('   errors: ' + r.errs.join(' | '));
  }
})();
