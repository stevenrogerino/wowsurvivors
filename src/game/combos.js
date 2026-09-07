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
      const fresh = WS.Save.discoverCombo(id);
      WS.Game.toast(
        (fresh ? 'Discovery: ' : 'Synergy: ') + combo.name,
        WS.template(combo.description, combo));
      WS.Audio.play('evolve');
    }
  };

  WS.ComboSystem = ComboSystem;

})(window.WS);
