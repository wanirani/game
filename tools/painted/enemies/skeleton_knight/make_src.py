#!/usr/bin/env python3
"""Skeleton knight sources (ART-ENEMY-2). Re-creates src/*.webp from the stored Kling images:
  skeleton_knight_ref.webp = Kling Step-4 edit of the armless skeleton side view (shot sk_knight, take 1: horned helm,
                             spiked breastplate/pauldron, tasset skirt, greaves) — head, torso, pauldron, tasset, shin
  sk_knight_legs.webp      = Kling edit of take 1 without the tasset (shot sk_knight_legs, take 1) — bare femur
  skel_arms.webp           = crop of tools/painted/enemies/skeleton/src/skeleton_sheet1.webp (upper arm + forearm)
  longsword.webp           = crop of tools/painted/enemies/armor_knight/src/knight_sheet2.webp (the knight's longsword)
  cape.webp                = crop of tools/painted/enemies/armor_knight/src/knight_sheet1.webp (the knight's cape)
  kite_shield.webp         = crop of the ART-ENEMY-2 props sheet (shot props, take 1: black kite shield, gold skull)
Kling raw downloads live in tools/.qa_art-enemy-2/raw/ while the package runs (tools/kling/manifest_art-enemy-2.json)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw'); EN = os.path.join(ROOT, 'tools', 'painted', 'enemies')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
def save(im, name): im.convert('RGB').save(os.path.join(OUT, name), 'WEBP', quality=93, method=6); print(name, im.size)
def raw(n): p = os.path.join(RAW, n); return Image.open(p) if os.path.exists(p) else None
if raw('sk_knight_1.png'): save(raw('sk_knight_1.png'), 'skeleton_knight_ref.webp')
if raw('sk_knight_legs_1.png'): save(raw('sk_knight_legs_1.png'), 'sk_knight_legs.webp')
if raw('props_1.png'): save(raw('props_1.png').crop((1390, 150, 1780, 1140)), 'kite_shield.webp')
save(Image.open(os.path.join(EN, 'skeleton', 'src', 'skeleton_sheet1.webp')).crop((100, 320, 330, 1030)), 'skel_arms.webp')
# longsword: the neighbouring props at the crop edges are painted over with the sheet grey and the blade is padded onto
# a wider grey canvas (rembg keeps the gilded guard + grip only when it sees the whole object with room around it)
sw = Image.open(os.path.join(EN, 'armor_knight', 'src', 'knight_sheet2.webp')).convert('RGB').crop((1470, 52, 1785, 1210))
from PIL import ImageDraw
g = sw.getpixel((60, 40)); d = ImageDraw.Draw(sw)
d.rectangle((0, 1030, 22, 1158), fill=g); d.rectangle((300, 0, 315, 1158), fill=g); d.rectangle((290, 150, 315, 400), fill=g); d.rectangle((285, 1060, 315, 1158), fill=g)
pad = Image.new('RGB', (715, 1400), g); pad.paste(sw, (200, 120)); save(pad, 'longsword.webp')
save(Image.open(os.path.join(EN, 'armor_knight', 'src', 'knight_sheet1.webp')).crop((1485, 1008, 1830, 1642)), 'cape.webp')
