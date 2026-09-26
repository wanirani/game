#!/usr/bin/env python3
"""리그 작성 도우미: 원화 위에 좌표 격자 + (선택) 리그 테이블의 관절·영역을 겹쳐 그린다.
  python3 tools/puppet/grid.py <rig.json | 이미지.webp> [-o out.jpg] [--crop x0,y0,x1,y1] [--scale 0.5] [--step 50]
                                 [--show joints,regions] [--only head,pony] [--src kael/kael_hunter_hands] [--alpha]
예) 머리 영역만 확대해 확인:   grid.py rigs/kael/kael_templar.json --crop 350,150,1100,750 --scale 1 --only head,pony,neckCap
    손 시트 좌표 읽기:          grid.py src/kael/kael_hunter_hands.webp --step 100 --scale 0.5
    다른 원화에 헌터 리그 대보기: grid.py rigs/kael/kael_hunter.json --src kael/kael_templar_side
노란 굵은 선 = step×4 간격(번호), 흰 선 = step. 관절 = 빨간 점 + 이름, 영역 = 색 윤곽선 + 이름.
--alpha: rembg 알파 밖을 초록으로 칠해 컷 품질을 함께 본다."""
import argparse, os, sys, colorsys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.pup import SRC, smooth_pts, DBG, ensure
from build_rig import load_rig

ap = argparse.ArgumentParser()
ap.add_argument('target')
ap.add_argument('-o', '--out', default=None)
ap.add_argument('--crop', default=None)
ap.add_argument('--scale', type=float, default=0.5)
ap.add_argument('--step', type=int, default=50)
ap.add_argument('--show', default='joints,regions')
ap.add_argument('--only', default=None)
ap.add_argument('--src', default=None, help='다른 원화(src 기준 키)에 리그를 겹쳐 보기')
ap.add_argument('--alpha', action='store_true')
a = ap.parse_args()

rig = None
if a.target.endswith('.json'):
    rig = load_rig(a.target)
    key = a.src or rig['src']
    path = os.path.join(SRC, key + '.webp')
else:
    key = a.src
    path = a.target if not a.src else os.path.join(SRC, a.src + '.webp')
im = Image.open(path).convert('RGBA')
if a.alpha:
    ap_ = path.replace('.webp', '_alpha.png')
    if os.path.exists(ap_):
        al = Image.open(ap_).convert('L')
        bg = Image.new('RGBA', im.size, (40, 150, 60, 255))
        bg.paste(im, (0, 0), al)
        im = bg
W, H = im.size
x0, y0, x1, y1 = (0, 0, W, H) if not a.crop else tuple(int(v) for v in a.crop.split(','))
sc, step = a.scale, a.step
cr = im.crop((x0, y0, x1, y1)).resize((max(1, int((x1 - x0) * sc)), max(1, int((y1 - y0) * sc))), Image.LANCZOS).convert('RGB')
d = ImageDraw.Draw(cr, 'RGBA')
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', max(11, int(13 * min(1.5, max(0.8, sc * 1.6)))))
except Exception:
    font = ImageFont.load_default()
T = lambda x, y: ((x - x0) * sc, (y - y0) * sc)
for x in range((x0 // step + 1) * step, x1, step):
    X = (x - x0) * sc
    major = x % (step * 4) == 0
    d.line([(X, 0), (X, cr.size[1])], fill=(255, 230, 0, 200) if major else (255, 255, 255, 70), width=1)
    if major:
        d.text((X + 2, 2), str(x), fill=(255, 230, 0, 255), font=font)
for y in range((y0 // step + 1) * step, y1, step):
    Y = (y - y0) * sc
    major = y % (step * 4) == 0
    d.line([(0, Y), (cr.size[0], Y)], fill=(255, 230, 0, 200) if major else (255, 255, 255, 70), width=1)
    if major:
        d.text((2, Y + 2), str(y), fill=(255, 230, 0, 255), font=font)
only = set(a.only.split(',')) if a.only else None
show = set(a.show.split(','))
if rig and 'regions' in show:
    regs = rig.get('regions', {})
    for i, (name, r) in enumerate(regs.items()):
        if r is None or (only and name not in only):
            continue
        if isinstance(r, dict) and 'rect' in r:
            rx0, ry0, rx1, ry1 = r['rect']; pts = [[rx0, ry0], [rx1, ry0], [rx1, ry1], [rx0, ry1]]; smooth = 0
        else:
            pts = r['pts'] if isinstance(r, dict) else r
            smooth = r.get('smooth', 0) if isinstance(r, dict) else 0
        P = smooth_pts(pts, smooth) if smooth else pts
        hue = (i * 0.137) % 1
        cc = tuple(int(v * 255) for v in colorsys.hsv_to_rgb(hue, 0.9, 1))
        d.line([T(*p) for p in P] + [T(*P[0])], fill=cc + (255,), width=2)
        for p in pts:
            X, Y = T(*p); d.ellipse([X - 2, Y - 2, X + 2, Y + 2], fill=cc + (255,))
        cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
        X, Y = T(cx, cy)
        d.text((X - 10, Y - 6), name, fill=cc + (255,), font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))
if rig and 'joints' in show:
    for name, v in rig.get('joints', {}).items():
        if isinstance(v, (int, float)):
            X, Y = T(x0 + 10, v); d.line([(0, Y), (cr.size[0], Y)], fill=(255, 60, 60, 200), width=1)
            d.text((X, Y - 14), f'{name}={v}', fill=(255, 90, 90, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))
            continue
        X, Y = T(*v)
        d.ellipse([X - 4, Y - 4, X + 4, Y + 4], fill=(255, 40, 40, 255), outline=(0, 0, 0, 255))
        d.text((X + 6, Y - 6), name, fill=(255, 120, 120, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))
out = a.out or os.path.join(ensure(DBG), 'grid.jpg')
cr.save(out, quality=90)
print(out, cr.size)
