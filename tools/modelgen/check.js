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
  chest: [0.6, 1.4], sword: [0.7, 1.4], axe: [0.5, 1.2], potion: [0.1, 0.45], mushroom: [0.2, 0.9], house: [3, 8], fence: [1, 5],
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

console.log(`${models} models, ${tris} triangles, ${Date.now() - t0} ms`);
if (fails.length) { console.error(`${fails.length} failures`); process.exit(1); }
console.log('ok');
