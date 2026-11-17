#!/usr/bin/env python3
"""envkit_compare.mjs 가 찍은 b_*/c_* 를 나란히 붙인다 (왼쪽 B · 오른쪽 꾸민 배경) → cmp_<n>_<이름>.png (폭 2000)."""
import sys, glob, os
from PIL import Image, ImageDraw
d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/v2/envkit'
for b in sorted(glob.glob(os.path.join(d, 'b_*.png'))):
    c = os.path.join(d, 'c_' + os.path.basename(b)[2:])
    if not os.path.exists(c): continue
    A, B = Image.open(b).convert('RGB'), Image.open(c).convert('RGB')
    w = 996; h = round(A.height * w / A.width)
    out = Image.new('RGB', (w * 2 + 8, h + 30), (12, 12, 16))
    out.paste(A.resize((w, h), Image.LANCZOS), (0, 30)); out.paste(B.resize((w, h), Image.LANCZOS), (w + 8, 30))
    g = ImageDraw.Draw(out); g.text((10, 8), 'B (v2b) - flat boxes + cards', fill=(230, 220, 200)); g.text((w + 18, 8), 'C (v2c) - environment kit', fill=(230, 220, 200))
    p = os.path.join(d, 'cmp_' + os.path.basename(b)[2:]); out.save(p, optimize=True); print(p)
