// 채색 컷아웃 퍼펫 — 클링 측면 원화를 부위별로 잘라 만든 아틀라스를 hero.js 의 자세·IK 골격(SK)에 붙여 그린다.
// 에셋: assets/puppets/<charId>/<classId>/{rig.json, atlas_{lo,hi,ui}.webp, mask_{lo,hi,ui}.webp, turn.webp}
//       (tools/puppet/build_all.py 가 만들고, 목록은 ./puppet_manifest.js). 파이프라인 문서: docs/art/PUPPET_PIPELINE.md
// 흐름: puppetFor(p, look) → (지연 로드, 준비 전 null = 벡터 대체) → applySpec(K, R) 로 골격 치수를 원화에 맞춤
//       → drawLayers(...) 가 레이어 순서대로 부품을 그림 (hero.js drawLayers 대신)
// 원칙: 부품 좌표는 원화 px. 뼈 부위는 원화의 두 관절 → 골격의 두 관절 (회전 + 뼈 방향으로만 늘임, 0.82~1.22 제한)
//       먼 쪽 팔다리는 어둡게 구운 사본, 갑옷 색은 재질 마스크(R=갑옷, G=장식)로 다시 칠한 변형(장착 시 1회)
//       망토는 절차적 베를레 띠 + 벨벳 결 텍스처, 무기·궤적·효과는 기존 절차적 코드(hero_parts.js)
import { assets } from '../core/assets.js';
import { CLASSES, classChain } from '../data/classes.js';
import { CHARACTERS } from '../data/characters.js';
import { PUPPETS } from './puppet_manifest.js';
import { G, sh, ra, grad, ribbonPath, WS, drawWeapon, drawWing, glow, drawHalo } from './hero_parts.js';

const PI = Math.PI, HP = PI / 2, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPI = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** 발바닥~정수리 논리 높이(px). 벡터 영웅과 같은 키 */
export const PUP_H = 90;
/** 먼 쪽 팔다리 어둡게 (0~1) */
const FAR_DARK = 0.42;

let H = null;                      // 호스트(hero.js) 함수·상태 묶음 — bindHost 로 주입 (순환 import 방지)
/** hero.js 가 모듈 초기화 때 한 번 호출: { SK, ST, SW, chain, tx(P,x,y,out), applyT1, drawWings, drawScarfTail, CC:{CAPE,BAND,BAND2} } */
export function bindHost(h) { H = h; }
/** QA 도구(tools/puppet/review.html) 전용: 마지막으로 푼 골격(SK)과 좌표 변환 */
export function _debugHost() { return H; }
let ENABLED = true;
/** 전역 끄기 (디버그·비교용). false 면 모든 영웅이 벡터 렌더러로 그려진다 */
export function setPuppetEnabled(v) { ENABLED = !!v; }
export function puppetEnabled() { return ENABLED; }

// ───────────────────────── 직업 판별 ─────────────────────────
const EFF = new Map();
/** 캐릭터 기본 look ← 직업 계보 look (장비 제외) */
function effLook(classId) {
  let e = EFF.get(classId);
  if (!e) {
    const c = CLASSES[classId];
    e = Object.assign({}, CHARACTERS[c?.charId]?.look || {});
    for (const x of classChain(classId)) Object.assign(e, x.look || {});
    EFF.set(classId, e);
  }
  return e;
}
const CLS = new WeakMap();
/** look 이 어느 직업의 것인지: look.classId → 색 지문(주/보조/장식색·머리 모양, 장비가 바꾸지 않는 값) → p.hero.classId */
export function classOf(p, look) {
  if (!look) return null;
  if (look.classId) return look.classId;
  let c = CLS.get(look);
  if (c === undefined) {
    const cid = p?.ch?.id;
    c = null;
    if (cid && CHARACTERS[cid]) {
      let bt = -1;
      for (const id in CLASSES) {
        const k = CLASSES[id];
        if (k.charId !== cid) continue;
        const e = effLook(id);
        if (e.primary === look.primary && e.secondary === look.secondary && e.trim === look.trim && (e.hairStyle ?? null) === (look.hairStyle ?? null) && k.tier > bt) { bt = k.tier; c = id; }
      }
    }
    if (!c && p?.hero?.classId && CLASSES[p.hero.classId]?.charId === p?.ch?.id) c = p.hero.classId;
    CLS.set(look, c);
  }
  return c;
}

// ───────────────────────── 로딩 ─────────────────────────
const REG = new Map();              // 'kael/kael_hunter' → 퍼펫 항목
const NONE = { state: -1 };
let REV = 0;                        // 퍼펫이 하나 준비될 때마다 +1
/** 퍼펫 준비 세대: 새 퍼펫이 준비될 때마다 증가. 영웅 그림을 캐시하는 쪽(메뉴 스냅샷 등)이 키에 넣으면 벡터 대체 그림이 남지 않는다 */
export function puppetRev() { return REV; }
const akey = (E, kind, L) => `puppets/${E.key}/${kind}_${L.name}`;
/** 이미 로드된 이미지만 돌려준다 (요청하지 않음) */
const peek = (k) => (assets.has(k) ? assets.get(k) : null);
function levelImg(E, L) { return assets.get(akey(E, 'atlas', L), E.man.h); }   // 요청 + 로드됐으면 이미지
function levelPeek(E, L) { return peek(akey(E, 'atlas', L)); }
function maskImg(E, L) { return assets.get(akey(E, 'mask', L), E.man.h); }
function maskPeek(E, L) { return peek(akey(E, 'mask', L)); }
function entry(cid, cls) {
  const key = cid + '/' + cls;
  let E = REG.get(key);
  if (E) return E;
  const man = PUPPETS[cid]?.[cls];
  if (!man) { REG.set(key, NONE); return NONE; }
  E = { key, cid, cls, man, state: 0, rig: null, PS: 1, J: null, parts: null, levels: [], lvIdx: {}, dark: {}, vars: new Map(), turnImg: null, turnMask: null };
  REG.set(key, E);
  assets.json(`puppets/${key}/rig`, man.h).then((rig) => {
    if (!rig || !rig.levels || !rig.parts) { E.state = -1; return; }
    E.rig = rig; E.J = rig.joints; E.parts = rig.parts;
    E.PS = PUP_H / (rig.sole - rig.figTop);
    E.levels = Object.entries(rig.levels).map(([name, L]) => ({ name, scale: L.scale, rects: L.rects, size: L.size })).sort((a, b) => a.scale - b.scale);
    E.levels.forEach((L, i) => { E.lvIdx[L.name] = i; });
    E.opts = rig.opts || {};
    // 게임 화면용 두 레벨 + 그 재질 마스크(≈14KB, 장비 색을 바꿀 때 원래 색이 한 프레임 비치지 않게). ui 레벨은 메뉴에서 필요할 때
    for (const L of E.levels) if (L.name !== 'ui') { levelImg(E, L); maskImg(E, L); }
  });
  return E;
}
/** 준비 상태: 리그 + 레벨 이미지 하나 이상 (ui 레벨은 여기서 요청하지 않는다) */
function ready(E) {
  if (E.state === 1) return true;
  if (E.state < 0 || !E.rig) return false;
  for (const L of E.levels) if (levelPeek(E, L)) { E.state = 1; REV++; preloadSiblings(E.cid); return true; }
  if (E.levels.filter((L) => L.name !== 'ui').every((L) => assets.failed(akey(E, 'atlas', L)))) E.state = -1;
  return false;
}
/** 미리 불러 두기 (장면 진입 시 등, 선택) */
export function preloadPuppet(charId, classId) { const E = entry(charId, classId); return E; }
// 한 직업이 준비되면 같은 영웅의 다른 직업(rig + lo/hi ≈60KB씩)을 한가할 때 받아 둔다 —
// 교회 전직 카드·파티·직업 탭이 처음 그릴 때 벡터로 찍혀 스냅샷에 남는 일을 막는다
const SIB = new Set();
function preloadSiblings(cid) {
  if (SIB.has(cid) || typeof window === 'undefined') return;
  SIB.add(cid);
  const ids = Object.keys(PUPPETS[cid] || {});
  let i = 0;
  const next = () => { if (i >= ids.length) return; entry(cid, ids[i++]); idle(next); };
  const idle = (f) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 120));
  idle(next);
}
// 부팅 직후 각 영웅의 기본 직업(rig + lo/hi ≈60KB)을 미리 받아, 첫 스테이지에서 벡터→퍼펫 전환이 보이지 않게 한다
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  setTimeout(() => { for (const cid in PUPPETS) { const root = CHARACTERS[cid]?.rootClass; if (root && PUPPETS[cid][root]) entry(cid, root); } }, 400);
}

