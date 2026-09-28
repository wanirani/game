#!/usr/bin/env python3
"""블러드 녹턴 APK — 웹 배포 빌드(dist/web)를 APK 에 넣을 모양으로 꾸린다. tools/apk/build_apk.sh 가 부른다.

  python3 tools/apk/pack_web.py --web dist/web --out dist/apk-build/assets [--budget-mb 45] [--assets auto|full|lo|lo+td]
                                [--origin-file tools/apk/api_origin.txt] [--origin https://…] [--cloud-js src/core/cloud.js]
                                [--report dist/apk-build/pack_report.json]

하는 일 (platform §9.4-4/5, MASTER_PLAN §1.20):
 1. dist/web 을 <out>/www 로 복사한다. 빼는 것: sw.js (앱은 서비스 워커를 쓰지 않는다), downloads/ (APK 자신), _redirects (Netlify 전용).
    공개 금지 파일(키스토어·비밀번호 파일·개발 폴더)이 섞여 있으면 실패. index.html 이 가리키는 파일이 모두 있는지 확인.
 2. APK 크기 예산(기본 45 MB, 채색 그림 포함)에 맞춰 단계를 고른다 (--assets auto):
      full   dist/web 그대로
      lo     bg/·cg/·portraits/ 의 원본을 빼고 assets/lo/ 사본만 싣는다 (AssetServer 가 원본 경로 요청에 lo/ 사본을 준다)
      lo+td  + 채색 아틀라스(assets/painted/**)를 휴대폰 밀도로 줄인다: 원본 밀도의 0.75배
             (manifest.json td ≥ 1.25, rig.json srcTD ≥ 1.75 텍셀/논리px 아래로는 줄이지 않는다)
    크기는 APK 안의 모양으로 어림한다: 그림·글꼴은 무압축 저장, 나머지는 deflate. 최종 확인은 build_apk.sh 가 서명한 APK 로 한다.
 3. <out>/app/apk.json 을 쓴다: {api:{origin, aliases}, assets, budgetMB, web:{version, hash, files}, dropped, modified?}
    AssetServer 가 head_inject 의 {{CONFIG}} 로 넣고, MainActivity 가 계정 서버 주소(ApiProxy)·lo 모드를 읽는다.
실패하면 종료 코드 1 (예산을 넘으면 3).
"""
import argparse
import hashlib
import io
import json
import math
import os
import re
import shutil
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NO_COMPRESS = {'png', 'webp', 'jpg', 'jpeg', 'gif', 'avif', 'mp3', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'mp4', 'webm', 'woff', 'woff2'}
EXCLUDE_FILES = {'sw.js', '_redirects'}
EXCLUDE_DIRS = ('downloads/',)
DENY = re.compile(r'(^|/)(tools|docs|android|node_modules|netlify|dist|\.git)(/|$)|\.(keystore|jks|p12|pfx|pem|key|properties)$|(^|/)\.env', re.I)
LO_RE = re.compile(r'^assets/((?:bg|cg|portraits)/.+\.webp)$')
ORIGIN_RE = re.compile(r'^https://[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::[0-9]{1,5})?$')
APK_OVERHEAD = 600 * 1024          # classes.dex · resources.arsc · 아이콘 · 매니페스트 · 서명 블록 (어림)
TD_SCALE = 0.75
TD_FLOOR_MANIFEST = 1.25           # src/render/painted/kit.js: 보스·동료 (td)
TD_FLOOR_RIG = 1.75                # src/render/painted/enemy_kit.js: 적·동료 (srcTD)
MB = 1024 * 1024


def say(msg):
    print(msg, flush=True)


def die(msg, code=1):
    print('오류: ' + msg, file=sys.stderr, flush=True)
    sys.exit(code)


def walk(base):
    out = []
    for dp, dns, fns in os.walk(base):
        dns.sort()
        for fn in sorted(fns):
            p = Path(dp) / fn
            out.append(p.relative_to(base).as_posix())
    return out


