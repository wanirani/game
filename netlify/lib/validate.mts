// 입력 검증: 아이디, 비밀번호(흔한 비밀번호 거부 포함), 세이브 데이터 구조(isValidSave 복사본), 전역 메타, 슬롯 요약.
import { ACH, CHARACTER_IDS } from './config.mts';
import { fail, isObj } from './http.mts';

const ID_RE = /^[a-z][a-z0-9_]{3,15}$/;

/** 쓸 수 없는 아이디 (정확히 일치) */
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'sys', 'guest', 'null', 'undefined', 'nan', 'true', 'false', 'none', 'nil',
  'anonymous', 'anon', 'user', 'users', 'test', 'tester', 'support', 'help', 'helpdesk', 'moderator', 'mod', 'staff',
  'operator', 'owner', 'official', 'server', 'api', 'dev', 'developer', 'netlify', 'bloodnocturne', 'blood_nocturne',
  'gamemaster', 'master', 'webmaster', 'security', 'info', 'account', 'accounts', 'login', 'logout', 'signup',
  'register', 'password', 'recover', 'recovery', 'self', 'everyone', 'nobody', 'default', 'unknown', 'superuser',
  'sudo', 'service', 'manager', 'console', 'bot', 'noreply', 'no_reply', 'postmaster', 'hostmaster', 'abuse',
]);
/** 운영자 사칭을 막는 접두어 */
const RESERVED_PREFIX = ['admin', 'system', 'official', 'moderator', 'gm_', 'staff_', 'netlify'];

/** 로그인용 아이디 정규화: 앞뒤 공백 제거 + 소문자. 형식이 틀리면 null */
export function normalizeId(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  const id = raw.trim().toLowerCase();
  return ID_RE.test(id) ? id : null;
}

/** 가입용 아이디 검사 → 정규화된 아이디 (실패 시 400) */
export function checkNewId(raw: unknown): string {
  const id = normalizeId(raw);
  if (!id) fail('invalid_id', 400);
  if (RESERVED.has(id) || RESERVED_PREFIX.some((p) => id.startsWith(p))) fail('reserved_id', 400);
  return id;
}

// C0 제어 문자, DEL, C1 제어 문자, 줄/문단 구분자
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** 비밀번호 형식이 맞으면 true (길이는 코드 포인트 기준 8~64자) */
export function passwordShapeOk(pw: unknown): pw is string {
  if (typeof pw !== 'string' || pw.length > 256) return false;
  const n = [...pw.normalize('NFC')].length;
  return n >= 8 && n <= 64 && !CONTROL_RE.test(pw);
}

/**
 * 흔한 비밀번호 (소문자로 비교, 8자 이상만 — 더 짧은 것은 길이 규칙에서 걸린다).
 * 아이디별 잠금(10분에 5번·시간당 20번)만으로는 목록 앞쪽의 비밀번호가 하루 안에 뚫릴 수 있어 가입·변경 때 막는다.
 * src/core/cloud.js 의 COMMON_PASSWORDS 와 같아야 한다 (tools/accounts/test_api.mjs 가 확인).
 */
export const COMMON_PASSWORDS: readonly string[] = [
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

/** 한 글자씩 1 씩 오르거나 내리는 문자열 (12345678, 87654321, abcdefgh). 숫자는 9 다음 0 도 이어진 것으로 본다 */
function isRun(p: string): boolean {
  const c = [...p].map((ch) => ch.codePointAt(0) as number);
  if (c.length < 3) return false;
  const step = (a: number, b: number): number => (a === 57 && b === 48 ? 1 : a === 48 && b === 57 ? -1 : b - a);
  const d = step(c[0], c[1]);
  return (d === 1 || d === -1) && c.every((x, i) => i === 0 || step(c[i - 1], x) === d);
}

/** 추측하기 쉬운 비밀번호인가: 흔한 비밀번호, 1~4글자 묶음 반복, 연속된 글자, 아이디 + 3글자 이하 */
export function isWeakPassword(pw: string, id: string): boolean {
  const p = pw.normalize('NFC').toLowerCase();
  if (COMMON.has(p)) return true;
  if (/^(.{1,4})\1+$/su.test(p)) return true;
  if (isRun(p)) return true;
  return !!id && p.includes(id) && [...p].length - id.length < 4;
}

/** 새 비밀번호 검사 (실패 시 400) */
export function checkNewPassword(pw: unknown, id: string): string {
  if (!passwordShapeOk(pw)) fail('invalid_password', 400);
  if (pw.normalize('NFC').toLowerCase() === id) fail('password_same_as_id', 400);
  if (isWeakPassword(pw, id)) fail('weak_password', 400);
  return pw;
}

/**
 * 받은 데이터 트리 검사: 중첩 깊이가 maxDepth 이하이고 '__proto__' 키가 없어야 한다.
 * 서버는 데이터를 그대로 저장했다가 돌려주고, 클라이언트는 그것을 합치거나 대입한다 — 깊은 트리는 재귀 처리의 스택을 넘치게 하고,
 * JSON.parse 가 만든 자기 속성 '__proto__' 는 대입(obj[k] = v) 때 프로토타입을 바꾼다.
 */
export function safeTree(v: unknown, maxDepth: number): boolean {
  const stack: [unknown, number][] = [[v, 1]];
  while (stack.length) {
    const [x, d] = stack.pop()!;
    if (!x || typeof x !== 'object') continue;
    if (d > maxDepth) return false;
    if (Array.isArray(x)) { for (const y of x) stack.push([y, d + 1]); continue; }
    for (const k of Object.keys(x)) {
      if (k === '__proto__') return false;
      stack.push([(x as Record<string, unknown>)[k], d + 1]);
    }
  }
  return true;
}

/** 선택 불리언 필드 (생략·null = def, 불리언이 아니면 400) */
export function readBool(v: unknown, def: boolean): boolean {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'boolean') fail('bad_request', 400);
  return v;
}

