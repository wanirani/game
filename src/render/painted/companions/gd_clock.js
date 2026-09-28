// 채색 수호신: 틱톡 (gd_clock, 태엽 인형) — CMP-GUARD-ART-B. T1 채색 퍼핏 (docs/art/ENEMY_PIPELINE.md 방식, 에셋 assets/painted/companions/gd_clock/).
// 조각: body (금 간 도자기 머리 · 남색 드레스 인형, 먼 팔은 지우고 칠함) · umb (톱니 달린 남색 우산을 쥔 팔, 어깨 피벗) ·
//   key (금빛 태엽 열쇠: 등에 꽂혀 축을 따라 돈다 — 가로 배율 = cos(회전), 뒷면은 어둡게) · gear (놋쇠 톱니: 주문·각성 궤도).
// 상태 (guardian.js · guardian_ai_b.js anim): idle 둥실 + 태엽 천천히 · move 기울기 · attack(0.46초) 우산을 포신처럼 겨누고
//   0.08/0.16/0.24 발사 반동 · skill(0.9초) 우산을 머리 위로, 0~0.35 태엽을 거꾸로 빠르게 감음 (fxClockFace 바늘과 같은 구간) + 톱니 넷 궤도 ·
//   assist 우산 찌르기(톱니 드릴) · hurt 움찔 · appear 커지며 나타남 · emote 인사 → 한 바퀴. 각성: 금빛 톱니 둘이 늘 돈다.
// 그리기 규약: drawGuardian 이 발 중앙 원점·facing 반전을 걸어 준 ctx. world 는 null 일 수 있다(메뉴). 게임 상태를 바꾸지 않는다.
import * as K from '../enemy_kit.js';
import { clamp, lerp, TAU } from '../../../core/math.js';
import { gGlow, gStar, gHalo, gAwake } from '../../guardians.js';

export const spec = { id: 'gd_clock', tier: 'T1', src: '../companions/gd_clock', bake: { outline: 0.3, flash: false, deep: { key: 0.55, gear: 0.5 }, deepTint: 'rgb(90,60,20)', glow: { gear: '#ffd070' } } };

const _q = [0, 0];
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));

async function load() {
  const rig = K.requestRig(spec);
  await rig.promise;
  if (!rig.ready) throw new Error('rig ' + spec.id);
  return rig;
}

