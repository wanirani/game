// 채색 수호신: 미라 (gd_mirra, 거울 요정) — CMP-GUARD-ART-B. T1 채색 퍼핏 (docs/art/ENEMY_PIPELINE.md 방식, 에셋 assets/painted/companions/gd_mirra/).
// 조각: body (긴 은발 · 뾰족 귀 · 얼음빛 눈 · 진줏빛 흰 드레스, 떠서 무릎을 모은 소녀 — 날개와 거울 팔을 오려 냄) ·
//   arm (거울 든 아래팔 + 손 + 은 손거울, 팔꿈치 피벗: 각 0 = 원화처럼 거울을 세워 듦, + = 거울을 앞으로 기울여 겨눔) ·
//   wing (수정 조각 날개, 뿌리는 머리칼 뒤: 가까운 날개 + 어둡게 줄인 먼 날개) · shard/shard2 (둘레를 도는 거울 조각).
// 상태 (guardian.js · guardian_ai_b.js anim): idle 둥실 + 날개 떨림 + 조각 셋이 돎 · move 기울기, 머리칼 쪽으로 날개 젖힘 ·
//   attack(0.3초) 0.08 에 거울을 앞으로 기울여 번쩍 (조각이 날아가는 시각) · assist 돌진 뒤 0.14 번쩍 ·
//   skill(1.25초) 거울을 치켜들고 조각 여섯이 빠르게 돎 + 고리 (조각들이 궤도를 도는 1.0초 동안) → 되돌림 ·
//   hurt 움찔 · appear 커지며 나타남 · emote 한 바퀴 돈 뒤 거울을 들여다봄. 각성: 머리 위에 거울 조각 관.
// 그리기 규약: drawGuardian 이 발 중앙 원점·facing 반전을 걸어 준 ctx. world 는 null 일 수 있다(메뉴). 게임 상태를 바꾸지 않는다.
import * as K from '../enemy_kit.js';
import { clamp, lerp, TAU } from '../../../core/math.js';
import { gGlow, gStar, gHalo, gAwake } from '../../guardians.js';

export const spec = { id: 'gd_mirra', tier: 'T1', src: '../companions/gd_mirra', bake: { outline: 0.25, flash: false, deep: { wing: 0.3, shard: 0.35, shard2: 0.35 }, deepTint: 'rgb(70,80,120)', glow: { wing: '#dff4ff', shard: '#dff4ff', shard2: '#dff4ff' } } };

const _q = [0, 0];
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));

async function load() {
  const rig = K.requestRig(spec);
  await rig.promise;
  if (!rig.ready) throw new Error('rig ' + spec.id);
  return rig;
}

/** 둘레를 도는 거울 조각 (앞/뒤 반을 몸 앞뒤로 나눠 그린다) */
function shards(ctx, t, n, R, cy, sp, front, a) {
  for (let i = 0; i < n; i++) {
    const an = t * sp + (i / n) * TAU, z = Math.sin(an);
    if ((z > 0) !== front) continue;
    const s = (0.85 + 0.15 * z) * (i % 3 === 2 ? 0.75 : 1), x = Math.cos(an) * R, y = cy + z * R * 0.3 + Math.sin(t * 2 + i) * 0.8;
    const nm = i % 2 ? 'shard2' : 'shard';
    K.put(nm, 'a', x, y, t * (i % 2 ? -1.6 : 1.3) + i, s, s, a * (front ? 1 : 0.7), front ? 'base' : 'deep');
    if (front) {
      const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      K.put(nm, 'a', x, y, t * (i % 2 ? -1.6 : 1.3) + i, s, s, a * (0.25 + 0.2 * Math.sin(t * 7 + i * 2)), 'glow');
      ctx.globalCompositeOperation = gco;
    }
  }
}

