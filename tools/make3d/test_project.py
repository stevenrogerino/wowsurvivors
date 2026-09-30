#!/usr/bin/env python3
"""Tests the photo projection (project.py) without a GPU or the AI models.

A figure gets a detailed "true" texture (colour plus a fine checker). The
stand-in for the AI's paint is that texture heavily blurred. The "photo" is a
sharp front view rendered from the true texture. After projecting the photo
onto the blurred model - which, like real AI output, faces away and is one
unit tall - the front must be close to the truth again, the back untouched.

    python tools/make3d/test_project.py        (needs numpy, pillow, trimesh, xatlas, node)
"""
import sys
import tempfile
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import project  # noqa: E402
from test_make3d import figure_mesh  # noqa: E402

failures = []


def expect(cond, what):
    print(('  ok    ' if cond else '  FAIL  ') + what)
    if not cond:
        failures.append(what)


def texel_points(mesh, size):
    """3D position and normal of every covered texel (for baking and comparing)."""
    uv, faces = mesh.visual.uv, mesh.faces
    tri = np.stack([np.stack([uv[faces[:, k], 0] * size, (1 - uv[faces[:, k], 1]) * size], 1) for k in range(3)], 1)
    ty, tx, P, N = [], [], [], []
    for ids, b in project._cover(tri, step=0.7):
        f = faces[ids]
        tp = np.einsum('sk,tkc->tsc', b, tri[ids])
        ty.append(np.clip(tp[..., 1].astype(int), 0, size - 1).ravel())
        tx.append(np.clip(tp[..., 0].astype(int), 0, size - 1).ravel())
        P.append(np.einsum('sk,tkc->tsc', b, mesh.vertices[f]).reshape(-1, 3))
        N.append(np.einsum('sk,tkc->tsc', b, mesh.vertex_normals[f]).reshape(-1, 3))
    return np.concatenate(ty), np.concatenate(tx), np.concatenate(P), np.concatenate(N)


def render_front(mesh, tex, H=900):
    """Orthographic front view with a depth buffer, on a transparent background."""
    v = mesh.vertices
    k = H * 0.9 / (v[:, 1].max() - v[:, 1].min())
    W = int((v[:, 0].max() - v[:, 0].min()) * k + H * 0.1)
    sx = (v[:, 0] - (v[:, 0].min() + v[:, 0].max()) / 2) * k + W / 2
    sy = (v[:, 1].max() - v[:, 1]) * k + H * 0.05
    faces, uv, th = mesh.faces, mesh.visual.uv, tex.shape[0]
    tri = np.stack([np.stack([sx[faces[:, j]], sy[faces[:, j]]], 1) for j in range(3)], 1)
    zbuf = np.full((H, W), -np.inf)
    rgb = np.zeros((H, W, 3))
    # Two passes: nearest depth per pixel, then colour only from that surface.
    for colour_pass in (False, True):
        for ids, b in project._cover(tri, step=0.5):
            f = faces[ids]
            p = np.einsum('sk,tkc->tsc', b, tri[ids]).reshape(-1, 2)
            z = np.einsum('sk,tk->ts', b, v[f][..., 2]).ravel()
            x, y = np.clip(p[:, 0].astype(int), 0, W - 1), np.clip(p[:, 1].astype(int), 0, H - 1)
            if not colour_pass:
                np.maximum.at(zbuf, (y, x), z)
                continue
            front = z >= zbuf[y, x] - 1e-6
            t = np.einsum('sk,tkc->tsc', b, uv[f]).reshape(-1, 2)[front]
            rgb[y[front], x[front]] = tex[np.clip(((1 - t[:, 1]) * th).astype(int), 0, th - 1), np.clip((t[:, 0] * th).astype(int), 0, th - 1)]
    alpha = np.isfinite(zbuf)
    return Image.fromarray(np.dstack([(rgb * 255).astype(np.uint8), (alpha * 255).astype(np.uint8)]), 'RGBA')


