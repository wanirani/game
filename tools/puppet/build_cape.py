#!/usr/bin/env python3
"""망토 벨벳 결 텍스처 (공용): 클링 망토 원화의 천 부분 → 회색조 하이패스 → assets/puppets/_shared/cape_tex.webp
런타임은 망토 색으로 칠한 뒤 이 텍스처를 overlay 로 겹친다 (색은 look.cape 가 정함).
  python3 tools/puppet/build_cape.py [--box x0,y0,x1,y1]"""
import argparse, os, sys
import numpy as np, cv2
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.pup import SRC, OUT, ensure, rgb_of

ap = argparse.ArgumentParser()
ap.add_argument('--src', default='_shared/cape_velvet')
ap.add_argument('--box', default='40,980,500,1540')
a = ap.parse_args()
rgb = rgb_of(os.path.join(SRC, a.src + '.webp'))
x0, y0, x1, y1 = map(int, a.box.split(','))
g = rgb[y0:y1, x0:x1].astype(np.float32).max(2)            # 붉은 천이라 max 채널이 명암을 잘 담는다
lo = cv2.GaussianBlur(g, (0, 0), 40)
hp = g - lo
hp = hp / (hp.std() + 1e-3) * 38 + 128
hp = cv2.GaussianBlur(np.clip(hp, 0, 255), (0, 0), 1.0)
im = Image.fromarray(hp.astype(np.uint8), 'L').resize((320, 420), Image.LANCZOS)
d = ensure(os.path.join(OUT, '_shared'))
p = os.path.join(d, 'cape_tex.webp')
im.convert('RGB').save(p, 'WEBP', quality=80, method=6)
print(p, os.path.getsize(p) // 1024, 'KB')
