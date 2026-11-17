// 시범판 B — 세계 모델 (순수 JS: DOM·GL 없음 → node 검사 스크립트가 그대로 import 한다). docs/v2/proto_b.md §1
//
// 스테이지 = "상자 세계". 저작 데이터(stage_*.js)의 parts 를 compileStage 가 세 가지로 바꾼다:
//   boxes   충돌용 축 정렬 상자 {x0,x1,z0,z1,y0,y1} — 윗면은 밟는 곳, 옆면은 벽 (계단 = 계단참 상자 여러 개)
//   mesh    재질별 삼각형 (위치 3f · uv 2f · 구운 빛 색 4ub · 부가 4ub = 28바이트/정점) — glr.js 가 그대로 올린다
//   sprites 소품 빌보드 · 빛 번짐 · 창문 (정적 스프라이트 목록)
// 좌표: x 오른쪽, z 화면 안쪽, y 위 (docs/v2/README.md §4). 단위 = 논리 px.
// 카메라는 늘 +z 쪽을 보므로(요 ±25° 안) 상자의 뒷면(+z)·밑면은 만들지 않는다.

export const STEP_UP = 18;     // 걸어서 오르는 턱
export const STEP_DOWN = 20;   // 걸어서 내려가는 턱 (넘으면 떨어진다)
export const JUMP_UP = 100;    // 점프로 오르는 높이 (검증용; sim.js 의 점프 정점보다 조금 낮게)
const CELL = 64;               // 빛을 굽는 격자 (면을 이 크기로 쪼갠다)
export const VERT_BYTES = 28;

/** 재질 → 텍스처 키 · 타일 크기(월드 단위) · 색 */
export const MATS = {
  cobble: { tex: 'flag', tile: 240, tint: [0.74, 0.76, 0.9] },
  stone: { tex: 'block', tile: 256, tint: [0.88, 0.88, 0.98] },
  facade: { tex: 'brick', tile: 210, tint: [0.8, 0.76, 0.86] },
  plaster: { tex: 'brick', tile: 290, tint: [1.0, 0.84, 0.74] },
  wood: { tex: 'wood', tile: 128, tint: [1.25, 1.05, 0.9] },
  dirt: { tex: 'dirt', tile: 340, tint: [1.05, 0.98, 0.95] },
  roof: { tex: 'wood', tile: 150, tint: [0.62, 0.5, 0.62] },
};

class MeshWriter {
  constructor() { this.cap = 4096; this.n = 0; this.buf = new ArrayBuffer(this.cap * VERT_BYTES); this.f = new Float32Array(this.buf); this.u = new Uint8Array(this.buf); }
  grow() {
    const nb = new ArrayBuffer(this.cap * 2 * VERT_BYTES); new Uint8Array(nb).set(this.u);
    this.cap *= 2; this.buf = nb; this.f = new Float32Array(nb); this.u = new Uint8Array(nb);
  }
  vert(x, y, z, u, v, r, g, b) {
    if (this.n >= this.cap) this.grow();
    const o = this.n * 7, c = this.n * VERT_BYTES + 20;
    this.f[o] = x; this.f[o + 1] = y; this.f[o + 2] = z; this.f[o + 3] = u; this.f[o + 4] = v;
    const q = (k) => Math.max(0, Math.min(255, Math.round(k * 127.5)));
    this.u[c] = q(r); this.u[c + 1] = q(g); this.u[c + 2] = q(b); this.u[c + 3] = 128;
    this.u[c + 4] = 255; this.u[c + 5] = 0; this.u[c + 6] = 0; this.u[c + 7] = 255;   // 보통 · 번쩍임 0 · 깊이 당김 0 · 안개 100%
    this.n++;
  }
  done() { return { data: this.buf.slice(0, this.n * VERT_BYTES), count: this.n }; }
}

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 한 점의 빛 (구울 때·캐릭터 색조에 같이 쓴다). n 이 없으면 법선 무시 (캐릭터) */
export function lightAt(W, x, y, z, nx = 0, ny = 0, nz = 0) {
  const L = W.light, hasN = nx || ny || nz;
  const nd = hasN ? Math.max(0, nx * L.moonDir[0] + ny * L.moonDir[1] + nz * L.moonDir[2]) : 0.55;
  let r = L.ambient[0] + L.moon[0] * nd, g = L.ambient[1] + L.moon[1] * nd, b = L.ambient[2] + L.moon[2] * nd;
  for (const p of W.lights) {
    const dx = p.x - x, dy = p.y - y, dz = p.z - z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > p.r * p.r) continue;
    const d = Math.sqrt(d2) || 1, k0 = 1 - d / p.r;
    const lam = hasN ? Math.max(0.12, (nx * dx + ny * dy + nz * dz) / d) : 0.7;
    const k = k0 * k0 * lam * p.i;
    r += p.c[0] * k; g += p.c[1] * k; b += p.c[2] * k;
  }
  return [r, g, b];
}

