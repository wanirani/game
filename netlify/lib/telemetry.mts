// 익명 통계 (docs/TELEMETRY.md): 게임이 실제 기기에서 어떻게 도는지(오류·사망·클리어 시간·성능) 배우기 위한 서버 쪽.
//  - POST /api/t      : 묶음 하나(사건 ≤ 50, 본문 ≤ 32KB)를 엄격히 검사해 bn-telemetry raw/<날>/<시>/<무작위> 에 그대로 둔다 → 204.
//                       본문은 application/json 또는 text/plain (navigator.sendBeacon 은 text/plain 으로 보낸다). 망별 제한(ratelimit.mts).
//                       IP·계정·요청 헤더는 저장하지 않는다. 오류 문구의 주소·메일·IP·긴 토큰은 저장 전에 가린다.
//  - runAggregation   : 매시 예약 함수(netlify/functions/telemetry_agg.mts). 끝난 시간 칸의 원본을 hour/<날>/<시> 요약으로 다시 계산하고
//                       (그 칸의 원본 키 목록 지문을 state/agg 에 적어 두어 같은 원본을 두 번 세지 않는다 — 다시 돌려도 같은 결과),
//                       바뀐 날은 그날의 시간 요약을 합쳐 agg/<날> 을 다시 쓴다.
//  - GET /api/stats   : 최근 N일(≤ 30)의 날 요약을 합친 공개 통계 (식별 정보 없음, 짧게 캐시).
//  - sweepTelemetry   : 매일 정리(cleanup.mts) — 30일이 지난 raw/·hour/ 를 지운다 (agg/ 는 남긴다).
// 요약의 모든 분포는 히스토그램(값 → 횟수)이라 시간·날·기간끼리 그대로 더할 수 있고, 백분위는 합친 뒤에 계산한다(summarize).
import { createHash, randomBytes } from 'node:crypto';
import { STORES, TELEMETRY } from './config.mts';
import { fail, isObj, json, jsonDepth, noContent, readBytes } from './http.mts';
import { limitTelemetryByIp } from './ratelimit.mts';
import { now } from './runtime.mts';
import type { Ctx, KV } from './runtime.mts';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// ───────────────────────── 검사 ─────────────────────────
const ID = /^[a-z0-9_]{1,40}$/; // 스테이지·방·영웅·직업·보스·난이도·장면 id
const IID = /^[A-Za-z0-9_-]{22}$/; // 설치 id (128비트 base64url)
const SID = /^[A-Za-z0-9_-]{11}$/; // 세션 id (64비트 base64url)
const VER = /^[0-9A-Za-z.+_-]{1,64}$/;
const VP = /^\d{1,5}x\d{1,5}$/;
const CAUSE = /^(?:(?:enemy|boss):[a-z0-9_]{1,40}|hazard|fall|unknown)$/;
const FRAME = /^[A-Za-z0-9_.\/@$~<>-]{1,120}(?::\d{1,7}){0,2}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

type Field =
  | { k: 'id' | 'bool' | 'cause' | 'vp' | 'ver' | 'frames'; opt?: boolean }
  | { k: 'enum'; v: readonly string[]; opt?: boolean }
  | { k: 'int' | 'num'; min: number; max: number; opt?: boolean }
  | { k: 'str'; max: number; opt?: boolean };
const f = {
  id: (opt = false): Field => ({ k: 'id', opt }),
  bool: (opt = false): Field => ({ k: 'bool', opt }),
  en: (v: readonly string[], opt = false): Field => ({ k: 'enum', v, opt }),
  int: (min: number, max: number, opt = false): Field => ({ k: 'int', min, max, opt }),
  num: (min: number, max: number, opt = false): Field => ({ k: 'num', min, max, opt }),
  str: (max: number, opt = false): Field => ({ k: 'str', max, opt }),
  of: (k: 'cause' | 'vp' | 'ver' | 'frames', opt = false): Field => ({ k, opt }),
};
export const PLATFORMS = ['web', 'pwa', 'apk'] as const;
export const OS = ['android', 'ios', 'windows', 'macos', 'linux', 'chromeos', 'other'] as const;
export const BROWSERS = ['chrome', 'edge', 'firefox', 'safari', 'samsung', 'opera', 'webview', 'other'] as const;
const TIERS = ['low', 'medium', 'high'] as const;
const INPUTS = ['touch', 'kb', 'pad'] as const;
const MODES = ['story', 'practice', 'bossrush', 'survival'] as const;
const ARCADE = ['practice', 'bossrush', 'survival', 'tower'] as const; // tower = 무한의 탑 (wave 칸 = 돌파한 층)
const T_MAX = 86_400; // 초 (스테이지·보스·아케이드 시간 상한)

