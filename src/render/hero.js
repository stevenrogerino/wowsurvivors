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
  function ramp(base) {
    return {
      key: WS.hex(WS.mix(base, [1, 1, 1], 0.34)),
      core: WS.hex(base),
      shade: WS.hex(WS.shade(base, 0.66)),
      deep: WS.hex(WS.shade(base, 0.40)),
      line: WS.hex(WS.shade(base, 0.22)),
    };
  }

  const CLOTH = ramp([0.30, 0.33, 0.42]);   // obsidian weave, the default garment
  const DARKCLOTH = ramp([0.17, 0.18, 0.25]); // what a hood's inside is made of
  const LEATHER = ramp([0.42, 0.30, 0.19]);
  const STEEL = ramp([0.60, 0.65, 0.75]);
  const GOLD = ramp([0.72, 0.55, 0.24]);
  const SKIN = ramp([0.80, 0.62, 0.47]);
  const WOOD = ramp([0.40, 0.29, 0.18]);

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

  function blob(g, cx, cy, rx, ry, r, rot) {
    g.save();
    g.translate(cx, cy);
    if (rot) g.rotate(rot);
    lit(g, r, -rx, -ry, rx * 0.8, ry);
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, WS.TAU); g.fill();
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
  }

  /** A limb: a round-capped stroke, which is the cheapest honest capsule. */
  function limb(g, x0, y0, x1, y1, w, r, flat) {
    const grd = g.createLinearGradient(x0 - w, y0, x1 + w, y1);
    grd.addColorStop(0, flat ? r.shade : r.key);
    grd.addColorStop(1, flat ? r.deep : r.shade);
    g.strokeStyle = grd; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
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
        if (cfg.helmHorns) {
          /* Horns off the helm, curving forward. Two survivors wear steel and
           * the crest alone was not enough to tell their heads apart at 34px -
           * this one is the brawler and now his outline says so before any
           * colour does. */
          /* Heavy at the root and curling UP. The first pair left the helm
           * almost horizontally and at a constant thinness, which on a head
           * reads as antennae - two twigs, not two horns. Thickness at the
           * base and a turn upward are the whole difference. */
          for (const dir of [-1, 1]) {
            lit(g, ramp([0.56, 0.53, 0.47]), cx + dir * 8, HEAD_CY - 4, cx + dir * 17, CEIL + 3);
            g.beginPath();
            g.moveTo(cx + dir * 7.5, HEAD_CY - 9);
            g.bezierCurveTo(cx + dir * 15, HEAD_CY - 9, cx + dir * 17.5, HEAD_CY - 15,
              cx + dir * 14.5, CEIL + 3);
            g.bezierCurveTo(cx + dir * 14, HEAD_CY - 13, cx + dir * 12, HEAD_CY - 8,
              cx + dir * 7, HEAD_CY - 1.5);
            g.closePath(); g.fill();
          }
        }
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
          g.globalAlpha = 0.5;
          for (const dir of [-1, 1]) {
            g.beginPath();
            g.moveTo(cx + dir * 2.6, eyeY + 2.4);
            g.lineTo(cx + dir * 5.6, eyeY + 2);
            g.lineTo(cx + dir * 5, eyeY + 7);
            g.lineTo(cx + dir * 3.2, eyeY + 7.2);
            g.closePath(); g.fill();
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

  /* --------------------------------------------------------------- body --- */
  function drawBody(g, cfg, C, b) {
    const cx = 50;

    // Far arm first, in shadow, so the near side has something to sit in front
    // of. Depth at this scale is entirely a matter of what overlaps what.
    taper(g, cx - b.sh + 1, SHOULDER_Y + 1, cx - b.sh - 2.5, WAIST_Y - 1,
      b.arm * 0.62, b.arm * 0.38, C.bodyRamp, true);

    if (cfg.robe) {
      // A bell from the waist to the floor, with the hem catching the light.
      panel(g, [[cx - b.waist, WAIST_Y - 4], [cx + b.waist, WAIST_Y - 4],
        [cx + b.hip + 8, FOOT_Y], [cx - b.hip - 8, FOOT_Y]], C.robeRamp);
      panel(g, [[cx - b.hip - 8, FOOT_Y], [cx + b.hip + 8, FOOT_Y],
        [cx + b.hip + 6.5, FOOT_Y - 4.5], [cx - b.hip - 6.5, FOOT_Y - 4.5]], C.trimRamp);
      g.fillStyle = 'rgba(0,0,0,.30)';
      g.beginPath(); g.moveTo(cx - b.hip - 8, FOOT_Y);
      g.lineTo(cx + b.hip + 8, FOOT_Y); g.lineTo(cx + b.hip + 6, FOOT_Y - 1.5);
      g.lineTo(cx - b.hip - 6.5, FOOT_Y - 1.5); g.closePath(); g.fill();
      // Two folds, which is all a bell needs to stop reading as a triangle.
      g.strokeStyle = 'rgba(0,0,0,.26)'; g.lineWidth = 1.4;
      for (const dx of [-5, 5]) {
        g.beginPath(); g.moveTo(cx + dx, WAIST_Y); g.lineTo(cx + dx * 2.1, FOOT_Y - 2); g.stroke();
      }
    } else {
      for (const dir of [-1, 1]) {
        const hx = cx + dir * (b.hip - b.leg * 0.5);
        const fx = hx + dir * 1.5;
        taper(g, hx, HIP_Y - 4, fx, FOOT_Y - 6, b.leg * 0.62, b.leg * 0.42, C.legRamp, dir < 0);
        /* The boot is drawn as a shape with a toe, sitting ON the ground line
         * rather than an ellipse hovering near it. Two survivors ago these
         * were detached brown ovals and the whole cast looked like it was on
         * casters. */
        panel(g, [[fx - b.leg * 0.5, FOOT_Y - 8], [fx + b.leg * 0.5, FOOT_Y - 8],
          [fx + dir * b.leg * 0.95, FOOT_Y - 1.5], [fx - dir * b.leg * 0.45, FOOT_Y - 1.5]],
          dir < 0 ? ramp([0.26, 0.19, 0.12]) : LEATHER);
      }
    }

    // Torso: shoulders down to waist, tapered. One shape, so the outline is one
    // shape, which is the whole point of the silhouette rule.
    panel(g, [[cx - b.sh, SHOULDER_Y - 2], [cx + b.sh, SHOULDER_Y - 2],
      [cx + b.waist, WAIST_Y], [cx - b.waist, WAIST_Y]], C.bodyRamp);

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
    g.fillStyle = GOLD.key;
    g.fillRect(cx - 2.6, WAIST_Y - 3.6, 5.2, 3.2);

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
        panel(g, [[px - dir * 5 * k, SHOULDER_Y - 3.4 * k], [px + dir * 2.4 * k, SHOULDER_Y - 3.1 * k],
          [px + dir * 4.4 * k, SHOULDER_Y - 0.6 * k], [px + dir * 4 * k, SHOULDER_Y + 2.6 * k],
          [px - dir * 5 * k, SHOULDER_Y + 2.2 * k]], dir < 0 ? ramp([0.40, 0.44, 0.52]) : C.plateRamp);
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
    taper(g, cx + b.sh - 1, SHOULDER_Y + 1, cx + b.sh + 2, WAIST_Y - 2,
      b.arm * 0.68, b.arm * 0.4, C.bodyRamp);
    if (cfg.bracer) {
      // A wide cuff on the working arm. One hard edge on a soft limb, and it
      // lands exactly where the eye already is - at the hands.
      panel(g, [[cx + b.sh - 1.5, WAIST_Y - 12], [cx + b.sh + 4.5, WAIST_Y - 12.5],
        [cx + b.sh + 5, WAIST_Y - 4], [cx + b.sh - 1, WAIST_Y - 3.5]], LEATHER);
      g.fillStyle = GOLD.core;
      g.fillRect(cx + b.sh - 1, WAIST_Y - 9.5, 5.6, 1.4);
    }
    /* A hand the width of the wrist it belongs to, not a knob on the end of
     * it - and in the right material. The graveblade's arm and hand were built
     * from his garment ramp, which is crimson, and hung in front of a crimson
     * cloak: the hand simply vanished, and with it the fact that he is holding
     * anything. Gauntlets put dark steel between the two. */
    if (cfg.gauntlets) {
      taper(g, cx + b.sh - 1, WAIST_Y - 14, cx + b.sh + 2, WAIST_Y - 2,
        b.arm * 0.6, b.arm * 0.46, ramp([0.30, 0.32, 0.38]));
      blob(g, cx + b.sh + 2.4, WAIST_Y - 0.5, b.arm * 0.5, b.arm * 0.56,
        ramp([0.38, 0.40, 0.46]));
      g.fillStyle = 'rgba(255,255,255,.22)';
      g.beginPath();
      g.ellipse(cx + b.sh + 1.4, WAIST_Y - 1.8, b.arm * 0.22, b.arm * 0.16, -0.4, 0, WS.TAU);
      g.fill();
    } else {
      blob(g, cx + b.sh + 2.4, WAIST_Y - 0.5, b.arm * 0.44, b.arm * 0.5, SKIN);
    }
  }

  /* ------------------------------------------------------------- cloaks --- */
  function drawCloak(g, cfg, C, b) {
    const cx = 50, k = cfg.cloak;
    if (!k) return;
    const foot = k === 'short' ? WAIST_Y + 6 : FOOT_Y - 1;
    const flare = k === 'short' ? 5 : 11;
    const pts = [[cx - b.sh - 1, SHOULDER_Y - 4], [cx + b.sh + 1, SHOULDER_Y - 4],
      [cx + b.sh + flare, foot]];
    if (k === 'cut') {
      /* Cut away on one side. A hem that is level all round reads as a
       * garment; one that is short over the leading leg reads as a garment
       * somebody has to move in. */
      pts.push([cx + b.sh + flare - 1, WAIST_Y + 16]);
      pts.push([cx + 2, WAIST_Y + 9]);
      pts.push([cx - b.sh - flare, foot]);
    } else if (k === 'tattered') {
      // A ragged hem, cut with the same seed every time so the character does
      // not change clothes between the roster and the run.
      const teeth = 7;
      for (let i = 0; i <= teeth; i++) {
        const t = 1 - i / teeth;
        const x = cx - b.sh - flare + (b.sh + flare) * 2 * t;
        pts.push([x, foot - (i % 2 ? 9 : 1) - (i % 3) * 2.5]);
      }
    } else {
      pts.push([cx - b.sh - flare, foot]);
    }
    panel(g, pts, C.cloakRamp);
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
      const gx = 50 + b.sh + 3;
      limb(g, gx - 2, FOOT_Y - 2, gx + 3, CEIL + 9, 3.2, WOOD);
      g.fillStyle = GOLD.core;
      g.beginPath(); g.ellipse(gx + 3, CEIL + 10, 4.6, 3, 0, 0, WS.TAU); g.fill();
      glow(g, gx + 3, CEIL + 6, 6, C.accent, 0.9);
      g.fillStyle = C.accentLight;
      g.beginPath(); g.arc(gx + 3, CEIL + 6, 3.4, 0, WS.TAU); g.fill();
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
      g.strokeStyle = GOLD.shade; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(gx, hy); g.quadraticCurveTo(gx + 6, hy + 6, gx + 7, hy + 13); g.stroke();
      panel(g, [[gx + 3, hy + 14], [gx + 11, hy + 14], [gx + 9.5, hy + 22], [gx + 4.5, hy + 22]], GOLD);
      g.fillStyle = C.accentLight;
      g.fillRect(gx + 5, hy + 17, 4, 4);
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
        g.fillStyle = 'rgba(255,255,255,.4)';
        g.beginPath(); g.moveTo(0.6, -1); g.lineTo(1.3, -19); g.lineTo(0, -23);
        g.closePath(); g.fill();
        g.fillStyle = LEATHER.core; g.fillRect(-2.6, 0, 5.2, 6);
        g.restore();
      }
    },
    bow(g, C, b) {
      // The limb curves away from a grip that sits IN the hand, and the string
      // closes the shape - without it the bow was an unexplained arc in the air.
      const gx = 50 + b.sh + 2, gy = WAIST_Y - 6, rad = 20;
      g.strokeStyle = WOOD.core; g.lineWidth = 2.4; g.lineCap = 'round';
      g.beginPath(); g.arc(gx, gy, rad, -1.25, 1.25); g.stroke();
      g.strokeStyle = 'rgba(226,233,245,.7)'; g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(gx + rad * Math.cos(-1.25), gy + rad * Math.sin(-1.25));
      g.lineTo(gx + rad * Math.cos(1.25), gy + rad * Math.sin(1.25));
      g.stroke();
      g.fillStyle = LEATHER.core;
      g.fillRect(gx + rad - 2, gy - 5, 3.6, 10);
      // A quiver over the far shoulder: the hunter's second silhouette cue.
      g.save();
      g.translate(50 - b.sh - 1, SHOULDER_Y + 4); g.rotate(-0.34);
      panel(g, [[-3.4, -12], [3.4, -12], [2.8, 10], [-2.8, 10]], LEATHER);
      for (const dx of [-1.8, 0.2, 2]) {
        g.fillStyle = '#cdd5e4';
        g.fillRect(dx, -17, 1.2, 6);
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
      // The back cheek, shorter and darker: an axe is not symmetrical.
      lit(g, ramp([0.38, 0.42, 0.50]), gx - 8, bit - 6, gx + 1, bit + 10);
      g.beginPath();
      g.moveTo(gx + 1, bit - 7);
      g.bezierCurveTo(gx - 6, bit - 6, gx - 8, bit - 1, gx - 7, bit + 4);
      g.bezierCurveTo(gx - 4, bit + 6, gx - 1, bit + 8, gx + 1, bit + 11);
      g.closePath(); g.fill();
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
      const gx = 50 + b.sh + 6;
      glow(g, gx, WAIST_Y - 12, 15, C.accent, 0.95);
      g.fillStyle = C.accentLight;
      g.beginPath(); g.arc(gx, WAIST_Y - 12, 4.4, 0, WS.TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.beginPath(); g.arc(gx - 1.4, WAIST_Y - 13.4, 1.5, 0, WS.TAU); g.fill();
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
      // The head: wider than the haft, with a heavy brow and a cut jaw.
      panel(g, [[gx - 5.5, top + 9], [gx - 6, top - 3], [gx - 2, top - 6],
        [gx + 6, top - 5], [gx + 7, top + 3], [gx + 4, top + 10],
        [gx - 1, top + 11]], ramp([0.34, 0.25, 0.16]));
      g.fillStyle = 'rgba(12,8,5,.6)';                 // the mouth, cut across
      g.fillRect(gx - 4.5, top + 5.5, 10, 2.2);
      for (const dx of [-2.6, 2.4]) {
        g.fillStyle = C.accent;
        g.beginPath(); g.ellipse(gx + dx, top + 1, 1.5, 1.1, 0, 0, WS.TAU); g.fill();
      }
      glow(g, gx + 0.5, top + 1, 9, C.accent, 0.55);
      // Hide collar where the head is lashed on, and a feather on a thong.
      panel(g, [[gx - 4.5, top + 11], [gx + 4.5, top + 11],
        [gx + 3.5, top + 15], [gx - 3.5, top + 15]], LEATHER);
      panel(g, [[gx + 3, top + 15], [gx + 5, top + 15],
        [gx + 8, top + 27], [gx + 4.5, top + 25]], C.featherRamp);
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
      // The head: a square face with a chamfer, and a spike behind it.
      panel(g, [[gx - 9, head - 1], [gx + 8, head - 4], [gx + 9, head + 8],
        [gx - 8, head + 11]], STEEL);
      panel(g, [[gx + 8, head - 3], [gx + 15, head + 1], [gx + 15, head + 5],
        [gx + 8.5, head + 8]], ramp([0.44, 0.47, 0.55]));
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
        lit(g, ramp([0.30, 0.26, 0.34]), -2, -14, 12, 10);
        g.beginPath();
        g.moveTo(-2.5, 2);
        g.bezierCurveTo(6, 0, 12, -6, 12.5, -15);
        g.bezierCurveTo(9, -7, 4, -3.5, -2.5, -3);
        g.closePath(); g.fill();
        // The edge, lit: one bright taper along the outside of the curve.
        g.strokeStyle = C.accentLight; g.lineWidth = 1.3; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-2, 1.4);
        g.bezierCurveTo(6, -0.6, 11.4, -6.4, 11.9, -14.6);
        g.stroke();
        g.fillStyle = LEATHER.core;                    // the grip in the fist
        g.fillRect(-4.5, -3.4, 4.5, 6);
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
   * WHAT THE CAST STILL WANTS is a walk. Even a two-frame lean would do more
   * for how the game feels than any further detail on any of them; the figure
   * currently bobs and never shifts its weight. */
  const CAST = {
    /* Each survivor carries ONE mark that is theirs alone, on top of the
     * shared rig - the method the shaman and the ruinseeker were done by, run
     * across the rest of the cast. Read down the column of what is unique to
     * each and no two lines repeat; that is the test, and it is the same test
     * the silhouette rule applies to the outline. */
    mage: { build: 'slim', head: 'bare', robe: true, cloak: 'long', weapon: 'staff',
      sash: true, sleeves: true, hair: DARKCLOTH },
    /* No tabard: the stole sits exactly where one goes and the two together
     * made the whole front of her one pale slab. Two bands with the robe
     * showing between them is the reading; three overlapping ones is a bib. */
    priest: { build: 'slim', head: 'bare', robe: true, cloak: 'short', halo: true,
      weapon: 'censer', stole: true, hair: ramp([0.55, 0.46, 0.33]) },
    rogue: { build: 'slim', head: 'hood', cloak: 'cut', weapon: 'daggers',
      scarf: true, sheaths: true, bracer: true },
    hunter: { build: 'normal', head: 'bare', weapon: 'bow', hoodDown: true, pelt: true,
      bracer: true, strap: true, bootknife: true, hair: ramp([0.30, 0.26, 0.18]) },
    warrior: { build: 'heavy', head: 'helm', pauldrons: 2.1, weapon: 'axe',
      helmHorns: true, sash: true },
    warlock: { build: 'normal', head: 'hood', robe: true, cloak: 'tattered',
      weapon: 'orb', chains: true, tome: true, wisp: true, hood: DARKCLOTH },
    /* The shaman used to be a robed slim silhouette with a long cloak, which
     * put him inside 83% of the mage's outline and 81% of the warlock's -
     * three survivors sharing one shape. Legs and a ragged hem take him out of
     * that cluster without touching anything else about him. */
    shaman: { build: 'normal', head: 'bare', cloak: 'tattered', weapon: 'totem',
      mantle: true, warpaint: true, armwraps: true, hair: ramp([0.22, 0.24, 0.30]) },
    paladin: { build: 'heavy', head: 'helm', pauldrons: 2.4, halo: true, tabard: true,
      weapon: 'hammer', offhand: 'shield', device: true },
    graveblade: { build: 'heavy', head: 'undead', undead: true, pauldrons: 1.7,
      cloak: 'tattered', weapon: 'greatsword', chains: true, crown: true,
      gauntlets: true, eyeColour: [0.32, 0.72, 1.0] },
    ruinseeker: { build: 'normal', head: 'bare', horns: true, cloak: 'tattered',
      weapon: 'glaives', blindfold: true, sigils: true, bracer: true, legwraps: true,
      hair: DARKCLOTH },
  };

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
  function figure(g, cfg, C) {
    const b = BUILDS[cfg.build] || BUILDS.normal;
    drawCloak(g, cfg, C, b);
    drawBody(g, cfg, C, b);
    drawHead(g, cfg, C);
    // Offhand first, so the main weapon lands in front of it.
    const off = WEAPONS[cfg.offhand];
    if (off) off(g, C, b);
    const w = WEAPONS[cfg.weapon];
    if (w) w(g, C, b);
  }

  const Hero = {
    ids: Object.keys(CAST),

    /** Draw survivor `id` into `g`, filling a `size`-square canvas.
     *
     *  The rim and the contact shadow are taken from the finished silhouette
     *  rather than painted part by part: the figure is rendered once, the same
     *  image is re-tinted flat and stamped behind itself twice - up-left in arc
     *  gold, down-right in floor blue - and then the real figure lands on top.
     *  One pass, correct for every class automatically, and it is what makes
     *  the shape hold together against a dark and crowded ground. */
    draw(g, size, id, tint, demon) {
      const cfg = CAST[id] || CAST.mage;
      const C = colours(tint, demon, cfg.eyeColour);
      const u = size / 100;

      // Contact shadow on the floor, under the feet, before anything else.
      g.save();
      g.scale(u, u);
      const sh = g.createRadialGradient(50, GROUND, 0, 50, GROUND, 22);
      sh.addColorStop(0, 'rgba(0,0,0,.5)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh;
      g.beginPath(); g.ellipse(50, GROUND, 22, 6, 0, 0, WS.TAU); g.fill();
      g.restore();

      const body = document.createElement('canvas');
      body.width = size; body.height = size;
      const bg = body.getContext('2d');
      bg.scale(u, u);
      figure(bg, cfg, C);

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
