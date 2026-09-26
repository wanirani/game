// 인게임 HUD: 초상화/HP/MP/EXP, 하트+보조무기, 스킬 슬롯, 필살 게이지, 점수/목숨/골드/시간, 콤보·스타일 랭크, 보스 체력바, 버프, 배너
import { text, bar, FONT, COLORS } from '../core/ui.js';
import { assets } from '../core/assets.js';
import { fmt, fmtTime, TAU, clamp, rgba } from '../core/math.js';
import { drawIcon } from './icons.js';
import { drawHeart } from '../game/pickups.js';
import { SUBWEAPONS } from '../data/subweapons.js';
import { SKILLS } from '../data/skills.js';
import { POWERUPS } from '../data/powerups.js';
import { CHARACTERS } from '../data/characters.js';
import { CLASSES } from '../data/classes.js';
import { expToNext } from '../game/stats.js';
import { styleRank } from '../game/world.js';
import { input } from '../core/input.js';

export function drawHUD(ctx, world, vw, vh) {
  const p = world.player;
  if (!p) return;
  const hero = world.hero, run = world.run, st = p.stats;
  ctx.save();
  // ── 좌상단: 초상화 ──
  const px = 14, py = 12;
  ctx.save();
  ctx.beginPath(); ctx.arc(px + 32, py + 32, 30, 0, TAU); ctx.closePath();
  ctx.fillStyle = '#12060c'; ctx.fill();
  ctx.clip();
  const img = assets.get(CHARACTERS[hero.charId].portrait);
  if (img) ctx.drawImage(img, px + 32 - 44, py + 2, 88, 88 * (img.height / img.width));
  else { ctx.fillStyle = p.look.primary ?? '#444'; ctx.fillRect(px, py, 64, 64); }
  ctx.restore();
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px + 32, py + 32, 31, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px + 32, py + 32, 34, 0, TAU); ctx.stroke();
  // 레벨 배지
  ctx.fillStyle = '#5a0a18'; ctx.beginPath(); ctx.arc(px + 56, py + 56, 12, 0, TAU); ctx.fill();
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 1.5; ctx.stroke();
  text(ctx, hero.level, px + 56, py + 61, { size: 12, align: 'center', weight: 800, family: FONT.num, color: '#fff' });

  // ── HP / MP / EXP ──
  const bx = px + 76, bw = 230;
  text(ctx, CHARACTERS[hero.charId].name, bx, py + 12, { size: 13, weight: 700, color: '#f3e2b8' });
  text(ctx, CLASSES[hero.classId]?.name ?? '', bx + bw, py + 12, { size: 11, align: 'right', color: COLORS.dim });
  bar(ctx, bx, py + 18, bw, 13, p.hp / st.hp, { color: '#d81c34', ghost: p.hpGhost / st.hp });
  text(ctx, `${Math.ceil(p.hp)} / ${st.hp}`, bx + bw - 4, py + 29, { size: 10, align: 'right', weight: 700, color: '#fff', ow: 2 });
  bar(ctx, bx, py + 34, bw * 0.8, 8, p.mp / st.mp, { color: '#3a7aff' });
  text(ctx, `${Math.floor(p.mp)}`, bx + bw * 0.8 + 6, py + 42, { size: 10, weight: 700, color: '#8ac8ff', ow: 2 });
  const need = expToNext(hero.level);
  bar(ctx, bx, py + 46, bw * 0.8, 3, hero.exp / need, { color: '#e8c872', shine: false });

  // ── 하트 + 보조무기 ──
  const sx = bx, sy = py + 54;
  ctx.save(); ctx.translate(sx + 8, sy + 10); drawHeart(ctx, 7, world.time); ctx.restore();
  text(ctx, `× ${run.hearts}`, sx + 20, sy + 15, { size: 14, weight: 800, family: FONT.num, color: '#ffb0b8' });
  // 보조무기 프레임 (클래식)
  const fx = sx + 70, fy = sy - 2;
  ctx.fillStyle = 'rgba(10,4,12,0.8)'; ctx.fillRect(fx, fy, 44, 26);
  ctx.strokeStyle = COLORS.goldDark; ctx.lineWidth = 1.5; ctx.strokeRect(fx + 0.5, fy + 0.5, 43, 25);
  const sw = SUBWEAPONS[run.sub];
  if (sw) drawIcon(ctx, sw.icon, fx + 22, fy + 13, 24);
  const multi = p.buffs.triple ? 'III' : p.buffs.double ? 'II' : '';
  if (multi) text(ctx, multi, fx + 48, fy + 18, { size: 12, weight: 900, family: FONT.num, color: '#8ac8ff' });

  // ── 버프 아이콘 ──
  let bi = 0;
  for (const k in p.buffs) {
    const pu = POWERUPS[k];
    if (!pu) continue;
    const x = sx + 130 + bi * 26, y = sy + 1;
    ctx.fillStyle = rgba(pu.color, 0.25); ctx.fillRect(x, y, 22, 22);
    ctx.strokeStyle = pu.color; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, 21, 21);
    text(ctx, pu.name[0], x + 11, y + 16, { size: 12, align: 'center', weight: 800, color: '#fff' });
    const left = p.buffs[k];
    if (left < 9000) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y + 22 * clamp(left / (pu.time || 1), 0, 1), 22, 22 * (1 - clamp(left / (pu.time || 1), 0, 1))); }
    bi++;
  }

  // ── 스킬 슬롯 + 필살 게이지 ──
  const kx = 14, ky = 92;
  for (let i = 0; i < 2; i++) {
    const sid = hero.slots?.[p.skillPage * 2 + i];
    const x = kx + i * 44, y = ky;
    ctx.fillStyle = 'rgba(10,4,12,0.8)'; ctx.fillRect(x, y, 38, 38);
    ctx.strokeStyle = COLORS.goldDark; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, 37, 37);
    const sk = SKILLS[sid];
    if (sk) {
      drawSkillGlyph(ctx, sk, x + 19, y + 19, 30);
      const cd = p.skillCd[sid] ?? 0;
      if (cd > 0) {
        const r = clamp(cd / (sk.cd || 1), 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.beginPath(); ctx.moveTo(x + 19, y + 19); ctx.arc(x + 19, y + 19, 26, -Math.PI / 2, -Math.PI / 2 + TAU * r); ctx.fill();
        text(ctx, cd.toFixed(1), x + 19, y + 24, { size: 11, align: 'center', weight: 800, color: '#fff' });
      } else if (p.mp < (sk.cost ?? 0)) { ctx.fillStyle = 'rgba(20,40,120,0.5)'; ctx.fillRect(x, y, 38, 38); }
    }
    text(ctx, input.touchMode ? ['S1', 'S2'][i] : ['S', 'D'][i], x + 3, y + 36, { size: 10, weight: 800, color: '#e8c872' });
  }
  text(ctx, `${p.skillPage + 1}/2`, kx + 92, ky + 14, { size: 10, color: COLORS.dim });
  // 필살 게이지 (가로 세그먼트)
  const ux = kx + 92, uy = ky + 20, uw = 120;
  const full = run.sp >= 100;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ux, uy, uw, 10);
  const g = ctx.createLinearGradient(ux, 0, ux + uw, 0);
  g.addColorStop(0, '#ff8a2a'); g.addColorStop(1, full ? `hsl(${(world.time * 300) % 360},90%,60%)` : '#ffe070');
  ctx.fillStyle = g; ctx.fillRect(ux, uy, uw * run.sp / 100, 10);
  for (let i = 1; i < 4; i++) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(ux + uw * i / 4, uy, 1.5, 10); }
  ctx.strokeStyle = full ? '#fff' : COLORS.goldDark; ctx.lineWidth = 1.5; ctx.strokeRect(ux - 0.5, uy - 0.5, uw + 1, 11);
  if (full && Math.floor(world.time * 4) % 2 === 0) text(ctx, input.touchMode ? '필살기 준비!' : '필살기 준비! [F]', ux, uy + 24, { size: 11, weight: 800, color: '#ffe070' });

  // ── 우상단: 점수/목숨/골드/시간 ──
  const rx = vw - 14;
  text(ctx, 'SCORE', rx - 150, 26, { size: 11, weight: 700, family: FONT.num, color: COLORS.dim });
  text(ctx, fmt(run.score).padStart(9, ' '), rx, 28, { size: 20, align: 'right', weight: 800, family: FONT.num, color: '#fff' });
  const hi = Math.max(world.game.meta?.highScores?.[0]?.score ?? 0, run.score);
  text(ctx, `HI ${fmt(hi)}`, rx, 46, { size: 11, align: 'right', weight: 700, family: FONT.num, color: '#e8c872' });
  text(ctx, `♥×${run.lives}`, rx - 150, 46, { size: 12, weight: 800, color: '#ff8a9a' });
  text(ctx, `${fmt(world.state.gold)} G`, rx, 64, { size: 12, align: 'right', weight: 700, color: '#ffd84a' });
  text(ctx, fmtTime(run.time), rx - 150, 64, { size: 12, weight: 700, family: FONT.num, color: '#c8c0b0' });

  // ── 콤보 ──
  const c = world.combo;
  if (c.n >= 2) {
    const rank = styleRank(c.n);
    const k = clamp(c.t / 2.6, 0, 1);
    const cx = vw - 24, cy = 150;
    const pop = 1 + Math.max(0, (c.t - 2.3)) * 1.2;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(pop, pop);
    text(ctx, `${c.n}`, 0, 0, { size: 44, align: 'right', weight: 900, family: FONT.num, color: '#fff', ow: 5 });
    text(ctx, 'HITS', 0, 18, { size: 13, align: 'right', weight: 800, family: FONT.num, color: '#ffd0a0' });
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx - 90, cy + 26, 90, 4);
    ctx.fillStyle = rank.c; ctx.fillRect(cx - 90 * k, cy + 26, 90 * k, 4);
    if (rank.r) {
      ctx.save(); ctx.translate(cx - 44, cy + 70);
      ctx.rotate(-0.12);
      text(ctx, rank.r, 0, 0, { size: 48, align: 'center', weight: 900, family: FONT.logo, color: rank.c, ow: 6 });
      ctx.restore();
    }
  }

  // ── 보스 체력 ──
  const b = world.boss;
  if (b && world.bossActive && !b.dead) {
    const w = Math.min(640, vw - 260), x = (vw - w) / 2, y = vh - 46;
    text(ctx, b.def.name, x, y - 8, { size: 16, weight: 800, family: FONT.title, color: '#ffd0d0' });
    if (b.def.title) text(ctx, b.def.title, x + w, y - 8, { size: 11, align: 'right', color: COLORS.dim });
    bar(ctx, x, y, w, 14, b.hp / b.stats.maxHp, { color: '#b0102a', ghost: b.hpGhost / b.stats.maxHp, edge: '#e8c872' });
    for (const ph of b.def.phases || []) { ctx.fillStyle = '#e8c872'; ctx.fillRect(x + w * ph - 1, y - 3, 2, 20); }
  }

  // ── 배너 ──
  const bn = world.banner;
  if (bn) {
    const a = clamp(Math.min(bn.t * 2, 1), 0, 1);
    ctx.globalAlpha = a;
    const y = bn.big ? vh * 0.36 : vh * 0.3;
    const gw = Math.min(vw, 760);
    const lg = ctx.createLinearGradient(vw / 2 - gw / 2, 0, vw / 2 + gw / 2, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.5, 'rgba(0,0,0,0.65)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg; ctx.fillRect(vw / 2 - gw / 2, y - (bn.big ? 50 : 36), gw, bn.big ? 90 : 66);
    text(ctx, bn.text, vw / 2, y, { size: bn.big ? 42 : 30, align: 'center', weight: 800, family: bn.big ? FONT.title : FONT.logo, color: bn.color, ow: 5 });
    if (bn.sub) text(ctx, bn.sub, vw / 2, y + (bn.big ? 30 : 24), { size: 15, align: 'center', weight: 600, color: '#e8dcc8' });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** 스킬 아이콘 (절차적 문양) */
export function drawSkillGlyph(ctx, sk, x, y, s) {
  const col = sk.color ?? '#e8c872';
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, s * 0.6);
  g.addColorStop(0, rgba(col, 0.9)); g.addColorStop(1, rgba(col, 0.1));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
  ctx.beginPath();
  const n = 3 + ((sk.id?.length ?? 3) % 4);
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * TAU; const r = s * 0.28; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.stroke();
  ctx.globalAlpha = 1;
  text(ctx, sk.name?.[0] ?? '?', 0, s * 0.16, { size: s * 0.42, align: 'center', weight: 900, color: '#fff', ow: 3 });
  ctx.restore();
}