/** 사건 종류별 허용 필드 (여기 없는 필드가 하나라도 있으면 묶음 전체를 거절한다). 모든 사건에 t(종류)·s(세션 시작 뒤 초) */
export const EVENT_FIELDS: Record<string, Record<string, Field>> = {
  session_start: {
    b: f.of('ver'), plat: f.en(PLATFORMS), os: f.en(OS), br: f.en(BROWSERS), vp: f.of('vp'), dpr: f.num(0.25, 8),
    cores: f.int(0, 256, true), mem: f.num(0, 64, true), q: f.en(['auto', ...TIERS]), tier: f.en(TIERS), input: f.en(INPUTS),
  },
  error: {
    msg: f.str(300), fr: f.of('frames'), kind: f.en(['error', 'rejection', 'caught']), where: f.id(true),
    scene: f.id(true), stage: f.id(true), room: f.id(true), b: f.of('ver', true),
  },
  perf: { fps: f.num(0, 480), p5: f.num(0, 480), tier: f.en(TIERS), heap: f.num(0, 65536, true), dur: f.num(1, 600), scene: f.id(true) },
  stage_start: { stage: f.id(), mode: f.en(MODES), hero: f.id(), cls: f.id(true), lv: f.int(1, 999), diff: f.id(), in: f.en(INPUTS) },
  stage_clear: {
    stage: f.id(), mode: f.en(MODES), time: f.num(0, T_MAX), rank: f.en(['S', 'A', 'B', 'C', 'D']), deaths: f.int(0, 9999),
    hero: f.id(), cls: f.id(true), lv: f.int(1, 999), diff: f.id(),
  },
  death: {
    stage: f.id(), room: f.id(true), x: f.int(-99, 9999), y: f.int(-99, 9999), cause: f.of('cause'), hero: f.id(), lv: f.int(1, 999),
    time: f.num(0, T_MAX), mode: f.en(MODES), diff: f.id(),
  },
  boss_result: { boss: f.id(), stage: f.id(true), dur: f.num(0, T_MAX, true), win: f.bool(), lv: f.int(1, 999), hero: f.id(), diff: f.id(), mode: f.en(MODES) },
  arcade_result: {
    mode: f.en(ARCADE), score: f.int(0, 1e12), wave: f.int(0, 99999, true), bosses: f.int(0, 999, true), time: f.num(0, T_MAX),
    cleared: f.bool(), hero: f.id(), diff: f.id(true), stage: f.id(true),
  },
};
export const EVENT_TYPES = Object.keys(EVENT_FIELDS);

