// 운영자 도구용 함수 (HTTP 로는 노출되지 않는다 — tools/accounts/admin.mjs 가 Netlify API 토큰으로 직접 Blobs 에 접근해 호출).
import { randomInt } from 'node:crypto';
import { SLOTS, STORES } from './config.mts';
import { hashSecret, newRecoveryCode, normalizeRecoveryCode } from './crypto.mts';
import { dropSessionBlobs, getUser, purgeAccount, updateUser } from './accounts.mts';
import { clearLocks, lockStatus } from './ratelimit.mts';
import { now } from './runtime.mts';
import type { Ctx } from './runtime.mts';
import { normalizeId } from './validate.mts';
import { parseBoard, pubEntry, readIndex, readRecord, removeUserFromBoard, userBoards } from './boards.mts';
import { nickKey } from './nick.mts';
import { setNick } from './online.mts';

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
    return { failures: s.failures, lockedUntil: s.lockedUntil ? new Date(s.lockedUntil).toISOString() : null, lockedNetworks: s.lockedNetworks, lockedWideNetworks: s.lockedWideNetworks, trustedNetworks: s.trustedNetworks };
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
    nick: u.nick ?? null,
    boards: (await userBoards(c, u.uid)).map((b) => b.id),
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

// ── 온라인 순위표 (docs/ONLINE.md §운영) ──
const boardOf = (raw: string) => {
  const b = parseBoard(raw, now(), 'read');
  if (!b) throw new Error(`보드 ID 형식이 아닙니다: ${raw} (예: practice:s01:normal, bossrush:0:hard, survival:normal, daily:20261005)`);
  return b;
};

/** 순위표 보기 (운영자만 로그인 아이디를 함께 본다) */
export async function adminBoard(c: Ctx, rawBoard: string, limit = 100): Promise<Record<string, unknown>> {
  const b = boardOf(rawBoard);
  const { idx } = await readIndex(c, b);
  const list = idx.list.slice(0, Math.max(1, Math.min(limit, idx.list.length)));
  const entries = await Promise.all(list.map(async (e, i) => {
    const rec = await readRecord(c, b, e.u);
    return { ...pubEntry(b.kind, e, i + 1), id: rec?.id ?? null, date: new Date(e.d).toISOString() };
  }));
  return { board: b.id, total: idx.total, entries };
}

/** 순위표에서 한 계정의 기록·고스트를 지운다. who = 순위(숫자) 또는 별명 */
export async function adminRemoveEntry(c: Ctx, rawBoard: string, who: string): Promise<{ nick: string; id: string | null }> {
  const b = boardOf(rawBoard);
  const { idx } = await readIndex(c, b);
  const e = /^\d{1,3}$/.test(who) ? idx.list[Number(who) - 1] : idx.list.find((x) => x.n.toLowerCase() === who.normalize('NFC').toLowerCase());
  if (!e) throw new Error(`순위표에 없습니다: ${who}`);
  const rec = await readRecord(c, b, e.u);
  await removeUserFromBoard(c, b, e.u);
  return { nick: e.n, id: rec?.id ?? null };
}

/** 별명 바꾸기. who = 지금 별명 또는 로그인 아이디, next 를 빼면 자동 별명 ('헌터#1234') */
export async function adminRenameNick(c: Ctx, who: string, next?: string): Promise<{ id: string; from: string | null; to: string }> {
  const rec = await c.store(STORES.nicks).get(nickKey(who), { type: 'json' }).catch(() => null);
  const u = await must(c, typeof rec?.id === 'string' ? rec.id : who);
  const from = typeof u.nick === 'string' ? u.nick : null;
  const to = await setNick(c, u.id, u.uid, from, next === undefined ? null : next);
  return { id: u.id, from, to };
}
