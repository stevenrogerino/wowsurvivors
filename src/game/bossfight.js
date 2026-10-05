/* The scheduled bosses as fights.
 *
 * Measured over 160+ bot nights (tools/boss-snapshots.js, the data in
 * tools/bot/boss-snapshots.json), the bosses a night schedules were not
 * fights. Against the build that actually meets them they lived a median 6
 * to 13 seconds - Gnarlfang 7s at 16:00, Redcowl 6s at 22:00 - and took
 * nothing off the survivor while they were up (median 0% for five of seven).
 * Their kit was a summon, a fan of bolts, a ring of bolts and a charge, on a
 * three-to-four second clock: a boss died before it had used it twice, and
 * none of it asked the player to do anything but keep walking.
 *
 * The finales (src/game/finale.js) are the night's real fights; these are
 * its punctuation, so the change here is a light one:
 *
 *   HEALTH grows a little with the night, not to the build: on top of
 *     Wave.bossScale's (1 + t/500), Config.bossHealthCurve, x1.6 at 5:00 to
 *     x2.6 by 22:00 - enough for the median build to see the kit through.
 *
 *   ONE TELEGRAPHED BLOW each, in the finale's shapes (Finale.circle /
 *     lane / ring, run outside the finale by Finale.field): a slam where you
 *     are going, a barrage, a wave with openings, or a cross of lanes. It
 *     costs a SHARE of the survivor's health (BossFight.hit), so a mistake
 *     costs the same bite of the bar at 5:00 as at 27:00.
 *
 *   IT TURNS at half health: a flash, its line, an aura that stays, a
 *     quicker clock (Config.bossEnrageRate). A kit may name moves for the
 *     second phase only (`phase: 2`, the `signature` thrown as it turns);
 *     none of the scheduled bosses do today.
 *
 * Shapes may overlap - two at once is the pressure - but never into an
 * impossible pattern: Finale.threatAt keeps every answer (an opening, a
 * safe square) clear of whatever else lands at the same moment.
 *
 * Every shape obeys the finale's contract: it appears, it says how long you
 * have (never under Config.bossMinTele), and it does exactly what it drew.
 */
