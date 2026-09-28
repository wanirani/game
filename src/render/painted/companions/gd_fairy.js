// 채색 수호신: 아리아 (gd_fairy, 빛의 요정) — CMP-GUARD-ART-A. T1 채색 퍼핏 (docs/art/ENEMY_PIPELINE.md 방식, 에셋 assets/painted/companions/gd_fairy/).
// 조각: body (날개·오른팔 없는 앞모습 소녀) · arm (별 지팡이를 쥔 오른팔, 어깨 피벗) · wingU / wingL (잠자리 날개 윗·아랫장, 뿌리 피벗 — 좌우 거울).
// 상태 (guardian.js anim): idle 떠다님 · move 앞으로 기울기 · attack 지팡이 찌르기 + 별빛 · skill 지팡이 치켜들기 + 빛의 고리 · assist 돌진 줄 ·
//   hurt 움찔 · appear 커지며 나타남 · emote 한 바퀴 빙글 · perch 머리 위에 앉음(날개 접음). 각성: 후광. 날개는 두 벌을 겹쳐 그려 움직임 번짐.
// 그리기 규약: drawGuardian 이 발 중앙 원점·facing 반전을 걸어 준 ctx. world 는 null 일 수 있다(메뉴). 게임 상태를 바꾸지 않는다.
import * as K from '../enemy_kit.js';
import { clamp, lerp, TAU } from '../../../core/math.js';
import { gGlow, gStar, gHalo, gSparkles, gAwake } from '../../guardians.js';

export const spec = { id: 'gd_fairy', tier: 'T1', src: '../companions/gd_fairy', bake: { outline: 0.3, outlineParts: { wingU: 0, wingL: 0 }, flash: false, glow: { wingU: '#dff6ff', wingL: '#dff6ff' } } };

const _q = [0, 0];
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const WINGS = [   // [part, 좌(1)/우(-1), 기본 각, 배율, 알파] — 뿌리에서 +x 로 그려진 날개를 등 뒤 양쪽으로
  ['wingU', 1, -0.55, 1.3, 0.85], ['wingL', 1, 0.28, 1.2, 0.78],
  ['wingU', -1, -0.55, 1.3, 0.85], ['wingL', -1, 0.28, 1.2, 0.78],
];

async function load() {
  const rig = K.requestRig(spec);
  await rig.promise;
  if (!rig.ready) throw new Error('rig ' + spec.id);
  return rig;
}

