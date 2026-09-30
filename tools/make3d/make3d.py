#!/usr/bin/env python3
"""make3d: turn a picture of a character or prop into a game-ready 3D model.

    make3d knight.png                              one picture -> rigged knight.glb
    make3d knight.png --back k_back.png --left k_left.png   several views, better shape
    make3d barrel.png --rig none --height 1.1      a prop: no skeleton, 1.1 m tall
    make3d --doctor                                check the install

Everything runs on this PC; after setup nothing goes online. The result is a
.glb in metres, standing on the ground, facing +Z, with (for characters) a
Mixamo-named skeleton and a few animations - ready for Unity, Unreal, Godot
and Blender. Beside it: the untouched AI mesh, the cleaned-up input pictures,
and a .json saying which AI model made it and how (its licence matters).
"""
import argparse
import datetime
import json
import os
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELGEN = HERE.parent / 'modelgen'
sys.path.insert(0, str(HERE))

import backends  # noqa: E402

QUALITY = {
    # Diffusion steps, marching-cubes grid resolution, points decoded per batch.
    'draft': dict(steps=20, octree=256, chunks=8000),
    'standard': dict(steps=30, octree=380, chunks=20000),
    'high': dict(steps=50, octree=512, chunks=40000),
}


class Log:
    """Prints to the console and to a log file next to the output."""

    def __init__(self):
        self.file = None
        self.t0 = time.time()

    def open(self, path):
        self.file = open(path, 'a', encoding='utf-8')
        self.file.write(f'\n==== {datetime.datetime.now().isoformat(timespec="seconds")} {" ".join(sys.argv)}\n')

    def __call__(self, msg=''):
        print(msg, flush=True)
        if self.file:
            self.file.write(msg + '\n')
            self.file.flush()

    def step(self, n, total, msg):
        self(f'\n[{n}/{total}] {msg}   ({time.time() - self.t0:.0f}s)')


# Where setup.ps1 installs things on Windows (a short path, outside the repo).
INSTALL = Path(os.environ.get('LOCALAPPDATA', Path.home() / '.local' / 'share')) / 'make3d'


def find_node():
    local = INSTALL / 'vendor' / 'node' / ('node.exe' if os.name == 'nt' else 'bin/node')
    if local.exists():
        return str(local)
    return shutil.which('node')


