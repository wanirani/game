#!/usr/bin/env python3
"""
블러드 녹턴 글꼴 빌드: Google Fonts 원본(OFL)을 받아 게임에 쓰인 글자만 남겨 woff2 로 만든다.

  python3 tools/fonts/build_fonts.py              # 전부 다시 만들기 (css/style.css 의 @fonts 블록은 바뀔 때만 알린다)
  python3 tools/fonts/build_fonts.py --write-css  # 위와 같고, @fonts 블록이 달라졌으면 css/style.css 도 고친다
  python3 tools/fonts/build_fonts.py --list       # 글자 수·크기만 보기 (파일을 쓰지 않는다)
  python3 tools/fonts/build_fonts.py --check      # 검사만 (원본 글꼴·네트워크 필요 없음). 실패하면 종료 코드 1

글꼴 구성 (src/core/ui.js 의 FONT 묶음과 짝):
- CSS 글꼴 (css/style.css 의 '@fonts:begin' ~ '@fonts:end' @font-face 블록, index.html 이 미리 받음):
  Noto Sans KR(본문) · Hahmlet(제목) · Grenze Gotisch(블랙레터) · Cinzel(라틴 장식·큰 숫자) · Cinzel Decorative(로고)
  한글 글꼴은 두 파일: 기본(게임에 쓰인 글자, 첫 화면 전에 받음) + 확장("… Ext", KS X 1001 나머지, 필요할 때만 받음).
  확장은 별도 글꼴 이름이며 FONT 묶음에서 기본 글꼴 바로 뒤에 온다 (unicode-range 가 겹치면 크롬이 두 파일을 모두 받으므로 이름을 나눴다).
- JS 글꼴 (src/core/ui.js 가 FontFace API 로 등록, CSS 에는 없다):
  BN Num   : 작은 숫자용 라이닝 숫자 (Spectral ExtraBold, 숫자·숫자 기호만) — 첫 화면에 필요해서 곧바로 받는다
  BN Dmg   : 데미지 숫자 (Anton) — 첫 화면 뒤에 곧바로 받는다
  BN Brush : 붓글씨 (East Sea Dokdo, 게임에 쓰인 한글) — 필요할 때(또는 한가할 때) 받는다
  BN Seal  : 낙관·한자 (Yuji Syuku, 게임에 쓰인 한자 + 각성 낙관 한자, 약 9 KB) — 첫 화면 뒤에 곧바로 받는다
  이름·파일·unicode-range 는 ui.js 의 JS_FACES 와 같아야 한다 (--check 가 확인).

- "게임에 쓰인 글자" = src/** 의 모든 파일(+ index.html 등)의 글자. .js 는 주석을 뺀 코드·문자열만 센다
  (주석에만 있는 한글까지 넣으면 첫 화면 글꼴이 커진다). 이름 입력처럼 실행 중에 생기는 글자는 확장 파일에서 그려진다.
- 게임 문장이 늘어 새 글자가 생기면 이 스크립트를 다시 돌린다. --check 는 새 글자가 기본 파일에 없으면 실패한다
  (배포 빌드 tools/deploy/build_web.mjs 와 QA 가 부른다).
- 결과: assets/fonts/*.woff2, assets/fonts/OFL.txt (라이선스 모음), assets/fonts/fonts.json (목록·검사용 정보)
- index.html 의 preload 는 CSS 기본 파일 이름을 가리킨다. 파일 이름을 바꾸면 같이 바꾼다.

필요: pip install fonttools brotli   (--check 는 fonttools 만)
원본 캐시: 환경변수 FONT_CACHE (기본 ~/.cache/blood-nocturne-fonts)
"""
import glob
import json
import os
import re
import sys
import urllib.request

from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'fonts')
CACHE = os.environ.get('FONT_CACHE', os.path.expanduser('~/.cache/blood-nocturne-fonts'))
GF = 'https://raw.githubusercontent.com/google/fonts/main/'
UI_JS = os.path.join(ROOT, 'src', 'core', 'ui.js')
FIRST_FRAME_BUDGET = 500 * 1024  # 첫 화면 전에 받는 글꼴 합계 상한 (platform §8.3)

