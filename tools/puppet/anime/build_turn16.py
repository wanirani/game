#!/usr/bin/env python3
"""애니풍 시범: 클링 360° 턴테이블 영상(image_to_video, 앞모습 첫 프레임·고정 카메라) → 16방향(22.5°) 턴 시트
  python3 tools/puppet/anime/build_turn16.py <turntable.mp4> kael kael_hunter
출력: assets/puppets_anime/<char>/<cls>/turn.webp (8 × 2 칸) + rig.json 의 turn 항목
  turn = {th, size, views:{라벨:{x,y,w,h,footX,axisX,footY,topY,shY,shW,hemY,bw}}, steps:{"0":{v,m}, … 45° 8개 — hero.js drawHeroYaw 호환},
          turn16:[{deg, v}] (−157.5 … 180, 22.5° 간격), mask:false, src}
각도 규칙(hero.js drawHeroYaw · hero_view.js): 0 = 오른쪽을 봄(게임 옆모습), 90 = 앞모습, 180 = 왼쪽을 봄, −90 = 뒷모습.
영상은 앞모습(90°)에서 시작해 왼쪽을 보는 옆모습(180°) → 뒷모습(270°) → 오른쪽 옆모습(360°) → 앞모습 쪽으로 돈다 (yaw 가 시간에 따라 증가).
프레임마다 yaw 추정: 어깨 띠(키의 25~45%) 실루엣 폭 w — 앞/뒤 폭 W, 옆 두께 D 일 때 cos²φ = (w² − D²)/(W² − D²) (φ = 앞 또는 뒤에서 벗어난 각),
옆모습(폭 최소)·뒷모습(폭 최대) 프레임을 기준점으로 사분면을 정하고 단조 증가로 다듬는다. 좌우 반전은 쓰지 않는다 (실제로 돈 영상이라 채찍·가르마가 맞다).
배경: rembg(isnet) + 테두리 배경색 홍수 채움, 발밑 그림자는 build_turn.floor_shadow."""
import argparse, os, sys, json, subprocess, tempfile, glob
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
from lib.pup import OUT, DBG, ensure, load_json, save_json, bleed, rembg_alpha, on_green  # noqa: E402
from build_turn import measure, floor_shadow  # noqa: E402
from ingest_anime import bg_flood  # noqa: E402

TH = 580
COLS = 8
TARGETS = [90 + 22.5 * k for k in range(16)]          # 영상 진행 순서 (90 … 427.5)


def label(deg):
    d = ((deg + 180) % 360 + 360) % 360 - 180
    if abs(d + 180) < 1e-6:
        d = 180.0
    n = int(round(abs(d)))
    return ('ym' if d < 0 else 'y') + str(n), d


def quick_mask(a):
    f = a.astype(np.float32)
    bg = np.median(np.concatenate([f[:, :30], f[:, -30:]], 1), axis=1)
    m = np.abs(f - bg[:, None, :]).max(2) > 40
    m = ndi.binary_opening(m, iterations=2)
    lab, n = ndi.label(m)
    if n:
        sz = ndi.sum(m, lab, range(1, n + 1))
        m = lab == (np.argmax(sz) + 1)
    return m


def band_width(m):
    ys, xs = np.where(m)
    y0, y1 = ys.min(), ys.max()
    H = y1 - y0
    band = m[int(y0 + 0.25 * H):int(y0 + 0.45 * H)]
    cols = np.where(band.any(0))[0]
    return float(cols.max() - cols.min()), float((cols.max() + cols.min()) / 2), int(y0), int(y1)


