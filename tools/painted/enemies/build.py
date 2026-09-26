#!/usr/bin/env python3
"""Cut matted Kling art into painted-enemy parts and pack the source atlas.

  python3 build.py <enemy_id> [--work DIR] [--preview out.png]

Reads  tools/painted/enemies/<id>/parts.json   (authoring config, see docs/art/ENEMY_PIPELINE.md §4)
       <work>/matte/<file>                       (RGBA mattes from matte.py; <work> defaults to $ENEMY_WORK)
Writes assets/painted/enemies/<id>/atlas.webp + rig.json
       <work>/preview_<id>.png                    (every part on a dark backdrop with its pivots, for review)

parts.json:
{
  "id": "skeleton", "srcTD": 4,                       # atlas texels per logical (game) px
  "sources": { "s1": { "file": "skeleton_sheet1.png", "k": 0.05 } },   # k = logical px per source px
  "parts": {
    "skull": { "src": "s1", "box": [x0,y0,x1,y1],     # source-pixel crop
               "poly": [[x,y],...],                    # optional cut polygon (source px); pixels outside are dropped
               "keep": "largest" | "all",              # connected components to keep inside box/poly (default all)
               "k": 0.05,                              # optional per-part scale override
               "flipX": false, "rot": 0,               # optional: mirror / rotate (degrees, CCW) the cut
               "fade": [[x0,y0,x1,y1, "down"|"up"|"left"|"right"]],  # soft alpha fades (source px) for cut edges
               "minus": [[[x,y],...]],                  # polygons removed from the cut (e.g. the head from a torso)
               "inpaint": [[[x,y],...]],                # polygons repainted from their surroundings (cv2 Telea) before
                                                       # cutting, e.g. a thigh bone painted over the loincloth
               "piv": { "a": [x,y], "b": [x,y], ... } }  # pivots in source px (a→b = bone axis for limbs)
  }
}
"""
import json, os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = {sys.argv[i][2:]: sys.argv[i + 1] for i in range(len(sys.argv) - 1) if sys.argv[i].startswith('--')}
EID = args[0]
WORK = opt.get('work') or os.environ.get('ENEMY_WORK') or '/tmp/enemy_work'
CFG = json.load(open(os.path.join(HERE, EID, 'parts.json')))
TD = CFG.get('srcTD', 4)
OUTD = os.path.join(ROOT, 'assets', 'painted', 'enemies', EID)
os.makedirs(OUTD, exist_ok=True)

_cache = {}
def src_img(name):
    s = CFG['sources'][name]
    if name not in _cache:
        _cache[name] = np.asarray(Image.open(os.path.join(WORK, 'matte', s['file'])).convert('RGBA')).astype(np.float32)
    return _cache[name]


def poly_mask(shape, pts, feather=1.0):
    h, w = shape[:2]
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).polygon([tuple(p) for p in pts], fill=255)
    if feather: im = im.filter(ImageFilter.GaussianBlur(feather))
    return np.asarray(im).astype(np.float32) / 255.0


def cut(p):
    S = src_img(p['src'])
    if p.get('inpaint'):
        import cv2
        S = S.copy()
        m = np.zeros(S.shape[:2], np.uint8)
        for poly in p['inpaint']:
            cv2.fillPoly(m, [np.array(poly, np.int32)], 255)
        rgb = np.ascontiguousarray(S[..., :3].astype(np.uint8)[..., ::-1])
        rgb = cv2.inpaint(rgb, m, 9, cv2.INPAINT_TELEA)[..., ::-1]
        S[..., :3] = rgb
    x0, y0, x1, y1 = p['box']
    x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(S.shape[1], x1), min(S.shape[0], y1)
    rgba = S[y0:y1, x0:x1].copy()
    a = rgba[..., 3] / 255.0
    if p.get('poly'):
        pts = [(x - x0, y - y0) for x, y in p['poly']]
        a = a * poly_mask(rgba.shape, pts, p.get('feather', 1.0))
    for mp in p.get('minus', []):
        a = a * (1 - poly_mask(rgba.shape, [(x - x0, y - y0) for x, y in mp], p.get('feather', 1.0)))
    for f in p.get('fade', []):
        fx0, fy0, fx1, fy1, d = f
        yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
        X, Y = xx + x0, yy + y0
        inside = (X >= fx0) & (X <= fx1) & (Y >= fy0) & (Y <= fy1)
        if d == 'down': t = np.clip((fy1 - Y) / max(1, fy1 - fy0), 0, 1)
        elif d == 'up': t = np.clip((Y - fy0) / max(1, fy1 - fy0), 0, 1)
        elif d == 'right': t = np.clip((fx1 - X) / max(1, fx1 - fx0), 0, 1)
        else: t = np.clip((X - fx0) / max(1, fx1 - fx0), 0, 1)
        a = np.where(inside, a * t, a)
    if p.get('keep', 'all') == 'largest':
        lab, n = ndi.label(a > 0.25)
        if n > 1:
            sizes = ndi.sum(np.ones_like(a), lab, range(1, n + 1))
            keep = lab == (int(np.argmax(sizes)) + 1)
            keep = ndi.binary_dilation(keep, iterations=3)
            a = a * keep
    rgba[..., 3] = a * 255
    # tight bbox
    ys, xs = np.where(rgba[..., 3] > 6)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = rgba[by0:by1, bx0:bx1]
    ox, oy = x0 + bx0, y0 + by0             # source origin of the crop
    return rgba, ox, oy


