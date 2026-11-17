#!/usr/bin/env python3
"""v2(3D 판) 타격감 소리 — 새 샘플 빌드. 전부 이 스크립트가 수식으로 합성한다 (외부 녹음 소재 없음).

  python3 tools/v2/audio/build_feel_audio.py [--out assets/v2/audio] [--only bell_mid,ui_ok] [--wav /dev/shm/soundfeel/wav]

  v1 고급 효과음(assets/audio/sfx_v2)과 같은 그릇·크기 규칙을 쓴다 (tools/audio/sfx_v2/build_sfx_v2.py 의 함수를 그대로 불러 씀):
    · 44.1 kHz 모노 AAC-LC .m4a (96 kbps; 긴 종소리는 80 kbps), 30 Hz 아래 정리
    · 사건 라우드니스(lufs_ev) -16 LUFS, 트루 피크 ≤ -1 dBTP, 인코딩한 파일을 다시 풀어 잰 피크(dpk)도 ≤ -1 dBFS
    · index.json = v1 V2Bank 형식 { version, rate, formats, names, sfx:{이름:{f:[id], g, vr?, lazy?}}, files:{id:{dur,on,ch,lufs,lufs_m,peak,dpk,m4a,bytes}} }
  난수는 이름으로 씨를 정해 다시 빌드해도 같은 소리가 나온다.
"""
import argparse
import json
import sys
import zlib
from pathlib import Path

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools' / 'audio' / 'sfx_v2'))
import build_sfx_v2 as B  # noqa: E402  (읽기 전용: 라우드니스·피크·인코딩 함수)

SR = B.SR            # 48 kHz 작업
TARGET, CEIL = B.TARGET, B.CEIL
TAU = 2 * np.pi


def rng_for(name):
    return np.random.default_rng(zlib.crc32(name.encode()))


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def env_exp(t, tau, a=0.0015):
    return np.minimum(1.0, t / a) * np.exp(-t / tau)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'highpass', fs=SR, output='sos'), x)


def place(dst, src, at):
    i = int(at * SR)
    n = min(len(src), len(dst) - i)
    if n > 0:
        dst[i:i + n] += src[:n]


# ───────────────────────────── 종 ─────────────────────────────
# 교회 종 부분음 (으뜸음 = prime 기준 비율, 세기, 감쇠 배율): 험(아래 옥타브)·으뜸·단3도·5도·명목음(위 옥타브) + 윗부분음
BELL = [(0.5, 0.42, 1.00), (1.0, 0.85, 0.72), (1.19, 0.70, 0.58), (1.5, 0.28, 0.46), (2.0, 1.00, 0.42),
        (2.51, 0.34, 0.26), (3.0, 0.40, 0.22), (4.0, 0.30, 0.16), (5.34, 0.16, 0.11), (6.72, 0.10, 0.08), (8.2, 0.05, 0.05)]


def bell(name, f0, dur, bright=1.0, thump=0.0, lo=38.0):
    r = rng_for(name)
    t = tt(dur)
    y = np.zeros_like(t)
    for ratio, amp, dk in BELL:
        f = f0 * ratio
        if f < lo or f > 15000:
            continue
        tau = dur * 0.34 * dk
        a = amp * (bright ** np.log2(max(1.0, ratio)))
        d = 0.0012 + r.random() * 0.0012          # 종 몸통의 비대칭 → 가까운 두 음이 천천히 맥놀이
        ph = r.random() * TAU
        y += a * env_exp(t, tau) * (0.6 * np.sin(TAU * f * (1 - d) * t + ph) + 0.4 * np.sin(TAU * f * (1 + d) * t + ph * 1.7))
    # 추가 치는 순간: 짧은 쇳소리 + (큰 종) 낮은 쿵
    n = bp(r.standard_normal(len(t)), min(1800 * max(1, f0 / 300), 5000), min(7000 * max(1, f0 / 300), 14000)) * env_exp(t, 0.006, 0.0004)
    y += 0.5 * bright * n
    if thump:
        ft = np.linspace(f0 * 2.2, f0 * 1.05, len(t))
        y += thump * np.sin(TAU * np.cumsum(ft) / SR) * env_exp(t, 0.05, 0.001)
    return lp(y, 11000)