def parse_origin(text):
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith('#'):
            continue
        s = s.rstrip('/')
        if ORIGIN_RE.match(s) and '..' not in s:
            return s.lower()
        return None
    return None


def read_origin(args):
    if args.origin:
        o = parse_origin(args.origin)
        if not o:
            die(f'API_ORIGIN 형식이 틀렸습니다 (https://호스트[:포트]): {args.origin!r}')
        return o, 'API_ORIGIN'
    p = Path(args.origin_file)
    if not p.is_file():
        die(f'{p} 가 없습니다 (계정 서버 주소)')
    o = parse_origin(p.read_text(encoding='utf-8'))
    if not o:
        die(f'{p} 의 서버 주소 형식이 틀렸습니다 (주석을 뺀 첫 줄 = https://호스트[:포트])')
    return o, str(p.relative_to(ROOT) if p.is_absolute() and ROOT in p.parents else p)


def cloud_aliases(path):
    """src/core/cloud.js 의 APP_API_BASE 사이트 (앱 조각이 이 주소로 가는 fetch 도 프록시로 돌린다)"""
    try:
        src = Path(path).read_text(encoding='utf-8')
    except OSError:
        return []
    out = []
    for m in re.finditer(r"APP_API_BASE\s*=\s*['\"](https://[^'\"/]+)/api['\"]", src):
        o = parse_origin(m.group(1))
        if o and o not in out:
            out.append(o)
    return out


def apk_bytes(path, rel):
    """APK 안에서 이 파일이 차지할 크기 (어림)"""
    n = path.stat().st_size
    ext = rel.rsplit('.', 1)[-1].lower() if '.' in rel else ''
    if ext not in NO_COMPRESS and n > 0:
        n = min(n, len(zlib.compress(path.read_bytes(), 6)))
    return n + 2 * len(('assets/www/' + rel).encode()) + 110


def web_info(web):
    info = {}
    try:
        t = (web / 'build-info.js').read_text(encoding='utf-8')
        m = re.search(r'window\.__BN_BUILD\s*=\s*(\{.*\})\s*;', t, re.S)
        if m:
            b = json.loads(m.group(1))
            info['version'] = b.get('version')
            info['hash'] = b.get('hash')
    except (OSError, ValueError):
        pass
    try:
        bj = json.loads((web / 'build.json').read_text(encoding='utf-8'))
        info['commit'] = bj.get('commit')
        info['buildHash'] = bj.get('buildHash')
    except (OSError, ValueError):
        pass
    return info


def index_refs(html):
    """index.html 이 부르는 같은 사이트 파일 (script src, link href) — 쿼리 제외"""
    refs = []
    for m in re.finditer(r'<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"', html):
        u = m.group(1)
        if re.match(r'^[a-z][a-z0-9+.-]*:', u, re.I) or u.startswith('//') or u.startswith('#'):
            continue
        refs.append(u.split('?')[0].split('#')[0].lstrip('./'))
    return refs


# ───────────────────────── 휴대폰 밀도 채색 아틀라스 (lo+td) ─────────────────────────

def _is_pt(v):
    return isinstance(v, list) and len(v) == 2 and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in v)


def _is_pts(v):
    return isinstance(v, list) and len(v) > 0 and all(_is_pt(q) for q in v)


