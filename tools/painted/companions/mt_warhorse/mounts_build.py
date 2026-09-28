#!/usr/bin/env python3
"""CMP-MOUNT-ART-A 탈것 다섯 마리 (mt_warhorse · mt_boar · mt_skelsteed · mt_ignis · mt_silva) 빌드 진입점.

패키지가 가진 폴더는 tools/painted/companions/<id>/ 뿐이라 공용 스크립트를 여기에 둔다 (다섯 마리 모두 이 파일로 빌드).
보스 파이프라인(tools/painted/matte.py · build_parts.py · sheet.py)을 그대로 쓰고 설정만 이 폴더 구조에서 읽는다:
  설정  tools/painted/companions/<id>/config.json   (형식: docs/art/BOSS_PIPELINE.md §2 · build_parts.py 머리말)
  원본  tools/painted/companions/<id>/src/*.webp      (Kling 결과 q93; 워터마크는 matte 가 지운다)
  결과  assets/painted/companions/<id>/atlas.webp + manifest.json      작업 파일 tools/painted/.work/<id>/

사용:
  python3 tools/painted/companions/mt_warhorse/mounts_build.py build <id>|all [--force]   매트(캐시) → 부품 → 아틀라스 → 부품 시트
  python3 tools/painted/companions/mt_warhorse/mounts_build.py tune <id>|all              src/render/mount_rig.js MOUNT_TUNE 값 출력
  python3 tools/painted/companions/mt_warhorse/mounts_build.py preview <id>               쉬는 자세 조립 미리보기 (.work/<id>/rest.png)

그림 틀 (config "frame"): 원본 px → 게임 px.  local = (src − [ox, gy]) × lps  (ox = 앞·뒷발굽 가운데, gy = 발굽 바닥선)
MOUNT_TUNE 은 이 틀로 옮긴 관절(부품 피벗)에서 나온다 → 벡터 대체 그림과 채색 퍼핏이 같은 안장·같은 발 위치를 쓴다.
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'painted'))
import matte as M  # noqa: E402
import build_parts as BP  # noqa: E402

IDS = ['mt_warhorse', 'mt_boar', 'mt_skelsteed', 'mt_ignis', 'mt_silva']


def load_config(pid):
    p = os.path.join(ROOT, 'tools', 'painted', 'companions', pid, 'config.json')
    with open(p, encoding='utf-8') as f:
        cfg = json.load(f)
    cfg.setdefault('raw', f'tools/painted/companions/{pid}/src')
    cfg.setdefault('out', f'assets/painted/companions/{pid}')
    cfg['_work'] = os.path.join(ROOT, 'tools', 'painted', '.work', pid)
    return cfg


# 보스 도구가 설정을 이 폴더 구조에서 읽도록 바꿔 끼운다
M.load_config = load_config
BP.load_config = load_config


def build(pid, force=False):
    cfg = load_config(pid)
    for n in M.sources_used(cfg):
        M.matte(cfg, n, force)
    man = BP.build(pid)
    import sheet
    sheet.load_config = load_config
    sheet.main([pid])
    return man


def _pt(cfg, name, piv):
    """부품 피벗(원본 px) → 지역 게임 px"""
    fr = cfg['frame']; lps = fr['lps']
    for p in cfg['parts']:
        if p['name'] == name and piv in p.get('pivots', {}):
            x, y = p['pivots'][piv]
            return [round((x - fr['ox']) * lps, 2), round((y - fr['gy']) * lps, 2)]
    raise KeyError(f'{name}.{piv}')


def tune(pid):
    cfg = load_config(pid)
    P = lambda n, v: _pt(cfg, n, v)  # noqa: E731
    d = lambda a, b: round(math.hypot(b[0] - a[0], b[1] - a[1]), 2)  # noqa: E731
    ang = lambda a, b: round(math.atan2(b[1] - a[1], b[0] - a[0]), 3)  # noqa: E731
    sh, kn, fh = P('foreU', 'a'), P('foreU', 'b'), P('foreL', 'b')
    hp, hk, hh = P('hindU', 'a'), P('hindU', 'b'), P('hindL', 'b')
    nb, poll, muz = P('head', 'base'), P('head', 'poll'), P('head', 'muzzle')
    tr, tt = P('tail', 'a'), P('tail', 'b')
    seat = P('body', 'seat')
    bb = cfg['frame'].get('bodyBox')    # [x0, y0, x1, y1] 원본 px: 몸통(목·다리 제외)
    fr = cfg['frame']; lps = fr['lps']
    body = None
    if bb:
        x0, y0, x1, y1 = [(bb[0] - fr['ox']) * lps, (bb[1] - fr['gy']) * lps, (bb[2] - fr['ox']) * lps, (bb[3] - fr['gy']) * lps]
        body = {'x': round((x0 + x1) / 2, 1), 'y': round((y0 + y1) / 2, 1), 'rx': round((x1 - x0) / 2, 1), 'ry': round((y1 - y0) / 2, 1)}
    n = cfg['frame'].get('tailN', 5)
    out = {
        'sh': sh, 'hp': hp, 'far': cfg['frame'].get('far', [4, -1.5]),
        'l1f': d(sh, kn), 'l2f': d(kn, fh), 'l1h': d(hp, hk), 'l2h': d(hk, hh),
        'neck': {'x': nb[0], 'y': nb[1], 'a': ang(nb, poll), 'len': d(nb, poll)},
        'head': {'a': ang(poll, muz), 'len': d(poll, muz)},
        'tail': {'x': tr[0], 'y': tr[1], 'n': n, 'len': round(d(tr, tt) / n, 2), 'a': ang(tr, tt)},
        'seat': seat,
    }
    if body: out['body'] = body
    return out


def preview(pid):
    """쉬는 자세 조립: 원본 틀 그대로 부품을 다시 겹쳐 본다 (자른 곳·겹침 확인)"""
    from PIL import Image
    cfg = load_config(pid)
    d0 = os.path.join(ROOT, cfg['out'])
    man = json.load(open(os.path.join(d0, 'manifest.json'), encoding='utf-8'))
    atlas = Image.open(os.path.join(d0, 'atlas.webp')).convert('RGBA')
    td, fr = man['td'], cfg['frame']
    k = fr['lps'] * td
    W, H = int(260 * td), int(160 * td)
    ox, oy = W // 2, int(H * 0.85)
    canvas = Image.new('RGBA', (W, H), (60, 60, 64, 255))
    order = ['tail', 'hindL', 'hindU', 'foreL', 'foreU', 'body', 'head']
    for name in order:
        e = man['parts'].get(name)
        if not e: continue
        p = next(q for q in cfg['parts'] if q['name'] == name)
        bx, by = p['box'][0], p['box'][1]
        im = atlas.crop((e['x'], e['y'], e['x'] + e['w'], e['y'] + e['h']))
        x = ox + (bx - fr['ox']) * k; y = oy + (by - fr['gy']) * k
        canvas.alpha_composite(im, (int(round(x)), int(round(y))))
    out = os.path.join(cfg['_work'], 'rest.png')
    canvas.save(out)
    print(out)


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2:
        print(__doc__); sys.exit(1)
    cmd, which = a[0], a[1]
    ids = IDS if which == 'all' else [which]
    for pid in ids:
        if cmd == 'build': build(pid, '--force' in a)
        elif cmd == 'tune': print(pid, json.dumps(tune(pid)))
        elif cmd == 'preview': preview(pid)
        else: print(__doc__); sys.exit(1)
