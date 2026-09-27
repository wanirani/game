// 걸음 포즈 순수 함수 (owner: FEEL-MOVE) — feel.md §3.3.2, §3.3.3 · MASTER_PLAN §1.7 drawHero 2·5단계
// render/hero.js 가 부른다 (hero.js 를 import 하면 안 된다: 순환 → TDZ). 자세 객체 P 의 필드는 hero.js 와 같다:
//   py 엉덩이 높이(−41 서 있음, +면 낮아짐) · lean 몸 기울기 · hd 머리 · f1x/f1y f2x/f2y 가까운/먼 발 · t1/t2 발끝(−면 뒤꿈치로 버팀)
//   a1/a2 팔 각도(0 앞, π/2 아래, 커지면 뒤로) · r1/r2 팔 뻗음 · sq 세로 배율 · px 몸 가로 흔들림
//  gaitPose(P, K, anim, p, at)   'walk' | 'sprint' | 'run_start' | 'skid' | 'pivot' | 'land_heavy' 자세를 P 에 쓴다
//                                (at = 애니메이션 경과 초, p.gaitPh 가 숫자면 그 걸음 위상, 아니면 시간으로 돈다)
//  applyFeelOverlay(P, p)        블렌드 뒤·골격 풀이 전: P.sq *= p.feel.sq, P.lean += 가속 기울기 + 벽차기 반동 + 공중 질주 기울기
//                                (p.feel 이 없거나 p.ride 면 아무것도 하지 않는다; 반환값 없음 = 색 섬광 없음)
//  GAIT_ANIMS {anim: holdFor 모드}  hero.js 가 gaitPose 뒤에 holdFor(P, K, 모드) 로 무기 쥐는 법을 입힌다
// 위상 규약: hero.js poseRun 과 같다 — 가까운 발은 ph = GAIT.contactPh (π/2 − 0.45) + 2kπ, 먼 발은 그 + π 에 땅에 닿는다.
import { clamp, lerp, ease } from '../core/math.js';
import { GAIT, PERSONALITY, SKID, LAND, SPRINT } from '../data/feel_move.js';

const PI = Math.PI, HP = PI / 2;

export const GAIT_ANIMS = { walk: 'run', run_start: 'run', sprint: 'dash', skid: 'idle', pivot: 'idle', land_heavy: 'idle' };
/** 전환 블렌드(초) — hero.js gaitBlend 와 같은 값 (feel §3.3.3) */
export const GAIT_BLEND = { skid: 0.06, pivot: 0.06, land_heavy: 0.06, walkRunSprint: 0.12 };

const persOf = (p) => PERSONALITY[p?.ch?.id ?? p?.hero?.charId] ?? PERSONALITY._default;
const phaseOf = (p, at) => (typeof p?.gaitPh === 'number' ? p.gaitPh : (p?.t ?? at ?? 0) * 12);
/** 실제 속도 / 그 걸음새의 기준 속도 → 보폭 배율 (가속 중에는 작게) */
function ampOf(p, mul) {
  const sp = (p?.ch?.move?.speed ?? 275) * mul;
  const v = Math.abs(p?.vx ?? sp);
  return clamp(v / sp, 0.45, 1.15);
}

/** 달리기류 보폭 (poseRun 과 같은 위상 규약). g = GAIT.walk | run | sprint */
function stride(P, ph, g, pe, amp) {
  const c = GAIT.contactPh;
  const s1 = Math.sin(ph), c1 = Math.cos(ph);
  const A = g.A * (pe.A ?? 1) * amp, lift = g.lift * amp, bob = g.bob * (pe.bob ?? 1) * amp;
  // 엉덩이: 발이 닿고 조금 뒤(0.45 rad)에 가장 낮다 — 무게가 실린다
  P.py = -40.4 + bob * 0.5 * (1 + Math.cos(2 * (ph - c - 0.45)));
  P.lean = g.lean * (pe.lean ?? 1) + 0.03 * Math.sin(2 * ph);
  P.hd = g.hd;
  P.f1x = 2 + A * s1; P.f1y = -2.8 - Math.max(0, Math.cos(ph + 0.45)) * lift;
  P.f2x = 2 - A * s1; P.f2y = -2.8 - Math.max(0, Math.cos(ph + PI + 0.45)) * lift;
  P.t1 = Math.max(0, c1) * 0.7 + Math.max(0, -s1) * 0.35; P.t2 = Math.max(0, -c1) * 0.7 + Math.max(0, s1) * 0.35;
  const arm = g.arm * (pe.arm ?? 1) * clamp(amp, 0.6, 1);
  P.a1 = HP - 0.2 + arm * s1; P.r1 = g.reach; P.a2 = HP - 0.2 - arm * s1; P.r2 = g.reach;
}

