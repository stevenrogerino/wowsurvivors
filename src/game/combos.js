/* Discoveries: the moment a survivor carries both weapons of a pair, the combo
 * activates for the run, toasts, and is written into the permanent codex. */
'use strict';
(function (WS) {

  const ComboSystem = {};

  /* A UNION KEEPS ITS DISCOVERIES.
   *
   * A discovery is written onto its weapons' mods, and a union deletes its
   * two source weapons - so every discovery either of them was part of used
   * to vanish with them, including ones with a third weapon (Storm of Steel
   * takes Volley, and Truestrike lived on Volley). That made finding a
   * discovery a waste of a pick for anyone heading for a union.
   *
   * Now a union STANDS IN for the two weapons it was forged from. Every
   * discovery they were part of is applied to the union - its source's half
   * only; the partner weapon already carries its own half - and one found
   * later is found against the union as if the source were still there
   * (forge Stormcall, then take Dawnpulse: Radiant Gyre). Every union was
   * checked against every discovery it can inherit; each reads what it is
   * handed (Firmament's strikes now count Celestial Alignment's extra beam). */

  /** The weapon that answers to `id`: the weapon itself, or the union that
   *  was forged from it. */
  ComboSystem.find = function (p, id) {
    const w = WS.Player.getWeapon(p, id);
    if (w) return w;
    for (const u of p.weapons) if (u.standsFor && u.standsFor.includes(id)) return u;
    return null;
  };

  /** The discoveries a union forged from `from` would carry: names, for the
   *  card. */
  ComboSystem.carried = function (p, from) {
    return WS.ComboOrder.filter((id) => p.combosActive[id]
      && WS.Combos[id].weapons.some((w) => from.includes(w))).map((id) => WS.Combos[id].name);
  };

  /** Forging: hand the union every active discovery its sources held. Call
   *  after the union weapon exists, before or after its sources have gone. */
  ComboSystem.inherit = function (p, union, from) {
    union.standsFor = from.slice();
    const kept = [];
    for (const id of WS.ComboOrder) {
      if (!p.combosActive[id]) continue;
      const c = WS.Combos[id];
      const [a, b] = c.weapons;
      if (!from.includes(a) && !from.includes(b)) continue;
      // The union takes the source's side; a partner that is still in hand
      // already has its own side, so it gets a blank to write into.
      c.apply(from.includes(a) ? union : { mods: {} }, from.includes(b) ? union : { mods: {} }, c);
      kept.push(c.name);
    }
    return kept;
  };

  ComboSystem.check = function (p) {
    for (const id of WS.ComboOrder) {
      if (p.combosActive[id]) continue;
      const combo = WS.Combos[id];
      const w1 = ComboSystem.find(p, combo.weapons[0]);
      const w2 = ComboSystem.find(p, combo.weapons[1]);
      if (!w1 || !w2) continue;

      p.combosActive[id] = true;
      combo.apply(w1, w2, combo);
      /* EACH ONE TAKES THE OTHER'S COLOUR.
       *
       * A discovery changed what a weapon did and never changed what it
       * looked like. Frostfire made Cinderfall chill whatever survived it and
       * left the bolt looking exactly like a Cinderfall; the player was told
       * about the pairing once, by a toast, and then never saw it again on
       * the field. Nine discoveries, none of them visible.
       *
       * Derived from the pair rather than written into each entry, so it is
       * one rule for all nine and for every one the game ever gains: a
       * combined weapon carries a core of its partner's colour inside its own
       * shape. The shape stays the weapon's, because that is how the player
       * knows what is firing; the colour inside it says what it is now part
       * of. A discovery that sets its own `blend` keeps it. */
      if (!w1.mods.blend) w1.mods.blend = WS.Weapon.colour(w2);
      if (!w2.mods.blend) w2.mods.blend = WS.Weapon.colour(w1);
      const fresh = WS.Save.discoverCombo(id);
      WS.Game.toast(
        (fresh ? 'Discovery: ' : 'Synergy: ') + combo.name,
        WS.template(combo.description, combo),
        { kind: 'discovery', art: fresh ? 'book' : 'arcane' });
      WS.Audio.play('evolve');
    }
  };

  WS.ComboSystem = ComboSystem;

})(window.WS);
