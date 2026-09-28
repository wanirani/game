// 채색 수호신: 미네르바 (gd_owl, 성스러운 올빼미) — CMP-GUARD-ART-A. T1 채색 퍼핏 (에셋 assets/painted/companions/gd_owl/).
// 조각: body (날아가는 원숭이올빼미의 머리·가슴·늘어뜨린 발톱, 날개를 잘라 냄) · wingL / wingR (들어 올린 두 날개, 어깨 피벗 —
//   몸 뒤에서 날갯짓) · perch (어깨에 앉은 3/4 모습, 그림 속 후광 포함 — 앉을 때 날아가는 모습과 교차해 바꾼다).
// 상태: idle 제자리 날갯짓 · move 빠르면 짧은 날갯짓 · attack/assist 급강하(날개 접고 앞으로 기울기) · skill 성광의 눈(날개 활짝, 눈 빛) ·
//   emote 고개 갸웃 · hurt 움찔 · appear 커지며 나타남 · perch 어깨에 앉음(가끔 눈 깜빡). 머리 뒤 후광, 각성: 두 번째 후광.
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';
import { gGlow, gHalo, gAwake } from '../../guardians.js';

export const spec = {
  id: 'gd_owl', tier: 'T1', src: '../companions/gd_owl',
  bake: { outline: 0.3, deep: { wingR: 0.8 }, deepTint: 'rgb(150,140,120)', flash: false },
};

const _q = [0, 0];
const easeOut = (k) => 1 - (1 - k) * (1 - k);

async function load() {
  const rig = K.requestRig(spec);
  await rig.promise;
  if (!rig.ready) throw new Error('rig ' + spec.id);
  return rig;
}

/** 앉음 ↔ 날기 교차 비율 (그리기 전용 상태, 게임 시간 g.t 로만 움직인다) */
function perchK(g, want) {
  const t = g.t ?? 0, last = g._owlT;
  let k = g._owlPk ?? want;
  if (last !== undefined) { const dt = clamp(t - last, 0, 0.1); k += clamp(want - k, -dt / 0.18, dt / 0.18); }
  g._owlT = t; g._owlPk = k;
  return k;
}

