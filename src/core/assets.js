// 이미지 에셋 로더 (지연 로딩). 파일이 없으면 null을 돌려주므로 호출 측은 절차적 대체 그림을 그린다.
//  assets.get('bg/s01_village')      → HTMLImageElement | null (로드 전/실패 시 null)
//  assets.preload(['bg/hub', ...])  → Promise (실패해도 resolve)
//  assets.pattern(ctx, 'tex/tex_castle_stone') → CanvasPattern | null
// 폴더별 확장자: bg/portraits/tex/painted = .webp, icons/props = .png (painted = 채색 퍼핏 부품 아틀라스, render/painted/kit.js)
//
// ── 저사양 변형 lo/ (platform §6.4, §6.7) ──
//  assets.url(key, ver) 는 bg/·cg/·portraits/ 에 대해 assets/lo/<key>.webp (60 % 크기, tools/assets/make_variants.py) 를 고른다:
//  등급 low → lo, medium → 백킹 높이 ≤ 640 이면 lo, high → 원본. 등급 = game.tier ?? game.quality ?? settings.quality ('auto' 면 시작 등급).
//  lo 파일이 있다고 알려진 경우에만 쓴다: window.__BN_BUILD.lo (true | 키 목록, build-info.js), 팩 목록, assets.useVariants(), ?lo=1|auto.
//  lo 로드가 실패하면 그 키는 원본으로 다시 받는다 (그 뒤로는 lo 를 시도하지 않음). 등급이 바뀌면 다음 get() 때 알맞은 변형으로 조용히 교체.
//
// ── 디코딩 메모리 LRU (platform §6.7, MASTER_PLAN §5.2) ──
//  이미지마다 w·h·4 바이트를 센다. 예산: 터치 기기 160 MB / 데스크톱 400 MB (assets.budget).
//  · 장면 전환(맨 아래 장면이 바뀜 — window.__game 을 보고 스스로 알아챈다, 또는 assets.sceneChange()) 1.5초 뒤:
//    전환 뒤에 쓰이지 않은 bg/·cg/ 를 오래된 순으로 내린다 (bg+cg 합이 예산의 30 % 이하가 될 때까지)
//  · 전체가 예산을 넘으면: 최근 5초 안에 쓰지 않은 bg/·cg/·portraits/·ui/ 이미지와 release 가 있는 추적 항목을 오래된 순으로 내린다
//  · 채색 텍스처(painted/·puppets/ 이미지 + track(…, {group:'painted'}) 항목)는 장면당 24 MB(터치) / 64 MB(데스크톱) 예산에 합산하고,
//    넘으면 release 가 있는 채색 추적 항목을 오래된 순으로 내린다. painted/·puppets/ 이미지 자체는 자동으로 내리지 않는다 (소유 모듈이 붙잡고 있음)
//  내린 이미지는 1×1 투명 이미지로 바꿔 디코딩 메모리를 돌려준다 (붙잡은 쪽이 그려도 예외 없음). 다음 get() 이 다시 받는다.
//  assets.track(id, bytes, {group, release}) / untrack(id) / touch(id): 로더 밖에서 만든 텍스처(구운 리그 등)를 예산에 넣는다.
//  assets.cache.delete(key) 는 바이트 계산도 함께 뺀다 (render/painted/kit.js 가 굽기 뒤 아틀라스를 이렇게 놓는다).
//  assets.stats() → { total, budget, painted, paintedBudget, groups, images, tracked, evictions, lo, packs } (QA·perf_budget 용)
//
// ── 에셋 팩 (MASTER_PLAN §1.20, claude.ai 아티팩트 배포) ──
//  assets.usePack('assets/packs/index.json') (또는 window.__BN_BUILD.pack) → 이후 get/load/json/url 은 팩에서 읽는다.
//  index.json = { v:1, packs:['0.bnpack', …] (index 기준 상대 경로), files:{ 'bg/title.webp': [팩 번호, 오프셋, 길이], … }, complete?:true }
//  .bnpack = 파일 바이트를 이어 붙인 것 (머리말 없음). complete !== false 면 팩에 없는 파일은 없는 것으로 본다 (네트워크 요청 없음).
//  url() 은 동기라서 팩 조각이 이미 받아졌을 때만 blob: 주소를 돌려준다 (아니면 일반 경로). load()/json() 은 팩을 기다린다.
//  has(key) = 이미지(또는 json) 가 로드되어 있음 (요청하지 않음) · exists(key) = 있다고 알려짐 true / 없음 false / 모름 undefined
import { saves, autoQualityTier, isTouchDevice } from './save.js';

