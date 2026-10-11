#!/usr/bin/env python3
"""16방향 턴테이블(지금 유화풍 원화) 2단계: 클링 360° 턴테이블 영상 → 16칸(22.5°) 시트 + assets/puppets/turn16.json 항목
  python3 tools/puppet/turn16_build.py <video.mp4> <cls> [--th 330] [--max-kb 60] [--dbg DIR] [--dry]
1단계(첫 프레임) = tools/puppet/turn16_src.py. 영상 = image_to_video, 앞모습 첫 프레임, 고정 카메라, 회색 단색 바탕.

출력 (런타임: src/render/hero_puppet.js turn16* · src/scenes/menu/hero_view.js)
  assets/puppets/<cid>/<cls>/turn16_ui.webp   메뉴 해상도 시트 (8 × 2 칸, 인물 키 ≈ th px)
  assets/puppets/<cid>/<cls>/turn16_lo.webp   같은 배치를 lo 배율로 줄인 시트 (낮은 화질 등급)
  assets/puppets/turn16.json  looks["<cid>/<cls>"] = {th, sc, gy, ui:{w,h,v}, lo:{w,h,v,k}, views:[{deg,x,y,w,h,ax,fy,bw}], dir, frames, src}
    deg  = 게임 yaw(도): 0 오른쪽을 봄 · 90 앞모습 · 180 왼쪽을 봄 · −90 뒷모습 (hero.js drawHeroYaw 와 같다). −157.5 … 180 순서
    x,y,w,h = ui 시트 안 칸 · ax = 칸 안 도는 축 x · fy = 칸 안 땅선 y (모든 칸 같은 땅선 — 카메라 고정이라 몸이 출렁이지 않는다)
    bw  = 어깨 띠 실루엣 폭 (이웃 칸 교차 때 폭 보간) · sc = 시트 px → 게임 논리 px (예전 8방향 앞모습과 같은 키가 되게)
    lo 칸 = ui 칸 × k (시트 전체를 같은 배율로 줄였다)
각도: 영상 진행각 θ(0 = 앞모습)을 프레임마다 추정 — 어깨 띠 폭 w 로 cos²φ = (w² − D²)/(W² − D²) (pilot build_turn16 과 같음),
첫 옆모습·뒷모습·둘째 옆모습 프레임을 기준점으로 단조 증가. 도는 방향(먼저 오른쪽을 보는가)은 몸통 광류(Farneback)의 가로 부호:
몸 앞면의 무늬는 몸이 돌아 바라보게 되는 쪽으로 움직인다 → dx > 0 이면 게임 yaw = 90 − θ, 아니면 90 + θ.
좌우 반전은 쓰지 않는다 (실제로 돈 영상). 영상이 한 바퀴를 다 돌지 못해 빠진 각은 반대편 칸을 거울로 (m:1).
정체성 검사: 칸마다 첫 프레임(= 원화)과 HSV 색 히스토그램 거리 · 키 변화 → 출력 report 에 적고, 기준을 넘으면 경고 (다시 생성 판단)."""
import argparse, os, sys, json, subprocess, tempfile, glob, hashlib, shutil, io
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.pup import OUT, ensure, load_json, bleed, rembg_alpha, on_green, hsv_arrays  # noqa: E402
import build_turn  # noqa: E402
from build_turn import floor_shadow  # noqa: E402
from build_rig import load_rig  # noqa: E402
from lib.pup import RIGS  # noqa: E402

MAN = os.path.join(OUT, 'turn16.json')
N = 16


def bg_rows(f):
    """줄마다 배경색 (양 끝 30 px 중앙값)"""
    return np.median(np.concatenate([f[:, :30], f[:, -30:]], 1), axis=1)


def quick_mask(rgb):
    f = rgb.astype(np.float32)
    m = np.abs(f - bg_rows(f)[:, None, :]).max(2) > 26
    m = ndi.binary_opening(m, iterations=2)
    lab, n = ndi.label(m)
    if n:
        sz = ndi.sum(m, lab, range(1, n + 1))
        m = lab == (np.argmax(sz) + 1)
    return ndi.binary_fill_holes(m)


def band(m, a=0.25, b=0.45):
    ys, xs = np.where(m)
    y0, y1 = ys.min(), ys.max()
    H = y1 - y0
    bd = m[int(y0 + a * H):int(y0 + b * H)]
    cols = np.where(bd.any(0))[0]
    if not len(cols):
        return 1.0, float(xs.mean()), int(y0), int(y1)
    return float(cols.max() - cols.min()), float((cols.max() + cols.min()) / 2), int(y0), int(y1)


