#!/usr/bin/env python3
"""애니풍 시범: 기존 리그 테이블(tools/puppet/rigs/<char>/<cls>.json)을 새 원화 좌표로 옮겨 애니 리그 테이블의 출발점을 만든다.
클링 o1 스타일 전이는 자세·구도를 거의 그대로 두므로(카엘 헌터: 실루엣 IoU 0.85, 몸통 아래 ECC 0.997) 옛 관절·영역을
아핀 변환 한 번으로 옮기고, 달라진 곳(머리카락 부피·포니테일)만 손으로 고친다(overrides).
  python3 tools/puppet/anime/make_rig.py kael kael_hunter [--fit] [--out tools/puppet/anime/rigs/kael/kael_hunter.json]
--fit: 옛/새 알파(목 아래)로 ECC 아핀을 다시 잰다. 없으면 아래 AFF 값 사용."""
import argparse, json, os, sys, copy
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
PUP = os.path.dirname(HERE)
sys.path.insert(0, PUP)

# kael_hunter: 옛 원화 → o1 애니 원화 (findTransformECC MOTION_AFFINE, y>700, 1/4 축소 + 블러 2)
AFF = {'kael_hunter': [[1.0424363613128662, -0.00022151850862428546, -40.996028900146484],
                       [0.004771113861352205, 1.0084813833236694, -14.031304359436035]]}


def fit(char, cls):
    import cv2
    from PIL import Image
    a0 = (np.asarray(Image.open(os.path.join(PUP, 'src', char, cls + '_side_alpha.png')).convert('L')) > 127).astype(np.float32)
    a1 = (np.asarray(Image.open(os.path.join(HERE, 'src', char, cls + '_side_alpha.png')).convert('L')) > 127).astype(np.float32)
    a0[:700] = 0; a1[:700] = 0
    s = 0.25
    b0 = cv2.GaussianBlur(cv2.resize(a0, None, fx=s, fy=s), (0, 0), 2); b1 = cv2.GaussianBlur(cv2.resize(a1, None, fx=s, fy=s), (0, 0), 2)
    W = np.eye(2, 3, dtype=np.float32)
    cc, W = cv2.findTransformECC(b0, b1, W, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 500, 1e-6), None, 5)
    W[:, 2] /= s
    print('ECC', round(float(cc), 4), W.tolist())
    return W.tolist()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('char'); ap.add_argument('cls')
    ap.add_argument('--fit', action='store_true')
    ap.add_argument('--out', default=None)
    a = ap.parse_args()
    M = np.array(fit(a.char, a.cls) if a.fit else AFF[a.cls], float)
    old = json.load(open(os.path.join(PUP, 'rigs', a.char, a.cls + '.json'), encoding='utf-8'))
    P = lambda p: [round(float(M[0, 0] * p[0] + M[0, 1] * p[1] + M[0, 2]), 1), round(float(M[1, 0] * p[0] + M[1, 1] * p[1] + M[1, 2]), 1)]
    Y = lambda y, x=800: P([x, y])[1]
    X = lambda x, y=1500: P([x, y])[0]
    sx = float(np.hypot(M[0, 0], M[1, 0]))
    r = copy.deepcopy(old)
    r['_doc'] = ('애니풍 시범 리그 (ANIME-ART-PILOT). tools/puppet/anime/make_rig.py 가 옛 리그(tools/puppet/rigs/%s/%s.json)를 '
                 '클링 o1 애니 원화 좌표로 아핀 변환해 만든 뒤 overrides 로 머리카락·포니테일만 고침. 형식은 docs/art/PUPPET_PIPELINE.md') % (a.char, a.cls)
    r['src'] = f'{a.char}/{a.cls}_side'
    J = {}
    for k, v in old['joints'].items():
        J[k] = Y(v, old['joints']['ankle'][0]) if isinstance(v, (int, float)) else P(v)
    r['joints'] = J
    R = {}
    for k, v in old['regions'].items():
        if v is None:
            R[k] = None
        elif isinstance(v, dict) and 'rect' in v:
            x0, y0, x1, y1 = v['rect']; p0, p1 = P([x0, y0]), P([x1, y1]); R[k] = {'rect': [round(p0[0]), round(p0[1]), round(p1[0]), round(p1[1])]}
        elif isinstance(v, dict):
            R[k] = dict(v, pts=[P(p) for p in v['pts']])
        else:
            R[k] = [P(p) for p in v]
    r['regions'] = R
    c = r.get('clean', {})
    for k in ('keepHoles', 'hairZone'):
        if c.get(k):
            p0, p1 = P(c[k][:2]), P(c[k][2:]); c[k] = [round(p0[0]), round(p0[1]), round(p1[0]), round(p1[1])]
    L = r.get('legs', {})
    if L.get('coatEdge'): L['coatEdge'] = [P(p) for p in L['coatEdge']]
    if L.get('footLine'):
        y0, x0, sl = L['footLine']; q = P([x0, y0]); L['footLine'] = [q[1], q[0], sl]
    for k in ('thighWidth', 'thighUp', 'coatEdgeW'):
        if k in L: L[k] = round(L[k] * sx, 1)
    if 'footMinX' in L: L['footMinX'] = X(L['footMinX'], 2450)
    if 'shinBootY' in L: L['shinBootY'] = Y(L['shinBootY'], 1000)
    pr = r.get('params', {})
    if 'ponyTopY' in pr: pr['ponyTopY'] = Y(pr['ponyTopY'], 600)
    r.pop('turn', None)                      # 턴은 tools/puppet/anime/build_turn16.py 가 따로
    r['bodyTop'] = round(Y(267, 790))        # 배율 기준 정수리 = 옛 원화 정수리 자리 (부풀어진 머리카락이 몸을 작게 만들지 않게)
    ov_p = os.path.join(HERE, 'rigs', a.char, a.cls + '.overrides.json')
    if os.path.exists(ov_p):
        from build_rig import deep_merge
        ov = json.load(open(ov_p, encoding='utf-8'))
        r = deep_merge(r, ov)
        print('overrides', ov_p, list(ov.keys()))
    out = a.out or os.path.join(HERE, 'rigs', a.char, a.cls + '.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(r, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('wrote', out)


if __name__ == '__main__':
    main()