/** 오류 문구에서 식별될 수 있는 부분을 가린다 (주소·메일·IPv4/IPv6·긴 토큰). 클라이언트도 주소를 떼지만 서버에서 한 번 더 */
export function scrub(msg: string): string {
  return String(msg)
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s/'"<>()]+/gi, '')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
    .replace(/\b[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){4,7}\b/gi, '[ip]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .slice(0, 300);
}

function checkField(v: unknown, fd: Field): unknown {
  switch (fd.k) {
    case 'id': return typeof v === 'string' && ID.test(v) ? v : undefined;
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'enum': return typeof v === 'string' && fd.v.includes(v) ? v : undefined;
    case 'int': return Number.isInteger(v) && (v as number) >= fd.min && (v as number) <= fd.max ? v : undefined;
    case 'num': return typeof v === 'number' && Number.isFinite(v) && v >= fd.min && v <= fd.max ? Math.round(v * 100) / 100 : undefined;
    case 'str': return typeof v === 'string' && v.length <= fd.max && !CONTROL.test(v) ? scrub(v) : undefined;
    case 'cause': return typeof v === 'string' && CAUSE.test(v) ? v : undefined;
    case 'vp': return typeof v === 'string' && VP.test(v) ? v : undefined;
    case 'ver': return typeof v === 'string' && VER.test(v) ? v : undefined;
    case 'frames': return Array.isArray(v) && v.length <= 5 && v.every((x) => typeof x === 'string' && FRAME.test(x)) ? [...v] : undefined;
  }
}

/** 사건 하나 → 검사·정리한 사본, 틀리면 null. null 인 선택 필드는 없는 것으로 본다 */
export function checkEvent(e: unknown): Record<string, unknown> | null {
  if (!isObj(e) || typeof e.t !== 'string' || !Object.hasOwn(EVENT_FIELDS, e.t)) return null;
  const spec = EVENT_FIELDS[e.t];
  const s = e.s;
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0 || s > 1e7) return null;
  const out: Record<string, unknown> = { t: e.t, s: Math.round(s * 10) / 10 };
  for (const k of Object.keys(e)) if (k !== 't' && k !== 's' && !Object.hasOwn(spec, k)) return null;
  for (const [k, fd] of Object.entries(spec)) {
    const v = e[k];
    if (v === undefined || v === null) { if (fd.opt) continue; return null; }
    const c = checkField(v, fd);
    if (c === undefined) return null;
    out[k] = c;
  }
  return out;
}

export interface Batch { v: 1; id: string; sid: string; ev: Record<string, unknown>[] }
/** 묶음 {v:1, id, sid, ev:[…]} → 검사한 사본 (틀리면 400 bad_request) */
export function checkBatch(b: unknown): Batch {
  if (!isObj(b) || b.v !== 1 || typeof b.id !== 'string' || !IID.test(b.id) || typeof b.sid !== 'string' || !SID.test(b.sid)) fail('bad_request', 400);
  for (const k of Object.keys(b)) if (!['v', 'id', 'sid', 'ev'].includes(k)) fail('bad_request', 400);
  if (!Array.isArray(b.ev) || b.ev.length < 1 || b.ev.length > TELEMETRY.maxEvents) fail('bad_request', 400);
  const ev = b.ev.map(checkEvent);
  if (ev.some((e) => !e)) fail('bad_request', 400);
  return { v: 1, id: b.id, sid: b.sid, ev: ev as Record<string, unknown>[] };
}

