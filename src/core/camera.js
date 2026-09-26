// 3인칭 추적 카메라: 캐릭터를 뒤따르며 진행 방향을 앞질러 보여주고(룩어헤드),
// 콤보/보스 연출 시 줌인, 흔들림(쉐이크), 방 경계 클램프를 처리한다.
//
// 손맛 API (feel.md §4.9, MASTER_PLAN §1.7 WORLD-CAM; 옛 호출부는 그대로 동작):
//  kick(dx, dy)                 스프링 반동 (k 260, c 22). 약 0.15초 만에 제자리. settings.screenShake 배율 적용
//  addTrauma(t)                 트라우마 0..1 (초당 1.6 감소). 흔들림 = 14·trauma²·값노이즈 (+회전 0.012·trauma², low 품질에선 끔)
//  shake(mag, time)             옛 API → addTrauma(mag/16) + time 동안 최소값 유지. mag ≥ 8 이면 bus 'shake' {mag} (진동)
//  punchZoom(z, t)              순간 줌 (배율, 기본 줌에 곱함) → t 유지 후 ease.outCubic 0.18초로 복귀
//  zoomPulse(z, tin, hold, tout) 모양 있는 줌 (필살기·처치 슬로모션)
//  roll                         화면 기울기(rad, ±0.03), 뷰 중심 기준 회전. 필살기·각성 마무리 전용 (low 품질·동작 줄이기에선 끔)
//  cine(x, y, zoom, t) / cine(entity, zoom, t)   연출 구도로 t초 동안 부드럽게 전환 (zoom 은 절대값)
//  cineEnd(t)                   연출 구도 해제 (t초에 걸쳐 추적 구도로 복귀)
//  frameOn(x, y, zoom)          연출 구도를 즉시 적용하고 x/y 를 바로 다시 계산 (월드가 멈춘 컷인 장면용; 끝낼 때 cineEnd)
//  lookBoost                    추가 룩어헤드(px, 바라보는 방향). 질주·대시 소유자가 매 프레임 넣는다
//  floorY                       보스 경기장 바닥 y(px) 힌트: 바닥이 화면 아래쪽에 오도록 세로 구도를 잡는다 (null = 끔)
//  tick(dt)                     흔들림·스프링·줌 연출·연출 구도만 진행 (월드가 멈춘 오버레이 장면이 매 프레임 부른다; tickShake 는 옛 이름)
//  reset()                      방 로딩 시 줌·연출·흔들림 초기화
// 터치 모드에서 오른쪽을 볼 때는 추적점을 화면 폭의 6% 앞쪽으로 당긴다 (platform §5.4: 버튼 묶음에 적이 가리기 전에 보이게).
import { clamp, lerp, ease } from './math.js';
import { game } from './game.js';
import { input } from './input.js';
import { bus } from './events.js';

const KICK_K = 260, KICK_C = 22, KICK_MAX = 28;
const TRAUMA_DECAY = 1.6, SHAKE_PX = 14, SHAKE_ROT = 0.012, NOISE_HZ = 32;
const ROLL_MAX = 0.03;
const PUNCH_OUT = 0.18;
const TOUCH_BIAS = 0.06;               // 화면 폭 대비 (platform §5.4)
const ARENA_FLOOR = 0.1;               // 경기장: 바닥 아래로 보여 줄 화면 높이 비율
const ARENA_HEAD = 0.14;               // 경기장: 플레이어 머리 위로 최소한 남길 화면 높이 비율

// 값 노이즈 (흰 잡음 대신 부드럽게 흔들린다): 정수 격자 해시를 smoothstep 으로 보간, -1..1
function hash(n) {
  n = ((n << 13) ^ n) | 0;
  const m = (Math.imul(n, (Math.imul(Math.imul(n, n), 15731) + 789221) | 0) + 1376312589) & 0x7fffffff;
  return 1 - m / 1073741824;
}
function vnoise(x, seed) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), o = seed * 7919;
  const a = hash(i + o), b = hash(i + 1 + o);
  return a + (b - a) * u;
}
/** 흔들림·반동 배율: settings.screenShake (0..1), 동작 줄이기면 절반 */
function shakeK() {
  const s = game.settings;
  const k = s?.screenShake ?? 1;
  return (k > 0 ? Math.min(1, k) : 0) * (s?.reduceMotion ? 0.5 : 1);
}
/** 화면 회전 허용: low 품질·동작 줄이기에선 끔 */
function rotOK() {
  const s = game.settings;
  if (s?.reduceMotion) return false;
  return (game.quality ?? s?.quality) !== 'low';
}

