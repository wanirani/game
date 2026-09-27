#!/usr/bin/env python3
"""Puppet maiden sources (ART-ENEMY-2). puppet_maiden_ref.webp = Kling Step-1 reference (shot doll_ref, take 1, the chosen
design); doll_side.webp = Kling side view made from it (shot doll_side, take 2: strict side view facing right, no glow)
— head, dress body, porcelain arm and legs are cut from it. Kling raw downloads live in tools/.qa_art-enemy-2/raw/ while
the package runs (tools/kling/manifest_art-enemy-2.json)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
for raw, name in (('doll_ref_1.png', 'puppet_maiden_ref.webp'), ('doll_side_2.png', 'doll_side.webp')):
    p = os.path.join(RAW, raw)
    if os.path.exists(p): Image.open(p).convert('RGB').save(os.path.join(OUT, name), 'WEBP', quality=93, method=6); print(name)

# doll_body.webp: the side view with the near arm painted out — the arm region is filled with a patch of the black
# skirt right behind it (feathered); a plain inpaint smeared the white sleeve frills over the dress.
p = os.path.join(OUT, 'doll_side.webp')
if os.path.exists(p):
    from PIL import ImageDraw, ImageFilter
    im = Image.open(p).convert('RGB')
    arm = [(754, 1183), (909, 1174), (943, 1303), (938, 1509), (951, 1551), (917, 1594), (814, 1594), (780, 1474), (759, 1303)]
    x0, y0, x1, y1 = 745, 1165, 960, 1600
    patch = im.crop((540, 1337, 729, 1629)).resize((x1 - x0, y1 - y0), Image.LANCZOS)
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).polygon(arm, fill=255); m = m.filter(ImageFilter.GaussianBlur(3))
    layer = im.copy(); layer.paste(patch, (x0, y0))
    Image.composite(layer, im, m).save(os.path.join(OUT, 'doll_body.webp'), 'WEBP', quality=93, method=6); print('doll_body.webp')