def bleed(a):
    """copy nearest opaque colour into transparent texels so bilinear sampling never pulls dark/grey fringes"""
    msk = a[..., 3] > 8
    if msk.any() and (~msk).any():
        idx = ndi.distance_transform_edt(~msk, return_distances=False, return_indices=True)
        for c in range(3): a[..., c] = a[..., c][idx[0], idx[1]]
    return a


parts_out = {}
tiles = []
for name, p in CFG['parts'].items():
    rgba, ox, oy = cut(p)
    k = p.get('k', CFG['sources'][p['src']].get('k'))
    s = k * TD                                  # texels per source px
    piv = {pn: [(q[0] - ox) * s, (q[1] - oy) * s] for pn, q in p.get('piv', {}).items()}
    im = Image.fromarray(rgba.astype(np.uint8), 'RGBA')
    W, H = max(1, round(im.width * s)), max(1, round(im.height * s))
    # premultiply-safe resample: resize premultiplied colour then un-premultiply
    arr = np.asarray(im).astype(np.float32)
    pm = arr.copy(); pm[..., :3] *= arr[..., 3:4] / 255.0
    pim = Image.fromarray(pm.astype(np.uint8), 'RGBA').resize((W, H), Image.LANCZOS)
    r = np.asarray(pim).astype(np.float32)
    al = np.maximum(r[..., 3:4], 1e-3)
    r[..., :3] = np.where(r[..., 3:4] > 1, np.clip(r[..., :3] * 255.0 / al, 0, 255), 0)
    if p.get('flipX'):
        r = r[:, ::-1]; piv = {pn: [W - q[0], q[1]] for pn, q in piv.items()}
    if p.get('rot'):
        ang = p['rot']
        pimg = Image.fromarray(r.astype(np.uint8), 'RGBA')
        rotd = pimg.rotate(ang, resample=Image.BICUBIC, expand=True)
        cx, cy = W / 2, H / 2; ncx, ncy = rotd.width / 2, rotd.height / 2
        ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        def rp(q):
            dx, dy = q[0] - cx, q[1] - cy
            return [ncx + dx * ca + dy * sa, ncy - dx * sa + dy * ca]
        piv = {pn: rp(q) for pn, q in piv.items()}
        r = np.asarray(rotd).astype(np.float32); W, H = rotd.width, rotd.height
    r = bleed(r)
    tiles.append((name, r, piv, p))

# pack (shelf, height-sorted)
tiles.sort(key=lambda t: -t[1].shape[0])
MAXW = 1024; x = y = rowh = 0; aw = 0; places = {}
for name, r, piv, p in tiles:
    h, w = r.shape[:2]
    if x + w + 2 > MAXW: x = 0; y += rowh + 2; rowh = 0
    places[name] = (x, y); x += w + 2; rowh = max(rowh, h); aw = max(aw, x)
AW, AH = aw, y + rowh
atlas = np.zeros((AH, AW, 4), np.float32)
for name, r, piv, p in tiles:
    px, py = places[name]; h, w = r.shape[:2]
    atlas[py:py + h, px:px + w] = r
    parts_out[name] = {'rect': [px, py, w, h], 'piv': {pn: [round(q[0], 2), round(q[1], 2)] for pn, q in piv.items()}}
    if p.get('meta'): parts_out[name]['meta'] = p['meta']
Image.fromarray(atlas.astype(np.uint8), 'RGBA').save(os.path.join(OUTD, 'atlas.webp'), 'WEBP', quality=int(CFG.get('quality', 90)), method=6, alpha_quality=100)
ver = int(os.path.getmtime(os.path.join(OUTD, 'atlas.webp'))) % 100000
rig = {'id': EID, 'tier': CFG.get('tier'), 'srcTD': TD, 'atlas': 'atlas.webp', 'v': ver, 'size': [AW, AH], 'parts': parts_out}
if CFG.get('meta'): rig['meta'] = CFG['meta']
json.dump(rig, open(os.path.join(OUTD, 'rig.json'), 'w'), indent=1)
kb = os.path.getsize(os.path.join(OUTD, 'atlas.webp')) / 1024
print(f'{EID}: atlas {AW}x{AH}  {kb:.0f} KB  parts={len(parts_out)}')

# preview: parts on a dark backdrop with pivots
pv = Image.new('RGBA', (AW * 2, AH * 2), (34, 26, 40, 255))
big = Image.fromarray(atlas.astype(np.uint8), 'RGBA').resize((AW * 2, AH * 2), Image.NEAREST)
pv = Image.alpha_composite(pv, big)
d = ImageDraw.Draw(pv)
for name, e in parts_out.items():
    px, py, w, h = e['rect']
    d.rectangle([px * 2, py * 2, (px + w) * 2, (py + h) * 2], outline=(90, 90, 120, 255))
    d.text((px * 2 + 3, py * 2 + 2), name, fill=(255, 255, 0, 255))
    for pn, q in e['piv'].items():
        cx, cy = (px + q[0]) * 2, (py + q[1]) * 2
        col = (0, 255, 0, 255) if pn == 'a' else (255, 60, 60, 255) if pn == 'b' else (80, 200, 255, 255)
        d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], outline=col, width=2)
        d.text((cx + 6, cy - 6), pn, fill=col)
pv.convert('RGB').save(opt.get('preview') or os.path.join(WORK, f'preview_{EID}.png'))