/** 스테이지 데이터 → 실행용 세계 */
export function compileStage(S) {
  const W = {
    id: S.id, name: S.name, src: S,
    boxes: [], lights: [], sprites: [], spawns: [], sections: S.sections, start: { ...S.start },
    fog: S.fog, light: S.light, sky: S.sky, mesh: {}, stats: { quads: 0, tris: 0, parts: S.parts.length },
  };
  const faces = [];   // {mat, p:[x,y,z], du:[..], dv:[..], n:[..], baseY, kind}
  const addBox = (b) => { W.boxes.push(b); return b; };
  const boxFaces = (b, mat, o = {}) => {
    if (!mat) return;
    const { x0, x1, z0, z1, y0, y1 } = b;
    const top = o.topMat ?? mat, side = o.sideMat ?? mat, k = o.sideK ?? 1;
    if (!o.noTop) faces.push({ mat: top, p: [x0, y1, z0], du: [x1 - x0, 0, 0], dv: [0, 0, z1 - z0], n: [0, 1, 0], kind: 'top', y0 });
    if (!o.noFront) faces.push({ mat: side, p: [x0, y0, z0], du: [x1 - x0, 0, 0], dv: [0, y1 - y0, 0], n: [0, 0, -1], kind: 'side', y0, ao: o.ao, k });
    if (!o.noLeft) faces.push({ mat: side, p: [x0, y0, z1], du: [0, 0, z0 - z1], dv: [0, y1 - y0, 0], n: [-1, 0, 0], kind: 'side', y0, ao: o.ao, k });
    if (!o.noRight) faces.push({ mat: side, p: [x1, y0, z0], du: [0, 0, z1 - z0], dv: [0, y1 - y0, 0], n: [1, 0, 0], kind: 'side', y0, ao: o.ao, k });
  };
  for (const P of S.parts) {
    const y = P.y ?? 0;
    switch (P.t) {
      case 'floor': {   // 바닥 판: 윗면 y, 아래로 thick 만큼
        const b = addBox({ x0: P.x, x1: P.x + P.w, z0: P.z, z1: P.z + P.d, y0: y - (P.thick ?? 220), y1: y, solid: true, walk: P.walk !== false, part: P });
        boxFaces(b, P.mat ?? 'cobble', { ao: false, sideMat: 'stone', sideK: 0.55 });   // 판의 옆면(길 가장자리·구덩이 벽)은 어두운 돌
        break;
      }
      case 'block': case 'wall': {   // 단상·상자·건물 벽: 밑 y, 높이 h
        const b = addBox({ x0: P.x, x1: P.x + P.w, z0: P.z, z1: P.z + P.d, y0: y, y1: y + P.h, solid: true, walk: P.t === 'block', part: P });
        boxFaces(b, P.mat ?? 'stone', { topMat: P.topMat, ao: P.ao ?? true, noTop: P.noTop });
        if (P.collideH > P.h) addBox({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0: y, y1: y + P.collideH, solid: true, walk: false, inv: true, part: P });
        break;
      }
      case 'roof': {   // 맞배지붕: 용마루가 x 방향. 앞 경사면 + 양쪽 박공 (카메라는 뒤 경사면을 못 본다)
        const ov = P.over ?? 14, x0 = P.x - ov, x1 = P.x + P.w + ov, z0 = P.z - ov, zm = P.z + P.d / 2, z1 = P.z + P.d, m = P.mat ?? 'roof';
        const dz = zm - z0, l = Math.hypot(P.h, dz);
        faces.push({ mat: m, p: [x0, y, z0], du: [x1 - x0, 0, 0], dv: [0, P.h, dz], n: [0, dz / l, -P.h / l], kind: 'top', y0: y });
        faces.push({ mat: m, tri: [[x0, y, z1], [x0, y, z0], [x0, y + P.h, zm]], n: [-1, 0, 0], k: 0.8 });
        faces.push({ mat: m, tri: [[x1, y, z0], [x1, y, z1], [x1, y + P.h, zm]], n: [1, 0, 0], k: 0.8 });
        faces.push({ mat: m, p: [x0, y - 10, z0], du: [x1 - x0, 0, 0], dv: [0, 10, 0], n: [0, 0, -1], kind: 'side', y0: y - 10, k: 0.6 });   // 처마 끝
        break;
      }
      case 'blocker': {   // 보이지 않는 벽
        addBox({ x0: P.x, x1: P.x + P.w, z0: P.z, z1: P.z + P.d, y0: y, y1: y + (P.h ?? 600), solid: true, walk: false, inv: true, part: P });
        break;
      }
      case 'stairs': {   // dir 쪽으로 올라가는 계단: n 칸
        const n = P.steps ?? Math.max(2, Math.round(P.h / 12));
        for (let i = 0; i < n; i++) {
          const a = i / n, c = (i + 1) / n, hh = P.h * c;
          let x0 = P.x, x1 = P.x + P.w, z0 = P.z, z1 = P.z + P.d;
          if (P.dir === 'x+') { x0 = P.x + P.w * a; x1 = P.x + P.w * c; } else if (P.dir === 'x-') { x0 = P.x + P.w * (1 - c); x1 = P.x + P.w * (1 - a); } else if (P.dir === 'z+') { z0 = P.z + P.d * a; z1 = P.z + P.d * c; } else { z0 = P.z + P.d * (1 - c); z1 = P.z + P.d * (1 - a); }
          const b = addBox({ x0, x1, z0, z1, y0: y, y1: y + hh, solid: true, walk: true, stair: true, part: P });
          boxFaces(b, P.mat ?? 'stone', { ao: false });
        }
        break;
      }
      case 'pillar': {   // 8각 기둥 (충돌은 정사각)
        const r = P.r, h = P.h;
        addBox({ x0: P.x - r * 0.8, x1: P.x + r * 0.8, z0: P.z - r * 0.8, z1: P.z + r * 0.8, y0: y, y1: y + h, solid: true, walk: false, part: P });
        for (let i = 0; i < 8; i++) {
          const a = (i + 0.5) * Math.PI / 4, nx = Math.cos(a), nz = Math.sin(a);
          if (nz > 0.5) continue;   // 뒤쪽 면은 보이지 않는다
          const hw = r * Math.tan(Math.PI / 8), ux = -nz, uz = nx;   // u = n × up
          const ap = r, cx = P.x + nx * ap, cz = P.z + nz * ap;
          faces.push({ mat: P.mat ?? 'stone', p: [cx - ux * hw, y, cz - uz * hw], du: [ux * hw * 2, 0, uz * hw * 2], dv: [0, h, 0], n: [nx, 0, nz], kind: 'side', y0: y, ao: true, uOff: i * hw * 2 });
        }
        // 주춧돌·머릿돌
        for (const [yy, hh, k] of [[y, 14, 1.25], [y + h - 12, 12, 1.2]]) {
          const b = { x0: P.x - r * k, x1: P.x + r * k, z0: P.z - r * k, z1: P.z + r * k, y0: yy, y1: yy + hh };
          boxFaces(b, P.mat ?? 'stone', { ao: false });
        }
        break;
      }
      case 'prop': {   // 그림 소품 (빌보드). solid = 충돌 반지름, h = 세계 높이
        const py = P.y ?? null;
        W.sprites.push({ kind: 'prop', img: P.img, x: P.x, z: P.z, y: py, h: P.h, flip: !!P.flip, glow: P.glow ?? null, shadow: P.shadow ?? 0.5, lit: P.lit ?? 1 });
        if (P.solid) addBox({ x0: P.x - P.solid, x1: P.x + P.solid, z0: P.z - (P.solidZ ?? P.solid * 0.6), z1: P.z + (P.solidZ ?? P.solid * 0.6), y0: y, y1: y + (P.solidH ?? P.h * 0.8), solid: true, walk: !!P.walk, inv: true, part: P });
        if (P.light) W.lights.push({ x: P.x, y: (P.y ?? 0) + (P.light.y ?? P.h * 0.85), z: P.z - 6, r: P.light.r ?? 280, c: P.light.c ?? [1.0, 0.6, 0.28], i: P.light.i ?? 1.5 });
        break;
      }
      case 'window': {   // 벽에 붙는 불 켜진 창 (빛을 내는 사각형 + 빛)
        W.sprites.push({ kind: 'window', x: P.x, z: P.z, y: P.y ?? 120, w: P.w ?? 46, h: P.h ?? 70, side: P.side ?? 'z' });
        W.lights.push({ x: P.x + (P.side === 'x+' ? 30 : P.side === 'x-' ? -30 : 0), y: (P.y ?? 120) + 20, z: P.z - (P.side ? 0 : 30), r: P.r ?? 230, c: [1.0, 0.55, 0.22], i: P.i ?? 0.9 });
        break;
      }
      case 'light': W.lights.push({ x: P.x, y: P.y ?? 100, z: P.z, r: P.r ?? 300, c: P.c ?? [1, 0.6, 0.3], i: P.i ?? 1 }); break;
      default: throw new Error('모르는 part: ' + P.t);
    }
  }
  // ── 면 → 격자로 쪼개 빛을 구운 삼각형 ──
  const writers = {};
  for (const F of faces) {
    const M = MATS[F.mat]; if (!M) throw new Error('모르는 재질: ' + F.mat);
    const wr = writers[M.tex] ?? (writers[M.tex] = new MeshWriter());
    if (F.tri) {   // 삼각형 한 장 (박공)
      for (const v of F.tri) { const c = lightAt(W, v[0] + F.n[0] * 2, v[1], v[2], F.n[0], F.n[1], F.n[2]), kk = F.k ?? 1; wr.vert(v[0], v[1], v[2], -v[2] * F.n[0] / M.tile, -v[1] / M.tile, c[0] * kk * M.tint[0], c[1] * kk * M.tint[1], c[2] * kk * M.tint[2]); }
      W.stats.quads += 0.5; continue;
    }
    const lu = Math.hypot(F.du[0], F.du[1], F.du[2]), lv = Math.hypot(F.dv[0], F.dv[1], F.dv[2]);
    const nu = Math.max(1, Math.ceil(lu / CELL)), nv = Math.max(1, Math.ceil(lv / CELL));
    const T = M.tile;
    // uv: 세계 평면 투영 (타일이 면 사이에서 이어진다). 큰 값은 정밀도를 깎으므로 정수부를 뺀다
    const uvOf = (x, y, z) => (F.n[1] ? [x / T, -z / T] : F.n[2] ? [x / T, -y / T] : [-z * F.n[0] / T, -y / T]);
    const [bu, bv] = uvOf(F.p[0], F.p[1], F.p[2]); const ou = Math.floor(bu), ov = Math.floor(bv);
    const vtx = (s, t) => {
      const x = F.p[0] + F.du[0] * s + F.dv[0] * t, y = F.p[1] + F.du[1] * s + F.dv[1] * t, z = F.p[2] + F.du[2] * s + F.dv[2] * t;
      const c = lightAt(W, x + F.n[0] * 2, y + F.n[1] * 2, z + F.n[2] * 2, F.n[0], F.n[1], F.n[2]);
      let k = F.k ?? 1;
      if (F.kind === 'side' && F.ao) k *= 0.5 + 0.5 * sm(0, 70, y - F.y0);          // 벽 밑동은 어둡게 (땅과 만나는 곳)
      if (y < -1) k *= Math.max(0.1, 1 + y / 170);                                      // 구덩이·바닥 판 옆면은 아래로 갈수록 어둡게
      const [u, v] = uvOf(x, y, z);
      wr.vert(x, y, z, u - ou, v - ov, c[0] * k * M.tint[0], c[1] * k * M.tint[1], c[2] * k * M.tint[2]);
    };
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const s0 = i / nu, s1 = (i + 1) / nu, t0 = j / nv, t1 = (j + 1) / nv;
      vtx(s0, t0); vtx(s1, t0); vtx(s1, t1); vtx(s0, t0); vtx(s1, t1); vtx(s0, t1);
      W.stats.quads++;
    }
  }
  for (const k in writers) W.mesh[k] = writers[k].done();
  W.stats.quads = Math.round(W.stats.quads); W.stats.tris = Object.values(W.mesh).reduce((a, m) => a + m.count / 3, 0);
  W.stats.boxes = W.boxes.length;
  // 소품의 발밑 높이
  for (const s of W.sprites) if (s.kind === 'prop' && s.y == null) { const g = groundAt(W, s.x, s.z); s.y = Number.isFinite(g) ? g : 0; }
  for (const sp of S.spawns) { const g = groundAt(W, sp.x, sp.z); W.spawns.push({ ...sp, y: Number.isFinite(g) ? g : 0 }); }
  W.start.y = groundAt(W, W.start.x, W.start.z);
  return W;
}

