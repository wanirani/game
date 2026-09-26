#!/usr/bin/env python3
"""
블러드 녹턴 글꼴 빌드: Google Fonts 원본(OFL)을 받아 게임에 쓰인 글자만 남겨 woff2 로 만든다.

  python3 tools/fonts/build_fonts.py            # 전부 다시 만들기
  python3 tools/fonts/build_fonts.py --list     # 글자 수·크기만 보기

- 한글 글꼴: src/**/*.js · index.html 등에 실제로 쓰인 모든 글자 + KS X 1001 한글 2350자
  (+ 한글 호환 자모) → 이름 입력 등 새 글자도 대부분 그대로 나온다.
- 라틴 글꼴: ASCII + Latin-1 + 게임에 쓰인 비한글 기호 중 글꼴에 있는 것.
- 결과: assets/fonts/*.woff2, assets/fonts/OFL.txt (라이선스 모음), assets/fonts/fonts.json (목록)
- css/style.css 의 @font-face 가 이 파일 이름을 가리킨다. 파일 이름을 바꾸면 CSS 와 index.html 의 preload 도 같이 바꾼다.

필요: pip install fonttools brotli
원본 캐시: 환경변수 FONT_CACHE (기본 ~/.cache/blood-nocturne-fonts)
"""
import glob
import json
import os
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'fonts')
CACHE = os.environ.get('FONT_CACHE', os.path.expanduser('~/.cache/blood-nocturne-fonts'))
GF = 'https://raw.githubusercontent.com/google/fonts/main/'

# family: CSS 이름, src: google/fonts 경로, out: 결과 파일, kind: ko|latin, wght: 가변 글꼴 굵기 범위 제한
FONTS = [
    # 본문·UI (가독성) — 가변 굵기 400~900
    dict(family='Noto Sans KR', src='ofl/notosanskr/NotoSansKR[wght].ttf', out='noto-sans-kr.woff2', kind='ko', wght=(400, 900)),
    # 고딕 세리프 제목 + 피 글씨 한글 — 가변 굵기 600~900
    dict(family='Hahmlet', src='ofl/hahmlet/Hahmlet[wght].ttf', out='hahmlet.woff2', kind='ko', wght=(600, 900)),
    # 블랙레터 (영문 제목·피 글씨) — 가변 굵기 700~900
    dict(family='Grenze Gotisch', src='ofl/grenzegotisch/GrenzeGotisch[wght].ttf', out='grenze-gotisch.woff2', kind='latin', wght=(700, 900)),
    # 숫자·점수 — 가변 굵기 600~900
    dict(family='Cinzel', src='ofl/cinzel/Cinzel[wght].ttf', out='cinzel.woff2', kind='latin', wght=(600, 900)),
    # 타이틀 로고 (기존 코드 호환)
    dict(family='Cinzel Decorative', src='ofl/cinzeldecorative/CinzelDecorative-Black.ttf', out='cinzel-decorative-900.woff2', kind='latin'),
]

TEXT_GLOBS = ['src/**/*.js', 'index.html', 'tools/artifact/*.html', 'manifest.webmanifest']


def fetch(rel):
    os.makedirs(CACHE, exist_ok=True)
    dst = os.path.join(CACHE, rel.replace('/', '__'))
    if not os.path.exists(dst) or os.path.getsize(dst) < 1000:
        url = GF + rel.replace('[', '%5B').replace(']', '%5D')
        print('  download', url)
        with urllib.request.urlopen(url, timeout=120) as r, open(dst, 'wb') as f:
            f.write(r.read())
    return dst


def game_chars():
    chars = set()
    for g in TEXT_GLOBS:
        for f in glob.glob(os.path.join(ROOT, g), recursive=True):
            with open(f, encoding='utf-8') as fh:
                chars |= set(fh.read())
    return chars


def ksx1001_hangul():
    out = set()
    for lead in range(0xB0, 0xC9):
        for trail in range(0xA1, 0xFF):
            try:
                out.add(bytes([lead, trail]).decode('euc-kr'))
            except UnicodeDecodeError:
                pass
    assert len(out) == 2350, len(out)
    return out


