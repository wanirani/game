// [임시 렌더러] 캐릭터 렌더 담당이 전면 교체 예정.
// drawHero(ctx, p, world, opts)
//   p: {cx, bottom, facing, anim, animT, move, moveT, look, ch, vx, vy, onGround, rig, t, stats, charging, muzzleT}
//   opts: {alpha, tint(단색 잔상), scale}
import { TAU, shade } from '../core/math.js';

export function drawHero(ctx, p, world, opts = {}) {
  const L = p.look || {};
  const s = (opts.scale ?? 1) * (L.height ?? 1);
  ctx.save();
  ctx.translate(p.cx, p.bottom);
  ctx.scale(p.facing * s, s);
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  const tint = opts.tint;
  const col = (c) => tint || c;
  const t = p.animT ?? 0;
  const run = p.anim === 'run';
  const leg = run ? Math.sin((p.t ?? 0) * 14) * 12 : 0;
  // 망토
  if (L.cape) { ctx.fillStyle = col(L.cape.color); ctx.beginPath(); ctx.moveTo(-6, -66); ctx.lineTo(8, -66); ctx.lineTo(-10 - Math.abs(p.vx ?? 0) * 0.04, -8); ctx.lineTo(-26 - Math.abs(p.vx ?? 0) * 0.06, -12); ctx.fill(); }
  // 다리
  ctx.fillStyle = col(L.pants ?? '#222');
  ctx.fillRect(-7 + leg * 0.3, -36, 7, 34); ctx.fillRect(1 - leg * 0.3, -36, 7, 34);
  ctx.fillStyle = col(L.boots ?? '#111');
  ctx.fillRect(-8 + leg * 0.3, -10, 9, 10); ctx.fillRect(0 - leg * 0.3, -10, 9, 10);
  // 몸통/코트
  ctx.fillStyle = col(L.primary ?? '#444');
  ctx.beginPath(); ctx.moveTo(-11, -70); ctx.lineTo(11, -70); ctx.lineTo(13, L.coat === 'long' || L.coat === 'robe' ? -18 : -34); ctx.lineTo(-13, L.coat === 'long' || L.coat === 'robe' ? -18 : -34); ctx.fill();
  ctx.fillStyle = col(L.secondary ?? '#822'); ctx.fillRect(-2, -68, 4, 30);
  ctx.fillStyle = col(L.trim ?? '#ccc'); ctx.fillRect(-11, -44, 22, 3);
  // 머리
  ctx.fillStyle = col(L.skin ?? '#e8c2a0'); ctx.beginPath(); ctx.arc(1, -80, 9, 0, TAU); ctx.fill();
  ctx.fillStyle = col(L.hair ?? '#333'); ctx.beginPath(); ctx.arc(-1, -83, 9.5, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
  if (L.hairStyle === 'long' || L.hairStyle === 'flowing' || L.hairStyle === 'ponytail') ctx.fillRect(-10, -84, 7, 22);
  if (!tint) { ctx.fillStyle = L.eyes ?? '#fff'; ctx.fillRect(5, -82, 3, 2); }
  // 팔 + 무기
  const mv = p.move;
  const prog = mv ? Math.min(1, (p.moveT ?? 0) / mv.dur) : 0;
  const armA = mv ? -1.6 + prog * 2.4 : run ? Math.sin((p.t ?? 0) * 14) * 0.6 : 0.2;
  ctx.save();
  ctx.translate(2, -64);
  ctx.rotate(armA);
  ctx.fillStyle = col(L.primary ?? '#444'); ctx.fillRect(-3, 0, 7, 24);
  ctx.fillStyle = col(L.skin ?? '#e8c2a0'); ctx.fillRect(-2, 22, 6, 5);
  ctx.restore();
  if (mv && !tint) {
    const wt = L.weapon?.type ?? 'whip';
    const a = armA;
    const hx = 2 + Math.sin(-a) * -26, hy = -64 + Math.cos(a) * 26;
    ctx.strokeStyle = L.weapon?.color ?? '#8a6a4a'; ctx.lineWidth = wt === 'greatsword' ? 7 : 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx, hy);
    if (wt === 'whip' && mv.box) {
      const reach = mv.box.w * (prog > (mv.hit[0] / mv.dur) && prog < (mv.hit[1] / mv.dur) + 0.1 ? 1 : 0.4);
      ctx.quadraticCurveTo(hx + reach * 0.5, hy - 20 + (mv.box.y + 50) * 0.3, mv.box.x + reach, mv.box.y + mv.box.h / 2);
    } else if (wt === 'gun') { ctx.lineTo(hx + 18, hy); }
    else { ctx.lineTo(hx + Math.cos(a + 1.5) * 50, hy + Math.sin(a + 1.5) * 50); }
    ctx.stroke();
  }
  ctx.restore();
}
