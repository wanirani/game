# libfluidsynth ctypes 래퍼 + 최소 SMF 리더 — 샘플 정확(64 블록 격자) 오프라인 렌더
#  render_events(events, n, opts) → float32 (n,2)
#  events: [(sample, kind, ch, a, b)] kind: 'on' 'off' 'cc' 'prog' 'drum'(채널 타입)
import ctypes, ctypes.util, struct
import numpy as np

SF2 = '/usr/share/sounds/sf2/FluidR3_GM.sf2'
BLOCK = 64  # FluidSynth 내부 블록 — 이벤트는 이 격자에서만 적용된다

_lib = None
def lib():
    global _lib
    if _lib: return _lib
    name = ctypes.util.find_library('fluidsynth') or 'libfluidsynth.so.3'
    L = ctypes.CDLL(name)
    vp, ci, cc, cd = ctypes.c_void_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_double
    sig = {
        'new_fluid_settings': ([], vp), 'delete_fluid_settings': ([vp], None),
        'fluid_settings_setnum': ([vp, cc, cd], ci), 'fluid_settings_setint': ([vp, cc, ci], ci), 'fluid_settings_setstr': ([vp, cc, cc], ci),
        'new_fluid_synth': ([vp], vp), 'delete_fluid_synth': ([vp], None),
        'fluid_synth_sfload': ([vp, cc, ci], ci),
        'fluid_synth_noteon': ([vp, ci, ci, ci], ci), 'fluid_synth_noteoff': ([vp, ci, ci], ci),
        'fluid_synth_cc': ([vp, ci, ci, ci], ci), 'fluid_synth_program_select': ([vp, ci, ci, ci, ci], ci),
        'fluid_synth_set_channel_type': ([vp, ci, ci], ci), 'fluid_synth_set_interp_method': ([vp, ci, ci], ci),
        'fluid_synth_write_float': ([vp, ci, vp, ci, ci, vp, ci, ci], ci),
        'fluid_set_log_function': ([ci, vp, vp], vp),
    }
    for k, (a, r) in sig.items():
        f = getattr(L, k); f.argtypes = a; f.restype = r
    # 경고 로그(누락 샘플 등) 끄기: FLUID_WARN=2, FLUID_INFO=3, FLUID_DBG=4
    for lvl in (2, 3, 4): L.fluid_set_log_function(lvl, None, None)
    _lib = L
    return L

DEFAULT_OPTS = dict(rate=44100, gain=0.5, room=0.82, damp=0.35, width=0.9, level=1.0,
                    chorus_level=1.2, chorus_speed=0.3, chorus_depth=6.0, chorus_nr=3, reverb=True, chorus=True)

class Synth:
    def __init__(self, **o):
        o = {**DEFAULT_OPTS, **o}
        L = self.L = lib()
        s = self.s = L.new_fluid_settings()
        L.fluid_settings_setnum(s, b'synth.sample-rate', float(o['rate']))
        L.fluid_settings_setnum(s, b'synth.gain', float(o['gain']))
        L.fluid_settings_setint(s, b'synth.polyphony', 2048)
        L.fluid_settings_setint(s, b'synth.midi-channels', 48)
        L.fluid_settings_setint(s, b'synth.reverb.active', 1 if o['reverb'] else 0)
        L.fluid_settings_setint(s, b'synth.chorus.active', 1 if o['chorus'] else 0)
        L.fluid_settings_setnum(s, b'synth.reverb.room-size', float(o['room']))
        L.fluid_settings_setnum(s, b'synth.reverb.damp', float(o['damp']))
        L.fluid_settings_setnum(s, b'synth.reverb.width', float(o['width']))
        L.fluid_settings_setnum(s, b'synth.reverb.level', float(o['level']))
        L.fluid_settings_setnum(s, b'synth.chorus.level', float(o['chorus_level']))
        L.fluid_settings_setnum(s, b'synth.chorus.speed', float(o['chorus_speed']))
        L.fluid_settings_setnum(s, b'synth.chorus.depth', float(o['chorus_depth']))
        L.fluid_settings_setint(s, b'synth.chorus.nr', int(o['chorus_nr']))
        L.fluid_settings_setint(s, b'synth.cpu-cores', 1)
        self.y = L.new_fluid_synth(s)
        if L.fluid_synth_sfload(self.y, SF2.encode(), 1) < 0: raise RuntimeError('sf2 load failed')
        L.fluid_synth_set_interp_method(self.y, -1, 7)  # 7차 sinc 보간 (최고 품질)
        self.pos = 0
    def close(self):
        self.L.delete_fluid_synth(self.y); self.L.delete_fluid_settings(self.s)
    def render(self, out, start, n):
        # out[start:start+n] 에 기록 (n 은 BLOCK 배수 권장)
        if n <= 0: return
        l = np.zeros(n, np.float32); r = np.zeros(n, np.float32)
        self.L.fluid_synth_write_float(self.y, n, l.ctypes.data, 0, 1, r.ctypes.data, 0, 1)
        out[start:start + n, 0] = l; out[start:start + n, 1] = r
        self.pos += n
    def event(self, kind, ch, a=0, b=0):
        L, y = self.L, self.y
        if kind == 'on': L.fluid_synth_noteon(y, ch, a, b)
        elif kind == 'off': L.fluid_synth_noteoff(y, ch, a)
        elif kind == 'cc': L.fluid_synth_cc(y, ch, a, b)
        elif kind == 'prog': L.fluid_synth_program_select(y, ch, 1, a, b)  # sfont id 1, bank a, preset b
        elif kind == 'drum': L.fluid_synth_set_channel_type(y, ch, 1)

