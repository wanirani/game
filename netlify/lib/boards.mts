// 순위표 저장 (docs/specs/online.md §1·§2, docs/ONLINE.md). 계정 모듈을 import 하지 않는다 (accounts.mts 의 탈퇴가 이 파일을 부른다).
//  - bn-boards b/<보드 키>/e/<uid> : 계정의 최고 기록 (기준 데이터). 조건부 쓰기로 동시 제출에도 더 좋은 기록만 남는다
//  - bn-boards b/<보드 키>/i       : 순위 목록 = 상위 indexKeep 개 + 계정 수(total). 조건부 쓰기 + 재시도. 목록의 기록은 '더 좋은 쪽'만 받으므로
//                                    늦게 도착한 옛 갱신이 새 기록을 덮지 못한다. 다음 제출이 같은 계정의 기록으로 목록을 다시 맞춘다
//  - bn-boards u/<uid>/<보드 키>    : 이 계정이 기록을 둔 보드 (탈퇴·별명 바꾸기에서 찾는다). 기록보다 먼저 쓴다
//  - bn-ghosts <보드 키>/<uid>      : 고스트 (목록에서 g 표시가 있는 상위 ghostTop 위만 유효)
// 같은 순위 기준 값이면 먼저 세운 기록(d 가 작은 쪽)이 위다.
import { CAS_RETRIES, CLEANUP, ONLINE, STORES } from './config.mts';
import { COURSE_COUNT, DIFFICULTY_IDS, STAGE_LEVELS } from './gamedata.mts';
import { now } from './runtime.mts';
import type { Ctx, KV } from './runtime.mts';

const DAY = 86_400_000;
const KST = 9 * 3_600_000;

// ── 한국 날짜 ──
/** 한국 시간(UTC+9) 날짜 'YYYYMMDD' */
export function kstDay(t: number): string { return new Date(t + KST).toISOString().slice(0, 10).replace(/-/g, ''); }
/** 'YYYYMMDD' 한국 자정의 ms (달력에 없는 날이면 null) */
export function kstDayStart(day: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const u = Date.UTC(y, mo - 1, d);
  const back = new Date(u);
  if (y < 2000 || back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return u - KST;
}
/** 제출을 받는 가장 오래된 일일 도전 날짜 (오늘 포함 dailyKeepDays+1 일) */
export const oldestDaily = (t: number): string => kstDay(t - ONLINE.dailyKeepDays * DAY);

// ── 보드 ID ──
export type Kind = 'bossrush' | 'survival' | 'practice' | 'daily' | 'tower';
export interface Board { id: string; kind: Kind; key: string; date?: string }
const BOARD_RE = /^(?:bossrush:(0|[1-9]\d?):([a-z]{1,16})|survival:([a-z]{1,16})|practice:(s\d\d):([a-z]{1,16})|daily:(\d{8})|tower:([a-z]{1,16}))$/;
const diffOk = (d: string): boolean => DIFFICULTY_IDS.includes(d);

/**
 * 보드 ID 검사 → Board, 틀리면 null. 일일 도전: 미래 날짜는 안 되고, mode 'write'(런 시작·제출)는 dailyKeepDays 일보다 오래된 날도 안 된다.
 * mode 'any' 는 날짜 범위를 보지 않는다 (저장소 키에서 되돌릴 때).
 * 저장소 키에는 ':' 대신 '.' 를 쓴다 (주소·파일 경로에 안전하게).
 */
export function parseBoard(raw: unknown, t: number, mode: 'read' | 'write' | 'any'): Board | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const m = BOARD_RE.exec(raw);
  if (!m) return null;
  let kind: Kind;
  let date: string | undefined;
  if (m[1] !== undefined) {
    if (Number(m[1]) >= COURSE_COUNT || !diffOk(m[2])) return null;
    kind = 'bossrush';
  } else if (m[3] !== undefined) {
    if (!diffOk(m[3])) return null;
    kind = 'survival';
  } else if (m[4] !== undefined) {
    if (!Object.hasOwn(STAGE_LEVELS, m[4]) || !diffOk(m[5])) return null;
    kind = 'practice';
  } else if (m[7] !== undefined) {
    if (!diffOk(m[7])) return null;
    kind = 'tower';
  } else {
    date = m[6];
    if (kstDayStart(date) === null || (mode !== 'any' && date > kstDay(t))) return null;
    if (mode === 'write' && date < oldestDaily(t)) return null;
    kind = 'daily';
  }
  return { id: raw, kind, key: raw.replace(/:/g, '.'), date };
}

