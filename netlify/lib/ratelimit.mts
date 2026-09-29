// Blobs 에 저장하는 요청 제한 카운터 (고정 창, 조건부 쓰기(CAS)로 동시 요청에도 숫자가 새지 않게 한다).
//  - 망별 인증 시도·가입 수: windowHit (원자적 증가)
//  - 비밀번호·복구 코드 시도: beginAttempt 로 '확인하기 전에' 자리를 잡는다. 실패하면 자리가 그대로 남아 실패 1회가 되고,
//    한도째 시도가 실패하면 잠근다. 성공하면 자리를 돌려준다. 그래서 동시 요청 수십 개를 한꺼번에 보내도
//    비밀번호를 한도보다 많이 확인시킬 수 없다 (예전 방식: '잠겼나?' 확인 → 확인 → 실패 기록 사이에 경합).
//  - 아이디 전체 잠금(PS-04): 공격자가 망을 늘려 주인을 막지 못하게 — 잠금 시간은 2분에서 두 배씩 10분 상한(strikes),
//    로그인에 성공한 적이 있는 망(믿는 망, lock/login/<id>/ok/…)에서 온 요청에는 걸지 않는다. IPv6 는 /48 단위로도 센다(wide).
import { CAS_RETRIES, RATE, STORES } from './config.mts';
import { failRetry } from './http.mts';
import { ipKey, netKey, wideNetOf } from './crypto.mts';
import { now } from './runtime.mts';
import type { Ctx, KV } from './runtime.mts';

/** strikes/struckAt: 아이디 전체 잠금이 이어진 횟수와 마지막 잠금 시각 (잠금 시간을 늘리는 데만 쓴다) */
interface Counter { n: number; start: number; lockedUntil?: number; strikes?: number; struckAt?: number }

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

/** 이어 가는 잠금 횟수: 마지막 잠금 뒤 idStrikeDecayMs 안이면 새 창에도 넘겨준다 */
const strikesOf = (rec: Counter | null, t: number): Pick<Counter, 'strikes' | 'struckAt'> =>
  rec && Number.isFinite(rec.strikes) && (rec.strikes as number) > 0 && Number.isFinite(rec.struckAt) && t - (rec.struckAt as number) < RATE.idStrikeDecayMs
    ? { strikes: rec.strikes, struckAt: rec.struckAt }
    : {};

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
    const t = now();
    if (!isLive(rec, t, windowMs) || rec.n <= 0) return;
    if (await write(st, key, { n: rec.n - 1, start: rec.start, ...strikesOf(rec, t) }, etag, true)) return;
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
/** role: net = 아이디+망(/64·IPv4), wide = 아이디+IPv6 /48, all = 아이디 전체 (잠금 시간이 점증한다) */
interface Spec { key: string; max: number; windowMs: number; lockMs: number; role: 'net' | 'wide' | 'all' }
interface Held { spec: Spec; n: number }
export interface Attempt { held: Held[]; kind: AttemptKind; id: string }

// 키: lock/<kind>/<id>/all (아이디 전체), lock/<kind>/<id>/net/<망 해시> (아이디+망), lock/login/<id>/wide/<IPv6 /48 해시>,
//     lock/login/<id>/ok/<망 해시 또는 /48 해시> = {at} (이 아이디로 로그인에 성공한 망 — 믿는 망).
// 한 키가 다른 키의 경로 앞부분이 되지 않게 한다 (로컬 Blobs 서버는 키를 파일 경로로 저장한다)
const idDir = (kind: AttemptKind, id: string): string => `lock/${kind}/${id}/`;
const allKey = (kind: AttemptKind, id: string): string => `${idDir(kind, id)}all`;
const netDir = (kind: AttemptKind, id: string): string => `${idDir(kind, id)}net/`;
const wideDir = (kind: AttemptKind, id: string): string => `${idDir(kind, id)}wide/`;
const okDir = (id: string): string => `${idDir('login', id)}ok/`;

