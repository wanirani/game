#!/usr/bin/env python3
"""클링 결과(PNG) → 원화 소스 등록.
  python3 tools/puppet/ingest.py <클링.png> <charId> <이름> [--no-wm] [--jpg 업로드용.jpg]
  예) ingest.py /tmp/dl/side.png kael kael_crusader_side
결과: tools/puppet/src/<charId>/<이름>.webp (q95, 워터마크 제거) + <이름>_alpha.png (rembg, 캐시·커밋)
--jpg: 다음 img2img 입력으로 올릴 JPEG(q94) 사본을 만든다 (클링 업로드는 PNG/JPG 만 허용)."""
import argparse, os
import numpy as np
from PIL import Image
from lib.pup import SRC, ensure, rgb_of, remove_watermark, rembg_alpha

ap = argparse.ArgumentParser()
ap.add_argument('png'); ap.add_argument('char'); ap.add_argument('name')
ap.add_argument('--no-wm', action='store_true', help='워터마크 제거 생략')
ap.add_argument('--no-alpha', action='store_true', help='rembg 알파 생략(턴어라운드 시트는 build_turn 이 따로 만든다)')
ap.add_argument('--jpg', default=None)
a = ap.parse_args()
rgb = rgb_of(a.png)
if not a.no_wm:
    rgb = remove_watermark(rgb)
d = ensure(os.path.join(SRC, a.char))
out = os.path.join(d, a.name + '.webp')
Image.fromarray(rgb).save(out, 'WEBP', quality=95, method=6)
print('saved', out, rgb.shape[1], 'x', rgb.shape[0], os.path.getsize(out) // 1024, 'KB')
if not a.no_alpha:
    al = rembg_alpha(rgb)
    ap_ = os.path.join(d, a.name + '_alpha.png')
    Image.fromarray(al, 'L').save(ap_, optimize=True)
    print('alpha', ap_, os.path.getsize(ap_) // 1024, 'KB')
if a.jpg:
    Image.fromarray(rgb).save(a.jpg, 'JPEG', quality=94)
    print('jpg', a.jpg, os.path.getsize(a.jpg) // 1024, 'KB')
