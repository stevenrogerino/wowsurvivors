#!/usr/bin/env python3
"""End-to-end test of make3d with a stand-in for the AI model.

Runs the real pipeline - pictures, background handling, cleanup, facing
detection, provenance, and the Node game-ready/rigging step - but the "AI"
returns ModelGen's test figure, turned away and one unit tall, the way real
image-to-3D models hand things back. Needs Python with numpy, pillow, trimesh
and Node; no GPU, no model downloads.

    python tools/make3d/test_make3d.py
"""
import json
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import backends  # noqa: E402
import make3d  # noqa: E402
import orient  # noqa: E402

MODELGEN = HERE.parent / 'modelgen'
failures = []


def expect(cond, what):
    print(('  ok    ' if cond else '  FAIL  ') + what)
    if not cond:
        failures.append(what)


def figure_mesh(tmp, seed=1):
    """ModelGen's figure as a textured trimesh (vertex colours baked to a texture)."""
    path = tmp / f'figure-{seed}.glb'
    subprocess.run(['node', str(MODELGEN / 'cli.js'), 'figure', '--seed', str(seed), '--out', str(tmp)], check=True, capture_output=True)
    b = path.read_bytes()
    jl = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jl])
    bin_ = b[28 + jl:]

    def acc(i, dt, n):
        a = j['accessors'][i]
        v = j['bufferViews'][a['bufferView']]
        return np.frombuffer(bin_, dt, a['count'] * n, v['byteOffset']).reshape(-1, n)
    pos, col = acc(0, np.float32, 3), acc(2, np.float32, 3)
    idx = acc(3, np.uint16 if j['accessors'][3]['componentType'] == 5123 else np.uint32, 1).reshape(-1, 3)
    srgb = np.where(col <= 0.0031308, col * 12.92, 1.055 * np.power(col, 1 / 2.4) - 0.055)
    m = trimesh.Trimesh(pos, idx, vertex_colors=(srgb * 255).astype(np.uint8), process=False)
    m.visual = m.visual.to_texture()
    return m


def front_picture(mesh, size=512):
    """A flat, unlit front view of the mesh on white: a stand-in for the user's drawing."""
    pts, fi, cols = trimesh.sample.sample_surface(mesh, 200000, sample_color=True, seed=1)
    nz = mesh.face_normals[fi][:, 2]
    keep = nz > 0
    pts, cols = pts[keep], np.asarray(cols)[keep][:, :3]
    h = pts[:, 1].max() - pts[:, 1].min()
    k = size * 0.85 / h
    u = ((pts[:, 0] - (pts[:, 0].min() + pts[:, 0].max()) / 2) * k + size / 2).astype(int)
    v = ((pts[:, 1].max() - pts[:, 1]) * k + size * 0.07).astype(int)
    img = np.full((size, size, 3), 255, np.uint8)
    order = np.argsort(pts[:, 2])
    img[np.clip(v[order], 0, size - 1), np.clip(u[order], 0, size - 1)] = cols[order]
    return Image.fromarray(img, 'RGB')


class FakeAI:
    """Behaves like backends.Hunyuan, without the GPU."""
    label = 'Stand-in model (test)'
    repo = 'test/fake'
    license = 'test only'

    def __init__(self, mesh):
        self.mesh = mesh
        self.calls = []

    def remove_background(self, img):
        self.calls.append('rembg')
        a = np.asarray(img.convert('RGB')).astype(int)
        alpha = ((255 - a).sum(-1) > 30).astype(np.uint8) * 255
        return Image.fromarray(np.dstack([a.astype(np.uint8), alpha]), 'RGBA')

    def shape(self, images, steps, octree, chunks, seed):
        self.calls.append(('shape', sorted(images), steps, octree))
        m = self.mesh.copy()
        m.apply_scale(1 / m.extents[1])  # about one unit tall
        m.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [0, 1, 0]))  # facing away
        return m

    def cleanup(self, mesh, max_faces):
        self.calls.append(('cleanup', max_faces))
        return mesh

    paint = False

    def texture(self, mesh, images):
        self.calls.append('texture')
        if not self.paint:
            raise backends.TextureUnavailable('kernel not built (test)')
        # Like the AI painter: a UV atlas and a flat, featureless texture.
        import xatlas
        vmap, idx, uvs = xatlas.parametrize(mesh.vertices, mesh.faces)
        m = trimesh.Trimesh(mesh.vertices[vmap], idx, process=False)
        m.visual = trimesh.visual.TextureVisuals(uv=uvs, material=trimesh.visual.material.PBRMaterial(
            baseColorTexture=Image.new('RGB', (1024, 1024), (128, 128, 128))))
        return m


def read_glb_json(path):
    b = Path(path).read_bytes()
    jl = struct.unpack_from('<I', b, 12)[0]
    return json.loads(b[20:20 + jl])


