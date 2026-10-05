#!/usr/bin/env node
/* The bot lab: real runs played by tools/bot/pilot.js and drafted by
 * tools/bot/draft.js, with a ledger of everything that hurt.
 *
 * Two modes:
 *
 *   full    A real run from 0:00: the real wave director, real level-ups
 *           (drafted), real pickups, real bosses, to dawn - and into the
 *           finale with FINALE=1. Scored by how long it lasted and whether
 *           it won. This is the measurement closest to a player's night.
 *   window  The old instrument's shape (tools/blessing-matrix.js): a fixed,
 *           finished build dropped in at TIME for LIMIT seconds. Cheaper and
 *           less noisy, and blind to everything a build does on the way.
 *
 * THE LEDGER. Every point of health lost is booked to what took it and to
 * the kind of mistake it was - walked into a body (contact), stood in a
 * lane (charge), was shot (bolt), stood in something (ground), under a
 * storm mark (storm), or the finale's own mechanics (finale). A good pilot's
 * ledger should be mostly contact in a crowd it could not get out of; a
 * ledger full of bolts and ground is a pilot that is not looking.
 *
 *   node tools/botlab.js                                  full runs, every survivor, veteran
 *   MODE=full HEROES=mage,warrior DIFF=professional SEEDS=6 node tools/botlab.js
 *   PILOT=kite node tools/botlab.js                       the old bot, for comparison
 *   PILOT_OPTS='{"replan":0.2,"noise":20}'                a sloppier player
 *   DRAFT_OPTS='{"mode":"simple"}'                        the drafter's knobs (tools/bot/draft.js)
 *   BLESS=kings,stillwater                                force the first blessing (one cell each)
 *   BLESS=all MIDNIGHT=kings                              the blessing matrix: every blessing, every survivor
 *   MODE=window TIME=1320 LIMIT=90 SAME=1 ...             the fixed-window instrument
 *   OUT=/tmp/x.json ... ; node tools/botlab.js --report /tmp/x.json
 *   TRACE=10 OUT=/tmp/x.json ...                         a timeline every 10s (health, crowd, kill distance, events)
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { installPilot, installKiter } = require('./bot/pilot.js');
const { installDrafter } = require('./bot/draft.js');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);

function settings() {
  return {
    MODE: env('MODE', 'full'),
    MAP: env('MAP', 'thornhollow'),
    DIFF: env('DIFF', 'veteran'),
    HYPER: env('HYPER', '0') === '1',
    TIDES: env('TIDES', '0') === '1',
    PILOT: env('PILOT', 'plan'),
    PILOT_OPTS: JSON.parse(env('PILOT_OPTS', '{}')),
    DRAFT_OPTS: JSON.parse(env('DRAFT_OPTS', '{}')),
    FINALE: env('FINALE', '0') === '1',
    TIME: +env('TIME', 1320),
    LIMIT: +env('LIMIT', env('MODE', 'full') === 'full' ? 1800 : 90),
    SAME: env('SAME', '0') === '1',
    MIDNIGHT: env('MIDNIGHT', null),
    CONFIG: JSON.parse(env('CONFIG', '{}')),
    CHARS: JSON.parse(env('CHARS', '{}')),
    WEAPONS: JSON.parse(env('WEAPONS', '{}')),
    BLESSINGS: JSON.parse(env('BLESSINGS', '{}')),
    ENEMIES: JSON.parse(env('ENEMIES', '{}')),
    TRACE: +env('TRACE', 0),
    // The drafter's corrections to the reach model (tools/bot/calibrate.js).
    // CALIB=0 drafts on the raw model.
    CALIB: env('CALIB', '1') === '1' && fs.existsSync(path.join(__dirname, 'bot', 'reach-calibration.json'))
      ? JSON.parse(fs.readFileSync(path.join(__dirname, 'bot', 'reach-calibration.json'), 'utf8')) : null,
  };
}

/* ------------------------------------------------------------ in page -- */
function inPage(S, job, sources) {
  /* eslint-disable no-eval */
  const installPilot = (0, eval)('(' + sources.pilot + ')');
  const installKiter = (0, eval)('(' + sources.kiter + ')');
  const installDrafter = (0, eval)('(' + sources.drafter + ')');
  if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
  WS.UI.closeOverlay();
  WS.Save.db.seenManual = true;
  WS.Save.unlockAll();
  WS.Save.settings.difficulty = S.DIFF;
  WS.Save.settings.victoryCinematic = false;
  WS.Save.db.unlocks.hyper[S.MAP] = true;
  WS.Save.db.hyperArmed = S.HYPER;
  WS.Save.db.tidesArmed = S.TIDES;
  Object.assign(WS.Config, S.CONFIG);
  for (const [id, o] of Object.entries(S.CHARS)) Object.assign(WS.Characters[id], o);
  // Weapon, blessing and creature numbers the same way, for testing a patch
  // before it is written: WEAPONS='{"dawnpulse":{"healCap":20}}'. A creature
  // override reaches into its ranged block too ({"ranged":{"cooldown":4}}).
  for (const [id, o] of Object.entries(S.WEAPONS)) Object.assign(WS.Weapons[id], o);
  for (const [id, o] of Object.entries(S.BLESSINGS)) Object.assign(WS.Blessings[id], o);
  for (const [id, o] of Object.entries(S.ENEMIES)) {
    const t = WS.Enemies[id] || WS.Elites[id] || WS.Bosses[id];
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && t[k] && typeof t[k] === 'object') Object.assign(t[k], v); else t[k] = v;
    }
  }
  WS.Save.save = function () {};
  WS.Save.flush = function () {};

  /* The ledger: which system was running when the blow landed says what
     kind of blow it was. */
  const L = { byKind: {}, bySource: {}, last: [], hits: 0, lost: 0, potions: 0, lowest: 1, bolts: [], bombs: 0, freezes: 0,
    lowTime: 0, heal: 0 };
  if (!window.__ledgered) {
    window.__ledgered = true;
    const tag = (obj, fn, kind) => {
      const f = obj[fn];
      if (typeof f !== 'function') return;
      obj[fn] = function () {
        const was = window.__ctx; window.__ctx = kind;
        try { return f.apply(this, arguments); } finally { window.__ctx = was; }
      };
    };
    tag(WS.Enemy, 'update', 'contact');
    tag(WS.Projectile, 'update', 'bolt');
    tag(WS.Hazard, 'update', 'ground');
    tag(WS.Moor, 'update', 'storm');
    tag(WS.Finale, 'update', 'finale');
    tag(WS.Arena, 'update', 'arena');
    const orig = WS.Player.takeDamage;
    WS.Player.takeDamage = function (pl, amount, name) {
      const before = pl.health;
      const r = orig.apply(this, arguments);
      const lost = before - pl.health;
      const led = window.__led;
      if (led && lost > 0) {
        let kind = window.__ctx || 'other';
        if (kind === 'contact') {
          // Run down by a charge or a lunge is a different mistake.
          const pool = WS.Enemy.pool;
          for (let i = 0; i < pool.count; i++) {
            const e = pool.active[i];
            if (e.template && e.template.name === name && e.chargeTimer > 0
              && Math.hypot(e.x - pl.x, e.y - pl.y) < e.radius + pl.radius + 12) { kind = 'charge'; break; }
          }
        }
        if (kind === 'bolt') {
          // Which bolt: how long it had been flying says whether it could
          // have been seen coming.
          const hs = WS.Projectile.hostiles;
          for (let i = 0; i < hs.count; i++) {
            const h = hs.active[i];
            if (Math.hypot(h.x - pl.x, h.y - pl.y) <= h.radius + pl.radius + 1) {
              const tr = window.__pilot && window.__pilot.trace;
              led.bolts.push([Math.round((5 - h.life) * 100) / 100, Math.round(Math.hypot(h.vx, h.vy)),
                pl.slowTimer > 0 ? pl.slowFactor : 1,
                tr ? { expected: tr.chosen && tr.chosen.boltHits || 0, cost: Math.round(tr.cost), free: Math.round(tr.boltFree),
                  parts: Object.fromEntries(Object.entries(tr.chosen || {}).map(([k, v]) => [k, Math.round(v)])), foes: tr.foes, n: tr.bolts } : null]);
              break;
            }
          }
        }
        if (WS.Finale.running && WS.Finale.running() && kind !== 'finale') kind = 'finale ' + kind;
        led.byKind[kind] = (led.byKind[kind] || 0) + lost;
        const k = name || '?';
        led.bySource[k] = (led.bySource[k] || 0) + lost;
        led.hits++; led.lost += lost;
        led.last.push([Math.round(WS.Game.run.time * 10) / 10, k, kind, Math.round(lost), Math.round(before)]);
        if (led.last.length > 8) led.last.shift();
      }
      return r;
    };
    // Rescues used: bombs set off and time stopped.
    const det = WS.Pickup.detonate;
    WS.Pickup.detonate = function () { if (window.__led) window.__led.bombs++; return det.apply(this, arguments); };
    const frz = WS.Enemy.freezeAll;
    WS.Enemy.freezeAll = function () { if (window.__led) window.__led.freezes++; return frz.apply(this, arguments); };
    const heal = WS.Player.heal;
    WS.Player.heal = function (pl, amount, source) {
      if (source === 'potion' && window.__led) window.__led.potions++;
      return heal.apply(this, arguments);
    };
  }
  window.__led = L;

  /* THE TIMELINE (TRACE=seconds). A night is meant to breathe: stretches at
     the edge of the seat, then stretches where the build outruns the horde.
     Each window says which one it was: how much health it cost, how many
     creatures stood within reach, how far from the survivor things were
     dying and how long they lived, against how much horde arrived. When the
     build is ahead, creatures die young and far out, near the ring they came
     in on; when it is behind, they live long and die close. Level-up picks,
     blessings and bosses go in as events, so a swing can be read against
     what caused it. */
  if (!window.__traced) {
    window.__traced = true;
    const now = () => Math.round(WS.Game.run.time * 10) / 10;
    const sp = WS.Enemy.spawn;
    WS.Enemy.spawn = function () {
      const e = sp.apply(this, arguments);
      const T = window.__tr;
      if (e && T && !(e.template && (e.template.finale || e.template.part))) {
        e.__born = WS.Game.run.time;
        if (e.boss) T.ev.push([now(), 'boss', e.id, e.maxHealth]);
        else { T.w.spawns++; T.w.spawnHP += e.maxHealth; if (e.elite) T.w.elites++; }
      }
      return e;
    };
    /* Which weapon made each kill, and what the kill was worth to the
       survivor: [kills, within 100px (about to touch you), 100-320px,
       beyond, casters within their firing reach, elites]. The meter says
       how much damage a weapon did; this says which threats it removed. */
    const dm = WS.Enemy.damage;
    WS.Enemy.damage = function (e, amount, crit, source) {
      if (e && source) e.__src = source;
      return dm.apply(this, arguments);
    };
    const kl = WS.Enemy.kill;
    WS.Enemy.kill = function (e) {
      const T = window.__tr;
      if (T && e && !e.boss && e.__born !== undefined) {
        const pl = WS.Game.player, d = Math.hypot(e.x - pl.x, e.y - pl.y);
        const k = e.__src || 'other', row = T.kills[k] = T.kills[k] || [0, 0, 0, 0, 0, 0];
        row[0]++; row[d < 100 ? 1 : d < 320 ? 2 : 3]++;
        const t = e.template || {};
        if (t.ranged && d <= t.ranged.range * WS.Config.rangedReach) row[4]++;
        if (e.elite) row[5]++;
      }
      if (T && e && e.__born !== undefined) {
        const pl = WS.Game.player;
        const life = WS.Game.run.time - e.__born;
        if (e.boss) T.ev.push([now(), 'slain', e.id, Math.round(life)]);
        else { T.w.kd.push(Math.hypot(e.x - pl.x, e.y - pl.y)); T.w.life.push(life); if (e.rangedTimer !== null && e.rangedTimer !== undefined) T.w.clife.push(life); }
      }
      return kl.apply(this, arguments);
    };
    const cl = WS.Game.chooseLevelUp;
    WS.Game.chooseLevelUp = function (c) {
      if (window.__tr && c) window.__tr.ev.push([now(), c.type, c.id]);
      return cl.apply(this, arguments);
    };
    // Discoveries land outside a pick (two weapons meeting), so diff them.
    const cc = WS.ComboSystem.check;
    WS.ComboSystem.check = function (pl) {
      const had = Object.assign({}, pl.combosActive);
      const r = cc.apply(this, arguments);
      if (window.__tr) for (const id of Object.keys(pl.combosActive)) if (!had[id]) window.__tr.ev.push([now(), 'discovery', id]);
      return r;
    };
    if (WS.LevelUp.bestow) {
      const bs = WS.LevelUp.bestow;
      WS.LevelUp.bestow = function (pl, n) {
        const r = bs.apply(this, arguments);
        if (window.__tr) window.__tr.ev.push([now(), 'reliquary', n + ':' + r.join('|')]);
        return r;
      };
    }
    const cb = WS.Game.chooseBlessing;
    WS.Game.chooseBlessing = function (c) {
      if (window.__tr && c) window.__tr.ev.push([now(), 'blessing', c.id || c]);
      return cb.apply(this, arguments);
    };
  }
  // casters: creatures that stop and shoot, alive and within 320px of you;
  // clife: how long the casters killed this window had lived.
  const freshWindow = () => ({ spawns: 0, spawnHP: 0, elites: 0, kd: [], life: [], clife: [], near: 0, screen: 0, casters: 0, samples: 0, hpMin: 1 });
  const TR = S.TRACE > 0 ? { w: freshWindow(), ev: [], rows: [], sub: 0, kills: {} } : null;
  window.__tr = TR;

  const [hero, blessing, seed] = job;
  WS.setSeed(seed);
  WS.Game.startRun(S.MAP, hero);
  const G = WS.Game;
  const pilot = S.PILOT === 'kite' ? installKiter() : installPilot(S.PILOT_OPTS);
  const draft = installDrafter(Object.assign({ blessing: blessing === 'auto' ? null : blessing, midnight: S.MIDNIGHT, calib: S.CALIB, seed }, S.DRAFT_OPTS));
  WS.Input.poll = function () {};
  let p = G.player;

  // The window: a finished build, dropped in late.
  if (S.MODE === 'window') {
    G.openLevelUp = () => {}; G.presentLevelUp = () => {};
    if (G.state === 'blessing') G.chooseBlessing(draft.pickBlessing(p, G.blessingChoices || []));
    const start = p.weapons[0] && p.weapons[0].id;
    p.weapons.length = 0; p.weaponLevels = {};
    const ids = S.SAME ? [] : [start];
    for (const id of ['volley', 'arcweb', 'axe_gyre', 'cinderfall']) if (ids.length < 4 && !ids.includes(id)) ids.push(id);
    for (const id of ids) {
      const w = WS.Player.addWeapon(p, id);
      if (w) { w.level = WS.WEAPON_MAX_LEVEL; p.weaponLevels[id] = w.level; w.evolved = true; }
    }
    for (const [id, n] of Object.entries({ might: 3, haste: 3, vitality: 3, armor: 2, area: 2 })) {
      const up = WS.Upgrades[id];
      for (let i = 0; i < n; i++) up.apply(p, up);
      p.upgradeLevels[id] = (p.upgradeLevels[id] || 0) + n;
    }
    if (p.flowAttuned > 0) p.flowSteps = WS.Primal.maxSteps(p);
    p.health = p.maxHealth;
    WS.Enemy.pool.releaseAll(); WS.Hazard.pool.releaseAll(); WS.Projectile.bolts.releaseAll();
    WS.Projectile.hostiles.releaseAll();
    G.run.time = S.TIME;
    p.x = WS.CONST.WORLD_WIDTH / 2; p.y = WS.CONST.WORLD_HEIGHT / 2;
  }

  const t0 = G.run.time;
  const STEP = 1 / 60;
  const curve = [];
  let nextMark = Math.ceil(t0 / 60) * 60 + (S.MODE === 'full' ? 60 : 0);
  let reachedDawn = false, finaleCleared = false, finaleT = 0;
  const cap = (S.LIMIT + (S.FINALE ? 900 : 0)) * 60 * 3;
  let wall = 0;
  for (let i = 0; i < cap; i++) {
    if (G.state === 'blessing') { G.chooseBlessing(draft.pickBlessing(p, G.blessingChoices || [])); continue; }
    if (G.state === 'levelup') {
      const c = draft.pickLevel(p, G.levelChoices || []);
      if (c) G.chooseLevelUp(c); else { G.state = 'playing'; G.leveling = false; }
      continue;
    }
    if (S.MODE === 'window') { G.pendingLevelUps = 0; G.leveling = false; }
    if (G.run.victorious && !reachedDawn) {
      reachedDawn = true;
      if (!S.FINALE || !WS.Finale.available(G.run)) break;
      G.faceFinale();
      finaleT = G.run.time;
    }
    if (G.run.finaleCleared) { finaleCleared = true; break; }
    if (G.state === 'over' || (!G.running && G.state !== 'dying')) break;
    if (G.state === 'dying') { G.update(STEP); continue; }
    if (G.state !== 'playing') { WS.UI.closeOverlay(); G.state = 'playing'; }
    const tw = performance.now();
    pilot.step(STEP);
    wall += performance.now() - tw;
    G.update(STEP);
    p = G.player;
    const f = p.health / Math.max(1, p.maxHealth);
    if (f < L.lowest) L.lowest = f;
    if (f < 0.25) L.lowTime += STEP;
    if (TR) {
      TR.w.hpMin = Math.min(TR.w.hpMin, f);
      TR.sub += STEP;
      if (TR.sub >= 0.5) {
        TR.sub = 0;
        const pool = WS.Enemy.pool;
        let near = 0, screen = 0, casters = 0;
        for (let k = 0; k < pool.count; k++) {
          const e = pool.active[k];
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < 250) near++;
          if (d < 600) screen++;
          if (d < 320 && e.rangedTimer !== null && e.rangedTimer !== undefined) casters++;
        }
        TR.w.near += near; TR.w.screen += screen; TR.w.casters += casters; TR.w.samples++;
      }
      if (TR.next === undefined) TR.next = Math.floor(G.run.time / S.TRACE) * S.TRACE + S.TRACE;
      if (G.run.time >= TR.next) {
        const w = TR.w, med = (a) => { if (!a.length) return -1; const q = a.slice().sort((x, y) => x - y); return q[q.length >> 1]; };
        const prev = TR.prev || { lost: 0, healed: 0, dealt: 0, kills: 0 };
        const cur = { lost: L.lost, healed: G.run.healingDone || 0, dealt: G.run.damageDone || 0, kills: G.run.kills };
        let boss = 0;
        for (let k = 0; k < WS.Enemy.pool.count; k++) if (WS.Enemy.pool.active[k].boss) boss++;
        const mh = Math.max(1, p.maxHealth);
        TR.rows.push([Math.round(TR.next), Math.round(f * 100), Math.round(w.hpMin * 100),
          Math.round((cur.lost - prev.lost) / mh * 100), Math.round((cur.healed - prev.healed) / mh * 100),
          +(w.near / Math.max(1, w.samples)).toFixed(1), +(w.screen / Math.max(1, w.samples)).toFixed(1), WS.Enemy.pool.count,
          w.spawns, Math.round(w.spawnHP), cur.kills - prev.kills, Math.round(cur.dealt - prev.dealt),
          Math.round(med(w.kd)), +med(w.life).toFixed(1), p.level, boss, w.elites,
          +(w.casters / Math.max(1, w.samples)).toFixed(2), +med(w.clife).toFixed(1)]);
        TR.prev = cur; TR.w = freshWindow(); TR.next += S.TRACE;
      }
    }
    while (G.run.time >= nextMark) {
      // [6]: the meter so far and each weapon's rank (E once evolved), to see
      // when in a night one weapon takes the meter over.
      curve.push([Math.round(nextMark / 60), Math.round(f * 100), p.level, WS.Enemy.pool.count, Math.round(G.run.damageDone),
        Object.fromEntries(Object.entries(G.run.landedByWeapon || G.run.damageByWeapon || {}).map(([k, v]) => [k, Math.round(v)])),
        Object.fromEntries(p.weapons.map((w) => [w.id, w.level + (w.evolved ? 'E' : '')]))]);
      nextMark += 60;
    }
    if (S.MODE === 'window' && G.run.time - t0 >= S.LIMIT) break;
  }
  const run = G.run;
  const dead = !reachedDawn && (G.state === 'dying' || G.state === 'over' || p.health <= 0) && !(S.MODE === 'window' && run.time - t0 >= S.LIMIT - 0.1);
  return {
    hero, blessing, seed,
    t: Math.round((Math.min(run.time, reachedDawn ? WS.Config.deathTime : run.time) - t0) * 10) / 10,
    dawn: reachedDawn, finale: S.FINALE ? (finaleCleared ? 'won' : reachedDawn ? 'lost' : '-') : null,
    finaleT: finaleT ? Math.round(run.time - finaleT) : 0,
    dead, level: p.level, kills: run.kills,
    taken: Math.round(L.lost), hits: L.hits, byKind: L.byKind,
    bySource: Object.fromEntries(Object.entries(L.bySource).sort((a, b) => b[1] - a[1]).slice(0, 6)),
    last: L.last, lowest: Math.round(L.lowest * 100), lowTime: Math.round(L.lowTime),
    potions: L.potions, healed: Math.round(run.healingDone), bombs: L.bombs, freezes: L.freezes,
    dealt: Math.round(run.damageDone), storms: run.storms || 0,
    byWeapon: Object.fromEntries(Object.entries(run.landedByWeapon || run.damageByWeapon || {}).map(([k, v]) => [k, Math.round(v)])),
    healBy: Object.fromEntries(Object.entries(run.healingBySource || {}).map(([k, v]) => [k, Math.round(v)])),
    overheal: Math.round(Object.values(run.overhealBySource || {}).reduce((a, v) => a + v, 0)),
    maxHp: Math.round(p.maxHealth), armor: Math.round(p.armor || 0),
    rescueGoals: pilot.rescues || 0,
    weapons: p.weapons.map((w) => w.id + ':' + w.level + (w.evolved ? 'E' : '')),
    steps: (WS.WaveManager.stepK || []).map((v) => Math.round(v * 100) / 100),
    blessings: Object.keys(p.blessingsTaken || {}),
    curve, trace: TR ? { cols: 't hp hpMin lost healed near screen alive spawns spawnHP kills dealt killDist life level boss elites casters casterLife'.split(' '), rows: TR.rows, ev: TR.ev, kills: TR.kills } : null,
    pilotMs: Math.round(wall), plans: pilot.stats.plans || 1, bolts: L.bolts,
    picks: window.__draft ? window.__draft.picks : null,
  };
}

