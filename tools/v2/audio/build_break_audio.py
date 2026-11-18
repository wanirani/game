#!/usr/bin/env python3
"""v2 (3D) — sounds of breakables, synthesized by formula (no recordings). BREAK lane, 2026-11-18.

  python3 tools/v2/audio/build_break_audio.py [--out assets/v2/audio] [--wav /tmp/claude-0/v2/break/wav]

Adds to the bank of build_feel_audio.py (same container, loudness and peak rules; its functions are imported, its files are not rebuilt):
  clay_crash_1..4   a jar breaking: the snap, the hollow knock of the vessel, the bright ring of fired clay, shards scattering on stone
  clay_tinkle_1..3  only the shards scattering (layered late with a random start, so no two breaks tail off alike)
  wood_crack_1..3   boards splitting: two cracks, a low knock, splinters
  wood_clatter_1..3 boards landing on stone
  hoop_ring_1..2    an iron hoop struck, bouncing and rolling to rest
  coin_clink_1..3   a small silver coin touching stone
The entries are merged into index.json (existing entries are left as they are).
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


def tink(r, f, dur, bright=1.0):
    """one shard touching stone: a few inharmonic partials of a small plate, gone in tens of ms, with the click of the contact"""
    tl = tt(dur)
    y = np.zeros(len(tl))
    for k, (ratio, g) in enumerate([(1.0, 1.0), (1.47 + 0.2 * r.random(), 0.6), (2.31 + 0.3 * r.random(), 0.42), (3.9 + 0.5 * r.random(), 0.25 * bright)]):
        if f * ratio > 18000:
            continue
        y += g * np.sin(TAU * f * ratio * tl + r.random() * TAU) * np.exp(-tl / (dur * (0.2 / (1 + 0.55 * k))))
    y += 0.45 * hp(r.standard_normal(len(tl)), 3200) * np.exp(-tl / 0.0022)
    return y


def scatter(r, y, t0, t1, n, lo=1700, hi=5600, gain=1.0):
    """n shards landing between t0 and t1 (most of them early), some bouncing once or twice more"""
    for _ in range(n):
        at = t0 + (r.random() ** 1.6) * (t1 - t0)
        f = lo * (hi / lo) ** r.random()
        g = gain * (0.3 + 0.7 * r.random()) * (1 - (at - t0) / (t1 - t0 + 0.12)) ** 1.2
        d = 0.03 + 0.05 * r.random()
        place(y, g * tink(r, f, d), at)
        hop, gg = 0.05 + 0.06 * r.random(), g
        for _b in range(int(r.integers(0, 3))):
            at += hop
            hop *= 0.58
            gg *= 0.5
            place(y, gg * tink(r, f * (1 + 0.03 * (r.random() - 0.5)), d * 0.8), at)


def clay_crash(name, f0, dur=0.66):
    r = F.rng_for(name)
    y = np.zeros(int(dur * SR))
    # the snap, and the dry clack of the wall giving way (fired clay is damped: this, not a long ring, is what says "pot")
    ts = tt(0.03)
    place(y, 0.8 * hp(r.standard_normal(len(ts)), 1300) * np.exp(-ts / 0.003), 0)
    tc = tt(0.09)
    place(y, 1.25 * bp(r.standard_normal(len(tc)), 650, 3200) * np.exp(-tc / 0.015), 0.0005)
    # the hollow knock of the vessel: a short low "tok" that drops a little, with its second mode
    tb = tt(0.14)
    fb = 380 + 190 * r.random()
    place(y, 1.5 * np.sin(TAU * (fb * tb - 0.8 * fb * tb * tb)) * np.exp(-tb / 0.03) + 0.7 * np.sin(TAU * fb * 2.3 * tb) * np.exp(-tb / 0.017)
          + 0.5 * bp(r.standard_normal(len(tb)), 250, 900) * np.exp(-tb / 0.03), 0.001)
    # the bright ring of the glazed wall, short
    tr = tt(0.2)
    ring = np.zeros(len(tr))
    for k, ratio in enumerate([1.0, 1.31, 1.83, 2.41, 3.17, 4.3]):
        ring += (0.9 / (1 + 0.5 * k)) * np.sin(TAU * f0 * ratio * (1 + 0.01 * (r.random() - 0.5)) * tr + r.random() * TAU) * np.exp(-tr / (0.05 / (1 + 0.4 * k)))
    place(y, 0.75 * ring, 0.002)
    # big pieces first, then the small ones raining down
    scatter(r, y, 0.03, 0.2, 6, 850, 2500, 1.0)
    scatter(r, y, 0.1, dur - 0.14, 10 + int(r.integers(0, 5)), 1600, 5200, 0.62)
    t = tt(dur)
    y[:len(t)] += 0.14 * bp(r.standard_normal(len(t)), 1500, 6000) * np.exp(-t / 0.11) * np.minimum(1, t / 0.003)
    return y


def clay_tinkle(name, dur=0.56):
    r = F.rng_for(name)
    y = np.zeros(int(dur * SR))
    scatter(r, y, 0.0, dur - 0.14, 11 + int(r.integers(0, 5)), 1500, 5400, 0.9)
    t = tt(dur)
    y[:len(t)] += 0.08 * bp(r.standard_normal(len(t)), 2500, 7000) * np.exp(-t / 0.14)
    return y


def wood_crack(name, dur=0.4):
    r = F.rng_for(name)
    y = np.zeros(int(dur * SR))
    for at, g in [(0.0, 1.0), (0.022 + 0.02 * r.random(), 0.62), (0.07 + 0.04 * r.random(), 0.35)]:
        tc = tt(0.06)
        place(y, g * (bp(r.standard_normal(len(tc)), 650, 3600) * np.exp(-tc / 0.011) + 0.5 * hp(r.standard_normal(len(tc)), 4000) * np.exp(-tc / 0.003)), at)
    tb = tt(0.16)
    fb = 140 + 90 * r.random()
    place(y, 0.9 * np.sin(TAU * fb * tb) * np.exp(-tb / 0.035) + 0.5 * np.sin(TAU * fb * 2.76 * tb) * np.exp(-tb / 0.02), 0.002)
    for _ in range(12 + int(r.integers(0, 6))):   # splinters
        at = 0.01 + (r.random() ** 1.5) * 0.2
        tc = tt(0.006 + 0.006 * r.random())
        place(y, (0.2 + 0.4 * r.random()) * bp(r.standard_normal(len(tc)), 1500, 7000) * np.exp(-tc / 0.0018), at)
    return y


def knock(r, f, dur):
    """a board on stone: the first modes of a free bar, dry"""
    tl = tt(dur)
    y = np.zeros(len(tl))
    for k, (ratio, g) in enumerate([(1.0, 1.0), (2.76, 0.5), (5.4, 0.28)]):
        y += g * np.sin(TAU * f * ratio * tl + r.random() * TAU) * np.exp(-tl / (dur * (0.24 / (1 + 0.7 * k))))
    y += 0.5 * bp(r.standard_normal(len(tl)), 900, 5000) * np.exp(-tl / 0.004)
    return y


def wood_clatter(name, dur=0.56):
    r = F.rng_for(name)
    y = np.zeros(int(dur * SR))
    for _ in range(6 + int(r.integers(0, 4))):
        at = (r.random() ** 1.3) * (dur - 0.14)
        f = 260 + 620 * r.random()
        g = (0.4 + 0.6 * r.random()) * (1 - at / dur) ** 1.1
        place(y, g * knock(r, f, 0.07 + 0.06 * r.random()), at)
        if r.random() < 0.6:
            place(y, 0.45 * g * knock(r, f * 1.04, 0.06), at + 0.06 + 0.05 * r.random())
    return y


def hoop_ring(name, f0, dur=0.95):
    r = F.rng_for(name)
    y = np.zeros(int(dur * SR))
    hits = [(0.0, 1.0), (0.2 + 0.07 * r.random(), 0.5), (0.36 + 0.06 * r.random(), 0.3), (0.47 + 0.04 * r.random(), 0.2)]
    for at, g in hits:
        tl = tt(dur - at)
        s = np.zeros(len(tl))
        for k, ratio in enumerate([1.0, 2.32, 3.9, 5.7, 7.9]):
            s += (1.0 / (1 + 0.45 * k)) * np.sin(TAU * f0 * ratio * (1 + 0.004 * (r.random() - 0.5)) * tl + r.random() * TAU) * np.exp(-tl / (0.3 / (1 + 0.6 * k)))
        s += 0.6 * hp(r.standard_normal(len(tl)), 2500) * np.exp(-tl / 0.003)
        place(y, g * s, at)
    t = tt(dur)
    wob = 1 - 0.35 * np.clip((t - 0.45) / 0.4, 0, 1) * (0.5 + 0.5 * np.sin(TAU * (9 * t + 14 * t * t)))   # rolling to rest: the wobble speeds up
    return y[:len(t)] * wob


def coin_clink(name, f0, dur=0.2):
    r = F.rng_for(name)
    tl = tt(dur)
    y = np.zeros(len(tl))
    for k, ratio in enumerate([1.0, 1.52, 2.26, 2.9]):
        y += (1.0 / (1 + 0.6 * k)) * np.sin(TAU * f0 * ratio * tl + r.random() * TAU) * np.exp(-tl / (0.05 / (1 + 0.35 * k)))
    y += 0.4 * hp(r.standard_normal(len(tl)), 5000) * np.exp(-tl / 0.0015)
    return y


FILES = {
    'clay_crash_1': lambda: clay_crash('clay_crash_1', 1010), 'clay_crash_2': lambda: clay_crash('clay_crash_2', 1240),
    'clay_crash_3': lambda: clay_crash('clay_crash_3', 1120, 0.6), 'clay_crash_4': lambda: clay_crash('clay_crash_4', 1370, 0.7),
    'clay_tinkle_1': lambda: clay_tinkle('clay_tinkle_1'), 'clay_tinkle_2': lambda: clay_tinkle('clay_tinkle_2', 0.5), 'clay_tinkle_3': lambda: clay_tinkle('clay_tinkle_3', 0.62),
    'wood_crack_1': lambda: wood_crack('wood_crack_1'), 'wood_crack_2': lambda: wood_crack('wood_crack_2'), 'wood_crack_3': lambda: wood_crack('wood_crack_3', 0.36),
    'wood_clatter_1': lambda: wood_clatter('wood_clatter_1'), 'wood_clatter_2': lambda: wood_clatter('wood_clatter_2', 0.5), 'wood_clatter_3': lambda: wood_clatter('wood_clatter_3', 0.6),
    'hoop_ring_1': lambda: hoop_ring('hoop_ring_1', 690), 'hoop_ring_2': lambda: hoop_ring('hoop_ring_2', 820, 0.85),
    'coin_clink_1': lambda: coin_clink('coin_clink_1', 4700), 'coin_clink_2': lambda: coin_clink('coin_clink_2', 5600), 'coin_clink_3': lambda: coin_clink('coin_clink_3', 5100),
}
SETS = {
    'clay_crash': dict(f=['clay_crash_1', 'clay_crash_2', 'clay_crash_3', 'clay_crash_4'], g=1.0), 'clay_tinkle': dict(f=['clay_tinkle_1', 'clay_tinkle_2', 'clay_tinkle_3'], g=1.0),
    'wood_crack': dict(f=['wood_crack_1', 'wood_crack_2', 'wood_crack_3'], g=1.0), 'wood_clatter': dict(f=['wood_clatter_1', 'wood_clatter_2', 'wood_clatter_3'], g=1.0),
    'hoop_ring': dict(f=['hoop_ring_1', 'hoop_ring_2'], g=1.0), 'coin_clink': dict(f=['coin_clink_1', 'coin_clink_2', 'coin_clink_3'], g=1.0),
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
    for fid, fn in FILES.items():
        ceil = F.CEIL
        for _ in range(4):
            y = F.master(fn(), ceil)
            yo = B.to_out(y)
            B.encode(yo, out / fid, 1, None)
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
        print(f"{fid:16s} {m['dur']:6.3f}s  ev {m['lufs']:6.1f} LUFS  tp {m['peak']:6.2f}  dpk {m['dpk']:6.2f}  {m['bytes']:6d} B")
    for name, s in SETS.items():
        ix['sfx'][name] = s
        if name not in ix['names']:
            ix['names'].append(name)
    ixp.write_text(json.dumps(ix, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(FILES)} new files, {total} bytes ({total / 1024:.1f} KB) -> {out}')
    bad = [k for k in FILES if ix['files'][k]['dpk'] > -0.95]
    if bad:
        print('PEAK OVER:', bad)
        sys.exit(1)


if __name__ == '__main__':
    main()
