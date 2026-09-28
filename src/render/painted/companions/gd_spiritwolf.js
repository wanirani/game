// 채색 수호신: 하티 (gd_spiritwolf, 영혼 늑대) — CMP-GUARD-ART-A. T2 채색 퍼핏 (에셋 assets/painted/companions/gd_spiritwolf/).
// 조각: body (옆모습 몸통·머리·목갈기, 아래다리와 꼬리를 잘라 낸 참조 그림) · tail (별빛 불꽃 꼬리, 뿌리 피벗) ·
//   fleg / hleg (앞·뒷다리 — 몸 뒤에 어깨·엉덩이 피벗으로 매달아 흔든다, 먼 쪽 다리는 어둡게).
// 상태: idle 숨쉬기·꼬리 · run 질주(회전 갤럽) · pounce 도약(앞다리 뻗고 뒷다리 차기) · attack 물기(앞으로 튀어나감) ·
//   howl/skill 고개 들고 울부짖기(울음 고리) · emote 엎드려 꼬리 흔들기 · hurt 움찔 · appear 안개에서 솟아남. 각성: 두 갈래 꼬리.
// 영체: 몸 전체를 살짝 투명하게 + 가산 빛 한 겹(높음 품질), 몸 속 별이 반짝이고 귀끝·꼬리끝에 불꽃 빛.
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { gGlow, gStar, gHalo } from '../../guardians.js';

export const spec = {
  id: 'gd_spiritwolf', tier: 'T2', src: '../companions/gd_spiritwolf',
  bake: { outline: 0.35, outlineParts: { tail: 0.2 }, deep: { fleg: 0.62, hleg: 0.62 }, deepTint: 'rgb(90,150,180)', glow: { body: '#bff4ff', tail: '#e8fbff' }, flash: false },
};

const _q = [0, 0];
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const P = { fN: 0, fF: 0, hN: 0, hF: 0, pitch: 0, bob: 0, lunge: 0, tail: 0, tailA: 0.1, tailF: 2, crouch: 0, sy: 1 };

function pose(g, t, at, an, vxf, vy, hurt) {
  const q = P;
  q.fN = 0.03; q.fF = -0.03; q.hN = -0.03; q.hF = 0.03; q.pitch = 0; q.bob = Math.sin(t * 2.4) * 0.35; q.lunge = 0;
  q.tail = Math.sin(t * 1.4) * 0.06; q.tailA = 0.1; q.tailF = 2.2; q.crouch = 0; q.sy = 1 + Math.sin(t * 2.4) * 0.008;
  const run = an === 'run' || an === 'move' || an === 'assist' || (an === 'idle' && Math.abs(vxf) > 60);
  if (run) {
    const ph = t * 15, A = 0.75;
    q.fN = Math.sin(ph) * A; q.fF = Math.sin(ph + 0.4) * A; q.hN = Math.sin(ph + 2.6) * A; q.hF = Math.sin(ph + 3) * A;
    q.pitch = Math.sin(ph) * 0.05; q.bob = Math.sin(ph * 2) * 1.4; q.tail = 0.35; q.tailA = 0.08; q.tailF = 16;
  } else if (an === 'pounce') {
    q.fN = q.fF = -0.95; q.hN = q.hF = 1.0; q.pitch = clamp((vy ?? 0) * 0.0011, -0.3, 0.3) - 0.05; q.tail = 0.45; q.tailF = 10;
  } else if (an === 'attack') {
    const ch = Math.abs(Math.sin(at * 26));
    q.lunge = 3.5 * ch; q.pitch = 0.08 * ch; q.fN = -0.3; q.fF = -0.15; q.hN = 0.25; q.hF = 0.2;
  } else if (an === 'howl' || an === 'skill') {
    const k = easeOut(clamp(at / 0.2, 0, 1));
    q.pitch = -0.2 * k; q.hN = q.hF = 0.35 * k; q.fN = -0.12 * k; q.fF = 0.05; q.crouch = 1.5 * k; q.tail = -0.25 * k; q.tailA = 0.04; q.tailF = 18;
  } else if (an === 'emote') {
    const k = Math.sin(clamp(at, 0, 1) * Math.PI);
    q.pitch = 0.16 * k; q.fN = q.fF = -0.6 * k; q.tail = -0.2; q.tailA = 0.32; q.tailF = 18;
  }
  if (hurt > 0) { q.pitch = -0.14 * hurt; q.lunge = -3 * hurt; }
  return q;
}

async function load() {
  const rig = K.requestRig(spec);
  await rig.promise;
  if (!rig.ready) throw new Error('rig ' + spec.id);
  return rig;
}

