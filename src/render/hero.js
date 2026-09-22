/* The survivor.
 *
 * This is the most-looked-at drawing in the game: it is on screen for every
 * frame of every run, in the roster tile you pick from, and in the HUD
 * portrait beside your health. It is drawn from scratch here, on its own, so
 * that it can be judged and changed as one thing.
 *
 * THREE RULES DECIDE EVERYTHING BELOW.
 *
 * 1. THE SILHOUETTE CARRIES THE CHARACTER. At the size it is actually played
 *    - a 34px figure among a hundred enemies - nobody reads a face. They read
 *    an outline. So the classes differ first in shape (a hooded slip of a
 *    rogue, a horned ruinseeker, a paladin twice as wide at the shoulder) and
 *    only then in detail, and every part of the rig exists to make that
 *    outline legible against a dark, busy ground.
 *
 * 2. THE TINT IS AN ACCENT, NOT A UNIFORM. Each survivor carries an identity
 *    colour that also drives their HUD. Painting the whole body in it was the
 *    old approach and it fails at both ends of the range: the priest is
 *    [1,1,1], so she was a white blob with no interior form at all, and the
 *    shaman is a saturated [0,0.44,0.87] whose shaded side is nearly the
 *    colour of the ground he stands on. Here the body is built from a
 *    controlled neutral ramp - obsidian cloth, warm leather, cold steel - and
 *    the tint appears where a colour should appear: cloak, tabard, gem, eyes,
 *    the light on the weapon. Everyone is readable, everyone is still
 *    instantly theirs.
 *
 * 3. LIGHT COMES FROM ONE PLACE. Up and to the left, warm, the same for every
 *    surface, plus a gold rim along the lit edges and a cool bounce beneath.
 *    Flat fills read as clip-art; one consistent light is most of what
 *    separates a drawing from a diagram. The rim is not painted shape by
 *    shape - it is taken from the finished silhouette, so it is exactly
 *    correct for every class and costs the same for all of them.
 *
 * The rig is a 100-unit box. The feet plant at y=88, which is the anchor the
 * renderer and the portrait both align to; nothing here may move it. */