const EXT = { bg: 'webp', portraits: 'webp', tex: 'webp', cg: 'webp', icons: 'png', props: 'png', ui: 'png', painted: 'webp', puppets: 'webp' };
// puppets = 영웅 채색 컷아웃 퍼펫(render/hero_puppet.js). get/load 의 두 번째 인자 ver 는 선택(파일 해시 → 캐시 무효화), json() 은 리그 데이터용
// 에셋 루트: 게임 루트 기준 (이 모듈 주소에서 계산 → tools/ 아래 갤러리 페이지에서도 같은 파일을 받는다).
// 모듈이 src/core/assets.js 로 서빙되지 않는 경우(번들·Node)에는 예전처럼 페이지 기준 'assets/'
export const ASSET_ROOT = (() => {
  try {
    if (typeof window === 'undefined') return 'assets/';
    const u = new URL(import.meta.url);
    if (/^https?:$/.test(u.protocol) && /\/src\/core\/assets\.js$/.test(u.pathname)) return new URL('../../assets/', u).href;
  } catch { /* 페이지 기준 */ }
  return 'assets/';
})();
export const LO_ROOT = 'lo/';                                  // assets/lo/<key>.<ext>
const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', json: 'application/json', txt: 'text/plain' };
const LO_FOLDERS = new Set(['bg', 'cg', 'portraits']);           // lo/ 변형이 있는 폴더
const SCENE_FOLDERS = new Set(['bg', 'cg']);                     // 장면 전환 때 정리
const TRIM_FOLDERS = new Set(['bg', 'cg', 'portraits', 'ui']);   // 전체 예산 초과 때 정리
const PAINTED_GROUPS = ['painted', 'puppets'];                   // 채색 텍스처 예산에 합산
const MB = 1048576;
export const ASSET_BUDGET = Object.freeze({ touch: 160 * MB, desktop: 400 * MB, paintedTouch: 24 * MB, paintedDesktop: 64 * MB, sceneShare: 0.3 });
const KEEP_MS = 5000;          // 최근 5초 안에 쓴 것은 예산 초과 정리에서 내리지 않는다 (지금 그려지는 중)
const SCENE_GRACE_MS = 1500;   // 장면 전환 뒤 새 장면이 제 이미지를 요청할 여유
const POLL_MS = 250;           // 환경(등급·장면) 확인 주기
const TRIM_TO = 0.85;          // 예산 초과 시 이 비율까지 내린다
const MAX_PACK_BUFS = 6;       // 메모리에 들고 있는 팩 조각 수 (넘으면 오래된 것부터 놓고, 필요하면 다시 받는다)
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

const hasWin = typeof window !== 'undefined';
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const folderOf = (key) => { const i = key.indexOf('/'); return i < 0 ? '' : key.slice(0, i); };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const dirOf = (u) => u.slice(0, u.lastIndexOf('/') + 1);
const joinUrl = (base, f) => (/^([a-z][a-z0-9+.-]*:|\/)/i.test(f) ? f : dirOf(base) + f);
const stripExt = (k) => k.replace(/\.[a-z0-9]+$/i, '');

// 내린 이미지 자리에 넣는 1×1 투명 GIF (blob: 우선 — CSP img-src 'self' data: blob:, 아티팩트는 blob: 만 확실)
const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
let BLANK = null;
function blankSrc() {
  if (BLANK) return BLANK;
  try {
    const bin = atob(GIF), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    BLANK = URL.createObjectURL(new Blob([u8], { type: 'image/gif' }));
  } catch { BLANK = 'data:image/gif;base64,' + GIF; }
  return BLANK;
}
function releaseImg(img) {
  if (!img) return;
  img.onload = null; img.onerror = null;
  try { img.src = blankSrc(); } catch { /* 무시 */ }
}
function imgBytes(img) { return Math.max(0, (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0) * 4); }
/** 터치 위주 기기(휴대폰·태블릿·APK): 예산을 작게 */
function touchEnv() {
  try {
    if (!hasWin) return false;
    if (window.__BN_APP) return true;
    return isTouchDevice() || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  } catch { return false; }
}
/** game 이 아직 없을 때 백킹 높이 추정 (game.resize 와 같은 계산: 논리 높이 540, 폭 960~1280) */
function estimateBackingH(tier) {
  try {
    if (!hasWin) return 1080;
    const w = window.innerWidth || 960, h = window.innerHeight || 540;
    const cssH = Math.min(h, w * 540 / 960);
    const cap = tier === 'low' ? 1 : tier === 'medium' ? 1.5 : 2;
    return cssH * Math.min(window.devicePixelRatio || 1, cap);
  } catch { return 1080; }
}

