#!/usr/bin/env python3
"""각성 컷인 일러스트 후처리 (docs/specs/feel.md 6.6, WP7).

Kling `kling-image-v3_0_omni` image_to_image (21:9, identity = assets/portraits/<hero>.webp) 결과물을
assets/cg/cutin_<hero>.webp (1600x637, WebP q82 m6, 250 KB 이하)로 만든다.

Steps
 1. download: tools/kling/cutin_manifest.json 의 선택된 항목(file 이 있는 항목)의 `url` 을 `curl -sSL` 로
    --raw-dir 에 받는다 (이미 있으면 건너뜀. Kling URL 은 24 시간 뒤 만료되므로 원본 PNG 를 보관할 것).
 2. retouch: 매니페스트의 `retouch` 목록 (가짜 글자처럼 보이는 잔무늬만 국소 제거, 아래 설명).
 3. crop: 우하단 'KlingAI 3.0 Omni' 워터마크는 원본 높이의 93.6 % 지점부터 시작하므로 하단 8 % 이상을 항상
    잘라낸다 (spec 의 7 % 보다 여유를 둠). 그다음 원본에서 측정한 얼굴 좌표(매니페스트 raw_face)를 기준으로
    1600:637 비율의 창을 고른다. 창은 가능한 한 크게(확대 최소) 잡되, 결과 이미지에서 얼굴 앵커가
    fx ∈ [0.58, 0.66], fy ∈ [0.40, 0.58] 에 오도록 한다. 이 범위는 feel.md 6.3 의 띠 배치
    (일러스트 폭 1.15·vw, 얼굴 앵커를 (0.66·vw, 0.47·vh) 에 둠, −7° 띠 H = 216, vw 960..1280,
    −4 % 패럴랙스 드리프트)에서 띠 전체가 일러스트로 덮이는 조건이다:
      왼쪽 끝:  0.66 − 1.15·fx ≤ 0                 → fx ≥ 0.574
      오른쪽 끝: 0.62 + 1.15·(1 − fx) ≥ 1          → fx ≤ 0.670
      위/아래:   vw = 960 에서 띠 상단(오른쪽 끝) 86 px, 하단(왼쪽 끝) 422 px → fy ∈ [0.382, 0.618]
 4. resize: 1600 px 폭 (1600x637), LANCZOS.
 5. save: WebP quality 82, method 6. 250 KB 를 넘으면 품질을 2 씩 낮춘다 (최저 70).
 6. check: 우하단 12 % x 8 % 영역의 평균 휘도 < 0.35, 글자 같은 고대비 에지가 없는지 확인 (경고만 출력).
    그다음 Read 로 파일을 직접 열어 워터마크 없음 / 얼굴 오른쪽 / 눈 선명 / 초상화와 동일 인물인지 확인.
 7. anchors: 최종 이미지 기준 face / eye (0..1) 를 tools/kling/cutin_anchors.json 에 기록한다
    (src/data/awaken.js 의 AWAKEN[id].face / .eye 에 그대로 옮기면 된다).

Usage
  python3 tools/kling/cutin_process.py [--raw-dir DIR] [--only kael,sera] [--preview DIR]
  --preview DIR : 6.3 띠 배치를 흉내 낸 확인용 PNG (vw 960/1280, 드리프트 0/−4 %) 를 DIR 에 저장.
"""
import argparse, json, math, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
MANIFEST = os.path.join(HERE, 'cutin_manifest.json')
ANCHORS = os.path.join(HERE, 'cutin_anchors.json')
OUT_DIR = os.path.join(REPO, 'assets', 'cg')

OUT_W, OUT_H = 1600, 637
ASPECT = OUT_W / OUT_H
WM_CUT = 0.08            # 하단 최소 절단 비율 (워터마크 상단 ≈ 0.936)
FX_RANGE, FX_PREF = (0.58, 0.66), 0.62
FY_RANGE, FY_PREF = (0.40, 0.58), 0.46
QUALITY, Q_MIN, MAX_BYTES = 82, 70, 250 * 1024

