/* Level-up boon generation and application: weapon ranks, new weapons,
 * evolutions, unions, passives, the Limit Break, and the deep-run bread
 * fallback. `type` doubles as the card's quality key in the UI. */
'use strict';
(function (WS) {

  const LevelUp = {};

  const BREADS = [
    {
      type: 'bread', id: 'crust', art: 'leaf', name: 'Crust of Bread',
      description: 'A quick bite. Restores 30 health.', heal: 30, gold: 10,
      note: 'Better than nothing',
    },
    {
      type: 'bread', id: 'loaf', art: 'leaf', name: 'Hearty Loaf',
      description: "A hero's supper. Restores 70 health and a little gold.", heal: 70, gold: 25,
      note: "The innkeeper's finest",
    },
    {
      type: 'bread', id: 'feast', art: 'heart', name: "Traveler's Feast",
      description: 'A full spread. Restores 130 health.', heal: 130, gold: 20,
      note: 'Fit for a champion',
    },
    {
      type: 'bread', id: 'bakers_dozen', art: 'coin', name: "Baker's Dozen",
      description: 'Modest food, a fat coin purse. Restores 40 health, +75 gold.', heal: 40, gold: 75,
      note: 'Mostly for the gold',
    },
  ];

  LevelUp.buildChoices = function (p) {
    const candidates = [];

    // Owned weapons: a rank-up, or the evolution once rank 8 is reached and
    // the paired passive has been learned.
    for (const w of p.weapons) {
      const d = w.data;
      if (p.banished[w.id]) continue;
      if (w.level < WS.WEAPON_MAX_LEVEL) {
        candidates.push({
          type: 'weapon_rank', id: w.id, art: d.art, school: d.school, weight: 3,
          name: d.name, description: d.description,
          note: `Rank ${w.level}  >  ${w.level + 1}`,
        });
      } else if (!w.evolved && d.evolvePairing && (p.upgradeLevels[d.evolvePairing] || 0) > 0) {
        candidates.push({
          type: 'evolve', id: w.id, art: d.art, school: d.school, weight: 6,
          name: d.evolveName, description: d.evolveDescription,
          note: 'EVOLUTION - ' + d.name + ' transformed',
        });
      }
    }

    // Unions: both sources fully evolved merge into one super-weapon, freeing
    // a slot. A forged union is recorded so it can never be offered again.
    for (const recipe of WS.Unions) {
      const [a, b] = recipe.from;
      const wa = WS.Player.getWeapon(p, a);
      const wb = WS.Player.getWeapon(p, b);
      if (!p.unionsForged[recipe.result] && !p.weaponLevels[recipe.result]
        && wa && wa.evolved && wb && wb.evolved) {
        const d = WS.Weapons[recipe.result];
        candidates.push({
          type: 'union', id: recipe.result, art: d.art, school: d.school, weight: 10,
          unionFrom: recipe.from, name: d.name, description: d.description,
          note: `UNION - merges evolved ${WS.Weapons[a].name} + ${WS.Weapons[b].name}`,
        });
      }
    }

    // New weapons, while there are free slots.
    if (p.weapons.length < WS.MAX_WEAPONS) {
      for (const id of WS.WeaponOrder) {
        if (p.weaponLevels[id] || p.banished[id]) continue;
        const d = WS.Weapons[id];
        candidates.push({
          type: 'new_weapon', id, art: d.art, school: d.school, weight: 2,
          name: d.name, description: d.description,
          note: 'New Weapon  -  pairs with ' + WS.Upgrades[d.evolvePairing].name,
        });
      }
    }

    // Passive boons.
    for (const id of WS.UpgradeOrder) {
      const up = WS.Upgrades[id];
      const rank = p.upgradeLevels[id] || 0;
      const offerable = !up.offer || up.offer(p);
      if (rank < up.max && !p.banished[id] && offerable) {
        candidates.push({
          type: 'stat', id, art: up.art, quality: up.quality, weight: 2,
          name: up.name, description: up.description, detail: up.detail,
          note: `Rank ${rank + 1} / ${up.max}`,
        });
      }
    }

    // Fill all three slots from the real pool FIRST: a live build never loses
    // a choice to Limit Break while genuine upgrades remain.
    const choices = [];
    for (let i = 0; i < 3; i++) {
      const pick = WS.takeWeighted(candidates);
      if (pick) choices.push(pick);
    }

    // Only once the pool cannot fill three slots does Limit Break appear.
    if (choices.length < 3) {
      const pct = WS.round(WS.Config.limitBreakDamage * 100);
      choices.push({
        type: 'limit_break', id: 'limit_break', art: 'fist', quality: 'legendary',
        name: 'Limit Break',
        description: `Break past your limits: +${pct}% weapon damage, forever.`,
        note: `Limit Breaks: ${p.limitBreaks}`,
      });
    }

    // Any still-empty slots get distinct breads.
    const pool = BREADS.slice();
    while (choices.length < 3 && pool.length) {
      choices.push(pool.splice(WS.randInt(0, pool.length - 1), 1)[0]);
    }
    return choices;
  };

  /** Three random blessings, never re-offering one already taken. */
  LevelUp.buildBlessingChoices = function (p) {
    const ids = WS.BlessingOrder.filter((id) => !p.blessingsTaken || !p.blessingsTaken[id]);
    const choices = [];
    for (let i = 0; i < WS.min(3, ids.length); i++) {
      const id = ids.splice(WS.randInt(0, ids.length - 1), 1)[0];
      const b = WS.Blessings[id];
      choices.push({
        type: 'blessing', id, art: b.art, quality: b.quality || 'legendary',
        name: b.name,
        description: WS.template(b.description, b),
        note: 'Blessing - permanent for this run',
      });
    }
    return choices;
  };

  LevelUp.apply = function (p, choice) {
    if (choice.type === 'blessing') {
      const b = WS.Blessings[choice.id];
      b.apply(p, b);
      p.blessingNames.push(b.name);
      p.blessingsTaken = p.blessingsTaken || {};
      p.blessingsTaken[choice.id] = true;
      WS.Audio.play('evolve');
      WS.Game.announce(b.name, 'The blessing takes hold.', 2.5, { kind: 'glory' });
      return;
    }

    if (choice.type === 'union') {
      for (const id of choice.unionFrom) WS.Player.removeWeapon(p, id);
      const w = WS.Player.addWeapon(p, choice.id);
      if (w) { w.level = WS.WEAPON_MAX_LEVEL; p.weaponLevels[choice.id] = WS.WEAPON_MAX_LEVEL; }
      p.unionsForged[choice.id] = true;
      WS.Save.stats.unions++;
      WS.Audio.play('evolve');
      WS.FX.shake(6, 0.5);
      WS.Game.announce(choice.name + '!', 'Two weapons become one.', 3.0, { kind: 'glory' });

    } else if (choice.type === 'new_weapon') {
      WS.Player.addWeapon(p, choice.id);
      WS.Audio.play('chest');

    } else if (choice.type === 'weapon_rank') {
      WS.Player.levelWeapon(p, choice.id);
      WS.Audio.play('select');

    } else if (choice.type === 'evolve') {
      const w = WS.Player.getWeapon(p, choice.id);
      if (w && !w.evolved) {
        w.evolved = true;
        WS.Save.stats.evolutions++;
        WS.Audio.play('evolve');
        WS.FX.shake(5, 0.4);
        WS.Game.announce(w.data.evolveName + '!', 'Your weapon has grown into something else.', 3.0,
          { kind: 'glory' });
      }

    } else if (choice.type === 'stat') {
      const up = WS.Upgrades[choice.id];
      up.apply(p, up);
      p.upgradeLevels[choice.id] = (p.upgradeLevels[choice.id] || 0) + 1;
      WS.Audio.play('select');

    } else if (choice.type === 'bread') {
      WS.Player.heal(p, choice.heal || 60, 'food');
      if (choice.gold > 0) WS.Game.addGold(WS.floor(choice.gold * WS.Game.run.goldMult), p.x, p.y);
      WS.Audio.play('potion');

    } else if (choice.type === 'limit_break') {
      p.damageMultiplier += WS.Config.limitBreakDamage;
      p.limitBreaks++;
      WS.Audio.play('evolve');
      WS.FX.notice(p.x, p.y, 'LIMIT BREAK!', '#ff8a3c');
    }
    WS.Achievements.check();
  };

  /** Removes a boon (and its future offers) from this run's pool. */
  LevelUp.banish = function (p, choice) {
    if (choice.type === 'bread' || choice.type === 'blessing'
      || choice.type === 'limit_break' || choice.type === 'union') return false;
    p.banished[choice.id] = true;
    return true;
  };

  WS.LevelUp = LevelUp;

})(window.WS);
