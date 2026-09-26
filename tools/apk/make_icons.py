#!/usr/bin/env python3
"""안드로이드 런처 아이콘 생성: assets/ui/icon-512.png → res/mipmap-*/

사용법: python3 tools/apk/make_icons.py <icon-512.png> <출력 res 디렉터리>

만드는 것 (밀도별 mdpi~xxxhdpi):
  ic_launcher.png             구형 런처용: 금테 둥근 사각형 밖을 투명 처리
  ic_launcher_round.png       원형 런처용: 가운데를 원형으로 잘라 금테를 두른 것
  ic_launcher_foreground.png  적응형(API 26+) 전경: 금테 안쪽 그림을 72dp 안전 영역에 맞추고 가장자리를 배경색으로 페이드
적응형 배경은 res/values/colors.xml 의 bn_icon_background(#050207) 단색.
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw

DENS = {'mdpi': 1.0, 'hdpi': 1.5, 'xhdpi': 2.0, 'xxhdpi': 3.0, 'xxxhdpi': 4.0}
BG = (5, 2, 7)
GOLD = (232, 200, 114)
SS = 4  # 마스크 슈퍼샘플링 배율


def rrect_mask(size, inset, radius):
    """size×size 안티앨리어싱 둥근 사각형 마스크 (inset/radius 는 512 기준)"""
    big = size * SS
    k = big / 512.0
    m = Image.new('L', (big, big), 0)
    ImageDraw.Draw(m).rounded_rectangle([inset * k, inset * k, big - 1 - inset * k, big - 1 - inset * k], radius=radius * k, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def circle_mask(size, inset_frac):
    big = size * SS
    m = Image.new('L', (big, big), 0)
    p = big * inset_frac
    ImageDraw.Draw(m).ellipse([p, p, big - 1 - p, big - 1 - p], fill=255)
    return m.resize((size, size), Image.LANCZOS)


def radial_fade(size, inner, outer):
    """중심에서 반지름 inner(비율)까지 불투명, outer 까지 선형으로 투명"""
    m = Image.new('L', (size, size), 0)
    px = m.load()
    c = (size - 1) / 2.0
    for y in range(size):
        for x in range(size):
            r = (((x - c) ** 2 + (y - c) ** 2) ** 0.5) / (size / 2.0)
            a = 1.0 if r <= inner else (0.0 if r >= outer else 1.0 - (r - inner) / (outer - inner))
            px[x, y] = int(255 * a)
    return m


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    src, out = sys.argv[1], sys.argv[2]
    icon = Image.open(src).convert('RGBA')
    if icon.size != (512, 512):
        icon = icon.resize((512, 512), Image.LANCZOS)

    # 1) 구형 아이콘: 금테(바깥 경계 inset 2px, 반지름 ~64px) 밖을 투명하게
    legacy = icon.copy()
    legacy.putalpha(ImageChops.multiply(icon.getchannel('A'), rrect_mask(512, 2, 64)))

    # 2) 금테 안쪽 그림 (inset 12px)
    inner = icon.crop((12, 12, 500, 500))  # 488×488

    # 3) 원형 아이콘: 안쪽 그림을 원으로 자르고 금테 링
    rs = 512
    round_img = Image.new('RGBA', (rs, rs), BG + (0,))
    art = inner.resize((rs, rs), Image.LANCZOS)
    round_img.paste(art, (0, 0))
    round_img.putalpha(circle_mask(rs, 0.004))
    ring = Image.new('RGBA', (rs * SS, rs * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring)
    w = 9 * SS
    d.ellipse([w / 2, w / 2, rs * SS - 1 - w / 2, rs * SS - 1 - w / 2], outline=GOLD + (255,), width=w)
    ring = ring.resize((rs, rs), Image.LANCZOS)
    round_img = Image.alpha_composite(round_img, ring)

    # 4) 적응형 전경 (108dp 캔버스, 그림은 가운데 ~75dp → 십자가·해골이 66dp 안전 원 안에 들어온다)
    fs = 432
    art_px = 324
    fg = Image.new('RGBA', (fs, fs), (0, 0, 0, 0))
    a = inner.resize((art_px, art_px), Image.LANCZOS)
    a.putalpha(ImageChops.multiply(a.getchannel('A'), radial_fade(art_px, 0.80, 1.0)))
    fg.paste(a, ((fs - art_px) // 2, (fs - art_px) // 2), a)

    for name, f in DENS.items():
        dpath = os.path.join(out, 'mipmap-' + name)
        os.makedirs(dpath, exist_ok=True)
        s48 = int(round(48 * f))
        s108 = int(round(108 * f))
        legacy.resize((s48, s48), Image.LANCZOS).save(os.path.join(dpath, 'ic_launcher.png'), optimize=True)
        round_img.resize((s48, s48), Image.LANCZOS).save(os.path.join(dpath, 'ic_launcher_round.png'), optimize=True)
        fg.resize((s108, s108), Image.LANCZOS).save(os.path.join(dpath, 'ic_launcher_foreground.png'), optimize=True)
    print('icons ->', out)


if __name__ == '__main__':
    main()
