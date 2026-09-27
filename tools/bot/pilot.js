/* The pilot: an autopilot that plays the way a good player does, so that
 * what a harness measures is the game and not the bot's blind spots.
 *
 * The bots before this one fled whatever was nearest. That walks straight
 * into bolts, charge lanes, puddles and storm strikes it never looked at,
 * pins itself in a corner, never picks up a potion, and never levels - so a
 * blessing that made up for those mistakes (a heal, a dodge) measured as
 * stronger than it would ever be in a player's hands, and one that rewards
 * standing well measured as nothing.
 *
 * WHAT IT CAN DO is exactly what a player can: hold one of eight directions,
 * or none, at the survivor's real speed. It reads only what the screen shows
 * - bodies, bolts, telegraphed lanes, fusing ground, storm marks, the
 * finale's marks, pickups - and replans a few times a second.
 *
 * HOW IT DECIDES. Every `replan` seconds it scores 27 short plans: each of
 * the nine first moves, held for a beat, then carried on straight or turned
 * 45 degrees either way. Each plan is walked forward over `horizon` seconds
 * with the world moving too - every creature near enough to matter is
 * predicted the way it actually moves (it chases, it holds at range, it
 * winds up and then runs its lane), bolts fly on their velocity and are
 * tested by exact closest approach so a fast one cannot slip between two
 * samples, hazards arm when their fuse runs out, storm strikes land when
 * their mark says. A plan costs what it would take, priced as a share of the
 * health left, plus how boxed-in it ends up (walls count), plus how much of
 * the crowd it stays pressed against; it earns back what it gets closer to
 * - a gem cluster, a potion when hurt, a chest, a supply crate, a shrine.
 * The cheapest plan's first move is the one it holds.
 *
 * It is installed into the page by tools/botlab.js (and anything else that
 * wants it) from this function's source, so it has no imports: WS is all it
 * sees.
 *
 *   installPilot({ replan: 0.1 })          the default, a strong player
 *   installPilot({ replan: 0.2, noise: 25 }) a slower, sloppier one
 *   installKiter()                          the old flee-the-nearest bot
 */
'use strict';

