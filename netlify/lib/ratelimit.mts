// Blobs 에 저장하는 요청 제한 카운터 (고정 창, 조건부 쓰기(CAS)로 동시 요청에도 숫자가 새지 않게 한다).
//  - 망별 인증 시도·가입 수: windowHit (원자적 증가)
//  - 비밀번호·복구 코드 시도: beginAttempt 로 '확인하기 전에' 자리를 잡는다. 실패하면 자리가 그대로 남아 실패 1회가 되고,
//    한도째 시도가 실패하면 잠근다. 성공하면 자리를 돌려준다. 그래서 동시 요청 수십 개를 한꺼번에 보내도
//    비밀번호를 한도보다 많이 확인시킬 수 없다 (예전 방식: '잠겼나?' 확인 → 확인 → 실패 기록 사이에 경합).
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

/** 경합으로 다시 시도할 때 잠깐 쉬어 동시 요청이 엇갈리게 한다 */
const backoff = (i: number): Promise<void> | undefined => (i > 0 ? new Promise((r) => setTimeout(r, Math.random() * 6 * i)) : undefined);

const isLive = (rec: Counter | null, t: number, windowMs: number): rec is Counter =>
  !!rec && Number.isFinite(rec.n) && Number.isFinite(rec.start) && !rec.lockedUntil && t >= rec.start && t - rec.start < windowMs;
const lockedFor = (rec: Counter | null, t: number): number =>
  rec && Number.isFinite(rec.lockedUntil) && (rec.lockedUntil as number) > t ? ((rec.lockedUntil as number) - t) / 1000 : 0;

/**
 * 창(windowMs) 안에서 limit 회까지 허용. add=true 면 1 증가시키며 검사, false 면 검사만.
 * 제한에 걸리면 남은 초를, 통과하면 0 을 돌려준다. 동시 쓰기 경합이 계속되면 막는 쪽으로 판단한다.
 */
async function windowHit(st: KV, key: string, limit: number, windowMs: number, add: boolean): Promise<number> {
  for (let i = 0; i < CAS_RETRIES; i++) {
    await backoff(i);
    const t = now();
    const { rec, etag } = await read(st, key);
    const live = isLive(rec, t, windowMs);
    if (live && rec.n >= limit) return (rec.start + windowMs - t) / 1000;
    if (!add) return 0;
    const next: Counter = live ? { n: rec.n + 1, start: rec.start } : { n: 1, start: t };
    if (await write(st, key, next, etag, !!rec || !!etag)) return 0;
  }
  return 1;
}

/** 창 안의 수를 1 줄인다 (잡았던 자리 돌려주기) */
async function release(st: KV, key: string, windowMs: number): Promise<void> {
  for (let i = 0; i < CAS_RETRIES; i++) {
    await backoff(i);
    const { rec, etag } = await read(st, key);
    if (!isLive(rec, now(), windowMs) || rec.n <= 0) return;
    if (await write(st, key, { n: rec.n - 1, start: rec.start }, etag, true)) return;
  }
}

/** 망별 인증 시도 제한 (가입·로그인·복구·비밀번호 변경·탈퇴) — 초과 시 429 rate_limited */
export async function limitAuthByIp(c: Ctx): Promise<void> {
  const wait = await windowHit(c.store(STORES.limits), `ip/auth/${ipKey(c.ip)}`, RATE.ipAuthMax, RATE.ipAuthWindowMs, true);
  if (wait > 0) failRetry('rate_limited', wait);
}

const signupKey = (c: Ctx): string => `ip/signup/${ipKey(c.ip)}`;

/** 망별 가입 수 제한 검사만 (아이디 중복 확인 전에 빨리 거절) — 초과 시 429 signup_limited */
export async function checkSignupByIp(c: Ctx): Promise<void> {
  const wait = await windowHit(c.store(STORES.limits), signupKey(c), RATE.ipSignupMax, RATE.ipSignupWindowMs, false);
  if (wait > 0) failRetry('signup_limited', wait);
}

/** 가입 한 자리를 원자적으로 잡는다 (동시 가입으로 한도를 넘지 못하게). 가입이 실패하면 releaseSignup */
export async function reserveSignup(c: Ctx): Promise<void> {
  const wait = await windowHit(c.store(STORES.limits), signupKey(c), RATE.ipSignupMax, RATE.ipSignupWindowMs, true);
  if (wait > 0) failRetry('signup_limited', wait);
}

export async function releaseSignup(c: Ctx): Promise<void> {
  await release(c.store(STORES.limits), signupKey(c), RATE.ipSignupWindowMs);
}

// ── 비밀번호·복구 코드 시도 ──
export type AttemptKind = 'login' | 'recover';
interface Spec { key: string; max: number; windowMs: number; lockMs: number; perNet: boolean }
interface Held { spec: Spec; n: number }
export interface Attempt { held: Held[] }

const idKey = (kind: AttemptKind, id: string): string => `lock/${kind}/${id}`;

