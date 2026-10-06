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

  const V = 5;
  /* SHORT BY DESIGN. A level-181 night came to 75k characters, and a code
     is pasted into a chat. Version 5 keeps what balance is read from and
     drops the rest:
       - no path: the survivor's place is sampled every second but only how
         far they walked and how long they stood still is kept, per slice,
         with the ground covered at the end;
       - slices every 15s, the big figures to two significant digits (q);
       - the build's changes as what changed, not the whole kit again;
       - a pick as its place in the hand it was dealt from;
       - meters once a minute, as what each source did that minute;
       - every pickup and drop counted by the minute.
     tools/run-code.js reads it back into the shape older codes have. */
  const SAMPLE = 1;          // seconds between samples of place and health
  const SLOW = 15;           // seconds in a slice (health, crowd, damage)
  const METER_EVERY = 60;    // seconds between meter rows
  const NEAR = 320;          // "around you": creatures within this many px
  const BIG_HIT = 0.1;       // a blow worth recording, as a share of max health
  const MAX_EVENTS = 4000;
  // Card types, one letter each in a code (run-code.js has the same table).
  const TYPE = { stat: 's', new_weapon: 'n', weapon_rank: 'r', evolve: 'e', union: 'u', gold: 'g', bread: 'b',
    breaking_point: 'p', blessing: 'B' };

  const RunLog = { log: null };
  let next = 0, nextMeter = 0, seen = null, last = null;

  const r1 = (n) => Math.round(n * 10) / 10;
  const now = () => (WS.Game.run ? Math.round(WS.Game.run.time) : 0);
  const tok = (c) => (c ? (TYPE[c.type] || c.type || '?') + ':' + (c.id || '') : '');
  /** A figure to two significant digits, written as mantissa x 10 + exponent:
   *  1,234,567 is 125 (12 x 10^5). Zero is 0, anything under 10 itself x 10. */
  const q = (v) => {
    v = Math.round(v);
    if (!(v > 0)) return 0;
    let e = 0;
    while (v >= 100) { v /= 10; e++; }
    return Math.round(v) * 10 + e;
  };
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
  /** What changed between two kit strings, as "id:rank" (":0" for gone). */
  function kitDiff(was, is) {
    const map = (s) => Object.fromEntries((s || '').split(',').filter(Boolean).map((x) => { const i = x.indexOf(':'); return i < 0 ? [x, '1'] : [x.slice(0, i), x.slice(i + 1)]; }));
    const a = map(was), b = map(is), out = [];
    for (const [k, v] of Object.entries(b)) if (a[k] !== v) out.push(k + ':' + v);
    for (const k of Object.keys(a)) if (!(k in b)) out.push(k + ':0');
    return out.join(',');
  }

  RunLog.begin = function () {
    const G = WS.Game, run = G.run, p = G.player;
    if (!run || !p) return;
    RunLog.log = {
      v: V, bal: balanceHash(), at: new Date().toISOString(),
      plat: WS.Platform ? WS.Platform.name : 'web',
      seed: WS.getSeed ? WS.getSeed() : null,
      map: run.mapId, char: run.characterId, diff: run.difficulty || WS.Save.settings.difficulty,
      hyper: !!run.hyper, tides: !!run.tides, classic: !!run.classic, oaths: (run.oaths || []).slice(),
      nightly: run.nightly ? run.nightly.day : null, arena: !!(run.map && run.map.arena),
      quality: WS.Save.settings.quality || null,
      /* One slice every SLOW seconds: dt since the last; the lowest health
         in it (%); creatures on the field and within NEAR;
         damage dealt, taken and healed (q); kills; px walked / 8; seconds
         stood still. */
      f: { dt: [], hp: [], field: [], near: [], dealt: [], taken: [], heal: [], kills: [], mv: [], still: [] },
      ev: [],
      // Meter rows: [t, [dealt], [healed], [taken]], each what that source
      // did since the row before (q), in the order of mk's three key lists.
      mk: [[], [], []],
      m: [],
      taken: {},            // damage taken by what dealt it, the whole night
      end: null,
    };
    next = 0; nextMeter = METER_EVERY;
    seen = new WeakSet();
    last = { kit: kit(p), stage: null, marks: 0, revives: p.revives || 0, slow: SLOW, t: 0,
      x: p.x, y: p.y, x0: p.x, x1: p.x, y0: p.y, y1: p.y, mv: 0, still: 0,
      luck: Math.round((p.luck || 1) * 100) / 100, meter: [{}, {}, {}],
      dealt: run.damageDone || 0, taken: run.damageTaken || 0, heal: run.healingDone || 0, kills: run.kills || 0 };
    ev('kit', last.kit.w, last.kit.u, last.kit.b);
    // The opening blessing draft is dealt by startRun itself.
    if (G.state === 'blessing' && G.blessingChoices) ev('boffer', G.blessingChoices.map(tok).join(','));
  };

  function sample() {
    const L = RunLog.log, G = WS.Game, run = G.run, p = G.player;
    const step = Math.hypot(p.x - last.x, p.y - last.y);
    last.mv += step;
    if (step < 20 * SAMPLE) last.still += SAMPLE;
    last.x = p.x; last.y = p.y;
    last.x0 = WS.min(last.x0, p.x); last.x1 = WS.max(last.x1, p.x);
    last.y0 = WS.min(last.y0, p.y); last.y1 = WS.max(last.y1, p.y);
    last.low = WS.min(last.low === undefined ? 100 : last.low, Math.round(100 * WS.clamp(p.health / p.maxHealth, 0, 1)));
    const pool = WS.Enemy.pool;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.active[i];
      if (e.boss && !seen.has(e)) { seen.add(e); ev('boss', e.displayName || (e.template && e.template.name) || e.type, Math.round(e.maxHealth)); }
    }
    if (run.time >= last.slow) {
      last.slow = run.time + SLOW;
      const F = L.f;
      let near = 0;
      for (let i = 0; i < pool.count; i++) {
        const e = pool.active[i];
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy < NEAR * NEAR) near++;
      }
      const t = Math.round(run.time);
      F.dt.push(t - last.t); last.t = t;
      // The lowest health since the last slice, so a dip between is not lost.
      F.hp.push(last.low); last.low = undefined;
      F.field.push(pool.count);
      F.near.push(near);
      F.dealt.push(q((run.damageDone || 0) - last.dealt)); last.dealt = run.damageDone || 0;
      F.taken.push(q((run.damageTaken || 0) - last.taken)); last.taken = run.damageTaken || 0;
      F.heal.push(q((run.healingDone || 0) - last.heal)); last.heal = run.healingDone || 0;
      F.kills.push((run.kills || 0) - last.kills); last.kills = run.kills || 0;
      F.mv.push(Math.round(last.mv / 8)); last.mv = 0;
      F.still.push(last.still); last.still = 0;
      const luck = Math.round((p.luck || 1) * 100) / 100;
      if (luck !== last.luck) { ev('luck', luck); last.luck = luck; }
    }

    // What changed in the build since the last second: ranks, evolutions,
    // unions, discoveries and blessings from any source (cards, reliquaries,
    // chests), without hooking each of them.
    const k = kit(p);
    for (const key of ['w', 'u', 'd', 'b']) if (k[key] !== last.kit[key]) ev('k' + key, kitDiff(last.kit[key], k[key]));
    last.kit = k;
    const marks = run.marks || [];
    while (last.marks < marks.length) { const mk = marks[last.marks++]; ev('fell', mk[2]); }
    const st = WS.Finale && WS.Finale.running && WS.Finale.running() ? WS.Finale.stage : null;
    if (st !== last.stage) { ev('finale', st || 'none'); last.stage = st; }
    if ((p.revives || 0) < last.revives) ev('revive');
    last.revives = p.revives || 0;
  }

  /** One meter row: what each source did since the last row. */
  function meters() {
    const L = RunLog.log, run = WS.Game.run;
    const tables = [run.landedByWeapon || run.damageByWeapon || {}, run.healingBySource || {}, L.taken];
    const row = [Math.round(run.time)];
    tables.forEach((tab, i) => {
      const keys = L.mk[i], was = last.meter[i], out = [];
      for (const [k, v] of Object.entries(tab)) if (v >= 1 && !keys.includes(k)) keys.push(k);
      for (const k of keys) { const d = (tab[k] || 0) - (was[k] || 0); out.push(q(d)); was[k] = tab[k] || 0; }
      while (out.length && !out[out.length - 1]) out.pop();
      row.push(out);
    });
    L.m.push(row);
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

  // One more of `kind` this minute, in the per-minute counts.
  function tally(what, kind) {
    const L = RunLog.log;
    if (!L) return;
    const t = (L.tally || (L.tally = {}))[what] || (L.tally[what] = {});
    const row = t[kind] || (t[kind] = []);
    const m = WS.floor(now() / 60);
    while (row.length <= m) row.push(0);
    row[m]++;
  }

  RunLog.pickup = function (kind) { if (kind !== 'coin') tally('got', kind); };

  /** A pickup put on the field (Pickup.spawn), whether or not it is ever
   *  collected: the drop rate is decided on these, not on what was picked up. */
  const DROPS = { bomb: 1, hourglass: 1, potion: 1, chest: 1, reliquary: 1, stone: 1, cache: 1 };
  RunLog.drop = function (kind) { if (DROPS[kind]) tally('drop', kind); };
  RunLog.note = function (...a) { ev(...a); };

  // The callings' tallies (Calling.count) and the like, read at the end.
  const COUNTERS = ['deathsSlain', 'executions', 'overflows', 'barriersBroken', 'eviscerates', 'marksClaimed', 'enrages',
    'rends', 'storms', 'waystones', 'ghoulBursts', 'revives'];

  RunLog.finish = function (reason) {
    const L = RunLog.log, G = WS.Game, run = G.run, p = G.player;
    if (!L || L.end || !run) return;
    if (p) { last.slow = 0; sample(); }
    meters();
    const size = (o) => Object.fromEntries(Object.entries(o || {}).filter((e) => e[1] >= 1).map(([k, v]) => [k, Math.round(v)]));
    L.end = {
      reason, time: r1(run.time), kills: run.kills || 0, level: p ? p.level : 0, score: run.score || 0,
      bosses: run.bossesSlain || 0, finale: !!run.finaleCleared,
      killedBy: run.killedBy || null, kit: p ? kit(p) : null,
      dealt: Math.round(run.damageDone || 0), taken: Math.round(run.damageTaken || 0),
      healed: Math.round(run.healingDone || 0), prevented: Math.round(run.damagePrevented || 0),
      maxHealth: p ? Math.round(p.maxHealth) : 0, faults: WS.faultCount ? WS.faultCount() : 0,
      luck: p ? Math.round((p.luck || 1) * 100) / 100 : 1,
      // Every blow at full size, overkill included, beside the landed meter.
      raw: Object.fromEntries(Object.entries(run.damageByWeapon || {}).filter((e) => e[1] >= 1).map(([k, v]) => [k, Math.round(v)])),
      overheal: Object.fromEntries(Object.entries(run.overhealBySource || {}).filter((e) => e[1] >= 1).map(([k, v]) => [k, Math.round(v)])),
      curdle: p ? Math.round(p.curdleDealt || 0) : 0,
      // The meter exactly, and the ground covered (px): the rows above are rounded.
      landed: size(run.landedByWeapon), heals: size(run.healingBySource),
      box: [Math.round(last.x0), Math.round(last.y0), Math.round(last.x1), Math.round(last.y1)],
      // The tagged parts of a source (wolves' pack bites and mauls, a ghoul's bursts...).
      parts: Object.fromEntries(Object.entries(run.partsBySource || {}).map(([k, t]) => [k,
        Object.fromEntries(Object.entries(t).map(([q, v]) => [q, Math.round(v)]))])),
      counters: Object.fromEntries(COUNTERS.filter((k) => run[k]).map((k) => [k, run[k]])),
    };
    try {
      const rep = WS.Runs.report();
      L.end.frames = rep.frames;
    } catch (e) { /* the record matters more than the frame figures */ }
    // Every finished night keeps its code, so a forgotten copy is not lost.
    const meta = { at: Date.now(), char: run.characterId, map: run.mapId, diff: run.difficulty,
      nightly: !!run.nightly, outcome: reason, time: r1(run.time), score: run.score || 0 };
    RunLog.code().then((text) => { if (text) RunLog.keep(Object.assign(meta, { code: text })); }).catch(() => {});
  };

  /* -------------------------------------------------------- kept codes --
     The last nights' codes, newest first, in their own storage key: a code
     runs to tens of kilobytes and has no business inside the account. */
  const KEPT_KEY = 'ember-watch-run-codes';
  const KEPT_CAP = 12;
  RunLog.kept = function () {
    try {
      const list = JSON.parse(localStorage.getItem(KEPT_KEY) || '[]');
      return Array.isArray(list) ? list.filter((e) => e && typeof e.code === 'string') : [];
    } catch (e) { return []; }
  };
  RunLog.keep = function (entry) {
    let list = RunLog.kept();
    list.unshift(entry);
    list = list.slice(0, KEPT_CAP);
    // If the browser runs out of room, drop the oldest until it fits.
    while (list.length) {
      try { localStorage.setItem(KEPT_KEY, JSON.stringify(list)); return true; } catch (e) { list.pop(); }
    }
    return false;
  };
  RunLog.forget = function () { try { localStorage.removeItem(KEPT_KEY); } catch (e) { /* nothing kept */ } };

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
  /* After a pick, the passives and blessings as they now stand: what the
     card did there is the pick itself, so the next sample records only what
     changed them some other way (a chest, a reliquary). Weapons are left to
     the sample: their changes are short, and evolutions and unions are read
     from them. */
  function settle() {
    if (!RunLog.log || !last || !G.player) return;
    const k = kit(G.player);
    last.kit.u = k.u; last.kit.b = k.b;
  }
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
  // A pick is its place in the hand when it came from it (the hand is kept
  // whole), or the card itself when it did not (an auto-taken Breaking Point).
  wrap('chooseLevelUp', function (choice) {
    const hand = this.levelChoices || [], i = hand.indexOf(choice);
    ev('pick', i >= 0 ? i : tok(choice), hand.map(tok).join(','));
  }, settle);
  wrap('offerBlessing', null, function () { if (this.blessingChoices) ev('boffer', this.blessingChoices.map(tok).join(',')); });
  wrap('chooseBlessing', (choice) => ev('bpick', tok(choice)), settle);
  wrap('tick', null, () => RunLog.tick());
  // After the run is recorded, so the score is in it.
  wrap('endRun', null, (out, reason) => RunLog.finish(reason));

  const spawnPickup = WS.Pickup.spawn;
  WS.Pickup.spawn = function (kind) {
    try { RunLog.drop(kind); } catch (e) { /* never break play */ }
    return spawnPickup.apply(this, arguments);
  };

  WS.RunLog = RunLog;

})(window.WS);
