// 시범판 A — 카메라와 투영 (docs/v2/proto_a.md §2)
// 세계 좌표: x 좌우, z 깊이(화면 안쪽 +), y 높이(위 +). 카메라는 늘 +z 를 바라보고 돌지 않는다.
//   원근(기본): s(z) = zoom · f / (f + z − cam.z)      ← 초점 깊이 cam.z 에서 배율 = zoom
//               screenX = cx + (x − cam.x)·s
//               screenY = horizon + (h − (y − cam.y))·s   (horizon = footY − h·zoom; 세로선은 늘 세로 — 렌즈 시프트 투영)
//   평행(비교용 ?proj=oblique): s ≈ zoom (깊이 1000 에 −20 %), screenY = footY − (z − cam.z)·kz·zoom − (y − cam.y)·s
// 면이 모두 축에 나란하고 카메라가 돌지 않으므로: 화면 한 줄 = 깊이 하나(바닥), 화면 한 칸 = 깊이 하나(옆면)
//   → 바닥·옆면 무늬를 가는 띠로 잘라 그리면 Canvas 2D 의 아핀 변환만으로 이음매 없는 원근 무늬가 된다 (render.js).

export const S_MAX = 2.6;          // 가까운 쪽 자르기: (zoom 을 뺀) 이 배율보다 가까운 것은 그리지 않는다

export class Cam {
  constructor() {
    this.x = 0; this.z = 0; this.y = 0;      // 초점 (땅 위의 한 점)
    this.f = 760; this.h = 320;              // 초점 거리 · 눈 높이 (초점 땅 기준, 세계 px)
    this.zoom = 1;                           // 화면 배율 (폴드처럼 높은 화면에서 캐릭터를 키운다)
    this.footK = 0.72;                       // 초점 땅이 놓이는 화면 높이 비
    this.ortho = false; this.kz = 0.42; this.ok = 0.00025;
    this.W = 960; this.H = 540; this.cx = 480; this.footY = 380; this.horizon = 60; this.zNear = -400;
  }
  /** 프레임 시작: 화면 크기와 흔들림 */
  setView(W, H, ox = 0, oy = 0) {
    this.W = W; this.H = H; this.cx = W / 2 + ox; this.footY = H * this.footK + oy; this.horizon = this.footY - this.h * this.zoom;
    this.zNear = this.ortho ? this.z - (H - this.footY + 60) / (this.kz * this.zoom) : this.z - this.f * (1 - 1 / S_MAX);
  }
  s(z) { return this.ortho ? this.zoom / (1 + (z - this.z) * this.ok) : this.zoom * this.f / (this.f + z - this.z); }
  /** 높이 cam.y 인 땅의 화면 y (깊이 z, 배율 s) */
  gy(z, s) { return this.ortho ? this.footY - (z - this.z) * this.kz * this.zoom : this.horizon + this.h * s; }
  px(x, s) { return this.cx + (x - this.x) * s; }
  py(y, z, s) { return this.gy(z, s) - (y - this.y) * s; }
  /** 높이 top 인 수평면에서 화면 y 가 sy 인 깊이 */
  zAtY(sy, top) {
    if (this.ortho) return this.z + (this.footY - (top - this.y) * this.zoom - sy) / (this.kz * this.zoom);
    const hh = this.h - (top - this.y);
    const s = (sy - this.horizon) / hh;
    return s <= 0.02 ? Infinity : this.z + this.f * this.zoom / s - this.f;
  }
  /** 배율 s 인 깊이 */
  zAtS(s) { return this.ortho ? this.z + (this.zoom / s - 1) / this.ok : this.z + this.f * this.zoom / s - this.f; }
  /** 화면 y 를 n px 옮기는 깊이 차 (높이 top 인 수평면, 깊이 z 에서) */
  dzForPx(z, top, n) {
    if (this.ortho) return n / (this.kz * this.zoom);
    const d = this.f + z - this.z, hh = Math.max(8, this.h - (top - this.y));
    return n * d * d / (hh * this.f * this.zoom);
  }
  /** 화면 x 를 n px 옮기는 깊이 차 (x = xf 인 수직면, 깊이 z 에서) */
  dzForPxX(z, xf, n) {
    const dx = Math.abs(xf - this.x);
    if (this.ortho) return n / Math.max(1e-4, dx * this.ok * this.zoom);
    const d = this.f + z - this.z;
    return n * d * d / (Math.max(1, dx) * this.f * this.zoom);
  }
  /** 땅 위 원이 화면에서 눌리는 비 (그림자·빛 웅덩이) */
  squash(z) { return this.ortho ? this.kz : Math.min(0.6, Math.max(0.18, this.h / (this.f + z - this.z))); }
}
