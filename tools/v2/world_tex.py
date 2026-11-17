#!/usr/bin/env python3
"""WORLD lane surface textures (docs/v2/ENV_KIT.md 12). Tiling 512 px squares, webp <= 160 KB, written to assets/v2/env/.
   python3 tools/v2/world_tex.py [--only k_cobble,k_soil] [--sheet /tmp/claude-0/v2/world/tex_sheet.png]
   python3 tools/v2/world_tex.py --from painted.png --name k_cobble      # make a generated/painted square tile and store it
 Two kinds of source:
   * procedural (periodic noise, wrapped cell noise) - organic cobbles, setts, worn muddy cobbles, rubble wall, thatch
   * derived from the game's own painted v1 tiles (assets/tex/*.webp, already seamless): bones, bark, wet cellar stone, planks, grave soil
 Paid image generation was refused for this lane, so nothing here is generated art. --from is the path for painted squares later.
"""
import sys, os, argparse
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from envkit_tex import fbm, sm, emboss, relax  # noqa: E402

N = 512
OUT = 'assets/v2/env'


def wworley(pts, wts, n=N):
    """wrapped cell noise with a weight per point (bigger weight = bigger stone) -> f1, f2, idx"""
    yy, xx = np.mgrid[0:n, 0:n] / n
    f1 = np.full((n, n), 9.0); f2 = np.full((n, n), 9.0); idx = np.zeros((n, n), np.int32)
    for i, ((px, py), w) in enumerate(zip(pts, wts)):
        dx = np.abs(xx - px); dx = np.minimum(dx, 1 - dx); dy = np.abs(yy - py); dy = np.minimum(dy, 1 - dy)
        d = np.sqrt(dx * dx + dy * dy) / w
        near = d < f1
        f2 = np.where(near, f1, np.minimum(f2, d)); idx = np.where(near, i, idx); f1 = np.where(near, d, f1)
    return f1, f2, idx


def per(idx, k, lo, hi, seed):
    return np.random.default_rng(seed).uniform(lo, hi, k)[idx]


def stones(npts, seed, relax_it=0, wlo=0.75, whi=1.3, gap0=1.2, gap1=6.0, dome_px=30, palette=None, mud=0.0, flat=0.0, earth=(58, 50, 40), mossk=0.6, edge=0.28):
    r = np.random.default_rng(seed)
    pts = r.uniform(0, 1, (npts, 2))
    if relax_it: pts = relax(pts, relax_it)
    wts = r.uniform(wlo, whi, npts)
    f1, f2, idx = wworley(pts, wts)
    n1 = fbm(beta=2.0, seed=seed + 1); n2 = fbm(beta=1.0, seed=seed + 2); n3 = fbm(beta=2.6, seed=seed + 3)
    gap = (f2 - f1) * N * 0.9
    stone = sm(gap0, gap1, gap + (n2 - 0.5) * 4)
    dome = np.clip(1 - f1 * N / dome_px, 0, 1)
    h = stone * ((0.45 + 0.55 * np.sqrt(dome)) * (1 - flat) + flat * 0.8) + n2 * 0.14
    lit = emboss(h, 3.4)
    k = npts
    shade = (0.46 + 0.8 * lit) * per(idx, k, 0.72, 1.16, seed + 4) * (0.82 + 0.36 * n1) * (edge + (1 - edge) * stone)
    shade *= 1 + 0.2 * sm(0.5, 0.95, dome) * stone
    pal = np.array(palette or [(126, 130, 142), (140, 132, 122), (104, 108, 118), (150, 146, 140), (118, 104, 96), (96, 104, 112)], np.float32)
    col = pal[r.integers(0, len(pal), k)][idx]
    c = col * shade[:, :, None]
    c *= (0.92 + 0.16 * n2)[:, :, None]
    # dark damp earth and moss in the joints
    joint = 1 - stone
    earth = np.array(earth, np.float32) * (0.7 + 0.6 * n3)[:, :, None]
    c = c * stone[:, :, None] + earth * joint[:, :, None] * 0.9 + c * joint[:, :, None] * 0.1
    moss = joint * sm(0.5, 0.75, fbm(beta=2.4, seed=seed + 5))
    c = c * (1 - mossk * moss[:, :, None]) + np.array([70, 92, 48], np.float32) * mossk * moss[:, :, None]
    if mud:
        m = sm(0.62 - mud * 0.2, 0.8 - mud * 0.2, fbm(beta=2.2, seed=seed + 6) + 0.3 * (1 - dome)) * 0.9
        mudc = np.array([76, 62, 46], np.float32) * (0.65 + 0.7 * fbm(beta=1.6, seed=seed + 7))[:, :, None]
        ruts = 0.5 + 0.5 * np.sin(np.mgrid[0:N, 0:N][0] / N * 2 * np.pi * 3 + n1 * 3)   # faint wheel ruts along x
        mudc *= (0.85 + 0.2 * ruts)[:, :, None]
        c = c * (1 - m[:, :, None]) + mudc * m[:, :, None]
    return np.clip(c, 0, 255).astype(np.uint8)


