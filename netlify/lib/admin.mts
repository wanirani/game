// 운영자 도구용 함수 (HTTP 로는 노출되지 않는다 — tools/accounts/admin.mjs 가 Netlify API 토큰으로 직접 Blobs 에 접근해 호출).
import { randomInt } from 'node:crypto';
import { SLOTS, STORES } from './config.mts';
import { hashSecret, newRecoveryCode, normalizeRecoveryCode } from './crypto.mts';
import { dropSessionBlobs, getUser, purgeAccount, updateUser } from './accounts.mts';
import { clearLocks, lockStatus } from './ratelimit.mts';
import { now } from './runtime.mts';
import type { Ctx } from './runtime.mts';
import { normalizeId } from './validate.mts';

async function must(c: Ctx, rawId: string) {
  const id = normalizeId(rawId);
  if (!id) throw new Error(`아이디 형식이 아닙니다: ${rawId}`);
  const got = await getUser(c, id);
  if (!got) throw new Error(`계정이 없습니다: ${id}`);
  return got.user;
}

/** 계정 상태 요약 (해시·토큰은 보여 주지 않는다) */
export async function adminShow(c: Ctx, rawId: string): Promise<Record<string, unknown>> {
  const u = await must(c, rawId);
  const t = now();
  const saves = c.store(STORES.saves);
  // 아이디 전체 실패 수·잠금 + 잠긴 망 수 (망은 해시라 어느 IP 인지는 알 수 없다)
  const lock = async (kind: 'login' | 'recover') => {
    const s = await lockStatus(c, kind, u.id);
    return { failures: s.failures, lockedUntil: s.lockedUntil ? new Date(s.lockedUntil).toISOString() : null, lockedNetworks: s.lockedNetworks };
  };
  const slots = await Promise.all(SLOTS.map(async (s) => {
    const m = await saves.getMetadata(`${u.uid}/slot${s}`);
    return { slot: s, rev: m?.metadata?.rev ?? 0, deleted: m?.metadata?.deleted === true, summary: m?.metadata?.summary ?? null };
  }));
  const meta = await saves.getMetadata(`${u.uid}/meta`);
  return {
    id: u.id,
    createdAt: new Date(u.createdAt).toISOString(),
    updatedAt: new Date(u.updatedAt).toISOString(),
    sessions: u.sessions.length,
    activeSessions: u.sessions.filter((e) => e.expiresAt > t).length,
    loginLock: await lock('login'),
    recoverLock: await lock('recover'),
    slots,
    metaRev: meta?.metadata?.rev ?? 0,
  };
}

/** 로그인·복구 잠금 해제 */
export async function adminUnlock(c: Ctx, rawId: string): Promise<void> {
  const u = await must(c, rawId);
  await Promise.all([clearLocks(c, 'login', u.id), clearLocks(c, 'recover', u.id)]);
}

/** 모든 기기 로그아웃 */
export async function adminRevokeSessions(c: Ctx, rawId: string): Promise<number> {
  const u = await must(c, rawId);
  let dropped: string[] = [];
  await updateUser(c, u.id, u.uid, (x) => { dropped = x.sessions.map((e) => e.h); x.sessions = []; });
  await dropSessionBlobs(c, dropped);
  return dropped.length;
}

const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** 임시 비밀번호 + 새 복구 코드 발급 (모든 세션 폐기, 잠금 해제). 본인 확인 후 사용자에게 한 번만 전달한다 */
export async function adminResetPassword(c: Ctx, rawId: string): Promise<{ id: string; tempPassword: string; recoveryCode: string }> {
  const u = await must(c, rawId);
  let tempPassword = '';
  for (let i = 0; i < 12; i++) tempPassword += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  const recoveryCode = newRecoveryCode();
  const [pw, rc] = await Promise.all([hashSecret(tempPassword), hashSecret(normalizeRecoveryCode(recoveryCode)!)]);
  let dropped: string[] = [];
  await updateUser(c, u.id, u.uid, (x) => { dropped = x.sessions.map((e) => e.h); x.sessions = []; x.pw = pw; x.rc = rc; });
  await dropSessionBlobs(c, dropped);
  await Promise.all([clearLocks(c, 'login', u.id), clearLocks(c, 'recover', u.id)]);
  return { id: u.id, tempPassword, recoveryCode };
}

/** 계정과 모든 저장 데이터 삭제 */
export async function adminDelete(c: Ctx, rawId: string): Promise<void> {
  const u = await must(c, rawId);
  await purgeAccount(c, u);
}
