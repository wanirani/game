// 메뉴용 영웅 미리보기: 가짜 엔티티로 drawHero 를 구동 (대기 호흡 + 공격 시연) + 고딕 무대(아치 창문 역광·빛줄기·마법진 받침대)
// + 턴테이블 (platform.md §7.1–7.3, WP-5 — 사용자 요청 #6: 인벤토리에서 영웅을 돌려 앞·옆·뒷모습 보기)
//
// HeroView (다른 화면도 그대로 쓴다: CMP-UI 동료 탭, 파티 화면 등 — 예전 API 는 바뀌지 않았다)
//   new HeroView({ auto = true, turntable = false, game = null })
//   set(look, ch, key?) · showcase(n?) · pose(anim, dur?) · update(dt) · draw(ctx, cx, bottom, scale, { facing, noFx, rim })
// 턴테이블 (turntable: true 일 때):
//   stage(rect)        render 에서 무대 사각형을 알린다 (끌기·휠·탭 판정 영역, 끌기 배율의 기준 너비)
//   control(dt, ges)   update 에서 update(dt) 보다 먼저 부른다. 포커스와 무관하게 입력을 읽는다 → 무대를 탭했으면 true
//                      · 끌기(터치·마우스): 무대 너비 2.2 배 = 한 바퀴. 뗄 때 마지막 80 ms 속도로 관성(최대 12 rad/s, v *= 0.02^dt),
//                        0.6 rad/s 아래로 느려지면 가장 가까운 칸(HERO_VIEW.steps, 기본 8 × 45°)으로 0.25 초 임계 감쇠 스냅
//                      · 탭 = 공격 시연, 두 번 탭 = 초기화 · 휠(무대 위) = 한 칸에 22.5° · , . 누르고 있기 = 2.6 rad/s
//                      · / = 자동 회전 켜고 끄기, 빠르게 두 번 = 초기화 · 패드 오른쪽 스틱 X = × 3.2 rad/s, R3 = 자동 회전 켜고 끄기 + 초기화
//                      · 터치 ⟲ ⟳ 버튼 (탭 = 45°, 누르고 있기 = 계속) · ▶/❚❚ 자동 회전 버튼
//   drawDeck(ctx, t)   무대 위 안내(보는 방향 이름) + 버튼 (터치 모드 · 마우스가 무대 위에 있을 때). 영웅 다음에 그린다
//   reveal()           장비 공개: 한 바퀴(0.8 초, ease-out). 움직임 줄이기면 예전처럼 시전 동작
//   resetYaw() · toggleAuto() · swipeBlock(x, y) (메뉴의 가로 밀기 탭 전환이 무대에서 시작하면 무시) · viewLabel()
//   상태: yaw, yawVel, yawGoal, autoSpin(자동 회전 켬), spinning(지금 도는 중), idleT(입력 없던 시간), userYaw(사용자가 고른 각)
//   자동 회전: 입력이 6 초 없으면 0.6 rad/s (settings.turntableAuto, 기본 켬). 어떤 입력이든 멈춘다. 움직임 줄이기면 끔
//   공격 시연은 옆모습으로 그린 동작이라 0.18 초 동안 가까운 옆모습(0 또는 π)으로 돌린 뒤 시연하고, 끝나면 userYaw 로 돌아간다
// 각도: 0 = 오른쪽 옆모습(예전 모습), +π/2 = 앞모습, π = 왼쪽 옆모습, −π/2 = 뒷모습 (render/hero.js drawHero opts.yaw)
// 렌더러 계약(HERO_VIEW, heroViewInfo)은 hero.js 의 W3 export 라 네임스페이스로만 읽는다 (MASTER_PLAN R6).
// HERO_VIEW 가 없으면 임시 대체 (platform §7.3): facing = sign(cos yaw), 가로 배율 max(0.12, |cos|) 카드 뒤집기 · 이름은 '옆모습' · 자동 회전 끔.
// 채색 8방향 뷰가 없는 영웅(벡터 대체·로딩 중)도 같은 규칙: 기본 각 0, 옆모습에서만 멈춘다.
// 오프스크린(무대 레이어) 배율은 ctx 의 실제 픽셀 배율 이하로 자른다 — 캔버스 백킹이 이미 품질 예산에 묶여 있다 (P-11, platform §6.4).
// 정적 레이어는 PixLayer 로 장치 픽셀에 맞춰 1:1 로 붙인다 (어긋난 배율의 'high' 필터 복사가 소프트웨어 래스터에서 가장 비싼 연산이었다).
import * as HERO from '../../render/hero.js';
import { MOVESETS } from '../../data/movesets.js';
import { TAU, clamp, ease, rgba } from '../../core/math.js';
import { input } from '../../core/input.js';
import { text, taps } from '../../core/ui.js';
import * as UI from '../../core/ui.js';
import { glow, glowOval, PAL, inRect } from './common.js';
import * as MENU from './common.js';

const PI = Math.PI;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** 턴테이블 수치 (platform §7.2) */
export const TT = Object.freeze({
  DEFAULT_YAW: PI / 4,   // 3/4 앞모습 (채색 뷰가 있을 때)
  DRAG_TURN: 2.2,        // 한 바퀴 = 무대 너비 × 2.2
  TAP_PX: 10,            // 이보다 적게 움직이면 탭
  VEL_WIN: 0.08,         // 뗄 때 속도를 재는 구간 (초)
  VEL_MAX: 12,           // rad/s
  DAMP: 0.02,            // 관성 감쇠 v *= DAMP^dt
  SNAP_V: 0.6,           // 이보다 느려지면 칸에 맞춘다 (rad/s)
  SNAP_W: 28,            // 임계 감쇠 스냅 고유 진동수 (반 칸 22.5° 도 ≈ 0.25 초 안에 자리 잡음)
  WHEEL_STEP: PI / 8,    // 휠 한 칸 22.5°
  WHEEL_UNIT: 80,        // 휠 deltaY 누적 이만큼 = 한 칸 (메뉴 Gesture 는 마우스 한 칸 ≈ 90)
  WHEEL_REST: 0.35,      // 휠이 멈추고 이만큼 뒤 칸 사이에 있으면 굴린 쪽 칸으로
  KEY_RATE: 2.6,         // , . (rad/s)
  STICK_RATE: 3.2,       // 오른쪽 스틱 X × (rad/s)
  HOLD_T: 0.35,          // ⟲ ⟳ 버튼을 이만큼 누르고 있으면 계속 회전
  DOUBLE_T: 0.4,         // 두 번 탭 / 두 번 누름 간격
  AUTO_IDLE: 6,          // 자동 회전 시작까지 입력 없는 시간
  AUTO_RATE: 0.6,        // 자동 회전 속도 (한 바퀴 10.5 초)
  REVEAL_T: 0.8,         // 장비 공개 한 바퀴
  SHOW_T: 0.18,          // 공격 시연 전 옆모습으로 도는 시간
  BACK_T: 0.3,           // 시연 뒤 userYaw 로 돌아가는 시간
  RESET_T: 0.35,
});

/** 미리보기 품질: 큰 배율의 역광(림) 패스는 오프스크린 합성이 무거워 느린 기기에서는 자동으로 끈다 */
export const HERO_Q = { rim: true, acc: 0, n: 0 };
/** 메뉴가 프레임마다 자기 그리기 시간을 알려 준다 (ms) */
export function heroPerfSample(ms) {
  if (!HERO_Q.rim) return;
  HERO_Q.acc += ms; HERO_Q.n++;
  if (HERO_Q.n >= 24) {
    if (HERO_Q.acc / HERO_Q.n > 12) HERO_Q.rim = false;
    HERO_Q.acc = 0; HERO_Q.n = 0;
  }
}

/**
 * 오프스크린(레이어·썸네일) 배율: ctx 가 지금 쓰는 실제 픽셀 배율(논리 px → 캔버스 px, uiScale 이면 uiK 포함)을 넘지 않게.
 * 캔버스 백킹은 품질 등급의 픽셀 예산으로 이미 잘려 있으므로 그 이상은 예산 초과 (platform §6.4, P-11). want = 호출측 희망 배율
 */
