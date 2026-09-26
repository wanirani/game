// 계정 · 클라우드 저장 클라이언트 (서버 계약: docs/ACCOUNTS.md)
//  - API 는 같은 출처의 절대 경로 '/api/...' 만 부른다 (안드로이드 앱은 WebView 가 /api/* 를 사이트로 대신 전달 → 항상 같은 출처, CORS 없음)
//  - 쓸 수 있는 환경: https, 또는 localhost 의 http. claude.ai 임베드(CSP 가 막음)·file:// 등에서는 요청을 아예 보내지 않는다
//  - 게스트(로그인 안 함)는 네트워크 요청 0건. 계정 화면을 열 때만 GET /api/health 로 서버가 있는지 확인한다
//  - 로그인 중: 슬롯 저장(saves.onWrite) 2초 뒤 그 슬롯을 올린다(rev 로 충돌 검사). 메타(해금·엔딩·기록)는 덮어쓰지 않고 합친다
//  - 모든 서버 작업은 한 줄로 차례대로 실행(queue)되고, 게임 진행을 기다리게 하지 않는다
//  - 이벤트(bus): 'cloud:status' {state} · 'cloud:login' {id, resumed} · 'cloud:logout' {reason} · 'cloud:sync' {phase, ...} · 'cloud:conflict' {slot}
// 시험용: localStorage 'bn_api_base' 에 API 주소(예: '/api')를 넣으면 호스트 검사 없이 그 주소를 쓴다
import { bus } from './events.js';
import { saves, isValidSave } from './save.js';

export const API_BASE = '/api';
const K_AUTH = 'bn_auth', K_BASE = 'bn_api_base', K_SYNC = 'bn_cloud_sync';
export const SLOTS = [1, 2, 3];
const DEBOUNCE = 2000;
const PER_MODE = 20; // 명예의 전당: 모드별 보관 수 (front/common.js 와 같음)
// 계정 기능을 켜지 않는 호스트 (claude.ai 임베드는 CSP 가 다른 요청을 막고, 같은 출처에 /api 도 없다)
const BLOCKED_HOST = /(^|\.)(claude\.ai|claude\.site|claudeusercontent\.com|claudemcpcontent\.com|anthropic\.com)$/i;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i;
// 게임을 진행 중이 아닌 장면 (이 장면이 맨 아래일 때만 클라우드 기록을 현재 슬롯에 받아도 안전)
const FRONT_SCENES = new Set(['title', 'slots', 'account', 'options', 'difficulty', 'charselect', 'arcade', 'highscore', 'credits']);

// ───────────────────────── 서버 오류 문구 (서버가 message 를 주지 않을 때의 대체) ─────────────────────────
export const MESSAGES = {
  bad_request: '요청 형식이 올바르지 않습니다.',
  bad_json: '요청 데이터를 읽을 수 없습니다.',
  payload_too_large: '보내는 데이터가 너무 큽니다.',
  invalid_id: '아이디는 영문 소문자로 시작하는 4~16자의 영문 소문자, 숫자, 밑줄(_)로 만들어 주세요.',
  reserved_id: '사용할 수 없는 아이디입니다. 다른 아이디를 입력해 주세요.',
  id_taken: '이미 사용 중인 아이디입니다.',
  invalid_password: '비밀번호는 8~64자로 입력해 주세요. (줄바꿈 같은 제어 문자는 쓸 수 없습니다)',
  password_same_as_id: '비밀번호는 아이디와 다르게 정해 주세요.',
  same_password: '새 비밀번호가 지금 비밀번호와 같습니다.',
  invalid_credentials: '아이디 또는 비밀번호가 올바르지 않습니다.',
  wrong_password: '비밀번호가 올바르지 않습니다.',
  invalid_recovery: '아이디 또는 복구 코드가 올바르지 않습니다.',
  unauthorized: '로그인이 필요합니다. 다시 로그인해 주세요.',
  locked: '시도가 너무 많아 잠시 잠겼습니다. 잠시 후 다시 시도해 주세요.',
  rate_limited: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  signup_limited: '짧은 시간에 너무 많은 계정이 만들어졌습니다. 1시간쯤 뒤에 다시 시도해 주세요.',
  invalid_slot: '저장 슬롯 번호가 올바르지 않습니다. (1~3)',
  slot_empty: '이 슬롯에는 클라우드에 저장된 데이터가 없습니다.',
  invalid_save: '저장 데이터가 손상되었거나 형식이 올바르지 않습니다.',
  invalid_meta: '기록 데이터의 형식이 올바르지 않습니다.',
  conflict: '다른 기기에서 먼저 저장한 데이터가 있습니다.',
  not_found: '요청한 주소를 찾을 수 없습니다.',
  method_not_allowed: '허용되지 않는 요청 방식입니다.',
  server_error: '서버에 일시적인 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.',
  // 클라이언트 쪽
  network: '서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.',
  timeout: '서버 응답이 너무 늦습니다. 잠시 후 다시 시도해 주세요.',
  offline: '인터넷에 연결되어 있지 않습니다. 연결을 확인해 주세요.',
  bad_response: '서버 응답을 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.',
  unavailable: '이 환경에서는 계정 기능을 쓸 수 없습니다.',
  logged_out: '로그인이 필요합니다.',
  storage_full: '기기의 저장 공간이 부족해 기록을 저장하지 못했습니다.',
  client_error: '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.',
};
const fail = (error, extra = {}) => ({ ok: false, error, message: MESSAGES[error] ?? MESSAGES.server_error, status: 0, ...extra });
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (Number.isFinite(v) ? v : 0);

// ───────────────────────── 저장소 (localStorage, 실패 시 메모리) ─────────────────────────
const mem = {};
function lsGet(k) {
  if (Object.hasOwn(mem, k)) return mem[k];
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); delete mem[k]; return true; } catch { mem[k] = v; return false; }
}
function lsDel(k) {
  delete mem[k];
  try { localStorage.removeItem(k); } catch { /* 무시 */ }
}
function jget(k) { try { return JSON.parse(lsGet(k)); } catch { return null; } }

