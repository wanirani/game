#!/usr/bin/env python3
# 곡 1개 렌더/인코드/QA (build_music.mjs 가 호출) 와 산출물 검증
#   python3 render.py build <spec.json>
#   python3 render.py check <index.json> [--only a,b] [--budget MB] [--tp -1]
# 루프 곡: 도입 + 본문 2회를 렌더 (본문 2회째는 정확히 Lsamp(64 배수) 뒤에 같은 격자 위상으로 시작 → 비트 단위로 같은 소리).
#   파일 = R[0 : LE] (+ 이음매 크로스페이드, + 가드), LS = 본문 시작 + X(2.5 s), LE = LS + Lsamp.
#   LS 시점엔 도입의 잔향이 X 초 지나 사라졌고, LE 시점(2회째 X 초)엔 1회째 끝의 잔향이 같은 만큼 지나 있다 → 이음매 무결.
import json, os, subprocess, sys, math
import numpy as np
from scipy.io import wavfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fsynth, dsp

X_MIN, X_MAX = 1.0, 6.0  # 루프 시작 후보: 본문 시작 + [1, 6] s (도입/이전 패스 잔향이 사라진 첫 지점)
MATCH_DB = 50    # 이 정도 일치(1회째 대 2회째, ±0.1 s 창)면 충분
XF = 2048        # 이음매 크로스페이드 (샘플, ≈46 ms) — 잔향/코러스 변조의 미세한 차이만 덮는다
GUARD = 0.25     # loopEnd 뒤에 붙이는 가드 (= 루프 시작 직후 내용, 리샘플러 보간용)
CEIL = -1.5      # 인코드 전 리미터 천장 (dBTP)

def load_midi(path):
    div, tracks = fsynth.read_smf(path)
    t2s = fsynth.tempo_map(div, tracks)
    marks = {e[2]: e[0] for tr in tracks for e in tr if e[1] == 'marker'}
    setup, notes, open_ = [], [], {}
    counts = {}
    for tr in tracks:
        for e in tr:
            if e[1] in ('tempo', 'marker'): continue
            t, hi, ch, a, b = e
            if hi == 0xc0: setup.append(('prog', ch, 128 if ch % 16 == 9 else 0, a))
            elif hi == 0xb0: setup.append(('cc', ch, a, b))
            elif hi == 0x90:
                open_.setdefault((ch, a), []).append((t, b)); counts[ch] = counts.get(ch, 0) + 1
            elif hi == 0x80:
                st = open_.get((ch, a))
                if st: t0, v = st.pop(0); notes.append((t0, t, ch, a, v))
    for (ch, a), st in open_.items():
        for t0, v in st: notes.append((t0, t0 + div, ch, a, v))
    return div, t2s, marks, setup, sorted(notes), counts

def schedule(spec, sr):
    div, t2s, marks, setup, notes, counts = load_midi(spec['mid'])
    drums = set(spec['drums'])
    loop = spec['loop']
    ls_t = marks.get('loopStart', 0) if loop else 0
    le_t = marks.get('loopEnd') if loop else marks.get('end')
    s_ls = t2s(ls_t)
    B0 = int(round(s_ls * sr))
    Lexact = (t2s(le_t) - s_ls) * sr
    L = int(round(Lexact / fsynth.BLOCK) * fsynth.BLOCK) if loop else int(round(Lexact))
    def smp(tick, p=0):
        if tick < ls_t: return int(round(t2s(tick) * sr))
        return B0 + int(round((t2s(tick) - s_ls) * sr)) + p * L
    ev = [(0, k, *rest) for (k, *rest) in setup]
    passes = 2 if loop else 1
    for (t0, t1, ch, key, vel) in notes:
        for p in range(passes if t0 >= ls_t else 1):
            a = smp(t0, p)
            ev.append((a, 'on', ch, key, vel))
            if ch not in drums:  # 드럼 노트오프는 무시 (원샷 — 대부분의 GM 음원과 같은 동작)
                ev.append((max(a + 1, smp(t1, p) if t0 >= ls_t else smp(t1)), 'off', ch, key, 0))
    return dict(ev=ev, B0=B0, L=L, Lexact=Lexact, counts=counts, setup=setup, ls_t=ls_t, le_t=le_t, t2s=t2s)

