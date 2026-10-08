// 업적 메타(meta.ach) 만들기·이관·병합·정리 — 순수 함수, 데이터 import 없음 (첫 조각에 실린다: title.js 가 ACH_DECOS 를 읽는다).
// 계약: docs/specs/achievements.md §2. 엔진은 src/game/achievements.js, 업적 표는 src/data/achievements.js.
//  meta.ach = { v:1, got:{id:ts}, prog:{key:n}, claimed:[id], seenAt:ts, title:'t_…'|null, deco:'d_…'|null, cos?:{trail:'tr_…'|null}, …모르는 필드 }
//    cos = 외형 꾸미기 (data/cosmetics.js — 대시 잔상 색, 벤치마크 5). 선택 필드: 없으면 '직업 기본'. newAch 는 만들지 않는다.
//    서버 검사·병합은 모르는 필드와 같다 (기기 우선 {...b, ...a}). fixInPlace 는 있으면 키 규칙 밖 칸만 버린다
//  - ensureAch(meta)  : meta.ach 를 제자리에서 고치고(없으면 만든다) 돌려준다. 모르는 필드는 남긴다. 멱등, 던지지 않는다
//  - mergeAch(a, b)   : a = 이 기기, b = 서버. got 합집합(가장 이른 시각) · prog 큰 값 · claimed 합집합 · seenAt·v 큰 값 · title/deco 기기 우선
//  - cleanAch(ach)    : 올리기 전 사본 — 결과는 늘 isValidAch 참 (서버 netlify/lib/validate.mts isValidAch 와 같은 규칙, 시험 C6)
//  - ACH_LIMITS·ACH_KEY_RE 는 서버 netlify/lib/config.mts ACH 와 같은 숫자다 (tools/test_achievements.mjs C1 이 대조) — 어긋나면 메타 동기화 전체가 멈춘다
//  - ACH_TITLES (이명 17) · ACH_DECOS (타이틀 장식 5). 이명 id 는 서버 gamedata.mts TITLE_IDS 와 같아야 한다 (C1)

/** 키 규칙 (got·prog·claimed·title·deco) */
export const ACH_KEY_RE = /^[a-z][a-z0-9_]{1,31}$/;
/** 상한 (= config.mts ACH). 크기는 JSON.stringify 길이 */
export const ACH_LIMITS = Object.freeze({
  maxBytes: 24 * 1024, gotMax: 256, progMax: 128, claimedMax: 256,
  timeMax: 1e13, progValMax: 1e9, vMax: 99,
});

/** 이명 (§5.1). 순위표(front/highscore.js)·서버 사본(gamedata.mts TITLE_IDS)이 읽는다. 어느 업적이 주는지는 data/achievements.js 의 reward.title */
export const ACH_TITLES = Object.freeze({
  t_dawn: { name: '새벽을 연 자' },
  t_warden: { name: '이계의 파수꾼' },
  t_chronicler: { name: '연대기의 증인' },
  t_reaper: { name: '피의 수확자' },
  t_nocturne: { name: '피의 야상곡' },
  t_apex: { name: '일곱 정점' },
  t_awakened: { name: '각성한 자' },
  t_stable: { name: '마구간의 주인' },
  t_guardian: { name: '수호신의 벗' },
  t_scholar: { name: '금서의 주인' },
  t_rush: { name: '스물두 번의 결착' },
  t_tower: { name: '탑을 오른 자' },
  t_lucky: { name: '행운의 손' },
  t_perfect: { name: '완벽한 사냥꾼' },
  t_nightmare: { name: '악몽을 걷는 자' },
  t_count: { name: '백작 사냥꾼' },
  t_legend: { name: '블러드 녹턴' },
});
/** 타이틀 장식 (§5.2) — title.js 가 amb 를 Ambience 인자에 더한다 (batsMul·motesMul 은 수에 곱하고, moon 은 달 원판 하나) */
export const ACH_DECOS = Object.freeze({
  d_gold: { name: '황금 불씨', amb: { emberColor: '#ffd070' } },
  d_violet: { name: '이계의 별빛', amb: { emberColor: '#c8b8ff', fogTint: '#3a2a6a' } },
  d_silver: { name: '은빛 깃털', amb: { emberColor: '#cfe6ff', motesMul: 1.6 } },
  d_crow: { name: '까마귀 떼', amb: { emberColor: '#ff4a6a', batsMul: 2 } },
  d_moon: { name: '핏빛 달', amb: { emberColor: '#ff3040', fogTint: '#5a1a2a', moon: true } },
});

