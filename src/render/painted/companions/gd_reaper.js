// 채색 수호신: 모르스 (gd_reaper, 꼬마 사신) — CMP-GUARD-ART-B. T1 채색 퍼핏 (docs/art/ENEMY_PIPELINE.md 방식, 에셋 assets/painted/companions/gd_reaper/).
// 조각: body (두건 · 상아 해골(초록 눈불) · 너덜 로브 · 연기 밑단 — Kling 편집으로 낫·등불을 지운 몸, 원본이 왼쪽을 봐서 좌우 반전) ·
//   fists (쥔 뼈 주먹 둘: 낫 자루 위에 덧그린다) · scythe (큰 낫, 앞 주먹에서 돈다: 각 0 = 곧게 세움, + = 앞으로 내리침) ·
//   lantern (날 아래 자루에 매달린 초록 영혼 등불, 진자) · book (한가할 때 곁에 떠 있는 장부).
// 상태 (guardian.js · guardian_ai_b.js anim): idle 낫을 앞으로 기울여 들고 둥실 · move 기울기 ·
//   blink(0.1초) 연기로 흩어짐(늘어나며 흐려짐 + 초록 잔상) → attack(0.08 까지 치켜들고 0.08~0.17 앞으로 내리침: 0.1 쯤 적중, 날 잔상) ·
//   assist 돌진 뒤 0.12~0.21 내리침 · skill(0.75초) 0~0.18 높이 들고 0.18~0.54 크게 휘두름 (fxScytheSweep wind 0.18 · sweep 0.36 과 같은 시각) → 되돌림 ·
//   hurt 움찔 · appear 연기에서 솟음 · emote 낫 한 바퀴 돌리기 + 장부 넘기기. 각성: 뒤에 초록 유령 낫 하나 더.
// 그리기 규약: drawGuardian 이 발 중앙 원점·facing 반전을 걸어 준 ctx. world 는 null 일 수 있다(메뉴). 게임 상태를 바꾸지 않는다.
import * as K from '../enemy_kit.js';
import { clamp, lerp, TAU } from '../../../core/math.js';
import { gGlow, gAwake } from '../../guardians.js';

export const spec = { id: 'gd_reaper', tier: 'T1', src: '../companions/gd_reaper', bake: { outline: 0.3, flash: false, deep: { book: 0.35 }, deepTint: 'rgb(20,40,28)', glow: { scythe: '#7aff9a', body: '#7aff9a' } } };

const _q = [0, 0];
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));
const R0 = 0.42;   // 평소 낫 기울기 (자루가 해골 앞을 지나게)

async function load() {
  const rig = K.requestRig(spec);
  await rig.promise;
  if (!rig.ready) throw new Error('rig ' + spec.id);
  return rig;
}

/** 낫 각 · 휘두름 여부 · 몸 기울기 (절차 그림 reaperPose 와 같은 시각) */
const POSE = { rot: 0, trail: 0, lean: 0, prev: 0 };
function pose(an, at, t) {
  const P = POSE;
  let rot = R0 + Math.sin(t * 1.7) * 0.05, trail = 0, lean = 0, prev = rot;
  if (an === 'attack') {
    if (at < 0.08) rot = lerp(R0, -0.7, easeOut(at / 0.08));
    else if (at < 0.17) { const k = (at - 0.08) / 0.09; rot = lerp(-0.7, 2.3, easeIO(k)); prev = lerp(-0.7, 2.3, easeIO(Math.max(0, k - 0.45))); trail = 1; lean = 0.1; }
    else { const k = clamp((at - 0.17) / 0.28, 0, 1); rot = lerp(2.3, R0, easeIO(k)); lean = 0.1 * (1 - k); }
  } else if (an === 'assist') {
    if (at < 0.12) rot = lerp(R0, -0.6, easeOut(at / 0.12));
    else if (at < 0.21) { const k = (at - 0.12) / 0.09; rot = lerp(-0.6, 2.15, easeIO(k)); prev = lerp(-0.6, 2.15, easeIO(Math.max(0, k - 0.45))); trail = 1; lean = 0.12; }
    else { const k = clamp((at - 0.21) / 0.3, 0, 1); rot = lerp(2.15, R0, easeIO(k)); lean = 0.12 * (1 - k); }
  } else if (an === 'skill') {
    if (at < 0.18) { const k = easeOut(at / 0.18); rot = lerp(R0, -1.2, k); lean = -0.12 * k; }
    else if (at < 0.54) { const k = (at - 0.18) / 0.36; rot = lerp(-1.2, 2.8, easeIO(k)); prev = lerp(-1.2, 2.8, easeIO(Math.max(0, k - 0.3))); trail = 1; lean = lerp(-0.12, 0.16, easeIO(k)); }
    else { const k = clamp((at - 0.54) / 0.21, 0, 1); rot = lerp(2.8, R0, easeIO(k)); lean = 0.16 * (1 - k); }
  } else if (an === 'emote') rot = R0 + easeIO(clamp((at - 0.15) / 0.6, 0, 1)) * TAU;
  else if (an === 'hurt') rot = R0 + 0.45;
  else if (an === 'blink') rot = R0 - 0.3;
  P.rot = rot; P.trail = trail; P.lean = lean; P.prev = trail ? prev : rot;
  return P;
}