def pick_ls(R, B0, L, sr):
    """본문 1회째와 2회째의 차이(= 서로 다른 앞선 꼬리)가 음악 대비 MATCH_DB 아래로 떨어지는 첫 지점(본문 기준 샘플)"""
    W = int(0.1 * sr); a0, a1 = int(X_MIN * sr), int(X_MAX * sr)
    A = R[B0:B0 + a1 + W]; Bq = R[B0 + L:B0 + L + a1 + W]
    P = np.concatenate([[0], np.cumsum((A * A).sum(axis=1))]); E = np.concatenate([[0], np.cumsum(((A - Bq) ** 2).sum(axis=1))])
    best, bm = a1, -1e9
    for s in range(a0, a1, 256):
        m = 10 * np.log10((P[s + W] - P[s - W] + 1e-12) / (E[s + W] - E[s - W] + 1e-15))
        if m >= MATCH_DB: return s
        if m > bm: best, bm = s, m
    return best

def ff(*a, inp=None):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *a], input=inp, capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr.decode()[-2000:])
    return r.stdout

def decode(path, sr, ignore_editlist=False):
    a = (['-ignore_editlist', '1'] if ignore_editlist else []) + ['-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '2', '-ar', str(sr), '-']
    return np.frombuffer(ff(*a), np.float32).reshape(-1, 2)

def find_offset(ref, dec, maxlag=8192):
    """dec 안에서 ref 내용이 시작하는 샘플 위치 (교차상관)"""
    s0 = 4096; n = 1 << 17
    a = ref[s0:s0 + n].mean(axis=1); b = dec[:s0 + n + maxlag].mean(axis=1)
    m = len(a) + len(b)
    nf = 1 << int(math.ceil(math.log2(m)))
    c = np.fft.irfft(np.fft.rfft(b, nf) * np.conj(np.fft.rfft(a, nf)), nf)
    lags = np.arange(len(c)); lags[lags > nf // 2] -= nf
    ok = (lags >= s0 - maxlag) & (lags <= s0 + maxlag)
    k = lags[ok][np.argmax(c[ok])]
    return int(k - s0)

def encode(F, sr, kbps, out, work):
    os.makedirs(work, exist_ok=True)
    wav = os.path.join(work, os.path.basename(out) + '.wav')
    wavfile.write(wav, sr, F.astype(np.float32))
    tmp = out + '.tmp.m4a'
    ff('-i', wav, '-c:a', 'aac', '-b:a', f'{kbps}k', '-ar', str(sr), '-ac', '2', '-movflags', '+faststart', '-map_metadata', '-1', tmp)
    os.replace(tmp, out)
    return wav

def build(spec_path):
    spec = json.load(open(spec_path))
    sr = spec['rate']; loop = spec['loop']
    S = schedule(spec, sr)
    B0, L = S['B0'], S['L']
    G = int(GUARD * sr)
    if loop:
        n = B0 + L + int(X_MAX * sr) + G + int(0.5 * sr)
        Lsec = L / sr
        cspeed = max(1, round(0.3 * Lsec)) / Lsec  # 코러스 LFO 주기를 루프 길이의 정수 분의 1로 → 2회째와 위상 일치
    else:
        n = B0 + L + int(8 * sr); cspeed = 0.3
    fx = dict(rate=sr, reverb=False, chorus_speed=cspeed)
    def scaled(chans, cc_off=(91,)):
        # chans: {mch: 진폭 배율} — CC7 에 √배율 (FluidSynth CC7 은 진폭 ∝ (cc/127)²), 목록 밖 채널은 뺀다
        out = []
        for e in S['ev']:
            if e[2] not in chans: continue
            if e[1] == 'cc' and e[3] == 7: e = (e[0], 'cc', e[2], 7, max(1, int(round(e[4] * math.sqrt(chans[e[2]])))))
            elif e[1] == 'cc' and e[3] in cc_off: e = (e[0], 'cc', e[2], e[3], 0)
            out.append(e)
        return out
    # 1) 마른 신호 (FluidSynth 내장 잔향 끔 — 2.3 의 FDN 잔향은 변조돼 패스마다 꼬리가 달라 루프 이음매가 안 맞는다)
    R = fsynth.render_events(S['ev'], n, **fx)[:n].astype(np.float64)
    # 2) 잔향 송신 버스: 채널별 rev (게임 채널 rev ≙ CC91) 로 가중한 같은 연주
    rv = {int(k): v for k, v in spec['rev'].items() if v > 0}
    send = np.zeros_like(R)
    if rv:
        rmax = max(rv.values())
        send = rmax * fsynth.render_events(scaled({k: v / rmax for k, v in rv.items()}), n, **fx)[:n].astype(np.float64)
    # 3) 리드 딜레이 송신 (게임 엔진 템포 딜레이 재현, 딜레이 출력의 30 % 는 잔향으로)
    if spec.get('delay'):
        dch = {int(k): v * v for k, v in spec['delay']['chans'].items()}
        dry = fsynth.render_events(scaled(dch, (91, 93)), n, rate=sr, reverb=False, chorus=False)[:n]
        echo = spec['delay']['gain'] * dsp.tempo_delay(dry, sr, spec['delay']['time']).astype(np.float64)
        R += echo; send += 0.3 * echo
    # 4) 컨볼루션 잔향 (게임 makeIR 대성당 IR, 고역 통과 170 Hz, ×0.85) — 선형 시불변
    R += dsp.reverb(send, sr, dsp.game_ir(sr))
    if loop:
        LS = B0 + pick_ls(R, B0, L, sr); LE = LS + L
    # ── 음량: 통합 라우드니스 → 목표, 트루 피크 리미터, 보정 반복 ──
    end = LE if loop else n
    if not loop:
        # 꼬리 끝: −72 dBFS 아래로 떨어진 지점 + 0.2 s
        a = np.abs(R).max(axis=1); thr = a.max() * 10 ** (-72 / 20)
        last = np.nonzero(a > thr)[0][-1]
        end = min(n, last + int(0.2 * sr))
    R0 = R
    g_db = spec['lufs'] - dsp.lufs(R0[:end], sr)
    for it in range(5):
        R, lim_db = dsp.limit(R0 * 10 ** (g_db / 20), sr, CEIL)
        L1 = dsp.lufs(R[:end], sr)
        if abs(L1 - spec['lufs']) < 0.08: break
        g_db += spec['lufs'] - L1
    # ── 잘라내기 ──
    if loop:
        w = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, XF))[:, None]
        G2 = G + (-(LE + G)) % 1024  # 길이를 1024 배수로 → 디코드 길이 = samples (프라이밍 미제거면 +1024) 로 모호함 없음
        F = np.concatenate([R[:LE - XF], R[LE - XF:LE] * (1 - w) + R[LS - XF:LS] * w, R[LS:LS + G2]])
        W = int(0.1 * sr); ra, rb = R[LE - W:LE + W], R[LS - W:LS + W]
        pre_match = 10 * np.log10(np.sum(ra ** 2) / max(1e-15, np.sum((ra - rb) ** 2)))
    else:
        end += (-end) % 1024
        F = R[:end].copy(); fo = int(0.15 * sr)
        F[-fo:] *= np.linspace(1, 0, fo)[:, None]
        LS = LE = 0; pre_match = None
    F = F.astype(np.float32)
    # ── 인코드 → 디코드 → 프라이밍/피크 확인 (피크 초과면 이득 낮춰 재인코드) ──
    for it in range(4):
        wav = encode(F, sr, spec['kbps'], spec['out'], spec['work'])
        D = decode(spec['out'], sr)
        off = find_offset(F, D)
        Draw = decode(spec['out'], sr, ignore_editlist=True)
        priming = find_offset(F, Draw)
        Y = D[off:off + len(F)] if off >= 0 else np.concatenate([np.zeros((-off, 2), np.float32), D])[:len(F)]
        tp = dsp.true_peak(Y)
        if tp <= spec['tp'] - 0.05: break
        F *= np.float32(10 ** ((spec['tp'] - 0.15 - tp) / 20))
    lu = dsp.lufs(Y[:LE] if loop else Y, sr)
    clip = int((np.abs(Y) >= 0.9999).sum())
    q = dict(kbps=spec['kbps'], limitDb=lim_db, clip=clip, decodedLen=len(D), rawLen=len(Draw), editOffset=off, priming=priming,
             prematch_db=pre_match)
    if loop:
        q['seam'] = dsp.seam_metrics(Y, LS, LE, sr)
        q['seam_src'] = dsp.seam_metrics(F, LS, LE, sr)
    # 길이 점검: 템포 계산(이상값) 대 실제 샘플
    ideal = spec['ideal']
    q['durErrMs'] = max(abs(B0 / sr - ideal['intro']), abs(L / sr - ideal['body'])) * 1000
    q['Lexact'] = S['Lexact']; q['B0'] = B0; q['L'] = L
    # 노트 수: 컴파일 결과 = MIDI(+중복 제거) = MIDI 파일에서 다시 읽은 수
    msgs = []
    for p in spec['parts']:
        got = S['counts'].get(p['mch'], 0)
        if p['inst'] == 'kit:z':
            if got < p['midi']: msgs.append(f"{p['cid']}: midi {got} < {p['midi']}")
            continue
        if p['midi'] + p['dedup'] != p['compiled'] and not p['inst'] == 'kit': msgs.append(f"{p['cid']}: compiled {p['compiled']} ≠ midi {p['midi']}+{p['dedup']}")
        if p['inst'] == 'kit' and p['midi'] + p['dedup'] != p['compiled']: msgs.append(f"{p['cid']}: kit compiled {p['compiled']} ≠ {p['midi']}+{p['dedup']}")
        if p['compiled'] == 0: msgs.append(f"{p['cid']}: silent")
    # 같은 MIDI 채널의 노트 수 합 (taiko 는 별도 채널)
    perch = {}
    for p in spec['parts']: perch[p['mch']] = perch.get(p['mch'], 0) + p['midi']
    for ch, c in perch.items():
        if S['counts'].get(ch, 0) != c: msgs.append(f"ch{ch}: file {S['counts'].get(ch, 0)} ≠ {c}")
    q['notesOk'] = not msgs; q['notesMsg'] = '; '.join(msgs)
    q['parts'] = spec['parts']
    if spec.get('spectro'):
        ff('-i', spec['out'], '-lavfi', 'showspectrumpic=s=1400x512:mode=combined:color=intensity:scale=log:fscale=log:legend=1', spec['spectro'])
    q['xSec'] = round((LS - B0) / sr, 3) if loop else None
    entry = dict(file=os.path.basename(spec['out']), bytes=os.path.getsize(spec['out']), duration=round(len(F) / sr, 6), loop=loop,
                 loopStart=round(LS / sr, 6) if loop else 0, loopEnd=round(LE / sr, 6) if loop else round(len(F) / sr, 6),
                 loopStartSample=int(LS) if loop else 0, loopEndSample=int(LE) if loop else int(len(F)), samples=int(len(F)),
                 priming=int(priming - off), lufs=round(lu, 2), peak=round(tp, 2), kbps=spec['kbps'])
    json.dump(dict(entry=entry, qa=q), open(spec['stats'], 'w'), indent=1, default=float)
    try: os.remove(wav)
    except OSError: pass
    print(json.dumps(entry))