// ── 순위 ──
/** 순위 목록 항목 (서버 안에서만; 공개할 때는 uid 를 빼고 pubEntry 로 바꾼다). f = 무한의 탑 돌파한 층, ti = 이명 id (gamedata.mts TITLE_IDS 안의 것만) */
export interface Entry { u: string; n: string; t: number; s: number; w?: number; f?: number; h: string; c: string; l: number; d: number; g?: boolean; ti?: string }
/** 계정의 최고 기록 (b/<보드 키>/e/<uid>). id = 로그인 아이디 (운영 도구용, 공개하지 않는다), rn = 이 기록을 세운 런 nonce, gr = 등급, dt = 죽은 수 */
export interface Rec { v: 1; id: string; uid: string; t: number; s: number; w?: number; f?: number; h: string; c: string; l: number; gr?: string; dt?: number; d: number; rn: string }
interface Index { v: 1; board: string; total: number; list: Entry[] }
type Score = Pick<Entry, 't' | 's' | 'w' | 'f'>;

/** 순위 기준만 비교 (음수 = a 가 위). 보스 러시·일일: time ↑ / 서바이벌: wave ↓ → score ↓ / 연습: time ↑ → score ↓ / 무한의 탑: floor ↓ → time ↑ */
export function cmpScore(kind: Kind, a: Score, b: Score): number {
  if (kind === 'survival') return ((b.w ?? 0) - (a.w ?? 0)) || (b.s - a.s);
  if (kind === 'tower') return ((b.f ?? 0) - (a.f ?? 0)) || (a.t - b.t);
  if (kind === 'practice') return (a.t - b.t) || (b.s - a.s);
  return a.t - b.t;
}
/** 순위 목록 정렬: 순위 기준 → 먼저 세운 기록 → uid (항상 같은 순서) */
export function cmpEntry(kind: Kind, a: Entry, b: Entry): number {
  return cmpScore(kind, a, b) || (a.d - b.d) || (a.u < b.u ? -1 : a.u > b.u ? 1 : 0);
}
const better = (kind: Kind, a: Score, b: Score): boolean => cmpScore(kind, a, b) < 0;

/** 공개 항목 (§2.3) */
export function pubEntry(kind: Kind, e: Pick<Entry, 'n' | 't' | 's' | 'w' | 'f' | 'h' | 'c' | 'l' | 'd' | 'g' | 'ti'>, rank: number | null): Record<string, unknown> {
  const out: Record<string, unknown> = { rank, nick: e.n, time: e.t, score: e.s };
  if (kind === 'survival') out.wave = e.w ?? 0;
  if (kind === 'tower') out.floor = e.f ?? 0;
  Object.assign(out, { hero: e.h, cls: e.c, level: e.l, date: e.d, ghost: !!e.g });
  if (e.ti) out.title = e.ti;   // 이명 id (achievements.md §8 — 화면이 클라이언트 표로 이름에 옮긴다)
  return out;
}

const indexKey = (b: string): string => `b/${b}/i`;
const recKey = (b: string, uid: string): string => `b/${b}/e/${uid}`;
const markKey = (uid: string, b: string): string => `u/${uid}/${b}`;
const ghostKey = (b: string, uid: string): string => `${b}/${uid}`;

const backoff = (i: number): Promise<void> | undefined => (i > 0 ? new Promise((r) => setTimeout(r, Math.random() * 8 * i)) : undefined);

function asIndex(data: unknown, board: string): Index {
  const d = data as Partial<Index> | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.list)) return { v: 1, board, total: 0, list: [] };
  const list = d.list.filter((e) => e && typeof e === 'object' && typeof e.u === 'string');
  return { v: 1, board, total: Number.isSafeInteger(d.total) && (d.total as number) >= 0 ? (d.total as number) : list.length, list };
}

export async function readIndex(c: Ctx, b: Board): Promise<{ idx: Index; etag?: string; exists: boolean }> {
  const r = await c.store(STORES.boards).getWithMetadata(indexKey(b.key), { type: 'json' });
  return { idx: asIndex(r?.data ?? null, b.id), etag: r?.etag, exists: !!r };
}