/** (x,z) 아래에서 yMax 이하인 가장 높은 밟는 면. 없으면 -Infinity (구덩이·바깥) */
export function groundAt(W, x, z, yMax = Infinity) {
  let g = -Infinity;
  const B = W.boxes;
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue;
    if (b.y1 <= yMax && b.y1 > g) g = b.y1;
  }
  return g;
}

/** 수평 이동 (축별로 벽에 막힌다). e: {x,z,y,r,h} */
export function moveXZ(W, e, dx, dz) {
  const B = W.boxes, r = e.r, top = e.y + (e.h ?? 80), feet = e.y + STEP_UP;
  if (dx) {
    let nx = e.x + dx;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.solid || b.y1 <= feet || b.y0 >= top || e.z + r <= b.z0 || e.z - r >= b.z1) continue;
      if (nx + r > b.x0 && nx - r < b.x1) {
        if (dx > 0 && e.x <= b.x0 + r) nx = Math.min(nx, b.x0 - r); else if (dx < 0 && e.x >= b.x1 - r) nx = Math.max(nx, b.x1 + r);
      }
    }
    e.x = nx;
  }
  if (dz) {
    let nz = e.z + dz;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.solid || b.y1 <= feet || b.y0 >= top || e.x + r <= b.x0 || e.x - r >= b.x1) continue;
      if (nz + r > b.z0 && nz - r < b.z1) {
        if (dz > 0 && e.z <= b.z0 + r) nz = Math.min(nz, b.z0 - r); else if (dz < 0 && e.z >= b.z1 - r) nz = Math.max(nz, b.z1 + r);
      }
    }
    e.z = nz;
  }
}

