// 타일 렌더러: 스테이지 텍스처(Kling 생성 tex/*.webp)로 벽/바닥을 칠하고, 경계 음영·윗면 하이라이트·이끼/눈 장식을 얹어
// 방 전체를 오프스크린 캔버스(청크)에 미리 구워 둔다. 타일이 바뀌면(부서진 벽) 해당 청크만 다시 굽는다.
// new TileRenderer(stage, map) → draw(ctx, cam), drawDecor(ctx, cam, t), drawLiquid(ctx, cam, t, kind), invalidate(tx, ty)
// 2부(world2 §3.3·§4.1): 위상 타일(거울 a/b · 심장 박동 z/Z)은 청크에 굽지 않고 매 프레임 현재 상태로 그린다 → 기믹이 타일을
// 뒤집어도 청크를 다시 굽지 않는다. invalidate 는 구운 그림이 실제로 달라지는 변화(벽 부숨·비밀 통로)만 다시 굽는다.
// 액체: 'deep'(수영 구역) 팔레트, 좁고 긴 세로 물줄기는 흘러내리는 폭포로 그린다.
// 비밀 방(가짜 벽 h 로 메운 공간) 속에 남은 액체·가시·발판은 드러나기 전까지 벽으로 구워 밖에서 비쳐 보이지 않게 한다.
// 청크 캔버스는 최대 MAX_CHUNKS 장만 두고 재사용한다 (모바일 메모리).
import { TILE } from '../core/game.js';
import { T } from '../core/physics.js';
import { assets } from '../core/assets.js';
import { RNG, hashStr, rgba, shade, mix, TAU } from '../core/math.js';

const CHUNK = 16; // 타일 단위 청크 크기
const DEPTH_R = 3; // 깊이 음영: 빈칸까지의 거리를 찾는 반경(타일)
const MAX_CHUNKS = 8; // 구워 둔 청크 캔버스 상한 (청크 하나 768×768 ≈ 2.4MB). 화면 밖의 오래된 청크부터 버리고 캔버스는 재사용
const PHASE_CH = new Set(['a', 'b', 'z', 'Z']); // 위상 타일 문자 (tilemap.js PHASE 와 같음)
const DARK_CACHE = new Map();   // 톤다운 소품 사본 (모든 TileRenderer 공용: 방을 오갈 때 다시 굽지 않는다)
const DARK_CAP = 40;            // 상한 (소품 사본 ≤ 192×288 → 최악 ≈ 9 MB, 보통 2 MB 안팎)
// 원경이 트인 하늘/달인 테마: 절차적 창문('W')이 허공에 떠 보이므로 그리지 않는다
export const OPEN_SKY_THEMES = new Set(['village', 'town', 'graveyard', 'gate', 'spire', 'throne', 'abyss', 'sky', 'void', 'blight']);

export const TILE_STYLES = {
  // stage.tileStyle → 색/장식
  wood:   { base: '#3a2616', edge: '#1a0e06', top: '#6a4a2a', topDeco: null },
  stone:  { base: '#3a3640', edge: '#15121a', top: '#6a6470', topDeco: null },
  moss:   { base: '#2e3430', edge: '#101410', top: '#4a6a3a', topDeco: 'moss' },
  marble: { base: '#3a2a2e', edge: '#140a0e', top: '#8a6a60', topDeco: 'gold' },
  bone:   { base: '#4a4436', edge: '#1a160e', top: '#a89a7a', topDeco: 'skulls' },
  lab:    { base: '#26342a', edge: '#0a140c', top: '#4a7a5a', topDeco: 'slime' },
  wet:    { base: '#1e2a36', edge: '#080e14', top: '#3a5a6a', topDeco: 'wet' },
  brass:  { base: '#4a3a1e', edge: '#1a1206', top: '#b89040', topDeco: 'rivets' },
  ice:    { base: '#3a5a6a', edge: '#102030', top: '#dff4ff', topDeco: 'snow' },
  blood:  { base: '#2a0e12', edge: '#0e0204', top: '#7a1a24', topDeco: 'gold' },
  abyss:  { base: '#1e0e26', edge: '#08020c', top: '#6a2a7a', topDeco: 'glow' },
  dirt:   { base: '#2e2418', edge: '#100a06', top: '#4a3a24', topDeco: 'grass' },
  // ── 2부 (world2 §4.1). 선택 필드: glow·slime = 윗면 장식 색(없으면 기존 색), extra = 2부 전용 덧장식(굽기 때 한 번만 그림) ──
  mirror: { base: '#2a3040', edge: '#0a0c14', top: '#dfe8f0', topDeco: 'glow', glow: 'rgba(223,232,240,0.32)', extra: 'glints' },
  forge:  { base: '#2a1a14', edge: '#0a0402', top: '#ff7a2a', topDeco: 'rivets', extra: 'seams' },
  coral:  { base: '#1a3a3e', edge: '#061416', top: '#7ad8c8', topDeco: 'wet', extra: 'coral' },
  sky:    { base: '#6a7080', edge: '#2a2e38', top: '#f4ecd8', topDeco: 'gold', extra: 'veining' },
  flesh:  { base: '#3a1420', edge: '#12040a', top: '#b04a5a', topDeco: 'slime', slime: 'rgba(200,40,80,0.4)', extra: 'veins' },
  rot:    { base: '#2a2414', edge: '#0a0804', top: '#8ab040', topDeco: 'moss', extra: 'fungus' },
  void:   { base: '#0a0810', edge: '#000000', top: '#e8e0ff', topDeco: 'glow', glow: 'rgba(232,224,255,0.3)', extra: 'specks' },
};

