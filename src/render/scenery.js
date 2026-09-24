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

    /* o.rank carries the survivor's earned kit into the scene.
       Without it every staged figure was drawn at rank 0, which is right for
       the prologue - nobody has earned anything yet - and wrong for the
       victory, where the one moment the game stops to look at the survivor
       showed them exactly as they set out. */
    const sprite = WS.Sprites.hero(o.id || 'warrior', o.tint || [0.96, 0.77, 0.42],
      WS.round(size), false, o.frame, null, o.rank || 0);
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

  /* ------------------------------------------------------- the villains -- *
   * The two pictures the prologue grew when it started naming its enemies.
   * Both are painted over a cut's own night, so the two cuts share them:
   * `back` goes between the sky and the land, `front` over everything but
   * the near wood. k runs 0 -> 1 across the scene.
   *
   * THE THIEF: out on the far ridge, a drilling rig with a lamp on it, and
   * the ember coming up out of the ground and into its tank instead of into
   * anybody's hands. Grimtunnel is never shown full-size here - he is a
   * lantern-eyed shape beside his machine - because the first boss fight is
   * where you meet him. */
  function thiefFront(ctx, t, k) {
    const bx = W * 0.70, by = GROUND + 30;
    const h = 230, spread = 70;
    ctx.save();
    /* The sky over the dig is the wrong colour: a sick red haze under the
       lamp, and smoke going up out of it into the stars. */
    const haze = ctx.createRadialGradient(bx, by - h * 0.6, 20, bx, by - h * 0.6, 420);
    haze.addColorStop(0, `rgba(150,40,20,${(0.18 + 0.10 * k).toFixed(3)})`);
    haze.addColorStop(1, 'rgba(150,40,20,0)');
    ctx.fillStyle = haze;
    ctx.beginPath(); ctx.arc(bx, by - h * 0.6, 420, 0, WS.TAU); ctx.fill();
    for (let i = 0; i < 9; i++) {
      const p = ((t * 0.06) + i / 9) % 1;
      const x = bx + 10 + p * 160 + WS.sin(t * 0.5 + i) * 14;
      const y = by - h - 10 - p * 260;
      ctx.globalAlpha = (1 - p) * 0.55;
      ctx.fillStyle = '#0b0a0d';
      ctx.beginPath(); ctx.arc(x, y, 18 + p * 46, 0, WS.TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* THE GRAVES. What he is digging up is the dead: a row of headstones on
       the ridge, split and toppled, each with its light being dragged out of
       it in a thin green thread toward the drill. */
    const stones = [[-330, 0.00, 1], [-268, -0.30, 0], [-205, 0.22, 1], [-150, -0.08, 0], [-392, 0.55, 0]];
    for (let i = 0; i < stones.length; i++) {
      const [dx, tilt, split] = stones[i];
      const sx = bx + dx, sy = by + 6;
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(tilt);
      ctx.fillStyle = '#0a0c12';
      ctx.beginPath();
      ctx.moveTo(-11, 0); ctx.lineTo(-11, -26); ctx.quadraticCurveTo(0, -38, 11, -26);
      ctx.lineTo(11, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(160,150,140,.18)'; ctx.lineWidth = 1.2; ctx.stroke();
      if (split) {                                  // cracked open
        ctx.strokeStyle = 'rgba(124,240,160,.55)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-2, -33); ctx.lineTo(3, -22); ctx.lineTo(-3, -12); ctx.lineTo(2, 0); ctx.stroke();
      }
      ctx.restore();
      // the grave's light, pulled out of it and down the ridge into the drill
      const gx = sx, gy = sy - 14;
      ctx.strokeStyle = `rgba(124,240,160,${(0.10 + 0.12 * k).toFixed(3)})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo((gx + bx) / 2, gy - 40 - i * 8, bx, by + 4); ctx.stroke();
      for (let j = 0; j < 5; j++) {
        const q = ((t * 0.35) + j / 5 + i * 0.13) % 1;
        const mx = gx + (bx - gx) * q;
        const my = gy + (by + 4 - gy) * q - WS.sin(q * WS.PI) * (40 + i * 8) * (1 - Math.abs(q - 0.5));
        ctx.globalAlpha = WS.sin(q * WS.PI) * 0.9;
        ctx.fillStyle = '#9dffbe';
        ctx.beginPath(); ctx.arc(mx, my, 2.2, 0, WS.TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // and a grave-glow where it is coming from, going out as it drains
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 26);
      gg.addColorStop(0, `rgba(124,240,160,${(0.30 * (1 - k * 0.6)).toFixed(3)})`);
      gg.addColorStop(1, 'rgba(124,240,160,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, gy, 26, 0, WS.TAU); ctx.fill();
    }

    // the rig: two legs, a crossbar, a wheel turning at the top
    ctx.strokeStyle = '#05070c'; ctx.fillStyle = '#05070c';
    ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx - spread, by); ctx.lineTo(bx, by - h); ctx.lineTo(bx + spread, by);
    ctx.moveTo(bx - spread * 0.55, by - h * 0.45); ctx.lineTo(bx + spread * 0.55, by - h * 0.45);
    ctx.stroke();
    const wr = 24, wy = by - h - 4, spin = t * 2.4;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx, wy, wr, 0, WS.TAU); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = spin + i * WS.PI / 3;
      ctx.beginPath(); ctx.moveTo(bx, wy);
      ctx.lineTo(bx + WS.cos(a) * wr, wy + WS.sin(a) * wr); ctx.stroke();
      // teeth on the wheel
      ctx.beginPath();
      ctx.moveTo(bx + WS.cos(a) * wr, wy + WS.sin(a) * wr);
      ctx.lineTo(bx + WS.cos(a + 0.12) * (wr + 7), wy + WS.sin(a + 0.12) * (wr + 7)); ctx.stroke();
    }
    // trophies: cages of stolen ember hung off the crossbar on chains
    for (const [cx0, drop] of [[-0.42, 36], [0.38, 52]]) {
      const cx1 = bx + cx0 * spread, cy0 = by - h * 0.45;
      const sway = WS.sin(t * 1.3 + cx0 * 7) * 4;
      ctx.strokeStyle = '#05070c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx1, cy0); ctx.lineTo(cx1 + sway, cy0 + drop); ctx.stroke();
      const cg = ctx.createRadialGradient(cx1 + sway, cy0 + drop + 9, 0, cx1 + sway, cy0 + drop + 9, 22);
      cg.addColorStop(0, 'rgba(124,240,160,.55)'); cg.addColorStop(1, 'rgba(124,240,160,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx1 + sway, cy0 + drop + 9, 22, 0, WS.TAU); ctx.fill();
      ctx.strokeStyle = '#05070c'; ctx.lineWidth = 1.6;
      ctx.strokeRect(cx1 + sway - 6, cy0 + drop, 12, 18);
      ctx.beginPath(); ctx.moveTo(cx1 + sway, cy0 + drop); ctx.lineTo(cx1 + sway, cy0 + drop + 18); ctx.stroke();
    }
    // the lamp's light caught on the legs, so the rig is a shape and not a gap
    const lampLit = 0.55 + 0.25 * WS.sin(t * 5);
    ctx.strokeStyle = `rgba(255,150,80,${(0.5 * lampLit).toFixed(3)})`; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(bx + 2, by - h + 4); ctx.lineTo(bx + spread + 2, by);
    ctx.moveTo(bx - 1, by - h + 4); ctx.lineTo(bx - spread + 3, by);
    ctx.moveTo(bx - spread * 0.55, by - h * 0.45 - 3); ctx.lineTo(bx + spread * 0.55, by - h * 0.45 - 3);
    ctx.stroke();
    // the drill itself, biting into the ground under the rig
    const bite = (t * 7) % 1;
    ctx.strokeStyle = '#05070c'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(bx, by - h * 0.45); ctx.lineTo(bx, by + 12); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,150,80,.4)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const y = by - h * 0.4 + ((i / 5 + bite) % 1) * h * 0.42;
      ctx.beginPath(); ctx.moveTo(bx - 4, y); ctx.lineTo(bx + 4, y + 5); ctx.stroke();
    }
    for (let i = 0; i < 9; i++) {                 // sparks where it bites
      const a = -WS.PI / 2 + (i - 4) * 0.33 + WS.sin(t * 13 + i) * 0.2;
      const r = 6 + ((t * 40 + i * 7) % 26);
      ctx.fillStyle = `rgba(255,${150 + i * 10},90,${(1 - r / 32).toFixed(3)})`;
      ctx.fillRect(bx + WS.cos(a) * r, by + 8 + WS.sin(a) * r * 0.6, 2, 2);
    }
    // the tank the light goes into: glass, and filling
    const tw = 60, th = 54, tx = bx + spread + 18, ty = by - th;
    const round = (x, y, w, hh, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + hh - r); ctx.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh);
      ctx.lineTo(x + r, y + hh); ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    };
    ctx.fillStyle = '#070a12'; round(tx - 3, ty - 3, tw + 6, th + 6, 10); ctx.fill();
    const fill = 0.25 + 0.6 * k;
    const fh = (th - 8) * fill;
    ctx.save();
    round(tx + 3, ty + 3, tw - 6, th - 6, 7); ctx.clip();
    const lg = ctx.createLinearGradient(0, ty + th - fh, 0, ty + th);
    lg.addColorStop(0, 'rgba(160,255,190,.85)'); lg.addColorStop(1, 'rgba(60,170,100,.8)');
    ctx.fillStyle = lg; ctx.fillRect(tx, ty + th - 4 - fh, tw, fh + 4);
    for (let i = 0; i < 6; i++) {                 // it bubbles
      const bp = ((t * 0.6) + i / 6) % 1;
      ctx.fillStyle = `rgba(230,255,235,${(0.7 * (1 - bp)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(tx + 10 + (i * 9) % (tw - 20), ty + th - 6 - bp * fh, 1.6, 0, WS.TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(tx + 7, ty + 5, 5, th - 12);
    ctx.restore();
    const tank = ctx.createRadialGradient(tx + tw / 2, ty + th / 2, 4, tx + tw / 2, ty + th / 2, 70);
    tank.addColorStop(0, 'rgba(124,240,160,.22)'); tank.addColorStop(1, 'rgba(124,240,160,0)');
    ctx.fillStyle = tank; ctx.beginPath(); ctx.arc(tx + tw / 2, ty + th / 2, 70, 0, WS.TAU); ctx.fill();
    ctx.strokeStyle = '#05070c'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(bx + 4, by - h * 0.3);
    ctx.quadraticCurveTo(bx + spread + 10, by - h * 0.38, tx + tw / 2, ty - 1); ctx.stroke();
    // the lamp: harsh, hot, the colour of a furnace door
    const lamp = 0.7 + 0.3 * WS.sin(t * 5);
    const g = ctx.createRadialGradient(bx, wy, 0, bx, wy, 170);
    g.addColorStop(0, `rgba(255,140,70,${(0.55 * lamp).toFixed(3)})`);
    g.addColorStop(0.4, `rgba(200,60,30,${(0.18 * lamp).toFixed(3)})`);
    g.addColorStop(1, 'rgba(200,60,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, wy, 170, 0, WS.TAU); ctx.fill();
    ctx.fillStyle = '#ffd0a0';
    ctx.beginPath(); ctx.arc(bx, wy, 5, 0, WS.TAU); ctx.fill();
    // and the one working it: a lantern for a face, and a pick over his shoulder
    const fx = bx - spread - 44, size = 74;
    const sil = creatureSil('lampling', size, '#05070c');
    ctx.drawImage(sil, fx - size / 2, by - size * 0.9, size, size);
    ctx.strokeStyle = '#05070c'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(fx + 8, by - size * 0.35); ctx.lineTo(fx + 26, by - size * 0.95); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(fx + 12, by - size * 0.98); ctx.quadraticCurveTo(fx + 27, by - size * 1.06, fx + 40, by - size * 0.9); ctx.stroke();
    const eyeA = 0.75 + 0.25 * WS.sin(t * 3.3);
    for (const ex of [-6, 6]) {
      const eg = ctx.createRadialGradient(fx + ex, by - size * 0.55, 0, fx + ex, by - size * 0.55, 9);
      eg.addColorStop(0, `rgba(255,170,80,${eyeA.toFixed(3)})`); eg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(fx + ex, by - size * 0.55, 9, 0, WS.TAU); ctx.fill();
      ctx.fillStyle = '#ffe2b0'; ctx.beginPath(); ctx.arc(fx + ex, by - size * 0.55, 2.4, 0, WS.TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* THE PALE: north, past every range, the cold rises into the sky and there
   * is a shape in it. Every mote of ember in the land is drifting toward it.
   * He is never lit - two pale eyes and an outline against an aurora - and he
   * grows into the frame across the scene, the way something you did not see
   * at first turns out to have been there the whole time. */
  let paleCache = null;
  let paleAt = null;      // where on the screen a point on him is, for the motes
  function paleBack(ctx, t, k) {
    ctx.save();
    // the cold, washing down the sky
    const wash = ctx.createLinearGradient(0, 0, 0, GROUND);
    wash.addColorStop(0, `rgba(120,170,230,${(0.04 + 0.05 * k).toFixed(3)})`);
    wash.addColorStop(1, 'rgba(120,170,230,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, GROUND);
    // aurora: three slow ribbons
    for (let r = 0; r < 3; r++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) {
        const y = 90 + r * 38 + WS.sin(x * 0.004 + t * 0.35 + r * 1.7) * 30
          + WS.sin(x * 0.011 - t * 0.2 + r) * 10;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(150,230,210,${(0.045 + 0.03 * k).toFixed(3)})`;
      ctx.lineWidth = 26 - r * 6;
      ctx.stroke();
    }
    /* The night goes out around him. Stars near him are swallowed by a dark
       that spreads from where he stands, and the moon frosts over and dies:
       whatever light there was, he is taking it. */
    const hx = W * 0.5, hy = GROUND - 200;
    const swallow = ctx.createRadialGradient(hx, hy, 40, hx, hy, 260 + 520 * k);
    swallow.addColorStop(0, `rgba(1,2,5,${(0.35 + 0.45 * k).toFixed(3)})`);
    swallow.addColorStop(0.7, `rgba(1,2,5,${(0.18 + 0.3 * k).toFixed(3)})`);
    swallow.addColorStop(1, 'rgba(1,2,5,0)');
    ctx.fillStyle = swallow;
    ctx.fillRect(0, 0, W, GROUND);
    const mx = W * 0.185, my = GROUND * 0.30;
    const frostMoon = WS.clamp(k * 1.3, 0, 1);
    ctx.fillStyle = `rgba(8,14,26,${(0.25 + 0.7 * frostMoon).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(mx, my, 40, 0, WS.TAU); ctx.fill();
    // a thin cold ring where its edge was - a dead moon, not a missing one
    ctx.strokeStyle = `rgba(170,220,255,${(0.28 * frostMoon).toFixed(3)})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(mx, my, 40, 0, WS.TAU); ctx.stroke();

    // him, beyond the ranges: his own figure, deep in shadow, lit from behind
    // Baked once at full size and drawn scaled: he grows every frame.
    const size = 380 + 90 * k;
    if (!paleCache) {
      const full = WS.Sprites.creature('marrowfrost', [0.62, 0.88, 1.0], 470);
      const c = document.createElement('canvas');
      c.width = full.width; c.height = full.height;
      const cg = c.getContext('2d');
      cg.drawImage(full, 0, 0);
      cg.globalCompositeOperation = 'source-atop';
      const shade = cg.createLinearGradient(0, 0, 0, c.height);
      shade.addColorStop(0, 'rgba(6,12,26,.62)');
      shade.addColorStop(1, 'rgba(4,8,16,.9)');
      cg.fillStyle = shade; cg.fillRect(0, 0, c.width, c.height);
      paleCache = { img: c };
    }
    const cx = W * 0.5, foot = GROUND + 10;
    const left = cx - size / 2, top = foot - size * 0.94;
    const at = (ux, uy) => [left + ux / 100 * size, top + uy / 100 * size];
    paleAt = at;
    ctx.globalAlpha = 0.35 + 0.6 * k;
    ctx.drawImage(paleCache.img, left, top, size, size);
    // what is still lit in the dark: the eyes first, then the stolen light
    ctx.globalCompositeOperation = 'lighter';
    const burn = (ux, uy, r, rgb, a) => {
      const [x, y] = at(ux, uy);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, WS.TAU); ctx.fill();
    };
    const eye = WS.clamp(0.35 + k * 1.2, 0, 1) * (0.8 + 0.2 * WS.sin(t * 1.3));
    ctx.globalAlpha = 1;
    burn(50 - 2.7, 29, size * 0.035, '200,236,255', 0.95 * eye);
    burn(50 + 2.7, 29, size * 0.035, '200,236,255', 0.95 * eye);
    // and when he has seen you, they flare: a glare that crosses the sky
    const glare = WS.clamp((k - 0.45) / 0.55, 0, 1);
    if (glare > 0.01) {
      for (const ex of [-2.7, 2.7]) {
        const [x, y] = at(50 + ex, 29);
        const len = 60 + 520 * glare * glare;
        const gl = ctx.createLinearGradient(x - len, y, x + len, y);
        gl.addColorStop(0, 'rgba(180,225,255,0)');
        gl.addColorStop(0.5, `rgba(210,240,255,${(0.55 * glare).toFixed(3)})`);
        gl.addColorStop(1, 'rgba(180,225,255,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(x - len, y - 1.2, len * 2, 2.4);
        burn(50 + ex, 29, size * (0.035 + 0.05 * glare), '160,215,255', 0.5 * glare);
      }
    }
    const hoard = 0.5 + 0.5 * k;
    burn(50, 49, size * 0.09, '124,240,160', 0.55 * hoard * (0.85 + 0.15 * WS.sin(t * 2.1)));
    burn(21, 13, size * 0.07, '124,240,160', 0.45 * hoard);
    burn(50, 21.7, size * 0.04, '124,240,160', 0.45 * hoard);
    ctx.restore();
  }
  function paleFront(ctx, t, k) {
    ctx.save();
    /* The frost comes for you. Cracks open across the land from under him
       and run toward the camera, glowing, further every second. */
    const ox = W * 0.5, oy = GROUND + 4;
    const reach = 60 + 360 * k;
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const spread = (i - 4) * 0.34;
      let x = ox + (i - 4) * 14, y = oy, len = 0;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 14 && len < reach; j++) {
        const jag = WS.sin(i * 7.1 + j * 2.3) * 0.5;
        const a = WS.PI / 2 + spread + jag;
        const step = 24 + (j % 3) * 6;
        x += WS.cos(a) * step * 1.4; y += WS.sin(a) * step * 0.28;
        len += step;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(150,215,255,.12)'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = `rgba(200,238,255,${(0.35 + 0.35 * k).toFixed(3)})`; ctx.lineWidth = 1.6; ctx.stroke();
    }
    // every light in the land, drifting north - into the ember in his chest
    const [cx, ty] = paleAt ? paleAt(50, 49) : [W * 0.5, GROUND - 200];
    const pull = 0.12 + 0.18 * k;
    for (let i = 0; i < 36; i++) {
      const p = ((t * pull) + i / 36) % 1;
      const sx = (i * 97) % W, sy = GROUND + 30 + (i % 5) * 14;
      const x = sx + (cx - sx) * p * p;
      const y = sy + (ty - sy) * p;
      ctx.globalAlpha = (1 - p) * 0.8 * (0.4 + 0.6 * k);
      ctx.fillStyle = '#7cf0a0';
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, WS.TAU); ctx.fill();
    }
    // snow, falling slantwise
    ctx.fillStyle = '#dfefff';
    for (let i = 0; i < 70; i++) {
      const x = ((i * 131 + t * 38) % (W + 40)) - 20;
      const y = ((i * 71 + t * (26 + (i % 5) * 7)) % (H + 20)) - 10;
      ctx.globalAlpha = 0.25 + (i % 4) * 0.12;
      ctx.fillRect(x, y, 2, 2);
    }
    /* A heartbeat at the edges of the frame: two beats, a rest. Not his -
       yours, the moment you are told his name. */
    ctx.globalAlpha = 1;
    const ph = (t * 0.9) % 1;
    const beat = WS.max(0, 1 - Math.abs(ph - 0.05) / 0.06) + 0.7 * WS.max(0, 1 - Math.abs(ph - 0.22) / 0.06);
    const vig = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.35, W / 2, H * 0.45, H * 0.95);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,2,8,${(0.45 + 0.25 * k + 0.12 * beat * k).toFixed(3)})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
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
    thief(ctx, t, k) { ensure(); thiefFront(ctx, t, k); },
    paleBack(ctx, t, k) { ensure(); paleBack(ctx, t, k); },
    paleFront(ctx, t, k) { ensure(); paleFront(ctx, t, k); },

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
