#!/usr/bin/env python3
"""리그 테이블(JSON) → 퍼펫 부품 아틀라스 (측면 전신 원화 1장 + 손 시트 1장)
  python3 tools/puppet/build_rig.py tools/puppet/rigs/kael/kael_hunter.json [--dbg]
출력 assets/puppets/<charId>/<classId>/
  atlas_{lo,hi,ui}.webp  부품 아틀라스 (레벨마다 따로 선반 패킹, 사각형은 rig.json)
  mask_{lo,hi,ui}.webp   재질 마스크 (같은 배치, R=갑옷/겉감 재질, G=장식(트림), B=예비) — 무손실
  rig.json               관절·부품·레벨 사각형·손(그립)·옵션 (turn 은 build_turn.py 가 병합)
부품 좌표는 원화(소스) 픽셀. 런타임은 PS = 90 / (sole - figTop) 로 논리 px 로 바꾼다.
리그 테이블 형식과 작성 절차는 docs/art/PUPPET_PIPELINE.md 참고."""
import argparse, json, os, sys, math, copy
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.pup import (SRC, OUT, DBG, ensure, load_json, save_json, rgb_of, alpha_for, poly_mask, bleed, feather, bbox,
                     hsv_arrays, file_hash, on_green, die)

LEVELS_DEF = {'lo': 0.1, 'hi': 0.2, 'ui': 0.36}
# 아틀라스에 넣는 순서(패킹은 높이순). grip/open 은 손 시트에서 온다
PART_ORDER = ['torso', 'skirt', 'skirtFar', 'head', 'pony', 'uarm', 'farm', 'hand', 'pad', 'thigh', 'shin', 'foot', 'coil', 'grip', 'open']


# ───────── 리그 테이블 읽기 (extends 상속) ─────────
def deep_merge(a, b):
    out = copy.deepcopy(a)
    for k, v in b.items():
        if k == 'extends':
            continue
        if isinstance(v, dict) and isinstance(out.get(k), dict) and not v.get('_replace'):
            out[k] = deep_merge(out[k], v)
        elif v is None:
            out.pop(k, None)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load_rig(path):
    r = load_json(path)
    if r.get('extends'):
        base = os.path.join(os.path.dirname(path), r['extends'] + '.json')
        r = deep_merge(load_rig(base), r)
    r['_path'] = path
    return r


# ───────── 빌드 ─────────
class B:
    pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rig')
    ap.add_argument('--dbg', action='store_true', help='부품별 디버그 JPG 저장')
    ap.add_argument('--out', default=None)
    a = ap.parse_args()
    build(a.rig, dbg=a.dbg, out=a.out)


