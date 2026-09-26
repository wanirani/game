# 퍼펫 파이프라인 공용 유틸 (경로 · 입출력 · 워터마크 제거 · 배경 제거 · 다각형/마스크)
# 모든 스크립트는 저장소 루트 기준 경로를 쓴다. python3 tools/puppet/<script>.py ...
import json, os, sys, hashlib
import numpy as np
import cv2
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
PUP = os.path.abspath(os.path.join(HERE, '..'))            # tools/puppet
REPO = os.path.abspath(os.path.join(PUP, '..', '..'))        # 저장소 루트
SRC = os.path.join(PUP, 'src')                               # 원화(클링 결과, 워터마크 제거본) + 알파
RIGS = os.path.join(PUP, 'rigs')                             # 리그 테이블 JSON
OUT = os.path.join(REPO, 'assets', 'puppets')                # 게임 에셋 출력
DBG = os.environ.get('PUP_DBG', '/tmp/claude-0/puppet_dbg')  # 디버그 이미지(저장소 밖)


def ensure(d):
    os.makedirs(d, exist_ok=True)
    return d


def load_json(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def save_json(p, obj, indent=None):
    ensure(os.path.dirname(p))
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent, separators=(',', ':') if indent is None else None)


def rgb_of(path):
    return np.asarray(Image.open(path).convert('RGB')).copy()


# ───────── 워터마크 ─────────
def remove_watermark(rgb, box=(0.6, 0.952, 1.0, 1.0)):
    """클링 우하단 'KlingAI 3.0 Omni' 글자(밝은 반투명)를 주변 배경으로 메움. box = (x0,y0,x1,y1) 비율.
    평평한 배경 위에만 있다고 가정 (인물 원화는 발이 이 영역에 닿지 않게 생성할 것)."""
    H, W, _ = rgb.shape
    x0, y0, x1, y1 = int(W * box[0]), int(H * box[1]), int(W * box[2]), int(H * box[3])
    sub = rgb[y0:y1, x0:x1].astype(np.float32)
    bg = cv2.medianBlur(rgb[y0:y1, x0:x1], 31).astype(np.float32)
    diff = (sub - bg).min(2)                      # 워터마크는 배경보다 밝은 무채색 글자
    sat = sub.max(2) - sub.min(2)
    m = ((diff > 5) & (sub.mean(2) > 140) & (sat < 30)).astype(np.uint8)
    m = cv2.dilate(m, np.ones((5, 5), np.uint8), iterations=2)
    out = rgb.copy()
    if m.any():
        fix = cv2.inpaint(np.ascontiguousarray(rgb[y0:y1, x0:x1]), m * 255, 7, cv2.INPAINT_TELEA)
        out[y0:y1, x0:x1] = fix
    return out


# ───────── 배경 제거 ─────────
_SESS = None


def rembg_alpha(rgb):
    """rembg isnet-general-use 알파(0~255). 결과는 src/*_alpha.png 로 커밋해 재현성을 확보한다."""
    global _SESS
    from rembg import remove, new_session
    if _SESS is None:
        _SESS = new_session('isnet-general-use')
    out = remove(Image.fromarray(rgb), session=_SESS, post_process_mask=True)
    return np.asarray(out)[..., 3].copy()


def alpha_for(src_png, alpha_png):
    """alpha_png 가 있으면 읽고, 없으면 rembg 로 만들어 저장"""
    if os.path.exists(alpha_png):
        return np.asarray(Image.open(alpha_png).convert('L')).copy()
    a = rembg_alpha(rgb_of(src_png))
    Image.fromarray(a, 'L').save(alpha_png, optimize=True)
    return a


# ───────── 다각형 / 마스크 ─────────
def smooth_pts(pts, n=6):
    """Catmull-Rom 닫힌 곡선 보간"""
    P = np.array(pts, float)
    out = []
    m = len(P)
    for i in range(m):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % m], P[(i + 2) % m]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return out


def poly_mask(pts, W, H, smooth=0):
    """pts: [[x,y],...] 원본 좌표. smooth>0 이면 Catmull-Rom 으로 둥글게"""
    if smooth:
        pts = smooth_pts(pts, int(smooth))
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon([tuple(map(float, p)) for p in pts], fill=255)
    return np.asarray(im) > 0


def bleed(img, m):
    """m 밖 픽셀을 m 안의 가장 가까운 색으로 채움 (가장자리 회색 번짐 방지)"""
    if not m.any():
        return img
    idx = ndi.distance_transform_edt(~m, return_distances=False, return_indices=True)
    return img[idx[0], idx[1]]


def feather(mask, r):
    return cv2.GaussianBlur(mask.astype(np.float32), (0, 0), r) if r > 0 else mask.astype(np.float32)


def bbox(m, pad=0, W=None, H=None):
    ys, xs = np.where(m)
    if not len(ys):
        return None
    x0, y0, x1, y1 = xs.min() - pad, ys.min() - pad, xs.max() + 1 + pad, ys.max() + 1 + pad
    if W is not None:
        x0, x1 = max(0, x0), min(W, x1)
    if H is not None:
        y0, y1 = max(0, y0), min(H, y1)
    return int(x0), int(y0), int(x1), int(y1)


def hsv_arrays(rgb):
    """0~1 V, S 와 0~360 hue"""
    a = rgb.astype(np.float32) / 255
    mx_, mn_ = a.max(2), a.min(2)
    s = np.where(mx_ > 1e-3, (mx_ - mn_) / np.maximum(mx_, 1e-3), 0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hue = (np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) + 360) % 360
    return hue, s, mx_


def file_hash(*paths):
    h = hashlib.sha1()
    for p in paths:
        if p and os.path.exists(p):
            with open(p, 'rb') as f:
                h.update(f.read())
    return h.hexdigest()[:12]


def on_green(rgba, scale=1.0, col=(40, 150, 60)):
    im = Image.fromarray(rgba, 'RGBA') if isinstance(rgba, np.ndarray) else rgba
    bg = Image.new('RGBA', im.size, col + (255,))
    bg.alpha_composite(im)
    if scale != 1:
        bg = bg.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    return bg.convert('RGB')


def die(msg):
    print('ERROR:', msg, file=sys.stderr)
    sys.exit(1)
