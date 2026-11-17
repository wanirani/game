// 시범판 A — 세계 모델 · 저작 형식 · 자동 검증 (docs/v2/proto_a.md §1)
// 세계 = 축에 나란한 '판(slab)' 목록. 판 = { x0,x1, z0,z1, top(윗면 높이), base(옆면이 내려가는 높이), kind, mat, walk }
//   kind 'floor' = 걷는 바닥(계단 포함) · 'block' = 바닥 위에 솟은 덩어리(단상·상자·기둥 발) · 'wall' = 벽(오를 수 없음)
//   구덩이 = 바닥에 뚫린 구멍 + 바닥판(top = PIT_Y). 땅 높이 = 그 점을 덮는 판 가운데 가장 높은 top.
// 저작은 StageBuilder 의 낱말 몇 개로 한다: floor / block / wall / stairs / pit / prop / spawn / section.
//   → 한 스테이지 = 50–100 줄 데이터. 이 파일은 DOM 을 쓰지 않으므로 node 에서도 그대로 읽어 검증한다 (tools/v2/proto_a_check.mjs).

export const PIT_Y = -230;       // 구덩이 바닥
export const WALL = 9999;        // 걸을 수 없는 곳의 '땅 높이'
export const STEP_UP = 14;       // 걸어서 오를 수 있는 턱
export const JUMP_UP = 128;      // 점프로 오를 수 있는 턱 (검증용; 영웅 점프 높이 ≈ 141)

let SID = 0;
function slab(kind, x0, x1, z0, z1, top, mat, o = {}) {
  return { id: ++SID, kind, x0, x1, z0, z1, top, base: o.base ?? (kind === 'floor' ? top - 250 : 0), mat: mat || 'cobble',
    walk: o.walk !== false && kind !== 'wall', hidden: !!o.hidden, cutIn: o.cutIn || null, cutK: 0, pit: !!o.pit, tag: o.tag || null,
    segF: [], segL: [], segR: [], floorY: 0, deco: o.deco || null };
}

/** 사각형 [x0,x1,z0,z1] 에서 구멍들을 뺀 나머지를 사각형 목록으로 */
function subtract(rects, hole) {
  const out = [];
  for (const r of rects) {
    const [x0, x1, z0, z1] = r, [hx0, hx1, hz0, hz1] = hole;
    if (hx1 <= x0 || hx0 >= x1 || hz1 <= z0 || hz0 >= z1) { out.push(r); continue; }
    if (hz0 > z0) out.push([x0, x1, z0, hz0]);                                   // 앞 띠
    if (hz1 < z1) out.push([x0, x1, hz1, z1]);                                   // 뒤 띠
    const a = Math.max(z0, hz0), b = Math.min(z1, hz1);
    if (hx0 > x0) out.push([x0, hx0, a, b]);                                     // 왼쪽
    if (hx1 < x1) out.push([hx1, x1, a, b]);                                     // 오른쪽
  }
  return out;
}