# 각성 컷인 낙관 한자 (feel §2.1) — 데이터 파일이 아직 없어도 항상 넣는다
SEAL_HANJA = '狩聖銃鐵鴉血'
# 데미지 숫자·붓글씨에 늘 필요한 기호
DMG_EXTRA = '×·−…'
BRUSH_EXTRA = '—–…·‘’“”「」『』《》〈〉～!?'
NUM_CHARS = '0123456789,.%+-/:'

# family: 글꼴 이름, src: google/fonts 경로, out: 결과 파일, kind: ko|latin|digits|brush|hanja
# load: css(스타일시트, 첫 화면) | first(ui.js, 첫 화면) | early(ui.js, 첫 화면 뒤 곧바로) | lazy(ui.js, 필요할 때)
# wght: 가변 글꼴 굵기 범위 제한, weight: @font-face font-weight, urange: JS 글꼴의 unicode-range
# alias: 예전 코드가 이름으로 부르는 글꼴을 같은 파일로 연결
FONTS = [
    # 본문·UI (가독성) — 가변 굵기 400~900
    dict(family='Noto Sans KR', src='ofl/notosanskr/NotoSansKR[wght].ttf', out='noto-sans-kr.woff2', kind='ko', load='css', wght=(400, 900)),
    # 고딕 세리프 제목 + 피 글씨 한글 — 가변 굵기 600~900
    dict(family='Hahmlet', src='ofl/hahmlet/Hahmlet[wght].ttf', out='hahmlet.woff2', kind='ko', load='css', wght=(600, 900), alias=['Nanum Myeongjo']),
    # 블랙레터 (영문 제목·피 글씨) — 가변 굵기 700~900
    dict(family='Grenze Gotisch', src='ofl/grenzegotisch/GrenzeGotisch[wght].ttf', out='grenze-gotisch.woff2', kind='latin', load='css', wght=(700, 900)),
    # 라틴 장식 글자·큰 숫자 — 가변 굵기 600~900
    dict(family='Cinzel', src='ofl/cinzel/Cinzel[wght].ttf', out='cinzel.woff2', kind='latin', load='css', wght=(600, 900)),
    # 타이틀 로고 (기존 코드 호환)
    dict(family='Cinzel Decorative', src='ofl/cinzeldecorative/CinzelDecorative-Black.ttf', out='cinzel-decorative-900.woff2', kind='latin', load='css'),
    # ── JS 글꼴 (ui.js JS_FACES) ──
    # 작은 숫자: Cinzel 의 1·0 은 I·O 처럼 읽혀 작은 글씨에서 11 → II 가 된다 → 숫자만 라이닝 세리프로
    dict(family='BN Num', src='ofl/spectral/Spectral-ExtraBold.ttf', out='bn-num.woff2', kind='digits', load='first',
         weight='100 900', urange='U+0025, U+002B-003A'),
    # 데미지 숫자: 굵은 압축 산세리프 (0~9 , ! CRITICAL 등)
    dict(family='BN Dmg', src='ofl/anton/Anton-Regular.ttf', out='bn-dmg.woff2', kind='latin', load='early', fixed=DMG_EXTRA,
         weight='100 900', urange='U+0020-007E, U+00A0-00FF, U+2010-2027, U+2212'),
    # 붓글씨 (필살기·각성 이름, 시그니처 대사)
    dict(family='BN Brush', src='ofl/eastseadokdo/EastSeaDokdo-Regular.ttf', out='bn-brush.woff2', kind='brush', load='lazy',
         weight='100 900', urange='U+0020-007E, U+00A0-00FF, U+2010-2027, U+3000-303F, U+AC00-D7A3, U+FF01-FF5E'),
    # 낙관·한자 (붓 느낌 명조)
    dict(family='BN Seal', src='ofl/yujisyuku/YujiSyuku-Regular.ttf', out='bn-seal.woff2', kind='hanja', load='early',
         weight='100 900', urange='U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF'),
]

SCAN_GLOBS = ['src/**/*', 'index.html', 'tools/artifact/*.html', 'manifest.webmanifest']
JS_EXT = ('.js', '.mjs', '.cjs')


