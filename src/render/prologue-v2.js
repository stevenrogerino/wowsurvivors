/* The prologue, VERSION TWO.
 *
 * Same story, same script, same rule: not one asset file. Everything below is
 * drawn from the shapes the game already owns - the survivor rig in
 * render/hero.js, the creature sprites in render/sprites.js, the gem the field
 * draws. What changed is the air between them.
 *
 * Six things v1 did not do:
 *
 *   depth       One treeline stood on one flat ground. There are now four
 *               planes - a far ridge, a far wood, a near wood and the floor -
 *               and the camera drifts, so they part from each other as it
 *               moves. A still frame with no parallax is a picture; a still
 *               frame with parallax is a place you are standing in.
 *
 *   dissolves   Scenes cut. Every hard cut in a 52-second piece is a small
 *               announcement that this is software. Beats now cross-fade into
 *               each other over three quarters of a second - only where the
 *               beat actually changes, because half the scenes continue the
 *               one before them and dissolving those would be a stutter.
 *
 *   weather     Mist off the ground, embers on the wind, a moon that sets as
 *               the sky comes up. The night was empty and the emptiness read
 *               as unfinished rather than as lonely.
 *
 *   grain       A single 128px noise tile, re-offset every frame, at three
 *               percent. It costs one drawImage and it is the difference
 *               between flat vector fill and photographed dark.
 *
 *   the sun     v1's dawn was a gradient. It is now a disc with a real edge,
 *               climbing, and everything in front of it goes to silhouette
 *               against it - which is what a sunrise DOES to a landscape.
 *
 *   the cast    And at the end, the other nine come up over the hill.
 *
 * That last one is the point of the whole version. The prologue used to close
 * on one survivor walking out of frame under the title, which says the story
 * is over. Ten of them cresting the ridge in their own colours says the
 * opposite - that this one is the first of ten, and the other nine are still
 * out there to be earned. The ones already unlocked stand lit; the ones still
 * locked come up as shapes with their colour behind them, which is an honest
 * picture of a roster you have not finished.
 */
