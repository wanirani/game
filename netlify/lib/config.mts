// 계정·클라우드 저장 API 공통 상수. 숫자를 바꾸면 docs/ACCOUNTS.md 도 함께 고친다.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Netlify Blobs 저장소 이름 (최대 64바이트, '/' 금지) */
export const STORES = {
  users: 'bn-users', // key = 로그인 아이디 → 사용자 레코드
  sessions: 'bn-sessions', // key = SHA-256(토큰) hex → {id, uid, createdAt, expiresAt}
  saves: 'bn-saves', // key = <uid>/slot1..3, <uid>/meta → {rev, savedAt, data}
  limits: 'bn-ratelimit', // key = ip/auth/<hmac>, ip/signup/<hmac>, id/login/<id>, id/recover/<id>
} as const;

/** 요청 본문 최대 크기 (바이트) */
export const BODY_LIMIT = {
  auth: 4 * 1024,
  save: 512 * 1024,
  meta: 64 * 1024,
} as const;

/** scrypt 매개변수 (저장값에 함께 기록되므로 나중에 올려도 기존 해시는 그대로 검증되고 로그인 때 재해시된다) */
export const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64, saltLen: 32, maxmem: 64 * 1024 * 1024 } as const;

export const SESSION = {
  ttlMs: 30 * DAY, // 발급(또는 마지막 연장) 후 30일
  refreshAfterMs: 7 * DAY, // 마지막 연장 후 7일이 지난 뒤 사용하면 다시 30일로 연장
  maxPerUser: 10, // 초과 시 가장 오래된 세션부터 폐기
} as const;

export const RATE = {
  loginFailMax: 5, // 아이디별 연속 실패 5회 → 잠금
  loginFailWindowMs: 10 * MIN,
  loginLockMs: 10 * MIN,
  ipAuthMax: 20, // IP별 인증 시도 (가입·로그인·복구·비밀번호 변경·탈퇴) 10분에 20회
  ipAuthWindowMs: 10 * MIN,
  ipSignupMax: 5, // IP별 가입 1시간에 5개
  ipSignupWindowMs: HOUR,
} as const;

/** 동시 수정 충돌 시 조건부 쓰기 재시도 횟수 */
export const CAS_RETRIES = 5;

/** 저장 데이터 구조 검사에 쓰는 캐릭터 ID (src/data/characters.js 의 CHARACTERS 키와 같아야 한다 — tools/accounts/test_api.mjs 가 확인) */
export const CHARACTER_IDS: readonly string[] = ['kael', 'sera', 'victor', 'bran', 'lia', 'azel'];

export const SLOTS: readonly number[] = [1, 2, 3];