# ───────────────────────── 게임 글자 모으기 ─────────────────────────
KW_BEFORE_REGEX = {'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof'}


def js_code_text(src):
    """JS 소스에서 주석만 뺀 나머지(코드 + 문자열 + 템플릿 + 정규식)를 돌려준다. 줄 수는 그대로 둔다 (위치 보고용)."""
    out = []
    i, n = 0, len(src)
    tpl = []  # 템플릿 ${ } 안의 중괄호 깊이
    prev = ''  # 마지막 의미 있는 토큰: 정규식 / 나눗셈 구분
    while i < n:
        c = src[i]
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            i = n if j < 0 else j
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append('\n' * src.count('\n', i, j) or ' ')
            i = j
            continue
        if c in '\'"':
            j = i + 1
            while j < n and src[j] != c and src[j] != '\n':
                j += 2 if src[j] == '\\' else 1
            out.append(src[i:j + 1])
            i, prev = j + 1, 'x'
            continue
        if c == '`' or (c == '}' and tpl and tpl[-1] == 0):
            if c == '}':
                tpl.pop()
            j = i + 1
            while j < n and src[j] != '`':
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '$' and j + 1 < n and src[j + 1] == '{':
                    break
                j += 1
            out.append(src[i:j + 1])
            if j < n and src[j] == '$':
                tpl.append(0)
                out.append('{')
                i, prev = j + 2, '('
            else:
                i, prev = j + 1, 'x'
            continue
        if c == '{' and tpl:
            tpl[-1] += 1
        elif c == '}' and tpl:
            tpl[-1] -= 1
        if c == '/' and (prev == '' or prev in '(,=:[!&|?{};+-*%<>~^' or prev == 'kw'):
            j, cls = i + 1, False
            while j < n and src[j] != '\n':
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '[':
                    cls = True
                elif src[j] == ']':
                    cls = False
                elif src[j] == '/' and not cls:
                    break
                j += 1
            out.append(src[i:j + 1])
            i, prev = j + 1, 'x'
            continue
        if c.isspace():
            out.append(c)
            i += 1
            continue
        if c.isalnum() or c in '_$':
            j = i
            while j < n and (src[j].isalnum() or src[j] in '_$'):
                j += 1
            w = src[i:j]
            out.append(w)
            i, prev = j, ('kw' if w in KW_BEFORE_REGEX else 'x')
            continue
        out.append(c)
        prev = 'x' if c in ')]' else c
        i += 1
    return ''.join(out)


def scan_files():
    seen = set()
    for g in SCAN_GLOBS:
        for f in sorted(glob.glob(os.path.join(ROOT, g), recursive=True)):
            if f in seen or not os.path.isfile(f):
                continue
            seen.add(f)
            yield f


def game_chars():
    """게임에 쓰인 글자 집합과 글자별 첫 위치 {글자: 'src/…:줄'}"""
    chars, where = set(), {}
    for f in scan_files():
        try:
            with open(f, encoding='utf-8') as fh:
                text = fh.read()
        except (UnicodeDecodeError, OSError):
            continue  # 이미지 등 글자가 아닌 파일
        if f.endswith(JS_EXT):
            text = js_code_text(text)
        rel = os.path.relpath(f, ROOT)
        for ln, line in enumerate(text.split('\n'), 1):
            for c in line:
                if c not in where and ord(c) >= 0x80:
                    where[c] = f'{rel}:{ln}'
            chars |= set(line)
    return chars, where


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


def is_cjk(c):
    o = ord(c)
    return 0x3400 <= o <= 0x4DBF or 0x4E00 <= o <= 0x9FFF or 0xF900 <= o <= 0xFAFF


