/* Runs, remembered: the score a night is worth, the ledger of past nights,
 * the records they set, the Nightly (one seeded run a day, the same for
 * everyone), the Oaths a survivor swore, and the report a tester sends when
 * something goes wrong.
 *
 * None of this changes how a run plays unless an Oath is sworn or the run is
 * the Nightly. It reads the run as it ends and writes to the save. */
'use strict';
(function (WS) {

  const Runs = {};
  const HISTORY_CAP = 60;

  /* ---------------------------------------------------------- the score -- */
  /* What a night is worth. Time held is most of it, then what was put down,
   * then what the night ended in; and all of it scales with how hard the
   * night was set to be - the battlefield, the difficulty, Hyper and every
   * Oath sworn. Two runs of the same length on the same field only differ by
   * what they killed and how they ended, which is the comparison a player
   * actually wants to make. */
  const DIFF_MULT = { beginner: 0.75, veteran: 1, professional: 1.5 };

  Runs.multiplier = function (run) {
    const d = DIFF_MULT[run.difficulty] || 1;
    const hyper = run.hyper ? 1.5 : 1;
    const field = run.map && run.map.difficulty ? run.map.difficulty : 1;
    return d * hyper * field * (run.oathMult || 1);
  };

  Runs.score = function (run, outcome) {
    if (!run) return 0;
    let base = WS.floor(run.time) * 10 + (run.kills || 0) + (run.bossesSlain || 0) * 400
      + (run.deathsSlain || 0) * 1500;
    if (run.victorious) base += 5000;
    if (run.finaleCleared && !run.finaleRetries) base += 10000;
    if (outcome === 'arena_victory') base += 15000;
    return WS.floor(base * Runs.multiplier(run));
  };

  /* ------------------------------------------------------------- oaths --- */
  /** Every sworn oath's value for `key`, multiplied together; 1 when none. */
  Runs.oath = function (key) {
    const run = WS.Game && WS.Game.run;
    if (!run || !run.oaths || !run.oaths.length) return 1;
    let v = 1;
    for (const id of run.oaths) {
      const o = WS.Oaths[id];
      if (o && o.mods[key] !== undefined) v *= o.mods[key];
    }
    return v;
  };

  /** Oaths open once any battlefield has been held to dawn. */
  Runs.oathsOpen = function () {
    return (WS.Save.stats.totalVictories || 0) > 0;
  };

  Runs.armedOaths = function () {
    const db = WS.Save.db;
    return WS.OathOrder.filter((id) => db.oaths && db.oaths[id]);
  };

  Runs.oathMult = function (ids) {
    let m = 1;
    for (const id of ids) if (WS.Oaths[id]) m += WS.Oaths[id].bonus;
    return m;
  };

  /** Called by Enemy.spawn and Finale.unit once a hostile's stats are set. */
  Runs.applyToEnemy = function (e, statsOnly) {
    const run = WS.Game && WS.Game.run;
    if (!run || !run.oaths || !run.oaths.length) return;
    let hp = Runs.oath('hp');
    if (e.boss || e.finaleTag) hp *= Runs.oath('bossHp');
    if (hp !== 1) { e.maxHealth = WS.floor(e.maxHealth * hp); e.health = e.maxHealth; }
    const dmg = Runs.oath('dmg');
    if (dmg !== 1) e.damage *= dmg;
    const sp = Runs.oath('speed');
    if (!statsOnly && sp !== 1 && !e.stationary) e.speed *= sp;
  };

  /* ---------------------------------------------------------- the Nightly -- */
  /* One run a day, the same for everyone who plays it: the battlefield, the
   * survivor, two Oaths, and the draft - every blessing and level-up offer is
   * dealt from the day's own stream, so two players who pick the same cards
   * are offered the same cards. The horde itself is not seeded; it answers to
   * how you play, which is the part a daily is testing.
   *
   * It lends the survivor and the battlefield, so the Nightly opens with the
   * Oaths (one night held to dawn) rather than on the first launch. */
  Runs.dayKey = function (d) {
    const t = d || new Date();
    return t.toISOString().slice(0, 10);
  };

  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h || 1;
  }

  Runs.nightly = function (key) {
    const day = key || Runs.dayKey();
    const seed = hash('ember-watch:' + day);
    const holder = { s: seed };
    return WS.withStream(holder, () => {
      const maps = WS.MapOrder.filter((id) => WS.Maps[id] && !WS.Maps[id].arena);
      const chars = Object.keys(WS.Characters);
      const map = maps[WS.floor(WS.random() * maps.length)];
      const character = chars[WS.floor(WS.random() * chars.length)];
      const pool = WS.OathOrder.slice();
      WS.shuffle(pool);
      const oaths = pool.slice(0, 2).sort((a, b) => WS.OathOrder.indexOf(a) - WS.OathOrder.indexOf(b));
      return { day, seed, map, character, oaths, difficulty: 'veteran', draft: (seed ^ 0x5bd1e995) >>> 0 };
    });
  };

  Runs.nightlyBest = function (day) {
    const n = WS.Save.db.nightly;
    return n && n.day === (day || Runs.dayKey()) ? n : null;
  };

  /* ------------------------------------------------------ the ledger ------ */
  function topWeapon(run) {
    let top = null, most = 0;
    for (const [id, v] of Object.entries(run.damageByWeapon || {})) if (v > most) { most = v; top = id; }
    return top;
  }

  /** Called once, from Game.endRun. Returns the entry it wrote. */
  Runs.record = function (run, player, outcome) {
    const db = WS.Save.db;
    const score = Runs.score(run, outcome);
    run.score = score;
    const entry = {
      at: Date.now(), map: run.mapId, char: run.characterId, diff: run.difficulty || 'veteran',
      hyper: !!run.hyper, oaths: (run.oaths || []).slice(), nightly: run.nightly ? run.nightly.day : null,
      outcome, time: WS.floor(run.time), kills: run.kills || 0, bosses: run.bossesSlain || 0,
      level: player ? player.level : 0, finale: !!run.finaleCleared, retried: !!run.finaleRetries,
      top: topWeapon(run), score,
    };
    db.history = Array.isArray(db.history) ? db.history : [];
    db.history.unshift(entry);
    if (db.history.length > HISTORY_CAP) db.history.length = HISTORY_CAP;

    // Records survive the ledger's cap: best score per battlefield and per survivor.
    db.records = db.records && typeof db.records === 'object' ? db.records : { map: {}, char: {} };
    const rec = db.records;
    rec.map = rec.map || {}; rec.char = rec.char || {};
    const beat = (table, key) => {
      const cur = table[key];
      if (!cur || score > cur.score) { table[key] = { score, at: entry.at, map: entry.map, char: entry.char }; return true; }
      return false;
    };
    entry.bestMap = beat(rec.map, entry.map);
    entry.bestChar = beat(rec.char, entry.char);

    if (run.nightly) {
      const n = db.nightly;
      const tries = n && n.day === run.nightly.day ? (n.tries || 0) + 1 : 1;
      const best = n && n.day === run.nightly.day ? n.score : -1;
      db.nightly = { day: run.nightly.day, tries, score: WS.max(best, score),
        time: score >= best ? entry.time : n.time, map: entry.map, char: entry.char };
      entry.bestNightly = score > best;
    }
    WS.Save.save();
    return entry;
  };

  /** The line a player pastes to show off the Nightly. */
  Runs.shareLine = function (entry) {
    const m = WS.Maps[entry.map], c = WS.Characters[entry.char];
    return `The Ember Watch · Nightly ${entry.nightly} · ${m ? m.name : entry.map} · `
      + `${c ? c.name : entry.char} · ${WS.formatTime(entry.time)} · ${WS.formatNumber(entry.score)}`;
  };

  /* ------------------------------------------------------ the report ------ */
  /* What a tester sends when something is wrong. Everything needed to put
   * the same survivor with the same kit on the same field in the balance
   * lab, plus how the frames were going and any errors the page threw. */
  const frameLog = [];
  const errors = [];
  Runs.noteFrame = function (ms) {
    frameLog.push(ms);
    if (frameLog.length > 600) frameLog.shift();
  };
  Runs.noteError = function (msg) {
    errors.push({ at: Date.now(), msg: String(msg).slice(0, 300) });
    if (errors.length > 20) errors.shift();
  };
  window.addEventListener('error', (e) => Runs.noteError(e.message || e));
  window.addEventListener('unhandledrejection', (e) => Runs.noteError((e.reason && e.reason.message) || e.reason));

  function pct(a, p) {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y);
    return +s[WS.min(s.length - 1, WS.floor(s.length * p))].toFixed(1);
  }

  Runs.report = function (note) {
    const G = WS.Game, run = G.run, p = G.player;
    const out = {
      kind: 'ember-watch-report', v: 1, at: new Date().toISOString(), note: note || '',
      agent: navigator.userAgent, screen: [screen.width, screen.height, window.devicePixelRatio || 1],
      view: [window.innerWidth, window.innerHeight],
      settings: Object.assign({}, WS.Save.settings),
      frames: { n: frameLog.length, p50: pct(frameLog, 0.5), p90: pct(frameLog, 0.9), p99: pct(frameLog, 0.99),
        worst: frameLog.length ? +WS.max(...frameLog).toFixed(1) : 0 },
      resolution: WS.Renderer && WS.Renderer.renderScale !== undefined ? WS.Renderer.renderScale : null,
      faults: WS.faultCount ? WS.faultCount() : 0,
      errors: errors.slice(),
    };
    if (run && p) {
      out.run = {
        map: run.mapId, char: run.characterId, diff: run.difficulty, hyper: !!run.hyper,
        oaths: run.oaths || [], nightly: run.nightly ? run.nightly.day : null, state: G.state,
        time: +run.time.toFixed(1), level: p.level, kills: run.kills, field: WS.Enemy.pool.count,
        finale: WS.Finale.running() ? WS.Finale.stage : null, seed: WS.getSeed(),
      };
      out.kit = {
        weapons: p.weapons.map((w) => ({ id: w.id, level: w.level, evolved: !!w.evolved })),
        upgrades: Object.assign({}, p.upgradeLevels),
        blessings: Object.keys(p.blessingsTaken || {}),
        stats: {
          maxHealth: p.maxHealth, armor: p.armor, damageMultiplier: p.damageMultiplier,
          cooldownMultiplier: p.cooldownMultiplier, areaMultiplier: p.areaMultiplier,
          projectileBonus: p.projectileBonus, critChance: p.critChance, critDamage: p.critDamage,
          moveSpeed: p.moveSpeed, dodgeChance: p.dodgeChance, revives: p.revives,
        },
      };
    }
    return out;
  };

  /* ------------------------------------------------ the Nightly's draft --- */
  /* Level-up and blessing offers come from the run's own stream when it has
   * one, so the Nightly deals everyone the same hand for the same picks. */
  for (const k of ['buildChoices', 'buildBlessingChoices']) {
    const f = WS.LevelUp[k];
    WS.LevelUp[k] = function (p) {
      const r = WS.Game && WS.Game.run;
      return r && r.draft ? WS.withStream(r.draft, () => f.call(this, p)) : f.call(this, p);
    };
  }

  WS.Runs = Runs;

})(window.WS);
