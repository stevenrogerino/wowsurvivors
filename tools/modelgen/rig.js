/* ModelRig: puts a skeleton in a 3D model and writes it back out rigged.
 *
 * Reads any glTF binary (.glb) - a ModelGen prop, an AI-generated character,
 * something from Blender - keeping its textures, UVs and materials. Fits a
 * humanoid skeleton with standard (Mixamo-style) bone names, works out how
 * much each bone moves each vertex, and writes a skinned .glb with a few
 * animation clips. Unity, Unreal, Godot and Blender read the result, and the
 * bone names let each engine's retargeting map its own animations onto it.
 *
 * Runs in Node and the browser; no dependencies.
 *
 *   const Rig = require('./rig');
 *   const model = Rig.loadModel(fs.readFileSync('knight.glb'));
 *   const skel = Rig.fitHumanoid(model);            // then adjust by hand if needed
 *   const skin = Rig.computeWeights(model, skel);
 *   fs.writeFileSync('knight_rigged.glb', Rig.exportRigged(model, skel, skin));
 *
 * HOW THE WEIGHTS WORK. The model is voxelised and its inside filled. From
 * each bone, distance is measured by walking only through the inside of the
 * body, so a hand close to a hip is still far from it "the long way round",
 * and the thigh bone never grabs the other leg. Nearby bones share a vertex in
 * proportion to 1/distance^4, keeping the four strongest. This is the voxel
 * variant of Blender's "bone heat".
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ModelRig = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- math */

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a) => Math.sqrt(dot(a, a));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // 4x4 matrices are column-major arrays, as in glTF.
  const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function mmul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function compose(t, q, s) {
    t = t || [0, 0, 0]; q = q || [0, 0, 0, 1]; s = s || [1, 1, 1];
    const [x, y, z, w] = q;
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    return [
      (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
      2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
      2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1];
  }
  const xformPoint = (m, p) => [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  // Inverse-transpose of the upper 3x3, for normals. Returned row-major 3x3.
  function normalMatrix(m) {
    const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    const k = det ? 1 / det : 0;
    // Cofactor matrix / det = inverse-transpose.
    return { det, m: [A * k, B * k, C * k, -(b * i - c * h) * k, (a * i - c * g) * k, -(a * h - b * g) * k,
      (b * f - c * e) * k, -(a * f - c * d) * k, (a * e - b * d) * k] };
  }

  function quatAxis(axis, deg) {
    const h = (deg * Math.PI) / 360, s = Math.sin(h);
    return axis === 'x' ? [s, 0, 0, Math.cos(h)] : axis === 'y' ? [0, s, 0, Math.cos(h)] : [0, 0, s, Math.cos(h)];
  }
  function qmul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  }
  // Rotations in degrees about the parent's axes: Z first, then Y, then X.
  const euler = (r) => qmul(qmul(quatAxis('x', r.x || 0), quatAxis('y', r.y || 0)), quatAxis('z', r.z || 0));

  /* ---------------------------------------------------------------- glTF in */

  const COMP = { 5120: ['getInt8', 1, 127], 5121: ['getUint8', 1, 255], 5122: ['getInt16', 2, 32767], 5123: ['getUint16', 2, 65535], 5125: ['getUint32', 4, 0], 5126: ['getFloat32', 4, 0] };
  const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const UNSUPPORTED = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_mesh_quantization'];

  function b64decode(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function parseContainer(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let json, bin = null;
    if (u8.length >= 12 && dv.getUint32(0, true) === 0x46546C67) {
      let off = 12;
      while (off + 8 <= u8.length) {
        const clen = dv.getUint32(off, true), ctype = dv.getUint32(off + 4, true);
        const chunk = u8.subarray(off + 8, off + 8 + clen);
        if (ctype === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(chunk));
        else if (ctype === 0x004E4942) bin = chunk;
        off += 8 + clen;
      }
    } else {
      json = JSON.parse(new TextDecoder().decode(u8)); // .gltf with embedded data: URIs
    }
    if (!json) throw new Error('Not a glTF file');
    const buffers = (json.buffers || []).map((b, i) => {
      if (b.uri === undefined) { if (!bin) throw new Error('GLB has no binary chunk'); return bin; }
      const m = /^data:[^,]*;base64,(.*)$/.exec(b.uri);
      if (!m) throw new Error(`Buffer ${i} points at an outside file (${b.uri}). Export as a single .glb instead.`);
      return b64decode(m[1]);
    });
    return { json, buffers };
  }

  function readAccessor(doc, index) {
    const a = doc.json.accessors[index];
    if (a.sparse) throw new Error('Sparse accessors are not supported');
    const n = NCOMP[a.type], [getter, size, norm] = COMP[a.componentType];
    const out = new Float32Array(a.count * n);
    if (a.bufferView === undefined) return { data: out, n };
    const bv = doc.json.bufferViews[a.bufferView], buf = doc.buffers[bv.buffer];
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const stride = bv.byteStride || n * size, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const k = a.normalized && norm ? 1 / norm : 1;
    for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) {
      out[i * n + c] = dv[getter](base + i * stride + c * size, true) * k;
    }
    if (a.normalized && norm && getter.startsWith('getInt')) for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, out[i]);
    return { data: out, n };
  }

  function smoothNormals(pos, idx) {
    const n = new Float32Array(pos.length);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
      const v = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
      const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      for (const i of [a, b, c]) { n[i] += f[0]; n[i + 1] += f[1]; n[i + 2] += f[2]; }
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
    }
    return n;
  }

  // Flattens every triangle mesh in the default scene into world space. The
  // result is what everything else works on: a list of primitives with float
  // attributes, 32-bit indices and their original material index.
  function loadModel(bytes, name) {
    const doc = parseContainer(bytes);
    const json = doc.json;
    for (const e of json.extensionsRequired || []) {
      if (UNSUPPORTED.includes(e)) throw new Error(`This file is compressed with ${e}. Re-export it uncompressed.`);
    }
    const prims = [];
    const warnings = [];
    if (json.skins && json.skins.length) warnings.push('The file already had a skeleton; it is replaced, using the model as it stands in its rest pose.');
    const visit = (ni, parent) => {
      const node = json.nodes[ni];
      const local = node.matrix ? node.matrix.slice() : compose(node.translation, node.rotation, node.scale);
      const world = mmul(parent, local);
      if (node.mesh !== undefined) {
        const nm = normalMatrix(world);
        for (const p of json.meshes[node.mesh].primitives) {
          if ((p.mode === undefined ? 4 : p.mode) !== 4) { warnings.push('Skipped a non-triangle primitive (lines or points).'); continue; }
          const attrs = {};
          for (const [key, acc] of Object.entries(p.attributes)) {
            if (/^(JOINTS|WEIGHTS)_/.test(key)) continue;
            const { data, n } = readAccessor(doc, acc);
            if (key === 'POSITION') {
              for (let i = 0; i < data.length; i += 3) {
                const q = xformPoint(world, [data[i], data[i + 1], data[i + 2]]);
                data[i] = q[0]; data[i + 1] = q[1]; data[i + 2] = q[2];
              }
            } else if (key === 'NORMAL' || key === 'TANGENT') {
              const m = nm.m;
              for (let i = 0; i < data.length; i += n) {
                const x = data[i], y = data[i + 1], z = data[i + 2];
                let v = key === 'NORMAL'
                  ? [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z]
                  : [world[0] * x + world[4] * y + world[8] * z, world[1] * x + world[5] * y + world[9] * z, world[2] * x + world[6] * y + world[10] * z];
                v = nrm(v);
                data[i] = v[0]; data[i + 1] = v[1]; data[i + 2] = v[2];
              }
            }
            attrs[key] = { data, n };
          }
          if (!attrs.POSITION) continue;
          const count = attrs.POSITION.data.length / 3;
          let idx;
          if (p.indices !== undefined) idx = Uint32Array.from(readAccessor(doc, p.indices).data);
          else { idx = new Uint32Array(count); for (let i = 0; i < count; i++) idx[i] = i; }
          if (nm.det < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
          if (!attrs.NORMAL) attrs.NORMAL = { data: smoothNormals(attrs.POSITION.data, idx), n: 3 };
          prims.push({ attrs, idx, material: p.material, count });
        }
      }
      for (const c of node.children || []) visit(c, world);
    };
    const scene = json.scenes ? json.scenes[json.scene || 0] : null;
    let roots = scene ? scene.nodes : null;
    if (!roots) {
      const child = new Set();
      (json.nodes || []).forEach((n) => (n.children || []).forEach((c) => child.add(c)));
      roots = (json.nodes || []).map((_, i) => i).filter((i) => !child.has(i));
    }
    for (const r of roots || []) visit(r, IDENT);
    if (!prims.length) throw new Error('No triangle meshes found in this file');
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let tris = 0;
    for (const p of prims) {
      const d = p.attrs.POSITION.data;
      for (let i = 0; i < d.length; i++) { const k = i % 3; if (d[i] < min[k]) min[k] = d[i]; if (d[i] > max[k]) max[k] = d[i]; }
      tris += p.idx.length / 3;
    }
    return { name: name || 'model', doc, prims, bounds: { min, max }, triangles: tris, warnings };
  }

  function recomputeBounds(model) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of model.prims) {
      const d = p.attrs.POSITION.data;
      for (let i = 0; i < d.length; i++) { const k = i % 3; if (d[i] < min[k]) min[k] = d[i]; if (d[i] > max[k]) max[k] = d[i]; }
    }
    model.bounds = { min, max };
  }

  // Readies a model for a game, in place: optional turns (degrees; standUp
  // tips a Z-up model onto +Y), scaled to a height in metres, centred on X/Z
  // with its lowest point on the ground. AI-generated meshes usually arrive
  // about one unit tall, facing an arbitrary way.
  function normalizeModel(model, opts) {
    opts = opts || {};
    const rot = (axis, deg) => {
      if (!deg) return;
      const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
      for (const p of model.prims) for (const key of ['POSITION', 'NORMAL', 'TANGENT']) {
        const a = p.attrs[key];
        if (!a) continue;
        for (let i = 0; i < a.data.length; i += a.n) {
          const x = a.data[i], y = a.data[i + 1], z = a.data[i + 2];
          if (axis === 'y') { a.data[i] = x * c + z * s; a.data[i + 2] = -x * s + z * c; }
          else { a.data[i + 1] = y * c - z * s; a.data[i + 2] = y * s + z * c; }
        }
      }
    };
    rot('x', opts.standUp ? -90 : 0);
    rot('y', opts.turn || 0);
    recomputeBounds(model);
    const { min, max } = model.bounds;
    const k = opts.height ? opts.height / ((max[1] - min[1]) || 1) : 1;
    const off = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
    for (const p of model.prims) {
      const d = p.attrs.POSITION.data;
      for (let i = 0; i < d.length; i += 3) {
        d[i] = (d[i] + off[0]) * k; d[i + 1] = (d[i + 1] + off[1]) * k; d[i + 2] = (d[i + 2] + off[2]) * k;
      }
    }
    recomputeBounds(model);
    return model;
  }

  /* ---------------------------------------------------------------- skeleton */

  // [name, parent, the bone its segment points at]. `end` bones mark tips and
  // carry no weight. Left is the character's left: +X for a model facing +Z.
  const HUMANOID = (() => {
    const b = [
      ['Hips', null, 'Spine'], ['Spine', 'Hips', 'Spine1'], ['Spine1', 'Spine', 'Spine2'], ['Spine2', 'Spine1', 'Neck'],
      ['Neck', 'Spine2', 'Head'], ['Head', 'Neck', 'HeadTop_End'], ['HeadTop_End', 'Head', null, true],
    ];
    for (const S of ['Left', 'Right']) {
      b.push([S + 'Shoulder', 'Spine2', S + 'Arm'], [S + 'Arm', S + 'Shoulder', S + 'ForeArm'], [S + 'ForeArm', S + 'Arm', S + 'Hand'],
        [S + 'Hand', S + 'ForeArm', S + 'Hand_End'], [S + 'Hand_End', S + 'Hand', null, true],
        [S + 'UpLeg', 'Hips', S + 'Leg'], [S + 'Leg', S + 'UpLeg', S + 'Foot'], [S + 'Foot', S + 'Leg', S + 'ToeBase'],
        [S + 'ToeBase', S + 'Foot', S + 'Toe_End'], [S + 'Toe_End', S + 'ToeBase', null, true]);
    }
    return b;
  })();

  function makeSkeleton(template, positions) {
    const names = template.map((t) => t[0]);
    const bones = template.map(([name, parent, to, end]) => ({
      name, parent: parent ? names.indexOf(parent) : -1, to: to ? names.indexOf(to) : -1, end: !!end,
      pos: positions[name].slice(),
    }));
    bones.forEach((b) => {
      const other = b.name.startsWith('Left') ? 'Right' + b.name.slice(4) : b.name.startsWith('Right') ? 'Left' + b.name.slice(5) : null;
      b.mirror = other ? names.indexOf(other) : -1;
    });
    return { type: 'humanoid', bones };
  }

  /* ---------------------------------------------------------------- voxels */

  // Solid voxel model: the surface is rasterised, the outside flood-filled
  // from the border, and whatever is left is the body. Shared by the skeleton
  // fit (cross-sections) and the weights (distances through the body).
  function voxelize(model, res) {
    const { min, max } = model.bounds;
    const ext = sub(max, min);
    const cell = Math.max(ext[0], ext[1], ext[2]) / (res || 110);
    const pad = 2;
    const org = [min[0] - pad * cell, min[1] - pad * cell, min[2] - pad * cell];
    const nx = Math.ceil(ext[0] / cell) + 2 * pad + 1, ny = Math.ceil(ext[1] / cell) + 2 * pad + 1, nz = Math.ceil(ext[2] / cell) + 2 * pad + 1;
    const N = nx * ny * nz;
    const at = (i, j, k) => i + nx * (j + ny * k);
    const clampI = (v, n) => Math.min(n - 1, Math.max(0, v));
    const cellOf = (p) => at(
      clampI(Math.floor((p[0] - org[0]) / cell), nx), clampI(Math.floor((p[1] - org[1]) / cell), ny), clampI(Math.floor((p[2] - org[2]) / cell), nz));
    const centre = (c) => [org[0] + ((c % nx) + 0.5) * cell, org[1] + ((Math.floor(c / nx) % ny) + 0.5) * cell, org[2] + (Math.floor(c / (nx * ny)) + 0.5) * cell];

    const state = new Uint8Array(N); // 0 unknown, 1 surface, 2 outside
    for (const pr of model.prims) {
      const P = pr.attrs.POSITION.data, I = pr.idx;
      for (let t = 0; t < I.length; t += 3) {
        const a = [P[I[t] * 3], P[I[t] * 3 + 1], P[I[t] * 3 + 2]];
        const b = [P[I[t + 1] * 3], P[I[t + 1] * 3 + 1], P[I[t + 1] * 3 + 2]];
        const c = [P[I[t + 2] * 3], P[I[t + 2] * 3 + 1], P[I[t + 2] * 3 + 2]];
        const m = Math.max(1, Math.ceil(Math.max(len(sub(b, a)), len(sub(c, b)), len(sub(a, c))) / (cell * 0.5)));
        for (let i = 0; i <= m; i++) for (let j = 0; j <= m - i; j++) {
          const u = i / m, v = j / m, w = 1 - u - v;
          state[cellOf([a[0] * w + b[0] * u + c[0] * v, a[1] * w + b[1] * u + c[1] * v, a[2] * w + b[2] * u + c[2] * v])] = 1;
        }
      }
    }
    const stack = [];
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) { state[at(i, j, k)] = 2; stack.push(at(i, j, k)); }
    }
    const nb6 = [1, -1, nx, -nx, nx * ny, -nx * ny];
    while (stack.length) {
      const c = stack.pop();
      for (const o of nb6) {
        const d = c + o;
        if (d >= 0 && d < N && state[d] === 0) { state[d] = 2; stack.push(d); }
      }
    }
    return { state, nx, ny, nz, N, cell, org, at, cellOf, centre, inside: (c) => state[c] !== 2 };
  }

  // The body's cross-section in the plane through point p with normal d (a
  // slab one cell thick), split into connected pieces - two legs, an arm and
  // the torso - each with its centroid and cell count. `limit` bounds the
  // search to cells within that distance of p.
  function slicePieces(g, p, d, limit) {
    d = nrm(d);
    const r = Math.ceil(limit / g.cell) + 1;
    const ci = Math.floor((p[0] - g.org[0]) / g.cell), cj = Math.floor((p[1] - g.org[1]) / g.cell), ck = Math.floor((p[2] - g.org[2]) / g.cell);
    const inSlab = new Map();
    for (let k = ck - r; k <= ck + r; k++) for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) continue;
      const c = g.at(i, j, k);
      if (!g.inside(c)) continue;
      const v = sub(g.centre(c), p);
      const along = dot(v, d);
      if (Math.abs(along) > g.cell * 0.75 || len(sub(v, scl(d, along))) > limit) continue;
      inSlab.set(c, true);
    }
    const nb = [];
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) nb.push(dx + g.nx * (dy + g.ny * dz));
    const pieces = [];
    for (const start of inSlab.keys()) {
      if (inSlab.get(start) !== true) continue;
      const piece = { cells: 0, sum: [0, 0, 0], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      const st = [start];
      inSlab.set(start, false);
      while (st.length) {
        const c = st.pop(), q = g.centre(c);
        piece.cells++;
        for (let a = 0; a < 3; a++) { piece.sum[a] += q[a]; piece.min[a] = Math.min(piece.min[a], q[a]); piece.max[a] = Math.max(piece.max[a], q[a]); }
        for (const o of nb) if (inSlab.get(c + o) === true) { inSlab.set(c + o, false); st.push(c + o); }
      }
      piece.centroid = scl(piece.sum, 1 / piece.cells);
      pieces.push(piece);
    }
    return pieces.sort((a, b) => b.cells - a.cells);
  }

  // Centre of the piece of cross-section nearest p (or p itself if the slice is empty).
  function sliceCentre(g, p, d, limit) {
    const pieces = slicePieces(g, p, d, limit);
    if (!pieces.length) return p;
    let best = pieces[0], bd = Infinity;
    for (const pc of pieces) {
      if (pc.cells < 2) continue;
      const dd = len(sub(pc.centroid, p));
      if (dd < bd) { bd = dd; best = pc; }
    }
    return best.centroid;
  }

  // Walks up an arm held out from the body, from the fingertip to the
  // shoulder: step along the arm, take its cross-section square to the
  // current direction, move to its centre, turn to follow. The arm bends at
  // the elbow, so a straight line from the hand overshoots the shoulder into
  // the chest; walking follows the bend. The walk ends where the arm's
  // cross-section merges into the torso; the shoulder joint sits a little
  // beyond, inside the deltoid. Returns null if the walk can't get going.
  function walkArm(g, tip, guessShoulder, H) {
    let dir = nrm(sub(guessShoulder, tip));
    const step = 0.012 * H;
    let p = add(tip, scl(dir, 0.03 * H));
    const path = [], radii = [];
    for (let i = 0; i < 80; i++) {
      const pieces = slicePieces(g, p, dir, 0.12 * H);
      let best = null, bd = Infinity;
      for (const pc of pieces) { const d = len(sub(pc.centroid, p)); if (d < bd) { bd = d; best = pc; } }
      if (!best) break;
      const r = Math.sqrt((best.cells * g.cell * g.cell) / Math.PI);
      const span = Math.max(best.max[0] - best.min[0], best.max[1] - best.min[1], best.max[2] - best.min[2]);
      // Merged into the torso: the section balloons or widens, or its centre
      // jumps sideways. And no arm is longer than ~40% of the height from
      // fingertip to shoulder.
      if (radii.length >= 4) {
        const typical = radii.slice().sort((a, b) => a - b)[radii.length >> 1];
        if (r > 1.8 * typical || span > 3.2 * 2 * typical || bd > 0.03 * H) break;
      }
      if (len(sub(best.centroid, tip)) > 0.4 * H) break;
      path.push(best.centroid);
      radii.push(r);
      if (path.length >= 3) {
        const d2 = nrm(sub(path[path.length - 1], path[path.length - 3]));
        dir = nrm(add(scl(dir, 0.5), scl(d2, 0.5)));
      }
      p = add(best.centroid, scl(dir, step));
    }
    if (path.length < 8) return null;
    // The shoulder joint: past the last clean section, about one arm radius in.
    const r0 = radii.slice(-6).sort((a, b) => a - b)[3] || radii[radii.length - 1];
    const shoulder = add(path[path.length - 1], scl(dir, Math.min(0.05 * H, 1.2 * r0)));
    // Arc lengths from the shoulder back down to the fingertip.
    const line = [shoulder, ...path.slice().reverse(), tip];
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + len(sub(line[i], line[i - 1])));
    const at = (d) => {
      for (let i = 1; i < line.length; i++) if (d <= cum[i]) return lerp(line[i - 1], line[i], (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1));
      return tip;
    };
    const total = cum[cum.length - 1];
    // Hand about a quarter of shoulder-to-fingertip; upper arm a little longer than the forearm.
    const wristAt = total * 0.77;
    return { shoulder, elbow: at(wristAt * 0.54), wrist: at(wristAt), tip };
  }

  // Follows an arm hanging near the body: slice the model horizontally from
  // armpit height down; below the armpit the arm is its own piece beside the
  // torso. Stops where it ends or touches the thigh. Returns shoulder, elbow,
  // wrist and tip, or null when no arm can be told apart from the body.
  function traceHangingArm(g, s, cx, chest, H, y) {
    const UP = [0, 1, 0], path = [];
    for (let f = 0.8; f >= 0.25; f -= 0.01) {
      const pieces = slicePieces(g, [cx, y(f), chest[2]], UP, 0.5 * H).filter((pc) => pc.cells >= 2);
      // The torso is the piece spanning the centre line (none below the crotch).
      const torso = pieces.find((pc) => pc.min[0] <= cx && pc.max[0] >= cx);
      const side = pieces.filter((pc) => pc !== torso && (pc.centroid[0] - cx) * s > 0);
      if (!side.length) { if (path.length) break; continue; }
      const outer = side.reduce((a, b) => ((b.centroid[0] - cx) * s > (a.centroid[0] - cx) * s ? b : a));
      // Legs only come apart below the crotch (about half height): a first
      // piece lower than that is a leg, so the arm never came free.
      if (!path.length && f < 0.52) return null;
      if (path.length && Math.abs(outer.centroid[0] - path[path.length - 1][0]) > 0.05 * H) break;
      path.push(outer.centroid);
    }
    if (path.length < 2) return null;
    // The shoulder joint sits at about the same height whatever the arms do:
    // extend the traced upper arm up to it, however low the arm came free.
    const k = Math.min(path.length - 1, 6);
    const d0 = nrm(sub(path[0], path[k]));
    const rise = y(0.8) - path[0][1];
    const shoulder = d0[1] > 0.3 && rise > 0 ? add(path[0], scl(d0, rise / d0[1])) : add(path[0], scl(d0, 0.05 * H));
    const line = [shoulder, ...path];
    // Arc-length walk from the shoulder, extended straight past the end.
    const at = (d) => {
      for (let i = 1; i < line.length; i++) {
        const l = len(sub(line[i], line[i - 1]));
        if (d <= l) return lerp(line[i - 1], line[i], d / (l || 1));
        d -= l;
      }
      const n = line.length;
      return add(line[n - 1], scl(nrm(sub(line[n - 1], line[n - 2])), d));
    };
    let total = 0;
    for (let i = 1; i < line.length; i++) total += len(sub(line[i], line[i - 1]));
    return {
      shoulder: [shoulder[0] - s * 0.01 * H, shoulder[1], shoulder[2]],
      elbow: at(0.17 * H), wrist: at(0.32 * H), tip: at(Math.max(Math.min(total, 0.42 * H), 0.38 * H)),
    };
  }

  // Places a humanoid skeleton by measuring the model. Assumes it stands
  // upright (+Y), faces +Z, with its arms away from the body (A- or T-pose).
  // Joints go to the middle of the solid body at standard proportions, so
  // it's a good start; the Rigger lets you drag any joint after.
  function fitHumanoid(model, opts) {
    const g = (opts && opts.grid) || voxelize(model, 110);
    const { min, max } = model.bounds;
    const H = max[1] - min[1];
    const y = (f) => min[1] + f * H;
    const UP = [0, 1, 0];
    // Centre line: the biggest piece of the body at chest height, nearest the middle.
    const mid = [(min[0] + max[0]) / 2, y(0.68), (min[2] + max[2]) / 2];
    const chest = sliceCentre(g, mid, UP, 0.2 * H);
    const cx = chest[0];
    const spineZ = (f) => sliceCentre(g, [cx, y(f), chest[2]], UP, 0.15 * H)[2];
    const pos = {};
    const put = (name, p) => { pos[name] = p; };
    put('Hips', [cx, y(0.5), spineZ(0.52)]);
    put('Spine', [cx, y(0.57), spineZ(0.57)]);
    put('Spine1', [cx, y(0.64), spineZ(0.64)]);
    put('Spine2', [cx, y(0.72), spineZ(0.72)]);
    put('Neck', [cx, y(0.835), spineZ(0.845)]);
    put('Head', [cx, y(0.875), spineZ(0.875)]);
    put('HeadTop_End', [cx, max[1], spineZ(0.93)]);

    for (const [S, s] of [['Left', 1], ['Right', -1]]) {
      // Legs: at each height, the piece of cross-section nearest where this
      // leg should be. Not the biggest piece: a hand hanging beside the thigh
      // is a piece too. Thighs that touch (or a skirt) make one piece across
      // the centre line: then take its half on this side.
      const legAt = (f, near) => {
        const pieces = slicePieces(g, [cx, y(f), chest[2]], UP, 0.3 * H).filter((pc) => pc.cells > 1);
        const joined = pieces.find((pc) => pc.min[0] < cx && pc.max[0] > cx);
        let best = null, bd = Infinity;
        for (const pc of pieces) {
          if (pc === joined || (pc.centroid[0] - cx) * s <= 0) continue;
          const d = Math.abs(pc.centroid[0] - near);
          if (d < bd) { bd = d; best = pc; }
        }
        if (best && bd < 0.08 * H) return best.centroid;
        if (joined) {
          // Out to the piece's edge, but no further than a leg can be (a hand
          // fused to the thigh widens the piece).
          const edge = s > 0 ? Math.min(joined.max[0], near + 0.08 * H) : Math.max(joined.min[0], near - 0.08 * H);
          return [(cx + edge) / 2, y(f), joined.centroid[2]];
        }
        return best ? best.centroid : [near, y(f), chest[2]];
      };
      const knee = legAt(0.28, cx + s * 0.06 * H), shin = legAt(0.1, knee[0]), thigh = legAt(0.4, knee[0]);
      put(S + 'UpLeg', [thigh[0], y(0.48), spineZ(0.5)]);
      put(S + 'Leg', [knee[0], y(0.28), knee[2]]);
      put(S + 'Foot', [shin[0], y(0.05), shin[2]]);
      // Toes: the front of the foot on this side.
      let toeZ = shin[2] + 0.12 * H;
      const feet = slicePieces(g, [shin[0], y(0.02), shin[2]], UP, 0.12 * H).filter((pc) => (pc.centroid[0] - cx) * s > 0);
      if (feet.length) toeZ = Math.max(shin[2] + 0.04 * H, feet[0].max[2]);
      put(S + 'ToeBase', [shin[0], y(0.02), shin[2] + (toeZ - shin[2]) * 0.6]);
      put(S + 'Toe_End', [shin[0], y(0.02), toeZ]);

      // Arms, two ways. Held well out (T-pose, wide A-pose): find the
      // fingertip, centre the wrist and elbow in the solid arm, extend that
      // line to the shoulder. Hanging close to the body: trace the arm down
      // through horizontal slices, where it is its own piece beside the torso.
      let tip = null;
      for (const pr of model.prims) {
        const P = pr.attrs.POSITION.data;
        for (let i = 0; i < P.length; i += 3) {
          if (P[i + 1] < y(0.3) || P[i + 1] > y(0.92)) continue;
          if (!tip || (P[i] - cx) * s > (tip[0] - cx) * s) tip = [P[i], P[i + 1], P[i + 2]];
        }
      }
      const guessShoulder = [cx + s * 0.11 * H, y(0.81), chest[2]];
      let arm = null;
      if (tip && (tip[0] - cx) * s > 0.25 * H) {
        arm = walkArm(g, tip, guessShoulder, H);
      }
      if (!arm) {
        arm = traceHangingArm(g, s, cx, chest, H, y);
      }
      if (!arm) {
        // Arms pressed to the body all the way down: nothing to trace. At chest
        // height the body's outer edge is then the arm's outer edge, so put
        // the arm just inside it, and let the user drag it if needed.
        const torso = slicePieces(g, [cx, y(0.7), chest[2]], UP, 0.3 * H)[0];
        const edge = torso ? (s > 0 ? torso.max[0] : torso.min[0]) : cx + s * 0.16 * H;
        const x = edge - s * 0.035 * H;
        arm = { shoulder: [x - s * 0.02 * H, y(0.81), chest[2]], elbow: [x, y(0.63), chest[2]], wrist: [x + s * 0.01 * H, y(0.48), chest[2]], tip: [x + s * 0.01 * H, y(0.4), chest[2]] };
      }
      put(S + 'Shoulder', [cx + (arm.shoulder[0] - cx) * 0.3, arm.shoulder[1] - 0.005 * H, pos.Spine2[2]]);
      put(S + 'Arm', arm.shoulder);
      put(S + 'ForeArm', arm.elbow);
      put(S + 'Hand', arm.wrist);
      put(S + 'Hand_End', arm.tip);
    }
    const skel = makeSkeleton(HUMANOID, pos);
    skel.height = H;
    return skel;
  }

  /* ---------------------------------------------------------------- weights */

  function segDist(p, a, b) {
    const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
    return len(sub(p, add(a, scl(ab, t))));
  }

  // Min-heap of (distance, cell) pairs, for Dijkstra.
  function Heap(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  Heap.prototype.push = function (k, v) {
    if (this.n === this.k.length) {
      const k2 = new Float64Array(this.n * 2), v2 = new Int32Array(this.n * 2);
      k2.set(this.k); v2.set(this.v); this.k = k2; this.v = v2;
    }
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= k) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = k; this.v[i] = v;
  };
  Heap.prototype.pop = function () {
    const top = this.v[0], topK = this.k[0];
    const k = this.k[--this.n], v = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= k) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = k; this.v[i] = v;
    this.lastKey = topK;
    return top;
  };

  // Returns per-primitive { joints: Uint8Array|Uint16Array, weights: Float32Array }
  // (4 influences per vertex), in the same order as model.prims.
  function computeWeights(model, skel, opts) {
    opts = opts || {};
    const power = opts.power || 4;
    const B = skel.bones;
    const deform = B.map((b, i) => i).filter((i) => !B[i].end && B[i].to >= 0);
    const g = opts.grid || voxelize(model, opts.resolution || 110);
    const { state, nx, ny, nz, N, cell, org, at, cellOf, centre, inside } = g;
    const nb26 = [];
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy || dz) nb26.push([dx + nx * (dy + ny * dz), Math.hypot(dx, dy, dz) * cell]);
    }
    const insideCells = [];
    for (let c = 0; c < N; c++) if (inside(c)) insideCells.push(c);

    // Arms, cut free of the body. Below the armpit, an arm bone may only reach
    // into a tube around its own arm (shoulder, elbow, wrist, fingertip), and
    // no other bone may reach into the arm's core. Without this, a hand
    // resting on a hip is joined to it and claims it: raise the arm and the
    // hip comes along. The tube's width is the arm's measured thickness.
    const height = model.bounds.max[1] - model.bounds.min[1];
    const byName = (nm) => B.findIndex((b) => b.name === nm);
    const arms = ['Left', 'Right'].map((S) => {
      const chain = ['Arm', 'ForeArm', 'Hand', 'Hand_End'].map((n) => byName(S + n));
      if (chain.some((i) => i < 0)) return null;
      const pts = chain.map((i) => B[i].pos);
      // Thickness: from points along the forearm and upper arm, step out to the
      // skin in directions away from the body (outwards, forwards, backwards) -
      // never inwards, where the arm may touch the chest or hip.
      const side = Math.sign(pts[0][0] - B[0].pos[0]) || 1;
      const reach = (from, dirV) => {
        for (let d = 0; d < 0.15 * height; d += cell * 0.5) if (!inside(cellOf(add(from, scl(dirV, d))))) return d;
        return 0.15 * height;
      };
      const radii = [];
      for (const [i, j, t] of [[0, 1, 0.5], [1, 2, 0.35], [1, 2, 0.65]]) {
        const q = lerp(pts[i], pts[j], t), along = nrm(sub(pts[j], pts[i]));
        const out = nrm(sub([side, 0, 0], scl(along, along[0] * side))); // outward, square to the arm
        const fwd = nrm(cross(along, out));
        radii.push(reach(q, out), reach(q, fwd), reach(q, scl(fwd, -1)));
      }
      radii.sort((x, y) => x - y);
      const r = Math.min(0.05 * height, Math.max(0.012 * height, radii[Math.floor(radii.length / 2)]));
      return { bones: new Set(chain.slice(0, 3)), pts, r, armpit: pts[0][1] - 0.05 * height };
    }).filter(Boolean);
    const tubeDist = (arm, p) => Math.min(segDist(p, arm.pts[0], arm.pts[1]), segDist(p, arm.pts[1], arm.pts[2]), segDist(p, arm.pts[2], arm.pts[3]));
    // Per cell: 0 free, 1 = inside arm k's tube (k+1 stored), with a core flag.
    const armOf = new Int8Array(N), armCore = new Uint8Array(N);
    if (arms.length) {
      for (let c = 0; c < N; c++) {
        if (!inside(c)) continue;
        const q = centre(c);
        arms.forEach((arm, k) => {
          if (q[1] >= arm.armpit) return;
          const d = tubeDist(arm, q);
          if (d < arm.r * 1.2) { armOf[c] = k + 1; if (d < arm.r * 0.8) armCore[c] = 1; }
        });
      }
    }
    // May bone bi's walk enter cell c?
    const allowed = (bi, c) => {
      for (let k = 0; k < arms.length; k++) {
        if (arms[k].bones.has(bi)) return centre(c)[1] >= arms[k].armpit || armOf[c] === k + 1;
      }
      return !armCore[c];
    };

    // 3. Distance from each bone, walking only through the body.
    const dist = deform.map((bi) => {
      const a = B[bi].pos, b = B[B[bi].to].pos;
      const D = new Float64Array(N).fill(Infinity); // Must match the heap keys exactly.
      const ok = new Uint8Array(N);
      for (const c of insideCells) ok[c] = allowed(bi, c) ? 1 : 0;
      const heap = new Heap(4096);
      const steps = Math.max(1, Math.ceil(len(sub(b, a)) / (cell * 0.5)));
      for (let s = 0; s <= steps; s++) {
        const c = cellOf(lerp(a, b, s / steps));
        if (inside(c) && D[c] !== 0 && allowed(bi, c)) { D[c] = 0; heap.push(0, c); }
      }
      if (!heap.n) {
        // The bone runs outside the mesh: start from the nearest body cell.
        let best = -1, bd = Infinity;
        for (const c of insideCells) { if (!allowed(bi, c)) continue; const d = segDist(centre(c), a, b); if (d < bd) { bd = d; best = c; } }
        if (best >= 0) { D[best] = bd; heap.push(bd, best); }
      }
      while (heap.n) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > D[c]) continue;
        for (const [o, w] of nb26) {
          const d = c + o;
          if (state[d] === 2 || !ok[d]) continue;
          const nd = dc + w;
          if (nd < D[d]) { D[d] = nd; heap.push(nd, d); }
        }
      }
      return D;
    });

    // Trilinear distance at a point, from whichever neighbouring cells the walk reached.
    const sample = (D, p) => {
      // A cell this bone could not reach (another body part, or cut off) means
      // the bone doesn't reach this vertex - don't borrow from the neighbours.
      if (!isFinite(D[cellOf(p)])) return Infinity;
      const fx = (p[0] - org[0]) / cell - 0.5, fy = (p[1] - org[1]) / cell - 0.5, fz = (p[2] - org[2]) / cell - 0.5;
      const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
      let sum = 0, wsum = 0;
      for (let dk = 0; dk <= 1; dk++) for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
        const i = i0 + di, j = j0 + dj, k = k0 + dk;
        if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
        const v = D[at(i, j, k)];
        if (!isFinite(v)) continue;
        const w = (di ? fx - i0 : 1 - (fx - i0)) * (dj ? fy - j0 : 1 - (fy - j0)) * (dk ? fz - k0 : 1 - (fz - k0));
        sum += v * w; wsum += w;
      }
      return wsum > 1e-6 ? sum / wsum : D[cellOf(p)];
    };

    const seesBone = (p, a, b) => {
      const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
      const q = add(a, scl(ab, t)), d = len(sub(q, p));
      // Skip the first cell (the vertex sits on the surface) and stop short of the bone.
      const steps = Math.floor(d / (cell * 0.5));
      for (let i = 2; i < steps - 1; i++) if (state[cellOf(lerp(p, q, i / steps))] === 2) return false;
      return true;
    };

    // 4. Weights: 1/d^power, strongest four, normalised.
    const big = B.length > 255;
    const raw = model.prims.map((pr) => {
      const P = pr.attrs.POSITION.data, n = P.length / 3;
      const joints = big ? new Uint16Array(n * 4) : new Uint8Array(n * 4);
      const weights = new Float32Array(n * 4);
      const cand = new Array(deform.length);
      for (let v = 0; v < n; v++) {
        const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
        let reach = false;
        for (let d = 0; d < deform.length; d++) {
          let g = sample(dist[d], p);
          if (isFinite(g)) reach = true;
          cand[d] = [deform[d], g];
        }
        // Floating pieces the walk can't reach fall back to straight-line distance.
        if (!reach) for (let d = 0; d < deform.length; d++) cand[d][1] = segDist(p, B[deform[d]].pos, B[B[deform[d]].to].pos);
        for (const c of cand) c[2] = isFinite(c[1]) ? 1 / Math.pow(Math.max(c[1], cell * 0.5), power) : 0;
        cand.sort((x, y) => y[2] - x[2]);
        // Line of sight: a bone may only move a vertex if the straight line
        // from the vertex to the bone stays inside the body. Where a hand
        // rests on a hip, the walk through the body is short, but the line
        // from the hip to the hand bone crosses open air - so the hip stays put.
        if (reach && cand[0][2] > 0) {
          let kept = 0;
          for (let k = 0; k < Math.min(8, cand.length); k++) {
            if (!cand[k][2]) break;
            const bi = cand[k][0];
            if (seesBone(p, B[bi].pos, B[B[bi].to].pos)) kept++;
            else cand[k][2] = 0;
          }
          if (kept) cand.sort((x, y) => y[2] - x[2]);
          else for (const c of cand) c[2] = isFinite(c[1]) ? 1 / Math.pow(Math.max(c[1], cell * 0.5), power) : 0;
        }
        let total = 0;
        for (let k = 0; k < 4; k++) total += cand[k][2];
        for (let k = 0; k < 4; k++) {
          joints[v * 4 + k] = cand[k][0];
          weights[v * 4 + k] = total > 0 ? cand[k][2] / total : k === 0 ? 1 : 0;
        }
        // Drop crumbs below 1% and renormalise, so influences stay crisp.
        let s = 0;
        for (let k = 0; k < 4; k++) { if (weights[v * 4 + k] < 0.01) weights[v * 4 + k] = 0; s += weights[v * 4 + k]; }
        for (let k = 0; k < 4; k++) {
          weights[v * 4 + k] /= s || 1;
          if (!weights[v * 4 + k]) joints[v * 4 + k] = 0; // Unused slots point at bone 0, per glTF.
        }
      }
      return { joints, weights };
    });
    return opts.smooth === 0 ? raw : smoothWeights(model, raw, B.length, opts.smooth);
  }

  // Blends each vertex's weights with its neighbours' over a few centimetres.
  // Where one part meets another - an arm pressed to the side, a hand on a
  // hip - weights change abruptly from one vertex to the next, and moving the
  // limb rips the skin into strips. Smoothed, the skin between them stretches
  // instead. Vertices are welded by position first, so UV seams and flat
  // shading (split vertices) don't stop the blending.
  function smoothWeights(model, skin, nBones, amount) {
    const key = new Map(), weld = [];
    let count = 0;
    const q = (x) => Math.round(x * 1e4);
    model.prims.forEach((pr) => {
      const P = pr.attrs.POSITION.data, ids = new Int32Array(P.length / 3);
      for (let v = 0; v < ids.length; v++) {
        const k = q(P[v * 3]) + ',' + q(P[v * 3 + 1]) + ',' + q(P[v * 3 + 2]);
        let id = key.get(k);
        if (id === undefined) { id = count++; key.set(k, id); }
        ids[v] = id;
      }
      weld.push(ids);
    });
    // Neighbour lists (edges of every triangle) and the typical edge length.
    const nbr = Array.from({ length: count }, () => new Map()); // neighbour -> edge length
    const edges = [];
    model.prims.forEach((pr, pi) => {
      const I = pr.idx, ids = weld[pi], P = pr.attrs.POSITION.data;
      for (let t = 0; t < I.length; t += 3) for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) {
        const ia = ids[a], ib = ids[b];
        if (ia === ib) continue;
        const l = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
        nbr[ia].set(ib, l); nbr[ib].set(ia, l);
        if (edges.length < 20000) edges.push(l);
      }
    });
    edges.sort((x, y) => x - y);
    const edge = edges.length ? edges[edges.length >> 1] : 0.01;
    const { min, max } = model.bounds;
    const height = max[1] - min[1] || 1;
    // Each pass spreads about one edge length; blend over ~3% of the height
    // (5 cm on a person): enough to stop tearing, not enough to blur joints.
    const spread = (amount == null ? 1 : amount) * 0.03 * height;
    const passes = Math.max(1, Math.min(40, Math.round((spread / edge) ** 2)));
    // Dense weights per welded vertex (averaging split copies).
    let W = new Float32Array(count * nBones);
    const seen = new Uint16Array(count);
    skin.forEach((sk, pi) => {
      const ids = weld[pi];
      for (let v = 0; v < ids.length; v++) {
        seen[ids[v]]++;
        for (let k = 0; k < 4; k++) W[ids[v] * nBones + sk.joints[v * 4 + k]] += sk.weights[v * 4 + k];
      }
    });
    for (let id = 0; id < count; id++) if (seen[id] > 1) for (let b = 0; b < nBones; b++) W[id * nBones + b] /= seen[id];
    // Near neighbours count fully, far ones hardly at all: on a coarse mesh a
    // vertex 20 cm away is not "next to" this one, whatever the triangles say.
    const lists = nbr.map((m) => Int32Array.from(m.keys()));
    const pull = nbr.map((m) => Float32Array.from(m.values(), (l) => Math.exp(-4 * (l / spread) ** 2)));
    let next = new Float32Array(W.length);
    for (let pass = 0; pass < passes; pass++) {
      for (let id = 0; id < count; id++) {
        const L = lists[id], K = pull[id], o = id * nBones;
        let ksum = 0;
        for (let j = 0; j < L.length; j++) ksum += K[j];
        for (let b = 0; b < nBones; b++) {
          let sum = W[o + b];
          for (let j = 0; j < L.length; j++) sum += K[j] * W[L[j] * nBones + b];
          next[o + b] = sum / (1 + ksum);
        }
      }
      [W, next] = [next, W];
    }
    // Back to the four strongest per vertex, normalised, crumbs dropped.
    return skin.map((sk, pi) => {
      const ids = weld[pi], n = ids.length;
      const joints = new sk.joints.constructor(n * 4), weights = new Float32Array(n * 4);
      const top = [];
      for (let v = 0; v < n; v++) {
        const o = ids[v] * nBones;
        top.length = 0;
        for (let b = 0; b < nBones; b++) if (W[o + b] > 0) top.push([b, W[o + b]]);
        top.sort((x, y) => y[1] - x[1]);
        let s = 0;
        for (let k = 0; k < 4 && k < top.length; k++) if (top[k][1] >= 0.01) s += top[k][1];
        for (let k = 0; k < 4; k++) {
          const ok = k < top.length && top[k][1] >= 0.01 && s > 0;
          joints[v * 4 + k] = ok ? top[k][0] : 0;
          weights[v * 4 + k] = ok ? top[k][1] / s : 0;
        }
        if (!(s > 0)) { joints[v * 4] = sk.joints[v * 4]; weights[v * 4] = 1; }
      }
      return { joints, weights };
    });
  }

  /* ---------------------------------------------------------------- animation */

  // Angle of the upper arm below horizontal, in degrees (0 = T-pose).
  function armDrop(skel, side) {
    const B = skel.bones, arm = B.find((b) => b.name === side + 'Arm'), fore = B[arm.to];
    const d = sub(fore.pos, arm.pos);
    return (Math.atan2(-d[1], Math.abs(d[0])) * 180) / Math.PI;
  }

  // Each clip maps a phase p in [0,1) to { bone: {x,y,z degrees}, _root: [dx,dy,dz] }.
  // Axes are the parent's: X pitches forward/back (negative swings a limb
  // forward), Z raises and lowers the arms, Y turns.
  const CLIPS = {
    Idle: {
      seconds: 3,
      pose(p, s) {
        const w = Math.sin(2 * Math.PI * p), hang = 72;
        return {
          Spine1: { x: 1.5 * w }, Spine2: { x: 1.5 * w }, Neck: { y: 3 * Math.sin(2 * Math.PI * p + 1) }, Head: { x: -1.5 * w },
          LeftArm: { z: -(hang - s.dropL) + 2 * w }, RightArm: { z: (hang - s.dropR) - 2 * w },
          LeftForeArm: { z: -8 }, RightForeArm: { z: 8 },
        };
      },
    },
    Walk: {
      seconds: 1.1,
      pose(p, s) {
        const a = 2 * Math.PI * p, sw = Math.sin(a), hang = 72;
        const H = s.height;
        return {
          _root: [0, -0.012 * H * sw * sw, 0],
          Hips: { y: 5 * sw }, Spine2: { y: -8 * sw }, Spine: { x: 3 },
          LeftUpLeg: { x: -26 * sw }, RightUpLeg: { x: 26 * sw },
          LeftLeg: { x: 5 + 45 * Math.max(0, Math.cos(a)) }, RightLeg: { x: 5 + 45 * Math.max(0, -Math.cos(a)) },
          LeftFoot: { x: -10 * Math.max(0, Math.cos(a)) + 8 * sw }, RightFoot: { x: -10 * Math.max(0, -Math.cos(a)) - 8 * sw },
          LeftArm: { z: -(hang - s.dropL), x: 22 * sw }, RightArm: { z: hang - s.dropR, x: -22 * sw },
          LeftForeArm: { x: -12 - 10 * Math.max(0, -sw) }, RightForeArm: { x: -12 - 10 * Math.max(0, sw) },
        };
      },
    },
    Wave: {
      seconds: 2,
      pose(p, s) {
        const w = Math.sin(2 * Math.PI * 2 * p);
        return {
          RightArm: { z: -(s.dropR + 65) }, RightForeArm: { z: -(30 + 25 * w) }, RightHand: { z: -10 * w },
          LeftArm: { z: -(72 - s.dropL) }, Head: { z: 4 * w, y: -6 }, Spine2: { z: 2 },
        };
      },
    },
    // Bends one joint group after another: play it to check the weights.
    Flex: {
      seconds: 6,
      pose(p) {
        const phase = Math.floor(p * 6), u = Math.sin(Math.PI * ((p * 6) % 1));
        const P = [
          { LeftForeArm: { y: 100 * u }, RightForeArm: { y: -100 * u } },
          { LeftArm: { z: 60 * u }, RightArm: { z: -60 * u } },
          { LeftUpLeg: { x: -70 * u }, LeftLeg: { x: 90 * u } },
          { RightUpLeg: { x: -70 * u }, RightLeg: { x: 90 * u } },
          { Spine: { x: 15 * u }, Spine1: { x: 15 * u }, Spine2: { x: 15 * u } },
          { Neck: { y: 30 * u }, Head: { x: 20 * u } },
        ];
        return P[phase] || {};
      },
    },
    TPose: {
      seconds: 1 / 30,
      pose(p, s) { return { LeftArm: { z: s.dropL }, RightArm: { z: -s.dropR } }; },
    },
  };

  function clipContext(skel) {
    return { dropL: armDrop(skel, 'Left'), dropR: armDrop(skel, 'Right'), height: skel.height || 1.8 };
  }

  // Joint matrices for skinning at time t (seconds) of a clip (null = rest pose).
  function poseMatrices(skel, clipName, t) {
    const B = skel.bones;
    const clip = clipName && CLIPS[clipName];
    const pose = clip ? clip.pose(((t / clip.seconds) % 1 + 1) % 1, clipContext(skel)) : {};
    const world = new Array(B.length), out = new Array(B.length), posed = new Array(B.length);
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      const parentPos = b.parent >= 0 ? B[b.parent].pos : [0, 0, 0];
      let tr = sub(b.pos, parentPos);
      if (b.parent < 0 && pose._root) tr = add(tr, pose._root);
      const local = compose(tr, pose[b.name] ? euler(pose[b.name]) : [0, 0, 0, 1]);
      world[i] = b.parent >= 0 ? mmul(world[b.parent], local) : local;
      out[i] = mmul(world[i], compose(scl(b.pos, -1)));
      posed[i] = [world[i][12], world[i][13], world[i][14]];
    }
    return { matrices: out, positions: posed };
  }

  /* ---------------------------------------------------------------- glTF out */

  // With skel and skin null, writes the (readied) model with no skeleton.
  function exportRigged(model, skel, skin, opts) {
    opts = opts || {};
    const clips = skel ? opts.clips || Object.keys(CLIPS) : [];
    const src = model.doc.json;
    const B = skel ? skel.bones : [];
    const chunks = [];
    let binLen = 0;
    const bufferViews = [], accessors = [];
    const view = (bytes, target) => {
      const pad = (4 - (binLen % 4)) % 4;
      if (pad) { chunks.push(new Uint8Array(pad)); binLen += pad; }
      chunks.push(bytes);
      bufferViews.push(Object.assign({ buffer: 0, byteOffset: binLen, byteLength: bytes.byteLength }, target ? { target } : {}));
      binLen += bytes.byteLength;
      return bufferViews.length - 1;
    };
    const u8 = (ta) => new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength);
    const TYPE = { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4', 16: 'MAT4' };
    const accessor = (ta, n, target, extra) => {
      const componentType = ta instanceof Float32Array ? 5126 : ta instanceof Uint32Array ? 5125 : ta instanceof Uint16Array ? 5123 : 5121;
      accessors.push(Object.assign({ bufferView: view(u8(ta), target), componentType, count: ta.length / n, type: TYPE[n] }, extra || {}));
      return accessors.length - 1;
    };

    // Images: re-home any that lived in the source's binary chunk.
    const images = (src.images || []).map((im) => {
      const copy = Object.assign({}, im);
      if (im.bufferView !== undefined) {
        const bv = src.bufferViews[im.bufferView];
        const buf = model.doc.buffers[bv.buffer];
        copy.bufferView = view(buf.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
      }
      return copy;
    });

    const primitives = model.prims.map((pr, pi) => {
      const attributes = {};
      for (const [key, { data, n }] of Object.entries(pr.attrs)) {
        let extra;
        if (key === 'POSITION') {
          const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
          for (let i = 0; i < data.length; i++) { const k = i % 3; if (data[i] < min[k]) min[k] = data[i]; if (data[i] > max[k]) max[k] = data[i]; }
          extra = { min, max };
        }
        attributes[key] = accessor(data, n, 34962, extra);
      }
      if (skin) {
        attributes.JOINTS_0 = accessor(skin[pi].joints, 4, 34962);
        attributes.WEIGHTS_0 = accessor(skin[pi].weights, 4, 34962);
      }
      const idx = pr.count > 65535 ? pr.idx : Uint16Array.from(pr.idx);
      const p = { attributes, indices: accessor(idx, 1, 34963), mode: 4 };
      if (pr.material !== undefined) p.material = pr.material;
      return p;
    });

    // Nodes: 0 is the mesh, then one per bone in skeleton order.
    const nodes = [skel ? { name: model.name, mesh: 0, skin: 0 } : { name: model.name, mesh: 0 }];
    for (const b of B) nodes.push({ name: b.name, translation: sub(b.pos, b.parent >= 0 ? B[b.parent].pos : [0, 0, 0]) });
    B.forEach((b, i) => {
      const kids = B.map((c, j) => (c.parent === i ? j + 1 : -1)).filter((j) => j > 0);
      if (kids.length) nodes[i + 1].children = kids;
    });
    const rootBone = B.findIndex((b) => b.parent < 0) + 1;
    let skins;
    if (skel) {
      const ibm = new Float32Array(16 * B.length);
      B.forEach((b, i) => ibm.set(compose(scl(b.pos, -1)), i * 16));
      skins = [{ name: 'Armature', joints: B.map((_, i) => i + 1), skeleton: rootBone, inverseBindMatrices: accessor(ibm, 16) }];
    }

    // Animations: sampled at 30 fps, linear.
    const ctx = skel ? clipContext(skel) : null;
    const animations = [];
    for (const name of clips) {
      const clip = CLIPS[name];
      const frames = Math.max(1, Math.round(clip.seconds * 30));
      const times = new Float32Array(frames + 1);
      const poses = [];
      for (let f = 0; f <= frames; f++) { times[f] = (f / frames) * clip.seconds; poses.push(clip.pose(f === frames ? 0 : f / frames, ctx)); }
      const input = accessor(times, 1, undefined, { min: [0], max: [times[frames]] });
      const samplers = [], channels = [];
      B.forEach((b, i) => {
        if (!poses.some((p) => p[b.name])) return;
        const q = new Float32Array((frames + 1) * 4);
        poses.forEach((p, f) => q.set(p[b.name] ? euler(p[b.name]) : [0, 0, 0, 1], f * 4));
        samplers.push({ input, output: accessor(q, 4), interpolation: 'LINEAR' });
        channels.push({ sampler: samplers.length - 1, target: { node: i + 1, path: 'rotation' } });
      });
      if (poses.some((p) => p._root)) {
        const b = B[rootBone - 1];
        const base = b.pos;
        const tr = new Float32Array((frames + 1) * 3);
        poses.forEach((p, f) => tr.set(add(base, p._root || [0, 0, 0]), f * 3));
        samplers.push({ input, output: accessor(tr, 3), interpolation: 'LINEAR' });
        channels.push({ sampler: samplers.length - 1, target: { node: rootBone, path: 'translation' } });
      }
      if (channels.length) animations.push({ name, samplers, channels });
    }

    const json = {
      asset: { version: '2.0', generator: 'ModelRig (ModelGen tools)' },
      scene: 0,
      scenes: [{ name: model.name, nodes: skel ? [0, rootBone] : [0] }],
      nodes,
      meshes: [{ name: model.name, primitives }],
      buffers: [{ byteLength: 0 }],
      bufferViews,
      accessors,
    };
    if (skins) json.skins = skins;
    if (animations.length) json.animations = animations;
    for (const key of ['materials', 'textures', 'samplers']) if (src[key]) json[key] = JSON.parse(JSON.stringify(src[key]));
    if (images.length) json.images = images;
    const used = (src.extensionsUsed || []).filter((e) => !UNSUPPORTED.includes(e));
    if (used.length) json.extensionsUsed = used;
    const req = (src.extensionsRequired || []).filter((e) => used.includes(e));
    if (req.length) json.extensionsRequired = req;
    // Keep provenance (which tool or AI model made the mesh) and add ours.
    json.extras = Object.assign({}, src.extras || {}, (src.asset && src.asset.extras) || {},
      skel ? { rig: { skeleton: skel.type, bones: B.length, sourceGenerator: (src.asset && src.asset.generator) || 'unknown' } } : {});
    if (!Object.keys(json.extras).length) delete json.extras;

    const bin = new Uint8Array(Math.ceil(binLen / 4) * 4);
    let o = 0;
    for (const c of chunks) { bin.set(c, o); o += c.byteLength; }
    json.buffers[0].byteLength = bin.length;
    const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const jsonLen = Math.ceil(jsonBytes.length / 4) * 4;
    const total = 12 + 8 + jsonLen + 8 + bin.length;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4E4F534A, true);
    out.fill(0x20, 20, 20 + jsonLen); out.set(jsonBytes, 20);
    dv.setUint32(20 + jsonLen, bin.length, true); dv.setUint32(24 + jsonLen, 0x004E4942, true);
    out.set(bin, 28 + jsonLen);
    return out;
  }

  return {
    loadModel, normalizeModel, voxelize, fitHumanoid, makeSkeleton, computeWeights, poseMatrices, exportRigged, armDrop,
    CLIPS, HUMANOID, compose, mmul, xformPoint,
  };
});
