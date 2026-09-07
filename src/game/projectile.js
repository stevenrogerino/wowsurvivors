/* Everything that flies, lingers, or spins: friendly bolts, hostile bolts,
 * ground zones, orbiting blades and beams. One pool per kind, all capped. */
'use strict';
(function (WS) {

  const P = {
    bolts: null,      // friendly projectiles
    hostiles: null,   // enemy projectiles
    zones: null,      // lingering damage fields
    orbits: null,     // blades circling the survivor
    beams: null,      // instant lines, rendered while they fade
  };

  P.init = function () {
    this.bolts = new WS.Pool(() => ({ hitBy: new Map() }), (b) => b.hitBy.clear(), WS.CONST.MAX_PROJECTILES);
    this.hostiles = new WS.Pool(() => ({}), null, 220);
    this.zones = new WS.Pool(() => ({ hitBy: new Map() }), (z) => z.hitBy.clear(), 24);
    this.orbits = new WS.Pool(() => ({ hitBy: new Map() }), (o) => o.hitBy.clear(), 32);
    this.beams = new WS.Pool(() => ({}), null, 24);
  };

  P.clear = function () {
    this.bolts.releaseAll();
    this.hostiles.releaseAll();
    this.zones.releaseAll();
    this.orbits.releaseAll();
    this.beams.releaseAll();
  };

  const OFF = 200;  // how far outside the world a bolt may travel before dying

  /* ---------------------------------------------------------- friendly --- */
  /** `spec` is the shared scratch object filled by weapon.js; fields are copied
   *  out immediately so one table can serve every shot without allocating. */
  P.launchBolt = function (x, y, vx, vy, spec) {
    const b = this.bolts.acquire();
    if (!b) return null;
    b.x = x; b.y = y; b.vx = vx; b.vy = vy;
    b.damage = spec.damage;
    b.life = spec.life;
    b.radius = spec.radius;
    b.pierce = spec.pierce;
    b.art = spec.art;
    b.colour = spec.colour;
    b.splash = spec.splash;
    b.slowFactor = spec.slowFactor;
    b.slowDuration = spec.slowDuration;
    b.bounces = spec.bounces || 0;
    b.homingTarget = spec.homingTarget || null;
    b.homing = !!spec.homingTarget;
    b.source = spec.source;
    b.heal = spec.heal || 0;
    b.procChain = spec.procChain || 0;
    b.spin = WS.random() * WS.TAU;
    b.spinRate = spec.spinRate === undefined ? 0 : spec.spinRate;
    b.trail = spec.trail !== false;
    b.hitBy.clear();
    return b;
  };

  P.spawnZone = function (x, y, radius, damage, duration, tickRate, colour, source, heal) {
    const z = this.zones.acquire();
    if (!z) return null;
    z.x = x; z.y = y; z.radius = radius; z.damage = damage;
    z.life = duration; z.maxLife = duration;
    z.tickRate = tickRate; z.tick = 0;
    z.colour = colour; z.source = source; z.heal = heal || 0;
    z.phase = WS.random() * WS.TAU;
    return z;
  };

  P.spawnOrbit = function (player, count, radius, speed, damage, size, duration, colour, source, procChain) {
    const o = this.orbits.acquire();
    if (!o) return null;
    o.count = count; o.radius = radius; o.speed = speed;
    o.damage = damage; o.size = size;
    o.life = duration; o.maxLife = duration;
    o.angle = 0; o.colour = colour; o.source = source;
    o.tick = 0; o.procChain = procChain || 0;
    o.hitBy.clear();
    return o;
  };

  P.spawnBeam = function (x1, y1, x2, y2, width, colour, life) {
    const b = this.beams.acquire();
    if (!b) return null;
    b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2;
    b.width = width; b.colour = colour;
    b.life = life || 0.18; b.maxLife = b.life;
    return b;
  };

  /* ----------------------------------------------------------- hostile --- */
  P.spawnHostile = function (x, y, vx, vy, damage, school, srcName, srcEnemy, slowFactor, slowDuration) {
    const h = this.hostiles.acquire();
    if (!h) return null;
    h.x = x; h.y = y; h.vx = vx; h.vy = vy;
    h.damage = damage;
    h.colour = WS.CONST.COLORS[school] || WS.CONST.COLORS.shadow;
    h.radius = 8;
    h.life = 5;
    h.srcName = srcName;
    h.srcEnemy = srcEnemy || null;
    h.slowFactor = slowFactor;
    h.slowDuration = slowDuration;
    h.spin = WS.random() * WS.TAU;
    return h;
  };

  /* ------------------------------------------------------------ impacts -- */
  /** Splash + slow + lifesteal + on-hit procs shared by every bolt hit. */
  function resolveHit(b, e) {
    const player = WS.Game.player;
    let dealt = WS.Enemy.hit(e, b.damage, b.source);

    if (b.splash) {
      WS.Enemy.damageArea(b.x, b.y, b.splash, b.damage * 0.6, b.hitBy, null, b.source);
      WS.FX.flash(b.x, b.y, b.splash, b.colour, 0.24);
    }
    if (b.slowFactor) WS.Enemy.applySlow(e, b.slowFactor, b.slowDuration || 1.5);
    if (b.heal) WS.Player.heal(player, b.heal, 'holy');
    if (player.lifesteal > 0) WS.Player.lifesteal(player, dealt * player.lifesteal);
    if (b.procChain > 0 && WS.random() < b.procChain) {
      WS.Weapon.chainFrom(e.x, e.y, b.damage * 0.6, 3, 220, b.source);
    }
    WS.FX.spray(b.x, b.y, -b.vx, -b.vy, 4, WS.hex(b.colour), 90, 0.3);
  }

  /* ------------------------------------------------------------- update -- */
  P.update = function (dt) {
    const player = WS.Game.player;
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;

    /* ---- friendly bolts -------------------------------------------------- */
    let i = 0;
    while (i < this.bolts.count) {
      const b = this.bolts.active[i];
      b.life -= dt;
      if (b.life <= 0) { this.bolts.releaseAt(i); continue; }

      if (b.homing) {
        // Re-acquire when the current mark dies, so a homing bolt keeps working
        // through a crowd instead of flying off into nothing.
        if (!b.homingTarget || b.homingTarget._dead) {
          b.homingTarget = WS.Enemy.findNearest(b.x, b.y, WS.Config.homingReacquireRange);
        }
        if (b.homingTarget) {
          const [tx, ty] = WS.normalize(b.homingTarget.x - b.x, b.homingTarget.y - b.y);
          const speed = WS.sqrt(b.vx * b.vx + b.vy * b.vy);
          b.vx = WS.lerp(b.vx, tx * speed, WS.min(1, 6 * dt));
          b.vy = WS.lerp(b.vy, ty * speed, WS.min(1, 6 * dt));
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.spin += b.spinRate * dt;

      if (b.x < -OFF || b.x > W + OFF || b.y < -OFF || b.y > H + OFF) {
        this.bolts.releaseAt(i); continue;
      }

      const e = WS.Enemy.findCollision(b.x, b.y, b.radius, b.hitBy);
      if (e) {
        b.hitBy.set(e, e.spawnId);
        resolveHit(b, e);

        if (b.bounces > 0) {
          // Ricochet: turn toward another target rather than dying.
          b.bounces--;
          const next = WS.Enemy.findNearest(b.x, b.y, 320, new Set([e]));
          if (next) {
            const speed = WS.sqrt(b.vx * b.vx + b.vy * b.vy);
            const [nx, ny] = WS.normalize(next.x - b.x, next.y - b.y);
            b.vx = nx * speed; b.vy = ny * speed;
            b.life = WS.max(b.life, 1.2);
          } else { this.bolts.releaseAt(i); continue; }
        } else if (b.pierce > 0) {
          b.pierce--;
        } else {
          WS.FX.flash(b.x, b.y, b.radius * 2.4, b.colour, 0.18);
          this.bolts.releaseAt(i); continue;
        }
      }
      i++;
    }

    /* ---- hostile bolts --------------------------------------------------- */
    i = 0;
    while (i < this.hostiles.count) {
      const h = this.hostiles.active[i];
      h.life -= dt;
      if (h.life <= 0) { this.hostiles.releaseAt(i); continue; }
      if (WS.Enemy.freezeTimer <= 0) {
        h.x += h.vx * dt;
        h.y += h.vy * dt;
      }
      h.spin += dt * 6;
      if (h.x < -OFF || h.x > W + OFF || h.y < -OFF || h.y > H + OFF) {
        this.hostiles.releaseAt(i); continue;
      }
      const reach = h.radius + player.radius;
      if (WS.dist2(h.x, h.y, player.x, player.y) <= reach * reach) {
        const connected = WS.Player.takeDamage(player, h.damage, h.srcName);
        if (connected && player.thornsRank > 0 && h.srcEnemy && !h.srcEnemy._dead) {
          // Thorns reflects a ranged hit back to whoever cast it.
          WS.Enemy.hit(h.srcEnemy,
            (WS.Config.thornsFlat + h.damage * WS.Config.thornsDamagePct) * player.thornsRank, 'thorns');
        }
        if (h.slowFactor) WS.Player.applySlow(player, h.slowFactor, h.slowDuration);
        WS.FX.flash(h.x, h.y, 22, h.colour, 0.2);
        this.hostiles.releaseAt(i);
        if (!WS.Game.running) return;
        continue;
      }
      i++;
    }

    /* ---- ground zones ---------------------------------------------------- */
    i = 0;
    while (i < this.zones.count) {
      const z = this.zones.active[i];
      z.life -= dt;
      if (z.life <= 0) { this.zones.releaseAt(i); continue; }
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = z.tickRate;
        z.hitBy.clear();
        WS.Enemy.damageArea(z.x, z.y, z.radius, z.damage, z.hitBy, null, z.source);
        if (z.heal && WS.dist2(z.x, z.y, player.x, player.y) < z.radius * z.radius) {
          WS.Player.heal(player, z.heal, 'holy');
        }
      }
      i++;
    }

    /* ---- orbiting blades ------------------------------------------------- */
    i = 0;
    while (i < this.orbits.count) {
      const o = this.orbits.active[i];
      o.life -= dt;
      if (o.life <= 0) { this.orbits.releaseAt(i); continue; }
      o.angle += o.speed * dt;
      o.tick -= dt;
      if (o.tick <= 0) {
        o.tick = 0.18;              // each blade can re-hit ~5 times a second
        o.hitBy.clear();
        for (let n = 0; n < o.count; n++) {
          const a = o.angle + (n / o.count) * WS.TAU;
          const bx = player.x + WS.cos(a) * o.radius;
          const by = player.y + WS.sin(a) * o.radius;
          const before = WS.Enemy.pool.count;
          WS.Enemy.damageArea(bx, by, o.size, o.damage, o.hitBy, null, o.source);
          if (o.procChain > 0 && WS.Enemy.pool.count !== before) {
            if (WS.random() < o.procChain) WS.Weapon.chainFrom(bx, by, o.damage * 0.7, 3, 220, o.source);
          }
        }
      }
      i++;
    }

    /* ---- beams ----------------------------------------------------------- */
    i = 0;
    while (i < this.beams.count) {
      const b = this.beams.active[i];
      b.life -= dt;
      if (b.life <= 0) { this.beams.releaseAt(i); continue; }
      i++;
    }
  };

  WS.Projectile = P;

})(window.WS);
