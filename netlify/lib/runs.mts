// 런 토큰과 일일 도전 (docs/specs/online.md §2.1·§2.5·§3).
//  - 런 토큰: base64url(JSON {v, b: 보드 ID, a: 계정 꼬리표, ts: 시작 시각, n: nonce}) + '.' + base64url(HMAC-SHA256).
//    계정 꼬리표는 uid 의 HMAC (uid 를 클라이언트에 드러내지 않는다). 같은 런은 한 번만 제출 (nonce → bn-runs, online.mts).
//  - 일일 도전: 한국 날짜 + 비밀 키의 HMAC 에서 결정적으로 만든다 (같은 날 같은 값, 키 없이는 미리 알 수 없다).
//  - 키: AUTH_PEPPER 에서 용도별로 유도한다. 없으면 고정 문자열 (개발·시험용 — 인스턴스마다 한 번 경고).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { CHARACTER_IDS } from './config.mts';
import { CLASS_INFO, LEVEL_PRESETS, P2_STAGES, STAGE_IDS, STAGE_LEVELS } from './gamedata.mts';
import { env } from './runtime.mts';

const FALLBACK_KEY = 'bn-online-dev-key-not-secret';
let warned = false;

/** 용도별 키 (AUTH_PEPPER 를 바꾸면 이전 런 토큰은 무효가 되고 일일 도전 내용이 바뀐다 — AUTH_PEPPER 는 원래 바꾸지 않는다) */
function key(label: string): Buffer {
  let base = env('AUTH_PEPPER');
  if (!base) {
    if (!warned) {
      warned = true;
      console.warn('[online] 경고: AUTH_PEPPER 환경 변수가 없습니다 — 런 토큰 서명·일일 도전이 공개된 고정 키를 씁니다 (위조·예측 가능). 운영 배포 전에 넣으세요 (docs/ONLINE.md)');
    }
    base = FALLBACK_KEY;
  }
  return createHmac('sha256', base).update(`bn-online:${label}:v1`).digest();
}

const b64u = (b: Buffer | string): string => Buffer.from(b).toString('base64url');

/** 계정 꼬리표: uid 의 HMAC 앞 128비트 */
export function acctTag(uid: string): string {
  return createHmac('sha256', key('acct')).update(uid).digest().subarray(0, 16).toString('base64url');
}

export interface RunClaims { b: string; a: string; ts: number; n: string }

export function signRun(board: string, uid: string, ts: number): { run: string; nonce: string } {
  const nonce = randomBytes(16).toString('base64url');
  const p = b64u(JSON.stringify({ v: 1, b: board, a: acctTag(uid), ts, n: nonce }));
  const sig = createHmac('sha256', key('run')).update(`run1.${p}`).digest();
  return { run: `${p}.${b64u(sig)}`, nonce };
}

const RUN_RE = /^([A-Za-z0-9_-]{16,400})\.([A-Za-z0-9_-]{43})$/;

/** 서명 확인 → 내용, 형식·서명이 틀리면 null (만료·계정·보드 확인은 부르는 쪽) */
export function openRun(run: unknown): RunClaims | null {
  if (typeof run !== 'string') return null;
  const m = RUN_RE.exec(run);
  if (!m) return null;
  const want = createHmac('sha256', key('run')).update(`run1.${m[1]}`).digest();
  const got = Buffer.from(m[2], 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let o: any;
  try { o = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch { return null; }
  if (!o || o.v !== 1 || typeof o.b !== 'string' || typeof o.a !== 'string' || !Number.isSafeInteger(o.ts) || typeof o.n !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(o.n)) return null;
  return { b: o.b, a: o.a, ts: o.ts, n: o.n };
}

/** 같은 계정인가 (꼬리표 비교) */
export function sameAcct(tag: string, uid: string): boolean {
  const a = Buffer.from(tag), b = Buffer.from(acctTag(uid));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 32비트 부호 없는 무작위 시드 */
export const randomSeed = (): number => randomBytes(4).readUInt32BE(0);

// ── 일일 도전 ──
export const DAILY_MODS: readonly string[] = ['hp_x1.5', 'no_potion', 'glass', 'haste', 'dark', 'no_sub'];
/** 함께 나오지 않는 규칙: 유리 대포(받는 피해 2배)+물약 금지는 너무 가혹하고, 적 체력 1.5배+유리 대포는 서로 상쇄된다 */
export const DAILY_CONFLICTS: readonly (readonly [string, string])[] = [['glass', 'no_potion'], ['hp_x1.5', 'glass']];
export const DAILY_DIFFS: readonly string[] = ['normal', 'hard'];
const conflicts = (a: string, b: string): boolean => DAILY_CONFLICTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/**
 * 스테이지에 맞는 헌터 등급: 2부 스테이지는 2부 등급, 1부는 스테이지 권장 레벨 이상인 1부 등급 중 낮은 두 개
 * (s01~s04 → 0·1, s05~s09 → 1·2, s10~s12 → 2·3, s13 → 3)
 */
export function dailyPresets(stageId: string): number[] {
  const all = LEVEL_PRESETS.map((p, i) => ({ ...p, i }));
  if (P2_STAGES.includes(stageId)) return all.filter((p) => p.p2).map((p) => p.i);
  const lv = STAGE_LEVELS[stageId] ?? 1;
  const ok = all.filter((p) => !p.p2 && p.lv >= lv).sort((a, b) => a.lv - b.lv).map((p) => p.i);
  return ok.length ? ok.slice(0, 2) : [all.filter((p) => !p.p2).pop()!.i];
}

export interface Daily { date: string; seed: number; stageId: string; diff: string; hero: string; cls: string; preset: number; mods: string[]; board: string }

/** 'YYYYMMDD' (한국 날짜) → 그날의 도전 */
export function dailyFor(date: string): Daily {
  const k = key('daily');
  const h = Buffer.concat([0, 1].map((i) => createHmac('sha256', k).update(`daily:${date}:${i}`).digest()));
  const w = (i: number): number => h.readUInt32BE(i * 4); // 16개
  const stageId = STAGE_IDS[w(1) % STAGE_IDS.length];
  const hero = CHARACTER_IDS[w(3) % CHARACTER_IDS.length];
  const presets = dailyPresets(stageId);
  const preset = presets[w(4) % presets.length];
  const tier = LEVEL_PRESETS[preset].tier;
  const classes = Object.keys(CLASS_INFO).filter((id) => CLASS_INFO[id][0] === hero && CLASS_INFO[id][1] === tier);
  const pool = [...DAILY_MODS];
  for (let i = pool.length - 1; i > 0; i--) { const j = w(8 + i) % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const mods = [pool[0]];
  if (w(6) % 2 === 1) { const m2 = pool.slice(1).find((m) => !conflicts(pool[0], m)); if (m2) mods.push(m2); }
  return {
    date, seed: w(0), stageId, diff: DAILY_DIFFS[w(2) % DAILY_DIFFS.length], hero, cls: classes[w(5) % classes.length],
    preset, mods, board: `daily:${date}`,
  };
}
