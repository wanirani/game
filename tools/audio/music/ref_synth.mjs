// 원본 절차적 신스 기준 측정 (선택 QA 도구) — 게임의 Engine/Player 를 OfflineAudioContext 로 그대로 돌려
// 채널별 단독(마른 신호) 음량과 전체 믹스의 옥타브 대역 분포를 잰다. build_music.mjs --balance 가 쓴다.
// 필요: node-web-audio-api (빌드 폴더에 설치: npm i --prefix $AUDIO_BUILD_DIR/wa node-web-audio-api)
import path from 'node:path';
import { createRequire } from 'node:module';
import { TRACKS } from '../../../src/data/music.js';
import { Engine, compileTrack } from '../../../src/core/audio.js';

const BUILD = process.env.AUDIO_BUILD_DIR || '/tmp/claude-0/audio_build';
let WA = null;
export function webAudio() {
  if (WA) return WA;
  const req = createRequire(path.join(BUILD, 'wa', 'package.json'));
  WA = req('node-web-audio-api');
  patchParams(WA);
  return WA;
}
// node-web-audio-api 결함 우회: 앞 이벤트와 틈이 있는 setTargetAtTime 의 대기 구간 값이 깨진다
// (예: setValue(0.5, 0) → setTarget(0, 0.8) 이면 0‥0.8 이 44088). 목표 시작 시각에 유지 값을 setValueAtTime 으로 넣어 준다.
function patchParams(W) {
  const c = new W.OfflineAudioContext(1, 128, 44100), P = Object.getPrototypeOf(c.createGain().gain);
  if (P.__patched) return; P.__patched = true;
  // 파라미터별 마지막 이벤트를 해석적으로 추적: set/ramp → 그 시각의 값, tgt → 시작값 v0·목표·시정수
  const st = new WeakMap(), o = { set: P.setValueAtTime, lin: P.linearRampToValueAtTime, exp: P.exponentialRampToValueAtTime, tgt: P.setTargetAtTime, cancel: P.cancelScheduledValues };
  const valueAt = (p, T) => {
    const e = st.get(p);
    if (!e) return p.value;
    if (e.k === 'tgt') return T <= e.t ? e.v0 : e.v + (e.v0 - e.v) * Math.exp(-(T - e.t) / e.tau);
    if ((e.k === 'lin' || e.k === 'exp') && T < e.t && e.p) {
      const f = Math.max(0, (T - e.p.t) / Math.max(1e-9, e.t - e.p.t));
      return e.k === 'lin' || e.p.v <= 0 || e.v <= 0 ? e.p.v + (e.v - e.p.v) * f : e.p.v * Math.pow(e.v / e.p.v, f);
    }
    return e.v;
  };
  P.setValueAtTime = function (v, t) { st.set(this, { k: 'set', v, t }); return o.set.call(this, v, t); };
  P.linearRampToValueAtTime = function (v, t) { const e = st.get(this); st.set(this, { k: 'lin', v, t, p: e ? { v: e.k === 'tgt' ? valueAt(this, e.t) : e.v, t: e.t } : { v: this.value, t: 0 } }); return o.lin.call(this, v, t); };
  P.exponentialRampToValueAtTime = function (v, t) { const e = st.get(this); st.set(this, { k: 'exp', v, t, p: e ? { v: e.k === 'tgt' ? valueAt(this, e.t) : e.v, t: e.t } : { v: this.value, t: 0 } }); return o.exp.call(this, v, t); };
  P.cancelScheduledValues = function (t) { st.delete(this); return o.cancel.call(this, t); };
  P.setTargetAtTime = function (v, t, tau) {
    const v0 = valueAt(this, t);
    o.set.call(this, v0, t);
    st.set(this, { k: 'tgt', v, t, tau, v0 });
    return o.tgt.call(this, v, t, tau);
  };
}

