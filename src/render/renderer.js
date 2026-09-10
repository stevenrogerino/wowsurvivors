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

  R.init = function (canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
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
    this.lite = WS.Save.settings.quality === 'balanced';
  };

  R.resize = function () {
    const dpr = WS.min(window.devicePixelRatio || 1, 2);
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
        this.props.push({ kind, x, y,
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

  function healthBar(ctx, e) {
    if (e.health >= e.maxHealth) return;
    const w = e.radius * 2, h = 3;
    const x = e.x - w / 2, y = e.y - e.radius * 1.9;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x, y, w, h);
    const pct = WS.clamp(e.health / e.maxHealth, 0, 1);
    ctx.fillStyle = e.boss ? '#e2483d' : e.elite ? '#f5c56b' : '#c6483d';
    ctx.fillRect(x, y, w * pct, h);
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
    for (const p of this.props) {
      ctx.globalAlpha = p.alpha;
      const sprite = WS.Sprites.prop(p.kind, p.size);
      ctx.drawImage(sprite, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    /* ---- ground effects (zones, auras, arena hazards) -------------------- */
    this.drawZones(ctx, time);
    this.drawHazards(ctx, time);
    this.drawTelegraphs(ctx, time);
    this.drawPlayerMark(ctx, player, time);
    this.drawAuras(ctx, player, time);
    if (WS.Arena.active) this.drawArena(ctx, time);

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

    for (const e of draws) {
      if (e === player) this.drawPlayer(ctx, player, time);
      else if (e.spec) this.drawFamiliar(ctx, e, time);
      else this.drawEnemy(ctx, e, time);
    }

    /* ---- air: bolts, orbits, beams -------------------------------------- */
    this.drawOrbits(ctx, player);
    this.drawBolts(ctx);
    this.drawBeams(ctx);

    /* ---- effects --------------------------------------------------------- */
    this.drawFlashes(ctx);
    this.drawParticles(ctx);
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
      ctx.scale(c.facing < 0 ? -(1 + t * 0.3) : (1 + t * 0.3), 1 - t * 0.55);
      const sprite = WS.Sprites.creature(c.art, c.tint, c.size);
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
  R.drawEnemy = function (ctx, e, time) {
    const t = e.template;
    const size = e.spriteSize;
    const bob = WS.sin(e.bob) * (e.boss ? 3 : 2);
    shadow(ctx, e.x, e.y + e.radius * 0.55, e.radius * 0.85);

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

    const sprite = WS.Sprites.creature(t.art, e.chilled ? [0.55, 0.8, 1.0] : t.tint, size);
    ctx.save();
    ctx.translate(e.x, e.y + bob);
    // Bracing for a charge: the body compresses, then springs.
    if (e.windup > 0) {
      const k = 1 - e.windup / (e.windupMax || WS.Config.chargeWindup);
      ctx.scale(1 + k * 0.14, 1 - k * 0.12);
    }
    if (e.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(sprite, -size / 2, -size * 0.62, size, size);
    ctx.restore();

    if (e.flash > 0) {
      // A hit tints the silhouette rather than replacing it.
      ctx.save();
      ctx.globalAlpha = WS.clamp(e.flash / 0.09, 0, 1) * 0.75;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = e.flashCrit ? '#ffd45c' : '#ff6b5c';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + bob, e.radius * 0.95, e.radius * 1.05, 0, 0, WS.TAU);
      ctx.fill();
      ctx.restore();
    }

    if (WS.Save.settings.showHealthBars || e.elite || e.boss) healthBar(ctx, e);

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
    if (p.spinTimer > 0) ctx.rotate(time * 14);
    else if (p.facing < 0) ctx.scale(-1, 1);
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
    const sprite = WS.Sprites.hero(p.characterId, p.character.color, size, demon, frame, pose);
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

  R.drawZones = function (ctx, time) {
    const zones = WS.Projectile.zones;
    ctx.save();
    for (let i = 0; i < zones.count; i++) {
      const z = zones.active[i];
      const fade = WS.clamp(z.life / z.maxLife, 0, 1);
      const R = z.radius;

      /* A zone used to be a flat disc under a plain hard ring, which read as a
         circle drawn on the grass rather than something happening to it. Four
         cheap passes fix that: ground it, fill it, edge it twice, and turn a
         ring of graduations - the same language the health gauge uses, which
         is what makes it read as a spell and not a decal. */

      // 1. Scorch. The ground goes darker under the effect, so it sits IN the
      //    world instead of floating over it.
      ctx.globalCompositeOperation = 'source-over';
      if (!this.lite) {
      const burn = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, R);
      burn.addColorStop(0, `rgba(0,0,0,${0.28 * fade})`);
      burn.addColorStop(0.75, `rgba(0,0,0,${0.16 * fade})`);
      burn.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = burn;
      ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, WS.TAU); ctx.fill();
      }

      // 2. The energy itself, hottest off-centre so it does not read as a lamp.
      ctx.globalCompositeOperation = 'lighter';
      const grd = ctx.createRadialGradient(z.x, z.y, R * 0.15, z.x, z.y, R);
      grd.addColorStop(0, WS.rgb(z.colour, 0.34 * fade));
      grd.addColorStop(0.62, WS.rgb(z.colour, 0.17 * fade));
      grd.addColorStop(1, WS.rgb(z.colour, 0));
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, WS.TAU); ctx.fill();

      // 3. Two edges: a soft one just inside, a bright hairline on the rim.
      const breathe = 0.98 + 0.02 * WS.sin(time * 4 + z.phase);
      ctx.globalAlpha = 0.3 * fade;
      ctx.strokeStyle = WS.rgb(z.colour, 1);
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(z.x, z.y, R * breathe * 0.94, 0, WS.TAU); ctx.stroke();
      ctx.globalAlpha = 0.85 * fade;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(z.x, z.y, R * breathe, 0, WS.TAU); ctx.stroke();

      // 4. Graduations, turning slowly. Twelve, so the rotation is legible
      //    without the ring ever looking like it is strobing.
      ctx.globalAlpha = 0.55 * fade;
      ctx.lineWidth = 2;
      const spin = time * 0.5 + z.phase;
      for (let n = 0; this.lite ? false : n < 12; n++) {
        const a = spin + (n / 12) * WS.TAU;
        const ca = WS.cos(a), sa = WS.sin(a);
        ctx.beginPath();
        ctx.moveTo(z.x + ca * R * 0.86, z.y + sa * R * 0.86);
        ctx.lineTo(z.x + ca * R * 0.97, z.y + sa * R * 0.97);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
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
    for (let i = 0; i < gems.count; i++) {
      const g = gems.active[i];
      const d = WS.dist(g.x, g.y, player.x, player.y);
      const pulled = d < player.pickupRadius || WS.XP.vacuumTimer > 0;
      const near = WS.clamp(1 - (d - player.pickupRadius) / 260, 0, 1);
      /* Only gems in play breathe. The pulse used to run on every gem on the
         field, and a hundred marks pulsing on independent phases is not life,
         it is static - so it is spent where it means something: on the ones
         being pulled in, and for a moment on one that has just absorbed
         another. */
      const swell = (pulled ? 1 + 0.07 * WS.sin(time * 5 + g.spin) : 1)
        + (g.pop > 0 ? g.pop * 1.6 : 0);
      const s = g.size * (pulled ? 1.2 : 0.94 + near * 0.14) * swell;

      if (pulled && !this.lite) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const [tx, ty] = WS.normalize(g.x - player.x, g.y - player.y);
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = WS.rgb(g.colour, 1);
        ctx.lineWidth = s * 0.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.lineTo(g.x + tx * s * 2.4, g.y + ty * s * 2.4);
        ctx.stroke();
        ctx.restore();
      }

      /* A gem at rest is quieter than one in play, but it is never a ghost.
       * The floor here used to be 0.26, which is where the vanishing happened;
       * loot the player has not walked to yet is still loot. */
      ctx.globalAlpha = pulled ? 1 : 0.78 + near * 0.22;
      const art = gemSprite(g.tier, g.colour);
      /* The stone is GEM_R of the sprite's width, so blitting at five times
       * `s` puts it back at exactly the radius the rest of the game means by
       * `s`. Getting this wrong is silent and looks like a taste decision:
       * blitted at 2.5x the gems came out at half size and simply read as
       * "smaller than before" rather than as a bug. */
      const w = s / GEM_R;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.spin);
      ctx.drawImage(art, -w / 2, -w / 2, w, w);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  /* The five that change a run: a bomb, a lodestone, an hourglass, a chest, a
   * supply crate. These are the decisions on the field - the moments a player
   * breaks off what they were doing and goes to get something - and they were
   * drawn as small flat glyphs lying on the grass, which is how scenery is
   * drawn. Measured against the floor beside them, the bomb cleared 274 of
   * colour distance across THIRTY-FOUR PIXELS: a bright speck, not a landmark. */
  const CALLOUT = { bomb: 1, stone: 1, hourglass: 1, chest: 1, cache: 1 };

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

      const icon = WS.Icons.glyph(p.type.art, p.type.tint, size);
      ctx.drawImage(icon, p.x - size / 2, y - size / 2, size, size);

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
      ctx.globalAlpha = 1;
    }
  };

  /** Steel keeps a silhouette; magic stays a streak of light. Drawn in the
   *  bolt's local space, already rotated to its heading. */
  function drawBoltShape(ctx, b, r) {
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    switch (b.art) {
      case 'dagger':
        ctx.beginPath();
        ctx.moveTo(r * 1.9, 0); ctx.lineTo(0, -r * 0.5);
        ctx.lineTo(-r * 1.0, 0); ctx.lineTo(0, r * 0.5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(60,44,30,.95)';
        ctx.fillRect(-r * 1.5, -r * 0.28, r * 0.6, r * 0.56);
        break;
      case 'arrow':
        ctx.fillRect(-r * 1.6, -r * 0.16, r * 3.0, r * 0.32);
        ctx.beginPath();
        ctx.moveTo(r * 1.9, 0); ctx.lineTo(r * 0.7, -r * 0.55); ctx.lineTo(r * 0.7, r * 0.55);
        ctx.closePath(); ctx.fill();
        break;
      case 'axe':
      case 'sword':
        ctx.beginPath();
        ctx.moveTo(r * 1.7, 0); ctx.lineTo(0, -r * 0.75);
        ctx.lineTo(-r * 1.2, 0); ctx.lineTo(0, r * 0.75);
        ctx.closePath(); ctx.fill();
        break;
      case 'shield':
        ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, WS.TAU); ctx.fill();
        ctx.strokeStyle = WS.rgb(b.colour, 1);
        ctx.lineWidth = WS.max(1.5, r * 0.28);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, WS.TAU); ctx.stroke();
        break;
      default:
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.2, r * 0.55, 0, 0, WS.TAU);
        ctx.fill();
    }
  }

  R.drawBolts = function (ctx) {
    const bolts = WS.Projectile.bolts;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < bolts.count; i++) {
      const b = bolts.active[i];
      const r = b.radius;
      const c = b.colour;

      /* The streak. Every bolt has carried a `trail` flag since launch and
         nothing ever read it, so the whole arsenal flew without motion.
         Length comes from actual speed, so a lobbed bolt barely has one and a
         fast one draws a hard line - which is the cue for how quickly a shot
         crosses the field, and the one that makes a seeking missile's curve
         legible instead of a dot teleporting along an arc. */
      if (b.trail !== false && !this.lite) {
        const speed = WS.sqrt(b.vx * b.vx + b.vy * b.vy);
        // The streak has to clear the bolt's own glow, which reaches r*2.4, or
        // it just thickens the blob. At 0.055 it did exactly that.
        const len = WS.min(speed * 0.13, r * 14);
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
      if (this.lite) {
        ctx.fillStyle = WS.rgb(c, 0.4);
        ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, WS.TAU); ctx.fill();
      } else {
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
        grd.addColorStop(0, WS.rgb(c, 0.95));
        grd.addColorStop(0.4, WS.rgb(c, 0.45));
        grd.addColorStop(1, WS.rgb(c, 0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, WS.TAU); ctx.fill();
      }
      drawBoltShape(ctx, b, r);
      ctx.restore();
    }
    // Hostile bolts read as hard-edged, so they never blur into friendly fire.
    const host = WS.Projectile.hostiles;
    for (let i = 0; i < host.count; i++) {
      const h = host.active[i];
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.spin);
      if (this.lite) {
        ctx.fillStyle = WS.rgb(h.colour, 0.55);
        ctx.beginPath(); ctx.arc(0, 0, h.radius * 1.4, 0, WS.TAU); ctx.fill();
      } else {
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, h.radius * 2.2);
        grd.addColorStop(0, WS.rgb(h.colour, 1));
        grd.addColorStop(1, WS.rgb(h.colour, 0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(0, 0, h.radius * 2.2, 0, WS.TAU); ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.radius * 0.8, 0, WS.TAU); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  R.drawOrbits = function (ctx, player) {
    const orbits = WS.Projectile.orbits;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < orbits.count; i++) {
      const o = orbits.active[i];
      for (let n = 0; n < o.count; n++) {
        const a = o.angle + (n / o.count) * WS.TAU;
        const x = player.x + WS.cos(a) * o.radius;
        const y = player.y + WS.sin(a) * o.radius;

        // The path just travelled, fading behind. Without it an orbiting blade
        // is a diamond that happens to be somewhere, not one that is moving.
        const dir = o.speed >= 0 ? -1 : 1;
        for (let k = 1; this.lite ? false : k <= 5; k++) {
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
          const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, o.size);
          grd.addColorStop(0, WS.rgb(o.colour, 0.9));
          grd.addColorStop(1, WS.rgb(o.colour, 0));
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(0, 0, o.size, 0, WS.TAU); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath();
        ctx.moveTo(0, -o.size * 0.7); ctx.lineTo(o.size * 0.28, 0);
        ctx.lineTo(0, o.size * 0.7); ctx.lineTo(-o.size * 0.28, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  };

  R.drawBeams = function (ctx) {
    const beams = WS.Projectile.beams;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < beams.count; i++) {
      const b = beams.active[i];
      const fade = WS.clamp(b.life / b.maxLife, 0, 1);
      // Three passes - bloom, body, core - so a beam reads as light with a hot
      // centre rather than a coloured stick laid on the ground.
      ctx.globalAlpha = fade * 0.5;
      ctx.strokeStyle = WS.rgb(b.colour, 0.35);
      ctx.lineWidth = b.width * 2.2;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = WS.rgb(b.colour, 0.6);
      ctx.lineWidth = b.width;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth = WS.max(1.5, b.width * 0.22);
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    }
    ctx.restore();
  };

  R.drawFlashes = function (ctx) {
    const flashes = WS.FX.flashes;
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

      // The core: bright, and gone inside the first third. This is the hit.
      const core = WS.clamp(1 - t * 3, 0, 1);
      if (core > 0 && !this.lite) {
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
    }
    ctx.globalAlpha = 1;
    ctx.restore();
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
    for (let i = 0; i < texts.count; i++) {
      const t = texts.active[i];
      const fade = WS.clamp(t.life / t.maxLife, 0, 1);
      const age = 1 - fade;
      // A short overshoot on arrival, easing back to size.
      const pop = t.pop ? 1 + t.pop * 0.55 * WS.max(0, 1 - age * 6) : 1;
      ctx.globalAlpha = WS.min(1, fade * 2.2);
      ctx.font = `600 ${WS.round(t.size * pop)}px ${UI_FONT}`;
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

  R.drawMenuScene = function (ctx, time) {
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
    ctx.font = `600 ${b.kind === 'plain' ? 30 : 38}px ${UI_FONT}`;
    ctx.letterSpacing = dread ? '3px' : '1.5px';
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
      ctx.font = `400 15.5px ${UI_FONT}`;
      ctx.letterSpacing = '0.4px';
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
    ctx.drawImage(WS.Sprites.creature(b.art, b.tint || [0.8, 0.3, 0.3], S),
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