/** 캐시: 바깥에서 delete 해도(예: painted/kit.js 가 굽기 뒤 아틀라스를 놓음) 바이트 계산이 맞게 */
class Cache extends Map {
  constructor(owner) { super(); this.owner = owner; }
  delete(key) { const e = super.get(key); if (e) this.owner._forget(e); return super.delete(key); }
  clear() { for (const e of super.values()) this.owner._forget(e); super.clear(); }
}

class Assets {
  constructor() {
    this.cache = new Cache(this);   // key -> {img, ok, failed, promise, bytes, t, lo, folder, …}
    this.patterns = new Map();
    this.jcache = new Map();        // key -> {data, failed, promise}
    this.version = 2;
    // 예산 계산
    this.groups = Object.create(null);   // 폴더/그룹 → 디코딩 바이트
    this.total = 0;
    this.ext = new Map();                 // track() 항목: id → {id, bytes, group, release, t}
    this.evictions = 0; this.releasedTracked = 0;
    this._budget = null; this._paintedBudget = null; this._isTouch = null;
    this._trimQ = false;
    // 변형(lo/)
    this.loIndex = null;                  // null = lo 파일 없음 · true = bg/cg/portraits 전부 · Set(키)
    this.loMode = 'auto';                 // 'auto' | 'lo'(강제) | 'full'(끔)
    this.loMiss = new Set();              // lo 로드 실패한 키 (다시 시도하지 않음)
    this.loFallbacks = 0;
    this.envFn = null;
    this._wantLo = undefined; this._vEpoch = 1; this._pollT = -1e9;
    // 장면 전환 감지
    this._base = null; this._sceneAt = 0;
    // 팩
    this.packSrc = [];
    this._packsReady = null;
    try {
      const B = hasWin ? window.__BN_BUILD : null;
      if (B?.lo) this.useVariants(B.lo);
      if (typeof B?.pack === 'string') this.usePack(B.pack);
      const q = hasWin && window.location ? new URLSearchParams(window.location.search).get('lo') : null;
      if (q === '0') this.loMode = 'full';
      else if (q === '1') { this.loIndex ??= true; this.loMode = 'lo'; }
      else if (q === 'auto') this.loIndex ??= true;
    } catch { /* 무시 */ }
  }

