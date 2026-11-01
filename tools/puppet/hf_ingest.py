#!/usr/bin/env python3
"""Higgsfield 결과(단색 #00FF00 / #FF00FF 배경 PNG) → 퍼펫 원화 소스 등록 (ingest.py 의 Higgsfield 판, rembg 없이 키잉).
  python3 tools/puppet/hf_ingest.py <결과.png> <charId> <이름> [--like <charId>/<원화키>] [--bg green|magenta] [--grey 170]
                                    [--fit] [--scale 1.0] [--dx 0] [--dy 0] [--overlay out.jpg]
  예) hf_ingest.py /dev/shm/asc/dl/side0.png kael kael_grandtemplar_side --like kael/kael_templar_side --fit --overlay /tmp/ov.jpg
결과: tools/puppet/src/<charId>/<이름>.webp (q95, 키잉한 인물을 회색 단색 바탕에 합성) + <이름>_alpha.png (키잉 알파, 커밋)
--like : 부모 원화와 같은 캔버스 크기·바탕 회색으로 맞춘다 (초월 keep-pose 편집 → 부모 리그를 extends 로 그대로 쓰기 위해)
--fit  : 알파 외곽 상자(정수리 y·발바닥 y·가로 가운데)를 부모 원화 알파에 맞춰 크기·위치를 맞춘다 (--scale/--dx/--dy 로 손보정)
--overlay : 부모 알파 윤곽(빨강)과 새 알파 윤곽(파랑)을 겹친 확인용 그림 (관절이 같은 자리인지 눈으로 본다)
키잉: 배경색 우세도(녹색이면 g − max(r,b), 자홍이면 min(r,b) − g)로 알파, 반투명 가장자리의 번짐(spill)을 걷어낸다
(tools/higgsfield/key_green.py 와 같은 식). 인물에 녹색이 있으면 자홍 배경으로 만들고 --bg magenta."""
import argparse, os, sys
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.pup import SRC, ensure  # noqa: E402


def key(rgb, bg='green', lo=0.08, span=0.35):
    a = rgb.astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if bg == 'green':
        d = g - np.maximum(r, b)
    else:
        d = np.minimum(r, b) - g
    al = np.clip(1 - (d - lo) / span, 0, 1)
    edge = (al > 0) & (al < 1)
    if bg == 'green':
        g2 = np.minimum(g, np.maximum(r, b) + 0.02)
        g2 = np.where(edge, np.minimum(g2, (r + b) / 2 + 0.02), g2)
        out = np.dstack([r, g2, b])
    else:
        sp = np.maximum(0, np.minimum(r, b) - g - 0.02)          # 자홍 성분 (빨강·파랑 물체는 min(r,b) 가 작아 거의 0)
        sp = np.where(edge, sp * 1.5, sp)
        out = np.dstack([np.clip(r - sp, 0, 1), g, np.clip(b - sp, 0, 1)])
    # 작은 얼룩(배경 속 잡티) 제거 + 인물 안쪽 구멍은 그대로 (머리카락 사이 배경은 알파가 0)
    al8 = (al * 255 + 0.5).astype(np.uint8)
    from scipy import ndimage as ndi
    lab, n = ndi.label(al8 > 40)
    if n > 1:
        sz = ndi.sum(np.ones_like(al8), lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool); keep[1:] = sz >= max(400, sz.max() * 0.002)
        al8 = np.where(keep[lab] | (al8 <= 40) & ndi.binary_dilation(keep[lab], iterations=3), al8, 0).astype(np.uint8)
    return (out * 255 + 0.5).astype(np.uint8), al8


