#!/usr/bin/env python3
"""환경 키트(src/v2/env) 텍스처 생성기 — 코드로 만든 이어 붙는(타일) 텍스처. docs/v2/ENV_KIT.md §3
   python3 tools/v2/envkit_tex.py [--out assets/v2/env] [--preview /tmp/x.png]
   모든 무늬는 주기 512 로 만든다(FFT 잡음 · 감아 도는 거리) → 이음매가 없다. webp 로 저장(장당 150 KB 이하).
   그림 생성(Higgsfield)은 쓰지 않았다 — 결과는 같은 씨앗이면 늘 같다.
"""
import sys, os, argparse
import numpy as np
from PIL import Image

N = 512
rng = np.random.default_rng(20261117)


def fbm(n=N, beta=2.0, seed=None, aniso=(1.0, 1.0)):
    """주기 잡음 (1/f^beta 스펙트럼). 0..1"""
    r = np.random.default_rng(seed) if seed is not None else rng
    fy = np.fft.fftfreq(n)[:, None] * aniso[1]
    fx = np.fft.fftfreq(n)[None, :] * aniso[0]
    f = np.sqrt(fx * fx + fy * fy); f[0, 0] = 1
    spec = (r.normal(size=(n, n)) + 1j * r.normal(size=(n, n))) / f ** (beta / 2)
    spec[0, 0] = 0
    a = np.real(np.fft.ifft2(spec))
    a = (a - a.min()) / (a.max() - a.min())
    return a


def sm(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def worley(n, pts, metric='e'):
    """감아 도는 셀 잡음 → (가장 가까운 거리, 둘째 거리, 칸 번호). 좌표 0..1"""
    yy, xx = np.mgrid[0:n, 0:n] / n
    f1 = np.full((n, n), 9.0); f2 = np.full((n, n), 9.0); idx = np.zeros((n, n), np.int32)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xx - px); dx = np.minimum(dx, 1 - dx)
        dy = np.abs(yy - py); dy = np.minimum(dy, 1 - dy)
        d = np.sqrt(dx * dx + dy * dy) if metric == 'e' else np.maximum(dx, dy) * 0.8 + (dx + dy) * 0.3
        nearer = d < f1
        f2 = np.where(nearer, f1, np.minimum(f2, d))
        idx = np.where(nearer, i, idx)
        f1 = np.where(nearer, d, f1)
    return f1, f2, idx


def relax(pts, it=2, n=128):
    """점을 고르게 (로이드 완화 1–2회, 감아 돌기 포함)"""
    pts = np.array(pts)
    for _ in range(it):
        _, _, idx = worley(n, pts)
        yy, xx = np.mgrid[0:n, 0:n] / n
        new = []
        for i, (px, py) in enumerate(pts):
            m = idx == i
            if not m.any(): new.append((px, py)); continue
            dx = ((xx[m] - px + 0.5) % 1) - 0.5; dy = ((yy[m] - py + 0.5) % 1) - 0.5
            new.append(((px + dx.mean()) % 1, (py + dy.mean()) % 1))
        pts = np.array(new)
    return pts


def emboss(h, k=1.0):
    """높이 → 왼쪽 위에서 비추는 빛 (감아 돌기)"""
    gx = np.roll(h, -1, 1) - np.roll(h, 1, 1); gy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    return np.clip(0.5 - (gx * 0.6 + gy * 1.0) * k, 0, 1)


def rgb(base, shade, var=None):
    """base 색(0..255 세 값) × 밝기 맵(1 근처) (+ 색 변화 맵 n×n×3)"""
    c = np.array(base, np.float32)[None, None, :] * shade[:, :, None]
    if var is not None: c = c * var
    return np.clip(c, 0, 255).astype(np.uint8)


