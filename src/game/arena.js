/* The Eclipse Arena: a scripted duel with Aethelgard, driven by telegraphed
 * ground hazards rather than the ordinary boss pattern loop.
 *
 *   Solar Flare   - expanding rings with openings you must find and stand in
 *   Sunfall Spears- a grid of squares; only a few are safe when they fall
 *   Eclipse Cross - a spinning four-arm cutter, telegraphed before it bites
 *   Umbral Chains - anchors that drag you inward until you break them
 *
 * Phase 2 at 60% health overlaps two tracks at once; Phase 3 at 20% turns the
 * lights out and starts a hard enrage. */
'use strict';
(function (WS) {

  const Arena = {
    active: false,
    hazards: [],
    anchors: [],
    boss: null,
    phase: 1,
    trackA: 0,
    trackB: 0,
    enrage: 0,
    pullTimer: 0,
    darkness: 0,
  };

  Arena.tuning = {
    phase2HP: 60, phase3HP: 20, enrageTime: 45,
    ringDamage: 26, ringSpeed: 165, ringGapP1: 40, ringGapP2: 26, ringGapsP2: 7,
    ringSpinP2: 0.5, ringDelay: 1.4,
    spearDamage: 30, gridSafeP1: 4, gridSafeP2: 5, spearTele: 1.6, spearInterval: 8.5,
    cutterDamage: 32, cutterSpin: 0.7, cutterTele: 1.2, cutterInterval: 9.0,
    chainInterval: 11.0, chainBreak: 50,
  };

  const BOUNDS = { minX: 260, maxX: 1020, minY: 90, maxY: 630 };
  const CX = (BOUNDS.minX + BOUNDS.maxX) / 2;
  const CY = (BOUNDS.minY + BOUNDS.maxY) / 2;

  Arena.bounds = BOUNDS;

  Arena.begin = function () {
    this.active = true;
    this.hazards.length = 0;
    this.anchors.length = 0;
    this.phase = 1;
    this.trackA = 6;
    this.trackB = 14;
    this.enrage = 0;
    this.pullTimer = 0;
    this.darkness = 0;
    WS.Game.arenaBounds = BOUNDS;

    this.boss = WS.Enemy.spawn('aethelgard', CX, CY - 120, 1, true);
    if (this.boss) {
      WS.Game.announce(this.boss.template.name, this.boss.template.yell, 4.0,
        { kind: 'dread', art: this.boss.template.art, tint: this.boss.template.tint });
      WS.Audio.play('boss');
    }
  };

  Arena.stop = function () {
    this.active = false;
    this.hazards.length = 0;
    this.anchors.length = 0;
    this.boss = null;
    WS.Game.arenaBounds = null;
  };

  /* ------------------------------------------------------------ hazards -- */
  /** True when `angle` sits inside one of a ring's evenly-spaced openings. */
  function inGap(h, angle) {
    const half = (h.gapWidth * WS.PI / 180) * 0.5;
    for (let i = 0; i < h.gapCount; i++) {
      const centre = h.gapBase + h.gapRot + (i / h.gapCount) * WS.TAU;
      let d = ((angle - centre + WS.PI * 3) % WS.TAU) - WS.PI;
      if (WS.abs(d) <= half) return true;
    }
    return false;
  }

  Arena.ring = function (gapBase, gapWidth, damage, speed, gapCount, spin, delay) {
    this.hazards.push({
      shape: 'ring', cx: CX, cy: CY, r: 26, speed, thick: 30,
      gapBase, gapWidth, gapCount: gapCount || 1, gapRot: 0, spin: spin || 0,
      damage, delay: delay || 0, life: 9, hit: false,
    });
  };

  Arena.spears = function (safeCount) {
    const cols = 5, rows = 4;
    const w = (BOUNDS.maxX - BOUNDS.minX) / cols;
    const h = (BOUNDS.maxY - BOUNDS.minY) / rows;
    const cells = [];
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) cells.push({ cx, cy });
    }
    WS.shuffle(cells);
    const safe = new Set(cells.slice(0, safeCount).map((c) => c.cy * cols + c.cx));
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const isSafe = safe.has(cy * cols + cx);
        this.hazards.push({
          shape: 'square', safe: isSafe,
          x: BOUNDS.minX + cx * w, y: BOUNDS.minY + cy * h, w, h,
          telegraph: this.tuning.spearTele,
          damage: isSafe ? 0 : this.tuning.spearDamage,
          life: this.tuning.spearTele + 0.7, hit: false,
        });
      }
    }
    WS.Game.toast('Sunfall Spears', 'Find the ground that is not marked.');
  };

  Arena.cutter = function () {
    this.hazards.push({
      shape: 'cutter', cx: CX, cy: CY,
      ang: WS.random() * WS.PI * 0.5, spin: this.tuning.cutterSpin,
      half: 0.12, len: 900, damage: this.tuning.cutterDamage,
      telegraph: this.tuning.cutterTele, life: this.tuning.cutterTele + 7, hitTimer: 0,
    });
    WS.Game.toast('Eclipse Cross', 'Stay inside a turning quadrant.');
  };

  Arena.chains = function () {
    // Six anchors ring the arena, dragging the survivor inward until broken.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * WS.TAU + WS.random() * 0.3;
      this.anchors.push({
        x: CX + WS.cos(a) * 300,
        y: CY + WS.sin(a) * 190,
        health: this.tuning.chainBreak,
        pulse: WS.random() * WS.TAU,
      });
    }
    this.pullTimer = 0;
    WS.Game.toast('Umbral Chains', 'Run through the anchors to break them.');
    WS.Audio.play('warn');
  };

  /* ------------------------------------------------------------- update -- */
  Arena.update = function (dt) {
    if (!this.active) return;
    const player = WS.Game.player;
    const boss = this.boss;

    if (boss && !boss._dead) {
      const pct = (boss.health / boss.maxHealth) * 100;
      if (this.phase === 1 && pct <= this.tuning.phase2HP) {
        this.phase = 2;
        WS.Game.announce('Umbral Divide', 'The eclipse splits the sky.', 3.0);
        WS.Audio.play('boss');
        this.trackB = 2;
      } else if (this.phase === 2 && pct <= this.tuning.phase3HP) {
        this.phase = 3;
        this.enrage = this.tuning.enrageTime;
        WS.Game.announce('Total Darkness', 'It is ending this, one way or another.', 3.0);
        WS.Audio.play('boss');
      }
      // Aethelgard hovers, drifting a little so it never feels like scenery.
      boss.x = CX + WS.cos(WS.Game.run.time * 0.4) * 90;
      boss.y = CY - 120 + WS.sin(WS.Game.run.time * 0.55) * 40;
    }

    if (this.phase === 3) {
      this.darkness = WS.min(1, this.darkness + dt * 0.5);
      this.enrage -= dt;
      if (this.enrage <= 0) {
        // Hard enrage: the arena is wiped.
        WS.Player.takeDamage(player, 99999, 'Aethelgard, the Eclipse Sovereign');
        this.enrage = 5;
      }
    }

    const speedUp = this.phase === 3 ? 0.65 : 1;

    /* ---- cast tracks ----------------------------------------------------- */
    this.trackA -= dt;
    if (this.trackA <= 0) {
      this.trackA = (this.phase >= 2 ? 7.5 : 9.5) * speedUp;
      const t = this.tuning;
      if (this.phase >= 2) {
        this.ring(WS.random() * WS.TAU, t.ringGapP2, t.ringDamage, t.ringSpeed, t.ringGapsP2, t.ringSpinP2, 0.7);
        this.ring(WS.random() * WS.TAU, t.ringGapP2, t.ringDamage, t.ringSpeed, t.ringGapsP2, t.ringSpinP2, 0.7 + t.ringDelay);
      } else {
        this.ring(WS.random() * WS.TAU, t.ringGapP1 * 2, t.ringDamage, t.ringSpeed, 1, 0, 0.6);
        this.ring(WS.random() * WS.TAU, t.ringGapP1, t.ringDamage, t.ringSpeed, 1, 0, 0.6 + t.ringDelay);
      }
      WS.Game.toast('Solar Flare', 'Stand in the opening.');
    }

    this.trackB -= dt;
    if (this.trackB <= 0) {
      if (this.phase === 1) {
        this.trackB = this.tuning.spearInterval;
        this.spears(this.tuning.gridSafeP1);
      } else {
        // Phase 2+ rotates the three heavier mechanics.
        const pickRoll = WS.randInt(0, 2);
        if (pickRoll === 0) { this.trackB = this.tuning.spearInterval * speedUp; this.spears(this.tuning.gridSafeP2); }
        else if (pickRoll === 1) { this.trackB = this.tuning.cutterInterval * speedUp; this.cutter(); }
        else { this.trackB = this.tuning.chainInterval * speedUp; this.chains(); }
      }
    }

    /* ---- hazard resolution ----------------------------------------------- */
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.life -= dt;
      if (h.life <= 0) { this.hazards.splice(i, 1); continue; }

      if (h.shape === 'ring') {
        if (h.delay > 0) { h.delay -= dt; continue; }
        h.r += h.speed * dt;
        h.gapRot += h.spin * dt;
        const [, , d] = WS.normalize(player.x - h.cx, player.y - h.cy);
        if (!h.hit && WS.abs(d - h.r) < h.thick * 0.5 + player.radius * 0.5) {
          const a = WS.atan2(player.y - h.cy, player.x - h.cx);
          if (!inGap(h, a)) {
            h.hit = true;
            WS.Player.takeDamage(player, h.damage, 'Solar Flare');
          }
        }
        if (h.r > 900) this.hazards.splice(i, 1);

      } else if (h.shape === 'square') {
        if (h.safe) continue;                 // marked green; nothing lands here
        if (h.telegraph > 0) {
          h.telegraph -= dt;
          if (h.telegraph <= 0) {
            // The spear lands the moment the telegraph expires.
            if (player.x >= h.x && player.x <= h.x + h.w
              && player.y >= h.y && player.y <= h.y + h.h) {
              WS.Player.takeDamage(player, h.damage, 'Sunfall Spear');
            }
            WS.FX.flash(h.x + h.w / 2, h.y + h.h / 2, h.w * 0.5, [1.0, 0.86, 0.45], 0.3);
            WS.Audio.play('hit');
          }
        }

      } else if (h.shape === 'cutter') {
        if (h.telegraph > 0) { h.telegraph -= dt; continue; }
        h.ang += h.spin * dt;
        h.hitTimer -= dt;
        if (h.hitTimer <= 0) {
          const pa = WS.atan2(player.y - h.cy, player.x - h.cx);
          for (let arm = 0; arm < 4; arm++) {
            const armAng = h.ang + arm * WS.PI * 0.5;
            let diff = ((pa - armAng + WS.PI * 3) % WS.TAU) - WS.PI;
            if (WS.abs(diff) <= h.half) {
              h.hitTimer = 0.8;
              WS.Player.takeDamage(player, h.damage, 'Eclipse Cross');
              break;
            }
          }
        }
      }
      if (!WS.Game.running) return;
    }

    /* ---- umbral chains --------------------------------------------------- */
    if (this.anchors.length) {
      this.pullTimer -= dt;
      for (let i = this.anchors.length - 1; i >= 0; i--) {
        const an = this.anchors[i];
        an.pulse += dt * 4;
        if (WS.dist2(an.x, an.y, player.x, player.y) < (player.radius + 26) ** 2) {
          an.health -= 100 * dt;
          WS.FX.flash(an.x, an.y, 34, [0.75, 0.45, 1.0], 0.2);
          if (an.health <= 0) {
            this.anchors.splice(i, 1);
            WS.FX.burst(an.x, an.y, 12, '#b34ff2', 200, 0.5, 3);
            WS.Audio.play('hit');
            if (!this.anchors.length) WS.Game.toast('Umbral Chains', 'The pull relents.');
          }
          continue;
        }
      }
      // The chains drag the survivor toward the centre while any remain.
      if (this.anchors.length) {
        const [dx, dy] = WS.normalize(CX - player.x, CY - player.y);
        const pull = 26 * this.anchors.length;
        player.x = WS.clamp(player.x + dx * pull * dt, BOUNDS.minX, BOUNDS.maxX);
        player.y = WS.clamp(player.y + dy * pull * dt, BOUNDS.minY, BOUNDS.maxY);
        if (this.pullTimer <= 0) {
          this.pullTimer = 2.5;
          WS.Enemy.spawn('shadow_weaver',
            CX + WS.randRange(-200, 200), CY + WS.randRange(-120, 120), 1, true);
        }
      }
    }
  };

  Arena.onBossDead = function () {
    // Enemy.kill already counted the kill before handing off to us.
    WS.Save.stats.bosses.aethelgard = (WS.Save.stats.bosses.aethelgard || 0) + 1;
    WS.Save.save();
    this.stop();
    WS.Game.announce('The eclipse breaks.', 'Aethelgard is undone.', 3.0, { kind: 'glory' });
    WS.Audio.play('victory');
    WS.FX.screen('rgba(255,230,174,.35)', 1.0);
    WS.Achievements.check();
    WS.Game.endRun('arena_victory');
  };

  WS.Arena = Arena;

})(window.WS);
