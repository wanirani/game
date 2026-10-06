// 익명 통계·오류 보내기 (docs/TELEMETRY.md) — 실제 기기에서 무엇이 일어나는지(오류·사망·클리어 시간·성능) 배우기 위한 것.
// 서버: POST /api/t (netlify/lib/telemetry.mts — 같은 허용 목록으로 다시 검사한다). 계정 id·이름·IP 같은 개인 정보는 보내지 않는다.
//  - 설치 id: 무작위 128비트 base64url, localStorage bn_tid. 메타(game.meta)에는 넣지 않는다 — 메타는 로그인하면 클라우드에 올라가
//    계정과 이어지기 때문. 설정에서 끄면 설치 id 와 보내지 못한 사건을 지운다 (다시 켜면 새 id)
//  - 사건 (허용 목록만): session_start · error · perf · stage_start · stage_clear · death · boss_result · arcade_result
//    스토리 회차(docs/specs/ngplus.md §7)면 stage_start · stage_clear · death · boss_result 에 선택 필드 ng (지난 회차 수 1..9)
//    게임 쪽은 버스 이벤트(stageEntered · bossStarted · bossKilled · playerDied {cause} · stageCleared · arcadeFinished)와
//    window error/unhandledrejection, 잡힌 오류 보고 globalThis.__bnReportError(e, where) (events.js 버스 · game.js 그리기) 로만 잇는다
//  - 묶어 보내기: 메모리 줄 + localStorage bn_tq 사본 (최대 200, 넘치면 오래된 것부터 버림) → 30초마다 · 화면이 숨을 때(visibilitychange·pagehide)
//    POST /api/t (한 번에 ≤ 50건 · ≤ 24KB). 웹은 숨을 때 navigator.sendBeacon(text/plain), 그 밖엔 fetch keepalive.
//    안드로이드 앱은 /api 프록시가 본문을 받을 수 있는 감싼 window.fetch 만 쓴다 (sendBeacon 본문은 프록시에 닿지 않는다, docs/ACCOUNTS.md §1).
//    오프라인·429·5xx 는 나중에 다시 (지수 대기), 400·413·415 는 그 묶음을 버리고, 404·405(이 사이트에 API 없음)는 이번 실행에서 그만둔다
//  - 켜고 끄기: 설정 › 기타 '익명 통계·오류 보내기' (settings.telemetry, 기본 켬 · navigator.globalPrivacyControl 이면 기본 끔 — core/save.js)
//    타이틀에 한 번 안내 카드 (닫으면 meta.tips.telemetry)
//  - 보내지 않는 곳: navigator.webdriver(자동화) · localhost·127.0.0.1 · 개발 스위치(?debug ?scene= ?stage= ?nosw ?feelstats ?painted ?lo ?qa ?ng=)
//    · http(https 가 아님) · claude.ai 임베드 · /api 프록시 없는 옛 앱. ?telemetry=1 은 이 검사를 건너뛴다(시험용 — 설정·GPC 는 그대로 따른다),
//    ?telemetry=0 은 늘 끔. 막히면 구독·타이머를 하나도 걸지 않는다 (비용 0)
//  - 게임 루프를 막지 않는다: 모든 일은 버스 구독·1초 타이머·이벤트 처리기 안에서 try/catch, 보내기는 비동기
import { bus } from './events.js';
import { TILE } from './game.js';
import { input } from './input.js';
import * as platform from './platform.js';

