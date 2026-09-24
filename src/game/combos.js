/* Discoveries: the moment a survivor carries both weapons of a pair, the combo
 * activates for the run, toasts, and is written into the permanent codex. */
'use strict';
(function (WS) {

  const ComboSystem = {};

  ComboSystem.check = function (p) {
    for (const id of WS.ComboOrder) {
      if (p.combosActive[id]) continue;
      const combo = WS.Combos[id];
      const w1 = WS.Player.getWeapon(p, combo.weapons[0]);
      const w2 = WS.Player.getWeapon(p, combo.weapons[1]);
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
