#!/usr/bin/env python3
"""저사양 이미지 변형 assets/lo/ 만들기 — owner: DELIVERY-WEB (platform §6.7, MASTER_PLAN §1.20)

bg/ · cg/ · portraits/ 의 그림마다 60 % 선형 크기(넓이 36 %)의 webp q72 사본을 assets/lo/<폴더>/<이름>.webp 에 만든다.
src/core/assets.js 는 등급이 low 이거나 (medium 이고 백킹 높이 ≤ 640) 일 때 이 사본을 쓴다. 단, 사본이 있다고 알려진
키에만 쓴다(404 로 찔러보지 않는다): 배포 빌드(tools/deploy/build_web.mjs)가 assets/lo/index.json 의 keys 를
build-info.js 의 window.__BN_BUILD.lo 로 넘긴다.

증분·멱등: 원본의 sha256 앞 12자리와 변환 설정이 index.json 기록과 같고 결과 파일이 있으면 다시 만들지 않는다.
원본이 사라진 사본과 index.json 에 없는 파일은 지운다. 결과가 원본보다 10 % 이상 작지 않으면 사본을 두지 않는다
(그 키는 keys 에 없으므로 게임이 원본을 쓴다). 내용이 바뀌지 않으면 index.json 도 다시 쓰지 않는다 (git 변경 없음).

  python3 tools/assets/make_variants.py            # 필요한 것만 만든다
  python3 tools/assets/make_variants.py --check    # 빠졌거나 낡은 사본이 있으면 exit 1 (아무것도 쓰지 않음)
  python3 tools/assets/make_variants.py --force    # 전부 다시 만든다
  [--jobs N] [--quiet]

미술 패키지가 그림을 더하거나 바꾼 뒤(W6 배포 전 포함) 다시 돌리면 된다.
"""
import argparse
import hashlib
import io
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ASSETS = os.path.join(ROOT, 'assets')
LO = os.path.join(ASSETS, 'lo')
INDEX = os.path.join(LO, 'index.json')
FOLDERS = {'bg': 'webp', 'cg': 'webp', 'portraits': 'webp'}  # src/core/assets.js LO_FOLDERS + EXT
SCALE = 0.6
QUALITY = 72
METHOD = 6
MIN_GAIN = 0.10   # 원본 대비 최소 절약 비율 (못 미치면 사본을 두지 않는다)
PARAMS = f'scale={SCALE};q={QUALITY};m={METHOD};lanczos'