function installPilot(opts) {
  const O = Object.assign({
    replan: 0.1,        // seconds between decisions (a human's reaction is ~0.15-0.25)
    horizon: 0.9,       // how far ahead a plan is walked
    turnAt: 0.3,        // when a plan may turn
    noise: 0,           // random cost jitter: 0 plays its best, 20+ plays sloppily
    goals: true,        // go for gems, potions, chests, crates, shrines
    stance: 'kite',     // 'kite' keeps its distance; 'brawl' stays at arm's length
    // The weights, fitted by tools/botlab.js sweeps (see the header there).
    // A certain hit costs hit0 + hitSev * (the share of health it takes);
    // the rest are guesses about hits to come, and must not outvote one.
    hit0: 60, hitSev: 500, press: 14, enclose: 22, edge: 1.2, centre: 0.01, steady: 3,
  }, opts || {});
  const S8 = Math.SQRT1_2;
  // Index 0 is standing still; 1..8 walk round the compass, so +-1 is a 45° turn.
  const DIRS = [[0, 0], [1, 0], [S8, S8], [0, 1], [-S8, S8], [-1, 0], [-S8, -S8], [0, -1], [S8, -S8]];
  const TS = [0.1, 0.2, 0.3, 0.45, 0.6, 0.9].filter((t) => t <= O.horizon + 1e-9);
  const P = window.__pilot = {
    opts: O, dir: 0, replan: 0, goal: null,
    stats: { plans: 0, ms: 0 },
  };

  /* ------------------------------------------------------------ helpers -- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function bounds(p) {
    const ab = WS.Game.arenaBounds;
    return {
      minX: (ab ? ab.minX : 0) + p.radius, maxX: (ab ? ab.maxX : WS.CONST.WORLD_WIDTH) - p.radius,
      minY: (ab ? ab.minY : 0) + p.radius, maxY: (ab ? ab.maxY : WS.CONST.WORLD_HEIGHT) - p.radius,
    };
  }
  function speedOf(p) {
    let s = p.moveSpeed * WS.Primal.moveMult(p) * WS.Moor.moveMult();
    if (p.slowTimer > 0) s *= p.slowFactor;
    return s;
  }
  /** What a blow of `dmg` costs, as a share of the health left - so the same
   *  hit is a nuisance at full health and the whole question at a sliver. */
  function severity(p, dmg) {
    const armor = (p.armor || 0) + WS.Calling.armor(p);
    const red = armor > 0 ? armor / (armor + WS.Config.armorConstant) : 0;
    return clamp(dmg * (1 - red) / Math.max(1, p.health), 0, 3);
  }
  function hitCost(p, dmg) { return O.hit0 + O.hitSev * severity(p, dmg); }
  function inLane(ox, oy, dx, dy, len, w, x, y, pad) {
    const rx = x - ox, ry = y - oy;
    const along = rx * dx + ry * dy, across = -rx * dy + ry * dx;
    return along >= -pad && along <= len + pad && Math.abs(across) <= w / 2 + pad;
  }
  /** Closest two points moving in straight lines get over a step: the
   *  minimum of |(a0-b0) + s((a1-a0)-(b1-b0))| for s in [0, 1]. */
  function closest(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) {
    const rx = ax0 - bx0, ry = ay0 - by0;
    const vx = (ax1 - ax0) - (bx1 - bx0), vy = (ay1 - ay0) - (by1 - by0);
    const vv = vx * vx + vy * vy;
    const s = vv > 1e-9 ? clamp(-(rx * vx + ry * vy) / vv, 0, 1) : 0;
    return Math.hypot(rx + vx * s, ry + vy * s);
  }

  /* --------------------------------------------------------- the world -- */
  /** Everything near enough to matter, snapshotted once per decision with
   *  how it is going to move. */
  function observe(p, speed) {
    const reach = speed * O.horizon + 300;
    const foes = [];
    const frozen = WS.Enemy.freezeTimer > 0;
    WS.Enemy.grid.query(p.x, p.y, reach, (e) => {
      if (e._dead || e.hidden) return;
      const t = e.template;
      const f = {
        e, x: e.x, y: e.y, r: e.radius, dmg: e.damage,
        speed: (frozen && t.family !== 'death') || e.stationary ? 0
          : e.speed * (e.slowTimer > 0 ? e.slowFactor : 1),
        hold: t.ranged ? t.ranged.range : 0,
        windup: e.windup > 0 ? e.windup : 0,
        charge: 0, cdx: 0, cdy: 0, cv: 0,
      };
      if (e.chargeTimer > 0 && e.chargeDir) {
        f.charge = e.chargeTimer; f.cdx = e.chargeDir[0]; f.cdy = e.chargeDir[1];
        f.cv = e.chargeLen / Math.max(0.01, e.chargeDur);
      } else if (e.windup > 0 && e.telegraph) {
        f.charge = e.chargeDur; f.cdx = e.telegraph.dx; f.cdy = e.telegraph.dy;
        f.cv = e.chargeLen / Math.max(0.01, e.chargeDur);
        f.lane = { len: e.chargeLen, w: e.telegraph.width, locked: !!e.telegraph.locked };
      }
      foes.push(f);
    });
    const bolts = [];
    const hs = WS.Projectile.hostiles;
    for (let i = 0; i < hs.count; i++) {
      const h = hs.active[i];
      if (Math.hypot(h.x - p.x, h.y - p.y) > 700) continue;
      bolts.push(h);
    }
    const hz = [];
    const pool = WS.Hazard.pool;
    for (let i = 0; i < pool.count; i++) {
      const h = pool.active[i];
      if (Math.hypot(h.x - p.x, h.y - p.y) < reach + h.radius) hz.push(h);
    }
    return { foes, bolts, hz };
  }

  /** Where a creature will be at time t if the survivor is at (qx, qy). */
  function foeAt(f, t, qx, qy, pr) {
    if (f.charge > 0) {
      // Winding up: it holds, then runs its lane.
      const go = Math.max(0, t - f.windup);
      if (t < f.windup) return [f.x, f.y];
      const d = Math.min(go, f.charge) * f.cv;
      return [f.x + f.cdx * d, f.y + f.cdy * d];
    }
    if (!f.speed) return [f.x, f.y];
    const dx = qx - f.x, dy = qy - f.y, dist = Math.hypot(dx, dy) || 1;
    // It stops where it wants to be: at arm's length, or at its range.
    const stop = Math.max(f.hold, (f.r + pr) * 0.6);
    const step = Math.min(f.speed * t, Math.max(0, dist - stop));
    return [f.x + (dx / dist) * step, f.y + (dy / dist) * step];
  }

  /* ------------------------------------------------------------- goals -- */
  /** One place worth going, chosen by what it is worth over how far it is,
   *  and kept for a while so the bot does not dither between two gems. */
  function chooseGoal(p, W) {
    if (!O.goals) return null;
    const hp = p.health / Math.max(1, p.maxHealth);
    const pr = p.pickupRadius;
    let best = null, bestU = 0;
    const consider = (x, y, value, reach, kind) => {
      const d = Math.max(0, Math.hypot(x - p.x, y - p.y) - reach);
      // A goal inside the crowd is worth less the thicker the crowd.
      let crowd = 0;
      for (const f of W.foes) {
        const g = Math.hypot(f.x - x, f.y - y);
        if (g < 140) crowd += (140 - g) / 140;
      }
      const u = value / (d + 120) / (1 + crowd * 0.6);
      if (u > bestU) { bestU = u; best = { x, y, reach, kind, value }; }
    };
    // Experience: the gems, weighted by what they hold.
    const gems = WS.XP.pool;
    for (let i = 0; i < gems.count; i++) {
      const g = gems.active[i];
      consider(g.x, g.y, 4 + Math.sqrt(g.value) * 3, pr * 0.9, 'gem');
    }
    const pk = WS.Pickup.pool;
    for (let i = 0; i < pk.count; i++) {
      const q = pk.active[i];
      const reach = q.type && q.type.noMagnet ? p.radius + (q.radius || 10) : pr * 0.9;
      let v = 0;
      switch (q.kind) {
        case 'potion': v = hp < 0.95 ? 20 + 260 * (1 - hp) * (1 - hp) * 4 : 1; break;
        case 'chest': v = 90; break;
        case 'cache': v = 120; break;
        case 'stone': v = 45; break;       // the lodestone: every gem on the field
        case 'hourglass': v = 40; break;
        case 'bomb': v = 30; break;
        case 'coin': v = 6; break;
        default: v = 0;                   // story objects are not the bot's errand
      }
      if (v > 0) consider(q.x, q.y, v, reach, q.kind);
    }
    // Highmoor's standing stones: stand in the ring.
    for (const sh of WS.Moor.shrines || []) {
      if (sh.gone || sh.taken) continue;
      consider(sh.x, sh.y, 70, sh.r * 0.5, 'shrine');
    }
    return best;
  }

  /* -------------------------------------------------------------- cost -- */
  function planCost(p, W, path, dirIdx, goal, tr) {
    const pr = p.radius;
    let c = 0;
    const mark = (k, before) => { if (tr) tr[k] = (tr[k] || 0) + (c - before); };
    let c0 = c;
    const iframes = p.invulnerable || 0;
    // Bodies and charges, along the whole path.
    for (const f of W.foes) {
      let hit = false;
      let prev = null;
      for (let k = 0; k < path.length && !hit; k++) {
        const [qx, qy, t] = path[k];
        const [ex, ey] = foeAt(f, t, qx, qy, pr);
        let gap;
        if (prev && f.charge > 0 && t > f.windup) {
          // A charge is fast enough to cross a sample; test the whole step.
          gap = closest(prev[0], prev[1], qx, qy, prev[2], prev[3], ex, ey) - f.r - pr;
        } else {
          gap = Math.hypot(qx - ex, qy - ey) - f.r - pr;
        }
        prev = [qx, qy, ex, ey];
        const margin = 6 + 10 * t;       // the further ahead, the less sure
        if (gap < margin && t > iframes - 0.03) {
          c += hitCost(p, f.dmg) * (1.15 - t * 0.5) * (1 + clamp((margin - gap) / 30, 0, 1));
          hit = true;
        }
        // A lane being aimed: out of it before it goes.
        if (f.lane && t <= f.windup + 0.05 && t >= f.windup - 0.4
            && inLane(f.x, f.y, f.cdx, f.cdy, f.lane.len, f.lane.w, qx, qy, pr + 10)) {
          c += hitCost(p, f.dmg) * 0.6;
        }
      }
    }
    mark('bodies', c0); c0 = c;
    // Bolts: exact closest approach along each step.
    for (const h of W.bolts) {
      let px = p.x, py = p.y, pt = 0;
      for (let k = 0; k < path.length; k++) {
        const [qx, qy, t] = path[k];
        if (t > h.life + 0.05) break;
        const d = closest(px, py, qx, qy, h.x + h.vx * pt, h.y + h.vy * pt, h.x + h.vx * t, h.y + h.vy * t);
        if (d < h.radius + pr + 5 && t > iframes - 0.03) { c += hitCost(p, h.damage) * (1.1 - t * 0.4); if (tr) tr.boltHits = (tr.boltHits || 0) + 1; break; }
        px = qx; py = qy; pt = t;
      }
    }
    mark('bolts', c0); c0 = c;
    // Ground: armed, or arming before we would leave it.
    for (const h of W.hz) {
      for (let k = 0; k < path.length; k++) {
        const [qx, qy, t] = path[k];
        if (t < h.fuse - 0.05 || t > h.fuse + h.life) continue;
        if (Math.hypot(qx - h.x, qy - h.y) < h.radius + pr + 4) { c += hitCost(p, h.damage) * 0.8; break; }
      }
    }
    // Storm strikes: where we will be when each one lands.
    for (const s of WS.Moor.strikes || []) {
      const reach = s.r + pr * 0.5 + 10;
      if (s.tele <= O.horizon) {
        const q = at(path, s.tele);
        if (Math.hypot(q[0] - s.x, q[1] - s.y) < reach) c += hitCost(p, s.dmg);
      } else {
        const q = path[path.length - 1];
        if (Math.hypot(q[0] - s.x, q[1] - s.y) < reach) c += hitCost(p, s.dmg) * 0.3;
      }
    }
    // The finale's marks, sampled along the path.
    if (WS.Finale && WS.Finale.running && WS.Finale.running() && WS.Finale.marks) {
      for (let k = 0; k < path.length; k++) c += finaleCost(p, path[k][0], path[k][1]) * (1.1 - path[k][2] * 0.5) / path.length * 2;
    }

    mark('hazards', c0); c0 = c;
    // Where it ends up: pressed by the crowd, and how much way out is left.
    const [ex, ey, T] = path[path.length - 1];
    const b = bounds(p);
    let press = 0;
    const SECT = 12, sect = new Float32Array(SECT);
    for (const f of W.foes) {
      const [fx, fy] = foeAt(f, T, ex, ey, pr);
      const d = Math.hypot(fx - ex, fy - ey) - f.r - pr;
      const w = Math.min(3, 0.4 + f.dmg / Math.max(1, p.maxHealth) * 20);
      if (d < 200) press += w * (1 - d / 200) * (1 - d / 200);
      if (d < 260) {
        const a = Math.atan2(fy - ey, fx - ex);
        const s = ((Math.floor((a + Math.PI) / (2 * Math.PI) * SECT) % SECT) + SECT) % SECT;
        sect[s] += (260 - Math.max(0, d)) / 260 * w;
      }
    }
    // Walls close sectors too: a way out that runs into the edge is not one.
    for (let s = 0; s < SECT; s++) {
      const a = (s + 0.5) / SECT * 2 * Math.PI - Math.PI;
      const wx = ex + Math.cos(a) * 110, wy = ey + Math.sin(a) * 110;
      if (wx < b.minX || wx > b.maxX || wy < b.minY || wy > b.maxY) sect[s] += 1;
    }
    let run = 0, bestRun = 0;
    for (let s = 0; s < SECT * 2; s++) {
      if (sect[s % SECT] < 0.5) { run++; bestRun = Math.max(bestRun, run); } else run = 0;
    }
    bestRun = Math.min(bestRun, SECT);
    c += press * O.press;
    if (bestRun < 4) c += (4 - bestRun) * (4 - bestRun) * O.enclose;
    const edge = Math.min(ex - b.minX, b.maxX - ex, ey - b.minY, b.maxY - ey);
    if (edge < 60) c += (60 - edge) * O.edge;
    // Nearer the middle is roomier, all else equal.
    c += Math.hypot(ex - (b.minX + b.maxX) / 2, ey - (b.minY + b.maxY) / 2) * O.centre;

    mark('space', c0); c0 = c;
    if (O.stance === 'brawl' && p.health > p.maxHealth * 0.45) {
      let near = Infinity;
      for (const f of W.foes) near = Math.min(near, Math.hypot(f.x - ex, f.y - ey) - f.r - pr);
      if (near > 60 && near < Infinity) c += (near - 60) * 0.25;
    }

    // What it gets closer to.
    if (goal) {
      const d0 = Math.max(0, Math.hypot(goal.x - p.x, goal.y - p.y) - goal.reach);
      const d1 = Math.max(0, Math.hypot(goal.x - ex, goal.y - ey) - goal.reach);
      const u = Math.min(goal.value, 400) / 4;
      c -= (d0 - d1) / (speedOfCache * T + 1) * u;
      if (d1 <= 0 && goal.kind === 'shrine') c -= u * 0.5;
    }
    mark('goal', c0); c0 = c;
    // Keep going the way it was going unless there is a reason not to.
    if (dirIdx === P.dir) c -= O.steady;
    if (O.noise) c += Math.random() * O.noise;
    return c;
  }
  let speedOfCache = 200;

  function at(path, t) {
    let prev = [WS.Game.player.x, WS.Game.player.y, 0];
    for (const q of path) {
      if (q[2] >= t) {
        const s = (t - prev[2]) / Math.max(1e-6, q[2] - prev[2]);
        return [prev[0] + (q[0] - prev[0]) * s, prev[1] + (q[1] - prev[1]) * s];
      }
      prev = q;
    }
    return prev;
  }

  /* The finale's telegraphs, read the way tools/finale-dodge.js reads them. */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  }
  function gapDist(m, ang) {
    let best = Infinity;
    const half = (m.gapWidth * Math.PI / 180) * 0.5;
    for (let i = 0; i < m.gapCount; i++) {
      const c = m.gapBase + m.gapRot + (i / m.gapCount) * Math.PI * 2;
      const d = Math.abs(((ang - c + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      best = Math.min(best, Math.max(0, d - half * 0.6));
    }
    return best;
  }
  function finaleCost(p, qx, qy) {
    const F = WS.Finale, pr = p.radius;
    let c = 0;
    for (const m of F.marks) {
      if (m.kind === 'circle') {
        if (Math.hypot(qx - m.x, qy - m.y) < m.r + pr + 8) c += 1000 / (Math.max(0, m.tele) + 0.3);
      } else if (m.kind === 'lane') {
        if (inLane(m.x, m.y, Math.cos(m.ang), Math.sin(m.ang), m.len, m.w, qx, qy, pr + 10)) c += 900 / (Math.max(0, m.tele) + 0.3);
      } else if (m.kind === 'ring') {
        if (m.delay > 0.6) continue;
        const d = Math.hypot(qx - m.cx, qy - m.cy);
        const eta = (d - m.r) / m.speed - m.delay;
        if (eta > -0.15 && eta < 1.4) {
          const g = gapDist(m, Math.atan2(qy - m.cy, qx - m.cx) - m.spin * Math.max(0, eta));
          if (g > 0) c += (300 + g * 400) / (Math.max(0, eta) + 0.25);
        }
      } else if (m.kind === 'sweep') {
        const lead = m.tele > 0 ? 0 : m.spin * 0.25;
        for (let a = 0; a < m.arms; a++) {
          const a1 = m.ang + lead + (a / m.arms) * Math.PI * 2, a2 = m.ang + (a / m.arms) * Math.PI * 2;
          if (inLane(m.cx, m.cy, Math.cos(a1), Math.sin(a1), m.len, m.w, qx, qy, pr + 14)
              || inLane(m.cx, m.cy, Math.cos(a2), Math.sin(a2), m.len, m.w, qx, qy, pr + 8)) {
            c += m.tele > 0 ? 250 / (m.tele + 0.3) : 1200;
          }
        }
      } else if (m.kind === 'grid') {
        let inBad = false, near = Infinity;
        for (const cell of m.cells) {
          const inside = qx >= cell.x + 6 && qx <= cell.x + cell.w - 6 && qy >= cell.y + 6 && qy <= cell.y + cell.h - 6;
          if (cell.safe) near = Math.min(near, Math.hypot(qx - (cell.x + cell.w / 2), qy - (cell.y + cell.h / 2)));
          else if (qx >= cell.x && qx <= cell.x + cell.w && qy >= cell.y && qy <= cell.y + cell.h) inBad = true;
          if (cell.safe && inside) near = 0;
        }
        if (inBad || near > 0) c += 200 / (m.tele + 0.3) + near * 3;
      } else if (m.kind === 'safe') {
        let near = Infinity;
        for (const z of m.zones) near = Math.min(near, Math.hypot(qx - z.x, qy - z.y) - (z.r - pr - 10));
        if (near > 0) c += 400 + near * 4;
      } else if (m.kind === 'fence') {
        if (F.live(m.a) && F.live(m.b) && segDist(qx, qy, m.a.x, m.a.y, m.b.x, m.b.y) < 34 + pr) c += 800;
      }
    }
    return c;
  }

  /* -------------------------------------------------------------- plan -- */
  function walk(p, b, speed, d1, d2) {
    const out = [];
    let x = p.x, y = p.y, t0 = 0;
    for (const t of TS) {
      const dt = t - t0;
      // Split the step at the turn so the path bends where it should.
      const a = t0 < O.turnAt ? Math.min(dt, O.turnAt - t0) : 0;
      const bpart = dt - a;
      x = clamp(x + (DIRS[d1][0] * a + DIRS[d2][0] * bpart) * speed, b.minX, b.maxX);
      y = clamp(y + (DIRS[d1][1] * a + DIRS[d2][1] * bpart) * speed, b.minY, b.maxY);
      out.push([x, y, t]);
      t0 = t;
    }
    return out;
  }

  P.decide = function () {
    const p = WS.Game.player;
    const t0 = performance.now ? performance.now() : 0;
    const speed = speedOf(p);
    speedOfCache = speed;
    const b = bounds(p);
    const W = observe(p, speed);
    // Hold a goal for a moment; drop it if it is gone or taken.
    if (!P.goal || P.goalAge > 1.0) { P.goal = chooseGoal(p, W); P.goalAge = 0; }
    let best = 0, bestC = Infinity;
    for (let d1 = 0; d1 < 9; d1++) {
      const turns = d1 === 0 ? [0] : [d1, 1 + ((d1 + 6) % 8), 1 + (d1 % 8)];
      let cBest = Infinity;
      for (const d2 of turns) {
        const c = planCost(p, W, walk(p, b, speed, d1, d2), d1, P.goal);
        if (c < cBest) cBest = c;
      }
      if (cBest < bestC) { bestC = cBest; best = d1; }
    }
    P.dir = best;
    P.stats.plans++;
    if (O.trace) {
      // What the chosen plan expected, and what the cheapest bolt-free plan cost.
      let bestTurn = null, bc = Infinity, freeC = Infinity;
      for (let d1 = 0; d1 < 9; d1++) {
        const turns = d1 === 0 ? [0] : [d1, 1 + ((d1 + 6) % 8), 1 + (d1 % 8)];
        for (const d2 of turns) {
          const tr = {};
          const c = planCost(p, W, walk(p, b, speed, d1, d2), d1, P.goal, tr);
          if (d1 === best && c < bc) { bc = c; bestTurn = tr; }
          if (!tr.boltHits && c < freeC) freeC = c;
        }
      }
      P.trace = { chosen: bestTurn, cost: bc, boltFree: freeC, bolts: W.bolts.length, foes: W.foes.length };
    }
    if (t0) P.stats.ms += performance.now() - t0;
  };

  P.step = function (dt) {
    P.replan -= dt;
    P.goalAge = (P.goalAge || 0) + dt;
    if (P.replan <= 0) { P.replan = O.replan; P.decide(); }
    const d = DIRS[P.dir];
    const k = WS.Input.keys, h = WS.Input.held;
    k.left = h.left = d[0] < -0.1; k.right = h.right = d[0] > 0.1;
    k.up = h.up = d[1] < -0.1; k.down = h.down = d[1] > 0.1;
  };
  return P;
}

/* The bot every balance tool used before this one, kept to measure against:
   circle the field, flee anything within 160. */
function installKiter() {
  const P = window.__pilot = { stats: { plans: 0, ms: 0 } };
  P.step = function () {
    const p = WS.Game.player;
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT, t = WS.Game.run.time;
    let tx = W / 2 + Math.cos(t * 0.5) * 240, ty = H / 2 + Math.sin(t * 0.5) * 170;
    const near = WS.Enemy.findNearest(p.x, p.y, 160);
    if (near) {
      const dx = p.x - near.x, dy = p.y - near.y, d = Math.hypot(dx, dy) || 1;
      tx = p.x + dx / d * 250; ty = p.y + dy / d * 250;
    }
    tx = Math.max(80, Math.min(W - 80, tx)); ty = Math.max(80, Math.min(H - 80, ty));
    const k = WS.Input.keys, h = WS.Input.held;
    k.left = h.left = tx - p.x < -6; k.right = h.right = tx - p.x > 6;
    k.up = h.up = ty - p.y < -6; k.down = h.down = ty - p.y > 6;
  };
  return P;
}

module.exports = { installPilot, installKiter };
