// 환경 키트 — 스테이지 컴파일러 (순수 JS). docs/v2/ENV_KIT.md §4
// 저작 형식 = 시범판 B 의 parts 그대로 + 꾸밈 정보:
//   · B 의 part(floor·block·wall·stairs·pillar·roof·blocker·prop·light)는 **충돌을 B 의 compileStage 가 그대로** 만든다 (놀이가 B 와 같다).
//     여기에 kit:{…}(벽·지붕·바닥·계단의 꾸밈)과 mesh:'이름'(그림판 대신 3D 소품)을 덧붙인다.
//   · 키트 전용 part: pave(올린 보도) · arch(아치 다리) · fence(울타리·난간) · deco(충돌 없는 3D 소품).
// 결과 = B 의 세계(W) + W.env { meshes:[{chunk,tex,data,count}], bounds, fx:{glows,pools,shadows}, decals, stats }.
import { compileStage, groundAt, validateStage } from '../b/world.js';
import { Geo, Frame } from './geo.js';
import { foldPlan } from './mats.js';
import * as K from './kit.js';
import { PROPS, WALLPROPS } from './props.js';
import { bakedDef, bakedProp } from './baked.js';
import { BAKED_EXTRA, BAKED_ARGS, cemgateBoxes } from './props2.js';
import './props4.js';                                     // WORLD-LOOK: what lies beyond an area's edge (apron, ridge, treeline, farhouse, farwall, gravefield) + wall dressing (boards, crack, ivy, drape)
import { GEN_ALIAS } from './props3.js';                  // WORLD-2: whip ring, road bell, bridges, crypt furniture stand-ins + names of generated second tries   // WORLD 구역의 소품을 PROPS 에 더한다 + 구운 소품에 덧붙이는 것

/** 구운 소품이 없을 때(묶음을 받기 전) 대신 세우는 손으로 짠 소품 */
const FALLBACK = { angel: 'statue', gargoyle: 'statue', deadtree: 'tree', tomb_a: 'tomb', tomb_b: 'tomb', tomb_c: 'tomb', tomb_d: 'tomb', goods: 'barrel', chapel: 'mausoleum' };
/** 이름이 묶음에 있으면 구운 소품(+ 덧붙임), 없으면 손으로 짠 소품. part 에 code:true 면 묶음에 있어도 손으로 짠 것을 쓴다 */
const propFn = (name0, code) => {
  const name = !code && GEN_ALIAS[name0] && bakedDef(GEN_ALIAS[name0]) ? GEN_ALIAS[name0] : name0;   // a generated second try (stall2, wreck2, skullwall) takes over when the pack has it
  const d = code ? null : bakedDef(name);
  if (!d) return PROPS[name] ?? PROPS[FALLBACK[name]];
  return (G, x, y, z, o) => { const oo = BAKED_ARGS[name] ? BAKED_ARGS[name](o, d) : o; bakedProp(G, name, x, y, z, oo); BAKED_EXTRA[name]?.(G, x, y, z, oo, (oo.h ?? d.h) / d.h); };
};

const KIT_ONLY = new Set(['pave', 'arch', 'fence', 'deco']);
const bPart = (P) => {
  if (P.t !== 'prop' || !P.mesh) return P;
  const d = P.code ? null : bakedDef(GEN_ALIAS[P.mesh] && bakedDef(GEN_ALIAS[P.mesh]) ? GEN_ALIAS[P.mesh] : P.mesh), o = { ...P, img: '__mesh' };
  if (d) {   // 구운 소품: 충돌 발자국과 빛을 묶음에서 채운다 (part 에 적은 값이 이긴다)
    const h = P.h ?? BAKED_ARGS[P.mesh]?.(P, d).h ?? d.h, s = h / d.h;
    if (o.h == null) o.h = h;
    if (o.solid == null && d.foot?.[0]) { o.solid = d.foot[0] * s; o.solidZ = d.foot[1] * s; o.solidH = (d.footH ?? d.h * 0.8) * s; }
    if (o.light == null && d.light) o.light = d.light;
  }
  return o;
};
/** B 의 형식으로 걸러 낸 스테이지 (충돌·검증용) */
export const toB = (S) => ({ ...S, parts: S.parts.filter((P) => !KIT_ONLY.has(P.t)).map(bPart) });
export const validateEnv = (S) => validateStage(toB(S));

