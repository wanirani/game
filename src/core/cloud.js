// 계정 · 클라우드 저장 클라이언트 (서버 계약: docs/ACCOUNTS.md)
//  - 웹: 같은 출처의 절대 경로 '/api/...' 만 부른다. 안드로이드 앱(https://appassets.androidplatform.net)도 앱의 /api 프록시가 켜져 있으면
//    (window.__BN_APP.apiProxy — assets/app/head_inject.html) 같은 출처 '/api/...' 를 부르고, 앱이 계정 서버로 대신 보낸다(docs/ACCOUNTS.md §1).
//    프록시가 없는 앱에서만 공식 사이트의 API(APP_API_BASE)를 직접 부른다 — 서버는 이 앱 출처만 CORS 로 허용한다(netlify/lib/router.mts APP_ORIGINS)
//  - 쓸 수 있는 환경: https, 또는 localhost 의 http. claude.ai 임베드(CSP 가 막음)·file:// 등에서는 요청을 아예 보내지 않는다
//  - 게스트(로그인 안 함)는 네트워크 요청 0건. 계정 화면을 열 때만 GET /api/health 로 서버가 있는지 확인한다
//  - 로그인 중: 슬롯 저장(saves.onWrite) 2초 뒤 그 슬롯을 올린다(rev 로 충돌 검사). 메타(해금·엔딩·기록)는 덮어쓰지 않고 합친다
//  - 모든 서버 작업은 한 줄로 차례대로 실행(queue)되고, 게임 진행을 기다리게 하지 않는다
//  - '로그인 유지': 켜면 토큰을 localStorage 에(서버 세션 30일), 끄면 sessionStorage 에(창을 닫으면 사라짐, 서버 세션 12시간) 둔다.
//    선택은 bn_remember 에 기억한다. 처음 기본값은 안드로이드 앱·터치 기기는 켬, 데스크톱 브라우저(PC방·학교 등 공용일 수 있음)는 끔
//  - 이벤트(bus): 'cloud:status' {state} · 'cloud:login' {id, resumed} · 'cloud:logout' {reason} · 'cloud:sync' {phase, ...} · 'cloud:conflict' {slot}
// 시험용: localStorage 'bn_api_base' 에 같은 출처의 API 경로(예: '/api')를 넣으면 호스트 검사 없이 그 경로를 쓴다
//         (다른 사이트 주소는 무시 — 비밀번호·토큰이 다른 곳으로 가지 않게)
import { bus } from './events.js';
import { saves, isValidSave } from './save.js';
import { mergeAch, cleanAch } from './ach_meta.js';   // [hook:ach] 업적 기록 meta.ach (docs/specs/achievements.md §2.3)
import { mergeGal, cleanGal } from './gal_meta.js';   // [hook:gal] 회랑 기록 meta.gal (docs/specs/gallery.md §2.3)

export const API_BASE = '/api';
/** 안드로이드 앱이 부르는 계정 서버 (공식 사이트). 사이트 주소를 바꾸면 여기와 netlify.toml·문서를 함께 바꾼다 */
export const APP_API_BASE = 'https://blood-nocturne.netlify.app/api';
const APP_HOST = /^appassets\.androidplatform\.net$/i;
/** 안드로이드 앱 WebView 안에서 실행 중인가 */
export const isAndroidApp = (loc = typeof location !== 'undefined' ? location : null) => loc?.protocol === 'https:' && APP_HOST.test(String(loc?.hostname ?? ''));
/**
 * 부를 API 주소: 시험용 덮어쓰기(같은 출처 경로만) → 웹은 '/api' → 안드로이드 앱은 /api 프록시가 켜져 있으면(app.apiProxy === true)
 * 같은 출처 경로(app.apiBase, 기본 '/api'), 프록시가 없는 옛 앱만 APP_API_BASE(공식 사이트 직접, CORS).
 * app = window.__BN_APP (앱 조각이 만든다). 사이트 이름이 앱 코드에 박혀 있어도 프록시가 있으면 쓰지 않는다
 */
