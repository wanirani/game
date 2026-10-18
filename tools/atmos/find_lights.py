#!/usr/bin/env python3
# 「숨쉬는 원경」 (Stage 5 P2) — 원경 그림(assets/bg/*.webp)에서 빛나는 곳(불·촛불·창·달·마법진)을 찾아 src/data/atmos.js 를 쓴다.
#
#   python3 -I tools/atmos/find_lights.py [--sheet DIR] [--only s01_village,s11_chapel]
#
# 방법: 그림을 폭 252 px 로 줄여(세로는 비율대로) 밝기·채도·색상 문턱을 넘는 칸을 이어 붙인 덩어리(blob)를 찾는다.
#   - 따뜻한 빛(색상 0–55°, 붉은 끝 330–360°)  → flicker 1.0 (불·횃불·촛불: 일렁임)
#   - 그 밖의 색 빛(초록 수조·보라 마법진·청록 해파리) → flicker 0.35 (천천히 숨쉼)
#   - 채도가 낮은 흰 빛(달·창·하늘 틈)            → flicker 0.12 (거의 고정)
# 덩어리마다 중심 (u, v ∈ [0,1], 그림 기준), 반경 r (그림 높이 대비), 평균색(조금 밝게), flicker, feed(플레이 층을 비추는 광원으로
# world.lighting 에 넘길지: 따뜻한 빛 + 그림 아래 62 % 안) 을 낸다. 가까운 덩어리는 합치고, 그림마다 크기×밝기 순 최대 12 개.
# 그 위에 OVERRIDES (손으로 확인한 값: 빼거나 더하거나 바꿀 빛, 빛줄기, 안개 세기·색, 창문 빛깔) 를 덮어쓴다.
# fog.color 는 그림 아래쪽 띠(55–90 %)의 평균색을 밝힌 것, windowTint 는 그림의 가장 밝은 3 % 칸 평균색으로 만든 [유리 위, 유리 아래, 빛줄기].
# --sheet DIR: 그림마다 찾은 빛·빛줄기를 원으로 겹친 확인용 그림 (DIR/<id>.jpg, 손 확인용 — 저장소 밖에 둔다).
import sys, os, json, math, colorsys
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
BG_DIR = os.path.join(ROOT, 'assets', 'bg')
OUT = os.path.join(ROOT, 'src', 'data', 'atmos.js')
W_SMALL = 252
MAX_LIGHTS = 12

# ── 손 확인 값 (2026-10-18, P2 — 그림 30장을 겹침 그림으로 하나씩 보고 고침) ──
#  drop: [(u, v, 반경)] 이 원 안에 중심이 있는 자동 빛을 뺀다 · add: 빛 추가 · lights: 자동 대신 이 목록만
#  rays: 빛줄기 {u, v(꼭짓점), angle(라디안, 0 = 똑바로 아래, + = 오른쪽으로 기움), len(그림 높이 대비), w(폭, 그림 높이 대비), color, a}
#  fog: {near, far, color?} — near 는 앞 안개(인물 앞, ≤ 0.18), far 는 원경 안개 · windowTint: [위, 아래, 빛줄기] rgba 문자열
OVERRIDES = {}

def hexc(rgb):
    return '#%02x%02x%02x' % tuple(int(max(0, min(255, round(c)))) for c in rgb)

def boost(rgb, light=0.12, sat=1.15):
    r, g, b = [c / 255 for c in rgb]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = min(0.82, l + light); s = min(1.0, s * sat)
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return (r * 255, g * 255, b * 255)

def classify(rgb):
    r, g, b = [c / 255 for c in rgb]
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    deg = h * 360
    if s < 0.22:
        return 'white'
    if deg <= 55 or deg >= 330:
        return 'warm'
    return 'color'

FLICKER = {'warm': 1.0, 'color': 0.35, 'white': 0.12}

