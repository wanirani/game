// 채색 수호신: 핌 (gd_imp, 소악마 마법사) — CMP-GUARD-ART-A. T1 채색 퍼핏 (에셋 assets/painted/companions/gd_imp/).
// 조각: body (날개·꼬리·지팡이를 지운 Step-4 편집 그림: 두건 망토 · 큰 귀 · 뿔 · 이빨 웃음) · staff (해골 지팡이, 쥔 곳 피벗) ·
//   wing (박쥐 날개 — 등 뒤 양쪽, 거울) · tail (뾰족 꼬리).
// 상태: idle 날갯짓하며 둥실 (과장된 늘었다 줄었다) · move 기울기 · attack 지팡이 휘두르기 · skill 지팡이 치켜들고 소환진 ·
//   assist 던지기 · emote 키히힛 (들썩들썩) · hurt 움찔 · appear 커지며 나타남. 각성: 불타는 뿔. 해골 지팡이 끝의 불꽃은 가산 빛.
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';
import { gGlow, gStar, gHalo, gAwake } from '../../guardians.js';

export const spec = {
  id: 'gd_imp', tier: 'T1', src: '../companions/gd_imp',
  bake: { outline: 0.35, deep: { wing: 0.62 }, deepTint: 'rgb(120,70,110)', flash: false },
};

const _q = [0, 0];
const easeOut = (k) => 1 - (1 - k) * (1 - k);

async function load() {
  const rig = K.requestRig(spec);
  await rig.promise;
  if (!rig.ready) throw new Error('rig ' + spec.id);
  return rig;
}