interface Trust { net: boolean; wide: boolean }
const NO_TRUST: Trust = { net: false, wide: false };
function trustKeys(c: Ctx, id: string): { net: string; wide: string | null } {
  const w = wideNetOf(c.ip);
  return { net: `${okDir(id)}${ipKey(c.ip)}`, wide: w ? `${okDir(id)}${netKey(w)}` : null };
}
/** 이 요청의 망(또는 IPv6 /48)에서 이 아이디로 로그인에 성공한 적이 있는가 (trustMs 안) */
async function trustOf(c: Ctx, id: string): Promise<Trust> {
  if (c.ip === 'unknown') return NO_TRUST; // 접속 IP 를 모르면 모두 한 묶음이라 믿지 않는다
  const st = c.store(STORES.limits);
  const t = now();
  const k = trustKeys(c, id);
  const fresh = (r: unknown): boolean => {
    const at = (r as { at?: unknown } | null)?.at;
    return typeof at === 'number' && Number.isFinite(at) && t - at < RATE.trustMs && at <= t + 60_000;
  };
  const [a, b] = await Promise.all([st.get(k.net, { type: 'json' }), k.wide ? st.get(k.wide, { type: 'json' }) : Promise.resolve(null)]);
  return { net: fresh(a), wide: fresh(b) };
}
/** 비밀번호(가입·로그인·복구)를 맞힌 망을 믿는 망으로 적는다 (IPv6 는 /64 와 /48 둘 다) */
export async function trustNetwork(c: Ctx, id: string): Promise<void> {
  if (c.ip === 'unknown') return;
  const st = c.store(STORES.limits);
  const k = trustKeys(c, id);
  const rec = { at: now() };
  await Promise.all([st.setJSON(k.net, rec), k.wide ? st.setJSON(k.wide, rec) : Promise.resolve()]);
}

function specs(c: Ctx, kind: AttemptKind, id: string, trust: Trust): Spec[] {
  const net = `${netDir(kind, id)}${ipKey(c.ip)}`;
  if (kind === 'recover') {
    return [{ key: net, max: RATE.recoverFailMax, windowMs: RATE.recoverFailWindowMs, lockMs: RATE.recoverLockMs, role: 'net' }];
  }
  const out: Spec[] = [{ key: net, max: RATE.loginFailMax, windowMs: RATE.loginFailWindowMs, lockMs: RATE.loginLockMs, role: 'net' }];
  const wide = wideNetOf(c.ip);
  // 믿는 /64 에서는 /48 잠금도 받지 않는다 (같은 /48 의 다른 가입자가 주인을 막지 못하게). 믿는 /48 이면 아이디 전체 잠금만 뺀다
  if (wide && !trust.net) out.push({ key: `${wideDir(kind, id)}${netKey(wide)}`, max: RATE.wideFailMax, windowMs: RATE.wideFailWindowMs, lockMs: RATE.wideLockMs, role: 'wide' });
  if (!trust.net && !trust.wide) out.push({ key: allKey(kind, id), max: RATE.idFailMax, windowMs: RATE.idFailWindowMs, lockMs: RATE.idLockMs, role: 'all' });
  return out;
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
    if (await write(st, s.key, { n: n + 1, start: live ? rec.start : t, ...strikesOf(rec, t) }, etag, !!rec || !!etag)) return { wait: 0, n: n + 1 };
  }
  return { wait: 1, n: 0 }; // 경합이 계속되면 막는 쪽으로
}

/**
 * 비밀번호(kind 'login': 로그인·비밀번호 변경·탈퇴 확인) 또는 복구 코드(kind 'recover') 확인 전에 호출.
 * 잠겨 있거나 한도가 찼으면 429 locked. 확인 뒤에는 반드시 attemptFailed 또는 attemptSucceeded 를 부른다.
 * 없는 아이디도 똑같이 세고 잠근다 (계정 존재 여부를 드러내지 않게).
 * 믿는 망(이 아이디로 로그인에 성공한 망)에서 온 로그인 시도는 아이디 전체 잠금을 받지 않는다 — 망별 한도는 그대로.
 */
export async function beginAttempt(c: Ctx, kind: AttemptKind, id: string): Promise<Attempt> {
  const st = c.store(STORES.limits);
  const held: Held[] = [];
  const trust = kind === 'login' ? await trustOf(c, id) : NO_TRUST;
  for (const spec of specs(c, kind, id, trust)) {
    const r = await reserve(st, spec);
    if (r.wait > 0) {
      await Promise.all(held.map((h) => release(st, h.spec.key, h.spec.windowMs)));
      failRetry('locked', r.wait);
    }
    held.push({ spec, n: r.n });
  }
  return { held, kind, id };
}

