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
//  표는 설치 단계(애니메 초상화 설치)가 채웠다 (70 키: 흉상 66 · 예전 그림 4). 표에 없는 키도 알파 규칙으로 흉상은 흉상으로 그려진다.
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

/**
 * 설치 단계가 채운 표 (애니메 초상화 설치, 2026-10-08). 없는 키는 알파 규칙 + 기본 얼굴 위치를 쓴다.
 *  face 측정: 사람·사람 꼴 = 그룹 틀잡기 기록(눈 가운데·턱)을 768×1024 캔버스로 옮겨 가운데 = 눈 + 0.32·(턱 − 눈),
 *  s = 1.6 × 눈~턱 ÷ 768 (흉상 8장 실측 비율). 짐승·괴물 = 머리 상자를 손으로 잼. 32/48/66 px 원형 자르기 접촉 시트로 확인·손질
 *  (가면·옆얼굴·뭉툭한 동물은 손값). 예전 그림을 그대로 둔 넷(b_nihil·b_nihil2·cmp_g_imp·cmp_g_knight)은 bust:false + 손으로 잰 얼굴.
 *  2026-10-08 수정분(다시 오림·다시 그림 20장): greta·marta·rook2 는 새 그림의 눈·턱으로 다시 잼, banshee(벌린 턱 포함 머리)·behemoth(여왕 얼굴) 는 손값.
 *  원본 기록: tools/portraits/kling_manifest.json
 */
