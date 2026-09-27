#!/usr/bin/env python3
"""황금 박쥐 (golden_bat): rig reuse of the painted bat (docs/art/ENEMY_PIPELINE.md §6) — 0 Kling images.

    python3 tools/painted/enemies/golden_bat/recolor.py

Reads the baked bat atlas + rig (assets/painted/enemies/bat/) and writes assets/painted/enemies/golden_bat/{atlas.webp,
rig.json}: every texel is gradient-mapped by luminance onto a gold ramp (deep amber → gold → pale gold highlights), so
the painted fur/membrane detail and the lighting survive while the whole creature reads as gold. The hanging cocoon is
dropped (the golden bat never hangs: AI 'fleer').
Re-run after the bat atlas is rebuilt.
"""
import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'painted', 'enemies', 'bat')
OUT = os.path.join(ROOT, 'assets', 'painted', 'enemies', 'golden_bat')
os.makedirs(OUT, exist_ok=True)

rig = json.load(open(os.path.join(SRC, 'rig.json')))
im = np.asarray(Image.open(os.path.join(SRC, rig.get('atlas', 'atlas.webp'))).convert('RGBA')).astype(np.float32) / 255.0

# gold ramp (luminance → colour): shadows stay warm and deep so the silhouette keeps its volume
RAMP = np.array([
    [0.00, 0.16, 0.08, 0.02],
    [0.18, 0.42, 0.24, 0.04],
    [0.40, 0.78, 0.52, 0.12],
    [0.62, 0.95, 0.74, 0.24],
    [0.82, 1.00, 0.90, 0.52],
    [1.00, 1.00, 0.98, 0.82],
])
rgb = im[..., :3]
lum = rgb[..., 0] * 0.3 + rgb[..., 1] * 0.55 + rgb[..., 2] * 0.15
# the bat is dark: lift and stretch the luminance range before mapping (keeps fur strands and membrane veins)
t = np.clip((lum - 0.02) / 0.55, 0, 1) ** 0.75
out = np.zeros_like(rgb)
for c in range(3):
    out[..., c] = np.interp(t, RAMP[:, 0], RAMP[:, c + 1])
# keep a hint of the original hue variation (membrane vs fur) so it does not look flat
sat = rgb.max(-1) - rgb.min(-1)
out = np.clip(out * (0.92 + 0.25 * sat[..., None]), 0, 1)
res = np.dstack([out, im[..., 3:4]])

# drop the hanging cocoon: rebuild the atlas from the kept parts only
keep = {k: v for k, v in rig['parts'].items() if k != 'hang'}
x = 0; H = max(v['rect'][3] for v in keep.values()); tiles = {}
for k, v in keep.items():
    rx, ry, rw, rh = v['rect']
    tiles[k] = (res[ry:ry + rh, rx:rx + rw], x); x += rw + 2
atlas = np.zeros((H, x, 4), np.float32)
parts = {}
for k, (tile, px) in tiles.items():
    h, w = tile.shape[:2]
    atlas[:h, px:px + w] = tile
    parts[k] = {**rig['parts'][k], 'rect': [px, 0, w, h]}
Image.fromarray((atlas * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'atlas.webp'), 'WEBP', quality=90, method=6, alpha_quality=100)
ver = int(os.path.getmtime(os.path.join(OUT, 'atlas.webp'))) % 100000
json.dump({**rig, 'id': 'golden_bat', 'v': ver, 'size': [x, H], 'parts': parts, 'note': 'gold gradient-map of the bat atlas (recolor.py)'},
          open(os.path.join(OUT, 'rig.json'), 'w'), indent=1)
print('golden_bat atlas', x, 'x', H, os.path.getsize(os.path.join(OUT, 'atlas.webp')) // 1024, 'KB')