def charset(spec, used, part='core'):
    """이 글꼴 파일에 넣을 글자. part: core(기본) | ext(한글 확장, 필요할 때만)"""
    kind = spec['kind']
    if part == 'ext':
        return ksx1001_hangul() - {c for c in used if is_hangul(c)}
    if kind == 'digits':
        return set(NUM_CHARS + ' ')
    if kind == 'hanja':
        return {c for c in used if is_cjk(c)} | set(SEAL_HANJA) | {' '}
    if kind == 'brush':
        return {chr(c) for c in range(0x20, 0x7F)} | set(BRUSH_EXTRA) | {c for c in used if is_hangul(c)}
    if spec.get('fixed'):  # 정해진 글자만 (데미지 숫자)
        return {chr(c) for c in range(0x20, 0x7F)} | set(spec['fixed'])
    s = base_latin() | {c for c in used if ord(c) >= 0x20 and not is_hangul(c)}
    if kind == 'ko':
        s |= {c for c in used if is_hangul(c)}
        s |= {chr(c) for c in range(0x3131, 0x318F)}  # 호환 자모 (ㄱ ㅏ …)
        s |= set('「」『』〈〉《》【】〔〕・～')
    return s


def checked(spec, chars):
    """--check 가 확인하는 글자 (라틴 글꼴은 한글·한자를 검사하지 않는다)"""
    kind = spec['kind']
    if kind == 'ko':
        return {c for c in chars if is_hangul(c) or is_cjk(c)}
    if kind == 'brush':
        return {c for c in chars if is_hangul(c)}
    if kind == 'hanja':
        return {c for c in chars if is_cjk(c)}
    return {c for c in chars if ord(c) < 0x250}  # 라틴 글꼴: 라틴 글자만 (기호·룬 등은 다른 글꼴로 넘어가도 된다)


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


def out_name(spec, part):
    return spec['out'] if part == 'core' else spec['out'].replace('.woff2', '-ext.woff2')


def face_info(spec, part, size, glyphs, hangul, absent):
    if spec['load'] == 'css':
        urange = None if part == 'core' else 'U+AC00-D7A3'
        if spec['kind'] != 'ko':  # 라틴 글꼴: 한글은 처음부터 건너뛰게 (받지 않고 다음 글꼴로)
            urange = 'U+0000-024F, U+2000-206F, U+20A0-20CF, U+2100-214F, U+2190-21FF, U+2200-22FF, U+25A0-25FF'
    else:
        urange = spec['urange']
    return dict(family=spec['family'] if part == 'core' else spec['family'] + ' Ext',
                alias=spec.get('alias', []) if part == 'core' else [],
                file=out_name(spec, part), part=part, load=spec['load'] if part == 'core' else 'lazy',
                bytes=size, glyphs=glyphs, hangul=hangul,
                weight=spec.get('weight') or (('%d %d' % spec['wght']) if 'wght' in spec else '400 900'),
                urange=urange, source=GF + spec['src'], absent=''.join(sorted(absent)))


# ───────────────────────── 빌드 ─────────────────────────
def fetch(rel):
    os.makedirs(CACHE, exist_ok=True)
    dst = os.path.join(CACHE, rel.replace('/', '__'))
    if not os.path.exists(dst) or os.path.getsize(dst) < 1000:
        url = GF + rel.replace('[', '%5B').replace(']', '%5D')
        print('  download', url)
        with urllib.request.urlopen(url, timeout=120) as r, open(dst, 'wb') as f:
            f.write(r.read())
    return dst


def build(spec, used, part='core', dry=False):
    from fontTools import subset
    from fontTools.varLib import instancer
    src = fetch(spec['src'])
    font = TTFont(src, recalcTimestamp=False)  # 다시 빌드해도 같은 파일이 나오도록
    want = charset(spec, used, part)
    src_cmap = font.getBestCmap() or {}
    absent = {c for c in checked(spec, want) if ord(c) not in src_cmap} if part == 'core' else set()
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.hinting = False
    opts.desubroutinize = True
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # 저작권·라이선스 이름 유지
    opts.notdef_outline = True
    opts.layout_features = ['kern', 'liga', 'clig', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'case', 'lnum', 'pnum', 'tnum']
    sub = subset.Subsetter(opts)
    sub.populate(text=''.join(sorted(want)))
    sub.subset(font)
    if 'wght' in spec and 'fvar' in font:  # 쓰지 않는 굵기 구간을 잘라 크기를 줄인다 (서브셋 뒤에 해야 빠르다)
        lo, hi = spec['wght']
        a = {x.axisTag: x for x in font['fvar'].axes}['wght']
        font = instancer.instantiateVariableFont(font, {'wght': (max(lo, a.minValue), min(hi, a.maxValue))})
    name = out_name(spec, part)
    out = os.path.join(OUT, name)
    cmap = font.getBestCmap() or {}
    n_h = sum(1 for c in cmap if 0xAC00 <= c <= 0xD7A3)
    if not dry:
        os.makedirs(OUT, exist_ok=True)
        font.flavor = 'woff2'
        font.save(out)
    size = os.path.getsize(out) if os.path.exists(out) else 0
    print(f"  {spec['family'] + ('' if part == 'core' else ' Ext'):<18} {name:<28} {spec['load']:<5} glyphs={len(cmap):5d} hangul={n_h:5d} {size/1024:8.1f} KB"
          + (f"  (원본에 없음 {len(absent)}자)" if absent else ''))
    return face_info(spec, part, size, len(cmap), n_h, absent)