export function pxScale(ctx, want = Infinity) {
  let s = NaN;
  if (ctx) { try { const m = ctx.getTransform(); s = Math.hypot(m.a, m.b); } catch { s = NaN; } }
  if (!(s > 0)) s = Number.isFinite(want) && want > 0 ? want : 1;   // ctx 없음: 희망값
  else if (want > 0) s = Math.min(s, want);
  return Math.floor(clamp(s, 0.5, 3) * 64) / 64;
}

/**
 * 화소 정렬 캐시 레이어: 정적인 그림을 "지금 ctx 의 장치 픽셀" 크기 캔버스에 한 번 굽고, 단위 변환으로 정수 픽셀 위치에 1:1 로 붙인다.
 * 소프트웨어 래스터에서 배율이 조금이라도 어긋난 drawImage 는 imageSmoothingQuality 'high' 에서 고품질 필터 경로를 타
 * 같은 넓이의 채우기보다 10 배 넘게 비싸다 (fhd2x high 전체 화면 45 ms vs 1:1 4.6 ms — P-11). 1:1 이면 가장 싸고 가장 선명하다.
 * 캔버스 크기 = 그리는 사각형의 장치 픽셀 (백킹 스토어 = 품질 등급의 픽셀 예산 안). 회전·기울임 변환이거나 want(희망 배율)가
 * 장치 배율보다 낮거나 예산을 넘으면 배율 경로로 굽고 'medium' 필터로 붙인다.
 * key 에 ui.fontEpoch 를 넣어 늦게 도착한 웹 글꼴로 다시 굽는다 (글자가 든 레이어).
 */
export class PixLayer {
  constructor() { this.cv = null; this.key = null; }
  draw(ctx, key, x, y, w, h, fn, want = Infinity) {
    if (!(w > 0 && h > 0)) return;
    let m = null;
    try { m = ctx.getTransform(); } catch { m = null; }
    const cv0 = ctx.canvas;
    const maxPx = Math.max(2.5e5, (cv0?.width || 0) * (cv0?.height || 0));
    const axis = !!m && Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && m.a > 0 && Math.abs(m.a - m.d) < 1e-6;
    let exact = axis && !(want > 0 && want < m.a * 0.98) && Math.ceil(w * m.a) * Math.ceil(h * m.a) <= maxPx;
    let s;
    if (exact) s = m.a;
    else {
      s = pxScale(ctx, want);
      if (w * h * s * s > maxPx) s = Math.max(0.25, Math.floor(Math.sqrt(maxPx / (w * h)) * 64) / 64);
    }
    const k = `${key}|${w}|${h}|${s}|${exact ? 1 : 0}|${UI.fontEpoch ?? 0}`;
    if (this.key !== k || !this.cv) {
      const pw = Math.max(1, Math.ceil(w * s)), ph = Math.max(1, Math.ceil(h * s));
      if (!this.cv) this.cv = document.createElement('canvas');
      if (this.cv.width !== pw || this.cv.height !== ph) { this.cv.width = pw; this.cv.height = ph; }
      const c = this.cv.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, pw, ph);
      c.setTransform(s, 0, 0, s, -x * s, -y * s);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      try { fn(c); } catch (e) { console.error(e); }
      this.key = k;
    }
    ctx.save();
    if (exact) {
      // 단위 변환 + 정수 위치 = 필터 없는 복사 (반올림으로 최대 0.5 장치 px 비킨다)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.cv, Math.round(m.a * x + m.e), Math.round(m.d * y + m.f));
    } else {
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(this.cv, 0, 0, this.cv.width, this.cv.height, x, y, this.cv.width / s, this.cv.height / s);
    }
    ctx.restore();
  }
  invalidate() { this.key = null; }
  /** 픽셀 메모리만 돌려준다 (캔버스는 1×1 로 남겨 다음 draw 에서 다시 키워 쓴다) — 탭을 떠날 때 */
  release() { if (this.cv) { this.cv.width = this.cv.height = 1; } this.key = null; }
  free() { if (this.cv) { this.cv.width = this.cv.height = 1; } this.cv = null; this.key = null; }
}

/**
 * PixLayer 묶음: id(목록 줄·칸·글자 덩어리)마다 레이어 하나. 탭의 정적인 글자(외곽선 한글 strokeText 가 소프트웨어 래스터에서
 * 가장 비싼 연산 — fhd2x high 장비 탭 한 프레임 ≈ 30 ms)를 한 번 굽고 매 프레임 1:1 로 붙인다.
 * 매 프레임 바뀌는 것(선택 막대의 맥동·괄호·반짝임·아이콘의 강화 오라)은 굽지 않고 그 위아래에 그대로 그린다.
 * 쓰는 쪽: render 에서 draw(…) 로 그리고, render 끝에 sweep() — 몇 프레임 안 쓴 레이어는 풀어 메모리를 돌려준다.
 */
export class PixCache {
  constructor(keep = 24) { this.m = new Map(); this.keep = keep; this.frame = 0; }
  draw(ctx, id, key, x, y, w, h, fn) {
    let e = this.m.get(id);
    if (!e) { e = { L: new PixLayer(), f: 0 }; this.m.set(id, e); }
    e.f = this.frame;
    e.L.draw(ctx, key, x, y, w, h, fn);
  }
  /** 프레임 끝: 이번 프레임에 안 쓴 레이어 중 오래된 것부터 풀어 keep 개 이하로 (2 초 넘게 안 쓴 것은 항상) */
  sweep() {
    const f = this.frame++;
    if (this.m.size <= this.keep && f % 120 !== 0) return;
    for (const [id, e] of this.m) {
      if ((this.m.size > this.keep && e.f < f) || f - e.f > 120) { e.L.free(); this.m.delete(id); }
    }
  }
  free() { for (const e of this.m.values()) e.L.free(); this.m.clear(); }
  /** 픽셀 메모리만 돌려준다 (탭을 떠날 때 — 돌아오면 다시 굽는다) */
  release() { this.free(); }
}

/** 공통 안내 줄(menu/common.hintRow)이 액션 이름을 글리프로 그리는가 (PLAT-MENU 의 P-01 Scroller.follow 와 함께 들어온다) */
function glyphHints() {
  try { return typeof MENU.Scroller?.prototype?.follow === 'function' || typeof MENU.shouldFollow === 'function'; } catch { return false; }
}
/**
 * 턴테이블 조작 안내 (탭의 hints() 에 덧붙인다): [키/액션, 설명, 터치 문구]
 * 글리프 안내 줄이면 액션 이름(stickR = 오른쪽 스틱 X · , . 키, viewReset = R3 · /), 아니면 지금 기기의 글자 키캡
 */
export function turntableHints(view = null) {
  // 자동 회전을 못 쓰는 동안(채색 뷰 없음·움직임 줄이기)은 '자동 회전' 안내를 뺀다
  const auto = !view || view.spinAllowed();
  if (glyphHints()) return [['stickR', '회전', '영웅을 끌어서 돌려 보기'], ...(auto ? [['viewReset', '자동 회전']] : [])];
  if (input.mode === 'pad') return [['RS', '회전'], ...(auto ? [['R3', '자동 회전']] : [])];
  return [[', .', '회전', '영웅을 끌어서 돌려 보기'], ...(auto ? [['/', '자동 회전']] : [])];
}

/** 렌더러가 보고하는 뷰 지원: null = 계약 없음(임시 대체) */
function viewSupport(p) {
  const HV = HERO.HERO_VIEW;
  if (!HV) return null;
  let painted = true;
  try { const info = HERO.heroViewInfo?.(p); if (info && info.painted === false) painted = false; } catch { painted = true; }
  const steps = Math.max(1, Math.round(Number(HV.steps) || 8));
  return { steps, continuous: !!HV.continuous, painted, full: painted, legacy: false };
}
const LEGACY_SUP = Object.freeze({ steps: 2, continuous: false, painted: false, full: false, legacy: true });

