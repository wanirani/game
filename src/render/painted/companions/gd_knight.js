// 채색 수호신: 가웨인 (gd_knight, 망령 기사) — CMP-GUARD-ART-A. T2 채색 퍼핏 (에셋 assets/painted/companions/gd_knight/).
// 조각: body (검·방패를 지운 Step-4 편집 그림: 투구·판금·망토·안개 하반신, 앞으로 든 먼 쪽 주먹은 잘라 냄) ·
//   farm (먼 쪽 아래팔+주먹, 팔꿈치 피벗 — 검을 휘두르는 팔) · sword (자루와 날밑, 날의 밑동) · shield (십자 방패, 앞모습 → 눌러서 비스듬히).
// 망령 검의 긴 날은 그림이 아니라 가산 빛(굽기 스프라이트)으로 그린다 — 참조 시트의 검도 날이 반투명 빛줄기다.
// 상태: idle 떠 있는 경계 자세 · move 앞으로 기울기 · attack 두 번 베기(내려치기 → 올려치기, 궤적) · assist 방패 강타 ·
//   guard/skill 방패를 앞으로 치켜들고 빛 · emote 검을 세워 경례 · hurt 움찔 · appear 안개에서 솟아남. 각성: 금빛 방패 테두리 · 금빛 기운.
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';
import { gGlow, gHalo, gAwake } from '../../guardians.js';

export const spec = {
  id: 'gd_knight', tier: 'T2', src: '../companions/gd_knight',
  bake: { outline: 0.35, outlineParts: { sword: 0.25 }, glow: { body: '#bfe6ff', farm: '#bfe6ff', shield: '#ffd070' }, flash: false },
};

const _q = [0, 0];
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));
const BLADE = 30;   // 빛의 날 길이 (논리 px)

let _blade = null;
function bladeSpr() {
  if (_blade !== null) return _blade;
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return (_blade = false);
  const W = 16, H = 128, c = K.mkCanvas(W, H), x = c.getContext('2d');
  // 뿌리(아래) → 끝(위), 가운데 흰 심 + 푸른 가장자리, 끝으로 갈수록 가늘고 흐려진다
  const g = x.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0, 'rgba(210,240,255,0.95)'); g.addColorStop(0.7, 'rgba(150,210,255,0.8)'); g.addColorStop(1, 'rgba(120,190,255,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(W / 2 - 5, H); x.lineTo(W / 2 - 3.4, 14); x.lineTo(W / 2, 0); x.lineTo(W / 2 + 3.4, 14); x.lineTo(W / 2 + 5, H); x.closePath(); x.fill();
  const g2 = x.createLinearGradient(0, H, 0, 0);
  g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(0.8, 'rgba(235,248,255,0.7)'); g2.addColorStop(1, 'rgba(235,248,255,0)');
  x.fillStyle = g2; x.fillRect(W / 2 - 1.2, 6, 2.4, H - 6);
  return (_blade = c);
}

