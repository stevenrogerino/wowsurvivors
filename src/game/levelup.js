/* Level-up boon generation and application: weapon ranks, new weapons,
 * evolutions, unions, passives, the Breaking Point, and the deep-run bread
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

  /* ------------------------------------------------- what this will do --
   * WHAT A CARD REACTS WITH, said on the card.
   *
   * Everything in this game is built around things combining - a weapon and
   * a passive become an evolution, two weapons become a discovery, two
   * evolutions become a union - and a card said none of it. It gave a name, a
   * rank and a sentence, and the entire combination layer was something a
   * player either read in the Codex afterwards or never found. A survivor
   * holding Cinderfall, offered Rimeshard, was being offered Frostfire and
   * had no way to know.
   *
   * So a card carries its reactions: what it completes NOW, and what it is
   * waiting on. `ready` is the difference - a reaction the player can have by
   * taking this card reads lit, one that needs something they do not have yet
   * reads as a note. Both are worth showing; only one is a decision.
   */
  function reactionsFor(p, id, kind, level) {
    const out = [];
    const d = WS.Weapons[id];
    if (!d) return out;
    const lvl = level === undefined ? (p.weaponLevels[id] || 0) : level;

    // A discovery, with something already carried.
    for (const cid of WS.ComboOrder) {
      const c = WS.Combos[cid];
      if (c.weapons.indexOf(id) < 0) continue;
      const other = c.weapons[0] === id ? c.weapons[1] : c.weapons[0];
      if (p.combosActive[cid]) continue;
      const held = !!WS.Player.getWeapon(p, other);
      out.push({ kind: 'discovery', ready: held && kind === 'new_weapon',
        text: held ? 'Discovery: ' + c.name
          : c.name + ' needs ' + (WS.Weapons[other] ? WS.Weapons[other].name : other) });
    }

    // The evolution this weapon is walking toward.
    if (d.evolvePairing && WS.Upgrades[d.evolvePairing]) {
      const passive = WS.Upgrades[d.evolvePairing].name;
      const has = (p.upgradeLevels[d.evolvePairing] || 0) > 0;
      const maxed = lvl >= WS.WEAPON_MAX_LEVEL;
      if (kind !== 'evolve') {
        out.push({ kind: 'evolve', ready: has && maxed,
          text: has
            ? (maxed ? 'Ready to evolve: ' + d.evolveName
              : 'Evolves into ' + d.evolveName + ' at rank ' + WS.WEAPON_MAX_LEVEL)
            : 'Evolves with ' + passive });
      }
    }

    // And the union two evolutions can become.
    for (const u of (WS.Unions || [])) {
      if (u.from.indexOf(id) < 0) continue;
      const other = u.from[0] === id ? u.from[1] : u.from[0];
      const ow = WS.Player.getWeapon(p, other);
      const res = WS.Weapons[u.result];
      out.push({ kind: 'union', ready: !!(ow && ow.evolved),
        text: (res ? res.name : 'Union') + ' once '
          + (WS.Weapons[other] ? WS.Weapons[other].name : other) + ' evolves' });
    }
    /* Two at most, and what is achievable first. A card that lists every
       future it could have is a wall of text, not an aid. */
    out.sort((a, b) => (b.ready ? 1 : 0) - (a.ready ? 1 : 0));
    return out.slice(0, 2);
  }
  LevelUp.reactionsFor = reactionsFor;

  /* What a PASSIVE reacts with: the weapons it evolves. A passive card said
   * what it does to your numbers and nothing about the one thing that makes
   * most of them worth taking - that Ferocity is what turns a rank-8
   * Knifestorm into Steel Flurry. Weapons you carry come first, and one that
   * is already at its last rank is the reaction you can have by taking it. */
  function passiveReactions(p, id, all) {
    const out = [];
    const has = (p.upgradeLevels[id] || 0) > 0;
    for (const wid of WS.WeaponOrder) {
      const d = WS.Weapons[wid];
      if (!d || d.evolvePairing !== id) continue;
      const w = WS.Player.getWeapon(p, wid);
      if (w && w.evolved) continue;
      if (w) {
        const maxed = w.level >= WS.WEAPON_MAX_LEVEL;
        out.push({ kind: 'evolve', carried: true, ready: maxed && !has, weapon: wid,
          text: maxed ? (has ? 'Evolving ' : 'Evolves your ') + d.name + ' into ' + d.evolveName + ' now'
            : 'Evolves your ' + d.name + ' into ' + d.evolveName + ' at rank ' + WS.WEAPON_MAX_LEVEL });
      } else if (all) {
        out.push({ kind: 'evolve', carried: false, ready: false, weapon: wid,
          text: 'Evolves ' + d.name + ' into ' + d.evolveName });
      }
    }
    out.sort((a, b) => (b.ready ? 2 : b.carried ? 1 : 0) - (a.ready ? 2 : a.carried ? 1 : 0));
    return out;
  }
  LevelUp.passiveReactions = passiveReactions;

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
          name: d.name, description: WS.template(d.description, d),
          note: `Rank ${w.level} to ${w.level + 1}`,
          rank: w.level + 1, maxRank: WS.WEAPON_MAX_LEVEL,
          reacts: reactionsFor(p, w.id, 'weapon_rank', w.level + 1),
        });
      } else if (!w.evolved && d.evolvePairing && (p.upgradeLevels[d.evolvePairing] || 0) > 0) {
        candidates.push({
          type: 'evolve', id: w.id, art: d.art, school: d.school, weight: 6,
          name: d.evolveName, description: d.evolveDescription,
          rank: WS.WEAPON_MAX_LEVEL, maxRank: WS.WEAPON_MAX_LEVEL,
          reacts: reactionsFor(p, w.id, 'evolve', WS.WEAPON_MAX_LEVEL),
          note: 'Evolution · ' + d.name + ', transformed',
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
          unionFrom: recipe.from, name: d.name, description: WS.template(d.description, d),
          note: `Union · ${WS.Weapons[a].name} and ${WS.Weapons[b].name}, made one`,
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
          name: d.name, description: WS.template(d.description, d),
          rank: 1, maxRank: WS.WEAPON_MAX_LEVEL,
          reacts: reactionsFor(p, id, 'new_weapon', 1),
          note: 'New weapon · pairs with ' + WS.Upgrades[d.evolvePairing].name,
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
          name: up.name, description: WS.template(up.description, up),
          detail: WS.template(up.detail, up),
          rank: rank + 1, maxRank: up.max,
          note: `Rank ${rank + 1} of ${up.max}`,
          reacts: passiveReactions(p, id, false).slice(0, 2),
        });
      }
    }

    // Fill all three slots from the real pool FIRST: a live build never loses
    // a choice to Breaking Point while genuine upgrades remain.
    const choices = [];
    for (let i = 0; i < 3; i++) {
      const pick = WS.takeWeighted(candidates);
      if (pick) choices.push(pick);
    }

    // Only once the pool cannot fill three slots does Breaking Point appear.
    if (choices.length < 3) {
      // From here the HUD offers the auto-take switch under the portrait.
      if (WS.Game && WS.Game.run) WS.Game.run.breakingSeen = true;
      const pct = WS.round(WS.Config.limitBreakDamage * 100);
      choices.push({
        type: 'breaking_point', id: 'breaking_point', art: 'fist', quality: 'legendary',
        name: 'Breaking Point',
        description: `Break past your limits: +${pct}% weapon damage, forever.`,
        note: `Breaking Points: ${p.limitBreaks}`,
      });
    }

    // Any still-empty slots get distinct breads.
    const pool = BREADS.slice();
    while (choices.length < 3 && pool.length) {
      choices.push(pool.splice(WS.randInt(0, pool.length - 1), 1)[0]);
    }
    return choices;
  };

  /** Three random blessings, never re-offering one already taken. A class's
   *  signature blessing (Ruinous Pact for the Ruinseeker, Blood Rite for the
   *  Graveblade) always fills one of the three slots while it is still
   *  available - the draft can still hand either to anyone, but the class
   *  whose identity it is is never unlucky enough to miss it. */
  LevelUp.buildBlessingChoices = function (p) {
    const ids = WS.BlessingOrder.filter((id) => !p.blessingsTaken || !p.blessingsTaken[id]);
    const picks = [];
    const sig = p.character && p.character.signatureBlessing;
    if (sig && ids.includes(sig)) picks.push(ids.splice(ids.indexOf(sig), 1)[0]);
    const slots = WS.min(3, ids.length + picks.length);
    while (picks.length < slots) picks.push(ids.splice(WS.randInt(0, ids.length - 1), 1)[0]);
    return picks.map((id) => {
      const b = WS.Blessings[id];
      return {
        type: 'blessing', id, art: b.art, quality: b.quality || 'legendary',
        name: b.name,
        description: WS.template(b.description, b),
        note: 'A blessing · yours for the rest of the night',
      };
    });
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
      WS.Save.db.unions[choice.id] = true;   // for the codex, which wants which
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
        WS.Save.db.evolved[choice.id] = true;   // ditto
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

    } else if (choice.type === 'breaking_point') {
      p.damageMultiplier += WS.Config.limitBreakDamage;
      p.limitBreaks++;
      WS.Audio.play('evolve');
      WS.FX.notice(p.x, p.y, 'BREAKING POINT!', '#ff8a3c');
    }
    WS.Achievements.check();
  };

  /** Removes a boon (and its future offers) from this run's pool. */
  LevelUp.banish = function (p, choice) {
    if (choice.type === 'bread' || choice.type === 'blessing'
      || choice.type === 'breaking_point' || choice.type === 'union') return false;
    p.banished[choice.id] = true;
    return true;
  };

  WS.LevelUp = LevelUp;

})(window.WS);
