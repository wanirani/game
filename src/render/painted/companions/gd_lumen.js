// 채색 수호신: 루멘 (gd_lumen, 등불 해파리) — CMP-GUARD-ART-B. T1 채색 퍼핏 (docs/art/ENEMY_PIPELINE.md 방식, 에셋 assets/painted/companions/gd_lumen/).
// 조각: bell (청록·진주빛 반투명 갓 + 속에 매달린 놋쇠 등불 + 주름 테두리, 테두리 중심 피벗) ·
//   tent (주름진 구완 + 분홍 끝의 가는 촉수: 갓 아래에서 warpY 로 물결치며 흔들린다).
// 상태 (guardian.js · guardian_ai_b.js anim): idle 헤엄 박동 (수축 0~0.3 → 이완, 갓이 납작해졌다 부풀고 촉수가 뒤로 끌림) · move 박동이 빨라지고 촉수가 뒤로 날림 ·
//   attack(0.3초) 0.06 쯤 촉수를 앞으로 휘둘러 찌릿 (전격은 guardian_ai_b 의 fxLumenBolts) · assist 돌진 뒤 0.14 휘두름 ·
//   skill(0.6초) 0~0.15 등불이 확 타오르며 갓이 부풂 (fxLumenFlash 와 같은 시각) → 가라앉음 · hurt 등불 분홍 깜빡 ·
//   appear 커지며 나타남 · emote 한 바퀴 돌며 거품. 각성: 쌍둥이 빛방울 + 오로라 고리.
// 그리기 규약: drawGuardian 이 발 중앙 원점·facing 반전을 걸어 준 ctx. world 는 null 일 수 있다(메뉴). 게임 상태를 바꾸지 않는다.
import * as K from '../enemy_kit.js';
import { clamp, TAU } from '../../../core/math.js';
import { gGlow, gStar, gHalo, gAwake } from '../../guardians.js';

export const spec = { id: 'gd_lumen', tier: 'T1', src: '../companions/gd_lumen', bake: { outline: 0, flash: false, glow: { bell: '#6fe8ff', tent: '#6fe8ff' } } };

const RIM_Y = -22;   // 갓 테두리 (촉수 끝이 발 원점 근처)
const _q = [0, 0];
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));

async function load() {
  const rig = K.requestRig(spec);
  await rig.promise;
  if (!rig.ready) throw new Error('rig ' + spec.id);
  return rig;
}

// warpY 오프셋: u = 0 테두리 … 1 촉수 끝. 매 프레임 값만 바꿔 쓰는 닫힘 하나 (할당 없음).
// warpY 는 텍셀 단위를 받는다 → 아래 수치(텍셀 밀도 1.25 에서 맞춘 값)를 W.k = rig.td / 1.25 로 곱해
// 화면 크기·품질(텍셀 밀도 1.25~2.75)과 상관없이 같은 논리 px 만큼 흔들리게 한다 (ghost.js 처럼 rig.td 를 곱하는 규약)
const W = { t: 0, lean: 0, lash: 0, pulse: 0, k: 1 };
const _o = [0];
const tentOff = (u) => {
  const u2 = u * u;
  _o[0] = (Math.sin(W.t * 2.3 - u * 4.2) * 2.2 * u + Math.sin(W.t * 3.7 - u * 7) * 0.9 * u2   // 물결
    - W.lean * 7 * u2 - W.pulse * 2.5 * u2                                                     // 헤엄: 뒤로 끌림
    + W.lash * 14 * u2) * W.k;                                                                 // 찌르기: 앞으로 휘두름
  return _o;
};

