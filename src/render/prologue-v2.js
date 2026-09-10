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
  const FADE = 0.75;
  /* The last stretch of the piece, over which the roster comes up. It is taken
     off the END of the script rather than off a named scene, so re-timing the
     lore does not silently move it somewhere else. */
  const CREST = 9.5;

  const P = { active: false, done: null, layer: null, t: 0, last: null, scene: 0 };

  /* ------------------------------------------------------------- scenery -- */
  let stars = null, ridge = null, woodFar = null, woodNear = null;
  let crowd = null, motes = null, grain = null, cast = null, built = false;

  function buildScenery() {
    const seed = WS.getSeed();
    WS.setSeed(20260910);

    stars = [];
    for (let i = 0; i < 220; i++) {
      stars.push({ x: WS.random() * W, y: WS.random() * GROUND * 0.94,
        r: 0.35 + WS.random() * 1.25, tw: WS.random() * WS.TAU,
        // a handful are noticeably brighter, which is what makes the rest read
        // as a field rather than as evenly scattered dots
        big: WS.random() < 0.06 });
    }

    /* The far ridge: one polyline of hills, walked left to right with a
       wandering height. Drawn once into its own shape so the camera can move
       it at its own rate. */
    ridge = [];
    let hy = GROUND - 96;
    for (let x = -60; x <= W + 60; x += 26) {
      hy += (WS.random() - 0.5) * 26;
      hy = WS.clamp(hy, GROUND - 150, GROUND - 44);
      ridge.push({ x, y: hy });
    }

    const wood = (n, spread, hMin, hMax) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const h = hMin + WS.random() * (hMax - hMin);
        out.push({ x: -60 + WS.random() * (W + 120), h,
          // trunk width tracks height, so the far wood is not a row of stubby
          // triangles standing next to a row of tall thin ones
          w: h * (0.26 + WS.random() * 0.16),
          y: GROUND - spread + WS.random() * (spread * 2),
          lean: (WS.random() - 0.5) * 0.22 });
      }
      return out.sort((a, b) => a.y - b.y);
    };
    /* Two woods at two distances, and the numbers have to be far enough apart
       to BE two distances. They were 26-54 and 46-92, which overlap, so the
       parallax moved two bands of the same tree past each other and read as
       one wood sliding oddly. */
    woodFar = wood(40, 4, 18, 38);
    woodNear = wood(18, 14, 74, 138);

    crowd = [];
    const kinds = ['mongrel', 'ghoul', 'skeleton', 'wolf', 'gilkin', 'kerchief', 'geist'];
    for (let i = 0; i < 38; i++) {
      crowd.push({ id: kinds[i % kinds.length],
        x: -80 + WS.random() * (W + 160),
        y: GROUND - 30 + WS.random() * 84,
        s: 32 + WS.random() * 24, dir: WS.random() < 0.5 ? -1 : 1,
        lag: WS.random() });
    }
    crowd.sort((a, b) => a.y - b.y);   // painter's order, so the near ones overlap

    // Ambient embers, drifting on their own loops so nothing pulses in unison.
    motes = [];
    for (let i = 0; i < 70; i++) {
      motes.push({ x: WS.random() * W, y: WS.random() * GROUND,
        r: 0.7 + WS.random() * 1.6, sp: 6 + WS.random() * 22,
        sway: 10 + WS.random() * 34, ph: WS.random() * WS.TAU,
        life: WS.random() });
    }

    grain = buildGrain();
    buildCast();
    built = true;
    WS.setSeed(seed);            // hand the stream back exactly as it was
  }

  function ensure() { if (!built) buildScenery(); }

  /* One tile of monochrome noise, re-offset every frame. Built with the
     seeded stream so it is the same grain every time. */
  function buildGrain() {
    const n = 128;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (WS.random() - 0.5) * 210;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

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

  /* ------------------------------------------------------------ silhouette --
   * Sprites.creature and Sprites.hero both take a tint, and a tint only moves
   * the body palette - highlights, blade glints and teeth stay bright, so a
   * "dark" figure drawn that way reads as a small grey person rather than as a
   * shape in the dark. Flooding the sprite's own alpha with one colour is what
   * actually makes a silhouette. Cached, because it is a full-canvas composite. */
  const SIL = new Map();
  let silSeq = 0;
  function flood(src, colour) {
    const key = (src.__silKey || (src.__silKey = 's' + (++silSeq))) + ':' + colour;
    let c = SIL.get(key);
    if (c) return c;
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
  function creatureSil(art, size, colour) {
    return flood(WS.Sprites.creature(art, [1, 1, 1], size), colour);
  }

  function mix(a, b, k) {
    const pa = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.substr(i, 2), 16));
    return 'rgb(' + pa.map((v, i) => WS.round(v + (pb[i] - v) * k)).join(',') + ')';
  }
  function rgbOf(c) {
    return `${WS.floor(c[0] * 255)},${WS.floor(c[1] * 255)},${WS.floor(c[2] * 255)}`;
  }
  function ease(k) { const t = WS.clamp(k, 0, 1); return t * t * (3 - 2 * t); }

  /* --------------------------------------------------------------- layers -- */
  function sky(ctx, t, lift) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, lift > 0 ? mix('#04050a', '#120f1c', lift * 0.7) : '#04050a');
    g.addColorStop(0.58, lift > 0 ? mix('#070a11', '#2a1d28', lift) : '#070a11');
    g.addColorStop(0.86, lift > 0 ? mix('#0a0d14', '#6b3a24', lift) : '#0a0d14');
    g.addColorStop(1, lift > 0 ? mix('#0c0f17', '#c4712f', lift) : '#0c0f17');
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, W + 80, GROUND + 42);

    ctx.save();
    for (const s of stars) {
      const a = (0.22 + 0.6 * (0.5 + 0.5 * WS.sin(t * 1.4 + s.tw)))
        * (1 - lift * 0.95) * (s.big ? 1 : 0.72);
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.big ? '#eef3ff' : '#c6d1e6';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, WS.TAU); ctx.fill();
      if (s.big) {
        ctx.globalAlpha = a * 0.28;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3.4, 0, WS.TAU); ctx.fill();
      }
    }
    ctx.restore();
    moon(ctx, t, lift);
  }

  /* The moon, baked once into its own canvas.
   *
   * A crescent is a disc with a bite taken out of it, and the only clean way
   * to take a bite is destination-out - which removes whatever is already
   * underneath as well. Drawn straight onto the scene that punched a hard
   * black hole through the halo AND the starfield behind it, and the result
   * read as an eclipse rather than a moon. On its own canvas the bite has
   * nothing to eat but the moon. */
  let moonArt = null;
  const MOON_R = 27;
  function buildMoon() {
    const pad = MOON_R * 7;
    const c = document.createElement('canvas');
    c.width = c.height = pad * 2;
    const g = c.getContext('2d');
    const x = pad, y = pad;
    // face, bite, and only THEN the halo, underneath. Painting the halo first
    // means the bite eats a disc out of it too, and the missing glow reads as
    // a black disc sitting next to the crescent - an eclipse, not a moon.
    const face = g.createRadialGradient(x - MOON_R * 0.3, y - MOON_R * 0.3, 0, x, y, MOON_R);
    face.addColorStop(0, '#eef3ff');
    face.addColorStop(1, '#b3c1dd');
    g.fillStyle = face;
    g.beginPath(); g.arc(x, y, MOON_R, 0, WS.TAU); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(x - MOON_R * 0.44, y - MOON_R * 0.22, MOON_R * 0.95, 0, WS.TAU); g.fill();
    g.globalCompositeOperation = 'destination-over';
    const halo = g.createRadialGradient(x, y, MOON_R * 0.5, x, y, pad);
    halo.addColorStop(0, 'rgba(178,196,232,.15)');
    halo.addColorStop(0.35, 'rgba(178,196,232,.045)');
    halo.addColorStop(1, 'rgba(178,196,232,0)');
    g.fillStyle = halo;
    g.beginPath(); g.arc(x, y, pad, 0, WS.TAU); g.fill();
    return c;
  }

  /** Low and to the left, and it goes down as the sky comes up. */
  function moon(ctx, t, lift) {
    const a = 1 - WS.clamp(lift * 1.5, 0, 1);
    if (a <= 0.01) return;
    if (!moonArt) moonArt = buildMoon();
    const x = W * 0.185, y = GROUND * 0.30 + lift * 90;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.drawImage(moonArt, x - moonArt.width / 2, y - moonArt.height / 2);
    ctx.restore();
    void t;
  }

  function ridgeline(ctx, lift) {
    ctx.save();
    ctx.fillStyle = lift > 0 ? mix('#05070d', '#241624', lift) : '#05070d';
    ctx.beginPath();
    ctx.moveTo(ridge[0].x, GROUND + 4);
    for (const p of ridge) ctx.lineTo(p.x, p.y);
    ctx.lineTo(ridge[ridge.length - 1].x, GROUND + 4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function wood(ctx, band, colour) {
    ctx.fillStyle = colour;
    for (const tr of band) {
      const tipX = tr.x + tr.lean * tr.h;
      ctx.beginPath();
      ctx.moveTo(tr.x - tr.w / 2, tr.y);
      ctx.lineTo(tipX, tr.y - tr.h);
      ctx.lineTo(tr.x + tr.w / 2, tr.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function ground(ctx, lift) {
    ctx.fillStyle = lift > 0 ? mix('#07090c', '#241a20', lift) : '#07090c';
    ctx.fillRect(-40, GROUND, W + 80, H - GROUND + 40);
    /* The floor takes some of the sky back. A dawn with a black foreground has
       nothing for a shadow to fall on, and 260px of flat black under a picture
       reads as the picture being cropped rather than as ground. */
    if (lift > 0.02) {
      const g = ctx.createLinearGradient(0, GROUND, 0, H);
      g.addColorStop(0, `rgba(196,113,47,${(0.22 * lift).toFixed(3)})`);
      g.addColorStop(0.55, `rgba(120,66,44,${(0.07 * lift).toFixed(3)})`);
      g.addColorStop(1, 'rgba(90,50,36,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-40, GROUND, W + 80, H - GROUND + 40);
    }
    ctx.strokeStyle = lift > 0 ? `rgba(255,196,124,${(0.10 + 0.42 * lift).toFixed(3)})`
      : 'rgba(122,142,172,.11)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-40, GROUND); ctx.lineTo(W + 40, GROUND); ctx.stroke();
  }

  /** Fog off the floor. Three slabs at different speeds, which is enough to
   *  stop it reading as one moving stripe. */
  function mist(ctx, t, lift) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const y = GROUND - 16 + i * 13;
      const off = ((t * (5 + i * 4)) % (W + 400)) - 200;
      const g = ctx.createLinearGradient(0, y - 20, 0, y + 24);
      const a = (0.055 + i * 0.018) * (1 - lift * 0.45);
      g.addColorStop(0, 'rgba(150,170,205,0)');
      g.addColorStop(0.5, `rgba(${lift > 0.3 ? '224,178,140' : '150,170,205'},${a.toFixed(3)})`);
      g.addColorStop(1, 'rgba(150,170,205,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(off * 0.12, 0);
      ctx.fillRect(-260, y - 20, W + 520, 44);
      ctx.restore();
    }
    ctx.restore();
  }

  /** Embers on the wind. `warm` swings the colour from the green of a raw
   *  stone to the gold of ember that has been taken up. */
  function drift(ctx, t, amount, warm) {
    if (amount <= 0.01) return;
    ctx.save();
    for (const m of motes) {
      const p = (m.life + t * m.sp / 900) % 1;
      const y = m.y - p * 190;
      if (y < -20) continue;
      const x = m.x + WS.sin(t * 0.6 + m.ph) * m.sway;
      const a = WS.sin(p * WS.PI) * 0.5 * amount;
      if (a <= 0.012) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = warm > 0.5 ? '#f5c56b' : mix('#7cf0a0', '#f5c56b', warm);
      ctx.beginPath(); ctx.arc(x, y, m.r, 0, WS.TAU); ctx.fill();
    }
    ctx.restore();
  }

  /** The sun. A disc with an edge, not a wash - a wash is weather, an edge is
   *  a sunrise. `k` lifts it out of the ground. */
  function sunrise(ctx, k) {
    if (k <= 0.001) return;
    const y = GROUND + 66 - 106 * ease(k), r = 78;
    ctx.save();
    const halo = ctx.createRadialGradient(W * 0.5, y, r * 0.5, W * 0.5, y, r * 6.4);
    halo.addColorStop(0, `rgba(255,196,110,${(0.42 * k).toFixed(3)})`);
    halo.addColorStop(0.45, `rgba(255,150,70,${(0.15 * k).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(255,150,70,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(W * 0.5, y, r * 6.4, 0, WS.TAU); ctx.fill();

    ctx.beginPath(); ctx.rect(-40, -40, W + 80, GROUND + 40); ctx.clip();
    const disc = ctx.createRadialGradient(W * 0.5, y, 0, W * 0.5, y, r);
    disc.addColorStop(0, `rgba(255,246,222,${(0.96 * k).toFixed(3)})`);
    disc.addColorStop(0.7, `rgba(255,206,126,${(0.90 * k).toFixed(3)})`);
    disc.addColorStop(1, `rgba(255,168,84,${(0.55 * k).toFixed(3)})`);
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(W * 0.5, y, r, 0, WS.TAU); ctx.fill();
    ctx.restore();
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

  /** The survivor, lit. `carry` is how much ember they are holding. */
  function watcher(ctx, x, size, carry, t, alpha, backlit) {
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = WS.clamp(alpha, 0, 1);
    if (carry > 0.02) {
      const r = size * (0.8 + 1.0 * carry);
      const cy = GROUND - size * 0.42;
      const g = ctx.createRadialGradient(x, cy, 0, x, cy, r);
      g.addColorStop(0, `rgba(245,197,107,${(0.32 * carry).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(245,197,107,${(0.10 * carry).toFixed(3)})`);
      g.addColorStop(1, 'rgba(245,197,107,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, cy, r, 0, WS.TAU); ctx.fill();
      // and what it throws on the floor
      ctx.save();
      ctx.globalAlpha *= 0.55 * carry;
      const pool = ctx.createRadialGradient(x, GROUND + 3, 0, x, GROUND + 3, size * 0.9);
      pool.addColorStop(0, 'rgba(245,197,107,.34)');
      pool.addColorStop(1, 'rgba(245,197,107,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.ellipse(x, GROUND + 3, size * 0.9, size * 0.2, 0, 0, WS.TAU); ctx.fill();
      ctx.restore();
    }
    /* The contact shadow, soft-edged. A flat black ellipse was fine on v1's
       black floor and reads as a hole punched in a lit one. */
    ctx.save();
    ctx.globalAlpha *= 0.62;     // multiply, so a fading figure fades its shadow too
    const sh = ctx.createRadialGradient(x, GROUND + 3, 0, x, GROUND + 3, size * 0.30);
    sh.addColorStop(0, 'rgba(0,0,0,.62)');
    sh.addColorStop(0.6, 'rgba(0,0,0,.34)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(x, GROUND + 3, size * 0.30, size * 0.085, 0, 0, WS.TAU);
    ctx.fill();
    ctx.restore();
    const sprite = WS.Sprites.hero('warrior', [0.96, 0.77, 0.42], size, false);
    const art = backlit > 0.02 ? flood(sprite, 'rgba(12,10,14,0.96)') : sprite;
    ctx.drawImage(art, x - size / 2, GROUND - size + size * 0.06, size, size);
    if (backlit > 0.02 && backlit < 0.99) {
      ctx.globalAlpha *= 1 - backlit;
      ctx.drawImage(sprite, x - size / 2, GROUND - size + size * 0.06, size, size);
    }
    ctx.restore();
    void t;
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
      const a = rise * (1 - out);
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
      halo.addColorStop(0, `rgba(${rgb},${(known ? 0.30 : 0.40).toFixed(3)})`);
      halo.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(c.x, gy, size * 0.62, 0, WS.TAU); ctx.fill();

      /* The rim: the same silhouette in their colour, drawn a few percent
         larger and behind, so all that shows is an edge. Two drawImages and
         no compositing tricks, and it is what stops a black shape against a
         sunrise from being a black shape. */
      const rimS = size * 1.07, rimO = (rimS - size) / 2;
      ctx.globalAlpha = a * (known ? 0.42 : 0.60);
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
    night(ctx, t) {
      ensure();
      sky(ctx, t, 0); ridgeline(ctx, 0);
      wood(ctx, woodFar, '#04060b');
      ground(ctx, 0);
      wood(ctx, woodNear, '#020407');
      mist(ctx, t, 0);
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

    ember(ctx, t, k) {
      ensure();
      sky(ctx, t, 0); ridgeline(ctx, 0);
      wood(ctx, woodFar, '#04060b');
      ground(ctx, 0);
      wood(ctx, woodNear, '#020407');
      const glow = 0.25 + 0.75 * k * (0.85 + 0.15 * WS.sin(t * 3));
      gem(ctx, W * 0.5, GROUND - 26, 17 + 5 * k, glow);
      mist(ctx, t, 0);
      drift(ctx, t, k * 0.8, 0);
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

    draw(ctx, t, k) {
      ensure();
      sky(ctx, t, 0); ridgeline(ctx, 0);
      wood(ctx, woodFar, '#04060b');
      ground(ctx, 0);
      wood(ctx, woodNear, '#020407');
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
      mist(ctx, t, 0);
      watcher(ctx, px, 146, carry, t);
      drift(ctx, t, carry, carry);
    },

    horde(ctx, t, k) {
      ensure();
      sky(ctx, t, 0); ridgeline(ctx, 0);
      wood(ctx, woodFar, '#04060b');
      ground(ctx, 0);
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
      wood(ctx, woodNear, '#020407');
      mist(ctx, t, 0);
      drift(ctx, t, 0.6, 1);
    },

    stand(ctx, t, k) {
      ensure();
      sky(ctx, t, 0); ridgeline(ctx, 0);
      wood(ctx, woodFar, '#04060b');
      ground(ctx, 0);
      const cx = W * 0.5, cy = GROUND - 56;
      const r = 190 + 26 * WS.sin(t * 1.6);
      // the ring of held light, and the dark stopped at the edge of it
      const g = ctx.createRadialGradient(cx, cy, r * 0.30, cx, cy, r);
      g.addColorStop(0, 'rgba(245,197,107,.18)');
      g.addColorStop(0.72, 'rgba(245,197,107,.06)');
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
        const sprite = creatureSil((WS.Enemies[c.id] || WS.Enemies.mongrel).art,
          c.s * 0.9, '#04050a');
        ctx.globalAlpha = 0.92;
        ctx.drawImage(sprite, x - c.s * 0.45, y - c.s * 0.56, c.s * 0.9, c.s * 0.9);
      }
      ctx.restore();
      mist(ctx, t, 0);
      watcher(ctx, cx, 150, 0.75 + 0.25 * k, t);
      drift(ctx, t, 0.9, 1);
    },

    dawn(ctx, t, k, env) {
      ensure();
      const crest = env && env.crest !== undefined ? env.crest : k * 0.5;
      sky(ctx, t, k);
      sunrise(ctx, k);
      ridgeline(ctx, k);
      wood(ctx, woodFar, mix('#04060b', '#1b1018', k));
      ground(ctx, k);
      /* The near wood goes BEHIND the roster here and only here. Everywhere
         else it is the nearest thing in the frame and belongs in front; at the
         crest it put a tree squarely across three survivors' faces, and a
         title card that hides half its own subject is a worse lie than a
         clearing that happens to be conveniently placed. */
      wood(ctx, woodNear, mix('#020407', '#150c14', k));
      roster(ctx, t, crest);
      shadow(ctx, W * 0.5, GROUND + 2, 146, k, crest);
      mist(ctx, t, k);
      drift(ctx, t, 0.7, 1);
      watcher(ctx, W * 0.5, 146, 1 - k * 0.5, t, 1, k * 0.42);
    },

    title(ctx, t, k, env) {
      ensure();
      const crest = env && env.crest !== undefined ? env.crest : 0.6 + k * 0.4;
      sky(ctx, t, 1);
      sunrise(ctx, 1);
      ridgeline(ctx, 1);
      wood(ctx, woodFar, mix('#04060b', '#1b1018', 1));
      ground(ctx, 1);
      wood(ctx, woodNear, mix('#020407', '#150c14', 1));
      roster(ctx, t, crest);
      shadow(ctx, W * 0.5, GROUND + 2, 140, 1 - ease(WS.clamp((crest - 0.78) / 0.22, 0, 1)) * 0.85, crest);
      mist(ctx, t, 1);
      drift(ctx, t, 0.5, 1);
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

  /** Which scene is on screen at `t`, and how far through it we are. */
  P.at = function (t) {
    let acc = 0;
    const list = this.scenes();
    for (let i = 0; i < list.length; i++) {
      const hold = list[i].hold || 0;
      if (t < acc + hold) return { i, scene: list[i], k: (t - acc) / hold, start: acc };
      acc += hold;
    }
    return null;
  };

  P.begin = function (onDone) {
    if (this.active) return;
    if (!this.scenes().length) { if (onDone) onDone(); return; }
    buildScenery();
    warmCast();
    this.active = true;
    this.done = onDone || null;
    this.t = 0;
    this.last = null;
    this.scene = -1;
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
    layer.querySelector('.title em').textContent = lore.subtitle || '';
    (document.getElementById('stage') || document.body).append(layer);
    this.layer = layer;

    this.onKey = () => P.finish();
    this.onTap = (e) => { if (e.target !== skip) P.finish(); };
    window.addEventListener('keydown', this.onKey);
    layer.addEventListener('pointerdown', this.onTap);

    WS.Audio.playMusic('menu');
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

  /* The camera never stops moving.
   *
   * Every scene gets its own slow push and its own direction, derived from the
   * scene index so it is the same drift every time. It is small - a couple of
   * percent of zoom and a few pixels of pan - and it is the single cheapest
   * thing that separates a cinematic from a slideshow. */
  function drive(ctx, i, k) {
    const dir = (i % 3) - 1;              // -1, 0, 1, repeating
    const zoom = 1.012 + 0.026 * ease(k) + (i % 2 ? 0.006 : 0);
    const panX = dir * 13 * ease(k);
    const panY = -4 * ease(k) + (i % 2 ? 2 : 0);
    ctx.translate(W / 2 + panX, GROUND + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -GROUND);
  }

  let buffer = null, grainPat = null;
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
  P.render = function (ctx, time) {
    if (this.last === null) this.last = time;
    this.t += WS.min(0.1, WS.max(0, time - this.last));
    this.last = time;

    const now = this.at(this.t);
    if (!now) { this.finish(); return; }

    /* The roster's clock is the END of the piece, not any one scene, so
       re-timing the script in the bench moves the whole crest with it instead
       of stranding it in the middle of a shot. */
    const total = this.length();
    const crest = WS.clamp(1 - (total - this.t) / CREST, 0, 1);
    const env = { crest };

    const beat = BEATS[now.scene.beat] || BEATS.night;
    ctx.save();
    drive(ctx, now.i, WS.clamp(now.k, 0, 1));
    beat(ctx, this.t, WS.clamp(now.k, 0, 1), env);
    ctx.restore();

    /* Dissolve out of the scene before this one, but only where the BEAT
       changes: half the script is two scenes of the same picture with
       different words over it, and cross-fading a shot with itself is a
       stutter, not a transition. */
    const prev = now.i > 0 ? this.scenes()[now.i - 1] : null;
    const into = this.t - now.start;
    if (prev && prev.beat !== now.scene.beat && into < FADE) {
      const g = bufferCtx();
      const out = BEATS[prev.beat] || BEATS.night;
      g.save();
      drive(g, now.i - 1, 1);
      out(g, this.t, 1, env);
      g.restore();
      ctx.save();
      ctx.globalAlpha = 1 - ease(into / FADE);
      ctx.drawImage(buffer, 0, 0, W, H);
      ctx.restore();
    }

    /* Film grain, re-offset every frame. One tile, one draw.
     *
     * Math.random, deliberately, and not the game's WS.random: the grain is
     * the one thing here that must NOT be reproducible, and burning a hundred
     * and twenty draws a second off a stream the rest of the game plays from
     * would be a strange thing for a title sequence to do. The pattern is
     * built once - createPattern allocates, and this runs every frame. */
    if (grain) {
      if (!grainPat || grainPat.ctx !== ctx) {
        grainPat = { ctx, pat: ctx.createPattern(grain, 'repeat') };
      }
      ctx.save();
      ctx.globalAlpha = 0.032;
      ctx.globalCompositeOperation = 'overlay';
      ctx.translate(-WS.floor(Math.random() * 128), -WS.floor(Math.random() * 128));
      ctx.fillStyle = grainPat.pat;
      ctx.fillRect(0, 0, W + 128, H + 128);
      ctx.restore();
    }

    // a hard vignette: this is a scene, not a screen
    const v = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.42, H * 0.88);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.62, 'rgba(0,0,0,.30)');
    v.addColorStop(1, 'rgba(0,0,0,.80)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    /* The lower third belongs to the words. Without this the crowd walked
       straight through the sentence describing it. It eases off under the
       title, where there is one short line and a rank of survivors that the
       band would otherwise be sitting on. */
    const isTitle = now.scene.beat === 'title';
    const band = isTitle ? 0.62 : 1;
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
