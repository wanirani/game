#!/usr/bin/env python3
"""PROPS lane: texture of a generated prop model, re-baked for the game camera (docs/v2/ENV_KIT.md 16). Called by tools/v2/world_props_bake.mjs.
   python3 -I tools/v2/world_glb_prep.py <job.json>
 The game camera only ever sees a prop from the front (13..29 degrees down) and a little from the sides. So instead of the model's own
 UV sheet (most of it spent on faces the camera never sees) the cell holds three orthographic pictures of the FULL-detail model:
   front (24 deg down) | left side | right side (65 deg yaw, half scale)
 and every triangle of the decimated model takes its texels from the picture it faces. Result: about 3x the texels on what is seen.
 job = { pitch, yaw, sideScale, budget (texels for all items), items: [{ id, in, tex, png, out, px, lum, sat, gainMax, emis, emisFrac }] }
 in  = { full: { pos, uv, idx }, low: { pos, idx } }   (game axes, world units, feet at y = 0; winding: cross(b-a, c-a) = outward)
 out = { w, h, pos, nrm, uv, e, idx, gain, k }          (uv 0..1 inside the cell, e = 1 where the surface glows)
"""
import sys, json, math, io
import numpy as np
from PIL import Image

SS = 2


def view(yaw, pitch):
    y, p = math.radians(yaw), math.radians(pitch)
    toward = np.array([math.sin(y) * math.cos(p), math.sin(p), -math.cos(y) * math.cos(p)]); right = np.array([math.cos(y), 0.0, math.sin(y)])
    return np.array([right, np.cross(right, toward), toward])


def raster(Q, UV, T, tex, x0, y1, sc, w, h):
    """Q = view-space verts (right, up, toward). picture w x h, texel = 1/sc units. nearest surface wins."""
    img = np.zeros((h, w, 3), np.float32); zb = np.full((h, w), -1e9); hit = np.zeros((h, w), bool)
    sx = (Q[:, 0] - x0) * sc; sy = (y1 - Q[:, 1]) * sc; sz = Q[:, 2]; th, tw = tex.shape[:2]
    for a, b, c in T:
        ax, ay, bx, by, cx, cy = sx[a], sy[a], sx[b], sy[b], sx[c], sy[c]
        area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
        if area <= 1e-9: continue                       # view basis is mirrored and screen y is down: front faces have positive area
        xa = max(0, int(math.floor(min(ax, bx, cx)))); xb = min(w - 1, int(math.ceil(max(ax, bx, cx))))
        ya = max(0, int(math.floor(min(ay, by, cy)))); yb = min(h - 1, int(math.ceil(max(ay, by, cy))))
        if xa > xb or ya > yb: continue
        gx, gy = np.meshgrid(np.arange(xa, xb + 1) + 0.5, np.arange(ya, yb + 1) + 0.5)
        w1 = ((gx - ax) * (cy - ay) - (cx - ax) * (gy - ay)) / area; w2 = ((bx - ax) * (gy - ay) - (gx - ax) * (by - ay)) / area; w0 = 1 - w1 - w2
        m = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not m.any(): continue
        z = w0 * sz[a] + w1 * sz[b] + w2 * sz[c]; zr = zb[ya:yb + 1, xa:xb + 1]; m &= z > zr
        if not m.any(): continue
        u = w0 * UV[a, 0] + w1 * UV[b, 0] + w2 * UV[c, 0]; v = w0 * UV[a, 1] + w1 * UV[b, 1] + w2 * UV[c, 1]
        tx = np.clip((u * tw).astype(np.int64), 0, tw - 1); ty = np.clip((v * th).astype(np.int64), 0, th - 1)
        zr[m] = z[m]; img[ya:yb + 1, xa:xb + 1][m] = tex[ty, tx][m]; hit[ya:yb + 1, xa:xb + 1][m] = True
    return img, hit


