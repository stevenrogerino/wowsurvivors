#!/usr/bin/env node
/* Is every finale fight possible?
 *
 * The finales are allowed to be stressful - two or three mechanics at once
 * is what they are - and are not allowed to be impossible. This plays each
 * one (all six, and the Eclipse Arena) from first light to the kill, twice
 * (two seeds, two directions), with a survivor who cannot die and keeps
 * moving (a slow loop round the field,
 * so the fight's aim follows a moving target as it would a player's), and
 * holds every shape to its contract on every frame:
 *
 *   TELL      no circle or lane gives less than MIN_TELE to leave it.
 *   OPENINGS  every ring's opening, when it is placed, is within 90 degrees
 *             of the survivor's bearing and on the field; and as it travels
 *             no other shape lands on it as it arrives (Finale.threatAt).
 *   CUTTERS   no two beams from one source turn opposite ways at once.
 *   SQUARES   every grid of safe squares has one the survivor can reach in
 *             its telegraph (at Config.ringWalk of their speed, after
 *             Config.ringReact), and no shape lands on that one with it.
 *   EYES      every "safe ground in a field of doom" has a zone they can
 *             reach in time.
 *
 * It also reports, per fight, how much of it had two or more threats live
 * at once - the pressure the owner asked for, measured.
 *
 *   node tools/check-finale-fair.js [--only palewastes]
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const MAPS = ['thornhollow', 'dustreach', 'mourneholt', 'ochre', 'palewastes', 'highmoor', 'boss_arena'];
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const BUILD = ['seeking_motes', 'umbral_bolt', 'cinderfall', 'arcweb', 'hallowed_ring', 'knifestorm'];
const MIN_TELE = 0.6;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const fails = [];
  for (const [seed, loop] of [[77, 0.35], [91, -0.55]]) for (const map of MAPS) {
    if (only && map !== only) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(GAME);
    await page.waitForFunction(() => window.WS && WS.Game && WS.Finale);
    const r = await page.evaluate(({ map, build, MIN_TELE, DEBUG, seed, loop }) => {
      const out = { fails: [], made: 0, rings: 0, grids: 0, safes: 0, pressure: 0, frames: 0, fightT: 0, won: false };
      if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
      WS.UI.closeOverlay();
      WS.Save.db.seenManual = true; WS.Save.unlockAll(); WS.Save.settings.victoryCinematic = false;
      WS.Save.save = function () {};
      WS.setSeed(seed);
      const G = WS.Game, F = WS.Finale, A = WS.Arena, cfg = WS.Config;
      G.startRun(map, 'mage');
      if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
      G.state = 'playing'; G.running = true; G.leveling = false; G.pendingLevelUps = 0; G.settle = 0;
      WS.UI.closeOverlay();
      const p = G.player;
      const arena = !!G.run.map.arena;
      if (!arena) {   // the arena hands out its own kit
        p.weapons.length = 0; p.weaponLevels = {};
        for (const id of build) {
          WS.Player.addWeapon(p, id);
          const w = WS.Player.getWeapon(p, id); w.level = 8; p.weaponLevels[id] = 8; w.evolved = true;
        }
        // Enough to see every phase in a few minutes, not so much that it skips them.
        p.damageMultiplier *= 4;
      }
      if (!arena) {
        G.run.secondBlessing = true;
        G.run.time = cfg.deathTime - 0.5;
        for (let i = 0; i < 120; i++) { G.pendingLevelUps = 0; G.leveling = false; G.state = 'playing'; G.update(1 / 60); }
        G.faceFinale();
      }
      const reach = (tele) => p.moveSpeed * cfg.ringWalk * Math.max(0, tele - cfg.ringReact);
      const seen = new WeakSet();
      const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
      let t = 0;
      const shapeName = (m) => m.name || m.shape || m.kind;
      const fail = (s) => { if (out.fails.length < 12 && !out.fails.includes(s)) out.fails.push(s); };
      for (let i = 0; i < 60 * 900; i++) {
        if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
        if (G.state === 'levelup') G.chooseLevelUp(G.levelChoices[0]);
        // The build is the build: no level-up screens in the middle of a fight.
        G.pendingLevelUps = 0; G.leveling = false;
        if (G.state === 'levelup') G.state = 'playing';
        if (G.state !== 'playing') break;
        p.health = p.maxHealth;
        p.invulnerable = 1e9;
        // A slow loop round the field: always moving, never fleeing.
        t += 1 / 60;
        const b = G.arenaBounds || { minX: 0, maxX: W, minY: 0, maxY: H };
        const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
        const tx = cx + Math.cos(t * loop) * (b.maxX - b.minX) * 0.3, ty = cy + Math.sin(t * loop) * (b.maxY - b.minY) * 0.3;
        const [dx, dy, dd] = WS.normalize(tx - p.x, ty - p.y);
        const k = WS.Input.keys; k.left = dx < -0.3 && dd > 8; k.right = dx > 0.3 && dd > 8; k.up = dy < -0.3 && dd > 8; k.down = dy > 0.3 && dd > 8;
        WS.Input.held = Object.assign(WS.Input.held || {}, k);
        G.update(1 / 60);
        const fighting = arena ? A.active : F.stage === 'fight';
        if (!fighting) { if (F.stage === 'outro' || F.stage === 'done' || (arena && !A.active && t > 5)) { out.won = true; break; } continue; }
        out.fightT += 1 / 60; out.frames++;
        const list = arena ? A.hazards : F.marks;
        let live = 0;
        const now = G.run.time;
        for (const m of list) {
          const kind = m.kind || m.shape;
          if (!seen.has(m)) {
            seen.add(m); out.made++; m._born = now;
            if ((kind === 'circle' || kind === 'lane') && m.maxTele < MIN_TELE - 1e-6) fail(`${shapeName(m)}: a ${kind} with ${m.maxTele.toFixed(2)}s to leave it`);
            if (kind === 'square' && !m.safe && m.telegraph < MIN_TELE - 1e-6) fail(`a spear with ${m.telegraph.toFixed(2)}s`);
            if (kind === 'ring' && m.aim) {
              out.rings++;
              if (DEBUG) { const b0 = F.threatAt(m.aim.x, m.aim.y, m.aim.at - now, 4, m); if (b0) {
                const d0 = WS.dist(p.x, p.y, m.cx, m.cy), a0 = Math.atan2(p.y - m.cy, p.x - m.cx), arr = m.aim.at - now;
                const why = []; for (let k = -12; k <= 12; k++) { const x = m.cx + Math.cos(a0 + k * Math.PI / 24) * d0, y = m.cy + Math.sin(a0 + k * Math.PI / 24) * d0; const q = F.threatAt(x, y, arr, 4, m); why.push(q ? (q.name || q.kind || '?').slice(0, 5) : '.'); }
                fail(`${shapeName(m)}: covered AT BIRTH by ${b0.name || b0.kind || b0.shape} stuck ${m.aim.stuck} chained ${m.chained} d ${Math.round(d0)} arr ${arr.toFixed(2)} p ${Math.round(p.x)},${Math.round(p.y)} [${why.join(' ')}] marks ${F.marks.map((q) => q.kind + (q.kind === 'sweep' ? q.arms + '/' + q.dur.toFixed(1) : '')).join(',')}`); } }
              const at = Math.atan2(p.y - m.cy, p.x - m.cx), ai = Math.atan2(m.aim.y - m.cy, m.aim.x - m.cx);
              const off = Math.abs(((ai - at + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
              // The first of a pair is aimed at the survivor; the second from the first's opening.
              // (Standing inside where it starts, it never reaches them.)
              const inside = WS.dist(p.x, p.y, m.cx, m.cy) <= m.r + m.thick;
              if (off > Math.PI / 2 + 0.05 && !m.chained && !inside) fail(`${shapeName(m)}: opening ${Math.round(off * 180 / Math.PI)} degrees round`
                + (DEBUG ? ` d ${Math.round(WS.dist(p.x, p.y, m.cx, m.cy))} r ${Math.round(m.r)} delay ${m.delay.toFixed(2)} aimd ${Math.round(WS.dist(m.aim.x, m.aim.y, m.cx, m.cy))}` : ''));
              if (m.aim.x < b.minX || m.aim.x > b.maxX || m.aim.y < b.minY || m.aim.y > b.maxY) fail(`${shapeName(m)}: opening off the field`);
            }
            if (kind === 'grid') {
              out.grids++;
              const gap = (c) => Math.hypot(Math.max(c.x - p.x, 0, p.x - (c.x + c.w)), Math.max(c.y - p.y, 0, p.y - (c.y + c.h)));
              const ok = m.cells.filter((c) => c.safe && gap(c) <= reach(m.maxTele) + 1
                && !F.threatAt(c.x + c.w / 2, c.y + c.h / 2, m.maxTele, 4, m));
              if (!ok.length) fail(`${shapeName(m)}: no safe square within reach`);
            }
            if (kind === 'safe') {
              out.safes++;
              if (!m.zones.some((z) => Math.max(0, WS.dist(p.x, p.y, z.x, z.y) - z.r + p.radius) <= reach(m.maxTele) + 1)) fail(`${shapeName(m)}: no safe zone within reach`);
            }
          }
          if (kind === 'ring' && !m.hit && m.aim && !m._sealed && m.aim.at !== undefined) {
            const left = m.aim.at - now;
            // Judged in the last 0.4s, when where everything will be is known.
            const by = left > 0.03 && left < 0.4 && F.threatAt(m.aim.x, m.aim.y, left, 4, m);
            if (by) {
              m._sealed = true;
              fail(`${shapeName(m)}: its opening covered as it arrives, by ${by.name || by.kind || by.shape || 'a storm strike'} (${by.kind || by.shape || 'strike'}`
                + (DEBUG ? ` ring born ${m._born.toFixed(2)} aim.at ${m.aim.at.toFixed(2)} stuck ${m.aim.stuck} delay ${m.delay.toFixed(2)} it born ${by._born !== undefined ? by._born.toFixed(2) : '?'} tele ${by.maxTele !== undefined ? by.maxTele : by.telegraph} now ${now.toFixed(2)}` : '') + ')');
            }
          }
          if ((kind === 'circle' || kind === 'lane') && m.tele > 0) live++;
          else if (kind === 'ring' && !m.hit && !(m.delay > 0)) live++;
          else if ((kind === 'sweep' && m.tele <= 0) || (kind === 'cutter' && m.telegraph <= 0)) live++;
          else if (kind === 'grid' || kind === 'safe' || (kind === 'square' && !m.safe && m.telegraph > 0)) live++;
        }
        // Cutters from one source, turning opposite ways, at the same time.
        const cut = list.filter((m) => (m.kind === 'sweep' && m.dur > 0) || m.shape === 'cutter');
        for (let a = 0; a < cut.length; a++) for (let c = a + 1; c < cut.length; c++) {
          const x = cut[a], y = cut[c];
          const same = x.shape === 'cutter' || (x.follow ? x.follow === y.follow : x.cx === y.cx && x.cy === y.cy);
          if (same && Math.sign(x.spin) !== Math.sign(y.spin) && x.spin && y.spin) fail(`${shapeName(x)}: two cutters turning opposite ways at once`);
        }
        if (live >= 2) out.pressure++;
      }
      out.fightT = Math.round(out.fightT);
      out.pressure = Math.round(out.pressure / Math.max(1, out.frames) * 100);
      return out;
    }, { map, build: BUILD, MIN_TELE, DEBUG: !!process.env.DEBUG, seed, loop });
    for (const e of errs) r.fails.push('page error: ' + e);
    console.log(`  ${String(seed).padEnd(3)} ${map.padEnd(12)} fight ${String(r.fightT).padStart(4)}s  ${r.won ? 'won ' : 'OPEN'}  shapes ${String(r.made).padStart(4)}  rings ${String(r.rings).padStart(3)}  grids ${r.grids}  safe-zones ${r.safes}  two+ at once ${r.pressure}% of the fight`);
    for (const f of r.fails) fails.push(`${map} (seed ${seed}): ${f}`);
    await page.close();
  }
  await browser.close();
  if (fails.length) { for (const f of fails) console.log('FAIL ' + f); process.exit(1); }
  console.log('ok: every finale stressful where it means to be and possible everywhere');
})();