export class StageBuilder {
  constructor(id) { this.id = id; this.slabs = []; this.props = []; this.spawns = []; this.sections = []; this.pits = []; this.start = { x: 0, z: 0 }; this.fog = '#2a1626'; }
  /** 걷는 바닥. o.holes = [[x0,x1,z0,z1]…] (구덩이), o.walk=false 면 보이기만 하는 바닥 */
  floor(x0, x1, z0, z1, top, mat, o = {}) {
    let rects = [[x0, x1, z0, z1]];
    for (const h of o.holes || []) rects = subtract(rects, h);
    for (const r of rects) this.slabs.push(slab('floor', r[0], r[1], r[2], r[3], top, mat, o));
    return this;
  }
  /** 구덩이: 바닥에 낸 구멍 자리에 바닥판을 깐다 (빠지면 가장자리에서 다시 시작) */
  pit(x0, x1, z0, z1, mat = 'pit') {
    this.slabs.push(slab('floor', x0, x1, z0, z1, PIT_Y, mat, { pit: true, base: PIT_Y - 10 }));
    this.pits.push({ x0, x1, z0, z1 });
    return this;
  }
  block(x0, x1, z0, z1, top, mat, o = {}) { this.slabs.push(slab('block', x0, x1, z0, z1, top, mat, o)); return this; }
  wall(x0, x1, z0, z1, top, mat, o = {}) { this.slabs.push(slab('wall', x0, x1, z0, z1, top, mat, o)); return this; }
  /** 계단: axis 'x' | 'z' 방향으로 from → to 높이. kind 'floor'(길의 일부) | 'block'(바닥 위 구조물) */
  stairs({ x0, x1, z0, z1, from, to, steps, axis = 'z', kind = 'floor', mat = 'flag' }) {
    for (let i = 0; i < steps; i++) {
      const a = i / steps, b = (i + 1) / steps, top = from + (to - from) * b;
      const s = axis === 'z' ? slab(kind, x0, x1, z0 + (z1 - z0) * a, z0 + (z1 - z0) * b, top, mat, { base: kind === 'floor' ? Math.min(from, to) - 20 : 0 })
        : slab(kind, x0 + (x1 - x0) * a, x0 + (x1 - x0) * b, z0, z1, top, mat, { base: kind === 'floor' ? Math.min(from, to) - 20 : 0 });
      s.tag = 'step';
      this.slabs.push(s);
    }
    return this;
  }
  /** 소품(그림 한 장 = 빌보드). o.block = [반폭 x, 반폭 z] 면 지나갈 수 없는 발 자리를 함께 만든다 */
  prop(kind, x, z, o = {}) {
    const p = { kind, x, z, y: o.y ?? null, scale: o.scale ?? 1, flip: !!o.flip, light: o.light || null, hideIn: o.hideIn || null, hideK: 0 };
    this.props.push(p);
    if (o.block) this.slabs.push(slab('block', x - o.block[0], x + o.block[0], z - o.block[1], z + o.block[1], WALL, 'none', { hidden: true }));
    return this;
  }
  spawn(kind, x, z, o = {}) { this.spawns.push({ kind, x, z, group: o.group || 'path', y: o.y ?? 0 }); return this; }
  section(id, x0, x1, z0, z1, o = {}) { this.sections.push({ id, x0, x1, z0, z1, ...o }); return this; }
  build() { return new Stage(this); }
}

