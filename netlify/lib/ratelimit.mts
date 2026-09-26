// Blobs 에 저장하는 요청 제한 카운터 (고정 창 방식, 조건부 쓰기로 동시 요청에도 숫자가 새지 않게 한다).
import { CAS_RETRIES, RATE, STORES } from './config.mts';
import { failRetry } from './http.mts';
import { ipKey } from './crypto.mts';
import { now } from './runtime.mts';
import type { Ctx, KV } from './runtime.mts';

interface Counter { n: number; start: number; lockedUntil?: number }

async function read(st: KV, key: string): Promise<{ rec: Counter | null; etag?: string }> {
  const r = await st.getWithMetadata(key, { type: 'json' });
  if (!r || typeof r.data !== 'object' || r.data === null) return { rec: null, etag: r?.etag };
  return { rec: r.data as Counter, etag: r.etag };
}

/** 조건부 쓰기: 새 키는 onlyIfNew, 기존 키는 onlyIfMatch(ETag). ETag 를 주지 않는 환경(로컬 에뮬레이터)에서는 그냥 덮어쓴다 */
async function write(st: KV, key: string, rec: Counter, etag: string | undefined, existed: boolean): Promise<boolean> {
  const cond = existed ? (etag ? { onlyIfMatch: etag } : {}) : { onlyIfNew: true };
  const res = await st.setJSON(key, rec, cond);
  return res.modified;
}

/**
 * 창(windowMs) 안에서 limit 회까지 허용. add=true 면 1 증가시키며 검사, false 면 검사만.
 * 제한에 걸리면 남은 초를, 통과하면 0 을 돌려준다. 동시 쓰기 경합이 계속되면 막는 쪽으로 판단한다.
 */
async function windowHit(st: KV, key: string, limit: number, windowMs: number, add: boolean): Promise<number> {
  for (let i = 0; i < CAS_RETRIES; i++) {
    const t = now();
    const { rec, etag } = await read(st, key);
    const live = rec && Number.isFinite(rec.n) && Number.isFinite(rec.start) && t - rec.start < windowMs && t >= rec.start;
    if (live && rec.n >= limit) return (rec.start + windowMs - t) / 1000;
    if (!add) return 0;
    const next: Counter = live ? { n: rec.n + 1, start: rec.start } : { n: 1, start: t };
    if (await write(st, key, next, etag, !!rec || !!etag)) return 0;
  }
  return 1;
}

/** IP별 인증 시도 제한 (가입·로그인·복구·비밀번호 변경·탈퇴) — 초과 시 429 rate_limited */
export async function limitAuthByIp(c: Ctx): Promise<void> {
  const wait = await windowHit(c.store(STORES.limits), `ip/auth/${ipKey(c.ip)}`, RATE.ipAuthMax, RATE.ipAuthWindowMs, true);
  if (wait > 0) failRetry('rate_limited', wait);
}

/** IP별 가입 수 제한 검사 (가입 성공 뒤 countSignup 으로 센다) — 초과 시 429 signup_limited */
export async function checkSignupByIp(c: Ctx): Promise<void> {
  const wait = await windowHit(c.store(STORES.limits), `ip/signup/${ipKey(c.ip)}`, RATE.ipSignupMax, RATE.ipSignupWindowMs, false);
  if (wait > 0) failRetry('signup_limited', wait);
}

export async function countSignup(c: Ctx): Promise<void> {
  await windowHit(c.store(STORES.limits), `ip/signup/${ipKey(c.ip)}`, Number.MAX_SAFE_INTEGER, RATE.ipSignupWindowMs, true);
}

// ── 아이디별 실패 잠금 (kind: 'login' = 로그인·비밀번호 확인, 'recover' = 복구 코드) ──
const lockKey = (kind: string, id: string): string => `id/${kind}/${id}`;

/** 잠겨 있으면 429 locked. 지우고 싶은 실패 기록이 남아 있으면 true */
export async function assertNotLocked(c: Ctx, kind: string, id: string): Promise<boolean> {
  const { rec, etag } = await read(c.store(STORES.limits), lockKey(kind, id));
  const t = now();
  if (rec && Number.isFinite(rec.lockedUntil) && (rec.lockedUntil as number) > t) failRetry('locked', ((rec.lockedUntil as number) - t) / 1000);
  return !!rec || !!etag;
}

/** 실패 1회 기록. 이번 실패로 잠기면 잠금 남은 초, 아니면 0 */
export async function recordFailure(c: Ctx, kind: string, id: string): Promise<number> {
  const st = c.store(STORES.limits);
  const key = lockKey(kind, id);
  for (let i = 0; i < CAS_RETRIES; i++) {
    const t = now();
    const { rec, etag } = await read(st, key);
    if (rec && Number.isFinite(rec.lockedUntil) && (rec.lockedUntil as number) > t) return ((rec.lockedUntil as number) - t) / 1000;
    const live = rec && Number.isFinite(rec.n) && Number.isFinite(rec.start) && t - rec.start < RATE.loginFailWindowMs && t >= rec.start && !rec.lockedUntil;
    const next: Counter = live ? { n: rec.n + 1, start: rec.start } : { n: 1, start: t };
    if (next.n >= RATE.loginFailMax) next.lockedUntil = t + RATE.loginLockMs;
    if (await write(st, key, next, etag, !!rec || !!etag)) return next.lockedUntil ? RATE.loginLockMs / 1000 : 0;
  }
  return 0;
}

export async function clearFailures(c: Ctx, kind: string, id: string): Promise<void> {
  await c.store(STORES.limits).delete(lockKey(kind, id));
}
