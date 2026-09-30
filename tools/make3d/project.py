"""Paints your own picture(s) onto the model, over the AI's texture.

The AI texture painter works from a few low-resolution views and blends them;
on a full-body model the face ends up soft and sometimes doubled. The picture
you gave has the real detail. So wherever the model faces the camera that took
a picture, its texture takes that picture's pixels, fading back to the AI's
paint where the surface turns away. The sides and back keep the AI's paint
unless you gave those views too.

How: the model is viewed straight on (orthographic) from each picture's
direction and lined up with the picture by its outline, found by searching
small changes of size and position. A depth buffer says which surface is in
front at each pixel, so a hand in front of the hip doesn't paint the hip.
Then every texel of the texture is visited through its triangle, and those
seen head-on take the picture's colour. Everything is numpy; no GPU needed.
"""
import numpy as np
from PIL import Image

# Camera for each view, in the model's forward-facing space (+Y up, facing +Z):
# (screen-right axis, depth axis towards the camera), as (index, sign) pairs.
VIEWS = {
    'front': ((0, 1), (2, 1)),    # camera at +Z: x to the right
    'back': ((0, -1), (2, -1)),   # camera at -Z: -x to the right
    'left': ((2, -1), (0, 1)),    # camera at +X, sees the character's left side
    'right': ((2, 1), (0, -1)),   # camera at -X, sees the character's right side
}


def _rot_y(p, degrees):
    a = np.radians(degrees)
    c, s = np.cos(a), np.sin(a)
    return np.stack([p[:, 0] * c + p[:, 2] * s, p[:, 1], -p[:, 0] * s + p[:, 2] * c], axis=1)


def _view_coords(points, view):
    (ui, us), (di, ds) = VIEWS[view]
    return points[:, ui] * us, points[:, 1], points[:, di] * ds


def _samples(n):
    """Barycentric sample grids, one per subdivision count, cached."""
    if n not in _samples.cache:
        i, j = np.meshgrid(np.arange(n + 1), np.arange(n + 1), indexing='ij')
        keep = i + j <= n
        _samples.cache[n] = np.stack([1 - (i[keep] + j[keep]) / n, i[keep] / n, j[keep] / n], axis=1)
    return _samples.cache[n]


_samples.cache = {}


