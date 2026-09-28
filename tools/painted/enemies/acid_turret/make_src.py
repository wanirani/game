#!/usr/bin/env python3
"""acid_turret sources (ART-ENEMY-3). acid_turret_ref.webp = Kling Step-1 reference (take 2, the chosen design).
rembg drops the brick furnace under the stone slab (it keeps only the copper/glass apparatus as the salient object),
so the furnace is cropped into its own source (acid_turret_base.webp) on a flat grey canvas and matted separately."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(HERE, 'src', 'acid_turret_ref.webp')).convert('RGB')
box = (150, 1580, 1450, 2330)
crop = src.crop(box)
bg = src.getpixel((20, 20))
canvas = Image.new('RGB', (crop.width + 200, crop.height + 200), bg)
canvas.paste(crop, (100, 100))
canvas.save(os.path.join(HERE, 'src', 'acid_turret_base.webp'), 'WEBP', quality=93, method=6)
print('acid_turret_base.webp', canvas.size, 'offset', box[0] - 100, box[1] - 100)