def strokes(img, count, seed, colors, lmin, lmax, ang0, ang_var, width=1, alpha=160):
    """short strokes (straw, dead grass) drawn with wrap-around"""
    r = np.random.default_rng(seed)
    big = Image.new('RGBA', (N * 3, N * 3), (0, 0, 0, 0)); d = ImageDraw.Draw(big)
    for _ in range(count):
        x, y = r.uniform(0, N), r.uniform(0, N); a = ang0 + r.normal(0, ang_var); L = r.uniform(lmin, lmax)
        col = tuple(int(v * r.uniform(0.75, 1.2)) for v in colors[r.integers(0, len(colors))]) + (int(alpha * r.uniform(0.6, 1)),)
        dx, dy = np.cos(a) * L, np.sin(a) * L
        for ox in (0, N, 2 * N):
            for oy in (0, N, 2 * N):
                d.line((x + ox, y + oy, x + ox + dx, y + oy + dy), fill=col, width=width)
    lay = big.crop((N, N, 2 * N, 2 * N))
    base = Image.fromarray(img).convert('RGBA'); base.alpha_composite(lay)
    return np.array(base.convert('RGB'))


def v1(name):
    return np.array(Image.open(f'assets/tex/{name}.webp').convert('RGB').resize((N, N), Image.LANCZOS)).astype(np.float32)


def grade(a, mul=(1, 1, 1), sat=1.0, gamma=1.0, add=0):
    g = a.mean(2, keepdims=True); a = g + (a - g) * sat
    a = 255 * np.clip(a / 255, 0, 1) ** gamma
    return np.clip(a * np.array(mul, np.float32)[None, None, :] + add, 0, 255)


def tex_cobble(): return stones(170, 141, relax_it=0, wlo=0.7, whi=1.35)
def tex_cobble2(): return stones(230, 151, relax_it=1, wlo=0.85, whi=1.15, gap0=1.0, gap1=4.5, dome_px=22, flat=0.35, palette=[(120, 122, 130), (132, 128, 124), (108, 110, 120), (140, 136, 132)])
def tex_cobworn(): return strokes(stones(150, 161, relax_it=0, wlo=0.7, whi=1.3, mud=0.6, flat=0.5), 260, 162, [(176, 150, 92), (150, 128, 80)], 8, 22, 0.2, 0.7, 1, 170)
def tex_rubble(): return stones(120, 171, relax_it=1, wlo=0.6, whi=1.5, gap0=2.2, gap1=6.5, dome_px=40, flat=0.25, earth=(150, 142, 128), mossk=0.3, edge=0.82, palette=[(128, 126, 126), (118, 118, 124), (136, 130, 122), (106, 104, 108), (124, 116, 108), (142, 138, 134)])


def tex_thatch():
    yy = np.mgrid[0:N, 0:N][0] / N
    n1 = fbm(beta=2.0, seed=181, aniso=(6.0, 0.6)); n2 = fbm(beta=1.2, seed=182, aniso=(8.0, 0.5)); n3 = fbm(beta=2.4, seed=183)
    course = (yy * 4 + (n3 - 0.5) * 0.22) % 1.0            # 4 overlapping courses, ragged lower edge
    edge = sm(0.0, 0.12, course) * (0.78 + 0.22 * sm(0.1, 0.9, course))
    shade = (0.5 + 0.5 * n1) * (0.7 + 0.45 * n2) * (0.55 + 0.45 * edge)
    c = np.stack([168 * shade, 146 * shade, 96 * shade], 2)
    damp = sm(0.55, 0.8, fbm(beta=2.6, seed=184)); c = c * (1 - 0.35 * damp[:, :, None]) + np.array([70, 76, 56], np.float32) * 0.35 * damp[:, :, None]
    c = strokes(np.clip(c, 0, 255).astype(np.uint8), 2600, 185, [(206, 184, 126), (150, 128, 84), (110, 96, 66)], 14, 46, np.pi / 2, 0.12, 1, 120)
    return c


def tex_soil():
    a = grade(v1('tex_dirt'), (0.92, 0.86, 0.8), 0.8, 1.0)
    n = fbm(beta=2.2, seed=191); a *= (0.8 + 0.4 * n)[:, :, None]
    a = strokes(np.clip(a, 0, 255).astype(np.uint8), 2200, 192, [(176, 156, 92), (140, 122, 70), (110, 100, 60)], 7, 22, -np.pi / 2, 0.9, 1, 220)
    # fallen leaves
    r = np.random.default_rng(193); big = Image.new('RGBA', (N * 3, N * 3), (0, 0, 0, 0)); d = ImageDraw.Draw(big)
    for _ in range(70):
        x, y, s = r.uniform(0, N), r.uniform(0, N), r.uniform(3, 6); col = [(140, 84, 40), (120, 96, 44), (96, 60, 36)][r.integers(0, 3)] + (220,)
        for ox in (0, N, 2 * N):
            for oy in (0, N, 2 * N): d.ellipse((x + ox - s, y + oy - s * 0.55, x + ox + s, y + oy + s * 0.55), fill=col)
    base = Image.fromarray(a).convert('RGBA'); base.alpha_composite(big.crop((N, N, 2 * N, 2 * N)))
    return np.array(base.convert('RGB'))