// ───────────────────────── 장비 색 (재질 마스크) ─────────────────────────
function hexRgb(h) {
  if (typeof h !== 'string' || h[0] !== '#') return null;
  const s = h.length === 4 ? h.slice(1).split('').map((c) => c + c).join('') : h.slice(1, 7);
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** look 의 갑옷 색·장식색이 직업 원화와 다르면 변형 키 */
function variantKey(E, look) {
  const eff = effLook(E.cls);
  const base = eff.armorColor ?? E.opts?.armorBase ?? null;
  const ac = look.armorColor && look.armorColor !== base ? look.armorColor : null;
  const tc = look.armorTrim && look.armorTrim !== eff.armorTrim ? look.armorTrim : null;
  if (!ac && !tc) return '';
  return `${ac || '-'}|${tc || '-'}|${look.armor || '-'}`;
}
// 재질별 [명암 대비, 금속 반사]
const FINISH = { leather: [1, 0], chain: [1.12, 0.1], plate: [1.25, 0.25], holy: [1.2, 0.3], dark: [1.3, 0.12] };
function makeVariant(E, vk) {
  const [ac, tc, kind] = vk.split('|');
  return { vk, ac: ac === '-' ? null : hexRgb(ac), tc: tc === '-' ? null : hexRgb(tc), fin: FINISH[kind] || [1, 0], img: {}, dark: {}, turn: undefined };
}
const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/**
 * 픽셀 배열(px, RGBA)의 마스크 채널(ch) 영역을 목표 색(tgt)으로 다시 칠한다.
 * 밝기 사상: 마스크 영역 평균 밝기 → 목표 밝기. 어두운 쪽은 비율(곱)로, 밝은 쪽은 원화의 절대 밝기 차를
 * 유지하되 흰색으로 넘치지 않게 압축한다 — 검은 가죽을 밝은 판금색으로 칠해도 하얗게 타지 않고, 상아색을 어둡게 칠해도 뭉개지지 않는다.
 * 색: 밝기는 사상값 그대로, 채도는 밝은 곳에서 줄여(반사광은 흰빛) 채널 넘침으로 색이 틀어지지 않게 한다.
 */
function recolorPx(px, m, ch, tgt, fin, strength) {
  const hist = new Uint32Array(256);
  let n = 0, sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (m[i + ch] > 200 && px[i + 3] > 200) { const l = lumOf(px[i], px[i + 1], px[i + 2]); hist[l | 0]++; n++; sum += l; }
  }
  const pct = (q) => { if (!n) return 0; let c = 0; const t = q * n; for (let k = 0; k < 256; k++) { c += hist[k]; if (c >= t) return k; } return 255; };
  const lref = Math.max(14, n ? sum / n : 70), p03 = n ? pct(0.03) : lref * 0.4, p90 = n ? pct(0.9) : lref * 1.4, p98 = n ? pct(0.98) : lref * 1.8;
  const [tr, tg, tb] = tgt;
  const tl = Math.max(10, lumOf(tr, tg, tb));
  const con = fin[0], spec = fin[1];
  const lowT = Math.max(tl * 0.18, tl * Math.pow(Math.max(1, p03) / lref, con));
  const dn = (tl - lowT) / Math.max(4, lref - p03);
  const upWant = Math.max(0, Math.min((p98 - lref) * con, tl * (Math.max(1, p98) / lref - 1) * con));
  const up = (Math.min(244, tl + upWant) - tl) / Math.max(4, p98 - lref);
  const dk = tl < 50 ? 1.2 : 1;                               // 아주 어두운 목표는 조금 들어 올림 (검은 덩어리 방지)
  const hiSpan = Math.max(6, p98 - p90);
  for (let i = 0; i < px.length; i += 4) {
    // 마스크 곡선: 재질 규칙 경계(그늘진 상아색 등)의 어중간한 값이 반쯤만 칠해져 원래 색이 비치지 않게 (0.12 이하는 제외)
    const mm = (m[i + ch] / 255 - 0.12) / 0.58;
    if (mm <= 0) continue;
    const w = (mm >= 1 ? 1 : mm * mm * (3 - 2 * mm)) * strength;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const l = lumOf(r, g, b);
    let L = (l <= lref ? tl - (lref - l) * dn : tl + (l - lref) * up) * dk;
    L = L < 0 ? 0 : L > 250 ? 250 : L;
    const k = L / tl, sat = k <= 1 ? k : 1 + (k - 1) * 0.35;
    let nr = L + (tr - tl) * sat, ng = L + (tg - tl) * sat, nb = L + (tb - tl) * sat;
    if (spec > 0 && l > p90) { const q = spec * Math.min(1, (l - p90) / hiSpan) * 0.55; nr += (255 - nr) * q; ng += (255 - ng) * q; nb += (255 - nb) * q; }
    nr = nr < 0 ? 0 : nr > 255 ? 255 : nr; ng = ng < 0 ? 0 : ng > 255 ? 255 : ng; nb = nb < 0 ? 0 : nb > 255 ? 255 : nb;
    px[i] = r + (nr - r) * w; px[i + 1] = g + (ng - g) * w; px[i + 2] = b + (nb - b) * w;
  }
}
/** 원본 이미지 + 재질 마스크 → 다시 칠한 캔버스 */
function recolorCanvas(src, mk, V) {
  const W = src.naturalWidth || src.width, Hh = src.naturalHeight || src.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, W, Hh);
  const mc = document.createElement('canvas'); mc.width = W; mc.height = Hh;
  const mg = mc.getContext('2d', { willReadFrequently: true });
  mg.imageSmoothingEnabled = true; mg.drawImage(mk, 0, 0, W, Hh);
  const m = mg.getImageData(0, 0, W, Hh).data;
  if (V.ac) recolorPx(d.data, m, 0, V.ac, V.fin, 0.92);
  if (V.tc) recolorPx(d.data, m, 1, V.tc, [1.1, 0.2], 0.85);
  g.putImageData(d, 0, 0);
  mc.width = mc.height = 1;
  return cv;
}
/** 변형 레벨 캔버스 (그 레벨의 마스크가 로드 전이면 null) */
function variantLevel(E, V, L) {
  const got = V.img[L.name];
  if (got) return got;
  const src = levelPeek(E, L), mk = maskImg(E, L);
  if (!src || !mk || typeof document === 'undefined') return null;
  return (V.img[L.name] = recolorCanvas(src, mk, V));
}
function bakeDark(src, a = FAR_DARK) {
  const cv = document.createElement('canvas');
  cv.width = src.naturalWidth || src.width; cv.height = src.naturalHeight || src.height;
  const c = cv.getContext('2d');
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(14,8,24,${a})`; c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

// ───────────────────────── 퍼펫 인스턴스 (look 별) ─────────────────────────
const INST = new WeakMap();
/**
 * 이 엔티티/look 을 퍼펫으로 그릴 수 있으면 인스턴스, 아니면 null (로드 중·에셋 없음·끔 → 벡터 대체).
 * 호출할 때마다 필요한 로드를 건드리므로 매 프레임 불러도 된다 (캐시).
 */
export function puppetFor(p, look) {
  if (!ENABLED || !look || look.puppet === false || p?.npc) return null;
  let I = INST.get(look);
  if (I === undefined) {
    const cid = p?.ch?.id, cls = cid ? classOf(p, look) : null;
    const E = cid && cls ? entry(cid, cls) : NONE;
    I = E === NONE ? null : { E, look, vk: '', V: null, key: E.key, lv: null };
    if (I) { I.vk = variantKey(E, look) ; }
    INST.set(look, I);
  }
  if (!I) return null;
  const E = I.E;
  if (!ready(E)) return null;
  if (I.vk && !I.V) { I.V = E.vars.get(I.vk) || makeVariant(E, I.vk); E.vars.set(I.vk, I.V); }
  I.key = E.key + (I.vk ? '#' + I.vk : '');
  return I;
}
/** 플레이어블 캐릭터 id 인가 (그리기 배율 적용 대상 판별) */
export function isPlayable(id) { return !!(id && CHARACTERS[id]); }
export function charDef(id) { return id ? CHARACTERS[id] || null : null; }
/** 이 캐릭터/직업에 퍼펫 에셋이 있는가 (로드 여부와 무관) */
export function hasPuppet(charId, classId) { return !!PUPPETS[charId]?.[classId]; }

// ───────────────────────── 골격 치수 ─────────────────────────
/** 벡터 spec(K)을 원화 비율로 덮어쓴다: 뼈 길이·어깨/엉덩이 위치·코트 피벗·망토 고정점 */
export function applySpec(K, I) {
  const E = I.E, J = E.J, PS = E.PS;
  const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  K.pup = I;
  K.thigh = d(J.hip, J.knee) * PS; K.shin = d(J.knee, J.ankle) * PS;
  K.torso = d(J.pelvis, J.neck) * PS; K.ua = d(J.shoulder, J.elbow) * PS; K.fa = d(J.elbow, J.hand) * PS;
  K.ls = (K.thigh + K.shin) / 39.8;
  const tl = K.torso / PS, ux = (J.neck[0] - J.pelvis[0]) / tl, uy = (J.neck[1] - J.pelvis[1]) / tl, fx = -uy, fy = ux;
  const rel = (q, o) => [((q[0] - o[0]) * ux + (q[1] - o[1]) * uy) * PS, ((q[0] - o[0]) * fx + (q[1] - o[1]) * fy) * PS];
  K.pS1 = rel(J.shoulder, J.neck); K.pS2 = [K.pS1[0] + 0.4, K.pS1[1] + 3.4];
  K.pH1 = rel(J.hip, J.pelvis); K.pH2 = [K.pH1[0], K.pH1[1] - 3.4];
  K.pSk = rel(E.parts.skirt ? E.parts.skirt.pivot : J.pelvis, J.pelvis);
  K.pCape = rel(J.capeAnchor || J.shoulder, J.neck);
  K.footPivY = J.sole - (2.8 * K.ls) / PS;
  K.pupHeadK = E.opts.headK ?? 1.1;
  const o = E.opts || {};
  K.band = o.band ? o.band.color : null;
  K.pupBandAt = o.band ? (J[o.band.anchor] || J.bandAnchor) : null;
  K.hs = o.pony === false ? 'none' : K.hs;
}

// ───────────────────────── 그리기 기본 ─────────────────────────
let R = null, LV = null, IMG = null, DARK = null;   // 현재 그리는 퍼펫 / 레벨 / 이미지
/**
 * 그릴 레벨 고르기: "장치 px / 원화 px" 에 충분한 가장 작은 레벨. 인스턴스별 이력(hysteresis)이 있어
 * 카메라 확대·축소가 경계 근처에서 흔들려도 lo↔hi 가 번갈아 바뀌며 선명도가 깜빡이지 않는다.
 * 장비 색 변형이 있으면 그 레벨의 재질 마스크까지 로드된 레벨만 쓴다 (원래 색이 한 프레임 비치는 것 방지).
 */
function pickLevel(I, c) {
  const E = I.E, m = c.getTransform();
  const sc = Math.hypot(m.a, m.b) * E.PS;   // 장치 px / 원화 px
  let want = E.levels[E.levels.length - 1];
  for (const L of E.levels) if (L.scale >= sc * 0.9) { want = L; break; }
  const prev = I.lv;
  if (prev && prev !== want && prev.scale >= sc * 0.78 && prev.scale <= Math.max(sc * 2.6, E.levels[0].scale)) want = prev;
  const ok = (L) => levelPeek(E, L) && (!I.V || I.V.img[L.name] || maskPeek(E, L));
  if (ok(want)) { I.lv = want; return want; }
  levelImg(E, want); if (I.V) maskImg(E, want);           // 요청해 두고 이번 프레임은 가까운 레벨로
  let best = null, bd = 1e9;
  for (const L of E.levels) if (ok(L)) { const dd = Math.abs(L.scale - want.scale) * (L.scale < want.scale ? 1.5 : 1); if (dd < bd) { bd = dd; best = L; } }
  if (!best) for (const L of E.levels) if (levelPeek(E, L)) { const dd = Math.abs(L.scale - want.scale); if (dd < bd) { bd = dd; best = L; } }
  return best;
}
function useLevel(I, c) {
  const E = I.E;
  R = E; LV = pickLevel(I, c);
  if (!LV) return false;
  let img = levelPeek(E, LV);
  let dk = E.dark;
  if (I.V) { const v = variantLevel(E, I.V, LV); if (v) { img = v; dk = I.V.dark; } }
  IMG = img;
  DARK = dk[LV.name] || (typeof document !== 'undefined' ? (dk[LV.name] = bakeDark(img)) : img);
  return true;
}
function blit(c, name, dark) {
  const pt = R.parts[name], rc = LV.rects[name];
  if (!pt || !rc) return;
  c.drawImage(dark ? DARK : IMG, rc[0], rc[1], rc[2], rc[3], pt.x0, pt.y0, pt.w, pt.h);
}
/** 원화 선분 (a→b) 을 골격 선분 (A→B) 로 보내는 변환 (뼈 방향으로만 늘임) */
function boneXf(c, a, b, AX, AY, BX, BY) {
  const angS = Math.atan2(b[1] - a[1], b[0] - a[0]), lenS = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const angD = Math.atan2(BY - AY, BX - AX), lenD = Math.hypot(BX - AX, BY - AY);
  const k = clamp(lenD / (lenS * R.PS), 0.82, 1.22);
  c.translate(AX, AY); c.rotate(angD); c.scale(k * R.PS, R.PS); c.rotate(-angS); c.translate(-a[0], -a[1]);
}
function headXf(c, s, K) {
  const J = R.J, k = R.PS * K.pupHeadK;
  c.translate(s.nx, s.ny); c.rotate(s.ha); c.scale(k, k); c.translate(-J.neck[0], -J.neck[1]);
}
const Q = [0, 0];
/** 머리 좌표계의 원화 점 → T1 좌표 */
function headPt(s, K, qx, qy) {
  const J = R.J, c = Math.cos(s.ha), si = Math.sin(s.ha), k = R.PS * K.pupHeadK, dx = (qx - J.neck[0]) * k, dy = (qy - J.neck[1]) * k;
  Q[0] = s.nx + dx * c - dy * si; Q[1] = s.ny + dx * si + dy * c;
}
/** 몸통 좌표계의 원화 점 → T1 좌표 */
function torsoPt(s, K, q) {
  const J = R.J, tl = K.torso / R.PS, ux = (J.neck[0] - J.pelvis[0]) / tl, uy = (J.neck[1] - J.pelvis[1]) / tl, fx = -uy, fy = ux;
  const a = ((q[0] - J.pelvis[0]) * ux + (q[1] - J.pelvis[1]) * uy) * R.PS, b = ((q[0] - J.pelvis[0]) * fx + (q[1] - J.pelvis[1]) * fy) * R.PS;
  Q[0] = s.px + s.ux * a + s.fx * b; Q[1] = s.py + s.uy * a + s.fy * b;
}
const TXO = [0, 0];
function toT0(P, x, y) { H.tx(P, x, y, TXO); return TXO; }

function legPup(c, K, hx, hy, kx, ky, ax, ay, t, dark) {
  const J = R.J;
  c.save(); boneXf(c, J.hip, J.knee, hx, hy, kx, ky); blit(c, 'thigh', dark); c.restore();
  c.save(); boneXf(c, J.knee, J.ankle, kx, ky, ax, ay); blit(c, 'shin', dark); c.restore();
  c.save(); c.translate(ax, ay); c.rotate(t); c.scale(R.PS, R.PS); c.translate(-J.ankle[0], -K.footPivY); blit(c, 'foot', dark); c.restore();
}
function armPup(c, sx, sy, ex, ey, hx, hy, dark, hand) {
  const J = R.J;
  c.save(); boneXf(c, J.shoulder, J.elbow, sx, sy, ex, ey); blit(c, 'uarm', dark); c.restore();
  c.save(); boneXf(c, J.elbow, J.hand, ex, ey, hx, hy); blit(c, 'farm', dark); if (hand) blit(c, 'hand', dark); c.restore();
}

// ── 손: 무기별 쥔 주먹(grip) · 편 손(open) ──
// 주먹 중심을 무기 좌표계에서 얼마나 옮길지 (x=무기 방향, y=무기 법선, 논리 px)
const GRIP_OFF = { sword: [-2.4, 0], greatsword: [-3.2, 0], dagger: [-1.4, 0], gun: [-2.0, 3.2], staff: [0, 0], whip: [-2.2, 0], none: [0, 0] };
function gripPup(c, K, ex, ey, hx, hy, wAng, wtype, dark, k = 1) {
  const g = R.rig.hands?.grip;
  if (!g || !R.parts.grip) return false;
  const off = GRIP_OFF[wtype] || GRIP_OFF.none;
  let cx = hx, cy = hy;
  if (wAng !== undefined) { const co = Math.cos(wAng), si = Math.sin(wAng); cx += co * off[0] - si * off[1]; cy += si * off[0] + co * off[1]; }
  const fa = Math.atan2(hy - ey, hx - ex);                                   // 아래팔 방향
  const wp = Math.atan2(g.pivot[1] - g.wrist[1], g.pivot[0] - g.wrist[0]);    // 원화: 손목 → 주먹 중심
  let rot = fa - wp;
  if (wAng !== undefined) {
    // 막대 축을 무기 방향으로 (손목이 크게 꺾이지 않도록 ±0.6 rad 까지만)
    let dd = wrapPI(wAng - (g.axisAng + rot));
    if (dd > HP) dd -= PI; else if (dd < -HP) dd += PI;
    rot += clamp(dd, -0.6, 0.6);
  }
  const s = R.PS * k;
  c.save(); c.translate(cx, cy); c.rotate(rot); c.scale(s, s); c.translate(-g.pivot[0], -g.pivot[1]); blit(c, 'grip', dark); c.restore();
  return true;
}
function openPup(c, K, ex, ey, hx, hy, dark) {
  const o = R.rig.hands?.open, J = R.J;
  if (!o || !R.parts.open) return false;
  const fa = Math.atan2(hy - ey, hx - ex);
  const ot = Math.atan2(o.tip[1] - o.wrist[1], o.tip[0] - o.wrist[0]);
  // 골격의 손목점: 아래팔 위, 원화 손목 비율
  const u = Math.hypot(J.wrist[0] - J.elbow[0], J.wrist[1] - J.elbow[1]) / (Math.hypot(J.hand[0] - J.elbow[0], J.hand[1] - J.elbow[1]) || 1);
  const wx = lerp(ex, hx, u), wy = lerp(ey, hy, u);
  const s = R.PS;
  c.save(); c.translate(wx, wy); c.rotate(fa - ot); c.scale(s, s); c.translate(-o.pivot[0], -o.pivot[1]); blit(c, 'open', dark); c.restore();
  return true;
}

// ── 코트 자락: 허리 피벗 회전 + 가로 띠 전단 (띠 경계에서 연속이라 틈이 없다) ──
const SKN = 6, SK_B = new Float32Array(SKN + 2), SK_SL = new Float32Array(SKN + 1), SK_OFF = new Float32Array(SKN + 2);
const SKS = { ax: 0, ay: 0, rot: 0, v: 1, on: false };
function skirtSetup(K, s, P) {
  const pt = R.parts.skirt;
  SKS.on = !!(pt && pt.strip);
  if (!SKS.on) return;
  const st = pt.strip, SW = H.SW;
  SKS.ax = s.px + s.ux * K.pSk[0] + s.fx * K.pSk[1]; SKS.ay = s.py + s.uy * K.pSk[0] + s.fy * K.pSk[1];
  const run = clamp(SW.tr / 9, -0.6, 1.2), lift = clamp(SW.lift / 6, -0.6, 1.2);
  const kneeFwd = clamp(((s.k1x - s.hp1x) + (s.k2x - s.hp2x)) * 0.5 / (K.thigh || 20), -1, 1);
  // 쉴 때는 거의 수직(약간 뒤로), 몸 기울기 절반 + 달리면 뒤로 흩날림 + 무릎이 앞자락을 밀어냄
  SKS.rot = 0.1 + P.lean * 0.45 + clamp(run, 0, 1.2) * 0.26 + lift * 0.2 - kneeFwd * 0.22 - (R.opts.skirtRest ?? 0);
  if (P.rot) SKS.rot += 0;
  // 전단: 아래로 갈수록 뒤로 굽음(+펄럭임). 띠 좌표 = 스트립 v (피벗 기준, 축 방향)
  const v0 = st.oy, v1 = st.oy + pt.h, top = Math.max(0, v0);
  const bend = -(0.04 + run * 0.22 + lift * 0.28 + SW.fl * 0.04) + kneeFwd * 0.08;
  SK_B[0] = v0; SK_OFF[0] = 0; SK_SL[0] = 0;
  SK_B[1] = top; SK_OFF[1] = 0;
  for (let i = 1; i <= SKN; i++) {
    const u = (i - 0.5) / SKN;
    SK_SL[i] = bend * Math.pow(u, 1.4) + Math.sin(G.t * 7.3 - i * 0.9) * 0.025 * (0.3 + Math.abs(run)) * u;
    SK_B[i + 1] = top + (v1 - top) * i / SKN;
    SK_OFF[i + 1] = SK_OFF[i] + SK_SL[i] * (SK_B[i + 1] - SK_B[i]);
  }
  // 땅 아래로 파고들지 않게 세로 압축 (T1 근사)
  const hemY = SKS.ay + Math.cos(SKS.rot) * (v1) * R.PS;
  SKS.v = hemY > -0.4 ? clamp((-0.4 - SKS.ay) / (hemY - SKS.ay), 0.4, 1) : 1;
}
function drawSkirtPup(c, dark) {
  if (!SKS.on) return;
  const pt = R.parts.skirt, st = pt.strip, rc = LV.rects.skirt, ls = LV.scale;
  if (!rc) return;
  const img = dark ? DARK : IMG;
  c.save();
  c.translate(SKS.ax, SKS.ay); c.rotate(SKS.rot); c.scale(R.PS, R.PS * SKS.v);
  for (let i = 0; i <= SKN; i++) {
    const ya = SK_B[i], yb = SK_B[i + 1];
    if (yb <= ya) continue;
    const sl = SK_SL[i], off = SK_OFF[i];
    c.save();
    // x' = x + off + sl·(y - ya)
    c.transform(1, 0, sl, 1, off - sl * ya, 0);
    const ov = i < SKN ? 1.6 / ls : 0;                          // 띠 겹침 1.6 아틀라스 px (이음매 방지)
    const sy = (ya - st.oy) * ls, shh = Math.min(rc[3] - sy, (yb - ya) * ls + ov * ls);
    if (shh > 0.5) c.drawImage(img, rc[0], rc[1] + sy, rc[2], shh, st.ox, ya, pt.w, shh / ls);
    c.restore();
  }
  c.restore();
}
/** 안쪽 자락(skirtFar): 몸통 좌표계 + 바깥 자락 회전의 일부만 따라감 */
function drawSkirtFar(c, s, K, dark) {
  const pt = R.parts.skirtFar;
  if (!pt) return;
  const J = R.J;
  c.save();
  boneXf(c, J.pelvis, J.neck, s.px, s.py, s.nx, s.ny);
  const pv = R.parts.skirt ? R.parts.skirt.pivot : J.pelvis;
  c.translate(pv[0], pv[1]); c.rotate((SKS.rot - 0.1) * 0.55); c.scale(1, SKS.v); c.translate(-pv[0], -pv[1]);
  blit(c, 'skirtFar', dark);
  c.restore();
}

// ── 포니테일: 베를레 체인 띠 ──
const PONY_N = 5, PONY_CFG = { g: 1150, d: 0.88, push: 260, rest: 0.66, curl: 0.08, flut: 40 };
function drawPonyPup(c, E, K, s) {
  const pt = R.parts.pony;
  if (!pt || !pt.strip || !LV.rects.pony) return;
  const st = pt.strip, rc = LV.rects.pony, ls = LV.scale;
  // 긴 머리·베일 등은 리그 runtime.ponyN(마디 수)·ponyCfg(물리)로 조절
  const N = R.opts.ponyN || PONY_N, cfg = R.opts.ponyCfg ? (R.ponyCfg ||= { ...PONY_CFG, ...R.opts.ponyCfg }) : PONY_CFG;
  headPt(s, K, pt.pivot[0], pt.pivot[1]); const T = toT0(E.P, Q[0], Q[1]);
  const seg = (st.len * R.PS) / (N - 1);
  const C = H.chain('hair', E, T[0], T[1], N, seg, cfg, T[0] + 1.5);
  const bandL = st.len / (N - 1);
  for (let i = 0; i < N - 1; i++) {
    let dx = C[i * 2 + 2] - C[i * 2], dy = C[i * 2 + 3] - C[i * 2 + 1];
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const k = clamp(L / (bandL * R.PS), 0.8, 1.25);
    const a = dy * R.PS, b = -dx * R.PS, cc = dx * k * R.PS, dd = dy * k * R.PS;
    const yi = i * bandL;
    const ya = i === 0 ? st.oy : yi, yb = i === N - 2 ? st.oy + pt.h : yi + bandL;
    c.save();
    c.transform(a, b, cc, dd, C[i * 2] - cc * yi, C[i * 2 + 1] - dd * yi);
    const sy = (ya - st.oy) * ls, shh = Math.min(rc[3] - sy, (yb - ya) * ls + 1.2);
    if (shh > 0.5) c.drawImage(IMG, rc[0], rc[1] + sy, rc[2], shh, st.ox, ya, pt.w, shh / ls);
    c.restore();
  }
}
function drawBandPup(c, E, K, s) {
  if (!K.band || !K.pupBandAt) return;
  headPt(s, K, K.pupBandAt[0], K.pupBandAt[1]); const T = toT0(E.P, Q[0], Q[1]);
  const ax = T[0], ay = T[1];
  for (let j = 1; j >= 0; j--) {
    const n = 5, pts = H.chain(j ? 'band2' : 'band', E, ax, ay, n, j ? 2.7 : 3.2, j ? H.CC.BAND2 : H.CC.BAND, ax + 1);
    for (let i = 0; i < n; i++) WS[i] = lerp(0.95, 0.6, i / (n - 1));
    ribbonPath(c, pts, n, WS, false);
    const bc = sh(K.band, -0.25 * j);
    c.fillStyle = G.tint || grad(pts[0], pts[1] - 2, pts[0], pts[1] + 2, bc, 0.8); c.fill();
    if (!G.tint) { c.strokeStyle = ra('#1a0508', 0.55); c.lineWidth = 0.35; c.stroke(); }
  }
}

// ── 망토: 절차적 베를레 띠 + 벨벳 결 텍스처 ──
const CAPE_PAT = new Map();
function capeTex() { return assets.get('puppets/_shared/cape_tex'); }
if (typeof window !== 'undefined') setTimeout(capeTex, 450);   // 6KB — 망토를 처음 그리기 전에 받아 둔다
/** 망토 색으로 물들인 벨벳 패턴 캔버스 (색별 캐시) */
export function capeCanvas(col) {
  let cv = CAPE_PAT.get(col);
  if (cv === undefined) {
    const tex = capeTex();
    if (!tex || typeof document === 'undefined') return null;
    cv = document.createElement('canvas'); cv.width = tex.naturalWidth || tex.width; cv.height = tex.naturalHeight || tex.height;
    const g = cv.getContext('2d');
    g.fillStyle = col; g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'overlay'; g.drawImage(tex, 0, 0);
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = col; g.fillRect(0, 0, cv.width, cv.height);
    CAPE_PAT.set(col, cv);
  }
  return cv;
}
const CAPE_OFF = new Float32Array(32), FOLD = new Float32Array(32);
/** 망토 주름: 띠 중심선을 따라 폭 방향으로 비킨 세로 주름 3줄(그늘 + 옆 반사광). 밝은 망토(성기사 흰 망토)도 평평한 판처럼 보이지 않게 */
function capeFolds(c, off, n, col) {
  const light = lumOf(...(hexRgb(col) || [80, 60, 60])) > 150;
  c.save(); c.clip();
  for (const [f, a] of [[-0.55, 0.22], [0.05, 0.26], [0.5, 0.2]]) {
    for (let i = 0; i < n; i++) {
      const i0 = i > 0 ? i - 1 : 0, i1 = i < n - 1 ? i + 1 : n - 1;
      const tx = off[i1 * 2] - off[i0 * 2], ty = off[i1 * 2 + 1] - off[i0 * 2 + 1], d = Math.hypot(tx, ty) || 1;
      const u = i / (n - 1), k = f * WS[i] * (0.35 + 0.65 * u) + Math.sin(i * 1.7 + f * 5) * 0.4;
      FOLD[i * 2] = off[i * 2] + (-ty / d) * k; FOLD[i * 2 + 1] = off[i * 2 + 1] + (tx / d) * k;
    }
    for (let i = 0; i < n; i++) WS[16 + i] = 0.35 + 2.1 * Math.pow(i / (n - 1), 0.8);
    ribbonPath(c, FOLD, n, WS.subarray(16), false);
    c.fillStyle = ra(light ? '#3a3020' : '#050208', a * (light ? 1.15 : 1)); c.fill();
    for (let i = 0; i < n; i++) FOLD[i * 2] += 1.3;
    for (let i = 0; i < n; i++) WS[16 + i] *= 0.6;
    ribbonPath(c, FOLD, n, WS.subarray(16), false);
    c.fillStyle = ra('#ffffff', light ? 0.2 : 0.07); c.fill();
  }
  c.restore();
}
function drawCapePup(c, E, K, s) {
  const cp = K.cape; if (!cp) return;
  const a = K.pCape;
  const T = toT0(E.P, s.nx + s.ux * a[0] + s.fx * a[1], s.ny + s.uy * a[0] + s.fy * a[1]);
  const n = 7, len = 58 * cp.len;
  const pts = H.chain('cape', E, T[0], T[1], n, len / (n - 1), H.CC.CAPE, T[0] - 0.5);
  for (let i = 0; i < n; i++) WS[i] = lerp(4.2, 11 + cp.len * 2.6, Math.pow(i / (n - 1), 0.7));
  // 안감
  ribbonPath(c, pts, n, WS, false);
  c.fillStyle = G.tint || sh(cp.c2, -0.25); c.fill();
  // 겉감: 안감 쪽으로 비켜 조금 좁게
  const off = CAPE_OFF;
  for (let i = 0; i < n; i++) {
    const i0 = i > 0 ? i - 1 : 0, i1 = i < n - 1 ? i + 1 : n - 1;
    const tx = pts[i1 * 2] - pts[i0 * 2], ty = pts[i1 * 2 + 1] - pts[i0 * 2 + 1], d = Math.hypot(tx, ty) || 1;
    const k = 3.2 * (i / (n - 1));
    off[i * 2] = pts[i * 2] + (-ty / d) * k; off[i * 2 + 1] = pts[i * 2 + 1] + (tx / d) * k;
    WS[i] *= 0.9;
  }
  ribbonPath(c, off, n, WS, false);
  const cv = G.tint ? null : capeCanvas(cp.c);
  if (cv) {
    const pat = c.createPattern(cv, 'repeat');
    const e = (n - 1) * 2, ang = Math.atan2(off[e + 1] - off[1], off[e] - off[0]);
    if (pat && typeof DOMMatrix !== 'undefined') {
      pat.setTransform(new DOMMatrix().translateSelf(off[0], off[1]).rotateSelf(((ang + 0.95) * 180) / PI).scaleSelf(0.16, 0.16));
      c.fillStyle = pat; c.fill();
    } else { c.fillStyle = cp.c; c.fill(); }
    // 부피감: 뒤쪽 가장자리 어둡게 + 윤곽
    c.save(); c.globalAlpha = 0.35; c.fillStyle = grad(off[0] - 8, off[1], off[e] + 8, off[e + 1], sh(cp.c, -0.2), 1); c.fill(); c.restore();
    c.strokeStyle = ra('#0a0306', 0.55); c.lineWidth = 0.5; c.stroke();
    capeFolds(c, off, n, cp.c);                            // (현재 경로 = 망토 겉감 → 그 안으로 잘라 그림)
    if (cp.style === 'royal' || cp.style === 'tattered') {
      const tx = off[e] - off[e - 2], ty = off[e + 1] - off[e - 1], d = Math.hypot(tx, ty) || 1, w = WS[n - 1];
      c.strokeStyle = cp.style === 'royal' ? '#e8c872' : ra(sh(cp.c2, 0.2), 0.9); c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(off[e] + (-ty / d) * w, off[e + 1] + (tx / d) * w); c.lineTo(off[e] - (-ty / d) * w, off[e + 1] - (tx / d) * w); c.stroke();
    }
  } else {
    c.fillStyle = G.tint || cp.c; c.fill();
    if (!G.tint) { c.strokeStyle = ra('#0a0306', 0.55); c.lineWidth = 0.5; c.stroke(); capeFolds(c, off, n, cp.c); }  // 결 텍스처 로드 전에도 주름
  }
}

// ───────────────────────── 레이어 ─────────────────────────
/**
 * 퍼펫 본체 레이어 (hero.js drawLayers 대신). E = hero.js 의 그리기 문맥 {p, rig, hs, fac, dt, P, K, skipFarLeg}
 * 순서: 망토 → 머리띠 꼬리·포니테일 → [T1] 날개 → 먼 무기·먼 팔 → 머리 → 안쪽 자락 → 먼 다리 → 가까운 다리 → 바깥 자락
 *       → 몸통(+채찍 똬리) → 가까운 위팔 → 어깨 덮개 → 가까운 아래팔 → 주무기 → 주먹 → (양손 무기) 먼 주먹
 */
export function drawLayers(c, E, K, P, W, tt) {
  const I = K.pup;
  if (!useLevel(I, c)) return false;
  const s = H.SK, ST = H.ST, J = R.J;
  drawCapePup(c, E, K, s);
  if (K.scarf?.long && H.drawScarfTail) H.drawScarfTail(s, K, E);
  drawBandPup(c, E, K, s);
  drawPonyPup(c, E, K, s);
  c.save(); H.applyT1(c, P);
  if (K.wings) { c.save(); H.drawWings(s, K, P, E.p, tt); c.restore(); }
  // ── 먼 팔 (+ 보조 무기) ──
  const two = P.two && W.type !== 'none';
  const offW = K.off && W.type !== 'none';
  const casting = ST.cast === 3 || (ST.cast && ST.atk?.cast && P.r2 > 0.8) || ST.throwK === 2; // 먼 손 편 손: 시전·(채찍 외) 투척
  const throwing = ST.throwK === 1;                                                               // 가까운 손 편 손: 채찍 영웅 투척
  if (offW) drawWeapon(W, s.h2x, s.h2y, P.w2, { fire: ST.fire2 });
  const farMode = offW ? 'grip' : two ? 'none' : casting ? 'open' : 'hand';
  armPup(c, s.s2x, s.s2y, s.e2x, s.e2y, s.h2x, s.h2y, true, farMode === 'hand');
  if (farMode === 'grip') gripPup(c, K, s.e2x, s.e2y, s.h2x, s.h2y, P.w2, W.type, true);
  else if (farMode === 'open' && !openPup(c, K, s.e2x, s.e2y, s.h2x, s.h2y, true)) { c.save(); boneXf(c, J.elbow, J.hand, s.e2x, s.e2y, s.h2x, s.h2y); blit(c, 'hand', true); c.restore(); }
  // ── 머리 (몸통 옷깃 뒤) + 후광 ──
  if (K.halo && G.fx) { headPt(s, K, J.headPivot[0], R.rig.figTop + 10); drawHalo(Q[0] - 0.5, Q[1] - 3 + Math.sin(G.t * 2) * 0.6, 6.8, K.aura?.color || '#ffe9a0'); }
  c.save(); headXf(c, s, K); blit(c, 'head'); c.restore();
  // ── 자락 · 다리 ──
  skirtSetup(K, s, P);
  drawSkirtFar(c, s, K, false);
  if (!E.skipFarLeg) legPup(c, K, s.hp2x, s.hp2y, s.k2x, s.k2y, s.a2x, s.a2y, P.t2, true);
  legPup(c, K, s.hp1x, s.hp1y, s.k1x, s.k1y, s.a1x, s.a1y, P.t1, false);
  drawSkirtPup(c, false);
  // ── 몸통 (+ 허리의 채찍 똬리) ──
  c.save(); boneXf(c, J.pelvis, J.neck, s.px, s.py, s.nx, s.ny); blit(c, 'torso'); if (ST.coil) blit(c, 'coil'); c.restore();
  // ── 가까운 팔: 위팔 → 어깨 덮개 → 아래팔 → 주무기 → 주먹 ──
  const hasMain = (W.type !== 'none' && W.type !== 'whip') || (W.type === 'whip' && !ST.coil);
  c.save(); boneXf(c, J.shoulder, J.elbow, s.s1x, s.s1y, s.e1x, s.e1y); blit(c, 'uarm'); c.restore();
  c.save(); boneXf(c, J.pelvis, J.neck, s.px, s.py, s.nx, s.ny); blit(c, 'pad'); c.restore();
  c.save(); boneXf(c, J.elbow, J.hand, s.e1x, s.e1y, s.h1x, s.h1y); blit(c, 'farm'); if (!hasMain && !throwing) blit(c, 'hand'); c.restore();
  if (hasMain) {
    weaponPup(c, W, s.h1x, s.h1y, P.w1, ST.fire1);
    gripPup(c, K, s.e1x, s.e1y, s.h1x, s.h1y, P.w1, W.type, false);
    if (two) gripPup(c, K, s.e2x, s.e2y, s.h2x, s.h2y, P.w1, W.type, false, 0.96);
  } else if (throwing) {
    if (!openPup(c, K, s.e1x, s.e1y, s.h1x, s.h1y, false)) { c.save(); boneXf(c, J.elbow, J.hand, s.e1x, s.e1y, s.h1x, s.h1y); blit(c, 'hand'); c.restore(); }
  }
  c.restore();
  return true;
}
/** 절차적 무기를 채색 원화 옆에 어울리게: 윤곽선을 조금 가늘게, 부드러운 접지 그림자 한 겹 */
function weaponPup(c, W, x, y, ang, fire) {
  const olw = G.olw;
  if (!G.tint && G.pass !== 1 && G.fx) {
    // 그림자: 같은 무기를 어둡게 한 번 (0.6px 아래·뒤로) — 그림에 붙은 느낌
    const gt = G.tint;
    c.save(); c.globalAlpha = 0.35; G.tint = '#07030a';
    drawWeapon(W, x - 0.35, y + 0.6, ang, {});
    G.tint = gt; c.restore();
  }
  G.olw = olw * 0.8;
  drawWeapon(W, x, y, ang, { fire });
  G.olw = olw;
}

// ───────────────────────── 턴테이블 (인벤토리) ─────────────────────────
/** 이 look 의 퍼펫 턴테이블이 쓸 수 있는가 (시트 로드 전이면 요청하고 false). 재질 마스크도 함께 요청 */
export function turnReady(I) {
  const E = I?.E;
  if (!E?.rig?.turn) return false;
  if (!E.turnImg) E.turnImg = assets.get(`puppets/${E.key}/turn`, E.man.h);
  if (E.rig.turn.mask && !E.turnMask) E.turnMask = assets.get(`puppets/${E.key}/turn_mask`, E.man.h);
  return !!E.turnImg;
}
/** 턴테이블 시트: 장비 갑옷 색이 원화와 다르면 turn_mask 로 다시 칠한 캔버스(변형별 1회) */
function turnSrc(I) {
  const E = I.E, V = I.V;
  if (!V || !E.rig.turn.mask || typeof document === 'undefined') return E.turnImg;
  if (V.turn) return V.turn;
  if (!E.turnMask) return E.turnImg;
  return (V.turn = recolorCanvas(E.turnImg, E.turnMask, V));
}
const STEPS = [0, 45, 90, 135, 180, -135, -90, -45];
/**
 * 채색 8방향 뷰 하나를 그린다. ctx 는 발 중앙 원점·논리 배율(hs) 적용 상태. deg = 스텝 각(0,45,…,-45)
 * sx = 가로 배율(회전 느낌), alpha = 불투명도. 반환: 뷰 정보(망토·날개 배치용) 또는 null
 */
export function drawTurnStep(ctx, I, deg, sx, alpha, t) {
  const E = I.E, T = E.rig.turn;
  const st = T.steps[String(deg)];
  if (!st || !E.turnImg || alpha <= 0.002) return null;
  const v = T.views[st.v];
  const s = PUP_H / (v.footY - v.topY);
  const breath = 1 + Math.sin(t * 2.2) * 0.006;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha *= alpha;
  ctx.scale((st.m ? -1 : 1) * s * sx, s * breath);
  ctx.drawImage(turnSrc(I), v.x, 0, v.w, v.h, -v.axisX, -v.footY, v.w, v.h);
  ctx.restore();
  return { s, v, m: st.m };
}
/**
 * 턴테이블 채색 뷰의 무기 (원화에는 허리의 채찍 똬리만 있다). platform.md §7.3: 장착 무기가 8방향 모두에서 보이게.
 * 손은 몸 옆에 늘어뜨린 자리(어깨 반폭, 엉덩이 높이), 오른손(가까운 손)의 화면 x = −sin(yaw)·반폭.
 * front=false: 몸 뒤 패스(몸에 가려지는 쪽 손 / 앞모습의 등에 멘 대검), true: 몸 앞 패스.
 */
export function drawTurnWeapon(ctx, I, W, yaw, front, t) {
  const type = W?.type;
  if (!type || type === 'none' || type === 'whip') return;
  const T = I.E.rig.turn, v = T.views.y90 || Object.values(T.views)[0];
  const s = PUP_H / (v.footY - v.topY), hx = v.shW * s * 0.98, sn = Math.sin(yaw), cs = Math.cos(yaw);
  const olw = G.olw; G.olw = 0.8;
  const hand = (side) => {                                   // side +1 = 오른손(가까운 손), −1 = 왼손
    const x = -sn * hx * side, depth = cs * side;             // depth > 0: 몸 앞
    return { x, y: -43, depth };
  };
  const tilt = 0.28 * cs;                                     // 칼끝을 보는 쪽으로 조금
  if (type === 'greatsword') {                                // 등에 멘 대검: 앞모습은 몸 뒤, 뒷모습은 등을 덮음
    if ((sn < 0) !== front) { G.olw = olw; return; }
    const xs = -sn * v.shW * s * 0.55 - cs * 4;
    drawWeapon(W, xs, -76, HP + (xs >= 0 ? 0.5 : -0.5), {});
    G.olw = olw; return;
  }
  const list = type === 'dagger' || type === 'gun' ? [1, -1] : [1];
  for (const side of list) {
    const h = hand(side);
    if ((h.depth > -0.2) !== front) continue;
    const ang = type === 'staff' ? -HP - 0.08 * cs : type === 'gun' ? HP - 0.45 * cs : HP - tilt;
    drawWeapon(W, h.x, h.y + (type === 'staff' ? -2 : 0), ang, {});
  }
  G.olw = olw;
}
export function turnSteps() { return STEPS; }
/** 턴테이블용 망토: 앞(뒤에 가려짐)·옆(뒤로 흐름)·뒤(몸을 덮음). yaw: 라디안, behind: 몸 뒤 패스인지 */
export function drawTurnCape(ctx, I, cape, yaw, behind, t) {
  if (!cape) return;
  const E = I.E, T = E.rig.turn;
  const v = T.views.y90 || Object.values(T.views)[0];
  const s = PUP_H / (v.footY - v.topY);
  const sy = (v.shY - v.footY) * s, shw = v.shW * s * 0.82, hem = -PUP_H * (1 - 0.8 * cape.len) + 2;
  const sn = Math.sin(yaw), cs = Math.cos(yaw);
  const back = sn < 0;
  if (behind === back) return;                          // 앞모습: 몸 뒤 패스 / 뒷모습: 몸 앞 패스
  // 앞모습(몸 뒤 패스): 어깨 너머로 옆만 보임. 뒷모습(몸을 덮는 패스): 화면에 보이는 폭은 |sin| 에 비례 —
  // 옆모습 가까이(−160°, −20°)에서 망토가 몸 전체를 덮어 버리지 않게 등 쪽으로 좁게
  const wTop = back ? shw * (0.22 + 0.78 * Math.abs(sn)) : shw * (0.55 + 0.45 * Math.abs(sn));
  const wBot = back ? shw * (0.4 + 0.9 * Math.abs(sn)) + 4 * Math.abs(cs) : shw * (1.05 + 0.5 * Math.abs(sn)) + 6 * Math.abs(cs);
  const dx = -cs * shw * (back ? 0.62 : 0.55);         // 옆으로 돌면 등 쪽으로 밀림
  const sway = Math.sin(t * 1.6) * 1.2;
  const c = ctx;
  c.save();
  c.beginPath();
  c.moveTo(dx - wTop, sy); c.quadraticCurveTo(dx, sy - 2.5, dx + wTop, sy);
  c.quadraticCurveTo(dx + wBot * 1.02 + sway, (sy + hem) / 2, dx + wBot + sway, hem);
  for (let i = 1; i <= 6; i++) { const u = i / 6, x = dx + wBot + sway - u * 2 * wBot; c.lineTo(x, hem + (i % 2 ? 1.6 : -0.4)); }
  c.quadraticCurveTo(dx - wBot * 1.02 + sway, (sy + hem) / 2, dx - wTop, sy);
  c.closePath();
  const cv = capeCanvas(cape.c);
  if (cv) {
    const pat = c.createPattern(cv, 'repeat');
    if (pat && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().translateSelf(dx - wBot, sy).scaleSelf(0.2, 0.2));
    c.fillStyle = pat || cape.c;
  } else c.fillStyle = cape.c;
  c.fill();
  // 주름: 세로 명암 띠 (어깨에서 모여 밑단으로 퍼짐) + 가장자리 어둡게
  const g = c.createLinearGradient(dx - wBot, 0, dx + wBot, 0);
  const F = 5;
  for (let i = 0; i <= F * 2; i++) {
    const u = i / (F * 2), edge = Math.abs(u - 0.5) * 2;
    const a = i % 2 ? 0.02 : 0.2;
    g.addColorStop(u, ra('#000000', Math.min(0.6, a + edge * edge * 0.4)));
  }
  c.fillStyle = g; c.fill();
  const hi = c.createLinearGradient(0, sy, 0, hem);
  hi.addColorStop(0, ra('#ffffff', 0.1)); hi.addColorStop(0.3, ra('#ffffff', 0)); hi.addColorStop(1, ra('#000000', 0.25));
  c.fillStyle = hi; c.fill();
  c.strokeStyle = ra('#0a0306', 0.6); c.lineWidth = 0.6; c.stroke();
  if (!back) { c.strokeStyle = ra(cape.c2, 0.9); c.lineWidth = 1.1; c.beginPath(); c.moveTo(dx - wBot * 0.98, hem); c.lineTo(dx + wBot * 0.98, hem); c.stroke(); }
  if (cape.style === 'royal') { c.strokeStyle = '#e8c872'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(dx - wTop, sy + 0.5); c.quadraticCurveTo(dx, sy - 2, dx + wTop, sy + 0.5); c.stroke(); }
  c.restore();
}
/** 턴테이블용 날개 한 쌍 (앞·뒤 모습에서 대칭). front=true 면 몸 앞 패스(뒷모습) */
export function drawTurnWings(ctx, I, type, yaw, front, t) {
  if (!type) return;
  const E = I.E, T = E.rig.turn;
  const v = T.views.y90 || Object.values(T.views)[0];
  const s = PUP_H / (v.footY - v.topY);
  const sy = (v.shY - v.footY) * s + 4, sn = Math.sin(yaw), cs = Math.cos(yaw);
  const back = sn < 0;
  if (front !== back) return;
  const spread = 0.55 + Math.sin(t * 2.2) * 0.05;
  for (const side of [-1, 1]) {
    const k = side * cs;                                  // 옆으로 돌면 한쪽이 몸에 가려 좁아진다
    const w = Math.max(0.15, Math.abs(sn) * 0.85 + (k > 0 ? 0.25 : 0.05) * Math.abs(cs));
    ctx.save();
    ctx.translate(side * 3 - cs * 5, sy);
    ctx.scale(side * w, 1);
    drawWing(type, spread, Math.sin(t * 2.2) * 0.06, side < 0 === back, false);
    ctx.restore();
  }
}
/** 후광 (턴테이블) */
export function drawTurnHalo(ctx, col, t) { drawHalo(0, -PUP_H - 4 + Math.sin(t * 2) * 0.6, 7, col || '#ffe9a0'); }

/** 디버그·갤러리: 로드 상태 */
export function puppetStatus() {
  const out = {};
  for (const [k, E] of REG) if (E !== NONE) out[k] = { state: E.state, levels: E.levels.map((L) => L.name + (levelPeek(E, L) ? '✓' : '…')), variants: [...E.vars.keys()] };
  return out;
}
void glow; void TAU;