const L = ACH_LIMITS;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const okKey = (k) => typeof k === 'string' && ACH_KEY_RE.test(k);
const okNum = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const KNOWN = ['v', 'got', 'prog', 'claimed', 'seenAt', 'title', 'deco', 'cos'];
const COS_MAX = 8;   // 외형 칸 수 상한 (잔상 · 앞으로의 망토 등)

/** 새 빈 기록 */
export function newAch() {
  return { v: 1, got: {}, prog: {}, claimed: [], seenAt: 0, title: null, deco: null };
}

/** 키 규칙·범위 밖 항목을 버린 숫자 표 (새 객체) */
function cleanNumMap(m, max) {
  const out = {};
  if (!isObj(m)) return out;
  for (const k of Object.keys(m)) if (okKey(k) && okNum(m[k], max)) out[k] = m[k];
  return out;
}
function cleanKeyList(a) {
  if (!Array.isArray(a)) return [];
  return [...new Set(a.filter(okKey))];
}
// ensureAch 가 한 번 고친 객체 표시 (열거되지 않아 JSON·병합에 실리지 않는다). 그 뒤로 got·prog 는 엔진만 고친다
const OK = Symbol('achOk');
const cleanV = (v) => (Number.isInteger(v) && v >= 1 ? Math.min(v, L.vMax) : 1);
const cleanSel = (v) => (okKey(v) ? v : null);
/** 외형 cos: 객체가 아니면 undefined (필드를 지운다). 칸 이름·값(null 또는 키 규칙 문자열)이 맞는 것만 COS_MAX 개까지 */
function cleanCos(c) {
  if (!isObj(c)) return undefined;
  const out = {};
  let n = 0;
  for (const k of Object.keys(c)) {
    if (n >= COS_MAX) break;
    if (okKey(k) && (c[k] === null || okKey(c[k]))) { out[k] = c[k]; n++; }
  }
  return out;
}

/** a 를 제자리에서 고친다 (알려진 필드만, 모르는 필드는 그대로) → a */
function fixInPlace(a) {
  a.v = cleanV(a.v);
  a.got = cleanNumMap(a.got, L.timeMax);
  a.prog = cleanNumMap(a.prog, L.progValMax);
  a.claimed = cleanKeyList(a.claimed);
  a.seenAt = okNum(a.seenAt, L.timeMax) ? a.seenAt : 0;
  a.title = cleanSel(a.title);
  a.deco = cleanSel(a.deco);
  if ('cos' in a) { const c = cleanCos(a.cos); if (c) a.cos = c; else delete a.cos; }
  return a;
}

/**
 * meta.ach 가 객체가 아니면 새로 만들고, 객체면 제자리에서 고친다 → ach. 멱등, 던지지 않는다.
 * meta 자체가 객체가 아니면 붙이지 않은 새 기록을 돌려준다
 */
