// 온라인 기록 API (docs/specs/online.md — 계약, docs/ONLINE.md — 운영):
//   POST /api/runs · POST /api/runs/finish · GET /api/boards/<board> · GET /api/ghosts/<board>/<rank> · GET /api/daily · PUT /api/profile/nick
// 저장 구조·순위는 boards.mts, 런 토큰·일일 도전은 runs.mts, 별명 검사·자리는 nick.mts.
import { BODY_LIMIT, CHARACTER_IDS, ONLINE, STORES } from './config.mts';
import { ApiError, fail, isObj, json, ok, readJson } from './http.mts';
import { accountAlive, authenticate, unauthorized, updateUser } from './accounts.mts';
import type { Auth } from './accounts.mts';
import { CLASS_INFO, TOWER_RULES } from './gamedata.mts';
import { limitAccount } from './ratelimit.mts';
import { now } from './runtime.mts';
import type { Ctx } from './runtime.mts';
import {
  entryOf, deleteGhosts, kstDay, kstDayStart, parseBoard, placeEntry, pubEntry, putGhost, readGhost, readIndex, readRecord,
  removeUserFromBoard, renameOnBoards, saveBest,
} from './boards.mts';
import type { Board, Rec } from './boards.mts';
import { checkNick, nickCandidates, nickKey, releaseNick, reserveNick, STORED_NICK_RE } from './nick.mts';
import { dailyFor, openRun, randomSeed, sameAcct, signRun } from './runs.mts';

const MIN = 60_000;
const DAY = 86_400_000;

/** 경로 조각 → 문자열 (퍼센트 인코딩 허용, 틀리면 null) */
function decodeParam(raw: string): string | null {
  try { return decodeURIComponent(raw); } catch { return null; }
}
const boardParam = (raw: string, t: number): Board => parseBoard(decodeParam(raw), t, 'read') ?? fail('invalid_board', 400);

// ── 별명 ──
/** 별명 정하기 (want = null 이면 자동 '헌터#1234'). 자리를 잡고 사용자 레코드에 넣은 뒤 예전 별명 자리를 돌려준다 → 정해진 별명 */
async function claimNick(c: Ctx, id: string, uid: string, want: string | null, current: string | null): Promise<string> {
  for (const cand of nickCandidates(want, current)) {
    if (!(await reserveNick(c, cand, { uid, id }))) continue;
    let old: string | null = null;
    try {
      await updateUser(c, id, uid, (u) => { old = typeof u.nick === 'string' ? u.nick : null; u.nick = cand; });
    } catch (e) {
      await releaseNick(c, cand, uid).catch(() => {});
      throw e;
    }
    if (old && nickKey(old) !== nickKey(cand)) await releaseNick(c, old, uid).catch(() => {});
    return cand;
  }
  throw new Error('nick space exhausted');
}

/** 별명이 없으면 자동으로 만든다 (첫 제출) */
async function ensureNick(c: Ctx, a: Auth): Promise<string> {
  const n = a.user.nick;
  if (typeof n === 'string' && STORED_NICK_RE.test(n)) return n;
  return claimNick(c, a.id, a.uid, null, null);
}

/** 별명 바꾸기 (운영 도구도 쓴다): want 를 검사해 자리를 잡고, 순위 목록의 별명도 고친다 */
export async function setNick(c: Ctx, id: string, uid: string, current: string | null, raw: unknown): Promise<string> {
  const want = raw === null ? null : checkNick(raw, id);
  let nick: string;
  if (want && current && nickKey(want) === nickKey(current)) {
    // 대소문자만 바꿈 (같은 자리)
    nick = want === current ? current : await claimNick(c, id, uid, want, current);
  } else {
    nick = await claimNick(c, id, uid, want, current);
  }
  if (nick !== current) await renameOnBoards(c, uid, nick);
  return nick;
}