def fill(img, hit, passes=24):
    """bleed colour into the empty texels (mip levels and edges sample them)"""
    img = img.copy(); hit = hit.copy()
    for _ in range(passes):
        if hit.all(): break
        acc = np.zeros_like(img); n = np.zeros(hit.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            s = np.roll(img * hit[..., None], (dy, dx), (0, 1)); k = np.roll(hit, (dy, dx), (0, 1)).astype(np.float32)
            if dy == 1: s[0] = 0; k[0] = 0
            if dy == -1: s[-1] = 0; k[-1] = 0
            if dx == 1: s[:, 0] = 0; k[:, 0] = 0
            if dx == -1: s[:, -1] = 0; k[:, -1] = 0
            acc += s; n += k
        new = (~hit) & (n > 0); img[new] = acc[new] / n[new][:, None]; hit |= new
    if not hit.all(): img[~hit] = img[hit].mean(0) if hit.any() else 90
    return img


def glow(c):
    """does this colour glow (flame, coal, candle-lit glass)? c = raw source colour 0..255"""
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    return (r > 120) & (r - b > 62) & (r > g * 1.12)


def main():
    job = json.load(open(sys.argv[1])); V = [view(0, job['pitch']), view(-job['yaw'], job['pitch']), view(job['yaw'], job['pitch'])]
    items = []
    for it in job['items']:
        D = json.load(open(it['in'])); F = D['full']; L = D['low']
        fp = np.array(F['pos'], np.float64).reshape(-1, 3); fuv = np.array(F['uv'], np.float64).reshape(-1, 2); ft = np.array(F['idx'], np.int64).reshape(-1, 3)
        lp = np.array(L['pos'], np.float64).reshape(-1, 3); lt = np.array(L['idx'], np.int64).reshape(-1, 3)
        both = np.vstack([fp, lp]); boxes = []
        for vi, R in enumerate(V):
            Q = both @ R.T; boxes.append((Q[:, 0].min(), Q[:, 0].max(), Q[:, 1].min(), Q[:, 1].max()))
        items.append(dict(it=it, fp=fp, fuv=fuv, ft=ft, lp=lp, lt=lt, boxes=boxes))
    PADV = 3
    def cell(I, k):
        sizes = []
        for vi, (x0, x1, y0, y1) in enumerate(I['boxes']):
            sc = I['it']['px'] * k * (1.0 if vi == 0 else job['sideScale']); sizes.append((int(math.ceil((x1 - x0) * sc)) + 2 * PADV, int(math.ceil((y1 - y0) * sc)) + 2 * PADV, sc))
        return sizes
    def layout(sizes):
        """front picture on the left; the two side pictures stacked to its right when they fit under each other, else next to each other"""
        (wf, hf, _), (wl, hl, _), (wr, hr, _) = sizes
        if hl + hr <= hf: return [(0, 0), (wf, 0), (wf, hl)], wf + max(wl, wr), hf
        return [(0, 0), (wf, 0), (wf + wl, 0)], wf + wl + wr, max(hf, hl, hr)
    k = 1.0
    for _ in range(60):
        tot = 0
        for I in items: _, W, H = layout(cell(I, k)); tot += (W + 8) * (H + 8)
        if tot <= job['budget']: break
        k *= 0.985
    for I in items:
        it = I['it']; sizes = cell(I, k); offs, W, H = layout(sizes)
        tex = np.asarray(Image.open(it['tex']).convert('RGB'), np.float32)
        pic = np.zeros((H, W, 3), np.float32); mask = np.zeros((H, W), bool)
        for vi, R in enumerate(V):
            w, h, sc = sizes[vi]; x0, x1, y0, y1 = I['boxes'][vi]; xo, yo = offs[vi]
            img, hit = raster(I['fp'] @ R.T, I['fuv'], I['ft'], tex, x0 - PADV / sc, y1 + PADV / sc, sc * SS, w * SS, h * SS)
            cnt = hit.reshape(h, SS, w, SS).sum((1, 3)); col = (img * hit[..., None]).reshape(h, SS, w, SS, 3).sum((1, 3)) / np.maximum(1, cnt)[..., None]
            pic[yo:yo + h, xo:xo + w] = col; mask[yo:yo + h, xo:xo + w] = cnt > 0
        raw = fill(pic, mask)
        # brightness: the generated sheets are dark; lift the median of the front picture to the wanted level (flames may clip)
        fw, fh = sizes[0][0], sizes[0][1]; fm = mask[0:fh, 0:fw]; lum = (raw[0:fh, 0:fw] @ np.array([0.3, 0.59, 0.11]))[fm]
        gain = float(np.clip(it.get('lum', 104) / max(1.0, np.median(lum)), 1.0, it.get('gainMax', 3.4))) if lum.size else 1.0
        hot = glow(raw); sat = it.get('sat', 1.0)
        if sat != 1.0:   # pull the colours toward grey (mossy greens and orange wood shout in the cold night scenes); glowing texels keep theirs
            grey = (raw @ np.array([0.3, 0.59, 0.11]))[..., None]; cool = grey + (raw - grey) * sat; raw2 = np.where(hot[..., None], raw, cool)
        else: raw2 = raw
        g = raw2 * gain
        if it.get('emis'): g[hot] = np.maximum(g[hot], np.minimum(255, raw[hot] * max(gain, 1.25)))
        out = np.minimum(255, g)
        Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save(it['png'])
        # low model: per-corner normals (smooth inside 52 degrees), a picture per triangle, vertices split per (picture, glow, normal)
        lp, lt = I['lp'], I['lt']; e1 = lp[lt[:, 1]] - lp[lt[:, 0]]; e2 = lp[lt[:, 2]] - lp[lt[:, 0]]; fn = np.cross(e1, e2); ar = np.linalg.norm(fn, axis=1); fnu = fn / np.maximum(1e-12, ar)[:, None]
        inc = [[] for _ in range(len(lp))]
        for ti, tri in enumerate(lt):
            for v in tri: inc[v].append(ti)
        score = np.stack([fnu @ V[0][2] + 0.22, fnu @ V[1][2], fnu @ V[2][2]], 1); pick = score.argmax(1); pick[score.max(1) < 0] = 0
        verts = {}; P = []; N = []; UV = []; E = []; T = []; cos_lim = math.cos(math.radians(52))
        for ti, tri in enumerate(lt):
            vi = int(pick[ti]); R = V[vi]; w, h, sc = sizes[vi]; x0, x1, y0, y1 = I['boxes'][vi]
            Q = lp[tri] @ R.T; px = (Q[:, 0] - x0) * sc + PADV + offs[vi][0]; py = (y1 - Q[:, 1]) * sc + PADV + offs[vi][1]
            em = 0
            if it.get('emis'):
                bc = np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1], [.5, .5, 0], [0, .5, .5], [.5, 0, .5], [1 / 3, 1 / 3, 1 / 3], [.6, .2, .2], [.2, .6, .2], [.2, .2, .6]])
                sxp = np.clip((bc @ px).astype(int), 0, W - 1); syp = np.clip((bc @ py).astype(int), 0, H - 1)
                em = 1 if glow(raw[syp, sxp]).mean() >= it.get('emisFrac', 0.5) else 0
            out_i = []
            for c in range(3):
                v = int(tri[c]); n = np.zeros(3)
                for tj in inc[v]:
                    if fnu[tj] @ fnu[ti] >= cos_lim: n += fn[tj]
                n /= max(1e-12, np.linalg.norm(n)); key = (v, vi, em, int(round(n[0] * 20)), int(round(n[1] * 20)), int(round(n[2] * 20)))
                j = verts.get(key)
                if j is None:
                    j = len(P); verts[key] = j; P.append(lp[v]); N.append(n); UV.append((px[c] / W, py[c] / H)); E.append(em)
                out_i.append(j)
            T.append(out_i)
        r4 = lambda A: [round(float(x), 4) for x in np.asarray(A).reshape(-1)]
        ga = [round(float(x), 1) for x in np.asarray(P)[np.asarray(E) > 0].mean(0)] if any(E) else None
        json.dump(dict(w=W, h=H, glowAt=ga, pos=r4(P), nrm=r4(N), uv=[round(float(x), 5) for x in np.asarray(UV).reshape(-1)], e=E, idx=[int(x) for x in np.asarray(T).reshape(-1)], gain=round(gain, 3), k=round(k, 3), glowTris=int(sum(1 for t in T if E[t[0]]))), open(it['out'], 'w'))
        print(f"  prep {it['id']:12s} cell {W}x{H} (front {sizes[0][0]}x{sizes[0][1]} at {sizes[0][2]:.2f} px/unit) gain {gain:.2f} verts {len(P)} tris {len(T)}" + (f" glow tris {sum(1 for t in T if E[t[0]])}" if it.get('emis') else ''))


main()
