#!/usr/bin/env python3
"""PROPS lane: look at a generated prop model before placing it (docs/v2/ENV_KIT.md 16).
   python3 tools/v2/world_glb_shot.py <dir or file.glb> [--only a,b] [--out /tmp/claude-0/v2/props/shots] [--rot id=deg,...] [--size 300]
 For each <id>.glb: one row = front (what the game camera sees, camera on -z) | right | back | left | game camera (20 deg down) | top,
 in GAME axes (x right, y up, z into the screen: game = (glb.x, glb.y, -glb.z), then rotY). Software rasteriser (numpy), no browser.
"""
import sys, os, json, struct, io, argparse, math
import numpy as np
from PIL import Image, ImageDraw


def read_glb(path):
    f = open(path, 'rb').read()
    jl = struct.unpack('<I', f[12:16])[0]
    J = json.loads(f[20:20 + jl]); b0 = 20 + jl + 8
    def acc(i):
        a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
        off = b0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        return np.frombuffer(f, dt, a['count'] * n, off).reshape(-1, n).copy() if n > 1 else np.frombuffer(f, dt, a['count'], off).copy()
    pr = J['meshes'][0]['primitives'][0]; at = pr['attributes']
    bv = J['bufferViews'][J['images'][0]['bufferView']]
    img = f[b0 + bv.get('byteOffset', 0): b0 + bv.get('byteOffset', 0) + bv['byteLength']]
    return dict(pos=acc(at['POSITION']).astype(np.float64), uv=acc(at['TEXCOORD_0']).astype(np.float64), nrm=acc(at['NORMAL']).astype(np.float64), idx=acc(pr['indices']).astype(np.int64).reshape(-1, 3), img=img)


def to_game(M, rot_deg=0.0):
    """game axes + rotY (same maths as tools/v2/world_props_bake.mjs)"""
    P = M['pos'].copy(); N = M['nrm'].copy(); P[:, 2] *= -1; N[:, 2] *= -1
    T = M['idx'][:, [0, 2, 1]].copy()
    a = math.radians(rot_deg); c, s = math.cos(a), math.sin(a)
    for A in (P, N):
        x = A[:, 0].copy(); z = A[:, 2].copy(); A[:, 0] = c * x + s * z; A[:, 2] = -s * x + c * z
    return P, N, T


def raster(P, N, UV, T, tex, view, size, bg=(52, 54, 60)):
    """orthographic. view = 3x3 rows (right, up, toward-camera) in game axes"""
    R = np.array(view, np.float64); Q = P @ R.T; Nn = N @ R.T
    lo = Q.min(0); hi = Q.max(0); span = max(hi[0] - lo[0], hi[1] - lo[1]) * 1.06; cx = (lo[0] + hi[0]) / 2; cy = (lo[1] + hi[1]) / 2
    sx = (Q[:, 0] - cx) / span * size + size / 2; sy = size / 2 - (Q[:, 1] - cy) / span * size; sz = Q[:, 2]
    img = np.empty((size, size, 3), np.float32); img[:] = bg; zb = np.full((size, size), -1e9)
    th, tw = tex.shape[:2]; L = np.array([-0.35, 0.6, 0.72]); L /= np.linalg.norm(L)
    for a, b, c in T:
        x0, y0, x1, y1, x2, y2 = sx[a], sy[a], sx[b], sy[b], sx[c], sy[c]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9: continue
        # back faces. game winding: cross(b-a, c-a) = outward in game axes; the view basis is mirrored, so front faces have cross.z < 0 here
        ux, uy, uz = Q[b] - Q[a]; vx, vy, vz = Q[c] - Q[a]
        if ux * vy - uy * vx >= 0: continue
        xa = max(0, int(math.floor(min(x0, x1, x2)))); xb = min(size - 1, int(math.ceil(max(x0, x1, x2))))
        ya = max(0, int(math.floor(min(y0, y1, y2)))); yb = min(size - 1, int(math.ceil(max(y0, y1, y2))))
        if xa > xb or ya > yb: continue
        gx, gy = np.meshgrid(np.arange(xa, xb + 1) + 0.5, np.arange(ya, yb + 1) + 0.5)
        w1 = ((gx - x0) * (y2 - y0) - (x2 - x0) * (gy - y0)) / area; w2 = ((x1 - x0) * (gy - y0) - (gx - x0) * (y1 - y0)) / area; w0 = 1 - w1 - w2
        m = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
        if not m.any(): continue
        z = w0 * sz[a] + w1 * sz[b] + w2 * sz[c]; zr = zb[ya:yb + 1, xa:xb + 1]; m &= z > zr
        if not m.any(): continue
        u = w0 * UV[a, 0] + w1 * UV[b, 0] + w2 * UV[c, 0]; v = w0 * UV[a, 1] + w1 * UV[b, 1] + w2 * UV[c, 1]
        tx = np.clip((u * tw).astype(np.int64), 0, tw - 1); ty = np.clip((v * th).astype(np.int64), 0, th - 1)
        n = w0[..., None] * Nn[a] + w1[..., None] * Nn[b] + w2[..., None] * Nn[c]; n /= np.maximum(1e-9, np.linalg.norm(n, axis=2, keepdims=True))
        sh = 0.55 + 0.6 * np.clip(n @ L, 0, 1)
        col = tex[ty, tx] * sh[..., None]
        zr[m] = z[m]; img[ya:yb + 1, xa:xb + 1][m] = col[m]
    return np.clip(img, 0, 255).astype(np.uint8)


