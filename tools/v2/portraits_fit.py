#!/usr/bin/env python3
"""Portraits for the dialogue box, sized for how large they are drawn (docs/v2/UI_API.md: the bust is about 170-220 CSS px tall).
   Sources (880x1168, kept for larger uses later): tools/v2/portrait_src/*.webp  ->  assets/v2/portraits/*.webp (560 px wide, alpha kept).
   python3 tools/v2/portraits_fit.py [--width 560] [--quality 84]
"""
import glob, os, sys
from PIL import Image
W = int(sys.argv[sys.argv.index('--width') + 1]) if '--width' in sys.argv else 560
Q = int(sys.argv[sys.argv.index('--quality') + 1]) if '--quality' in sys.argv else 84
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src, out = os.path.join(root, 'tools/v2/portrait_src'), os.path.join(root, 'assets/v2/portraits')
os.makedirs(out, exist_ok=True)
total = 0
for f in sorted(glob.glob(os.path.join(src, '*.webp'))):
    im = Image.open(f).convert('RGBA')
    h = round(im.height * W / im.width)
    im = im.resize((W, h), Image.LANCZOS)
    o = os.path.join(out, os.path.basename(f))
    im.save(o, 'WEBP', quality=Q, method=6, alpha_quality=90)
    total += os.path.getsize(o)
    print(f'{os.path.basename(f):24s} {W}x{h}  {os.path.getsize(o) / 1024:6.1f} KB')
print(f'total {total / 1048576:.2f} MB')