function draw(ctx, g, world, rig) {
  const t = g.t ?? 0, at = g.animT ?? 0, an = g.anim ?? 'idle';
  const f = g.facing < 0 ? -1 : 1, vxf = (g.vx ?? 0) * f;
  const perch = an === 'perch' || !!g.perched;
  const cast = an === 'skill', emote = an === 'emote';
  const atk = an === 'attack' || an === 'assist';
  const hurt = an === 'hurt' ? 1 - clamp(at / 0.3, 0, 1) : 0;
  const ap = an === 'appear' ? easeOut(clamp(at / 0.3, 0, 1)) : 1;
  const aw = gAwake(g);
  const q = world?.fx?.quality ?? 1;
  const bob = perch ? Math.sin(t * 2) * 0.3 : Math.sin(t * 3 + (g.seed ?? 0)) * 1.4;
  let tilt = perch ? -0.05 : clamp(vxf * 0.0008, -0.18, 0.3) - hurt * 0.35;
  if (cast) tilt = -0.1;
  const sc = 0.55 + 0.45 * ap;
  if (hurt > 0) ctx.translate(Math.sin(t * 70) * 1.2 * hurt, 0);
  // 반짝이 꼬리 · 빛의 핵 (몸 뒤, 발 원점 좌표)
  if (!perch && q > 0.5) gSparkles(ctx, t, -1, -13 + bob, q >= 0.95 ? 4 : 3, 10 + Math.max(0, vxf) * 0.02, '#fff2b0', 0.85);
  gGlow(ctx, 0, -14 + bob, (cast ? 22 : 11) * sc, '#fff2b0', (cast ? 0.75 : 0.32) + Math.sin(t * 4) * 0.06);
  ctx.translate(0, -13 + bob);
  ctx.rotate(tilt);
  if (sc !== 1) ctx.scale(sc, sc);
  let spin = 1;
  if (emote) { const k = clamp(at / 0.9, 0, 1); spin = Math.cos(k * TAU) || 0.01; ctx.translate(0, -Math.sin(k * Math.PI) * 2); }
  if (spin !== 1) ctx.scale(spin, 1);
  K.begin(ctx, rig, 0);
  // 몸 배치: 발(a)이 (0, 13) — 몸 중심이 원점 근처
  const bx = 0, by = 13;
  // 날개 넷 (뒤): 뿌리 wl / wr, 날갯짓 번짐 두 벌
  const amp = perch ? 0.06 : cast ? 0.3 : 0.22, ph = t * 44;
  for (let i = 0; i < 4; i++) {
    const [pn, side, a0, ws, wa] = WINGS[i];
    K.pivotPos('body', 'a', side > 0 ? 'wr' : 'wl', bx, by, 0, 1, 1, _q);
    const fold = perch ? (pn === 'wingU' ? -0.55 : -0.35) : 0;
    const d = Math.sin(ph + i * 0.9) * amp;
    // 오른쪽(+x) 날개는 그대로, 왼쪽은 좌우 거울 (sx 음수)
    const rot = (a0 + fold + d) * side, rot2 = (a0 + fold - d * 0.7) * side;
    K.put(pn, 'a', _q[0], _q[1], rot, ws * side, ws, wa);
    // 번짐 두 번째 장 · 빛 한 겹은 큰 윗날개에만 (그리기 비용 ≤ 절차 그림 ×1.5)
    if (pn !== 'wingU') continue;
    if (q > 0.5) K.put(pn, 'a', _q[0], _q[1], rot2, ws * side, ws, wa * 0.5);
    if (q >= 0.95) { const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; K.put(pn, 'a', _q[0], _q[1], rot, ws * side, ws, 0.18 + 0.08 * Math.sin(t * 6 + i), 'glow'); ctx.globalCompositeOperation = gco; }
  }
  K.put('body', 'a', bx, by, 0, 1, 1);
  // 지팡이 팔 (어깨 sh): 각 0 = 수평 앞, - = 위로
  let aa = -0.75 + Math.sin(t * 2.2) * 0.08;
  if (atk) aa = at < 0.14 ? lerp(-1.6, 0.1, easeOut(at / 0.14)) : lerp(0.1, -0.6, clamp((at - 0.14) / 0.3, 0, 1));
  else if (cast) aa = lerp(-0.8, -1.45, easeOut(clamp(at / 0.2, 0, 1)));
  else if (emote) aa = -0.9 + Math.sin(at * 14) * 0.45;
  else if (perch) aa = -0.2;
  else if (hurt > 0) aa = -0.2;
  K.pivotPos('body', 'a', 'sh', bx, by, 0, 1, 1, _q);
  const shx = _q[0], shy = _q[1];
  K.put('arm', 'a', shx, shy, aa, 1, 1);
  K.pivotPos('arm', 'a', 'tip', shx, shy, aa, 1, 1, _q);
  const tx = _q[0], ty = _q[1];
  K.pivotPos('body', 'a', 'core', bx, by, 0, 1, 1, _q);
  const cx = _q[0], cy = _q[1];
  K.pivotPos('body', 'a', 'top', bx, by, 0, 1, 1, _q);
  const hx = _q[0], hy = _q[1];
  K.end();
  // 별빛 · 가호의 고리 · 각성 후광 (로컬 좌표 = 몸 중심 원점)
  const star = atk ? 1 - clamp((at - 0.1) / 0.3, 0, 1) : cast ? 1 : 0;
  gGlow(ctx, tx, ty, 3.5 + star * 7, '#fff2b0', 0.55 + star * 0.45, 0.2);
  gStar(ctx, tx, ty, 2.4 + star * 4 + Math.sin(t * 9) * 0.4, 0.85, t * 1.5);
  gGlow(ctx, cx, cy, 4, '#fffbe0', 0.25 + Math.sin(t * 5) * 0.08, 0.3);
  if (cast) {
    const k = clamp(at / 0.25, 0, 1), fade = 1 - clamp((at - 0.5) / 0.3, 0, 1);
    gHalo(ctx, cx, cy, 9 + 5 * k, 3.2 + k, '#ffe070', 0.8 * fade, 0.7, Math.sin(t * 3) * 0.2);
    gHalo(ctx, cx, cy - 3, 6 + 7 * k, 2 + k, '#fff2b0', 0.5 * fade, 0.5, -0.3);
  }
  if (aw) gHalo(ctx, hx, hy - 1.2, 3.6, 1.1, '#ffe070', 0.85 + Math.sin(t * 3) * 0.15, 0.55);
  if (an === 'assist' && at < 0.2) {
    ctx.save(); ctx.globalAlpha *= 0.6; ctx.fillStyle = '#fff2b0';
    for (let i = 0; i < 3; i++) ctx.fillRect(-18 - i * 5, -4 + i * 3, 12, 0.7);
    ctx.restore();
  }
}

export default { id: 'gd_fairy', kind: 'companion', load, draw };