/** PUT /api/profile/nick {nick} → {nick} */
export async function putNick(c: Ctx): Promise<Response> {
  const a = await authenticate(c);
  const body = await readJson(c.req, BODY_LIMIT.auth);
  const want = checkNick(body.nick, a.id);
  await limitAccount(c, a.uid, 'nick', ONLINE.nickMax, ONLINE.nickWindowMs);
  const nick = await setNick(c, a.id, a.uid, typeof a.user.nick === 'string' ? a.user.nick : null, want);
  return ok({ nick });
}

// ── 런 ──
/** POST /api/runs {board} → {run, seed, ts} */
export async function startRun(c: Ctx): Promise<Response> {
  const a = await authenticate(c);
  const body = await readJson(c.req, BODY_LIMIT.auth);
  const t = now();
  const board = parseBoard(body.board, t, 'write') ?? fail('invalid_board', 400);
  await limitAccount(c, a.uid, 'run-s', ONLINE.startMax, ONLINE.startWindowMs);
  const seed = board.kind === 'daily' ? dailyFor(board.date!).seed : randomSeed();
  const { run } = signRun(board.id, a.uid, t);
  return ok({ run, seed, ts: t });
}

const int = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const badResult = (): never => fail('invalid_result', 422);

/** 제출값 검사 (§3 보드별 상한·하한, 데이터에 있는 hero·cls) → 기록 필드 */
function checkResult(b: Board, r: unknown): Pick<Rec, 't' | 's' | 'w' | 'f' | 'h' | 'c' | 'l' | 'gr' | 'dt'> {
  if (!isObj(r)) return badResult();
  const time = typeof r.time === 'number' && Number.isFinite(r.time) ? Math.round(r.time) : NaN;
  if (b.kind === 'survival' || b.kind === 'tower') { if (!(time >= 0 && time <= ONLINE.anyTimeMaxMs)) badResult(); }
  else if (!(time >= ONLINE.timeMinMs && time <= ONLINE.timeMaxMs)) badResult();
  if (!int(r.score, 0, ONLINE.scoreMax) || !int(r.level, 1, ONLINE.levelMax)) badResult();
  if (b.kind === 'survival' && !int(r.wave, 1, ONLINE.waveMax)) badResult();
  if (b.kind === 'tower') {
    // 무한의 탑: 돌파한 층 1~999, 층마다 최소 시간 (돌파한 층 × 3초 — 층마다 건너뛸 수 없는 연출 시간), 층에 비해 지나친 점수
    if (!int(r.floor, 1, ONLINE.floorMax)) badResult();
    const f = r.floor as number;
    if (time < f * TOWER_RULES.minFloorSec * 1000) fail('implausible_time', 422);
    if ((r.score as number) > (f + 1) * TOWER_RULES.maxScorePerFloor) badResult();
  }
  if (typeof r.hero !== 'string' || !CHARACTER_IDS.includes(r.hero)) badResult();
  if (typeof r.cls !== 'string' || !Object.hasOwn(CLASS_INFO, r.cls) || CLASS_INFO[r.cls][0] !== r.hero) badResult();
  if (r.deaths !== undefined && r.deaths !== null && !int(r.deaths, 0, ONLINE.deathsMax)) badResult();
  if (r.rank !== undefined && r.rank !== null && !(typeof r.rank === 'string' && /^[A-Z][A-Z+-]{0,2}$/.test(r.rank))) badResult();
  const out: Pick<Rec, 't' | 's' | 'w' | 'f' | 'h' | 'c' | 'l' | 'gr' | 'dt'> = { t: time, s: r.score as number, h: r.hero as string, c: r.cls as string, l: r.level as number };
  if (b.kind === 'survival') out.w = r.wave as number;
  if (b.kind === 'tower') out.f = r.floor as number;
  if (typeof r.rank === 'string') out.gr = r.rank;
  if (Number.isSafeInteger(r.deaths)) out.dt = r.deaths as number;
  return out;
}

/** 고스트: base64(또는 base64url) 문자열, ghostMaxChars 이하 (없으면 null) */
function checkGhost(g: unknown): string | null {
  if (g === undefined || g === null) return null;
  if (typeof g !== 'string' || g.length < 4 || g.length > ONLINE.ghostMaxChars || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(g)) fail('invalid_ghost', 422);
  return g as string;
}

