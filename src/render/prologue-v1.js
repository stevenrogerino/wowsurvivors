/* The prologue, VERSION ONE. Frozen.
 *
 * This is the cut that shipped and that the author liked, kept whole while a
 * second one is built beside it so the two can be watched back to back and one
 * of them deleted. Nothing in here should be improved: the whole value of it is
 * that it is exactly what it was. src/render/prologue-v2.js is where work goes,
 * and src/render/cinematic.js decides which of them WS.Prologue points at.
 *
 * What the night is, and why you are standing in it.
 *
 * Drawn, not filmed. There is no video here and there could not be - the game
 * ships without a single asset file, and a cinematic that broke that would
 * cost more than it is worth. Every beat below is the same procedural
 * vocabulary the game already paints with: the survivor from render/hero.js,
 * creature silhouettes from render/sprites.js, and the gem the renderer draws
 * on the field. What the words say, the picture is doing.
 *
 * It rides the game's own frame loop rather than starting a second one, which
 * is why Renderer.draw checks for it first. That matters more than it looks:
 * the loop in main.js is the one with the fault net around it, so a thrown
 * error here costs a frame instead of leaving a new player staring at a frozen
 * title before they have played a second of the game.
 *
 * The words are DOM and the scene is canvas, the same split the rest of the
 * game uses - the world is painted, the writing is typeset.
 */
