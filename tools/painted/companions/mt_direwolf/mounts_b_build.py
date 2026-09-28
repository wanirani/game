#!/usr/bin/env python3
"""CMP-MOUNT-ART-B 탈것 네 마리 (mt_direwolf · mt_wyvern · mt_giantbat · mt_gale) 빌드 진입점.

CMP-MOUNT-ART-A 의 파이프라인(tools/painted/companions/mt_warhorse/mounts_build.py)과 같은 방식:
보스 도구(tools/painted/matte.py · build_parts.py · sheet.py · grid.py)를 그대로 쓰고 설정만 이 패키지 폴더에서 읽는다.
  설정  tools/painted/companions/<id>/config.json   (형식: build_parts.py 머리말)
  원본  tools/painted/companions/<id>/src/*.webp      (Kling 결과 q93; 워터마크는 matte 가 지운다)
  결과  assets/painted/companions/<id>/atlas.webp + manifest.json      작업 파일 tools/painted/.work/<id>/

사용:
  python3 tools/painted/companions/mt_direwolf/mounts_b_build.py build <id>|all [--force]   매트(캐시) → 부품 → 아틀라스 → 부품 시트
  python3 tools/painted/companions/mt_direwolf/mounts_b_build.py grid <id> <원본> [x0 y0 x1 y1] [--step 50] [--scale 0.5]
  python3 tools/painted/companions/mt_direwolf/mounts_b_build.py tune <id>|all              src/render/mounts_b.js 의 템플릿 치수 출력
  python3 tools/painted/companions/mt_direwolf/mounts_b_build.py preview <id>               쉬는 자세 조립 미리보기 (.work/<id>/rest.png)

그림 틀 (config "frame"): 원본 px → 게임 px.  local = (src − [ox, gy]) × lps  (ox = 안장이 데이터 안장 x 에 오는 점, gy = 발 바닥선)
tune 은 이 틀로 옮긴 부품 피벗(관절)을 게임 px 로 출력한다 → mounts_b.js 템플릿(벡터 대체 그림과 채색 퍼핏이 함께 쓰는 치수).
부품 이름 (있는 것만): body · head(목+머리: base 목뿌리 · poll · muzzle · eye …) · jaw(아래턱, hinge) · foreU/foreL · hindU/hindL
(a = 윗관절, b = 아랫관절/발 바닥) · legU/legL (두 발 짐승) · tail (a 뿌리 → b 끝) · wingIn(날개 안쪽: root 어깨 · wrist 손목) ·
wingOut(날개 바깥: wrist · tip)
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'painted'))
import matte as M  # noqa: E402
import build_parts as BP  # noqa: E402

IDS = ['mt_direwolf', 'mt_wyvern', 'mt_giantbat', 'mt_gale']


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


def grid(argv):
    import grid as G
    G.load_config = load_config
    return G.main(argv)


def _part(cfg, name):
    for p in cfg['parts']:
        if p['name'] == name:
            return p
    return None


def _pt(cfg, name, piv):
    """부품 피벗(원본 px) → 지역 게임 px"""
    fr = cfg['frame']; lps = fr['lps']
    p = _part(cfg, name)
    if p and piv in p.get('pivots', {}):
        x, y = p['pivots'][piv]
        return [round((x - fr['ox']) * lps, 2), round((y - fr['gy']) * lps, 2)]
    return None


def tune(pid):
    cfg = load_config(pid)
    P = lambda n, v: _pt(cfg, n, v)  # noqa: E731
    d = lambda a, b: round(math.hypot(b[0] - a[0], b[1] - a[1]), 2)  # noqa: E731
    ang = lambda a, b: round(math.atan2(b[1] - a[1], b[0] - a[0]), 3)  # noqa: E731
    fr = cfg['frame']; lps = fr['lps']
    out = {}
    if P('foreU', 'a'):
        sh, kn, fh = P('foreU', 'a'), P('foreU', 'b'), P('foreL', 'b')
        out.update({'sh': sh, 'l1f': d(sh, kn), 'l2f': d(kn, fh), 'footF': round(fh[0] - sh[0], 2)})
    if P('hindU', 'a'):
        hp, hk, hh = P('hindU', 'a'), P('hindU', 'b'), P('hindL', 'b')
        out.update({'hp': hp, 'l1h': d(hp, hk), 'l2h': d(hk, hh), 'footH': round(hh[0] - hp[0], 2)})
    if P('legU', 'a'):
        hp, kn, ft = P('legU', 'a'), P('legU', 'b'), P('legL', 'b')
        out.update({'hip': hp, 'l1': d(hp, kn), 'l2': d(kn, ft), 'foot': round(ft[0] - hp[0], 2)})
    if P('head', 'base'):
        nb, poll, muz = P('head', 'base'), P('head', 'poll'), P('head', 'muzzle')
        out['neck'] = {'x': nb[0], 'y': nb[1], 'a': ang(nb, poll), 'len': d(nb, poll)}
        out['head'] = {'a': ang(poll, muz), 'len': d(poll, muz)}
    if P('tail', 'a'):
        tr, tt = P('tail', 'a'), P('tail', 'b')
        n = fr.get('tailN', 5)
        out['tail'] = {'x': tr[0], 'y': tr[1], 'n': n, 'len': round(d(tr, tt) / n, 2), 'a': ang(tr, tt)}
    if P('wingIn', 'root'):
        r, w, t = P('wingIn', 'root'), P('wingIn', 'wrist'), P('wingOut', 'tip')
        out['wing'] = {'x': r[0], 'y': r[1], 'arm': d(r, w), 'hand': d(w, t), 'armA': ang(r, w), 'handA': ang(w, t)}
    if P('body', 'seat'):
        out['seat'] = P('body', 'seat')
    bb = fr.get('bodyBox')
    if bb:
        x0, y0, x1, y1 = [(bb[0] - fr['ox']) * lps, (bb[1] - fr['gy']) * lps, (bb[2] - fr['ox']) * lps, (bb[3] - fr['gy']) * lps]
        out['body'] = {'x': round((x0 + x1) / 2, 1), 'y': round((y0 + y1) / 2, 1), 'rx': round((x1 - x0) / 2, 1), 'ry': round((y1 - y0) / 2, 1)}
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
    W, H = int(300 * td), int(220 * td)
    ox, oy = W // 2, int(H * 0.85)
    canvas = Image.new('RGBA', (W, H), (60, 60, 64, 255))
    order = cfg.get('previewOrder') or ['tail', 'wingOut', 'wingIn', 'hindL', 'hindU', 'legL', 'legU', 'foreL', 'foreU', 'body', 'jaw', 'head']
    for name in order:
        e = man['parts'].get(name)
        p = _part(cfg, name)
        if not e or not p: continue
        bx, by = p['box'][0], p['box'][1]
        im = atlas.crop((e['x'], e['y'], e['x'] + e['w'], e['y'] + e['h']))
        x = ox + (bx - fr['ox']) * k; y = oy + (by - fr['gy']) * k
        canvas.alpha_composite(im, (int(round(x)), int(round(y))))
    out = os.path.join(cfg['_work'], 'rest.png')
    os.makedirs(cfg['_work'], exist_ok=True)
    canvas.save(out)
    print(out)


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2:
        print(__doc__); sys.exit(1)
    cmd, which = a[0], a[1]
    if cmd == 'grid':
        sys.exit(grid(a[1:]))
    ids = IDS if which == 'all' else [which]
    for pid in ids:
        if cmd == 'build': build(pid, '--force' in a)
        elif cmd == 'tune': print(pid, json.dumps(tune(pid)))
        elif cmd == 'preview': preview(pid)
        else: print(__doc__); sys.exit(1)