const VIEW_NAMES = { 0: '옆모습(오른쪽)', 45: '3/4 앞모습', 90: '앞모습', 135: '3/4 앞모습', 180: '옆모습(왼쪽)', '-180': '옆모습(왼쪽)', '-135': '3/4 뒷모습', '-90': '뒷모습', '-45': '3/4 뒷모습' };

export class HeroView {
  constructor({ auto = true, turntable = false, game = null } = {}) {
    this.p = {
      cx: 0, bottom: 0, facing: 1, anim: 'idle', animT: 0, move: null, moveT: 0, atkSpeedMul: 1,
      look: null, ch: null, vx: 0, vy: 0, onGround: true, rig: {}, t: 0, stats: { reach: 0 },
      charging: 0, muzzleT: 0, dashT: 0,
    };
    this.clock = 1 + Math.random() * 3;
    this.seq = null; this.si = 0; this.st = 0;
    this.auto = auto; this.cool = 2.2;
    this.key = null;
    this.game = game;
    // ── 턴테이블 ──
    this.tt = !!turntable;
    this.yaw = 0; this.yawVel = 0; this.yawGoal = 0; this.userYaw = 0;
    this.autoSpin = game?.settings?.turntableAuto !== false;
    this._autoSet = this.autoSpin;   // 마지막으로 본 설정값 (메뉴 위에서 설정을 바꾸면 따라간다)
    this._keepYaw = null;            // 채색 뷰가 잠시 사라진 동안 기억해 둔 사용자 각
    this.rateFrom = null;            // , . 키·스틱 회전을 시작한 칸
    this.spinning = false; this.spinNow = false; this.spinGuard = false; this.spinDir = 1;
    this.idleT = 0;
    this.mode = 'idle';          // idle | drag | free | settle | rate | tween | auto
    this.tw = null;              // {from, to, t, dur, fn, user, done}
    this.drag = null;            // {x0, y0, yaw0, moved, s: [t, yaw, …]}
    this.hold = null;            // {id, dir, t}
    this.rate = 0; this.rateSrc = null;
    this.pending = null;         // 옆모습으로 돌고 나서 시작할 시연
    this.wAcc = 0; this.wIdle = 0; this.wheelT = 0; this.wheelDir = 0;
    this.ctime = 0; this.lastTap = -9; this.tapX = 0; this.tapY = 0; this.lastReset = -9;
    this.touched = false;        // 사용자가 돌렸는가 (아니면 채색 뷰가 준비될 때 기본 각으로)
    this.rect = null;
    this.btns = []; this.btnA = 0;
    this.px = null; this.py = null;
    this.introT = 0;
    this._sup = null; this._supLook = undefined; this._supT = -9; this._full = null;
    this._err = false;
  }
  // ───────────────────────── 예전 API ─────────────────────────
  /** look 객체가 바뀌면(장비 미리보기 등) 체인 상태를 새로 만든다 */
  set(look, ch, key = null) {
    const p = this.p;
    if (p.look !== look) {
      const capeChanged = !p.look || !!p.look.cape !== !!look?.cape || p.look.hairStyle !== look?.hairStyle || p.ch !== ch;
      p.look = look;
      if (capeChanged) p.rig = {};
    }
    p.ch = ch;
    if (key !== null && key !== this.key) { this.key = key; }
  }
  /** 무기 콤보 시연 (기본 지상 콤보) */
  showcase(n = 99) {
    const type = this.p.look?.weapon?.type || this.p.ch?.weaponType;
    const ms = MOVESETS[type];
    if (!ms?.ground?.length) return;
    this.startSeq(ms.ground.slice(0, n));
  }
  /** 특정 동작 한 번 (cast/charge/throw 등) */
  pose(anim, dur = 0.8) { this.startSeq([{ anim, dur, _pose: true }]); }
  /** 탭을 열 때 잠깐 뒤 한 번 시연 */
  intro(delay = 0.8) { this.introT = delay; }

  update(dt) {
    const p = this.p;
    this.clock += dt; p.t = this.clock;
    if (this.introT > 0) { this.introT -= dt; if (this.introT <= 0) { this.introT = 0; this.showcase(); } }
    if (this.seq) {
      const mv = this.seq[this.si];
      this.st += dt;
      if (mv._pose) { p.move = null; p.anim = mv.anim; p.animT = this.st; if (mv.anim === 'charge') p.charging = Math.min(0.6, this.st); }
      else { p.move = mv; p.moveT = this.st; p.anim = mv.anim; p.muzzleT = this.st > (mv.hit?.[0] ?? 0) && this.st < (mv.hit?.[0] ?? 0) + 0.07 ? 0.05 : 0; }
      if (this.st >= (mv.dur ?? 0.4) + (mv._pose ? 0 : 0.03)) {
        this.si++; this.st = 0;
        if (this.si >= this.seq.length) {
          this.endSeq();
          this.cool = 5 + Math.random() * 3;
          if (this.tt) this.tweenTo(this.userYaw, TT.BACK_T, { user: true });
        }
      }
    } else {
      p.anim = 'idle'; p.animT += dt;
      // 자동 시연: 턴테이블에선 자동 회전이 대기 동작이다. 자동 회전이 꺼져 있을 때만, 사용자가 돌려 보는 중(6초)이 아닐 때만
      const autoShow = this.auto && !this.pending && (!this.tt || (!this.spinAllowed() && this.idleT >= TT.AUTO_IDLE && this.mode === 'idle'));
      if (autoShow) { this.cool -= dt; if (this.cool <= 0) this.showcase(); }
    }
    if (this.tt) this.stepYaw(dt);
  }
  draw(ctx, cx, bottom, scale, { facing = 1, noFx = false, rim } = {}) {
    const p = this.p;
    if (!p.look) return;
    p.cx = cx; p.bottom = bottom; p.facing = facing;
    const useRim = rim ?? (HERO_Q.rim && !this.lowTier() ? undefined : false);
    const o = useRim === undefined ? { scale, noFx } : { scale, noFx, rim: useRim };
    try {
      if (!this.tt) { HERO.drawHero(ctx, p, null, o); return; }
      if (HERO.HERO_VIEW) { o.yaw = this.yaw; HERO.drawHero(ctx, p, null, o); return; }
      // 임시 대체 (platform §7.3): 옆모습 카드 뒤집기
      const cs = Math.cos(this.yaw);
      p.facing = cs >= 0 ? 1 : -1;
      ctx.save();
      ctx.translate(cx, bottom); ctx.scale(Math.max(0.12, Math.abs(cs)), 1); ctx.translate(-cx, -bottom);
      HERO.drawHero(ctx, p, null, o);
      ctx.restore();
    } catch (e) { if (!this._err) { console.error(e); this._err = true; } }
  }

  // ───────────────────────── 턴테이블 ─────────────────────────
  get reduceMotion() { return !!this.game?.settings?.reduceMotion; }
  lowTier() {
    const g = this.game;
    if (!g) return false;
    return (g.tier ?? g.quality ?? g.settings?.quality) === 'low';
  }
  /**
   * 지금 look 의 뷰 지원. look 이 바뀌면 바로, 아니면 0.5 초마다 다시 묻는다: 로딩이 끝나면 켜지고,
   * 채색 인형이 꺼지거나(갤러리·설정) 사라지면 꺼진다 (켜진 채로 남으면 렌더러의 대체 그림이 정면에서 실처럼 가늘어진다)
   */
  support() {
    const look = this.p.look;
    if (!this._sup || this._supLook !== look || this.clock - this._supT > 0.5) {
      this._sup = viewSupport(this.p) ?? LEGACY_SUP;
      this._supLook = look; this._supT = this.clock;
    }
    return this._sup;
  }
  get defaultYaw() { return this.support().full ? TT.DEFAULT_YAW : 0; }
  /** 칸 크기 (채색 뷰 = 360°/steps, 대체 = 180°: 옆모습에서만 멈춘다) */
  stepSize() { const S = this.support(); return S.full ? TAU / S.steps : PI; }
  continuous() { const S = this.support(); return S.full && S.continuous; }
  snapOf(a) { if (this.continuous()) return a; const s = this.stepSize(); return Math.round(a / s) * s; }
  spinAllowed() { return this.tt && !this.reduceMotion && this.support().full; }
  /** 가장 가까운 옆모습(0 또는 π)의 연속 각 */
  profileOf(a) { const prof = Math.cos(a) >= 0 ? 0 : PI; return a + wrapA(prof - a); }
  /** 지금 멈춰 있을(멈출) 각 */
  restYaw() { return this.mode === 'settle' ? this.yawGoal : this.mode === 'tween' && this.tw?.user ? this.tw.to : this.snapOf(this.yaw); }
  /** 채색 뷰 칸(HERO_VIEW.steps)으로 본 사용자 각 — 지원이 방금 대체로 바뀐 순간에도 채색 칸 기준으로 (snapOf 는 이미 180° 칸) */
  paintedRest() {
    if (this.mode === 'settle') return this.yawGoal;
    if (this.mode === 'tween') return this.tw?.user ? this.tw.to : this.userYaw;
    if (this.mode === 'idle') return this.seq || this.pending ? this.userYaw : this.yaw;
    const st = TAU / Math.max(1, Math.round(Number(HERO.HERO_VIEW?.steps) || 8));
    return Math.round(this.yaw / st) * st;
  }

