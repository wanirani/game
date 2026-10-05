// 녹음 음원 뱅크 — 녹음 배경 음악(assets/audio/music) + 효과음 샘플(assets/audio/sfx) 받기·풀기·메모리 회계. audio.js 의 AudioSystem 이 쓴다.
//  (공개 API 는 audio.js 그대로: audio.music(id) 는 녹음 파일이 있으면 그것을, 없거나 실패하면 합성 트랙을 튼다. MASTER_PLAN §1.5 musicSource, §1.20)
//
// ── 배경 음악 (index.json = { version, rate, format:'m4a', tracks:{id:{file, bytes, duration, loop, loopStart, loopEnd, priming, lufs, peak}}, alias:{id:id} }) ──
//  · 받기: fetch (배포 빌드는 서비스 워커가 bn-audio-v1 에 크기 제한 캐시) 또는 에셋 팩(assets._bytes). 압축 바이트는 최근 MAX_RAW 곡만 메모리에.
//  · 풀기: OfflineAudioContext(rate).decodeAudioData → 그 rate 로 리샘플된 PCM. rate 는 기기 묶음(REC_PROFILE)별, 곡이 길면 상한(cap)에
//          맞춰 더 낮춘다 (16 kHz 아래가 필요하면 그 곡은 합성음). 풀린 바이트 = 프레임 × 채널 × 4. 한 번에 하나씩 푼다.
//  · 메모리: 풀린 곡은 지금 곡 + 다음 곡(prefetch)만 (trim). 새 곡을 풀면 상한을 넘을 때는 쓰지 않는 곡을 먼저 놓고, 페이드아웃 중인 곡이
//            놓일 때까지 기다린다 (휴대폰에서는 교차 페이드가 차례로 된다). stats().peak = 붙잡은 PCM 최대치. (디코더 내부의 일시 버퍼는 셀 수 없다)
//  · 프라이밍: 풀린 길이 − duration ≥ priming/2 샘플이면 브라우저가 인코더 앞 무음을 자르지 않은 것 → 시작·루프 지점을 priming 만큼 민다.
//  · 고리: AudioBufferSourceNode loop/loopStart/loopEnd (샘플 단위, audio.js RecPlayer). loop:false 곡은 한 번 (victory·gameover).
//  · 쓰지 않음(→ 합성음): 설정 musicSource 'synth', index 없음·404, AAC 를 못 푸는 브라우저(canPlayType), 받기·풀기 실패, 상한 초과.
// ── 효과음 샘플 (index.json = { formats:['m4a','ogg'], core:[이름], sfx:{이름:{f:[id], g, s, r?}}, files:{id:{dur, on, m4a, ogg}} }) ──
//  · core 묶음은 첫 사용자 입력(attach) 뒤 곧바로, 나머지는 처음 울릴 때 받는다 (그동안은 합성음만). tools/audio/sfx/build_sfx.py 가 만든다.
//  · 형식: m4a(AAC) 를 풀 수 있으면 m4a, 아니면 ogg(Vorbis). 풀기에 실패하면 다른 형식을 한 번 더.
//  · 휴대폰·저사양은 32 kHz 로 푼다. 앞 지연(디코더 프라이밍)은 첫 소리 위치로 재서 건너뛴다 (files[id].on 기준).
import { assets, ASSET_ROOT } from './assets.js';
import { saves, autoQualityTier } from './save.js';

