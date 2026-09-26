// 계정: 가입, 로그인, 로그아웃, 내 정보, 비밀번호 변경, 복구 코드로 재설정, 탈퇴 + 세션 인증.
import { BODY_LIMIT, CAS_RETRIES, SESSION, SLOTS, STORES } from './config.mts';
import { ApiError, fail, failRetry, ok, readJson, readOptionalJson } from './http.mts';
import { burn, hashSecret, needsRehash, newRecoveryCode, newToken, newUid, normalizeRecoveryCode, sha256hex, TOKEN_RE, verifySecret } from './crypto.mts';
import type { SecretHash } from './crypto.mts';
import { attemptFailed, attemptSucceeded, beginAttempt, checkSignupByIp, clearLocks, limitAuthByIp, releaseSignup, reserveSignup } from './ratelimit.mts';
import type { Attempt } from './ratelimit.mts';
import { now } from './runtime.mts';
import type { Ctx } from './runtime.mts';
import { checkNewId, checkNewPassword, normalizeId, readBool } from './validate.mts';

/** ttl: 이 세션의 유효 기간(ms) — '로그인 유지'면 30일, 끄면 12시간. 예전 기록에는 없다(30일로 본다) */
export interface SessionEntry { h: string; createdAt: number; expiresAt: number; refreshedAt: number; ttl?: number }
export interface UserRec {
  v: 1;
  id: string; // 로그인 아이디 (소문자)
  uid: string; // 내부 식별자 (저장 데이터 키)
  createdAt: number;
  updatedAt: number;
  pw: SecretHash; // 비밀번호 해시
  rc: SecretHash; // 복구 코드 해시
  sessions: SessionEntry[]; // 토큰의 SHA-256 만 보관
}
interface SessionBlob { id: string; uid: string; createdAt: number; expiresAt: number }

export interface Auth { id: string; uid: string; hash: string; user: UserRec }

const MAX_SECRET_CHARS = 256;
export const unauthorized = (): never => fail('unauthorized', 401, undefined, { 'WWW-Authenticate': 'Bearer' });

export async function getUser(c: Ctx, id: string): Promise<{ user: UserRec; etag?: string } | null> {
  const r = await c.store(STORES.users).getWithMetadata(id, { type: 'json' });
  if (!r || !r.data || typeof r.data !== 'object' || r.data.id !== id) return null;
  const user = r.data as UserRec;
  if (!Array.isArray(user.sessions)) user.sessions = [];
  return { user, etag: r.etag };
}

/** 조건부 쓰기로 사용자 레코드 수정 (동시 수정 시 다시 읽고 재시도). 계정이 없거나 바뀌었으면 401 */
export async function updateUser(c: Ctx, id: string, uid: string, mutate: (u: UserRec) => void): Promise<UserRec> {
  const users = c.store(STORES.users);
  for (let i = 0; i < CAS_RETRIES; i++) {
    const got = await getUser(c, id);
    if (!got || got.user.uid !== uid) unauthorized();
    const u = got!.user;
    mutate(u);
    u.updatedAt = now();
    const res = await users.setJSON(id, u, got!.etag ? { onlyIfMatch: got!.etag } : {});
    if (res.modified) return u;
  }
  throw new Error('user update contention');
}

export async function dropSessionBlobs(c: Ctx, hashes: string[]): Promise<void> {
  const st = c.store(STORES.sessions);
  await Promise.all(hashes.map((h) => st.delete(h)));
}

/**
 * 새 세션 발급: 만료된 세션 정리, 10개 초과 시 가장 오래된 것부터 폐기.
 * pwHash: 이 로그인이 확인한 비밀번호 해시 — 그 사이 비밀번호가 바뀌었으면(다른 기기에서 변경·복구) 세션을 만들지 않는다.
 * (확인은 옛 비밀번호로 했는데 세션은 비밀번호 변경의 '다른 세션 모두 폐기' 뒤에 붙어 살아남는 경합을 막는다)
 */
