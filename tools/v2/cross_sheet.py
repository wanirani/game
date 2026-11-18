#!/usr/bin/env python3
"""CROSSING lane: a contact sheet of the frames of one cross_shot.mjs run (to look at a whole crossing at once).
   python3 tools/v2/cross_sheet.py <dir> [--cols 6] [--w 520] [--out sheet.png]"""
import json, sys, os
from PIL import Image, ImageDraw
a = sys.argv[1:]; d = a[0]
cols = int(a[a.index('--cols') + 1]) if '--cols' in a else 6
w = int(a[a.index('--w') + 1]) if '--w' in a else 520
out = a[a.index('--out') + 1] if '--out' in a else os.path.join(d, 'sheet.png')
fr = json.load(open(os.path.join(d, 'frames.json')))['frames']
ims = [Image.open(os.path.join(d, f['file'])).convert('RGB') for f in fr]
h = round(w * ims[0].height / ims[0].width); rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * (w + 6) + 6, rows * (h + 26) + 6), (16, 16, 22)); D = ImageDraw.Draw(S)
for i, (im, f) in enumerate(zip(ims, fr)):
    x, y = 6 + (i % cols) * (w + 6), 6 + (i // cols) * (h + 26)
    S.paste(im.resize((w, h), Image.LANCZOS), (x, y)); D.text((x + 4, y + h + 5), f"{f['file'][:-4]}  {f['phase']} {f['t']}s", fill=(230, 226, 210))
S.save(out); print(out, S.size)
