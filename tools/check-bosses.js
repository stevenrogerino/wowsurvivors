#!/usr/bin/env node
/* Are the bosses' telegraphs fair?
 *
 * The scheduled bosses throw the finale's shapes (src/game/bossfight.js),
 * and a shape is a contract: it appears, it says how long you have, it does
 * what it drew. This holds every boss to it, and the ring openings to theirs.
 *
 *   KIT     Every scheduled boss is put on the field at its own hour, both
 *           phases, with the survivor standing still and unhurt: each
 *           pattern runs without an error, every circle and lane it draws
 *           gives at least Config.bossMinTele to leave it, every ring has an
 *           opening, the second phase comes at Config.bossEnrageAt, and
 *           nothing it summons lands on top of the survivor, and no
 *           ring's opening is covered by another shape landing with it
 *           (shapes may overlap; they may not overlap into the impossible).
 *
 *   RINGS   Finale.aimGap, fuzzed: 4000 rings from random centres at
 *           survivors anywhere on the field, corners and edges included,
 *           with and without spin, delay and a ring before them. The
 *           opening it aims at must be within 90 degrees of the survivor's
 *           bearing, on the field, and reachable at Config.ringWalk of
 *           their speed in the time left after Config.ringReact - which is
 *           exactly the promise "sometimes it is literally impossible" said
 *           was being broken.
 *
 *   SWEEPS  Two cutters from one source never turn opposite ways at once.
 *
 *   node tools/check-bosses.js
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(GAME);
  await page.waitForFunction(() => window.WS && WS.Game && WS.BossFight);
  const out = await page.evaluate(() => {
    const fails = [], notes = [];
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.save = function () {};
    const cfg = WS.Config, F = WS.Finale;
    const when = {};
    for (const [mid, m] of Object.entries(WS.Maps)) for (const b of m.bosses || []) if (!(b.id in when)) when[b.id] = [mid, b.at];
    /* ---------------------------------------------------------- KIT --- */
    for (const [id, [mapId, at]] of Object.entries(when)) {
      WS.setSeed(7);
      WS.Game.startRun(mapId, WS.CharacterOrder[0]);
      if (WS.Game.state === 'blessing') WS.Game.chooseBlessing((WS.Game.blessingChoices || [])[0]);
      WS.Game.state = 'playing';
      const run = WS.Game.run, p = WS.Game.player;
      run.time = at; WS.WaveManager.bossIndex = 99;
      WS.Enemy.clear(); F.marks.length = 0;
      p.x = 640; p.y = 360; p.invulnerable = 1e9;
      const e = WS.WaveManager.spawnBoss(id, WS.WaveManager.bossScale(at), false);
      if (!e) { fails.push(`${id}: did not spawn`); continue; }
      const made = [];
      const own = F.own;
      F.own = function (o, m) { made.push(m); return own.call(this, o, m); };
      const sp = WS.Enemy.spawn;
      let onTop = 0, casting = false;
      const ba = WS.Enemy.bossAttack;
      WS.Enemy.bossAttack = function () { casting = true; try { return ba.apply(this, arguments); } finally { casting = false; } };
      WS.Enemy.spawn = function (sid, x, y) {
        const q = sp.apply(this, arguments);
        if (casting && q && !q.boss && Math.hypot(x - p.x, y - p.y) < cfg.bossSummonClear - 1) onTop++;
        return q;
      };
      let enragedAt = null, overlaps = 0;
      try {
        for (const half of [1, 2]) {
          if (half === 2) {
            e.health = e.maxHealth * (cfg.bossEnrageAt - 0.01);
          }
          for (let i = 0; i < 60 * 30; i++) {
            if (half === 1) e.health = e.maxHealth;   // phase one stays phase one
            p.invulnerable = 1e9; p.health = p.maxHealth;
            const G = WS.Game;
            if (G.state === 'blessing') G.chooseBlessing((G.blessingChoices || [])[0]);
            if (G.state === 'levelup') G.chooseLevelUp((G.levelChoices || [])[0]);
            G.pendingLevelUps = 0; G.leveling = false; G.state = 'playing';
            G.update(1 / 60);
            // Shapes may overlap; an opening still to come may not be covered.
            for (const m of F.marks) {
              if (m.kind !== 'ring' || m.hit || !m.aim || m._sealed) continue;
              const left = m.aim.at - WS.Game.run.time;
              if (left > 0.05 && F.threatAt(m.aim.x, m.aim.y, left, 4, m)) { m._sealed = true; overlaps++; }
            }
            if (e._dead) break;
            if (e.enraged && enragedAt === null) enragedAt = e.health / e.maxHealth;
            // keep it from simply walking onto the survivor and sitting there
            if (Math.hypot(e.x - p.x, e.y - p.y) < 150) { e.x = 640 + 260; e.y = 360; }
            WS.Enemy.pool.active.forEach((q) => { if (!q.boss) q.health = 0; });
          }
        }
      } catch (err) {
        fails.push(`${id}: threw ${err.message}`);
      }
      F.own = own; WS.Enemy.spawn = sp; WS.Enemy.bossAttack = ba;
      const types = new Set(made.map((m) => m.kind));
      const want = new Set(e.template.patterns.map((q) => ({ slam: 'circle', barrage: 'circle', nova: 'ring', cross: 'lane' })[q.type]).filter(Boolean));
      for (const k of want) if (!types.has(k)) fails.push(`${id}: never drew a ${k}`);
      for (const m of made) {
        if ((m.kind === 'circle' || m.kind === 'lane') && m.maxTele < cfg.bossMinTele - 1e-6) fails.push(`${id}: a ${m.kind} with ${m.maxTele.toFixed(2)}s to leave it`);
        if (m.kind === 'ring' && !(m.gapCount >= 1 && m.gapWidth > 0)) fails.push(`${id}: a ring with no opening`);
        if (!(m.dmg > 0)) fails.push(`${id}: a ${m.kind} that does nothing`);
        if (m.dmg > p.maxHealth * cfg.bossHitCap + 1) fails.push(`${id}: a ${m.kind} for ${Math.round(m.dmg)} of ${p.maxHealth}`);
      }
      if (enragedAt === null) fails.push(`${id}: never reached its second phase`);
      else if (enragedAt > cfg.bossEnrageAt + 0.001) fails.push(`${id}: second phase at ${Math.round(enragedAt * 100)}%`);
      if (overlaps) fails.push(`${id}: ${overlaps} ring openings covered by another shape landing with them`);
      if (onTop) fails.push(`${id}: ${onTop} summons landed on the survivor`);
      notes.push(`${id.padEnd(15)} ${String(made.length).padStart(3)} shapes  ${[...types].join(',')}`);
    }
    /* -------------------------------------------------------- RINGS --- */
    {
      WS.setSeed(11);
      WS.Game.startRun('thornhollow', WS.CharacterOrder[0]);
      const p = WS.Game.player;
      let bad = 0, worst = '';
      const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
      for (let n = 0; n < 4000; n++) {
        const edge = n % 3 === 0;
        p.x = edge ? (Math.random() < 0.5 ? 30 + Math.random() * 60 : W - 30 - Math.random() * 60) : 40 + Math.random() * (W - 80);
        p.y = edge ? 30 + Math.random() * (H - 60) : 40 + Math.random() * (H - 80);
        const m = { cx: 100 + Math.random() * (W - 200), cy: 100 + Math.random() * (H - 200), r: 30,
          speed: 160 + Math.random() * 80, gapWidth: 30 + Math.random() * 30, gapCount: 1 + Math.floor(Math.random() * 3),
          spin: Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 1.2, delay: Math.random() < 0.5 ? 0 : Math.random() * 1.4 };
        const prev = Math.random() < 0.3 ? { x: p.x + (Math.random() - 0.5) * 120, y: p.y + (Math.random() - 0.5) * 120, t: Math.random() * 0.8 } : null;
        if (prev && (prev.x < 40 || prev.x > W - 40 || prev.y < 40 || prev.y > H - 40)) continue;
        if (prev) m.delay = Math.max(m.delay, prev.t + 0.9);
        const from = prev || { x: p.x, y: p.y, t: 0 };
        const d = Math.hypot(from.x - m.cx, from.y - m.cy);
        if (d < m.r + 40) continue;
        m.gapBase = F.aimGap(m, p, prev);
        const travel = (d - m.r) / m.speed;
        const arrive = m.delay + travel;
        const gapAt = m.gapBase + m.spin * travel;          // where the opening is when the band arrives
        const bearing = Math.atan2(from.y - m.cy, from.x - m.cx);
        const off = Math.abs(((gapAt - bearing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const ax = m.cx + Math.cos(gapAt) * d, ay = m.cy + Math.sin(gapAt) * d;
        const walk = Math.max(0, Math.hypot(ax - from.x, ay - from.y) - (m.gapWidth * Math.PI / 180) * 0.5 * d * 0.6);
        const can = p.moveSpeed * cfg.ringWalk * Math.max(0, arrive - from.t - cfg.ringReact);
        const onField = off < 1e-6 || (ax > 0 && ax < W && ay > 0 && ay < H);
        let why = '';
        if (off > Math.PI / 2 + 1e-6) why = `opening ${Math.round(off * 180 / Math.PI)} degrees round`;
        else if (walk > can + 1) why = `opening ${Math.round(walk)}px away with ${Math.round(can)}px of walking`;
        else if (!onField) why = `opening off the field at ${Math.round(ax)},${Math.round(ay)}`;
        if (why) { bad++; worst = worst || why; }
      }
      if (bad) fails.push(`rings: ${bad} of 4000 unreachable, e.g. ${worst}`);
      else notes.push('rings: 4000 aimed, every opening within 90 degrees, on the field and reachable');
    }
    /* ------------------------------------------------------ SQUARES --- */
    {
      // A 5x4 grid, the Pale Lord's: one safe square always within reach,
      // and on average a walk away rather than the square next door.
      const b = { minX: 200, maxX: 1080, minY: 96, maxY: 650 };
      const p = WS.Game.player, tele = 1.35;
      const reach = p.moveSpeed * cfg.ringWalk * (tele - cfg.ringReact);
      let far = 0, n = 0, out = 0;
      for (let k = 0; k < 600; k++) {
        p.x = b.minX + 20 + Math.random() * (b.maxX - b.minX - 40); p.y = b.minY + 20 + Math.random() * (b.maxY - b.minY - 40);
        F.marks.length = 0;
        F.grid(b, 5, 4, 4, tele, 10, 'test', {});
        const cells = F.marks[0].cells;
        const gap = (c) => Math.hypot(Math.max(c.x - p.x, 0, p.x - (c.x + c.w)), Math.max(c.y - p.y, 0, p.y - (c.y + c.h)));
        const best = Math.min(...cells.filter((c) => c.safe).map(gap));
        if (best > reach + 1) out++;
        const reachable = cells.filter((c) => c.safe).map(gap).filter((g) => g <= reach);
        n++; if (Math.max(...reachable) >= reach / 3) far++;
      }
      F.marks.length = 0;
      if (out) fails.push(`squares: ${out} of 600 grids had no safe square within ${Math.round(reach)}px`);
      else if (far < n * 0.8) fails.push(`squares: the guaranteed square was a walk away in only ${far} of ${n}`);
      else notes.push(`squares: 600 grids, a safe square always within ${Math.round(reach)}px, a walk away in ${far}`);
    }
    /* ------------------------------------------------------- SWEEPS --- */
    {
      F.marks.length = 0;
      const host = { x: 640, y: 300 };
      F.sweep(640, 300, 0, 0.5, 900, 30, 1, 8, 10, 'a', { follow: host, arms: 4, raw: true });
      F.sweep(640, 300, 1, -0.5, 900, 30, 1, 8, 10, 'b', { follow: host, arms: 4, raw: true });
      const [a, b] = F.marks;
      if (Math.sign(a.spin) !== Math.sign(b.spin)) fails.push('sweeps: two cutters from one source turn opposite ways');
      F.marks.length = 0;
    }
    return { fails, notes };
  });
  for (const n of out.notes) console.log('  ' + n);
  for (const e of errs) out.fails.push('page error: ' + e);
  await browser.close();
  if (out.fails.length) {
    for (const f of out.fails) console.log('FAIL ' + f);
    process.exit(1);
  }
  console.log('ok: every boss telegraph fair, every ring opening reachable');
})();