HEROES = ['kael', 'sera', 'victor', 'bran', 'lia', 'azel']
# 선택된 생성물마다 cutin_manifest.json 에 다음 값이 들어 있다 (원본 Kling 출력 3104x1312 기준 0..1 좌표):
#   raw_face : 얼굴 중심 (코 부근)            raw_eye : 눈 반짝임을 넣을 눈 (보이는 쪽/밝은 쪽)
#   retouch  : 글자처럼 보이는 잔무늬 제거 목록 (선택)
#     ["cloth_glyphs", [x0, y0, x1, y1]]           붉은 천 위의 흰 글자 모양 무늬를 인페인트
#     ["smooth_ellipse", [cx, cy], [rx, ry], k]      매끈한 금속판의 각인(가짜 글자)을 메디안으로 지움
# 좌표는 원본을 Read 로 열고 0.02 격자를 겹쳐 측정했다.
# feel.md 6.4 / 6.5 (미리보기 전용)
COLORS = {
    'kael': ('#fff2b0', '#2a0a0e'), 'sera': ('#fff8d0', '#1c2440'), 'victor': ('#ffd070', '#7a1a1a'),
    'bran': ('#ffb060', '#2a3a6a'), 'lia': ('#ff4a6a', '#141018'), 'azel': ('#ff2a4a', '#141018'),
}


def load_manifest():
    with open(MANIFEST, encoding='utf-8') as f:
        return json.load(f)


def selected_entries(man):
    """hero -> manifest entry of the generation used for assets/cg/cutin_<hero>.webp"""
    sel = {}
    for key, e in man.items():
        if e.get('group') == 'cutin' and e.get('file'):
            hero = os.path.basename(e['file']).split('.')[0].replace('cutin_', '')
            sel[hero] = e
    return sel


def download(entry, raw_path):
    if os.path.exists(raw_path):
        return True
    url = entry.get('url')
    if not url:
        print(f'  ! no url for {raw_path}; put the raw Kling PNG there manually', file=sys.stderr)
        return False
    subprocess.run(['curl', '-sSL', url, '-o', raw_path], check=True)
    try:
        Image.open(raw_path).verify()
    except Exception:
        os.remove(raw_path)
        print(f'  ! download failed or expired url: {raw_path}', file=sys.stderr)
        return False
    return True


def cloth_glyphs(a, box, close=15, grow=3, radius=5, margin=14):
    """Inpaint light glyph-like print marks on red cloth inside box (raw 0..1 coords)."""
    import cv2
    H, W = a.shape[:2]
    x0, y0, x1, y1 = int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H)
    sub = a[y0:y1, x0:x1].astype(int)
    R, G, B = sub[..., 0], sub[..., 1], sub[..., 2]
    red = ((R > 60) & (R > 1.5 * G) & (R > 1.5 * B)).astype('uint8')
    cloth = cv2.morphologyEx(red, cv2.MORPH_CLOSE, np.ones((close, close), 'uint8')) > 0
    redfrac = cv2.blur(red.astype(float), (15, 15))
    L = cv2.cvtColor(sub.astype('uint8'), cv2.COLOR_RGB2GRAY).astype(int)
    medL = cv2.medianBlur(L.astype('uint8'), 21).astype(int)
    mx, mn = sub.max(2), sub.min(2)
    glyph = cloth & (redfrac > 0.35) & ((mx - mn) < 110) & ((mn > 105) | (L - medL > 30))
    glyph[:margin] = glyph[-margin:] = False
    glyph[:, :margin] = glyph[:, -margin:] = False
    mask = cv2.dilate(glyph.astype('uint8') * 255, np.ones((2 * grow + 1, 2 * grow + 1), 'uint8'))
    out = cv2.inpaint(np.ascontiguousarray(sub.astype('uint8')[..., ::-1]), mask, radius, cv2.INPAINT_TELEA)[..., ::-1]
    a[y0:y1, x0:x1] = out


def smooth_ellipse(a, center, radii, k=17, feather=0.35):
    """Median-smooth a feathered ellipse (removes engraved pseudo-text on smooth metal)."""
    import cv2
    H, W = a.shape[:2]
    cx, cy, rx, ry = center[0] * W, center[1] * H, radii[0] * W, radii[1] * H
    x0, y0 = int(cx - rx * 1.3), int(cy - ry * 1.3)
    x1, y1 = int(cx + rx * 1.3) + 1, int(cy + ry * 1.3) + 1
    sub = a[y0:y1, x0:x1]
    med = cv2.medianBlur(np.ascontiguousarray(sub), int(k))
    yy, xx = np.mgrid[y0:y1, x0:x1]
    w = np.clip((1 - np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)) / feather, 0, 1)[..., None]
    a[y0:y1, x0:x1] = (sub * (1 - w) + med * w).astype('uint8')


def retouch(im, ops):
    if not ops:
        return im
    a = np.asarray(im).copy()
    for op in ops:
        if op[0] == 'cloth_glyphs':
            cloth_glyphs(a, op[1])
        elif op[0] == 'smooth_ellipse':
            smooth_ellipse(a, op[1], op[2], *(op[3:] or []))
        else:
            raise ValueError(f'unknown retouch op {op[0]}')
    return Image.fromarray(a)


