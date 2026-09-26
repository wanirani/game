#!/usr/bin/env python3
"""턴어라운드 시트(5뷰 + 3/4 뒷모습 2뷰) → 인벤토리 회전용 8방향 스프라이트 시트
  python3 tools/puppet/build_turn.py tools/puppet/rigs/kael/kael_hunter.json
리그 테이블 turn = {sheet5, views5:[라벨 5개], qback, viewsQ:[라벨 2개], extra:[{sheet, views}], fixups:[...]}
라벨 = 그 그림이 보여 주는 yaw (0=오른쪽 옆모습, 90=정면, 180=왼쪽 옆모습, -90=뒷모습):
  y0 y45 y90 y135 y180 ym45 ym90 ym135, '-' = 버림. 시트의 인물은 왼쪽→오른쪽 순서로 라벨과 짝지어진다.
없는 방향은 좌우 반전으로 채운다 (yaw θ 의 거울상 = 180-θ).
출력: assets/puppets/<charId>/<classId>/turn.webp (뷰들을 가로로 이어 붙임) + rig.json 의 turn 항목
  turn = {th, size:[w,h], views:{라벨:{x,w,h,footX,axisX,footY,shY,shW,hemY}}, steps:{"0":{v:라벨,m:0|1}, "45":..., ...}}
fixups: [{view, box:[x0,y0,x1,y1](0~1 비율), hue:[a,b], sat:[a,b], to:'#rrggbb'}] — 시트 생성 때 새어 들어온 색(예: 다른 뷰의 붉은 머리띠)을 고친다."""
import argparse, os, sys, json
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.pup import SRC, OUT, DBG, ensure, load_json, save_json, rgb_of, alpha_for, bleed, hsv_arrays, die, on_green
from build_rig import load_rig

TH = 640          # 정규화한 인물 높이(px)
STEPS = [0, 45, 90, 135, 180, -135, -90, -45]
LBL = {0: 'y0', 45: 'y45', 90: 'y90', 135: 'y135', 180: 'y180', -135: 'ym135', -90: 'ym90', -45: 'ym45'}


def mirror_of(deg):
    m = 180 - deg
    m = ((m + 180) % 360) - 180
    return 180 if m == -180 else m


def cut_views(sheet_key, labels, dbg_name):
    p = os.path.join(SRC, sheet_key + '.webp')
    if not os.path.exists(p):
        die(f'턴어라운드 시트 없음: {p}')
    rgb = rgb_of(p)
    H, W = rgb.shape[:2]
    a = alpha_for(p, os.path.join(SRC, sheet_key + '_alpha.png')) > 127
    a[int(H * 0.93):, int(W * 0.8):] = False               # 워터마크 자리
    a = ndi.binary_fill_holes(a)
    f = rgb.astype(np.float32)
    sat = (f.max(2) - f.min(2)) / np.maximum(f.max(2), 1)
    a &= ~((f.mean(2) > 150) & (sat < 0.08) & (ndi.binary_erosion(a, iterations=6) == 0))  # 가장자리의 밝은 무채색(발밑 그림자·배경)
    a = ndi.binary_opening(a, iterations=1)
    a = ndi.binary_fill_holes(a)
    lab, n = ndi.label(a)
    sizes = ndi.sum(a, lab, range(1, n + 1))
    k = len(labels)
    comps = [i + 1 for i in np.argsort(-sizes)[:k] if sizes[i] > 15000]
    boxes = []
    for c in comps:
        ys, xs = np.where(lab == c)
        boxes.append((xs.min(), ys.min(), xs.max(), ys.max(), c))
    boxes.sort()
    if len(boxes) != k:
        print(f'  ! {sheet_key}: 인물 {len(boxes)}개 검출 (라벨 {k}개) — 라벨 순서를 확인할 것')
    out = {}
    for (x0, y0, x1, y1, c), v in zip(boxes, labels):
        if v == '-':
            continue
        m = lab == c
        idx = ndi.distance_transform_edt(~m, return_distances=False, return_indices=True)
        col = rgb[idx[0], idx[1]]
        al = ndi.gaussian_filter(m.astype(np.float32), 1.0)
        pad = 6
        crop = np.dstack([col, (al * 255).astype(np.uint8)])[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad]
        img = Image.fromarray(crop, 'RGBA')
        s = TH / (y1 - y0)
        img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
        out[v] = img
    return out


