// 온라인 기능 클라이언트 — 리더보드 · 일일 도전 · 고스트 (계약: docs/specs/online.md)
//  - 계정·주소·토큰은 core/cloud.js 의 것을 그대로 쓴다 (cloud.base: 웹 '/api', 안드로이드 앱은 /api 프록시 또는 공식 사이트,
//    cloud.eligible(): https·localhost 만, claude.ai 임베드 등은 요청 0건). 401 이면 cloud.expire() 로 로그인 만료를 알린다
//  - 게임을 기다리게 하지 않는다: 모든 요청은 비동기·시간 제한, 실패해도 예외 없이 {ok:false, error, message} 를 돌려준다
//  - 런 흐름 (§4): startRun(board) → 로그인 중이면 POST /api/runs 를 비동기로 (실패해도 게임은 그대로) → finishRun(h, result, ghost)
//    · 제출 본문 { run, result, board, ghost? }. 422 invalid_ghost 면 고스트를 빼고 다시 (그 밖의 4xx 는 버림 — §2.2 표)
//    · 연결 문제(오프라인·시간 초과·5xx·429)로 못 보낸 결과는 기기 대기열(localStorage bn_online_q, 계정별, 최대 6개)에 두었다가
//      다시 연결될 때(online 이벤트 · 로그인 · 아케이드/명예의 전당 화면) 보낸다. run 은 시작 뒤 6시간만 유효 → 지난 것은 버린다
//    · 버스 'online:flushed' {sent:[{board, rank, total, best}], dropped} — 대기열에서 보낸 결과 (아케이드 메뉴가 토스트)
//  - 일일 도전: GET /api/daily 를 한국 시간(UTC+9) 날짜마다 한 번 (bn_online_daily 에 그날 것만 보관)
//  - 순위표: GET /api/boards/<board>?limit=50 (로그인 중이면 인증 헤더 → me), 30초 메모리 캐시. 제출하면 그 보드 캐시를 지운다
//  - 고스트: GET /api/ghosts/<board>/<rank> (세션 메모리 캐시) · 내 최고 고스트는 기기에도 보드별로 남긴다(bn_ghost_best, 최대 6 보드)
//  - 별명: GET /api/auth/me 의 nick, PUT /api/profile/nick. 규칙(§0): 2~12자 한글·영문·숫자·_ (금칙어·겹침은 서버가 처리)
//  - 이 모듈은 아케이드·명예의 전당·계정 장면과 함께 늦게 받는 조각에 실린다 (첫 화면 바이트에 넣지 않는다, R1-REQ-229)
import { bus } from './events.js';
import { cloud, sanitizeTree, MESSAGES } from './cloud.js';