def css_block(info):
    """css/style.css 에 넣을 @font-face 블록. 확장(ext) 면을 먼저 선언해야 기본 파일이 우선 쓰이고, 확장은 필요할 때만 받는다"""
    lines = ['/* @fonts:begin — tools/fonts/build_fonts.py 가 만든 블록 (직접 고치지 말 것) */',
             '/* 글꼴은 모두 자체 포함(오프라인·APK). 한글: 게임에 쓰인 글자(기본) + KS X 1001 나머지("… Ext", 필요할 때만 받음) */']
    for i in info:
        if i['load'] == 'css' or (i['part'] == 'ext'):
            for fam in [i['family']] + i['alias']:
                ur = ' unicode-range: %s;' % i['urange'] if i['urange'] else ''
                lines.append('@font-face { font-family: "%s"; src: url("../assets/fonts/%s") format("woff2"); font-weight: %s; font-style: normal; font-display: swap;%s }'
                             % (fam, i['file'], i['weight'], ur))
    lines.append('/* @fonts:end */')
    return '\n'.join(lines) + '\n'


def css_split():
    p = os.path.join(ROOT, 'css', 'style.css')
    with open(p, encoding='utf-8') as f:
        css = f.read()
    a, b = css.find('/* @fonts:begin'), css.find('/* @fonts:end */')
    if a < 0 or b < 0:
        raise SystemExit('css/style.css 에 @fonts:begin / @fonts:end 표시가 없다')
    b = css.index('\n', b) + 1
    return p, css, a, b


def write_css(info, allow):
    """@fonts 블록이 달라졌을 때만 고친다. css/style.css 는 다른 담당(부트·플랫폼)의 파일이라 --write-css 일 때만 쓴다"""
    p, css, a, b = css_split()
    block = css_block(info)
    if css[a:b] == block:
        print('  css/style.css @font-face 블록: 그대로 (고칠 것 없음)')
        return True
    if not allow:
        print('  !! css/style.css 의 @font-face 블록이 새 빌드와 다르다 — --write-css 로 다시 돌리거나 CSS 담당에게 넘길 것')
        return False
    with open(p, 'w', encoding='utf-8') as f:
        f.write(css[:a] + block + css[b:])
    print('  css/style.css @font-face updated')
    return True


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
                'Fonts bundled with Blood Nocturne are subsets of the originals, licensed under the SIL Open Font License 1.1.\n'
                'BN Num = Spectral ExtraBold, BN Dmg = Anton, BN Brush = East Sea Dokdo, BN Seal = Yuji Syuku (게임 안에서 부르는 이름).\n\n')
        f.write('\n'.join(parts))


def first_frame_bytes(info):
    return sum(i['bytes'] for i in info if i['part'] == 'core' and i['load'] in ('css', 'first'))