export const PORTRAIT_META = {
  // 영웅 (흉상 + 표정 2, 화면 오른쪽을 본다)
  'portraits/kael': { bust: true, face: { x: 0.528, y: 0.339, s: 0.344 }, expressions: ['angry', 'shock'] },
  'portraits/sera': { bust: true, face: { x: 0.541, y: 0.341, s: 0.344 }, expressions: ['angry', 'shock'] },
  'portraits/victor': { bust: true, face: { x: 0.618, y: 0.343, s: 0.356 }, expressions: ['angry', 'shock'] },
  'portraits/bran': { bust: true, face: { x: 0.55, y: 0.341, s: 0.344 }, expressions: ['angry', 'shock'] },
  'portraits/lia': { bust: true, face: { x: 0.567, y: 0.34, s: 0.344 }, expressions: ['angry', 'shock'] },
  'portraits/azel': { bust: true, face: { x: 0.657, y: 0.341, s: 0.344 }, expressions: ['angry', 'shock'] },
  'portraits/isolde': { bust: true, face: { x: 0.563, y: 0.34, s: 0.344 }, expressions: ['angry', 'shock'] },
  // NPC (흉상, 화면 왼쪽을 본다; 로크2 는 기본 표정만)
  'portraits/npc_alberto': { bust: true, face: { x: 0.409, y: 0.341, s: 0.337 }, expressions: ['angry', 'shock'] },
  'portraits/npc_carmilla': { bust: true, face: { x: 0.442, y: 0.342, s: 0.347 }, expressions: ['angry', 'shock'] },
  'portraits/npc_elise': { bust: true, face: { x: 0.385, y: 0.344, s: 0.36 }, expressions: ['angry', 'shock'] },
  'portraits/npc_greta': { bust: true, face: { x: 0.457, y: 0.34, s: 0.334 }, expressions: ['angry', 'shock'] },
  'portraits/npc_hadwin': { bust: true, face: { x: 0.33, y: 0.34, s: 0.333 }, expressions: ['angry', 'shock'] },
  'portraits/npc_marta': { bust: true, face: { x: 0.445, y: 0.34, s: 0.334 }, expressions: ['angry', 'shock'] },
  'portraits/npc_rook': { bust: true, face: { x: 0.45, y: 0.34, s: 0.333 }, expressions: ['angry', 'shock'] },
  'portraits/npc_rook2': { bust: true, face: { x: 0.454, y: 0.34, s: 0.334 } },
  // 보스 (흉상; b_nihil·b_nihil2 는 예전 그림 유지 = bust:false)
  'portraits/b_argen': { bust: true, face: { x: 0.28, y: 0.3, s: 0.3 } },
  'portraits/b_banshee': { bust: true, face: { x: 0.43, y: 0.4, s: 0.36 } },
  'portraits/b_behemoth': { bust: true, face: { x: 0.294, y: 0.363, s: 0.234 } },
  'portraits/b_bonedragon': { bust: true, face: { x: 0.27, y: 0.31, s: 0.32 } },
  'portraits/b_bride': { bust: true, face: { x: 0.458, y: 0.334, s: 0.293 } },
  'portraits/b_bride2': { bust: true, face: { x: 0.45, y: 0.333, s: 0.292 } },
  'portraits/b_chaos': { bust: true, face: { x: 0.18, y: 0.33, s: 0.25 } },
  'portraits/b_charon': { bust: true, face: { x: 0.454, y: 0.334, s: 0.292 } },
  'portraits/b_chimera': { bust: true, face: { x: 0.29, y: 0.36, s: 0.28 } },
  'portraits/b_colossus': { bust: true, face: { x: 0.39, y: 0.22, s: 0.18 } },
  'portraits/b_crimson': { bust: true, face: { x: 0.34, y: 0.26, s: 0.2 } },
  'portraits/b_dagon': { bust: true, face: { x: 0.38, y: 0.35, s: 0.35 } },
  'portraits/b_death': { bust: true, face: { x: 0.39, y: 0.378, s: 0.339 } },
  'portraits/b_dracula': { bust: true, face: { x: 0.373, y: 0.349, s: 0.395 } },
  'portraits/b_dracula2': { bust: true, face: { x: 0.3, y: 0.374, s: 0.295 } },
  'portraits/b_dullahan': { bust: true, face: { x: 0.45, y: 0.22, s: 0.2 } },
  'portraits/b_frostqueen': { bust: true, face: { x: 0.45, y: 0.344, s: 0.362 } },
  'portraits/b_grimoire': { bust: true, face: { x: 0.4, y: 0.45, s: 0.3 } },
  'portraits/b_hagen': { bust: true, face: { x: 0.331, y: 0.345, s: 0.368 } },
  'portraits/b_hagen2': { bust: true, face: { x: 0.29, y: 0.31, s: 0.3 } },
  'portraits/b_leviathan': { bust: true, face: { x: 0.28, y: 0.35, s: 0.3 } },
  'portraits/b_mara': { bust: true, face: { x: 0.428, y: 0.354, s: 0.464 } },
  'portraits/b_moloch': { bust: true, face: { x: 0.33, y: 0.29, s: 0.25 } },
  'portraits/b_narkissa': { bust: true, face: { x: 0.432, y: 0.353, s: 0.355 } },
  'portraits/b_narkissa2': { bust: true, face: { x: 0.366, y: 0.372, s: 0.548 } },
  'portraits/b_nemain': { bust: true, face: { x: 0.406, y: 0.341, s: 0.344 } },
  'portraits/b_nemain2': { bust: true, face: { x: 0.445, y: 0.344, s: 0.361 } },
  'portraits/b_nightwing': { bust: true, face: { x: 0.2, y: 0.33, s: 0.27 } },
  'portraits/b_nihil': { bust: false, face: { x: 0.5, y: 0.27, s: 0.2 } },
  'portraits/b_nihil2': { bust: false, face: { x: 0.5, y: 0.27, s: 0.2 } },
  'portraits/b_ziz': { bust: true, face: { x: 0.37, y: 0.27, s: 0.3 } },
  // 동료 (흉상; cmp_g_imp·cmp_g_knight 는 예전 그림 유지 = bust:false)
  'portraits/cmp_g_clock': { bust: true, face: { x: 0.325, y: 0.366, s: 0.245 } },
  'portraits/cmp_g_fairy': { bust: true, face: { x: 0.419, y: 0.324, s: 0.226 } },
  'portraits/cmp_g_imp': { bust: false, face: { x: 0.5, y: 0.322, s: 0.333 } },
  'portraits/cmp_g_knight': { bust: false, face: { x: 0.47, y: 0.215, s: 0.2 } },
  'portraits/cmp_g_owl': { bust: true, face: { x: 0.36, y: 0.28, s: 0.32 } },
  'portraits/cmp_g_reaper': { bust: true, face: { x: 0.457, y: 0.371, s: 0.204 } },
  'portraits/cmp_g_spiritwolf': { bust: true, face: { x: 0.33, y: 0.3, s: 0.38 } },
  'portraits/cmp_g_whelp': { bust: true, face: { x: 0.37, y: 0.32, s: 0.38 } },
  'portraits/cmp_gd_lumen': { bust: true, face: { x: 0.42, y: 0.338, s: 0.19 } },
  'portraits/cmp_gd_mirra': { bust: true, face: { x: 0.403, y: 0.34, s: 0.265 } },
  'portraits/cmp_gd_momo': { bust: true, face: { x: 0.42, y: 0.36, s: 0.55 } },
  'portraits/cmp_gd_munin': { bust: true, face: { x: 0.4, y: 0.3, s: 0.35 } },
  'portraits/cmp_gd_vesper': { bust: true, face: { x: 0.38, y: 0.3, s: 0.3 } },
  'portraits/cmp_m_boar': { bust: true, face: { x: 0.3, y: 0.33, s: 0.38 } },
  'portraits/cmp_m_direwolf': { bust: true, face: { x: 0.28, y: 0.32, s: 0.38 } },
  'portraits/cmp_m_giantbat': { bust: true, face: { x: 0.3, y: 0.42, s: 0.35 } },
  'portraits/cmp_m_skelsteed': { bust: true, face: { x: 0.28, y: 0.3, s: 0.3 } },
  'portraits/cmp_m_warhorse': { bust: true, face: { x: 0.27, y: 0.33, s: 0.3 } },
  'portraits/cmp_m_wyvern': { bust: true, face: { x: 0.38, y: 0.31, s: 0.3 } },
  'portraits/cmp_mt_argen': { bust: true, face: { x: 0.28, y: 0.3, s: 0.32 } },
  'portraits/cmp_mt_gale': { bust: true, face: { x: 0.35, y: 0.28, s: 0.38 } },
  'portraits/cmp_mt_ignis': { bust: true, face: { x: 0.28, y: 0.35, s: 0.32 } },
  'portraits/cmp_mt_morgen': { bust: true, face: { x: 0.27, y: 0.33, s: 0.3 } },
  'portraits/cmp_mt_silva': { bust: true, face: { x: 0.38, y: 0.45, s: 0.3 } },
};

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