export class Camera {
  constructor(w, h) {
    this.x = 0; this.y = 0;          // 뷰 좌상단 (월드 좌표)
    this.w = w; this.h = h;          // 뷰 크기 (줌 1 기준)
    this.zoomTarget = 1;             // 기본 줌이 다가갈 값 (보스 경기장·질주)
    this.baseZoom = 1;               // 기본 줌 (zoomTarget 으로 부드럽게 이동)
    this._zoom = 1;                  // 실제 적용 줌 (기본 × 펀치/펄스, 또는 연출 구도)
    this.bounds = null;              // {x,y,w,h}
    this.lookX = 0; this.lookY = 0;
    this.lookBoost = 0;              // [hook:feel] 질주·대시 추가 룩어헤드 px
    this.floorY = null;              // [hook:plat] 보스 경기장 바닥 y (px)
    this.cx = 0; this.cy = 0;        // 부드럽게 따라가는 추적 중심 (월드 좌표)
    this.shakeX = 0; this.shakeY = 0; // 이번 프레임의 흔들림+반동 오프셋 (lighting.js 도 읽는다)
    this.rot = 0;                    // 이번 프레임의 화면 회전 (rad)
    this.trauma = 0; this.traumaFloor = 0; this.traumaHold = 0;
    this.kickX = 0; this.kickY = 0; this.kvx = 0; this.kvy = 0;
    this.punch = null;               // {z, hold, t}
    this.pulse = null;               // {z, from, tin, hold, tout, t}
    this._cine = null;               // {tgt, x, y, z, w, from, to, t, dur}
    this.roll = 0;                   // [hook:feel] 필살기 마무리 기울기 (rad)
    this.focus = null;               // 연출용 강제 초점 {x,y,t,w}
    this.locked = false;             // 보스전 등 고정
    this.time = 0;
  }
  setView(w, h) { this.w = w; this.h = h; }
  setBounds(x, y, w, h) { this.bounds = { x, y, w, h }; }

  /** 실제 적용 줌. 대입하면 기본 줌으로 즉시 설정하고 펀치·펄스를 취소한다 (옛 호출부 호환) */
  get zoom() { return this._zoom; }
  set zoom(v) { this.baseZoom = v; this._zoom = v; this.punch = null; this.pulse = null; }
  get vw() { return this.w / this._zoom; }
  get vh() { return this.h / this._zoom; }
  get cineActive() { return !!this._cine; }

  /** 방 로딩: 줌·연출·흔들림을 모두 초기화 */
  reset() {
    this.zoomTarget = 1; this.baseZoom = 1; this._zoom = 1;
    this.punch = null; this.pulse = null; this._cine = null; this.focus = null;
    this.trauma = 0; this.traumaFloor = 0; this.traumaHold = 0;
    this.kickX = 0; this.kickY = 0; this.kvx = 0; this.kvy = 0;
    this.shakeX = 0; this.shakeY = 0; this.rot = 0;
    this.roll = 0; this.lookBoost = 0; this.floorY = null;
  }

