#!/usr/bin/env python3
"""구울 (zombie) source prep: Kling kept both arms in the Step-4 edit, so the near arm hanging over the shirt and the
clawed hand over the thigh are painted out here (the reaching arms are separate parts cut from sheet 1).
The transparent background is first filled with the nearest opaque colour, so cv2 Telea inpainting pulls shirt /
trouser colours instead of the grey backdrop (build.py's own 'inpaint' works on the raw matte and smeared grey in).
    python3 tools/painted/enemies/matte.py tools/painted/enemies/zombie/src/zombie_edit.webp <WORK>/matte/e1_zombie_edit.png
    python3 tools/painted/enemies/zombie/prep.py      -> <WORK>/matte/e1_zombie_edit_clean.png (parts.json source 'e')
"""
import os
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get('ENEMY_WORK') or os.path.abspath(os.path.join(HERE, '..', '..', '.work', 'enemies'))
a = np.asarray(Image.open(os.path.join(WORK, 'matte', 'e1_zombie_edit.png')).convert('RGBA')).astype(np.float32)
# source-pixel polygons (image faces left): near arm over the shirt / trousers, clawed hand + claws over the thigh
ARM = [(905, 1075), (1085, 1060), (1110, 1200), (1095, 1400), (1080, 1620), (1060, 1700), (930, 1700), (905, 1400), (885, 1200)]
HAND = [(720, 1650), (975, 1630), (985, 1860), (970, 2040), (840, 2060), (730, 1960)]
m = np.zeros(a.shape[:2], np.uint8)
for p in (ARM, HAND):
    cv2.fillPoly(m, [np.array(p, np.int32)], 255)
# the arm lies ON the silhouette edge: bleed only from pixels outside the arm/hand, so the fill takes shirt / trouser
# colours (not the arm's own pale skin or the grey backdrop)
op = (a[..., 3] > 128) & (m == 0)
idx = ndi.distance_transform_edt(~op, return_distances=False, return_indices=True)
rgb = a[..., :3][idx[0], idx[1]].astype(np.uint8)
out = cv2.inpaint(np.ascontiguousarray(rgb[..., ::-1]), m, 15, cv2.INPAINT_TELEA)[..., ::-1]
res = a.copy()
res[..., :3] = np.where(m[..., None] > 0, out, a[..., :3])
res[..., 3] = np.where(m > 0, 255, a[..., 3])            # the painted-out regions lie inside the body silhouette
Image.fromarray(res.clip(0, 255).astype(np.uint8), 'RGBA').save(os.path.join(WORK, 'matte', 'e1_zombie_edit_clean.png'))
print('zombie edit cleaned')
