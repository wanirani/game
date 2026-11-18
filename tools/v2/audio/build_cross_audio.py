#!/usr/bin/env python3
"""v2 (3D) — sounds of the bell crossing, synthesized by formula (no recordings). CROSSING lane, 2026-11-18.

  python3 tools/v2/audio/build_cross_audio.py [--out assets/v2/audio] [--wav /tmp/claude-0/v2/cross/wav]

Adds to the bank of build_feel_audio.py (same container, loudness and peak rules; its functions are imported, its files are not rebuilt):
  cross_rush_1       the rush under the passage: wind and a tone climbing for 1.25 s, cut off at its top (the second toll lands there)
  cross_swell_1      one heartbeat of the passage: two low beats and a breath that swells and stops
  cross_tail_past_1  what hangs in the air after arriving in 1697: warm and low (a hum of the big bell, embers)
  cross_tail_now_1   what hangs in the air after arriving tonight: cold and glassy (thin high partials, an icy breath)
  bell_dull_1        the refused crossing: the bell struck with a hand on it — a thud, a short clack, no ring
The entries are merged into index.json (existing entries are left as they are). Each file is far below 60 KB, all five below 250 KB together.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_feel_audio as F  # noqa: E402

B, SR, TAU = F.B, F.SR, F.TAU
tt, place, bp, hp, lp = F.tt, F.place, F.bp, F.hp, F.lp


def cross_rush(name, dur=1.25):
    """wind + a tone that climb together and stop at the top"""
    r = F.rng_for(name)
    t = tt(dur)
    x = t / dur
    y = np.zeros(len(t))
    w = r.standard_normal(len(t))
    pos = 5.2 * x ** 1.15                                   # which band is loudest now (0 = lowest)
    for k, (lo, hi) in enumerate([(180, 420), (380, 800), (720, 1500), (1300, 2600), (2300, 4400), (3900, 7600)]):
        y += bp(w, lo, hi) * np.exp(-((pos - k) / 0.95) ** 2) * (1.0 + 0.25 * k)
    y *= 0.9 * (0.05 + 0.95 * x ** 2.1)
    f = 146.8 * 2 ** (1.75 * x ** 1.5)                     # the tone: D3 climbing an octave and three quarters, with the bell's own rough partial
    ph = TAU * np.cumsum(f) / SR
    trem = 1 + 0.25 * np.sin(TAU * np.cumsum(5 + 13 * x) / SR)
    y += (0.36 * np.sin(ph) + 0.2 * np.sin(2.0 * ph + 1.1) + 0.13 * np.sin(2.51 * ph + 0.4) + 0.08 * np.sin(4.0 * ph)) * trem * (0.03 + 0.97 * x ** 2.6)
    y += 0.3 * np.sin(TAU * np.cumsum(58 + 30 * x) / SR) * x ** 1.6      # weight underneath
    n = int(0.008 * SR)
    y[-n:] *= np.linspace(1, 0, n) ** 2                    # the cut
    return y


def cross_swell(name, dur=0.62):
    """lub-dub and a breath"""
    r = F.rng_for(name)
    y = np.zeros(int(dur * SR))
    for at, g, f0 in [(0.0, 1.0, 92.0), (0.17, 0.72, 78.0)]:
        tl = tt(0.26)
        fq = f0 * (1 + 0.55 * np.exp(-tl / 0.03))
        b = np.sin(TAU * np.cumsum(fq) / SR) * np.exp(-tl / 0.075) + 0.4 * np.sin(2 * TAU * np.cumsum(fq) / SR) * np.exp(-tl / 0.045)
        b += 0.2 * lp(r.standard_normal(len(tl)), 700) * np.exp(-tl / 0.012)
        place(y, g * b, at)
    tl = tt(0.42)
    xb = tl / 0.42
    br = bp(r.standard_normal(len(tl)), 500, 1700) * xb ** 2.4 * (1 - xb ** 14)
    place(y, 0.3 * br, 0.16)
    return y


def cross_tail_past(name, dur=2.4):
    """warm and low"""
    r = F.rng_for(name)
    t = tt(dur)
    y = np.zeros(len(t))
    for ratio, amp, tau in [(0.5, 0.55, 1.0), (1.0, 1.0, 0.8), (1.19, 0.5, 0.62), (1.5, 0.3, 0.5), (2.0, 0.42, 0.4), (3.0, 0.14, 0.26)]:
        f = 110.0 * ratio
        d = 0.0016 + 0.0016 * r.random()
        y += amp * np.exp(-t / (dur * 0.42 * tau)) * (0.6 * np.sin(TAU * f * (1 - d) * t + r.random() * TAU) + 0.4 * np.sin(TAU * f * (1 + d) * t + r.random() * TAU))
    y *= np.minimum(1, t / 0.05)
    y = lp(y, 1500)
    air = lp(r.standard_normal(len(t)), 520) * 0.2 * np.exp(-t / 0.9) * np.minimum(1, t / 0.12)
    y += air
    for _ in range(11):                                     # embers
        at = 0.15 + 1.7 * r.random() ** 1.3
        tl = tt(0.012)
        place(y, 0.1 * (0.4 + r.random()) * hp(r.standard_normal(len(tl)), 1800) * np.exp(-tl / 0.0025), at)
    return y


def cross_tail_now(name, dur=2.4):
    """cold and glassy"""
    r = F.rng_for(name)
    t = tt(dur)
    y = np.zeros(len(t))
    for k, f in enumerate([1174.7, 1760.0, 2349.3, 2794.0, 3520.0, 4435.0, 5274.0]):
        d = 0.0009 + 0.0012 * r.random()
        at = 0.02 + 0.05 * k * r.random()
        e = np.exp(-np.maximum(0, t - at) / (dur * (0.36 - 0.035 * k))) * (t >= at)
        y += (1.0 / (1 + 0.5 * k)) * e * (0.5 * np.sin(TAU * f * (1 - d) * t + r.random() * TAU) + 0.5 * np.sin(TAU * f * (1 + d) * t + r.random() * TAU)) * (0.8 + 0.2 * np.sin(TAU * (2.2 + k * 0.7) * t))
    y += 0.24 * hp(r.standard_normal(len(t)), 5200) * np.exp(-t / 0.6) * np.minimum(1, t / 0.2)      # an icy breath
    y += 0.16 * np.sin(TAU * 587.3 * t) * np.exp(-t / 0.5)                                            # a little body (phone speakers)
    for _ in range(7):                                       # frost ticking
        at = 0.2 + 1.5 * r.random()
        tl = tt(0.03)
        place(y, 0.09 * np.sin(TAU * (5200 + 2600 * r.random()) * tl) * np.exp(-tl / 0.006), at)
    return y


def bell_dull(name, dur=0.8):
    """the bell held by a hand: thud + clack, the ring dies at once"""
    r = F.rng_for(name)
    t = tt(dur)
    y = np.zeros(len(t))
    for ratio, amp, tau in [(0.5, 0.5, 0.12), (1.0, 1.0, 0.085), (1.19, 0.7, 0.06), (2.0, 0.6, 0.04), (2.51, 0.3, 0.03), (4.0, 0.18, 0.018)]:
        f = 146.8 * ratio
        y += amp * np.exp(-t / tau) * np.sin(TAU * f * t + r.random() * TAU)
    fq = 120 * (1 + 0.5 * np.exp(-t / 0.02))
    y += 1.1 * np.sin(TAU * np.cumsum(fq) / SR) * np.exp(-t / 0.07)                # the thud
    y += 0.5 * bp(r.standard_normal(len(t)), 350, 1300) * np.exp(-t / 0.014)       # wood on iron
    y += 0.16 * lp(r.standard_normal(len(t)), 400) * np.exp(-t / 0.2) * np.minimum(1, t / 0.03)   # the air let out
    return lp(y, 3800)


FILES = {
    'cross_rush_1': (lambda: cross_rush('cross_rush_1'), '72k'),
    'cross_swell_1': (lambda: cross_swell('cross_swell_1'), '64k'),
    'cross_tail_past_1': (lambda: cross_tail_past('cross_tail_past_1'), '56k'),
    'cross_tail_now_1': (lambda: cross_tail_now('cross_tail_now_1'), '72k'),
    'bell_dull_1': (lambda: bell_dull('bell_dull_1'), '64k'),
}
SETS = {
    'cross_rush': dict(f=['cross_rush_1'], g=1.0), 'cross_swell': dict(f=['cross_swell_1'], g=1.0),
    'cross_tail_past': dict(f=['cross_tail_past_1'], g=1.0, lazy=1), 'cross_tail_now': dict(f=['cross_tail_now_1'], g=1.0, lazy=1),
    'bell_dull': dict(f=['bell_dull_1'], g=1.0),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(F.ROOT / 'assets' / 'v2' / 'audio'))
    ap.add_argument('--wav', default='')
    a = ap.parse_args()
    out = Path(a.out)
    ixp = out / 'index.json'
    ix = json.loads(ixp.read_text())
    total = 0
    for fid, (fn, br) in FILES.items():
        ceil = F.CEIL
        for _ in range(4):
            y = F.master(fn(), ceil)
            yo = B.to_out(y)
            B.encode(yo, out / fid, 1, br)
            dpk = B.decoded_peak(out / (fid + '.m4a'), 1)
            if dpk <= -1.0:
                break
            ceil -= dpk + 1.0 + 0.15
        if a.wav:
            Path(a.wav).mkdir(parents=True, exist_ok=True)
            B.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(B.OUT_RATE), '-ac', '1', '-i', 'pipe:0', str(Path(a.wav) / (fid + '.wav'))], np.clip(yo, -1, 1).astype(np.float32).tobytes())
        on = np.nonzero(np.abs(yo) > 0.003)[0]
        p = out / (fid + '.m4a')
        ix['files'][fid] = dict(dur=round(len(yo) / B.OUT_RATE, 4), on=round(float(on[0]) / B.OUT_RATE, 4) if len(on) else 0, ch=1,
                                lufs=round(float(B.lufs_ev(y)), 1), lufs_m=round(float(B.lufs_m(y)), 1), peak=round(float(B.true_peak(y)), 2), dpk=round(float(dpk), 2),
                                m4a=B.h8(p), bytes=p.stat().st_size)
        total += p.stat().st_size
        m = ix['files'][fid]
        print(f"{fid:18s} {m['dur']:6.3f}s  ev {m['lufs']:6.1f} LUFS  tp {m['peak']:6.2f}  dpk {m['dpk']:6.2f}  {m['bytes']:6d} B")
    for name, s in SETS.items():
        ix['sfx'][name] = s
        if name not in ix['names']:
            ix['names'].append(name)
    ixp.write_text(json.dumps(ix, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(FILES)} new files, {total} bytes ({total / 1024:.1f} KB) -> {out}')
    bad = [k for k in FILES if ix['files'][k]['dpk'] > -0.95 or ix['files'][k]['bytes'] > 60000]
    if bad or total > 250000:
        print('PEAK OR SIZE OVER:', bad, total)
        sys.exit(1)


if __name__ == '__main__':
    main()