// ───────────────────────── 입력 검사 (서버 규칙과 같음: netlify/lib/validate.mts) ─────────────────────────
const ID_RE = /^[a-z][a-z0-9_]{3,15}$/;
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'sys', 'guest', 'null', 'undefined', 'nan', 'true', 'false', 'none', 'nil',
  'anonymous', 'anon', 'user', 'users', 'test', 'tester', 'support', 'help', 'helpdesk', 'moderator', 'mod', 'staff',
  'operator', 'owner', 'official', 'server', 'api', 'dev', 'developer', 'netlify', 'bloodnocturne', 'blood_nocturne',
  'gamemaster', 'master', 'webmaster', 'security', 'info', 'account', 'accounts', 'login', 'logout', 'signup',
  'register', 'password', 'recover', 'recovery', 'self', 'everyone', 'nobody', 'default', 'unknown', 'superuser',
  'sudo', 'service', 'manager', 'console', 'bot', 'noreply', 'no_reply', 'postmaster', 'hostmaster', 'abuse',
]);
const RESERVED_PREFIX = ['admin', 'system', 'official', 'moderator', 'gm_', 'staff_', 'netlify'];
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f  ]/;

/** 아이디 정규화: 앞뒤 공백 제거 + 소문자 (서버와 같음) */
export const normalizeId = (raw) => String(raw ?? '').trim().toLowerCase();

/** 아이디 검사 → 오류 문구 또는 null. signup 이면 예약된 아이디도 거른다 */
export function checkId(raw, signup = false) {
  const id = normalizeId(raw);
  if (!id) return '아이디를 입력해 주세요.';
  if (/[^\x21-\x7e]/.test(id)) return '아이디에는 한글이나 공백을 쓸 수 없습니다. 영문 소문자, 숫자, 밑줄(_)만 쓸 수 있습니다.';
  if (!/^[a-z]/.test(id)) return '아이디는 영문자로 시작해야 합니다.';
  if (/[^a-z0-9_]/.test(id)) return '아이디에는 영문 소문자, 숫자, 밑줄(_)만 쓸 수 있습니다.';
  if (id.length < 4 || id.length > 16) return `아이디는 4~16자로 입력해 주세요. (지금 ${id.length}자)`;
  if (!ID_RE.test(id)) return MESSAGES.invalid_id;
  if (signup && (RESERVED.has(id) || RESERVED_PREFIX.some((p) => id.startsWith(p)))) return MESSAGES.reserved_id;
  return null;
}

/** 새 비밀번호 검사 (8~64자, 제어 문자 금지, 아이디와 다름) → 오류 문구 또는 null */
export function checkPassword(pw, id = '') {
  if (!pw) return '비밀번호를 입력해 주세요.';
  if (CONTROL_RE.test(pw)) return '비밀번호에는 줄바꿈 같은 제어 문자를 쓸 수 없습니다.';
  const n = [...pw.normalize('NFC')].length;
  if (n < 8) return `비밀번호는 8자 이상이어야 합니다. (지금 ${n}자)`;
  if (n > 64) return `비밀번호는 64자까지 쓸 수 있습니다. (지금 ${n}자)`;
  if (id && pw.normalize('NFC').toLowerCase() === normalizeId(id)) return MESSAGES.password_same_as_id;
  return null;
}

/** 복구 코드 검사 (하이픈·공백·대소문자는 무시) → 오류 문구 또는 null */
export function checkRecoveryCode(raw) {
  const c = String(raw ?? '').replace(/[\s-]/g, '');
  if (!c) return '복구 코드를 입력해 주세요.';
  if (/[^0-9a-z]/i.test(c)) return '복구 코드는 영문과 숫자로만 되어 있습니다. (예: ABCD-EFGH-JKMN-PQRS)';
  if (c.length !== 16) return `복구 코드는 16자리입니다. (지금 ${c.length}자리, 예: ABCD-EFGH-JKMN-PQRS)`;
  return null;
}

/** 이 페이지에서 계정 기능을 켤 수 있는가 (https 또는 localhost, claude.ai 계열 호스트 제외) */
export function isEligibleLocation(loc) {
  if (!loc) return false;
  const host = String(loc.hostname ?? '');
  if (BLOCKED_HOST.test(host)) return false;
  if (loc.protocol === 'https:') return true;
  return loc.protocol === 'http:' && LOCAL_HOST.test(host);
}

// ───────────────────────── 요약 · 동기화 판정 ─────────────────────────
/** 세이브 요약 (서버의 summary 와 같은 모양) */
export function summarize(s) {
  if (!isObj(s)) return null;
  const hero = isObj(s.heroes) ? s.heroes[s.charId] : null;
  return {
    charId: s.charId ?? null, level: hero?.level ?? 1, classId: hero?.classId ?? null, chapter: s.progress?.chapter ?? 0,
    playTime: s.stats?.playTime ?? 0, difficulty: s.difficulty ?? null, gold: s.gold ?? 0, clientSavedAt: s.savedAt ?? null,
  };
}

/**
 * 슬롯 하나의 동기화 상태를 판정한다.
 *  local : 이 기기의 기록({savedAt, …}) 또는 null
 *  cloud : 서버 목록 항목 {empty, rev, savedAt, summary}
 *  rec   : 마지막 동기화 기록 {rev(그때 서버 rev), at(그때 이 기기 savedAt), del(이 기기에서 지움), dirty(로그인 중 저장됨)} 또는 null
 * → { status, auto }
 *  status: 'empty' 둘 다 없음 | 'synced' 같음 | 'local' 기기가 최신 | 'cloud' 서버가 최신 | 'conflict' 양쪽이 따로 바뀜
 *  auto  : 데이터를 잃지 않는 자동 동작 'upload' | 'download' | 'delete' | null
 */