// ── 세이브 데이터 ──
const CHARS = new Set(CHARACTER_IDS);
const hasChar = (id: unknown): boolean => typeof id === 'string' && CHARS.has(id);

/**
 * src/core/save.js isValidSave 와 같은 규칙 (브라우저 코드를 import 하지 않도록 복사):
 * 현재 캐릭터가 실존하고, 모든 영웅에 레벨·장비 칸이 있으며, 가방(inventory)·진행도(progress)가 있어야 한다.
 */
export function isValidSave(s: any): boolean {
  if (!isObj(s) || !isObj(s.heroes) || !Array.isArray(s.inventory) || !isObj(s.progress)) return false;
  if (typeof s.charId !== 'string' || !hasChar(s.charId) || !isObj(s.heroes[s.charId])) return false;
  for (const [id, h] of Object.entries(s.heroes)) {
    if (!hasChar(id) || !isObj(h) || !isObj((h as any).equip) || !Number.isFinite((h as any).level)) return false;
  }
  return true;
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);

/** 슬롯 목록용 요약 (Blobs 메타데이터에 함께 저장 — 2KB 제한 안쪽) */
export function saveSummary(s: any): Record<string, unknown> {
  const hero = s.heroes[s.charId];
  return {
    charId: s.charId,
    level: Math.floor(num(hero.level, 1)),
    classId: str(hero.classId, 40),
    chapter: Math.floor(num(s.progress.chapter, 0)),
    playTime: num(s.stats?.playTime, 0),
    difficulty: str(s.difficulty, 24) ?? 'normal',
    gold: Math.floor(num(s.gold, 0)),
    clientSavedAt: typeof s.savedAt === 'number' && Number.isFinite(s.savedAt) ? s.savedAt : null,
  };
}

// ── 전역 메타 (해금 캐릭터, 본 엔딩, 최고 점수, 도감 등 — src/core/save.js DEFAULT_META) ──
const isStrArr = (v: unknown, maxLen: number, maxStr: number): boolean =>
  Array.isArray(v) && v.length <= maxLen && v.every((x) => typeof x === 'string' && x.length <= maxStr);

/** 형식만 느슨하게 검사 (모르는 필드는 앞으로의 확장을 위해 허용) */
export function isValidMeta(m: any): boolean {
  if (!isObj(m)) return false;
  if ('unlockedChars' in m && !isStrArr(m.unlockedChars, 64, 32)) return false;
  if ('endingsSeen' in m && !isStrArr(m.endingsSeen, 64, 64)) return false;
  if ('highScores' in m && !(Array.isArray(m.highScores) && m.highScores.length <= 200 && m.highScores.every(isObj))) return false;
  if ('bestiary' in m && !isObj(m.bestiary)) return false;
  for (const k of ['clears', 'survivalBest']) if (k in m && m[k] !== null && !Number.isFinite(m[k])) return false;
  if ('konami' in m && typeof m.konami !== 'boolean') return false;
  if ('bossRushBest' in m && m.bossRushBest !== null && !isObj(m.bossRushBest) && !Number.isFinite(m.bossRushBest)) return false;
  if ('ach' in m && m.ach !== null && !isValidAch(m.ach)) return false;
  return true;
}

// ── 업적 기록 (meta.ach — docs/specs/achievements.md §2.4) ──
// 모양·크기만 본다. 업적 id 목록은 검사하지 않는다 (서버는 달성을 확인할 수 없고, 업적을 더할 때마다 배포가 필요해진다).
// src/core/ach_meta.js isValidAch 와 같은 규칙 (클라이언트 cleanAch 결과는 늘 이것을 통과해야 한다 — tools/test_achievements.mjs C6)
const achKey = (k: unknown): boolean => typeof k === 'string' && ACH.keyRe.test(k);
const achNum = (v: unknown, max: number): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
function achNumMap(m: unknown, maxKeys: number, maxVal: number): boolean {
  if (!isObj(m)) return false;
  const ks = Object.keys(m);
  return ks.length <= maxKeys && ks.every((k) => achKey(k) && achNum((m as Record<string, unknown>)[k], maxVal));
}
/** meta.ach 모양 검사. 모르는 필드는 허용 */
export function isValidAch(a: any): boolean {
  if (!isObj(a)) return false;
  let len: number;
  try { len = JSON.stringify(a).length; } catch { return false; }
  if (len > ACH.maxBytes) return false;
  if ('v' in a && !(Number.isInteger(a.v) && a.v >= 1 && a.v <= ACH.vMax)) return false;
  if ('got' in a && !achNumMap(a.got, ACH.gotMax, ACH.timeMax)) return false;
  if ('prog' in a && !achNumMap(a.prog, ACH.progMax, ACH.progValMax)) return false;
  if ('claimed' in a && !(Array.isArray(a.claimed) && a.claimed.length <= ACH.claimedMax && a.claimed.every(achKey))) return false;
  if ('seenAt' in a && !achNum(a.seenAt, ACH.timeMax)) return false;
  for (const k of ['title', 'deco']) if (k in a && a[k] !== null && !achKey(a[k])) return false;
  return true;
}

/** baseRev: 생략/null = 검사 안 함, 그 외 0 이상의 정수 */
export function readBaseRev(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) fail('bad_request', 400);
  return v;
}

export function readForce(v: unknown): boolean {
  return readBool(v, false);
}