def bbox(al, th=128):
    ys, xs = np.nonzero(al > th)
    return xs.min(), ys.min(), xs.max(), ys.max()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('png'); ap.add_argument('char'); ap.add_argument('name')
    ap.add_argument('--like', default=None)
    ap.add_argument('--bg', default='green', choices=['green', 'magenta'])
    ap.add_argument('--grey', type=int, default=None, help='바탕 회색 값 (기본: --like 원화 모서리, 없으면 170)')
    ap.add_argument('--fit', action='store_true')
    ap.add_argument('--scale', type=float, default=1.0)
    ap.add_argument('--dx', type=float, default=0.0)
    ap.add_argument('--dy', type=float, default=0.0)
    ap.add_argument('--overlay', default=None)
    a = ap.parse_args()
    src = np.asarray(Image.open(a.png).convert('RGB'))
    rgb, al = key(src, a.bg)
    grey = a.grey
    W, H = src.shape[1], src.shape[0]
    pal = None
    if a.like:
        lp = os.path.join(SRC, a.like + '.webp')
        lim = Image.open(lp).convert('RGB')
        W, H = lim.size
        if grey is None:
            grey = int(np.median(np.asarray(lim)[:40, :40]))
        pal = np.asarray(Image.open(os.path.join(SRC, a.like + '_alpha.png')).convert('L'))
    grey = 170 if grey is None else grey
    # 캔버스 맞춤: 먼저 같은 크기로 늘이고(가로세로 비 차이 < 1%), --fit 이면 알파 외곽 상자로 크기·위치
    k = W / src.shape[1]
    s, dx, dy = k * a.scale, a.dx, a.dy
    if a.fit and pal is not None:
        px0, py0, px1, py1 = bbox(pal)
        cx0, cy0, cx1, cy1 = bbox(al)
        s = (py1 - py0) / max(1, (cy1 - cy0)) * a.scale
        # 발바닥(아래 끝)과 가로 가운데를 맞춘다 (정수리는 머리 장식 때문에 달라질 수 있어 높이 맞춤은 --scale 로 보정)
        dx += (px0 + px1) / 2 - (cx0 + cx1) / 2 * s
        dy += py1 - cy1 * s
    else:
        dx += 0; dy += 0
    M = (1 / s, 0, -dx / s, 0, 1 / s, -dy / s)
    rgbI = Image.fromarray(rgb).transform((W, H), Image.AFFINE, M, resample=Image.BICUBIC, fillcolor=(grey, grey, grey))
    alI = Image.fromarray(al, 'L').transform((W, H), Image.AFFINE, M, resample=Image.BICUBIC, fillcolor=0)
    A = np.asarray(alI).astype(np.float32)[..., None] / 255
    comp = (np.asarray(rgbI).astype(np.float32) * A + grey * (1 - A) + 0.5).astype(np.uint8)
    d = ensure(os.path.join(SRC, a.char))
    out = os.path.join(d, a.name + '.webp')
    Image.fromarray(comp).save(out, 'WEBP', quality=95, method=6)
    apth = os.path.join(d, a.name + '_alpha.png')
    alI.save(apth, optimize=True)
    print('saved', out, W, 'x', H, os.path.getsize(out) // 1024, 'KB; alpha', os.path.getsize(apth) // 1024, 'KB; scale', round(s, 4), 'dx', round(dx, 1), 'dy', round(dy, 1))
    if pal is not None:
        na = np.asarray(alI) > 128; pa = pal > 128
        iou = (na & pa).sum() / max(1, (na | pa).sum())
        print('IoU vs', a.like, round(float(iou), 3), 'bbox parent', bbox(pal), 'new', bbox(np.asarray(alI)))
        if a.overlay:
            base = Image.fromarray(comp).convert('RGB')
            e1 = np.asarray(Image.fromarray((pa * 255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES)) > 0
            e2 = np.asarray(Image.fromarray((na * 255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES)) > 0
            from scipy import ndimage as ndi
            e1 = ndi.binary_dilation(e1, iterations=2); e2 = ndi.binary_dilation(e2, iterations=2)
            o = np.asarray(base).copy()
            o[e1] = (255, 0, 0); o[e2] = (0, 120, 255)
            Image.fromarray(o).resize((W // 2, H // 2)).save(a.overlay, quality=85)
            print('overlay', a.overlay)


if __name__ == '__main__':
    main()
