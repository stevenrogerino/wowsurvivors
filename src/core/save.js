/* Persistence. One localStorage key holds the whole account: banked gold,
 * unlocks, Trainer ranks, settings, statistics, and the discovery codex.
 * Schema is versioned; an unknown version is merged onto the defaults rather
 * than discarded, so a save from an older build keeps its gold. */
'use strict';
(function (WS) {

  /* The storage key is deliberately NOT the game's display name.
   *
   * A key is an address, not a title. Every player who has ever launched this
   * build has their account sitting at this exact string, and renaming it to
   * follow a change of title would strand all of them - so it stays put, and
   * it stays put through every future rename too. Only the words on screen
   * change; the drawer they are kept in does not. */
  const KEY = 'emberwatch.save.v1';
  const LEGACY_KEY = 'wowsurvivors2.save.v1';
  const SCHEMA = 2;

  /* The rename, carried across a save.
   *
   * Schema 1 stored zones, creatures, bosses, discoveries and achievements
   * under the names the game used before the rename, and those names
   * are the KEYS of the codex - so a straight rename would have silently
   * emptied every bestiary count, every personal best and every unlock a
   * player had earned. Nobody should pay for our vocabulary changing.
   *
   * So schema 2 rewrites the keys it recognises and leaves anything it does
   * not alone: an unknown id is dropped by sanitize() later rather than
   * guessed at. The legacy localStorage entry is read once and then left
   * where it is, untouched, because a migration that deletes the only copy of
   * the thing it is migrating has no way back if it is wrong. */
  /* == legacy-name map: begin ==
   * Everything between these markers names the pre-rename vocabulary,
   * because rewriting a key requires saying what it used to be. This is a
   * compatibility shim, not content: none of it is ever shown to a player,
   * and it exists solely so nobody loses a codex they filled in. The
   * provenance guard skips exactly this region and counts what it skipped,
   * so the exemption is bounded and visible rather than a blanket pardon. */
  const RENAMED = {
    maps: {
      elwynn: 'thornhollow', westfall: 'dustreach', duskwood: 'mourneholt',
      barrens: 'ochre', icecrown: 'palewastes',
    },
    characters: { death_knight: 'graveblade', demon_hunter: 'ruinseeker' },
    bestiary: {
      kobold: 'lampling', murloc: 'gilkin', murloc_oracle: 'gilkin_tidecaller',
      gnoll: 'mongrel', defias: 'kerchief', defias_pillager: 'kerchief_pillager',
      harvest_golem: 'harvest_reaper', knuckleduster: 'bruiser', worgen: 'moonwretch',
      plainstrider: 'longstrider', quilboar: 'bristlekin', harpy: 'shrikewing',
      centaur: 'karrash', scourge_ghoul: 'pale_ghoul',
      riverpaw_bonesnapper: 'snarlpack_bonesnapper', defias_enforcer: 'kerchief_enforcer',
      kolkar_battlelord: 'karrash_battlelord',
    },
    families: {
      kobold: 'lampling', murloc: 'gilkin', gnoll: 'mongrel', defias: 'kerchief',
      worgen: 'moonwretch', quilboar: 'bristlekin', harpy: 'shrikewing',
      centaur: 'karrash',
    },
    bosses: { duskwraith: 'palewraith' },
    combos: {
      windseeker: 'tempest_pact', divine_storm: 'radiant_gyre',
      windrunner: 'truestrike', seal_command: 'verdict', defile: 'curdle',
    },
    achievements: { scourge_of_the_masses: 'bane_of_the_masses', mrglglgl: 'blorp' },
  };
  /* == legacy-name map: end == */

  /** Rewrites the keys of one map in place, keeping the larger value when two
   *  old ids collapse onto one new one. */
  function renameKeys(map, table) {
    if (!isPlain(map)) return map;
    for (const [from, to] of Object.entries(table)) {
      if (!(from in map)) continue;
      const incoming = map[from];
      delete map[from];
      if (to in map && typeof incoming === 'number' && typeof map[to] === 'number') {
        map[to] = WS.max(map[to], incoming);
      } else if (!(to in map)) {
        map[to] = incoming;
      }
    }
    return map;
  }

  function migrate(db) {
    if (db.schema >= SCHEMA) return db;
    const s = db.statistics || {};
    renameKeys(db.unlocks && db.unlocks.maps, RENAMED.maps);
    renameKeys(db.unlocks && db.unlocks.hyper, RENAMED.maps);
    renameKeys(s.bestTime, RENAMED.maps);
    renameKeys(db.unlocks && db.unlocks.characters, RENAMED.characters);
    renameKeys(s.bestiary, RENAMED.bestiary);
    renameKeys(s.families, RENAMED.families);
    renameKeys(s.bosses, RENAMED.bosses);
    renameKeys(db.combos, RENAMED.combos);
    renameKeys(db.achievements, RENAMED.achievements);
    // Two statistics were renamed alongside the items they count.
    if (s.runebladesClaimed !== undefined && s.gravebladesClaimed === undefined) {
      s.gravebladesClaimed = s.runebladesClaimed;
    }
    if (s.warglaivesClaimed !== undefined && s.glaivesClaimed === undefined) {
      s.glaivesClaimed = s.warglaivesClaimed;
    }
    return db;
  }

  function defaults() {
    return {
      schema: SCHEMA,
      gold: 0,
      hyperArmed: false,
      // Set the first time the manual is closed, so the primer greets a new
      // player once and never interrupts a returning one.
      seenManual: false,
      // Same rule for the prologue, which runs before it: once, unprompted,
      // and thereafter only when somebody asks for it from the menu.
      seenPrologue: false,
      meta: {},
      unlocks: {
        characters: { mage: true, priest: true },
        maps: { thornhollow: true },
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
        gravebladesClaimed: 0,
        glaivesClaimed: 0,
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
    db.unlocks.maps.thornhollow = true;
    return db;
  }

  WS.Save = {
    db: null,

    load() {
      let raw = null;
      try {
        raw = localStorage.getItem(KEY);
        // Nothing at our key? Look for one from before the rename, and adopt
        // it rather than greeting a returning player with an empty account.
        if (raw === null) raw = localStorage.getItem(LEGACY_KEY);
      } catch (e) { /* private mode */ }
      let data = null;
      if (raw) { try { data = JSON.parse(raw); } catch (e) { data = null; } }
      // A save that parses to a non-object - `null`, `7`, `"[]"` - is not a
      // save. merge() would otherwise write the defaults onto a primitive and
      // hand back something that is not a database.
      if (!isPlain(data)) data = {};
      // Migrate BEFORE the defaults are merged in: renameKeys must see the old
      // keys on their own, not sitting beside freshly-defaulted new ones.
      this.db = sanitize(merge(migrate(data), defaults()));
      this.db.schema = SCHEMA;
      return this.db;
    },

    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.db));
        this.lastWrite = Date.now();
      } catch (e) { /* quota / blocked */ }
    },

    lastWrite: 0,

    /** Write the account out now, wherever we are.
     *
     *  Gold, kills and statistics are credited to the account the instant they
     *  happen - a coin picked up is already `db.gold` - but for a long time
     *  nothing carried that to disk except a handful of opportunistic calls:
     *  the end of a run, an achievement firing, a story pickup. Measured on a
     *  five-minute run, 2500 gold and 439 kills existed only in memory. Close
     *  the tab, take a phone call, let the browser reap a background tab, and
     *  a half-hour run was worth nothing.
     *
     *  A full account is 2.5KB and a write costs 0.1ms at the 95th percentile,
     *  so there is no case for being clever about it. Write often, write on
     *  the way out, and never make a player wonder whether their run counted. */
    flush() { this.save(); },

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