'use strict';
(function (WS) {

  const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
  const GROUND = H * 0.60;          // the horizon everything stands on
  const TEXT_TOP = H * 0.72;        // nothing is drawn below this - the words live there

  const P = { active: false, done: null, layer: null, t: 0, last: null, scene: 0 };

  /* ------------------------------------------------------------- scenery -- */
  /* Seeded once so the sky does not reshuffle itself between frames, and so
     two playthroughs of the prologue are the same prologue. */
  let stars = null, trees = null, crowd = null;
  function buildScenery() {
    const seed = WS.getSeed();
    WS.setSeed(20260909);
    stars = [];
    for (let i = 0; i < 160; i++) {
      stars.push({ x: WS.random() * W, y: WS.random() * GROUND * 0.92,
        r: 0.4 + WS.random() * 1.1, tw: WS.random() * WS.TAU });
    }
    trees = [];
    for (let i = 0; i < 26; i++) {
      trees.push({ x: -40 + WS.random() * (W + 80), h: 40 + WS.random() * 70,
        w: 14 + WS.random() * 20, y: GROUND - 6 + WS.random() * 14 });
    }
    crowd = [];
    const kinds = ['mongrel', 'ghoul', 'skeleton', 'wolf', 'gilkin', 'kerchief', 'geist'];
    for (let i = 0; i < 34; i++) {
      crowd.push({ id: kinds[i % kinds.length],
        x: -80 + WS.random() * (W + 160),
        y: GROUND - 30 + WS.random() * 80,
        s: 34 + WS.random() * 22, dir: WS.random() < 0.5 ? -1 : 1,
        lag: WS.random() });
    }
    WS.setSeed(seed);            // hand the stream back exactly as it was
  }

  function sky(ctx, t, lift) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#05060a');
    g.addColorStop(0.72, lift > 0 ? mix('#080b12', '#1a1620', lift) : '#080b12');
    g.addColorStop(1, lift > 0 ? mix('#0b0e15', '#4a2f22', lift) : '#0b0e15');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND + 2);
    ctx.save();
    for (const s of stars) {
      const a = (0.25 + 0.55 * (0.5 + 0.5 * WS.sin(t * 1.4 + s.tw))) * (1 - lift * 0.9);
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfd8ea';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, WS.TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* A silhouette, not a dark tint.
   *
   * Sprites.creature takes a tint, and a tint only moves the body palette -
   * the highlights, the blade glints and the teeth stay bright, so a "dark"
   * creature drawn that way reads as a small grey animal rather than as a
   * shape in the dark. Flooding the sprite's own alpha with one colour is what
   * actually makes a silhouette, so that is what this does, once per art and
   * size and then cached. */
  const SIL = new Map();
  function silhouette(art, size, colour) {
    const key = art + ':' + WS.round(size) + ':' + colour;
    let c = SIL.get(key);
    if (c) return c;
    const src = WS.Sprites.creature(art, [1, 1, 1], size);
    c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = colour;
    g.fillRect(0, 0, c.width, c.height);
    SIL.set(key, c);
    return c;
  }

  function mix(a, b, k) {
    const pa = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.substr(i, 2), 16));
    return 'rgb(' + pa.map((v, i) => WS.round(v + (pb[i] - v) * k)).join(',') + ')';
  }

  function ground(ctx, lift) {
    ctx.fillStyle = lift > 0 ? mix('#080a0d', '#161219', lift) : '#080a0d';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    // a horizon hairline, so the ground reads as ground and not as a black bar
    ctx.strokeStyle = lift > 0 ? `rgba(255,190,120,${(0.10 + 0.35 * lift).toFixed(3)})`
      : 'rgba(120,140,170,.10)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();
  }

  function treeline(ctx, lift) {
    ctx.fillStyle = lift > 0 ? mix('#04050a', '#0d0a10', lift) : '#04050a';
    for (const tr of trees) {
      ctx.beginPath();
      ctx.moveTo(tr.x - tr.w / 2, tr.y);
      ctx.lineTo(tr.x, tr.y - tr.h);
      ctx.lineTo(tr.x + tr.w / 2, tr.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** The gem, drawn the way the field draws it: a dark pad, the stone, a core
   *  brighter than anything around it. */
  function gem(ctx, x, y, size, glow, colour) {
    const c = colour || [0.30, 0.95, 0.45];
    const rgb = `${WS.floor(c[0] * 255)},${WS.floor(c[1] * 255)},${WS.floor(c[2] * 255)}`;
    ctx.save();
    if (glow > 0.02) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, size * 9 * glow);
      g.addColorStop(0, `rgba(${rgb},${(0.34 * glow).toFixed(3)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, size * 9 * glow, 0, WS.TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(4,6,10,.85)';
    ctx.beginPath(); ctx.arc(x, y, size * 1.45, 0, WS.TAU); ctx.fill();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, -size); ctx.lineTo(size * 0.72, 0);
    ctx.lineTo(0, size); ctx.lineTo(-size * 0.72, 0);
    ctx.closePath();
    ctx.fillStyle = `rgba(${rgb},.95)`;
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${(0.55 + 0.4 * glow).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.42); ctx.lineTo(size * 0.3, 0);
    ctx.lineTo(0, size * 0.42); ctx.lineTo(-size * 0.3, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /** The survivor, lit. `carry` is how much ember they are holding. */
  function watcher(ctx, x, size, carry, t, alpha) {
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = WS.clamp(alpha, 0, 1);
    if (carry > 0.02) {
      const r = size * (0.75 + 0.9 * carry);
      const g = ctx.createRadialGradient(x, GROUND - size * 0.42, 0, x, GROUND - size * 0.42, r);
      g.addColorStop(0, `rgba(245,197,107,${(0.30 * carry).toFixed(3)})`);
      g.addColorStop(1, 'rgba(245,197,107,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, GROUND - size * 0.42, r, 0, WS.TAU); ctx.fill();
    }
    // a shadow to sit them on the ground rather than in front of it
    ctx.save();
    ctx.globalAlpha *= 0.5;      // multiply, so a fading figure fades its shadow too
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, GROUND + 3, size * 0.26, size * 0.07, 0, 0, WS.TAU);
    ctx.fill();
    ctx.restore();
    const sprite = WS.Sprites.hero('warrior', [0.96, 0.77, 0.42], size, false);
    ctx.drawImage(sprite, x - size / 2, GROUND - size + size * 0.06, size, size);
    ctx.restore();
    void t;
  }

  /* --------------------------------------------------------------- beats -- */
  /* k runs 0 -> 1 across the scene, so a beat can open and close itself
     without knowing how long the writer gave it. */
  const BEATS = {
    night(ctx, t) {
      sky(ctx, t, 0); ground(ctx, 0); treeline(ctx, 0);
      // something moving in the dark, never quite resolved
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 7; i++) {
        const x = ((t * 9 + i * 190) % (W + 200)) - 100;
        const y = GROUND + 6 + (i % 3) * 16;
        const s = 26 + (i % 4) * 5;
        ctx.fillStyle = '#020306';
        ctx.beginPath(); ctx.ellipse(x, y, s * 0.5, s * 0.3, 0, 0, WS.TAU); ctx.fill();
      }
      ctx.restore();
    },

    ember(ctx, t, k) {
      sky(ctx, t, 0); ground(ctx, 0); treeline(ctx, 0);
      const glow = 0.25 + 0.75 * k * (0.85 + 0.15 * WS.sin(t * 3));
      gem(ctx, W * 0.5, GROUND - 26, 17 + 5 * k, glow);
      // motes lifting off it
      ctx.save();
      for (let i = 0; i < 14; i++) {
        const p = ((t * 0.34) + i / 14) % 1;
        const a = (1 - p) * 0.55 * k;
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#7cf0a0';
        const wob = WS.sin(t * 2 + i) * 12;
        ctx.beginPath();
        ctx.arc(W * 0.5 + wob, GROUND - 26 - p * 150, 1.8, 0, WS.TAU);
        ctx.fill();
      }
      ctx.restore();
    },

    draw(ctx, t, k) {
      sky(ctx, t, 0); ground(ctx, 0); treeline(ctx, 0);
      const gx = W * 0.5 - 150, gy = GROUND - 26;
      const px = W * 0.5 + 90;
      const carry = WS.clamp((k - 0.2) / 0.7, 0, 1);
      gem(ctx, gx, gy, 17 * (1 - carry * 0.75), (1 - carry) * 0.9);
      // the light crossing from the stone into the survivor: this IS the game
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const p = ((t * 0.7) + i / 16) % 1;
        if (p > carry + 0.15) continue;
        const x = gx + (px - gx) * p;
        const y = gy - WS.sin(p * WS.PI) * 62 + (GROUND - 60 - gy) * p;
        ctx.globalAlpha = (1 - Math.abs(p - 0.5) * 1.2) * 0.85;
        ctx.fillStyle = mix('#7cf0a0', '#f5c56b', p);
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, WS.TAU); ctx.fill();
      }
      ctx.restore();
      watcher(ctx, px, 146, carry, t);
    },

    horde(ctx, t, k) {
      sky(ctx, t, 0); ground(ctx, 0); treeline(ctx, 0);
      watcher(ctx, W * 0.5, 146, 0.85, t);
      // they close from both edges, and they keep closing
      const march = k * 250;
      ctx.save();
      for (const c of crowd) {
        const toward = c.x < W * 0.5 ? 1 : -1;
        const x = c.x + toward * march * (0.6 + c.lag * 0.7);
        const sprite = silhouette((WS.Enemies[c.id] || WS.Enemies.mongrel).art,
          c.s, '#05060a');
        ctx.globalAlpha = 0.95;
        ctx.drawImage(sprite, x - c.s / 2, c.y - c.s * 0.62, c.s, c.s);
        // eyes, which is all you ever really see of them
        ctx.globalAlpha = 0.5 + 0.5 * WS.sin(t * 2 + c.lag * 6);
        ctx.fillStyle = '#e2483d';
        ctx.beginPath(); ctx.arc(x - c.s * 0.09, c.y - c.s * 0.30, 1.6, 0, WS.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + c.s * 0.09, c.y - c.s * 0.30, 1.6, 0, WS.TAU); ctx.fill();
      }
      ctx.restore();
    },

    stand(ctx, t, k) {
      sky(ctx, t, 0); ground(ctx, 0); treeline(ctx, 0);
      const cx = W * 0.5, cy = GROUND - 56;
      const r = 190 + 26 * WS.sin(t * 1.6);
      // the ring of held light, and the dark stopped at the edge of it
      const g = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
      g.addColorStop(0, 'rgba(245,197,107,.16)');
      g.addColorStop(1, 'rgba(245,197,107,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, WS.TAU); ctx.fill();
      ctx.strokeStyle = `rgba(245,197,107,${(0.30 + 0.2 * WS.sin(t * 1.6)).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, WS.TAU); ctx.stroke();
      ctx.save();
      for (const c of crowd) {
        const a = c.lag * WS.TAU + t * 0.25;
        const d = r + 26 + WS.sin(t * 1.1 + c.lag * 5) * 14;
        const x = cx + WS.cos(a) * d, y = cy + WS.sin(a) * d * 0.45;
        const sprite = silhouette((WS.Enemies[c.id] || WS.Enemies.mongrel).art,
          c.s * 0.9, '#04050a');
        ctx.globalAlpha = 0.9;
        ctx.drawImage(sprite, x - c.s * 0.45, y - c.s * 0.56, c.s * 0.9, c.s * 0.9);
      }
      ctx.restore();
      watcher(ctx, cx, 150, 0.75 + 0.25 * k, t);
    },

    dawn(ctx, t, k) {
      sky(ctx, t, k); ground(ctx, k); treeline(ctx, k);
      // the first line of it, on the horizon, widening
      ctx.save();
      const g = ctx.createLinearGradient(0, GROUND - 120 * k, 0, GROUND);
      g.addColorStop(0, 'rgba(255,180,90,0)');
      g.addColorStop(1, `rgba(255,196,110,${(0.34 * k).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, GROUND - 130 * k, W, 130 * k);
      ctx.restore();
      watcher(ctx, W * 0.5, 146, 1 - k * 0.55, t);
    },

    title(ctx, t, k) {
      sky(ctx, t, 1); ground(ctx, 1); treeline(ctx, 1);
      const g = ctx.createLinearGradient(0, GROUND - 130, 0, GROUND);
      g.addColorStop(0, 'rgba(255,180,90,0)');
      g.addColorStop(1, 'rgba(255,196,110,.34)');
      ctx.fillStyle = g;
      ctx.fillRect(0, GROUND - 130, W, 130);
      /* They walk out of frame while the title holds. A figure standing
         under the subtitle just collides with it, and the last image of a
         prologue should be the name of the thing. */
      watcher(ctx, W * 0.5, 132, WS.max(0, 0.3 - k), t, WS.clamp(1 - k * 2.2, 0, 1));
    },
  };

  /* ---------------------------------------------------------------- run --- */
  P.scenes = () => (WS.Lore && WS.Lore.prologue && WS.Lore.prologue.scenes) || [];
  P.length = () => P.scenes().reduce((a, s) => a + (s.hold || 0), 0);

  /** Which scene is on screen at `t`, and how far through it we are. */
  P.at = function (t) {
    let acc = 0;
    const list = this.scenes();
    for (let i = 0; i < list.length; i++) {
      const hold = list[i].hold || 0;
      if (t < acc + hold) return { i, scene: list[i], k: (t - acc) / hold };
      acc += hold;
    }
    return null;
  };

  /* ---------------------------------------------------------------- gate --
   * A cinematic that could never make a sound.
   *
   * The prologue starts on boot, and a browser will not give a page an
   * AudioContext until someone has interacted with it. Measured on a fresh
   * profile with the shipping autoplay policy: through the whole first-run
   * prologue there was no context at all - not a suspended one, none - so
   * playMusic returned at its first line and the best thing in the game ran
   * in silence. And the single gesture that would have unlocked audio, a
   * keypress, was wired to SKIP the piece. There was no way to hear it.
   *
   * So when there is no running context the piece holds on its first frame
   * with a line asking for a key, and that key starts it WITH SOUND instead
   * of ending it. Every key after that skips, as before.
   *
   * The gate only exists when it is needed. Replaying the cinematic from the
   * settings screen happens long after the player has clicked something, so
   * `armed` is already true there and the piece begins immediately. */
  P.canHear = function () {
    return !!(WS.Audio.ctx && WS.Audio.ctx.state === 'running');
  };

  P.arm = function () {
    if (this.armed) return false;
    WS.Audio.init();
    WS.Audio.resume();
    WS.Audio.applySettings();
    WS.Audio.playMusic('vigil');
    this.armed = true;
    /* The clock has been stopped on frame one; start it from HERE rather than
       from whenever the layer was built, or the piece opens by jumping
       forward by however long the player took to press a key. */
    this.last = null;
    if (this.layer) this.layer.classList.remove('waiting');
    return true;
  };

  P.begin = function (onDone) {
    if (this.active) return;
    if (!this.scenes().length) { if (onDone) onDone(); return; }
    buildScenery();
    this.active = true;
    this.done = onDone || null;
    this.t = 0;
    this._cued = null;
    this.last = null;
    this.scene = -1;
    this.armed = this.canHear();
    WS.Game.state = 'prologue';

    const lore = WS.Lore.prologue;
    const layer = document.createElement('div');
    layer.id = 'prologue';
    /* The same logotype the menu uses, from the same CSS - not a second one
       that will quietly drift from it. */
    layer.innerHTML = '<div class="lines"></div><div class="title">'
      + '<h1 class="game-title"><span class="art"></span><span class="nm"></span>'
      + '<span class="wm"></span></h1><em></em></div>';
    const words = (lore.title || 'The Ember Watch').split(' ');
    layer.querySelector('.art').textContent = words.length > 2 ? words[0] : '';
    layer.querySelector('.nm').textContent = words[words.length - 2] || 'Ember';
    layer.querySelector('.wm').textContent = words[words.length - 1] || 'Watch';
    const step = document.createElement('button');
    step.className = 'step';
    step.textContent = lore.next || 'next';
    step.addEventListener('click', () => { if (!P.arm()) P.next(); });
    layer.append(step);
    const wake = document.createElement('p');
    wake.className = 'wake';
    wake.textContent = lore.begin || 'press any key to begin';
    layer.append(wake);
    if (!this.armed) layer.classList.add('waiting');
    layer.querySelector('.title em').textContent = lore.subtitle || '';
    (document.getElementById('stage') || document.body).append(layer);
    this.layer = layer;

    this.onKey = (e) => {
      if (P.arm()) return;                 // the first key buys it a voice
      if (e && (e.key === 'Escape' || e.key === 'Esc')) P.finish();
      else P.next();
    };
    this.onTap = (e) => {
      if (e.target === step) return;       // the button speaks for itself
      if (!P.arm()) P.next();
    };
    window.addEventListener('keydown', this.onKey);
    layer.addEventListener('pointerdown', this.onTap);

    if (this.armed) WS.Audio.playMusic('vigil');
    return true;
  };

  /* ------------------------------------------------------------- stepping --
   * Any key used to end the whole piece, which made the cinematic very easy
   * to lose by accident: one stray keypress anywhere in fifty-two seconds and
   * it was gone, with nothing to say what had just been thrown away.
   *
   * So an input is NEXT, like a slide. A misplaced key costs one scene rather
   * than the piece, which is a mistake worth making. Escape still ends the
   * whole thing - it is the one key everybody already tries - and it is
   * deliberately not advertised, because the corner of the screen saying
   * "next" is an invitation to keep going and saying "skip" is an invitation
   * to leave.
   *
   * Stepping past the last scene finishes, so holding the key down still
   * gets you out without needing to know about Escape at all. */
  P.next = function () {
    const list = this.scenes();
    let acc = 0, i = 0;
    for (; i < list.length; i++) {
      const hold = list[i].hold || 0;
      if (this.t < acc + hold - 1e-6) break;
      acc += hold;
    }
    if (i >= list.length - 1) { this.finish(); return false; }
    this.t = acc + (list[i].hold || 0);
    /* The clock restarts from this frame rather than carrying the gap it was
       jumped over, and the beat re-cues itself on the next render if the
       picture actually changed. */
    this.last = null;
    return true;
  };

  P.finish = function () {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('keydown', this.onKey);
    if (this.layer) { this.layer.remove(); this.layer = null; }
    WS.Game.state = 'menu';
    const done = this.done;
    this.done = null;
    if (done) done();
  };

  /** Called by Renderer.draw, inside the letterboxed world transform. */
  P.render = function (ctx, time) {
    /* Held on frame one until the piece has a voice. The scene still draws -
       the first thing on screen is night, exactly as before - but its clock
       does not run, so nobody watches the opening play out in silence while
       the browser waits to be asked. */
    if (!this.armed) { this.last = null; }
    else {
      if (this.last === null) this.last = time;
      this.t += WS.min(0.1, WS.max(0, time - this.last));
      this.last = time;
    }

    const now = this.at(this.t);
    if (!now) { this.finish(); return; }
    /* Score the beat, once, on the frame it becomes the current one.
     *
     * The piece is a sequence of named beats and the cue table is keyed by
     * those same names, so a scene added to the script is scored by adding a
     * cue with its name and nothing else here changes. A name the table does
     * not know is silence, deliberately - a script may run ahead of the score.
     */
    if (this.armed && this._cued !== now.scene.beat) {
      this._cued = now.scene.beat;
      WS.Audio.cue('pro:' + now.scene.beat);
    }

    const beat = BEATS[now.scene.beat] || BEATS.night;
    beat(ctx, this.t, WS.clamp(now.k, 0, 1));

    // a hard vignette: this is a scene, not a screen
    const v = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.30, W / 2, H * 0.42, H * 0.86);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.74)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    /* The lower third belongs to the words. Without this the crowd walked
       straight through the sentence describing it. */
    const s2 = ctx.createLinearGradient(0, TEXT_TOP - 90, 0, H);
    s2.addColorStop(0, 'rgba(4,5,8,0)');
    s2.addColorStop(0.55, 'rgba(4,5,8,.80)');
    s2.addColorStop(1, 'rgba(4,5,8,.95)');
    ctx.fillStyle = s2;
    ctx.fillRect(0, TEXT_TOP - 90, W, H - TEXT_TOP + 90);

    if (now.i !== this.scene) { this.scene = now.i; this.say(now.scene); }
    if (this.layer) {
      // fade each card in at the top of its scene and out at the tail
      const fade = WS.min(1, now.k / 0.16) * WS.min(1, (1 - now.k) / 0.18);
      const box = this.layer.querySelector('.lines');
      box.style.opacity = now.scene.lines && now.scene.lines.length ? fade.toFixed(3) : '0';
      const title = this.layer.querySelector('.title');
      const isTitle = now.scene.beat === 'title';
      title.style.opacity = isTitle ? WS.min(1, now.k / 0.3).toFixed(3) : '0';
    }
    this.padCheck();
  };

  P.say = function (scene) {
    if (!this.layer) return;
    const box = this.layer.querySelector('.lines');
    box.textContent = '';
    for (const line of (scene.lines || [])) {
      const p = document.createElement('p');
      p.textContent = line;
      box.append(p);
    }
  };

  /** A pad should skip this as readily as a keyboard. */
  /* Standard gamepad mapping: 9 is Start. */
  const PAD_SKIP = 9;

  P.padCheck = function () {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad) continue;
      for (let i = 0; i < pad.buttons.length; i++) {
        const b = pad.buttons[i];
        if (!b || !b.pressed) continue;
        /* Same rules as a key: the first press buys the piece a voice, then a
           press steps. A pad player is exactly as entitled to hear the
           prologue as anyone else, and they were the one input that could
           never have. Start is the pad's Escape - unadvertised, like it. */
        if (this.arm()) return;
        if (i === PAD_SKIP) this.finish();
        else this.next();
        return;
      }
    }
  };

  /* Exposed so a check can draw two beats at the SAME moment and compare
     them. Sampling each beat at its own midpoint - which is the obvious thing
     - compares different times as well as different beats, so every beat
     "differs" even when they are all secretly the same one. */
  P.beats = BEATS;
  P.version = 1;

  WS.PrologueV1 = P;

})(window.WS);