/** 어느 구간인가 (없으면 null) */
export function sectionAt(W, x, z) {
  for (const s of W.sections) if (x >= s.x0 && x < s.x1 && z >= s.z0 && z < s.z1) return s;
  return null;
}

/** 저작 데이터 자동 검증: 형식 · 시작/적 위치 · 구간 · 걸어서(점프 포함) 닿는지. → {errors, warnings, stats} */
export function validateStage(S) {
  const errors = [], warnings = [];
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  S.parts.forEach((P, i) => {
    const tag = `parts[${i}] ${P.t}`;
    if (!num(P.x) || !num(P.z)) errors.push(tag + ': x·z 가 숫자가 아님');
    if (['floor', 'block', 'wall', 'blocker', 'stairs', 'roof'].includes(P.t) && !(P.w > 0 && P.d > 0)) errors.push(tag + ': w·d 는 0보다 커야 함');
    if (['block', 'wall', 'stairs', 'pillar', 'roof'].includes(P.t) && !(P.h > 0)) errors.push(tag + ': h 는 0보다 커야 함');
    if (P.t === 'stairs' && !['x+', 'x-', 'z+', 'z-'].includes(P.dir)) errors.push(tag + ': dir 은 x+ x- z+ z- 중 하나');
    if (P.t === 'stairs' && P.h / (P.steps ?? Math.max(2, Math.round(P.h / 12))) > STEP_UP) errors.push(tag + ': 한 칸이 걸어 오르는 턱보다 높음');
    if (P.mat && !MATS[P.mat]) errors.push(tag + ': 모르는 재질 ' + P.mat);
  });
  if (errors.length) return { errors, warnings, stats: {} };
  let W;
  try { W = compileStage(S); } catch (e) { return { errors: ['컴파일 실패: ' + e.message], warnings, stats: {} }; }
  if (!Number.isFinite(W.start.y)) errors.push('시작 위치 아래에 바닥이 없음');
  const ids = new Set(S.sections.map((s) => s.id));
  for (const need of ['street', 'corner', 'alley', 'yard']) if (!ids.has(need)) warnings.push('구간 없음: ' + need);
  if (!sectionAt(W, W.start.x, W.start.z)) errors.push('시작 위치가 어느 구간에도 없음');
  // 격자 넓이 우선 탐색: 칸 20, 몸 반지름 14
  const C = 20, R = 14;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const b of W.boxes) if (b.walk) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1); }
  const nx = Math.ceil((x1 - x0) / C), nz = Math.ceil((z1 - z0) / C);
  const gy = new Float32Array(nx * nz).fill(NaN), seen = new Uint8Array(nx * nz);
  const cellOf = (x, z) => { const i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
  const ground = (k) => {
    if (Number.isNaN(gy[k])) {
      const cx = x0 + (k % nx + 0.5) * C, cz = z0 + (Math.floor(k / nx) + 0.5) * C;
      let g = groundAt(W, cx, cz);
      if (Number.isFinite(g)) for (const b of W.boxes) {   // 벽 속이면 설 수 없다
        if (b.solid && !b.walk && cx + R > b.x0 && cx - R < b.x1 && cz + R > b.z0 && cz - R < b.z1 && b.y1 > g + STEP_UP && b.y0 < g + 60) { g = -Infinity; break; }
      }
      gy[k] = g;
    }
    return gy[k];
  };
  const s0 = cellOf(W.start.x, W.start.z);
  let reach = 0;
  if (s0 >= 0 && Number.isFinite(ground(s0))) {
    const q = [s0]; seen[s0] = 1;
    while (q.length) {
      const k = q.pop(), g = ground(k); reach++;
      const i = k % nx, j = Math.floor(k / nx);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const m = b * nx + a; if (seen[m]) continue;
        const g2 = ground(m); if (!Number.isFinite(g2) || g2 - g > JUMP_UP) continue;
        seen[m] = 1; q.push(m);
      }
    }
  }
  const reachable = (x, z) => { const k = cellOf(x, z); return k >= 0 && !!seen[k]; };
  S.spawns.forEach((sp, i) => {
    if (!Number.isFinite(groundAt(W, sp.x, sp.z))) errors.push(`spawns[${i}] ${sp.kind}: 바닥 없음`);
    else if (!reachable(sp.x, sp.z)) errors.push(`spawns[${i}] ${sp.kind} (${sp.x},${sp.z}): 시작 위치에서 닿을 수 없음`);
  });
  for (const s of S.sections) {
    let ok = false;
    for (let x = s.x0 + 10; x < s.x1 && !ok; x += C) for (let z = s.z0 + 10; z < s.z1; z += C) if (reachable(x, z)) { ok = true; break; }
    if (!ok) errors.push('구간 ' + s.id + ': 닿을 수 있는 바닥이 없음');
  }
  if (S.goal && !reachable(S.goal.x, S.goal.z)) errors.push('goal 에 닿을 수 없음');
  return { errors, warnings, stats: { ...W.stats, lights: W.lights.length, sprites: W.sprites.length, spawns: S.spawns.length, reachCells: reach, meshBytes: Object.values(W.mesh).reduce((a, m) => a + m.data.byteLength, 0) } };
}