  stage(rect) { this.rect = rect; }
  swipeBlock(x, y) { return this.tt && (!!this.drag || this.mode === 'drag' || (!!this.rect && inRect(x, y, this.rect))); }
  /** 보는 방향 이름 */
  viewLabel() {
    if (!this.support().full) return '옆모습';
    const deg = Math.round(wrapA(this.yaw) / (PI / 4)) * 45;
    return VIEW_NAMES[deg] ?? '앞모습';
  }

  tweenTo(target, dur, { fn = ease.outCubic, user = true, done = null } = {}) {
    const from = this.yaw;
    this.tw = { from, to: from + wrapA(target - from), t: 0, dur: Math.max(0.01, dur), fn, user, done };
    this.mode = 'tween'; this.yawVel = 0;
  }
  settleTo(goal) { this.yawGoal = goal; this.mode = 'settle'; }
  /** 공격 시연/동작을 멈추고 대기로 */
  endSeq() {
    const p = this.p;
    this.seq = null; this.pending = null;
    p.move = null; p.anim = 'idle'; p.animT = 0; p.charging = 0; p.muzzleT = 0;
  }
  startSeq(seq) {
    if (!this.tt) { this.seq = seq; this.si = 0; this.st = 0; return; }
    if (this.mode === 'drag' || this.hold) return; // 돌리는 중에는 시연하지 않는다
    const rest = this.restYaw();
    if (this.mode !== 'tween' || this.tw?.user) this.userYaw = rest;
    this.stopSpin(false);
    this.seq = null; this.pending = seq; this.si = 0; this.st = 0;
    const to = this.profileOf(this.yaw);
    if (Math.abs(to - this.yaw) < 0.005) { this.yaw = to; this.tw = null; this.mode = 'idle'; this.beginSeq(); } else this.tweenTo(to, TT.SHOW_T, { user: false, done: () => this.beginSeq() });
  }
  beginSeq() { if (!this.pending) return; this.seq = this.pending; this.pending = null; this.si = 0; this.st = 0; }
  /** 사용자가 돌리기 시작: 시연·자동 회전·트윈 취소 */
  beginUser() {
    this.touched = true; this.idleT = 0; this.introT = 0;
    this._keepYaw = null;   // 사용자가 새로 돌렸다: 기억해 둔 각보다 지금 고른 각
    if (this.seq || this.pending) this.endSeq();
    this.spinning = false; this.spinNow = false; this.spinGuard = false;
    this.tw = null;
    if (this.mode === 'tween' || this.mode === 'auto') this.mode = 'idle';
  }
  /** 자동 회전 멈춤 → 도는 쪽의 가까운 칸으로 */
  stopSpin(settle = true) {
    this.spinNow = false;
    if (this.mode !== 'auto') { this.spinning = false; return; }
    this.spinning = false;
    if (settle) this.settleTo(this.snapOf(this.yaw + this.spinDir * 0.12)); else { this.mode = 'idle'; this.yawVel = 0; }
  }
  /** 자동 회전 켜고 끄기. 켜면 바로 돈다 (켠 입력 — 누르고 있는 버튼·키 — 이 회전을 바로 멈추지 않게 guard) */
  toggleAuto() {
    this.autoSpin = !this.autoSpin;
    if (this.autoSpin && this.spinAllowed()) { this.spinNow = true; this.spinGuard = true; } else this.stopSpin(true);
  }
  resetYaw() {
    this.beginUser();
    this.userYaw = this.defaultYaw;
    this.tweenTo(this.userYaw, TT.RESET_T, { user: true });
  }
  /** 장비 공개: 한 바퀴 (움직임 줄이기·옆모습 대체면 예전처럼 시전 동작) */
  reveal() {
    if (!this.tt || this.reduceMotion || !this.support().full) { this.pose('cast', 0.55); return; }
    if (this.mode === 'drag' || this.hold) return;
    const rest = this.restYaw();
    this.endSeq(); this.stopSpin(false); this.idleT = 0;
    this.yaw = wrapA(this.yaw);
    const from = this.yaw;
    // 한 바퀴 돌아 원래 각(rest)에서 멈춘다: to = rest − 2π (오른쪽으로 돈다)
    this.tw = { from, to: from + wrapA(rest - from) - TAU, t: 0, dur: TT.REVEAL_T, fn: ease.outCubic, user: true, done: null };
    this.mode = 'tween'; this.yawVel = 0;
  }
  /** 탭을 다시 열었을 때: 대기 시간을 새로 센다 (떠날 때 끝내지 못한 끌기·누름도 정리) */
  wake() { this.sleep(); this.idleT = 0; }
  /**
   * 탭을 떠날 때(탭 넘기기): 끌기·⟲⟳ 누름·키/스틱 회전·관성을 끝내고 가까운 칸에 멈춘다.
   * 안 그러면 돌아왔을 때 떠나기 전의 끌기가 '방금 뗀 것' 으로 처리되어 옛 속도로 휙 돈다
   */
  sleep() {
    if (!this.tt) return;
    const busy = !!this.drag?.moved || this.mode === 'drag' || this.mode === 'free' || this.mode === 'rate';
    this.drag = null; this.hold = null; this.rate = 0; this.rateSrc = null; this.rateFrom = null;
    this.spinGuard = false;
    if (busy) { this.yawVel = 0; this.settleTo(this.snapOf(this.yaw)); }
  }
  /** , . 키·스틱 회전을 놓을 때 멈출 칸: 반 칸도 못 갔으면(톡 누름·살짝 튕김) 그 방향으로 한 칸, 아니면 조금 앞(0.08 초)의 가까운 칸 */
  rateGoal() {
    const dir = Math.sign(this.rate);
    if (dir && this.rateFrom != null && !this.continuous()) {
      const s = this.stepSize();
      if ((this.yaw - this.rateFrom) * dir < s * 0.5) return this.rateFrom + dir * s;
    }
    return this.snapOf(this.yaw + this.rate * 0.08);
  }

  /** 한 칸 돌리기 (⟲ ⟳ 탭) */
  stepBy(dir) {
    const base = this.mode === 'settle' ? this.yawGoal : this.snapOf(this.yaw);
    const s = this.continuous() ? PI / 4 : this.stepSize();
    this.settleTo(this.snapOf(base) + dir * s);
  }
  /** 휠 k 칸 (deltaY > 0 = 아래로 = 오른쪽으로 돈다) */
  wheelBy(k) {
    this.beginUser();
    const base = this.mode === 'settle' ? this.yawGoal : this.yaw;
    const dir = k > 0 ? -1 : 1;
    this.settleTo(base + dir * Math.abs(k) * TT.WHEEL_STEP);
    this.wheelT = TT.WHEEL_REST; this.wheelDir = dir;
  }