function draw(ctx, g, world, rig) {
  const t = g.t ?? 0, at = g.animT ?? 0, an = g.anim ?? 'idle';
  const f = g.facing < 0 ? -1 : 1, vxf = (g.vx ?? 0) * f;
  const cast = an === 'skill', atk = an === 'attack', asst = an === 'assist', emote = an === 'emote';
  const hurt = an === 'hurt' ? 1 - clamp(at / 0.3, 0, 1) : 0;
  const ap = an === 'appear' ? easeOut(clamp(at / 0.3, 0, 1)) : 1;
  const aw = gAwake(g), q = world?.fx?.quality ?? 1;
  // 헤엄 박동: 수축(0~0.3) → 이완
  const per = Math.abs(vxf) > 60 ? 0.85 : 1.4;
  const ph = (((t + (g.seed ?? 0)) / per) % 1 + 1) % 1;
  let pulse = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI * 0.5) : 1 - easeOut((ph - 0.3) / 0.7);
  if (atk || asst) pulse = Math.max(pulse, 1 - clamp(at / 0.3, 0, 1));
  let flare = 0;
  if (cast) { flare = at < 0.15 ? at / 0.15 : 1 - clamp((at - 0.15) / 0.45, 0, 1); pulse = at < 0.1 ? 1 : pulse * 0.4; }
  const bob = Math.sin(t * 2 + (g.seed ?? 0)) * 1.2 - pulse * 1.4;
  const lean = clamp(vxf * 0.002, -0.6, 1);
  const lash = atk ? clamp(1 - Math.abs(at - 0.06) / 0.16, 0, 1) : asst ? clamp(1 - Math.abs(at - 0.14) / 0.14, 0, 1) : 0;
  let tilt = clamp(vxf * 0.0007, -0.14, 0.22) - hurt * 0.4 + lash * 0.18, spin = 0;
  if (emote) spin = easeIO(clamp((at - 0.1) / 0.7, 0, 1)) * TAU;
  const sc = 0.4 + 0.6 * ap;
  const lampCol = hurt > 0 && Math.sin(t * 40) > 0 ? '#ff9ae8' : '#ffd070';
  if (hurt > 0) ctx.translate(Math.sin(t * 70) * 1.1 * hurt, 0);
  gGlow(ctx, 0, RIM_Y + 1 + bob, 17 + flare * 26 + (aw ? 4 : 0), '#6fe8ff', 0.32 + flare * 0.5 + (aw ? 0.1 : 0) + Math.sin(t * 3.1) * 0.04);   // 갓·촉수의 생물 발광
  ctx.translate(0, bob);
  ctx.translate(0, RIM_Y - 3); ctx.rotate(tilt + spin); if (sc !== 1) ctx.scale(sc, sc); ctx.translate(0, -(RIM_Y - 3));
  W.t = t; W.lean = lean; W.lash = lash; W.pulse = pulse; W.k = (rig.td || 1.25) / 1.25;
  const bx = 1 + pulse * 0.1 + flare * 0.18, by = 1 - pulse * 0.12 + flare * 0.14;
  K.begin(ctx, rig, 0);
  // 촉수 · 구완 (갓 아래: 수축 때 살짝 짧아진다)
  const nW = q > 0.5 ? 8 : 5, tsy = 1 - pulse * 0.08 - lash * 0.12;
  K.warpY('tent', 'a', 0, RIM_Y + 0.4, 0, 1 + pulse * 0.04, tsy, nW, tentOff, 0.95);
  const tg = Math.max(lash * 0.45, flare * 0.3);   // 찌릿 · 섬광 때만 촉수가 빛난다 (평소 발광은 몸 뒤 큰 빛 한 장)
  if (tg > 0.02) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.warpY('tent', 'a', 0, RIM_Y + 0.4, 0, 1 + pulse * 0.04, tsy, nW, tentOff, tg, 'glow', 1);
    ctx.globalCompositeOperation = gco;
  }
  // 갓 (수축 = 옆으로 넓고 납작)
  K.put('bell', 'a', 0, RIM_Y, 0, bx, by, 0.95);
  if (flare > 0.02 || lash > 0.05) {   // 등불이 타오를 때만 갓 전체가 빛난다
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('bell', 'a', 0, RIM_Y, 0, bx, by, flare * 0.5 + lash * 0.2, 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.pivotPos('bell', 'a', 'fire', 0, RIM_Y, 0, bx, by, _q);
  const fx = _q[0], fy = _q[1];
  K.end();
  const fl = 0.8 + Math.sin(t * 11) * 0.1 + Math.sin(t * 17) * 0.05;
  gGlow(ctx, fx, fy, (3 + flare * 7) * fl, lampCol, 0.85, 0.25);
  gGlow(ctx, fx, fy, 1.6, '#fffbe0', 0.85, 0.2);
  if (cast) {
    const k = clamp(at / 0.2, 0, 1), fade = 1 - clamp((at - 0.35) / 0.25, 0, 1);
    gStar(ctx, fx, fy, 6 + 10 * k, 0.9 * fade, t);
    gHalo(ctx, 0, RIM_Y - 5, 12 + 10 * k, 12 + 10 * k, '#6fe8ff', 0.6 * fade, 0.8);
  }
  if (aw) {   // 각성: 쌍둥이 빛방울 + 오로라 고리
    for (let i = 0; i < 2; i++) { const a2 = t * 1.6 + i * Math.PI; gGlow(ctx, Math.cos(a2) * 12, RIM_Y - 6 + Math.sin(a2) * 3, 2.6, i ? '#ff9ae8' : '#6fe8ff', 0.8, 0.25); }
    gHalo(ctx, 0, RIM_Y - 12.5, 6, 1.6, '#ff9ae8', 0.55 + Math.sin(t * 3) * 0.15, 0.5);
  }
  if (emote && q > 0.5) for (let i = 0; i < 4; i++) {   // 거품
    const k = ((at * 1.2 + i * 0.25) % 1);
    ctx.save(); ctx.globalAlpha *= (1 - k) * 0.8; ctx.strokeStyle = '#e0fbff'; ctx.lineWidth = 0.35;
    ctx.beginPath(); ctx.arc(-4 + i * 3 + Math.sin(k * 6 + i) * 1.5, RIM_Y - 12 - k * 14, 0.8 + i * 0.25, 0, TAU); ctx.stroke(); ctx.restore();
  }
  if (asst && at < 0.12 && q > 0.5) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.6 * (1 - at / 0.12); ctx.fillStyle = '#6fe8ff';
    for (let i = 0; i < 4; i++) ctx.fillRect(-22 - i * 6, RIM_Y - 6 + i * 3.4, 13 - i, 0.8);
    ctx.restore();
  }
}

export default { id: 'gd_lumen', kind: 'companion', load, draw };