function walkPose(P, p, pe, ph) {
  const g = GAIT.walk, c = GAIT.contactPh;
  stride(P, ph, g, pe, ampOf(p, g.mul));
  // 뒤꿈치→발끝 굴림: 닿는 순간 0.25, 딛는 동안 풀린다
  P.t1 = g.toe * Math.max(0, Math.cos(ph - c)); P.t2 = g.toe * Math.max(0, Math.cos(ph - c - PI));
  P.a1 = HP - 0.05 + g.arm * (pe.arm ?? 1) * Math.sin(ph); P.a2 = HP - 0.05 - g.arm * (pe.arm ?? 1) * Math.sin(ph);
}
function sprintPose(P, p, pe, ph) {
  const g = GAIT.sprint;
  stride(P, ph, g, pe, ampOf(p, pe.sprintK ?? 1.32));
  if (pe.ninja) {   // 리아·아젤: 두 팔을 뒤로 젖힌 닌자 질주
    const n = g.ninja;
    P.a1 = n.a1 + 0.08 * Math.sin(ph); P.r1 = n.r; P.a2 = n.a2 + 0.08 * Math.sin(ph); P.r2 = n.r;
    P.lean = n.lean * (pe.lean ?? 1) + 0.03 * Math.sin(2 * ph);
  } else {           // 팔을 굽혀 크게 펌프질 (r 0.6)
    const s = Math.sin(ph), arm = g.arm * (pe.arm ?? 1);
    P.a1 = HP - 0.35 + arm * s; P.a2 = HP - 0.35 - arm * s;
  }
  P.hd = g.hd - 0.02 * Math.sin(2 * ph);
}
/** 달리기 시작 (처음 0.08초): 몸을 낮추고 확 숙였다가 달리기 자세로 */
function runStartPose(P, p, pe, ph, at, dur = SKID.runStartT) {
  stride(P, ph, GAIT.run, pe, 0.8);
  const k = ease.outQuad(clamp(at / dur, 0, 1));
  P.lean = lerp(0.34 * (pe.lean ?? 1), P.lean, k);
  P.py += 3 * (1 - k);
  P.hd = lerp(-0.2, P.hd, k);
  P.a1 = lerp(HP - 0.9, P.a1, k); P.a2 = lerp(HP + 1.2, P.a2, k);   // 앞팔은 앞으로, 뒷팔은 뒤로 확
  P.f1x = lerp(9, P.f1x, k); P.f2x = lerp(-11, P.f2x, k); P.t2 = lerp(0.9, P.t2, k);
}
/** 미끄러짐: 앞발로 버티며 뒤로 젖힘, 팔은 앞으로 (뒤꿈치가 바닥을 긁는다) */
function skidPose(P, pe, at, dur) {
  const u = clamp(at / (dur || 0.2), 0, 1);
  P.py = -37; P.lean = -0.22 * (pe.lean ?? 1); P.hd = 0.2;
  P.f1x = 16; P.f1y = -2.8; P.f2x = -6; P.f2y = -2.8; P.t1 = -0.4; P.t2 = 0.15;
  P.a1 = -0.2; P.r1 = 0.9; P.a2 = 0.3; P.r2 = 0.9;
  P.sq = 0.96;
  P.px = Math.sin(at * 95) * 0.45 * (1 - u);   // 바닥을 긁는 떨림
}
/** 방향 전환: 앞 절반은 미끄러짐(옛 방향), 뒤 절반은 새 방향으로 박차고 나감 */
function pivotPose(P, p, pe, ph, at) {
  const T = SKID.pivotT, h = T * 0.5;
  if (at < h) {
    skidPose(P, pe, at, T);
    P.lean = lerp(-0.15, -0.28, at / h); P.py = -38; P.f1x = 13;
  } else {
    const k = clamp((at - h) / h, 0, 1);
    runStartPose(P, p, pe, ph, at - h, h);
    P.lean = lerp(-0.05, 0.3, ease.outQuad(k)); P.py += 3 * (1 - k);
  }
}
/** 무거운 착지: 무릎을 깊게 굽히고 팔을 벌려 버틴다 (k = 1 − t/0.18) */
function landHeavyPose(P, pe, at) {
  const k = 1 - clamp(at / LAND.heavyT, 0, 1), e = ease.outQuad(k);
  P.py = -41 + 9 * e; P.lean = 0.035 + 0.35 * e; P.hd = -0.3 * e;
  P.f1x = lerp(5, 11, e); P.f1y = -2.8; P.f2x = lerp(-6.5, -10, e); P.f2y = -2.8; P.t1 = 0; P.t2 = 0.3 * e;
  P.a1 = lerp(HP - 0.26, 0.6, e); P.r1 = 0.9; P.a2 = lerp(HP + 0.22, 2.6, e); P.r2 = 0.9;
}

export function gaitPose(P, K, anim, p, at) {
  if (!P) return;
  const pe = persOf(p), ph = phaseOf(p, at), t = at ?? 0;
  switch (anim) {
    case 'walk': walkPose(P, p, pe, ph); break;
    case 'sprint': sprintPose(P, p, pe, ph); break;
    case 'run_start': runStartPose(P, p, pe, ph, t); break;
    case 'skid': skidPose(P, pe, t, p?.fm?.fxDur || SKID.runT); break;
    case 'pivot': pivotPose(P, p, pe, ph, t); break;
    case 'land_heavy': landHeavyPose(P, pe, t); break;
    default: break;
  }
  if (K?.B >= 1.25 && (anim === 'skid' || anim === 'land_heavy')) { P.f1x += 1.5; P.f2x -= 1.5; }   // 큰 체격은 발을 더 벌린다
}

export function applyFeelOverlay(P, p) {
  const f = p?.feel;
  if (!P || !f || p.ride) return;
  if (typeof f.sq === 'number' && f.sq !== 1 && f.sq > 0) P.sq *= f.sq;
  const lean = (f.accLean || 0) + (f.leanKick || 0) + (p.sprinting && !p.onGround ? SPRINT.airLean : 0);
  if (lean) P.lean += lean;
}
