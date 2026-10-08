// 초상화 공용 도우미 (애니메 흉상 · 예전 그림) — owner: DIALOGUE-UI
//  흉상 = 투명 배경 애니메 컷아웃 (data/portrait_meta.js 의 표 또는 알파 규칙). 예전 그림 = 배경까지 그린 불투명 그림.
//
//  resolvePortrait(key, expr, { explicit }) → { key, base, img, bust, expr }
//      표정 키('<키>__angry')를 고르고, 그 파일이 표에 없거나·받는 중이거나·실패했으면 기본 표정 이미지로 돌아간다.
//      key 가 '<키>__표정' 이면 그 표정을 explicit 로 친다 (대본이 파일을 직접 가리킴 → 표에 항목이 없어도 받아 본다).
//      face 필드·자동 규칙은 표(expressions)에 있는 표정만 받는다 (설치 전에는 기본 표정 — 없는 파일을 요청하지 않는다)
//  linePortrait(line, text, key) → resolvePortrait(…) — 대사 줄의 face 필드 · portrait '__표정' · '?!'/'!!' 규칙 (portrait_meta.lineExpression)
//  preloadKeys(line, text, key) → 미리 받을 키 목록 (기본 + 고른 표정)
//  keyOfImage(img) → 'portraits/<id>' | null   (이미지 주소 또는 assets 캐시로 역추적, 이미지마다 기억)
//  bustCrop(img, key, r, { zoom, faceY }) → {dx, dy, dw, dh}   흉상을 사각형에 커버로: 얼굴(face)을 가로 가운데·세로 faceY 에 두고
//      아래(가슴 잘린 면)와 양옆이 비지 않게 자른다. zoom 은 예전 전신 그림 기준 값을 흉상 얼굴 크기로 환산한다
//  legacyCrop(img, key, aspect) → {sx, sy, sw, sh}   예전 그림에서 얼굴 중심 머리·어깨 카드 자르기 (대화창 액자)
//  faceRect(img, key, pad) → {sx, sy, sw, sh}   얼굴 중심 정사각 자르기 (원형 HUD 얼굴·동료 아이콘 — 다른 화면 주인이 쓰도록)
//  bustSilhouette(img) → 캔버스 | null   흉상 모양 그대로의 검은 실루엣 + 붉은 테두리광 (잠긴 영웅). 이미지마다 한 번 (≤ 512 px)
//  bustEdges(img) → {t, l, r}   흉상 그림이 캔버스 위·왼쪽·오른쪽 끝에 닿아 잘렸는가 (이미지마다 한 번, 48×64 탐침)
//  softBust(img) → 이미지 | 캔버스   잘린 가장자리만 녹인 사본 (대화창·보스 등장. 잘린 데가 없으면 그대로, 최근 6장 캐시)
//  cachedGrad(ctx, key, make) → 그라데이션 (키마다 한 번 — 프레임마다 새로 만들지 않는다)
import { assets } from '../core/assets.js';
import { isBust, faceOf, expressionKey, baseKeyOf, exprOf, lineExpression, hasAlpha } from '../data/portrait_meta.js';

export { isBust, faceOf, hasAlpha, baseKeyOf };

/** 키 + 표정 → 그릴 이미지 (표정 파일이 없으면 기본 표정) */
export function resolvePortrait(key, expr = null, { explicit = false } = {}) {
  if (typeof key !== 'string' || !key) return { key: null, base: null, img: null, bust: false, expr: null };
  const base = baseKeyOf(key);
  const own = exprOf(key);
  if (own && !expr) { expr = own; explicit = true; }
  const img0 = assets.get(base);
  let k = base, img = img0, e = null;
  const ek = expr ? expressionKey(base, expr, { explicit: explicit || own === expr }) : null;
  if (ek && !assets.failed(ek)) {
    const im = assets.get(ek);   // 처음이면 받기 시작 (그동안 기본 표정)
    if (im && (im.naturalWidth ?? im.width) > 2) { k = ek; img = im; e = expr; }
  }
  return { key: k, base, img, bust: img ? isBust(base, img) : false, expr: e };
}

