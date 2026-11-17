// 타격감 소리 (v2 · 3D 판) — 표(table.js)의 층을 v1 오디오 엔진(src/core/audio.js) 위에서 울린다. **두 번째 오디오 시스템이 아니다**:
//  · 소리는 전부 audio.sfx('f3_*') 한 번 = 엔진 효과음 인스턴스 하나 (동시 26개 상한·같은 이름 상한·체감 예산·음량·리미터가 v1 그대로 먹는다)
//  · 새 샘플(assets/v2/audio)은 v1 의 V2Bank 클래스를 한 벌 더 만들어 받는다 (같은 받기·풀기 코드: 휴대폰은 32 kHz, 드문 소리 24 kHz)
//  · 옛 샘플(assets/audio/sfx_v2)은 엔진이 이미 풀어 둔 버퍼를 그대로 층으로 쓴다 (추가 메모리 0)
//  · 방 울림은 엔진의 방 컨볼버(eng.room) 하나를 같이 쓰고 임펄스만 바꾼다 (컨볼버 추가 0)
//  인스턴스 하나의 그래프: [층: 버퍼소스→게인]… → (저역 통과 1개: 거리·느린 화면) → S.out(엔진) → 팬 → 효과음 버스. 방 울림은 S.out → 송신 게인 → eng.room
//  프레임마다 하는 일은 없다 (update 는 고리 감시만, 0.5초에 한 번). 재생 때 만드는 JS 객체는 WebAudio 노드뿐이다.
import { audio, defineSfx, V2Bank, SFX } from '../../core/audio.js';
import { EVENTS, hitFeel, swingFeel, usedSources, QUALITY, stepEvent } from './table.js';

export const NEW_DIR = 'v2/audio/';   // ASSET_ROOT 기준 (assets/v2/audio/)
const R = Math.random;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ───────────────────────────── 엔진 효과음 묶음 ─────────────────────────────
// max 같은 묶음 동시 수 · gap 중복 억제(초) · feel 체감 예산(100ms 에 10/8/6개) 대상 · prio 예산 제외 · rev 대성당 잔향 송신(엔진에 원래 있는 것)
export const BUS = Object.freeze({
  f3_hit: { max: 6, gap: 0, vary: 0, feel: true },
  f3_swing: { max: 4, gap: 0.03, vary: 0, feel: true },
  f3_step: { max: 3, gap: 0.045, vary: 0, feel: true },
  f3_foley: { max: 4, gap: 0.02, vary: 0, feel: true },
  f3_enemy: { max: 5, gap: 0.03, vary: 0, feel: true },
  f3_magic: { max: 5, gap: 0.02, vary: 0 },
  f3_big: { max: 3, gap: 0.05, vary: 0, feel: true, prio: true },
  f3_bell: { max: 3, gap: 0.05, vary: 0, feel: true, prio: true, rev: 0.2 },
  f3_ui: { max: 2, gap: 0.02, vary: 0 },
  f3_loop: { max: 5, gap: 0, vary: 0 },
});

// ───────────────────────────── 공간: 방 울림 4종 ─────────────────────────────
// sec 길이 · refl 초기 반사 수 · slap 첫 반사까지(초) · damp 고역 감쇠(클수록 밝다) · send 보내는 양
export const ROOMS = Object.freeze({
  street: { label: '거리', sec: 0.5, refl: 5, slap: 0.045, damp: 0.5, send: 0.08 },
  alley: { label: '골목', sec: 0.6, refl: 14, slap: 0.016, damp: 0.6, send: 0.13 },
  courtyard: { label: '마당', sec: 0.95, refl: 7, slap: 0.07, damp: 0.42, send: 0.1 },
  hall: { label: '던전 큰 방', sec: 1.7, refl: 16, slap: 0.03, damp: 0.26, send: 0.2 },
});
const irCache = new Map();   // '방@rate' → 임펄스 버퍼 (4종 합계 약 1.4 MB @48 kHz)
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function makeIR(c, room, seed) {
  const sr = c.sampleRate, n = Math.max(1, Math.floor(sr * room.sec)), b = c.createBuffer(2, n, sr), rnd = lcg(seed);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) { const x = i / n; lp += (rnd() * 2 - 1 - lp) * room.damp * (1 - 0.7 * x); d[i] = lp * Math.pow(1 - x, 2.4) * 0.5 * Math.min(1, i / (sr * room.slap * 0.5)); }
    for (let r = 0; r < room.refl; r++) { const i = Math.floor(sr * (room.slap * (0.8 + rnd() * 0.5) + (r / room.refl) * room.sec * 0.4 * rnd())); if (i < n) d[i] += (rnd() * 2 - 1) * 0.7 * (1 - 0.7 * r / room.refl); }
  }
  return b;
}

