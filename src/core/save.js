/* Persistence. One localStorage key holds the whole account: banked gold,
 * unlocks, Trainer ranks, settings, statistics, and the discovery codex.
 * Schema is versioned; an unknown version is merged onto the defaults rather
 * than discarded, so a save from an older build keeps its gold. */
'use strict';
(function (WS) {

  const KEY = 'wowsurvivors2.save.v1';
  const SCHEMA = 1;

  function defaults() {
    return {
      schema: SCHEMA,
      gold: 0,
      hyperArmed: false,
      // Set the first time the manual is closed, so the primer greets a new
      // player once and never interrupts a returning one.
      seenManual: false,
      meta: {},
      unlocks: {
        characters: { mage: true, priest: true },
        maps: { elwynn: true },
        hyper: {},
      },
      achievements: {},
      combos: {},          // discovery codex
      settings: Object.assign({}, WS.Config.defaultSettings),
      statistics: {
        totalKills: 0,
        totalGold: 0,
        totalRuns: 0,
        totalVictories: 0,
        totalTime: 0,
        gemsCollected: 0,
        bestRunTime: 0,
        bestLevel: 0,
        bestBossesInRun: 0,
        bestNoHitStreak: 0,
        bestDamage: 0,
        maxWeapons: 0,
        evolutions: 0,
        unions: 0,
        coffinsOpened: 0,
        runebladesClaimed: 0,
        warglaivesClaimed: 0,
        bestTime: {},      // per map
        bosses: {},        // bossId -> kills
        families: {},      // family -> kills
        bestiary: {},      // enemyId -> kills
      },
    };
  }

  const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  /** Fills missing keys from `src` into `dst` AND enforces `src`'s types.
   *
   *  This only filled gaps, which is a different and much weaker promise than
   *  it looked like: a key that was PRESENT was trusted no matter what it
   *  held. A save carrying `"gold": "lots"` therefore sailed through, and the
   *  string went straight into the arithmetic - measured result, a player with
   *  NaN health, NaN damage and no way back, because every later write
   *  persisted the NaN. It does not take malice to get there; a half-written
   *  localStorage entry, a hand-edited save or a schema that moved underneath
   *  an old one all land in the same place.
   *
   *  So the defaults are treated as the schema they already are: anything
   *  whose type disagrees with its default, or any number that is not finite,
   *  is replaced by the default rather than trusted. Nothing here can throw,
   *  because the alternative to a repaired save is a player who cannot start
   *  the game at all. */
  function merge(dst, src) {
    for (const k of Object.keys(src)) {
      const want = src[k], have = dst[k];
      if (isPlain(want)) {
        if (!isPlain(have)) dst[k] = clone(want);
        else merge(have, want);
      } else if (have === undefined || have === null || typeof have !== typeof want
        || (typeof want === 'number' && !Number.isFinite(have))) {
        dst[k] = want;
      }
    }
    return dst;
  }

  /* The open-ended maps, which have no per-key default to check against: the
   * codex records whatever it has seen, so its SHAPE is the only contract
   * there is. Each is swept for values of the wrong kind, and the bad entries
   * are dropped rather than the whole map, so one junk row cannot cost a
   * player their bestiary. */
  function scrubMap(map, kind) {
    if (!isPlain(map)) return {};
    for (const k of Object.keys(map)) {
      const v = map[k];
      if (kind === 'count') {
        if (!Number.isFinite(v) || v < 0) delete map[k];
        else map[k] = WS.floor(v);
      } else if (!(v === true || v === false)) {
        delete map[k];
      }
    }
    return map;
  }

  function sanitize(db) {
    db.gold = WS.max(0, WS.floor(db.gold));
    const s = db.statistics;
    for (const k of Object.keys(s)) {
      if (typeof s[k] === 'number') s[k] = WS.max(0, s[k]);
    }
    s.bestiary = scrubMap(s.bestiary, 'count');
    s.bosses = scrubMap(s.bosses, 'count');
    s.families = scrubMap(s.families, 'count');
    s.bestTime = scrubMap(s.bestTime, 'count');
    db.achievements = scrubMap(db.achievements, 'flag');
    db.combos = scrubMap(db.combos, 'flag');
    db.unlocks.characters = scrubMap(db.unlocks.characters, 'flag');
    db.unlocks.maps = scrubMap(db.unlocks.maps, 'flag');
    db.unlocks.hyper = scrubMap(db.unlocks.hyper, 'flag');

    // Trainer ranks are the one place a bad number buys real power, so they
    // are clamped to what each upgrade actually offers rather than trusted.
    if (!isPlain(db.meta)) db.meta = {};
    // save.js is defined before the data tables, so read the table through the
    // namespace at call time rather than closing over it.
    const META = WS.MetaUpgrades || {};
    for (const id of Object.keys(db.meta)) {
      const m = META[id];
      const rank = db.meta[id];
      if (!m || !Number.isFinite(rank) || rank <= 0) delete db.meta[id];
      else db.meta[id] = WS.clamp(WS.floor(rank), 0, m.max);
    }

    // Settings the player can reach through the UI, kept inside their ranges.
    const st = db.settings;
    st.effectsVolume = WS.clamp(st.effectsVolume, 0, 1);
    st.musicVolume = WS.clamp(st.musicVolume, 0, 1);
    if (!WS.Config.difficulties[st.difficulty]) st.difficulty = 'veteran';
    if (st.hudLayout !== 'strip' && st.hudLayout !== 'rail') st.hudLayout = 'strip';
    if (st.quality !== 'high' && st.quality !== 'balanced') st.quality = 'high';

    // The starting roster is a floor, not a stored fact: a save that lost it
    // would otherwise leave the player with nothing they are allowed to play.
    db.unlocks.characters.mage = true;
    db.unlocks.characters.priest = true;
    db.unlocks.maps.elwynn = true;
    return db;
  }

  WS.Save = {
    db: null,

    load() {
      let raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
      let data = null;
      if (raw) { try { data = JSON.parse(raw); } catch (e) { data = null; } }
      // A save that parses to a non-object - `null`, `7`, `"[]"` - is not a
      // save. merge() would otherwise write the defaults onto a primitive and
      // hand back something that is not a database.
      if (!isPlain(data)) data = {};
      this.db = sanitize(merge(data, defaults()));
      this.db.schema = SCHEMA;
      return this.db;
    },

    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.db)); } catch (e) { /* quota / blocked */ }
    },

    reset() {
      this.db = defaults();
      this.save();
    },

    /** Unlocks everything, for showcasing the whole roster. */
    unlockAll() {
      for (const id of WS.CharacterOrder) this.db.unlocks.characters[id] = true;
      for (const id of WS.MapOrder) this.db.unlocks.maps[id] = true;
      this.save();
    },

    get settings() { return this.db.settings; },
    get stats() { return this.db.statistics; },

    isCharacterUnlocked(id) { return !!this.db.unlocks.characters[id]; },
    isMapUnlocked(id) { return !!this.db.unlocks.maps[id]; },

    addGold(n) {
      this.db.gold += n;
      this.db.statistics.totalGold += n;
    },

    metaRank(id) { return this.db.meta[id] || 0; },

    /** Cost of the NEXT rank; null once the upgrade is maxed. */
    metaCost(id) {
      const m = WS.MetaUpgrades[id];
      const rank = this.metaRank(id);
      if (rank >= m.max) return null;
      return m.cost * (rank + 1);
    },

    buyMeta(id) {
      const cost = this.metaCost(id);
      if (cost === null || this.db.gold < cost) return false;
      this.db.gold -= cost;
      this.db.meta[id] = this.metaRank(id) + 1;
      this.save();
      return true;
    },

    recordKill(template, id) {
      const s = this.db.statistics;
      s.totalKills++;
      if (template.family) s.families[template.family] = (s.families[template.family] || 0) + 1;
      if (id) s.bestiary[id] = (s.bestiary[id] || 0) + 1;
    },

    discoverCombo(id) {
      if (this.db.combos[id]) return false;
      this.db.combos[id] = true;
      this.save();
      return true;
    },
  };

})(window.WS);
