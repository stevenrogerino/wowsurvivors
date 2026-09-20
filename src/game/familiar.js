/* Familiars: summons that HUNT. Each picks the nearest enemy, bounds it down,
 * bites, then peels off and retargets. Spirit wolves are fast and light;
 * ghouls are slower to close and slower to swing, but hit far harder with a
 * wider sweep. Granted in-run by Spirit Companion / Grave Call. */
'use strict';
(function (WS) {

  const MAX = 6;   // shared cap across every summon kind
  /* A leashed summon is only released once it is back inside this fraction of
     the leash, and it only takes marks inside this fraction of it. Both exist
     to keep the come-home and the go-hunt decisions from meeting at a single
     pixel and arguing there forever. */
  const RECALL = 0.55;
  const HUNT_IN = 0.90;

  const Familiar = {
    list: [],
    tuning: {
      dashSpeed: 340,
      biteRadius: 46,
      biteCooldown: 0.55,
      dmgBase: 14,
      dmgPerLevel: 1.0,
      huntRange: 560,
      leash: 440,
      wanderSpeed: 150,
      ghoulSpeedMult: 0.70,
      ghoulRadiusMult: 1.35,
      ghoulCdMult: 1.45,
      ghoulDmgMult: 2.10,
    },
    KINDS: {
      wolf: { art: 'spiritwolf', tint: [0.60, 0.85, 1.00], source: 'wolves' },
      ghoul: {
        art: 'risen', tint: [0.55, 0.90, 0.40], source: 'ghouls',
        speedMult: 'ghoulSpeedMult', radiusMult: 'ghoulRadiusMult',
        cdMult: 'ghoulCdMult', dmgMult: 'ghoulDmgMult',
      },
    },
  };

  Familiar.init = function () { this.list = []; };
  Familiar.reset = function () { this.list.length = 0; };

  Familiar.add = function (kind) {
    if (this.list.length >= MAX) return;
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
    });
    WS.FX.flash(player.x, player.y, 60, spec.tint, 0.4);
  };

  Familiar.update = function (dt) {
    const player = WS.Game.player;
    const t = this.tuning;

    for (const fam of this.list) {
      const spec = fam.spec;
      const speedMult = spec.speedMult ? t[spec.speedMult] : 1;
      const radiusMult = spec.radiusMult ? t[spec.radiusMult] : 1;
      const cdMult = spec.cdMult ? t[spec.cdMult] : 1;
      const dmgMult = spec.dmgMult ? t[spec.dmgMult] : 1;

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
      if (homeDist > t.leash) fam.leashed = true;
      else if (homeDist < t.leash * RECALL) fam.leashed = false;

      /* Hunt around the SURVIVOR, not around the summon. Measured from the
         summon, a wolf already out at the leash could commit to a mark another
         huntRange beyond it - a mark it is structurally forbidden to reach.
         Bounded by the leash, everything it can see is something it can get
         to. */
      const reachable = WS.min(t.huntRange, t.leash * HUNT_IN);
      if (fam.leashed) {
        fam.target = null;
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
      if (tx !== 0) fam.facing = tx < 0 ? -1 : 1;
      fam.bob += dt * 3;
      if (fam.pounce > 0) fam.pounce -= dt;

      fam.biteTimer -= dt * (1 + player.summonHaste);
      if (fam.biteTimer <= 0 && fam.target) {
        const reach = t.biteRadius * radiusMult * 0.6 + fam.target.radius;
        if (WS.dist2(fam.x, fam.y, fam.target.x, fam.target.y) <= reach * reach) {
          fam.biteTimer = t.biteCooldown * cdMult;
          fam.pounce = 0.18;
          const damage = (t.dmgBase + t.dmgPerLevel * player.level)
            * dmgMult
            * player.damageMultiplier
            * (1 + player.summonDamage)
            * WS.CONST.PLAYER_DAMAGE_SCALE;
          WS.Enemy.damageArea(fam.x, fam.y, t.biteRadius * radiusMult * player.areaMultiplier,
            damage, null, null, spec.source);
          WS.FX.flash(fam.x, fam.y, t.biteRadius * radiusMult * 0.8, spec.tint, 0.2);
        }
      }
    }
  };

  WS.Familiar = Familiar;

})(window.WS);