/** application/json 또는 text/plain (sendBeacon) 본문 */
function bodyTypeOk(req: Request): boolean {
  const t = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  return t === 'application/json' || t === 'text/plain';
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
/** UTC 날 'YYYY-MM-DD' */
export const dayOf = (t: number): string => new Date(t).toISOString().slice(0, 10);
/** UTC 시간 칸 'YYYY-MM-DD/HH' */
export const hourOf = (t: number): string => `${dayOf(t)}/${pad2(new Date(t).getUTCHours())}`;

/** POST /api/t — 검사 → 망별 제한 → 원본 저장 → 204 */
export async function ingest(c: Ctx): Promise<Response> {
  if (!bodyTypeOk(c.req)) fail('unsupported_media_type', 415);
  const buf = await readBytes(c.req, TELEMETRY.bodyMax);
  if (buf.byteLength === 0) fail('bad_json', 400);
  let text = '';
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { fail('bad_json', 400); }
  if (jsonDepth(text) > 4) fail('bad_request', 400);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { fail('bad_json', 400); }
  const batch = checkBatch(parsed);
  await limitTelemetryByIp(c);
  const t = now();
  const key = `raw/${hourOf(t)}/${randomBytes(9).toString('base64url')}`;
  await c.store(STORES.telemetry).setJSON(key, { ...batch, at: t });
  return noContent();
}

// ───────────────────────── 요약 ─────────────────────────
type Counts = Record<string, number>;
export interface Agg {
  v: 1; batches: number; events: number; types: Counts; sessions: number;
  dev: Record<'plat' | 'os' | 'br' | 'vp' | 'dpr' | 'cores' | 'mem' | 'q' | 'tier' | 'input' | 'build', Counts>;
  perf: { n: number; fps: Counts; p5: Counts; tier: Counts; heap: Counts };
  starts: Counts; // 'stage|diff' → 시작 수
  clears: Record<string, { n: number; time: Counts; rank: Counts; deaths: number; deathless: number }>; // 'stage|diff'
  deaths: Record<string, { n: number; causes: Counts; rooms: Record<string, { n: number; cells: Counts; causes: Counts }> }>; // stage
  bosses: Record<string, { win: number; lose: number; dur: Counts }>; // dur = 이긴 싸움의 시간 분포
  arcade: Record<string, { n: number; cleared: number; score: Counts; wave: Counts; time: Counts }>;
  errors: Record<string, { n: number; msg: string; fr: string[]; kind: string; scene?: string; stage?: string; b?: string; plat?: string }>;
}
export function emptyAgg(): Agg {
  return {
    v: 1, batches: 0, events: 0, types: {}, sessions: 0,
    dev: { plat: {}, os: {}, br: {}, vp: {}, dpr: {}, cores: {}, mem: {}, q: {}, tier: {}, input: {}, build: {} },
    perf: { n: 0, fps: {}, p5: {}, tier: {}, heap: {} },
    starts: {}, clears: {}, deaths: {}, bosses: {}, arcade: {}, errors: {},
  };
}
const inc = (m: Counts, k: unknown, n = 1): void => { const key = String(k); m[key] = (m[key] ?? 0) + n; };
/** 유효 숫자 두 자리로 묶는 칸 (37 → 37, 125 → 120, 98765 → 98000): 시간·점수 분포 */
export function bucket2(v: number): number {
  if (!(v > 0)) return 0;
  if (v < 10) return Math.floor(v);
  const step = 10 ** (Math.floor(Math.log10(v)) - 1);
  return Math.floor(v / step) * step;
}
const fpsBucket = (v: number): number => Math.min(120, Math.floor(v / 5) * 5);
const heapBucket = (mb: number): number => Math.min(4096, Math.floor(mb / 32) * 32);
const errSig = (msg: string, fr0: string): string =>
  createHash('sha256').update(`${msg.replace(/\d+/g, '#').slice(0, 160)}|${fr0}`).digest('hex').slice(0, 12);

/** 원본 묶음 하나를 요약에 더한다 */
export function foldBatch(a: Agg, b: { ev?: unknown }): void {
  if (!b || !Array.isArray(b.ev)) return;
  a.batches++;
  let plat: string | undefined;
  for (const raw of b.ev) {
    const e = raw as Record<string, any>;
    if (!e || typeof e.t !== 'string' || !Object.hasOwn(EVENT_FIELDS, e.t)) continue;
    a.events++;
    inc(a.types, e.t);
    const sd = `${e.stage}|${e.diff}`;
    switch (e.t) {
      case 'session_start': {
        a.sessions++;
        plat = e.plat;
        const d = a.dev;
        inc(d.plat, e.plat); inc(d.os, e.os); inc(d.br, e.br); inc(d.vp, e.vp); inc(d.dpr, e.dpr); inc(d.q, e.q); inc(d.tier, e.tier); inc(d.input, e.input);
        inc(d.cores, e.cores ?? '?'); inc(d.mem, e.mem ?? '?'); inc(d.build, e.b);
        break;
      }
      case 'perf':
        a.perf.n++; inc(a.perf.fps, fpsBucket(e.fps)); inc(a.perf.p5, fpsBucket(e.p5)); inc(a.perf.tier, e.tier);
        if (typeof e.heap === 'number') inc(a.perf.heap, heapBucket(e.heap));
        break;
      case 'stage_start': inc(a.starts, sd); break;
      case 'stage_clear': {
        const c = (a.clears[sd] ??= { n: 0, time: {}, rank: {}, deaths: 0, deathless: 0 });
        c.n++; inc(c.time, bucket2(e.time)); inc(c.rank, e.rank); c.deaths += e.deaths; if (e.deaths === 0) c.deathless++;
        break;
      }
      case 'death': {
        const s = (a.deaths[e.stage] ??= { n: 0, causes: {}, rooms: {} });
        s.n++; inc(s.causes, e.cause);
        const r = (s.rooms[e.room ?? '?'] ??= { n: 0, cells: {}, causes: {} });
        r.n++; inc(r.cells, `${e.x},${e.y}`); inc(r.causes, e.cause);
        break;
      }
      case 'boss_result': {
        const x = (a.bosses[e.boss] ??= { win: 0, lose: 0, dur: {} });
        if (e.win) { x.win++; if (typeof e.dur === 'number') inc(x.dur, bucket2(e.dur)); } else x.lose++;
        break;
      }
      case 'arcade_result': {
        const x = (a.arcade[e.mode] ??= { n: 0, cleared: 0, score: {}, wave: {}, time: {} });
        x.n++; if (e.cleared) x.cleared++; inc(x.score, bucket2(e.score)); inc(x.time, bucket2(e.time));
        if (typeof e.wave === 'number') inc(x.wave, e.wave);
        break;
      }
      case 'error': {
        const fr = Array.isArray(e.fr) ? e.fr : [];
        const sig = errSig(String(e.msg), fr[0] ?? '');
        const x = a.errors[sig];
        if (x) x.n++;
        else a.errors[sig] = { n: 1, msg: String(e.msg), fr, kind: e.kind, scene: e.scene, stage: e.stage, b: e.b, plat };
        break;
      }
    }
  }
  trim(a);
}

const addCounts = (into: Counts, from: Counts | undefined): void => { for (const [k, v] of Object.entries(from ?? {})) if (Number.isFinite(v)) inc(into, k, v); };
const top = (m: Counts, n: number): Counts =>
  Object.fromEntries(Object.entries(m).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, n));
