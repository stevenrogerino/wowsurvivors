/* The horde: spawning, chasing, ranged volleys, boss patterns, damage intake.
 * Enemies are pooled with a hard cap; when the field is full the oldest fodder
 * far from the survivor is evicted so elites and bosses always get a slot. */
'use strict';
(function (WS) {

  const Enemy = {
    pool: null,
    grid: null,
    freezeTimer: 0,
    spawnCounter: 0,
  };

  Enemy.init = function () {
    this.pool = new WS.Pool(() => ({}), null, WS.CONST.MAX_ENEMIES);
    this.grid = new WS.Grid(80);
    this.freezeTimer = 0;
  };

  Enemy.clear = function () {
    this.pool.releaseAll();
    this.grid.clear();
    this.freezeTimer = 0;
  };

  Enemy.count = function () { return this.pool.count; };

  /** The boss the fight is about: whichever has the most health left.
   *
   *  The HUD scanned for this itself and so did nothing else, which is how the
   *  score ended up not knowing a boss was on the field. One scan, one answer,
   *  and anything that wants to react to a boss reads the same one the arc is
   *  tracking. */
  Enemy.leadBoss = function () {
    let best = null;
    for (let i = 0; i < this.pool.count; i++) {
      const e = this.pool.active[i];
      if (e.boss && (!best || e.health > best.health)) best = e;
    }
    return best;
  };

  /** Frees a slot by dropping the trash mob furthest from the survivor. */
  function evictFodder() {
    const player = WS.Game.player;
    let worst = -1, worstDist = 0;
    for (let i = 0; i < Enemy.pool.count; i++) {
      const e = Enemy.pool.active[i];
      if (e.boss || e.elite) continue;
      const d = WS.dist2(e.x, e.y, player.x, player.y);
      if (d > worstDist) { worstDist = d; worst = i; }
    }
    if (worst >= 0) { Enemy.pool.releaseAt(worst); return true; }
    return false;
  }

  /* -------------------------------------------------------------- spawn -- */
  Enemy.spawn = function (id, x, y, scale, force) {
    let template = WS.Enemies[id] || WS.Elites[id] || WS.Bosses[id]
      || (WS.FinaleUnits && WS.FinaleUnits[id]);
    if (!template) return null;
    const isBoss = !!WS.Bosses[id];
    const isElite = !!WS.Elites[id];
    const isPart = !!template.part;

    if (this.pool.count >= WS.CONST.MAX_ENEMIES) {
      if (!(isBoss || isElite || isPart || force) || !evictFodder()) return null;
    }
    const e = this.pool.acquire();
    if (!e) return null;

    scale = scale || 1;
    e.id = id;
    e.template = template;
    e.x = x; e.y = y;
    e.radius = template.radius;
    e.boss = isBoss;
    e.elite = isElite;
    /* The finale's machines and their parts. `untargetable` is a shield the
       player's weapons do not even aim at - a hull behind its turrets, a
       machine underground - and `dmgTaken` is armour or an opening. `hidden`
       is untargetable AND not there: nothing drawn, nothing touched. */
    e.part = isPart;
    e.finale = !!template.finale;
    e.untargetable = false;
    e.hidden = false;
    e.dmgTaken = 1;
    e.hpFloor = 0;   // a finale phase gate: health cannot fall below this
    e.host = null;
    e.displayName = null;
    e.finaleAdd = false;
    e.finaleTag = 0;
    e.stationary = !!template.stationary;
    e.maxHealth = WS.floor(template.health * scale * WS.CONST.ENEMY_SCALE);
    e.health = e.maxHealth;
    e.damage = template.damage * scale * WS.CONST.ENEMY_SCALE;
    e.xp = WS.max(1, WS.floor(template.xp * WS.min(scale, 3)));
    e.speed = template.speed
      * (1 + WS.Config.curseEnemySpeed * (WS.Game.player ? WS.Game.player.curse : 0));
    e.contactCooldown = 0.3;
    e.slowTimer = 0; e.slowFactor = 1;
    e.bleedDps = 0; e.bleedTimer = 0; e.bleedTick = 0;
    e.chargeTimer = 0;
    e.flash = 0;
    e.chilled = false;
    e.invuln = 0;
    e.spawnId = ++this.spawnCounter;
    e.patternIndex = 0;
    e.windup = 0;
    e.windupMax = 0;
    e.chargeDir = null;
    e.chargeLock = 0;
    e.chargeLen = 0;         // the lane it drew...
    e.chargeDur = 0;         // ...and how long it has to cover it
    e.scale = scale;         // kept so anything it splits into inherits the curve
    e.orbitDir = WS.random() < 0.5 ? -1 : 1;
    e.lungeTimer = template.lunge ? WS.randRange(0.5, template.lunge.cooldown) : 0;
    e.trailTimer = template.trail ? template.trail.interval : 0;
    e.noSplit = false;
    e.telegraph = null;      // {kind, life, maxLife, ...} drawn by the renderer
    e.attackTimer = template.interval || 3.6;
    e.rangedTimer = template.ranged ? WS.randRange(0.4, template.ranged.cooldown) : null;
    e.finalBoss = false;
    e.bob = WS.random() * WS.TAU;      // idle animation offset, so a crowd breathes
    e.facing = 1;
    /* spriteScale lets a creature be drawn bigger than its radius without
       being EASIER TO HIT. radius drives the hitbox, how close it has to get
       to touch you and how much of a crowd it displaces, so growing it to
       make something look heftier quietly changes the fight. The art already
       overhangs the hitbox threefold; a little more on one creature is a
       drawing decision, not a balance one. */
    e.spriteSize = template.radius * (isBoss ? 3.4 : 3.0) * (template.spriteScale || 1);
    return e;
  };

  /** Spawns just off-screen on a ring around the survivor.
   *
   * "Just off-screen" was a hope rather than a guarantee. The ring picked an
   * angle, stepped 700-860 along it, and then clamped x and y into the padded
   * world box INDEPENDENTLY - which does not keep a point outside a
   * rectangle, it drags it onto the edge of a bigger one. The field is the
   * whole screen and there is no camera, so the whole screen is 1469 across
   * the diagonal and a 700 step from a player standing near an edge lands
   * well inside it. Measured over four thousand placements: 1% landed in
   * view with the survivor at the centre, and 14-17% with them at an edge or
   * a corner. One spawn in six appeared out of nothing in front of the player.
   *
   * It is worst during a time stop, which is where it was reported from. A
   * creature that lands in view normally starts running at you in the same
   * frame, and the motion covers the arrival; a frozen one appears and then
   * stands perfectly still, so there is nothing to read but the pop. Two
   * hourglasses back to back hold that still frame for sixteen seconds.
   * Measured at five minutes, one eight-second stop put four of them on
   * screen. The horde still spawns through a freeze - it should - it simply
   * does so out of sight, and walks in when the clock starts again.
   *
   * So the ray is walked to where it LEAVES the screen, and the spawn goes
   * beyond that - the requested distance, or far enough to be outside,
   * whichever is greater. The clamp afterwards is still there and still
   * cannot pull anything back into view: it only ever moves a coordinate to
   * -120 or to W+120, both of which are outside the field on that axis. */
  const OFF = 60;             // ...and this far clear of the edge, at least
  Enemy.spawnRing = function (id, distance, scale, force) {
    const player = WS.Game.player;
    const a = WS.random() * WS.TAU;
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
    const dx = WS.cos(a), dy = WS.sin(a);
    /* How far along this ray the screen ends. A survivor pinned against the
       left wall needs almost the full width to get clear to the right, and
       almost nothing to get clear to the left. */
    const tx = dx > 0 ? (W - player.x) / dx : dx < 0 ? -player.x / dx : Infinity;
    const ty = dy > 0 ? (H - player.y) / dy : dy < 0 ? -player.y / dy : Infinity;
    const out = WS.min(tx, ty) + OFF;
    const d = WS.max(distance, isFinite(out) ? out : distance);
    const x = WS.clamp(player.x + dx * d, -120, W + 120);
    const y = WS.clamp(player.y + dy * d, -120, H + 120);
    return this.spawn(id, x, y, scale, force);
  };

  /** A scripted swarm: a full ring that closes in on the survivor. */
  Enemy.spawnCircle = function (id, count, distance, scale) {
    const player = WS.Game.player;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * WS.TAU + WS.randRange(-0.1, 0.1);
      this.spawn(id,
        player.x + WS.cos(a) * distance,
        player.y + WS.sin(a) * distance, scale);
    }
  };

  /* ------------------------------------------------------------ queries -- */
  Enemy.buildGrid = function () {
    this.grid.clear();
    for (let i = 0; i < this.pool.count; i++) this.grid.insert(this.pool.active[i]);
  };

  /** First enemy overlapping (x,y,radius) that `hitBy` has not already hit. */
  Enemy.findCollision = function (x, y, radius, hitBy) {
    let found = null;
    this.grid.query(x, y, radius + 40, (e) => {
      if (found || e._dead || e.untargetable) return;
      if (hitBy && hitBy.get(e) === e.spawnId) return;
      const reach = radius + e.radius;
      if (WS.dist2(x, y, e.x, e.y) <= reach * reach) found = e;
    });
    return found;
  };

  /** Nearest enemy within range. `excluded` is a Set (arcweb hops). */
  Enemy.findNearest = function (x, y, range, excluded) {
    let best = null, bestDist = range * range;
    for (let i = 0; i < this.pool.count; i++) {
      const e = this.pool.active[i];
      if (e._dead || e.untargetable || (excluded && excluded.has(e))) continue;
      const d = WS.dist2(x, y, e.x, e.y);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  };

  Enemy.freezeAll = function (duration) {
    this.freezeTimer = WS.max(this.freezeTimer, duration);
    WS.FX.screen('rgba(120,200,255,.28)', 0.5);
    WS.Audio.play('freeze');
  };

  /* ------------------------------------------------------------- update -- */
  Enemy.update = function (dt) {
    const player = WS.Game.player;
    const cfg = WS.Config;

    if (this.freezeTimer > 0) this.freezeTimer -= dt;
    const timeFrozen = this.freezeTimer > 0;

    const chillRank = player.chillRank;
    const chillRange = (cfg.chillRangeBase + cfg.chillRangePerRank * chillRank) * player.areaMultiplier;
    const chillFactor = 1 - cfg.chillSlowPerRank * chillRank;

    let i = 0;
    while (i < this.pool.count) {
      const e = this.pool.active[i];
      // Serration: an open wound, ticking. It can be the last thing to land.
      if (e.bleedTimer > 0) {
        e.bleedTimer -= dt;
        e.bleedTick -= dt;
        if (e.bleedTick <= 0) {
          e.bleedTick = cfg.bleedTick;
          this.damage(e, e.bleedDps * cfg.bleedTick, false, 'serration');
          if (e._dead) continue;
        }
        if (e.bleedTimer <= 0) e.bleedDps = 0;
      }
      const t = e.template;
      const [dx, dy, distance] = WS.normalize(player.x - e.x, player.y - e.y);

      // Time freeze halts everything except Death itself.
      const frozen = timeFrozen && t.family !== 'death';

      let speed = e.speed;
      if (frozen) speed = 0;
      const inChill = chillRank > 0 && !e.boss && distance < chillRange;
      if (inChill) speed *= chillFactor;
      e.chilled = inChill;
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        speed *= e.slowFactor;
      }
      /* A creature's lunge: the boss charge at rank-and-file size. It only
       * commits from inside its own range and never from on top of you, so it
       * is always a gap you can be pushed out of rather than a hit you were
       * already taking. */
      if (t.lunge && !frozen && e.windup <= 0 && e.chargeTimer <= 0) {
        e.lungeTimer -= dt;
        /* Only the overlap is excluded, not "anything close". Gating this on
         * a comfortable gap meant a fast creature that reached the survivor
         * before its cooldown came up could never lunge again, because it was
         * permanently too close - the behaviour quietly switched itself off
         * on exactly the creatures built to use it. Lunging from point blank
         * carries it THROUGH and out the far side, which is the better move
         * anyway: it has to turn around and come back. */
        if (e.lungeTimer <= 0 && distance < t.lunge.range * 1.05
            && distance > e.radius + player.radius) {
          e.lungeTimer = t.lunge.cooldown;
          this.beginCharge(e, dx, dy, t.lunge.windup || cfg.lungeWindup,
            t.lunge.time || cfg.lungeTime, t.lunge.range, cfg.lungeGirth);
        }
      }

      /* Ground left behind. Venom, rot, whatever the thing leaks - it is
       * harmless for a beat and then it is not, and it is why a lane you ran
       * down once is not a lane you can run down again. */
      if (t.trail && !frozen && !e.stationary) {
        e.trailTimer -= dt;
        if (e.trailTimer <= 0) {
          e.trailTimer = t.trail.interval;
          WS.Hazard.spawn(e.x, e.y, {
            radius: t.trail.radius, fuse: cfg.trailFuse, life: t.trail.life,
            damage: e.damage * (t.trail.damagePct || 0.35),
            interval: cfg.hazardTick, tint: t.trail.tint || t.tint, name: t.name,
          });
        }
      }

      /* THE LANE IS A PROMISE. While the boss is planted the lane swings to
       * follow the survivor, so the tell is live and you can watch it come
       * round onto you; the instant it commits, the lane locks and the boss
       * travels exactly down it. It used to do neither: the lane was aimed
       * once at windup and the charge was aimed again three quarters of a
       * second later, at wherever you had walked to since - and then didn't
       * use that direction either, because it homed. */
      if (e.windup > 0 && !frozen) {
        e.windup -= dt;
        speed = 0;
        /* A charge can also lock EARLY: the lane stops following for the
           last `chargeLock` seconds, so there is a window between "it is
           aimed" and "it goes" to step out in. The finales use it - a
           duellist at arm's length cannot be dodged after she commits. */
        const locked = e.chargeLock > 0 && e.windup <= e.chargeLock;
        if (e.telegraph && e.telegraph.live) {
          if (!locked) { e.telegraph.dx = dx; e.telegraph.dy = dy; }
          else if (!e.telegraph.locked) {
            e.telegraph.locked = true;      // the renderer draws it set hard
            WS.Audio.play('warn', e.x);
          }
          e.telegraph.life = e.windup;
        }
        if (e.windup <= 0) {
          e.chargeTimer = e.chargeDur;
          e.chargeDir = e.chargeLock > 0 && e.telegraph
            ? [e.telegraph.dx, e.telegraph.dy] : [dx, dy];
          if (e.telegraph) {
            e.telegraph.live = false;      // aimed; from here it is a fact
            e.telegraph.firing = true;
            /* Outlive the charge by a beat. Matching the two exactly meant
               the lane expired a tick or two before the boss stopped, so the
               last of the charge happened on unmarked ground. */
            e.telegraph.life = e.chargeDur + cfg.chargeLaneTail;
            e.telegraph.maxLife = e.chargeDur + cfg.chargeLaneTail;
          }
          if (e.boss) WS.FX.shake(5, 0.25);
          WS.Audio.play('warn', e.x);
        }
      } else if (e.chargeTimer > 0 && !frozen) {
        e.chargeTimer -= dt;
      }

      let advance = !e.stationary;
      if (t.ranged && distance <= t.ranged.range) advance = false;
      if (e.chargeTimer > 0 && e.chargeDir && !frozen) {
        /* Down the lane, at the speed that covers the lane. Not toward the
         * survivor - a charge you cannot sidestep is not a charge, it is a
         * fast walk with a light show in front of it. */
        const v = e.chargeLen / e.chargeDur;
        e.x = WS.clamp(e.x + e.chargeDir[0] * v * dt, e.radius, WS.CONST.WORLD_WIDTH - e.radius);
        e.y = WS.clamp(e.y + e.chargeDir[1] * v * dt, e.radius, WS.CONST.WORLD_HEIGHT - e.radius);
        e.facing = e.chargeDir[0] < 0 ? -1 : 1;
        advance = false;
      } else {
        if (advance && distance > 1) {
          if (t.orbit && distance < t.orbit.range * 1.3) {
            /* Holds a ring and walks it. The point is not the damage - it is
             * that circling away from the horde stops working, because this
             * one circles with you and closes the lane you were going to use.
             * `pull` is the only radial component: it keeps the ring honest
             * without ever letting the thing sit still. */
            const pull = WS.clamp((distance - t.orbit.range) / 70, -1, 1);
            const tx = -dy * e.orbitDir, ty = dx * e.orbitDir;
            e.x += (dx * pull + tx * (t.orbit.spin || 0.9)) * speed * dt;
            e.y += (dy * pull + ty * (t.orbit.spin || 0.9)) * speed * dt;
          } else {
            e.x += dx * speed * dt;
            e.y += dy * speed * dt;
          }
        }
        e.facing = dx < 0 ? -1 : 1;
      }
      e.bob += dt * (advance ? 9 : 3);

      // Contact. The swing always triggers Thorns, even if the survivor dodges,
      // blocks, or is mid-invulnerability; takeDamage decides what lands.
      let struck = false;
      e.contactCooldown -= dt;
      if (!frozen && !e.hidden && e.contactCooldown <= 0 && distance < e.radius + player.radius) {
        e.contactCooldown = e.boss ? cfg.contactCooldownBoss : cfg.contactCooldownNormal;
        struck = true;
        WS.Player.takeDamage(player, e.damage, t.name);
        if (!WS.Game.running) return;
      }

      if (e.rangedTimer !== null && !frozen) {
        e.rangedTimer -= dt;
        if (e.rangedTimer <= 0 && distance <= t.ranged.range * cfg.rangedReach) {
          e.rangedTimer = t.ranged.cooldown;
          const r = t.ranged;
          WS.Projectile.spawnHostile(e.x, e.y, dx * r.speed, dy * r.speed,
            e.damage * cfg.rangedDamagePct, r.school, t.name, e, r.slowFactor, r.slowDuration);
        }
      }

      if (e.boss && !t.arena && !t.finale && !frozen) {
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          this.bossAttack(e, dx, dy);
          e.attackTimer = t.interval || cfg.bossInterval;
        }
      }

      if (e.flash > 0) e.flash -= dt;
      if (e.invuln > 0) e.invuln -= dt;
      /* A lane still being aimed is owned by the windup above, which sets its
         life every frame; letting the clock here have a second go at it
         expired the lane one tick BEFORE the charge committed, so the charge
         found no telegraph to lock and the promise was never made at all. */
      if (e.telegraph && !e.telegraph.live) {
        e.telegraph.life -= dt;
        if (e.telegraph.life <= 0) e.telegraph = null;
      }

      // Thorns last, so reflecting a fatal hit cannot corrupt this update.
      if (struck && player.thornsRank > 0) {
        this.hit(e, (cfg.thornsFlat + e.damage * cfg.thornsDamagePct) * player.thornsRank, 'thorns');
      }

      if (!e._dead) i++;
    }
    this.buildGrid();
  };

  /** Plant, mark the ground, then run down it. One entry point for the boss
   *  charge and for a creature's lunge, because they are the same move at two
   *  sizes and the promise is the same: `live` says the lane is still being
   *  aimed, and the update loop turns that off the instant it commits. */
  Enemy.beginCharge = function (e, dx, dy, windup, time, range, girth, lock) {
    e.windup = windup;
    e.chargeLock = lock || 0;
    e.windupMax = windup;
    e.chargeDur = time;
    e.chargeLen = range;
    e.telegraph = {
      kind: 'lane', live: true, firing: false,
      life: windup, maxLife: windup,
      dx, dy, length: range, width: e.radius * (girth || 2.0),
    };
    WS.FX.flash(e.x, e.y, e.radius * 1.6, WS.CONST.COLORS.enemy, 0.5);
  };

  /* ------------------------------------------------------ boss patterns -- */
  Enemy.bossAttack = function (e, dx, dy) {
    const t = e.template;
    const pattern = t.patterns[e.patternIndex];
    e.patternIndex = (e.patternIndex + 1) % t.patterns.length;
    const school = t.school || 'shadow';
    /* Every figure here is a Config dial (bossVolleySpeed and the rest), and
       any one pattern entry may carry its own - { type: 'volley', bolts: 8,
       speed: 300 } - which wins over the dial for that boss alone. */
    const cfg = WS.Config;
    const opt = (k, dial) => (pattern[k] !== undefined ? pattern[k] : dial);

    if (pattern.type === 'summon') {
      const scale = 1 + WS.Game.run.time / cfg.bossSummonScaleTime;
      const near = opt('near', cfg.bossSummonNear), far = opt('far', cfg.bossSummonFar);
      for (let n = 0; n < (pattern.count || 6); n++) {
        const a = WS.random() * WS.TAU;
        const range = near + WS.random() * (far - near);
        this.spawn(pattern.id, e.x + WS.cos(a) * range, e.y + WS.sin(a) * range, scale);
      }
      WS.FX.flash(e.x, e.y, e.radius * 2.4, WS.CONST.COLORS.shadow, 0.4);
      e.telegraph = { kind: 'ring', life: 0.4, maxLife: 0.4, radius: e.radius * 3 };
    } else if (pattern.type === 'volley') {
      const bolts = pattern.bolts || 7;
      const step = opt('spread', cfg.bossVolleySpread), v = opt('speed', cfg.bossVolleySpeed);
      const dmg = e.damage * opt('damage', cfg.bossVolleyDamage);
      for (let s = 1; s <= bolts; s++) {
        const spread = (s - (bolts + 1) / 2) * step;
        const c = WS.cos(spread), sn = WS.sin(spread);
        WS.Projectile.spawnHostile(e.x, e.y,
          (dx * c - dy * sn) * v, (dx * sn + dy * c) * v,
          dmg, school, t.name, e);
      }
    } else if (pattern.type === 'ring') {
      const bolts = pattern.bolts || 10;
      const v = opt('speed', cfg.bossRingSpeed), dmg = e.damage * opt('damage', cfg.bossRingDamage);
      for (let s = 0; s < bolts; s++) {
        const a = (s / bolts) * WS.TAU;
        WS.Projectile.spawnHostile(e.x, e.y,
          WS.cos(a) * v, WS.sin(a) * v, dmg, school, t.name, e);
      }
    } else if (pattern.type === 'charge') {
      /* Plant, mark the ground, then run down it. `live` says the lane is
       * still being aimed; the update loop turns that off the moment the
       * charge commits, and the same lane stays on screen while it happens so
       * the player can see the promise kept. */
      this.beginCharge(e, dx, dy, opt('windup', cfg.chargeWindup), opt('time', cfg.chargeTime),
        opt('range', cfg.chargeRange), opt('girth', cfg.bossChargeGirth));
      WS.FX.flash(e.x, e.y, e.radius * 1.6, WS.CONST.COLORS.enemy, 0.5);
    }
  };

  /* ------------------------------------------------------ damage intake -- */
  /** Central strike entry: rolls the survivor's crit and prints the number. */
  Enemy.hit = function (e, amount, source) {
    const player = WS.Game.player;
    const crit = WS.random() < player.critChance;
    if (crit) amount *= player.critDamage;
    if (e.dmgTaken !== 1) amount *= e.dmgTaken;
    /* Serration: a crit opens a wound that bleeds a share of the blow over
       the next few seconds. A fresh crit reopens it at whichever is worse. */
    if (crit && player.serration > 0 && !e._dead) {
      const dps = amount * WS.Config.serrationShare * player.serration / WS.Config.bleedTime;
      e.bleedDps = WS.max(e.bleedTimer > 0 ? e.bleedDps : 0, dps);
      e.bleedTimer = WS.Config.bleedTime;
      if (e.bleedTick <= 0) e.bleedTick = WS.Config.bleedTick;
    }
    this.damage(e, amount, crit, source);
    WS.FX.damage(e.x, e.y - e.radius * 0.6, amount, crit);
    WS.Audio.play(crit ? 'crit' : 'hit', e.x);
    return amount;
  };

  Enemy.damage = function (e, amount, isCrit, source) {
    if (!e || e._dead) return;
    if (e.invuln > 0) return;
    const player = WS.Game.player;
    // Overkill is normally discarded; the Ruinseeker's ruin meter drinks it.
    if (player && player.felAttuned > 0 && amount > e.health) {
      WS.Player.gainFel(player, amount - WS.max(0, e.health));
    }
    e.health -= amount;
    // A finale boss between lives: the blow lands, the phase ends, nothing
    // past the line is taken.
    if (e.hpFloor > 0 && e.health < e.hpFloor) e.health = e.hpFloor;
    e.flash = 0.09;
    e.flashCrit = isCrit;
    const run = WS.Game.run;
    run.damageDone += amount;
    const key = source || 'untagged';
    run.damageByWeapon[key] = (run.damageByWeapon[key] || 0) + amount;
    if (e.health <= 0) this.kill(e);
  };

  /** Returns how many it hit, so a caller can proc on a STRIKE rather than
   *  having to infer one from the pool count changing - which only ever told
   *  it about a kill. */
  Enemy.damageArea = function (x, y, radius, amount, hitBy, knockback, source) {
    let i = 0, struck = 0;
    while (i < this.pool.count) {
      const e = this.pool.active[i];
      const reach = radius + e.radius;
      if (e.untargetable) { i++; continue; }
      if ((!hitBy || hitBy.get(e) !== e.spawnId) && WS.dist2(x, y, e.x, e.y) <= reach * reach) {
        if (hitBy) hitBy.set(e, e.spawnId);
        struck++;
        if (knockback && !e.boss && !e.finale) {
          const [kx, ky] = WS.normalize(e.x - x, e.y - y);
          e.x += kx * knockback;
          e.y += ky * knockback;
        }
        this.hit(e, amount, source);
        if (!e._dead) i++;
      } else i++;
    }
    return struck;
  };

  /** Damage everything within halfWidth of the segment (beams). */
  Enemy.damageLine = function (x1, y1, x2, y2, halfWidth, amount, source) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 0) return;
    let i = 0;
    while (i < this.pool.count) {
      const e = this.pool.active[i];
      if (e.untargetable) { i++; continue; }
      let t = ((e.x - x1) * dx + (e.y - y1) * dy) / lenSq;
      t = WS.clamp(t, 0, 1);
      const px = x1 + dx * t, py = y1 + dy * t;
      const reach = halfWidth + e.radius;
      if (WS.dist2(e.x, e.y, px, py) <= reach * reach) {
        this.hit(e, amount, source);
        if (!e._dead) i++;
      } else i++;
    }
  };

  Enemy.applySlow = function (e, factor, duration) {
    if (!e || e._dead) return;
    if (e.slowTimer <= 0 || factor < e.slowFactor) e.slowFactor = factor;
    e.slowTimer = WS.max(e.slowTimer, duration);
  };

  /* ---------------------------------------------------------------- kill - */
  Enemy.kill = function (e) {
    const run = WS.Game.run;
    const t = e.template;
    const player = WS.Game.player;

    /* What it leaves behind. A stitched thing comes apart into what it was
     * stitched from, and a body full of pressure goes off - which is the one
     * behaviour that makes WHERE you kill something matter, not just how
     * fast. Both happen before the corpse, so the burst lights the death
     * rather than following it. */
    if (t.burst) {
      WS.Hazard.spawn(e.x, e.y, {
        radius: t.burst.radius, fuse: t.burst.fuse || WS.Config.burstFuse,
        life: WS.Config.burstLife, damage: e.damage * (t.burst.damagePct || 1.2),
        interval: 99, tint: t.burst.tint || t.tint, name: t.name,
      });
    }
    if (t.split && !e.noSplit) {
      const kids = t.split.count || 2;
      for (let n = 0; n < kids; n++) {
        const a = (n / kids) * WS.TAU + WS.random();
        const child = this.spawn(t.split.into,
          WS.clamp(e.x + WS.cos(a) * e.radius, 20, WS.CONST.WORLD_WIDTH - 20),
          WS.clamp(e.y + WS.sin(a) * e.radius, 20, WS.CONST.WORLD_HEIGHT - 20),
          e.scale * (t.split.scale || 0.7));
        // One generation. Anything that could split again is a spawn loop
        // waiting for a slow machine to find it.
        if (child) child.noSplit = true;
      }
    }

    WS.FX.corpse(e);
    WS.FX.burst(e.x, e.y, e.boss ? 26 : e.elite ? 14 : 7,
      WS.hex(t.tint), e.boss ? 260 : 150, 0.5, e.boss ? 5 : 3);
    if (e.boss) WS.FX.stop(0.16);
    else if (e.elite) WS.FX.stop(0.05);
    WS.XP.spawnGem(e.x, e.y, e.xp);
    WS.Pickup.onKill(e);
    WS.Save.recordKill(t, e.id);
    WS.Encounters.onKill(t);
    run.kills++;
    WS.Primal.onKill(player, e);
    WS.Audio.play('enemyHit', e.x);

    if (player.bloodthirst && run.kills % player.bloodthirstInterval === 0) {
      WS.Player.heal(player,
        WS.floor(player.maxHealth * player.bloodthirstHealPct) + player.bloodthirstHealFlat,
        'bloodthirst');
    }

    /* A finale's machine is not finished when its health is: a hull becomes
       a wreck, a galleon crashes and its captain climbs out. What happens
       next belongs to the encounter, not to the generic boss funeral. */
    if (t.finale) {
      this.pool.release(e);
      WS.Finale.onUnitDead(e);
      return;
    }

    if (e.boss) {
      run.bossesSlain++;
      if (e.id === 'aethelgard') {
        this.pool.release(e);
        WS.Arena.onBossDead();
        return;
      }
      if (e.id === 'death_itself') run.deathsSlain++;
      WS.Save.stats.bosses[e.id] = (WS.Save.stats.bosses[e.id] || 0) + 1;
      const gold = WS.floor((t.gold || 40) * run.goldMult * player.goldMultiplier);
      WS.Game.addGold(gold, e.x, e.y);
      for (let n = 0; n < 8; n++) {
        WS.XP.spawnGem(e.x + WS.randRange(-34, 34), e.y + WS.randRange(-34, 34), WS.floor(e.xp / 8));
      }
      /* The biggest cheer the game has. Three rings out of the corpse rather
         than one, so the payoff keeps arriving for most of a second, and a
         gold banner rather than a caption - killing a boss is the moment the
         run has been building toward and it should read like one. */
      WS.Audio.play('explode', e.x);
      WS.FX.shake(9, 0.5);
      WS.FX.stop(0.12);
      WS.FX.flash(e.x, e.y, e.radius * 4, WS.CONST.COLORS.boss, 0.6);
      WS.FX.flash(e.x, e.y, e.radius * 7, '#f5c56b', 0.85);
      WS.FX.burst(e.x, e.y, 26, '#ffe6ae', 260, 0.9, 4);
      WS.Game.announce(t.name + ' falls.', 'The battlefield is quieter.', 2.8,
        { kind: 'glory' });
      WS.Achievements.check();
      const wasFinal = e.finalBoss;
      this.pool.release(e);
      if (wasFinal) WS.Game.victory();
      return;
    }

    this.pool.release(e);
  };

  WS.Enemy = Enemy;

})(window.WS);