def estimate_progress(ws, start):
    """ws: 프레임별 어깨 폭. start: 돌기 시작한 프레임. → θ(도, 0 = 앞모습, 단조 증가), 기준점
    기준점(첫 옆모습 = 폭의 첫 깊은 골 θ 90, 뒷모습 = 그 다음 마루 θ 180, 둘째 옆모습 = 그 다음 골 θ 270) 사이는 시간에 비례
    (클링 회전은 거의 등속 — 폭 역산은 3/4 각에서 팔·망토 때문에 크게 틀린다). 마지막 구간은 직전 구간 속도로 이어 간다.
    · 골이 하나도 없으면(안 돌았다) ValueError — 이 영상은 쓰지 않는다
    · 둘째 골이 없으면(뒷모습 뒤로 영상이 앞모습으로 '녹아' 돌아온다) 반 바퀴: θ 는 뒷모습(180)에서 멈추고 나머지 각은 거울 칸이 된다"""
    n = len(ws)
    ws = ndi.gaussian_filter1d(ndi.median_filter(np.asarray(ws, float), 5), 1.2)
    s = max(start, 0)
    W_f = float(np.max(ws[s:min(n, s + 4)]))
    m0 = float(np.min(ws[s:]))
    depth = W_f - m0
    if depth < 0.12 * W_f:
        raise ValueError(f'no rotation (width {W_f:.0f} → min {m0:.0f})')
    deep = W_f - 0.45 * depth            # 옆모습 골은 이보다 좁다
    rise = 0.3 * depth                   # 뒷모습 마루는 골보다 이만큼 넓다

    from scipy.signal import find_peaks
    # 옆모습 골 = 폭의 뚜렷한 극소 (돌출도 ≥ 0.18·깊이, 8 프레임 이상 떨어짐, deep 보다 좁음). 뒷모습이 앞모습보다 좁아도
    # (땋은 머리·망토가 앞에서만 옆으로 퍼진다) 두 옆모습이 따로 잡힌다
    mins = [int(i) for i in find_peaks(-ws, prominence=0.18 * depth, distance=8)[0] if i >= s + 2 and ws[i] < deep]
    if not mins:
        raise ValueError('no side view')
    p1 = mins[0]
    half = False
    p2 = None
    if len(mins) >= 2:
        p2 = mins[1]
        b = int(p1 + np.argmax(ws[p1:p2 + 1]))
        if ws[b] - max(ws[p1], ws[p2]) < 0.15 * depth:
            p2 = None
    if p2 is None:
        # 둘째 옆모습이 없다: 뒷모습 = p1 뒤에서 rise 만큼 오른 뒤의 첫 마루 (반 바퀴)
        half = True
        i = p1
        while i < n and ws[i] < ws[p1] + rise:
            i += 1
        if i >= n:
            b = n - 1
        else:
            j = i
            while j + 1 < n and not (ws[j + 1] < ws[j] and ws[j] - min(ws[j:min(n, j + 8)]) > 0.04 * depth):
                j += 1
            b = int(i + np.argmax(ws[i:j + 1]))
    if half and (b - p1) < 0.45 * (p1 - s):
        # 옆모습 직후 앞모습으로 녹아 돌아왔다 (뒷모습 없음) — 거울로도 뒤를 만들 수 없다
        raise ValueError(f'quarter turn only (side {p1}, then {b - p1} frames)')
    # 구간마다 따로 (클링 회전 속도는 구간마다 다르다): s→p1 가속(γ), p1→b 90→180, b→p2 180→270, p2→e 270→360
    # e = p2 뒤 처음으로 폭이 앞모습 가까이(W_f − 0.1·깊이) 돌아온 곳 (없으면 b→p2 속도로 이어 간다)
    r = 90.0 / max(1, b - p1)
    g = float(np.clip(r * (p1 - s) / 90.0, 1.0, 2.5))
    e = None
    if not half:
        k = p2 + 3
        while k < n and ws[k] < W_f - 0.1 * depth:
            k += 1
        e = k if k < n else None
    r3 = 90.0 / max(1, p2 - b) if not half else r
    r4 = 90.0 / max(1, e - p2) if e is not None else r3
    th = np.zeros(n)
    for k in range(n):
        if k <= s:
            th[k] = 0
        elif k <= p1:
            th[k] = 90.0 * ((k - s) / max(1, p1 - s)) ** g
        elif k <= b or half:
            th[k] = min(180.0, 90.0 + r * (k - p1))
        elif k <= p2:
            th[k] = 180.0 + r3 * (k - b)
        else:
            th[k] = 270.0 + r4 * (k - p2)
    p2v = b if half else p2
    th = np.maximum.accumulate(th)
    return th, dict(est='v3', start=s, p1=p1, back=int(b), p2=int(p2v), half=half, W_front=round(W_f, 1), W_back=round(float(ws[b]), 1), D=round(float(ws[p1]), 1),
                    end=round(float(np.max(th)), 1), seg=[p1 - s, int(b) - p1, int(p2v) - int(b), (e - p2) if e is not None else None], gamma=round(g, 2), rate=round(r, 2))