export function classifySlot(local, cloud, rec) {
  const lEmpty = !local, cEmpty = !cloud || !!cloud.empty;
  if (lEmpty && cEmpty) return { status: 'empty', auto: null };
  if (cEmpty) return { status: 'local', auto: rec?.dirty ? 'upload' : null }; // 클라우드에 없음: 로그인 중 저장했던 것만 자동으로 올림
  if (lEmpty) {
    if (rec?.del && rec.rev === cloud.rev) return { status: 'local', auto: 'delete' }; // 이 기기에서 지운 기록 → 클라우드에서도 지움
    return { status: 'cloud', auto: 'download' }; // 이 기기가 비어 있음 → 받아도 잃는 것 없음
  }
  if (local.savedAt && cloud.summary?.clientSavedAt === local.savedAt) return { status: 'synced', auto: null };
  const serverSame = !!rec && rec.rev === cloud.rev;
  const localSame = !!rec && rec.at != null && rec.at === local.savedAt;
  if (serverSame && localSame) return { status: 'synced', auto: null };
  if (serverSame) return { status: 'local', auto: 'upload' };
  if (localSame) return { status: 'cloud', auto: 'download' };
  return { status: 'conflict', auto: null };
}

// ───────────────────────── 메타(전역 기록) 합치기 ─────────────────────────
const union = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter((x) => typeof x === 'string'))];

function mergeScores(a, b) {
  const byKey = new Map();
  for (const h of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!isObj(h)) continue;
    const mode = h.mode || 'story';
    // 스토리 모드는 한 회차(run)당 한 줄 — 여러 기기에서 같은 세이브로 기록해도 최고점 하나만 남긴다
    const key = h.run && mode === 'story' ? `run|${h.run}` : [mode, h.score, h.date, h.charId, h.name, h.stageId ?? h.stage ?? ''].join('|');
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, h);
    else if (num(h.score) > num(prev.score)) byKey.set(key, { ...h, name: h.name || prev.name });
  }
  const cnt = {};
  return [...byKey.values()]
    .sort((x, y) => num(y.score) - num(x.score))
    .filter((h) => { const k = h.mode || 'story'; cnt[k] = (cnt[k] ?? 0) + 1; return cnt[k] <= PER_MODE; })
    .slice(0, 200);
}
function betterRush(x, y) {
  const ok = (e) => isObj(e) && num(e.time) > 0;
  if (!ok(x)) return ok(y) ? y : (x ?? y ?? null);
  if (!ok(y)) return x;
  return num(y.time) < num(x.time) ? y : x;
}
function mergeCounts(a, b) {
  const out = { ...(isObj(b) ? b : {}) };
  for (const [k, v] of Object.entries(isObj(a) ? a : {})) {
    const w = out[k];
    out[k] = Number.isFinite(v) && Number.isFinite(w) ? Math.max(v, w) : (v ?? w);
  }
  return out;
}

/**
 * 이 기기 메타(a)와 서버 메타(b)를 합친다: 해금 캐릭터·엔딩은 합집합, 클리어 수·서바이벌 최고 기록은 큰 값,
 * 도감은 항목별 큰 값, 명예의 전당은 두 목록을 합쳐 모드별 상위 20개, 보스 러시는 코스별 최단 기록.
 * 그 밖의 필드(마지막 캐릭터·이니셜·아케이드 설정 등)는 이 기기 값이 우선.
 */
export function mergeMeta(a, b) {
  a = isObj(a) ? a : {};
  if (!isObj(b)) return JSON.parse(JSON.stringify(a));
  const out = JSON.parse(JSON.stringify({ ...b, ...a }));
  out.unlockedChars = union(a.unlockedChars, b.unlockedChars);
  out.endingsSeen = union(a.endingsSeen, b.endingsSeen);
  out.konami = !!(a.konami || b.konami);
  out.clears = Math.max(num(a.clears), num(b.clears));
  out.survivalBest = Math.max(num(a.survivalBest), num(b.survivalBest));
  out.bestiary = mergeCounts(a.bestiary, b.bestiary);
  out.highScores = mergeScores(a.highScores, b.highScores);
  if (a.bossRushBest !== undefined || b.bossRushBest !== undefined) out.bossRushBest = betterRush(a.bossRushBest, b.bossRushBest);
  if (isObj(a.bossRushBests) || isObj(b.bossRushBests)) {
    const A = isObj(a.bossRushBests) ? a.bossRushBests : {}, B = isObj(b.bossRushBests) ? b.bossRushBests : {};
    out.bossRushBests = {};
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) out.bossRushBests[k] = betterRush(A[k], B[k]);
  }
  return JSON.parse(JSON.stringify(out));
}

/** 서버 검사(invalid_meta)에 걸리지 않게 모양을 다듬은 복사본 */
export function cleanMeta(m) {
  const o = JSON.parse(JSON.stringify(isObj(m) ? m : {}));
  o.unlockedChars = union(o.unlockedChars, []);
  o.endingsSeen = union(o.endingsSeen, []);
  o.highScores = (Array.isArray(o.highScores) ? o.highScores : []).filter(isObj).slice(0, 200);
  if (!isObj(o.bestiary)) o.bestiary = {};
  o.clears = num(o.clears); o.survivalBest = num(o.survivalBest); o.konami = !!o.konami;
  // 64KB 제한 여유: 너무 크면 기록 목록을 줄인다
  if (JSON.stringify(o).length > 56000) o.highScores = o.highScores.slice(0, 40);
  return o;
}
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}
const metaHash = (m) => stable(cleanMeta(m));

const fmtWait = (sec) => (sec < 60 ? `${Math.max(1, Math.round(sec))}초` : `${Math.ceil(sec / 60)}분`);

