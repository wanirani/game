// 계정·클라우드 저장 API 공통 상수. 숫자를 바꾸면 docs/ACCOUNTS.md 도 함께 고친다.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Netlify Blobs 저장소 이름 (최대 64바이트, '/' 금지) */
export const STORES = {
  users: 'bn-users', // key = 로그인 아이디 → 사용자 레코드
  sessions: 'bn-sessions', // key = SHA-256(토큰) hex → {id, uid, createdAt, expiresAt}
  saves: 'bn-saves', // key = <uid>/slot1..3, <uid>/meta → {rev, savedAt, data}
  limits: 'bn-ratelimit', // key = ip/auth/<망 해시>, ip/signup/<망 해시>, lock/login/<id>, lock/login/<id>/<망 해시>, lock/recover/<id>/<망 해시>
} as const;

/** 요청 본문 최대 크기 (바이트) */
export const BODY_LIMIT = {
  auth: 4 * 1024,
  save: 512 * 1024,
  meta: 64 * 1024,
} as const;

/** 요청 JSON 의 최대 중첩 깊이 (넘으면 400 — 재귀 처리의 스택 넘침 방지). 세이브·메타 data 는 따로 DATA_MAX_DEPTH (넘으면 422) */
export const JSON_MAX_DEPTH = 64;
export const DATA_MAX_DEPTH = 32; // 실제 세이브는 4~6단계

/**
 * scrypt 매개변수: N=2^15, r=8, p=3 (32MiB, OWASP 비밀번호 저장 지침의 scrypt 최소 기준과 같은 비용).
 * 저장값에 함께 기록되므로 올려도 기존 해시는 그대로 검증되고 다음 로그인 때 재해시된다.
 */
export const SCRYPT = { N: 32768, r: 8, p: 3, keyLen: 64, saltLen: 32, maxmem: 96 * 1024 * 1024 } as const;

export const SESSION = {
  ttlMs: 30 * DAY, // '로그인 유지'(기본): 발급(또는 마지막 연장) 후 30일
  refreshAfterMs: 7 * DAY, // 마지막 연장 후 7일이 지난 뒤 사용하면 다시 30일로 연장
  shortTtlMs: 12 * HOUR, // '로그인 유지' 끔 (remember:false): 12시간
  shortRefreshAfterMs: HOUR, // 1시간이 지난 뒤 사용하면 다시 12시간으로 연장
  maxPerUser: 10, // 초과 시 가장 오래된 세션부터 폐기
} as const;

/**
 * 요청 제한. '망'(network) = IPv4 주소 하나 또는 IPv6 /64 (한 기기가 보통 /64 전체를 쓰므로 주소를 바꿔 가며 우회하지 못하게).
 * 비밀번호·복구 코드 시도는 확인 전에 원자적으로 자리를 잡는다(동시 요청으로 한도를 넘길 수 없다).
 */
export const RATE = {
  loginFailMax: 5, // 아이디+망별: 비밀번호 실패 5회 → 그 망에서만 10분 잠금 (다른 망의 주인은 영향 없음 — 잠금 악용 방지)
  loginFailWindowMs: 10 * MIN,
  loginLockMs: 10 * MIN,
  idFailMax: 20, // 아이디별(모든 망 합계): 1시간에 20회 실패 → 30분 동안 모두 잠금 (분산 추측 방지)
  idFailWindowMs: HOUR,
  idLockMs: 30 * MIN,
  recoverFailMax: 5, // 아이디+망별: 복구 코드 실패 5회 → 그 망에서 10분 잠금 (코드가 80비트라 전체 한도는 두지 않음)
  recoverFailWindowMs: 10 * MIN,
  recoverLockMs: 10 * MIN,
  ipAuthMax: 20, // 망별 인증 시도 (가입·로그인·복구·비밀번호 변경·탈퇴) 10분에 20회
  ipAuthWindowMs: 10 * MIN,
  ipSignupMax: 5, // 망별 가입 1시간에 5개
  ipSignupWindowMs: HOUR,
} as const;

/** 동시 수정 충돌 시 조건부 쓰기 재시도 횟수 */
export const CAS_RETRIES = 5;

/** 저장 데이터 구조 검사에 쓰는 캐릭터 ID (src/data/characters.js 의 CHARACTERS 키와 같아야 한다 — tools/accounts/test_api.mjs 가 확인) */
export const CHARACTER_IDS: readonly string[] = ['kael', 'sera', 'victor', 'bran', 'lia', 'azel'];

export const SLOTS: readonly number[] = [1, 2, 3];
