#!/usr/bin/env python3
"""부품 시트: 아틀라스 + manifest 로 모든 부품을 두 색 바탕(어두운 갈색 | 자홍) 위에 늘어놓고 피벗/점에 이름표를 단다.

사용:  python3 tools/painted/sheet.py <id> [--out 파일] [--scale 1]
출력:  .work/<id>/parts_sheet.png  (검수: 매트 잔여물, 피벗 위치, 크기 비율, 누락 부품)
  - 청록 점 = 피벗, 주황 선 = 점 목록, 노란 글씨 = 부품 이름 · 크기(텍셀) · 논리 px
  - 그룹(vert/spine/cap/debris 등)마다 줄을 바꾼다
"""
import json, os, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from matte import load_config, ROOT  # noqa: E402


def main(argv):
    if not argv:
        print(__doc__); return 1
    cfg = load_config(argv[0])
    out = argv[argv.index('--out') + 1] if '--out' in argv else os.path.join(cfg['_work'], 'parts_sheet.png')
    sc = float(argv[argv.index('--scale') + 1]) if '--scale' in argv else 1.0
    d0 = os.path.join(ROOT, cfg['out'])
    man = json.load(open(os.path.join(d0, 'manifest.json'), encoding='utf-8'))
    atlas = Image.open(os.path.join(d0, man['atlas']['file'] + '.webp')).convert('RGBA')
    td = man['td']
    grouped = set(n for g in man.get('groups', {}).values() for n in g)
    rows = [[n for n in man['parts'] if n not in grouped]] + [g for g in man.get('groups', {}).values()]
    W = 1900; gap = 18
    # 배치 계산
    lay = []; x = y = rowh = 0
    for row in rows:
        if not row: continue
        for n in row:
            e = man['parts'][n]; w, h = int(e['w'] * sc), int(e['h'] * sc)
            if x + w > W: x = 0; y += rowh + 30; rowh = 0
            lay.append((n, x + 10, y + 10, w, h)); x += w + gap; rowh = max(rowh, h + 12)
        x = 0; y += rowh + 40; rowh = 0
    H = y + 20
    sheet = Image.new('RGBA', (W + 20, H), (40, 30, 26, 255))
    dd = ImageDraw.Draw(sheet)
    dd.rectangle([(W + 20) // 2, 0, W + 20, H], fill=(190, 40, 150, 255))
    for n, px, py, w, h in lay:
        e = man['parts'][n]
        im = atlas.crop((e['x'], e['y'], e['x'] + e['w'], e['y'] + e['h']))
        if sc != 1: im = im.resize((w, h), Image.LANCZOS)
        sheet.alpha_composite(im, (px, py))
    d = ImageDraw.Draw(sheet)
    for n, px, py, w, h in lay:
        e = man['parts'][n]
        d.rectangle([px, py, px + w, py + h], outline=(255, 255, 255, 60))
        for k, v in e.items():
            if k in ('x', 'y', 'w', 'h'): continue
            if isinstance(v, list) and len(v) == 2 and isinstance(v[0], (int, float)):
                qx, qy = px + v[0] * sc, py + v[1] * sc
                d.ellipse([qx - 4, qy - 4, qx + 4, qy + 4], outline=(0, 255, 255, 255), width=2); d.text((qx + 5, qy - 5), k, fill=(0, 255, 255, 255))
            elif isinstance(v, list) and v and isinstance(v[0], list):
                d.line([(px + q[0] * sc, py + q[1] * sc) for q in v], fill=(255, 150, 0, 255), width=2)
        d.text((px, py + h + 1), f"{n} {e['w']}x{e['h']} ({e['w'] / td:.0f}x{e['h'] / td:.0f}px)", fill=(255, 255, 0, 255))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.convert('RGB').save(out)
    print(out)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