const K_Q = 'bn_online_q', K_DAILY = 'bn_online_daily', K_NICK = 'bn_online_nick', K_GHOST = 'bn_ghost_best';
export const RUN_TTL = 6 * 3600e3;            // run 유효 시간 (서버 서명 6시간)
export const GHOST_MAX = 24 * 1024;           // 고스트 base64 상한 (§2.2)
const Q_MAX = 6, BOARD_TTL = 30e3, LOCAL_GHOSTS = 6;
const BOARD_RE = /^(bossrush:\d{1,2}:[a-z_]{2,16}|survival:[a-z_]{2,16}|practice:s\d{2}:[a-z_]{2,16}|daily:\d{8}|tower:[a-z_]{2,16})$/;
const NET = new Set(['offline', 'network', 'timeout']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const W = typeof window !== 'undefined' ? window : null;

/** 서버 오류 코드 → 문구 (계정 문구에 없는 것) */
export const ONLINE_MESSAGES = {
  invalid_nick: '별명은 2~12자의 한글·영문·숫자·밑줄(_)로 정해 주세요.',
  nick_is_id: '별명에 로그인 아이디를 넣을 수 없어요. 아이디는 공개되지 않게 지켜 드려요.',
  implausible_time: '기록이 실제 걸린 시간과 맞지 않아 순위에 올리지 못했어요.',
  invalid_ghost: '고스트 기록이 올바르지 않아 순위에 올리지 못했어요.',
  ghost_not_found: '고스트를 찾을 수 없어요.',
  nick_banned: '쓸 수 없는 낱말이 들어 있어요. 다른 별명을 정해 주세요.',
  banned_nick: '쓸 수 없는 낱말이 들어 있어요. 다른 별명을 정해 주세요.',
  forbidden_nick: '쓸 수 없는 낱말이 들어 있어요. 다른 별명을 정해 주세요.',
  invalid_run: '기록을 확인할 수 없어 순위에 올리지 못했어요.',
  run_expired: '시작한 지 6시간이 지나 순위에 올릴 수 없어요.',
  run_used: '이미 제출한 기록이에요.',
  invalid_result: '기록 값이 올바르지 않아 순위에 올리지 못했어요.',
  invalid_board: '순위표를 찾을 수 없어요.',
  not_found: '찾을 수 없어요.',
};
const msgOf = (e) => ONLINE_MESSAGES[e] ?? MESSAGES[e] ?? MESSAGES.server_error;
const fail = (error, extra = {}) => ({ ok: false, error, message: msgOf(error), status: 0, ...extra });

// ───────────────────────── 일일 도전 규칙 (§2.5) ─────────────────────────
/** 규칙 id → 표시 이름·설명 · 난이도 배율(diff: 곱함) · 월드 규칙(rules) */
export const DAILY_MODS = {
  'hp_x1.5': { name: '적 체력 1.5배', desc: '모든 적과 보스의 체력이 1.5배', diff: { enemyHp: 1.5, bossHp: 1.5 } },
  no_potion: { name: '물약 금지', desc: '회복약·소모품을 쓸 수 없음', rules: { noPotion: true } },
  glass: { name: '유리 대포', desc: '받는 피해 2배 · 주는 피해 1.3배', rules: { taken: 2, dealt: 1.3 } },
  haste: { name: '적 속도 1.25배', desc: '적이 더 빠르게 움직임', diff: { enemySpeed: 1.25 } },
  dark: { name: '어둠', desc: '시야가 좁아짐', rules: { dark: true } },
  no_sub: { name: '보조 무기 금지', desc: '보조 무기를 쓸 수 없음', rules: { noSub: true } },
};
export const modName = (id) => DAILY_MODS[id]?.name ?? String(id ?? '');
/**
 * 규칙 목록 → { diffOver: 바꿀 난이도 값(기준 diff 에 곱한 결과), rules: 월드 규칙 } (모르는 규칙은 무시)
 *  base: 기준 난이도 객체 (data/difficulty.js getDiff)
 */
export function applyMods(base, mods) {
  const diffOver = {}, rules = {};
  for (const id of Array.isArray(mods) ? mods : []) {
    const m = DAILY_MODS[id];
    if (!m) continue;
    for (const [k, v] of Object.entries(m.diff ?? {})) diffOver[k] = (diffOver[k] ?? base?.[k] ?? 1) * v;
    for (const [k, v] of Object.entries(m.rules ?? {})) rules[k] = typeof v === 'number' ? (rules[k] ?? 1) * v : v;
  }
  return { diffOver, rules };
}

// ───────────────────────── 보드 · 날짜 ─────────────────────────
export const validBoard = (b) => typeof b === 'string' && BOARD_RE.test(b);
/** 아케이드 설정 → 보드 id (§1). 일일 도전은 daily.board. 모르면 null */
export function boardOf(cfg) {
  if (!isObj(cfg)) return null;
  if (isObj(cfg.daily)) return validBoard(cfg.daily.board) ? cfg.daily.board : null;
  const d = cfg.diff ?? 'normal';
  let b = null;
  if (cfg.kind === 'bossrush') b = `bossrush:${cfg.course ?? 0}:${d}`;
  else if (cfg.kind === 'survival') b = `survival:${d}`;
  else if (cfg.kind === 'practice') b = `practice:${cfg.stageId ?? 's01'}:${d}`;
  else if (cfg.kind === 'tower') b = `tower:${d}`;
  return validBoard(b) ? b : null;
}
/** 보드 종류 */
export const boardKind = (b) => String(b ?? '').split(':')[0];
/** 순위 기준이 시간인가 (보스 러시·연습·일일) */
export const timeBoard = (b) => boardKind(b) !== 'survival' && boardKind(b) !== 'tower';
/** 무한의 탑 보드인가 (돌파한 층 ↑ → 시간 ↓) */
export const floorBoard = (b) => boardKind(b) === 'tower';
/** 한국 시간(UTC+9) 날짜 'YYYYMMDD' */
export function kstDay(ms = Date.now()) {
  return new Date(ms + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
}
/** 기록(ms) 표시: 1:23.45 / 1:02:03.4 */
export function fmtMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const cs = Math.floor(ms / 10), s = Math.floor(cs / 100), m = Math.floor(s / 60), h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, '0'), cc = String(cs % 100).padStart(2, '0');
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${ss}.${cc[0]}` : `${m}:${ss}.${cc}`;
}

// ───────────────────────── 별명 규칙 (§0) ─────────────────────────
const NICK_CH = /^[\uAC00-\uD7A3A-Za-z0-9_]$/u;   // 완성형 한글 (글꼴 검사가 소스 글자를 세므로 범위는 이스케이프로)
/** 별명 검사 → 오류 문구 또는 null (금칙어·겹침은 서버). id: 로그인 아이디 (별명에 넣을 수 없다 — 서버 nick_is_id) */
export function checkNick(raw, id = cloud.id) {
  const s = String(raw ?? '').normalize('NFC').trim();
  if (!s) return '별명을 입력해 주세요.';
  const cs = [...s];
  if (cs.some((c) => /\s/u.test(c))) return '별명에는 띄어쓰기를 쓸 수 없어요.';
  if (cs.some((c) => /[\u3131-\u318E]/u.test(c))) return '자음·모음만 따로 쓸 수 없어요. 완성된 글자로 써 주세요.';
  const bad = cs.find((c) => !NICK_CH.test(c));
  if (bad) return `「${bad}」 은(는) 쓸 수 없어요. 한글·영문·숫자·밑줄(_)만 쓸 수 있어요.`;
  if (cs.length < 2 || cs.length > 12) return `별명은 2~12자로 정해 주세요. (지금 ${cs.length}자)`;
  if (typeof id === 'string' && id && s.toLowerCase().includes(id.toLowerCase())) return ONLINE_MESSAGES.nick_is_id;
  return null;
}

// ───────────────────────── 저장소 ─────────────────────────
function lsGet(k) { try { return W?.localStorage?.getItem(k) ?? null; } catch { return null; } }
function lsSet(k, v) { try { W?.localStorage?.setItem(k, v); return true; } catch { return false; } }
function jget(k) { try { const v = JSON.parse(lsGet(k)); return v ?? null; } catch { return null; } }

// ───────────────────────── 요청 ─────────────────────────
/**
 * API 요청 (cloud.js 와 같은 주소·토큰·안전 옵션). 응답 JSON 에 ok 가 없어도 2xx 면 성공으로 본다.
 *  auth: 토큰이 있으면 붙임 · need: 토큰이 없으면 보내지 않음(logged_out)
 */
async function call(method, path, { body, auth = false, need = false, timeout = 10000 } = {}) {
  try {
    if (!cloud.eligible()) return fail('unavailable');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return fail('offline');
    const token = auth || need ? cloud.auth?.token ?? null : null;
    if (need && !token) return fail('logged_out');
    const headers = { Accept: 'application/json' };
    let payload;
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    if (token) headers.Authorization = `Bearer ${token}`;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl?.abort(); }, timeout);
    try {
      const res = await fetch(cloud.base + path, {
        method, headers, body: payload, signal: ctrl?.signal, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      });
      let json = null;
      try { json = await res.json(); } catch { json = null; }
      if (!isObj(json)) return fail(res.status === 404 ? 'not_found' : res.ok ? 'bad_response' : res.status >= 500 ? 'server_error' : 'bad_response', { status: res.status });
      json = sanitizeTree(json);
      if (!res.ok || json.ok === false) {
        const error = typeof json.error === 'string' ? json.error : res.status === 404 ? 'not_found' : res.status === 429 ? 'rate_limited' : res.status === 401 ? 'unauthorized' : 'server_error';
        const out = { ...json, ok: false, error, status: res.status, message: typeof json.message === 'string' && json.message ? json.message : msgOf(error) };
        if (res.status === 429) out.retryAfter = Number(json.retryAfter ?? res.headers.get('Retry-After')) || 0;
        if (error === 'unauthorized' && token && cloud.auth?.token === token) { try { cloud.expire(); } catch { /* 무시 */ } }
        return out;
      }
      return { ...json, ok: true, status: res.status };
    } catch {
      return fail(timedOut ? 'timeout' : 'network');
    } finally { clearTimeout(timer); }
  } catch (e) {
    console.warn('[online]', e);
    return fail('client_error');
  }
}
/** 연결 문제(다시 보내면 될 수 있는 실패)인가 */
export const retryable = (r) => !!r && !r.ok && (NET.has(r.error) || r.status >= 500 || r.status === 429);

// ───────────────────────── 런 (§2.1 · §2.2) ─────────────────────────
/**
 * 런 시작 (기다리지 않는다). 반환 손잡이 h: { board, at, state, run, seed, promise }
 *  state: 'none'(보드 없음) | 'unavailable'(이 환경) | 'guest'(로그인 안 함) | 'starting' | 'ready' | 'offline' | 'login' | 'error'
 */
export function startRun(board) {
  const h = { board, at: Date.now(), state: 'none', run: null, seed: null, ts: null, id: cloud.id ?? null, promise: null };
  if (!validBoard(board)) return h;
  if (!cloud.eligible()) { h.state = 'unavailable'; return h; }
  if (!cloud.loggedIn) { h.state = 'guest'; return h; }
  h.state = 'starting';
  h.promise = call('POST', '/runs', { body: { board }, need: true, timeout: 8000 }).then((r) => {
    if (r.ok && typeof r.run === 'string' && r.run.length > 0 && r.run.length < 4096) {
      h.run = r.run; h.seed = Number.isInteger(r.seed) ? r.seed : null; h.ts = Number.isFinite(r.ts) ? r.ts : null; h.state = 'ready';
    } else {
      h.state = r.error === 'logged_out' || r.error === 'unauthorized' ? 'login' : retryable(r) ? 'offline' : 'error';
      h.error = r.message ?? null;
    }
    return h;
  });
  return h;
}
/** 제출할 결과 정리 (§2.2: time·score·level 정수, 범위 밖은 서버가 거절) */
export function cleanResult(r) {
  const o = { time: Math.max(0, Math.round(Number(r?.time) || 0)), score: Math.max(0, Math.min(99999999, Math.round(Number(r?.score) || 0))), hero: String(r?.hero ?? ''), cls: String(r?.cls ?? ''), level: Math.max(1, Math.min(99, Math.round(Number(r?.level) || 1))) };
  if (Number.isFinite(r?.wave)) o.wave = Math.max(0, Math.round(r.wave));
  if (Number.isFinite(r?.floor)) o.floor = Math.max(0, Math.round(r.floor));
  if (typeof r?.rank === 'string' && /^[SABCD]$/.test(r.rank)) o.rank = r.rank;
  if (Number.isFinite(r?.deaths)) o.deaths = Math.max(0, Math.round(r.deaths));
  return o;
}
const okGhost = (g) => typeof g === 'string' && g.length > 0 && g.length <= GHOST_MAX && /^[A-Za-z0-9+/]+={0,2}$/.test(g);

/**
 * 런 제출 → Promise<결과>
 *  { state:'ok', rank, total, best, entry } · 'queued'(연결되면 보냄) · 'guest'(로그인하면 순위에…) · 'login'(만료)
 *  · 'offline'(시작도 못 함 → 이번 기록은 못 올림) · 'unavailable' · 'error' {message} · 'none'
 */
export async function finishRun(h, result, ghost = null) {
  try {
    if (!h || h.state === 'none') return { state: 'none' };
    if (h.state === 'unavailable') return { state: 'unavailable' };
    if (h.state === 'guest') return { state: 'guest' };
    if (h.promise) await Promise.race([h.promise, new Promise((res) => setTimeout(res, 8000))]);
    if (!h.run) {
      if (h.state === 'login') return { state: 'login' };
      if (h.state === 'offline' || h.state === 'starting') return { state: 'offline' };
      return { state: 'error', message: h.error ?? MESSAGES.server_error };
    }
    const body = { run: h.run, result: cleanResult(result), board: h.board };
    if (okGhost(ghost)) body.ghost = ghost;
    if (!cloud.loggedIn || (h.id && cloud.id !== h.id)) return { state: 'login' };
    const r = await sendFinish(body);
    dropBoardCache(h.board);
    if (r.ok) return { state: 'ok', ...pickRank(r) };
    if (r.error === 'unauthorized' || r.error === 'logged_out') return { state: 'login' };
    if (retryable(r)) {
      enqueue({ id: h.id, board: h.board, at: h.at, body });
      return { state: 'queued' };
    }
    return { state: 'error', message: r.message };
  } catch (e) {
    console.warn('[online] finish', e);
    return { state: 'error', message: MESSAGES.client_error };
  }
}
/** 제출 한 번. 고스트 형식이 거절되면(422 invalid_ghost — 런은 쓰이지 않는다, §2.2) 고스트를 빼고 한 번 더 */
async function sendFinish(body) {
  const r = await call('POST', '/runs/finish', { body, need: true, timeout: 12000 });
  if (!r.ok && r.error === 'invalid_ghost' && body.ghost) { delete body.ghost; return call('POST', '/runs/finish', { body, need: true, timeout: 12000 }); }
  return r;
}
function pickRank(r) {
  const n = (v) => (Number.isFinite(v) ? v : null);
  return { rank: n(r.rank), total: n(r.total), best: !!r.best, entry: isObj(r.entry) ? r.entry : null };
}

// ── 대기열 ──
function readQ() { const q = jget(K_Q); return Array.isArray(q) ? q.filter((e) => isObj(e) && validBoard(e.board) && isObj(e.body)) : []; }
function writeQ(q) {
  // 저장 공간: 고스트까지 합쳐 120KB 를 넘으면 오래된 것부터 고스트를 뺀다
  let s = JSON.stringify(q);
  for (let i = 0; i < q.length && s.length > 120000; i++) if (q[i].body?.ghost) { delete q[i].body.ghost; s = JSON.stringify(q); }
  lsSet(K_Q, s);
}
function enqueue(e) {
  const q = readQ().filter((x) => x.body?.run !== e.body.run);
  q.push({ ...e, tries: 0 });
  while (q.length > Q_MAX) q.shift();
  writeQ(q);
}
/** 대기 중인 결과 수 (이 계정 것, 지난 것 제외) */
export function queueSize(id = cloud.id) {
  const now = Date.now();
  return readQ().filter((e) => e.id === id && now - e.at < RUN_TTL).length;
}
let flushing = null;
/** 대기열 보내기 (로그인·연결 중일 때). → Promise<{sent, dropped, left}> */
export function flushQueue() {
  if (flushing) return flushing;
  flushing = (async () => {
    const out = { sent: [], dropped: 0, left: 0 };
    try {
      let q = readQ();
      const now = Date.now();
      const keep = q.filter((e) => now - e.at < RUN_TTL - 60e3);
      out.dropped += q.length - keep.length;
      q = keep;
      if (!q.length || !cloud.loggedIn || !cloud.eligible()) { if (out.dropped) writeQ(q); out.left = q.length; return out; }
      const rest = [];
      let stop = false;
      for (const e of q) {
        if (stop || e.id !== cloud.id) { rest.push(e); continue; }
        const r = await sendFinish(e.body);
        if (r.ok) { out.sent.push({ board: e.board, ...pickRank(r) }); dropBoardCache(e.board); }
        else if (retryable(r) || r.error === 'logged_out' || r.error === 'unauthorized') { e.tries = (e.tries ?? 0) + 1; rest.push(e); stop = true; }
        else out.dropped++;   // 서버가 거절 (이미 제출·만료·검사 실패): 다시 보내도 안 된다
      }
      writeQ(rest);
      out.left = rest.length;
      if (out.sent.length || out.dropped) bus.emit('online:flushed', out);
    } catch (e) { console.warn('[online] flush', e); }
    return out;
  })().finally(() => { flushing = null; });
  return flushing;
}

// ───────────────────────── 일일 도전 (§2.5) ─────────────────────────
let dailyMem = null, dailyReq = null;
/** 일일 도전 응답 모양 검사 (내용 검사 — 스테이지·헌터가 있는가 — 는 화면 쪽) */
function okDaily(d) {
  return isObj(d) && /^\d{8}$/.test(String(d.date)) && Number.isInteger(d.seed) && typeof d.stageId === 'string' && typeof d.hero === 'string'
    && typeof d.diff === 'string' && validBoard(d.board) && Array.isArray(d.mods);
}
/** 오늘(한국 시간)의 도전 → Promise<{ok, daily} | {ok:false, error, message}>. 같은 날에는 기기에 둔 것을 쓴다 */
export function getDaily({ force = false } = {}) {
  const day = kstDay();
  if (!force && dailyMem?.date === day) return Promise.resolve({ ok: true, daily: dailyMem, cached: true });
  if (!force) {
    const c = jget(K_DAILY);
    if (isObj(c) && c.day === day && okDaily(c.data) && String(c.data.date) === day) { dailyMem = { ...c.data, date: String(c.data.date) }; return Promise.resolve({ ok: true, daily: dailyMem, cached: true }); }
  }
  if (dailyReq) return dailyReq;
  dailyReq = call('GET', '/daily', { timeout: 8000 }).then((r) => {
    if (!r.ok) return r;
    const d = { date: String(r.date), seed: r.seed, stageId: r.stageId, diff: r.diff, hero: r.hero, cls: r.cls, preset: r.preset, mods: (Array.isArray(r.mods) ? r.mods : []).filter((m) => typeof m === 'string').slice(0, 8), board: r.board };
    if (!okDaily(d)) return fail('bad_response');
    dailyMem = d;
    if (d.date === day) lsSet(K_DAILY, JSON.stringify({ day, data: d }));
    return { ok: true, daily: d };
  }).finally(() => { dailyReq = null; });
  return dailyReq;
}
/** 시험·화면용: 지금 들고 있는 오늘의 도전 (없으면 null) */
export const dailyNow = () => (dailyMem?.date === kstDay() ? dailyMem : null);

// ───────────────────────── 순위표 (§2.3) ─────────────────────────
const boards = new Map();   // key → { at, data } | { at, req }
const bkey = (b, limit) => `${b}|${limit}|${cloud.id ?? ''}`;
function dropBoardCache(b) { for (const k of [...boards.keys()]) if (k.startsWith(b + '|')) boards.delete(k); }
/** 순위표 → Promise<{ok, board, total, entries, me?}>. 30초 안에 다시 부르면 기억한 것 */
export function getBoard(board, { limit = 50, force = false } = {}) {
  if (!validBoard(board)) return Promise.resolve(fail('invalid_board'));
  const k = bkey(board, limit), c = boards.get(k), now = Date.now();
  if (c?.req) return c.req;
  if (!force && c?.data && now - c.at < BOARD_TTL) return Promise.resolve(c.data);
  const req = call('GET', `/boards/${board}?limit=${Math.max(1, Math.min(100, limit | 0))}`, { auth: true, timeout: 9000 }).then((r) => {
    if (!r.ok) { boards.delete(k); return r; }
    const entries = (Array.isArray(r.entries) ? r.entries : []).filter(isObj).slice(0, 100).map((e, i) => ({
      rank: Number.isFinite(e.rank) ? e.rank : i + 1, nick: String(e.nick ?? '???').slice(0, 24), time: Number(e.time) || 0, score: Number(e.score) || 0,
      wave: Number.isFinite(e.wave) ? e.wave : null, floor: Number.isFinite(e.floor) ? e.floor : null, hero: String(e.hero ?? ''), cls: String(e.cls ?? ''), level: Number(e.level) || 0, date: e.date ?? null, ghost: !!e.ghost,
    }));
    // me.rank 는 순위 밖이면 null (기록은 있다)
    const me = isObj(r.me) && (Number.isFinite(r.me.rank) || r.me.rank === null) && Number.isFinite(r.me.time) ? { rank: Number.isFinite(r.me.rank) ? r.me.rank : null, time: Number(r.me.time) || 0, score: Number(r.me.score) || 0, wave: Number.isFinite(r.me.wave) ? r.me.wave : null, floor: Number.isFinite(r.me.floor) ? r.me.floor : null } : null;
    const out = { ok: true, board, total: Number.isFinite(r.total) ? r.total : entries.length, entries, me };
    boards.set(k, { at: Date.now(), data: out });
    return out;
  });
  boards.set(k, { at: now, req });
  return req;
}
/** 기억해 둔 순위표 (요청하지 않음) */
export function cachedBoard(board, limit = 50) { return boards.get(bkey(board, limit))?.data ?? null; }

// ───────────────────────── 고스트 (§2.4) ─────────────────────────
const ghosts = new Map();
/** 남의(또는 내) 고스트 → Promise<{ok, nick, time, hero, cls, data}> */
export function getGhost(board, rank) {
  if (!validBoard(board) || !(rank >= 1 && rank <= 100)) return Promise.resolve(fail('not_found'));
  const k = `${board}|${rank}`;
  if (ghosts.has(k)) return ghosts.get(k);
  const p = call('GET', `/ghosts/${board}/${rank | 0}`, { timeout: 10000 }).then((r) => {
    if (!r.ok || !okGhost(r.data)) { ghosts.delete(k); return r.ok ? fail('bad_response') : r; }
    return { ok: true, nick: String(r.nick ?? ''), time: Number(r.time) || 0, hero: String(r.hero ?? ''), cls: String(r.cls ?? ''), data: r.data };
  });
  ghosts.set(k, p);
  if (ghosts.size > 6) ghosts.delete(ghosts.keys().next().value);
  return p;
}
/** 기기에 둔 내 최고 고스트 { time(ms), data, hero, cls } | null */
export function localGhost(board) {
  const m = jget(K_GHOST);
  const g = isObj(m) && isObj(m[board]) ? m[board] : null;
  return g && okGhost(g.data) && Number.isFinite(g.time) ? g : null;
}
/** 내 기록이 기기 고스트보다 빠르면 바꿔 둔다 (보드 6개까지, 오래 안 쓴 것부터 버림). → 바꿨는가 */
export function saveLocalGhost(board, time, data, hero = '', cls = '') {
  if (!validBoard(board) || !okGhost(data) || !(time > 0)) return false;
  const m = isObj(jget(K_GHOST)) ? jget(K_GHOST) : {};
  const cur = isObj(m[board]) ? m[board] : null;
  if (cur && Number.isFinite(cur.time) && cur.time <= time) return false;
  m[board] = { time, data, hero, cls, at: Date.now() };
  const keys = Object.keys(m).filter((k) => isObj(m[k])).sort((a, b) => (m[b].at ?? 0) - (m[a].at ?? 0));
  for (const k of keys.slice(LOCAL_GHOSTS)) delete m[k];
  return lsSet(K_GHOST, JSON.stringify(m));
}
/**
 * 시작 화면에서 고른 고스트 받기. choice: 'off' | 'top' | 'mine'
 * → Promise<{ok, data, nick, time, hero, cls, src} | {ok:false, message}>
 */
export async function pickGhost(board, choice) {
  if (choice === 'top') {
    const r = await getGhost(board, 1);
    return r.ok ? { ...r, src: 'top' } : { ok: false, message: r.error === 'not_found' || r.error === 'ghost_not_found' ? '아직 1위 고스트가 없어요' : '고스트를 불러오지 못했어요' };
  }
  if (choice === 'mine') {
    const l = localGhost(board);
    if (l) return { ok: true, data: l.data, time: l.time, hero: l.hero, cls: l.cls, nick: '', src: 'mine' };
    if (cloud.loggedIn) {
      const b = await getBoard(board);
      const rk = b.ok ? b.me?.rank : null;
      if (rk && rk <= 20) { const r = await getGhost(board, rk); if (r.ok) return { ...r, src: 'mine' }; }
    }
    return { ok: false, message: '아직 내 최고 기록 고스트가 없어요' };
  }
  return { ok: false, message: null };
}

// ───────────────────────── 별명 (§2.6) ─────────────────────────
let nickMem = null;   // { id, nick }
/** 기억한 내 별명 (요청하지 않음) */
export function nickNow() {
  if (!cloud.loggedIn) return null;
  if (nickMem?.id === cloud.id) return nickMem.nick;
  const c = jget(K_NICK);
  if (isObj(c) && c.id === cloud.id && typeof c.nick === 'string') { nickMem = c; return c.nick; }
  return null;
}
function rememberNick(nick) { nickMem = { id: cloud.id, nick }; lsSet(K_NICK, JSON.stringify(nickMem)); }
/** 내 별명 → Promise<{ok, nick(없으면 null)}> (GET /api/auth/me) */
export async function getNick() {
  if (!cloud.loggedIn) return fail('logged_out');
  const r = await call('GET', '/auth/me', { need: true, timeout: 8000 });
  if (!r.ok) return r;
  const nick = typeof r.nick === 'string' && r.nick ? r.nick : null;
  if (nick) rememberNick(nick);
  return { ok: true, nick };
}
/** 별명 바꾸기 → Promise<{ok, nick, changed(서버가 #숫자를 붙였는가)} | {ok:false, error, message}> */
export async function setNick(raw) {
  const nick = String(raw ?? '').normalize('NFC').trim();
  const bad = checkNick(nick);
  if (bad) return { ok: false, error: 'invalid_nick', message: bad };
  const r = await call('PUT', '/profile/nick', { body: { nick }, need: true, timeout: 10000 });
  if (!r.ok) return r;
  const got = typeof r.nick === 'string' && r.nick ? r.nick : nick;
  rememberNick(got);
  return { ok: true, nick: got, changed: got !== nick };
}

// ───────────────────────── 자동 보내기 ─────────────────────────
let installed = false;
/** 연결 회복·로그인 때 대기열을 보낸다 (모듈을 처음 읽은 뒤 한 번) */
function install() {
  if (installed) return;
  installed = true;
  try {
    W?.addEventListener?.('online', () => setTimeout(flushQueue, 1500));
    bus.on('cloud:login', () => { nickMem = null; setTimeout(flushQueue, 2500); });
    bus.on('cloud:logout', () => { nickMem = null; boards.clear(); });
    setTimeout(flushQueue, 3000);
  } catch (e) { console.warn('[online] install', e); }
}
// 모듈 평가가 모두 끝난 뒤에 (최상위에서 import 값에 바로 접근하지 않는다 — ARCHITECTURE 순환 import 규칙)
if (typeof setTimeout === 'function') setTimeout(install, 0);

/** 시험용 (tools/online/test_client_online.mjs) */
export const _test = { call, readQ, enqueue, boards, ghosts, reset() { dailyMem = null; nickMem = null; boards.clear(); ghosts.clear(); } };