def manual_progress(n, keys):
    """--keys s,p1,b,p2,e (눈으로 고른 기준 프레임: 돌기 시작, 첫 옆모습, 뒷모습, 둘째 옆모습, 다시 앞모습). p2·e 를 '-' 로 두면 반 바퀴.
    추정기(estimate_progress)가 폭 곡선에서 엉뚱한 골을 고른 영상용 — 구간 보간은 추정기와 같다"""
    v = [None if x.strip() in ('-', '') else int(x) for x in keys.split(',')]
    v += [None] * (5 - len(v))
    s, p1, b, p2, e = v[:5]
    if s is None or p1 is None or b is None or not (s < p1 < b):
        raise ValueError(f'bad --keys {keys}')
    half = p2 is None
    if not half and not (b < p2 and (e is None or p2 < e)):
        raise ValueError(f'bad --keys {keys}')
    r = 90.0 / max(1, b - p1)
    g = float(np.clip(r * (p1 - s) / 90.0, 1.0, 2.5))
    r3 = 90.0 / max(1, p2 - b) if not half else r
    r4 = 90.0 / max(1, e - p2) if (not half and e is not None) else r3
    th = np.zeros(n)
    for k in range(n):
        if k <= s:
            th[k] = 0
        elif k <= p1:
            th[k] = 90.0 * ((k - s) / max(1, p1 - s)) ** g
        elif k <= b or half:
            th[k] = min(180.0, 90.0 + r * (k - p1))
        elif k <= p2:
            th[k] = 180.0 + r3 * (k - b)
        else:
            th[k] = 270.0 + r4 * (k - p2)
    th = np.maximum.accumulate(th)
    p2v = b if half else p2
    return th, dict(est='manual', keys=keys, start=s, p1=p1, back=b, p2=p2v, half=half, end=round(float(np.max(th)), 1),
                    seg=[p1 - s, b - p1, p2v - b, (e - p2) if (not half and e is not None) else None], gamma=round(g, 2), rate=round(r, 2))


