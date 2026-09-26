#!/usr/bin/env python3
"""Finish the tile-texture group (tex_*) once s15-kling.klingai.com is reachable.

- Downloads raws listed in pending_textures.json to /tmp/claude-0/kling_raw/<id>.png
  (skips any raw already present).
- Resizes to 512x512, makes the texture seamless (offset-by-half + minimum-error
  cut through an edge band, feathered; done in x then y with a wrap-constrained cut),
  flattens low-frequency lighting (cyclic Gaussian) so repeats do not show a vignette,
  and writes WebP q82 method=6 to assets/tex/<id>.webp.
- Writes 2x2 tiled previews to /tmp/claude-0/tex_preview/<id>_2x2.png.
- Merges records into tools/kling/manifest.json (re-read right before write, atomic rename).
- Verifies each output opens and is 512x512.

Usage: python3 finish_textures.py [--selftest]
URLs expire ~24h after generation (generated 2026-09-26 ~05:38 UTC).
"""
import json, os, subprocess, sys, time
import numpy as np
from PIL import Image

RAW = "/tmp/claude-0/kling_raw"
PREV = "/tmp/claude-0/tex_preview"
REPO = "/home/user/game"
OUT = os.path.join(REPO, "assets/tex")
MANIFEST = os.path.join(REPO, "tools/kling/manifest.json")
MODEL = "kling-image-v3_0_omni"
SIZE = 512


# ---------------------------------------------------------------- seamless ops
def _gauss_cyclic(a, sigma):
    """Cyclic (wrap-around) Gaussian blur of HxW or HxWxC array via FFT."""
    h, w = a.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    k = np.exp(-2 * (np.pi ** 2) * (sigma ** 2) * (fx ** 2 + fy ** 2))
    if a.ndim == 3:
        k = k[..., None]
    return np.real(np.fft.ifft2(np.fft.fft2(a, axes=(0, 1)) * k, axes=(0, 1)))


def _stair_cut(e, h, wrap=False):
    """Staircase min-cost cut through a band.
    e[i, p]: cost of the cut crossing row i between band columns p-1 and p.
    h[i, p]: cost of the cut running horizontally between rows i-1 and i at column p.
    The cut may move any distance sideways between rows (paying h), so it can follow
    mortar lines / plank joints. Returns pos (L,) with 1 <= pos < W.
    wrap=True forces pos[L-1] == pos[0] (needed for a cyclic direction)."""
    L, W = e.shape
    INF = 1e18
    S = W if wrap else 1
    cost = np.full((S, W), INF)
    if wrap:
        idx = np.arange(1, W)
        cost[idx, idx] = e[0, idx]
    else:
        cost[0, 1:] = e[0, 1:]
    orig = np.zeros((L, S, W), dtype=np.int16)
    base = np.arange(W, dtype=np.int16)
    for i in range(1, L):
        t = cost.copy()
        o = np.broadcast_to(base, (S, W)).copy()
        hi = h[i]
        for p in range(2, W):                 # q < p  (move right)
            c = t[:, p - 1] + hi[p - 1]
            m = c < t[:, p]
            t[m, p] = c[m]; o[m, p] = o[m, p - 1]
        for p in range(W - 2, 0, -1):         # q > p  (move left)
            c = t[:, p + 1] + hi[p]
            m = c < t[:, p]
            t[m, p] = c[m]; o[m, p] = o[m, p + 1]
        t[:, 0] = INF
        cost = t + e[i][None, :]
        orig[i] = o
    if wrap:
        s = int(np.argmin(cost[np.arange(1, W), np.arange(1, W)])) + 1
        p = s
    else:
        s, p = 0, int(np.argmin(cost[0]))
    pos = np.zeros(L, dtype=np.int64)
    for i in range(L - 1, -1, -1):
        pos[i] = p
        if i > 0:
            p = int(orig[i, s, p])
    return pos


