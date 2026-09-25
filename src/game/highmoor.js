/* Highmoor's weather and its stones: the two things only that battlefield has.
 *
 *   STORM CELLS. The sky picks a handful of spots, one of them wherever the
 *   survivor is standing, darkens them, and strikes. The strike hurts the
 *   survivor like a creature's blow and hurts everything else in it like a
 *   weapon, so the storm is as much a tool as a threat: step out of the
 *   shadow and let whatever is chasing you walk into it.
 *
 *   SHRINES. A ring of standing stones rises now and then. Stand in it long
 *   enough and it gives a boon - STONE, GALE or STORM - for a while.
 *
 * A boss can call the storm too ({ type: 'storm' } in its patterns), on any
 * battlefield. Every number is in Config under HIGHMOOR. */
'use strict';
(function (WS) {

  const Moor = { strikes: [], shrines: [] };
  const C = () => WS.Config;

  const BOONS = {
    stone: { name: 'Shrine of Stone', tint: [0.78, 0.74, 0.62],
      text: () => `${WS.round(C().shrineStoneMitigation * 100)}% of every blow turned aside` },
    gale: { name: 'Shrine of the Gale', tint: [0.62, 0.92, 0.80],
      text: () => `Faster feet and ${WS.round((1 - C().shrineGaleCooldown) * 100)}% faster weapons` },
    storm: { name: 'Shrine of the Storm', tint: [0.62, 0.78, 1.00],
      text: () => 'Your own sky strikes the nearest foes' },
  };
  Moor.BOONS = BOONS;

  function state(run) {
    if (!run.moor) {
      run.moor = { stormTimer: C().stormFirst, shrineTimer: C().shrineFirst,
        boon: null, boonTimer: 0, boonTick: 0, captured: 0, strikes: 0 };
    }
    return run.moor;
  }

  Moor.clear = function () { this.strikes.length = 0; this.shrines.length = 0; };

  /* ---------------------------------------------------------- the storm -- */
  function scale() {
    return WS.WaveManager.enemyScale(WS.Game.run.time) * WS.CONST.ENEMY_SCALE;
  }

  /** One telegraphed strike. `dmg` is what it does to the survivor, `foe`
   *  what it does to anything else standing in it. */
  Moor.strike = function (x, y, opts) {
    const o = opts || {};
    const cfg = C();
    this.strikes.push({
      x: WS.clamp(x, 40, WS.CONST.WORLD_WIDTH - 40), y: WS.clamp(y, 40, WS.CONST.WORLD_HEIGHT - 40),
      r: o.r || cfg.stormRadius, tele: o.tele || cfg.stormTele, max: o.tele || cfg.stormTele,
      dmg: o.dmg !== undefined ? o.dmg : cfg.stormDamage * scale(),
      foe: o.foe !== undefined ? o.foe : cfg.stormFoeDamage * scale(),
      name: o.name || 'the storm', seed: WS.random() * 1000,
    });
  };

  /** A cell: one strike on the survivor (led a little, if they are moving)
   *  and the rest scattered round them. */
  Moor.cell = function (count, opts) {
    const p = WS.Game.player;
    const lead = p.moving ? 0.5 * p.moveSpeed : 0;
    this.strike(p.x + p.lastDirX * lead, p.y + p.lastDirY * lead, opts);
    for (let i = 1; i < count; i++) {
      const a = WS.random() * WS.TAU, d = WS.randRange(120, C().stormSpread);
      this.strike(p.x + WS.cos(a) * d, p.y + WS.sin(a) * d, opts);
    }
  };

  function land(s) {
    const p = WS.Game.player;
    const run = WS.Game.run;
    const col = [0.72, 0.84, 1.0];
    const beam = WS.Projectile.spawnBeam(s.x + 34, s.y - 320, s.x, s.y, 14, col, 0.28);
    if (beam) { beam.arc = true; beam.rank = 5; }
    WS.FX.flash(s.x, s.y, s.r, col, 0.36, 8, 'arcane');
    WS.FX.flash(s.x, s.y, s.r * 0.5, [1, 1, 1], 0.2);
    WS.FX.shake(2.5, 0.14);
    WS.Audio.play('thunder', s.x);
    if (s.foe > 0) {
      const struck = WS.Enemy.damageArea(s.x, s.y, s.r, s.foe, null, 16, 'storm');
      if (run && run.moor) run.moor.strikes += struck;
    }
    const reach = s.r + p.radius * 0.5;
    if (s.dmg > 0 && WS.dist2(p.x, p.y, s.x, s.y) < reach * reach) {
      WS.Player.takeDamage(p, s.dmg, s.name);
    }
  }

  /* --------------------------------------------------------- the stones -- */
  function raiseShrine(p) {
    const kinds = Object.keys(BOONS);
    const a = WS.random() * WS.TAU, d = WS.randRange(260, 420);
    const x = WS.clamp(p.x + WS.cos(a) * d, 120, WS.CONST.WORLD_WIDTH - 120);
    const y = WS.clamp(p.y + WS.sin(a) * d, 140, WS.CONST.WORLD_HEIGHT - 120);
    const kind = kinds[WS.randInt(0, kinds.length - 1)];
    Moor.shrines.push({ x, y, kind, r: C().shrineRadius, progress: 0, life: C().shrineStay,
      rise: 0, seed: WS.random() * 10, gone: 0 });
    WS.FX.flash(x, y, 90, BOONS[kind].tint, 0.4);
    WS.Game.toast(BOONS[kind].name + ' rises', 'Stand in the ring of stones to take its boon.',
      { kind: 'plain', art: 'rune', tint: BOONS[kind].tint });
    WS.Audio.play('cast', x, 'nature');
  }

  function grant(p, sh) {
    const m = state(WS.Game.run);
    m.boon = sh.kind; m.boonTimer = C().shrineBuff; m.boonTick = 0.4; m.captured++;
    WS.Save.stats.shrines = (WS.Save.stats.shrines || 0) + 1;
    const b = BOONS[sh.kind];
    WS.Game.announce(b.name, b.text(), 2.2, { kind: 'glory', art: 'rune', tint: b.tint });
    WS.FX.flash(sh.x, sh.y, 160, b.tint, 0.5, 9, 'arcane');
    WS.FX.flash(p.x, p.y, 70, b.tint, 0.4);
    WS.Audio.play('level');
  }

  /* ---------------------------------------------------------- per frame -- */
  Moor.update = function (dt, run) {
    const p = WS.Game.player;
    if (!p) return;
    const m = state(run);
    const cfg = C();
    const quiet = WS.Finale.running() || run.map.arena;

    // The weather, on Highmoor only - and not over a finale.
    if (run.map.storms && !quiet) {
      m.stormTimer -= dt;
      if (m.stormTimer <= 0) {
        const minutes = run.time / 60;
        m.stormTimer = WS.max(cfg.stormEveryFloor, cfg.stormEvery - cfg.stormEveryPerMinute * minutes);
        Moor.cell(WS.min(cfg.stormStrikesMax, WS.round(cfg.stormStrikes + cfg.stormStrikesPerMinute * minutes)));
      }
    }
    if (run.map.shrines && !quiet) {
      m.shrineTimer -= dt;
      if (m.shrineTimer <= 0 && !this.shrines.some((s) => !s.gone)) {
        m.shrineTimer = cfg.shrineEvery;
        raiseShrine(p);
      }
    }

    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.tele -= dt;
      if (s.tele <= 0) {
        this.strikes.splice(i, 1);
        land(s);
        if (!WS.Game.running) return;
      }
    }

    for (let i = this.shrines.length - 1; i >= 0; i--) {
      const sh = this.shrines[i];
      sh.rise = WS.min(1, sh.rise + dt * 1.5);
      if (sh.gone) {
        sh.gone += dt;
        if (sh.gone > 1.2) this.shrines.splice(i, 1);
        continue;
      }
      sh.life -= dt;
      const inside = WS.dist2(p.x, p.y, sh.x, sh.y) < sh.r * sh.r;
      if (inside) sh.progress += dt / cfg.shrineCapture;
      else sh.progress = WS.max(0, sh.progress - dt * cfg.shrineDecay / cfg.shrineCapture);
      if (sh.progress >= 1) { sh.gone = 0.001; sh.taken = true; grant(p, sh); }
      else if (sh.life <= 0) sh.gone = 0.001;
    }

    // The boon.
    if (m.boon) {
      m.boonTimer -= dt;
      if (m.boon === 'storm') {
        m.boonTick -= dt;
        if (m.boonTick <= 0) {
          m.boonTick = cfg.shrineStormEvery;
          const hit = new Map();
          for (let n = 0; n < cfg.shrineStormTargets; n++) {
            const e = WS.Enemy.findNearest(p.x, p.y, 460, hit);
            if (!e) break;
            hit.set(e, e.spawnId);
            const dmg = (cfg.shrineStormDamage + 3 * p.level) * p.damageMultiplier * WS.CONST.PLAYER_DAMAGE_SCALE;
            const beam = WS.Projectile.spawnBeam(e.x + 26, e.y - 260, e.x, e.y, 9, [0.72, 0.84, 1.0], 0.2);
            if (beam) { beam.arc = true; beam.rank = 3; }
            WS.Enemy.hit(e, dmg, 'shrine_storm');
            WS.FX.flash(e.x, e.y, 40, [0.72, 0.84, 1.0], 0.25);
          }
          WS.Audio.play('zap', p.x);
        }
      }
      if (m.boonTimer <= 0) { m.boon = null; WS.FX.notice(p.x, p.y, 'The boon fades', '#cfd8e8'); }
    }
  };

  /* -------------------------------------------------- what the boon does -- */
  Moor.mitigate = function (amount) {
    const m = WS.Game.run && WS.Game.run.moor;
    return m && m.boon === 'stone' ? amount * (1 - C().shrineStoneMitigation) : amount;
  };
  Moor.moveMult = function () {
    const m = WS.Game.run && WS.Game.run.moor;
    return m && m.boon === 'gale' ? C().shrineGaleSpeed : 1;
  };
  Moor.cooldownMult = function () {
    const m = WS.Game.run && WS.Game.run.moor;
    return m && m.boon === 'gale' ? C().shrineGaleCooldown : 1;
  };

  /** The HUD's meter for a boon while it lasts. */
  Moor.meter = function () {
    const m = WS.Game.run && WS.Game.run.moor;
    if (!m || !m.boon) return null;
    return { key: 'boon-' + m.boon, cls: 'boon ' + m.boon,
      label: `${BOONS[m.boon].name} · ${WS.formatTime(WS.max(0, WS.ceil(m.boonTimer)))}`,
      pct: m.boonTimer / C().shrineBuff };
  };

  /** For the Watch's timers: the next storm and the next shrine. */
  Moor.timers = function (run) {
    const out = [];
    const m = run.moor;
    if (!m || WS.Finale.running() || run.map.arena) return out;
    const cfg = C();
    if (run.map.storms && m.stormTimer > 0) {
      out.push({ kind: 'storm', id: 'storm', label: 'Storm', left: m.stormTimer,
        total: WS.max(cfg.stormEvery, m.stormTimer), art: 'bolt', tint: [0.62, 0.78, 1.0] });
    }
    if (run.map.shrines && m.shrineTimer > 0 && !this.shrines.some((s) => !s.gone)) {
      out.push({ kind: 'shrine', id: 'shrine', label: 'Standing stones', left: m.shrineTimer,
        total: WS.max(cfg.shrineEvery, m.shrineTimer), art: 'rune', tint: [0.78, 0.74, 0.62] });
    }
    return out;
  };

  WS.Moor = Moor;

})(window.WS);