// ───────────────────────────── 고리 버퍼 (실행 중에 한 번 만든다 — 파일 0바이트, 이음매 없음) ─────────────────────────────
// AAC 파일은 앞뒤 채움 때문에 고리가 튄다 → 22.05 kHz 모노 버퍼를 수식으로 만든다 (한 종류 26–88 KB PCM, 처음 쓸 때 1–3 ms)
const LOOP_SR = 22050, LOOP_LEN = { torch: 2.0, street: 4.0, fire: 1.2, ice: 1.2, lightning: 1.0, holy: 1.6, blood: 1.6 };
const loopCache = new Map();
function loopBuf(c, kind) {
  let b = loopCache.get(kind);
  if (b) return b;
  const len = LOOP_LEN[kind] || 1.2, n = Math.floor(LOOP_SR * len), rnd = lcg(kind.length * 7919 + kind.charCodeAt(0) * 104729), TAU = Math.PI * 2;
  b = c.createBuffer(1, n, LOOP_SR);
  const d = b.getChannelData(0), cyc = (k, i) => Math.sin(TAU * k * i / n);   // 고리 길이에 정수 번 들어가는 사인 → 이음매 없음
  const noise = (k, pass = 2) => { let lp = 0; const o = new Float32Array(n); for (let p = 0; p < pass; p++) for (let i = 0; i < n; i++) { lp += (rnd() * 2 - 1 - lp) * k; o[i] = lp; } return o; };   // 2번 돌려 필터 상태를 고리에 맞춘다
  const burst = (count, tau, g, hp) => { for (let j = 0; j < count; j++) { const at = Math.floor(rnd() * n), m = Math.floor(LOOP_SR * tau * 5), a = g * (0.4 + rnd() * 0.6); let prev = 0; for (let i = 0; i < m; i++) { const x = rnd() * 2 - 1, y = hp ? x - prev : x; prev = x; d[(at + i) % n] += y * a * Math.exp(-i / (LOOP_SR * tau)); } } };
  if (kind === 'torch') {
    const lo = noise(0.09), mid = noise(0.4);
    for (let i = 0; i < n; i++) d[i] = lo[i] * 1.6 * (0.7 + 0.2 * cyc(3, i) + 0.1 * cyc(7, i)) + mid[i] * 0.12 * (0.6 + 0.4 * cyc(11, i));
    burst(16, 0.0025, 0.5, true); burst(5, 0.006, 0.35, false);
  } else if (kind === 'street') {
    const lo = noise(0.035), air = noise(0.5);
    for (let i = 0; i < n; i++) d[i] = lo[i] * 2.4 * (0.62 + 0.26 * cyc(1, i) + 0.12 * cyc(3, i)) + air[i] * 0.05 * (0.6 + 0.4 * cyc(2, i));
  } else if (kind === 'fire') {
    const lo = noise(0.12), mid = noise(0.45);
    for (let i = 0; i < n; i++) d[i] = lo[i] * 1.5 * (0.7 + 0.3 * cyc(9, i)) + mid[i] * 0.22 * (0.6 + 0.4 * cyc(5, i));
    burst(14, 0.003, 0.45, true);
  } else if (kind === 'ice') {
    const air = noise(0.8);
    for (let i = 0; i < n; i++) { let v = 0; for (const [k, a] of [[2520, 1], [3384, 0.7], [4212, 0.6], [5544, 0.4], [7128, 0.25]]) v += a * cyc(k, i) * (0.6 + 0.4 * cyc(3 + (k % 5), i)); d[i] = v * 0.16 + air[i] * 0.12 * (0.5 + 0.5 * cyc(6, i)); }
    burst(8, 0.002, 0.3, true);
  } else if (kind === 'lightning') {
    const air = noise(0.9);
    for (let i = 0; i < n; i++) { const ph = (110 * i / n) % 1, saw = 2 * ph - 1, gate = cyc(13, i) > -0.2 ? 1 : 0.25; d[i] = saw * 0.2 * gate * (0.6 + 0.4 * cyc(37, i)) + air[i] * 0.16 * gate; }
    burst(12, 0.0015, 0.5, true);
  } else if (kind === 'holy') {
    const air = noise(0.6);
    for (let i = 0; i < n; i++) { let v = 0; for (const [k, a, m] of [[940, 1, 2], [1408, 0.7, 3], [1880, 0.6, 5], [2368, 0.4, 4]]) v += a * cyc(k, i) * (0.6 + 0.4 * cyc(m, i)); d[i] = v * 0.14 + air[i] * 0.07; }
  } else {   // blood: 낮은 맥박 + 어두운 숨
    const lo = noise(0.06);
    for (let i = 0; i < n; i++) { const beat = Math.pow(Math.max(0, cyc(2, i)), 6); d[i] = (cyc(176, i) * 0.5 + cyc(264, i) * 0.3 + cyc(88, i) * 0.4) * (0.35 + 0.65 * beat) * 0.3 + lo[i] * 1.2 * (0.5 + 0.5 * beat); }
  }
  let pk = 0; for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
  const k = pk > 0 ? 0.5 / pk : 1; for (let i = 0; i < n; i++) d[i] *= k;
  loopCache.set(kind, b);
  return b;
}