/** 확인 실패: 자리는 그대로(= 실패 1회). 이번이 한도째였으면 잠그고 잠금 초를, 아니면 0. 아이디 전체 잠금은 이어질수록 길게 (상한 있음) */
export async function attemptFailed(c: Ctx, a: Attempt): Promise<number> {
  const st = c.store(STORES.limits);
  let lock = 0;
  for (const h of a.held) {
    if (h.n < h.spec.max) continue;
    const t = now();
    let lockMs = h.spec.lockMs;
    const rec: Counter = { n: h.n, start: t, lockedUntil: 0 };
    if (h.spec.role === 'all') {
      const prev = strikesOf((await read(st, h.spec.key)).rec, t).strikes ?? 0;
      const strikes = Math.min(prev + 1, 16);
      lockMs = Math.min(RATE.idLockMs * 2 ** (strikes - 1), RATE.idLockMaxMs);
      rec.strikes = strikes; rec.struckAt = t;
    }
    rec.lockedUntil = t + lockMs;
    await st.setJSON(h.spec.key, rec);
    lock = Math.max(lock, lockMs / 1000);
  }
  return lock;
}

/**
 * 확인 성공: 이 망의 실패 기록은 지우고, /48·아이디 전체 수에서는 이번 자리만 돌려준다 (다른 곳의 실패는 그대로 센다).
 * 로그인 비밀번호를 맞힌 망은 믿는 망으로 적는다 (다음부터 아이디 전체 잠금을 받지 않는다)
 */
export async function attemptSucceeded(c: Ctx, a: Attempt): Promise<void> {
  const st = c.store(STORES.limits);
  await Promise.all([
    ...a.held.map((h) => (h.spec.role === 'net' ? st.delete(h.spec.key) : release(st, h.spec.key, h.spec.windowMs))),
    a.kind === 'login' ? trustNetwork(c, a.id) : Promise.resolve(),
  ]);
}

/** 이 아이디의 모든 잠금·실패 기록 지우기 (복구 성공·탈퇴·운영자 잠금 해제) */
export async function clearLocks(c: Ctx, kind: AttemptKind, id: string): Promise<void> {
  const st = c.store(STORES.limits);
  const { blobs } = await st.list({ prefix: idDir(kind, id) });
  await Promise.all([st.delete(allKey(kind, id)), ...blobs.map((b) => st.delete(b.key))]);
}

/** 운영 도구용: 아이디 전체 실패 수·잠금, 잠긴 망 수 (IPv6 /48 포함), 믿는 망 수 */
export async function lockStatus(c: Ctx, kind: AttemptKind, id: string): Promise<{ failures: number; lockedUntil: number | null; lockedNetworks: number; lockedWideNetworks: number; trustedNetworks: number }> {
  const st = c.store(STORES.limits);
  const t = now();
  const { rec } = await read(st, allKey(kind, id));
  const [netList, wideList, okList] = await Promise.all([
    st.list({ prefix: netDir(kind, id) }), st.list({ prefix: wideDir(kind, id) }), kind === 'login' ? st.list({ prefix: okDir(id) }) : Promise.resolve({ blobs: [] as { key: string }[] }),
  ]);
  const nets = await Promise.all(netList.blobs.map((b) => read(st, b.key)));
  const wides = await Promise.all(wideList.blobs.map((b) => read(st, b.key)));
  const locked = lockedFor(rec, t) > 0;
  return {
    failures: locked || isLive(rec, t, kind === 'login' ? RATE.idFailWindowMs : RATE.recoverFailWindowMs) ? (rec as Counter).n : 0,
    lockedUntil: locked ? ((rec as Counter).lockedUntil as number) : null,
    lockedNetworks: nets.filter((x) => lockedFor(x.rec, t) > 0).length,
    lockedWideNetworks: wides.filter((x) => lockedFor(x.rec, t) > 0).length,
    trustedNetworks: okList.blobs.length,
  };
}

/**
 * 정리 함수용 (netlify/functions/cleanup.mts): 이 제한 기록을 지워도 되는가. 창이 끝나고 잠금도 풀린 지 idleMs 가 지난 카운터,
 * trustMs 가 지난 믿는 망 기록. 잠금 점증(strikes)이 아직 살아 있는 아이디 전체 기록은 남긴다. 형식을 모르는 값은 지운다
 */
export function limitRecordExpired(key: string, rec: unknown, t: number, idleMs: number): boolean {
  if (!rec || typeof rec !== 'object') return true;
  const r = rec as Counter & { at?: number };
  if (/\/ok\/[^/]+$/.test(key)) return !(typeof r.at === 'number' && Number.isFinite(r.at) && t - r.at < RATE.trustMs);
  if (!Number.isFinite(r.start)) return true;
  if (Number.isFinite(r.lockedUntil) && (r.lockedUntil as number) + idleMs > t) return false;
  if (Object.keys(strikesOf(r, t)).length) return false;
  return (r.start as number) + RATE.idFailWindowMs + idleMs <= t; // 가장 긴 창(1시간) + 여유
}
