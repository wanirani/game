#!/usr/bin/env python3
"""Death knight: the rune greatsword of src/death_knight_sheet2.webp (dk_sheet2 take 1) is painted very broad (the blade is
~36 % of its length wide). Squeeze it horizontally to 58 % so the blade reads as a heavy two-handed greatsword instead of
a cleaver, and store it on the sheet grey as src/death_knight_sword.webp (parts.json 'w' source).
    python3 tools/painted/enemies/death_knight/make_src.py"""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sheet = Image.open(os.path.join(HERE, 'src', 'death_knight_sheet2.webp')).convert('RGB')
g = sheet.getpixel((1760, 1500))
crop = sheet.crop((1700, 0, 2336, 1760))
sq = crop.resize((round(crop.width * 0.58), crop.height), Image.LANCZOS)
out = Image.new('RGB', (sq.width + 240, crop.height + 80), g)
out.paste(sq, (120, 40))
out.save(os.path.join(HERE, 'src', 'death_knight_sword.webp'), 'WEBP', quality=93, method=6)
print('death_knight_sword.webp', out.size, '(source x = 1700 + (x - 120) / 0.58, y = y - 40)')