def measure(img):
    A = np.asarray(img)[..., 3] > 100
    ys, xs = np.where(A)
    top, bot = ys.min(), ys.max()
    h = bot - top
    foot = float(xs[ys > bot - 0.08 * h].mean())
    y0b, y1b = top + 0.18 * h, top + 0.5 * h
    axis = float(xs[(ys > y0b) & (ys < y1b)].mean())
    shy = int(top + 0.2 * h)                                # 어깨선(대략)
    row = np.where(A[shy])[0]
    shw = float((row.max() - row.min()) / 2) if len(row) else 30.0
    return dict(footX=round(foot, 1), axisX=round(axis, 1), footY=float(bot), topY=float(top), shY=float(shy), shW=round(shw, 1),
                hemY=float(top + 0.72 * h))


def apply_fixups(img, fixes):
    A = np.asarray(img).copy()
    H, W = A.shape[:2]
    for fx in fixes:
        x0, y0, x1, y1 = fx['box']
        sub = A[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)]
        hue, s, v = hsv_arrays(sub[..., :3])
        a, b = fx['hue']
        m = ((hue >= a) & (hue <= b)) if a <= b else ((hue >= a) | (hue <= b))
        m &= (s >= fx.get('sat', [0.3, 1.01])[0]) & (s <= fx.get('sat', [0.3, 1.01])[1])
        if not m.any():
            continue
        t = np.array([int(fx['to'][i:i + 2], 16) for i in (1, 3, 5)], np.float32)
        tl = 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]
        px = sub[..., :3].astype(np.float32)
        l = 0.2126 * px[..., 0] + 0.7152 * px[..., 1] + 0.0722 * px[..., 2]
        new = t[None, None, :] * (l / max(20, tl) * fx.get('gain', 1.4))[..., None]
        w = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.0)[..., None]
        sub[..., :3] = np.clip(px * (1 - w) + new * w, 0, 255).astype(np.uint8)
    return Image.fromarray(A, 'RGBA')


def build_turn(rig_path, quiet=False):
    rig = load_rig(rig_path)
    T = rig.get('turn')
    if not T:
        return None
    cid, clsid = rig['charId'], rig['classId']
    views = {}
    if T.get('sheet5'):
        views.update(cut_views(T['sheet5'], T['views5'], 'turn5'))
    if T.get('qback'):
        views.update(cut_views(T['qback'], T['viewsQ'], 'qback'))
    for ex in T.get('extra', []):   # 추가 시트 (재생성한 한 장짜리 뒷모습 등): {sheet, views:[...]}
        views.update(cut_views(ex['sheet'], ex['views'], 'extra'))
    for fx in T.get('fixups', []):
        if fx['view'] in views:
            views[fx['view']] = apply_fixups(views[fx['view']], [fx])
    # 스프라이트 시트
    order = [v for v in ['y0', 'y45', 'y90', 'y135', 'y180', 'ym135', 'ym90', 'ym45'] if v in views]
    Wt = sum(views[v].width + 4 for v in order)
    Ht = max(views[v].height for v in order)
    sheet = Image.new('RGBA', (Wt, Ht), (0, 0, 0, 0))
    meta = {}
    x = 0
    for v in order:
        im = views[v]
        sheet.paste(im, (x, 0))
        meta[v] = dict(x=x, w=im.width, h=im.height, **measure(im))
        x += im.width + 4
    Sa = np.asarray(sheet).copy()
    mm = Sa[..., 3] > 8
    Sa[..., :3] = bleed(Sa[..., :3], mm)
    sheet = Image.fromarray(Sa, 'RGBA')
    out_dir = ensure(os.path.join(OUT, cid, clsid))
    tp = os.path.join(out_dir, 'turn.webp')
    sheet.save(tp, 'WEBP', quality=84, alpha_quality=90, method=6)
    steps = {}
    for d in STEPS:
        l = LBL[d]
        if l in meta:
            steps[str(d)] = dict(v=l, m=0)
        else:
            ml = LBL[mirror_of(d)]
            if ml in meta:
                steps[str(d)] = dict(v=ml, m=1)
    missing = [d for d in STEPS if str(d) not in steps]
    if missing:
        print(f'  ! {clsid}: 방향 없음 {missing}')
    turn = dict(th=TH, size=[sheet.width, sheet.height], views=meta, steps=steps)
    rp = os.path.join(out_dir, 'rig.json')
    rj = load_json(rp) if os.path.exists(rp) else {}
    rj['turn'] = turn
    save_json(rp, rj)
    dd = ensure(os.path.join(DBG, clsid))
    on_green(sheet, 0.5).save(os.path.join(dd, 'turn.jpg'), quality=85)
    if not quiet:
        print(f'[{clsid}] turn views={order} {os.path.getsize(tp) // 1024} KB')
    return turn


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('rig')
    a = ap.parse_args()
    build_turn(a.rig)