const URL_T = '/api/t';
const K_ID = 'bn_tid', K_Q = 'bn_tq';
const MAX_Q = 200, MAX_BATCH = 50, MAX_BYTES = 24 * 1024;
const FLUSH_EVERY = 30, PERF_EVERY = 60; // 초 (타이머 1초)
const MAX_ERRORS = 25, MAX_PER_SIG = 3; // 한 실행에서 보내는 오류 수 · 같은 오류 수
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|::1|0\.0\.0\.0)$/i;
const BLOCKED = /(^|\.)(claude\.ai|claude\.site|claudeusercontent\.com|claudemcpcontent\.com|anthropic\.com)$/i;
const DEV_PARAMS = ['debug', 'scene', 'stage', 'feelstats', 'nosw', 'painted', 'lo', 'qa', 'ng'];   // ng = 회차 디버그 ?ng=N (docs/specs/ngplus.md §8)
const ID = /^[a-z0-9_]{1,40}$/;
const MODES = new Set(['story', 'practice', 'bossrush', 'survival']);
/** 사건 종류 → 꼭 있어야 하는 필드 (서버 EVENT_FIELDS 와 같아야 한다 — 빠지면 그 사건만 버린다: 서버가 묶음 전체를 거절하지 않게) */
const REQUIRED = {
  session_start: ['b', 'plat', 'os', 'br', 'vp', 'dpr', 'q', 'tier', 'input'],
  error: ['msg', 'fr', 'kind'],
  perf: ['fps', 'p5', 'tier', 'dur'],
  stage_start: ['stage', 'mode', 'hero', 'lv', 'diff', 'in'],
  stage_clear: ['stage', 'mode', 'time', 'rank', 'deaths', 'hero', 'lv', 'diff'],
  death: ['stage', 'x', 'y', 'cause', 'hero', 'lv', 'time', 'mode', 'diff'],
  boss_result: ['boss', 'win', 'lv', 'hero', 'diff', 'mode'],
  arcade_result: ['mode', 'score', 'time', 'cleared', 'hero'],
};
export const TELEMETRY_TYPES = Object.keys(REQUIRED);
export const TELEMETRY_REQUIRED = REQUIRED;
export const NOTICE_TEXT = '게임을 더 좋게 만들기 위해 익명 통계와 오류 기록을 보냅니다. 설정 › 기타에서 끌 수 있어요.';

const W = typeof window !== 'undefined' ? window : null;
const idOf = (v) => (typeof v === 'string' && ID.test(v) ? v : undefined);
const int = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined);
const num = (v, lo, hi, d = 100) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v * d) / d)) : undefined);
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randId(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a);
}
/** 제어 문자(줄바꿈·줄 구분자 포함)를 공백으로 */
function noControl(s) {
  let o = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    o += c < 32 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 ? ' ' : ch;
  }
  return o;
}
/** 주소의 출처(scheme://host)와 ?쿼리·#조각을 떼고 경로만 */
const stripUrl = (u) => String(u).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').replace(/[?#].*$/, '').replace(/^\/+/, '');
/** 오류 문구: 문장 속 주소는 경로만, 메일은 가리고, 300자까지 */
export function cleanMessage(m) {
  return noControl(String(m ?? ''))
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/'"<>()]+(\/[^\s'"<>()?#]*)?(\?[^\s'"<>()#]*)?(#\S*)?/gi, (_, p) => p || '/')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .trim().slice(0, 300) || 'error';
}
/** 스택 → 위에서 5개 'file:line:col' (출처·쿼리 제거). 확장 프로그램에서 난 오류면 null */
export function stackFrames(stack) {
  const out = [];
  if (typeof stack !== 'string') return out;
  for (const line of stack.split('\n')) {
    const m = /(?:^|[\s(@])([^\s()@]+):(\d+):(\d+)\)?\s*$/.exec(line);
    if (!m) continue;
    if (/^(chrome|moz|safari|safari-web)-extension:/i.test(m[1])) return null;
    const file = stripUrl(m[1]).replace(/[^A-Za-z0-9_.\/@$~<>-]/g, '_').slice(-100) || '_';
    out.push(`${file}:${m[2].slice(0, 7)}:${m[3].slice(0, 7)}`);
    if (out.length >= 5) break;
  }
  return out;
}