function draw(ctx, g, world, rig) {
  const t = g.t ?? 0, at = g.animT ?? 0, an = g.anim ?? 'idle';
  const f = g.facing < 0 ? -1 : 1, vxf = (g.vx ?? 0) * f;
  const perchWant = an === 'perch' || (!!g.perched && an === 'idle') ? 1 : 0;
  const pk = perchK(g, perchWant);
  const cast = an === 'skill', emote = an === 'emote', atk = an === 'attack' || an === 'assist';
  const hurt = an === 'hurt' ? 1 - clamp(at / 0.3, 0, 1) : 0;
  const ap = an === 'appear' ? easeOut(clamp(at / 0.3, 0, 1)) : 1;
  const aw = gAwake(g);
  const bob = Math.sin(t * 2.4 + (g.seed ?? 0)) * 1.3 * (1 - pk);
  let tilt = clamp(vxf * 0.0008, -0.2, 0.3) - hurt * 0.3;
  if (atk) tilt = 0.55;
  if (emote) tilt = Math.sin(clamp(at, 0, 1) * Math.PI * 2) * 0.28;
  tilt *= 1 - pk;
  const sc = 0.55 + 0.45 * ap;
  gGlow(ctx, 0, -12 + bob, cast ? 24 : 12, '#ffe7a0', cast ? 0.55 : 0.2);
  if (hurt > 0) ctx.translate(Math.sin(t * 70) * 1.2 * hurt, 0);
  ctx.translate(0, -12 + bob);
  if (sc !== 1) ctx.scale(sc, sc);
  ctx.rotate(tilt);
  const haloA = 0.75 + Math.sin(t * 2.4) * 0.15 + (cast ? 0.3 : 0);
  let e1x = 0, e1y = -6, e2x = 0, e2y = -6;
  K.begin(ctx, rig, 0);
  // ── 날기 (pk < 1) ──
  if (pk < 1) {
    const ga = ctx.globalAlpha; ctx.globalAlpha = ga * (1 - pk);
    // 날갯짓: fl 0 = 그림처럼 들어 올림, 1 = 끝까지 내려침
    let fl = 0.5 + 0.5 * Math.sin(t * 9), wsy = 0.85 + 0.15 * Math.abs(Math.cos(t * 9));
    if (atk) { fl = 1.05; wsy = 0.75; }
    else if (cast) fl = lerp(0.4, -0.2, easeOut(clamp(at / 0.2, 0, 1)));
    else if (Math.abs(vxf) > 200) fl = 0.35 + 0.2 * Math.sin(t * 6);
    else if (hurt > 0) fl = 0.8;
    const bx = 0, by = 0;
    K.pivotPos('body', 'c', 'top', bx, by, 0, 1, 1, _q); const tx = _q[0], ty = _q[1];
    K.pivotPos('body', 'c', 'beak', bx, by, 0, 1, 1, _q); const bkx = _q[0], bky = _q[1];
    const hx = (tx + bkx) / 2 - 0.5, hy = (ty + bky) / 2 - 1;
    // 후광 (머리 뒤)
    K.local();
    gHalo(ctx, hx, hy, 5.2, 5, '#ffe7a0', haloA, 0.5);
    if (aw) gHalo(ctx, hx, hy, 7.6, 7.2, '#fff2c0', haloA * 0.7, 0.4, t * 0.5);
    // 그림 속 두 날개는 어깨에서 아래 바깥으로 늘어진 모양 → 올려칠 때 바깥 위로 크게 돌린다 (뒤 날개 +, 앞 날개 -)
    const up = 1.35 * (1 - fl) - 0.1;
    K.pivotPos('body', 'c', 'wr', bx, by, 0, 1, 1, _q);
    K.put('wingR', 'a', _q[0], _q[1], up, 1, wsy, 1, 'deep');
    K.pivotPos('body', 'c', 'wl', bx, by, 0, 1, 1, _q);
    K.put('wingL', 'a', _q[0], _q[1], -up, 1, wsy, 1);
    K.put('body', 'c', bx, by, 0, 1, 1);
    K.pivotPos('body', 'c', 'eye', bx, by, 0, 1, 1, _q); e1x = _q[0]; e1y = _q[1];
    K.pivotPos('body', 'c', 'eye2', bx, by, 0, 1, 1, _q); e2x = _q[0]; e2y = _q[1];
    ctx.globalAlpha = ga;
  }
  // ── 앉음 (pk > 0): 발(a)이 어깨 위 원점 → 몸 중심 좌표로 +12 ──
  if (pk > 0) {
    const ga = ctx.globalAlpha; ctx.globalAlpha = ga * pk;
    const px = 0, py = 12 - bob;
    const nod = Math.sin(t * 1.3) * 0.03;
    K.pivotPos('perch', 'a', 'eye', px, py, nod, 1, 1, _q); const p1x = _q[0], p1y = _q[1];
    K.pivotPos('perch', 'a', 'eye2', px, py, nod, 1, 1, _q); const p2x = _q[0], p2y = _q[1];
    K.pivotPos('perch', 'a', 'top', px, py, nod, 1, 1, _q); const phx = _q[0], phy = _q[1] + 3.5;
    if (aw) { K.local(); gHalo(ctx, phx, phy, 6.4, 6, '#fff2c0', haloA * 0.7, 0.4, t * 0.5); }   // 그림 속 후광 바깥에 하나 더 (머리 뒤)
    K.put('perch', 'a', px, py, nod, 1, 1);
    if (pk >= 0.5) { e1x = p1x; e1y = p1y; e2x = p2x; e2y = p2y; }
    ctx.globalAlpha = ga;
  }
  K.end();
  // 눈빛 (앉아 있을 때 가끔 깜빡)
  const blink = pk > 0.5 && ((t % 3.7) < 0.12);
  if (!blink) {
    const ea = cast ? 1 : 0.55;
    gGlow(ctx, e1x, e1y, cast ? 4 : 1.8, '#ffe070', ea, 0.25);
    gGlow(ctx, e2x, e2y, cast ? 3.4 : 1.5, '#ffe070', ea * 0.85, 0.25);
  }
  if (cast) gGlow(ctx, Math.max(e1x, e2x) + 3, (e1y + e2y) / 2, 10 + Math.sin(t * 20) * 1.5, '#fff2a0', 0.7);
}

export default { id: 'gd_owl', kind: 'companion', load, draw };
