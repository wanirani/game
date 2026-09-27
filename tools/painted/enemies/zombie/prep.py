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
ARM = [(893, 1105), (1098, 1105), (1098, 1590), (1020, 1745), (985, 1945), (955, 2040), (690, 2040), (690, 1745), (800, 1590), (868, 1300)]
HAND = [(690, 1740), (1000, 1740), (985, 1945), (955, 2040), (690, 2040)]
m = np.zeros(a.shape[:2], np.uint8)
for p in (ARM, HAND):
    cv2.fillPoly(m, [np.array(p, np.int32)], 255)
# the arm lies ON the silhouette edge: bleed only from pixels outside the arm/hand, so the fill takes shirt / trouser
# colours (not the arm's own pale skin or the grey backdrop)
far = np.zeros_like(m); cv2.fillPoly(far, [np.array([(480, 1450), (705, 1450), (705, 1960), (480, 1960)], np.int32)], 255)   # the far hand (yellow claws)
op = ndi.binary_erosion((a[..., 3] > 250) & (m == 0) & (far == 0), iterations=8)   # solid interior only (edge texels are grey rim)
idx = ndi.distance_transform_edt(~op, return_distances=False, return_indices=True)
rgb = a[..., :3][idx[0], idx[1]].astype(np.uint8)
out = cv2.inpaint(np.ascontiguousarray(rgb[..., ::-1]), m, 15, cv2.INPAINT_TELEA)[..., ::-1]
res = a.copy()
res[..., :3] = np.where(m[..., None] > 0, out, a[..., :3])
res[..., 3] = np.where(m > 0, 255, a[..., 3])            # the painted-out regions lie inside the body silhouette
Image.fromarray(res.clip(0, 255).astype(np.uint8), 'RGBA').save(os.path.join(WORK, 'matte', 'e1_zombie_edit_clean.png'))
print('zombie edit cleaned')