  // ─────────────────────────── 흔들림·반동 ───────────────────────────
  /** 스프링 반동: 화면을 (dx, dy) 만큼 밀었다가 약 0.15초 만에 되돌린다. 설정 배율은 여기서 한 번만 적용 */
  kick(dx = 0, dy = 0) {
    const k = shakeK();
    if (!(k > 0)) return;
    this.kickX = clamp(this.kickX + dx * k, -KICK_MAX, KICK_MAX);
    this.kickY = clamp(this.kickY + dy * k, -KICK_MAX, KICK_MAX);
  }
  /** 트라우마 추가 (0..1). 흔들림 크기는 trauma² 에 비례, 초당 1.6 감소 */
  addTrauma(t = 0.2) {
    if (!(t > 0)) return;
    this.trauma = clamp(this.trauma + t, 0, 1);
  }
  /** 옛 흔들림 API: addTrauma(mag/16) + time 동안 그 값 아래로 줄지 않음. 설정 배율은 출력에서 적용 — 호출부에서 곱하지 말 것 */
  shake(mag = 6, time = 0.25) {
    if (mag >= 8) bus.emit('shake', { mag });   // [hook:plat] 진동(haptics.js)
    if (!(mag > 0)) return;
    const tr = clamp(mag / 16, 0, 1);
    this.addTrauma(tr);
    this.traumaFloor = Math.max(this.traumaHold > 0 ? this.traumaFloor : 0, tr);
    this.traumaHold = Math.max(this.traumaHold, time);
  }

  // ─────────────────────────── 줌 연출 ───────────────────────────
  /** 순간 줌인 (기본 줌에 곱하는 배율). time 동안 유지 후 0.18초 ease.outCubic 복귀 */
  punchZoom(z = 1.08, time = 0.25) {
    this.punch = { z: Math.max(this.punchMul(), z), hold: Math.max(0, time), t: 0 };   // 진행 중이면 지금 배율에서 이어서 (튀지 않게)
  }
  /** 모양 있는 줌: tin 동안 z 배율까지 (outCubic) → hold → tout 동안 복귀 (inOutCubic). z < 1 이면 줌아웃 */
  zoomPulse(z = 1.1, tin = 0.1, hold = 0.1, tout = 0.2) {
    this.pulse = { z, from: this.pulseMul(), tin: Math.max(0, tin), hold: Math.max(0, hold), tout: Math.max(0.0001, tout), t: 0 };
  }
  punchMul() {
    const p = this.punch;
    if (!p) return 1;
    if (p.t <= p.hold) return p.z;
    const k = clamp((p.t - p.hold) / PUNCH_OUT, 0, 1);
    return lerp(p.z, 1, ease.outCubic(k));
  }
  pulseMul() {
    const p = this.pulse;
    if (!p) return 1;
    if (p.t < p.tin) return lerp(p.from, p.z, ease.outCubic(p.t / p.tin));
    if (p.t < p.tin + p.hold) return p.z;
    return lerp(p.z, 1, ease.inOutCubic(clamp((p.t - p.tin - p.hold) / p.tout, 0, 1)));
  }

  // ─────────────────────────── 연출 구도 ───────────────────────────
  /** 연출 구도: cine(x, y, zoom, t) 또는 cine(entity, zoom, t). entity 면 중심을 계속 따라간다. zoom 은 절대값 */
  cine(a, b, c, d) {
    let tgt = null, x = 0, y = 0, z, t;
    if (a && typeof a === 'object') { tgt = a; z = b; t = c; } else { x = a; y = b; z = c; t = d; }
    const w0 = this._cine ? this._cine.w : 0;
    this._cine = { tgt, x, y, z: z ?? 1.2, w: w0, from: w0, to: 1, t: 0, dur: Math.max(0.0001, t ?? 0.3) };
    this.cineTarget();
  }
  /** 연출 구도 해제: t초에 걸쳐 추적 구도로 돌아간다 */
  cineEnd(t = 0.3) {
    const c = this._cine;
    if (!c) return;
    c.from = c.w; c.to = 0; c.t = 0; c.dur = Math.max(0.0001, t);
  }
  /** 연출 구도를 즉시 적용 (가중치 1)하고 x/y 를 바로 다시 계산. frameOn(entity, zoom) 도 가능 */
  frameOn(x, y, zoom) {
    let tgt = null;
    if (x && typeof x === 'object') { tgt = x; zoom = y; x = 0; y = 0; }
    const z = zoom ?? this._cine?.z ?? this._zoom;
    this._cine = { tgt, x, y, z, w: 1, from: 1, to: 1, t: 0, dur: 0.0001 };
    this.cineTarget();
    this.compose();
  }
  cineTarget() {
    const c = this._cine, e = c?.tgt;
    if (!e) return;
    c.x = e.cx ?? (e.x + (e.w ?? 0) / 2);
    c.y = e.cy ?? (e.y + (e.h ?? 0) / 2);
  }