/** 크기 상한: 방마다 사망 칸 keepCells, 오류 keepErrors (많은 순, 같으면 키 순 — 같은 입력이면 같은 결과) */
function trim(a: Agg): void {
  for (const s of Object.values(a.deaths)) for (const r of Object.values(s.rooms)) if (Object.keys(r.cells).length > TELEMETRY.keepCells) r.cells = top(r.cells, TELEMETRY.keepCells);
  const ek = Object.keys(a.errors);
  if (ek.length > TELEMETRY.keepErrors) {
    const keep = new Set(Object.keys(top(Object.fromEntries(ek.map((k) => [k, a.errors[k].n])), TELEMETRY.keepErrors)));
    for (const k of ek) if (!keep.has(k)) delete a.errors[k];
  }
}

/** 요약 둘을 더한 새 요약 (b 의 모르는 모양은 건너뛴다 — 옛 형식 문서에도 안전) */
export function mergeAgg(a: Agg, b: Partial<Agg> | null | undefined): Agg {
  const o: Agg = structuredClone(a);
  if (!isObj(b)) return o;
  o.batches += Number(b.batches) || 0; o.events += Number(b.events) || 0; o.sessions += Number(b.sessions) || 0;
  addCounts(o.types, b.types);
  for (const k of Object.keys(o.dev) as (keyof Agg['dev'])[]) addCounts(o.dev[k], b.dev?.[k]);
  if (isObj(b.perf)) {
    o.perf.n += Number(b.perf.n) || 0;
    addCounts(o.perf.fps, b.perf.fps); addCounts(o.perf.p5, b.perf.p5); addCounts(o.perf.tier, b.perf.tier); addCounts(o.perf.heap, b.perf.heap);
  }
  addCounts(o.starts, b.starts);
  for (const [k, c] of Object.entries(b.clears ?? {})) {
    const x = (o.clears[k] ??= { n: 0, time: {}, rank: {}, deaths: 0, deathless: 0 });
    x.n += c.n || 0; x.deaths += c.deaths || 0; x.deathless += c.deathless || 0; addCounts(x.time, c.time); addCounts(x.rank, c.rank);
  }
  for (const [k, s] of Object.entries(b.deaths ?? {})) {
    const x = (o.deaths[k] ??= { n: 0, causes: {}, rooms: {} });
    x.n += s.n || 0; addCounts(x.causes, s.causes);
    for (const [rk, r] of Object.entries(s.rooms ?? {})) {
      const y = (x.rooms[rk] ??= { n: 0, cells: {}, causes: {} });
      y.n += r.n || 0; addCounts(y.cells, r.cells); addCounts(y.causes, r.causes);
    }
  }
  for (const [k, s] of Object.entries(b.bosses ?? {})) {
    const x = (o.bosses[k] ??= { win: 0, lose: 0, dur: {} });
    x.win += s.win || 0; x.lose += s.lose || 0; addCounts(x.dur, s.dur);
  }
  for (const [k, s] of Object.entries(b.arcade ?? {})) {
    const x = (o.arcade[k] ??= { n: 0, cleared: 0, score: {}, wave: {}, time: {} });
    x.n += s.n || 0; x.cleared += s.cleared || 0; addCounts(x.score, s.score); addCounts(x.wave, s.wave); addCounts(x.time, s.time);
  }
  for (const [k, e] of Object.entries(b.errors ?? {})) {
    if (o.errors[k]) o.errors[k].n += e.n || 0;
    else o.errors[k] = structuredClone(e);
  }
  trim(o);
  return o;
}

