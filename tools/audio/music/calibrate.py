#!/usr/bin/env python3
# GM 프로그램별 음량 보정표 — 각 프로그램을 대표 음역의 시험 음(벨로시티 114, CC7 127, 잔향 없음)으로 렌더해
# K-가중 평균 음량(dB)을 잰다. 빌드는 채널 음량을 vol × 10^(−L/20) 에 비례하게 맞춘다
# (게임 신스의 inst.norm 이 악기별 음량을 고르게 맞춘 것과 같은 역할).
# 사용: python3 tools/audio/music/calibrate.py  → tools/audio/music/gm_calib.json
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import fsynth, dsp
from scipy import signal

SR = 44100
KEYS = {
    0: [48, 55, 60, 64, 67, 72], 6: [55, 60, 64, 67, 72, 76], 8: [72, 76, 79, 84], 10: [72, 76, 79, 84], 14: [60, 64, 67, 72],
    19: [48, 55, 60, 64, 67], 29: [48, 55, 60], 30: [48, 55, 60], 32: [33, 36, 40, 43], 33: [33, 36, 40, 43], 35: [33, 36, 40, 43],
    40: [67, 72, 76, 79], 41: [60, 64, 67, 72], 42: [48, 52, 55, 60], 45: [55, 60, 64, 67], 47: [38, 41, 43, 45],
    48: [55, 60, 64, 67, 72], 49: [55, 60, 64, 67, 72], 52: [60, 64, 67, 72], 53: [60, 64, 67, 72],
    56: [65, 69, 72, 76], 57: [48, 52, 55, 58], 60: [53, 57, 60, 64], 61: [57, 60, 64, 67],
    68: [67, 72, 76], 70: [43, 48, 52], 71: [60, 64, 67], 73: [72, 76, 79], 110: [67, 72, 76], 113: [72, 76], 116: [36, 38],
}
DRUMKITS = [0, 16, 48]
NOTE, GAP = 0.8, 0.4

def kw(x):
    (b1, a1), (b2, a2) = dsp._kfilter(SR)
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x.astype(np.float64), axis=0), axis=0)

def measure_prog(prog):
    keys = KEYS[prog]; ev = [(0, 'prog', 0, 0, prog), (0, 'cc', 0, 7, 127), (0, 'cc', 0, 91, 0), (0, 'cc', 0, 93, 0), (0, 'cc', 0, 10, 64), (0, 'cc', 0, 11, 127)]
    st = []
    for i, k in enumerate(keys):
        s0 = int(SR * (0.1 + i * (NOTE + GAP))); st.append(s0)
        ev += [(s0, 'on', 0, k, 114), (s0 + int(SR * NOTE), 'off', 0, k, 0)]
        if prog in (29, 30):  # 파워코드로 측정 (게임 gtr 은 pow 보이싱)
            ev += [(s0, 'on', 0, k + 7, 97), (s0 + int(SR * NOTE), 'off', 0, k + 7, 0), (s0, 'on', 0, k + 12, 97), (s0 + int(SR * NOTE), 'off', 0, k + 12, 0)]
    y = kw(fsynth.render_events(ev, int(SR * (0.2 + len(keys) * (NOTE + GAP) + 1)), reverb=False, chorus=False))
    p = [np.mean(np.sum(y[s:s + int(SR * NOTE)] ** 2, axis=1)) for s in st]
    return float(10 * np.log10(np.mean(p) + 1e-15))

def measure_kit(kit):
    ev = [(0, 'prog', 9, 128, kit), (0, 'cc', 9, 7, 127), (0, 'cc', 9, 91, 0), (0, 'cc', 9, 93, 0)]
    step = SR * 60 / 120 / 2  # 120 bpm 8분
    for i in range(32):
        s = int(SR * 0.1 + i * step)
        if i % 4 == 0: ev += [(s, 'on', 9, 36, 114)]
        if i % 4 == 2: ev += [(s, 'on', 9, 38, 114)]
        ev += [(s, 'on', 9, 42, 90)]
    y = kw(fsynth.render_events(ev, int(SR * 0.1 + 32 * step + SR)))
    seg = y[int(SR * 0.1): int(SR * 0.1 + 32 * step)]
    return float(10 * np.log10(np.mean(np.sum(seg ** 2, axis=1)) + 1e-15))

if __name__ == '__main__':
    out = {str(p): round(measure_prog(p), 2) for p in KEYS}
    for k in DRUMKITS: out['d%d' % k] = round(measure_kit(k), 2)
    path = os.path.join(os.path.dirname(__file__), 'gm_calib.json')
    json.dump(out, open(path, 'w'), indent=1)
    for k, v in out.items(): print(k, v)