def solve_crop(W, H, face):
    """Largest 1600:637 window (bottom above the watermark) that puts `face` inside FX/FY ranges."""
    FX, FY = face[0] * W, face[1] * H
    Hb = int(H * (1 - WM_CUT))
    for h in range(min(Hb, int(W / ASPECT)), int(H * 0.35), -1):
        w = h * ASPECT
        lo_x, hi_x = max(FX_RANGE[0], (FX - (W - w)) / w), min(FX_RANGE[1], FX / w)
        lo_y, hi_y = max(FY_RANGE[0], (FY - (Hb - h)) / h), min(FY_RANGE[1], FY / h)
        if lo_x <= hi_x and lo_y <= hi_y:
            fx = min(max(FX_PREF, lo_x), hi_x)
            fy = min(max(FY_PREF, lo_y), hi_y)
            x0, y0 = round(FX - fx * w), round(FY - fy * h)
            x0 = min(max(x0, 0), W - round(w)); y0 = min(max(y0, 0), Hb - h)
            return (x0, y0, x0 + round(w), y0 + h)
    raise RuntimeError('no valid crop window: face too close to the image edge, regenerate')


def to_out(pt, box, W, H):
    x0, y0, x1, y1 = box
    return (round((pt[0] * W - x0) / (x1 - x0), 3), round((pt[1] * H - y0) / (y1 - y0), 3))


def save_webp(im, path):
    q = QUALITY
    while True:
        im.save(path, 'WEBP', quality=q, method=6)
        if os.path.getsize(path) <= MAX_BYTES or q <= Q_MIN:
            return q
        q -= 2


def check(im, name):
    a = np.asarray(im.convert('L')).astype(float) / 255.0
    h, w = a.shape
    r = a[int(h * 0.92):, int(w * 0.88):]
    lum = r.mean()
    gy, gx = np.gradient(r)
    strong = (np.hypot(gx, gy) > 0.25).mean()
    bright_thin = ((r > 0.85).mean() > 0.01) and strong > 0.02
    warn = []
    if lum >= 0.35:
        warn.append(f'bottom-right mean luminance {lum:.2f} >= 0.35')
    if bright_thin:
        warn.append(f'text-like high-contrast edges in bottom-right ({strong*100:.1f}% strong edges)')
    for m in warn:
        print(f'  WARNING {name}: {m}')
    return dict(br_luminance=round(float(lum), 3), br_strong_edges=round(float(strong), 4), warnings=warn)