def _rescale_atlas(atlas_path, rects, g):
    """rects: {name: (x, y, w, h)} → 부품별로 따로 줄여 새 아틀라스에 놓는다 (이웃 부품 색이 번지지 않게). → (새 rects, 크기, bytes)"""
    from PIL import Image
    im = Image.open(atlas_path)
    im.load()
    im = im.convert('RGBA')
    W, H = im.size
    new_rects = {}
    W2, H2 = max(1, math.ceil(W * g)), max(1, math.ceil(H * g))
    for name, (x, y, w, h) in rects.items():
        x2, y2 = int(round(x * g)), int(round(y * g))
        w2, h2 = max(1, int(round(w * g))), max(1, int(round(h * g)))
        new_rects[name] = (x2, y2, w2, h2)
        W2, H2 = max(W2, x2 + w2), max(H2, y2 + h2)
    out = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
    for name, (x, y, w, h) in rects.items():
        x2, y2, w2, h2 = new_rects[name]
        crop = im.crop((x, y, x + w, y + h))
        part = crop.resize((w2, h2), Image.LANCZOS)   # Pillow 는 RGBA 를 알파 곱셈 상태로 줄인다 (가장자리 검은 테 없음)
        out.alpha_composite(part, (x2, y2))
    buf = io.BytesIO()
    out.save(buf, 'WEBP', quality=90, method=6)
    data = buf.getvalue()
    atlas_path.write_bytes(data)
    return new_rects, (W2, H2), data


def _scale_points(p, sx, sy, skip):
    for k, v in list(p.items()):
        if k in skip:
            continue
        if _is_pt(v):
            p[k] = [round(v[0] * sx, 3), round(v[1] * sy, 3)]
        elif _is_pts(v):
            p[k] = [[round(q[0] * sx, 3), round(q[1] * sy, 3)] for q in v]


