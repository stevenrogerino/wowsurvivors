/* Achievement checking. Tests read persisted statistics, so an achievement can
 * complete mid-run or at the moment the run's totals are banked. */
'use strict';
(function (WS) {

  const Achievements = {};

  Achievements.check = function () {
    const db = WS.Save.db;
    let earned = null;
    for (const id of WS.AchievementOrder) {
      if (db.achievements[id]) continue;
      const a = WS.Achievements[id];
      let passed = false;
      try { passed = a.test(db); } catch (e) { passed = false; }
      if (!passed) continue;

      db.achievements[id] = true;
      earned = a;
      if (a.reward) {
        if (a.reward.type === 'gold') WS.Save.addGold(a.reward.amount);
        else if (a.reward.type === 'character') db.unlocks.characters[a.reward.id] = true;
        else if (a.reward.type === 'map') db.unlocks.maps[a.reward.id] = true;
      }
      WS.Game.toast('Achievement: ' + a.name, Achievements.rewardText(a));
      WS.Audio.play('level');
    }
    if (earned) WS.Save.save();
    return earned;
  };

  Achievements.rewardText = function (a) {
    if (!a.reward) return a.description;
    if (a.reward.type === 'gold') return `+${a.reward.amount} gold banked.`;
    if (a.reward.type === 'character') return `${WS.Characters[a.reward.id].name} is now playable.`;
    if (a.reward.type === 'map') return `${WS.Maps[a.reward.id].name} is now open.`;
    return a.description;
  };

  WS.AchievementSystem = Achievements;
  // The data table is WS.Achievements; the system hangs off it for convenience
  // so ported call sites (`WS.Achievements.check()`) still read naturally.
  WS.Achievements.check = Achievements.check;
  WS.Achievements.rewardText = Achievements.rewardText;

})(window.WS);