def hexrgb(s):
    s = s.lstrip('#'); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def preview(img, face, eye, hero, vw, drift, path):
    """Rough mock of feel.md 6.3: band at -7°, illustration 1.15·vw with face at (0.66vw, 0.47vh), left fade."""
    vh, Hb = 540, 216
    color, dark = COLORS[hero]
    cx, cy = vw / 2, 0.47 * vh
    ang = math.radians(7)
    d = (math.cos(ang), -math.sin(ang)); n = (math.sin(ang), math.cos(ang))
    L = (vw / 2 + 40) / math.cos(ang)

    def quad(o0, o1):
        return [(cx - L * d[0] + o0 * n[0], cy - L * d[1] + o0 * n[1]), (cx + L * d[0] + o0 * n[0], cy + L * d[1] + o0 * n[1]),
                (cx + L * d[0] + o1 * n[0], cy + L * d[1] + o1 * n[1]), (cx - L * d[0] + o1 * n[0], cy - L * d[1] + o1 * n[1])]
    canvas = Image.new('RGB', (vw, vh), (58, 52, 60))
    # band fill: gradient #000 -> dark
    grad = Image.new('RGB', (vw, vh))
    dk = hexrgb(dark)
    g = np.linspace(0, 1, vw)[None, :, None] * np.array(dk)[None, None, :]
    grad = Image.fromarray(np.repeat(g, vh, 0).astype('uint8'))
    mask = Image.new('L', (vw, vh), 0); ImageDraw.Draw(mask).polygon(quad(-Hb / 2, Hb / 2), fill=255)
    canvas.paste(grad, (0, 0), mask)
    # illustration
    Wi = 1.15 * vw; Hi = Wi / ASPECT
    ill = img.resize((round(Wi), round(Hi)), Image.LANCZOS).convert('RGBA')
    fade = np.zeros((ill.size[1], ill.size[0]), float)
    fw = int(ill.size[0] * 0.45)
    fade[:, :fw] = np.linspace(0.75, 0, fw)[None, :]
    black = Image.new('RGBA', ill.size, (0, 0, 0, 255)); black.putalpha(Image.fromarray((fade * 255).astype('uint8')))
    ill = Image.alpha_composite(ill, black)
    ox, oy = 0.66 * vw - face[0] * Wi + drift * vw, cy - face[1] * Hi
    layer = Image.new('RGBA', (vw, vh), (0, 0, 0, 0)); layer.paste(ill, (round(ox), round(oy)))
    canvas.paste(layer, (0, 0), Image.composite(layer.split()[3], Image.new('L', (vw, vh), 0), mask))
    dr = ImageDraw.Draw(canvas)
    dr.polygon(quad(-Hb / 2 - 16, -Hb / 2 - 10), fill=hexrgb(color))
    dr.polygon(quad(Hb / 2 + 8, Hb / 2 + 10), fill=(232, 200, 114))
    # text zone + eye glint
    tz = (0.05 * vw, cy + 12 - 40, 0.52 * vw, cy + 12 + 48)
    dr.rectangle(tz, outline=(255, 255, 255))
    ex, ey = ox + eye[0] * Wi, oy + eye[1] * Hi
    for k, (sx, sy) in enumerate(((14, 0), (0, 14))):
        dr.line([(ex - sx, ey - sy), (ex + sx, ey + sy)], fill=(255, 255, 255), width=2)
    fx_, fy_ = ox + face[0] * Wi, oy + face[1] * Hi
    dr.ellipse((fx_ - 4, fy_ - 4, fx_ + 4, fy_ + 4), outline=(0, 255, 0), width=2)
    canvas.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw-dir', default=os.environ.get('KLING_RAW_DIR', os.path.join(tempfile.gettempdir(), 'kling_cutin_raw')))
    ap.add_argument('--only', default='')
    ap.add_argument('--preview', default='')
    args = ap.parse_args()
    os.makedirs(args.raw_dir, exist_ok=True)
    man = load_manifest()
    sel = selected_entries(man)
    only = [h for h in args.only.split(',') if h] or HEROES
    anchors = json.load(open(ANCHORS, encoding='utf-8')) if os.path.exists(ANCHORS) else {}
    for hero in only:
        e = sel.get(hero)
        if not e:
            print(f'{hero}: no selected generation in cutin_manifest.json'); continue
        raw_face, raw_eye = tuple(e['raw_face']), tuple(e['raw_eye'])
        raw = os.path.join(args.raw_dir, f'cutin_{hero}_{e["generationId"][:10]}.png')
        if not download(e, raw):
            continue
        im = retouch(Image.open(raw).convert('RGB'), e.get('retouch')); W, H = im.size
        box = solve_crop(W, H, raw_face)
        out = im.crop(box).resize((OUT_W, OUT_H), Image.LANCZOS)
        path = os.path.join(REPO, e['file'])
        q = save_webp(out, path)
        chk = check(out, hero)
        face, eye = to_out(raw_face, box, W, H), to_out(raw_eye, box, W, H)
        zoom = W / (box[2] - box[0])
        anchors[hero] = dict(cutin=f'cg/cutin_{hero}', face=list(face), eye=list(eye), size=[OUT_W, OUT_H],
                             bytes=os.path.getsize(path), quality=q, generationId=e['generationId'],
                             raw_size=[W, H], crop=list(box), zoom=round(zoom, 3), **chk)
        print(f'{hero}: crop {box} (zoom {zoom:.2f}) -> {e["file"]} {os.path.getsize(path)//1024} KB q{q} face {face} eye {eye}')
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            for vw in (960, 1280):
                for dft in (0.0, -0.04):
                    preview(out, face, eye, hero, vw, dft, os.path.join(args.preview, f'band_{hero}_{vw}_{"d" if dft else "0"}.png'))
    note = ('face/eye: 0..1 coordinates in the final 1600x637 image (x right, y down). Copy into '
            'src/data/awaken.js AWAKEN[id].face / .eye (feel.md 6.5). face = face centre (placed at 0.66vw, 0.47vh), '
            'eye = eye used for the 0.50 s eye glint. Generated by tools/kling/cutin_process.py.')
    ordered = {'_note': note}
    ordered.update({h: anchors[h] for h in HEROES if h in anchors})
    with open(ANCHORS, 'w', encoding='utf-8') as f:
        json.dump(ordered, f, indent=1, ensure_ascii=False)
        f.write('\n')


if __name__ == '__main__':
    main()