KORDER = {'drum': 0, 'prog': 1, 'cc': 2, 'off': 3, 'on': 4}

def render_events(events, n, **opts):
    """events: [(sample, kind, ch, a, b)] — 각 이벤트는 floor(sample/BLOCK)*BLOCK 에서 적용 (결정적 격자)"""
    n = int(np.ceil(n / BLOCK) * BLOCK)
    out = np.zeros((n, 2), np.float32)
    sy = Synth(**opts)
    try:
        ev = sorted(events, key=lambda e: (e[0] // BLOCK, KORDER[e[1]]))
        cur = 0
        for e in ev:
            at = min(n, (e[0] // BLOCK) * BLOCK)
            if at > cur:
                # 큰 덩어리로 나눠 렌더 (메모리)
                while cur < at:
                    k = min(at - cur, BLOCK * 4096); sy.render(out, cur, k); cur += k
            if at >= n: break
            sy.event(*e[1:])
        while cur < n:
            k = min(n - cur, BLOCK * 4096); sy.render(out, cur, k); cur += k
    finally:
        sy.close()
    return out

# ── 최소 SMF 리더 (format 0/1, running status, 템포·마커·포트 메타) ──
def read_smf(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'MThd'
    fmt, ntr, div = struct.unpack('>HHH', data[8:14])
    p = 8 + struct.unpack('>I', data[4:8])[0]
    tracks = []
    for _ in range(ntr):
        assert data[p:p + 4] == b'MTrk'
        ln = struct.unpack('>I', data[p + 4:p + 8])[0]; q = p + 8; end = q + ln; p = end
        t = 0; rs = 0; port = 0; evs = []
        while q < end:
            v = 0
            while True:
                c = data[q]; q += 1; v = (v << 7) | (c & 0x7f)
                if not c & 0x80: break
            t += v
            st = data[q]
            if st & 0x80: q += 1
            else: st = rs
            if st == 0xff:
                typ = data[q]; q += 1
                l = 0
                while True:
                    c = data[q]; q += 1; l = (l << 7) | (c & 0x7f)
                    if not c & 0x80: break
                body = data[q:q + l]; q += l
                if typ == 0x51: evs.append((t, 'tempo', int.from_bytes(body, 'big')))
                elif typ == 0x06: evs.append((t, 'marker', body.decode('latin1')))
                elif typ == 0x21: port = body[0]
                elif typ == 0x2f: break
            elif st in (0xf0, 0xf7):
                l = 0
                while True:
                    c = data[q]; q += 1; l = (l << 7) | (c & 0x7f)
                    if not c & 0x80: break
                q += l
            else:
                rs = st; hi = st & 0xf0; ch = (st & 0x0f) + 16 * port
                if hi in (0xc0, 0xd0): a = data[q]; q += 1; b = 0
                else: a, b = data[q], data[q + 1]; q += 2
                if hi == 0x90 and b == 0: hi = 0x80
                evs.append((t, hi, ch, a, b))
        tracks.append(evs)
    return div, tracks

def tempo_map(div, tracks):
    tm = sorted([(e[0], e[2]) for tr in tracks for e in tr if e[1] == 'tempo'])
    if not tm or tm[0][0] != 0: tm.insert(0, (0, 500000))
    seg = []  # (tick0, sec0, sec_per_tick)
    sec = 0.0
    for i, (t, us) in enumerate(tm):
        if seg: sec = seg[-1][1] + (t - seg[-1][0]) * seg[-1][2]
        seg.append((t, sec, us / 1e6 / div))
    def t2s(tick):
        k = 0
        for i in range(len(seg)):
            if seg[i][0] <= tick: k = i
            else: break
        t0, s0, spt = seg[k]
        return s0 + (tick - t0) * spt
    return t2s