function draw(ctx, g, world, rig) {
  const t = g.t ?? 0, at = g.animT ?? 0, an = g.anim ?? 'idle';
  const f = g.facing < 0 ? -1 : 1, vxf = (g.vx ?? 0) * f;
  const cast = an === 'skill', blink = an === 'blink', emote = an === 'emote';
  const atkLike = an === 'attack' || an === 'assist' || cast;
  const hurt = an === 'hurt' ? 1 - clamp(at / 0.3, 0, 1) : 0;
  const ap = an === 'appear' ? easeOut(clamp(at / 0.3, 0, 1)) : 1;
  const aw = gAwake(g), q = world?.fx?.quality ?? 1;
  const P = pose(an, at, t);
  const bob = Math.sin(t * 2.1 + (g.seed ?? 0)) * 1.6;
  const tilt = clamp(vxf * 0.0007, -0.15, 0.22) - hurt * 0.3 + P.lean;
  let sc = 0.4 + 0.6 * ap, sy = an === 'appear' ? ap : 1, a = 1, bk = 0;
  if (blink) { bk = clamp(at / 0.1, 0, 1); a = 1 - bk * 0.85; sy = 1 + bk * 0.5; sc *= 1 - bk * 0.3; }
  if (hurt > 0) ctx.translate(Math.sin(t * 70) * 1.2 * hurt, 0);
  // 초록 기운 (몸 뒤)
  gGlow(ctx, 0, -20 + bob, cast ? 30 : 14, '#7aff9a', (cast ? 0.45 : 0.14) + (aw ? 0.08 : 0));
  K.begin(ctx, rig, 0);
  // 장부 (한가할 때 곁에 떠 있다 — 몸 뒤)
  if (!atkLike && !blink) {
    const bx = emote ? lerp(-13, -7, clamp(at / 0.2, 0, 1)) : -13, by = -25 + Math.sin(t * 1.9 + 1) * 1.4 + bob * 0.5;
    const flap = Math.sin(t * (emote ? 9 : 2.4)) * 0.12;
    K.put('book', 'a', bx, by, -0.2 + flap, 1, 0.9 + flap * 0.5, 0.95 * a, emote ? 'base' : 'deep');
  }
  K.end();
  ctx.save();
  if (a < 1) ctx.globalAlpha *= a;
  ctx.translate(0, bob);
  ctx.translate(0, -18); ctx.rotate(tilt); if (sc !== 1 || sy !== 1) ctx.scale(sc, sc * sy); ctx.translate(0, 18);
  K.begin(ctx, rig, 0);
  K.pivotPos('body', 'a', 'grip', 0, 0, 0, 1, 1, _q);
  const gx = _q[0], gy = _q[1];
  // 각성: 뒤에 초록 유령 낫 (좌우 반전, 가산)
  if (aw) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('scythe', 'a', gx - 7, gy + 1, -(P.rot * 0.6) - 0.45, -1, 1, 0.3 + Math.sin(t * 3) * 0.06, 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.put('body', 'a', 0, 0);
  // blink: 흩어지며 남는 초록 잔상 (몸 실루엣)
  if (blink && bk > 0) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('body', 'a', -3 * bk, -2 * bk, 0, 1 + bk * 0.2, 1 + bk * 0.25, 0.4 * (1 - bk * 0.5), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  // 휘두름 잔상: 앞선 각도의 날 실루엣 둘 (가산)
  if (P.trail && q > 0.5) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    for (let i = 2; i >= 1; i--) K.put('scythe', 'a', gx, gy, lerp(P.rot, P.prev, i / 2), 1, 1, 0.22 / i, 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.put('scythe', 'a', gx, gy, P.rot);
  // 등불: 날 아래 자루에 매달려 흔들린다 (휘두를 때 뒤로 끌림)
  K.pivotPos('scythe', 'a', 'hang', gx, gy, P.rot, 1, 1, _q);
  const lx = _q[0], ly = _q[1], lr = Math.sin(t * 3.1) * 0.25 - (P.trail ? 0.8 : 0) - hurt * 0.4;
  K.put('lantern', 'a', lx, ly, lr);
  K.pivotPos('lantern', 'a', 'fire', lx, ly, lr, 1, 1, _q);
  const fx = _q[0], fy = _q[1];
  K.put('fists', 'a', gx + P.lean * 4, gy, 0);
  K.pivotPos('body', 'a', 'eye', 0, 0, 0, 1, 1, _q); const ex = _q[0], ey = _q[1];
  K.pivotPos('body', 'a', 'eye2', 0, 0, 0, 1, 1, _q); const ex2 = _q[0], ey2 = _q[1];
  K.end();
  gGlow(ctx, fx, fy, (cast ? 9 : 6) + Math.sin(t * 7) * 0.6, '#7aff9a', 0.55, 0.3);
  const ef = cast ? 1 + clamp(at / 0.18, 0, 1) : an === 'attack' || an === 'assist' ? 1.4 : 1;
  gGlow(ctx, ex, ey, 1.7 * ef, '#7aff9a', 0.8, 0.2); gGlow(ctx, ex2, ey2, 1.4 * ef, '#7aff9a', 0.7, 0.2);
  // 날 끝 궤적 (얇은 초록 호)
  if (P.trail && q > 0.5) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#b8ffc8'; ctx.lineCap = 'round';
    const a0 = P.prev - 0.7, a1 = P.rot - 0.7;
    ctx.globalAlpha *= 0.5; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(gx, gy, 33.5, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  if (blink && q > 0.5) {   // 흩어지는 연기
    for (let i = 0; i < 5; i++) gGlow(ctx, -4 + i * 2.4 - bk * 6, -8 - i * 5 - bk * 4, 4 + bk * 4, '#1a3a24', 0.5 * (1 - bk * 0.5));
  }
  if (an === 'assist' && at < 0.12 && q > 0.5) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.6 * (1 - at / 0.12); ctx.fillStyle = '#7aff9a';
    for (let i = 0; i < 4; i++) ctx.fillRect(-24 - i * 6, -26 + i * 4, 14 - i, 0.8);
    ctx.restore();
  }
}

export default { id: 'gd_reaper', kind: 'companion', load, draw };
