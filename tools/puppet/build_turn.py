#!/usr/bin/env python3
"""턴어라운드 시트(5뷰 + 3/4 뒷모습 2뷰) → 인벤토리 회전용 8방향 스프라이트 시트
  python3 tools/puppet/build_turn.py tools/puppet/rigs/kael/kael_hunter.json
리그 테이블 turn = {sheet5, views5:[라벨 5개], qback, viewsQ:[라벨 2개], extra:[{sheet, views, pockets?, deshadow?}], fixups:[...]}
  deshadow (opt-in, extra 시트만): 한 장짜리 재생성본 발밑의 바닥 그림자 지우기 (floor_shadow)
라벨 = 그 그림이 보여 주는 yaw (0=오른쪽 옆모습, 90=정면, 180=왼쪽 옆모습, -90=뒷모습):
  y0 y45 y90 y135 y180 ym45 ym90 ym135, '-' = 버림. 시트의 인물은 왼쪽→오른쪽 순서로 라벨과 짝지어진다.
없는 방향은 좌우 반전으로 채운다 (yaw θ 의 거울상 = 180-θ).
출력: assets/puppets/<charId>/<classId>/turn.webp (뷰들을 가로로 이어 붙임) + rig.json 의 turn 항목
  turn = {th, size:[w,h], views:{라벨:{x,w,h,footX,axisX,footY,shY,shW,hemY}}, steps:{"0":{v:라벨,m:0|1}, "45":..., ...}}
fixups: [{view, box:[x0,y0,x1,y1](0~1 비율), hue:[a,b], sat:[a,b], val:[a,b]?, to:'#rrggbb', gain?}] — 시트 생성 때 새어 들어온 색
  (예: 다른 뷰의 붉은 머리띠, 한 뷰만 갈색으로 나온 검은 가죽)을 고친다. 결과 밝기 = 원래 밝기 × gain (to 의 색조로).
재질 마스크 turn_mask.webp (R=갑옷, G=장식, 절반 해상도): 측면 원화 부품의 재질 마스크에서 색 모델을 배워 각 뷰를 분류
  → 런타임이 장비 갑옷 색을 턴테이블 8방향에도 칠한다 (옆모습 퍼펫과 같은 색)."""
import argparse, os, sys, json
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.pup import SRC, OUT, DBG, ensure, load_json, save_json, rgb_of, alpha_for, bleed, hsv_arrays, die, on_green
from build_rig import load_rig

TH = 580          # 정규화한 인물 높이(px) — 메뉴 무대(≈300 논리px × DPR2)에 충분
STEPS = [0, 45, 90, 135, 180, -135, -90, -45]
LBL = {0: 'y0', 45: 'y45', 90: 'y90', 135: 'y135', 180: 'y180', -135: 'ym135', -90: 'ym90', -45: 'ym45'}


def mirror_of(deg):
    m = 180 - deg
    m = ((m + 180) % 360) - 180
    return 180 if m == -180 else m


def bg_pockets(rgb, a0, a, P):
    """리그 turn.pockets (opt-in): 구멍 메우기(fill_holes)가 되살린 '갇힌 배경' — 팔과 코트 사이·다리 사이의 배경 주머니.
    rembg 가 이미 투명으로 본 구멍 중 화소의 frac 이상이 그 줄의 배경색(좌우 끝 중앙값)과 T 이내인 덩어리만 고른다.
    흰 옷은 그늘진 천이 배경 회색과 같아 천까지 지워지므로 켜지 말 것 (어두운 옷 전용). P = {T, frac, min}"""
    f = rgb.astype(np.float32)
    bgrow = np.median(np.concatenate([f[:, :24], f[:, -24:]], 1), axis=1)
    near = np.abs(f - bgrow[:, None, :]).max(2) < P.get('T', 18)
    hole = a & ~a0
    lab, n = ndi.label(hole)
    if not n:
        return np.zeros_like(a)
    idx = np.arange(1, n + 1)
    fr, sz = ndi.mean(near, lab, idx), ndi.sum(hole, lab, idx)
    keep = np.zeros(n + 1, bool)
    keep[1:] = (fr >= P.get('frac', 0.55)) & (sz >= P.get('min', 30))
    return keep[lab]


