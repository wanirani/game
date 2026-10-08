// 초상화 메타데이터 (애니메 초상화 교체 — 대화창 REF A 배치) — owner: DIALOGUE-UI
//
//  PORTRAIT_META['portraits/<id>'] = { bust, face: { x, y, s }, expressions: ['angry', 'shock'] }   (모든 필드 선택)
//   · 키 = assets 키 (확장자 없음). 표정 파일은 '<키>__<표정>' (예: 'portraits/kael__angry' → assets/portraits/kael__angry.webp)
//   · bust        true  = 투명 배경 애니메 흉상 (768×1024 RGBA, 아래(가슴)가 잘린 채 바닥에 붙고 머리는 위 1/3)
//                 false = 예전 불투명 그림 (배경까지 그린 전신·상반신)
//                 없으면 → 아래 '불러오기 규칙': 이미지에 알파가 있으면 흉상 (이미지마다 한 번 재고 기억)
//   · face        얼굴 가운데 x·y (이미지 너비·높이에 대한 0..1) 와 s = 얼굴 너비 ÷ 이미지 너비 (관자놀이~관자놀이, 머리카락 제외)
//                 원형 얼굴 자르기·카드 자르기·컷신 눈높이 맞추기에 쓴다. 없으면 BUST_FACE / LEGACY_FACE 기본값
//   · expressions 실제로 있는 표정 파일 목록. 여기 있는 표정만 요청한다 (없는 파일을 받으러 가지 않는다 → 404 없음).
//                 대사 줄 face:'angry'|'shock' (또는 portrait:'<키>__angry') 가 목록에 없으면 기본 표정으로 돌아간다
//  표는 비어 있는 채로 시작하고 설치 단계(애니메 초상화 설치)가 채운다. 채우기 전에도 알파 규칙으로 흉상은 흉상으로 그려진다.
//
//  portraitMeta(key) → 표의 항목 (없으면 null)        setPortraitMeta(key, meta) / setPortraitMetaTable(table) — 설치·시험용 덮어쓰기
//  baseKeyOf(key) → '__표정' 을 뗀 키                  exprOf(key) → 'angry' | 'shock' | null
//  hasAlpha(img) → true | false | null(아직 모름)       isBust(key, img) → 표의 bust ?? hasAlpha(img) (모르면 false)
//  faceOf(key, img) → {x, y, s}                        expressionKey(key, expr) → 있는 표정 파일 키 | null
//  lineExpression(line, text, key) → 'angry'|'shock'|null  (대사 줄의 face 필드 · portrait '__표정' · '?!'/'!!' 끝맺음 규칙)
// 순수 모듈 (import 없음). 캔버스는 hasAlpha 를 처음 부를 때만 만든다 (Node 에서 불러와도 안전).

/** 표정 이름 (파일 접미사 '__<이름>') */
export const EXPRESSIONS = Object.freeze(['angry', 'shock']);
const EXPR_SET = new Set(EXPRESSIONS);

/** 설치 단계가 채우는 표. 비어 있으면 모든 초상화가 알파 규칙 + 기본 얼굴 위치를 쓴다 */
export const PORTRAIT_META = {};

/** 흉상의 기본 얼굴 위치 (파일럿 흉상 실측: 머리 위 3.5 %, 눈 ≈ 27–33 %, 얼굴 너비 ≈ 0.25–0.45) */
export const BUST_FACE = Object.freeze({ x: 0.52, y: 0.3, s: 0.32 });
/** 예전 그림의 기본 얼굴 위치: 영웅(800×1134, 전신) / 그 밖(761×968, 상반신·보스) */
export const LEGACY_FACE = Object.freeze({ hero: Object.freeze({ x: 0.5, y: 0.16, s: 0.14 }), other: Object.freeze({ x: 0.5, y: 0.27, s: 0.2 }) });

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num01 = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** 표 항목 하나를 검사해 정규화 (모르는 필드는 버린다). 틀린 값이면 null */
function clean(meta) {
  if (!isObj(meta)) return null;
  const out = {};
  if (typeof meta.bust === 'boolean') out.bust = meta.bust;
  const f = meta.face;
  if (isObj(f) && num01(f.x) && num01(f.y) && typeof f.s === 'number' && f.s > 0 && f.s <= 1.5) out.face = Object.freeze({ x: f.x, y: f.y, s: f.s });
  if (Array.isArray(meta.expressions)) out.expressions = Object.freeze(meta.expressions.filter((e) => EXPR_SET.has(e)));
  return Object.freeze(out);
}

/** '__표정' 을 뗀 키 */
export function baseKeyOf(key) {
  if (typeof key !== 'string') return key;
  const m = /^(.*)__([a-z]+)$/.exec(key);
  return m && EXPR_SET.has(m[2]) ? m[1] : key;
}
/** 키에 붙은 표정 ('portraits/kael__angry' → 'angry'), 없으면 null */
export function exprOf(key) {
  if (typeof key !== 'string') return null;
  const m = /__([a-z]+)$/.exec(key);
  return m && EXPR_SET.has(m[1]) ? m[1] : null;
}

