#!/usr/bin/env node
/* How hard does each finale hit someone who is actually playing it?
 *
 * check-finale measures a survivor standing still in the middle of
 * everything - that proves the mechanics land, and nothing else. This
 * drives the same fights with a bot that READS the telegraphs and steps out
 * of them, and it keeps a ledger of every hit by the name of what landed it.
 *
 * The bot is honest, not perfect: it replans ten times a second, sees only
 * what the renderer draws (marks, shells, hazards, bodies), and moves at the
 * survivor's real speed. What a skilled player takes lives somewhere between
 * the two columns, and that is what the tuning should be read against:
 *
 *   standing   what the fight WOULD do to someone ignoring it (should kill)
 *   dodging    what it does to someone playing well (should sting, not kill)
 *
 * The survivor is a plausible 30:00 body - REF_HP health and REF_ARMOR armour -
 * and immortal only so the fight can finish; the report says where a real one
 * would have fallen.
 *
 *   node tools/finale-dodge.js                    every map, both columns
 *   node tools/finale-dodge.js --only ochre
 *   node tools/finale-dodge.js --dodge-only
 *   node tools/finale-dodge.js --seeds 5         average over more fights (default 3)
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const MAPS = ['thornhollow', 'dustreach', 'mourneholt', 'ochre', 'palewastes'];
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const only = arg('--only');
const dodgeOnly = process.argv.includes('--dodge-only');
// The bot's path is chaotic - a step one frame later changes the whole fight -
// so one run is an anecdote. Several seeds, averaged, is a measurement.
const SEEDS = +(arg('--seeds') || 3);
const BUILD = ['seeking_motes', 'umbral_bolt', 'cinderfall', 'arcweb', 'hallowed_ring', 'knifestorm'];
// A committed 30:00 build, as the designer sees them at dawn: 840 health and
// armour from the upgrade, the lessons and a blessing (~35% off).
const REF_HP = 840, REF_ARMOR = 16;

/* Runs in the page. Scores nine moves (eight directions and standing still)
 * against everything dangerous and takes the cheapest. */