def floor_shadow(rgb, a, P):
    """리그 turn.extra[].deshadow (opt-in): 한 장짜리 재생성(q3f 등) 밑의 바닥 그림자 — rembg 가 발밑의 회색 그림자까지 인물로 잡는다.
    인물 높이 아래쪽 band 몫 안에서 '그림자 같은' 화소(무채색·배경보다 어둡거나 같은 밝기)를 지우되,
    그림자답지 않은 화소(어두운 밑창·채색 가죽·강철의 윤곽/반사)로 만든 발 덩어리(닫기+구멍 메우기) 안은 남긴다 → 회색 강철 발도 산다.
    P = True | {band, T, sd, close}"""
    P = P if isinstance(P, dict) else {}
    ys = np.where(a.any(1))[0]
    if not len(ys):
        return a
    top, bot = ys[0], ys[-1]
    y0 = int(bot - P.get('band', 0.12) * (bot - top))
    f = rgb.astype(np.float32)
    mx, mn = f.max(2), f.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    lum = f.mean(2)
    bgl = np.median(np.concatenate([f[:, :24], f[:, -24:]], 1), axis=1).mean(1)[:, None]    # 줄마다 배경 밝기
    m = ndi.uniform_filter(lum, 5)
    sd = np.sqrt(np.maximum(ndi.uniform_filter(lum * lum, 5) - m * m, 0))
    sl = (sat < P.get('T', 0.12)) & (lum > 0.3 * bgl) & (lum < 1.03 * bgl)
    core = a & (~sl | (sd > P.get('sd', 9.0)))
    core[:max(0, y0 - 40)] = a[:max(0, y0 - 40)]
    core = ndi.binary_opening(core, iterations=1)
    core = ndi.binary_fill_holes(ndi.binary_closing(core, iterations=P.get('close', 4)))
    cut = a & sl & ~core
    cut[:y0] = False
    out = ndi.binary_opening(a & ~cut, iterations=1)
    lab, n = ndi.label(out)
    if n:
        sz = ndi.sum(out, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sz > max(400, 0.002 * sz.max())
        out = keep[lab]
    return out


def cut_views(sheet_key, labels, dbg_name, pockets=None, deshadow=None):
    p = os.path.join(SRC, sheet_key + '.webp')
    if not os.path.exists(p):
        die(f'턴어라운드 시트 없음: {p}')
    rgb = rgb_of(p)
    H, W = rgb.shape[:2]
    a = alpha_for(p, os.path.join(SRC, sheet_key + '_alpha.png')) > 127
    a[int(H * 0.93):, int(W * 0.8):] = False               # 워터마크 자리
    a0 = a.copy()
    a = ndi.binary_fill_holes(a)
    pk = bg_pockets(rgb, a0, a, pockets) if pockets else None
    if pk is not None:
        a &= ~pk
    if deshadow:
        a = floor_shadow(rgb, a, deshadow)
    f = rgb.astype(np.float32)
    sat = (f.max(2) - f.min(2)) / np.maximum(f.max(2), 1)
    a &= ~((f.mean(2) > 150) & (sat < 0.08) & (ndi.binary_erosion(a, iterations=6) == 0))  # 가장자리의 밝은 무채색(발밑 그림자·배경)
    a = ndi.binary_opening(a, iterations=1)
    a = ndi.binary_fill_holes(a)
    if pk is not None:
        a &= ~pk
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


def measure(img, frac=0.0):
    """frac (opt-in bodyTop): 뷰 높이 중 머리 장식이 차지하는 몫 — topY 를 그만큼 내려 몸 높이로 정규화 (측면 퍼펫 figTop 과 같은 기준)"""
    A = np.asarray(img)[..., 3] > 100
    ys, xs = np.where(A)
    top, bot = ys.min(), ys.max()
    if frac:
        top = float(top + frac * (bot - top))
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
        if 'val' in fx:
            m &= (v >= fx['val'][0]) & (v <= fx['val'][1])
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


def _hist(h, s, v, sel):
    """HSV 3차원 히스토그램 (색상 18 × 채도 8 × 명도 8), 합 1 로 정규화 + 약한 번짐"""
    if not sel.any():
        return np.zeros((18, 8, 8), np.float32)
    H_, _ = np.histogramdd(np.stack([h[sel], s[sel], v[sel]], 1), bins=(18, 8, 8), range=((0, 360), (0, 1.0001), (0, 1.0001)))
    H_ = ndi.gaussian_filter(H_.astype(np.float32), 0.6, mode=('wrap', 'nearest', 'nearest'))
    return H_ / max(1e-6, H_.sum())


def turn_mask(sheet, meta, rig, cid, clsid):
    """턴테이블 재질 마스크: 측면 원화 부품(ui 아틀라스)의 재질 마스크를 정답으로 HSV 색 모델을 배워
    (갑옷/장식 vs 그 밖: 피부·머리카락·바지·장화·허리띠 …) 각 뷰 픽셀의 사후확률로 칠한다.
    세로 범위: 목 아래 ~ 옷자락 밑단 (다리 부품이 갑옷 규칙에 있으면 발끝까지) — 머리 장식·모자에 번지지 않게."""
    d = os.path.join(OUT, cid, clsid)
    rj = load_json(os.path.join(d, 'rig.json'))
    ui = rj['levels'].get('ui') or rj['levels'][sorted(rj['levels'], key=lambda k: rj['levels'][k]['scale'])[-1]]
    lv = [k for k, v in rj['levels'].items() if v is ui][0]
    A = np.asarray(Image.open(os.path.join(d, f'atlas_{lv}.webp')).convert('RGBA'))
    M = np.asarray(Image.open(os.path.join(d, f'mask_{lv}.webp')).convert('RGB').resize((A.shape[1], A.shape[0]), Image.BILINEAR))
    h, s, v = hsv_arrays(A[..., :3])
    al = A[..., 3] > 200
    headish = np.zeros(al.shape, bool)
    for k in ('head',):
        r = ui['rects'].get(k)
        if r:
            headish[r[1]:r[1] + r[3], r[0]:r[0] + r[2]] = True
    S = np.asarray(sheet)
    sh_, ss_, sv_ = hsv_arrays(S[..., :3])
    hi = np.clip((sh_ / 20).astype(int), 0, 17); si = np.clip((ss_ * 8).astype(int), 0, 7); vi = np.clip((sv_ * 8).astype(int), 0, 7)
    out = np.zeros(S.shape[:2] + (3,), np.float32)
    mats = rig.get('materials', {})
    legs_armor = any(p_ in (r_.get('parts', []) if isinstance(r_, dict) else []) for r_ in ([mats.get('armor')] if isinstance(mats.get('armor'), dict) else (mats.get('armor') or [])) for p_ in ('thigh', 'shin', 'foot'))
    J = rj['joints']; ft, so = rj['figTop'], rj['sole']
    f_neck = (J['neck'][1] - ft) / (so - ft) + 0.015
    f_hem = 1.0 if legs_armor else (J.get('skirtBot', so) - ft) / (so - ft)
    band = np.zeros(S.shape[:2], np.float32)
    YY = np.arange(S.shape[0], dtype=np.float32)[:, None]
    pony = (rj.get('opts') or {}).get('pony', True) is not False
    for vname, vm in meta.items():
        hgt = vm['footY'] - vm['topY']
        y0, y1 = vm['topY'] + f_neck * hgt, vm['topY'] + f_hem * hgt
        ramp = np.clip((YY - y0) / (0.025 * hgt), 0, 1) * np.clip((y1 - YY) / (0.03 * hgt), 0, 1)
        sub = np.repeat(ramp, vm['w'], 1)
        dx = np.abs(np.arange(vm['w'], dtype=np.float32)[None, :] - vm['axisX']) / max(8.0, vm['shW'])
        # 색만으로는 검은 가죽 코트와 바지·머리카락이 갈리지 않는다 → 자리로 거른다
        if vname in ('y45', 'y90', 'y135') and not legs_armor:     # 앞모습: 벌어진 코트 자락 사이의 바지
            yr = (YY - (vm['topY'] + 0.47 * hgt)) / (0.04 * hgt)
            sub *= 1 - np.clip(yr, 0, 1) * np.clip((0.62 - dx) / 0.12, 0, 1)
        if vname in ('ym45', 'ym90', 'ym135') and pony:              # 뒷모습: 등에 늘어진 포니테일
            yr = ((vm['topY'] + 0.31 * hgt) - YY) / (0.03 * hgt)
            sub *= 1 - np.clip(yr, 0, 1) * np.clip((0.42 - dx) / 0.1, 0, 1)
        band[:, vm['x']:vm['x'] + vm['w']] = sub
    for ch in (0, 1):
        pos = al & (M[..., ch] > 150)
        neg = al & (M[..., ch] < 25) & ~(headish & (s < 0.25))     # 모자·두건(무채색)은 음성 표본에서 뺀다 (옷과 같은 색)
        if pos.sum() < 50:
            continue
        Hp, Hn = _hist(h, s, v, pos), _hist(h, s, v, neg)
        post = Hp / (Hp + Hn + 1e-6)
        pr = post[hi, si, vi]
        w = np.clip((pr - 0.3) / 0.3, 0, 1) * band * (S[..., 3] / 255.0)
        out[..., ch] = cv2.GaussianBlur(w.astype(np.float32), (0, 0), 1.6)   # 가죽 결 때문에 픽셀 단위로 들쭉날쭉 → 부드럽게
    img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGB')
    img = img.resize((max(1, img.width // 2), max(1, img.height // 2)), Image.LANCZOS)
    p = os.path.join(d, 'turn_mask.webp')
    img.save(p, 'WEBP', quality=72, method=6)                           # 손실 압축으로 충분 (≈20KB, 무손실이면 100KB+)
    return p


def build_turn(rig_path, quiet=False):
    rig = load_rig(rig_path)
    T = rig.get('turn')
    if not T:
        return None
    cid, clsid = rig['charId'], rig['classId']
    views = {}
    pk = T.get('pockets')           # opt-in: 갇힌 배경 주머니 비우기 (bg_pockets). 없으면 예전과 똑같다
    if T.get('sheet5'):
        views.update(cut_views(T['sheet5'], T['views5'], 'turn5', pk))
    if T.get('qback'):
        views.update(cut_views(T['qback'], T['viewsQ'], 'qback', pk))
    for ex in T.get('extra', []):   # 추가 시트 (재생성한 한 장짜리 뒷모습 등): {sheet, views:[...], pockets?}
        views.update(cut_views(ex['sheet'], ex['views'], 'extra', ex.get('pockets', pk), ex.get('deshadow')))
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
    # opt-in bodyTop (build_rig): 측면 원화에서 머리 장식이 차지하는 몫을 뷰에도 적용 → 옆모습 퍼펫과 채색 뷰의 몸 크기가 같다.
    # 뷰마다 다르면 turn.bodyFrac = {라벨: 몫} 으로 덮어쓴다
    frac = {}
    rp0 = os.path.join(OUT, cid, clsid, 'rig.json')
    if rig.get('bodyTop') is not None and os.path.exists(rp0):
        r0 = load_json(rp0)
        if r0.get('artTop') is not None:
            f0 = (r0['figTop'] - r0['artTop']) / (r0['sole'] - r0['artTop'])
            frac = {v: T.get('bodyFrac', {}).get(v, f0) for v in order}
    for v in order:
        im = views[v]
        sheet.paste(im, (x, 0))
        meta[v] = dict(x=x, w=im.width, h=im.height, **measure(im, frac.get(v, 0.0)))
        x += im.width + 4
    Sa = np.asarray(sheet).copy()
    mm = Sa[..., 3] > 8
    Sa[..., :3] = bleed(Sa[..., :3], mm)
    sheet = Image.fromarray(Sa, 'RGBA')
    out_dir = ensure(os.path.join(OUT, cid, clsid))
    tp = os.path.join(out_dir, 'turn.webp')
    # opt-in turn.quality (hero7): 턴 시트 webp 품질 (기본 80). APK 그림 단계 예산(45 MB, build_web)이 빠듯해 이졸데는 72
    sheet.save(tp, 'WEBP', quality=int(T.get('quality', 80)), alpha_quality=85, method=6)
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
    has_mask = False
    if (rig.get('materials') or {}).get('armor') or (rig.get('materials') or {}).get('trim'):
        try:
            turn_mask(sheet, meta, rig, cid, clsid); has_mask = True
        except Exception as e:  # 아틀라스가 아직 없는 등 — 마스크 없이 진행 (런타임은 원래 색)
            print(f'  ! {clsid}: turn_mask 실패 {e}')
    turn = dict(th=TH, size=[sheet.width, sheet.height], views=meta, steps=steps, mask=has_mask)
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