const MB = 1048576;
/** 기기 묶음별 풀기 rate(0 = 컨텍스트 그대로)·풀린 음악 상한·효과음 rate. 휴대폰 상한 16 MB 는 지금 곡 + 다음 곡 + 페이드아웃 중인 곡 전부 */
export const REC_PROFILE = Object.freeze({
  phone: Object.freeze({ rate: 24000, cap: 16 * MB, sfxRate: 32000 }),
  tablet: Object.freeze({ rate: 32000, cap: 32 * MB, sfxRate: 32000 }),
  low: Object.freeze({ rate: 22050, cap: 16 * MB, sfxRate: 32000 }),
  medium: Object.freeze({ rate: 32000, cap: 48 * MB, sfxRate: 0 }),
  high: Object.freeze({ rate: 0, cap: 96 * MB, sfxRate: 0 }),
});
export const MUSIC_DIR = 'audio/music/', SFX_DIR = 'audio/sfx/';
const MIN_RATE = 16000;        // 이보다 낮게 풀어야 상한에 들면 그 곡은 합성음
const MAX_RAW = 3;             // 메모리에 둘 압축 바이트 곡 수
const MEM_WAIT_MS = 3000;      // 상한 때문에 페이드아웃 중인 곡이 놓이기를 기다리는 최대 시간
const REF_LUFS = -19;          // 녹음 곡 음량 기준 (index.lufs → 이 크기로) = 합성 트랙과 같은 출력 크기 (엔진 통과 측정: -16.1 LUFS 파일을 그대로 틀면 합성 title 보다 2.8 dB 큼)
const hasWin = typeof window !== 'undefined';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 이 브라우저가 풀 수 있는 형식 (QA 는 window.__BN_AUDIO_CODECS = ['m4a', …] 로 강제) */
function codecOk(fmt) {
  try {
    const f = hasWin ? window.__BN_AUDIO_CODECS : null;
    if (Array.isArray(f)) return f.includes(fmt);
    const a = document.createElement('audio');
    const t = fmt === 'm4a' ? 'audio/mp4; codecs="mp4a.40.2"' : fmt === 'ogg' ? 'audio/ogg; codecs="vorbis"' : '';
    return !!(t && a.canPlayType && a.canPlayType(t));
  } catch { return false; }
}
/** 데이터 절약 모드 (Save-Data) */
export function saveDataOn() {
  try { return !!(typeof navigator !== 'undefined' && navigator.connection && navigator.connection.saveData); } catch { return false; }
}
/** 기기 묶음 이름 (REC_PROFILE 키) */
export function recProfileName() {
  let tier = null;
  try {
    const g = hasWin ? window.__game : null;
    const q = g?.tier ?? g?.settings?.quality ?? saves.settings?.quality;
    tier = q === 'low' || q === 'medium' || q === 'high' ? q : autoQualityTier();
  } catch { tier = 'high'; }
  if (assets.isTouch) return tier === 'low' ? 'low' : assets.isTablet ? 'tablet' : 'phone';
  return tier;
}
const bufBytes = (b) => (b ? b.length * b.numberOfChannels * 4 : 0);

/** 바이트 받기: 에셋 팩(아티팩트) → 없으면 네트워크. 없는 파일·실패 → null */
async function fetchBytes(rel, q = '') {
  try {
    if (assets.packSrc?.length) {
      const u8 = await assets._bytes(rel);
      if (u8) return u8.slice().buffer;
      if (u8 === null || assets._packComplete()) return null;
    }
    if (typeof fetch !== 'function') return null;
    const r = await fetch(`${ASSET_ROOT}${rel}${q}`, { credentials: 'same-origin' });
    return r.ok ? await r.arrayBuffer() : null;
  } catch { return null; }
}
async function fetchJson(rel) {
  const b = await fetchBytes(rel);   // (assets/* 는 must-revalidate, 서비스 워커는 build.json 해시로 검증)
  if (!b) return null;
  try { return JSON.parse(new TextDecoder().decode(b)); } catch { return null; }
}
const DEC = new Map(); // rate → 풀기 전용 OfflineAudioContext (렌더하지 않고 decodeAudioData 에만 쓴다 — 하나를 다시 쓴다)
/** rate 로 풀기 (rate 0 = ctx 그대로). 콜백·프라미스 둘 다 받는 브라우저 대비 */
function decodeAt(ctx, data, rate) {
  return new Promise((res, rej) => {
    let c = ctx;
    if (rate && rate !== ctx.sampleRate) {
      c = DEC.get(rate);
      if (!c) { try { const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext; c = new OC(2, 1, rate); DEC.set(rate, c); } catch { c = ctx; } }
    }
    try { const p = c.decodeAudioData(data, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); }
  });
}
/** 첫 소리(|x| > thr) 위치 (프레임) */
function firstSound(buf, thr = 0.003) {
  const d = buf.getChannelData(0), n = Math.min(d.length, Math.ceil(buf.sampleRate * 0.25));
  for (let i = 0; i < n; i++) if (d[i] > thr || d[i] < -thr) return i;
  return 0;
}