def turn_start(frames_small, masks, upto):
    """돌기 시작 프레임: 몸통 광류의 가로 크기가 0.35 px/프레임(반 해상도)을 두 번 연속 넘는 첫 곳 (숨쉬기·잡음은 그 아래)"""
    prev = False
    for i in range(0, max(1, upto - 1)):
        g0 = cv2.cvtColor(frames_small[i], cv2.COLOR_RGB2GRAY)
        g1 = cv2.cvtColor(frames_small[i + 1], cv2.COLOR_RGB2GRAY)
        fl = cv2.calcOpticalFlowFarneback(g0, g1, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        m = ndi.binary_erosion(masks[i], iterations=6)
        ys = np.where(m.any(1))[0]
        if not len(ys):
            continue
        H = ys[-1] - ys[0]
        tm = np.zeros_like(m); tm[int(ys[0] + 0.18 * H):int(ys[0] + 0.55 * H)] = True
        sel = m & tm
        v = abs(float(np.median(fl[..., 0][sel]))) if sel.sum() > 50 else 0.0
        if v > 0.35 and prev:
            return max(0, i - 1)
        prev = v > 0.35
    return 0


def turn_dir(frames_small, masks, s, p1):
    """첫 옆모습까지 몸통 광류의 가로 부호 (+1: 먼저 오른쪽을 본다 → yaw = 90 − θ)"""
    acc = []
    a, b = s, max(s + 2, min(p1, s + (p1 - s) * 3 // 4))
    for i in range(a, b, 2):
        g0 = cv2.cvtColor(frames_small[i], cv2.COLOR_RGB2GRAY)
        g1 = cv2.cvtColor(frames_small[i + 2], cv2.COLOR_RGB2GRAY)
        fl = cv2.calcOpticalFlowFarneback(g0, g1, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        m = ndi.binary_erosion(masks[i], iterations=6)
        ys = np.where(m.any(1))[0]
        if not len(ys):
            continue
        H = ys[-1] - ys[0]
        tm = np.zeros_like(m); tm[int(ys[0] + 0.18 * H):int(ys[0] + 0.55 * H)] = True   # 몸통 (팔·다리 흔들림 제외)
        sel = m & tm
        if sel.sum() > 50:
            acc.append(float(np.median(fl[..., 0][sel])))
    v = float(np.mean(acc)) if acc else 0.0
    return (1 if v >= 0 else -1), v


def cut(rgb):
    """rembg 소프트 알파 + 배경색 주머니 제거 + 발밑 그림자 제거 → (hard mask, soft alpha 0..1)"""
    soft = rembg_alpha(rgb).astype(np.float32) / 255
    a = soft > 0.5
    f = rgb.astype(np.float32)
    bg = bg_rows(f)
    near = np.abs(f - bg[:, None, :]).max(2) < 14
    # 테두리에서 이어진 배경색 영역은 무조건 배경
    lab, n = ndi.label(near)
    if n:
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        flood = np.isin(lab, list(edge))
        a &= ~flood
    # 다리 사이 등 갇힌 배경 주머니: 배경색에 가까운 화소가 대부분인 구멍 덩어리
    filled = ndi.binary_fill_holes(a)
    cand = filled & (~a | near)
    lab, n = ndi.label(cand)
    if n:
        idx = np.arange(1, n + 1)
        frac = ndi.mean(near.astype(np.float32), lab, idx); sz = ndi.sum(np.ones_like(near, np.float32), lab, idx)
        thick = ndi.maximum(ndi.binary_erosion(cand, iterations=2).astype(np.float32), lab, idx)
        bad = np.zeros(n + 1, bool); bad[1:] = (frac > 0.7) & (sz > 60) & (thick > 0)
        a = filled & ~bad[lab]
    a = floor_shadow(rgb, a, {'band': 0.1})
    lab, n = ndi.label(a)
    if n > 1:
        sz = ndi.sum(a, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool); keep[1:] = sz > max(400, 0.004 * sz.max())
        a = keep[lab]
    s2 = np.minimum(soft, ndi.binary_dilation(a, iterations=1).astype(np.float32))
    s2 = np.maximum(s2 * (ndi.gaussian_filter(a.astype(np.float32), 0.7) > 0.05), ndi.binary_erosion(a, iterations=1) * 1.0)
    return a, np.clip(s2, 0, 1)


def hsv_hist(rgb, m):
    h, s, v = hsv_arrays(rgb)
    sel = m & (s > 0.08)
    if sel.sum() < 50:
        sel = m
    H_, _ = np.histogramdd(np.stack([h[sel], s[sel], v[sel]], 1), bins=(12, 4, 4), range=((0, 360), (0, 1.0001), (0, 1.0001)))
    H_ = H_.astype(np.float32)
    return H_ / max(1e-6, H_.sum())


def bhatta(a, b):
    return float(np.sqrt(max(0.0, 1 - np.sum(np.sqrt(a * b)))))


def old_front_height(cid, cls):
    """예전 8방향 시트 앞모습(y90)이 게임에서 그려지는 키(논리 px) — 새 시트도 같은 키로 (sc)"""
    d = os.path.join(OUT, cid, cls)
    rj = load_json(os.path.join(d, 'rig.json'))
    T = rj.get('turn') or {}
    v = (T.get('views') or {}).get('y90')
    if not v:
        return None
    im = np.asarray(Image.open(os.path.join(d, 'turn.webp')).convert('RGBA'))
    crop = im[v.get('y', 0):v.get('y', 0) + v['h'], v['x']:v['x'] + v['w'], 3] > 100
    ys = np.where(crop.any(1))[0]
    s_old = 90.0 / (v['footY'] - v['topY'])     # hero_puppet.drawTurnStep: PUP_H / (footY − topY)
    return float(ys[-1] - ys[0]) * s_old


def old_hists(cid, cls):
    """예전 8방향 시트(원화 턴어라운드)의 스텝별 색 히스토그램 — 새 칸의 정체성 비교 기준 (같은 yaw 의 원화)"""
    d = os.path.join(OUT, cid, cls)
    try:
        rj = load_json(os.path.join(d, 'rig.json'))
        T = rj['turn']
        im = np.asarray(Image.open(os.path.join(d, 'turn.webp')).convert('RGBA'))
    except Exception:
        return {}
    out = {}
    for deg, st in (T.get('steps') or {}).items():
        v = T['views'].get(st['v'])
        if not v:
            continue
        c = im[v.get('y', 0):v.get('y', 0) + v['h'], v['x']:v['x'] + v['w']]
        m = ndi.binary_erosion(c[..., 3] > 160, iterations=2)
        out[float(deg)] = hsv_hist(c[..., :3], m)
    return out


def prep(im):
    """인코딩 전: 알파를 깔끔하게(단단한 마스크 + 0.6 px 가장자리) · 투명 화소의 색을 부드럽게 채움 (bleed 무늬는 바이트를 먹는다)"""
    A = np.asarray(im).copy()
    al = A[..., 3].astype(np.float32) / 255
    hard = (al > 0.5).astype(np.float32)
    clean = np.maximum(cv2.GaussianBlur(hard, (0, 0), 0.6), np.minimum(al, hard))
    A[..., 3] = np.clip(clean * 255, 0, 255).astype(np.uint8)
    rgb = A[..., :3].astype(np.float32); w = (al > 0.03).astype(np.float32)
    num = cv2.GaussianBlur(rgb * w[..., None], (0, 0), 5); den = cv2.GaussianBlur(w, (0, 0), 5)[..., None]
    num2 = cv2.GaussianBlur(rgb * w[..., None], (0, 0), 20); den2 = cv2.GaussianBlur(w, (0, 0), 20)[..., None]
    fill = np.where(den > 0.04, num / np.maximum(den, 1e-4), num2 / np.maximum(den2, 1e-4))
    out = np.where((al > 0.03)[..., None], rgb, fill)
    A[..., :3] = np.clip(out, 0, 255).astype(np.uint8)
    return Image.fromarray(A, 'RGBA')


def make_mask(ui, views, cid, cls):
    """장비 갑옷색 재칠 마스크 (R = 갑옷, G = 장식 — build_turn.turn_mask 와 같은 색 모델·띠 규칙을 칸마다 돌린다).
    turn_mask 는 저장 위치가 고정(OUT/cid/cls/turn_mask.webp)이라 rig.json·ui 아틀라스·마스크 사본을 임시 폴더에 두고 OUT 을 바꿔 부른다.
    반환: 반 해상도 RGB 마스크 Image | None (리그에 armor/trim 재질이 없으면)"""
    rig = load_rig(os.path.join(RIGS, cid, cls + '.json'))
    mats = rig.get('materials') or {}
    if not (mats.get('armor') or mats.get('trim')):
        return None
    src = os.path.join(OUT, cid, cls)
    rj = load_json(os.path.join(src, 'rig.json'))
    tmp = tempfile.mkdtemp(prefix='t16m_', dir=os.environ.get('TMPDIR') or None)
    old_out = build_turn.OUT
    try:
        d = ensure(os.path.join(tmp, cid, cls))
        for f in os.listdir(src):
            if f == 'rig.json' or f.startswith('atlas_') or f.startswith('mask_'):
                shutil.copy(os.path.join(src, f), d)
        build_turn.OUT = tmp
        U = np.asarray(ui)
        full = Image.new('RGB', (max(1, ui.width // 2), max(1, ui.height // 2)), (0, 0, 0))
        for v in views:
            if v.get('m'):
                continue
            x0, y0 = int(round(v['x'])), int(round(v['y']))
            w, h = int(round(v['w'])), int(round(v['h']))
            cell = Image.fromarray(U[y0:y0 + h, x0:x0 + w].copy(), 'RGBA')
            al = np.asarray(cell)[..., 3] > 100
            ys = np.where(al.any(1))[0]
            if not len(ys):
                continue
            dg = v['deg']
            name = 'y90' if 60 <= dg <= 120 else 'y45' if 30 <= dg < 60 else 'y135' if 120 < dg <= 150 else \
                   'ym90' if -120 <= dg <= -60 else 'ym45' if -60 < dg <= -30 else 'ym135' if -150 <= dg < -120 else 'side'
            meta = {name: dict(x=0, w=w, topY=float(ys[0]), footY=float(v['fy']), axisX=float(v['ax']), shW=max(8.0, float(v['bw']) / 2))}
            build_turn.turn_mask(cell, meta, rig, cid, cls)
            m = Image.open(os.path.join(d, 'turn_mask.webp')).convert('RGB')
            full.paste(m.resize((max(1, w // 2), max(1, h // 2)), Image.BILINEAR), (x0 // 2, y0 // 2))
        return full
    finally:
        build_turn.OUT = old_out
        shutil.rmtree(tmp, ignore_errors=True)


def enc(im, q, aq=80):
    b = io.BytesIO()
    im.save(b, 'WEBP', quality=q, alpha_quality=aq, method=6)
    return b.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video'); ap.add_argument('cls')
    ap.add_argument('--th', type=int, default=250, help='ui 시트 앞모습 인물 키(px) — 상한에 맞게 줄어든다')
    ap.add_argument('--th0', type=int, default=320, help='기준(작업) 시트 인물 키')
    ap.add_argument('--th-min', type=int, default=170)
    ap.add_argument('--lo', type=float, default=0.55, help='lo 시트 배율')
    ap.add_argument('--max-kb', type=float, default=60, help='ui 시트 상한 (KB)')
    ap.add_argument('--max-lo-kb', type=float, default=22)
    ap.add_argument('--dbg', default='/tmp/claude-0/g8/dbg')
    ap.add_argument('--dry', action='store_true', help='에셋·목록을 쓰지 않고 디버그 그림만')
    ap.add_argument('--dir', type=int, default=0, help='도는 방향 강제 (+1 먼저 오른쪽, −1 먼저 왼쪽)')
    ap.add_argument('--keys', default='', help='기준 프레임 직접 지정 "s,p1,b,p2,e" (반 바퀴는 p2·e 를 -) — 추정기를 건너뛴다')
    a = ap.parse_args()
    cid = a.cls.split('_')[0]
    tmp = tempfile.mkdtemp(prefix='t16_', dir=os.environ.get('TMPDIR') or None)
    try:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.video, os.path.join(tmp, 'f%03d.png')], check=True)
        paths = sorted(glob.glob(os.path.join(tmp, 'f*.png')))
        frames = [np.asarray(Image.open(p).convert('RGB')) for p in paths]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    small = [cv2.resize(f, (f.shape[1] // 2, f.shape[0] // 2), interpolation=cv2.INTER_AREA) for f in frames]
    masks = [quick_mask(f) for f in small]
    meas = [band(m) for m in masks]
    ws = [m[0] for m in meas]
    p1g = int(np.argmin(ndi.median_filter(np.asarray(ws, float), 5)[4:int(len(ws) * 0.6)]) + 4)
    s = turn_start(small, masks, p1g)
    try:
        th, info = manual_progress(len(ws), a.keys) if a.keys else estimate_progress(ws, s)
    except ValueError as e:
        # 쓸 수 없는 영상(안 돌았다 / 옆모습에서 앞으로 녹아 돌아왔다): 예전에 만든 이 외형의 16방향 항목·시트를 지운다 (깨진 시트를 싣지 않게)
        print(f'[{a.cls}] REJECT video: {e}')
        if a.keys:
            sys.exit(2)                               # 손으로 준 기준 프레임이 틀렸다: 지금 시트는 그대로 둔다
        if not a.dry:
            drop_look(cid, a.cls)
        sys.exit(3)
    d, flow = turn_dir(small, masks, info['start'], info['p1'])
    if a.dir:
        d = a.dir
    info.update(dir=d, flow=round(flow, 3))
    heights = np.array([m[3] - m[2] for m in meas], float)
    # 16 각: 진행각 θ_k = 22.5 k → 게임 yaw = 90 − d·θ
    picks = []
    for k in range(N):
        t = 22.5 * k
        if k == 0:
            i = 0
        else:
            i = int(np.argmin(np.abs(th - t)))
        err = float(abs(th[i] - t))
        yaw = ((90 - d * t + 180) % 360) - 180
        if abs(yaw + 180) < 1e-6:
            yaw = 180.0
        picks.append(dict(k=k, t=t, i=i, est=round(float(th[i]), 1), err=round(err, 1), deg=yaw))
    # 빠진 각(영상이 덜 돌았다): 추정 오차 > 9° → 거울 칸 (yaw ↔ 180 − yaw)
    for p in picks:
        p['mirror'] = p['err'] > 9.0
    print(f'[{a.cls}] frames {len(frames)} start {s} dir {d:+d} (flow {flow:+.2f}) anchors {info}')
    # 컷 + 정체성
    f0 = frames[0]
    a0, s0 = cut(f0)
    ys0 = np.where(a0.any(1))[0]
    G = int(ys0[-1])                                  # 땅선 = 첫 프레임 발바닥 (카메라 고정)
    H0 = float(ys0[-1] - ys0[0])
    S = a.th0 / H0
    h0 = hsv_hist(f0, ndi.binary_erosion(a0, iterations=3))
    OH = old_hists(cid, a.cls)
    cells, report = [], []
    cache = {}
    for p in picks:
        if p['mirror']:
            continue
        i = p['i']
        if i not in cache:
            cache[i] = cut(frames[i]) if i else (a0, s0)
        hm, sa = cache[i]
        ys, xs = np.where(hm)
        hh = hsv_hist(frames[i], ndi.binary_erosion(hm, iterations=3))
        hd = bhatta(h0, hh)
        od = OH.get(float(p['deg']))
        p['old'] = round(bhatta(od, hh), 3) if od is not None else None
        hr = float((ys.max() - ys.min()) / H0)
        p.update(hist=round(hd, 3), hratio=round(hr, 3))
        pad = 4
        x0, x1 = max(0, xs.min() - pad), min(f0.shape[1], xs.max() + 1 + pad)
        y0, y1 = max(0, ys.min() - pad), min(f0.shape[0], max(G, ys.max()) + 1 + pad)
        col = bleed(frames[i], hm)
        rgba = np.dstack([col, (sa * 255).astype(np.uint8)])[y0:y1, x0:x1]
        im = Image.fromarray(rgba, 'RGBA')
        W2, H2 = max(1, round(im.width * S)), max(1, round(im.height * S))
        im = im.resize((W2, H2), Image.LANCZOS)
        # 축: 아래 15 % (발·정강이) 실루엣 가운데 — 카메라가 고정되고 인물이 제자리에서 돈다
        foot = hm[int(ys.max() - 0.15 * (ys.max() - ys.min())):ys.max() + 1]
        fx = np.where(foot.any(0))[0]
        ax = ((fx.min() + fx.max()) / 2 - x0) * S if len(fx) else W2 / 2
        bw, _, _, _ = band(hm)
        cells.append(dict(p=p, im=im, ax=round(float(ax), 1), fy=round((G - y0) * S, 1), bw=round(bw * S, 1)))
    # 이웃 칸과 비교한 정체성 경고
    warn = [c['p'] for c in cells if (c['p'].get('old') or 0) > 0.5 or not (0.86 < c['p']['hratio'] < 1.14)]
    # 시트 (8 × 2, 칸 폭은 제각각 — 줄마다 왼쪽부터)
    COLS = 8
    gap = 8                                          # 줄인 시트(lo ≈ 0.3 배)에서도 이웃 칸이 번지지 않게
    rows = [cells[r * COLS:(r + 1) * COLS] for r in range((len(cells) + COLS - 1) // COLS)]
    rowH = [max(c['im'].height for c in row) for row in rows]
    Wsh = max(sum(c['im'].width + gap for c in row) for row in rows)
    Hsh = sum(h + gap for h in rowH)
    sheet = Image.new('RGBA', (Wsh, Hsh), (0, 0, 0, 0))
    y = 0
    for row, rh in zip(rows, rowH):
        x = 0
        for c in row:
            sheet.paste(c['im'], (x, y))
            c['x'], c['y'] = x, y
            x += c['im'].width + gap
        y += rh + gap
    base = sheet                                     # 기준 시트 (인물 키 = a.th0)
    # 크기 상한: 인물 키를 a.th 에서 6 % 씩 줄여 가며 q ≥ 50 으로 max-kb 안에 드는 첫 배율 (그래도 넘으면 마지막 것)
    th_ui = a.th
    while True:
        f = th_ui / a.th0
        ui = prep(base.resize((max(1, round(base.width * f)), max(1, round(base.height * f))), Image.LANCZOS))
        data_ui, q_ui = None, None
        for q in (78, 72, 66, 60, 55, 50):
            b = enc(ui, q, 60)
            data_ui, q_ui = b, q
            if len(b) <= a.max_kb * 1024:
                break
        if len(data_ui) <= a.max_kb * 1024 or th_ui <= a.th_min:
            break
        th_ui = max(a.th_min, int(th_ui * 0.94))
    fx, fy = ui.width / base.width, ui.height / base.height
    k = a.lo
    lo = prep(base.resize((max(1, round(ui.width * k)), max(1, round(ui.height * k))), Image.LANCZOS))
    data_lo, q_lo = None, None
    for q in (76, 68, 60, 52, 46):
        b = enc(lo, q, 55)
        data_lo, q_lo = b, q
        if len(b) <= a.max_lo_kb * 1024:
            break
    kx, ky = lo.width / ui.width, lo.height / ui.height
    sheet = ui
    hpx = old_front_height(cid, a.cls)
    sc = (hpx / th_ui) if hpx else (90.0 / th_ui)
    views = []
    by_deg = {}
    for c in cells:
        v = dict(deg=c['p']['deg'], x=round(c['x'] * fx, 2), y=round(c['y'] * fy, 2), w=round(c['im'].width * fx, 2), h=round(c['im'].height * fy, 2),
                 ax=round(c['ax'] * fx, 2), fy=round(c['fy'] * fy, 2), bw=round(c['bw'] * fx, 2))
        views.append(v); by_deg[v['deg']] = v
    for p in picks:
        if p['mirror']:
            md = 180 - p['deg'] if p['deg'] >= 0 else -180 - p['deg']
            md = ((md + 180) % 360) - 180 if md != 180 else 180
            src = by_deg.get(md)
            if src:
                views.append(dict(src, deg=p['deg'], m=1, ax=round(src['w'] - src['ax'], 2)))
    views.sort(key=lambda v: v['deg'])
    mask = None
    try:
        mask = make_mask(ui, views, cid, a.cls)
    except Exception as e:  # 아틀라스 없음 등 — 마스크 없이 (런타임은 원화 색)
        print(f'[{a.cls}] mask failed: {e}')
    data_mk = None
    if mask is not None:
        b = io.BytesIO(); mask.save(b, 'WEBP', quality=60, method=6); data_mk = b.getvalue()
    entry = dict(th=th_ui, sc=round(sc, 5), ui=dict(w=sheet.width, h=sheet.height, v=hashlib.sha1(data_ui).hexdigest()[:10], kb=round(len(data_ui) / 1024, 1), q=q_ui),
                 lo=dict(w=lo.width, h=lo.height, v=hashlib.sha1(data_lo).hexdigest()[:10], kb=round(len(data_lo) / 1024, 1), q=q_lo, kx=round(kx, 5), ky=round(ky, 5)),
                 mask=(dict(w=mask.width, h=mask.height, v=hashlib.sha1(data_mk).hexdigest()[:10], kb=round(len(data_mk) / 1024, 1)) if data_mk else None),
                 views=views, dir=d, frames=[p['i'] for p in picks], anchors=info,
                 src=f'kling turntable {os.path.basename(a.video)} (tools/puppet/turn16_build.py)')
    # 디버그: 칸 + 정보
    ensure(a.dbg)
    on_green(sheet, 0.6).save(os.path.join(a.dbg, f'{a.cls}_turn16.jpg'), quality=82)
    sheet.save(os.path.join(a.dbg, f'{a.cls}_turn16_full.png'))
    rep = dict(cls=a.cls, th=th_ui, info=info, picks=picks, warn=[(p['k'], p['hist'], p['hratio']) for p in warn], ui_kb=entry['ui']['kb'], q_ui=q_ui, lo_kb=entry['lo']['kb'], sc=entry['sc'])
    with open(os.path.join(a.dbg, f'{a.cls}_turn16.json'), 'w') as fh:
        json.dump(rep, fh, ensure_ascii=False, indent=1)
    if data_mk:
        on_green(Image.merge('RGBA', (*mask.split(), mask.convert('L').point(lambda q: 255 if q > 8 else 0))), 1).save(os.path.join(a.dbg, f'{a.cls}_turn16_mask.jpg'), quality=80)
    print(f'[{a.cls}] th {th_ui} mask {entry["mask"] and entry["mask"]["kb"]} KB · views {len(views)} (mirror {sum(1 for v in views if v.get("m"))}) sheet {sheet.width}x{sheet.height} ui {entry["ui"]["kb"]} KB q{q_ui} · lo {entry["lo"]["kb"]} KB q{q_lo} · sc {entry["sc"]}')
    print(f'[{a.cls}] identity (k:yaw f# θest old8 hist h): ' + ' '.join(f'{p["k"]}:{p["deg"]:g} f{p["i"]} {p["est"]} {p.get("old")} {p.get("hist", "-")} {p.get("hratio", "-")}' for p in picks))
    if warn:
        print(f'[{a.cls}] WARN identity/size drift at k=' + ','.join(str(p['k']) for p in warn))
    if a.dry:
        return
    d_out = ensure(os.path.join(OUT, cid, a.cls))
    with open(os.path.join(d_out, 'turn16_ui.webp'), 'wb') as fh:
        fh.write(data_ui)
    with open(os.path.join(d_out, 'turn16_lo.webp'), 'wb') as fh:
        fh.write(data_lo)
    mp = os.path.join(d_out, 'turn16_mask.webp')
    if data_mk:
        with open(mp, 'wb') as fh:
            fh.write(data_mk)
    elif os.path.exists(mp):
        os.remove(mp)
    with man_lock():                                   # 여러 빌드가 동시에 돌아도 목록 읽고-고쳐-쓰기가 섞이지 않게
        man = load_json(MAN) if os.path.exists(MAN) else {'v': 1, 'looks': {}}
        man.setdefault('looks', {})[f'{cid}/{a.cls}'] = entry
        man['looks'] = dict(sorted(man['looks'].items()))
        tmpm = MAN + '.tmp'
        with open(tmpm, 'w', encoding='utf-8') as fh:
            json.dump(man, fh, ensure_ascii=False, separators=(',', ':'))
        os.replace(tmpm, MAN)
    print(f'[{a.cls}] → {d_out}/turn16_{{ui,lo}}.webp + {MAN}')
    # 몸 안 구멍 메우기 (입력 그림의 알파 구멍이 회색 얼룩으로 영상에 남아 배경과 함께 잘려 나간 곳) — TURNMOUNT 검증
    subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'turn16_fill_holes.py'), f'{cid}/{a.cls}'], check=False)


def drop_look(cid, cls):
    """turn16.json 에서 이 외형을 빼고 시트 파일을 지운다 (없으면 그대로)"""
    d = os.path.join(OUT, cid, cls)
    for f in ('turn16_ui.webp', 'turn16_lo.webp', 'turn16_mask.webp'):
        q = os.path.join(d, f)
        if os.path.exists(q):
            os.remove(q)
    with man_lock():
        if os.path.exists(MAN):
            man = load_json(MAN)
            if man.get('looks', {}).pop(f'{cid}/{cls}', None) is not None:
                tmpm = MAN + '.tmp'
                with open(tmpm, 'w', encoding='utf-8') as fh:
                    json.dump(man, fh, ensure_ascii=False, separators=(',', ':'))
                os.replace(tmpm, MAN)
                print(f'[{cls}] removed from {MAN}')


class man_lock:
    """turn16.json 읽고-고쳐-쓰기 잠금 (fcntl, 같은 기계의 동시 빌드끼리)"""
    def __enter__(self):
        import fcntl
        self.fh = open(os.path.join(tempfile.gettempdir(), 'turn16_manifest.lock'), 'w')
        fcntl.flock(self.fh, fcntl.LOCK_EX)
        return self

    def __exit__(self, *a):
        import fcntl
        fcntl.flock(self.fh, fcntl.LOCK_UN)
        self.fh.close()


if __name__ == '__main__':
    main()
