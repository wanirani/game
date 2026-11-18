// v2 play — 세계와 부딪치기 (시범판 B 의 world.js 에서 놀이 규칙이 쓰는 세 함수만 가져왔다; DOM 없음).
// 세계 W = { boxes:[{x0,x1,z0,z1,y0,y1,solid,walk}], sections:[{id,x0,x1,z0,z1}] }.
// 장면이 다른 충돌을 쓰면 W.groundAt · W.moveXZ · W.sectionAt 을 달아 주면 된다 (bindWorld 가 그것을 먼저 쓴다).
export const STEP_UP = 18;     // 걸어서 오르는 턱
export const STEP_DOWN = 20;   // 걸어서 내려가는 턱 (넘으면 떨어진다)

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
/**
 * 인자 · 반환값으로 숫자를 넘기지 않는 판 (놀이 규칙이 틱마다 부르는 길): 엔진은 실수를 함수 인자 · 반환값으로 넘길 때마다 16 바이트짜리 상자를 만든다.
 * S(= Sim)의 칸으로 주고받으면 만들지 않는다.  groundAtS: S.qx, S.qz, S.qy(이 높이 이하) → S.g   ·   moveXZs: e 를 (S.qx, S.qz) 만큼 옮긴다
 */
export function groundAtS(W, S) {
  const x = S.qx, z = S.qz, yMax = S.qy, B = W.boxes; let g = -Infinity;
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue;
    if (b.y1 <= yMax && b.y1 > g) g = b.y1;
  }
  S.g = g;
}
const MV = { qx: 0.5, qz: 0.5 };
export function moveXZ(W, e, dx, dz) { MV.qx = dx; MV.qz = dz; moveXZs(W, e, MV); }
export function moveXZs(W, e, S) {
  const dx = S.qx, dz = S.qz, B = W.boxes, r = +e.r, y = +e.y, top = y + (e.h === undefined ? 80 : +e.h), feet = y + STEP_UP;
  if (dx !== 0) {
    const x0 = +e.x, z = +e.z; let nx = x0 + dx;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.solid || b.y1 <= feet || b.y0 >= top || z + r <= b.z0 || z - r >= b.z1) continue;
      if (nx + r > b.x0 && nx - r < b.x1) {
        if (dx > 0 && x0 <= b.x0 + r) { const lim = b.x0 - r; if (lim < nx) nx = lim; } else if (dx < 0 && x0 >= b.x1 - r) { const lim = b.x1 + r; if (lim > nx) nx = lim; }
      }
    }
    e.x = nx;
  }
  if (dz !== 0) {
    const z0 = +e.z, x = +e.x; let nz = z0 + dz;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.solid || b.y1 <= feet || b.y0 >= top || x + r <= b.x0 || x - r >= b.x1) continue;
      if (nz + r > b.z0 && nz - r < b.z1) {
        if (dz > 0 && z0 <= b.z0 + r) { const lim = b.z0 - r; if (lim < nz) nz = lim; } else if (dz < 0 && z0 >= b.z1 - r) { const lim = b.z1 + r; if (lim > nz) nz = lim; }
      }
    }
    e.z = nz;
  }
}
export function sectionAt(W, x, z) {
  const S = W.sections; if (!S) return null;
  for (const s of S) if (x >= s.x0 && x < s.x1 && z >= s.z0 && z < s.z1) return s;
  return null;
}
/** e(x, z 를 가진 것)가 서 있는 구역 (숫자 인자를 넘기지 않는 판) */
export function sectionOf(W, e) {
  const S = W.sections; if (!S) return null;
  const x = e.x, z = e.z;
  for (let i = 0; i < S.length; i++) { const s = S[i]; if (x >= s.x0 && x < s.x1 && z >= s.z0 && z < s.z1) return s; }
  return null;
}
/** 세계 하나에 묶은 세 함수. W 가 자기 함수를 갖고 있으면 그것을 쓴다 */
export function bindWorld(W) {
  return {
    ground: W.groundAt ? (x, z, yMax) => W.groundAt(x, z, yMax) : (x, z, yMax) => groundAt(W, x, z, yMax),
    move: W.moveXZ ? (e, dx, dz) => W.moveXZ(e, dx, dz) : (e, dx, dz) => moveXZ(W, e, dx, dz),
    section: W.sectionAt ? (x, z) => W.sectionAt(x, z) : (x, z) => sectionAt(W, x, z),
  };
}
/** 검사 · 보기용 평평한 마당 (가운데 0,0 · 반폭 hw · 반깊이 hd). 둘레는 벽 */
export function flatArena(hw = 520, hd = 360, spawns = []) {
  const W = {
    start: { x: 0, z: 0, y: 0 }, sections: [{ id: 'arena', x0: -hw, x1: hw, z0: -hd, z1: hd }], spawns: [],
    boxes: [
      { x0: -hw, x1: hw, z0: -hd, z1: hd, y0: -40, y1: 0, solid: false, walk: true },
      { x0: -hw - 40, x1: -hw, z0: -hd - 40, z1: hd + 40, y0: -40, y1: 300, solid: true, walk: false },
      { x0: hw, x1: hw + 40, z0: -hd - 40, z1: hd + 40, y0: -40, y1: 300, solid: true, walk: false },
      { x0: -hw, x1: hw, z0: -hd - 40, z1: -hd, y0: -40, y1: 300, solid: true, walk: false },
      { x0: -hw, x1: hw, z0: hd, z1: hd + 40, y0: -40, y1: 300, solid: true, walk: false },
    ],
  };
  for (const s of spawns) W.spawns.push({ y: 0, ...s });
  return W;
}
