// 계정: 가입, 로그인, 로그아웃, 내 정보, 비밀번호 변경, 복구 코드로 재설정, 탈퇴 + 세션 인증.
import { BODY_LIMIT, CAS_RETRIES, SESSION, SLOTS, STORES } from './config.mts';
import { ApiError, fail, failRetry, ok, readJson } from './http.mts';
import { burn, hashSecret, needsRehash, newRecoveryCode, newToken, newUid, normalizeRecoveryCode, sha256hex, TOKEN_RE, verifySecret } from './crypto.mts';
import type { SecretHash } from './crypto.mts';
import { assertNotLocked, checkSignupByIp, clearFailures, countSignup, limitAuthByIp, recordFailure } from './ratelimit.mts';
import { now } from './runtime.mts';
import type { Ctx } from './runtime.mts';
import { checkNewId, checkNewPassword, normalizeId } from './validate.mts';

export interface SessionEntry { h: string; createdAt: number; expiresAt: number; refreshedAt: number }
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
const unauthorized = (): never => fail('unauthorized', 401, undefined, { 'WWW-Authenticate': 'Bearer' });

async function getUser(c: Ctx, id: string): Promise<{ user: UserRec; etag?: string } | null> {
  const r = await c.store(STORES.users).getWithMetadata(id, { type: 'json' });
  if (!r || !r.data || typeof r.data !== 'object' || r.data.id !== id) return null;
  const user = r.data as UserRec;
  if (!Array.isArray(user.sessions)) user.sessions = [];
  return { user, etag: r.etag };
}

