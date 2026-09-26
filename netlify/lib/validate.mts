// 입력 검증: 아이디, 비밀번호, 세이브 데이터 구조(isValidSave 복사본), 전역 메타, 슬롯 요약.
import { CHARACTER_IDS } from './config.mts';
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

/** 새 비밀번호 검사 (실패 시 400) */
export function checkNewPassword(pw: unknown, id: string): string {
  if (!passwordShapeOk(pw)) fail('invalid_password', 400);
  if (pw.normalize('NFC').toLowerCase() === id) fail('password_same_as_id', 400);
  return pw;
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
  return true;
}

/** baseRev: 생략/null = 검사 안 함, 그 외 0 이상의 정수 */
export function readBaseRev(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) fail('bad_request', 400);
  return v;
}

export function readForce(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v !== 'boolean') fail('bad_request', 400);
  return v;
}
