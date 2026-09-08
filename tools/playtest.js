#!/usr/bin/env node
/* Headless play-test harness. Boots the game in Chromium, drives a kiting bot
 * through a full 30-minute run, then every battlefield, every survivor and the
 * Eclipse Arena, reporting milestones and any console or page error.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/playtest.js
 *
 * Survivability is propped up so the test always reaches the late game; this
 * checks that the simulation holds together, not that the balance is fair.
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const CHROME = process.env.CHROME || undefined;
const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOTS = process.env.OUT || null;

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack || '').split('\n')[1]));
  await page.goto(GAME);
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    WS.Save.unlockAll();
    window.__run = function (map, char, seconds, tough) {
      WS.Game.startRun(map, char);
      const first = document.querySelector('#overlay:not(.hidden) .card');
      if (first) first.click();
      const p = WS.Game.player;
      if (tough) { p.maxHealth = 100000; p.health = 100000; p.armor = 60; }
      const step = WS.CONST.TICK_RATE;
      const K = WS.Input.keys;
      const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
      const events = [];
      let ticks = 0;
      const t0 = performance.now();
      while (WS.Game.run && WS.Game.run.time < seconds && ticks < seconds * 61) {
        ticks++;
        if (WS.Game.state === 'levelup' || WS.Game.state === 'blessing') {
          const rank = { union: 0, evolve: 1, weapon_rank: 2, stat: 3, new_weapon: 2, breaking_point: 5, bread: 6, blessing: 0 };
          const choices = WS.Game.levelChoices || [];
          let best = 0;
          for (let i = 1; i < choices.length; i++) {
            if ((rank[choices[i].type] ?? 9) < (rank[choices[best].type] ?? 9)) best = i;
          }
          const cards = document.querySelectorAll('#overlay:not(.hidden) .card');
          if (cards[best]) { cards[best].click(); continue; }
          if (cards[0]) { cards[0].click(); continue; }
        }
        if (WS.Game.state === 'over') break;
        if (WS.Game.state !== 'playing') break;
        const pl = WS.Game.player;
        const t = WS.Game.run.time;
        let tx = W / 2 + Math.cos(t * 0.5) * 240, ty = H / 2 + Math.sin(t * 0.5) * 170;
        const near = WS.Enemy.findNearest(pl.x, pl.y, 160);
        if (near) { const dx = pl.x - near.x, dy = pl.y - near.y, d = Math.hypot(dx, dy) || 1; tx = pl.x + dx / d * 250; ty = pl.y + dy / d * 250; }
        const bnd = WS.Game.arenaBounds;
        const lo = bnd || { minX: 60, maxX: W - 60, minY: 60, maxY: H - 60 };
        tx = Math.max(lo.minX + 20, Math.min(lo.maxX - 20, tx));
        ty = Math.max(lo.minY + 20, Math.min(lo.maxY - 20, ty));
        K.left = tx - pl.x < -6; K.right = tx - pl.x > 6; K.up = ty - pl.y < -6; K.down = ty - pl.y > 6;
        if (tough) { pl.health = pl.maxHealth; }
        WS.Game.tick(step);
      }
      const ms = performance.now() - t0;
      const r = WS.Game.run;
      return {
        map, char,
        end: r ? Math.round(r.time) : -1,
        state: WS.Game.state,
        level: WS.Game.player ? WS.Game.player.level : -1,
        kills: r ? r.kills : -1,
        bosses: r ? r.bossesSlain : -1,
        gold: r ? r.gold : -1,
        victorious: r ? r.victorious : false,
        weapons: WS.Game.player ? WS.Game.player.weapons.map((w) => w.id + ':' + w.level + (w.evolved ? 'E' : '')).join(' ') : '',
        passives: WS.Game.player ? Object.keys(WS.Game.player.upgradeLevels).length : 0,
        combos: WS.Game.player ? Object.keys(WS.Game.player.combosActive).length : 0,
        dmg: r ? Math.round(r.damageDone) : -1,
        simMsPerSimSecond: +(ms / Math.max(1, r ? r.time : 1)).toFixed(2),
      };
    };
  });

  // 1. A full 30-minute run to Victory on the starting map.
  console.log('=== full run to victory ===');
  console.log(JSON.stringify(await page.evaluate(() => window.__run('thornhollow', 'mage', 1815, true))));
  await page.waitForTimeout(150);
  if (SHOTS) await page.screenshot({ path: SHOTS + '/victory.png' });

  // 2. Every map, 11 minutes each - hits two bosses and a swarm event.
  console.log('=== maps ===');
  for (const m of ['dustreach', 'mourneholt', 'ochre', 'palewastes']) {
    console.log(JSON.stringify(await page.evaluate((m) => window.__run(m, 'shaman', 660, true), m)));
  }

  // 3. Every survivor, 4 minutes each - exercises every starting weapon.
  console.log('=== roster ===');
  for (const c of ['mage', 'priest', 'rogue', 'hunter', 'warrior', 'warlock', 'shaman', 'paladin', 'graveblade', 'ruinseeker']) {
    const r = await page.evaluate((c) => window.__run('thornhollow', c, 240, true), c);
    console.log(`${c.padEnd(14)} lv${r.level} kills=${r.kills} dmg=${r.dmg} | ${r.weapons}`);
  }

  // 4. The Eclipse Arena.
  console.log('=== arena ===');
  console.log(JSON.stringify(await page.evaluate(() => window.__run('boss_arena', 'paladin', 420, true))));
  await page.waitForTimeout(150);
  if (SHOTS) await page.screenshot({ path: SHOTS + '/arena.png' });

  console.log(errors.length ? '--- ERRORS (' + errors.length + ') ---' : '--- no errors ---');
  for (const e of errors.slice(0, 20)) console.log(e);
  await b.close();
  process.exitCode = errors.length ? 1 : 0;
})();