/** 히스토그램 백분위 (칸의 아래 끝 값). 비었으면 null */
export function pct(h: Counts | undefined, p: number): number | null {
  const ent = Object.entries(h ?? {}).map(([k, n]) => [Number(k), n] as const).filter(([k, n]) => Number.isFinite(k) && n > 0).sort((x, y) => x[0] - y[0]);
  const total = ent.reduce((s, [, n]) => s + n, 0);
  if (!total) return null;
  let cum = 0;
  for (const [k, n] of ent) { cum += n; if (cum >= p * total) return k; }
  return ent[ent.length - 1][0];
}

/** 읽기 좋은 파생 값: 클리어 시간 백분위, 보스 승률·중앙 시간, 아케이드 점수 분포, fps 분포, 오류 순위 */
export function summarize(a: Agg): Record<string, unknown> {
  const q = (h: Counts) => ({ p25: pct(h, 0.25), p50: pct(h, 0.5), p75: pct(h, 0.75), p90: pct(h, 0.9) });
  return {
    clears: Object.fromEntries(Object.entries(a.clears).map(([k, c]) => {
      const [stage, diff] = k.split('|');
      return [k, { stage, diff, n: c.n, starts: a.starts[k] ?? 0, time: q(c.time), rank: c.rank, deathsPerClear: c.n ? Math.round((c.deaths / c.n) * 100) / 100 : null, deathless: c.deathless }];
    })),
    bosses: Object.fromEntries(Object.entries(a.bosses).map(([k, b]) => [k, { win: b.win, lose: b.lose, winRate: b.win + b.lose ? Math.round((b.win / (b.win + b.lose)) * 1000) / 1000 : null, medianWinSec: pct(b.dur, 0.5) }])),
    arcade: Object.fromEntries(Object.entries(a.arcade).map(([k, x]) => [k, { n: x.n, cleared: x.cleared, score: q(x.score), wave: q(x.wave), time: q(x.time) }])),
    fps: { samples: a.perf.n, avg: q(a.perf.fps), p5: q(a.perf.p5) },
    deathSpots: Object.entries(a.deaths).flatMap(([stage, s]) => Object.entries(s.rooms).map(([room, r]) => ({ stage, room, n: r.n, topCells: top(r.cells, 5), topCauses: top(r.causes, 3) })))
      .sort((x, y) => y.n - x.n).slice(0, 30),
    topErrors: Object.entries(a.errors).sort((x, y) => y[1].n - x[1].n).slice(0, 30).map(([sig, e]) => ({ sig, ...e })),
  };
}