export class Stage {
  constructor(b) {
    this.id = b.id; this.slabs = b.slabs; this.props = b.props; this.spawns = b.spawns; this.sections = b.sections; this.pits = b.pits;
    this.start = b.start; this.fog = b.fog;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const s of this.slabs) { if (s.hidden) continue; x0 = Math.min(x0, s.x0); x1 = Math.max(x1, s.x1); z0 = Math.min(z0, s.z0); z1 = Math.max(z1, s.z1); }
    this.bounds = { x0, x1, z0, z1 };
    for (const s of this.slabs) this._exposure(s);
    // 소품의 땅 높이
    for (const p of this.props) if (p.y === null) { const g = this.topAt(p.x, p.z, true); p.y = g > WALL / 2 || g <= PIT_Y ? 0 : g; }
    // 그리기용 묶음: 바닥은 (높이, 재질) 별로, 솟은 것은 따로
    const groups = new Map();
    for (const s of this.slabs) {
      if (s.kind !== 'floor' || s.hidden) continue;
      const k = s.top + '|' + s.mat;
      if (!groups.has(k)) groups.set(k, { top: s.top, mat: s.mat, slabs: [] });
      groups.get(k).slabs.push(s);
    }
    this.floorGroups = [...groups.values()].sort((a, b) => a.top - b.top);
    this.solids = this.slabs.filter((s) => s.kind !== 'floor' && !s.hidden);
  }
  /**
   * 보이는 옆면 조각 만들기. 이웃 판의 경계에서 면을 잘라, 조각마다 '바깥 이웃의 윗면'까지만 내려가게 한다
   * (→ 면이 앞의 바닥을 덮어 그리는 일이 없다 = 화가 알고리즘이 맞는다). 이웃이 같거나 더 높으면 그 조각은 없다.
   * segF = 앞면(z = z0) [{a,b(x 범위), base}] · segL = 왼면(x = x0) · segR = 오른면(x = x1) [{a,b(z 범위), base}]
   */
  _exposure(s) {
    const out = (x, z) => { let t = -Infinity; for (const o of this.slabs) if (o !== s && !o.hidden && x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && o.top > t) t = o.top; return t; };
    const cuts = (lo, hi, ka, kb) => { const c = [lo, hi]; for (const o of this.slabs) { if (o === s || o.hidden) continue; if (o[ka] > lo && o[ka] < hi) c.push(o[ka]); if (o[kb] > lo && o[kb] < hi) c.push(o[kb]); } return [...new Set(c)].sort((p, q) => p - q); };
    // 솟은 판(block·wall)은 '딛고 선 바닥'보다 아래로 내려가지 않는다 (구덩이 옆 건물의 벽이 구덩이 속까지 내려가지 않게)
    const under = (x, z) => { let t = -Infinity; for (const o of this.slabs) if (o !== s && !o.hidden && o.top < s.top && x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && o.top > t) t = o.top; return t; };
    const segs = (c, probe, inside) => {
      const r = [];
      for (let i = 0; i + 1 < c.length; i++) {
        const m = (c[i] + c[i + 1]) / 2;
        let h = probe(m);
        if (h >= s.top - 0.01) continue;
        if (s.kind !== 'floor') h = Math.max(h, inside(m));
        const base = h > -Infinity ? h : (s.kind === 'floor' ? s.top - 250 : Math.min(0, s.top - 250));
        const last = r[r.length - 1];
        if (last && last.b === c[i] && last.base === base) last.b = c[i + 1]; else r.push({ a: c[i], b: c[i + 1], base });
      }
      return r;
    };
    const cx = cuts(s.x0, s.x1, 'x0', 'x1'), cz = cuts(s.z0, s.z1, 'z0', 'z1');
    s.segF = segs(cx, (x) => out(x, s.z0 - 0.5), (x) => under(x, s.z0 + 0.5));
    s.segL = segs(cz, (z) => out(s.x0 - 0.5, z), (z) => under(s.x0 + 0.5, z));
    s.segR = segs(cz, (z) => out(s.x1 + 0.5, z), (z) => under(s.x1 - 0.5, z));
    let lo = s.top; for (const g of [...s.segF, ...s.segL, ...s.segR]) lo = Math.min(lo, g.base);
    s.floorY = s.kind === 'floor' ? s.top : (lo < s.top ? lo : 0);   // 솟은 판이 서 있는 바닥 높이
  }
  /** 실제 윗면 높이 (그림자·소품용). solid=true 면 숨은 막이(hidden)는 무시 */
  topAt(x, z, solid = false) {
    let t = -Infinity;
    for (const s of this.slabs) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && s.top > t && !(solid && s.hidden)) t = s.top;
    return t;
  }
  /** 걷기용 땅 높이: 벽·막이·걸을 수 없는 바닥은 WALL, 아무것도 없으면 −∞ */
  walkAt(x, z) {
    let t = -Infinity;
    for (const s of this.slabs) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) { const h = s.walk ? s.top : WALL; if (h > t) t = h; }
    return t;
  }
  /** 발 자리(반폭 r × rz)의 땅 높이 = 다섯 점 가운데 가장 높은 곳 */
  footGround(x, z, r = 12, rz = 7) {
    return Math.max(this.walkAt(x, z), this.walkAt(x - r, z - rz), this.walkAt(x + r, z - rz), this.walkAt(x - r, z + rz), this.walkAt(x + r, z + rz));
  }
  sectionAt(x, z, strict = false) {
    for (const s of this.sections) if (x >= s.x0 && x < s.x1 && z >= s.z0 && z < s.z1) return s;
    return strict ? null : this.sections[this.sections.length - 1];
  }
  pitAt(x, z) { for (const p of this.pits) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return p; return null; }

  /**
   * 자동 검증 (스테이지 60개를 사람이 눈으로 보지 않아도 되게):
   *  1 판 모양 · 2 바닥끼리 겹침(높이가 다르면 오류) · 3 시작점에서 걸어서(턱 ≤ STEP_UP) 모든 구간에 닿는가
   *  4 점프까지 쓰면 모든 적 자리에 닿는가 · 5 적 자리가 벽·구덩이가 아닌가 · 6 구덩이마다 돌아갈 길이 있는가(3 이 보장)
   *  7 그리기 규칙: 걷는 바닥보다 높은 '바닥' 판이 그 앞(카메라 쪽)에 붙어 있으면 뒤의 캐릭터를 가리지 못한다 → block 으로 쓰라고 알림
   */
  validate() {
    const errors = [], warnings = [];
    for (const s of this.slabs) if (!(s.x1 > s.x0 && s.z1 > s.z0)) errors.push(`slab ${s.id}: 크기가 0 이하`);
    const floors = this.slabs.filter((s) => s.kind === 'floor' && s.walk);
    for (let i = 0; i < floors.length; i++) for (let j = i + 1; j < floors.length; j++) {
      const a = floors[i], b = floors[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (ox > 0.5 && oz > 0.5 && a.top !== b.top) errors.push(`바닥 ${a.id}·${b.id} 가 겹치는데 높이가 다르다 (${a.top} / ${b.top})`);
    }
    // 도달성 (격자 20)
    const C = 20, B = this.bounds, nx = Math.ceil((B.x1 - B.x0) / C), nz = Math.ceil((B.z1 - B.z0) / C);
    const H = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = this.footGround(B.x0 + (i + 0.5) * C, B.z0 + (j + 0.5) * C, 9, 6);
    const flood = (up) => {
      const seen = new Uint8Array(nx * nz), q = [];
      const si = Math.floor((this.start.x - B.x0) / C), sj = Math.floor((this.start.z - B.z0) / C);
      if (si < 0 || sj < 0 || si >= nx || sj >= nz) return seen;
      seen[sj * nx + si] = 1; q.push(sj * nx + si);
      while (q.length) {
        const c = q.pop(), ci = c % nx, cj = (c - ci) / nx, h = H[c];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
          const n = j * nx + i, g = H[n];
          if (seen[n] || g > WALL / 2 || g <= PIT_Y + 1 || g - h > up) continue;
          seen[n] = 1; q.push(n);
        }
      }
      return seen;
    };
    const walk = flood(STEP_UP), jump = flood(JUMP_UP);
    const at = (seen, x, z) => { const i = Math.floor((x - B.x0) / C), j = Math.floor((z - B.z0) / C); return i >= 0 && j >= 0 && i < nx && j < nz && seen[j * nx + i] === 1; };
    const sg = this.walkAt(this.start.x, this.start.z);
    if (!(sg > PIT_Y && sg < WALL / 2)) errors.push('시작점이 걸을 수 있는 땅이 아니다');
    for (const s of this.sections) {
      const cx = s.tx ?? (s.x0 + s.x1) / 2, cz = s.tz ?? (s.z0 + s.z1) / 2;
      if (!at(walk, cx, cz)) errors.push(`구간 '${s.id}' 의 들어가는 점 (${cx},${cz}) 에 걸어서 닿을 수 없다`);
    }
    for (const sp of this.spawns) {
      const g = this.walkAt(sp.x, sp.z);
      if (g > WALL / 2 || g <= PIT_Y) { if (!(sp.y > 0 && g <= PIT_Y)) errors.push(`적 ${sp.kind} (${sp.x},${sp.z}) 가 벽 속이다`); }
      else if (!at(jump, sp.x, sp.z)) errors.push(`적 ${sp.kind} (${sp.x},${sp.z}) 에 닿을 수 없다`);
    }
    for (const f of floors) {
      for (let k = 0; k < 5; k++) {
        const x = f.x0 + (f.x1 - f.x0) * (k + 0.5) / 5, g = this.walkAt(x, f.z1 + 6);
        if (g > PIT_Y + 1 && g < f.top - STEP_UP - 1 && at(jump, x, f.z1 + 6)) { warnings.push(`바닥 ${f.id} (top ${f.top}) 뒤에 더 낮은 걷는 땅 (${g}) — 가림이 필요하면 block 으로`); break; }
      }
    }
    let reach = 0; for (let i = 0; i < walk.length; i++) reach += walk[i];
    return { errors, warnings, stats: { slabs: this.slabs.length, props: this.props.length, spawns: this.spawns.length, walkArea: reach * C * C } };
  }
}

