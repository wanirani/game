#!/usr/bin/env python3
"""WORLD lane: contact sheets from the captures of tools/v2/world_check.mjs.
   python3 tools/v2/world_sheet.py                     -> /tmp/claude-0/v2/world/sheet_<area>.png for every area found
   python3 tools/v2/world_sheet.py --pair a b spots... -> the same spots of two areas side by side (owner picture)"""
import sys, glob, os
from PIL import Image, ImageDraw
D = '/tmp/claude-0/v2/world/shots'; OUT = '/tmp/claude-0/v2/world'


def sheet(files, out, cols=3, w=640, labels=None):
    ims = [Image.open(f).convert('RGB') for f in files]
    if not ims: return
    h = round(w * ims[0].height / ims[0].width); rows = (len(ims) + cols - 1) // cols
    S = Image.new('RGB', (cols * w, rows * h), (10, 10, 12)); d = ImageDraw.Draw(S)
    for i, im in enumerate(ims):
        x, y = (i % cols) * w, (i // cols) * h; S.paste(im.resize((w, h), Image.LANCZOS), (x, y))
        d.rectangle((x, y, x + 8 + 7 * len((labels or files)[i].split('/')[-1]), y + 16), fill=(0, 0, 0)); d.text((x + 4, y + 2), (labels or [os.path.basename(f)[:-4] for f in files])[i], fill=(255, 230, 160))
    S.save(out); print(out, S.size)


if '--pair' in sys.argv:
    i = sys.argv.index('--pair'); a, b, spots = sys.argv[i + 1], sys.argv[i + 2], sys.argv[i + 3:]
    files = [f'{D}/{area}_{s}.png' for s in spots for area in (a, b)]
    sheet([f for f in files if os.path.exists(f)], f'{OUT}/pair_{a}_{b}.png', cols=2, w=800)
else:
    areas = sorted({os.path.basename(f).rsplit('_', 2)[0] for f in glob.glob(f'{D}/*_[0-9]_*.png')})
    for a in areas: sheet(sorted(glob.glob(f'{D}/{a}_[0-9]_*.png')), f'{OUT}/sheet_{a}.png')
