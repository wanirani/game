#!/usr/bin/env python3
# STORY: the sheet of every cut (tools/v2/chapter_cuts.mjs writes <out>/cuts.json and the stills).
#   python3 tools/v2/chapter_cuts_sheet.py <out> [--cols 5] [--width 2400]
# One sheet per device: <out>/sheet_<device>.jpg. Under each still: its name, what it is, and - in red - why the tool calls it weak (a number each).
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
cols = int(sys.argv[sys.argv.index('--cols') + 1]) if '--cols' in sys.argv else 5
width = int(sys.argv[sys.argv.index('--width') + 1]) if '--width' in sys.argv else 2400
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
f1, f2 = ImageFont.truetype(FONT, 19), ImageFont.truetype(FONT, 15)
cuts = json.load(open(os.path.join(out, 'cuts.json')))['cuts']
for dev in sorted(set(c['device'] for c in cuts)):
    L = [c for c in cuts if c['device'] == dev and c.get('file') and os.path.exists(c['file'])]
    if not L: continue
    w0, h0 = Image.open(L[0]['file']).size
    pad, tw = 10, (width - 10 * (cols + 1)) // cols
    th, cap = round(tw * h0 / w0), 96
    rows = (len(L) + cols - 1) // cols
    S = Image.new('RGB', (width, 44 + rows * (th + cap + pad) + pad), (16, 16, 20))
    d = ImageDraw.Draw(S)
    nweak = sum(1 for c in L if c['weak'])
    d.text((pad, 10), f'chapter 1 - every cut - {dev} - {len(L)} stills, {nweak} weak (red)', font=f1, fill=(235, 225, 200))
    for i, c in enumerate(L):
        x, y = pad + (i % cols) * (tw + pad), 44 + (i // cols) * (th + cap + pad)
        im = Image.open(c['file']).convert('RGB').resize((tw, th), Image.LANCZOS)
        S.paste(im, (x, y))
        weak = bool(c['weak'])
        d.rectangle([x - 2, y - 2, x + tw + 1, y + th + 1], outline=(220, 60, 50) if weak else (70, 150, 90), width=3)
        d.text((x, y + th + 5), f"{i + 1:02d} {c['id']}", font=f1, fill=(240, 240, 240))
        d.text((x, y + th + 28), c['title'][:44], font=f2, fill=(200, 200, 205))
        for k, wtxt in enumerate(c['weak'][:3]):
            d.text((x, y + th + 48 + k * 16), ('! ' + wtxt)[:int(tw / 7.6)], font=f2, fill=(255, 120, 100))
        if not weak:
            who = ', '.join(f"{p['id']} {p['seen']:.2f}" for p in c.get('who', []) if p['id'] in c.get('about', []))
            d.text((x, y + th + 48), ('seen: ' + who)[:int(tw / 7.6)], font=f2, fill=(130, 200, 150))
    p = os.path.join(out, f'sheet_{dev}.jpg')
    S.save(p, quality=88)
    print(p, S.size, len(L), 'stills', nweak, 'weak')
