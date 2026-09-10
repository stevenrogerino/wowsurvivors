/* The victory cinematic: the other end of the prologue.
 *
 * The prologue's last line is "Hold until the light comes back." Thirty
 * minutes later the light comes back, and for the whole life of this game
 * that was a results panel sliding up over a battlefield. This is the
 * sentence being finished, and it stars whoever the player actually ran -
 * their survivor, their colour, their name and title, on the ground they
 * held.
 *
 * It is the same landscape as the prologue (src/render/scenery.js) at a
 * different hour, and it is directed the same way, because those rules were
 * arrived at by measuring:
 *
 *   one light      A single curve across the whole piece rather than a
 *                  per-scene one, so the sun crossing the ridge is one move
 *                  and not five.
 *   one camera     A function of absolute time. A camera that restarts at
 *                  each scene puts a hard cut at every boundary - measured on
 *                  the prologue at four times a typical frame-to-frame step,
 *                  at a boundary where nothing else in the picture changed.
 *   run progress   Consecutive scenes that share a beat are one continuous
 *                  shot; k does not reset between them.
 *   dissolves      Only where the beat actually changes.
 *
 * Where it differs from the prologue is the shape of the light. The prologue
 * creeps for sixteen seconds because the dawn has to feel far away. Here the
 * creeping already happened - it took the player half an hour - so the sun
 * BREAKS: a hard climb in the second beat and a long settle after it.
 */