def main():
    import xatlas
    with tempfile.TemporaryDirectory() as t:
        base = figure_mesh(Path(t))
    # A real UV atlas, as the AI painter makes.
    vmap, idx, uvs = xatlas.parametrize(base.vertices, base.faces)
    mesh = trimesh.Trimesh(base.vertices[vmap], idx, process=False)
    size = 1024
    ty, tx, P, N = texel_points(_with_uv(mesh, uvs), size)
    # True texture: skin/cloth tones by height, plus a fine 3 cm checker - detail a blur destroys.
    cells = (np.floor(P[:, 0] / 0.03) + np.floor(P[:, 1] / 0.03) + np.floor(P[:, 2] / 0.03)) % 2
    colour = np.stack([0.55 + 0.3 * np.sin(P[:, 1] * 5), 0.4 + 0.2 * np.cos(P[:, 1] * 7), 0.35 + 0.2 * np.sin(P[:, 0] * 9)], 1)
    true = np.full((size, size, 3), 0.5)
    true[ty, tx] = np.clip(colour * (0.7 + 0.3 * cells[:, None]), 0, 1)
    blurred = np.asarray(Image.fromarray((true * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(10)), dtype=np.float32) / 255
    truth_mesh = _with_uv(mesh, uvs, true)
    photo = render_front(truth_mesh, true)

    # The "AI output": blurred paint, one unit tall, facing away.
    ai = _with_uv(mesh, uvs, blurred)
    ai.apply_scale(1 / ai.extents[1])
    ai.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [0, 1, 0]))
    print('projecting the photo onto a blurred, turned-away model:')
    changed = project.project(ai, {'front': photo}, 180, log=lambda s: print(s))
    expect(changed > 0, f'painted {changed:,} texels')
    out = np.asarray(ai.visual.material.baseColorTexture.convert('RGB'), dtype=np.float32) / 255
    k = out.shape[0] // size
    out = out[::k, ::k]  # compare at the original texture size

    front = N[:, 2] > 0.85
    back = N[:, 2] < -0.5
    # Skip texels on surfaces hidden behind others from the front (arms over the body).
    err = lambda img, m: np.abs(img[ty[m], tx[m]] - true[ty[m], tx[m]]).mean()
    before, after = err(blurred, front), err(out, front)
    expect(after < before * 0.5, f'front detail restored: error {before:.3f} -> {after:.3f}')
    b0, b1 = err(blurred, back), err(out, back)
    expect(abs(b1 - b0) < 0.01, f'back untouched: error {b0:.3f} -> {b1:.3f}')
    expect(ai.visual.material.baseColorTexture.size[0] >= 4096, 'texture enlarged for the detail')

    print('head proportions a little off (as the AI gets them) - the head is lined up on its own:')
    vtx = np.asarray(mesh.vertices)
    top, hgt = vtx[:, 1].max(), vtx[:, 1].max() - vtx[:, 1].min()
    in_head = vtx[:, 1] > top - 0.13 * hgt
    centre = vtx[in_head].mean(axis=0)
    off = vtx.copy()
    off[in_head] = (vtx[in_head] - centre) * 1.06 + centre + [0, 0.015, 0]
    errs = {}
    for use_head in (False, True):
        m2 = _with_uv(trimesh.Trimesh(off, mesh.faces, process=False), uvs, blurred)
        project.project(m2, {'front': photo}, 0, log=(lambda s: print(s)) if use_head else (lambda s: None), head=use_head)
        o2 = np.asarray(m2.visual.material.baseColorTexture.convert('RGB'), dtype=np.float32)[::k, ::k] / 255
        face = front & (P[:, 1] > top - 0.13 * hgt)
        errs[use_head] = np.abs(o2[ty[face], tx[face]] - true[ty[face], tx[face]]).mean()
    expect(errs[True] < errs[False] * 0.75, f'face error {errs[False]:.3f} with the body fit alone -> {errs[True]:.3f} with the head lined up')

    print('a picture that does not match the model is refused:')
    wrong = Image.new('RGBA', photo.size)
    wrong.paste(Image.new('RGBA', (photo.size[0] // 3, photo.size[1] // 3), (255, 0, 0, 255)), (0, 0))
    ai2 = _with_uv(mesh, uvs, blurred)
    expect(project.project(ai2, {'front': wrong}, 0, log=lambda s: None) == 0, 'mismatched picture skipped')

    print('\n' + (f'{len(failures)} FAILED' if failures else 'all passed'))
    return 1 if failures else 0


def _with_uv(mesh, uvs, tex=None):
    img = Image.fromarray((np.clip(tex if tex is not None else np.full((8, 8, 3), 0.5), 0, 1) * 255).astype(np.uint8))
    m = trimesh.Trimesh(mesh.vertices.copy(), mesh.faces.copy(), process=False)
    m.visual = trimesh.visual.TextureVisuals(uv=uvs, material=trimesh.visual.material.PBRMaterial(baseColorTexture=img))
    return m


if __name__ == '__main__':
    sys.exit(main())
