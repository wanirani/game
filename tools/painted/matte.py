#!/usr/bin/env python3
"""채색 부품 배경 제거 (Kling 이미지, 평평한 중간 회색 배경 전제).

알파 = rembg(isnet) 부드러운 매트 + 배경색과의 거리 키(찢긴 막의 구멍까지 뚫림) → 배경색 섞임 제거(가장자리 회색 테 제거).
워터마크('KlingAI 3.0 Omni', 오른쪽 아래)는 흰 글자 픽셀만 골라 주변 배경으로 인페인트한다(물체는 건드리지 않음).

사용:
  python3 tools/painted/matte.py <id> [원본이름 ...] [--force]
    configs/<id>.json 의 raw 폴더에서 원본(webp/png)을 읽어 .work/<id>/matte/<이름>.png (RGBA) 로 저장.
    이름을 생략하면 설정에 쓰인 모든 원본. 결과가 원본보다 새로우면 건너뛴다(--force 로 다시).
설정 (configs/<id>.json 의 "matte"):
  {"default": {"key": 9, "soft": 22, "hard": 6, "rembg": "isnet-general-use", "watermark": true},
   "<원본이름>": {...덮어쓰기...}}
  key/soft: 배경 거리 key..key+soft 구간에서 알파 0→1, hard: 이 거리 미만은 무조건 투명.
  watermark: false 면 워터마크 처리 안 함 / [x0,y0,x1,y1] 로 영역 지정(비율 0~1).
"""
import sys, os, json, time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
_sess = {}


def load_config(pid):
    p = os.path.join(HERE, 'configs', pid + '.json')
    with open(p, encoding='utf-8') as f:
        cfg = json.load(f)
    cfg.setdefault('raw', f'tools/painted/raw/{pid}')
    cfg['_work'] = os.path.join(HERE, '.work', pid)
    return cfg


def raw_path(cfg, name):
    base = os.path.join(ROOT, cfg['raw'], name)
    for ext in ('.webp', '.png', '.jpg'):
        if os.path.exists(base + ext):
            return base + ext
    raise FileNotFoundError(base + '.(webp|png|jpg)')


def sources_used(cfg):
    s = []
    for p in cfg.get('parts', []): s.append(p['src'])
    for c in cfg.get('chains', []): s.append(c['src'])
    for d in cfg.get('debris', []): s.append(d['src'])
    return list(dict.fromkeys(s))


def rembg_alpha(im, model):
    from rembg import remove, new_session
    if model not in _sess:
        _sess[model] = new_session(model)
    r = remove(im, session=_sess[model], only_mask=True, post_process_mask=False)
    return np.asarray(r).astype(np.float32) / 255.0


def remove_watermark(a, bg, region):
    """오른쪽 아래 흰 글자/로고 → 인페인트. 흰 픽셀 중 배경에 붙어 있는(가는 획) 것만 대상."""
    import cv2
    h, w, _ = a.shape
    x0, y0, x1, y1 = [int(v) for v in (region[0] * w, region[1] * h, region[2] * w, region[3] * h)]
    reg = a[y0:y1, x0:x1]
    white = (reg.min(2) > 185) & ((reg.max(2) - reg.min(2)) < 40)
    dist = np.sqrt(((reg - bg) ** 2).sum(2))
    near_bg = ndi.binary_dilation(dist < 14, iterations=4)
    text = white & near_bg
    if text.sum() < 30:
        return a, 0
    # 글자 획 사이의 회색 반투명 가장자리까지 덮도록 팽창
    m = ndi.binary_dilation(text, iterations=3)
    mask = np.zeros((h, w), np.uint8)
    mask[y0:y1, x0:x1] = m.astype(np.uint8) * 255
    out = cv2.inpaint(np.clip(a, 0, 255).astype(np.uint8), mask, 6, cv2.INPAINT_TELEA).astype(np.float32)
    # 인페인트된 곳은 배경색으로 정규화 (키가 확실히 먹도록)
    sel = mask > 0
    out[sel] = out[sel] * 0.3 + bg * 0.7
    return out, int(sel.sum())


def matte(cfg, name, force=False):
    src = raw_path(cfg, name)
    outd = os.path.join(cfg['_work'], 'matte'); os.makedirs(outd, exist_ok=True)
    out = os.path.join(outd, name + '.png')
    if not force and os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(src):
        return out
    o = dict({'key': 9.0, 'soft': 22.0, 'hard': 6.0, 'rembg': 'isnet-general-use', 'watermark': True}, **cfg.get('matte', {}).get('default', {}))
    o.update(cfg.get('matte', {}).get(name, {}))
    t0 = time.time()
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape
    border = np.concatenate([a[:6].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(border, 0)
    wm = 0
    if o['watermark']:
        region = o['watermark'] if isinstance(o['watermark'], list) else [0.7, 0.86, 1.0, 1.0]
        a, wm = remove_watermark(a, bg, region)
    im2 = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    dist = np.sqrt(((a - bg) ** 2).sum(2))
    ar = rembg_alpha(im2, o['rembg']) if o['rembg'] else np.ones((h, w), np.float32)
    key = np.clip((dist - o['key']) / o['soft'], 0, 1)
    # rembg 로 실루엣, 키로 진짜 배경(구멍)을 뚫고 rembg 가 놓친 저대비 부분을 살린다
    alpha = np.minimum(np.maximum(ar, key * (ar > 0.02)), np.clip((dist - o['hard'] + 1) / 10.0, 0, 1))
    alpha = ndi.gaussian_filter(alpha, 0.6)
    alpha[dist < o['hard']] = 0
    # 작은 부스러기(노이즈 섬) 제거
    lab, n = ndi.label(alpha > 0.5)
    if n > 1:
        sizes = ndi.sum(np.ones_like(alpha), lab, range(1, n + 1))
        small = np.isin(lab, np.where(sizes < o.get('minIsland', 60))[0] + 1)
        alpha[small] = 0
    # 색 섞임 제거: C = (I - (1-a) B) / a
    A = alpha[..., None]
    col = np.where(A > 0.05, (a - (1 - A) * bg) / np.maximum(A, 0.05), a)
    rgba = np.dstack([np.clip(col, 0, 255), alpha * 255]).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(out)
    print(f'  matte {name}: bg={bg.round(1).tolist()} watermark_px={wm} alpha_mean={alpha.mean():.3f} ({time.time() - t0:.1f}s)')
    return out


def main(argv):
    force = '--force' in argv
    args = [x for x in argv if not x.startswith('--')]
    if not args:
        print(__doc__); return 1
    cfg = load_config(args[0])
    names = args[1:] or sources_used(cfg)
    for n in names:
        matte(cfg, n, force)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
