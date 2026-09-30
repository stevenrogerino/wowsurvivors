/* Familiars: summons that HUNT. Granted in-run by Spirit Companion / Grave
 * Call, and they used to be one creature with different numbers - the same
 * hunt, the same targets, the same area bite, a ghoul just slower and harder
 * - so measured side by side (tools/summon-test.js) three of either did the
 * same thing and ghouls did it slightly better. Now they are two jobs:
 *
 *   WOLVES ARE A PACK. They run far and fast, and when there is something
 *   worth the whole pack - a boss, an elite, something that shoots - they
 *   all go for it. Each wolf that has had its teeth in the same creature a
 *   moment ago makes the next bite harder, and a pounce mauls lighter what
 *   is packed around it. With no such quarry each wolf works the herd on
 *   its own. They take down the big thing and what you cannot reach.
 *
 *   GHOULS ARE THE GRAVE GUARD. They shamble, and they stay close - half
 *   the wolves' leash - and they go for whatever is nearest YOU, not them.
 *   Their claws sweep an arc, and what they rake is slowed and left
 *   rotting: it takes more damage from everything for a few seconds. They
 *   keep the crowd off you and make your own weapons hit harder.
 *
 *   AND A GHOUL WITH NOTHING TO GUARD AGAINST BREAKS LOOSE. A strong build
 *   kills everything before it comes within the guard's short leash, and a
 *   tester saw theirs never touch anything. So a ghoul that has raked
 *   nothing for ghoulRestless seconds, while there is a crowd further out,
 *   runs to the thickest of it and bursts there - rot over a wide circle,
 *   ghoulBurstMult rakes' worth - and rises again at your side ghoulRespawn
 *   seconds later. A guard that is working never does it. They go ONE AT A
 *   TIME: when one breaks loose the others start their wait again, so three
 *   restless ghouls go out ghoulRestless apart, not in one volley. */
