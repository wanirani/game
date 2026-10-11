#!/usr/bin/env python3
"""
16방향 턴테이블 시트의 '몸 안 구멍' 메우기 (TURNMOUNT 검증 수정).

클링 입력 앞모습(회색 바탕 합성)에 원화 알파 구멍이 비쳐 회색 얼룩이 생겼고, 영상도 그 회색을 그대로 그렸다
(은빛 갑옷 가슴판·흰 다리 등). turn16_build.py 의 배경 제거는 배경색과 같은 그 얼룩을 투명하게 잘라 내서,
메뉴의 어두운 바탕이 갑옷 한가운데로 비쳤다 (bran_guardian / bran_paladin 가슴, sera_saint · isolde_valkyrie 등).

여기서는 실린 시트(turn16_ui / turn16_lo)의 칸마다 **실루엣에 완전히 갇힌** 투명 구멍만 골라 주변 색으로 인페인트하고
불투명하게 만든다 (몸 바깥과 이어진 틈 — 팔과 몸통 사이, 다리 사이 — 은 건드리지 않는다). 칸 배치·축·목록 각도는 그대로,
목록(turn16.json)의 ui/lo v·kb·q 만 고친다. 재질 마스크(turn16_mask)는 그대로 (메운 곳은 장비 재칠 대상이 아니다).

  python3 tools/puppet/turn16_fill_holes.py [cid/cls ...] [--dry DIR] [--min 6]
"""
import argparse, os, sys, io, json, hashlib
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from turn16_build import MAN, OUT, prep, enc, man_lock  # noqa: E402
from lib.pup import load_json  # noqa: E402


def fill_cells(im, views, kx, ky, min_px):
    A = np.asarray(im.convert('RGBA')).copy()
    filled_px = 0
    for v in views:
        if v.get('m'):
            continue                                   # 거울 칸은 원본 칸과 같은 화소
        x0, y0 = int(v['x'] * kx), int(v['y'] * ky)
        x1, y1 = min(A.shape[1], int(np.ceil((v['x'] + v['w']) * kx))), min(A.shape[0], int(np.ceil((v['y'] + v['h']) * ky)))
        c = A[y0:y1, x0:x1]
        solid = c[..., 3] > 128
        holes = ndi.binary_fill_holes(solid) & ~solid
        lab, n = ndi.label(holes)
        if not n:
            continue
        sz = ndi.sum(holes, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool); keep[1:] = sz >= min_px
        m = keep[lab]
        if not m.any():
            continue
        rgb = np.ascontiguousarray(c[..., :3][..., ::-1])
        # 반투명 가장자리 화소도 칠 대상에 넣어 이음매가 남지 않게 (구멍 둘레 1 px)
        mm = ndi.binary_dilation(m, iterations=1) & ~(c[..., 3] > 250)
        out = cv2.inpaint(rgb, (mm * 255).astype(np.uint8), 3, cv2.INPAINT_TELEA)[..., ::-1]
        c[mm, :3] = out[mm]
        c[mm, 3] = 255
        filled_px += int(m.sum())
    return Image.fromarray(A, 'RGBA'), filled_px


def encode(im, qs, aq, max_bytes):
    data, qq = None, None
    for q in qs:
        b = enc(im, q, aq)
        data, qq = b, q
        if len(b) <= max_bytes:
            break
    return data, qq


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('looks', nargs='*', help='cid/cls (없으면 목록의 모든 외형)')
    ap.add_argument('--dry', default='', help='쓰지 않고 이 폴더에 전/후 그림만')
    ap.add_argument('--min', type=int, default=6, help='ui 시트에서 메울 구멍 최소 화소 수 (lo 는 절반)')
    ap.add_argument('--max-kb', type=float, default=60)
    ap.add_argument('--max-lo-kb', type=float, default=22)
    a = ap.parse_args()
    man = load_json(MAN)
    keys = a.looks or sorted(man['looks'])
    results = {}
    for key in keys:
        e = man['looks'][key]
        d = os.path.join(OUT, key)
        ui = Image.open(os.path.join(d, 'turn16_ui.webp')).convert('RGBA')
        lo = Image.open(os.path.join(d, 'turn16_lo.webp')).convert('RGBA')
        ui2, n_ui = fill_cells(ui, e['views'], 1, 1, a.min)
        lo2, n_lo = fill_cells(lo, e['views'], e['lo']['kx'], e['lo']['ky'], max(3, a.min // 2))
        print(f'[{key}] filled ui {n_ui} px · lo {n_lo} px')
        if a.dry:
            os.makedirs(a.dry, exist_ok=True)
            for nm, im in (('before', ui), ('after', ui2)):
                bg = Image.new('RGBA', im.size, (20, 20, 28, 255)); bg.alpha_composite(im)
                bg.convert('RGB').save(os.path.join(a.dry, f'{key.replace("/", "_")}_{nm}.jpg'), quality=85)
            continue
        if not n_ui and not n_lo:
            continue
        upd = {}
        if n_ui:
            data, q = encode(prep(ui2), (78, 72, 66, 60, 55, 50), 60, a.max_kb * 1024)
            with open(os.path.join(d, 'turn16_ui.webp'), 'wb') as fh:
                fh.write(data)
            upd['ui'] = dict(v=hashlib.sha1(data).hexdigest()[:10], kb=round(len(data) / 1024, 1), q=q)
        if n_lo:
            data, q = encode(prep(lo2), (76, 68, 60, 52, 46), 55, a.max_lo_kb * 1024)
            with open(os.path.join(d, 'turn16_lo.webp'), 'wb') as fh:
                fh.write(data)
            upd['lo'] = dict(v=hashlib.sha1(data).hexdigest()[:10], kb=round(len(data) / 1024, 1), q=q)
        results[key] = upd
    if a.dry or not results:
        return
    with man_lock():
        m2 = load_json(MAN)
        for key, upd in results.items():
            for tier, u in upd.items():
                m2['looks'][key][tier].update(u)
            m2['looks'][key]['holes_filled'] = 1
        tmp = MAN + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as fh:
            json.dump(m2, fh, ensure_ascii=False, separators=(',', ':'))
        os.replace(tmp, MAN)
    print(f'updated {len(results)} looks in {MAN}')


if __name__ == '__main__':
    main()