// 테마별 배경 장식 소품 (Blender 렌더: assets/props/<id>.png). a:'floor'|'ceil', w/h: 그릴 크기(px), wt: 배치 가중치, dim: 어둡게 누르는 정도
const D = (id, w, h, a = 'floor', wt = 1, dim = 0.5) => ({ id, w, h, a, wt, dim });
export const DECOR_SETS = {
  village: [D('deco_village_well', 144, 144), D('deco_village_cart', 192, 120), D('deco_village_fence', 192, 72, 'floor', 2), D('deco_village_haybale', 96, 72, 'floor', 2), D('deco_village_lamppost', 64, 192), D('prop_barrel', 72, 72, 'floor', 2), D('prop_crate', 72, 72)],
  town: [D('deco_village_well', 144, 144), D('deco_village_cart', 192, 120), D('deco_village_haybale', 96, 72), D('deco_village_lamppost', 64, 192, 'floor', 2), D('prop_barrel', 72, 72, 'floor', 2), D('prop_crate', 72, 72)],
  graveyard: [D('deco_grave_tomb1', 72, 96, 'floor', 3), D('deco_grave_tomb2', 64, 112, 'floor', 3), D('deco_grave_tomb3', 96, 80, 'floor', 2), D('deco_grave_angel', 96, 192), D('deco_grave_deadtree', 192, 288), D('deco_grave_fence', 192, 96, 'floor', 2)],
  gate: [D('deco_gate_banner', 64, 192, 'ceil', 2), D('deco_gate_portcullis', 144, 192), D('deco_gate_brazier', 72, 120, 'floor', 2), D('prop_gargoyle', 96, 120)],
  arena: [D('deco_gate_banner', 64, 192, 'ceil', 2), D('deco_gate_brazier', 72, 120, 'floor', 2)],
  // 갑옷 장식은 갑옷 적(armor_knight/spear_guard)과 헷갈리지 않도록 빈도를 낮추고 더 어둡게
  hall: [D('deco_hall_armor', 72, 160, 'floor', 1, 0.66), D('deco_hall_vase', 64, 96, 'floor', 2), D('deco_hall_bust', 64, 120, 'floor', 2), D('deco_hall_curtain', 144, 288, 'ceil', 2), D('deco_gate_banner', 64, 192, 'ceil'), D('prop_pillar', 72, 192)],
  catacombs: [D('deco_cata_bonepile', 144, 72, 'floor', 3), D('deco_cata_skullpile', 96, 80, 'floor', 2), D('deco_cata_sarcophagus', 192, 96, 'floor', 2), D('deco_cata_urn', 56, 80, 'floor', 2)],
  library: [D('deco_lib_desk', 144, 96, 'floor', 2), D('deco_lib_globe', 72, 120), D('deco_lib_bookstack', 72, 72, 'floor', 3), D('deco_lib_ladder', 64, 240), D('prop_bookshelf', 128, 192, 'floor', 3)],
  alchemy: [D('deco_lab_alembic', 120, 144, 'floor', 2), D('deco_lab_cauldron', 120, 96, 'floor', 2), D('deco_lab_flaskrack', 144, 120, 'floor', 2), D('deco_lab_tesla', 96, 192), D('prop_vat', 128, 192, 'floor', 2)],
  waterway: [D('deco_water_grate', 144, 144, 'floor', 2), D('deco_water_chain', 32, 240, 'ceil', 3), D('deco_water_pipe', 192, 96, 'floor', 2), D('deco_water_barrel', 72, 96, 'floor', 2)],
  clock: [D('deco_clock_pendulum', 96, 288, 'ceil', 2), D('deco_clock_face', 192, 192), D('deco_clock_bell', 120, 120, 'ceil'), D('prop_gear', 192, 192, 'floor', 2)],
  spire: [D('deco_ice_crystal', 96, 144, 'floor', 3), D('deco_ice_statue', 96, 176, 'floor', 2), D('deco_ice_icicles', 192, 96, 'ceil', 3)],
  chapel: [D('deco_chapel_pew', 192, 80, 'floor', 3), D('deco_chapel_altar', 192, 144), D('deco_chapel_window', 144, 288, 'floor', 2), D('deco_chapel_candles', 96, 96, 'floor', 2)],
  throne: [D('deco_throne_chair', 192, 240), D('deco_throne_statue', 96, 224, 'floor', 2), D('deco_throne_candelabra', 96, 224, 'floor', 2), D('deco_hall_curtain', 144, 288, 'ceil', 2)],
  abyss: [D('deco_abyss_crystal', 96, 160, 'floor', 3), D('deco_abyss_spire', 96, 240, 'floor', 2), D('deco_abyss_eye', 120, 120, 'floor')],
  // ── 2부 (world2 §4.1; Blender 렌더 assets/props/deco_*.png — 이미지가 없으면 그리지 않는다) ──
  mirror:    [D('deco_mirror_frame', 96, 176, 'floor', 2), D('deco_mirror_shards', 144, 64, 'floor', 2), D('deco_mirror_chandelier', 144, 120, 'ceil', 2)],
  forge:     [D('deco_forge_anvil', 120, 96, 'floor', 2), D('deco_forge_crucible', 144, 160), D('deco_forge_chains', 64, 240, 'ceil', 3)],
  sunken:    [D('deco_sunk_coral', 120, 120, 'floor', 3), D('deco_sunk_bell', 144, 120), D('deco_sunk_statue', 96, 200, 'floor', 2)],
  sky:       [D('deco_sky_column', 96, 240, 'floor', 2), D('deco_sky_statue', 120, 200), D('deco_sky_urn', 72, 96, 'floor', 2)],
  nightmare: [D('deco_dream_cradle', 160, 120, 'floor', 2), D('deco_dream_doll', 72, 80, 'floor', 3), D('deco_dream_clock', 96, 220)],
  blight:    [D('deco_blight_shroom', 144, 160, 'floor', 3), D('deco_blight_stump', 144, 110, 'floor', 2), D('deco_blight_totem', 96, 200)],
  void:      [D('deco_void_prism', 96, 160, 'floor', 2), D('deco_void_monolith', 96, 240), D('deco_void_fragment', 144, 120, 'floor', 2)],
};
// 장식이 게임 요소를 가리지 않도록 마커 주변은 비움 (2부: 거울 스위치 Q · 포자 주머니 y · 기포 기둥 u · 상승 기류 U)
export const DECOR_BLOCK = new Set(['D', 'S', 'G', '$', 'N', 'X', 'P', '@', 'H', 'K', 'Q', 'y', 'u', 'U']);
// 테마별 'W' 창문 빛 [유리 위, 유리 아래, 빛줄기] — 없으면 기본 달빛
const WINDOW_TINT = {
  mirror: ['rgba(210,235,255,0.55)', 'rgba(80,110,160,0.25)', 'rgba(200,230,255,0.14)'],
  forge: ['rgba(255,150,70,0.5)', 'rgba(140,40,10,0.25)', 'rgba(255,140,60,0.12)'],
  sunken: ['rgba(90,230,220,0.45)', 'rgba(10,60,90,0.25)', 'rgba(90,220,230,0.1)'],
  nightmare: ['rgba(200,120,255,0.5)', 'rgba(70,10,90,0.25)', 'rgba(190,110,255,0.12)'],
};
const WINDOW_MOON = ['rgba(160,180,255,0.5)', 'rgba(60,40,120,0.25)', 'rgba(140,160,255,0.12)'];
// 액체 팔레트 [몸통, 수면·물줄기 빛] (world2 §3.3: deep 추가)
const LIQUID = {
  water: ['rgba(40,90,160,0.55)', '#8ad0ff'],
  lava: ['rgba(255,80,20,0.85)', '#ffd070'],
  poison: ['rgba(60,180,60,0.6)', '#a0ff80'],
  blood: ['rgba(140,0,20,0.75)', '#ff4a5a'],
  deep: ['rgba(8,38,66,0.74)', '#6fe8ff'],
};
// 깊은 물(수영 구역)은 몸통을 개체 뒤(DEEP_UNDER, draw)와 개체 앞(DEEP_FRONT, drawLiquid)으로 나눠 칠한다.
// 겹친 결과는 팔레트 알파 0.74 와 같고(1 − 0.37 × 0.70), 물속의 영웅·적은 0.3 만 물들어 잘 보인다.
const DEEP_UNDER = 'rgba(8,38,66,0.63)', DEEP_FRONT = 'rgba(8,38,66,0.3)';
// 물속에 놓인 마커 칸(적·아이템·촛불 등)은 타일이 빈칸이라 물에 구멍이 뚫려 보인다 → 그릴 때만 액체로 메운다
const WET_MARKERS = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '@', 'u', 'C', 'T', 'p', 'm', '$', '!']);
// 폭포 줄무늬 3겹: 타일 안 레인 x 위치, 점선 [길이, 간격], 흐르는 속도(px/s), 굵기, 알파
const FALL_FLOW = [
  { lanes: [6, 29], dash: [30, 18], speed: 430, lw: 2, a: 0.42 },
  { lanes: [17, 40], dash: [14, 38], speed: 520, lw: 1.5, a: 0.34 },
  { lanes: [11, 35], dash: [8, 30], speed: 380, lw: 1.2, a: 0.28 },
];