// K-가중 평균 제곱 (게이팅 없음 — 두 렌더가 같은 타임라인이므로 에너지 비교)
function kweight(sr) {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / sr); const Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416, a0 = 1 + K / Q + K * K;
  const s1 = { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / sr); const d = 1 + K / Q + K * K;
  const s2 = { b: [1, -2, 1], a: [2 * (K * K - 1) / d, (1 - K / Q + K * K) / d] };
  return [s1, s2];
}
export function kpower(chs, sr) {
  const st = kweight(sr); let tot = 0;
  for (const x of chs) {
    let y = Float64Array.from(x);
    for (const s of st) {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < y.length; i++) { const xi = y[i], yi = s.b[0] * xi + s.b[1] * x1 + s.b[2] * x2 - s.a[0] * y1 - s.a[1] * y2; x2 = x1; x1 = xi; y2 = y1; y1 = yi; y[i] = yi; }
    }
    let p = 0; for (let i = 0; i < y.length; i++) p += y[i] * y[i];
    tot += p / y.length;
  }
  return tot;
}

// 한 곡 렌더: keep(e, ci) 가 참인 이벤트만 연주 (null = 전부). 잔향·딜레이·마스터 컴프 우회(dry=true)
export async function renderOrig(id, keep = null, { dry = true, tail = 3, sr = 44100 } = {}) {
  const { OfflineAudioContext } = webAudio();
  const comp0 = compileTrack(TRACKS[id], id);
  const comp = { ...comp0, loop: false, secs: {} };
  for (const [k, s] of Object.entries(comp0.secs)) comp.secs[k] = { ...s, ev: keep ? s.ev.filter((e) => keep(e, e.c)) : s.ev };
  let dur = 0; for (const s of comp.seq) dur += comp.secs[s].beats * 60 / comp.secs[s].bpm;
  const len = Math.ceil((dur + tail) * sr);
  const ctx = new OfflineAudioContext(2, len, sr);
  const eng = new Engine(ctx);
  Object.defineProperty(eng, 'voices', { get: () => 0, set: () => {} }); // 오프라인 일괄 스케줄: 보이스 상한 끔
  eng.setVolumes(1, 0);
  if (dry) { eng.master.disconnect(); eng.master.connect(ctx.destination); }
  eng.compiled[id] = comp;
  const p = eng.playTrack(id, 0.05, 0.02);
  if (dry) { p.wet.disconnect(); p.dly.disconnect(); }
  p.schedule(dur + 1);
  const buf = await ctx.startRendering();
  return { chs: [buf.getChannelData(0), buf.getChannelData(1)], sr, dur, comp: comp0 };
}

// 옥타브 대역 에너지 (RBJ 대역 통과, Q=√2) — render.py 의 같은 필터와 비교
export const BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export function octaveBands(chs, sr) {
  return BANDS.map((f) => {
    const w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * Math.SQRT2), a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
    let tot = 0;
    for (const x of chs) {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0, p = 0;
      for (let i = 0; i < x.length; i++) { const y = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; p += y * y; }
      tot += p / x.length;
    }
    return 10 * Math.log10(tot + 1e-20);
  });
}

// 한 곡의 기준 측정: 채널별 단독 에너지(K 가중, dB) + 전체 마른 믹스의 옥타브 대역
export async function measureOrig(id) {
  const comp = compileTrack(TRACKS[id], id), out = { chans: {}, bands: null };
  for (const [ci, cd] of comp.chans.entries()) {
    if (cd.inst === 'kit') {
      const a = await renderOrig(id, (e, c) => c === ci && e.m !== 'z'); out.chans[cd.id] = 10 * Math.log10(kpower(a.chs, a.sr) + 1e-20);
      if (comp.seq.some((s) => comp.secs[s].ev.some((e) => e.c === ci && e.m === 'z'))) { const z = await renderOrig(id, (e, c) => c === ci && e.m === 'z'); out.chans[cd.id + '.z'] = 10 * Math.log10(kpower(z.chs, z.sr) + 1e-20); }
    } else {
      const a = await renderOrig(id, (e, c) => c === ci); out.chans[cd.id] = 10 * Math.log10(kpower(a.chs, a.sr) + 1e-20);
    }
  }
  const full = await renderOrig(id);
  out.bands = octaveBands(full.chs, full.sr); out.total = 10 * Math.log10(kpower(full.chs, full.sr));
  return out;
}

if (process.argv[2] === '--measure') {
  const r = await measureOrig(process.argv[3]);
  process.stdout.write(JSON.stringify(r));
}
