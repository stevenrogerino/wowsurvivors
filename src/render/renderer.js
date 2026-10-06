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
    const vw = window.innerWidth, vh = window.innerHeight;
    const dpr = (this.lite ? 1 : WS.min(window.devicePixelRatio || 1, 2)) * (this.renderScale || 1);
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

  /* DYNAMIC RESOLUTION.

     A tester on a 3440-wide monitor, with a finished build at the Pale
     Wastes finale, got two frames a second: the game draws at the window's
     full size, and a late run is dozens of large, soft, additive layers
     over 4.8 million pixels. Nothing about any single layer was wrong; the
     screen was simply too big for the machine to repaint that often.

     So the renderer watches its own frame time. If frames run long for a
     sustained stretch it draws the next ones at a lower internal
     resolution - down to RS_MIN of the window's - and the canvas stretches
     that back to the window. Glows, fields and washes, which are most of
     the cost, look the same softened; edges get a little softer, which is
     far better than a slide show. When frames are comfortably fast again it
     climbs back, more slowly than it came down, so it does not flicker
     between the two. It only adapts during a run: a menu is never the
     reason a frame was slow.

     Every step down is a trial. Where the browser composites in software,
     stretching a smaller canvas back up to the window costs MORE than the
     pixels it saved - measured headless, 17ms frames became 22ms - and a
     rule that only ever reads "slow, so go lower" walks that machine down
     to the floor, slower at every step. So a lower resolution is kept only
     if frames actually got faster at it; if not, the renderer goes back to
     where it was and stops trying for the rest of the run.

     EFFECTS GO BEFORE PIXELS. The night's light (render/lighting.js) and air
     (render/atmosphere.js) are whole-screen passes, and on a machine that
     draws the canvas in software they cost a third of a frame between them
     - measured on Thornhollow's horde with the raster counted fairly, 52ms
     without them, 63ms with the light, 73ms with the bloom as well. A
     softer picture is a worse trade than a plainer one, so a slow stretch
     sheds those first, one rung at a time: the bloom, then the mist, then
     the light itself (R.shed, 0 to 3). Each rung is a trial like a
     resolution step, kept only if frames got faster; a rung that bought
     nothing is put back and the shedding stops, and resolution is tried
     next. What is shed stays shed until the run ends - putting the bloom
     back the moment frames recover is how a picture ends up flickering
     between two looks every few seconds. */
  const RS_MIN = 0.5, RS_SLOW = 24, RS_FAST = 15;
  const RS_TRIAL = 1500, RS_GAIN = 0.9;             // judge after 1.5s; keep only a 10% gain
  const RS_GRACE = 10;                              // seconds into a run before any of it
  const SHED_MAX = 3;
  R.renderScale = 1;
  R.shed = 0;
  R.adaptResolution = function (dtMs) {
    if (!(dtMs > 0) || dtMs > 250) return;          // tab switches and stalls say nothing
    if (WS.Save.settings.dynamicResolution === false) {
      // Turned off: back to full resolution at once, not on the next slow frame.
      if (this.renderScale !== 1) { this.renderScale = 1; this.resize(); }
      this._rsTrial = null;
      this.shed = 0;
      return;
    }
    if (!WS.Game.running) {
      this._rsSlow = this._rsFast = 0; this._rsTrial = null; this._rsLocked = false;
      this.shed = 0; this._shedLocked = false;
      return;
    }
    // The first seconds of a run are loading and settling, never the heavy
    // part of the night, and are no evidence about the machine.
    if (WS.Game.run && WS.Game.run.time < RS_GRACE) { this._rsSlow = this._rsFast = 0; this._rsAvg = 0; return; }
    this._rsAvg = this._rsAvg ? this._rsAvg * 0.9 + dtMs * 0.1 : dtMs;
    const trial = this._rsTrial;
    if (trial) {
      trial.left -= dtMs;
      if (trial.left > 0) return;
      this._rsTrial = null;
      if (this._rsAvg > trial.avg * RS_GAIN) {
        // it did not pay for itself: undo it, and do not try again this run
        if (trial.shed !== undefined) {
          this._shedLocked = true;
          this.shed = trial.shed;
          this._rsSlow = this._rsFast = 0; this._rsAvg = 0;
        } else {
          this._rsLocked = true;
          this.setRenderScale(trial.from);
        }
        return;
      }
    }
    if (this._rsAvg > RS_SLOW) { this._rsSlow = (this._rsSlow || 0) + dtMs; this._rsFast = 0; }
    else if (this._rsAvg < RS_FAST) { this._rsFast = (this._rsFast || 0) + dtMs; this._rsSlow = 0; }
    else { this._rsSlow = 0; this._rsFast = 0; }
    if (this._rsSlow > 1200 && this.shed < SHED_MAX && !this._shedLocked) {
      this._rsTrial = { shed: this.shed, avg: this._rsAvg, left: RS_TRIAL };
      this.shed++;
      this._rsSlow = this._rsFast = 0; this._rsAvg = 0;
    } else if (this._rsSlow > 1200 && this.renderScale > RS_MIN && !this._rsLocked) {
      this._rsTrial = { from: this.renderScale, avg: this._rsAvg, left: RS_TRIAL };
      this.setRenderScale(WS.max(RS_MIN, this.renderScale * 0.82));
    } else if (this._rsFast > 6000 && this.renderScale < 1) {
      this.setRenderScale(WS.min(1, this.renderScale * 1.1));
    }
  };
  R.setRenderScale = function (scale) {
    this.renderScale = scale;
    this._rsSlow = this._rsFast = 0;
    this._rsAvg = 0;
    this.resize();
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
    tree: 0.014, deadtree: 0.018, spire: 0.006, heather: 0.045,
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

    moor(g, c) {
      /* Highmoor: heather in wide dark-purple patches, peat showing through
         between them, pale granite breaking the surface, and sheep-trails
         worn across it all - the only paths on the field, and none of them
         goes anywhere in particular. */
      for (let p = 0; p < 26; p++) {
        const cx = WS.randRange(0, W), cy = WS.randRange(0, H), R = WS.randRange(60, 150);
        c.blob(g, cx, cy, R, '66,40,70', 0.22, 0.7, 0.6);
        for (let k = 0; k < 40; k++) {
          const a = WS.random() * WS.TAU, d = Math.sqrt(WS.random()) * R * 0.9;
          const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7;
          g.globalAlpha = WS.randRange(0.18, 0.4);
          g.fillStyle = WS.random() < 0.6 ? '#6e3f78' : '#8c5a8e';
          g.fillRect(x, y, 1.6, 1.6);
        }
      }
      // peat: the darker ground between, with standing water in the lowest
      for (let p = 0; p < 9; p++) {
        const cx = WS.randRange(0, W), cy = WS.randRange(0, H), R = WS.randRange(30, 70);
        c.blob(g, cx, cy, R, '12,10,12', 0.3, 0.55, 0.7);
        if (WS.random() < 0.5) {
          g.globalAlpha = 0.16; g.fillStyle = '#8ea4c8';
          g.beginPath(); g.ellipse(cx, cy, R * 0.45, R * 0.18, WS.randRange(-0.3, 0.3), 0, WS.TAU); g.fill();
          g.globalAlpha = 0.22; g.strokeStyle = '#c8d8f0'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(cx - R * 0.3, cy - R * 0.06); g.lineTo(cx + R * 0.1, cy - R * 0.1); g.stroke();
        }
      }
      // sheep-trails
      g.lineCap = 'round';
      for (let t = 0; t < 5; t++) {
        let x = WS.randRange(0, W), y = WS.randRange(0, H), a = WS.random() * WS.TAU;
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 18; s++) {
          a += WS.randRange(-0.35, 0.35);
          x += Math.cos(a) * 30; y += Math.sin(a) * 22;
          g.lineTo(x, y);
        }
        g.globalAlpha = 0.14; g.strokeStyle = '#8a7a6a'; g.lineWidth = 7; g.stroke();
        g.globalAlpha = 0.12; g.strokeStyle = '#0a0808'; g.lineWidth = 2; g.stroke();
      }
      // granite breaking the surface
      for (let i = 0; i < 30; i++) c.stone(g, WS.randRange(0, W), WS.randRange(0, H), WS.randRange(4, 11));
      // tussocks
      for (let i = 0; i < 180; i++) {
        const x = WS.random() * W, y = WS.random() * H;
        g.globalAlpha = WS.randRange(0.2, 0.4); g.strokeStyle = '#7a7a52'; g.lineWidth = 1;
        for (let k = -1; k <= 1; k++) {
          g.beginPath(); g.moveTo(x + k * 2, y); g.lineTo(x + k * 3.4, y - WS.randRange(4, 8)); g.stroke();
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
    hold(ctx);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = e.boss ? '#e2483d' : e.elite ? '#f5c56b' : '#c6483d';
    ctx.fillRect(x, y, w * pct, h);
    release(ctx);
  }

  /* SAVE AND RESTORE WITHOUT THE BROWSER'S STACK.
   *
   * ctx.save() makes a state object on Blink's heap every time, and the late
   * horde called it over 700 times a frame (a few per creature, per bolt, per
   * corpse). That heap is swept by the same full collection as the game's,
   * and it was the trigger for nearly all of them: with save and restore
   * stubbed out, a 25:00 horde ran 9 full collections where it had run 58,
   * and the simulation's p99 went from 11.5ms to 4.6ms.
   *
   * The per-object draws all start from the world transform drawFrame sets
   * up, so `hold` notes the few properties they change and `release` puts
   * those back and returns the transform to the world's with setTransform,
   * which allocates nothing. The world transform is mirrored here in plain
   * numbers as drawFrame builds it (WT). These are for drawing done at the
   * world transform only, and they nest (a few deep). */
  const WT = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  function wtSet(a, d) { WT.a = a; WT.b = 0; WT.c = 0; WT.d = d; WT.e = 0; WT.f = 0; }
  function wtTranslate(x, y) { WT.e += WT.a * x + WT.c * y; WT.f += WT.b * x + WT.d * y; }
  function wtScale(sx, sy) { WT.a *= sx; WT.b *= sx; WT.c *= sy; WT.d *= sy; }
  const HELD = 6;
  const hAlpha = new Float64Array(HELD), hOp = new Array(HELD).fill('source-over'),
    hFill = new Array(HELD).fill('#000'), hStroke = new Array(HELD).fill('#000'),
    hLine = new Float64Array(HELD);
  let held = 0;
  function hold(ctx) {
    if (R.checkWT) {   // a harness's check that the drawing really is at the world transform
      const m = ctx.getTransform();
      if (Math.abs(m.a - WT.a) + Math.abs(m.b - WT.b) + Math.abs(m.c - WT.c) + Math.abs(m.d - WT.d)
        + Math.abs(m.e - WT.e) + Math.abs(m.f - WT.f) > 1e-3) R.wtMiss = (R.wtMiss || 0) + 1;
      R.wtChecked = (R.wtChecked || 0) + 1;
    }
    const i = held++;
    hAlpha[i] = ctx.globalAlpha; hOp[i] = ctx.globalCompositeOperation;
    hFill[i] = ctx.fillStyle; hStroke[i] = ctx.strokeStyle; hLine[i] = ctx.lineWidth;
  }
  function release(ctx) {
    const i = --held;
    ctx.setTransform(WT.a, WT.b, WT.c, WT.d, WT.e, WT.f);
    ctx.globalAlpha = hAlpha[i];
    if (ctx.globalCompositeOperation !== hOp[i]) ctx.globalCompositeOperation = hOp[i];
    ctx.fillStyle = hFill[i]; ctx.strokeStyle = hStroke[i]; ctx.lineWidth = hLine[i];
  }
  R._wt = WT;   // read by a test harness to check the mirror against the canvas

  /* Gradients drawn in an object's own frame (translated and rotated to it)
     depend only on their colour and size, so they are made once and reused.
     A canvas gradient is a browser-side object, and the bolts alone made
     about 140 of them a frame in a late horde; with the props' shadows,
     300. They are cheap to make and not cheap to collect: they live on
     Blink's heap, which is swept by the same full collection as the game's,
     and the late horde ran one every twenty frames at 8-17ms each. Keys are
     two small integers, so a lookup allocates nothing. The cache is
     dropped if it ever grows past what a night's colours and sizes need. */
  const GRADS = new Map();
  let gradCount = 0;
  function gradRow(c, kind) {
    const k = (((c[0] * 255) | 0) * 65536 + ((c[1] * 255) | 0) * 256 + ((c[2] * 255) | 0)) * 8 + kind;
    let row = GRADS.get(k);
    if (row === undefined) {
      if (gradCount > 4000) { GRADS.clear(); gradCount = 0; }
      row = new Map(); GRADS.set(k, row);
    }
    return row;
  }
  function gq(v, step) { return Math.round(v / step); }

  /* The y-sorted draw list (drawFrame), carried from one frame to the next
     so it arrives nearly in order and the insertion sort is one pass. `_dq`
     marks what is on the field this frame, `_dk` what is already listed. */
  const DRAWS = [];
  let drawStamp = 0;
  function ySort(a) {
    for (let i = 1; i < a.length; i++) {
      const v = a[i], y = v.y;
      let j = i - 1;
      while (j >= 0 && a[j].y > y) { a[j + 1] = a[j]; j--; }
      a[j + 1] = v;
    }
  }

  /* ------------------------------------------------------ interpolation --
   * THE FRAME DRAWS BETWEEN TWO TICKS. The simulation steps at a fixed 60 a
   * second and the screen refreshes at whatever the monitor does - 120, 144,
   * 165 on most of the machines this ships to. Drawing the last tick as it
   * stands shows each position for two or three refreshes and then jumps:
   * motion that is smooth in the numbers judders on the glass. So each tick
   * begins by noting where every moving thing is, and the frame is drawn
   * `alpha` of the way from there to where the tick left it, alpha being how
   * far the clock has run into the next tick. It is one tick behind, which is
   * what every fixed-step game does; at 60 that is 16ms nobody can feel.
   *
   * The positions are swapped in for the draw and put back straight after,
   * so nothing the renderer calls can see anything but the drawn position,
   * and nothing outside it ever sees anything but the real one. A thing that
   * was not there when the tick began (a new spawn, a pool slot on its
   * second life) or that moved further than anything can walk in a tick (a
   * teleport, a reset) is drawn where it is. */
  let TICK = 0;
  const JUMP = 120;
  /* Each kind of thing has its own loop below, written out rather than shared.
     One function walking creatures, bolts, gems and the rest sees half a
     dozen object layouts at every line, and V8 then reads and writes their
     coordinates the slow way, as freshly boxed numbers: 57MB of garbage in
     ten seconds of the late horde, much of it kept just long enough to be
     promoted and swept by a full collection. Written once per kind, each
     loop sees one layout. The kinds are creatures, bolts (yours and
     theirs share a pool layout), gems, and the few odd ones together. */
  const ODD = () => [WS.Pickup.pool && WS.Pickup.pool.active, WS.Familiar.list];
  R.snapshot = function () {
    TICK++;
    const p = WS.Game.player;
    if (p) { p._px = p.x; p._py = p.y; p._ts = TICK; }
    const en = WS.Enemy.pool ? WS.Enemy.pool.active : NONE;
    for (let i = 0; i < en.length; i++) { const e = en[i]; e._px = e.x; e._py = e.y; e._ts = TICK; }
    const bo = WS.Projectile.bolts ? WS.Projectile.bolts.active : NONE;
    for (let i = 0; i < bo.length; i++) { const b = bo[i]; b._px = b.x; b._py = b.y; b._ts = TICK; }
    const ho = WS.Projectile.hostiles ? WS.Projectile.hostiles.active : NONE;
    for (let i = 0; i < ho.length; i++) { const b = ho[i]; b._px = b.x; b._py = b.y; b._ts = TICK; }
    const ge = WS.XP.pool ? WS.XP.pool.active : NONE;
    for (let i = 0; i < ge.length; i++) { const g = ge[i]; g._px = g.x; g._py = g.y; g._ts = TICK; }
    for (const list of ODD()) {
      if (!list) continue;
      for (let i = 0; i < list.length; i++) { const o = list[i]; o._px = o.x; o._py = o.y; o._ts = TICK; }
    }
    const orb = WS.Projectile.orbits;
    if (orb) for (let i = 0; i < orb.active.length; i++) { const o = orb.active[i]; o._pa = o.angle; o._ts = TICK; }
  };
  const NONE = [];
  // What was moved, by kind, so each is put back by its own loop too.
  const swapped = [], swappedEn = [], swappedBo = [], swappedGe = [], swappedOrb = [];
  function lerpIn(e, a) {
    if (e._ts !== TICK) return;
    const dx = e.x - e._px, dy = e.y - e._py;
    if (dx > JUMP || dx < -JUMP || dy > JUMP || dy < -JUMP) return;
    e._rx = e.x; e._ry = e.y;
    e.x = e._px + dx * a; e.y = e._py + dy * a;
    swapped.push(e);
  }
  /** Move everything to where it is drawn this frame. */
  R.lerpIn = function () {
    const G = WS.Game;
    if (!G.player || G.state === 'menu') return;
    // alpha 0 is not "nothing to do": it is "draw where the tick began".
    const a = WS.clamp(G.accumulator / WS.CONST.TICK_RATE, 0, 1);
    lerpIn(G.player, a);
    const en = WS.Enemy.pool ? WS.Enemy.pool.active : NONE;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (e._ts !== TICK) continue;
      const dx = e.x - e._px, dy = e.y - e._py;
      if (dx > JUMP || dx < -JUMP || dy > JUMP || dy < -JUMP) continue;
      e._rx = e.x; e._ry = e.y;
      e.x = e._px + dx * a; e.y = e._py + dy * a;
      swappedEn.push(e);
    }
    for (let k = 0; k < 2; k++) {
      const pool = k ? WS.Projectile.hostiles : WS.Projectile.bolts;
      const bo = pool ? pool.active : NONE;
      for (let i = 0; i < bo.length; i++) {
        const b = bo[i];
        if (b._ts !== TICK) continue;
        const dx = b.x - b._px, dy = b.y - b._py;
        if (dx > JUMP || dx < -JUMP || dy > JUMP || dy < -JUMP) continue;
        b._rx = b.x; b._ry = b.y;
        b.x = b._px + dx * a; b.y = b._py + dy * a;
        swappedBo.push(b);
      }
    }
    const ge = WS.XP.pool ? WS.XP.pool.active : NONE;
    for (let i = 0; i < ge.length; i++) {
      const g = ge[i];
      if (g._ts !== TICK) continue;
      const dx = g.x - g._px, dy = g.y - g._py;
      if (dx > JUMP || dx < -JUMP || dy > JUMP || dy < -JUMP) continue;
      g._rx = g.x; g._ry = g.y;
      g.x = g._px + dx * a; g.y = g._py + dy * a;
      swappedGe.push(g);
    }
    for (const list of ODD()) {
      if (!list) continue;
      for (let i = 0; i < list.length; i++) lerpIn(list[i], a);
    }
    const orb = WS.Projectile.orbits;
    if (orb) {
      for (let i = 0; i < orb.active.length; i++) {
        const o = orb.active[i];
        if (o._ts !== TICK) continue;
        o._ra = o.angle; o.angle = o._pa + (o.angle - o._pa) * a;
        swappedOrb.push(o);
      }
    }
  };
  /** And back to where they really are. */
  R.lerpOut = function () {
    for (let i = 0; i < swappedEn.length; i++) { const e = swappedEn[i]; e.x = e._rx; e.y = e._ry; }
    for (let i = 0; i < swappedBo.length; i++) { const b = swappedBo[i]; b.x = b._rx; b.y = b._ry; }
    for (let i = 0; i < swappedGe.length; i++) { const g = swappedGe[i]; g.x = g._rx; g.y = g._ry; }
    for (let i = 0; i < swapped.length; i++) { const o = swapped[i]; o.x = o._rx; o.y = o._ry; }
    for (let i = 0; i < swappedOrb.length; i++) { const o = swappedOrb[i]; o.angle = o._ra; o._ra = undefined; }
    swappedEn.length = 0; swappedBo.length = 0; swappedGe.length = 0; swapped.length = 0; swappedOrb.length = 0;
  };

  /* The dice are the simulation's. A frame drawn - a crackle, a jolt, a
     flicker - used to take its randomness from the same seeded stream the
     game plays from, and a machine drawing 144 frames a second spent it
     faster than one drawing 60, so the same seed played out a different
     night on each: a Nightly was not the same night for everyone. While a
     frame is drawn, WS.random (and randRange, randInt, pick and chance,
     which all go through it) is cosmetic; the stream is untouched. */
  const cosmetic = () => Math.random();
  R.draw = function (time) {
    const dice = WS.random;
    WS.random = cosmetic;
    this.lerpIn();
    try { this.drawFrame(time); } finally { this.lerpOut(); WS.random = dice; }
    this.warmOne();
  };

  /* FIRST SIGHT. A creature's sprite is painted the first time one is drawn,
     and painting one (outline pass, regalia) takes a whole frame's worth of
     time on a slow core: measured 10-14ms, so the moment a new kind of
     creature walked on was a dropped frame. The battlefield's whole cast is
     known when the run starts, so it is queued then (warmFor) and painted
     one sprite a frame, a few seconds' work spread thin, before any of them
     has arrived. */
  R._warm = [];
  R.warmFor = function (map) {
    const q = this._warm;
    q.length = 0;
    if (!map) return;
    const ids = new Set();
    for (const ph of map.phases || []) {
      for (const r of ph.roster || []) ids.add(r.id);
      if (ph.elite) ids.add(ph.elite);
    }
    for (const ev of map.events || []) if (ev.id) ids.add(ev.id);
    for (const b of map.bosses || []) if (b.id) ids.add(b.id);
    for (const id of ids) {
      const t = (WS.Bosses && WS.Bosses[id]) || (WS.Elites && WS.Elites[id]) || (WS.Enemies && WS.Enemies[id]);
      if (!t || t.machine || !t.art) continue;
      const size = t.radius * (WS.Bosses && WS.Bosses[id] ? 3.4 : 3.0) * (t.spriteScale || 1);
      q.push([t.art, t.tint, size, t.bossKit], [t.art, CHILLED, size, t.bossKit]);
    }
  };
  R.warmOne = function () {
    const job = this._warm.pop();
    if (job) WS.Sprites.creature(job[0], job[1], job[2], job[3]);
  };

  R.drawFrame = function (time) {
    const ctx = this.ctx;
    const game = WS.Game;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    // Letterbox surround: the Arclight void.
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    ctx.save();
    const tx = this.offsetX + WS.FX.shakeX * this.scale, ty = this.offsetY + WS.FX.shakeY * this.scale;
    ctx.translate(tx, ty);
    ctx.scale(this.scale, this.scale);
    // The same transform in numbers, for release() (see hold above).
    wtSet(this.dpr, this.dpr); wtTranslate(tx, ty); wtScale(this.scale, this.scale);
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    // The punch leans the field in toward the survivor (FX.punch).
    const punch = WS.FX.punchNow ? WS.FX.punchNow() : 0;
    if (punch > 0 && game.player) {
      const at = WS.FX.punchAt;
      const px = at ? at.x : game.player.x, py = at ? at.y : game.player.y;
      ctx.translate(px, py); ctx.scale(1 + punch, 1 + punch); ctx.translate(-px, -py);
      wtTranslate(px, py); wtScale(1 + punch, 1 + punch); wtTranslate(-px, -py);
    }

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
        hold(ctx);
        ctx.globalAlpha = p.alpha * sh;
        const r = p.size * 0.28;
        // Props never move, so the shadow's gradient is made once and kept.
        let grd = p._shade;
        if (!grd || p._shadeAt !== p.x + p.y * 8192 + p.size) {
          grd = ctx.createRadialGradient(p.x, p.y + p.size * 0.22, 0,
            p.x, p.y + p.size * 0.22, r);
          grd.addColorStop(0, 'rgba(0,0,0,.85)');
          grd.addColorStop(0.55, 'rgba(0,0,0,.45)');
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          p._shade = grd; p._shadeAt = p.x + p.y * 8192 + p.size;
        }
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(p.x + p.size * 0.05, p.y + p.size * 0.22, r, r * 0.42, 0, 0, WS.TAU);
        ctx.fill();
        release(ctx);
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
        hold(ctx);
        ctx.translate(p.x, foot);
        ctx.rotate(WS.sin(time * 0.9 + p.phase) * sway
          + WS.sin(time * 2.3 + p.phase * 1.7) * sway * 0.35);
        ctx.drawImage(sprite, -p.size / 2, -p.size * 0.72, p.size, p.size);
        release(ctx);
      } else {
        ctx.drawImage(sprite, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;

    /* ---- ground effects (zones, auras, arena hazards) -------------------- */
    this.drawZones(ctx, time);
    this.drawMoor(ctx, time);
    this.drawHazards(ctx, time);
    this.drawTelegraphs(ctx, time);
    this.drawPlayerMark(ctx, player, time);
    this.drawAuras(ctx, player, time);
    this.drawCallingGround(ctx, player, time);
    if (WS.Arena.active) this.drawArena(ctx, time);
    if (WS.Finale.stage !== 'idle') WS.FinaleArt.drawGround(ctx, time);
    else if (WS.Finale.marks.length) WS.FinaleArt.drawMarks(ctx, time);

    this.drawCorpses(ctx);
    this.drawAirdropGround(ctx, time);

    /* ---- gems and pickups ------------------------------------------------ */
    this.drawGems(ctx, time);
    this.drawPickups(ctx, time);

    /* ---- entities, y-sorted --------------------------------------------- */
    /* One list kept from frame to frame and put in order by insertion. The
       order hardly changes between two frames, so this is a pass over a list
       that is already sorted; Array.sort with a comparator was a fresh
       number boxed for every comparison, thousands a frame in a horde. */
    const draws = DRAWS, stamp = ++drawStamp;
    for (let i = 0; i < WS.Enemy.pool.count; i++) WS.Enemy.pool.active[i]._dq = stamp;
    for (let i = 0; i < WS.Familiar.list.length; i++) WS.Familiar.list[i]._dq = stamp;
    if (player.totems) for (let i = 0; i < player.totems.length; i++) player.totems[i]._dq = stamp;
    player._dq = stamp;
    // Keep last frame's order for whatever is still here...
    let n = 0;
    for (let i = 0; i < draws.length; i++) {
      const o = draws[i];
      if (o._dq === stamp && o._dk !== stamp) { o._dk = stamp; draws[n++] = o; }
    }
    draws.length = n;
    // ...and add what is new.
    const add = (o) => { if (o._dk !== stamp) { o._dk = stamp; draws.push(o); } };
    for (let i = 0; i < WS.Enemy.pool.count; i++) add(WS.Enemy.pool.active[i]);
    for (let i = 0; i < WS.Familiar.list.length; i++) add(WS.Familiar.list[i]);
    if (player.totems) for (let i = 0; i < player.totems.length; i++) add(player.totems[i]);
    add(player);
    ySort(draws);

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
      else if (e.kind && e.max) this.drawTotem(ctx, e, time);
      else if (e.spec) this.drawFamiliar(ctx, e, time);
      else this.drawEnemy(ctx, e, time);
    }
    this._shadowsDone = false;
    this.drawMark(ctx, player, time);

    /* ---- light ----------------------------------------------------------- */
    /* The night over everything that stands in it, and every light on the
       field against it (WS.Lighting). What is drawn from here on glows. */
    if (WS.Atmosphere) WS.Atmosphere.mist(ctx, this, time);
    if (WS.Lighting) WS.Lighting.apply(ctx, this, time);

    /* ---- air: bolts, orbits, beams -------------------------------------- */
    this.drawOrbits(ctx, player);
    this.drawBolts(ctx);
    this.drawBeams(ctx);

    if (WS.Finale.stage !== 'idle') WS.FinaleArt.drawAir(ctx, time);
    else if (WS.Finale.marks.length) WS.FinaleArt.drawMarksAir(ctx, time);

    /* ---- effects --------------------------------------------------------- */
    /* THE LIGHT BUDGET. Every flash and spark composites 'lighter', so they
       add: past a point a full late build is one white sheet, and the
       survivor, the creatures and the ground under them are all behind it.
       The systems that shed detail when busy (zones, bolts, orbits) do so one
       at a time; this is the whole frame's own light, weighed together, and
       past a threshold it is all turned down the same way - never below
       LIGHT_FLOOR, so a big build still looks like one. Warnings are drawn
       after it and are not in it. */
    {
      const bl = WS.Projectile.bolts ? WS.Projectile.bolts.count : 0;
      /* Fields count too: each is the size of a nova that never fades, and a
         late build keeps half a dozen down under the survivor - they were the
         one source of light the budget never weighed. */
      const zn = WS.Projectile.zones ? WS.Projectile.zones.count : 0;
      const load = WS.FX.flashes.count * 2 + WS.FX.particles.count * 0.25 + bl * 0.5 + zn * 6;
      R.lightDim = WS.clamp(1 - WS.max(0, load - LIGHT_EASY) / LIGHT_SPAN, LIGHT_FLOOR, 1);
    }
    this.drawFlashes(ctx);
    this.drawStrikes(ctx);
    this.drawParticles(ctx);
    // What the air carries: fireflies, dust, snow, wisps, drizzle.
    if (WS.Atmosphere) WS.Atmosphere.motes(ctx, this, time);
    // What can hurt you, stated again over your own light (drawWarnings).
    /* Bosses, asserted again over the light, for the same reason as the
       survivor below: in a full late fight the boss you are trying to read
       sat under a crowd and a wall of your own effects. Before the warnings,
       so a lane or a mark on the boss is still drawn over it; the finale's
       machines are the size of the field and are left where they are. */
    this._shadowsDone = true;
    for (let i = 0; i < WS.Enemy.pool.count; i++) {
      const e = WS.Enemy.pool.active[i];
      if (e.boss && !e.template.machine) this.drawEnemy(ctx, e, time);
    }
    this._shadowsDone = false;

    this.drawWarnings(ctx, time);

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

    // Edennil and the crate, in the air over everything on the field.
    this.drawAirdropSky(ctx, time);

    // What glows, glowing: taken from the finished field, before the numbers.
    if (WS.Lighting) {
      const d = this.dpr, s = this.scale;
      WS.Lighting.bloom(ctx, this, this.canvas, [(this.offsetX + WS.FX.shakeX * s) * d,
        (this.offsetY + WS.FX.shakeY * s) * d, W * s * d, H * s * d]);
    }

    this.drawTexts(ctx);

    ctx.restore();

    this.drawVignette(ctx);
    if (WS.FX.flashScreen) {
      const f = WS.FX.flashScreen;
      ctx.globalAlpha = WS.clamp(f.life / f.maxLife, 0, 1) * (R.calm() ? 0.25 : 1);
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
      const sprite = WS.Sprites.creature(c.art, c.tint, c.size, c.kit);
      const flip = c.facing > 0 ? -1 : 1;
      hold(ctx);
      if (c.style === 'topple') {
        // Over it goes, pivoting on its feet, away from the blow; gone as it lands.
        ctx.globalAlpha = 0.9 * (1 - t * t);
        const foot = c.y + c.size * 0.3;
        ctx.translate(c.x, foot);
        ctx.rotate(-flip * (1 - (1 - t) * (1 - t)) * 1.35);
        ctx.scale(flip, 1);
        ctx.drawImage(sprite, -c.size / 2, -c.size * 0.92, c.size, c.size);
      } else if (c.style === 'crumble') {
        // Straight down into itself, faster than a squash. (No grey filter:
        // ctx.filter per corpse is too slow for a field of the dead.)
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.translate(c.x, c.y + c.size * 0.3 * t);
        ctx.scale(flip * (1 + t * 0.15), WS.max(0.05, 1 - t * 0.9));
        ctx.drawImage(sprite, -c.size / 2, -c.size * 0.62, c.size, c.size);
      } else if (c.style === 'dissolve') {
        // Lifts and thins into light.
        ctx.globalAlpha = (1 - t) * 0.8;
        ctx.globalCompositeOperation = t > 0.25 ? 'lighter' : 'source-over';
        ctx.translate(c.x, c.y - c.size * 0.18 * t);
        const k = 1 - t * 0.45;
        ctx.scale(flip * k, k * (1 + t * 0.3));
        ctx.drawImage(sprite, -c.size / 2, -c.size * 0.62, c.size, c.size);
      } else if (c.style === 'burst') {
        // A jolt outward, then nothing: it came apart.
        ctx.globalAlpha = (1 - t) * (1 - t);
        ctx.translate(c.x, c.y);
        const k = 1 + t * 0.35;
        ctx.scale(flip * k, k);
        ctx.drawImage(sprite, -c.size / 2, -c.size * 0.62, c.size, c.size);
      } else {
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.translate(c.x, c.y + c.size * 0.18 * t);
        ctx.scale(flip * (1 + t * 0.3), 1 - t * 0.55);
        ctx.drawImage(sprite, -c.size / 2, -c.size * 0.62, c.size, c.size);
      }
      release(ctx);
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

  const RISE = 0.32;
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
      hold(ctx);
      ctx.globalAlpha = 0.55 + 0.2 * WS.sin(time * 3);
      ctx.strokeStyle = e.boss ? '#e05ad8' : '#f5c56b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.radius * 0.55, e.radius * 1.25, e.radius * 0.5, 0, 0, WS.TAU);
      ctx.stroke();
      release(ctx);
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
    hold(ctx);
    if (e.fade !== undefined && e.fade < 1) ctx.globalAlpha = e.fade;
    ctx.translate(e.x, e.y + bob);
    /* A creature that arrives where you can see it - a summon, a split, a
       swarm closing its ring - rises out of the ground over RISE seconds
       rather than appearing whole on one frame. From the feet up, so it is
       standing where it will be. Anything that arrived off-screen has
       finished rising long before it walks into view. */
    const born = WS.Game.run ? WS.Game.run.time - (e.bornAt || -9) : 9;
    if (born < RISE && !e.boss) {
      const k = WS.clamp(born / RISE, 0, 1);
      const ease = 1 - (1 - k) * (1 - k);
      ctx.globalAlpha *= 0.35 + 0.65 * ease;
      ctx.translate(0, size * 0.3 * (1 - ease));
      ctx.scale(1, 0.25 + 0.75 * ease);
    }
    /* THE ACTION LAYER. One cached picture per creature can still act:
       it lunges at you when its blow lands, kicks back when it looses a
       shot, flinches away from you when struck, leans into its stride as it
       walks, and a champion breathes while it waits. All of it transforms
       of the one sprite, from clocks the simulation sets and never reads. */
    if (!this.lite) {
      const pl = WS.Game.player;
      if (e.swing > 0) {
        const k = 1 - e.swing / 0.24, out = WS.sin(k * Math.PI);
        const reach = e.radius * (e.boss ? 0.35 : 0.55) * out;
        ctx.translate((e.swingDx || 0) * reach, (e.swingDy || 0) * reach);
        ctx.rotate((e.swingDx || 0) * 0.14 * out);
      }
      if (e.flinch > 0 && pl) {
        const k = e.flinch / 0.18, ax = e.x - pl.x, ay = e.y - pl.y, d = Math.hypot(ax, ay) || 1;
        const push = (e.boss ? 1.2 : 3.2) * k;
        ctx.translate(ax / d * push, ay / d * push);
        ctx.rotate((ax < 0 ? -1 : 1) * 0.09 * k * (e.boss ? 0.3 : 1));
      }
      if (e.recoil > 0) {
        const k = e.recoil / 0.2;
        ctx.scale(1 + 0.08 * k, 1 - 0.07 * k);
      }
      if (e.boss || e.elite) {
        const br = 1 + 0.018 * WS.sin(time * 2.1 + (e.spawnId || 0));
        ctx.scale(br, 2 - br);
      } else if (!(e.swing > 0) && !t.stationary) {
        // The waddle: a lean from foot to foot, on the step the bob already counts.
        ctx.rotate(WS.sin(e.bob * 0.5) * 0.06);
      }
    }
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
    release(ctx);
    /* Rotting (a ghoul's rake, Familiar): a few sick-green motes lifting off
       the body, so the creatures your weapons will hit harder can be seen. */
    if (e.rotTimer > 0) {
      const now = WS.Game.run ? WS.Game.run.time : 0;
      const fade = WS.clamp(e.rotTimer / 0.6, 0, 1);
      hold(ctx);
      ctx.fillStyle = '#9fe06a';
      for (let k = 0; k < 3; k++) {
        const ph = (now * 0.9 + k / 3 + (e.spawnId || 0) * 0.37) % 1;
        ctx.globalAlpha = 0.55 * fade * Math.sin(ph * Math.PI);
        const mx = e.x + Math.sin((k * 2.1 + now * 1.7)) * size * 0.28;
        const my = e.y + bob - size * (0.15 + ph * 0.55);
        ctx.fillRect(mx - 1.2, my - 1.2, 2.4, 2.4);
      }
      release(ctx);
    }

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
    if (t.ranged) {
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
      hold(ctx);
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
      release(ctx);
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

  /* THE SUMMONED, drawn as what they are (sprites.js, Sprites.familiar).
   *
   * They were their card glyphs, lit and bobbing. Now a spirit wolf gallops
   * on baked frames, a ghost of itself streaming behind it and motes of its
   * light lifting off its back, and a pounce lands as a bright bite on what
   * it struck; the pack's quarry wears their mark. A ghoul shambles in a pool
   * of its own rot, drips from the claws, and its rake sweeps a visible arc
   * the width of what it actually hits. Everything here is what the summon
   * is doing - nothing is decoration without a cause. */
  const FAM_TINT = { wolf: [0.70, 0.90, 1.00], ghoul: [0.55, 0.90, 0.40] };
  /* A frame's silhouette in one colour, cached per frame: laid round the
     ghoul a few pixels out, it is the rot's light on the edge of the body,
     and it is what lets a dark corpse be found on dark ground. */
  const silhouettes = new WeakMap();
  function silhouette(img, tint) {
    let c = silhouettes.get(img);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = WS.rgb(tint, 1);
    g.fillRect(0, 0, c.width, c.height);
    silhouettes.set(img, c);
    return c;
  }
  R.drawFamiliar = function (ctx, fam, time) {
    const wolf = fam.kind !== 'ghoul';
    const tint = FAM_TINT[fam.kind] || fam.spec.tint;
    // A ghoul's burst: rot thrown over the ground it reached.
    if (fam.burstAt) {
      const b = fam.burstAt, k = 1 - b.t / 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = WS.rgb(WS.mix(tint, [1, 1, 0.7], 0.3), 0.8 * (1 - k));
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * (0.5 + k * 0.5), b.r * (0.5 + k * 0.5) * 0.62, 0, 0, WS.TAU); ctx.stroke();
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, WS.rgb(tint, 0.35 * (1 - k)));
      g.addColorStop(1, WS.rgb(tint, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * 0.62, 0, 0, WS.TAU); ctx.fill();
      ctx.restore();
    }
    // Gone to rot: a small ring at the survivor's side counts it back.
    if (fam.down > 0) {
      const T = WS.Familiar.tuning, k = 1 - fam.down / T.ghoulRespawn;
      ctx.save();
      ctx.strokeStyle = WS.rgb(tint, 0.25); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(fam.x, fam.y + 8, 10, 5, 0, 0, WS.TAU); ctx.stroke();
      ctx.strokeStyle = WS.rgb(tint, 0.7);
      ctx.beginPath(); ctx.ellipse(fam.x, fam.y + 8, 10, 5, 0, -WS.PI / 2, -WS.PI / 2 + WS.TAU * k); ctx.stroke();
      ctx.restore();
      return;
    }
    const size = wolf ? 56 : 62;
    const sets = WS.Sprites.familiarFrames[wolf ? 'wolf' : 'ghoul'];
    const acting = fam.pounce > 0 && fam.pounceMax > 0;
    const k = acting ? 1 - fam.pounce / fam.pounceMax : 0;
    // The stride runs on distance covered, so it slows and speeds with them.
    fam.stride = (fam.stride || 0) + (fam.moved || 0) / (wolf ? 9 : 7);
    let pose, frame;
    if (acting) { pose = wolf ? 'pounce' : 'rake'; frame = WS.min(sets[pose] - 1, WS.floor(k * sets[pose])); }
    else { pose = wolf ? 'run' : 'walk'; frame = WS.floor(fam.stride) % sets[pose]; }
    const img = WS.Sprites.familiar(wolf ? 'wolf' : 'ghoul', tint, size, pose, frame);
    const flip = fam.facing > 0;              // drawn facing left
    const top = -size * (wolf ? 0.64 : 0.7);
    const lite = this.lite;

    if (wolf) {
      // The pack's mark on its quarry: one ring for the pack, drawn by the first wolf.
      const Q = WS.Familiar.quarry;
      if (Q && !Q._dead && fam === WS.Familiar.list.find((f) => f.kind !== 'ghoul') && WS.Familiar.list.some((f) => f.target === Q)) {
        const r = Q.radius * 1.5 + 6;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(Q.x, Q.y + Q.radius * 0.4);
        ctx.scale(1, 0.5);
        ctx.rotate(time * 1.4);
        ctx.strokeStyle = WS.rgb(tint, 0.55 + 0.2 * WS.sin(time * 6));
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.arc(0, 0, r, i * WS.TAU / 3, i * WS.TAU / 3 + 1.4); ctx.stroke();
        }
        ctx.restore();
      }
      // The trail: where it was a moment ago, fainter the further back.
      const tr = fam.trail || (fam.trail = []);
      if (!tr.length || time - tr[tr.length - 1].t > 0.035) {
        tr.push({ x: fam.x, y: fam.y, img, flip, t: time });
        if (tr.length > 5) tr.shift();
      }
      if (!lite) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < tr.length - 1; i++) {
          const q = tr[i];
          if (WS.dist2(q.x, q.y, fam.x, fam.y) < 16) continue;
          ctx.globalAlpha = 0.06 + 0.05 * i;
          ctx.save(); ctx.translate(q.x, q.y); if (q.flip) ctx.scale(-1, 1);
          ctx.drawImage(q.img, -size / 2, top, size, size);
          ctx.restore();
        }
        ctx.restore();
      }
      // Its light on the ground.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pool = ctx.createRadialGradient(fam.x, fam.y + 8, 0, fam.x, fam.y + 8, 30);
      pool.addColorStop(0, WS.rgb(tint, 0.28 + 0.06 * WS.sin(time * 5 + fam.bob)));
      pool.addColorStop(1, WS.rgb(tint, 0));
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.ellipse(fam.x, fam.y + 8, 30, 13, 0, 0, WS.TAU); ctx.fill();
      ctx.restore();
    } else {
      // The rot it stands in.
      const pool = ctx.createRadialGradient(fam.x, fam.y + 12, 0, fam.x, fam.y + 12, 28);
      pool.addColorStop(0, 'rgba(24,40,10,.55)');
      pool.addColorStop(0.6, WS.rgb(tint, 0.16 + 0.05 * WS.sin(time * 2 + fam.bob)));
      pool.addColorStop(1, WS.rgb(tint, 0));
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.ellipse(fam.x, fam.y + 12, 28, 11, 0, 0, WS.TAU); ctx.fill();
    }
    shadow(ctx, fam.x, fam.y + 12, wolf ? 14 : 16, 0.3);

    ctx.save();
    ctx.translate(fam.x, fam.y);
    if (flip) ctx.scale(-1, 1);
    // Rising: it claws up out of the ground, the ground hiding its legs.
    const rising = !wolf && fam.rise > 0;
    if (rising) {
      const k = 1 - fam.rise / 0.5;
      // the ground line is a little below its feet; nothing below it shows
      ctx.beginPath(); ctx.rect(-size, top - size, size * 2, 14 - (top - size)); ctx.clip();
      ctx.translate(0, (1 - k) * size * 0.55);
    }
    if (!wolf) {
      const sil = silhouette(img, tint);
      ctx.globalCompositeOperation = 'lighter';
      // Charging, the rot in it burns: it is about to go.
      ctx.globalAlpha = fam.charge ? 0.7 + 0.25 * WS.sin(time * 18) : 0.32 + 0.1 * WS.sin(time * 2.5 + fam.bob);
      for (const [dx, dy] of [[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6]]) ctx.drawImage(sil, -size / 2 + dx, top + dy, size, size);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(img, -size / 2, top, size, size);
    if (wolf) {
      // A spirit gives light: its own shape again, added, soft.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 + 0.08 * WS.sin(time * 7 + fam.bob);
      ctx.drawImage(img, -size / 2 - 1, top - 1, size + 2, size + 2);
    }
    ctx.restore();

    if (!lite) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const seed = fam.bob * 3.7;
      if (wolf) {
        // Motes of it lifting off its back.
        for (let i = 0; i < 4; i++) {
          const t = (time * 0.9 + i / 4 + seed) % 1;
          const back = (flip ? -1 : 1) * (6 + t * 12);
          const x = fam.x + back + WS.sin(time * 3 + i * 2) * 3, y = fam.y - 18 - t * 20;
          ctx.fillStyle = WS.rgb(WS.mix(tint, [1, 1, 1], 0.5), (1 - t) * 0.7);
          ctx.beginPath(); ctx.arc(x, y, 2.4 * (1 - t) + 0.6, 0, WS.TAU); ctx.fill();
        }
      } else {
        // Rot dripping off the claws.
        for (let i = 0; i < 2; i++) {
          const t = (time * 1.3 + i * 0.5 + seed) % 1;
          const x = fam.x + (flip ? 1 : -1) * (10 + i * 5), y = fam.y + 2 + t * 14;
          ctx.fillStyle = WS.rgb(tint, (1 - t) * 0.8);
          ctx.beginPath(); ctx.ellipse(x, y, 1.4, 2.2, 0, 0, WS.TAU); ctx.fill();
        }
      }
      ctx.restore();
    }

    // The blow, where it landed.
    if (acting) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fade = 1 - k;
      if (wolf && fam.hitX !== undefined) {
        // a bite: two toothed jaws snapping shut on the thing
        const open = (1 - k) * 7, r = 11;
        ctx.strokeStyle = WS.rgb(WS.mix(tint, [1, 1, 1], 0.6), 0.9 * fade);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 2.4;
        for (const side of [-1, 1]) {
          const cy = fam.hitY + side * (open + 2) - side * r;
          const a0 = side < 0 ? WS.PI * 0.28 : WS.PI * 1.28, a1 = side < 0 ? WS.PI * 0.72 : WS.PI * 1.72;
          ctx.beginPath(); ctx.arc(fam.hitX, cy, r, a0, a1); ctx.stroke();
          for (let i = 0; i < 3; i++) {
            const a = a0 + (a1 - a0) * (0.2 + i * 0.3);
            const x = fam.hitX + WS.cos(a) * r, y = cy + WS.sin(a) * r;
            ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x, y - side * 4.5); ctx.lineTo(x + 2, y); ctx.closePath(); ctx.fill();
          }
        }
      } else if (!wolf) {
        // the rake: three claw lines sweeping across the ground it covers
        const T = WS.Familiar.tuning, pl = WS.Game.player;
        const r = T.biteRadius * T.ghoulRadiusMult * (pl ? pl.areaMultiplier : 1);
        const dir = flip ? 0 : WS.PI;
        const a0 = dir - 1.1, a1 = dir - 1.1 + 2.2 * WS.min(1, k * 1.4);
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = WS.rgb(WS.mix(tint, [1, 1, 0.7], 0.35), (0.7 - i * 0.15) * fade);
          ctx.lineWidth = 3.2 - i * 0.7;
          ctx.beginPath();
          ctx.ellipse(fam.x, fam.y, r * (0.72 + i * 0.12), r * (0.72 + i * 0.12) * 0.62, 0,
            flip ? a0 : WS.TAU - a1, flip ? a1 : WS.TAU - a0);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
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
    // Slipped from sight (Opportunist): a shade of themselves, steady, not a flicker.
    if (p.vanishTimer > 0) ctx.globalAlpha = 0.3;
    else if (p.invulnerable > 0 && !pose && !(p.divineTimer > 0)) {
      ctx.globalAlpha = (WS.floor(p.invulnerable * 12) % 2 === 0) ? 0.45 : 0.95;
    }
    ctx.translate(p.x, p.y + bob);
    /* The whirl turns him about his own spine, not his navel. It used to
       rotate the whole figure in the plane of the screen at two turns a
       second, so for the length of every Axe Gyre the survivor cartwheeled -
       sideways, then upside down, then sideways again. A pirouette is the
       figure narrowing to its edge and opening again the other way round;
       never thinner than a fifth of itself, so it never blinks out. */
    // A shape does not pirouette - it just turns to face you.
    if (p.spinTimer > 0 && !(p.formTimer > 0)) {
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
    /* The cast: a short lunge into it, a lift and settle, so the shot comes
       from someone and not from a point (Weapon.fire sets castT). */
    if (p.castT > 0 && !pose) {
      const k = WS.sin((1 - p.castT / 0.16) * Math.PI);
      ctx.translate(2.2 * k, -1.2 * k);
      ctx.scale(1 + 0.035 * k, 1 - 0.03 * k);
    }
    /* A SHAPE IS DRAWN INSTEAD OF THE SURVIVOR, not over them: for as long as
       it holds they ARE a bear or an owlbear, bigger than they were, and only
       their colour stays - a fifth of it, mixed into the hide or the feathers.
       Creature art faces left and the survivor faces right, so the shape
       takes the opposite flip; and it stands on the same feet. */
    const shaped = p.formTimer > 0 && !dying;
    let sprite;
    if (shaped) {
      const bear = p.form === 'bear';
      const tint = WS.mix(bear ? [0.52, 0.34, 0.20] : [0.46, 0.40, 0.64], p.character.color, 0.18);
      const fs = WS.round(size * 1.28);
      /* The bear walks on four legs, baked frame by frame; it takes
         three strides to the survivor's five, a heavier gait, and the
         frames already carry its rise and fall. The owlbear, upright,
         still heaves as a whole. */
      let art = bear ? 'bearform' : 'owlbearform';
      if (bear && p.moving) {
        const n = WS.Sprites.bearStride;
        art = 'bearform_w' + WS.floor(((p.walkCycle * 0.6 / WS.TAU) % 1 + 1) % 1 * n);
      }
      sprite = WS.Sprites.creature(art, tint, fs);
      ctx.scale(-1, 1);
      const heave = p.moving ? (bear ? 0 : WS.abs(WS.sin(p.walkCycle * 0.5)) * 2.4) : WS.sin(time * 2) * 1;
      ctx.drawImage(sprite, -fs / 2, -fs * 0.72 - heave, fs, fs);
    } else {
      sprite = WS.Sprites.hero(p.characterId, p.character.color, size, demon, frame, pose,
        WS.Player.rank(p));
      ctx.drawImage(sprite, -size / 2, -size * 0.66, size, size);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    /* A step leaves what the eye last saw of them strung out along the way
       they went: three fading after-images and a line of disturbed air. */
    const tr = p.dashTrail;
    if (tr && !shaped) {
      const k = tr.life / tr.max;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(200,236,255,${(0.5 * k).toFixed(3)})`;
      ctx.lineWidth = 10 * k; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tr.x0, tr.y0 - 24); ctx.lineTo(tr.x1, tr.y1 - 24); ctx.stroke();
      ctx.restore();
      for (let n = 1; n <= 3; n++) {
        const f = n / 4;
        ctx.save();
        ctx.globalAlpha = 0.34 * k * (1 - f * 0.5);
        ctx.translate(tr.x0 + (tr.x1 - tr.x0) * f, tr.y0 + (tr.y1 - tr.y0) * f);
        if (p.facing < 0) ctx.scale(-1, 1);
        ctx.drawImage(sprite, -size / 2, -size * 0.66, size, size);
        ctx.restore();
      }
    }
    if (shaped) {
      const bear = p.form === 'bear';
      const pulse = 62 + 6 * WS.sin(time * 5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grd = ctx.createRadialGradient(p.x, p.y - 10, 8, p.x, p.y - 10, pulse);
      grd.addColorStop(0, bear ? 'rgba(230,160,90,.22)' : 'rgba(170,150,255,.26)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(p.x, p.y - 10, pulse, 0, WS.TAU); ctx.fill();
      ctx.restore();
    }

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
    this.drawCallingOn(ctx, p, time);
  };

  /* ------------------------------------------------------- the callings - */
  /** What a calling looks like ON the survivor: the barrier as a shell of
   *  light as thick as it is full, the Flood tide as an arcane corona,
   *  Seething Blood as a red heat, the Aegis as a gold dome. */
  R.drawCallingOn = function (ctx, p, time) {
    const cx = p.x, cy = p.y - 16;
    const glow = (r, inner, outer) => {
      const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, r);
      g.addColorStop(0, inner); g.addColorStop(1, outer);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, WS.TAU); ctx.fill();
    };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (p.surgeTimer > 0) glow(56 + 6 * WS.sin(time * 10), 'rgba(170,140,255,.34)', 'rgba(170,140,255,0)');
    if (p.enrageTimer > 0) glow(60 + 8 * WS.sin(time * 12), 'rgba(255,70,40,.32)', 'rgba(255,70,40,0)');
    else if (p.rage > 0) glow(40, `rgba(255,70,40,${(0.16 * p.rage / WS.Config.rageNeed).toFixed(3)})`, 'rgba(255,70,40,0)');
    if (p.soulAttuned > 0 && p.souls >= WS.Calling.soulNeed() * 0.5) glow(46, 'rgba(160,90,230,.2)', 'rgba(160,90,230,0)');
    ctx.restore();
    if (p.barrier > 0) {
      const k = WS.clamp(p.barrier / WS.max(1, WS.Calling.barrierCap(p)), 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.5 * k;
      ctx.strokeStyle = '#ffe9b0';
      ctx.lineWidth = 1 + 2.5 * k;
      ctx.beginPath(); ctx.ellipse(cx, cy + 4, 30, 38, 0, 0, WS.TAU); ctx.stroke();
      ctx.globalAlpha = 0.08 + 0.1 * k;
      ctx.fillStyle = '#fff2c8'; ctx.fill();
      ctx.restore();
    }
    if (p.divineTimer > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(52, 'rgba(255,220,130,.45)', 'rgba(255,220,130,0)');
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy + 6, 40, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.restore();
    }
  };

  /** Waystone auras on the ground: a ring each, in the kind's colour. */
  R.drawCallingGround = function (ctx, p, time) {
    /* The Spring's rain: pools of it on the ground, rippling, a bright rim
       while you stand in one. Drawn before the stones' rings so a pool reads
       as water on the ground, not another aura. */
    if (p.pools && p.pools.length) {
      const pr = WS.Config.springPoolRadius * p.areaMultiplier;
      const c = WS.Calling.TOTEM_COL.healing;
      ctx.save();
      for (const q of p.pools) {
        const fade = WS.min(1, q.life / 0.5, (q.max - q.life) / 0.25);
        const inside = WS.dist2(q.x, q.y, p.x, p.y) <= pr * pr;
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, pr);
        g.addColorStop(0, WS.rgb(c, 0.28 * fade));
        g.addColorStop(0.75, WS.rgb(c, 0.16 * fade));
        g.addColorStop(1, WS.rgb(c, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(q.x, q.y, pr, pr * 0.62, 0, 0, WS.TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = WS.rgb(WS.mix(c, [1, 1, 1], 0.4), (inside ? 0.8 : 0.4) * fade);
        ctx.lineWidth = inside ? 2.2 : 1.4;
        ctx.beginPath(); ctx.ellipse(q.x, q.y, pr, pr * 0.62, 0, 0, WS.TAU); ctx.stroke();
        // a ripple running out from where the drop fell
        const k = ((q.max - q.life) * 1.4) % 1;
        ctx.strokeStyle = WS.rgb(WS.mix(c, [1, 1, 1], 0.6), 0.45 * (1 - k) * fade);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(q.x, q.y, pr * k, pr * k * 0.62, 0, 0, WS.TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }
    if (!p.totems || !p.totems.length) return;
    const r = WS.Calling.totemReach(p);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const t of p.totems) {
      const c = WS.Calling.TOTEM_COL[t.kind];
      const fade = WS.min(1, t.life / 0.6, (t.max - t.life) / 0.3 + 0.2);
      const rgb = `${WS.floor(c[0] * 255)},${WS.floor(c[1] * 255)},${WS.floor(c[2] * 255)}`;
      const g = ctx.createRadialGradient(t.x, t.y, r * 0.2, t.x, t.y, r);
      g.addColorStop(0, `rgba(${rgb},${(0.05 * fade).toFixed(3)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(t.x, t.y, r, r * 0.8, 0, 0, WS.TAU); ctx.fill();
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -time * 20;
      ctx.strokeStyle = `rgba(${rgb},${(0.4 * fade).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(t.x, t.y, r, r * 0.8, 0, 0, WS.TAU); ctx.stroke();
    }
    ctx.restore();
  };

  /** A waystone: a carved post with its kind's crown. */
  /* THE WAYSTONES. Three standing stones, each one plainly what it does
     from across the field: the ember stone carries an iron brazier and its
     fire, the spring stone a basin that spills down its face into a pool,
     the gale stone a hole the wind has bored through it, with the wind still
     going round. Each is carved with its own rune, lit in its colour.
     The stone is painted once per kind into a cache (waystoneArt) and only
     the fire, the water, the wind and the rune's pulse are drawn live. They
     used to be a brown plank with two triangles on top, which read as a
     ladder, not a stone. */
  const WS_SCALE = 3, WS_W = 44, WS_H = 74, WS_FOOT = 66;   // local units; foot line
  const waystoneCache = {};
  function waystoneArt(kind) {
    if (waystoneCache[kind]) return waystoneCache[kind];
    const make = (fn) => {
      const c = document.createElement('canvas');
      c.width = WS_W * WS_SCALE; c.height = WS_H * WS_SCALE;
      const g = c.getContext('2d');
      g.scale(WS_SCALE, WS_SCALE);
      fn(g);
      return c;
    };
    const col = WS.Calling.TOTEM_COL[kind];
    const cx = WS_W / 2;
    const shape = (g) => {
      g.beginPath();
      g.moveTo(cx - 12, WS_FOOT); g.lineTo(cx - 9.5, 24); g.lineTo(cx - 6.5, 13);
      g.lineTo(cx - 1, 9.5); g.lineTo(cx + 5.5, 12); g.lineTo(cx + 9, 23); g.lineTo(cx + 12.5, WS_FOOT);
      g.closePath();
    };
    // The rune for each kind, as a path centred on the stone's face.
    const rune = (g) => {
      g.beginPath();
      if (kind === 'searing') {            // a flame over a hearth line
        g.moveTo(cx, 30); g.quadraticCurveTo(cx + 5, 37, cx + 1.5, 43); g.quadraticCurveTo(cx + 0.5, 39, cx - 1.5, 38);
        g.quadraticCurveTo(cx - 4, 41, cx - 2, 44.5); g.quadraticCurveTo(cx - 6, 40, cx, 30);
        g.moveTo(cx - 5, 48); g.lineTo(cx + 5, 48);
      } else if (kind === 'healing') {     // a drop over two waves
        g.moveTo(cx, 29); g.quadraticCurveTo(cx + 5, 36, cx, 39.5); g.quadraticCurveTo(cx - 5, 36, cx, 29);
        g.moveTo(cx - 6, 44); g.quadraticCurveTo(cx - 3, 42, cx, 44); g.quadraticCurveTo(cx + 3, 46, cx + 6, 44);
        g.moveTo(cx - 6, 49); g.quadraticCurveTo(cx - 3, 47, cx, 49); g.quadraticCurveTo(cx + 3, 51, cx + 6, 49);
      } else {                              // a spiral, the wind turning
        g.moveTo(cx + 0.5, 39);
        for (let a = 0; a < Math.PI * 3.2; a += 0.25) {
          const r = 0.6 + a * 1.35;
          g.lineTo(cx + 0.5 + Math.cos(a) * r, 39 + Math.sin(a) * r * 1.1);
        }
      }
    };
    const body = make((g) => {
      // Rubble and moss at the foot, so it stands IN the ground.
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath(); g.ellipse(cx, WS_FOOT + 1, 16, 4.5, 0, 0, WS.TAU); g.fill();
      // The stone: lit from the left, falling to shade on the right.
      shape(g);
      const sg = g.createLinearGradient(cx - 12, 0, cx + 12, 0);
      sg.addColorStop(0, '#9aa0a4'); sg.addColorStop(0.45, '#6c7277'); sg.addColorStop(1, '#3b3f45');
      g.fillStyle = sg; g.fill();
      // Its right face, turned from the light.
      g.save(); shape(g); g.clip();
      g.fillStyle = 'rgba(8,10,16,.28)';
      g.beginPath(); g.moveTo(cx + 1.5, 9); g.lineTo(cx + 3, 24); g.lineTo(cx + 4.5, WS_FOOT); g.lineTo(cx + 16, WS_FOOT); g.lineTo(cx + 16, 9); g.fill();
      // Weathering: darker toward the ground, pale lichen flecks, cracks.
      const dg = g.createLinearGradient(0, 30, 0, WS_FOOT);
      dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(1, 'rgba(10,14,12,.45)');
      g.fillStyle = dg; g.fillRect(0, 0, WS_W, WS_H);
      g.fillStyle = 'rgba(190,200,170,.22)';
      for (const [x, y, r] of [[-6, 20, 1.3], [-3, 55, 1.1], [5, 30, 0.9], [-7, 44, 0.8], [6, 58, 1.2]]) {
        g.beginPath(); g.arc(cx + x, y, r, 0, WS.TAU); g.fill();
      }
      g.strokeStyle = 'rgba(12,14,18,.55)'; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(cx - 8, 26); g.lineTo(cx - 5, 31); g.lineTo(cx - 6.5, 35);
      g.moveTo(cx + 7, 52); g.lineTo(cx + 4.5, 56); g.lineTo(cx + 6, 61); g.stroke();
      g.restore();
      // A lit left edge and a dark outline, one line round the whole stone.
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(cx - 11.3, WS_FOOT - 2); g.lineTo(cx - 9, 24); g.lineTo(cx - 6, 13.5); g.stroke();
      shape(g); g.strokeStyle = 'rgba(6,8,12,.9)'; g.lineWidth = 1.1; g.stroke();
      // Moss round the foot.
      g.fillStyle = '#3f5a2f';
      for (const [x, r] of [[-10, 3.2], [-6, 2.4], [8.5, 2.8], [11, 2]]) {
        g.beginPath(); g.ellipse(cx + x, WS_FOOT - 0.5, r, r * 0.7, 0, Math.PI, WS.TAU); g.fill();
      }
      // The rune, cut into the face.
      rune(g);
      g.strokeStyle = 'rgba(10,10,14,.75)'; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
      // The crown, by kind.
      if (kind === 'searing') {
        // An iron brazier: a bowl on three short legs, riveted.
        g.fillStyle = '#2a2a2e';
        g.beginPath(); g.moveTo(cx - 9, 3.5); g.lineTo(cx + 8, 3.5); g.lineTo(cx + 5, 9.5); g.lineTo(cx - 6, 9.5); g.closePath(); g.fill();
        g.strokeStyle = '#6b6258'; g.lineWidth = 0.8; g.stroke();
        g.fillStyle = '#8a7a66';
        for (const x of [-5, -0.5, 4]) { g.beginPath(); g.arc(cx + x, 6.3, 0.7, 0, WS.TAU); g.fill(); }
        g.fillStyle = '#ff8a3a';
        g.beginPath(); g.ellipse(cx - 0.5, 3.6, 8, 1.6, 0, 0, WS.TAU); g.fill();
      } else if (kind === 'healing') {
        // A basin cut into the crown, brimming.
        g.fillStyle = '#7b8186';
        g.beginPath(); g.ellipse(cx - 0.5, 9.5, 8.5, 3.2, 0, 0, WS.TAU); g.fill();
        g.strokeStyle = 'rgba(6,8,12,.9)'; g.lineWidth = 1; g.stroke();
        g.fillStyle = WS.rgb(col, 0.95);
        g.beginPath(); g.ellipse(cx - 0.5, 9.3, 6.5, 2.1, 0, 0, WS.TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,.6)';
        g.beginPath(); g.ellipse(cx - 2.5, 8.8, 2.2, 0.6, 0, 0, WS.TAU); g.fill();
      } else {
        // The hole the wind wore through it.
        g.fillStyle = '#15171c';
        g.beginPath(); g.ellipse(cx - 0.5, 17, 3.6, 4.4, 0, 0, WS.TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 0.8;
        g.beginPath(); g.ellipse(cx - 0.5, 17, 3.6, 4.4, 0, Math.PI * 0.9, Math.PI * 1.9); g.stroke();
      }
    });
    // The rune again, alone, lit - laid over the carving with 'lighter'.
    const glow = make((g) => {
      rune(g);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = WS.rgb(col, 0.35); g.lineWidth = 4.5; g.stroke();
      g.strokeStyle = WS.rgb(col, 1); g.lineWidth = 1.5; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 0.6; g.stroke();
    });
    return (waystoneCache[kind] = { body, glow });
  }

  R.drawTotem = function (ctx, t, time) {
    const c = WS.Calling.TOTEM_COL[t.kind];
    const art = waystoneArt(t.kind);
    const rise = WS.min(1, (t.max - t.life) / 0.3);
    const fade = WS.min(1, t.life / 0.6);
    const ease = 1 - (1 - rise) * (1 - rise);
    const ox = t.x - WS_W / 2, oy = t.y - WS_FOOT + (1 - ease) * (WS_FOOT - 4);   // top-left of the art
    const seed = t.x * 0.37;
    ctx.save();
    ctx.globalAlpha = fade;
    // It rises out of the ground: nothing below the foot line is drawn.
    ctx.beginPath(); ctx.rect(t.x - 40, t.y - 120, 80, 120 + 3); ctx.clip();

    // Light on the ground round the foot, in the stone's colour.
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(t.x, t.y, 2, t.x, t.y, 30);
    gl.addColorStop(0, WS.rgb(c, 0.28 * ease)); gl.addColorStop(1, WS.rgb(c, 0));
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.ellipse(t.x, t.y, 30, 11, 0, 0, WS.TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.drawImage(art.body, ox, oy, WS_W, WS_H);
    // The rune breathes.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade * (0.6 + 0.3 * WS.sin(time * 3 + seed)) * ease;
    ctx.drawImage(art.glow, ox, oy, WS_W, WS_H);
    ctx.globalAlpha = fade;
    const cx = t.x - 0.5;

    if (t.kind === 'searing' && rise > 0.8) {
      // The fire in the brazier: three tongues, flickering out of step.
      const by = oy + 3.2;
      const tongue = (dx, h, w, colour) => {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(cx + dx - w, by);
        ctx.quadraticCurveTo(cx + dx - w * 0.9, by - h * 0.55, cx + dx + WS.sin(time * 9 + dx) * 1.2, by - h);
        ctx.quadraticCurveTo(cx + dx + w * 0.9, by - h * 0.55, cx + dx + w, by);
        ctx.fill();
      };
      const f = (k) => 1 + 0.18 * WS.sin(time * 11 + seed + k * 2.1) + 0.1 * WS.sin(time * 17 + k);
      tongue(-4.5, 12 * f(0), 3.6, 'rgba(255,100,35,.85)');
      tongue(4, 11 * f(1), 3.6, 'rgba(255,100,35,.85)');
      tongue(0, 18 * f(2), 5.5, 'rgba(255,145,45,.92)');
      tongue(0, 11 * f(3), 3.2, 'rgba(255,225,140,.95)');
      // Its light on the stone and the air above.
      ctx.globalCompositeOperation = 'lighter';
      const fl = ctx.createRadialGradient(cx, by - 5, 1, cx, by - 5, 20);
      fl.addColorStop(0, WS.rgb(c, 0.45)); fl.addColorStop(1, WS.rgb(c, 0));
      ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(cx, by - 5, 20, 0, WS.TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // Sparks going up.
      ctx.fillStyle = 'rgba(255,200,120,.9)';
      for (let k = 0; k < 4; k++) {
        const u = ((time * 0.9 + k * 0.27 + seed) % 1 + 1) % 1;
        ctx.globalAlpha = fade * (1 - u);
        ctx.fillRect(cx + WS.sin(k * 3.1 + time * 2) * 5, by - 10 - u * 22, 1.3, 1.3);
      }
      ctx.globalAlpha = fade;
    } else if (t.kind === 'healing' && rise > 0.8) {
      // Water over the lip and down the face, light running with it.
      const top = oy + 11, foot = t.y - 1;
      ctx.strokeStyle = WS.rgb(c, 0.55); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + 5.5, top); ctx.quadraticCurveTo(cx + 7.5, top + 18, cx + 8.5, foot); ctx.stroke();
      ctx.strokeStyle = 'rgba(235,255,250,.8)'; ctx.lineWidth = 0.9;
      ctx.setLineDash([2, 7]); ctx.lineDashOffset = -time * 30;
      ctx.beginPath(); ctx.moveTo(cx + 5.5, top); ctx.quadraticCurveTo(cx + 7.5, top + 18, cx + 8.5, foot); ctx.stroke();
      ctx.setLineDash([]);
      // Rings spreading where it meets the ground.
      for (let k = 0; k < 2; k++) {
        const u = ((time * 0.8 + k * 0.5 + seed) % 1 + 1) % 1;
        ctx.strokeStyle = WS.rgb(c, 0.6 * (1 - u)); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx + 8.5, foot + 1, 3 + u * 11, (3 + u * 11) * 0.35, 0, 0, WS.TAU); ctx.stroke();
      }
    } else if (t.kind === 'windfury' && rise > 0.8) {
      // The wind, going round the stone: two streaks on an orbit that
      // passes behind it and in front.
      const oyc = oy + 22;
      for (let k = 0; k < 2; k++) {
        const a0 = time * 3.4 + k * Math.PI + seed;
        ctx.strokeStyle = WS.rgb(c, 0.85); ctx.lineCap = 'round';
        for (let s = 0; s < 7; s++) {
          const a = a0 - s * 0.26;
          const front = WS.sin(a) > 0;
          ctx.globalAlpha = fade * (1 - s / 7) * (front ? 1 : 0.4);
          ctx.lineWidth = 2.4 - s * 0.28;
          ctx.beginPath();
          ctx.ellipse(cx, oyc + k * 13, 18, 6, -0.15, a - 0.3, a);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = fade;
      // And a small gleam through the hole.
      const hg = ctx.createRadialGradient(cx, oy + 17, 0, cx, oy + 17, 6);
      hg.addColorStop(0, 'rgba(230,245,255,.8)'); hg.addColorStop(1, WS.rgb(c, 0));
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, oy + 17, 6, 0, WS.TAU); ctx.fill();
    }
    ctx.restore();
  };

  /** The Quarry: a turning reticle over it. */
  R.drawMark = function (ctx, p, time) {
    const e = p.markTarget;
    if (!e || e._dead) return;
    const r = e.radius + 14;
    const y = e.y - e.radius * 0.4;
    ctx.save();
    ctx.translate(e.x, y);
    ctx.rotate(time * 1.2);
    ctx.strokeStyle = 'rgba(255,207,106,.9)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath(); ctx.arc(0, 0, r, k * Math.PI / 2 + 0.25, k * Math.PI / 2 + Math.PI / 2 - 0.25); ctx.stroke();
    }
    ctx.rotate(-time * 2.4);
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 7), Math.sin(a) * (r - 7));
      ctx.lineTo(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6)); ctx.stroke();
    }
    ctx.restore();
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
  /* DANGER, IN TWO PALETTES. The Watch's own reds and oranges, or - for
     anyone who cannot tell a red telegraph from green ground - Vivid, which
     paints every threat in one hot magenta that no colour-vision type
     confuses with the grass, the gems or the healing. Shapes, hatching and
     rails stay exactly as they are; only the colour moves. */
  const DANGER = {
    ember: { deep: '226,72,61', mid: '255,120,100', rim: '255,140,120', hatch: '255,150,120', edge: '255,140,110' },
    vivid: { deep: '214,34,186', mid: '255,84,226', rim: '255,176,246', hatch: '255,150,240', edge: '255,190,248' },
  };
  R.vivid = () => WS.Save.settings.dangerPalette === 'vivid';
  R.danger = () => DANGER[R.vivid() ? 'vivid' : 'ember'];
  R.VIVID = [1.0, 0.3, 0.88];
  /** Flashes and strobes, softened when the player has asked for that. */
  R.calm = () => !!WS.Save.settings.reduceFlashes;

  /* ------------------------------------------------ Edennil's drops -- */
  const DROP_GOLD = [1.0, 0.84, 0.46];
  const OWL_SHADE = {};
  /** Edennil's shape in black, for the shadow it throws on the field. */
  function owlShade(frame, size) {
    const key = frame + ':' + size;
    if (OWL_SHADE[key]) return OWL_SHADE[key];
    const src = WS.Sprites.creature('edennil_w' + frame, [0.5, 0.5, 0.5], size);
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    return (OWL_SHADE[key] = c);
  }
  /* A big owl does not flap the whole way: four beats, then a glide on
     spread wings, then four more. `d.flap` counts beats; this maps it to
     where in a beat the wings are, holding them fully open (a quarter of the
     way through, the top of the stroke) for the glide. */
  function owlPhase(d) {
    const t = ((d.flap % 5) + 5) % 5;
    if (t < 3.25) return t % 1;
    if (t < 4.25) return 0.25;
    return (t - 1) % 1;
  }
  function owlFrame(d) {
    const n = WS.EdennilArt.frames;
    return WS.floor(owlPhase(d) * n) % n;
  }

  /** The canopy: gores of the Watch's cream and ember, cords to the crate.
   *  `open` 0..1 is how far it has filled; `sway` tilts it. */
  R.drawChute = function (ctx, x, y, w, open, sway) {
    const h = w * 0.5 * (0.35 + 0.65 * open), half = w * 0.5 * (0.45 + 0.55 * open);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(sway);
    // cords, to the crate below
    ctx.strokeStyle = 'rgba(60,44,30,.8)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const f of [-1, -0.5, 0.5, 1]) { ctx.moveTo(half * f, 0); ctx.lineTo(w * 0.12 * f, w * 0.62); }
    ctx.stroke();
    // the canopy: a dome, cut into six gores
    const gores = 6;
    for (let i = 0; i < gores; i++) {
      const a0 = Math.PI + (i / gores) * Math.PI, a1 = Math.PI + ((i + 1) / gores) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.ellipse(0, 0, half, h, 0, a0, a1);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? '#f1e2c0' : '#c8472c';
      ctx.fill();
    }
    // the hem, scalloped where each gore meets the next
    ctx.fillStyle = 'rgba(40,20,12,.35)';
    for (let i = 0; i < gores; i++) {
      const cx = -half + (i + 0.5) * (2 * half / gores);
      ctx.beginPath(); ctx.ellipse(cx, 0, half / gores, h * 0.1, 0, 0, Math.PI); ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(0, 0, half, h, 0, Math.PI, WS.TAU);
    ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 1.6; ctx.stroke();
    // a vent at the crown, and a highlight down the sunward side
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath(); ctx.ellipse(-half * 0.35, -h * 0.55, half * 0.22, h * 0.3, -0.4, 0, WS.TAU); ctx.fill();
    ctx.restore();
  };

  /** A canopy that has come down: cloth lying in folds, stirring. */
  R.drawSpentChute = function (ctx, x, y, w, t) {
    ctx.save();
    ctx.translate(x, y);
    const lift = WS.sin(t * 1.6) * 0.06;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(-w * 0.1 + i * w * 0.14, -i * w * 0.02, w * (0.34 - i * 0.05), w * (0.12 + lift * (i + 1) * 0.2),
        0.15 * (i - 1.5), 0, WS.TAU);
      ctx.fillStyle = i % 2 ? '#e6d4ae' : '#b84028';
      ctx.fill();
      ctx.strokeStyle = 'rgba(58,36,24,.7)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  };

  /** On the ground: the mark, and the shadows of the bird and the crate. */
  R.drawAirdropGround = function (ctx, time) {
    const list = WS.Airdrop && WS.Airdrop.list;
    if (!list || !list.length) return;
    const cfg = WS.Config, size = cfg.airdropSize;
    for (const d of list) {
      if (!d.landed) {
        const k = WS.clamp(d.t / d.lead, 0, 1);            // 0 marked .. 1 landing
        const gold = WS.rgb(DROP_GOLD, 1);
        ctx.save();
        ctx.translate(d.x, d.y);
        // A soft pool of light where it will come down.
        const pool = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
        pool.addColorStop(0, `rgba(255,214,120,${(0.10 + 0.14 * k).toFixed(3)})`);
        pool.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.fillStyle = pool;
        ctx.beginPath(); ctx.ellipse(0, 0, 46, 22, 0, 0, WS.TAU); ctx.fill();
        // The ring, turning, flattened to lie on the ground.
        ctx.scale(1, 0.5);
        ctx.setLineDash([8, 7]); ctx.lineDashOffset = -time * 18;
        ctx.strokeStyle = WS.rgb(DROP_GOLD, 0.75); ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(0, 0, 36, 0, WS.TAU); ctx.stroke();
        ctx.setLineDash([]);
        // The countdown: fills round as the landing comes.
        ctx.strokeStyle = gold; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, 28, -Math.PI / 2, -Math.PI / 2 + k * WS.TAU); ctx.stroke();
        // Four chevrons pointing in, closing as it comes.
        const pull = 44 + 10 * (1 - k) + WS.sin(time * 5) * 2;
        ctx.fillStyle = gold;
        for (let q = 0; q < 4; q++) {
          const a = q * Math.PI / 2 + Math.PI / 4;
          ctx.save(); ctx.rotate(a); ctx.translate(pull, 0);
          ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(4, -7); ctx.lineTo(4, 7); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        // The flare: a stake with a burning head, and its smoke going up.
        ctx.save();
        ctx.strokeStyle = '#4a3422'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y - 14); ctx.stroke();
        const fl = 0.8 + 0.2 * WS.sin(time * 23 + d.x);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,170,80,${(0.85 * fl).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(d.x, d.y - 16, 3.6 * fl, 0, WS.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,200,.9)';
        ctx.beginPath(); ctx.arc(d.x, d.y - 16, 1.6, 0, WS.TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 7; i++) {
          const f = ((time * 0.55 + i / 7 + d.flap * 0.1) % 1);
          const sx = d.x + WS.sin(f * 5 + i) * 6 * f + f * 10;
          const sy = d.y - 18 - f * 70;
          ctx.fillStyle = `rgba(255,${WS.round(196 + 40 * f)},${WS.round(140 + 90 * f)},${(0.34 * (1 - f)).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(sx, sy, 3 + f * 9, 0, WS.TAU); ctx.fill();
        }
        ctx.restore();
        // The crate's shadow, tightening as it comes down.
        if (d.released) {
          const h = WS.Airdrop.crateHeight(d.crateT) / cfg.airdropAltitude;   // 1 high .. 0 down
          ctx.save();
          ctx.globalAlpha = 0.22 + 0.3 * (1 - h);
          ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.ellipse(d.x, d.y + 4, 14 + 16 * h, (14 + 16 * h) * 0.4, 0, 0, WS.TAU); ctx.fill();
          ctx.restore();
        }
      }
      // Edennil's shadow, sweeping across the ground under it.
      const gx = d.x + d.dx * d.s, gy = d.y + d.dy * d.s;
      const shade = owlShade(owlFrame(d), WS.round(size));
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.translate(gx + 24, gy + 10);
      ctx.rotate(d.heading + Math.PI / 2);
      ctx.drawImage(shade, -size * 0.45, -size * 0.45, size * 0.9, size * 0.9);
      ctx.beginPath(); ctx.ellipse(0, -size * 0.17, size * 0.075, size * 0.07, 0, 0, WS.TAU);
      ctx.fillStyle = '#000'; ctx.fill();
      ctx.restore();
    }
  };

  /** In the air: the crate under its canopy, and Edennil. */
  R.drawAirdropSky = function (ctx, time) {
    const list = WS.Airdrop && WS.Airdrop.list;
    if (!list || !list.length) return;
    const cfg = WS.Config, size = cfg.airdropSize, alt = cfg.airdropAltitude;
    for (const d of list) {
      if (d.released && !d.landed) {
        const h = WS.Airdrop.crateHeight(d.crateT);
        const cx = d.x, cy = d.y - h;
        const sway = WS.sin(time * 2.1 + d.flap) * 0.12 * (h / alt);
        const cs = 42;
        // Crate and canopy swing together about the canopy, the way a load
        // hangs: the crate is the pendulum, so the cords always meet it.
        ctx.save();
        ctx.translate(cx, cy - cs * 1.25);
        if (d.chuted) {
          const open = WS.clamp((d.crateT - cfg.airdropFreefall) / 0.25, 0, 1);
          ctx.rotate(sway);
          this.drawChute(ctx, 0, 0, cs * 1.9, open, 0);
        }
        const spr = WS.Sprites.creature('supply_crate', [0.5, 0.5, 0.5], cs);
        ctx.translate(0, cs * 0.95);
        ctx.rotate(d.chuted ? 0 : d.crateT * 5);
        ctx.drawImage(spr, -cs / 2, -cs * 0.5, cs, cs);
        ctx.restore();
      }
      // Edennil: the body along the heading, and the head on its neck,
      // turning to keep the survivor in sight as he passes over - an owl
      // can look nearly straight back, so it follows him well past.
      const gx = d.x + d.dx * d.s, gy = d.y + d.dy * d.s;
      const bx = gx, by = gy - alt + WS.sin(owlPhase(d) * WS.TAU) * 3;
      const body = WS.Sprites.creature('edennil_w' + owlFrame(d), [0.5, 0.5, 0.5], WS.round(size));
      const turn = d.heading + Math.PI / 2;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(turn);
      ctx.drawImage(body, -size / 2, -size / 2, size, size);
      ctx.restore();
      const p = WS.Game.player;
      let want = 0;
      if (p) {
        const rel = Math.atan2(p.y - gy, p.x - gx) - d.heading;
        want = WS.clamp(Math.atan2(WS.sin(rel), WS.cos(rel)), -2.1, 2.1);
      }
      const dt = d._seen !== undefined ? WS.clamp(time - d._seen, 0, 0.1) : 0;
      d._seen = time;
      d.look = (d.look || 0) + (want - (d.look || 0)) * WS.min(1, dt * 3.5);
      const hs = size * 0.32;
      const nx = bx + d.dx * size * 0.19, ny = by + d.dy * size * 0.19;
      const headArt = WS.Sprites.creature('edennil_head', [0.5, 0.5, 0.5], WS.round(hs));
      ctx.save();
      ctx.translate(nx, ny);
      ctx.rotate(turn + d.look);
      ctx.drawImage(headArt, -hs / 2, -hs * 0.56, hs, hs);
      ctx.restore();
    }
  };

  const HAZARD_DASH = [7, 6], NO_DASH = [];
  R.drawHazards = function (ctx, time) {
    const pool = WS.Hazard.pool;
    if (!pool) return;
    for (let i = 0; i < pool.count; i++) {
      const h = pool.active[i];
      const c = R.vivid() ? R.VIVID : h.tint;
      const rgb = `${WS.floor(c[0] * 255)},${WS.floor(c[1] * 255)},${WS.floor(c[2] * 255)}`;
      hold(ctx);   // not save(): see hold
      if (h.fuse > 0) {
        const k = 1 - h.fuse / (h.maxFuse || 1);       // 0 -> 1 as it arms
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius * (0.45 + 0.55 * k), 0, WS.TAU);
        ctx.fillStyle = `rgba(${rgb},${(0.05 + 0.09 * k).toFixed(3)})`;
        ctx.fill();
        ctx.setLineDash(HAZARD_DASH);
        ctx.lineDashOffset = -time * 26;
        ctx.strokeStyle = `rgba(${rgb},${(0.45 + 0.4 * k).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash(NO_DASH); ctx.lineDashOffset = 0;
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
      release(ctx);
    }
  };

  /* A BOSS GATHERING ITSELF. Every shape a boss throws (bossfight.js) is
     drawn where it will land - and the boss, which is what the eye is on,
     said nothing. Now it does: while a shape is being drawn, light gathers
     in onto the boss from a ring three times its size, the ring tightening
     as the blow comes, and a slam strings a dashed tether from the boss to
     the circle it is aimed at, so the cause and the place read as one
     thing. In its second phase the ground under it smoulders in its own
     colour and a slow ring of embers turns round it: an enraged boss looks
     enraged across the screen, without a word of text.

     Reduce Flashes holds the pulse still; Vivid paints both in the danger
     colour. All of it is under the survivor and their spells. */
  R.drawBossPresence = function (ctx, e, time) {
    const calm = R.calm();
    const tint = R.vivid() ? R.VIVID : e.template.tint;
    const rgb = `${WS.floor(tint[0] * 255)},${WS.floor(tint[1] * 255)},${WS.floor(tint[2] * 255)}`;
    const gy = e.y + e.radius * 0.55;
    ctx.save();
    if (e.enraged) {
      const pulse = calm ? 0.8 : 0.7 + 0.3 * WS.sin(time * 6);
      const g = ctx.createRadialGradient(e.x, gy, e.radius * 0.3, e.x, gy, e.radius * 2.2);
      g.addColorStop(0, `rgba(${rgb},${(0.32 * pulse).toFixed(3)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(e.x, gy, e.radius * 2.2, e.radius * 0.95, 0, 0, WS.TAU); ctx.fill();
      ctx.strokeStyle = `rgba(${rgb},${(0.75 * pulse).toFixed(3)})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 9]); ctx.lineDashOffset = calm ? 0 : -time * 40;
      ctx.beginPath(); ctx.ellipse(e.x, gy, e.radius * 1.6, e.radius * 0.66, 0, 0, WS.TAU); ctx.stroke();
      ctx.setLineDash([]);
      if (e.enrageGlow > 0) {
        // The moment it turns: a ring blown outward.
        const k = 1 - e.enrageGlow / 1.2;
        ctx.globalAlpha = (1 - k) * (calm ? 0.4 : 0.9);
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(e.x, gy, e.radius * (1.3 + 3.5 * k), e.radius * (0.55 + 1.5 * k), 0, 0, WS.TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    const c = e.cast;
    if (c) {
      const k = WS.clamp(1 - c.life / c.max, 0, 1);
      const ct = R.vivid() ? R.VIVID : c.tint;
      const crgb = `${WS.floor(ct[0] * 255)},${WS.floor(ct[1] * 255)},${WS.floor(ct[2] * 255)}`;
      const r = e.radius * (3 - 1.9 * k);
      ctx.lineWidth = 2 + 3 * k;
      ctx.strokeStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 1.5, 0, WS.TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(${crgb},${(0.35 + 0.55 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, WS.TAU); ctx.stroke();
      // Four ticks closing in, so it reads as gathering, not as a circle.
      for (let q = 0; q < 4; q++) {
        const a = (q / 4) * WS.TAU + (calm ? 0 : time * 2);
        ctx.beginPath();
        ctx.moveTo(e.x + WS.cos(a) * r, e.y + WS.sin(a) * r);
        ctx.lineTo(e.x + WS.cos(a) * (r + 14), e.y + WS.sin(a) * (r + 14));
        ctx.stroke();
      }
      if (c.to) {
        ctx.setLineDash([10, 10]); ctx.lineDashOffset = calm ? 0 : -time * 90;
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(${crgb},${(0.25 + 0.5 * k).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(c.to.x, c.to.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  };

  R.drawTelegraphs = function (ctx, time) {
    const dz = R.danger();
    for (let i = 0; i < WS.Enemy.pool.count; i++) {
      const e = WS.Enemy.pool.active[i];
      if (e.boss && (e.cast || e.enraged)) R.drawBossPresence(ctx, e, time);
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
        // Firing, it stays where the charge began (Enemy pins ox/oy).
        ctx.translate(t.firing && t.ox !== undefined ? t.ox : e.x, t.firing && t.oy !== undefined ? t.oy : e.y);
        ctx.rotate(WS.atan2(t.dy, t.dx));
        ctx.fillStyle = `rgba(${dz.deep},${(aim ? 0.07 + 0.16 * k : 0.20 * fade).toFixed(3)})`;
        ctx.fillRect(0, -t.width / 2, t.length, t.width);
        ctx.fillStyle = `rgba(${dz.mid},${(aim ? 0.16 + 0.3 * k : 0.42 * fade).toFixed(3)})`;
        ctx.fillRect(0, -t.width / 2, t.length * (aim ? k : 1), t.width);
        ctx.strokeStyle = `rgba(${dz.rim},${(aim ? 0.35 + 0.45 * k : 0.85 * fade).toFixed(3)})`;
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
        ctx.strokeStyle = `rgba(${dz.deep},.9)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, t.radius * (0.4 + 0.9 * k), 0, WS.TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  /* ---------------------------------------------------------- warnings --
   * WHAT CAN HURT YOU IS NEVER UNDER WHAT YOU CAST. Every warning on the
   * field - a charge lane, ground about to arm, a storm mark, a shot in
   * flight - was drawn on the ground or with the bolts, and then the
   * survivor's own spells went over the top of it: novas, beams, sparks,
   * all composited 'lighter', which does not cover a warning so much as
   * bleach it. In the late game, which is exactly when a warning matters
   * most, the lane the boss was about to run down could be a faint pink
   * smear under a wall of your own light.
   *
   * So each one is stated again here, after every effect: an outline and
   * nothing else, a dark stroke under a coloured one so it holds against
   * white as well as black. No fills, so it adds no clutter of its own. It
   * leans in as the screen fills - on a quiet field the ground layer says
   * it well enough, and this is only a whisper. */
  R.drawWarnings = function (ctx, time) {
    const bolts = WS.Projectile.bolts ? WS.Projectile.bolts.count : 0;
    const orbs = WS.Projectile.orbits ? WS.Projectile.orbits.count : 0;
    const busy = WS.clamp((bolts + orbs * 6) / 90, 0, 1);
    const a = 0.3 + 0.7 * busy;
    const dz = R.danger();
    const twice = (w, rgba, draw) => {
      ctx.lineWidth = w + 2.5; ctx.strokeStyle = `rgba(0,0,0,${(0.55 * a).toFixed(3)})`; draw(); ctx.stroke();
      ctx.lineWidth = w; ctx.strokeStyle = rgba; draw(); ctx.stroke();
    };
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    // Charge lanes, aimed or running.
    for (let i = 0; i < WS.Enemy.pool.count; i++) {
      const e = WS.Enemy.pool.active[i];
      const t = e.telegraph;
      if (!t || t.kind !== 'lane') continue;
      const k = 1 - WS.clamp(t.life / t.maxLife, 0, 1);
      const fade = t.firing ? 1 - k : 0.55 + 0.45 * k;
      ctx.save();
      ctx.translate(t.firing && t.ox !== undefined ? t.ox : e.x, t.firing && t.oy !== undefined ? t.oy : e.y);
      ctx.rotate(WS.atan2(t.dy, t.dx));
      twice(t.locked || t.firing ? 2.5 : 1.6, `rgba(${dz.rim},${(0.9 * a * fade).toFixed(3)})`,
        () => { ctx.beginPath(); ctx.rect(0, -t.width / 2, t.length, t.width); });
      ctx.restore();
    }
    // Ground: arming, then armed.
    const hz = WS.Hazard.pool;
    for (let i = 0; hz && i < hz.count; i++) {
      const h = hz.active[i];
      const c = R.vivid() ? R.VIVID : h.tint;
      const rgb = `${WS.floor(c[0] * 255)},${WS.floor(c[1] * 255)},${WS.floor(c[2] * 255)}`;
      if (h.fuse > 0) {
        const k = 1 - h.fuse / (h.maxFuse || 1);
        ctx.setLineDash([7, 6]); ctx.lineDashOffset = -time * 26;
        twice(1.6, `rgba(${rgb},${(0.8 * a * (0.5 + 0.5 * k)).toFixed(3)})`,
          () => { ctx.beginPath(); ctx.arc(h.x, h.y, h.radius * (0.45 + 0.55 * k), 0, WS.TAU); });
        ctx.setLineDash([]);
      } else {
        const fade = WS.clamp(h.life / (h.maxLife || 1), 0, 1);
        twice(1.8, `rgba(${rgb},${(0.85 * a * fade).toFixed(3)})`,
          () => { ctx.beginPath(); ctx.arc(h.x, h.y, h.radius, 0, WS.TAU); });
      }
    }
    /* The finale's marks, and the scheduled bosses' (the same shapes):
       circles and lanes as their outline, a ring's openings as their edge
       bars - the one thing about a ring that has to be read through the
       light of your own spells. */
    for (const m of (WS.Finale && WS.Finale.marks) || []) {
      const mc = R.vivid() ? R.VIVID : (m.tint || [1, 0.5, 0.3]);
      const mrgb = `${WS.floor(mc[0] * 255)},${WS.floor(mc[1] * 255)},${WS.floor(mc[2] * 255)}`;
      if (m.kind === 'circle') {
        const k = WS.clamp(1 - m.tele / m.maxTele, 0, 1);
        twice(1.6 + 1.4 * k, `rgba(${mrgb},${(0.9 * a * (0.55 + 0.45 * k)).toFixed(3)})`,
          () => { ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, WS.TAU); });
      } else if (m.kind === 'lane' && m.tele > 0) {
        ctx.save();
        ctx.translate(m.x, m.y); ctx.rotate(m.ang);
        twice(1.8, `rgba(${mrgb},${(0.85 * a).toFixed(3)})`, () => { ctx.beginPath(); ctx.rect(0, -m.w / 2, m.len, m.w); });
        ctx.restore();
      } else if (m.kind === 'ring' && !(m.delay > 0) && WS.FinaleArt) {
        ctx.globalAlpha = a;
        WS.FinaleArt.ringGapEdges(ctx, m, mc);
        ctx.globalAlpha = 1;
      }
    }
    // Storm marks, with the time left as the share of the ring still drawn.
    const M = WS.Moor;
    for (const st of (M && M.strikes) || []) {
      const left = WS.clamp(st.tele / st.max, 0, 1);
      twice(2, `rgba(200,220,255,${(0.9 * a).toFixed(3)})`,
        () => { ctx.beginPath(); ctx.arc(st.x, st.y, st.r, -WS.PI / 2, -WS.PI / 2 + WS.TAU * (1 - left) + 0.01); });
    }
    // Shots in flight: the dart's core again, rim and all.
    const host = WS.Projectile.hostiles;
    for (let i = 0; host && i < host.count; i++) {
      const h = host.active[i];
      const r = h.radius;
      const ang = (h.vx || h.vy) ? WS.atan2(h.vy, h.vx) : h.spin;
      ctx.save();
      ctx.translate(h.x, h.y); ctx.rotate(ang);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(2,4,8,.9)';
      ctx.beginPath(); ctx.moveTo(r * 1.9, 0); ctx.lineTo(0, -r * 0.8); ctx.lineTo(-r, 0); ctx.lineTo(0, r * 0.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = WS.rgb(h.colour, 1);
      ctx.beginPath(); ctx.moveTo(r * 1.3, 0); ctx.lineTo(0, -r * 0.46); ctx.lineTo(-r * 0.6, 0); ctx.lineTo(0, r * 0.46); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  const ZONE_FILL_CAP = 6;
  const ZONE_DETAIL_CAP = 4;

  /* The baked parts of a field (see drawZones). Painted at ZONE_ART pixels
     across the field's own radius, which is plenty: every one of them is a
     soft gradient with no edge in it, and stretching a gradient does not
     show. Keyed by what they depend on and nothing else. */
  const ZONE_ART = 128;
  const zoneArts = new Map();
  let zoneBurnCanvas = null;
  function zoneBurn() {
    if (zoneBurnCanvas) return zoneBurnCanvas;
    const cv = document.createElement('canvas');
    cv.width = cv.height = ZONE_ART * 2;
    const g = cv.getContext('2d');
    const r = ZONE_ART;
    const burn = g.createRadialGradient(r, r, 0, r, r, r);
    burn.addColorStop(0, 'rgba(0,0,0,0.28)');
    burn.addColorStop(0.75, 'rgba(0,0,0,0.16)');
    burn.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = burn;
    g.beginPath(); g.arc(r, r, r, 0, WS.TAU); g.fill();
    zoneBurnCanvas = cv;
    return cv;
  }
  /* THE GROUND UNDER A FIELD, ALL AT ONCE, AT A QUARTER OF THE PIXELS.

     A field's scorch and its wash are the biggest things the game draws -
     a finished Hallowed Ring is three hundred units across, keeps four of
     itself down at once, and each copy was two or three full-size blended
     layers. At 3440 pixels wide that is twenty-odd million blended pixels a
     frame, and it took a tester's Pale Wastes finale to two frames a
     second. Baking the gradients into images did not help: stretching an
     image over a large area costs what painting the gradient did. What
     costs is the number of full-size layers blended onto the screen.

     So every field's scorch goes into one small buffer and every field's
     light into another, each a quarter of the screen's width and height -
     a sixteenth of the pixels, where nothing about a soft gradient can be
     lost - and each buffer is blended onto the screen once, over only the
     box the fields cover. However many fields there are, the screen pays
     for two. The rims, runes and seals, which have edges and would show the
     lower resolution, are drawn at full size afterwards as before. */
  const WASH_SCALE = 0.25;
  const washBufs = { burn: null, light: null };
  function washBuf(name, w, h) {
    let b = washBufs[name];
    if (!b) { b = washBufs[name] = document.createElement('canvas'); b.ctx = b.getContext('2d'); }
    if (b.width !== w || b.height !== h) { b.width = w; b.height = h; }
    return b;
  }
  R.washZones = function (ctx, zones, fillAt, stackDamp, busy) {
    if (!zones.count) return;
    const cv = ctx.canvas;
    const m = ctx.getTransform();
    const k = WASH_SCALE;
    const bw = Math.ceil(cv.width * k), bh = Math.ceil(cv.height * k);
    /* The scorch is one quarter-resolution pass for every field at once, so
       it costs the same with one field or twenty: it does not drop when the
       field is busy (it used to, and a busy build's fields lost their
       ground along with their detail). */
    const scorch = !this.lite;
    const light = washBuf('light', bw, bh), lg = light.ctx;
    lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, bw, bh);
    lg.setTransform(m.a * k, m.b * k, m.c * k, m.d * k, m.e * k, m.f * k);
    lg.globalCompositeOperation = 'lighter';
    let bg = null, burn = null;
    if (scorch) {
      burn = washBuf('burn', bw, bh); bg = burn.ctx;
      bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, bw, bh);
      bg.setTransform(m.a * k, m.b * k, m.c * k, m.d * k, m.e * k, m.f * k);
    }
    // the box the fields cover, in screen pixels
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < zones.count; i++) {
      const z = zones.active[i];
      if (z.life < fillAt) continue;
      const fade = WS.clamp(z.life / z.maxLife, 0, 1);
      const R = z.radius;
      const art = zoneArt(z, z.rank || 1, scorch);
      const span = R * art.reach;
      if (bg) {
        bg.globalAlpha = fade;
        bg.drawImage(zoneBurn(), z.x - R, z.y - R, R * 2, R * 2);
      }
      // the frame's light budget (R.lightDim, weighed last frame) holds here too
      lg.globalAlpha = fade * stackDamp * (R.lightDim || 1);
      lg.drawImage(art.canvas, z.x - span, z.y - span, span * 2, span * 2);
      const sx = m.a * z.x + m.c * z.y + m.e, sy = m.b * z.x + m.d * z.y + m.f;
      const sr = span * Math.hypot(m.a, m.b);
      x0 = WS.min(x0, sx - sr); y0 = WS.min(y0, sy - sr);
      x1 = WS.max(x1, sx + sr); y1 = WS.max(y1, sy + sr);
    }
    if (x1 <= x0) return;
    // snapped to the buffer's own pixel grid, and kept on the canvas
    x0 = WS.max(0, Math.floor(x0 * k) / k); y0 = WS.max(0, Math.floor(y0 * k) / k);
    x1 = WS.min(cv.width, Math.ceil(x1 * k) / k); y1 = WS.min(cv.height, Math.ceil(y1 * k) / k);
    if (x1 <= x0 || y1 <= y0) return;
    const w = x1 - x0, h = y1 - y0;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    if (burn) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(burn, x0 * k, y0 * k, w * k, h * k, x0, y0, w, h);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(light, x0 * k, y0 * k, w * k, h * k, x0, y0, w, h);
    ctx.restore();
  };

  function zoneArt(z, zr, corona) {
    const hot = 1 + 0.06 * (zr - 1) + (z.evolved ? 0.22 : 0);
    const withHalo = corona && zr >= WS.Config.projRankA;
    const far = withHalo ? (zr >= WS.Config.projRankB ? 1.26 : 1.15) * (z.evolved ? 1.1 : 1) : 1;
    const key = WS.hex(z.colour) + '|' + zr + '|' + (z.evolved ? 1 : 0) + '|' + (withHalo ? 1 : 0)
      + '|' + (z.blend ? WS.hex(z.blend) : '');
    let a = zoneArts.get(key);
    if (a) return a;
    if (zoneArts.size > 64) zoneArts.clear();
    const R = ZONE_ART, size = Math.ceil(R * far) * 2, c = size / 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    const grd = g.createRadialGradient(c, c, R * 0.15, c, c, R);
    grd.addColorStop(0, WS.rgb(z.colour, WS.min(1, 0.34 * hot)));
    grd.addColorStop(0.62, WS.rgb(z.colour, WS.min(1, 0.17 * hot)));
    grd.addColorStop(1, WS.rgb(z.colour, 0));
    g.fillStyle = grd;
    g.beginPath(); g.arc(c, c, R, 0, WS.TAU); g.fill();
    if (withHalo) {
      const halo = g.createRadialGradient(c, c, R * 0.9, c, c, R * far);
      halo.addColorStop(0, WS.rgb(z.colour, 0.18));
      halo.addColorStop(1, WS.rgb(z.colour, 0));
      g.fillStyle = halo;
      g.beginPath(); g.arc(c, c, R * far, 0, WS.TAU); g.fill();
    }
    if (z.blend) {
      const bl = g.createRadialGradient(c, c, 0, c, c, R * 0.45);
      bl.addColorStop(0, WS.rgb(z.blend, 0.30));
      bl.addColorStop(1, WS.rgb(z.blend, 0));
      g.fillStyle = bl;
      g.beginPath(); g.arc(c, c, R * 0.45, 0, WS.TAU); g.fill();
    }
    a = { canvas: cv, reach: far };
    zoneArts.set(key, a);
    return a;
  }
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
    this.washZones(ctx, zones, fillAt, stackDamp, busy);
    /* The detail inside a field - rune bands, seals, tendrils, motes - on the
       newest ZONE_DETAIL_CAP only. A finished Hallowed Ring keeps four of
       itself down at once, nearly concentric, and four rune bands turning at
       four different angles on one spot read as a smear, not as four holy
       grounds - while each one costs dozens of strokes at full size. The
       older fields keep their wash and their rim, which is what says where
       each still reaches. */
    /* WHICH FIELDS KEEP THEIR ART. It used to be all of them or, past four
       fields on the ground, none: a build with Blighted Earth, Hallowed
       Ground and a third field kept five or six down at once and every one
       of them went to a plain ring - the moment a build came together was the
       moment its ground stopped looking like anything. What smears is the
       SAME field stacked on itself, so the art now goes to the newest field
       of each weapon, up to ZONE_DETAIL_CAP of them; the older copies under
       them keep their wash, rim and damage. */
    const detailed = this._zoneDetail || (this._zoneDetail = new Set());
    detailed.clear();
    {
      const newest = this._zoneNewest || (this._zoneNewest = new Map());
      newest.clear();
      for (let i = 0; i < zones.count; i++) {
        const z = zones.active[i], n = newest.get(z.source);
        if (!n || z.life > n.life) newest.set(z.source, z);
      }
      const pick = [...newest.values()].sort((a, b) => b.life - a.life);
      for (let i = 0; i < pick.length && i < ZONE_DETAIL_CAP; i++) detailed.add(pick[i]);
    }
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

      /* A field's own paint - the scorch under it and the light over it -
         is not drawn here any more but in one pass for every field at once,
         at a quarter of the resolution: see washZones. */
      // 1 and 2, the scorch and the wash, were laid down for every field at
      // once by washZones() before this loop - see there.
      ctx.globalCompositeOperation = 'lighter';

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
      if (!this.lite && detailed.has(z)) {
        if (z._src !== z.source) {
          const wd = WS.Weapons[z.source];
          z._style = wd ? (wd.data || wd).school : null;
          z._src = z.source;
        }
        if (z._style === 'holy') this.zoneHallow(ctx, z, R, fade, time, breathe);
        else if (z._style === 'shadow') this.zoneBlight(ctx, z, R, fade, time);
        else if (z._style === 'nature') this.zoneBramble(ctx, z, R, fade, time);
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

  /* HIGHMOOR'S SKY AND STONES (src/game/highmoor.js).

     A storm strike is announced by the shadow of the cloud that carries it:
     a dark pool on the ground that fills from the rim in as the strike
     comes, with the rim itself crackling. Full is now. It is the only thing
     on the field that is darker than the ground, which is why it reads.

     A shrine is a ring of six standing stones round a rune in its boon's
     colour, and the count to taking it is drawn round the ring like the
     gyre of a clock. */
  R.drawMoor = function (ctx, time) {
    const M = WS.Moor;
    if (!M || (!M.strikes.length && !M.shrines.length)) return;
    ctx.save();
    for (const s of M.strikes) {
      const k = 1 - WS.clamp(s.tele / s.max, 0, 1);
      ctx.globalAlpha = 0.34 + 0.2 * k;
      ctx.fillStyle = '#05070e';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, WS.TAU); ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#0a1224';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * k, 0, WS.TAU); ctx.fill();
      ctx.globalAlpha = 0.75 + 0.25 * WS.sin(time * 18 + s.seed);
      ctx.strokeStyle = k > 0.8 ? '#e8f0ff' : '#8fb0ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, WS.TAU); ctx.stroke();
      // crackle along the rim
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(200,220,255,.8)';
      const n = 3 + WS.floor(k * 4);
      for (let i = 0; i < n; i++) {
        const a = s.seed + i * 2.3 + WS.floor(time * 12) * 0.7;
        let x = s.x + WS.cos(a) * s.r, y = s.y + WS.sin(a) * s.r;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let j = 0; j < 3; j++) {
          x += (s.x - x) * 0.18 + WS.randRange(-6, 6);
          y += (s.y - y) * 0.18 + WS.randRange(-6, 6);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    for (const sh of M.shrines) {
      const b = M.BOONS[sh.kind];
      const fade = sh.gone ? WS.max(0, 1 - sh.gone / 1.2) : sh.rise;
      if (fade <= 0) continue;
      const lit = sh.taken ? 1 : 0.55 + 0.45 * sh.progress;
      // the ground inside the ring, faintly lit
      ctx.globalAlpha = 0.16 * fade * lit;
      ctx.fillStyle = WS.rgb(b.tint, 1);
      ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r, 0, WS.TAU); ctx.fill();
      // the count, round the ring
      if (sh.progress > 0 && !sh.gone) {
        ctx.globalAlpha = 0.9 * fade;
        ctx.strokeStyle = WS.rgb(WS.mix(b.tint, [1, 1, 1], 0.4), 1);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(sh.x, sh.y, sh.r + 6, -WS.PI / 2, -WS.PI / 2 + WS.TAU * sh.progress);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.5 * fade;
      ctx.strokeStyle = WS.rgb(b.tint, 1);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r, 0, WS.TAU); ctx.stroke();
      ctx.setLineDash([]);
      // the time it has left, a thin arc outside the count that empties
      // as it runs; held past its time (someone charging it), it pulses full
      if (!sh.gone && !sh.taken) {
        const stay = WS.Config.shrineStay, left = WS.max(0, sh.life) / stay;
        ctx.globalAlpha = (sh.held ? 0.55 + 0.35 * WS.sin(time * 6) : left < 0.3 ? 0.75 : 0.45) * fade;
        ctx.strokeStyle = sh.held ? '#fff2c8' : left < 0.3 ? '#ffb07a' : '#e9e3d0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sh.x, sh.y, sh.r + 13, -WS.PI / 2, -WS.PI / 2 + WS.TAU * (sh.held ? 1 : left));
        ctx.stroke();
        ctx.globalAlpha = 0.9 * fade;
        ctx.font = `600 12px ${UI_FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const lbl = sh.held ? 'held' : WS.formatTime(WS.ceil(WS.max(0, sh.life)));
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
        ctx.strokeText(lbl, sh.x, sh.y + sh.r + 18);
        ctx.fillStyle = sh.held ? '#fff2c8' : left < 0.3 ? '#ffb07a' : '#e9e3d0';
        ctx.fillText(lbl, sh.x, sh.y + sh.r + 18);
      }
      // the stones, rising out of the ground
      for (let i = 0; i < 6; i++) {
        const a = sh.seed + (i / 6) * WS.TAU;
        const sx = sh.x + WS.cos(a) * sh.r, sy = sh.y + WS.sin(a) * sh.r * 0.9;
        const h = (16 + (i % 3) * 5) * fade, w = 7 + (i % 2) * 2;
        ctx.globalAlpha = 0.35 * fade;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(sx, sy + 2, w, 3, 0, 0, WS.TAU); ctx.fill();
        ctx.globalAlpha = fade;
        const g = ctx.createLinearGradient(sx - w, 0, sx + w, 0);
        g.addColorStop(0, '#8a8a80'); g.addColorStop(0.55, '#5e5e58'); g.addColorStop(1, '#34342f');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(sx - w, sy); ctx.lineTo(sx - w * 0.8, sy - h); ctx.quadraticCurveTo(sx, sy - h - 4, sx + w * 0.8, sy - h + 1);
        ctx.lineTo(sx + w, sy); ctx.closePath(); ctx.fill();
        // a carved mark on each, lit by the boon
        ctx.globalAlpha = fade * lit * 0.9;
        ctx.strokeStyle = WS.rgb(b.tint, 1); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(sx, sy - h * 0.75); ctx.lineTo(sx, sy - h * 0.3); ctx.stroke();
      }
      // the rune in the middle
      const icon = WS.Icons.glyph(sh.kind === 'storm' ? 'bolt' : sh.kind === 'gale' ? 'wing' : 'stone', b.tint, 40);
      ctx.globalAlpha = fade * (0.6 + 0.4 * lit) * (0.85 + 0.15 * WS.sin(time * 3 + sh.seed));
      ctx.drawImage(icon, sh.x - 20, sh.y - 26 - WS.sin(time * 2 + sh.seed) * 2, 40, 40);
    }
    ctx.restore();
  };

  /** Nature ground: a thicket. Thorned briars curl in from the rim and
   *  small buds open and close across it - the slow it lays is the thing
   *  to read, so it looks like somewhere you would snag. */
  R.zoneBramble = function (ctx, z, R, fade, time) {
    const x = z.x, y = z.y, ph = z.phase;
    const dark = WS.rgb(WS.mix(z.colour, [0.12, 0.2, 0.08], 0.45), 1);
    ctx.lineCap = 'round';
    ctx.strokeStyle = dark;
    ctx.fillStyle = dark;
    const n = R > 90 ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const a = ph + (i / n) * WS.TAU + WS.sin(time * 0.5 + i) * 0.05;
      const r0 = R * 0.95, r1 = R * (0.2 + 0.25 * ((i * 0.61) % 1));
      const bend = (i % 2 ? 1 : -1) * 0.55;
      const cx = x + WS.cos(a + bend) * R * 0.62, cy = y + WS.sin(a + bend) * R * 0.62;
      const ex = x + WS.cos(a + bend * 1.6) * r1, ey = y + WS.sin(a + bend * 1.6) * r1;
      const sx = x + WS.cos(a) * r0, sy = y + WS.sin(a) * r0;
      ctx.globalAlpha = 0.6 * fade;
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
      // thorns: small hooks along the curve
      ctx.lineWidth = 1.4;
      for (let k = 1; k <= 3; k++) {
        const t = k / 4, u = 1 - t;
        const px = u * u * sx + 2 * u * t * cx + t * t * ex, py = u * u * sy + 2 * u * t * cy + t * t * ey;
        const tx = 2 * u * (cx - sx) + 2 * t * (ex - cx), ty = 2 * u * (cy - sy) + 2 * t * (ey - cy);
        const _unx = WS.normalize(-ty, tx), nx = _unx[0], ny = _unx[1];
        const side = k % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + nx * 6 * side - tx * 0.02, py + ny * 6 * side - ty * 0.02);
        ctx.stroke();
      }
    }
    // buds: open and close on their own time
    const bud = WS.rgb(WS.mix(z.colour, [1, 0.72, 0.85], 0.55), 1);
    ctx.fillStyle = bud;
    for (let i = 0; i < 7; i++) {
      const a = ph * 1.3 + i * 2.1, d = R * (0.2 + 0.6 * ((i * 0.618) % 1));
      const bx = x + WS.cos(a) * d, by = y + WS.sin(a) * d;
      const open = 0.5 + 0.5 * WS.sin(time * 1.6 + i * 1.9);
      ctx.globalAlpha = (0.35 + 0.4 * open) * fade;
      for (let p = 0; p < 4; p++) {
        const pa = p * (WS.TAU / 4) + time * 0.2;
        ctx.beginPath();
        ctx.arc(bx + WS.cos(pa) * 2.4 * open, by + WS.sin(pa) * 2.4 * open, 1.6 + open * 1.4, 0, WS.TAU);
        ctx.fill();
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
  const CALLOUT = { bomb: 1, stone: 1, hourglass: 1, chest: 1, cache: 1, reliquary: 1 };

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

  /* A PILE IS NOT A HANDFUL. The call-out below was built on "there are
     only ever a handful of these", and a long night breaks that: a hundred
     chests waiting under a fight each wore a full halo and ring, and the
     field became a field of loot. So past QUIET_KEEP of one kind, the
     nearest QUIET_KEEP keep the whole call-out and the rest are told
     quieter - still ringed, still there, no longer shouting over the horde. */
  const QUIET_KEEP = 6;
  const quietSet = new Set();
  function quietPickups(pool, player) {
    quietSet.clear();
    if (!player || pool.count <= QUIET_KEEP) return;
    const byKind = new Map();
    for (let i = 0; i < pool.count; i++) {
      const p = pool.active[i];
      if (!(CALLOUT[p.kind] || p.type.noMagnet)) continue;
      let list = byKind.get(p.kind);
      if (!list) byKind.set(p.kind, list = []);
      list.push(p);
    }
    for (const list of byKind.values()) {
      if (list.length <= QUIET_KEEP) continue;
      list.sort((a, b) => WS.dist2(a.x, a.y, player.x, player.y) - WS.dist2(b.x, b.y, player.x, player.y));
      for (let i = QUIET_KEEP; i < list.length; i++) quietSet.add(list[i]);
    }
  }

  R.drawPickups = function (ctx, time) {
    const pool = WS.Pickup.pool;
    quietPickups(pool, WS.Game.player);
    for (let i = 0; i < pool.count; i++) {
      const p = pool.active[i];
      const lift = WS.sin(p.bob) * 3;
      const size = p.type.size;
      const y = p.y + lift;
      const callout = CALLOUT[p.kind] || p.type.noMagnet;
      const hush = quietSet.has(p) ? 0.35 : 1;

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
        halo.addColorStop(0, WS.rgb(p.type.tint, (0.30 + beat * 0.16) * hush));
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
        const frog = this.beansFrog(p, y, size, time);
        if (frog.y < p.y) this.drawBeansFrog(ctx, frog, size);
        const spr = WS.Sprites.creature('beans', p.type.tint, size);
        ctx.drawImage(spr, p.x - size * 0.50, y - size * 0.60, size, size);
      } else if (p.kind === 'watcher') {
        this.drawWatcher(ctx, p, y, size, time);
      } else if (p.kind === 'calf') {
        // A Lost Calf ambles, so it is drawn as a creature, turned the way
        // it is wandering, with a small trot in it.
        const spr = WS.Sprites.creature('calf', p.type.tint, size);
        ctx.save();
        ctx.translate(p.x, y + WS.abs(WS.sin(time * 7 + p.bob)) * -1.5);
        if (p.facing > 0) ctx.scale(-1, 1);
        ctx.drawImage(spr, -size * 0.68, -size * 0.8, size * 1.36, size * 1.36);
        ctx.restore();
      } else if (p.kind === 'cache') {
        // Edennil's crate where it came down: the canopy lies spent beside
        // it, still catching a little air, and the crate sits on the mark.
        const cs = size * 1.45;
        this.drawSpentChute(ctx, p.x + cs * 0.42, p.y + cs * 0.05, cs * 0.62, time + p.bob);
        const spr = WS.Sprites.creature('supply_crate', [0.5, 0.5, 0.5], WS.round(cs));
        ctx.drawImage(spr, p.x - cs / 2, p.y - cs * 0.72, cs, cs);
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
        ctx.globalAlpha = (0.72 + 0.2 * WS.sin(time * 2.6 + p.bob)) * (hush < 1 ? 0.6 : 1);
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

        // What she just sold you, said over her head: a speech bubble that
        // rises in and fades out over its last half second.
        if (p.say && p.say.t > 0) this.drawSpeech(ctx, p.x, y - size * 0.62, p.say, size);

        /* She IS named Beans - so she throws some. Three, thrown one after
         * another from around her paw in a looping arc that empties and
         * restarts, rather than orbiting her forever: a real toss reads as
         * a toss because it lands and stops, even if the next one is a
         * third of a second behind it. */
        const frog = p.frog;
        for (let i = 0; i < 3; i++) {
          const bean = this.beanAt(p, y, size, time, i);
          if (!bean) continue;
          // the frog got this one
          if (frog && frog.ate[i] === bean.cycle) continue;
          const { tt, dir } = bean, bx = bean.x, by = bean.y;
          ctx.save();
          ctx.globalAlpha = tt < 0.85 ? 1 : (1 - tt) / 0.15;   // settles rather than pops
          ctx.translate(bx, by);
          ctx.rotate(tt * 5 * dir);
          // a warm, light bean with a dark rim - the pad it flies over is
          // nearly this same brown, so the fill alone all but vanished
          ctx.fillStyle = '#e0a850';
          ctx.strokeStyle = '#5c3a1a';
          ctx.lineWidth = WS.max(0.8, size * 0.012);
          ctx.beginPath(); ctx.ellipse(0, 0, size * 0.058, size * 0.038, 0, 0, WS.TAU);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.65)';
          ctx.beginPath(); ctx.ellipse(-size * 0.016, -size * 0.012, size * 0.022, size * 0.012, 0, 0, WS.TAU); ctx.fill();
          ctx.restore();
        }
        if (frog && frog.y >= p.y) this.drawBeansFrog(ctx, frog, size);
        if (frog && frog.caught > 0) {
          // Caught at the eggs: Beans has seen it.
          const k = WS.min(1, frog.caught / 0.2) * WS.min(1, (1.1 - frog.caughtT) / 0.25);
          if (k > 0) {
            ctx.save();
            ctx.globalAlpha = WS.clamp(k, 0, 1);
            const bx = p.x - size * 0.2, by = y - size * 0.62 - WS.min(1, frog.caughtT / 0.15) * size * 0.08;
            ctx.font = `800 ${WS.round(size * 0.34)}px ${UI_FONT}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)';
            ctx.strokeText('!', bx, by); ctx.fillStyle = '#ffcf5a'; ctx.fillText('!', bx, by);
            ctx.restore();
          }
        }
      }
      ctx.globalAlpha = 1;
    }
  };

  /** Where Beans' i-th thrown bean is right now, or null between throws.
   *  Shared by the toss and the frog, so the frog can catch what is drawn. */
  /** A speech bubble over a character: a rounded parchment plate with a
   *  tail pointing down at them, one or two lines, rising in over its first
   *  quarter second and fading over its last half. `say` is
   *  { lines: [...], t, max }. */
  R.drawSpeech = function (ctx, x, y, say, size) {
    const age = say.max - say.t;
    const a = WS.min(1, age / 0.25, say.t / 0.5);
    if (a <= 0) return;
    const rise = (1 - WS.min(1, age / 0.25)) * 8;
    ctx.save();
    ctx.globalAlpha = a;
    const fs = WS.max(11, WS.round(size * 0.19));
    ctx.font = `600 ${fs}px ${UI_FONT}`;
    const w = WS.max(...say.lines.map((l) => ctx.measureText(l).width)) + 18;
    const lh = fs + 4, h = say.lines.length * lh + 10;
    const bx = x - w / 2, by = y - h - 10 - rise;
    ctx.fillStyle = 'rgba(20,16,12,.88)';
    ctx.strokeStyle = 'rgba(243,210,150,.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 7); else ctx.rect(bx, by, w, h);
    ctx.moveTo(x - 6, by + h); ctx.lineTo(x, by + h + 8); ctx.lineTo(x + 6, by + h);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    say.lines.forEach((l, i) => {
      ctx.fillStyle = i === 0 ? '#f3e6cf' : '#ffcf7a';
      ctx.fillText(l, x, by + 6 + i * lh);
    });
    ctx.restore();
  };

  R.beanAt = function (p, y, size, time, i) {
    const phase = time * 0.6 + i * 0.333;
    const t = phase % 1;
    if (t > 0.82) return null;             // a beat of rest between throws
    const tt = t / 0.82;
    const dir = 1;
    /* Tossed from the pouch at her hip, out to her right and low, three
       lengths of throw. Thrown from the paw they crossed her face. */
    const originX = p.x + size * 0.16, originY = y + size * 0.13;
    const reach = [0.34, 0.5, 0.42][i];
    return { tt, dir, cycle: WS.floor(phase),
      x: originX + tt * size * reach,
      y: originY - WS.sin(tt * WS.PI) * size * 0.2 + tt * size * 0.16 };
  };

  /* BEANS' FROG. A small pond frog that follows the stall around trying to
   * eat the stock: it hops about her in short arcs, snaps her thrown beans
   * out of the air with its tongue, and now and then sneaks up to the basket
   * and licks an egg, which Beans sees (a "!" over her head) and it bolts.
   *
   * Purely a picture: it lives on the pickup, is stepped by the renderer's
   * clock, and draws its choices from its own little hash rather than the
   * game's random stream, so it cannot change a seeded run. */
  const EGG_AT = [[-0.324, 0.114], [-0.234, 0.092], [-0.14, 0.106], [-0.05, 0.096], [0.03, 0.116]];
  R.beansFrog = function (p, y, size, time) {
    let f = p.frog;
    if (!f) {
      f = p.frog = { x: p.x + size * 0.55, y: p.y + size * 0.3, from: null, to: null, hopT: 0, hopDur: 0.34,
        wait: 0.6, last: time, seed: (p.x * 7.31 + p.y * 3.17) | 0, facing: -1, ate: [-1, -1, -1],
        tongue: 0, tongueT: 0, aim: null, plan: null, caught: 0, caughtT: 0, flee: 0 };
    }
    const dt = WS.clamp(time - f.last, 0, 0.1);
    f.last = time;
    const rnd = () => { f.seed = (f.seed * 1103515245 + 12345) & 0x7fffffff; return f.seed / 0x7fffffff; };
    const home = (a, r) => ({ x: p.x + WS.cos(a) * size * r, y: p.y + size * 0.18 + WS.sin(a) * size * r * 0.55 });
    // keep it off Beans and her basket: a ring round the stall
    const ring = (pt) => {
      const dx = pt.x - p.x, dy = (pt.y - p.y - size * 0.18) / 0.55;
      const d = Math.hypot(dx, dy) || 1, min = size * 0.62, max = size * 1.25;
      const k = WS.clamp(d, min, max) / d;
      return { x: p.x + dx * k, y: p.y + size * 0.18 + dy * k * 0.55 };
    };
    const hopTo = (pt, dur) => {
      f.from = { x: f.x, y: f.y }; f.to = pt; f.hopT = 0; f.hopDur = dur || 0.34;
      f.facing = pt.x < f.x ? -1 : 1;
    };

    if (f.caught > 0) { f.caught += dt; f.caughtT += dt; if (f.caughtT > 1.1) f.caught = 0; }

    if (f.to) {
      // mid-hop
      f.hopT += dt;
      const k = WS.min(1, f.hopT / f.hopDur);
      f.x = f.from.x + (f.to.x - f.from.x) * k;
      f.y = f.from.y + (f.to.y - f.from.y) * k;
      f.air = WS.sin(k * WS.PI) * size * (0.16 + (f.flee ? 0.08 : 0));
      if (k >= 1) {
        f.to = null; f.air = 0;
        f.wait = f.flee ? 0.12 : 0.35 + rnd() * 0.9;
        if (f.flee) f.flee--;
        // arriving somewhere with a purpose: open the mouth
        if (f.plan && f.plan.kind === 'bean') f.aim = { kind: 'bean', i: f.plan.i };
        else if (f.plan && f.plan.kind === 'egg') f.aim = { kind: 'egg', e: f.plan.e };
        f.plan = null;
        if (f.aim) { f.tongue = 0; f.tongueT = 0; }
      }
    } else if (f.aim) {
      // the tongue: out in 0.12s, a beat, back in 0.12s
      f.tongueT += dt;
      const T = f.tongueT;
      f.tongue = T < 0.12 ? T / 0.12 : T < 0.2 ? 1 : WS.max(0, 1 - (T - 0.2) / 0.12);
      let tx, ty;
      if (f.aim.kind === 'bean') {
        const b = this.beanAt(p, y, size, time, f.aim.i);
        if (!b || f.ate[f.aim.i] === (b && b.cycle)) { f.aim.miss = true; }
        else { tx = b.x; ty = b.y; if (T >= 0.12 && !f.aim.got && Math.hypot(tx - f.x, ty - f.y) < size * 0.6) { f.ate[f.aim.i] = b.cycle; f.aim.got = true; } }
      } else {
        const [ex, ey] = EGG_AT[f.aim.e];
        tx = p.x + ex * size; ty = y + ey * size;
        if (T >= 0.12 && !f.aim.got) { f.aim.got = true; f.caught = 0.001; f.caughtT = 0; }
      }
      if (tx !== undefined) { f.tongueTo = { x: tx, y: ty }; f.facing = tx < f.x ? -1 : 1; }
      if (T > 0.34 || f.aim.miss) {
        const wasEgg = f.aim.kind === 'egg';
        f.aim = null; f.tongue = 0; f.tongueTo = null;
        if (wasEgg) {
          // bolt: two quick hops away from her
          f.flee = 1;
          const a = Math.atan2(f.y - p.y, f.x - p.x);
          hopTo(ring(home(a + (rnd() - 0.5) * 0.6, 1.25)), 0.26);
        }
      }
    } else {
      f.wait -= dt;
      if (f.wait <= 0) {
        const roll = rnd();
        if (roll < 0.45) {
          // go for a bean early in its flight, landing under where it will be
          let best = null;
          for (let i = 0; i < 3; i++) {
            const b = this.beanAt(p, y, size, time, i);
            if (b && b.tt > 0.05 && b.tt < 0.45 && f.ate[i] !== b.cycle) { best = { i, b }; break; }
          }
          if (best) {
            const ahead = this.beanAt(p, y, size, time + 0.45, best.i) || best.b;
            f.plan = { kind: 'bean', i: best.i };
            hopTo(ring({ x: ahead.x + best.b.dir * size * 0.12, y: ahead.y + size * 0.28 }), 0.3);
          } else f.wait = 0.2;
        } else if (roll < 0.72) {
          // sneak up on the basket, from the left of it
          const e = WS.floor(rnd() * 3);
          f.plan = { kind: 'egg', e };
          hopTo({ x: p.x - size * 0.66 + rnd() * size * 0.06, y: p.y + size * 0.34 }, 0.36);
        } else {
          hopTo(ring(home(rnd() * WS.TAU, 0.8 + rnd() * 0.45)), 0.34);
        }
      }
    }
    return f;
  };

  R.drawBeansFrog = function (ctx, f, size) {
    const fs = size * 0.4;
    const tint = [0.42, 0.72, 0.30];
    const air = f.air || 0;
    // its shadow stays on the ground while it is up
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(f.x, f.y, fs * 0.3 * (1 - air / (size * 0.5)), fs * 0.1, 0, 0, WS.TAU); ctx.fill();
    ctx.restore();
    const spr = WS.Sprites.creature(air > size * 0.02 ? 'frog_hop' : 'frog', tint, WS.round(fs));
    ctx.save();
    ctx.translate(f.x, f.y - air);
    if (f.facing > 0) ctx.scale(-1, 1);
    ctx.drawImage(spr, -fs / 2, -fs * 0.9, fs, fs);
    ctx.restore();
    if (f.tongue > 0 && f.tongueTo) {
      // the mouth, on the side it faces
      // the mouth: toward the front of the face, whichever way it faces
      const mx = f.x + f.facing * fs * 0.26;
      const my = f.y - air - fs * 0.28;
      const k = f.tongue;
      const tx = mx + (f.tongueTo.x - mx) * k, ty = my + (f.tongueTo.y - my) * k;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#7a2a3a'; ctx.lineWidth = WS.max(2, fs * 0.09);
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.strokeStyle = '#f07a96'; ctx.lineWidth = WS.max(1.2, fs * 0.055);
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = '#f07a96';
      ctx.beginPath(); ctx.arc(tx, ty, WS.max(1.6, fs * 0.07), 0, WS.TAU); ctx.fill();
      // a caught bean rides back in on the tip
      if (f.aim && f.aim.kind === 'bean' && f.aim.got) {
        ctx.fillStyle = '#e0a850'; ctx.strokeStyle = '#5c3a1a'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse(tx, ty, size * 0.05, size * 0.034, 0, 0, WS.TAU); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
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
          hold(ctx);
          ctx.translate(b.x, b.y);
          ctx.rotate(WS.atan2(b.vy, b.vx));
          const row = gradRow(c, 0), lq = gq(len, 1);
          let tg = row.get(lq);
          if (tg === undefined) {
            tg = ctx.createLinearGradient(0, 0, -lq, 0);
            tg.addColorStop(0, WS.rgb(c, 0.75));
            tg.addColorStop(0.3, WS.rgb(c, 0.32));
            tg.addColorStop(1, WS.rgb(c, 0));
            row.set(lq, tg); gradCount++;
          }
          ctx.fillStyle = tg;
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.8);
          ctx.quadraticCurveTo(-len * 0.5, -r * 0.24, -len, 0);
          ctx.quadraticCurveTo(-len * 0.5, r * 0.24, 0, r * 0.8);
          ctx.closePath();
          ctx.fill();
          release(ctx);
        }
      }

      hold(ctx);
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
          const al = (0.20 / WS.sqrt(heft)) * (burst > 1 ? 1 / WS.sqrt(burst) : 1);
          const row = gradRow(c, 1), rq = gq(r, 0.25), fq = gq(far, 0.5), aq = gq(al, 0.01);
          const gk = (rq * 1024 + fq) * 128 + aq;
          let ring = row.get(gk);
          if (ring === undefined) {
            ring = ctx.createRadialGradient(0, 0, rq * 0.25 * 1.6, 0, 0, fq * 0.5);
            ring.addColorStop(0, WS.rgb(c, aq * 0.01));
            ring.addColorStop(1, WS.rgb(c, 0));
            row.set(gk, ring); gradCount++;
          }
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
        const row = gradRow(c, 2), rq = gq(r, 0.25);
        let grd = row.get(rq);
        if (grd === undefined) {
          grd = ctx.createRadialGradient(0, 0, rq * 0.25 * 0.85, 0, 0, rq * 0.25 * 2.4);
          grd.addColorStop(0, WS.rgb(c, 0.55));
          grd.addColorStop(0.35, WS.rgb(c, 0.42));
          grd.addColorStop(1, WS.rgb(c, 0));
          row.set(rq, grd); gradCount++;
        }
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
      release(ctx);
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
      hold(ctx);
      ctx.translate(h.x, h.y);
      ctx.rotate(ang);
      if (!this.lite) {
        const row = gradRow(h.colour, 3), rq = gq(r, 0.25);
        let tail = row.get(rq);
        if (tail === undefined) {
          tail = ctx.createLinearGradient(-rq * 0.25 * 3.6, 0, 0, 0);
          tail.addColorStop(0, WS.rgb(h.colour, 0));
          tail.addColorStop(1, WS.rgb(h.colour, 0.45));
          row.set(rq, tail); gradCount++;
        }
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
      release(ctx);
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
        /* Rank buys branches: one fork at rank 1, four by rank 8, and each
           reaching further - the storm a rank-8 Arcweb throws should look
           like more storm, not the same bolt drawn a pixel wider. */
        const forks = this.lite ? 0 : 1 + WS.floor((br - 1) / 3) + (br >= WS.Config.projRankA ? 1 : 0) + (b.evolved ? 1 : 0);
        WS.SpellArt.lightning(ctx, len, hw, b.colour, fade, (b.seed ^ (strike * 2654435761)) >>> 0, forks, 1 + 0.07 * (br - 1));
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

  /* THE PALM. Iron Palms was three hairlines and a ring - the only weapon in
     the arsenal with nothing of its own to look at, and the monk's whole
     identity. A strike is three things now, all over in a quarter second:
     a shockwave crescent riding out to the edge of the cone and thinning as
     it goes, speed lines streaking through the cone behind it, and an open
     hand pressed into the air where the blow landed - which hand alternating
     through a flurry, so five strikes read as left, right, left, not as one
     shape blinking. The evolution gilds the edges. Tempest Kata is the same
     strike all the way round: a full ring and six hands. */
  function handShape(g, u, fill, edge) {
    // palm and fingers in one colour, so it reads as one hand; the edge
    // colour only on the rim of the palm, where the light catches it
    g.fillStyle = fill; g.strokeStyle = fill;
    g.beginPath();
    if (g.roundRect) g.roundRect(-0.5 * u, -0.34 * u, 0.66 * u, 0.68 * u, 0.2 * u);
    else g.rect(-0.5 * u, -0.34 * u, 0.66 * u, 0.68 * u);
    g.fill();
    g.save();
    g.lineCap = 'round';
    g.lineWidth = u * 0.17;
    g.beginPath();
    for (const [y, len] of [[-0.25, 0.5], [-0.08, 0.62], [0.09, 0.58], [0.26, 0.44]]) {
      g.moveTo(0.1 * u, y * u); g.lineTo((0.12 + len) * u, y * u * 1.12);
    }
    g.moveTo(-0.18 * u, 0.3 * u); g.lineTo(0.16 * u, 0.62 * u);
    g.stroke();
    g.strokeStyle = edge; g.lineWidth = WS.max(1, u * 0.05);
    g.beginPath();
    if (g.roundRect) g.roundRect(-0.5 * u, -0.34 * u, 0.66 * u, 0.68 * u, 0.2 * u);
    else g.rect(-0.5 * u, -0.34 * u, 0.66 * u, 0.68 * u);
    g.stroke();
    g.restore();
  }
  R.drawStrikes = function (ctx) {
    const pool = WS.FX.strikes;
    if (!pool || !pool.count) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < pool.count; i++) {
      const s = pool.active[i];
      const t = 1 - WS.clamp(s.life / s.maxLife, 0, 1);
      const e = 1 - (1 - t) * (1 - t);
      const full = s.arc >= WS.TAU - 0.01;
      const a0 = s.aim - s.arc / 2, a1 = s.aim + s.arc / 2;
      const base = s.blend ? WS.mix(s.colour, s.blend, 0.45) : s.colour;
      const edge = s.evolved ? WS.mix(base, [1, 0.84, 0.42], 0.6) : WS.mix(base, [1, 1, 1], 0.55);
      const k = 1 - t;
      // the shockwave: a band riding out to the reach, thinning as it goes
      const rr = s.reach * (0.5 + 0.55 * e);
      ctx.globalAlpha = 0.55 * k;
      ctx.strokeStyle = WS.rgb(base, 1);
      ctx.lineWidth = WS.max(2, s.reach * 0.16 * k);
      ctx.beginPath();
      if (full) ctx.arc(s.x, s.y, rr, 0, WS.TAU); else ctx.arc(s.x, s.y, rr, a0, a1);
      ctx.stroke();
      ctx.globalAlpha = 0.9 * k;
      ctx.strokeStyle = WS.rgb(edge, 1);
      ctx.lineWidth = WS.max(1.2, s.reach * 0.035 * k);
      ctx.beginPath();
      if (full) ctx.arc(s.x, s.y, rr * 1.04, 0, WS.TAU); else ctx.arc(s.x, s.y, rr * 1.04, a0 + 0.05, a1 - 0.05);
      ctx.stroke();
      // speed lines through the cone
      const lines = full ? 12 : 6;
      ctx.strokeStyle = WS.rgb(edge, 1);
      ctx.lineWidth = 1.6;
      for (let n = 0; n < lines; n++) {
        const u = ((s.seed * 0.37 + n * 0.618) % 1);
        const a = full ? (n / lines) * WS.TAU + s.seed : a0 + s.arc * (0.08 + 0.84 * u);
        const r0 = s.reach * (0.18 + 0.35 * e), r1 = s.reach * (0.45 + 0.5 * e) * (0.85 + 0.15 * ((n * 0.37) % 1));
        ctx.globalAlpha = 0.6 * k * k;
        ctx.beginPath();
        ctx.moveTo(s.x + WS.cos(a) * r0, s.y + WS.sin(a) * r0);
        ctx.lineTo(s.x + WS.cos(a) * r1, s.y + WS.sin(a) * r1);
        ctx.stroke();
      }
      // the hand: pops in, then fades as it pushes on
      const pop = t < 0.18 ? t / 0.18 : 1;
      const hands = full ? 6 : 1;
      const hu = s.reach * (full ? 0.27 : 0.36) * (0.8 + 0.35 * e);
      const fill = WS.rgb(WS.mix(base, [1, 1, 1], 0.25), 1), rim = WS.rgb(edge, 1);
      for (let h = 0; h < hands; h++) {
        const a = full ? s.aim + (h / hands) * WS.TAU : s.aim;
        const d = s.reach * (full ? 0.72 : 0.62) * (0.8 + 0.3 * e);
        ctx.save();
        ctx.translate(s.x + WS.cos(a) * d, s.y + WS.sin(a) * d);
        ctx.rotate(a);
        if (s.side || (full && h % 2)) ctx.scale(1, -1);
        ctx.globalAlpha = (full ? 0.38 : 0.55) * pop * k;
        handShape(ctx, hu, fill, rim);
        ctx.restore();
      }
    }
    ctx.restore();
  };

  const LIGHT_EASY = 60, LIGHT_SPAN = 300, LIGHT_FLOOR = 0.45;
  R.lightDim = 1;
  R.drawFlashes = function (ctx) {
    const flashes = WS.FX.flashes;
    const dim = R.lightDim || 1;
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
        ctx.globalAlpha = dim;          // drawNova's gradients multiply by this
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

      ctx.globalAlpha = (1 - t) * (1 - t) * 0.9 * dim;
      ctx.strokeStyle = WS.rgb(f.colour, 1);
      ctx.lineWidth = WS.max(1, f.radius * 0.1 * (1 - e) + 1);
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, WS.TAU); ctx.stroke();

      // A white leading edge for the first half, so the moment of contact is
      // the brightest thing in the effect and not the aftermath.
      if (t < 0.5) {
        ctx.globalAlpha = (1 - t * 2) * 0.7 * dim;
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
        ctx.globalAlpha = (1 - t) * 0.85 * dim;
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
      ctx.globalAlpha = WS.clamp(p.life / p.maxLife, 0, 1) * (R.lightDim || 1);
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

    // Where the next Solar Flare's openings will be when it reaches you.
    WS.FinaleArt.ringLanding(ctx, A.hazards.filter((h) => h.shape === 'ring'), WS.Game.player, time);
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
        WS.FinaleArt.ringGapEdges(ctx, h, [1.0, 0.75, 0.35]);

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
            const dz = R.danger();
            ctx.fillStyle = `rgba(${dz.deep},${(0.10 + 0.20 * k).toFixed(3)})`;
            ctx.fillRect(x, y, w, hh);
            // Hazard hatching, clipped to the cell, tightening as it lands.
            ctx.beginPath(); ctx.rect(x, y, w, hh); ctx.clip();
            const gap = 18 - 8 * k;
            ctx.strokeStyle = `rgba(${dz.hatch},${(0.30 + 0.5 * k).toFixed(3)})`;
            ctx.lineWidth = 1 + 1.6 * k;
            ctx.beginPath();
            for (let d = -hh; d < w; d += gap) {
              ctx.moveTo(x + d, y + hh);
              ctx.lineTo(x + d + hh, y);
            }
            ctx.stroke();
            ctx.restore(); ctx.save();
            ctx.strokeStyle = `rgba(${dz.edge},${(0.5 + 0.45 * k).toFixed(3)})`;
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
        ctx.globalAlpha = telegraphing ? (R.calm() ? 0.4 : 0.25 + 0.25 * WS.sin(time * 14)) : 0.75;
        ctx.fillStyle = R.vivid() ? (telegraphing ? 'rgba(255,150,240,.6)' : 'rgba(230,50,200,.75)')
          : telegraphing ? 'rgba(255,180,90,.6)' : 'rgba(255,120,60,.75)';
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
  const HUD_SAFE_MIN = 108;
  /* The line the banner hangs from. It was a constant, measured against the
     timeline alone - and a boss arriving puts its health bar under the
     timeline in the same instant its banner opens, so the dread card's
     medallion landed on the bar's figures. The line now sits under whatever
     the HUD is actually showing up there. */
  let HUD_SAFE = HUD_SAFE_MIN;
  function hudSafe() {
    let y = HUD_SAFE_MIN;
    const bar = document.getElementById('hud-boss');
    if (bar && !bar.classList.contains('hidden') && bar.offsetParent !== null) {
      const r = bar.getBoundingClientRect();
      if (r.height > 0) y = WS.max(y, r.bottom + 10);
    }
    return y;
  }
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
    HUD_SAFE = hudSafe();
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