def sha12(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()[:12]


def sources():
    """[(key, rel, abs)] — rel = assets/ 기준 경로 (확장자 포함)"""
    out = []
    for folder, ext in FOLDERS.items():
        base = os.path.join(ASSETS, folder)
        if not os.path.isdir(base):
            continue
        for dp, dns, fns in os.walk(base):
            dns.sort()
            for fn in sorted(fns):
                if not fn.lower().endswith('.' + ext) or fn.startswith('.'):
                    continue
                ab = os.path.join(dp, fn)
                rel = os.path.relpath(ab, ASSETS).replace(os.sep, '/')
                out.append((rel[: -len(ext) - 1], rel, ab))
    return out


def encode(job):
    """원본 → lo 바이트 (다른 프로세스에서 실행)"""
    rel, ab = job
    from PIL import Image
    with Image.open(ab) as im:
        im.load()
        w, h = im.size
        nw, nh = max(1, round(w * SCALE)), max(1, round(h * SCALE))
        mode = 'RGBA' if (im.mode in ('RGBA', 'LA', 'PA') or 'transparency' in im.info) else 'RGB'
        src = im.convert(mode)
        small = src.resize((nw, nh), Image.LANCZOS)
        buf = io.BytesIO()
        kw = {'quality': QUALITY, 'method': METHOD}
        if mode == 'RGBA':
            kw['alpha_quality'] = 90
        small.save(buf, 'WEBP', **kw)
        return rel, buf.getvalue(), (w, h), (nw, nh)


def load_index():
    try:
        with open(INDEX, encoding='utf-8') as f:
            ix = json.load(f)
        if isinstance(ix, dict) and ix.get('v') == 1 and isinstance(ix.get('files'), dict):
            return ix
    except (OSError, ValueError):
        pass
    return {'v': 1, 'files': {}}


def main():
    ap = argparse.ArgumentParser(description='assets/lo/ 저사양 변형 만들기')
    ap.add_argument('--check', action='store_true', help='빠졌거나 낡은 사본이 있으면 exit 1 (쓰지 않음)')
    ap.add_argument('--force', action='store_true', help='전부 다시 만든다')
    ap.add_argument('--jobs', type=int, default=max(1, min(4, (os.cpu_count() or 2) // 2)))
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()
    log = (lambda *x: None) if a.quiet else (lambda *x: print(*x))

    old = load_index()
    old_files = old.get('files', {}) if old.get('params') == PARAMS else {}
    srcs = sources()
    todo, keep, stale = [], {}, []
    for key, rel, ab in srcs:
        h = sha12(ab)
        rec = old_files.get(rel)
        out = os.path.join(LO, rel)
        if not a.force and rec and rec.get('src') == h and (rec.get('skip') or os.path.isfile(out)):
            keep[rel] = rec
            continue
        stale.append(rel)
        todo.append((rel, ab, h))

    wanted = {rel for _, rel, _ in srcs}
    orphans = []
    if os.path.isdir(LO):
        for dp, _, fns in os.walk(LO):
            for fn in fns:
                ab = os.path.join(dp, fn)
                rel = os.path.relpath(ab, LO).replace(os.sep, '/')
                if rel == 'index.json':
                    continue
                if rel not in wanted or (rel in keep and keep[rel].get('skip')):
                    orphans.append(rel)

    if a.check:
        bad = stale + [f'(남은 파일) {o}' for o in orphans]
        if bad:
            print(f'assets/lo 가 낡았습니다 ({len(stale)}개 새로 만들어야 함, 남은 파일 {len(orphans)}개) — python3 tools/assets/make_variants.py')
            for b in bad[:20]:
                print('  ', b)
            return 1
        log(f'assets/lo 최신: 사본 {sum(1 for r in keep.values() if not r.get("skip"))}개')
        return 0

    files = dict(keep)
    made = skipped = 0
    if todo:
        log(f'lo 사본 만드는 중: {len(todo)}개 (jobs={a.jobs})')
        hashes = {rel: h for rel, _, h in todo}
        src_bytes = {rel: os.path.getsize(ab) for rel, ab, _ in todo}
        jobs = [(rel, ab) for rel, ab, _ in todo]
        if a.jobs > 1 and len(jobs) > 1:
            with ProcessPoolExecutor(max_workers=a.jobs) as ex:
                results = list(ex.map(encode, jobs))
        else:
            results = [encode(j) for j in jobs]
        for rel, data, (w, h), (nw, nh) in results:
            out = os.path.join(LO, rel)
            sb = src_bytes[rel]
            if len(data) > sb * (1 - MIN_GAIN):
                files[rel] = {'src': hashes[rel], 'skip': 'no gain', 'srcBytes': sb}
                if os.path.isfile(out):
                    os.remove(out)
                skipped += 1
                continue
            os.makedirs(os.path.dirname(out), exist_ok=True)
            prev = None
            if os.path.isfile(out):
                with open(out, 'rb') as f:
                    prev = f.read()
            if prev != data:
                tmp = out + '.tmp'
                with open(tmp, 'wb') as f:
                    f.write(data)
                os.replace(tmp, out)
            files[rel] = {'src': hashes[rel], 'w': nw, 'h': nh, 'bytes': len(data), 'srcBytes': sb}
            made += 1
    for rel in orphans:
        try:
            os.remove(os.path.join(LO, rel))
        except OSError:
            pass
        files.pop(rel, None)
    # 빈 폴더 정리
    if os.path.isdir(LO):
        for dp, dns, fns in sorted(os.walk(LO), key=lambda t: -len(t[0])):
            if dp != LO and not os.listdir(dp):
                os.rmdir(dp)

    files = {k: files[k] for k in sorted(files) if k in wanted}
    keys = sorted(rel.rsplit('.', 1)[0] for rel, r in files.items() if not r.get('skip'))
    total_src = sum(r.get('srcBytes', 0) for r in files.values() if not r.get('skip'))
    total_lo = sum(r.get('bytes', 0) for r in files.values() if not r.get('skip'))
    ix = {'v': 1, 'params': PARAMS, 'scale': SCALE, 'quality': QUALITY, 'keys': keys, 'files': files}
    text = json.dumps(ix, ensure_ascii=False, indent=1, sort_keys=False) + '\n'
    os.makedirs(LO, exist_ok=True)
    cur = None
    if os.path.isfile(INDEX):
        with open(INDEX, encoding='utf-8') as f:
            cur = f.read()
    if cur != text:
        with open(INDEX, 'w', encoding='utf-8') as f:
            f.write(text)
    ratio = (total_lo / total_src * 100) if total_src else 0
    log(f'assets/lo: 사본 {len(keys)}개 (새로 {made}, 이득 없어 건너뜀 {skipped}, 지움 {len(orphans)}), '
        f'{total_lo / 1048576:.2f} MB = 원본 {total_src / 1048576:.2f} MB 의 {ratio:.0f} %')
    return 0


if __name__ == '__main__':
    sys.exit(main())