// ───────────────────────────── 합성 층 (엔진 도우미 H.T 톤 · H.N 잡음 — 노드 2–6개) ─────────────────────────────
const RISE = {   // 모으기(0.85초): [잡음 필터, 톤 파형, 톤 f0→f1]
  fire: (S, H, l) => { H.N(S, l.at, 0.85, 0.5 * l.g, { a: 0.62, f: ['lowpass', 320, 2600, 0.9, 0.62] }); H.T(S, 'sawtooth', 70, 150, l.at, 0.85, 0.16 * l.g, { a: 0.6, sw: 0.62, f: ['lowpass', 700] }); },
  ice: (S, H, l) => { H.T(S, 'sine', 1300, 2900, l.at, 0.85, 0.16 * l.g, { a: 0.62, sw: 0.62, vib: [9, 22] }); H.N(S, l.at, 0.85, 0.2 * l.g, { a: 0.64, f: ['highpass', 5200] }); H.T(S, 'triangle', 650, 1450, l.at, 0.8, 0.08 * l.g, { a: 0.6, sw: 0.6 }); },
  lightning: (S, H, l) => { H.T(S, 'sawtooth', 90, 560, l.at, 0.85, 0.2 * l.g, { a: 0.64, sw: 0.64, f: ['highpass', 400], fm: [2.5, 3, 0.8] }); H.CRACKLE(S, l.at + 0.15, 0.6, 10, 0.3 * l.g, 4800); },
  holy: (S, H, l) => { H.ARP(S, 'sine', [74, 78, 81, 86, 90], 0.14, 0.5, 0.11 * l.g, { a: 0.05 }, l.at); H.N(S, l.at, 0.85, 0.18 * l.g, { a: 0.62, f: ['bandpass', 1800, 4200, 2, 0.62] }); },
  blood: (S, H, l) => { H.T(S, 'triangle', 110, 235, l.at, 0.85, 0.3 * l.g, { a: 0.64, sw: 0.64, vib: [5, 40] }); H.N(S, l.at, 0.85, 0.42 * l.g, { a: 0.64, f: ['lowpass', 260, 1100, 2.5, 0.64] }); },
};
export const SYN = {
  sub(S, H, l) { H.T(S, 'sine', 96 * l.p, 36, l.at, 0.2, 0.9 * l.g, { sw: 0.13 }); H.T(S, 'triangle', 190 * l.p, 72, l.at, 0.09, 0.32 * l.g, { sw: 0.07 }); },   // 낮은 쿵 (+ 휴대폰 스피커에 들리는 윗소리)
  thud(S, H, l) { H.N(S, l.at, 0.07, 0.5 * l.g, { f: ['lowpass', 900 * l.p, 220, 0.8] }); H.T(S, 'sine', 150 * l.p, 64, l.at, 0.085, 0.5 * l.g); },
  knock(S, H, l) { H.T(S, 'triangle', 420 * l.p, 240, l.at, 0.045, 0.4 * l.g); H.N(S, l.at, 0.02, 0.3 * l.g, { f: ['bandpass', 1400 * l.p, 0, 2.5] }); },
  snap(S, H, l) { H.N(S, l.at, 0.014, 0.6 * l.g, { f: ['highpass', 4200 * l.p] }); H.N(S, l.at, 0.03, 0.3 * l.g, { f: ['bandpass', 2400 * l.p, 0, 1.5] }); },   // 날카로운 순간음
  air(S, H, l) { H.N(S, l.at, 0.24, 0.5 * l.g, { a: 0.07, f: ['bandpass', 500 * l.p, 2400 * l.p, 1.2, 0.12] }); },   // 바람 가르는 소리 (올라갔다 꺼짐)
  scuff(S, H, l) { H.N(S, l.at, 0.05, 0.5 * l.g, { a: 0.008, f: ['bandpass', 3200 * l.p, 1800, 1.2] }); },
  wisp(S, H, l) { H.T(S, 'sine', 880 * l.p, 1320 * l.p, l.at, 0.42, 0.12 * l.g, { a: 0.08, vib: [6, 30] }); H.N(S, l.at, 0.36, 0.18 * l.g, { a: 0.1, f: ['bandpass', 2600 * l.p, 5200, 3] }); },
  drop(S, H, l) { H.T(S, 'sine', 150 * l.p, 30, l.at, 0.7, 0.9 * l.g, { sw: 0.5 }); H.T(S, 'triangle', 300 * l.p, 62, l.at, 0.45, 0.22 * l.g, { sw: 0.4 }); H.N(S, l.at, 0.5, 0.25 * l.g, { f: ['lowpass', 520, 90, 0.7] }); },
  zap(S, H, l) { H.T(S, 'sawtooth', 1800 * l.p, 240, l.at, 0.12, 0.22 * l.g, { f: ['highpass', 900], fm: [3.7, 2.2, 0.1] }); H.CRACKLE(S, l.at, 0.14, 6, 0.3 * l.g, 4200); },
  shimmer(S, H, l) { H.ARP(S, 'sine', [86, 93, 98, 105], 0.045, 0.36, 0.09 * l.g, { a: 0.01 }, l.at); },
  riser(S, H, l) { (RISE[l.el] || RISE.fire)(S, H, l); },
};

