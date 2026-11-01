#!/usr/bin/env python3
"""녹색 배경(#00FF00) 그림 → 투명 PNG (Higgsfield 생성 그림용).

  python3 tools/higgsfield/key_green.py IN.png OUT.png [--size 128] [--pad 0.04] [--trim]

- 녹색 우세도(g - max(r, b))로 알파를 만들고, 테두리 녹색 번짐(spill)을 걷어낸다.
- --size N   : 정사각 N×N 으로 맞춘다 (아이콘). 없으면 원래 크기 유지.
- --trim     : 투명 테두리를 잘라낸다 (--size 와 함께 쓰면 잘라낸 뒤 가운데 맞춤).
- --pad R    : --size 일 때 가장자리 여백 비율 (기본 0.04).
기존 아이콘(assets/icons/*.png)은 128×128 RGBA.
"""
import sys, argparse
from PIL import Image
import numpy as np

def key(im, lo=0.08, span=0.35):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gd = g - np.maximum(r, b)
    alpha = np.clip(1 - (gd - lo) / span, 0, 1)
    g2 = np.minimum(g, np.maximum(r, b) + 0.02)          # despill
    # 반투명 가장자리는 어둡게 기운 녹색이 남기 쉬워 한 번 더 누른다
    edge = (alpha > 0) & (alpha < 1)
    g2 = np.where(edge, np.minimum(g2, (r + b) / 2 + 0.02), g2)
    out = np.dstack([r, g2, b, alpha])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--size', type=int, default=0)
    ap.add_argument('--pad', type=float, default=0.04)
    ap.add_argument('--trim', action='store_true')
    o = ap.parse_args()
    im = key(Image.open(o.src))
    if o.trim or o.size:
        bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
        if bb: im = im.crop(bb)
    if o.size:
        s = max(im.size); s2 = int(round(s * (1 + 2 * o.pad)))
        c = Image.new('RGBA', (s2, s2), (0, 0, 0, 0)); c.paste(im, ((s2 - im.width) // 2, (s2 - im.height) // 2))
        im = c.resize((o.size, o.size), Image.LANCZOS)
    im.save(o.dst)
    print(o.dst, im.size)

if __name__ == '__main__':
    main()
