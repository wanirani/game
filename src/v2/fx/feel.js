// v2 fx — 화면·카메라 손맛. docs/v2/FX.md §4
// 게임 코드는 프레임마다 `const dt = feel.update(realDt)` 를 부르고, 돌려받은 dt(= 실제 dt × timeScale)로 놀이를 돌린다.
// 카메라는 feel.cam (흔들림·밀림·줌) 을 읽어 눈 위치와 초점 거리에 더한다 (applyToEye 참고).
// 화면 덧칠(번쩍임·가장자리 색·채도)은 feel.screen 에 있고 post.end 가 읽는다.
// 값의 근거: docs/specs/feel.md §4.1 (타격 멈춤 표 · 1초에 0.40초 상한) · §4.9 (trauma, 번쩍임 0.7 상한 · 빈도 제한, 처치 슬로모션).

const LOG = 16;
export class Feel {
  constructor() {
    this.shakeScale = 1;      // 설정: 화면 흔들림 0..1
    this.flashScale = 1;      // 설정: 번쩍임 0 · 0.5 · 1
    this.stop = 0;            // 남은 타격 멈춤 (실제 초)
    this.slowT = 0; this.slowScale = 1; this.slowIn = 0;
    this.trauma = 0; this.dirX = 0; this.dirY = 0; this.dirK = 0;
    this.kx = 0; this.ky = 0; this.kz = 0; this.kvx = 0; this.kvy = 0; this.kvz = 0;   // 밀림 스프링 (세계 좌표)
    this.zoom = 0; this.zoomV = 0; this.zoomHold = 0; this.zoomTarget = 0;
    this.t = 0.5;             // 실제 시간
    this.dtIn = 0.5; this.dtOut = 0.5;   // step() 의 입력·출력 (실수를 인자·반환값으로 넘기지 않기 위한 칸)
    this.frozenRecent = 0;    // 최근 멈춘 시간 (입력 버퍼 보정용, 1 s/s 로 줄어든다)
    this._log = new Float32Array(LOG * 2); this._logN = 0;
    this._flashLog = new Float32Array(4); this._flashN = 0;
    this.cam = { sx: 0, sy: 0, kx: 0, ky: 0, kz: 0, roll: 0, zoom: 1 };
    this.screen = { flash: new Float32Array(4), flashDecay: 6, vig: new Float32Array(4), vigDecay: 3, desat: 0, dark: 0 };
    this.calls = 0;           // 통계: 이번 프레임에 받은 손맛 호출 수
  }
  /** 놀이 시간 배율: 타격 멈춤 중 0, 슬로모션 중 slowScale, 아니면 1 */
  get timeScale() { return this.stop > 0 ? 0 : this.slowT > 0 ? this.slowScale : 1; }
  /** 효과 시간 배율: 멈춤 중에도 0.3배로 흘러 불티가 피어난다 */
  get fxScale() { return this.stop > 0 ? 0.3 : this.slowT > 0 ? Math.max(this.slowScale, 0.3) : 1; }
  get frozen() { return this.stop > 0; }