/** 순위 목록 조건부 고치기. mutate 가 false 를 돌려주면 쓰지 않는다. 경합이 계속되면 예외 (500) */
async function editIndex<T>(c: Ctx, b: Board, mutate: (idx: Index) => { changed: boolean; out: T }): Promise<T> {
  const st = c.store(STORES.boards);
  for (let i = 0; i < ONLINE.indexRetries; i++) {
    await backoff(i);
    const { idx, etag, exists } = await readIndex(c, b);
    const { changed, out } = mutate(idx);
    if (!changed) return out;
    const cond = exists ? (etag ? { onlyIfMatch: etag } : {}) : { onlyIfNew: true };
    const res = await st.setJSON(indexKey(b.key), idx, cond);
    if (res.modified) return out;
  }
  throw new Error('board index contention');
}

export interface Placed { rank: number | null; total: number; ghost: boolean; evicted: string[] }

/**
 * 계정의 최고 기록을 순위 목록에 넣는다 (목록에 있는 것보다 좋을 때만 바꾼다 — 별명은 늘 새로).
 * isNew: 이 계정의 첫 기록 (계정 수 +1). ghost: 이 기록의 고스트를 막 저장함 → ghostTop 위 안이면 표시.
 * evicted: ghostTop 밖으로 밀려 고스트 표시를 잃은 계정 (그 고스트를 지운다)
 */
export async function placeEntry(c: Ctx, b: Board, e: Entry, isNew: boolean, ghost: boolean): Promise<Placed> {
  return editIndex(c, b, (idx) => {
    let changed = false;
    const list = idx.list;
    const pos = list.findIndex((x) => x.u === e.u);
    const cur = pos >= 0 ? list[pos] : null;
    let mine = false; // 목록의 내 항목이 이번 기록인가
    if (!cur || better(b.kind, e, cur)) {
      if (pos >= 0) list.splice(pos, 1);
      list.push({ ...e, g: false });
      changed = mine = true;
    } else {
      mine = cur.d === e.d && cur.t === e.t && cur.s === e.s;
      if (cur.n !== e.n) { cur.n = e.n; changed = true; }
      // 이명도 별명처럼 늘 새로 (기록이 나아지지 않아도 — 제출에 없으면 뺀다)
      if ((cur.ti ?? null) !== (e.ti ?? null)) { if (e.ti) cur.ti = e.ti; else delete cur.ti; changed = true; }
    }
    list.sort((x, y) => cmpEntry(b.kind, x, y));
    const evicted: string[] = [];
    list.forEach((x, i) => {
      if (i >= ONLINE.ghostTop && x.g) { x.g = false; changed = true; if (x.u !== e.u) evicted.push(x.u); }
    });
    const at = list.findIndex((x) => x.u === e.u);
    let hasGhost = at >= 0 && !!list[at].g;
    if (ghost && mine && at >= 0 && at < ONLINE.ghostTop && !list[at].g) { list[at].g = true; hasGhost = changed = true; }
    if (list.length > ONLINE.indexKeep) { list.length = ONLINE.indexKeep; changed = true; }
    const total = Math.max(idx.total + (isNew ? 1 : 0), list.length);
    if (total !== idx.total) { idx.total = total; changed = true; }
    const rank = at >= 0 && at < ONLINE.rankTop && at < list.length ? at + 1 : null;
    return { changed, out: { rank, total, ghost: hasGhost, evicted } };
  });
}

/** 순위 목록에서 이 계정을 뺀다 (기록을 지웠으면 계정 수 −1) */
export async function dropEntry(c: Ctx, b: Board, uid: string, hadRecord: boolean): Promise<void> {
  await editIndex(c, b, (idx) => {
    const before = idx.list.length;
    idx.list = idx.list.filter((x) => x.u !== uid);
    const total = Math.max(idx.list.length, idx.total - (hadRecord ? 1 : 0));
    const changed = before !== idx.list.length || total !== idx.total;
    idx.total = total;
    return { changed, out: undefined };
  });
}

