#!/usr/bin/env python3
"""HUD 그림 자르기 (hud_mobile §4) — Kling 3×3 묶음 그림 → assets/icons/skills/<id>.webp (96 px) + 48/<id>.webp (48 px),
HUD 테(9-slice·원형 테) → assets/ui/hud/<name>.webp.
HUD-REDO (hudredo): 큰 아이콘 128 px (예전 96 — 폴드 DPR 2–2.6 에서 버튼 아이콘이 100–131 기기 px), 테는 2배 (ring_attack 384 등).
사용: python3 tools/hud/cut_sheets.py <raw 폴더>   (raw 폴더에 sheet_<key>_v1.png; 칸 이름은 tools/hud/sheets.json)
아이콘은 원형 알파(가장자리 2 px 부드럽게)로 굽는다 → 런타임에 원 클립 없이 drawImage 한 번.
테(frames)는 검은 바탕을 밝기 키로 투명하게 (금속·보석은 남고 안쪽 검은 칸은 비운다)."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/g5/hud_art/raw'
SHEETS = json.load(open(os.path.join(ROOT, 'tools/hud/sheets.json')))
OUT_ICON = os.path.join(ROOT, 'assets/icons/skills')
OUT_UI = os.path.join(ROOT, 'assets/ui/hud')
# 프레임 묶음: 칸 번호(0–8) → (이름, 크기 px)
FRAMES = {0: ('ring_map', 320), 1: ('stick_base', 384), 2: ('ring_attack', 384), 3: ('ring_small', 256),
          4: ('frame_ult', 320), 5: ('frame_slot', 224), 6: ('ring_lock', 256), 8: ('gem', 96)}
ICON_BIG = 128   # assets/icons/skills/<id>.webp (파일 이름은 그대로 — hud.js iconImg 가 지름으로 고른다)
# ui 묶음 중 쓰지 않는 칸 (dash 는 말 그림으로 잘못 나왔다 → 벡터 문양을 쓴다)
SKIP = {'ui_dash'}

def cells(im):
    W, H = im.size
    for i in range(9):
        r, c = divmod(i, 3)
        x0, y0, x1, y1 = c * W / 3, r * H / 3, (c + 1) * W / 3, (r + 1) * H / 3
        yield i, (x0, y0, x1, y1)

def circle_mask(n, inset=0.035):
    big = n * 4
    m = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(m)
    p = big * inset
    d.ellipse((p, p, big - p, big - p), fill=255)
    return m.resize((n, n), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))

def icon(im, box, out_id):
    x0, y0, x1, y1 = box
    w = x1 - x0
    pad = w * 0.035
    crop = im.crop((round(x0 + pad), round(y0 + pad), round(x1 - pad), round(y1 - pad))).convert('RGB')
    for n, sub in ((ICON_BIG, ''), (48, '48')):
        t = crop.resize((n, n), Image.LANCZOS).convert('RGBA')
        t.putalpha(circle_mask(n))
        d = os.path.join(OUT_ICON, sub)
        os.makedirs(d, exist_ok=True)
        t.save(os.path.join(d, out_id + '.webp'), 'WEBP', quality=78 if n > 48 else 80, method=6)

def frame(im, box, name, n):
    x0, y0, x1, y1 = box
    w = x1 - x0
    pad = w * 0.02
    crop = im.crop((round(x0 + pad), round(y0 + pad), round(x1 - pad), round(y1 - pad))).convert('RGB').resize((n, n), Image.LANCZOS)
    px = crop.load()
    a = Image.new('L', (n, n))
    ap = a.load()
    for y in range(n):
        for x in range(n):
            r, g, b = px[x, y]
            v = max(r, g, b)
            t = min(1.0, max(0.0, (v - 18) / 42.0))
            ap[x, y] = int(255 * t * t * (3 - 2 * t))
    rgba = crop.convert('RGBA')
    rgba.putalpha(a)
    os.makedirs(OUT_UI, exist_ok=True)
    rgba.save(os.path.join(OUT_UI, name + '.webp'), 'WEBP', quality=82, method=6)

def main():
    n_icon = n_frame = 0
    for key, names in SHEETS.items():
        f = os.path.join(RAW, f'sheet_{key}_v1.png')
        if not os.path.exists(f):
            print('missing', f); continue
        im = Image.open(f)
        for i, box in cells(im):
            if key == 'frames':
                continue
            nid = names[i][0]
            if nid in SKIP: continue
            icon(im, box, nid); n_icon += 1
    f = os.path.join(RAW, 'sheet_frames_v1.png')
    if os.path.exists(f):
        im = Image.open(f)
        for i, box in cells(im):
            if i in FRAMES:
                frame(im, box, *FRAMES[i]); n_frame += 1
    print('icons', n_icon, 'frames', n_frame)

if __name__ == '__main__':
    main()