'use strict';
(function (WS) {

  /* The shared cap across every summon kind (tuning.max), and the leash's
     two thresholds: a leashed summon is only released once it is back inside
     tuning.recall of the leash, and it only takes marks inside tuning.huntIn
     of it. Both exist to keep the come-home and the go-hunt decisions from
     meeting at a single pixel and arguing there forever. All of it is on the
     tuning bench, under Familiars. */

  const Familiar = {
    list: [],
    tuning: {
      max: 6,
      recall: 0.55,
      huntIn: 0.90,
      dashSpeed: 340,
      biteRadius: 46,
      biteCooldown: 0.55,
      dmgBase: 12.74,
      dmgPerLevel: 0.91,
      huntRange: 560,
      leash: 440,
      wanderSpeed: 150,
      ghoulSpeedMult: 0.70,
      ghoulRadiusMult: 1.35,
      ghoulCdMult: 1.45,
      ghoulDmgMult: 1.45,
      // The pack: one-mouth bites, harder for every packmate on the quarry.
      wolfDmgMult: 3.0,
      wolfCdMult: 0.85,
      packBonus: 0.25,
      packWindow: 1.2,
      packMax: 3,
      killRebite: 0.12,
      mauleRadius: 1.0,
      maulDmg: 0.7,
      // The guard: a short leash, and what it rakes is slowed and rots.
      ghoulLeashMult: 0.55,
      ghoulSlow: 0.6,
      ghoulSlowTime: 1.2,
      ghoulRot: 1.15,
      ghoulRotTime: 2.5,
      // The breakout: idle this long, reach this far (x huntRange), run this
      // much faster, burst this wide for this many rakes, rise this long after.
      ghoulRestless: 4,
      ghoulBurstReach: 1.5,
      ghoulChargeMult: 2.2,
      ghoulBurstRadius: 130,
      ghoulBurstMult: 6,
      ghoulRespawn: 6,
      ghoulBurstRotMult: 1.6,   // the burst's rot lasts this much longer than a rake's
      ghoulChargeGiveUp: 3.5,   // seconds a breakout runs before it bursts wherever it is
    },
    KINDS: {
      wolf: {
        art: 'spiritwolf', tint: [0.60, 0.85, 1.00], source: 'wolves', pack: true,
        cdMult: 'wolfCdMult', dmgMult: 'wolfDmgMult',
      },
      ghoul: {
        art: 'risen', tint: [0.55, 0.90, 0.40], source: 'ghouls', guard: true,
        speedMult: 'ghoulSpeedMult', radiusMult: 'ghoulRadiusMult',
        cdMult: 'ghoulCdMult', dmgMult: 'ghoulDmgMult', leashMult: 'ghoulLeashMult',
      },
    },
    /** The pack's shared quarry, re-chosen a few times a second. */
    quarry: null,
    quarryTimer: 0,
  };

  Familiar.init = function () { this.list = []; this.quarry = null; };
  Familiar.reset = function () { this.list.length = 0; this.quarry = null; };

  /** The worst thing within `range` of the survivor, as a pack sees it:
   *  a boss, then an elite, then anything that shoots. Nothing else is worth the
   *  whole pack's run - measured, three wolves chasing one common creature
   *  arrived to find one bite had done it, and the pack killed a quarter of
   *  what it had - so with no quarry each wolf runs down its own. Distance
   *  breaks ties inside a tier. */
  function pickQuarry(player, range) {
    const pool = WS.Enemy.pool;
    let best = null, bestScore = -Infinity;
    const r2 = range * range;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.active[i];
      if (e._dead || e.untargetable || e.hidden) continue;
      const d2 = WS.dist2(player.x, player.y, e.x, e.y);
      if (d2 > r2) continue;
      const t = e.template;
      const tier = e.boss ? 3 : e.elite ? 2 : (t && t.ranged) ? 1 : 0;
      if (!tier) continue;
      const score = tier * 1e7 - d2;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /** Where a breaking-out ghoul goes: of the creatures within `range` of the
   *  survivor, the one with the most others inside a burst of it. Sampled,
   *  so a full field costs a few hundred distance checks, not a hundred
   *  thousand. */
  function thickest(player, range, burst) {
    const pool = WS.Enemy.pool, r2 = range * range, b2 = burst * burst;
    const n = pool.count, step = WS.max(1, WS.floor(n / 24));
    let best = null, most = -1;
    for (let i = 0; i < n; i += step) {
      const e = pool.active[i];
      if (e._dead || e.untargetable || e.hidden) continue;
      if (WS.dist2(player.x, player.y, e.x, e.y) > r2) continue;
      let c = 0;
      for (let j = 0; j < n; j += 2) {
        const o = pool.active[j];
        if (!o._dead && WS.dist2(o.x, o.y, e.x, e.y) <= b2) c++;
      }
      if (c > most) { most = c; best = e; }
    }
    return best;
  }

  /** The burst: rot over a wide circle, and the ghoul goes down. */
  function burst(fam, player, t, damage) {
    const r = t.ghoulBurstRadius * player.areaMultiplier;
    WS.Enemy.damageArea(fam.x, fam.y, r, damage * t.ghoulBurstMult, null, 20, fam.spec.source);
    const pool = WS.Enemy.pool;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.active[i];
      if (e._dead) continue;
      if (WS.dist2(fam.x, fam.y, e.x, e.y) <= (r + e.radius) * (r + e.radius)) WS.Enemy.applyRot(e, t.ghoulRot, t.ghoulRotTime * t.ghoulBurstRotMult);
    }
    WS.FX.flash(fam.x, fam.y, r, fam.spec.tint, 0.5, 12, 'shadow');
    WS.FX.flash(fam.x, fam.y, r * 0.45, [0.85, 1, 0.6], 0.35);
    WS.FX.burst(fam.x, fam.y, 26, '#b8ff5a', 260, 0.7, 3);
    WS.FX.shake(4, 0.2);
    WS.Audio.play('cast', fam.x, 'shadow');
    fam.burstAt = { x: fam.x, y: fam.y, r, t: 0.5 };
    fam.charge = null; fam.chargeTime = 0; fam.idle = 0;
    fam.down = t.ghoulRespawn;
    const run = WS.Game.run;
    if (run) run.ghoulBursts = (run.ghoulBursts || 0) + 1;
  }

  Familiar.add = function (kind) {
    if (this.list.length >= this.tuning.max) return;
    const player = WS.Game.player;
    const spec = this.KINDS[kind] || this.KINDS.wolf;
    this.list.push({
      kind, spec,
      x: player.x + WS.randRange(-50, 50),
      y: player.y + WS.randRange(-50, 50),
      target: null,
      biteTimer: 0,
      pounce: 0,
      leashed: false,
      bob: WS.random() * WS.TAU,
      facing: 1,
      idle: 0, charge: null, chargeTime: 0, down: 0,
    });
    WS.FX.flash(player.x, player.y, 60, spec.tint, 0.4);
  };

  Familiar.update = function (dt) {
    const player = WS.Game.player;
    const t = this.tuning;
    if (!this.list.length) return;
    this.quarryTimer -= dt;
    const q = this.quarry;
    if (this.quarryTimer <= 0 || !q || q._dead) {
      this.quarryTimer = 0.3;
      if (this.list.some((f) => f.spec.pack)) {
        this.quarry = pickQuarry(player, WS.min(t.huntRange, t.leash * t.huntIn));
      }
    }

    for (const fam of this.list) {
      const spec = fam.spec;
      const speedMult = spec.speedMult ? t[spec.speedMult] : 1;
      const radiusMult = spec.radiusMult ? t[spec.radiusMult] : 1;
      const cdMult = spec.cdMult ? t[spec.cdMult] : 1;
      const dmgMult = spec.dmgMult ? t[spec.dmgMult] : 1;
      const leash = t.leash * (spec.leashMult ? t[spec.leashMult] : 1);
      if (fam.burstAt && (fam.burstAt.t -= dt) <= 0) fam.burstAt = null;

      // Gone to rot after a burst: it rises again at the survivor's side.
      if (fam.down > 0) {
        fam.down -= dt;
        fam.x = player.x + WS.cos(fam.bob) * 34; fam.y = player.y + 10 + WS.sin(fam.bob) * 14;
        if (fam.down <= 0) {
          fam.down = 0; fam.rise = 0.5;
          WS.FX.flash(fam.x, fam.y, 44, spec.tint, 0.4);
        }
        continue;
      }
      if (fam.rise > 0) fam.rise -= dt;

      if (spec.guard) {
        fam.idle += dt;
        // One at a time: none breaks loose while another is running out.
        const running = this.list.some((f) => f !== fam && f.charge);
        if (!fam.charge && !running && fam.idle >= t.ghoulRestless) {
          const r = t.ghoulBurstRadius * player.areaMultiplier;
          const c = thickest(player, t.huntRange * t.ghoulBurstReach, r * 0.8);
          // Only out past the leash: something inside it is the guard's job.
          if (c && WS.dist(player.x, player.y, c.x, c.y) > leash * t.huntIn) {
            fam.charge = c; fam.chargeTime = 0;
            // ...and the rest start their wait again, so they go in turn,
            // each ghoulRestless after the last, not all in one burst.
            for (const f of this.list) if (f !== fam && f.spec.guard) f.idle = 0;
          } else fam.idle = t.ghoulRestless * 0.75;
        }
        if (fam.charge) {
          let c = fam.charge;
          if (c._dead) c = fam.charge = WS.Enemy.findNearest(fam.x, fam.y, 260);
          fam.chargeTime += dt;
          const damage = (t.dmgBase + t.dmgPerLevel * player.level) * dmgMult * player.damageMultiplier
            * (1 + player.summonDamage) * WS.CONST.PLAYER_DAMAGE_SCALE;
          if (!c || fam.chargeTime > t.ghoulChargeGiveUp || WS.dist(fam.x, fam.y, c.x, c.y) <= c.radius + 16) {
            burst(fam, player, t, damage);
            continue;
          }
          const [cx, cy] = WS.normalize(c.x - fam.x, c.y - fam.y);
          const sp = t.dashSpeed * speedMult * t.ghoulChargeMult;
          fam.x += cx * sp * dt; fam.y += cy * sp * dt;
          fam.facing = cx < 0 ? -1 : 1;
          fam.moved = sp * dt; fam.bob += dt * 3;
          continue;
        }
      }

      /* Leash, with hysteresis: once called off, a summon comes properly home
         before it hunts again.
         
         Without the second threshold this was a one-frame limit cycle and it
         pinned summons in place. Crossing the leash cleared the target and
         sent the summon home; one frame later it was a pixel inside the leash,
         reacquired the same mark, dashed out, and was called off again.
         Traced, a wolf sat between 434 and 445 pixels from the survivor - the
         leash is 440 - with NO target for 1.6 seconds while a creature stood
         148 pixels away.
         
         It shows up worst during a timestop, which is what was reported: the
         leash is anchored to the survivor, so walking drags the summon out of
         the cycle on its own. Stand still - which is exactly what a timestop
         invites you to do - and nothing breaks it. */
      const homeDist = WS.dist(fam.x, fam.y, player.x, player.y);
      if (homeDist > leash) fam.leashed = true;
      else if (homeDist < leash * t.recall) fam.leashed = false;

      /* Hunt around the SURVIVOR, not around the summon. Measured from the
         summon, a wolf already out at the leash could commit to a mark another
         huntRange beyond it - a mark it is structurally forbidden to reach.
         Bounded by the leash, everything it can see is something it can get
         to. */
      const reachable = WS.min(t.huntRange, leash * t.huntIn);
      if (fam.leashed) {
        fam.target = null;
      } else if (spec.pack) {
        // The pack runs one quarry down together; without one, each wolf
        // takes whatever is nearest ITSELF, which is how a pack works a herd.
        const q = this.quarry;
        if (q && !q._dead && WS.dist(player.x, player.y, q.x, q.y) <= reachable) fam.target = q;
        else if (!fam.target || fam.target._dead || fam.target === q
          || WS.dist(player.x, player.y, fam.target.x, fam.target.y) > reachable) {
          const n = WS.Enemy.findNearest(fam.x, fam.y, reachable);
          fam.target = n && WS.dist(player.x, player.y, n.x, n.y) <= reachable ? n : null;
        }
      } else if (spec.guard) {
        // The guard always turns to whatever is closest to the survivor.
        fam.target = WS.Enemy.findNearest(player.x, player.y, reachable);
      } else if (!fam.target || fam.target._dead
        || WS.dist(player.x, player.y, fam.target.x, fam.target.y) > reachable) {
        fam.target = WS.Enemy.findNearest(player.x, player.y, reachable);
      }

      let tx, ty, speed;
      if (fam.leashed) {
        [tx, ty] = WS.normalize(player.x - fam.x, player.y - fam.y);
        speed = t.dashSpeed * speedMult;
      } else if (fam.target) {
        [tx, ty] = WS.normalize(fam.target.x - fam.x, fam.target.y - fam.y);
        speed = t.dashSpeed * speedMult * (1 + player.summonHaste * 0.25);
      } else {
        // Nothing to hunt: lope around the survivor.
        const a = fam.bob;
        const ox = player.x + WS.cos(a) * 70, oy = player.y + WS.sin(a) * 70;
        [tx, ty] = WS.normalize(ox - fam.x, oy - fam.y);
        speed = t.wanderSpeed;
      }
      fam.x += tx * speed * dt;
      fam.y += ty * speed * dt;
      if (tx !== 0 && !(fam.pounce > 0)) fam.facing = tx < 0 ? -1 : 1;
      fam.moved = speed * dt;
      fam.bob += dt * 3;
      if (fam.pounce > 0) fam.pounce -= dt;

      fam.biteTimer -= dt * (1 + player.summonHaste);
      if (fam.biteTimer <= 0 && fam.target) {
        const reach = t.biteRadius * radiusMult * 0.6 + fam.target.radius;
        if (WS.dist2(fam.x, fam.y, fam.target.x, fam.target.y) <= reach * reach) {
          fam.biteTimer = t.biteCooldown * cdMult;
          // What the renderer plays: a wolf's pounce, a ghoul's longer rake,
          // and where it landed.
          fam.pounce = spec.guard ? 0.32 : 0.18;
          fam.idle = 0;
          fam.pounceMax = fam.pounce;
          fam.hitX = fam.target.x; fam.hitY = fam.target.y;
          const damage = (t.dmgBase + t.dmgPerLevel * player.level)
            * dmgMult
            * player.damageMultiplier
            * (1 + player.summonDamage)
            * WS.CONST.PLAYER_DAMAGE_SCALE;
          if (spec.pack) {
            /* One mouth, one creature - harder for each packmate that has
               had its teeth in the same one inside the window. */
            const q = fam.target, now = WS.Game.run ? WS.Game.run.time : 0;
            if (!(q._packAt > now - t.packWindow)) q._packN = 0;
            const mates = WS.min(t.packMax, q._packN || 0);
            q._packN = (q._packN || 0) + 1;
            q._packAt = now;
            const qx = q.x, qy = q.y;
            WS.Enemy.hit(q, damage * (1 + t.packBonus * mates), spec.source);
            /* ...and the pounce mauls what is packed around it, lighter. A
               bite that could only ever touch one creature measured a tenth
               of a ghoul's damage in a horde: the wolves spent their time
               running between single kills. */
            const skip = new Map([[q, q.spawnId]]);
            WS.Enemy.damageArea(qx, qy, t.biteRadius * t.mauleRadius * player.areaMultiplier,
              damage * t.maulDmg, skip, null, spec.source);
            // (the bite itself is drawn by the renderer; this is the pack's weight)
            if (mates) WS.FX.flash(qx, qy, 10 + 5 * mates, spec.tint, 0.15);
            // A kill does not stop a wolf: it is on the next one at once.
            if (q._dead) { fam.biteTimer = WS.min(fam.biteTimer, t.killRebite); fam.target = null; }
          } else {
            const r = t.biteRadius * radiusMult * player.areaMultiplier;
            WS.Enemy.damageArea(fam.x, fam.y, r, damage, null, null, spec.source);
            if (spec.guard) {
              // What the claws raked is slowed and left to rot.
              const pool = WS.Enemy.pool;
              for (let i = 0; i < pool.count; i++) {
                const e = pool.active[i];
                if (e._dead) continue;
                const reach = r + e.radius;
                if (WS.dist2(fam.x, fam.y, e.x, e.y) > reach * reach) continue;
                if (!e.boss) WS.Enemy.applySlow(e, t.ghoulSlow, t.ghoulSlowTime);
                WS.Enemy.applyRot(e, t.ghoulRot, t.ghoulRotTime);
              }
            }
            // (the rake's sweep is drawn by the renderer, the width of what it hits)
          }
        }
      }
    }
  };

  WS.Familiar = Familiar;

})(window.WS);