/** 순위 목록의 별명만 바꾼다 (별명을 바꾼 계정) */
async function renameEntry(c: Ctx, b: Board, uid: string, nick: string): Promise<void> {
  await editIndex(c, b, (idx) => {
    const x = idx.list.find((y) => y.u === uid);
    if (!x || x.n === nick) return { changed: false, out: undefined };
    x.n = nick;
    return { changed: true, out: undefined };
  });
}

// ── 계정의 기록 ──
export async function readRecord(c: Ctx, b: Board, uid: string): Promise<Rec | null> {
  const r = await c.store(STORES.boards).get(recKey(b.key, uid), { type: 'json' });
  return r && typeof r === 'object' && r.uid === uid && Number.isFinite(r.t) ? (r as Rec) : null;
}

export interface Saved { best: boolean; rec: Rec; isNew: boolean; replay: boolean }

/**
 * 최고 기록 갱신 (조건부 쓰기): 지금 기록보다 좋을 때만 쓴다. 같은 런(rn)이 이미 세운 기록이면 replay
 * (서버 오류 뒤 같은 런으로 다시 보낸 경우 — best 로 답한다). 쓰기 전에 보드 표시(u/<uid>/…)를 먼저 남긴다
 */
export async function saveBest(c: Ctx, b: Board, rec: Rec): Promise<Saved> {
  const st = c.store(STORES.boards);
  await st.setJSON(markKey(rec.uid, b.key), { at: rec.d });
  const key = recKey(b.key, rec.uid);
  for (let i = 0; i < CAS_RETRIES * 2; i++) {
    await backoff(i);
    const r = await st.getWithMetadata(key, { type: 'json' });
    const cur = r?.data && typeof r.data === 'object' && Number.isFinite(r.data.t) ? (r.data as Rec) : null;
    if (cur && cur.rn === rec.rn) return { best: true, rec: cur, isNew: false, replay: true };
    if (cur && !better(b.kind, rec, cur)) return { best: false, rec: cur, isNew: false, replay: false };
    const cond = r ? (r.etag ? { onlyIfMatch: r.etag } : {}) : { onlyIfNew: true };
    const res = await st.setJSON(key, rec, cond);
    if (res.modified) return { best: true, rec, isNew: !r, replay: false };
  }
  throw new Error('record contention');
}

export const entryOf = (r: Rec, nick: string, ti?: string): Entry => {
  const e: Entry = { u: r.uid, n: nick, t: r.t, s: r.s, h: r.h, c: r.c, l: r.l, d: r.d };
  if (r.w !== undefined) e.w = r.w;
  if (r.f !== undefined) e.f = r.f;
  if (ti) e.ti = ti;   // 이명 (online.mts finishRun 이 TITLE_IDS 로 거른 것)
  return e;
};

// ── 고스트 ──
export async function putGhost(c: Ctx, b: Board, uid: string, g: { data: string; t: number; h: string; c: string }): Promise<void> {
  const at = now();
  await c.store(STORES.ghosts).setJSON(ghostKey(b.key, uid), { v: 1, ...g, at }, { metadata: { at } });
}
export async function readGhost(c: Ctx, b: Board, uid: string): Promise<{ data: string; t: number } | null> {
  const g = await c.store(STORES.ghosts).get(ghostKey(b.key, uid), { type: 'json' });
  return g && typeof g === 'object' && typeof g.data === 'string' ? g : null;
}
export async function deleteGhosts(c: Ctx, b: Board, uids: string[]): Promise<void> {
  const st = c.store(STORES.ghosts);
  await Promise.all(uids.map((u) => st.delete(ghostKey(b.key, u))));
}

// ── 계정 단위 (탈퇴·별명·운영) ──
/** 보드 키 → Board (저장소 키에서 되돌릴 때; 날짜 제한 없이) */
export function boardOfKey(key: string): Board | null {
  return parseBoard(key.replace(/\./g, ':'), 0, 'any');
}

/** 이 계정이 기록을 둔 보드들 */
export async function userBoards(c: Ctx, uid: string): Promise<Board[]> {
  const { blobs } = await c.store(STORES.boards).list({ prefix: `u/${uid}/` });
  return blobs.map((x) => boardOfKey(x.key.slice(`u/${uid}/`.length))).filter((x): x is Board => !!x);
}

