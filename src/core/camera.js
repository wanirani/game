// 3인칭 추적 카메라: 캐릭터를 뒤따르며 진행 방향을 앞질러 보여주고(룩어헤드),
// 콤보/보스 연출 시 줌인, 흔들림(쉐이크), 방 경계 클램프를 처리한다.
import { clamp, lerp, rand } from './math.js';
import { game } from './game.js';

export class Camera {
  constructor(w, h) {
    this.x = 0; this.y = 0;          // 뷰 좌상단 (월드 좌표)
    this.w = w; this.h = h;          // 뷰 크기 (줌 1 기준)
    this.zoom = 1; this.zoomTarget = 1;
    this.bounds = null;              // {x,y,w,h}
    this.lookX = 0; this.lookY = 0;
    this.shakeMag = 0; this.shakeT = 0; this.shakeX = 0; this.shakeY = 0;
    this.trauma = 0;
    this.focus = null;               // 연출용 강제 초점 {x,y,t}
    this.locked = false;             // 보스전 등 고정
  }
  setView(w, h) { this.w = w; this.h = h; }
  setBounds(x, y, w, h) { this.bounds = { x, y, w, h }; }
  /** 화면 흔들림. 설정(화면 흔들림 배율)을 여기서 일괄 적용 — 호출부에서 따로 곱하지 말 것 */
  shake(mag = 6, time = 0.25) {
    const k = game.settings?.screenShake ?? 1;
    if (!(k > 0)) return;
    mag *= k;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, time);
  }
  punchZoom(z = 1.08, time = 0.25) { this.zoom = Math.max(this.zoom, z); this.zoomHold = time; }

  get vw() { return this.w / this.zoom; }
  get vh() { return this.h / this.zoom; }

  /** target: {x,y,w,h,vx,facing,onGround} */
  follow(t, dt, snap = false) {
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    // 룩어헤드: 이동 방향 앞쪽을 더 보여줌
    const wantLook = clamp((t.vx || 0) * 0.28, -130, 130) + (t.facing || 1) * 40;
    this.lookX = snap ? wantLook : lerp(this.lookX, wantLook, 1 - Math.pow(0.04, dt));
    const wantLookY = t.onGround ? -40 : ((t.vy || 0) > 300 ? 40 : -20);
    this.lookY = snap ? wantLookY : lerp(this.lookY, wantLookY, 1 - Math.pow(0.1, dt));
    let fx = cx + this.lookX, fy = cy + this.lookY;
    if (this.focus) {
      fx = lerp(fx, this.focus.x, this.focus.w ?? 0.6);
      fy = lerp(fy, this.focus.y, this.focus.w ?? 0.6);
      this.focus.t -= dt;
      if (this.focus.t <= 0) this.focus = null;
    }
    // 줌 복귀
    if (this.zoomHold > 0) this.zoomHold -= dt;
    else this.zoom = lerp(this.zoom, this.zoomTarget, 1 - Math.pow(0.02, dt));
    const tx = fx - this.vw / 2, ty = fy - this.vh / 2;
    if (snap) { this.x = tx; this.y = ty; }
    else {
      this.x = lerp(this.x, tx, 1 - Math.pow(0.0008, dt));
      this.y = lerp(this.y, ty, 1 - Math.pow(0.004, dt));
    }
    this.clamp();
    // 쉐이크
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = this.shakeMag * Math.min(1, this.shakeT * 6);
      this.shakeX = rand(-m, m); this.shakeY = rand(-m, m);
      if (this.shakeT <= 0) this.shakeMag = 0;
    } else { this.shakeX = 0; this.shakeY = 0; }
  }
  clamp() {
    const b = this.bounds;
    if (!b) return;
    const vw = this.vw, vh = this.vh;
    if (b.w <= vw) this.x = b.x + (b.w - vw) / 2;
    else this.x = clamp(this.x, b.x, b.x + b.w - vw);
    if (b.h <= vh) this.y = b.y + b.h - vh; // 방이 화면보다 낮으면 바닥에 맞춤
    else this.y = clamp(this.y, b.y, b.y + b.h - vh);
  }
  /** 월드 그리기 직전에 호출 */
  apply(ctx) {
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-Math.round((this.x + this.shakeX) * 2) / 2, -Math.round((this.y + this.shakeY) * 2) / 2);
  }
  toScreen(wx, wy) { return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom }; }
  visible(x, y, w, h, margin = 64) {
    return x + w > this.x - margin && x < this.x + this.vw + margin && y + h > this.y - margin && y < this.y + this.vh + margin;
  }
}