def _cover(tri_px, step=0.5):
    """Points covering each triangle (given in pixel units) at `step` spacing.

    Yields (triangle indices, barycentric weights) in batches of equal
    subdivision, so every pixel a triangle touches gets at least one sample.
    """
    e = np.maximum.reduce([np.linalg.norm(tri_px[:, 1] - tri_px[:, 0], axis=1),
                           np.linalg.norm(tri_px[:, 2] - tri_px[:, 1], axis=1),
                           np.linalg.norm(tri_px[:, 0] - tri_px[:, 2], axis=1)])
    n = np.clip(np.ceil(e / step).astype(int), 1, 4096)
    for k in np.unique(n):
        idx = np.nonzero(n == k)[0]
        b = _samples(int(k))
        # Chunk so huge batches don't exhaust memory.
        per = max(1, 4_000_000 // len(b))
        for c in range(0, len(idx), per):
            yield idx[c:c + per], b


def _erode(mask, r):
    m = mask.copy()
    for _ in range(r):
        p = np.pad(m, 1)
        m = p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return m


def _raster_depth(u, v, d, faces, H, W, fit):
    """Nearest-surface depth per picture pixel (larger = nearer the camera)."""
    zbuf = np.full(H * W, -np.inf)
    su, sv = fit(u, v)
    tri = np.stack([np.stack([su[faces[:, k]], sv[faces[:, k]]], axis=1) for k in range(3)], axis=1)
    dz = d[faces]
    for ids, b in _cover(tri):
        px = np.einsum('sk,tkc->tsc', b, tri[ids])
        z = np.einsum('sk,tk->ts', b, dz[ids])
        x = np.clip(px[..., 0].astype(int), 0, W - 1)
        y = np.clip(px[..., 1].astype(int), 0, H - 1)
        np.maximum.at(zbuf, (y * W + x).ravel(), z.ravel())
    return zbuf.reshape(H, W)


def _silhouette(u, v, faces, H, W, fit):
    """Which picture pixels the model covers (no depth: plain assignment is far faster)."""
    out = np.zeros(H * W, dtype=bool)
    su, sv = fit(u, v)
    tri = np.stack([np.stack([su[faces[:, k]], sv[faces[:, k]]], axis=1) for k in range(3)], axis=1)
    for ids, b in _cover(tri, step=0.7):
        px = np.einsum('sk,tkc->tsc', b, tri[ids])
        x = np.clip(px[..., 0].astype(int), 0, W - 1)
        y = np.clip(px[..., 1].astype(int), 0, H - 1)
        out[(y * W + x).ravel()] = True
    return out.reshape(H, W)


def _align(u, v, faces, mask, log):
    """Scale and offset taking model (u, v) to picture pixels, matching outlines."""
    H, W = mask.shape
    ys, xs = np.nonzero(mask)
    img_h = ys.max() - ys.min() + 1
    img_cx, img_top = (xs.min() + xs.max()) / 2, ys.min()
    mod_h = v.max() - v.min()
    mod_cx, mod_top = (u.min() + u.max()) / 2, v.max()

    def make(k, dx, dy):
        s = img_h / mod_h * k
        return lambda uu, vv: ((uu - mod_cx) * s + img_cx + dx, (mod_top - vv) * s + img_top + dy)

    # Search at low resolution: silhouette overlap for small changes in size and position.
    q = max(1, H // 256)
    small = mask[::q, ::q]
    h, w = small.shape
    best, best_score = (1.0, 0.0, 0.0), -1.0
    for k in (0.96, 0.98, 1.0, 1.02, 1.04):
        for dx in np.linspace(-0.03, 0.03, 5) * img_h:
            for dy in np.linspace(-0.03, 0.03, 5) * img_h:
                f = make(k, dx, dy)
                sil = _silhouette(u, v, faces, h, w, lambda a, b_: tuple(t / q for t in f(a, b_)))
                score = (sil & small).sum() / max((sil | small).sum(), 1)
                if score > best_score:
                    best, best_score = (k, dx, dy), score
    log(f'    outline match {best_score:.2f} (size x{best[0]:.2f}, shift {best[1]:.0f},{best[2]:.0f} px)')
    return make(*best), best_score


def _refine_head(u, v, faces, mask, fit, log, band=0.15):
    """Lines the head up again on its own, on top of the whole-body fit.

    The AI never gets proportions exactly right, and an error too small to
    matter across the body is a lot on a face: eyes land on cheeks and the
    face looks doubled. So the head's own outline (top `band` of the height)
    gets a second, finer search, and the correction fades out down the neck.
    """
    H, W = mask.shape
    top, h_model = v.max(), v.max() - v.min()
    cut = top - band * h_model
    head_faces = faces[(v[faces] > cut).all(axis=1)]
    if len(head_faces) < 20:
        return fit
    su, sv = fit(u, v)
    sel = v > cut
    cx, cy = (su[sel].min() + su[sel].max()) / 2, (sv[sel].min() + sv[sel].max()) / 2
    y0 = int(max(0, sv[sel].min() - 0.05 * (sv[sel].max() - sv[sel].min())))
    y1 = int(min(H, sv[sel].max()))
    if y1 - y0 < 16:
        return fit
    q = max(1, (y1 - y0) // 200)
    band_mask = mask[y0:y1:q, ::q]
    head_px = sv[sel].max() - sv[sel].min()

    def moved(k, dx, dy):
        return lambda uu, vv: tuple(np.asarray(t) for t in (
            (fit(uu, vv)[0] - cx) * k + cx + dx, (fit(uu, vv)[1] - cy) * k + cy + dy))

    def score(f):
        g = lambda uu, vv: ((f(uu, vv)[0]) / q, (f(uu, vv)[1] - y0) / q)
        sil = _silhouette(u, v, head_faces, band_mask.shape[0], band_mask.shape[1], g)
        return (sil & band_mask).sum() / max((sil | band_mask).sum(), 1)

    base = score(fit)
    best, best_score = (1.0, 0.0, 0.0), base
    for k in np.linspace(0.9, 1.1, 7):
        for dx in np.linspace(-0.08, 0.08, 7) * head_px:
            for dy in np.linspace(-0.08, 0.08, 7) * head_px:
                sc = score(moved(k, dx, dy))
                if sc > best_score:
                    best, best_score = (k, dx, dy), sc
    if best_score < base + 0.01:
        log(f'    head already lines up ({base:.2f})')
        return fit
    log(f'    head lined up on its own: {base:.2f} -> {best_score:.2f} (size x{best[0]:.2f}, shift {best[1]:.0f},{best[2]:.0f} px)')
    head = moved(*best)
    fade = 0.04 * h_model

    def blended(uu, vv):
        a = np.clip((np.asarray(vv) - (cut - fade)) / fade, 0, 1)
        gu, gv = fit(uu, vv)
        hu, hv = head(uu, vv)
        return gu * (1 - a) + hu * a, gv * (1 - a) + hv * a
    return blended


def project(mesh, views, turn, log=print, max_texture=4096, min_match=0.75, head=True):
    """Paints `views` ({'front': RGBA image, ...}) onto a textured trimesh, in place.

    `turn` is the rotation (degrees about +Y) that makes the model face +Z.
    Returns the number of texels changed; 0 if nothing could be matched.
    """
    visual = mesh.visual
    material = getattr(visual, 'material', None)
    image = getattr(material, 'baseColorTexture', None) or getattr(material, 'image', None)
    if image is None or getattr(visual, 'uv', None) is None:
        log('    no texture to paint onto; skipped')
        return 0
    tex = np.asarray(image.convert('RGB'), dtype=np.float32) / 255.0
    th, tw = tex.shape[:2]
    if max(th, tw) < max_texture:
        # More room: on a full body the face gets only a few hundred texels.
        k = max_texture // max(th, tw)
        tex = np.asarray(Image.fromarray((tex * 255).astype(np.uint8)).resize((tw * k, th * k), Image.LANCZOS), dtype=np.float32) / 255.0
        th, tw = tex.shape[:2]
    faces = np.asarray(mesh.faces)
    pts = _rot_y(np.asarray(mesh.vertices, dtype=np.float64), turn)
    nrm = _rot_y(np.asarray(mesh.vertex_normals, dtype=np.float64), turn)
    uv = np.asarray(visual.uv, dtype=np.float64)
    # Texel positions of every triangle corner (glTF: v runs down the image).
    tri_uv = np.stack([uv[faces[:, k]] * [tw, 1] for k in range(3)], axis=1)
    tri_uv[..., 1] = (1 - np.stack([uv[faces[:, k], 1] for k in range(3)], axis=1)) * th

    best_w = np.zeros((th, tw), dtype=np.float32)
    best_c = np.zeros((th, tw, 3), dtype=np.float32)
    for view, img in views.items():
        a = np.asarray(img.convert('RGBA'), dtype=np.float32) / 255.0
        # Work at a sensible size: the depth buffer is per picture pixel.
        if a.shape[0] > 1600:
            k = 1600 / a.shape[0]
            a = np.asarray(img.convert('RGBA').resize((int(a.shape[1] * k), 1600), Image.LANCZOS), dtype=np.float32) / 255.0
        H, W = a.shape[:2]
        mask = a[..., 3] > 0.5
        if mask.sum() < 100:
            continue
        u, v, d = _view_coords(pts, view)
        _, _, nd = _view_coords(nrm, view)
        log(f'  {view} picture:')
        fit, score = _align(u, v, faces, mask, log)
        if score < min_match:
            log(f'    the model does not line up with this picture well enough ({score:.2f}); skipped')
            continue
        if head:
            fit = _refine_head(u, v, faces, mask, fit, log)
        zbuf = _raster_depth(u, v, d, faces, H, W, fit)
        pix = 1.0 / (H / (v.max() - v.min()))          # one picture pixel, in model units
        inside = _erode(mask, max(2, H // 300))          # stay clear of the background at the outline
        su, sv = fit(u, v)
        for ids, b in _cover(tri_uv[:, :, :], step=0.7):
            f = faces[ids]
            tp = np.einsum('sk,tkc->tsc', b, tri_uv[ids])
            tx = np.clip(tp[..., 0].astype(int), 0, tw - 1)
            ty = np.clip(tp[..., 1].astype(int), 0, th - 1)
            px = np.einsum('sk,tk->ts', b, su[f])
            py = np.einsum('sk,tk->ts', b, sv[f])
            z = np.einsum('sk,tk->ts', b, d[f])
            facing = np.einsum('sk,tk->ts', b, nd[f])
            ix = np.clip(px.astype(int), 0, W - 1)
            iy = np.clip(py.astype(int), 0, H - 1)
            seen = (z >= zbuf[iy, ix] - 3 * pix) & inside[iy, ix]
            # Full strength facing the camera, fading out as the surface turns away.
            w = np.clip((facing - 0.3) / 0.45, 0, 1) * seen
            better = w > best_w[ty, tx]
            if not better.any():
                continue
            ty, tx, iy, ix, w = ty[better], tx[better], iy[better], ix[better], w[better]
            best_w[ty, tx] = w
            best_c[ty, tx] = a[iy, ix, :3]
    project.last_weights = best_w  # For inspection and tests.
    changed = best_w > 0
    if not changed.any():
        return 0
    # Smooth fade: soften the weights a little so the edge of the painted area doesn't show.
    wts = best_w.copy()
    for _ in range(2):
        p = np.pad(wts, 1, mode='edge')
        wts = np.minimum(wts, (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 4 * wts) / 8)
    out = tex * (1 - wts[..., None]) + best_c * wts[..., None]
    # Let painted colour bleed a couple of texels past triangle edges, so
    # texture filtering at UV seams doesn't pull in the old colour.
    for _ in range(2):
        grow = np.zeros_like(changed)
        acc = np.zeros_like(out)
        cnt = np.zeros(changed.shape, dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(changed, (dy, dx), axis=(0, 1))
            acc += np.roll(out, (dy, dx), axis=(0, 1)) * sh[..., None]
            cnt += sh
        grow = (cnt > 0) & ~changed & (best_w == 0)
        out[grow] = acc[grow] / cnt[grow][:, None]
        changed = changed | grow
    new = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))
    if hasattr(material, 'baseColorTexture'):
        material.baseColorTexture = new
    else:
        material.image = new
    return int((best_w > 0).sum())