def set_glb_extras(path, extras):
    """Writes `extras` into a GLB's asset block, keeping everything else."""
    data = bytearray(Path(path).read_bytes())
    jlen = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + jlen])
    doc.setdefault('asset', {}).setdefault('extras', {}).update(extras)
    js = json.dumps(doc, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    rest = data[20 + jlen:]
    out = bytearray(struct.pack('<III', 0x46546C67, 2, 20 + len(js) + len(rest)))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + rest
    Path(path).write_bytes(bytes(out))


def has_transparency(img):
    if img.mode not in ('RGBA', 'LA') and not (img.mode == 'P' and 'transparency' in img.info):
        return False
    alpha = img.convert('RGBA').getchannel('A')
    lo, hi = alpha.getextrema()
    return lo < 250


def load_images(args, log):
    from PIL import Image
    views = {'front': args.image, 'left': args.left, 'back': args.back, 'right': args.right}
    out = {}
    for view, path in views.items():
        if not path:
            continue
        p = Path(path)
        if not p.exists():
            raise SystemExit(f'Picture not found: {p}')
        out[view] = Image.open(p)
        out[view].load()
        log(f'  {view:5s} {p.name}  {out[view].size[0]}x{out[view].size[1]}')
    return out


def run(args, log):
    from PIL import Image  # noqa: F401  (fail early if the environment is broken)
    name = args.name or Path(args.image).stem
    out_dir = Path(args.out) / name
    (out_dir / 'inputs').mkdir(parents=True, exist_ok=True)
    log.open(out_dir / 'make3d.log')
    total = 7
    multiview = any([args.left, args.back, args.right])
    model_name = args.model
    if multiview and model_name == 'hunyuan':
        model_name = 'hunyuan-mv'
        log('Several views given: using Hunyuan3D-2mv.')
    if multiview and model_name != 'hunyuan-mv':
        raise SystemExit(f'{model_name} takes one picture; use --model hunyuan-mv for several views.')

    log.step(1, total, 'Reading pictures')
    images = load_images(args, log)

    log.step(2, total, 'Removing backgrounds')
    backend = backends.create(model_name, log=log, low_vram=args.low_vram)
    for view, img in images.items():
        if has_transparency(img):
            log(f'  {view}: already transparent, kept as is')
            images[view] = img.convert('RGBA')
        else:
            images[view] = backend.remove_background(img)
            log(f'  {view}: background removed')
        images[view].save(out_dir / 'inputs' / f'{view}.png')

    q = QUALITY[args.quality]
    log.step(3, total, f'Building the shape with {backend.label} ({args.quality}: {q["steps"]} steps, grid {q["octree"]})')
    mesh = backend.shape(images, q['steps'], q['octree'], q['chunks'], args.seed)
    log(f'  raw mesh: {len(mesh.faces):,} triangles')
    mesh = backend.cleanup(mesh, args.faces)
    log(f'  cleaned: {len(mesh.faces):,} triangles (limit {args.faces:,})')
    mesh.export(out_dir / f'{name}_shape.glb')

    textured = False
    log.step(4, total, 'Painting the texture')
    if args.no_texture:
        log('  skipped (--no-texture)')
    else:
        try:
            mesh = backend.texture(mesh, images)
            textured = True
            log('  done')
        except backends.TextureUnavailable as e:
            log(f'  skipped: {e}')
            log('  The model is still made, untextured.')

    log.step(5, total, 'Working out which way it faces')
    if args.turn == 'auto':
        import orient
        turn = orient.detect_turn(mesh, images['front'], log=log)
    else:
        turn = int(args.turn)
        log(f'  turn {turn} degrees (from --turn)')
    photo_texels = 0
    log.step(6, total, 'Painting your picture(s) onto the model for full detail')
    if not textured:
        log('  skipped (no texture to paint onto)')
    elif args.no_photo:
        log('  skipped (--no-photo)')
    else:
        import project
        t_proj = time.time()
        photo_texels = project.project(mesh, images, turn, log=log)
        log(f'  {photo_texels:,} texels from your picture(s) ({time.time() - t_proj:.0f}s)' if photo_texels else '  nothing painted; the AI texture is kept')

    raw = out_dir / f'{name}_raw.glb'
    mesh.export(raw)
    provenance = {
        'make3d': {
            'model': backend.label,
            'modelRepo': getattr(backend, 'repo', ''),
            'license': backend.license,
            'inputs': {v: Path(p).name for v, p in (('front', args.image), ('left', args.left), ('back', args.back), ('right', args.right)) if p},
            'quality': args.quality, 'seed': args.seed, 'faces': args.faces, 'textured': textured, 'photoTexels': photo_texels, 'turn': turn,
            'created': datetime.datetime.now().isoformat(timespec='seconds'),
        }
    }
    set_glb_extras(raw, provenance)

    log.step(7, total, 'Game-ready: size, ground, facing' + (', skeleton and animations' if args.rig == 'humanoid' else ''))
    node = find_node()
    if not node:
        raise SystemExit('Node.js not found; run setup.bat again (it installs a private copy).')
    final = out_dir / f'{name}.glb'
    height = args.height if args.height else (1.8 if args.rig == 'humanoid' else None)
    cmd = [node, str(MODELGEN / 'rig-cli.js'), str(raw), str(final), '--turn', str(turn)]
    if height:
        cmd += ['--height', str(height)]
    if args.rig == 'none':
        cmd.append('--no-rig')
    res = subprocess.run(cmd, capture_output=True, text=True)
    log(res.stdout.strip())
    if res.returncode:
        log(res.stderr.strip())
        raise SystemExit('The game-ready step failed; the AI mesh is saved as ' + str(raw))

    provenance['make3d'].update(height=height, rig=args.rig, seconds=round(time.time() - log.t0))
    (out_dir / f'{name}.json').write_text(json.dumps(provenance, indent=2))
    log(f'\nDone in {time.time() - log.t0:.0f}s: {final}')
    log('Check it: open tools/modelgen/rigger.html and load it. Play "Flex" to check the joints bend well.')
    if backend.license == backends.HUNYUAN_LICENSE:
        log('Licence: made with Hunyuan3D - not licensed for use or distribution in the EU, UK or South Korea.')
    return final


def doctor(log):
    """Checks every piece the pipeline needs and says how to fix what's missing."""
    ok = True

    def check(label, fn, fix, optional=False):
        nonlocal ok
        try:
            detail = fn()
            log(f'  [ok]   {label}' + (f': {detail}' if detail else ''))
            return True
        except Exception as e:  # noqa: BLE001 - reporting, not handling
            ok = ok and optional
            log(f'  [{"--" if optional else "FAIL"}]   {label}: {e}' if optional else f'  [FAIL] {label}: {e}')
            log(f'         fix: {fix}')
            return False

    log('make3d doctor\n')
    check('Python 3.10+', lambda: (sys.version.split()[0] if sys.version_info >= (3, 10) else (_ for _ in ()).throw(RuntimeError(sys.version))),
          'run setup.bat (it installs its own Python)')

    def torch_gpu():
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError(f'PyTorch {torch.__version__} cannot see a CUDA GPU')
        name = torch.cuda.get_device_name(0)
        cap = torch.cuda.get_device_capability(0)
        arch = f'sm_{cap[0]}{cap[1]}'
        if arch not in torch.cuda.get_arch_list():
            raise RuntimeError(f'{name} ({arch}) is newer than this PyTorch build supports ({torch.version.cuda})')
        free, total = torch.cuda.mem_get_info()
        return f'{name}, {total / 2**30:.0f} GB, PyTorch {torch.__version__}'
    check('PyTorch with GPU', torch_gpu, 'update the NVIDIA driver, then run setup.bat again')
    check('Hunyuan3D code', lambda: __import__('hy3dgen.shapegen') and 'installed', 'run setup.bat')
    check('Background remover', lambda: __import__('rembg') and 'installed', 'run setup.bat')

    def models():
        from huggingface_hub import snapshot_download
        have = []
        for variant in backends.Hunyuan.VARIANTS:
            repo, sub, _ = backends.Hunyuan.VARIANTS[variant]
            try:
                snapshot_download(repo, allow_patterns=[f'{sub}/*'], local_files_only=True)
                have.append(variant)
            except Exception:  # noqa: BLE001
                pass
        if not have:
            raise RuntimeError('no shape models downloaded')
        return ', '.join(have)
    check('AI models on disk', models, 'run setup.bat (downloads them once)')
    check('Texture kernel (optional)', lambda: __import__('custom_rasterizer') and 'built',
          'run setup.bat again (it installs the NVIDIA CUDA Toolkit and C++ Build Tools, then builds it). '
          'Without it, models are made untextured.', optional=True)
    check('Node.js (for the game-ready step)', lambda: find_node() or (_ for _ in ()).throw(RuntimeError('not found')),
          'run setup.bat again')
    check('Rigger', lambda: (MODELGEN / 'rig-cli.js').exists() and 'found' or (_ for _ in ()).throw(RuntimeError('tools/modelgen/rig-cli.js missing')),
          'keep the tools/make3d and tools/modelgen folders side by side')
    log('\nAll good.' if ok else '\nSome checks failed; see the fixes above.')
    return ok


def main(argv=None):
    ap = argparse.ArgumentParser(prog='make3d', description='Picture(s) in, game-ready 3D model out.',
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__.split('\n\n')[1])
    ap.add_argument('image', nargs='?', help='front view picture (PNG/JPG); transparent background is best')
    ap.add_argument('--back', help='back view picture')
    ap.add_argument('--left', help="left view picture (the character's left side)")
    ap.add_argument('--right', help="right view picture (the character's right side)")
    ap.add_argument('--model', default='hunyuan', choices=sorted(backends.MODELS), help='AI model (default hunyuan)')
    ap.add_argument('--quality', default='standard', choices=list(QUALITY), help='draft is fastest, high is most detailed')
    ap.add_argument('--faces', type=int, default=40000, help='triangle limit (default 40000)')
    ap.add_argument('--no-texture', action='store_true', help='shape only, no painted texture (faster)')
    ap.add_argument('--no-photo', action='store_true', help="keep the AI's texture as painted; don't lay your picture(s) over it")
    ap.add_argument('--rig', default='humanoid', choices=['humanoid', 'none'], help="skeleton type; 'none' for props")
    ap.add_argument('--height', type=float, help='height in metres (default 1.8 for characters, unchanged for props)')
    ap.add_argument('--turn', default='auto', choices=['auto', '0', '90', '180', '270'], help='degrees to face it forward (default: detect)')
    ap.add_argument('--seed', type=int, default=1234, help='same seed + same picture = same model')
    ap.add_argument('--name', help='output name (default: the picture file name)')
    ap.add_argument('--out', default=str(HERE / 'output'), help='output folder')
    ap.add_argument('--low-vram', action='store_true', help='for GPUs under 12 GB: slower, uses less memory')
    ap.add_argument('--doctor', action='store_true', help='check the installation and exit')
    args = ap.parse_args(argv)
    log = Log()
    if args.doctor:
        return 0 if doctor(log) else 1
    if not args.image:
        ap.print_help()
        return 1
    try:
        run(args, log)
    except backends.ModelMissing as e:
        log(f'\nERROR: {e}')
        return 1
    except NotImplementedError as e:
        log(f'\n{e}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
