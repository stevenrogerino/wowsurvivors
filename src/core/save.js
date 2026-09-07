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

  /** Recursively fills missing keys from `src` into `dst`. */
  function merge(dst, src) {
    for (const k of Object.keys(src)) {
      if (dst[k] === undefined || dst[k] === null) {
        dst[k] = (typeof src[k] === 'object' && !Array.isArray(src[k]))
          ? JSON.parse(JSON.stringify(src[k])) : src[k];
      } else if (typeof src[k] === 'object' && !Array.isArray(src[k]) && typeof dst[k] === 'object') {
        merge(dst[k], src[k]);
      }
    }
    return dst;
  }

  WS.Save = {
    db: null,

    load() {
      let raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
      let data = null;
      if (raw) { try { data = JSON.parse(raw); } catch (e) { data = null; } }
      this.db = merge(data || {}, defaults());
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