function draw(ctx, g, world, rig) {
  const t = g.t ?? 0, at = g.animT ?? 0, an = g.anim ?? 'idle';
  const f = g.facing < 0 ? -1 : 1, vxf = (g.vx ?? 0) * f;
  const cast = an === 'skill', emote = an === 'emote';
  const atk = an === 'attack' || an === 'assist';
  const hurt = an === 'hurt' ? 1 - clamp(at / 0.3, 0, 1) : 0;
  const ap = an === 'appear' ? easeOut(clamp(at / 0.3, 0, 1)) : 1;
  const aw = gAwake(g);
  const beat = Math.sin(t * 14);
  const bob = -beat * 1.5 + Math.sin(t * 2.3 + (g.seed ?? 0)) * 1.2;
  let tilt = clamp(vxf * 0.0009, -0.22, 0.28) - hurt * 0.35;
  let sx = 1 - beat * 0.035, sy = 1 + beat * 0.05;
  if (emote) { const b = Math.abs(Math.sin(at * 16)); sy *= 1 - b * 0.13; sx *= 1 + b * 0.09; }
  if (cast) sy *= 1 + 0.07 * easeOut(clamp(at / 0.2, 0, 1));
  const sc = 0.5 + 0.5 * ap;
  gGlow(ctx, 0, -15 + bob, cast ? 26 : 14, '#ff7a2a', (cast ? 0.5 : 0.16) + Math.max(0, beat) * 0.04);
  if (hurt > 0) ctx.translate(Math.sin(t * 70) * 1.2 * hurt, 0);
  ctx.translate(0, -15 + bob);
  ctx.rotate(tilt);
  ctx.scale(sx * sc, sy * sc);
  K.begin(ctx, rig, 0);
  const bx = 0, by = 15;   // 발(a) — 몸 중심이 원점 근처
  // 날개 (등 뒤): 이미지 왼쪽 = 먼 쪽(어둡게), 오른쪽 = 거울
  const wa = 0.15 + beat * 0.55 - (cast ? 0.3 : 0) + (atk ? 0.15 : 0);
  K.pivotPos('body', 'a', 'wl', bx, by, 0, 1, 1, _q);
  K.put('wing', 'a', _q[0], _q[1], wa, 1, 1, 1, 'deep');
  K.pivotPos('body', 'a', 'wr', bx, by, 0, 1, 1, _q);
  K.put('wing', 'a', _q[0], _q[1], -wa, -1, 1, 1);
  // 꼬리
  K.pivotPos('body', 'a', 'tail', bx, by, 0, 1, 1, _q);
  K.put('tail', 'a', _q[0], _q[1], -0.55 + Math.sin(t * 3.4) * 0.22, 1, 1);
  K.put('body', 'a', bx, by, 0, 1, 1);
  // 해골 지팡이 (손)
  let sa = 0.12 + Math.sin(t * 2) * 0.05, lift = 0;
  if (atk) sa = at < 0.14 ? lerp(-0.6, 1.0, easeOut(at / 0.14)) : lerp(1.0, 0.12, clamp((at - 0.14) / 0.25, 0, 1));
  else if (cast) { sa = lerp(0.12, -0.15, easeOut(clamp(at / 0.2, 0, 1))); lift = -4 * easeOut(clamp(at / 0.2, 0, 1)); }
  else if (emote) sa = 0.12 + Math.sin(at * 16) * 0.2;
  else if (hurt > 0) sa = 0.5;
  K.pivotPos('body', 'a', 'hand', bx, by, 0, 1, 1, _q);
  const hx = _q[0], hy = _q[1] + lift;
  K.put('staff', 'a', hx, hy, sa, 1, 1);
  K.pivotPos('staff', 'a', 'fire', hx, hy, sa, 1, 1, _q); const fx = _q[0], fy = _q[1];
  K.pivotPos('body', 'a', 'eye', bx, by, 0, 1, 1, _q); const e1x = _q[0], e1y = _q[1];
  K.pivotPos('body', 'a', 'eye2', bx, by, 0, 1, 1, _q); const e2x = _q[0], e2y = _q[1];
  K.pivotPos('body', 'a', 'horn', bx, by, 0, 1, 1, _q); const h1x = _q[0], h1y = _q[1];
  K.pivotPos('body', 'a', 'horn2', bx, by, 0, 1, 1, _q); const h2x = _q[0], h2y = _q[1];
  K.end();
  // 지팡이 불꽃 · 눈빛 · 각성 뿔불
  const fk = cast ? 1.8 : atk ? 1.4 : 1;
  for (let i = 0; i < 3; i++) {
    const fl = Math.sin(t * (13 + i * 4) + i) * 0.5 + 0.5;
    gGlow(ctx, fx + Math.sin(t * 7 + i) * 0.5, fy - i * 1.3 * fk - fl * 0.7, (2.6 - i * 0.55) * fk, i === 0 ? '#ffd070' : '#ff6a1a', 0.8 - i * 0.18, 0.2);
  }
  gGlow(ctx, fx, fy, 7 * fk, '#ff7a2a', 0.35);
  gGlow(ctx, e1x, e1y, 2, '#ffb040', 0.5); gGlow(ctx, e2x, e2y, 1.8, '#ffb040', 0.45);
  if (aw) for (const [x, y] of [[h1x, h1y], [h2x, h2y]]) gGlow(ctx, x, y - Math.abs(Math.sin(t * 11 + x)) * 0.8, 2.6, '#ff8a2a', 0.85, 0.2);
  if (cast) {
    const k = clamp(at / 0.25, 0, 1), fade = 1 - clamp((at - 0.55) / 0.2, 0, 1);
    gHalo(ctx, fx, fy - 6, 5 + 7 * k, 1.8 + 2.4 * k, '#ff8a3a', 0.9 * fade, 0.6, 0);
    for (let i = 0; i < 6; i++) { const a = t * 3 + i * Math.PI / 3; gStar(ctx, fx + Math.cos(a) * (5 + 7 * k), fy - 6 + Math.sin(a) * (1.8 + 2.4 * k), 1.3, 0.8 * fade); }
  }
}

export default { id: 'gd_imp', kind: 'companion', load, draw };
