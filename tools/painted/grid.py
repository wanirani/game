#!/usr/bin/env python3
"""피벗/폴리곤 격자 도우미: 원본(또는 매트) 이미지 위에 좌표 격자와 설정의 컷 정보를 겹쳐 그린다.

사용:
  python3 tools/painted/grid.py <id> <원본이름> [x0 y0 x1 y1] [--step 50] [--scale 1] [--matte] [--out 파일]
    → .work/<id>/grid_<원본이름>.jpg
  겹쳐 그리는 것 (설정에 있으면):
    - 부품 box(노랑) · 피벗(청록 점+이름) · 점 목록(주황 선) · 마스크/펀치 폴리곤(자홍)
    - 체인: 관절 x(빨강 세로선), top/bot/axis/spineCut(초록 가로선)
    - 파편: box(파랑)
  --matte : 매트 결과(RGBA)를 두 색 바탕(어두운 갈색 | 자홍)에 합성해 테두리 잔여물을 확인
  좌표는 항상 원본 픽셀 좌표. 격자 굵은 선 = step×4.
"""
import sys, os
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from matte import load_config, raw_path  # noqa: E402


def main(argv):
    opts = {'step': 50, 'scale': 1.0, 'matte': False, 'out': None}
    pos = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--step': opts['step'] = int(argv[i + 1]); i += 2; continue
        if a == '--scale': opts['scale'] = float(argv[i + 1]); i += 2; continue
        if a == '--out': opts['out'] = argv[i + 1]; i += 2; continue
        if a == '--matte': opts['matte'] = True; i += 1; continue
        pos.append(a); i += 1
    if len(pos) < 2:
        print(__doc__); return 1
    cfg = load_config(pos[0]); name = pos[1]
    if opts['matte']:
        m = Image.open(os.path.join(cfg['_work'], 'matte', name + '.png')).convert('RGBA')
        bg = Image.new('RGBA', m.size, (40, 30, 26, 255)); d0 = ImageDraw.Draw(bg)
        d0.rectangle([m.size[0] // 2, 0, m.size[0], m.size[1]], fill=(200, 40, 160, 255))
        bg.alpha_composite(m); im = bg
    else:
        im = Image.open(raw_path(cfg, name)).convert('RGBA')
    W, H = im.size
    x0, y0, x1, y1 = (int(v) for v in pos[2:6]) if len(pos) >= 6 else (0, 0, W, H)
    sc, step = opts['scale'], opts['step']
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for p in cfg.get('parts', []):
        if p['src'] != name: continue
        if 'box' in p: d.rectangle(p['box'], outline=(255, 230, 0, 255), width=3)
        for k, (px, py) in p.get('pivots', {}).items():
            d.ellipse([px - 7, py - 7, px + 7, py + 7], outline=(0, 255, 255, 255), width=3); d.text((px + 9, py - 7), k, fill=(0, 255, 255, 255))
        for k, pts in p.get('points', {}).items():
            d.line([tuple(q) for q in pts], fill=(255, 150, 0, 255), width=3); d.text(tuple(pts[0]), k, fill=(255, 150, 0, 255))
    for src, cut in cfg.get('cuts', {}).items():
        if src != name: continue
        for mk, ops in cut.get('masks', {}).items():
            for op in ops:
                if op.get('op') == 'poly':
                    d.polygon([tuple(q) for q in op['pts']], outline=(255, 0, 255, 255)); d.text(tuple(op['pts'][0]), 'mask:' + mk, fill=(255, 0, 255, 255))
        for pu in cut.get('punch', []):
            if 'poly' in pu: d.polygon([tuple(q) for q in pu['poly']], outline=(255, 90, 255, 255)); d.text(tuple(pu['poly'][0]), 'punch', fill=(255, 90, 255, 255))
    for c in cfg.get('chains', []):
        if c['src'] != name: continue
        for j, x in enumerate(c['joints']):
            d.line([(x, 0), (x, H)], fill=(255, 40, 40, 255), width=3); d.text((x + 4, 4), f'J{j}={x}', fill=(255, 60, 60, 255))
        for k in ('top', 'bot', 'axis', 'spineCut'):
            if k in c: d.line([(0, c[k]), (W, c[k])], fill=(60, 255, 60, 255), width=2); d.text((4, c[k] + 2), f'{k}={c[k]}', fill=(60, 255, 60, 255))
    for db in cfg.get('debris', []):
        if db['src'] != name: continue
        for j, b in enumerate(db.get('boxes', [])):
            d.rectangle(b, outline=(80, 140, 255, 255), width=3); d.text((b[0] + 4, b[1] + 4), f'deb{j}', fill=(80, 160, 255, 255))
    im = Image.alpha_composite(im, ov).crop((x0, y0, x1, y1))
    if sc != 1: im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
    g = ImageDraw.Draw(im)
    for x in range((x0 // step + 1) * step, x1, step):
        X = (x - x0) * sc; big = x % (step * 4) == 0
        g.line([(X, 0), (X, im.height)], fill=(255, 255, 0, 200) if big else (255, 255, 255, 70), width=1)
        if big or step * sc >= 40: g.text((X + 2, 2), str(x), fill=(255, 255, 0, 255))
    for y in range((y0 // step + 1) * step, y1, step):
        Y = (y - y0) * sc; big = y % (step * 4) == 0
        g.line([(0, Y), (im.width, Y)], fill=(255, 255, 0, 200) if big else (255, 255, 255, 70), width=1)
        if big or step * sc >= 40: g.text((2, Y + 2), str(y), fill=(255, 255, 0, 255))
    out = opts['out'] or os.path.join(cfg['_work'], f'grid_{name}.jpg')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.convert('RGB').save(out, quality=88)
    print(out)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