/** 조건부 쓰기로 사용자 레코드 수정 (동시 수정 시 다시 읽고 재시도). 계정이 없거나 바뀌었으면 401 */
async function updateUser(c: Ctx, id: string, uid: string, mutate: (u: UserRec) => void): Promise<UserRec> {
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

async function dropSessionBlobs(c: Ctx, hashes: string[]): Promise<void> {
  const st = c.store(STORES.sessions);
  await Promise.all(hashes.map((h) => st.delete(h)));
}

/** 새 세션 발급: 만료된 세션 정리, 10개 초과 시 가장 오래된 것부터 폐기 */
async function createSession(c: Ctx, user: UserRec): Promise<string> {
  const token = newToken();
  const h = sha256hex(token);
  const t = now();
  const entry: SessionEntry = { h, createdAt: t, expiresAt: t + SESSION.ttlMs, refreshedAt: t };
  const blob: SessionBlob = { id: user.id, uid: user.uid, createdAt: t, expiresAt: entry.expiresAt };
  const sessions = c.store(STORES.sessions);
  await sessions.setJSON(h, blob);
  let dropped: string[] = [];
  try {
    await updateUser(c, user.id, user.uid, (u) => {
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
  if (t - (entry!.refreshedAt ?? entry!.createdAt) >= SESSION.refreshAfterMs) {
    const expiresAt = t + SESSION.ttlMs;
    user = await updateUser(c, user.id, user.uid, (u) => {
      const e = u.sessions.find((x) => x?.h === hash);
      if (e) { e.expiresAt = expiresAt; e.refreshedAt = t; }
    });
    await sessions.setJSON(hash, { ...blob!, expiresAt });
  }
  return { id: user.id, uid: user.uid, hash, user };
}

const secretArg = (v: unknown): string => {
  if (typeof v !== 'string' || v.length > MAX_SECRET_CHARS) fail('bad_request', 400);
  return v as string;
};

// ── 핸들러 ──

export async function signup(c: Ctx): Promise<Response> {
  const body = await readJson(c.req, BODY_LIMIT.auth);
  await limitAuthByIp(c);
  const id = checkNewId(body.id);
  const password = checkNewPassword(body.password, id);
  await checkSignupByIp(c);
  const users = c.store(STORES.users);
  if (await users.getMetadata(id)) fail('id_taken', 409);
  const recoveryCode = newRecoveryCode();
  const [pw, rc] = await Promise.all([hashSecret(password), hashSecret(normalizeRecoveryCode(recoveryCode)!)]);
  const t = now();
  const user: UserRec = { v: 1, id, uid: newUid(), createdAt: t, updatedAt: t, pw, rc, sessions: [] };
  const res = await users.setJSON(id, user, { onlyIfNew: true });
  if (!res.modified) fail('id_taken', 409);
  await countSignup(c);
  const token = await createSession(c, user);
  return ok({ id, token, recoveryCode }, 201);
}

export async function login(c: Ctx): Promise<Response> {
  const body = await readJson(c.req, BODY_LIMIT.auth);
  await limitAuthByIp(c);
  if (typeof body.id !== 'string') fail('bad_request', 400);
  const password = secretArg(body.password);
  const id = normalizeId(body.id);
  if (!id) fail('invalid_credentials', 401); // 형식상 존재할 수 없는 아이디
  const hadFailures = await assertNotLocked(c, 'login', id!);
  const got = await getUser(c, id!);
  const good = got ? await verifySecret(password, got.user.pw) : (await burn(password), false);
  if (!good) {
    const lock = await recordFailure(c, 'login', id!);
    if (lock > 0) failRetry('locked', lock);
    fail('invalid_credentials', 401); // 아이디가 없을 때와 비밀번호가 틀릴 때 같은 응답
  }
  if (hadFailures) await clearFailures(c, 'login', id!);
  let user = got!.user;
  if (needsRehash(user.pw)) {
    try {
      const pw = await hashSecret(password);
      user = await updateUser(c, id!, user.uid, (u) => { u.pw = pw; });
    } catch (e) { if (e instanceof ApiError) throw e; /* 재해시는 다음 로그인에 다시 시도 */ }
  }
  const token = await createSession(c, user);
  return ok({ id: user.id, token });
}

export async function logout(c: Ctx): Promise<Response> {
  const a = await authenticate(c);
  await updateUser(c, a.id, a.uid, (u) => { u.sessions = u.sessions.filter((e) => e?.h !== a.hash); });
  await c.store(STORES.sessions).delete(a.hash);
  return ok();
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
  const hadFailures = await assertNotLocked(c, 'login', a.id);
  if (!(await verifySecret(oldPassword, a.user.pw))) {
    const lock = await recordFailure(c, 'login', a.id);
    if (lock > 0) failRetry('locked', lock);
    fail('wrong_password', 403);
  }
  if (newPassword.normalize('NFC') === oldPassword.normalize('NFC')) fail('same_password', 400);
  if (hadFailures) await clearFailures(c, 'login', a.id);
  const pw = await hashSecret(newPassword);
  let dropped: string[] = [];
  await updateUser(c, a.id, a.uid, (u) => {
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
  const id = normalizeId(body.id);
  if (!id) fail('invalid_recovery', 401);
  const newPassword = checkNewPassword(body.newPassword, id!);
  await assertNotLocked(c, 'recover', id!);
  const got = await getUser(c, id!);
  const code = normalizeRecoveryCode(codeInput);
  const good = got && code ? await verifySecret(code, got.user.rc) : (await burn(codeInput), false);
  if (!good) {
    const lock = await recordFailure(c, 'recover', id!);
    if (lock > 0) failRetry('locked', lock);
    fail('invalid_recovery', 401);
  }
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
  await Promise.all([clearFailures(c, 'recover', id!), clearFailures(c, 'login', id!)]);
  const token = await createSession(c, user!);
  return ok({ id: user!.id, recoveryCode, token });
}

export async function deleteAccount(c: Ctx): Promise<Response> {
  const a = await authenticate(c);
  const body = await readJson(c.req, BODY_LIMIT.auth);
  await limitAuthByIp(c);
  const password = secretArg(body.password);
  await assertNotLocked(c, 'login', a.id);
  if (!(await verifySecret(password, a.user.pw))) {
    const lock = await recordFailure(c, 'login', a.id);
    if (lock > 0) failRetry('locked', lock);
    fail('wrong_password', 403);
  }
  // 저장 데이터 → 세션 → 제한 기록 → 사용자 레코드 순서로 지운다 (중간에 실패해도 다시 탈퇴하면 이어서 지워진다)
  const saves = c.store(STORES.saves);
  const listed = await saves.list({ prefix: `${a.uid}/` });
  const keys = new Set([...listed.blobs.map((b) => b.key), ...SLOTS.map((s) => `${a.uid}/slot${s}`), `${a.uid}/meta`]);
  await Promise.all([...keys].map((k) => saves.delete(k)));
  await dropSessionBlobs(c, a.user.sessions.map((e) => e?.h).filter((h): h is string => typeof h === 'string'));
  await Promise.all([clearFailures(c, 'login', a.id), clearFailures(c, 'recover', a.id)]);
  await c.store(STORES.users).delete(a.id);
  return ok();
}
