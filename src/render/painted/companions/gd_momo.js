// 채색 수호신: 모모 (gd_momo, 꿈먹는 맥) — CMP-GUARD-ART-B. T1 채색 퍼핏 (docs/art/ENEMY_PIPELINE.md 방식, 에셋 assets/painted/companions/gd_momo/).
// 조각: body (쪽빛 통통한 맥 · 금빛 별·초승달 털무늬 · 크림색 가슴털 · 졸린 눈, 오른쪽을 보는 옆모습 — 코와 꼬리를 오려 냄) ·
//   trunk (끝이 위로 말린 짧은 코, 주둥이 피벗: 각 0 = 원화 · + = 아래·앞으로 덥석) · tail (곱슬 꼬리, 엉덩이 피벗) ·
//   cloud (보랏빛 꿈 구름: 몸 앞에 그려 발굽이 구름에 잠긴다).
// 상태 (guardian.js · guardian_ai_b.js anim): idle 숨쉬기 + 꼬리 살랑 + 코 까딱 · move 기울기 ·
//   attack(0.34초) 0~0.12 코를 뒤로 젖힘 → 0.14 덥석 (입 = g.cx + facing·w·0.55, g.cy+2 쪽으로 코끝이 뻗는다) → 복귀 ·
//   assist 0.12 돌진 뒤 코를 크게 휘두름 · skill(1.25초) 0~1.0 몸이 부풀며 코를 앞으로 곧게 (fxMomoVortex 들이마심) → 1.0~1.25 꺼억 ·
//   hurt 찌그러짐 · appear 커지며 나타남 · emote 하품 (코를 들고 기지개, z). 각성: 머리 위 초승달 후광 + 별가루.
// 그리기 규약: drawGuardian 이 발 중앙 원점·facing 반전을 걸어 준 ctx. world 는 null 일 수 있다(메뉴). 게임 상태를 바꾸지 않는다.
import * as K from '../enemy_kit.js';
import { clamp, lerp, TAU } from '../../../core/math.js';
import { gGlow, gStar, gAwake } from '../../guardians.js';

export const spec = { id: 'gd_momo', tier: 'T1', src: '../companions/gd_momo', bake: { outline: 0.3, outlineParts: { cloud: 0 }, flash: false, glow: { cloud: '#d8a8ff' } } };

const BX = -2, BY = -4;   // 몸 발굽 위치 (구름에 잠김)
const _q = [0, 0];
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));

async function load() {
  const rig = K.requestRig(spec);
  await rig.promise;
  if (!rig.ready) throw new Error('rig ' + spec.id);
  return rig;
}

const PV = { st1: [0, 0], st2: [0, 0], st3: [0, 0], st4: [0, 0] };