def _seam_cost(A, B, eps=0.15):
    """Gradient-aware seam costs (Kwatra et al. 2003) for switching between A and B."""
    d = np.sqrt(((A - B) ** 2).sum(axis=2))
    gxA = np.abs(np.roll(A, -1, 1) - A).sum(2); gxB = np.abs(np.roll(B, -1, 1) - B).sum(2)
    gyA = np.abs(np.roll(A, -1, 0) - A).sum(2); gyB = np.abs(np.roll(B, -1, 0) - B).sum(2)
    # vertical cut segment between (i,p-1) and (i,p)
    e = (np.roll(d, 1, 1) + d) / (eps + np.roll(gxA, 1, 1) + np.roll(gxB, 1, 1)) + 0.02
    # horizontal cut segment between (i-1,p) and (i,p)
    h = (np.roll(d, 1, 0) + d) / (eps + np.roll(gyA, 1, 0) + np.roll(gyB, 1, 0)) + 0.02
    return e, h


def _seam_pass_x(A, band=(10, 138), wrap=False, feather=1.2):
    """Make A horizontally tileable. Edges come from the half-rolled copy B,
    interior from A; the switch follows a min-cost staircase cut in each edge band."""
    H, W, _ = A.shape
    B = np.roll(A, W // 2, axis=1)
    e, h = _seam_cost(A, B)
    b0, b1 = band
    mask = np.ones((H, W))  # 1 -> A, 0 -> B
    xs = np.arange(W)[None, :]
    # left band: columns < cut come from B
    pl = _stair_cut(e[:, b0:b1], h[:, b0:b1], wrap=wrap) + b0
    mask[xs < pl[:, None]] = 0.0
    # right band, mirrored so the band grows from the edge inward: columns >= cut from B
    er = e[:, W - b1 + 1:W - b0 + 1][:, ::-1]
    hr = h[:, W - b1:W - b0][:, ::-1]
    pr = W - (_stair_cut(er, hr, wrap=wrap) + b0)
    mask[xs >= pr[:, None]] = 0.0
    if feather > 0:
        mask = np.clip(_gauss_cyclic(mask, feather), 0, 1)
    return mask[..., None] * A + (1 - mask[..., None]) * B


def _flatten(R, sigma, strength, cyclic):
    lum = R @ np.array([0.299, 0.587, 0.114])
    if cyclic:
        low = _gauss_cyclic(lum, sigma)
    else:
        pad = int(3 * sigma)
        low = _gauss_cyclic(np.pad(lum, pad, mode="reflect"), sigma)[pad:-pad, pad:-pad]
    ratio = (lum.mean() + 1e-3) / (low + 1e-3)
    ratio = np.clip(1.0 + strength * (ratio - 1.0), 0.5, 2.0)
    return np.clip(R * ratio[..., None], 0, 1)


def make_seamless(img):
    A = np.asarray(img.convert("RGB"), dtype=np.float64) / 255.0
    A = _flatten(A, 56.0, 0.7, cyclic=False)              # remove vignette / lighting gradient
    C = _seam_pass_x(A, wrap=False)                       # horizontal seams
    D = _seam_pass_x(C.transpose(1, 0, 2), wrap=True)     # vertical seams, cyclic cut
    R = D.transpose(1, 0, 2)
    R = _flatten(R, 64.0, 0.35, cyclic=True)              # mild, keeps seamlessness
    return Image.fromarray((R * 255.0 + 0.5).astype(np.uint8), "RGB")


def edge_seam_score(img):
    """Mean abs diff across the wrap edges vs. across interior neighbours (1.0 ~ seamless)."""
    a = np.asarray(img.convert("RGB"), dtype=np.float64)
    wrap = (np.abs(a[:, 0] - a[:, -1]).mean() + np.abs(a[0] - a[-1]).mean()) / 2
    inner = (np.abs(np.diff(a, axis=1)).mean() + np.abs(np.diff(a, axis=0)).mean()) / 2
    return wrap / max(inner, 1e-6)


def tiled_preview(img, n=2):
    w, h = img.size
    t = Image.new("RGB", (w * n, h * n))
    for i in range(n):
        for j in range(n):
            t.paste(img, (i * w, j * h))
    return t


