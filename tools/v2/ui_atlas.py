#!/usr/bin/env python3
"""UI lane: turn the generated emblem images (bright engraved silver / crystal on pure black) into one small atlas.

    python3 tools/v2/ui_atlas.py [--raw /tmp/claude-0/v2/ui/gen/raw] [--preview /tmp/claude-0/v2/ui/atlas_preview.png]

Sources: the raw 1024 px PNGs from the generation jobs (tools/higgsfield/manifest_ui.json) if --raw has them,
otherwise the compact copies kept in tools/v2/ui_src/*.webp (written by this script the first time it sees the raws).
Output: assets/v2/ui/gem/atlas.webp + atlas.json  ({size:[W,H], sprites:{name:[x,y,w,h]}}).

Per image: luminance -> alpha (so the scene shows through the dark parts), colour un-premultiplied, then a baked
dark shade under it (inside the silhouette + a soft halo) so the emblem still reads over a bright lamp.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC_KEEP = os.path.join(ROOT, 'tools', 'v2', 'ui_src')
OUT_DIR = os.path.join(ROOT, 'assets', 'v2', 'ui', 'gem')
SHADE_RGB = np.array([7, 9, 20], dtype=np.float32)

# name: (source file stem, box w, box h, mode)   mode: solid = shade inside the silhouette + halo, line = halo only
SPRITES = [
    ('attack', 'attack_b', 144, 144, 'solid'), ('jump', 'jump', 144, 144, 'solid'), ('roll', 'roll', 144, 144, 'solid'),
    ('guard', 'guard', 144, 144, 'solid'), ('hook', 'skill_hook_b', 144, 144, 'solid'), ('call', 'skill_call', 144, 144, 'solid'),
    ('bell', 'bell_short', 144, 144, 'solid'), ('bell_long', 'bell_long', 144, 144, 'solid'), ('next', 'next_target', 128, 128, 'solid'),
    ('pause', 'pause', 112, 112, 'solid'), ('interact', 'interact', 128, 128, 'solid'),
    ('pouch', 'pouch', 96, 96, 'solid'), ('resume', 'menu_resume', 96, 96, 'solid'), ('settings', 'menu_settings', 96, 96, 'solid'), ('leave', 'menu_leave', 96, 96, 'solid'),
    ('cell', 'res_cell', 52, 108, 'solid'), ('moon', 'moon_full', 96, 96, 'solid'),
    ('night_now', 'night_now', 128, 128, 'solid'), ('night_past', 'night_past', 128, 128, 'solid'),
    ('lock', 'lock_ring', 200, 200, 'line'), ('orn_div', 'orn_divider', 480, 64, 'line'),
    ('orn_boss', 'orn_boss', 420, 120, 'solid'), ('orn_corner', 'orn_corner', 128, 128, 'line'),
]


def load(stem, raw_dir):
    p = os.path.join(raw_dir, stem + '.png') if raw_dir else None
    keep = os.path.join(SRC_KEEP, stem + '.webp')
    if p and os.path.exists(p):
        im = Image.open(p).convert('RGB')
        if not os.path.exists(keep):
            os.makedirs(SRC_KEEP, exist_ok=True)
            k = im.copy(); k.thumbnail((640, 640), Image.LANCZOS); k.save(keep, 'WEBP', quality=93, method=6)
        return im
    if os.path.exists(keep):
        im = Image.open(keep).convert('RGB')
        return im.resize((im.width * 1024 // max(im.size), im.height * 1024 // max(im.size)), Image.LANCZOS)
    sys.exit('missing source image: ' + stem)


def to_rgba(rgb, mode, shade=1.0):
    """rgb: float32 HxWx3 0..255 on black -> straight-alpha RGBA float (0..255, alpha 0..1) with the baked shade."""
    m = rgb.max(axis=2)
    a = np.clip((m - 14.0) / (112.0 - 14.0), 0, 1) ** 0.85
    col = np.clip(rgb / np.maximum(a, 0.22)[..., None], 0, 255)
    s = max(rgb.shape[0], rgb.shape[1]) / 1024.0
    body = a > 0.22
    halo = ndi.gaussian_filter(np.maximum(a, body).astype(np.float32), 11 * s)
    under = np.clip(halo * 1.25, 0, 1) * 0.42
    if mode == 'solid':
        sil = ndi.binary_closing(body, iterations=max(1, int(7 * s)))
        inside = ndi.gaussian_filter(sil.astype(np.float32), 2.2 * s)
        under = np.maximum(under, inside * 0.58)
    under *= shade
    oa = a + under * (1 - a)
    oc = (col * a[..., None] + SHADE_RGB * (under * (1 - a))[..., None]) / np.maximum(oa, 1e-4)[..., None]
    return oc, oa


def trim_fit(col, alpha, bw, bh, pad=2):
    ys, xs = np.where(alpha > 0.035)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([col[y0:y1, x0:x1], alpha[y0:y1, x0:x1, None] * 255]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    k = min((bw - 2 * pad) / im.width, (bh - 2 * pad) / im.height)
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    # premultiplied resize keeps dark fringes away
    arr = np.asarray(im).astype(np.float32); arr[..., :3] *= arr[..., 3:4] / 255.0
    pm = Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA').resize((w, h), Image.LANCZOS)
    arr = np.asarray(pm).astype(np.float32); al = np.maximum(arr[..., 3:4], 1.0)
    arr[..., :3] = np.clip(arr[..., :3] * 255.0 / al, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def candle_parts(raw_dir):
    """candle_lit -> body (holder + wax + wick), flame (with its glow), dead body (cold and dim)."""
    rgb = np.asarray(load('candle_lit', raw_dir)).astype(np.float32)
    m = rgb.max(axis=2)
    wid = (m > 40).sum(axis=1)
    top = int(np.argmax(wid > 0))
    peak = top + int(np.argmax(wid[top:top + 260]))             # widest flame row
    neck = peak + int(np.argmin(wid[peak:peak + 160]))          # narrowest row under the flame = the wick
    cut = neck + 2
    flame = rgb.copy(); flame[cut + 6:] = 0
    fade = np.clip((cut + 6 - np.arange(rgb.shape[0])) / 14.0, 0, 1)[:, None, None]
    flame *= fade
    body = rgb.copy(); body[:cut - 4] = 0
    # the flame's warm spill on the wax stays (lit body); the dead body is grey-blue and dim
    grey = body.mean(axis=2, keepdims=True)
    dead = (grey * np.array([0.50, 0.55, 0.68], dtype=np.float32)).astype(np.float32)
    out = {}
    c, a = to_rgba(body, 'solid'); out['candle'] = trim_fit(c, a, 72, 112)
    c, a = to_rgba(dead, 'solid', 0.9); out['candle_dead'] = trim_fit(c, a, 72, 112)
    mf = flame.max(axis=2); fa = np.clip((mf - 10.0) / 150.0, 0, 1) ** 0.8
    fc = np.clip(flame / np.maximum(fa, 0.2)[..., None], 0, 255)
    out['flame'] = trim_fit(fc, fa, 72, 96, pad=1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', default='/tmp/claude-0/v2/ui/gen/raw')
    ap.add_argument('--preview', default='')
    ap.add_argument('--quality', type=int, default=88)
    args = ap.parse_args()
    raw = args.raw if os.path.isdir(args.raw) else None
    imgs = {}
    for name, stem, bw, bh, mode in SPRITES:
        rgb = np.asarray(load(stem, raw)).astype(np.float32)
        c, a = to_rgba(rgb, mode)
        imgs[name] = trim_fit(c, a, bw, bh)
    imgs.update(candle_parts(raw))
    # an empty gauge cell: the same crystal, cold and dark
    rgb = np.asarray(load('res_cell', raw)).astype(np.float32)
    grey = rgb.mean(axis=2, keepdims=True) * np.array([0.42, 0.46, 0.60], dtype=np.float32)
    c, a = to_rgba(grey.astype(np.float32), 'solid', 0.9); imgs['cell_empty'] = trim_fit(c, a, 52, 108)

    # shelf packing, tallest first
    order = sorted(imgs, key=lambda n: (-imgs[n].height, n))
    W = 1024; x = y = 0; rowh = 0; pos = {}
    for n in order:
        im = imgs[n]
        if x + im.width + 2 > W: x = 0; y += rowh + 2; rowh = 0
        pos[n] = (x, y); x += im.width + 2; rowh = max(rowh, im.height)
    H = y + rowh
    H = (H + 3) // 4 * 4
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    meta = {'size': [W, H], 'sprites': {}}
    for n in order:
        atlas.paste(imgs[n], pos[n]); meta['sprites'][n] = [pos[n][0], pos[n][1], imgs[n].width, imgs[n].height]
    os.makedirs(OUT_DIR, exist_ok=True)
    ap_ = os.path.join(OUT_DIR, 'atlas.webp')
    atlas.save(ap_, 'WEBP', quality=args.quality, method=6, alpha_quality=92)
    with open(os.path.join(OUT_DIR, 'atlas.json'), 'w') as f:
        json.dump(meta, f, separators=(',', ':'), sort_keys=True)
    # the same table as a module, so the game needs one request (the image) and no JSON fetch
    js = ('// GENERATED by tools/v2/ui_atlas.py - do not edit. Sprite rectangles of assets/v2/ui/gem/atlas.webp: name -> [x, y, w, h].\n'
          'export const ATLAS_W = %d, ATLAS_H = %d;\nexport const SPRITES = %s;\n' % (W, H, json.dumps(meta['sprites'], separators=(',', ':'), sort_keys=True)))
    with open(os.path.join(ROOT, 'src', 'v2', 'ui', 'atlas_map.js'), 'w') as f:
        f.write(js)
    print('atlas', W, 'x', H, len(imgs), 'sprites,', os.path.getsize(ap_), 'bytes')
    if args.preview:
        for i, bg in enumerate([(210, 170, 110), (40, 44, 70)]):
            pv = Image.new('RGBA', (W, H), bg + (255,)); pv.alpha_composite(atlas)
            pv.convert('RGB').save(args.preview.replace('.png', f'_{i}.png'))


if __name__ == '__main__':
    main()