function draw(ctx, g, world, rig) {
  const t = g.t ?? 0;
  let at = g.animT ?? 0, an = g.anim ?? 'idle';
  // 협공 「코 휘두르기」(guardian.js kindMelee): 0.12 돌진 뒤 0.14 에 때리는 순간 anim 이 'attack'(animT 0)으로 바뀐다 →
  // 그대로 그리면 휘두른 코를 다시 젖혔다가 한 번 더 무는 것처럼 보인다. 동작(g.act)이 협공이면 협공 시간축으로 이어 그린다
  if (an === 'attack' && g.act?.name === 'assist') { an = 'assist'; at = 0.12 + (g.act.t ?? 0); }
  const f = g.facing < 0 ? -1 : 1, vxf = (g.vx ?? 0) * f;
  const cast = an === 'skill', atk = an === 'attack', asst = an === 'assist', emote = an === 'emote';
  const hurt = an === 'hurt' ? 1 - clamp(at / 0.3, 0, 1) : 0;
  const ap = an === 'appear' ? easeOut(clamp(at / 0.3, 0, 1)) : 1;
  const aw = gAwake(g), q = world?.fx?.quality ?? 1;
  const bob = Math.sin(t * 1.7 + (g.seed ?? 0)) * 1.3;
  const breath = Math.sin(t * 2.1) * 0.025;
  let tilt = clamp(vxf * 0.0006, -0.12, 0.18) - hurt * 0.25, sx = 1 - breath, sy = 1 + breath, lift = 0;
  // 코 자세: 각 (0 = 원화처럼 끝이 위로 말림, + = 아래·앞으로) · 길이 배율 · 입 벌림
  let ta = 0.1 + Math.sin(t * 1.5) * 0.1, tl = 1, open = 0;
  if (atk) {   // 0~0.12 뒤로 젖힘 → 0.14 덥석 → 복귀 (bite 판정 0.14)
    if (at < 0.12) { ta = lerp(0.1, -0.6, easeOut(at / 0.12)); tilt -= 0.08 * (at / 0.12); }
    else if (at < 0.2) { const k = easeOut((at - 0.12) / 0.08); ta = lerp(-0.6, 0.9, k); tl = lerp(1, 1.5, k); tilt += 0.14 * k; open = k; }
    else { const k = clamp((at - 0.2) / 0.14, 0, 1); ta = lerp(0.9, 0.1, easeIO(k)); tl = lerp(1.5, 1, easeIO(k)); tilt += 0.14 * (1 - k); open = 1 - k; }
  } else if (asst) {   // 코 휘두르기 (0.12 돌진 뒤 크게 휘두름)
    const k = clamp((at - 0.12) / 0.2, 0, 1);
    ta = at < 0.12 ? lerp(0.1, -0.9, at / 0.12) : lerp(-0.9, 1.2, easeIO(k)); tl = 1.25;
    if (k >= 1) { const b = clamp((at - 0.32) / 0.2, 0, 1); ta = lerp(1.2, 0.1, b); tl = lerp(1.25, 1, b); }
  } else if (cast) {   // 1.0초 들이마심 (몸이 부풀고 코를 앞으로 곧게) → 1.0~1.25 꺼억
    const k = clamp(at / 0.25, 0, 1);
    if (at < 1.0) { ta = lerp(0.1, 0.45, k) + Math.sin(t * 30) * 0.04; tl = lerp(1, 1.3, k); sx *= 1 + 0.1 * k; sy *= 1 + 0.12 * k; open = k; }
    else { const g2 = clamp((at - 1.0) / 0.25, 0, 1), b = Math.sin(g2 * Math.PI); sy *= 1 - 0.14 * b; sx *= 1 + 0.1 * b; ta = lerp(0.45, 0.1, g2); tl = lerp(1.3, 1, g2); lift = -2 * b; }
  } else if (emote) {   // 하품: 코를 들어 올리고 기지개
    const k = Math.sin(clamp(at / 0.8, 0, 1) * Math.PI);
    ta = lerp(0.1, -1.0, k); sy *= 1 + 0.06 * k; tilt -= 0.1 * k; open = k;
  } else if (hurt > 0) { sy *= 1 - 0.12 * hurt; sx *= 1 + 0.08 * hurt; }
  const sc = 0.45 + 0.55 * ap;
  if (hurt > 0) ctx.translate(Math.sin(t * 70) * 1.1 * hurt, 0);
  gGlow(ctx, 0, -12 + bob, cast ? 26 : 14, '#c060ff', (cast ? 0.45 : 0.16) + (aw ? 0.08 : 0));
  const cb = Math.sin(t * 1.3) * 0.04, cx = Math.sin(t * 0.9) * 0.6;
  // 몸 (구름 위에서 둥실: 발굽 기준으로 숨쉬고 기운다)
  ctx.save();
  ctx.translate(0, bob * 0.6 + lift);
  ctx.translate(0, -5); ctx.rotate(tilt); ctx.scale(sc * sx, sc * sy); ctx.translate(0, 5);
  K.begin(ctx, rig, 0);
  K.pivotPos('body', 'a', 'rump', BX, BY, 0, 1, 1, _q);
  K.put('tail', 'a', _q[0] + 0.4, _q[1], Math.sin(t * 4.2) * 0.3 + (emote ? Math.sin(at * 14) * 0.3 : 0) - hurt * 0.3);
  K.put('body', 'a', BX, BY);
  K.pivotPos('body', 'a', 'mouth', BX, BY, 0, 1, 1, _q); const mx = _q[0], my = _q[1];
  K.pivotPos('body', 'a', 'trunk', BX, BY, 0, 1, 1, _q); const tx = _q[0], ty = _q[1];
  for (const k in PV) { K.pivotPos('body', 'a', k, BX, BY, 0, 1, 1, _q); PV[k][0] = _q[0]; PV[k][1] = _q[1]; }
  K.pivotPos('body', 'a', 'ear', BX, BY, 0, 1, 1, _q); const ex = _q[0], ey = _q[1];
  // 벌린 입 (코 아래 어두운 틈) — 코 조각 밑에 그린다
  K.end();
  if (open > 0.05) {
    ctx.save(); ctx.fillStyle = '#2a1030'; ctx.globalAlpha *= clamp(open, 0, 1) * 0.85;
    ctx.beginPath(); ctx.ellipse(mx + 0.8, my + 0.5, 1.2, 0.7 * open + 0.15, 0.15, 0, TAU); ctx.fill(); ctx.restore();
    if (cast) gGlow(ctx, mx + 0.6, my + 0.4, 3 + open * 3, '#c060ff', 0.5 * open);
  }
  K.begin(ctx, rig, 0);
  K.put('trunk', 'a', tx - 0.3, ty, ta, tl, 1);
  K.pivotPos('trunk', 'a', 'nose', tx - 0.3, ty, ta, tl, 1, _q); const nx = _q[0], ny = _q[1];
  K.end();
  // 무늬 반짝임
  const tw = (i) => 0.12 + 0.28 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.9)) + (aw ? 0.18 : 0) + (cast ? 0.25 : 0);
  gGlow(ctx, PV.st1[0], PV.st1[1], 2, '#ffe08a', tw(0), 0.3); gGlow(ctx, PV.st2[0], PV.st2[1], 1.8, '#ffe08a', tw(1), 0.3); gGlow(ctx, PV.st3[0], PV.st3[1], 1.7, '#ffe08a', tw(2), 0.3);
  if (q > 0.5) gGlow(ctx, PV.st4[0], PV.st4[1], 1.7, '#ffe08a', tw(3), 0.3);
  // 코끝 덥석 섬광
  if ((atk && at > 0.12 && at < 0.26) || (asst && at > 0.18 && at < 0.3)) { gGlow(ctx, nx, ny, 7, '#d080ff', 0.7, 0.25); gStar(ctx, nx, ny, 4, 0.8, t * 4); }
  // 각성: 머리 위 초승달 후광
  if (aw) {
    const hx = ex + 1.5, hy = ey - 4.5;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,224,138,0.75)';
    ctx.beginPath(); ctx.arc(hx, hy, 2.6, 0.8, 5.5); ctx.arc(hx + 1.2, hy - 0.6, 2.1, 5.1, 1.2, true); ctx.closePath(); ctx.fill();
    ctx.restore();
    gGlow(ctx, hx, hy, 6, '#ffe08a', 0.35);
  }
  ctx.restore();
  // 구름 (몸 앞: 발굽이 잠긴다, 살짝 떠다니며 숨쉼)
  K.begin(ctx, rig, 0);
  K.put('cloud', 'a', cx, -3.2, 0, 1 + cb, 1 - cb, 0.95);
  if (q > 0.5) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('cloud', 'a', cx, -3.2, 0, 1.02 + cb, 1.02 - cb, 0.1 + (cast ? 0.15 : 0), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.end();
  if (aw && q > 0.5) for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; gStar(ctx, -14 - k * 8, -12 + Math.sin(k * 7 + i) * 3, 1.4 * (1 - k), 0.8 * (1 - k), t + i); }
  // 하품의 z
  if (emote && at > 0.3) {
    const k = clamp((at - 0.3) / 0.7, 0, 1);
    ctx.save(); ctx.globalAlpha *= 1 - k; ctx.strokeStyle = '#e8d8ff'; ctx.lineWidth = 0.6;
    const zx = 12 + k * 6, zy = -24 - k * 8, z = 2 + k;
    ctx.beginPath(); ctx.moveTo(zx, zy); ctx.lineTo(zx + z, zy); ctx.lineTo(zx, zy + z); ctx.lineTo(zx + z, zy + z); ctx.stroke(); ctx.restore();
  }
  if (asst && at < 0.12 && q > 0.5) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.6 * (1 - at / 0.12); ctx.fillStyle = '#d080ff';
    for (let i = 0; i < 4; i++) ctx.fillRect(-24 - i * 6, -16 + i * 3.4, 13 - i, 0.8);
    ctx.restore();
  }
}

export default { id: 'gd_momo', kind: 'companion', load, draw };