def check(index_path, only=None, budget=30.0, tpmax=-1.0):
    idx = json.load(open(index_path)); base = os.path.dirname(index_path); sr = idx['rate']
    fails = []; tot = 0
    print(f"{'id':10} {'dur':>7} {'loop':>17} {'LUFS':>6} {'dBTP':>6} {'jump':>5} {'hf':>5} {'match':>6} {'KiB':>6}")
    for k, t in idx['tracks'].items():
        f = os.path.join(base, t['file'])
        if not os.path.exists(f): fails.append(f'{k}: 파일 없음'); continue
        b = os.path.getsize(f); tot += b
        if only and k not in only: continue
        if b != t['bytes']: fails.append(f"{k}: bytes {b} ≠ {t['bytes']}")
        D = decode(f, sr); Draw = decode(f, sr, ignore_editlist=True)
        if abs(len(D) - t['samples']) > 2048: fails.append(f"{k}: 디코드 길이 {len(D)} ≠ {t['samples']}")
        if abs((len(Draw) - len(D)) - t['priming']) > 2048 + 1024: fails.append(f"{k}: priming 불일치 raw {len(Draw)} dec {len(D)}")
        lu = dsp.lufs(D[:t['loopEndSample']] if t['loop'] else D, sr); tp = dsp.true_peak(D)
        if abs(lu - t['lufs']) > 0.3: fails.append(f"{k}: LUFS {lu:.2f} ≠ {t['lufs']}")
        if not -18.5 <= lu <= -13.5: fails.append(f'{k}: LUFS {lu:.2f} 범위 밖')
        if tp > tpmax + 0.05: fails.append(f'{k}: 트루 피크 {tp:.2f} > {tpmax}')
        if abs(t['duration'] - t['samples'] / sr) > 1e-4: fails.append(f'{k}: duration ≠ samples/rate')
        s = dict(jump=0, hf=0, match_db=0)
        if t['loop']:
            if not 0 < t['loopStart'] < t['loopEnd'] <= t['duration']: fails.append(f'{k}: 루프 지점 이상')
            if abs(t['loopStart'] * sr - t['loopStartSample']) > 1 or abs(t['loopEnd'] * sr - t['loopEndSample']) > 1: fails.append(f'{k}: 루프 초/샘플 불일치')
            s = dsp.seam_metrics(D, t['loopStartSample'], t['loopEndSample'], sr)
            if s['jump'] > 1.5 or s['hf'] > 1.5: fails.append(f"{k}: 이음매 튐 jump {s['jump']:.2f} hf {s['hf']:.2f}")
        print(f"{k:10} {t['duration']:7.2f} {t['loopStart']:8.3f}-{t['loopEnd']:8.3f} {lu:6.2f} {tp:6.2f} {s['jump']:5.2f} {s['hf']:5.2f} {s['match_db']:6.1f} {b / 1024:6.0f}")
    mb = tot / 1048576
    print(f'합계 {len(idx["tracks"])}곡 {mb:.2f} MB (예산 {budget} MB), 별칭 {idx.get("alias", {})}')
    for a, tgt in idx.get('alias', {}).items():
        if tgt not in idx['tracks']: fails.append(f'별칭 {a} → {tgt} 없음')
    if mb > budget: fails.append(f'용량 {mb:.2f} MB > {budget} MB')
    for f in fails: print('FAIL', f)
    if not fails: print('OK')

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'build': build(sys.argv[2])
    elif mode == 'check':
        a = sys.argv[3:]; g = lambda k, d: a[a.index(k) + 1] if k in a else d
        only = g('--only', None)
        check(sys.argv[2], only.split(',') if only else None, float(g('--budget', 30)), float(g('--tp', -1.0)))