/** 검 팔: fa = 아래팔 회전 (그림 기준, - = 들어 올림), sr = 검의 추가 회전 */
function armPose(an, at, t, hurt) {
  let fa = Math.sin(t * 1.6) * 0.05, sr = 0;
  if (an === 'attack') {
    const n = Math.floor(at / 0.18), p = clamp((at % 0.18) / 0.18, 0, 1);
    if (n === 0) { const e = easeIO(clamp(p * 1.4, 0, 1)); fa = lerp(-1.1, 0.7, e); sr = lerp(0.25, 0.9, e); }
    else if (n === 1) { const e = easeIO(clamp(p * 1.4, 0, 1)); fa = lerp(0.7, -0.85, e); sr = lerp(0.9, 0.2, e); }
    else { const e = easeOut(clamp((at - 0.36) / 0.25, 0, 1)); fa = lerp(-0.85, 0, e); sr = lerp(0.2, 0, e); }
  } else if (an === 'skill') { const e = easeOut(clamp(at / 0.2, 0, 1)); fa = -1.3 * e; sr = -0.1 * e; }
  else if (an === 'emote') { const e = Math.sin(clamp(at / 0.9, 0, 1) * Math.PI); fa = -0.55 * e; sr = (-0.32 + 0.55) * e; }
  else if (an === 'guard') { fa = 0.3; sr = 0.95; }
  else if (an === 'assist') { fa = 0.45; sr = 0.7; }
  if (hurt > 0) { fa = lerp(fa, 0.55, hurt); sr = lerp(sr, 0.4, hurt); }
  return [fa, sr];
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
  const cast = an === 'skill', guard = an === 'guard', emote = an === 'emote';
  const attack = an === 'attack', bash = an === 'assist';
  const hurt = an === 'hurt' ? 1 - clamp(at / 0.3, 0, 1) : 0;
  const ap = an === 'appear' ? easeOut(clamp(at / 0.35, 0, 1)) : 1;
  const aw = gAwake(g);
  const hiQ = (world?.fx?.quality ?? 1) >= 0.95;
  const bob = Math.sin(t * 2.6 + (g.seed ?? 0)) * 1.5;
  const moving = Math.abs(vxf) > 60;
  const lean = clamp(vxf * 0.0004, -0.1, 0.16) - hurt * 0.15 + (attack ? 0.06 : 0) + (emote ? 0.1 * Math.sin(clamp(at / 0.9, 0, 1) * Math.PI) : 0);
  // 그림자 · 안개 빛
  ctx.save(); ctx.globalAlpha *= 0.3; ctx.fillStyle = '#081020'; ctx.beginPath(); ctx.ellipse(0, -0.5, 14, 2.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  if (ap < 1) { ctx.translate(0, (1 - ap) * 20); gGlow(ctx, 0, -30, 34, '#8ac8ff', 0.7 * (1 - ap)); ctx.globalAlpha *= 0.25 + 0.75 * ap; }
  gGlow(ctx, 0, -40 + bob, 30, aw ? '#ffe7a0' : '#8ac8ff', (cast || guard ? 0.42 : 0.15) + (aw ? 0.1 : 0));
  if (hurt > 0) ctx.translate(Math.sin(t * 70) * 1.2 * hurt, 0);
  ctx.translate(0, bob - 1);
  ctx.translate(0, -36); ctx.rotate(lean); ctx.translate(0, 36);
  ctx.globalAlpha *= 0.95;
  const [fa, sr] = armPose(an, at, t, hurt);
  K.begin(ctx, rig, 0);
  const bx = 0, by = 0;
  // 검 팔 위치 (몸보다 먼저 계산 — 검은 몸 뒤, 주먹은 몸 앞)
  K.pivotPos('body', 'a', 'elb', bx, by, 0, 1, 1, _q); const ex = _q[0], ey = _q[1];
  K.pivotPos('farm', 'a', 'fist', ex, ey, fa, 1, 1, _q); const fx = _q[0], fy = _q[1];
  const swr = fa + sr;
  K.pivotPos('sword', 'a', 'guard', fx, fy, swr, 1, 1, _q); const gx = _q[0], gy = _q[1];
  K.pivotPos('sword', 'a', 'pom', fx, fy, swr, 1, 1, _q);
  let dx = gx - _q[0], dy = gy - _q[1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  // 빛의 날 (몸 뒤)
  const bs = bladeSpr();
  const hot = attack && at < 0.36 ? 1 : cast ? 0.8 : 0;
  if (bs) {
    K.local();
    const gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * (0.75 + 0.25 * hot);
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
    ctx.drawImage(bs, -2.6 * (1 + hot * 0.3), -BLADE, 5.2 * (1 + hot * 0.3), BLADE);
    ctx.restore();
    ctx.globalCompositeOperation = gco; ctx.globalAlpha = ga;
  }
  K.put('sword', 'a', fx, fy, swr, 1, 1);
  K.put('body', 'a', bx, by, 0, 1, 1);
  if (hiQ) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('body', 'a', bx, by, 0, 1, 1, 0.07 + 0.04 * Math.sin(t * 3), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.put('farm', 'a', ex, ey, fa, 1, 1);
  // 방패 (가까운 손)
  K.pivotPos('body', 'a', 'hand2', bx, by, 0, 1, 1, _q);
  let sxp = _q[0] + 3, syp = _q[1] + 4, srot = -0.06, ssx = 0.72, ssc = 1;
  if (guard || cast) { const k = easeOut(clamp(at / 0.12, 0, 1)); sxp = lerp(sxp, sxp + 9, k); syp = lerp(syp, syp - 10, k); ssx = lerp(0.72, 0.92, k); ssc = 1 + 0.06 * k; srot = lerp(-0.06, 0.04, k); }
  else if (bash) { const k = at < 0.1 ? easeOut(at / 0.1) : 1 - clamp((at - 0.1) / 0.2, 0, 1); sxp += 9 * k; syp -= 3 * k; srot = -0.06 - 0.15 * k; ssx = 0.72 + 0.2 * k; }
  else if (attack) { sxp -= 2; syp += 1; srot = 0.08; }
  if (aw) K.put('shield', 'a', sxp, syp, srot, ssx * ssc * 1.09, ssc * 1.06, 0.8, 'glow');
  K.put('shield', 'a', sxp, syp, srot, ssx * ssc, ssc, 1);
  K.pivotPos('body', 'a', 'eye', bx, by, 0, 1, 1, _q); const eyx = _q[0], eyy = _q[1];
  K.pivotPos('body', 'a', 'mist', bx, by, 0, 1, 1, _q); const mx = _q[0], my = _q[1];
  K.pivotPos('body', 'a', 'chest', bx, by, 0, 1, 1, _q); const cx = _q[0], cy = _q[1];
  K.end();
  // 눈 틈 빛 · 안개 자락 · 날밑 빛
  gGlow(ctx, eyx + 1, eyy, 2.6, '#ffffff', 0.95, 0.25);
  gGlow(ctx, eyx + 1.5, eyy, 7, '#bfe6ff', 0.45);
  for (let i = 0; i < (hiQ ? 3 : 2); i++) {
    const ph = t * 1.4 + i * 2.1;
    gGlow(ctx, mx - 4 + i * 5 - (moving ? 5 : 0) + Math.sin(ph) * 2, my - 2 - i * 5 + Math.sin(ph * 0.7) * 1.5, 6 - i, '#bfe6ff', 0.22 + 0.08 * Math.sin(ph));
  }
  gGlow(ctx, gx, gy, 3 + hot * 3, '#e8f4ff', 0.5 + hot * 0.4);
  if (aw) gGlow(ctx, cx, cy, 12, '#ffd070', 0.18 + 0.06 * Math.sin(t * 3));
  // 검 궤적 (휘두를 때): 팔꿈치 둘레 호
  if (attack && at < 0.34 && (world?.fx?.quality ?? 1) > 0.5) {
    const n = Math.floor(at / 0.18), p = clamp((at % 0.18) / 0.18 * 1.4, 0, 1);
    if (p > 0.15 && p < 0.98) {
      const a1 = Math.atan2(gy + dy * BLADE * 0.6 - ey, gx + dx * BLADE * 0.6 - ex);
      const lag = armPose('attack', Math.max(n * 0.18, at - 0.07), t, 0);
      const a0 = a1 - (fa + sr - lag[0] - lag[1]);
      const R = Math.hypot(gx + dx * BLADE * 0.6 - ex, gy + dy * BLADE * 0.6 - ey);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(190,230,255,0.35)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(ex, ey, R, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ex, ey, R + 1, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      ctx.restore();
    }
  }
  if (guard || cast) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 10);
    gGlow(ctx, sxp, syp, 18, '#bfe6ff', 0.4 + 0.2 * pulse);
    gHalo(ctx, sxp + 2, syp, 7 + pulse * 2, 12 + pulse * 2, aw ? '#ffe070' : '#8ac8ff', 0.5, 0.6);
  }
  if (cast) {   // 하늘로 치솟는 빛
    const k = clamp(at / 0.3, 0, 1), fade = 1 - clamp((at - 0.45) / 0.2, 0, 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.4 * fade;
    ctx.fillStyle = '#8ac8ff'; ctx.fillRect(gx - 5, gy - 120 * k - 30, 10, 120 * k);
    ctx.fillStyle = '#e8f4ff'; ctx.fillRect(gx - 1.5, gy - 120 * k - 30, 3, 120 * k); ctx.restore();
  }
}

export default { id: 'gd_knight', kind: 'companion', load, draw };
