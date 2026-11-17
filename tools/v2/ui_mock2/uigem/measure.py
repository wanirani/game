#!/usr/bin/env python3
"""uigem 잰 값: ① 세 배경 위 아이콘·글자 대비(실제 캡처에서, 아이콘·글자를 숨긴 캡처와 비교) ② 전투 화면에서 인터페이스가 실제로 칠해진 넓이.
  python3 tools/v2/ui_mock2/uigem/measure.py [dir=/tmp/claude-0/v2/uigem]"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
D = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/v2/uigem'
def lin(a):
    a = a / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
def lum(im):
    l = lin(np.asarray(im.convert('RGB'), np.float64))
    return 0.2126 * l[..., 0] + 0.7152 * l[..., 1] + 0.0722 * l[..., 2]
out = {'contrast': {}, 'cover': {}}
full, bare = Image.open(f'{D}/strip_backgrounds.png'), Image.open(f'{D}/_strip_noink.png')
Lf, Lb = lum(full), lum(bare)
diff = np.abs(np.asarray(full.convert('RGB'), np.int32) - np.asarray(bare.convert('RGB'), np.int32)).max(-1)
R = json.load(open(f'{D}/_strip_rects.json')); k = R['dpr']
print('대비 = (밝은 쪽 휘도+0.05)/(어두운 쪽+0.05), WCAG 식. 그림·글자의 상아색 픽셀 기준')
seen = set()
for r in R['rects']:
    key = f"{r['bg']}/{r['k']}"
    if key in seen or r['k'] in ('s1', 's2', 'jump', 'mount', 'lock', 'bag'): continue
    seen.add(key)
    x0, y0 = int((r['x'] - R['ox']) * k), int((r['y'] - R['oy']) * k); x1, y1 = int(x0 + r['w'] * k), int(y0 + r['h'] * k)
    f, b, d = Lf[y0:y1, x0:x1], Lb[y0:y1, x0:x1], diff[y0:y1, x0:x1]
    m = (d > 28) & (f > b) & (f > 0.25)   # 뒤보다 밝아진 픽셀 = 상아 그림·글자 (짙은 윤곽·그림자·붉은 보석은 뺀다)
    if m.sum() < 30: continue
    ring = ndi.binary_dilation(m, iterations=7) & ~ndi.binary_dilation(m, iterations=2)   # 그림 바로 바깥 0.7–2.3 CSS px: 눈이 실제로 맞대어 보는 곳 (윤곽·그늘·유리 포함)
    ce = (f[m].mean() + 0.05) / (f[ring].mean() + 0.05)
    cg = (f[m].mean() + 0.05) / (b[m].mean() + 0.05)
    out['contrast'][key] = {'edge': round(float(ce), 2), 'vs_glass_only': round(float(cg), 2), 'ink_lum': round(float(f[m].mean()), 3), 'surround_lum': round(float(f[ring].mean()), 3), 'through_glass_lum': round(float(b[m].mean()), 3), 'raw_bg_lum': None}
    print(f"  {key:16s} 맞닿은 둘레 대비 {ce:5.2f}   유리만(그늘 빼고) {cg:5.2f}   · 그림 {f[m].mean():.2f} 둘레 {f[ring].mean():.2f} 유리 너머 {b[m].mean():.2f}")
print('전투 화면에서 인터페이스가 칠해진 넓이 (HUD 를 숨긴 캡처와 달라진 픽셀)')
for dev in ['fold_open', 'phone2']:
    for bg in ['', '_alley', '_street']:
        try: a, b = Image.open(f'{D}/{dev}_play{bg}.png').convert('RGB'), Image.open(f'{D}/_{dev}_play{bg}__nohud.png').convert('RGB')
        except FileNotFoundError: continue
        d = np.abs(np.asarray(a, np.int32) - np.asarray(b, np.int32)).max(-1)
        H, W = d.shape; cy0, cy1, cx0, cx1 = int(H * .2), int(H * .8), int(W * .2), int(W * .8)
        res = {'painted_pct': round(float((d > 14).mean() * 100), 1), 'strong_pct': round(float((d > 60).mean() * 100), 1), 'centre_painted_pct': round(float((d[cy0:cy1, cx0:cx1] > 14).mean() * 100), 1)}
        out['cover'][f'{dev}_play{bg}'] = res
        print(f"  {dev}_play{bg}: 칠해진 넓이 {res['painted_pct']}% (뚜렷하게 {res['strong_pct']}%) · 가운데 60% 영역 {res['centre_painted_pct']}%")
json.dump(out, open(f'{D}/measure_contrast_cover.json', 'w'), ensure_ascii=False, indent=1)