// ───────────────────────── 클라이언트 ─────────────────────────
class Cloud {
  constructor() {
    this.game = null;
    this.state = 'unknown'; // 'unknown' | 'checking' | 'ready' | 'offline' | 'unavailable' | 'blocked'
    this.auth = null;       // { id, token }
    this.verified = false;  // 이번 실행에서 서버가 토큰을 확인했는가
    this.createdAt = null;
    this.lastSync = 0;
    this.view = {};         // slot → { status, cloud:{empty,rev,savedAt,summary}|null, busy, error }
    for (const s of SLOTS) this.view[s] = { status: 'unknown', cloud: null, busy: false, error: null };
    this.metaView = { status: 'unknown', rev: null };
    this.queue = Promise.resolve();
    this.timers = {};
    this.muted = false;     // 받은 메타를 저장하는 동안 onWrite 무시
    this.warned = new Set(); // 이번 실행에서 이미 알린 충돌 슬롯
    this._refresh = null; this._probe = null; this._probeAt = 0;
    this.loadAuth();
  }

  // ── 준비 ──
  init(game) {
    if (this.game) return;
    this.game = game;
    saves.onWrite((ev) => this.onLocalWrite(ev));
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.onOnline());
      window.addEventListener('offline', () => { if (this.state === 'ready') this.setState('offline'); });
    }
    if (typeof document !== 'undefined') {
      // 탭이 숨겨질 때(앱 전환·닫기 직전) 기다리던 업로드를 바로 보낸다
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.flushTimers(); });
    }
    if (!this.eligible()) this.setState('blocked');
    else if (this.auth) this.resume();
  }
  get base() {
    const o = lsGet(K_BASE);
    return typeof o === 'string' && o.trim() ? o.trim().replace(/\/+$/, '') : API_BASE;
  }
  /** 이 환경에서 서버 요청을 보내도 되는가 */
  eligible() {
    const o = lsGet(K_BASE);
    if (typeof o === 'string' && o.trim()) return true;
    return typeof location !== 'undefined' && isEligibleLocation(location);
  }
  get loggedIn() { return !!this.auth; }
  get id() { return this.auth?.id ?? null; }
  get available() { return this.state === 'ready'; }
  /** 타이틀 등에 보여 줄 이름 */
  label() { return this.auth ? this.auth.id : '게스트'; }
  setState(s) {
    if (this.state === s) return;
    this.state = s;
    bus.emit('cloud:status', { state: s });
  }

  // ── 토큰 ──
  loadAuth() {
    const a = jget(K_AUTH);
    this.auth = isObj(a) && typeof a.id === 'string' && typeof a.token === 'string' && a.token ? { id: a.id, token: a.token } : null;
  }
  setAuth(id, token) {
    this.auth = { id, token };
    this.verified = true;
    lsSet(K_AUTH, JSON.stringify(this.auth));
    this.resetView();
    this.setState('ready');
    bus.emit('cloud:login', { id, resumed: false });
  }
  clearAuth(reason = 'logout') {
    if (!this.auth) return;
    const id = this.auth.id;
    this.auth = null; this.verified = false; this.createdAt = null; this.lastSync = 0;
    for (const k of Object.keys(this.timers)) { clearTimeout(this.timers[k]); delete this.timers[k]; }
    lsDel(K_AUTH);
    this.resetView();
    this.warned.clear();
    bus.emit('cloud:logout', { id, reason });
  }
  resetView() {
    for (const s of SLOTS) this.view[s] = { status: 'unknown', cloud: null, busy: false, error: null };
    this.metaView = { status: 'unknown', rev: null };
  }
  /** 토큰이 서버에서 거부됨 (만료·폐기) */
  expire() {
    const had = !!this.auth;
    this.clearAuth('expired');
    if (had) this.game?.toast?.('로그인이 만료되었습니다. 계정 화면에서 다시 로그인해 주세요.', '#ffb070', 3.2);
  }

  // ── 동기화 기록 (계정별) ──
  syncDb() { const d = jget(K_SYNC); return isObj(d) ? d : {}; }
  recs(id = this.id) {
    const d = this.syncDb();
    const r = isObj(d[id]) ? d[id] : {};
    if (!isObj(r.slots)) r.slots = {};
    return r;
  }
  saveRecs(r, id = this.id) {
    if (!id) return;
    const d = this.syncDb();
    d[id] = r;
    lsSet(K_SYNC, JSON.stringify(d));
  }
  rec(slot) { const r = this.recs().slots[slot]; return isObj(r) ? r : null; }
  setRec(slot, v) {
    if (!this.id) return;
    const r = this.recs();
    if (v) r.slots[slot] = v; else delete r.slots[slot];
    this.saveRecs(r);
  }
  patchRec(slot, patch) { const cur = this.rec(slot); this.setRec(slot, { rev: cur?.rev ?? null, at: cur?.at ?? null, ...cur, ...patch }); }
  metaRec() { const m = this.recs().meta; return isObj(m) ? m : null; }
  setMetaRec(v) { if (!this.id) return; const r = this.recs(); r.meta = v; this.saveRecs(r); }
  dropRecs(id) { const d = this.syncDb(); delete d[id]; lsSet(K_SYNC, JSON.stringify(d)); }
  /** 이 슬롯을 다음 업로드 때 서버 것과 상관없이 덮어쓰도록 표시 (사용자가 덮어쓰기를 확인한 경우) */
  markOverwrite(slot) { if (this.auth && SLOTS.includes(slot)) this.patchRec(slot, { force: true }); }

  // ── 요청 ──
  async request(method, path, { body, auth = true, timeout = 10000 } = {}) {
    if (!this.eligible()) return fail('unavailable');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return fail('offline');
    const token = auth ? this.auth?.token : null;
    if (auth && !token) return fail('logged_out');
    const headers = { Accept: 'application/json' };
    let payload;
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    if (token) headers.Authorization = `Bearer ${token}`;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl?.abort(); }, timeout);
    try {
      const res = await fetch(this.base + path, { method, headers, body: payload, signal: ctrl?.signal, cache: 'no-store' });
      let json = null;
      try { json = await res.json(); } catch { json = null; }
      if (!isObj(json) || typeof json.ok !== 'boolean') return fail('bad_response', { status: res.status });
      json.status = res.status;
      if (!json.ok) {
        if (typeof json.error !== 'string') json.error = 'server_error';
        if (typeof json.message !== 'string' || !json.message) json.message = MESSAGES[json.error] ?? MESSAGES.server_error;
        if (res.status === 429) {
          const ra = Number(json.retryAfter ?? res.headers.get('Retry-After'));
          if (ra > 0) { json.retryAfter = ra; json.message += ` (${fmtWait(ra)} 뒤에 다시 시도할 수 있습니다)`; }
        }
        if (json.error === 'unauthorized' && token && this.auth?.token === token) this.expire();
      }
      return json;
    } catch {
      return fail(timedOut ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }
  /** 서버 작업을 한 줄로 세워 차례대로 실행 (같은 슬롯을 동시에 올려 충돌하는 일을 막는다) */
  enqueue(fn) {
    const p = this.queue.then(() => fn()).catch((e) => { console.error('[cloud]', e); return fail('client_error'); });
    this.queue = p.then(() => {}, () => {});
    return p;
  }
  /** 연결 실패 결과를 상태에 반영 */
  noteResult(r) {
    if (!r) return;
    if (r.error === 'bad_response') { this.setState('unavailable'); return; } // JSON 이 아닌 응답 = 이 사이트에 API 가 없음
    if (r.ok || r.status > 0) { this.setState('ready'); return; }             // JSON 응답이 왔다 = 서버가 있다
    if (r.error === 'network' || r.error === 'timeout' || r.error === 'offline') this.setState(this.auth || r.error === 'offline' ? 'offline' : 'unavailable');
  }

  // ── 서버 확인 ──
  /** GET /api/health 로 계정 서버가 있는지 확인 (결과는 잠시 기억). → true/false */
  probe(force = false) {
    if (!this.eligible()) { this.setState('blocked'); return Promise.resolve(false); }
    if (this.state === 'ready' && !force) return Promise.resolve(true);
    if (this._probe) return this._probe;
    if (!force && this.state === 'unavailable' && Date.now() - this._probeAt < 5000) return Promise.resolve(false);
    this.setState('checking');
    this._probe = (async () => {
      const r = await this.request('GET', '/health', { auth: false, timeout: 5000 });
      this._probeAt = Date.now();
      const ok = r.ok === true && r.status === 200;
      if (ok) this.setState('ready');
      else if (r.error === 'offline') this.setState('offline');
      else this.setState('unavailable');
      return ok;
    })().finally(() => { this._probe = null; });
    return this._probe;
  }
  /** 저장된 토큰으로 다시 연결 (앱 시작·온라인 복귀) */
  async resume() {
    if (!this.auth) return fail('logged_out');
    if (this._resume) return this._resume;
    this._resume = (async () => {
      const r = await this.request('GET', '/auth/me', { timeout: 8000 });
      if (r.ok) {
        this.verified = true; this.createdAt = r.createdAt ?? null;
        if (this.auth && r.id && r.id !== this.auth.id) { this.auth.id = r.id; lsSet(K_AUTH, JSON.stringify(this.auth)); }
        this.setState('ready');
        bus.emit('cloud:login', { id: this.id, resumed: true });
        const out = await this.refresh({ reason: 'resume' });
        this.announce(out);
      } else if (r.error !== 'unauthorized') this.noteResult(r);
      return r;
    })().finally(() => { this._resume = null; });
    return this._resume;
  }
  onOnline() {
    if (!this.auth || !this.eligible()) { if (this.state === 'offline') this.setState('unknown'); return; }
    if (!this.verified || this.state !== 'ready') this.resume();
    else this.refresh({ reason: 'online', downloads: false });
  }

  // ── 계정 ──
  async signup(id, password) {
    const r = await this.request('POST', '/auth/signup', { body: { id: normalizeId(id), password }, auth: false, timeout: 15000 });
    this.noteResult(r);
    if (r.ok) this.setAuth(r.id, r.token);
    return r;
  }
  async login(id, password) {
    const r = await this.request('POST', '/auth/login', { body: { id: normalizeId(id), password }, auth: false, timeout: 15000 });
    this.noteResult(r);
    if (r.ok) this.setAuth(r.id, r.token);
    return r;
  }
  async me() {
    const r = await this.request('GET', '/auth/me', { timeout: 8000 });
    if (r.ok) { this.verified = true; this.createdAt = r.createdAt ?? null; }
    this.noteResult(r);
    return r;
  }
  /** 로그아웃: 기다리던 업로드를 먼저 보내고(최대 몇 초) 서버 토큰을 폐기. 서버에 닿지 않아도 이 기기에서는 로그아웃된다 */
  async logout() {
    if (!this.auth) return { ok: true };
    this.flushTimers();
    await Promise.race([this.queue, new Promise((r) => setTimeout(r, 4000))]);
    const r = this.auth ? await this.request('POST', '/auth/logout', { timeout: 5000 }) : { ok: true };
    this.clearAuth('logout');
    return { ok: true, remote: !!r.ok };
  }
  async changePassword(oldPassword, newPassword) {
    const r = await this.request('POST', '/auth/password', { body: { oldPassword, newPassword }, timeout: 15000 });
    this.noteResult(r);
    return r;
  }
  async recover(id, recoveryCode, newPassword) {
    const r = await this.request('POST', '/auth/recover', { body: { id: normalizeId(id), recoveryCode: String(recoveryCode ?? '').trim(), newPassword }, auth: false, timeout: 15000 });
    this.noteResult(r);
    if (r.ok) {
      if (this.auth && this.auth.id !== r.id) this.clearAuth('switch');
      this.setAuth(r.id, r.token);
    }
    return r;
  }
  async deleteAccount(password) {
    // DELETE 본문을 못 보내는 환경(앱 프록시 등)을 위해 같은 동작의 POST 경로를 쓴다
    const r = await this.request('POST', '/auth/account/delete', { body: { password }, timeout: 15000 });
    this.noteResult(r);
    if (r.ok) {
      const id = this.id;
      this.clearAuth('deleted');
      if (id) this.dropRecs(id);
    }
    return r;
  }

  // ── 저장 알림 ──
  onLocalWrite(ev) {
    if (!this.auth || this.muted || !this.eligible()) return;
    if (ev.type === 'meta') { this.schedule('meta'); return; }
    const slot = ev.slot;
    if (!SLOTS.includes(slot)) return;
    if (ev.type === 'remove') {
      clearTimeout(this.timers[slot]); delete this.timers[slot];
      if (this.rec(slot)) this.patchRec(slot, { del: true, dirty: false, force: false });
      return;
    }
    this.patchRec(slot, { dirty: true, del: false });
    this.schedule(slot);
  }
  /** 2초 뒤 업로드 (그 사이 다시 저장하면 다시 2초) */
  schedule(key) {
    clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(() => this.fire(key), DEBOUNCE);
  }
  fire(key) {
    clearTimeout(this.timers[key]); delete this.timers[key];
    if (!this.auth) return Promise.resolve(fail('logged_out'));
    return this.enqueue(() => (key === 'meta' ? this._syncMeta(null) : this._upload(key))).then((r) => {
      if (key !== 'meta' && r?.error === 'conflict') this.warnConflict(key);
      return r;
    });
  }
  flushTimers() { for (const k of Object.keys(this.timers)) this.fire(k === 'meta' ? 'meta' : Number(k)); }
  pending(slot) { return !!this.timers[slot] || !!this.view[slot]?.busy; }
  warnConflict(slot) {
    if (this.warned.has(slot)) return;
    this.warned.add(slot);
    this.game?.toast?.(`슬롯 ${slot}: 다른 기기에서 저장한 클라우드 기록과 달라 올리지 않았습니다. 세이브 슬롯 화면에서 남길 기록을 골라 주세요.`, '#ffb070', 4.5);
  }

  /** 지금 게임을 진행 중인 슬롯 (타이틀·슬롯 선택 같은 화면이면 null) */
  activeSlot() {
    const g = this.game, bottom = g?.scenes?.[0]?.name;
    if (!bottom || FRONT_SCENES.has(bottom)) return null;
    return g.state?.slot ?? null;
  }

  // ── 슬롯 작업 (큐 안에서 실행) ──
  applyList(res) {
    for (const s of SLOTS) {
      const e = (res.slots ?? []).find((x) => x?.slot === s);
      this.view[s].cloud = e ? { empty: !!e.empty, rev: num(e.rev), savedAt: e.savedAt ?? null, summary: e.empty ? null : (e.summary ?? null) } : null;
    }
  }
  async _upload(slot, { force = false } = {}) {
    if (!this.auth) return fail('logged_out');
    const id = this.id, v = this.view[slot];
    const data = saves.read(slot);
    if (!data || data.arcade) return { ok: true, skipped: true };
    const rec = this.rec(slot);
    const forceIt = !!(force || rec?.force);
    let base = rec?.rev ?? 0;
    if (v.cloud?.empty) base = 0; // 빈 슬롯에는 0 이 항상 통한다
    v.busy = true; v.error = null;
    try {
      let r;
      for (let attempt = 0; attempt < 2; attempt++) {
        const body = { data, baseRev: base };
        if (forceIt) body.force = true;
        r = await this.request('PUT', `/saves/${slot}`, { body, timeout: 20000 });
        if (r.ok || r.error !== 'conflict' || !isObj(r.server)) break;
        const sv = r.server;
        if (sv.empty) { base = 0; continue; } // 다른 기기에서 지운 빈 슬롯 → 잃을 것 없음
        if (sv.summary?.clientSavedAt != null && sv.summary.clientSavedAt === data.savedAt) {
          // 앞서 보낸 같은 기록이 이미 올라가 있다 (응답만 못 받은 경우)
          r = { ok: true, slot, rev: sv.rev, savedAt: sv.savedAt, already: true };
        }
        break;
      }
      this.noteResult(r);
      if (this.id !== id) return fail('logged_out');
      if (r.ok) {
        this.setRec(slot, { rev: r.rev, at: data.savedAt });
        v.cloud = { empty: false, rev: r.rev, savedAt: r.savedAt ?? Date.now(), summary: summarize(data) };
        v.status = 'synced';
        this.warned.delete(slot);
      } else if (r.error === 'conflict') {
        const sv = isObj(r.server) ? r.server : {};
        v.cloud = { empty: !!sv.empty, rev: num(sv.rev), savedAt: sv.savedAt ?? null, summary: sv.summary ?? null };
        v.status = 'conflict';
        this.patchRec(slot, { dirty: false, force: false });
        bus.emit('cloud:conflict', { slot });
      } else if (r.error === 'network' || r.error === 'timeout' || r.error === 'offline' || r.status >= 500 || r.status === 429) {
        v.error = r.message; // dirty 는 남겨 두었다가 다시 연결되면 올린다
      } else {
        v.error = r.message;
        this.patchRec(slot, { dirty: false });
      }
      return r;
    } finally {
      v.busy = false;
    }
  }
  async _download(slot) {
    if (!this.auth) return fail('logged_out');
    const id = this.id, v = this.view[slot];
    v.busy = true; v.error = null;
    try {
      const r = await this.request('GET', `/saves/${slot}`, { timeout: 20000 });
      this.noteResult(r);
      if (this.id !== id) return fail('logged_out');
      if (!r.ok) {
        if (r.error === 'slot_empty') { v.cloud = { empty: true, rev: num(r.rev), savedAt: null, summary: null }; }
        v.error = r.message;
        return r;
      }
      let data = r.data;
      if (!isValidSave(data)) { v.error = MESSAGES.invalid_save; return fail('invalid_save'); }
      try { const { migrateState } = await import('../game/state.js'); data = migrateState(data); } catch (e) { console.warn('[cloud] migrate', e); }
      // 덮어쓰기 전 이 기기의 기록을 한 벌 남겨 둔다 (bloodnocturne_slot_N_backup)
      const key = saves.slotKey(slot), prev = lsGet(key);
      if (prev) lsSet(`${key}_backup`, prev);
      if (!saves.store(slot, data)) { v.error = MESSAGES.storage_full; return fail('storage_full'); }
      this.setRec(slot, { rev: r.rev, at: data.savedAt ?? null });
      v.cloud = { empty: false, rev: r.rev, savedAt: r.savedAt ?? null, summary: summarize(data) };
      v.status = 'synced';
      this.warned.delete(slot);
      return { ok: true, slot, rev: r.rev };
    } finally {
      v.busy = false;
    }
  }
  async _deleteCloud(slot) {
    if (!this.auth) return fail('logged_out');
    const id = this.id, v = this.view[slot];
    v.busy = true;
    try {
      const r = await this.request('DELETE', `/saves/${slot}`, { timeout: 10000 });
      this.noteResult(r);
      if (this.id !== id) return fail('logged_out');
      if (r.ok) {
        this.setRec(slot, { rev: r.rev, at: null });
        v.cloud = { empty: true, rev: r.rev, savedAt: null, summary: null };
        v.status = saves.read(slot) ? 'local' : 'empty';
      }
      return r;
    } finally {
      v.busy = false;
    }
  }

  // ── 메타 ──
  localMeta() { return this.game?.meta ?? saves.loadMeta(); }
  applyMeta(merged) {
    const m = this.game?.meta;
    this.muted = true;
    try {
      if (m) { for (const k of Object.keys(merged)) m[k] = merged[k]; saves.saveMeta(m); }
      else saves.saveMeta(merged);
    } finally { this.muted = false; }
  }
  /**
   * 메타 동기화: 서버 것과 합쳐 양쪽을 같게 만든다.
   *  listMeta: GET /saves 의 meta {rev} (없으면 서버를 읽을지 기록으로 판단)
   */
  async _syncMeta(listMeta) {
    if (!this.auth) return fail('logged_out');
    const id = this.id;
    const rec = this.metaRec();
    let local = this.localMeta();
    const localHash = metaHash(local);
    let server = null;
    const serverChanged = !rec || (listMeta && num(listMeta.rev) !== rec.rev);
    if (!serverChanged && rec.hash === localHash) { this.metaView = { status: 'synced', rev: rec.rev }; return { ok: true, same: true }; }
    if (serverChanged) {
      const g = await this.request('GET', '/meta', { timeout: 10000 });
      if (!g.ok) { this.noteResult(g); this.metaView.status = 'error'; return g; }
      server = { rev: num(g.rev), data: isObj(g.data) ? g.data : null };
    }
    let base = server ? server.rev : rec.rev;
    let merged = server?.data ? mergeMeta(local, server.data) : JSON.parse(JSON.stringify(local));
    for (let i = 0; i < 4; i++) {
      if (this.id !== id) return fail('logged_out');
      const h = metaHash(merged);
      if (h !== metaHash(local)) { this.applyMeta(merged); local = this.localMeta(); }
      const serverHash = server?.data ? metaHash(server.data) : (server ? null : rec?.hash);
      if (serverHash === h) { this.setMetaRec({ rev: base, hash: h }); this.metaView = { status: 'synced', rev: base }; return { ok: true, merged: i > 0 || !!server }; }
      const r = await this.request('PUT', '/meta', { body: { data: cleanMeta(merged), baseRev: base }, timeout: 10000 });
      if (r.ok) { this.setMetaRec({ rev: r.rev, hash: h }); this.metaView = { status: 'synced', rev: r.rev }; return { ok: true, uploaded: true }; }
      if (r.error !== 'conflict' || !isObj(r.server)) { this.noteResult(r); this.metaView.status = 'error'; return r; }
      server = { rev: num(r.server.rev), data: isObj(r.server.data) ? r.server.data : null };
      base = server.rev;
      merged = server.data ? mergeMeta(merged, server.data) : merged;
    }
    this.metaView.status = 'error';
    return fail('conflict');
  }

  // ── 공개 동작 ──
  /**
   * 서버 목록을 받아 슬롯마다 상태를 판정하고, 데이터를 잃지 않는 동작(빈 쪽 채우기·한쪽만 바뀐 경우)을 자동으로 한다.
   * 충돌은 그대로 두고 알린다. 게임 중인 슬롯에는 받지 않는다.
   *  opts.downloads=false : 받기 없이 올리기만
   *  opts.adoptLocal      : 클라우드에 없는 이 기기 기록도 올림 (새 계정·사용자가 올리기를 고른 경우)
   * → { ok, uploaded[], downloaded[], deleted[], conflicts[], localOnly[], failed[], error?, message? }
   */
  refresh(opts = {}) {
    if (!this.auth) return Promise.resolve(fail('logged_out'));
    if (this._refresh) return this._refresh;
    this._refresh = this.enqueue(() => this._doRefresh(opts)).finally(() => { this._refresh = null; });
    return this._refresh;
  }
  async _doRefresh({ reason = 'manual', downloads = true, adoptLocal = false } = {}) {
    if (!this.auth) return fail('logged_out');
    const id = this.id;
    bus.emit('cloud:sync', { phase: 'start', reason });
    const res = await this.request('GET', '/saves', { timeout: 12000 });
    this.noteResult(res);
    if (!res.ok) {
      const out = { ...res, reason };
      bus.emit('cloud:sync', { phase: 'done', ...out });
      return out;
    }
    this.verified = true;
    this.applyList(res);
    const out = { ok: true, reason, uploaded: [], downloaded: [], deleted: [], conflicts: [], localOnly: [], failed: [] };
    const active = this.activeSlot();
    for (const slot of SLOTS) {
      if (this.id !== id) return fail('logged_out');
      const v = this.view[slot];
      const local = saves.read(slot);
      const rec = this.rec(slot);
      let { status, auto } = classifySlot(local, v.cloud, rec);
      if (status === 'local' && !auto && adoptLocal && local) auto = 'upload';
      if (rec?.force && local && (status === 'conflict' || status === 'cloud' || status === 'local')) auto = 'upload'; // 사용자가 덮어쓰기를 확인한 슬롯
      v.status = status;
      if (status === 'synced') this.setRec(slot, { rev: v.cloud.rev, at: local.savedAt });
      else if (status === 'empty') this.setRec(slot, { rev: v.cloud?.rev ?? 0, at: null });
      let r = null;
      if (auto === 'download' && downloads && slot !== active) { r = await this._download(slot); if (r.ok) out.downloaded.push(slot); }
      else if (auto === 'upload') { r = await this._upload(slot); if (r.ok && !r.skipped) out.uploaded.push(slot); }
      else if (auto === 'delete') { r = await this._deleteCloud(slot); if (r.ok) out.deleted.push(slot); }
      if (r && !r.ok && r.error !== 'conflict') out.failed.push(slot);
      if (v.status === 'conflict') out.conflicts.push(slot);
      else if (v.status === 'local' && !r && local) out.localOnly.push(slot);
    }
    const m = await this._syncMeta(res.meta ?? null);
    if (!m.ok && m.error !== 'logged_out') out.metaError = m.message;
    this.lastSync = Date.now();
    bus.emit('cloud:sync', { phase: 'done', ...out });
    for (const s of out.conflicts) bus.emit('cloud:conflict', { slot: s });
    return out;
  }
  /** 로그인 직후·앱 시작 때 결과를 짧게 알림 */
  announce(out) {
    if (!out?.ok || !this.game?.toast) return;
    if (out.downloaded.length) this.game.toast(`클라우드에서 슬롯 ${out.downloaded.join(', ')}의 기록을 받았습니다`, '#9fe8ff', 3);
    for (const s of out.conflicts) this.warnConflict(s);
  }
  /** 지금 동기화 (기다리던 업로드도 바로 보냄) */
  syncNow(opts = {}) {
    this.flushTimers();
    return this.refresh({ reason: 'manual', ...opts });
  }
  upload(slot, { force = false } = {}) { return this.enqueue(() => this._upload(slot, { force })); }
  download(slot) { return this.enqueue(() => this._download(slot)); }
  /** 여러 슬롯 올리기 (클라우드에 없는 기록을 올릴 때) */
  uploadSlots(slots) {
    return this.enqueue(async () => {
      const out = { ok: true, uploaded: [], failed: [], conflicts: [] };
      for (const s of slots) {
        const r = await this._upload(s);
        if (r.ok) { if (!r.skipped) out.uploaded.push(s); } else if (r.error === 'conflict') out.conflicts.push(s); else { out.failed.push(s); out.ok = false; out.message = r.message; }
      }
      return out;
    });
  }
  /**
   * 클라우드 슬롯 삭제 (이 기기의 슬롯을 지울 때). seenRev: 사용자가 확인한 클라우드 rev —
   * 그 사이 다른 기기가 새로 저장했다면 지우지 않는다.
   */
  removeSlot(slot, seenRev = null) {
    // 먼저 '이 기기에서 지움' 표시 — 지금 서버에 닿지 않아도 다음 동기화 때 같은 rev 면 클라우드에서도 지운다
    if (this.auth) this.patchRec(slot, { rev: seenRev ?? this.rec(slot)?.rev ?? null, at: null, del: true, dirty: false, force: false });
    return this.enqueue(async () => {
      if (!this.auth) return fail('logged_out');
      if (seenRev != null) {
        const l = await this.request('GET', '/saves', { timeout: 10000 });
        if (!l.ok) return l;
        this.applyList(l);
        const c = this.view[slot].cloud;
        if (c?.empty) { this.setRec(slot, { rev: c.rev, at: null }); return { ok: true, already: true }; }
        if (c && c.rev !== seenRev) return { ok: false, error: 'changed', message: '그 사이 다른 기기에서 클라우드 기록이 바뀌어 클라우드 기록은 지우지 않았습니다.' };
      }
      return this._deleteCloud(slot);
    });
  }

  // ── 화면용 조회 ──
  /** 슬롯 상태 (이 기기 기록과 비교해 다시 판정). 화면 갱신 때 한 번씩 부른다 */
  slotInfo(slot) {
    const v = this.view[slot];
    if (!this.auth) return { status: 'guest', cloud: null, busy: false };
    let status = v.status;
    if (v.cloud) status = classifySlot(saves.read(slot), v.cloud, this.rec(slot)).status;
    else if (this.state === 'offline') status = 'offline';
    return { status, cloud: v.cloud, busy: this.pending(slot), error: v.error };
  }
  /** 전체 상태 한 줄 (시스템 탭·계정 화면) → { key, text } */
  overall() {
    if (!this.eligible()) return { key: 'blocked', text: '공식 사이트·앱에서 사용 가능' };
    if (!this.auth) return { key: 'guest', text: '로그인하지 않음' };
    if (this.state === 'offline') return { key: 'offline', text: '오프라인 (연결되면 동기화)' };
    if (this.state === 'unavailable') return { key: 'offline', text: '서버에 연결할 수 없음' };
    if (this._refresh || SLOTS.some((s) => this.pending(s)) || this.timers.meta) return { key: 'pending', text: '동기화 중…' };
    const n = SLOTS.filter((s) => this.view[s].status === 'conflict').length;
    if (n) return { key: 'conflict', text: `충돌 ${n}개 — 세이브 슬롯 화면에서 선택` };
    if (!this.lastSync) return { key: 'unknown', text: this.verified ? '동기화 전' : '연결 확인 중' };
    return { key: 'synced', text: '동기화됨' };
  }
}

export const cloud = new Cloud();