PITCH = math.radians(20)
VIEWS = [
    ('front (game)', [[1, 0, 0], [0, 1, 0], [0, 0, -1]]),
    ('right +x', [[0, 0, 1], [0, 1, 0], [1, 0, 0]]),
    ('back', [[-1, 0, 0], [0, 1, 0], [0, 0, 1]]),
    ('left -x', [[0, 0, -1], [0, 1, 0], [-1, 0, 0]]),
    ('game cam 20', [[1, 0, 0], [0, math.cos(PITCH), math.sin(PITCH)], [0, math.sin(PITCH), -math.cos(PITCH)]]),
    ('top', [[1, 0, 0], [0, 0, 1], [0, 1, 0]]),
]


def sheet(path, rot, size):
    M = read_glb(path); P, N, T = to_game(M, rot)
    tex = np.asarray(Image.open(io.BytesIO(M['img'])).convert('RGB').resize((512, 512), Image.LANCZOS), np.float32)
    row = Image.new('RGB', (size * len(VIEWS), size + 16), (20, 20, 24)); d = ImageDraw.Draw(row)
    for i, (name, V) in enumerate(VIEWS):
        row.paste(Image.fromarray(raster(P, N, M['uv'], T, tex, V, size)), (i * size, 16)); d.text((i * size + 4, 2), name, fill=(230, 230, 230))
    ext = P.max(0) - P.min(0)
    d.text((size * 5 + 90, 2), f'x{ext[0]:.2f} y{ext[1]:.2f} z{ext[2]:.2f} rot{rot:g}', fill=(255, 220, 120))
    return row


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('--only'); ap.add_argument('--out', default='/tmp/claude-0/v2/props/shots'); ap.add_argument('--rot', default=''); ap.add_argument('--size', type=int, default=300); ap.add_argument('--meta')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    rots = {k: float(v) for k, v in (kv.split('=') for kv in a.rot.split(',') if kv)}
    if a.meta:
        for k, v in json.load(open(a.meta)).items(): rots.setdefault(k, float(v.get('rotY', 0)))
    files = [a.src] if a.src.endswith('.glb') else sorted(os.path.join(a.src, n) for n in os.listdir(a.src) if n.endswith('.glb'))
    only = set(a.only.split(',')) if a.only else None
    for fpath in files:
        mid = os.path.basename(fpath)[:-4]
        if only and mid not in only: continue
        im = sheet(fpath, rots.get(mid, 0.0), a.size); d = ImageDraw.Draw(im); d.text((im.width - 110, 2), mid, fill=(120, 255, 160))
        im.save(os.path.join(a.out, mid + '.png')); print('shot', mid)