  /** 타격 멈춤. force = 상한을 무시(필살기 마무리). 여러 대상이 한 번에 맞으면 합이 아니라 최댓값. */
  hitStop(sec, force = false) {
    this.calls++;
    if (!force) {
      let used = 0; const L = this._log;
      for (let i = 0; i < LOG; i++) if (this.t - L[i * 2] < 1) used += L[i * 2 + 1];
      sec = Math.max(1 / 60, Math.min(sec, 0.40 - used));
    }
    if (sec <= this.stop) return;
    const add = sec - this.stop; this.stop = sec;
    const i = this._logN++ % LOG; this._log[i * 2] = this.t; this._log[i * 2 + 1] = add;
  }
  /** 흔들림 더하기 (0..1, 초당 1.6 줄어든다). dx,dy = 화면에서의 방향(카메라 오른쪽·위 성분) — 주면 그 축으로 더 흔든다 */
  addTrauma(amount, dx = 0, dy = 0) {
    this.calls++; this.trauma = Math.min(1, this.trauma + amount);
    const l = Math.hypot(dx, dy); if (l > 0.001) { this.dirX = dx / l; this.dirY = dy / l; this.dirK = 0.75; } else this.dirK *= 0.5;
  }
  /** 카메라를 세계 방향 (x,y,z) 으로 px 만큼 툭 민다 (스프링으로 0.15초 안에 돌아온다) */
  kick(x, y, z, px) { this.calls++; const k = px * 26 * this.shakeScale; this.kvx += x * k; this.kvy += y * k; this.kvz += z * k; }
  /** 줌 펀치: amount 만큼(0.05 = 5 %) 당겼다가 돌아온다. hold = 당긴 채 머무는 실제 초 */
  zoomPunch(amount, hold = 0) { this.calls++; this.zoomTarget = Math.max(this.zoomTarget, amount); this.zoomHold = Math.max(this.zoomHold, hold + 0.05); }
  /** 화면 번쩍임 (세기 상한 0.7 · 1초 안에 0.3 넘는 번쩍임이 2번을 넘으면 0.3 으로) */
  flash(r, g, b, strength, decay = 7) {
    this.calls++; let s = Math.min(0.7, strength * this.flashScale); if (s <= 0) return;
    if (s > 0.3) {
      let recent = 0; for (let i = 0; i < 4; i++) if (this._flashLog[i] > 0 && this.t - this._flashLog[i] < 1) recent++;
      if (recent >= 2) s = 0.3; else this._flashLog[this._flashN++ % 4] = this.t;
    }
    const F = this.screen.flash; if (s >= F[3]) { F[0] = r; F[1] = g; F[2] = b; F[3] = s; this.screen.flashDecay = decay; }
  }
  /** 가장자리 색 번짐 (피격·필살기) */
  vignette(r, g, b, a, decay = 3) { this.calls++; const V = this.screen.vig; if (a >= V[3]) { V[0] = r; V[1] = g; V[2] = b; V[3] = Math.min(0.8, a); this.screen.vigDecay = decay; } }
  /** 슬로모션: 실제 dur 초 동안 놀이를 scale 배로 */
  slowMo(scale, dur) { this.calls++; if (dur > this.slowT || scale < this.slowScale) { this.slowT = Math.max(this.slowT, dur); this.slowScale = scale; } }
  /** 필살기 동안 화면을 어둡게(0..0.6) — 효과가 또렷해진다. 스스로 0 으로 돌아오지 않으니 끝날 때 0 을 준다 */
  darken(a) { this.screen.dark = a; }