// ───────────────────────────── 재생 (엔진이 부르는 fn) ─────────────────────────────
const P = { rec: null, fs: null, lp: 0, send: 0, q: 2, dv: 1, handle: null };   // 이번 호출의 인자 (audio.sfx 는 동기라 모듈 변수로 넘긴다)
const SS = { e: null, c: null, t: 0, p: 1, v: 1, out: null, end: 0 };   // 층에 넘기는 S (목적지만 바꾼 사본, 다시 씀)
const S2 = { e: null, c: null, t: 0, p: 1, v: 1, out: null, end: 0 };   // 옛 합성음 대체용
function sample(S, l, fs) {
  const e = S.e, m = l.k === 'n' ? (fs.bank ? fs.bank.sample(l.n) : null) : e.v2 ? e.v2.sample(l.n) : null;
  if (!m) {
    fs.miss++;
    // 옛 샘플이 아직 안 풀렸거나(첫 호출) 이 브라우저가 m4a 를 못 풀면 → v1 합성음으로 대신한다 (소리가 비지 않게)
    const d = l.k === 'o' && Object.hasOwn(SFX, l.n) ? SFX[l.n] : null;
    if (d) { S2.e = e; S2.c = S.c; S2.t = S.t + l.at; S2.p = S.p * l.p; S2.v = S.v * l.g * (d.vol ?? 1); S2.out = S.out; S2.end = 0; try { d.fn(S2, fs.H); } catch { /* 무시 */ } if (l.at + S2.end > S.end) S.end = l.at + S2.end; }
    return;
  }
  const vr = m.vr, k = vr ? vr.length : m.bufs.length; let i = 0;
  if (k > 1) { if (m.last < 0) i = (R() * k) | 0; else { i = (R() * (k - 1)) | 0; if (i >= m.last) i++; } }   // 돌려 쓰기: 바로 앞 변형은 피한다
  m.last = i;
  const b = m.bufs[i % m.bufs.length], c = S.c, src = c.createBufferSource(), g = c.createGain();
  const rate = Math.max(0.25, S.p * l.p * (vr ? vr[i] : 1) * (1 + (R() * 2 - 1) * l.pv)), lvl = S.v * m.g * l.g * (1 + (R() * 2 - 1) * l.gv);
  const t = S.t + l.at, off = b.off + (l.sv ? R() * l.sv : 0);
  src.buffer = b.buf; src.playbackRate.value = rate;
  if (l.sv) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + 0.004); } else g.gain.value = lvl;   // 중간에서 시작하면 4 ms 로 올린다 (딸깍 방지)
  src.connect(g); g.connect(S.out); src.start(t, off);
  const d = l.at + (b.buf.duration - off) / rate;
  if (d > S.end) S.end = d;
}
function run(S, H) {
  const rec = P.rec, fs = P.fs;
  if (!rec || !fs) return;   // feel 을 거치지 않고 audio.sfx('f3_hit') 를 직접 부르면 아무 소리도 안 난다
  const c = S.c, q = P.q;
  fs.H = H;
  let dst = S.out, filt = null;
  if (P.lp > 0 || (q >= 1 && (rec.big || rec.loop))) {
    filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = 0.5; filt.frequency.value = P.lp > 0 ? P.lp : 20000;
    filt.connect(S.out); dst = filt;
  }
  if (P.send > 0) { const room = fs._room(S.e); if (room) { const g = c.createGain(); g.gain.value = P.send; S.out.connect(g); g.connect(room); } }
  SS.e = S.e; SS.c = c; SS.t = S.t; SS.p = S.p; SS.v = S.v; SS.out = dst; SS.end = 0;
  if (rec.loop) {
    const src = c.createBufferSource(), g = c.createGain(), life = rec.life || 8;
    src.buffer = loopBuf(c, rec.loop); src.loop = true; src.playbackRate.value = S.p;
    g.gain.setValueAtTime(0, S.t); g.gain.linearRampToValueAtTime(S.v, S.t + 0.18);
    src.connect(g); g.connect(dst); src.start(S.t, R() * src.buffer.duration); src.stop(S.t + life);
    SS.end = life; P.handle = { src, g, filt, v: S.v / (P.dv || 1) };   // v = 거리 감쇠를 뺀 기준 음량 (loopMove 가 거리를 다시 곱한다)
  }
  const ls = rec.layers;
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (l.q > q) continue;
    fs.layersPlayed++;
    if (l.k === 's') { const f = SYN[l.n]; if (f) f(SS, H, l); } else sample(SS, l, fs);
  }
  S.end = SS.end;
  if (filt) fs._track(filt, P.lp > 0 ? P.lp : 20000, S.t + SS.end);
}
let defined = false;
function define() {
  if (defined) return;
  defined = true;
  for (const k in BUS) defineSfx(k, { ...BUS[k], fn: run }, 1);
}