export class RecBank {
  constructor() {
    this.ctx = null; this.profileName = null; this.profile = REC_PROFILE.high;
    // 음악
    this.idx = null; this.idxP = null; this.idxState = 'idle';   // idle | loading | ready | off
    this.why = null;                                             // 꺼진 까닭 (stats)
    this.raw = new Map();      // id → ArrayBuffer (최근 순)
    this.rawP = new Map();     // id → Promise<ArrayBuffer|null>
    this.dec = new Map();      // id → 풀린 곡 {id, buf, bytes, ls, le, off, loop, dur, gain, rate, refs, t}
    this.jobs = new Map();     // id → Promise<entry|null>
    this.failed = new Map();   // id → 까닭 (이번 실행 동안 다시 시도하지 않음; 받기 실패는 다음 요청 때 다시)
    this.bytes = 0; this.peak = 0; this.next = null; this.decodes = 0; this.q = Promise.resolve();
    // 효과음
    this.sIdx = null; this.sIdxP = null; this.sFmt = null; this.smp = new Map(); this.sFiles = new Map(); this.sBytes = 0; this.sLoading = new Set();
  }
  /** 실시간 컨텍스트가 생겼다 (audio.unlock): 기기 묶음을 정하고 효과음 core 묶음을 받기 시작 */
  attach(ctx) {
    this.ctx = ctx;
    this.profileName = recProfileName();
    this.profile = REC_PROFILE[this.profileName] || REC_PROFILE.high;
    this.sfxIndex().then((ix) => { if (ix) this.loadSfx(ix.core || []); });
  }
  get cap() { return this.profile.cap; }

  // ───────────────────────── 음악: 목록 ─────────────────────────
  index() {
    if (this.idxP) return this.idxP;
    if (!codecOk('m4a')) { this.idxState = 'off'; this.why = 'codec'; return (this.idxP = Promise.resolve(null)); }
    const app = hasWin ? window.__BN_APP : null;   // APK 에 녹음 곡을 하나도 싣지 않았으면 (pack_web.py) 목록을 요청하지 않는다
    if (app && app.audio && !app.audio.music) { this.idxState = 'off'; this.why = 'apk'; return (this.idxP = Promise.resolve(null)); }
    this.idxState = 'loading';
    this.idxP = fetchJson(MUSIC_DIR + 'index.json').then((ix) => {
      const ok = ix && typeof ix === 'object' && ix.tracks && typeof ix.tracks === 'object';
      this.idx = ok ? ix : null; this.idxState = ok ? 'ready' : 'off'; if (!ok) this.why = 'index';
      return this.idx;
    });
    return this.idxP;
  }
  resolve(id) { const a = this.idx?.alias; return (a && typeof a[id] === 'string' && a[id]) || id; }
  track(id) { const t = this.idx?.tracks?.[this.resolve(id)]; return t && typeof t.file === 'string' ? t : null; }
  /** 녹음으로 틀 수 있을 수도 있는가 (목록을 받는 중이면 true) */
  usable(id) {
    if (this.idxState === 'off') return false;
    if (this.idxState !== 'ready') return true;
    const k = this.resolve(id);
    return !!this.track(k) && !this.failed.has(k);
  }
  pending(id) { return this.idxState === 'loading' || this.jobs.has(this.resolve(id)); }
  entry(id) { const e = this.dec.get(this.resolve(id)); if (e) e.t = performance.now(); return e || null; }