'use strict';
(function (WS) {

  const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
  const GROUND = H * 0.605;         // the horizon everything stands on
  const TEXT_TOP = H * 0.735;       // nothing is drawn below this - the words live there

  /* How long a beat takes to become the next beat. Long enough to read as a
     dissolve rather than a flicker; short enough that no scene spends a fifth
     of itself being two scenes at once. */
  const FADE = 1.05;
  /* The last stretch of the piece, over which the roster comes up. It is taken
     off the END of the script rather than off a named scene, so re-timing the
     lore does not silently move it somewhere else. */
  const CREST = 9.5;

  const P = { active: false, done: null, layer: null, t: 0, last: null, scene: 0 };

  /* ------------------------------------------------------------- scenery -- */
  /* The landscape - sky, ranges, woods, mist, embers, sun, grain, camera, and
     the drawing of a survivor standing on the horizon - is src/render/scenery.js.
     It moved out when the victory cinematic wanted the same world; these are
     the names the beats below already used. */
  const S = WS.Scene;
  const mix = S.mix, ease = S.ease, rgbOf = S.rgbOf, flood = S.flood;
  const creatureSil = S.creature;

  let crowd = null, cast = null, built = false;

  function buildScenery() {
    S.build();                    // the world: stars, ranges, woods, embers, grain
    const held = WS.getSeed();
    WS.setSeed(20260911);
    /* The horde is the prologue's own, because nothing else in the game needs
       thirty-eight creatures walking in from both edges at once. */
    crowd = [];
    const kinds = ['mongrel', 'ghoul', 'skeleton', 'wolf', 'gilkin', 'kerchief', 'geist'];
    for (let i = 0; i < 38; i++) {
      crowd.push({ id: kinds[i % kinds.length],
        x: -80 + WS.random() * (WS.CONST.WORLD_WIDTH + 160),
        y: GROUND - 30 + WS.random() * 84,
        s: 32 + WS.random() * 24, dir: WS.random() < 0.5 ? -1 : 1,
        lag: WS.random() });
    }
    crowd.sort((a, b) => a.y - b.y);   // painter's order, so the near ones overlap
    buildCast();
    built = true;
    WS.setSeed(held);
  }

  function ensure() { if (!built) buildScenery(); }

  /* One tile of monochrome noise, re-offset every frame. Built with the
     seeded stream so it is the same grain every time. */

  /* ---------------------------------------------------------------- cast -- *
   * Who stands where when the roster comes up. The survivor the prologue has
   * been following holds the centre and the rest arrive outward from them, so
   * the picture builds around the figure you already know rather than filling
   * in from the edges. */
  const LEAD = 'warrior';
  function buildCast() {
    const rest = (WS.CharacterOrder || []).filter((id) => id !== LEAD);
    cast = [{ id: LEAD, side: 0, rank: 0 }];
    rest.forEach((id, i) => {
      cast.push({ id, side: i % 2 ? 1 : -1, rank: WS.floor(i / 2) + 1 });
    });
    for (const c of cast) {
      c.x = W * (0.5 + c.side * (0.068 + c.rank * 0.070));
      c.size = 134 - c.rank * 8;
      c.y = GROUND + 4 - c.rank * 7;
      c.t0 = c.rank * 0.075 + (c.side > 0 ? 0.036 : 0);
    }
  }

  /** Bake the cast's sprites before the piece needs them. Ten survivors is ten
   *  full runs of the hero rig, and doing that in the frame the sun comes up
   *  drops the frame the sun comes up. */
  function warmCast() {
    if (!cast) return;
    for (const c of cast) {
      const ch = (WS.Characters || {})[c.id];
      if (!ch) continue;
      const sprite = WS.Sprites.hero(ch.art || c.id, ch.color, WS.round(c.size));
      flood(sprite, 'rgba(6,8,13,0.94)');
    }
  }



  /** Every beat draws itself at the same light level, taken from the piece
   *  rather than from the scene, so the sunrise crosses scene boundaries
   *  instead of being switched on at one. `fallback` is what a beat drawn bare
   *  should use - the guard draws each of them with no env to check they are
   *  all different pictures. */
  function lightOf(env, fallback) {
    return env && env.light !== undefined ? env.light : fallback;
  }





  /* Far to near, palest to darkest. The three pairs are top-of-peak and
     base-of-haze for each range; `lift` walks them into the dawn. */
  /* At dawn the far haze LIGHTS and the near land goes to silhouette - the
     two ends of the same range table move in opposite directions, which is
     what a sunrise does to a landscape and why the near range has to be dark
     enough to read as a shape against it. */


  /* The far wood stands among the hazed ranges, so it carries some of that
     haze; the near wood is the closest thing in the frame and stays black.
     Two bands of the same near-black read as one band at two sizes. */






  /** The survivor this piece is about: always the warrior, always lit by
   *  whatever ember they are carrying. A thin wrapper on Scene.figure, which
   *  the roster and the victory cinematic also draw through. */
  function watcher(ctx, x, size, carry, t, alpha, backlit) {
    S.figure(ctx, { id: 'warrior', tint: [0.96, 0.77, 0.42],
      x, size, carry, alpha, backlit: backlit || 0 });
    void t;
  }

  /** The gem, drawn the way the field draws it. */
  function gem(ctx, x, y, size, glow, colour) {
    const c = colour || [0.30, 0.95, 0.45];
    const rgb = rgbOf(c);
    ctx.save();
    if (glow > 0.02) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, size * 10 * glow);
      g.addColorStop(0, `rgba(${rgb},${(0.36 * glow).toFixed(3)})`);
      g.addColorStop(0.45, `rgba(${rgb},${(0.12 * glow).toFixed(3)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, size * 10 * glow, 0, WS.TAU); ctx.fill();
    }
    // the light it throws on the ground under it
    ctx.save();
    ctx.globalAlpha = 0.5 * WS.clamp(glow, 0, 1);
    const pool = ctx.createRadialGradient(x, GROUND + 2, 0, x, GROUND + 2, size * 5);
    pool.addColorStop(0, `rgba(${rgb},.5)`);
    pool.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(x, GROUND + 2, size * 5, size * 1.5, 0, 0, WS.TAU); ctx.fill();
    ctx.restore();

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


  /* --------------------------------------------------------- the roster --- *
   * `p` runs 0 -> 1 across the whole crest: figures rise in turn, hold, and
   * then the whole rank goes out together under the title. */
  function roster(ctx, t, p) {
    if (!cast || p <= 0.001) return;
    const out = ease(WS.clamp((p - 0.78) / 0.22, 0, 1));
    ctx.save();
    // far ranks first, so nearer survivors overlap them
    const order = cast.slice().sort((a, b) => b.rank - a.rank);
    for (const c of order) {
      if (c.id === LEAD) continue;       // the lead is drawn by the beat itself
      const rise = ease(WS.clamp((p - c.t0) / 0.30, 0, 1));
      if (rise <= 0.001) continue;
      const ch = (WS.Characters || {})[c.id];
      if (!ch) continue;
      const size = WS.round(c.size);
      const known = unlocked(c.id);
      /* Alpha rises FASTER than the body does, so the early part of the climb
         - when all that is above the ground is the top of a head - happens at
         almost nothing. Linear alpha left a row of small pale blobs sitting on
         the horizon for the first second of the crest, which reads as debris
         rather than as somebody arriving. */
      const a = rise * rise * (1 - out);
      // rising: they come up out of the ground, and the ground hides the rest
      const hidden = (1 - rise) * size * 0.86;
      const rgb = rgbOf(ch.color);
      const top = c.y - size + size * 0.06 + hidden;
      const sprite = WS.Sprites.hero(ch.art || c.id, ch.color, size);

      shadow(ctx, c.x, c.y, size, a * 0.9, p);

      ctx.save();
      ctx.beginPath();
      ctx.rect(-40, -40, W + 80, c.y + 40 + 6);
      ctx.clip();
      ctx.globalAlpha = a;

      /* Their own colour behind them, kept TIGHT. A wide soft halo turned ten
         survivors into ten patches of coloured fog with something in the
         middle - measured by looking at it: the band across the horizon read
         as weather, not as people. It sits close to the body now, where a
         backlight actually falls. */
      const gy = c.y - size * 0.52 + hidden;
      const halo = ctx.createRadialGradient(c.x, gy, size * 0.10, c.x, gy, size * 0.62);
      halo.addColorStop(0, `rgba(${rgb},${(known ? 0.24 : 0.32).toFixed(3)})`);
      halo.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(c.x, gy, size * 0.62, 0, WS.TAU); ctx.fill();

      /* The rim: the same silhouette in their colour, drawn a few percent
         larger and behind, so all that shows is an edge. Two drawImages and
         no compositing tricks, and it is what stops a black shape against a
         sunrise from being a black shape. */
      const rimS = size * 1.07, rimO = (rimS - size) / 2;
      ctx.globalAlpha = a * (known ? 0.34 : 0.46);
      ctx.drawImage(flood(sprite, `rgba(${rgb},1)`),
        c.x - rimS / 2, top - rimO, rimS, rimS);
      ctx.globalAlpha = a;

      if (known) {
        /* Yours already: the person, standing in the light you brought, dusked
           a little so they belong to the same sunrise as everything else. */
        ctx.drawImage(flood(sprite, 'rgba(14,11,16,0.82)'), c.x - size / 2, top, size, size);
        ctx.globalAlpha = a * 0.88;
        ctx.drawImage(sprite, c.x - size / 2, top, size, size);
      } else {
        /* Still to be earned: the shape and the colour, not the person. Drawn
           in full they would be a promise the save cannot keep. */
        ctx.drawImage(flood(sprite, 'rgba(8,7,11,0.97)'), c.x - size / 2, top, size, size);
      }
      ctx.restore();
    }
    ctx.restore();
    void t;
  }

  /* The shadow a low sun throws.
   *
   * The sun is upstage and climbing, so shadows run toward the camera and
   * shorten as it rises - which is the one detail that puts anything in the
   * bottom half of a dawn frame. Without it the foreground was 260 pixels of
   * flat black under a picture, and the eye reads that as the picture being
   * cropped rather than as ground. A tapered quad, not an ellipse: an ellipse
   * at this length reads as a puddle. */
  function shadow(ctx, x, foot, size, alpha, p) {
    const len = size * (2.6 - 1.5 * ease(p));
    const w = size * 0.20;
    ctx.save();
    ctx.globalAlpha = WS.clamp(alpha, 0, 1) * 0.34;
    const g = ctx.createLinearGradient(0, foot, 0, foot + len);
    g.addColorStop(0, 'rgba(6,4,8,.85)');
    g.addColorStop(1, 'rgba(6,4,8,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, foot);
    ctx.lineTo(x + w, foot);
    ctx.lineTo(x + w * 1.9, foot + len);
    ctx.lineTo(x - w * 1.9, foot + len);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function unlocked(id) {
    try { return !!WS.Save.isCharacterUnlocked(id); } catch (e) { return false; }
  }

  /* --------------------------------------------------------------- beats -- *
   * k runs 0 -> 1 across the scene, so a beat can open and close itself
   * without knowing how long the writer gave it. `env` carries the few things
   * that are true of the whole piece rather than of one scene; every beat has
   * to survive being called without it, because the guard draws them bare to
   * check they are all different pictures. */
  const BEATS = {
    night(ctx, t, k, env) {
      ensure();
      const l = lightOf(env, 0);
      S.sky(ctx, t, l); S.ranges(ctx, l);
      S.woodFar(ctx, 0);
      S.ground(ctx, l);
      S.woodNear(ctx, 0);
      S.mist(ctx, t, l);
      // something moving in the dark, never quite resolved
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 9; i++) {
        const x = ((t * 9 + i * 156) % (W + 200)) - 100;
        const y = GROUND + 8 + (i % 3) * 18;
        const s = 26 + (i % 4) * 5;
        ctx.fillStyle = '#020306';
        ctx.beginPath(); ctx.ellipse(x, y, s * 0.5, s * 0.3, 0, 0, WS.TAU); ctx.fill();
      }
      ctx.restore();
    },

    ember(ctx, t, k, env) {
      ensure();
      const l = lightOf(env, 0);
      S.sky(ctx, t, l); S.ranges(ctx, l);
      S.woodFar(ctx, 0);
      S.ground(ctx, l);
      S.woodNear(ctx, 0);
      const glow = 0.25 + 0.75 * k * (0.85 + 0.15 * WS.sin(t * 3));
      gem(ctx, W * 0.5, GROUND - 26, 17 + 5 * k, glow);
      S.mist(ctx, t, l);
      S.drift(ctx, t, k * 0.8, 0);
      // motes lifting straight off the stone
      ctx.save();
      for (let i = 0; i < 16; i++) {
        const p = ((t * 0.34) + i / 16) % 1;
        const a = (1 - p) * 0.6 * k;
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#7cf0a0';
        const wob = WS.sin(t * 2 + i) * 12;
        ctx.beginPath();
        ctx.arc(W * 0.5 + wob, GROUND - 26 - p * 158, 1.8, 0, WS.TAU);
        ctx.fill();
      }
      ctx.restore();
    },

    draw(ctx, t, k, env) {
      ensure();
      const l = lightOf(env, 0);
      S.sky(ctx, t, l); S.ranges(ctx, l);
      S.woodFar(ctx, 0);
      S.ground(ctx, l);
      S.woodNear(ctx, 0);
      const gx = W * 0.5 - 150, gy = GROUND - 26;
      const px = W * 0.5 + 90;
      const carry = WS.clamp((k - 0.2) / 0.7, 0, 1);
      gem(ctx, gx, gy, 17 * (1 - carry * 0.75), (1 - carry) * 0.9);
      // the light crossing from the stone into the survivor: this IS the game
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < 20; i++) {
        const p = ((t * 0.7) + i / 20) % 1;
        if (p > carry + 0.15) continue;
        const x = gx + (px - gx) * p;
        const y = gy - WS.sin(p * WS.PI) * 66 + (GROUND - 60 - gy) * p;
        ctx.globalAlpha = (1 - Math.abs(p - 0.5) * 1.2) * 0.9;
        ctx.fillStyle = mix('#7cf0a0', '#f5c56b', p);
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, WS.TAU); ctx.fill();
        ctx.globalAlpha *= 0.35;
        ctx.beginPath(); ctx.arc(x, y, 6.5, 0, WS.TAU); ctx.fill();
      }
      ctx.restore();
      S.mist(ctx, t, l);
      watcher(ctx, px, 146, carry, t);
      S.drift(ctx, t, carry, carry);
    },

    horde(ctx, t, k, env) {
      ensure();
      const l = lightOf(env, 0);
      S.sky(ctx, t, l); S.ranges(ctx, l);
      S.woodFar(ctx, 0);
      S.ground(ctx, l);
      watcher(ctx, W * 0.5, 146, 0.85, t);
      // they close from both edges, and they keep closing
      const march = k * 250;
      ctx.save();
      for (const c of crowd) {
        const toward = c.x < W * 0.5 ? 1 : -1;
        const x = c.x + toward * march * (0.6 + c.lag * 0.7);
        const sprite = creatureSil((WS.Enemies[c.id] || WS.Enemies.mongrel).art,
          c.s, '#04050a');
        ctx.globalAlpha = 0.96;
        ctx.drawImage(sprite, x - c.s / 2, c.y - c.s * 0.62, c.s, c.s);
        // eyes, which is all you ever really see of them
        ctx.globalAlpha = 0.45 + 0.55 * WS.sin(t * 2 + c.lag * 6);
        ctx.fillStyle = '#e2483d';
        ctx.beginPath(); ctx.arc(x - c.s * 0.09, c.y - c.s * 0.30, 1.6, 0, WS.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + c.s * 0.09, c.y - c.s * 0.30, 1.6, 0, WS.TAU); ctx.fill();
      }
      ctx.restore();
      S.woodNear(ctx, 0);
      S.mist(ctx, t, l);
      S.drift(ctx, t, 0.6, 1);
    },

    stand(ctx, t, k, env) {
      /* The last scene before dawn, and the light is already on its way: this
         is where the horizon starts to warm, under the ring, while she is
         still holding it. Version one's best moment was the light coming up
         slowly, and it comes up slowly by starting before anybody looks. */
      ensure();
      const l = lightOf(env, 0);
      S.sky(ctx, t, l); S.ranges(ctx, l);
      S.woodFar(ctx, 0);
      S.ground(ctx, l);
      const cx = W * 0.5, cy = GROUND - 56;
      const r = 190 + 26 * WS.sin(t * 1.6);
      /* The ring gives way as the sky takes over. Measured, the frame got
         DARKER at t=40.8 - the moment the dawn begins - because this ring is
         the brightest thing in the piece and it was simply dissolving away
         under a sky that had not caught up yet. The light she is holding fades
         as the light she is waiting for arrives, which is both the fix and the
         thing the scene is about. */
      const held = WS.max(0, 1 - lightOf(env, 0) * 2.6);
      // the ring of held light, and the dark stopped at the edge of it
      const g = ctx.createRadialGradient(cx, cy, r * 0.30, cx, cy, r);
      g.addColorStop(0, `rgba(245,197,107,${(0.18 * held).toFixed(3)})`);
      g.addColorStop(0.72, `rgba(245,197,107,${(0.06 * held).toFixed(3)})`);
      g.addColorStop(1, 'rgba(245,197,107,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, WS.TAU); ctx.fill();
      ctx.strokeStyle = `rgba(245,197,107,${((0.30 + 0.2 * WS.sin(t * 1.6)) * held).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, WS.TAU); ctx.stroke();
      ctx.save();
      for (const c of crowd) {
        const a = c.lag * WS.TAU + t * 0.25;
        const d = r + 26 + WS.sin(t * 1.1 + c.lag * 5) * 14;
        const x = cx + WS.cos(a) * d, y = cy + WS.sin(a) * d * 0.45;
        const sprite = creatureSil((WS.Enemies[c.id] || WS.Enemies.mongrel).art,
          c.s * 0.9, '#04050a');
        ctx.globalAlpha = 0.92;
        ctx.drawImage(sprite, x - c.s * 0.45, y - c.s * 0.56, c.s * 0.9, c.s * 0.9);
      }
      ctx.restore();
      S.mist(ctx, t, l);
      watcher(ctx, cx, 150, 0.75 + 0.25 * k, t);
      S.drift(ctx, t, 0.9, 1);
    },

    dawn(ctx, t, k, env) {
      ensure();
      const crest = env && env.crest !== undefined ? env.crest : k * 0.5;
      const l = lightOf(env, k);
      S.sky(ctx, t, l);
      S.sunrise(ctx, l);
      S.ranges(ctx, l);
      S.woodFar(ctx, l);
      S.ground(ctx, l);
      /* The near wood goes BEHIND the roster here and only here. Everywhere
         else it is the nearest thing in the frame and belongs in front; at the
         crest it put a tree squarely across three survivors' faces, and a
         title card that hides half its own subject is a worse lie than a
         clearing that happens to be conveniently placed. */
      S.woodNear(ctx, l);
      roster(ctx, t, crest);
      shadow(ctx, W * 0.5, GROUND + 2, 146, l, crest);
      S.mist(ctx, t, l);
      S.drift(ctx, t, 0.7, 1);
      watcher(ctx, W * 0.5, 146, 1 - l * 0.5, t, 1, l * 0.5);
    },

    title(ctx, t, k, env) {
      ensure();
      const crest = env && env.crest !== undefined ? env.crest : 0.6 + k * 0.4;
      const l = lightOf(env, 1);
      S.sky(ctx, t, l);
      S.sunrise(ctx, l);
      S.ranges(ctx, l);
      S.woodFar(ctx, l);
      S.ground(ctx, l);
      S.woodNear(ctx, l);
      roster(ctx, t, crest);
      shadow(ctx, W * 0.5, GROUND + 2, 140, 1 - ease(WS.clamp((crest - 0.78) / 0.22, 0, 1)) * 0.85, crest);
      S.mist(ctx, t, l);
      S.drift(ctx, t, 0.5, 1);
      /* The lead holds their ground while the title comes up over them and the
         rank behind them goes out. In v1 they walked out of frame, because
         there was nothing else in the picture to look at. */
      const out = ease(WS.clamp((crest - 0.78) / 0.22, 0, 1));
      /* Half-dusked, not blacked out. At 0.85 the survivor the whole piece has
         been about arrived at the title as an unreadable dark shape with two
         glowing eyes, which is what the game's monsters look like. */
      watcher(ctx, W * 0.5, 140, 0.55, t, 1 - out * 0.85, 0.45);
    },
  };

  /* ---------------------------------------------------------------- run --- */
  P.scenes = () => (WS.Lore && WS.Lore.prologue && WS.Lore.prologue.scenes) || [];
  P.length = () => P.scenes().reduce((a, s) => a + (s.hold || 0), 0);

  /** Which scene is on screen at `t`, how far through it we are - and how far
   *  through the RUN OF SCENES SHARING ITS BEAT.
   *
   *  That second number is the one the picture is drawn from, and it did not
   *  used to exist. Half the script is two consecutive scenes of the same
   *  beat with different words over them, and a beat draws itself from k - so
   *  at the boundary between them k fell from 1 straight back to 0 and the
   *  picture jumped. Measured: the gem's glow is `0.25 + 0.75 * k`, and at
   *  t=15.0 it snapped from full to a quarter in one frame, moving the frame
   *  twelve times as much as a typical step. The words still fade on the
   *  scene's own k; only the picture reads the run. */
  P.at = function (t) {
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
    warmCast();
    this.dawnStart = this.findDawn();
    this.active = true;
    this.done = onDone || null;
    this.t = 0;
    this._cued = null;
    this.last = null;
    this.scene = -1;
    this.armed = this.canHear();
    this.rosterSaid = false;
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
    const skip = document.createElement('button');
    skip.className = 'skip';
    skip.textContent = lore.skip || 'skip';
    skip.addEventListener('click', () => P.finish());
    layer.append(skip);
    const wake = document.createElement('p');
    wake.className = 'wake';
    wake.textContent = lore.begin || 'press any key to begin';
    layer.append(wake);
    if (!this.armed) layer.classList.add('waiting');
    layer.querySelector('.title em').textContent = lore.subtitle || '';
    (document.getElementById('stage') || document.body).append(layer);
    this.layer = layer;

    this.onKey = () => { if (!P.arm()) P.finish(); };
    this.onTap = (e) => {
      if (e.target === skip) return;
      if (!P.arm()) P.finish();
    };
    window.addEventListener('keydown', this.onKey);
    layer.addEventListener('pointerdown', this.onTap);

    if (this.armed) WS.Audio.playMusic('vigil');
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

  /** How far up the light is, 0 to 1, across the WHOLE piece.
   *
   * This is the thing version one got right and version two lost, and it was
   * the first note back on it: the light coming up is the best moment in the
   * prologue and it has to be slow. v2 took it from a luminance of 13 to 28 in
   * six seconds - a sunrise on a stopwatch.
   *
   * So it is one curve over sixteen seconds, anchored to where the dawn scene
   * actually starts rather than to a scene index, and it begins BEFORE that:
   * the horizon is already warming faintly while the survivor is still holding
   * the ring, which is what makes the dawn feel earned rather than announced.
   * The exponent keeps the first half slower than the second, so it creeps and
   * then breaks instead of sliding up at a constant rate. */
  const PRE = 5.0;          // seconds of warming before the dawn scene proper
  const PRE_LIGHT = 0.13;   // how much of it has happened by then
  P.light = function (t) {
    const D = this.dawnStart === undefined ? this.length() * 0.78 : this.dawnStart;
    const end = this.length();
    if (t < D - PRE) return 0;
    if (t < D) return PRE_LIGHT * ease((t - (D - PRE)) / PRE);
    const x = WS.clamp((t - D) / WS.max(0.01, end - D), 0, 1);
    return PRE_LIGHT + (1 - PRE_LIGHT) * WS.pow(x, 1.45);
  };

  /** Absolute time at which the first dawn scene begins. */
  P.findDawn = function () {
    let acc = 0;
    for (const s of this.scenes()) {
      if (s.beat === 'dawn') return acc;
      acc += s.hold || 0;
    }
    return this.length() * 0.78;
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

    /* The roster's clock is the END of the piece, not any one scene, so
       re-timing the script in the bench moves the whole crest with it instead
       of stranding it in the middle of a shot. */
    const total = this.length();
    const crest = WS.clamp(1 - (total - this.t) / CREST, 0, 1);
    const light = this.light(this.t);
    const env = { crest, light };
    const runK = WS.clamp(now.runK, 0, 1);
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
    ctx.save();
    S.camera(ctx, this.t);
    beat(ctx, this.t, runK, env);
    ctx.restore();

    /* Dissolve out of the beat before this one. Same-beat boundaries have
       nothing to dissolve - runK carries straight through them - so this fires
       only where the picture genuinely changes, and it measures from the start
       of the RUN rather than of the scene. */
    const list = this.scenes();
    const prev = now.runIndex > 0 ? list[now.runIndex - 1] : null;
    const into = this.t - now.runStart;
    if (prev && into < FADE) {
      const g = bufferCtx();
      const out = BEATS[prev.beat] || BEATS.night;
      g.save();
      S.camera(g, this.t);
      out(g, this.t, 1, env);
      g.restore();
      ctx.save();
      ctx.globalAlpha = 1 - ease(into / FADE);
      ctx.drawImage(buffer, 0, 0, W, H);
      ctx.restore();
    }

    S.grain(ctx);
    S.vignette(ctx);

    /* The lower third belongs to the words. Without this the crowd walked
       straight through the sentence describing it. It eases off under the
       title, where there is one short line and a rank of survivors that the
       band would otherwise be sitting on.
     *
     * EASED, not switched. As a boolean this was the third of the three jump
     * cuts: the band went from 80/95% opacity to 50/59% in a single frame at
     * t=47.33, and because it covers the bottom quarter of the screen that
     * moved the frame ten times as much as a typical step - a visible flash
     * across the foot of the picture exactly as the title arrived. It rides
     * the crest now, which is already smooth. */
    const isTitle = now.scene.beat === 'title';
    const band = 1 - 0.38 * ease(WS.clamp((crest - 0.30) / 0.30, 0, 1));
    const s2 = ctx.createLinearGradient(0, TEXT_TOP - 96, 0, H);
    s2.addColorStop(0, 'rgba(4,5,8,0)');
    s2.addColorStop(0.55, `rgba(4,5,8,${(0.80 * band).toFixed(3)})`);
    s2.addColorStop(1, `rgba(4,5,8,${(0.95 * band).toFixed(3)})`);
    ctx.fillStyle = s2;
    ctx.fillRect(0, TEXT_TOP - 96, W, H - TEXT_TOP + 96);

    if (now.i !== this.scene) { this.scene = now.i; this.rosterSaid = false; this.say(now.scene); }
    if (this.layer) {
      const box = this.layer.querySelector('.lines');
      let lines = now.scene.lines && now.scene.lines.length;
      /* The one line v2 adds to the script, and it is added here rather than
         in the lore so that v1 - which has no roster to caption - is not made
         to carry a sentence about a picture it does not draw. */
      if (isTitle && crest > 0.42) {
        if (!this.rosterSaid) {
          this.rosterSaid = true;
          this.say({ lines: [rosterLine()] });
        }
        lines = 1;
      }
      const fade = isTitle && lines
        ? WS.min(1, (crest - 0.42) / 0.14) * WS.min(1, (1 - now.k) / 0.16)
        : WS.min(1, now.k / 0.16) * WS.min(1, (1 - now.k) / 0.18);
      box.style.opacity = lines ? WS.clamp(fade, 0, 1).toFixed(3) : '0';
      const title = this.layer.querySelector('.title');
      title.style.opacity = isTitle ? WS.min(1, now.k / 0.3).toFixed(3) : '0';
    }
    this.padCheck();
  };

  function rosterLine() {
    const lore = (WS.Lore && WS.Lore.prologue) || {};
    return lore.roster || 'You are one of ten. The rest are still out there.';
  }

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
  P.padCheck = function () {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad) continue;
      for (const b of pad.buttons) if (b && b.pressed) { this.finish(); return; }
    }
  };

  /* Exposed so a check can draw two beats at the SAME moment and compare
     them. Sampling each beat at its own midpoint - which is the obvious thing
     - compares different times as well as different beats, so every beat
     "differs" even when they are all secretly the same one. */
  P.beats = BEATS;
  P.version = 2;

  WS.PrologueV2 = P;

})(window.WS);
