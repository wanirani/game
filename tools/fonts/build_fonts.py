#!/usr/bin/env python3
"""
블러드 녹턴 글꼴 빌드: Google Fonts 원본(OFL)을 받아 게임에 쓰인 글자만 남겨 woff2 로 만든다.

  python3 tools/fonts/build_fonts.py            # 전부 다시 만들기
  python3 tools/fonts/build_fonts.py --list     # 글자 수·크기만 보기

- 한글 글꼴: src/**/*.js · index.html 등에 실제로 쓰인 모든 글자 + KS X 1001 한글 2350자
  (+ 한글 호환 자모) → 이름 입력 등 새 글자도 대부분 그대로 나온다.
- 라틴 글꼴: ASCII + Latin-1 + 게임에 쓰인 비한글 기호 중 글꼴에 있는 것.
- 한글 글꼴은 두 파일로 나눈다: 기본(게임에 쓰인 글자, 첫 화면 전에 받음) + 확장(나머지 KS X 1001, 필요할 때만 받음).
  확장은 별도 글꼴 이름("Noto Sans KR Ext", "Hahmlet Ext")이며 src/core/ui.js 의 FONT 묶음에서 기본 글꼴 바로 뒤에 온다.
  → 기본 파일에 없는 글자만 확장 파일로 넘어간다 (unicode-range 가 겹치면 크롬이 두 파일을 모두 받으므로 이름을 나눴다).
  게임 문장이 늘어 새 글자가 생기면 이 스크립트를 다시 돌린다 (안 돌려도 새 글자는 확장 파일에서 그려진다).
- 결과: assets/fonts/*.woff2, assets/fonts/OFL.txt (라이선스 모음), assets/fonts/fonts.json (목록),
  css/style.css 의 '@fonts:begin' ~ '@fonts:end' 사이 @font-face 블록 (자동 생성)
- index.html · tools/artifact/blood_nocturne.html 의 preload 는 기본 파일 이름을 가리킨다. 파일 이름을 바꾸면 같이 바꾼다.

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
# alias: 예전 코드가 이름으로 부르는 글꼴을 같은 파일로 연결
FONTS = [
    # 본문·UI (가독성) — 가변 굵기 400~900
    dict(family='Noto Sans KR', src='ofl/notosanskr/NotoSansKR[wght].ttf', out='noto-sans-kr.woff2', kind='ko', wght=(400, 900)),
    # 고딕 세리프 제목 + 피 글씨 한글 — 가변 굵기 600~900
    dict(family='Hahmlet', src='ofl/hahmlet/Hahmlet[wght].ttf', out='hahmlet.woff2', kind='ko', wght=(600, 900), alias=['Nanum Myeongjo']),
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


def is_hangul(c):
    return 0xAC00 <= ord(c) <= 0xD7A3


def charset(kind, used, part='core'):
    """part: core(첫 화면용) | ext(한글 확장, 필요할 때만)"""
    if part == 'ext':
        return ksx1001_hangul() - {c for c in used if is_hangul(c)}
    s = base_latin() | {c for c in used if ord(c) >= 0x20 and not is_hangul(c)}
    if kind == 'ko':
        s |= {c for c in used if is_hangul(c)}
        s |= {chr(c) for c in range(0x3131, 0x318F)}  # 호환 자모 (ㄱ ㅏ …)
        s |= set('「」『』〈〉《》【】〔〕・～')
    return s


def ranges(cps):
    """코드포인트 집합 → CSS unicode-range 문자열"""
    cps = sorted(cps)
    out, i = [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append('U+%X' % cps[i] if i == j else 'U+%X-%X' % (cps[i], cps[j]))
        i = j + 1
    return ', '.join(out)


def build(spec, used, part='core', dry=False):
    src = fetch(spec['src'])
    font = TTFont(src, recalcTimestamp=False)  # 다시 빌드해도 같은 파일이 나오도록
    text = ''.join(sorted(charset(spec['kind'], used, part)))
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
    name = spec['out'] if part == 'core' else spec['out'].replace('.woff2', '-ext.woff2')
    out = os.path.join(OUT, name)
    cmap = font.getBestCmap() or {}
    n_h = sum(1 for c in cmap if 0xAC00 <= c <= 0xD7A3)
    if not dry:
        os.makedirs(OUT, exist_ok=True)
        font.flavor = 'woff2'
        font.save(out)
    size = os.path.getsize(out) if os.path.exists(out) else 0
    missing = sorted(c for c in used if is_hangul(c) and ord(c) not in cmap) if spec['kind'] == 'ko' and part == 'core' else []
    print(f"  {spec['family']:<18} {name:<30} glyphs={len(cmap):5d} hangul={n_h:5d} {size/1024:8.1f} KB" + (f"  missing: {''.join(missing)}" if missing else ''))
    if spec['kind'] == 'ko':
        urange = None if part == 'core' else 'U+AC00-D7A3'
    else:  # 라틴 글꼴: 한글은 처음부터 건너뛰게 (받지 않고 다음 글꼴로)
        urange = 'U+0000-024F, U+2000-206F, U+20A0-20CF, U+2100-214F, U+2190-21FF, U+2200-22FF, U+25A0-25FF'
    family = spec['family'] if part == 'core' else spec['family'] + ' Ext'
    alias = spec.get('alias', []) if part == 'core' else []
    return dict(family=family, alias=alias, file=name, part=part, bytes=size, glyphs=len(cmap), hangul=n_h,
                weight=('%d %d' % spec['wght']) if 'wght' in spec else '400 900', urange=urange, source=GF + spec['src'])


def css_block(info):
    """css/style.css 에 넣을 @font-face 블록. 확장(ext) 면을 먼저 선언해야 기본 파일이 우선 쓰이고, 확장은 필요할 때만 받는다"""
    lines = ['/* @fonts:begin — tools/fonts/build_fonts.py 가 만든 블록 (직접 고치지 말 것) */',
             '/* 글꼴은 모두 자체 포함(오프라인·APK). 한글: 게임에 쓰인 글자(기본) + KS X 1001 나머지("… Ext", 필요할 때만 받음) */']
    for i in info:
        for fam in [i['family']] + i['alias']:
            ur = ' unicode-range: %s;' % i['urange'] if i['urange'] else ''
            lines.append('@font-face { font-family: "%s"; src: url("../assets/fonts/%s") format("woff2"); font-weight: %s; font-style: normal; font-display: swap;%s }'
                         % (fam, i['file'], i['weight'], ur))
    lines.append('/* @fonts:end */')
    return '\n'.join(lines) + '\n'


def write_css(info):
    p = os.path.join(ROOT, 'css', 'style.css')
    with open(p, encoding='utf-8') as f:
        css = f.read()
    a, b = css.find('/* @fonts:begin'), css.find('/* @fonts:end */')
    if a < 0 or b < 0:
        raise SystemExit('css/style.css 에 @fonts:begin / @fonts:end 표시가 없다')
    b = css.index('\n', b) + 1
    css = css[:a] + css_block(info) + css[b:]
    with open(p, 'w', encoding='utf-8') as f:
        f.write(css)
    print('  css/style.css @font-face updated')


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
    print(f"game text: {len(used)} distinct chars, {sum(1 for c in used if is_hangul(c))} hangul")
    info = []
    for spec in FONTS:
        info.append(build(spec, used, 'core', dry))
        if spec['kind'] == 'ko':
            info.append(build(spec, used, 'ext', dry))
    if not dry:
        licenses()
        write_css(info)
        with open(os.path.join(OUT, 'fonts.json'), 'w', encoding='utf-8') as f:
            json.dump([{k: v for k, v in i.items() if k != 'urange'} for i in info], f, ensure_ascii=False, indent=1)
    core = sum(i['bytes'] for i in info if i['part'] == 'core')
    print(f"total {sum(i['bytes'] for i in info)/1024:.1f} KB (first load, core files: {core/1024:.1f} KB)")


if __name__ == '__main__':
    main()
