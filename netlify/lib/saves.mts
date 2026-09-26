// 클라우드 저장: 슬롯 1~3 과 전역 메타. rev(정수)로 낙관적 동시성 제어를 한다.
//  - 저장값: {rev, savedAt, data}  (삭제된 슬롯은 {rev, savedAt, deleted:true} 묘비 — rev 가 되돌아가지 않게)
//  - Blobs 메타데이터: {rev, savedAt, summary?, deleted?}  (목록은 본문을 받지 않고 메타데이터만 읽는다)
import { BODY_LIMIT, CAS_RETRIES, DATA_MAX_DEPTH, SLOTS, STORES } from './config.mts';
import { fail, ok, readJson } from './http.mts';
import type { Extra } from './http.mts';
import { accountAlive, authenticate, unauthorized } from './accounts.mts';
import type { Auth } from './accounts.mts';
import { now } from './runtime.mts';
import type { Ctx, KV } from './runtime.mts';
import { isValidMeta, isValidSave, readBaseRev, readForce, safeTree, saveSummary } from './validate.mts';

const slotKey = (uid: string, slot: number): string => `${uid}/slot${slot}`;
const metaKey = (uid: string): string => `${uid}/meta`;

interface DocState { rev: number; savedAt: number | null; empty: boolean; summary: unknown; etag?: string; exists: boolean }

function stateOf(r: { etag?: string; metadata: Record<string, unknown> } | null): DocState {
  if (!r) return { rev: 0, savedAt: null, empty: true, summary: null, exists: false };
  const md = r.metadata ?? {};
  const rev = Number.isSafeInteger(md.rev) && (md.rev as number) >= 0 ? (md.rev as number) : 0;
  const deleted = md.deleted === true;
  return {
    rev,
    savedAt: !deleted && typeof md.savedAt === 'number' ? md.savedAt : null,
    empty: deleted,
    summary: deleted ? null : (md.summary ?? null),
    etag: r.etag,
    exists: true,
  };
}

/** 슬롯 번호 경로 인자 → 1|2|3 (그 밖은 400) */
export function parseSlot(raw: string): number {
  if (!/^[123]$/.test(raw)) fail('invalid_slot', 400);
  return Number(raw);
}

/**
 * rev 확인 후 조건부 쓰기.
 * baseRev: null = 확인 안 함(덮어쓰기) / 숫자 = 서버 rev 와 같아야 함 (단, 비어 있는 슬롯에는 0 도 허용)
 */
async function putDoc(
  st: KV, key: string, value: Record<string, unknown>, baseRev: number | null, force: boolean,
  extraMeta: Record<string, unknown>, conflictInfo: (s: DocState) => Promise<Extra>,
): Promise<{ rev: number; savedAt: number }> {
  let last: DocState | null = null;
  for (let i = 0; i < CAS_RETRIES; i++) {
    const cur = stateOf(await st.getMetadata(key));
    last = cur;
    if (!force && baseRev !== null && baseRev !== cur.rev && !(cur.empty && baseRev === 0)) {
      fail('conflict', 409, { server: await conflictInfo(cur) });
    }
    const rev = cur.rev + 1;
    const savedAt = now();
    const cond = cur.exists ? (cur.etag ? { onlyIfMatch: cur.etag } : {}) : { onlyIfNew: true };
    const res = await st.setJSON(key, { rev, savedAt, ...value }, { metadata: { rev, savedAt, ...extraMeta }, ...cond });
    if (res.modified) return { rev, savedAt };
  }
  fail('conflict', 409, { server: await conflictInfo(last!) });
}

/**
 * 쓰기 뒤 계정이 아직 있는지 확인: 인증을 통과한 뒤 쓰기 전에 탈퇴가 끝났다면 방금 쓴 것을 지우고 401.
 * (탈퇴 쪽은 사용자 레코드를 지운 뒤 한 번 더 쓸므로, 두 순서 모두에서 탈퇴한 계정의 데이터가 남지 않는다)
 */
async function ensureAlive(c: Ctx, a: Auth, st: KV, key: string): Promise<void> {
  if (await accountAlive(c, a.id, a.uid)) return;
  await st.delete(key);
  unauthorized();
}

// ── 슬롯 ──