  /** 프레임마다 한 번. 실제 dt 를 주면 놀이용 dt 를 돌려준다 */
  update(dt) { this.dtIn = dt; this.step(); return this.dtOut; }
  /** update 와 같다: this.dtIn 을 읽고 this.dtOut 에 쓴다 */
  step() {
    const dt = this.dtIn; this.t += dt; this.calls = 0;
    const scale = this.timeScale;
    if (this.stop > 0) { const used = Math.min(this.stop, dt); this.stop -= used; this.frozenRecent += used; }
    else if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) { this.slowT = 0; this.slowScale = 1; } }
    this.frozenRecent = Math.max(0, this.frozenRecent - dt);
    // 흔들림: 흰 잡음이 아니라 부드러운 잡음(사인 합) × trauma²
    this.trauma = Math.max(0, this.trauma - 1.6 * dt); this.dirK = Math.max(0, this.dirK - 1.2 * dt);
    const tt = this.t, s2 = this.trauma * this.trauma * 15 * this.shakeScale;
    const n1 = Math.sin(tt * 41.3) * 0.6 + Math.sin(tt * 67.9 + 1.3) * 0.4, n2 = Math.sin(tt * 37.1 + 2.1) * 0.6 + Math.sin(tt * 59.3 + 0.4) * 0.4;
    const k = this.dirK, C = this.cam;
    if (k < 0.01) { C.sx = s2 * n1; C.sy = s2 * n2; }
    else { const al = 0.6 + k, pe = 1 - k; C.sx = s2 * (this.dirX * n1 * al - this.dirY * n2 * pe); C.sy = s2 * (this.dirY * n1 * al + this.dirX * n2 * pe); }
    C.roll = this.trauma * this.trauma * 0.012 * n2 * this.shakeScale;
    // 밀림 스프링 (k 260, c 22)
    const h = Math.min(dt, 1 / 30);
    this.kvx += (-260 * this.kx - 22 * this.kvx) * h; this.kvy += (-260 * this.ky - 22 * this.kvy) * h; this.kvz += (-260 * this.kz - 22 * this.kvz) * h;
    this.kx += this.kvx * h; this.ky += this.kvy * h; this.kz += this.kvz * h;
    C.kx = this.kx; C.ky = this.ky; C.kz = this.kz;
    // 줌: 빠르게 당기고(0.05초) 부드럽게 푼다(0.18초)
    if (this.zoomHold > 0) { this.zoomHold -= dt; this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 30); if (this.zoomHold <= 0) this.zoomTarget = 0; }
    else this.zoom += (0 - this.zoom) * Math.min(1, dt * 9);
    C.zoom = 1 + this.zoom;
    const S = this.screen;
    S.flash[3] = Math.max(0, S.flash[3] - S.flash[3] * S.flashDecay * dt - 0.15 * dt);
    S.vig[3] = Math.max(0, S.vig[3] - S.vig[3] * S.vigDecay * dt - 0.05 * dt);
    const ds = this.slowT > 0 ? 0.35 : 0; S.desat += (ds - S.desat) * Math.min(1, dt * 10);
    this.dtOut = dt * scale;
  }
  /** 카메라 눈 위치에 흔들림·밀림을 더한다. eye·right·up = [x,y,z], out = 결과 (새 배열을 만들지 않는다) */
  applyToEye(eye, right, up, out) {
    const C = this.cam;
    out[0] = eye[0] + right[0] * C.sx + up[0] * C.sy + C.kx; out[1] = eye[1] + right[1] * C.sx + up[1] * C.sy + C.ky; out[2] = eye[2] + right[2] * C.sx + up[2] * C.sy + C.kz;
    return out;
  }
  reset() { this.stop = 0; this.slowT = 0; this.slowScale = 1; this.trauma = 0; this.kx = this.ky = this.kz = this.kvx = this.kvy = this.kvz = 0; this.zoom = 0; this.zoomHold = 0; this.zoomTarget = 0; this.screen.flash[3] = 0; this.screen.vig[3] = 0; this.screen.desat = 0; this.screen.dark = 0; this._log.fill(0); this._flashLog.fill(0); }
}

/** 맞은 캐릭터의 흰 번쩍임 세기 (0..1). age = 맞은 뒤 흐른 초. 캐릭터 셰이더의 '번쩍임' 값에 그대로 넣는다 */
export function hurtFlash(age) { return age < 0 ? 0 : age < 0.05 ? 1 : age < 0.14 ? 1 - (age - 0.05) / 0.09 : 0; }
/** 맞은 캐릭터의 떨림 (단위). age = 맞은 뒤 흐른 초, stop = 그 타격의 멈춤 시간, amp = 진폭 */
export function hurtShake(age, stop, amp = 3) { return age >= 0 && age < stop ? ((Math.floor(age * 60) & 1) ? amp : -amp) : 0; }
/** 재로 흩어지는 죽음의 분해 정도 (0..1). 캐릭터 셰이더의 분해 값에 넣는다 */
export function dissolveK(age, dur = 0.9) { const k = age / dur; return k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k); }

/** 캐릭터 셰이더에 붙이는 분해 조각 (ES 1.00 · 3.00 공용; 잡음 텍스처는 fx.tex.noise). docs/v2/FX.md §3.5 */
export const FX_DISSOLVE_GLSL = `
uniform sampler2D uFxNoise; uniform vec4 uFxDis;   // (분해 0..1, 가장자리 폭, 잡음 배율, 씨앗)
// 돌려주는 값: 가장자리 빛 세기(0..1). 사라질 픽셀이면 -1 → 호출한 쪽이 discard
float fxDissolve(vec3 wp) {
  if (uFxDis.x <= 0.0) return 0.0;
  float n = TEX(uFxNoise, wp.xy * uFxDis.z + vec2(wp.z * uFxDis.z, uFxDis.w)).r * 0.75 + TEX(uFxNoise, wp.xy * uFxDis.z * 3.1).b * 0.25;
  float th = uFxDis.x * 1.08 - (wp.y * 0.0025);
  if (n < th) return -1.0;
  return 1.0 - smoothstep(th, th + uFxDis.y, n);
}`;
