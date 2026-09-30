"""Which way does the generated model face?

AI image-to-3D models don't agree on a "forward" axis, and a game needs one:
+Z, with +Y up. Rather than trust any one model's convention, we look at the
result. The model is viewed from four sides, and each view is compared with
the input picture:

1. Outline: the view whose silhouette best matches the picture's outline is
   the front or the back (side views of a person look nothing like the front).
2. Front or back: the back is the front's mirror image, so an asymmetric pose
   settles it. If the pose is symmetric, colours decide (a face is not the back
   of a head). With no texture, the feet decide: toes point forward.
"""
import numpy as np

GRID = 64


def _rot_y(points, degrees):
    a = np.radians(degrees)
    c, s = np.cos(a), np.sin(a)
    x, y, z = points[:, 0], points[:, 1], points[:, 2]
    return np.stack([x * c + z * s, y, -x * s + z * c], axis=1)


def _normalise(u, v, grid=GRID):
    """Maps 2D points into a grid: height fills 90%, centred on the bounding box."""
    h = max(v.max() - v.min(), 1e-9)
    k = grid * 0.9 / h
    gu = (u - (u.min() + u.max()) / 2) * k + grid / 2
    gv = (v.max() - v) * k + grid * 0.05
    return np.clip(gu.astype(int), 0, grid - 1), np.clip(gv.astype(int), 0, grid - 1)


def silhouette(points, grid=GRID):
    """Front view (looking along -Z, +X to the right) of surface sample points."""
    iu, iv = _normalise(points[:, 0], points[:, 1], grid)
    m = np.zeros((grid, grid), bool)
    m[iv, iu] = True
    return _close(m)


def _close(m):
    # Fill the pin-holes between sample points: dilate then erode once.
    p = np.pad(m, 1)
    d = p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    p = np.pad(d, 1, constant_values=True)
    return p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]


def image_mask_and_colour(rgba, grid=GRID):
    """The picture's outline and a colour grid, normalised like silhouette()."""
    a = np.asarray(rgba.convert('RGBA'), dtype=np.float32) / 255.0
    alpha = a[..., 3] > 0.5
    ys, xs = np.nonzero(alpha)
    if len(xs) < 10:
        raise ValueError('The picture has no visible subject after background removal.')
    iu, iv = _normalise(xs.astype(float), -ys.astype(float), grid)
    mask = np.zeros((grid, grid), bool)
    mask[iv, iu] = True
    colour = np.zeros((grid, grid, 3))
    count = np.zeros((grid, grid))
    np.add.at(colour, (iv, iu), a[ys, xs, :3])
    np.add.at(count, (iv, iu), 1)
    colour /= np.maximum(count, 1)[..., None]
    return _close(mask), colour, count > 0


def _colour_grid(points, normals, colours, grid=GRID):
    """Colours of the surface facing the viewer (+Z), in the same grid."""
    facing = normals[:, 2] > 0.3
    iu, iv = _normalise(points[:, 0], points[:, 1], grid)
    iu, iv, c = iu[facing], iv[facing], colours[facing]
    # Nearest surface wins: sort far to near so near samples overwrite.
    order = np.argsort(points[facing][:, 2])
    out = np.zeros((grid, grid, 3))
    seen = np.zeros((grid, grid), bool)
    out[iv[order], iu[order]] = c[order]
    seen[iv[order], iu[order]] = True
    return out, seen


def iou(a, b):
    return (a & b).sum() / max((a | b).sum(), 1)


def detect_turn(mesh, front_rgba, samples=40000, log=print):
    """Degrees to turn `mesh` about +Y so its front faces +Z. One of 0/90/180/270."""
    import trimesh
    rng_state = np.random.get_state()
    np.random.seed(0)  # Deterministic sampling: same model, same answer.
    try:
        colours = None
        try:
            pts, face_idx, colours = trimesh.sample.sample_surface(mesh, samples, sample_color=True)
            colours = np.asarray(colours, dtype=np.float32)[:, :3] / 255.0
        except Exception:
            pts, face_idx = trimesh.sample.sample_surface(mesh, samples)
        normals = mesh.face_normals[face_idx]
    finally:
        np.random.set_state(rng_state)
    has_colour = colours is not None and colours.std() > 0.02

    mask, img_colour, img_seen = image_mask_and_colour(front_rgba)
    scores = {}
    for turn in (0, 90, 180, 270):
        p = _rot_y(pts, turn)
        scores[turn] = iou(silhouette(p), mask)
    log('  outline match by turn: ' + ', '.join(f'{t}\N{DEGREE SIGN}={s:.2f}' for t, s in scores.items()))

    # Front/back pair vs. side pair: whichever pair matches the outline better.
    pair = (0, 180) if max(scores[0], scores[180]) >= max(scores[90], scores[270]) else (90, 270)
    a, b = pair
    # The outline can only tell front from back when the picture is lopsided
    # (one arm raised, a weapon to one side); otherwise it's noise.
    lopsided = 1 - iou(mask, mask[:, ::-1])
    if lopsided > 0.3 and abs(scores[a] - scores[b]) > max(0.08, lopsided * 0.3):
        best = a if scores[a] > scores[b] else b
        log(f'  decided by outline (asymmetric pose): turn {best}\N{DEGREE SIGN}')
        return best

    if has_colour:
        # Compare only where the front and back views differ from each other
        # (a face against the back of a head); elsewhere they tell us nothing.
        views = {t: _colour_grid(_rot_y(pts, t), _rot_y(normals, t), colours) for t in pair}
        (ga, sa), (gb, sb) = views[a], views[b]
        telling = sa & sb & img_seen & (np.abs(ga - gb).sum(axis=-1) > 0.15)
        err = {t: np.abs(views[t][0][telling] - img_colour[telling]).mean() if telling.sum() >= 5 else 1.0 for t in pair}
        log(f'  colour difference over {int(telling.sum())} telling cells: ' + ', '.join(f'{t}\N{DEGREE SIGN}={e:.3f}' for t, e in err.items()))
        if telling.sum() >= 5 and abs(err[a] - err[b]) > 0.02:
            best = min(err, key=err.get)
            log(f'  decided by colour: turn {best}\N{DEGREE SIGN}')
            return best

    # Feet: the toes stick out further in front of the ankles than the heels behind.
    lo, hi = pts[:, 1].min(), pts[:, 1].max()
    reach = {}
    for t in pair:
        p = _rot_y(pts, t)
        body = p[(p[:, 1] > lo + 0.3 * (hi - lo)) & (p[:, 1] < lo + 0.6 * (hi - lo))]
        feet = p[p[:, 1] < lo + 0.05 * (hi - lo)]
        if len(body) < 10 or len(feet) < 10:
            continue
        c = np.median(body[:, 2])
        reach[t] = (feet[:, 2].max() - c) - (c - feet[:, 2].min())
    if len(reach) == 2 and abs(reach[a] - reach[b]) > 0.01 * (hi - lo):
        best = max(reach, key=reach.get)
        log(f'  decided by the feet: turn {best}\N{DEGREE SIGN}')
        return best

    log('  could not tell front from back; assuming no turn. Use --turn 180 if it faces away.')
    return a
