// 회랑 메타(meta.gal) 만들기·병합·정리 — 순수 함수, import 없음 (core/cloud.js 가 정적으로 읽어 첫 조각에 실린다).
// 계약: docs/specs/gallery.md §2. 엔진은 src/game/gallery.js, 목록은 src/data/gallery.js.
//  meta.gal = { v:1, cg:{id:ms}, mus:{id:ms}, seenAt:ms, …모르는 필드 } — 열린 그림·곡 id → 처음 열린 시각. 'always' 곡·극장은 적지 않는다
//  - ensureGal(meta) : meta.gal 을 제자리에서 고치고(없으면 만든다) 돌려준다. 모르는 필드·모르는 id 는 남긴다. 멱등, 던지지 않는다
//  - mergeGal(a, b)  : a = 이 기기, b = 서버. cg·mus 합집합(가장 이른 시각) · seenAt·v 큰 값 · 모르는 필드 {...b, ...a}. 교환·결합·멱등
//  - cleanGal(gal)   : 올리기 전 사본 — 규칙 밖 버림 → 키 상한(cg 64 · mus 96)을 넘으면 키 순서로 자름 → 8 KB 를 넘으면 모르는 필드부터 버림
//  서버(netlify/lib/validate.mts isValidMeta)는 gal 을 검사하지 않는다 (모르는 메타 필드 허용) — 크기는 cleanGal 이 묶는다 (시험 G6)

/** 키 규칙 (cg·mus — 업적과 같음) */
export const GAL_KEY_RE = /^[a-z][a-z0-9_]{1,31}$/;
/** 상한. 크기는 JSON.stringify 길이 */
export const GAL_LIMITS = Object.freeze({ maxBytes: 8 * 1024, cgMax: 64, musMax: 96, timeMax: 1e13, vMax: 99 });

const L = GAL_LIMITS;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const okKey = (k) => typeof k === 'string' && GAL_KEY_RE.test(k);
const okTime = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= L.timeMax;   // 열린 시각: 0 < t ≤ 1e13
const okSeen = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= L.timeMax;   // seenAt: 0 = 아직 닫은 적 없음
const cleanV = (v) => (Number.isInteger(v) && v >= 1 ? Math.min(v, L.vMax) : 1);
const KNOWN = ['v', 'cg', 'mus', 'seenAt'];

/** 새 빈 기록 */
export function newGal() {
  return { v: 1, cg: {}, mus: {}, seenAt: 0 };
}
/** 키 규칙·범위 밖 항목을 버린 시각 표 (새 객체) */
function cleanMap(m) {
  const out = {};
  if (!isObj(m)) return out;
  for (const k of Object.keys(m)) if (okKey(k) && okTime(m[k])) out[k] = m[k];
  return out;
}
/** g 를 제자리에서 고친다 (알려진 필드만, 모르는 필드는 그대로) → g */
function fixInPlace(g) {
  g.v = cleanV(g.v);
  g.cg = cleanMap(g.cg);
  g.mus = cleanMap(g.mus);
  g.seenAt = okSeen(g.seenAt) ? g.seenAt : 0;
  return g;
}
// ensureGal 이 한 번 고친 객체 표시 (열거되지 않아 JSON·병합에 실리지 않는다). 그 뒤로 cg·mus 는 엔진만 고친다
const OK = Symbol('galOk');

/**
 * meta.gal 이 객체가 아니면 새로 만들고, 객체면 제자리에서 고친다 → gal. 멱등, 던지지 않는다.
 * meta 자체가 객체가 아니면 붙이지 않은 새 기록을 돌려준다
 */