  /** 버튼 id (그린 버튼 위, 터치면 여유 영역 포함) | null */
  btnAt(x, y) {
    if (!this.btns.length) return null;
    try {
      const z = taps.at?.(x, y, this);
      if (z && typeof z.id === 'string' && z.id.startsWith('tt:')) return z.id;
    } catch { /* 등록부 없음 */ }
    for (const b of this.btns) { const h = (b.hs ?? b.r) + 2; if (Math.abs(x - b.x) <= h && Math.abs(y - b.y) <= h) return b.id; }
    return null;
  }

  /**
   * 입력 (update 에서, update(dt) 보다 먼저). ges = 메뉴 Gesture (탭·휠). 반환: 무대를 탭했는가(시연/초기화를 이미 처리함)
   */
  control(dt, ges = null) {
    if (!this.tt) return false;
    this.ctime += dt;
    const p = input.pointer, r = this.rect;
    let any = false, tapped = false;
    // ── 입력이 있었나 (자동 회전 멈춤 · 6초 대기 재시작) ──
    const moved = p.active && this.px !== null && (p.x !== this.px || p.y !== this.py);
    this.px = p.x; this.py = p.y;
    // 마우스를 움직이기만 한 것(hover)은 대기 시간만 새로 세고, 돌고 있는 자동 회전은 누름·끌기·휠·키·스틱이 멈춘다
    if (p.down || p.justDown || input.anyPressed?.() || (input.stickL?.mag ?? 0) > 0.3 || (input.stickR?.mag ?? 0) > 0.3 || (ges?.wheel ?? 0) !== 0) any = true;
    else for (const a of HELD) if (input.down(a)) { any = true; break; }
    if (moved) this.idleT = 0;
    // ── 누름 시작: 버튼 / 무대 끌기 ──
    if (p.justDown) {
      const id = this.btnAt(p.x, p.y);
      // 버튼이 손가락을 가져간다 (메뉴의 길게 누르기 진동·탭·밀기 없음 — 누르고 있기가 곧 연속 회전이다)
      if (id === 'tt:auto') { this.idleT = 0; this.toggleAuto(); tapped = true; ges?.claim?.(); }
      else if (id) {
        const dir = id === 'tt:L' ? 1 : -1;
        this.beginUser();
        this.hold = { id, dir, t: 0 };
        this.stepBy(dir);
        ges?.claim?.();
      } else if (r && inRect(p.x, p.y, r)) {
        this.drag = { x0: p.x, y0: p.y, yaw0: this.yaw, moved: false, s: [] };
      }
    }
    // ── ⟲ ⟳ 누르고 있기 ──
    if (this.hold) {
      if (p.down) {
        this.hold.t += dt;
        if (this.hold.t >= TT.HOLD_T) { this.mode = 'rate'; this.rate = this.hold.dir * TT.KEY_RATE; this.rateSrc = 'btn'; }
      } else {
        if (this.mode === 'rate' && this.rateSrc === 'btn') this.settleTo(this.snapOf(this.yaw + this.rate * 0.08));
        this.hold = null; tapped = true;
      }
    }
    // ── 끌기 ──
    if (this.drag) {
      const d = this.drag;
      if (p.down) {
        const dx = p.x - d.x0;
        if (!d.moved && Math.hypot(dx, p.y - d.y0) > TT.TAP_PX) { d.moved = true; this.beginUser(); d.yaw0 = this.yaw; ges?.claim?.(); }
        if (d.moved) {
          const w = Math.max(40, r?.w ?? 200);
          this.mode = 'drag'; this.tw = null;
          this.yaw = d.yaw0 - (dx / (TT.DRAG_TURN * w)) * TAU;
          d.s.push(this.ctime, this.yaw);
          if (d.s.length > 64) d.s.splice(0, d.s.length - 64);
        }
      } else {
        if (d.moved) {
          const s = d.s, n = s.length / 2;
          let v = 0;
          if (n >= 2) {
            const tl = s[(n - 1) * 2], yl = s[(n - 1) * 2 + 1];
            let i = n - 1;
            while (i > 0 && tl - s[(i - 1) * 2] <= TT.VEL_WIN + 1e-6) i--;
            const dtS = tl - s[i * 2];
            if (dtS > 1e-4) v = (yl - s[i * 2 + 1]) / dtS;
          }
          this.yawVel = clamp(v, -TT.VEL_MAX, TT.VEL_MAX);
          if (Math.abs(this.yawVel) < TT.SNAP_V) this.settleTo(this.snapOf(this.yaw));
          else this.mode = 'free';
        }
        this.drag = null;
      }
    }
    // ── 무대 탭: 공격 시연 / 두 번 탭 = 초기화 ──
    if (r && ges?.tap?.(r) && !this.btnAt(p.x, p.y) && !this.hold && !tapped) {
      tapped = true;
      if (this.ctime - this.lastTap < TT.DOUBLE_T && Math.hypot(p.x - this.tapX, p.y - this.tapY) < 40) { this.lastTap = -9; this.resetYaw(); }
      else { this.lastTap = this.ctime; this.tapX = p.x; this.tapY = p.y; this.idleT = 0; this.showcase(); }
    }
    // ── 휠 (무대 위에서만) ──
    const over = r && p.active && inRect(p.x, p.y, r);
    if (over && ges) {
      if (typeof ges.wheelNotches === 'number' && ges.wheelNotches) this.wheelBy(ges.wheelNotches);
      else if (ges.wheel) {
        this.wAcc += ges.wheel; this.wIdle = 0;
        const k = Math.trunc(this.wAcc / TT.WHEEL_UNIT);
        if (k) { this.wAcc -= k * TT.WHEEL_UNIT; this.wheelBy(k); }
      }
    }
    this.wIdle += dt; if (this.wIdle > 0.25) this.wAcc = 0;
    // ── , . 키 · 오른쪽 스틱 X ──
    if (!this.drag?.moved && !(this.mode === 'rate' && this.rateSrc === 'btn')) {
      const sx = input.stickR?.x || 0, sy = input.stickR?.y || 0;
      let rate = 0;
      // 오른쪽 스틱은 목록 세로 스크롤(Scroller)도 맡는다: 가로가 우세할 때만 돌린다 (위아래로 밀어 스크롤하면 영웅은 그대로)
      if ((input.stickR?.mag ?? 0) > 0 && Math.abs(sx) > 0.02 && Math.abs(sx) >= 0.5 * Math.abs(sy)) rate = -sx * TT.STICK_RATE;
      else if (!((input.stickR?.mag ?? 0) > 0)) { const L = input.down('viewL'), R = input.down('viewR'); if (L !== R) rate = (L ? 1 : -1) * TT.KEY_RATE; }
      if (rate) {
        if (!(this.mode === 'rate' && this.rateSrc === 'key')) { this.rateFrom = this.mode === 'settle' ? this.yawGoal : this.snapOf(this.yaw); this.beginUser(); }
        this.mode = 'rate'; this.rate = rate; this.rateSrc = 'key';
      } else if (this.mode === 'rate' && this.rateSrc === 'key') { this.settleTo(this.rateGoal()); this.rateFrom = null; }
    }
    // ── / · R3 : 자동 회전 켜고 끄기 (키보드는 두 번 누르면 초기화, 패드 R3 는 한 번에 초기화까지) ──
    if (input.pressed('viewReset')) {
      if (input.mode === 'pad') { this.resetYaw(); this.toggleAuto(); this.lastReset = -9; }
      else if (this.ctime - this.lastReset < TT.DOUBLE_T) { this.lastReset = -9; this.toggleAuto(); this.resetYaw(); } // 두 번째 누름: 켜고 끈 것을 되돌리고 초기화
      else { this.lastReset = this.ctime; this.toggleAuto(); }
    }
    if (any) {
      this.idleT = 0;
      if (this.mode === 'auto' && !this.spinNow && !this.spinGuard) this.stopSpin(true);
    }
    // 자동 회전을 켠 입력(누르고 있는 ▶ 버튼·/ 키·R3)은 뗄 때까지 회전을 멈추지 않는다.
    // 뗀 순간의 탭(pointer.tapped → anyPressed)도 그 입력의 일부라, 그 스텝이 지난 뒤에 푼다 (먼저 풀면 ▶ 를 눌러도 바로 멈췄다)
    if (this.spinGuard && !p.down && !p.tapped && !p.justDown && !input.down('viewReset')) this.spinGuard = false;
    return tapped;
  }