# ───────────────────────────── 꼬리 층 ─────────────────────────────
def ring(name, base, dur=0.95):
    """칼날 울림 (순간음 없는 꼬리): 비조화 부분음 + 아주 짧은 '칭'"""
    r = rng_for(name)
    t = tt(dur)
    y = np.zeros_like(t)
    for k, ratio in enumerate([1.0, 1.47, 2.09, 2.56, 3.39, 4.08, 5.3]):
        f = base * ratio * (1 + (r.random() - 0.5) * 0.01)
        if f > 15000:
            continue
        tau = (0.34 - 0.035 * k) * (0.85 + r.random() * 0.3)
        y += (0.9 ** k) * (0.5 + r.random() * 0.5) * env_exp(t, tau, 0.004) * np.sin(TAU * f * t * (1 + 0.0009 * np.sin(TAU * 5.5 * t)) + r.random() * TAU)
    y += 0.35 * hp(r.standard_normal(len(t)), 6500) * env_exp(t, 0.012, 0.001)
    return hp(y, 900)


def cloth(name, dur=0.24):
    """천·망토 펄럭임: 띠 잡음 두 번의 부푼 엔벨로프"""
    r = rng_for(name)
    t = tt(dur)
    n = r.standard_normal(len(t))
    c = 0.05 + r.random() * 0.03
    e = np.exp(-((t - c) / 0.03) ** 2) + (0.55 + r.random() * 0.3) * np.exp(-((t - c - 0.07 - r.random() * 0.04) / 0.045) ** 2)
    wob = 1 + 0.5 * lp(r.standard_normal(len(t)), 60) * 6
    y = bp(n, 350, 2600 + r.random() * 1200) * e * np.clip(wob, 0.2, 2.0)
    y += 0.5 * bp(n, 120, 420) * e
    return y


def debris(name, dur=0.6):
    """돌 부스러기: 작은 돌이 튀는 딸깍 여럿 (점점 드물게) + 낮은 자갈 구르는 소리"""
    r = rng_for(name)
    y = np.zeros(int(dur * SR))
    t = tt(dur)
    k = 16 + int(r.integers(0, 6))
    for i in range(k):
        at = (r.random() ** 1.9) * (dur - 0.08)
        d = 0.012 + r.random() * 0.03
        tl = tt(d)
        f = 700 + r.random() * 2600
        g = (0.35 + r.random() * 0.65) * (1 - at / dur) ** 1.3
        s = g * (np.sin(TAU * f * tl) * np.exp(-tl / (d * 0.22)) * 0.7 + bp(r.standard_normal(len(tl)), 1200, 6500) * np.exp(-tl / (d * 0.3)))
        place(y, s, at)
    y += 0.5 * bp(r.standard_normal(len(t)), 180, 900) * np.exp(-t / 0.16) * np.minimum(1, t / 0.004)
    return y


def gear(name, dur=0.21):
    """장비 소리: 가죽 삐걱임 + 버클 짤깍 두세 번 (작게)"""
    r = rng_for(name)
    t = tt(dur)
    slip = np.abs(signal.sawtooth(TAU * (38 + r.random() * 30) * t + r.random() * 6)) ** 3
    y = 0.8 * bp(r.standard_normal(len(t)), 380, 1400) * slip * np.exp(-((t - 0.07) / 0.06) ** 2)
    for i in range(2 + int(r.integers(0, 2))):
        at = 0.01 + r.random() * 0.13
        tl = tt(0.035)
        f = 2800 + r.random() * 2800
        s = (np.sin(TAU * f * tl) + 0.5 * np.sin(TAU * f * 1.51 * tl)) * np.exp(-tl / 0.006) * (0.3 + r.random() * 0.4)
        place(y, s, at)
    return y