  // ───────────────────────── 음악: 받기·풀기 ─────────────────────────
  _raw(k) {
    const t = this.track(k);
    if (!t) return Promise.resolve(null);
    if (this.raw.has(k)) { const b = this.raw.get(k); this.raw.delete(k); this.raw.set(k, b); return Promise.resolve(b); }
    if (this.rawP.has(k)) return this.rawP.get(k);
    const p = fetchBytes(MUSIC_DIR + t.file, t.bytes ? `?h=${t.bytes}` : '').then((b) => {
      this.rawP.delete(k);
      if (b) { this.raw.set(k, b); while (this.raw.size > MAX_RAW) this.raw.delete(this.raw.keys().next().value); }
      return b;
    });
    this.rawP.set(k, p);
    return p;
  }
  /** 곡 길이로 고른 풀기 rate (0 = 너무 길어 상한 초과) */
  rateFor(t) {
    const ctxRate = this.ctx?.sampleRate || 48000;
    let r = Math.min(this.profile.rate || ctxRate, ctxRate);
    const sec = (Number(t.duration) || 0) + (Number(t.priming) || 0) / (Number(this.idx?.rate) || 48000) + 0.1;
    const fit = Math.floor(this.cap / Math.max(1, sec * 2 * 4));
    if (r > fit) r = fit;
    return r >= MIN_RATE ? r : 0;
  }
  estimate(t, r = this.rateFor(t)) { return Math.ceil(((Number(t.duration) || 0) + 0.2) * r) * 2 * 4; }
  /** 곡을 받아 푼다 → 풀린 곡 | null (합성음으로). want = 지금 틀 곡 (아니면 미리 받기: 메모리가 남을 때만 푼다) */
  load(id, { want = true } = {}) {
    return this.index().then(() => {
      const k = this.resolve(id);
      if (!this.track(k) || this.failed.has(k)) return null;
      if (this.dec.has(k)) return this.dec.get(k);
      if (this.jobs.has(k)) return this.jobs.get(k);
      const job = this._raw(k).then((data) => {
        if (!data) { this.jobs.delete(k); return null; } // 받기 실패 (오프라인 등) — 다음 요청 때 다시
        // 한 번에 하나씩 푼다 (휴대폰 메모리·CPU)
        const run = () => this._decode(k, data, want);
        const p = this.q.then(run, run);
        this.q = p.catch(() => null);
        return p;
      }).then((e) => { this.jobs.delete(k); return e; }, (err) => { this.jobs.delete(k); this.failed.set(k, String(err?.message || err)); return null; });
      this.jobs.set(k, job);
      return job;
    });
  }
  async _decode(k, data, want) {
    if (this.dec.has(k)) return this.dec.get(k);
    const t = this.track(k), ctx = this.ctx;
    if (!t || !ctx) return null;
    const r = this.rateFor(t);
    if (!r) { this.failed.set(k, 'toobig'); return null; }
    const est = this.estimate(t, r);
    // 상한: 쓰지 않는 곡을 먼저 놓고, 그래도 넘으면 (페이드아웃 중인 곡이 놓일 때까지) 기다린다. 미리 받기는 기다리지 않는다
    const t0 = performance.now();
    for (;;) {
      if (this.bytes + est <= this.cap) break;
      this.trim(new Set([k, ...(want ? [] : [this.next])]), true);
      if (this.bytes + est <= this.cap) break;
      if (!want || performance.now() - t0 > MEM_WAIT_MS) return null;
      await sleep(60);
    }
    const buf = await decodeAt(ctx, data.slice(0), r);   // slice: decodeAudioData 가 버퍼를 넘겨받아 비운다 (압축 바이트는 다시 쓰려고 남김)
    this.decodes++;
    const bytes = bufBytes(buf);
    if (this.bytes + bytes > this.cap) { this.trim(new Set([k]), true); if (this.bytes + bytes > this.cap) { if (!want) return null; this.failed.set(k, 'cap'); return null; } }
    const fr = Number(this.idx?.rate) || 48000, pr = Math.max(0, Number(t.priming) || 0), dur = Number(t.duration) || buf.duration;
    const lead = buf.duration - dur;
    const off = pr > 0 && lead >= (pr / fr) * 0.5 ? Math.min(pr / fr, buf.duration * 0.5) : 0;   // 브라우저가 프라이밍을 자르지 않았다
    const loop = t.loop !== false;
    // 루프 지점: 샘플 번호(loopStartSample/loopEndSample, 파일 rate 기준)가 있으면 그것으로 (초 값은 반올림돼 있다)
    const sec = (k) => (Number.isInteger(t[k + 'Sample']) && t[k + 'Sample'] >= 0 ? t[k + 'Sample'] / fr : Number(t[k]));
    let ls = (sec('loopStart') || 0) + off, le = (sec('loopEnd') > 0 ? sec('loopEnd') : dur) + off;
    le = Math.min(le, buf.duration);
    const lufs = Number(t.lufs);
    const gain = Number.isFinite(lufs) ? Math.min(2, Math.max(0.25, Math.pow(10, (REF_LUFS - lufs) / 20))) : 1;
    const e = { id: k, buf, bytes, rate: buf.sampleRate, ch: buf.numberOfChannels, off, ls, le, loop: loop && le - ls > 0.25, dur: Math.min(dur, buf.duration - off), gain, refs: 0, t: performance.now() };
    this.dec.set(k, e);
    this.bytes += bytes;
    if (this.bytes > this.peak) this.peak = this.bytes;
    return e;
  }
  /** 재생기가 붙잡음/놓음 (audio.js RecPlayer) */
  ref(e) { e.refs++; }
  unref(e) { e.refs = Math.max(0, e.refs - 1); }
  /** keep 에 없는, 아무도 붙잡지 않은 풀린 곡을 놓는다 (force 가 아니면 다음 곡(next)도 남긴다) → 놓은 바이트 */
  trim(keep = new Set(), force = false) {
    let freed = 0;
    for (const [k, e] of [...this.dec].sort((a, b) => a[1].t - b[1].t)) {
      if (e.refs > 0 || keep.has(k) || (!force && k === this.next)) continue;
      this.dec.delete(k); this.bytes -= e.bytes; freed += e.bytes; e.buf = null;
    }
    return freed;
  }
  /** 다음에 쓸 것 같은 곡: 압축 바이트를 받아 두고, 상한 안이면 풀어 둔다. 장면을 막지 않는다 */
  prefetch(id) {
    if (!id || this.idxState === 'off') return;
    this.index().then(() => {
      const k = this.resolve(id);
      if (!this.track(k) || this.failed.has(k)) return;
      this.next = k;
      if (this.dec.has(k) || this.jobs.has(k)) return;
      this._raw(k).then((b) => {
        if (!b || !this.ctx || this.dec.has(k) || this.jobs.has(k) || this.next !== k) return;
        const t = this.track(k), r = this.rateFor(t);
        if (r && this.bytes + this.estimate(t, r) <= this.cap) this.load(k, { want: false });
      });
    });
  }
  /** 실시간 컨텍스트 전 (첫 입력 전): 타이틀이 자리 잡은 뒤(지연) 목록과 그 곡의 압축 바이트만 받아 둔다. 느린 망(4g 미만)에서는 하지 않는다
   *  (첫 화면 경로에는 들어가지 않는다 — 첫 입력 전 소리 요청은 이것 하나) */
  warm(id, delay = 6000) {
    if (this._warmT || !id) return;
    try { const et = navigator.connection?.effectiveType; if (et && et !== '4g') return; } catch { /* 모름 */ }
    this._warmT = setTimeout(() => { if (this.ctx) return; this.index().then(() => { if (this.track(this.resolve(id))) this._raw(this.resolve(id)); }); }, delay);
  }