  /** 각도 적분 (update 에서) */
  stepYaw(dt) {
    if (!this.p.look) return;
    // 설정(영웅 자동 회전)이 메뉴 위에서 바뀌었으면 따른다 (옵션 화면은 메뉴 위에 열린다 — 탭은 새로 만들어지지 않는다)
    if (this.game) {
      const setAuto = this.game.settings?.turntableAuto !== false;
      if (setAuto !== this._autoSet) { this._autoSet = setAuto; this.autoSpin = setAuto; if (!setAuto) this.stopSpin(true); }
    }
    // 채색 뷰 지원이 바뀜: 사용자가 아직 안 돌렸으면 기본 각으로 (로딩 끝 → 3/4 앞모습), 대체로 바뀌면 옆모습으로.
    // 사용자가 돌려 둔 각은 대체 동안(아직 턴 시트를 읽는 다른 직업 등) 기억했다가 채색 뷰가 돌아오면 되돌린다
    // (직업 탭: 직업을 바꿔 골라도 같은 방향에서 비교 — 그 사이 사용자가 다시 돌렸으면 새로 고른 각이 우선)
    const S = this.support();
    if (this._full === true && !S.full && this.touched && this._keepYaw === null) this._keepYaw = this.paintedRest();
    if (this._full !== S.full) {
      const first = this._full === null;
      this._full = S.full;
      const free = !this.seq && !this.pending && this.mode !== 'drag' && !this.hold;
      if (first) { this.yaw = this.yawGoal = this.userYaw = this.defaultYaw; }
      else if (!this.touched) {
        // 시연 중이면 끝난 뒤 돌아갈 각만 바꾼다 (시연이 끝나면 userYaw 로 돈다)
        this.userYaw = this.defaultYaw;
        if (free) this.tweenTo(this.userYaw, 0.4, { user: true });
      }
      else if (S.full && this._keepYaw !== null) {
        this.userYaw = this._keepYaw; this._keepYaw = null;
        if (free) this.tweenTo(this.userYaw, 0.4, { user: true });
      }
      else if (!S.full && (this.mode === 'idle' || this.mode === 'settle' || (this.mode === 'tween' && this.tw?.user))) { this.tw = null; this.settleTo(this.snapOf(this.yaw)); }
    }
    this.idleT += dt;
    // 자동 회전 시작
    if (this.mode === 'idle' && !this.seq && !this.pending && !this.drag && !this.hold && this.spinAllowed() && this.autoSpin && (this.spinNow || this.idleT >= TT.AUTO_IDLE)) {
      this.mode = 'auto'; this.spinning = true; this.spinNow = false;
    }
    if (this.mode === 'auto' && !this.spinAllowed()) this.stopSpin(true);
    switch (this.mode) {
      case 'tween': {
        const w = this.tw;
        if (!w) { this.mode = 'idle'; break; }
        w.t += dt;
        const u = clamp(w.t / w.dur, 0, 1);
        this.yaw = w.from + (w.to - w.from) * w.fn(u);
        this.yawVel = 0;
        if (u >= 1) {
          this.tw = null; this.yaw = this.yawGoal = w.to; this.mode = 'idle';
          if (w.user) this.userYaw = w.to;
          w.done?.();
        }
        break;
      }
      case 'rate': this.yaw += this.rate * dt; this.yawVel = this.rate; break;
      case 'auto': this.yaw += TT.AUTO_RATE * this.spinDir * dt; this.yawVel = TT.AUTO_RATE * this.spinDir; break;
      case 'free': {
        this.yaw += this.yawVel * dt;
        this.yawVel *= Math.pow(TT.DAMP, dt);
        if (Math.abs(this.yawVel) < TT.SNAP_V) {
          if (this.continuous()) { this.mode = 'idle'; this.yawVel = 0; this.userYaw = this.yawGoal = this.yaw; } else this.settleTo(this.snapOf(this.yaw + this.yawVel * 0.15));
        }
        break;
      }
      case 'settle': {
        if (this.wheelT > 0) {
          this.wheelT -= dt;
          if (this.wheelT <= 0 && !this.continuous()) {
            const s = this.stepSize(), k = this.yawGoal / s;
            this.yawGoal = (this.wheelDir > 0 ? Math.ceil(k - 1e-6) : Math.floor(k + 1e-6)) * s;
          }
        }
        const g = this.yawGoal, w0 = TT.SNAP_W;
        const a = -2 * w0 * this.yawVel - w0 * w0 * (this.yaw - g);
        this.yawVel += a * dt; this.yaw += this.yawVel * dt;
        if (Math.abs(this.yaw - g) < 0.004 && Math.abs(this.yawVel) < 0.05 && this.wheelT <= 0) {
          this.yaw = g; this.yawVel = 0; this.mode = 'idle'; this.userYaw = g;
        }
        break;
      }
      default: break;
    }
    // 수치 표류 방지: 몇 바퀴 이상 돌면 모든 각을 같은 만큼 되돌린다
    if (Math.abs(this.yaw) > 4 * PI && this.mode !== 'tween') {
      const k = Math.round(this.yaw / TAU) * TAU;
      this.yaw -= k; this.yawGoal -= k; this.userYaw = wrapA(this.userYaw);
      if (this.drag) {
        this.drag.yaw0 -= k;
        // 속도 표본도 같이 옮긴다 (안 그러면 끌던 중 되감긴 순간이 뗄 때 속도에 섞여 반대로 최대 속도 관성이 걸린다)
        for (let i = 1; i < this.drag.s.length; i += 2) this.drag.s[i] -= k;
      }
      if (this.rateFrom != null) this.rateFrom -= k;   // 키를 오래 누르고 있던 중: 놓을 때의 칸 계산이 몇 바퀴 되감지 않게
    }
  }

