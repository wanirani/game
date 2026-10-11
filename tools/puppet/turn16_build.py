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
from build_turn import floor_shadow  # noqa: E402

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
    기준점(첫 옆모습 = 폭 최소 θ 90, 뒷모습 = 폭 최대 θ 180, 둘째 옆모습 = 폭 최소 θ 270) 사이는 시간에 비례 (클링 회전은 거의 등속 —
    폭 역산은 3/4 각에서 팔·망토 때문에 크게 틀린다). 마지막 구간은 직전 구간 속도로 이어 간다 (영상이 덜/더 돌았는지 θ_end 로 안다)"""
    n = len(ws)
    ws = ndi.median_filter(np.asarray(ws, float), 5)
    s = max(start, 0)
    rest = n - s
    p1 = int(np.argmin(ws[s + 2:s + max(6, int(rest * 0.6))]) + s + 2)       # 첫 옆모습 (θ 90)
    b = int(np.argmax(ws[p1:p1 + max(4, int(rest * 0.45))]) + p1)            # 뒷모습 (θ 180)
    p2 = int(np.argmin(ws[b:]) + b) if b < n - 1 else n - 1                   # 둘째 옆모습 (θ 270)
    W_f = float(np.max(ws[:max(3, s + 1)])); W_b = float(ws[b]); D = float(min(ws[p1], ws[p2]))
    th = np.zeros(n)
    knots = [(s, 0.0), (p1, 90.0), (b, 180.0), (p2, 270.0)]
    for (i0, a0), (i1, a1) in zip(knots, knots[1:]):
        for i in range(i0, i1 + 1):
            th[i] = a0 + (a1 - a0) * (i - i0) / max(1, i1 - i0)
    rate = 90.0 / max(1, p2 - b) * 0.5 + 90.0 / max(1, b - p1) * 0.5           # 마지막 구간 속도 = 직전 두 구간 평균
    for i in range(p2 + 1, n):
        th[i] = 270 + rate * (i - p2)
    th = np.maximum.accumulate(th)
    return th, dict(start=s, p1=p1, back=b, p2=p2, W_front=round(W_f, 1), W_back=round(W_b, 1), D=round(D, 1), end=round(float(th[-1]), 1),
                    seg=[p1 - s, b - p1, p2 - b])


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


def enc(im, q, aq=80):
    b = io.BytesIO()
    im.save(b, 'WEBP', quality=q, alpha_quality=aq, method=6)
    return b.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video'); ap.add_argument('cls')
    ap.add_argument('--th', type=int, default=330, help='ui 시트 앞모습 인물 키(px)')
    ap.add_argument('--lo', type=float, default=0.55, help='lo 시트 배율')
    ap.add_argument('--max-kb', type=float, default=60, help='ui 시트 상한 (KB)')
    ap.add_argument('--max-lo-kb', type=float, default=22)
    ap.add_argument('--dbg', default='/tmp/claude-0/g8/dbg')
    ap.add_argument('--dry', action='store_true', help='에셋·목록을 쓰지 않고 디버그 그림만')
    ap.add_argument('--dir', type=int, default=0, help='도는 방향 강제 (+1 먼저 오른쪽, −1 먼저 왼쪽)')
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
    th, info = estimate_progress(ws, s)
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
    S = a.th / H0
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
    gap = 2
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
    Sa = np.asarray(sheet).copy()
    mm = Sa[..., 3] > 8
    Sa[..., :3] = bleed(Sa[..., :3], mm)
    sheet = Image.fromarray(Sa, 'RGBA')
    # 크기 상한에 맞춰 품질을 고른다
    data_ui, q_ui = None, None
    for q in (82, 76, 70, 64, 58, 52, 46):
        b = enc(sheet, q, 75)
        data_ui, q_ui = b, q
        if len(b) <= a.max_kb * 1024:
            break
    k = a.lo
    lo = sheet.resize((max(1, round(sheet.width * k)), max(1, round(sheet.height * k))), Image.LANCZOS)
    data_lo, q_lo = None, None
    for q in (80, 72, 64, 56, 48):
        b = enc(lo, q, 70)
        data_lo, q_lo = b, q
        if len(b) <= a.max_lo_kb * 1024:
            break
    kx, ky = lo.width / sheet.width, lo.height / sheet.height
    hpx = old_front_height(cid, a.cls)
    sc = (hpx / a.th) if hpx else (90.0 / a.th)
    views = []
    by_deg = {}
    for c in cells:
        v = dict(deg=c['p']['deg'], x=c['x'], y=c['y'], w=c['im'].width, h=c['im'].height, ax=c['ax'], fy=c['fy'], bw=c['bw'])
        views.append(v); by_deg[v['deg']] = v
    for p in picks:
        if p['mirror']:
            md = 180 - p['deg'] if p['deg'] >= 0 else -180 - p['deg']
            md = ((md + 180) % 360) - 180 if md != 180 else 180
            src = by_deg.get(md)
            if src:
                views.append(dict(src, deg=p['deg'], m=1, ax=round(src['w'] - src['ax'], 1)))
    views.sort(key=lambda v: v['deg'])
    entry = dict(th=a.th, sc=round(sc, 5), ui=dict(w=sheet.width, h=sheet.height, v=hashlib.sha1(data_ui).hexdigest()[:10], kb=round(len(data_ui) / 1024, 1), q=q_ui),
                 lo=dict(w=lo.width, h=lo.height, v=hashlib.sha1(data_lo).hexdigest()[:10], kb=round(len(data_lo) / 1024, 1), q=q_lo, kx=round(kx, 5), ky=round(ky, 5)),
                 views=views, dir=d, frames=[p['i'] for p in picks], anchors=info,
                 src=f'kling turntable {os.path.basename(a.video)} (tools/puppet/turn16_build.py)')
    # 디버그: 칸 + 정보
    ensure(a.dbg)
    on_green(sheet, 0.6).save(os.path.join(a.dbg, f'{a.cls}_turn16.jpg'), quality=82)
    rep = dict(cls=a.cls, info=info, picks=picks, warn=[(p['k'], p['hist'], p['hratio']) for p in warn], ui_kb=entry['ui']['kb'], q_ui=q_ui, lo_kb=entry['lo']['kb'], sc=entry['sc'])
    with open(os.path.join(a.dbg, f'{a.cls}_turn16.json'), 'w') as fh:
        json.dump(rep, fh, ensure_ascii=False, indent=1)
    print(f'[{a.cls}] views {len(views)} (mirror {sum(1 for v in views if v.get("m"))}) sheet {sheet.width}x{sheet.height} ui {entry["ui"]["kb"]} KB q{q_ui} · lo {entry["lo"]["kb"]} KB q{q_lo} · sc {entry["sc"]}')
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
    man = load_json(MAN) if os.path.exists(MAN) else {'v': 1, 'looks': {}}
    man.setdefault('looks', {})[f'{cid}/{a.cls}'] = entry
    man['looks'] = dict(sorted(man['looks'].items()))
    with open(MAN, 'w', encoding='utf-8') as fh:
        json.dump(man, fh, ensure_ascii=False, separators=(',', ':'))
    print(f'[{a.cls}] → {d_out}/turn16_{{ui,lo}}.webp + {MAN}')


if __name__ == '__main__':
    main()
