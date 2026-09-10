/* The world these cinematics stand in.
 *
 * One night, one dawn, one set of hills, drawn the way the rest of the game
 * draws everything: procedurally, out of shapes already in the build, with no
 * asset file anywhere. It was written inside the prologue and it lives out
 * here now because a second cinematic wanted it - the victory piece is this
 * same landscape at the moment the sun finally clears the ridge, and a third
 * copy of a sky would have been three skies drifting apart.
 *
 * Everything takes a `lift`: 0 is the middle of the night, 1 is full dawn, and
 * every layer knows how to be either. Nothing in here knows what scene it is
 * in or what the words say; that belongs to whoever is directing.
 *
 * src/render/prologue-v1.js is deliberately NOT a client of this. It is frozen
 * at what it shipped as, including its own simpler sky.
 */
'use strict';
(function (WS) {

  const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
  const GROUND = H * 0.605;         // the horizon everything stands on
  const WOOD_NEAR = '#020407';

  let stars = null, ranges = null, woodFar = null, woodNear = null;
  let motes = null, grainTile = null, grainPat = null, built = false;

  /* ------------------------------------------------------------- scenery -- */
  function buildScenery(seed) {
    const held = WS.getSeed();
    WS.setSeed(seed === undefined ? 20260910 : seed);

    stars = [];
    for (let i = 0; i < 220; i++) {
      stars.push({ x: WS.random() * W, y: WS.random() * GROUND * 0.94,
        r: 0.35 + WS.random() * 1.25, tw: WS.random() * WS.TAU,
        // a handful are noticeably brighter, which is what makes the rest read
        // as a field rather than as evenly scattered dots
        big: WS.random() < 0.06 });
    }

    /* THREE ranges, not one wandering line.
     *
     * The first version walked a single polyline left to right with a random
     * step, which makes lumps rather than mountains, and filled it with one
     * flat colour darker than the sky. A dark unbroken mass along the bottom
     * of a vignetted frame does not read as distance - it reads as the mouth
     * of a cave, which is exactly what it was called.
     *
     * Two things fix that and both are about air. Real ranges are cut into
     * peaks and valleys with sky between them, so these alternate peak,
     * valley, peak. And distant land is LIGHTER and lower in contrast than
     * near land, never darker, because there are miles of atmosphere in front
     * of it - so each range is filled with a gradient palest at its base,
     * where the haze pools, and the far range is paler than the near one.
     * Value going the wrong way is what makes a hill look like a wall. */
    ranges = [
      buildRange(7, 92, 152, 0.34),
      buildRange(9, 58, 104, 0.30),
      buildRange(11, 40, 86, 0.26),
    ];

    /* Two woods at two distances, and the numbers have to be far enough apart
       to BE two distances. They were 26-54 and 46-92, which overlap, so the
       parallax moved two bands of the same tree past each other and read as
       one wood sliding oddly. */
    const band = (n, spread, hMin, hMax) => {
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
    woodFar = band(40, 4, 18, 38);
    woodNear = band(18, 14, 74, 138);

    // Ambient embers, drifting on their own loops so nothing pulses in unison.
    motes = [];
    for (let i = 0; i < 70; i++) {
      motes.push({ x: WS.random() * W, y: WS.random() * GROUND,
        r: 0.7 + WS.random() * 1.6, sp: 6 + WS.random() * 22,
        sway: 10 + WS.random() * 34, ph: WS.random() * WS.TAU,
        life: WS.random() });
    }

    grainTile = buildGrain();
    built = true;
    WS.setSeed(held);            // hand the stream back exactly as it was
  }

  function ensure() { if (!built) buildScenery(); }

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

  /** One range: `peaks` summits between `hiMin` and `hiMax` above the horizon,
   *  with a valley cut between each pair. `slack` is how far a summit may
   *  wander off its even spacing, so the spacing does not read as a comb. */
  function buildRange(peaks, hiMin, hiMax, slack) {
    const pts = [];
    const step = (W + 200) / peaks;
    for (let i = 0; i <= peaks; i++) {
      const h = hiMin + WS.random() * (hiMax - hiMin);
      const x = -100 + i * step + (WS.random() - 0.5) * step * slack;
      pts.push({ x, y: GROUND - h });
      if (i < peaks) {
        pts.push({ x: x + step * (0.42 + WS.random() * 0.24),
          y: GROUND - h * (0.24 + WS.random() * 0.30) });
      }
    }
    return pts;
  }

  const RANGE_NIGHT = [
    ['#0a0f1c', '#131a2b'],
    ['#06090f', '#0b111c'],
    ['#030509', '#06090f'],
  ];

  const RANGE_DAWN = [
    ['#4a3550', '#8f6668'],
    ['#251a2e', '#402a3a'],
    ['#0c0810', '#150e1a'],
  ];

  function ridgeline(ctx, lift) {
    ctx.save();
    for (let i = 0; i < ranges.length; i++) {
      const pts = ranges[i];
      let top = GROUND;
      for (const p of pts) if (p.y < top) top = p.y;
      const [tn, bn] = RANGE_NIGHT[i], [td, bd] = RANGE_DAWN[i];
      const g = ctx.createLinearGradient(0, top, 0, GROUND + 4);
      g.addColorStop(0, lift > 0 ? mix(tn, td, lift) : tn);
      g.addColorStop(1, lift > 0 ? mix(bn, bd, lift) : bn);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-100, GROUND + 8);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.lineTo(W + 100, GROUND + 8);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  const WOOD_FAR = '#0a1120';

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
  function sunrise(ctx, light) {
    /* The glow arrives before the disc does. Holding the sun back until the
       sky has already been warming for a while is the difference between a
       sunrise and a light being switched on. */
    const k = WS.clamp((light - 0.30) / 0.70, 0, 1);
    if (k <= 0.001) return;
    const y = GROUND + 66 - 134 * ease(k), r = 78;
    ctx.save();
    /* Five stops on a smooth decay, not two and a kink.
     *
     * With a single mid stop at 45% the falloff changed slope there, and a
     * change of slope in a gradient is a mach band - a soft arc appeared
     * across the sky at exactly 225px from the sun, and it read as the edge of
     * something rather than as light. */
    const halo = ctx.createRadialGradient(W * 0.5, y, r * 0.5, W * 0.5, y, r * 6.4);
    halo.addColorStop(0.00, `rgba(255,199,116,${(0.42 * k).toFixed(3)})`);
    halo.addColorStop(0.18, `rgba(255,178,96,${(0.26 * k).toFixed(3)})`);
    halo.addColorStop(0.38, `rgba(255,158,80,${(0.14 * k).toFixed(3)})`);
    halo.addColorStop(0.62, `rgba(250,140,72,${(0.06 * k).toFixed(3)})`);
    halo.addColorStop(0.82, `rgba(240,128,68,${(0.02 * k).toFixed(3)})`);
    halo.addColorStop(1.00, 'rgba(240,128,68,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(W * 0.5, y, r * 6.4, 0, WS.TAU); ctx.fill();

    ctx.restore();
    // What the sun puts on the floor in front of it. The bottom third of a
    // dawn frame was the emptiest part of the picture.
    ctx.save();
    ctx.globalAlpha = 0.5 * k;
    const floor = ctx.createRadialGradient(W * 0.5, GROUND, 0, W * 0.5, GROUND, W * 0.42);
    floor.addColorStop(0.00, 'rgba(255,186,104,.30)');
    floor.addColorStop(0.35, 'rgba(255,166,92,.16)');
    floor.addColorStop(0.68, 'rgba(250,146,80,.05)');
    floor.addColorStop(1.00, 'rgba(250,146,80,0)');
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.ellipse(W * 0.5, GROUND + 4, W * 0.42, (H - GROUND) * 0.86, 0, 0, WS.TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(-40, -40, W + 80, GROUND + 40); ctx.clip();
    const disc = ctx.createRadialGradient(W * 0.5, y, 0, W * 0.5, y, r);
    disc.addColorStop(0, `rgba(255,246,222,${(0.96 * k).toFixed(3)})`);
    disc.addColorStop(0.7, `rgba(255,206,126,${(0.90 * k).toFixed(3)})`);
    disc.addColorStop(1, `rgba(255,168,84,${(0.55 * k).toFixed(3)})`);
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(W * 0.5, y, r, 0, WS.TAU); ctx.fill();
    ctx.restore();
  }

  /* ------------------------------------------------------------- figure -- *
   * A survivor standing on the horizon.
   *
   * This was the prologue's `watcher`, which drew one hard-coded warrior. It
   * takes an id and a tint now because the victory cinematic stars whichever
   * of the ten the player actually ran, and because the roster at the end of
   * the prologue needs the same drawing for nine other people.
   *
   *   id, tint   which survivor, in which colour
   *   x, size    where on the horizon, and how big
   *   carry      how much ember they are holding, 0 to 1 - the warm pool
   *   alpha      overall opacity, shadow included
   *   backlit    0 draws them lit, 1 draws them as a shape against the light
   *   frame      a walk-cycle frame, or undefined for standing
   */
  function figure(ctx, o) {
    const size = o.size, x = o.x, carry = o.carry || 0;
    const foot = o.foot === undefined ? GROUND : o.foot;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = WS.clamp(o.alpha, 0, 1);
    if (carry > 0.02) {
      const r = size * (0.8 + 1.0 * carry);
      const cy = foot - size * 0.42;
      const g = ctx.createRadialGradient(x, cy, 0, x, cy, r);
      g.addColorStop(0, `rgba(245,197,107,${(0.32 * carry).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(245,197,107,${(0.10 * carry).toFixed(3)})`);
      g.addColorStop(1, 'rgba(245,197,107,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, cy, r, 0, WS.TAU); ctx.fill();
      // and what it throws on the floor
      ctx.save();
      ctx.globalAlpha *= 0.55 * carry;
      const pool = ctx.createRadialGradient(x, foot + 3, 0, x, foot + 3, size * 0.9);
      pool.addColorStop(0, 'rgba(245,197,107,.34)');
      pool.addColorStop(1, 'rgba(245,197,107,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.ellipse(x, foot + 3, size * 0.9, size * 0.2, 0, 0, WS.TAU); ctx.fill();
      ctx.restore();
    }
    /* The contact shadow, soft-edged. A flat black ellipse was fine on a black
       floor and reads as a hole punched in a lit one. */
    ctx.save();
    ctx.globalAlpha *= 0.62;     // multiply, so a fading figure fades its shadow too
    const sh = ctx.createRadialGradient(x, foot + 3, 0, x, foot + 3, size * 0.30);
    sh.addColorStop(0, 'rgba(0,0,0,.62)');
    sh.addColorStop(0.6, 'rgba(0,0,0,.34)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(x, foot + 3, size * 0.30, size * 0.085, 0, 0, WS.TAU);
    ctx.fill();
    ctx.restore();

    const sprite = WS.Sprites.hero(o.id || 'warrior', o.tint || [0.96, 0.77, 0.42],
      WS.round(size), false, o.frame);
    const back = o.backlit || 0;
    const top = foot - size + size * 0.06;
    if (back > 0.02) {
      ctx.drawImage(flood(sprite, 'rgba(12,10,14,0.96)'), x - size / 2, top, size, size);
      if (back < 0.99) {
        ctx.save();
        ctx.globalAlpha *= 1 - back;
        ctx.drawImage(sprite, x - size / 2, top, size, size);
        ctx.restore();
      }
    } else {
      ctx.drawImage(sprite, x - size / 2, top, size, size);
    }
    /* A rim in their own colour, drawn a few percent larger and behind, so all
       that shows is an edge. Two drawImages and no compositing tricks, and it
       is what stops a dark shape against a sunrise from being a dark shape. */
    if (o.rim > 0.01 && o.tint) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.globalAlpha *= o.rim;
      const rs = size * 1.07, ro = (rs - size) / 2;
      ctx.drawImage(flood(sprite, `rgba(${rgbOf(o.tint)},1)`),
        x - rs / 2, top - ro, rs, rs);
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- API -- */
  const Scene = {
    W, H, GROUND,
    mix, ease, rgbOf, flood, figure,
    creature: creatureSil,
    ensure,
    build: buildScenery,

    sky(ctx, t, lift) { ensure(); sky(ctx, t, lift); },
    ranges(ctx, lift) { ensure(); ridgeline(ctx, lift); },
    ground(ctx, lift) { ensure(); ground(ctx, lift); },
    mist(ctx, t, lift) { ensure(); mist(ctx, t, lift); },
    drift(ctx, t, amount, warm) { ensure(); drift(ctx, t, amount, warm); },
    sunrise(ctx, light) { sunrise(ctx, light); },

    /* The two tree bands, by lift rather than by colour, so a caller cannot
       put the far wood in front of the near one by getting the palette the
       wrong way round. The far wood stands in the same haze the far range
       does; the near wood is the closest thing in the frame and stays black. */
    woodFar(ctx, lift) {
      ensure();
      wood(ctx, woodFar, lift > 0 ? mix(WOOD_FAR, '#3a2432', lift) : WOOD_FAR);
    },
    woodNear(ctx, lift) {
      ensure();
      wood(ctx, woodNear, lift > 0 ? mix(WOOD_NEAR, '#150c14', lift) : WOOD_NEAR);
    },

    /* Film grain, re-offset every frame. One tile, one draw.
     *
     * Math.random, deliberately, and not the game's WS.random: the grain is
     * the one thing here that must NOT be reproducible, and burning a hundred
     * and twenty draws a second off a stream the rest of the game plays from
     * would be a strange thing for a title sequence to do. The pattern is
     * built once - createPattern allocates, and this runs every frame. */
    grain(ctx, alpha) {
      ensure();
      if (!grainTile) return;
      if (!grainPat || grainPat.ctx !== ctx) {
        grainPat = { ctx, pat: ctx.createPattern(grainTile, 'repeat') };
      }
      ctx.save();
      ctx.globalAlpha = alpha === undefined ? 0.032 : alpha;
      ctx.globalCompositeOperation = 'overlay';
      ctx.translate(-WS.floor(Math.random() * 128), -WS.floor(Math.random() * 128));
      ctx.fillStyle = grainPat.pat;
      ctx.fillRect(0, 0, W + 128, H + 128);
      ctx.restore();
    },

    /* Past dawn, into morning.
     *
     * The sky here tops out at the colour of a sun on the horizon, because the
     * prologue ends the moment the sun arrives and has no use for anything
     * later. The victory piece runs on past that: it has to land on daylight,
     * and a victory that ends on the same dusky orange it started breaking
     * into has not gone anywhere. This lifts the whole frame toward a pale
     * morning - blue at the top, warm at the horizon - and it is applied over
     * the far landscape but under whatever is standing in front of it, so the
     * survivor keeps their contrast while the world behind them goes light. */
    day(ctx, k) {
      if (k <= 0.001) return;
      const g = ctx.createLinearGradient(0, -40, 0, GROUND);
      g.addColorStop(0, `rgba(122,158,208,${(0.50 * k).toFixed(3)})`);
      g.addColorStop(0.55, `rgba(196,186,196,${(0.36 * k).toFixed(3)})`);
      g.addColorStop(1, `rgba(255,224,176,${(0.40 * k).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(-40, -40, W + 80, GROUND + 42);
      const f = ctx.createLinearGradient(0, GROUND, 0, H);
      f.addColorStop(0, `rgba(226,196,158,${(0.34 * k).toFixed(3)})`);
      f.addColorStop(1, `rgba(150,124,104,${(0.10 * k).toFixed(3)})`);
      ctx.fillStyle = f;
      ctx.fillRect(-40, GROUND, W + 80, H - GROUND + 40);
    },

    /* A vignette closes the frame: this is a scene, not a screen. Light,
       because a heavy one over a dark mass along the horizon is how a
       landscape turns into a cave mouth. */
    vignette(ctx, strength) {
      const s = strength === undefined ? 1 : strength;
      const v = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.34, W / 2, H * 0.44, H * 0.94);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(0.62, `rgba(0,0,0,${(0.16 * s).toFixed(3)})`);
      v.addColorStop(1, `rgba(0,0,0,${(0.62 * s).toFixed(3)})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    },

    /* The camera never stops moving, and it never starts over.
     *
     * It used to take a scene index and that scene's own progress, which meant
     * it pushed in across a scene and SNAPPED back at the cut - one hard reset
     * per boundary. Measured by stepping a piece at 15fps and diffing
     * consecutive frames, the night-to-night boundary, where nothing else in
     * the picture changes at all, moved the frame four times as much as a
     * typical step. That was the camera and nothing else.
     *
     * It is a function of absolute time, on periods long enough that no cycle
     * repeats inside a running time. Both halves of a cross-dissolve are drawn
     * at the same t, so they share it exactly and a dissolve is purely a
     * change of content. */
    camera(ctx, t) {
      const zoom = 1.018 + 0.030 * (t / 60) + 0.004 * WS.sin(t * 0.11);
      const panX = 16 * WS.sin(t * 0.055) + 6 * WS.sin(t * 0.017 + 1.7);
      const panY = -3 * WS.sin(t * 0.043);
      ctx.translate(W / 2 + panX, GROUND + panY);
      ctx.scale(zoom, zoom);
      ctx.translate(-W / 2, -GROUND);
    },
  };

  WS.Scene = Scene;

})(window.WS);