  /** 무대 위 안내 + 버튼 (영웅 다음에 그린다). label=false 면 방향 이름 생략 */
  drawDeck(ctx, t, { label = true, labelY = null } = {}) {
    const r = this.rect;
    this.btns.length = 0;
    if (!this.tt || !r) return;
    const S = this.support();
    if (label) {
      const name = this.viewLabel() + (this.spinning ? ' · 자동 회전' : '');
      const ly = labelY ?? r.y + 17;
      // 방향 이름은 바뀔 때만 굽는다 (외곽선 글자 — P-11)
      if (!this._lbl) this._lbl = new PixLayer();
      this._lbl.draw(ctx, name, r.x + 2, Math.round(ly) - 15, r.w - 4, 21, (c) => {
        text(c, name, r.x + r.w / 2, Math.round(ly), { size: 11, align: 'center', weight: 800, color: PAL.goldMid, ow: 3 });
      });
    }
    // 버튼: 터치 모드, 또는 마우스가 무대 위에 있을 때 (패드에선 숨김 — 하단 안내 줄의 RS·R3)
    const p = input.pointer;
    const touch = !!input.touchMode;
    const hover = !touch && input.mode !== 'pad' && p.active && inRect(p.x, p.y, r);
    const want = touch || hover || !!this.hold;
    this.btnA = want ? Math.min(1, this.btnA + 0.2) : Math.max(0, this.btnA - 0.12);
    if (this.btnA <= 0.01) return;
    // 터치: 보이는 지름 32 CSS px 이상 (누르는 영역은 등록부 여유로 44 CSS px — platform §6.3). 마우스: 작게
    const g = this.game;
    const cssPerUi = (g?.cssScale || 1) * (g?.top?.uiScale ? (g.uiK || 1) : 1);
    const R = touch ? clamp(16 / cssPerUi, 14, 26) : clamp(Math.min(r.w, r.h) * 0.075, 12, 16);
    // 터치: 화살표는 위쪽 1/3 (아래 모서리의 ▶ 버튼과 틈을 두어 둘 다 44 CSS px 영역을 갖게), 마우스: 가운데
    const cy = touch ? r.y + Math.max(R + 22, r.h * 0.34) : r.y + r.h * 0.46;
    const L = { id: 'tt:L', x: r.x + 6 + R, y: cy, r: R }, RR = { id: 'tt:R', x: r.x + r.w - 6 - R, y: cy, r: R };
    const list = [L, RR];
    const canAuto = this.spinAllowed() && S.full;
    const Ra = Math.round(R * (touch ? 0.82 : 0.72));
    if (canAuto) list.push({ id: 'tt:auto', x: r.x + r.w - 7 - Ra, y: r.y + r.h - 7 - Ra, r: Ra });
    ctx.save();
    ctx.globalAlpha *= this.btnA;
    for (const b of list) {
      const hot = (this.hold?.id === b.id) || (hover && Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 2);
      roundBtn(ctx, b.x, b.y, b.r, hot);
      if (b.id === 'tt:auto') {
        ctx.fillStyle = this.autoSpin ? PAL.goldHi : PAL.bone;
        if (this.autoSpin) { const w = b.r * 0.22, h = b.r * 0.9; ctx.fillRect(b.x - w * 1.9, b.y - h / 2, w * 1.4, h); ctx.fillRect(b.x + w * 0.5, b.y - h / 2, w * 1.4, h); }
        else { const s = b.r * 0.5; ctx.beginPath(); ctx.moveTo(b.x - s * 0.7, b.y - s); ctx.lineTo(b.x + s, b.y); ctx.lineTo(b.x - s * 0.7, b.y + s); ctx.closePath(); ctx.fill(); }
      } else orbitArrow(ctx, b.x, b.y + 1, b.r * 0.62, b.id === 'tt:L' ? -1 : 1, hot ? PAL.goldHi : PAL.bone);
      // 누르는 영역: 터치에선 44 CSS px 정사각형 (보이는 원은 작아도 된다 — §6.3 icon), 마우스는 원 크기
      b.hs = Math.max(b.r, touch ? 22 / cssPerUi : 0);
      const rect = { x: b.x - b.hs, y: b.y - b.hs, w: b.hs * 2, h: b.hs * 2 };
      if (this.btnA > 0.5) { try { taps.add?.(b.id, rect, { kind: 'icon', owner: this, src: 'turntable', slop: 0 }); } catch { /* 등록부 없음 */ } }
      this.btns.push(b);
    }
    ctx.restore();
    void t;
  }
}
/** '입력 있음' 으로 보는 누르고 있는 액션 */
const HELD = ['left', 'right', 'up', 'down', 'confirm', 'cancel', 'viewL', 'viewR', 'prevTab', 'nextTab'];

/** 둥근 고딕 버튼 바탕 */
function roundBtn(ctx, x, y, r, hot) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 1, x, y, r);
  g.addColorStop(0, hot ? 'rgba(150,26,44,0.95)' : 'rgba(58,20,34,0.9)'); g.addColorStop(1, 'rgba(14,6,12,0.92)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = hot ? PAL.goldHi : PAL.goldDim; ctx.lineWidth = 1.4; ctx.stroke();
}
/** 회전 화살표 (원 화살표): dir +1 = 시계 방향 ⟳ (오른쪽으로 돌리기), −1 = 반시계 ⟲ (왼쪽으로 돌리기) */
function orbitArrow(ctx, x, y, s, dir, color) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(dir, 1);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.9; ctx.lineCap = 'round';
  const r = s * 0.9, a0 = -PI / 2 + 0.7, a1 = -PI / 2 - 0.28 + TAU; // 위쪽이 트인 원호 (시계 방향으로 돈다)
  ctx.beginPath(); ctx.arc(0, 0, r, a0, a1, false); ctx.stroke();
  const ex = Math.cos(a1) * r, ey = Math.sin(a1) * r;
  const ux = -Math.sin(a1), uy = Math.cos(a1), h = s * 0.62;       // 시계 방향 접선 (위쪽 끝에서는 오른쪽)
  ctx.beginPath();
  ctx.moveTo(ex + ux * h * 0.75, ey + uy * h * 0.75);
  ctx.lineTo(ex - ux * h * 0.35 - uy * h * 0.55, ey - uy * h * 0.35 + ux * h * 0.55);
  ctx.lineTo(ex - ux * h * 0.35 + uy * h * 0.55, ey - uy * h * 0.35 - ux * h * 0.55);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/**
 * 마법진 받침대 (발밑). yaw 를 주면 턴테이블: 룬 고리가 영웅과 함께 돌고(yaw), 바닥에 고정된 8방향 점 중
 * 영웅이 보는 쪽 점이 켜진다. yaw 가 null 이면 예전처럼 천천히 돈다
 */