async function createSession(c: Ctx, user: UserRec, remember: boolean, pwHash?: string): Promise<string> {
  const token = newToken();
  const h = sha256hex(token);
  const t = now();
  const ttl = remember ? SESSION.ttlMs : SESSION.shortTtlMs;
  const entry: SessionEntry = { h, createdAt: t, expiresAt: t + ttl, refreshedAt: t, ttl };
  const blob: SessionBlob = { id: user.id, uid: user.uid, createdAt: t, expiresAt: entry.expiresAt };
  const sessions = c.store(STORES.sessions);
  await sessions.setJSON(h, blob);
  let dropped: string[] = [];
  try {
    await updateUser(c, user.id, user.uid, (u) => {
      if (pwHash !== undefined && u.pw?.hash !== pwHash) fail('invalid_credentials', 401);
      dropped = [];
      const alive = u.sessions.filter((e) => {
        const keep = e && typeof e.h === 'string' && e.expiresAt > t;
        if (!keep && e && typeof e.h === 'string') dropped.push(e.h);
        return keep;
      });
      alive.sort((a, b) => a.createdAt - b.createdAt);
      while (alive.length >= SESSION.maxPerUser) dropped.push(alive.shift()!.h);
      alive.push(entry);
      u.sessions = alive;
    });
  } catch (e) {
    await sessions.delete(h);
    throw e;
  }
  await dropSessionBlobs(c, dropped);
  return token;
}

/** Authorization: Bearer <토큰> 확인. 7일 넘게 연장되지 않은 세션은 다시 30일로 연장한다 */
export async function authenticate(c: Ctx): Promise<Auth> {
  const m = /^Bearer[ ]+(\S+)$/i.exec((c.req.headers.get('authorization') ?? '').trim());
  if (!m || !TOKEN_RE.test(m[1])) unauthorized();
  const hash = sha256hex(m![1]);
  const sessions = c.store(STORES.sessions);
  const blob = (await sessions.get(hash, { type: 'json' })) as SessionBlob | null;
  if (!blob || typeof blob.id !== 'string' || typeof blob.uid !== 'string') unauthorized();
  const t = now();
  const got = await getUser(c, blob!.id);
  const entry = got?.user.uid === blob!.uid ? got.user.sessions.find((e) => e?.h === hash) : undefined;
  if (!got || !entry || !(entry.expiresAt > t)) {
    await sessions.delete(hash);
    unauthorized();
  }
  let user = got!.user;
  const ttl = Number.isFinite(entry!.ttl) && (entry!.ttl as number) > 0 ? (entry!.ttl as number) : SESSION.ttlMs;
  const refreshAfter = ttl < SESSION.ttlMs ? SESSION.shortRefreshAfterMs : SESSION.refreshAfterMs;
  if (t - (entry!.refreshedAt ?? entry!.createdAt) >= refreshAfter) {
    const expiresAt = t + ttl;
    try {
      let still = false;
      user = await updateUser(c, user.id, user.uid, (u) => {
        const e = u.sessions.find((x) => x?.h === hash);
        still = !!e;
        if (e) { e.expiresAt = expiresAt; e.refreshedAt = t; }
      });
      // 그사이 폐기된 세션(로그아웃·비밀번호 변경)의 저장값을 되살리지 않는다
      if (still) await sessions.setJSON(hash, { ...blob!, expiresAt });
    } catch (e) {
      if (e instanceof ApiError) throw e; // 그사이 계정이 삭제됨
      // 연장 실패는 이번 요청을 막지 않는다 (다음 요청에서 다시 연장)
    }
  }
  return { id: user.id, uid: user.uid, hash, user };
}

const secretArg = (v: unknown): string => {
  if (typeof v !== 'string' || v.length > MAX_SECRET_CHARS) fail('bad_request', 400);
  return v as string;
};

/** 비밀번호(또는 복구 코드) 확인 실패 처리: 한도째였으면 429 locked, 아니면 주어진 오류 */
async function rejectAttempt(c: Ctx, a: Attempt, code: string, status: number): Promise<never> {
  const lock = await attemptFailed(c, a);
  if (lock > 0) failRetry('locked', lock);
  return fail(code, status);
}

// ── 핸들러 ──

export async function signup(c: Ctx): Promise<Response> {
  const body = await readJson(c.req, BODY_LIMIT.auth);
  await limitAuthByIp(c);
  const id = checkNewId(body.id);
  const password = checkNewPassword(body.password, id);
  const remember = readBool(body.remember, true);
  await checkSignupByIp(c);
  const users = c.store(STORES.users);
  if (await users.getMetadata(id)) fail('id_taken', 409);
  // 가입 자리를 먼저 원자적으로 잡는다 (동시에 여러 개를 보내도 망별 한도를 넘지 못하게). 가입이 안 되면 돌려준다
  await reserveSignup(c);
  let user: UserRec | null = null;
  let recoveryCode = '';
  try {
    recoveryCode = newRecoveryCode();
    const [pw, rc] = await Promise.all([hashSecret(password), hashSecret(normalizeRecoveryCode(recoveryCode)!)]);
    const t = now();
    const rec: UserRec = { v: 1, id, uid: newUid(), createdAt: t, updatedAt: t, pw, rc, sessions: [] };
    const res = await users.setJSON(id, rec, { onlyIfNew: true });
    if (!res.modified) fail('id_taken', 409);
    user = rec;
  } finally {
    if (!user) await releaseSignup(c).catch(() => {});
  }
  const token = await createSession(c, user!, remember);
  return ok({ id, token, recoveryCode }, 201);
}