function installBot() {
  const F = WS.Finale;
  const bot = window.__bot = { dir: [0, 0], replan: 0 };
  const DIRS = [[0, 0]];
  for (let i = 0; i < 8; i++) DIRS.push([Math.round(Math.cos(i * Math.PI / 4)), Math.round(Math.sin(i * Math.PI / 4))]);

  function inLane(m, x, y, pad) {
    const dx = x - m.x, dy = y - m.y, c = Math.cos(m.ang), s = Math.sin(m.ang);
    const along = dx * c + dy * s, across = -dx * s + dy * c;
    return along >= -pad && along <= m.len + pad && Math.abs(across) <= m.w / 2 + pad;
  }
  function gapDist(m, ang) {
    let best = Infinity;
    const half = (m.gapWidth * Math.PI / 180) * 0.5;
    for (let i = 0; i < m.gapCount; i++) {
      const c = m.gapBase + m.gapRot + (i / m.gapCount) * Math.PI * 2;
      const d = Math.abs(((ang - c + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      best = Math.min(best, Math.max(0, d - half * 0.6));
    }
    return best;
  }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  }

  function cost(p, qx, qy, dir, speed) {
    const pr = p.radius;
    let c = 0;
    for (const m of F.marks) {
      if (m.kind === 'circle') {
        if (Math.hypot(qx - m.x, qy - m.y) < m.r + pr + 8) c += 1000 / (Math.max(0, m.tele) + 0.3);
      } else if (m.kind === 'lane') {
        if (inLane(m, qx, qy, pr + 10)) c += 900 / (Math.max(0, m.tele) + 0.3);
      } else if (m.kind === 'ring') {
        if (m.delay > 0.6) continue;
        const d = Math.hypot(qx - m.cx, qy - m.cy);
        const eta = (d - m.r) / m.speed - m.delay;
        if (eta > -0.15 && eta < 1.4) {
          const g = gapDist(m, Math.atan2(qy - m.cy, qx - m.cx) - m.spin * Math.max(0, eta));
          if (g > 0) c += (300 + g * 400) / (Math.max(0, eta) + 0.25);
        }
      } else if (m.kind === 'sweep') {
        const lead = m.tele > 0 ? 0 : m.spin * 0.25;
        for (let a = 0; a < m.arms; a++) {
          const probe = { x: m.cx, y: m.cy, ang: m.ang + lead + (a / m.arms) * Math.PI * 2, len: m.len, w: m.w };
          const probe2 = { ...probe, ang: m.ang + (a / m.arms) * Math.PI * 2 };
          if (inLane(probe, qx, qy, pr + 14) || inLane(probe2, qx, qy, pr + 8)) {
            c += m.tele > 0 ? 250 / (m.tele + 0.3) : 1200;
          }
        }
      } else if (m.kind === 'grid') {
        let inBad = false, near = Infinity;
        for (const cell of m.cells) {
          const inside = qx >= cell.x + 6 && qx <= cell.x + cell.w - 6 && qy >= cell.y + 6 && qy <= cell.y + cell.h - 6;
          if (cell.safe) near = Math.min(near, Math.hypot(qx - (cell.x + cell.w / 2), qy - (cell.y + cell.h / 2)));
          else if (qx >= cell.x && qx <= cell.x + cell.w && qy >= cell.y && qy <= cell.y + cell.h) inBad = true;
          if (cell.safe && inside) near = 0;
        }
        if (inBad || near > 0) c += 200 / (m.tele + 0.3) + near * 3;
      } else if (m.kind === 'safe') {
        let near = Infinity;
        for (const z of m.zones) near = Math.min(near, Math.hypot(qx - z.x, qy - z.y) - (z.r - pr - 10));
        if (near > 0) c += 400 + near * 4;
      } else if (m.kind === 'fence') {
        if (F.live(m.a) && F.live(m.b) && segDist(qx, qy, m.a.x, m.a.y, m.b.x, m.b.y) < 34 + pr) c += 800;
      }
    }
    // Shells in flight: walk the survivor and each bolt forward together.
    const hs = WS.Projectile.hostiles;
    for (let i = 0; i < hs.count; i++) {
      const h = hs.active[i];
      for (let t = 0.05; t <= 0.45; t += 0.05) {
        const bx = h.x + h.vx * t, by = h.y + h.vy * t;
        const px = p.x + dir[0] * speed * Math.min(t, 0.2), py = p.y + dir[1] * speed * Math.min(t, 0.2);
        if (Math.hypot(px - bx, py - by) < h.radius + pr + 8) { c += 500 / (t + 0.1); break; }
      }
    }
    const hz = WS.Hazard.pool;
    for (let i = 0; i < hz.count; i++) {
      const h = hz.active[i];
      if (Math.hypot(qx - h.x, qy - h.y) < h.radius + pr + 6) c += 350;
    }
    // Bodies: never touch one, and keep a little room from anything that dashes.
    const pool = WS.Enemy.pool;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.active[i];
      if (!e || e.hidden) continue;
      const d = Math.hypot(qx - e.x, qy - e.y) - e.radius - pr;
      if (d < 18) c += 600;
      else if (e.boss && d < 120) c += (120 - d) * 1.5;
      // A wound-up charge draws its lane; get out of it before it goes.
      const tg = e.telegraph;
      if (tg && tg.kind === 'lane' && (e.windup > 0 || e.chargeTimer > 0)) {
        const lane = { x: e.x, y: e.y, ang: Math.atan2(tg.dy, tg.dx), len: tg.length, w: tg.width };
        if (inLane(lane, qx, qy, pr + 12)) c += 900 / (Math.max(0, e.windup) + 0.3);
      }
    }
    // Walls, and a faint pull home so the bot does not hug a corner.
    const ab = WS.Game.arenaBounds || { minX: 0, maxX: 1280, minY: 0, maxY: 720 };
    const edge = Math.min(qx - ab.minX, ab.maxX - qx, qy - ab.minY, ab.maxY - qy);
    if (edge < 70) c += (70 - edge) * 4;
    c += Math.hypot(qx - (ab.minX + ab.maxX) / 2, qy - (ab.minY + ab.maxY) * 0.55) * 0.03;
    if (dir[0] === bot.dir[0] && dir[1] === bot.dir[1]) c -= 4;
    return c;
  }

  bot.step = function (dt) {
    const p = WS.Game.player;
    // Input.poll copies held -> keys every frame, so drive what it reads.
    const keys = WS.Input.held;
    bot.replan -= dt;
    if (bot.replan <= 0) {
      bot.replan = 0.1;
      let speed = p.moveSpeed * (p.slowTimer > 0 ? p.slowFactor : 1);
      let best = null, bestC = Infinity;
      for (const d of DIRS) {
        const n = Math.hypot(d[0], d[1]) || 1;
        const qx = p.x + (d[0] / n) * speed * 0.2, qy = p.y + (d[1] / n) * speed * 0.2;
        const mx = p.x + (d[0] / n) * speed * 0.1, my = p.y + (d[1] / n) * speed * 0.1;
        const c = cost(p, qx, qy, d, speed) * 0.7 + cost(p, mx, my, d, speed) * 0.3;
        if (c < bestC) { bestC = c; best = d; }
      }
      bot.dir = best;
    }
    keys.left = bot.dir[0] < 0; keys.right = bot.dir[0] > 0;
    keys.up = bot.dir[1] < 0; keys.down = bot.dir[1] > 0;
  };
}

async function runOne(page, map, dodge, seed) {
  await page.evaluate(({ map, build, dodge, refHp, refArmor, installSrc, seed }) => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.UI.closeOverlay();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Save.settings.victoryCinematic = false;
    WS.setSeed(seed);
    WS.Game.startRun(map, 'mage');
    WS.Game.chooseBlessing(WS.Game.blessingChoices[0]);
    WS.Game.state = 'playing'; WS.Game.running = true;
    WS.Game.leveling = false; WS.Game.pendingLevelUps = 0; WS.Game.settle = 0;
    WS.UI.closeOverlay();
    const p = WS.Game.player;
    p.weapons.length = 0; p.weaponLevels = {};
    for (const id of build) {
      WS.Player.addWeapon(p, id);
      const w = WS.Player.getWeapon(p, id);
      w.level = 8; p.weaponLevels[id] = 8; w.evolved = true;
    }
    p.damageMultiplier += 0.5; p.cooldownMultiplier *= 0.75; p.areaMultiplier += 0.3;
    p.projectileBonus += 1; p.critChance += 0.15;
    // The body is huge so nothing ends the fight; the ledger keeps the real pool.
    p.maxHealth = 1e7; p.health = 1e7; p.armor = refArmor;
    p.dodgeChance = 0; p.blockRank = 0; p.blockReady = false; p.revives = 0;
    WS.Game.run.secondBlessing = true;
    WS.Game.run.time = WS.Config.deathTime - 0.5;
    for (let i = 0; i < 120 && WS.Game.state === 'playing'; i++) WS.Game.update(1 / 60);

    // The ledger. Wraps the one door every hit comes through.
    const led = window.__led = { by: {}, total: 0, hits: 0, windows: [], fightStart: 0,
      end: 0, deaths: [], pool: refHp, cleared: false, dodge };
    if (!window.__wrapped) {
      window.__wrapped = true;
      const orig = WS.Player.takeDamage;
      WS.Player.takeDamage = function (pl, amount, name) {
        const before = pl.health;
        const r = orig.apply(this, arguments);
        const lost = before - pl.health;
        const L = window.__led;
        if (lost > 0 && L && WS.Finale.stage === 'fight') {
          let k = name || 'contact';
          // A body that hits you mid-charge is a different mistake from one
          // you walked into; say which.
          const pool = WS.Enemy.pool;
          for (let i = 0; i < pool.count; i++) {
            const e = pool.active[i];
            if (e && e.finale && e.template.name === name) {
              k += e.chargeTimer > 0 ? ' · charge' : e.windup > 0 ? ' · windup' : '';
              break;
            }
          }
          L.by[k] = L.by[k] || { dmg: 0, hits: 0 };
          L.by[k].dmg += lost; L.by[k].hits++;
          L.total += lost; L.hits++;
          L.windows.push([WS.Game.run.time, lost]);
          // A real survivor's pool, with no healing at all: where it runs out.
          L.pool -= lost;
          if (L.pool <= 0) { L.deaths.push(WS.Game.run.time - L.fightStart); L.pool = refHp; }
        }
        pl.health = pl.maxHealth;
        return r;
      };
    }
    if (dodge) { (0, eval)('(' + installSrc + ')')(); }
    WS.Game.faceFinale();
  }, { map, build: BUILD, dodge, refHp: REF_HP, refArmor: REF_ARMOR, installSrc: installBot.toString(), seed });

  for (let slice = 0; slice < 500; slice++) {
    const st = await page.evaluate((dodge) => {
      const G = WS.Game, F = WS.Finale, L = window.__led;
      for (let i = 0; i < 240; i++) {
        if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
        if (G.state === 'levelup') G.chooseLevelUp(G.levelChoices[0]);
        if (G.state !== 'playing') break;
        if (dodge && F.stage === 'fight') window.__bot.step(1 / 60);
        else { const k = WS.Input.held; k.left = k.right = k.up = k.down = false; }
        G.update(1 / 60);
        if (F.stage === 'fight' && !L.fightStart) L.fightStart = G.run.time;
        if (F.stage === 'outro' && !L.end) L.end = G.run.time;
      }
      return { done: !!G.run.finaleCleared || G.state === 'over' || G.state === 'dying',
        fight: L.fightStart ? G.run.time - L.fightStart : 0 };
    }, dodge);
    if (st.done || st.fight > 600) break;
  }

  return page.evaluate(() => {
    const L = window.__led;
    const k = WS.Input.held; k.left = k.right = k.up = k.down = false;
    const fight = (L.end || WS.Game.run.time) - L.fightStart;
    // Worst ten seconds: the spike a health bar has to survive.
    let worst = 0;
    for (let i = 0; i < L.windows.length; i++) {
      let s = 0;
      for (let j = i; j < L.windows.length && L.windows[j][0] - L.windows[i][0] < 10; j++) s += L.windows[j][1];
      worst = Math.max(worst, s);
    }
    return { fight, total: L.total, hits: L.hits, by: L.by, worst, deaths: L.deaths,
      cleared: !!WS.Game.run.finaleCleared };
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const summary = [];
  for (const map of MAPS) {
    if (only && map !== only) continue;
    console.log(`\n${map}`);
    for (const dodge of dodgeOnly ? [true] : [false, true]) {
      const runs = [];
      for (let k = 0; k < SEEDS; k++) {
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', (e) => errs.push(e.message));
        await page.goto(GAME);
        await page.waitForFunction(() => window.WS && WS.Game && WS.Finale);
        await page.waitForTimeout(300);
        runs.push(await runOne(page, map, dodge, 4242 + k * 101));
        if (errs.length) console.log(`  ${map} page errors: ${errs.slice(0, 3).join(' | ')}`);
        await page.close();
      }
      const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
      const fight = mean((r) => r.fight);
      const dpm = mean((r) => r.total / (r.fight / 60));
      const worst = mean((r) => r.worst);
      const col = dodge ? 'dodge' : 'stand';
      console.log(`  ${col.padEnd(6)} fight ${fight.toFixed(0)}s  ${Math.round(dpm)}/min`
        + ` (runs: ${runs.map((r) => Math.round(r.total / (r.fight / 60))).join(', ')})`
        + `  worst 10s ${Math.round(worst)} (max ${Math.round(Math.max(...runs.map((r) => r.worst)))})`
        + `  ${REF_HP}hp bodies: ${mean((r) => r.deaths.length).toFixed(1)}`);
      const by = {};
      for (const r of runs) {
        for (const [n, v] of Object.entries(r.by)) {
          by[n] = by[n] || { dmg: 0, hits: 0 };
          by[n].dmg += v.dmg / runs.length; by[n].hits += v.hits / runs.length;
        }
      }
      const top = Object.entries(by).sort((a, b) => b[1].dmg - a[1].dmg).slice(0, 7);
      for (const [name, v] of top) {
        const each = v.hits ? v.dmg / v.hits : 0;
        console.log(`           ${name.padEnd(38)} ${String(Math.round(v.dmg)).padStart(6)}  x${v.hits.toFixed(1).padEnd(5)}`
          + ` ${String(Math.round(each)).padStart(4)} a hit (${Math.round(each / REF_HP * 100)}% of the bar)`);
      }
      if (dodge) summary.push([map, dpm, worst]);
    }
  }
  if (summary.length > 1) {
    console.log('\nwhat a survivor playing well takes, by map (the arc should climb)');
    for (const [map, dpm, worst] of summary) {
      console.log(`  ${map.padEnd(12)} ${String(Math.round(dpm)).padStart(4)}/min   worst 10s ${Math.round(worst)}`);
    }
  }
  await browser.close();
})();