/** 이 페이지에서 보내도 되는가 → {ok, forced, why} */
export function telemetryGate(loc, nav, win) {
  let q;
  try { q = new URLSearchParams(loc?.search ?? ''); } catch { q = new URLSearchParams(); }
  const force = q.get('telemetry');
  if (force === '0') return { ok: false, why: 'param' };
  const host = String(loc?.hostname ?? '');
  if (BLOCKED.test(host)) return { ok: false, why: 'host' };
  const app = win?.__BN_APP;
  if (app && app.apiProxy !== true) return { ok: false, why: 'app' }; // 같은 출처 /api 가 없는 옛 앱
  const https = loc?.protocol === 'https:';
  const local = LOCAL.test(host);
  if (force === '1') return https || (loc?.protocol === 'http:' && local) ? { ok: true, forced: true, why: 'forced' } : { ok: false, why: 'protocol' };
  if (!https) return { ok: false, why: 'protocol' };
  if (nav?.webdriver) return { ok: false, why: 'webdriver' };
  if (local) return { ok: false, why: 'local' };
  if (DEV_PARAMS.some((k) => q.has(k))) return { ok: false, why: 'dev' };
  return { ok: true, forced: false, why: 'ok' };
}

// ── 기기 정보 (버킷으로만) ──
function osOf(ua, nav) {
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1)) return 'ios';
  if (/CrOS/.test(ua)) return 'chromeos';
  if (/Windows/.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'macos';
  if (/Linux/.test(ua)) return 'linux';
  return 'other';
}
function browserOf(ua) {
  if (W?.__BN_APP || /; wv\)/.test(ua)) return 'webview';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Edg(A|iOS)?\//.test(ua)) return 'edge';
  if (/OPR\/|Opera/.test(ua)) return 'opera';
  if (/Firefox\/|FxiOS/.test(ua)) return 'firefox';
  if (/CriOS|Chrome\/|Chromium\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}
const CORE_BUCKETS = [1, 2, 4, 6, 8, 12, 16, 24, 32];
const coresBucket = (n) => (Number.isFinite(n) && n > 0 ? CORE_BUCKETS.filter((b) => b <= n).pop() ?? 1 : undefined);
function buildVersion() {
  const v = W?.__BN_BUILD?.version || (W?.__BN_APP?.version ? `apk-${W.__BN_APP.version}` : 'dev');
  return String(v).replace(/[^0-9A-Za-z.+_-]/g, '_').slice(0, 64) || 'dev';
}

