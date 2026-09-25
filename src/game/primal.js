/* The two newest identity powers, and like Curdled Light and the Ruinous Pact
 * each is a blessing anyone can take, with one survivor a little further along
 * it than everyone else who took the same one.
 *
 *   WILDSHAPE (The Old Shapes). Kills feed the Wild. Fill it and you take the
 *   shape your arsenal leans to: a BEAR if you fight with steel, an OWLBEAR
 *   if you fight with spells. Milksupply fills it faster and holds a shape
 *   longer.
 *
 *   STILLWATER STEP. A hit you would take is spent stepping through it
 *   instead, and the palm lands on everything along the way. Each step builds
 *   Poise. Abbot Eisen has one more step, and they come back sooner.
 *
 * Every number is in Config, under the two long notes that explain them. */
'use strict';
(function (WS) {

  const Primal = {};
  const C = () => WS.Config;

  /** How much a strike from a shape or a step is worth, now. It grows with
   *  level the way a weapon grows with rank, and with everything that makes
   *  a weapon hit harder, so it never becomes a tickle at 25:00. */
  function strike(p, base, perLevel, mult) {
    return (base + perLevel * p.level) * p.damageMultiplier * (mult || 1)
      * WS.CONST.PLAYER_DAMAGE_SCALE;
  }

  /* ------------------------------------------------------------ the wild -- */
  Primal.wildNeed = function () {
    const run = WS.Game.run;
    const minutes = run ? run.time / 60 : 0;
    return C().wildNeedBase + C().wildNeedPerMinute * minutes;
  };

  /** Which shape the arsenal leans to: the levels of every physical weapon
   *  against the levels of everything else. A tie goes to the owlbear - a
   *  survivor with no steel in their hands is a caster. */
  Primal.lean = function (p) {
    let steel = 0, spell = 0;
    for (const w of p.weapons) {
      const n = w.level + (w.evolved ? 2 : 0);
      if (w.data.school === 'physical') steel += n; else spell += n;
    }
    return steel > spell ? 'bear' : 'owlbear';
  };

  Primal.formDuration = function (p) {
    return (C().formDuration + C().formDurationPerRank * p.kinship) * (1 + p.formBonus);
  };

  Primal.wildRecovery = function (p) {
    return WS.max(C().wildLockFloor, C().wildLock - C().wildLockPerRank * p.kinship);
  };

  Primal.onKill = function (p, e) {
    if (!p || p.wildAttuned <= 0 || p.formTimer > 0 || p.wildLock > 0) return;
    const cfg = C();
    let amount = e.boss ? cfg.wildBoss : e.elite ? cfg.wildElite : 1;
    const near = cfg.wildNear * p.areaMultiplier;
    if (WS.dist2(e.x, e.y, p.x, p.y) <= near * near) amount *= cfg.wildNearMult;
    p.wild += amount * (1 + p.wildBonus + cfg.wildPerRank * p.kinship);
    if (p.wild >= Primal.wildNeed()) Primal.shift(p);
  };

  Primal.shift = function (p) {
    p.wild = 0;
    p.form = Primal.lean(p);
    p.formTimer = Primal.formDuration(p);
    p.maulTimer = 0.3; p.starTimer = 0.3;
    p.shifts++;
    const run = WS.Game.run;
    if (run) run.shifts = (run.shifts || 0) + 1;
    WS.Save.stats.shifts = (WS.Save.stats.shifts || 0) + 1;
    const bear = p.form === 'bear';
    if (p.shifts <= 1) {
      WS.Game.announce(bear ? 'Bear!' : 'Owlbear!',
        bear ? 'Hide and weight and no patience left.' : 'Feather, claw, and a sky full of stars.',
        2.0, { kind: 'glory' });
    }
    const tint = bear ? [0.82, 0.56, 0.30] : [0.62, 0.52, 1.0];
    WS.FX.shake(8, 0.4);
    WS.FX.flash(p.x, p.y, 90, tint, 0.4);
    WS.FX.flash(p.x, p.y, 180, tint, 0.5, 9, bear ? 'physical' : 'arcane');
    WS.FX.burst(p.x, p.y, 22, WS.hex(tint), 260, 0.7, 4);
    WS.Audio.play('shift');
  };

  function unshift(p) {
    p.form = null;
    p.formTimer = 0;
    p.wildLock = Primal.wildRecovery(p);
    WS.FX.flash(p.x, p.y, 100, [0.62, 0.8, 0.45], 0.4);
    WS.FX.notice(p.x, p.y, 'The wild sleeps', '#b8e08a');
  }

  function maul(p) {
    const cfg = C();
    const r = cfg.maulRadius * p.areaMultiplier;
    const dmg = strike(p, cfg.maulBase, cfg.maulPerLevel, 1 + cfg.kinshipDamage * p.kinship);
    WS.Enemy.damageArea(p.x, p.y, r, dmg, null, cfg.maulKnock, 'maul');
    WS.FX.flash(p.x, p.y, r, [0.86, 0.62, 0.36], 0.26, 7, 'physical');
    WS.FX.flash(p.x, p.y, r * 0.55, [1.0, 0.86, 0.66], 0.18);
    WS.FX.shake(2.5, 0.12);
    WS.Audio.play('maul', p.x);
  }

  function star(p) {
    const cfg = C();
    const e = WS.Enemy.findNearest(p.x, p.y, cfg.owlStarRange);
    if (!e) return;
    const r = cfg.owlStarRadius * p.areaMultiplier;
    const dmg = strike(p, cfg.owlStarBase, cfg.owlStarPerLevel, 1 + cfg.kinshipDamage * p.kinship);
    WS.Enemy.damageArea(e.x, e.y, r, dmg, null, 10, 'starfell');
    const col = [0.72, 0.62, 1.0];
    const beam = WS.Projectile.spawnBeam(e.x + 40, e.y - 220, e.x, e.y, 10, col, 0.22);
    if (beam) { beam.rank = 4; beam.art = 'moon'; }
    WS.FX.flash(e.x, e.y, r, col, 0.28, 8, 'arcane');
    WS.Audio.play('star', e.x);
  }

  /* ----------------------------------------------------------- the step -- */
  Primal.maxSteps = function (p) {
    if (p.flowAttuned <= 0) return 0;
    return C().flowSteps + p.flowBonusSteps + (p.serenity >= 3 ? 1 : 0) + (p.serenity >= 5 ? 1 : 0);
  };

  Primal.stepRecharge = function (p) {
    const cfg = C();
    return WS.max(cfg.flowRechargeFloor,
      (cfg.flowRecharge - cfg.flowRechargePerRank * p.serenity) * p.flowRechargeMult);
  };

  /** Called at the top of takeDamage. True if the blow was stepped through. */
  Primal.tryStep = function (p) {
    if (p.flowAttuned <= 0 || p.flowSteps <= 0) return false;
    const cfg = C();
    p.flowSteps--;
    if (p.flowTimer <= 0) p.flowTimer = Primal.stepRecharge(p);
    /* Which way: the way they are already going, if they are going anywhere,
       because a step that throws a moving survivor backwards is the game
       taking the controls. Standing still, away from whatever is closest. */
    let dx = p.lastDirX, dy = p.lastDirY;
    if (!p.moving) {
      const e = WS.Enemy.findNearest(p.x, p.y, 220);
      if (e) [dx, dy] = WS.normalize(p.x - e.x, p.y - e.y);
    }
    if (!dx && !dy) dx = p.facing || 1;
    const ab = WS.Game.arenaBounds;
    const minX = (ab ? ab.minX : 0) + p.radius, maxX = (ab ? ab.maxX : WS.CONST.WORLD_WIDTH) - p.radius;
    const minY = (ab ? ab.minY : 0) + p.radius, maxY = (ab ? ab.maxY : WS.CONST.WORLD_HEIGHT) - p.radius;
    const x0 = p.x, y0 = p.y;
    const x1 = WS.clamp(x0 + dx * cfg.flowDistance, minX, maxX);
    const y1 = WS.clamp(y0 + dy * cfg.flowDistance, minY, maxY);
    p.x = x1; p.y = y1;
    if (dx) p.facing = dx < 0 ? -1 : 1;
    // The palm lands on everything the step passed through.
    const dmg = strike(p, cfg.flowStrikeBase, cfg.flowStrikePerLevel, 1 + cfg.serenityStrike * p.serenity);
    WS.Enemy.damageLine(x0, y0, x1, y1, cfg.flowStrikeWidth * p.areaMultiplier * 0.5, dmg, 'stillwater');
    p.invulnerable = WS.max(p.invulnerable, cfg.flowGrace);
    p.poise = WS.min(cfg.poiseMax, p.poise + 1);
    p.poiseTimer = cfg.poiseTime;
    p.dashes++;
    const run = WS.Game.run;
    if (run) run.dashes = (run.dashes || 0) + 1;
    WS.Save.stats.dashes = (WS.Save.stats.dashes || 0) + 1;
    p.dashTrail = { x0, y0, x1, y1, life: 0.34, max: 0.34 };
    WS.FX.flash(x0, y0, 30, [0.7, 0.9, 1.0], 0.2);
    WS.FX.flash(x1, y1, 38, [0.85, 0.95, 1.0], 0.22, 6, 'physical');
    WS.Audio.play('dash', x1);
    return true;
  };

  /* ---------------------------------------------------------- per frame -- */
  Primal.update = function (p, dt) {
    if (p.moving) {
      const k = WS.Input.keys;
      const mx = (k.right ? 1 : 0) - (k.left ? 1 : 0), my = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      if (mx || my) [p.lastDirX, p.lastDirY] = WS.normalize(mx, my);
    }

    // The wild.
    if (p.wildLock > 0) p.wildLock = WS.max(0, p.wildLock - dt);
    if (p.formTimer > 0) {
      p.formTimer -= dt;
      if (p.form === 'bear') {
        p.maulTimer -= dt;
        if (p.maulTimer <= 0) { p.maulTimer = C().maulEvery; maul(p); }
      } else if (p.form === 'owlbear') {
        p.starTimer -= dt;
        if (p.starTimer <= 0) { p.starTimer = C().owlStarEvery; star(p); }
      }
      if (p.formTimer <= 0) unshift(p);
    }

    // The step.
    const max = Primal.maxSteps(p);
    if (p.flowSteps < max) {
      p.flowTimer -= dt;
      if (p.flowTimer <= 0) {
        p.flowSteps++;
        p.flowTimer = p.flowSteps < max ? Primal.stepRecharge(p) : 0;
      }
    } else p.flowTimer = 0;
    if (p.poiseTimer > 0) {
      p.poiseTimer -= dt;
      if (p.poiseTimer <= 0) p.poise = 0;
    }
    if (p.dashTrail) {
      p.dashTrail.life -= dt;
      if (p.dashTrail.life <= 0) p.dashTrail = null;
    }
  };

  /* -------------------------------------------------- what they change -- */
  /** A weapon's damage, through the shape and the poise. */
  Primal.damageMult = function (p, w) {
    let m = 1;
    if (p.formTimer > 0) {
      const steel = w.data.school === 'physical';
      if (p.form === 'bear' && steel) m *= 1 + C().bearPhysical;
      if (p.form === 'owlbear' && !steel) m *= 1 + C().owlMagic;
      m *= 1 + C().kinshipDamage * p.kinship;
    }
    if (p.poise > 0) m *= 1 + C().poiseDamage * p.poise;
    return m;
  };

  Primal.cooldownMult = function (p, w) {
    if (p.formTimer > 0 && p.form === 'owlbear' && w.data.school !== 'physical') return C().owlCooldownMult;
    return 1;
  };

  /** What reaches the survivor of a blow, after the bear's hide. */
  Primal.mitigate = function (p, amount) {
    return (p.formTimer > 0 && p.form === 'bear') ? amount * (1 - C().bearMitigation) : amount;
  };

  Primal.moveMult = function (p) {
    return (p.formTimer > 0 && p.form === 'bear') ? C().bearMoveMult : 1;
  };

  WS.Primal = Primal;

})(window.WS);
