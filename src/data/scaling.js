/* WHAT GROWS WHAT.
 *
 * Every weapon grows with damage, cooldown and critical strikes. Beyond that,
 * each kind of weapon reads a different handful of stats, and the game never
 * said which: a player holding Volley and Knifestorm had no way to know that
 * Expanse does nothing for either, or that Duplicity adds a palm to Iron
 * Palms but nothing at all to Dawnpulse. This table is the one place that
 * says so, and the tooltips and level-up cards read it - a weapon's card
 * says what it grows with, a passive's says which of YOUR weapons it helps.
 *
 * It describes what src/game/weapon.js does; keep the two in step. Each
 * entry is keyed by behaviour and says, in a few words, what one more of the
 * stat buys that kind of weapon. */
'use strict';
(function (WS) {

  const S = {};

  S.STATS = {
    area: { name: 'Area' },
    count: { name: 'Projectiles' },
    duration: { name: 'Duration' },
    speed: { name: 'Projectile speed' },
  };

  // what one more of each stat buys each kind of weapon
  S.BEHAVIOR = {
    aimed: { count: 'one more bolt', speed: 'faster bolts' },
    spray: { count: 'one more arrow', speed: 'faster arrows' },
    ring: { count: 'one more knife', speed: 'faster knives' },
    bounce: { count: 'one more ricochet', speed: 'faster shield' },
    nova: { area: 'bigger burst' },
    zone: { area: 'bigger field', duration: 'lasts longer' },
    orbit: { count: 'one more blade', area: 'wider circle', duration: 'spins longer' },
    storm: { count: 'one more strike', area: 'wider storm, bigger strikes' },
    chain: { count: 'one more leap', area: 'longer leaps' },
    beam: { area: 'longer, wider line' },
    palm: { count: 'one more palm per flurry', area: 'longer reach' },
    herd: { count: 'one more beast', duration: 'longer run', speed: 'faster run', area: 'bigger burst at the end' },
    chakram: { count: 'one more ring', area: 'longer throw', speed: 'faster ring' },
  };

  // the kinds that launch bolts, which can carry a splash (weapon.js fillSpec)
  const BOLTS = { aimed: 1, spray: 1, ring: 1, bounce: 1, chakram: 1, herd: 1 };

  // which passives and blessings raise which stat
  S.UPGRADE_STAT = { area: 'area', quantity: 'count', perennial: 'duration', velocity: 'speed' };
  S.BLESSING_STAT = { moonlit: 'area' };

  /** What a weapon grows with, as [{ stat, name, what }]. Some entries only
   *  apply to some weapons of a kind: a bolt only has a splash to grow if it
   *  splashes, and the herd only bursts at the end of its run if something
   *  gave it a burst. */
  S.grows = function (w) {
    const data = w.data || WS.Weapons[w.id];
    const beh = (w.evolved && data.evolvedBehavior) || data.behavior;
    const row = S.BEHAVIOR[beh];
    if (!row) return [];
    const mods = w.mods || {};
    // anything that flies and bursts on impact grows its burst with Area
    const splash = BOLTS[beh] && (data.splash || mods.splash);
    const out = [];
    for (const stat of Object.keys(S.STATS)) {
      let what = row[stat];
      if (stat === 'area' && splash) what = what ? what + ', bigger splash' : 'bigger splash';
      if (!what) continue;
      if (beh === 'herd' && stat === 'area' && !(data.endBurst || mods.endBurst)) continue;
      out.push({ stat, name: S.STATS[stat].name, what });
    }
    return out;
  };

  /** Which of this survivor's weapons (and auras) a stat helps, and which it
   *  does nothing for. */
  S.helps = function (p, stat) {
    const yes = [], no = [];
    for (const w of p.weapons) {
      const hit = S.grows(w).find((g) => g.stat === stat);
      const name = (w.evolved && w.data.evolveName) || w.data.name;
      if (hit) yes.push({ name, what: hit.what }); else no.push(name);
    }
    if (stat === 'area') {
      if (p.retRank > 0) yes.push({ name: 'Searing Aura', what: 'wider aura', aura: true });
      if (p.chillRank > 0) yes.push({ name: 'Chilling Presence', what: 'wider aura', aura: true });
    }
    return { yes, no };
  };

  /** One line for a card: "Helps Axe Gyre, Thornbloom" or a warning. Short
   *  enough to sit on one line of a card. */
  S.helpsLine = function (p, stat) {
    if (!p.weapons.length) return null;
    const h = S.helps(p, stat);
    if (!h.yes.length) return { ready: false, text: 'No effect on your weapons yet' };
    const names = h.yes.map((x) => x.name);
    if (!h.no.length && names.length > 1) return { ready: true, text: 'Helps every weapon you carry' };
    if (names.length > 2) {
      const armed = h.yes.filter((x) => !x.aura).length;
      return { ready: true, text: `Helps ${armed} of your ${armed + h.no.length} weapons`
        + (armed < names.length ? ' and your aura' : '') };
    }
    return { ready: true, text: 'Helps ' + names.join(', ') };
  };

  WS.Scaling = S;

})(window.WS);
