#!/usr/bin/env node
/* ModelGen command line: writes seeded low-poly models to disk.
 *
 *   node tools/modelgen/cli.js --list
 *   node tools/modelgen/cli.js tree                        # tree-1.glb
 *   node tools/modelgen/cli.js rock --seed 99 --count 10   # rock-99.glb .. rock-108.glb
 *   node tools/modelgen/cli.js all --count 3 --format both --out assets/models
 *   node tools/modelgen/cli.js house --seed village-inn --detail 2
 *
 * Open tools/modelgen/viewer.html to browse seeds before committing to one.
 */
const fs = require('fs');
const path = require('path');
const MG = require('./modelgen');

function usage(code) {
  console.log(`usage: node tools/modelgen/cli.js <type|all> [options]

  --seed <n|text>   first seed (default 1); text seeds are hashed
  --count <n>       how many consecutive seeds (default 1; numeric seeds only)
  --format <f>      glb | obj | both (default glb)
  --detail <x>      0.5 low LOD, 1 default, 2 high (default 1)
  --out <dir>       output directory (default ./models)
  --list            list model types`);
  process.exit(code);
}

const args = process.argv.slice(2);
const opt = { seed: '1', count: 1, format: 'glb', detail: 1, out: 'models' };
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--help' || a === '-h') usage(0);
  else if (a === '--list') {
    for (const t of MG.types()) console.log(`  ${t.padEnd(10)} ${MG.describe(t)}`);
    process.exit(0);
  } else if (a.startsWith('--')) {
    const key = a.slice(2), val = args[++i];
    if (!(key in opt) || val === undefined) usage(1);
    opt[key] = key === 'count' || key === 'detail' ? Number(val) : val;
  } else positional.push(a);
}
if (positional.length !== 1) usage(1);
if (!['glb', 'obj', 'both'].includes(opt.format)) usage(1);

const types = positional[0] === 'all' ? MG.types() : [positional[0]];
const numeric = /^\d+$/.test(opt.seed);
if (!numeric && opt.count > 1) { console.error('--count needs a numeric --seed'); process.exit(1); }

fs.mkdirSync(opt.out, { recursive: true });
for (const type of types) {
  for (let k = 0; k < opt.count; k++) {
    const seed = numeric ? Number(opt.seed) + k : opt.seed;
    let model;
    try { model = MG.generate(type, seed, { detail: opt.detail }); } catch (e) { console.error(e.message); process.exit(1); }
    const base = path.join(opt.out, `${type}-${String(seed).replace(/[^\w.-]+/g, '_')}`);
    const written = [];
    if (opt.format !== 'obj') { fs.writeFileSync(base + '.glb', MG.toGLB(model)); written.push(base + '.glb'); }
    if (opt.format !== 'glb') {
      const { obj, mtl } = MG.toOBJ(model);
      fs.writeFileSync(base + '.obj', obj.replace(`mtllib ${model.name}.mtl`, `mtllib ${path.basename(base)}.mtl`));
      fs.writeFileSync(base + '.mtl', mtl);
      written.push(base + '.obj');
    }
    const s = model.bounds.max.map((v, i) => (v - model.bounds.min[i]).toFixed(2)).join(' x ');
    console.log(`${written.join(', ')}  ${model.triangles} tris  ${s} m`);
  }
}
