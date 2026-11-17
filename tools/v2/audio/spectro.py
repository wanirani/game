#!/usr/bin/env python3
"""소리 파일 → 스펙트로그램 PNG (로그 주파수 40 Hz–16 kHz, 시간·주파수 눈금). tools/v2/sound_check.mjs 가 시연 렌더에 쓴다.
   python3 tools/v2/audio/spectro.py in.wav out.png [폭 1200] [높이 360]
   (ffmpeg showspectrumpic 의 로그 눈금은 눈금 글자와 그림이 어긋나서 직접 그린다 — numpy STFT + PIL)"""
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import signal

SR, F0, F1, DR = 48000, 40.0, 16000.0, 72.0


def main():
    src, out = sys.argv[1], sys.argv[2]
    W = int(sys.argv[3]) if len(sys.argv) > 3 else 1200
    H = int(sys.argv[4]) if len(sys.argv) > 4 else 360
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-f', 'f32le', '-ac', '1', '-ar', str(SR), 'pipe:1'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    f, t, Z = signal.stft(x, SR, nperseg=4096, noverlap=4096 - 480, window='hann', padded=True)
    P = 20 * np.log10(np.abs(Z) * 2 + 1e-9)                      # dBFS (사인 진폭 기준)
    rows = F0 * (F1 / F0) ** (np.arange(H)[::-1] / (H - 1))      # 위 = 높은 주파수
    cols = np.clip((np.arange(W) / W * len(t)).astype(int), 0, len(t) - 1)
    img = np.empty((H, W))
    for i, fr in enumerate(rows):                               # 행마다 그 주파수 띠(±3 %)의 최댓값 — 얇은 부분음이 빠지지 않게
        a, b = np.searchsorted(f, fr * 0.97), max(np.searchsorted(f, fr * 1.03), np.searchsorted(f, fr * 0.97) + 1)
        img[i] = P[a:b].max(0)[cols]
    v = np.clip((img + DR) / DR, 0, 1)
    rgb = np.stack([np.clip(v * 2.4, 0, 1), np.clip(v * 2.4 - 0.9, 0, 1), np.clip(0.55 * np.sin(np.pi * np.clip(v * 1.6, 0, 1)) + np.clip(v * 3 - 2.2, 0, 1), 0, 1)], -1)
    L, B = 58, 22
    im = Image.new('RGB', (W + L + 8, H + B + 6), (16, 14, 22))
    im.paste(Image.fromarray((rgb * 255).astype(np.uint8)), (L, 4))
    d = ImageDraw.Draw(im)
    for fr in [50, 100, 200, 500, 1000, 2000, 5000, 10000]:
        y = 4 + (H - 1) * (1 - np.log(fr / F0) / np.log(F1 / F0))
        d.line([(L - 4, y), (L + W, y)], fill=(70, 66, 92), width=1)
        d.text((4, y - 5), f'{fr} Hz' if fr < 1000 else f'{fr // 1000} kHz', fill=(200, 195, 215))
    dur = len(x) / SR
    step = 0.5 if dur <= 8 else 1 if dur <= 14 else 2
    for k in range(int(dur / step) + 1):
        xx = L + k * step / dur * W
        d.line([(xx, 4), (xx, H + 8)], fill=(70, 66, 92), width=1)
        d.text((xx + 2, H + 8), f'{k * step:g}s', fill=(200, 195, 215))
    im.save(out)


if __name__ == '__main__':
    main()
