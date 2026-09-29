// 계정·클라우드 저장 API 공통 상수. 숫자를 바꾸면 docs/ACCOUNTS.md 도 함께 고친다.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Netlify Blobs 저장소 이름 (최대 64바이트, '/' 금지) */
export const STORES = {
  users: 'bn-users', // key = 로그인 아이디 → 사용자 레코드
  sessions: 'bn-sessions', // key = SHA-256(토큰) hex → {id, uid, createdAt, expiresAt}
  saves: 'bn-saves', // key = <uid>/slot1..3, <uid>/meta → {rev, savedAt, data}
  // key = ip/auth/<망 해시>, ip/signup/<망 해시>, lock/login/<id>/all, lock/login/<id>/net/<망 해시>, lock/login/<id>/wide/<IPv6 /48 해시>,
  //       lock/login/<id>/ok/<망 해시> (로그인에 성공한 망 = 믿는 망), lock/recover/<id>/net/<망 해시>
  limits: 'bn-ratelimit',
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
 * 아이디 전체 잠금은 공격자가 망을 늘리는 만큼 주인을 막을 수 있으므로 (PS-04): 잠금 시간은 짧게 시작해 늘리되 상한을 두고,
 * 이 아이디로 로그인에 성공한 적이 있는 망(믿는 망)에서 온 요청에는 걸지 않는다. IPv6 는 /48 단위로도 센다.
 */
export const RATE = {
  loginFailMax: 5, // 아이디+망별: 비밀번호 실패 5회 → 그 망에서만 10분 잠금 (다른 망의 주인은 영향 없음 — 잠금 악용 방지)
  loginFailWindowMs: 10 * MIN,
  loginLockMs: 10 * MIN,
  wideFailMax: 10, // 아이디+IPv6 /48 별: 1시간에 10회 실패 → 그 /48 에서 30분 잠금 (/48 하나로 /64 65,536개를 돌리는 추측·잠금 방지)
  wideFailWindowMs: HOUR,
  wideLockMs: 30 * MIN,
  idFailMax: 20, // 아이디별(모든 망 합계): 1시간에 20회 실패 → 믿는 망이 아닌 곳에서 잠금 (분산 추측 방지)
  idFailWindowMs: HOUR,
  idLockMs: 2 * MIN, // 첫 잠금 2분, 24시간 안에 다시 잠기면 두 배씩 (2 → 4 → 8 → 10분 상한)
  idLockMaxMs: 10 * MIN,
  idStrikeDecayMs: DAY, // 마지막 잠금 뒤 24시간 동안 잠기지 않으면 다시 2분부터
  trustMs: 90 * DAY, // 로그인(가입·복구 포함)에 성공한 망은 90일 동안 믿는다: 아이디 전체 잠금을 받지 않는다 (/64 면 /48 잠금도)
  recoverFailMax: 5, // 아이디+망별: 복구 코드 실패 5회 → 그 망에서 10분 잠금 (코드가 80비트라 전체 한도는 두지 않음)
  recoverFailWindowMs: 10 * MIN,
  recoverLockMs: 10 * MIN,
  ipAuthMax: 20, // 망별 인증 시도 (가입·로그인·복구·비밀번호 변경·탈퇴) 10분에 20회
  ipAuthWindowMs: 10 * MIN,
  ipSignupMax: 5, // 망별 가입 1시간에 5개
  ipSignupWindowMs: HOUR,
} as const;

/** 매일 도는 정리 함수 (netlify/functions/cleanup.mts, PS-05): 끝난 제한 기록·오래된 믿는 망·만료된 세션 저장값을 지운다 */
export const CLEANUP = {
  limitIdleMs: 2 * HOUR, // 창이 끝나고(시작 + 가장 긴 창 1시간) 잠금도 풀린 지 이만큼 지난 카운터
  sessionGraceMs: 30 * DAY, // 세션 저장값은 만료 뒤 30일 (사용자 기록의 만료 시각이 기준이라 저장값이 늦을 수 있다)
  maxPerRun: 4000, // 저장소마다 한 번에 읽는 최대 수 (함수 시간 제한 안에서; 남은 것은 다음 날)
  concurrency: 24,
} as const;

/** 동시 수정 충돌 시 조건부 쓰기 재시도 횟수 */
export const CAS_RETRIES = 5;

/** 저장 데이터 구조 검사에 쓰는 캐릭터 ID (src/data/characters.js 의 CHARACTERS 키와 같아야 한다 — tools/accounts/test_api.mjs 가 확인) */
export const CHARACTER_IDS: readonly string[] = ['kael', 'sera', 'victor', 'bran', 'lia', 'azel'];

export const SLOTS: readonly number[] = [1, 2, 3];
