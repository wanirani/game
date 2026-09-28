#!/usr/bin/env python3
"""drowned: derive src/drowned_body.webp from the parts sheet (take 2) — the near arm hanging at the back of the side
figure is cloned over with the shirt / trousers texture from just in front of it (shifted copy, feathered), so the body
and the legs have cloth behind the arm when the arm swings (cv2 inpaint smeared the grey backdrop into it)."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(HERE, 'src', 'drowned_sheet.webp')).convert('RGB')
A = np.asarray(src).astype(np.float32)
ARM = [(860, 393), (971, 371), (1004, 504), (1016, 682), (1038, 860), (1071, 949), (1075, 1082), (1027, 1096), (971, 1062),
       (949, 949), (916, 793), (871, 638), (849, 504)]
m = Image.new('L', src.size, 0)
ImageDraw.Draw(m).polygon([(x + d, y) for (x, y), d in zip(ARM, [-6, 6, 8, 8, 8, 8, 8, 8, -6, -6, -6, -6, -6])], fill=255)
m = np.asarray(m.filter(ImageFilter.GaussianBlur(4))).astype(np.float32)[..., None] / 255.0
out = A.copy()
H, W = A.shape[:2]
ys = np.arange(H)[:, None]
# shift per row: the shirt (above the belt) is copied from 70 px further forward, the trousers from 95 px
shift = np.where(ys < 760, 70, 95)
xs = np.clip(np.arange(W)[None, :] + shift, 0, W - 1)
clone = A[np.broadcast_to(ys, (H, W)), xs]
out = A * (1 - m) + clone * m
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(os.path.join(HERE, 'src', 'drowned_body.webp'), 'WEBP', quality=94, method=5)
print('ok')