const chunkOf = (S, P) => {
  if (P.chunk) return P.chunk;
  const z = P.z != null ? P.z + (P.d ?? 0) / 2 : ((P.z0 ?? 0) + (P.z1 ?? 0)) / 2;
  for (const c of S.chunks ?? [{ id: 'main', z1: Infinity }]) if (z < c.z1) return c.id;
  return 'main';
};
const wallHang = (P) => { const FS = { F: new Frame(P.x, P.z, 0, -1), L: new Frame(P.x, P.z + P.d, -1, 0), R: new Frame(P.x + P.w, P.z, 1, 0) }; return (P.kit?.hang ?? []).map((h) => [FS[h.side ?? 'F'], { ...h, y: (P.y ?? 0) + h.y }]); };

/**
 * fold: the plan of small materials drawn with a look-alike texture their chunk uses anyway (mats.js FOLDS; fewer draw calls). Default = S.folds
 * ({ chunk: { texture: material } }, written by tools/v2/world_folds.mjs into src/v2/world/folds.js) or nothing; 'auto' (or S.folds === 'auto') = plan it
 * here with a counting pass (as slow as a second compile: tools and checks only); false = never fold.
 */
export function compileEnv(S, { cull = true, fold, flames = false } = {}) {   // flames: 불길 잎을 굽는다 (입자 불이 없는 v2c 만 — props2.js flames)
  const W = compileStage(toB(S));
  W.mesh = {};                                                           // B 의 납작한 메시는 쓰지 않는다
  W.sprites = W.sprites.filter((s) => s.kind === 'prop' && s.img !== '__mesh');   // 그림판으로 남긴 소품만
  const G = new Geo(W, { cull }); G.fx = { glows: [], pools: [], shadows: [] }; G.flames = !!flames;
  const extra = [], propTris = {};
  // 1) 굽기 전에 빛을 모은다: 불 켜진 창 · 벽등
  for (const P of S.parts) {
    if (P.t === 'wall' && P.kit) { W.lights.push(...K.wallLights(P)); for (const [F, h] of wallHang(P)) if (h.type === 'sconce') { const p = F.pt(h.u, h.y - 4, 22); W.lights.push({ x: p[0], y: p[1], z: p[2], r: h.lr ?? 250, c: [1.0, 0.6, 0.28], i: h.li ?? 1.3 }); } }
    if (P.t === 'deco' && P.light) W.lights.push({ x: P.x, y: (P.y ?? 0) + (P.light.y ?? 100), z: P.z - 6, r: P.light.r ?? 280, c: P.light.c ?? [1, 0.6, 0.28], i: P.light.i ?? 1.5 });
  }
  // 2) 올린 보도의 밟는 상자를 먼저 (소품·적의 발밑 높이, 바닥 그늘이 이것을 본다)
  for (const P of S.parts) if (P.t === 'pave') W.boxes.push({ x0: P.x, x1: P.x + P.w, z0: P.z, z1: P.z + P.d, y0: (P.y ?? 0) - 2, y1: (P.y ?? 0) + (P.h ?? 7), solid: true, walk: true, kit: true, part: P });
  // 3) 기하 (WORLD-2: first a counting pass - nothing lit, nothing written - to plan which small materials fold into a texture their chunk uses anyway)
  const emit = (G, extra, propTris) => { for (const P of S.parts) {
    G.chunk = chunkOf(S, P);
    const y = P.y ?? 0;
    switch (P.t) {
      case 'floor': K.dressFloor(G, P, W); break;
      case 'pave': K.pave(G, P, W); break;
      case 'block': if (P.mesh) { G.lift = true; PROPS[P.mesh](G, P.x + P.w / 2, y, P.z + P.d / 2, { w: P.w, d: P.d, h: P.h }); G.lift = false; } else K.dressBlock(G, P, W, extra); break;
      case 'wall': K.dressWall(G, P, extra); for (const [F, h] of wallHang(P)) WALLPROPS[h.type](G, F, h); break;
      case 'roof': K.dressRoof(G, P); break;
      case 'stairs': K.dressStairs(G, P, extra); break;
      case 'pillar': K.dressPillar(G, P); break;
      case 'arch': K.arch(G, P); break;
      case 'fence': K.fenceAt(G, P, extra); break;   // FENCE: fences, balustrades, stair cheeks and low walls push the collision of what they draw into extra
      case 'prop': case 'deco': {
        if (!P.mesh) break;
        const g = P.y ?? groundAt(W, P.x, P.z), fn = propFn(P.mesh, P.code); if (!fn) throw new Error('모르는 소품: ' + P.mesh);
        const t0 = G.tris; G.lift = true; fn(G, P.x, Number.isFinite(g) ? g : 0, P.z, P); G.lift = false;
        if (P.mesh === 'cemgate') extra.push(...cemgateBoxes(P.x, Number.isFinite(g) ? g : 0, P.z, P).map((b) => ({ ...b, part: P })));   // FENCE: the gate posts and leaves collide where they are drawn
        const pm = propTris[P.mesh] ?? (propTris[P.mesh] = [0, 0]); pm[0]++; pm[1] += G.tris - t0;   // 소품별 [개수, 삼각형] (검사 · 문서의 숫자)
        break;
      }
      case 'blocker': case 'light': case 'window': break;
      default: throw new Error('모르는 part: ' + P.t);
    }
  } };
  let folds = fold === false ? null : fold && typeof fold === 'object' ? fold : S.folds && typeof S.folds === 'object' ? S.folds : null;
  if (fold === 'auto' || (fold !== false && S.folds === 'auto')) { const G0 = new Geo(W, { cull }); G0.cnt = new Map(); G0.fx = { glows: [], pools: [], shadows: [] }; G0.flames = !!flames; emit(G0, [], {}); folds = foldPlan(G0.cnt); }
  G.fold = folds;
  emit(G, extra, propTris);
  W.boxes.push(...extra);
  for (const sp of W.spawns) { const g = groundAt(W, sp.x, sp.z); sp.y = Number.isFinite(g) ? g : 0; }
  W.start.y = groundAt(W, W.start.x, W.start.z);
  const out = G.done(), per = {};
  for (const m of out.meshes) { const c = per[m.chunk] ?? (per[m.chunk] = { tris: 0, bytes: 0, draws: 0 }); c.tris += m.count / 3; c.bytes += m.data.byteLength; c.draws++; }
  W.env = { meshes: out.meshes, bounds: out.bounds, fx: G.fx, decals: S.decals ?? [], stats: { tris: out.tris, bytes: out.meshes.reduce((a, m) => a + m.data.byteLength, 0), chunks: per, textures: [...new Set(out.meshes.map((m) => m.tex))], props: propTris, folds } };
  W.stats = { ...W.stats, bTris: W.stats.tris, tris: out.tris, boxes: W.boxes.length };
  uniformBoxes(W);
  return W;
}
/**
 * Every collision box gets the same keys in the same order (requests.md, core-verify): the boxes came in five shapes, so groundAt / moveXZ read
 * b.x0 ... on the slow generic path and made a number object per read. Call it again after pushing a box by hand.
 */
export function uniformBoxes(W) {
  const B = W.boxes, keys = ['x0', 'x1', 'z0', 'z1', 'y0', 'y1', 'solid', 'walk', 'inv', 'stair', 'kit', 'part'];
  for (let i = 0; i < B.length; i++) for (const k in B[i]) if (!keys.includes(k)) keys.push(k);
  for (let i = 0; i < B.length; i++) { const b = B[i], o = {}; for (let j = 0; j < keys.length; j++) o[keys[j]] = b[keys[j]]; B[i] = o; }
  return W;
}