function draw(ctx, g, world, rig) {
  const t = g.t ?? 0, at = g.animT ?? 0, an = g.anim ?? 'idle';
  const f = g.facing < 0 ? -1 : 1, vxf = (g.vx ?? 0) * f;
  const cast = an === 'skill', atk = an === 'attack', asst = an === 'assist', emote = an === 'emote';
  const hurt = an === 'hurt' ? 1 - clamp(at / 0.3, 0, 1) : 0;
  const ap = an === 'appear' ? easeOut(clamp(at / 0.3, 0, 1)) : 1;
  const aw = gAwake(g), q = world?.fx?.quality ?? 1;
  const bob = Math.sin(t * 2.4 + (g.seed ?? 0)) * 1.4;
  let tilt = clamp(vxf * 0.0008, -0.16, 0.28) - hurt * 0.3;
  if (cast) tilt = -0.12;
  const sc = 0.5 + 0.5 * ap;
  let turn = 1;
  if (emote && at < 0.7) turn = Math.cos(easeIO(clamp(at / 0.7, 0, 1)) * TAU) || 0.01;
  if (hurt > 0) ctx.translate(Math.sin(t * 70) * 1.2 * hurt, 0);
  gGlow(ctx, 0, -16 + bob, cast ? 26 : 12, '#dff4ff', (cast ? 0.55 : 0.2) + Math.sin(t * 3.4) * 0.05);
  ctx.translate(0, bob);
  ctx.translate(0, -15); ctx.rotate(tilt); if (sc !== 1 || turn !== 1) ctx.scale(sc * turn, sc); ctx.translate(0, 15);
  // 거울 팔 각
  let aa = Math.sin(t * 1.9) * 0.06;
  if (atk) aa = at < 0.08 ? lerp(0, 0.6, easeOut(at / 0.08)) : lerp(0.6, 0, easeIO(clamp((at - 0.12) / 0.18, 0, 1)));
  else if (asst) aa = at < 0.14 ? lerp(0, 0.5, easeOut(at / 0.14)) : lerp(0.5, 0, easeIO(clamp((at - 0.18) / 0.2, 0, 1)));
  else if (cast) aa = lerp(0, 0.35, easeOut(clamp(at / 0.22, 0, 1))) * (1 - clamp((at - 1.05) / 0.2, 0, 1)) + Math.sin(t * 16) * 0.03;
  else if (emote) aa = at < 0.7 ? 0.1 : lerp(0.1, -0.4, easeOut(clamp((at - 0.7) / 0.15, 0, 1)));   // 빙글 돈 뒤 거울을 들여다본다
  else if (hurt > 0) aa = 0.3 * hurt;
  const nSh = cast ? 6 : 3, rSh = cast ? 12 + 3 * clamp(at / 0.3, 0, 1) : 10.5, spSh = cast ? 4.2 : 1.4;
  const shA = cast ? 1 - clamp((at - 1.05) / 0.2, 0, 1) * 0.5 : 1;
  const wv = Math.sin(t * 5.2) * 0.08 - (cast ? 0.2 : 0) - clamp(vxf * 0.0004, 0, 0.2) - hurt * 0.2;
  K.begin(ctx, rig, 0);
  shards(ctx, t, nSh, rSh, -15, spSh, false, shA);
  // 날개: 먼 쪽(어둡게 · 작게) → 가까운 쪽 (반짝이며 떨림)
  K.pivotPos('body', 'a', 'wing', 0, 0, 0, 1, 1, _q);
  const wx = _q[0], wy = _q[1];
  K.put('wing', 'a', wx + 2.6, wy - 0.4, 0.28 + wv * 0.8, 0.82, 0.82, 0.7, 'deep');
  K.put('wing', 'a', wx, wy, wv);
  if (q > 0.5) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('wing', 'a', wx, wy, wv, 1, 1, 0.14 + Math.sin(t * 6) * 0.07 + (cast ? 0.2 : 0), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.put('body', 'a', 0, 0);
  K.pivotPos('body', 'a', 'elbow', 0, 0, 0, 1, 1, _q);
  const ex = _q[0], ey = _q[1];
  K.put('arm', 'a', ex, ey, aa);
  K.pivotPos('arm', 'a', 'glass', ex, ey, aa, 1, 1, _q);
  const mx = _q[0], my = _q[1];
  shards(ctx, t, nSh, rSh, -15, spSh, true, shA);
  // 각성: 머리 위 거울 조각 관
  if (aw) {
    K.pivotPos('body', 'a', 'crown', 0, 0, 0, 1, 1, _q);
    const cx = _q[0] + 1.2, cy = _q[1] - 1.4;
    for (let i = 0; i < 5; i++) {
      const a2 = t * 0.9 + i * TAU / 5, fr = Math.sin(a2) > 0;
      K.put('shard2', 'a', cx + Math.cos(a2) * 4.2, cy + Math.sin(a2) * 1.1, Math.cos(a2) * 0.4, 0.6, 0.6, fr ? 1 : 0.55, fr ? 'base' : 'deep');
    }
  }
  K.pivotPos('body', 'a', 'eye2', 0, 0, 0, 1, 1, _q);
  const e2x = _q[0], e2y = _q[1];
  K.end();
  // 거울 번쩍 · 주문 고리
  const fl = atk ? clamp(1 - Math.abs(at - 0.08) / 0.1, 0, 1) : asst ? clamp(1 - Math.abs(at - 0.14) / 0.1, 0, 1) : cast ? clamp(at / 0.25, 0, 1) * (1 - clamp((at - 1.05) / 0.2, 0, 1)) : 0;
  const glint = ((t * 0.45) % 1) < 0.08 ? 0.7 : 0;
  const fk = cast ? 0.55 : 1;   // 주문 중에는 얼굴을 가리지 않게 약하게
  gGlow(ctx, mx, my, 4 + fl * 9 * fk, '#dff4ff', 0.3 + fl * 0.6 * fk, 0.25);
  if (fl > 0.05 || glint) gStar(ctx, mx, my, 2.5 + fl * 6 * fk, Math.max(fl * fk, glint), t * 2);
  if (cast) {
    const k = clamp(at / 0.3, 0, 1), fade = 1 - clamp((at - 1) / 0.25, 0, 1);
    gHalo(ctx, mx, my, 3 + 3 * k, 4.5 + 4 * k, '#dff4ff', 0.6 * fade, 0.6, 0.35);
    gHalo(ctx, 0, -15, 15 + 3 * k, 5, '#dff4ff', 0.5 * fade, 0.6, t * 0.5);
  }
  if (aw) gGlow(ctx, 0.4, -31, 6, '#dff4ff', 0.3);
  gGlow(ctx, e2x, e2y, 1.3, '#8ad8ff', 0.3);
  if (asst && at < 0.12 && q > 0.5) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.6 * (1 - at / 0.12); ctx.fillStyle = '#dff4ff';
    for (let i = 0; i < 4; i++) ctx.fillRect(-20 - i * 6, -21 + i * 3.4, 13 - i, 0.8);
    ctx.restore();
  }
}

export default { id: 'gd_mirra', kind: 'companion', load, draw };