def estimate_yaw(w):
    n = len(w)
    ws = ndi.median_filter(np.asarray(w, float), 5)
    i0 = 0
    p1 = int(np.argmin(ws[15:n * 3 // 5]) + 15)                 # 첫 옆모습 (180°)
    b = int(np.argmax(ws[p1:p1 + n // 3]) + p1)                 # 뒷모습 (270°)
    p2 = int(np.argmin(ws[b:]) + b)                             # 둘째 옆모습 (360°)
    W_f = float(ws[:8].max()); W_b = float(ws[b]); D = float(min(ws[p1], ws[p2]))
    phi = lambda x, W: float(np.degrees(np.arccos(np.sqrt(np.clip((x * x - D * D) / max(1.0, W * W - D * D), 0, 1)))))
    yaw = np.zeros(n)
    for i in range(n):
        if i <= p1:
            yaw[i] = 90 + phi(ws[i], W_f)
        elif i <= b:
            yaw[i] = 270 - phi(ws[i], W_b)
        elif i <= p2:
            yaw[i] = 270 + phi(ws[i], W_b)
        else:
            yaw[i] = 450 - phi(ws[i], W_f)
    yaw = np.maximum.accumulate(yaw)                            # 단조 증가
    return yaw, dict(p1=p1, back=b, p2=p2, W_front=W_f, W_back=W_b, D=D)


def cut(rgb):
    a = rembg_alpha(rgb) > 127
    a &= ~bg_flood(rgb, 12)
    # 갇힌 배경 주머니(다리 사이 등)는 메우지 않는다: 줄 배경색과 가까운 구멍 덩어리
    f = rgb.astype(np.float32)
    bgrow = np.median(np.concatenate([f[:, :24], f[:, -24:]], 1), axis=1)
    mx_, mn_ = f.max(2), f.min(2)
    # 배경색 또는 그 그늘(무채색·밝음) — 옷·장화는 어두운 갈색/회흑색이라 겹치지 않는다
    near = (np.abs(f - bgrow[:, None, :]).max(2) < 16) | ((f.mean(2) > 115) & ((mx_ - mn_) / np.maximum(mx_, 1) < 0.15))
    filled = ndi.binary_fill_holes(a)
    # 무채색 규칙은 다리 쪽(인물 아래 35%)에서만 — 위쪽의 은장식·버클·목걸이는 밝은 무채색이라 구멍이 된다.
    # 굵기 5px 미만 덩어리(코트 은테 줄)도 제외: 침식 2번에 살아남는 덩어리만 주머니로 본다
    ys_ = np.where(filled.any(1))[0]
    low = np.zeros_like(near)
    if len(ys_):
        low[int(ys_[-1] - 0.35 * (ys_[-1] - ys_[0])):] = True
    cand = (filled & ~a) | (filled & near & low)
    lab, n = ndi.label(cand)
    if n:
        idx = np.arange(1, n + 1)
        frac = ndi.mean(near.astype(np.float32), lab, idx); sz = ndi.sum(np.ones_like(near, np.float32), lab, idx)
        thick = ndi.maximum(ndi.binary_erosion(cand, iterations=2).astype(np.float32), lab, idx)
        bad = np.zeros(n + 1, bool); bad[1:] = (frac > 0.7) & (sz > 60) & (thick > 0)
        a = filled & ~bad[lab]
    else:
        a = filled
    a = floor_shadow(rgb, a, {'band': 0.1})
    # 발밑에 남은 밝은 무채색 테(그림자 가장자리·배경): 장화는 어두운 갈색이라 아래 8% 띠의 밝은 회색은 배경이다
    ys = np.where(a.any(1))[0]
    if len(ys):
        y0 = int(ys[-1] - 0.08 * (ys[-1] - ys[0]))
        f = rgb.astype(np.float32); mx, mn = f.max(2), f.min(2)
        light = (f.mean(2) > 140) & ((mx - mn) / np.maximum(mx, 1) < 0.14)
        light[:y0] = False
        a &= ~ndi.binary_dilation(light, iterations=1)
        a = ndi.binary_opening(a, iterations=1)
    lab, n = ndi.label(a)
    if n > 1:
        sz = ndi.sum(a, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool); keep[1:] = sz > max(400, 0.004 * sz.max())
        a = keep[lab]
    return a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video'); ap.add_argument('char'); ap.add_argument('cls')
    ap.add_argument('--quality', type=int, default=80)
    a = ap.parse_args()
    tmp = tempfile.mkdtemp(prefix='turn16_', dir=os.environ.get('TMPDIR') or None)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.video, os.path.join(tmp, 'f%03d.png')], check=True)
    frames = sorted(glob.glob(os.path.join(tmp, 'f*.png')))
    meas = []
    for f in frames:
        m = quick_mask(np.asarray(Image.open(f).convert('RGB')))
        meas.append(band_width(m))
    yaw, info = estimate_yaw([m[0] for m in meas])
    pick = []
    for t in TARGETS:
        i = int(np.argmin(np.abs(yaw - t)))
        pick.append((t, i, float(yaw[i])))
    print('anchors', info)
    print('picks', [(round(t, 1), i, round(y, 1)) for t, i, y in pick])
    # 전역 배율: 앞모습 프레임의 키 (카메라 고정이라 모든 프레임이 같은 배율)
    f0 = np.asarray(Image.open(frames[pick[0][1]]).convert('RGB'))
    a0 = cut(f0)
    ys = np.where(a0.any(1))[0]
    S = TH / float(ys[-1] - ys[0])
    views, cells = {}, []
    for t, i, y in pick:
        rgb = np.asarray(Image.open(frames[i]).convert('RGB')).copy()
        al = cut(rgb)
        ys, xs = np.where(al)
        pad = 6
        x0, y0, x1, y1 = max(0, xs.min() - pad), max(0, ys.min() - pad), min(rgb.shape[1], xs.max() + 1 + pad), min(rgb.shape[0], ys.max() + 1 + pad)
        col = bleed(rgb, al)
        soft = ndi.gaussian_filter(al.astype(np.float32), 0.8)
        crop = np.dstack([col, (soft * 255).astype(np.uint8)])[y0:y1, x0:x1]
        im = Image.fromarray(crop, 'RGBA')
        im = im.resize((max(1, round(im.width * S)), max(1, round(im.height * S))), Image.LANCZOS)
        lab_, d = label(t)
        bw, bc, _, _ = band_width(np.asarray(im)[..., 3] > 100)
        cells.append((lab_, d, im, bw, bc, i, y))
    cw = max(c[2].width for c in cells) + 4
    ch = max(c[2].height for c in cells) + 4
    rows = (len(cells) + COLS - 1) // COLS
    sheet = Image.new('RGBA', (cw * COLS, ch * rows), (0, 0, 0, 0))
    turn16 = []
    for k, (lab_, d, im, bw, bc, i, y) in enumerate(cells):
        cx, cy = (k % COLS) * cw, (k // COLS) * ch
        sheet.paste(im, (cx, cy))
        m = measure(im)
        m['axisX'] = round(bc, 1)                      # 어깨 띠 가운데 = 도는 축 (이웃 칸 교차 때 맞춘다)
        views[lab_] = dict(x=cx, y=cy, w=im.width, h=im.height, bw=round(bw, 1), frame=i, yawEst=round(y % 360, 1), **m)
        turn16.append(dict(deg=d, v=lab_))
    Sa = np.asarray(sheet).copy()
    mm = Sa[..., 3] > 8
    Sa[..., :3] = bleed(Sa[..., :3], mm)
    sheet = Image.fromarray(Sa, 'RGBA')
    out_dir = ensure(os.path.join(OUT, a.char, a.cls))
    tp = os.path.join(out_dir, 'turn.webp')
    sheet.save(tp, 'WEBP', quality=a.quality, alpha_quality=85, method=6)
    turn16.sort(key=lambda e: e['deg'])
    steps = {}
    for d in [0, 45, 90, 135, 180, -135, -90, -45]:
        lab_ = label(d)[0]
        if lab_ in views:
            steps[str(d)] = dict(v=lab_, m=0)
    turn = dict(th=TH, size=[sheet.width, sheet.height], views=views, steps=steps, mask=False, turn16=turn16,
                src='kling-video-v3_0_turbo 360° turntable (tools/puppet/anime/build_turn16.py)', anchors=info)
    rp = os.path.join(out_dir, 'rig.json')
    rj = load_json(rp)
    rj['turn'] = turn
    save_json(rp, rj)
    dd = ensure(os.path.join(DBG, a.cls))
    on_green(sheet, 0.5).save(os.path.join(dd, 'turn16.jpg'), quality=85)
    print(f'[{a.cls}] turn16 {len(views)} views {sheet.width}x{sheet.height} {os.path.getsize(tp) // 1024} KB → {tp}')


if __name__ == '__main__':
    main()
