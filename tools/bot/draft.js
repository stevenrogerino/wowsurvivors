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
 *
 * STYLES (opts.style), laid over the scoring above, for asking how the way a
 * player drafts changes a night:
 *
 *   minmax   the scoring as it is: the best card by the damage model (default)
 *   rush     one weapon to rank 8 and evolved before anything else (opts.focus,
 *            else the starting weapon); its evolution passive as soon as offered.
 *            opts.rushPassives false: no other passive until it has evolved
 *   wide     every slot filled first, then the lowest-ranked weapon raised
 *   casual   a card at random, a little drawn to new weapons; evolutions and
 *            unions always (the game shouts about them); never rerolls
 *   passives passives before ranks: every damage passive offered is taken
 */
'use strict';

function installDrafter(opts) {
  const O = Object.assign({
    blessing: null,       // id forced at the first draft (the experiment)
    midnight: null,       // id forced at the 15:00 draft; else chosen
    reroll: true,
    mode: 'dps',          // 'dps' values cards by what they add; 'simple' by fixed preference
    defence: 0.3,         // how much defence is worth against damage (fitted: 0 and 1 both do worse)
    newBonus: 8,          // what an open slot's future is worth, in dps mode
    calib: null,          // per-weapon reach corrections (tools/bot/reach-calibration.json)
    style: 'minmax',      // see STYLES above
    focus: null,          // rush: the weapon to rush (else the starting weapon)
    rushPassives: true,   // rush: other passives allowed before the focus evolves
    seed: 1,              // casual: its own dice, so the game's are untouched
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

  /* ---- dps mode: what each card adds, in the game's own damage model ---- */
  const STATS = ['damageMultiplier', 'cooldownMultiplier', 'areaMultiplier', 'projectileBonus',
    'projectileSpeed', 'projectileImpact', 'critChance', 'critDamage', 'durationMult'];
  // Only these touch nothing but the stats above, so only these are measured
  // by applying them; everything else is valued by what it is for.
  const MEASURED = { might: 1, haste: 1, precision: 1, ferocity: 1, area: 1, quantity: 1, velocity: 1, perennial: 1 };
  const FIXED = { spirit_companion: 7, grave_call: 7, serration: 5, chilling_presence: 5 };
  function crowd() { return Math.max(8, Math.min(40, WS.Enemy.pool.count)); }
  function dpsOf(p, id, level, evolved) {
    const r = WS.Weapon.reach(id, level, evolved, crowd(), p);
    // The reach model's crowd is spread evenly; a real one bunches. Where
    // tools/bot/calibrate.js has measured the difference, it corrects it.
    const k = O.calib && O.calib[id] ? (evolved ? O.calib[id].e : O.calib[id].b) : 1;
    return r && isFinite(r.dps) ? Math.max(0, r.dps) * k : 0;
  }
  function total(p) {
    let t = 0;
    for (const w of p.weapons) t += dpsOf(p, w.id, w.level, w.evolved);
    return t;
  }
  /** Damage gained by a passive, measured by applying it and putting it back. */
  function statGain(p, id, base) {
    const up = WS.Upgrades[id];
    if (!up) return 0;
    const saved = STATS.map((k) => p[k]);
    try { up.apply(p, up); } catch (e) { /* not every passive applies cleanly */ }
    const after = total(p);
    STATS.forEach((k, i) => { p[k] = saved[i]; });
    return Math.max(0, after - base);
  }
  // Passives whose apply() touches more than the damage stats: never applied
  // to measure, valued as defence or by what they unlock instead.
  const DEF_VALUE = { vitality: 0.8, armor: 1.0, recovery: 0.6, dodge: 0.8, warding_light: 0.9,
    thorns: 0.5, searing: 0.6, fleetfoot: 0.5, chilling_presence: 0.3 };
  D.scoreDps = function (p, c, press) {
    const hp = p.health / Math.max(1, p.maxHealth);
    const base = Math.max(1, total(p));
    const pct = (gain) => 100 * gain / base;
    switch (c.type) {
      case 'union': return 400;
      case 'evolve': { const w = WS.Player.getWeapon(p, c.id); return 30 + pct(dpsOf(p, c.id, w.level, true) - dpsOf(p, c.id, w.level, false)); }
      case 'weapon_rank': { const w = WS.Player.getWeapon(p, c.id); return pct(dpsOf(p, c.id, w.level + 1, w.evolved) - dpsOf(p, c.id, w.level, w.evolved)); }
      case 'new_weapon': {
        let s = pct(dpsOf(p, c.id, 1, false)) + O.newBonus * (WS.MAX_WEAPONS - p.weapons.length) / WS.MAX_WEAPONS;
        // Dread Command's worth is the pack it unlocks, which the reach
        // model cannot see: valued as a middling weapon.
        if (c.id === 'dread_command') s += 8;
        for (const q of partners(c.id)) if (owns(p, q)) s += 4;
        return s;
      }
      case 'stat': {
        const id = c.id, up = WS.Upgrades[id];
        if (up && up.max && (p.upgradeLevels[id] || 0) >= up.max) return 0;
        if (id === 'dark_bargain') return 0;
        if (SYSTEM[id]) return SYSTEM[id](p) ? 12 : 0;
        let s = 0;
        if (DEF_VALUE[id] !== undefined) {
          // Defence is worth what the night is taking: a fifth of the bar a
          // second is desperate, a hundredth is nothing.
          s = DEF_VALUE[id] * O.defence * Math.min(40, press * 1500) + (hp < 0.4 ? 6 : 0);
        } else if (UTILITY[id]) {
          s = id === 'magnet' || id === 'wisdom' ? Math.max(0, 6 - p.level / 8) : 1;
        } else if (MEASURED[id]) {
          s = pct(statGain(p, id, base));
        }
        if (FIXED[id]) s += FIXED[id];
        // The passive an owned, unevolved weapon is waiting on: worth its
        // evolution, discounted by how far the weapon still has to climb.
        for (const w of p.weapons) {
          if (!w.evolved && w.data.evolvePairing === id && !(p.upgradeLevels[id] > 0)) {
            s += (30 + pct(dpsOf(p, w.id, 8, true) - dpsOf(p, w.id, 8, false))) * (w.level / 8) * 0.5;
          }
        }
        return s;
      }
      case 'bread': return hp < 0.4 ? 60 : hp < 0.7 ? 8 : 0;
      case 'breaking_point': return 3;
      default: return 1;
    }
  };

  // The casual player's own dice (a small LCG), seeded per night.
  let dice = (O.seed >>> 0) || 1;
  const roll = () => { dice = (dice * 1664525 + 1013904223) >>> 0; return dice / 4294967296; };
  const DAMAGE_PASSIVES = { might: 1, haste: 1, precision: 1, ferocity: 1, area: 1, quantity: 1, velocity: 1, perennial: 1, serration: 1 };
  /** A style's push on a card's score (see STYLES). */
  function styled(p, c, s) {
    if (c.type === 'union' || c.type === 'evolve') return s + 10000;
    if (O.style === 'casual') return roll() * 100 + (c.type === 'new_weapon' ? 25 : 0) + (c.type === 'bread' && p.health < p.maxHealth * 0.35 ? 60 : 0);
    if (O.style === 'rush') {
      if (!D.focus) D.focus = O.focus && WS.Weapons[O.focus] ? O.focus : (p.weapons[0] && p.weapons[0].id);
      const f = WS.Player.getWeapon(p, D.focus);
      if (!f) return c.type === 'new_weapon' && c.id === D.focus ? s + 5000 : s;
      if (f.evolved) return s;
      const pair = f.data.evolvePairing;
      if (c.type === 'weapon_rank' && c.id === D.focus) return s + 3000;
      if (c.type === 'stat' && c.id === pair && !(p.upgradeLevels[pair] > 0)) return s + 2500;
      if (!O.rushPassives && c.type === 'stat') return s - 3000;
      return s;
    }
    if (O.style === 'wide') {
      if (c.type === 'new_weapon') return s + 3000;
      if (c.type === 'weapon_rank') { const w = WS.Player.getWeapon(p, c.id); return s + (8 - (w ? w.level : 1)) * 40; }
      return s;
    }
    if (O.style === 'passives') {
      if (c.type === 'stat' && DAMAGE_PASSIVES[c.id]) return s + 2000;
      return s;
    }
    return s;
  }

  D.pickLevel = function (p, choices) {
    const press = pressure(p);
    const dps = O.mode === 'dps';
    let best = null, bestS = -Infinity, bestRaw = -1, pushed = false;
    for (const c of choices) {
      let s;
      try { s = dps ? D.scoreDps(p, c, press) : D.score(p, c, press); } catch (e) { s = D.score(p, c, press) / 10; }
      const raw = s;
      if (O.style !== 'minmax') s = styled(p, c, s);
      if (s > bestS) { bestS = s; best = c; bestRaw = raw; pushed = s - raw > 500; }
    }
    bestS = O.style === 'minmax' ? bestS : bestRaw;
    if (O.reroll && O.style !== 'casual' && !pushed && bestS < (dps ? 2 : 30) && p.rerolls > 0 && WS.Game.rerollLevelUp()) {
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