/** 궤도 톱니 (앞/뒤 반을 몸 앞뒤로 나눠 그린다) */
function orbit(ctx, t, n, R, cy, spin, front, gold, a) {
  for (let i = 0; i < n; i++) {
    const an = spin + (i / n) * TAU, z = Math.sin(an);
    if ((z > 0) !== front) continue;
    const s = (0.75 + 0.3 * (i % 2)) * (0.85 + 0.15 * z);
    K.put('gear', 'a', Math.cos(an) * R, cy + z * R * 0.28, t * (i % 2 ? -5 : 5), s, s, a * (front ? 1 : 0.75), front ? 'base' : 'deep');
    if (gold && front) {   // 각성: 금빛으로 달아오른 톱니
      const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      K.put('gear', 'a', Math.cos(an) * R, cy + z * R * 0.28, t * (i % 2 ? -5 : 5), s, s, 0.4 * a, 'glow');
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
  const aw = gAwake(g);
  const q = world?.fx?.quality ?? 1;
  const bob = Math.sin(t * 2.6 + (g.seed ?? 0)) * 1.3;
  let tilt = clamp(vxf * 0.0008, -0.18, 0.28) - hurt * 0.3, dip = 0, turn = 1;
  if (cast) tilt = -0.08;
  if (emote) {
    if (at < 0.4) { const k = Math.sin((at / 0.4) * Math.PI); dip = k * 1.6; tilt += k * 0.18; }
    else turn = Math.cos(easeIO(clamp((at - 0.4) / 0.55, 0, 1)) * TAU) || 0.01;
  }
  const sc = 0.5 + 0.5 * ap;
  let spin = t * 3;
  if (cast) spin = at < 0.35 ? -at * 42 : -14.7 + (at - 0.35) * 9;
  else if (emote) spin = t * 3 + at * 24;
  if (hurt > 0) ctx.translate(Math.sin(t * 70) * 1.2 * hurt, 0);
  gGlow(ctx, 0, -16 + bob, cast ? 28 : 12, '#ffd070', (cast ? 0.6 : 0.2) + Math.sin(t * 3) * 0.04);
  ctx.translate(0, bob + dip);
  ctx.translate(0, -16); ctx.rotate(tilt); if (sc !== 1 || turn !== 1) ctx.scale(sc * turn, sc); ctx.translate(0, 16);
  // 우산 팔 자세 (각 0 = 팔이 앞으로 수평, 우산은 앞 위로 기울어 있다)
  let ua = -0.72 + Math.sin(t * 1.8) * 0.05, kick = 0;
  if (atk) {
    const inK = easeOut(clamp(at / 0.08, 0, 1)), outK = easeIO(clamp((at - 0.3) / 0.16, 0, 1));
    ua = lerp(lerp(-0.72, 0.42, inK), -0.72, outK);
    for (const ts of [0.08, 0.16, 0.24]) if (at >= ts) kick = Math.max(kick, 1 - (at - ts) / 0.06);
    kick = clamp(kick, 0, 1);
  } else if (asst) {
    const k = easeOut(clamp(at / 0.12, 0, 1)), back = clamp((at - 0.3) / 0.2, 0, 1);
    ua = lerp(lerp(-0.72, 0.5, k), -0.72, back);
    if (at > 0.12 && at < 0.26) kick = 1 - (at - 0.12) / 0.14;
  } else if (cast) ua = lerp(-0.72, -0.62, easeOut(clamp(at / 0.2, 0, 1))) + Math.sin(t * 20) * 0.03;
  else if (emote) ua = -0.8 + Math.sin(at * 9) * 0.12;
  else if (hurt > 0) ua = -0.3;
  ua -= kick * 0.12;
  const orbN = cast ? 4 : aw ? 2 : 0, orbA = cast ? clamp(at / 0.2, 0, 1) * (1 - clamp((at - 0.75) / 0.15, 0, 1)) : 1;
  const orbR = cast ? 12 + 2 * orbA : 10.5, orbSpin = t * (cast ? 5 : 1.6);
  K.begin(ctx, rig, 0);
  if (orbN) orbit(ctx, t, orbN, orbR, -16, orbSpin, false, aw, orbA);
  // 태엽 열쇠 (등 뒤: 뒤·위로 비스듬, 축을 따라 돈다)
  K.pivotPos('body', 'a', 'key', 0, 0, 0, 1, 1, _q);
  const kx = _q[0], ky = _q[1], kp = K.part('key');
  const cs = Math.cos(spin);
  if (kp) K.put('key', 'a', kx + 1.2, ky, Math.PI - 0.32 - kp.ang, Math.max(0.14, Math.abs(cs)), 1, 1, cs >= 0 ? 'base' : 'deep');
  // 우산 팔 (먼 어깨 — 몸 뒤)
  K.pivotPos('body', 'a', 'sh', 0, 0, 0, 1, 1, _q);
  const shx = _q[0] - kick * 0.5, shy = _q[1];
  K.put('umb', 'a', shx, shy, ua);
  K.pivotPos('umb', 'a', 'cog', shx, shy, ua, 1, 1, _q); const cogX = _q[0], cogY = _q[1];
  K.pivotPos('umb', 'a', 'tip', shx, shy, ua, 1, 1, _q); const tipX = _q[0], tipY = _q[1];
  K.put('body', 'a', 0, 0);
  K.pivotPos('body', 'a', 'eye', 0, 0, 0, 1, 1, _q); const ex = _q[0], ey = _q[1];
  if (orbN) orbit(ctx, t, orbN, orbR, -16, orbSpin, true, aw, orbA);
  K.end();
  // 톱니 끝장식 빛 · 발사 섬광 · 주문 고리
  const fire = atk || asst || cast;
  if (fire) gHalo(ctx, cogX, cogY, 6, 1.8, '#ffd070', (cast ? 0.55 : 0.35) + kick * 0.4, 0.55, ua + 0.9);
  gGlow(ctx, cogX, cogY, fire ? 5 : 3, '#ffd070', fire ? 0.6 : 0.25, 0.3);
  if (kick > 0) { gGlow(ctx, tipX, tipY, 6 + kick * 7, '#ffe6a8', 0.9 * kick, 0.25); gStar(ctx, tipX, tipY, 3 + kick * 4, kick, t * 6); }
  gGlow(ctx, ex, ey, 1.6, '#ffb040', 0.25 + (cast ? 0.4 : 0), 0.3);
  if (cast) {
    const k = clamp(at / 0.25, 0, 1), fade = 1 - clamp((at - 0.7) / 0.2, 0, 1);
    gHalo(ctx, 0, -16, 12 + 5 * k, 4 + 1.5 * k, '#ffd070', 0.75 * fade, 0.7, -0.15);
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; gStar(ctx, Math.cos(a) * (12 + 5 * k), -16 + Math.sin(a) * (4 + 1.5 * k), i % 3 ? 0.9 : 1.6, 0.8 * fade); }
  }
  if (aw) gGlow(ctx, kx - 6, ky - 2, 3.5, '#ffe6a8', 0.35 + Math.sin(t * 4) * 0.1);
  if (asst && at < 0.16 && q > 0.5) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.65 * (1 - at / 0.16); ctx.fillStyle = '#ffd070';
    for (let i = 0; i < 4; i++) ctx.fillRect(-22 - i * 6, -21 + i * 3.4, 14 - i, 0.8);
    ctx.restore();
  }
}

export default { id: 'gd_clock', kind: 'companion', load, draw };