def blocks(rows, wmin, wmax, seed, n=N):
    """줄눈 벽돌/마름돌 배치 → (줄눈까지 거리 px, 돌 번호, 돌 안 세로 위치 0..1)"""
    r = np.random.default_rng(seed)
    hs = r.uniform(0.8, 1.25, rows); hs = np.round(hs / hs.sum() * n).astype(int); hs[-1] += n - hs.sum()
    dist = np.zeros((n, n), np.float32); ident = np.zeros((n, n), np.int32); vpos = np.zeros((n, n), np.float32)
    y = 0; k = 0
    xs = np.arange(n)
    for h in hs:
        ws = []
        while sum(ws) < n: ws.append(int(r.uniform(wmin, wmax)))
        ws[-1] -= sum(ws) - n
        if ws[-1] < wmin * 0.5 and len(ws) > 1:
            last = ws.pop(); ws[-1] += last
        assert sum(ws) == n and min(ws) > 0
        off = int(r.uniform(0, wmax)); x = 0
        dx = np.zeros(n, np.float32); idr = np.zeros(n, np.int32)
        for w in ws:
            seg = (np.arange(x, x + w) + off) % n
            t = np.arange(w)
            dx[seg] = np.minimum(t, w - 1 - t); idr[seg] = k; k += 1; x += w
        ty = np.arange(h)
        dy = np.minimum(ty, h - 1 - ty)[:, None].astype(np.float32)
        dist[y:y + h] = np.minimum(dx[None, :], dy); ident[y:y + h] = idr[None, :]; vpos[y:y + h] = (ty / max(1, h - 1))[:, None]
        y += h
    return dist, ident, vpos, k


def per(ident, k, lo, hi, seed):
    r = np.random.default_rng(seed)
    return r.uniform(lo, hi, k + 1)[ident]


def tex_ashlar():
    dist, ident, vpos, k = blocks(7, 70, 150, 11)
    n1 = fbm(beta=2.2, seed=1); n2 = fbm(beta=1.2, seed=2); n3 = fbm(beta=3.0, seed=3)
    edge = dist + (n2 - 0.5) * 5
    mortar = 1 - sm(1.5, 4.5, edge)
    h = sm(1.5, 9, edge) * 0.8 + n2 * 0.25 + n1 * 0.3
    lit = emboss(h, 2.6)
    tone = per(ident, k, 0.8, 1.12, 5)
    shade = (0.62 + 0.55 * lit) * tone * (0.82 + 0.3 * n1) * (1 - 0.5 * mortar)
    shade *= 1 - 0.25 * sm(0.58, 0.8, n3) * (1 - mortar)                      # 얼룩
    hue = np.stack([per(ident, k, 0.94, 1.06, 6), per(ident, k, 0.97, 1.03, 7), per(ident, k, 0.95, 1.08, 8)], 2)
    c = rgb((150, 152, 164), shade, hue).astype(np.float32)
    moss = sm(0.55, 0.75, fbm(beta=2.4, seed=9)) * sm(0.2, 0.9, mortar + 0.25 * (vpos > 0.8))
    c = c * (1 - 0.55 * moss[:, :, None]) + np.array([62, 84, 52])[None, None, :] * 0.55 * moss[:, :, None]
    return np.clip(c, 0, 255).astype(np.uint8)


def tex_plaster():
    n1 = fbm(beta=2.6, seed=21); n2 = fbm(beta=1.4, seed=22); n3 = fbm(beta=3.2, seed=23); n4 = fbm(beta=2.0, seed=24)
    h = n1 * 0.6 + n2 * 0.25
    lit = emboss(h, 1.6)
    shade = (0.8 + 0.3 * lit) * (0.9 + 0.18 * n3)
    crack = 1 - sm(0.0, 0.012, np.abs(n4 - 0.5)) * 1.0                            # 실금
    crack *= sm(0.45, 0.6, fbm(beta=3.0, seed=25))
    shade *= 1 - 0.38 * crack
    streak = fbm(beta=2.4, seed=26, aniso=(0.5, 4.0))                             # 세로로 흘러내린 물때
    shade *= 1 - 0.2 * sm(0.55, 0.85, streak)
    c = rgb((206, 190, 160), shade).astype(np.float32)
    patch = sm(0.76, 0.8, fbm(beta=2.6, seed=27))                                # 떨어져 나간 자리 (어두운 속벽)
    c = c * (1 - 0.5 * patch[:, :, None]) + np.array([120, 96, 80])[None, None, :] * 0.5 * patch[:, :, None] * (0.8 + 0.4 * n2[:, :, None])
    return np.clip(c, 0, 255).astype(np.uint8)


