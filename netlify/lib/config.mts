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
  // 익명 통계 (docs/TELEMETRY.md): raw/<YYYY-MM-DD>/<HH>/<무작위> = 받은 묶음 그대로 (30일 뒤 삭제), hour/<YYYY-MM-DD>/<HH> = 시간 요약 (30일),
  //   agg/<YYYY-MM-DD> = 날 요약 (계속 보관), state/agg = 모은 시간 칸 기록. IP·계정은 넣지 않는다
  telemetry: 'bn-telemetry',
  // 온라인 기록 (docs/specs/online.md, docs/ONLINE.md). <보드 키> = 보드 ID 의 ':' 를 '.' 로 바꾼 것 (bossrush.0.normal)
  //   b/<보드 키>/i = 순위 목록(상위 indexKeep 개 + 계정 수), b/<보드 키>/e/<uid> = 계정의 최고 기록, u/<uid>/<보드 키> = 계정이 기록을 둔 보드 표시
  boards: 'bn-boards',
  ghosts: 'bn-ghosts', // key = <보드 키>/<uid> → {v, data(base64), t, h, c, at} — 상위 ghostTop 위 안의 최고 기록만
  runs: 'bn-runs', // key = used/<시작 시각 UTC YYYYMMDDHH>/<런 nonce> → {at} — 한 번 제출한 런 (정리 함수가 지운다)
  nicks: 'bn-nicks', // key = 소문자 별명의 UTF-8 hex → {uid, id, nick, at} — 별명 중복 방지 (대소문자 무시)
} as const;

/** 요청 본문 최대 크기 (바이트) */
export const BODY_LIMIT = {
  auth: 4 * 1024,
  save: 512 * 1024,
  meta: 64 * 1024,
  finish: 48 * 1024, // POST /api/runs/finish (고스트 24KB 포함)
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

/** 익명 통계 (netlify/lib/telemetry.mts, docs/TELEMETRY.md). 숫자를 바꾸면 문서도 고친다 */
export const TELEMETRY = {
  bodyMax: 32 * 1024, // POST /api/t 본문 상한 (넘으면 413). 클라이언트는 24KB 로 자른다
  maxEvents: 50, // 묶음 하나의 사건 수 상한
  ipMax: 120, // 망별 10분에 묶음 120개 (한 기기는 30초마다 1개 + 숨을 때) — 학교·PC방처럼 IP 하나를 여럿이 써도 넉넉하게
  ipWindowMs: 10 * MIN,
  rawKeepDays: 30, // 원본 묶음·시간 요약 보관 (날 요약 agg/ 는 계속 보관)
  statsMaxDays: 30, // GET /api/stats?days=N 의 최대 N
  statsCacheSec: 60,
  aggGraceMs: 5 * MIN, // 시간 칸이 끝나고 이만큼 지난 뒤에 모은다 (그 칸에 늦게 쓰이는 묶음이 없게)
  aggRecheckDays: 3, // 매시 실행이 다시 살펴보는 날 수 (오늘 포함). 그보다 오래된 칸은 이미 모은 것으로 본다
  aggMaxRawPerRun: 3000, // 한 번에 읽는 원본 묶음 수 (함수 시간 제한 안에서; 남은 칸은 다음 실행)
  concurrency: 16,
  keepErrors: 100, // 요약에 남기는 오류 묶음 수 (많은 순)
  keepCells: 40, // 방마다 남기는 사망 칸 수 (많은 순)
} as const;

/** 온라인 기록 (netlify/lib/online.mts·boards.mts, docs/specs/online.md). 숫자를 바꾸면 명세와 docs/ONLINE.md 도 고친다 */
export const ONLINE = {
  runTtlMs: 6 * HOUR, // 런 토큰 유효 기간
  endlessRunTtlMs: 30 * HOUR, // 서바이벌·무한의 탑 런 토큰 유효 기간 (time 상한 anyTimeMaxMs 24시간 + 여유 — 6시간이 넘는 긴 탑 런도 올린다)
  runSkewMs: MIN, // 토큰 시작 시각이 서버 시각보다 이만큼 넘게 미래면 위조로 본다
  timeSlack: 0.9, // 걸린 실제 시간 ≥ result.time × 0.9 − 3초
  timeGraceMs: 3000,
  timeMinMs: 5000, // 보스 러시·연습·일일: time 5초 ~ 2시간
  timeMaxMs: 2 * HOUR,
  anyTimeMaxMs: 24 * HOUR, // 서바이벌·무한의 탑 time 상한
  waveMax: 999,
  floorMax: 999, // 무한의 탑 돌파한 층 1~999 (시간·점수 하한·상한은 gamedata.mts TOWER_RULES)
  levelMax: 99,
  scoreMax: 99_999_999,
  deathsMax: 9999,
  ghostMaxChars: 24 * 1024, // 고스트 base64 글자 수 상한
  ghostTop: 20, // 고스트는 이 순위 안의 최고 기록만 남긴다
  rankTop: 100, // 순위를 알려 주는 범위 (밖이면 rank null)
  indexKeep: 150, // 순위 목록에 남기는 수 (100위 안의 기록이 지워지면 101위 이후로 채운다)
  boardLimit: 50, // GET /api/boards 기본 limit (최대 rankTop)
  boardCacheSec: 30,
  ghostCacheSec: 30,
  dailyCacheSec: 300, // 일일 도전 (다음 한국 자정까지 남은 시간보다 길게는 두지 않는다)
  dailyKeepDays: 60, // 이보다 오래된 일일 도전에는 제출할 수 없고, 정리 함수가 지운다
  submitPerMin: 6, // 계정당 제출 1분 6번, 하루 300번
  submitPerDay: 300,
  startMax: 60, // 계정당 런 시작 10분 60번
  startWindowMs: 10 * MIN,
  nickMax: 10, // 계정당 별명 바꾸기 1시간 10번
  nickWindowMs: HOUR,
  indexRetries: 16, // 순위 목록 조건부 쓰기 재시도 (동시 제출이 많은 보드)
  orphanGhostMs: HOUR, // 순위 목록에 표시가 없는 고스트는 이만큼 지난 뒤 정리한다 (막 저장 중인 것을 지우지 않게)
} as const;

/** 동시 수정 충돌 시 조건부 쓰기 재시도 횟수 */
export const CAS_RETRIES = 5;

/**
 * 저장 데이터 구조 검사·온라인 기록·일일 도전에 쓰는 캐릭터 ID (src/data/characters.js 의 CHARACTERS 키와 같아야 한다 — tools/accounts/test_api.mjs 가 확인).
 * 순서 = CHAR_ORDER. 일일 도전(runs.mts dailyFor)은 이 목록에서 고른다 — 잠긴 영웅(리아·아젤·이졸데)도 오늘의 도전에서는 체험할 수 있다
 */
export const CHARACTER_IDS: readonly string[] = ['kael', 'sera', 'victor', 'bran', 'lia', 'azel', 'isolde'];

export const SLOTS: readonly number[] = [1, 2, 3];
