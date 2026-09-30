#!/usr/bin/env node
/* ModelGen self-check: every type, many seeds, every detail level.
 *
 * Asserts that each model is deterministic (same seed, same bytes), finite,
 * sensibly sized, stands on the ground where it should, and that its GLB is
 * structurally valid glTF 2.0 (chunk layout, accessor bounds, index range) and
 * its OBJ references only vertices and normals that exist.
 *
 *   node tools/modelgen/check.js
 */
const MG = require('./modelgen');

const SEEDS = 60;
const fails = [];
const fail = (what) => { fails.push(what); if (fails.length < 20) console.error('  FAIL ' + what); };

function checkGLB(bytes, model, tag) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546C67) return fail(`${tag}: bad magic`);
  if (dv.getUint32(8, true) !== bytes.length) return fail(`${tag}: header length`);
  const jsonLen = dv.getUint32(12, true);
  if (jsonLen % 4 || dv.getUint32(16, true) !== 0x4E4F534A) return fail(`${tag}: JSON chunk`);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  const binLen = dv.getUint32(20 + jsonLen, true);
  if (dv.getUint32(24 + jsonLen, true) !== 0x004E4942) return fail(`${tag}: BIN chunk`);
  if (28 + jsonLen + binLen !== bytes.length || json.buffers[0].byteLength !== binLen) return fail(`${tag}: BIN length`);
  const bin = bytes.subarray(28 + jsonLen);
  const size = { 5126: 4, 5125: 4, 5123: 2 };
  const acc = json.accessors.map((a) => {
    const v = json.bufferViews[a.bufferView];
    if (v.byteOffset % 4) fail(`${tag}: misaligned view`);
    const comps = a.type === 'VEC3' ? 3 : 1;
    if (v.byteLength !== a.count * comps * size[a.componentType]) fail(`${tag}: view/accessor size`);
    if (v.byteOffset + v.byteLength > binLen) fail(`${tag}: view overruns buffer`);
    const Arr = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
    return new Arr(bin.buffer.slice(bin.byteOffset + v.byteOffset, bin.byteOffset + v.byteOffset + v.byteLength));
  });
  const [pos, nrm, col, idx] = acc;
  const count = json.accessors[0].count;
  if (idx.length % 3 || idx.length / 3 !== model.triangles) fail(`${tag}: index count ${idx.length / 3} vs ${model.triangles}`);
  for (const i of idx) if (i >= count) { fail(`${tag}: index out of range`); break; }
  const { min, max } = json.accessors[0];
  for (let i = 0; i < pos.length; i++) {
    if (!isFinite(pos[i]) || pos[i] < min[i % 3] - 1e-6 || pos[i] > max[i % 3] + 1e-6) { fail(`${tag}: position outside min/max`); break; }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    if (Math.abs(Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) - 1) > 1e-3) { fail(`${tag}: normal not unit`); break; }
  }
  for (const c of col) if (!(c >= 0 && c <= 1)) { fail(`${tag}: colour out of 0..1`); break; }
}

function checkOBJ({ obj, mtl }, tag) {
  const lines = obj.split('\n');
  const v = lines.filter((l) => l.startsWith('v ')).length;
  const vn = lines.filter((l) => l.startsWith('vn ')).length;
  const mats = new Set(mtl.split('\n').filter((l) => l.startsWith('newmtl ')).map((l) => l.slice(7)));
  for (const l of lines) {
    if (l.startsWith('usemtl ') && !mats.has(l.slice(7))) return fail(`${tag}: OBJ uses undefined material`);
    if (!l.startsWith('f ')) continue;
    for (const ref of l.slice(2).split(' ')) {
      const [a, , b] = ref.split('/').map(Number);
      if (!(a >= 1 && a <= v && b >= 1 && b <= vn)) return fail(`${tag}: OBJ face ref out of range`);
    }
  }
}

// Weapons pivot at the hand; everything else stands on y = 0.
const PIVOT_AT_HAND = new Set(['sword', 'axe']);
// Rough plausible size envelopes in metres: [min tallest dimension, max].
const SIZE = {
  tree: [2.5, 7], pine: [3, 7], rock: [0.2, 3.5], crystal: [0.4, 2], crate: [0.6, 1.3], barrel: [0.8, 1.4],
  chest: [0.6, 1.4], sword: [0.7, 1.4], axe: [0.5, 1.2], potion: [0.1, 0.45], mushroom: [0.2, 0.9], house: [3, 8], fence: [1, 5], figure: [1.55, 2.0],
};