def detect(img):
    w, h = img.size
    hs = max(1, round(h * W_SMALL / w))
    sm = np.asarray(img.convert('RGB').resize((W_SMALL, hs), Image.LANCZOS)).astype(np.float32)
    R, G, B = sm[..., 0], sm[..., 1], sm[..., 2]
    L = 0.2126 * R + 0.7152 * G + 0.0722 * B
    mx = np.maximum(np.maximum(R, G), B); mn = np.minimum(np.minimum(R, G), B)
    S = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    # 빛 = 그림 전체 밝기 분포의 위쪽 꼬리: 97 백분위 이상이면서 절대 밝기 문턱, 또는 아주 진한 채도의 밝은 칸
    p97 = float(np.percentile(L, 97))
    thr = max(150.0, p97)
    mask = (L >= thr) | ((mx >= 200) & (S >= 0.55))
    # 덩어리 하나가 그림 폭을 가로지르는 불길(s01)일 수 있어, 연결 성분 대신 "빛 지도"의 봉우리를 찾는다:
    # 문턱을 넘은 칸의 밝기를 흐리게 편 지도에서 9×9 극대점 → 큰 순서로 고르되 이미 고른 빛과 그림 높이 9 % 안이면 버린다
    M = ndimage.gaussian_filter(np.where(mask, L, 0).astype(np.float32), 1.6)
    cover = ndimage.gaussian_filter(mask.astype(np.float32), 3.0)   # 둘레 빛 칸 비율 → 빛의 크기
    peaks = (M == ndimage.maximum_filter(M, size=9)) & (M > thr * 0.18)
    ys, xs = np.nonzero(peaks)
    cand = sorted(((float(M[y, x]) * (0.4 + float(cover[y, x])), x, y) for y, x in zip(ys, xs)), reverse=True)
    blobs = []
    for score, x, y in cand:
        u, v = (x + 0.5) / W_SMALL, (y + 0.5) / hs
        if any(math.hypot((u - q['u']) * W_SMALL / hs, v - q['v']) < 0.09 for q in blobs):
            continue
        # 둘레 반경 5칸 안의 빛 칸: 평균색·넓이
        y0, y1, x0, x1 = max(0, y - 5), min(hs, y + 6), max(0, x - 5), min(W_SMALL, x + 6)
        sub = mask[y0:y1, x0:x1]
        area = int(sub.sum())
        if area < 2:
            continue
        rgb = sm[y0:y1, x0:x1][sub].mean(axis=0)
        blobs.append({'u': u, 'v': v, 'core': math.sqrt(area / math.pi) / hs, 'area': area, 'rgb': rgb, 'lum': float(L[y0:y1, x0:x1][sub].mean()), 'score': score})
        if len(blobs) >= MAX_LIGHTS:
            break
    lights = []
    for q in blobs[:MAX_LIGHTS]:
        kind = classify(q['rgb'])
        r = min(0.22, max(0.035, q['core'] * 2.4))
        lights.append({
            'u': round(q['u'], 3), 'v': round(q['v'], 3), 'r': round(r, 3),
            'color': hexc(boost(q['rgb'])), 'flicker': FLICKER[kind],
            'feed': kind == 'warm' and q['v'] > 0.38,
        })
    # 안개 색: 아래쪽 띠 평균을 밝힘 · 창문 빛깔: 가장 밝은 3 %
    band = sm[int(hs * 0.55):int(hs * 0.9)].reshape(-1, 3).mean(axis=0)
    fogc = hexc(boost(band, 0.22, 0.9))
    top = sm[L >= p97].reshape(-1, 3).mean(axis=0) if (L >= p97).any() else np.array([160, 180, 255])
    tc = boost(top, 0.05, 1.1)
    rgba = lambda c, a, k=1.0: 'rgba(%d,%d,%d,%s)' % (round(c[0] * k), round(c[1] * k), round(c[2] * k), a)
    tint = [rgba(tc, 0.5), rgba(tc, 0.25, 0.4), rgba(tc, 0.12)]
    avg = sm.reshape(-1, 3).mean(axis=0)
    return lights, fogc, tint, hexc(avg)

def apply_overrides(key, lights, entry):
    ov = OVERRIDES.get(key, {})
    if 'lights' in ov:
        lights = [dict(l) for l in ov['lights']]
    else:
        for (du, dv, dr) in ov.get('drop', []):
            lights = [l for l in lights if math.hypot(l['u'] - du, l['v'] - dv) > dr]
        lights = lights + [dict(l) for l in ov.get('add', [])]
    for l in lights:
        l.setdefault('flicker', 1.0); l.setdefault('feed', False)
    entry['lights'] = lights
    if 'rays' in ov: entry['rays'] = ov['rays']
    if 'fog' in ov: entry['fog'] = {**entry['fog'], **ov['fog']}
    if 'windowTint' in ov: entry['windowTint'] = ov['windowTint']
    return entry

def sheet(path, img, entry, out):
    w, h = img.size
    k = 1260 / w
    im = img.convert('RGB').resize((1260, round(h * k)))
    d = ImageDraw.Draw(im)
    H = im.height
    for i, l in enumerate(entry['lights']):
        x, y, r = l['u'] * 1260, l['v'] * H, l['r'] * H
        col = l['color']
        d.ellipse([x - r, y - r, x + r, y + r], outline=col, width=2)
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=('#ffffff' if l.get('feed') else '#000000'), outline=col)
        d.text((x + 5, y - 12), '%d f%.2g%s' % (i, l['flicker'], ' F' if l.get('feed') else ''), fill='#ffff00')
    ry = entry.get('rays')
    if ry:
        x, y = ry['u'] * 1260, ry['v'] * H
        L = ry['len'] * H
        a = ry.get('angle', 0)
        ex, ey = x + math.sin(a) * L, y + math.cos(a) * L
        d.line([x, y, ex, ey], fill='#00ffff', width=3)
        d.text((x + 6, y), 'ray', fill='#00ffff')
    d.rectangle([0, 0, 520, 16], fill='#000000')
    d.text((4, 2), '%s fog near %.2f far %.2f %s  tint %s' % (os.path.basename(path), entry['fog']['near'], entry['fog']['far'], entry['fog']['color'], entry['windowTint'][0]), fill='#ffffff')
    im.save(os.path.join(out, os.path.splitext(os.path.basename(path))[0] + '.jpg'), quality=84)