export function ensureAch(meta) {
  try {
    if (!isObj(meta)) return newAch();
    if (!isObj(meta.ach)) { meta.ach = newAch(); return meta.ach; }
    const a = meta.ach;
    // 이미 고친 모양이면 빠르게 넘어간다 (엔진이 사건마다 부른다)
    if (a.v >= 1 && Number.isInteger(a.v) && a.v <= L.vMax && isObj(a.got) && isObj(a.prog) && Array.isArray(a.claimed)
      && okNum(a.seenAt, L.timeMax) && (a.title === null || okKey(a.title)) && (a.deco === null || okKey(a.deco)) && a[OK] === true) return a;
    fixInPlace(a);
    try { Object.defineProperty(a, OK, { value: true, enumerable: false, configurable: true, writable: true }); } catch { /* 얼린 객체 */ }
    return a;
  } catch {
    const a = newAch();
    try { if (isObj(meta)) meta.ach = a; } catch { /* 무시 */ }
    return a;
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

/**
 * 두 기록 합치기 (a = 이 기기, b = 서버) → 새 기록. 교환·결합·멱등 (got 기준).
 * 한쪽만 객체면 그것을 고친 사본. 둘 다 아니면 새 빈 기록
 */
export function mergeAch(a, b) {
  const A = fixedCopy(a), B = fixedCopy(b);
  if (!A && !B) return newAch();
  if (!A) return B;
  if (!B) return A;
  const out = { ...B, ...A };   // 모르는 필드: 이 기기 우선 (mergeMeta 와 같은 규칙)
  out.v = Math.max(A.v, B.v);
  const got = {};
  for (const k of new Set([...Object.keys(A.got), ...Object.keys(B.got)])) {
    const x = Object.hasOwn(A.got, k) ? A.got[k] : null, y = Object.hasOwn(B.got, k) ? B.got[k] : null;
    got[k] = x === null ? y : y === null ? x : Math.min(x, y);
  }
  out.got = got;
  const prog = {};
  for (const k of new Set([...Object.keys(A.prog), ...Object.keys(B.prog)])) {
    const x = Object.hasOwn(A.prog, k) ? A.prog[k] : -1, y = Object.hasOwn(B.prog, k) ? B.prog[k] : -1;
    prog[k] = Math.max(x, y);
  }
  out.prog = prog;
  out.claimed = [...new Set([...A.claimed, ...B.claimed])].sort();
  out.seenAt = Math.max(A.seenAt, B.seenAt);
  out.title = typeof A.title === 'string' ? A.title : B.title;
  out.deco = typeof A.deco === 'string' ? A.deco : B.deco;
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
 * 올리기 전 사본: 키 규칙·범위 밖 버림 → 상한을 넘으면 키 순서대로 자름 → 24 KB 를 넘으면 모르는 필드부터 버린다
 * (그래도 넘으면 claimed → prog → got 의 뒤쪽부터). 결과는 늘 isValidAch 참. 던지지 않는다
 */
export function cleanAch(ach) {
  let o = fixedCopy(ach) ?? newAch();
  o.got = capMap(o.got, L.gotMax);
  o.prog = capMap(o.prog, L.progMax);
  o.claimed = o.claimed.sort().slice(0, L.claimedMax);
  if (size(o) > L.maxBytes) {
    // 모르는 필드부터 (긴 것 먼저)
    const extra = Object.keys(o).filter((k) => !KNOWN.includes(k)).sort((x, y) => size(o[y]) - size(o[x]));
    for (const k of extra) { delete o[k]; if (size(o) <= L.maxBytes) break; }
  }
  if (size(o) > L.maxBytes) {
    o = { v: o.v, got: o.got, prog: o.prog, claimed: o.claimed, seenAt: o.seenAt, title: o.title, deco: o.deco, ...(o.cos ? { cos: o.cos } : {}) };
    const trim = (k) => {
      const isArr = Array.isArray(o[k]);
      const keys = isArr ? o[k] : Object.keys(o[k]).sort();
      while (keys.length && size(o) > L.maxBytes) {
        const drop = keys.splice(Math.max(0, keys.length - 16), 16);
        if (isArr) o[k] = keys;
        else for (const d of drop) delete o[k][d];
      }
    };
    for (const k of ['claimed', 'prog', 'got']) if (size(o) > L.maxBytes) trim(k);
  }
  return o;
}

/**
 * 서버 검사와 같은 규칙 (netlify/lib/validate.mts isValidAch — 브라우저 쪽 사본, 시험이 두 쪽을 함께 돌린다).
 * 모르는 필드는 허용
 */
export function isValidAch(a) {
  if (!isObj(a)) return false;
  if (size(a) > L.maxBytes) return false;
  if ('v' in a && !(Number.isInteger(a.v) && a.v >= 1 && a.v <= L.vMax)) return false;
  const numMap = (m, maxKeys, maxVal) => {
    if (!isObj(m)) return false;
    const ks = Object.keys(m);
    return ks.length <= maxKeys && ks.every((k) => okKey(k) && okNum(m[k], maxVal));
  };
  if ('got' in a && !numMap(a.got, L.gotMax, L.timeMax)) return false;
  if ('prog' in a && !numMap(a.prog, L.progMax, L.progValMax)) return false;
  if ('claimed' in a && !(Array.isArray(a.claimed) && a.claimed.length <= L.claimedMax && a.claimed.every(okKey))) return false;
  if ('seenAt' in a && !okNum(a.seenAt, L.timeMax)) return false;
  for (const k of ['title', 'deco']) if (k in a && a[k] !== null && !okKey(a[k])) return false;
  return true;
}