def main():
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        mesh = figure_mesh(tmp)
        pic = tmp / 'hero.png'
        front_picture(mesh).save(pic)
        fake = FakeAI(mesh)
        backends.create = lambda name, log=print, low_vram=False: fake

        print('character, one picture, auto facing:')
        rc = make3d.main([str(pic), '--out', str(tmp / 'out'), '--quality', 'draft', '--faces', '20000'])
        final = tmp / 'out' / 'hero' / 'hero.glb'
        expect(rc == 0 and final.exists(), 'pipeline finished and wrote hero.glb')
        expect(fake.calls[0] == 'rembg', 'background removed from an opaque picture')
        expect(fake.calls[1] == ('shape', ['front'], 20, 256), 'draft quality settings reached the model')
        expect(('cleanup', 20000) in fake.calls, 'triangle limit passed to cleanup')
        meta = json.loads((tmp / 'out' / 'hero' / 'hero.json').read_text())['make3d']
        expect(meta['turn'] == 180, f'detected the model faces away and turned it 180 (got {meta["turn"]})')
        expect(meta['textured'] is False, 'missing texture kernel reported, model still made')
        j = read_glb_json(final)
        pos = j['accessors'][j['meshes'][0]['primitives'][0]['attributes']['POSITION']]
        height = pos['max'][1] - pos['min'][1]
        expect(abs(height - 1.8) < 1e-3 and abs(pos['min'][1]) < 1e-4, f'1.8 m tall, standing on the ground (got {height:.3f})')
        expect(len(j.get('skins', [])) == 1 and len(j['skins'][0]['joints']) == 27, 'humanoid skeleton attached')
        expect({a['name'] for a in j.get('animations', [])} >= {'Idle', 'Walk'}, 'animations included')
        expect(j.get('extras', {}).get('make3d', {}).get('model') == 'Stand-in model (test)', 'provenance carried into the final model')
        for f in ('hero_raw.glb', 'hero_shape.glb', 'inputs/front.png', 'make3d.log'):
            expect((tmp / 'out' / 'hero' / f).exists(), f'kept {f}')
        # The turned, rigged model's nose should point along +Z.
        head_front = [n for n in j['nodes'] if n.get('name') == 'Head']
        expect(bool(head_front), 'bones named for engines (Head found)')

        print('prop, transparent picture, fixed turn, no rig:')
        rgba = fake.remove_background(Image.open(pic))
        rgba.save(tmp / 'crate.png')
        fake.calls.clear()
        rc = make3d.main([str(tmp / 'crate.png'), '--out', str(tmp / 'out'), '--rig', 'none', '--turn', '90', '--height', '0.9'])
        j = read_glb_json(tmp / 'out' / 'crate' / 'crate.glb')
        expect(rc == 0 and 'rembg' not in fake.calls, 'transparent picture kept as is')
        expect('skins' not in j and 'animations' not in j, 'no skeleton for --rig none')
        pos = j['accessors'][j['meshes'][0]['primitives'][0]['attributes']['POSITION']]
        expect(abs(pos['max'][1] - pos['min'][1] - 0.9) < 1e-3, 'prop scaled to 0.9 m')

        print('several views pick the multi-view model:')
        fake.calls.clear()
        make3d.backends.create = lambda name, log=print, low_vram=False: (fake.calls.append(('model', name)), fake)[1]
        rc = make3d.main([str(pic), '--back', str(pic), '--out', str(tmp / 'out'), '--name', 'mv', '--turn', '0'])
        expect(('model', 'hunyuan-mv') in fake.calls, 'front + back uses Hunyuan3D-2mv')
        expect(any(c[0] == 'shape' and c[1] == ['back', 'front'] for c in fake.calls if isinstance(c, tuple)), 'both views reach the model')

        print('textured model gets the picture painted on, all the way to the game file:')
        fake.calls.clear()
        fake.paint = True
        make3d.backends.create = lambda name, log=print, low_vram=False: fake
        rc = make3d.main([str(pic), '--out', str(tmp / 'out'), '--name', 'painted'])
        meta = json.loads((tmp / 'out' / 'painted' / 'painted.json').read_text())['make3d']
        expect(rc == 0 and meta['textured'] and meta['photoTexels'] > 100000, f"picture painted onto {meta.get('photoTexels', 0):,} texels")
        final = tmp / 'out' / 'painted' / 'painted.glb'
        b = final.read_bytes()
        j = read_glb_json(final)
        bv = j['bufferViews'][j['images'][0]['bufferView']]
        start = 28 + struct.unpack_from('<I', b, 12)[0]
        import io
        img = Image.open(io.BytesIO(b[start + bv.get('byteOffset', 0): start + bv.get('byteOffset', 0) + bv['byteLength']]))
        expect(img.size[0] >= 4096, f'final model carries the enlarged texture ({img.size[0]}px)')
        a = np.asarray(img.convert('RGB'), dtype=np.float32)
        painted = (np.abs(a - 128).max(axis=-1) > 12).mean()
        expect(painted > 0.02, f'{painted:.1%} of the texture now carries the picture, not flat grey')
        expect(len(j.get('skins', [])) == 1, 'and it is still rigged')
        rc = make3d.main([str(pic), '--out', str(tmp / 'out'), '--name', 'nophoto', '--no-photo'])
        meta = json.loads((tmp / 'out' / 'nophoto' / 'nophoto.json').read_text())['make3d']
        expect(rc == 0 and meta['photoTexels'] == 0, '--no-photo keeps the AI texture')
        fake.paint = False

        print('provenance helper keeps the file valid:')
        g = tmp / 'p.glb'
        mesh.export(g)
        make3d.set_glb_extras(g, {'x': {'y': 1}})
        back = trimesh.load(g, force='mesh')
        expect(read_glb_json(g)['asset']['extras']['x'] == {'y': 1} and len(back.faces) == len(mesh.faces), 'extras written, mesh intact')

    print('\n' + (f'{len(failures)} FAILED' if failures else 'all passed'))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