def downscale_manifest(d):
    """assets/painted/**/manifest.json (src/render/painted/kit.js 형식: td, atlas{file,w,h,hash}, parts{x,y,w,h,<점>}).
    점은 부품 안 텍셀 좌표라 부품 크기 비율로, 스칼라 값(lps, r, ang…)은 그대로 둔다 (kit.js 도 스칼라는 밀도와 무관하게 넘긴다)."""
    mp = d / 'manifest.json'
    man = json.loads(mp.read_text(encoding='utf-8'))
    td = float(man.get('td') or 0)
    target = max(TD_FLOOR_MANIFEST, td * TD_SCALE)
    if td <= 0 or target >= td - 1e-6:
        return None
    atlas = d / ((man.get('atlas') or {}).get('file', 'atlas') + '.webp')
    if not atlas.is_file():
        return None
    g = target / td
    rects = {n: (p['x'], p['y'], p['w'], p['h']) for n, p in man['parts'].items()}
    new_rects, (W2, H2), data = _rescale_atlas(atlas, rects, g)
    for n, p in man['parts'].items():
        x, y, w, h = rects[n]
        x2, y2, w2, h2 = new_rects[n]
        _scale_points(p, w2 / w, h2 / h, {'x', 'y', 'w', 'h'})
        p['x'], p['y'], p['w'], p['h'] = x2, y2, w2, h2
    man['td'] = round(target, 4)
    man['atlas']['w'], man['atlas']['h'] = W2, H2
    man['atlas']['hash'] = hashlib.sha1(data).hexdigest()[:10]
    mp.write_text(json.dumps(man, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return [mp, atlas]


def downscale_rig(d):
    """assets/painted/**/rig.json (src/render/painted/enemy_kit.js 형식: srcTD, size, v, parts{rect:[x,y,w,h], piv:{…}})"""
    rp = d / 'rig.json'
    rig = json.loads(rp.read_text(encoding='utf-8'))
    td = float(rig.get('srcTD') or 3)
    target = max(TD_FLOOR_RIG, td * TD_SCALE)
    if target >= td - 1e-6:
        return None
    atlas = d / (rig.get('atlas') or 'atlas.webp')
    if not atlas.is_file():
        return None
    g = target / td
    rects = {n: tuple(p['rect']) for n, p in rig['parts'].items()}
    new_rects, (W2, H2), data = _rescale_atlas(atlas, rects, g)
    for n, p in rig['parts'].items():
        x, y, w, h = rects[n]
        x2, y2, w2, h2 = new_rects[n]
        p['rect'] = [x2, y2, w2, h2]
        if isinstance(p.get('piv'), dict):
            _scale_points(p['piv'], w2 / w, h2 / h, set())
    rig['srcTD'] = round(target, 4)
    rig['size'] = [W2, H2]
    rig['v'] = int(hashlib.sha1(data).hexdigest()[:6], 16)
    rp.write_text(json.dumps(rig, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return [rp, atlas]


def check_painted(www):
    """줄인 뒤 구조 검사: 모든 부품 사각형이 아틀라스 안, 매니페스트의 크기 = 실제 그림 크기"""
    from PIL import Image
    bad = []
    for mp in sorted((www / 'assets/painted').rglob('manifest.json')):
        man = json.loads(mp.read_text(encoding='utf-8'))
        a = mp.parent / ((man.get('atlas') or {}).get('file', 'atlas') + '.webp')
        if not a.is_file():
            continue
        with Image.open(a) as im:
            W, H = im.size
        if man['atlas'].get('w') not in (None, W) or man['atlas'].get('h') not in (None, H):
            bad.append(f'{mp}: atlas {W}x{H} ≠ {man["atlas"].get("w")}x{man["atlas"].get("h")}')
        for n, p in man['parts'].items():
            if p['x'] < 0 or p['y'] < 0 or p['x'] + p['w'] > W or p['y'] + p['h'] > H:
                bad.append(f'{mp}: {n} 이 아틀라스 밖')
    for rp in sorted((www / 'assets/painted').rglob('rig.json')):
        rig = json.loads(rp.read_text(encoding='utf-8'))
        a = rp.parent / (rig.get('atlas') or 'atlas.webp')
        if not a.is_file():
            continue
        with Image.open(a) as im:
            W, H = im.size
        for n, p in rig['parts'].items():
            x, y, w, h = p['rect']
            if x < 0 or y < 0 or x + w > W or y + h > H:
                bad.append(f'{rp}: {n} 이 아틀라스 밖')
    return bad


# ───────────────────────── 본체 ─────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--web', default=str(ROOT / 'dist/web'))
    ap.add_argument('--out', required=True, help='APK assets/ 폴더 (www/ 와 app/apk.json 을 쓴다)')
    ap.add_argument('--budget-mb', type=float, default=45.0)
    ap.add_argument('--assets', default='auto', choices=['auto', 'full', 'lo', 'lo+td'])
    ap.add_argument('--origin-file', default=str(ROOT / 'tools/apk/api_origin.txt'))
    ap.add_argument('--origin', default=os.environ.get('API_ORIGIN') or None)
    ap.add_argument('--cloud-js', default=str(ROOT / 'src/core/cloud.js'))
    ap.add_argument('--report', default=None)
    args = ap.parse_args()

    web = Path(args.web).resolve()
    out = Path(args.out).resolve()
    www = out / 'www'
    if not (web / 'index.html').is_file() or not (web / 'build-info.js').is_file():
        die(f'{web} 에 웹 배포 빌드가 없습니다 (index.html·build-info.js). 먼저: node tools/deploy/build_web.mjs')
    origin, origin_from = read_origin(args)
    aliases = [a for a in cloud_aliases(args.cloud_js) if a != origin]
    budget = int(args.budget_mb * MB)

    # 1. 복사
    if www.exists():
        shutil.rmtree(www)
    www.mkdir(parents=True)
    rels, skipped, denied = [], [], []
    for rel in walk(web):
        if rel in EXCLUDE_FILES or rel.startswith(EXCLUDE_DIRS):
            skipped.append(rel)
            continue
        src = web / rel
        if src.is_symlink():
            denied.append(rel + ' (심볼릭 링크)')
            continue
        if DENY.search(rel):
            denied.append(rel)
            continue
        dst = www / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        rels.append(rel)
    if denied:
        shutil.rmtree(www, ignore_errors=True)
        die('공개하면 안 되는 파일이 dist/web 에 있습니다:\n  ' + '\n  '.join(denied[:20]))
    html = (www / 'index.html').read_text(encoding='utf-8')
    missing = [r for r in index_refs(html) if not (www / r).is_file()]
    if missing:
        die('index.html 이 가리키는 파일이 없습니다: ' + ', '.join(missing))
    say(f'  dist/web → www: 파일 {len(rels)}개 (뺀 것 {len(skipped)}개: sw.js, _redirects, downloads/)')

    # 2. 단계 고르기
    sizes = {r: apk_bytes(www / r, r) for r in rels}
    raw = sum((www / r).stat().st_size for r in rels)
    twins = [r for r in rels if LO_RE.match(r) and (www / 'assets/lo' / LO_RE.match(r).group(1)).is_file()]
    est_full = sum(sizes.values()) + APK_OVERHEAD
    est_lo = est_full - sum(sizes[r] for r in twins)
    say(f'  크기 어림 (APK 안): 전부 {est_full / MB:.2f} MB · lo {est_lo / MB:.2f} MB · 예산 {budget / MB:.2f} MB (압축 전 {raw / MB:.2f} MB)')
    mode = args.assets
    if mode == 'auto':
        mode = 'full' if est_full <= budget else 'lo' if est_lo <= budget else 'lo+td'
    dropped, modified = [], []
    if mode in ('lo', 'lo+td'):
        for r in twins:
            (www / r).unlink()
            dropped.append(r)
            del sizes[r]
        say(f'  휴대폰 밀도(lo): bg/·cg/·portraits/ 원본 {len(dropped)}개를 빼고 assets/lo/ 사본만 싣는다')
    if mode == 'lo+td':
        n = 0
        for mp in sorted((www / 'assets/painted').rglob('manifest.json')) if (www / 'assets/painted').is_dir() else []:
            ch = downscale_manifest(mp.parent)
            if ch:
                n += 1
                modified += [c.relative_to(www).as_posix() for c in ch]
        for rp in sorted((www / 'assets/painted').rglob('rig.json')) if (www / 'assets/painted').is_dir() else []:
            ch = downscale_rig(rp.parent)
            if ch:
                n += 1
                modified += [c.relative_to(www).as_posix() for c in ch]
        bad = check_painted(www)
        if bad:
            die('줄인 채색 아틀라스 검사 실패:\n  ' + '\n  '.join(bad[:20]))
        for r in modified:
            sizes[r] = apk_bytes(www / r, r)
        say(f'  채색 아틀라스 {n}개를 휴대폰 밀도(원본의 {TD_SCALE}배, 하한 td {TD_FLOOR_MANIFEST} / srcTD {TD_FLOOR_RIG})로 줄였다')
    est = sum(sizes.values()) + APK_OVERHEAD
    say(f'  → 에셋 단계 {mode}: APK 어림 {est / MB:.2f} MB')

    # 3. apk.json
    files = walk(www)
    cfg = {
        'api': {'origin': origin, 'aliases': aliases},
        'assets': mode,
        'budgetMB': args.budget_mb,
        'web': {**web_info(web), 'files': len(files)},
        'dropped': len(dropped),
    }
    if modified:
        cfg['modified'] = sorted(set(modified))
        cfg['td'] = {'scale': TD_SCALE, 'floorManifest': TD_FLOOR_MANIFEST, 'floorRig': TD_FLOOR_RIG}
    (out / 'app').mkdir(parents=True, exist_ok=True)
    (out / 'app/apk.json').write_text(json.dumps(cfg, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    say(f'  계정 서버 {origin} ({origin_from}){" · 별칭 " + ", ".join(aliases) if aliases else ""}')
    report = {'mode': mode, 'estimate': est, 'estimateFull': est_full, 'estimateLo': est_lo, 'budget': budget, 'files': len(files),
              'dropped': dropped, 'modified': sorted(set(modified)), 'skipped': skipped, 'origin': origin, 'aliases': aliases}
    if args.report:
        Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    if est > budget:
        die(f'에셋을 휴대폰 밀도로 줄여도 APK 어림 {est / MB:.2f} MB 가 예산 {budget / MB:.2f} MB 를 넘습니다', 3)


if __name__ == '__main__':
    main()