'use strict';
(function (WS) {

  /* ------------------------------------------------------------ skeleton -- */
  /* One set of proportions, heroic-chibi: the head is a third of the figure,
   * because at 34px a realistic 1/7 head is four pixels of nothing. */
  const GROUND = 88;
  const HEAD_CY = 23, HEAD_RX = 11.5, HEAD_RY = 13;
  /* Nothing may reach the top of the box.
   *
   * The sprite is one square canvas and anything drawn past its edge is cut
   * with a straight line - which on a halo or a glow is instantly visible as a
   * flat top. Measured: the priest and paladin haloes and the mage's staff gem
   * each bled over sixty pixels into the canvas edge before this constant
   * existed. Everything tall is now placed against CEIL and the guard rail
   * fails the build if a single pixel of any survivor touches the frame. */
  const CEIL = 6;
  const NECK_Y = 34, SHOULDER_Y = 41, WAIST_Y = 60, HIP_Y = 63, FOOT_Y = 88;

  /* ------------------------------------------------------------- stride --- */
  /* THE WALK.
   *
   * Every survivor was a still image that slid across the ground and bobbed.
   * Nothing shifted its weight, nothing swung, and a figure that translates
   * without moving its legs reads as a chess piece being pushed - which is the
   * single widest gap between how this game looks and how it feels.
   *
   * It is a four-frame cycle baked into the sprite cache rather than a per-
   * frame transform, because the parts that have to move are INSIDE the
   * drawing: a leg swings from the hip, an arm counter-swings, a robe's hem
   * lags behind the body, a cloak trails. None of that can be faked by moving
   * the finished image around.
   *
   * `phase` runs 0..1 over one full stride. Everything below reads it through
   * these two numbers and nothing else, so the whole cast walks in step with
   * one rule:
   *
   *   swing  -1..1, the leading side. +1 is near-leg-forward.
   *   lift    0..1, how high the body rides - peaks at the passing positions,
   *           lowest at the two contacts, which is where the weight lands.
   */
  function stride(phase) {
    const a = phase * WS.TAU;
    // carried through so the rank embers rise with the walk, not with wall time
    return { swing: WS.sin(a), lift: WS.max(0, -WS.cos(a * 2)), phase };
  }
  const STILL = { swing: 0, lift: 0, phase: 0 };
  /** How many baked frames one cycle is cut into. */
  const FRAMES = 8;

  /* ------------------------------------------------------------- poses ---
   *
   * Two things the cast could not do: get hit, and die. A survivor who takes
   * a claw to the ribs flickered - alpha on and off for a fifth of a second -
   * and one who ran out of health simply stopped being drawn while a results
   * panel slid over the top. Nothing in the run's worst moment was in the
   * figure at all.
   *
   * Both are written as MORE OF THE SAME two numbers the walk already speaks:
   * `swing` and `lift` are read by every limb, every hem and every weapon in
   * the rig, so a negative lift is a crouch for free, on all ten survivors,
   * because they were all built to read it. What a pose adds on top is three
   * rig-unit terms the whole figure is moved by - `tilt`, `slide`, `drop` -
   * which is why a death that lands correctly for the mage lands correctly
   * for the paladin without a second drawing existing anywhere.
   *
   * Each takes k from 0 to 1 and is played exactly once.
   */
  const smooth = (t) => t * t * (3 - 2 * t);
  const POSES = {
    /* A flinch, and the recovery is the same motion in reverse - one arc, so
     * it cannot end anywhere but back where it started. */
    hurt(k) {
      const s = WS.sin(WS.clamp(k, 0, 1) * WS.PI);
      /* A crouch is a NEGATIVE lift, and the whole rig reads lift - including
         a cloak, whose hem is pinned below the waist and therefore swings out
         through the bottom of the tile long before anything else does. The
         shrink is what buys it back. */
      return { swing: -0.75 * s, lift: -5 * s, tilt: -0.22 * s,
        slide: 3 * s, drop: 0, shrink: 1 - 0.07 * s, fallen: 0 };
    },
    /* Down. To a knee first, because a figure that simply topples reads as a
     * dropped object rather than as someone who ran out - the knee is the
     * moment they try, and it is the whole difference. */
    down(k) {
      const t = WS.clamp(k, 0, 1);
      const knee = smooth(WS.min(1, t / 0.42));
      const fall = smooth(WS.clamp((t - 0.36) / 0.64, 0, 1));
      /* The slide is POSITIVE and large, and it is not a stylistic choice.
         The figure turns about its feet, so a body rotated most of the way to
         the floor puts its head sixty-odd units to one side - straight out of
         the tile it is baked into, which clipped the last four frames of the
         death to a stump. Moving the pivot back across as it goes over is what
         keeps a lying figure inside its own frame. */
      /* Three of these exist only to keep a lying figure inside a hundred-unit
         tile, and none of them is a stylistic choice.
         A survivor is about seventy-six units tall, they turn about their
         FEET, and at eighty degrees over that puts the head sixty-odd units to
         one side - straight out of the frame, which clipped the last four
         frames of the death to a stump. `slide` walks the pivot across as it
         goes; `shrink` buys back the margin a staff or a greatsword needs,
         which is the part that cannot be worked out on paper because it
         differs per survivor. */
      return {
        swing: 0.62 * knee,
        lift: -5.5 * knee - 3 * fall,
        tilt: -0.16 * knee - 1.30 * fall,
        slide: -1.5 * knee + 32 * fall,
        /* NEGATIVE on the fall, which is the opposite of the obvious. The
           figure turns about its feet, so once it is most of the way over its
           boots are the lowest thing in the tile and their own thickness hangs
           below the pivot - measured, forty units of the bottom row. Lifting
           the pivot as it goes puts the body down ON the shadow instead of
           through the floor. */
        drop: -3.5 * knee - 9 * fall,
        // The KNEE needs the margin as much as the fall does: the deepest
        // crouch is where a cloak hem is furthest below the waist.
        shrink: 1 - 0.09 * knee - 0.17 * fall,
        fallen: fall,
      };
    },
  };
  /** How many baked frames each pose is cut into. */
  const POSE_FRAMES = { hurt: 4, down: 12 };

  const BUILDS = {
    slim: { sh: 12.5, chest: 12, waist: 9, hip: 10, arm: 4.0, leg: 4.6 },
    normal: { sh: 14.5, chest: 13.5, waist: 10.5, hip: 11, arm: 4.6, leg: 5.2 },
    heavy: { sh: 19, chest: 16.5, waist: 13, hip: 12.5, arm: 5.8, leg: 6.2 },
  };

  /* ------------------------------------------------------------- colour --- */
  /* A ramp is five values off one base, lit from the same place every time.
   * Named for what they are rather than how bright: `key` is the plane facing
   * the light, `core` the body colour, `shade` the turn away, `deep` the
   * occluded underside, `line` the edge where a form meets what is behind it. */
  /* WHAT A SURFACE IS MADE OF.
   *
   * Every surface in the rig was one three-stop gradient, which is why a
   * shield, a tabard and a leather strap all read as the same soft plastic.
   * Measured as the share of interior pixels with a steep local change - the
   * only honest way to ask how much DRAWING is inside an outline, since a
   * silhouette edge is free - the cast averaged 23.3%, and the warrior, who
   * is mostly plate, was the flattest of all at 16.1%.
   *
   * A ramp now carries a material, and the shared primitives read it:
   *
   *   contact  how hard the shaded corner darkens INSIDE the shape. This is
   *            the one that matters most: without it, two overlapping panels
   *            are two flat cut-outs, and with it they are one in front of
   *            the other.
   *   spec     a narrow bright band along the lit edge. Metal has one, cloth
   *            does not, and that difference is most of what tells a
   *            pauldron from a shoulder of cloth at this size. */
  const MATERIAL = {
    cloth: { contact: 0.20, spec: 0 },
    leather: { contact: 0.26, spec: 0.10 },
    metal: { contact: 0.30, spec: 0.38 },
    skin: { contact: 0.16, spec: 0.06 },
  };

  function ramp(base, kind) {
    const m = MATERIAL[kind] || MATERIAL.cloth;
    return {
      key: WS.hex(WS.mix(base, [1, 1, 1], 0.34)),
      core: WS.hex(base),
      shade: WS.hex(WS.shade(base, 0.66)),
      deep: WS.hex(WS.shade(base, 0.40)),
      line: WS.hex(WS.shade(base, 0.22)),
      contact: m.contact,
      spec: m.spec,
    };
  }

  const CLOTH = ramp([0.30, 0.33, 0.42]);   // obsidian weave, the default garment
  const DARKCLOTH = ramp([0.17, 0.18, 0.25]); // what a hood's inside is made of
  const LEATHER = ramp([0.42, 0.30, 0.19], 'leather');
  const STEEL = ramp([0.60, 0.65, 0.75], 'metal');
  const GOLD = ramp([0.72, 0.55, 0.24], 'metal');
  const SKIN = ramp([0.80, 0.62, 0.47], 'skin');
  const WOOD = ramp([0.40, 0.29, 0.18], 'leather');

  // The one light in the scene, and the rim it throws.
  const RIM = 'rgba(245,197,107,.85)';      // arc gold, along the lit edges
  const BOUNCE = 'rgba(96,124,168,.5)';     // cold floor light, underneath

  /* ------------------------------------------------------------ drawing --- */
  /** A shaded fill: one gradient running along the light's axis, so every
   *  surface in the figure turns the same way. */
  function lit(g, r, x0, y0, x1, y1) {
    const grd = g.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, r.key);
    grd.addColorStop(0.42, r.core);
    grd.addColorStop(1, r.shade);
    g.fillStyle = grd;
    return grd;
  }

  /** A hand: a palm, a thumb, and a line where the fingers fold.
   *
   *  Every hand on the cast was a bare ellipse. At play size that is fine and
   *  at any size above it the figure is holding its weapon in a mitten - and
   *  the hands are where the eye goes, because they are where the person meets
   *  the thing they are using. Three marks fix it and none of them costs a
   *  silhouette: a thumb wedge on the side the haft is on, one crease across
   *  the knuckles, and a cuff where the sleeve or the gauntlet stops.
   *
   *  `dir` is which way the thumb points - toward the body's centre, because
   *  that is the side a held haft passes on.
   */
  function hand(g, cx, cy, rx, ry, r, dir, cuff) {
    // the thumb first, so the palm's own shading closes over its root
    g.save();
    lit(g, r, cx - dir * rx, cy - ry, cx + dir * rx, cy + ry);
    g.beginPath();
    g.moveTo(cx + dir * rx * 0.30, cy - ry * 0.62);
    g.quadraticCurveTo(cx + dir * rx * 1.42, cy - ry * 0.52,
      cx + dir * rx * 1.30, cy + ry * 0.16);
    g.quadraticCurveTo(cx + dir * rx * 1.00, cy + ry * 0.54,
      cx + dir * rx * 0.34, cy + ry * 0.44);
    g.closePath(); g.fill();
    g.restore();
    blob(g, cx, cy, rx, ry, r);
    // the fold across the knuckles, and a shorter one below it
    g.save();
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, WS.TAU); g.clip();
    g.strokeStyle = r.line;
    g.globalAlpha = 0.5; g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(cx - dir * rx * 0.9, cy - ry * 0.18);
    g.quadraticCurveTo(cx, cy - ry * 0.44, cx + dir * rx * 0.8, cy - ry * 0.22);
    g.stroke();
    g.globalAlpha = 0.34; g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(cx - dir * rx * 0.72, cy + ry * 0.36);
    g.quadraticCurveTo(cx, cy + ry * 0.16, cx + dir * rx * 0.5, cy + ry * 0.34);
    g.stroke();
    g.restore();
    if (cuff) {
      // where the sleeve stops. An arm that runs straight into a hand has no
      // wrist, and the wrist is what makes the hand read as attached.
      g.save();
      lit(g, cuff, cx - rx, cy - ry * 1.9, cx + rx, cy - ry * 0.6);
      g.beginPath();
      g.ellipse(cx - dir * rx * 0.12, cy - ry * 1.16, rx * 1.02, ry * 0.46, 0, 0, WS.TAU);
      g.fill();
      g.restore();
    }
  }

  function blob(g, cx, cy, rx, ry, r, rot) {
    g.save();
    g.translate(cx, cy);
    if (rot) g.rotate(rot);
    lit(g, r, -rx, -ry, rx * 0.8, ry);
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, WS.TAU); g.fill();
    roundInside(g, r, -rx, -ry, rx, ry);
    g.restore();
  }

  function panel(g, pts, r) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const [x, y] of pts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    lit(g, r, minX, minY, maxX, maxY);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath(); g.fill();
    shadeInside(g, r, minX, minY, maxX, maxY);
    /* AND AN EDGE.
     
       Smooth shading alone did almost nothing: measured as the share of
       interior pixels with a steep local change, adding contact gradients and
       specular to every primitive moved the cast from 23.3% to 23.6%, because
       a gradient spread over eighty pixels has no steep change anywhere in
       it. What separates a drawing from a set of cut-outs is where one thing
       STOPS and another starts, and that is a line, not a ramp. Drawn in the
       part's own darkened colour rather than in black, so it reads as the
       shape turning away rather than as an ink outline around a sticker. */
    edgeInside(g, r, 0.55, 0.7);
  }

  /** For a shape filled by a raw path rather than by panel(): give it the same
   *  material and the same edge. The weapons are all drawn this way - an axe
   *  bit is a bezier, not a polygon - so none of them picked up the material
   *  pass, and a hand-made steel crescent sat next to a pauldron that now had
   *  a specular band and looked like a different game. Call it with the shape
   *  still the current path. */
  function finish(g, r, minX, minY, maxX, maxY) {
    shadeInside(g, r, minX, minY, maxX, maxY);
    edgeInside(g, r, 0.5, 0.65);
  }

  /** An edge drawn INSIDE the shape it belongs to.
   *
   *  A plain stroke straddles the path, so half of every line lands outside
   *  the part - which grows the figure. It cost the graveblade 2px past the
   *  edge of its own tile on the seventh frame of going down, and a silhouette
   *  that changes because of a line drawn on top of it is not a silhouette.
   *  Clipped first, the line is entirely within the shape and the outline the
   *  rim light is taken from stays exactly what it was. */
  function edgeInside(g, r, alpha, width) {
    g.save();
    g.clip();
    g.strokeStyle = r.line;
    g.globalAlpha = alpha;
    g.lineWidth = width * 2;     // half of it is clipped away
    g.lineJoin = 'round';
    g.stroke();
    g.restore();
  }

  /** The inside of a shape, once it has been filled: the shaded corner darkens
   *  and - on metal - the lit corner takes a narrow band of white.
   *
   *  Called with the shape still the current path, so it clips to it. Light in
   *  this rig comes from up and to the left for every surface, so the dark
   *  runs from bottom-right and the band sits along the top-left. */
  function shadeInside(g, r, minX, minY, maxX, maxY) {
    const w = maxX - minX, h = maxY - minY;
    if (w <= 0.5 || h <= 0.5) return;
    /* Not every ramp-shaped object in this file comes from ramp() - a few are
       built by hand where one colour had to be forced - so the material is
       read with a default rather than assumed. */
    const contact = r.contact === undefined ? MATERIAL.cloth.contact : r.contact;
    const spec = r.spec || 0;
    g.save();
    g.clip();
    const dark = g.createLinearGradient(maxX, maxY, minX + w * 0.34, minY + h * 0.34);
    dark.addColorStop(0, 'rgba(0,0,0,' + contact + ')');
    dark.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = dark;
    g.fillRect(minX - 1, minY - 1, w + 2, h + 2);
    if (spec) {
      const band = g.createLinearGradient(minX, minY, minX + w * 0.30, minY + h * 0.30);
      band.addColorStop(0, 'rgba(255,255,255,' + spec + ')');
      band.addColorStop(0.55, 'rgba(255,255,255,' + (spec * 0.22).toFixed(3) + ')');
      band.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = band;
      g.fillRect(minX - 1, minY - 1, w + 2, h + 2);
    }
    g.restore();
  }

  /** A limb: a round-capped stroke, which is the cheapest honest capsule. */
  function limb(g, x0, y0, x1, y1, w, r, flat) {
    const grd = g.createLinearGradient(x0 - w, y0, x1 + w, y1);
    grd.addColorStop(0, flat ? r.shade : r.key);
    grd.addColorStop(1, flat ? r.deep : r.shade);
    g.strokeStyle = grd; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }

  /** Bound leather where a hand actually closes on a haft.
   *
   *  Every weapon in the rig was a plain dowel from end to end, so there was
   *  nothing to say which part of it is held - and the hand, drawn later,
   *  landed on bare wood.
   *
   *  Takes the HAFT'S OWN endpoints and a span along it, rather than a second
   *  pair of coordinates typed out by hand. Typed by hand, the axe's wrap ran
   *  from gx+4.6 down to gx+2.2 while the haft under it ran gx+1.3 down to
   *  gx+3.3 - off the shaft, and leaning the opposite way. The wraps are
   *  perpendicular to the shaft for the same reason: at a fixed slope they
   *  cross a raked haft at whatever angle happens to fall out. */
  /** The outline of a swept cone, from a centreline P(t) and a half-width
   *  W(t) walked out one side and back the other.
   *
   *  Two hand-placed beziers that are meant to meet at a point do not meet at
   *  a point - they leave a blunt cut wherever the control points disagree,
   *  which is what the old horns and the old bow limb both had. Built this way
   *  the taper reaches exactly zero because the width function says so, and
   *  every station comes with the local normal, which is what a binding or a
   *  growth ring has to be drawn across. */
  function sweptPath(g, P, W, N) {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = P(t), b = P(WS.min(1, t + 0.02)), c = P(WS.max(0, t - 0.02));
      const dx = b[0] - c[0], dy = b[1] - c[1];
      const len = Math.hypot(dx, dy) || 1;
      pts.push({ t, x: a[0], y: a[1], nx: -dy / len, ny: dx / len, w: W(t) });
    }
    g.beginPath();
    g.moveTo(pts[0].x + pts[0].nx * pts[0].w, pts[0].y + pts[0].ny * pts[0].w);
    for (let i = 1; i <= N; i++) {
      g.lineTo(pts[i].x + pts[i].nx * pts[i].w, pts[i].y + pts[i].ny * pts[i].w);
    }
    for (let i = N; i >= 0; i--) {
      g.lineTo(pts[i].x - pts[i].nx * pts[i].w, pts[i].y - pts[i].ny * pts[i].w);
    }
    g.closePath();
    return pts;
  }

  /** RIVETS along an edge.
   *
   *  A plate is held on by something. At the size the cast is drawn a rivet is
   *  two pixels - a dark seat and a lit dome - and four of them along the lip
   *  of a pauldron do more for "this is armour" than any amount of gradient
   *  inside it, because they are HARD marks and a gradient is not.
   */
  function rivets(g, r, x0, y0, x1, y1, n) {
    const dx = x1 - x0, dy = y1 - y0;
    g.save();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + dx * t, y = y0 + dy * t;
      g.fillStyle = r.line;
      g.globalAlpha = 0.55;
      g.beginPath(); g.ellipse(x, y + 0.35, 1.05, 0.95, 0, 0, WS.TAU); g.fill();
      g.globalAlpha = 0.85;
      g.fillStyle = r.key;
      g.beginPath(); g.ellipse(x - 0.15, y - 0.2, 0.62, 0.55, 0, 0, WS.TAU); g.fill();
    }
    g.restore();
  }

  /** LAMES: the overlapping strips a piece of plate is actually built from.
   *
   *  Clipped to the shape they are laid in, so nothing grows. Each strip gets
   *  a dark leading edge and a lit one just under it, which is what an
   *  overlap looks like from the front. */
  function lames(g, r, pts, n, horizontal) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const [x, y] of pts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    g.save();
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.clip();
    g.lineCap = 'butt';
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      g.strokeStyle = r.line;
      g.globalAlpha = 0.5;
      g.lineWidth = 0.9;
      g.beginPath();
      if (horizontal) {
        const y = minY + (maxY - minY) * t;
        g.moveTo(minX - 2, y); g.lineTo(maxX + 2, y + (maxY - minY) * 0.06);
      } else {
        const x = minX + (maxX - minX) * t;
        g.moveTo(x, minY - 2); g.lineTo(x + (maxX - minX) * 0.06, maxY + 2);
      }
      g.stroke();
      g.strokeStyle = r.key;
      g.globalAlpha = 0.34;
      g.lineWidth = 0.8;
      g.beginPath();
      if (horizontal) {
        const y = minY + (maxY - minY) * t + 1.1;
        g.moveTo(minX - 2, y); g.lineTo(maxX + 2, y + (maxY - minY) * 0.06);
      } else {
        const x = minX + (maxX - minX) * t + 1.1;
        g.moveTo(x, minY - 2); g.lineTo(x + (maxX - minX) * 0.06, maxY + 2);
      }
      g.stroke();
    }
    g.restore();
  }

  function grip(g, hx0, hy0, hx1, hy1, t0, t1, w) {
    const x0 = hx0 + (hx1 - hx0) * t0, y0 = hy0 + (hy1 - hy0) * t0;
    const x1 = hx0 + (hx1 - hx0) * t1, y1 = hy0 + (hy1 - hy0) * t1;
    limb(g, x0, y0, x1, y1, w, LEATHER);
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;          // across the shaft
    const n = 4;
    g.save();
    g.strokeStyle = LEATHER.line;
    g.globalAlpha = 0.6;
    g.lineWidth = 0.7;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const mx = x0 + dx * t, my = y0 + dy * t;
      g.beginPath();
      g.moveTo(mx - nx * w * 0.5, my - ny * w * 0.5);
      g.lineTo(mx + nx * w * 0.5, my + ny * w * 0.5);
      g.stroke();
    }
    g.restore();
  }

  function glow(g, x, y, rad, colour, alpha) {
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, colour);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha === undefined ? 0.85 : alpha;
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, rad, 0, WS.TAU); g.fill();
    g.restore();
  }

  /** A tapered limb: wide at the joint, narrow at the wrist.
   *
   *  Constant-width capsules with a ball on the end were the first attempt and
   *  every survivor came out a shop mannequin - an arm that is the same
   *  thickness at the shoulder and the wrist has no direction, and a hand
   *  wider than the wrist it hangs off reads as a ball joint. A taper costs
   *  one polygon and is most of what makes a limb look grown rather than
   *  assembled. */
  function taper(g, x0, y0, x1, y1, w0, w1, r, flat) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const grd = g.createLinearGradient(x0 - w0, y0, x1 + w1, y1);
    grd.addColorStop(0, flat ? r.shade : r.key);
    grd.addColorStop(0.5, flat ? r.deep : r.core);
    grd.addColorStop(1, flat ? r.deep : r.shade);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x0 + nx * w0, y0 + ny * w0);
    g.lineTo(x1 + nx * w1, y1 + ny * w1);
    g.arc(x1, y1, w1, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
    g.lineTo(x0 - nx * w0, y0 - ny * w0);
    g.arc(x0, y0, w0, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
    g.closePath(); g.fill();
    /* A limb is round, so the dark wraps the far side of it rather than
       settling in a corner. Without this the arms and legs - which are most
       of the figure's area - stayed the flattest thing in the drawing. */
    const lo = Math.max(w0, w1);
    roundInside(g, r, Math.min(x0, x1) - lo, Math.min(y0, y1) - lo,
      Math.max(x0, x1) + lo, Math.max(y0, y1) + lo);
    edgeInside(g, r, 0.45, 0.6);
  }

  /** The inside of something ROUND, once filled: the same light, wrapped.
   *  Used by limbs and heads, where a corner-to-corner ramp reads as a fold
   *  rather than as a curve. */
  function roundInside(g, r, minX, minY, maxX, maxY) {
    const w = maxX - minX, h = maxY - minY;
    if (w <= 0.5 || h <= 0.5) return;
    const contact = r.contact === undefined ? MATERIAL.cloth.contact : r.contact;
    const spec = r.spec || 0;
    const cx = minX + w * 0.5, cy = minY + h * 0.5;
    const rad = Math.max(w, h) * 0.62;
    g.save();
    g.clip();
    const dark = g.createRadialGradient(
      minX + w * 0.30, minY + h * 0.30, rad * 0.22, cx, cy, rad);
    dark.addColorStop(0, 'rgba(0,0,0,0)');
    dark.addColorStop(0.62, 'rgba(0,0,0,' + (contact * 0.42).toFixed(3) + ')');
    dark.addColorStop(1, 'rgba(0,0,0,' + (contact * 1.05).toFixed(3) + ')');
    g.fillStyle = dark;
    g.fillRect(minX - 1, minY - 1, w + 2, h + 2);
    if (spec) {
      const band = g.createRadialGradient(
        minX + w * 0.32, minY + h * 0.28, 0, minX + w * 0.32, minY + h * 0.28, rad * 0.72);
      band.addColorStop(0, 'rgba(255,255,255,' + spec + ')');
      band.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = band;
      g.fillRect(minX - 1, minY - 1, w + 2, h + 2);
    }
    g.restore();
  }

  /* --------------------------------------------------------------- head --- */
  /** The skull, as one path, so the fill and every clip that follows agree on
   *  where the head actually is. Wide at the cranium, tapering to a jaw. */
  function skull(g, cx) {
    g.beginPath();
    g.moveTo(cx - HEAD_RX, HEAD_CY - 2);
    g.bezierCurveTo(cx - HEAD_RX, HEAD_CY - HEAD_RY * 1.42, cx + HEAD_RX, HEAD_CY - HEAD_RY * 1.42,
      cx + HEAD_RX, HEAD_CY - 2);
    g.bezierCurveTo(cx + HEAD_RX, HEAD_CY + HEAD_RY * 0.66, cx + HEAD_RX * 0.42, HEAD_CY + HEAD_RY,
      cx, HEAD_CY + HEAD_RY);
    g.bezierCurveTo(cx - HEAD_RX * 0.42, HEAD_CY + HEAD_RY, cx - HEAD_RX, HEAD_CY + HEAD_RY * 0.66,
      cx - HEAD_RX, HEAD_CY - 2);
    g.closePath();
  }

  /** Eyes: two almonds, set into sockets that follow their shape.
   *
   *  The version before this laid a full-width dark bar across the face and
   *  put two pale pills in it, and every survivor in the roster looked like
   *  they were wearing a sleep mask. The bar is the whole mistake: a shadow
   *  that spans the face is a blindfold, a shadow that hugs each eye is a
   *  socket. They stay large on purpose - at 34px in a crowd the eyes ARE the
   *  face - but an almond at that size reads as a look, where a rectangle
   *  reads as equipment. */
  function eyes(g, cx, y, C, tight, lit2) {
    const dx = 3.9;
    for (const dir of [-1, 1]) {
      g.save();
      g.translate(cx + dir * dx, y);
      g.rotate(dir * -0.16);
      if (tight) {
        // Nothing but the light: inside a hood or a helm there is no face to
        // see, so the eye IS the glow and it is the survivor's own colour.
        g.fillStyle = C.eye;
        g.beginPath(); g.ellipse(0, 0, 1.9, 1.25, 0, 0, WS.TAU); g.fill();
      } else {
        /* A dark eye with a catchlight, not a pale pill.
         *
         * Every earlier attempt made the eye the BRIGHTEST thing on the face,
         * and a bright shape on a light ground has no weight - the whole
         * roster stared out with two blank ovals. Real eyes are the darkest
         * mark on a face with one small highlight in them, and that inversion
         * is the entire fix: it reads as an eye at portrait size and as a
         * decisive dark mark at 34px, where a pale one dissolves. */
        g.fillStyle = 'rgba(44,30,22,.42)';
        g.beginPath(); g.ellipse(0, 0.5, 3.1, 2.3, 0, 0, WS.TAU); g.fill();
        g.fillStyle = '#20161a';
        g.beginPath(); g.ellipse(0, 0, 2.15, 1.6, 0, 0, WS.TAU); g.fill();
        g.fillStyle = C.eye;
        g.beginPath(); g.ellipse(-0.35, -0.4, 0.95, 0.8, 0, 0, WS.TAU); g.fill();
      }
      g.restore();
      if (lit2) glow(g, cx + dir * dx, y, 5.5, C.eye, 0.5);
    }
    // A brow: one short dark stroke over each eye, angled in. Two marks, and
    // the face has an expression instead of a stare.
    g.strokeStyle = 'rgba(26,18,12,.45)';
    g.lineWidth = 1.1; g.lineCap = 'round';
    for (const dir of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + dir * 1.9, y - 3.4);
      g.lineTo(cx + dir * 6.1, y - 2.7);
      g.stroke();
    }
    if (!tight) {
      /* A nose - one shadow down the shaded side and a line under the tip.
         Without it everything between the brow and the lip is an unbroken
         field of skin, and with a beard under it that gap is the widest flat
         area on the whole figure. Drawn as shadow rather than as an outlined
         shape, because a nose in this style is not an object on the face, it
         is where the face turns away from the light. */
      g.save();
      g.fillStyle = 'rgba(38,24,16,.22)';
      g.beginPath();
      g.moveTo(cx + 0.5, y - 2.4);
      g.quadraticCurveTo(cx + 2.0, y + 1.3, cx + 1.9, y + 3.3);
      g.quadraticCurveTo(cx + 0.9, y + 4.3, cx - 0.9, y + 4.0);
      g.quadraticCurveTo(cx + 0.2, y + 2.5, cx - 0.1, y - 2.4);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(30,20,14,.34)';
      g.lineWidth = 0.75;
      g.beginPath();
      g.moveTo(cx - 1.7, y + 3.6);
      g.quadraticCurveTo(cx, y + 4.5, cx + 1.7, y + 3.5);
      g.stroke();
      g.restore();
    }
  }

  function drawHead(g, cfg, C) {
    const cx = 50;
    const hooded = cfg.head === 'hood';
    const helmed = cfg.head === 'helm';
    const eyeY = HEAD_CY + 2;

    // Neck: tapered and in shadow. A head sitting flat on a chest is a snowman.
    taper(g, cx, NECK_Y - 5, cx, SHOULDER_Y, 3.4, 4.6, SKIN, true);

    if (cfg.undead) {
      /* Not a helm - a face. The graveblade wore steel like the warrior and
       * the paladin, which made three survivors whose heads were the same
       * problem solved the same way, and hid the one fact about him that
       * matters. Pallid skin, sockets with no eyes in them and a cold light
       * coming out anyway, a jaw that shows, and the hair gone thin. */
      lit(g, C.paleRamp, cx - HEAD_RX, HEAD_CY - HEAD_RY, cx + HEAD_RX * 0.7, HEAD_CY + HEAD_RY);
      skull(g, cx); g.fill();
      g.save();
      skull(g, cx); g.clip();
      // Hollow cheeks: two soft shadows pulling the face in under the bone.
      for (const dir of [-1, 1]) {
        const hollow = g.createRadialGradient(cx + dir * 7.5, HEAD_CY + 6, 0.5,
          cx + dir * 7.5, HEAD_CY + 6, 7);
        hollow.addColorStop(0, 'rgba(18,24,22,.55)');
        hollow.addColorStop(1, 'rgba(18,24,22,0)');
        g.fillStyle = hollow;
        g.fillRect(cx + dir * 2, HEAD_CY, dir * 12, 14);
      }
      // The brow, heavy and dark, with nothing beneath it but light.
      const brow = g.createLinearGradient(0, HEAD_CY - 3, 0, HEAD_CY + 6);
      brow.addColorStop(0, 'rgba(10,16,15,.72)');
      brow.addColorStop(1, 'rgba(10,16,15,0)');
      g.fillStyle = brow;
      g.fillRect(cx - HEAD_RX - 2, HEAD_CY - 3, HEAD_RX * 2 + 4, 9);
      // Thin hair, receded, in ash.
      panel(g, [[cx - HEAD_RX - 2, HEAD_CY - 4], [cx - HEAD_RX - 2, HEAD_CY - HEAD_RY - 4],
        [cx + HEAD_RX + 2, HEAD_CY - HEAD_RY - 4], [cx + HEAD_RX + 2, HEAD_CY - 5],
        [cx + 5, HEAD_CY - 9], [cx - 1, HEAD_CY - 7], [cx - 7, HEAD_CY - 9.5]],
        ramp([0.42, 0.44, 0.44]));
      g.restore();
      // Sockets: black, and the eye is only the light in them.
      for (const dir of [-1, 1]) {
        g.fillStyle = 'rgba(4,7,7,.95)';
        g.beginPath(); g.ellipse(cx + dir * 4.1, HEAD_CY + 2, 3.1, 2.6, 0, 0, WS.TAU); g.fill();
        g.fillStyle = C.eye;
        g.beginPath(); g.ellipse(cx + dir * 4.1, HEAD_CY + 2, 1.5, 1.1, 0, 0, WS.TAU); g.fill();
        glow(g, cx + dir * 4.1, HEAD_CY + 2, 6, C.eye, 0.55);
      }
      if (cfg.crown) {
        /* An iron crown, grown rather than made: a heavy band and five spikes
         * off it, the middle one tallest, all of them leaning back. Our own
         * shape - the game owns every design it ships, the same rule its names
         * live under - and it does the job a crown does, which is to say that
         * this one gives the orders. */
        const bandY = HEAD_CY - HEAD_RY + 2;
        const crownRamp = ramp([0.26, 0.28, 0.33]);
        const spikes = [[-11, 9], [-6, 14], [0, 18], [6, 14], [11, 9]];
        for (const [ox, h] of spikes) {
          const lean = ox * 0.18;
          lit(g, crownRamp, cx + ox - 3, bandY, cx + ox + 3, bandY - h);
          g.beginPath();
          g.moveTo(cx + ox - 3.4, bandY + 1);
          g.lineTo(cx + ox + lean * 0.5, WS.max(CEIL + 1, bandY - h));
          g.lineTo(cx + ox + 3.4, bandY + 1);
          g.closePath(); g.fill();
        }
        panel(g, [[cx - 12.5, bandY - 1], [cx + 12.5, bandY - 1],
          [cx + 11.5, bandY + 5], [cx - 11.5, bandY + 5]], crownRamp);
        // One cold stone at the front, the same light as the sockets.
        g.fillStyle = C.eye;
        g.beginPath(); g.ellipse(cx, bandY + 2, 2.2, 2.6, 0, 0, WS.TAU); g.fill();
        glow(g, cx, bandY + 2, 8, C.eye, 0.45);
      }
      // A set jaw, drawn as one line of teeth. Two marks and it is a corpse.
      g.strokeStyle = 'rgba(12,18,16,.6)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx - 5, HEAD_CY + 9.5); g.lineTo(cx + 5, HEAD_CY + 9.2); g.stroke();
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(cx + i * 2.4, HEAD_CY + 8.4); g.lineTo(cx + i * 2.4, HEAD_CY + 10.4);
        g.stroke();
      }
    } else if (hooded) {
      /* A cowl, not a cone.
       *
       * The first hood was a tall point over a black hole, which at any size
       * read as something other than a rogue. A cowl sits close to the skull,
       * peaks only a little above it, and lands on a mantle across the
       * shoulders - and the darkness inside it is a soft falloff rather than a
       * cut-out, so it reads as shadow instead of absence. */
      /* The cowl follows the skull and stops just above it.
       *
       * Peaked at eleven units over the crown it was a cone, and a cone on a
       * figure is a garden gnome or something worse - never a rogue. Three
       * units of clearance, a rounded crown, and a mantle that spreads onto
       * the shoulders instead of hanging straight: the shape now belongs to a
       * body rather than sitting on top of one. */
      const hr = cfg.hood || CLOTH;
      const crown = HEAD_CY - HEAD_RY - 1.5, mantle = NECK_Y + 10;
      /* The mantle goes down FIRST, and darker, so the cowl lands on top of it.
       * Drawn last and lit like a face-on panel it caught the key light across
       * its whole width and read as a pale bib hung on the chest. */
      panel(g, [[cx - 17, mantle - 3], [cx + 15, mantle - 3],
        [cx + 12, mantle + 6], [cx - 14, mantle + 6]],
        { key: hr.shade, core: hr.deep, shade: hr.line });
      lit(g, hr, cx - 15, crown, cx + 13, mantle);
      g.beginPath();
      g.moveTo(cx - 17, mantle);                       // the mantle spreads wide
      g.bezierCurveTo(cx - 13.5, HEAD_CY + 2, cx - 11.5, crown + 3, cx - 1, crown);
      g.bezierCurveTo(cx + 9, crown + 0.5, cx + 11, HEAD_CY + 2, cx + 15, mantle);
      g.lineTo(cx + 9, mantle - 2);
      g.bezierCurveTo(cx + 9.5, HEAD_CY - 1, cx + 8, HEAD_CY + 3, cx, HEAD_CY + 3.5);
      g.bezierCurveTo(cx - 8, HEAD_CY + 3, cx - 9.5, HEAD_CY - 1, cx - 10, mantle - 2);
      g.closePath(); g.fill();
      finish(g, hr, cx - 17, crown, cx + 15, mantle + 1);
      /* THE OPENING HAS A LIP. Cloth gathered round a face turns back on
         itself, and that turned edge catches light - without it the hood is
         one flat shape with a hole cut in it, which is what this was. Drawn
         just inside the opening so it reads as the near edge of the cowl. */
      g.save();
      g.strokeStyle = hr.key;
      g.globalAlpha = 0.5;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(cx + 9, mantle - 2);
      g.bezierCurveTo(cx + 9.5, HEAD_CY - 1, cx + 8, HEAD_CY + 3, cx, HEAD_CY + 3.5);
      g.bezierCurveTo(cx - 8, HEAD_CY + 3, cx - 9.5, HEAD_CY - 1, cx - 10, mantle - 2);
      g.stroke();
      g.restore();
      /* And folds down the cowl, gathering toward the mantle - the same thing
         the cloaks got, for the same reason: cloth pinned at one end and loose
         at the other does not hang flat. */
      g.save();
      g.beginPath();
      g.moveTo(cx - 17, mantle);
      g.bezierCurveTo(cx - 13.5, HEAD_CY + 2, cx - 11.5, crown + 3, cx - 1, crown);
      g.bezierCurveTo(cx + 9, crown + 0.5, cx + 11, HEAD_CY + 2, cx + 15, mantle);
      g.closePath();
      g.clip();
      for (const [ox, lean] of [[-12.5, -3], [12, 3.2]]) {
        const fold = g.createLinearGradient(cx + ox - 2.2, 0, cx + ox + 2.2, 0);
        fold.addColorStop(0, 'rgba(0,0,0,0)');
        fold.addColorStop(0.5, 'rgba(0,0,0,.26)');
        fold.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = fold;
        g.beginPath();
        g.moveTo(cx + ox - 2.2, crown + 4);
        g.lineTo(cx + ox + 2.2, crown + 4);
        g.lineTo(cx + ox + lean + 3.4, mantle + 2);
        g.lineTo(cx + ox + lean - 3.4, mantle + 2);
        g.closePath();
        g.fill();
      }
      g.restore();
      g.save();
      g.beginPath();
      g.ellipse(cx, HEAD_CY + 1.5, 8.4, 8.4, 0, 0, WS.TAU);
      g.clip();
      const void_ = g.createRadialGradient(cx, HEAD_CY + 3, 1, cx, HEAD_CY + 1.5, 10);
      void_.addColorStop(0, 'rgba(6,8,14,1)');
      void_.addColorStop(0.7, 'rgba(6,8,14,.98)');
      void_.addColorStop(1, 'rgba(6,8,14,.55)');
      g.fillStyle = void_;
      g.fillRect(cx - 10, HEAD_CY - 10, 20, 22);
      g.restore();
      eyes(g, cx, eyeY, C, true, true);
      if (cfg.scarf) {
        /* A scarf pulled up to the chin, OUTSIDE the hood rather than inside
         * it. Painted across the shadow it read as a bandage over the mouth -
         * a light band laid over the one part of the design that is meant to
         * be empty. Wrapped round the throat instead it does the same job,
         * says the same thing, and leaves the void alone. */
        panel(g, [[cx - 10, HEAD_CY + 7], [cx + 10, HEAD_CY + 6],
          [cx + 11, NECK_Y + 4], [cx - 11, NECK_Y + 5]], C.trimRamp);
        panel(g, [[cx + 4, HEAD_CY + 9], [cx + 10.5, HEAD_CY + 8],
          [cx + 13, NECK_Y + 12], [cx + 6.5, NECK_Y + 11]], C.trimRamp);
        g.strokeStyle = 'rgba(0,0,0,.32)'; g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(cx - 9, HEAD_CY + 11); g.quadraticCurveTo(cx, HEAD_CY + 13, cx + 9, HEAD_CY + 10);
        g.stroke();
      }    } else {
      lit(g, helmed ? STEEL : SKIN, cx - HEAD_RX, HEAD_CY - HEAD_RY, cx + HEAD_RX * 0.7, HEAD_CY + HEAD_RY);
      skull(g, cx); g.fill();

      if (!helmed) {
        /* Hair with a parting and a fringe that comes down past the temples.
         * A symmetrical cap over the crown reads as a swimming hat; a side
         * parting is one asymmetry and it turns the same shape into hair. */
        g.save();
        skull(g, cx); g.clip();
        panel(g, [[cx - HEAD_RX - 2, HEAD_CY + 6], [cx - HEAD_RX - 2, HEAD_CY - HEAD_RY - 4],
          [cx + HEAD_RX + 2, HEAD_CY - HEAD_RY - 4], [cx + HEAD_RX + 2, HEAD_CY + 5],
          [cx + HEAD_RX - 2.5, HEAD_CY + 1], [cx + HEAD_RX - 3, HEAD_CY - 4],
          [cx + 1.5, HEAD_CY - 6.5], [cx - 5.5, HEAD_CY - 4.5],
          [cx - HEAD_RX + 3, HEAD_CY - 3], [cx - HEAD_RX + 2.5, HEAD_CY + 2]],
          cfg.hair || DARKCLOTH);
        // The shadow the fringe casts on the forehead - soft, and only where
        // the hair actually is.
        const sh = g.createLinearGradient(0, HEAD_CY - 6, 0, HEAD_CY + 1);
        sh.addColorStop(0, 'rgba(20,12,8,.34)');
        sh.addColorStop(1, 'rgba(20,12,8,0)');
        g.fillStyle = sh;
        g.fillRect(cx - HEAD_RX - 2, HEAD_CY - 6, HEAD_RX * 2 + 4, 7);
        g.restore();
      }
      if (helmed) {
        // A brow ridge and a visor slot: the two marks that make a steel dome
        // a helm rather than an egg.
        g.fillStyle = 'rgba(8,10,16,.9)';
        g.beginPath();
        g.moveTo(cx - 8.6, eyeY - 3.6); g.lineTo(cx + 8.6, eyeY - 3.6);
        g.lineTo(cx + 7.6, eyeY + 1.6); g.lineTo(cx - 7.6, eyeY + 1.6);
        g.closePath(); g.fill();
        panel(g, [[cx - HEAD_RX, eyeY - 5.6], [cx + HEAD_RX, eyeY - 5.6],
          [cx + HEAD_RX - 0.6, eyeY - 3.4], [cx - HEAD_RX + 0.6, eyeY - 3.4]], STEEL);
        for (const dir of [-1, 1]) {
          g.fillStyle = C.eye;
          g.beginPath(); g.ellipse(cx + dir * 3.9, eyeY - 0.9, 1.5, 1.0, 0, 0, WS.TAU); g.fill();
          glow(g, cx + dir * 3.9, eyeY - 0.9, 4, C.eye, 0.22);
        }
        // Crest, in the survivor's colour.
        panel(g, [[cx - 2.2, CEIL + 2], [cx + 2.2, CEIL + 2],
          [cx + 3, HEAD_CY - 5], [cx - 3, HEAD_CY - 5]], C.accentRamp);
        if (cfg.helmHorns) sideHorns(g, cx);
      } else if (cfg.blindfold) {
        /* Bound eyes, and the light gets out anyway.
         *
         * This is the whole character in one mark. A horned figure with an
         * open face is a costume; a figure who has traded their eyes for what
         * burns behind them is a ruinseeker, and it reads at 34px when nothing
         * else about the face does. The band is cloth over the socket line,
         * the glow sits ON it rather than under, and the knot at the temple
         * keeps it from looking like a painted stripe. */
        eyes(g, cx, eyeY, C, false, false);
        panel(g, [[cx - HEAD_RX - 1, eyeY - 4.6], [cx + HEAD_RX + 1, eyeY - 5.4],
          [cx + HEAD_RX + 1, eyeY + 2.2], [cx - HEAD_RX - 1, eyeY + 3]],
          ramp([0.13, 0.11, 0.16]));
        for (const dir of [-1, 1]) {
          g.fillStyle = C.eye;
          g.beginPath();
          g.ellipse(cx + dir * 3.9, eyeY - 1.2, 2.2, 0.85, dir * -0.06, 0, WS.TAU);
          g.fill();
          glow(g, cx + dir * 3.9, eyeY - 1.2, 7, C.eye, 0.6);
        }
        // The knot, trailing back past the jaw.
        panel(g, [[cx + HEAD_RX - 1, eyeY - 4.6], [cx + HEAD_RX + 5, eyeY - 1],
          [cx + HEAD_RX + 4.5, eyeY + 5], [cx + HEAD_RX - 1, eyeY + 2]],
          ramp([0.16, 0.13, 0.19]));
      } else {
        eyes(g, cx, eyeY, C, false, false);
        if (cfg.beard) {
          /* A beard reads by its BOTTOM EDGE and by the fact that it is made
             of strands. The first one was a rounded slab with a separate
             darker bar laid across it for a moustache, which at any size read
             as a scarf with a stripe on it. This one is cut into locks, the
             moustache is two swept halves that meet the beard rather than a
             rectangle sitting on it, and there are strands drawn down it.
             
             Everything hangs off eyeY (25) and the chin (36), both of which
             are already in this file - an earlier version guessed at the jaw
             and drew the whole thing over the eyes. */
          const lip = eyeY + 5.4;
          const chin = HEAD_CY + HEAD_RY;
          const w = HEAD_RX * 0.92;
          // the mass, cut into locks along the bottom
          const locks = [
            [cx - w, lip - 0.5],
            [cx - w - 1.2, chin - 3.6],
            [cx - w * 0.83, chin + 1.9],
            [cx - w * 0.59, chin - 0.7],
            [cx - w * 0.29, chin + 4.7],
            [cx - w * 0.04, chin + 2.3],
            [cx + w * 0.23, chin + 5.4],
            [cx + w * 0.47, chin + 1.1],
            [cx + w * 0.73, chin + 3.5],
            [cx + w * 0.91, chin - 1.1],
            [cx + w + 1.2, chin - 3.6],
            [cx + w, lip - 0.5],
          ];
          panel(g, locks, cfg.beard);
          /* The moustache is ONE mass across the lip with a notch at the
             philtrum, not two quads. Two four-point panels, each with its own
             outline and a gap between them, rendered as a pair of dark
             rectangles pasted under the eyes - a hard horizontal top edge is
             the one shape hair never has. */
          const mw = w * 0.88;
          const moustache = () => {
            g.beginPath();
            g.moveTo(cx - mw, lip - 4.2);
            // the ends sweep DOWN into the beard rather than stopping in air
            g.quadraticCurveTo(cx - mw * 0.94, lip + 3.4, cx - mw * 0.42, lip + 1.6);
            g.quadraticCurveTo(cx - 1.6, lip + 0.6, cx, lip - 2.6);   // philtrum
            g.quadraticCurveTo(cx + 1.6, lip + 0.6, cx + mw * 0.42, lip + 1.6);
            g.quadraticCurveTo(cx + mw * 0.94, lip + 3.4, cx + mw, lip - 4.2);
            g.quadraticCurveTo(cx + mw * 0.5, lip - 5.4, cx, lip - 4.4);
            g.quadraticCurveTo(cx - mw * 0.5, lip - 5.4, cx - mw, lip - 4.2);
            g.closePath();
          };
          g.save();
          lit(g, cfg.beard, cx, lip - 5.4, cx, lip + 3.4);
          moustache();
          g.fill();
          /* Shaded but NOT outlined all round. The beard sits directly behind
             it in the same ramp, so a closed edge turns the moustache into a
             separate object pasted on the face; only the underside, where the
             hair actually leaves the lip, gets a line. */
          g.save();
          moustache(); g.clip();
          shadeInside(g, cfg.beard, cx - mw, lip - 5.4, cx + mw, lip + 3.4);
          g.restore();
          g.strokeStyle = cfg.beard.line;
          g.globalAlpha = 0.5;
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(cx - mw * 0.9, lip + 1.4);
          g.quadraticCurveTo(cx - mw * 0.4, lip + 1.5, cx, lip - 2.3);
          g.quadraticCurveTo(cx + mw * 0.4, lip + 1.5, cx + mw * 0.9, lip + 1.4);
          g.stroke();
          g.restore();
          // strands, fanning the way the hair falls
          g.save();
          g.strokeStyle = cfg.beard.line;
          g.globalAlpha = 0.45;
          g.lineWidth = 0.75;
          for (let i = -2; i <= 2; i++) {
            g.beginPath();
            g.moveTo(cx + i * 2.6, lip + 1.5);
            g.quadraticCurveTo(cx + i * 3.4, chin - 1, cx + i * 3.9, chin + 3.5);
            g.stroke();
          }
          g.restore();
        }
        if (cfg.mustache) {
          /* THE MOUSTACHE. Vonnra's own mark, drawn nowhere else in the
             cast, and not a subtle one - the first pass read as "facial
             hair, a bit wide"; this one is meant to be the first thing
             about her a player notices. Four things make that true rather
             than just a bigger version of a small shape:

               profile   it DROOPS before it sweeps - down and out from
                         the lip, then hard up into the curl. A shape that
                         only tapers reads as a horn; the droop is what
                         makes it read as hair with weight to it.
               reach     the tip lands past HEAD_RX*2 out from centre -
                         wider than the skull it grows from, the way the
                         chest brand and the crown are held to their own
                         proportions and this is deliberately not.
               curl      two full turns, not one and a half, ending in a
                         waxed bead rather than just running out of line.
               texture   strands with the sweep and a sheen along the top
                         edge - the same "a gradient reads as nothing, an
                         edge reads as a shape" rule everything else in
                         this file is built on, applied to hair instead of
                         plate for the first time in the rig.

             Anchored off eyeY for the same reason the beard is - guessing
             at the jaw draws the whole thing over the eyes. */
          const lip = eyeY + 5.4;
          const hi = cfg.hair.key, dk = cfg.hair.line;
          for (const dir of [-1, 1]) {
            const top = [
              [cx + dir * 1, lip - 1.0], [cx + dir * 4, lip + 0.6], [cx + dir * 8, lip + 1.6],
              [cx + dir * 13, lip + 0.6], [cx + dir * 18, lip - 2.0], [cx + dir * 22.5, lip - 5.8],
              [cx + dir * 25.5, lip - 9.4],
            ];
            const bottom = [
              [cx + dir * 26.2, lip - 7.6], [cx + dir * 22.5, lip - 2.4], [cx + dir * 18, lip + 2.4],
              [cx + dir * 13, lip + 4.8], [cx + dir * 8, lip + 4.6], [cx + dir * 4, lip + 2.6],
              [cx + dir * 1, lip + 1.2],
            ];
            const mass = top.concat(bottom);
            panel(g, mass, cfg.hair);
            const tracePath = () => {
              g.beginPath();
              g.moveTo(mass[0][0], mass[0][1]);
              for (let i = 1; i < mass.length; i++) g.lineTo(mass[i][0], mass[i][1]);
              g.closePath();
            };

            // sheen: a bright streak along the top, the groomed look
            g.save();
            tracePath(); g.clip();
            g.strokeStyle = hi; g.globalAlpha = 0.5; g.lineWidth = 0.7;
            g.beginPath();
            g.moveTo(cx + dir * 3, lip - 0.6);
            g.quadraticCurveTo(cx + dir * 12, lip - 0.6, cx + dir * 20, lip - 3.6);
            g.stroke();

            // strands, following the sweep - real texture, not a silhouette
            g.strokeStyle = dk; g.globalAlpha = 0.4; g.lineWidth = 0.35;
            for (let i = 0; i < 6; i++) {
              const t = i / 5;
              const x0 = cx + dir * (2 + t * 20), y0 = lip + 3.6 - t * 8.4;
              const x1 = cx + dir * (5 + t * 21.5), y1 = lip - 5.6 - t * 3.6;
              g.beginPath();
              g.moveTo(x0, y0);
              g.quadraticCurveTo((x0 + x1) / 2 + dir * 1.5, (y0 + y1) / 2, x1, y1);
              g.stroke();
            }
            g.restore();

            // the curl: two and a half turns now, ending in a waxed bead -
            // wound from exactly where the mass tip ends, so the spiral
            // reads as the hair itself curling rather than a separate
            // ornament stuck on next to it.
            g.save();
            g.translate(cx + dir * 25.5, lip - 9.4);
            g.scale(dir, 1);
            g.strokeStyle = cfg.hair.core;
            g.lineWidth = 1.7;
            g.lineCap = 'round';
            g.beginPath();
            const turns = 2.5, steps = 46;
            let lastX = 0, lastY = 0;
            for (let i = 0; i <= steps; i++) {
              const t = i / steps;
              const a = t * turns * WS.TAU + WS.PI * 0.3;
              const r = 7.0 * (1 - t * 0.9) + 0.28;
              lastX = WS.cos(a) * r; lastY = WS.sin(a) * r * 0.92;
              if (i === 0) g.moveTo(lastX, lastY); else g.lineTo(lastX, lastY);
            }
            g.stroke();
            g.fillStyle = cfg.hair.core;
            g.beginPath(); g.arc(lastX, lastY, 0.85, 0, WS.TAU); g.fill();
            g.restore();
          }
          // the tuft where the two halves meet
          g.fillStyle = cfg.hair.shade;
          g.beginPath();
          g.moveTo(cx - 1.1, lip - 0.6);
          g.quadraticCurveTo(cx, lip - 3.2, cx + 1.1, lip - 0.6);
          g.quadraticCurveTo(cx, lip + 0.4, cx - 1.1, lip - 0.6);
          g.closePath(); g.fill();
        }
        if (cfg.browband) {
          /* A band of iron across the brow. It is what a man who will not wear
             a helm wears instead, and it gives the horns something to be
             mounted on - horns growing out of bare hair read as a costume. */
          panel(g, [
            [cx - HEAD_RX - 0.8, eyeY - 7.6], [cx + HEAD_RX + 0.8, eyeY - 8.2],
            [cx + HEAD_RX + 0.8, eyeY - 4.2], [cx - HEAD_RX - 0.8, eyeY - 3.6],
          ], ramp([0.44, 0.44, 0.48], 'metal'));
          g.fillStyle = GOLD.core;
          g.beginPath();
          g.ellipse(cx, eyeY - 5.9, 2.1, 1.7, 0, 0, WS.TAU);
          g.fill();
          if (cfg.helmHorns) sideHorns(g, cx, eyeY - 6);
        }
        if (cfg.warpaint) {
          /* One band of the survivor's own colour across the eyes, in the
           * place a mask would sit. It costs nothing, it survives the shrink,
           * and it is the difference between a man in a cloak and a man who
           * belongs to something. */
          g.save();
          skull(g, cx); g.clip();
          g.globalAlpha = 0.72;
          g.fillStyle = C.accent;
          g.beginPath();
          g.moveTo(cx - HEAD_RX - 2, eyeY - 4.4);
          g.lineTo(cx + HEAD_RX + 2, eyeY - 5.2);
          g.lineTo(cx + HEAD_RX + 2, eyeY - 2.4);
          g.lineTo(cx - HEAD_RX - 2, eyeY - 1.6);
          g.closePath(); g.fill();
          /* The tear streaks used to run from here down to eyeY+7.2 - which
             is exactly the moustache's own territory on a survivor wearing
             one, so they are skipped there. A moustache this size is the
             more interesting thing to actually see in that space. */
          if (!cfg.mustache) {
            g.globalAlpha = 0.5;
            for (const dir of [-1, 1]) {
              g.beginPath();
              g.moveTo(cx + dir * 2.6, eyeY + 2.4);
              g.lineTo(cx + dir * 5.6, eyeY + 2);
              g.lineTo(cx + dir * 5, eyeY + 7);
              g.lineTo(cx + dir * 3.2, eyeY + 7.2);
              g.closePath(); g.fill();
            }
          }
          g.restore();
        }
      }
    }

    if (cfg.horns) {
      /* Swept out and back, heavy at the root. Straight vertical spikes read
       * as ears - the curve and the taper are what make them horns. */
      for (const dir of [-1, 1]) {
        const bx = cx + dir * 6, by = HEAD_CY - HEAD_RY + 5;
        lit(g, C.hornRamp, bx, by, cx + dir * 19, CEIL + 1);
        g.beginPath();
        g.moveTo(bx, by);
        g.bezierCurveTo(cx + dir * 15, by + 1, cx + dir * 23, by - 4, cx + dir * 25, CEIL + 3);
        g.bezierCurveTo(cx + dir * 18, by - 6, cx + dir * 13, by - 3, cx + dir * 9.5, by - 4);
        g.closePath(); g.fill();
      }
    }
    if (cfg.halo) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = C.accent; g.lineWidth = 1.8; g.globalAlpha = 0.9;
      g.beginPath(); g.ellipse(cx, CEIL + 3.5, 12.5, 3.2, 0, 0, WS.TAU); g.stroke();
      g.restore();
      glow(g, cx, CEIL + 3.5, 9, C.accent, 0.26);
    }
  }

  /** A pair of horns off the sides of the head.
   *
   *  Bone, not steel. Rooted AT the band and swept up and back, thick at the
   *  root and tapering to a point, with growth rings across them.
   *
   *  The pair before this were a constant-thin grey curve struck out
   *  sideways, mounted above the hair rather than on anything: at the size
   *  the roster is drawn they read as bent wire, and in the same grey as the
   *  pauldrons they read as part of the armour. A horn is a cone that grew -
   *  it is widest where it leaves the skull and it is never the same colour
   *  as a shoulder plate. */
  const HORN = ramp([0.78, 0.72, 0.60], 'leather');
  const HORN_DARK = ramp([0.52, 0.46, 0.37], 'leather');

  function sideHorns(g, cx, rootY) {
    const y0 = rootY === undefined ? HEAD_CY - 6 : rootY;
    for (const dir of [-1, 1]) {
      /* The horn is a swept cone, so it is built from a centreline and a
         half-width rather than from two hand-placed beziers. That guarantees
         the thing actually comes to a point - the pair before these were two
         curves that happened to end near each other and left a blunt cut at
         the tip - and it gives the growth rings a tangent to sit across.

         The first rings were struck vertically at even spacing along the
         whole length. On a horn that bends from horizontal at the root to
         vertical at the tip, a fixed direction is only right at one end, and
         even spacing reads as a wrapped bandage. Real rings crowd the root
         and fade out before the tip. */
      const rx = cx + dir * (HEAD_RX - 1.8);        // on the band, not above it
      const cxCtl = cx + dir * 16.5, cyCtl = y0 - 3.5;
      const tipX = cx + dir * 17.5, tipY = CEIL + 3.5;
      const rootY0 = y0 + 0.4;
      const base = 4.6;
      // centreline, as a quadratic from the root through the sweep
      const P = (t) => {
        const u = 1 - t;
        return [u * u * rx + 2 * u * t * cxCtl + t * t * tipX,
          u * u * rootY0 + 2 * u * t * cyCtl + t * t * tipY];
      };
      // half-width: full at the root, nothing at the tip, falling slowly at
      // first so the horn stays heavy where it leaves the skull
      const W = (t) => base * 0.5 * Math.pow(1 - t, 0.8);
      g.save();
      lit(g, dir < 0 ? HORN_DARK : HORN, rx, rootY0 + base, tipX, tipY);
      sweptPath(g, P, W, 16);
      g.fill();
      finish(g, dir < 0 ? HORN_DARK : HORN,
        Math.min(rx, tipX) - base, tipY, Math.max(rx, tipX) + base, rootY0 + base);
      // growth rings: across the local tangent, crowded at the root, gone by
      // two thirds of the way out
      g.strokeStyle = HORN_DARK.line;
      g.lineWidth = 0.7;
      for (let i = 1; i <= 5; i++) {
        const t = Math.pow(i / 6, 1.45) * 0.72;
        const a = P(t), b = P(t + 0.02), c = P(t - 0.02);
        let dx = b[0] - c[0], dy = b[1] - c[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len, w = W(t) * 0.88;
        g.globalAlpha = 0.55 * (1 - t / 0.9);
        g.beginPath();
        g.moveTo(a[0] + nx * w, a[1] + ny * w);
        g.lineTo(a[0] - nx * w, a[1] - ny * w);
        g.stroke();
      }
      g.restore();
    }
  }

  /* --------------------------------------------------------------- body --- */
  function drawBody(g, cfg, C, b, w, lift) {
    const cx = 50;

    // Far arm first, in shadow, so the near side has something to sit in front
    // of. Depth at this scale is entirely a matter of what overlaps what.
    // Everything from the hips up rides with the lift; the legs below do not.
    g.save(); g.translate(0, -lift);
    // Arms oppose the legs. Swinging them WITH the legs is the thing that
    // makes a walk cycle look wrong without anyone being able to say why.
    taper(g, cx - b.sh + 1, SHOULDER_Y + 1, cx - b.sh - 2.5 - w.swing * 3.5, WAIST_Y - 1,
      b.arm * 0.62, b.arm * 0.38, C.bodyRamp, true);
    /* The far arm ended in nothing, which at 330px is an arm that stops. It
       takes the same hand as the near one, one shade back so it stays behind
       - or, where a survivor has lost it, a capped stump and a binding. */
    {
      const hx = cx - b.sh - 2.5 - w.swing * 3.5, hy = WAIST_Y - 1;
      if (cfg.stump === 'far') {
        // the cap, bound over: a flat end and a wrap, not a hand in shadow
        blob(g, hx - 0.6, hy - 0.4, b.arm * 0.42, b.arm * 0.34, LEATHER);
        g.save();
        g.strokeStyle = LEATHER.line;
        g.globalAlpha = 0.7;
        g.lineWidth = 0.9;
        for (let i = 0; i < 2; i++) {
          g.beginPath();
          g.moveTo(hx - b.arm * 0.44, hy - 3 + i * 2.6);
          g.lineTo(hx + b.arm * 0.36, hy - 3.6 + i * 2.6);
          g.stroke();
        }
        g.restore();
      } else if (cfg.gauntlets) {
        hand(g, hx - 0.8, hy + 0.4, b.arm * 0.44, b.arm * 0.5,
          ramp([0.26, 0.28, 0.33], 'metal'), 1, null);
      } else {
        hand(g, hx - 0.8, hy + 0.4, b.arm * 0.40, b.arm * 0.45,
          ramp(WS.shade([0.80, 0.62, 0.47], 0.72), 'skin'), 1, null);
      }
    }

    if (cfg.robe) {
      // A bell from the waist to the floor, with the hem catching the light.
      /* A bell does not have legs, so its walk is in the hem: the skirt lags
       * behind the hips and swings the other way. Half the cast is robed and
       * this is the only thing that moves on them. */
      const drag = w.swing * 4;
      panel(g, [[cx - b.waist, WAIST_Y - 4 - lift], [cx + b.waist, WAIST_Y - 4 - lift],
        [cx + b.hip + 8 + drag, FOOT_Y], [cx - b.hip - 8 + drag, FOOT_Y]], C.robeRamp);
      const hemPts = [[cx - b.hip - 8 + drag, FOOT_Y], [cx + b.hip + 8 + drag, FOOT_Y],
        [cx + b.hip + 6.5 + drag, FOOT_Y - 4.5], [cx - b.hip - 6.5 + drag, FOOT_Y - 4.5]];
      panel(g, hemPts, C.trimRamp);
      /* The hem band carried the eye along the bottom of every robed survivor
         and was one flat strip. Braid on a hem is a repeat - so it is drawn
         as one, in the two marks everything else here is made of. */
      g.save();
      g.beginPath();
      g.moveTo(hemPts[0][0], hemPts[0][1]);
      for (let i = 1; i < hemPts.length; i++) g.lineTo(hemPts[i][0], hemPts[i][1]);
      g.closePath(); g.clip();
      const hw = (b.hip + 8) * 2;
      for (let i = 0; i <= 11; i++) {
        const x = cx - b.hip - 8 + drag + (hw * i) / 11;
        g.strokeStyle = C.trimRamp.line; g.globalAlpha = 0.5; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(x, FOOT_Y - 4.5); g.lineTo(x - 0.8, FOOT_Y); g.stroke();
        g.strokeStyle = C.trimRamp.key; g.globalAlpha = 0.3;
        g.beginPath(); g.moveTo(x + 1.1, FOOT_Y - 4.5); g.lineTo(x + 0.3, FOOT_Y); g.stroke();
      }
      g.restore();
      g.fillStyle = 'rgba(0,0,0,.30)';
      g.beginPath(); g.moveTo(cx - b.hip - 8 + drag, FOOT_Y);
      g.lineTo(cx + b.hip + 8 + drag, FOOT_Y); g.lineTo(cx + b.hip + 6 + drag, FOOT_Y - 1.5);
      g.lineTo(cx - b.hip - 6.5 + drag, FOOT_Y - 1.5); g.closePath(); g.fill();
      /* FOLDS, and a fold is not a line.
       *
       * These were two dark strokes down the bell, which is a drawing of a
       * crease rather than a crease: cloth gathered at a belt and hanging free
       * makes a shaded side and a LIT CREST beside it, and the crest is the
       * half that reads. The three flattest survivors in the cast were the
       * three biggest robes, all of them carrying two strokes each.
       *
       * Five of them, at uneven spacing and uneven width, clipped to the bell
       * so the silhouette is untouched. Uneven because a garment folded at
       * regular intervals is a pleated skirt, which is a different thing and
       * reads as one. */
      g.save();
      g.beginPath();
      g.moveTo(cx - b.waist, WAIST_Y - 4 - lift);
      g.lineTo(cx + b.waist, WAIST_Y - 4 - lift);
      g.lineTo(cx + b.hip + 8 + drag, FOOT_Y);
      g.lineTo(cx - b.hip - 8 + drag, FOOT_Y);
      g.closePath(); g.clip();
      for (const u of [-0.74, -0.36, 0.05, 0.42, 0.78]) {
        const topX = cx + u * b.waist * 0.86;
        const botX = cx + u * (b.hip + 8) * 0.94 + drag;
        const w0 = 1.5 + 0.8 * Math.abs(u), w1 = 2.9 + 1.9 * Math.abs(u);
        const grd = g.createLinearGradient(botX - w1, 0, botX + w1, 0);
        grd.addColorStop(0, 'rgba(0,0,0,.30)');
        grd.addColorStop(0.52, 'rgba(0,0,0,.04)');
        grd.addColorStop(0.72, 'rgba(255,255,255,.25)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(topX - w0, WAIST_Y - 4 - lift);
        g.lineTo(topX + w0, WAIST_Y - 4 - lift);
        g.lineTo(botX + w1, FOOT_Y);
        g.lineTo(botX - w1, FOOT_Y);
        g.closePath(); g.fill();
        /* And the terminator. The gradient alone measured nothing - the same
           result the whole material pass got, for the same reason: a ramp
           spread over eighty pixels has no steep change anywhere in it. Cloth
           that turns away from the light does it at an edge, and that edge is
           a line. */
        g.strokeStyle = 'rgba(0,0,0,.27)';
        g.lineWidth = 0.9;
        g.beginPath();
        g.moveTo(topX - w0, WAIST_Y - 4 - lift);
        g.lineTo(botX - w1, FOOT_Y);
        g.stroke();
      }
      g.restore();
    } else {
      for (const dir of [-1, 1]) {
        const hx = cx + dir * (b.hip - b.leg * 0.5);
        /* The near leg leads on +swing, the far leg on -swing. The foot moves
         * and the hip does not, which is what makes it a stride rather than
         * the whole figure sliding sideways. */
        const lead = dir * w.swing;
        const fx = hx + dir * 1.5 + lead * 5.5;
        // The hip rises with the body, the foot stays on the floor, and the
        // leg between them stretches. That is the whole mechanism.
        const foot = FOOT_Y - 6;
        taper(g, hx, HIP_Y - 4 - lift, fx, foot, b.leg * 0.62, b.leg * 0.42, C.legRamp, dir < 0);
        /* A KNEE. The leg was one tapered column from hip to boot - the
           longest unbroken shape on the figure and the last part of the rig
           with nothing drawn on it. One band across it at the joint, lit on
           top and shaded under, is enough to say the limb bends there, and it
           travels with the stride because the knee is between the hip and the
           foot rather than at a fixed height. */
        {
          const kt = 0.52;
          const kx = hx + (fx - hx) * kt;
          const ky = (HIP_Y - 4 - lift) + (foot - (HIP_Y - 4 - lift)) * kt;
          const kw = b.leg * 0.53;
          if (cfg.pauldrons) {
            // A poleyn: the one plate on a leg that is a shape rather than a
            // strip, and it lands exactly where the limb bends.
            const kp = [[kx - kw * 1.05, ky - 3.4], [kx + kw * 1.05, ky - 3.4],
              [kx + kw * 0.9, ky + 3.2], [kx - kw * 0.9, ky + 3.2]];
            panel(g, kp, C.plateRamp);
            g.save();
            g.beginPath();
            g.moveTo(kp[0][0], kp[0][1]);
            for (let q = 1; q < kp.length; q++) g.lineTo(kp[q][0], kp[q][1]);
            g.closePath(); g.clip();
            g.fillStyle = 'rgba(255,255,255,.2)';
            g.beginPath();
            g.ellipse(kx - kw * 0.2, ky - 0.8, kw * 0.6, 1.6, 0, 0, WS.TAU);
            g.fill();
            g.restore();
            rivets(g, C.plateRamp, kx - kw * 0.8, ky + 2.2, kx + kw * 0.8, ky + 2.2, 2);
          }
          g.save();
          /* Light ON TOP of the cap and shadow under it, at low opacity. At
             full strength this was a dark ring round the leg and read as a
             garter - a knee is where the limb catches the light, not a band
             tied round it. */
          g.globalAlpha = dir < 0 ? 0.22 : 0.4;
          lit(g, C.legRamp, kx - kw, ky - 3.2, kx + kw, ky + 2.2);
          g.beginPath();
          g.ellipse(kx + dir * 0.4, ky - 0.5, kw, 2.3, 0, 0, WS.TAU);
          g.fill();
          g.strokeStyle = C.legRamp.line;
          g.globalAlpha = dir < 0 ? 0.3 : 0.5;
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(kx - kw * 0.85, ky + 1.9);
          g.quadraticCurveTo(kx + dir * 0.4, ky + 3.2, kx + kw * 0.85, ky + 1.9);
          g.stroke();
          g.restore();
        }
        /* The boot is drawn as a shape with a toe, sitting ON the ground line
         * rather than an ellipse hovering near it. Two survivors ago these
         * were detached brown ovals and the whole cast looked like it was on
         * casters. */
        // The boot tips onto its toe as the leg goes back, and lands flat as
        // it comes forward - two units of rotation and the foot has a roll.
        const tilt = -lead * 2.2;
        const bootRamp = dir < 0 ? ramp([0.26, 0.19, 0.12], 'leather') : LEATHER;
        panel(g, [[fx - b.leg * 0.5, foot - 2], [fx + b.leg * 0.5, foot - 2],
          [fx + dir * b.leg * 0.95, foot + 4.5 + tilt], [fx - dir * b.leg * 0.45, foot + 4.5 - tilt]],
          bootRamp);
        /* A boot is a shoe on a SOLE, with a cuff where the leg goes in. The
           shape alone was one leather wedge, and the lowest thing in the tile
           - the part the eye lands on where the figure meets the ground - had
           the least drawn on it of anything in the rig. */
        /* Inset from the boot's own bottom edge rather than coincident with
           it. Sharing the edge exactly put a second fill's antialiasing on
           the same boundary pixel, which lifted it over the framing check's
           alpha floor and left the heavier survivors 1px against the bottom
           of their tile in the going-down pose. The boot keeps the
           silhouette; the sole is a band inside it. */
        panel(g, [
          [fx - dir * b.leg * 0.42, foot + 3.1 - tilt * 0.6],
          [fx + dir * b.leg * 0.92, foot + 3.1 + tilt * 0.6],
          [fx + dir * b.leg * 0.90, foot + 4.15 + tilt * 0.92],
          [fx - dir * b.leg * 0.42, foot + 4.15 - tilt * 0.92],
        ], ramp([0.17, 0.14, 0.12], 'leather'));
        // A strap over the instep. Two hard lines where the boot closes, which
        // is the one place on a leg the eye already goes.
        g.save();
        g.strokeStyle = ramp([0.22, 0.16, 0.10], 'leather').line;
        g.globalAlpha = 0.7; g.lineWidth = 1.1; g.lineCap = 'round';
        for (const k of [0, 1]) {
          g.beginPath();
          g.moveTo(fx - b.leg * 0.46, foot - 0.6 + k * 1.9);
          g.lineTo(fx + b.leg * (0.5 + k * 0.1), foot + 0.1 + k * 1.9 + tilt * 0.3);
          g.stroke();
        }
        g.globalAlpha = 0.9;
        g.fillStyle = GOLD.shade;
        g.fillRect(fx - b.leg * 0.12, foot - 1.2, 1.6, 1.4);
        g.restore();
        /* The heel, under the back of the foot only - and it stops AT the
           sole, it does not hang below it. Built to project 0.9 below and
           0.05 of a leg behind, it put three of the heavier survivors 1px
           against their own tile edge once the going-down pose rotated the
           figure: the foot is the furthest thing from the pivot, so anything
           added there is multiplied by the fall. The sole is what meets the
           ground, so the heel takes its depth upward instead. */
        panel(g, [
          [fx - dir * b.leg * 0.45, foot + 2.6 - tilt],
          [fx - dir * b.leg * 0.05, foot + 2.6 - tilt * 0.5],
          [fx - dir * b.leg * 0.10, foot + 4.5 - tilt * 0.5],
          [fx - dir * b.leg * 0.45, foot + 4.5 - tilt],
        ], ramp([0.13, 0.11, 0.10], 'leather'));
        // and the cuff the leg goes into
        const cuffPts = [
          [fx - b.leg * 0.56, foot - 3.6],
          [fx + b.leg * 0.56, foot - 3.6],
          [fx + b.leg * 0.50, foot - 0.6],
          [fx - b.leg * 0.50, foot - 0.6],
        ];
        panel(g, cuffPts, C.trimRamp);
        rivets(g, C.trimRamp, fx - b.leg * 0.42, foot - 2.1,
          fx + b.leg * 0.42, foot - 2.1, 3);
        if (cfg.pauldrons) {
          /* Greaves, on anyone in plate. Overlapping strips up the shin, which
             is how a leg in armour is built and how it stops being a column. */
          const gv = [[fx - b.leg * 0.5, foot - 15], [fx + b.leg * 0.5, foot - 15],
            [fx + b.leg * 0.54, foot - 3.4], [fx - b.leg * 0.54, foot - 3.4]];
          panel(g, gv, C.plateRamp);
          lames(g, C.plateRamp, gv, 3, true);
          rivets(g, C.plateRamp, fx - b.leg * 0.4, foot - 13.4,
            fx + b.leg * 0.4, foot - 13.4, 2);
        }
      }
    }

    // Torso: shoulders down to waist, tapered. One shape, so the outline is one
    // shape, which is the whole point of the silhouette rule.
    const torso = [[cx - b.sh, SHOULDER_Y - 2], [cx + b.sh, SHOULDER_Y - 2],
      [cx + b.waist, WAIST_Y], [cx - b.waist, WAIST_Y]];
    panel(g, torso, C.bodyRamp);
    /* A COLLAR. The garment ran straight into the neck with no edge on it -
       and the neckline is the one part of a costume everybody looks at,
       because it is next to the face. */
    panel(g, [[cx - b.sh * 0.58, SHOULDER_Y - 2.6], [cx + b.sh * 0.58, SHOULDER_Y - 2.6],
      [cx + b.sh * 0.48, SHOULDER_Y + 2.4], [cx - b.sh * 0.48, SHOULDER_Y + 2.4]],
      C.trimRamp);
    g.save();
    g.strokeStyle = C.trimRamp.line; g.globalAlpha = 0.5; g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(cx - b.sh * 0.5, SHOULDER_Y + 0.4);
    g.lineTo(cx + b.sh * 0.5, SHOULDER_Y + 0.4);
    g.stroke();
    g.restore();
    if (!cfg.pauldrons) {
      /* A GAMBESON on everyone who is not in plate.
       *
       * Cloth is not a flat field either. Padded armour is quilted, and the
       * quilting is a grid of seams with the padding standing proud between
       * them - a dark stitch line with a lit roll beside it, which is the
       * same two marks a fold is made of and the same two the lames are.
       * Kept to the chest so the belt and the sash still read, and clipped to
       * the torso so the silhouette is untouched. */
      g.save();
      g.beginPath();
      g.moveTo(torso[0][0], torso[0][1]);
      for (let i = 1; i < torso.length; i++) g.lineTo(torso[i][0], torso[i][1]);
      g.closePath(); g.clip();
      const top = SHOULDER_Y + 1, bot = WAIST_Y - 3;
      for (let i = 1; i <= 3; i++) {
        const y = top + (bot - top) * (i / 4);
        g.strokeStyle = C.bodyRamp.line; g.globalAlpha = 0.42; g.lineWidth = 0.85;
        g.beginPath();
        g.moveTo(cx - b.sh, y - 0.6); g.quadraticCurveTo(cx, y + 1, cx + b.sh, y - 0.6);
        g.stroke();
        g.strokeStyle = C.bodyRamp.key; g.globalAlpha = 0.26; g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(cx - b.sh, y + 0.9); g.quadraticCurveTo(cx, y + 2.5, cx + b.sh, y + 0.9);
        g.stroke();
      }
      for (const dx of [-3.4, 3.4]) {
        g.strokeStyle = C.bodyRamp.line; g.globalAlpha = 0.34; g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(cx + dx, top); g.lineTo(cx + dx * 1.25, bot);
        g.stroke();
      }
      g.restore();
      // and a seam where the sleeve is set into the shoulder
      for (const dir of [-1, 1]) {
        g.save();
        g.strokeStyle = C.bodyRamp.line; g.globalAlpha = 0.4; g.lineWidth = 0.9;
        g.beginPath();
        g.moveTo(cx + dir * (b.sh - 2.4), SHOULDER_Y - 1.4);
        g.quadraticCurveTo(cx + dir * (b.sh - 0.6), SHOULDER_Y + 3.5,
          cx + dir * (b.sh - 2.8), SHOULDER_Y + 7.5);
        g.stroke();
        g.restore();
      }
    }
    if (cfg.pauldrons) {
      /* A CUIRASS on anyone wearing plate on their shoulders. The torso is the
         largest single field on the figure and on the three heavies it was
         one flat trapezoid - which is why they were the flattest survivors in
         the cast by a wide margin while wearing the most armour of anyone.
         A breastplate is a raised centre with a rolled edge, a belly lame at
         the bottom, and rivets where the straps go. */
      const cw = b.sh * 0.78, bw = b.waist * 0.82;
      const chest = [[cx - cw, SHOULDER_Y + 1], [cx + cw, SHOULDER_Y + 1],
        [cx + bw, WAIST_Y - 2.5], [cx - bw, WAIST_Y - 2.5]];
      panel(g, chest, C.plateRamp);
      lames(g, C.plateRamp, chest, 2, true);
      g.save();
      g.beginPath();
      g.moveTo(chest[0][0], chest[0][1]);
      for (let i = 1; i < chest.length; i++) g.lineTo(chest[i][0], chest[i][1]);
      g.closePath(); g.clip();
      // the keel down the middle, which is what makes a breastplate a dome
      g.strokeStyle = C.plateRamp.key;
      g.globalAlpha = 0.34; g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(cx - 0.6, SHOULDER_Y + 1); g.lineTo(cx - 0.6, WAIST_Y - 2.5);
      g.stroke();
      g.strokeStyle = C.plateRamp.line;
      g.globalAlpha = 0.4;
      g.beginPath();
      g.moveTo(cx + 0.8, SHOULDER_Y + 1); g.lineTo(cx + 0.8, WAIST_Y - 2.5);
      g.stroke();
      g.restore();
      rivets(g, C.plateRamp, cx - cw + 1.2, SHOULDER_Y + 3.2,
        cx - bw + 1, WAIST_Y - 4.5, 3);
      rivets(g, C.plateRamp, cx + cw - 1.2, SHOULDER_Y + 3.2,
        cx + bw - 1, WAIST_Y - 4.5, 3);
    }

    if (cfg.tabard) {
      // A band of the survivor's own colour down the chest: the single
      // clearest way to say who this is without touching the silhouette.
      panel(g, [[cx - 4.5, SHOULDER_Y - 1], [cx + 4.5, SHOULDER_Y - 1],
        [cx + 5.5, cfg.robe ? WAIST_Y + 12 : WAIST_Y + 4], [cx, cfg.robe ? WAIST_Y + 16 : WAIST_Y + 8],
        [cx - 5.5, cfg.robe ? WAIST_Y + 12 : WAIST_Y + 4]], C.accentRamp);
      if (cfg.device) {
        // A charge on the tabard. A blank band is livery; a mark on it is an
        // order somebody swore to.
        g.fillStyle = GOLD.key;
        g.beginPath();
        g.moveTo(cx, SHOULDER_Y + 3);
        g.lineTo(cx + 3.4, SHOULDER_Y + 8.5);
        g.lineTo(cx, SHOULDER_Y + 14);
        g.lineTo(cx - 3.4, SHOULDER_Y + 8.5);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(10,8,6,.5)';
        g.beginPath(); g.arc(cx, SHOULDER_Y + 8.5, 1.3, 0, WS.TAU); g.fill();
      }
    }

    if (cfg.sash) {
      // A band across the chest, shoulder to opposite hip. The one diagonal in
      // a figure built entirely from verticals, which is why it reads.
      panel(g, [[cx - b.sh + 1, SHOULDER_Y - 1], [cx - b.sh + 6, SHOULDER_Y - 2],
        [cx + b.waist + 1, WAIST_Y - 3], [cx + b.waist - 4, WAIST_Y - 2]], C.trimRamp);
      g.fillStyle = GOLD.core;
      g.beginPath(); g.arc(cx - b.sh + 4.5, SHOULDER_Y + 1.5, 2.1, 0, WS.TAU); g.fill();
    }
    if (cfg.stole) {
      // Two bands hanging from the collar, ending in a hem device.
      for (const dir of [-1, 1]) {
        const x = cx + dir * 6.5;
        panel(g, [[x - 2.3, SHOULDER_Y - 1], [x + 2.3, SHOULDER_Y - 1],
          [x + 2.6, WAIST_Y + 9], [x - 2.6, WAIST_Y + 9]], C.trimRamp);
        g.fillStyle = GOLD.core;
        g.fillRect(x - 2.4, WAIST_Y + 4, 4.8, 1.6);
        g.beginPath(); g.arc(x, WAIST_Y + 11, 1.6, 0, WS.TAU); g.fill();
      }
    }
    if (cfg.pelt) {
      /* Fur over the far shoulder: the only soft, irregular edge on a figure
       * otherwise made of cut cloth and plate, and the fastest way to say
       * somebody lives outdoors. */
      const px = cx - b.sh - 1;
      for (let i = 0; i < 5; i++) {
        const t2 = i / 4;
        panel(g, [[px - 4 + t2 * 12, SHOULDER_Y - 5 + t2 * 2],
          [px - 1 + t2 * 12, SHOULDER_Y - 6 + t2 * 2],
          [px + 1 + t2 * 11, SHOULDER_Y + 7 + t2 * 3],
          [px - 4 + t2 * 11, SHOULDER_Y + 6 + t2 * 3]],
          i % 2 ? C.furRamp : C.furDark);
      }
    }
    // Belt, always: it divides the torso and gives the waist a reason to exist.
    panel(g, [[cx - b.waist - 0.5, WAIST_Y - 4], [cx + b.waist + 0.5, WAIST_Y - 4],
      [cx + b.waist + 0.5, WAIST_Y], [cx - b.waist - 0.5, WAIST_Y]], LEATHER);
    /* The buckle was a filled gold rectangle, which is a label rather than a
       fastening. A buckle is a FRAME with the belt showing through it, a
       tongue across the middle, and a tail of strap hanging past it - three
       marks, and they land dead centre where the eye already is. */
    {
      const bw = 3.2, bh = 3.4, by = WAIST_Y - 3.7;
      panel(g, [[cx - bw, by], [cx + bw, by], [cx + bw, by + bh], [cx - bw, by + bh]], GOLD);
      g.fillStyle = LEATHER.shade;
      g.fillRect(cx - bw + 0.9, by + 0.9, (bw - 0.9) * 2, bh - 1.8);
      g.fillStyle = GOLD.key;
      g.fillRect(cx - 0.45, by + 0.4, 0.9, bh - 0.8);      // the tongue
      // the tail of the strap, threaded through and hanging
      panel(g, [[cx + bw, WAIST_Y - 3.4], [cx + bw + 3.6, WAIST_Y - 3.2],
        [cx + bw + 3.2, WAIST_Y + 2.6], [cx + bw - 0.2, WAIST_Y + 2.2]], LEATHER);
      /* A POUCH, on the far hip. Everybody in this game carries potions and
         nobody had anywhere to put them - and a belt with one thing on it is
         a belt, while a belt with two is kit. */
      const qx = cx - b.waist * 0.62;
      panel(g, [[qx - 3.2, WAIST_Y - 2.6], [qx + 3.2, WAIST_Y - 2.6],
        [qx + 2.8, WAIST_Y + 4.4], [qx - 2.8, WAIST_Y + 4.4]],
        ramp([0.34, 0.25, 0.16], 'leather'));
      panel(g, [[qx - 3.4, WAIST_Y - 3.2], [qx + 3.4, WAIST_Y - 3.2],
        [qx + 3, WAIST_Y - 0.4], [qx - 3, WAIST_Y - 0.4]],
        ramp([0.42, 0.31, 0.20], 'leather'));
      g.fillStyle = GOLD.core;
      g.beginPath(); g.ellipse(qx, WAIST_Y - 0.6, 1.1, 0.9, 0, 0, WS.TAU); g.fill();
    }

    if (cfg.strap) {
      // A strap across the chest, the other way from a sash - it is holding
      // the quiver on, and it says so by running to the shoulder it hangs off.
      panel(g, [[cx + b.sh - 2, SHOULDER_Y - 1], [cx + b.sh - 7, SHOULDER_Y - 2],
        [cx - b.waist - 1, WAIST_Y - 3], [cx - b.waist + 4, WAIST_Y - 2]], LEATHER);
    }
    if (cfg.bootknife) {
      // A knife strapped to the outside of the near boot.
      const kx = cx + b.hip + 1;
      panel(g, [[kx - 1.6, FOOT_Y - 17], [kx + 1.6, FOOT_Y - 17.4],
        [kx + 1.9, FOOT_Y - 8], [kx - 1.9, FOOT_Y - 7.6]], LEATHER);
      g.fillStyle = STEEL.key;
      g.fillRect(kx - 1.1, FOOT_Y - 20, 2.2, 3.2);
    }
    if (cfg.sheaths) {
      // Two sheaths on the belt, angled back. Says the blades in the hands are
      // not the only ones, which is the whole idea of a knife fighter.
      for (const dir of [-1, 1]) {
        g.save();
        g.translate(cx + dir * (b.waist - 1), WAIST_Y - 1);
        g.rotate(dir * 0.42);
        panel(g, [[-2, 0], [2, 0], [1.4, 11], [-1.4, 11]], LEATHER);
        g.fillStyle = STEEL.shade;
        g.fillRect(-1.4, -2.5, 2.8, 3);
        g.restore();
      }
    }
    if (cfg.chains) {
      // Links at the hip, hanging and swinging nowhere. Bound to something.
      g.strokeStyle = STEEL.shade; g.lineWidth = 1.1;
      for (const [ox, len] of [[-3, 13], [1.5, 9]]) {
        const hx = cx + b.waist - 2 + ox;
        g.beginPath();
        g.moveTo(hx, WAIST_Y - 1);
        g.quadraticCurveTo(hx + 3, WAIST_Y + len * 0.6, hx + 1, WAIST_Y + len);
        g.stroke();
        g.fillStyle = STEEL.core;
        g.beginPath(); g.arc(hx + 1, WAIST_Y + len + 1.2, 1.5, 0, WS.TAU); g.fill();
      }
    }
    if (cfg.tome) {
      // A book at the hip, clasped, with the survivor's light leaking out of it.
      const tx = cx - b.waist - 3;
      panel(g, [[tx - 5, WAIST_Y + 1], [tx + 4, WAIST_Y - 1],
        [tx + 5, WAIST_Y + 10], [tx - 4, WAIST_Y + 12]], ramp([0.30, 0.17, 0.14]));
      g.fillStyle = GOLD.core;
      g.fillRect(tx - 4.5, WAIST_Y + 4, 9, 1.4);
      g.fillStyle = C.accentLight;
      g.fillRect(tx + 3.4, WAIST_Y + 0.5, 1.5, 10);
      glow(g, tx + 4, WAIST_Y + 5, 7, C.accent, 0.45);
    }
    /* The warrior had a shield slung on his back for one build and it went
     * again: it filled the gap under his axe arm, and that gap was the best
     * thing about his outline - a heavy who is all shoulders and one weapon,
     * with nothing in the other hand. Not every silhouette wants filling in.
     */
    if (cfg.legwraps) {
      // Bound shins. Cheap, and it stops the legs reading as two bare posts.
      for (const dir of [-1, 1]) {
        const hx = cx + dir * (b.hip - b.leg * 0.5) + dir * 1;
        for (let i = 0; i < 3; i++) {
          panel(g, [[hx - 3.4, HIP_Y + 9 + i * 4], [hx + 3.4, HIP_Y + 8.4 + i * 4],
            [hx + 3.4, HIP_Y + 11 + i * 4], [hx - 3.4, HIP_Y + 11.6 + i * 4]],
            i % 2 ? LEATHER : C.trimRamp);
        }
      }
    }
    if (cfg.hoodDown) {
      /* The hood a ranger is NOT wearing: a roll of cloth bunched behind the
       * neck. Drawn HERE, in the body, so the head lands on top of it and it
       * reads as being behind him - drawn in the head pass it sat in front and
       * spread into a bib across his chest, which is neither a hood up nor a
       * hood down but a bath towel. Small, and it only has to peek. */
      panel(g, [[cx - 12, SHOULDER_Y + 3], [cx - 10.5, SHOULDER_Y - 5],
        [cx - 4, SHOULDER_Y - 8], [cx + 4, SHOULDER_Y - 8],
        [cx + 10.5, SHOULDER_Y - 5], [cx + 12, SHOULDER_Y + 3],
        [cx + 6, SHOULDER_Y + 5], [cx - 6, SHOULDER_Y + 5]], C.trimRamp);
      g.strokeStyle = 'rgba(0,0,0,.30)'; g.lineWidth = 0.9;
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + dir * 4, SHOULDER_Y - 7);
        g.quadraticCurveTo(cx + dir * 9, SHOULDER_Y - 3, cx + dir * 9.5, SHOULDER_Y + 3);
        g.stroke();
      }
    }
    if (cfg.pauldrons) {
      /* A plate with a lip, not a sphere. Ellipses on the shoulders read as
       * ball joints - the flat top and the flared skirt are what say armour. */
      const k = cfg.pauldrons;
      for (const dir of [-1, 1]) {
        const px = cx + dir * (b.sh + 0.5);
        const shape = [[px - dir * 5 * k, SHOULDER_Y - 3.4 * k],
          [px + dir * 2.4 * k, SHOULDER_Y - 3.1 * k],
          [px + dir * 4.4 * k, SHOULDER_Y - 0.6 * k],
          [px + dir * 4 * k, SHOULDER_Y + 2.6 * k],
          [px - dir * 5 * k, SHOULDER_Y + 2.2 * k]];
        const pr = dir < 0 ? ramp([0.40, 0.44, 0.52], 'metal') : C.plateRamp;
        panel(g, shape, pr);
        /* A pauldron is not one piece of steel. Two lames across it and a row
           of rivets along the lip is what tells plate from a painted shape,
           and both are hard marks - the thing this rig keeps proving is that
           a gradient inside an outline measures and reads as nothing. */
        lames(g, pr, shape, 2, true);
        rivets(g, pr, px - dir * 4.2 * k, SHOULDER_Y + 1.9 * k,
          px + dir * 3.2 * k, SHOULDER_Y + 2.2 * k, k > 2 ? 4 : 3);
        if (dir > 0) {
          g.fillStyle = 'rgba(255,255,255,.22)';
          g.beginPath();
          g.moveTo(px - dir * 4.4 * k, SHOULDER_Y - 3 * k);
          g.lineTo(px + dir * 2.2 * k, SHOULDER_Y - 2.8 * k);
          g.lineTo(px + dir * 3.4 * k, SHOULDER_Y - 1.2 * k);
          g.lineTo(px - dir * 4.4 * k, SHOULDER_Y - 1.6 * k);
          g.closePath(); g.fill();
        }
      }
    }
    if (cfg.mantle) {
      /* A collar of feathers, hung from the shoulder line and falling out and
       * down. Four to a side, alternating length so the fringe is ragged
       * rather than combed - a row of identical spikes reads as armour, and
       * the whole point of this shape is that it is NOT armour. It is also the
       * biggest silhouette change available for the money: it widens the
       * shoulders with something soft, which no other survivor has. */
      for (const dir of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const t = i / 3;
          const rootX = cx + dir * (3 + t * (b.sh + 3));
          const len = 11 + (i % 2 ? 7 : 0) + t * 7;
          const spread = dir * (2 + t * 9);
          const tip = [rootX + spread + dir * 1.4, SHOULDER_Y + len];
          panel(g, [[rootX - dir * 2.4, SHOULDER_Y - 2],
            [rootX + dir * 2.4, SHOULDER_Y - 2.8], tip,
            [rootX + spread - dir * 2, SHOULDER_Y + len - 2]],
            i % 2 ? C.featherRamp : C.featherDark);
          // A quill down the middle: it separates one feather from the next,
          // which four flat shapes side by side never manage on their own.
          g.strokeStyle = 'rgba(24,18,12,.45)'; g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(rootX, SHOULDER_Y - 1);
          g.lineTo(tip[0] - dir * 0.6, tip[1] - 1);
          g.stroke();
        }
      }
      // Three beads on a thong where the feathers are bound.
      for (let i = -1; i <= 1; i++) {
        g.fillStyle = i === 0 ? C.accent : GOLD.core;
        g.beginPath(); g.arc(cx + i * 4.5, SHOULDER_Y + 1.5, 1.5, 0, WS.TAU); g.fill();
      }
    }
    if (cfg.wisp) {
      // A second small light, keeping station off the shoulder. Something is
      // following him, and it is not the orb in his hand.
      const wx = cx - b.sh - 6, wy = SHOULDER_Y - 7;
      glow(g, wx, wy, 11, C.accent, 0.75);
      g.fillStyle = C.accentLight;
      g.beginPath(); g.ellipse(wx, wy, 2.4, 3, -0.3, 0, WS.TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.beginPath(); g.arc(wx - 0.6, wy - 0.9, 0.9, 0, WS.TAU); g.fill();
    }
    if (cfg.sigils) {
      // Marks that are lit from underneath the skin, not painted on it.
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55;
      g.strokeStyle = C.accentLight; g.lineWidth = 1.2; g.lineCap = 'round';
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + dir * 4, SHOULDER_Y + 4);
        g.quadraticCurveTo(cx + dir * 9, WAIST_Y - 12, cx + dir * 5.5, WAIST_Y - 5);
        g.stroke();
        g.beginPath();
        g.moveTo(cx + dir * 6.5, SHOULDER_Y + 8);
        g.lineTo(cx + dir * 10.5, SHOULDER_Y + 6.5);
        g.stroke();
      }
      g.restore();
    }
    // Collar last, over the torso and under the head: it closes the neck.
    panel(g, [[cx - 8, SHOULDER_Y - 3], [cx + 8, SHOULDER_Y - 3],
      [cx + 6, SHOULDER_Y + 2], [cx - 6, SHOULDER_Y + 2]], C.collarRamp);

    if (cfg.sleeves) {
      /* Bell cuffs on both arms. The mage was the plainest figure in the
       * roster - a robe and a stick - and a caster's sleeve is the one piece
       * of clothing that widens as it goes DOWN, which nothing else here
       * does. */
      for (const dir of [-1, 1]) {
        const wx = cx + dir * (b.sh + 1);
        panel(g, [[wx - dir * 3, WAIST_Y - 15], [wx + dir * 3.5, WAIST_Y - 15.5],
          [wx + dir * 7, WAIST_Y - 1], [wx - dir * 5, WAIST_Y]],
          dir > 0 ? C.bodyRamp : C.legRamp);
        panel(g, [[wx - dir * 5, WAIST_Y], [wx + dir * 7, WAIST_Y - 1],
          [wx + dir * 6.5, WAIST_Y + 2.5], [wx - dir * 4.5, WAIST_Y + 3.5]], C.trimRamp);
      }
    }
    if (cfg.armwraps) {
      // Bare arms, bound from wrist to elbow. Everyone else has sleeves.
      for (const dir of [-1, 1]) {
        const wx = cx + dir * (b.sh + 1);
        for (let i = 0; i < 4; i++) {
          panel(g, [[wx - 3, WAIST_Y - 13 + i * 3.2], [wx + 3, WAIST_Y - 13.6 + i * 3.2],
            [wx + 3, WAIST_Y - 11.4 + i * 3.2], [wx - 3, WAIST_Y - 10.8 + i * 3.2]],
            i % 2 ? C.trimRamp : LEATHER);
        }
      }
    }
    // Near arm, over the torso, with a hand.
    taper(g, cx + b.sh - 1, SHOULDER_Y + 1, cx + b.sh + 2 + w.swing * 3.5, WAIST_Y - 2,
      b.arm * 0.68, b.arm * 0.4, C.bodyRamp);
    /* A VAMBRACE on the working forearm, for everyone.
     *
     * The arms were the last bare run of colour on the figure: one tapered
     * shape from shoulder to wrist with nothing between the two. Everybody
     * who swings something wears something on that arm - plate for the ones
     * already in plate, bound leather for the rest - and it lands right next
     * to the hand, which is where the eye is already going. */
    {
      const vr = cfg.pauldrons ? C.plateRamp : LEATHER;
      const vv = [[cx + b.sh - 1.8, WAIST_Y - 13], [cx + b.sh + 3.4, WAIST_Y - 13.4],
        [cx + b.sh + 3.8, WAIST_Y - 5.4], [cx + b.sh - 1.4, WAIST_Y - 5]];
      panel(g, vv, vr);
      if (cfg.pauldrons) {
        lames(g, vr, vv, 2, true);
        rivets(g, vr, cx + b.sh - 0.6, WAIST_Y - 6.4, cx + b.sh + 2.8, WAIST_Y - 6.6, 2);
      } else {
        g.save();
        g.strokeStyle = vr.line; g.globalAlpha = 0.55; g.lineWidth = 0.8;
        for (const k of [0, 1, 2]) {
          g.beginPath();
          g.moveTo(cx + b.sh - 1.6, WAIST_Y - 11.4 + k * 2.4);
          g.lineTo(cx + b.sh + 3.5, WAIST_Y - 11.7 + k * 2.4);
          g.stroke();
        }
        g.restore();
      }
    }
    if (cfg.bracer) {
      // A wide cuff on the working arm. One hard edge on a soft limb, and it
      // lands exactly where the eye already is - at the hands.
      panel(g, [[cx + b.sh - 1.5, WAIST_Y - 12], [cx + b.sh + 4.5, WAIST_Y - 12.5],
        [cx + b.sh + 5, WAIST_Y - 4], [cx + b.sh - 1, WAIST_Y - 3.5]], LEATHER);
      g.fillStyle = GOLD.core;
      g.fillRect(cx + b.sh - 1, WAIST_Y - 9.5, 5.6, 1.4);
    }
    g.restore();
    /* A hand the width of the wrist it belongs to, not a knob on the end of
     * it - and in the right material. The graveblade's arm and hand were built
     * from his garment ramp, which is crimson, and hung in front of a crimson
     * cloak: the hand simply vanished, and with it the fact that he is holding
     * anything. Gauntlets put dark steel between the two. */
    if (cfg.gauntlets) {
      taper(g, cx + b.sh - 1, WAIST_Y - 14, cx + b.sh + 2, WAIST_Y - 2,
        b.arm * 0.6, b.arm * 0.46, ramp([0.30, 0.32, 0.38]));
      const plate = ramp([0.38, 0.40, 0.46], 'metal');
      hand(g, cx + b.sh + 2.4, WAIST_Y - 0.5, b.arm * 0.5, b.arm * 0.56,
        plate, -1, ramp([0.30, 0.32, 0.38], 'metal'));
      // and a plate over the back of it, which is the point of a gauntlet
      g.save();
      g.beginPath();
      g.ellipse(cx + b.sh + 2.4, WAIST_Y - 0.5, b.arm * 0.5, b.arm * 0.56, 0, 0, WS.TAU);
      g.clip();
      panel(g, [[cx + b.sh + 0.6, WAIST_Y - 3.2], [cx + b.sh + 4.6, WAIST_Y - 2.8],
        [cx + b.sh + 4.4, WAIST_Y + 0.4], [cx + b.sh + 0.8, WAIST_Y]],
        ramp([0.46, 0.48, 0.55], 'metal'));
      g.restore();
      g.fillStyle = 'rgba(255,255,255,.22)';
      g.beginPath();
      g.ellipse(cx + b.sh + 1.4, WAIST_Y - 1.8, b.arm * 0.22, b.arm * 0.16, -0.4, 0, WS.TAU);
      g.fill();
    } else {
      hand(g, cx + b.sh + 2.4, WAIST_Y - 0.5, b.arm * 0.44, b.arm * 0.5, SKIN, -1,
        cfg.bracer ? null : C.bodyRamp);
    }
  }

  /* ------------------------------------------------------------- cloaks --- */
  function drawCloak(g, cfg, C, b, w) {
    const cx = 50, k = cfg.cloak;
    if (!k) return;
    const foot = k === 'short' ? WAIST_Y + 6 : FOOT_Y - 1;
    const flare = k === 'short' ? 5 : 11;
    // The cloak trails: pinned at the shoulders, loose at the hem, and it
    // lags the body by half a beat because cloth does.
    const trail = -w.swing * 5;
    const pts = [[cx - b.sh - 1, SHOULDER_Y - 4], [cx + b.sh + 1, SHOULDER_Y - 4],
      [cx + b.sh + flare + trail, foot]];
    if (k === 'cut') {
      /* Cut away on one side. A hem that is level all round reads as a
       * garment; one that is short over the leading leg reads as a garment
       * somebody has to move in. */
      pts.push([cx + b.sh + flare - 1, WAIST_Y + 16]);
      pts.push([cx + 2, WAIST_Y + 9]);
      pts.push([cx - b.sh - flare + trail, foot]);
    } else if (k === 'tattered') {
      // A ragged hem, cut with the same seed every time so the character does
      // not change clothes between the roster and the run.
      const teeth = 7;
      for (let i = 0; i <= teeth; i++) {
        const t = 1 - i / teeth;
        const x = cx - b.sh - flare + trail + (b.sh + flare) * 2 * t;
        pts.push([x, foot - (i % 2 ? 9 : 1) - (i % 3) * 2.5]);
      }
    } else {
      pts.push([cx - b.sh - flare, foot]);
    }
    panel(g, pts, C.cloakRamp);
    /* FOLDS. Cloth pinned at the shoulders and loose at the hem does not hang
       flat - it gathers into vertical channels that widen as they fall, and
       that is most of what tells cloth from card. Drawn as pairs of soft
       bands, clipped to the cloak so a fold cannot run off its own edge, and
       leaning with the trail so they swing when the survivor does. */
    g.save();
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.clip();
    const drop = foot - (SHOULDER_Y - 4);
    for (let i = -3; i <= 3; i++) {
      if (!i) continue;
      const topX = cx + i * b.sh * 0.30;
      const botX = cx + i * (b.sh + flare) * 0.44 + trail * 0.55;
      const wide = 1.1 + Math.abs(i) * 0.5;
      // the shaded side of the channel
      const shade = g.createLinearGradient(topX - wide, 0, topX + wide, 0);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(0.5, 'rgba(0,0,0,.22)');
      shade.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = shade;
      g.beginPath();
      g.moveTo(topX - wide, SHOULDER_Y - 4);
      g.lineTo(topX + wide, SHOULDER_Y - 4);
      g.lineTo(botX + wide * 2.1, foot + 2);
      g.lineTo(botX - wide * 2.1, foot + 2);
      g.closePath();
      g.fill();
      // and the lit crest just beside it, which is what makes it read as a
      // ridge rather than as a stripe
      const crest = g.createLinearGradient(topX + wide, 0, topX + wide * 3.2, 0);
      crest.addColorStop(0, 'rgba(255,255,255,.21)');
      crest.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = crest;
      g.beginPath();
      g.moveTo(topX + wide, SHOULDER_Y - 4);
      g.lineTo(topX + wide * 3.2, SHOULDER_Y - 4);
      g.lineTo(botX + wide * 5, foot + 2);
      g.lineTo(botX + wide * 2.1, foot + 2);
      g.closePath();
      g.fill();
      /* The line where the two meet. Shade and crest are both ramps, and two
         ramps butted together still measure as flat - the cloaked survivors
         were the three lowest in the cast for interior detail while carrying
         four folds each. The ridge itself is an edge. */
      g.strokeStyle = 'rgba(0,0,0,.21)';
      g.lineWidth = 0.85;
      g.beginPath();
      g.moveTo(topX + wide, SHOULDER_Y - 4);
      g.lineTo(botX + wide * 2.1, foot + 2);
      g.stroke();
    }
    /* A BAND ALONG THE HEM. The cloak is the largest single field on the two
       survivors who wear a big one, and after the folds it was still the flat
       part of them. A hem is a doubled edge of cloth - heavier, darker, and
       stitched - so it is three marks and all of them are lines. */
    g.strokeStyle = 'rgba(0,0,0,.30)';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(pts[pts.length - 1][0], pts[pts.length - 1][1] - 2.4);
    for (let i = pts.length - 2; i >= 2; i--) g.lineTo(pts[i][0], pts[i][1] - 2.4);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.14)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(pts[pts.length - 1][0], pts[pts.length - 1][1] - 4.2);
    for (let i = pts.length - 2; i >= 2; i--) g.lineTo(pts[i][0], pts[i][1] - 4.2);
    g.stroke();
    g.restore();
    void drop;
    // The lining catches the light along the shoulder line only.
    g.fillStyle = 'rgba(255,255,255,.10)';
    g.beginPath();
    g.moveTo(cx - b.sh - 1, SHOULDER_Y - 4); g.lineTo(cx + b.sh + 1, SHOULDER_Y - 4);
    g.lineTo(cx + b.sh + 2, SHOULDER_Y + 1); g.lineTo(cx - b.sh - 2, SHOULDER_Y + 1);
    g.closePath(); g.fill();
  }

  /* ------------------------------------------------------------ weapons --- */
  /* Each one is held, not floating: the grip lands on the near hand at
   * (50 + sh + 2, WAIST_Y - 1), and every silhouette below is shaped to break
   * the figure's outline so it registers at a glance. */
  const WEAPONS = {
    staff(g, C, b) {
      /* The haft had nothing on it between the hand and the head - a smooth
         dowel with a gold pill balanced on top. It is gripped where the hand
         is, and the stone is HELD by a collar rather than resting on the end
         of a stick. */
      const gx = 50 + b.sh + 3;
      limb(g, gx - 2, FOOT_Y - 2, gx + 3, CEIL + 9, 3.2, WOOD);
      grip(g, gx - 2, FOOT_Y - 2, gx + 3, CEIL + 9, 0.34, 0.58, 3.6);
      /* A CLAW SETTING, and the claws go in FRONT of the stone.
         Drawn behind it they were hidden completely, and three thick gold
         prongs converging over a pale bead read as a lit torch rather than as
         something holding a gem. The order is collar, stone, claws - the same
         order a jeweller works in, and the only one where the metal is seen to
         grip anything. */
      const sx = gx + 3, sy = CEIL + 6.4;
      panel(g, [[sx - 5.2, CEIL + 13.2], [sx + 5.2, CEIL + 12.8],
        [sx + 4.2, CEIL + 10.2], [sx - 4.2, CEIL + 10.6]], GOLD);
      // the back prong, behind the stone: three claws in the silhouette, only
      // two of them crossing the face
      g.save();
      lit(g, ramp([0.52, 0.40, 0.16], 'metal'), sx, CEIL + 11, sx, CEIL + 2);
      g.beginPath();
      g.moveTo(sx - 1, CEIL + 11);
      g.quadraticCurveTo(sx - 1.2, sy, sx - 0.8, CEIL + 1.9);
      g.lineTo(sx + 0.8, CEIL + 1.9);
      g.quadraticCurveTo(sx + 1.2, sy, sx + 1, CEIL + 11);
      g.closePath(); g.fill();
      g.restore();
      glow(g, sx, sy, 6, C.accent, 0.9);
      g.fillStyle = C.accentLight;
      g.beginPath(); g.arc(sx, sy, 3.6, 0, WS.TAU); g.fill();
      g.save();
      g.beginPath(); g.arc(sx, sy, 3.6, 0, WS.TAU); g.clip();
      const gsh = g.createRadialGradient(sx - 1.3, sy - 1.5, 0.4, sx + 1.2, sy + 1.8, 5.2);
      gsh.addColorStop(0, 'rgba(255,255,255,0)');
      gsh.addColorStop(1, 'rgba(18,24,48,.5)');
      g.fillStyle = gsh;
      g.beginPath(); g.arc(sx, sy, 3.6, 0, WS.TAU); g.fill();
      g.restore();
      for (const k of [-1, 1]) {
        g.save();
        lit(g, GOLD, sx + k * 4, CEIL + 11, sx + k * 3.4, CEIL + 2.4);
        g.beginPath();
        g.moveTo(sx + k * 4.2 - 0.7, CEIL + 11.2);
        g.quadraticCurveTo(sx + k * 5, sy, sx + k * 3.2, CEIL + 2.6);
        g.lineTo(sx + k * 2.4, CEIL + 3.2);
        g.quadraticCurveTo(sx + k * 3.6, sy, sx + k * 4.2 + 0.7, CEIL + 11.2);
        g.closePath(); g.fill();
        g.restore();
      }
      // Three runes holding station around the head of it. Nothing else in the
      // cast has anything floating, which is most of why it reads as magic.
      for (let i = 0; i < 3; i++) {
        const a = i * (WS.TAU / 3) + 0.4;
        const rx = gx + 3 + Math.cos(a) * 8.5, ry = CEIL + 6 + Math.sin(a) * 8.5;
        g.save();
        g.translate(rx, ry); g.rotate(a);
        g.fillStyle = C.accentLight;
        g.fillRect(-1.5, -0.5, 3, 1);
        g.fillRect(-0.5, -1.5, 1, 3);
        g.restore();
      }
    },
    censer(g, C, b) {
      // A lamp on a chain, swinging out from the hand. The chain is what makes
      // the light belong to the figure rather than hover beside it.
      const gx = 50 + b.sh + 2, hy = WAIST_Y - 2;
      /* A CHAIN, not a wire. One stroked curve of constant width is a cable;
         what says chain is that it is made of separate pieces, and at this
         size four links are enough to say it. */
      const link = (t) => {
        const u = 1 - t;
        return [u * u * gx + 2 * u * t * (gx + 6) + t * t * (gx + 7),
          u * u * hy + 2 * u * t * (hy + 6) + t * t * (hy + 13)];
      };
      for (let i = 0; i < 5; i++) {
        const a = link(i / 4.6), nb = link(i / 4.6 + 0.06);
        g.save();
        g.translate(a[0], a[1]);
        g.rotate(Math.atan2(nb[1] - a[1], nb[0] - a[0]));
        g.strokeStyle = i % 2 ? GOLD.shade : GOLD.core;
        g.lineWidth = 0.85;
        g.beginPath(); g.ellipse(0, 0, 1.9, 1.15, 0, 0, WS.TAU); g.stroke();
        g.restore();
      }
      // The lamp: a lid, a pierced body, a foot. It was one trapezoid.
      panel(g, [[gx + 2.6, hy + 14.6], [gx + 11.4, hy + 14.6],
        [gx + 10, hy + 16.4], [gx + 4, hy + 16.4]], GOLD);
      panel(g, [[gx + 3.6, hy + 16.2], [gx + 10.4, hy + 16.2],
        [gx + 9.5, hy + 22.4], [gx + 4.5, hy + 22.4]], GOLD);
      panel(g, [[gx + 4.4, hy + 22], [gx + 9.6, hy + 22],
        [gx + 8.8, hy + 24], [gx + 5.2, hy + 24]], GOLD);
      // the window the light comes out of, framed rather than painted on
      g.save();
      g.fillStyle = 'rgba(20,14,8,.7)';
      g.fillRect(gx + 4.6, hy + 17.2, 5.2, 4.4);
      g.fillStyle = C.accentLight;
      g.fillRect(gx + 5.2, hy + 17.8, 4, 3.2);
      g.restore();
      glow(g, gx + 7, hy + 19, 14, C.accent, 0.8);
      /* And the light lands on HER. A lamp that glows beside a figure without
       * touching it is a lamp painted on the same layer, not a lamp in the
       * scene - one warm wash up the near side of the robe and the two objects
       * are suddenly in the same place. */
      g.save();
      g.globalCompositeOperation = 'lighter';
      /* Thrown back TOWARD her, not out into the dark. A radial centred on the
       * lamp lit as much empty air to one side as it lit the robe, which reads
       * as a smudge on the canvas rather than as light falling on cloth; this
       * one is an ellipse pushed up and inward, so the bright part of it lands
       * on the hem and the near leg where a lamp at hip height would actually
       * put it. */
      const lx = gx - 4, ly = hy + 12;
      const spill = g.createRadialGradient(lx, ly, 2, lx, ly, 22);
      spill.addColorStop(0, 'rgba(255,206,128,.26)');
      spill.addColorStop(0.55, 'rgba(255,206,128,.11)');
      spill.addColorStop(1, 'rgba(255,206,128,0)');
      g.fillStyle = spill;
      g.beginPath(); g.ellipse(lx, ly, 22, 17, 0, 0, WS.TAU); g.fill();
      g.restore();
    },
    daggers(g, C, b) {
      /* Point-down, angled across the body. Held point-up beside each shoulder
       * they read as wings, or as a bug's antennae - the reverse grip is both
       * what a knife fighter actually does and the only version that keeps the
       * blades inside the survivor's own outline. */
      for (const dir of [-1, 1]) {
        const hx = 50 + dir * (b.sh + 2.5);
        g.save();
        g.translate(hx, WAIST_Y - 1); g.rotate(dir * 2.75);
        panel(g, [[-2.4, 0], [2.4, 0], [1.6, -19], [0, -24], [-1.6, -19]], STEEL);
        // A fuller down the middle, not a pale triangle laid over the face:
        // the groove is what makes a blade read as forged rather than cut out
        // of paper, and it is a dark line with a light one beside it.
        g.strokeStyle = 'rgba(18,22,30,.45)'; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(0, -2.5); g.lineTo(0, -19); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(1.15, -3); g.lineTo(0.8, -18.5); g.lineTo(0, -22.6);
        g.stroke();
        /* A hilt, which this did not have: the blade ran straight into a
           leather block. A knife is a crossguard, a bound grip and a pommel,
           and those three marks are most of what tells it from a shard. */
        panel(g, [[-4.2, -0.6], [4.2, -0.6], [3.6, 1.8], [-3.6, 1.8]],
          ramp([0.40, 0.42, 0.48], 'metal'));
        panel(g, [[-2.3, 1.6], [2.3, 1.6], [2, 6.4], [-2, 6.4]], LEATHER);
        g.save();
        g.strokeStyle = LEATHER.line; g.globalAlpha = 0.6; g.lineWidth = 0.65;
        for (const y of [2.8, 4.1, 5.4]) {
          g.beginPath(); g.moveTo(-2.15, y); g.lineTo(2.15, y); g.stroke();
        }
        g.restore();
        g.fillStyle = GOLD.core;
        g.beginPath(); g.ellipse(0, 6.9, 2.3, 1.5, 0, 0, WS.TAU); g.fill();
        g.restore();
      }
    },
    bow(g, C, b) {
      /* A bow is THICK AT THE RISER AND THIN AT THE NOCKS - that taper is the
         whole reason it bends, and a stroked arc cannot have it. This was one
         2.4px stroke of constant width from tip to tip, which is a hoop
         segment; the limbs are filled and tapered now, built from the same
         swept cone the horns are, so each one actually comes to a nock. */
      const gx = 50 + b.sh + 2, gy = WAIST_Y - 6, rad = 20;
      const END = 1.25;
      const tip = (k) => [gx + rad * Math.cos(k * END), gy + rad * Math.sin(k * END)];
      for (const k of [-1, 1]) {
        // centreline: the riser out to one tip, along the same arc as before
        const P = (t) => {
          const a = k * END * t;
          return [gx + rad * Math.cos(a), gy + rad * Math.sin(a)];
        };
        const W = (t) => 1.75 * Math.pow(1 - t, 0.55) + 0.35;
        g.save();
        const e = tip(k);
        lit(g, WOOD, gx + rad, gy, e[0], e[1]);
        sweptPath(g, P, W, 14);
        g.fill();
        finish(g, WOOD, WS.min(gx + rad - 3, e[0] - 2), WS.min(gy - 2, e[1] - 2),
          WS.max(gx + rad + 3, e[0] + 2), WS.max(gy + 2, e[1] + 2));
        // the nock: a notch of horn at the thin end
        g.fillStyle = ramp([0.74, 0.70, 0.60], 'leather').core;
        g.beginPath();
        g.ellipse(e[0], e[1], 1.5, 1.1, Math.atan2(e[1] - gy, e[0] - gx), 0, WS.TAU);
        g.fill();
        g.restore();
      }
      const a = tip(-1), c = tip(1);
      g.strokeStyle = 'rgba(226,233,245,.7)'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke();
      // the riser, bound: a grip sits IN the hand, so it is wrapped like one
      panel(g, [[gx + rad - 2.2, gy - 5.2], [gx + rad + 1.6, gy - 5],
        [gx + rad + 1.6, gy + 5], [gx + rad - 2.2, gy + 5.2]], LEATHER);
      g.save();
      g.strokeStyle = LEATHER.line; g.globalAlpha = 0.6; g.lineWidth = 0.65;
      for (const dy of [-3, -1, 1, 3]) {
        g.beginPath();
        g.moveTo(gx + rad - 2.1, gy + dy); g.lineTo(gx + rad + 1.5, gy + dy);
        g.stroke();
      }
      g.restore();
      // A quiver over the far shoulder: the hunter's second silhouette cue.
      g.save();
      g.translate(50 - b.sh - 1, SHOULDER_Y + 4); g.rotate(-0.34);
      panel(g, [[-3.4, -12], [3.4, -12], [2.8, 10], [-2.8, 10]], LEATHER);
      // a strap and a rim, so the quiver is worn rather than stuck on
      panel(g, [[-3.6, -12.4], [3.6, -12.4], [3.4, -10], [-3.4, -10]],
        ramp([0.30, 0.22, 0.14], 'leather'));
      // and arrows with FLETCHING - three bare slivers read as pencils
      for (const dx of [-1.8, 0.2, 2]) {
        g.fillStyle = '#cdd5e4';
        g.fillRect(dx, -17, 1.2, 6);
        g.fillStyle = dx === 0.2 ? '#c9705c' : '#8f9bb0';
        g.beginPath();
        g.moveTo(dx + 0.6, -17.2);
        g.lineTo(dx + 2.4, -15.4);
        g.lineTo(dx + 0.6, -14.6);
        g.closePath(); g.fill();
      }
      g.restore();
    },
    axe(g, C, b) {
      /* Held, and swung from the hip. The head sat up at y=20 - level with the
       * survivor's ear - which read as a signpost rather than a weapon; a haft
       * angled back from the hand with the weight at shoulder height reads as
       * something a person is about to use. */
      const gx = 50 + b.sh + 3;
      limb(g, gx + 6, FOOT_Y - 4, gx - 2, 33, 3, WOOD);
      grip(g, gx + 6, FOOT_Y - 4, gx - 2, 33, 0.42, 0.70, 3.4);
      /* The bit is a fan with a curved edge and a hollow back.
       *
       * Two flat slabs read as a mallet; a subtle crescent with a big white
       * highlight over it read as a banner on a pole - which is what the
       * previous two attempts each produced. What says axe is the profile
       * alone: narrow where it meets the haft, wide and convex at the edge,
       * scooped out behind. So the shape does the work and the highlight is a
       * thin line along the edge rather than a wedge across the face. */
      const bit = 34;
      lit(g, STEEL, gx, bit - 9, gx + 15, bit + 11);
      g.beginPath();
      g.moveTo(gx + 1, bit - 9);
      g.bezierCurveTo(gx + 12, bit - 8, gx + 17, bit - 2, gx + 16, bit + 3);
      g.bezierCurveTo(gx + 15, bit + 9, gx + 10, bit + 13, gx + 1, bit + 13);
      g.bezierCurveTo(gx + 6, bit + 6, gx + 6, bit - 2, gx + 1, bit - 9);
      g.closePath(); g.fill();
      finish(g, STEEL, gx, bit - 9, gx + 17, bit + 13);
      // The back cheek, shorter and darker: an axe is not symmetrical.
      lit(g, ramp([0.38, 0.42, 0.50], 'metal'), gx - 8, bit - 6, gx + 1, bit + 10);
      g.beginPath();
      g.moveTo(gx + 1, bit - 7);
      g.bezierCurveTo(gx - 6, bit - 6, gx - 8, bit - 1, gx - 7, bit + 4);
      g.bezierCurveTo(gx - 4, bit + 6, gx - 1, bit + 8, gx + 1, bit + 11);
      g.closePath(); g.fill();
      finish(g, ramp([0.38, 0.42, 0.50], 'metal'), gx - 8, bit - 7, gx + 1, bit + 11);
      // The edge itself: one bright line where the steel is thinnest.
      g.strokeStyle = 'rgba(255,255,255,.62)'; g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(gx + 2, bit - 8.4);
      g.bezierCurveTo(gx + 12, bit - 7.4, gx + 16.4, bit - 2, gx + 15.4, bit + 3);
      g.bezierCurveTo(gx + 14.4, bit + 8.6, gx + 9.6, bit + 12.4, gx + 2, bit + 12.4);
      g.stroke();
    },
    greatsword(g, C, b) {
      const gx = 50 + b.sh + 3;
      g.save();
      g.translate(gx, WAIST_Y - 1); g.rotate(0.30);
      panel(g, [[-3.4, 4], [3.4, 4], [2.6, -46], [0, -53], [-2.6, -46]], STEEL);
      g.fillStyle = 'rgba(255,255,255,.42)'; g.fillRect(-0.9, -44, 1.8, 46);
      /* A rune channel down the fuller, lit from inside.
       *
       * The history was a bite out of the edge and it did not land - a
       * two-unit notch on a fifty-unit blade is invisible at portrait size and
       * gone entirely at 34px, which is most of the sizes this is ever seen
       * at. Detail that only exists at 300px is not detail, it is a secret.
       * A channel of the survivor's own light runs the length of the blade
       * instead: it reads at every size, it says the same thing about what
       * this weapon is, and it ties the sword to the eyes in his head. */
      const ch = g.createLinearGradient(0, -46, 0, 4);
      ch.addColorStop(0, WS.rgb(WS.mix(C.channelRgb, [1, 1, 1], 0.45), 1));
      ch.addColorStop(0.5, WS.rgb(C.channelRgb, 1));
      ch.addColorStop(1, WS.rgb(WS.shade(C.channelRgb, 0.45), 1));
      g.fillStyle = ch;
      g.beginPath();
      g.moveTo(0, -44); g.lineTo(1.15, -40); g.lineTo(1.15, 1);
      g.lineTo(-1.15, 1); g.lineTo(-1.15, -40);
      g.closePath(); g.fill();
      glow(g, 0, -20, 10, C.eye, 0.30);
      // Three notches along the edge, big enough to survive the shrink.
      g.fillStyle = 'rgba(9,11,17,.92)';
      for (const [ny, nd] of [[-30, 1.5], [-19, 1.1], [-9, 1.3]]) {
        g.beginPath();
        g.moveTo(2.6, ny + nd); g.lineTo(2.6 - nd * 1.7, ny); g.lineTo(2.6, ny - nd);
        g.closePath(); g.fill();
      }
      panel(g, [[-8, 4], [8, 4], [8, 8], [-8, 8]], GOLD);      // crossguard
      g.fillStyle = LEATHER.core; g.fillRect(-2.4, 8, 4.8, 9);
      g.strokeStyle = 'rgba(20,14,9,.75)'; g.lineWidth = 0.7;
      for (let i = 0; i < 4; i++) {
        g.beginPath(); g.moveTo(-2.4, 9 + i * 2.1); g.lineTo(2.4, 10 + i * 2.1); g.stroke();
      }
      g.restore();
      glow(g, gx + 8, WAIST_Y - 26, 15, C.accent, 0.35);
    },
    orb(g, C, b) {
      /* The orb was a lit circle floating beside the warlock with nothing
         joining it to him - the same fault the censer's chain exists to fix.
         It is HELD now: a clawed setting grips the stone and a short stem runs
         back into the fist, so the light belongs to the figure. */
      const gx = 50 + b.sh + 6, oy = WAIST_Y - 12;
      const dark = ramp([0.22, 0.18, 0.26], 'metal');
      limb(g, 50 + b.sh - 1, WAIST_Y - 3, gx - 1, oy + 4, 2.4, dark);
      // the setting: a cup under the stone and three claws up around it
      panel(g, [[gx - 4.4, oy + 3.2], [gx + 4.4, oy + 3.2],
        [gx + 2.6, oy + 7], [gx - 2.6, oy + 7]], dark);
      // the back claw, behind the stone
      g.save();
      lit(g, dark, gx, oy + 4, gx, oy - 5);
      g.beginPath();
      g.moveTo(gx - 1, oy + 3.8);
      g.quadraticCurveTo(gx - 1.2, oy, gx - 0.9, oy - 5.1);
      g.lineTo(gx + 0.9, oy - 5.1);
      g.quadraticCurveTo(gx + 1.2, oy, gx + 1, oy + 3.8);
      g.closePath(); g.fill();
      g.restore();
      glow(g, gx, oy, 13, C.accent, 0.78);
      g.fillStyle = C.accentLight;
      g.beginPath(); g.arc(gx, oy, 4.4, 0, WS.TAU); g.fill();
      // the stone is a SPHERE: dark where it curves away, one catchlight
      g.save();
      g.beginPath(); g.arc(gx, oy, 4.4, 0, WS.TAU); g.clip();
      const sh = g.createRadialGradient(gx - 1.6, oy - 1.8, 0.5, gx + 1.4, oy + 2, 6.2);
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(1, 'rgba(20,10,30,.55)');
      g.fillStyle = sh;
      g.beginPath(); g.arc(gx, oy, 4.4, 0, WS.TAU); g.fill();
      g.restore();
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.beginPath(); g.arc(gx - 1.4, oy - 1.4, 1.5, 0, WS.TAU); g.fill();
      /* The claws last, over both the stone and its glow. Behind them the
         setting was invisible - a 15px glow at .95 erases anything it is
         drawn on top of, which is exactly why this looked like a free-floating
         light in the first place. */
      for (const k of [-1, 1]) {
        g.save();
        lit(g, dark, gx + k * 4, oy + 4, gx + k * 4.6, oy - 4.4);
        g.beginPath();
        g.moveTo(gx + k * 3.4 - 1, oy + 3.8);
        g.quadraticCurveTo(gx + k * 5.2, oy - 1, gx + k * 4.2, oy - 4.6);
        g.lineTo(gx + k * 3.1, oy - 4.1);
        g.quadraticCurveTo(gx + k * 3.8, oy - 1, gx + k * 3.4 + 1, oy + 3.8);
        g.closePath(); g.fill();
        g.restore();
      }
    },
    totem(g, C, b) {
      /* A carved head on a haft, not a painted broom.
       *
       * Three gold bands on a stick is a staff; what makes it a totem is that
       * something is looking out of the top of it. So: a blocky beast head
       * with a jaw and two lit eyes, a bound collar of hide under it, and a
       * feather on a thong hanging off the shaft. */
      const gx = 50 + b.sh + 4, top = CEIL + 14;
      limb(g, gx, FOOT_Y - 3, gx + 2, top + 4, 5.4, WOOD);
      grip(g, gx, FOOT_Y - 3, gx + 2, top + 4, 0.30, 0.52, 5.8);
      // Two carved bands further down the haft - a totem is worked along its
      // whole length, and the shaft was the one blank part of the shaman.
      g.save();
      g.strokeStyle = WOOD.line; g.globalAlpha = 0.5; g.lineWidth = 0.8;
      for (const t of [0.64, 0.70, 0.82, 0.88]) {
        const x = gx + 2 * t, y = FOOT_Y - 3 + (top + 4 - (FOOT_Y - 3)) * t;
        g.beginPath(); g.moveTo(x - 2.7, y); g.lineTo(x + 2.7, y); g.stroke();
      }
      g.restore();
      // The head: wider than the haft, with a heavy brow and a cut jaw.
      panel(g, [[gx - 5.5, top + 9], [gx - 6, top - 3], [gx - 2, top - 6],
        [gx + 6, top - 5], [gx + 7, top + 3], [gx + 4, top + 10],
        [gx - 1, top + 11]], ramp([0.34, 0.25, 0.16]));
      // The mouth, cut across - with teeth in it, because an open jaw with a
      // flat dark bar in it is a letterbox.
      g.fillStyle = 'rgba(12,8,5,.72)';
      g.fillRect(gx - 4.5, top + 5.5, 10, 2.4);
      g.fillStyle = 'rgba(228,220,198,.78)';
      for (const dx of [-3.6, -1.4, 0.8, 3]) g.fillRect(gx + dx, top + 5.5, 1.1, 2.4);
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.fillRect(gx - 4.5, top + 7.5, 10, 0.6);
      for (const dx of [-2.6, 2.4]) {
        g.fillStyle = C.accent;
        g.beginPath(); g.ellipse(gx + dx, top + 1, 1.5, 1.1, 0, 0, WS.TAU); g.fill();
      }
      glow(g, gx + 0.5, top + 1, 9, C.accent, 0.55);
      // Hide collar where the head is lashed on, and a feather on a thong.
      panel(g, [[gx - 4.5, top + 11], [gx + 4.5, top + 11],
        [gx + 3.5, top + 15], [gx - 3.5, top + 15]], LEATHER);
      /* The feather had no spine and no barbs, so at any size it was a leaf.
         One rib down the middle and a few strokes off it and the same four
         points read as a feather. */
      panel(g, [[gx + 3, top + 15], [gx + 5, top + 15],
        [gx + 8, top + 27], [gx + 4.5, top + 25]], C.featherRamp);
      g.save();
      g.strokeStyle = C.featherRamp.line;
      g.globalAlpha = 0.6; g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(gx + 4, top + 15.4);
      g.quadraticCurveTo(gx + 5.4, top + 20, gx + 6.4, top + 25.8);
      g.stroke();
      g.globalAlpha = 0.4; g.lineWidth = 0.55;
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        const x = gx + 4 + 2.4 * t * t + 0.6 * t, y = top + 15.4 + 10.4 * t;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1.5, y + 1.9); g.stroke();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1.2, y + 1.6); g.stroke();
      }
      g.restore();
    },
    hammer(g, C, b) {
      /* A warhammer, held head-up in the near hand.
       *
       * The paladin was carrying a shield and NOTHING ELSE - which is not a
       * paladin, it is a man hiding - and the shield alone sat on the far
       * side, so from the front he read as unarmed. A blunt weapon is also the
       * right answer for him: every other heavy in the cast swings an edge,
       * and a slab of steel on a haft is a different silhouette from a
       * crescent or a blade at any size. */
      const gx = 50 + b.sh + 3, head = 26;
      limb(g, gx + 3, FOOT_Y - 6, gx - 1, head + 5, 3.2, WOOD);
      grip(g, gx + 3, FOOT_Y - 6, gx - 1, head + 5, 0.38, 0.66, 3.6);
      // The head: a square face with a chamfer, and a spike behind it.
      panel(g, [[gx - 9, head - 1], [gx + 8, head - 4], [gx + 9, head + 8],
        [gx - 8, head + 11]], STEEL);
      panel(g, [[gx + 8, head - 3], [gx + 15, head + 1], [gx + 15, head + 5],
        [gx + 8.5, head + 8]], ramp([0.44, 0.47, 0.55], 'metal'));
      // Two bands of gold across the face - the same metal as his charge.
      g.fillStyle = GOLD.core;
      g.fillRect(gx - 8.5, head + 1, 16.5, 1.6);
      g.fillRect(gx - 8.5, head + 5.5, 16.5, 1.6);
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.beginPath();
      g.moveTo(gx - 8.6, head - 0.6); g.lineTo(gx + 7.6, head - 3.4);
      g.lineTo(gx + 7.8, head - 1.6); g.lineTo(gx - 8.4, head + 1.2);
      g.closePath(); g.fill();
      glow(g, gx, head + 4, 13, C.accent, 0.30);
    },
    shield(g, C, b) {
      const sx = 50 - b.sh - 4;
      panel(g, [[sx - 9, WAIST_Y - 22], [sx + 8, WAIST_Y - 25], [sx + 9, WAIST_Y - 4],
        [sx, WAIST_Y + 8], [sx - 10, WAIST_Y - 4]], STEEL);
      g.strokeStyle = GOLD.core; g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(sx - 8, WAIST_Y - 20); g.lineTo(sx + 7, WAIST_Y - 22.5);
      g.stroke();
      // The charge on the face: the same device as the tabard, so the two
      // read as one heraldry rather than two decorations.
      g.fillStyle = GOLD.key;
      g.beginPath();
      g.moveTo(sx - 0.5, WAIST_Y - 18);
      g.lineTo(sx + 4, WAIST_Y - 11.5);
      g.lineTo(sx - 0.5, WAIST_Y - 5);
      g.lineTo(sx - 5, WAIST_Y - 11.5);
      g.closePath(); g.fill();
      glow(g, sx, WAIST_Y - 11, 9, C.accent, 0.45);
    },
    glaives(g, C, b) {
      /* Warglaives: a blade with a body and a leading edge, not a glowing
       * hoop. A stroked arc has the same thickness everywhere and no edge, so
       * it read as a magic circle rather than something that cuts; filling a
       * crescent that is thick at the grip and thin at the tip gives it both.
       * They are held low and swept back, inside the survivor's outline. */
      for (const dir of [-1, 1]) {
        g.save();
        g.translate(50 + dir * (b.sh + 3), WAIST_Y - 3);
        g.scale(dir, 1);
        g.rotate(0.42);
        const GL = ramp([0.30, 0.26, 0.34], 'metal');
        lit(g, GL, -2, -14, 12, 10);
        g.beginPath();
        g.moveTo(-2.5, 2);
        g.bezierCurveTo(6, 0, 12, -6, 12.5, -15);
        g.bezierCurveTo(9, -7, 4, -3.5, -2.5, -3);
        g.closePath(); g.fill();
        // The body of the blade turns away from the light along its inside
        // curve. Without that it is a flat crescent with a bright line on it.
        finish(g, GL, -3, -15, 13, 2);
        // The edge, lit: one bright taper along the outside of the curve.
        g.strokeStyle = C.accentLight; g.lineWidth = 1.3; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-2, 1.4);
        g.bezierCurveTo(6, -0.6, 11.4, -6.4, 11.9, -14.6);
        g.stroke();
        /* The grip in the fist - a bound bar with a guard where the blade
           leaves it, rather than a leather rectangle butted against steel. */
        panel(g, [[-1.6, -4.2], [0.6, -3.8], [0.6, 2.6], [-1.6, 2.4]],
          ramp([0.40, 0.42, 0.48], 'metal'));
        panel(g, [[-5, -3.4], [-1.4, -3.6], [-1.4, 2.6], [-5, 2.4]], LEATHER);
        g.save();
        g.strokeStyle = LEATHER.line; g.globalAlpha = 0.6; g.lineWidth = 0.6;
        for (const y of [-1.8, -0.2, 1.4]) {
          g.beginPath(); g.moveTo(-4.9, y); g.lineTo(-1.5, y); g.stroke();
        }
        g.restore();
        g.restore();
        glow(g, 50 + dir * (b.sh + 8), WAIST_Y - 12, 11, C.accent, 0.42);
      }
    },
  };

  /* ------------------------------------------------------------- roster --- */
  /* WHO EACH SURVIVOR IS.
   *
   * The rig is shared and deliberately so - one skeleton, one light, one way
   * of building a garment - and on top of it each of the ten carries ONE mark
   * that is theirs alone. That was the method the shaman and the ruinseeker
   * were done by and it is now run across the whole cast:
   *
   *   find the mark that says who this is at 34px, make it a SHAPE rather
   *   than a colour, and give it a MATERIAL nothing else on the figure has.
   *
   *   mage        a sash across the chest - the one diagonal in a body built
   *               from verticals - bell cuffs, the only clothing here that
   *               widens as it goes down, and three runes holding station
   *               around the staff head. Nothing else in the cast floats
   *   priest      a stole: two bands from the collar with the robe showing
   *               between them, and her lantern's light actually landing on
   *               the hem, so the lamp is in the scene and not painted beside
   *               it
   *   rogue       a scarf pulled to the chin, belt sheaths, a bracer, and a
   *               hem cut short over the leading leg
   *   hunter      the hood he is NOT wearing, bunched behind the neck; fur
   *               over the far shoulder, the only soft edge in the roster; a
   *               quiver strap and a knife at the boot
   *   warrior     horns off the helm, heavy at the root and curling up - and
   *               deliberately nothing in the other hand. A shield was slung
   *               on his back for one build and it went again: it filled the
   *               gap under his axe arm, and that gap was the best thing about
   *               his outline. Not every silhouette wants filling in
   *   warlock     chains at the hip, a clasped tome with his own light leaking
   *               out of the pages, and a second wisp keeping station off his
   *               shoulder - something is following him
   *   shaman      a feather mantle, warpaint, arms bound wrist to elbow while
   *               everyone else has sleeves, a totem with a face carved in
   *   paladin     a warhammer AND a shield. He carried the shield alone, which
   *               is not a paladin but a man hiding - and from the front he
   *               read as unarmed. A blunt weapon is also the right answer:
   *               every other heavy here swings an edge. The charge is on the
   *               tabard AND the shield face, so the two read as one heraldry
   *   graveblade  a crowned dead king. Pallid and hollow-cheeked, an iron
   *               crown of five leaning spikes with a cold stone at the front,
   *               sockets with no eyes in them, and a rune channel burning the
   *               length of his blade. His is the one survivor whose eyes are
   *               NOT his identity colour: what is behind those sockets is not
   *               his blood, and a crimson glow read as anger where a cold
   *               blue one reads as absence. Steel gauntlets, because his arm
   *               was built from his own crimson garment and hung in front of
   *               his crimson cloak - the hand vanished, and with it the fact
   *               that he is holding anything
   *   ruinseeker  bound eyes, sigils lit from under the skin, warglaives,
   *               bound shins
   *
   * And a second colour on every garment - a warm trim close enough to belong
   * to the survivor and far enough to be a decision somebody made about their
   * clothes. One flat family reads as a uniform however well it is lit.
   *
   * check-hero.js now measures this rather than trusting it: with every
   * survivor forced to one grey, no two may differ across less than 35% of
   * their drawing. The closest pair currently manage 43%.
   *
   * They walk now - see the stride block at the top of the file. What the cast
   * still wants after that is smaller: a hurt pose, and something for the
   * moment a survivor dies. */
  const CAST = {
    /* Each survivor carries ONE mark that is theirs alone, on top of the
     * shared rig - the method the shaman and the ruinseeker were done by, run
     * across the rest of the cast. Read down the column of what is unique to
     * each and no two lines repeat; that is the test, and it is the same test
     * the silhouette rule applies to the outline. */
    mage: { build: 'slim', head: 'bare', robe: true, cloak: 'long', weapon: 'staff',
      sash: true, sleeves: true, hair: DARKCLOTH, brand: 'mage', crownPoints: 11 },
    /* No tabard: the stole sits exactly where one goes and the two together
     * made the whole front of her one pale slab. Two bands with the robe
     * showing between them is the reading; three overlapping ones is a bib. */
    priest: { build: 'slim', head: 'bare', robe: true, cloak: 'short', halo: true,
      weapon: 'censer', stole: true, hair: ramp([0.55, 0.46, 0.33]),
      brand: 'priest', crownPoints: 13 },
    rogue: { build: 'slim', head: 'hood', cloak: 'cut', weapon: 'daggers',
      scarf: true, sheaths: true, bracer: true, brand: 'rogue', crownPoints: 9 },
    hunter: { build: 'normal', head: 'bare', weapon: 'bow', hoodDown: true, pelt: true,
      bracer: true, strap: true, bootknife: true, hair: ramp([0.30, 0.26, 0.18]),
      brand: 'hunter' },
    /* One hand. The other is gone, which is what "The Fallen Hero" is about,
       and it is stated here rather than left to the drawing code to remember
       - a survivor's anatomy is part of who they are. The off arm ends in a
       capped stump, and no hand is drawn on it. */
    /* Not a helm. Two survivors in the cast wore steel over the whole face and
       the crest alone was never quite enough to tell them apart; an open face
       under a band of iron, with a beard for a jaw, is a different head at any
       size - and the right one for a fallen soldier who has stopped bothering
       with the rest of the armoury. */
    warrior: { build: 'heavy', head: 'bare', pauldrons: 2.1, weapon: 'axe',
      helmHorns: true, browband: true, sash: true, stump: 'far',
      beard: ramp([0.46, 0.34, 0.21]), hair: ramp([0.40, 0.29, 0.18]),
      brand: 'warrior' },
    warlock: { build: 'normal', head: 'hood', robe: true, cloak: 'tattered',
      weapon: 'orb', chains: true, tome: true, wisp: true, hood: DARKCLOTH,
      brand: 'warlock', crownPoints: 10 },
    /* The shaman used to be a robed slim silhouette with a long cloak, which
     * put him inside 83% of the mage's outline and 81% of the warlock's -
     * three survivors sharing one shape. Legs and a ragged hem take him out of
     * that cluster without touching anything else about him.
     * The moustache is Vonnra's own mark in the same sense the crown is
     * graveblade's - it is drawn nowhere else in the cast. */
    shaman: { build: 'normal', head: 'bare', cloak: 'tattered', weapon: 'totem',
      mantle: true, warpaint: true, armwraps: true, hair: ramp([0.22, 0.24, 0.30]),
      mustache: true, brand: 'shaman', crownPoints: 7 },
    paladin: { build: 'heavy', head: 'helm', pauldrons: 2.4, halo: true, tabard: true,
      weapon: 'hammer', offhand: 'shield', device: true,
      brand: 'paladin', crownPoints: 6 },
    graveblade: { build: 'heavy', head: 'undead', undead: true, pauldrons: 1.7,
      cloak: 'tattered', weapon: 'greatsword', chains: true, crown: true,
      gauntlets: true, eyeColour: [0.32, 0.72, 1.0],
      brand: 'graveblade', crownPoints: 4 },
    ruinseeker: { build: 'normal', head: 'bare', horns: true, cloak: 'tattered',
      weapon: 'glaives', blindfold: true, sigils: true, bracer: true, legwraps: true,
      hair: DARKCLOTH, brand: 'ruinseeker' },
  };

  /* --------------------------------------------------------------- rank --- */
  /* WHAT A SURVIVOR EARNS.
   *
   * The rig is a kit of about thirty parts and a class is a row of them, so a
   * survivor who grows is not a second drawing - it is more of the same row.
   * This is the ladder they climb, and it is the SAME ladder for everyone.
   *
   * That last part is still the whole design. The obvious way to do this is
   * to hand each class more of its own EQUIPMENT - a bigger halo for the
   * paladin, more chains for the graveblade - and it is wrong twice. It
   * doubles the work per class, and worse, the parts a class does not own
   * are the parts that say who the OTHER classes are: a mage who earns a
   * halo is a priest, and the rule this file is built on is that no two
   * survivors may share a silhouette. check-hero measures that, and it
   * measures every tier now.
   *
   * So the ladder is ember - the thing the game is named for, that belongs to
   * none of them and suits all of them. A survivor does not become another
   * class as they rise. They catch light.
   *
   * What DOES vary by class within that shared ladder is the shape the
   * light takes, not the equipment carrying it: how many points the crown
   * has (CAST.crownPoints, falling back to a count keyed off build so an
   * unset class still reads as a crown) and what the rank-6 brand burns as
   * on the chest (CAST.brand - a mage's spark, a warrior's axe, a
   * paladin's shield...). Both are drawn in the one universal ember colour
   * and both are silhouette-safe by construction: a crown is still a ring
   * of points from any distance and a brand is still a small mark on the
   * chest, so nothing here can be mistaken for another class's own gear
   * the way a borrowed halo could be.
   *
   *   1  the hem takes light, and embers start lifting off them
   *   2  the shoulders build - a mantle of ember-lit plate
   *   3  the cloak lengthens and frays into sparks
   *   4  a crown of embers, which is the one that reads across the room
   */
  const RANKS = [
    {},
    { emberHem: 1 },
    { emberHem: 1, emberMantle: 1 },
    { emberHem: 1, emberMantle: 1, emberTrain: 1 },
    { emberHem: 1, emberMantle: 1.25, emberTrain: 1.2, emberCrown: 1 },
    /* Two more tiers past the crown. Everything below rank 4 is CLOTH the
       survivor is given; these two are what the ember does to the person
       wearing it - a set of burning pinions off the shoulders, and then the
       brand, which is the ember itself showing through the chest. They are
       additive, so nothing the earlier ranks established is taken away. */
    /* The CROWN does not grow past rank 4. It already sits nearer the top of
       the tile than anything else in the rig - that is what its own rule in
       check-hero.js is about - and scaling it 1.15 and 1.3 put every survivor
       2px and then 11px through the top of their own frame. The two new
       tiers carry their progression in the pieces that have room to grow. */
    { emberHem: 1, emberMantle: 1.25, emberTrain: 1.2, emberCrown: 1,
      emberWings: 1 },
    { emberHem: 1, emberMantle: 1.25, emberTrain: 1.2, emberCrown: 1,
      emberWings: 1.08, emberBrand: 1 },
  ];
  const MAX_RANK = RANKS.length - 1;

  /** The kit a survivor draws with at `rank`: their class, plus what they have
   *  earned. Merged fresh rather than mutated, because CAST is the shipped
   *  definition of a class and a run must never edit it. */
  function kitFor(id, rank) {
    const base = CAST[id] || CAST.mage;
    const r = WS.clamp(WS.floor(rank || 0), 0, MAX_RANK);
    if (!r) return base;
    const out = Object.assign({}, base, RANKS[r]);
    /* Pauldrons are a NUMBER in this rig, not a flag, so a class that already
       has them grows its own rather than wearing a second pair over them. */
    if (base.pauldrons && RANKS[r].emberMantle) {
      out.pauldrons = base.pauldrons * (1 + 0.14 * r);
      out.emberMantle = 0;
    }
    return out;
  }

  /* -------------------------------------------------------------- paint --- */
  /** Everything the tint decides, resolved once so no drawing function has to
   *  think about colour theory in the middle of drawing a sleeve. */
  function colours(tint, demon, eyeOverride) {
    const t = demon ? [0.45, 0.95, 0.25] : tint;
    const accent = WS.mix(t, [1, 1, 1], 0.12);
    /* A saturated hue makes poor cloth - it either glows or goes to mud - so
     * garments take a heavily desaturated, darkened version of the identity
     * colour and let the accent do the identifying. This is what keeps the
     * priest [1,1,1] from being a white cut-out and the shaman [0,0.44,0.87]
     * from disappearing into the ground. */
    let garment = WS.mix(WS.shade(t, 0.55), [0.26, 0.28, 0.35], 0.62);
    /* ...and a floor under it. Desaturating alone still left the warlock's
     * plum and the rogue's olive at roughly half the paladin's value - a
     * measured spread of 64 to 124 across the cast - which on a dark map means
     * two survivors read as shapes and the rest as silhouettes. Anything below
     * the floor is lifted toward the neutral cloth until it clears it, which
     * costs the darkest garments a little of their hue and buys every one of
     * them a body the player can see. */
    const FLOOR = 0.30;
    const lum = 0.2126 * garment[0] + 0.7152 * garment[1] + 0.0722 * garment[2];
    if (lum < FLOOR) garment = WS.mix(garment, [0.34, 0.36, 0.43], (FLOOR - lum) / FLOOR);
    return {
      accent: WS.hex(accent),
      /* The rank ladder's own colour. Ember rather than the identity tint, so
         a survivor who rises reads as the same person carrying fire and not as
         a more saturated version of themselves - and so that a priest at
         [1,1,1] gets a rank that is visible at all. Demons burn green, like
         everything else about them. */
      emberRgb: demon ? [0.62, 1, 0.30] : [1.00, 0.62, 0.22],
      /* The METAL the rank is forged from carries a quarter of the survivor's
         own colour; the LIGHT it throws does not.
       
         Pure ember for both made every raised survivor the same amount of
         orange, and the two heavy builds could not afford it: warrior and
         paladin already sit closest of any pair, and raising both dropped
         them to 0.30 of their drawing differing - under the 0.35 the base
         roster is held to. The ladder is still one ladder, and a warrior's
         plate is still a warrior's. */
      emberRamp: demon ? ramp([0.38, 0.58, 0.22])
        : ramp(WS.mix([0.46, 0.30, 0.16], t, 0.25)),
      /* Pulled back from white. At 0.55 toward white every gem and orb in the
       * game came out the same pale lilac-white blob, which throws away the
       * one thing the accent is for - saying whose it is. */
      accentLight: WS.hex(WS.mix(t, [1, 1, 1], 0.34)),
      /* And pulled back from full saturation for anything worn. A tabard at
       * the raw identity colour reads as candy next to obsidian cloth and
       * steel; a sixth of the way to the garment grey keeps it unmistakably
       * theirs while letting it sit in the same world as the rest of the kit. */
      accentRamp: ramp(WS.mix(WS.shade(accent, 0.82), [0.30, 0.30, 0.34], 0.17)),
      cloakRamp: ramp(WS.mix(WS.shade(t, 0.62), [0.20, 0.21, 0.28], 0.40)),
      robeRamp: ramp(garment),
      bodyRamp: ramp(WS.shade(garment, 1.06)),
      legRamp: ramp(WS.shade(garment, 0.72)),
      collarRamp: ramp(WS.shade(garment, 0.84)),
      plateRamp: demon ? ramp([0.35, 0.55, 0.25]) : STEEL,
      hornRamp: demon ? ramp([0.42, 0.62, 0.28]) : ramp([0.30, 0.26, 0.30]),
      /* Bone and ash, barely tinted.
       *
       * Derived from the identity colour these came out the same value as the
       * cloak they hang over and the mantle simply vanished - a feather that
       * matches the coat is not a feather, it is a fold. Feathers are their
       * own material: warm, light, and nothing else on the figure is. Only a
       * sixth of the survivor's colour is allowed in, to keep them his. */
      featherRamp: ramp(WS.mix([0.66, 0.58, 0.44], t, 0.16)),
      featherDark: ramp(WS.mix([0.32, 0.26, 0.20], t, 0.16)),
      /* THE SECOND COLOUR. Every garment in the cast was one flat family, and
       * a costume made of one colour reads as a uniform however well it is
       * lit. The trim is a warm partner to whatever the survivor's cloth came
       * out as - close enough to belong to them, far enough to be a decision
       * somebody made about their clothes. */
      trimRamp: ramp(WS.mix(garment, [0.58, 0.48, 0.30], 0.55)),
      furRamp: ramp([0.38, 0.33, 0.26]),
      // Drowned, not tanned: grey-green with the warmth taken out of it.
      paleRamp: ramp([0.56, 0.60, 0.54]),
      eyeRgb: demon ? [0.85, 1, 0.42]
        : eyeOverride || WS.mix(t, [1, 1, 1], 0.72),
      // The blade's light is the same light as the eyes, but a blade is a big
      // surface: at the eye's whiteness it came out a wash of pale pink rather
      // than something burning inside steel.
      channelRgb: demon ? [0.7, 1, 0.35]
        : eyeOverride ? WS.mix(eyeOverride, [0, 0, 0], 0.18)
        : WS.mix(t, [1, 1, 1], 0.30),
      furDark: ramp([0.22, 0.19, 0.15]),
      /* Normally the survivor's own colour, because the eyes are where the
       * identity tint does its most useful work. The dead are the exception:
       * what is behind those sockets is not his blood, and a crimson glow
       * there read as anger where a cold one reads as absence. */
      eye: demon ? '#d9ff6b'
        : eyeOverride ? WS.hex(eyeOverride) : WS.hex(WS.mix(t, [1, 1, 1], 0.72)),
    };
  }

  /** The finished figure, minus its light. */
  /* ------------------------------------------------------- ember parts --- */
  /* All four are drawn INSIDE the figure, before the silhouette is stamped,
     so the rim light and the cold bounce pick them up like any other part of
     the body. Painted after the stamp they would sit on top of the figure as
     stickers, which is exactly how the first version of the crown looked. */

  /** Rank 1. The hem of whatever they wear takes light, and embers lift. */
  function emberHem(g, cfg, C, b, w) {
    const cx = 50;
    /* A HEM IS AN EDGE, NOT A DISC.
     
       This was a filled ellipse, and on everyone who does not wear a robe it
       landed at hip height and read as a glowing circle across the belly -
       an awkward midline blob that belonged to no part of the body. On the
       robed classes it sat at the floor and read as a puddle being stood in.
       
       It is now the shape a hem actually is: a band that follows the bottom
       edge of the garment, tapering with the body and fading upward into the
       cloth, with its ends falling off so it does not read as a bar either. */
    const robe = !!cfg.robe;
    const hemY = robe ? FOOT_Y - 3 : HIP_Y + 5;
    const halfTop = b.hip * (robe ? 1.30 : 1.02);
    const halfBot = b.hip * (robe ? 1.62 : 1.18);
    const tall = robe ? 13 : 9;

    g.save();
    g.globalCompositeOperation = 'lighter';
    g.beginPath();
    g.moveTo(cx - halfTop, hemY - tall);
    g.lineTo(cx + halfTop, hemY - tall);
    g.lineTo(cx + halfBot, hemY);
    // a shallow scallop along the bottom, so the light ends where cloth ends
    g.quadraticCurveTo(cx + halfBot * 0.45, hemY + 2.2, cx, hemY + 0.6);
    g.quadraticCurveTo(cx - halfBot * 0.45, hemY + 2.2, cx - halfBot, hemY);
    g.closePath();
    g.clip();
    // up the cloth: nothing at the top, brightest along the edge itself
    const up = g.createLinearGradient(0, hemY - tall, 0, hemY + 2);
    up.addColorStop(0, WS.rgb(C.emberRgb, 0));
    up.addColorStop(0.55, WS.rgb(C.emberRgb, 0.14));
    up.addColorStop(1, WS.rgb(C.emberRgb, 0.62));
    g.fillStyle = up;
    g.fillRect(cx - halfBot - 2, hemY - tall - 1, (halfBot + 2) * 2, tall + 4);
    /* And across it, so the ends of the band die away instead of stopping.
       Drawn as a subtractive-looking pass it would need another composite
       mode; instead the sideways falloff is painted as its own light and the
       middle simply gets more of it. */
    const across = g.createLinearGradient(cx - halfBot, 0, cx + halfBot, 0);
    across.addColorStop(0, WS.rgb(C.emberRgb, 0));
    across.addColorStop(0.5, WS.rgb(C.emberRgb, 0.16));
    across.addColorStop(1, WS.rgb(C.emberRgb, 0));
    g.fillStyle = across;
    g.fillRect(cx - halfBot - 2, hemY - tall - 1, (halfBot + 2) * 2, tall + 4);
    g.restore();

    /* Three embers, on the stride's own phase so they rise with the walk and
       hang when the survivor stands. Baked per frame like everything else. */
    for (let i = 0; i < 3; i++) {
      const k = ((w.phase || 0) + i / 3) % 1;
      const ex = cx + (i - 1) * halfBot * 0.62 + WS.sin(k * WS.TAU + i) * 2;
      const ey = hemY - 3 - k * 16;
      glow(g, ex, ey, 2.4 * (1 - k * 0.5), WS.rgb(C.emberRgb, 1), 0.5 * (1 - k));
    }
  }

  /** Rank 2. A mantle of ember-lit plate for the classes that own no
   *  pauldrons; the ones that do simply grow theirs (see kitFor).
   *
   *  Measured at the 78px the game draws: the first version of this changed
   *  18 pixels on the rogue, which is not a rank, it is a rumour. It is a
   *  PANEL - opaque, so it enters the silhouette and takes the gold rim with
   *  it - and it is sized off the shoulder rather than fixed, so a slim build
   *  gets one that reads instead of one that hides under a sleeve. */
  function emberMantle(g, cfg, C, b, k) {
    if (!k) return;
    const cx = 50;
    /* Sized off the shoulder AND raised, because on a slim build the plate
       sat inside the sleeve and changed 18 pixels. Sitting proud of the
       shoulder line is what puts it in the silhouette. */
    const sc = k * (1.25 + (11 - b.sh) * 0.09);
    const rise = 2.2 * k;
    for (const dir of [-1, 1]) {
      const px = cx + dir * (b.sh + 2.2);
      const sy = SHOULDER_Y - rise;
      panel(g, [
        [px - dir * 6.5 * sc, sy - 4.4 * sc],
        [px + dir * 3.4 * sc, sy - 6.0 * sc],
        [px + dir * 7.4 * sc, sy - 1.4 * sc],
        [px + dir * 6.4 * sc, sy + 3.6 * sc],
        [px - dir * 6.5 * sc, sy + 2.8 * sc],
      ], C.emberRamp);
      // a lit lip along the top edge, where the light already comes from
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = WS.rgb(C.emberRgb, 0.85);
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(px - dir * 6.2 * sc, sy - 4.2 * sc);
      g.lineTo(px + dir * 3.2 * sc, sy - 5.8 * sc);
      g.lineTo(px + dir * 7.0 * sc, sy - 1.3 * sc);
      g.stroke();
      g.restore();
      glow(g, px + dir * 2 * sc, sy - 2.4 * sc, 5.5 * sc, WS.rgb(C.emberRgb, 1), 0.34);
    }
  }

  /** Rank 3. The cloak carries further and frays into sparks behind.
   *
   *  It has to reach BEYOND whatever cloak the class already wears or it is
   *  simply hidden by it - drawn inside the mage's long cloak the first
   *  version changed nine pixels between rank 2 and rank 3. So it is wider
   *  than any cloak in the rig and it pools past the feet, which is the part
   *  that actually changes the outline. */
  function emberTrain(g, cfg, C, b, w, k) {
    if (!k) return;
    const cx = 50;
    /* The train takes its SHAPE from the cloak the class already wears.
     
       The distinctness check greys every survivor out, so anything the train
       borrows from the identity colour is identical between two classes -
       only the outline is left to tell them apart. Warrior and paladin wear
       no cloak at all, so an identical new sheet of cloth on two heavy builds
       cost them 0.166 of their difference and put them under the floor. A
       class with no cloak gets a SPLIT train, two tails rather than one
       sheet; a cut or short one gets a narrower, higher hem. Same ladder, and
       the silhouette still belongs to whoever is wearing it. */
    const style = cfg.cloak || 'none';
    /* Each cloak style gets a DIFFERENT hem, not a smaller one.
     
       Shaman, ruinseeker and warlock all wear a tattered cloak, so an
       identical train made the first two the closest pair at the top of the
       ladder. Trimming it fixed that and immediately broke the third: at
       0.9 of the drop, the warlock's rank 3 moved 56 pixels, which is not a
       rank. So a tattered cloak keeps its length and takes a deeper, more
       broken hem instead - the same amount of cloth, cut a different way. */
    const wide = style === 'long' ? 2.8 : style === 'tattered' ? 2.4
      : style === 'none' ? 1.9 : 2.1;
    /* Nobody's train is SHORTER - shortening is how rank 3 stops being worth
       anything, and it cost the warlock and then the rogue in turn. A cut or
       short cloak is told apart by being cut on the SLANT, one side carried
       further than the other, which is what "cut" already means. */
    const drop = 1;
    const frays = style === 'tattered' ? 5 : 3;
    const notch = style === 'tattered' ? 11 : 5;
    const slant = style === 'cut' || style === 'short' ? 9 : 0;
    /* A cloakless class gets two tails - except one already wearing a tabard,
       which is a single hanging panel, and gets a banner that continues it.
       Warrior and paladin are the closest pair in the cast before any of this
       (0.470 apart) and the only two who are heavy, cloakless and plated, so
       they are the pair a shared ladder costs most; the tabard is the one
       thing in their kits that already differs at grey. */
    const split = style === 'none' && !cfg.tabard;
    const banner = style === 'none' && cfg.tabard;
    const top = SHOULDER_Y + 1;
    const foot = FOOT_Y * drop + (FOOT_Y * (1 - drop)) * 0.35 + 5 * k;
    const flare = b.hip * wide * k;
    const sway = (w.swing || 0) * 1.6;
    /* THEIR cloth, not a new orange one.
     
       Painted in ember the train read as an orange skirt worn over the
       costume - on the paladin it fought the tabard and on the graveblade it
       fought a maroon cloak. It is the class's own cloak ramp, carried
       further, and the ember lives only at the frayed hem where cloth that
       has been dragged through a fire would actually be alight. */
    const grd = g.createLinearGradient(0, top, 0, foot);
    grd.addColorStop(0, C.cloakRamp.deep);
    grd.addColorStop(0.62, C.cloakRamp.shade);
    grd.addColorStop(1, C.cloakRamp.core);
    g.fillStyle = grd;
    if (banner) {
      // one panel, straight down, wider at the hem - a tabard carried on
      const halfTop = b.hip * 0.62, halfFoot = flare * 0.66;
      g.beginPath();
      g.moveTo(cx - halfTop, top + 4);
      g.lineTo(cx + halfTop, top + 4);
      g.lineTo(cx + halfFoot + sway, foot);
      g.lineTo(cx + halfFoot * 0.4 + sway, foot - 8);
      g.lineTo(cx + sway * 0.5, foot + 1);
      g.lineTo(cx - halfFoot * 0.4 + sway, foot - 8);
      g.lineTo(cx - halfFoot + sway, foot);
      g.closePath();
      g.fill();
    } else if (split) {
      // two tails, parted down the middle - a heavy build's war-banner, not a
      // robe, and a different outline from anything with a cloak on it
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + dir * b.sh * 0.25, top);
        g.lineTo(cx + dir * b.sh * 0.95, top);
        g.quadraticCurveTo(cx + dir * flare + sway, top + (foot - top) * 0.7,
          cx + dir * flare * 0.85 + sway, foot);
        g.lineTo(cx + dir * flare * 0.34 + sway, foot - 7);
        g.lineTo(cx + dir * b.hip * 0.30 + sway * 0.5, foot - 2);
        g.closePath();
        g.fill();
      }
    } else {
      g.beginPath();
      g.moveTo(cx - b.sh * 0.9, top);
      g.quadraticCurveTo(cx - flare + sway, top + (foot - top) * 0.75,
        cx - flare * 0.8 + sway, foot + slant * 0.5);
      // the hem: points of cloth rather than a clean curve, cut to the style
      for (let i = 1; i <= frays * 2; i++) {
        const u = -1 + (i / (frays * 2 + 1)) * 2;      // -1..1 across the hem
        const deep = i % 2 ? notch : 0;
        g.lineTo(cx + u * flare * 0.8 + sway, foot - deep + (deep ? 0 : 2) - u * slant * 0.5);
      }
      g.lineTo(cx + flare * 0.8 + sway, foot - slant * 0.5);
      g.quadraticCurveTo(cx + flare + sway, top + (foot - top) * 0.75, cx + b.sh * 0.9, top);
      g.closePath();
      g.fill();
    }
    g.save();
    g.globalCompositeOperation = 'lighter';
    // the hem itself, alight along the line the cloth actually ends on
    const hem = g.createLinearGradient(0, foot - 13, 0, foot + 2);
    hem.addColorStop(0, WS.rgb(C.emberRgb, 0));
    hem.addColorStop(1, WS.rgb(C.emberRgb, 0.55));
    g.fillStyle = hem;
    g.beginPath();
    g.moveTo(cx - flare * 0.8 + sway, foot);
    g.lineTo(cx - flare * 0.28 + sway, foot - 5);
    g.lineTo(cx + sway * 0.5, foot + 2);
    g.lineTo(cx + flare * 0.28 + sway, foot - 5);
    g.lineTo(cx + flare * 0.8 + sway, foot);
    g.lineTo(cx + flare * 0.6 + sway, foot - 13);
    g.lineTo(cx - flare * 0.6 + sway, foot - 13);
    g.closePath();
    g.fill();
    for (let i = 0; i < 5; i++) {
      const t = ((w.phase || 0) * 0.5 + i / 5) % 1;
      const sx = cx + (i % 2 ? 1 : -1) * flare * (0.5 + t * 0.6) + sway;
      const sy = foot - 6 - t * 14;
      glow(g, sx, sy, 2.2 * (1 - t * 0.4), WS.rgb(C.emberRgb, 1), 0.55 * (1 - t));
    }
    g.restore();
  }

  /** Rank 4. The crown - the one a player reads from across the field.
   *
   *  A ring of separate points rather than a solid band, because a solid band
   *  at this size IS the priest's halo and that belongs to her. The points are
   *  drawn opaque before they are lit, so the crown enters the silhouette and
   *  earns the same gold rim the rest of the figure has. */
  /** EMBER WINGS: pinions of held light off the shoulders.
   *
   *  The first four ranks are all garment - a hem, a mantle, a train, a crown
   *  - and they are all the same material. By the fifth the survivor has been
   *  carrying the ember long enough that it is coming out of them, so this is
   *  the first thing on the ladder that is not cloth. Drawn behind the body
   *  and in the survivor's own accent so it cannot be mistaken for armour. */
  function emberWings(g, cfg, C, b) {
    const k = cfg.emberWings;
    if (!k) return;
    /* EVERY SET IS THE CLASS'S OWN.
     *
     * Built identically for all ten, these pushed the cast TOGETHER: the same
     * big shape of light on every pair of shoulders took shaman and
     * ruinseeker - already the closest pair in the roster - from 0.44 apart
     * at rank 0 to 0.33 at the top, and check-hero failed with "the ranks are
     * turning the cast into one character". A reward that makes everyone look
     * the same is not a reward. The count, the sweep and the rake come off
     * the class id, so no two sets of pinions are cut alike.
     *
     * They are also shorter than the first attempt, which put the priest and
     * the rogue 2px through the top of their own tile at rank 6. */
    const seed = String(cfg.weapon) + String(cfg.head) + String(cfg.cloak);
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    h = Math.abs(h);
    const n = 3 + (h % 3);                       // three to five pinions
    const rake = 0.18 + ((h >> 3) % 5) * 0.055;  // how far back they sweep
    const base = 20 + ((h >> 6) % 4) * 2.5;

    /* Drawn as SOLID pinions first and lit afterwards.
     *
     * The first version was nothing but additive light, and additive light on
     * a pale figure adds nothing: the priest's whole rank-5 step came to 96
     * changed pixels and check-hero rejected it as "nothing a player would
     * see for having earned it". It is the same fault the eyes had before
     * they were given sockets. A pinion is a thing with an edge; the glow
     * goes on top of it. */
    for (const dir of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const spread = rake + i * (0.86 / n);
        const len = (base + i * 3.8) * k;
        const x0 = 50 + dir * (b.sh - 1.5), y0 = SHOULDER_Y + 1 + i * 2.4;
        const x1 = x0 + dir * WS.cos(spread) * len;
        const y1 = y0 - WS.sin(spread) * len * 0.58;   // out more than up: a pinion that rises is a pinion through the top of the tile
        const mx = x0 + dir * len * 0.5, my = y0 - len * 0.62;
        const wide = 4.6 - i * 0.5;
        g.save();
        lit(g, C.emberRamp, x0, y0 + wide, x1, y1);
        g.beginPath();
        g.moveTo(x0, y0 + wide * 0.5);
        g.quadraticCurveTo(mx + dir * wide * 0.4, my + wide * 0.6, x1, y1);
        g.quadraticCurveTo(mx - dir * wide * 0.5, my - wide * 0.7, x0, y0 - wide * 0.5);
        g.closePath();
        g.fill();
        finish(g, C.emberRamp, WS.min(x0, x1) - wide, WS.min(y0, y1) - wide,
          WS.max(x0, x1) + wide, WS.max(y0, y1) + wide);
        g.restore();
      }
    }
    // and then the light off them
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const dir of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const spread = rake + i * (0.86 / n);
        const len = (base + i * 3.8) * k;
        const x0 = 50 + dir * (b.sh - 1.5), y0 = SHOULDER_Y + 1 + i * 2.4;
        const x1 = x0 + dir * WS.cos(spread) * len;
        const y1 = y0 - WS.sin(spread) * len * 0.58;   // out more than up: a pinion that rises is a pinion through the top of the tile
        const grd = g.createLinearGradient(x0, y0, x1, y1);
        grd.addColorStop(0, WS.rgb(C.emberRgb, 0.30 * k));
        grd.addColorStop(0.6, WS.rgb(C.emberRgb, 0.18 * k));
        grd.addColorStop(1, WS.rgb(C.emberRgb, 0));
        g.strokeStyle = grd;
        g.lineWidth = 2.2 - i * 0.28;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo(x0 + dir * len * 0.5, y0 - len * 0.62, x1, y1);
        g.stroke();
      }
    }
    g.restore();
  }

  /* WHAT THE LIGHT BURNS AS. Ten survivors reaching rank 6 all carried the
   * exact same triangle-and-dot on the chest, in the one universal ember
   * colour that is the whole point of this ladder - which meant the ONE
   * rank meant to show what the ember does to a person, specifically,
   * showed the same mark on all ten of them. The colour staying universal
   * is correct and stays; the glyph drawn in it did not have to, any more
   * than a crown's point count did. Each is a small stroked shape keyed to
   * what the survivor already is - a mage's spark, a shaman's lightning,
   * a paladin's shield - drawn at CAST's own `brand` id and falling back to
   * the original triangle for any class that does not name one. */
  const BRANDS = {
    default(g) {
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = -WS.PI / 2 + i * (WS.TAU / 3);
        const px = WS.cos(a) * 4.6, py = WS.sin(a) * 4.6;
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath(); g.stroke();
      g.beginPath(); g.arc(0, 0, 1.9, 0, WS.TAU); g.stroke();
    },
    mage(g) {                                          // a faceted sparkle
      g.beginPath();
      g.moveTo(0, -5.2); g.lineTo(1.4, -1.2); g.lineTo(5.2, 0);
      g.lineTo(1.4, 1.2); g.lineTo(0, 5.2); g.lineTo(-1.4, 1.2);
      g.lineTo(-5.2, 0); g.lineTo(-1.4, -1.2); g.closePath();
      g.stroke();
    },
    priest(g) {                                        // a sunburst
      g.beginPath(); g.arc(0, 0, 1.8, 0, WS.TAU); g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * WS.TAU;
        g.beginPath();
        g.moveTo(WS.cos(a) * 2.6, WS.sin(a) * 2.6);
        g.lineTo(WS.cos(a) * 5.4, WS.sin(a) * 5.4);
        g.stroke();
      }
    },
    rogue(g) {                                          // crossed blades
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * -4.4, -4.4); g.lineTo(s * 4.4, 4.4);
        g.stroke();
        g.beginPath(); g.arc(s * -4.4, -4.4, 0.9, 0, WS.TAU); g.stroke();
      }
    },
    hunter(g) {                                         // an arrowhead
      g.beginPath();
      g.moveTo(0, -5.2); g.lineTo(4, 1.4); g.lineTo(1.3, 1.4);
      g.lineTo(1.3, 5.2); g.lineTo(-1.3, 5.2); g.lineTo(-1.3, 1.4);
      g.lineTo(-4, 1.4); g.closePath();
      g.stroke();
    },
    warrior(g) {                                        // an axe on its haft
      g.beginPath(); g.moveTo(0, -5.2); g.lineTo(0, 5.2); g.stroke();
      g.beginPath();
      g.moveTo(0.4, -3.8);
      g.quadraticCurveTo(4.6, -3.4, 4.6, -0.2);
      g.quadraticCurveTo(4.6, 2.4, 0.4, 2.2);
      g.closePath(); g.stroke();
    },
    warlock(g) {                                        // a lidded eye
      g.beginPath();
      g.moveTo(-5.2, 0); g.quadraticCurveTo(0, -3.6, 5.2, 0);
      g.quadraticCurveTo(0, 3.6, -5.2, 0); g.closePath(); g.stroke();
      g.beginPath(); g.ellipse(0, 0, 0.9, 1.9, 0, 0, WS.TAU); g.fill();
    },
    shaman(g) {                                         // a lightning bolt
      g.beginPath();
      g.moveTo(1.6, -5.4); g.lineTo(-2.4, 0.4); g.lineTo(0.6, 0.4);
      g.lineTo(-1.6, 5.4); g.lineTo(3.2, -1.0); g.lineTo(0.4, -1.0);
      g.closePath();
      g.stroke();
    },
    paladin(g) {                                        // a heraldic shield
      g.beginPath();
      g.moveTo(0, -5.4); g.lineTo(3.6, -3.8); g.lineTo(3.6, 1.2);
      g.quadraticCurveTo(3.6, 4.4, 0, 5.6);
      g.quadraticCurveTo(-3.6, 4.4, -3.6, 1.2); g.lineTo(-3.6, -3.8);
      g.closePath(); g.stroke();
    },
    graveblade(g) {                                     // a jagged crack
      g.beginPath();
      g.moveTo(-1.6, -5.4); g.lineTo(0.6, -1.8); g.lineTo(-0.8, -0.6);
      g.lineTo(1.6, 5.4);
      g.stroke();
      g.beginPath(); g.moveTo(-2.6, -1.4); g.lineTo(-0.4, -0.6); g.stroke();
      g.beginPath(); g.moveTo(2.2, 1.6); g.lineTo(0.2, 1.0); g.stroke();
    },
    ruinseeker(g) {                                     // a vertical rift
      g.beginPath();
      g.moveTo(0, -5.6);
      g.quadraticCurveTo(1.6, -1.8, 0.5, 0); g.quadraticCurveTo(1.6, 1.8, 0, 5.6);
      g.quadraticCurveTo(-1.6, 1.8, -0.5, 0); g.quadraticCurveTo(-1.6, -1.8, 0, -5.6);
      g.closePath(); g.stroke();
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(s * 2.2, -1.2); g.lineTo(s * 3.6, -2.2); g.stroke();
      }
    },
  };

  /** EMBER BRAND: the light itself, through the chest. The last rank, and the
   *  only one that changes the survivor rather than what they are wearing. */
  function emberBrand(g, cfg, C, b, k) {
    if (!k) return;
    const y = (SHOULDER_Y + WAIST_Y) * 0.5 - 1;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(50, y, 0.5, 50, y, 13 * k);
    halo.addColorStop(0, WS.rgb(C.emberRgb, 0.55 * k));
    halo.addColorStop(0.5, WS.rgb(C.emberRgb, 0.2 * k));
    halo.addColorStop(1, WS.rgb(C.emberRgb, 0));
    g.fillStyle = halo;
    g.beginPath(); g.arc(50, y, 13 * k, 0, WS.TAU); g.fill();
    g.strokeStyle = WS.rgb(C.emberRgb, 0.85 * k);
    g.fillStyle = WS.rgb(C.emberRgb, 0.85 * k);
    g.lineWidth = 1.3 / k;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.save();
    g.translate(50, y);
    g.scale(k, k);
    (BRANDS[cfg.brand] || BRANDS.default)(g);
    g.restore();
    g.restore();
  }

  function emberCrown(g, cfg, C, k, b) {
    if (!k) return;
    const cx = 50;
    /* Cut to the build, for the same reason the train is cut to the cloak: at
       grey, the only thing telling two survivors apart is the outline, and an
       identical crown on the two heavy builds is one more thing they share.
       A broad frame carries few heavy points; a narrow one carries many fine
       ones. */
    const heavy = b ? b.sh >= 12 : false;
    const slim = b ? b.sh <= 9.5 : false;
    /* The build sets a default so a class that names no crownPoints still
       gets a sane count; CAST overrides it so classes sharing a build do
       not also share a crown - mage, priest and rogue are all slim and
       used to wear the exact same eleven-point circlet. */
    const pts = cfg.crownPoints || (heavy ? 5 : slim ? 11 : 8);
    /* A circlet cannot close through a pair of horns, so a horned survivor
       wears theirs parted - open at the sides, and set lower where there is
       still skull to sit on. It is the one thing shaman and ruinseeker do not
       share: same build, same tattered cloak, and at the top of the ladder
       they were the closest pair in the cast. */
    const horned = !!cfg.horns;
    const spread = heavy ? 1.14 : slim ? 0.9 : 1;
    const stout = heavy ? 1.5 : slim ? 0.72 : 1;
    /* CEIL is the one rule nothing may break: the sprite is a square canvas
       and anything past its edge is cut with a flat line, which on a crown
       reads instantly as a bug. */
    const cy = CEIL + (horned ? 8.5 : 5.5);
    const rx = 13 * k * spread, ry = 3.8 * k * spread;
    // the points, back ones first so the front overlaps them
    for (const pass of [0, 1]) {
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * WS.TAU - WS.PI / 2;
        const front = WS.sin(a) > 0;
        if ((pass === 0) === front) continue;
        // the gap the horns come through
        if (horned && Math.abs(WS.cos(a)) > 0.72) continue;
        const ex = cx + WS.cos(a) * rx;
        const ey = cy + WS.sin(a) * ry;
        const h = (front ? 5.2 : 3.4) * k * stout;
        const halfW = 1.5 * k * stout;
        panel(g, [[ex - halfW, ey + 1], [ex, ey - h], [ex + halfW, ey + 1]], C.emberRamp);
        g.save();
        g.globalCompositeOperation = 'lighter';
        glow(g, ex, ey - h * 0.55, front ? 2.6 : 1.8, WS.rgb(C.emberRgb, 1),
          front ? 0.9 : 0.45);
        g.restore();
      }
    }
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, cx, cy, 13 * k * spread, WS.rgb(C.emberRgb, 1), 0.22);
    g.restore();
  }

  function figure(g, cfg, C, w) {
    const b = BUILDS[cfg.build] || BUILDS.normal;
    /* THE FEET OWN THE FLOOR.
     *
     * The body rides up on the passing beats and drops onto each contact -
     * that is where the weight lands - but the first version lifted the WHOLE
     * figure, legs included, and the boots came off the ground twice a stride.
     * A walk in which both feet leave the floor is a hop.
     *
     * So the lift is applied to everything from the hips up and to nothing
     * else: the legs are drawn from a hip that moves to a foot that does not,
     * and a robe's hem is pinned to the ground while its waist rises. The leg
     * changing length between the two IS the walk. */
    const lift = w.lift * 1.9;
    /* CLOTH GATHERS, IT DOES NOT SINK.
     *
     * The cloak rides the body by translating with the lift, which is right
     * for a walk, where lift is only ever positive. A crouch is a NEGATIVE
     * lift - that is how the poses get a survivor onto one knee for free on
     * all ten of them - and the same translate then drove a long cloak's hem
     * ten units through the floor and out of the bottom of its own tile. A
     * hem on the ground piles up; it does not carry on down. */
    const cloakLift = WS.max(lift, -2.2);
    g.save(); g.translate(0, -cloakLift);
    emberTrain(g, cfg, C, b, w, cfg.emberTrain || 0);
    drawCloak(g, cfg, C, b, w);
    g.restore();
    if (cfg.emberWings) {
      g.save(); g.translate(0, -lift);
      emberWings(g, cfg, C, b);
      g.restore();
    }
    drawBody(g, cfg, C, b, w, lift);
    if (cfg.emberBrand) {
      g.save(); g.translate(0, -lift);
      emberBrand(g, cfg, C, b, cfg.emberBrand);
      g.restore();
    }
    if (cfg.emberHem) { g.save(); g.translate(0, -cloakLift); emberHem(g, cfg, C, b, w); g.restore(); }
    g.save(); g.translate(0, -lift);
    emberMantle(g, cfg, C, b, cfg.emberMantle || 0);
    drawHead(g, cfg, C);
    emberCrown(g, cfg, C, cfg.emberCrown || 0, b);
    // Offhand first, so the main weapon lands in front of it.
    const off = WEAPONS[cfg.offhand];
    if (off) off(g, C, b);
    const wp = WEAPONS[cfg.weapon];
    if (wp) wp(g, C, b);
    g.restore();
  }

  const Hero = {
    ids: Object.keys(CAST),
    frames: FRAMES,
    maxRank: MAX_RANK,
    kitFor,

    /** Draw survivor `id` into `g`, filling a `size`-square canvas.
     *
     *  The rim and the contact shadow are taken from the finished silhouette
     *  rather than painted part by part: the figure is rendered once, the same
     *  image is re-tinted flat and stamped behind itself twice - up-left in arc
     *  gold, down-right in floor blue - and then the real figure lands on top.
     *  One pass, correct for every class automatically, and it is what makes
     *  the shape hold together against a dark and crowded ground. */
    poseFrames: POSE_FRAMES,

    /** @param {number} [phase] 0..1 through one stride; omit for standing.
     *  @param {{kind:string,k:number}} [pose] overrides the stride entirely. */
    draw(g, size, id, tint, demon, phase, pose, rank) {
      const cfg = kitFor(id, rank);
      const posed = pose && POSES[pose.kind];
      const w = posed ? POSES[pose.kind](pose.k)
        : (phase === undefined ? STILL : stride(phase));
      const C = colours(tint, demon, cfg.eyeColour);
      const u = size / 100;

      /* Contact shadow on the floor, under the feet, before anything else -
         and it does NOT go with them. A figure going over leaves its shadow
         on the ground and spreads it; a shadow that rotated with the body
         would be a sticker on its heel. */
      const fallen = w.fallen || 0;
      g.save();
      g.scale(u, u);
      const shR = 22 * (1 + fallen * 0.7);
      const sh = g.createRadialGradient(50, GROUND, 0, 50, GROUND, shR);
      sh.addColorStop(0, `rgba(0,0,0,${(0.5 - fallen * 0.16).toFixed(3)})`);
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh;
      g.beginPath(); g.ellipse(50, GROUND, shR, 6 + fallen * 2, 0, 0, WS.TAU); g.fill();
      g.restore();

      const body = document.createElement('canvas');
      body.width = size; body.height = size;
      const bg = body.getContext('2d');
      bg.scale(u, u);
      /* The pose's whole-figure move, pivoted at the feet - which is what a
         person turns about when they are knocked back or go down, and the one
         point in the rig that is already on the floor. */
      if (w.tilt || w.slide || w.drop || w.shrink !== undefined) {
        bg.translate(50 + (w.slide || 0), GROUND + (w.drop || 0));
        bg.rotate(w.tilt || 0);
        if (w.shrink !== undefined) bg.scale(w.shrink, w.shrink);
        bg.translate(-50, -GROUND);
      }
      figure(bg, cfg, C, w);

      const sil = document.createElement('canvas');
      sil.width = size; sil.height = size;
      const sg = sil.getContext('2d');
      const stamp = (colour) => {
        sg.clearRect(0, 0, size, size);
        sg.globalCompositeOperation = 'source-over';
        sg.drawImage(body, 0, 0);
        sg.globalCompositeOperation = 'source-in';
        sg.fillStyle = colour;
        sg.fillRect(0, 0, size, size);
        return sil;
      };
      /* The offset is in RIG units, not pixels.
       *
       * Tied to pixels it was a fixed 3px at portrait size and 1px in the
       * world, which is not a light - it is an outline that thickens as you
       * zoom in, and it read exactly like one: a gold sticker edge around
       * every limb. At a hair over one unit it stays the same width relative
       * to the figure at every size the game draws, which is what a light
       * does. */
      const off = size * 0.011;
      g.save();
      g.globalAlpha = 0.22;
      g.drawImage(stamp(BOUNCE), off * 0.8, off * 0.9);    // cold bounce beneath
      g.globalAlpha = 0.5;
      g.drawImage(stamp(RIM), -off, -off * 1.15);          // arc gold above
      g.restore();
      g.drawImage(body, 0, 0);
    },
  };

  WS.Hero = Hero;

})(window.WS);
