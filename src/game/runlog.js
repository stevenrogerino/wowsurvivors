/* The run code: a whole night, written down as it is played, for a tester to
 * paste back to the developer.
 *
 * Balance had reached the point of turning knobs on what the bot and the
 * simulations said, because nothing came back from real nights but a
 * sentence and a screenshot. This records what a real player was offered and
 * took, and when; where they walked; how full the field was around them;
 * what dealt the damage, what healed them and what hurt them, over time; and
 * how the night ended. At the end the results screen copies it as one line of
 * text (Copy run code), and tools/run-code.js reads one or many of them.
 *
 * It is a record, not a re-simulation: the frame rate decides the steps of a
 * real night, so the same seed and the same inputs would not replay it
 * exactly. What is kept is what balance is decided on.
 *
 * Cheap by construction: hooks wrap the few calls where a choice is made, and
 * everything else is sampled once a second from state the game already
 * keeps. Nothing here runs per creature per frame. */
'use strict';
(function (WS) {

  const V = 3;
  const SAMPLE = 1;          // seconds between position samples
  const SLOW = 5;            // seconds between health, crowd and damage samples
  const METER_EVERY = 10;    // seconds between meter snapshots
  const NEAR = 320;          // "around you": creatures within this many px
  const BIG_HIT = 0.1;       // a blow worth recording, as a share of max health
  const MAX_EVENTS = 4000;

  const RunLog = { log: null };
  let next = 0, nextMeter = 0, seen = null, last = null;

  const r1 = (n) => Math.round(n * 10) / 10;
  const now = () => (WS.Game.run ? r1(WS.Game.run.time) : 0);
  const tok = (c) => (c ? (c.type || '?') + ':' + (c.id || '') : '');
  function ev(...a) {
    const L = RunLog.log;
    if (!L || L.ev.length >= MAX_EVENTS) return;
    L.ev.push([now(), ...a]);
  }

  /** A fingerprint of the balance the night was played under: the numbers in
   *  the tables, hashed. Two codes with the same one were played on the same
   *  tuning, whatever the build was called. */
  function balanceHash() {
    const pick = (o) => JSON.stringify(o, (k, v) => (typeof v === 'function' ? undefined : v));
    let s = '';
    try { s = pick(WS.Config) + pick(WS.Weapons) + pick(WS.Upgrades) + pick(WS.Blessings) + pick(WS.Enemies); } catch (e) { s = 'x'; }
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  function kit(p) {
    return {
      w: p.weapons.map((w) => w.id + ':' + w.level + (w.evolved ? 'e' : '')).join(','),
      u: WS.UpgradeOrder.filter((id) => p.upgradeLevels[id]).map((id) => id + ':' + p.upgradeLevels[id]).join(','),
      d: WS.ComboOrder.filter((id) => p.combosActive && p.combosActive[id]).join(','),
      b: Object.keys(p.blessingsTaken || {}).join(','),
    };
  }

  RunLog.begin = function () {
    const G = WS.Game, run = G.run, p = G.player;
    if (!run || !p) return;
    RunLog.log = {
      v: V, bal: balanceHash(), at: new Date().toISOString(),
      plat: WS.Platform ? WS.Platform.name : 'web',
      seed: WS.getSeed ? WS.getSeed() : null,
      map: run.mapId, char: run.characterId, diff: run.difficulty || WS.Save.settings.difficulty,
      hyper: !!run.hyper, tides: !!run.tides, oaths: (run.oaths || []).slice(),
      nightly: run.nightly ? run.nightly.day : null, arena: !!(run.map && run.map.arena),
      quality: WS.Save.settings.quality || null,
      x0: Math.round(p.x), y0: Math.round(p.y),
      // per-second columns
      // Where the survivor was, every second, as steps of 8px from the last
      // sample (small numbers, which is what makes the code short).
      s: { t: [], dx: [], dy: [] },
      // Everything else every SLOW seconds.
      s5: { t: [], hp: [], lv: [], field: [], near: [], dealt: [], taken: [], heal: [] },
      ev: [],
      m: [],                // meter snapshots: [t, {source: dealt}, {source: healed}, {source: taken}]
      taken: {},            // damage taken by what dealt it, the whole night
      end: null,
    };
    next = 0; nextMeter = METER_EVERY;
    seen = new WeakSet();
    last = { kit: kit(p), stage: null, marks: 0, revives: p.revives || 0, qx: 0, qy: 0, slow: 0,
      dealt: run.damageDone || 0, taken: run.damageTaken || 0, heal: run.healingDone || 0 };
    ev('kit', last.kit.w, last.kit.u, last.kit.b);
    // The opening blessing draft is dealt by startRun itself.
    if (G.state === 'blessing' && G.blessingChoices) ev('boffer', G.blessingChoices.map(tok).join(','));
  };

  function sample() {
    const L = RunLog.log, G = WS.Game, run = G.run, p = G.player;
    const S = L.s;
    const qx = Math.round((p.x - L.x0) / 8), qy = Math.round((p.y - L.y0) / 8);
    S.t.push(Math.round(run.time));
    S.dx.push(qx - last.qx); S.dy.push(qy - last.qy);
    last.low = WS.min(last.low === undefined ? 100 : last.low, Math.round(100 * WS.clamp(p.health / p.maxHealth, 0, 1)));
    last.qx = qx; last.qy = qy;
    const pool = WS.Enemy.pool;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.active[i];
      if (e.boss && !seen.has(e)) { seen.add(e); ev('boss', e.displayName || (e.template && e.template.name) || e.type, Math.round(e.maxHealth)); }
    }
    if (run.time >= last.slow) {
      last.slow = run.time + SLOW;
      const F = L.s5;
      let near = 0;
      for (let i = 0; i < pool.count; i++) {
        const e = pool.active[i];
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy < NEAR * NEAR) near++;
      }
      F.t.push(Math.round(run.time));
      // The lowest health since the last of these, so a dip between samples
      // is not lost.
      F.hp.push(WS.min(last.low === undefined ? 100 : last.low, Math.round(100 * WS.clamp(p.health / p.maxHealth, 0, 1))));
      last.low = undefined;
      F.lv.push(p.level);
      F.field.push(pool.count);
      F.near.push(near);
      F.dealt.push(Math.round((run.damageDone || 0) - last.dealt)); last.dealt = run.damageDone || 0;
      F.taken.push(Math.round((run.damageTaken || 0) - last.taken)); last.taken = run.damageTaken || 0;
      F.heal.push(Math.round((run.healingDone || 0) - last.heal)); last.heal = run.healingDone || 0;
    }

    // What changed in the build since the last second: ranks, evolutions,
    // unions, discoveries and blessings from any source (cards, reliquaries,
    // chests), without hooking each of them.
    const k = kit(p);
    for (const key of ['w', 'u', 'd', 'b']) if (k[key] !== last.kit[key]) ev('k' + key, k[key]);
    last.kit = k;
    const marks = run.marks || [];
    while (last.marks < marks.length) { const mk = marks[last.marks++]; ev('fell', mk[2]); }
    const st = WS.Finale && WS.Finale.running && WS.Finale.running() ? WS.Finale.stage : null;
    if (st !== last.stage) { ev('finale', st || 'none'); last.stage = st; }
    if ((p.revives || 0) < last.revives) ev('revive');
    last.revives = p.revives || 0;
  }

  function meters() {
    const run = WS.Game.run, round = (o) => {
      const out = {};
      for (const [k, v] of Object.entries(o || {})) if (v >= 1) out[k] = Math.round(v);
      return out;
    };
    RunLog.log.m.push([Math.round(run.time), round(run.damageByWeapon), round(run.healingBySource), round(RunLog.log.taken)]);
  }

  RunLog.tick = function () {
    const L = RunLog.log, run = WS.Game.run;
    if (!L || !run || L.end) return;
    if (run.time >= next) { next = run.time + SAMPLE; sample(); }
    if (run.time >= nextMeter) { nextMeter = run.time + METER_EVERY; meters(); }
  };

  RunLog.hurt = function (src, amount, p) {
    const L = RunLog.log;
    if (!L || !(amount > 0)) return;
    const k = src || 'unknown';
    L.taken[k] = (L.taken[k] || 0) + amount;
    if (amount >= p.maxHealth * BIG_HIT) ev('hit', k, Math.round(amount), Math.round(100 * WS.max(0, p.health) / p.maxHealth));
  };

  RunLog.pickup = function (kind) {
    if (kind === 'coin') return;
    ev('got', kind);
  };

  RunLog.finish = function (reason) {
    const L = RunLog.log, G = WS.Game, run = G.run, p = G.player;
    if (!L || L.end || !run) return;
    if (p) { last.slow = 0; sample(); }
    meters();
    L.end = {
      reason, time: r1(run.time), kills: run.kills || 0, level: p ? p.level : 0, score: run.score || 0,
      bosses: run.bossesSlain || 0, finale: !!run.finaleCleared,
      killedBy: run.killedBy || null, kit: p ? kit(p) : null,
      dealt: Math.round(run.damageDone || 0), taken: Math.round(run.damageTaken || 0),
      healed: Math.round(run.healingDone || 0), prevented: Math.round(run.damagePrevented || 0),
      maxHealth: p ? Math.round(p.maxHealth) : 0, faults: WS.faultCount ? WS.faultCount() : 0,
    };
    try {
      const rep = WS.Runs.report();
      L.end.frames = rep.frames;
    } catch (e) { /* the record matters more than the frame figures */ }
  };

  /* ---------------------------------------------------------- the code -- */
  const b64url = (bytes) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  /** The night as one line of text: "EW1." and deflated JSON, or "EW0." and
   *  plain JSON where the browser cannot compress. Resolves to null when
   *  there is nothing to give. */
  RunLog.code = async function () {
    const L = RunLog.log;
    if (!L) return null;
    const json = JSON.stringify(L);
    const raw = new TextEncoder().encode(json);
    if (typeof CompressionStream === 'function') {
      try {
        const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        const packed = new Uint8Array(await new Response(stream).arrayBuffer());
        return 'EW1.' + b64url(packed);
      } catch (e) { /* fall through to the plain form */ }
    }
    return 'EW0.' + b64url(raw);
  };

  /* ------------------------------------------------------------ hooks -- */
  const G = WS.Game;
  const wrap = (name, before, after) => {
    const f = G[name];
    G[name] = function (...args) {
      if (before) try { before.apply(this, args); } catch (e) { /* never break play */ }
      const out = f.apply(this, args);
      if (after) try { after.call(this, out, ...args); } catch (e) { /* never break play */ }
      return out;
    };
  };
  wrap('startRun', null, () => RunLog.begin());
  /* A pick carries the hand it was made from: the cards on the table at
     that moment, after any reroll or banish. Rerolls and banishes are kept
     too, with the hand they replaced. */
  wrap('rerollLevelUp', function () { if (this.player.rerolls > 0) ev('reroll', (this.levelChoices || []).map(tok).join(',')); });
  wrap('banishLevelUp', null, function (ok, choice) { if (ok) ev('banish', tok(choice)); });
  wrap('chooseLevelUp', function (choice) { ev('pick', tok(choice), (this.levelChoices || []).map(tok).join(',')); });
  wrap('offerBlessing', null, function () { if (this.blessingChoices) ev('boffer', this.blessingChoices.map(tok).join(',')); });
  wrap('chooseBlessing', (choice) => ev('bpick', tok(choice)));
  wrap('tick', null, () => RunLog.tick());
  // After the run is recorded, so the score is in it.
  wrap('endRun', null, (out, reason) => RunLog.finish(reason));

  WS.RunLog = RunLog;

})(window.WS);