export function ensureGal(meta) {
  try {
    if (!isObj(meta)) return newGal();
    if (!isObj(meta.gal)) { meta.gal = newGal(); return meta.gal; }
    const g = meta.gal;
    // 이미 고친 모양이면 빠르게 넘어간다 (화면이 프레임마다 읽는다)
    if (g[OK] === true && Number.isInteger(g.v) && g.v >= 1 && g.v <= L.vMax && isObj(g.cg) && isObj(g.mus) && okSeen(g.seenAt)) return g;
    fixInPlace(g);
    try { Object.defineProperty(g, OK, { value: true, enumerable: false, configurable: true, writable: true }); } catch { /* 얼린 객체 */ }
    return g;
  } catch {
    const g = newGal();
    try { if (isObj(meta)) meta.gal = g; } catch { /* 무시 */ }
    return g;
  }
}
/** JSON 사본 (순환·BigInt 등으로 실패하면 null) */
function jclone(v) {
  try { return JSON.parse(JSON.stringify(v)); } catch { return null; }
}
/** 받은 값 → 고친 사본 (객체가 아니면 null) */
function fixedCopy(x) {
  if (!isObj(x)) return null;
  const c = jclone(x);
  if (!isObj(c)) return null;
  delete c.__proto__;
  return fixInPlace(c);
}
/** 두 시각 표 합집합 — 키마다 작은 값 (가장 이른 열림) */
function unionMin(A, B) {
  const out = {};
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const x = Object.hasOwn(A, k) ? A[k] : null, y = Object.hasOwn(B, k) ? B[k] : null;
    out[k] = x === null ? y : y === null ? x : Math.min(x, y);
  }
  return out;
}

/**
 * 두 기록 합치기 (a = 이 기기, b = 서버) → 새 기록. 교환·결합·멱등 (cg·mus·seenAt·v).
 * 한쪽만 객체면 그것을 고친 사본. 둘 다 아니면 새 빈 기록
 */
export function mergeGal(a, b) {
  const A = fixedCopy(a), B = fixedCopy(b);
  if (!A && !B) return newGal();
  if (!A) return B;
  if (!B) return A;
  const out = { ...B, ...A };   // 모르는 필드: 이 기기 우선 (mergeMeta 와 같은 규칙)
  out.v = Math.max(A.v, B.v);
  out.cg = unionMin(A.cg, B.cg);
  out.mus = unionMin(A.mus, B.mus);
  out.seenAt = Math.max(A.seenAt, B.seenAt);
  return out;
}

/** 키 순서대로 앞의 n 개만 */
function capMap(m, n) {
  const keys = Object.keys(m).sort();
  if (keys.length <= n) return m;
  const out = {};
  for (const k of keys.slice(0, n)) out[k] = m[k];
  return out;
}
const size = (o) => { try { return JSON.stringify(o).length; } catch { return Infinity; } };

/**
 * 올리기 전 사본: 키 규칙·범위 밖 버림 → 키 상한을 넘으면 키 순서대로 자름 → 8 KB 를 넘으면 모르는 필드부터 버린다
 * (그래도 넘으면 — 소수 시각 같은 긴 값 — mus → cg 의 뒤쪽부터). 결과는 늘 isValidGal 참. 던지지 않는다
 */
export function cleanGal(gal) {
  let o = fixedCopy(gal) ?? newGal();
  o.cg = capMap(o.cg, L.cgMax);
  o.mus = capMap(o.mus, L.musMax);
  if (size(o) > L.maxBytes) {
    const extra = Object.keys(o).filter((k) => !KNOWN.includes(k)).sort((x, y) => size(o[y]) - size(o[x]));
    for (const k of extra) { delete o[k]; if (size(o) <= L.maxBytes) break; }
  }
  if (size(o) > L.maxBytes) {
    o = { v: o.v, cg: o.cg, mus: o.mus, seenAt: o.seenAt };
    for (const k of ['mus', 'cg']) {
      const keys = Object.keys(o[k]).sort();
      while (keys.length && size(o) > L.maxBytes) for (const d of keys.splice(Math.max(0, keys.length - 8), 8)) delete o[k][d];
    }
  }
  return o;
}

/** 모양 검사 (시험·도구용 — 서버는 gal 을 검사하지 않는다). cleanGal 결과는 늘 참. 모르는 필드는 허용 */
export function isValidGal(g) {
  if (!isObj(g) || size(g) > L.maxBytes) return false;
  if ('v' in g && !(Number.isInteger(g.v) && g.v >= 1 && g.v <= L.vMax)) return false;
  const map = (m, n) => isObj(m) && Object.keys(m).length <= n && Object.keys(m).every((k) => okKey(k) && okTime(m[k]));
  if ('cg' in g && !map(g.cg, L.cgMax)) return false;
  if ('mus' in g && !map(g.mus, L.musMax)) return false;
  if ('seenAt' in g && !okSeen(g.seenAt)) return false;
  return true;
}