// Winding: a closed mesh whose triangles all face outward has positive signed
// volume. Checked on each primitive against its analytic volume, so an
// inside-out cap or side shows up as a shortfall, not just a sign.
function signedVolume(part) {
  let v = 0;
  for (const t of part.tris) {
    const [a, b, c] = t.v;
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}
const polyArea = (n, r) => 0.5 * n * r * r * Math.sin((2 * Math.PI) / n);
const PRIMS = [
  ['box', MG.box(1, 2, 3), 6],
  ['mirrored box', MG.box(1, 2, 3).scale(-1, 1, 1), 6],
  ['cylinder', MG.cylinder(0.5, 0.5, 2, 8), polyArea(8, 0.5) * 2],
  ['cone', MG.lathe([[1, 0], [0, 3]], 6), polyArea(6, 1)],
  ['inverted cone', MG.lathe([[0, 0], [1, 3]], 6), polyArea(6, 1)],
  ['icosphere', MG.icosphere(1, 3), (4 / 3) * Math.PI * 0.97],
  ['extruded square', MG.extrude([[0, 0], [1, 0], [1, 1], [0, 1]], 2), 2],
  ['extruded CW L-shape', MG.extrude([[0, 0], [0, 2], [1, 2], [1, 1], [2, 1], [2, 0]], 1), 3],
];
for (const [name, part, want] of PRIMS) {
  const got = signedVolume(part);
  if (Math.abs(got - want) > want * 0.03) fail(`${name}: signed volume ${got.toFixed(4)}, expected ${want.toFixed(4)}`);
}

const t0 = Date.now();
let models = 0, tris = 0;
for (const type of MG.types()) {
  for (let seed = 0; seed < SEEDS; seed++) {
    for (const detail of seed % 10 === 0 ? [0.5, 1, 2] : [1]) {
      const tag = `${type} seed ${seed} detail ${detail}`;
      const m = MG.generate(type, seed, { detail });
      models++; tris += m.triangles;
      if (m.triangles < 12) fail(`${tag}: only ${m.triangles} triangles`);
      if (m.triangles > 20000) fail(`${tag}: ${m.triangles} triangles is not low-poly`);
      const { min, max } = m.bounds;
      if (![...min, ...max].every(isFinite)) { fail(`${tag}: non-finite bounds`); continue; }
      if (!PIVOT_AT_HAND.has(type) && Math.abs(min[1]) > 0.02) fail(`${tag}: bottom at y=${min[1].toFixed(3)}, not on the ground`);
      const extent = Math.max(...max.map((v, i) => v - min[i]));
      if (SIZE[type] && (extent < SIZE[type][0] || extent > SIZE[type][1])) fail(`${tag}: extent ${extent.toFixed(2)} m outside ${SIZE[type]}`);
      const glb = MG.toGLB(m);
      checkGLB(glb, m, tag);
      if (detail === 1 && seed % 5 === 0) {
        const again = MG.toGLB(MG.generate(type, seed, { detail }));
        if (Buffer.compare(Buffer.from(glb), Buffer.from(again))) fail(`${tag}: not deterministic`);
        checkOBJ(MG.toOBJ(m), tag);
      }
    }
  }
}
if (MG.generate('rock', 'quarry-gate').seed !== MG.generate('rock', 'quarry-gate').seed) fail('string seeds unstable');
if (Buffer.compare(Buffer.from(MG.toGLB(MG.generate('rock', 7))), Buffer.from(MG.toGLB(MG.generate('tree', 7)))) === 0) fail('types share streams');

// Rigging: fit, weigh, pose and export the test figure at several seeds.
const Rig = require('./rig');
for (const seed of [1, 2, 3]) {
  const tag = `rig figure ${seed}`;
  const model = Rig.loadModel(MG.toGLB(MG.generate('figure', seed)), 'figure');
  Rig.normalizeModel(model, { height: 1.8 });
  const skel = Rig.fitHumanoid(model);
  const skin = Rig.computeWeights(model, skel);
  const B = skel.bones, bone = (n) => B.find((b) => b.name === n);
  // Left/right symmetry about the centre line (the figure is near-symmetric).
  for (const b of B) if (b.name.startsWith('Left')) {
    const m = bone('Right' + b.name.slice(4));
    if (Math.abs(b.pos[0] + m.pos[0] - 2 * bone('Hips').pos[0]) > 0.06) fail(`${tag}: ${b.name} not mirrored`);
  }
  if (!(bone('LeftLeg').pos[1] < bone('LeftUpLeg').pos[1] && bone('Head').pos[1] > bone('Neck').pos[1])) fail(`${tag}: joints out of order`);
  // Skin on the CPU: rest pose is exact; in a walk the feet move and the head barely does.
  const P = model.prims[0].attrs.POSITION.data, J = skin[0].joints, W = skin[0].weights;
  const pose = (clip, t) => {
    const { matrices } = Rig.poseMatrices(skel, clip, t);
    const out = new Float32Array(P.length);
    for (let v = 0; v < P.length / 3; v++) for (let k = 0; k < 4; k++) {
      const w = W[v * 4 + k]; if (!w) continue;
      const q = Rig.xformPoint(matrices[J[v * 4 + k]], [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
      out[v * 3] += q[0] * w; out[v * 3 + 1] += q[1] * w; out[v * 3 + 2] += q[2] * w;
    }
    return out;
  };
  const rest = pose(null, 0);
  if (rest.some((x, i) => Math.abs(x - P[i]) > 1e-4)) fail(`${tag}: rest pose moves the mesh`);
  const walk = pose('Walk', 0.275);
  const dz = (f) => { let s = 0, n = 0; for (let v = 0; v < P.length / 3; v++) if (f(P[v * 3], P[v * 3 + 1])) { s += walk[v * 3 + 2] - P[v * 3 + 2]; n++; } return s / n; };
  const lf = dz((x, y) => y < 0.1 && x > 0.03), rf = dz((x, y) => y < 0.1 && x < -0.03), hd = dz((x, y) => y > 1.65);
  if (!(lf > 0.15 && rf < -0.15 && Math.abs(hd) < 0.08)) fail(`${tag}: walk deforms wrongly (feet ${lf.toFixed(2)} ${rf.toFixed(2)}, head ${hd.toFixed(2)})`);
  for (let v = 0; v < W.length / 4; v++) {
    const s = W[v * 4] + W[v * 4 + 1] + W[v * 4 + 2] + W[v * 4 + 3];
    if (Math.abs(s - 1) > 1e-4) { fail(`${tag}: weights don't sum to 1`); break; }
  }
  const glb = Rig.exportRigged(model, skel, skin);
  const back = Rig.loadModel(glb);
  if (back.triangles !== model.triangles) fail(`${tag}: export lost triangles`);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + new DataView(glb.buffer).getUint32(12, true))));
  if (json.skins[0].joints.length !== B.length || json.animations.length !== Object.keys(Rig.CLIPS).length) fail(`${tag}: skin or clips missing`);
  // No tearing: in the biggest poses, no edge of the mesh stretches past 3.5x.
  for (const [clip, at] of [['Wave', 0.5], ['TPose', 0], ['Walk', 0.3]]) {
    const Q = pose(clip, at), I = model.prims[0].idx;
    let torn = 0;
    for (let f = 0; f < I.length; f += 3) for (const [a, b] of [[I[f], I[f + 1]], [I[f + 1], I[f + 2]], [I[f + 2], I[f]]]) {
      const r = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
      if (r > 1e-5 && Math.hypot(Q[a * 3] - Q[b * 3], Q[a * 3 + 1] - Q[b * 3 + 1], Q[a * 3 + 2] - Q[b * 3 + 2]) / r > 3.5) torn++;
    }
    if (torn) fail(`${tag}: ${clip} stretches ${torn} edges past 3.5x (tearing)`);
  }
}