// ───────────────────────── 모으기 (매시) ─────────────────────────
interface HourMark { n: number; h: string }
interface AggState { v: 1; hours: Record<string, HourMark> }
const fingerprint = (keys: string[]): string => createHash('sha256').update([...keys].sort().join('\n')).digest('hex').slice(0, 16);

async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  for (let i = 0; i < items.length; i += n) {
    const part = await Promise.all(items.slice(i, i + n).map(fn));
    for (let j = 0; j < part.length; j++) out[i + j] = part[j];
  }
  return out;
}

export interface AggReport { hours: number; raws: number; days: string[]; pending: number; ms: number }
/**
 * 끝난 시간 칸(끝 + aggGraceMs 지남) 중 원본 키 목록이 지난번과 달라진 칸만 다시 계산한다 (hour/<칸> 을 그 칸의 원본 전부로 새로 씀),
 * 그런 칸이 있는 날은 agg/<날> 을 그날 시간 요약의 합으로 새로 쓴다. 마지막에 state/agg 에 칸별 지문을 적는다.
 * 중간에 멈춰도 다음 실행이 같은 칸을 처음부터 다시 계산하므로 두 번 세지 않는다.
 * opts.days: 살펴볼 날 수 (기본 aggRecheckDays — 오래 멈춰 있었다면 더 크게 한 번 돌린다), opts.maxRaw: 한 번에 읽는 원본 수 (기본 aggMaxRawPerRun)
 */
export async function runAggregation(c: Ctx, opts: { days?: number; maxRaw?: number } = {}): Promise<AggReport> {
  const t0 = now();
  const st = c.store(STORES.telemetry);
  const days = Math.max(1, Math.min(TELEMETRY.rawKeepDays + 1, Math.floor(opts.days ?? TELEMETRY.aggRecheckDays)));
  const stateRaw = await st.get('state/agg', { type: 'json' }).catch(() => null);
  const state: AggState = isObj(stateRaw) && isObj(stateRaw.hours) ? (stateRaw as AggState) : { v: 1, hours: {} };
  // 살펴볼 날의 원본 키 → 시간 칸별
  const byHour = new Map<string, string[]>();
  for (let i = days - 1; i >= 0; i--) {
    const day = dayOf(t0 - i * DAY_MS);
    const { blobs } = await st.list({ prefix: `raw/${day}/` });
    for (const b of blobs) {
      const m = /^raw\/(\d{4}-\d{2}-\d{2}\/\d{2})\//.exec(b.key);
      if (!m) continue;
      let arr = byHour.get(m[1]);
      if (!arr) byHour.set(m[1], (arr = []));
      arr.push(b.key);
    }
  }
  const due: [string, string[], HourMark][] = [];
  for (const [hour, keys] of [...byHour.entries()].sort()) {
    const end = Date.parse(`${hour.slice(0, 10)}T${hour.slice(11, 13)}:00:00Z`) + HOUR_MS;
    if (!(end + TELEMETRY.aggGraceMs <= t0)) continue; // 아직 쓰이는 중일 수 있는 칸
    const mark = { n: keys.length, h: fingerprint(keys) };
    const old = state.hours[hour];
    if (old && old.n === mark.n && old.h === mark.h) continue;
    due.push([hour, keys, mark]);
  }
  let raws = 0, hours = 0, pending = 0;
  const touched = new Set<string>();
  for (const [hour, keys, mark] of due) {
    if (raws > 0 && raws + keys.length > (opts.maxRaw ?? TELEMETRY.aggMaxRawPerRun)) { pending++; continue; } // 다음 실행에서
    const agg = emptyAgg();
    const docs = await mapLimit(keys, TELEMETRY.concurrency, (k) => st.get(k, { type: 'json' }).catch(() => null));
    for (const d of docs) if (isObj(d)) foldBatch(agg, d);
    await st.setJSON(`hour/${hour}`, { ...agg, hour, src: mark });
    state.hours[hour] = mark;
    raws += keys.length; hours++;
    touched.add(hour.slice(0, 10));
  }
  for (const day of touched) {
    const { blobs } = await st.list({ prefix: `hour/${day}/` });
    const docs = await mapLimit(blobs.map((b) => b.key), TELEMETRY.concurrency, (k) => st.get(k, { type: 'json' }).catch(() => null));
    let agg = emptyAgg();
    for (const d of docs) agg = mergeAgg(agg, d as Partial<Agg>);
    await st.setJSON(`agg/${day}`, { ...agg, day, hours: docs.filter(Boolean).length, at: now(), summary: summarize(agg) });
  }
  // 보관 기간이 지난 칸의 지문은 버린다 (원본도 지워진다)
  const cutoff = dayOf(t0 - (TELEMETRY.rawKeepDays + 1) * DAY_MS);
  for (const h of Object.keys(state.hours)) if (h.slice(0, 10) < cutoff) delete state.hours[h];
  if (hours > 0) await st.setJSON('state/agg', state);
  return { hours, raws, days: [...touched].sort(), pending, ms: now() - t0 };
}