  // ───────────────────────── 효과음 샘플 ─────────────────────────
  sfxIndex() {
    if (this.sIdxP) return this.sIdxP;
    this.sIdxP = fetchJson(SFX_DIR + 'index.json').then((ix) => {
      if (!ix || typeof ix.sfx !== 'object' || typeof ix.files !== 'object') return null;
      const fm = (Array.isArray(ix.formats) ? ix.formats : ['m4a']).filter((f) => codecOk(f));
      if (!fm.length) return null;
      this.sFmt = fm; this.sIdx = ix;
      return ix;
    });
    return this.sIdxP;
  }
  /** 이름들의 샘플을 받는다 (이미 있거나 받는 중이면 건너뜀) */
  loadSfx(names) {
    const ix = this.sIdx;
    if (!ix || !this.ctx) return Promise.resolve();
    const jobs = [];
    for (const n of names) {
      const d = Object.hasOwn(ix.sfx, n) ? ix.sfx[n] : null;
      if (!d || this.smp.has(n) || this.sLoading.has(n) || !Array.isArray(d.f)) continue;
      this.sLoading.add(n);
      jobs.push(Promise.all(d.f.map((fid) => this._sfxFile(fid))).then((bs) => {
        this.sLoading.delete(n);
        const bufs = bs.filter(Boolean);
        if (bufs.length) this.smp.set(n, { bufs, g: Number(d.g) || 1, s: Math.max(0, Number(d.s) || 0), r: Number(d.r) || 1 });
        else this.smp.set(n, null);   // 실패: 합성음만 (다시 시도하지 않음)
      }));
    }
    return Promise.all(jobs);
  }
  _sfxFile(fid) {
    if (this.sFiles.has(fid)) return this.sFiles.get(fid);
    const f = this.sIdx.files[fid];
    const rate = this.profile.sfxRate || 0;
    const p = (async () => {
      if (!f) return null;
      for (const fmt of this.sFmt) {
        const data = await fetchBytes(`${SFX_DIR}${fid}.${fmt}`, f[fmt] ? `?h=${f[fmt]}` : '');
        if (!data) continue;
        try {
          const buf = await decodeAt(this.ctx, data, rate && rate < this.ctx.sampleRate ? rate : 0);
          const off = Math.max(0, Math.min(0.1, firstSound(buf) / buf.sampleRate - (Number(f.on) || 0)));
          this.sBytes += bufBytes(buf);
          return { buf, off };
        } catch { /* 다른 형식으로 */ }
      }
      return null;
    })();
    this.sFiles.set(fid, p);
    return p;
  }
  /** 엔진용: 이름의 샘플 {bufs:[{buf, off}], g, s, r} | null. 매핑은 있는데 아직 없으면 받기를 시작한다 (이번에는 합성음) */
  sample(name) {
    const m = this.smp.get(name);
    if (m !== undefined) return m;
    if (this.sIdx && this.ctx && Object.hasOwn(this.sIdx.sfx, name) && !this.sLoading.has(name)) this.loadSfx([name]);
    return null;
  }
  stats() {
    const tracks = {};
    for (const [k, e] of this.dec) tracks[k] = { bytes: e.bytes, rate: e.rate, ch: e.ch, off: +e.off.toFixed(4), ls: +e.ls.toFixed(4), le: +e.le.toFixed(4), loop: e.loop, refs: e.refs };
    let smp = 0;
    for (const v of this.smp.values()) if (v) smp++;
    return {
      profile: this.profileName, cap: this.cap, rate: this.profile.rate || this.ctx?.sampleRate || 0, index: this.idxState, why: this.why,
      bytes: this.bytes, peak: this.peak, decodes: this.decodes, tracks, raw: [...this.raw.keys()], next: this.next, failed: Object.fromEntries(this.failed),
      sfx: { fmt: this.sFmt?.[0] ?? null, names: this.sIdx ? Object.keys(this.sIdx.sfx).length : 0, loaded: smp, bytes: this.sBytes },
    };
  }
}