function specs(c: Ctx, kind: AttemptKind, id: string): Spec[] {
  const net = ipKey(c.ip);
  if (kind === 'recover') {
    return [{ key: `${idKey(kind, id)}/${net}`, max: RATE.recoverFailMax, windowMs: RATE.recoverFailWindowMs, lockMs: RATE.recoverLockMs, perNet: true }];
  }
  return [
    { key: `${idKey(kind, id)}/${net}`, max: RATE.loginFailMax, windowMs: RATE.loginFailWindowMs, lockMs: RATE.loginLockMs, perNet: true },
    { key: idKey(kind, id), max: RATE.idFailMax, windowMs: RATE.idFailWindowMs, lockMs: RATE.idLockMs, perNet: false },
  ];
}

/** 자리 하나 잡기 → {wait: 잠겼으면 남은 초, n: 잡은 순번} */
async function reserve(st: KV, s: Spec): Promise<{ wait: number; n: number }> {
  for (let i = 0; i < CAS_RETRIES; i++) {
    await backoff(i);
    const t = now();
    const { rec, etag } = await read(st, s.key);
    const locked = lockedFor(rec, t);
    if (locked > 0) return { wait: locked, n: 0 };
    const live = isLive(rec, t, s.windowMs);
    const n = live ? rec.n : 0;
    // 확인 중이거나 실패한 시도가 이미 한도만큼 있다 (한도째 시도의 결과를 기다리는 중)
    if (n >= s.max) return { wait: Math.max(1, (rec!.start + s.windowMs - t) / 1000), n: 0 };
    if (await write(st, s.key, { n: n + 1, start: live ? rec.start : t }, etag, !!rec || !!etag)) return { wait: 0, n: n + 1 };
  }
  return { wait: 1, n: 0 }; // 경합이 계속되면 막는 쪽으로
}

/**
 * 비밀번호(kind 'login': 로그인·비밀번호 변경·탈퇴 확인) 또는 복구 코드(kind 'recover') 확인 전에 호출.
 * 잠겨 있거나 한도가 찼으면 429 locked. 확인 뒤에는 반드시 attemptFailed 또는 attemptSucceeded 를 부른다.
 * 없는 아이디도 똑같이 세고 잠근다 (계정 존재 여부를 드러내지 않게).
 */
export async function beginAttempt(c: Ctx, kind: AttemptKind, id: string): Promise<Attempt> {
  const st = c.store(STORES.limits);
  const held: Held[] = [];
  for (const spec of specs(c, kind, id)) {
    const r = await reserve(st, spec);
    if (r.wait > 0) {
      await Promise.all(held.map((h) => release(st, h.spec.key, h.spec.windowMs)));
      failRetry('locked', r.wait);
    }
    held.push({ spec, n: r.n });
  }
  return { held };
}

/** 확인 실패: 자리는 그대로(= 실패 1회). 이번이 한도째였으면 잠그고 잠금 초를, 아니면 0 */
export async function attemptFailed(c: Ctx, a: Attempt): Promise<number> {
  const st = c.store(STORES.limits);
  let lock = 0;
  for (const h of a.held) {
    if (h.n < h.spec.max) continue;
    const t = now();
    await st.setJSON(h.spec.key, { n: h.n, start: t, lockedUntil: t + h.spec.lockMs } satisfies Counter);
    lock = Math.max(lock, h.spec.lockMs / 1000);
  }
  return lock;
}

/** 확인 성공: 이 망의 실패 기록은 지우고, 아이디 전체 수에서는 이번 자리만 돌려준다 (다른 곳의 실패는 그대로 센다) */
export async function attemptSucceeded(c: Ctx, a: Attempt): Promise<void> {
  const st = c.store(STORES.limits);
  await Promise.all(a.held.map((h) => (h.spec.perNet ? st.delete(h.spec.key) : release(st, h.spec.key, h.spec.windowMs))));
}

/** 이 아이디의 모든 잠금·실패 기록 지우기 (복구 성공·탈퇴·운영자 잠금 해제) */
export async function clearLocks(c: Ctx, kind: AttemptKind, id: string): Promise<void> {
  const st = c.store(STORES.limits);
  const { blobs } = await st.list({ prefix: `${idKey(kind, id)}/` });
  await Promise.all([st.delete(idKey(kind, id)), ...blobs.map((b) => st.delete(b.key))]);
}

/** 운영 도구용: 아이디 전체 실패 수·잠금, 잠긴 망 수 */
export async function lockStatus(c: Ctx, kind: AttemptKind, id: string): Promise<{ failures: number; lockedUntil: number | null; lockedNetworks: number }> {
  const st = c.store(STORES.limits);
  const t = now();
  const { rec } = await read(st, idKey(kind, id));
  const { blobs } = await st.list({ prefix: `${idKey(kind, id)}/` });
  const nets = await Promise.all(blobs.map((b) => read(st, b.key)));
  return {
    failures: isLive(rec, t, kind === 'login' ? RATE.idFailWindowMs : RATE.recoverFailWindowMs) ? rec.n : 0,
    lockedUntil: lockedFor(rec, t) > 0 ? (rec!.lockedUntil as number) : null,
    lockedNetworks: nets.filter((x) => lockedFor(x.rec, t) > 0).length,
  };
}