def tex_slate(n=256):
    rows = 8; rh = n // rows
    yy, xx = np.mgrid[0:n, 0:n]
    row = yy // rh; ty = (yy % rh) / rh
    r = np.random.default_rng(31)
    cols = 6; cw = n / cols
    offs = r.uniform(0, cw, rows)
    u = (xx + offs[row]) % n
    col = (u // cw).astype(int); tx = (u % cw) / cw
    ident = row * cols + col; k = rows * cols
    wob = per(ident, k, -0.06, 0.06, 32)
    edge = np.minimum(tx, 1 - tx) * cw                                           # 옆 틈
    low = (1 - ty) * rh - 3 * (np.abs(tx - 0.5) * 2) ** 3 - wob * rh            # 아래 끝 (둥글게)
    gap = 1 - sm(0.6, 2.0, edge)
    n1 = fbm(n, beta=2.0, seed=33); n2 = fbm(n, beta=1.0, seed=34, aniso=(0.4, 2.0))
    shade = (0.7 + 0.5 * ty) * per(ident, k, 0.78, 1.15, 35) * (0.85 + 0.3 * n1) * (0.92 + 0.16 * n2)
    shade *= 1 - 0.6 * gap
    shade *= 0.45 + 0.55 * sm(0.0, 5.0, yy % rh + 0.0)                           # 윗줄이 드리운 그늘
    shade *= 1 + 0.25 * (1 - sm(0, 2.5, low))                                    # 아래 끝 밝은 모서리
    hue = np.stack([per(ident, k, 0.92, 1.05, 36), per(ident, k, 0.96, 1.04, 37), per(ident, k, 0.96, 1.1, 38)], 2)
    c = rgb((92, 100, 122), shade, hue).astype(np.float32)
    moss = sm(0.62, 0.8, fbm(n, beta=2.6, seed=39))
    c = c * (1 - 0.4 * moss[:, :, None]) + np.array([58, 80, 56])[None, None, :] * 0.4 * moss[:, :, None]
    return np.clip(c, 0, 255).astype(np.uint8)


def tex_cobble():
    r = np.random.default_rng(41)
    pts = relax(r.uniform(0, 1, (105, 2)), 2)
    f1, f2, idx = worley(N, pts)
    n1 = fbm(beta=2.0, seed=42); n2 = fbm(beta=1.0, seed=43)
    gap = (f2 - f1) * N                                                          # 줄눈까지 거리 (px 근사)
    stone = sm(1.5, 7.0, gap + (n2 - 0.5) * 3)
    dome = np.clip(1 - f1 * N / 32, 0, 1)
    h = stone * (0.5 + 0.5 * np.sqrt(dome)) + n2 * 0.12
    lit = emboss(h, 3.2)
    k = len(pts)
    shade = (0.5 + 0.75 * lit) * per(idx, k, 0.84, 1.1, 44) * (0.85 + 0.3 * n1) * (0.3 + 0.7 * stone)
    shade *= 1 + 0.22 * sm(0.55, 0.95, dome) * stone                             # 닳아 반들거리는 윗면
    hue = np.stack([per(idx, k, 0.96, 1.05, 45), per(idx, k, 0.97, 1.03, 46), per(idx, k, 0.96, 1.05, 47)], 2)
    c = rgb((132, 130, 136), shade, hue).astype(np.float32)
    dirt = (1 - stone) * sm(0.35, 0.7, fbm(beta=2.4, seed=48))
    c = c * (1 - 0.5 * dirt[:, :, None]) + np.array([70, 66, 48])[None, None, :] * 0.5 * dirt[:, :, None]
    return np.clip(c, 0, 255).astype(np.uint8)


def tex_flag():
    dist, ident, vpos, k = blocks(5, 90, 200, 51)
    n1 = fbm(beta=2.2, seed=52); n2 = fbm(beta=1.2, seed=53); n3 = fbm(beta=3.0, seed=54)
    edge = dist + (n2 - 0.5) * 6
    gap = 1 - sm(1.0, 4.0, edge)
    h = sm(1.0, 7.0, edge) * 0.7 + n2 * 0.2 + n1 * 0.25
    lit = emboss(h, 2.2)
    shade = (0.66 + 0.5 * lit) * per(ident, k, 0.82, 1.1, 55) * (0.85 + 0.28 * n1) * (1 - 0.55 * gap)
    crack = (1 - sm(0.0, 0.01, np.abs(fbm(beta=2.2, seed=56) - 0.5))) * sm(0.5, 0.62, n3)
    shade *= 1 - 0.3 * crack
    hue = np.stack([per(ident, k, 0.95, 1.06, 57), per(ident, k, 0.97, 1.03, 58), per(ident, k, 0.95, 1.06, 59)], 2)
    c = rgb((140, 138, 140), shade, hue).astype(np.float32)
    moss = sm(0.5, 0.72, fbm(beta=2.4, seed=60)) * sm(0.1, 0.8, gap + 0.15)
    c = c * (1 - 0.6 * moss[:, :, None]) + np.array([60, 86, 50])[None, None, :] * 0.6 * moss[:, :, None]
    return np.clip(c, 0, 255).astype(np.uint8)


def tile_timber(n=256):
    """어두운 참나무 널 (세로 결)"""
    yy, xx = np.mgrid[0:n, 0:n]
    pw = n // 4; pl = xx // pw; tx = (xx % pw)
    grain = fbm(n, beta=2.0, seed=61, aniso=(0.35, 6.0)); g2 = fbm(n, beta=1.0, seed=62, aniso=(0.2, 8.0)); n1 = fbm(n, beta=2.6, seed=63)
    gap = 1 - sm(0.5, 2.5, np.minimum(tx, pw - 1 - tx))
    shade = (0.62 + 0.55 * grain) * (0.85 + 0.3 * g2) * per(pl, 4, 0.82, 1.1, 64) * (0.88 + 0.24 * n1) * (1 - 0.7 * gap)
    lit = emboss(grain * 0.5 + (1 - gap) * 0.5, 1.5)
    shade *= 0.8 + 0.4 * lit
    return rgb((104, 74, 52), shade)


def tile_glass(n=128):
    """불 켜진 납선 유리 (마름모 격자)"""
    yy, xx = np.mgrid[0:n, 0:n]
    p = n / 4
    a = ((xx + yy) % p) / p; b = ((xx - yy) % p) / p
    lead = 1 - sm(0.05, 0.12, np.minimum(np.minimum(a, 1 - a), np.minimum(b, 1 - b)))
    ia = ((xx + yy) // p).astype(int) % 4; ib = ((xx - yy) // p).astype(int) % 4
    ident = ia * 4 + ib
    tone = per(ident, 16, 0.72, 1.12, 71)
    n1 = fbm(n, beta=2.4, seed=72)
    cx = (xx / n - 0.5); cy = (yy / n - 0.5)
    shade = tone * (0.86 + 0.28 * n1)
    c = np.stack([255 * shade, 196 * shade * (0.9 + 0.2 * n1), 96 * shade * shade], 2)
    c = c * (1 - lead[:, :, None]) + np.array([30, 20, 14])[None, None, :] * lead[:, :, None]
    return np.clip(c, 0, 255).astype(np.uint8)


def tile_glass_dark(n=128):
    yy, xx = np.mgrid[0:n, 0:n]
    p = n / 4
    a = ((xx + yy) % p) / p; b = ((xx - yy) % p) / p
    lead = 1 - sm(0.05, 0.12, np.minimum(np.minimum(a, 1 - a), np.minimum(b, 1 - b)))
    n1 = fbm(n, beta=2.4, seed=73)
    refl = sm(0.3, 0.9, ((xx * 0.8 - yy) % n) / n) * 0.5 + 0.5
    c = np.stack([44 * refl * (0.8 + 0.4 * n1), 58 * refl * (0.8 + 0.4 * n1), 88 * refl * (0.8 + 0.4 * n1)], 2)
    c = c * (1 - lead[:, :, None]) + np.array([18, 16, 18])[None, None, :] * lead[:, :, None]
    return np.clip(c, 0, 255).astype(np.uint8)


def tile_straw(n=128):
    g = fbm(n, beta=1.2, seed=81, aniso=(6.0, 0.25)); g2 = fbm(n, beta=2.0, seed=82, aniso=(3.0, 0.5)); n1 = fbm(n, beta=2.6, seed=83)
    shade = (0.55 + 0.7 * g) * (0.85 + 0.3 * g2) * (0.85 + 0.3 * n1)
    lit = emboss(g, 2.0)
    return rgb((214, 176, 92), shade * (0.8 + 0.4 * lit))


def tile_metal(n=128):
    n1 = fbm(n, beta=2.2, seed=91); n2 = fbm(n, beta=1.0, seed=92, aniso=(0.3, 3.0)); n3 = fbm(n, beta=3.0, seed=93)
    shade = (0.75 + 0.4 * n1) * (0.9 + 0.2 * n2)
    c = rgb((84, 86, 96), shade).astype(np.float32)
    rust = sm(0.6, 0.8, n3)
    c = c * (1 - 0.5 * rust[:, :, None]) + np.array([120, 70, 44])[None, None, :] * 0.5 * rust[:, :, None]
    return np.clip(c, 0, 255).astype(np.uint8)


def tile_cloth(n=128):
    yy, xx = np.mgrid[0:n, 0:n]
    weave = 0.5 + 0.25 * np.sin(xx * np.pi / 2) * np.sin(yy * np.pi / 2)
    n1 = fbm(n, beta=2.4, seed=95); fold = fbm(n, beta=3.0, seed=96, aniso=(3.0, 0.4))
    shade = (0.8 + 0.2 * weave) * (0.8 + 0.3 * n1) * (0.75 + 0.5 * fold)
    return rgb((214, 208, 200), shade)


def tile_coal(n=128):
    r = np.random.default_rng(97)
    f1, f2, idx = worley(n, relax(r.uniform(0, 1, (40, 2)), 1, 64))
    heat = sm(0.0, 0.08, f2 - f1)
    n1 = fbm(n, beta=2.0, seed=98)
    glow = (1 - heat) * (0.6 + 0.6 * n1)
    c = np.stack([60 + 195 * glow, 30 + 130 * glow * glow, 16 + 40 * glow ** 3], 2)
    return np.clip(c, 0, 255).astype(np.uint8)


def atlas_trim():
    """잡동사니 아틀라스 512² (반복하지 않는 조각들; 조각마다 가장자리 4px 를 늘려 밉맵 번짐을 막는다).
       배치는 src/v2/env/mats.js TRIM 과 같아야 한다."""
    A = np.zeros((N, N, 3), np.uint8)
    def put(img, x, y):
        h, w = img.shape[:2]
        pad = np.pad(img, ((4, 4), (4, 4), (0, 0)), mode='wrap')
        A[y - 4:y + h + 4, x - 4:x + w + 4] = pad
    put(tile_timber(248), 4, 4)            # timber   (4,4)   248²  — 감아 도는 무늬라 조각 안에서 한 번은 이어 붙여도 된다
    put(tile_glass(120), 260, 4)           # glass    (260,4) 120²
    put(tile_glass_dark(120), 388, 4)      # glassDark(388,4) 120²
    put(tile_straw(120), 260, 132)         # straw    (260,132)
    put(tile_metal(120), 388, 132)         # metal    (388,132)
    put(tile_cloth(120), 4, 260)           # cloth    (4,260)
    put(tile_coal(120), 132, 260)          # coal     (132,260)
    A[388 - 4:508 + 4, 4 - 4:508 + 4] = np.maximum(A[388 - 4:508 + 4, 4 - 4:508 + 4], 0)
    A[392:504, 264:504] = 255              # white    (264,392) 240×112 — 정점 색만으로 칠하는 면
    A[388:508, 260:508][A[388:508, 260:508].sum(2) == 0] = 255
    return A


OUT = {
    'k_ashlar': (tex_ashlar, 82), 'k_plaster': (tex_plaster, 80), 'k_slate': (tex_slate, 82),
    'k_cobble': (tex_cobble, 80), 'k_flag': (tex_flag, 80), 'k_trim': (atlas_trim, 84),
}

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--out', default='assets/v2/env'); ap.add_argument('--preview', default=''); ap.add_argument('--legacy', action='store_true')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    tiles = []
    # PROPS lane (ENV_KIT.md 16): k_ashlar k_plaster k_slate k_flag k_cobble are now written by tools/v2/world_tex.py (generated squares / re-made cobbles).
    # This tool only writes k_trim by default; --legacy writes the old procedural versions of the others too (use --out to keep them out of assets/).
    for name, (fn, q) in OUT.items():
        if name != 'k_trim' and not a.legacy: continue
        img = Image.fromarray(fn())
        p = os.path.join(a.out, name + '.webp'); img.save(p, 'WEBP', quality=q, method=6)
        kb = os.path.getsize(p) / 1024
        print(f'{name}: {img.size[0]}x{img.size[1]} {kb:.0f} KB' + ('  !! 150 KB 초과' if kb > 150 else ''))
        tiles.append(img)
    if a.preview:   # 2×2 로 이어 붙여 이음매를 눈으로 본다
        W = Image.new('RGB', (len(tiles) * 520, 520), (20, 20, 20))
        for i, im in enumerate(tiles):
            t = im.resize((256, 256));
            for dx in (0, 256):
                for dy in (0, 256): W.paste(t, (i * 520 + dx, dy))
        W.save(a.preview)