export async function login(c: Ctx): Promise<Response> {
  const body = await readJson(c.req, BODY_LIMIT.auth);
  await limitAuthByIp(c);
  if (typeof body.id !== 'string') fail('bad_request', 400);
  const password = secretArg(body.password);
  const remember = readBool(body.remember, true);
  const id = normalizeId(body.id);
  if (!id) fail('invalid_credentials', 401); // 형식상 존재할 수 없는 아이디
  const attempt = await beginAttempt(c, 'login', id!);
  const got = await getUser(c, id!);
  const good = got ? await verifySecret(password, got.user.pw) : (await burn(password), false);
  if (!good) await rejectAttempt(c, attempt, 'invalid_credentials', 401); // 아이디가 없을 때와 비밀번호가 틀릴 때 같은 응답
  await attemptSucceeded(c, attempt);
  let user = got!.user;
  let pwHash = user.pw.hash;
  if (needsRehash(user.pw)) {
    try {
      const pw = await hashSecret(password);
      // 확인한 비밀번호가 그대로일 때만 바꾼다 — 그사이 다른 기기에서 바꾼 새 비밀번호를 옛 비밀번호로 되돌리지 않게
      user = await updateUser(c, id!, user.uid, (u) => { if (u.pw?.hash === pwHash) u.pw = pw; });
      if (user.pw.hash === pw.hash) pwHash = pw.hash;
    } catch (e) { if (e instanceof ApiError) throw e; /* 재해시는 다음 로그인에 다시 시도 */ }
  }
  const token = await createSession(c, user, remember, pwHash);
  return ok({ id: user.id, token });
}

/** 로그아웃: 이 세션만 폐기. 본문 {all:true} 면 이 계정의 모든 세션(다른 기기 포함) 폐기 → {ok, revoked} */
export async function logout(c: Ctx): Promise<Response> {
  const a = await authenticate(c);
  const body = await readOptionalJson(c.req, BODY_LIMIT.auth);
  const all = readBool(body.all, false);
  let dropped: string[] = [];
  await updateUser(c, a.id, a.uid, (u) => {
    const hs = u.sessions.map((e) => e?.h).filter((h): h is string => typeof h === 'string');
    dropped = all ? hs : hs.filter((h) => h === a.hash);
    u.sessions = all ? [] : u.sessions.filter((e) => e?.h !== a.hash);
  });
  await dropSessionBlobs(c, [...new Set([...dropped, a.hash])]);
  return ok({ revoked: dropped.length });
}

export async function me(c: Ctx): Promise<Response> {
  const a = await authenticate(c);
  return ok({ id: a.id, createdAt: a.user.createdAt });
}

export async function changePassword(c: Ctx): Promise<Response> {
  const a = await authenticate(c);
  const body = await readJson(c.req, BODY_LIMIT.auth);
  await limitAuthByIp(c);
  const oldPassword = secretArg(body.oldPassword);
  const newPassword = checkNewPassword(body.newPassword, a.id);
  const attempt = await beginAttempt(c, 'login', a.id);
  const oldHash = a.user.pw.hash;
  if (!(await verifySecret(oldPassword, a.user.pw))) await rejectAttempt(c, attempt, 'wrong_password', 403);
  await attemptSucceeded(c, attempt);
  if (newPassword.normalize('NFC') === oldPassword.normalize('NFC')) fail('same_password', 400);
  const pw = await hashSecret(newPassword);
  let dropped: string[] = [];
  await updateUser(c, a.id, a.uid, (u) => {
    // 그사이 다른 요청이 비밀번호를 바꿨다면 이 요청이 확인한 '지금 비밀번호'는 더 이상 지금 것이 아니다
    if (u.pw?.hash !== oldHash) fail('wrong_password', 403);
    dropped = u.sessions.filter((e) => e?.h !== a.hash).map((e) => e?.h).filter((h): h is string => typeof h === 'string');
    u.sessions = u.sessions.filter((e) => e?.h === a.hash);
    u.pw = pw;
  });
  await dropSessionBlobs(c, dropped);
  return ok();
}