  // ─────────────────────────── 추적 ───────────────────────────
  /** target: {x,y,w,h,vx,vy,facing,onGround}. dt = 추적 속도용, fxDt = 흔들림·반동·줌 연출용 (히트스톱 중엔 실제 dt) */
  follow(t, dt, snap = false, fxDt = dt) {
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    const f = t.facing || 1;
    const vwB = this.w / this.baseZoom, vhB = this.h / this.baseZoom;
    // 룩어헤드: 이동 방향 앞쪽을 더 보여줌 (+질주·대시 추가, +터치 모드 오른쪽 바이어스)
    const touchBias = input.touchMode && f > 0 ? vwB * TOUCH_BIAS : 0;   // [hook:plat]
    const wantLook = clamp((t.vx || 0) * 0.28, -130, 130) + f * (40 + (this.lookBoost || 0)) + touchBias;   // [hook:feel] [hook:plat]
    this.lookX = snap ? wantLook : lerp(this.lookX, wantLook, 1 - Math.pow(0.04, dt));
    const wantLookY = t.onGround ? -40 : ((t.vy || 0) > 300 ? 40 : -20);
    this.lookY = snap ? wantLookY : lerp(this.lookY, wantLookY, 1 - Math.pow(0.1, dt));
    let fx = cx + this.lookX, fy = cy + this.lookY;
    if (this.floorY != null) {
      // [hook:plat] 보스 경기장: 바닥이 화면 아래 10% 지점에 오게 (높은 방에서 땅 속만 보이던 문제). 높이 뛰면 머리 위 여백을 지키며 따라간다
      const floorFy = this.floorY + vhB * ARENA_FLOOR - vhB / 2;
      const headFy = t.y - vhB * ARENA_HEAD + vhB / 2;
      const feetFy = t.y + t.h + vhB * ARENA_FLOOR - vhB / 2;
      fy = Math.max(Math.min(floorFy, headFy), Math.min(feetFy, headFy));
    }
    if (this.focus) {
      fx = lerp(fx, this.focus.x, this.focus.w ?? 0.6);
      fy = lerp(fy, this.focus.y, this.focus.w ?? 0.6);
      this.focus.t -= dt;
      if (this.focus.t <= 0) this.focus = null;
    }
    // 기본 줌 복귀 (보스 경기장 줌아웃·질주 줌)
    this.baseZoom = lerp(this.baseZoom, this.zoomTarget, 1 - Math.pow(0.02, dt));
    if (snap) { this.cx = fx; this.cy = fy; }
    else {
      this.cx = lerp(this.cx, fx, 1 - Math.pow(0.0008, dt));
      this.cy = lerp(this.cy, fy, 1 - Math.pow(0.004, dt));
    }
    this.clampCentre();
    this.tick(fxDt);
  }
  /** 추적 중심을 방 경계 안으로 (경계 밖으로 밀려 있다가 되돌아올 때의 지연 방지) */
  clampCentre() {
    const b = this.bounds;
    if (!b) return;
    const vw = this.w / this.baseZoom, vh = this.h / this.baseZoom;
    this.cx = b.w <= vw ? b.x + b.w / 2 : clamp(this.cx, b.x + vw / 2, b.x + b.w - vw / 2);
    this.cy = b.h <= vh ? b.y + b.h - vh / 2 : clamp(this.cy, b.y + vh / 2, b.y + b.h - vh / 2);
  }
  /**
   * 흔들림·반동 스프링·줌 연출·연출 구도를 dt 만큼 진행하고 화면 위치를 다시 계산한다.
   * 월드를 멈추는 오버레이(보스 등장·대화·컷인)도 호출해서, 떠 있는 동안 시작된 흔들림·연출이 제때 재생되게 한다
   */
  tick(dt = 1 / 60) {
    if (!(dt > 0)) dt = 0;
    this.time += dt;
    // 반동 스프링 (반암시적 오일러, 큰 dt 는 쪼갬)
    let left = Math.min(dt, 0.1);
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 120);
      this.kvx += (-KICK_K * this.kickX - KICK_C * this.kvx) * h; this.kickX += this.kvx * h;
      this.kvy += (-KICK_K * this.kickY - KICK_C * this.kvy) * h; this.kickY += this.kvy * h;
      left -= h;
    }
    if (Math.abs(this.kickX) < 0.01 && Math.abs(this.kvx) < 0.5) { this.kickX = 0; this.kvx = 0; }
    if (Math.abs(this.kickY) < 0.01 && Math.abs(this.kvy) < 0.5) { this.kickY = 0; this.kvy = 0; }
    // 트라우마
    if (this.traumaHold > 0) { this.traumaHold -= dt; this.trauma = Math.max(this.trauma - TRAUMA_DECAY * dt, this.traumaFloor); if (this.traumaHold <= 0) this.traumaFloor = 0; }
    else this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
    // 줌 연출
    if (this.punch) { this.punch.t += dt; if (this.punch.t > this.punch.hold + PUNCH_OUT) this.punch = null; }
    if (this.pulse) { this.pulse.t += dt; const p = this.pulse; if (p.t > p.tin + p.hold + p.tout) this.pulse = null; }
    // 연출 구도 가중치
    const c = this._cine;
    if (c) {
      c.t += dt;
      const k = clamp(c.t / c.dur, 0, 1);
      c.w = lerp(c.from, c.to, c.to > c.from ? ease.outCubic(k) : ease.inOutCubic(k));
      if (k >= 1) { c.w = c.to; if (c.to <= 0) this._cine = null; }
      this.cineTarget();
    }
    this.compose();
  }
  /** 옛 이름 (overlays.js·dialogue.js 가 월드가 멈춘 동안 부른다) */
  tickShake(dt) { this.tick(dt); }
  /** 추적 중심 + 줌 연출 + 연출 구도 → x/y/zoom, 흔들림 오프셋·회전 */
  compose() {
    const pm = this.punchMul(), qm = this.pulseMul();
    let z = this.baseZoom * (qm >= 1 ? Math.max(pm, qm) : pm * qm);
    let cx = this.cx, cy = this.cy;
    const c = this._cine;
    if (c && c.w > 0) { cx = lerp(cx, c.x, c.w); cy = lerp(cy, c.y, c.w); z = lerp(z, c.z, c.w); }
    this._zoom = clamp(z, 0.3, 3);
    this.x = cx - this.w / this._zoom / 2;
    this.y = cy - this.h / this._zoom / 2;
    this.clamp();
    const k = shakeK(), tr = this.trauma * this.trauma, n = this.time * NOISE_HZ;
    const amp = SHAKE_PX * tr * k;
    this.shakeX = amp * vnoise(n, 1) + this.kickX;
    this.shakeY = amp * vnoise(n, 2) + this.kickY;
    this.rot = rotOK() ? SHAKE_ROT * tr * k * vnoise(n, 3) + clamp(this.roll || 0, -ROLL_MAX, ROLL_MAX) : 0;
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
  /** 월드 그리기 직전에 호출 (기울기는 뷰 중심 기준) */
  apply(ctx) {
    if (this.rot) { const hx = this.w / 2, hy = this.h / 2; ctx.translate(hx, hy); ctx.rotate(this.rot); ctx.translate(-hx, -hy); }
    ctx.scale(this._zoom, this._zoom);
    ctx.translate(-Math.round((this.x + this.shakeX) * 2) / 2, -Math.round((this.y + this.shakeY) * 2) / 2);
  }
  toScreen(wx, wy) { return { x: (wx - this.x) * this._zoom, y: (wy - this.y) * this._zoom }; }
  visible(x, y, w, h, margin = 64) {
    return x + w > this.x - margin && x < this.x + this.vw + margin && y + h > this.y - margin && y < this.y + this.vh + margin;
  }
}
