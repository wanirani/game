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

// 버프 칸 글자 (이름 첫 글자는 '무적의 물약'·'무기 강화'처럼 겹치므로 버프마다 고유하게)
const BUFF_GLYPH = { rage: '광', haste: '신', invincible: '무', magnet: '자', gunmode: '총', holyaura: '성', whipup: '강', double: 'Ⅱ', triple: 'Ⅲ' };

export function drawHUD(ctx, world, vw, vh) {
  const p = world.player;
  if (!p) return;
  const hero = world.hero, run = world.run, st = p.stats;
  const T = input.touchMode; // 휴대폰에서는 작은 글자를 키운다 (캔버스가 0.7배 정도로 축소되어 보임)
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
  text(ctx, CLASSES[hero.classId]?.name ?? '', bx + bw, py + 12, { size: T ? 12 : 11, align: 'right', color: COLORS.dim });
  bar(ctx, bx, py + 18, bw, 13, p.hp / st.hp, { color: '#d81c34', ghost: p.hpGhost / st.hp });
  text(ctx, `${Math.ceil(p.hp)} / ${st.hp}`, bx + bw - 4, py + 29, { size: T ? 12 : 10, align: 'right', weight: 700, color: '#fff', ow: 2 });
  bar(ctx, bx, py + 34, bw * 0.8, 8, p.mp / st.mp, { color: '#3a7aff' });
  text(ctx, `${Math.floor(p.mp)}`, bx + bw * 0.8 + 6, py + 42, { size: T ? 12 : 10, weight: 700, color: '#8ac8ff', ow: 2 });
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
    text(ctx, BUFF_GLYPH[k] ?? pu.name[0], x + 11, y + 16, { size: 12, align: 'center', weight: 800, color: '#fff' });
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
    text(ctx, T ? ['S1', 'S2'][i] : ['S', 'D'][i], x + 3, y + 36, { size: T ? 12 : 10, weight: 800, color: '#e8c872' });
  }
  // 스킬 페이지 (Q/E 또는 ⇄ 버튼으로 전환) — 슬롯 바로 아래
  text(ctx, `${T ? '⇄' : 'Q·E'} 페이지 ${p.skillPage + 1}/2`, kx, ky + (T ? 54 : 51), { size: T ? 12 : 10, weight: 700, color: COLORS.dim });
  // 필살 게이지 (가로 세그먼트)
  const ux = kx + 92, uy = ky + 20, uw = 120;
  const full = run.sp >= 100;
  text(ctx, '필살', ux, uy - 6, { size: T ? 12 : 10, weight: 700, color: COLORS.dim });
  text(ctx, `${Math.floor(run.sp)}%`, ux + uw, uy - 6, { size: T ? 12 : 10, align: 'right', weight: 700, family: FONT.num, color: full ? '#ffe070' : COLORS.dim });
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ux, uy, uw, 10);
  const g = ctx.createLinearGradient(ux, 0, ux + uw, 0);
  g.addColorStop(0, '#ff8a2a'); g.addColorStop(1, full ? `hsl(${(world.time * 300) % 360},90%,60%)` : '#ffe070');
  ctx.fillStyle = g; ctx.fillRect(ux, uy, uw * run.sp / 100, 10);
  for (let i = 1; i < 4; i++) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(ux + uw * i / 4, uy, 1.5, 10); }
  ctx.strokeStyle = full ? '#fff' : COLORS.goldDark; ctx.lineWidth = 1.5; ctx.strokeRect(ux - 0.5, uy - 0.5, uw + 1, 11);
  if (full && Math.floor(world.time * 4) % 2 === 0) text(ctx, T ? '필살기 준비!' : '필살기 준비! [F]', ux, uy + 24, { size: T ? 14 : 11, weight: 800, color: '#ffe070' });

  // ── 우상단: 점수/목숨/골드/시간 ──
  const rx = vw - 14, lx = rx - (T ? 176 : 150), s1 = T ? 13 : 11, s2 = T ? 14 : 12, ly = T ? 3 : 0;
  text(ctx, 'SCORE', lx, 26, { size: s1, weight: 700, family: FONT.num, color: COLORS.dim });
  text(ctx, fmt(run.score).padStart(9, ' '), rx, 28, { size: 20, align: 'right', weight: 800, family: FONT.num, color: '#fff' });
  const hi = Math.max(world.game.meta?.highScores?.[0]?.score ?? 0, run.score);
  text(ctx, `HI ${fmt(hi)}`, rx, 46 + ly, { size: s1, align: 'right', weight: 700, family: FONT.num, color: '#e8c872' });
  // 목숨: 하트(보조무기 탄약)와 헷갈리지 않도록 영웅 얼굴 아이콘 × 남은 목숨
  drawLifeIcon(ctx, lx + 8, 41 + ly, T ? 8.5 : 7.5, hero, p);
  text(ctx, `×${run.lives}`, lx + 19, 46 + ly, { size: s2, weight: 800, family: FONT.num, color: '#ff8a9a' });
  text(ctx, `${fmt(world.state.gold)} G`, rx, 64 + ly * 2, { size: s2, align: 'right', weight: 700, color: '#ffd84a' });
  text(ctx, fmtTime(run.time), lx, 64 + ly * 2, { size: s2, weight: 700, family: FONT.num, color: '#c8c0b0' });

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

  // ── 보스 체력 ── (등장 연출·대화 중에는 숨김. 터치 모드는 엄지 패드에 가리지 않도록 화면 위쪽)
  const b = world.boss;
  if (b && world.bossActive && !b.dead && !world.cutscene) {
    const w = T ? Math.min(560, vw - 320) : Math.min(640, vw - 260), x = (vw - w) / 2, y = T ? 164 : vh - 46;
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

/** 목숨 아이콘: 영웅 초상화를 작은 원에 */
function drawLifeIcon(ctx, x, y, r, hero, p) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#12060c'; ctx.fill();
  ctx.save(); ctx.clip();
  const img = assets.get(CHARACTERS[hero.charId]?.portrait);
  if (img) ctx.drawImage(img, x - r * 1.45, y - r * 1.05, r * 2.9, r * 2.9 * (img.height / img.width));
  else { ctx.fillStyle = p.look?.primary ?? '#844'; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  ctx.restore();
  ctx.strokeStyle = '#ff8a9a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.restore();
}

// ── 스킬 문양: 이름의 핵심어로 문장(紋章)을 고르고, 액티브는 원형·패시브는 마름모 바탕 ──
const EMBLEM_RULES = [
  ['whip', /채찍/], ['clock', /시간|신탁|호흡/], ['shield', /방벽|수호|방패|가호|철심|철벽|강철|체력|육체/],
  ['heal', /치유|자애|축복|회복/], ['star', /표창|단검|비연|찌르기/], ['cross', /십자|크로스|퇴마|성서|기도|신앙/],
  ['spiral', /무도|난사/], ['moon', /팬텀/], ['bullet', /탄$|탄환|사격|저격|불릿|샷|개틀링|속사|데드아이/],
  ['burst', /폭발|폭탄|폭파|폭쇄|다이너마이트|헬파이어|화약|메테오|함성/],
  ['flame', /화염|불|화둔|화형|원소/], ['bolt', /뇌|번개|천뢰/], ['drop', /피|블러드|혈|흡혈|뱀파이어|진조|굶주림|갈증/],
  ['wing', /박쥐|까마귀|날개|천사/], ['eye', /감각|눈|집중|급소|사냥꾼의/],
  ['swift', /발놀림|보법|경공|신속|무희|리듬|연무|우아/], ['crown', /귀족|품격|군주|긍지|검성|기사|성녀|자질|배짱|현상금|도박|운/],
  ['moon', /월광|밤|그림자|분신|환영|사신|암살|인술|낫/], ['spiral', /폭풍|회전|원무|난무|광란|함성|분노|광기|진격/],
  ['sun', /성광|빛|여명|새벽|성역|성전|성검|서약|권능|강림/], ['sword', /검|참|베기|일섬|칼날|가르기|일격|킬러|헌트|처형|숙련|훈련|팔/],
];
function emblemOf(sk) {
  if (sk.icon && EMBLEM_DRAW[sk.icon]) return sk.icon;
  for (const [id, re] of EMBLEM_RULES) if (re.test(sk.name ?? '')) return id;
  return 'star';
}
const EMBLEM_DRAW = {
  // 모두 반지름 1 기준 좌표 (호출 측에서 scale)
  cross(c) { c.fillRect(-0.16, -0.8, 0.32, 1.6); c.fillRect(-0.55, -0.42, 1.1, 0.3); },
  sun(c) { c.beginPath(); c.arc(0, 0, 0.36, 0, TAU); c.fill(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.beginPath(); c.moveTo(Math.cos(a - 0.14) * 0.48, Math.sin(a - 0.14) * 0.48); c.lineTo(Math.cos(a) * 0.86, Math.sin(a) * 0.86); c.lineTo(Math.cos(a + 0.14) * 0.48, Math.sin(a + 0.14) * 0.48); c.fill(); } },
  shield(c) { c.beginPath(); c.moveTo(-0.6, -0.62); c.lineTo(0.6, -0.62); c.lineTo(0.6, -0.05); c.quadraticCurveTo(0.55, 0.55, 0, 0.82); c.quadraticCurveTo(-0.55, 0.55, -0.6, -0.05); c.closePath(); c.rect(-0.08, -0.5, 0.16, 1.05); c.fill('evenodd'); },
  flame(c) { c.beginPath(); c.moveTo(0, -0.85); c.bezierCurveTo(0.35, -0.35, 0.65, -0.05, 0.5, 0.35); c.quadraticCurveTo(0.35, 0.8, 0, 0.8); c.quadraticCurveTo(-0.35, 0.8, -0.5, 0.35); c.bezierCurveTo(-0.6, 0, -0.25, -0.2, -0.15, -0.5); c.quadraticCurveTo(0.05, -0.3, 0, -0.85); c.fill(); },
  burst(c) { c.beginPath(); for (let i = 0; i < 16; i++) { const a = i * TAU / 16, r = i % 2 ? 0.38 : 0.86; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); },
  bolt(c) { c.beginPath(); c.moveTo(0.18, -0.88); c.lineTo(-0.42, 0.08); c.lineTo(-0.02, 0.08); c.lineTo(-0.2, 0.88); c.lineTo(0.45, -0.18); c.lineTo(0.05, -0.18); c.closePath(); c.fill(); },
  drop(c) { c.beginPath(); c.moveTo(0, -0.85); c.bezierCurveTo(0.2, -0.45, 0.62, -0.05, 0.62, 0.3); c.arc(0, 0.3, 0.62, 0, Math.PI); c.bezierCurveTo(-0.62, -0.05, -0.2, -0.45, 0, -0.85); c.fill(); },
  wing(c) { for (const sx of [-1, 1]) { c.save(); c.scale(sx, 1); c.beginPath(); c.moveTo(0.08, -0.1); c.quadraticCurveTo(0.5, -0.7, 0.92, -0.35); c.quadraticCurveTo(0.8, -0.05, 0.9, 0.25); c.quadraticCurveTo(0.68, 0.08, 0.55, 0.3); c.quadraticCurveTo(0.4, 0.12, 0.3, 0.32); c.quadraticCurveTo(0.2, 0.1, 0.08, 0.2); c.closePath(); c.fill(); c.restore(); } c.beginPath(); c.arc(0, 0.02, 0.14, 0, TAU); c.fill(); },
  heal(c) { c.fillRect(-0.18, -0.66, 0.36, 1.32); c.fillRect(-0.66, -0.18, 1.32, 0.36); },
  eye(c) { c.beginPath(); c.moveTo(-0.85, 0); c.quadraticCurveTo(0, -0.75, 0.85, 0); c.quadraticCurveTo(0, 0.75, -0.85, 0); c.closePath(); c.moveTo(0.3, 0); c.arc(0, 0, 0.3, 0, TAU); c.fill('evenodd'); c.beginPath(); c.arc(0, 0, 0.15, 0, TAU); c.fill(); },
  star(c) { c.beginPath(); for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * TAU / 8, r = i % 2 ? 0.26 : 0.86; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); },
  swift(c) { for (const ox of [-0.42, 0.12]) { c.beginPath(); c.moveTo(ox - 0.2, -0.62); c.lineTo(ox + 0.32, 0); c.lineTo(ox - 0.2, 0.62); c.lineTo(ox, 0); c.closePath(); c.fill(); } },
  crown(c) { c.beginPath(); c.moveTo(-0.72, 0.5); c.lineTo(-0.78, -0.45); c.lineTo(-0.38, -0.05); c.lineTo(0, -0.7); c.lineTo(0.38, -0.05); c.lineTo(0.78, -0.45); c.lineTo(0.72, 0.5); c.closePath(); c.fill(); },
  moon(c) { c.save(); c.beginPath(); c.arc(0, 0, 0.75, 0, TAU); c.clip(); c.beginPath(); c.rect(-1, -1, 2, 2); c.moveTo(0.96, -0.18); c.arc(0.34, -0.18, 0.62, 0, TAU); c.fill('evenodd'); c.restore(); },
  spiral(c) { c.lineWidth = 0.17; c.lineCap = 'round'; c.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU * 2.1, r = 0.08 + i / 40 * 0.72; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.stroke(); },
  sword(c) { c.rotate(-Math.PI / 4); c.beginPath(); c.moveTo(0, -0.92); c.lineTo(0.13, -0.72); c.lineTo(0.13, 0.36); c.lineTo(-0.13, 0.36); c.lineTo(-0.13, -0.72); c.closePath(); c.fill(); c.fillRect(-0.42, 0.36, 0.84, 0.13); c.fillRect(-0.08, 0.49, 0.16, 0.34); },
  bullet(c) { c.lineWidth = 0.13; c.beginPath(); c.arc(0, 0, 0.55, 0, TAU); c.stroke(); c.fillRect(-0.06, -0.9, 0.12, 0.5); c.fillRect(-0.06, 0.4, 0.12, 0.5); c.fillRect(-0.9, -0.06, 0.5, 0.12); c.fillRect(0.4, -0.06, 0.5, 0.12); c.beginPath(); c.arc(0, 0, 0.14, 0, TAU); c.fill(); },
  whip(c) { c.lineWidth = 0.16; c.lineCap = 'round'; c.beginPath(); c.moveTo(-0.62, 0.72); c.lineTo(-0.35, 0.42); c.stroke(); c.lineWidth = 0.1; c.beginPath(); c.moveTo(-0.35, 0.42); c.bezierCurveTo(0.6, 0.3, -0.4, -0.3, 0.3, -0.5); c.quadraticCurveTo(0.65, -0.6, 0.75, -0.85); c.stroke(); },
  clock(c) { c.lineWidth = 0.13; c.beginPath(); c.arc(0, 0, 0.7, 0, TAU); c.stroke(); c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -0.48); c.moveTo(0, 0); c.lineTo(0.34, 0.14); c.stroke(); },
};

/** 스킬 아이콘 (절차적 문장) */
export function drawSkillGlyph(ctx, sk, x, y, s) {
  const col = sk.color ?? '#e8c872';
  const passive = sk.type === 'passive';
  ctx.save();
  ctx.translate(x, y);
  const R = s * 0.45;
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, s * 0.6);
  g.addColorStop(0, rgba(col, 0.85)); g.addColorStop(1, rgba(col, 0.12));
  ctx.fillStyle = g; ctx.beginPath();
  if (passive) { ctx.moveTo(0, -R); ctx.lineTo(R, 0); ctx.lineTo(0, R); ctx.lineTo(-R, 0); ctx.closePath(); } else ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.lineWidth = 1.2; ctx.stroke();
  // 문장 (그림자 → 본체)
  const k = s * (passive ? 0.25 : 0.3);
  const draw = EMBLEM_DRAW[emblemOf(sk)];
  for (const [ox, oy, c] of [[s * 0.03, s * 0.04, 'rgba(0,0,0,0.55)'], [0, 0, '#fffaf0']]) {
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(k, k);
    ctx.fillStyle = c; ctx.strokeStyle = c;
    draw(ctx);
    ctx.restore();
  }
  ctx.restore();
}