def draw(name, dur=0.46):
    """칼 뽑기: 올라가는 금속 긁힘 + 끝의 짧은 울림"""
    r = rng_for(name)
    t = tt(dur)
    n = r.standard_normal(len(t))
    fc = 2200 * (6200 / 2200) ** np.clip(t / 0.3, 0, 1)
    ph = np.cumsum(fc) / SR
    scrape = n * (0.6 + 0.4 * np.sin(TAU * ph))                 # 중심이 올라가는 톱니 변조 잡음
    scrape = bp(scrape, 1800, 9000) * np.minimum(1, t / 0.03) * np.exp(-np.maximum(0, t - 0.27) / 0.035)
    y = scrape * 0.9
    tl = np.maximum(0, t - 0.25)
    for f, a in [(3100, 1.0), (4650, 0.7), (6900, 0.5), (8300, 0.3)]:
        y += 0.5 * a * (t > 0.25) * np.sin(TAU * f * tl + r.random() * 6) * np.exp(-tl / 0.07) * np.minimum(1, tl / 0.004)
    return y


# ───────────────────────────── 적 ─────────────────────────────
VOW = {'o': (450, 800, 2500), 'a': (720, 1150, 2600), 'u': (320, 720, 2300), 'e': (480, 1700, 2500)}


def chant(name, f0=98.0, vowels='oau', dur=1.05):
    """마법사 주문: 낮은 목소리 두 줄(으뜸 + 5도) → 포먼트(모음 바뀜) + 숨소리. 음절 세 번"""
    r = rng_for(name)
    t = tt(dur)
    vib = 1 + 0.012 * np.sin(TAU * 5.1 * t + r.random() * 6) + 0.004 * lp(r.standard_normal(len(t)), 8) * 6
    src = np.zeros_like(t)
    for f, a in [(f0, 1.0), (f0 * 1.498, 0.55), (f0 * 0.5, 0.35)]:
        ph = np.cumsum(f * vib) / SR
        src += a * (2 * (ph % 1.0) - 1)
    src += 0.25 * r.standard_normal(len(t))
    syl = len(vowels)
    y = np.zeros_like(t)
    seg = dur / syl
    for i, v in enumerate(vowels):
        c = (i + 0.45) * seg
        e = np.exp(-((t - c) / (seg * 0.36)) ** 4)
        part = np.zeros_like(t)
        for k, f in enumerate(VOW[v]):
            q = [9, 11, 9][k]
            part += [1.0, 0.6, 0.2][k] * signal.sosfilt(signal.butter(1, [f * (1 - 0.5 / q), f * (1 + 0.5 / q)], 'bandpass', fs=SR, output='sos'), src)
        y += part * e
    return lp(y, 5200)


# ───────────────────────────── 인터페이스 ─────────────────────────────
def ting(t, f, tau, a=1.0):
    return a * (np.sin(TAU * f * t) + 0.22 * np.sin(TAU * f * 2.76 * t) * np.exp(-t / (tau * 0.4))) * env_exp(t, tau, 0.002)