export function pickApiBase(loc, app, override) {
  const o = safeBase(override);
  if (o) return o;
  if (!isAndroidApp(loc)) return API_BASE;
  if (app && typeof app === 'object' && app.apiProxy === true) return safeBase(app.apiBase) ?? API_BASE;
  return APP_API_BASE;
}
const K_AUTH = 'bn_auth', K_BASE = 'bn_api_base', K_SYNC = 'bn_cloud_sync', K_REMEMBER = 'bn_remember';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const SLOTS = [1, 2, 3];
const DEBOUNCE = 2000;
const PER_MODE = 20; // 명예의 전당: 모드별 보관 수 (front/common.js 와 같음)
// 계정 기능을 켜지 않는 호스트 (claude.ai 임베드는 CSP 가 다른 요청을 막고, 같은 출처에 /api 도 없다)
const BLOCKED_HOST = /(^|\.)(claude\.ai|claude\.site|claudeusercontent\.com|claudemcpcontent\.com|anthropic\.com)$/i;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i;
// 게임을 진행 중이 아닌 장면 (이 장면이 맨 아래일 때만 클라우드 기록을 현재 슬롯에 받아도 안전)
const FRONT_SCENES = new Set(['title', 'slots', 'account', 'options', 'difficulty', 'charselect', 'arcade', 'highscore', 'credits']);
FRONT_SCENES.add('gallery');   // [hook:gal] 회랑이 맨 아래 장면이면 지난 game.state 의 슬롯을 '진행 중' 으로 보지 않는다

