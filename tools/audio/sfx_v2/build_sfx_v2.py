#!/usr/bin/env python3
"""고급 효과음 v2 (시범 10종) 빌드 — 녹음 소재를 층으로 쌓아(순간음 + 몸통 + 꼬리) assets/audio/sfx_v2/ 에 쓴다.

  python3 tools/audio/sfx_v2/fetch_sources.py --src /tmp/claude-0/g3/sfx_src      # 소재 받기 (sources.json 의 주소에서)
  python3 tools/audio/sfx_v2/build_sfx_v2.py --src /tmp/claude-0/g3/sfx_src [--out assets/audio/sfx_v2] [--only hit,crit]
                                             [--wav dir] [--keep-gains] [--credits out.json]

  소재: sources.json — 키마다 파일 경로·받은 주소·원본 페이지·작가·라이선스. 쓰는 소재는 모두 CC0 1.0
        (BigSoundBank.com · Kenney.nl · OpenGameArt.org 의 CC0 표기 묶음). 출처가 불명확한 소재는 쓰지 않는다.
  하는 일 (이름마다 변형 3~5개):
    1. 층 자르기: 소재의 '첫 소리'(onset)를 찾아 그 2 ms 앞부터 len 초. 피치(재생 속도, 반음), 고역·저역 통과, 지수 감쇠(tau), 지연(dly)
    2. 합치기 → 버스: EQ(저역 선반·피킹·고역 선반) → 가벼운 새츄레이션(tanh 병렬) → 30 Hz 아래 정리
    3. 라우드니스 맞춤: '사건 라우드니스' (BS.1770 K-가중, 게이트 대신 소리 몸통 — 10 ms 엔벨로프가 최대의 -20 dB 위인 구간 —
       의 평균 제곱; 짧은 효과음에는 400 ms 창의 LUFS-M 이 소리 길이에 따라 들쭉날쭉해서) 를 목표 -16 LUFS 로, 트루 피크 ≤ -1 dBTP
       (4배 오버샘플; 넘으면 부드러운 리미터 — 4 dB 넘게 눌러야 하면 목표를 그만큼 낮춘다). 보고에는 LUFS-M(400 ms 최대)도 같이 적는다.
    4. 꼬리: -60 dB 아래 자르기 + 끝 12 ms 페이드. 44.1 kHz 로 → .m4a 만 (AAC-LC 레시피 br, 기본 96 kbps 모노 / 128 kbps 스테레오; 2차 묶음 80 kbps)
       인코딩한 두 파일을 다시 풀어 샘플 피크(dpk)를 재고, -1 dBFS 를 넘으면 리미터 상한을 그만큼 낮춰 다시 만든다 (AAC 는 날카로운
       순간음에서 피크를 최대 4 dB 넘긴다 — 그래서 hit_heavy·hit_stone 은 12·10 kHz 저역 통과)
       두 형식인 까닭은 assets/audio/sfx 와 같다: 헤드리스 Chromium·일부 리눅스는 AAC 를 못 풀고, 옛 사파리는 Vorbis 를 못 푼다.
  index.json = { version, rate, formats:['m4a'], names:[…], sfx:{이름:{f:[파일 id], g, ref?, rev?, room?, of?, alias?}}, files:{id:{dur, on, ch, lufs, lufs_m, peak, dpk, m4a, bytes}} }
    g = 엔진 음량 (호출 vol 에 곱함) — tools/test_sfx.mjs --calibrate-v2 가 지금 소리(샘플+합성)와 귀에 같은 크기(K-가중 순간
    라우드니스)가 되게 맞춘다. 다시 빌드하면 g 가 1 로 돌아가므로 --keep-gains 를 쓰거나 --calibrate-v2 를 두세 번 다시 돌린다.
  sources.json 의 출처는 assets/audio/LICENSE-CREDITS.txt (옛 CREDITS.md) 의 'v2' 표와 /tmp/claude-0/g3/sfx_sources.json 에 그대로 옮긴다 (--credits).
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from fractions import Fraction
from pathlib import Path

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SR = 48000          # 작업 rate
OUT_RATE = 44100    # 내보내기 rate (assets/audio/sfx 와 같음)
TARGET = -16.0      # 사건 라우드니스 LUFS (lufs_ev: 소리가 울리는 구간의 K-가중 평균 — 짧은 타격음은 400 ms 창 LUFS-M 이 길이에 따라 크게 달라서)
CEIL = -1.0         # dBTP
LREF = -20.0        # 층 기준 크기 (사건 라우드니스)
CLIP_MAX = 6.0      # 버스 부드러운 클리퍼 최대 감쇠 (dB) — 2차 묶음

# ───────────────────────────── 레시피 ─────────────────────────────
# 층: s 소재 키 · at 찾기 시작(초) · al 'pk' = 가장 센 곳 기준(기본: 첫 소리) · len 길이 · g dB(층을 같은 크기로 맞춘 뒤의 상대 비율)
#     st 반음 · hp/lp Hz · dly ms · tau 지수 감쇠(초, hold 뒤) · hold · rev 뒤집기 · pan(스테레오) · clip 순간음 둥글게(dB)
# 버스: eq [(종류, Hz, dB, Q)] · sat (drive, mix) · lp/hp
def L(s, **k):
    k['s'] = s
    return k


def BSB(i):
    return f'bsb:{i:04d}' if isinstance(i, int) else f'bsb:{i}'


PUNCH = [2460, 2461, 2463, 2465, 2468]            # BigSoundBank Punch #5·6·8·10·13 — 짧고 단단한 손바닥/주먹 순간음
QPUNCH = [f'oga:qubodup_punch/qubodupPunch0{i}.flac' for i in range(1, 6)]   # qubodup Punch — 낮은 몸통이 있는 펀치
MEAT = ['oga:qubodup_impact/qubodupImpactMeat01.flac', 'oga:qubodup_impact/qubodupImpactMeat02.flac']
GORE = [2582, 2585, 2586, 2589, 2591, 2599]       # BigSoundBank Gore foley (애호박·피망·자몽) — 젖은 살 찢김
BONE = [(1408, 0.0), (1409, 0.0), (596, 3.80), (596, 6.90), (596, 18.70)]  # Bones cracking (셀러리) — 뼈 부서짐
FALL = [(2452, 0.0), (2453, 0.0), (2455, 0.0), (2456, 0.0), (2454, 0.30)]  # Body fall — 몸이 바닥에 떨어지는 무게
HEEL = [0.36, 0.94, 1.50, 2.78, 3.40]             # BigSoundBank Heels #1 (0166) 의 걸음 위치 — 단단한 굽 소리
FANT = ['L1', 'R2', 'L2', 'R1', 'L3']
MED = 'oga:medieval/'                               # MedicineStorm 'Medieval sound effects — weapon impacts' (192 kHz 칼날끼리)
CLASH = [('Sabre Katana Blade on Blade.wav', 0.44), ('Norse Sword Katana Blade on Blade.wav', 0.24), ('Sabre Katana Blade on Blade.wav', 2.63),
         ('Sabre Norse Sword Blade on Blade.wav', 12.44), ('Norse Sword Katana Blade on Blade.wav', 5.60)]
RING = [('Sabre Katana Blade on Blade.wav', 6.50), ('Sabre Katana Blade on Blade.wav', 11.28), ('Norse Sword Katana Blade on Blade.wav', 2.84),
        ('Mace Norse Sword Blade.wav', 3.64)]           # 다음 타격까지 0.5 초 넘게 비어 있는 것만
EQ_BODY = [('ls', 110, 2.5, 0.7), ('pk', 380, -3.0, 1.0), ('pk', 3200, 1.5, 0.8)]

RECIPES = {
    # 가벼운 타격 (L·M 등급, 가장 자주) — 날 끝이 스치는 '탁' + 낮은 몸통 + 짧은 살 소리
    'hit': {'n': 5, 'ch': 1, 'var': lambda v: dict(layers=[
        L(BSB(PUNCH[v]), len=0.14, g=0, hp=350, tau=0.045, hold=0.008, clip=7),
        L(QPUNCH[v], len=0.26, g=-1, st=[-1, 0, -2, 1, -1][v], hp=55, lp=2600, tau=0.07, hold=0.01, clip=4),
        L(MEAT[v % 2], len=0.12, g=-9, hp=400, tau=0.05, dly=3, clip=8),
        L(BSB(GORE[v]), al='pk', len=0.10, g=-12, hp=900, tau=0.04, dly=6),
        L(BSB(127), len=0.07, g=-12, hp=2600, tau=0.03),
    ], eq=EQ_BODY, sat=(2.2, 0.35))},
    # 무거운 타격 (H·F 등급) — 둔기의 '쿵' + 몸이 꺾이는 무게 + 뼈 뿌드득
    'hit_heavy': {'n': 4, 'ch': 1, 'var': lambda v: dict(layers=[
        L(f'ken:impact-sounds/impactPunch_heavy_00{[0, 1, 2, 4][v]}.ogg', len=0.24, g=0, hp=40, tau=0.12, clip=4),
        L(BSB(PUNCH[v + 1]), len=0.10, g=-8, hp=600, tau=0.035, clip=7),
        L(BSB(FALL[v][0]), at=FALL[v][1], al='pk', win=1.2, len=0.42, g=-3, st=-3, lp=1400, hp=35, tau=0.14, hold=0.02),
        L(QPUNCH[v], len=0.40, g=-6, st=-9, lp=220, tau=0.16),
        L(BSB(BONE[v][0]), at=BONE[v][1], al='pk', len=0.16, g=-12, hp=1300, tau=0.06, dly=8),
    ], eq=[('ls', 90, 3.0, 0.7), ('pk', 330, -3.0, 0.9), ('pk', 2600, 1.0, 0.8)], sat=(2.6, 0.4), lp=12000)},   # lp: 12 kHz 위는 들리지 않고 AAC 가 순간음 피크를 4 dB 넘기게 만든다
    # 치명타 — 무거운 타격 위에 쇠가 울리는 '챙' 과 채찍 같은 날카로운 '짝', 꼬리가 조금 길다
    'crit': {'n': 4, 'ch': 1, 'var': lambda v: dict(layers=[
        L(BSB([2463, 2460, 2468, 2461][v]), len=0.12, g=0, hp=400, tau=0.04, clip=7),
        L(f'ken:impact-sounds/impactPunch_heavy_00{[3, 4, 1, 0][v]}.ogg', len=0.24, g=-2, hp=45, tau=0.11, clip=4),
        L(QPUNCH[(v + 2) % 5], len=0.36, g=-7, st=-5, lp=900, tau=0.13),
        L(MED + RING[v][0], at=RING[v][1] - 0.05, len=0.5, g=-8, st=[0, 1, -1, 2][v], hp=1500, tau=0.24, hold=0.02, dly=2, clip=3),
        L(BSB(2949), al='pk', len=0.06, g=-12, hp=2200, tau=0.02, clip=6),
    ], eq=[('ls', 100, 2.5, 0.7), ('pk', 360, -2.5, 1.0), ('hs', 6000, 1.5, 0.7)], sat=(2.4, 0.35))},
    # 살 재질 층 (M·H 등급에 겹침) — 찌르기·베기가 살에 박히는 젖은 '퍽'
    'hit_flesh': {'n': 4, 'ch': 1, 'var': lambda v: dict(layers=[      # 2차: 더 무거운 '퍽' (밝은 '착' → 둔탁한 몸통 중심, 사용자 의견)
        L(QPUNCH[v], len=0.24, g=0, st=-5, hp=40, lp=600, tau=0.09, clip=4),
        L(BSB(GORE[v]), al='pk', len=0.18, g=-3, hp=180, lp=3500, tau=0.06, hold=0.01, clip=5),
        L(MEAT[v % 2], len=0.16, g=-3, st=[-4, -2, -5, -3][v], hp=70, lp=2500, tau=0.07, clip=8),
        L(BSB(GORE[(v + 2) % 6]), al='pk', len=0.12, g=-9, st=-5, hp=150, lp=3000, tau=0.05, dly=10),
    ], eq=[('ls', 120, 3.0, 0.7), ('pk', 2500, -3.0, 1.0), ('hs', 6000, -6.0, 0.7)], sat=(2.0, 0.3))},
    # 단단한 재질 층 (돌·갑옷·얼음) — 돌이 깨지는 '딱' + 둔탁한 노크
    'hit_stone': {'n': 4, 'ch': 1, 'var': lambda v: dict(layers=[
        L('oga:qubodup_impact/qubodupImpactStone.flac', len=0.26, g=0, st=[0, 2, -2, -4][v], hp=60, tau=0.08),
        L(f'oga:rubberduck_rpg/item_stone_0{v + 1}.ogg', al='pk', len=0.14, g=-6, hp=900, tau=0.05, dly=4),
        L('oga:rubberduck_bfh/bfh1_rock_hit_01.ogg', len=0.12, g=-6, st=[0, 2, -2, 1][v], hp=500, tau=0.05, dly=1),
        L(BSB(1588), len=0.12, g=-9, st=[-3, -1, -4, -2][v], lp=2200, tau=0.05),
    ], eq=[('ls', 120, 1.5, 0.7), ('pk', 500, -2.0, 1.0), ('pk', 4000, 1.5, 0.9)], sat=(1.8, 0.25), lp=10000)},   # lp: AAC 가 돌 깨지는 순간음 피크를 넘기지 않게
    # 적 사망 — 마지막 일격 + 몸이 무너지는 무게 + 뼈·살 + 흩어지는 숨결
    'enemy_die': {'n': 4, 'ch': 1, 'var': lambda v: dict(layers=[
        L(BSB(PUNCH[[1, 3, 0, 4][v]]), len=0.12, g=-4, hp=400, tau=0.04, clip=7),
        L(BSB(FALL[v][0]), at=FALL[v][1], al='pk', win=1.6, len=0.65, g=0, st=-2, hp=40, lp=2600, tau=0.22, hold=0.04, dly=20),
        L(BSB(BONE[v + 1][0]), at=BONE[v + 1][1], al='pk', len=0.22, g=-8, hp=900, tau=0.08, dly=35),
        L(BSB(GORE[(v + 3) % 6]), al='pk', len=0.28, g=-9, hp=200, lp=6000, tau=0.1, dly=12),
    ], eq=[('ls', 100, 2.0, 0.7), ('pk', 420, -2.5, 1.0)], sat=(2.0, 0.3))},
    # 플레이어 피격 — 둔탁한 '퍽' + 사슬 갑옷이 흔들리는 짤랑 + 쇠 '텅' (적 타격음과 구분되게 낮고 탁하게)
    'hurt': {'n': 4, 'ch': 1, 'var': lambda v: dict(layers=[
        L(BSB(806), at=[0.06, 1.10, 2.15, 3.20][v], len=0.14, g=0, hp=120, tau=0.05, clip=6),
        L(QPUNCH[(v + 1) % 5], len=0.30, g=-2, st=-3, lp=1800, hp=50, tau=0.1),
        L(f'oga:rubberduck_rpg/chain_0{[1, 2, 3, 1][v]}.ogg', at=[0, 0, 0, 0.12][v], len=0.22, g=-20, hp=1500, lp=6500, tau=0.07, dly=14),   # 2차: 사슬 '찡'(≈10.5 kHz) 낮춤
        L(BSB(1084), at=[0.15, 3.20, 6.90, 10.37][v], len=0.20, g=-12, lp=4000, hp=200, tau=0.07, dly=2),
    ], eq=[('ls', 120, 2.0, 0.7), ('pk', 1800, -2.0, 1.0), ('pk', 10500, -9.0, 3.0), ('hs', 8000, -4.0, 0.7)], sat=(2.4, 0.4), lp=12000)},
    # 막기·쳐내기 (쇠와 쇠) — 칼날이 부딪히는 '챙' + 방패의 두꺼운 몸통 + 오래 남는 울림
    'clang': {'n': 5, 'ch': 1, 'var': lambda v: dict(layers=[
        L(MED + CLASH[v][0], at=CLASH[v][1] - 0.05, len=0.65, g=0, hp=220, tau=0.24, hold=0.02, clip=3),
        L(BSB(1084), at=[17.10, 13.70, 0.15, 6.90, 10.37][v], len=0.20, g=-9, hp=150, lp=5000, tau=0.07),
        L(QPUNCH[(v + 3) % 5], len=0.18, g=-13, st=-6, lp=320, tau=0.07),
    ], eq=[('pk', 320, -2.0, 1.0), ('pk', 2400, 1.5, 0.8)], sat=(1.6, 0.2))},
    # 필살기 착탄 (스테레오) — 가까운 폭발 + 아주 낮은 몸통 + 먼 굉음 꼬리 + 좌우 다른 파편 + 쇠의 잔향
    'ult_impact': {'n': 3, 'ch': 2, 'var': lambda v: dict(layers=[
        L(BSB([1808, 1807, 1806][v]), len=0.6, g=0, hp=30, tau=0.25, clip=4),
        L(BSB(2454), at=0.30, al='pk', win=1.2, len=1.0, g=-3, st=-12, lp=170, tau=0.35, hold=0.03),
        L(BSB(1023), len=1.9, g=-6, st=[0, -2, 1][v], lp=2400, hp=35, tau=0.7, hold=0.05, pan=-0.35),
        L(BSB(1023), len=1.9, g=-7, st=[-1, 1, -2][v], lp=2200, hp=35, tau=0.65, hold=0.08, dly=23, pan=0.35),
        L(f'oga:rubberduck_bfh/bfh1_rock_breaking_0{[1, 2, 3][v]}.ogg', len=0.9, g=-12, hp=400, tau=0.35, dly=40, pan=-0.6),
        L(f'oga:rubberduck_bfh/bfh1_rock_falling_0{[3, 5, 7][v]}.ogg', len=1.0, g=-13, hp=400, tau=0.4, dly=110, pan=0.6),
        L(MED + RING[v][0], at=RING[v][1] - 0.05, len=0.5, g=-18, st=-12, hp=250, tau=0.4, dly=5),
    ], eq=[('ls', 70, 2.0, 0.7), ('pk', 280, -2.0, 0.9)], sat=(2.8, 0.45))},
    # 발소리 (돌) — 굽이 닿는 '똑' + 밑창이 끌리는 결 + 낮은 '쿵'
    'step_stone': {'n': 5, 'ch': 1, 'var': lambda v: dict(layers=[
        L(BSB(166), at=HEEL[v], len=0.09, g=-2, hp=450, tau=0.03, clip=5),
        L(f'oga:fantozzi/Fantozzi-Stone{FANT[v]}.flac', len=0.16, g=-3, hp=180, lp=7500, tau=0.05, hold=0.01),
        L(f'ken:impact-sounds/footstep_concrete_00{v}.ogg', len=0.07, g=-4, lp=900, tau=0.03),
    ], eq=[('pk', 250, -1.5, 1.0), ('hs', 8000, -2.0, 0.7)], sat=(1.3, 0.15))},
}
from recipes2 import R2, ALIAS  # noqa: E402  (2차 묶음)
RECIPES.update(R2)
from recipes3 import R3  # noqa: E402  (3차 묶음: 남은 이름 전부 — 합성 단독 0)
RECIPES.update(R3)
NAMES = list(RECIPES)
REV = {}   # 이름별 잔향 송신을 바꾸려면 (없으면 audio.js 정의의 rev)


# ───────────────────────────── DSP ─────────────────────────────
_cache = {}


def run(cmd, inp=None):
    r = subprocess.run(cmd, capture_output=True, input=inp)
    if r.returncode != 0:
        sys.exit('ffmpeg 실패: ' + ' '.join(map(str, cmd)) + '\n' + r.stderr.decode(errors='replace')[-600:])
    return r.stdout


def resolve(src, key):
    kind, rel = key.split(':', 1)
    if kind == 'bsb':
        for ext in ('flac', 'wav'):
            p = src / 'bsb' / f'{rel}.{ext}'
            if p.exists():
                return p
        sys.exit(f'소재 없음: {key} ({src}/bsb/{rel}.flac|wav) — fetch_sources.py 먼저')
    p = src / ('oga' if kind == 'oga' else 'kenney') / (rel if kind == 'oga' else rel.replace('/', '/Audio/', 1))
    if not p.exists():
        sys.exit(f'소재 없음: {key} → {p} — fetch_sources.py 먼저')
    return p


def load(src, key):
    if key not in _cache:
        raw = run(['ffmpeg', '-v', 'error', '-i', str(resolve(src, key)), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'])
        _cache[key] = np.frombuffer(raw, np.float32).astype(np.float64)
    return _cache[key]


def onset(x, a, win=0.6, rel=-24):
    """[a, a+win] 안에서 그 구간 최대의 rel dB 를 처음 넘는 곳 (2 ms 앞)"""
    i0 = int(a * SR)
    seg = np.abs(x[i0:i0 + int(win * SR)])
    if not len(seg):
        return i0
    thr = seg.max() * 10 ** (rel / 20)
    k = int(np.argmax(seg > thr))
    return max(0, i0 + k - int(0.002 * SR))


def pitch(x, st):
    if not st:
        return x
    fr = Fraction(2 ** (-st / 12)).limit_denominator(400)   # 길이 배율 (높이면 짧아짐)
    return signal.resample_poly(x, fr.numerator, fr.denominator)


def bq(kind, f, gain=0.0, q=0.707):
    """RBJ 바이쿼드 → sos"""
    A = 10 ** (gain / 40)
    w = 2 * np.pi * f / SR
    cw, sw = np.cos(w), np.sin(w)
    al = sw / (2 * q)
    if kind == 'pk':
        b = [1 + al * A, -2 * cw, 1 - al * A]; a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind in ('ls', 'hs'):
        sq = 2 * np.sqrt(A) * al
        if kind == 'ls':
            b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
            a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
        else:
            b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
            a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    else:
        raise ValueError(kind)
    b, a = np.array(b) / a[0], np.array(a) / a[0]
    return np.concatenate([b, a])[None, :]


def hpf(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'highpass', fs=SR, output='sos'), x, axis=0)


def lpf(x, f, order=2):
    return signal.sosfilt(signal.butter(order, min(f, SR * 0.45), 'lowpass', fs=SR, output='sos'), x, axis=0)


def layer(src, d):
    x = load(src, d['s'])
    a = d.get('at', 0.0)
    if d.get('al') == 'pk':                     # 가장 센 10 ms 의 pre 초 앞에서 (긴 소재의 '본 소리')
        i0 = int(a * SR); w = int(0.01 * SR)
        seg = x[i0:i0 + int(d.get('win', 0.8) * SR)]
        e = (seg[:len(seg) // w * w].reshape(-1, w) ** 2).mean(1)
        i = max(0, i0 + int(np.argmax(e)) * w - int(d.get('pre', 0.012) * SR))
    else:
        i = onset(x, a, d.get('win', 0.6))
    n = int(d.get('len', 0.3) * SR * 2 ** (d.get('st', 0) / 12)) + 1     # 피치를 바꾼 뒤 len 이 되게 넉넉히
    y = x[i:i + n].copy()
    if d.get('rev'):
        y = y[::-1]
    y = pitch(y, d.get('st', 0))[:int(d.get('len', 0.3) * SR)]
    if d.get('hp'):
        y = hpf(y, d['hp'])
    if d.get('lp'):
        y = lpf(y, d['lp'])
    t = np.arange(len(y)) / SR
    env = np.ones_like(y)
    if d.get('tau'):
        h = d.get('hold', 0.0)
        env = np.where(t < h, 1.0, np.exp(-(t - h) / d['tau']))
    a_n = max(1, int(0.0015 * SR))
    env[:a_n] *= np.linspace(0, 1, a_n)          # 1.5 ms 어택 (자른 자리 클릭 방지)
    f_n = min(len(y), int(0.012 * SR))
    env[len(y) - f_n:] *= np.linspace(1, 0, f_n)
    y = y * env
    if d.get('clip'):                             # 부드러운 클리퍼: 순간음 꼭지를 clip dB 만큼 둥글게 (크레스트를 줄여 몸통을 살린다)
        t = np.abs(y).max() * 10 ** (-d['clip'] / 20) + 1e-12
        y = t * np.tanh(y / t)
    if lufs_ev(y) < -60:
        print(f'  경고: 층 {d["s"]} (at={d.get("at", 0)}) 이 거의 무음 — at/len 을 고칠 것', file=sys.stderr)
        return np.pad(np.zeros_like(y), (int(d.get('dly', 0) * SR / 1000), 0)), 0.0
    y *= 10 ** ((LREF - lufs_ev(y)) / 20)        # 층마다 같은 크기(LREF)로 맞춘 뒤 g 로 섞는다 → g 는 순수한 상대 비율
    y *= 10 ** (d.get('g', 0) / 20)
    pk = np.abs(x[i:i + n]).max() if n else 1
    return np.pad(y, (int(d.get('dly', 0) * SR / 1000), 0)), pk


def kweight(x):
    """BS.1770 K-가중 (48 kHz 계수)"""
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]; a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]; a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def lufs_m(y):
    """최대 순간 라우드니스 (400 ms 창, 100 ms 간격; 채널 합) — 짧은 효과음의 '들리는 크기'"""
    y = y if y.ndim == 2 else y[:, None]
    k = kweight(np.pad(y, ((0, int(0.4 * SR)), (0, 0))))
    p = (k ** 2).sum(1)
    w, h = int(0.4 * SR), int(0.1 * SR)
    c = np.concatenate([[0], np.cumsum(p)])
    m = [(c[i + w] - c[i]) / w for i in range(0, len(p) - w + 1, h)]
    return -0.691 + 10 * np.log10(max(m) + 1e-12)


def lufs_ev(y):
    """사건 라우드니스: K-가중 신호의 평균 제곱을 '몸통' (10 ms RMS 엔벨로프가 최대의 -20 dB 위인 첫~끝 구간) 에서"""
    y = y if y.ndim == 2 else y[:, None]
    p = (kweight(y) ** 2).sum(1)
    w = int(0.01 * SR); n = len(p) // w
    if n < 1:
        return -70.0
    env = p[:n * w].reshape(n, w).mean(1)
    on = np.nonzero(env > env.max() * 0.01)[0]
    if not len(on):                              # 무음 (잘못 고른 구간) — 호출부가 경고한다
        return -70.0
    seg = p[on[0] * w:(on[-1] + 1) * w]
    return -0.691 + 10 * np.log10(seg.mean() + 1e-12)


def true_peak(y):
    up = signal.resample_poly(y, 4, 1, axis=0)
    return 20 * np.log10(np.abs(up).max() + 1e-12)


def limiter(y, ceil_db):
    """부드러운 피크 리미터: 1 ms 미리 보기, 60 ms 회복"""
    c = 10 ** (ceil_db / 20)
    a = np.abs(y if y.ndim == 1 else y.max(1)) * 1.06    # 트루 피크 여유
    g = np.minimum(1.0, c / np.maximum(a, 1e-9))
    la = int(0.001 * SR)
    g = np.minimum.reduce([np.roll(g, -k) for k in range(la)])
    rel = np.exp(-1 / (0.06 * SR))
    out = np.empty_like(g); cur = 1.0
    for i, v in enumerate(g):
        cur = v if v < cur else rel * cur + (1 - rel) * v
        out[i] = cur
    return y * (out if y.ndim == 1 else out[:, None]), 20 * np.log10(out.min() + 1e-12)


def build_var(src, rec, v, ceil=CEIL):
    """변형 v 를 48 kHz 로 만든다 → (소리, 리미터 최대 감쇠 dB). ceil: 트루 피크 상한 (인코딩 뒤 피크가 넘으면 main 이 낮춰 다시 부른다)"""
    spec = rec['var'](v)
    ch = rec.get('ch', 1)
    parts = []
    for d in spec['layers']:
        y, _ = layer(src, d)
        if ch == 2:
            p = d.get('pan', 0.0)
            th = (p + 1) * np.pi / 4
            y = np.stack([y * np.cos(th), y * np.sin(th)], 1) * np.sqrt(2)
        parts.append(y)
    n = max(len(p) for p in parts)
    mix = np.zeros((n, ch)) if ch == 2 else np.zeros(n)
    for p in parts:
        mix[:len(p)] += p
    for kind, f, gdb, q in spec.get('eq', []):
        mix = signal.sosfilt(bq(kind, f, gdb, q), mix, axis=0)
    drive, wet = spec.get('sat', (1.0, 0.0))
    if wet:
        pk = np.abs(mix).max() + 1e-9
        s = np.tanh(drive * mix / pk) / np.tanh(drive) * pk
        mix = (1 - wet) * mix + wet * s
    mix = hpf(mix, 28, 2)
    if spec.get('lp'):
        mix = lpf(mix, spec['lp'])
    # 라우드니스 → (순간음이 너무 뾰족하면 부드러운 클리퍼로 최대 CLIP_MAX dB 먼저 둥글게) → 리미터
    mix *= 10 ** ((TARGET - lufs_ev(mix)) / 20)
    need = true_peak(mix) - (ceil - 0.1)
    if need > 4.0:                             # 동전·얼음·번개처럼 크레스트가 큰 소리: 리미터만으로 4 dB 넘게 누르면 목표가 -19 LUFS 아래로 떨어진다
        cdb = min(rec.get('cmax', CLIP_MAX), need - 3.5)   # cmax: 레시피별 상한 (동전·물·얼음·번개는 순간음이 아주 뾰족하다)
        t = np.abs(mix).max() * 10 ** (-cdb / 20)
        mix = t * np.tanh(mix / t)
        mix *= 10 ** ((TARGET - lufs_ev(mix)) / 20)
    red = 0.0
    if true_peak(mix) > ceil:
        lim, red = limiter(mix, ceil - 0.1)
        if red < -4.0:                         # 너무 눌러야 하면 목표를 낮춰 순간음을 지킨다
            mix *= 10 ** ((red + 4.0) / 20)
            lim, red = limiter(mix, ceil - 0.1)
        mix = lim
    tp = true_peak(mix)
    if tp > ceil - 0.05:                       # 리미터는 샘플 피크 기준이라 트루 피크가 남으면 그만큼 내린다
        mix *= 10 ** ((ceil - 0.1 - tp) / 20)
    # 꼬리 정리
    env = np.abs(mix if mix.ndim == 1 else mix.max(1))
    thr = env.max() * 10 ** (-60 / 20)
    idx = np.nonzero(env > thr)[0]
    end = min(len(mix), int(idx[-1]) + int(0.01 * SR)) if len(idx) else len(mix)
    mix = mix[:end]
    f_n = min(len(mix), int(0.012 * SR))
    fade = np.linspace(1, 0, f_n)
    mix[len(mix) - f_n:] *= fade if mix.ndim == 1 else fade[:, None]
    return mix, red


def to_out(y, rate=OUT_RATE):
    """48 kHz → 44.1 kHz (또는 레시피 'rate' — 3차 묶음의 드문 소리는 32 kHz)"""
    fr = Fraction(rate, SR)
    return signal.resample_poly(y, fr.numerator, fr.denominator, axis=0)


def encode(y, base, ch, br=None, rate=OUT_RATE):
    y = np.clip(y, -1, 1).astype(np.float32)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
        wav = t.name
    try:
        run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(rate), '-ac', str(ch), '-i', 'pipe:0', '-c:a', 'pcm_s16le', wav], y.tobytes())
        run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', br or ('128k' if ch == 2 else '96k'), '-movflags', '+faststart',
             '-map_metadata', '-1', '-fflags', '+bitexact', str(base) + '.m4a'])
    finally:
        os.unlink(wav)


def decoded_peak(path, ch):
    """인코딩한 파일을 다시 풀어 잰 샘플 피크 (dBFS) — 손실 압축은 피크를 0.1~0.3 dB 올린다"""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', str(ch), 'pipe:1'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    return 20 * np.log10(max(1e-9, float(np.abs(x).max()) if x.size else 1e-9))


def h8(p):
    return hashlib.sha1(Path(p).read_bytes()).hexdigest()[:8]


def used_sources():
    keys = set()
    for name, rec in RECIPES.items():
        for v in range(rec['n']):
            for d in rec['var'](v)['layers']:
                keys.add(d['s'])
    return sorted(keys)


def write_credits(out_json):
    srcs = json.loads((HERE / 'sources.json').read_text(encoding='utf-8'))
    used = used_sources()
    miss = [k for k in used if k not in srcs]
    if miss:
        sys.exit('sources.json 에 출처가 없는 소재: ' + ', '.join(miss))
    by = {}
    for name, rec in RECIPES.items():
        for v in range(rec['n']):
            for d in rec['var'](v)['layers']:
                by.setdefault(d['s'], set()).add(name)
    res = {k: {**srcs[k], 'used_in': sorted(by[k])} for k in used}
    Path(out_json).write_text(json.dumps(res, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', default='/tmp/claude-0/g3/sfx_src')
    ap.add_argument('--out', default=str(ROOT / 'assets/audio/sfx_v2'))
    ap.add_argument('--only', default=None)
    ap.add_argument('--wav', default=None, help='변형마다 48 kHz wav 도 여기 쓴다 (검토용)')
    ap.add_argument('--keep-gains', action='store_true', help='기존 index.json 의 g 를 유지')
    ap.add_argument('--credits', default=None, help='쓴 소재 출처 JSON 을 이 경로에 쓴다')
    a = ap.parse_args()
    src, out = Path(a.src), Path(a.out)
    if a.credits:
        write_credits(a.credits)
    srcs = json.loads((HERE / 'sources.json').read_text(encoding='utf-8'))
    for k in used_sources():
        if k not in srcs or 'CC0' not in srcs[k].get('license', ''):
            sys.exit(f'{k}: sources.json 에 CC0 출처가 없음 — 쓰지 않는다')
    out.mkdir(parents=True, exist_ok=True)
    idx_p = out / 'index.json'
    old = json.loads(idx_p.read_text(encoding='utf-8')) if idx_p.is_file() else {}
    names = a.only.split(',') if a.only else NAMES
    files = dict(old.get('files', {})) if a.only else {}
    sfx = dict(old.get('sfx', {})) if a.only else {}
    if a.wav:
        Path(a.wav).mkdir(parents=True, exist_ok=True)
    print('name         var  dur    LUFS-ev LUFS-M  dBTP   dec-pk  lim')
    for name in names:
        rec = RECIPES[name]
        ids = []
        orate = rec.get('rate', OUT_RATE)
        for v in range(rec['n']):
            fid = f'{name}_{v + 1}'
            ids.append(fid)
            ceil = CEIL
            for _ in range(8):                     # 인코딩(AAC·Vorbis)을 다시 푼 피크가 CEIL 을 넘으면 리미터 상한을 그만큼 낮춰 다시 만든다 (순간음만 눌림)
                y, red = build_var(src, rec, v, ceil)
                yo = to_out(y, orate)
                encode(yo, out / fid, rec.get('ch', 1), rec.get('br'), orate)
                dpk = decoded_peak(out / f'{fid}.m4a', rec.get('ch', 1))
                if dpk <= CEIL:
                    break
                ceil -= dpk - CEIL + 0.15
            if a.wav:
                run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(rec.get('ch', 1)), '-i', 'pipe:0', '-c:a', 'pcm_s16le',
                     str(Path(a.wav) / f'{fid}.wav')], np.clip(y, -1, 1).astype(np.float32).tobytes())
            for _ in range(4):                         # 리미터로 못 잡으면 (AAC 가 순간음 꼭지를 넘김) 남은 만큼 전체 음량을 내린다 (g 보정이 메운다)
                if dpk <= CEIL:
                    break
                y *= 10 ** ((CEIL - 0.25 - dpk) / 20)
                yo = to_out(y, orate)
                encode(yo, out / fid, rec.get('ch', 1), rec.get('br'), orate)
                dpk = decoded_peak(out / f'{fid}.m4a', rec.get('ch', 1))
            if dpk > CEIL:
                sys.exit(f'{fid}: 인코딩 뒤 피크 {dpk:.2f} dBFS > {CEIL} — 레시피를 고쳐야 한다')
            lu, lm, tp = lufs_ev(y), lufs_m(y), true_peak(y)
            env = np.abs(yo if yo.ndim == 1 else yo.max(1))
            on = float(np.argmax(env > 10 ** (-40 / 20) * env.max())) / orate
            files[fid] = {'dur': round(len(yo) / orate, 4), 'on': round(on, 4), 'ch': rec.get('ch', 1), 'lufs': round(lu, 1), 'lufs_m': round(lm, 1), 'peak': round(tp, 2), 'dpk': round(dpk, 2),
                          'm4a': h8(out / f'{fid}.m4a'), 'bytes': (out / f'{fid}.m4a').stat().st_size}
            print(f'{name:12s} {v + 1:>3}  {len(y) / SR:5.2f}  {lu:6.1f}  {lm:6.1f}  {tp:5.1f}  {dpk:5.1f}  {red:5.1f}')
        o = old.get('sfx', {}).get(name, {})
        e = {'f': ids, 'g': o.get('g', 1.0) if (a.keep_gains or a.only) else 1.0}
        if 'ref' in o and (a.keep_gains or a.only):
            e['ref'] = o['ref']
        for k in ('of', 'room', 'lazy', 'vr'):
            if k in rec:
                e[k] = rec[k]
        if name in REV:
            e['rev'] = REV[name]
        sfx[name] = e
    for al, src_name in ALIAS.items():          # 같은 파일을 쓰는 이름 (footstep = step_stone)
        if src_name in sfx:
            sfx[al] = {**sfx[src_name], 'g': old.get('sfx', {}).get(al, {}).get('g', sfx[src_name]['g']), 'alias': src_name}
    keep = {f'{fid}.m4a' for fid in files} | {'index.json'}
    for p in out.iterdir():
        if p.is_file() and p.name not in keep:
            p.unlink()
    order = NAMES + [al for al in ALIAS if al in sfx]
    idx = {'version': 2, 'rate': OUT_RATE, 'formats': ['m4a'], 'names': [n for n in order if n in sfx], 'sfx': {n: sfx[n] for n in order if n in sfx},
           'files': {k: files[k] for k in sorted(files)}}
    idx_p.write_text(json.dumps(idx, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    tot = sum(f['bytes'] for f in files.values())
    print(f'v2 효과음 {len(idx["sfx"])}종 · 파일 {len(files)}개 · m4a {tot / 1024:.0f} KB → {out}')


if __name__ == '__main__':
    main()