export function pedestal(ctx, x, y, s, t, color = PAL.gold, yaw = null) {
  ctx.save();
  ctx.imageSmoothingQuality = 'low';   // 발광 스프라이트 확대 (P-11)
  // 바닥 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.ellipse(x, y + 1, 40 * s, 7 * s, 0, 0, TAU); ctx.fill();
  glowOval(ctx, x, y, 78 * s, 18 * s, color, 0.28);
  // 이중 원
  ctx.strokeStyle = rgba(color, 0.55); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(x, y, 62 * s, 12 * s, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = rgba(color, 0.3); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(x, y, 50 * s, 9.6 * s, 0, 0, TAU); ctx.stroke();
  // 룬 눈금 (앞쪽이 밝게): 턴테이블이면 영웅과 함께 돈다.
  // 밝기 8 단계 × 굵기 2 로 묶어 몇 번만 긋는다 (눈금마다 색을 바꿔 28 번 그으면 fhd2x 에서 ≈ 0.7 ms — P-11)
  const spin = typeof yaw === 'number' ? yaw : t * 0.35;
  const TB = RUNE_BINS;
  for (const P of RUNE_PATHS) P.length = 0;
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * TAU + spin;
    const ca = Math.cos(a), sa = Math.sin(a);
    const lvl = Math.min(TB - 1, Math.round((0.5 + 0.5 * sa) * (TB - 1)));
    RUNE_PATHS[lvl * 2 + (i % 4 === 0 ? 1 : 0)].push(x + ca * 52 * s, y + sa * 10 * s, x + ca * 60 * s, y + sa * 11.6 * s);
  }
  for (let b = 0; b < RUNE_PATHS.length; b++) {
    const P = RUNE_PATHS[b];
    if (!P.length) continue;
    ctx.strokeStyle = rgba(color, 0.15 + 0.45 * ((b >> 1) / (TB - 1)));
    ctx.lineWidth = b & 1 ? 2 : 1;
    ctx.beginPath();
    for (let j = 0; j < P.length; j += 4) { ctx.moveTo(P[j], P[j + 1]); ctx.lineTo(P[j + 2], P[j + 3]); }
    ctx.stroke();
  }
  if (typeof yaw === 'number') {
    // 8방향 점 (바닥 고정): 영웅의 코가 가리키는 쪽이 켜진다 (0 = 오른쪽, π/2 = 앞).
    // 꺼진 점은 밝기(= sin 값, 5 가지)가 같은 것끼리 한 번에 채운다
    const k0 = ((Math.round(wrapA(yaw) / (PI / 4)) % 8) + 8) % 8;
    const dr = Math.max(0.75, Math.min(1.3, s));
    for (let lv = -2; lv <= 2; lv++) {
      let any = false;
      for (let k = 0; k < 8; k++) {
        if (k === k0 || DOT_LV[k] !== lv) continue;
        const a = (k * PI) / 4;
        const px = x + Math.cos(a) * 68 * s, py = y + Math.sin(a) * 13.2 * s;
        if (!any) { ctx.beginPath(); any = true; }
        ctx.moveTo(px + 1.6 * dr, py); ctx.arc(px, py, 1.6 * dr, 0, TAU);
      }
      if (any) { ctx.fillStyle = rgba(color, 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(DOT_A[lv + 2]))); ctx.fill(); }
    }
    const a0 = (k0 * PI) / 4, px0 = x + Math.cos(a0) * 68 * s, py0 = y + Math.sin(a0) * 13.2 * s;
    glow(ctx, px0, py0, 9 * Math.max(0.7, s), '#ffd070', 0.9);
    ctx.fillStyle = '#fff0c0';
    ctx.beginPath(); ctx.arc(px0, py0, 2.6 * dr, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
const RUNE_BINS = 8;
const RUNE_PATHS = Array.from({ length: RUNE_BINS * 2 }, () => []);
/** 8방향 점의 밝기 단계 (sin 값 −1 … 1 → −2 … 2) 와 단계마다의 대표 각 */
const DOT_LV = [0, 1, 2, 1, 0, -1, -2, -1];
const DOT_A = [-PI / 2, -PI / 4, 0, PI / 4, PI / 2];

/**
 * 고딕 무대 배경 (정적 부분은 화소 정렬 레이어 PixLayer 에 캐시 → 매 프레임 1:1 복사 한 번)
 * accent: 영웅 기운 색. scale: 레이어 픽셀 배율 희망값 — ctx 의 실제 배율(= 픽셀 예산 안)을 넘지 않게 자른다.
 * 호출 형식은 예전 그대로 (CMP-UI 동료 탭·갤러리도 쓴다)
 */
export class HeroStage {
  constructor() { this.layer = new PixLayer(); }
  draw(ctx, x, y, w, h, t, scale, accent = '#e8c872') {
    // 호출측이 보통 pxScale(ctx) 를 넘긴다: 그 값은 3 에서 잘리고 1/64 로 내림되어, 장치 배율이 3 을 넘으면(데스크톱 UI 배율 1.5 등)
    // '희망 배율 < 장치 배율' 로 보여 매 프레임 확대 복사 경로를 탔다 → 장치 배율 이상을 원하면 화소 정렬 1:1 로
    const want = Number.isFinite(scale) && scale > 0 && scale < pxScale(ctx) - 1e-6 ? scale : Infinity;
    this.layer.draw(ctx, 'stage|' + accent, x, y, w, h, (c) => {
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#171028'); g.addColorStop(0.6, '#0d0816'); g.addColorStop(1, '#050308');
      c.fillStyle = g; c.fillRect(x, y, w, h);
      // 고딕 아치 창문 (차가운 달빛 역광)
      const ax = x + w / 2, aw = Math.min(w * 0.46, 150), top = y + 14, base = y + h * 0.7;
      c.save();
      c.beginPath();
      c.moveTo(ax - aw / 2, base); c.lineTo(ax - aw / 2, top + aw * 0.55);
      c.quadraticCurveTo(ax - aw / 2, top + aw * 0.08, ax, top); c.quadraticCurveTo(ax + aw / 2, top + aw * 0.08, ax + aw / 2, top + aw * 0.55);
      c.lineTo(ax + aw / 2, base); c.closePath();
      const wg = c.createLinearGradient(0, top, 0, base);
      wg.addColorStop(0, 'rgba(120,140,220,0.22)'); wg.addColorStop(0.6, 'rgba(70,60,140,0.12)'); wg.addColorStop(1, 'rgba(40,20,60,0.02)');
      c.fillStyle = wg; c.fill();
      c.clip();
      // 창살
      c.strokeStyle = 'rgba(10,6,16,0.85)'; c.lineWidth = 3;
      for (let i = 1; i < 4; i++) { const lx = ax - aw / 2 + (aw / 4) * i; c.beginPath(); c.moveTo(lx, top); c.lineTo(lx, base); c.stroke(); }
      for (let j = 1; j < 5; j++) { const ly = top + aw * 0.35 + j * (base - top - aw * 0.35) / 5; c.beginPath(); c.moveTo(ax - aw / 2, ly); c.lineTo(ax + aw / 2, ly); c.stroke(); }
      // 붉은 달
      const mg = c.createRadialGradient(ax + aw * 0.14, top + aw * 0.42, 2, ax + aw * 0.14, top + aw * 0.42, aw * 0.22);
      mg.addColorStop(0, 'rgba(255,120,120,0.55)'); mg.addColorStop(0.7, 'rgba(180,30,50,0.25)'); mg.addColorStop(1, 'rgba(120,10,30,0)');
      c.fillStyle = mg; c.fillRect(x, y, w, h);
      c.restore();
      c.strokeStyle = 'rgba(200,160,90,0.28)'; c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(ax - aw / 2 - 5, base); c.lineTo(ax - aw / 2 - 5, top + aw * 0.55);
      c.quadraticCurveTo(ax - aw / 2 - 5, top + aw * 0.03, ax, top - 6); c.quadraticCurveTo(ax + aw / 2 + 5, top + aw * 0.03, ax + aw / 2 + 5, top + aw * 0.55);
      c.lineTo(ax + aw / 2 + 5, base); c.stroke();
      // 빛줄기
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const sx = ax - aw * 0.3 + i * aw * 0.3;
        const lg = c.createLinearGradient(0, top, 0, y + h);
        lg.addColorStop(0, 'rgba(140,160,255,0.07)'); lg.addColorStop(1, 'rgba(140,160,255,0)');
        c.fillStyle = lg;
        c.beginPath(); c.moveTo(sx - 8, top + 20); c.lineTo(sx + 8, top + 20); c.lineTo(sx + 40 + i * 10, y + h); c.lineTo(sx - 10 + i * 10, y + h); c.closePath(); c.fill();
      }
      c.restore();
      // 바닥
      const fy = y + h * 0.78;
      const fg = c.createLinearGradient(0, fy, 0, y + h);
      fg.addColorStop(0, 'rgba(40,24,40,0.9)'); fg.addColorStop(1, 'rgba(6,3,8,1)');
      c.fillStyle = fg; c.fillRect(x, fy, w, y + h - fy);
      c.fillStyle = 'rgba(200,160,110,0.18)'; c.fillRect(x, fy, w, 1);
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
      for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(ax + i * 22, fy); c.lineTo(ax + i * 60, y + h); c.stroke(); }
      // 가장자리 어둡게
      const vg = c.createRadialGradient(ax, y + h * 0.55, h * 0.2, ax, y + h * 0.55, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.7)');
      c.fillStyle = vg; c.fillRect(x, y, w, h);
      // 영웅 뒤 기운 (영웅 색): 무대 넓이만 한 가산 합성이라 매 프레임 그리면 비싸다 → 함께 굽는다 (P-11)
      c.imageSmoothingQuality = 'low';
      glow(c, x + w / 2, y + h * 0.5, h * 0.42, accent, 0.17);
    }, want);
    // 동적: 떠다니는 먼지 (부드러운 발광 스프라이트 확대는 'low' 필터로 충분하고 훨씬 싸다 — P-11)
    ctx.save();
    ctx.imageSmoothingQuality = 'low';
    for (let i = 0; i < 7; i++) {
      const k = (t * 0.05 + i * 0.137) % 1;
      const mx = x + w * (0.15 + ((i * 0.31) % 0.7)) + Math.sin(t * 0.8 + i) * 6;
      const my = y + h * (0.85 - k * 0.8);
      glow(ctx, mx, my, 5, i % 2 ? '#ffd9a0' : '#a8b8ff', 0.35 * Math.sin(k * Math.PI));
    }
    ctx.restore();
  }
  free() { this.layer.free(); }
  /** 픽셀 메모리만 돌려준다 (탭을 떠날 때) */
  release() { this.layer.release(); }
}

/** 영웅의 대표 기운 색 (직업 aura → 무기 속성 → 트림) */
export function accentOf(look) {
  if (!look) return PAL.gold;
  const c = look.aura?.color || look.accAura?.color;
  if (c && c.startsWith('#')) return c;
  const el = look.weapon?.element;
  const EC = { holy: '#fff2b0', fire: '#ff7a2a', ice: '#9fe8ff', dark: '#b060ff', thunder: '#bfe0ff' };
  if (el && EC[el]) return EC[el];
  return look.trim && look.trim.startsWith('#') ? look.trim : PAL.gold;
}
