/* ModelGen: seeded, procedural low-poly 3D models for games.
 *
 * One file, no dependencies, runs in Node (require) and in a browser (<script>,
 * exposed as window.ModelGen). Every model is a pure function of its type, its
 * seed and a detail level, so "rock #1234" is the same rock on every machine,
 * forever - check the seed into a level file and the asset is reproducible.
 *
 * CONVENTIONS, chosen to drop straight into Unity / Unreal / Godot / Blender:
 *   - Units are metres, +Y is up, the front of a directional model faces +Z.
 *   - The pivot sits at the bottom centre (props, scenery) or at the hand
 *     position (weapons), so a model placed at a point stands on that point.
 *   - Flat-shaded triangles with per-vertex colour (no textures, no UVs): the
 *     faceted look reads well at any distance and costs one material.
 *   - glTF colours are linear, as the spec requires; internal colours are sRGB.
 *
 *   const MG = require('./modelgen');
 *   const model = MG.generate('tree', 42);        // { type, seed, part, ... }
 *   fs.writeFileSync('tree-42.glb', MG.toGLB(model));
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ModelGen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- random */

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  // Seeds may be numbers or strings ("castle-gate"); both map to a uint32.
  function toSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return seed >>> 0;
    const s = String(seed);
    return /^\d+$/.test(s) ? Number(s) >>> 0 : hashString(s);
  }

  // mulberry32, with a few conveniences hung off the function.
  function rng(seed) {
    let a = toSeed(seed);
    const r = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.int = (lo, hi) => Math.floor(r.range(lo, hi + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    r.sign = () => (r() < 0.5 ? -1 : 1);
    return r;
  }

  function hash3(x, y, z, s) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(s, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // Trilinear value noise in [0,1). Deterministic in position, so displacing a
  // shared vertex from two different triangles moves it to the same place and
  // the mesh stays closed.
  function noise3(x, y, z, s) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fx = x - xi, fy = y - yi, fz = z - zi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    const L = (a, b, t) => a + (b - a) * t;
    const h = (i, j, k) => hash3(xi + i, yi + j, zi + k, s);
    return L(
      L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v),
      L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v),
      w);
  }

  function fbm(x, y, z, s, octaves) {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let i = 0; i < (octaves || 3); i++) {
      sum += amp * noise3(x * f, y * f, z * f, s + i * 101);
      norm += amp; amp *= 0.5; f *= 2.03;
    }
    return sum / norm;
  }

  /* ---------------------------------------------------------------- colour */

  function hex(h) {
    const n = parseInt(h.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const shade = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  /* ---------------------------------------------------------------- vectors */

  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len3 = (a) => Math.sqrt(dot3(a, a));
  const norm3 = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  function triNormal(t) {
    return norm3(cross3(sub3(t.v[1], t.v[0]), sub3(t.v[2], t.v[0])));
  }
  function triCentroid(t) {
    return [(t.v[0][0] + t.v[1][0] + t.v[2][0]) / 3, (t.v[0][1] + t.v[1][1] + t.v[2][1]) / 3, (t.v[0][2] + t.v[1][2] + t.v[2][2]) / 3];
  }

  /* ---------------------------------------------------------------- parts */

  const WHITE = [1, 1, 1];

  // A Part is a bag of triangles, each with its own colour and material name.
  // Transforms mutate and return `this`, so construction reads as a chain.
  function Part(tris) { this.tris = tris || []; }

  // Adds a convex polygon (counter-clockwise seen from outside) as a fan.
  Part.prototype.poly = function (verts, color, mat) {
    for (let i = 1; i < verts.length - 1; i++) {
      this.tris.push({ v: [verts[0], verts[i], verts[i + 1]], c: color || WHITE, m: mat || 'default' });
    }
    return this;
  };
  Part.prototype.map = function (fn) {
    for (const t of this.tris) t.v = t.v.map((p) => fn(p));
    return this;
  };
  Part.prototype.translate = function (x, y, z) {
    if (Array.isArray(x)) { z = x[2]; y = x[1]; x = x[0]; }
    return this.map((p) => [p[0] + x, p[1] + y, p[2] + z]);
  };
  Part.prototype.scale = function (x, y, z) {
    if (y === undefined) { y = x; z = x; }
    this.map((p) => [p[0] * x, p[1] * y, p[2] * z]);
    // A mirror turns the triangles inside out; turn them back.
    if (x * y * z < 0) for (const t of this.tris) t.v = [t.v[0], t.v[2], t.v[1]];
    return this;
  };
  Part.prototype.rotateX = function (a) {
    const c = Math.cos(a), s = Math.sin(a);
    return this.map((p) => [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]);
  };
  Part.prototype.rotateY = function (a) {
    const c = Math.cos(a), s = Math.sin(a);
    return this.map((p) => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]);
  };
  Part.prototype.rotateZ = function (a) {
    const c = Math.cos(a), s = Math.sin(a);
    return this.map((p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]);
  };
  Part.prototype.paint = function (color, mat) {
    for (const t of this.tris) { t.c = color; if (mat) t.m = mat; }
    return this;
  };
  // fn(tri, normal, centroid) returns a colour, or null to leave it alone.
  Part.prototype.paintBy = function (fn, mat) {
    for (const t of this.tris) {
      const c = fn(t, triNormal(t), triCentroid(t));
      if (c) { t.c = c; if (mat) t.m = mat; }
    }
    return this;
  };
  // Per-face brightness jitter: the low-poly look that keeps flat colour alive.
  Part.prototype.tint = function (r, amount) {
    for (const t of this.tris) t.c = shade(t.c, 1 + (r() - 0.5) * amount);
    return this;
  };
  Part.prototype.add = function () {
    for (const p of arguments) if (p) for (const t of p.tris) this.tris.push(t);
    return this;
  };
  Part.prototype.bounds = function () {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const t of this.tris) for (const p of t.v) for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
    return { min, max };
  };
  // Moves the part so its lowest point is at y = 0.
  Part.prototype.ground = function () {
    return this.translate(0, -this.bounds().min[1], 0);
  };

  /* ---------------------------------------------------------------- primitives */

  function box(w, h, d) {
    const x = w / 2, y = h / 2, z = d / 2;
    const P = new Part();
    // Each face: centre, then axes u, v with u x v = outward normal.
    const face = (c, u, v) => P.poly([
      [c[0] - u[0] - v[0], c[1] - u[1] - v[1], c[2] - u[2] - v[2]],
      [c[0] + u[0] - v[0], c[1] + u[1] - v[1], c[2] + u[2] - v[2]],
      [c[0] + u[0] + v[0], c[1] + u[1] + v[1], c[2] + u[2] + v[2]],
      [c[0] - u[0] + v[0], c[1] - u[1] + v[1], c[2] - u[2] + v[2]]]);
    face([x, 0, 0], [0, y, 0], [0, 0, z]);
    face([-x, 0, 0], [0, 0, z], [0, y, 0]);
    face([0, y, 0], [0, 0, z], [x, 0, 0]);
    face([0, -y, 0], [x, 0, 0], [0, 0, z]);
    face([0, 0, z], [x, 0, 0], [0, y, 0]);
    face([0, 0, -z], [0, y, 0], [x, 0, 0]);
    return P;
  }

  // Revolves a profile of [radius, y] points (bottom to top) around +Y.
  // opts.radial: per-segment radius multipliers, for ragged silhouettes.
  function lathe(profile, segments, opts) {
    opts = opts || {};
    const P = new Part();
    const n = segments;
    const radial = opts.radial || null;
    const ring = profile.map(([r, y]) => {
      const pts = [];
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + (opts.phase || 0);
        const rr = r * (radial ? radial[j % radial.length] : 1);
        pts.push([rr * Math.sin(a), y, rr * Math.cos(a)]);
      }
      return pts;
    });
    for (let i = 0; i < profile.length - 1; i++) {
      const lo = ring[i], hi = ring[i + 1];
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        const a = lo[j], b = lo[k], c = hi[k], d = hi[j];
        if (profile[i][0] < 1e-9) P.poly([a, c, d]);
        else if (profile[i + 1][0] < 1e-9) P.poly([a, b, c]);
        else P.poly([a, b, c, d]);
      }
    }
    if (opts.capBottom !== false && profile[0][0] > 1e-9) P.poly(ring[0].slice().reverse());
    if (opts.capTop !== false && profile[profile.length - 1][0] > 1e-9) P.poly(ring[ring.length - 1]);
    return P;
  }

  function cylinder(rBottom, rTop, h, segments, opts) {
    return lathe([[rBottom, 0], [rTop, h]], segments, opts);
  }

  function icosphere(radius, subdivisions) {
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm3);
    let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2],
      [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11],
      [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let s = 0; s < subdivisions; s++) {
      const cache = new Map();
      const mid = (a, b) => {
        const key = a < b ? a + ',' + b : b + ',' + a;
        if (!cache.has(key)) {
          verts.push(norm3([(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2, (verts[a][2] + verts[b][2]) / 2]));
          cache.set(key, verts.length - 1);
        }
        return cache.get(key);
      };
      const next = [];
      for (const [a, b, c] of faces) {
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      faces = next;
    }
    const P = new Part();
    for (const f of faces) {
      let tri = f.map((i) => verts[i].map((x) => x * radius));
      const tr = { v: tri };
      if (dot3(triNormal(tr), triCentroid(tr)) < 0) tri = [tri[0], tri[2], tri[1]];
      P.poly(tri);
    }
    return P;
  }

  // A sphere pushed in and out by noise: foliage, rocks, clouds of anything.
  function blob(radius, subdivisions, noiseSeed, amount, freq) {
    freq = freq || 1.6;
    return icosphere(1, subdivisions).map((p) => {
      const k = 1 + amount * (fbm(p[0] * freq + 7, p[1] * freq, p[2] * freq, noiseSeed, 3) - 0.5) * 2;
      return [p[0] * radius * k, p[1] * radius * k, p[2] * radius * k];
    });
  }

  // Ear clipping. Returns index triples, counter-clockwise.
  function triangulate2D(pts) {
    const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
    const idx = pts.map((_, i) => i);
    if (area < 0) idx.reverse();
    const crossZ = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const inside = (p, a, b, c) => crossZ(a, b, p) >= 0 && crossZ(b, c, p) >= 0 && crossZ(c, a, p) >= 0;
    const out = [];
    while (idx.length > 3) {
      let clipped = false;
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
        const a = pts[ia], b = pts[ib], c = pts[ic];
        if (crossZ(a, b, c) <= 1e-12) continue;
        if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(pts[j], a, b, c))) continue;
        out.push([ia, ib, ic]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) break; // Self-intersecting input; keep what we have.
    }
    if (idx.length === 3) out.push(idx.slice());
    return out;
  }

  // Extrudes a 2D outline in the XY plane along Z, centred on z = 0.
  function extrude(shape, depth) {
    const area = shape.reduce((s, p, i) => { const q = shape[(i + 1) % shape.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
    const pts = area < 0 ? shape.slice().reverse() : shape;
    const z = depth / 2;
    const P = new Part();
    for (const [a, b, c] of triangulate2D(pts)) {
      P.poly([[pts[a][0], pts[a][1], z], [pts[b][0], pts[b][1], z], [pts[c][0], pts[c][1], z]]);
      P.poly([[pts[a][0], pts[a][1], -z], [pts[c][0], pts[c][1], -z], [pts[b][0], pts[b][1], -z]]);
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      P.poly([[p[0], p[1], -z], [q[0], q[1], -z], [q[0], q[1], z], [p[0], p[1], z]]);
    }
    return P;
  }

  // An arc of 2D points around (cx, cy), inclusive of both ends.
  function arc(cx, cy, rx, ry, a0, a1, steps) {
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return out;
  }

  // Radius of a lathe profile at height y, by linear interpolation.
  function profileRadius(profile, y) {
    for (let i = 0; i < profile.length - 1; i++) {
      const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
      if (y >= y0 && y <= y1 && y1 > y0) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
    }
    return profile[profile.length - 1][0];
  }

  /* ---------------------------------------------------------------- palettes */

  const P_ = (list) => list.map(hex);
  const PAL = {
    bark: P_(['#5b3a24', '#6b4a2f', '#4a3222', '#7a5a3c', '#3f2d20']),
    leaves: {
      summer: P_(['#4f8a3a', '#5e9c41', '#3f7a34', '#6aa84f']),
      spring: P_(['#7cc05a', '#8fd06a', '#a3d977', '#6fb44e']),
      autumn: P_(['#d9822b', '#c8552d', '#e0a93b', '#b8452a']),
      deep: P_(['#2f5e3a', '#285233', '#376b41', '#1f4a2c']),
      blossom: P_(['#f2a7c3', '#f6c1d4', '#e98fb3', '#fbd3e2']),
    },
    needles: P_(['#2d5a3d', '#35684a', '#264f36', '#3d7353']),
    stone: P_(['#8a8a8a', '#7b7771', '#9a948a', '#6e6f73', '#a39d92', '#857a6d']),
    sandstone: P_(['#c8a26b', '#b88f5a', '#d4b27a']),
    moss: P_(['#5d7f3a', '#6b8f44', '#4f6f33']),
    snow: hex('#eef3f7'),
    crystal: [
      [hex('#6a3fbf'), hex('#c7a6ff')], [hex('#1f6fbf'), hex('#9fe3ff')], [hex('#1f9e6b'), hex('#a8ffd6')],
      [hex('#b52848'), hex('#ff9fb4')], [hex('#c78a14'), hex('#ffe38a')], [hex('#2a8fa0'), hex('#c4fbff')],
    ],
    wood: P_(['#9c6b3e', '#a8773f', '#8a5a33', '#b5854f', '#7d5230']),
    darkWood: P_(['#5a3a22', '#4d321f', '#654428']),
    metal: P_(['#5d6166', '#4b4f55', '#6e7278']),
    gold: P_(['#d4a531', '#c8962a', '#e0b84a']),
    steel: P_(['#c9ced6', '#b8bec7', '#d8dde3']),
    bronze: P_(['#b87333', '#a8672e']),
    leather: P_(['#5a3620', '#6b3f24', '#3f2a1c', '#7a2e2e', '#2e3f5a']),
    skin: P_(['#f1c9a5', '#e0ac85', '#c68863', '#9c6644', '#6f4630', '#f6d7c3']),
    cloth: P_(['#3a5f8a', '#8a3a3a', '#3f6e4a', '#6a4a8a', '#8a7a3a', '#4a4a52', '#b0b4ba']),
    trousers: P_(['#3b3f4a', '#4a3b2e', '#2e3b4a', '#55503f']),
    hair: P_(['#2a1d14', '#5a3a1e', '#a86a2e', '#d8b56a', '#1a1a1a', '#8a8a8a']),
    gem: P_(['#e0303a', '#2f7de0', '#30c060', '#b040e0', '#f0c030']),
    glass: hex('#cfe6ea'),
    liquid: P_(['#e0303a', '#2f7de0', '#30c060', '#b040e0', '#f0a020', '#40e0d0', '#f0f0f0']),
    cork: hex('#b08b5a'),
    capRed: P_(['#c8302a', '#d8452e', '#b52a2a']),
    capBrown: P_(['#8a5a34', '#a06a3c', '#7a4e2e']),
    capBlue: P_(['#3a6ad0', '#4a8ae0', '#6a4ad0']),
    stem: P_(['#efe6d2', '#e6dac0', '#f4eee0']),
    walls: P_(['#e8dcc0', '#d8c8a8', '#f0e8d8', '#c8b898', '#b8c0c8']),
    roof: P_(['#9c3b2e', '#6e4a3a', '#3e5a7a', '#5a6e3a', '#7a3a5a', '#4a4a50']),
    window: P_(['#9fd3e8', '#ffd98a']),
    foundation: P_(['#7f7a73', '#6e6a64']),
  };

  /* ---------------------------------------------------------------- generators */
  // Each takes (r, detail) and returns a Part. `detail` scales segment counts:
  // 0.5 for a distant LOD, 1 for the default, 2 for a hero prop.

  const seg = (base, d, min) => Math.max(min || 3, Math.round(base * d));

  const GENERATORS = {
    tree: {
      about: 'Broadleaf tree: bent trunk, a crown of noisy foliage blobs. Seasons vary.',
      build(r, d) {
        const season = r.pick(['summer', 'summer', 'spring', 'autumn', 'deep', 'blossom']);
        const leaves = PAL.leaves[season];
        const h = r.range(1.8, 3.2), tr = r.range(0.13, 0.22);
        const bx = r.range(-0.3, 0.3), bz = r.range(-0.3, 0.3);
        const trunk = lathe([[tr * 1.4, 0], [tr, 0.2 * h], [tr * 0.8, 0.65 * h], [tr * 0.55, h]], seg(7, d, 5))
          .map((p) => { const t = p[1] / h; return [p[0] + bx * t * t, p[1], p[2] + bz * t * t]; })
          .paint(r.pick(PAL.bark), 'bark').tint(r, 0.15);
        const out = new Part().add(trunk);
        const R = r.range(1.0, 1.5);
        const top = [bx, h, bz];
        const n = r.int(3, 5);
        for (let i = 0; i < n; i++) {
          const c = i === 0 ? [top[0], top[1] + R * 0.35, top[2]]
            : [top[0] + r.range(-0.7, 0.7) * R, top[1] + r.range(-0.1, 0.7) * R, top[2] + r.range(-0.7, 0.7) * R];
          const rad = i === 0 ? R : R * r.range(0.5, 0.8);
          out.add(blob(rad, d >= 1.5 ? 2 : 1, r.int(0, 1e6), 0.28)
            .scale(1, r.range(0.75, 0.95), 1).rotateY(r() * 6.28).translate(c)
            .paint(r.pick(leaves), 'leaves').tint(r, 0.18));
        }
        return out;
      },
    },

    pine: {
      about: 'Conifer: stacked ragged cones on a short trunk, sometimes snow-capped.',
      build(r, d) {
        const H = r.range(3, 6), R = r.range(0.9, 1.5);
        const trunk = cylinder(r.range(0.12, 0.2), 0.08, H * 0.45, seg(6, d, 5)).paint(r.pick(PAL.bark), 'bark').tint(r, 0.15);
        const out = new Part().add(trunk);
        const snowy = r.chance(0.3);
        const needles = r.pick(PAL.needles);
        const tiers = r.int(3, 5);
        const base = H * 0.15;
        const tierH = ((H - base) / tiers) * 1.7;
        const segs = seg(8, d, 5);
        for (let i = 0; i < tiers; i++) {
          const y = base + (i * (H - base - tierH)) / Math.max(1, tiers - 1);
          const rad = R * (1 - (i / tiers) * 0.7);
          const radial = Array.from({ length: segs }, () => r.range(0.8, 1.15));
          // Extra rings give the snow clean edges: a dusting on the visible
          // shelf of each tier, and a cap on the tip (only the top one shows).
          const cone = lathe([[rad * 0.75, 0], [rad, tierH * 0.12], [rad * 0.8, tierH * 0.28], [rad * 0.42, tierH * 0.6], [0, tierH]], segs, { radial })
            .paint(shade(needles, 1 + i * 0.05), 'needles').tint(r, 0.15);
          const snowAt = (y) => y > tierH * 0.6 || (y > tierH * 0.12 && y < tierH * 0.28);
          if (snowy) cone.paintBy((t, n, c) => (snowAt(c[1]) && n[1] > 0.2 ? shade(PAL.snow, r.range(0.94, 1)) : null), 'snow');
          out.add(cone.rotateY(r() * 6.28).translate(0, y, 0));
        }
        return out;
      },
    },

    rock: {
      about: 'Boulder or small cluster, flat-bottomed, with optional moss on top.',
      build(r, d) {
        const out = new Part();
        const stone = r.pick(r.chance(0.2) ? PAL.sandstone : PAL.stone);
        const mossy = r.chance(0.4);
        const count = r.chance(0.35) ? r.int(2, 3) : 1;
        for (let i = 0; i < count; i++) {
          const s = i === 0 ? r.range(0.5, 1.1) : r.range(0.25, 0.5);
          const sy = r.range(0.45, 0.85);
          const rock = blob(1, d >= 1.5 ? 2 : 1, r.int(0, 1e6), 0.3, 1.2)
            .scale(s * r.range(0.9, 1.3), s * sy, s * r.range(0.8, 1.1))
            .map((p) => [p[0], Math.max(p[1], -s * sy * 0.3), p[2]])
            .ground().rotateY(r() * 6.28);
          if (i > 0) { const a = r() * 6.28; rock.translate(Math.sin(a) * s * 2, 0, Math.cos(a) * s * 2); }
          rock.paint(stone, 'stone').tint(r, 0.2);
          if (mossy) rock.paintBy((t, n) => (n[1] > 0.75 ? r.pick(PAL.moss) : null), 'moss');
          out.add(rock);
        }
        return out;
      },
    },

    crystal: {
      about: 'Cluster of hexagonal crystal shards bursting from a stone base.',
      build(r, d) {
        const [dark, light] = r.pick(PAL.crystal);
        const base = blob(r.range(0.35, 0.5), 1, r.int(0, 1e6), 0.25).scale(1.2, 0.4, 1.2)
          .map((p) => [p[0], Math.max(p[1], -0.05), p[2]]).ground()
          .paint(r.pick(PAL.stone), 'stone').tint(r, 0.2);
        const out = new Part().add(base);
        const n = r.int(3, 7);
        const sides = d >= 1.5 ? 8 : 6;
        for (let i = 0; i < n; i++) {
          const h = i === 0 ? r.range(0.9, 1.4) : r.range(0.35, 0.9);
          const w = h * r.range(0.12, 0.18);
          const shard = lathe([[w * 0.8, 0], [w, h * 0.12], [w * 0.9, h * 0.75], [0, h]], sides)
            .paintBy((t, nrm, c) => mix(dark, light, Math.min(1, Math.max(0, c[1] / h + nrm[1] * 0.3))), 'crystal')
            .tint(r, 0.1);
          const a = r() * 6.28, tilt = i === 0 ? r.range(0, 0.15) : r.range(0.25, 0.7);
          const off = i === 0 ? 0 : r.range(0.08, 0.22);
          shard.rotateY(r() * 6.28).rotateX(tilt).rotateY(a).translate(Math.sin(a) * off, 0.08, Math.cos(a) * off);
          out.add(shard);
        }
        return out;
      },
    },

    crate: {
      about: 'Plank crate with a timber frame and optional cross-braces.',
      build(r, d) {
        const s = r.range(0.7, 1.1);
        const wood = r.pick(PAL.wood), frameWood = shade(wood, 0.7);
        const t = s * r.range(0.08, 0.11);
        const out = new Part();
        const planks = r.int(3, 5), gap = s * 0.012;
        const inner = s - t;
        for (let i = 0; i < planks; i++) {
          const ph = inner / planks - gap;
          out.add(box(inner, ph, inner).translate(0, t / 2 + (i + 0.5) * (inner / planks), 0)
            .paint(shade(wood, r.range(0.9, 1.1)), 'wood').tint(r, 0.1));
        }
        // Twelve edge beams.
        const h = s / 2, e = h - t / 2;
        for (const a of [-e, e]) for (const b of [-e, e]) {
          out.add(box(s, t, t).translate(0, h + a, b).paint(frameWood, 'frame'));
          out.add(box(t, s - 2 * t, t).translate(a, h, b).paint(frameWood, 'frame'));
          out.add(box(t, t, s - 2 * t).translate(a, h + b, 0).paint(frameWood, 'frame'));
        }
        if (r.chance(0.6)) {
          const len = Math.SQRT2 * (s - 2 * t) * 0.98, ang = Math.PI / 4 * r.sign();
          for (const z of [-1, 1]) out.add(box(len, t * 0.8, t * 0.5).rotateZ(ang).translate(0, h, z * (h - t * 0.25)).paint(frameWood, 'frame'));
          for (const x of [-1, 1]) out.add(box(t * 0.5, t * 0.8, len).rotateX(ang).translate(x * (h - t * 0.25), h, 0).paint(frameWood, 'frame'));
        }
        return out.tint(r, 0.06);
      },
    },

    barrel: {
      about: 'Bulging stave barrel with iron hoops and a recessed lid.',
      build(r, d) {
        const H = r.range(0.85, 1.25), R = r.range(0.3, 0.42);
        const segs = seg(14, d, 8);
        const lid = R * 0.8;
        const profile = [[R * 0.82, 0], [R * 0.96, H * 0.22], [R, H * 0.5], [R * 0.96, H * 0.78], [R * 0.82, H]];
        const body = lathe(profile.concat([[lid, H], [lid, H - 0.035], [0, H - 0.035]]), segs, { capTop: false });
        const wood = r.pick(PAL.wood);
        body.paint(wood, 'wood');
        // Staves: alternate plank tones around the circumference.
        body.paintBy((t, n, c) => {
          const k = Math.floor(((Math.atan2(c[0], c[2]) + Math.PI) / (Math.PI * 2)) * segs);
          return shade(wood, k % 2 ? 0.92 : 1.05);
        });
        body.paintBy((t, n) => (n[1] > 0.9 ? shade(wood, 0.8) : null), 'lid');
        const out = new Part().add(body.tint(r, 0.08));
        const iron = r.pick(PAL.metal);
        const hoops = r.chance(0.5) ? [0.1, 0.34, 0.66, 0.9] : [0.12, 0.88];
        for (const f of hoops) {
          const y = H * f, rr = profileRadius(profile, y) + 0.012;
          out.add(cylinder(rr, rr, 0.045, segs, { capTop: false, capBottom: false }).translate(0, y - 0.0225, 0).paint(iron, 'iron'));
        }
        return out;
      },
    },

    chest: {
      about: 'Treasure chest with a rounded lid, metal bands and a lock plate.',
      build(r, d) {
        const W = r.range(0.8, 1.15), D = r.range(0.5, 0.68), H = r.range(0.4, 0.52);
        const wood = r.pick(PAL.wood), trim = r.pick(r.chance(0.5) ? PAL.gold : PAL.metal);
        const out = new Part();
        out.add(box(W, H, D).translate(0, H / 2, 0).paint(wood, 'wood').tint(r, 0.1));
        const steps = seg(6, d, 4);
        const lidShape = [[D / 2, 0]].concat(arc(0, 0, D / 2, D * 0.4, 0, Math.PI, steps).slice(1, -1), [[-D / 2, 0]]);
        out.add(extrude(lidShape, W).rotateY(Math.PI / 2).translate(0, H, 0).paint(shade(wood, 1.08), 'wood').tint(r, 0.1));
        const bandShape = [[D / 2 + 0.015, 0]].concat(arc(0, 0, D / 2 + 0.015, D * 0.4 + 0.015, 0, Math.PI, steps).slice(1, -1), [[-D / 2 - 0.015, 0]]);
        for (const x of [-W * 0.32, W * 0.32]) {
          out.add(box(0.06, H + 0.01, D + 0.03).translate(x, H / 2, 0).paint(trim, 'trim'));
          out.add(extrude(bandShape, 0.06).rotateY(Math.PI / 2).translate(x, H, 0).paint(trim, 'trim'));
        }
        out.add(box(0.12, 0.14, 0.04).translate(0, H, D / 2 + 0.02).paint(trim, 'trim'));
        out.add(box(0.03, 0.05, 0.01).translate(0, H - 0.02, D / 2 + 0.045).paint(hex('#1a1a1a'), 'keyhole'));
        return out;
      },
    },

    sword: {
      about: 'One-handed sword. Pivot at the grip, blade along +Y.',
      build(r, d) {
        const L = r.range(0.65, 1.0), w = r.range(0.03, 0.055), th = 0.022;
        const style = r.pick(['straight', 'leaf', 'tapered']);
        const shape = style === 'leaf'
          ? [[-w, 0], [w, 0], [w * 1.35, L * 0.55], [0, L], [-w * 1.35, L * 0.55]]
          : style === 'tapered'
            ? [[-w, 0], [w, 0], [w * 0.45, L * 0.9], [0, L], [-w * 0.45, L * 0.9]]
            : [[-w, 0], [w, 0], [w * 0.95, L * 0.82], [0, L], [-w * 0.95, L * 0.82]];
        const maxW = style === 'leaf' ? w * 1.35 : w;
        const gripL = r.range(0.14, 0.2);
        const steel = r.pick(PAL.steel);
        const blade = extrude(shape, th)
          .map((p) => [p[0], p[1], p[2] * Math.max(0.1, 1 - Math.abs(p[0]) / maxW)]) // Diamond cross-section.
          .translate(0, gripL / 2 + 0.02, 0)
          .paintBy((t, n) => shade(steel, 0.85 + Math.abs(n[0]) * 0.3), 'blade');
        const guardMetal = r.pick(r.chance(0.5) ? PAL.gold : r.chance(0.5) ? PAL.bronze : PAL.metal);
        const gw = r.range(0.16, 0.3);
        const guard = r.chance(0.5)
          ? box(gw, 0.035, 0.05)
          : extrude([[-gw / 2, 0.03], [-gw / 2 - 0.02, 0.06], [0, 0.005], [gw / 2 + 0.02, 0.06], [gw / 2, 0.03], [0, -0.02]], 0.045);
        guard.translate(0, gripL / 2, 0).paint(guardMetal, 'guard');
        const grip = cylinder(0.017, 0.015, gripL, seg(6, d, 5)).translate(0, -gripL / 2, 0).paint(r.pick(PAL.leather), 'grip').tint(r, 0.2);
        const pommel = (r.chance(0.35)
          ? icosphere(0.028, 1).paint(r.pick(PAL.gem), 'gem')
          : icosphere(0.03, 0).paint(guardMetal, 'guard')).translate(0, -gripL / 2 - 0.02, 0);
        return new Part().add(blade, guard, grip, pommel);
      },
    },

    axe: {
      about: 'Hand axe, single or double bit. Pivot at the hand, haft along +Y.',
      build(r, d) {
        const L = r.range(0.6, 0.95), hr = 0.02;
        const haft = cylinder(hr * 1.1, hr, L, seg(6, d, 5)).paint(r.pick(PAL.darkWood), 'haft').tint(r, 0.15);
        const out = new Part().add(haft);
        const len = r.range(0.14, 0.22), hb = r.range(0.08, 0.14), sock = 0.045;
        const steps = seg(6, d, 3);
        const bit = [[0, sock], [len * 0.45, sock * 0.7]]
          .concat(arc(len * 0.7, 0, len * 0.35, hb, Math.PI * 0.55, -Math.PI * 0.55, steps))
          .concat([[len * 0.45, -sock * 0.7], [0, -sock]]);
        const metal = r.pick(PAL.steel);
        const makeBit = () => extrude(bit, 0.04)
          .map((p) => [p[0], p[1], p[2] * (p[0] > len * 0.6 ? 0.25 : 1)])
          .paint(metal, 'head').tint(r, 0.08);
        const headY = L - sock - 0.03;
        out.add(makeBit().translate(hr, headY, 0));
        if (r.chance(0.35)) out.add(makeBit().scale(-1, 1, 1).translate(-hr, headY, 0));
        else out.add(box(0.05, sock * 1.6, 0.045).translate(-0.02, headY, 0).paint(shade(metal, 0.8), 'head'));
        out.add(cylinder(hr * 1.4, hr * 1.4, 0.06, seg(6, d, 5)).translate(0, L * 0.1, 0).paint(r.pick(PAL.leather), 'wrap'));
        return out.translate(0, -L * 0.12, 0);
      },
    },

    potion: {
      about: 'Glass potion bottle, part-filled, with a cork. Flask, vial or cone.',
      build(r, d) {
        const kind = r.pick(['round', 'vial', 'cone']);
        const segs = seg(12, d, 6);
        const rr = r.range(0.06, 0.09);
        let profile; // [radius, y] from the base up to the lip.
        const neckR = rr * r.range(0.3, 0.42), neckH = rr * r.range(0.6, 1.0);
        if (kind === 'round') {
          profile = [[rr * 0.5, 0]];
          const n = seg(6, d, 4);
          for (let i = 1; i <= n; i++) {
            const a = -Math.PI / 2 + (i / n) * (Math.PI * 0.85);
            profile.push([Math.cos(a) * rr, rr + Math.sin(a) * rr]);
          }
          const top = profile[profile.length - 1][1];
          profile.push([neckR, top + rr * 0.1], [neckR, top + neckH]);
        } else if (kind === 'vial') {
          const h = rr * r.range(2.2, 3.2);
          profile = [[rr * 0.8, 0], [rr, rr * 0.2], [rr, h], [neckR * 1.2, h + rr * 0.35], [neckR, h + rr * 0.45], [neckR, h + rr * 0.45 + neckH]];
        } else {
          const h = rr * r.range(1.6, 2.2);
          profile = [[rr * 1.1, 0], [rr * 1.15, rr * 0.12], [neckR * 1.1, h], [neckR, h + neckH]];
        }
        const lipY = profile[profile.length - 1][1];
        profile.push([neckR * 1.3, lipY], [neckR * 1.3, lipY + rr * 0.12]);
        const top = lipY + rr * 0.12;
        const level = r.range(0.35, 0.75) * top;
        // A ring exactly at the fill line, so the liquid edge is level.
        const at = profile.findIndex((p) => p[1] > level);
        if (at > 0 && profile[at - 1][1] < level) profile.splice(at, 0, [profileRadius(profile, level), level]);
        const liquid = r.pick(PAL.liquid);
        const bottle = lathe(profile, segs, { capTop: false })
          .paintBy((t, n, c) => (c[1] < level ? liquid : PAL.glass), 'glass').tint(r, 0.06);
        const cork = cylinder(neckR * 0.9, neckR * 1.15, rr * 0.45, seg(8, d, 5)).translate(0, top - rr * 0.2, 0).paint(PAL.cork, 'cork').tint(r, 0.15);
        return new Part().add(bottle, cork);
      },
    },

    mushroom: {
      about: 'Toadstool (or a few), domed cap with spots on a pale stem.',
      build(r, d) {
        const caps = r.pick([PAL.capRed, PAL.capRed, PAL.capBrown, PAL.capBlue]);
        const spotted = caps !== PAL.capBrown || r.chance(0.3);
        const out = new Part();
        const count = r.chance(0.4) ? r.int(2, 3) : 1;
        for (let m = 0; m < count; m++) {
          const k = m === 0 ? 1 : r.range(0.4, 0.7);
          const h = r.range(0.25, 0.45) * k, sr = r.range(0.04, 0.07) * k;
          const capR = r.range(0.14, 0.26) * k, capH = capR * r.range(0.5, 0.85);
          const segs = seg(10, d, 6);
          const stem = lathe([[sr * 1.3, 0], [sr, h * 0.5], [sr * 0.85, h]], segs).paint(r.pick(PAL.stem), 'stem').tint(r, 0.08);
          const prof = [[sr, h - capH * 0.1], [capR * 0.95, h - capH * 0.05], [capR, h]];
          const n = seg(5, d, 3);
          for (let i = 1; i <= n; i++) {
            const a = (i / n) * (Math.PI / 2);
            prof.push([Math.cos(a) * capR, h + Math.sin(a) * capH]);
          }
          prof[prof.length - 1][0] = 0;
          const cap = lathe(prof, segs, { capBottom: false })
            .paintBy((t, nn) => (nn[1] < -0.5 ? shade(r.pick(PAL.stem), 0.85) : r.pick(caps)), 'cap').tint(r, 0.08);
          const shroom = new Part().add(stem, cap);
          if (spotted) {
            const spots = r.int(4, 8);
            for (let s = 0; s < spots; s++) {
              const phi = r.range(0.15, 1.1), th = r() * 6.28;
              const px = Math.sin(phi) * capR, py = h + Math.cos(phi) * capH;
              shroom.add(icosphere(capR * r.range(0.1, 0.16), 0).scale(1, 0.35, 1)
                .rotateX(phi).rotateY(th).translate(Math.sin(th) * px, py, Math.cos(th) * px)
                .paint(hex('#f6f2e8'), 'spots'));
            }
          }
          const lean = m === 0 ? r.range(0, 0.12) : r.range(0.15, 0.35);
          shroom.rotateX(lean).rotateY(r() * 6.28);
          if (m > 0) { const a = r() * 6.28, dd = r.range(0.2, 0.3); shroom.translate(Math.sin(a) * dd, 0, Math.cos(a) * dd); }
          out.add(shroom);
        }
        return out;
      },
    },

    house: {
      about: 'Cottage: walls on a stone footing, gabled roof, door, windows, chimney.',
      build(r, d) {
        const W = r.range(3, 5), D = r.range(2.8, 4), H = r.range(2.2, 3), rh = r.range(1.2, 2);
        const wall = r.pick(PAL.walls), roof = r.pick(PAL.roof), timber = r.pick(PAL.darkWood);
        const out = new Part();
        out.add(box(W + 0.12, 0.35, D + 0.12).translate(0, 0.175, 0).paint(r.pick(PAL.foundation), 'stone').tint(r, 0.15));
        out.add(box(W, H, D).translate(0, 0.35 + H / 2, 0).paint(wall, 'wall').tint(r, 0.05));
        const top = 0.35 + H;
        // Gable ends.
        for (const x of [-1, 1]) {
          out.add(extrude([[-D / 2, 0], [D / 2, 0], [0, rh]], 0.1).rotateY(Math.PI / 2).translate(x * (W / 2 - 0.05), top, 0).paint(wall, 'wall'));
        }
        // Corner posts and a beam under the eaves.
        const bt = 0.16;
        for (const x of [-1, 1]) for (const z of [-1, 1]) {
          out.add(box(bt, H, bt).translate(x * (W / 2 - bt / 2 + 0.02), 0.35 + H / 2, z * (D / 2 - bt / 2 + 0.02)).paint(timber, 'timber'));
        }
        for (const z of [-1, 1]) out.add(box(W + 0.04, bt, bt).translate(0, top - bt / 2, z * (D / 2 - bt / 2 + 0.02)).paint(timber, 'timber'));
        // Roof slabs.
        const ang = Math.atan2(rh, D / 2), ov = 0.35, rt = 0.12;
        const slabL = Math.hypot(D / 2, rh) + ov;
        for (const side of [-1, 1]) {
          const dir = [0, -Math.sin(ang), side * Math.cos(ang)];
          const nrm = [0, Math.cos(ang), side * Math.sin(ang)];
          const c = [0, top + rh + dir[1] * slabL / 2 + nrm[1] * rt / 2, dir[2] * slabL / 2 + nrm[2] * rt / 2];
          out.add(box(W + 2 * ov * 0.7, rt, slabL).rotateX(side * ang).translate(c).paint(roof, 'roof').tint(r, 0.08));
        }
        // Door and windows on the front (+Z).
        const doorX = r.range(-W * 0.2, W * 0.2);
        out.add(box(0.9, 1.8, 0.08).translate(doorX, 0.35 + 0.9, D / 2 + 0.03).paint(r.pick(PAL.darkWood), 'door').tint(r, 0.1));
        out.add(box(0.07, 0.07, 0.05).translate(doorX + 0.3, 0.35 + 0.9, D / 2 + 0.09).paint(r.pick(PAL.gold), 'metal'));
        const glass = r.pick(PAL.window);
        const winY = 0.35 + H * 0.6;
        for (const x of [-1, 1]) {
          const wx = x * W * 0.34;
          if (Math.abs(wx - doorX) < 0.9) continue;
          out.add(box(0.7, 0.7, 0.06).translate(wx, winY, D / 2 + 0.02).paint(timber, 'timber'));
          out.add(box(0.55, 0.55, 0.06).translate(wx, winY, D / 2 + 0.04).paint(glass, 'window'));
        }
        for (const z of [-1, 1]) if (r.chance(0.7)) {
          out.add(box(0.06, 0.6, 0.6).translate(W / 2 * (z) + 0.02 * z, winY, 0).paint(glass, 'window'));
        }
        if (r.chance(0.8)) {
          const cx = r.range(-W * 0.3, W * 0.3), cz = -D * 0.22;
          const ch = rh + 0.8;
          out.add(box(0.5, ch, 0.5).translate(cx, top + ch / 2, cz).paint(r.pick(PAL.foundation), 'stone').tint(r, 0.15));
        }
        return out;
      },
    },

    figure: {
      about: 'Humanoid mannequin in an A-pose, facing +Z. A stand-in character and a rigging test.',
      build(r, d) {
        const H = r.range(1.6, 1.95), bulk = r.range(0.85, 1.2);
        const skin = r.pick(PAL.skin), shirt = r.pick(PAL.cloth), legs = r.pick(PAL.trousers);
        const boots = r.pick(PAL.darkWood), hair = r.pick(PAL.hair);
        const segs = seg(8, d, 5);
        // A tapered limb from a to b: a lathe along +Y, tilted onto a->b.
        const limb = (a, b, r0, r1) => {
          const v = sub3(b, a), L = len3(v), n = norm3(v);
          // Rings along the length, so the limb bends smoothly when rigged.
          const rings = Array.from({ length: 5 }, (_, i) => [r0 + (r1 - r0) * (i / 4), (L * i) / 4]);
          return lathe(rings, segs)
            .rotateX(Math.acos(Math.max(-1, Math.min(1, n[1])))).rotateY(Math.atan2(n[0], n[2])).translate(a);
        };
        const joint = (p, rad) => icosphere(rad, 1).translate(p);
        const out = new Part();
        // Torso: an elliptical lathe from hips to neck.
        const w = 0.1 * H * bulk;
        out.add(lathe([[w * 0.9, 0.47 * H], [w, 0.55 * H], [w * 0.88, 0.62 * H], [w * 1.08, 0.72 * H], [w * 1.12, 0.79 * H], [w * 0.5, 0.835 * H]], segs + 2)
          .scale(1, 1, 0.62).paintBy((t, n, c) => (c[1] < 0.54 * H ? legs : shirt), 'cloth').tint(r, 0.06));
        out.add(limb([0, 0.82 * H, 0], [0, 0.875 * H, 0], 0.028 * H, 0.025 * H).paint(skin, 'skin'));
        // Head, with a nose and eyes so the front is unmistakable.
        const hr = 0.065 * H, hc = [0, 0.93 * H, 0.005 * H];
        out.add(icosphere(hr, d >= 1.5 ? 2 : 1).scale(0.9, 1.1, 1).translate(hc)
          .paintBy((t, n, c) => (c[1] > hc[1] + hr * 0.25 && (n[2] < 0.55 || c[1] > hc[1] + hr * 0.7) ? hair : skin), 'skin').tint(r, 0.04));
        out.add(lathe([[hr * 0.16, 0], [0, hr * 0.3]], 4).rotateX(Math.PI / 2).translate(0, hc[1] - hr * 0.05, hc[2] + hr * 0.95).paint(shade(skin, 0.95), 'skin'));
        for (const x of [-1, 1]) out.add(icosphere(hr * 0.11, 0).translate(x * hr * 0.35, hc[1] + hr * 0.18, hc[2] + hr * 0.9).paint(hex('#1c1c22'), 'eyes'));
        for (const side of [-1, 1]) {
          // Legs: hip, knee, ankle; the foot points forward.
          const hip = [side * 0.055 * H * bulk, 0.49 * H, 0], knee = [side * 0.06 * H, 0.27 * H, 0.005 * H], ankle = [side * 0.062 * H, 0.045 * H, 0];
          out.add(limb(hip, knee, 0.055 * H * bulk, 0.04 * H).paint(legs, 'cloth').tint(r, 0.06));
          out.add(joint(knee, 0.04 * H).paint(legs, 'cloth'));
          out.add(limb(knee, ankle, 0.04 * H, 0.03 * H).paint(legs, 'cloth').tint(r, 0.06));
          out.add(box(0.06 * H, 0.05 * H, 0.15 * H).translate(ankle[0], 0.025 * H, 0.035 * H).paint(boots, 'boots').tint(r, 0.1));
          // Arms: an A-pose about 45 degrees below horizontal.
          const drop = r.range(0.7, 0.85);
          const dir = [side * Math.cos(drop), -Math.sin(drop), 0];
          const sh = [side * 0.12 * H * bulk, 0.8 * H, 0];
          const el = [sh[0] + dir[0] * 0.17 * H, sh[1] + dir[1] * 0.17 * H, 0];
          const wr = [el[0] + dir[0] * 0.15 * H, el[1] + dir[1] * 0.15 * H, 0.01 * H];
          out.add(joint(sh, 0.042 * H * bulk).paint(shirt, 'cloth'));
          out.add(limb(sh, el, 0.038 * H * bulk, 0.03 * H).paint(shirt, 'cloth').tint(r, 0.06));
          out.add(joint(el, 0.03 * H).paint(skin, 'skin'));
          out.add(limb(el, wr, 0.03 * H, 0.022 * H).paint(skin, 'skin').tint(r, 0.04));
          out.add(icosphere(0.035 * H, 1).scale(0.7, 1.2, 0.45).rotateZ(side * (Math.PI / 2 - drop))
            .translate(wr[0] + dir[0] * 0.04 * H, wr[1] + dir[1] * 0.04 * H, wr[2]).paint(skin, 'skin'));
        }
        return out;
      },
    },

    fence: {
      about: 'Modular fence section, 1 unit per post gap. Tiles along X.',
      build(r, d) {
        const posts = r.int(2, 4), gap = r.range(1.1, 1.5), H = r.range(0.9, 1.3);
        const wood = r.pick(PAL.wood);
        const out = new Part();
        const total = gap * (posts - 1);
        const pr = 0.06;
        for (let i = 0; i < posts; i++) {
          const x = -total / 2 + i * gap;
          const tilt = r.range(-0.04, 0.04);
          out.add(lathe([[pr, 0], [pr, H], [0, H + pr * 1.5]], 4, { phase: Math.PI / 4 })
            .rotateZ(tilt).translate(x, 0, 0).paint(shade(wood, r.range(0.8, 0.95)), 'post').tint(r, 0.1));
        }
        for (const f of r.chance(0.5) ? [0.35, 0.75] : [0.3, 0.55, 0.8]) {
          out.add(box(total + 0.2, 0.08, 0.035).rotateZ(r.range(-0.02, 0.02)).translate(0, H * f, pr + 0.02).paint(wood, 'rail').tint(r, 0.1));
        }
        return out;
      },
    },
  };

  /* ---------------------------------------------------------------- api */

  function generate(type, seed, opts) {
    const g = GENERATORS[type];
    if (!g) throw new Error(`Unknown model type "${type}". Try: ${Object.keys(GENERATORS).join(', ')}`);
    const detail = Math.max(0.25, Math.min(3, (opts && opts.detail) || 1));
    const s = toSeed(seed === undefined ? 1 : seed);
    // Mix the type into the stream so tree #7 and rock #7 are unrelated.
    const part = g.build(rng(s ^ hashString(type)), detail);
    const tris = part.tris.filter((t) => len3(cross3(sub3(t.v[1], t.v[0]), sub3(t.v[2], t.v[0]))) > 1e-10);
    part.tris = tris;
    return { type, seed: s, detail, name: `${type}_${s}`, part, triangles: tris.length, bounds: part.bounds() };
  }

  // Flat-shaded, de-duplicated vertex buffers: what every exporter and the
  // viewer draw from. Colours come out linear for glTF.
  function toBuffers(model) {
    const map = new Map();
    const pos = [], nrm = [], col = [], idx = [];
    const q = (x) => Math.round(x * 1e5);
    for (const t of model.part.tris) {
      const n = triNormal(t);
      const c = [toLinear(t.c[0]), toLinear(t.c[1]), toLinear(t.c[2])];
      for (const p of t.v) {
        const key = `${q(p[0])},${q(p[1])},${q(p[2])},${q(n[0])},${q(n[1])},${q(n[2])},${q(c[0])},${q(c[1])},${q(c[2])}`;
        let i = map.get(key);
        if (i === undefined) {
          i = pos.length / 3;
          map.set(key, i);
          pos.push(p[0], p[1], p[2]);
          nrm.push(n[0], n[1], n[2]);
          col.push(c[0], c[1], c[2]);
        }
        idx.push(i);
      }
    }
    const count = pos.length / 3;
    return {
      positions: new Float32Array(pos), normals: new Float32Array(nrm), colors: new Float32Array(col),
      indices: count > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), vertexCount: count,
    };
  }

  // Binary glTF 2.0: one node, one mesh, one primitive, one material that
  // multiplies by COLOR_0. Imports as-is in Blender, Godot, Unreal and Unity
  // (via glTFast or UnityGLTF).
  function toGLB(model, opts) {
    opts = opts || {};
    const b = toBuffers(model);
    const views = [b.positions, b.normals, b.colors, b.indices];
    const offsets = [];
    let length = 0;
    for (const v of views) { offsets.push(length); length += Math.ceil(v.byteLength / 4) * 4; }
    const bin = new Uint8Array(length);
    views.forEach((v, i) => bin.set(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), offsets[i]));

    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < b.positions.length; i++) {
      const k = i % 3;
      if (b.positions[i] < min[k]) min[k] = b.positions[i];
      if (b.positions[i] > max[k]) max[k] = b.positions[i];
    }
    const json = {
      asset: { version: '2.0', generator: 'ModelGen (procedural low-poly)' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: model.name }],
      meshes: [{
        name: model.name,
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0, mode: 4 }],
      }],
      materials: [{
        name: `${model.name}_vertexcolor`,
        pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: opts.roughness == null ? 0.85 : opts.roughness },
      }],
      buffers: [{ byteLength: length }],
      bufferViews: [
        { buffer: 0, byteOffset: offsets[0], byteLength: b.positions.byteLength, target: 34962 },
        { buffer: 0, byteOffset: offsets[1], byteLength: b.normals.byteLength, target: 34962 },
        { buffer: 0, byteOffset: offsets[2], byteLength: b.colors.byteLength, target: 34962 },
        { buffer: 0, byteOffset: offsets[3], byteLength: b.indices.byteLength, target: 34963 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: b.vertexCount, type: 'VEC3', min, max },
        { bufferView: 1, componentType: 5126, count: b.vertexCount, type: 'VEC3' },
        { bufferView: 2, componentType: 5126, count: b.vertexCount, type: 'VEC3' },
        { bufferView: 3, componentType: b.indices instanceof Uint32Array ? 5125 : 5123, count: b.indices.length, type: 'SCALAR' },
      ],
      extras: { type: model.type, seed: model.seed, detail: model.detail },
    };
    let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const jsonLen = Math.ceil(jsonBytes.length / 4) * 4;
    const total = 12 + 8 + jsonLen + 8 + length;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546C67, true); // "glTF"
    dv.setUint32(4, 2, true);
    dv.setUint32(8, total, true);
    dv.setUint32(12, jsonLen, true);
    dv.setUint32(16, 0x4E4F534A, true); // "JSON"
    out.fill(0x20, 20, 20 + jsonLen);
    out.set(jsonBytes, 20);
    dv.setUint32(20 + jsonLen, length, true);
    dv.setUint32(24 + jsonLen, 0x004E4942, true); // "BIN\0"
    out.set(bin, 28 + jsonLen);
    return out;
  }

  // Wavefront OBJ + MTL. OBJ has no standard vertex colour, so each part's
  // colour becomes a material (Kd) and the per-face tints ride along as the
  // widely read "v x y z r g b" extension (Blender, MeshLab, ZBrush).
  function toOBJ(model) {
    const name = model.name;
    const mats = new Map();
    const vKey = new Map(), nKey = new Map();
    const vLines = [], nLines = [];
    const groups = new Map();
    const f6 = (x) => +x.toFixed(6);
    for (const t of model.part.tris) {
      if (!mats.has(t.m)) mats.set(t.m, t.c);
      const n = triNormal(t);
      const nk = n.map(f6).join(' ');
      if (!nKey.has(nk)) { nLines.push('vn ' + nk); nKey.set(nk, nLines.length); }
      const face = t.v.map((p) => {
        const k = p.map(f6).join(' ') + ' ' + t.c.map((c) => c.toFixed(4)).join(' ');
        if (!vKey.has(k)) { vLines.push('v ' + k); vKey.set(k, vLines.length); }
        return `${vKey.get(k)}//${nKey.get(nk)}`;
      });
      if (!groups.has(t.m)) groups.set(t.m, []);
      groups.get(t.m).push('f ' + face.join(' '));
    }
    const obj = [`# ModelGen ${model.type} seed ${model.seed} - ${model.triangles} triangles`,
      `mtllib ${name}.mtl`, `o ${name}`].concat(vLines, nLines);
    for (const [m, faces] of groups) obj.push(`usemtl ${name}_${m}`, ...faces);
    const mtl = [];
    for (const [m, c] of mats) mtl.push(`newmtl ${name}_${m}`, `Kd ${c.map((x) => x.toFixed(4)).join(' ')}`, 'Ka 0 0 0', 'Ks 0 0 0', 'd 1', 'illum 1', '');
    return { obj: obj.join('\n') + '\n', mtl: mtl.join('\n') };
  }

  const types = () => Object.keys(GENERATORS);
  const describe = (type) => GENERATORS[type] && GENERATORS[type].about;

  return {
    generate, toBuffers, toGLB, toOBJ, types, describe,
    // Building blocks, for adding your own generators.
    Part, box, lathe, cylinder, icosphere, blob, extrude, arc, rng, noise3, fbm, hex, mix, shade, PAL,
    register(type, about, build) { GENERATORS[type] = { about, build }; },
  };
});