/** 대사 줄의 초상화 (줄의 face · portrait '__표정' · 끝맺음 규칙) */
export function linePortrait(line, text, key) {
  const base = baseKeyOf(key);
  const expr = lineExpression(line, text, base);
  const explicit = !!expr && exprOf(line?.portrait) === expr;   // 파일을 직접 가리킨 줄만 (face 필드는 표에 있는 표정만)
  return resolvePortrait(base, expr, { explicit });
}

/** 미리 받을 키 (기본 + 이 줄이 고르는 표정 파일) */
export function preloadKeys(line, text, key) {
  if (typeof key !== 'string' || !key) return [];
  const base = baseKeyOf(key), out = [base];
  const expr = lineExpression(line, text, base);
  const explicit = !!expr && exprOf(line?.portrait) === expr;   // 파일을 직접 가리킨 줄만 (face 필드는 표에 있는 표정만)
  const ek = expr ? expressionKey(base, expr, { explicit }) : null;
  if (ek) out.push(ek);
  return out;
}

// ── 이미지 → 키 (portraitIn 처럼 이미지만 받는 곳이 표의 얼굴 위치를 찾게) ──
const KEY_OF = new WeakMap();
export function keyOfImage(img) {
  if (!img || typeof img !== 'object') return null;
  const src = img.currentSrc || img.src || '';
  const c = KEY_OF.get(img);
  if (c && c.src === src) return c.key;
  let key = null;
  const m = /(?:^|\/)(portraits\/[^/?#]+?)\.(?:webp|png|jpe?g)(?:[?#]|$)/.exec(src);
  if (m) key = m[1];
  else {
    try { for (const [k, e] of assets.cache ?? []) if (e && (e.img === img || e.swap === img)) { key = k; break; } } catch { /* 무시 */ }
  }
  if (src) KEY_OF.set(img, { src, key });
  return key;
}

const dims = (img) => [img?.naturalWidth || img?.width || 0, img?.naturalHeight || img?.height || 0];

/**
 * 흉상 커버 자르기. r = {x, y, w, h}
 *  zoom: 예전 전신 그림에 맞춘 호출 측 값 (1 = 커버). 흉상 얼굴은 예전 그림보다 2배쯤 커서 zoom × (0.14 ÷ 얼굴 너비) 로 환산, 1 이상
 *  faceY: 얼굴 가운데를 둘 높이 (사각형 높이의 비율)
 */
export function bustCrop(img, key, r, { zoom = 1, faceY = 0.36 } = {}) {
  const [iw, ih] = dims(img);
  if (!(iw > 0 && ih > 0)) return null;
  const f = faceOf(key, img);
  const z = Math.max(1, zoom * (0.14 / Math.max(0.05, f.s)));
  const s = Math.max(r.w / iw, r.h / ih) * z;
  const dw = iw * s, dh = ih * s;
  let dx = r.x + r.w / 2 - f.x * dw, dy = r.y + r.h * faceY - f.y * dh;
  dx = Math.min(r.x, Math.max(r.x + r.w - dw, dx));   // 양옆이 비지 않게
  dy = Math.min(r.y + r.h * 0.12, Math.max(r.y + r.h - dh, dy));   // 아래(가슴)가 비지 않게, 위는 조금 내려와도 된다 (투명)
  return { dx, dy, dw, dh };
}

/** 예전 그림의 머리·어깨 카드 자르기 (aspect = 카드 너비 ÷ 높이). 얼굴 너비가 카드 너비의 36 %, 얼굴은 위에서 38 % */
export function legacyCrop(img, key, aspect = 0.82) {
  const [iw, ih] = dims(img);
  if (!(iw > 0 && ih > 0)) return null;
  const f = faceOf(key, img);
  let sw = Math.min(iw, (f.s * iw) / 0.36), sh = sw / aspect;
  if (sh > ih) { sh = ih; sw = sh * aspect; }
  const sx = Math.min(iw - sw, Math.max(0, f.x * iw - sw / 2));
  const sy = Math.min(ih - sh, Math.max(0, f.y * ih - sh * 0.38));
  return { sx, sy, sw, sh };
}

/**
 * 얼굴 중심 정사각 자르기 (원형 아이콘·HUD 얼굴용: hud paintPortrait, hub/party/pause/worldmap/highscore, 동료 아이콘).
 * pad = 얼굴 너비의 몇 배를 한 변으로 (1.7 ≈ 이마~턱 + 머리카락 조금). 흉상·예전 그림 모두 표의 face(없으면 기본값)를 쓴다.
 * 반환 {sx, sy, sw, sh} (이미지 px) — ctx.drawImage(img, sx, sy, sw, sh, x, y, d, d)
 */
export function faceRect(img, key, pad = 1.7) {
  const [iw, ih] = dims(img);
  if (!(iw > 0 && ih > 0)) return null;
  const f = faceOf(key, img);
  const s = Math.min(iw, ih, Math.max(8, f.s * iw * pad));
  const sx = Math.min(iw - s, Math.max(0, f.x * iw - s / 2));
  const sy = Math.min(ih - s, Math.max(0, f.y * ih - s * 0.48));
  return { sx, sy, sw: s, sh: s };
}

// ── 잠긴 영웅의 실루엣 (흉상 모양) ──
const SIL = new WeakMap();   // img → { src, c }
function mkCanvas(w, h) {
  if (typeof document !== 'undefined') return Object.assign(document.createElement('canvas'), { width: w, height: h });
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  return null;
}
export function bustSilhouette(img) {
  const [iw, ih] = dims(img);
  if (!(iw > 2 && ih > 2)) return null;
  const src = img.currentSrc || img.src || '';
  const c0 = SIL.get(img);
  if (c0 && c0.src === src) return c0.c;
  const k = Math.min(1, 512 / ih), W = Math.max(1, Math.round(iw * k)), H = Math.max(1, Math.round(ih * k));
  const shape = mkCanvas(W, H), c = mkCanvas(W, H);
  if (!shape || !c) return null;
  try {
    const g = shape.getContext('2d');
    g.drawImage(img, 0, 0, W, H);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#07020a'; g.fillRect(0, 0, W, H);
    const x = c.getContext('2d');
    // 붉은 테두리광 (모양 바깥으로 번짐) → 검은 모양 → 안쪽에 옅은 붉은·보라 사선 기운
    x.shadowColor = 'rgba(170,14,40,0.95)'; x.shadowBlur = Math.max(6, Math.round(W * 0.03));
    x.drawImage(shape, 0, 0); x.drawImage(shape, 0, 0);
    x.shadowBlur = 0; x.shadowColor = 'transparent';
    x.globalCompositeOperation = 'source-atop';
    const gr = x.createLinearGradient(0, H, W, 0);
    gr.addColorStop(0, 'rgba(150,10,30,0.28)'); gr.addColorStop(0.6, 'rgba(20,4,10,0)'); gr.addColorStop(1, 'rgba(70,40,140,0.2)');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
  } catch { return null; }
  shape.width = shape.height = 0;
  SIL.set(img, { src, c });
  return c;
}

// ── 그림이 캔버스 위·옆 끝에 닿아 잘린 흉상: 잘린 가장자리만 부드럽게 (대화창·컷신·보스 등장에서 머리카락이 칼로 자른 듯한
//    수평·수직 선으로 화면 한가운데 뜨지 않게). 닿지 않은 가장자리는 건드리지 않는다 (머리카락을 먹지 않게) ──
const NO_EDGES = Object.freeze({ t: false, l: false, r: false });
const EDGES = new WeakMap();   // img → { src, w, v }
let edgeCtx = null;
/** 흉상의 위·왼쪽·오른쪽 끝에 그림이 닿아 있는가 {t, l, r} (48×64 로 줄여 끝 줄만 본다, 이미지마다 한 번) */
export function bustEdges(img) {
  const [iw, ih] = dims(img);
  if (!(iw > 2 && ih > 2) || img.complete === false) return NO_EDGES;
  const src = img.currentSrc || img.src || '';
  const c0 = EDGES.get(img);
  if (c0 && c0.src === src && c0.w === iw) return c0.v;
  let v = NO_EDGES;
  try {
    edgeCtx ??= mkCanvas(48, 64)?.getContext('2d', { willReadFrequently: true }) ?? null;
    if (edgeCtx) {
      edgeCtx.clearRect(0, 0, 48, 64);
      edgeCtx.drawImage(img, 0, 0, 48, 64);
      const d = edgeCtx.getImageData(0, 0, 48, 64).data, on = (x, y) => (d[(y * 48 + x) * 4 + 3] > 96 ? 1 : 0);
      let t = 0, l = 0, r = 0;
      for (let x = 0; x < 48; x++) t += on(x, 0);
      for (let y = 0; y < 64; y++) { l += on(0, y); r += on(47, y); }
      v = Object.freeze({ t: t >= 1, l: l >= 2, r: r >= 2 });
    }
  } catch { v = NO_EDGES; }
  EDGES.set(img, { src, w: iw, v });
  return v;
}
const SOFT = new Map();   // img → { src, w, c } — 최근 6장 (잘린 흉상만 굽는다)
const SOFT_TOP = 0.08, SOFT_SIDE = 0.07;
/** 잘린 가장자리(위 8 % · 옆 7 %)를 투명하게 녹인 사본. 잘린 데가 없으면 이미지 그대로 */
export function softBust(img) {
  const e = bustEdges(img);
  if (!e.t && !e.l && !e.r) return img;
  const [iw, ih] = dims(img);
  const src = img.currentSrc || img.src || '';
  const hit = SOFT.get(img);
  if (hit && hit.src === src && hit.w === iw) { SOFT.delete(img); SOFT.set(img, hit); return hit.c; }
  const c = mkCanvas(iw, ih);
  if (!c) return img;
  try {
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, iw, ih);
    g.globalCompositeOperation = 'destination-in';
    if (e.l || e.r) {
      const gr = g.createLinearGradient(0, 0, iw, 0);
      gr.addColorStop(0, e.l ? 'rgba(0,0,0,0)' : '#000'); gr.addColorStop(SOFT_SIDE, '#000');
      gr.addColorStop(1 - SOFT_SIDE, '#000'); gr.addColorStop(1, e.r ? 'rgba(0,0,0,0)' : '#000');
      g.fillStyle = gr; g.fillRect(0, 0, iw, ih);
    }
    if (e.t) {
      const gr = g.createLinearGradient(0, 0, 0, ih);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(SOFT_TOP, '#000'); gr.addColorStop(1, '#000');
      g.fillStyle = gr; g.fillRect(0, 0, iw, ih);
    }
  } catch { return img; }
  SOFT.set(img, { src, w: iw, c });
  if (SOFT.size > 6) SOFT.delete(SOFT.keys().next().value);   // 오래된 사본은 놓기만 한다 (같은 프레임에 그리는 쪽이 있을 수 있어 0×0 으로 줄이지 않음)
  return c;
}

// ── 그라데이션 캐시 (키마다 한 번) ──
const GR = new Map();
export function cachedGrad(ctx, key, make) {
  let g = GR.get(key);
  if (g) return g;
  g = make(ctx);
  if (GR.size > 96) GR.delete(GR.keys().next().value);
  GR.set(key, g);
  return g;
}