def build(rig_path, dbg=False, out=None, quiet=False):
    rig = load_rig(rig_path)
    cid, clsid = rig['charId'], rig['classId']
    C = B()
    C.rig = rig
    src_png = os.path.join(SRC, rig['src'] + '.webp')
    alpha_png = os.path.join(SRC, rig['src'] + '_alpha.png')
    if not os.path.exists(src_png):
        die(f'원화 없음: {src_png}')
    rgb = rgb_of(src_png)
    H, W = rgb.shape[:2]
    C.W, C.H = W, H
    fig = alpha_for(src_png, alpha_png) > 127
    J = {k: (v if isinstance(v, (int, float)) else tuple(map(float, v))) for k, v in rig['joints'].items()}
    C.J = J
    clean = rig.get('clean', {})
    lum = rgb.astype(np.float32).mean(2)
    YY, XX = np.mgrid[0:H, 0:W]
    # 행별 배경색(좌우 가장자리 30px 중앙값) → 배경과의 거리
    bgrow = np.median(np.concatenate([rgb[:, :30], rgb[:, -30:]], 1).astype(np.float32), axis=1)
    dist_bg = np.abs(rgb.astype(np.float32) - bgrow[:, None, :]).max(2)
    # 구멍 메우기: 머리카락 틈(keepHoles 상자 안의 배경색 구멍)만 남기고 채운다
    holes = ndi.binary_fill_holes(fig) & ~fig
    lab, n = ndi.label(holes)
    kh = clean.get('keepHoles')  # [x0,y0,x1,y1]
    if n:
        sizes = ndi.sum(holes, lab, range(1, n + 1))
        coms = ndi.center_of_mass(holes, lab, range(1, n + 1))
        for i, s in enumerate(sizes):
            yy, xx = coms[i]
            hm = lab == i + 1
            in_keep = kh is not None and kh[1] <= yy <= kh[3] and kh[0] <= xx <= kh[2]
            bgish = np.median(dist_bg[hm]) < 14 and rgb[hm].astype(np.float32).std(0).mean() < 9
            if s < clean.get('minHole', 900) or (not in_keep and not bgish):
                fig[hm] = True
    lab, n = ndi.label(fig)
    if n > 1:
        sizes = ndi.sum(fig, lab, range(1, n + 1))
        fig = lab == (np.argmax(sizes) + 1)
    # 몸통·어깨 덮개용 실루엣: 머리카락 틈 정리(hairZone) 전 + 안쪽 구멍 모두 메움.
    # hairZone 은 배경과 비슷한 밝은 무채색을 지우는데, 옷깃·어깨의 은색 테두리도 그 색이라 몸통에 투명한 줄무늬가 생겼다
    # (머리가 흔들리면 옷깃 사이로 배경이 비침). 머리카락 틈 정리는 머리·포니테일 부품에만 쓴다.
    fig_body = fig.copy()
    hz = clean.get('hairZone')  # 머리카락 사이로 비치는 배경 제거
    if hz:
        zone = np.zeros((H, W), bool); zone[hz[1]:hz[3], hz[0]:hz[2]] = True
        fig &= ~(zone & (dist_bg < clean.get('hairBgDist', 26)))
    for box in clean.get('cutBoxes', []):  # 원화 밖으로 삐져나온 잡동사니 제거
        fig[box[1]:box[3], box[0]:box[2]] = False
        fig_body[box[1]:box[3], box[0]:box[2]] = False
    # opt-in torsoCarveBg (hero7): 실루엣에 둘러싸인 배경색 구멍(팔과 등 사이로 비치는 회색, heroes3 §5.2 의 회색 쐐기)을 몸통 부품에서 뺀다.
    # 리그의 다각형을 손으로 파내는 대신 빌드에서: 남은(=배경색이라 메우지 않은) 구멍만, 2px 넓혀서
    bg_holes = None
    if rig.get('params', {}).get('torsoCarveBg'):
        bg_holes = ndi.binary_fill_holes(fig) & ~fig
        bg_holes = cv2.dilate(bg_holes.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    fig_body = ndi.binary_fill_holes(fig_body)
    if bg_holes is not None:
        fig_body &= ~bg_holes
    C.fig = fig
    figE = cv2.erode(fig.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1) > 0
    figEB = cv2.erode(fig_body.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1) > 0
    base = rgb.copy()
    C.parts = {}
    regs = rig.get('regions', {})
    RM = {}

    def R(name):
        if name in RM:
            return RM[name]
        d = regs.get(name)
        if d is None:
            m = np.zeros((H, W), bool)
        elif isinstance(d, dict) and 'rect' in d:
            x0, y0, x1, y1 = d['rect']; m = np.zeros((H, W), bool); m[max(0, y0):y1, max(0, x0):x1] = True
        else:
            pts = d['pts'] if isinstance(d, dict) else d
            m = poly_mask(pts, W, H, smooth=(d.get('smooth', 0) if isinstance(d, dict) else 0))
        RM[name] = m
        return m

    def has(name):
        return regs.get(name) is not None

    def inpaint(img, have, want, r=9, tone=0.0, srcm=None, noise=9):
        """want 중 have 가 아닌 곳을 Telea 로 채움 (1/2 해상도). tone>0: 주변 중간 톤으로 끌어올림(그늘 번짐 방지)"""
        hole = want & ~have
        if not hole.any():
            return img
        bb = bbox(want | have, 20, W, H)
        x0, y0, x1, y1 = bb
        sm = have if srcm is None else (have & srcm)
        if not sm.any():
            sm = have
        sub = bleed(img, sm)[y0:y1, x0:x1].copy()
        hm = hole[y0:y1, x0:x1].astype(np.uint8) * 255
        small = cv2.resize(sub, (max(1, sub.shape[1] // 2), max(1, sub.shape[0] // 2)), interpolation=cv2.INTER_AREA)
        hs = cv2.resize(hm, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST)
        hs = cv2.dilate(hs, np.ones((3, 3), np.uint8))
        fill = cv2.inpaint(cv2.cvtColor(small, cv2.COLOR_RGB2BGR), hs, r, cv2.INPAINT_TELEA)
        fill = cv2.cvtColor(fill, cv2.COLOR_BGR2RGB)
        fill = cv2.resize(fill, (sub.shape[1], sub.shape[0]), interpolation=cv2.INTER_CUBIC)
        if tone > 0:
            hv = sm[y0:y1, x0:x1]
            px_ = sub[hv].reshape(-1, 3).astype(np.float32)
            if len(px_) > 20:
                l_ = px_.mean(1)
                sel = (l_ > np.percentile(l_, 20)) & (l_ < np.percentile(l_, 75))
                mean = np.median(px_[sel] if sel.any() else px_, axis=0)
                fill = (fill.astype(np.float32) * (1 - tone) + mean[None, None, :] * tone).astype(np.uint8)
        if noise:
            rng = np.random.default_rng(3)
            nz = cv2.GaussianBlur(rng.normal(0, 1, fill.shape[:2]).astype(np.float32), (0, 0), 2.2) * noise
            fill = np.clip(fill.astype(np.float32) + nz[..., None], 0, 255).astype(np.uint8)
        out_ = img.copy()
        hh = hole[y0:y1, x0:x1]
        out_[y0:y1, x0:x1][hh] = fill[hh]
        return out_

    def extend(img, have, cap_mask, direction):
        """have 를 direction 으로 한 픽셀씩 밀어 cap_mask 를 채움 (관절 덮개)"""
        out_ = img.copy(); cur = have.copy()
        dx, dy = direction
        todo = cap_mask & ~have
        M = np.float32([[1, 0, dx], [0, 1, dy]])
        for _ in range(400):
            if not todo.any():
                break
            shc = cv2.warpAffine(cur.astype(np.uint8), M, (W, H), flags=cv2.INTER_NEAREST) > 0
            shi = cv2.warpAffine(out_, M, (W, H), flags=cv2.INTER_NEAREST)
            new = shc & todo
            if not new.any():
                break
            out_[new] = shi[new]; cur |= new; todo &= ~new
        return out_, cur

    def add(name, img, m, pivot, end=None, fe=1.2, extra=None, src_img=None):
        if not m.any():
            print(f'  ! 부품 {name}: 빈 마스크 (건너뜀)')
            return
        x0, y0, x1, y1 = bbox(m, 4, W, H)
        x1 += 1; y1 += 1
        a = feather(m, fe) if isinstance(fe, (int, float)) else fe
        col = bleed(img, m)
        rgba = np.dstack([col, (np.clip(a, 0, 1) * 255).astype(np.uint8)])[y0:y1, x0:x1]
        C.parts[name] = dict(rgba=rgba, x0=int(x0), y0=int(y0), pivot=[float(pivot[0]), float(pivot[1])],
                             end=[float(end[0]), float(end[1])] if end is not None else None, **(extra or {}))

    P = rig.get('params', {})
    # ── 머리 (+ 목 연장) ──
    head_m = R('head') & figE
    img_h = base
    if has('neckCap'):
        img_h, head_m = extend(base, head_m, R('neckCap') & ~head_m, (0, 1))
    add('head', img_h, head_m, J['headPivot'])
    # ── 포니테일 ──
    pony_on = has('pony') and rig.get('pony') is not False
    torso_full = R('torso') & ~R('head')
    # opt-in ponyCut (heroes3rev): 다각형 목록 = 포니테일 영역에 겹친 견갑 조각(원화에서 머리카락 앞). 포니테일에서 빼 몸통·어깨 덮개에 두고,
    # 그 뒤로 가려졌던 머리카락은 닫힘(ponyCutClose px)으로 메워 인페인트 → 머리가 흔들려도 견갑 조각이 따라가지 않고 머리에 구멍도 없다
    pcut = None
    if regs.get('ponyCut'):
        pcut = np.zeros((H, W), bool)
        for d in regs['ponyCut']:
            pcut |= poly_mask(d['pts'] if isinstance(d, dict) else d, W, H, smooth=(d.get('smooth', 0) if isinstance(d, dict) else 0))
        pcut &= ~R('head')
        torso_full |= pcut & fig_body
    pony_r = (R('pony') & ~pcut) if pcut is not None else R('pony')
    if pony_on:
        torso_full &= ~pony_r
        hairish = lum < P.get('hairLum', 125)
        pony_m = pony_r & figE & ~torso_full & (hairish | (YY < P.get('ponyTopY', 470)))
        img_p = base
        if pcut is not None:
            k = int(P.get('ponyCutClose', 31)) | 1
            fill = cv2.morphologyEx(pony_m.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))) > 0
            fill &= pcut & R('pony') & figE & ~pony_m
            img_p = inpaint(base, pony_m, pony_m | fill, 9)
            pony_m = pony_m | fill
        add('pony', img_p, pony_m, J['ponyRoot'], J['ponyTip'])
    # ── 몸통: 가까운 팔·먼 팔·똬리 아래를 메움 ──
    occl = R('uarm') | R('farm') | R('coil') | R('farArm') | R('head') | R('farArmHole')
    if pony_on:
        occl |= pony_r
    torso_vis = torso_full & figEB & ~occl
    tsrc = (lum < P['torsoSrcMaxLum']) if P.get('torsoSrcMaxLum') else None
    img_t = inpaint(base, torso_vis, torso_full, 11, tone=P.get('torsoTone', 0.5), srcm=tsrc)
    add('torso', img_t, torso_full & fig_body, J['pelvis'], J['neck'])
    if has('pad'):
        add('pad', img_t, R('pad') & torso_full & fig_body, J['shoulder'])
    # ── 위팔 (어깨 쪽·팔꿈치 쪽 덮개 연장) ──
    ua_vis = R('uarm') & figE & ~R('farm')
    ua_full = ua_vis | R('uarmCapTop') | R('uarmCapBot')
    img_u = inpaint(base, ua_vis, ua_full, 9, tone=P.get('uarmTone', 0.25))
    add('uarm', img_u, ua_full, J['shoulder'], J['elbow'])
    # ── 아래팔 / 손 (손목선에서 분리) ──
    el, hd, wr = np.array(J['elbow']), np.array(J['hand']), np.array(J['wrist'])
    ax_f = (hd - el) / (np.linalg.norm(hd - el) or 1)
    along_w = (XX - wr[0]) * ax_f[0] + (YY - wr[1]) * ax_f[1]
    fa_m = R('farm') & figE
    ov = P.get('wristOverlap', 22)
    fore_m = fa_m & (along_w < ov)
    ff = feather(fore_m, 1.2) * np.clip((ov - along_w) / 10, 0, 1)
    add('farm', base, fore_m, J['elbow'], J['hand'], fe=ff)
    hand_m = fa_m & (along_w > -P.get('handBack', 6))
    hf = feather(hand_m, 1.2) * np.clip((along_w + P.get('handBack', 6)) / 6, 0, 1)
    add('hand', base, hand_m, J['wrist'], J['hand'], fe=hf)
    # ── 채찍 똬리 ──
    if has('coil'):
        add('coil', base, R('coil') & figE & ~R('farm'), J.get('coilPivot', J['pelvis']))
    # ── 다리: 넓적다리 / 정강이 / 발 ──
    L = rig.get('legs', {})
    skirt_near_full = R('skirt')
    leg_m = R('leg') & figE & ~skirt_near_full & ~R('skirtFar')
    leg_m |= R('leg') & figE & R('legTop')
    hip, knee, ankle = np.array(J['hip']), np.array(J['knee']), np.array(J['ankle'])
    ax_t = (knee - hip) / np.linalg.norm(knee - hip)
    along_knee = (XX - knee[0]) * ax_t[0] + (YY - knee[1]) * ax_t[1]
    if L.get('pantsWarmMax') is not None:
        rf = rgb.astype(np.float32); warm = (rf[..., 0] - rf[..., 2]) / np.maximum(12, rf.mean(2))
        pants = cv2.morphologyEx(((warm < L['pantsWarmMax']) & fig).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
    else:
        pants = fig.copy()
    coat_edge = np.zeros((H, W), np.uint8)
    if L.get('coatEdge'):
        cv2.polylines(coat_edge, [np.array(L['coatEdge'], np.int32)], False, 1, int(L.get('coatEdgeW', 26)))
    thigh_vis = leg_m & (along_knee < 40) & pants & ~(coat_edge > 0) & ~R('thighExclude')
    tw = L.get('thighWidth', 88)
    dist_axis = np.abs((XX - hip[0]) * ax_t[1] - (YY - hip[1]) * ax_t[0])
    along_hip = (XX - hip[0]) * ax_t[0] + (YY - hip[1]) * ax_t[1]
    thigh_shape = ((dist_axis < tw) & (along_hip > -L.get('thighUp', 120)) & (along_knee < 60)) | (R('thighCap') & (dist_axis < tw + 10))
    img_l = inpaint(base, thigh_vis, thigh_shape | thigh_vis, 7, tone=L.get('thighTone', 0.2))
    thigh_m = (thigh_vis | thigh_shape) & (fig | R('thighCap'))
    tf = feather(thigh_m, 1.2) * np.clip((60 - along_knee) / 30, 0, 1)
    add('thigh', img_l, thigh_m, J['hip'], J['knee'], fe=tf)
    ax_s = (ankle - knee) / np.linalg.norm(ankle - knee)
    along_k2 = (XX - knee[0]) * ax_s[0] + (YY - knee[1]) * ax_s[1]
    fl_ = L.get('footLine', [2395, 980, 0.06])  # y0, x0, 기울기: 발목 위/아래 경계선
    foot_line = YY - (fl_[0] + (XX - fl_[1]) * fl_[2])
    shin_m = leg_m & (along_k2 > -70) & (foot_line < 40) & (pants | (YY > L.get('shinBootY', 2070)))
    if L.get('shinToeCut') is not None:   # opt-in (heroes3rev): 발목에서 발끝 쪽으로 이 px 넘는 곳(구두 앞코 윗선)은 정강이에서 뺀다 — 발 부품이 덮는다
        ft = (np.array(J['toe'], float) - ankle) / np.linalg.norm(np.array(J['toe'], float) - ankle)
        shin_m &= ((XX - ankle[0]) * ft[0] + (YY - ankle[1]) * ft[1]) < L['shinToeCut']
    sf = feather(shin_m, 1.2) * np.clip((along_k2 + 70) / 45, 0, 1) * np.clip((40 - foot_line) / 20, 0, 1)
    add('shin', base, shin_m, J['knee'], J['ankle'], fe=sf)
    foot_m = leg_m & (foot_line > -30) & (XX > L.get('footMinX', 930))
    ff2 = feather(foot_m, 1.2) * np.clip((foot_line + 30) / 28, 0, 1)
    add('foot', base, foot_m, J['ankle'], J['toe'], fe=ff2)
    # ── 코트 자락: 바깥 판 / 안쪽 판 ──
    if has('skirt'):
        sk_vis = skirt_near_full & figE & ~R('farm') & ~R('coil') & ~R('uarm') & ~R('leg')
        sk_vis |= skirt_near_full & figE & R('leg') & ~R('skirtLegCut')
        if P.get('skirtArmPad'):   # opt-in (heroes3rev): 팔 둘레 px 만큼도 인페인트 — 팔 윤곽 가장자리(피부·소매 주름)가 자락에 남아 팔이 비키면 얼룩이 되는 것 방지
            k = 2 * int(P['skirtArmPad']) + 1
            sk_vis &= ~(cv2.dilate((R('farm') | R('uarm')).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))) > 0)
        if P.get('skirtTorsoCut'):   # opt-in (hero7): 몸통 영역(허리 판금 타셋 등) 밑의 자락은 인페인트 — 자락이 돌 때 몸통 조각이 따라 나오지 않게
            sk_vis &= ~R('torso')
        ssrc = (lum < P['skirtSrcMaxLum']) if P.get('skirtSrcMaxLum') else None
        img_s = inpaint(base, sk_vis, skirt_near_full, 11, tone=P.get('skirtTone', 0.55), srcm=ssrc)
        add('skirt', img_s, skirt_near_full & fig, J['skirtPivot'], J['skirtHem'])
    if has('skirtFar'):
        sf_m = R('skirtFar') & figE
        img_sf = inpaint(base, sf_m, R('skirtFar'), 7)
        add('skirtFar', img_sf, R('skirtFar') & fig, J['skirtFarPivot'], J['skirtFarHem'])
    # ── 손 시트: 쥔 주먹(grip) / 편 손(open) ──
    hands_meta = build_hands(C, rig)

    # ── 디버그: 재조립 ──
    dd = ensure(os.path.join(DBG, clsid))
    reas = Image.new('RGBA', (W, H), (40, 150, 60, 255))
    for k in ['skirtFar', 'thigh', 'shin', 'foot', 'skirt', 'torso', 'head', 'pony', 'coil', 'uarm', 'farm', 'hand', 'pad']:
        p = C.parts.get(k)
        if p:
            reas.alpha_composite(Image.fromarray(p['rgba'], 'RGBA'), (p['x0'], p['y0']))
    reas.convert('RGB').resize((W // 3, H // 3), Image.LANCZOS).save(os.path.join(dd, 'reassembled.jpg'), quality=86)
    if dbg:
        for k, p in C.parts.items():
            s = min(1, 600 / max(p['rgba'].shape[:2]))
            on_green(p['rgba'], s).save(os.path.join(dd, f'part_{k}.jpg'), quality=85)

    # ── 띠(strip) 부품: 축이 +y 를 향하도록 미리 회전 ──
    for k in ('pony', 'skirt'):   # skirtFar 는 몸통 좌표계로 그리므로 회전하지 않는다
        if k in C.parts:
            to_strip(C.parts[k])

    # ── 재질 마스크 ──
    mats = rig.get('materials', {})
    for k, p in C.parts.items():
        p['mask'] = material_mask(p, k, mats)

    # ── 아틀라스 ──
    out_dir = ensure(out or os.path.join(OUT, cid, clsid))
    fig_top = int(np.where(fig.any(1))[0].min())
    # opt-in bodyTop (원화 px): 배율 기준 정수리를 고정 — 없으면 알파 맨 위(머리 장식 포함)라서 높은 관·모자 직업일수록 몸이 작아진다.
    # 기본 직업 리그에 넣으면 전 직업이 상속 → 몸 크기가 직업마다 같고 장식만 위로 나온다. artTop = 실제 맨 위(후광 자리)
    body_top = rig.get('bodyTop')
    art_top = fig_top
    if body_top is not None:
        fig_top = int(body_top)
    levels = rig.get('levels', LEVELS_DEF)
    meta = dict(v=file_hash(src_png, alpha_png, rig['_path']), charId=cid, classId=clsid, srcW=W, srcH=H, figTop=fig_top,
                sole=float(J['sole']), joints={k: (list(v) if isinstance(v, tuple) else v) for k, v in J.items()}, parts={}, levels={},
                hands=hands_meta, opts=rig.get('runtime', {}))
    if body_top is not None:
        meta['artTop'] = art_top
    names = [k for k in PART_ORDER if k in C.parts]
    total = 0
    for lv, sc in levels.items():
        rects, size, nb = pack(C, names, sc, lv, out_dir, max_w=512 if sc <= 0.12 else 1024)
        meta['levels'][lv] = dict(scale=sc, size=list(size), rects=rects)
        total += nb
    for k in names:
        p = C.parts[k]
        meta['parts'][k] = dict(x0=p['x0'], y0=p['y0'], w=int(p['rgba'].shape[1]), h=int(p['rgba'].shape[0]), pivot=p['pivot'],
                                end=p['end'], strip=p.get('strip'), **({'src': p['src']} if p.get('src') else {}))
    # 기존 turn 정보 보존 (build_turn.py 가 병합해 둔 것)
    rp = os.path.join(out_dir, 'rig.json')
    if os.path.exists(rp):
        try:
            old = load_json(rp)
            if old.get('turn'):
                meta['turn'] = old['turn']
        except Exception:
            pass
    save_json(rp, meta)
    total += os.path.getsize(rp)
    if not quiet:
        print(f'[{clsid}] parts={len(names)} atlas+mask+rig={total // 1024} KB →', os.path.relpath(out_dir))
    return meta


def to_strip(p):
    px, py = p['pivot']; ex, ey = p['end']
    ang = np.degrees(np.arctan2(ex - px, ey - py))
    im = Image.fromarray(p['rgba'], 'RGBA')
    cx, cy = px - p['x0'], py - p['y0']
    big = Image.new('RGBA', (im.width * 3, im.height * 3), (0, 0, 0, 0)); big.paste(im, (im.width, im.height))
    rot = big.rotate(-ang, resample=Image.BICUBIC, center=(cx + im.width, cy + im.height))
    bb = rot.getbbox(); rot = rot.crop(bb)
    p['rgba'] = np.asarray(rot).copy()
    p['strip'] = dict(ox=float(bb[0] - (cx + im.width)), oy=float(bb[1] - (cy + im.height)), len=float(np.hypot(ex - px, ey - py)), rot=float(np.radians(ang)))


def material_mask(p, name, mats):
    """R=갑옷/겉감(장비 색), G=장식(트림 색). 규칙: {parts:[..], hue:[a,b], sat:[a,b], val:[a,b]} (hue 는 a>b 면 0° 를 감싸는 범위)"""
    rgba = p['rgba']
    hue, s, v = hsv_arrays(rgba[..., :3])
    out = np.zeros(rgba.shape[:2] + (3,), np.float32)
    for ch, key in enumerate(('armor', 'trim', 'extra')):
        rules = mats.get(key)
        if not rules:
            continue
        if isinstance(rules, dict):
            rules = [rules]
        acc = np.zeros(rgba.shape[:2], np.float32)
        for r in rules:
            if name not in r.get('parts', []):
                continue
            m = np.ones(rgba.shape[:2], bool)
            if 'hue' in r:
                a, b = r['hue']
                m &= ((hue >= a) & (hue <= b)) if a <= b else ((hue >= a) | (hue <= b))
            if 'sat' in r:
                m &= (s >= r['sat'][0]) & (s <= r['sat'][1])
            if 'val' in r:
                m &= (v >= r['val'][0]) & (v <= r['val'][1])
            w = m.astype(np.float32)
            if 'val' in r and r.get('softTop'):  # 밝은 반사광은 약하게
                w *= np.clip((r['val'][1] - v) / r['softTop'], 0, 1)
            acc = np.maximum(acc, w * r.get('k', 1))
        acc = cv2.GaussianBlur(acc, (0, 0), 1.2)
        out[..., ch] = acc
    out *= (rgba[..., 3:4] / 255.0)
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)


def pack(C, names, scale, lv, out_dir, max_w=1024):
    items = []
    for k in names:
        p = C.parts[k]
        im = Image.fromarray(p['rgba'], 'RGBA')
        w, h = max(1, round(im.width * scale)), max(1, round(im.height * scale))
        mk = Image.fromarray(p['mask'], 'RGB')
        items.append((k, im.resize((w, h), Image.LANCZOS), mk.resize((w, h), Image.LANCZOS)))
    x = y = rowh = 0
    rects = {}
    for k, im, _ in sorted(items, key=lambda t: -t[1].height):
        if x + im.width + 2 > max_w:
            x = 0; y += rowh + 2; rowh = 0
        rects[k] = [x, y, im.width, im.height]
        x += im.width + 2; rowh = max(rowh, im.height)
    AH = y + rowh
    atlas = Image.new('RGBA', (max_w, AH), (0, 0, 0, 0))
    mask = Image.new('RGB', (max_w, AH), (0, 0, 0))
    for k, im, mk in items:
        atlas.paste(im, tuple(rects[k][:2]))
        mask.paste(mk, tuple(rects[k][:2]))
    # 투명 픽셀의 색을 가장자리 색으로 번져 두면 축소 샘플링 때 검은 테가 생기지 않는다
    A = np.asarray(atlas).copy()
    m = A[..., 3] > 8
    if m.any():
        A[..., :3] = bleed(A[..., :3], m)
    atlas = Image.fromarray(A, 'RGBA')
    pa = os.path.join(out_dir, f'atlas_{lv}.webp')
    pm = os.path.join(out_dir, f'mask_{lv}.webp')
    atlas.save(pa, 'WEBP', quality=88 if lv != 'lo' else 90, alpha_quality=92, method=6)
    # 재질 마스크는 부드러운 값이라 절반 해상도로 충분 (런타임이 아틀라스 크기로 늘려 쓴다)
    mask = mask.resize((max(1, mask.width // 2), max(1, mask.height // 2)), Image.LANCZOS)
    mask.save(pm, 'WEBP', lossless=True, quality=100, method=6)
    return rects, atlas.size, os.path.getsize(pa) + os.path.getsize(pm)


def build_hands(C, rig):
    """손 시트 → grip(쥔 주먹)·open(편 손) 부품. 초록 막대는 키잉 후 주먹 안쪽 부분만 메운다.
    rig.hands = {sheet, grip:{box,center,axis:[dx,dy],wrist,scale}, open:{box,wrist,tip,scale}}"""
    hcfg = rig.get('hands')
    if not hcfg:
        return None
    sp = os.path.join(SRC, hcfg['sheet'] + '.webp')
    if not os.path.exists(sp):
        print('  ! 손 시트 없음:', sp)
        return None
    rgb = rgb_of(sp)
    al = alpha_for(sp, os.path.join(SRC, hcfg['sheet'] + '_alpha.png')) > 127
    hue, s, v = hsv_arrays(rgb)
    g = hcfg.get('rodKey', {'hue': [70, 170], 'sat': 0.35, 'val': 0.3})
    rod = (hue >= g['hue'][0]) & (hue <= g['hue'][1]) & (s > g['sat']) & (v > g['val'])
    rod = cv2.dilate(rod.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    meta = {}
    Hs, Ws = al.shape
    YY, XX = np.mgrid[0:Hs, 0:Ws]
    rodish = (hue >= 55) & (hue <= 185) & (s > 0.12)          # 막대 하이라이트(옅은 초록)까지
    for kind in ('grip', 'open'):
        c = hcfg.get(kind)
        if not c:
            continue
        x0, y0, x1, y1 = c['box']
        m = np.zeros(al.shape, bool); m[y0:y1, x0:x1] = True
        band = np.zeros(al.shape, bool)
        if kind == 'grip' and c.get('rodHalf'):
            # 막대 = center 를 지나는 axis 방향 띠 (폭 ±rodHalf). 띠 밖 조각으로 주먹 윤곽(볼록 껍질)을 잡는다
            ax = np.array(c.get('axis', [0, 1]), float); ax /= np.linalg.norm(ax)
            cx, cy = c['center']
            perp = np.abs((XX - cx) * ax[1] - (YY - cy) * ax[0])
            band = perp < c['rodHalf']
        hand = al & m & ~rod & ~band
        lab, n = ndi.label(hand)
        if n > 1:
            sizes = ndi.sum(hand, lab, range(1, n + 1))
            keep = sizes >= max(2000, sizes.max() * 0.04)       # 막대에 잘린 엄지 등 큰 조각은 유지
            hand = np.isin(lab, np.nonzero(keep)[0] + 1)
        img = rgb.copy()
        if kind == 'grip':
            # 주먹 볼록 껍질 안: 막대처럼 보이는 픽셀만 장갑색으로 메우고(손가락은 유지), 껍질 밖의 막대는 버린다
            ys, xs = np.where(hand)
            hull = cv2.convexHull(np.stack([xs, ys], 1).astype(np.int32))
            hm = np.zeros(al.shape, np.uint8); cv2.fillConvexPoly(hm, hull, 1)
            erode_k = c.get('hullErode', 0)
            if erode_k:
                hm = cv2.erode(hm, np.ones((erode_k, erode_k), np.uint8))
            inhull = (hm > 0) & m & al
            rodlike = rodish | rod
            if c.get('rodClose'):
                # opt-in (hero7): 막대 하이라이트(흰 줄)처럼 초록에 둘러싸인 저채도 픽셀도 막대로 본다
                kk = int(c['rodClose'])
                rodlike = rodlike | (cv2.morphologyEx((rodlike & band).astype(np.uint8), cv2.MORPH_CLOSE,
                                                      cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kk, kk))) > 0)
            hand = hand | (inhull & band & ~rodlike & ~rod)       # 막대 앞을 지나는 손가락
            inside = inhull & ((band & rodlike) | rod)
            if inside.any():
                bb = bbox(inside | hand, 30, al.shape[1], al.shape[0])
                bx0, by0, bx1, by1 = bb
                sub = bleed(img, hand)[by0:by1, bx0:bx1].copy()
                hole = (inside[by0:by1, bx0:bx1]).astype(np.uint8) * 255
                fill = cv2.inpaint(cv2.cvtColor(sub, cv2.COLOR_RGB2BGR), hole, 9, cv2.INPAINT_TELEA)
                fill = cv2.cvtColor(fill, cv2.COLOR_BGR2RGB)
                img[by0:by1, bx0:bx1][inside[by0:by1, bx0:bx1]] = fill[inside[by0:by1, bx0:bx1]]
                hand = hand | inside
        sc = float(c.get('scale', 0.25))
        bx0, by0, bx1, by1 = bbox(hand, 4, al.shape[1], al.shape[0])
        col = bleed(img, hand)
        a = feather(hand, 1.5)
        rgba = np.dstack([col, (np.clip(a, 0, 1) * 255).astype(np.uint8)])[by0:by1, bx0:bx1]
        im = Image.fromarray(rgba, 'RGBA')
        im = im.resize((max(1, round(im.width * sc)), max(1, round(im.height * sc))), Image.LANCZOS)
        # 원화 좌표계로: 기준점(center 또는 wrist)을 J['hand'] 에 둔다
        ref = np.array(c['center'] if kind == 'grip' else c['wrist'], float)
        anchor = np.array(C.J['hand'] if kind == 'grip' else C.J['wrist'], float)  # 주먹 중심=손 관절, 편 손 손목=손목 관절
        x0p = anchor[0] + (bx0 - ref[0]) * sc
        y0p = anchor[1] + (by0 - ref[1]) * sc
        wrist = (np.array(c['wrist'], float) - ref) * sc + anchor
        name = kind
        C.parts[name] = dict(rgba=np.asarray(im).copy(), x0=float(x0p), y0=float(y0p), pivot=[float(anchor[0]), float(anchor[1])],
                             end=[float(wrist[0]), float(wrist[1])], src='hands')
        ent = dict(pivot=[float(anchor[0]), float(anchor[1])], wrist=[float(wrist[0]), float(wrist[1])])
        if kind == 'grip':
            ax = np.array(c.get('axis', [0, 1]), float); ax /= np.linalg.norm(ax)
            ent['axisAng'] = float(math.atan2(ax[1], ax[0]))
        else:
            tip = (np.array(c['tip'], float) - ref) * sc + anchor
            ent['tip'] = [float(tip[0]), float(tip[1])]
        meta[kind] = ent
    return meta


if __name__ == '__main__':
    main()
