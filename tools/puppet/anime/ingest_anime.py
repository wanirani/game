#!/usr/bin/env python3
"""애니풍 시범(ANIME-ART-PILOT) 원화 등록 — tools/puppet/ingest.py 와 같지만 출력이 tools/puppet/anime/src/<charId>/ 이다.
  python3 tools/puppet/anime/ingest_anime.py <클링.png> <charId> <이름> [--no-alpha] [--deshadow]
클링 o1 결과는 urlWithoutWatermark 로 받으므로 워터마크 제거를 하지 않는다(--wm 으로 켤 수 있음).
--deshadow: 발밑 바닥 그림자(o1 결과의 옅은 회청색 그림자)를 알파에서 뺀다 (build_turn.floor_shadow 재사용).
배경: o1 결과는 위→아래로 아주 옅은 회백색 그라디언트 → rembg(isnet-general-use) 알파 + 테두리에서 이어진 배경색 홍수 채움으로 보정."""
import argparse, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from lib.pup import ensure, rgb_of, remove_watermark, rembg_alpha  # noqa: E402

ASRC = os.path.join(HERE, 'src')


def bg_flood(rgb, T=10):
    """행별 배경색(좌우 24px 중앙값)과의 거리 < T 인 화소 중 테두리에서 이어진 것 = 배경 (notes_heroes1 §2 와 같은 방식)"""
    f = rgb.astype(np.float32)
    bgrow = np.median(np.concatenate([f[:, :24], f[:, -24:]], 1), axis=1)
    near = np.abs(f - bgrow[:, None, :]).max(2) < T
    lab, n = ndi.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    return np.isin(lab, list(edge))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('png'); ap.add_argument('char'); ap.add_argument('name')
    ap.add_argument('--wm', action='store_true')
    ap.add_argument('--no-alpha', action='store_true')
    ap.add_argument('--deshadow', action='store_true')
    a = ap.parse_args()
    rgb = rgb_of(a.png)
    if a.wm:
        rgb = remove_watermark(rgb)
    d = ensure(os.path.join(ASRC, a.char))
    out = os.path.join(d, a.name + '.webp')
    Image.fromarray(rgb).save(out, 'WEBP', quality=95, method=6)
    print('saved', out, rgb.shape[1], 'x', rgb.shape[0], os.path.getsize(out) // 1024, 'KB')
    if a.no_alpha:
        return
    al = rembg_alpha(rgb) > 127
    bg = bg_flood(rgb)
    al = (al | ~bg) & ~bg                     # 배경 홍수 채움이 이긴다 (윤곽선이 있어 옷 안쪽은 막힘)
    al = ndi.binary_fill_holes(al)
    if a.deshadow:
        sys.path.insert(0, os.path.dirname(HERE))
        from build_turn import floor_shadow
        al = floor_shadow(rgb, al, {'band': 0.1, 'T': 0.14, 'sd': 8.0})
    lab, n = ndi.label(al)
    if n > 1:
        sz = ndi.sum(al, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool); keep[1:] = sz > max(500, 0.003 * sz.max())
        al = keep[lab]
    ap_ = os.path.join(d, a.name + '_alpha.png')
    Image.fromarray((al * 255).astype(np.uint8), 'L').save(ap_, optimize=True)
    print('alpha', ap_, os.path.getsize(ap_) // 1024, 'KB')


if __name__ == '__main__':
    main()
