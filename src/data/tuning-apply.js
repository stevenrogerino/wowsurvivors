/* The tuning layer.
 *
 * Every number, name and description in the game lives in the data files
 * beside this one, and those files are the SHIPPED values - they are never
 * edited by the tuning bench and never contain a player's local changes. What
 * the bench writes instead is src/data/tuning.js: a flat list of overrides,
 * keyed by a dotted path, applied over the top on load.
 *
 * Keeping the two apart is what makes the whole thing safe to use. Shipped
 * defaults survive every tuning pass, so "reset to shipped" is real rather
 * than a promise; a git diff of a tuning session is one small file rather than
 * a hundred scattered edits; and the changelog is free, because a change is
 * exactly the difference between the value at a path and the value shipped at
 * that path.
 *
 *   'Weapons.cinderfall.damage': 22
 *   'Enemies.wolf.name': 'Dire Longtooth'
 *   'Maps.thornhollow.phases.2.interval': 0.8
 *
 * Paths are resolved against a fixed table of roots and refuse to walk into
 * anything else - a tuning file is data, and data that can reach __proto__ is
 * not data any more.
 */
'use strict';
(function (WS) {

  // The only roots a tuning path may start from.
  /* Every root a tuning path may start from. The last two are not data files
   * but are unambiguously tuning: CONST holds the global damage/speed scalars
   * and the pool ceilings, and Arena.tuning is the entire Eclipse Arena fight.
   * Both were reachable from nowhere until the bench went looking for what it
   * could not edit. A root is written as a path so a table can live inside a
   * system rather than only at the top level. */
  const ROOTS = ['Config', 'CONST', 'Characters', 'Weapons', 'Unions', 'Enemies',
    'Elites', 'Bosses', 'Maps', 'Upgrades', 'MetaUpgrades', 'Blessings',
    'Combos', 'Achievements', 'Lore', 'Arena.tuning'];
  /* A Set, not an object literal. `{ __proto__: 1 }` does not create a key
   * called __proto__ - it sets the object's prototype - so the literal form of
   * this list silently failed to contain the one name it exists to catch, and
   * 'Weapons.__proto__.anything' walked straight through to Object.prototype.
   * The bench's own check found it. */
  const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

  const T = WS.Tuning = WS.Tuning || {};
  T.overrides = T.overrides || {};
  T.roots = ROOTS;
  /** path -> the value that was there before any override touched it. */
  T.shipped = Object.create(null);

  /** Walks a dotted path to its owning container. Returns null for anything
   *  that is not a real, reachable, permitted location. */
  function locate(path) {
    if (typeof path !== 'string' || !path) return null;
    // The longest matching root wins, so 'Arena.tuning' is one root rather
    // than a walk into WS.Arena that any path could have taken.
    let root = null;
    for (const r of ROOTS) {
      if ((path === r || path.startsWith(r + '.')) && (!root || r.length > root.length)) root = r;
    }
    if (!root) return null;
    const parts = [root].concat(path.slice(root.length + 1).split('.'));
    if (parts.length < 2 || parts[1] === '') return null;
    let node = root.split('.').reduce((o, k) => (o == null ? o : o[k]), WS);
    for (let i = 1; i < parts.length - 1; i++) {
      const k = parts[i];
      if (FORBIDDEN.has(k)) return null;
      if (node === null || typeof node !== 'object') return null;
      node = node[k];
    }
    const key = parts[parts.length - 1];
    if (FORBIDDEN.has(key)) return null;
    if (node === null || typeof node !== 'object') return null;
    return { node, key };
  }

  /** The value currently at a path, or undefined if it is not a real path. */
  T.read = function (path) {
    const at = locate(path);
    return at ? at.node[at.key] : undefined;
  };

  /** What the game ships at this path, whatever has been done to it since. */
  T.shippedValue = function (path) {
    return Object.prototype.hasOwnProperty.call(this.shipped, path)
      ? this.shipped[path] : this.read(path);
  };

  /** Writes a value and records the override. Returns false if the path is
   *  not somewhere a tuning file is allowed to reach. */
  T.set = function (path, value) {
    const at = locate(path);
    if (!at) return false;
    if (!Object.prototype.hasOwnProperty.call(this.shipped, path)) {
      this.shipped[path] = at.node[at.key];
    }
    at.node[at.key] = value;
    this.overrides[path] = value;
    return true;
  };

  /** Puts one path back to the shipped value and drops the override. */
  T.clear = function (path) {
    if (Object.prototype.hasOwnProperty.call(this.shipped, path)) {
      const at = locate(path);
      if (at) at.node[at.key] = this.shipped[path];
    }
    delete this.overrides[path];
  };

  /** Puts everything back. */
  T.clearAll = function () {
    for (const path of Object.keys(this.overrides)) this.clear(path);
  };

  /** Every override that actually differs from the shipped value, as
   *  {path, from, to} - the raw material for patch notes. */
  T.diff = function () {
    const out = [];
    for (const path of Object.keys(this.overrides)) {
      const from = this.shippedValue(path), to = this.overrides[path];
      if (JSON.stringify(from) !== JSON.stringify(to)) out.push({ path, from, to });
    }
    return out.sort((a, b) => (a.path < b.path ? -1 : 1));
  };

  /** Applies the loaded overrides. Called once, from main.js, after every
   *  data file is in place and before anything reads them. An override
   *  pointing at a path that no longer exists - a weapon that was renamed or
   *  removed since the tuning was written - is dropped and reported rather
   *  than silently doing nothing. */
  T.apply = function () {
    const stale = [];
    const wanted = this.overrides;
    this.overrides = {};
    for (const path of Object.keys(wanted)) {
      if (!this.set(path, wanted[path])) stale.push(path);
    }
    this.stale = stale;
    if (stale.length && window.console) {
      console.warn('tuning: ' + stale.length + ' override(s) point at paths that no '
        + 'longer exist and were skipped: ' + stale.slice(0, 6).join(', '));
    }
    return stale;
  };

  /* Applied here, at load, rather than from boot(). Every data file is in
   * place by now and nothing downstream has run yet, so there is no window in
   * which some other script could read a shipped value that tuning was about
   * to change. */
  T.apply();

})(window.WS);
