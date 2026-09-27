#!/usr/bin/env python3
"""Spear guard sources (ART-ENEMY-2, knight-rig reuse). The cuirass/tabard, rerebrace (also the cuisse), vambrace and
greave come straight from ../armor_knight/src (parts.json points there, same cached mattes); this script only cuts the
two new props out of the ART-ENEMY-2 props sheet (shot props, take 1), padded with the sheet grey:
  plume_helm.webp = closed steel helm, red visor slit, crimson horsehair plume (faces left in the sheet → flipX)
  spear.webp      = long war spear, dark wood shaft with gold bands, leaf spearhead (point right)
Kling raw downloads live in tools/.qa_art-enemy-2/raw/ while the package runs (tools/kling/manifest_art-enemy-2.json)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
def save(im, name): im.convert('RGB').save(os.path.join(OUT, name), 'WEBP', quality=93, method=6); print(name, im.size)
p = os.path.join(RAW, 'props_1.png')
if os.path.exists(p):
    sheet = Image.open(p).convert('RGB'); g = sheet.getpixel((1760, 1100))
    def cut(box, pad):
        c = sheet.crop(box); o = Image.new('RGB', (c.width + pad * 2, c.height + pad * 2), g); o.paste(c, (pad, pad)); return o
    save(cut((1800, 160, 2290, 980), 120), 'plume_helm.webp')      # source px = crop px + (1800-120, 160-120)
    save(cut((20, 1300, 2320, 1690), 120), 'spear.webp')           # source px = crop px + (20-120, 1300-120)
