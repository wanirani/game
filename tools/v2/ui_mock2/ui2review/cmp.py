#!/usr/bin/env python3
"""ui2review — clear.mjs 가 찍은 "더 맑은 유리" 판의 불투명도를 재고(clear_measure.json), 지금/더 맑게 비교 그림을 만든다.
   python3 tools/v2/ui_mock2/ui2review/cmp.py   (review.mjs · analyze.py · clear.mjs 다음에)"""
import json, numpy as np
from PIL import Image
d = '/tmp/claude-0/v2/ui2review'
dom = json.load(open(f'{d}/dom.json'))
def amap(pre):
    w = np.asarray(Image.open(f'{d}/{pre}_alpha_w.png').convert('RGB'), dtype=np.float32); k = np.asarray(Image.open(f'{d}/{pre}_alpha_k.png').convert('RGB'), dtype=np.float32)
    return np.clip(1 - (w - k).mean(axis=2) / 255, 0, 1)
res = {}
for name in ['uigem', 'uiink']:
    for dev in ['fold_open', 'phone2']:
        m = dom[f'{name}_{dev}']; s = m['dpr']
        a = amap(f'{name}_{dev}_clear'); H, W = a.shape; yy, xx = np.mgrid[0:H, 0:W]; p25 = []
        for b in m['rects']:
            if not b['id'].startswith('b-') or b['id'] in ('b-ult', 'b-lock', 'b-mount', 'b-s2', 'b-jump'): continue
            cx, cy, rad = (b['x'] + b['w'] / 2) * s, (b['y'] + b['h'] / 2) * s, min(b['w'], b['h']) / 2 * s
            p25.append(np.percentile(a[(xx - cx) ** 2 + (yy - cy) ** 2 <= (rad * .86) ** 2], 25))
        res[f'{name}_{dev}_clear'] = {'glass_p25': round(float(np.mean(p25)), 2), 'mean_alpha_pct': round(float(a.mean() * 100), 1)}
for dev in ['fold_open', 'phone2']:
    a = amap(f'r1glass_{dev}_base'); H, W = a.shape; c = a[int(H * .2):int(H * .8), int(W * .2):int(W * .8)]
    res[f'r1glass_{dev}'] = {'any_pct': round(float((a > .08).mean() * 100), 1), 'half_pct': round(float((a > .5).mean() * 100), 1), 'solid_pct': round(float((a > .85).mean() * 100), 1), 'mean_alpha_pct': round(float(a.mean() * 100), 1), 'centre_any_pct': round(float((c > .08).mean() * 100), 1)}
json.dump(res, open(f'{d}/clear_measure.json', 'w'), indent=1); print(res)
def crop(path, dev):
    im = Image.open(path).convert('RGB'); W, H = im.size
    return im.crop((int(W * .60), int(H * .52), W, H)) if dev == 'fold_open' else im.crop((int(W * .62), int(H * .34), W, H))
for dev in ['fold_open', 'phone2']:
    rows = []
    for bg in ['yard', 'street']:
        ims = [crop(f'{d}/uigem_{dev}_play_{bg}.png', dev), crop(f'{d}/uigem_{dev}_clear_{bg}.png', dev), crop(f'{d}/uiink_{dev}_play_{bg}.png', dev), crop(f'{d}/uiink_{dev}_clear_{bg}.png', dev)]
        w = sum(i.width for i in ims) + 30; r = Image.new('RGB', (w, ims[0].height), (20, 20, 20)); x = 0
        for i in ims: r.paste(i, (x, 0)); x += i.width + 10
        rows.append(r)
    s = Image.new('RGB', (rows[0].width, sum(r.height for r in rows) + 10), (20, 20, 20)); y = 0
    for r in rows: s.paste(r, (0, y)); y += r.height + 10
    f = 2520 / s.width; s.resize((2520, int(s.height * f)), Image.LANCZOS).save(f'{d}/clear_cmp_{dev}.png')
