#!/usr/bin/env python3
"""16방향 턴테이블 배경 제거 보정 (TURN16-FIX, s3/art) — tools/puppet/turn16_build.py --repair 가 칸마다 부른다.

원인: 클링 입력 앞모습(원화 rembg 알파)에 구멍이 있던 곳이 회색 바탕(126)으로 합성되어, 영상 속 다리·옷·망토에
'바탕과 똑같은 색' 얼룩이 남는다. turn16_build.cut() 은 그 얼룩을 바탕으로 잘라 내고, 얼룩이 다리 사이 틈과 이어지면
turn16_fill_holes.py(완전히 갇힌 구멍만 메움)도 건드리지 못해 메뉴 바탕이 다리·망토로 비친다.

여기서는 잘린(투명) 화소 가운데 다음을 '얼룩'으로 본다:
  · 바탕색에 가깝고 (|rgb − 줄 바탕색| < tol)
  · 인물에 둘러싸여 있고 (반 해상도 16 방향 광선 중 enc 이상이 R 안에서 인물에 닿음)
  · 가장 가까운 인물 경계가 '윤곽선 없는 밝은 천'이다 (진짜 바탕과 맞닿은 실루엣엔 어두운 윤곽선이 있다 — 다리 사이 진짜 틈은 남는다)
찾은 얼룩은
  · opaque: 둘레 색으로 인페인트(TELEA)해 불투명하게 (다리·옷)
  · veil  : 큰 덩어리(> veil_min 화소)는 반투명 베일(알파 veil_a, 색 = 영상 색을 밝게) — 클링이 비치는 망토로 그린 곳(isolde_valkyrie),
            작은 덩어리는 opaque 처럼
반환: (새 rgb, 새 hard mask, 새 soft alpha, veil mask)  — veil mask 화소는 시트 prep() 에서 알파를 그대로 둔다."""
import numpy as np
import cv2
from scipy import ndimage as ndi

DEF = dict(tol=12, R=34, enc=0.72, Ldark=82, Dmax=48, min=40, close=3, veil_a=0.62, veil_min=1500, veil_lift=70, grow=4)


def bg_rows(f):
    return np.median(np.concatenate([f[:, :30], f[:, -30:]], 1), axis=1)


def enclosure(a, R=34, nd=16):
    """a(bool, 반 해상도 권장) → 화소마다 nd 방향 광선(길이 R) 중 a 에 닿는 비율"""
    H, W = a.shape
    cnt = np.zeros((H, W), np.float32)
    for k in range(nd):
        ang = 2 * np.pi * k / nd
        dx, dy = np.cos(ang), np.sin(ang)
        hit = np.zeros((H, W), bool)
        seen = set()
        for t in range(1, R + 1):
            ox, oy = int(round(dx * t)), int(round(dy * t))
            if (ox, oy) in seen:
                continue
            seen.add((ox, oy))
            ys0, ys1 = max(0, -oy), min(H, H - oy)
            xs0, xs1 = max(0, -ox), min(W, W - ox)
            if ys1 <= ys0 or xs1 <= xs0:
                continue
            hit[ys0:ys1, xs0:xs1] |= a[ys0 + oy:ys1 + oy, xs0 + ox:xs1 + ox]
        cnt += hit
    return cnt / nd


def find(rgb, a, P=None):
    """얼룩 화소 (bool) + 디버그 사전"""
    P = dict(DEF, **(P or {}))
    f = rgb.astype(np.float32)
    bg = bg_rows(f)
    near = np.abs(f - bg[:, None, :]).max(2) < P['tol']
    L = f.mean(2)
    T = ~a
    h2, w2 = a.shape[0] // 2, a.shape[1] // 2
    a2 = cv2.resize(a.astype(np.uint8), (w2, h2), interpolation=cv2.INTER_NEAREST).astype(bool)
    enc = cv2.resize(enclosure(a2, P['R']), (a.shape[1], a.shape[0]), interpolation=cv2.INTER_LINEAR)
    ring = a & ndi.binary_dilation(T, iterations=1)
    Lmin = ndi.minimum_filter(np.where(a, L, 255.0), size=5)
    dark = ring & (Lmin < P['Ldark'])
    light = ring & ~dark
    d_dark = ndi.distance_transform_edt(~dark) if dark.any() else np.full(a.shape, 1e9)
    d_light = ndi.distance_transform_edt(~light) if light.any() else np.full(a.shape, 1e9)
    C = T & near & (enc >= P['enc']) & (d_light < d_dark) & (d_light <= P['Dmax'])
    C = ndi.binary_opening(C, iterations=1)
    lab, n = ndi.label(C)
    acc = np.zeros_like(C)
    if n:
        sz = ndi.sum(C, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sz >= P['min']
        acc = keep[lab]
    if acc.any():
        # 받아들인 얼룩과 인물 사이 남은 1~3 px 이음매 · 얼룩 가장자리의 바탕색 테 (grow 안, 갇힌 곳만)
        g = ndi.binary_dilation(acc, iterations=P['grow']) & T & near & (enc >= P['enc'] - 0.1)
        cl = ndi.binary_closing(a | acc | g, iterations=P['close']) & T
        acc = acc | g | (cl & ndi.binary_dilation(acc, iterations=P['close'] + 1))
    return acc, dict(enc=enc, dark=dark, light=light, C=C, near=near)


def apply(rgb, a, soft, P=None, mode='opaque'):
    """→ rgb2, a2, soft2, veil (bool)"""
    P = dict(DEF, **(P or {}))
    acc, D = find(rgb, a, P)
    veil = np.zeros_like(acc)
    if not acc.any():
        return rgb, a, soft, veil
    if mode == 'veil':
        lab, n = ndi.label(acc)
        sz = ndi.sum(acc, lab, range(1, n + 1))
        big = np.zeros(n + 1, bool)
        big[1:] = sz > P['veil_min']
        veil = big[lab]
    opq = acc & ~veil
    out = rgb.copy()
    if opq.any():
        m = ndi.binary_dilation(opq, iterations=1) & ~(a & ~ndi.binary_dilation(~a, iterations=1))   # 얼룩 + 1 px 테(가장자리 회색 섞임)
        bgr = np.ascontiguousarray(rgb[..., ::-1])
        fix = cv2.inpaint(bgr, (m * 255).astype(np.uint8), 5, cv2.INPAINT_TELEA)[..., ::-1]
        out[m] = fix[m]
    if veil.any():
        f = rgb.astype(np.float32)
        lift = P['veil_lift']
        v = np.clip(f + lift + 0.6 * (f - bg_rows(f)[:, None, :]), 0, 255)
        v = cv2.GaussianBlur(v, (0, 0), 1.2)
        out[veil] = v[veil].astype(np.uint8)
    a2 = a | acc
    s2 = soft.astype(np.float32).copy()
    s2[opq] = 1.0
    s2[veil] = P['veil_a']
    # 베일과 인물 사이 경계 화소는 원래 알파 유지 (최대값)
    return out, a2, s2, veil
