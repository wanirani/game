#!/usr/bin/env python3
"""uigem 아이콘 재료 준비 — 게임이 이미 가진 그림을 「상아 조각」 색조로 바꾼다 (유료 생성 0).
  · 카엘 3D 모델의 동작 렌더(/tmp/claude-0/v2/char3d/clips_*.png, 평평한 배경) → 칸별로 오려 배경을 지우고 상아색 부조 톤으로
  · v1 아이템 그림(assets/icons/*.png) → 같은 상아 톤
결과는 /dev/shm/uigem/src/ 에 놓이고, forge.html 이 벡터 요소(베기 궤적·달·과녁 등)와 합쳐 최종 아이콘을 굽는다.
  python3 tools/v2/ui_mock2/uigem/forge/prep.py
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

OUT = '/dev/shm/uigem/src'
os.makedirs(OUT, exist_ok=True)
BG = np.array([51, 55, 61], np.float32)

RAMP = np.array([  # t, r, g, b — 음각(짙은 호박 갈색) → 상아 → 흰 하이라이트
    [0.00, 46, 34, 28], [0.30, 112, 92, 74], [0.55, 188, 170, 142], [0.78, 233, 222, 199], [0.92, 250, 243, 226], [1.00, 255, 253, 246]], np.float32)

def ramp(t):
    out = np.zeros(t.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(t, RAMP[:, 0], RAMP[:, c + 1])
    return out

def ivory(rgba, detail=1.25, edge=0.55, base=0.80, sig=None):
    """RGBA(float 0..1) → 상아 부조 톤 RGBA. 밝기의 큰 흐름은 눌러 실루엣을 밝게 두고, 국소 대비·윤곽만 음각 선으로 남긴다."""
    a = rgba[..., 3]
    g = (rgba[..., 0] * 0.299 + rgba[..., 1] * 0.587 + rgba[..., 2] * 0.114)
    m = a > 0.5
    if m.sum() < 10:
        return rgba
    lo, hi = np.percentile(g[m], [2, 98])
    n = np.clip((g - lo) / max(1e-3, hi - lo), 0, 1)
    s = sig or max(2.0, rgba.shape[0] * 0.022)
    wa = ndi.gaussian_filter(a, s) + 1e-4
    bl = ndi.gaussian_filter(n * a, s) / wa
    d = n - bl
    gx = ndi.sobel(ndi.gaussian_filter(n, 0.8), axis=1); gy = ndi.sobel(ndi.gaussian_filter(n, 0.8), axis=0)
    e = np.clip(np.hypot(gx, gy) * 0.9 - 0.12, 0, 1)
    t = base + 0.16 * (n - 0.5) + detail * d - edge * e
    t = np.clip(t, 0.12, 1.0)
    rgb = ramp(t) / 255.0
    return np.dstack([rgb, a])

def save(arr, name, size=None, pad=0.0):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if bb:
        im = im.crop(bb)
    im.save(f'{OUT}/{name}.png')
    return im.size

def key(cell):
    """평평한 배경(51,55,61)을 지운다. 가장자리는 거리로 부드럽게."""
    rgb = np.asarray(cell.convert('RGB'), np.float32)
    dist = np.sqrt(((rgb - BG) ** 2).sum(-1))
    a = np.clip((dist - 5) / 14, 0, 1)
    # 배경과 닿은 바깥쪽만 지운다: 안쪽의 어두운 회색(바지)이 뚫리지 않게, 배경에서 이어진 영역만 투명 처리
    lab, _ = ndi.label(a < 0.5)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(edge))
    a = np.where(outside | (a >= 0.5), a, 1.0)
    a = np.where(ndi.binary_dilation(outside, iterations=2), a, 1.0)
    # 배경색 번짐 제거(언프리멀티플라이)
    aa = np.maximum(a, 1e-3)[..., None]
    rgb = np.clip((rgb - BG * (1 - aa)) / aa, 0, 255)
    return np.dstack([rgb / 255.0, a])

def cells(path, cols, rows, names, cw=300, ch=380, top=24):
    sheet = Image.open(path)
    for i, nm in enumerate(names):
        if not nm:
            continue
        c, r = i % cols, i // cols
        cell = sheet.crop((c * cw, r * ch + top, (c + 1) * cw, (r + 1) * ch))
        k = key(cell)
        # 2배로 키워서(부드럽게) 조각 톤 → 아이콘 크기에서 선이 덜 깨진다
        im = Image.fromarray((k * 255 + 0.5).astype(np.uint8), 'RGBA').resize((cw * 2, (ch - top) * 2), Image.LANCZOS)
        k2 = np.asarray(im, np.float32) / 255.0
        print(nm, save(ivory(k2, detail=1.7, edge=0.8, base=0.75), 'fig_' + nm))

cells('/tmp/claude-0/v2/char3d/clips_procedural.png', 6, 2,
      ['idle', 'jump', 'fall', 'land', 'dash', 'hurt', 'a2prep', 'a2slash', 'a3prep', 'a3thrust', 'airprep', 'airslash'])
cells('/tmp/claude-0/v2/char3d/clips_library.png', 4, 3,
      ['run0', 'run12', 'run24', 'runback', 'sl30', 'sl50', 'sl62', 'sl85'])

for nm in ['sword_5', 'sword_3', 'whip_5', 'moneybag', 'sub_bible', 'u_grimoire', 'sub_stopwatch', 'scroll_protect', 'potion_hp', 'key', 'rift_lantern', 'm_fang', 'doc', 'sub_cross']:
    im = Image.open(f'assets/icons/{nm}.png').convert('RGBA').resize((384, 384), Image.LANCZOS)
    arr = np.asarray(im, np.float32) / 255.0
    arr[..., 3] = np.clip((arr[..., 3] - 0.35) / 0.5, 0, 1)   # 그림에 붙은 옅은 빛무리·반짝이는 뺀다
    print(nm, save(ivory(arr, detail=1.35, edge=0.6, base=0.75), 'obj_' + nm))
