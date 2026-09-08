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

  R.init = function (canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
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
  R.buildScenery = function (map) {
    // Ground: a 256px tile of mottled earth in the zone's palette, drawn once
    // and repeated, so the field never costs more than one fillRect a frame.
    const tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    const g = tile.getContext('2d');
    g.fillStyle = WS.hex(map.ground);
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 220; i++) {
      const x = WS.random() * 256, y = WS.random() * 256;
      const r = 6 + WS.random() * 26;
      g.globalAlpha = 0.05 + WS.random() * 0.10;
      g.fillStyle = WS.hex(WS.random() < 0.5 ? map.groundAlt : WS.shade(map.ground, 0.6));
      g.beginPath(); g.ellipse(x, y, r, r * 0.62, WS.random() * WS.PI, 0, WS.TAU); g.fill();
    }
    g.globalAlpha = 1;
    this.ground = this.ctx.createPattern(tile, 'repeat');
    this.groundTint = map.ground;

    // Props: scattered decoration, drawn dark so they never fight the horde.
    this.props.length = 0;
    if (map.props && map.props.length) {
      for (let i = 0; i < 46; i++) {
        const kind = map.props[WS.randInt(0, map.props.length - 1)];
        this.props.push({
          kind,
          x: WS.randRange(-60, W + 60),
          y: WS.randRange(-40, H + 40),
          size: WS.randRange(46, 96),
          alpha: WS.randRange(0.35, 0.7),
        });
      }
      this.props.sort((a, b) => a.y - b.y);
    }
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

    /* ---- ground ---------------------------------------------------------- */
    if (this.ground) {
      ctx.fillStyle = this.ground;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(0, 0, W, H);
    }

    if (!game.player) { ctx.restore(); this.drawVignette(ctx); return; }
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
    this.drawAuras(ctx, player, time);
    if (WS.Arena.active) this.drawArena(ctx, time);

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

    if (e.boss) {
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f2c9ff';
      ctx.fillText(t.name, e.x, e.y - e.radius * 2.1);
    } else if (e.elite) {
      ctx.font = '600 10px system-ui, sans-serif';
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
    const bob = p.moving ? WS.sin(p.walkCycle) * 2.5 : WS.sin(p.walkCycle) * 1.2;
    shadow(ctx, p.x, p.y + p.radius * 0.7, p.radius * 0.9);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#f5c56b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.radius * 0.7, p.radius * 1.15, p.radius * 0.46, 0, 0, WS.TAU);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    if (p.invulnerable > 0) ctx.globalAlpha = (WS.floor(p.invulnerable * 12) % 2 === 0) ? 0.45 : 0.95;
    ctx.translate(p.x, p.y + bob);
    if (p.spinTimer > 0) ctx.rotate(time * 14);
    else if (p.facing < 0) ctx.scale(-1, 1);
    const sprite = WS.Sprites.hero(p.characterId, p.character.color, size, demon);
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

  R.drawZones = function (ctx, time) {
    const zones = WS.Projectile.zones;
    ctx.save();
    for (let i = 0; i < zones.count; i++) {
      const z = zones.active[i];
      const fade = WS.clamp(z.life / z.maxLife, 0, 1);
      const grd = ctx.createRadialGradient(z.x, z.y, z.radius * 0.2, z.x, z.y, z.radius);
      grd.addColorStop(0, WS.rgb(z.colour, 0.30 * fade));
      grd.addColorStop(1, WS.rgb(z.colour, 0.02));
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, WS.TAU); ctx.fill();
      ctx.globalAlpha = 0.55 * fade;
      ctx.strokeStyle = WS.rgb(z.colour, 1);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius * (0.98 + 0.02 * WS.sin(time * 4 + z.phase)), 0, WS.TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  R.drawGems = function (ctx, time) {
    const gems = WS.XP.pool;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < gems.count; i++) {
      const g = gems.active[i];
      const s = g.size * (1 + 0.08 * WS.sin(time * 5 + g.spin));
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.spin);
      ctx.fillStyle = WS.rgb(g.colour, 0.95);
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  R.drawPickups = function (ctx, time) {
    const pool = WS.Pickup.pool;
    for (let i = 0; i < pool.count; i++) {
      const p = pool.active[i];
      const lift = WS.sin(p.bob) * 3;
      shadow(ctx, p.x, p.y + p.radius * 0.7, p.radius * 0.7, 0.24);
      const size = p.type.size;
      const icon = WS.Icons.glyph(p.type.art, p.type.tint, size);
      ctx.drawImage(icon, p.x - size / 2, p.y - size / 2 + lift, size, size);
      if (p.type.noMagnet) {
        // Destination pickups get a beacon so they are findable across a field.
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.25 * WS.sin(time * 4);
        ctx.strokeStyle = WS.hex(p.type.tint);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.9 + 6 * WS.sin(time * 2), 0, WS.TAU); ctx.stroke();
        ctx.restore();
      }
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
      ctx.save();
      ctx.translate(b.x, b.y);
      const ang = b.spinRate ? b.spin : WS.atan2(b.vy, b.vx);
      ctx.rotate(ang);
      const c = b.colour;
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
      grd.addColorStop(0, WS.rgb(c, 0.95));
      grd.addColorStop(0.4, WS.rgb(c, 0.45));
      grd.addColorStop(1, WS.rgb(c, 0));
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, WS.TAU); ctx.fill();
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
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, h.radius * 2.2);
      grd.addColorStop(0, WS.rgb(h.colour, 1));
      grd.addColorStop(1, WS.rgb(h.colour, 0));
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, h.radius * 2.2, 0, WS.TAU); ctx.fill();
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
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + o.angle * 2);
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, o.size);
        grd.addColorStop(0, WS.rgb(o.colour, 0.9));
        grd.addColorStop(1, WS.rgb(o.colour, 0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(0, 0, o.size, 0, WS.TAU); ctx.fill();
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
      ctx.globalAlpha = fade;
      ctx.strokeStyle = WS.rgb(b.colour, 0.55);
      ctx.lineWidth = b.width;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = WS.max(1.5, b.width * 0.25);
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
      const r = f.radius * (0.35 + 0.65 * t);
      ctx.globalAlpha = (1 - t) * 0.75;
      ctx.strokeStyle = WS.rgb(f.colour, 1);
      ctx.lineWidth = WS.max(1.5, f.radius * 0.06 * (1 - t) + 1);
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, WS.TAU); ctx.stroke();
      ctx.globalAlpha = (1 - t) * 0.22;
      ctx.fillStyle = WS.rgb(f.colour, 1);
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, WS.TAU); ctx.fill();
    }
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
      ctx.globalAlpha = fade;
      ctx.font = `700 ${t.size}px system-ui, "Segoe UI", sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(4,6,10,.85)';
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
          // Safe ground reads green and steady; doomed ground reddens as the
          // spear falls, so the choice is legible at a glance.
          const k = 1 - h.telegraph / WS.Arena.tuning.spearTele;
          ctx.fillStyle = h.safe
            ? 'rgba(61,220,122,.14)'
            : `rgba(226,72,61,${0.12 + 0.26 * k})`;
          ctx.fillRect(h.x + 3, h.y + 3, h.w - 6, h.h - 6);
          ctx.strokeStyle = h.safe ? 'rgba(110,240,160,.75)' : 'rgba(255,140,110,.75)';
          ctx.lineWidth = 2;
          ctx.strokeRect(h.x + 3, h.y + 3, h.w - 6, h.h - 6);
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
  R.drawVignette = function (ctx) {
    const grd = ctx.createRadialGradient(
      this.viewW / 2, this.viewH / 2, WS.min(this.viewW, this.viewH) * 0.35,
      this.viewW / 2, this.viewH / 2, WS.max(this.viewW, this.viewH) * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
  };

  /** The Arclight banner: a swept arc of light with the announcement over it. */
  R.drawBanner = function (ctx) {
    const b = WS.Game.banner;
    if (!b) return;
    const k = WS.clamp(b.life / b.maxLife, 0, 1);
    const appear = WS.clamp((1 - k) * 5, 0, 1);       // sweep in over the first fifth
    const fade = WS.clamp(k * 3, 0, 1);
    const alpha = WS.min(appear, fade);
    const y = this.viewH * 0.22;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';

    const w = WS.min(this.viewW * 0.8, 900) * appear;
    const grd = ctx.createLinearGradient(this.viewW / 2 - w / 2, 0, this.viewW / 2 + w / 2, 0);
    grd.addColorStop(0, 'rgba(245,197,107,0)');
    grd.addColorStop(0.5, 'rgba(245,197,107,.85)');
    grd.addColorStop(1, 'rgba(245,197,107,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(this.viewW / 2 - w / 2, y + 26, w, 1.5);

    ctx.font = '600 30px system-ui, "Segoe UI", sans-serif';
    ctx.letterSpacing = '2px';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(4,6,10,.8)';
    ctx.strokeText(b.title, this.viewW / 2, y);
    ctx.fillStyle = '#ffe6ae';
    ctx.fillText(b.title, this.viewW / 2, y);

    if (b.subtitle) {
      ctx.font = '400 15px system-ui, "Segoe UI", sans-serif';
      ctx.fillStyle = '#c9cfdd';
      ctx.strokeText(b.subtitle, this.viewW / 2, y + 52);
      ctx.fillText(b.subtitle, this.viewW / 2, y + 52);
    }
    ctx.restore();
  };

  WS.Renderer = R;

})(window.WS);
