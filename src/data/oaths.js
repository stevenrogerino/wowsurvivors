/* Oaths: hardships a survivor can swear to before a night, on top of the
 * difficulty. Each one makes the night harder in one plain way and
 * adds its `bonus` to the run's score multiplier, so a sworn night is worth
 * more on the ledger than the same night taken easy.
 *
 * `mods` is read by the game through WS.Runs.oath(key), which folds every
 * sworn oath's value for that key together (multiplying), and is 1 when none
 * of them says anything about it:
 *
 *   hp      enemy health            dmg     enemy damage
 *   speed   enemy move speed        spawn   time between waves
 *   elite   elite chance            xp      experience gained
 *   potion  healing from potions    bossHp  boss and finale health
 *
 * They open once a battlefield has been held to dawn, and never apply in the
 * Eclipse Arena, which runs its own fight.
 *
 * The Hyper Oath was Hyper Mode, a toggle of its own beside the difficulty.
 * Sworn, it sets run.hyper (game.js) and every Hyper path is unchanged:
 * Config.hyperScale on the horde, bosses and finales, waves a third more
 * often. Its bonus is the x1.5 Hyper always added to the score. */
'use strict';
(function (WS) {

  WS.Oaths = {
    hyper: {
      name: 'The Hyper Oath', art: 'arcane',
      desc: 'Everything out there is 40% stronger, and waves come a third more often.',
      bonus: 0.50, mods: {},
    },
    crowd: {
      name: 'Oath of the Crowd', art: 'skull',
      desc: 'Waves come a third more often.',
      bonus: 0.20, mods: { spawn: 0.75 },
    },
    iron: {
      name: 'Oath of Iron Hides', art: 'shield',
      desc: 'Everything out there has 40% more health.',
      bonus: 0.25, mods: { hp: 1.4 },
    },
    teeth: {
      name: 'Oath of Teeth', art: 'claw',
      desc: 'Everything out there hits 35% harder.',
      bonus: 0.25, mods: { dmg: 1.35 },
    },
    chase: {
      name: 'Oath of the Chase', art: 'boot',
      desc: 'The horde moves 15% faster.',
      bonus: 0.20, mods: { speed: 1.15 },
    },
    lean: {
      name: 'Oath of the Lean Night', art: 'crystal',
      desc: 'Experience comes 25% slower.',
      bonus: 0.15, mods: { xp: 0.75 },
    },
    thirst: {
      name: 'Oath of Thirst', art: 'potion',
      desc: 'Potions heal a quarter as much.',
      bonus: 0.15, mods: { potion: 0.25 },
    },
    captains: {
      name: 'Oath of Captains', art: 'crown',
      desc: 'Elites come twice as often.',
      bonus: 0.20, mods: { elite: 2 },
    },
    giants: {
      name: 'Oath of Giants', art: 'sovereign',
      desc: 'Bosses and the finale have half again their health.',
      bonus: 0.25, mods: { bossHp: 1.5 },
    },
  };
  WS.OathOrder = ['hyper', 'crowd', 'iron', 'teeth', 'chase', 'lean', 'thirst', 'captains', 'giants'];

})(window.WS);