/* ------------------------------------------------------------- worker -- */
async function worker(S, jobs) {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const sources = { pilot: installPilot.toString(), kiter: installKiter.toString(), drafter: installDrafter.toString() };
  const out = [];
  let page = null, used = 0;
  for (const job of jobs) {
    // A fresh page per full run: thirty minutes leaves a lot behind.
    if (!page || S.MODE === 'full' || used >= 40) {
      if (page) await page.close();
      page = await b.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('pageerror', (e) => process.stderr.write('PAGEERROR ' + e.message + '\n'));
      await page.goto(GAME);
      await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db);
      await page.waitForTimeout(200);
      used = 0;
    }
    used++;
    try {
      out.push(await page.evaluate(({ S, job, sources }) => {
        const f = (0, eval)('(' + sources.inPage + ')');
        return f(S, job, sources);
      }, { S, job, sources: { ...sources, inPage: inPage.toString() } }));
    } catch (e) {
      process.stderr.write(`run ${job.join('/')} failed: ${e.message}\n`);
    }
    if (process.env.__PROGRESS) process.stderr.write('.');
  }
  await b.close();
  return out;
}

/* ------------------------------------------------------------- report -- */
function report(data) {
  const { S, runs } = data;
  const heroes = [...new Set(runs.map((r) => r.hero))];
  const bls = [...new Set(runs.map((r) => r.blessing))];
  const mean = (a, f) => a.reduce((s, r) => s + f(r), 0) / (a.length || 1);
  const full = S.MODE === 'full';
  console.log(`\n${S.MODE} · ${S.MAP} · ${S.DIFF}${S.HYPER ? ' Hyper' : ''} · pilot ${S.PILOT}${Object.keys(S.PILOT_OPTS).length ? ' ' + JSON.stringify(S.PILOT_OPTS) : ''}`
    + (full ? '' : ` · from ${S.TIME}s for ${S.LIMIT}s`) + ` · ${runs.length} runs`);
  const line = (label, rs) => {
    const t = mean(rs, (r) => r.t);
    const won = rs.filter((r) => r.dawn).length;
    const kinds = {};
    for (const r of rs) for (const [k, v] of Object.entries(r.byKind)) kinds[k] = (kinds[k] || 0) + v;
    const tot = Object.values(kinds).reduce((a, b) => a + b, 0) || 1;
    const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, v]) => `${k} ${Math.round(v / tot * 100)}%`).join(', ');
    return '  ' + label.padEnd(24)
      + (full ? `${(t / 60).toFixed(1)}m`.padStart(7) + `${won}/${rs.length} dawn`.padStart(11)
        : `${t.toFixed(1)}s`.padStart(7) + `${rs.filter((r) => !r.dead).length}/${rs.length} lived`.padStart(12))
      + `  lvl ${mean(rs, (r) => r.level).toFixed(0).padStart(3)}  potions ${mean(rs, (r) => r.potions).toFixed(1).padStart(4)}`
      + `  bombs ${mean(rs, (r) => r.bombs || 0).toFixed(1).padStart(4)}  freezes ${mean(rs, (r) => r.freezes || 0).toFixed(1).padStart(4)}`
      + `  low ${mean(rs, (r) => r.lowest).toFixed(0).padStart(3)}%  hurt: ${top}`;
  };
  console.log('\n by survivor');
  for (const h of heroes) console.log(line(h, runs.filter((r) => r.hero === h)));
  if (bls.length > 1) {
    console.log('\n by first blessing');
    for (const b of bls) console.log(line(b, runs.filter((r) => r.blessing === b)));
  }
  console.log(line('ALL', runs));
  // What killed the ones that died.
  const deaths = runs.filter((r) => r.dead);
  if (deaths.length) {
    const by = {};
    for (const r of deaths) {
      const k = r.last.length ? r.last[r.last.length - 1][2] + ' · ' + r.last[r.last.length - 1][1] : '?';
      by[k] = (by[k] || 0) + 1;
    }
    console.log('\n the killing blow');
    for (const [k, n] of Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(n).padStart(4)}  ${k}`);
  }
  const bolts = runs.flatMap((r) => r.bolts || []);
  if (bolts.length) {
    const bin = [0, 0, 0, 0];
    for (const [age] of bolts) bin[age < 0.2 ? 0 : age < 0.4 ? 1 : age < 0.8 ? 2 : 3]++;
    const pc = (n) => Math.round(n / bolts.length * 100) + '%';
    console.log(`\n bolts that landed: ${bolts.length}, flying <0.2s ${pc(bin[0])}, 0.2-0.4s ${pc(bin[1])}, 0.4-0.8s ${pc(bin[2])}, longer ${pc(bin[3])}`
      + `; mean speed ${Math.round(mean(bolts.map((b) => ({ v: b[1] })), (x) => x.v))}; slowed when hit ${pc(bolts.filter((b) => b[2] < 1).length)}`);
  }
  const ms = mean(runs, (r) => r.pilotMs / Math.max(1, r.plans));
  console.log(`\n pilot: ${ms.toFixed(2)}ms a decision`);
}

/* The blessing matrix, from full runs: each blessing forced as the first
   pick on every survivor. Ranked by minutes survived and dawns reached, and
   for each survivor's own signature, what it is worth on them against the
   median of everyone else who took it. Standard errors are over runs. */
function matrix(data, owners) {
  const { runs } = data;
  const heroes = [...new Set(runs.map((r) => r.hero))];
  const bls = [...new Set(runs.map((r) => r.blessing))];
  const mins = (rs) => rs.reduce((s, r) => s + r.t, 0) / (rs.length || 1) / 60;
  const se = (rs) => {
    const m = mins(rs);
    const v = rs.reduce((s, r) => s + Math.pow(r.t / 60 - m, 2), 0) / Math.max(1, rs.length - 1);
    return Math.sqrt(v / Math.max(1, rs.length));
  };
  const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const cell = (h, b) => runs.filter((r) => r.hero === h && r.blessing === b);
  const own = Object.fromEntries(Object.entries(owners).map(([h, b]) => [b, h]));
  console.log('\n blessings, every survivor (a signature counted only on the eleven it does not belong to)');
  const rows = bls.map((b) => {
    const rs = runs.filter((r) => r.blessing === b && owners[r.hero] !== b);
    return { b, m: mins(rs), se: se(rs), dawn: rs.filter((r) => r.dawn).length / (rs.length || 1), n: rs.length };
  }).sort((a, b) => b.m - a.m);
  for (const r of rows) {
    console.log('  ' + (r.b + (own[r.b] ? ' *' : '')).padEnd(20) + `${r.m.toFixed(1)}m ±${r.se.toFixed(1)}`.padStart(12)
      + `${Math.round(r.dawn * 100)}% dawn`.padStart(11) + `  (${r.n} runs)`);
  }
  console.log('\n each survivor on their own signature, against the others who took it');
  for (const h of heroes) {
    const b = owners[h];
    if (!b || !bls.includes(b)) continue;
    const mine = cell(h, b), base = bls.includes('kings') ? cell(h, 'kings') : [];
    const others = heroes.filter((x) => x !== h).map((x) => {
      const c = cell(x, b), k = bls.includes('kings') ? cell(x, 'kings') : [];
      return k.length ? mins(c) - mins(k) : mins(c);
    });
    const gain = base.length ? mins(mine) - mins(base) : mins(mine);
    console.log('  ' + h.padEnd(11) + b.padEnd(17) + `own ${gain >= 0 ? '+' : ''}${gain.toFixed(1)}m`.padStart(12)
      + `others ${med(others) >= 0 ? '+' : ''}${med(others).toFixed(1)}m`.padStart(15)
      + `  edge ${(gain - med(others) >= 0 ? '+' : '')}${(gain - med(others)).toFixed(1)}m` + (base.length ? '  (gains over Warden\'s Charge)' : ''));
  }
}

/* --------------------------------------------------------------- main -- */
(async () => {
  if (process.argv[2] === '--report') {
    const data = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    report(data);
    if (data.owners) matrix(data, data.owners);
    return;
  }
  const S = settings();
  if (process.env.__WORKER) {
    const out = await worker(S, JSON.parse(process.env.__JOBS));
    process.stdout.write(JSON.stringify(out));
    return;
  }
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage();
  await page.goto(GAME);
  await page.waitForFunction(() => window.WS && WS.Game);
  const roster = await page.evaluate(() => WS.CharacterOrder.slice());
  const owners = await page.evaluate(() => Object.fromEntries(WS.CharacterOrder.map((h) => [h, WS.Characters[h].signatureBlessing])));
  const allBless = await page.evaluate(() => WS.BlessingOrder.slice());
  await b.close();
  const heroes = env('HEROES', 'all') === 'all' ? roster : env('HEROES').split(',');
  const bls = env('BLESS', 'auto') === 'all' ? allBless : env('BLESS', 'auto').split(',');
  const N = +env('SEEDS', 4);
  const seeds = Array.from({ length: N }, (_, i) => 101 + i * 7919);
  const jobs = [];
  for (const seed of seeds) for (const h of heroes) for (const bl of bls) jobs.push([h, bl, seed]);
  const shards = Math.min(jobs.length, +env('SHARDS', os.cpus().length));
  const parts = Array.from({ length: shards }, () => []);
  jobs.forEach((j, i) => parts[i % shards].push(j));
  const t0 = Date.now();
  const results = await Promise.all(parts.map((part) => new Promise((resolve, reject) => {
    const ch = spawn(process.execPath, [__filename], {
      env: { ...process.env, __WORKER: '1', __JOBS: JSON.stringify(part) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buf = '';
    ch.stdout.on('data', (d) => { buf += d; });
    ch.on('close', (code) => (code ? reject(new Error('worker failed')) : resolve(JSON.parse(buf))));
  })));
  const data = { S, runs: results.flat(), secs: Math.round((Date.now() - t0) / 1000), owners };
  console.log(`${data.runs.length} runs in ${data.secs}s`);
  if (env('OUT', null)) fs.writeFileSync(env('OUT'), JSON.stringify(data));
  report(data);
  if (bls.length > 1) matrix(data, owners);
})();