/** 한 보드에서 이 계정의 기록·고스트·순위 항목·표시를 지운다 */
export async function removeUserFromBoard(c: Ctx, b: Board, uid: string): Promise<void> {
  const st = c.store(STORES.boards);
  const had = !!(await st.getMetadata(recKey(b.key, uid)));
  await Promise.all([st.delete(recKey(b.key, uid)), deleteGhosts(c, b, [uid])]);
  await dropEntry(c, b, uid, had);
  await st.delete(markKey(uid, b.key));
}

const mapLimit = async <T,>(xs: T[], n: number, fn: (x: T) => Promise<unknown>): Promise<void> => {
  for (let i = 0; i < xs.length; i += n) await Promise.all(xs.slice(i, i + n).map(fn));
};

/** 탈퇴: 이 계정의 모든 순위 기록·고스트 (개인정보 — 남기지 않는다) */
export async function purgeUserBoards(c: Ctx, uid: string): Promise<number> {
  const boards = await userBoards(c, uid);
  await mapLimit(boards, 8, (b) => removeUserFromBoard(c, b, uid));
  return boards.length;
}

/** 별명을 바꾼 계정: 기록을 둔 보드의 순위 목록 별명을 고친다 */
export async function renameOnBoards(c: Ctx, uid: string, nick: string): Promise<void> {
  const boards = await userBoards(c, uid);
  await mapLimit(boards, 8, (b) => renameEntry(c, b, uid, nick));
}

// ── 매일 정리 (cleanup.mts) ──
/** 일일 도전 보존 기간이 지난 보드(순위 목록·기록·표시·고스트), 순위 목록에 표시가 없는 고스트(1시간 지난 것) */
export async function sweepBoards(c: Ctx, t: number): Promise<{ seen: number; deleted: number }> {
  const boards = c.store(STORES.boards);
  const ghosts = c.store(STORES.ghosts);
  const cutoff = kstDay(t - (ONLINE.dailyKeepDays + 1) * DAY); // 이 날보다 앞선 날은 지운다 (제출 마감 하루 뒤)
  const old: string[][] = []; // 기록과 그 표시는 함께 지운다 (한 번에 다 못 지워도 짝이 갈리지 않게)
  let seen = 0;
  const { blobs } = await boards.list({ prefix: 'b/daily.' });
  for (const x of blobs) {
    seen++;
    const m = /^b\/daily\.(\d{8})\/(?:i|e\/([^/]+))$/.exec(x.key);
    if (m && m[1] >= cutoff) continue;
    old.push(m?.[2] ? [x.key, markKey(m[2], `daily.${m[1]}`)] : [x.key]);
  }
  const oldGhosts: string[] = [];
  const live: Map<string, string[]> = new Map(); // 보드 키 → 고스트 uid
  for (const x of (await ghosts.list()).blobs) {
    seen++;
    const m = /^([^/]+)\/([^/]+)$/.exec(x.key);
    const d = m ? /^daily\.(\d{8})$/.exec(m[1]) : null;
    if (!m || (d && d[1] < cutoff)) { oldGhosts.push(x.key); continue; }
    live.set(m[1], [...(live.get(m[1]) ?? []), m[2]]);
  }
  // 순위 목록에 g 표시가 없는 고스트 (밀려난 뒤 지우기에 실패했거나 저장 중 실패) — 막 저장 중인 것은 건드리지 않는다
  for (const [key, uids] of live) {
    const b = boardOfKey(key);
    if (!b) { oldGhosts.push(...uids.map((u) => ghostKey(key, u))); continue; }
    const { idx } = await readIndex(c, b);
    const marked = new Set(idx.list.filter((e) => e.g).map((e) => e.u));
    for (const u of uids) {
      if (marked.has(u)) continue;
      const md = await ghosts.getMetadata(ghostKey(key, u));
      const at = Number(md?.metadata?.at);
      if (!Number.isFinite(at) || t - at > ONLINE.orphanGhostMs) oldGhosts.push(ghostKey(key, u));
    }
  }
  const dropB: string[] = [];
  for (const g of old) { if (dropB.length >= CLEANUP.maxPerRun) break; dropB.push(...g); }
  const dropG = oldGhosts.slice(0, CLEANUP.maxPerRun);
  await mapLimit(dropB, CLEANUP.concurrency, (k) => boards.delete(k));
  await mapLimit(dropG, CLEANUP.concurrency, (k) => ghosts.delete(k));
  return { seen, deleted: dropB.length + dropG.length };
}