export async function recover(c: Ctx): Promise<Response> {
  const body = await readJson(c.req, BODY_LIMIT.auth);
  await limitAuthByIp(c);
  if (typeof body.id !== 'string') fail('bad_request', 400);
  const codeInput = secretArg(body.recoveryCode);
  const remember = readBool(body.remember, true);
  const id = normalizeId(body.id);
  if (!id) fail('invalid_recovery', 401);
  const newPassword = checkNewPassword(body.newPassword, id!);
  const attempt = await beginAttempt(c, 'recover', id!);
  const got = await getUser(c, id!);
  const code = normalizeRecoveryCode(codeInput);
  const good = got && code ? await verifySecret(code, got.user.rc) : (await burn(codeInput), false);
  if (!good) await rejectAttempt(c, attempt, 'invalid_recovery', 401);
  const user0 = got!.user;
  const recoveryCode = newRecoveryCode();
  const [pw, rc] = await Promise.all([hashSecret(newPassword), hashSecret(normalizeRecoveryCode(recoveryCode)!)]);
  let dropped: string[] = [];
  let user: UserRec;
  try {
    user = await updateUser(c, id!, user0.uid, (u) => {
      // 같은 코드로 동시에 두 번 복구하는 것을 막는다 (복구 코드는 한 번만 쓸 수 있다)
      if (u.rc?.hash !== user0.rc?.hash) fail('invalid_recovery', 401);
      dropped = u.sessions.map((e) => e?.h).filter((h): h is string => typeof h === 'string');
      u.sessions = [];
      u.pw = pw;
      u.rc = rc;
    });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'unauthorized') fail('invalid_recovery', 401);
    throw e;
  }
  await dropSessionBlobs(c, dropped);
  // 주인이 되찾았으므로 모든 망의 로그인·복구 잠금을 푼다 (잠금 공격을 받던 중이라도 바로 들어올 수 있게)
  await Promise.all([clearLocks(c, 'recover', id!), clearLocks(c, 'login', id!)]);
  const token = await createSession(c, user!, remember, user!.pw.hash);
  return ok({ id: user!.id, recoveryCode, token });
}

export async function deleteAccount(c: Ctx): Promise<Response> {
  const a = await authenticate(c);
  const body = await readJson(c.req, BODY_LIMIT.auth);
  await limitAuthByIp(c);
  const password = secretArg(body.password);
  const attempt = await beginAttempt(c, 'login', a.id);
  if (!(await verifySecret(password, a.user.pw))) await rejectAttempt(c, attempt, 'wrong_password', 403);
  await attemptSucceeded(c, attempt);
  await purgeAccount(c, a.user);
  return ok();
}

async function sweepSaves(c: Ctx, uid: string): Promise<void> {
  const saves = c.store(STORES.saves);
  const listed = await saves.list({ prefix: `${uid}/` });
  const keys = new Set([...listed.blobs.map((b) => b.key), ...SLOTS.map((s) => `${uid}/slot${s}`), `${uid}/meta`]);
  await Promise.all([...keys].map((k) => saves.delete(k)));
}

/**
 * 계정 완전 삭제: 저장 데이터 → 세션 → 제한 기록 → 사용자 레코드 → 저장 데이터 한 번 더 (중간에 실패해도 다시 실행하면 이어서 지워진다).
 * 마지막 쓸기는 삭제 도중 인증을 통과해 들어온 세이브 쓰기를 치운다 (그보다 늦은 쓰기는 saves.mts 가 스스로 되돌린다).
 */
export async function purgeAccount(c: Ctx, user: UserRec): Promise<void> {
  await sweepSaves(c, user.uid);
  await dropSessionBlobs(c, user.sessions.map((e) => e?.h).filter((h): h is string => typeof h === 'string'));
  await Promise.all([clearLocks(c, 'login', user.id), clearLocks(c, 'recover', user.id)]);
  await c.store(STORES.users).delete(user.id);
  await sweepSaves(c, user.uid);
}

/** 쓰기 뒤 확인용: 이 계정(uid)이 아직 있는가 */
export async function accountAlive(c: Ctx, id: string, uid: string): Promise<boolean> {
  const got = await getUser(c, id);
  return !!got && got.user.uid === uid;
}