export class TileRenderer {
  constructor(stage, map) {
    this.stage = stage; this.map = map;
    this.style = TILE_STYLES[stage.tileStyle] || TILE_STYLES.stone;
    this.chunks = new Map();   // "cx,cy" → { canvas, tex(구울 때 준비된 텍스처 비트), used(마지막으로 그린 프레임) }
    this.pool = [];            // 버린 청크 캔버스 (다시 구울 때 재사용 — 새 캔버스를 만들지 않음)
    this.frame = 0;
    this.version = -1;
    this.dirty = new Set();
    this.initPhase();
    this.secretMask();
    this.cls = this.snapshot();
    this.props = this.placeProps();
    this.darkCache = DARK_CACHE;   // 톤다운 소품 사본 (방이 바뀌어도 같은 소품은 다시 굽지 않는다: 모듈 공용)
    this.liquidKind = null; this.lastT = 0; // 마지막 drawLiquid 의 액체 종류·시간 (draw 에서 깊은 물 뒷면을 칠할 때 씀)
    this.chunkTiles = CHUNK;       // 청크당 타일 수 (painted kit.ledgesOver 가 청크를 굽지 않고 읽는다)
    this.prewarm();
  }
  /**
   * 방을 불러올 때 한 번: 이 방이 쓸 캔버스를 미리 만든다 → 스테이지 도중 새 캔버스 0 (MASTER_PLAN §5.2, feel §8, R1-REQ-340R).
   * 청크 캔버스는 0×0 으로 만들어 풀에 넣고 쓸 때 크기를 준다 (쓰지 않는 청크는 메모리 0 — 살아 있는 캔버스 예산).
   * 작은 스프라이트(윗면 띠·깊이 음영 알파맵·창문·기둥·폭포 광택 캔버스)와 배경 소품의 톤다운 사본은 지금 굽는다.
   * 소품 이미지가 아직 안 왔으면 drawDecor 가 이미지가 오는 대로 전부 굽는다 (보이는 순간이 아니라 도착하는 순간).
   */
  prewarm() {
    const m = this.map;
    if (!m || typeof document === 'undefined') return;
    this.poolCap = Math.min(Math.ceil(m.w / CHUNK) * Math.ceil(m.h / CHUNK), MAX_CHUNKS + 2);
    while (this.pool.length < this.poolCap) { const c = document.createElement('canvas'); c.width = 0; c.height = 0; this.pool.push(c); }
    this.topStrip();
    if (!this.depthCtx) { const c = document.createElement('canvas'); c.width = CHUNK + 2; c.height = CHUNK + 2; this.depthCtx = c.getContext('2d'); }
    const decor = m.decor || [];
    if (!OPEN_SKY_THEMES.has(this.stage.theme) && decor.some((d) => d.ch === 'W')) this.windowSprites();
    if (decor.some((d) => d.ch === '|')) this.pillarSprite();
    if (!this.sheen) { this.sheen = document.createElement('canvas'); this.sheen.width = 0; this.sheen.height = 0; this.sheenCol = null; }
    this.warmProps();
  }
  /** 이 방 소품의 톤다운 사본을 모두 굽는다 (이미지가 아직 없으면 다음 호출에). 다 구웠으면(또는 없는 파일) true */
  warmProps() {
    if (this.propsWarm) return true;
    let ok = true;
    for (const p of this.props) if (!this.darkProp(p.d.id, p.d.w, p.d.h, p.d.dim) && !assets.failed?.('props/' + p.d.id)) ok = false;
    return (this.propsWarm = ok);
  }
  /**
   * 위상 타일 목록: GIMMICK-ENGINE 의 tilemap 이 채우는 map.phaseTiles [{idx,tx,ty,key}] (없으면 a/b/z/Z 마커).
   * 이 칸들은 청크에 굽지 않고(isSolid=false) drawPhase 가 현재 타일 상태대로 매 프레임 그린다.
   */
  initPhase() {
    const m = this.map;
    this.phaseIdx = new Set();
    this.phaseList = [];
    if (!m) return;
    const src = Array.isArray(m.phaseTiles) ? m.phaseTiles : (m.markers || []).filter((mk) => PHASE_CH.has(mk.ch));
    for (const p of src) {
      if (p.tx < 0 || p.ty < 0 || p.tx >= m.w || p.ty >= m.h) continue;
      const idx = p.idx ?? p.ty * m.w + p.tx;
      if (this.phaseIdx.has(idx)) continue;
      this.phaseIdx.add(idx);
      this.phaseList.push({ idx, tx: p.tx, ty: p.ty });
    }
  }
  /** 구운 그림 기준의 타일 분류 (같으면 다시 구울 필요 없음): 0 빈칸·액체·드러난 가짜 벽·위상 타일, 1 벽, 2 부서지는 벽, 3 발판, 4 가시, 5 숨은 가짜 벽 */
  bakeClass(idx) {
    const m = this.map, t = m.tiles[idx];
    if (this.phaseIdx.has(idx)) return 0;
    if (this.sec?.mask[idx]) return 5;
    if (t === T.SOLID) return 1;
    if (t === T.BREAK) return 2;
    if (t === T.ONEWAY) return 3;
    if (t === T.SPIKE) return 4;
    if (t === T.FAKE) return m.revealed.has(idx) ? 0 : 5;
    return 0;
  }
  snapshot() {
    const m = this.map;
    const n = m ? m.w * m.h : 0, c = new Uint8Array(n);
    for (let i = 0; i < n; i++) c[i] = this.bakeClass(i);
    return c;
  }
  /** 바닥/천장 표면에 테마 소품을 결정론적으로 배치 */
  placeProps() {
    const set = DECOR_SETS[this.stage.theme];
    const m = this.map;
    if (!set || !m) return [];
    const rng = new RNG(hashStr(this.stage.id + ':' + m.w + 'x' + m.h));
    const blocked = new Set();
    for (const mk of m.markers) if (DECOR_BLOCK.has(mk.ch)) for (let d = -3; d <= 3; d++) blocked.add(mk.tx + d);
    // 위상 타일은 켜졌다 꺼지므로 받침(바닥/천장)으로도, 빈 공간으로도 보지 않는다 (소품이 허공에 뜨거나 벽에 묻히지 않게)
    const phase = (tx, ty) => tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && this.phaseIdx.has(ty * m.w + tx);
    const solid = (tx, ty) => { const t = m.typeAt(tx, ty); return (t === T.SOLID || t === T.BREAK) && !phase(tx, ty); };
    const empty = (tx, ty) => m.typeAt(tx, ty) === T.EMPTY && tx >= 0 && tx < m.w && ty >= 0 && !phase(tx, ty);
    const out = [];
    const total = set.reduce((a, d) => a + d.wt, 0);
    const pickD = (a) => {
      const list = set.filter((d) => d.a === a);
      if (!list.length) return null;
      let r = rng.next() * list.reduce((s, d) => s + d.wt, 0);
      for (const d of list) { r -= d.wt; if (r <= 0) return d; }
      return list[0];
    };
    let lastFloor = -99, lastCeil = -99;
    for (let tx = 1; tx < m.w - 1; tx++) {
      if (blocked.has(tx)) continue;
      for (let ty = 1; ty < m.h; ty++) {
        // 바닥
        if (empty(tx, ty) && solid(tx, ty + 1) && tx - lastFloor > 5 && rng.next() < 0.16) {
          const d = pickD('floor');
          if (!d) continue;
          const wt = Math.ceil(d.w / TILE), ht = Math.ceil(d.h / TILE);
          let ok = true;
          for (let x = tx; x < tx + wt && ok; x++) { if (!solid(x, ty + 1)) ok = false; for (let y = ty - ht + 1; y <= ty && ok; y++) if (!empty(x, y)) ok = false; }
          if (ok) { out.push({ d, x: tx * TILE + (wt * TILE - d.w) / 2, y: (ty + 1) * TILE - d.h }); lastFloor = tx + wt; }
        }
        // 천장 (위가 벽, 아래로 충분히 빈 공간)
        if (empty(tx, ty) && solid(tx, ty - 1) && tx - lastCeil > 6 && rng.next() < 0.12) {
          const d = pickD('ceil');
          if (!d) continue;
          const ht = Math.ceil(d.h / TILE) + 2;
          let ok = true;
          for (let y = ty; y < ty + ht && ok; y++) if (!empty(tx, y)) ok = false;
          if (ok) { out.push({ d, x: tx * TILE + TILE / 2 - d.w / 2, y: ty * TILE }); lastCeil = tx; }
        }
      }
    }
    return out;
  }
  /** 배경용으로 채도를 낮추고 어둡게 톤다운한 소품 이미지 (캐시) — 적·파괴 가능한 오브젝트와 구분되게 */
  darkProp(id, w, h, dim = 0.5) {
    const key = id + w + 'x' + h + ':' + dim + ':' + this.style.edge;
    let c = this.darkCache.get(key);
    if (c) return c;
    const img = assets.get('props/' + id);
    if (!img) return null;
    // 상한이면 가장 오래된 사본의 캔버스를 다시 쓴다 (그리는 쪽은 매번 이 함수로 찾으므로 밀려난 사본을 붙잡지 않는다)
    if (this.darkCache.size >= DARK_CAP) { const k0 = this.darkCache.keys().next().value; c = this.darkCache.get(k0); this.darkCache.delete(k0); }
    c ??= document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    try {
      // 채도 55% 감소 (알파는 그대로)
      const data = g.getImageData(0, 0, w, h), px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        const l = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
        px[i] += (l - px[i]) * 0.55; px[i + 1] += (l - px[i + 1]) * 0.55; px[i + 2] += (l - px[i + 2]) * 0.55;
      }
      g.putImageData(data, 0, 0);
    } catch { /* 캔버스 오염 등으로 픽셀 접근 불가 → 어둡게만 */ }
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = rgba(this.style.edge, dim);
    g.fillRect(0, 0, w, h);
    this.darkCache.set(key, c);
    return c;
  }
  invalidate(tx, ty) {
    if (tx === undefined) {
      for (const key of [...this.chunks.keys()]) this.drop(key);
      this.cls = this.snapshot();
      return;
    }
    const m = this.map;
    if (!m || tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return;
    // 구운 그림이 달라지지 않는 변화(위상 타일 전환, 물 ↔ 빈칸)는 다시 굽지 않는다 — 기믹이 자주 바꾸는 칸
    const idx = ty * m.w + tx, c = this.bakeClass(idx);
    if (c === this.cls[idx]) return;
    this.cls[idx] = c;
    this.dropNear(tx, ty);
  }
  /** (tx,ty) 를 그리는 청크와 깊이 음영 반경 안의 이웃 청크를 버린다 (청크 크기 > DEPTH_R 이므로 -R/0/+R 만 보면 충분) */
  dropNear(tx, ty) {
    for (let dy = -DEPTH_R; dy <= DEPTH_R; dy += DEPTH_R) for (let dx = -DEPTH_R; dx <= DEPTH_R; dx += DEPTH_R) {
      this.drop(`${Math.floor((tx + dx) / CHUNK)},${Math.floor((ty + dy) / CHUNK)}`);
    }
  }
  /**
   * 비밀 공간 마스크 (타일이 바뀌거나 비밀 통로가 드러날 때만 다시 계산): tilemap 의 fillSecretPockets 는 비밀 방의 빈칸만
   * 가짜 벽으로 메우므로, 안에 남은 액체·가시·발판이 벽 속에 비쳐 보였다. 빈칸·드러난 가짜 벽·방 가장자리에 닿지 않고
   * 숨은 가짜 벽에만 둘러싸인 액체·가시·발판 덩어리 = 1 → 드러나기 전까지 벽으로 굽고 액체도 그리지 않는다.
   * 다시 계산해서 바뀐 칸이 있으면 그 청크를 버려 다시 굽게 한다.
   */
  secretMask() {
    const m = this.map;
    if (!m) return null;
    const key = m.version + ':' + m.revealed.size;
    if (this.sec && this.sec.key === key) return this.sec.mask;
    const W = m.w, H = m.h, tl = m.tiles, N = W * H;
    const mask = new Uint8Array(N);
    let fake = false;
    for (let i = 0; i < N; i++) if (tl[i] === T.FAKE && !m.revealed.has(i)) { fake = true; break; }
    if (fake) {
      const seen = new Uint8Array(N), stack = [], comp = [];
      const pass = (t) => t === T.LIQUID || t === T.SPIKE || t === T.ONEWAY || t === T.BREAK;
      for (let i0 = 0; i0 < N; i0++) {
        if (seen[i0] || !pass(tl[i0]) || tl[i0] === T.BREAK) continue;
        comp.length = 0; stack.length = 0;
        seen[i0] = 1; stack.push(i0);
        let open = false, hidden = false;
        while (stack.length) {
          const i = stack.pop(), x = i % W, y = (i - x) / W;
          comp.push(i);
          if (x === 0 || y === 0 || x === W - 1 || y === H - 1) open = true;
          for (let d = 0; d < 4; d++) {
            const j = d === 0 ? (x > 0 ? i - 1 : -1) : d === 1 ? (x < W - 1 ? i + 1 : -1) : d === 2 ? (y > 0 ? i - W : -1) : (y < H - 1 ? i + W : -1);
            if (j < 0 || seen[j]) continue;
            const t = tl[j];
            if (pass(t)) { seen[j] = 1; stack.push(j); continue; }
            if (t === T.FAKE) { if (m.revealed.has(j)) open = true; else hidden = true; }
            else if (t !== T.SOLID) open = true; // 빈칸(마커 칸 포함)
          }
        }
        if (hidden && !open) for (const i of comp) if (tl[i] !== T.BREAK) mask[i] = 1;
      }
    }
    const old = this.sec?.mask;
    this.sec = { key, mask };
    if (old && this.cls) {
      for (let i = 0; i < N; i++) {
        if (old[i] === mask[i]) continue;
        this.cls[i] = this.bakeClass(i);
        this.dropNear(i % W, Math.floor(i / W));
      }
    }
    return mask;
  }
  /** 청크를 버리고 캔버스는 풀에 돌려 둔다 (방을 불러올 때 만든 수만큼). 2장 넘게 쌓이는 것은 비워(0×0) 메모리를 돌려준다 */
  drop(key) {
    const c = this.chunks.get(key);
    if (!c) return;
    this.chunks.delete(key);
    if (this.pool.length >= 2) c.canvas.width = c.canvas.height = 0; // 바로 비워 GPU/비트맵 메모리를 돌려준다 (GC 를 기다리지 않음)
    if (this.pool.length < Math.max(2, this.poolCap ?? 2)) this.pool.push(c.canvas); // 캔버스 자체는 다시 쓴다 (도중에 새로 만들지 않게)
  }
  /**
   * (tx,ty) 가 드러나지 않은 비밀 공간 속이라 벽으로 그려지는 칸인가 (가짜 벽 + 그 안의 액체·가시·발판).
   * world.inUnrevealedFake 가 이것도 보면 비밀 물웅덩이 속 적·아이템이 벽 위에 비쳐 보이지 않는다.
   */
  hiddenAt(tx, ty) {
    const m = this.map;
    if (!m || tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false;
    const i = ty * m.w + tx;
    return (m.tiles[i] === T.FAKE && !m.revealed.has(i)) || this.secretMask()?.[i] === 1;
  }
  /** 구울 때 쓸 수 있는 텍스처 비트: 1 = 주 텍스처, 2 = 보조 텍스처 */
  texState() {
    const s = this.stage;
    return (assets.get(s.tex) ? 1 : 0) | (assets.get(s.tex2 || s.tex) ? 2 : 0);
  }
  chunk(cx, cy) {
    const key = `${cx},${cy}`;
    const c = this.chunks.get(key);
    const tex = this.texState();
    // 새로 준비된 텍스처가 있을 때만 다시 굽는다 (이미지 캐시에서 빠져 null 이 되어도 구운 그림은 그대로 둔다)
    if (c && !(tex & ~c.tex)) { c.used = this.frame; return c.canvas; }
    const S = CHUNK * TILE;
    let canvas = c ? c.canvas : this.pool.pop();
    let g;
    if (canvas) {
      if (canvas.width !== S || canvas.height !== S) { canvas.width = S; canvas.height = S; } // 풀의 0×0 캔버스
      g = canvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, S, S);
    } else {
      canvas = document.createElement('canvas');
      canvas.width = S; canvas.height = S;
      g = canvas.getContext('2d');
    }
    this.bake(g, cx * CHUNK, cy * CHUNK);
    this.chunks.set(key, { canvas, tex, used: this.frame });
    return canvas;
  }
  /** 청크가 상한을 넘으면 이번 프레임에 쓰지 않은 것부터 오래된 순으로 버린다 */
  evict() {
    const old = [];
    for (const [key, c] of this.chunks) if (c.used !== this.frame) old.push([key, c.used]);
    old.sort((a, b) => a[1] - b[1]);
    for (const [key] of old) { if (this.chunks.size <= MAX_CHUNKS) break; this.drop(key); }
  }
  isSolid(tx, ty) {
    const m = this.map;
    if (tx < 0 || tx >= m.w || ty < 0 || ty >= m.h) return ty >= 0 && ty < m.h; // 좌우 밖은 벽으로 이어진 듯이
    const i = ty * m.w + tx, t = m.tiles[i];
    if (this.phaseIdx.size && this.phaseIdx.has(i)) return false; // 위상 타일은 drawPhase 가 따로 그림
    return t === T.SOLID || t === T.BREAK || (t === T.FAKE && !m.revealed.has(i)) || this.sec.mask[i] === 1;
  }
  bake(ctx, tx0, ty0) {
    const m = this.map, S = TILE, st = this.style;
    const tex = assets.get(this.stage.tex), tex2 = assets.get(this.stage.tex2 || this.stage.tex);
    const pat = tex ? ctx.createPattern(tex, 'repeat') : null;
    const pat2 = tex2 ? ctx.createPattern(tex2, 'repeat') : null;
    const rng = new RNG(hashStr(this.stage.id) + tx0 * 31 + ty0 * 17);
    const sec = this.sec.mask; // 비밀 방 속 액체·가시·발판 → 드러나기 전까지 벽으로
    for (let ty = ty0; ty < ty0 + CHUNK; ty++) {
      for (let tx = tx0; tx < tx0 + CHUNK; tx++) {
        if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
        const idx = ty * m.w + tx;
        if (this.phaseIdx.has(idx)) continue; // 위상 타일은 굽지 않는다 (drawPhase 가 현재 상태로 그림)
        const t = m.tiles[idx];
        const x = (tx - tx0) * S, y = (ty - ty0) * S;
        if (t === T.SOLID || t === T.BREAK || (t === T.FAKE && !m.revealed.has(idx)) || sec[idx]) {
          const alt = m.alt[idx];
          // 텍스처 (월드 좌표 기준으로 정렬되도록 패턴 이동)
          const p = alt ? pat2 : pat;
          if (p) {
            p.setTransform?.(new DOMMatrix().translateSelf(-((tx0 * S) % 384), -((ty0 * S) % 384)).scaleSelf(0.75, 0.75));
            ctx.fillStyle = p;
            ctx.fillRect(x, y, S, S);
            ctx.fillStyle = rgba(st.base, 0.45); ctx.fillRect(x, y, S, S);
          } else {
            ctx.fillStyle = alt ? shade(st.base, -0.15) : st.base; ctx.fillRect(x, y, S, S);
            // 벽돌 무늬
            ctx.strokeStyle = rgba(st.edge, 0.6); ctx.lineWidth = 1;
            const off = (ty % 2) * (S / 2);
            ctx.beginPath();
            ctx.moveTo(x, y + S / 2); ctx.lineTo(x + S, y + S / 2);
            ctx.moveTo(x + ((off) % S), y); ctx.lineTo(x + ((off) % S), y + S / 2);
            ctx.moveTo(x + ((off + S / 2) % S), y + S / 2); ctx.lineTo(x + ((off + S / 2) % S), y + S);
            ctx.stroke();
          }
          if (st.extra) this.extraFace(ctx, x, y, st.extra, rng);
          // (깊이 음영은 청크 전체를 다 그린 뒤 bakeDepth 에서 부드럽게)
          // 윗면 (노출)
          if (!this.isSolid(tx, ty - 1)) {
            ctx.drawImage(this.topStrip(), x, y);
            this.topDeco(ctx, x, y, st.topDeco, rng);
            if (st.extra) this.extraTop(ctx, x, y, st.extra, rng);
          }
          // 경계선
          ctx.fillStyle = rgba(st.edge, 0.9);
          if (!this.isSolid(tx, ty + 1)) ctx.fillRect(x, y + S - 3, S, 3);
          if (!this.isSolid(tx - 1, ty)) { ctx.fillRect(x, y, 3, S); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x + 3, y, 2, S); ctx.fillStyle = rgba(st.edge, 0.9); }
          if (!this.isSolid(tx + 1, ty)) ctx.fillRect(x + S - 3, y, 3, S);
          // 부서지는 벽: 미세한 균열 (눈썰미 좋은 플레이어를 위한 힌트)
          if (t === T.BREAK) {
            ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(x + 12, y + 8); ctx.lineTo(x + 20, y + 22); ctx.lineTo(x + 16, y + 34); ctx.moveTo(x + 20, y + 22); ctx.lineTo(x + 32, y + 26); ctx.stroke();
          }
        } else if (t === T.ONEWAY) {
          // 발판: 나무/돌 선반
          const pg = ctx.createLinearGradient(0, y, 0, y + 14);
          pg.addColorStop(0, shade(st.top, 0.1)); pg.addColorStop(1, shade(st.base, -0.3));
          ctx.fillStyle = pg; ctx.fillRect(x, y, S, 12);
          ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x, y, S, 2);
          ctx.fillStyle = rgba(st.edge, 0.9); ctx.fillRect(x, y + 11, S, 2);
          // 받침대
          if (tx % 2 === 0) { ctx.fillStyle = rgba(st.edge, 0.7); ctx.beginPath(); ctx.moveTo(x + 8, y + 12); ctx.lineTo(x + 16, y + 12); ctx.lineTo(x + 10, y + 26); ctx.fill(); }
        } else if (t === T.SPIKE) {
          ctx.fillStyle = '#8a8a96';
          for (let i = 0; i < 4; i++) {
            ctx.beginPath(); ctx.moveTo(x + i * 12, y + S); ctx.lineTo(x + i * 12 + 6, y + S - 26); ctx.lineTo(x + i * 12 + 12, y + S); ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 12 + 5, y + S - 24, 1.5, 12);
          ctx.fillStyle = '#3a3a44'; ctx.fillRect(x, y + S - 5, S, 5);
        }
      }
    }
    this.bakeDepth(ctx, tx0, ty0);
  }
  /** 깊이 음영용 벽 판정: 방 위아래 바깥도 벽이 이어진 것으로 본다 */
  depthSolid(tx, ty) {
    if (ty < 0 || ty >= this.map.h) return true;
    return this.isSolid(tx, ty);
  }
  /**
   * 깊이 음영: 가장 가까운 빈칸까지의 거리로 벽 안쪽을 점점 어둡게.
   * 타일당 1픽셀 알파맵(청크 + 테두리 1칸)을 만들어 부드럽게(쌍선형) 확대하고, 벽 타일 영역으로만 잘라 그린다.
   * → 타일 단위의 딱딱한 검은 사각형(구멍·격자처럼 보이던 문제) 대신 매끄러운 그라데이션.
   */
  bakeDepth(ctx, tx0, ty0) {
    const m = this.map, S = TILE, R = DEPTH_R, N = CHUNK + 2;
    if (!this.depthCtx) {
      const c = document.createElement('canvas'); c.width = N; c.height = N;
      this.depthCtx = c.getContext('2d');
    }
    const g = this.depthCtx;
    const img = g.createImageData(N, N);
    let any = false;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const tx = tx0 + i - 1, ty = ty0 + j - 1;
        if (!this.depthSolid(tx, ty)) continue;
        // 상하좌우에 빈칸이 있으면 표면 타일 → 음영 없음
        if (!this.depthSolid(tx + 1, ty) || !this.depthSolid(tx - 1, ty) || !this.depthSolid(tx, ty + 1) || !this.depthSolid(tx, ty - 1)) continue;
        let q = (R + 1) * (R + 1);
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const d = dx * dx + dy * dy;
            if (d < q && !this.depthSolid(tx + dx, ty + dy)) q = d;
          }
        }
        const a = Math.min(0.5, (Math.sqrt(q) - 1) * 0.18);
        if (a > 0) { img.data[(j * N + i) * 4 + 3] = Math.round(a * 255); any = true; }
      }
    }
    if (!any) return;
    g.putImageData(img, 0, 0);
    ctx.save();
    ctx.beginPath();
    for (let ty = Math.max(0, ty0); ty < Math.min(m.h, ty0 + CHUNK); ty++) {
      for (let tx = Math.max(0, tx0); tx < Math.min(m.w, tx0 + CHUNK); tx++) {
        if (this.isSolid(tx, ty)) ctx.rect((tx - tx0) * S, (ty - ty0) * S, S, S);
      }
    }
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    // 알파맵 픽셀 i 의 중심 = 타일 (tx0 + i - 1) 의 중심
    ctx.drawImage(g.canvas, -S, -S, N * S, N * S);
    ctx.restore();
  }
  topDeco(ctx, x, y, kind, rng) {
    switch (kind) {
      case 'grass': case 'moss':
        ctx.fillStyle = kind === 'grass' ? '#3a5a2a' : '#4a7a3a';
        for (let i = 0; i < 6; i++) { const gx = x + rng.range(0, 46); ctx.fillRect(gx, y - rng.range(2, 7), 2, 8); }
        break;
      case 'snow':
        ctx.fillStyle = '#f0f8ff';
        ctx.beginPath(); ctx.moveTo(x, y + 4);
        for (let i = 0; i <= 4; i++) ctx.quadraticCurveTo(x + i * 12 - 6, y - rng.range(2, 6), x + i * 12, y + 2);
        ctx.lineTo(x + 48, y + 7); ctx.lineTo(x, y + 7); ctx.fill();
        break;
      case 'skulls':
        if (rng.next() < 0.2) { ctx.fillStyle = '#d8ccb0'; ctx.beginPath(); ctx.arc(x + 24, y - 5, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#1a140a'; ctx.fillRect(x + 20, y - 6, 3, 3); ctx.fillRect(x + 25, y - 6, 3, 3); }
        break;
      case 'gold':
        ctx.fillStyle = 'rgba(232,200,114,0.5)'; ctx.fillRect(x, y + 3, 48, 2);
        break;
      case 'slime':
        ctx.fillStyle = this.style.slime ?? 'rgba(100,255,100,0.35)';
        if (rng.next() < 0.3) { ctx.beginPath(); ctx.ellipse(x + 24, y + 2, 10, 3, 0, 0, TAU); ctx.fill(); ctx.fillRect(x + 22, y + 2, 3, rng.range(6, 16)); }
        break;
      case 'wet':
        ctx.fillStyle = 'rgba(120,200,255,0.25)'; ctx.fillRect(x, y + 1, 48, 3);
        break;
      case 'rivets':
        ctx.fillStyle = '#e8c070'; for (const rx of [8, 40]) { ctx.beginPath(); ctx.arc(x + rx, y + 8, 2, 0, TAU); ctx.fill(); }
        break;
      case 'glow':
        ctx.fillStyle = this.style.glow ?? 'rgba(255,90,255,0.25)'; ctx.fillRect(x, y, 48, 3);
        break;
    }
  }
  /** 윗면 하이라이트 띠 (48×12, 캐시) — 타일마다 그라데이션을 새로 만들지 않는다 */
  topStrip() {
    if (this.topCanvas) return this.topCanvas;
    const st = this.style, c = document.createElement('canvas');
    c.width = TILE; c.height = 12;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 12);
    gr.addColorStop(0, st.top); gr.addColorStop(1, rgba(st.top, 0));
    g.fillStyle = gr; g.fillRect(0, 0, TILE, 12);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, TILE, 2);
    this.topCanvas = c;
    return c;
  }
  /** 2부 타일 면 덧장식 (굽기 때만): 거울 반사광·용광로 균열·산호 따개비·대리석 결·살점 혈관·이끼 얼룩·공허의 별빛 */
  extraFace(ctx, x, y, kind, rng) {
    switch (kind) {
      case 'glints':
        if (rng.next() < 0.2) {
          const gx = x + rng.range(4, 26);
          ctx.strokeStyle = 'rgba(235,245,255,0.14)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(gx, y + 44); ctx.lineTo(gx + 16, y + 6); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(gx + 6, y + 44); ctx.lineTo(gx + 20, y + 12); ctx.stroke();
        }
        break;
      case 'seams':
        if (rng.next() < 0.22) {
          const sx = x + rng.range(8, 40), sy = y + rng.range(10, 20);
          ctx.beginPath(); ctx.moveTo(sx, sy);
          ctx.lineTo(sx + rng.range(-8, 8), sy + 10); ctx.lineTo(sx + rng.range(-10, 10), sy + 20); ctx.lineTo(sx + rng.range(-6, 6), sy + 26);
          ctx.strokeStyle = 'rgba(255,110,30,0.35)'; ctx.lineWidth = 4; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,200,90,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
        }
        break;
      case 'coral':
        if (rng.next() < 0.25) {
          ctx.fillStyle = 'rgba(220,240,230,0.28)';
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + rng.range(6, 42), y + rng.range(14, 42), rng.range(1.5, 3.2), 0, TAU); ctx.fill(); }
        }
        break;
      case 'veining':
        if (rng.next() < 0.3) {
          const vy = y + rng.range(8, 40);
          ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, vy); ctx.bezierCurveTo(x + 16, vy - rng.range(4, 12), x + 30, vy + rng.range(4, 12), x + 48, vy + rng.range(-6, 6)); ctx.stroke();
        }
        break;
      case 'veins':
        if (rng.next() < 0.32) {
          const vx = x + rng.range(6, 42);
          ctx.beginPath(); ctx.moveTo(vx, y + 2);
          ctx.quadraticCurveTo(vx + rng.range(-14, 14), y + 24, vx + rng.range(-10, 10), y + 46);
          ctx.strokeStyle = 'rgba(70,0,16,0.65)'; ctx.lineWidth = 3; ctx.stroke();
          ctx.strokeStyle = 'rgba(190,50,80,0.35)'; ctx.lineWidth = 1; ctx.stroke();
        }
        break;
      case 'fungus':
        if (rng.next() < 0.16) {
          ctx.fillStyle = 'rgba(150,190,70,0.22)';
          ctx.beginPath(); ctx.ellipse(x + rng.range(10, 38), y + rng.range(14, 38), rng.range(5, 10), rng.range(3, 6), 0, 0, TAU); ctx.fill();
        }
        break;
      case 'specks':
        if (rng.next() < 0.5) {
          const n = 1 + Math.floor(rng.next() * 3);
          for (let i = 0; i < n; i++) {
            ctx.fillStyle = rng.next() < 0.5 ? 'rgba(232,224,255,0.75)' : 'rgba(170,140,255,0.6)';
            const s = rng.range(1, 2.2);
            ctx.fillRect(x + rng.range(3, 45), y + rng.range(6, 44), s, s);
          }
        }
        break;
    }
  }
  /** 2부 윗면 덧장식 (노출된 윗면, 굽기 때만) */
  extraTop(ctx, x, y, kind, rng) {
    switch (kind) {
      case 'glints':
        if (rng.next() < 0.3) {
          const gx = x + rng.range(6, 42), gy = y + 1;
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.beginPath(); ctx.moveTo(gx, gy - 5); ctx.lineTo(gx + 1.2, gy - 1.2); ctx.lineTo(gx + 5, gy); ctx.lineTo(gx + 1.2, gy + 1.2);
          ctx.lineTo(gx, gy + 5); ctx.lineTo(gx - 1.2, gy + 1.2); ctx.lineTo(gx - 5, gy); ctx.lineTo(gx - 1.2, gy - 1.2); ctx.fill();
        }
        break;
      case 'seams':
        ctx.fillStyle = 'rgba(255,140,50,0.55)';
        for (let i = 0; i < 3; i++) if (rng.next() < 0.4) ctx.fillRect(x + rng.range(2, 44), y - rng.range(1, 4), 2, 2);
        break;
      case 'coral':
        if (rng.next() < 0.35) {
          const cx = x + rng.range(8, 40), h = rng.range(7, 13);
          ctx.strokeStyle = rng.next() < 0.5 ? 'rgba(232,122,138,0.85)' : 'rgba(122,216,200,0.85)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx, y + 2); ctx.lineTo(cx, y - h);
          ctx.moveTo(cx, y - h * 0.45); ctx.lineTo(cx - 4, y - h * 0.8);
          ctx.moveTo(cx, y - h * 0.6); ctx.lineTo(cx + 4, y - h); ctx.stroke();
          ctx.lineCap = 'butt';
        }
        break;
      case 'veins':
        if (rng.next() < 0.25) {
          const px = x + rng.range(8, 40);
          ctx.fillStyle = 'rgba(160,40,70,0.8)'; ctx.beginPath(); ctx.ellipse(px, y + 1, 5, 3.5, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,170,190,0.35)'; ctx.beginPath(); ctx.arc(px - 1.5, y, 1.4, 0, TAU); ctx.fill();
        }
        break;
      case 'fungus':
        if (rng.next() < 0.3) {
          const mx = x + rng.range(8, 40), h = rng.range(5, 10), r = rng.range(4, 7);
          ctx.fillStyle = 'rgba(214,204,170,0.85)'; ctx.fillRect(mx - 1.2, y - h, 2.4, h + 2);
          ctx.fillStyle = rng.next() < 0.5 ? 'rgba(200,176,112,0.9)' : 'rgba(184,224,74,0.85)';
          ctx.beginPath(); ctx.ellipse(mx, y - h, r, r * 0.55, 0, Math.PI, 0); ctx.fill();
        }
        break;
      case 'specks':
        if (rng.next() < 0.35) { ctx.fillStyle = 'rgba(232,224,255,0.9)'; ctx.fillRect(x + rng.range(4, 44), y - rng.range(2, 6), 1.5, 1.5); }
        break;
    }
  }
  draw(ctx, cam) {
    const m = this.map;
    this.frame++;
    this.secretMask(); // 비밀 통로가 드러났으면 해당 청크를 먼저 버린다
    const v = this.viewRect(cam);
    // 보이는 부분만 청크에서 바로 붙인다 (R1-REQ-330R). 화면 크기 층에 모아 붙이던 방식은 카메라가 움직일 때마다 층을 다시
    // 합성해야 해서(화면 두 장) 필살기·질주 중에 오히려 비쌌다 (s04 중간 필살기 CPU 10.0 → 7.3 ms/프레임, 질주 SSS ×1.3 → ×1.1)
    this.blitChunks(ctx, v);
    if (this.chunks.size > MAX_CHUNKS) this.evict();
    if (this.phaseList.length) this.drawPhase(ctx, cam);
    // 깊은 물: 개체 뒤쪽 몸통 (앞쪽 옅은 층과 수면선은 drawLiquid 가 개체 위에 그린다)
    if ((this.liquidKind ?? this.stage.liquid) === 'deep') {
      const info = this.liquidInfo('deep');
      if (info.count) this.liquidBody(ctx, cam, this.lastT, DEEP_UNDER, info);
    }
    // 방 밖(좌우)으로 이어지는 벽 표현: 방 경계 바깥을 어둡게
    ctx.fillStyle = '#050206';
    if (!m.openLeft) ctx.fillRect(-400, -400, 400, m.pxH + 800);
    if (!m.openRight) ctx.fillRect(m.pxW, -400, 400, m.pxH + 800);
  }
  /** 보이는 영역(v)과 겹치는 청크마다 fn(cx, cy) */
  eachVisible(v, fn) {
    const m = this.map, S = CHUNK * TILE;
    const x0 = Math.max(0, Math.floor(v.l / S)), x1 = Math.min(Math.floor((m.w - 1) / CHUNK), Math.floor(v.r / S));
    const y0 = Math.max(0, Math.floor(v.t / S)), y1 = Math.min(Math.floor((m.h - 1) / CHUNK), Math.floor(v.b / S));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) fn(cx, cy);
  }
  /**
   * 청크마다 보이는 부분만 복사한다: 필살기 줌·회전 중 768² 청크 전체를 변환해 그리면 화면 밖 텍셀까지 거르느라 느리다.
   * 가장자리는 화면 밖(여유 8px + 흔들림·회전)이라 이음매가 보이지 않는다
   */
  blitChunks(ctx, v) {
    const S = CHUNK * TILE;
    this.eachVisible(v, (cx, cy) => {
      const ox = cx * S, oy = cy * S;
      const sx = Math.max(0, Math.floor(v.l - ox)), sy = Math.max(0, Math.floor(v.t - oy));
      const sw = Math.min(S, Math.ceil(v.r - ox)) - sx, sh = Math.min(S, Math.ceil(v.b - oy)) - sy;
      if (sw <= 0 || sh <= 0) return;
      const c = this.chunk(cx, cy);
      if (sw === S && sh === S) ctx.drawImage(c, ox, oy);
      else ctx.drawImage(c, sx, sy, sw, sh, ox + sx, oy + sy, sw, sh);
    });
  }
  /** 이번 프레임에 보이는 월드 영역 {l,t,r,b}: 카메라 흔들림 오프셋과 화면 회전(회전한 화면을 덮는 사각형) + 여유 8px */
  viewRect(cam) {
    const zx = cam.x + (cam.shakeX || 0), zy = cam.y + (cam.shakeY || 0), vw = cam.vw, vh = cam.vh;
    let ex = 8, ey = 8;
    const rot = cam.rot || 0;
    if (rot) { const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot)); ex += (vw * c + vh * s - vw) / 2; ey += (vw * s + vh * c - vh) / 2; }
    const r = this._vr ??= { l: 0, t: 0, r: 0, b: 0 };
    r.l = zx - ex; r.t = zy - ey; r.r = zx + vw + ex; r.b = zy + vh + ey;
    return r;
  }
  /**
   * 위상 타일(거울 a/b · 심장 박동 z/Z) 중 지금 벽인 것만 그린다: 주 텍스처(청크와 같은 월드 정렬·배율) + 바탕색 + 윗면 띠 + 테두리.
   * 모든 칸을 경로 몇 개로 묶어 채우므로 프레임 비용이 작다. 유령 윤곽·혈관 등 기믹 표시는 기믹의 'back' 층이 덧그린다.
   */
  drawPhase(ctx, cam) {
    const m = this.map, S = TILE, st = this.style, tl = m.tiles;
    const L = cam.x - S, R = cam.x + cam.vw, U = cam.y - S, B = cam.y + cam.vh;
    const vis = this.phaseVis || (this.phaseVis = []);
    vis.length = 0;
    for (const p of this.phaseList) {
      const x = p.tx * S, y = p.ty * S;
      if (x < L || x > R || y < U || y > B || tl[p.idx] !== T.SOLID) continue;
      vis.push(p);
    }
    if (!vis.length) return;
    const solidAt = (tx, ty) => {
      if (tx < 0 || tx >= m.w || ty < 0 || ty >= m.h) return ty >= 0 && ty < m.h;
      const i = ty * m.w + tx, t = tl[i];
      return t === T.SOLID || t === T.BREAK || (t === T.FAKE && !m.revealed.has(i));
    };
    const pat = this.phasePattern(ctx);
    ctx.beginPath();
    for (const p of vis) ctx.rect(p.tx * S, p.ty * S, S, S);
    ctx.fillStyle = pat || st.base; ctx.fill();
    if (pat) { ctx.fillStyle = rgba(st.base, 0.45); ctx.fill(); }
    const top = this.topStrip();
    ctx.beginPath();
    for (const p of vis) {
      const x = p.tx * S, y = p.ty * S;
      if (!solidAt(p.tx, p.ty - 1)) ctx.drawImage(top, x, y);
      if (!solidAt(p.tx, p.ty + 1)) ctx.rect(x, y + S - 3, S, 3);
      if (!solidAt(p.tx - 1, p.ty)) ctx.rect(x, y, 3, S);
      if (!solidAt(p.tx + 1, p.ty)) ctx.rect(x + S - 3, y, 3, S);
    }
    ctx.fillStyle = rgba(st.edge, 0.9); ctx.fill();
  }
  /** 위상 타일용 주 텍스처 패턴 (월드 원점 정렬, 청크와 같은 0.75 배율 → 384px 주기로 이웃 벽과 무늬가 이어진다) */
  phasePattern(ctx) {
    const img = assets.get(this.stage.tex);
    if (!img) return null;
    if (this.patImg !== img) {
      this.patImg = img;
      this.pat = ctx.createPattern(img, 'repeat');
      if (this.pat && typeof DOMMatrix === 'function') this.pat.setTransform?.(new DOMMatrix().scaleSelf(0.75, 0.75));
    }
    return this.pat;
  }
  /**
   * 액체 분석 (타일이 바뀌거나 비밀 통로가 드러날 때만 다시 계산):
   *  liq  — 그릴 액체 칸 (물속에 놓인 마커 칸 포함, 드러나지 않은 비밀 공간 속 액체 제외)
   *  surf — 수면 칸 (위가 트인 칸: 액체도 벽도 아님 — 천장·벽에 닿은 물과 벽에서 쏟아지는 폭포 입구는 평평하게)
   *  fall — 폭포 칸: 폭 3칸 이하의 좁은 액체가 세로로 3칸 이상 이어진 기둥 (깊은 물은 헤엄치는 물길이라 폭포 없음,
   *         위가 트인 채 바닥에 얹힌 좁은 웅덩이도 폭포가 아님)
   *  falls — 폭포 기둥 [{ tx, y0, y1 }] (타일 행, 끝 포함), count — 액체 칸 수
   */
  liquidInfo(kind) {
    const m = this.map;
    const key = kind + ':' + m.version + ':' + m.revealed.size;
    if (this.liq && this.liq.key === key) return this.liq;
    const W = m.w, H = m.h, N = W * H, tl = m.tiles;
    const liq = new Uint8Array(N);
    let any = false;
    for (let i = 0; i < N; i++) if (tl[i] === T.LIQUID) { liq[i] = 1; any = true; }
    if (any) {
      // 물속 마커 칸 (위가 액체이거나 좌우가 모두 액체) — 위에서 아래로 훑어 겹친 마커도 메운다
      const wet = (m.markers || []).filter((mk) => WET_MARKERS.has(mk.ch) && tl[mk.ty * W + mk.tx] === T.EMPTY).sort((a, b) => a.ty - b.ty);
      for (const mk of wet) {
        const i = mk.ty * W + mk.tx;
        if ((mk.ty > 0 && liq[i - W]) || (mk.tx > 0 && mk.tx < W - 1 && liq[i - 1] && liq[i + 1])) liq[i] = 1;
      }
      const sec = this.secretMask(); // 드러나지 않은 비밀 방 속 액체는 벽으로 구워 두었으므로 그리지 않는다
      for (let i = 0; i < N; i++) if (sec[i]) liq[i] = 0;
    }
    const run = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (!liq[y * W + x]) { x++; continue; }
        let e = x;
        while (e < W && liq[y * W + e]) e++;
        const w = Math.min(255, e - x);
        for (let k = x; k < e; k++) run[y * W + k] = w;
        x = e;
      }
    }
    // 수면: 위가 트인 칸만 (벽·부서지는 벽·숨은 가짜 벽 바로 아래의 물은 천장에 닿은 물이라 물결 없이 평평하게)
    const surf = new Uint8Array(N);
    const sec = this.sec?.mask;
    let count = 0;
    for (let i = 0; i < N; i++) {
      if (!liq[i]) continue;
      count++;
      if (i < W) { surf[i] = 1; continue; }
      if (liq[i - W]) continue;
      const a = tl[i - W];
      surf[i] = a === T.SOLID || a === T.BREAK || (a === T.FAKE && !m.revealed.has(i - W)) || sec?.[i - W] ? 0 : 1;
    }
    const fall = new Uint8Array(N), falls = [];
    if (kind !== 'deep') {
      for (let x = 0; x < W; x++) {
        let y = 0;
        while (y < H) {
          const i = y * W + x;
          if (!liq[i] || run[i] > 3) { y++; continue; }
          let e = y;
          while (e < H && liq[e * W + x] && run[e * W + x] <= 3) e++;
          // 위가 트였고(수면) 바닥에 얹힌 좁은 기둥은 고인 웅덩이 (s08 r4) — 흐르지 않는다.
          // 폭포 = 벽에서 쏟아지거나(입구에 수면 없음) 방 위에서 내려오거나, 아래의 넓은 물·허공으로 떨어지는 기둥
          const pool = y > 0 && surf[i] && e < H && tl[e * W + x] !== T.EMPTY && !liq[e * W + x];
          if (e - y >= 3 && !pool) { for (let k = y; k < e; k++) fall[k * W + x] = 1; falls.push({ tx: x, y0: y, y1: e - 1 }); }
          y = e;
        }
      }
    }
    this.liq = { key, liq, surf, fall, falls, count };
    return this.liq;
  }
  /** 액체 몸통 채우기 (수면은 물결, 나머지는 행 단위 사각형으로 묶어 한 번에 채움) */
  liquidBody(ctx, cam, t, fill, info) {
    const m = this.map, W = m.w, S = TILE, { liq, surf } = info;
    const tx0 = Math.max(0, Math.floor(cam.x / S)), tx1 = Math.min(W - 1, Math.floor((cam.x + cam.vw) / S));
    const ty0 = Math.max(0, Math.floor(cam.y / S)), ty1 = Math.min(m.h - 1, Math.floor((cam.y + cam.vh) / S));
    const wave = (tx) => Math.sin(t * 3 + tx * 0.9) * 3;
    ctx.beginPath();
    for (let ty = ty0; ty <= ty1; ty++) {
      const row = ty * W, y = ty * S;
      let tx = tx0;
      while (tx <= tx1) {
        const i = row + tx;
        if (!liq[i]) { tx++; continue; }
        const s = surf[i];
        let e = tx;
        while (e < tx1 && liq[row + e + 1] && surf[row + e + 1] === s) e++;
        if (s) {
          ctx.moveTo(tx * S, y + 8 + wave(tx));
          for (let k = tx; k <= e; k++) ctx.quadraticCurveTo(k * S + 24, y + 4 - wave(k), (k + 1) * S, y + 8 + wave(k + 1));
          ctx.lineTo((e + 1) * S, y + S); ctx.lineTo(tx * S, y + S); ctx.closePath();
        } else ctx.rect(tx * S, y, (e - tx + 1) * S, S);
        tx = e + 1;
      }
    }
    ctx.fillStyle = fill; ctx.fill();
  }
  /** 액체 (물/용암/독/피/깊은 물) — 매 프레임 애니메이션. 몸통·수면선·반짝임·폭포를 종류별로 묶어 적은 호출로 그린다 */
  drawLiquid(ctx, cam, t, kind = 'water') {
    this.liquidKind = kind; this.lastT = t;
    const info = this.liquidInfo(kind);
    if (!info.count) return;
    const m = this.map, W = m.w, S = TILE, { liq, surf, fall } = info;
    const col = LIQUID[kind] || LIQUID.water, deep = kind === 'deep';
    this.liquidBody(ctx, cam, t, deep ? DEEP_FRONT : col[0], info);
    const tx0 = Math.max(0, Math.floor(cam.x / S)), tx1 = Math.min(W - 1, Math.floor((cam.x + cam.vw) / S));
    const ty0 = Math.max(0, Math.floor(cam.y / S)), ty1 = Math.min(m.h - 1, Math.floor((cam.y + cam.vh) / S));
    const wave = (tx) => Math.sin(t * 3 + tx * 0.9) * 3;
    // 수면선
    ctx.save();
    ctx.beginPath();
    for (let ty = ty0; ty <= ty1; ty++) {
      const row = ty * W, y = ty * S;
      let tx = tx0;
      while (tx <= tx1) {
        if (!surf[row + tx]) { tx++; continue; }
        let e = tx;
        while (e < tx1 && surf[row + e + 1]) e++;
        ctx.moveTo(tx * S, y + 8 + wave(tx));
        for (let k = tx; k <= e; k++) ctx.quadraticCurveTo(k * S + 24, y + 4 - wave(k), (k + 1) * S, y + 8 + wave(k + 1));
        tx = e + 1;
      }
    }
    ctx.strokeStyle = col[1]; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    // 넓은 물 속: 은은한 반짝임 (폭이 숨 쉬듯 변함). 깊은 물(방 전체가 물)은 칸마다 찍으면 격자 무늬로 보이므로
    // 해시로 고른 1/3 칸에만, 높이도 칸마다 흩어 찍는다
    ctx.beginPath();
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const i = ty * W + tx;
      if (!liq[i] || surf[i] || fall[i]) continue;
      const h = deep ? ((tx * 73856093) ^ (ty * 19349663)) >>> 0 : 0;
      if (deep && h % 3) continue;
      const k = 0.5 + 0.5 * Math.sin(t * 2 + tx * 1.7 + ty * 2.3);
      ctx.rect(tx * S + ((t * 20 + tx * 13) % 40), ty * S + 10 + (deep ? (h >>> 4) % 28 : (ty % 3) * 10), 3 + k * 6, 2);
    }
    ctx.globalAlpha = deep ? 0.12 : 0.09; ctx.fillStyle = col[1]; ctx.fill();
    if (info.falls.length) this.drawFalls(ctx, cam, t, info, col[1]);
    ctx.restore();
  }
  /**
   * 폭포: 좁은 세로 물줄기를 흘러내리는 줄무늬(점선 오프셋 애니메이션, 속도가 다른 3겹)로 그리고,
   * 양쪽 가장자리 광택, 벽에서 쏟아지는 입구의 테, 떨어지는 곳의 물보라를 얹는다. (ctx: 'lighter' 상태로 호출)
   */
  drawFalls(ctx, cam, t, info, glow) {
    const m = this.map, W = m.w, S = TILE, { fall, liq } = info;
    const L = cam.x - S, R = cam.x + cam.vw + S, U = cam.y - S, B = cam.y + cam.vh + S;
    const vis = [];
    for (const f of info.falls) {
      const x = f.tx * S;
      if (x < L || x > R || (f.y1 + 1) * S < U || f.y0 * S > B) continue;
      vis.push(f);
    }
    if (!vis.length) return;
    // 물줄기 광택: 가로 명암(가장자리 어둡고 굵은 빛줄기 몇 개)을 세로로 늘여 붙인다. 기둥마다 좌우를 바꿔 반복 티가 덜 나게
    const sheen = this.fallSheen(glow);
    ctx.globalAlpha = 0.55;
    for (const f of vis) ctx.drawImage(sheen, (f.tx & 1) * S, 0, S, 8, f.tx * S, f.y0 * S, S, (f.y1 - f.y0 + 1) * S);
    ctx.strokeStyle = glow;
    // 흐르는 줄무늬 3겹 (겹마다 길이·속도가 다르고, 레인 위치를 기둥마다 조금씩 흔들어 똑같아 보이지 않게)
    for (const L of FALL_FLOW) {
      ctx.beginPath();
      for (const lx of L.lanes) {
        for (const f of vis) {
          const x = f.tx * S + lx + Math.sin(f.tx * 3.1 + lx) * 2;
          ctx.moveTo(x, f.y0 * S); ctx.lineTo(x, (f.y1 + 1) * S);
        }
      }
      ctx.setLineDash(L.dash); ctx.lineDashOffset = -(t * L.speed) % (L.dash[0] + L.dash[1]);
      ctx.lineWidth = L.lw; ctx.globalAlpha = L.a; ctx.stroke();
    }
    ctx.setLineDash([]);
    // 가장자리 광택 (옆 칸이 폭포가 아닐 때만) + 벽에서 쏟아지는 입구의 테
    ctx.beginPath();
    for (const f of vis) {
      const x = f.tx * S;
      const lEdge = f.tx === 0 || !fall[f.y0 * W + f.tx - 1], rEdge = f.tx === W - 1 || !fall[f.y0 * W + f.tx + 1];
      if (lEdge) { ctx.moveTo(x + 1.5, f.y0 * S); ctx.lineTo(x + 1.5, (f.y1 + 1) * S); }
      if (rEdge) { ctx.moveTo(x + S - 1.5, f.y0 * S); ctx.lineTo(x + S - 1.5, (f.y1 + 1) * S); }
      if (!info.surf[f.y0 * W + f.tx]) { ctx.moveTo(x, f.y0 * S + 3); ctx.quadraticCurveTo(x + S / 2, f.y0 * S + 9, x + S, f.y0 * S + 3); }
    }
    ctx.lineWidth = 1.5; ctx.globalAlpha = 0.3; ctx.stroke();
    // 물보라: 떨어지는 곳(아래가 넓은 물이거나 바닥)에서 튀는 방울과 옅은 안개
    ctx.beginPath();
    const mist = [];
    for (const f of vis) {
      const below = f.y1 + 1 < m.h ? (f.y1 + 1) * W + f.tx : -1;
      if (below >= 0 && !liq[below] && m.tiles[below] === T.EMPTY) continue; // 허공으로 떨어짐: 물보라 없음
      const x = f.tx * S, yb = (f.y1 + 1) * S + (below >= 0 && liq[below] ? 8 : 0);
      mist.push(x, yb);
      for (let k = 0; k < 6; k++) {
        const bx = x + 4 + k * 8 + Math.sin(t * 9 + k * 1.3 + f.tx) * 2;
        const by = yb - 2 - Math.abs(Math.sin(t * 7 + k * 2.1 + f.tx * 0.7)) * 7;
        const r = 1.5 + (k % 2);
        ctx.moveTo(bx + r, by); ctx.arc(bx, by, r, 0, TAU);
      }
    }
    ctx.fillStyle = glow; ctx.globalAlpha = 0.4; ctx.fill();
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < mist.length; i += 2) ctx.fillRect(mist[i] - 6, mist[i + 1] - 12, S + 12, 12);
  }
  /** 배경 장식 문자 ('W' 창문, '|' 기둥) + 테마 소품 */
  drawDecor(ctx, cam, t) {
    if (!this.propsWarm) this.warmProps();   // 소품 이미지가 도착하는 대로 톤다운 사본을 모두 굽는다 (보이는 순간이 아니라)
    const openSky = OPEN_SKY_THEMES.has(this.stage.theme);
    for (const d of this.map.decor) {
      const x = d.tx * TILE, y = d.ty * TILE;
      if (x < cam.x - 200 || x > cam.x + cam.vw + 200) continue;
      if (d.ch === 'W') {
        if (openSky) continue;
        // 고딕 창문 (테마별 빛깔 — 기본 달빛): 창틀·유리·창살과 빛줄기를 스프라이트로 캐시해 그라데이션을 매 프레임 만들지 않는다
        const w = this.windowSprites();
        ctx.drawImage(w.win, x - 8, y - 12);
        const op = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(w.shaft, x, y);
        ctx.globalCompositeOperation = op;
      } else if (d.ch === '|') {
        if (y + TILE < cam.y || y > cam.y + cam.vh) continue;
        // 기둥 줄기의 위/아래 끝이면 주두/주초
        const spr = this.pillarSprite(), S = TILE;
        const top = !this.isBar(d.tx, d.ty - 1), bot = !this.isBar(d.tx, d.ty + 1);
        ctx.drawImage(spr, 0, top ? S : 0, S, S, x, y, S, S);
        if (bot) ctx.drawImage(spr, 0, S * 3 - 16, S, 16, x, y + S - 16, S, 16);
      }
    }
    // 테마 소품은 창문·기둥 위에 그린다 (기둥에 가려지지 않게)
    for (const p of this.props) {
      if (p.x + p.d.w < cam.x - 50 || p.x > cam.x + cam.vw + 50 || p.y + p.d.h < cam.y - 50 || p.y > cam.y + cam.vh + 50) continue;
      const c = this.darkProp(p.d.id, p.d.w, p.d.h, p.d.dim);
      if (c) ctx.drawImage(c, p.x, p.y);
    }
  }
  /** 폭포 광택 띠 (96×8 캐시: 왼쪽 48px = 기본, 오른쪽 48px = 좌우 반전) */
  fallSheen(glow) {
    if (this.sheen && this.sheenCol === glow) return this.sheen;
    const c = this.sheen || document.createElement('canvas');
    c.width = TILE * 2; c.height = 8;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    for (let x = 0; x < TILE; x++) {
      const u = x / (TILE - 1);
      const edge = Math.min(1, Math.min(u, 1 - u) * 6);          // 가장자리로 갈수록 옅게
      const band = Math.pow(Math.max(0, Math.sin(x * 0.33 + 0.6)), 4) * 0.55 + Math.pow(Math.max(0, Math.sin(x * 0.81 + 2.1)), 8) * 0.45;
      const a = Math.min(1, (0.18 + band) * edge);
      g.fillStyle = rgba(glow, a);
      g.fillRect(x, 0, 1, 8); g.fillRect(TILE * 2 - 1 - x, 0, 1, 8);
    }
    this.sheen = c; this.sheenCol = glow;
    return c;
  }
  /** 'W' 창문 스프라이트 (캐시): win = 창틀·유리·창살 (원점 = 창문 칸 좌상단 −8, −12), shaft = 비스듬한 빛줄기 (원점 = 칸 좌상단) */
  windowSprites() {
    if (this.winSpr) return this.winSpr;
    const tint = WINDOW_TINT[this.stage.theme] || WINDOW_MOON;
    const win = document.createElement('canvas');
    win.width = 66; win.height = 110;
    let g = win.getContext('2d');
    g.translate(8, 12); // 창문 칸 좌상단 = (0,0)
    g.fillStyle = '#0a0610';
    g.beginPath(); g.moveTo(-8, 96); g.lineTo(-8, 20); g.arc(24, 20, 32, Math.PI, 0); g.lineTo(56, 96); g.fill();
    const gl = g.createLinearGradient(0, -10, 0, 90);
    gl.addColorStop(0, tint[0]); gl.addColorStop(1, tint[1]);
    g.fillStyle = gl;
    g.beginPath(); g.moveTo(0, 90); g.lineTo(0, 20); g.arc(24, 20, 24, Math.PI, 0); g.lineTo(48, 90); g.fill();
    g.strokeStyle = '#140c18'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(24, -4); g.lineTo(24, 90); g.moveTo(0, 40); g.lineTo(48, 40); g.stroke();
    const shaft = document.createElement('canvas');
    shaft.width = 184; shaft.height = 284;
    g = shaft.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 120, 260);
    lg.addColorStop(0, tint[2]); lg.addColorStop(1, tint[2].replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = lg; g.beginPath(); g.moveTo(0, 20); g.lineTo(48, 20); g.lineTo(180, 280); g.lineTo(80, 280); g.fill();
    this.winSpr = { win, shaft };
    return this.winSpr;
  }
  isBar(tx, ty) {
    if (!this.barSet) this.barSet = new Set(this.map.decor.filter((d) => d.ch === '|').map((d) => d.ty * this.map.w + d.tx));
    return tx >= 0 && tx < this.map.w && this.barSet.has(ty * this.map.w + tx);
  }
  /**
   * '|' 장식 기둥 스프라이트 (캐시): 타일 스타일 색으로 원통 음영을 준 세로 홈 기둥.
   * 세로 3칸 = [0] 몸통, [1] 주두(윗끝), [2] 주초(아랫끝). 배경 요소라 전체를 한 톤 눌러 둔다.
   */
  pillarSprite() {
    if (this.pillarCanvas) return this.pillarCanvas;
    const st = this.style, S = TILE;
    const c = document.createElement('canvas');
    c.width = S; c.height = S * 3;
    const g = c.getContext('2d');
    const dark = st.edge, body = mix(st.base, st.top, 0.3), lit = mix(st.base, st.top, 0.75);
    const hgrad = (x0, x1) => {
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, dark); gr.addColorStop(0.28, lit); gr.addColorStop(0.6, body); gr.addColorStop(1, dark);
      return gr;
    };
    const shaft = (y0, h) => {
      g.fillStyle = hgrad(9, 39); g.fillRect(9, y0, 30, h);
      // 세로 홈 (어두운 홈 + 옆의 가는 반사광)
      for (const fx of [15, 21, 27, 33]) {
        g.fillStyle = rgba(st.edge, 0.5); g.fillRect(fx, y0, 2, h);
        g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(fx + 2, y0, 1, h);
      }
    };
    // [0] 몸통
    shaft(0, S);
    // [1] 주두: 몸통 위에 넓은 판(아바쿠스) + 둥근 받침(에키누스) + 그 아래 그림자
    shaft(S, S);
    g.fillStyle = hgrad(4, 44);
    g.beginPath(); g.moveTo(5, S + 9); g.lineTo(43, S + 9); g.lineTo(38, S + 17); g.lineTo(10, S + 17); g.fill();
    g.fillStyle = hgrad(1, 47); g.fillRect(1, S, 46, 9);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(1, S + 8, 46, 1);
    g.fillStyle = rgba(st.edge, 0.9); g.fillRect(1, S, 46, 2); g.fillRect(10, S + 17, 28, 1);
    const sh = g.createLinearGradient(0, S + 17, 0, S + 30);
    sh.addColorStop(0, 'rgba(0,0,0,0.4)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(9, S + 17, 30, 13);
    // [2] 주초: 둥근 테(토루스) + 넓은 받침돌(플린스) — 아래 16px 만 잘라 몸통 끝에 덧그린다
    shaft(S * 2, S);
    const by = S * 3 - 16;
    g.fillStyle = hgrad(6, 42); g.fillRect(6, by, 36, 6);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(6, by, 36, 1);
    g.fillStyle = hgrad(2, 46); g.fillRect(2, by + 6, 44, 10);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(2, by + 6, 44, 1);
    g.fillStyle = rgba(st.edge, 0.9); g.fillRect(2, S * 3 - 2, 44, 2);
    // 배경 톤으로 눌러 게임 레이어(벽/발판)와 구분
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = rgba(st.edge, 0.25); g.fillRect(0, 0, S, S * 3);
    this.pillarCanvas = c;
    return c;
  }
}