const OPT = { vol: 1, pitch: 1, pan: 0, delay: 0 };   // 엔진에 넘기는 옵션 (다시 씀)

/**
 * 소리 재생기. host = v1 의 audio (기본) 또는 { eng, sfx(name, o), duck(a, t), quality } (오프라인 검사가 엔진을 직접 넣는다).
 */
export class FeelSound {
  constructor(host = audio) {
    define();
    this.host = host; this.bank = null; this.bankP = null; this.H = null;
    this.room = 'street'; this._ir = null; this._irKey = '';
    this.L = { px: 0, py: 300, pz: -700, rx: 1, rz: 0, fx: 0, fy: -0.3, fz: 0.95, ref: 800, tan: 0.62, on: false };   // 듣는 이(카메라)
    this.timeScale = 1; this.qOverride = -1;
    this.filters = []; for (let i = 0; i < 24; i++) this.filters.push({ f: null, base: 20000, end: 0 }); this._fi = 0;
    this.loops = []; this._loopId = 0; this._upT = 0;
    this._hitT = -1; this._hitN = 0;
    this.miss = 0; this.starts = 0; this.layersPlayed = 0;
  }
  get eng() { return this.host.eng || null; }
  get q() { if (this.qOverride >= 0) return this.qOverride; const k = this.host.quality; return Object.hasOwn(QUALITY, k) ? QUALITY[k] : 2; }
  /** 품질 고정 ('low'|'medium'|'high'|null = 엔진을 따름) */
  setQuality(k) { this.qOverride = k != null && Object.hasOwn(QUALITY, k) ? QUALITY[k] : -1; }
  /** 새 샘플 뱅크를 붙인다 (컨텍스트가 생긴 뒤 한 번; play 가 알아서 부른다) → 다 받으면 풀리는 프라미스 */
  attach(ctx) {
    if (this.bankP) return this.bankP;
    this.bank = new V2Bank(NEW_DIR);
    return (this.bankP = this.bank.attach(ctx));
  }
  /** 표가 쓰는 옛 샘플 가운데 '드문 소리'(뼈 덜그럭·심장 박동 …)를 미리 풀어 둔다 — 스테이지 로딩 때 한 번 */
  preload() {
    const e = this.eng;
    if (!e) return Promise.resolve(false);
    const a = this.attach(e.ctx), v2 = e.v2;
    const b = v2 ? (v2.ixP || v2.index()).then(() => v2.load(usedSources().old)) : Promise.resolve();
    return Promise.all([a, b]).then(() => true, () => false);
  }
  /** 듣는 이 = 카메라. (px,py,pz) 위치 · (fx,fy,fz) 보는 방향(정규화) · ref 기준 거리(카메라→주인공: 이 거리의 소리가 음량 1) · tan 화면 반폭의 탄젠트 */
  setListener(px, py, pz, fx, fy, fz, ref, tan) {
    const L = this.L, h = Math.hypot(fx, fz) || 1;
    L.px = px; L.py = py; L.pz = pz; L.fx = fx; L.fy = fy; L.fz = fz; L.rx = fz / h; L.rz = -fx / h;
    if (ref > 0) L.ref = ref; if (tan > 0) L.tan = tan; L.on = true;
  }
  /** 방 울림: 'street' | 'alley' | 'courtyard' | 'hall' */
  setRoom(name) { if (Object.hasOwn(ROOMS, name)) this.room = name; }
  _room(e) {
    if (!e.ctx.createConvolver) return null;
    if (!e.room) { e.room = e.ctx.createConvolver(); e.room.connect(e.sfxG); }
    const key = this.room + '@' + e.ctx.sampleRate;
    if (this._irKey !== key) {   // 임펄스는 방마다 한 번만 만든다 (구역을 오갈 때 다시 만들지 않는다)
      let b = irCache.get(key);
      if (!b) { b = makeIR(e.ctx, ROOMS[this.room], 9001 + this.room.length * 131); irCache.set(key, b); }
      this._ir = b; this._irKey = key;
    }
    if (e.room.buffer !== this._ir) { e.room.buffer = this._ir; e.roomSpace = e.v2Space === 'open' || e.v2Space === 'cave' ? e.v2Space : 'hall'; }   // 엔진이 자기 임펄스로 되돌리지 않게 표시
    return e.room;
  }
  /** v2 장면을 떠날 때: 엔진의 방 울림을 v1 것으로 돌려놓게 한다 + 고리 정지 */
  release() { const e = this.eng; if (e) e.roomSpace = null; this._irKey = ''; for (const h of this.loops) this._stop(h, 0.1); this.loops.length = 0; }
  _track(f, base, end) { const s = this.filters[this._fi]; this._fi = (this._fi + 1) % this.filters.length; s.f = f; s.base = base; s.end = end; }
  _slowLp(s) { return s >= 0.95 ? 20000 : 600 + 9000 * s * s; }
  /** 게임 시간 배속 (느린 화면 0.25–1): 새 소리는 낮고 어둡게, 울리고 있는 큰 소리·고리는 저역 통과가 따라 움직인다 */
  setTimeScale(s) {
    s = clamp(+s || 1, 0.05, 1);
    if (Math.abs(s - this.timeScale) < 0.02) return;
    this.timeScale = s;
    const e = this.eng;
    if (!e) return;
    const now = e.ctx.currentTime, lp = this._slowLp(s);
    for (const x of this.filters) { if (!x.f) continue; if (x.end < now) { x.f = null; continue; } x.f.frequency.setTargetAtTime(Math.min(x.base, lp), now, 0.05); }
  }