// ───────────────────────── SLICE0 (docs/v2/SLICE0.md §1) ─────────────────────────
export const SLICE0 = { streetLen: 2400, streetDepth: 260, alleyX0: 1980, alleyX1: 2400, alleyZ0: 330, alleyZ1: 1560, yardX0: 1740, yardX1: 2640, yardZ1: 2160, up: 96 };

export function buildSlice0() {
  SID = 0;
  const b = new StageBuilder('slice0');
  const U = SLICE0.up;
  b.start = { x: 150, z: 120 };
  // ── 1. 거리 (횡): x 0–2400 · 걷는 깊이 z 0–260 ──
  b.floor(-400, 2880, -330, 0, 0, 'kerb', { walk: false });                         // 화면 앞쪽 갓길 (걷지 않음, 앞 소품 자리)
  b.floor(-400, 2880, 0, 330, 0, 'cobble', { holes: [[1500, 1680, 130, 260]] });    // 거리 + 건물 밑
  b.pit(1500, 1680, 130, 260);                                                      // 구덩이: 깊이의 뒤쪽 절반
  b.wall(-400, 0, -330, 330, 430, 'brick');                                         // 왼쪽 끝
  // 뒤쪽 건물 (사이사이 틈으로 먼 배경이 보인다)
  b.wall(0, 318, 260, 330, 400, 'brick', { deco: 'house' });
  b.wall(336, 700, 260, 330, 470, 'brick2', { deco: 'house' });
  b.wall(700, 1120, 260, 330, 380, 'brick', { deco: 'house' });
  b.wall(1138, 1480, 260, 330, 450, 'brick2', { deco: 'house' });
  b.wall(1480, 1700, 260, 330, 360, 'brick', { deco: 'house' });
  b.wall(1718, 1980, 260, 330, 440, 'brick2', { deco: 'house' });
  // 가림 확인용 기둥 2개 (뒤로도 앞으로도 지나간다) + 가로등
  b.prop('pillar', 430, 132, { block: [20, 13] });
  b.prop('pillar', 1890, 150, { block: [20, 13] });
  b.prop('lamp', 250, 236, { block: [8, 6], light: '#ffb060' });
  b.prop('lamp', 1210, 240, { block: [8, 6], light: '#ffb060' });
  b.prop('lamp', 640, -46, { light: '#ffb060' });                                   // 화면 앞쪽 (영웅을 가린다)
  b.prop('lamp', 1760, -52, { light: '#ffb060' });
  b.prop('fence', 980, -70); b.prop('fence', 1172, -70); b.prop('cart', 2060, -86); b.prop('haybale', 330, -64); b.prop('barrel', 1420, -40);
  b.prop('well', 590, 222, { block: [56, 26] }); b.prop('barrel', 80, 236, { block: [26, 14] }); b.prop('barrel', 1100, 232, { block: [26, 14] });
  // 돌 단상 300×120×72 + 왼쪽 계단 (나머지는 점프)
  b.block(760, 1060, 140, 260, 72, 'stone');
  b.stairs({ x0: 676, x1: 760, z0: 150, z1: 260, from: 0, to: 72, steps: 6, axis: 'x', kind: 'block', mat: 'stone' });
  // 상자 (돌아서 지나가거나 뛰어오른다)
  b.block(1250, 1326, 84, 148, 58, 'wood', { tag: 'crate' });
  // ── 2. 모퉁이 + 3. 골목 (종): x 1980–2400 · z 330–1560, 중간에 계단 z 200 동안 +96 ──
  b.wall(2400, 2880, -330, 1500, 520, 'brick', { cutIn: ['yard'] });                // 거리 오른쪽 끝 = 골목 오른쪽 벽
  b.wall(1560, 1980, 330, 1500, 500, 'brick2', { cutIn: ['yard'] });                 // 골목 왼쪽 벽
  b.floor(1980, 2400, 330, 560, 0, 'flag');
  b.stairs({ x0: 1980, x1: 2400, z0: 560, z1: 760, from: 0, to: U, steps: 8, axis: 'z', kind: 'floor', mat: 'flag' });
  b.floor(1980, 2400, 760, 1560, U, 'flag');
  b.prop('torch', 1984, 470, { y: 96, light: '#ff8a3a' }); b.prop('torch', 2396, 470, { y: 96, light: '#ff8a3a', flip: true });
  b.prop('torch', 1984, 900, { y: U + 96, light: '#ff8a3a', hideIn: ['yard'] }); b.prop('torch', 2396, 900, { y: U + 96, light: '#ff8a3a', flip: true, hideIn: ['yard'] });
  b.prop('torch', 1984, 1300, { y: U + 96, light: '#ff8a3a', hideIn: ['yard'] }); b.prop('torch', 2396, 1300, { y: U + 96, light: '#ff8a3a', flip: true, hideIn: ['yard'] });
  b.prop('barrel', 2022, 410, { block: [26, 14] }); b.prop('crateP', 2356, 520, { block: [30, 18] });
  b.prop('barrel', 2360, 880, { block: [26, 14] }); b.prop('crateP', 2026, 1090, { block: [30, 18] }); b.prop('barrel', 2362, 1250, { block: [26, 14] });
  b.prop('banner', 2010, 1480, { y: U + 150, hideIn: ['yard'] }); b.prop('banner', 2370, 1480, { y: U + 150, hideIn: ['yard'] });
  // ── 4. 마당 900×600 ──
  b.floor(1740, 2640, 1560, 2160, U, 'cobble');
  b.floor(1560, 1740, 1500, 2230, U, 'kerb', { walk: false }); b.floor(2640, 2880, 1500, 2230, U, 'kerb', { walk: false });
  b.wall(1560, 2880, 2160, 2230, U + 400, 'brick', { deco: 'house' });              // 뒤 담
  b.wall(1560, 1740, 1560, 2160, U + 300, 'brick2');                                 // 왼 담
  b.wall(2640, 2880, 1560, 2160, U + 300, 'brick2');                                 // 오른 담
  b.wall(1740, 1980, 1500, 1560, U + 26, 'stone');                                  // 앞 담 (낮게 잘라 안이 보이게)
  b.wall(2400, 2640, 1500, 1560, U + 26, 'stone');
  b.prop('brazier', 1800, 2110, { block: [22, 14], light: '#ff7a2a' }); b.prop('brazier', 2580, 2110, { block: [22, 14], light: '#ff7a2a' });
  b.prop('statue', 2190, 2120, { block: [36, 20] }); b.prop('tree', 1830, 1660, { block: [14, 10] }); b.prop('well', 2540, 1680, { block: [56, 26] });
  // 구간 (먼저 맞는 것이 이긴다). tx,tz = teleport·검증용 들어가는 점
  b.section('yard', 1560, 2880, 1560, 2300, { tx: 2190, tz: 1640 });
  b.section('alley', 1980, 2400, 330, 1560, { tx: 2190, tz: 420 });
  b.section('corner', 1940, 2400, -400, 330, { tx: 2190, tz: 150 });
  b.section('street', -400, 1940, -400, 330, { tx: 150, tz: 120 });
  // 적: 길 12 (근접 8 · 원거리 4) + 마당 5
  b.spawn('skeleton', 560, 110); b.spawn('bat', 820, 60, { y: 62 }); b.spawn('skeleton', 930, 200); b.spawn('skeleton', 1160, 60);
  b.spawn('bat', 1590, 190, { y: 70 }); b.spawn('skeleton', 1800, 80); b.spawn('skeleton', 2130, 190);
  b.spawn('skeleton', 2150, 500); b.spawn('bat', 2290, 880, { y: 64 }); b.spawn('skeleton', 2110, 1010); b.spawn('skeleton', 2290, 1230); b.spawn('bat', 2170, 1400, { y: 66 });
  b.spawn('skeleton', 1960, 1800, { group: 'yard' }); b.spawn('skeleton', 2190, 1940, { group: 'yard' }); b.spawn('skeleton', 2420, 1800, { group: 'yard' });
  b.spawn('bat', 2010, 2040, { group: 'yard', y: 66 }); b.spawn('bat', 2380, 2040, { group: 'yard', y: 66 });
  return b.build();
}
