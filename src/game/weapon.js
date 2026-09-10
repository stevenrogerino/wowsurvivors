/* Weapon behaviors: turn a weapon's data plus the survivor's stats into
 * projectiles, zones, orbits and beams. A new weapon usually needs only data
 * in src/data/weapons.js; a genuinely new pattern gets a handler here. */
'use strict';
(function (WS) {

  const Weapon = {};

  // One scratch spec per shot; fields are copied out by launchBolt.
  const spec = {};
  const RETRY_COOLDOWN = 0.25;   // nothing in range - look again shortly

  /* --------------------------------------------------------- derivation -- */
  function damageOf(player, w) {
    const cfg = WS.Config, d = w.data;
    const step = d.rankDamageStep || cfg.rankDamageStep;
    let base = d.damage * (1 + step * (w.level - 1))
      * player.damageMultiplier * (w.mods.damageMult || 1);
    if (w.evolved) base *= (d.evolveDamageMult || cfg.evolveDamageMult);
    if (player.metaTimer > 0) base *= cfg.metaDamageMult;
    if (!d.noNerf) base *= WS.CONST.PLAYER_DAMAGE_SCALE;
    return base;
  }

  function countOf(player, w) {
    const cfg = WS.Config, d = w.data;
    let count = d.projectiles || 1;
    if (w.level >= (d.projRankA || cfg.projRankA)) count++;
    if (w.level >= (d.projRankB || cfg.projRankB)) count++;
    count += player.projectileBonus + (w.mods.extraProjectiles || 0);
    if (w.evolved) count += (d.evolveProjectiles || cfg.evolveProjectiles);
    return count;
  }

  function areaOf(player, w, base) {
    const cfg = WS.Config, d = w.data;
    const step = d.rankAreaStep || cfg.rankAreaStep;
    const evo = w.evolved ? (d.evolveAreaMult || cfg.evolveAreaMult) : 1;
    return base * player.areaMultiplier * (1 + step * (w.level - 1)) * evo * (w.mods.areaMult || 1);
  }

  function speedOf(player, w) {
    let s = (w.data.speed || 400) * player.projectileSpeed;
    if (!w.data.noNerf) s *= WS.CONST.PLAYER_SPEED_SCALE;
    return s;
  }

  function durationOf(player, w, base) {
    return base * (1 + WS.Config.rankDurationStep * (w.level - 1));
  }

  Weapon.cooldown = function (player, w) {
    const d = w.data, cfg = WS.Config;
    let base = d.cooldown * player.cooldownMultiplier
      * (w.evolved ? (d.evolveCooldownMult || cfg.evolveCooldownMult) : 1);
    if (!d.noNerf) base *= WS.CONST.PLAYER_COOLDOWN_SCALE;
    if (player.metaTimer > 0) base *= cfg.metaCooldownMult;
    // A runaway multiplier must never silently switch a weapon off.
    if (!(base > 0) || base > 20) base = 20;
    if (base < 0.05) base = 0.05;
    return base;
  };

  /** What a weapon actually puts out at a given rank, through the same
   *  derivation the game fires with.
   *
   *  Written for the tuning bench, which needs to show what rank 4 of a
   *  weapon is worth while you are dragging its damage around. It could have
   *  reimplemented these three formulas; it must not, because a preview that
   *  drifts from the code is worse than no preview - you tune against the
   *  wrong number and never find out. So the bench asks the game.
   *
   *  `player` may be omitted, in which case a bare survivor is used and the
   *  answer is the weapon on its own, before any build. */
  Weapon.preview = function (id, level, evolved, player) {
    const data = WS.Weapons[id];
    if (!data) return null;
    let p = player;
    if (!p) {
      /* A deliberately neutral survivor. Player.create applies the chosen
         character's perk, and a preview quietly carrying the mage's cooldown
         bonus is exactly the kind of wrong number this exists to prevent. */
      p = Weapon._probe || (Weapon._probe = WS.Player.create('mage'));
      p.damageMultiplier = 1; p.cooldownMultiplier = 1; p.areaMultiplier = 1;
      p.projectileBonus = 0; p.projectileSpeed = 1; p.metaTimer = 0;
    }
    const w = { id, data, level: level || 1, evolved: !!evolved, mods: {} };
    const damage = damageOf(p, w);
    const count = countOf(p, w);
    const cooldown = Weapon.cooldown(p, w);
    /* dps is the reach model at a crowd of one, NOT damage x count / cooldown.
     * countOf is a projectile count, and six of the ten behaviours never read
     * one - a nova does not fire projectiles - so the old arithmetic reported
     * Dawnpulse at three times its real output and nothing said so. Asking the
     * reach model for the single-target case is the same question one way. */
    const one = Weapon.reach(id, w.level, w.evolved, 1, p);
    return { damage, count, cooldown, hits: one ? one.targets : count,
      dps: one ? one.dps : damage * count / cooldown,
      area: areaOf(p, w, 1), speed: speedOf(p, w) };
  };

  /** The colour a weapon paints with - data may override its school palette. */
  function schoolColour(w) {
    if (w.evolved && w.data.evolvedColor) return w.data.evolvedColor;
    return w.data.color || WS.CONST.COLORS[w.data.school];
  }

  Weapon.colour = schoolColour;

  /** The behavior actually used: an evolution may change it (Moonbrand). */
  function behaviorOf(w) {
    return (w.evolved && w.data.evolvedBehavior) || w.data.behavior;
  }
  Weapon.behaviorOf = behaviorOf;

  function fillSpec(player, w) {
    const d = w.data, cfg = WS.Config;
    spec.damage = damageOf(player, w);
    spec.life = d.life || 2.0;
    spec.radius = (d.radius || 8) * (1 + cfg.rankRadiusStep * (w.level - 1))
      * (w.evolved ? cfg.evolveRadiusMult : 1);
    spec.pierce = (d.pierce || 0) + (w.evolved ? cfg.evolvePierce : 0);
    spec.art = d.art;
    spec.colour = schoolColour(w);
    /* Decided HERE, with every other mod, and not inside one behaviour.
     *
     * This used to live in fireAimedShot alone, which meant `homing` was a
     * property only the `aimed` weapons had. Truestrike sets it on Volley, and
     * Volley is `spray` - so the discovery whose entire purpose is to make
     * arrows curve had never once made an arrow curve. Nothing said so: the
     * mod was set, the toast fired, the codex recorded it.
     *
     * The flag and the initial mark are separate because they answer different
     * questions. `homing` is whether this bolt steers at all; `homingTarget` is
     * who it starts out aimed at, which behaviours that have no single target -
     * a ring, a nova - simply do not have. A bolt with the flag and no mark
     * acquires one on its first update. */
    spec.homing = !!(d.homing || w.mods.homing);
    spec.homingTarget = null;
    const splash = d.splash || w.mods.splash;
    spec.splash = splash ? areaOf(player, w, splash) : null;
    spec.slowFactor = d.slowFactor || w.mods.slowFactor;
    spec.slowDuration = d.slowDuration || w.mods.slowDuration;
    spec.bounces = 0;
    spec.source = w.id;
    spec.heal = (w.evolved ? (d.evolvedHeal || 0) : 0) + (w.mods.healBonus || 0) + (d.heal || 0);
    spec.procChain = d.procChain || w.mods.procChain || 0;
    spec.spinRate = d.art === 'dagger' || d.art === 'axe' ? 14 : 0;
    return spec;
  }

  /* ---------------------------------------------------------- behaviors -- */
  Weapon.behaviors = {};

  function fireAimedShot(player, w, target) {
    const d = w.data;
    fillSpec(player, w);
    const speed = speedOf(player, w);
    const [dx, dy] = WS.normalize(target.x - player.x, target.y - player.y);
    if (spec.homing) spec.homingTarget = target;
    WS.Projectile.launchBolt(player.x, player.y, dx * speed, dy * speed, spec);
  }

  Weapon.behaviors.aimed = function (player, w) {
    const d = w.data;
    const target = WS.Enemy.findNearest(player.x, player.y, d.range || 560);
    if (!target) { w.cooldown = RETRY_COOLDOWN; return false; }
    const count = countOf(player, w);
    if (d.burst) {
      // Magic-missile style: the rest of the volley trickles out one at a time,
      // each re-acquiring the nearest enemy (see player.js).
      fireAimedShot(player, w, target);
      w.burstShots = count - 1;
      w.burstTimer = 0.09;
    } else {
      for (let i = 0; i < count; i++) {
        const t = i === 0 ? target : (WS.Enemy.findNearest(player.x, player.y, d.range || 560) || target);
        fireAimedShot(player, w, t);
      }
    }
    return true;
  };

  Weapon.fireBurstShot = function (player, w) {
    const d = w.data;
    const target = WS.Enemy.findNearest(player.x, player.y, d.range || 560);
    if (!target) return;
    fireAimedShot(player, w, target);
  };

  Weapon.behaviors.spray = function (player, w) {
    const d = w.data;
    const target = WS.Enemy.findNearest(player.x, player.y, d.range || 560);
    if (!target) { w.cooldown = RETRY_COOLDOWN; return false; }
    fillSpec(player, w);
    const speed = speedOf(player, w);
    const count = countOf(player, w);
    const [dx, dy] = WS.normalize(target.x - player.x, target.y - player.y);
    if (spec.homing) spec.homingTarget = target;
    const spread = d.spread || 0.16;
    for (let i = 0; i < count; i++) {
      const a = (i - (count - 1) / 2) * spread;
      const c = WS.cos(a), s = WS.sin(a);
      WS.Projectile.launchBolt(player.x, player.y,
        (dx * c - dy * s) * speed, (dx * s + dy * c) * speed, spec);
    }
    return true;
  };

  Weapon.behaviors.ring = function (player, w) {
    fillSpec(player, w);
    const speed = speedOf(player, w);
    const count = countOf(player, w);
    const offset = WS.random() * WS.TAU;
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * WS.TAU;
      WS.Projectile.launchBolt(player.x, player.y, WS.cos(a) * speed, WS.sin(a) * speed, spec);
    }
    return true;
  };

  Weapon.behaviors.nova = function (player, w) {
    const d = w.data;
    const radius = areaOf(player, w, d.radius || 150);
    const damage = damageOf(player, w);
    const colour = schoolColour(w);
    const heal = (w.evolved ? (d.evolvedHeal || 0) : 0) + (w.mods.healBonus || 0) + (d.heal || 0);

    WS.Enemy.damageArea(player.x, player.y, radius, damage, null, d.knockback, w.id);
    WS.FX.flash(player.x, player.y, radius, colour, d.expandTime || 0.35);
    WS.FX.flash(player.x, player.y, radius * 0.6, colour, (d.expandTime || 0.35) * 0.7);
    if (heal > 0) WS.Player.heal(player, heal, 'holy');
    WS.Audio.play('cast');
    return true;
  };

  Weapon.behaviors.zone = function (player, w) {
    const d = w.data;
    WS.Projectile.spawnZone(player.x, player.y,
      areaOf(player, w, d.radius || 120),
      damageOf(player, w),
      durationOf(player, w, d.duration || 4),
      d.tickRate || 0.5,
      schoolColour(w), w.id,
      (w.evolved ? (d.evolvedHeal || 0) : 0) + (w.mods.healBonus || 0));
    WS.Audio.play('cast');
    return true;
  };

  Weapon.behaviors.chain = function (player, w) {
    const d = w.data;
    const range = areaOf(player, w, d.range || 250);
    const first = WS.Enemy.findNearest(player.x, player.y, range * 1.6);
    if (!first) { w.cooldown = RETRY_COOLDOWN; return false; }
    const chains = (d.chains || 4) + player.projectileBonus + (w.evolved ? 2 : 0);
    Weapon.chainFrom(player.x, player.y, damageOf(player, w), chains, range, w.id, schoolColour(w));
    WS.Audio.play('cast');
    return true;
  };

  /** Shared lightning hop, also used by the Tempest proc. */
  Weapon.chainFrom = function (x, y, damage, chains, range, source, colour) {
    colour = colour || WS.CONST.COLORS.nature;
    const visited = new Set();
    let px = x, py = y;
    for (let i = 0; i < chains; i++) {
      const target = WS.Enemy.findNearest(px, py, range, visited);
      if (!target) break;
      visited.add(target);
      WS.Projectile.spawnBeam(px, py, target.x, target.y, 4, colour, 0.16);
      WS.Enemy.hit(target, damage * (1 - i * 0.06), source);
      WS.FX.flash(target.x, target.y, 22, colour, 0.18);
      px = target.x; py = target.y;
      if (target._dead) continue;
    }
  };

  Weapon.behaviors.orbit = function (player, w) {
    const d = w.data, cfg = WS.Config;
    let count = (d.projectiles || 2) + player.projectileBonus + (w.mods.extraProjectiles || 0);
    let speed = d.orbitSpeed || 4.2;
    if (w.evolved) { count += cfg.evolveOrbitBlades; speed *= cfg.evolveOrbitSpeed; }
    if (w.level >= cfg.projRankA) count++;
    if (w.level >= cfg.projRankB) count++;

    if (w.mods.novaOnCast) {
      // Radiant Gyre discovery: the whirl opens with a pulse of Light.
      const r = 130 * player.areaMultiplier;
      WS.Enemy.damageArea(player.x, player.y, r, damageOf(player, w) * 0.8, null, 20, w.id);
      WS.FX.flash(player.x, player.y, r, WS.CONST.COLORS.holy, 0.3);
    }

    WS.Projectile.spawnOrbit(player, count,
      areaOf(player, w, d.orbitRadius || 85), speed,
      damageOf(player, w) * 0.5,             // orbits re-hit often, so per-tick is lower
      areaOf(player, w, d.radius || 20),
      durationOf(player, w, d.duration || 3.2),
      schoolColour(w), w.id, d.procChain || w.mods.procChain || 0);
    player.spinTimer = durationOf(player, w, d.duration || 3.2);
    WS.Audio.play('cast');
    return true;
  };

  Weapon.behaviors.storm = function (player, w) {
    const d = w.data;
    const strikes = (d.strikes || 5) + player.projectileBonus + (w.evolved ? 2 : 0);
    const radius = areaOf(player, w, d.stormRadius || 230);
    const splash = areaOf(player, w, d.splash || 60);
    const damage = damageOf(player, w);
    const colour = schoolColour(w);
    let landed = 0;
    for (let i = 0; i < strikes; i++) {
      const target = WS.Enemy.findNearest(player.x, player.y, radius,
        null);
      let sx, sy;
      if (target && WS.random() < 0.85) {
        sx = target.x + WS.randRange(-30, 30);
        sy = target.y + WS.randRange(-30, 30);
      } else {
        const a = WS.random() * WS.TAU, r = WS.random() * radius;
        sx = player.x + WS.cos(a) * r;
        sy = player.y + WS.sin(a) * r;
      }
      WS.Enemy.damageArea(sx, sy, splash, damage, null, null, w.id);
      WS.FX.flash(sx, sy, splash, colour, 0.32);
      WS.FX.burst(sx, sy, 5, WS.hex(colour), 110, 0.35, 2.5);
      landed++;
    }
    if (landed) WS.Audio.play('cast');
    return true;
  };

  Weapon.behaviors.bounce = function (player, w) {
    const d = w.data;
    const target = WS.Enemy.findNearest(player.x, player.y, d.range || 600);
    if (!target) { w.cooldown = RETRY_COOLDOWN; return false; }
    fillSpec(player, w);
    spec.bounces = (d.bounces || 3) + (w.mods.extraBounces || 0)
      + player.projectileBonus + (w.evolved ? 3 : 0);
    spec.spinRate = 16;
    const speed = speedOf(player, w);
    const count = 1 + (w.evolved ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const t = i === 0 ? target : (WS.Enemy.findNearest(player.x, player.y, d.range || 600, new Set([target])) || target);
      const [dx, dy] = WS.normalize(t.x - player.x, t.y - player.y);
      WS.Projectile.launchBolt(player.x, player.y, dx * speed, dy * speed, spec);
    }
    return true;
  };

  Weapon.behaviors.beam = function (player, w) {
    const d = w.data;
    const target = WS.Enemy.findNearest(player.x, player.y, d.range || 620);
    if (!target) { w.cooldown = RETRY_COOLDOWN; return false; }
    const [dx, dy] = WS.normalize(target.x - player.x, target.y - player.y);
    const range = areaOf(player, w, d.range || 620);
    let width = areaOf(player, w, d.beamWidth || 26);
    if (player.metaTimer > 0) width *= (d.metaWidthMult || 1.8);
    const x2 = player.x + dx * range, y2 = player.y + dy * range;
    const damage = damageOf(player, w);
    WS.Enemy.damageLine(player.x, player.y, x2, y2, width * 0.5, damage, w.id);
    WS.Projectile.spawnBeam(player.x, player.y, x2, y2, width, schoolColour(w), 0.22);
    WS.FX.flash(player.x, player.y, width, schoolColour(w), 0.2);
    WS.Audio.play('cast');
    return true;
  };

  /* --------------------------------------------------------------- reach --
   *
   * How many things one activation of a weapon actually touches, and what it
   * therefore does per second against a crowd.
   *
   * THIS LIVES HERE, BESIDE THE BEHAVIORS, AND NOT IN THE TUNING BENCH. The
   * bench had its own copy and it was wrong about seven of the ten behaviors:
   * it read `radius` on an orbit (the size of one axe) as if it were an area
   * of effect, it did not know what a beam, a bounce or a storm was at all,
   * and it ignored how many projectiles a weapon launches - so Knifestorm,
   * which throws six knives that each pierce, was projected as single-target.
   * A model of the code that lives away from the code drifts from it silently.
   *
   * Every entry below is derived from the handler directly above it, and
   * REACH_MODELS is keyed by behavior name so that adding an eleventh behavior
   * without saying what it reaches is a hole a check can see. `crowd` is how
   * many enemies are on the field; they are assumed spread evenly over it,
   * which is the one assumption here that is a guess rather than a reading -
   * real crowds bunch toward the survivor, so area weapons do better than
   * this says and single-target weapons no worse.
   */
  const FIELD = () => WS.CONST.WORLD_WIDTH * WS.CONST.WORLD_HEIGHT;
  /** Expected enemies inside a circle of radius r. Never less than one - you
   *  do not fire a weapon at nothing - and never more than there are. That
   *  upper clamp is what makes crowd = 1 mean "single target" for every
   *  behaviour, so one function answers both questions. */
  const clamp1 = (n, crowd) => Math.max(1, Math.min(crowd, n));
  const inCircle = (r, crowd) => clamp1(crowd * Math.PI * r * r / FIELD(), crowd);
  /** ...and inside a line of that length and full width. */
  const inLine = (len, width, crowd) => clamp1(crowd * len * width / FIELD(), crowd);

  const REACH_MODELS = {
    /* Each of `count` bolts passes through pierce+1 enemies, and every one of
       those hits splashes if the weapon splashes. */
    aimed: (p, w, crowd, q) => {
      // Pierce is worth nothing against one enemy, so it is capped by the crowd.
      const hits = Math.min(q.pierce + 1, crowd);
      const each = w.data.splash ? inCircle(q.splash, crowd) : 1;
      return { per: q.count * hits * each,
        why: `${q.count} shot(s) x ${hits} through`
          + (w.data.splash ? ` x ${each.toFixed(1)} in splash` : '') };
    },
    spray: (p, w, crowd, q) => REACH_MODELS.aimed(p, w, crowd, q),
    ring: (p, w, crowd, q) => REACH_MODELS.aimed(p, w, crowd, q),
    /* One disc per count, ricocheting between bounces+1 targets. */
    bounce: (p, w, crowd, q) => {
      const hits = Math.min((w.data.bounces || 3) + p.projectileBonus
        + (w.evolved ? 3 : 0) + 1, crowd);
      const n = 1 + (w.evolved ? 1 : 0);
      return { per: n * hits, why: `${n} disc(s) x ${hits} target(s)` };
    },
    /* A line of fire the full length of its range. */
    beam: (p, w, crowd) => {
      const len = areaOf(p, w, w.data.range || 620);
      const wid = areaOf(p, w, w.data.beamWidth || 26);
      const n = inLine(len, wid, crowd);
      return { per: n, why: `${Math.round(len)}x${Math.round(wid)} line` };
    },
    /* Everything inside the burst, once. */
    nova: (p, w, crowd) => {
      const r = areaOf(p, w, w.data.radius || 150);
      return { per: inCircle(r, crowd), why: `burst r=${Math.round(r)}` };
    },
    /* Everything inside the field, once per tick, for its whole duration. */
    zone: (p, w, crowd) => {
      const r = areaOf(p, w, w.data.radius || 120);
      const ticks = Math.max(1, Math.round(durationOf(p, w, w.data.duration || 4)
        / (w.data.tickRate || 0.5)));
      return { per: inCircle(r, crowd) * ticks,
        why: `r=${Math.round(r)} x ${ticks} ticks` };
    },
    /* Hops from target to target, each hop 6% weaker than the last. */
    chain: (p, w, crowd) => {
      const chains = (w.data.chains || 4) + p.projectileBonus + (w.evolved ? 2 : 0);
      let sum = 0;
      for (let i = 0; i < Math.min(chains, Math.max(1, crowd)); i++) sum += 1 - i * 0.06;
      return { per: sum, why: `${chains} hops, each 6% weaker` };
    },
    /* Several bolts, each with its own splash. */
    storm: (p, w, crowd) => {
      const strikes = (w.data.strikes || 5) + p.projectileBonus + (w.evolved ? 2 : 0);
      const splash = areaOf(p, w, w.data.splash || 60);
      const each = inCircle(splash, crowd);
      return { per: strikes * each,
        why: `${strikes} strikes x ${each.toFixed(1)} in r=${Math.round(splash)}` };
    },
    /* Blades circling the survivor. Each carries HALF the weapon's damage and
       may re-hit every 0.18s for the whole spin, which is why an orbit reads
       as weak on a single-target chart and is not. */
    orbit: (p, w, crowd) => {
      const cfg = WS.Config;
      let blades = (w.data.projectiles || 2) + p.projectileBonus;
      if (w.evolved) blades += cfg.evolveOrbitBlades;
      if (w.level >= cfg.projRankA) blades++;
      if (w.level >= cfg.projRankB) blades++;
      const size = areaOf(p, w, w.data.radius || 20);
      const ticks = Math.max(1, Math.round(durationOf(p, w, w.data.duration || 3.2) / 0.18));
      /* hitBy is cleared once per tick and shared by every blade, so within a
         tick each enemy takes at most ONE hit however many blades sweep it.
         Without that cap a four-bladed gyre read as four hundred single-target
         dps, which is four times the best weapon in the game. */
      const perTick = clamp1(blades * inCircle(size, crowd), crowd);
      return { per: 0.5 * ticks * perTick, halved: true,
        why: `${blades} blades x ${ticks} sweeps, ${perTick.toFixed(1)} hit(s) a sweep, `
          + 'at half damage' };
    },
  };
  Weapon.reachModels = REACH_MODELS;

  /** Total damage per second against `crowd` enemies on the field.
   *
   *  Returns null for a behavior nobody has modelled, rather than quietly
   *  guessing single-target - a missing model should be visible. */
  Weapon.reach = function (id, level, evolved, crowd, player) {
    const data = WS.Weapons[id];
    if (!data) return null;
    const b = (evolved && data.evolvedBehavior) || data.behavior;
    const model = REACH_MODELS[b];
    if (!model) return null;
    let p = player;
    if (!p) {
      p = Weapon._probe || (Weapon._probe = WS.Player.create('mage'));
      p.damageMultiplier = 1; p.cooldownMultiplier = 1; p.areaMultiplier = 1;
      p.projectileBonus = 0; p.projectileSpeed = 1; p.metaTimer = 0;
    }
    const w = { id, data, level: level || 1, evolved: !!evolved, mods: {} };
    const q = {
      count: countOf(p, w),
      pierce: (data.pierce || 0) + (w.evolved ? WS.Config.evolvePierce : 0),
      splash: data.splash ? areaOf(p, w, data.splash) : 0,
    };
    const r = model(p, w, Math.max(1, crowd || 1), q);
    const damage = damageOf(p, w);
    const cooldown = Weapon.cooldown(p, w);
    // `per` already counts every projectile, so it is not multiplied by count
    // again - the models that use q.count have folded it in themselves.
    return { behavior: b, targets: r.per, why: r.why,
      dps: damage * r.per / cooldown };
  };

  /* --------------------------------------------------------------- fire -- */
  Weapon.fire = function (player, w) {
    const handler = Weapon.behaviors[behaviorOf(w)];
    if (!handler) return;
    const fired = handler(player, w);
    if (fired === false) return;
    // A muzzle flash in the weapon's own colour, so a six-weapon build reads
    // as six distinct instruments rather than one undifferentiated stream.
    const b = behaviorOf(w);
    if (b === 'aimed' || b === 'spray' || b === 'ring' || b === 'bounce') {
      WS.FX.flash(player.x, player.y, 26, schoolColour(w), 0.16);
    }
    if (w.data.behavior === 'aimed') WS.Audio.play('cast');
  };

  /* ---------------------------------------------------------- describe -- */
  /** Human-readable current stats, used by the pause sheet and tooltips. */
  Weapon.describe = function (player, w) {
    const d = w.data;
    const lines = [];
    const behavior = behaviorOf(w);
    lines.push(['Damage', WS.round(damageOf(player, w))]);
    lines.push(['Cooldown', Weapon.cooldown(player, w).toFixed(2) + 's']);
    if (behavior === 'nova' || behavior === 'zone') {
      lines.push(['Radius', WS.round(areaOf(player, w, d.radius || 120))]);
    } else if (behavior === 'chain') {
      lines.push(['Chains', (d.chains || 4) + player.projectileBonus + (w.evolved ? 2 : 0)]);
    } else if (behavior === 'orbit') {
      lines.push(['Blades', (d.projectiles || 2) + player.projectileBonus + (w.evolved ? WS.Config.evolveOrbitBlades : 0)]);
    } else if (behavior === 'storm') {
      lines.push(['Strikes', (d.strikes || 5) + player.projectileBonus + (w.evolved ? 2 : 0)]);
    } else if (behavior === 'beam') {
      lines.push(['Width', WS.round(areaOf(player, w, d.beamWidth || 26))]);
    } else {
      lines.push(['Projectiles', countOf(player, w)]);
      if ((d.pierce || 0) > 0 || w.evolved) {
        lines.push(['Pierce', (d.pierce || 0) + (w.evolved ? WS.Config.evolvePierce : 0)]);
      }
    }
    return lines;
  };

  WS.Weapon = Weapon;

})(window.WS);