/** 런 토큰 유효 기간: 끝이 없는 모드(서바이벌·무한의 탑 — time 상한 24시간)는 endlessRunTtlMs, 나머지 보드는 runTtlMs (6시간) */
export const runTtlOf = (board: string): number => (/^(survival|tower):/.test(board) ? ONLINE.endlessRunTtlMs : ONLINE.runTtlMs);

/** 'YYYYMMDDHH' (UTC) — 쓴 nonce 키의 칸 (정리 함수가 키만 보고 지운다) */
const hourKey = (t: number): string => new Date(t).toISOString().slice(0, 13).replace(/[-T]/g, '');
export const nonceKey = (ts: number, n: string): string => `used/${hourKey(ts)}/${n}`;

/** POST /api/runs/finish {run, result, ghost?, board?} → {best, rank, total, entry} */
export async function finishRun(c: Ctx): Promise<Response> {
  const a = await authenticate(c);
  const body = await readJson(c.req, BODY_LIMIT.finish);
  const t = now();
  const claims = openRun(body.run);
  if (!claims || !sameAcct(claims.a, a.uid) || claims.ts > t + ONLINE.runSkewMs) fail('invalid_run', 400);
  // 요청에 board 를 함께 보내면 런의 보드와 같아야 한다
  if (body.board !== undefined && body.board !== null && body.board !== claims!.b) fail('invalid_run', 400);
  if (t - claims!.ts > runTtlOf(claims!.b)) fail('run_expired', 410);
  const board = parseBoard(claims!.b, t, 'write');
  if (!board) fail('run_expired', 410); // 서명은 맞는데 보드가 지금 받을 수 없음 = 오래된 일일 도전
  const res = checkResult(board!, body.result);
  if (t - claims!.ts < res.t * ONLINE.timeSlack - ONLINE.timeGraceMs) fail('implausible_time', 422);
  const ghost = checkGhost(body.ghost);
  await limitAccount(c, a.uid, 'run-m', ONLINE.submitPerMin, MIN);
  await limitAccount(c, a.uid, 'run-d', ONLINE.submitPerDay, DAY);
  // 같은 런은 한 번만 (먼저 자리를 잡는다)
  const runs = c.store(STORES.runs);
  const nk = nonceKey(claims!.ts, claims!.n);
  if (!(await runs.setJSON(nk, { at: t }, { onlyIfNew: true })).modified) fail('run_used', 409);
  try {
    const nick = await ensureNick(c, a);
    const rec: Rec = { v: 1, id: a.id, uid: a.uid, ...res, d: t, rn: claims!.n };
    const saved = await saveBest(c, board!, rec);
    let ghostSaved = false;
    if (saved.best && !saved.replay && ghost) {
      await putGhost(c, board!, a.uid, { data: ghost, t: rec.t, h: rec.h, c: rec.c });
      ghostSaved = true;
    }
    const placed = await placeEntry(c, board!, entryOf(saved.rec, nick), saved.isNew, ghostSaved);
    // 밀려난 계정의 고스트, 20위 밖이 된 내 고스트, 고스트 없이 갱신한 내 예전 고스트(지금 기록과 맞지 않는다)
    const mineStale = (ghostSaved && !placed.ghost) || (saved.best && !saved.replay && !ghostSaved);
    const drop = [...placed.evicted, ...(mineStale ? [a.uid] : [])];
    if (drop.length) await deleteGhosts(c, board!, drop);
    // 그사이 탈퇴했다면 방금 쓴 것을 지운다 (탈퇴 쪽도 사용자 레코드를 지운 뒤 한 번 더 쓴다)
    if (!(await accountAlive(c, a.id, a.uid))) { await removeUserFromBoard(c, board!, a.uid); unauthorized(); }
    return ok({ best: saved.best, rank: placed.rank, total: placed.total, entry: pubEntry(board!.kind, { ...entryOf(saved.rec, nick), g: placed.ghost }, placed.rank) });
  } catch (e) {
    // 서버 오류면 같은 런으로 다시 보낼 수 있게 자리를 돌려준다 (기록은 최고 기록만 남으므로 다시 보내도 안전하다)
    if (!(e instanceof ApiError)) await runs.delete(nk).catch(() => {});
    throw e;
  }
}