# ───────────────────────── 검사 ─────────────────────────
def check():
    """새 글자가 기본 파일에 모두 들어 있는지, 첫 화면 글꼴 예산, CSS 블록·ui.js 등록이 목록과 맞는지 확인한다"""
    used, where = game_chars()
    with open(os.path.join(OUT, 'fonts.json'), encoding='utf-8') as f:
        info = json.load(f)
    by_file = {i['file']: i for i in info}
    errors, warns = [], []
    print(f"game text: {len(used)} distinct chars, {sum(1 for c in used if is_hangul(c))} hangul, {sum(1 for c in used if is_cjk(c))} hanja")
    for spec in FONTS:
        i = by_file.get(spec['out'])
        path = os.path.join(OUT, spec['out'])
        if not i or not os.path.exists(path):
            errors.append(f"{spec['out']}: 파일 또는 fonts.json 항목이 없다 (빌드 필요)")
            continue
        if os.path.getsize(path) != i['bytes']:
            warns.append(f"{spec['out']}: 크기가 fonts.json 과 다르다 ({os.path.getsize(path)} ≠ {i['bytes']})")
        cmap = TTFont(path, lazy=True).getBestCmap() or {}
        miss = sorted(c for c in checked(spec, charset(spec, used)) if ord(c) not in cmap and c not in i.get('absent', ''))
        state = 'OK' if not miss else f'빠짐 {len(miss)}자'
        print(f"  {spec['family']:<18} {spec['out']:<28} {spec['load']:<5} {i['bytes']/1024:7.1f} KB  {state}")
        if miss:
            errors.append(f"{spec['family']} ({spec['out']}) 에 없는 글자 {len(miss)}자: {''.join(miss)}\n      처음 쓰인 곳: "
                          + ', '.join(f'{c} {where.get(c, "?")}' for c in miss[:8]) + (' …' if len(miss) > 8 else ''))
    ff = first_frame_bytes(info)
    print(f"  첫 화면 글꼴 합계 {ff/1024:.1f} KB (상한 {FIRST_FRAME_BUDGET/1024:.0f} KB)")
    if ff > FIRST_FRAME_BUDGET:
        errors.append(f"첫 화면 글꼴 {ff/1024:.1f} KB > {FIRST_FRAME_BUDGET/1024:.0f} KB")
    try:
        _, css, a, b = css_split()
        if css[a:b] != css_block(info):
            errors.append('css/style.css 의 @fonts 블록이 fonts.json 과 다르다 (build_fonts.py --write-css)')
    except SystemExit as e:
        errors.append(str(e))
    with open(UI_JS, encoding='utf-8') as f:
        ui = f.read()
    for i in info:
        if i['part'] == 'core' and i['load'] != 'css':
            m = re.search(r"\['%s',\s*'%s',\s*'([^']*)',\s*'([^']*)',\s*'(\w+)'\]" % (re.escape(i['family']), re.escape(i['file'])), ui)
            if not m:
                errors.append(f"src/core/ui.js JS_FACES 에 ['{i['family']}', '{i['file']}', …] 줄이 없다")
            elif (m.group(1), m.group(2), m.group(3)) != (i['weight'], i['urange'], i['load']):
                errors.append(f"src/core/ui.js JS_FACES 의 {i['family']} 설정이 fonts.json 과 다르다: {m.groups()} ≠ {(i['weight'], i['urange'], i['load'])}")
    for w in warns:
        print('  경고:', w)
    if errors:
        print('\n글꼴 검사 실패 — python3 tools/fonts/build_fonts.py 로 다시 만든다:')
        for e in errors:
            print('  ✗', e)
        return 1
    print('글꼴 검사 통과')
    return 0


def main():
    if '--check' in sys.argv:
        sys.exit(check())
    dry = '--list' in sys.argv
    used, _ = game_chars()
    print(f"game text: {len(used)} distinct chars, {sum(1 for c in used if is_hangul(c))} hangul (주석 제외)")
    info = []
    for spec in FONTS:
        info.append(build(spec, used, 'core', dry))
        if spec['kind'] == 'ko':
            info.append(build(spec, used, 'ext', dry))
    ok = True
    if not dry:
        licenses()
        ok = write_css(info, '--write-css' in sys.argv)
        with open(os.path.join(OUT, 'fonts.json'), 'w', encoding='utf-8') as f:
            json.dump(info, f, ensure_ascii=False, indent=1)
    ff = first_frame_bytes(info)
    print(f"total {sum(i['bytes'] for i in info)/1024:.1f} KB (first frame: {ff/1024:.1f} KB / {FIRST_FRAME_BUDGET/1024:.0f} KB)")
    if not ok:
        sys.exit(2)


if __name__ == '__main__':
    main()
