/* Canvas renderer. The world is a fixed 1280x720 space letterboxed into the
 * viewport, so gameplay is identical at every window size. Draw order is
 * strictly ground -> ground effects -> entities (y-sorted) -> air -> effects,
 * which keeps a 300-enemy field readable. */
'use strict';
(function (WS) {

  const R = {
    canvas: null,
    ctx: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    ground: null,      // pre-rendered tiling ground pattern
    props: [],
    vignette: null,
  };

  const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;

  // The in-world type stack, matching the DOM's --ui token. Canvas has no
  // cascade, so the fallbacks have to be spelled out at every call site;
  // naming it once keeps world text and panel text from drifting apart.
  const UI_FONT = "'Archivo', 'Segoe UI', system-ui, sans-serif";
  // The Watch's own voice - the serif the panels use for names and lines
  // spoken aloud. Banners are announcements, so they speak in it too.
  const VOICE_FONT = "'Alegreya', 'Iowan Old Style', Georgia, serif";

  R.init = function (canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Canvas text never triggers a webfont load on its own; ask up front so
    // the first banner of a run is not set in the fallback.
    if (document.fonts && document.fonts.load) {
      for (const f of ['700 38px Alegreya', 'italic 500 17px Alegreya']) document.fonts.load(f).catch(() => {});
    }
    this.applyQuality();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  };

  /* The quality switch, which until now was a setting that did nothing.
   *
   * `quality` sat in defaultSettings promising to drop soft shadows and bloom,
   * and not one line of code read it. A control that lies is worse than no
   * control: the player on the weak machine turns it down, nothing changes,
   * and they conclude the game is simply badly made.
   *
   * What actually costs frames here is not the flat fills - it is the gradient
   * objects built per entity per frame, and there can be hundreds. So the
   * `lite` path spends flat colour where `high` spends a gradient, and drops
   * the second-order flourishes (trails, ground graduations, the crowd ring)
   * that are lovely and not load-bearing. The game still reads correctly; it
   * just stops painting the parts that only ever said "this is expensive".
   *
   * Cached rather than read per draw call, because the read would otherwise
   * happen a few hundred times a frame to answer a question that changes when
   * the player opens a menu. */
  R.applyQuality = function () {
    const lite = WS.Save.settings.quality === 'balanced';
    const changed = lite !== this.lite;
    this.lite = lite;
    if (changed && this.canvas) this.resize();
  };

  R.resize = function () {
    /* Balanced also draws at the screen's CSS resolution rather than its
       device resolution. On a high-DPI display that is a quarter of the
       pixels for every glow, field and wash in the game - by far the largest
       single saving there is for a weak graphics chip - at the cost of
       softer edges, which is the trade the setting already describes. */
    const dpr = this.lite ? 1 : WS.min(window.devicePixelRatio || 1, 2);
    const vw = window.innerWidth, vh = window.innerHeight;
    this.canvas.width = WS.floor(vw * dpr);
    this.canvas.height = WS.floor(vh * dpr);
    this.canvas.style.width = vw + 'px';
    this.canvas.style.height = vh + 'px';
    this.dpr = dpr;
    this.scale = WS.min(vw / W, vh / H);
    this.offsetX = (vw - W * this.scale) * 0.5;
    this.offsetY = (vh - H * this.scale) * 0.5;
    this.viewW = vw; this.viewH = vh;
  };

  /** Window coords -> world coords (for touch input and debugging). */
  R.toWorld = function (px, py) {
    return [(px - this.offsetX) / this.scale, (py - this.offsetY) / this.scale];
  };

  /* ------------------------------------------------------------ scenery -- */
  /* THE FIELD IS BAKED WHOLE, AND IT IS NOT A TILE.
   *
   * It used to be a 256px canvas of mottle repeated across the world, which is
   * the cheap way and looks it, for two separate reasons. The obvious one is
   * that the same two hundred blobs appear fifteen times on a 1280x720 field
   * and the eye finds that immediately. The worse one is that the blobs were
   * drawn with plain ellipses at random positions inside the tile and NOT
   * wrapped, so every blob near an edge was sliced off flat - which put a
   * straight, hard cut down every seam. That is what read as a grid: not the
   * repetition, the row of clipped edges every 256 pixels.
   *
   * One canvas the size of the world fixes both at once and costs less per
   * frame than the pattern did - a drawImage instead of a patterned fillRect -
   * because the world does not scroll and never will. It also allows something
   * a tile cannot express at all: structure LARGER than the tile. Terrain
   * reads as terrain because it varies at a scale bigger than its own grain,
   * and a 256px tile could not carry a patch of ground two hundred pixels
   * across without repeating it five times.
   *
   * Three octaves, coarse to fine, all soft-edged. Seeded from the map, so a
   * battlefield looks like itself every time you play it.
   */
  const GROUND_SEED = {};
  let groundCanvas = null;

  /* How far each kind leans, in radians. Stone does not sway; a stump does
     not sway; everything with a stem does, and the lighter it is the more. */
  const SWAY = {
    wheat: 0.055, grass: 0.05, flower: 0.038, cactus: 0.008,
    tree: 0.014, deadtree: 0.018, spire: 0.006,
  };

  /* Radial, not a filled ellipse. A hard-edged ellipse at 8% alpha still has
   * an edge, and a few hundred of them read as scattered confetti rather than
   * as ground.
   *
   * `core` is how much of the blob is flat before it starts falling off, and
   * it is the difference between texture and haze. The first version of this
   * used a soft falloff for every octave, and fifteen hundred soft blobs
   * average into a smooth wash - the grid was gone and so was the ground.
   * Grain needs a hard middle; terrain does not. */
  function blob(g, x, y, r, colour, alpha, squash, core) {
    g.save();
    g.translate(x, y);
    g.scale(1, squash === undefined ? 0.72 : squash);
    /* Built AFTER the transform, centred on the origin.
     *
     * A canvas gradient is baked in the user space it is created in. Built at
     * (x, y) and then drawn inside a translate to (x, y), every gradient ends
     * up centred a full blob's distance away from the circle it is filling -
     * so the circle gets whatever the gradient has out there, which past the
     * last stop is nothing at all. Every blob on every layer painted
     * transparent, the field came out as a flat fill, and no amount of turning
     * the alpha up moved it a hundredth of a luminance unit. That last part is
     * what gave it away: a number that will not move is not a weak effect, it
     * is an effect that is not running. */
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, `rgba(${colour},${alpha.toFixed(3)})`);
    grd.addColorStop(core === undefined ? 0.65 : core,
      `rgba(${colour},${(alpha * (core === undefined ? 0.55 : 0.9)).toFixed(3)})`);
    grd.addColorStop(1, `rgba(${colour},0)`);
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, r, 0, WS.TAU); g.fill();
    g.restore();
  }

  /* ------------------------------------------------------------ terrain -- */
  /* WHAT THE GROUND IS MADE OF.
   *
   * Every battlefield was the same ground in a different colour: noise at
   * five scales, three worn paths and some tufts. That is enough to stop a
   * field reading as a fill and not enough for it to read as a PLACE - a
   * forest floor, a road, a graveyard, a baked plain and an ice sheet all
   * came out as the same speckled carpet. This paints what each one is
   * actually made of, once, into the ground canvas, so it costs nothing a
   * frame.
   *
   * Two rules from the rest of this file hold here too. Everything is laid
   * as soft or thin marks at low alpha, because the field is a stage and the
   * horde has to stand off it. And the dark and the light are kept in
   * balance, because check-ground pins each map's overall brightness and the
   * visibility of every creature, survivor and gem is measured against it. */
  const TERRAIN = {
    forest(g, c) {
      // dappled shade: the canopy nobody can see, overhead
      for (let i = 0; i < 26; i++) {
        c.blob(g, WS.randRange(0, W), WS.randRange(0, H), WS.randRange(110, 240), c.rgb(c.dark), 0.07, WS.randRange(0.6, 0.9));
      }
      for (let i = 0; i < 18; i++) {
        c.blob(g, WS.randRange(0, W), WS.randRange(0, H), WS.randRange(50, 110), c.rgb(c.light), 0.05, 0.7);
      }
      // leaf litter, in the colours of a wood that is turning
      const LEAF = [[0.42, 0.30, 0.12], [0.36, 0.22, 0.10], [0.30, 0.34, 0.14], [0.46, 0.38, 0.16]];
      for (let i = 0; i < 1400; i++) {
        const x = WS.random() * W, y = WS.random() * H, a = WS.random() * WS.PI;
        g.save(); g.translate(x, y); g.rotate(a);
        g.globalAlpha = WS.randRange(0.12, 0.3);
        g.fillStyle = WS.hex(LEAF[WS.randInt(0, LEAF.length - 1)]);
        g.beginPath(); g.ellipse(0, 0, WS.randRange(2.4, 4.6), WS.randRange(1, 1.8), 0, 0, WS.TAU); g.fill();
        g.restore();
      }
      // fallen logs, mossed over, lying where they came down
      for (let i = 0; i < 6; i++) {
        const x = WS.randRange(80, W - 80), y = WS.randRange(60, H - 60), len = WS.randRange(70, 130), a = WS.randRange(-0.6, 0.6), r = WS.randRange(7, 11);
        g.save(); g.translate(x, y); g.rotate(a);
        g.globalAlpha = 0.5; g.fillStyle = '#000';
        g.beginPath(); g.ellipse(4, r * 0.9, len * 0.52, r * 0.7, 0, 0, WS.TAU); g.fill();
        g.globalAlpha = 0.6;
        const bark = g.createLinearGradient(0, -r, 0, r);
        bark.addColorStop(0, '#4a3a28'); bark.addColorStop(0.5, '#2e2216'); bark.addColorStop(1, '#16100a');
        g.fillStyle = bark;
        g.beginPath(); g.ellipse(0, 0, len / 2, r, 0, 0, WS.TAU); g.fill();
        g.strokeStyle = 'rgba(12,8,4,.55)'; g.lineWidth = 1;
        for (let k = 0; k < 6; k++) {
          const bx = -len * 0.4 + WS.random() * len * 0.8;
          g.beginPath(); g.moveTo(bx, -r * 0.8); g.quadraticCurveTo(bx + 4, 0, bx - 2, r * 0.8); g.stroke();
        }
        g.fillStyle = '#5a4430'; g.beginPath(); g.ellipse(len / 2, 0, r * 0.35, r * 0.95, 0, 0, WS.TAU); g.fill();
        g.strokeStyle = 'rgba(30,20,10,.6)';
        g.beginPath(); g.ellipse(len / 2, 0, r * 0.2, r * 0.55, 0, 0, WS.TAU); g.stroke();
        g.fillStyle = 'rgba(70,110,40,.55)';
        for (let k = 0; k < 5; k++) {
          g.beginPath(); g.ellipse(-len * 0.35 + WS.random() * len * 0.6, -r * 0.5, WS.randRange(4, 10), WS.randRange(2, 4), 0, 0, WS.TAU); g.fill();
        }
        g.restore();
      }
      // pale caps in clusters at the foot of things
      for (let i = 0; i < 9; i++) {
        const x = WS.randRange(60, W - 60), y = WS.randRange(60, H - 60);
        for (let k = 0; k < WS.randInt(3, 6); k++) {
          const mx = x + WS.randRange(-9, 9), my = y + WS.randRange(-5, 5);
          g.globalAlpha = 0.5; g.fillStyle = '#1a140e';
          g.beginPath(); g.ellipse(mx + 1, my + 1.2, 2.6, 1.2, 0, 0, WS.TAU); g.fill();
          g.globalAlpha = 0.75; g.fillStyle = '#d8c8a8';
          g.beginPath(); g.ellipse(mx, my, 2.4, 1.6, 0, WS.PI, WS.TAU); g.fill();
        }
      }
      g.globalAlpha = 1;
    },

    road(g, c) {
      // a cart road across the reach: packed earth, two ruts, pebbles at its edges
      const y0 = WS.randRange(H * 0.25, H * 0.75), bow = WS.randRange(-160, 160);
      const at = (t) => {
        const v = 1 - t;
        return [v * v * -80 + 2 * v * t * (W * 0.5) + t * t * (W + 80),
          v * v * y0 + 2 * v * t * (y0 + bow) + t * t * (y0 + WS.randRange(-2, 2))];
      };
      for (let i = 0; i <= 80; i++) {
        const [x, y] = at(i / 80);
        c.blob(g, x, y, 62, c.rgb(WS.shade(c.base, 0.68)), 0.16, 0.55, 0.6);
      }
      for (const off of [-16, 16]) {
        g.save();
        g.lineCap = 'round';
        g.strokeStyle = WS.hex(WS.shade(c.base, 0.45)); g.globalAlpha = 0.16; g.lineWidth = 7;
        g.beginPath();
        for (let i = 0; i <= 80; i++) { const [x, y] = at(i / 80); if (i) g.lineTo(x, y + off); else g.moveTo(x, y + off); }
        g.stroke();
        g.strokeStyle = WS.hex(c.light); g.globalAlpha = 0.07; g.lineWidth = 2.4;
        g.beginPath();
        for (let i = 0; i <= 80; i++) { const [x, y] = at(i / 80); if (i) g.lineTo(x, y + off + 3); else g.moveTo(x, y + off + 3); }
        g.stroke();
        g.restore();
      }
      for (let i = 0; i < 160; i++) {
        const [x, y] = at(WS.random());
        const side = WS.random() < 0.5 ? -1 : 1;
        c.stone(g, x + WS.randRange(-10, 10), y + side * WS.randRange(30, 46), WS.randRange(1.6, 3.6));
      }
      // ploughed ground, in patches: furrows running the same way
      for (let i = 0; i < 5; i++) {
        const x = WS.randRange(0, W), y = WS.randRange(0, H), w = WS.randRange(160, 300), h = WS.randRange(100, 180), a = WS.randRange(-0.3, 0.3);
        g.save(); g.translate(x, y); g.rotate(a);
        g.beginPath(); g.ellipse(0, 0, w / 2, h / 2, 0, 0, WS.TAU); g.clip();
        for (let fy = -h / 2; fy < h / 2; fy += 9) {
          const fade = 1 - Math.abs(fy) / (h / 2);
          g.globalAlpha = 0.2 * fade; g.fillStyle = WS.hex(c.dark); g.fillRect(-w / 2, fy, w, 3.4);
          g.globalAlpha = 0.1 * fade; g.fillStyle = WS.hex(c.light); g.fillRect(-w / 2, fy + 4, w, 1.4);
        }
        g.restore();
      }
      // straw blown about
      g.lineCap = 'round';
      for (let i = 0; i < 500; i++) {
        const x = WS.random() * W, y = WS.random() * H, a = WS.random() * WS.PI, l = WS.randRange(3, 7);
        g.globalAlpha = WS.randRange(0.12, 0.28); g.strokeStyle = '#c9a44a'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      g.globalAlpha = 1;
    },

    grave(g, c) {
      // a flagstone path between the stones, broken and sinking
      const y0 = WS.randRange(H * 0.2, H * 0.8), bow = WS.randRange(-200, 200);
      for (let i = 0; i < 52; i++) {
        const t = i / 52, v = 1 - t;
        const x = v * v * -40 + 2 * v * t * (W * 0.5) + t * t * (W + 40) + WS.randRange(-8, 8);
        const y = v * v * y0 + 2 * v * t * (y0 + bow) + t * t * y0 + WS.randRange(-10, 10);
        if (WS.random() < 0.18) continue;              // a stone gone
        const w = WS.randRange(18, 30), h = WS.randRange(12, 19), a = WS.randRange(-0.35, 0.35);
        g.save(); g.translate(x, y); g.rotate(a);
        g.globalAlpha = 0.5; g.fillStyle = '#000';
        g.fillRect(-w / 2 + 1.5, -h / 2 + 2, w, h);
        g.globalAlpha = 0.2; g.fillStyle = WS.hex(WS.mix(c.light, [0.5, 0.52, 0.56], 0.4));
        g.fillRect(-w / 2, -h / 2, w, h);
        g.globalAlpha = 0.14; g.fillStyle = '#ffffff'; g.fillRect(-w / 2, -h / 2, w, 1.2);
        if (WS.random() < 0.4) {
          g.globalAlpha = 0.5; g.strokeStyle = '#05060a'; g.lineWidth = 0.8;
          g.beginPath(); g.moveTo(-w * 0.3, -h / 2); g.lineTo(0, 0); g.lineTo(w * 0.1, h / 2); g.stroke();
        }
        g.restore();
      }
      // sunken plots, in rough rows
      for (let r = 0; r < 4; r++) {
        const ry = WS.randRange(0, H), rx0 = WS.randRange(-100, W * 0.4), n = WS.randInt(4, 8);
        for (let k = 0; k < n; k++) {
          const x = rx0 + k * WS.randRange(60, 90), y = ry + WS.randRange(-10, 10);
          g.save(); g.translate(x, y); g.rotate(WS.randRange(-0.08, 0.08));
          g.globalAlpha = 0.42; g.fillStyle = '#020306';
          g.beginPath(); g.ellipse(0, 0, 13, 26, 0, 0, WS.TAU); g.fill();
          g.globalAlpha = 0.18; g.fillStyle = WS.hex(c.light);
          g.beginPath(); g.ellipse(-2, -3, 10, 20, 0, WS.PI * 1.1, WS.PI * 1.9); g.fill();
          g.restore();
        }
      }
      // dead leaves, grey and brown
      for (let i = 0; i < 900; i++) {
        const x = WS.random() * W, y = WS.random() * H, a = WS.random() * WS.PI;
        g.save(); g.translate(x, y); g.rotate(a);
        g.globalAlpha = WS.randRange(0.1, 0.24); g.fillStyle = WS.random() < 0.5 ? '#4a4030' : '#3a3a40';
        g.beginPath(); g.ellipse(0, 0, 3.4, 1.4, 0, 0, WS.TAU); g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
    },

    crack(g, c) {
      // baked mud: patches of it cracked into plates
      for (let p = 0; p < 9; p++) {
        const cx = WS.randRange(0, W), cy = WS.randRange(0, H), R = WS.randRange(80, 170);
        g.save();
        g.beginPath(); g.ellipse(cx, cy, R, R * 0.7, 0, 0, WS.TAU); g.clip();
        c.blob(g, cx, cy, R, c.rgb(c.light), 0.06, 0.7);
        g.lineCap = 'round'; g.lineJoin = 'round';
        for (let k = 0; k < 16; k++) {
          let x = cx + WS.randRange(-R, R), y = cy + WS.randRange(-R * 0.7, R * 0.7);
          let a = WS.random() * WS.TAU;
          g.beginPath(); g.moveTo(x, y);
          for (let s = 0; s < 6; s++) {
            a += WS.randRange(-0.8, 0.8);
            x += Math.cos(a) * WS.randRange(10, 22); y += Math.sin(a) * WS.randRange(8, 16);
            g.lineTo(x, y);
          }
          g.globalAlpha = 0.36; g.strokeStyle = WS.hex(WS.shade(c.base, 0.4)); g.lineWidth = 2; g.stroke();
          g.globalAlpha = 0.16; g.strokeStyle = WS.hex(c.light); g.lineWidth = 1;
          g.translate(0.8, 1.2); g.stroke(); g.translate(-0.8, -1.2);
        }
        g.restore();
      }
      // wind-rippled sand between them
      for (let p = 0; p < 10; p++) {
        const cx = WS.randRange(0, W), cy = WS.randRange(0, H), w = WS.randRange(120, 240);
        for (let k = 0; k < 7; k++) {
          const y = cy + k * 7 - 21, fade = 1 - Math.abs(k - 3) / 4;
          g.globalAlpha = 0.14 * fade; g.strokeStyle = WS.hex(c.dark); g.lineWidth = 1.4;
          g.beginPath();
          for (let s = 0; s <= 20; s++) {
            const x = cx - w / 2 + (w * s) / 20;
            const yy = y + Math.sin(s * 0.9 + k * 0.6) * 2.4;
            if (s) g.lineTo(x, yy); else g.moveTo(x, yy);
          }
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    },

    ice(g, c) {
      // sheets of ice: a smoother, cooler patch with cracks and a sheen across it
      for (let p = 0; p < 7; p++) {
        const cx = WS.randRange(0, W), cy = WS.randRange(0, H), R = WS.randRange(70, 150);
        g.save();
        const rot = WS.randRange(-0.4, 0.4);
        g.beginPath();
        g.ellipse(cx, cy, R, R * 0.62, rot, 0, WS.TAU);
        g.ellipse(cx + R * 0.5, cy + R * 0.2, R * 0.6, R * 0.4, rot + 0.6, 0, WS.TAU);
        g.ellipse(cx - R * 0.45, cy + R * 0.15, R * 0.55, R * 0.35, rot - 0.5, 0, WS.TAU);
        g.globalAlpha = 0.07; g.fillStyle = '#6a8ab0'; g.fill();
        g.clip();
        g.lineCap = 'round';
        for (let k = 0; k < 7; k++) {
          let x = cx + WS.randRange(-R * 0.6, R * 0.6), y = cy + WS.randRange(-R * 0.3, R * 0.3), a = WS.random() * WS.TAU;
          g.beginPath(); g.moveTo(x, y);
          for (let s = 0; s < 5; s++) { a += WS.randRange(-0.6, 0.6); x += Math.cos(a) * 16; y += Math.sin(a) * 10; g.lineTo(x, y); }
          g.globalAlpha = 0.2; g.strokeStyle = '#c8e4ff'; g.lineWidth = 0.8; g.stroke();
        }
        g.globalAlpha = 0.06; g.strokeStyle = '#ffffff'; g.lineWidth = 6;
        g.beginPath(); g.moveTo(cx - R * 0.5, cy - R * 0.1); g.lineTo(cx + R * 0.2, cy - R * 0.36); g.stroke();
        g.restore();
      }
      // drifts: a soft lit crest with its shadow on the lee side
      for (let i = 0; i < 16; i++) {
        const x = WS.randRange(0, W), y = WS.randRange(0, H), w = WS.randRange(40, 100);
        g.save(); g.translate(x, y); g.rotate(WS.randRange(-0.3, 0.3));
        g.globalAlpha = 0.1; g.fillStyle = '#050810';
        g.beginPath(); g.ellipse(0, w * 0.08, w * 0.5, w * 0.2, 0, 0, WS.TAU); g.fill();
        g.globalAlpha = 0.14; g.fillStyle = '#b8cce6';
        g.beginPath(); g.ellipse(0, 0, w * 0.5, w * 0.18, 0, WS.PI, WS.TAU); g.fill();
        g.restore();
      }
      // frost glints
      for (let i = 0; i < 260; i++) {
        g.globalAlpha = WS.randRange(0.15, 0.4); g.fillStyle = '#dff0ff';
        g.fillRect(WS.random() * W, WS.random() * H, 1.2, 1.2);
      }
      g.globalAlpha = 1;
    },
  };

  R.buildScenery = function (map) {
    const rgb = (c) => `${WS.floor(c[0] * 255)},${WS.floor(c[1] * 255)},${WS.floor(c[2] * 255)}`;
    const base = map.ground, alt = map.groundAlt || map.ground;
    /* Wider than the palette gives, deliberately.
     *
     * `ground` and `groundAlt` sit within about ten luminance units of each
     * other on every map, so a texture built only out of those two is invisible
     * whatever you do with the alpha - measured, local contrast under two. The
     * range has to be opened up, and it is opened DOWNWARD much further than
     * upward: the loot and the survivors are both measured for how far they
     * stand off this ground, so brightening it costs visibility where darkening
     * it does not. */
    const dark = WS.shade(base, 0.40);
    const light = WS.mix(WS.mix(base, alt, 1), [1, 1, 1], 0.12);

    /* Seeded per map and put back afterwards. A battlefield that reshuffled
       its ground every run would make every measurement of it a die roll, and
       the maps would stop having faces. */
    const keep = WS.getSeed();
    if (!GROUND_SEED[map.name]) GROUND_SEED[map.name] = 0;
    let h = 2166136261;
    for (let i = 0; i < map.name.length; i++) {
      h = (h ^ map.name.charCodeAt(i)) >>> 0;
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    WS.setSeed(h);

    if (!groundCanvas) {
      groundCanvas = document.createElement('canvas');
      groundCanvas.width = W; groundCanvas.height = H;
    }
    const g = groundCanvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = WS.hex(base);
    g.fillRect(0, 0, W, H);

    // 1. Terrain. Bigger than any tile, which is the whole point.
    for (let i = 0; i < 16; i++) {
      blob(g, WS.randRange(-120, W + 120), WS.randRange(-90, H + 90),
        WS.randRange(190, 430),
        rgb(WS.random() < 0.5 ? light : dark),
        WS.randRange(0.05, 0.13), WS.randRange(0.5, 0.95));
    }
    // 2. Patches.
    for (let i = 0; i < 130; i++) {
      blob(g, WS.randRange(-60, W + 60), WS.randRange(-50, H + 50),
        WS.randRange(45, 135),
        rgb(WS.random() < 0.5 ? alt : dark),
        WS.randRange(0.05, 0.13), WS.randRange(0.45, 0.9));
    }
    // 3. Grain, everywhere, so no square inch of it is smooth. Hard-cored,
    //    which is what makes it read as ground rather than as haze.
    for (let i = 0; i < 2400; i++) {
      blob(g, WS.random() * W, WS.random() * H, WS.randRange(6, 20),
        rgb(WS.random() < 0.55 ? alt : dark),
        WS.randRange(0.10, 0.26), WS.randRange(0.4, 1), 0.86);
    }
    // 4. Speckle: stones, litter, whatever this ground is made of, at the
    //    scale you only notice once you are standing on it.
    for (let i = 0; i < 2000; i++) {
      blob(g, WS.random() * W, WS.random() * H, WS.randRange(3, 8),
        rgb(WS.random() < 0.5 ? light : WS.shade(base, 0.3)),
        WS.randRange(0.16, 0.38), WS.randRange(0.6, 1), 0.9);
    }
    /* 5. Grit. Two or three pixels across, which is smaller than anything the
     *    player will consciously see and is exactly why it is here: without a
     *    per-pixel octave the ground is smooth between the speckles, and smooth
     *    is what makes a field look like a fill rather than a place. */
    for (let i = 0; i < 4200; i++) {
      blob(g, WS.random() * W, WS.random() * H, WS.randRange(1.2, 3.2),
        rgb(WS.random() < 0.5 ? light : dark),
        WS.randRange(0.16, 0.38), 1, 0.92);
    }
    /* 5b. PATHS. Everything above is noise, and noise at every scale is still
     *     noise: the field had no structure larger than a blotch and nowhere
     *     for the eye to go. Two or three worn tracks wandering across it give
     *     it landmarks, a sense that somebody came this way before, and a
     *     composition - and they are drawn DARKER than the ground rather than
     *     lighter, because the survivors clear the brightest map by exactly
     *     their margin and there is no headroom to spend on brightening
     *     anything. Bare earth is darker than grass anyway. */
    const worn = WS.shade(base, 0.62);
    for (let t = 0; t < 3; t++) {
      const y0 = WS.randRange(-40, H + 40);
      const y1 = WS.randRange(-40, H + 40);
      const bow = WS.randRange(-260, 260);
      const wide = WS.randRange(42, 92);
      for (let i = 0; i <= 60; i++) {
        const u2 = i / 60, v = 1 - u2;
        const px = v * v * -60 + 2 * v * u2 * (W * 0.5 + bow) + u2 * u2 * (W + 60);
        const py = v * v * y0 + 2 * v * u2 * ((y0 + y1) * 0.5 + bow * 0.5) + u2 * u2 * y1;
        const wob = 1 + 0.35 * WS.sin(u2 * 11 + t);
        blob(g, px, py, wide * wob, rgb(worn), 0.085, WS.randRange(0.5, 0.8), 0.55);
      }
      // a lit lip along one side, so the track reads as WORN INTO the ground
      // rather than as a stain laid on top of it
      for (let i = 0; i <= 50; i++) {
        const u2 = i / 50, v = 1 - u2;
        const px = v * v * -60 + 2 * v * u2 * (W * 0.5 + bow) + u2 * u2 * (W + 60);
        const py = v * v * y0 + 2 * v * u2 * ((y0 + y1) * 0.5 + bow * 0.5) + u2 * u2 * y1;
        blob(g, px, py - wide * 0.52, wide * 0.42, rgb(light), 0.035,
          WS.randRange(0.4, 0.7), 0.5);
      }
      // and the scuffed edge where the grass gives up
      for (let i = 0; i < 90; i++) {
        const u2 = WS.random(), v = 1 - u2;
        const px = v * v * -60 + 2 * v * u2 * (W * 0.5 + bow) + u2 * u2 * (W + 60);
        const py = v * v * y0 + 2 * v * u2 * ((y0 + y1) * 0.5 + bow * 0.5) + u2 * u2 * y1;
        const off = (WS.random() < 0.5 ? -1 : 1) * WS.randRange(wide * 0.5, wide * 1.1);
        blob(g, px + WS.randRange(-14, 14), py + off * 0.7, WS.randRange(4, 11),
          rgb(WS.random() < 0.5 ? dark : alt), WS.randRange(0.12, 0.3),
          WS.randRange(0.5, 1), 0.88);
      }
    }
    /* 5c. TUFTS. Short strokes of the lighter ground colour, in clumps. They
     *     are the only thing on the field with a DIRECTION - everything else
     *     is a round blob - and that is most of why they read as growing out
     *     of it rather than sitting on it. */
    for (let c = 0; c < 44; c++) {
      const cxp = WS.randRange(-30, W + 30), cyp = WS.randRange(-30, H + 30);
      const n = WS.randInt(5, 14);
      g.save();
      g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const tx = cxp + WS.randRange(-46, 46), ty = cyp + WS.randRange(-30, 30);
        const len = WS.randRange(5, 13), lean = WS.randRange(-4, 4);
        g.globalAlpha = WS.randRange(0.08, 0.2);
        g.strokeStyle = WS.hex(dark);
        g.lineWidth = WS.randRange(1, 2.1);
        g.beginPath();
        g.moveTo(tx, ty);
        g.quadraticCurveTo(tx + lean * 0.5, ty - len * 0.6, tx + lean, ty - len);
        g.stroke();
        g.globalAlpha *= 0.7;
        g.strokeStyle = WS.hex(light);
        g.beginPath();
        g.moveTo(tx + 1, ty);
        g.quadraticCurveTo(tx + 1 + lean * 0.5, ty - len * 0.6, tx + 1 + lean, ty - len);
        g.stroke();
      }
      g.restore();
    }

    // 5d. What this ground is made of (TERRAIN, above).
    const paint = TERRAIN[map.terrain];
    if (paint) {
      /* On its own seed, and the stream put back after: the props below are
         placed from the same generator, and a terrain that drew from it
         would move every tree, stone and bone on the map. */
      const resume = WS.getSeed();
      WS.setSeed((h ^ 0x9e3779b9) >>> 0);
      g.save();
      paint(g, { blob, rgb, base, alt, dark, light,
        stone(gc, x, y, r) {
          gc.globalAlpha = 0.45; gc.fillStyle = '#000';
          gc.beginPath(); gc.ellipse(x + r * 0.3, y + r * 0.45, r, r * 0.6, 0, 0, WS.TAU); gc.fill();
          gc.globalAlpha = 0.5; gc.fillStyle = WS.hex(WS.mix(light, [0.55, 0.55, 0.55], 0.3));
          gc.beginPath(); gc.ellipse(x, y, r, r * 0.7, 0, 0, WS.TAU); gc.fill();
          gc.globalAlpha = 1;
        } });
      g.restore();
      WS.setSeed(resume);
    }

    // 6. A little more light at the top than the bottom, so the field has a
    //    direction to it rather than being one even wash.
    const lift = g.createLinearGradient(0, 0, 0, H);
    lift.addColorStop(0, 'rgba(255,255,255,.035)');
    lift.addColorStop(0.55, 'rgba(255,255,255,0)');
    lift.addColorStop(1, 'rgba(0,0,0,.10)');
    g.fillStyle = lift;
    g.fillRect(0, 0, W, H);

    this.ground = groundCanvas;
    this.groundTint = map.ground;

    /* Props CLUMP. Scattered uniformly they describe a random number
       generator; gathered into thickets with clear ground between them they
       describe somewhere, and they give the field landmarks to steer by. */
    this.props.length = 0;
    if (map.props && map.props.length) {
      const groves = [];
      for (let i = 0; i < 10; i++) {
        groves.push({ x: WS.randRange(-40, W + 40), y: WS.randRange(-30, H + 30),
          r: WS.randRange(90, 210) });
      }
      for (let i = 0; i < 52; i++) {
        const kind = map.props[WS.randInt(0, map.props.length - 1)];
        let x, y;
        if (i % 5 === 0) {                   // a few strays, or it reads as clumps of seven
          x = WS.randRange(-60, W + 60); y = WS.randRange(-40, H + 40);
        } else {
          const gr = groves[WS.randInt(0, groves.length - 1)];
          const a = WS.random() * WS.TAU, d = WS.random() * gr.r;
          x = gr.x + WS.cos(a) * d; y = gr.y + WS.sin(a) * d * 0.7;
        }
        /* A bone lying in the grass does not cast what a tree does. */
        const FLAT = { bone: 0.1, skull: 0.16, stump: 0.18, flower: 0.12, wheat: 0.1 };
        this.props.push({ kind, x, y,
          shadow: FLAT[kind] === undefined ? 0.32 : FLAT[kind],
          phase: WS.random() * WS.TAU,
          size: WS.randRange(46, 96), alpha: WS.randRange(0.35, 0.7) });
      }
      this.props.sort((a, b) => a.y - b.y);
    }
    WS.setSeed(keep);
  };

  /* --------------------------------------------------------------- draw -- */
  function shadow(ctx, x, y, r, alpha) {
    ctx.globalAlpha = alpha === undefined ? 0.32 : alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.4, 0, 0, WS.TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* A bar over a creature that has taken a scratch is noise; a bar over one
   * that is nearly dead is information.
   *
   * Every damaged creature got one, from the first point of damage, at full
   * strength. Measured over eight minutes of a real run that is 25 red dashes
   * on screen at any moment and 85 at the peak - and the game aims itself, so
   * knowing the exact health of one creature in a crowd of eighty changes
   * nothing a player can act on. What is worth reading is which ones are
   * about to break.
   *
   * So fodder keeps its bar only once it is under FODDER_BAR_AT, and fades it
   * in across the last of that rather than popping it on. Champions are
   * unchanged: an elite or a boss is a fight, and a fight you watch the whole
   * length of. */
  const FODDER_BAR_AT = 0.6;

  function healthBar(ctx, e) {
    if (e.health >= e.maxHealth) return;
    const pct = WS.clamp(e.health / e.maxHealth, 0, 1);
    const champion = e.boss || e.elite || e.part;
    let alpha = 1;
    if (!champion) {
      if (pct >= FODDER_BAR_AT) return;
      alpha = WS.clamp((FODDER_BAR_AT - pct) / 0.16, 0, 1);
    }
    const w = e.radius * 2, h = champion ? 3 : 2;
    const x = e.x - w / 2, y = e.y - e.radius * 1.9;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = e.boss ? '#e2483d' : e.elite ? '#f5c56b' : '#c6483d';
    ctx.fillRect(x, y, w * pct, h);
    ctx.restore();
  }

  R.draw = function (time) {
    const ctx = this.ctx;
    const game = WS.Game;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    // Letterbox surround: the Arclight void.
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    ctx.save();
    ctx.translate(this.offsetX + WS.FX.shakeX * this.scale, this.offsetY + WS.FX.shakeY * this.scale);
    ctx.scale(this.scale, this.scale);
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

    /* The prologue owns the frame while it runs. It rides this loop rather
       than starting its own, so it inherits the fault net in main.js - a throw
       in a cinematic a new player is watching before their first run costs one
       frame instead of the session. */
    if (WS.Prologue && WS.Prologue.active) {
      WS.Prologue.render(ctx, time);
      ctx.restore();
      return;
    }
    // And the other end of it, for the same reason and on the same terms.
    if (WS.Victory && WS.Victory.active) {
      WS.Victory.render(ctx, time);
      ctx.restore();
      return;
    }

    /* ---- ground ---------------------------------------------------------- */
    if (this.ground) {
      // One image the size of the world. No pattern, no tile, no seam.
      ctx.drawImage(this.ground, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(0, 0, W, H);
    }

    if (!game.player) {
      this.drawMenuScene(ctx, time);
      ctx.restore();
      // A lighter vignette out of a run: the menu scrim is already doing most
      // of this work, and doubling them buries the scene it is framing.
      this.drawVignette(ctx, 0.34);
      return;
    }
    const player = game.player;
    const run = game.run;

    /* ---- props ----------------------------------------------------------- */
    /* EVERY PROP CASTS. Nothing on the field did: the survivor has a shadow,
       the creatures have one, the loot has one, and the rocks and trees they
       are all standing between had nothing under them at all - so the field
       read as a painted backdrop with cut-outs laid on it. A contact shadow
       is the cheapest thing in this renderer and it is the difference between
       a prop that is ON the ground and one that is IN FRONT of it. */
    for (const p of this.props) {
      const sh = p.shadow === undefined ? 0.3 : p.shadow;
      if (sh > 0) {
        ctx.save();
        ctx.globalAlpha = p.alpha * sh;
        const r = p.size * 0.28;
        const grd = ctx.createRadialGradient(p.x, p.y + p.size * 0.22, 0,
          p.x, p.y + p.size * 0.22, r);
        grd.addColorStop(0, 'rgba(0,0,0,.85)');
        grd.addColorStop(0.55, 'rgba(0,0,0,.45)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(p.x + p.size * 0.05, p.y + p.size * 0.22, r, r * 0.42, 0, 0, WS.TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = p.alpha;
      const sprite = WS.Sprites.prop(p.kind, p.size);
      /* WIND. Nothing on the field moved except the survivor and the things
         trying to kill them - the world itself was a still photograph, which
         is what made it read as a backdrop. Anything that grows leans, on its
         own phase so the field does not breathe in unison, and it pivots at
         the FOOT because that is where a stem is anchored.

         Brightness is untouched by design: the ground's luminance is what the
         survivors and the loot are measured against, and two harnesses in
         this suite have already had to be de-flaked. A rotation moves pixels
         without changing how many of them are lit. */
      const sway = SWAY[p.kind];
      if (sway) {
        const foot = p.y + p.size * 0.22;
        ctx.save();
        ctx.translate(p.x, foot);
        ctx.rotate(WS.sin(time * 0.9 + p.phase) * sway
          + WS.sin(time * 2.3 + p.phase * 1.7) * sway * 0.35);
        ctx.drawImage(sprite, -p.size / 2, -p.size * 0.72, p.size, p.size);
        ctx.restore();
      } else {
        ctx.drawImage(sprite, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;

    /* ---- ground effects (zones, auras, arena hazards) -------------------- */
    this.drawZones(ctx, time);
    this.drawHazards(ctx, time);
    this.drawTelegraphs(ctx, time);
    this.drawPlayerMark(ctx, player, time);
    this.drawAuras(ctx, player, time);
    if (WS.Arena.active) this.drawArena(ctx, time);
    if (WS.Finale.stage !== 'idle') WS.FinaleArt.drawGround(ctx, time);

    this.drawCorpses(ctx);

    /* ---- gems and pickups ------------------------------------------------ */
    this.drawGems(ctx, time);
    this.drawPickups(ctx, time);

    /* ---- entities, y-sorted --------------------------------------------- */
    const draws = [];
    for (let i = 0; i < WS.Enemy.pool.count; i++) draws.push(WS.Enemy.pool.active[i]);
    for (const f of WS.Familiar.list) draws.push(f);
    draws.push(player);
    draws.sort((a, b) => a.y - b.y);

    /* Every creature's shadow in one path and one fill, before any of them
       stands on it. Drawn one by one inside drawEnemy they cost a path, a fill
       and two alpha changes each - three hundred of them in a full horde -
       and a shadow is on the ground, under everything, so it never belonged
       in the y-sorted pass anyway. */
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    for (let i = 0; i < WS.Enemy.pool.count; i++) {
      const e = WS.Enemy.pool.active[i];
      if (e.hidden || (e.template.machine && WS.FinaleArt)) continue;
      const sy = e.y + e.radius * 0.55, sr = e.radius * 0.85;
      ctx.moveTo(e.x + sr, sy);
      ctx.ellipse(e.x, sy, sr, sr * 0.4, 0, 0, WS.TAU);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    this._shadowsDone = true;
    for (const e of draws) {
      if (e === player) this.drawPlayer(ctx, player, time);
      else if (e.spec) this.drawFamiliar(ctx, e, time);
      else this.drawEnemy(ctx, e, time);
    }
    this._shadowsDone = false;

    /* ---- air: bolts, orbits, beams -------------------------------------- */
    this.drawOrbits(ctx, player);
    this.drawBolts(ctx);
    this.drawBeams(ctx);

    if (WS.Finale.stage !== 'idle') WS.FinaleArt.drawAir(ctx, time);

    /* ---- effects --------------------------------------------------------- */
    this.drawFlashes(ctx);
    this.drawParticles(ctx);

    /* The survivor, asserted again over his own light.
     
       Everything above this composites with 'lighter', which does not paint
       over him - it adds to him, and adding to something already bright is
       how a figure turns into white. Measured as the share of his silhouette
       pushed past near-white, a bare survivor is at 0%, three weapons at rank
       8 put him at 20%, and six evolved ones at 34%: a third of him gone,
       with every pixel of him technically still there. That is the endgame
       you cannot find yourself in.
     
       Scaling the effects down would cost the spectacle that is the reward
       for getting there. Re-stamping him costs one more draw of one sprite
       and nothing else: he is opaque, so wherever he is, he is. His own
       bolts now pass behind him rather than over him, which is the right way
       round anyway - they come from him. */
    this.drawPlayer(ctx, player, time);

    this.drawTexts(ctx);

    ctx.restore();

    this.drawVignette(ctx);
    if (WS.FX.flashScreen) {
      const f = WS.FX.flashScreen;
      ctx.globalAlpha = WS.clamp(f.life / f.maxLife, 0, 1);
      ctx.fillStyle = f.colour;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.globalAlpha = 1;
    }
    if (game.player) {
      const hpPct = WS.clamp(game.player.health / game.player.maxHealth, 0, 1);
      const hurt = WS.FX.hurtPulse;
      const peril = hpPct < 0.3 ? (0.3 - hpPct) / 0.3 : 0;
      const rim = WS.max(hurt * 0.55, peril * (0.24 + 0.1 * WS.sin(time * 4)));
      if (rim > 0.01) {
        const g2 = ctx.createRadialGradient(
          this.viewW / 2, this.viewH / 2, WS.min(this.viewW, this.viewH) * 0.3,
          this.viewW / 2, this.viewH / 2, WS.max(this.viewW, this.viewH) * 0.62);
        g2.addColorStop(0, 'rgba(226,72,61,0)');
        g2.addColorStop(1, `rgba(226,72,61,${rim.toFixed(3)})`);
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, this.viewW, this.viewH);
      }
    }

    if (WS.Arena.active && WS.Arena.darkness > 0) {
      // Total Darkness closes in around the survivor.
      const cx = this.offsetX + player.x * this.scale;
      const cy = this.offsetY + player.y * this.scale;
      const r = (330 - 140 * WS.Arena.darkness) * this.scale;
      const grd = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, `rgba(0,0,0,${0.82 * WS.Arena.darkness})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
    if (WS.Finale.stage !== 'idle') WS.FinaleArt.drawOverlay(ctx, time, this);
    this.drawBanner(ctx, run);
  };

  /** The bodies: each squashes into the ground and fades over its life. */
  R.drawCorpses = function (ctx) {
    const pool = WS.FX.corpses;
    for (let i = 0; i < pool.count; i++) {
      const c = pool.active[i];
      const t = 1 - WS.clamp(c.life / c.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.translate(c.x, c.y + c.size * 0.18 * t);
      ctx.scale(c.facing > 0 ? -(1 + t * 0.3) : (1 + t * 0.3), 1 - t * 0.55);
      const sprite = WS.Sprites.creature(c.art, c.tint, c.size, c.kit);
      ctx.drawImage(sprite, -c.size / 2, -c.size * 0.62, c.size, c.size);
      ctx.restore();
      if (c.boss) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - t) * 0.5;
        ctx.fillStyle = WS.rgb(WS.CONST.COLORS.boss, 1);
        ctx.beginPath();
        ctx.ellipse(c.x, c.y + c.size * 0.2, c.size * (0.4 + t), c.size * 0.16, 0, 0, WS.TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  };

  /* ------------------------------------------------------------ entities - */
  /** The tint a chilled creature takes. A constant, so it is not a fresh
   *  array on every frame of every frozen enemy on the field. */
  const CHILLED = [0.55, 0.8, 1.0];

  R.drawEnemy = function (ctx, e, time) {
    const t = e.template;
    if (e.hidden) return;
    /* The finale's machines have moving parts - a drill that turns, sails
       that fill, a cockpit that opens - so they are drawn live rather than
       stamped from a cached sprite. */
    if (t.machine && WS.FinaleArt) {
      WS.FinaleArt.drawUnit(ctx, e, time);
      healthBar(ctx, e);
      return;
    }
    const size = e.spriteSize;
    const bob = WS.sin(e.bob) * (e.boss ? 3 : 2);
    if (!this._shadowsDone) shadow(ctx, e.x, e.y + e.radius * 0.55, e.radius * 0.85);

    if (e.elite || e.boss) {
      // Champions get an arc-lit ground ring so they read out of a crowd.
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.2 * WS.sin(time * 3);
      ctx.strokeStyle = e.boss ? '#e05ad8' : '#f5c56b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.radius * 0.55, e.radius * 1.25, e.radius * 0.5, 0, 0, WS.TAU);
      ctx.stroke();
      ctx.restore();
    }

    /* Held on the creature, for the same reason as the gem above. The only
       things that can change its sprite are the size and whether it is
       chilled; the art and the tint come from a template that never moves. */
    const chill = e.chilled ? 1 : 0;
    if (e._sprChill !== chill || e._sprSize !== size) {
      e._spr = WS.Sprites.creature(t.art, e.chilled ? CHILLED : t.tint, size, t.bossKit);
      e._sprChill = chill; e._sprSize = size;
    }
    const sprite = e._spr;
    ctx.save();
    if (e.fade !== undefined && e.fade < 1) ctx.globalAlpha = e.fade;
    ctx.translate(e.x, e.y + bob);
    // Bracing for a charge: the body compresses, then springs.
    if (e.windup > 0) {
      const k = 1 - e.windup / (e.windupMax || WS.Config.chargeWindup);
      ctx.scale(1 + k * 0.14, 1 - k * 0.12);
    }
    /* The bestiary is drawn looking LEFT - every animal in profile has its
       head on the left of its tile - and `facing` is +1 when the survivor is
       to the right. This flipped on -1, so every wolf, boar, cat, raptor and
       mongrel ran at the survivor tail first, looking away; measured with one
       either side, both were facing out. Mirror when the prey is right. */
    if (e.facing > 0) ctx.scale(-1, 1);
    ctx.drawImage(sprite, -size / 2, -size * 0.62, size, size);
    /* Struck: the creature's own shape, filled and laid over itself - the
       tint follows the silhouette rather than a disc the size of the
       hitbox, which on a pack read as a row of coins. */
    if (e.flash > 0) {
      ctx.globalAlpha = WS.clamp(e.flash / 0.09, 0, 1) * 0.8 * (e.fade !== undefined && e.fade < 1 ? e.fade : 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(WS.SpellArt.flashOf(sprite, e.flashCrit ? '#ffd45c' : '#ff6b5c'), -size / 2, -size * 0.62, size, size);
    }
    ctx.restore();

    /* THE ONES THAT SHOOT.
     *
     * Every caster in the game is drawn from the same art as its harmless
     * melee twin and separated only by tint. Measured as the mean difference
     * between their silhouettes on a common grid, gilkin and Gilkin
     * Tidecaller came out at 0.0000 - the same shape, exactly - and so did
     * skeleton and Skeletal Frostweaver at 0.0059. The worst pair was
     * Kerchief Footpad and Kerchief Pillager: 0.0034 apart in shape and only
     * 17.6 apart in colour, which is to say indistinguishable. The creature
     * that walks at you and the creature that shoots you from 280 pixels
     * looked the same, and the one you have to react to is the second.
     *
     * So a caster carries a focus above its head. It is a SHAPE, with a dark
     * rim, because the arena pass already settled that a thing the player
     * must react to cannot be told by colour alone - though the colour is
     * free to say which school, as it does for the bolt when it comes.
     *
     * And it charges. The cooldown is already ticking in e.rangedTimer, so
     * the mark can grow and brighten toward the shot and flare on the frame
     * before it - which turns "that one is a caster" into "that one is about
     * to fire", for nothing but a value that was already there. */
    if (t.ranged && e.rangedTimer !== null && e.rangedTimer !== undefined) {
      const cd = t.ranged.cooldown || 3;
      const k = WS.clamp(1 - e.rangedTimer / cd, 0, 1);
      const col = WS.CONST.COLORS[t.ranged.school] || WS.CONST.COLORS.arcane;
      const fx = e.x;
      const fy = e.y - e.radius * 1.62 + WS.sin(time * 2.2 + e.bob) * 1.5;
      const r = e.radius * (0.22 + 0.09 * k);
      const kite = (cx, cy, w, h) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy - h);
        ctx.lineTo(cx + w, cy);
        ctx.lineTo(cx, cy + h);
        ctx.lineTo(cx - w, cy);
        ctx.closePath();
      };
      ctx.save();
      ctx.fillStyle = 'rgba(3,5,9,.86)';
      kite(fx, fy, r * 1.55, r * 2.15); ctx.fill();
      ctx.fillStyle = WS.rgb(col, 0.55 + 0.45 * k);
      kite(fx, fy, r, r * 1.5); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${(0.25 + 0.55 * k).toFixed(2)})`;
      kite(fx, fy, r * 0.4, r * 0.62); ctx.fill();
      // the last fifth of the cooldown: a ring, so the shot is seen coming
      if (k > 0.8) {
        ctx.globalAlpha = (k - 0.8) / 0.2;
        ctx.strokeStyle = WS.rgb(col, 1);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(fx, fy, r * 3.0, 0, WS.TAU); ctx.stroke();
      }
      ctx.restore();
    }

    if (e.finale && WS.FinaleArt) WS.FinaleArt.adorn(ctx, e, time);
    if (WS.Save.settings.showHealthBars || e.elite || e.boss || e.part) healthBar(ctx, e);

    if (e.elite && !e.boss) {
      ctx.font = `600 10px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f5c56b';
      ctx.fillText(t.name, e.x, e.y - e.radius * 2.1);
    }
  };

  R.drawFamiliar = function (ctx, fam, time) {
    const size = 46;
    const lift = fam.pounce > 0 ? -10 * (fam.pounce / 0.18) : WS.sin(fam.bob * 3) * 2;
    shadow(ctx, fam.x, fam.y + 12, 15, 0.25);
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.translate(fam.x, fam.y + lift);
    if (fam.facing < 0) ctx.scale(-1, 1);
    const icon = WS.Icons.glyph(fam.spec.art, fam.spec.tint, size);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(icon, -size / 2, -size * 0.7, size, size);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  };

  R.drawPlayer = function (ctx, p, time) {
    const size = 78;
    const demon = p.metaTimer > 0;
    /* Standing still, the survivor breathes; moving, they walk.
     *
     * The bob stays for the idle - a figure that is completely motionless
     * while a hundred things move around it reads as paused - but once they
     * are moving the vertical is the stride's job, and adding a second sine on
     * top of it fought the one baked into the frames. */
    /* Two poses that are not the walk: a flinch, and going down. Both are
       played once and both override the stride entirely, because a survivor
       on one knee is not mid-step. */
    const dying = WS.Game.state === 'dying';
    const cfg = WS.Config;
    let pose = null;
    if (dying) {
      const n = WS.Hero.poseFrames.down;
      pose = { kind: 'down',
        frame: WS.min(n - 1, WS.floor(WS.Game.deathProgress() * n)) };
    } else if (p.hurtTimer > 0) {
      const n = WS.Hero.poseFrames.hurt;
      const k = 1 - p.hurtTimer / WS.max(0.01, cfg.hurtBeat);
      pose = { kind: 'hurt', frame: WS.clamp(WS.floor(k * n), 0, n - 1) };
    }
    const bob = (p.moving || pose) ? 0 : WS.sin(p.walkCycle) * 1.2;
    // The cycle advances at 11/s while moving, so one stride is a shade under
    // three steps a second. Frames are picked from that, not from wall time,
    // so the walk slows and speeds with whatever the survivor's speed is.
    const frame = (p.moving && !pose)
      ? WS.floor(((p.walkCycle / WS.TAU) % 1 + 1) % 1 * WS.Hero.frames) : undefined;
    shadow(ctx, p.x, p.y + p.radius * 0.7, p.radius * 0.9);
    ctx.save();
    /* The ring is the light they are carrying, so it goes out with them -
       which is the whole of the lore in one fade. */
    const ember = dying ? WS.max(0, 1 - WS.Game.deathProgress() * 1.35) : 1;
    const beat = (0.42 + 0.14 * WS.sin(time * 2.4)) * ember;
    ctx.globalAlpha = beat;
    ctx.strokeStyle = '#f5c56b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.radius * 0.7, p.radius * 1.2, p.radius * 0.48, 0, 0, WS.TAU);
    ctx.stroke();
    // A second, wider ring only while the field is crowded enough to lose them.
    if (WS.Enemy.pool.count > 60 && !this.lite) {
      ctx.globalAlpha = beat * 0.4;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + p.radius * 0.7, p.radius * 1.9, p.radius * 0.76, 0, 0, WS.TAU);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    /* The invulnerability flicker is suppressed while a pose is playing: it
       was the ONLY sign of being hit, and now that there is a flinch to watch,
       strobing the figure through it just hides the thing worth seeing. */
    if (p.invulnerable > 0 && !pose) {
      ctx.globalAlpha = (WS.floor(p.invulnerable * 12) % 2 === 0) ? 0.45 : 0.95;
    }
    ctx.translate(p.x, p.y + bob);
    /* The whirl turns him about his own spine, not his navel. It used to
       rotate the whole figure in the plane of the screen at two turns a
       second, so for the length of every Axe Gyre the survivor cartwheeled -
       sideways, then upside down, then sideways again. A pirouette is the
       figure narrowing to its edge and opening again the other way round;
       never thinner than a fifth of itself, so it never blinks out. */
    if (p.spinTimer > 0) {
      const turn = WS.cos(time * 14);
      ctx.scale(turn < 0 ? WS.min(turn, -0.2) : WS.max(turn, 0.2), 1);
    } else if (p.facing < 0) ctx.scale(-1, 1);
    /* And a lean. Baked frames cannot know which way the player is going, so
     * the one part of the walk that belongs out here is the tilt into the
     * direction of travel - about three degrees, which is enough to read as
     * intent and not enough to look like falling over. It eases rather than
     * snaps, so a change of direction is a turn and not a flick. */
    if (p.moving && !pose) {
      p.lean = (p.lean || 0) + ((p.facing < 0 ? -0.055 : 0.055) - (p.lean || 0)) * 0.18;
    } else {
      p.lean = (p.lean || 0) * 0.86;
    }
    if (p.lean) ctx.rotate(p.facing < 0 ? -p.lean : p.lean);
    const sprite = WS.Sprites.hero(p.characterId, p.character.color, size, demon, frame, pose,
      WS.Player.rank(p));
    ctx.drawImage(sprite, -size / 2, -size * 0.66, size, size);
    ctx.restore();
    ctx.globalAlpha = 1;

    if (demon) {
      // The fel corona is the only sign the empowerment is still running.
      const pulse = 58 + 7 * WS.sin(time * 9);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grd = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, pulse);
      grd.addColorStop(0, 'rgba(140,242,74,.35)');
      grd.addColorStop(1, 'rgba(140,242,74,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(p.x, p.y, pulse, 0, WS.TAU); ctx.fill();
      ctx.restore();
    }
    if (p.blockReady) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.2 * WS.sin(time * 4);
      ctx.strokeStyle = '#ffe6ae';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 9, 0, WS.TAU); ctx.stroke();
      ctx.restore();
    }
  };

  /* ------------------------------------------------------------- effects - */
  /** The survivor's standing mark: a lit disc on the ground that the horde
   *  draws over but never hides, plus crosshair ticks when it gets busy. */
  R.drawPlayerMark = function (ctx, p, time) {
    const crowd = WS.Enemy.pool.count;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    /* THE EMBER, ON THE GROUND.
     *
     * The game's whole premise is that the survivor is carrying a light -
     * "what holds it back is ember", "while you carry it, you burn" - and the
     * field did not show it. There was a warm pool here already and it was
     * thirty-eight pixels across: a footprint, not a light. Measured in eight
     * patches across the field, the mean luminance of the ground varied by a
     * standard deviation of 2.9 to 5.1 out of 255, so a battlefield was lit
     * as evenly at its far corner as under the person holding the only fire
     * on it. Nothing drew the eye anywhere, and on the dark maps the field
     * read as uniformly dim rather than as dark with a light in it.
     *
     * So the ember lights the ground it stands on, over three hundred pixels
     * and change. It is drawn here, in the ground-effects pass, so it lights
     * the FIELD and not the creatures standing on it - a wash over the actors
     * would flatten exactly the silhouettes the rest of this file works to
     * keep readable. It breathes, slightly, because a fire does.
     *
     * Deliberately weak at the centre. This has to read as the ground being
     * lit, not as a lamp bolted to the survivor, and every measurement of
     * what stands off this ground - the loot callouts, the creature
     * contrast - is taken against it. */
    const R = p.radius * (this.lite ? 15 : 19);
    const breath = 0.94 + 0.06 * WS.sin(time * 1.25);
    const lum = ctx.createRadialGradient(p.x, p.y, p.radius * 0.5, p.x, p.y, R);
    /* Warmer than the colour it looks like it should be.
     *
     * An additive light can only ADD, so amber laid over the blue-black of
     * Mourneholt lifted the ground to [37,36,39] - dead neutral grey. It read
     * as a hole cut in the dark rather than as firelight, because a fire that
     * lights blue ground has to out-run the blue to look like a fire at all.
     * Measured again with the blue taken almost out of the light itself, the
     * same ground under it comes up warm. */
    lum.addColorStop(0, `rgba(255,178,84,${(0.135 * breath).toFixed(3)})`);
    lum.addColorStop(0.42, `rgba(248,150,64,${(0.062 * breath).toFixed(3)})`);
    lum.addColorStop(1, 'rgba(236,126,50,0)');
    ctx.fillStyle = lum;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, R, R * 0.8, 0, 0, WS.TAU);
    ctx.fill();

    const r = p.radius * 2.4;
    const grd = ctx.createRadialGradient(p.x, p.y + p.radius * 0.5, 0, p.x, p.y + p.radius * 0.5, r);
    grd.addColorStop(0, 'rgba(245,197,107,.16)');
    grd.addColorStop(1, 'rgba(245,197,107,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.radius * 0.5, r, r * 0.5, 0, 0, WS.TAU);
    ctx.fill();

    if (crowd > 60 && !this.lite) {
      ctx.globalAlpha = 0.3 + 0.12 * WS.sin(time * 2.4);
      ctx.strokeStyle = '#f5c56b';
      ctx.lineWidth = 1;
      const R = p.radius * 3.2;
      for (let i = 0; i < 4; i++) {
        const a = i * WS.PI / 2 + WS.PI / 4;
        ctx.beginPath();
        ctx.moveTo(p.x + WS.cos(a) * R, p.y + WS.sin(a) * R * 0.5);
        ctx.lineTo(p.x + WS.cos(a) * (R + 9), p.y + WS.sin(a) * (R + 9) * 0.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  R.drawAuras = function (ctx, p, time) {
    ctx.save();
    if (p.chillRank > 0) {
      const r = (WS.Config.chillRangeBase + WS.Config.chillRangePerRank * p.chillRank) * p.areaMultiplier;
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = '#59bfff';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, WS.TAU); ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, WS.TAU); ctx.stroke();
    }
    if (p.retRank > 0) {
      const r = (WS.Config.retributionRange + WS.Config.retributionRangePerRank * p.retRank) * p.areaMultiplier;
      ctx.globalAlpha = 0.10 + 0.04 * WS.sin(time * 5);
      ctx.fillStyle = '#ffdf7a';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, WS.TAU); ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#ffe6ae'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, WS.TAU); ctx.stroke();
    }
    // Pickup radius: a faint hairline so the magnet stat is legible.
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#f5c56b'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.pickupRadius, 0, WS.TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  /** Boss tells, painted on the ground: a charge lane that fills as the wind-up
   *  runs out, and a swelling ring before a volley. Nothing should hit you
   *  without first saying so. */
  /** Ground that will hurt, or already does.
   *
   *  Two readings, because they are two different facts. While it FUSES it is
   *  an outline that grows - nothing has happened yet and you have time. Once
   *  it ARMS it fills in, gets a hot rim, and burns down. Never the same
   *  drawing at two opacities: a player has to be able to tell "not yet" from
   *  "now" at a glance, in a field of two hundred enemies, without counting
   *  frames. */
  R.drawHazards = function (ctx, time) {
    const pool = WS.Hazard.pool;
    if (!pool) return;
    for (let i = 0; i < pool.count; i++) {
      const h = pool.active[i];
      const c = h.tint;
      const rgb = `${WS.floor(c[0] * 255)},${WS.floor(c[1] * 255)},${WS.floor(c[2] * 255)}`;
      ctx.save();
      if (h.fuse > 0) {
        const k = 1 - h.fuse / (h.maxFuse || 1);       // 0 -> 1 as it arms
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius * (0.45 + 0.55 * k), 0, WS.TAU);
        ctx.fillStyle = `rgba(${rgb},${(0.05 + 0.09 * k).toFixed(3)})`;
        ctx.fill();
        ctx.setLineDash([7, 6]);
        ctx.lineDashOffset = -time * 26;
        ctx.strokeStyle = `rgba(${rgb},${(0.45 + 0.4 * k).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        const fade = WS.clamp(h.life / (h.maxLife || 1), 0, 1);
        const pulse = 0.86 + 0.14 * WS.sin(time * 7 + h.seed);
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius * pulse, 0, WS.TAU);
        ctx.fillStyle = `rgba(${rgb},${(0.30 * fade).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${rgb},${(0.85 * fade).toFixed(3)})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        if (!R.lite) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.beginPath();
          ctx.arc(h.x, h.y, h.radius * 0.55 * pulse, 0, WS.TAU);
          ctx.fillStyle = `rgba(${rgb},${(0.16 * fade).toFixed(3)})`;
          ctx.fill();
        }
      }
      ctx.restore();
    }
  };

  R.drawTelegraphs = function (ctx, time) {
    for (let i = 0; i < WS.Enemy.pool.count; i++) {
      const e = WS.Enemy.pool.active[i];
      const t = e.telegraph;
      if (!t) continue;
      const k = 1 - WS.clamp(t.life / t.maxLife, 0, 1);   // 0 -> 1 as it lands
      ctx.save();
      if (t.kind === 'lane') {
        /* Two readings of the same lane. While it is being aimed it fills
         * toward its end, and it swings as the boss tracks you - that is the
         * window to move. Once it fires it stops moving and stops filling: it
         * goes solid and burns down, because at that point it is no longer a
         * warning, it is where the boss is going. */
        const aim = !t.firing;
        const fade = t.firing ? 1 - k : 1;
        ctx.translate(e.x, e.y);
        ctx.rotate(WS.atan2(t.dy, t.dx));
        ctx.fillStyle = `rgba(226,72,61,${(aim ? 0.07 + 0.16 * k : 0.20 * fade).toFixed(3)})`;
        ctx.fillRect(0, -t.width / 2, t.length, t.width);
        ctx.fillStyle = `rgba(255,120,100,${(aim ? 0.16 + 0.3 * k : 0.42 * fade).toFixed(3)})`;
        ctx.fillRect(0, -t.width / 2, t.length * (aim ? k : 1), t.width);
        ctx.strokeStyle = `rgba(255,140,120,${(aim ? 0.35 + 0.45 * k : 0.85 * fade).toFixed(3)})`;
        ctx.lineWidth = aim ? 1.5 : 2.5;
        ctx.strokeRect(0, -t.width / 2, t.length, t.width);
        /* Locked but not yet gone: it stopped swinging, and it says so with
           a second, heavier rail down each side - shape, not a colour shift,
           so it reads at a glance in any palette. */
        if (aim && t.locked) {
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, -t.width / 2 - 4); ctx.lineTo(t.length, -t.width / 2 - 4);
          ctx.moveTo(0, t.width / 2 + 4); ctx.lineTo(t.length, t.width / 2 + 4);
          ctx.stroke();
          ctx.lineWidth = 1.5;
        }
        // Chevrons pointing the way out.
        ctx.globalAlpha = (aim ? 0.5 + 0.4 * k : 0.9 * fade);
        for (let c = 1; c <= 3; c++) {
          const x = t.length * (c / 4);
          ctx.beginPath();
          ctx.moveTo(x, -t.width * 0.28);
          ctx.lineTo(x + 14, 0);
          ctx.lineTo(x, t.width * 0.28);
          ctx.stroke();
        }
      } else if (t.kind === 'ring') {
        ctx.globalAlpha = 0.7 * (1 - k);
        ctx.strokeStyle = 'rgba(226,72,61,.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, t.radius * (0.4 + 0.9 * k), 0, WS.TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const ZONE_FILL_CAP = 6;
  R.drawZones = function (ctx, time) {
    const zones = WS.Projectile.zones;
    /* Each of these is already, on its own admission a few lines down, one of
       the two biggest things drawn in the game - forty-odd thousand pixels,
       four gradients, two edges, twenty rotating ticks - and unlike a bolt or
       a flash a zone SITS there for its whole multi-second duration rather
       than fading in under a second. Arcane Overflow firing Hallowed Ring
       repeatedly stacks several of these on top of each other for as long as
       the gems keep coming, which is the other half of the reported lag
       alongside the nova rings. Four is already more overlapping zones than
       any single glance can tell apart, so past that the extras keep their
       ground-burn, corona and the damage they tick (untouched) but drop the
       gradients and spinning detail nothing can read anyway. */
    const busy = zones.count > 4;
    /* The one gradient every zone keeps even past `busy` - it is what makes
       a zone read as energy rather than a plain disc, so it has to survive
       every mode this function has. But it is additive, and a zone always
       spawns AT THE PLAYER, so overflow-stacked zones from the same weapon
       are not scattered like bolts - they are perfectly concentric, the
       same circle redrawn on top of itself. `lighter` compositing then adds
       their alphas at every radius, not just at one crowded point, so a
       sqrt-style damping (right for bolts, which spread out and only
       overlap near the muzzle) still saturated the whole disc to flat
       white. Linear damping is the one that's actually correct for
       "N identical circles stacked on the same center": it holds the total
       to what a single zone already looked like, so a fifteen-deep stack
       reads as the SAME field, not a blown-out searchlight - the additional
       zones are still ticking their own damage, they just stop competing to
       repaint ground the first one already lit. */
    /* The same ceiling for the ground. Arcane Overflow recasting a field on
       every gem kept twenty-odd of them down at once, each nearly five
       hundred pixels across - the whole screen washed over twenty times, in
       an additive pass, every frame. Under the damping above those extra
       washes added almost no light; they only cost it. So the newest
       ZONE_FILL_CAP fields carry the wash, and the older ones under them keep
       their rim - which is what says where each one still reaches - and their
       damage. */
    // the newest by time left, for the same reason as the orbits' ceiling
    let fillAt = -Infinity;
    if (zones.count > ZONE_FILL_CAP) {
      const lives = this._zoneLives || (this._zoneLives = []);
      lives.length = 0;
      for (let i = 0; i < zones.count; i++) lives.push(zones.active[i].life);
      lives.sort((a, b) => b - a);
      fillAt = lives[ZONE_FILL_CAP - 1];
    }
    const stackDamp = zones.count > 1 ? 1 / WS.min(zones.count, ZONE_FILL_CAP) : 1;
    ctx.save();
    for (let i = 0; i < zones.count; i++) {
      const z = zones.active[i];
      const fade = WS.clamp(z.life / z.maxLife, 0, 1);
      const R = z.radius;
      if (z.life < fillAt) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * fade;
        ctx.strokeStyle = WS.rgb(z.colour, 1);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, WS.TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }

      /* A zone used to be a flat disc under a plain hard ring, which read as a
         circle drawn on the grass rather than something happening to it. Four
         cheap passes fix that: ground it, fill it, edge it twice, and turn a
         ring of graduations - the same language the health gauge uses, which
         is what makes it read as a spell and not a decal. */

      // 1. Scorch. The ground goes darker under the effect, so it sits IN the
      //    world instead of floating over it.
      ctx.globalCompositeOperation = 'source-over';
      if (!this.lite && !busy) {
      const burn = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, R);
      burn.addColorStop(0, `rgba(0,0,0,${0.28 * fade})`);
      burn.addColorStop(0.75, `rgba(0,0,0,${0.16 * fade})`);
      burn.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = burn;
      ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, WS.TAU); ctx.fill();
      }

      // 2. The energy itself, hottest off-centre so it does not read as a lamp.
      /* Rank turns the field up rather than out. A zone's radius IS its
         damage area and moving it would retune the weapon, so what grows with
         rank is how hard the ground burns inside it - and past the ranks that
         buy other weapons a projectile, a corona just beyond the rim. */
      const zr = z.rank || 1;
      const hot = 1 + 0.10 * (zr - 1) + (z.evolved ? 0.5 : 0);
      ctx.globalCompositeOperation = 'lighter';
      const grd = ctx.createRadialGradient(z.x, z.y, R * 0.15, z.x, z.y, R);
      grd.addColorStop(0, WS.rgb(z.colour, 0.34 * fade * hot * stackDamp));
      grd.addColorStop(0.62, WS.rgb(z.colour, 0.17 * fade * hot * stackDamp));
      grd.addColorStop(1, WS.rgb(z.colour, 0));
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, WS.TAU); ctx.fill();
      if (zr >= WS.Config.projRankA && !this.lite && !busy) {
        const far = R * (zr >= WS.Config.projRankB ? 1.26 : 1.15) * (z.evolved ? 1.1 : 1);
        const halo = ctx.createRadialGradient(z.x, z.y, R * 0.9, z.x, z.y, far);
        halo.addColorStop(0, WS.rgb(z.colour, 0.18 * fade));
        halo.addColorStop(1, WS.rgb(z.colour, 0));
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(z.x, z.y, far, 0, WS.TAU); ctx.fill();
      }
      // what a discovery has mixed into it, at the heart of the field
      if (z.blend) {
        const bl = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, R * 0.45);
        bl.addColorStop(0, WS.rgb(z.blend, 0.30 * fade * stackDamp));
        bl.addColorStop(1, WS.rgb(z.blend, 0));
        ctx.fillStyle = bl;
        ctx.beginPath(); ctx.arc(z.x, z.y, R * 0.45, 0, WS.TAU); ctx.fill();
      }

      // 3. Two edges: a soft one just inside, a bright hairline on the rim.
      // Same concentric-stacking problem as the energy fill above, and the
      // same fix: these are solid strokes, not a gradient, but N of them
      // laid on the same ring in `lighter` mode saturate exactly as fast.
      const breathe = 0.98 + 0.02 * WS.sin(time * 4 + z.phase);
      ctx.globalAlpha = 0.3 * fade * stackDamp;
      ctx.strokeStyle = WS.rgb(z.colour, 1);
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(z.x, z.y, R * breathe * 0.94, 0, WS.TAU); ctx.stroke();
      ctx.globalAlpha = 0.85 * fade * stackDamp;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(z.x, z.y, R * breathe, 0, WS.TAU); ctx.stroke();

      /* 4. WHAT THE GROUND IS DOING.
       *
       * Both fields were the same drawing - graduations on the rim, two
       * inner rings, eight spokes - in two colours, and between them they
       * read as a radar screen somebody had left on the grass. The rim and
       * the wash above stay: they say exactly where the damage reaches. What
       * is inside now says what kind of damage it is.
       *
       *   holy    Consecrated ground. A band of runes turning on the rim, a
       *           six-pointed seal turning the other way inside it, and
       *           motes of light lifting off the ground.
       *   shadow  Blight. The rim goes ragged, the mire bubbles and pops,
       *           and tendrils of it reach in from the edge.
       *
       * Anything else keeps the graduations. Past `busy` all of it drops,
       * as it always did. */
      if (!this.lite && !busy) {
        if (z._src !== z.source) {
          const wd = WS.Weapons[z.source];
          z._style = wd ? (wd.data || wd).school : null;
          z._src = z.source;
        }
        if (z._style === 'holy') this.zoneHallow(ctx, z, R, fade, time, breathe);
        else if (z._style === 'shadow') this.zoneBlight(ctx, z, R, fade, time);
        else {
          ctx.globalAlpha = 0.55 * fade;
          ctx.lineWidth = 2;
          const spin = time * 0.5 + z.phase;
          for (let n = 0; n < 12; n++) {
            const a = spin + (n / 12) * WS.TAU;
            const ca = WS.cos(a), sa = WS.sin(a);
            ctx.beginPath();
            ctx.moveTo(z.x + ca * R * 0.86, z.y + sa * R * 0.86);
            ctx.lineTo(z.x + ca * R * 0.97, z.y + sa * R * 0.97);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  /* Consecrated ground: runes on the rim, a seal, and rising light. */
  R.zoneHallow = function (ctx, z, R, fade, time, breathe) {
    const x = z.x, y = z.y, spin = time * 0.35 + z.phase;
    ctx.strokeStyle = WS.rgb(z.colour, 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the rune band: two fine rings and eighteen marks between them
    ctx.globalAlpha = 0.5 * fade;
    ctx.lineWidth = 1.2;
    for (const k of [0.79, 0.92]) { ctx.beginPath(); ctx.arc(x, y, R * k * breathe, 0, WS.TAU); ctx.stroke(); }
    ctx.globalAlpha = 0.75 * fade;
    ctx.lineWidth = 1.6;
    const runes = 18, h = R * 0.1;
    for (let n = 0; n < runes; n++) {
      const a = spin + (n / runes) * WS.TAU;
      ctx.save();
      ctx.translate(x + WS.cos(a) * R * 0.855, y + WS.sin(a) * R * 0.855);
      ctx.rotate(a + Math.PI / 2);
      const kind = (n * 7 + 3) % 4;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.5); ctx.lineTo(0, h * 0.5);
      if (kind === 0) { ctx.moveTo(0, -h * 0.5); ctx.lineTo(h * 0.35, -h * 0.15); }
      else if (kind === 1) { ctx.moveTo(-h * 0.3, -h * 0.1); ctx.lineTo(h * 0.3, h * 0.2); }
      else if (kind === 2) { ctx.moveTo(0, 0); ctx.lineTo(-h * 0.32, h * 0.35); ctx.moveTo(0, 0); ctx.lineTo(h * 0.32, h * 0.35); }
      else { ctx.moveTo(-h * 0.3, -h * 0.5); ctx.lineTo(h * 0.3, -h * 0.5); }
      ctx.stroke();
      ctx.restore();
    }
    // the seal: two triangles, turning against the band
    ctx.globalAlpha = 0.42 * fade;
    ctx.lineWidth = 1.5;
    for (const off of [0, Math.PI]) {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = -spin * 0.6 + off + (i / 3) * WS.TAU - Math.PI / 2;
        const px = x + WS.cos(a) * R * 0.6, py = y + WS.sin(a) * R * 0.6;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, R * 0.3 * breathe, 0, WS.TAU); ctx.stroke();
    // motes lifting off the ground, each on its own clock
    ctx.fillStyle = WS.rgb(WS.mix(z.colour, [1, 1, 1], 0.55), 1);
    for (let i = 0; i < 14; i++) {
      const u = (time * 0.45 + i * 0.618 + z.phase) % 1;
      const a = i * 2.399 + z.phase, d = R * (0.12 + 0.78 * ((i * 0.37) % 1));
      ctx.globalAlpha = fade * 0.85 * WS.sin(u * Math.PI);
      ctx.beginPath();
      ctx.arc(x + WS.cos(a) * d, y + WS.sin(a) * d * 0.9 - u * 26, 1.6 + (i % 3) * 0.5, 0, WS.TAU);
      ctx.fill();
    }
  };

  /* Blight: a ragged rim, a mire that bubbles, and tendrils reaching in. */
  R.zoneBlight = function (ctx, z, R, fade, time) {
    const x = z.x, y = z.y, ph = z.phase;
    ctx.strokeStyle = WS.rgb(z.colour, 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the ragged edge, inside the true rim: a wobble of three frequencies
    ctx.globalAlpha = 0.5 * fade;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * WS.TAU;
      const w = 0.86 + 0.035 * WS.sin(a * 5 + time * 1.3 + ph) + 0.025 * WS.sin(a * 11 - time * 2.1) + 0.02 * WS.sin(a * 3 + ph * 2);
      const px = x + WS.cos(a) * R * w, py = y + WS.sin(a) * R * w;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    // tendrils: seven curls from the rim toward the middle, writhing
    ctx.globalAlpha = 0.45 * fade;
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const a = ph + (i / 7) * WS.TAU + WS.sin(time * 0.7 + i) * 0.12;
      const wig = WS.sin(time * 1.9 + i * 1.3) * 0.35;
      const ca = WS.cos(a), sa = WS.sin(a);
      const r0 = R * 0.84, r1 = R * (0.38 + 0.12 * ((i * 0.53) % 1));
      const cx = x + WS.cos(a + 0.35 + wig) * R * 0.62, cy = y + WS.sin(a + 0.35 + wig) * R * 0.62;
      ctx.beginPath();
      ctx.moveTo(x + ca * r0, y + sa * r0);
      ctx.quadraticCurveTo(cx, cy, x + WS.cos(a + 0.7 + wig) * r1, y + WS.sin(a + 0.7 + wig) * r1);
      ctx.stroke();
    }
    // bubbles: each swells, holds and pops, then comes up somewhere else
    const lit = WS.rgb(WS.mix(z.colour, [1, 1, 1], 0.45), 1);
    for (let i = 0; i < 11; i++) {
      const cyc = time * 0.8 + i * 0.37 + ph;
      const u = cyc % 1, gen = WS.floor(cyc);
      const a = (gen * 2.4 + i * 1.7) % WS.TAU, d = R * (0.15 + 0.62 * (((gen + i) * 0.618) % 1));
      const bx = x + WS.cos(a) * d, by = y + WS.sin(a) * d;
      if (u < 0.82) {
        const br = 2 + 5 * (u / 0.82) * (0.6 + (i % 3) * 0.25);
        ctx.globalAlpha = 0.55 * fade;
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = lit;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, WS.TAU); ctx.stroke();
        ctx.fillStyle = lit;
        ctx.globalAlpha = 0.6 * fade;
        ctx.beginPath(); ctx.arc(bx - br * 0.35, by - br * 0.35, WS.max(0.8, br * 0.22), 0, WS.TAU); ctx.fill();
      } else {
        // the pop: a ring thrown wide and gone
        const p = (u - 0.82) / 0.18;
        ctx.globalAlpha = 0.6 * fade * (1 - p);
        ctx.lineWidth = 1;
        ctx.strokeStyle = lit;
        ctx.beginPath(); ctx.arc(bx, by, 6 + p * 8, 0, WS.TAU); ctx.stroke();
      }
    }
    ctx.strokeStyle = WS.rgb(z.colour, 1);
  };

  /* ---------------------------------------------------------- the loot --- */
  /* THE LOOT LIGHT.
   *
   * Everything the player can pick up is drawn as the same sandwich: a dark
   * pad that removes the ground underneath it, the item itself, and a core
   * brighter than any floor in the game. Both outer layers are VALUE, not hue,
   * and that is the whole point.
   *
   * The gems used to be drawn additively at as little as 0.26 alpha with no
   * pad and no core, which meant a gem could only ever ADD to the colour under
   * it - so the commonest gem in the game, a green one, sat on Thornhollow's
   * green grass and disappeared. Measured against the floor beside it in RGB:
   * 89 of colour distance across 21 pixels. That is not a piece of loot, it is
   * a texture. The blue and violet tiers scored 127 and 132 for the same
   * reason - the tier hue was doing all the work, and on a map that shares it
   * there is no work being done.
   *
   * With a pad and a white core the read no longer depends on the tier colour
   * at all; the colour goes back to doing the one job it is good at, which is
   * telling you how much the gem is worth. */
  const gemArt = new Map();
  // The stone's radius as a fraction of the cached sprite's width.
  const GEM_R = 0.2;

  /** One cached sprite per tier: pad, facet, core. Drawn once, then blitted -
   *  which is also cheaper than the four paths per gem this replaces, and
   *  there can be 260 gems on the field. */
  function gemSprite(tier, colour) {
    const key = tier + ':' + WS.hex(colour);
    let c = gemArt.get(key);
    if (c) return c;
    const R0 = 16, S = 4, res = R0 * 2 * S;      // 4x, so the facets stay clean
    c = document.createElement('canvas');
    c.width = c.height = res;
    const g = c.getContext('2d');
    g.scale(S, S);
    const cx = R0, cy = R0, r = R0 * GEM_R;

    /* The pad is deliberately TIGHT. A wide one separates the gem perfectly
     * well and turns a field of two hundred of them into a rash of dark spots
     * - the ground stops reading as ground. Just past the stone's own edge is
     * enough to give it a hard border on any floor, and no more. */
    const pad = g.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * 1.75);
    pad.addColorStop(0, 'rgba(3,5,9,.82)');
    pad.addColorStop(0.5, 'rgba(3,5,9,.40)');
    pad.addColorStop(1, 'rgba(3,5,9,0)');
    g.fillStyle = pad;
    g.beginPath(); g.arc(cx, cy, r * 1.75, 0, WS.TAU); g.fill();

    // The stone: a cut diamond, lit from the same upper left as everything.
    const body = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    /* Bright, but still the tier's colour. Taken too far toward white the
       whole field turned into identical pale specks - which fixes visibility
       by throwing away the one thing the colour is for, which is telling the
       player at a glance how much is lying there. */
    body.addColorStop(0, WS.rgb(WS.mix(colour, [1, 1, 1], 0.40), 1));
    body.addColorStop(0.45, WS.rgb(colour, 1));
    body.addColorStop(1, WS.rgb(WS.shade(colour, 0.5), 1));
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.72, cy);
    g.lineTo(cx, cy + r); g.lineTo(cx - r * 0.72, cy);
    g.closePath(); g.fill();

    // A rim, so the stone has an edge even where the pad has faded out.
    g.strokeStyle = 'rgba(8,10,16,.85)'; g.lineWidth = 0.9;
    g.stroke();

    // The lit facet and the core. The core is near-white on every tier: it is
    // the mark the eye actually finds, and it must not be a colour that any
    // map can match.
    g.fillStyle = 'rgba(255,255,255,.42)';
    g.beginPath();
    g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.lineTo(cx - r * 0.72, cy);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.98)';
    g.beginPath(); g.ellipse(cx - r * 0.14, cy - r * 0.18, r * 0.32, r * 0.42, 0, 0, WS.TAU); g.fill();

    c.unit = R0;
    gemArt.set(key, c);
    return c;
  }

  R.drawGems = function (ctx, time) {
    const gems = WS.XP.pool;
    const player = WS.Game.player;
    /* Two passes rather than one. A vacuum or an Arcane Overflow build pulls
       every gem on the field at once - up to MAX_GEMS of them - and each used
       to pay for a save, a switch to 'lighter' and back, and a restore for its
       streak, then another save and restore for its stone. The streaks now go
       down together in one additive pass and the stones in one plain pass,
       each positioned with setTransform. Same pictures, same order within
       each layer; the streaks were always under the stones anyway. */
    const S = gems.count;
    if (!S) return;
    const base = ctx.getTransform();
    const pulledAll = WS.XP.vacuumTimer > 0;
    const R2 = player.pickupRadius;
    // pass 1: the streaks of the gems being pulled in
    if (!this.lite) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4;
      ctx.lineCap = 'round';
      let last = null;
      for (let i = 0; i < S; i++) {
        const g = gems.active[i];
        const d = WS.dist(g.x, g.y, player.x, player.y);
        if (!(d < R2 || pulledAll)) continue;
        const s = g.size * 1.2 * ((1 + 0.07 * WS.sin(time * 5 + g.spin)) + (g.pop > 0 ? g.pop * 1.6 : 0));
        if (g.colour !== last) { ctx.strokeStyle = WS.rgb(g.colour, 1); last = g.colour; }
        const k = d > 0 ? s * 2.4 / d : 0;
        ctx.lineWidth = s * 0.5;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.lineTo(g.x + (g.x - player.x) * k, g.y + (g.y - player.y) * k);
        ctx.stroke();
      }
      ctx.restore();
    }
    // pass 2: the stones
    for (let i = 0; i < S; i++) {
      const g = gems.active[i];
      const d = WS.dist(g.x, g.y, player.x, player.y);
      const pulled = d < R2 || pulledAll;
      const near = WS.clamp(1 - (d - R2) / 260, 0, 1);
      /* Only gems in play breathe. The pulse used to run on every gem on the
         field, and a hundred marks pulsing on independent phases is not life,
         it is static - so it is spent where it means something: on the ones
         being pulled in, and for a moment on one that has just absorbed
         another. */
      const swell = (pulled ? 1 + 0.07 * WS.sin(time * 5 + g.spin) : 1)
        + (g.pop > 0 ? g.pop * 1.6 : 0);
      const s = g.size * (pulled ? 1.2 : 0.94 + near * 0.14) * swell;
      /* A gem at rest is quieter than one in play, but it is never a ghost.
       * The floor here used to be 0.26, which is where the vanishing happened;
       * loot the player has not walked to yet is still loot. */
      ctx.globalAlpha = pulled ? 1 : 0.78 + near * 0.22;
      /* Held on the gem. gemSprite builds its cache key out of the tier and
         WS.hex(colour), and with 260 gems on the field that was 260 key
         strings a frame for a sprite that had been cached since the first
         one. The lookup was never the cost - the garbage was. */
      if (g._artTier !== g.tier) {
        g._art = gemSprite(g.tier, g.colour);
        g._artTier = g.tier;
      }
      /* The stone is GEM_R of the sprite's width, so blitting at five times
       * `s` puts it back at exactly the radius the rest of the game means by
       * `s`. Getting this wrong is silent and looks like a taste decision:
       * blitted at 2.5x the gems came out at half size and simply read as
       * "smaller than before" rather than as a bug. */
      const w = s / GEM_R;
      const c = WS.cos(g.spin), sn = WS.sin(g.spin);
      ctx.setTransform(
        base.a * c + base.c * sn, base.b * c + base.d * sn,
        -base.a * sn + base.c * c, -base.b * sn + base.d * c,
        base.a * g.x + base.c * g.y + base.e, base.b * g.x + base.d * g.y + base.f);
      ctx.drawImage(g._art, -w / 2, -w / 2, w, w);
    }
    ctx.setTransform(base);
    ctx.globalAlpha = 1;
  };

  /* The five that change a run: a bomb, a lodestone, an hourglass, a chest, a
   * supply crate. These are the decisions on the field - the moments a player
   * breaks off what they were doing and goes to get something - and they were
   * drawn as small flat glyphs lying on the grass, which is how scenery is
   * drawn. Measured against the floor beside them, the bomb cleared 274 of
   * colour distance across THIRTY-FOUR PIXELS: a bright speck, not a landmark. */
  const CALLOUT = { bomb: 1, stone: 1, hourglass: 1, chest: 1, cache: 1 };

  /** A watcher, met on the field (src/game/encounters.js): the survivor
   *  themselves, drawn through the hero rig - or, for the fallen hero, the
   *  cairn he is still screaming under - with the ground you must stand on
   *  marked around them, and how far along you are. */
  R.drawWatcher = function (ctx, p, y, size, time) {
    const who = p.who, ch = WS.Characters[who];
    if (!ch) return;
    const c = WS.Config.encounters;
    const k = p.hold || 0;
    if (who === 'warrior' && k < 1) {
      // The cairn: stones heaped on a mound, shaking harder as you dig.
      const shake = (0.6 + k * 2.4) * WS.sin(time * 38);
      ctx.save();
      ctx.translate(p.x + shake, p.y);
      ctx.fillStyle = '#1a1714';
      ctx.beginPath(); ctx.ellipse(0, 4, size * 0.62, size * 0.26, 0, 0, WS.TAU); ctx.fill();
      const rock = WS.Sprites.prop('rock', WS.round(size * 0.55));
      for (const [dx, dy, s] of [[-0.3, -0.05, 0.9], [0.28, -0.02, 0.85], [0, -0.3, 1.0], [-0.12, 0.12, 0.8], [0.18, 0.14, 0.75]]) {
        const w = size * 0.55 * s;
        ctx.drawImage(rock, dx * size - w / 2, dy * size - w * 0.7, w, w);
      }
      ctx.restore();
    } else {
      const hs = WS.round(size * 1.2);
      const spr = WS.Sprites.hero(who, ch.color, hs);
      ctx.drawImage(spr, p.x - hs / 2, y - hs * 0.72 + size * 0.2, hs, hs);
      if (who === 'rogue') {
        // Bound: two turns of rope around the middle, loosening as you cut.
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#b8955a'; ctx.lineWidth = 2;
        for (const dy of [-0.18, -0.06]) {
          ctx.beginPath(); ctx.ellipse(p.x, y + dy * hs + size * 0.05, hs * 0.2, hs * 0.05, 0, 0, WS.TAU); ctx.stroke();
        }
        ctx.restore();
      }
    }
    // The ground to stand on: a dashed ring, lit while you are on it.
    ctx.save();
    ctx.setLineDash([6, 7]);
    ctx.lineDashOffset = -time * 12;
    ctx.globalAlpha = p.near ? 0.85 : 0.45;
    ctx.strokeStyle = WS.rgb(WS.mix(ch.color, [1, 1, 1], 0.4), 1);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, c.holdRadius, 0, WS.TAU); ctx.stroke();
    ctx.setLineDash([]);
    // How far along, clockwise from twelve.
    if (k > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(p.x, p.y, c.holdRadius, 0, WS.TAU); ctx.stroke();
      ctx.strokeStyle = WS.rgb(WS.mix(ch.color, [1, 0.9, 0.6], 0.3), 1); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, c.holdRadius, -WS.PI / 2, -WS.PI / 2 + WS.TAU * k); ctx.stroke();
    }
    // A name over them, and what you are doing once you are doing it.
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(4,6,10,.9)';
    const label = p.near && k > 0 ? WS.Encounters.holdText(who) : (who === 'warrior' && k < 1 ? 'A screaming cairn' : ch.name);
    ctx.font = `700 15px ${VOICE_FONT}`;
    ctx.strokeText(label, p.x, p.y - size * 1.05);
    ctx.fillStyle = '#f4ecdc';
    ctx.fillText(label, p.x, p.y - size * 1.05);
    // The ones who will not wait say how long they will.
    if (p.stay) {
      const left = WS.max(0, p.stay - p.life);
      ctx.font = `italic 500 13px ${VOICE_FONT}`;
      ctx.textBaseline = 'top';
      const t = WS.formatTime(left);
      ctx.strokeText(t, p.x, p.y + c.holdRadius + 4);
      ctx.fillStyle = left < 10 ? '#ffcf7a' : '#cfc6b6';
      ctx.fillText(t, p.x, p.y + c.holdRadius + 4);
    }
    ctx.restore();
  };

  R.drawPickups = function (ctx, time) {
    const pool = WS.Pickup.pool;
    for (let i = 0; i < pool.count; i++) {
      const p = pool.active[i];
      const lift = WS.sin(p.bob) * 3;
      const size = p.type.size;
      const y = p.y + lift;
      const callout = CALLOUT[p.kind] || p.type.noMagnet;

      /* The pad, first: a dark disc that takes the ground out from under the
       * item, so what follows is read against black rather than against
       * whatever the map happens to be made of. */
      const pad = ctx.createRadialGradient(p.x, y, size * 0.18, p.x, y, size * 0.95);
      pad.addColorStop(0, 'rgba(3,5,9,.80)');
      pad.addColorStop(0.6, 'rgba(3,5,9,.52)');
      pad.addColorStop(1, 'rgba(3,5,9,0)');
      ctx.fillStyle = pad;
      ctx.beginPath(); ctx.arc(p.x, y, size * 0.95, 0, WS.TAU); ctx.fill();
      shadow(ctx, p.x, p.y + p.radius * 0.7, p.radius * 0.7, 0.24);

      if (callout) {
        /* A halo in the item's own colour, sitting on the pad. Colour is
         * allowed to say WHICH thing it is; it is never asked to say that a
         * thing is there.
         *
         * NOT gated behind the quality setting, unlike every other glow in the
         * renderer. It was, and the guard rail caught what that costs: on
         * Balanced a bomb at the trough of its pulse came to 1.85x a coin's
         * presence, under the 2x a run-changing pickup has to hold. Balanced
         * is allowed to drop trails, ground detail and atmosphere; it is not
         * allowed to make the loot harder to find, because that is not a
         * quality setting, it is a different game. There are only ever a
         * handful of these on the field and the cost is a radial fill each. */
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const beat = 0.5 + 0.5 * WS.sin(time * 2.6 + p.bob);
        const halo = ctx.createRadialGradient(p.x, y, size * 0.2, p.x, y, size * (1.1 + beat * 0.3));
        halo.addColorStop(0, WS.rgb(p.type.tint, 0.30 + beat * 0.16));
        halo.addColorStop(1, WS.rgb(p.type.tint, 0));
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(p.x, y, size * (1.1 + beat * 0.3), 0, WS.TAU); ctx.fill();
        ctx.restore();
      }

      if (p.kind === 'merchant') {
        // Beans is drawn through the creature rig, not the flat icon system -
        // the only pickup that is, because she is a character standing on
        // the field rather than an object lying on it. Her own canvas is
        // centred lower than the icon field (the cloak and staff reach well
        // above her head), so the blit offset is tuned to her, not shared.
        const spr = WS.Sprites.creature('beans', p.type.tint, size);
        ctx.drawImage(spr, p.x - size * 0.50, y - size * 0.60, size, size);
      } else if (p.kind === 'watcher') {
        this.drawWatcher(ctx, p, y, size, time);
      } else if (p.kind === 'cache') {
        // A parachute is never quite still - a small, slow sway says the
        // crate only just landed, rather than having always sat here.
        const icon = WS.Icons.glyph(p.type.art, p.type.tint, size);
        ctx.save();
        ctx.translate(p.x, y - size * 0.06);
        ctx.rotate(WS.sin(time * 0.8 + p.bob) * 0.05);
        ctx.drawImage(icon, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        const icon = WS.Icons.glyph(p.type.art, p.type.tint, size);
        ctx.drawImage(icon, p.x - size / 2, y - size / 2, size, size);
      }

      if (callout) {
        // And a hard ring around it. The halo says "something is glowing
        // here"; the ring is the edge that makes it an object.
        ctx.save();
        // The floor matters more than the swing: a ring that fades to a
        // quarter alpha has a moment every couple of seconds where the object
        // is barely outlined, and that is the moment the player looks.
        ctx.globalAlpha = 0.72 + 0.2 * WS.sin(time * 2.6 + p.bob);
        ctx.strokeStyle = WS.rgb(WS.mix(p.type.tint, [1, 1, 1], 0.45), 1);
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(p.x, y, size * 0.72, 0, WS.TAU); ctx.stroke();
        ctx.restore();
      }

      if (p.type.noMagnet) {
        // Destination pickups keep their wider beacon: these are the ones you
        // cross the field for, and they have to be findable from off screen.
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.25 * WS.sin(time * 4);
        ctx.strokeStyle = WS.hex(p.type.tint);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.9 + 6 * WS.sin(time * 2), 0, WS.TAU); ctx.stroke();
        ctx.restore();
      }

      if (p.kind === 'merchant') {
        /* How long she stays, drawn on the ground around her: a ring that
           drains clockwise from twelve o'clock and the seconds left under her
           feet - a shape and a number, so it reads without colour. The last
           fifteen seconds pulse. */
        const stay = WS.Config.eggVendorStay;
        const left = WS.max(0, stay - p.life);
        const late = left <= 15;
        ctx.save();
        ctx.globalAlpha = late ? 0.65 + 0.3 * WS.sin(time * 8) : 0.75;
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.78, 0, WS.TAU); ctx.stroke();
        ctx.strokeStyle = late ? '#ffcf7a' : WS.hex(p.type.tint);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 0.78, -WS.PI / 2, -WS.PI / 2 + WS.TAU * (left / stay));
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.font = `600 ${WS.max(10, WS.round(size * 0.2))}px ${UI_FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
        const label = WS.formatTime(WS.ceil(left));
        ctx.strokeText(label, p.x, p.y + size * 0.84);
        ctx.fillStyle = late ? '#ffcf7a' : '#f3e6cf';
        ctx.fillText(label, p.x, p.y + size * 0.84);
        ctx.restore();

        /* She IS named Beans - so she throws some. Three, thrown one after
         * another from around her paw in a looping arc that empties and
         * restarts, rather than orbiting her forever: a real toss reads as
         * a toss because it lands and stops, even if the next one is a
         * third of a second behind it. */
        const originX = p.x - size * 0.065, originY = y + size * 0.165;
        for (let i = 0; i < 3; i++) {
          const t = (time * 0.6 + i * 0.333) % 1;
          if (t > 0.82) continue;            // a beat of rest between throws
          const tt = t / 0.82;
          const dir = i % 2 === 0 ? -1 : 1;
          const bx = originX + dir * tt * size * 0.42;
          const by = originY - WS.sin(tt * WS.PI) * size * 0.32 + tt * size * 0.1;
          ctx.save();
          ctx.globalAlpha = tt < 0.85 ? 1 : (1 - tt) / 0.15;   // settles rather than pops
          ctx.translate(bx, by);
          ctx.rotate(tt * 5 * dir);
          // a warm, light bean with a dark rim - the pad it flies over is
          // nearly this same brown, so the fill alone all but vanished
          ctx.fillStyle = '#e0a850';
          ctx.strokeStyle = '#5c3a1a';
          ctx.lineWidth = WS.max(0.8, size * 0.012);
          ctx.beginPath(); ctx.ellipse(0, 0, size * 0.075, size * 0.05, 0, 0, WS.TAU);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.65)';
          ctx.beginPath(); ctx.ellipse(-size * 0.02, -size * 0.015, size * 0.028, size * 0.015, 0, 0, WS.TAU); ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
  };

  /** Steel keeps a silhouette; magic stays a streak of light. Drawn in the
   *  bolt's local space, already rotated to its heading. */
  /* The bolt's silhouette as a PATH, separate from filling it, so the same
   * outline can be filled and then edged from the inside. A bright shape on
   * its own bright glow has no boundary until something darkens one, and
   * nothing in a 'lighter' pass can - so the edge is painted in source-over,
   * clipped to this path. Splitting it out is the whole reason it exists. */
  /* A bolt is painted, not filled: src/render/spellart.js holds every
     shape's silhouette and the material it is made of, cached per shape,
     colour and size. What used to live here - the paths, a white fill, and
     the facet lines clipped inside it - is there now, drawn once instead of
     every frame. */
  function drawBoltShape(ctx, b, r, c) {
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-over';
    WS.SpellArt.drawBolt(ctx, b.art, c, r);
    ctx.globalCompositeOperation = op;
  }

  R.drawBolts = function (ctx) {
    const bolts = WS.Projectile.bolts;
    /* Arcane Overflow fires every weapon at once on an 8% roll per gem
       collected, and with a vacuum build gathering gems fast that can land
       several times a second - each one a normal weapon's WORTH of bolts,
       stacked on top of whatever the field already had. The damage from
       that is the whole point of the blessing and untouched here; what
       spiked was the render cost, because every bolt on a busy frame still
       paid for a trail gradient and a multi-stop halo gradient each, and a
       canvas gradient is not cheap to build 100+ times a frame. Past a
       point no player is counting individual blades anyway - the field
       reads as a wall of light either way - so a frame this full switches
       every bolt to the same flat, single-fill glow `this.lite` already
       uses for low-quality mode. Nothing here changes what a bolt IS: its
       damage, count, and target are decided long before this function ever
       runs. */
    const busy = bolts.count > 70;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < bolts.count; i++) {
      const b = bolts.active[i];
      const r = b.radius;
      /* WHAT THIS SHOT IS, as opposed to where it is.
       *
       * Two things the bolt knew and never showed. Measured as the light a
       * weapon puts on the field, a rank-8 weapon is about twice a rank-1 one
       * - which is honest, but it arrives as eight helpings of five percent,
       * and nobody sees a five percent radius step. Power that grows only by
       * scaling never feels like it grew. So rank buys WEIGHT here: a longer
       * streak, a hotter core, and past the ranks where the weapon gains a
       * projectile, a halo around the glow. None of it touches a hitbox.
       *
       * And a discovery paints the bolt it changed. Frostfire made Cinderfall
       * chill what it hit and left it looking exactly like a Cinderfall; the
       * player was told about the pairing by a toast and then never saw it
       * again. A combined weapon now carries its partner's colour in its
       * core, so the thing on the field says what it has become. */
      const rank = b.rank || 1;
      const heft = 1 + 0.10 * (rank - 1) + (b.evolved ? 0.45 : 0);
      const c = b.blend ? WS.mix(b.colour, b.blend, 0.34) : b.colour;
      const core = b.blend ? WS.mix(b.colour, b.blend, 0.66) : null;

      /* The streak. Every bolt has carried a `trail` flag since launch and
         nothing ever read it, so the whole arsenal flew without motion.
         Length comes from actual speed, so a lobbed bolt barely has one and a
         fast one draws a hard line - which is the cue for how quickly a shot
         crosses the field, and the one that makes a seeking missile's curve
         legible instead of a dot teleporting along an arc. */
      if (b.trail !== false && !this.lite && !busy) {
        const speed = WS.sqrt(b.vx * b.vx + b.vy * b.vy);
        // The streak has to clear the bolt's own glow, which reaches r*2.4, or
        // it just thickens the blob. At 0.055 it did exactly that.
        const len = WS.min(speed * 0.13 * heft, r * 14 * heft);
        if (len > r * 3) {
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(WS.atan2(b.vy, b.vx));
          const tg = ctx.createLinearGradient(0, 0, -len, 0);
          tg.addColorStop(0, WS.rgb(c, 0.75));
          tg.addColorStop(0.3, WS.rgb(c, 0.32));
          tg.addColorStop(1, WS.rgb(c, 0));
          ctx.fillStyle = tg;
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.8);
          ctx.quadraticCurveTo(-len * 0.5, -r * 0.24, -len, 0);
          ctx.quadraticCurveTo(-len * 0.5, r * 0.24, 0, r * 0.8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      ctx.save();
      ctx.translate(b.x, b.y);
      const ang = b.spinRate ? b.spin : WS.atan2(b.vy, b.vx);
      ctx.rotate(ang);
      // The glow is one gradient object per bolt per frame, and a busy field
      // carries hundreds; flat colour at a smaller radius reads close enough.
      if (this.lite || busy) {
        ctx.fillStyle = WS.rgb(c, 0.4);
        ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, WS.TAU); ctx.fill();
      } else {
        /* The halo. It appears at the ranks where the weapon gains a
           projectile, so the two milestones the player already feels are also
           the two they can see. */
        if (rank >= WS.Config.projRankA) {
          /* A `ring` weapon launches every projectile from the same point on
             the same frame - unlike a fan or a trickled burst, which spread
             out or arrive across several frames - so at rank 8 evolved that
             is six to eight of these 88px halos stamped on the player at
             once. `lighter` compositing adds light wherever circles overlap,
             worst exactly where they all start, and it buried Knifestorm's
             own survivor in solid white. b.burst carries how many left
             together (see weapon.js's fillSpec/ring); everything that isn't
             a ring is burst 1 and this damping is exactly 1 - the milestone
             glow a single shot earns is untouched. */
          const burst = b.burst || 1;
          const burstDamp = burst > 1 ? WS.max(0.45, 1 / WS.pow(burst, 0.22)) : 1;
          const far = r * (rank >= WS.Config.projRankB ? 5.2 : 4.2) * (b.evolved ? 1.2 : 1) * burstDamp;
          const ring = ctx.createRadialGradient(0, 0, r * 1.6, 0, 0, far);
          ring.addColorStop(0, WS.rgb(c, (0.20 / WS.sqrt(heft)) * (burst > 1 ? 1 / WS.sqrt(burst) : 1)));
          ring.addColorStop(1, WS.rgb(c, 0));
          ctx.fillStyle = ring;
          ctx.beginPath(); ctx.arc(0, 0, far, 0, WS.TAU); ctx.fill();
        }
        /* HOLLOW IN THE MIDDLE, and it was not.
         *
         * This started at 0.95 alpha dead centre, under a near-white bolt
         * shape, in a 'lighter' pass - so for any weapon whose school
         * colour is pale the glow saturated all three channels exactly
         * where the shape is, and the shape stopped existing. It is the
         * same fault that turned Axe Gyre's blades into white blobs, and it
         * applies to every bolt in the game.
         *
         * A glow belongs AROUND a thing. Starting the gradient at the
         * bolt's own radius puts the light where light goes and leaves the
         * shape somewhere to be read against it. */
        const grd = ctx.createRadialGradient(0, 0, r * 0.85, 0, 0, r * 2.4);
        grd.addColorStop(0, WS.rgb(c, 0.55));
        grd.addColorStop(0.35, WS.rgb(c, 0.42));
        grd.addColorStop(1, WS.rgb(c, 0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, WS.TAU); ctx.fill();
      }
      /* A combined weapon's second colour, RING-WISE AROUND its own shape and
         drawn before it.
         
         This started out painted over the top of the bolt and measured as
         almost nothing, for a reason worth keeping: the whole pass composites
         with 'lighter', the bolt's own core is near-white, and adding a
         colour to white is not an operation - white is already at the
         ceiling. Underneath, it tints the halo the white core sits in. */
      if (core) {
        ctx.fillStyle = WS.rgb(core, 0.85);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, WS.TAU);
        ctx.fill();
        /* And two pips, off the bolt's shoulders.
         *
         * Colour alone cannot carry this. Verdict pairs Judgement Disc with
         * Hallowed Ring and both are holy, so the partner's colour IS the
         * weapon's own and the blend above is arithmetically nothing - the
         * guard measured 149 changed pixels and was right to fail it. A pair
         * of marks is a change of SHAPE, which works however close the two
         * schools happen to sit. */
        ctx.fillStyle = WS.rgb(core, 0.95);
        /* Clear of the widest bolt shape there is. The shield fills a disc at
           r*1.1 and strokes inside it, and pips tucked at r*1.35 were
           half-swallowed by it.
           
           Three of them, and half again the size they were. Measured across
           five seeds, the two pairings that combine weapons of the SAME
           school - verdict, two holy; curdle, two nature - repainted 210 and
           253 pixels, against 2245 to 26287 for every pairing whose partner
           brings a different colour. They were passing a floor of 300 on the
           strength of run-to-run noise, not on the strength of the mark. The
           mark is now the whole signal for those two, so it has to be a mark
           you can see rather than a detail you could find. */
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(-r * 0.30, side * r * 1.95, r * 0.56, 0, WS.TAU);
          ctx.fill();
        }
        // and one astern, which no single bolt shape in the game has
        ctx.beginPath();
        ctx.arc(-r * 1.75, 0, r * 0.48, 0, WS.TAU);
        ctx.fill();
      }
      drawBoltShape(ctx, b, r, c);
      ctx.restore();
    }
    /* Hostile bolts, which must not be mistaken for something worth walking
     * into.
     *
     * The comment here used to say they "read as hard-edged" and the code
     * drew a soft radial glow with a bright WHITE RING on top of it - which
     * is, precisely, how a pickup is drawn. Rendered side by side and
     * measured off the canvas, a frost bolt sat 36 units of colour from a
     * lodestone and covered nearly twice its lit area: same hue, same size,
     * same silhouette of a glowing ring with a pale centre. The player was
     * being asked to tell a reward from a projectile by shade alone.
     *
     * Three things separate them now, none of which is colour - colour is
     * still free to say which school the bolt belongs to:
     *
     *   shape   A dart with corners, elongated along the direction of travel.
     *           Nothing on the ground is pointed, and nothing on the ground
     *           has a direction.
     *   rim     A pickup is a bright halo around a dark pad. This is the
     *           inverse: a dark rim around a hot core, so the two read
     *           differently even out of focus at the edge of vision.
     *   motion  A tail, which a thing lying in the grass can never have.
     */
    const host = WS.Projectile.hostiles;
    for (let i = 0; i < host.count; i++) {
      const h = host.active[i];
      const r = h.radius;
      /* Along its travel, not its spin. A bolt that tumbles tells the player
         nothing; a bolt that points says where it is going. */
      const ang = (h.vx || h.vy) ? WS.atan2(h.vy, h.vx) : h.spin;
      const dart = (len, wide, back) => {
        ctx.beginPath();
        ctx.moveTo(len, 0);
        ctx.lineTo(0, -wide);
        ctx.lineTo(-back, 0);
        ctx.lineTo(0, wide);
        ctx.closePath();
      };
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(ang);
      if (!this.lite) {
        const tail = ctx.createLinearGradient(-r * 3.6, 0, 0, 0);
        tail.addColorStop(0, WS.rgb(h.colour, 0));
        tail.addColorStop(1, WS.rgb(h.colour, 0.45));
        ctx.fillStyle = tail;
        ctx.beginPath();
        ctx.moveTo(-r * 3.6, 0); ctx.lineTo(0, -r * 0.55); ctx.lineTo(0, r * 0.55);
        ctx.closePath(); ctx.fill();
      }
      // the dark rim, drawn wider than the body it is a rim for
      ctx.fillStyle = 'rgba(2,4,8,.88)';
      dart(r * 2.6, r * 1.28, r * 1.5); ctx.fill();
      ctx.fillStyle = WS.rgb(h.colour, 1);
      dart(r * 2.0, r * 0.88, r * 1.05); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      dart(r * 0.95, r * 0.36, r * 0.5); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  const ORBIT_DRAW_CAP = 48;
  R.drawOrbits = function (ctx, player) {
    const orbits = WS.Projectile.orbits;
    /* A whirl recasts before the last one ends, so at full rank with a few
       extra projectiles there are two rings of Axe Gyre and two of Stormcall
       out at once - fifty-odd blades. Past two dozen they read as a wheel of
       steel rather than as blades anyone is counting, so the extras that
       cost the most and say the least drop out: the trail of afterimages and
       Stormcall's crackle. The blades and their glow stay. */
    let blades = 0;
    for (let i = 0; i < orbits.count; i++) blades += orbits.active[i].count;
    const busy = blades > 24;
    /* AND A CEILING. Cooldown and duration boons at their limits, or Arcane
       Overflow recasting every weapon on a gem, keep a dozen or twenty rings
       of one weapon out at once - three hundred blades measured, all on the
       same circle, a few pixels apart. Past about four dozen that circle is
       already a solid wheel, and every ring beyond it was paying full price
       to be invisible: at that count the blades and their glow were most of
       the pixels in the frame. So each weapon draws its newest rings up to
       that many blades and no more. The rest still turn and still cut - only
       the drawing stops. */
    /* Newest first by time left, not by slot: the pool fills a gap by moving
       its last entry into it, so a slot says nothing about age, and choosing
       by slot handed the drawing to a different ring every time one expired. */
    for (let i = 0; i < orbits.count; i++) orbits.active[i]._hidden = false;
    if (blades > ORBIT_DRAW_CAP) {
      const order = this._orbitOrder || (this._orbitOrder = []);
      order.length = 0;
      for (let i = 0; i < orbits.count; i++) order.push(orbits.active[i]);
      order.sort((a, b) => b.life - a.life);
      const shown = this._orbitShown || (this._orbitShown = new Map());
      shown.clear();
      for (const o of order) {
        const had = shown.get(o.source) || 0;
        o._hidden = had > 0 && had + o.count > ORBIT_DRAW_CAP;
        if (!o._hidden) shown.set(o.source, had + o.count);
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    /* The wind of the whirl: three sweeps round the survivor's body at
       waist, chest and shoulder, turning with the blades. They are drawn
       before he is stamped back over his own light, so what shows is only
       the part outside his silhouette - air moving round a figure. */
    if (player.spinTimer > 0 && orbits.count && !this.lite) {
      const o0 = orbits.active[0];
      const ph = o0.angle * 1.6;
      const cl = WS.clamp(player.spinTimer * 3, 0, 1);
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const rx = 22 + k * 5, ry = rx * 0.34, cy = player.y - 4 - k * 11;
        const a0 = ph + k * 2.1;
        for (const [w, al] of [[5, 0.10], [2, 0.32]]) {
          ctx.strokeStyle = WS.rgb(o0.colour, al * cl);
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.ellipse(player.x, cy, rx, ry, 0, a0, a0 + 2.2);
          ctx.stroke();
        }
      }
    }
    for (let i = 0; i < orbits.count; i++) {
      const o = orbits.active[i];
      if (o._hidden) continue;
      for (let n = 0; n < o.count; n++) {
        const a = o.angle + (n / o.count) * WS.TAU;
        const x = player.x + WS.cos(a) * o.radius;
        const y = player.y + WS.sin(a) * o.radius;

        // The path just travelled, fading behind. Without it an orbiting blade
        // is a diamond that happens to be somewhere, not one that is moving.
        const dir = o.speed >= 0 ? -1 : 1;
        for (let k = 1; (this.lite || busy) ? false : k <= 5; k++) {
          const ta = a + dir * k * 0.11;
          ctx.globalAlpha = (1 - k / 5) * 0.35;
          ctx.fillStyle = WS.rgb(o.colour, 1);
          ctx.beginPath();
          ctx.arc(player.x + WS.cos(ta) * o.radius, player.y + WS.sin(ta) * o.radius,
            o.size * (0.5 - k * 0.07), 0, WS.TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + o.angle * 2);
        if (this.lite) {
          ctx.fillStyle = WS.rgb(o.colour, 0.5);
          ctx.beginPath(); ctx.arc(0, 0, o.size * 0.7, 0, WS.TAU); ctx.fill();
        } else {
          /* THE CORONA IS A HALO, NOT A DISC, AND IT IS NEVER WHITE.
           *
           * Rank bought the blade a filled radial gradient starting at 0.9
           * alpha in the middle, in a 'lighter' pass, under a near-white
           * blade. The physical school's colour is a pale cream - 0.90,
           * 0.80, 0.60 - so by rank 8 the middle of that gradient had
           * saturated all three channels and the blade drawn on top of it
           * added nothing to anything. Three featureless white blobs
           * orbiting the survivor, and the weapon was at its most powerful.
           *
           * Stormcall, which the same code draws, never had the problem:
           * its colour is cyan, so its white blade always had somewhere to
           * be. That is the whole fix. The corona is deepened away from
           * white so a pale school cannot blow it out, and it is hollow in
           * the middle so the blade sits IN a halo rather than on a lamp.
           * Its total light is held roughly constant as it widens, because
           * a wash that grows is a wash that erases. */
          const rank = o.rank || 1;
          /* Toned down from 0.14/0.7: correct for one blade alone, but Axe
             Gyre orbits up to nine of these at rank 8 evolved, spaced about
             95px apart round a 136px radius - and the old growth put a
             172px-wide corona on each one, so neighbouring blades' haloes
             overlapped into one solid ring and the sharper head shape above
             was fighting its own glow for a silhouette. Sized instead to
             roughly meet its neighbour rather than swallow it. */
          const grow = 1 + 0.05 * (rank - 1) + (o.evolved ? 0.25 : 0);
          const far = o.size * grow;
          const veil = 1 / WS.sqrt(grow);
          const deep = [o.colour[0] * 0.78, o.colour[1] * 0.60, o.colour[2] * 0.40];
          const inner = o.size * 0.52;
          // baked once per colour and size - see SpellArt.glow
          const halo = WS.SpellArt.glow(deep, far, inner / far, 0.30 * veil, 0.62 * veil);
          ctx.drawImage(halo, -far, -far, far * 2, far * 2);
        }
        // A discovery's colour, under the blade rather than over it - see the
        // note in drawBolts about painting onto white in a 'lighter' pass.
        if (o.blend) {
          ctx.fillStyle = WS.rgb(o.blend, 0.8);
          ctx.beginPath(); ctx.arc(0, 0, o.size * 0.62, 0, WS.TAU); ctx.fill();
          // a ring outside the blade, for the same reason as the bolt's pips:
          // a pairing of two weapons from one school has no colour to give
          ctx.strokeStyle = WS.rgb(o.blend, 0.9);
          ctx.lineWidth = WS.max(1, o.size * 0.13);
          ctx.beginPath(); ctx.arc(0, 0, o.size * 1.05, 0, WS.TAU); ctx.stroke();
        }
        /* AN AXE. It was a diamond - the same diamond every orbiting
           weapon in the game drew, whatever it was called. Axe Gyre gets a
           haft and a wedge head, so the thing whirling around the survivor
           is the thing the card names. The shape is the blade's own size
           and touches no hitbox; `bladeArt` says which to draw and anything
           that does not name one keeps the diamond it had. */
        const S = o.size;
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        if (o.art === 'axe' || o.art === 'sword') {
          /* AN AXE, and now a steel one. The silhouette - poll block and
             wedge, picked over every merged version that followed it - is
             exactly the shape it was; spellart.js paints it as a material
             instead of a white fill with its bevel lines cut in afterwards:
             a honed edge carrying the school's colour, a darker cheek, an
             ash haft with a wrapped grip. Cached, so the detail costs one
             drawImage a blade. */
          ctx.globalCompositeOperation = 'source-over';
          WS.SpellArt.drawBlade(ctx, o.art, o.colour, S);
          /* Stormcall is the gyre married to the lightning, and its blades
             were Axe Gyre's in another colour. They crackle: two short arcs
             off the edge that re-strike every few frames. */
          if (o.art === 'sword' && !this.lite && !busy) {
            ctx.globalCompositeOperation = 'lighter';
            const flick = WS.floor(o.life * 20) + n * 7;
            for (let k = 0; k < 2; k++) {
              ctx.save();
              ctx.translate(S * (1.1 - k * 0.35), S * (0.35 + k * 0.2));
              ctx.rotate(((flick * 2.39 + k * 1.7) % WS.TAU));
              WS.SpellArt.lightning(ctx, S * 0.7, WS.max(0.8, S * 0.05), o.colour, 0.9, flick * 977 + k * 131, 0);
              ctx.restore();
            }
          }
          ctx.globalCompositeOperation = 'lighter';
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -S * 0.7); ctx.lineTo(S * 0.28, 0);
          ctx.lineTo(0, S * 0.7); ctx.lineTo(-S * 0.28, 0);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }
    ctx.restore();
  };

  /* A LANCE, NOT A STRIPE.
   *
   * This drew three straight strokes of constant width with round caps, one
   * over another, from the muzzle to the far end. Correct to the pixel, and
   * on screen a flat-ended green ruler that happened to start near the
   * survivor: measured against every other weapon in the game it came third
   * from last for structure - 17.7% of its lit pixels carried an edge,
   * against 75% for Arcweb - and it had 37,000 lit pixels to be
   * structureless in. Nothing about it said the light was coming OUT of
   * anybody.
   *
   * Four things it now has, and one rule they all obey.
   *
   *   muzzle    A burst at the hand, with spikes swept BACK along the shaft.
   *             A beam that begins at full width begins nowhere; a beam that
   *             erupts has a source.
   *   core      A hot white shaft that narrows to a point. Constant width
   *             reads as a painted line, because nothing in the world is the
   *             same size near and far.
   *   tip       A spearhead, so the far end arrives somewhere instead of
   *             stopping.
   *   grain     Thin lances inside the shaft, more of them with rank. This
   *             is what rank buys: structure rather than radius, so a maxed
   *             lance is BUSIER without being fatter.
   *
   * THE RULE. damageLine clamps t to [0, 1], so what a beam hits is a
   * capsule: full half-width along the shaft and a hemisphere of the same
   * half-width past each end. Every solid part below is inside that capsule,
   * which is why the muzzle burst and the spearhead may reach half a width
   * beyond the endpoints and no further. Only the bloom, which is light and
   * hits nothing, goes wider. A beam that looked longer than it struck would
   * be the worst kind of art fix. */
  R.drawBeams = function (ctx) {
    const beams = WS.Projectile.beams;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < beams.count; i++) {
      const b = beams.active[i];
      const fade = WS.clamp(b.life / b.maxLife, 0, 1);
      const dx = b.x2 - b.x1, dy = b.y2 - b.y1;
      const len = WS.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      const hw = WS.max(1.5, b.width * 0.5);
      const br = b.rank || 1;
      const grand = 1 + 0.15 * (br - 1) + (b.evolved ? 0.7 : 0);
      /* A CHAIN LINK IS LIGHTNING, NOT A LANCE.
       *
       * Arcweb's hops were drawn by the lance below: a straight white rule
       * from creature to creature with a spearhead on the end, so the storm
       * weapon read as a set of laser pointers joining the dots. The link is
       * a jagged, forking bolt now, pinned at both ends so it still lands on
       * exactly what it hit, and re-struck every couple of frames - a bolt
       * that holds still is a wire. More forks with rank. */
      if (b.arc) {
        ctx.save();
        ctx.translate(b.x1, b.y1);
        ctx.rotate(WS.atan2(dy, dx));
        const strike = WS.floor(b.life * 30);
        const forks = this.lite ? 0 : 1 + (br >= WS.Config.projRankA ? 1 : 0) + (b.evolved ? 1 : 0);
        WS.SpellArt.lightning(ctx, len, hw, b.colour, fade, (b.seed ^ (strike * 2654435761)) >>> 0, forks);
        ctx.restore();
        continue;
      }
      /* RANK BUYS STRUCTURE, NOT VEIL.
       *
       * Rank used to scale the bloom and nothing else, and a bloom is a
       * soft wash in a 'lighter' pass: laid over the rim and the core at
       * ever-greater width it dissolves exactly the edges that make the
       * weapon a drawing. Photographed side by side, a rank 1 lance read
       * SHARPER than a rank 8 one - the weapon got less legible as it got
       * stronger, which is the same fault that turned Axe Gyre's blades
       * into three white blobs.
       *
       * So the bloom's total light is held roughly constant as it widens -
       * wider and correspondingly thinner - and rank is spent instead on
       * the parts that have edges: the rim, the grain, the muzzle. */
      const veil = 1 / WS.sqrt(grand);
      const col = b.colour;

      ctx.save();
      ctx.translate(b.x1, b.y1);
      ctx.rotate(WS.atan2(dy, dx));

      /* The bloom: light, so it may be as wide as it likes. Widest at the
         muzzle and closing along the shaft, which is what gives the whole
         thing a direction even before the core is drawn. */
      if (!this.lite) {
        const bw0 = hw * 2.8 * grand, bw1 = hw * 1.15 * grand;
        const bg = ctx.createLinearGradient(0, 0, len, 0);
        bg.addColorStop(0, WS.rgb(col, 0.34 * fade * veil));
        bg.addColorStop(0.35, WS.rgb(col, 0.20 * fade * veil));
        bg.addColorStop(1, WS.rgb(col, 0.05 * fade * veil));
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(0, -bw0);
        ctx.lineTo(len, -bw1);
        ctx.lineTo(len + hw * 0.5, 0);
        ctx.lineTo(len, bw1);
        ctx.lineTo(0, bw0);
        ctx.closePath();
        ctx.fill();
      }

      /* The body, at exactly the half-width that damages, closing to the
         spearhead at the honest end of the capsule. */
      ctx.globalAlpha = fade;
      const body = () => {
        ctx.beginPath();
        ctx.moveTo(-hw * 0.35, -hw);
        ctx.lineTo(len - hw * 1.8, -hw);
        ctx.lineTo(len + hw * 0.5, 0);
        ctx.lineTo(len - hw * 1.8, hw);
        ctx.lineTo(-hw * 0.35, hw);
        ctx.closePath();
      };
      ctx.fillStyle = WS.rgb(col, 0.55);
      body(); ctx.fill();
      /* AN EDGE ON IT. The body was a flat fill and the bloom around it
         another, and the whole thing measured 17.7% structure because a fill
         beside a fill is not a boundary - it is one slightly brighter
         region. The rim is a single bright line down each side of exactly
         the width that damages, which is the one line in this weapon that
         says where it stops. Everything this game has learned about
         drawing says the same thing: a gradient reads as nothing and an
         edge reads as a shape. */
      ctx.save();
      body(); ctx.clip();
      ctx.strokeStyle = WS.rgb(col, 0.95);
      // and the edge thickens with rank, where the bloom no longer does
      ctx.lineWidth = WS.max(1.5, hw * 0.34 * (0.85 + 0.30 * grand));
      body(); ctx.stroke();
      ctx.restore();

      /* Grain: thin lances inside the shaft. They start at staggered points
         so the eye reads travel along the beam rather than a hatched
         pattern, and they live inside the body, so this is structure the
         weapon already had rather than reach it did not. */
      if (!this.lite) {
        const lines = 2 + WS.min(4, WS.floor((br - 1) * 0.6) + (b.evolved ? 2 : 0));
        let h = (b.seed || 1) >>> 0;
        for (let n = 0; n < lines; n++) {
          h = (h * 1664525 + 1013904223) >>> 0;
          const off = ((h >>> 8) % 1000) / 1000;
          h = (h * 1664525 + 1013904223) >>> 0;
          const at = ((h >>> 8) % 1000) / 1000;
          const y = (off * 2 - 1) * hw * 0.62;
          const x0 = at * len * 0.55;
          const x1 = WS.min(len - hw * 1.6, x0 + len * (0.28 + off * 0.3));
          if (x1 <= x0) continue;
          const lg = ctx.createLinearGradient(x0, 0, x1, 0);
          lg.addColorStop(0, WS.rgb(col, 0));
          lg.addColorStop(0.4, 'rgba(255,255,255,' + (0.30 * fade).toFixed(3) + ')');
          lg.addColorStop(1, WS.rgb(col, 0));
          ctx.fillStyle = lg;
          ctx.fillRect(x0, y - hw * 0.10, x1 - x0, hw * 0.20);
        }
      }

      /* The core: hot, white, and narrowing to the point. */
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.beginPath();
      ctx.moveTo(-hw * 0.2, -hw * 0.66);
      ctx.lineTo(len - hw * 2.2, -hw * 0.2);
      ctx.lineTo(len + hw * 0.46, 0);
      ctx.lineTo(len - hw * 2.2, hw * 0.2);
      ctx.lineTo(-hw * 0.2, hw * 0.66);
      ctx.closePath();
      ctx.fill();

      /* The muzzle. A disc inside the capsule's own cap, a bloom around it,
         and spikes swept back down the shaft - the sweep is the whole
         trick, because a symmetrical star reads as a lamp sitting there and
         a swept one reads as something leaving. */
      if (!this.lite) {
        const mg = ctx.createRadialGradient(0, 0, 0, 0, 0, hw * 3.2 * grand);
        mg.addColorStop(0, WS.rgb(col, 0.75 * fade * veil));
        mg.addColorStop(0.45, WS.rgb(col, 0.28 * fade * veil));
        mg.addColorStop(1, WS.rgb(col, 0));
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(0, 0, hw * 3.2 * grand, 0, WS.TAU); ctx.fill();
        /* Spikes swept BACK down the shaft. The sweep is the whole trick:
           a symmetrical star at the hand reads as a lamp somebody is
           holding, and a swept one reads as something leaving. */
        ctx.fillStyle = WS.rgb(col, 0.85 * fade);
        for (const side of [-1, 1]) {
          for (const k of [0.6, 1.0, 1.45]) {
            ctx.beginPath();
            ctx.moveTo(-hw * 0.5, side * hw * 0.2);
            ctx.lineTo(hw * 2.4 * k, side * hw * 2.6 * grand * (1.25 - k * 0.45));
            ctx.lineTo(hw * 4.6 * k, side * hw * 0.34);
            ctx.closePath();
            ctx.fill();
          }
        }
        /* The ring the shot leaves through, edge-on. A beam with a collar
           has somewhere it came from; one without just starts. */
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 * fade).toFixed(3) + ')';
        ctx.lineWidth = WS.max(1.5, hw * 0.22);
        ctx.beginPath();
        ctx.ellipse(hw * 0.35, 0, hw * 0.44, hw * 1.5 * grand, 0, 0, WS.TAU);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.beginPath(); ctx.arc(0, 0, hw * 0.92, 0, WS.TAU); ctx.fill();

      /* A discovery's colour, along the shaft rather than over the core -
         see the note in drawBolts about painting onto white. */
      if (b.blend) {
        ctx.strokeStyle = WS.rgb(b.blend, 0.7 * fade);
        ctx.lineWidth = WS.max(1, hw * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, -hw * 0.78); ctx.lineTo(len - hw * 2, -hw * 0.5);
        ctx.moveTo(0, hw * 0.78); ctx.lineTo(len - hw * 2, hw * 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    ctx.restore();
  };

  R.drawFlashes = function (ctx) {
    const flashes = WS.FX.flashes;
    /* A nova fires up to four of these per activation, one with up to sixteen
       spike-rays, and Arcane Overflow calling every weapon at once on every
       gem collected can land several activations a second - so a vacuum
       build with a nova in its loadout fills this pool with big, ray-heavy
       rings faster than any one of them can fade. Past a point they are
       already reading as one wall of light rather than as individual hits,
       so the spike rays and the bright core - the two priciest parts, one a
       gradient and the other up to sixteen extra strokes - drop out; the
       ring itself, which is what actually says a hit landed, does not. */
    const busy = flashes.count > 30;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < flashes.count; i++) {
      const f = flashes.active[i];
      const t = 1 - WS.clamp(f.life / f.maxLife, 0, 1);
      /* An impact leaves fast and slows, so the radius eases out rather than
         travelling at a constant rate, and the ring THINS as it grows. A ring
         of constant weight expanding at constant speed reads as a bubble; a
         thinning one that decelerates reads as energy spending itself. */
      const e = 1 - (1 - t) * (1 - t);
      const r = f.radius * (0.22 + 0.78 * e);

      /* A NOVA IS A SHOCKWAVE, and it says which school sent it.
       *
       * The nova was this function's plain ring with hairline spokes through
       * it - a wagon wheel, the same drawing for the Dawn as for the Reaver,
       * and at speed a set of thin lines nobody could read. Its main wave is
       * a band now: a soft wake behind, a hot edge in front, and the edge is
       * where the damage has got to. Then each school draws what it is: the
       * holy ones throw tapered sunrays, the shadow one reaps - crescent
       * blades riding the wave round, over a darkening of the ground that
       * gives the violet something to be bright against. */
      if (f.style && !this.lite && !busy) {
        this.drawNova(ctx, f, t, e, r);
        continue;
      }

      // The core: bright, and gone inside the first third. This is the hit.
      const core = WS.clamp(1 - t * 3, 0, 1);
      if (core > 0 && !this.lite && !busy) {
        const cg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius * 0.7);
        cg.addColorStop(0, WS.rgb(f.colour, 0.85 * core));
        cg.addColorStop(1, WS.rgb(f.colour, 0));
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.radius * 0.7, 0, WS.TAU); ctx.fill();
      }

      ctx.globalAlpha = (1 - t) * (1 - t) * 0.9;
      ctx.strokeStyle = WS.rgb(f.colour, 1);
      ctx.lineWidth = WS.max(1, f.radius * 0.1 * (1 - e) + 1);
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, WS.TAU); ctx.stroke();

      // A white leading edge for the first half, so the moment of contact is
      // the brightest thing in the effect and not the aftermath.
      if (t < 0.5) {
        ctx.globalAlpha = (1 - t * 2) * 0.7;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = WS.max(1, f.radius * 0.045 * (1 - e) + 0.6);
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, WS.TAU); ctx.stroke();
      }

      /* RAYS THROUGH THE RING, for the one caller that asks for them.
       *
       * A nova used to BE this ring and nothing else - the same shape as
       * every hit-impact in the game, just bigger. A burst has a direction
       * to every point on its rim; a ring has none. Rays bursting out
       * through it, growing with the same radius, give a nova a shape of
       * its own and something concrete for rank to add to: more rays past
       * the milestones where other weapons gain a projectile. */
      if (f.spikes > 0 && !this.lite && !busy) {
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.strokeStyle = WS.rgb(f.colour, 1);
        ctx.lineWidth = WS.max(1, f.radius * 0.03 * (1 - e) + 0.8);
        ctx.lineCap = 'round';
        const seed = ((f.x * 12.9898 + f.y * 78.233) % WS.TAU + WS.TAU) % WS.TAU;
        for (let n = 0; n < f.spikes; n++) {
          const a = seed + (n / f.spikes) * WS.TAU;
          const ca = WS.cos(a), sa = WS.sin(a);
          ctx.beginPath();
          ctx.moveTo(f.x + ca * r * 0.45, f.y + sa * r * 0.45);
          ctx.lineTo(f.x + ca * r * 1.16, f.y + sa * r * 1.16);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  R.drawNova = function (ctx, f, t, e, r) {
    const k = 1 - t;
    const col = f.colour;
    const shadow = f.style === 'shadow';
    const band = f.radius * (0.2 * (1 - e) + 0.05) + 4;
    /* The echoes - the inner wave, and the outer one rank buys - were the
       old hard rings, and three of them round the real one turned the
       whole nova into an archery target. An echo is the same band, fainter,
       with nothing riding on it. */
    if (!f.spikes) {
      const g = ctx.createRadialGradient(f.x, f.y, WS.max(0, r - band * 0.8), f.x, f.y, r + 2);
      g.addColorStop(0, WS.rgb(col, 0));
      g.addColorStop(0.8, WS.rgb(col, 0.24 * k));
      g.addColorStop(0.95, `rgba(255,255,255,${(0.34 * k * k).toFixed(3)})`);
      g.addColorStop(1, WS.rgb(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, r + 2, 0, WS.TAU); ctx.fill();
      ctx.strokeStyle = WS.rgb(WS.mix(col, [1, 1, 1], 0.4), 0.45 * k);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, WS.TAU); ctx.stroke();
      return;
    }
    if (shadow) {
      // The ground under the wave goes dark first: source-over, so it can.
      ctx.globalCompositeOperation = 'source-over';
      const d = ctx.createRadialGradient(f.x, f.y, WS.max(0, r - band * 1.6), f.x, f.y, r + 2);
      d.addColorStop(0, 'rgba(8,2,16,0)');
      d.addColorStop(0.7, `rgba(8,2,16,${(0.30 * k).toFixed(3)})`);
      d.addColorStop(1, 'rgba(8,2,16,0)');
      ctx.fillStyle = d;
      ctx.beginPath(); ctx.arc(f.x, f.y, r + 2, 0, WS.TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
    } else if (t < 0.34) {
      // The holy wave opens with light at the heart, gone in its first third.
      const core = 1 - t * 3;
      const cg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius * 0.55);
      cg.addColorStop(0, `rgba(255,255,240,${(0.7 * core).toFixed(3)})`);
      cg.addColorStop(0.4, WS.rgb(col, 0.35 * core));
      cg.addColorStop(1, WS.rgb(col, 0));
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.radius * 0.55, 0, WS.TAU); ctx.fill();
    }
    // the band: a wake that fades behind a hot leading edge
    const g = ctx.createRadialGradient(f.x, f.y, WS.max(0, r - band), f.x, f.y, r + 3);
    g.addColorStop(0, WS.rgb(col, 0));
    g.addColorStop(0.72, WS.rgb(col, 0.42 * k));
    g.addColorStop(0.93, `rgba(255,255,255,${(0.62 * k * k).toFixed(3)})`);
    g.addColorStop(1, WS.rgb(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y, r + 3, 0, WS.TAU); ctx.fill();
    /* The front itself, as a line: the wake is soft by nature, and a wave
       that is all wake has nowhere it has reached. This is where the
       damage is. */
    ctx.strokeStyle = WS.rgb(WS.mix(col, [1, 1, 1], 0.5), 0.9 * k);
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, WS.TAU); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = WS.rgb(col, 0.5 * k);
    ctx.beginPath(); ctx.arc(f.x, f.y, WS.max(0, r - band * 0.55), 0, WS.TAU); ctx.stroke();

    const seed = ((f.x * 12.9898 + f.y * 78.233) % WS.TAU + WS.TAU) % WS.TAU;
    if (shadow) {
      /* Reaping blades: crescents riding the wave, sweeping round as it
         spreads. Thick in the middle, a point at each end, a bright
         outer edge - a scythe's cut seen from above. */
      const n = WS.max(4, WS.ceil(f.spikes / 2.6));
      const sweep = 0.95, turn = e * 1.5;
      for (let i = 0; i < n; i++) {
        const a0 = seed + (i / n) * WS.TAU + turn;
        ctx.beginPath();
        for (let j = 0; j <= 8; j++) {
          const a = a0 + sweep * (j / 8);
          ctx.lineTo(f.x + WS.cos(a) * r, f.y + WS.sin(a) * r);
        }
        for (let j = 8; j >= 0; j--) {
          const a = a0 + sweep * (j / 8);
          // thickest two-thirds of the way along: the blade's belly, then its point
          const u = j / 8;
          const rr = r * (1 - 0.2 * WS.sin(Math.PI * WS.pow(u, 0.7)) * (0.5 + 0.5 * u));
          ctx.lineTo(f.x + WS.cos(a) * rr, f.y + WS.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = WS.rgb(WS.mix(col, [1, 1, 1], 0.2), 0.75 * k);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${(0.7 * k).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let j = 0; j <= 8; j++) {
          const a = a0 + sweep * (j / 8);
          ctx.lineTo(f.x + WS.cos(a) * r, f.y + WS.sin(a) * r);
        }
        ctx.stroke();
      }
    } else {
      /* Sunrays: tapered wedges, long and short in turn, reaching just past
         the wave - light that has somewhere to be going. */
      for (let i = 0; i < f.spikes; i++) {
        const a = seed + (i / f.spikes) * WS.TAU;
        const long = i % 2 ? 0.8 : 1;
        const r0 = r * 0.32, r1 = r * (0.88 + 0.26 * long);
        const wd = WS.max(1.5, f.radius * 0.035 * long * (1.2 - e * 0.5));
        const ca = WS.cos(a), sa = WS.sin(a);
        ctx.fillStyle = WS.rgb(col, 0.55 * k);
        ctx.beginPath();
        ctx.moveTo(f.x + ca * r0 - sa * wd, f.y + sa * r0 + ca * wd);
        ctx.lineTo(f.x + ca * r1, f.y + sa * r1);
        ctx.lineTo(f.x + ca * r0 + sa * wd, f.y + sa * r0 - ca * wd);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(255,255,240,${(0.6 * k).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(f.x + ca * r0 - sa * wd * 0.35, f.y + sa * r0 + ca * wd * 0.35);
        ctx.lineTo(f.x + ca * r1 * 0.94, f.y + sa * r1 * 0.94);
        ctx.lineTo(f.x + ca * r0 + sa * wd * 0.35, f.y + sa * r0 - ca * wd * 0.35);
        ctx.closePath(); ctx.fill();
      }
      // and beads of light strung on the edge, the corona of a small sun
      ctx.fillStyle = `rgba(255,255,245,${(0.75 * k).toFixed(3)})`;
      const beads = f.spikes * 2;
      for (let i = 0; i < beads; i++) {
        const a = seed + ((i + 0.5) / beads) * WS.TAU;
        ctx.beginPath();
        ctx.arc(f.x + WS.cos(a) * r, f.y + WS.sin(a) * r, 1.6 + 1.4 * (1 - e), 0, WS.TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  R.drawParticles = function (ctx) {
    const parts = WS.FX.particles;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < parts.count; i++) {
      const p = parts.active[i];
      ctx.globalAlpha = WS.clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.colour;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, WS.TAU); ctx.fill();
    }
    ctx.restore();
  };

  R.drawTexts = function (ctx) {
    const texts = WS.FX.texts;
    ctx.save();
    ctx.textAlign = 'center';
    let lastPx = -1;
    for (let i = 0; i < texts.count; i++) {
      const t = texts.active[i];
      const fade = WS.clamp(t.life / t.maxLife, 0, 1);
      const age = 1 - fade;
      // A short overshoot on arrival, easing back to size.
      const pop = t.pop ? 1 + t.pop * 0.55 * WS.max(0, 1 - age * 6) : 1;
      ctx.globalAlpha = WS.min(1, fade * 2.2);
      /* Only when it changes: assigning ctx.font makes the browser parse the
         string, and sixty-odd numbers a frame mostly share three sizes. */
      const px = WS.round(t.size * pop);
      if (px !== lastPx) { ctx.font = `600 ${px}px ${UI_FONT}`; lastPx = px; }
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(4,6,10,.9)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.colour;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  };

  /* -------------------------------------------------------------- arena -- */
  R.drawArena = function (ctx, time) {
    const A = WS.Arena;
    const b = A.bounds;

    ctx.save();
    // The arena floor: a lit disc inside the void.
    ctx.fillStyle = 'rgba(20,14,38,.55)';
    ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    ctx.strokeStyle = 'rgba(245,197,107,.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);

    for (const h of A.hazards) {
      if (h.shape === 'ring') {
        if (h.delay > 0) continue;
        ctx.save();
        ctx.lineWidth = h.thick;
        ctx.strokeStyle = 'rgba(255,190,90,.45)';
        // Draw the ring in segments, leaving the openings dark.
        const steps = 180;
        ctx.beginPath();
        for (let i = 0; i < steps; i++) {
          const a0 = (i / steps) * WS.TAU;
          const inside = (() => {
            const half = (h.gapWidth * WS.PI / 180) * 0.5;
            for (let k = 0; k < h.gapCount; k++) {
              const centre = h.gapBase + h.gapRot + (k / h.gapCount) * WS.TAU;
              let d = ((a0 - centre + WS.PI * 3) % WS.TAU) - WS.PI;
              if (WS.abs(d) <= half) return true;
            }
            return false;
          })();
          if (inside) continue;
          ctx.moveTo(h.cx + WS.cos(a0) * h.r, h.cy + WS.sin(a0) * h.r);
          ctx.arc(h.cx, h.cy, h.r, a0, a0 + WS.TAU / steps);
        }
        ctx.stroke();
        ctx.restore();

      } else if (h.shape === 'square') {
        if (h.telegraph > 0) {
          /* Safe ground and doomed ground must differ by more than hue.
           *
           * This was a green wash against a red one, and nothing else. Red
           * against green is the single most common form of colour blindness
           * there is - somewhere around one man in twelve - and the two fills
           * were both dark and both desaturated, so for those players the
           * arena's signature mechanic, the one that asks "which square do I
           * stand on", was a grid of identical rectangles. Not harder. Unde-
           * cidable.
           *
           * So the hue stays, because it is right for everyone who can use
           * it, and two channels that do not depend on it are laid alongside:
           *
           *   TEXTURE - doomed ground fills with hazard hatching; safe ground
           *             stays clean. Present or absent survives any palette,
           *             and it is legible in greyscale, in a photograph, and
           *             out of the corner of an eye.
           *   MOTION  - that hatching tightens and brightens as the spear
           *             falls, so the cell also says HOW LONG rather than
           *             only WHICH, and stillness itself marks safety.
           *
           * The safe cells wear the corner brackets the rest of the interface
           * uses to mean "inside the frame", which is the same word this
           * game's UI already speaks everywhere else. */
          const k = 1 - h.telegraph / WS.Arena.tuning.spearTele;
          const x = h.x + 3, y = h.y + 3, w = h.w - 6, hh = h.h - 6;

          ctx.save();
          if (h.safe) {
            ctx.fillStyle = 'rgba(61,220,122,.13)';
            ctx.fillRect(x, y, w, hh);
            // Corner brackets: quiet, static, unmistakably "stand here".
            ctx.strokeStyle = 'rgba(120,245,170,.85)';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            const c = WS.min(w, hh) * 0.26;
            for (const [cx, cy, sx, sy] of [
              [x, y, 1, 1], [x + w, y, -1, 1], [x, y + hh, 1, -1], [x + w, y + hh, -1, -1]]) {
              ctx.beginPath();
              ctx.moveTo(cx + sx * c, cy);
              ctx.lineTo(cx, cy);
              ctx.lineTo(cx, cy + sy * c);
              ctx.stroke();
            }
          } else {
            ctx.fillStyle = `rgba(226,72,61,${(0.10 + 0.20 * k).toFixed(3)})`;
            ctx.fillRect(x, y, w, hh);
            // Hazard hatching, clipped to the cell, tightening as it lands.
            ctx.beginPath(); ctx.rect(x, y, w, hh); ctx.clip();
            const gap = 18 - 8 * k;
            ctx.strokeStyle = `rgba(255,150,120,${(0.30 + 0.5 * k).toFixed(3)})`;
            ctx.lineWidth = 1 + 1.6 * k;
            ctx.beginPath();
            for (let d = -hh; d < w; d += gap) {
              ctx.moveTo(x + d, y + hh);
              ctx.lineTo(x + d + hh, y);
            }
            ctx.stroke();
            ctx.restore(); ctx.save();
            ctx.strokeStyle = `rgba(255,140,110,${(0.5 + 0.45 * k).toFixed(3)})`;
            ctx.lineWidth = 2 + 1.5 * k;
            ctx.strokeRect(x, y, w, hh);
          }
          ctx.restore();
        }

      } else if (h.shape === 'cutter') {
        const telegraphing = h.telegraph > 0;
        ctx.save();
        ctx.translate(h.cx, h.cy);
        ctx.rotate(h.ang);
        ctx.globalAlpha = telegraphing ? (0.25 + 0.25 * WS.sin(time * 14)) : 0.75;
        ctx.fillStyle = telegraphing ? 'rgba(255,180,90,.6)' : 'rgba(255,120,60,.75)';
        for (let arm = 0; arm < 4; arm++) {
          ctx.save();
          ctx.rotate(arm * WS.PI * 0.5);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(WS.cos(-h.half) * h.len, WS.sin(-h.half) * h.len);
          ctx.lineTo(WS.cos(h.half) * h.len, WS.sin(h.half) * h.len);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }
    }

    for (const an of A.anchors) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const r = 22 + 4 * WS.sin(an.pulse);
      const grd = ctx.createRadialGradient(an.x, an.y, 2, an.x, an.y, r);
      grd.addColorStop(0, 'rgba(179,79,242,.9)');
      grd.addColorStop(1, 'rgba(179,79,242,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(an.x, an.y, r, 0, WS.TAU); ctx.fill();
      ctx.restore();
      // The chain itself, drawn to the survivor.
      const p = WS.Game.player;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#b34ff2';
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(an.x, an.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  /* ------------------------------------------------------------- chrome -- */
  /* The menu used to sit on an empty black rectangle, which is the single
   * thing that made it read as a settings page rather than the front of a
   * game. There is no artwork to hang there and there never will be - this
   * game ships no image files - so the scene is made of the same materials
   * as everything else: the map's own ground, its own scenery, and a few of
   * its own creatures wandering across at a distance.
   *
   * It is deliberately slow and out of focus. The point is depth behind the
   * panels, not something to look at instead of them.
   */
  const MENU_WANDERERS = [
    { art: 'lampling', tint: [1.00, 0.90, 0.55], size: 40, y: 0.24, speed: 13, phase: 0.0 },
    { art: 'mongrel', tint: [0.95, 0.55, 0.20], size: 52, y: 0.52, speed: -9, phase: 0.35 },
    { art: 'gilkin', tint: [0.30, 0.95, 0.85], size: 38, y: 0.72, speed: 17, phase: 0.7 },
    { art: 'wolf', tint: [0.62, 0.66, 0.74], size: 44, y: 0.86, speed: -12, phase: 0.15 },
    { art: 'boar', tint: [0.70, 0.45, 0.28], size: 42, y: 0.38, speed: 8, phase: 0.55 },
  ];

  /* The menu is the night before the run: the same hills the prologue is set
   * in, under the same moon, with the watch fire somewhere below the panels
   * throwing its light up across them. Everything moves slowly - the camera
   * breathes, the mist travels, embers climb - so the front of the game is a
   * place you are waiting in rather than a page you are reading. */
  R.drawMenuScene = function (ctx, time) {
    const S = WS.Scene;
    if (!S) return this.drawMenuField(ctx, time);
    const t = time;
    ctx.save();
    // Mirrored: the prologue hangs its moon low on the left, which is exactly
    // where the logotype sits. Here it rises in the empty sky across from it.
    ctx.translate(W, 0); ctx.scale(-1, 1);
    S.camera(ctx, t);
    S.sky(ctx, t, 0.03);
    S.ranges(ctx, 0.03);
    S.woodFar(ctx, 0);
    S.ground(ctx, 0.03);
    S.woodNear(ctx, 0);
    S.mist(ctx, t, 0.03);
    ctx.restore();
    // The fire: below the frame, felt rather than seen.
    const flick = 0.86 + 0.08 * WS.sin(t * 2.3) + 0.06 * WS.sin(t * 7.9 + 1.3);
    const fire = ctx.createRadialGradient(W * 0.5, H * 1.08, 0, W * 0.5, H * 1.08, H * 0.95);
    fire.addColorStop(0, `rgba(255,132,48,${(0.42 * flick).toFixed(3)})`);
    fire.addColorStop(0.45, `rgba(214,84,30,${(0.14 * flick).toFixed(3)})`);
    fire.addColorStop(1, 'rgba(120,40,20,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = fire;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    this.drawMenuEmbers(ctx, t, flick);
  };

  /* Embers off the fire, rising the full height of the screen and turning on
   * the air as they go. Their own list, not Scene.drift's, because these come
   * from one place and have somewhere to be. */
  let menuEmbers = null;
  R.drawMenuEmbers = function (ctx, t, flick) {
    if (!menuEmbers) {
      menuEmbers = [];
      let s = 1337;
      const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < 46; i++) {
        menuEmbers.push({ x: 0.5 + (r() - 0.5) * 0.7, off: r() * 20, life: 7 + r() * 9,
          sway: 20 + r() * 70, ph: r() * 6.28, r: 0.8 + r() * 1.7 });
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of menuEmbers) {
      const p = ((t + e.off) % e.life) / e.life;
      const y = H * (1.04 - p * 1.12);
      const x = W * e.x + WS.sin(t * 0.5 + e.ph) * e.sway * p + p * 60;
      const a = WS.sin(p * WS.PI) * (0.55 + 0.45 * WS.sin(t * 4 + e.ph)) * flick;
      if (a < 0.02) continue;
      ctx.fillStyle = `rgba(255,${WS.round(200 - 110 * p)},${WS.round(110 - 60 * p)},${(a * 0.85).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, e.r * (1 - p * 0.45), 0, WS.TAU); ctx.fill();
    }
    ctx.restore();
  };

  /** The field the menu used to sit over - kept for a build without Scene. */
  R.drawMenuField = function (ctx, time) {
    // Scenery drifts on a long loop. Two speeds, so the field has depth.
    for (const p of this.props) {
      const near = p.size > 70;
      const drift = ((time * (near ? 5.5 : 2.6) + p.x) % (W + 240)) - 120;
      ctx.globalAlpha = p.alpha * (near ? 0.5 : 0.34);
      const sprite = WS.Sprites.prop(p.kind, p.size);
      ctx.drawImage(sprite, drift - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }

    // A few residents crossing, dim enough to read as distance.
    for (const m of MENU_WANDERERS) {
      if (!WS.Sprites.has(m.art)) continue;
      const span = W + 200;
      const t = (time * WS.abs(m.speed) / span + m.phase) % 1;
      const x = m.speed > 0 ? -100 + t * span : W + 100 - t * span;
      const y = H * m.y + WS.sin(time * 0.8 + m.phase * 9) * 5;
      const sprite = WS.Sprites.creature(m.art, m.tint, m.size);
      ctx.save();
      ctx.globalAlpha = 0.4;
      shadow(ctx, x, y + m.size * 0.34, m.size * 0.3, 0.22);
      ctx.translate(x, y);
      if (m.speed < 0) ctx.scale(-1, 1);
      // A walk bob, so they are alive rather than sliding.
      ctx.translate(0, WS.abs(WS.sin(time * 5 + m.phase * 6)) * -2);
      ctx.drawImage(sprite, -m.size / 2, -m.size * 0.62, m.size, m.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  R.drawVignette = function (ctx, depth) {
    const grd = ctx.createRadialGradient(
      this.viewW / 2, this.viewH / 2, WS.min(this.viewW, this.viewH) * 0.35,
      this.viewW / 2, this.viewH / 2, WS.max(this.viewW, this.viewH) * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, `rgba(0,0,0,${depth === undefined ? 0.55 : depth})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
  };

  /* -------------------------------------------------------- title cards --
   * The banner is the game's one loud voice, so it has registers. A caption
   * is a swept rule and a line of text. A boss arrival gets a medallion, a
   * dark band and a blood sweep. An evolution gets gold rays. The duality
   * the whole game is after lives here more than anywhere: the same
   * component says "you found a hat" and "the sky is falling".
   */

  /* The HUD is DOM, drawn over this canvas, and nothing here can see it. The
   * timer rail runs from y=20 to roughly y=88 across the top centre, which is
   * exactly where a centred title card wants to sit - the two collided until
   * this constant existed. Every banner lays out downward from it. */
  const HUD_SAFE = 108;
  /** Medallion geometry, shared by the layout and the draw so they agree. */
  const MED = 76, MED_HALO = MED * 1.05;

  /** Ease a value in over the first `inFrac` of the banner, out over the last. */
  function envelope(k, inFrac, outFrac) {
    return WS.min(WS.clamp((1 - k) / inFrac, 0, 1), WS.clamp(k / outFrac, 0, 1));
  }

  /** Overshooting ease - lands past the mark, settles back. Reads as eager. */
  function backOut(t) {
    const p = t - 1;
    return 1 + p * p * (2.7 * p + 1.7);
  }

  R.drawBanner = function (ctx) {
    const b = WS.Game.banner;
    if (!b || WS.Game.overlayCovers()) return;
    const k = WS.clamp(b.life / b.maxLife, 0, 1);
    const t = 1 - k;                                  // 0 at open, 1 at close
    const alpha = envelope(k, 0.18, 0.3);
    if (alpha <= 0.001) return;
    const cx = this.viewW / 2;
    const grow = WS.clamp(t * 5, 0, 1);
    const settle = backOut(WS.clamp(t * 3.2, 0, 1));

    /* Layout. Everything hangs off HUD_SAFE downward. A dread card leads with
       a medallion whose halo reaches MED_HALO above its centre, so its centre
       starts exactly one halo below the safe line and the band is sized from
       the block rather than guessed at - which is how the medallion ended up
       straddling the band's top hairline the first time. */
    const dread = b.kind === 'dread';
    const medY = HUD_SAFE + MED_HALO;
    // Glory sits lower than a caption because its ray burst needs headroom
    // above the title; plain is a line of type and wants none.
    const y = dread ? medY + 92 : HUD_SAFE + (b.kind === 'glory' ? 120 : 78);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    if (dread) this.bannerDread(ctx, b, cx, y, medY, grow, t, alpha);
    else if (b.kind === 'glory') this.bannerGlory(ctx, b, y - 12, grow, t);

    /* -- the swept rule, under every register ---------------------------- */
    const hue = dread ? '255,120,104' : '245,197,107';
    const w = WS.min(this.viewW * 0.78, 880) * grow;
    const rule = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    rule.addColorStop(0, `rgba(${hue},0)`);
    rule.addColorStop(0.5, `rgba(${hue},.95)`);
    rule.addColorStop(1, `rgba(${hue},0)`);
    ctx.fillStyle = rule;
    ctx.fillRect(cx - w / 2, y + 24, w, 1.5);
    // A brighter core, so the rule reads as light rather than a drawn line.
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillRect(cx - w * 0.16, y + 23, w * 0.32, 3);
    ctx.globalAlpha = alpha;

    /* -- the words -------------------------------------------------------
     * Titles ride a small vertical settle so they arrive rather than blink.
     */
    const rise = (1 - settle) * 10;
    ctx.font = `700 ${b.kind === 'plain' ? 32 : 42}px ${VOICE_FONT}`;
    ctx.letterSpacing = dread ? '1.5px' : '0.5px';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(4,6,10,.9)';
    ctx.strokeText(b.title, cx, y - rise);
    if (b.kind !== 'plain') {
      // Two passes: a wide coloured bloom, then the letterform over it. One
      // pass with a shadow gives a halo; two give the sense of a lit sign.
      ctx.save();
      ctx.globalAlpha = alpha * 0.75;
      ctx.shadowColor = dread ? 'rgba(226,72,61,.95)' : 'rgba(245,197,107,.9)';
      ctx.shadowBlur = 34;
      ctx.fillStyle = dread ? '#ff9d8e' : '#ffd489';
      ctx.fillText(b.title, cx, y - rise);
      ctx.restore();
    }
    ctx.fillStyle = dread ? '#fff1ec' : '#fff3d6';
    ctx.fillText(b.title, cx, y - rise);

    if (b.subtitle) {
      ctx.font = `italic 500 18px ${VOICE_FONT}`;
      ctx.letterSpacing = '0.2px';
      ctx.globalAlpha = alpha * WS.clamp(t * 4 - 0.35, 0, 1);
      ctx.lineWidth = 5;
      ctx.strokeText(b.subtitle, cx, y + 52);
      ctx.fillStyle = dread ? '#f2dad5' : '#cfd5e3';
      ctx.fillText(b.subtitle, cx, y + 52);
    }
    ctx.letterSpacing = '0px';
    ctx.restore();
  };

  /** Boss arrival: a letterbox band, a portrait medallion, a blood sweep. */
  R.bannerDread = function (ctx, b, cx, y, medY, grow, t, alpha) {
    /* The band. It opens from its own centre line so the screen feels seized
       rather than covered, and it is dark enough to actually win against a
       lit battlefield - a translucent wash reads as a rendering mistake. */
    // The band spans the whole block: one halo above the medallion down past
    // the subtitle, so nothing the card draws ever crosses its edge.
    const top = medY - MED_HALO, bottom = y + 74;
    const midY = (top + bottom) / 2;
    const bandH = (bottom - top) * WS.clamp(grow * 1.15, 0, 1);
    const band = ctx.createLinearGradient(0, midY - bandH / 2, 0, midY + bandH / 2);
    band.addColorStop(0, 'rgba(5,4,7,0)');
    band.addColorStop(0.22, 'rgba(5,4,7,.72)');
    band.addColorStop(0.5, 'rgba(5,4,7,.88)');
    band.addColorStop(0.78, 'rgba(5,4,7,.72)');
    band.addColorStop(1, 'rgba(5,4,7,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, midY - bandH / 2, this.viewW, bandH);

    // Hairlines along the band's edges: the Arclight rule language, stretched.
    ctx.fillStyle = 'rgba(226,72,61,.28)';
    ctx.fillRect(0, midY - bandH / 2, this.viewW, 1);
    ctx.fillRect(0, midY + bandH / 2 - 1, this.viewW, 1);

    /* A blood sweep travelling left to right, once, behind the words. */
    const sweep = WS.clamp(t * 2.2, 0, 1);
    const sx = -300 + sweep * (this.viewW + 600);
    const sg = ctx.createLinearGradient(sx - 300, 0, sx + 300, 0);
    sg.addColorStop(0, 'rgba(226,72,61,0)');
    sg.addColorStop(0.5, `rgba(226,72,61,${0.22 * (1 - sweep)})`);
    sg.addColorStop(1, 'rgba(226,72,61,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, midY - bandH / 2, this.viewW, bandH);

    if (!b.art || !WS.Sprites.has(b.art)) return;

    /* The medallion. The boss's own sprite, ringed and lit, lifted off the
       band - this is the cute half doing the epic work: the same small
       creature you are about to fight, hung like a portrait on a wall. */
    const S = MED;
    ctx.save();
    ctx.globalAlpha = alpha * WS.clamp(t * 4, 0, 1);
    ctx.translate(cx, medY);
    const pop = backOut(WS.clamp(t * 3.6, 0, 1));
    ctx.scale(pop, pop);

    const halo = ctx.createRadialGradient(0, 0, 6, 0, 0, MED_HALO);
    halo.addColorStop(0, 'rgba(226,72,61,.55)');
    halo.addColorStop(0.55, 'rgba(226,72,61,.18)');
    halo.addColorStop(1, 'rgba(226,72,61,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, MED_HALO, 0, WS.TAU); ctx.fill();

    // A lit disc, not a black hole: the sprite is dark-on-dark otherwise.
    const disc = ctx.createRadialGradient(-S * 0.14, -S * 0.2, 2, 0, 0, S * 0.52);
    disc.addColorStop(0, 'rgba(74,58,58,.98)');
    disc.addColorStop(1, 'rgba(14,11,14,.98)');
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(0, 0, S * 0.5, 0, WS.TAU); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, S * 0.47, 0, WS.TAU); ctx.clip();
    ctx.drawImage(WS.Sprites.creature(b.art, b.tint || [0.8, 0.3, 0.3], S, b.bossKit),
      -S / 2, -S / 2 + 3, S, S);
    ctx.restore();

    // Ring: a full thin circle for the shape, a heavy arc over the top third
    // for the light - the Arclight bracket language read in the round.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,240,214,.22)';
    ctx.beginPath(); ctx.arc(0, 0, S * 0.5, 0, WS.TAU); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,120,104,.95)';
    ctx.beginPath(); ctx.arc(0, 0, S * 0.5, -2.35, -0.79); ctx.stroke();
    ctx.restore();
  };

  /** Evolution, union, blessing: gold rays turning slowly behind the words.
   *
   *  Two things keep this from reading as clip-art. It is squashed flat, both
   *  because a burst behind a line of type wants to be wider than tall and
   *  because a circular one would reach into the HUD - the squash is computed
   *  from the room above the title, so the burst can never cross HUD_SAFE.
   *  And the ray lengths are hashed off the banner's seed rather than
   *  alternating long-short, because perfect twelvefold symmetry is the tell
   *  that a computer drew it and not a light source.
   */
  R.bannerGlory = function (ctx, b, cy, grow, t) {
    const REACH = 250;
    const squash = WS.min(0.5, (cy - HUD_SAFE) / REACH);
    ctx.save();
    ctx.translate(this.viewW / 2, cy);
    ctx.scale(1, squash);
    ctx.rotate(b.seed + t * 0.3);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * WS.TAU;
      // A cheap deterministic hash: stable for one banner, uneven across rays.
      const h = (WS.sin(i * 12.9898 + b.seed) * 43758.5453) % 1;
      const long = (0.45 + 0.55 * (h < 0 ? h + 1 : h)) * REACH * grow;
      const wide = 0.028 + 0.035 * ((h < 0 ? h + 1 : h));
      const g = ctx.createLinearGradient(0, 0, WS.cos(a) * long, WS.sin(a) * long);
      g.addColorStop(0, 'rgba(245,197,107,.34)');
      g.addColorStop(0.55, 'rgba(245,197,107,.12)');
      g.addColorStop(1, 'rgba(245,197,107,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      // A lens, not a triangle: the sides bow in so the tip tapers to nothing
      // instead of ending in a hard chevron.
      ctx.quadraticCurveTo(WS.cos(a - wide) * long * 0.5, WS.sin(a - wide) * long * 0.5,
        WS.cos(a) * long, WS.sin(a) * long);
      ctx.quadraticCurveTo(WS.cos(a + wide) * long * 0.5, WS.sin(a + wide) * long * 0.5, 0, 0);
      ctx.fill();
    }
    const r = REACH * 0.6 * grow;
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    core.addColorStop(0, 'rgba(255,230,174,.36)');
    core.addColorStop(1, 'rgba(255,230,174,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, WS.TAU); ctx.fill();
    ctx.restore();
  };

  WS.Renderer = R;

})(window.WS);