class Telemetry {
  constructor() {
    this.game = null; this.active = false; this.forced = false; this.why = 'init';
    this.q = []; this.sid = null; this.id = null; this.t0 = 0; this.n = 0;
    this.started = false; this.busy = false; this.dead = false; this.fails = 0; this.retryAt = 0; this.saveT = 0;
    this.errs = new Map(); this.errN = 0; this.fps = []; this.cur = null; this.sent = 0;
    this.wasOn = false;
  }
  /** main.js 가 부팅 때 한 번. 막힌 환경이면 아무것도 걸지 않는다 */
  init(game) {
    this.game = game;
    game.telemetry = this;
    if (game.settings?.telemetry === false) this.forget(); // 꺼 둔 기기: 혹시 남은 기록·익명 번호를 지운다
    let g;
    try { g = telemetryGate(W?.location, W?.navigator, W); } catch { g = { ok: false, why: 'error' }; }
    this.active = !!g.ok; this.forced = !!g.forced; this.why = g.why;
    if (!this.active) return this;
    try { this.setup(); } catch (e) { this.active = false; this.why = 'error'; }
    return this;
  }
  /** 지금 보내는 중인가 (환경이 허락하고, 설정이 켜져 있고, 이 사이트에 API 가 있다) */
  on() { return this.active && !this.dead && this.game?.settings?.telemetry !== false; }
  setup() {
    this.sid = randId(8);
    this.t0 = performance.now();
    this.loadQ();
    const sub = (evt, fn) => bus.on(evt, (d) => { if (this.on()) { try { fn(d); } catch { /* 통계가 게임을 막지 않게 */ } } });
    sub('stageEntered', (d) => queueMicrotask(() => { try { this.stageStart(d); } catch { /* 무시 */ } }));
    sub('bossStarted', (d) => { if (this.cur) this.cur.boss = { id: d?.bossId, t: Number(d?.time) || 0 }; });
    sub('bossKilled', (d) => this.bossEnd(true, d));
    sub('playerDied', (d) => this.death(d));
    sub('stageCleared', (d) => this.stageClear(d));
    sub('arcadeFinished', (d) => this.arcade(d));
    W.addEventListener('error', (ev) => {
      if (!ev || (!ev.error && !ev.message)) return; // 그림·스크립트 받기 실패(자원 오류)는 거품이 일지 않아 여기 오지 않는다
      this.error(ev.error ?? ev.message, 'error', null, ev);
    });
    W.addEventListener('unhandledrejection', (ev) => this.error(ev?.reason, 'rejection'));
    globalThis.__bnReportError = (e, where) => this.error(e, 'caught', where);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush('hide'); });
    W.addEventListener('pagehide', () => this.flush('hide'));
    W.addEventListener('online', () => { this.retryAt = 0; this.flush('online'); });
    this.timer = setInterval(() => this.tick(), 1000);
  }
  secs() { return Math.round((performance.now() - this.t0) / 100) / 10; }

  // ── 줄 ──
  loadQ() {
    try {
      const a = JSON.parse(localStorage.getItem(K_Q) || '[]');
      if (Array.isArray(a)) this.q = a.filter((e) => e && typeof e === 'object' && Object.hasOwn(REQUIRED, e.t) && typeof e._s === 'string').slice(-MAX_Q);
    } catch { this.q = []; }
  }
  saveNow() {
    if (this.saveT) { clearTimeout(this.saveT); this.saveT = 0; }
    try {
      if (this.q.length) localStorage.setItem(K_Q, JSON.stringify(this.q));
      else localStorage.removeItem(K_Q);
    } catch { /* 저장소 막힘: 메모리 줄만 */ }
  }
  saveSoon() { if (!this.saveT) this.saveT = setTimeout(() => { this.saveT = 0; this.saveNow(); }, 2000); }
  installId() {
    if (this.id) return this.id;
    let id = null;
    try { id = localStorage.getItem(K_ID); } catch { /* 무시 */ }
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(id)) {
      id = randId(16);
      try { localStorage.setItem(K_ID, id); } catch { /* 이번 실행만 */ }
    }
    return (this.id = id);
  }
  /** 사건 하나를 줄에 (허용 종류·필수 필드가 있을 때만). 값이 없는 필드는 뺀다 */
  track(type, data) {
    if (!this.on() || !Object.hasOwn(REQUIRED, type)) return false;
    const e = { t: type, s: this.secs() };
    for (const [k, v] of Object.entries(data ?? {})) {
      if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) continue;
      e[k] = v;
    }
    if (REQUIRED[type].some((k) => e[k] === undefined)) return false;
    e._s = this.sid;
    this.q.push(e);
    if (this.q.length > MAX_Q) this.q.splice(0, this.q.length - MAX_Q);
    this.saveSoon();
    return true;
  }

  // ── 타이머: 시작 알림 · 성능 표본 · 30초마다 보내기 · 껐을 때 지우기 ──
  tick() {
    try {
      const on = this.on();
      if (!on) {
        if (this.wasOn && this.game?.settings?.telemetry === false) this.forget();
        this.wasOn = false;
        return;
      }
      this.wasOn = true;
      if (!this.started) { this.started = true; this.sessionStart(); }
      this.perfTick();
      if (++this.n % FLUSH_EVERY === 0) this.flush('timer');
    } catch { /* 무시 */ }
  }
  /** 설정에서 껐다: 보내지 못한 사건·설치 id 를 지운다 (다시 켜면 새 id 로 새로 시작) */
  forget() {
    this.q.length = 0; this.id = null; this.started = false; this.fps.length = 0;
    try { localStorage.removeItem(K_Q); localStorage.removeItem(K_ID); } catch { /* 무시 */ }
  }
  sessionStart() {
    const nav = W.navigator, ua = String(nav.userAgent || ''), g = this.game;
    const touch = !!W.matchMedia?.('(pointer: coarse)')?.matches;
    const plat = W.__BN_APP ? 'apk' : platform.isStandalone?.() ? 'pwa' : 'web';
    this.track('session_start', {
      b: buildVersion(), plat, os: osOf(ua, nav), br: browserOf(ua),
      vp: `${Math.floor((W.innerWidth || 0) / 100) * 100}x${Math.floor((W.innerHeight || 0) / 100) * 100}`,
      dpr: num(Math.round((W.devicePixelRatio || 1) * 4) / 4, 0.25, 8), cores: coresBucket(nav.hardwareConcurrency),
      mem: num(nav.deviceMemory, 0, 64), q: ['auto', 'low', 'medium', 'high'].includes(g?.settings?.quality) ? g.settings.quality : 'auto',
      tier: ['low', 'medium', 'high'].includes(g?.tier) ? g.tier : 'medium', input: touch ? 'touch' : 'kb',
    });
  }
  perfTick() {
    const g = this.game;
    if (!g?.inGameplay || document.visibilityState !== 'visible' || !Number.isFinite(g.fps)) return;
    this.fps.push(g.fps);
    if (this.fps.length < PERF_EVERY) return;
    const a = this.fps.splice(0).sort((x, y) => x - y);
    const avg = a.reduce((s, v) => s + v, 0) / a.length;
    const heap = W.performance?.memory?.usedJSHeapSize;
    this.track('perf', {
      fps: num(avg, 0, 480, 10), p5: num(a[Math.floor(a.length * 0.05)], 0, 480, 10), tier: g.tier, dur: PERF_EVERY,
      heap: Number.isFinite(heap) ? num(heap / 1048576, 0, 65536, 1) : undefined, scene: idOf(g.top?.name),
    });
  }

  // ── 게임 사건 ──
  heroInfo() {
    const st = this.game?.state, h = st?.heroes?.[st?.charId];
    return { hero: idOf(st?.charId), cls: idOf(h?.classId), lv: int(h?.level, 1, 999), diff: idOf(st?.difficulty) };
  }
  /**
   * 회차 (docs/specs/ngplus.md §7): 스토리 월드이고 지난 회차가 1 이상이면 1..9, 아니면 undefined (1회차·아케이드·연습은 싣지 않는다).
   * world.ng (월드가 회차 세기를 받았는가) 가 먼저, 없으면 세이브의 ng.n 을 인라인으로 (ngplus.js 를 import 하지 않는다)
   */
  ngOf(w) {
    const st = this.game?.state;
    if (w?.mode !== 'story' || !st || st.arcade) return undefined;
    const n = Number.isInteger(w.ng) ? w.ng : Number.isInteger(st.ng?.n) ? st.ng.n : 0;   // [hook:ng]
    return n >= 1 ? Math.min(9, n) : undefined;
  }
  /** 'stageEntered' 다음 마이크로태스크: 장면이 game.world 를 넣은 뒤 */
  stageStart(d) {
    const w = this.game?.world;
    if (!w || w.stage?.id !== d?.stageId || !MODES.has(w.mode)) { this.cur = null; return; } // 마을 등
    const hi = this.heroInfo();
    this.cur = { stage: idOf(w.stage.id), mode: w.mode, ...hi, deaths: 0, boss: null, ng: this.ngOf(w) };
    this.track('stage_start', { stage: this.cur.stage, mode: w.mode, ...hi, in: ['touch', 'kb', 'pad'].includes(input.mode) ? input.mode : 'kb', ng: this.cur.ng });
  }
  /** 사망 원인: 공격(attack 객체)의 주인 → 'boss:<id>' | 'enemy:<id>', 주인 없는 공격 → 'hazard', 문자열 'fall'|'hazard' */
  causeOf(c, w) {
    if (c === 'fall' || c === 'hazard') return c;
    if (c && typeof c === 'object') {
      let o = c.owner, i = 0;
      while (o && i++ < 4) {
        const id = idOf(o.def?.id ?? o.id);
        if (o.kind === 'boss' && id) return `boss:${id}`;
        if (o.kind === 'enemy' && id) return `enemy:${id}`;
        o = o.owner ?? o.boss ?? null;
      }
      if (!c.owner) return 'hazard';
    }
    const b = idOf(w?.boss?.def?.id);
    return w?.bossActive && b ? `boss:${b}` : 'unknown';
  }
  death(d) {
    const w = this.game?.world, p = w?.player;
    if (!w || !p || !MODES.has(w.mode)) return;
    const hi = this.heroInfo();
    if (this.cur) this.cur.deaths++;
    this.track('death', {
      stage: idOf(w.stage?.id), room: idOf(w.roomId), x: int(Math.floor(p.cx / TILE), -99, 9999), y: int(Math.floor((p.y + p.h) / TILE), -99, 9999),
      cause: this.causeOf(d?.cause, w), hero: hi.hero, lv: hi.lv, time: num(w.run?.time, 0, 86400, 10), mode: w.mode, diff: hi.diff, ng: this.ngOf(w),
    });
    if (w.bossActive && !w.cleared && w.boss && !w.boss.dead) this.bossEnd(false, { bossId: w.boss.def?.id, stageId: w.stage?.id, time: w.run?.time });
  }
  /** 보스전 결과: world.startBoss 의 'bossStarted' 가 연 싸움만 (보스 러시는 아케이드 결과로 센다). dur = 보스전 시작부터 (스테이지 시간) */
  bossEnd(win, d) {
    const c = this.cur, hi = this.heroInfo(), id = idOf(d?.bossId);
    if (!c?.boss || !id || c.boss.id !== d.bossId) return;
    const dur = Number.isFinite(d?.time) ? num(d.time - c.boss.t, 0, 86400, 10) : undefined;
    this.track('boss_result', { boss: id, stage: idOf(d?.stageId), dur, win: !!win, lv: hi.lv, hero: hi.hero, diff: hi.diff, mode: c.mode, ng: c.ng });
    if (win) c.boss = null;
  }
  stageClear(d) {
    const c = this.cur;
    if (!c || c.stage !== d?.stageId) return;
    const hi = this.heroInfo();
    this.track('stage_clear', {
      stage: c.stage, mode: c.mode, time: num(d.time, 0, 86400, 10), rank: ['S', 'A', 'B', 'C', 'D'].includes(d.rank) ? d.rank : undefined,
      deaths: int(c.deaths, 0, 9999), hero: hi.hero ?? c.hero, cls: hi.cls ?? c.cls, lv: hi.lv ?? c.lv, diff: c.diff ?? hi.diff, ng: c.ng,
    });
  }
  arcade(d) {
    const kind = ['practice', 'bossrush', 'survival', 'tower'].includes(d?.kind) ? d.kind : null;
    if (!kind) return;
    this.track('arcade_result', {
      mode: kind, score: int(d.score, 0, 1e12), time: num(d.time, 0, 86400, 10), cleared: !!d.cleared, hero: idOf(d.charId), diff: idOf(d.diff),
      wave: int(kind === 'tower' ? d.extra?.floor : d.extra?.wave, 0, 99999), bosses: int(d.extra?.bosses, 0, 999), stage: idOf(d.stageId),   // 무한의 탑: wave 칸 = 돌파한 층
    });
  }
  /** 오류 하나 (같은 오류는 실행마다 3번, 모두 25번까지). 절대 던지지 않는다 */
  error(err, kind = 'caught', where = null, ev = null) {
    try {
      if (!this.on() || this.errN >= MAX_ERRORS) return;
      const msg = cleanMessage(err?.message ?? (typeof err === 'string' ? err : err?.toString?.()) ?? ev?.message);
      if (/^Script error\.?$/i.test(msg) || /ResizeObserver loop/i.test(msg)) return; // 다른 출처 스크립트 · 무해한 브라우저 경고
      let fr = stackFrames(err?.stack);
      if (fr === null) return; // 확장 프로그램
      if (!fr.length && ev?.filename) fr = stackFrames(`${ev.filename}:${ev.lineno | 0}:${ev.colno | 0}`) ?? [];
      const sig = `${msg}|${fr[0] ?? ''}`;
      const n = (this.errs.get(sig) ?? 0) + 1;
      this.errs.set(sig, n);
      if (n > MAX_PER_SIG) return;
      const w = this.game?.world;
      if (this.track('error', {
        msg, fr, kind, where: idOf(String(where ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40) || undefined),
        scene: idOf(this.game?.top?.name), stage: idOf(w?.stage?.id), room: idOf(w?.roomId), b: buildVersion(),
      })) this.errN++;
    } catch { /* 무시 */ }
  }

  // ── 보내기 ──
  /** 줄 앞에서 같은 세션의 사건을 ≤ 50건 · ≤ 24KB 로 */
  batch() {
    const head = this.q[0];
    if (!head) return null;
    const sid = head._s, ev = [];
    const enc = new TextEncoder();
    let bytes = 80;
    for (const it of this.q) {
      if (it._s !== sid || ev.length >= MAX_BATCH) break;
      const { _s, ...e } = it;
      const n = enc.encode(JSON.stringify(e)).length + 1;
      if (ev.length && bytes + n > MAX_BYTES) break;
      ev.push(e); bytes += n;
    }
    return { n: ev.length, body: JSON.stringify({ v: 1, id: this.installId(), sid, ev }) };
  }
  drop(n) { this.q.splice(0, n); this.sent += n; }
  backoff(res) {
    this.fails++;
    const ra = Number(res?.headers?.get?.('Retry-After'));
    const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(600_000, 30_000 * 2 ** (this.fails - 1));
    this.retryAt = Date.now() + wait;
  }
  /** reason: 'timer' | 'hide' | 'online' | 'manual'. 한 번에 한 묶음 (남으면 다음 차례에) → 보냈으면 true */
  async flush(reason = 'manual') {
    if (!this.on() || this.busy || !this.q.length) return false;
    const nav = W.navigator;
    if (nav.onLine === false) { this.saveNow(); return false; }
    if (reason !== 'hide' && Date.now() < this.retryAt) return false;
    let b;
    try { b = this.batch(); } catch { return false; }
    if (!b?.n) return false;
    const app = !!W.__BN_APP;
    if (reason === 'hide') {
      this.saveNow();
      if (!app && typeof nav.sendBeacon === 'function') {
        let ok = false;
        try { ok = nav.sendBeacon(URL_T, b.body) === true; } catch { ok = false; }
        if (ok) { this.drop(b.n); this.saveNow(); return true; }
      }
    }
    this.busy = true;
    try {
      const res = await W.fetch(URL_T, {
        method: 'POST', body: b.body, headers: { 'Content-Type': 'application/json' }, keepalive: !app,
        credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error',
      });
      const s = res.status;
      if (s >= 200 && s < 300) { this.drop(b.n); this.fails = 0; this.retryAt = 0; return true; }
      if (s === 404 || s === 405) { this.dead = true; this.q.length = 0; return false; } // 이 사이트에 /api/t 가 없다
      if (s === 408 || s === 429 || s >= 500) { this.backoff(res); return false; }
      this.drop(b.n); // 400·413·415: 그 묶음은 고쳐 보낼 수 없다
      return false;
    } catch {
      this.backoff(null); // 오프라인·네트워크 오류 (앱 프록시의 X-BN-Proxy-Error 도 여기)
      return false;
    } finally {
      this.busy = false;
      this.saveSoon();
    }
  }

  // ── 타이틀 안내 카드 (scenes/title.js) ──
  noticeDue() {
    const t = this.game?.meta?.tips;
    return this.on() && !(t && typeof t === 'object' && t.telemetry);
  }
  dismissNotice() {
    const m = this.game?.meta;
    if (!m) return;
    const t = m.tips && typeof m.tips === 'object' && !Array.isArray(m.tips) ? m.tips : {};
    m.tips = { ...t, telemetry: true };
    try { this.game.saves?.saveMeta?.(m); } catch { /* 무시 */ }
  }
}

export const telemetry = new Telemetry();