  /** 표의 레시피 하나를 울린다. pos = {x, y, z} (월드, 없으면 화면 가운데) → 울렸으면 true */
  fire(rec, bus, pos, vol = 1, pitch = 1, delay = 0) {
    const host = this.host, e = host.eng;
    if (!e || !rec) return false;
    if (!this.bankP) this.attach(e.ctx);
    const q = this.q, L = this.L;
    let pan = 0, dv = 1, lp = 0;
    if (pos && L.on && !rec.flat) {
      const dx = pos.x - L.px, dy = (pos.y || 0) - L.py, dz = pos.z - L.pz;
      const depth = Math.max(1, dx * L.fx + dy * L.fy + dz * L.fz), lat = dx * L.rx + dz * L.rz, dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      pan = clamp(lat / (depth * L.tan), -1.15, 1.15) * 0.62;        // 화면 가장자리 ≈ ±0.62
      const k = L.ref / dist;
      dv = clamp(Math.pow(k, 0.9), 0.22, 1.12);                       // 거리 → 음량 (기준 거리 = 1)
      if (k < 0.83) lp = clamp(16000 * Math.pow(k * 1.2, 2.2), 1800, 16000);   // 기준의 1.2배보다 멀면 고역이 깎인다
    }
    const ts = this.timeScale;
    if (ts < 0.95) { const s = this._slowLp(ts); lp = lp > 0 ? Math.min(lp, s) : s; pitch *= 0.72 + 0.28 * ts; }
    P.rec = rec; P.fs = this; P.lp = lp; P.q = q; P.dv = dv; P.handle = null;
    P.send = rec.flat || q === 0 ? 0 : ROOMS[this.room].send * (rec.roomK ?? 1);
    OPT.vol = vol * dv * (rec.gain ?? 1); OPT.pitch = pitch; OPT.pan = rec.loop && pos && !rec.flat && pan === 0 ? 0.001 : pan; OPT.delay = delay;
    const before = e.stats.starts;
    try { host.sfx(bus, OPT); } finally { P.rec = null; }
    if (e.stats.starts === before) return false;   // 엔진이 걸렀다 (중복·예산)
    this.starts++;
    if (rec.duck && host.duck) host.duck(rec.duck[0], rec.duck[1]);
    return true;
  }
  /** 사건 이름으로 (table.js EVENTS): 'move.dash', 'magic.fire.impact', 'bell.dawn', 'ui.ok' … → 레시피(추천 경직·흔들림 포함) | null */
  play(name, pos, vol = 1, pitch = 1) {
    const rec = Object.hasOwn(EVENTS, name) ? EVENTS[name] : null;
    if (!rec || rec.loop) return null;
    this.fire(rec, rec.bus, pos, vol, pitch, 0);
    return rec;
  }
  /** 발소리 (애니메이션의 발 닿는 순간): speed 월드 단위/초 */
  step(speed, pos) { const rec = EVENTS[stepEvent(speed)]; this.fire(rec, rec.bus, pos, 1, 1, 0); return rec; }
  /** 휘두름: 닿기 lead 초 전에 부른다 → {lead, …} */
  swing(weapon, strength, pos) { const r = swingFeel(weapon, strength); this.fire(r, 'f3_swing', pos, 1, 1, 0); return r; }
  /** 타격: 같은 순간에 여러 대상이 맞으면 3개까지 24 ms 씩 늦춰 겹친다 (한 덩어리로 뭉개지지 않게) → 타격 레시피 */
  hit(weapon, material, strength, flags, pos) {
    const r = hitFeel(weapon, material, strength, flags), e = this.eng;
    if (!e) return r;
    const now = e.ctx.currentTime;
    if (now - this._hitT < 0.004) this._hitN++; else { this._hitT = now; this._hitN = 0; }
    const n = this._hitN;
    if (n < 3 || r.big) this.fire(r, r.big ? 'f3_big' : 'f3_hit', pos, n ? Math.pow(0.78, n) : 1, 1, n * 0.024);
    return r;
  }
  // ── 고리 (횃불·밤거리·날아가는 마법) ──
  /** 고리를 켠다 → 번호 (0 = 실패). 'loop.torch' · 'loop.street' · 'loop.magic.<원소>' */
  loopStart(name, pos, vol = 1) {
    const rec = Object.hasOwn(EVENTS, name) ? EVENTS[name] : null, e = this.eng;
    if (!rec || !rec.loop || !e || this.loops.length >= 5) return 0;
    if (!this.fire(rec, rec.bus, pos, vol, 1, 0) || !P.handle) return 0;
    const h = P.handle; P.handle = null;
    h.id = ++this._loopId; h.name = name; h.rec = rec; h.pos = pos || null; h.vol = vol; h.x = e.live[e.live.length - 1]; h.t0 = e.ctx.currentTime; h.dead = false;
    this.loops.push(h);
    return h.id;
  }
  /** 고리의 위치를 옮긴다 (날아가는 마법): 팬·음량이 따라간다 */
  loopMove(id, pos) {
    const h = this._loop(id), e = this.eng, L = this.L;
    if (!h || !e || !pos || !L.on) return;
    const dx = pos.x - L.px, dy = (pos.y || 0) - L.py, dz = pos.z - L.pz, depth = Math.max(1, dx * L.fx + dy * L.fy + dz * L.fz), dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const now = e.ctx.currentTime, pan = clamp((dx * L.rx + dz * L.rz) / (depth * L.tan), -1.15, 1.15) * 0.62;
    if (h.x && h.x.node && h.x.node.pan) h.x.node.pan.setTargetAtTime(pan, now, 0.05);
    h.g.gain.setTargetAtTime(h.v * clamp(Math.pow(L.ref / dist, 0.9), 0.22, 1.12), now, 0.08);
  }
  loopStop(id, fade = 0.25) { const i = this.loops.findIndex((h) => h.id === id); if (i < 0) return; this._stop(this.loops[i], fade); this.loops.splice(i, 1); }
  _loop(id) { for (const h of this.loops) if (h.id === id) return h; return null; }
  _stop(h, fade) {
    const e = this.eng; if (!e || h.dead) return;
    const now = e.ctx.currentTime; h.dead = true;
    try { h.g.gain.cancelScheduledValues(now); h.g.gain.setTargetAtTime(0, now, fade / 4); h.src.stop(now + fade + 0.05); } catch { /* 이미 멈춤 */ }
    if (h.x) h.x.end = Math.min(h.x.end, now + fade + 0.1);
  }
  /** 가끔 부른다 (프레임마다 불러도 0.5초에 한 번만 일한다): 엔진이 빼앗은(동시 발음 상한) 배경 고리를 다시 켠다, 끝난 고리를 치운다 */
  update() {
    const e = this.eng; if (!e || !this.loops.length) return;
    const now = e.ctx.currentTime; if (now - this._upT < 0.5) return; this._upT = now;
    for (let i = this.loops.length - 1; i >= 0; i--) {
      const h = this.loops[i], gone = !h.x || h.x.stolen || h.x.end <= now;
      if (!gone) continue;
      this.loops.splice(i, 1);
      if (h.rec.keep && !h.dead) { const id = this.loopStart(h.name, h.pos, h.vol); const n = this._loop(id); if (n) n.id = h.id; }   // 같은 번호로 다시
    }
  }
  stats() { const e = this.eng; return { starts: this.starts, miss: this.miss, layers: this.layersPlayed, loops: this.loops.length, room: this.room, q: this.q, bank: this.bank ? this.bank.stats() : null, engine: e ? { ...e.stats, live: e.live.length } : null }; }
}
