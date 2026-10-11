#!/usr/bin/env python3
"""16방향 턴테이블(현재 유화풍 원화) 1단계: 클링 image_to_video 첫 프레임 만들기
  python3 tools/puppet/turn16_src.py kael_templar [--out DIR]
지금 게임이 쓰는 그 외형의 앞모습(턴어라운드 시트 turn5 의 y90 인물, 원본 해상도)을 잘라
720×1280 단색 회색 바탕 가운데에 세운다 (발 = 아래에서 80 px, 키 ≈ 1040 px). 결과: <out>/<cls>_front.jpg
앞모습이 turn5 에 없으면(라벨 '-') extra 시트의 y90 → 그것도 없으면 assets/puppets/<cid>/<cls>/turn.webp 의 y90 뷰.
원화의 정체성(얼굴·의상·색·무기)은 그대로 — 클링에는 '돌기만' 시킨다 (tools/puppet/turn16_build.py 가 16방향을 뽑는다)."""
import argparse, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.pup import SRC, OUT, RIGS, load_json, rgb_of, alpha_for, die  # noqa: E402

W, H = 720, 1280
FIG_H = 1040
FOOT_Y = H - 80
BG = (128, 128, 128)


def figures(sheet_key, k):
    """시트의 인물 k 개 (왼쪽→오른쪽): [(rgb 잘라낸 것, alpha)]"""
    p = os.path.join(SRC, sheet_key + '.webp')
    if not os.path.exists(p):
        return None
    rgb = rgb_of(p)
    Hh, Ww = rgb.shape[:2]
    a = alpha_for(p, os.path.join(SRC, sheet_key + '_alpha.png')).astype(np.float32) / 255
    m = a > 0.5
    m[int(Hh * 0.93):, int(Ww * 0.8):] = False                   # 워터마크 자리
    m = ndi.binary_opening(ndi.binary_fill_holes(m), iterations=1)
    lab, n = ndi.label(m)
    if not n:
        return None
    sizes = ndi.sum(m, lab, range(1, n + 1))
    comps = [i + 1 for i in np.argsort(-sizes)[:k] if sizes[i] > 15000]
    boxes = []
    for c in comps:
        ys, xs = np.where(lab == c)
        boxes.append((xs.min(), ys.min(), xs.max(), ys.max(), c))
    boxes.sort()
    out = []
    for x0, y0, x1, y1, c in boxes:
        keep = ndi.binary_dilation(lab == c, iterations=3)
        al = (a * keep)[y0:y1 + 1, x0:x1 + 1]
        out.append((rgb[y0:y1 + 1, x0:x1 + 1], al))
    return out


def front_of(cid, cls):
    rig = load_json(os.path.join(RIGS, cid, cls + '.json'))
    T = rig.get('turn') or {}
    srcs = [(T.get('sheet5'), T.get('views5') or [])] + [(e.get('sheet'), e.get('views') or []) for e in T.get('extra') or []]
    for key, labels in srcs:
        if key and 'y90' in labels:
            figs = figures(key, len(labels))
            if figs and len(figs) == len(labels):
                return figs[labels.index('y90')] + (key,)
    # 대체: 이미 만든 게임 턴 시트의 앞모습 뷰
    rj = load_json(os.path.join(OUT, cid, cls, 'rig.json'))
    v = rj['turn']['views']['y90']
    im = np.asarray(Image.open(os.path.join(OUT, cid, cls, 'turn.webp')).convert('RGBA'))
    y = v.get('y', 0)
    crop = im[y:y + v['h'], v['x']:v['x'] + v['w']]
    return crop[..., :3], crop[..., 3].astype(np.float32) / 255, 'turn.webp:y90'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cls')
    ap.add_argument('--out', default='/tmp/claude-0/g4/turnmount_src')
    a = ap.parse_args()
    cid = a.cls.split('_')[0]
    rgb, al, src = front_of(cid, a.cls)
    ys = np.where(al.max(1) > 0.5)[0]
    xs = np.where(al.max(0) > 0.5)[0]
    if not len(ys):
        die('앞모습 인물 없음')
    rgb, al = rgb[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1], al[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
    s = FIG_H / rgb.shape[0]
    nw, nh = max(1, round(rgb.shape[1] * s)), FIG_H
    if nw > W - 40:                                               # 아주 넓은 인물(날개 등)은 폭에 맞춤
        s = (W - 40) / rgb.shape[1]; nw, nh = W - 40, max(1, round(rgb.shape[0] * s))
    fig = Image.fromarray(rgb).resize((nw, nh), Image.LANCZOS)
    am = Image.fromarray((al * 255).astype(np.uint8), 'L').resize((nw, nh), Image.LANCZOS)
    can = Image.new('RGB', (W, H), BG)
    can.paste(fig, ((W - nw) // 2, FOOT_Y - nh), am)
    os.makedirs(a.out, exist_ok=True)
    p = os.path.join(a.out, a.cls + '_front.jpg')
    can.save(p, quality=93)
    print(f'{a.cls}: {src} → {p} ({nw}x{nh})')


if __name__ == '__main__':
    main()