function draw(ctx, g, world, rig) {
  const t = g.t ?? 0, at = g.animT ?? 0, an = g.anim ?? 'idle';
  const f = g.facing < 0 ? -1 : 1, vxf = (g.vx ?? 0) * f;
  const hurt = an === 'hurt' ? 1 - clamp(at / 0.3, 0, 1) : 0;
  const ap = an === 'appear' ? easeOut(clamp(at / 0.3, 0, 1)) : 1;
  const aw = !!(g.d?.awakened);
  const hiQ = (world?.fx?.quality ?? 1) >= 0.95;
  const q = pose(g, t, at, an, vxf, g.vy, hurt);
  // 그림자
  ctx.save(); ctx.globalAlpha *= 0.26; ctx.fillStyle = '#021018'; ctx.beginPath(); ctx.ellipse(0, -0.5, 19, 2.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  if (ap < 1) { gGlow(ctx, 0, -10, 28, '#7ee0ff', 0.7 * (1 - ap)); ctx.scale(1, 0.3 + 0.7 * ap); }
  if (hurt > 0) ctx.translate(Math.sin(t * 70) * 1.2 * hurt, 0);
  ctx.globalAlpha *= 0.93;
  K.begin(ctx, rig, 0);
  // 몸 배치: 발(a)은 지면. 기울기는 엉덩이 쪽(뒤) 기준이 아니라 몸 중심 — 작아서 차이가 적다
  const bx = q.lunge, by = -q.crouch * 0.4 + q.bob;
  // 다리 (몸 뒤, 어깨·엉덩이 피벗에서 매단다): 먼 쪽 → 가까운 쪽
  const leg = (pn, part, a, vn, sy) => {
    K.pivotPos('body', 'a', pn, bx, by, q.pitch, 1, q.sy, _q);
    K.put(part, 'a', _q[0], _q[1], -a, 1.05, sy, 1, vn);
  };
  leg('hF', 'hleg', q.hF, 'deep', 1.08);
  leg('fF', 'fleg', q.fF, 'deep', 0.97);
  // 꼬리 (두 갈래: 각성)
  K.pivotPos('body', 'a', 'tail', bx, by, q.pitch, 1, q.sy, _q);
  const tx = _q[0], ty = _q[1];
  const tw = Math.sin(t * q.tailF) * q.tailA;
  const tails = aw ? [-0.2, 0.18] : [0];
  for (const off of tails) K.put('tail', 'a', tx, ty, q.tail + off + tw + q.pitch, 1, 1);
  leg('hN', 'hleg', q.hN, 'base', 1.08);
  leg('fN', 'fleg', q.fN, 'base', 0.97);
  K.put('body', 'a', bx, by, q.pitch, 1, q.sy);
  if (hiQ) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('body', 'a', bx, by, q.pitch, 1, q.sy, 0.1 + 0.05 * Math.sin(t * 3), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.pivotPos('body', 'a', 'eye', bx, by, q.pitch, 1, q.sy, _q); const ex = _q[0], ey = _q[1];
  K.pivotPos('body', 'a', 'nose', bx, by, q.pitch, 1, q.sy, _q); const nx = _q[0], ny = _q[1];
  K.pivotPos('body', 'a', 'ear', bx, by, q.pitch, 1, q.sy, _q); const e1x = _q[0], e1y = _q[1];
  K.pivotPos('body', 'a', 'ear2', bx, by, q.pitch, 1, q.sy, _q); const e2x = _q[0], e2y = _q[1];
  K.pivotPos('tail', 'a', 'tip', tx, ty, q.tail + tw + q.pitch, 1, 1, _q); const ttx = _q[0], tty = _q[1];
  K.end();
  // 빛: 흰 눈 · 귀끝 · 꼬리끝 · 몸 속 별
  gGlow(ctx, ex, ey, 2.2, '#ffffff', 0.95, 0.3);
  gGlow(ctx, ex, ey, 5, '#bff4ff', 0.4);
  const fl = 0.8 + Math.sin(t * 15) * 0.2;
  gGlow(ctx, e1x, e1y, 3 * fl, '#e8fbff', 0.6, 0.3); gGlow(ctx, e2x, e2y, 2.5 * fl, '#bff4ff', 0.45, 0.3);
  gGlow(ctx, ttx, tty, 5 * fl, '#bff4ff', 0.4);
  if (hiQ) for (let i = 0; i < 4; i++) {
    const tw2 = 0.5 + 0.5 * Math.sin(t * (2 + i * 0.7) + i * 2.1);
    gStar(ctx, bx - 8 + i * 5.5 + Math.sin(i * 3.1) * 2, by - 16 + Math.cos(i * 2.3) * 3, 0.9 + tw2 * 0.9, 0.25 + tw2 * 0.55, i);
  }
  if (an === 'attack') gGlow(ctx, nx + 3, ny + 1, 4 + Math.abs(Math.sin(at * 26)) * 4, '#e8fbff', 0.6);
  if ((an === 'howl' || an === 'skill') && at < 0.9) {
    const k = clamp(at / 0.9, 0, 1);
    for (let i = 0; i < 3; i++) { const kk = (k + i * 0.3) % 1; gHalo(ctx, nx + 4, ny - 6, 5 + kk * 16, 4 + kk * 11, '#bff4ff', (1 - kk) * 0.6, 0.8); }
    gGlow(ctx, bx, -20, 26, '#7ee0ff', 0.35);
  }
}

export default { id: 'gd_spiritwolf', kind: 'companion', load, draw };