// ───────────────────────── 서버 오류 문구 (서버가 message 를 주지 않을 때의 대체) ─────────────────────────
export const MESSAGES = {
  bad_request: '요청 형식이 올바르지 않습니다.',
  bad_json: '요청 데이터를 읽을 수 없습니다.',
  unsupported_media_type: '요청 형식이 올바르지 않습니다. (JSON 으로 보내야 합니다)',
  forbidden: '허용되지 않는 요청입니다.',
  payload_too_large: '보내는 데이터가 너무 큽니다.',
  invalid_id: '아이디는 영문 소문자로 시작하는 4~16자의 영문 소문자, 숫자, 밑줄(_)로 만들어 주세요.',
  reserved_id: '사용할 수 없는 아이디입니다. 다른 아이디를 입력해 주세요.',
  id_taken: '이미 사용 중인 아이디입니다.',
  invalid_password: '비밀번호는 8~64자로 입력해 주세요. (줄바꿈 같은 제어 문자는 쓸 수 없습니다)',
  password_same_as_id: '비밀번호는 아이디와 다르게 정해 주세요.',
  weak_password: '너무 흔하거나 추측하기 쉬운 비밀번호입니다. 아이디가 들어가지 않은, 다른 사람이 떠올리기 어려운 비밀번호로 정해 주세요.',
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

// ───────────────────────── 저장소 (localStorage · sessionStorage, 실패 시 메모리) ─────────────────────────
const mem = {}, smem = {};
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
// sessionStorage: 이 탭(창)에서만 유지 — 새로 고침은 살아남고 창을 닫으면 사라진다
function ssGet(k) {
  if (Object.hasOwn(smem, k)) return smem[k];
  try { return sessionStorage.getItem(k); } catch { return null; }
}
function ssSet(k, v) {
  try { sessionStorage.setItem(k, v); delete smem[k]; return true; } catch { smem[k] = v; return false; }
}
function ssDel(k) {
  delete smem[k];
  try { sessionStorage.removeItem(k); } catch { /* 무시 */ }
}
function jget(k) { try { return JSON.parse(lsGet(k)); } catch { return null; } }

// ───────────────────────── 받은 데이터 정리 (프로토타입 오염·깊은 트리 방지) ─────────────────────────
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/**
 * JSON 데이터의 안전한 복사본: '__proto__'·'constructor'·'prototype' 키를 버리고, maxDepth 보다 깊은 부분은 버린다.
 * JSON.parse 는 '__proto__' 를 자기 속성으로 만들고, 그 뒤 obj[k] = v 로 옮기면 obj 의 프로토타입이 바뀐다.
 * 서버·가져오기 코드에서 온 기록을 합치거나 게임 객체에 대입하기 전에 거친다. 재귀 없이 처리한다.
 */
export function sanitizeTree(v, maxDepth = 32) {
  if (!v || typeof v !== 'object') return v;
  const root = Array.isArray(v) ? [] : {};
  const stack = [[v, root, 1]];
  while (stack.length) {
    const [src, dst, d] = stack.pop();
    const arr = Array.isArray(src);
    for (const k of arr ? src.keys() : Object.keys(src)) {
      if (!arr && UNSAFE_KEYS.has(k)) continue;
      const x = src[k];
      if (x && typeof x === 'object') {
        if (d >= maxDepth) { if (arr) dst[k] = null; continue; }
        const c = Array.isArray(x) ? [] : {};
        dst[k] = c;
        stack.push([x, c, d + 1]);
      } else if (x !== undefined && typeof x !== 'function') dst[k] = x;
      else if (arr) dst[k] = null;
    }
  }
  return root;
}

/** 시험용 API 주소 덮어쓰기 값 검사: 같은 출처의 절대 경로('/api', '/v2/api')만 허용, 나머지는 null */
export function safeBase(o) {
  if (typeof o !== 'string') return null;
  const s = o.trim().replace(/\/+$/, '');
  return /^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(s) && !/(^|\/)\.\.?(\/|$)/.test(s) ? s : null;
}

export const isValidToken = (t) => typeof t === 'string' && TOKEN_RE.test(t);

/** '로그인 유지' 처음 기본값: 안드로이드 앱·터치 기기(대개 개인 기기)는 켬, 데스크톱 브라우저(PC방·학교 등 공용일 수 있음)는 끔 */
export function defaultRemember(loc = typeof location !== 'undefined' ? location : null) {
  if (/(^|\.)appassets\.androidplatform\.net$/i.test(String(loc?.hostname ?? ''))) return true;
  try { if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return true; } catch { /* 무시 */ }
  return false;
}

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
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** 아이디 정규화: 앞뒤 공백 제거 + 소문자 (서버와 같음) */
export const normalizeId = (raw) => String(raw ?? '').trim().toLowerCase();
/** 서버가 준(또는 저장해 둔) 아이디가 형식에 맞는가 */
export const isValidId = (id) => typeof id === 'string' && ID_RE.test(id);

/** 흔한 비밀번호 — netlify/lib/validate.mts 의 COMMON_PASSWORDS 와 같아야 한다 (tools/accounts/test_api.mjs 가 확인) */
export const COMMON_PASSWORDS = [
  'password', 'password1', 'password12', 'password123', 'password1!', 'password!', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'p@ssw0rd1',
  'passwords', 'pass1234', 'pass12345', 'mypassword', '12345678', '123456789', '1234567890', '0123456789', '12345678910',
  '987654321', '0987654321', '11111111', '111111111', '00000000', '88888888', '12341234', '11223344', '11112222', '12344321',
  '147258369', '159753456', '741852963', '123123123', '123qweasd', '1q2w3e4r', '1q2w3e4r!', '1q2w3e4r5t', '1q2w3e4r5t6y',
  '1qaz2wsx', '1qazxsw2', '1qaz2wsx3edc', '2wsx3edc', 'q1w2e3r4', 'q1w2e3r4t5', 'qwer1234', 'qwer1234!', '1234qwer', '1234qwer!',
  'qwerty12', 'qwerty123', 'qwerty1234', 'qwertyui', 'qwertyuiop', 'qwe123456', 'qweasdzxc', 'qweasd123', 'asdf1234', '1234asdf',
  'asdfghjk', 'asdfghjkl', 'asdf1234!', 'zxcv1234', 'zxcvbnm1', 'zxcvbnm123', 'zxcvbnm!', 'a1234567', 'a12345678', 'a123456789',
  'abcd1234', 'abcd1234!', 'abc12345', 'abc123456', 'abcdefg1', 'aa123456', 'iloveyou', 'iloveyou1', 'iloveyou!', 'sunshine',
  'princess', 'football', 'baseball', 'basketball', 'superman', 'starwars', 'trustno1', 'whatever', 'welcome1', 'welcome123',
  'letmein1', 'letmein123', 'dragon12', 'monkey12', 'master12', 'shadow12', 'michael1', 'jennifer', 'computer', 'internet',
  'samsung1', 'samsung123', 'admin123', 'admin1234', 'administrator', 'root1234', 'test1234', 'testtest', 'guest123',
  'dkssudgktpdy', '가나다라마바사아', 'bloodnocturne', 'blood_nocturne', 'bloodnocturne1', 'castlevania', 'dracula1',
  'dracula123', 'vampire1', 'vampire123', 'nocturne1',
];
const COMMON = new Set(COMMON_PASSWORDS);
function isRun(p) {
  const c = [...p].map((ch) => ch.codePointAt(0));
  if (c.length < 3) return false;
  const step = (a, b) => (a === 57 && b === 48 ? 1 : a === 48 && b === 57 ? -1 : b - a);
  const d = step(c[0], c[1]);
  return (d === 1 || d === -1) && c.every((x, i) => i === 0 || step(c[i - 1], x) === d);
}
/** 추측하기 쉬운 비밀번호인가 (서버 isWeakPassword 와 같음): 흔한 비밀번호, 1~4글자 묶음 반복, 연속된 글자, 아이디 + 3글자 이하 */
export function isWeakPassword(pw, id = '') {
  const p = String(pw).normalize('NFC').toLowerCase();
  if (COMMON.has(p)) return true;
  if (/^(.{1,4})\1+$/su.test(p)) return true;
  if (isRun(p)) return true;
  const i = normalizeId(id);
  return !!i && p.includes(i) && [...p].length - i.length < 4;
}

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
  if (isWeakPassword(pw, id)) return MESSAGES.weak_password;
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
/** 세이브 요약 (서버의 summary 와 같은 모양). 회차 세이브면 ng = 지난 회차 수 1..9 (docs/specs/ngplus.md §5.3 — ngplus.js 를 import 하지 않는 첫 조각 인라인 읽기) */
export function summarize(s) {
  if (!isObj(s)) return null;
  const hero = isObj(s.heroes) ? s.heroes[s.charId] : null;
  const ng = Number.isInteger(s.ng?.n) && s.ng.n > 0 ? Math.min(9, s.ng.n) : 0;   // [hook:ng]
  return {
    charId: s.charId ?? null, level: hero?.level ?? 1, classId: hero?.classId ?? null, chapter: s.progress?.chapter ?? 0,
    playTime: s.stats?.playTime ?? 0, difficulty: s.difficulty ?? null, gold: s.gold ?? 0, clientSavedAt: s.savedAt ?? null,
    ...(ng ? { ng } : {}),
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
/** 무한의 탑 기록 둘 중 좋은 것 (돌파한 층 ↑ → 시간 ↓) */
function betterTower(x, y) {
  const ok = (e) => isObj(e) && num(e.floor) > 0;
  if (!ok(x)) return ok(y) ? y : (x ?? y ?? null);
  if (!ok(y)) return x;
  return num(y.floor) > num(x.floor) || (num(y.floor) === num(x.floor) && num(y.time) < num(x.time)) ? y : x;
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
 * 도감은 항목별 큰 값, 명예의 전당은 두 목록을 합쳐 모드별 상위 20개, 보스 러시는 코스별 최단 기록, 무한의 탑은 난이도별 최고 층.
 * 그 밖의 필드(마지막 캐릭터·이니셜·아케이드 설정 등)는 이 기기 값이 우선.
 */
export function mergeMeta(a, b) {
  a = isObj(a) ? sanitizeTree(a) : {};
  if (!isObj(b)) return JSON.parse(JSON.stringify(a));
  b = sanitizeTree(b);
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
  if (isObj(a.towerBest) || isObj(b.towerBest)) {   // [hook:plat] 무한의 탑 난이도별 최고 (front/arcade_run.js)
    const A = isObj(a.towerBest) ? a.towerBest : {}, B = isObj(b.towerBest) ? b.towerBest : {};
    out.towerBest = {};
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) out.towerBest[k] = betterTower(A[k], B[k]);
  }
  // [hook:ach] 업적: got 합집합(가장 이른 시각)·prog 큰 값·claimed 합집합 (한쪽만 있으면 그것을 고친 사본 — 서버 것을 지우지 않는다)
  if (isObj(a.ach) || isObj(b.ach)) out.ach = mergeAch(a.ach, b.ach);
  if (isObj(a.gal) || isObj(b.gal)) out.gal = mergeGal(a.gal, b.gal);   // [hook:gal] 회랑: cg·mus 합집합(가장 이른 시각)·seenAt 큰 값 (한쪽만 있으면 그것을 고친 사본)
  return JSON.parse(JSON.stringify(out));
}

/** 서버 검사(invalid_meta)에 걸리지 않게 모양을 다듬은 복사본 */
export function cleanMeta(m) {
  const o = JSON.parse(JSON.stringify(isObj(m) ? sanitizeTree(m) : {}));
  o.unlockedChars = union(o.unlockedChars, []);
  o.endingsSeen = union(o.endingsSeen, []);
  o.highScores = (Array.isArray(o.highScores) ? o.highScores : []).filter(isObj).slice(0, 200);
  if (!isObj(o.bestiary)) o.bestiary = {};
  o.clears = num(o.clears); o.survivalBest = num(o.survivalBest); o.konami = !!o.konami;
  if ('ach' in o) o.ach = isObj(o.ach) ? cleanAch(o.ach) : null;   // [hook:ach] 서버 isValidAch 를 늘 통과하는 사본 (≤ 24 KB, 줄이지 않는다)
  if ('gal' in o) o.gal = isObj(o.gal) ? cleanGal(o.gal) : null;   // [hook:gal] 키 상한·≤ 8 KB 사본 (서버는 gal 을 검사하지 않는다)
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
    this.auth = null;       // { id, token, remember } — remember: 토큰을 localStorage 에 두는가('로그인 유지')
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
    return pickApiBase(typeof location !== 'undefined' ? location : null, typeof window !== 'undefined' ? window.__BN_APP : null, lsGet(K_BASE));
  }
  /** 이 환경에서 서버 요청을 보내도 되는가 */
  eligible() {
    if (safeBase(lsGet(K_BASE))) return true;
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
  /** 저장된 로그인 읽기: '로그인 유지'면 localStorage, 아니면 이 탭의 sessionStorage. 형식이 틀린 값은 버린다 */
  loadAuth() {
    const pick = (raw, remember) => {
      try {
        const a = JSON.parse(raw);
        return isObj(a) && isValidId(a.id) && isValidToken(a.token) ? { id: a.id, token: a.token, remember } : null;
      } catch { return null; }
    };
    this.auth = pick(lsGet(K_AUTH), true) ?? pick(ssGet(K_AUTH), false);
    if (!this.auth) { lsDel(K_AUTH); ssDel(K_AUTH); }
  }
  persistAuth() {
    if (!this.auth) return;
    const raw = JSON.stringify({ id: this.auth.id, token: this.auth.token });
    if (this.auth.remember) { lsSet(K_AUTH, raw); ssDel(K_AUTH); } else { ssSet(K_AUTH, raw); lsDel(K_AUTH); }
  }
  /** '로그인 유지' 선택 (이 기기에 기억한 값, 없으면 기기 종류에 따른 기본값) */
  rememberPref() {
    const v = lsGet(K_REMEMBER);
    return v === '1' ? true : v === '0' ? false : defaultRemember();
  }
  setRememberPref(on) { lsSet(K_REMEMBER, on ? '1' : '0'); }
  setAuth(id, token, remember = this.rememberPref()) {
    this.auth = { id, token, remember: !!remember };
    this.verified = true;
    this.setRememberPref(!!remember);
    this.persistAuth();
    this.resetView();
    this.setState('ready');
    bus.emit('cloud:login', { id, resumed: false });
  }
  clearAuth(reason = 'logout') {
    if (!this.auth) return;
    const { id, remember } = this.auth;
    this.auth = null; this.verified = false; this.createdAt = null; this.lastSync = 0;
    for (const k of Object.keys(this.timers)) { clearTimeout(this.timers[k]); delete this.timers[k]; }
    lsDel(K_AUTH); ssDel(K_AUTH);
    // '로그인 유지'를 끄고 쓴 기기(공용일 수 있음)에서 직접 로그아웃하면 이 계정의 동기화 기록(아이디가 들어 있다)도 지운다
    if (reason === 'logout' && !remember) this.dropRecs(id);
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
    // 계정 화면은 스스로 안내하므로 토스트는 그 밖의 화면에서만
    if (had && this.game?.top?.name !== 'account') this.game?.toast?.('로그인이 만료되었습니다. 계정 화면에서 다시 로그인해 주세요.', '#ffb070', 3.2);
  }

  // ── 동기화 기록 (계정별) ──
  syncDb() { const d = jget(K_SYNC); return isObj(d) ? d : {}; }
  recs(id = this.id) {
    const d = this.syncDb();
    const r = isValidId(id) && isObj(d[id]) ? d[id] : {};
    if (!isObj(r.slots)) r.slots = {};
    return r;
  }
  saveRecs(r, id = this.id) {
    if (!isValidId(id)) return;
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
  /**
   * '새로 시작' 확인: 지금부터 이 슬롯에 새로 만든 기록(created 가 지금 이후)은 클라우드 것과 상관없이 올린다.
   * 새 게임을 시작하지 않고 돌아가면 예전 기록의 created 는 그대로라 덮어쓰지 않는다.
   */
  markOverwrite(slot) { if (this.auth && SLOTS.includes(slot)) this.patchRec(slot, { forceAfter: Date.now() }); }
  /** 이 기록이 '새로 시작' 확인 뒤에 만들어진 새 게임인가 */
  forced(rec, data) { return !!(rec?.forceAfter && Number.isFinite(data?.created) && data.created >= rec.forceAfter); }

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
      // 쿠키를 쓰지 않고(credentials omit), 넘겨주기(redirect)를 따라가지 않는다 — 비밀번호·토큰이 다른 주소로 다시 보내지지 않게
      const res = await fetch(this.base + path, {
        method, headers, body: payload, signal: ctrl?.signal, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      });
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
  /**
   * 서버 작업을 한 줄로 세워 차례대로 실행 (같은 슬롯을 동시에 올려 충돌하는 일을 막는다).
   * 작업은 넣을 때의 계정에 묶인다 — 그 사이 로그아웃하거나 다른 계정으로 바뀌면 실행하지 않는다.
   */
  enqueue(fn) {
    const owner = this.id;
    const run = () => (owner && this.id !== owner ? fail('logged_out') : fn());
    const p = this.queue.then(run).catch((e) => { console.error('[cloud]', e); return fail('client_error'); });
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
      // 첫 장면이 뜬 뒤에 동기화한다 (어느 슬롯을 게임 중인지 알아야 그 슬롯에 받지 않는다)
      for (let i = 0; i < 50 && this.game && !this.game.scenes?.length; i++) await new Promise((res) => setTimeout(res, 100));
      const r = await this.request('GET', '/auth/me', { timeout: 8000 });
      if (r.ok) {
        this.verified = true; this.createdAt = r.createdAt ?? null;
        if (this.auth && isValidId(r.id) && r.id !== this.auth.id) { this.auth.id = r.id; this.persistAuth(); }
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
  /** 로그인·가입·복구 응답의 아이디·토큰 형식 확인 (형식이 틀리면 저장하지 않는다) */
  checkAuthReply(r) {
    if (r.ok && (!isValidId(r.id) || !isValidToken(r.token))) return fail('bad_response', { status: r.status });
    return r;
  }
  /** remember: '로그인 유지' (생략하면 이 기기에 기억한 선택) */
  async signup(id, password, { remember = this.rememberPref() } = {}) {
    const r = this.checkAuthReply(await this.request('POST', '/auth/signup', { body: { id: normalizeId(id), password, remember: !!remember }, auth: false, timeout: 15000 }));
    this.noteResult(r);
    if (r.ok) this.setAuth(r.id, r.token, remember);
    return r;
  }
  async login(id, password, { remember = this.rememberPref() } = {}) {
    const r = this.checkAuthReply(await this.request('POST', '/auth/login', { body: { id: normalizeId(id), password, remember: !!remember }, auth: false, timeout: 15000 }));
    this.noteResult(r);
    if (r.ok) this.setAuth(r.id, r.token, remember);
    return r;
  }
  async me() {
    const r = await this.request('GET', '/auth/me', { timeout: 8000 });
    if (r.ok) { this.verified = true; this.createdAt = r.createdAt ?? null; }
    this.noteResult(r);
    return r;
  }
  /**
   * 로그아웃: 기다리던 업로드를 먼저 보내고(최대 몇 초) 서버 토큰을 폐기.
   *  - 보통: 서버에 닿지 않아도 이 기기에서는 로그아웃된다 → {ok:true, remote:false} (서버 세션은 만료될 때까지 남는다)
   *  - all:true (모든 기기에서 로그아웃): 서버에 닿아야 의미가 있으므로 실패하면 로그인 상태를 그대로 두고 오류를 돌려준다
   */
  async logout({ all = false } = {}) {
    if (!this.auth) return { ok: true, remote: true };
    this.flushTimers();
    await Promise.race([this.queue, new Promise((r) => setTimeout(r, 4000))]);
    const r = this.auth ? await this.request('POST', '/auth/logout', { body: all ? { all: true } : undefined, timeout: 5000 }) : { ok: true };
    if (all && !r.ok && r.error !== 'unauthorized') { this.noteResult(r); return r; }
    this.clearAuth('logout');
    return { ok: true, remote: !!r.ok, revoked: r.revoked ?? 0 };
  }
  async changePassword(oldPassword, newPassword) {
    const r = await this.request('POST', '/auth/password', { body: { oldPassword, newPassword }, timeout: 15000 });
    this.noteResult(r);
    return r;
  }
  async recover(id, recoveryCode, newPassword, { remember = this.rememberPref() } = {}) {
    const body = { id: normalizeId(id), recoveryCode: String(recoveryCode ?? '').trim(), newPassword, remember: !!remember };
    const r = this.checkAuthReply(await this.request('POST', '/auth/recover', { body, auth: false, timeout: 15000 }));
    this.noteResult(r);
    if (r.ok) {
      if (this.auth && this.auth.id !== r.id) this.clearAuth('switch');
      this.setAuth(r.id, r.token, remember);
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
    if (ev.type === 'meta') { if (!ev.debug) this.schedule('meta'); return; }   // 디버그 부팅의 메타(saves.markDebugBoot)는 올리지 않는다
    const slot = ev.slot;
    if (!SLOTS.includes(slot)) return;
    if (ev.type === 'remove') {
      clearTimeout(this.timers[slot]); delete this.timers[slot];
      if (this.rec(slot)) this.patchRec(slot, { del: true, dirty: false, forceAfter: null });
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
    const top = this.game?.top?.name;
    if (top === 'slots' || top === 'cloudConflict') return; // 슬롯 화면은 구름 표시로 이미 보여 준다
    this.game?.toast?.(`슬롯 ${slot}: 클라우드 기록과 충돌 — 이어하기 화면에서 남길 기록을 고르세요`, '#ffb070', 4);
  }

  /** 지금 게임을 진행 중인 슬롯 (타이틀·슬롯 선택 같은 화면이면 null) */
  activeSlot() {
    const g = this.game, bottom = g?.scenes?.[0]?.name;
    if (g?.fade?.pending && g.state?.slot) return g.state.slot; // 장면 전환 중 (예: 슬롯을 불러와 마을로 가는 중)
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
    const forceIt = !!(force || this.forced(rec, data));
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
        this.patchRec(slot, { dirty: false });
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
  /** auto: 자동 동기화 — 받는 사이 그 슬롯으로 게임을 시작했다면 쓰지 않고 'held' */
  async _download(slot, { auto = false } = {}) {
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
      let data = sanitizeTree(r.data);
      if (!isValidSave(data)) { v.error = MESSAGES.invalid_save; return fail('invalid_save'); }
      try { const { migrateState } = await import('../game/state.js'); data = migrateState(data); } catch (e) { console.warn('[cloud] migrate', e); }
      if (auto && this.activeSlot() === slot) return { ok: false, error: 'held' };
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
    merged = sanitizeTree(merged);
    this.muted = true;
    try {
      if (m) { for (const k of Object.keys(merged)) if (!UNSAFE_KEYS.has(k)) m[k] = merged[k]; saves.saveMeta(m); }
      else saves.saveMeta(merged);
    } finally { this.muted = false; }
  }
  /**
   * 메타 동기화: 서버 것과 합쳐 양쪽을 같게 만든다.
   *  listMeta: GET /saves 의 meta {rev} (없으면 서버를 읽을지 기록으로 판단)
   */
  async _syncMeta(listMeta) {
    if (!this.auth) return fail('logged_out');
    if (saves.debugBoot) { this.metaView = { status: 'unknown', rev: null }; return { ok: true, skipped: true }; }   // 디버그 부팅: 메모리의 메타(디버그 기록)를 올리지도, 받은 것을 저장하지도 않는다
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
      // 지금 기기 메타(올리는 동안 생긴 업적·기록 포함 — merged 는 보내기 전 사본이라 applyMeta 가 그것을 지운다)와 합친다 [hook:ach]
      merged = server.data ? mergeMeta(this.localMeta(), server.data) : merged;
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
   * → { ok, uploaded[], downloaded[], deleted[], conflicts[], localOnly[], failed[], held[](받을 것이 있지만 게임 중이라 둔 슬롯), error?, message? }
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
    const out = { ok: true, reason, uploaded: [], downloaded: [], deleted: [], conflicts: [], localOnly: [], failed: [], held: [] };
    for (const slot of SLOTS) {
      if (this.id !== id) return fail('logged_out');
      const v = this.view[slot];
      const local = saves.read(slot);
      const rec = this.rec(slot);
      let { status, auto } = classifySlot(local, v.cloud, rec);
      if (status === 'local' && !auto && adoptLocal && local) auto = 'upload';
      if (status !== 'synced' && this.forced(rec, local)) auto = 'upload'; // '새로 시작'을 확인하고 만든 새 게임
      v.status = status;
      if (status === 'synced') this.setRec(slot, { rev: v.cloud.rev, at: local.savedAt });
      else if (status === 'empty') this.setRec(slot, { rev: v.cloud?.rev ?? 0, at: null });
      let r = null;
      if (auto === 'download' && (!downloads || slot === this.activeSlot())) out.held.push(slot); // 게임 중인 슬롯: 받지 않고 알림만
      else if (auto === 'download') {
        r = await this._download(slot, { auto: true });
        if (r.ok) out.downloaded.push(slot);
        else if (r.error === 'held') { out.held.push(slot); r = null; }
      }
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
    if (this.auth) this.patchRec(slot, { rev: seenRev ?? this.rec(slot)?.rev ?? null, at: null, del: true, dirty: false, forceAfter: null });
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
  /** 전체 상태 (시스템 탭·타이틀 표시) → { key, text, short } */
  overall() {
    const o = (key, text, short = text) => ({ key, text, short });
    if (!this.eligible()) return o('blocked', '공식 사이트·앱에서 사용 가능', '사용 불가');
    if (!this.auth) return o('guest', '로그인하지 않음', '게스트');
    if (this.state === 'offline') return o('offline', '오프라인 (연결되면 동기화)', '오프라인');
    if (this.state === 'unavailable') return o('offline', '서버에 연결할 수 없음', '연결 안 됨');
    if (this._refresh || SLOTS.some((s) => this.pending(s)) || this.timers.meta) return o('pending', '동기화 중…', '동기화 중');
    const n = SLOTS.filter((s) => this.view[s].status === 'conflict').length;
    if (n) return o('conflict', `충돌 ${n}개 — 세이브 슬롯 화면에서 선택`, `충돌 ${n}개`);
    if (!this.lastSync) return o('unknown', this.verified ? '동기화 전' : '연결 확인 중');
    return o('synced', '동기화됨');
  }
}

export const cloud = new Cloud();
