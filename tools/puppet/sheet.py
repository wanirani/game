#!/usr/bin/env python3
"""검증 시트: 빌드 결과(assets/puppets/...)만 읽어 한 장으로 보여 준다 (원화는 읽지 않음)
  python3 tools/puppet/sheet.py [charId|classId 접두어] [-o 폴더]
행 1: ui 아틀라스의 부품들(초록 바탕) · 행 2: 같은 부품의 재질 마스크(빨강=갑옷 재질, 초록=장식) · 행 3: 턴테이블 8방향
확인할 것: 부품 가장자리에 배경색 테두리/구멍이 없는지, 마스크가 피부·머리카락·장식으로 새지 않는지, 턴테이블 방향 라벨이 맞는지."""
import argparse, glob, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.pup import OUT, DBG, ensure, load_json

ap = argparse.ArgumentParser()
ap.add_argument('only', nargs='?', default=None)
ap.add_argument('-o', '--out', default=os.path.join(DBG, 'sheets'))
a = ap.parse_args()
ensure(a.out)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
except Exception:
    font = ImageFont.load_default()
STEP_ORDER = ['90', '45', '0', '-45', '-90', '-135', '180', '135']
outs = []
for rp in sorted(glob.glob(os.path.join(OUT, '*', '*', 'rig.json'))):
    d = os.path.dirname(rp); cls = os.path.basename(d); cid = os.path.basename(os.path.dirname(d))
    if a.only and not (cls.startswith(a.only) or cid == a.only):
        continue
    rig = load_json(rp)
    L = rig['levels']['ui']
    atlas = Image.open(os.path.join(d, 'atlas_ui.webp')).convert('RGBA')
    mask = Image.open(os.path.join(d, 'mask_ui.webp')).convert('RGB').resize(atlas.size, Image.LANCZOS)
    W = 1900
    rows = []
    # 부품 + 마스크
    x = 10; h1 = 0; tiles = []
    for name, (rx, ry, rw, rh) in sorted(L['rects'].items(), key=lambda kv: -kv[1][3]):
        part = atlas.crop((rx, ry, rx + rw, ry + rh))
        mk = mask.crop((rx, ry, rx + rw, ry + rh))
        s = min(1.0, 300 / rh)
        part = part.resize((max(1, int(rw * s)), max(1, int(rh * s))), Image.LANCZOS)
        mk = mk.resize(part.size, Image.LANCZOS)
        tiles.append((name, part, mk))
    sheet = Image.new('RGB', (W, 1400), (22, 18, 26))
    dr = ImageDraw.Draw(sheet)
    dr.text((10, 6), f'{cid}/{cls}  v={rig.get("v")}  levels=' + ', '.join(f'{k}:{v["size"][0]}x{v["size"][1]}' for k, v in rig['levels'].items()), fill=(255, 220, 150), font=font)
    x = 10; y = 30; rowh = 0
    for name, part, mk in tiles:
        if x + part.width > W - 10:
            x = 10; y += rowh + 24; rowh = 0
        bg = Image.new('RGBA', part.size, (40, 150, 60, 255)); bg.alpha_composite(part)
        sheet.paste(bg.convert('RGB'), (x, y))
        # 마스크: 알파 안쪽만 표시 (R=갑옷, G=장식)
        m = np.asarray(mk).astype(np.float32) / 255
        al = np.asarray(part)[..., 3:4].astype(np.float32) / 255
        base = np.asarray(part.convert('RGB')).astype(np.float32) * 0.35
        vis = base + np.stack([m[..., 0] * 255, m[..., 1] * 255, m[..., 0] * 120], -1) * 0.8
        vis = vis * al + np.array([22, 18, 26]) * (1 - al)
        sheet.paste(Image.fromarray(np.clip(vis, 0, 255).astype(np.uint8)), (x, y + 330))
        dr.text((x, y + part.height + 2), name, fill=(230, 230, 230), font=font)
        x += part.width + 8; rowh = max(rowh, part.height)
    # 턴테이블
    T = rig.get('turn')
    if T and os.path.exists(os.path.join(d, 'turn.webp')):
        tv = Image.open(os.path.join(d, 'turn.webp')).convert('RGBA')
        x = 10; y = 1000
        for k in STEP_ORDER:
            st = T['steps'].get(k)
            if not st:
                continue
            v = T['views'][st['v']]
            im = tv.crop((v['x'], 0, v['x'] + v['w'], v['h']))
            if st['m']:
                im = im.transpose(Image.FLIP_LEFT_RIGHT)
            s = 360 / v['h']
            im = im.resize((int(im.width * s), 360), Image.LANCZOS)
            bg = Image.new('RGBA', im.size, (60, 50, 70, 255)); bg.alpha_composite(im)
            sheet.paste(bg.convert('RGB'), (x, y))
            dr.text((x, y - 18), f'yaw {k}° ← {st["v"]}{" (mirror)" if st["m"] else ""}', fill=(255, 220, 150), font=font)
            x += im.width + 14
    p = os.path.join(a.out, f'{cls}.jpg')
    sheet.save(p, quality=86)
    outs.append(p)
print('sheets:', *outs, sep='\n  ')
