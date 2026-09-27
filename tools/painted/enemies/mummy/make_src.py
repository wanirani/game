#!/usr/bin/env python3
"""Mummy sources (ART-ENEMY-2). mummy_ref.webp = Kling Step-1 reference (shot mummy_ref, take 1, the chosen design);
mummy_sheet.webp = Kling Step-2 parts sheet made from it (shot mummy_sheet, take 1: front + clean side view, a loose
arm, legs, a long bandage strip) — the side figure gives body/leg/arm, the strip is the lash. Kling raw downloads live in
tools/.qa_art-enemy-2/raw/ while the package runs (tools/kling/manifest_art-enemy-2.json)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
for raw, name in (('mummy_ref_1.png', 'mummy_ref.webp'), ('mummy_sheet_1.png', 'mummy_sheet.webp')):
    p = os.path.join(RAW, raw)
    if os.path.exists(p): Image.open(p).convert('RGB').save(os.path.join(OUT, name), 'WEBP', quality=93, method=6); print(name)

# mummy_body.webp: the side figure with the near arm painted out — the arm region is filled with a patch of the
# front figure's bandaged torso (same sheet, same wraps and light), feathered; a plain inpaint dragged the grey
# background in along the back contour. The arm itself is still cut from mummy_sheet.webp.
p = os.path.join(OUT, 'mummy_sheet.webp')
if os.path.exists(p):
    from PIL import ImageDraw, ImageFilter
    sheet = Image.open(p).convert('RGB')
    arm = [(1037, 471), (1155, 466), (1174, 569), (1165, 706), (1174, 764), (1223, 891), (1243, 1018), (1243, 1126), (1223, 1165), (1135, 1165), (1121, 1057), (1101, 921), (1047, 823), (1037, 715), (1042, 588)]
    x0, y0, x1, y1 = 1030, 460, 1250, 1170
    patch = sheet.crop((360, 700, 600, 1250)).resize((x1 - x0, y1 - y0), Image.LANCZOS)
    m = Image.new('L', sheet.size, 0); ImageDraw.Draw(m).polygon(arm, fill=255); m = m.filter(ImageFilter.GaussianBlur(3))
    layer = sheet.copy(); layer.paste(patch, (x0, y0))
    body = Image.composite(layer, sheet, m)
    body.save(os.path.join(OUT, 'mummy_body.webp'), 'WEBP', quality=93, method=6); print('mummy_body.webp')
