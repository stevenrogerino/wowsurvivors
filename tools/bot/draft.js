/* The drafter: level-up and blessing choices for a bot playing a real run.
 *
 * tools/archetype-sim.js drafted from a hand-written list per archetype,
 * which is right for asking "how does THIS build do" and wrong for asking
 * "how does this blessing do on this survivor": the list decides the build,
 * and it was written for one survivor. This one reads the survivor's own kit
 * and what is on the cards, the way a player who knows the game does:
 *
 *   - a union or an evolution, always
 *   - weapons until the kit is full, preferring ones that complete a
 *     discovery or a union with what is already carried
 *   - ranks on the weapons already committed to, deepest first, and most
 *     of all on one whose evolution passive is already learned
 *   - the passive an owned weapon needs to evolve, then the broad damage
 *     passives, then defence - more defence the harder the night is hitting
 *   - the passive that deepens a system the survivor has turned on (Ruin
 *     Hunger with the Pact, Kinship with the Old Shapes, and so on)
 *   - bread when hurt, a reroll when every card is poor, never the curse
 *
 * Blessings: a forced one for the experiment if there is one, else the
 * survivor's own signature, else a fixed order. It has no imports.
 */
'use strict';

function installDrafter(opts) {
  const O = Object.assign({
    blessing: null,       // id forced at the first draft (the experiment)
    midnight: null,       // id forced at the 15:00 draft; else chosen
    reroll: true,
  }, opts || {});
  const D = window.__draft = { opts: O, picks: [] };
  const OFFENCE = { might: 52, haste: 52, area: 48, quantity: 50, precision: 42, ferocity: 40, velocity: 30 };
  const DEFENCE = { vitality: 40, armor: 40, recovery: 34, dodge: 36, warding_light: 40, thorns: 28, searing: 30 };
  const UTILITY = { magnet: 34, wisdom: 30, luck: 18 };
  // A passive that only means something once its system is running.
  const SYSTEM = {
    ruin_hunger: (p) => p.felAttuned > 0, primal_kinship: (p) => p.wildAttuned > 0,
    serenity: (p) => p.flowAttuned > 0, curdled: (p) => p.curdled > 0,
  };
  const BLESS_ORDER = ['unyielding', 'stillwater', 'ruinous_pact', 'kings', 'quarry', 'opportunist',
    'reapers_tithe', 'bloodthirst', 'fel', 'arcane_overflow', 'seething_blood', 'wildshape', 'conviction',
    'waystones', 'momentum', 'wild', 'air', 'moonlit', 'ancestors', 'arcane_surge', 'radiant_barrier',
    'blood_rite', 'wisdom', 'fortune', 'glass_cannon'];

  function owns(p, id) { return !!p.weaponLevels[id]; }
  function partners(id) {
    const out = [];
    for (const k of Object.keys(WS.Combos)) {
      const w = WS.Combos[k].weapons;
      if (w[0] === id) out.push(w[1]); else if (w[1] === id) out.push(w[0]);
    }
    for (const u of WS.Unions) {
      if (u.from[0] === id) out.push(u.from[1]); else if (u.from[1] === id) out.push(u.from[0]);
    }
    return out;
  }
  /** How hard the night is hitting: damage taken over the last minute as a
   *  share of max health. Defence is worth more the higher this runs. */
  function pressure(p) {
    const run = WS.Game.run;
    const now = run.time, taken = run.damageTaken;
    D.hist = D.hist || [];
    D.hist.push([now, taken]);
    while (D.hist.length > 2 && now - D.hist[0][0] > 60) D.hist.shift();
    const [t0, d0] = D.hist[0];
    const rate = (taken - d0) / Math.max(10, now - t0);      // per second
    return rate / Math.max(1, p.maxHealth);                   // share of the bar a second
  }

  D.score = function (p, c, press) {
    const hp = p.health / Math.max(1, p.maxHealth);
    switch (c.type) {
      case 'union': return 100;
      case 'evolve': return 96;
      case 'new_weapon': {
        const n = p.weapons.length;
        let s = n < 3 ? 86 : n < 5 ? 74 : 62;
        for (const q of partners(c.id)) if (owns(p, q)) s += 7;
        return s;
      }
      case 'weapon_rank': {
        const w = WS.Player.getWeapon(p, c.id);
        const lvl = w ? w.level : 1;
        let s = 56 + lvl * 2.5;
        const pair = WS.Weapons[c.id] && WS.Weapons[c.id].evolvePairing;
        if (pair && (p.upgradeLevels[pair] || 0) > 0) s += 8;
        return s;
      }
      case 'stat': {
        const id = c.id;
        const up = WS.Upgrades[id];
        if (up && up.max && (p.upgradeLevels[id] || 0) >= up.max) return 0;
        if (id === 'dark_bargain') return 4;
        let s = 30;
        if (OFFENCE[id]) s = OFFENCE[id];
        else if (DEFENCE[id]) s = DEFENCE[id] + Math.min(35, press * 900);
        else if (UTILITY[id]) s = UTILITY[id] - (id === 'magnet' || id === 'wisdom' ? Math.min(15, p.level / 3) : 0);
        else if (SYSTEM[id]) s = SYSTEM[id](p) ? 62 : 8;
        // The passive an owned, unevolved weapon is waiting on.
        for (const w of p.weapons) {
          if (!w.evolved && w.data.evolvePairing === id) s = Math.max(s, (p.upgradeLevels[id] || 0) > 0 ? s : 78);
        }
        if (hp < 0.4 && DEFENCE[id]) s += 10;
        return s;
      }
      case 'bread': return hp < 0.4 ? 90 : hp < 0.7 ? 30 : 3;
      case 'breaking_point': return 26;
      default: return 10;
    }
  };

  D.pickLevel = function (p, choices) {
    const press = pressure(p);
    let best = null, bestS = -1;
    for (const c of choices) {
      const s = D.score(p, c, press);
      if (s > bestS) { bestS = s; best = c; }
    }
    if (O.reroll && bestS < 30 && p.rerolls > 0 && WS.Game.rerollLevelUp()) {
      return D.pickLevel(p, WS.Game.levelChoices || choices);
    }
    D.picks.push([Math.round(WS.Game.run.time), best && best.type, best && best.id]);
    return best;
  };

  D.pickBlessing = function (p, choices) {
    const run = WS.Game.run;
    const midnight = run.time > 60;
    const forced = midnight ? O.midnight : O.blessing;
    if (forced && WS.Blessings[forced] && !(p.blessingsTaken && p.blessingsTaken[forced])) {
      return { type: 'blessing', id: forced };
    }
    const sig = p.character && p.character.signatureBlessing;
    if (sig && choices.some((c) => c.id === sig)) return choices.find((c) => c.id === sig);
    for (const id of BLESS_ORDER) {
      const c = choices.find((x) => x.id === id);
      if (c) return c;
    }
    return choices[0];
  };
  return D;
}

module.exports = { installDrafter };
