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
    let template = WS.Enemies[id] || WS.Elites[id] || WS.Bosses[id];
    if (!template) return null;
    const isBoss = !!WS.Bosses[id];
    const isElite = !!WS.Elites[id];

    if (this.pool.count >= WS.CONST.MAX_ENEMIES) {
      if (!(isBoss || isElite || force) || !evictFodder()) return null;
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
    e.stationary = !!template.stationary;
    e.maxHealth = WS.floor(template.health * scale * WS.CONST.ENEMY_SCALE);
    e.health = e.maxHealth;
    e.damage = template.damage * scale * WS.CONST.ENEMY_SCALE;
    e.xp = WS.max(1, WS.floor(template.xp * WS.min(scale, 3)));
    e.speed = template.speed * (1 + 0.08 * (WS.Game.player ? WS.Game.player.curse : 0));
    e.contactCooldown = 0.3;
    e.slowTimer = 0; e.slowFactor = 1;
    e.chargeTimer = 0;
    e.flash = 0;
    e.chilled = false;
    e.invuln = 0;
    e.spawnId = ++this.spawnCounter;
    e.patternIndex = 0;
    e.windup = 0;
    e.chargeDir = null;
    e.telegraph = null;      // {kind, life, maxLife, ...} drawn by the renderer
    e.attackTimer = template.interval || 3.6;
    e.rangedTimer = template.ranged ? WS.randRange(0.4, template.ranged.cooldown) : null;
    e.finalBoss = false;
    e.bob = WS.random() * WS.TAU;      // idle animation offset, so a crowd breathes
    e.facing = 1;
    e.spriteSize = template.radius * (isBoss ? 3.4 : 3.0);
    return e;
  };

  /** Spawns just off-screen on a ring around the survivor. */
  Enemy.spawnRing = function (id, distance, scale, force) {
    const player = WS.Game.player;
    const a = WS.random() * WS.TAU;
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
    const x = WS.clamp(player.x + WS.cos(a) * distance, -120, W + 120);
    const y = WS.clamp(player.y + WS.sin(a) * distance, -120, H + 120);
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
      if (found || e._dead) return;
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
      if (e._dead || (excluded && excluded.has(e))) continue;
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
      if (e.windup > 0) {
        // The tell: the boss plants, and the ground in front of it lights up.
        e.windup -= dt;
        speed = 0;
        if (e.windup <= 0) {
          e.chargeTimer = 1.1;
          e.chargeDir = [dx, dy];
          WS.FX.shake(5, 0.25);
          WS.Audio.play('warn');
        }
      } else if (e.chargeTimer > 0) {
        e.chargeTimer -= dt;
        speed *= 3.2;
      }

      let advance = !e.stationary;
      if (t.ranged && distance <= t.ranged.range) advance = false;
      if (advance && distance > 1) {
        e.x += dx * speed * dt;
        e.y += dy * speed * dt;
      }
      e.facing = dx < 0 ? -1 : 1;
      e.bob += dt * (advance ? 9 : 3);

      // Contact. The swing always triggers Thorns, even if the survivor dodges,
      // blocks, or is mid-invulnerability; takeDamage decides what lands.
      let struck = false;
      e.contactCooldown -= dt;
      if (!frozen && e.contactCooldown <= 0 && distance < e.radius + player.radius) {
        e.contactCooldown = e.boss ? cfg.contactCooldownBoss : cfg.contactCooldownNormal;
        struck = true;
        WS.Player.takeDamage(player, e.damage, t.name);
        if (!WS.Game.running) return;
      }

      if (e.rangedTimer !== null && !frozen) {
        e.rangedTimer -= dt;
        if (e.rangedTimer <= 0 && distance <= t.ranged.range * 1.15) {
          e.rangedTimer = t.ranged.cooldown;
          const r = t.ranged;
          WS.Projectile.spawnHostile(e.x, e.y, dx * r.speed, dy * r.speed,
            e.damage * 0.75, r.school, t.name, e, r.slowFactor, r.slowDuration);
        }
      }

      if (e.boss && !t.arena && !frozen) {
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          this.bossAttack(e, dx, dy);
          e.attackTimer = t.interval || 3.6;
        }
      }

      if (e.flash > 0) e.flash -= dt;
      if (e.invuln > 0) e.invuln -= dt;
      if (e.telegraph) {
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

  /* ------------------------------------------------------ boss patterns -- */
  Enemy.bossAttack = function (e, dx, dy) {
    const t = e.template;
    const pattern = t.patterns[e.patternIndex];
    e.patternIndex = (e.patternIndex + 1) % t.patterns.length;
    const school = t.school || 'shadow';

    if (pattern.type === 'summon') {
      const scale = 1 + WS.Game.run.time / 600;
      for (let n = 0; n < (pattern.count || 6); n++) {
        const a = WS.random() * WS.TAU;
        const range = 60 + WS.random() * 70;
        this.spawn(pattern.id, e.x + WS.cos(a) * range, e.y + WS.sin(a) * range, scale);
      }
      WS.FX.flash(e.x, e.y, e.radius * 2.4, WS.CONST.COLORS.shadow, 0.4);
      e.telegraph = { kind: 'ring', life: 0.4, maxLife: 0.4, radius: e.radius * 3 };
    } else if (pattern.type === 'volley') {
      const bolts = pattern.bolts || 7;
      for (let s = 1; s <= bolts; s++) {
        const spread = (s - (bolts + 1) / 2) * 0.16;
        const c = WS.cos(spread), sn = WS.sin(spread);
        WS.Projectile.spawnHostile(e.x, e.y,
          (dx * c - dy * sn) * 260, (dx * sn + dy * c) * 260,
          e.damage * 0.7, school, t.name, e);
      }
    } else if (pattern.type === 'ring') {
      const bolts = pattern.bolts || 10;
      for (let s = 0; s < bolts; s++) {
        const a = (s / bolts) * WS.TAU;
        WS.Projectile.spawnHostile(e.x, e.y,
          WS.cos(a) * 220, WS.sin(a) * 220, e.damage * 0.6, school, t.name, e);
      }
    } else if (pattern.type === 'charge') {
      // Telegraph first: three quarters of a second planted, with the lane
      // ahead marked, then the charge itself.
      e.windup = 0.75;
      e.telegraph = { kind: 'lane', life: 0.75, maxLife: 0.75, dx, dy, length: 460, width: e.radius * 2.2 };
      WS.FX.flash(e.x, e.y, e.radius * 1.6, WS.CONST.COLORS.enemy, 0.5);
    }
  };

  /* ------------------------------------------------------ damage intake -- */
  /** Central strike entry: rolls the survivor's crit and prints the number. */
  Enemy.hit = function (e, amount, source) {
    const player = WS.Game.player;
    const crit = WS.random() < player.critChance;
    if (crit) amount *= player.critDamage;
    this.damage(e, amount, crit, source);
    WS.FX.damage(e.x, e.y - e.radius * 0.6, amount, crit);
    WS.Audio.play(crit ? 'crit' : 'hit');
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
    e.flash = 0.09;
    e.flashCrit = isCrit;
    const run = WS.Game.run;
    run.damageDone += amount;
    const key = source || 'untagged';
    run.damageByWeapon[key] = (run.damageByWeapon[key] || 0) + amount;
    if (e.health <= 0) this.kill(e);
  };

  Enemy.damageArea = function (x, y, radius, amount, hitBy, knockback, source) {
    let i = 0;
    while (i < this.pool.count) {
      const e = this.pool.active[i];
      const reach = radius + e.radius;
      if ((!hitBy || hitBy.get(e) !== e.spawnId) && WS.dist2(x, y, e.x, e.y) <= reach * reach) {
        if (hitBy) hitBy.set(e, e.spawnId);
        if (knockback && !e.boss) {
          const [kx, ky] = WS.normalize(e.x - x, e.y - y);
          e.x += kx * knockback;
          e.y += ky * knockback;
        }
        this.hit(e, amount, source);
        if (!e._dead) i++;
      } else i++;
    }
  };

  /** Damage everything within halfWidth of the segment (beams). */
  Enemy.damageLine = function (x1, y1, x2, y2, halfWidth, amount, source) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 0) return;
    let i = 0;
    while (i < this.pool.count) {
      const e = this.pool.active[i];
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

    WS.FX.corpse(e);
    WS.FX.burst(e.x, e.y, e.boss ? 26 : e.elite ? 14 : 7,
      WS.hex(t.tint), e.boss ? 260 : 150, 0.5, e.boss ? 5 : 3);
    if (e.boss) WS.FX.stop(0.16);
    else if (e.elite) WS.FX.stop(0.05);
    WS.XP.spawnGem(e.x, e.y, e.xp);
    WS.Pickup.onKill(e);
    WS.Save.recordKill(t, e.id);
    run.kills++;
    WS.Audio.play('enemyHit');

    if (player.bloodthirst && run.kills % player.bloodthirstInterval === 0) {
      WS.Player.heal(player,
        WS.floor(player.maxHealth * player.bloodthirstHealPct) + player.bloodthirstHealFlat,
        'bloodthirst');
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
      WS.Audio.play('explode');
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
