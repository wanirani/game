// 채색 컷아웃 퍼펫 — 클링 측면 원화를 부위별로 잘라 만든 아틀라스를 hero.js 의 자세·IK 골격(SK)에 붙여 그린다.
// 에셋: assets/puppets/<charId>/<classId>/{rig.json, atlas_{lo,hi,ui}.webp, mask_{lo,hi,ui}.webp, turn.webp}
//       (tools/puppet/build_all.py 가 만들고, 목록은 ./puppet_manifest.js). 파이프라인 문서: docs/art/PUPPET_PIPELINE.md
// 흐름: puppetFor(p, look) → (지연 로드, 준비 전 null = 벡터 대체) → applySpec(K, R) 로 골격 치수를 원화에 맞춤
//       → drawLayers(...) 가 레이어 순서대로 부품을 그림 (hero.js drawLayers 대신)
// 원칙: 부품 좌표는 원화 px. 뼈 부위는 원화의 두 관절 → 골격의 두 관절 (회전 + 뼈 방향으로만 늘임, 0.82~1.22 제한)
//       먼 쪽 팔다리는 어둡게 구운 사본, 갑옷 색은 재질 마스크(R=갑옷, G=장식)로 다시 칠한 변형(장착 시 1회)
//       망토는 절차적 베를레 띠 + 벨벳 결 텍스처, 무기·궤적·효과는 기존 절차적 코드(hero_parts.js)
import { assets } from '../core/assets.js';
import { bus } from '../core/events.js';
import { CLASSES, classChain } from '../data/classes.js';
import { CHARACTERS } from '../data/characters.js';
import { NPCS } from '../data/npcs.js';
import { TOWN_NPCS } from '../data/town.js';
import { PUPPETS } from './puppet_manifest.js';
import { ASCENSIONS } from '../data/ascensions.js';   // 초월·비전: 원화는 2차 것을 쓴다 (classes_t3 §2.7)
import { G, sh, ra, fillGrad, ribbonPath, WS, drawWeapon, drawWing, glow, drawHalo } from './hero_parts.js';
import { drawSkinned, spring, stateOf, meshOverride } from './puppet_mesh.js';

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
// 원화가 있는 직업으로 (classes_t3 §2.7): 그 직업 원화 → 없으면 부모 직업을 거슬러 올라가며 찾는다. 초월·비전 id 는 (그 원화가
// 따로 없으면) 첫 2차 부모로. 원화가 하나도 없으면 null (→ 벡터). 메모
const ART = new Map();
export function artClass(cid, cls) {
  if (!cid || !cls) return null;
  const k = cid + '/' + cls;
  let r = ART.get(k);
  if (r !== undefined) return r;
  r = null;
  let c = cls;
  if (!PUPPETS[cid]?.[c] && Object.hasOwn(ASCENSIONS, c)) c = ASCENSIONS[c].parents[0] ?? null;
  for (let n = 0; c && n < 8; n++) {
    if (PUPPETS[cid]?.[c]) { r = c; break; }
    c = CLASSES[c]?.parent ?? null;
  }
  ART.set(k, r);
  return r;
}
const CLS = new WeakMap();
/** look 이 어느 직업의 것인지: (초월·비전 전용 원화) → look.classId(원화 있는 직업으로) → 색 지문(주/보조/장식색·머리 모양, 장비가 바꾸지 않는 값) → p.hero.classId */
export function classOf(p, look) {
  if (!look) return null;
  const cid0 = p?.ch?.id;
  if (look.asc && PUPPETS[cid0]?.[look.asc]) return look.asc;   // 앞날의 비전 원화(PUPPETS[charId][hiddenId])가 생기면 저절로 고른다
  if (look.classId) return artClass(cid0, look.classId) ?? look.classId;
  let c = CLS.get(look);
  if (c === undefined) {
    const cid = p?.ch?.id;
    c = null;
    if (cid && CHARACTERS[cid]) {
      let bt = -1;
      for (const id in CLASSES) {
        const k = CLASSES[id];
        if (k.charId !== cid || !PUPPETS[cid]?.[id]) continue;
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
const akey = (E, kind, L) => `${E.root}/${E.key}/${kind}_${L.name}`;
/** 이미 로드된 이미지만 돌려준다 (요청하지 않음) */
const peek = (k) => (assets.has(k) ? assets.get(k) : null);
function levelImg(E, L) { return assets.get(akey(E, 'atlas', L), E.man.h); }   // 요청 + 로드됐으면 이미지
function levelPeek(E, L) { return peek(akey(E, 'atlas', L)); }
function maskImg(E, L) { return assets.get(akey(E, 'mask', L), E.man.h); }
function maskPeek(E, L) { return peek(akey(E, 'mask', L)); }
function entry(cid, cls, sib = false) {
  cls = cid === NPC_CID ? cls : (artClass(cid, cls) ?? cls);   // 초월 id·원화 없는 직업 → 원화 있는 직업
  const key = cid + '/' + cls;
  let E = REG.get(key);
  if (E) return E;
  const man = PUPPETS[cid]?.[cls];
  if (!man) { REG.set(key, NONE); return NONE; }
  E = { key, root: 'puppets', cid, cls, man, state: 0, rig: null, PS: 1, J: null, parts: null, levels: [], lvIdx: {}, dark: {}, vars: new Map(), turnImg: null, turnMask: null, req: false, used: 0, gen: 0, born: typeof performance !== 'undefined' ? performance.now() : 0 };
  REG.set(key, E);
  assets.json(`${E.root}/${key}/rig`, man.h).then((rig) => {
    if (!rig || !rig.levels || !rig.parts) { E.state = -1; return; }
    E.rig = rig; E.J = rig.joints; E.parts = rig.parts;
    E.PS = PUP_H / (rig.sole - rig.figTop);
    E.levels = Object.entries(rig.levels).map(([name, L]) => ({ name, scale: L.scale, rects: L.rects, size: L.size })).sort((a, b) => a.scale - b.scale);
    E.levels.forEach((L, i) => { E.lvIdx[L.name] = i; });
    E.opts = rig.opts || {};
    E.mo = meshOverride(key, rig);   // 메시 관절 설정 (리그 관절·부위 크기에서 자동 + 리그별 덮어쓰기, puppet_mesh.js)
    E.lit = {};                      // 윤곽선·역광을 구워 넣은 레벨 캔버스 {레벨: {k: 역광 키, cv}} (bakeLit)
    // 게임 화면용 두 레벨 + 그 재질 마스크(≈14KB, 장비 색을 바꿀 때 원래 색이 한 프레임 비치지 않게). ui 레벨은 메뉴에서 필요할 때.
    // 형제 직업 미리 받기(sib)는 아틀라스만: 마스크는 디코딩하면 아틀라스와 같은 크기라 폰 텍스처 예산을 두 배로 먹는다 — 처음 그릴 때 받는다
    requestLevels(E, !sib);
  });
  return E;
}
/** 게임 화면용 두 레벨 + 그 재질 마스크를 요청 (ui 레벨은 메뉴에서 필요할 때). 텍스처를 놓았다가 다시 쓸 때도 이것으로 다시 받는다 */
function requestLevels(E, masks = true) {
  E.req = true;
  for (const L of E.levels) if (L.name !== 'ui') { levelImg(E, L); if (masks) maskImg(E, L); }
}
/** 준비 상태: 리그 + 레벨 이미지 하나 이상 (ui 레벨은 여기서 요청하지 않는다) */
function ready(E) {
  if (E.state === 1) return true;
  if (E.state < 0 || !E.rig) return false;
  if (!E.req) requestLevels(E);   // 예산 때문에 텍스처를 놓았던 퍼펫을 다시 쓴다
  for (const L of E.levels) if (levelPeek(E, L)) { E.state = 1; REV++; preloadSiblings(E.cid); return true; }
  if (E.levels.filter((L) => L.name !== 'ui').every((L) => assets.failed(akey(E, 'atlas', L)))) E.state = -1;
  return false;
}
/** 미리 불러 두기 (장면 진입 시 등, 선택) */
export function preloadPuppet(charId, classId) { const E = entry(charId, classId); return E; }   // entry 가 artClass 로 원화 직업을 고른다
// 한 직업이 준비되면 같은 영웅의 다른 직업(rig + lo/hi ≈60KB씩)을 한가할 때 받아 둔다 —
// 교회 전직 카드·파티·직업 탭이 처음 그릴 때 벡터로 찍혀 스냅샷에 남는 일을 막는다
const SIB = new Set();
function preloadSiblings(cid) {
  if (cid === NPC_CID) return;   // NPC 묶음은 형제 미리 받기 없음 (스테이지에 NPC 한 명만 있어도 나머지 7명을 받게 된다)
  if (SIB.has(cid) || typeof window === 'undefined') return;
  SIB.add(cid);
  const ids = Object.keys(PUPPETS[cid] || {});
  let i = 0;
  const next = () => { if (i >= ids.length) return; entry(cid, ids[i++], true); idle(next); };
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
  // 초월 색조 (lookTop.tint {h: 색상 회전°, s: 채도 배율}) — 원화 전체에 hue-rotate/saturate 를 건 뒤 재질 마스크로 다시 칠한다
  const T = look.tint, tn = T && (Number.isFinite(T.h) || Number.isFinite(T.s)) ? `${Number.isFinite(T.h) ? T.h : 0}~${Number.isFinite(T.s) ? T.s : 1}` : null;
  if (!ac && !tc && !tn) return '';
  return `${ac || '-'}|${tc || '-'}|${look.armor || '-'}|${tn || '-'}`;
}
// 재질별 [명암 대비, 금속 반사]
const FINISH = { leather: [1, 0], chain: [1.12, 0.1], plate: [1.25, 0.25], holy: [1.2, 0.3], dark: [1.3, 0.12] };
function makeVariant(E, vk) {
  const [ac, tc, kind, tn] = vk.split('|');
  const tint = tn && tn !== '-' ? (([h, s]) => ({ h: Number(h) || 0, s: Number.isFinite(Number(s)) ? Number(s) : 1 }))(tn.split('~')) : null;
  return { vk, ac: ac === '-' ? null : hexRgb(ac), tc: tc === '-' ? null : hexRgb(tc), fin: FINISH[kind] || [1, 0], tint, img: {}, dark: {}, lit: {}, turn: undefined };
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
  const cv = spareCanvas(W, Hh);
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (V.tint && 'filter' in g) g.filter = `hue-rotate(${V.tint.h}deg) saturate(${V.tint.s})`;   // 초월 색조: 먼저 원화 전체, 마스크 재칠은 그 위에
  g.drawImage(src, 0, 0);
  if (V.tint && 'filter' in g) g.filter = 'none';
  if (!V.ac && !V.tc) return cv;   // 색조만 있는 변형: 마스크 재칠 없음
  const d = g.getImageData(0, 0, W, Hh);
  const mc = MASK_TMP ??= document.createElement('canvas'); mc.width = W; mc.height = Hh;   // 마스크 확대용 작업 캔버스 (공용, 매번 새로 만들지 않음)
  const mg = mc.getContext('2d', { willReadFrequently: true });
  mg.imageSmoothingEnabled = true; mg.drawImage(mk, 0, 0, W, Hh);
  const m = mg.getImageData(0, 0, W, Hh).data;
  if (V.ac) recolorPx(d.data, m, 0, V.ac, V.fin, 0.92);
  if (V.tc) recolorPx(d.data, m, 1, V.tc, [1.1, 0.2], 0.85);
  g.putImageData(d, 0, 0);
  mc.width = mc.height = 1;
  return cv;
}
// ── 굽기용 예비 캔버스 (0×0): 부팅·스테이지/방 진입 때 채워 둔다 → 싸움 도중 새 레벨(카메라 줌)·변형을 구울 때 캔버스를
//    새로 만들지 않는다 (MASTER_PLAN §5.2 스테이지 도중 캔버스 0, R1-REQ-339R). 안 쓰는 예비는 메모리 0
const SPARE = [];
let MASK_TMP = null;
function fillSpares(n = 12) {
  if (typeof document === 'undefined') return;
  while (SPARE.length < n) { const c = document.createElement('canvas'); c.width = 0; c.height = 0; SPARE.push(c); }
}
function spareCanvas(w, h) {
  const c = SPARE.pop() ?? document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
/** 다 쓴 굽기 캔버스를 예비로 돌린다 (0×0 → 메모리 0) */
function recycle(c) {
  if (!c || typeof c.getContext !== 'function') return;
  c.width = 0; c.height = 0;
  if (SPARE.length < 16) SPARE.push(c);
}
fillSpares();
// 스테이지·방 진입(로딩 페이드 뒤) 때 예비를 다시 채운다 (싸움 도중에는 새로 만들지 않게). events.js 는 잎 모듈이지만
// 순환 import 로 초기화 순서가 바뀌어도 안전하게 한 박자 늦춰 구독한다
// 스테이지 진입 강제 정리는 곧바로 하지 않고, 진입 뒤 첫 영웅 그리기 묶음이 끝난 다음에 한다 (forceNext → touchUse):
// stageEntered 는 월드 생성 도중(첫 그리기 전)에 오므로, 그때 정리하면 이번 스테이지 플레이어의 퍼펫(방금 미리 받았거나 메뉴에서
// 다른 영웅 뒤에 그린 것)이 '다른 영웅·안 그린 퍼펫'으로 보여 가장 먼저 내려진다 → 첫 몇 프레임 벡터 대체 그림 + 다시 받기
if (typeof setTimeout === 'function') setTimeout(() => { bus.on('stageEntered', () => { fillSpares(); forceNext = true; }); bus.on('roomEntered', () => fillSpares()); }, 0);

// ───────────────────────── 텍스처 예산 (R1-RUN-TEX-TOUCH) ─────────────────────────
// 퍼펫 아틀라스·마스크·턴테이블(assets 'puppets' 묶음)은 채색 텍스처 예산(assets.paintedBudget: 터치 폰·태블릿 / 데스크톱)에
// 합산되지만 assets 는 소유 모듈이 붙잡은 이미지라 스스로 내리지 않는다. 영웅을 여럿 바꿔 쓰면(파티·직업 탭·형제 미리 받기)
// 한 판에 모든 영웅·직업의 텍스처가 쌓여 폰 예산을 넘으므로, 예산의 75% 를 넘으면 한동안(IDLE_MS) 그리지 않은 퍼펫부터
// 텍스처와 구운 캔버스를 내린다 (리그 JSON 은 유지 → 다시 그릴 때 텍스처만 다시 받는다; 그동안은 벡터 대체 그림).
const IDLE_MS = 4000, FRESH_MS = 10000, SWEEP_HI = 0.75, SWEEP_LO = 0.6;
let sweepAt = -1e9;
const CID_USED = new Map();   // 영웅(cid) → 그 영웅의 퍼펫을 마지막으로 그린 시각
let HERO_CID = null;          // 마지막으로 그린 (NPC 아닌) 영웅 = 보통 플레이어
/** 그림 표시: 이 퍼펫과 그 영웅을 '쓰는 중'으로 (정리 우선순위) + 가끔 예산 확인 */
let sweepQueued = false;
let forceNext = false;        // 스테이지 진입: 다음 영웅(플레이어) 그리기 뒤 한 번 강제 정리 (위 stageEntered 구독)
function touchUse(E, t, hero = false) {
  E.used = t; CID_USED.set(E.cid, t);
  if (hero) HERO_CID = E.cid;
  if (sweepQueued) return;
  const force = forceNext && hero;
  if (!force && t - sweepAt < 500) return;
  if (force) forceNext = false;
  // 정리는 이번 그리기 묶음(한 프레임·갤러리 한 장)이 끝난 뒤에: 긴 멈춤(로딩·탭 전환) 뒤 첫 프레임에서 먼저 그린 퍼펫이
  // 아직 안 그린 퍼펫을 '쉬는 중'으로 보고 내리지 않게 (그 프레임에 모두 다시 쓰일 텍스처)
  if (typeof setTimeout !== 'function') { sweep(t, force); return; }
  sweepQueued = true;
  setTimeout(() => { sweepQueued = false; sweep(performance.now(), force); }, 0);
}
function hasTextures(E) {
  if (E.turnImg || E.turnMask) return true;
  for (const L of E.levels) if (assets.has(akey(E, 'atlas', L)) || assets.has(akey(E, 'mask', L))) return true;
  return false;
}
/** 한 퍼펫의 텍스처·구운 캔버스를 내린다 → 내린 (예산) 바이트 */
function releaseEntry(E) {
  let b = 0;
  for (const L of E.levels) b += assets.release(akey(E, 'atlas', L)) + assets.release(akey(E, 'mask', L));
  b += assets.release(`${E.root}/${E.key}/turn`) + assets.release(`${E.root}/${E.key}/turn_mask`);
  b += assets.release(`${E.root}/${E.key}/turn16_ui`) + assets.release(`${E.root}/${E.key}/turn16_lo`);   // 16방향 시트 (메뉴 턴테이블)
  E.turnImg = null; E.turnMask = null;
  for (const k in E.dark) recycle(E.dark[k]);
  E.dark = {};
  for (const k in E.lit || {}) { recycle(E.lit[k].cv); recycle(E.lit[k].dark); }
  E.lit = {};
  for (const V of E.vars.values()) { for (const k in V.img) recycle(V.img[k]); for (const k in V.dark) recycle(V.dark[k]); for (const k in V.lit || {}) { recycle(V.lit[k].cv); recycle(V.lit[k].dark); } recycle(V.turn); for (const k in V.t16 || {}) recycle(V.t16[k]); }
  E.vars.clear();
  E.state = 0; E.req = false; E.gen++;
  return b;
}
/** 예산 확인 → 오래 안 쓴 퍼펫부터 내린다. force: 스테이지 진입처럼 전환 시점이면 문턱 없이 예산의 SWEEP_LO 까지 */
function sweep(t, force = false) {
  sweepAt = t;
  const budget = assets.paintedBudget;
  let have = assets.paintedBytes;
  if (!(budget > 0) || have <= budget * (force ? SWEEP_LO : SWEEP_HI)) return 0;
  // 순서: ① 한동안 아무 퍼펫도 그리지 않은 영웅의 것 ② 최근에 그린 다른 영웅·NPC 의 안 쓰는 직업 ③ 지금 플레이어 영웅의
  // 그려지지 않은 형제 직업(미리 받기) — 각각 오래된 순. 방금 바꾼 직업이 미리 받아져 있어 벡터 대체 그림이 비치지 않고,
  // 예산이 정말 모자랄 때만 플레이어의 형제 직업을 놓는다
  // 쉬는 시간 문턱: 플레이어 영웅·NPC 는 IDLE_MS(화면 밖에 잠깐 나간 NPC 를 곧바로 다시 받지 않게), 다른 영웅은 1초
  // (스테이지에는 플레이어 한 명만 그려지고, 파티 화면처럼 여럿을 그리는 동안은 매 프레임 쓰여 쉬지 않는다)
  const rank = (E) => (E.cid === HERO_CID ? 2 : t - (CID_USED.get(E.cid) ?? -1e9) < IDLE_MS ? 1 : 0);
  const idleFor = (E) => (E.cid === HERO_CID || E.cid === NPC_CID ? IDLE_MS : 1000);
  const list = [];
  // 아직 한 번도 그리지 않은 퍼펫(부팅·형제 미리 받기)은 받은 뒤 FRESH_MS 동안 둔다: 여러 영웅을 차례로 그리는 화면(갤러리·파티)에서
  // 곧 그릴 퍼펫을 그리기 전에 내렸다가 다시 받는 일이 없게. 스테이지 진입 정리(force)는 기다리지 않는다
  const idle = (E) => (E.used ? t - E.used >= idleFor(E) : force || t - E.born >= FRESH_MS);
  for (const E of REG.values()) if (E !== NONE && E.rig && idle(E) && hasTextures(E)) list.push(E);
  list.sort((a, b) => rank(a) - rank(b) || a.used - b.used);
  let freed = 0;
  for (const E of list) {
    if (have <= budget * SWEEP_LO) break;
    const b = releaseEntry(E);
    have -= b; freed += b;
  }
  return freed;
}
/** QA: 퍼펫 텍스처 정리를 바로 돌린다 → 내린 바이트 */
export function sweepPuppets(force = true) { return sweep(performance.now(), force); }
/** 변형 레벨 캔버스 (그 레벨의 마스크가 로드 전이면 null) */
function variantLevel(E, V, L) {
  const got = V.img[L.name];
  if (got) return got;
  const src = levelPeek(E, L), mk = maskImg(E, L);
  if (!src || !mk || typeof document === 'undefined') return null;
  return (V.img[L.name] = recolorCanvas(src, mk, V));
}
function bakeDark(src, a = FAR_DARK) {
  const cv = spareCanvas(src.naturalWidth || src.width, src.naturalHeight || src.height);
  const c = cv.getContext('2d');
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(14,8,24,${a})`; c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

// ───────────────────────── 퍼펫 인스턴스 (look 별) ─────────────────────────
const INST = new WeakMap();
const LAST = new WeakMap();   // 엔티티 → 마지막으로 그려진(준비된) 인스턴스: 직업을 막 바꿔 새 원화가 로드되는 동안 대신 그린다
/**
 * 이 엔티티/look 을 퍼펫으로 그릴 수 있으면 인스턴스, 아니면 null (로드 중·에셋 없음·끔 → 벡터 대체).
 * 호출할 때마다 필요한 로드를 건드리므로 매 프레임 불러도 된다 (캐시).
 */
export function puppetFor(p, look) {
  // 이번에 그릴 영웅의 날개 색 (초월 lookTop.wingCol) — hero_parts.drawWing 이 읽는다. puppetFor 는 hero.js specOf 가 매 그리기 첫머리에
  // 부르므로 (퍼펫·벡터 모두) 여기서 매번 덮어써 다른 영웅에 남지 않는다
  G.wingCol = look?.wingCol ?? null;
  if (!ENABLED || !look || look.puppet === false) return null;
  if (p?.npc) return npcPuppet(p, look);
  let I = INST.get(look);
  if (I === undefined) {
    const cid = p?.ch?.id, cls = cid ? classOf(p, look) : null;
    const E = cid && cls ? entry(cid, cls) : NONE;
    I = E === NONE ? null : { E, look, vk: '', V: null, key: E.key, lv: null, gen: E.gen };
    if (I) { I.vk = variantKey(E, look) ; }
    INST.set(look, I);
  }
  if (!I) return null;
  const E = I.E;
  if (I.gen !== E.gen) { I.gen = E.gen; I.V = null; I.lv = null; }   // 예산 때문에 텍스처를 놓았다 다시 받음 → 구운 변형·레벨 이력 버림
  const now = performance.now();
  touchUse(E, now, true);
  if (!ready(E)) {
    // 직업을 막 바꿨는데(전직·장비 탭·QA) 새 직업 원화가 아직 오는 중: 같은 영웅의 직전 퍼펫으로 잇는다 —
    // 벡터 대체 그림(프레임마다 그라디언트)이 한순간 비치지 않게. 준비되면 REV 가 올라 스냅샷도 새로 찍힌다
    const P = p && typeof p === 'object' ? LAST.get(p) : null;
    // 새 직업 원화를 끝내 못 받았으면(state < 0: 파일 없음·실패) 옛 직업 그림을 계속 쓰지 않고 벡터로 (새 직업 옷차림이 맞게 보이도록)
    if (E.state < 0 || !P || P.E === E || P.E.cid !== E.cid || P.E.state !== 1 || P.gen !== P.E.gen) return null;
    touchUse(P.E, now);
    return P;
  }
  if (I.vk && !I.V) {
    I.V = E.vars.get(I.vk) || makeVariant(E, I.vk); E.vars.set(I.vk, I.V);
    for (const L of E.levels) if (L.name !== 'ui') maskImg(E, L);   // 형제 미리 받기는 마스크 없이 받으므로 장비 색이 있으면 여기서 요청
  }
  I.key = E.key + (I.vk ? '#' + I.vk : '');
  if (p && typeof p === 'object') LAST.set(p, I);
  return I;
}
// ───────────────────────── NPC 퍼펫 ─────────────────────────
// NPC(p.npc)는 매니페스트의 'npc' 묶음(assets/puppets/npc/<npcId>/)에 원화가 있으면 채색 퍼펫, 없으면 벡터(기존 그대로).
// NPC id: p.npcId → look.npcId → look 객체가 data/npcs.js NPCS·data/town.js TOWN_NPCS 의 어느 항목 것인지(마을 hub.js·
// 스테이지 world.js 는 NPCS[id].look / TOWN_NPCS[id].look 객체를 그대로 넘긴다). 다른 NPC(결투 상대 등)는 null → 벡터.
export const NPC_CID = 'npc';
const NPCK = new WeakMap();
/** 이 엔티티/look 이 어느 NPC 인가 (없으면 null) */
export function npcIdOf(p, look) {
  if (p?.npcId) return p.npcId;
  if (!look) return null;
  if (look.npcId) return look.npcId;
  let id = NPCK.get(look);
  if (id === undefined) {
    id = null;
    for (const T of [NPCS, TOWN_NPCS]) for (const k in T) if (T[k]?.look === look) id = k;
    NPCK.set(look, id);
  }
  return id;
}
const INST_NPC = new WeakMap();
function npcPuppet(p, look) {
  let I = INST_NPC.get(look);
  if (I === undefined) {
    const id = npcIdOf(p, look);
    const E = id && PUPPETS[NPC_CID]?.[id] ? entry(NPC_CID, id) : NONE;
    I = E === NONE ? null : { E, look, vk: '', V: null, key: E.key, lv: null, npc: id, gen: E.gen };
    INST_NPC.set(look, I);
  }
  if (!I) return null;
  if (I.gen !== I.E.gen) { I.gen = I.E.gen; I.lv = null; }
  touchUse(I.E, performance.now());
  if (!ready(I.E)) return null;
  return I;
}
/** 이 NPC 에 채색 퍼펫 에셋이 있는가 (로드 여부와 무관) */
export function hasNpcPuppet(npcId) { return !!PUPPETS[NPC_CID]?.[npcId]; }

/** 플레이어블 캐릭터 id 인가 (그리기 배율 적용 대상 판별) */
export function isPlayable(id) { return !!(id && CHARACTERS[id]); }
export function charDef(id) { return id ? CHARACTERS[id] || null : null; }
/** 이 캐릭터/직업에 퍼펫 에셋이 있는가 (로드 여부와 무관) */
export function hasPuppet(charId, classId) { return !!PUPPETS[charId]?.[artClass(charId, classId) ?? classId]; }

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
  let dk = E.dark, host = E;
  if (I.V) { const v = variantLevel(E, I.V, LV); if (v) { img = v; dk = I.V.dark; host = I.V; } }
  // 보통·높음 화질: 윤곽선 + 무대 빛 역광을 구워 넣은 캔버스 (G.rim = hero.js 가 무대 테마에서 고른 역광색). 저품질은 예전 그대로
  if (G.rim && !G.lowq && typeof document !== 'undefined') {
    const lit = host.lit || (host.lit = {});
    let lt = lit[LV.name];
    if (!lt || lt.k !== G.rim || lt.src !== img) {
      if (lt) { recycle(lt.cv); recycle(lt.dark); }
      lt = lit[LV.name] = { k: G.rim, src: img, cv: bakeLit(E, LV, img, G.rim), dark: null };
    }
    IMG = lt.cv;
    DARK = lt.dark || (lt.dark = bakeDark(lt.cv));
    return true;
  }
  IMG = img;
  DARK = dk[LV.name] || (typeof document !== 'undefined' ? (dk[LV.name] = bakeDark(img)) : img);
  return true;
}
// ── 읽기 좋게: 가는 어두운 윤곽선 + 부드러운 역광 (레벨 캔버스에 한 번 구움 — 프레임마다 필터·그라디언트 없음) ──
// 윤곽선: 부위 알파의 안쪽 가장자리 1 아틀라스 px(≈ 화면 1px — pickLevel 이 장치 px 에 맞는 레벨을 고른다)를 어둡게.
// 역광: 빛이 오는 쪽(원화 공간 뒤-위, LDIR)을 향한 가장자리 두 겹(1.3·2.8 px, 옅게)을 무대 빛 색으로. 부위가 뼈와 함께 돌면 역광도 함께 돈다.
// 부위를 자른 자리(관절: 허벅지-정강이 무릎, 몸통 허리 등)는 다른 부위에 덮이므로 그 둘레의 윤곽·역광은 지운다 (ATT) — 이음매에 선이 생기지 않게.
const OUT_COL = '#0b0612', OUT_A = 0.7, LDIR = [-0.6, -0.8];
const ATT = {
  torso: [['pivot', 0.5], ['end', 0.32]], thigh: [['pivot', 0.5], ['end', 0.44]], shin: [['pivot', 0.5], ['end', 0.42]],
  uarm: [['pivot', 0.46], ['end', 0.46]], farm: [['pivot', 0.5], ['end', 0.46]], hand: [['pivot', 0.5]], grip: [['end', 0.5]], open: [['pivot', 0.5]],
  foot: [['pivot', 0.46]], head: [['pivot', 0.34]], skirt: [['pivot', 0.4]], skirtFar: [['pivot', 0.4]], pony: [['pivot', 0.45]],
};
function eraseJoints(c, E, L) {
  c.save();
  c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
  for (const name in ATT) {
    const pt = E.parts[name], rc = L.rects[name];
    if (!pt || !rc || !(pt.w > 0)) continue;
    const kx = rc[2] / pt.w, ky = rc[3] / pt.h;
    c.save(); c.beginPath(); c.rect(rc[0], rc[1], rc[2], rc[3]); c.clip();   // 원 하나가 아틀라스의 이웃 부위를 지우지 않게
    for (const [k, f] of ATT[name]) {
      const q = pt[k];
      if (!q) continue;
      const x = rc[0] + (q[0] - pt.x0) * kx, y = rc[1] + (q[1] - pt.y0) * ky, rad = f * Math.min(pt.w, pt.h) * kx;
      for (const [m, a] of [[1, 0.35], [0.8, 0.5], [0.58, 1]]) { c.globalAlpha = a; c.beginPath(); c.arc(x, y, rad * m, 0, TAU); c.fill(); }
    }
    c.restore();
  }
  c.restore();
}
function bakeLit(E, L, src, rim) {
  const W = src.naturalWidth || src.width, Hh = src.naturalHeight || src.height;
  const o = Math.max(1, Math.round(L.scale / 0.2));          // 윤곽 두께 (아틀라스 px). ui 레벨(0.36)은 2
  const out = spareCanvas(W, Hh), g = out.getContext('2d');
  const ring = spareCanvas(W, Hh), r = ring.getContext('2d');
  const tmp = spareCanvas(W, Hh), t = tmp.getContext('2d');
  // 깎은 모양(네 방향으로 o 만큼 비킨 것과의 교집합) → 원래 − 깎은 = 안쪽 가장자리 띠
  t.drawImage(src, 0, 0);
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(src, o, 0); t.drawImage(src, -o, 0); t.drawImage(src, 0, o); t.drawImage(src, 0, -o);
  r.drawImage(src, 0, 0);
  r.globalCompositeOperation = 'destination-out'; r.drawImage(tmp, 0, 0);
  r.globalCompositeOperation = 'source-in'; r.fillStyle = OUT_COL; r.fillRect(0, 0, W, Hh);
  r.globalCompositeOperation = 'source-over';
  eraseJoints(r, E, L);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop'; g.globalAlpha = OUT_A; g.drawImage(ring, 0, 0);
  // 역광: 빛 쪽 이웃이 비어 있는 가장자리 (두 겹: 가까운 진한 띠 + 넓고 옅은 띠)
  for (const [d, a] of [[1.3 * o, 0.5], [2.8 * o, 0.2]]) {
    t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; t.clearRect(0, 0, W, Hh); t.drawImage(src, 0, 0);
    t.globalCompositeOperation = 'destination-out'; t.drawImage(src, -LDIR[0] * d, -LDIR[1] * d);
    t.globalCompositeOperation = 'source-in'; t.fillStyle = rim; t.fillRect(0, 0, W, Hh);
    t.globalCompositeOperation = 'source-over';
    eraseJoints(t, E, L);
    g.globalAlpha = a; g.drawImage(tmp, 0, 0);
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  recycle(ring); recycle(tmp);
  return out;
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

// ── 메시 관절 (puppet_mesh.js) — MESH 는 drawLayers 가 이번 그리기마다 정한다 (보통·높음 화질 + 조종 중인 영웅 G.main) ──
let MESH = false;
const BA = [null, null, 0, 0, 0, 0], BB = [null, null, 0, 0, 0, 0];
function bone(o, a, b, AX, AY, BX, BY) { o[0] = a; o[1] = b; o[2] = AX; o[3] = AY; o[4] = BX; o[5] = BY; return o; }
// 먼 팔·다리(dark)는 어둡게 몸 뒤에 있어 휘어짐이 거의 안 보인다 → 예전 판 그대로 (메시 비용 절반)
const meshOK = (p1, p2, dark = false) => MESH && !dark && R.mo && R.mo[p1] && R.mo[p2] && LV.rects[p1] && LV.rects[p2];
/** 위 부위(p1)·아래 부위(p2)를 메시로 (관절이 거의 곧으면 false → 호출측이 판으로) */
function limbMesh(c, img, p1, p2) {
  if (!drawSkinned(c, img, LV.rects[p1], R.parts[p1], R.mo[p1], BA, BB, R.PS)) return false;
  if (!drawSkinned(c, img, LV.rects[p2], R.parts[p2], R.mo[p2], BB, BA, R.PS)) { c.save(); boneXf(c, BB[0], BB[1], BB[2], BB[3], BB[4], BB[5]); blit(c, p2); c.restore(); }
  return true;
}
function legPup(c, K, hx, hy, kx, ky, ax, ay, t, dark) {
  const J = R.J;
  let done = false;
  if (meshOK('thigh', 'shin', dark)) { bone(BA, J.hip, J.knee, hx, hy, kx, ky); bone(BB, J.knee, J.ankle, kx, ky, ax, ay); done = limbMesh(c, IMG, 'thigh', 'shin'); }
  if (!done) {
    c.save(); boneXf(c, J.hip, J.knee, hx, hy, kx, ky); blit(c, 'thigh', dark); c.restore();
    c.save(); boneXf(c, J.knee, J.ankle, kx, ky, ax, ay); blit(c, 'shin', dark); c.restore();
  }
  c.save(); c.translate(ax, ay); c.rotate(t); c.scale(R.PS, R.PS); c.translate(-J.ankle[0], -K.footPivY); blit(c, 'foot', dark); c.restore();
}
function armPup(c, sx, sy, ex, ey, hx, hy, dark, hand) {
  const J = R.J;
  if (meshOK('uarm', 'farm', dark)) {
    bone(BA, J.shoulder, J.elbow, sx, sy, ex, ey); bone(BB, J.elbow, J.hand, ex, ey, hx, hy);
    if (limbMesh(c, IMG, 'uarm', 'farm')) {
      if (hand) { c.save(); boneXf(c, J.elbow, J.hand, ex, ey, hx, hy); blit(c, 'hand', dark); c.restore(); }
      return;
    }
  }
  c.save(); boneXf(c, J.shoulder, J.elbow, sx, sy, ex, ey); blit(c, 'uarm', dark); c.restore();
  c.save(); boneXf(c, J.elbow, J.hand, ex, ey, hx, hy); blit(c, 'farm', dark); if (hand) blit(c, 'hand', dark); c.restore();
}

// ── 손: 무기별 쥔 주먹(grip) · 편 손(open) ──
// 주먹 중심을 무기 좌표계에서 얼마나 옮길지 (x=무기 방향, y=무기 법선, 논리 px)
// spear (hero7 이졸데): paintSpear 원점 = 손잡이 감개(가까운 손), 자루 뒤끝 x≈−34 · 창끝 x≈+62. 먼 손은 hero.js 가 h1 − SPEAR_GAP 에 IK (같은 축)
const GRIP_OFF = { sword: [-2.4, 0], greatsword: [-3.2, 0], dagger: [-1.4, 0], gun: [-2.0, 3.2], staff: [0, 0], whip: [-2.2, 0], spear: [0, 0], none: [0, 0] };
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
const SKIRT_K = [150, 10];
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
  // 2차 움직임: 코트 자락이 몸을 늦게 따라오고 넘쳐 흔들림 (리그 runtime.skirtSpring = [강성, 감쇠] 로 조절). 범위를 묶어 순간이동·공중제비에도 터지지 않게
  const ks = R.opts.skirtSpring || SKIRT_K;
  if (MOT) SKS.rot = spring(AE.p, 'skirtRot', SKS.rot, AE.dt, ks[0], ks[1], -0.7, 1.5);
  // 전단: 아래로 갈수록 뒤로 굽음(+펄럭임). 띠 좌표 = 스트립 v (피벗 기준, 축 방향)
  const v0 = st.oy, v1 = st.oy + pt.h, top = Math.max(0, v0);
  let bend = -(0.04 + run * 0.22 + lift * 0.28 + SW.fl * 0.04) + kneeFwd * 0.08;
  if (MOT) bend = spring(AE.p, 'skirtBend', bend, AE.dt, ks[0] * 0.6, ks[1] * 0.7, -0.9, 0.5);
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
    fillGrad(pts[0], pts[1] - 2, pts[0], pts[1] + 2, bc, 0.8);   // 띠 끝은 매 프레임 움직인다 → 단위 그라디언트 (G.tint 면 단색)
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
    cv = spareCanvas(tex.naturalWidth || tex.width, tex.naturalHeight || tex.height);   // 예비 캔버스 (싸움 도중 새 망토 색이어도 캔버스를 만들지 않음)
    const g = cv.getContext('2d');
    g.fillStyle = col; g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'overlay'; g.drawImage(tex, 0, 0);
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = col; g.fillRect(0, 0, cv.width, cv.height);
    CAPE_PAT.set(col, cv);
  }
  return cv;
}
// 패턴 객체도 결 캔버스별로 한 번만 만든다 (프레임마다 createPattern·DOMMatrix 할당 없음). 변환은 쓰기 직전에 매번 덮어쓴다
const CAPE_PATO = new WeakMap(), PXF = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function capePattern(c, cv) {
  let pat = CAPE_PATO.get(cv);
  if (pat === undefined) { pat = c.createPattern(cv, 'repeat'); if (pat && typeof pat.setTransform !== 'function') pat = null; CAPE_PATO.set(cv, pat); }
  return pat;
}
/** 패턴 변환 = translate(x, y) · rotate(r) · scale(k) */
function patXf(pat, x, y, r, k) {
  const cs = Math.cos(r) * k, sn = Math.sin(r) * k;
  PXF.a = cs; PXF.b = sn; PXF.c = -sn; PXF.d = cs; PXF.e = x; PXF.f = y;
  pat.setTransform(PXF);
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
    const pat = capePattern(c, cv);
    const e = (n - 1) * 2, ang = Math.atan2(off[e + 1] - off[1], off[e] - off[0]);
    if (pat) {
      patXf(pat, off[0], off[1], ang + 0.95, 0.16);
      c.fillStyle = pat; c.fill();
    } else { c.fillStyle = cp.c; c.fill(); }
    // 부피감: 뒤쪽 가장자리 어둡게 + 윤곽
    // (fillGrad: 망토 끝·어깨가 매 프레임 움직여도 새 그라디언트를 만들지 않는다 — 달릴 때 프레임마다 1개였다, #341)
    c.save(); c.globalAlpha = 0.35; fillGrad(off[0] - 8, off[1], off[e] + 8, off[e + 1], sh(cp.c, -0.2), 1); c.restore();
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

// ───────────────────────── 동작 연출 (그림만 — 판정·타이밍은 그대로) ─────────────────────────
// 보통·높음 화질의 살아 있는 퍼펫(MOT): 착지 찌그러짐(발 기준, 떨어진 속도만큼 눌렸다 살짝 늘어남) · 기본 공격 앤티시페이션(휘두르기 전
// 반대로 젖힘)·팔로스루(지나쳐 돌아옴) · 주 휘두르기의 옅은 잔상(조종 중인 영웅만) · 채찍 똬리 끈·리그 장식끈(스프링 체인).
// 공격 방향은 활성 구간에서 손이 어깨를 도는 방향을 재서 기술(move 정의)별로 기억 → 다음 같은 기술의 준비 동작에 쓴다.
// 상태는 엔티티별(stateOf)이고 '이번 프레임'(tt)이 바뀔 때만 진행 — 같은 프레임 두 번 그리기·멈춤·히트스톱(시간 정지)에서 두 번 진행하지 않는다.
let MOT = false;
let AE = null;                       // 이번 drawLayers 의 그리기 문맥 (스프링 상태 키 = AE.p)
const SWSIGN = new WeakMap();        // 기술 정의 → 휘두르는 회전 방향 (+1 / −1)
const ABK = { on: false, e1x: 0, e1y: 0, h1x: 0, h1y: 0, e2x: 0, e2y: 0, h2x: 0, h2y: 0, w1: 0, sq: 0 };
const rotAbout = (x, y, cx, cy, a, o, i) => { const cs = Math.cos(a), sn = Math.sin(a), dx = x - cx, dy = y - cy; o[i] = cx + dx * cs - dy * sn; o[i + 1] = cy + dx * sn + dy * cs; };
const RA = [0, 0];
function motionBegin(c, E, P, s, ST, tt) {
  AE = E;
  const p = E.p, st = stateOf(p);
  // 착지: 공중 → 땅으로 바뀐 프레임의 낙하 속도로 세기를 정하고 0.22초 동안 눌렸다 늘어났다 가라앉음
  if (st && st.t !== tt) {
    const air = p?.onGround === false;
    if (st.air && !air && (st.vy ?? 0) > 260) { st.landAt = tt; st.landK = clamp((st.vy - 200) / 1600, 0.025, 0.07); }
    st.air = air; st.vy = p?.vy || 0;
    if (st.landAt !== undefined && (tt < st.landAt || tt - st.landAt > 0.3)) st.landAt = undefined;
  }
  let k = 0;
  if (st?.landAt !== undefined) { const u = (tt - st.landAt) / 0.22; if (u >= 0 && u < 1) k = st.landK * (1 - u) * (1 - u) * Math.cos(u * PI * 1.6); }
  ABK.sq = k;
  if (Math.abs(k) > 0.002) { c.save(); c.scale(1 + k * 0.6, 1 - k); }
  // 앤티시페이션 / 팔로스루
  ABK.on = false;
  const def = ST.atk;
  if (st && def && typeof def === 'object' && ST.mv) {
    const ang = Math.atan2(s.h1y - s.s1y, s.h1x - s.s1x);
    if (ST.ph === 1) {
      if (st.t !== tt && st.pa !== undefined) { const d = wrapPI(ang - st.pa); if (Math.abs(d) > 0.02) SWSIGN.set(def, d > 0 ? 1 : -1); }
    }
    const sg = SWSIGN.get(def) || 0;
    let da = 0;
    if (sg && ST.ph === 0) { const u = clamp(ST.u, 0, 1); da = -sg * 0.3 * Math.sin(PI * Math.pow(u, 0.7)); }        // 반대로 젖힘 (빨리 젖혔다 놓음)
    else if (sg && ST.ph === 2) { const u = clamp(ST.u, 0, 1); da = sg * 0.26 * Math.sin(PI * u) * (1 - u * 0.5); }   // 지나쳐 돌아옴
    if (Math.abs(da) > 0.003) {
      ABK.on = true;
      ABK.e1x = s.e1x; ABK.e1y = s.e1y; ABK.h1x = s.h1x; ABK.h1y = s.h1y; ABK.e2x = s.e2x; ABK.e2y = s.e2y; ABK.h2x = s.h2x; ABK.h2y = s.h2y; ABK.w1 = P.w1;
      rotAbout(s.e1x, s.e1y, s.s1x, s.s1y, da, RA, 0); s.e1x = RA[0]; s.e1y = RA[1];
      rotAbout(s.h1x, s.h1y, s.s1x, s.s1y, da, RA, 0); s.h1x = RA[0]; s.h1y = RA[1];
      if (P.two) { rotAbout(s.e2x, s.e2y, s.s1x, s.s1y, da * 0.8, RA, 0); s.e2x = RA[0]; s.e2y = RA[1]; rotAbout(s.h2x, s.h2y, s.s1x, s.s1y, da, RA, 0); s.h2x = RA[0]; s.h2y = RA[1]; }
      P.w1 += da;
    }
    if (st.t !== tt) { st.pa = ang; }
  } else if (st && st.t !== tt) st.pa = undefined;
}
function motionEnd(c, E, P, s, tt) {
  if (ABK.on) {
    s.e1x = ABK.e1x; s.e1y = ABK.e1y; s.h1x = ABK.h1x; s.h1y = ABK.h1y; s.e2x = ABK.e2x; s.e2y = ABK.e2y; s.h2x = ABK.h2x; s.h2y = ABK.h2y; P.w1 = ABK.w1;
    ABK.on = false;
  }
  if (Math.abs(ABK.sq) > 0.002) c.restore();
  // 다음 프레임 잔상용: 이번 프레임의 가까운 팔 (같은 프레임에 두 번 그려도 한 번만 넘긴다)
  const st = stateOf(E.p);
  if (st && st.t !== tt) {
    st.t = tt;
    st.e1x = s.e1x; st.e1y = s.e1y; st.h1x = s.h1x; st.h1y = s.h1y; st.w1 = P.w1; st.ok = true; st.mv = AE_MV;
  }
  AE = null;
}
let AE_MV = null;
/** 잔상: 활성 구간에 가까운 아래팔·주먹(+무기)을 지난 프레임 → 이번 프레임 사이에 옅게 (높음 2장, 보통 1장). 지난 프레임이 같은 기술일 때만 */
function swingSmear(c, E, K, P, W, s, ST, hasMain, tt) {
  if (!G.fx || G.tint || !G.main || ST.ph !== 1 || !ST.mv) return;
  const st = stateOf(E.p);
  if (!st?.ok || st.mv !== ST.mv || !(tt - st.t < 0.1)) return;
  const dx = s.h1x - st.h1x, dy = s.h1y - st.h1y;
  if (dx * dx + dy * dy < 6) return;
  const J = R.J, a0 = c.globalAlpha;
  for (const k of G.qual === 'high' ? SMEAR2 : SMEAR1) {
    const ex = lerp(st.e1x, s.e1x, k), ey = lerp(st.e1y, s.e1y, k), hx = lerp(st.h1x, s.h1x, k), hy = lerp(st.h1y, s.h1y, k);
    const w = st.w1 + wrapPI(P.w1 - st.w1) * k;
    c.globalAlpha = a0 * (0.14 + 0.18 * k);
    c.save(); boneXf(c, J.elbow, J.hand, ex, ey, hx, hy); blit(c, 'farm'); c.restore();
    if (hasMain) { drawWeapon(W, hx, hy, w, {}); gripPup(c, K, ex, ey, hx, hy, w, W.type, false); }
    else { c.save(); boneXf(c, J.elbow, J.hand, ex, ey, hx, hy); blit(c, 'hand'); c.restore(); }
  }
  c.globalAlpha = a0;
}
const SMEAR2 = [0.3, 0.65], SMEAR1 = [0.5];
/** 채찍 똬리에서 늘어진 끈 끝 (스프링 체인) — T0 좌표에서 그린다 */
const STRAP_CFG = { g: 900, d: 0.86, push: 200, rest: 0.9, curl: 0.04, flut: 18 };
function coilStrap(c, E, K, s, T0M) {
  const pt = R.parts.coil;
  if (!pt || !T0M || G.tint) return;
  torsoPt(s, K, [pt.x0 + pt.w * 0.42, pt.y0 + pt.h * 0.86]);
  const T = toT0(E.P, Q[0], Q[1]);
  const n = 5, pts = H.chain('strap', E, T[0], T[1], n, 2.6, STRAP_CFG, T[0] + 1);
  for (let i = 0; i < n; i++) WS[i] = lerp(0.62, 0.32, i / (n - 1));
  c.save(); c.setTransform(T0M);
  ribbonPath(c, pts, n, WS, false);
  c.fillStyle = '#3a1f12'; c.fill();
  c.strokeStyle = ra('#120604', 0.7); c.lineWidth = 0.3; c.stroke();
  c.restore();
}
/**
 * 리그 장식끈 (rig.json runtime.chains — 망토 사슬과 같은 베를레 체인을 리그 데이터로 늘린다):
 *   [{ at: 관절 이름 | [x, y] (원화 좌표), frame: 'head' | 'torso', n: 5, seg: 3 (논리 px), w: [시작 폭, 끝 폭], col: '#hex', cfg: {g, d, push, rest, curl, flut} }]
 * 몸 뒤에 그린다 (망토 다음). 저품질·실루엣 패스에서는 그리지 않는다
 */
const CHAIN_CFG = { g: 1000, d: 0.88, push: 220, rest: 0.5, curl: 0.05, flut: 30, up: 6 };
function rigChains(c, E, K, s, T0M) {
  const L = R.opts.chains;
  if (!Array.isArray(L) || !L.length || !T0M || G.tint) return;
  c.save(); c.setTransform(T0M);
  for (let j = 0; j < L.length; j++) {
    const ch = L[j], q = Array.isArray(ch.at) ? ch.at : R.J[ch.at];
    if (!q) continue;
    if (ch.frame === 'head') headPt(s, K, q[0], q[1]); else torsoPt(s, K, q);
    const T = toT0(E.P, Q[0], Q[1]), ax = T[0], ay = T[1];
    const n = clamp(ch.n | 0 || 5, 3, 8);
    const cfg = ch.cfgFull || (ch.cfgFull = { ...CHAIN_CFG, ...(ch.cfg || {}) });
    const pts = H.chain('rc' + j, E, ax, ay, n, ch.seg || 3, cfg, ax + 1);
    const w0 = ch.w?.[0] ?? 0.9, w1 = ch.w?.[1] ?? 0.4;
    for (let i = 0; i < n; i++) WS[i] = lerp(w0, w1, i / (n - 1));
    ribbonPath(c, pts, n, WS, false);
    c.fillStyle = ch.col || '#3a1f12'; c.fill();
    c.strokeStyle = ra('#0a0306', 0.6); c.lineWidth = 0.3; c.stroke();
  }
  c.restore();
}

// ───────────────────────── 레이어 ─────────────────────────
/**
 * 퍼펫 본체 레이어 (hero.js drawLayers 대신). E = hero.js 의 그리기 문맥 {p, rig, hs, fac, dt, P, K, skipFarLeg}
 * 순서: 망토 → 리그 장식끈 → 머리띠 꼬리·포니테일 → [T1] 날개 → 먼 무기·먼 팔 → 머리 → 안쪽 자락 → 먼 다리 → 가까운 다리 → 바깥 자락
 *       → 몸통(+채찍 똬리·끈) → 휘두르기 잔상 → 가까운 위팔 → 어깨 덮개 → 가까운 아래팔 → 주무기 → 주먹 → (양손 무기) 먼 주먹
 */
export function drawLayers(c, E, K, P, W, tt) {
  const I = K.pup;
  if (!useLevel(I, c)) return false;
  const s = H.SK, ST = H.ST, J = R.J;
  MOT = !!E.rig && G.fx && !G.tint && !G.lowq;   // 살아 있는 퍼펫(잔상·스냅샷 아님) + 보통·높음 화질
  MESH = !!E.rig && !G.tint && !G.lowq && G.main && !!R.mo;   // 메시 관절: 조종 중인 영웅만 (파티·NPC·메뉴·잔상은 판)
  let T0M = null;
  if (MOT) { motionBegin(c, E, P, s, ST, tt); if (ST.coil || R.opts.chains) T0M = c.getTransform(); AE_MV = ST.mv || null; }
  if (R.opts.cape !== false) drawCapePup(c, E, K, s);   // NPC 원화에 이미 자락·숄이 그려진 경우 runtime.cape=false (카밀라: look.cape 데이터와 겹침)
  if (MOT) rigChains(c, E, K, s, T0M);
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
  // NPC 리그(runtime.farArm=false): 3/4 원화의 먼 팔(망치 든 손 등)을 몸통 부품에 그대로 두므로 절차적 먼 팔을 그리지 않는다
  if (R.opts.farArm !== false) {
    if (offW) drawWeapon(W, s.h2x, s.h2y, P.w2, { fire: ST.fire2 });
    const farMode = offW ? 'grip' : two ? 'none' : casting ? 'open' : 'hand';
    armPup(c, s.s2x, s.s2y, s.e2x, s.e2y, s.h2x, s.h2y, true, farMode === 'hand');
    if (farMode === 'grip') gripPup(c, K, s.e2x, s.e2y, s.h2x, s.h2y, P.w2, W.type, true);
    else if (farMode === 'open' && !openPup(c, K, s.e2x, s.e2y, s.h2x, s.h2y, true)) { c.save(); boneXf(c, J.elbow, J.hand, s.e2x, s.e2y, s.h2x, s.h2y); blit(c, 'hand', true); c.restore(); }
  }
  // ── 머리 (몸통 옷깃 뒤) + 후광 ──
  // artTop: bodyTop 리그(배율 기준이 머리 장식 아래)일 때 원화의 실제 맨 위 — 후광은 관·모자 위에
  if (K.halo && G.fx) { headPt(s, K, J.headPivot[0], (R.rig.artTop ?? R.rig.figTop) + 10); drawHalo(Q[0] - 0.5, Q[1] - 3 + Math.sin(G.t * 2) * 0.6, 6.8, K.aura?.color || '#ffe9a0'); }
  c.save(); headXf(c, s, K); blit(c, 'head'); c.restore();
  // ── 자락 · 다리 ──
  skirtSetup(K, s, P);
  drawSkirtFar(c, s, K, false);
  if (!E.skipFarLeg) legPup(c, K, s.hp2x, s.hp2y, s.k2x, s.k2y, s.a2x, s.a2y, P.t2, true);
  legPup(c, K, s.hp1x, s.hp1y, s.k1x, s.k1y, s.a1x, s.a1y, P.t1, false);
  drawSkirtPup(c, false);
  // ── 몸통 (+ 허리의 채찍 똬리) ──
  c.save(); boneXf(c, J.pelvis, J.neck, s.px, s.py, s.nx, s.ny); blit(c, 'torso'); if (ST.coil) blit(c, 'coil'); c.restore();
  if (MOT && ST.coil) coilStrap(c, E, K, s, T0M);
  // ── 가까운 팔: 위팔 → 어깨 덮개 → 아래팔 → 주무기 → 주먹 ──
  const hasMain = (W.type !== 'none' && W.type !== 'whip') || (W.type === 'whip' && !ST.coil);
  if (MOT) swingSmear(c, E, K, P, W, s, ST, hasMain, tt);
  let meshed = false;
  if (meshOK('uarm', 'farm')) {
    bone(BA, J.shoulder, J.elbow, s.s1x, s.s1y, s.e1x, s.e1y); bone(BB, J.elbow, J.hand, s.e1x, s.e1y, s.h1x, s.h1y);
    // 어깨 덮개가 위팔과 아래팔 사이에 오도록 두 부위를 따로 그린다 (관절이 곧으면 판)
    if (drawSkinned(c, IMG, LV.rects.uarm, R.parts.uarm, R.mo.uarm, BA, BB, R.PS)) {
      meshed = true;
      c.save(); boneXf(c, J.pelvis, J.neck, s.px, s.py, s.nx, s.ny); blit(c, 'pad'); c.restore();
      if (!drawSkinned(c, IMG, LV.rects.farm, R.parts.farm, R.mo.farm, BB, BA, R.PS)) { c.save(); boneXf(c, J.elbow, J.hand, s.e1x, s.e1y, s.h1x, s.h1y); blit(c, 'farm'); c.restore(); }
      if (!hasMain && !throwing) { c.save(); boneXf(c, J.elbow, J.hand, s.e1x, s.e1y, s.h1x, s.h1y); blit(c, 'hand'); c.restore(); }
    }
  }
  if (!meshed) {
    c.save(); boneXf(c, J.shoulder, J.elbow, s.s1x, s.s1y, s.e1x, s.e1y); blit(c, 'uarm'); c.restore();
    c.save(); boneXf(c, J.pelvis, J.neck, s.px, s.py, s.nx, s.ny); blit(c, 'pad'); c.restore();
    c.save(); boneXf(c, J.elbow, J.hand, s.e1x, s.e1y, s.h1x, s.h1y); blit(c, 'farm'); if (!hasMain && !throwing) blit(c, 'hand'); c.restore();
  }
  if (hasMain) {
    weaponPup(c, W, s.h1x, s.h1y, P.w1, ST.fire1);
    gripPup(c, K, s.e1x, s.e1y, s.h1x, s.h1y, P.w1, W.type, false);
    if (two) gripPup(c, K, s.e2x, s.e2y, s.h2x, s.h2y, P.w1, W.type, false, 0.96);
  } else if (throwing) {
    if (!openPup(c, K, s.e1x, s.e1y, s.h1x, s.h1y, false)) { c.save(); boneXf(c, J.elbow, J.hand, s.e1x, s.e1y, s.h1x, s.h1y); blit(c, 'hand'); c.restore(); }
  }
  c.restore();
  if (MOT) motionEnd(c, E, P, s, tt);
  MESH = false; MOT = false;
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
  touchUse(E, performance.now());
  if (!E.turnImg) E.turnImg = assets.get(`${E.root}/${E.key}/turn`, E.man.h);
  if (E.rig.turn.mask && !E.turnMask) E.turnMask = assets.get(`${E.root}/${E.key}/turn_mask`, E.man.h);
  return !!E.turnImg;
}
/** 턴테이블 시트: 장비 갑옷 색이 원화와 다르면 turn_mask 로 다시 칠한 캔버스(변형별 1회) */
function turnSrc(I) {
  const E = I.E, V = I.V;
  if (!V || typeof document === 'undefined') return E.turnImg;
  if (V.turn) return V.turn;
  const recol = !!(V.ac || V.tc) && !!E.rig.turn.mask;   // 갑옷색 재칠은 turn_mask 가 있을 때만, 초월 색조(V.tint)는 마스크 없이도
  if (recol && !E.turnMask) return E.turnImg;            // 마스크 받는 중
  if (!recol && !V.tint) return E.turnImg;
  return (V.turn = recolorCanvas(E.turnImg, recol ? E.turnMask : null, recol ? V : { ...V, ac: null, tc: null }));
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
  ctx.drawImage(turnSrc(I), v.x, v.y ?? 0, v.w, v.h, -v.axisX, -v.footY, v.w, v.h);   // v.y: 여러 줄 시트(turn16). 옛 시트는 한 줄 → 0
  ctx.restore();
  return { s, v, m: st.m };
}
// ── 16방향 턴테이블 (지금 유화풍 원화를 클링 360° 턴테이블 영상에서 뽑은 16칸, 22.5° 간격 — tools/puppet/turn16_build.py) ──
// 목록 assets/puppets/turn16.json looks["<cid>/<cls>"] (원화 직업 키 = entry 키, 초월은 artClass 로 2차 원화를 쓴다)
// 시트 assets/puppets/<cid>/<cls>/turn16_ui.webp (메뉴 해상도) · turn16_lo.webp (같은 배치를 lo.kx 배로 줄인 것, 낮은 화질 등급)
// 각도 규칙은 drawHeroYaw 와 같다: 0 = 오른쪽을 봄, π/2 = 앞모습, π = 왼쪽을 봄, −π/2 = 뒷모습. 실제로 돈 영상이라 좌우 반전 없음
// (영상이 한 바퀴를 다 못 돌아 빠진 각만 반대편 칸의 거울 m:1). 목록이 없거나 이 외형 항목이 없으면 hero_view 가 예전 8방향 경로를 쓴다.
let T16M = null, T16Q = false;
function t16Man() {
  if (T16M || T16Q || typeof window === 'undefined') return T16M;
  T16Q = true;
  Promise.resolve(assets.json('puppets/turn16')).then((j) => { T16M = (j && typeof j === 'object' && j.looks) || {}; REV++; }, () => { T16M = {}; });
  return T16M;
}
t16Man();
/** 16방향 목록을 받았는가 (받기 전에는 어느 경로도 확정하지 않는다) */
export function turn16Known() { return t16Man() !== null; }
/** 이 퍼펫 인스턴스의 16방향 항목 (없으면 null) */
export function turn16Entry(I) { const M = t16Man(); return (M && I?.E && Object.prototype.hasOwnProperty.call(M, I.E.key) && M[I.E.key]) || null; }
/** 16방향 시트 이미지: lo = 낮은 화질 등급(작은 시트). ui 가 이미 있으면 그것을, lo 를 받는 동안은 받아 둔 쪽을 쓴다 → {img, kx, ky} | null */
function t16Img(I, lo) {
  const T = turn16Entry(I); if (!T) return null;
  const E = I.E, ui = `${E.root}/${E.key}/turn16_ui`, lk = `${E.root}/${E.key}/turn16_lo`;
  touchUse(E, performance.now());
  let img = null, k = null;
  if (!lo || peek(ui)) { img = assets.get(ui, T.ui.v); k = 1; }
  if (!img) { const l = lo ? assets.get(lk, T.lo.v) : peek(lk); if (l) { img = l; k = T.lo; } }
  if (!img) return null;
  const kx = k === 1 ? 1 : k.kx, ky = k === 1 ? 1 : k.ky;
  return { img: t16Src(I, img, kx === 1 ? 'ui' : 'lo'), kx, ky };
}
/** 초월 색조(V.tint)는 마스크 없이 시트 전체에 (갑옷색 재칠은 16방향 마스크가 없어 원화 색 그대로) — 변형·시트별 1회 */
function t16Src(I, img, lv) {
  const V = I.V;
  if (!V || !V.tint || typeof document === 'undefined') return img;
  V.t16 = V.t16 || {};
  return V.t16[lv] || (V.t16[lv] = recolorCanvas(img, null, { ...V, ac: null, tc: null }));
}
/** 이 퍼펫이 16방향 뷰를 그릴 수 있는가 (시트 로드 전이면 요청하고 false) */
export function turn16Ready(I, lo = false) { return !!t16Img(I, lo); }
const T16 = { a: null, b: null, k: 0, f: 0 };
const pos360 = (d) => ((d % 360) + 360) % 360;
/** yaw(라디안)에서 이웃한 두 뷰와 섞는 비율 k (0 = a 만, 1 = b 만). 칸 가운데 70 % 에서 교차 — 멈춘 칸에서는 한 장 */
export function turn16Pick(I, yaw) {
  const T = turn16Entry(I), L = T?.views;
  if (!L?.length) return null;
  const n = L.length, step = 360 / n;
  const deg = pos360((yaw * 180) / PI);
  let i0 = 0, best = 1e9;
  for (let i = 0; i < n; i++) { const dd = pos360(deg - pos360(L[i].deg)); if (dd < best) { best = dd; i0 = i; } }
  const a = L[i0];
  let b = a, bd = 1e9;
  for (const e of L) { const dd = pos360(pos360(e.deg) - pos360(a.deg)); if (dd > 0.5 && dd < bd) { bd = dd; b = e; } }
  const f = clamp(best / Math.max(1, bd < 1e8 ? bd : step), 0, 1);
  const x = clamp((f - 0.15) / 0.7, 0, 1);
  T16.a = a; T16.b = b; T16.k = x * x * (3 - 2 * x); T16.f = f;
  return T16;
}
/** 16방향 앞모습의 그리기 키(논리 px, 발바닥 → 정수리)와 배율 — 망토·후광 배치용. 항목 없음 = null */
export function turn16Size(I) {
  const T = turn16Entry(I); if (!T) return null;
  const v = T.views.find((e) => e.deg === 90) || T.views[0];
  return { sc: T.sc, h: v.fy * T.sc };
}
/**
 * 16방향 몸 그리기. ctx 는 발 중앙 원점·논리 배율(hs) 적용 상태. 반환: {a, b, k} (그린 두 뷰와 교차 비율) | null (시트 없음)
 * 교차: 앞 뷰를 먼저(불투명도 min(1, 2(1−k))), 다음 뷰를 위에(min(1, 2k)) — 둘 다 반투명해지는 '유령' 구간이 없다.
 * 실루엣 폭 보간: 두 뷰의 어깨 띠 폭(bw)을 k 로 섞은 폭에 맞춰 각각 가로로 늘이고 줄인다 → 바뀌는 순간 몸 폭이 튀지 않는다.
 * 배율: 모든 칸에 같은 배율 sc (카메라가 고정된 영상) — 예전 8방향 앞모습과 같은 키. 땅선(fy)도 모든 칸이 같다.
 */
export function drawTurn16(ctx, I, yaw, t, alpha = 1, lo = false) {
  const S = t16Img(I, lo);
  if (!S) return null;
  const T = turn16Entry(I), P = turn16Pick(I, yaw);
  if (!P) return null;
  const va = P.a, vb = P.b, sc = T.sc;
  const breath = 1 + Math.sin(t * 2.2) * 0.006;
  const wT = lerp(va.bw, vb.bw, P.k);
  const one = (v, a) => {
    if (a <= 0.002) return;
    ctx.save();
    ctx.globalAlpha *= a * alpha;
    ctx.scale((v.m ? -1 : 1) * sc * (wT / (v.bw || wT)), sc * breath);
    ctx.drawImage(S.img, v.x * S.kx, v.y * S.ky, v.w * S.kx, v.h * S.ky, -v.ax, -v.fy, v.w, v.h);
    ctx.restore();
  };
  one(va, Math.min(1, 2 * (1 - P.k)));
  if (vb !== va && P.k > 0.002) one(vb, Math.min(1, 2 * P.k));
  return P;
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
    // 창(spear): 지팡이처럼 창끝을 위로 세워 든다 (자루 뒤끝 −34 → 물미가 발목 높이, 창끝은 머리 위로) — 보는 쪽으로 조금 기울임
    const upright = type === 'staff' || type === 'spear';
    const ang = upright ? -HP - (type === 'spear' ? 0.06 : 0.08) * cs : type === 'gun' ? HP - 0.45 * cs : HP - tilt;
    drawWeapon(W, h.x, h.y + (type === 'staff' ? -2 : type === 'spear' ? 4 : 0), ang, {});
  }
  G.olw = olw;
}
export function turnSteps() { return STEPS; }
/** 턴테이블 망토 명암 그라디언트 2개 (정규 좌표 — 한 번 만들어 모든 캔버스에서 다시 쓴다) */
let TCG = null;
function turnCapeGrads(c) {
  if (TCG) return TCG;
  const fold = c.createLinearGradient(-1, 0, 1, 0), F = 5;   // 가로 −1…1: 세로 주름 띠 + 가장자리 어둡게
  for (let i = 0; i <= F * 2; i++) {
    const u = i / (F * 2), edge = Math.abs(u - 0.5) * 2;
    fold.addColorStop(u, ra('#000000', Math.min(0.6, (i % 2 ? 0.02 : 0.2) + edge * edge * 0.4)));
  }
  const hi = c.createLinearGradient(0, 0, 0, 1);            // 세로 0(어깨)…1(밑단)
  hi.addColorStop(0, ra('#ffffff', 0.1)); hi.addColorStop(0.3, ra('#ffffff', 0)); hi.addColorStop(1, ra('#000000', 0.25));
  return (TCG = { fold, hi });
}
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
    const pat = capePattern(c, cv);
    if (pat) patXf(pat, dx - wBot, sy, 0, 0.2);
    c.fillStyle = pat || cape.c;
  } else c.fillStyle = cape.c;
  c.fill();
  // 주름: 세로 명암 띠 (어깨에서 모여 밑단으로 퍼짐) + 가장자리 어둡게. 두 그라디언트는 정규 좌표(가로 −1…1, 세로 0…1)로 한 번만
  // 만들고, 채울 때만 변환을 걸어 망토 폭·길이에 맞춘다 (경로는 만들 때의 변환으로 고정되므로 모양은 그대로) — 프레임마다 새 그라디언트 0
  const TG = turnCapeGrads(c);
  c.save(); c.translate(dx, 0); c.scale(Math.max(0.5, wBot), 1); c.fillStyle = TG.fold; c.fill(); c.restore();
  c.save(); c.translate(0, sy); c.scale(1, Math.max(1, hem - sy)); c.fillStyle = TG.hi; c.fill(); c.restore();
  c.strokeStyle = ra('#0a0306', 0.6); c.lineWidth = 0.6; c.stroke();
  if (!back) {                                          // 앞모습: 밑단 장식선 — 톱니 밑단을 그대로 따라간다 (곧은 선이 발밑 바닥선처럼 보이지 않게)
    c.strokeStyle = ra(cape.c2, 0.9); c.lineWidth = 1.1; c.beginPath();
    for (let i = 0; i <= 6; i++) { const u = i / 6, x = dx + wBot + sway - u * 2 * wBot; if (i) c.lineTo(x, hem + (i % 2 ? 1.6 : -0.4) - 0.9); else c.moveTo(x, hem - 0.9); }
    c.stroke();
  }
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
    G.wingCol = I.look?.wingCol ?? null;   // 초월 날개 색
    drawWing(type, spread, Math.sin(t * 2.2) * 0.06, side < 0 === back, false);
    ctx.restore();
  }
}
/** 후광 (턴테이블) */
export function drawTurnHalo(ctx, col, t, I) {
  const r = I?.E?.rig, top = r && r.artTop != null ? (PUP_H * (r.sole - r.artTop)) / (r.sole - r.figTop) : PUP_H;   // bodyTop 리그: 관·모자 위
  drawHalo(0, -top - 4 + Math.sin(t * 2) * 0.6, 7, col || '#ffe9a0');
}

/**
 * 화면 비율에 맞춘 영웅 그리기 배율 (HUD·카메라 쪽이 hero.setHeroDrawScale 등에 곱해 쓴다): 16:9 이상 넓은 화면 = 1.0,
 * 4:3 에 가까운(태블릿·접이식) 화면일수록 커져 1.25:1 이하에서 1.12. 세로 화면도 긴 변 / 짧은 변으로 본다. 잘못된 값이면 1
 */
export function heroScaleFor(viewW, viewH) {
  if (!(viewW > 0) || !(viewH > 0)) return 1;
  const ar = Math.max(viewW, viewH) / Math.min(viewW, viewH);
  const k = clamp((16 / 9 - ar) / (16 / 9 - 1.25), 0, 1);
  return 1 + 0.12 * k * k * (3 - 2 * k);
}
/** 디버그·갤러리: 로드 상태 */
export function puppetStatus() {
  const out = {};
  for (const [k, E] of REG) if (E !== NONE) out[k] = { state: E.state, levels: E.levels.map((L) => L.name + (levelPeek(E, L) ? '✓' : '…')), variants: [...E.vars.keys()] };
  return out;
}
void glow; void TAU;
