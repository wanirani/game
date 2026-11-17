#!/usr/bin/env python3
"""ui2review — review.mjs 가 찍은 흰 바탕 / 검은 바탕 두 장으로 HUD 의 불투명도 지도를 만들고 가림 · 투명도를 잰다.
   python3 tools/v2/ui_mock2/ui2review/analyze.py [dir=/tmp/claude-0/v2/ui2review]"""
import json, sys
import numpy as np
from PIL import Image
d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/v2/ui2review'
dom = json.load(open(f'{d}/dom.json'))
out = {}
for key, m in dom.items():
    w = np.asarray(Image.open(f'{d}/{key}_alpha_w.png').convert('RGB'), dtype=np.float32)
    k = np.asarray(Image.open(f'{d}/{key}_alpha_k.png').convert('RGB'), dtype=np.float32)
    a = np.clip(1 - (w - k).mean(axis=2) / 255, 0, 1)          # HUD 불투명도 (0 = 장면 그대로, 1 = 장면 안 보임)
    H, W = a.shape; s = m['dpr']
    Image.fromarray((a * 255).astype(np.uint8)).save(f'{d}/{key}_alphamap.png')
    cy0, cy1, cx0, cx1 = int(H * .2), int(H * .8), int(W * .2), int(W * .8)
    c = a[cy0:cy1, cx0:cx1]
    r = {'any_pct': round(float((a > .08).mean() * 100), 1), 'half_pct': round(float((a > .5).mean() * 100), 1), 'solid_pct': round(float((a > .85).mean() * 100), 1),
         'mean_alpha_pct': round(float(a.mean() * 100), 1),
         'centre_any_pct': round(float((c > .08).mean() * 100), 1), 'centre_half_pct': round(float((c > .5).mean() * 100), 1)}
    yy, xx = np.mgrid[0:H, 0:W]
    btn = {}; sizes = {}; box = 0
    for b in m['rects']:
        cx, cy, rad = (b['x'] + b['w'] / 2) * s, (b['y'] + b['h'] / 2) * s, min(b['w'], b['h']) / 2 * s
        box += b['w'] * b['h']
        sizes[b['id']] = round(min(b['w'], b['h']), 1)
        if b['id'] == 'stick' or not b['id'].startswith(('b-', 's-')):
            pass
        disc = (xx - cx) ** 2 + (yy - cy) ** 2 <= (rad * .86) ** 2
        v = a[disc]
        # 원판 안에서 그림·테가 아닌 "유리" 부분의 불투명도 = 아래쪽 40 % 분위(그림은 거의 1 이라 위쪽에 몰린다)
        btn[b['id']] = {'mean': round(float(v.mean()), 2), 'glass_p25': round(float(np.percentile(v, 25)), 2), 'see_through_pct': round(float((v < .7).mean() * 100))}
    ready = [v['glass_p25'] for k2, v in btn.items() if k2.startswith('b-') and k2 not in ('b-ult', 'b-lock', 'b-mount', 'b-s2', 'b-jump')]   # 준비된 보통 버튼만
    r['glass_avg'] = round(float(np.mean(ready)), 2)
    r['sizes'] = sizes; r['btn_alpha'] = btn; r['min_touch'] = min(sizes.values()); r['box_pct'] = round(box / (m['W'] * m['H']) * 100, 1)
    r['min_gap'] = m['minGap']; r['gap_who'] = m['gapWho']; r['hit_fail'] = [b['id'] for b in m['rects'] if not b['hitOk']]; r['errors'] = m['errors']
    out[key] = r
    acts = [v for k2, v in btn.items() if k2.startswith('b-')]
    print(key, {k2: v for k2, v in r.items() if k2 not in ('sizes', 'btn_alpha')})
    print('   sizes', sizes)
    print('   action glass p25 avg %.2f  mean avg %.2f  see-through avg %d%%' % (np.mean([v['glass_p25'] for v in acts]), np.mean([v['mean'] for v in acts]), np.mean([v['see_through_pct'] for v in acts])))
    print('   per-btn', {k2: (v['glass_p25'], v['see_through_pct']) for k2, v in btn.items()})
json.dump(out, open(f'{d}/review_measure.json', 'w'), indent=1)