// ── 순위표·고스트·일일 도전 (공개) ──
const publicCache = (sec: number): Record<string, string> => ({
  'Cache-Control': `public, max-age=${sec}`,
  // 로그인한 요청(me 포함, no-store)과 캐시를 나눈다
  Vary: 'Authorization',
  'Netlify-Vary': 'header=Authorization',
});

/** GET /api/boards/<board>?limit=50 → {board, total, entries, me?} */
export async function getBoard(c: Ctx, raw: string): Promise<Response> {
  const t = now();
  const board = boardParam(raw, t);
  let limit: number = ONLINE.boardLimit;
  try {
    const l = new URL(c.req.url).searchParams.get('limit');
    if (l !== null) limit = /^\d{1,3}$/.test(l) ? Number(l) : NaN;
  } catch { /* 주소는 라우터가 이미 읽었다 */ }
  if (!int(limit, 1, ONLINE.rankTop)) fail('bad_request', 400);
  // 인증 헤더가 있으면 확인한다 (틀리면 401 — 다른 API 와 같이 다시 로그인)
  const a = c.req.headers.has('authorization') ? await authenticate(c) : null;
  const { idx } = await readIndex(c, board);
  const entries = idx.list.slice(0, Math.min(limit, ONLINE.rankTop)).map((e, i) => pubEntry(board.kind, e, i + 1));
  const out: Record<string, unknown> = { ok: true, board: board.id, total: idx.total, entries };
  if (!a) return json(200, out, publicCache(ONLINE.boardCacheSec));
  const rec = await readRecord(c, board, a.uid);
  if (rec) {
    const at = idx.list.findIndex((e) => e.u === a.uid);
    const me: Record<string, unknown> = { rank: at >= 0 && at < ONLINE.rankTop ? at + 1 : null, time: rec.t, score: rec.s };
    if (board.kind === 'survival') me.wave = rec.w ?? 0;
    if (board.kind === 'tower') me.floor = rec.f ?? 0;
    out.me = me;
  } else out.me = null;
  return json(200, out);
}

/** GET /api/ghosts/<board>/<rank> → {nick, time, hero, cls, data} (없으면 404 ghost_not_found) */
export async function getGhost(c: Ctx, rawBoard: string, rawRank: string): Promise<Response> {
  const board = boardParam(rawBoard, now());
  if (!/^[1-9]\d{0,2}$/.test(rawRank)) fail('bad_request', 400);
  const rank = Number(rawRank);
  const { idx } = rank <= ONLINE.ghostTop ? await readIndex(c, board) : { idx: { list: [] as never[] } };
  const e = idx.list[rank - 1];
  if (!e || !e.g) fail('ghost_not_found', 404);
  const g = await readGhost(c, board, e!.u);
  if (!g || g.t !== e!.t) fail('ghost_not_found', 404); // 지금 최고 기록의 고스트가 아님
  return json(200, { ok: true, nick: e!.n, time: e!.t, hero: e!.h, cls: e!.c, data: g!.data }, publicCache(ONLINE.ghostCacheSec));
}

/** GET /api/daily → 오늘(한국 날짜)의 도전. 다음 한국 자정을 넘겨 캐시하지 않는다 */
export async function getDaily(c: Ctx): Promise<Response> {
  void c;
  const t = now();
  const date = kstDay(t);
  const left = Math.ceil((kstDayStart(date)! + DAY - t) / 1000);
  const sec = Math.max(1, Math.min(ONLINE.dailyCacheSec, left));
  return json(200, { ok: true, ...dailyFor(date) }, { 'Cache-Control': `public, max-age=${sec}` });
}
