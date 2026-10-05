# DSP 도우미 — BS.1770 라우드니스, 트루 피크, 룩어헤드 리미터, 템포 딜레이(게임 엔진 딜레이 재현), 이음매 지표
import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

def _kfilter(sr):
    # ITU-R BS.1770 K-가중 (pyloudnorm 과 같은 해석적 설계)
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = np.tan(np.pi * f0 / sr); Vh = 10 ** (G / 20); Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a1 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = np.tan(np.pi * f0 / sr)
    b2 = [1, -2, 1]; a2 = [1, 2 * (K * K - 1) / (1 + K / Q + K * K), (1 - K / Q + K * K) / (1 + K / Q + K * K)]
    return (b1, a1), (b2, a2)

def lufs(x, sr):
    """통합 라우드니스 (LUFS, 게이팅 −70/−10)"""
    x = np.asarray(x, np.float64)
    if x.ndim == 1: x = x[:, None]
    (b1, a1), (b2, a2) = _kfilter(sr)
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)
    blk, hop = int(0.4 * sr), int(0.1 * sr)
    if len(y) < blk: return -99.0
    p = np.cumsum(np.concatenate([np.zeros((1, y.shape[1])), y * y]), axis=0)
    st = np.arange(0, len(y) - blk + 1, hop)
    z = ((p[st + blk] - p[st]) / blk).sum(axis=1)
    l = -0.691 + 10 * np.log10(np.maximum(z, 1e-12))
    z1 = z[l > -70]
    if not len(z1): return -99.0
    rel = -0.691 + 10 * np.log10(z1.mean()) - 10
    z2 = z[(l > -70) & (l > rel)]
    return float(-0.691 + 10 * np.log10(z2.mean()))

def true_peak(x, os=4):
    """4배 오버샘플 트루 피크 (dBTP)"""
    x = np.asarray(x, np.float64)
    if x.ndim == 1: x = x[:, None]
    m = 0.0
    for c in range(x.shape[1]):
        u = signal.resample_poly(x[:, c], os, 1)
        m = max(m, float(np.abs(u).max()), float(np.abs(x[:, c]).max()))
    return 20 * np.log10(max(m, 1e-9))

def tp_envelope(x, os=4):
    """샘플별 트루 피크 근사 (채널 최대, 오버샘플 4점 중 최대)"""
    d = np.abs(x).max(axis=1)
    for c in range(x.shape[1]):
        u = np.abs(signal.resample_poly(x[:, c], os, 1))[: len(x) * os].reshape(-1, os).max(axis=1)
        d = np.maximum(d, u[: len(d)])
    return d

def limit(x, sr, ceil_db=-1.5, ramp=0.01, hold=0.03):
    """룩어헤드 브릭월 리미터 — 상태 없는 대칭 창 연산이라 같은 입력 구간이면 같은 이득 (루프 이음매에 안전)
    r = 필요 이득, h = 창 ±(ramp+hold) 최소, g = h 의 ramp 길이 이동 평균 → g[n] ≤ r[n] 보장"""
    c = 10 ** (ceil_db / 20)
    d = tp_envelope(x)
    r = np.minimum(1.0, c / np.maximum(d, 1e-9))
    if r.min() >= 1.0: return x, 0.0
    A, H = max(1, int(ramp * sr)), int(hold * sr)
    h = minimum_filter1d(r, size=2 * (A + H) + 1, mode='nearest')
    g = uniform_filter1d(h, size=A, mode='nearest')
    y = x * g[:, None].astype(x.dtype)
    return y, float(20 * np.log10(g.min()))

def tempo_delay(x, sr, delay_s, fb=0.34, out=0.55, lp_hz=2600, taps=8):
    """게임 엔진 리드 딜레이: in → delay → LP2600 → (fb 0.34 귀환) → ×0.55. 선형 시불변이라 반향 k 를 직접 합성"""
    D = int(round(delay_s * sr))
    b, a = signal.butter(2, lp_hz / (sr / 2))
    y = np.zeros_like(x); cur = x.astype(np.float64)
    for k in range(1, taps + 1):
        cur = signal.lfilter(b, a, cur, axis=0)
        sh = k * D
        if sh >= len(x): break
        y[sh:] += (out * fb ** (k - 1)) * cur[: len(x) - sh]
    return y.astype(np.float32)

def seam_metrics(y, ls, le, sr):
    """루프 이음매 지표 (디코드된 PCM, 재생 순서 … y[le-1] → y[ls] …)
    jump: 이음매 1차 차분 / 루프 내부 1차 차분 99.9 백분위
    hf:   고역(2차 차분) 이음매 값 / 내부 99.9 백분위
    match_db: 이음매 직전 0.5 s 의 y[le-W:le] 와 y[ls-W:ls] 의 SNR (같은 음악 → 클수록 좋음)
    rms_db: 이음매 앞뒤 50 ms RMS 차 (dB) 와 내부 같은 지표의 95 백분위"""
    y = y.astype(np.float64)
    body = y[ls:le]
    d1 = np.abs(np.diff(body, axis=0)).max(axis=1)
    p999 = np.percentile(d1, 99.9) + 1e-9
    seam = np.abs(y[ls] - y[le - 1]).max()
    d2 = np.abs(body[2:] - 2 * body[1:-1] + body[:-2]).max(axis=1)
    q999 = np.percentile(d2, 99.9) + 1e-9
    seam2 = max(np.abs(y[ls] - 2 * y[le - 1] + y[le - 2]).max(), np.abs(y[ls + 1] - 2 * y[ls] + y[le - 1]).max())
    W = int(0.5 * sr)
    a, b = y[le - W:le], y[ls - W:ls] if ls >= W else None
    match = 99.0
    if b is not None:
        err = np.sum((a - b) ** 2); match = 10 * np.log10(np.sum(a * a) / max(err, 1e-12))
    w = int(0.05 * sr)
    def rdb(z): return 10 * np.log10(np.mean(z * z) + 1e-12)
    rms_seam = abs(rdb(y[le - w:le]) - rdb(y[ls:ls + w]))
    rs = []
    for s in range(ls + w, le - w, max(w, (le - ls) // 400)):
        rs.append(abs(rdb(y[s - w:s]) - rdb(y[s:s + w])))
    return dict(jump=float(seam / p999), hf=float(seam2 / q999), match_db=float(match), rms_db=float(rms_seam), rms_p95=float(np.percentile(rs, 95)))
