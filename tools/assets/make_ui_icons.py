#!/usr/bin/env python3
"""웹 앱 아이콘·파비콘·설치 화면 스크린샷 만들기 — owner: PLAT-BOOT (platform.md §9.3, P-27)

원본은 assets/ui/icon-512.png (금테 두른 십자가 아이콘; APK 런처 아이콘도 이 파일에서 만든다 → 이 스크립트는 원본을 고치지 않는다).

만드는 것 (assets/ui/):
  icon-180.png           iOS 홈 화면 (apple-touch-icon). iOS 가 모서리를 둥글게 자르므로 금테 없이 꽉 채우고 불투명
  icon-maskable-512.png  안드로이드 적응형 아이콘 (manifest purpose "maskable"). 그림 전체가 가운데 지름 80% 원(안전 영역) 안
  favicon-32.png         브라우저 탭 아이콘 (십자가만 크게)
  screenshot-title.webp, screenshot-stage.webp   manifest screenshots (1280×720, form_factor "wide")
      → --shots 타이틀.png 스테이지.png 로 준 캡처(1280×720 권장)를 webp 로 줄여 저장한다. 없으면 기존 파일을 그대로 둔다.

사용법:
  python3 tools/assets/make_ui_icons.py                      아이콘 3종 다시 만들기
  python3 tools/assets/make_ui_icons.py --shots a.png b.png  스크린샷 2장도 갱신
  python3 tools/assets/make_ui_icons.py --check              결과물이 있고 크기·규격이 맞는지만 검사 (종료 코드 1 = 문제)
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UI = os.path.join(ROOT, 'assets', 'ui')
SRC = os.path.join(UI, 'icon-512.png')
BG = (5, 2, 7)            # css --bg, 원본 아이콘 바탕색
BORDER = 12               # 원본의 금테(2–9 px)를 넉넉히 잘라 낸다
SHOT_W, SHOT_H = 1280, 720
SHOT_NAMES = ('screenshot-title.webp', 'screenshot-stage.webp')
MAX_SHOT_BYTES = 220 * 1024


def interior():
    """금테 안쪽 그림 (붉은 후광 + 십자가) 과 그림(밝은 부분)의 중심·반지름"""
    im = Image.open(SRC).convert('RGB')
    w, h = im.size
    inner = im.crop((BORDER, BORDER, w - BORDER, h - BORDER))
    a = np.asarray(inner).astype(np.int32)
    mask = a.max(axis=2) > 120            # 금빛 십자가·보석·해골·붉은 구슬 (후광은 대부분 이 값 아래)
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        raise SystemExit('icon-512.png 에서 그림을 찾지 못했습니다')
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    r = float(np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max())
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    return inner, (cx, cy), r, box


def feather(size, edge):
    """가장자리 edge px 를 부드럽게 흐리는 알파 (붙여 넣을 때 이음새가 보이지 않게)"""
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)).astype(np.float32)
    a = np.clip(d / max(1, edge), 0, 1)
    return Image.fromarray((a * 255).astype(np.uint8), 'L')


def compose(size, radius_frac, inner, center, r):
    """그림의 가장 먼 점이 (size × radius_frac) 안에 들도록 줄여 가운데에 놓는다"""
    s = (radius_frac * size) / r
    sw, sh = max(1, round(inner.width * s)), max(1, round(inner.height * s))
    scaled = inner.resize((sw, sh), Image.LANCZOS)
    canvas = Image.new('RGB', (size, size), BG)
    ox, oy = round(size / 2 - center[0] * s), round(size / 2 - center[1] * s)
    canvas.paste(scaled, (ox, oy), feather(scaled.size, max(2, round(min(sw, sh) * 0.05))))
    return canvas


def favicon(inner, box, size=32):
    x0, y0, x1, y1 = box
    side = max(x1 - x0, y1 - y0)
    pad = round(side * 0.04)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half = side / 2 + pad
    crop = Image.new('RGB', (round(half * 2), round(half * 2)), BG)
    crop.paste(inner, (round(half - cx), round(half - cy)))
    # 두 단계로 줄여 가는 선이 뭉개지지 않게
    mid = crop.resize((size * 4, size * 4), Image.LANCZOS)
    out = mid.resize((size, size), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=2))
    return out


def save_png(im, name):
    p = os.path.join(UI, name)
    im.save(p, 'PNG', optimize=True)
    print(f'  {name}  {im.size[0]}×{im.size[1]}  {os.path.getsize(p) // 1024} KB')


def make_icons():
    inner, center, r, box = interior()
    print(f'원본 그림: 중심 {center[0]:.0f},{center[1]:.0f}  반지름 {r:.0f}px')
    save_png(compose(512, 0.40 * 0.94, inner, center, r), 'icon-maskable-512.png')  # 안전 영역(반지름 40%) 안쪽 94%
    save_png(compose(180, 0.46, inner, center, r), 'icon-180.png')
    save_png(favicon(inner, box), 'favicon-32.png')


def make_shots(paths):
    if len(paths) != len(SHOT_NAMES):
        raise SystemExit(f'--shots 에는 캡처 {len(SHOT_NAMES)}장이 필요합니다 (타이틀, 스테이지)')
    for src, name in zip(paths, SHOT_NAMES):
        im = Image.open(src).convert('RGB')
        if im.size != (SHOT_W, SHOT_H):
            # 16:9 로 가운데를 잘라 1280×720 으로 맞춘다
            k = max(SHOT_W / im.width, SHOT_H / im.height)
            im = im.resize((math.ceil(im.width * k), math.ceil(im.height * k)), Image.LANCZOS)
            x, y = (im.width - SHOT_W) // 2, (im.height - SHOT_H) // 2
            im = im.crop((x, y, x + SHOT_W, y + SHOT_H))
        p = os.path.join(UI, name)
        for q in (80, 72, 64, 56):
            im.save(p, 'WEBP', quality=q, method=6)
            if os.path.getsize(p) <= MAX_SHOT_BYTES:
                break
        print(f'  {name}  {SHOT_W}×{SHOT_H}  q{q}  {os.path.getsize(p) // 1024} KB')


def check():
    bad = []
    want = {'icon-192.png': (192, 192), 'icon-512.png': (512, 512), 'icon-maskable-512.png': (512, 512),
            'icon-180.png': (180, 180), 'favicon-32.png': (32, 32),
            SHOT_NAMES[0]: (SHOT_W, SHOT_H), SHOT_NAMES[1]: (SHOT_W, SHOT_H)}
    for name, size in want.items():
        p = os.path.join(UI, name)
        if not os.path.exists(p):
            bad.append(f'{name}: 없음')
            continue
        im = Image.open(p)
        if im.size != size:
            bad.append(f'{name}: {im.size} (필요: {size})')
        if name in ('icon-180.png', 'icon-maskable-512.png') and im.mode not in ('RGB', 'P', 'L'):
            a = np.asarray(im.convert('RGBA'))[..., 3]
            if a.min() < 255:
                bad.append(f'{name}: 투명한 부분이 있음 (불투명해야 함)')
        if name.endswith('.webp') and os.path.getsize(p) > MAX_SHOT_BYTES:
            bad.append(f'{name}: {os.path.getsize(p) // 1024} KB > {MAX_SHOT_BYTES // 1024} KB')
    # maskable: 안전 원(반지름 40%) 밖에는 바탕색만
    p = os.path.join(UI, 'icon-maskable-512.png')
    if os.path.exists(p):
        a = np.asarray(Image.open(p).convert('RGB')).astype(np.int32)
        yy, xx = np.mgrid[0:512, 0:512]
        outside = np.sqrt((xx - 255.5) ** 2 + (yy - 255.5) ** 2) > 0.40 * 512
        bright = a.max(axis=2) > 120
        n = int((outside & bright).sum())
        if n:
            bad.append(f'icon-maskable-512.png: 안전 영역 밖에 그림 {n}px')
    for b in bad:
        print('✗', b)
    if not bad:
        print('✓ 아이콘·파비콘·스크린샷 모두 규격에 맞습니다')
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--shots', nargs='+', help='타이틀·스테이지 캡처 PNG 2장')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--no-icons', action='store_true', help='아이콘은 두고 스크린샷만 갱신')
    a = ap.parse_args()
    if a.check:
        sys.exit(check())
    if not a.no_icons:
        make_icons()
    if a.shots:
        make_shots(a.shots)
    sys.exit(check())


if __name__ == '__main__':
    main()
