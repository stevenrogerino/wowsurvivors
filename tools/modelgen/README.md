# ModelGen

Seeded, procedural **low-poly 3D models for games**. No dependencies and no
build step. It runs in Node and in the browser, and writes **glTF binary
(`.glb`)** and **Wavefront `.obj` + `.mtl`**.

Each model depends only on its type, seed and detail level. `rock` seed `1234`
comes out identical on every machine, so a level file can store the seed and
you can regenerate the asset whenever you need it.

| Type | What you get |
|---|---|
| `tree` | Broadleaf tree with a bent trunk and a crown of noisy foliage. Seasons: summer, spring, autumn, deep, blossom |
| `pine` | Conifer made of stacked ragged cones, sometimes snow-capped |
| `rock` | A boulder or a small cluster with a flat bottom and optional moss |
| `crystal` | Hexagonal crystal shards on a stone base, in six colourways |
| `crate` | Plank crate with a timber frame and optional cross-braces |
| `barrel` | Stave barrel with iron hoops and a recessed lid |
| `chest` | Treasure chest with a rounded lid, gold or iron bands and a lock |
| `sword` | Straight, leaf or tapered blade with a guard, grip and pommel (sometimes a gem) |
| `axe` | Single- or double-bit hand axe |
| `potion` | Round flask, vial or cone bottle, part-filled, with a cork |
| `mushroom` | Toadstool or a small group, with spotted caps |
| `house` | Cottage with a stone footing, timber frame, gabled roof, door, windows and chimney |
| `fence` | Modular fence section that tiles along X |
| `figure` | Humanoid mannequin in an A-pose: a stand-in character and a test for rigging |

## Browse: the viewer

Open `tools/modelgen/viewer.html` in a browser. It works straight from disk and
needs no server.

- Choose a type, then use **‹ ›** or the arrow keys to step through seeds. **R** picks a random seed.
- Drag to orbit and scroll to zoom. Each grid square is 1 m.
- The **Detail** slider adjusts polygon count (0.5× for a distant LOD, 2× for a hero prop).
- **Download .glb** or **.obj + .mtl** saves the model you're looking at.
- You can link straight to a model: `viewer.html?type=chest&seed=42`

## Batch: the command line

```
node tools/modelgen/cli.js --list
node tools/modelgen/cli.js tree                                   # models/tree-1.glb
node tools/modelgen/cli.js rock --seed 100 --count 20             # rock-100 .. rock-119
node tools/modelgen/cli.js all --count 5 --format both --out assets/models
node tools/modelgen/cli.js house --seed "village inn" --detail 2  # text seeds work too
```

Options: `--seed`, `--count`, `--format glb|obj|both`, `--detail 0.5..2`, `--out <dir>`.

## Conventions

These defaults are chosen so the files import without adjustments:

- **Units:** metres. **+Y is up**, and the front of a directional model faces **+Z**.
- **Pivot:** props and scenery have their pivot at the bottom centre, so they
  sit on the ground where you place them. Weapons have their pivot at the hand
  position, with the blade or haft along +Y, ready to attach to a hand socket.
- **Shading:** flat-shaded triangles with per-vertex colour. There are no
  textures or UVs, and each model uses one material.
- **Budget:** about 80–600 triangles at detail 1.

## Importing

| Engine | How |
|---|---|
| **Godot 4** | Drop the `.glb` into the project. Vertex colours work out of the box. |
| **Blender** | File › Import › glTF 2.0. Vertex colours arrive as the `Color` attribute. |
| **Unreal 5** | Drag the `.glb` into the Content Browser (Interchange). In the material, multiply by **Vertex Color**. |
| **Unity** | Install [glTFast](https://github.com/atteneder/glTFast) (`com.unity.cloud.gltfast`) and drop in the `.glb`. With URP/HDRP, use a shader that reads vertex colour. |

The `.obj` export assigns one material per part (bark, leaves, trim and so on),
with each part's colour written as `Kd`. It also writes per-vertex colours in
the `v x y z r g b` form, which Blender and MeshLab read.

## Adding your own model type

`modelgen.js` exports its building blocks: `box`, `cylinder`, `lathe` (spin a
profile around Y), `icosphere`, `blob` (a noise-displaced sphere), `extrude`
(push a 2D outline along Z) and `arc`. Each returns a `Part` with chainable
`translate / rotateX|Y|Z / scale / paint / paintBy / tint / add`.

```js
const MG = require('./modelgen');
MG.register('lamppost', 'Iron lamppost with a glowing head.', (r, detail) => {
  const pole = MG.cylinder(0.06, 0.04, 3, 8).paint(MG.hex('#2b2d31'), 'iron');
  const lamp = MG.box(0.3, 0.4, 0.3).translate(0, 3.2, 0).paint(MG.hex('#ffd98a'), 'glow');
  return new MG.Part().add(pole, lamp);
});
```

`r` is the seeded random source, with `r()`, `r.range(a, b)`, `r.int(a, b)`,
`r.pick(list)` and `r.chance(p)`. Take every random choice from `r` so the
model stays reproducible.

## Rigging: the Rigger

`rigger.html` adds a skeleton to a model so it can be animated. It works on a
ModelGen figure, a model from `tools/make3d`, or any other `.glb`, and keeps
the model's textures.

1. Open `tools/modelgen/rigger.html` and load a `.glb`, either by dropping it
   on the page or with **Open .glb**.
2. **Prepare:** if the **Front** view doesn't show the face, turn the model.
   Then set its height in metres.
3. **Skeleton:** the skeleton is fitted automatically. Drag any dot in the
   Front or Side view to move that joint. Shift-drag moves the joint together
   with everything below it.
4. **Weights:** click **Compute weights**. To check them, tick the heat-map
   option and click a joint, or play the **Flex** animation.
5. **Export:** click **Download rigged .glb**.

Bones use Mixamo names (Hips, Spine, LeftArm and so on), so Unity Humanoid,
Unreal's IK Retargeter and Godot's bone map recognise them, and each engine's
own animation libraries can be retargeted onto the model. The file includes
Idle, Walk, Wave, Flex and TPose clips.

From the command line:

```
node tools/modelgen/rig-cli.js knight.glb --height 1.8          # -> knight_rigged.glb
node tools/modelgen/rig-cli.js crate.glb --no-rig --height 0.9  # size and ground only
```

The model should stand upright in an A- or T-pose. Skin weights come from
distances measured through the inside of the body, which keeps the legs from
pulling on each other and the arms from pulling on the chest.

## Checking it

```
node tools/modelgen/check.js
```

The check builds every type at 60 seeds and three detail levels. It verifies
that the output is deterministic and that the GLB structure is valid
(chunks, accessor bounds, index range, unit normals). It also confirms that
props sit on the ground, that sizes are plausible, that OBJ references
resolve, and that primitive winding is correct, using signed volume against
each primitive's analytic volume. The GLB files were also run through the
Khronos glTF Validator with no errors or warnings.
