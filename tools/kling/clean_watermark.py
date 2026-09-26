#!/usr/bin/env python3
"""클링 이미지 후처리: 우하단 'KlingAI' 워터마크와 배경 하단의 빈 단색 띠를 잘라낸다. (제자리 덮어쓰기, 재실행 안전: tools/kling/cleaned.json 기록)
배경(bg): 하단 단색 띠 제거 후 최소 하단 7% 절단. 초상화(portraits): 하단 5.5% 절단."""
import json, os
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
done_p = os.path.join(HERE, 'cleaned.json')
done = set(json.load(open(done_p))) if os.path.exists(done_p) else set()

def flat_band(a):
    h, w, _ = a.shape
    lum = a[:, : int(w * 0.8)].mean(2)
    n = 0
    for y in range(h - 1, int(h * 0.4), -1):
        row = lum[y]
        if row.std() < 7 and row.mean() < 70: n += 1
        else:
            # 장식선 1~3줄은 허용
            if n > 20 and y > 3 and all(lum[y - k].std() < 7 for k in range(2, 5)): n += 1; continue
            break
    return n

for folder, kind in (('assets/bg', 'bg'), ('assets/portraits', 'portrait')):
    d = os.path.join(REPO, folder)
    for f in sorted(os.listdir(d)):
        if not f.endswith('.webp'): continue
        key = f'{folder}/{f}'
        if key in done: continue
        p = os.path.join(d, f)
        im = Image.open(p).convert('RGB'); w, h = im.size
        if kind == 'bg':
            band = flat_band(np.asarray(im).astype(float))
            cut = max(band + 4, int(h * 0.07))
            im = im.crop((0, 0, w, h - cut))
            q = 80
        else:
            cut = int(h * 0.055)
            im = im.crop((0, 0, w, h - cut))
            q = 82
        im.save(p, 'WEBP', quality=q, method=6)
        done.add(key)
        print(f'{key}: {w}x{h} -> {im.size[0]}x{im.size[1]} (cut {cut})')
json.dump(sorted(done), open(done_p, 'w'), indent=0)