'use strict';
(function (WS) {

  const B = WS.BossFight = {};
  const C = () => WS.Config;

  /** How much more health a scheduled boss brings at `time`, on top of
   *  Wave.bossScale: Config.bossHealthCurve, linear between its points and
   *  flat past either end. */
  B.healthMult = function (time) {
    const pts = C().bossHealthCurve;
    if (!pts || !pts.length) return 1;
    if (time <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (time <= pts[i][0]) {
        const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
        return v0 + (v1 - v0) * (time - t0) / (t1 - t0);
      }
    }
    return pts[pts.length - 1][1];
  };

  /** Called by Wave.spawnBoss once the boss is on the field. */
  B.arrive = function (e, time, overtime) {
    const t = e.template;
    if (!t || t.finale || t.arena || t.family === 'death') return;
    /* Overtime's bosses already climb on their own (Config.endlessBossMult,
       endlessRampTime: x2.2 a 27:00 boss by 30:00 and rising) and come every
       75s down to 30s; the full curve on top of that stacked them three
       deep. They take Config.bossHealthOvertime of it instead. */
    const m = overtime ? 1 + (B.healthMult(time) - 1) * C().bossHealthOvertime : B.healthMult(time);
    e.maxHealth = WS.floor(e.maxHealth * m);
    e.health = e.maxHealth;
    e.fightAt = time;
    e.enraged = false;
    e.chainLeft = 0;
    e.cast = null;
  };

  /** What a telegraphed blow costs: `share` of the survivor's maximum
   *  health (before armour, which still applies), weighted by how late in
   *  the night it is and by the setting - or `mult` of the boss's own
   *  scaled damage if that is more. Capped at Config.bossHitCap of the bar,
   *  so nothing that can be read is a one-shot from full. */
  B.hit = function (e, share, mult) {
    const cfg = C(), p = WS.Game.player, run = WS.Game.run;
    const clock = run ? WS.WaveManager.clock(run) : 0;
    const late = WS.clamp((clock - 300) / 1320, 0, 1);
    const weight = (cfg.bossHitEarly + (cfg.bossHitLate - cfg.bossHitEarly) * late)
      * Math.pow((run ? run.diffScale : 1) * (run && run.hyper ? cfg.hyperScale : 1), cfg.bossHitDifficultyExp);
    const byShare = p ? p.maxHealth * share * weight : 0;
    const byBody = e.damage * (mult === undefined ? 1 : mult);
    const cap = p ? p.maxHealth * cfg.bossHitCap : Infinity;
    return WS.min(cap, WS.max(byShare, byBody));
  };

  /** The wind-up the boss itself shows while a shape is being drawn: a
   *  glow that gathers on it, and a line to where the blow will land. */
  function cast(e, dur, tint, to) {
    e.cast = { life: dur, max: dur, tint: tint || e.template.tint, to: to || null };
  }

  function tele(v, d) { return WS.max(C().bossMinTele, v !== undefined ? v : d); }

  /* ------------------------------------------------------------ patterns -- */
  /** One of the new shapes, or false if `pattern` is not one of them. */
  B.attack = function (e, pattern, dx, dy) {
    const F = WS.Finale, t = e.template, p = WS.Game.player;
    /* Its own colour, warmed a third of the way toward the danger red: a
       boss's shapes say whose they are, and none of them - Mordecai's green
       least of all - can be mistaken for the pale green of safe ground. */
    const tint = WS.mix(pattern.tint || t.tint, [1.0, 0.36, 0.22], 0.3);
    const src = { src: e, raw: true, tint };
    const opt = (k, d) => (pattern[k] !== undefined ? pattern[k] : d);
    switch (pattern.type) {
      case 'slam': {
        /* One heavy blow where the survivor is going. Lobbed (`lob`) it
           arcs over from the boss; otherwise the ground cracks under them. */
        const T = tele(pattern.tele, 1.15);
        const n = opt('count', 1);
        for (let k = 0; k < n; k++) {
          const [x, y] = k === 0 ? F.lead(T) : F.near(opt('scatter', 140), F.lead(T));
          F.circle(x, y, opt('radius', 96), T + k * opt('stagger', 0.35), B.hit(e, opt('share', 0.32), opt('mult', 1.0)), t.name,
            Object.assign({ style: pattern.lob ? 'blast' : 'stomp', from: pattern.lob ? { x: e.x, y: e.y - e.radius } : null }, src));
          if (k === 0) cast(e, T, tint, { x, y });
        }
        WS.Audio.play('warn', e.x);
        return true;
      }
      case 'barrage': {
        // Several smaller blows: one where you go, one where you are, the
        // rest around - walking on is not safe, and neither is stopping.
        const T = tele(pattern.tele, 1.05);
        const n = opt('count', 4);
        for (let k = 0; k < n; k++) {
          const [x, y] = F.target(k, n, T, opt('scatter', 170));
          F.circle(x, y, opt('radius', 70), T + k * opt('stagger', 0.16), B.hit(e, opt('share', 0.2), opt('mult', 0.7)), t.name,
            Object.assign({ style: pattern.style || 'blast', from: pattern.lob === false ? null : { x: e.x, y: e.y - e.radius },
              burn: pattern.burn ? 2.5 : 0 }, src));
        }
        cast(e, T, tint);
        WS.Audio.play('warn', e.x);
        return true;
      }
      case 'nova': {
        /* An expanding wave with openings, from where the boss stands -
           stand in an opening as it passes. The openings are always within
           reach (Finale.aimGap); a second wave (`waves: 2`) is aimed from
           the first one's opening, so it is one step and then the next. */
        const waves = opt('waves', 1);
        const delay = WS.max(0.35, opt('windup', 0.6));
        let prev = null;
        for (let k = 0; k < waves; k++) {
          prev = F.ring(e.x, e.y, Object.assign({
            speed: opt('speed', 210), gaps: opt('gaps', 2), gapWidth: opt('gap', 46), spin: opt('spin', 0),
            dmg: B.hit(e, opt('share', 0.28), opt('mult', 0.8)), name: t.name,
            delay: delay + k * opt('every', 1.25), after: prev, r0: e.radius,
          }, src));
        }
        cast(e, delay, tint);
        WS.Audio.play('warn', e.x);
        return true;
      }
      case 'cross': {
        /* Lanes out of the boss, one of them aimed at the survivor: step
           off the line. `lanes` evenly round; `twist` turns the set so it is
           not always a plus. */
        const T = tele(pattern.tele, 1.1);
        const n = opt('lanes', 4);
        const base = WS.atan2(dy, dx) + (pattern.offset ? WS.PI / n : 0);
        for (let k = 0; k < n; k++) {
          F.lane(e.x, e.y, base + (k / n) * WS.TAU, opt('length', 900), opt('width', 58), T,
            B.hit(e, opt('share', 0.3), opt('mult', 0.8)), t.name,
            Object.assign({ active: 0.32, style: 'shot', sound: k === 0 ? (pattern.sound || 'explode') : false }, src));
        }
        cast(e, T, tint);
        WS.Audio.play('warn', e.x);
        return true;
      }
      default: return false;
    }
  };

  /** The charge's blow, when it is a boss's: see Enemy.update's contact. */
  B.chargeHit = function (e, pattern) {
    return B.hit(e, pattern && pattern.share !== undefined ? pattern.share : 0.3, 1.0);
  };

  /* ------------------------------------------------------- every frame -- */
  /** The boss half of Enemy.update: the phase change, a chain of charges,
   *  the cast glow running down. */
  B.update = function (e, dt, dx, dy) {
    const t = e.template;
    if (e.cast) { e.cast.life -= dt; if (e.cast.life <= 0) e.cast = null; }
    if (!e.enraged && e.fightAt !== undefined && e.health <= e.maxHealth * C().bossEnrageAt) B.enrage(e, dx, dy);
    if (e.chainLeft > 0 && e.windup <= 0 && e.chargeTimer <= 0) {
      e.chainLeft--;
      const cfg = C();
      WS.Enemy.beginCharge(e, dx, dy, WS.max(cfg.bossMinTele + 0.1, cfg.chargeWindup * 0.8), cfg.chargeTime * 0.8,
        cfg.chargeRange * 0.85, cfg.bossChargeGirth, cfg.bossChargeLock);
      e.chargeHit = B.chargeHit(e, e.chainPattern);
      WS.Audio.play('warn', e.x);
    }
    if (e.enrageGlow > 0) e.enrageGlow -= dt;
    if (e.sigDue && e.windup <= 0 && e.chargeTimer <= 0 && !(e.chainLeft > 0)) {
      const sig = e.sigDue;
      e.sigDue = null;
      WS.Enemy.bossAttack(e, dx, dy, sig);
      e.attackTimer = WS.max(e.attackTimer, B.interval(e));
    }
    return t;
  };

  /** Half health: the second phase. */
  B.enrage = function (e, dx, dy) {
    const t = e.template;
    e.enraged = true;
    e.enrageGlow = 1.2;
    WS.FX.flash(e.x, e.y, e.radius * 4, t.tint, 0.7);
    WS.FX.burst(e.x, e.y, 22, WS.hex(t.tint), 260, 0.7, 4);
    WS.FX.shake(8, 0.5);
    WS.FX.screen('rgba(200,40,40,.16)', 0.5);
    WS.Audio.play('boss', e.x);
    const line = (t.enrage || 'Enraged').replace(/^\*|\*$/g, '');
    WS.Game.toast(t.name, line, { kind: 'warn', art: t.art, tint: t.tint });
    // Its signature, at once: the change is something you see happen.
    // (Its signature, as soon as it is not mid-charge.)
    e.sigDue = t.patterns.find((q) => q.signature) || t.patterns.find((q) => q.phase === 2) || null;
  };

  /** Which of the boss's patterns comes next: phase-two moves only once it
   *  is enraged. Its shapes may overlap anything else on the field - that
   *  is the pressure - and Finale.threatAt keeps the overlap possible: a
   *  wave's opening is never placed under another shape due at the same
   *  moment, and a circle is never dropped on an opening still to come. */
  B.next = function (e) {
    const pats = e.template.patterns;
    for (let n = 0; n < pats.length; n++) {
      const q = pats[e.patternIndex];
      e.patternIndex = (e.patternIndex + 1) % pats.length;
      if (q.phase === 2 && !e.enraged) continue;
      return q;
    }
    return pats[0];
  };

  /** Seconds between patterns: faster in the second phase. */
  B.interval = function (e) {
    const base = e.template.interval || C().bossInterval;
    return e.enraged ? base / C().bossEnrageRate : base;
  };

})(window.WS);