/** 표의 항목 (표정 키를 주면 기본 키의 항목). 없으면 null */
export function portraitMeta(key) {
  if (typeof key !== 'string' || !key) return null;
  const k = baseKeyOf(key);
  return Object.hasOwn(PORTRAIT_META, k) ? PORTRAIT_META[k] : null;
}
/** 항목 하나 덮어쓰기 (null 이면 지운다). 반환: 정규화된 항목 | null */
export function setPortraitMeta(key, meta) {
  if (typeof key !== 'string' || !key || UNSAFE.has(key)) return null;
  const k = baseKeyOf(key);
  if (meta == null) { delete PORTRAIT_META[k]; return null; }
  const m = clean(meta);
  if (m) PORTRAIT_META[k] = m;
  return m;
}
/** 표 통째로 합치기 ({ key: meta | null }). 반환: 들어간 항목 수 */
export function setPortraitMetaTable(table) {
  if (!isObj(table)) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(table)) if (setPortraitMeta(k, v) || v == null) n++;
  return n;
}

// ── 불러오기 규칙: 알파가 있는 이미지 = 흉상 ──
//  이미지를 16×16 캔버스에 줄여 그리고 위쪽 두 모서리의 알파를 본다 (흉상은 머리 양옆 위가 늘 비어 있다;
//  아래 모서리는 가슴이 꽉 차서 불투명할 수 있다). 예전 그림은 모든 화소가 불투명 (255).
//  결과는 이미지마다 기억한다 (WeakMap). assets 가 이미지를 내리면(1×1 투명 이미지로 바뀜) src 가 달라지므로 다시 잰다.
const ALPHA = new WeakMap();   // img → { src, w, h, v }
let probe = null;
function probeCtx() {
  if (probe !== null) return probe || null;
  probe = false;
  try {
    const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(16, 16)
      : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: 16, height: 16 }) : null;
    probe = c ? c.getContext('2d', { willReadFrequently: true }) || false : false;
  } catch { probe = false; }
  return probe || null;
}
/** 이미지에 투명한 위 모서리가 있는가: true | false | null (아직 안 받음·잴 수 없음 — 기억하지 않는다) */
export function hasAlpha(img) {
  if (!img || typeof img !== 'object') return null;
  const w = img.naturalWidth ?? img.width ?? 0, h = img.naturalHeight ?? img.height ?? 0;
  if (!(w > 2 && h > 2)) return null;   // 받는 중 · 내려진 1×1 이미지
  if (img.complete === false) return null;
  const src = img.currentSrc || img.src || '';
  const c = ALPHA.get(img);
  if (c && c.src === src && c.w === w && c.h === h) return c.v;
  // 캔버스(이미 구운 흉상)는 내용이 바뀔 수 있어도 크기로만 기억한다
  const g = probeCtx();
  if (!g) return null;
  let v = null;
  try {
    g.clearRect(0, 0, 16, 16);
    g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    const a = (x, y) => d[(y * 16 + x) * 4 + 3];
    v = Math.min(a(0, 0), a(15, 0), a(1, 1), a(14, 1)) < 160;
  } catch { v = null; }   // 다른 출처 이미지 등
  if (v !== null) ALPHA.set(img, { src, w, h, v });
  return v;
}

/** 흉상인가: 표의 bust → 없으면 알파 규칙 (모르면 false = 예전 그림처럼) */
export function isBust(key, img) {
  const m = portraitMeta(key);
  if (m && typeof m.bust === 'boolean') return m.bust;
  return hasAlpha(img) === true;
}

/** 얼굴 위치 {x, y, s} (0..1). 표 → 흉상 기본값 → 예전 그림 기본값(세로로 긴 영웅 전신 / 그 밖) */
export function faceOf(key, img) {
  const m = portraitMeta(key);
  if (m?.face) return m.face;
  if (isBust(key, img)) return BUST_FACE;
  const w = img?.naturalWidth ?? img?.width ?? 0, h = img?.naturalHeight ?? img?.height ?? 0;
  return w > 0 && h > 0 && w / h < 0.74 ? LEGACY_FACE.hero : LEGACY_FACE.other;
}

/**
 * 표정 파일 키. 표에 그 표정이 있으면 '<기본 키>__<표정>', 없으면 null (→ 기본 표정)
 * explicit: 대본이 portrait:'<키>__<표정>' 으로 파일을 직접 가리킨 경우 — 표에 항목이 없으면(모름) 그대로 믿는다
 */
export function expressionKey(key, expr, { explicit = false } = {}) {
  if (typeof key !== 'string' || !key || !EXPR_SET.has(expr)) return null;
  const base = baseKeyOf(key), m = portraitMeta(base);
  if (m?.expressions) return m.expressions.includes(expr) ? `${base}__${expr}` : null;
  return explicit ? `${base}__${expr}` : null;
}

/**
 * 대사 줄의 표정 → 'angry' | 'shock' | null
 *  1) line.face: 'angry' | 'shock' (그대로) · 'neutral' | null (자동 규칙도 끔)
 *  2) line.portrait 가 '<키>__<표정>'
 *  3) 자동 (보수적): 문장이 '?!' 로 끝나면 'shock', '!!' 로 끝나면 'angry' — 그 표정 파일이 표에 있을 때만. 다른 추측은 하지 않는다
 */
export function lineExpression(line, text, key) {
  if (!line || typeof line !== 'object') return null;
  if (Object.hasOwn(line, 'face')) return EXPR_SET.has(line.face) ? line.face : null;
  const e = exprOf(line.portrait);
  if (e) return e;
  if (typeof text !== 'string' || !key) return null;
  const t = text.trimEnd();
  const auto = t.endsWith('?!') ? 'shock' : t.endsWith('!!') ? 'angry' : null;
  return auto && expressionKey(key, auto) ? auto : null;
}
