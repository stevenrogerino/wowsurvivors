# make3d: picture in, game-ready 3D model out

make3d turns a picture of a character or prop into a textured 3D model you
can drop into Unity, Unreal, Godot or Blender. Characters also get a skeleton
and a few animations.

Everything runs on your own PC. Nothing is uploaded, and after setup it works
with the internet switched off.

```
make3d.bat knight.png      →  output\knight\knight.glb   (1.8 m tall, rigged, animated)
```

## What you need

- Windows 10 or 11
- An NVIDIA graphics card with 8 GB or more (16 GB recommended). RTX 20-series
  or newer works, RTX 50-series included.
- About 35 GB of free disk space: roughly 15 GB for the AI models and 10 GB for
  the tools the texture step needs
- An internet connection for setup only

## Install (once)

1. Double-click **`setup.bat`** in this folder.
2. Wait. The first run takes 30–60 minutes, most of it downloading. It
   installs everything into `%LOCALAPPDATA%\make3d`, plus NVIDIA's CUDA Toolkit
   and Microsoft's C++ Build Tools, which the texture step needs.
3. At the end it runs a check. Every line should say `[ok]`.

If setup stops, it says why in red. Fix that and run `setup.bat` again; it
skips whatever has already finished. The full log is
`%LOCALAPPDATA%\make3d\setup.log`.

## Make a model

The easiest way is to **drag your picture onto `make3d.bat`**.

Or type it in a Command Prompt, from this folder:

```
make3d.bat knight.png
make3d.bat knight.png --back knight_back.png --left knight_left.png
make3d.bat barrel.png --rig none --height 1.1
```

A character takes a few minutes on an RTX 5080. Results go to
`output\<name>\`:

| File | What it is |
|---|---|
| `knight.glb` | **The finished model.** Put this in your game. |
| `knight_raw.glb` | The AI's model before resizing and rigging |
| `knight_shape.glb` | The shape before painting, useful when the texture goes wrong |
| `knight.json` | How it was made: which AI model, the settings, the licence |
| `inputs\` | Your pictures after background removal |
| `make3d.log` | Everything it printed |

To check the result, open `tools\modelgen\rigger.html` and load `knight.glb`.
Play **Flex** to watch each joint bend. If a joint bends in the wrong place,
drag its dot in the Front or Side view and download it again.

## Getting good results

The picture matters more than any setting.

- **Pose:** have the character stand straight, facing you, with the arms
  held **30–45° out from the body, with a clear gap under the armpits** (an
  A-pose) and a little space between the hands and the thighs. This matters
  most of all. When the arms touch the sides, the AI fuses them to the body,
  and raising them later stretches the skin in between into webbing, however
  well it is rigged. Crossed arms don't work at all.
- **Whole body in frame**, not cropped, on a plain background. A
  transparent PNG is best, because it skips background removal.
- **One character per picture.**
- **Several views help most.** Add `--back`, `--left` and `--right` pictures of
  the same character in the same pose. With one picture, the AI has to guess
  the back.
- For props, use `--rig none` and set the real size with `--height`.

## Options

| Option | What it does |
|---|---|
| `--back`, `--left`, `--right` | Extra views (the character's own left and right) |
| `--quality draft\|standard\|high` | `draft` is fastest; `high` gives the most detail |
| `--faces 40000` | Triangle limit. Lower it for mobile or background characters. |
| `--rig humanoid\|none` | Add a skeleton for characters; use `none` for props |
| `--height 1.8` | Size in metres |
| `--no-texture` | Shape only, faster |
| `--no-photo` | Keep the AI's painted texture as it is, without laying your picture over it |
| `--turn 180` | Turn it by hand if it faces the wrong way (normally detected) |
| `--seed 7` | Try a different seed if you don't like a result; the same seed always gives the same model |
| `--model hunyuan-mini` | A faster, lighter model (download it first: `setup.bat -Models hunyuan-mini`) |
| `--low-vram` | For cards under 12 GB: slower but uses less memory |
| `--doctor` | Checks the installation and says how to fix any problem |

## Licence: read this before you sell anything

The AI model, **Tencent Hunyuan3D-2**, is free for commercial use for
products with under 1 million monthly users. However, its licence **does not
apply in the EU, the UK or South Korea**, and it forbids using or distributing
its output there. A game on Steam is sold in those places. Every model
make3d produces records the AI model that made it, both in `knight.json` and
inside the `.glb`, so you can always check. Microsoft's TRELLIS, which is coming
next, uses the MIT licence, which has no such limits.

## If something goes wrong

1. Run `make3d.bat --doctor`. It checks each part and says what to do.
2. Look at `make3d.log` in the output folder, or `setup.log` for setup.
3. Paste the red error, or the end of the log, to Claude.

## How it works

1. **Background removal** (rembg), unless the picture is already transparent.
2. **Shape:** Hunyuan3D-2 builds the 3D shape from your picture or pictures.
3. **Clean-up:** removes stray floating bits and cuts the triangle count to
   `--faces`.
4. **Texture:** Hunyuan3D-Paint paints it to match your picture.
5. **Facing:** compares the model from four sides with your picture to work
   out which way is forward. It uses the outline, then the colours, then the
   feet. See `orient.py`.
6. **Your picture, painted on:** the AI painter works from a few
   low-resolution views, so on a full body the face comes out soft. Wherever
   the model faces the camera, make3d copies your picture's own pixels onto it
   and fades back to the AI's paint as the surface turns away. The texture is
   enlarged to 4096 × 4096 to hold the detail. Back, left and right pictures
   are used the same way. See `project.py`.
7. **Game-ready:** scales it to size, stands it on the ground facing +Z, fits
   a skeleton with standard bone names, weights it and adds animations. This
   step runs `tools/modelgen/rig-cli.js`, the same code as the Rigger page.

`python tools/make3d/test_make3d.py` runs the whole pipeline with a stand-in
for the AI, so it works on any computer, with no GPU needed.
`python tools/make3d/test_project.py` checks the picture painting. It blurs a
detailed model's texture, then requires projection from a sharp picture to
bring the front back.