// Arms hanging close to the body - the usual pose in photos - with hips wide
// enough to touch the hands. The arm bones must be found inside the arms, and
// raising the arms must not drag the hips along. (A real photo-made model once
// sprouted "wings" from its hips here.)
function skinPose(model, skel, skin, clip) {
  const { matrices } = Rig.poseMatrices(skel, clip, 0);
  const P = model.prims[0].attrs.POSITION.data, J = skin[0].joints, W = skin[0].weights, out = new Float32Array(P.length);
  for (let v = 0; v < P.length / 3; v++) for (let k = 0; k < 4; k++) {
    const w = W[v * 4 + k]; if (!w) continue;
    const q = Rig.xformPoint(matrices[J[v * 4 + k]], [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
    out[v * 3] += q[0] * w; out[v * 3 + 1] += q[1] * w; out[v * 3 + 2] += q[2] * w;
  }
  return out;
}
for (const [drop, widen, squeeze] of [[75, 1, 0], [82, 1, 0], [82, 1.35, 0], [75, 1.6, 0], [82, 1, 0.05]]) {
  const tag = `rig arms down ${drop}deg, hips x${widen}` + (squeeze ? ', thighs touching' : '');
  // Pose the figure's arms down with its own rig, then widen hips and thighs.
  const src = Rig.loadModel(MG.toGLB(MG.generate('figure', 1)), 'f');
  Rig.normalizeModel(src, { height: 1.8 });
  const s0 = Rig.fitHumanoid(src), w0 = Rig.computeWeights(src, s0);
  Rig.CLIPS.__check = { seconds: 1, pose: (p, c) => ({ LeftArm: { z: -(drop - c.dropL) }, RightArm: { z: drop - c.dropR } }) };
  const posed = skinPose(src, s0, w0, '__check');
  // Which vertices are arm: decided on the original figure, where the arms
  // stand clear of the body. (Posing and widening keep the vertex order.)
  const isArm = Array.from({ length: posed.length / 3 }, (_, v) => /Arm|Hand|Shoulder/.test(s0.bones[w0[0].joints[v * 4]].name));
  delete Rig.CLIPS.__check;
  for (let v = 0; v < posed.length; v += 3) {
    const y = posed[v + 1];
    if (Math.abs(posed[v]) < 0.17 && y < 1.0 && y > 0.35) posed[v] *= 1 + (widen - 1) * Math.sin(Math.PI * (y - 0.35) / 0.65);
    // Thighs pressed together (hands hang beside them at the same height).
    if (squeeze && !isArm[v / 3] && y > 0.45 && y < 0.95) posed[v] -= Math.sign(posed[v]) * squeeze * Math.sin(Math.PI * (y - 0.45) / 0.5);
  }
  src.prims[0].attrs.POSITION.data.set(posed);
  delete src.prims[0].attrs.NORMAL; // Stale after posing: let the loader recompute them.
  const model = Rig.loadModel(Rig.exportRigged(src, null, null), 'down');
  Rig.normalizeModel(model, {});
  const skel = Rig.fitHumanoid(model), skin = Rig.computeWeights(model, skel);
  const bone = (n) => skel.bones.find((b) => b.name === n).pos;
  // Where each arm really is: the figure's shoulder, swung down by `drop`.
  const r = (drop * Math.PI) / 180;
  for (const [S, side] of [['Left', 1], ['Right', -1]]) {
    const sh = bone(S + 'Arm');
    for (const [name, along] of [[S + 'ForeArm', 0.17], [S + 'Hand', 0.32]]) {
      const want = [sh[0] + side * Math.cos(r) * along * 1.8, sh[1] - Math.sin(r) * along * 1.8];
      const got = bone(name);
      if (Math.hypot(got[0] - want[0], got[1] - want[1]) > 0.06) fail(`${tag}: ${name} at ${got.slice(0, 2).map((x) => x.toFixed(2))}, arm is at ${want.map((x) => x.toFixed(2))}`);
    }
    if (Math.abs(sh[1] - 1.44) > 0.05) fail(`${tag}: ${S} shoulder at height ${sh[1].toFixed(2)}, not ~1.44`);
    if (Math.abs(Math.abs(sh[0]) - 0.19) > 0.04) fail(`${tag}: ${S} shoulder ${sh[0].toFixed(2)} from the centre, not ~0.19`);
  }
  // Every vertex below the shoulders that isn't arm must stay put when the
  // arms go up - except hip that the widening pushed right into a hand (within
  // 5 cm of the arm's line), which no rig can tell apart from the hand.
  const armLine = ['Left', 'Right'].map((S) => ['Arm', 'ForeArm', 'Hand', 'Hand_End'].map((n) => bone(S + n)));
  const segD = (p, a, b) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = Math.max(0, Math.min(1, (ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
    return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
  };
  // 5 cm is the arm itself; the next 5 cm is skin blended to stretch with it
  // (weight smoothing), which should move a little rather than tear.
  const inArm = (p) => armLine.some((l) => Math.min(segD(p, l[0], l[1]), segD(p, l[1], l[2]), segD(p, l[2], l[3])) < 0.1);
  const P = model.prims[0].attrs.POSITION.data, t = skinPose(model, skel, skin, 'TPose');
  let dragged = 0;
  for (let v = 0; v < P.length / 3; v++) {
    const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
    if (p[1] < 1.25 && !isArm[v] && !inArm(p) && Math.hypot(t[v * 3] - p[0], t[v * 3 + 1] - p[1], t[v * 3 + 2] - p[2]) > 0.03) dragged++;
  }
  if (dragged > 12) fail(`${tag}: T-pose drags ${dragged} body vertices along with the arms`);
  // Hip joints sit above the knees, inside the body - not out by the hands.
  for (const S of ['Left', 'Right']) {
    const hip = bone(S + 'UpLeg'), knee = bone(S + 'Leg');
    if (Math.abs(hip[0] - knee[0]) > 0.06 || Math.abs(hip[0]) > 0.16) fail(`${tag}: ${S}UpLeg at x ${hip[0].toFixed(2)}, knee at ${knee[0].toFixed(2)}`);
  }
}

console.log(`${models} models, ${tris} triangles, ${Date.now() - t0} ms`);
if (fails.length) { console.error(`${fails.length} failures`); process.exit(1); }
console.log('ok');