def tex_cellar():
    a = grade(v1('tex_wet_stone'), (0.8, 0.86, 0.84), 0.35, 1.05)
    streak = sm(0.5, 0.8, fbm(beta=2.2, seed=201, aniso=(5.0, 0.5))); a = a * (1 - 0.5 * streak[:, :, None]) + np.array([30, 46, 34], np.float32) * 0.5 * streak[:, :, None]
    salt = sm(0.72, 0.8, fbm(beta=1.4, seed=202)); a = a * (1 - 0.3 * salt[:, :, None]) + 190 * 0.3 * salt[:, :, None]
    return np.clip(a, 0, 255).astype(np.uint8)


def tex_planks():
    a = np.rot90(v1('tex_wood'), 1).copy(); a = grade(a, (1.25, 1.1, 0.98), 0.9, 0.9)
    n = fbm(beta=2.0, seed=211, aniso=(0.5, 5.0)); a *= (0.82 + 0.36 * n)[:, :, None]
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
    r = np.random.default_rng(212)
    for bx in range(0, N, 64):
        for by in (40, 300):
            x, y = bx + 32 + r.integers(-10, 10), by + r.integers(-8, 8); d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(40, 34, 32)); d.ellipse((x - 2, y - 3, x + 1, y), fill=(120, 96, 80))
    return np.array(im)


def tex_bone(): return np.clip(grade(v1('tex_bone'), (0.86, 0.84, 0.8), 0.7, 1.15), 0, 255).astype(np.uint8)
def tex_bark(): return np.clip(grade(v1('tex_rotwood'), (1.5, 1.38, 1.3), 0.6, 0.85, 8), 0, 255).astype(np.uint8)


def make_tile(path):
    """a painted square that does not quite tile -> tiling: blend with its half-offset copy near the edges, flatten slow brightness drift"""
    a = np.array(Image.open(path).convert('RGB').resize((N, N), Image.LANCZOS)).astype(np.float32)
    low = np.array(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(N / 6))).astype(np.float32)
    a = np.clip(a - low + low.mean((0, 1), keepdims=True), 0, 255)
    b = np.roll(a, (N // 2, N // 2), (0, 1))
    yy, xx = np.mgrid[0:N, 0:N] / N
    d = np.minimum(np.minimum(xx, 1 - xx), np.minimum(yy, 1 - yy))   # distance to the tile edge
    w = sm(0.04, 0.2, d + (fbm(beta=2.0, seed=5) - 0.5) * 0.08)[:, :, None]
    return np.clip(a * w + b * (1 - w), 0, 255).astype(np.uint8)


TEX = {'k_cobble': tex_cobble, 'k_cobble2': tex_cobble2, 'k_cobworn': tex_cobworn, 'k_rubble': tex_rubble, 'k_thatch': tex_thatch, 'k_soil': tex_soil,
       'k_cellar': tex_cellar, 'k_planks': tex_planks, 'k_bone': tex_bone}


def save(name, arr):
    im = Image.fromarray(arr); q = 84; p = os.path.join(OUT, name + '.webp')
    while True:
        im.save(p, 'WEBP', quality=q, method=6)
        if os.path.getsize(p) <= 160 * 1024 or q <= 40: break
        q -= 8
    print(f'{name}: {os.path.getsize(p) // 1024} KB (q{q})')
    return im


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--only'); ap.add_argument('--sheet'); ap.add_argument('--from', dest='src'); ap.add_argument('--name')
    A = ap.parse_args(); ims = {}
    if A.src:
        ims[A.name] = save(A.name, make_tile(A.src))
    else:
        for k, f in TEX.items():
            if A.only and k not in A.only.split(','): continue
            ims[k] = save(k, f())
    if A.sheet:   # 3x3 repeats of each, to judge the tiling by eye
        names = list(ims); S = 384; sheet = Image.new('RGB', (S * min(5, len(names)), S * ((len(names) + 4) // 5)))
        for i, k in enumerate(names):
            t = ims[k].resize((S // 3, S // 3), Image.LANCZOS)
            for a in range(3):
                for b in range(3): sheet.paste(t, ((i % 5) * S + a * (S // 3), (i // 5) * S + b * (S // 3)))
        sheet.save(A.sheet); print('sheet', A.sheet)
