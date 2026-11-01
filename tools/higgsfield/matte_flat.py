#!/usr/bin/env python3
"""rembg 없이 평평한 회색 배경 그림을 매트한다 (tools/painted/matte.py 와 같은 결과 파일, rembg 실루엣 대신 바깥 배경 채우기).

  python3 tools/higgsfield/matte_flat.py SRC.webp OUT.png [--key 9 --soft 22 --hard 6 --t 16]

- 실루엣(ar) = 1 − (그림 테두리에 닿은 '배경 같은' 영역).  배경 같은 = 배경색과의 거리 < t.
- 그 뒤는 matte.py 와 같다: 거리 키로 진짜 배경(막의 구멍)을 뚫고, hard 미만은 투명, 작은 섬 제거, 배경색 섞임 제거.
- 7·8단계 Higgsfield 그림(워터마크 없음)을 tools/painted 파이프라인에 넣을 때 쓴다: 결과를
  tools/painted/.work/<id>/matte/<원본이름>.png (빌드가 원본보다 새로우면 matte 를 건너뛴다) 에 두면 된다.
  (이 환경에는 rembg 가 없다 — tools/painted/matte.py 는 rembg 를 부른다.)
"""
import sys, argparse
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--key', type=float, default=9.0); ap.add_argument('--soft', type=float, default=22.0)
    ap.add_argument('--hard', type=float, default=6.0); ap.add_argument('--t', type=float, default=16.0)
    ap.add_argument('--min-island', type=int, default=60)
    o = ap.parse_args()
    a = np.asarray(Image.open(o.src).convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    border = np.concatenate([a[:6].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(border, 0)
    dist = np.sqrt(((a - bg) ** 2).sum(2))
    bgl = dist < o.t
    lab, n = ndi.label(bgl)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    outside = np.isin(lab, edge[edge > 0])
    ar = ndi.gaussian_filter(1 - outside.astype(np.float32), 1.0)
    key = np.clip((dist - o.key) / o.soft, 0, 1)
    alpha = np.minimum(np.maximum(ar, key * (ar > 0.02)), np.clip((dist - o.hard + 1) / 10.0, 0, 1))
    alpha = ndi.gaussian_filter(alpha, 0.6)
    alpha[dist < o.hard] = 0
    lab, n = ndi.label(alpha > 0.5)
    if n > 1:
        sizes = ndi.sum(np.ones_like(alpha), lab, range(1, n + 1))
        small = np.isin(lab, np.where(sizes < o.min_island)[0] + 1)
        alpha[small] = 0
    A = alpha[..., None]
    col = np.where(A > 0.05, (a - (1 - A) * bg) / np.maximum(A, 0.05), a)
    Image.fromarray(np.dstack([np.clip(col, 0, 255), alpha * 255]).astype(np.uint8), 'RGBA').save(o.dst)
    print(f'{o.dst}: bg={bg.round(1).tolist()} alpha_mean={alpha.mean():.3f}')


if __name__ == '__main__':
    main()