export async function listSaves(c: Ctx): Promise<Response> {
  const a = await authenticate(c);
  const st = c.store(STORES.saves);
  const [metas, meta] = await Promise.all([
    Promise.all(SLOTS.map((s) => st.getMetadata(slotKey(a.uid, s)))),
    st.getMetadata(metaKey(a.uid)),
  ]);
  const slots = SLOTS.map((slot, i) => {
    const s = stateOf(metas[i]);
    return { slot, empty: s.empty, rev: s.rev, savedAt: s.savedAt, summary: s.summary };
  });
  const m = stateOf(meta);
  return ok({ slots, meta: { rev: m.rev, savedAt: m.savedAt, empty: m.empty } });
}

export async function getSlot(c: Ctx, slot: number): Promise<Response> {
  const a = await authenticate(c);
  const r = await c.store(STORES.saves).getWithMetadata(slotKey(a.uid, slot), { type: 'json' });
  const s = stateOf(r);
  const data = r?.data?.data;
  if (s.empty || data === undefined) fail('slot_empty', 404, { slot, rev: s.rev });
  return ok({ slot, rev: s.rev, savedAt: s.savedAt, data });
}

export async function putSlot(c: Ctx, slot: number): Promise<Response> {
  const a = await authenticate(c);
  const body = await readJson(c.req, BODY_LIMIT.save);
  const baseRev = readBaseRev(body.baseRev);
  const force = readForce(body.force);
  if (!safeTree(body.data, DATA_MAX_DEPTH) || !isValidSave(body.data)) fail('invalid_save', 422);
  const summary = saveSummary(body.data);
  const st = c.store(STORES.saves);
  const key = slotKey(a.uid, slot);
  const r = await putDoc(st, key, { data: body.data }, baseRev, force, { summary },
    async (s) => ({ rev: s.rev, savedAt: s.savedAt, empty: s.empty, summary: s.summary }));
  await ensureAlive(c, a, st, key);
  return ok({ slot, rev: r.rev, savedAt: r.savedAt });
}

export async function deleteSlot(c: Ctx, slot: number): Promise<Response> {
  const a = await authenticate(c);
  const st = c.store(STORES.saves);
  const key = slotKey(a.uid, slot);
  for (let i = 0; i < CAS_RETRIES; i++) {
    const cur = stateOf(await st.getMetadata(key));
    if (!cur.exists || cur.empty) return ok({ slot, rev: cur.rev });
    const rev = cur.rev + 1;
    const savedAt = now();
    const res = await st.setJSON(key, { rev, savedAt, deleted: true }, { metadata: { rev, savedAt, deleted: true }, ...(cur.etag ? { onlyIfMatch: cur.etag } : {}) });
    if (res.modified) { await ensureAlive(c, a, st, key); return ok({ slot, rev }); }
  }
  throw new Error('slot delete contention');
}

// ── 전역 메타 ──

export async function getMeta(c: Ctx): Promise<Response> {
  const a = await authenticate(c);
  const r = await c.store(STORES.saves).getWithMetadata(metaKey(a.uid), { type: 'json' });
  const s = stateOf(r);
  return ok({ rev: s.rev, savedAt: s.savedAt, data: s.empty ? null : (r?.data?.data ?? null) });
}

export async function putMeta(c: Ctx): Promise<Response> {
  const a = await authenticate(c);
  const body = await readJson(c.req, BODY_LIMIT.meta);
  const baseRev = readBaseRev(body.baseRev);
  const force = readForce(body.force);
  if (!safeTree(body.data, DATA_MAX_DEPTH) || !isValidMeta(body.data)) fail('invalid_meta', 422);
  const st = c.store(STORES.saves);
  const key = metaKey(a.uid);
  const r = await putDoc(st, key, { data: body.data }, baseRev, force, {}, async () => {
    // 메타는 병합(해금·엔딩 합집합, 최고 기록 최댓값)이 자연스러우므로 서버 데이터를 함께 돌려준다
    const g = await st.getWithMetadata(key, { type: 'json' });
    const s = stateOf(g);
    return { rev: s.rev, savedAt: s.savedAt, data: s.empty ? null : (g?.data?.data ?? null) };
  });
  await ensureAlive(c, a, st, key);
  return ok({ rev: r.rev, savedAt: r.savedAt });
}
