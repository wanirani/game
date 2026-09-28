// 채색 수호신: 크론 (gd_whelp, 새끼 본 드래곤) — CMP-GUARD-ART-A. T1 채색 퍼핏 (에셋 assets/painted/companions/gd_whelp/).
// 조각: body (날개를 지운 Step-4 편집 그림의 옆모습: 큰 해골 · 뿔 · 갈비뼈 속 보랏빛 영혼불 · 뼈 다리, 꼬리와 아래턱은 잘라 냄) ·
//   jaw (아래턱, 경첩 피벗 — 숨결·포효에 벌어진다) · tail (말린 뼈 꼬리, 뿌리 피벗 — 흔들림) ·
//   wing (찢어진 막의 뼈 날개, 어깨 피벗 — 가까운 날개 그대로 / 먼 날개 어둡게).
// 상태: idle 날갯짓하며 둥실 · move 기울기 · attack 뼈불 숨결(턱 벌림 + 입 빛) · assist 뼈 뱉기(턱 딱) · skill 포효(고개 들고 날개 펼침) ·
//   emote 딱딱 깨물기 · hurt 움찔 · appear 커지며 나타남. 각성: 날개에 보랏빛 불꽃 막.
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { gGlow, gHalo } from '../../guardians.js';

export const spec = {
  id: 'gd_whelp', tier: 'T1', src: '../companions/gd_whelp',
  bake: { outline: 0.35, deep: { wing: 0.6 }, deepTint: 'rgb(70,40,90)', glow: { wing: '#b060ff' }, flash: false },
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
  const cast = an === 'skill', emote = an === 'emote', atk = an === 'attack', ast = an === 'assist';
  const hurt = an === 'hurt' ? 1 - clamp(at / 0.3, 0, 1) : 0;
  const ap = an === 'appear' ? easeOut(clamp(at / 0.3, 0, 1)) : 1;
  const aw = !!(g.d?.awakened);
  const hiQ = (world?.fx?.quality ?? 1) >= 0.95;
  const beat = Math.sin(t * 11);
  const bob = -beat * 1.4 + Math.sin(t * 2.1 + (g.seed ?? 0)) * 1.2;
  let tilt = clamp(vxf * 0.0008, -0.2, 0.25) - hurt * 0.3;
  let open = 0.05 + Math.max(0, Math.sin(t * 1.7)) * 0.06;
  if (atk) { open = 0.5; tilt += 0.06; }
  else if (cast) { const k = easeOut(clamp(at / 0.2, 0, 1)); open = 0.6 * k; tilt -= 0.22 * k; }
  else if (emote) { open = Math.abs(Math.sin(at * 18)) * 0.4; tilt += 0.12; }
  else if (ast) open = at < 0.08 ? at / 0.08 * 0.5 : Math.max(0, 0.5 - (at - 0.08) * 4);
  else if (hurt > 0) open = 0.3 * hurt;
  const sc = 0.55 + 0.45 * ap;
  const fireA = 0.6 + 0.25 * Math.sin(t * 9) + (cast ? 0.5 : 0) + (atk ? 0.3 : 0);
  gGlow(ctx, -2, -15 + bob, cast ? 24 : 14, '#b060ff', 0.22 + (cast ? 0.35 : 0));
  if (hurt > 0) ctx.translate(Math.sin(t * 70) * 1.2 * hurt, 0);
  ctx.translate(0, -15 + bob);
  ctx.rotate(tilt);
  if (sc !== 1) ctx.scale(sc, sc);
  K.begin(ctx, rig, 0);
  // 몸 중심 c 가 원점. 날갯짓: + = 날개 끝이 위로, - = 아래로 내려침
  const bx = 0, by = 0;
  const wa = -0.2 + beat * 0.55 + (cast ? 0.45 : 0) + (atk ? -0.15 : 0);
  const wsy = 0.86 + 0.14 * Math.abs(Math.sin(t * 11 + 1.2));
  K.pivotPos('body', 'c', 'wr', bx, by, 0, 1, 1, _q); const wx = _q[0], wy = _q[1];
  K.put('wing', 'a', wx + 2.5, wy - 1.2, wa + 0.2, 0.86, wsy * 0.86, 1, 'deep');
  // 꼬리 (몸 뒤)
  K.pivotPos('body', 'c', 'tail', bx, by, 0, 1, 1, _q);
  const tr = Math.sin(t * 3.1) * 0.08 + clamp(vxf * 0.0003, -0.1, 0.12) + (cast ? -0.1 : 0);
  K.put('tail', 'a', _q[0], _q[1], tr, 1, 1);
  // 입 속 (턱이 벌어진 틈을 어둡게) · 아래턱
  K.pivotPos('body', 'c', 'hinge', bx, by, 0, 1, 1, _q); const hx = _q[0], hy = _q[1];
  K.pivotPos('body', 'c', 'mouth', bx, by, 0, 1, 1, _q); const mx = _q[0], my = _q[1];
  if (open > 0.08) {
    K.local();
    ctx.fillStyle = '#1a0f22'; ctx.beginPath(); ctx.ellipse((hx + mx) / 2 + 1, my + 0.3, 4.2, 0.8 + open * 3, 0.25, 0, Math.PI * 2); ctx.fill();
  }
  K.put('jaw', 'a', hx, hy, open, 1, 1);
  K.put('body', 'c', bx, by, 0, 1, 1);
  K.pivotPos('body', 'c', 'fire', bx, by, 0, 1, 1, _q); const fx = _q[0], fy = _q[1];
  K.pivotPos('body', 'c', 'eye', bx, by, 0, 1, 1, _q); const ex = _q[0], ey = _q[1];
  K.pivotPos('body', 'c', 'eye2', bx, by, 0, 1, 1, _q); const e2x = _q[0], e2y = _q[1];
  K.pivotPos('jaw', 'a', 'tip', hx, hy, open, 1, 1, _q); const jx = _q[0], jy = _q[1];
  // 가까운 날개 (몸 앞) + 각성 불꽃 막
  K.put('wing', 'a', wx, wy, wa, 1, wsy, 1);
  if (aw) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('wing', 'a', wx, wy, wa, 1.03, wsy * 1.03, 0.4 + 0.2 * Math.sin(t * 13), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.pivotPos('wing', 'a', 'tip', wx, wy, wa, 1, wsy, _q); const wtx = _q[0], wty = _q[1];
  K.end();
  // 갈비뼈 속 영혼불 · 눈빛 · 입 빛
  for (let i = 0; i < 3; i++) gGlow(ctx, fx + Math.sin(t * 7 + i * 2) * 1.2, fy - i * 1.1 - Math.abs(Math.sin(t * 9 + i)) * 1.1, 4.2 - i * 0.9, i ? '#c070ff' : '#f0d8ff', fireA * (0.85 - i * 0.2), 0.25);
  gGlow(ctx, ex, ey, 2.1, '#f0d8ff', 0.95, 0.25); gGlow(ctx, ex, ey, 4.6, '#b060ff', 0.5);
  gGlow(ctx, e2x, e2y, 1.4, '#f0d8ff', 0.6, 0.25);
  if (open > 0.3) gGlow(ctx, (mx + jx) / 2 + 2, (my + jy) / 2, 3 + open * 6, '#c080ff', open * 0.8);
  if (aw && hiQ) for (let i = 0; i < 3; i++) {
    const k = (i + 1) / 4, fl = 0.5 + 0.5 * Math.sin(t * 12 + i * 2);
    gGlow(ctx, wx + (wtx - wx) * k, wy + (wty - wy) * k - 1.5 - fl, 2.2 + fl, '#c080ff', 0.55, 0.3);
  }
  if (cast && at < 0.8) {
    const k = clamp(at / 0.8, 0, 1);
    gHalo(ctx, mx + 4, my - 2, 4 + k * 14, 2.5 + k * 8, '#c080ff', (1 - k) * 0.7, 0.8, -0.3);
  }
}

export default { id: 'gd_whelp', kind: 'companion', load, draw };