def base_latin():
    s = {chr(c) for c in range(0x20, 0x7F)} | {chr(c) for c in range(0xA0, 0x100)}
    s |= set('‘’“”‚„–—…•·′″‹›€™←↑→↓↔⇄×÷−±≈≠≤≥')
    return s


def charset(kind, used):
    s = base_latin() | {c for c in used if ord(c) >= 0x20 and not (0xAC00 <= ord(c) <= 0xD7A3)}
    if kind == 'ko':
        s |= {c for c in used if 0xAC00 <= ord(c) <= 0xD7A3}
        s |= ksx1001_hangul()
        s |= {chr(c) for c in range(0x3131, 0x318F)}  # 호환 자모 (ㄱ ㅏ …)
        s |= set('「」『』〈〉《》【】〔〕・～')
    return s


def build(spec, used, dry=False):
    src = fetch(spec['src'])
    font = TTFont(src)
    text = ''.join(sorted(charset(spec['kind'], used)))
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.hinting = False
    opts.desubroutinize = True
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # 저작권·라이선스 이름 유지
    opts.notdef_outline = True
    opts.layout_features = ['kern', 'liga', 'clig', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'case', 'lnum', 'pnum', 'tnum']
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    if 'wght' in spec and 'fvar' in font:  # 쓰지 않는 굵기 구간을 잘라 크기를 줄인다 (서브셋 뒤에 해야 빠르다)
        lo, hi = spec['wght']
        a = {x.axisTag: x for x in font['fvar'].axes}['wght']
        font = instancer.instantiateVariableFont(font, {'wght': (max(lo, a.minValue), min(hi, a.maxValue))})
    out = os.path.join(OUT, spec['out'])
    cmap = font.getBestCmap() or {}
    n_h = sum(1 for c in cmap if 0xAC00 <= c <= 0xD7A3)
    if not dry:
        os.makedirs(OUT, exist_ok=True)
        font.flavor = 'woff2'
        font.save(out)
    size = os.path.getsize(out) if os.path.exists(out) else 0
    missing = sorted(c for c in used if 0xAC00 <= ord(c) <= 0xD7A3 and ord(c) not in cmap) if spec['kind'] == 'ko' else []
    print(f"  {spec['family']:<18} {spec['out']:<28} glyphs={len(cmap):5d} hangul={n_h:5d} {size/1024:8.1f} KB" + (f"  missing: {''.join(missing)}" if missing else ''))
    return dict(family=spec['family'], file=spec['out'], bytes=size, glyphs=len(cmap), hangul=n_h,
                weight=('%d %d' % spec['wght']) if 'wght' in spec else None, source=GF + spec['src'])


def licenses():
    seen, parts = set(), []
    for spec in FONTS:
        d = spec['src'].rsplit('/', 1)[0]
        if d in seen:
            continue
        seen.add(d)
        with open(fetch(d + '/OFL.txt'), encoding='utf-8') as f:
            parts.append(f"==== {spec['family']} ({GF}{d}) ====\n\n" + f.read().strip() + '\n')
    with open(os.path.join(OUT, 'OFL.txt'), 'w', encoding='utf-8') as f:
        f.write('블러드 녹턴에 포함된 글꼴은 모두 SIL Open Font License 1.1 을 따른다. 게임에 쓰인 글자만 남긴 서브셋이다.\n'
                'Fonts bundled with Blood Nocturne are subsets of the originals, licensed under the SIL Open Font License 1.1.\n\n')
        f.write('\n'.join(parts))


def main():
    dry = '--list' in sys.argv
    used = game_chars()
    print(f"game text: {len(used)} distinct chars, {sum(1 for c in used if 0xAC00 <= ord(c) <= 0xD7A3)} hangul")
    info = [build(s, used, dry) for s in FONTS]
    if not dry:
        licenses()
        with open(os.path.join(OUT, 'fonts.json'), 'w', encoding='utf-8') as f:
            json.dump(info, f, ensure_ascii=False, indent=1)
    print(f"total {sum(i['bytes'] for i in info)/1024:.1f} KB")


if __name__ == '__main__':
    main()