def ui(name):
    r = rng_for(name)
    if name == 'ui_tick':
        t = tt(0.05)
        return ting(t, 1760, 0.009) + 0.25 * hp(r.standard_normal(len(t)), 5000) * env_exp(t, 0.003, 0.0005)
    if name == 'ui_tab':
        t = tt(0.09)
        y = ting(t, 1174.7, 0.012)
        place(y, ting(tt(0.05), 1760, 0.011, 0.8), 0.035)
        return y
    if name == 'ui_open':
        t = tt(0.24)
        fc = 700 * (2600 / 700) ** (t / t[-1])
        n = r.standard_normal(len(t)) * np.sin(TAU * np.cumsum(fc) / SR)
        y = 0.5 * bp(n, 500, 4000) * np.sin(np.pi * np.clip(t / 0.16, 0, 1)) ** 2
        place(y, ting(tt(0.16), 1174.7, 0.045, 0.9), 0.07)
        return y
    if name == 'ui_close':
        t = tt(0.2)
        fc = 2400 * (600 / 2400) ** (t / t[-1])
        n = r.standard_normal(len(t)) * np.sin(TAU * np.cumsum(fc) / SR)
        y = 0.5 * bp(n, 400, 4000) * np.sin(np.pi * np.clip(t / 0.14, 0, 1)) ** 2
        place(y, ting(tt(0.12), 880, 0.035, 0.8), 0.02)
        return y
    if name == 'ui_ok':
        y = np.zeros(int(0.34 * SR))
        place(y, ting(tt(0.2), 1174.7, 0.06), 0.0)
        place(y, ting(tt(0.26), 1760, 0.08, 0.9), 0.075)
        return y
    if name == 'ui_deny':
        t = tt(0.17)
        f = np.linspace(210, 150, len(t))
        return np.sin(TAU * np.cumsum(f) / SR) * env_exp(t, 0.04, 0.002) + 0.3 * bp(r.standard_normal(len(t)), 300, 1200) * env_exp(t, 0.015, 0.001)
    raise KeyError(name)


# ───────────────────────────── 목록 ─────────────────────────────
D4 = 293.665
# id → (만드는 함수, 비트레이트). 이름(sfx) 묶음은 SETS
FILES = {
    'bell_mid_1': (lambda: bell('bell_mid_1', D4, 2.6, bright=0.92), '80k'),
    'bell_high_1': (lambda: bell('bell_high_1', D4 * 2, 1.9, bright=0.86), '80k'),
    'bell_toll_1': (lambda: bell('bell_toll_1', D4 / 4, 6.0, bright=1.12, thump=0.9, lo=60.0), '80k'),
    'ring_1': (lambda: ring('ring_1', 2350), None), 'ring_2': (lambda: ring('ring_2', 2890), None), 'ring_3': (lambda: ring('ring_3', 1980), None),
    'cloth_1': (lambda: cloth('cloth_1'), None), 'cloth_2': (lambda: cloth('cloth_2'), None), 'cloth_3': (lambda: cloth('cloth_3'), None),
    'debris_1': (lambda: debris('debris_1'), None), 'debris_2': (lambda: debris('debris_2'), None), 'debris_3': (lambda: debris('debris_3', 0.5), None),
    'gear_1': (lambda: gear('gear_1'), None), 'gear_2': (lambda: gear('gear_2'), None), 'gear_3': (lambda: gear('gear_3'), None),
    'draw_1': (lambda: draw('draw_1'), None),
    'chant_1': (lambda: chant('chant_1', 98.0, 'oau'), None), 'chant_2': (lambda: chant('chant_2', 87.3, 'uao'), None),
    'ui_tick_1': (lambda: ui('ui_tick'), None), 'ui_tab_1': (lambda: ui('ui_tab'), None), 'ui_open_1': (lambda: ui('ui_open'), None),
    'ui_close_1': (lambda: ui('ui_close'), None), 'ui_ok_1': (lambda: ui('ui_ok'), None), 'ui_deny_1': (lambda: ui('ui_deny'), None),
}
# 이름 → {f: 파일 id 들, g: 엔진 음량, vr: 재생 속도 변형(녹음 1벌로 변형 3개), room: 방 울림 배율}
SETS = {
    'bell_mid': dict(f=['bell_mid_1'], g=1.0), 'bell_high': dict(f=['bell_high_1'], g=1.0), 'bell_toll': dict(f=['bell_toll_1'], g=1.0),
    'ring': dict(f=['ring_1', 'ring_2', 'ring_3'], g=1.0), 'cloth': dict(f=['cloth_1', 'cloth_2', 'cloth_3'], g=1.0),
    'debris': dict(f=['debris_1', 'debris_2', 'debris_3'], g=1.0), 'gear': dict(f=['gear_1', 'gear_2', 'gear_3'], g=1.0),
    'draw': dict(f=['draw_1'], g=1.0, vr=[1, 0.94, 1.06]), 'chant': dict(f=['chant_1', 'chant_2'], g=1.0),
    'ui_tick': dict(f=['ui_tick_1'], g=1.0, room=0), 'ui_tab': dict(f=['ui_tab_1'], g=1.0, room=0), 'ui_open': dict(f=['ui_open_1'], g=1.0, room=0),
    'ui_close': dict(f=['ui_close_1'], g=1.0, room=0), 'ui_ok': dict(f=['ui_ok_1'], g=1.0, room=0), 'ui_deny': dict(f=['ui_deny_1'], g=1.0, room=0),
}


