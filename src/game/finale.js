/* The finale: what happens when the survivor chooses to face whatever made
 * the night, instead of waiting for Death.
 *
 *   purge     first light burns the horde off the field in one expanding wave
 *   breather  thirty seconds, full health, the third blessing, and Beans
 *   fight     the map's encounter script (src/data/finales.js says which)
 *   outro     the villain gets away, or does not; then the dawn cinematic
 *
 * Every attack an encounter makes is one of a handful of telegraphed shapes
 * below - a circle, a lane, an expanding ring with openings, a sweeping beam,
 * a grid, safe ground in a field of doom - so all five fights share one
 * visual language: a shape appears, it tells you how long you have, and it
 * does exactly what it drew. Nothing reaches the survivor except through
 * Player.takeDamage, so armour, dodge, Warding Light and Thorns all work.
 */
'use strict';
(function (WS) {

  const W = () => WS.CONST.WORLD_WIDTH;
  const H = () => WS.CONST.WORLD_HEIGHT;
  const BREATHER = 30;
  const PURGE_SPEED = 1150;
  const EPILOGUE = 3.6;

  const F = {
    stage: 'idle',        // idle | purge | breather | fight | outro | done
    def: null, mapId: null, script: null, s: null,
    t: 0, timer: 0, purgeR: 0,
    hpScale: 1, dmgScale: 1, power: 1,
    units: [], marks: [], queue: [], line: null,
    wrecks: [], pods: [], booms: [],
    darkness: 0, darkTarget: 0,
    cinema: 0, cinemaMax: 0,
    bounds: null,
    label: '',
    tagCounter: 0,
  };

  F.reset = function () {
    this.stage = 'idle';
    this.def = null; this.mapId = null; this.script = null; this.s = null;
    this.t = 0; this.timer = 0; this.purgeR = 0;
    this.units.length = 0; this.marks.length = 0; this.queue.length = 0;
    this.line = null;
    this.wrecks.length = 0; this.pods.length = 0; this.booms.length = 0;
    this.darkness = 0; this.darkTarget = 0;
    this.cinema = 0; this.cinemaMax = 0;
    if (this.bounds && WS.Game.arenaBounds === this.bounds) WS.Game.arenaBounds = null;
    this.bounds = null;
    this.label = '';
  };

  /** A finale is on the field and owns the clock. */
  F.running = function () {
    return this.stage !== 'idle' && this.stage !== 'done';
  };

  F.available = function (run) {
    return !!(run && !run.map.arena && WS.Finales && WS.Finales[run.mapId]);
  };

  /** Called from the dawn panel's "Face" button, with the game running. */
  F.begin = function (run) {
    this.reset();
    const def = WS.Finales[run.mapId];
    if (!def) return false;
    this.def = def;
    this.mapId = run.mapId;
    this.script = SCRIPTS[def.script];
    const hyper = run.hyper ? WS.Config.hyperScale : 1;
    this.power = F.powerFor(run);
    this.hpScale = run.diffScale * hyper * this.power;
    /* The fight hits like the thirty minutes before it. Damage used to be
       difficulty times Hyper and nothing more, so a heavy telegraphed hit on
       Thornhollow did 44 while a common Kerchief at 30:00 touched for 134.
       Each finale names its own scale now (tuning.damage), set so its
       heaviest common mechanic takes about a quarter of an 840-health,
       16-armour survivor's bar on Thornhollow, climbing to near half on
       the Pale Wastes (raised twice on playtest: "hits a little too
       softly"). Riding the map's full boss curve instead was
       measured and rejected: it doubles from the first map to the last on
       top of the escalation the encounters already carry, and put the Pale
       Lord's every heavy at two thirds of a bar. Config.finaleDamage is the
       one dial over all five. */
    this.dmgScale = run.diffScale * hyper * (def.tuning.damage || 1) * WS.Config.finaleDamage;
    this.stage = 'purge';
    this.purgeR = 0;
    this.label = 'First light';
    run.finaleStarted = true;
    WS.Projectile.hostiles.releaseAll();
    WS.Hazard.clear();
    WS.Game.announce('First Light', 'The horde cannot stand it. Something bigger can.', 3.4,
      { kind: 'glory' });
    WS.Audio.play('evolve');
    WS.FX.screen('rgba(255,236,190,.55)', 1.2);
    WS.FX.shake(7, 0.6);
    return true;
  };

  /** How much more health this fight brings for the build that reached it -
   *  see Config.finaleRefDps. 1 for anything at or below the reference. */
  F.powerFor = function (run) {
    const cfg = WS.Config;
    const m = run.dawnMark;
    const dps = m && run.time - m.t > 10 ? (run.damageDone - m.d) / (run.time - m.t) : run.dps;
    const ratio = WS.max(1, (dps || 0) / cfg.finaleRefDps);
    return WS.min(cfg.finalePowerCap, Math.pow(ratio, cfg.finalePowerExp));
  };

  /* ------------------------------------------------------------ helpers -- */
  F.dmg = function (v) { return v * this.dmgScale; };

  F.live = function (e) { return !!(e && !e._dead && e.finaleTag); };

  /** Spawn one of the encounter's own units. Health comes from the template
   *  times difficulty and Hyper only: it is already sized for 30:00 here. */
  F.unit = function (id, x, y, hpMult) {
    const e = WS.Enemy.spawn(id, x, y, 1, true);
    if (!e) return null;
    const t = e.template;
    e.maxHealth = WS.floor(t.health * this.hpScale * (hpMult || 1));
    e.health = e.maxHealth;
    e.damage = t.damage * this.dmgScale;
    e.finaleTag = ++this.tagCounter;
    this.units.push(e);
    return e;
  };

  /** A part bolted to a host: it rides along at an offset and dies with it. */
  F.part = function (id, host, ox, oy, hpMult) {
    const e = this.unit(id, host.x + ox, host.y + oy, hpMult);
    if (!e) return null;
    e.host = host; e.ox = ox; e.oy = oy;
    return e;
  };

  /** Removes a unit without killing it - a machine leaving, not dying. */
  F.remove = function (e) {
    if (!this.live(e)) return;
    e.finaleTag = 0;
    WS.Enemy.pool.release(e);
  };

  /** The fodder. Sized to the horde at 30:00 on this map, and NOT to the
   *  overtime ramp - a finale that got harder the longer you took would
   *  punish exactly the builds that take longer. */
  F.addScale = function () {
    const run = WS.Game.run;
    const hyper = run.hyper ? WS.Config.hyperScale : 1;
    return (1 + WS.Config.deathTime / WS.Config.enemyScaleTime)
      * run.map.difficulty * run.diffScale * hyper;
  };

  F.adds = function (id, n, x, y, spread) {
    const scale = this.addScale();
    for (let i = 0; i < n; i++) {
      const a = WS.random() * WS.TAU;
      const r = spread * (0.35 + 0.65 * WS.random());
      const e = WS.Enemy.spawn(id,
        WS.clamp(x + WS.cos(a) * r, 30, W() - 30),
        WS.clamp(y + WS.sin(a) * r, 30, H() - 30), scale);
      if (e) e.finaleAdd = true;
    }
  };

  /** A ring of them closing in from off-screen, the way a swarm event does. */
  F.addsRing = function (id, n, dist) {
    const scale = this.addScale();
    for (let i = 0; i < n; i++) {
      const e = WS.Enemy.spawnRing(id, dist || 700, scale);
      if (e) e.finaleAdd = true;
    }
  };

  F.clearAdds = function () {
    const pool = WS.Enemy.pool;
    for (let i = pool.count - 1; i >= 0; i--) {
      const e = pool.active[i];
      if (e && !e.finale) {
        WS.FX.corpse(e);
        WS.FX.burst(e.x, e.y, 5, WS.hex(e.template.tint), 120, 0.4, 2.5);
        pool.releaseAt(i);
      }
    }
  };

  /* Dialogue: one line at a time, at a readable pace, in order. */
  F.speak = function (who, text, dur) {
    const d = dur || WS.clamp(1.8 + text.length * 0.05, 2.4, 6.0);
    this.queue.push({ who, text, dur: d, life: d });
  };
  F.say = function (key) {
    const l = this.def && this.def.say && this.def.say[key];
    if (l) this.speak(l[0], l[1]);
    if (LINE_SOUND[key]) WS.Audio.play(LINE_SOUND[key]);
  };
  F.sayOnce = function (key) {
    const s = this.s;
    if (!s) return;
    s.said = s.said || {};
    if (s.said[key]) return;
    s.said[key] = true;
    this.say(key);
  };
  F.linesLeft = function () {
    let t = this.line ? this.line.life : 0;
    for (const l of this.queue) t += l.dur;
    return t;
  };
  function updateLines(dt) {
    if (F.line) {
      F.line.life -= dt;
      if (F.line.life <= 0) F.line = null;
    }
    if (!F.line && F.queue.length) {
      F.line = F.queue.shift();
      // Whoever is speaking makes a noise as their line comes up.
      if (F.line.who !== 'narrator') WS.Audio.babble(F.line.who, F.line.text, { pace: 52 });
    }
  }

  /** Countdown timers on the script state: true once per `every` seconds. */
  F.every = function (key, dt, every, speed) {
    // Nothing fires while a cinematic beat has the stage.
    if (this.cinema > 0) return false;
    const tm = this.s.tm;
    if (tm[key] === undefined) tm[key] = every;
    tm[key] -= dt * (speed || 1);
    if (tm[key] <= 0) { tm[key] += every; return true; }
    return false;
  };

  /* ------------------------------------------------------ attack shapes -- */
  /** A circle that detonates when its fill reaches the edge. `from` makes it
   *  a lobbed shell: the renderer draws it flying in over the telegraph. */
  F.circle = function (x, y, r, tele, dmg, name, opts) {
    const o = opts || {};
    this.marks.push({ kind: 'circle', x, y, r, tele, maxTele: tele, dmg: this.dmg(dmg), name,
      tint: o.tint || [1.0, 0.45, 0.25], from: o.from || null, style: o.style || 'blast',
      burn: o.burn || 0 });
  };

  /** A straight line of trouble: telegraphed, then live for `active`. */
  F.lane = function (x, y, ang, len, w, tele, dmg, name, opts) {
    const o = opts || {};
    this.marks.push({ kind: 'lane', x, y, ang, len, w, tele, maxTele: tele,
      active: o.active || 0.3, dmg: this.dmg(dmg), name, hit: false,
      tint: o.tint || [1.0, 0.55, 0.25], style: o.style || 'shot', sound: o.sound });
  };

  /** Expanding ring with openings - stand in a gap as it passes. */
  F.ring = function (cx, cy, opts) {
    const o = opts;
    this.marks.push({ kind: 'ring', cx, cy, r: o.r0 || 30, speed: o.speed || 180, thick: o.thick || 28,
      gapBase: o.gapBase !== undefined ? o.gapBase : WS.random() * WS.TAU,
      gapWidth: o.gapWidth || 40, gapCount: o.gaps || 1, gapRot: 0, spin: o.spin || 0,
      delay: o.delay || 0, dmg: this.dmg(o.dmg), name: o.name, hit: false,
      tint: o.tint || [1.0, 0.6, 0.3], max: o.max || 1100 });
  };

  /** One or more beams turning about a point. `arms` of them, evenly spaced. */
  F.sweep = function (cx, cy, ang, spin, len, w, tele, dur, dmg, name, opts) {
    const o = opts || {};
    this.marks.push({ kind: 'sweep', cx, cy, ang, spin, len, w, tele, maxTele: tele,
      dur, maxDur: dur, dmg: this.dmg(dmg), name, cd: 0, arms: o.arms || 1,
      follow: o.follow || null, oy: o.oy || 0,
      tint: o.tint || [0.55, 0.85, 1.0] });
  };

  /** Squares over a rectangle; a few are safe and everything else lands. */
  F.grid = function (b, cols, rows, safeCount, tele, dmg, name, opts) {
    const o = opts || {};
    const cells = [];
    const w = (b.maxX - b.minX) / cols, h = (b.maxY - b.minY) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) cells.push({ x: b.minX + c * w, y: b.minY + r * h, w, h, safe: false });
    }
    WS.shuffle(cells).slice(0, safeCount).forEach((c) => { c.safe = true; });
    this.marks.push({ kind: 'grid', cells, tele, maxTele: tele, dmg: this.dmg(dmg), name,
      tint: o.tint || [0.6, 0.85, 1.0] });
  };

  /** Doom everywhere except inside the zones. */
  F.safe = function (zones, tele, dmg, name) {
    this.marks.push({ kind: 'safe', zones, tele, maxTele: tele, dmg: this.dmg(dmg), name });
  };

  /** Lightning strung between two units, live while both stand. */
  F.fence = function (a, b, dmg, name) {
    this.marks.push({ kind: 'fence', a, b, dmg: this.dmg(dmg), name, cd: 0 });
  };

  F.fan = function (x, y, ang, n, spread, speed, dmg, school, name, src) {
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * spread;
      WS.Projectile.spawnHostile(x, y, WS.cos(a) * speed, WS.sin(a) * speed,
        this.dmg(dmg), school, name, src || null);
    }
  };

  F.radial = function (x, y, n, speed, dmg, school, name, offset, src) {
    for (let i = 0; i < n; i++) {
      const a = (offset || 0) + (i / n) * WS.TAU;
      WS.Projectile.spawnHostile(x, y, WS.cos(a) * speed, WS.sin(a) * speed,
        this.dmg(dmg), school, name, src || null);
    }
  };

  F.aim = function (e) {
    const p = WS.Game.player;
    return WS.atan2(p.y - e.y, p.x - e.x);
  };

  F.near = function (spread) {
    const p = WS.Game.player;
    const a = WS.random() * WS.TAU, r = WS.random() * spread;
    return [WS.clamp(p.x + WS.cos(a) * r, 40, W() - 40), WS.clamp(p.y + WS.sin(a) * r, 40, H() - 40)];
  };

  F.eruption = function (x, y, r, tint) {
    WS.FX.flash(x, y, r, tint || [1.0, 0.7, 0.35], 0.5);
    WS.FX.burst(x, y, 16, WS.hex(tint || [0.7, 0.55, 0.4]), 240, 0.8, 4);
    WS.FX.shake(6, 0.35);
    WS.Audio.play('explode', x);
  };

  /** A string of explosions over a machine as it comes apart. */
  F.chain = function (x, y, spread, n, dur, tint) {
    for (let i = 0; i < n; i++) {
      this.booms.push({ t: (i / n) * dur + WS.random() * 0.1,
        x: x + WS.randRange(-spread, spread), y: y + WS.randRange(-spread * 0.6, spread * 0.4),
        r: 40 + WS.random() * 50, tint: tint || [1.0, 0.6, 0.3] });
    }
  };

  /** A machine that has stopped being a machine: drawn as scrap for a while. */
  F.wreck = function (e, kind, life) {
    if (kind !== 'fallen') this.wrecks.push({ x: e.x, y: e.y, radius: e.radius,
      kind: kind || e.template.machine || 'generic',
      art: e.template.art, tint: e.template.tint, size: e.spriteSize,
      life: life || 30, maxLife: life || 30, rot: 0, vy: 0, fall: 0 });
    F.eruption(e.x, e.y, e.radius * 2.2, [1.0, 0.6, 0.3]);
    WS.FX.flash(e.x, e.y, e.radius * 5, '#f5c56b', 0.9);
    WS.FX.stop(0.14);
  };

  /** Grimtunnel's escape pod, on a path of waypoints. */
  F.pod = function (x, y, path, opts) {
    const o = opts || {};
    this.pods.push({ x, y, path: path.slice(), speed: o.speed || 260, t: 0, frozen: !!o.frozen,
      carrying: !!o.carrying, grabAt: o.grabAt || null, done: false });
    return this.pods[this.pods.length - 1];
  };

  /* -------------------------------------------------------------- stages -- */
  function purgeEnemy(e) {
    const run = WS.Game.run;
    WS.FX.corpse(e);
    WS.FX.burst(e.x, e.y, e.boss ? 20 : 6, '#ffe6ae', e.boss ? 220 : 130, 0.5, 3);
    WS.Save.recordKill(e.template, e.id);
    run.kills++;
  }

  function startBreather() {
    const p = WS.Game.player;
    F.stage = 'breather';
    F.timer = BREATHER;
    F.label = 'Breathe';
    p.health = p.maxHealth;
    WS.FX.flash(p.x, p.y, 120, WS.CONST.COLORS.heal, 0.6);
    WS.XP.vacuumAll();
    const a = WS.random() * WS.TAU;
    if (WS.Pickup.spawn('merchant',
      WS.clamp(p.x + WS.cos(a) * 220, 100, W() - 100),
      WS.clamp(p.y + WS.sin(a) * 160, 100, H() - 100))) {
      WS.Game.toast('Beans sets up shop', '"Big fight? Eggs help. Probably."', { kind: 'merchant' });
    }
    WS.Game.offerBlessing('third');
  }

  /** Letterbox the fight for `dur` seconds: the survivor cannot be hurt and
   *  nothing is fired, so an entrance can be watched rather than survived. */
  F.cine = function (dur) {
    this.cinema = WS.max(this.cinema || 0, dur);
    this.cinemaMax = WS.max(this.cinemaMax || 0, this.cinema);
  };

  function arrive() {
    const def = F.def;
    F.stage = 'fight';
    F.cine(4.2);
    F.s = { tm: {}, said: {} };
    F.script.start(F);
    WS.Game.announce(def.title, def.subtitle, 4.2,
      { kind: 'dread', art: def.art, tint: def.tint });
    WS.Audio.play('boss');
    WS.Audio.playMusic('eclipse');
    WS.FX.shake(8, 0.6);
    for (const l of def.intro) F.speak(l[0], l[1]);
    // Say it when the fight has sized itself to the build - otherwise a
    // tougher boss just looks like a bug, or like a build that got weaker.
    if (F.power > 1.05) {
      WS.Game.toast('It has taken your measure',
        `Your damage at dawn: this fight brings ×${F.power.toFixed(1)} the health.`,
        { kind: 'warn', art: 'sovereign', tint: [0.9, 0.55, 1.0] });
    }
  }

  /** The encounter is won: clear the field and let the story finish. */
  F.win = function () {
    if (this.stage !== 'fight') return;
    this.stage = 'outro';
    this.marks.length = 0;
    WS.Projectile.hostiles.releaseAll();
    WS.Hazard.clear();
    this.clearAdds();
    this.queue.length = 0;
    this.line = null;
    for (const l of this.def.outro) this.speak(l[0], l[1]);
    this.timer = this.linesLeft() + EPILOGUE;
    this.epilogueShown = false;
    this.cinema = 0; this.cinemaMax = 0;
    this.cine(this.timer);
    WS.Game.timeScale = 0.25;           // the killing blow, in slow motion
    WS.FX.stop(0.2);
    this.darkTarget = 0;
    if (this.script.onWin) this.script.onWin(this);
    WS.Audio.play('victory');
    WS.FX.screen('rgba(255,230,174,.3)', 1.0);
  };

  function finish() {
    const run = WS.Game.run;
    F.stage = 'done';
    F.label = '';
    for (const e of F.units) if (F.live(e)) F.remove(e);
    F.units.length = 0;
    if (F.bounds && WS.Game.arenaBounds === F.bounds) WS.Game.arenaBounds = null;
    F.bounds = null;
    F.darkness = 0; F.darkTarget = 0;
    run.finaleCleared = true;
    const st = WS.Save.stats;
    st.finales = st.finales || {};
    st.finales[F.mapId] = (st.finales[F.mapId] || 0) + 1;
    WS.Save.save();
    WS.Game.finaleVictory();
  }

  /* ------------------------------------------------------------- update -- */
  F.update = function (dt) {
    const p = WS.Game.player;
    this.t += dt;
    updateLines(dt);
    this.darkness += (this.darkTarget - this.darkness) * WS.min(1, dt * 1.5);
    if (this.cinema > 0) {
      this.cinema -= dt;
      p.invulnerable = WS.max(p.invulnerable, 0.2);
      if (this.cinema <= 0) { this.cinema = 0; this.cinemaMax = 0; }
    }

    if (this.stage === 'purge') {
      this.purgeR += PURGE_SPEED * dt;
      const pool = WS.Enemy.pool;
      for (let i = pool.count - 1; i >= 0; i--) {
        const e = pool.active[i];
        if (e && WS.dist2(e.x, e.y, p.x, p.y) <= this.purgeR * this.purgeR) {
          purgeEnemy(e);
          pool.releaseAt(i);
        }
      }
      if (this.purgeR > 1700) startBreather();
      return;
    }

    if (this.stage === 'breather') {
      const before = this.timer;
      this.timer -= dt;
      if (before > 8 && this.timer <= 8) {
        WS.Game.announce('The ground is shaking.', 'Eight seconds.', 3.0);
        WS.Audio.play('warn');
      }
      if (this.timer < 8) WS.FX.shake(1.5 + (8 - this.timer) * 0.4, 0.1);
      this.label = 'Breathe · ' + WS.max(0, WS.ceil(this.timer));
      if (this.timer <= 0) arrive();
      return;
    }

    if (this.stage === 'fight') {
      // Parts ride their host; a host that is gone takes its parts with it.
      for (let i = this.units.length - 1; i >= 0; i--) {
        const e = this.units[i];
        if (!this.live(e)) { this.units.splice(i, 1); continue; }
        if (e.host) {
          if (!this.live(e.host)) { this.units.splice(i, 1); this.remove(e); continue; }
          e.x = e.host.x + e.ox; e.y = e.host.y + e.oy;
          e.hidden = e.host.hidden;
        }
        if (e.hidden) e.untargetable = true;
      }
      if (WS.Enemy.freezeTimer <= 0) this.script.update(this, dt);
      if (!WS.Game.running) return;
      updateMarks(dt);
      if (!WS.Game.running) return;
    } else if (this.stage === 'outro') {
      p.invulnerable = WS.max(p.invulnerable, 0.2);
      if (this.script.outro) this.script.outro(this, dt);
      this.timer -= dt;
      if (!this.epilogueShown && this.timer <= EPILOGUE) {
        this.epilogueShown = true;
        const ep = this.def.epilogue;
        if (ep) WS.Game.announce(ep[0], ep[1], EPILOGUE, { kind: 'glory' });
      }
      if (this.timer <= 0) finish();
    }
    updateDecor(dt);
  };

  function updateDecor(dt) {
    for (let i = F.booms.length - 1; i >= 0; i--) {
      const b = F.booms[i];
      b.t -= dt;
      if (b.t <= 0) { F.eruption(b.x, b.y, b.r, b.tint); F.booms.splice(i, 1); }
    }
    for (let i = F.wrecks.length - 1; i >= 0; i--) {
      const w = F.wrecks[i];
      w.life -= dt;
      if (w.fall > 0) {
        w.fall -= dt;
        w.y += w.vy * dt;
        w.rot += 0.25 * dt;
      }
      if (WS.random() < dt * 6) {
        WS.FX.burst(w.x + WS.randRange(-40, 40), w.y + WS.randRange(-30, 10), 1,
          '#5a4a40', 40, 1.2, 5);
      }
      if (w.life <= 0) F.wrecks.splice(i, 1);
    }
    for (const pod of F.pods) {
      pod.t += dt;
      if (pod.frozen || pod.done) continue;
      const wp = pod.path[0];
      if (!wp) { pod.done = true; continue; }
      const [dx, dy, d] = WS.normalize(wp[0] - pod.x, wp[1] - pod.y);
      const step = pod.speed * dt;
      if (d <= step) {
        pod.x = wp[0]; pod.y = wp[1]; pod.path.shift();
        if (wp[2] === 'grab') {
          pod.carrying = true;
          WS.FX.flash(pod.x, pod.y, 60, '#9fe6c0', 0.5);
          WS.Audio.play('gem');
        }
        if (wp[2] === 'freeze') {
          pod.frozen = true;
          WS.FX.flash(pod.x, pod.y, 70, [0.7, 0.9, 1.0], 0.6);
          WS.Audio.play('freeze');
        }
      } else {
        pod.x += dx * step; pod.y += dy * step;
      }
    }
  }

  function inLane(m, px, py, pr) {
    const dx = px - m.x, dy = py - m.y;
    const c = WS.cos(m.ang), s = WS.sin(m.ang);
    const along = dx * c + dy * s;
    const across = -dx * s + dy * c;
    return along >= -pr && along <= m.len + pr && WS.abs(across) <= m.w / 2 + pr * 0.6;
  }

  function inGap(m, angle) {
    const half = (m.gapWidth * WS.PI / 180) * 0.5;
    for (let i = 0; i < m.gapCount; i++) {
      const centre = m.gapBase + m.gapRot + (i / m.gapCount) * WS.TAU;
      const d = ((angle - centre + WS.PI * 3) % WS.TAU) - WS.PI;
      if (WS.abs(d) <= half) return true;
    }
    return false;
  }
  F.inGap = inGap;

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const t = WS.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return WS.dist(px, py, ax + dx * t, ay + dy * t);
  }

  function hurt(m, amount) {
    WS.Player.takeDamage(WS.Game.player, amount, m.name);
  }

  function updateMarks(dt) {
    const p = WS.Game.player;
    const pr = p.radius;
    for (let i = F.marks.length - 1; i >= 0; i--) {
      const m = F.marks[i];
      let done = false;
      if (m.kind === 'circle') {
        m.tele -= dt;
        if (m.tele <= 0) {
          if (WS.dist(p.x, p.y, m.x, m.y) < m.r + pr * 0.5) hurt(m, m.dmg);
          WS.FX.flash(m.x, m.y, m.r, m.tint, 0.35);
          if (m.style !== 'quiet') WS.Audio.play('enemyHit', m.x);
          if (m.burn > 0) {
            WS.Hazard.spawn(m.x, m.y, { radius: m.r * 0.6, fuse: 0.2, life: m.burn,
              damage: m.dmg * 0.25, interval: 0.5, tint: m.tint, name: m.name });
          }
          done = true;
        }
      } else if (m.kind === 'lane') {
        if (m.tele > 0) {
          m.tele -= dt;
          if (m.tele <= 0) {
            WS.Audio.play(m.sound || 'explode', m.x);
            WS.FX.shake(3, 0.15);
          }
        } else {
          m.active -= dt;
          if (!m.hit && inLane(m, p.x, p.y, pr)) { m.hit = true; hurt(m, m.dmg); }
          if (m.active <= 0) done = true;
        }
      } else if (m.kind === 'ring') {
        if (m.delay > 0) { m.delay -= dt; continue; }
        m.r += m.speed * dt;
        m.gapRot += m.spin * dt;
        const d = WS.dist(p.x, p.y, m.cx, m.cy);
        if (!m.hit && WS.abs(d - m.r) < m.thick * 0.5 + pr * 0.5) {
          if (!inGap(m, WS.atan2(p.y - m.cy, p.x - m.cx))) { m.hit = true; hurt(m, m.dmg); }
        }
        if (m.r > m.max) done = true;
      } else if (m.kind === 'sweep') {
        if (m.follow) {
          if (F.live(m.follow)) { m.cx = m.follow.x; m.cy = m.follow.y + m.oy; } else done = true;
        }
        if (m.tele > 0) {
          m.tele -= dt;
        } else {
          m.ang += m.spin * dt;
          m.dur -= dt;
          m.cd -= dt;
          if (m.cd <= 0) {
            for (let a = 0; a < m.arms; a++) {
              const ang = m.ang + (a / m.arms) * WS.TAU;
              const probe = { x: m.cx, y: m.cy, ang, len: m.len, w: m.w };
              if (inLane(probe, p.x, p.y, pr)) { m.cd = 0.7; hurt(m, m.dmg); break; }
            }
          }
          if (m.dur <= 0) done = true;
        }
      } else if (m.kind === 'grid') {
        m.tele -= dt;
        if (m.tele <= 0) {
          for (const c of m.cells) {
            if (c.safe) continue;
            if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) hurt(m, m.dmg);
            WS.FX.flash(c.x + c.w / 2, c.y + c.h / 2, c.w * 0.45, m.tint, 0.3);
          }
          WS.Audio.play('explode');
          WS.FX.shake(5, 0.3);
          done = true;
        }
      } else if (m.kind === 'safe') {
        m.tele -= dt;
        if (m.tele <= 0) {
          const inside = m.zones.some((z) => WS.dist(p.x, p.y, z.x, z.y) < z.r);
          if (!inside) hurt(m, m.dmg);
          done = true;
        }
      } else if (m.kind === 'fence') {
        if (!F.live(m.a) || !F.live(m.b)) done = true;
        else {
          m.cd -= dt;
          if (m.cd <= 0 && segDist(p.x, p.y, m.a.x, m.a.y, m.b.x, m.b.y) < 12 + pr * 0.6) {
            m.cd = 0.7;
            hurt(m, m.dmg);
          }
        }
      }
      if (!WS.Game.running) return;
      if (done) F.marks.splice(i, 1);
    }
  }

  /* What each part of a finale sounds like when it goes. The machines
     explode; a lantern breaks like glass; a pylon discharges; a pipe vents;
     a shard of the Pale shatters. */
  const PART_SOUND = {
    lantern_turret: 'glass', soul_lantern: 'glass', galleon_cannon: 'cannon',
    tesla_pylon: 'zap', coolant_pipe: 'drill', frost_shard: 'shatter', walker_leg: 'shock',
  };
  /* And the lines that land with a sound under them. */
  const LINE_SOUND = {
    burrow: 'rumble', surface: 'rumble', turretsDown: 'glass', crash: 'cannon',
    rise: 'winter', relight: 'glass', pylons: 'zap', destruct: 'shock', kneel: 'shock',
    breach: 'drill', wake: 'winter', lord: 'winter', shards: 'shatter', winter: 'winter',
  };

  /** Called by Enemy.kill for anything carrying `finale`. */
  F.onUnitDead = function (e) {
    const run = WS.Game.run;
    const t = e.template;
    const idx = this.units.indexOf(e);
    if (idx >= 0) this.units.splice(idx, 1);
    e.finaleTag = 0;
    if (e.boss) {
      run.bossesSlain++;
      WS.Save.stats.bosses[e.id] = (WS.Save.stats.bosses[e.id] || 0) + 1;
      const gold = WS.floor((t.gold || 100) * run.goldMult * WS.Game.player.goldMultiplier);
      WS.Game.addGold(gold, e.x, e.y);
      for (let n = 0; n < 10; n++) {
        WS.XP.spawnGem(e.x + WS.randRange(-50, 50), e.y + WS.randRange(-50, 50),
          WS.floor((t.xp || 100) / 10));
      }
      WS.FX.shake(9, 0.5);
      WS.Audio.play('explode', e.x);
    } else {
      WS.FX.flash(e.x, e.y, e.radius * 3, WS.hex(t.tint), 0.45);
      WS.FX.shake(4, 0.25);
      WS.Audio.play(PART_SOUND[e.id] || 'explode', e.x);
    }
    if (this.stage === 'fight' && this.script.onDead) this.script.onDead(this, e);
  };

  /** What the HUD mode line says while a finale is on. */
  F.hudLabel = function () {
    if (!this.running()) return '';
    if (this.stage === 'fight' && this.s && this.s.label) return 'Finale · ' + this.s.label;
    return 'Finale · ' + this.label;
  };

  /* ================================================================== */
  /*  The encounters                                                     */
  /* ================================================================== */

  /* Keeps a machine a comfortable distance from the survivor, easing
     toward a point on the far side of where it already is. */
  function keepAway(F, e, dist, speed, dt, box) {
    const p = WS.Game.player;
    const [dx, dy] = WS.normalize(e.x - p.x, e.y - p.y);
    const b = box || { minX: 110, maxX: W() - 110, minY: 110, maxY: H() - 110 };
    const tx = WS.clamp(p.x + dx * dist, b.minX, b.maxX);
    const ty = WS.clamp(p.y + dy * dist, b.minY, b.maxY);
    const [mx, my, d] = WS.normalize(tx - e.x, ty - e.y);
    const step = WS.min(d, speed * dt);
    e.x += mx * step; e.y += my * step;
    if (WS.abs(mx) > 0.1) e.facing = p.x < e.x ? -1 : 1;
  }

  /* Where a big machine may roam: clear of the edges and below the HUD's
     boss arc, which covers the top of the screen. */
  const MACHINE_BOX = { minX: 170, maxX: 1110, minY: 250, maxY: 560 };

  function busy(e) { return e.windup > 0 || e.chargeTimer > 0; }

  /* Finale charges lock their lane CHARGE_LOCK seconds before they go: the
     tell tracks you, then stops, then the machine commits - and that last
     beat is the one a player reacts to. */
  const CHARGE_LOCK = 0.3;
  function charge(e, windup, time, range, girth) {
    const p = WS.Game.player;
    const [dx, dy] = WS.normalize(p.x - e.x, p.y - e.y);
    WS.Enemy.beginCharge(e, dx, dy, windup, time, range, girth, WS.min(CHARGE_LOCK, windup * 0.6));
    WS.Audio.play('warn', e.x);
  }

  const SCRIPTS = {};

  /* ---------------------------------------------------- Thornhollow --- */
  /* The Candlecrawler. A shielded hull behind two lantern turrets: kill the
     turrets and it overheats with its cockpit open. Past 60% it burrows and
     hunts you from underneath while lamplings pour out; past 25% it melts
     down and drills in pairs, leaving the ground on fire. */
  SCRIPTS.candlecrawler = {
    start(F) {
      const s = F.s;
      s.mode = 'rise'; s.rise = 1.8; s.cycle = 0; s.turrets = []; s.chain = 0;
      s.label = 'The Candlecrawler rises';
      const c = s.core = F.unit('candlecrawler', 640, 280);
      c.untargetable = true;
      c.rise = 0;
      /* Its lines: an overheat can open it down to the next and no further,
         then the turrets come back; then the burrow; then the meltdown. A
         build that hits hard gets through each window fast - it still sees
         every window. */
      const T = F.def.tuning;
      s.lines = T.overheatLines.concat([T.burrowAt, T.meltdownAt]);
      s.line = 0;
      c.hpFloor = s.lines[0] * c.maxHealth;
      F.eruption(640, 280, 160, [1.0, 0.7, 0.35]);
      s.tm = { bomb: 4.5, drill: 8, hatch: 7, ring: 9, trail: 0 };
    },
    deploy(F) {
      const s = F.s, T = F.def.tuning, c = s.core;
      const mult = 1 + T.turretHpGrowth * s.cycle;
      s.turrets = [
        F.part('lantern_turret', c, -62, -14, mult),
        F.part('lantern_turret', c, 62, -14, mult),
      ].filter(Boolean);
      c.untargetable = true; c.dmgTaken = 1;
      c.displayName = 'The Candlecrawler · Shielded';
      s.mode = 'shielded';
      s.label = 'Break the lantern turrets';
      WS.FX.flash(c.x, c.y, 120, [1.0, 0.8, 0.4], 0.4);
    },
    update(F, dt) {
      const s = F.s, T = F.def.tuning, c = s.core;
      if (!F.live(c)) return;
      const p = WS.Game.player;
      const hp = c.health / c.maxHealth;

      if (s.mode === 'rise') {
        s.rise -= dt;
        c.rise = WS.clamp(1 - s.rise / 1.8, 0, 1);
        if (s.rise <= 0) { c.rise = 1; this.deploy(F); }
        return;
      }

      // The two thresholds, checked in whatever mode the fight is in.
      if (!s.burrowed && hp <= T.burrowAt && s.mode !== 'burrow') {
        s.burrowed = true;
        this.nextLine(F);
        for (const t of s.turrets) F.remove(t);
        s.turrets = [];
        s.mode = 'burrow'; s.burrowT = T.burrowTime;
        s.mx = c.x; s.my = c.y; s.erupts = 0;
        c.hidden = true; c.untargetable = true; c.dmgTaken = 1;
        c.windup = 0; c.chargeTimer = 0; c.telegraph = null;
        F.eruption(c.x, c.y, 140);
        F.say('burrow');
        s.label = 'Underground';
        c.displayName = 'The Candlecrawler · Burrowing';
        F.addsRing('lampling', T.lamplings + 6, 700);
        return;
      }
      if (!s.melt && hp <= T.meltdownAt && s.mode === 'stripped') {
        s.melt = true;
        c.hpFloor = 0;
        F.say('meltdown');
        s.label = 'Meltdown';
        c.displayName = 'The Candlecrawler · Meltdown';
        WS.FX.screen('rgba(255,80,40,.2)', 0.8);
      }
      const pace = s.melt ? 1.55 : 1;

      if (s.mode === 'burrow') {
        // Coming up: the mound stops and the ground is marked where the hull
        // will break through. It used to surface the same instant, under a
        // mound that follows you - a hit nobody could see coming.
        if (s.surfacing > 0) {
          s.surfacing -= dt;
          if (WS.random() < dt * 30) WS.FX.burst(s.mx, s.my, 1, '#8a6a44', 120, 0.6, 5);
          if (s.surfacing <= 0) {
            c.x = s.mx; c.y = s.my;
            c.hidden = false; c.untargetable = false;
            F.eruption(c.x, c.y, 150);
            s.mode = 'stripped';
            s.label = 'Plating stripped';
            c.displayName = 'The Candlecrawler';
            F.say('surface');
            s.tm.drill = 3; s.tm.ring = 5;
          }
          return;
        }
        const [dx, dy, d] = WS.normalize(p.x - s.mx, p.y - s.my);
        const step = WS.min(d, 150 * dt);
        s.mx += dx * step; s.my += dy * step;
        s.burrowT -= dt;
        if (WS.random() < dt * 14) {
          WS.FX.burst(s.mx, s.my, 1, '#6b5238', 60, 0.8, 4);
        }
        if (F.every('erupt', dt, 3.3)) {
          F.circle(s.mx, s.my, T.eruptRadius, T.eruptTele, T.eruptDamage, 'The Candlecrawler',
            { style: 'erupt', tint: [0.9, 0.6, 0.3] });
          s.erupts++;
          if (s.erupts === 2) F.addsRing('lampling', T.lamplings, 700);
        }
        if (s.burrowT <= 0) {
          s.mx = WS.clamp(s.mx, MACHINE_BOX.minX, MACHINE_BOX.maxX);
          s.my = WS.clamp(s.my, MACHINE_BOX.minY, MACHINE_BOX.maxY);
          s.surfacing = T.surfaceTele;
          F.circle(s.mx, s.my, T.eruptRadius, T.surfaceTele, T.eruptDamage, 'The Candlecrawler',
            { style: 'erupt', tint: [0.9, 0.6, 0.3] });
          WS.Audio.play('warn', s.mx);
        }
        return;
      }

      if (s.mode === 'overheat') {
        s.heat -= dt;
        // Opened as far as this window goes: the turrets come straight back.
        if (s.lines[s.line] > T.burrowAt && c.health <= c.hpFloor + 0.5) {
          this.nextLine(F);
          s.heat = 0;
          WS.FX.flash(c.x, c.y, 140, [1.0, 0.75, 0.35], 0.6);
          WS.FX.shake(6, 0.4);
        }
        if (WS.random() < dt * 10) {
          WS.FX.burst(c.x + WS.randRange(-40, 40), c.y - 30, 1, '#d8d4cc', 70, 1.0, 5);
        }
        if (s.heat <= 0) {
          s.cycle++;
          this.deploy(F);
          F.say('turretsBack');
        }
        return;
      }

      // shielded / stripped: the machine hunts.
      if (!busy(c)) {
        if (s.chain > 0) {
          s.chain--;
          charge(c, T.drillChainWindup, T.drillTime, T.drillRange, 1.5);
        } else {
          keepAway(F, c, 250, s.melt ? 80 : 55, dt, MACHINE_BOX);
        }
      }
      c.damage = F.dmg(busy(c) ? T.drillDamage : c.template.damage);

      if (s.melt && c.chargeTimer > 0 && F.every('trail', dt, 0.1)) {
        WS.Hazard.spawn(c.x, c.y, { radius: 34, fuse: 0.25, life: 3.2, damage: F.dmg(12),
          interval: 0.45, tint: [1.0, 0.5, 0.2], name: 'Burning track' });
      }

      if (F.every('drill', dt, s.mode === 'stripped' ? 6 : 8, pace) && !busy(c)) {
        charge(c, T.drillWindup, T.drillTime, T.drillRange, 1.5);
        if (s.melt) s.chain = 1;
      }

      if (F.every('bomb', dt, s.mode === 'stripped' ? 4 : 3.4, pace)) {
        const guns = s.mode === 'shielded' ? s.turrets.filter((t) => F.live(t)) : [c];
        for (const g of guns) {
          const n = s.mode === 'stripped' ? 3 : 2;
          for (let k = 0; k < n; k++) {
            const [x, y] = k === 0 ? [p.x, p.y] : F.near(150);
            F.circle(x, y, T.bombRadius, T.bombTele + k * 0.15, T.bombDamage, 'Lantern bomb',
              { from: { x: g.x, y: g.y - 10 }, burn: s.melt ? 3 : 2, tint: [1.0, 0.62, 0.22] });
          }
        }
      }

      if (F.every('hatch', dt, s.mode === 'stripped' ? 12 : 10)) {
        F.adds('lampling', T.lamplings, c.x, c.y + 50, 100);
        WS.FX.flash(c.x, c.y + 40, 60, [1.0, 0.85, 0.5], 0.3);
      }

      if (s.mode === 'stripped' && F.every('ring', dt, 9, pace)) {
        F.ring(c.x, c.y, { speed: T.ringSpeed, gaps: 2, gapWidth: 50, dmg: T.ringDamage,
          name: 'Candle-fire ring', tint: [1.0, 0.55, 0.2] });
      }
    },
    nextLine(F) {
      const s = F.s, c = s.core;
      s.line++;
      c.hpFloor = s.line < s.lines.length ? s.lines[s.line] * c.maxHealth : 0;
    },
    onDead(F, e) {
      const s = F.s;
      if (e === s.core) {
        s.core = null;
        F.chain(e.x, e.y, e.radius * 1.2, 7, 1.6);
        F.wreck(e, 'candlecrawler', 40);
        F.pod(e.x, e.y - 30, [[e.x + 40, e.y - 140], [e.x + 260, -80], [e.x + 520, -220]],
          { speed: 190 });
        F.win();
        return;
      }
      if (e.template.part) {
        s.turrets = s.turrets.filter((t) => t !== e && F.live(t));
        if (!s.turrets.length && s.mode === 'shielded' && F.live(s.core)) {
          const c = s.core;
          s.mode = 'overheat'; s.heat = F.def.tuning.overheat;
          c.untargetable = false; c.dmgTaken = F.def.tuning.overheatVuln;
          c.windup = 0; c.chargeTimer = 0; c.telegraph = null;
          c.displayName = 'The Candlecrawler · Overheating';
          s.label = 'Overheating - cockpit open!';
          F.say('turretsDown');
          WS.FX.flash(c.x, c.y, 150, [1.0, 0.4, 0.2], 0.6);
          WS.Game.toast('Cockpit exposed', 'It takes extra damage while it overheats.', { kind: 'warn', art: 'crosshair', tint: [1.0, 0.72, 0.36] });
        }
      }
    },
  };

  /* ------------------------------------------------------- Dustreach --- */
  /* The Dust Galleon sails the top of the field and fires broadsides down
     it - lanes you step between - from three gun ports you can shoot out.
     Sink it and it crashes into the field; the Admiral climbs out of the
     wreck and it becomes a duel: dashes in threes, pistols, powder kegs. */
  const SAIL_Y = 176;
  SCRIPTS.galleon = {
    start(F) {
      const s = F.s;
      s.mode = 'sailin'; s.dir = 1; s.label = 'The Dust Galleon';
      const g = s.core = F.unit('dust_galleon', -220, SAIL_Y);
      g.untargetable = true;
      s.ports = [
        F.part('galleon_cannon', g, -78, 34),
        F.part('galleon_cannon', g, 0, 42),
        F.part('galleon_cannon', g, 78, 34),
      ].filter(Boolean);
      for (const port of s.ports) port.untargetable = true;
      s.tm = { broadside: 3.5, grape: 5, keg: 6.5, board: 8 };
    },
    update(F, dt) {
      const s = F.s, T = F.def.tuning;
      const p = WS.Game.player;

      if (s.mode === 'sailin' || s.mode === 'sail') {
        const g = s.core;
        if (!F.live(g)) return;
        if (s.mode === 'sailin') {
          g.x += 260 * dt;
          if (g.x >= 640) {
            s.mode = 'sail';
            g.untargetable = false;
            for (const port of s.ports) if (F.live(port)) port.untargetable = false;
          }
        } else {
          g.x += s.dir * T.sailSpeed * dt;
          if (g.x > W() - 250) s.dir = -1;
          if (g.x < 250) s.dir = 1;
        }
        g.y = SAIL_Y + WS.sin(F.t * 1.3) * 6;
        g.facing = s.dir;
        if (s.mode !== 'sail') return;

        const ports = s.ports.filter((q) => F.live(q));
        const hp = g.health / g.maxHealth;
        s.label = ports.length ? `Broadsides · ${ports.length} gun port${ports.length > 1 ? 's' : ''}`
          : 'Guns silenced';

        if (F.every('broadside', dt, 6.5)) {
          ports.forEach((q, i) => {
            const ang = hp > 0.7 ? WS.PI / 2 : WS.atan2(p.y - q.y, p.x - q.x);
            F.lane(q.x, q.y + 8, ang, 800, T.broadsideWidth, T.broadsideTele + i * 0.3,
              T.broadsideDamage, 'Broadside', { active: 0.35, tint: [1.0, 0.7, 0.35], sound: 'cannon' });
          });
        }
        if (ports.length && F.every('grape', dt, 4.2)) {
          const q = ports[WS.randInt(0, ports.length - 1)];
          F.fan(q.x, q.y + 10, F.aim(q), 7, 0.14, 300, T.grapeDamage, 'physical', 'Grapeshot', q);
        }
        if (F.every('keg', dt, 7)) {
          for (let k = 0; k < 3; k++) {
            const [x, y] = k === 0 ? [p.x, p.y] : F.near(120);
            F.circle(x, y, T.kegRadius, T.kegTele + k * 0.2, T.kegDamage, 'Powder keg',
              { from: { x: g.x, y: g.y }, tint: [1.0, 0.5, 0.25] });
          }
        }
        if (F.every('board', dt, 12)) {
          F.sayOnce('boarders');
          F.adds('kerchief', T.boarders - 3, g.x, g.y + 80, 140);
          F.adds('bruiser', 3, g.x, g.y + 80, 140);
        }
        return;
      }

      if (s.mode === 'crash') {
        s.crashT -= dt;
        if (s.crashT <= 0) {
          const a = s.adm = F.unit('admiral_ashore', s.wx, s.wy + 110);
          if (a) {
            WS.Game.announce('The Masked Admiral', 'Ashore, and furious', 3.4,
              { kind: 'dread', art: 'admiral_face', tint: a.template.tint });
            F.eruption(a.x, a.y, 80, [0.9, 0.3, 0.3]);
          }
          F.say('duel');
          s.mode = 'duel'; s.dashes = 0;
          s.label = 'The duel';
          s.tm = { dash: 3, pistol: 2, keg: 6, rally: 10 };
        }
        return;
      }

      if (s.mode === 'duel') {
        const a = s.adm;
        if (!F.live(a)) return;
        const hp = a.health / a.maxHealth;
        if (hp < 0.3) F.sayOnce('low');
        const pace = hp < 0.3 ? 1.35 : 1;
        a.damage = F.dmg(busy(a) ? T.dashDamage : a.template.damage);

        if (!busy(a)) {
          if (s.dashes > 0) {
            s.dashes--;
            charge(a, T.dashChainWindup, T.dashTime, T.dashRange, 1.8);
          } else {
            // Circles you at a duelling distance.
            const [dx, dy, d] = WS.normalize(a.x - p.x, a.y - p.y);
            const ang = WS.atan2(dy, dx) + 0.9 * dt;
            const tx = WS.clamp(p.x + WS.cos(ang) * 210, 60, W() - 60);
            const ty = WS.clamp(p.y + WS.sin(ang) * 210, 60, H() - 60);
            const [mx, my, md] = WS.normalize(tx - a.x, ty - a.y);
            const step = WS.min(md, 170 * dt);
            a.x += mx * step; a.y += my * step;
            a.facing = p.x < a.x ? -1 : 1;
            if (d < 1) a.x += 1;
          }
        }
        if (F.every('dash', dt, 5.5, pace) && !busy(a)) {
          s.dashes = 2;
          charge(a, T.dashWindup, T.dashTime, T.dashRange, 1.8);
        }
        if (!busy(a) && s.dashes === 0 && F.every('pistol', dt, 2.6, pace)) {
          F.fan(a.x, a.y - 10, F.aim(a), 5, 0.12, 340, T.pistolDamage, 'fire', 'Pistol volley', a);
        }
        if (F.every('keg', dt, 8, pace)) {
          F.circle(p.x, p.y, T.kegRadius, T.kegTele, T.kegDamage, 'Powder keg',
            { from: { x: a.x, y: a.y }, tint: [1.0, 0.5, 0.25] });
          for (let k = 0; k < 4; k++) {
            const ang = (k / 4) * WS.TAU + WS.random() * 0.5;
            F.circle(WS.clamp(p.x + WS.cos(ang) * 110, 40, W() - 40),
              WS.clamp(p.y + WS.sin(ang) * 110, 40, H() - 40),
              T.kegRadius * 0.8, T.kegTele + 0.3, T.kegDamage, 'Powder keg',
              { from: { x: a.x, y: a.y }, tint: [1.0, 0.5, 0.25] });
          }
        }
        if (F.every('rally', dt, 14)) {
          F.adds('bruiser', T.rally, a.x, a.y, 160);
        }
      }
    },
    onDead(F, e) {
      const s = F.s;
      if (e === s.core) {
        // Sunk. It comes down into the field and stays there, burning.
        s.core = null;
        for (const q of s.ports) F.remove(q);
        s.ports = [];
        s.wx = WS.clamp(e.x, 240, W() - 240); s.wy = 290;
        const w = { x: s.wx, y: e.y, radius: e.radius, kind: 'galleon', art: e.template.art, tint: e.template.tint,
          size: e.spriteSize, life: 600, maxLife: 600, rot: 0, vy: (290 - e.y) / 1.4, fall: 1.4 };
        F.wrecks.push(w);
        F.eruption(e.x, e.y, 180);
        F.chain(s.wx, 290, 140, 6, 1.8, [1.0, 0.55, 0.25]);
        WS.FX.stop(0.14);
        F.marks.length = 0;
        F.say('crash');
        s.mode = 'crash'; s.crashT = 2.6;
        s.label = 'Shipwreck';
        for (let k = 0; k < 4; k++) {
          WS.Hazard.spawn(s.wx - 150 + k * 100, 302 + WS.randRange(-20, 20), { radius: 46, fuse: 1.4,
            life: 600, damage: F.dmg(14), interval: 0.5, tint: [1.0, 0.5, 0.2], name: 'Burning wreck' });
        }
        return;
      }
      if (e === s.adm) {
        s.adm = null;
        F.wreck(e, 'fallen', 30);
        F.wrecks.push({ x: e.x, y: e.y, radius: e.radius, kind: 'surrender', tint: e.template.tint,
          life: 999, maxLife: 999, rot: 0.0001, vy: 0, fall: 0 });
        F.win();
        return;
      }
      if (e.template.part) {
        F.sayOnce('portDown');
        s.ports = s.ports.filter((q) => q !== e && F.live(q));
      }
    },
  };

  /* ------------------------------------------------------ Mourneholt --- */
  /* Mordecai cannot be touched while any of his four soul lanterns burns,
     and every lantern broken tears a piece out of him. Break them all and
     he is exposed in the dark for a few seconds - then he relights three.
     Hands come up where you stand; the knell rings out with gaps in it. */
  const LANTERNS = [[270, 170], [1010, 170], [270, 560], [1010, 560]];
  const GRAVES = [[640, 250], [420, 230], [860, 230], [640, 450], [400, 430], [880, 430]];
  SCRIPTS.mordecai = {
    start(F) {
      const s = F.s;
      s.cycle = 0; s.hands = 0; s.grave = 0;
      const m = s.core = F.unit('mordecai_bound', 640, 250);
      m.fade = 0;
      /* "I said four lives." He meant it: each exposed window can take him
         down to his next life and no further, and reaching it relights the
         lanterns at once. However hard a build hits, every relight is seen;
         a hard-hitting build just gets through each window faster. */
      s.life = 0;
      m.hpFloor = F.def.tuning.lives[0] * m.maxHealth;
      s.introT = 0;
      this.light(F, 4);
      // The lanterns catch one at a time, and he is there when the last does.
      s.lanterns.forEach((l, i) => { l.fade = 0; l.lightAt = 0.5 + i * 0.55; l.untargetable = true; });
      s.tm = { hand: 3, lance: 4, knell: 7, blink: 8, spawn: 6 };
    },
    light(F, n) {
      const s = F.s, m = s.core;
      const mult = 1 + 0.15 * s.cycle;
      const spots = WS.shuffle(LANTERNS.slice()).slice(0, n);
      s.lanterns = spots.map(([x, y]) => {
        const l = F.unit('soul_lantern', x, y, mult);
        if (l) WS.FX.flash(x, y, 70, [0.55, 1.0, 0.75], 0.5);
        return l;
      }).filter(Boolean);
      m.untargetable = true; m.dmgTaken = 1;
      m.displayName = 'Mordecai, Lantern-Bound · Warded';
      s.mode = 'warded';
      s.label = `Break the soul lanterns · ${s.lanterns.length} lit`;
      F.darkTarget = 0;
    },
    update(F, dt) {
      const s = F.s, T = F.def.tuning, m = s.core;
      if (!F.live(m)) return;
      const p = WS.Game.player;
      if (s.introT !== undefined && s.introT < 3.4) {
        s.introT += dt;
        for (const l of s.lanterns) {
          if (l.fade < 1 && s.introT >= l.lightAt) {
            if (l.fade === 0) {
              WS.FX.flash(l.x, l.y - l.radius, 90, [0.55, 1.0, 0.75], 0.6);
              WS.Audio.play('cast', l.x, 'shadow');
            }
            l.fade = WS.min(1, l.fade + dt * 4);
          }
        }
        m.fade = WS.clamp((s.introT - 2.6) / 0.7, 0, 1);
        if (s.introT >= 2.6 && !s.risenIn) {
          s.risenIn = true;
          F.eruption(m.x, m.y, 130, [0.55, 1.0, 0.75]);
        }
        if (s.introT >= 3.4) {
          m.fade = 1;
          for (const l of s.lanterns) { l.fade = 1; l.untargetable = false; }
        }
        return;
      }
      const hp = m.health / m.maxHealth;
      if (!s.risen && hp <= T.riseAt) {
        s.risen = true;
        F.say('rise');
        F.addsRing('skeleton', 12, 640);
        F.addsRing('ghoul', 10, 700);
      }
      const pace = s.risen ? 1.35 : 1;
      m.facing = p.x < m.x ? -1 : 1;

      if (s.mode === 'exposed') {
        s.exposed -= dt;
        s.label = `Exposed · ${WS.max(0, WS.ceil(s.exposed))}`;
        const lifeLost = m.hpFloor > 0 && m.health <= m.hpFloor + 0.5;
        if (lifeLost) {
          this.nextLife(F);
          WS.FX.flash(m.x, m.y, 150, [0.55, 1.0, 0.75], 0.7);
          WS.FX.shake(6, 0.4);
          WS.Audio.play('boss');
        }
        if (s.exposed <= 0 || lifeLost) {
          s.cycle++;
          this.light(F, T.relight);
          F.say('relight');
        }
      } else {
        s.lanterns = s.lanterns.filter((l) => F.live(l));
        s.label = `Break the soul lanterns · ${s.lanterns.length} lit`;
        if (F.every('spawn', dt, 9)) {
          for (const l of s.lanterns) F.adds(WS.random() < 0.5 ? 'skeleton' : 'ghoul', 2, l.x, l.y, 60);
        }
      }

      if (F.every('blink', dt, 8)) {
        let i;
        do { i = WS.randInt(0, GRAVES.length - 1); } while (i === s.grave);
        s.grave = i;
        WS.FX.flash(m.x, m.y, 60, [0.55, 1.0, 0.75], 0.4);
        m.x = GRAVES[i][0]; m.y = GRAVES[i][1];
        WS.FX.flash(m.x, m.y, 80, [0.55, 1.0, 0.75], 0.5);
        WS.Audio.play('cast', m.x, 'shadow');
      }

      if (F.every('hand', dt, 5, pace)) s.hands = 3;
      if (s.hands > 0 && F.every('handStep', dt, 0.45)) {
        s.hands--;
        F.circle(p.x, p.y, T.handRadius, T.handTele, T.handDamage, 'Grasping dead',
          { style: 'hands', tint: [0.55, 1.0, 0.7] });
      }
      if (F.every('lance', dt, 4, pace)) {
        F.fan(m.x, m.y - 20, F.aim(m), 5, 0.16, 260, T.lanceDamage, 'shadow', 'Bone lance', m);
      }
      if (F.every('knell', dt, s.mode === 'exposed' || s.risen ? 7.5 : 11)) {
        F.ring(m.x, m.y, { speed: T.knellSpeed, gaps: 3, gapWidth: T.knellGap, dmg: T.knellDamage,
          name: 'Death knell', tint: [0.6, 1.0, 0.8] });
        WS.Audio.play('boss');
      }
    },
    nextLife(F) {
      const s = F.s, m = s.core, lives = F.def.tuning.lives;
      s.life++;
      m.hpFloor = s.life < lives.length ? lives[s.life] * m.maxHealth : 0;
    },
    onDead(F, e) {
      const s = F.s, T = F.def.tuning, m = s.core;
      if (e === m) {
        s.core = null;
        F.darkTarget = 0;
        F.wreck(e, 'fallen', 20);
        s.orb = { x: e.x, y: e.y - 20 };
        F.pod(1420, 90, [[e.x + 30, e.y - 70], [e.x, e.y - 30, 'grab'], [e.x - 200, e.y - 180],
          [-250, 80]], { speed: 330 });
        F.win();
        return;
      }
      if (e.template.part && F.live(m)) {
        s.lanterns = s.lanterns.filter((l) => l !== e && F.live(l));
        // The bond snaps, and takes a piece of him with it.
        WS.Enemy.damage(m, m.maxHealth * T.lanternBond, false, 'soulbond');
        WS.FX.flash(m.x, m.y, 90, [0.55, 1.0, 0.75], 0.5);
        if (!F.live(m)) return;
        if (!s.lanterns.length) {
          // The bonds alone took him to his line: that life is spent, and
          // this window is against the next one.
          if (m.hpFloor > 0 && m.health <= m.hpFloor + 0.5) this.nextLife(F);
          s.mode = 'exposed'; s.exposed = T.exposedTime;
          m.untargetable = false; m.dmgTaken = T.exposedVuln;
          m.displayName = 'Mordecai, Lantern-Bound · Exposed';
          F.darkTarget = 0.7;
          F.sayOnce('exposed');
          WS.Game.toast('Mordecai is exposed', 'Every lantern is out. Hit him before he relights them.', { kind: 'warn', art: 'crosshair', tint: [1.0, 0.72, 0.36] });
        }
      }
    },
  };

  /* ---------------------------------------------------- Ochre Plains --- */
  /* The Stormbreaker walks the top of the field on legs you can break,
     stamping where it steps and sweeping a lightning cannon under itself.
     Its hull shrugs most damage off while it stands. Break both front legs
     and it kneels, staggered - then digs in as a fortress behind a cage of
     tesla fences. At 15% it does not die. It blows itself up, and you had
     better be behind a rock. */
  // Where the Stormbreaker kneels to raise its fortress: the open middle.
  const FORT_Y = 330, FORT_X0 = 470, FORT_X1 = 810;
  SCRIPTS.stormbreaker = {
    start(F) {
      const s = F.s;
      s.mode = 'enter'; s.dir = 1; s.step = 0; s.kneel = 0;
      s.label = 'The Stormbreaker';
      const w = s.core = F.unit('stormbreaker', 640, -160);
      w.untargetable = true;
      s.legs = [F.part('walker_leg', w, -84, 96), F.part('walker_leg', w, 84, 96)].filter(Boolean);
      for (const l of s.legs) l.untargetable = true;
      s.tm = { step: 1.3, sweep: 6, missile: 5, karrash: 9 };
    },
    update(F, dt) {
      const s = F.s, T = F.def.tuning, w = s.core;
      if (!F.live(w)) return;
      const p = WS.Game.player;
      const hp = w.health / w.maxHealth;
      w.walkPhase = (w.walkPhase || 0) + dt * (s.mode === 'walk' ? 2.4 : 0);

      if (s.mode === 'enter') {
        w.y += 120 * dt;
        if (w.y >= 235) {
          w.y = 235; s.mode = 'walk';
          w.untargetable = false;
          for (const l of s.legs) if (F.live(l)) l.untargetable = false;
          F.eruption(w.x, w.y + 90, 120, [0.8, 0.7, 0.5]);
        }
        return;
      }

      if (s.mode !== 'destruct' && hp <= T.destructAt) {
        this.destruct(F);
        return;
      }

      if (s.mode === 'walk') {
        w.dmgTaken = T.standingArmor;
        w.displayName = 'The Stormbreaker · Armoured';
        s.label = 'Break its legs';
        w.x += s.dir * 38 * dt;
        if (w.x > 950) s.dir = -1;
        if (w.x < 330) s.dir = 1;
        w.facing = s.dir;
        if (F.every('step', dt, 1.3)) {
          s.step = 1 - s.step;
          const fx = w.x + (s.step ? -84 : 84) + s.dir * 60;
          F.circle(fx, w.y + 130, T.stompRadius, T.stompTele, T.stompDamage, 'Stomp',
            { style: 'stomp', tint: [0.9, 0.75, 0.5] });
        }
        if (F.every('sweep', dt, 10)) this.beam(F, 1);
        if (F.every('missile', dt, 5.5)) this.missiles(F, 5);
        // Standing clear of its feet is not standing clear of it.
        if (F.every('shock', dt, T.shockEvery)) this.shockwave(F);
        if (F.every('karrash', dt, 13)) F.addsRing('karrash', T.karrash, 700);
        return;
      }

      if (s.mode === 'kneel') {
        s.kneelT -= dt;
        s.kneel = WS.min(1, s.kneel + dt * 1.5);
        /* It staggers forward as it goes down, into the open middle of the
           field - the fortress it raises there has to have ground on every
           side of it, or the side it lacks is where everybody stands. */
        const k = WS.min(1, dt * 2.2);
        w.y += (FORT_Y - w.y) * k;
        w.x += (WS.clamp(w.x, FORT_X0, FORT_X1) - w.x) * k;
        s.label = `Staggered · ${WS.max(0, WS.ceil(s.kneelT))}`;
        if (s.kneelT <= 0) this.fortress(F);
        return;
      }

      if (s.mode === 'fortress') {
        s.pylons = s.pylons.filter((q) => F.live(q));
        /* The pylons are the fortress: while any stands, the hull is behind
           their shield. They used to be scenery with fences strung between,
           and the hull took full damage through them. */
        const shielded = s.pylons.length > 0;
        w.dmgTaken = shielded ? T.pylonShield : 1;
        w.displayName = shielded ? 'The Stormbreaker · Shielded' : 'The Stormbreaker · Fortress';
        s.label = shielded ? `Break the pylons · ${s.pylons.length}` : 'Fortress · shield down';
        if (!shielded && !s.reraised && hp <= T.reraiseAt + 1e-6) {
          s.reraised = true;
          // Past the re-raise, nothing stops it short of its last breath.
          w.hpFloor = T.destructAt * w.maxHealth;
          this.pylons(F);
          this.shockwave(F);
        }
        if (F.every('sweep', dt, T.fortEvery)) this.lighthouse(F);
        if (F.every('missile', dt, 5)) this.missiles(F, 5);
        if (F.every('bolts', dt, 6.5)) {
          F.radial(w.x, w.y + 30, 16, 200, T.missileDamage * 0.7, 'nature', 'Arc bolt',
            WS.random() * WS.TAU, w);
        }
        if (F.every('karrash', dt, 15)) F.addsRing('karrash', T.karrash, 700);
        return;
      }

      if (s.mode === 'destruct') {
        s.destructT -= dt;
        s.label = `SELF-DESTRUCT · ${WS.max(0, WS.ceil(s.destructT))}`;
        w.shake = 1 - s.destructT / T.destructTime;
        if (WS.random() < dt * 8) {
          WS.FX.burst(w.x + WS.randRange(-70, 70), w.y + WS.randRange(-40, 40), 3, '#ffd07a', 160, 0.5, 3);
        }
        if (s.destructT <= 0 && !s.blown) {
          s.blown = true;
          WS.FX.screen('rgba(255,240,210,.8)', 1.4);
          WS.FX.shake(14, 1.0);
          F.chain(w.x, w.y, 170, 10, 2.2);
          F.wreck(w, 'stormbreaker', 60);
          F.pod(w.x, w.y - 60, [[w.x - 60, w.y - 200], [w.x - 400, -180]], { speed: 260 });
          F.remove(w);
          s.core = null;
          WS.Save.stats.bosses.stormbreaker = (WS.Save.stats.bosses.stormbreaker || 0) + 1;
          WS.Game.run.bossesSlain++;
          F.win();
        }
      }
    },
    beam(F, n) {
      const s = F.s, T = F.def.tuning, w = s.core;
      const p = WS.Game.player;
      const side = p.x < w.x ? -1 : 1;
      for (let k = 0; k < n; k++) {
        const sd = k === 0 ? side : -side;
        F.sweep(w.x, w.y + 40, WS.PI / 2 + sd * 1.25, -sd * T.beamSpin, 900, T.beamWidth,
          T.beamTele, T.beamTime, T.beamDamage, 'Lightning cannon',
          { follow: w, oy: 40, tint: [0.55, 0.85, 1.0] });
      }
      WS.Audio.play('zap', w.x);   // the cannon charging
      WS.Audio.play('warn', w.x);
    },
    shockwave(F) {
      const T = F.def.tuning, w = F.s.core;
      F.ring(w.x, w.y + 90, { speed: 230, gaps: 3, gapWidth: 42, dmg: T.stompDamage,
        name: 'Shockwave', tint: [0.9, 0.75, 0.5] });
      WS.FX.shake(5, 0.3);
      WS.Audio.play('shock', w.x);
    },
    missiles(F, n) {
      const T = F.def.tuning, w = F.s.core;
      const p = WS.Game.player;
      for (let k = 0; k < n; k++) {
        const [x, y] = k === 0 ? [p.x, p.y] : F.near(170);
        F.circle(x, y, T.missileRadius, T.missileTele + k * 0.12, T.missileDamage, 'Ember missile',
          { from: { x: w.x, y: w.y - 30 }, tint: [1.0, 0.6, 0.3] });
      }
    },
    /* THE CAGE.
     *
     * The pylons used to stand at the corners of a box below the machine
     * with fences down three sides of it - a U, open at the top, with the
     * Stormbreaker kneeling at the top of the field and both its cannons
     * sweeping the lower half-circle only. So the whole fortress had a
     * safe side, and it was the side nearest the thing you were fighting:
     * walk up past it and nothing in the phase could reach you.
     *
     * Now the four pylons stand round the machine on all four sides, north,
     * east, south and west, with a fence between each and the next, and the
     * machine is shut inside a diamond of lightning in the middle of the
     * field. Its cannons are the lighthouse below. A pylon falling drops the
     * two fences it holds, which is the way in. */
    pylons(F) {
      const s = F.s, T = F.def.tuning, w = s.core;
      const cx = w ? w.x : 640, cy = w ? w.y : FORT_Y;
      const at = [[cx, cy - 190], [cx + 310, cy + 12], [cx, cy + 215], [cx - 310, cy + 12]]
        .map(([x, y]) => [WS.clamp(x, 110, 1170), WS.clamp(y, 118, 660)]);
      s.pylons = at.map(([x, y]) => F.unit('tesla_pylon', x, y)).filter(Boolean);
      const n = s.pylons.length;
      for (let i = 0; i < n && n > 1; i++) {
        F.fence(s.pylons[i], s.pylons[(i + 1) % n], T.fenceDamage, 'Tesla fence');
      }
      F.say('pylons');
    },
    /* The lighthouse: two cannons back to back, turning together through
       more than a half-turn, so between them they pass over every bearing
       from the machine - nowhere round the cage is out of reach. Each volley
       opens beside you rather than on you, and turns whichever way it
       likes, so there is no one direction to learn and outrun. The dance is
       to move with it, in the wake of one beam and ahead of the other. */
    lighthouse(F) {
      const s = F.s, T = F.def.tuning, w = s.core;
      const p = WS.Game.player;
      const dir = WS.random() < 0.5 ? -1 : 1;
      const toward = WS.atan2(p.y - (w.y + 20), p.x - w.x);
      // start a little behind the player in the direction it will turn
      const start = toward - dir * 0.85;
      F.sweep(w.x, w.y + 20, start, dir * T.fortSpin, 1400, T.beamWidth,
        T.beamTele, T.fortBeamTime, T.beamDamage, 'Lightning cannon',
        { follow: w, oy: 20, arms: 2, tint: [0.55, 0.85, 1.0] });
      WS.Audio.play('zap', w.x);
      WS.Audio.play('warn', w.x);
    },
    fortress(F) {
      const s = F.s, w = s.core, T = F.def.tuning;
      s.mode = 'fortress';
      w.dmgTaken = T.pylonShield;
      w.displayName = 'The Stormbreaker · Shielded';
      // It re-raises its pylons at reraiseAt; it cannot be burned past it first.
      w.hpFloor = T.reraiseAt * w.maxHealth;
      this.pylons(F);
      s.tm.sweep = 3; s.tm.missile = 2; s.tm.bolts = 4;
    },
    destruct(F) {
      const s = F.s, T = F.def.tuning, w = s.core;
      s.mode = 'destruct';
      s.destructT = T.destructTime;
      w.untargetable = true;
      w.hpFloor = 0;
      w.windup = 0; w.chargeTimer = 0; w.telegraph = null;
      for (const l of s.legs || []) F.remove(l);
      for (const q of s.pylons || []) F.remove(q);
      s.legs = []; s.pylons = [];
      F.marks.length = 0;
      F.clearAdds();
      w.displayName = 'The Stormbreaker · Self-destruct';
      F.say('destruct');
      WS.Game.announce('SELF-DESTRUCT', 'Get behind a rock!', 3.0, { kind: 'dread',
        art: 'stormbreaker', tint: w.template.tint });
      WS.Audio.play('warn');
      const zones = [];
      const xs = WS.shuffle([240, 520, 780, 1040]).slice(0, 3);
      for (const x of xs) {
        zones.push({ x: x + WS.randRange(-40, 40), y: 520 + WS.randRange(-50, 60), r: 62 });
      }
      s.zones = zones;
      F.safe(zones, T.destructTime, T.destructDamage, 'The Stormbreaker’s last breath');
    },
    onDead(F, e) {
      const s = F.s, T = F.def.tuning;
      if (e === s.core) {
        // Killed outright in one blow past the threshold: it still goes up.
        s.core = null;
        F.wreck(e, 'stormbreaker', 60);
        F.pod(e.x, e.y - 60, [[e.x - 60, e.y - 200], [e.x - 400, -180]], { speed: 260 });
        F.win();
        return;
      }
      if (s.mode === 'walk' && s.legs && s.legs.includes(e)) {
        s.legs = s.legs.filter((l) => l !== e && F.live(l));
        F.sayOnce('legDown');
        if (!s.legs.length && F.live(s.core)) {
          s.mode = 'kneel'; s.kneelT = T.kneelStagger;
          const w = s.core;
          w.dmgTaken = T.kneelVuln;
          w.displayName = 'The Stormbreaker · Staggered';
          F.say('kneel');
          F.marks.length = 0;
          WS.FX.shake(12, 0.8);
          F.eruption(w.x, w.y + 80, 160, [0.8, 0.7, 0.5]);
          // It comes down hard, and it calls for help on the way.
          this.shockwave(F);
          F.addsRing('karrash', T.karrash, 700);
          WS.Game.toast('It is down', 'Staggered - it takes extra damage until it recovers.', { kind: 'warn', art: 'crosshair', tint: [1.0, 0.72, 0.36] });
        }
      }
    },
  };

  /* ----------------------------------------------------- Pale Wastes --- */
  /* The Heart-Drill bores into the Pale behind three ember coolant lines;
     each line cut tears a sixth out of it. When it breaks through,
     Marrowfrost wakes, freezes Grimtunnel where he floats and closes the
     field in a whiteout. Pale Shards orbit him and turn most damage away
     until they break. At 40% he becomes the Heart of Winter: the dark comes
     down, the cross of frost never stops turning, and there is a clock. */
  const DRILL_Y = 225;
  SCRIPTS.paleheart = {
    start(F) {
      const s = F.s;
      s.mode = 'drill';
      s.label = 'Cut the coolant lines';
      const d = s.core = F.unit('heart_drill', 640, -300);
      d.untargetable = true;
      s.dropping = true; s.vy = 0;
      s.pipes = [];
      s.tm = { debris: 3, vent: 7, ghoul: 6 };
      s.ventDir = 1;
    },
    update(F, dt) {
      const s = F.s, T = F.def.tuning;
      const p = WS.Game.player;

      if (s.mode === 'drill') {
        const d = s.core;
        if (!F.live(d)) return;
        if (s.dropping) {
          // It comes down out of the sky, and the Pale takes the hit.
          s.vy += 1100 * dt;
          d.y += s.vy * dt;
          if (d.y >= DRILL_Y) {
            d.y = DRILL_Y; s.dropping = false; d.untargetable = false;
            F.eruption(640, DRILL_Y + 60, 220, [0.8, 0.9, 1.0]);
            WS.FX.shake(14, 0.9);
            WS.FX.screen('rgba(220,240,255,.4)', 0.6);
            s.pipes = [[410, 290], [870, 290], [640, 400]]
              .map(([x, y]) => F.unit('coolant_pipe', x, y)).filter(Boolean);
            for (const q of s.pipes) F.eruption(q.x, q.y, 70, [1.0, 0.6, 0.25]);
          }
          return;
        }
        d.drillSpin = (d.drillSpin || 0) + dt * 9;
        s.pipes = s.pipes.filter((q) => F.live(q));
        /* The coolant is what keeps it turning: while a line stands the
           drill shrugs most damage off and cannot be broken past
           drillFloor. Cutting the lines is the fight, not a shortcut. */
        d.dmgTaken = s.pipes.length ? T.pipeShield : 1;
        d.hpFloor = s.pipes.length ? T.drillFloor * d.maxHealth : 0;
        s.label = s.pipes.length ? `Cut the coolant lines · ${s.pipes.length} left` : 'Break the drill';
        if (F.every('debris', dt, 4)) {
          for (let k = 0; k < 4; k++) {
            const [x, y] = k === 0 ? [p.x, p.y] : F.near(190);
            F.circle(x, y, T.debrisRadius, T.debrisTele + k * 0.15, T.debrisDamage, 'Falling ice',
              { style: 'ice', tint: [0.7, 0.9, 1.0] });
          }
        }
        if (F.every('vent', dt, 11)) {
          s.ventDir = -s.ventDir;
          F.sweep(d.x, d.y + 20, WS.random() * WS.TAU, s.ventDir * T.ventSpin, 900, 40, T.ventTele,
            6, T.ventDamage, 'Flame vent', { arms: 4, follow: d, oy: 20, tint: [1.0, 0.55, 0.25] });
        }
        if (F.every('ghoul', dt, 12)) F.adds('pale_ghoul', T.ghouls, d.x, d.y + 120, 170);
        return;
      }

      if (s.mode === 'breach') {
        s.breachT += dt;
        if (s.breachT > 0.05 && !s.b1) {
          s.b1 = true; F.say('breach');
          F.pod(640, 225, [[640, 170], [320, 200, 'freeze']], { speed: 180 });
        }
        if (s.breachT > 3.2 && !s.b2) { s.b2 = true; F.say('wake'); F.darkTarget = 0.35; }
        if (s.breachT > 5.4 && !s.b3) { s.b3 = true; F.say('frozen'); }
        if (WS.random() < dt * 5) {
          WS.FX.burst(640 + WS.randRange(-120, 120), 200, 2, '#bfe6ff', 120, 0.9, 3);
        }
        if (s.breachT > 7.4) this.lord(F);
        return;
      }

      const L = s.lord;
      if (!F.live(L)) return;
      const hp = L.health / L.maxHealth;
      L.facing = p.x < L.x ? -1 : 1;

      if (s.mode === 'lord') {
        s.orbit += dt * 0.9;
        L.x = 640 + WS.cos(F.t * 0.33) * 170;
        L.y = 240 + WS.sin(F.t * 0.5) * 40;
        s.shards = s.shards.filter((q) => F.live(q));
        s.shards.forEach((q, i) => {
          const a = s.orbit + (i / 4) * WS.TAU;
          q.x = L.x + WS.cos(a) * 120; q.y = L.y + WS.sin(a) * 90;
        });
        L.dmgTaken = s.shards.length ? T.shardReduce : 1;
        L.displayName = s.shards.length ? 'Marrowfrost · Warded by the Pale'
          : 'Marrowfrost, the Pale Lord';
        s.label = s.shards.length ? `Shatter the Pale Shards · ${s.shards.length}` : 'He is open';
        if (!s.shards.length) {
          s.shardT -= dt;
          if (s.shardT <= 0) { this.shards(F); F.sayOnce('shards'); }
        }
        if (hp <= T.winterAt) { this.winter(F); return; }
        // A ward line: the Pale closes round him again.
        if (L.hpFloor > 0 && L.health <= L.hpFloor + 0.5 && s.lines[s.line] > T.winterAt) {
          this.ward(F);
          return;
        }
        if (F.every('nova', dt, 9)) this.nova(F);
        if (F.every('cross', dt, 15)) {
          s.ventDir = -s.ventDir;
          F.sweep(L.x, L.y, WS.random() * WS.TAU, s.ventDir * 0.45, 900, 34, 1.2, 6,
            T.ventDamage, 'Frost cross', { arms: 2, follow: L, tint: [0.7, 0.92, 1.0] });
        }
        if (F.every('grid', dt, 14)) {
          F.grid(F.bounds, 5, 4, 4, T.gridTele, T.gridDamage, 'Glacial spikes');
          WS.Game.toast('Glacial spikes', 'Find the ground that is not marked.', { kind: 'warn', art: 'frostaura', tint: [0.6, 0.85, 1.0] });
        }
        if (F.every('spike', dt, 5)) {
          F.radial(L.x, L.y, 14, 190, T.spikeDamage, 'frost', 'Ice lance', F.t, L);
        }
        if (F.every('tide', dt, 16)) {
          F.addsRing('skeleton', 6, 560);
          F.addsRing('pale_ghoul', T.ghouls - 4, 620);
        }
        return;
      }

      if (s.mode === 'winter') {
        s.enrage -= dt;
        L.x += (640 - L.x) * WS.min(1, dt * 0.8);
        L.y += (250 - L.y) * WS.min(1, dt * 0.8);
        // The last of the Pale: shards may ward him one final time.
        s.orbit += dt * 1.2;
        s.shards = s.shards.filter((q) => F.live(q));
        s.shards.forEach((q, i) => {
          const a = s.orbit + (i / 4) * WS.TAU;
          q.x = L.x + WS.cos(a) * 130; q.y = L.y + WS.sin(a) * 100;
        });
        L.dmgTaken = s.shards.length ? T.shardReduce : 1;
        s.label = s.shards.length ? `The last of the Pale · ${s.shards.length}`
          : `Heart of Winter · ${WS.max(0, WS.ceil(s.enrage))}`;
        if (L.hpFloor > 0 && L.health <= L.hpFloor + 0.5) {
          this.nextLine(F);
          this.shards(F);
          this.nova(F);
          F.grid(F.bounds, 5, 4, 4, T.gridTele, T.gridDamage, 'Glacial spikes');
          WS.Game.announce('The last of the Pale', 'Shatter it. There is nothing after this.', 2.8,
            { kind: 'dread', art: 'marrowfrost_face', tint: L.template.tint });
          WS.FX.screen('rgba(170,220,255,.3)', 0.8);
        }
        if (F.every('cross', dt, 8)) {
          s.ventDir = -s.ventDir;
          F.sweep(L.x, L.y, WS.random() * WS.TAU, s.ventDir * 0.5, 900, 36, 1.0, 8.2,
            T.ventDamage, 'Frost cross', { arms: 4, follow: L, tint: [0.7, 0.92, 1.0] });
        }
        if (F.every('nova', dt, 7)) this.nova(F);
        if (F.every('grid', dt, 12)) F.grid(F.bounds, 5, 4, 4, T.gridTele, T.gridDamage, 'Glacial spikes');
        if (F.every('spike', dt, 4)) {
          F.radial(L.x, L.y, 16, 200, T.spikeDamage, 'frost', 'Ice lance', F.t, L);
        }
        if (s.enrage <= 0 && F.every('winterEnd', dt, 3)) {
          WS.Player.takeDamage(p, 99999, 'The endless winter');
        }
      }
    },
    nova(F) {
      const T = F.def.tuning, L = F.s.lord;
      F.ring(L.x, L.y, { speed: T.novaSpeed, gaps: 3, gapWidth: T.novaGap, spin: 0.35,
        dmg: T.novaDamage, name: 'Frost nova', tint: [0.7, 0.92, 1.0] });
      F.ring(L.x, L.y, { speed: T.novaSpeed, gaps: 3, gapWidth: T.novaGap, spin: -0.35, delay: 1.3,
        dmg: T.novaDamage, name: 'Frost nova', tint: [0.7, 0.92, 1.0] });
    },
    nextLine(F) {
      const s = F.s, L = s.lord;
      s.line++;
      L.hpFloor = s.line < s.lines.length ? s.lines[s.line] * L.maxHealth : 0;
    },
    /** A ward line in the lord phase: shards back, a nova, the next line. */
    ward(F) {
      const s = F.s, L = s.lord;
      this.nextLine(F);
      for (const q of s.shards) F.remove(q);
      this.shards(F);
      this.nova(F);
      F.say('shards');
      WS.FX.flash(L.x, L.y, 200, [0.7, 0.92, 1.0], 0.7);
      WS.FX.shake(7, 0.5);
    },
    shards(F) {
      const s = F.s, L = s.lord;
      s.shards = [];
      for (let i = 0; i < 4; i++) {
        const q = F.unit('frost_shard', L.x, L.y);
        if (q) s.shards.push(q);
      }
      s.shardT = F.def.tuning.shardEvery;
      WS.FX.flash(L.x, L.y, 160, [0.7, 0.92, 1.0], 0.5);
    },
    lord(F) {
      const s = F.s;
      s.mode = 'lord';
      s.orbit = 0;
      F.bounds = { minX: 200, maxX: 1080, minY: 96, maxY: 650 };
      WS.Game.arenaBounds = F.bounds;
      const L = s.lord = F.unit('pale_lord', 640, 240);
      F.darkTarget = 0.15;
      /* His lines: the wards at wardLines, then the winter (which cannot be
         skipped past), then the last of the Pale inside it. */
      const T = F.def.tuning;
      s.lines = T.wardLines.concat([T.winterAt], T.lastWardAt ? [T.lastWardAt] : []);
      s.line = 0;
      if (L) L.hpFloor = s.lines[0] * L.maxHealth;
      if (L) {
        F.eruption(L.x, L.y, 200, [0.7, 0.92, 1.0]);
        WS.Game.announce('Marrowfrost, the Pale Lord', 'The dark itself, awake', 4.0,
          { kind: 'dread', art: 'marrowfrost_face', tint: L.template.tint });
        this.shards(F);
      }
      F.say('lord');
      s.tm = { nova: 4, grid: 9, spike: 3, tide: 8 };
    },
    winter(F) {
      const s = F.s, T = F.def.tuning, L = s.lord;
      s.mode = 'winter';
      for (const q of s.shards) F.remove(q);
      s.shards = [];
      // Past the winter line: the next is the last of the Pale.
      while (s.line < s.lines.length && s.lines[s.line] >= T.winterAt) s.line++;
      L.hpFloor = s.line < s.lines.length ? s.lines[s.line] * L.maxHealth : 0;
      L.dmgTaken = 1;
      L.spriteSize *= 1.3;
      L.displayName = 'The Heart of Winter';
      s.enrage = T.winterEnrage;
      F.darkTarget = 0.72;
      F.clearAdds();
      F.say('winter');
      WS.Game.announce('The Heart of Winter', 'Break him before the cold does.', 3.4,
        { kind: 'dread', art: 'marrowfrost_face', tint: L.template.tint });
      WS.FX.screen('rgba(170,220,255,.35)', 1.0);
      s.tm = { cross: 1.5, nova: 5, grid: 8, spike: 2.5 };
    },
    onDead(F, e) {
      const s = F.s, T = F.def.tuning;
      if (e === s.core && s.mode === 'drill') {
        s.core = null;
        for (const q of s.pipes) F.remove(q);
        s.pipes = [];
        F.wreck(e, 'heartdrill', 600);
        F.marks.length = 0;
        F.clearAdds();
        s.mode = 'breach'; s.breachT = 0;
        s.label = 'The breach';
        WS.FX.shake(12, 1.2);
        return;
      }
      if (e === s.lord) {
        s.lord = null;
        F.darkTarget = 0;
        F.wreck(e, 'fallen', 30);
        F.chain(e.x, e.y, 110, 9, 2.0, [0.75, 0.93, 1.0]);
        WS.FX.burst(e.x, e.y, 40, '#dff3ff', 380, 1.2, 5);
        WS.FX.screen('rgba(235,248,255,.7)', 1.6);
        F.win();
        return;
      }
      if (s.mode === 'drill' && s.pipes.includes(e) && F.live(s.core)) {
        s.pipes = s.pipes.filter((q) => q !== e && F.live(q));
        F.sayOnce('pipe');
        // The drill may die of this, and its own death handler clears s.core.
        const d = s.core;
        WS.FX.flash(d.x, d.y, 140, [1.0, 0.6, 0.25], 0.5);
        WS.Enemy.damage(d, d.maxHealth * T.pipeBreak, false, 'coolant');
      }
    },
    onWin(F) {
      for (const pod of F.pods) {
        if (pod.frozen) {
          pod.frozen = false;
          pod.thawed = true;
          pod.path = [[pod.x + 60, pod.y + 120]];
          pod.speed = 40;
        }
      }
    },
  };

  WS.Finale = F;

})(window.WS);
