#!/usr/bin/env node
/* Rigs a .glb from the command line with the automatic skeleton fit.
 *
 *   node tools/modelgen/rig-cli.js knight.glb                 # -> knight_rigged.glb
 *   node tools/modelgen/rig-cli.js knight.glb out.glb --res 140
 *   node tools/modelgen/rig-cli.js ai_mesh.glb --height 1.8 --turn 180
 *
 * --height scales to that many metres; --turn spins about Y (degrees) so the
 * face looks along +Z; --stand-up tips a Z-up model upright. The model is
 * always centred with its feet on the ground. --no-rig does only that (props).
 *
 * For anything that isn't a clean A- or T-pose, use rigger.html instead: it
 * shows the fitted skeleton and lets you drag joints before exporting.
 */
const fs = require('fs');
const path = require('path');
const Rig = require('./rig');

const args = process.argv.slice(2);
const pos = [];
let res = 110, rig = true;
const prep = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--res') res = Number(args[++i]);
  else if (args[i] === '--height') prep.height = Number(args[++i]);
  else if (args[i] === '--turn') prep.turn = Number(args[++i]);
  else if (args[i] === '--stand-up') prep.standUp = true;
  else if (args[i] === '--no-rig') rig = false;
  else if (args[i] === '-h' || args[i] === '--help') pos.length = 99;
  else pos.push(args[i]);
}
if (pos.length < 1 || pos.length > 2) {
  console.log('usage: node tools/modelgen/rig-cli.js <in.glb> [out.glb] [--height m] [--turn deg] [--stand-up] [--no-rig] [--res 110]');
  process.exit(pos.length > 2 ? 0 : 1);
}
const input = pos[0];
const output = pos[1] || input.replace(/\.(glb|gltf)$/i, '') + (rig ? '_rigged.glb' : '_ready.glb');
const t0 = Date.now();
const model = Rig.loadModel(fs.readFileSync(input), path.basename(input).replace(/\.\w+$/, ''));
for (const w of model.warnings) console.warn('warning: ' + w);
Rig.normalizeModel(model, prep);
const size = model.bounds.max.map((v, i) => (v - model.bounds.min[i]).toFixed(2)).join(' x ');
if (!rig) {
  fs.writeFileSync(output, Rig.exportRigged(model, null, null));
  console.log(`${output}  ${model.triangles} tris, ${size} m, no skeleton  (${Date.now() - t0} ms)`);
} else {
  const skel = Rig.fitHumanoid(model);
  const skin = Rig.computeWeights(model, skel, { resolution: res });
  fs.writeFileSync(output, Rig.exportRigged(model, skel, skin));
  console.log(`${output}  ${model.triangles} tris, ${size} m, ${skel.bones.length} bones, clips: ${Object.keys(Rig.CLIPS).join(', ')}  (${Date.now() - t0} ms)`);
}