def master(y, ceil=CEIL):
    y = B.hpf(np.asarray(y, dtype=np.float64), 30, 2)
    y = y / (np.abs(y).max() + 1e-12) * 0.5
    y *= 10 ** ((TARGET - B.lufs_ev(y)) / 20)
    tp = B.true_peak(y)
    if tp > ceil - 0.1:                         # 종·울림 같은 음정 소리는 리미터로 누르지 않고 통째로 내린다 (첫 순간이 찌그러지지 않게)
        y *= 10 ** ((ceil - 0.1 - tp) / 20)
    env = np.abs(y)
    idx = np.nonzero(env > env.max() * 10 ** (-60 / 20))[0]
    y = y[:min(len(y), int(idx[-1]) + int(0.01 * SR))]
    n = min(len(y), int(0.012 * SR))
    y[len(y) - n:] *= np.linspace(1, 0, n)
    return y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(ROOT / 'assets' / 'v2' / 'audio'))
    ap.add_argument('--only', default='')
    ap.add_argument('--wav', default='')
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    only = set(x for x in a.only.split(',') if x)
    ixp = out / 'index.json'
    old = json.loads(ixp.read_text()) if ixp.exists() else {'files': {}}
    files = {}
    total = 0
    for fid, (fn, br) in FILES.items():
        if only and fid not in only and fid.rsplit('_', 1)[0] not in only:
            if fid in old.get('files', {}):
                files[fid] = old['files'][fid]
                total += files[fid]['bytes']
            continue
        ceil = CEIL
        for _ in range(4):
            y = master(fn(), ceil)
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
        files[fid] = dict(dur=round(len(yo) / B.OUT_RATE, 4), on=round(float(on[0]) / B.OUT_RATE, 4) if len(on) else 0, ch=1,
                          lufs=round(float(B.lufs_ev(y)), 1), lufs_m=round(float(B.lufs_m(y)), 1), peak=round(float(B.true_peak(y)), 2), dpk=round(float(dpk), 2),
                          m4a=B.h8(p), bytes=p.stat().st_size)
        total += files[fid]['bytes']
        print(f"{fid:14s} {files[fid]['dur']:6.3f}s  ev {files[fid]['lufs']:6.1f} LUFS  m {files[fid]['lufs_m']:6.1f}  tp {files[fid]['peak']:6.2f}  dpk {files[fid]['dpk']:6.2f}  {files[fid]['bytes']:6d} B")
    ix = dict(version=2, rate=B.OUT_RATE, formats=['m4a'], names=list(SETS.keys()), sfx=SETS, files=files)
    ixp.write_text(json.dumps(ix, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(files)} files, {total} bytes ({total / 1024:.1f} KB) → {out}')
    bad = [k for k, v in files.items() if v['dpk'] > -0.95]
    if bad:
        print('PEAK OVER:', bad)
        sys.exit(1)


if __name__ == '__main__':
    main()