  // ───────────────────────── 경로·변형 ─────────────────────────
  /** assets/ 아래 파일 이름 (lo 면 lo/ 접두) */
  file(key, lo = false) { return `${lo ? LO_ROOT : ''}${key}.${EXT[folderOf(key)] || 'png'}`; }
  /** 이 키에 지금 lo/ 를 쓸지 (폴더·등급·lo 파일 존재) */
  _loFor(key, folder = folderOf(key)) {
    return LO_FOLDERS.has(folder) && this._want() && this._loAvail(key);
  }
  _loAvail(key) {
    if (this.loMiss.has(key)) return false;
    const ix = this.loIndex;
    if (ix === true || (ix && ix.has(key))) return true;
    return this.packSrc.length ? this._packHas(this.file(key, true)) : false;
  }
  _want() {
    if (this._wantLo === undefined) this._wantLo = this._computeWantLo();
    return this._wantLo;
  }
  /** 현재 화면 조건: { tier:'low'|'medium'|'high', backingH } */
  env() {
    if (this.envFn) { try { const e = this.envFn(); if (e?.tier) return e; } catch { /* 기본 계산 */ } }
    const g = hasWin ? window.__game : null;
    const st = g?.settings ?? saves.settings;
    let tier = g?.tier ?? g?.quality ?? st?.quality;
    if (tier !== 'low' && tier !== 'medium' && tier !== 'high') tier = autoQualityTier();
    const backingH = g?.canvas?.height || estimateBackingH(tier);
    return { tier, backingH };
  }
  _computeWantLo() {
    if (this.loMode === 'full') return false;
    if (this.loMode === 'lo') return true;
    const { tier, backingH } = this.env();
    return tier === 'low' || (tier === 'medium' && backingH <= 640);
  }
  /** 화면 조건 공급자 교체: fn() → { tier, backingH } (없으면 window.__game / 설정에서 읽는다) */
  setEnv(fn) { this.envFn = typeof fn === 'function' ? fn : null; this._refreshVariants(); }
  /** lo/ 파일 목록 알리기: true(전부) | 키 배열 | { keys:[…] } | null/false(없음) */
  useVariants(v) {
    const list = Array.isArray(v) ? v : Array.isArray(v?.keys) ? v.keys : null;
    this.loIndex = v === true ? true : list ? new Set(list.filter((k) => typeof k === 'string').map((k) => stripExt(k.replace(/^(assets\/)?lo\//, '')))) : null;
    this._refreshVariants();
  }
  /** 'auto'(등급에 따라) | 'lo'(항상) | 'full'(쓰지 않음) */
  setVariantMode(mode) { this.loMode = mode === 'lo' || mode === 'full' ? mode : 'auto'; this._refreshVariants(); }
  _refreshVariants() { this._wantLo = this._computeWantLo(); this._vEpoch++; }

  /** 파일 주소 (동기). lo/ 선택 포함, 팩을 쓰면 받아 둔 조각의 blob: 주소 */
  url(key, ver, { lo = this._loFor(key) } = {}) {
    const f = this.file(key, lo);
    if (this.packSrc.length) {
      const b = this._blobSync(f) ?? (lo ? this._blobSync(this.file(key, false)) : null);
      if (b) return b;
    }
    return `${ASSET_ROOT}${f}?v=${this.version}${ver ? '&h=' + ver : ''}`;
  }
  /** 로드할 주소 (팩이면 기다린다). null = 없는 파일 */
  _src(key, ver, lo) {
    const f = this.file(key, lo);
    if (!this.packSrc.length) return `${ASSET_ROOT}${f}?v=${this.version}${ver ? '&h=' + ver : ''}`;
    return this._blob(f).then((b) => (b !== undefined ? b : this._packComplete() ? null : `${ASSET_ROOT}${f}?v=${this.version}${ver ? '&h=' + ver : ''}`));
  }

  // ───────────────────────── 이미지 ─────────────────────────
  load(key, ver) {
    const t = now();
    this._checkBase(t);   // 새 장면의 enter() 안에서 미리 받는 이미지는 '전환 뒤에 쓰임' 으로 친다 (전환 시각 ≤ t)
    let e = this.cache.get(key);
    if (e) { e.t = t; return e.promise; }
    if (t - this._pollT > POLL_MS) this._poll(t);
    const folder = folderOf(key);
    e = { key, folder, ver, img: null, swap: null, ok: false, failed: false, bytes: 0, counted: false, t, lo: false, ve: this._vEpoch, res: null };
    e.promise = new Promise((res) => { e.res = res; });
    this.cache.set(key, e);
    this._fetch(e, this._loFor(key, folder));
    return e.promise;
  }
  get(key, ver) {
    const t = now();
    if (t - this._pollT > POLL_MS) this._poll(t);
    const e = this.cache.get(key);
    if (!e) { this.load(key, ver); return null; }
    e.t = t;
    if (!e.ok) return null;
    if (e.ve !== this._vEpoch) this._revariant(e);
    return e.img;
  }
  _fetch(e, lo) {
    if (typeof Image === 'undefined') { e.failed = true; e.res(null); return; }   // Node (도구)
    const img = new Image();
    img.decoding = 'async';
    e.img = img; e.lo = lo;
    img.onload = () => this._loaded(e, img);
    img.onerror = () => this._errored(e, img);
    const s = this._src(e.key, e.ver, lo);
    if (typeof s === 'string') img.src = s;
    else s.then((u) => { if (e.img !== img) return; if (u) img.src = u; else this._errored(e, img); }, () => { if (e.img === img) this._errored(e, img); });
  }
  _loaded(e, img) {
    if (e.img !== img) return;
    e.ok = true; e.failed = false;
    if (this.cache.get(e.key) === e) this._count(e, imgBytes(img));
    e.res(img);
  }
  _errored(e, img) {
    if (e.img !== img) return;
    if (e.lo) {   // lo/ 가 없으면 원본으로 (다시 lo 를 시도하지 않음)
      this.loMiss.add(e.key); this.loFallbacks++;
      this._fetch(e, false);
      return;
    }
    img.onload = null; img.onerror = null;
    e.ok = false; e.failed = true;
    e.res(null);
  }
  _count(e, bytes) {
    if (e.counted) this._acct(e.folder, -e.bytes);
    e.bytes = bytes; e.counted = true;
    this._acct(e.folder, bytes);
    if (this.total > this.budget || this.paintedBytes > this.paintedBudget) this._scheduleTrim();
  }
  _forget(e) {
    if (e.counted) { this._acct(e.folder, -e.bytes); e.counted = false; }
    this.patterns.delete(e.key);
  }
  _acct(group, delta) {
    this.groups[group] = (this.groups[group] || 0) + delta;
    this.total += delta;
  }
  /** 등급이 바뀌어 원하는 변형(lo/원본)이 달라졌으면 뒤에서 받아 교체 (그동안 기존 이미지를 계속 준다) */
  _revariant(e) {
    e.ve = this._vEpoch;
    if (!LO_FOLDERS.has(e.folder) || e.swap || typeof Image === 'undefined') return;
    const want = this._loFor(e.key, e.folder);
    if (want === e.lo) return;
    const img = new Image();
    img.decoding = 'async';
    e.swap = img;
    img.onload = () => {
      if (e.swap !== img) return;
      e.swap = null;
      if (this.cache.get(e.key) !== e) { releaseImg(img); return; }
      const old = e.img;
      e.img = img; e.lo = want;
      e.ve = 0;                   // 받는 동안 등급이 또 바뀌었을 수 있다 → 다음 get() 에서 다시 확인
      this.patterns.delete(e.key);
      this._count(e, imgBytes(img));
      releaseImg(old);
    };
    img.onerror = () => { if (e.swap !== img) return; e.swap = null; img.onload = null; img.onerror = null; if (want) { this.loMiss.add(e.key); this.loFallbacks++; } };
    const s = this._src(e.key, e.ver, want);
    if (typeof s === 'string') img.src = s;
    else s.then((u) => { if (e.swap !== img) return; if (u) img.src = u; else img.onerror(); }, () => img.onerror?.());
  }

  /** JSON 데이터 (예: 'puppets/kael/kael_hunter/rig') → Promise<object|null>. 실패해도 resolve(null) */
  json(key, ver) {
    this.jcache ??= new Map();
    let e = this.jcache.get(key);
    if (e) return e.promise;
    e = { data: null, failed: false };
    const f = `${key}.json`;
    const net = () => (typeof fetch === 'function' ? fetch(`${ASSET_ROOT}${f}?v=${this.version}${ver ? '&h=' + ver : ''}`) : Promise.reject(new Error('no fetch')))
      .then((r) => (r.ok ? r.json() : null));
    const p = this.packSrc.length
      ? this._bytes(f).then((u8) => (u8 !== undefined ? (u8 ? JSON.parse(new TextDecoder().decode(u8)) : null) : this._packComplete() ? null : net()))
      : net();
    e.promise = p.catch(() => null).then((d) => { e.data = d ?? null; e.failed = !d; return e.data; });
    this.jcache.set(key, e);
    return e.promise;
  }
  /** 로드되어 있음 (요청하지 않는다): 이미지 또는 json */
  has(key) { return !!(this.cache.get(key)?.ok || this.jcache?.get(key)?.data); }
  failed(key) { return !!this.cache.get(key)?.failed; }
  /** 있다고 알려짐 true · 없다고 알려짐 false · 모름 undefined (요청하지 않는다) */
  exists(key) {
    const e = this.cache.get(key), j = this.jcache.get(key);
    if (e?.ok || j?.data) return true;
    if (this.packSrc.length && this.packSrc.every((p) => p.files || p.failed)) {
      if (this._packHas(this.file(key)) || this._packHas(`${key}.json`)) return true;
      if (this._packComplete()) return false;
    }
    if (e?.failed || j?.failed) return false;
    return undefined;
  }
  preload(keys) { return Promise.all(keys.map((k) => this.load(k))); }
  pattern(ctx, key) {
    if (this.patterns.has(key)) return this.patterns.get(key);
    const img = this.get(key);
    if (!img) return null;
    const p = ctx.createPattern(img, 'repeat');
    this.patterns.set(key, p);
    return p;
  }

  // ───────────────────────── 예산 (디코딩 LRU) ─────────────────────────
  get isTouch() { return (this._isTouch ??= touchEnv()); }
  get budget() { return this._budget ?? (this.isTouch ? ASSET_BUDGET.touch : ASSET_BUDGET.desktop); }
  get paintedBudget() { return this._paintedBudget ?? (this.isTouch ? ASSET_BUDGET.paintedTouch : ASSET_BUDGET.paintedDesktop); }
  get paintedBytes() { let b = 0; for (const g of PAINTED_GROUPS) b += this.groups[g] || 0; return b; }
  /** 예산 바꾸기 (QA·도구): { total, painted } 바이트, null 이면 기본값 */
  setBudget({ total, painted } = {}) {
    if (total !== undefined) this._budget = Number.isFinite(total) && total > 0 ? total : null;
    if (painted !== undefined) this._paintedBudget = Number.isFinite(painted) && painted > 0 ? painted : null;
    this._scheduleTrim();
  }
  /** 로더 밖에서 만든 텍스처를 예산에 넣는다 (예: 구운 채색 리그). release(id) 가 있으면 예산 초과 때 불려 내려질 수 있다 */
  track(id, bytes, { group = 'painted', release = null } = {}) {
    const old = this.ext.get(id);
    if (old) this._acct(old.group, -old.bytes);
    const x = { id, bytes: Math.max(0, Math.round(Number(bytes) || 0)), group: String(group), release: typeof release === 'function' ? release : null, t: now() };
    this.ext.set(id, x);
    this._acct(x.group, x.bytes);
    if (this.total > this.budget || this.paintedBytes > this.paintedBudget) this._scheduleTrim();
    return x;
  }
  untrack(id) {
    const x = this.ext.get(id);
    if (!x) return false;
    this.ext.delete(id);
    this._acct(x.group, -x.bytes);
    return true;
  }
  /** 최근 사용 표시 (추적 항목 id 또는 이미지 키) */
  touch(id) { const x = this.ext.get(id) ?? this.cache.get(id); if (x) x.t = now(); }
  /** 이미지 하나(키) 또는 접두사('cg/' 처럼 / 로 끝나면)를 내린다 → 내린 바이트 */
  release(keyOrPrefix) {
    if (typeof keyOrPrefix !== 'string' || !keyOrPrefix) return 0;
    if (!keyOrPrefix.endsWith('/')) { const e = this.cache.get(keyOrPrefix); return e ? this._evict(e) : 0; }
    let b = 0;
    for (const e of [...this.cache.values()]) if (e.key.startsWith(keyOrPrefix)) b += this._evict(e);
    return b;
  }
  _evict(e) {
    if (this.cache.get(e.key) !== e) return 0;
    const b = e.counted ? e.bytes : 0;
    this.cache.delete(e.key);   // → _forget (바이트·패턴)
    releaseImg(e.img); releaseImg(e.swap); e.swap = null;
    e.res?.(null);              // 아직 로딩 중이던 것을 기다리는 쪽이 멈추지 않게
    this.evictions++;
    return b;
  }
  _releaseTracked(x) {
    if (this.ext.get(x.id) !== x) return 0;
    try { x.release?.(x.id); } catch (err) { console.error('[assets] release', x.id, err); }
    this.untrack(x.id);
    this.releasedTracked++;
    return x.bytes;
  }
  /** 장면 전환 알림: 1.5초 뒤 그동안 쓰이지 않은 bg/·cg/ 를 정리한다 (keep: 계속 쓸 키) */
  sceneChange(keep = []) {
    const t = now();
    for (const k of keep) { const e = this.cache.get(k); if (e) e.t = t; }
    // game.go() 는 새 장면의 enter() 뒤에 부른다. enter() 안의 load() 가 이 전환을 이미 알아챘으면 그 (더 이른) 시각을 둔다
    if (!this._checkBase(t) && this._sceneAt && t - this._sceneAt < SCENE_GRACE_MS) return;
    this._sceneAt = t;
  }
  /** 맨 아래 장면(window.__game.scenes[0])이 바뀌었으면 그 시각을 장면 전환 기준으로 삼는다 → 바뀌었는지 */
  _checkBase(t) {
    const base = hasWin ? window.__game?.scenes?.[0] ?? null : null;
    if (!base || base === this._base) return false;
    if (this._base) this._sceneAt = t;
    this._base = base;
    return true;
  }
  _sceneRelease(mark) {
    const quota = this.budget * ASSET_BUDGET.sceneShare;
    let have = 0;
    for (const g of SCENE_FOLDERS) have += this.groups[g] || 0;
    if (have <= quota) return 0;
    const list = [...this.cache.values()].filter((e) => e.ok && SCENE_FOLDERS.has(e.folder) && e.t < mark).sort((a, b) => a.t - b.t);
    let freed = 0;
    for (const e of list) { if (have <= quota) break; const b = this._evict(e); have -= b; freed += b; }
    return freed;
  }
  _scheduleTrim() {
    if (this._trimQ) return;
    this._trimQ = true;
    const run = () => { this._trimQ = false; this.trim(); };
    if (typeof setTimeout === 'function') setTimeout(run, 0); else run();
  }
  /** 예산 초과분 정리 → 내린 바이트. 최근 KEEP_MS 안에 쓴 것은 건드리지 않는다 */
  trim(t = now()) {
    let freed = 0;
    const old = (x) => t - x.t >= KEEP_MS;
    // 1) 채색 텍스처 예산 (장면당)
    if (this.paintedBytes > this.paintedBudget) {
      const goal = this.paintedBudget * TRIM_TO;
      const list = [...this.ext.values()].filter((x) => x.release && PAINTED_GROUPS.includes(x.group) && old(x)).sort((a, b) => a.t - b.t);
      for (const x of list) { if (this.paintedBytes <= goal) break; freed += this._releaseTracked(x); }
    }
    // 2) 전체 예산
    if (this.total > this.budget) {
      const goal = this.budget * TRIM_TO;
      const list = [
        ...[...this.cache.values()].filter((e) => e.ok && e.counted && TRIM_FOLDERS.has(e.folder) && old(e)),
        ...[...this.ext.values()].filter((x) => x.release && old(x)),
      ].sort((a, b) => a.t - b.t);
      for (const x of list) {
        if (this.total <= goal) break;
        freed += x.key !== undefined ? this._evict(x) : this._releaseTracked(x);
      }
    }
    return freed;
  }
  /** 주기 확인: 등급 변화(lo/ 선택), 장면 전환, 예산 */
  _poll(t = now()) {
    this._pollT = t;
    const w = this._computeWantLo();
    if (w !== this._wantLo) { this._wantLo = w; this._vEpoch++; }
    this._checkBase(t);
    if (this._sceneAt && t - this._sceneAt >= SCENE_GRACE_MS) { const m = this._sceneAt; this._sceneAt = 0; this._sceneRelease(m); }
    if (this.total > this.budget || this.paintedBytes > this.paintedBudget) this.trim(t);
  }
  stats() {
    let lo = 0;
    for (const e of this.cache.values()) if (e.ok && e.lo) lo++;
    const groups = {};
    for (const [k, v] of Object.entries(this.groups)) if (v) groups[k] = v;
    return {
      total: this.total, budget: this.budget, painted: this.paintedBytes, paintedBudget: this.paintedBudget, groups,
      images: this.cache.size, tracked: this.ext.size, evictions: this.evictions, releasedTracked: this.releasedTracked,
      lo: { want: this._want(), mode: this.loMode, index: this.loIndex === true ? 'all' : this.loIndex ? this.loIndex.size : 0, used: lo, fallbacks: this.loFallbacks, misses: this.loMiss.size },
      packs: this.packSrc.map((p) => ({ url: p.url, ready: !!p.files, failed: p.failed, files: p.files ? Object.keys(p.files).length : 0, loaded: p.bufs.size })),
      env: this.env(),
    };
  }

  // ───────────────────────── 팩 ─────────────────────────
  /** 에셋 팩 사용: index.json 주소 → Promise<boolean> (목록을 받았는지). 여러 번 부르면 나중 것이 우선 */
  usePack(url) {
    if (typeof url !== 'string' || !url) return Promise.resolve(false);
    const p = { url, files: null, packs: [], complete: true, failed: false, bufs: new Map(), blobs: new Map(), ready: null };
    this.packSrc.unshift(p);
    p.ready = (typeof fetch === 'function' ? fetch(url) : Promise.reject(new Error('no fetch')))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`pack index ${r.status}`))))
      .then((ix) => {
        if (!isObj(ix) || ix.v !== 1 || !Array.isArray(ix.packs) || !isObj(ix.files)) throw new Error('bad pack index');
        const files = Object.create(null);
        for (const [f, ent] of Object.entries(ix.files)) {
          if (UNSAFE.has(f) || !Array.isArray(ent) || ent.length < 3 || !ent.slice(0, 3).every((n) => Number.isInteger(n) && n >= 0) || ent[0] >= ix.packs.length) continue;
          files[f] = ent;
        }
        p.packs = ix.packs.map((f) => joinUrl(url, String(f)));
        p.complete = ix.complete !== false;
        p.files = files;
        return true;
      })
      .catch((err) => { p.failed = true; console.error('[assets] 에셋 팩을 불러오지 못했습니다:', url, err?.message ?? err); return false; })
      .then((ok) => { this._refreshVariants(); return ok; });
    this._packsReady = Promise.all(this.packSrc.map((q) => q.ready));
    return p.ready;
  }
  _packComplete() { return this.packSrc.some((p) => p.files && p.complete); }
  _packHas(f) { for (const p of this.packSrc) if (p.files?.[f]) return true; return false; }
  _packBuf(p, n) {
    let b = p.bufs.get(n);
    if (b) { p.bufs.delete(n); p.bufs.set(n, b); return b.promise; }   // 최근 사용 순서 갱신
    b = { buf: null, promise: null };
    b.promise = fetch(p.packs[n]).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null).then((buf) => { b.buf = buf; if (!buf) p.bufs.delete(n); return buf; });
    p.bufs.set(n, b);
    while (p.bufs.size > MAX_PACK_BUFS) p.bufs.delete(p.bufs.keys().next().value);
    return b.promise;
  }
  /** 팩 안 파일 바이트 → Uint8Array | null(팩이 깨짐) | undefined(어느 팩에도 없음) */
  async _bytes(f) {
    await this._packsReady;
    for (const p of this.packSrc) {
      const ent = p.files?.[f];
      if (!ent) continue;
      const buf = await this._packBuf(p, ent[0]);
      if (!buf || ent[1] + ent[2] > buf.byteLength) return null;
      return new Uint8Array(buf, ent[1], ent[2]);
    }
    return undefined;
  }
  _mkBlob(p, f, u8) {
    const ext = (f.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
    const u = URL.createObjectURL(new Blob([u8], { type: MIME[ext] || 'application/octet-stream' }));
    p.blobs.set(f, u);
    return u;
  }
  /** blob: 주소 (팩에서) → string | null(깨짐) | undefined(팩에 없음) */
  async _blob(f) {
    await this._packsReady;
    for (const p of this.packSrc) {
      const ent = p.files?.[f];
      if (!ent) continue;
      if (p.blobs.has(f)) return p.blobs.get(f);
      const u8 = await this._bytes(f);
      return u8 ? (p.blobs.get(f) ?? this._mkBlob(p, f, u8)) : null;
    }
    return undefined;
  }
  /** 동기 blob: 주소: 이미 만들었거나 그 팩 조각이 메모리에 있을 때만 */
  _blobSync(f) {
    for (const p of this.packSrc) {
      const ent = p.files?.[f];
      if (!ent) continue;
      if (p.blobs.has(f)) return p.blobs.get(f);
      const buf = p.bufs.get(ent[0])?.buf;
      if (buf && ent[1] + ent[2] <= buf.byteLength) { try { return this._mkBlob(p, f, new Uint8Array(buf, ent[1], ent[2])); } catch { return null; } }
      return null;
    }
    return null;
  }
}
export const assets = new Assets();