def fmt_entry(key, e):
    def lt(l):
        s = '{ u: %s, v: %s, r: %s, color: %s, flicker: %s' % (l['u'], l['v'], l['r'], json.dumps(l['color']), l['flicker'])
        if l.get('feed'): s += ', feed: true'
        return s + ' }'
    lines = ['  %s: {' % json.dumps(key)]
    if e['lights']:
        lines.append('    lights: [')
        for l in e['lights']:
            lines.append('      %s,' % lt(l))
        lines.append('    ],')
    else:
        lines.append('    lights: [],')
    if e.get('rays'):
        r = e['rays']
        lines.append('    rays: { from: %s, u: %s, v: %s, angle: %s, len: %s, w: %s, color: %s, a: %s },' % (
            json.dumps(r.get('from', 'top')), r['u'], r['v'], r.get('angle', 0), r['len'], r['w'], json.dumps(r['color']), r['a']))
    else:
        lines.append('    rays: null,')
    f = e['fog']
    lines.append('    fog: { near: %s, far: %s, color: %s },' % (f['near'], f['far'], json.dumps(f['color'])))
    lines.append('    windowTint: [%s],' % ', '.join(json.dumps(t) for t in e['windowTint']))
    lines.append('    avg: %s,' % json.dumps(e['avg']))
    lines.append('  },')
    return '\n'.join(lines)

def main():
    args = sys.argv[1:]
    sheet_dir = args[args.index('--sheet') + 1] if '--sheet' in args else None
    only = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None
    if sheet_dir: os.makedirs(sheet_dir, exist_ok=True)
    files = sorted(f for f in os.listdir(BG_DIR) if f.endswith('.webp'))
    entries = []
    for f in files:
        name = os.path.splitext(f)[0]
        key = 'bg/' + name
        img = Image.open(os.path.join(BG_DIR, f))
        lights, fogc, tint, avg = detect(img)
        entry = {'lights': lights, 'rays': None, 'fog': {'near': 0.1, 'far': 0.16, 'color': fogc}, 'windowTint': tint, 'avg': avg}
        entry = apply_overrides(key, lights, entry)
        for l in entry['lights']:
            assert 0 <= l['u'] <= 1 and 0 <= l['v'] <= 1, (key, l)
        assert entry['fog']['near'] <= 0.18, key
        entries.append((key, entry))
        if sheet_dir and (only is None or name in only):
            sheet(f, img, entry, sheet_dir)
    head = [
        '// 「숨쉬는 원경」 (Stage 5 P2): 원경 그림마다 빛나는 곳·빛줄기·안개·창문 빛깔. src/render/atmos.js 가 읽는다.',
        '// tools/atmos/find_lights.py 가 assets/bg/*.webp 에서 만든다 (손 확인 값은 그 스크립트의 OVERRIDES) — 이 파일을 손으로 고치지 말고 스크립트를 다시 돌린다.',
        '// 키 = 에셋 키 (stage.bg). 값:',
        '//   lights[{u, v(그림 기준 0–1), r(그림 높이 대비 반경), color, flicker(0 고정 – 1 불꽃 일렁임), feed?(플레이 층을 비추는 광원으로 world.lighting 에 넘김)}]',
        '//   rays {from, u, v(꼭짓점), angle(라디안, 0 = 아래), len, w(그림 높이 대비), color, a} | null',
        '//   fog {near(인물 앞 안개 알파, ≤ 0.18), far(원경 안개 알파), color} · windowTint [유리 위, 유리 아래, 빛줄기] (render/tiles.js 창문 대체 빛깔) · avg(그림 평균색)',
        'export const ATMOS = {',
    ]
    body = [fmt_entry(k, e) for k, e in entries]
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(head + body + ['};', '']))
    print('wrote %s (%d entries)' % (os.path.relpath(OUT, ROOT), len(entries)))
    for k, e in entries:
        print('  %-24s lights %2d feed %d rays %s' % (k, len(e['lights']), sum(1 for l in e['lights'] if l.get('feed')), 'y' if e.get('rays') else '-'))

if __name__ == '__main__':
    main()