// ───────────────────────── 공개 통계 ─────────────────────────
/** GET /api/stats?days=N (1..30, 기본 7) — 최근 N일(UTC, 오늘 포함) 날 요약을 합친 것 */
export async function stats(c: Ctx): Promise<Response> {
  let u: URL;
  try { u = new URL(c.req.url); } catch { fail('bad_request', 400); }
  const raw = u!.searchParams.get('days');
  const n = raw === null ? 7 : /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > TELEMETRY.statsMaxDays) fail('bad_request', 400);
  const t = now();
  const st = c.store(STORES.telemetry);
  const days = Array.from({ length: n }, (_, i) => dayOf(t - (n - 1 - i) * DAY_MS));
  const docs = await mapLimit(days, TELEMETRY.concurrency, (d) => st.get(`agg/${d}`, { type: 'json' }).catch(() => null));
  let total = emptyAgg();
  const daily: Record<string, unknown>[] = [];
  docs.forEach((d, i) => {
    const doc = isObj(d) ? (d as Partial<Agg>) : null;
    if (doc) total = mergeAgg(total, doc);
    daily.push({
      day: days[i], sessions: Number(doc?.sessions) || 0, events: Number(doc?.events) || 0,
      errors: Number(doc?.types?.error) || 0, deaths: Number(doc?.types?.death) || 0, clears: Number(doc?.types?.stage_clear) || 0,
    });
  });
  return json(200, { ok: true, api: 1, days: n, from: days[0], to: days[days.length - 1], generatedAt: t, daily, totals: total, summary: summarize(total) },
    { 'Cache-Control': `public, max-age=${TELEMETRY.statsCacheSec}` });
}

// ───────────────────────── 정리 (매일) ─────────────────────────
/** 보관 기간(rawKeepDays)이 지난 raw/·hour/ 키를 지운다 (키의 날짜만 보고 읽지 않는다). agg/·state/ 는 남긴다 */
export async function sweepTelemetry(st: KV, t: number, maxPerRun: number, concurrency: number): Promise<{ seen: number; deleted: number }> {
  const cutoff = dayOf(t - TELEMETRY.rawKeepDays * DAY_MS); // 이 날보다 앞선 날의 칸은 지운다
  let seen = 0;
  const old: string[] = [];
  for (const prefix of ['raw/', 'hour/']) {
    const { blobs } = await st.list({ prefix });
    for (const b of blobs) {
      seen++;
      const m = /^(?:raw|hour)\/(\d{4}-\d{2}-\d{2})\//.exec(b.key);
      if (!m || m[1] < cutoff) old.push(b.key);
    }
  }
  const pick = old.slice(0, maxPerRun);
  await mapLimit(pick, concurrency, (k) => st.delete(k));
  return { seen, deleted: pick.length };
}
