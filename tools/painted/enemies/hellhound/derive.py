#!/usr/bin/env python3
"""Derived source for the hellhound body (ART-ENEMY-5): src/hh_body_raw.webp (the kept Kling edit hh_body_1) →
src/hh_body.webp. Kling painted a strong cyan rim-light halo around the whole silhouette; the grey key keeps such a
coloured glow as a blue fringe, so every cyan/blue pixel is pulled back to the flat background grey (the creature itself
has no blue: black fur, ember cracks, flames, amber eyes). The red blood drool under the jaw becomes molten metal
(orange-yellow), as the enemy description says ("침이 쇳물이다").
    python3 tools/painted/enemies/hellhound/derive.py
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
a = np.asarray(Image.open(os.path.join(HERE, 'src', 'hh_body_raw.webp')).convert('RGB')).astype(np.float32)
bg = np.median(np.concatenate([a[:8].reshape(-1, 3), a[:, :8].reshape(-1, 3)]), 0)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
# blueness: how far blue rises above red/green (the halo is cyan-blue, the art is warm)
blue = np.clip((B - np.maximum(R, G * 0.92) - 6) / 34.0, 0, 1)
blue = ndi.gaussian_filter(blue, 1.2)
out = a * (1 - blue[..., None]) + bg[None, None, :] * blue[..., None]
# molten drool: saturated red pixels below the jaw → hot orange
h, w = R.shape
yy, xx = np.mgrid[0:h, 0:w]
zone = (xx > 1640) & (xx < 1840) & (yy > 1060) & (yy < 1360)
red = zone & (R > 90) & (R > G * 2.0) & (R > B * 2.0)
m = ndi.gaussian_filter(red.astype(np.float32), 1.0)[..., None]
hot = np.stack([np.clip(R * 1.25 + 40, 0, 255), np.clip(R * 0.75 + 30, 0, 255), np.clip(G * 0.5 + 20, 0, 255)], -1)
out = out * (1 - m) + hot * m
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(os.path.join(HERE, 'src', 'hh_body.webp'), 'WEBP', quality=93)
print('hh_body.webp: halo pixels', int((blue > 0.5).sum()), 'drool pixels', int(red.sum()))