'use strict';
(function (WS) {

  const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
  const GROUND = H * 0.605;
  const TEXT_TOP = H * 0.735;
  const FADE = 0.9;

  const V = { active: false, done: null, layer: null, t: 0, last: null, scene: 0,
    hero: null, run: null };

  /* --------------------------------------------------------------- horde -- */
  /* The last of them, and then the last of them going. Built per run rather
     than once, because the creatures worth showing are the ones the player has
     actually been fighting. */
  let crowd = null;
  function buildCrowd(mapId) {
    const held = WS.getSeed();
    WS.setSeed(20260912);
    const map = WS.Maps[mapId];
    const ids = [];
    for (const phase of (map && map.phases) || []) {
      for (const r of phase.roster || []) if (ids.indexOf(r.id) < 0) ids.push(r.id);
    }
    if (!ids.length) ids.push('mongrel');
    crowd = [];
    for (let i = 0; i < 30; i++) {
      crowd.push({ id: ids[i % ids.length],
        a: WS.random() * WS.TAU,
        d: 250 + WS.random() * 190,
        s: 30 + WS.random() * 22,
        lag: WS.random(),
        // when this one catches the light, across the burn
        t0: WS.random() * 0.55,
      });
    }
    crowd.sort((a, b) => WS.sin(a.a) - WS.sin(b.a));
    WS.setSeed(held);
  }

  /** Where a creature stands at time t: a slow orbit outside the survivor's
   *  ring, flattened, so the ones behind sit higher up the screen. */
  function place(c, t, push) {
    const a = c.a + t * 0.12;
    const d = c.d * (1 + push);
    /* Flattened HARD, and biased below the horizon. At a third of the radius
       the ones at the back of the ring stood a hundred and thirty pixels above
       the skyline - a row of small dark shapes floating in the air rather than
       a crowd standing on the ground. */
    return { x: W * 0.5 + WS.cos(a) * d,
      y: GROUND + 14 + WS.sin(a) * d * 0.13 };
  }

  /** How big one of them looks from here: the ones at the back are further
   *  away, and until now they were not smaller for it. */
  function depth(c, t) {
    const a = c.a + t * 0.12;
    return 0.82 + 0.30 * (0.5 + 0.5 * WS.sin(a));
  }

  /* ---------------------------------------------------------------- light -- */
  /* 0 is the last of the night, 1 is full morning. The break is the whole
     point of the shape: flat, then a hard climb, then a long settle. */
  const BREAK_AT = 4.0, BREAK_FOR = 4.5;
  V.light = function (t) {
    const total = this.length();
    if (t < BREAK_AT) return 0.06 + 0.06 * (t / WS.max(0.01, BREAK_AT));
    if (t < BREAK_AT + BREAK_FOR) {
      const x = (t - BREAK_AT) / BREAK_FOR;
      // ease-out: most of the climb happens in the first half of the break
      return 0.12 + 0.66 * (1 - (1 - x) * (1 - x));
    }
    const x = WS.clamp((t - BREAK_AT - BREAK_FOR)
      / WS.max(0.01, total - BREAK_AT - BREAK_FOR), 0, 1);
    return 0.78 + 0.22 * x;
  };

  /** How far into full morning, 0 to 1. It starts where the survivor is named
   *  and finishes with the piece, so the last third is the world going light
   *  around somebody who has already stopped fighting. */
  V.morning = function (t) {
    let acc = 0;
    for (const s of this.scenes()) {
      if (s.beat === 'named') break;
      acc += s.hold || 0;
    }
    const total = this.length();
    return WS.Scene.ease(WS.clamp((t - acc) / WS.max(0.01, total - acc), 0, 1));
  };

  /** How far through the burn, 0 before it starts and 1 once they are gone. */
  V.burnAt = function (t) {
    let acc = 0;
    for (const s of this.scenes()) {
      if (s.beat === 'burn') {
        return WS.clamp((t - acc) / WS.max(0.01, s.hold || 1), 0, 1);
      }
      acc += s.hold || 0;
    }
    return t > acc * 0.6 ? 1 : 0;
  };

  /* --------------------------------------------------------------- beats -- */
  function ease(k) { return WS.Scene.ease(k); }

  /** The survivor this run was. Everything about them comes off the character
   *  table, so a new one added later stars in this without a line of code. */
  function star(ctx, o) {
    const h = V.hero || { art: 'warrior', color: [0.96, 0.77, 0.42] };
    WS.Scene.figure(ctx, Object.assign({ id: h.art, tint: h.color,
      x: W * 0.5, size: 164 }, o));
  }

  /** The ring of held light, which is what the survivor spent the run inside.
   *  It gives way as the sky takes over - the light you are holding hands off
   *  to the light you were holding out for. */
  function ring(ctx, t, light) {
    const held = WS.max(0, 1 - light * 1.5);
    if (held <= 0.01) return;
    const cx = W * 0.5, cy = GROUND - 56;
    const r = 200 + 24 * WS.sin(t * 1.4);
    const g = ctx.createRadialGradient(cx, cy, r * 0.30, cx, cy, r);
    g.addColorStop(0, `rgba(245,197,107,${(0.20 * held).toFixed(3)})`);
    g.addColorStop(0.72, `rgba(245,197,107,${(0.07 * held).toFixed(3)})`);
    g.addColorStop(1, 'rgba(245,197,107,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, WS.TAU); ctx.fill();
    ctx.strokeStyle = `rgba(245,197,107,${((0.30 + 0.18 * WS.sin(t * 1.4)) * held).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, WS.TAU); ctx.stroke();
  }

  /** The horde, and then the horde going.
   *
   * `burn` runs 0 to 1. Each creature has its own start inside that, so the
   * line does not go out like a switch: they catch the light in a ragged wave
   * from the sunward side, flare, and leave a column of embers that lifts and
   * is gone. Nothing here is a particle system - it is the silhouette flooded
   * hotter and hotter while it shrinks, which is cheaper and reads better,
   * because the thing that vanishes is a shape you recognise. */
  function horde(ctx, t, burn, light) {
    if (!crowd) return;
    ctx.save();
    for (const c of crowd) {
      const b = ease(WS.clamp((burn - c.t0) / 0.34, 0, 1));
      if (b >= 1) { embers(ctx, c, t, burn); continue; }
      const p = place(c, t, burn * 0.10);
      const size = c.s * depth(c, t) * (1 - b * 0.22);
      const art = (WS.Enemies[c.id] || WS.Enemies.mongrel).art;
      const hot = b < 0.02 ? '#04050a'
        : WS.Scene.mix('#04050a', b > 0.55 ? '#fff2cf' : '#ff9a3c',
          b > 0.55 ? (b - 0.55) / 0.45 : b / 0.55);
      ctx.globalAlpha = 1 - b * b * 0.85;
      ctx.drawImage(WS.Scene.creature(art, size, hot),
        p.x - size / 2, p.y - size * 0.62, size, size);
      if (b < 0.35) {
        // eyes, which is all you ever really see of them
        ctx.globalAlpha = (0.45 + 0.55 * WS.sin(t * 2 + c.lag * 6)) * (1 - b / 0.35);
        ctx.fillStyle = '#e2483d';
        ctx.beginPath(); ctx.arc(p.x - size * 0.09, p.y - size * 0.30, 1.6, 0, WS.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(p.x + size * 0.09, p.y - size * 0.30, 1.6, 0, WS.TAU); ctx.fill();
      }
      if (b > 0.05) embers(ctx, c, t, burn);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    void light;
  }

  /** What is left of one of them: a short column of embers going up. */
  function embers(ctx, c, t, burn) {
    const b = WS.clamp((burn - c.t0) / 0.34, 0, 1);
    if (b <= 0.04) return;
    const p = place(c, t, burn * 0.10);
    const gone = WS.clamp((burn - c.t0 - 0.34) / 0.5, 0, 1);
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const q = ((b * 1.6) + i / 7) % 1;
      const a = (1 - q) * 0.85 * (1 - gone) * WS.min(1, b * 3);
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = q < 0.4 ? '#ffd79a' : '#f5a14b';
      const wob = WS.sin(t * 2.4 + i * 1.7 + c.lag * 6) * (7 + q * 16);
      ctx.beginPath();
      ctx.arc(p.x + wob, p.y - c.s * 0.3 - q * 130, 1.5 + (1 - q) * 1.2, 0, WS.TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* k runs 0 -> 1 across a whole run of scenes sharing a beat. Every beat has
     to survive being called with no env, because the guard draws them bare to
     check they are all different pictures. */
  const lightOf = (env, fb) => (env && env.light !== undefined ? env.light : fb);
  const burnOf = (env, fb) => (env && env.burn !== undefined ? env.burn : fb);
  const dayOf = (env, fb) => (env && env.day !== undefined ? env.day : fb);

  const BEATS = {
    /* Still night, and they are still coming. The only thing different from
       any other minute of the run is a thin grey line on the horizon. */
    last(ctx, t, k, env) {
      const l = lightOf(env, 0.1);
      WS.Scene.sky(ctx, t, l);
      WS.Scene.ranges(ctx, l);
      WS.Scene.woodFar(ctx, 0);
      WS.Scene.ground(ctx, l);
      ring(ctx, t, l);
      horde(ctx, t, 0, l);
      WS.Scene.woodNear(ctx, 0);
      WS.Scene.mist(ctx, t, l);
      star(ctx, { carry: 0.95, backlit: 0.1 });
      WS.Scene.drift(ctx, t, 0.6, 1);
    },

    /* The sun clears the ridge. Everything in front of it goes to silhouette,
       which is what a sunrise does to a landscape and the reason the survivor
       gets darker here rather than brighter. */
    break(ctx, t, k, env) {
      const l = lightOf(env, 0.5);
      WS.Scene.sky(ctx, t, l);
      WS.Scene.sunrise(ctx, l);
      WS.Scene.ranges(ctx, l);
      WS.Scene.woodFar(ctx, l);
      WS.Scene.ground(ctx, l);
      ring(ctx, t, l);
      horde(ctx, t, burnOf(env, 0), l);
      WS.Scene.woodNear(ctx, l);
      WS.Scene.mist(ctx, t, l);
      star(ctx, { carry: 0.9 * (1 - l * 0.4), backlit: l * 0.85, rim: 0.55 });
      WS.Scene.drift(ctx, t, 0.7, 1);
    },

    /* They go. */
    burn(ctx, t, k, env) {
      const l = lightOf(env, 0.8);
      WS.Scene.sky(ctx, t, l);
      WS.Scene.sunrise(ctx, l);
      WS.Scene.ranges(ctx, l);
      WS.Scene.woodFar(ctx, l);
      WS.Scene.ground(ctx, l);
      ring(ctx, t, l);
      horde(ctx, t, burnOf(env, k), l);
      WS.Scene.woodNear(ctx, l);
      WS.Scene.mist(ctx, t, l);
      star(ctx, { carry: 0.6, backlit: l * 0.8, rim: 0.6 });
      WS.Scene.drift(ctx, t, 1, 1);
    },

    /* Alone, in the light, and named. */
    named(ctx, t, k, env) {
      const l = lightOf(env, 0.92);
      WS.Scene.sky(ctx, t, l);
      WS.Scene.sunrise(ctx, l);
      WS.Scene.ranges(ctx, l);
      WS.Scene.woodFar(ctx, l);
      WS.Scene.ground(ctx, l);
      horde(ctx, t, 1, l);
      WS.Scene.day(ctx, dayOf(env, k * 0.5));
      WS.Scene.woodNear(ctx, l);
      WS.Scene.mist(ctx, t, l);
      /* The rim, not the flood: this is the one shot where the player should
         be able to see which survivor they are looking at, so the backlight
         eases off rather than on. */
      star(ctx, { size: 204, carry: 0.5, backlit: 0.55 - 0.3 * ease(k), rim: 0.7 });
      WS.Scene.drift(ctx, t, 0.55, 1);
    },

    /* Full morning, and the ember they were carrying goes back out into the
       world - which is where it came from, and the last thing the prologue
       said about it. */
    day(ctx, t, k, env) {
      const l = lightOf(env, 1);
      WS.Scene.sky(ctx, t, l);
      WS.Scene.sunrise(ctx, l);
      WS.Scene.ranges(ctx, l);
      WS.Scene.woodFar(ctx, l);
      WS.Scene.ground(ctx, l);
      WS.Scene.day(ctx, dayOf(env, 0.5 + 0.5 * k));
      WS.Scene.woodNear(ctx, l);
      WS.Scene.mist(ctx, t, l);
      star(ctx, { size: 186, carry: 0.5 * (1 - ease(k)), backlit: 0.25, rim: 0.5 });
      WS.Scene.drift(ctx, t, 0.4 + 0.5 * ease(k), 1);
    },
  };

  /* ---------------------------------------------------------------- run --- */
  V.scenes = () => (WS.Lore && WS.Lore.victory && WS.Lore.victory.scenes) || [];
  V.length = () => V.scenes().reduce((a, s) => a + (s.hold || 0), 0);

  V.at = function (t) {
    const list = this.scenes();
    let acc = 0;
    for (let i = 0; i < list.length; i++) {
      const hold = list[i].hold || 0;
      if (t < acc + hold) {
        let a = i, runStart = acc, total = hold;
        while (a > 0 && list[a - 1].beat === list[i].beat) {
          a--; runStart -= list[a].hold || 0; total += list[a].hold || 0;
        }
        for (let b = i + 1; b < list.length && list[b].beat === list[i].beat; b++) {
          total += list[b].hold || 0;
        }
        return { i, scene: list[i], k: (t - acc) / hold, start: acc,
          runIndex: a, runStart, runK: total > 0 ? (t - runStart) / total : 0 };
      }
      acc += hold;
    }
    return null;
  };

  /** `player` is the survivor who did it and `run` the run they did it in.
   *  Returns false when there is nothing to play, so the caller can fall
   *  straight through to the results panel. */
  V.begin = function (player, run, onDone) {
    if (this.active) return false;
    if (!this.scenes().length) return false;
    const hero = player && WS.Characters[player.characterId];
    if (!hero) return false;

    WS.Scene.build();
    buildCrowd(run && run.mapId);
    this.hero = hero;
    this.run = run;
    this.active = true;
    this.done = onDone || null;
    this.t = 0;
    this._cued = null;
    this.last = null;
    this.scene = -1;
    WS.Game.state = 'cinematic';

    const lore = WS.Lore.victory;
    const layer = document.createElement('div');
    layer.id = 'prologue';               // the same layer, the same typography
    layer.classList.add('victory');
    layer.innerHTML = '<div class="lines"></div>';
    const skip = document.createElement('button');
    skip.className = 'skip';
    skip.textContent = lore.skip || 'skip';
    skip.addEventListener('click', () => V.finish());
    layer.append(skip);
    (document.getElementById('stage') || document.body).append(layer);
    this.layer = layer;

    /* The battlefield furniture is not part of the shot. This runs mid-run, so
       unlike the prologue there is a live HUD over the top of it - a portrait,
       a clock reading 30:00 and a gold column, all of which belong to the
       results panel that comes next and none of which belong here. */
    this.hudWas = WS.UI.hud && WS.UI.hud.classList.contains('hidden');
    if (WS.UI.hud) WS.UI.hud.classList.add('hidden');

    this.onKey = () => V.finish();
    this.onTap = (e) => { if (e.target !== skip) V.finish(); };
    window.addEventListener('keydown', this.onKey);
    layer.addEventListener('pointerdown', this.onTap);

    WS.Audio.play('victory');
    WS.Audio.setIntensity(0);
    /* Whatever was on the field when the clock ran out, it is not on the
       field now - and a boss layer left running under the cinematic would
       score the sunrise with the thing the sunrise ended. */
    WS.Audio.setBoss(null);
    return true;
  };

  V.finish = function () {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('keydown', this.onKey);
    if (this.layer) { this.layer.remove(); this.layer = null; }
    if (WS.UI.hud && !this.hudWas) WS.UI.hud.classList.remove('hidden');
    WS.Game.state = 'over';
    const done = this.done;
    this.done = null;
    if (done) done();
  };

  let buffer = null;
  function bufferCtx() {
    if (!buffer) {
      buffer = document.createElement('canvas');
      buffer.width = W; buffer.height = H;
    }
    const g = buffer.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    return g;
  }

  /** Called by Renderer.draw, inside the letterboxed world transform. */
  V.render = function (ctx, time) {
    if (this.last === null) this.last = time;
    this.t += WS.min(0.1, WS.max(0, time - this.last));
    this.last = time;

    const now = this.at(this.t);
    if (!now) { this.finish(); return; }

    const env = { light: this.light(this.t), burn: this.burnAt(this.t),
      day: this.morning(this.t) };
    const runK = WS.clamp(now.runK, 0, 1);
    /* Score the beat, once, on the frame it becomes the current one.
     *
     * The piece is a sequence of named beats and the cue table is keyed by
     * those same names, so a scene added to the script is scored by adding a
     * cue with its name and nothing else here changes. A name the table does
     * not know is silence, deliberately - a script may run ahead of the score.
     */
    if (this._cued !== now.scene.beat) {
      this._cued = now.scene.beat;
      WS.Audio.cue('vic:' + now.scene.beat);
    }

    const beat = BEATS[now.scene.beat] || BEATS.last;

    ctx.save();
    WS.Scene.camera(ctx, this.t);
    beat(ctx, this.t, runK, env);
    ctx.restore();

    const list = this.scenes();
    const prev = now.runIndex > 0 ? list[now.runIndex - 1] : null;
    const into = this.t - now.runStart;
    if (prev && into < FADE) {
      const g = bufferCtx();
      const out = BEATS[prev.beat] || BEATS.last;
      g.save();
      WS.Scene.camera(g, this.t);
      out(g, this.t, 1, env);
      g.restore();
      ctx.save();
      ctx.globalAlpha = 1 - ease(into / FADE);
      ctx.drawImage(buffer, 0, 0, W, H);
      ctx.restore();
    }

    WS.Scene.grain(ctx);
    /* The vignette lifts as the morning comes. A victory that ends as tightly
       framed as it started has not gone anywhere. */
    WS.Scene.vignette(ctx, 1 - 0.45 * env.light);

    const s2 = ctx.createLinearGradient(0, TEXT_TOP - 96, 0, H);
    s2.addColorStop(0, 'rgba(4,5,8,0)');
    s2.addColorStop(0.55, 'rgba(4,5,8,.74)');
    s2.addColorStop(1, 'rgba(4,5,8,.92)');
    ctx.fillStyle = s2;
    ctx.fillRect(0, TEXT_TOP - 96, W, H - TEXT_TOP + 96);

    if (now.i !== this.scene) { this.scene = now.i; this.say(now.scene); }
    if (this.layer) {
      const box = this.layer.querySelector('.lines');
      const fade = WS.min(1, now.k / 0.16) * WS.min(1, (1 - now.k) / 0.18);
      box.style.opacity = (now.scene.lines && now.scene.lines.length)
        ? WS.clamp(fade, 0, 1).toFixed(3) : '0';
    }
    this.padCheck();
  };

  /** The script is data, and the survivor is filled into it. */
  V.fill = function (line) {
    const h = this.hero || {};
    return WS.template(line, {
      name: h.name || '', title: h.title || '', class: h.className || '',
      map: (this.run && WS.Maps[this.run.mapId] && WS.Maps[this.run.mapId].name) || '',
    });
  };

  V.say = function (scene) {
    if (!this.layer) return;
    const box = this.layer.querySelector('.lines');
    box.textContent = '';
    (scene.lines || []).forEach((line, i) => {
      const p = document.createElement('p');
      p.textContent = this.fill(line);
      if (scene.beat === 'named') p.className = i === 0 ? 'nameplate' : 'titleplate';
      box.append(p);
    });
  };

  V.padCheck = function () {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad) continue;
      for (const b of pad.buttons) if (b && b.pressed) { this.finish(); return; }
    }
  };

  V.beats = BEATS;

  WS.Victory = V;

})(window.WS);
