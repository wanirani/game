// 인게임 HUD: 초상화/HP/MP/EXP, 하트+보조무기, 스킬 슬롯, 필살 게이지, 점수/목숨/골드/시간, 보스 체력바, 버프, 배너 — owner: HUD-FINAL (W3)
// 모든 위치는 hud_layout.js 의 hudLayout() (MASTER_PLAN §1.8) 에서 받는다 — 여기서 좌표를 새로 정하지 말 것.
// 그리는 순서 (FEEL-HUD 계약, 요청 191): 초상화·체력·하트·스킬 → 1 필살(SP) 게이지 → 2 feel_hud.drawAwGauge (각성 게이지 + 준비 문구 칸
//  L.ready 전부; SP 막대 위에 빛을 겹치므로 반드시 SP 게이지 다음) → 3 companion_hud.drawCompanionHUD (동료 위젯 칸 + 스킬 카드 줄)
//  → 4 점수 → 5 feel_hud.drawComboHUD (콤보·스타일 열) → 6 보스 체력바 → 7 알림 칸: world.banner 가 있으면 배너, 없으면 feel_hud.drawAnnouncer.
//  기믹 게이지(gimmicks.drawScreen → hudLayout().meter(i))와 토스트(game.js → hudLayout().toast(i))는 각자 그린다.
// prompts.drawGlyph (PLAT-INPUT) — 스킬 슬롯·페이지 안내의 버튼 글리프 (기기별 키캡/패드/터치 아이콘; platform §4.5)
// 각성 컷인·연출 중(world.hudHidden)에는 HUD 전체를 그리지 않는다 (동료 위젯의 탭 판정 사각형도 비운다).
import { text, bar, bloodText, prewarmText, font, FONT, COLORS } from '../core/ui.js';
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
import { hudLayout, hudTouch } from './hud_layout.js';
import { drawComboHUD, drawAnnouncer, drawAwGauge } from './feel_hud.js'; // [hook:feel]
import { drawCompanionHUD } from './companion_hud.js'; // [hook:cmp]
import { drawGlyph, bindingOf, promptMode } from '../core/prompts.js'; // [hook:plat]
import { input } from '../core/input.js';

// 버프 칸 글자 (이름 첫 글자는 '무적의 물약'·'무기 강화'처럼 겹치므로 버프마다 고유하게)
const BUFF_GLYPH = { rage: '광', haste: '신', invincible: '무', magnet: '자', gunmode: '총', holyaura: '성', whipup: '강', double: 'Ⅱ', triple: 'Ⅲ' };
const NO_RECTS = [];

export function drawHUD(ctx, world, vw, vh) {
  if (world.hudHidden) { // [hook:awaken] 각성 컷인·연출 중: 동료 위젯·기믹 게이지까지 통째로 숨긴다
    if (world.companions) { NO_RECTS.length = 0; try { world.companions.hudRects = NO_RECTS; } catch { /* 읽기 전용이면 동료 쪽이 직접 관리 */ } } // [hook:cmp] 보이지 않는 위젯 자리를 누른 탭이 탈것·수호신을 부르지 않게
    return;
  }
  const p = world.player;
  if (!p) return;
  const hero = world.hero, run = world.run, st = p.stats;
  const T = hudTouch(); // 휴대폰에서는 작은 글자를 키운다 (캔버스가 0.7배 정도로 축소되어 보임)
  const L = hudLayout(world, vw, vh);
  ctx.save();
  drawPortrait(ctx, L.portrait, hero, p);
  drawVitals(ctx, L.vitals, hero, p, st, T);
  drawHeartsRow(ctx, L.hearts, world, run, p);
  drawSkills(ctx, L.skills, hero, p, T);
  drawUltGauge(ctx, L.ult, world, run, T);
  // 각성 게이지 + 준비 문구 칸 L.ready ('필살기 준비!' · '각성 가능!' 모두 FEEL-HUD). SP 막대 위에 빛을 겹치므로 필살 게이지 다음에
  drawAwGauge(ctx, world, L.awGauge.x, L.awGauge.y, L.awGauge.w, T); // [hook:feel]
  // 동료 위젯 (companions §7.1): 탭 판정용 사각형은 world.companions.hudRects 에 둔다
  const cr = drawCompanionHUD(ctx, world, { x: L.companions.x, y: L.companions.y, touch: T, rect: L.companions, lane: L.callouts, layout: L }); // [hook:cmp]
  if (world.companions) { if (!cr) NO_RECTS.length = 0; try { world.companions.hudRects = cr || NO_RECTS; } catch { /* 읽기 전용이면 동료 쪽이 직접 관리 */ } } // [hook:cmp]
  drawScore(ctx, L.score, world, hero, p, run, T);
  drawComboHUD(ctx, world, vw, vh, T); // [hook:feel] 콤보·스타일 열 (L.combo)
  if (L.bossShown) drawBossBar(ctx, L.bossBar, world.boss);
  // 알림 칸 하나: 배너(스테이지 제목·STAGE CLEAR·LEVEL UP …)가 이긴다. 배너가 없을 때만 알림을 그린다
  if (world.banner) drawBanner(ctx, L.transient, world, world.banner);
  else drawAnnouncer(ctx, world, vw, vh); // [hook:feel]
  ctx.restore();
}

/**
 * 시험·도구용 (tools/test_hud_layout.mjs): drawHUD 의 한 부분만 같은 인자로 그린다 → 부분마다 실제로 칠한 픽셀이 제 칸 안에 있는지 잰다.
 * part: HUD_PARTS 중 하나. 'companions' 는 위젯과 스킬 카드 줄을 함께 그린다 (시험이 카드·위젯 중 하나만 켜서 잰다).
 */
export const HUD_PARTS = ['portrait', 'vitals', 'hearts', 'skills', 'ult', 'awGauge', 'companions', 'score', 'combo', 'boss', 'transient'];
export function drawHUDPart(ctx, world, vw, vh, part) {
  const p = world?.player;
  if (!p || world.hudHidden) return null;
  const hero = world.hero, run = world.run, st = p.stats, T = hudTouch();
  const L = hudLayout(world, vw, vh);
  ctx.save();
  let r = null;
  switch (part) {
    case 'portrait': drawPortrait(ctx, L.portrait, hero, p); break;
    case 'vitals': drawVitals(ctx, L.vitals, hero, p, st, T); break;
    case 'hearts': drawHeartsRow(ctx, L.hearts, world, run, p); break;
    case 'skills': drawSkills(ctx, L.skills, hero, p, T); break;
    case 'ult': drawUltGauge(ctx, L.ult, world, run, T); break;
    case 'awGauge': r = drawAwGauge(ctx, world, L.awGauge.x, L.awGauge.y, L.awGauge.w, T); break;
    case 'companions': r = drawCompanionHUD(ctx, world, { x: L.companions.x, y: L.companions.y, touch: T, rect: L.companions, lane: L.callouts, layout: L }); break;
    case 'score': drawScore(ctx, L.score, world, hero, p, run, T); break;
    case 'combo': r = drawComboHUD(ctx, world, vw, vh, T); break;
    case 'boss': if (L.bossShown) drawBossBar(ctx, L.bossBar, world.boss); break;
    case 'transient': r = world.banner ? (drawBanner(ctx, L.transient, world, world.banner), 'banner') : drawAnnouncer(ctx, world, vw, vh); break;
    default: break;
  }
  ctx.restore();
  return r;
}

// ── 왼쪽 위: 초상화 + 레벨 배지 (66×66) ──
function drawPortrait(ctx, r, hero, p) {
  const cx = r.x + 33, cy = r.y + 33;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, 30, 0, TAU); ctx.closePath();
  ctx.fillStyle = '#12060c'; ctx.fill();
  ctx.clip();
  const img = assets.get(CHARACTERS[hero.charId].portrait);
  if (img) ctx.drawImage(img, cx - 44, r.y + 3, 88, 88 * (img.height / img.width));
  else { ctx.fillStyle = p.look.primary ?? '#444'; ctx.fillRect(r.x + 1, r.y + 1, 64, 64); }
  ctx.restore();
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 31, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, 32.5, 0, TAU); ctx.stroke();
  // 레벨 배지 (영역 안쪽 오른쪽 아래)
  ctx.fillStyle = '#5a0a18'; ctx.beginPath(); ctx.arc(r.x + 53, r.y + 53, 12, 0, TAU); ctx.fill();
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 1.5; ctx.stroke();
  text(ctx, hero.level, r.x + 53, r.y + 58, { size: 12, align: 'center', weight: 800, family: FONT.num, color: '#fff' });
}

// ── 이름 / HP / MP / EXP (230×50) ──
function drawVitals(ctx, r, hero, p, st, T) {
  const bx = r.x, bw = r.w, y = r.y;
  text(ctx, CHARACTERS[hero.charId].name, bx, y + 12, { size: 13, weight: 700, color: '#f3e2b8' });
  text(ctx, CLASSES[hero.classId]?.name ?? '', bx + bw, y + 12, { size: T ? 12 : 11, align: 'right', color: COLORS.dim });
  bar(ctx, bx, y + 18, bw, 13, p.hp / st.hp, { color: '#d81c34', ghost: p.hpGhost / st.hp });
  text(ctx, `${Math.ceil(p.hp)} / ${st.hp}`, bx + bw - 4, y + 29, { size: T ? 12 : 10, align: 'right', weight: 700, color: '#fff', ow: 2 });
  bar(ctx, bx, y + 34, bw * 0.8, 8, p.mp / st.mp, { color: '#3a7aff' });
  text(ctx, `${Math.floor(p.mp)}`, bx + bw * 0.8 + 6, y + 42, { size: T ? 12 : 10, weight: 700, color: '#8ac8ff', ow: 2 });
  bar(ctx, bx, y + 46, bw * 0.8, 3, hero.exp / expToNext(hero.level), { color: '#e8c872', shine: false });
}

// ── 하트 + 보조무기 + 버프 (260×26; 버프 아이콘은 칸 오른쪽 끝에서 자른다) ──
function drawHeartsRow(ctx, r, world, run, p) {
  const sx = r.x, sy = r.y + 2;
  drawHudHeart(ctx, sx + 8, sy + 10, world.time);
  text(ctx, `× ${run.hearts}`, sx + 20, sy + 15, { size: 14, weight: 800, family: FONT.num, color: '#ffb0b8' });
  // 보조무기 프레임 (클래식)
  const fx = sx + 70, fy = r.y;
  ctx.fillStyle = 'rgba(10,4,12,0.8)'; ctx.fillRect(fx, fy, 44, 26);
  ctx.strokeStyle = COLORS.goldDark; ctx.lineWidth = 1.5; ctx.strokeRect(fx + 0.5, fy + 0.5, 43, 25);
  const sw = SUBWEAPONS[run.sub];
  if (sw) drawIcon(ctx, sw.icon, fx + 22, fy + 13, 24);
  const multi = p.buffs.triple ? 'III' : p.buffs.double ? 'II' : '';
  if (multi) text(ctx, multi, fx + 48, fy + 18, { size: 12, weight: 900, family: FONT.num, color: '#8ac8ff' });
  // 버프 아이콘
  let bi = 0;
  const xMax = r.x + r.w;
  for (const k in p.buffs) {
    const pu = POWERUPS[k];
    if (!pu) continue;
    const x = sx + 130 + bi * 26, y = sy + 1;
    if (x + 22 > xMax) break;
    ctx.fillStyle = rgba(pu.color, 0.25); ctx.fillRect(x, y, 22, 22);
    ctx.strokeStyle = pu.color; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, 21, 21);
    text(ctx, BUFF_GLYPH[k] ?? pu.name[0], x + 11, y + 16, { size: 12, align: 'center', weight: 800, color: '#fff' });
    const left = p.buffs[k];
    if (left < 9000) { const f = clamp(left / (pu.time || 1), 0, 1); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y + 22 * f, 22, 22 * (1 - f)); }
    bi++;
  }
}

/** HUD 하트: 그림자 흐림(shadowBlur)이 비싸므로 한 번 구운 그림을 맥박에 맞춰 늘였다 줄인다 */
let heartSpr = null;
function drawHudHeart(ctx, x, y, t) {
  if (heartSpr === null) {
    heartSpr = false;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 64; // 2배 해상도, 논리 32×32
      const g = c.getContext('2d');
      g.translate(32, 32); g.scale(2, 2);
      drawHeart(g, 7, 0);
      heartSpr = c;
    } catch { heartSpr = false; }
  }
  if (heartSpr) {
    const s = 16 * (1 + Math.sin(t * 8) * 0.06);
    ctx.drawImage(heartSpr, x - s, y - s, s * 2, s * 2);
  } else { ctx.save(); ctx.translate(x, y); drawHeart(ctx, 7, t); ctx.restore(); }
}

/**
 * 이 기기에서 글리프를 쓸 수 있나: 터치 모드는 prompts 가 터치 아이콘을 줄 때만 (없으면 기존 한글·기호 표시).
 * bindingOf 는 부를 때마다 배열을 만들므로 (안내 기기, 바인딩 객체)가 같은 동안 답을 기억한다 (매 프레임 3번 부른다)
 */
const GLYPH_OK = new Map();
let glyphB = null, glyphM = '';
function useGlyph(action, T) {
  if (!T) return true;
  let b = null, m = '';
  try { b = input.bindings; m = promptMode(); } catch { /* 기본값 */ }
  if (b !== glyphB || m !== glyphM) { GLYPH_OK.clear(); glyphB = b; glyphM = m; }
  let ok = GLYPH_OK.get(action);
  if (ok === undefined) {
    try { ok = !!bindingOf(action)?.some?.((x) => x?.type === 'touch'); } catch { ok = false; }
    GLYPH_OK.set(action, ok);
  }
  return ok;
}

// ── 스킬 슬롯 2칸 + 페이지 안내 (88×62) ──
function drawSkills(ctx, r, hero, p, T) {
  const kx = r.x, ky = r.y;
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
        const f = clamp(cd / (sk.cd || 1), 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.beginPath(); ctx.moveTo(x + 19, y + 19); ctx.arc(x + 19, y + 19, 26, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.fill();
        text(ctx, cd.toFixed(1), x + 19, y + 24, { size: 11, align: 'center', weight: 800, color: '#fff' });
      } else if (p.mp < (sk.cost ?? 0)) { ctx.fillStyle = 'rgba(20,40,120,0.5)'; ctx.fillRect(x, y, 38, 38); }
    }
    const act = i ? 'skill2' : 'skill1';
    if (useGlyph(act, T)) drawGlyph(ctx, act, x + 1, y + 24, 13); // [hook:plat]
    else text(ctx, i ? 'S2' : 'S1', x + 3, y + 36, { size: 12, weight: 800, color: '#e8c872' });
  }
  // 스킬 페이지: [swap] 페이지 n/2 — 슬롯 바로 아래
  const hy = ky + (T ? 54 : 51), size = T ? 12 : 10;
  const label = `페이지 ${p.skillPage + 1}/2`;
  if (useGlyph('swap', T)) {
    const gw = drawGlyph(ctx, 'swap', kx, hy - 12, 14); // [hook:plat]
    text(ctx, label, kx + (gw || 14) + 4, hy, { size, weight: 700, color: COLORS.dim });
  } else text(ctx, `⇄ ${label}`, kx, hy, { size, weight: 700, color: COLORS.dim });
}

// ── 필살(SP) 게이지 (120×28) ──
// 그라데이션: 평소 1개 + 가득 찼을 때 색이 도는 36단계(10°)를 위치별로 한 번씩만 만든다 (매 프레임 새 그라데이션 없음)
let spGrad = null, spFull = null, spX = NaN, spW = NaN;
function spGradient(ctx, ux, uw, step) {
  if (ux !== spX || uw !== spW) { spX = ux; spW = uw; spGrad = null; spFull = null; }
  if (step < 0) {
    if (!spGrad) { spGrad = ctx.createLinearGradient(ux, 0, ux + uw, 0); spGrad.addColorStop(0, '#ff8a2a'); spGrad.addColorStop(1, '#ffe070'); }
    return spGrad;
  }
  spFull ??= new Array(36).fill(null);
  let g = spFull[step];
  if (!g) { g = spFull[step] = ctx.createLinearGradient(ux, 0, ux + uw, 0); g.addColorStop(0, '#ff8a2a'); g.addColorStop(1, `hsl(${step * 10},90%,60%)`); }
  return g;
}
function drawUltGauge(ctx, r, world, run, T) {
  const ux = r.x, uy = r.y + 16, uw = r.w;
  const full = run.sp >= 100;
  text(ctx, '필살', ux, uy - 6, { size: T ? 12 : 10, weight: 700, color: COLORS.dim });
  text(ctx, `${Math.floor(run.sp)}%`, ux + uw, uy - 6, { size: T ? 12 : 10, align: 'right', weight: 700, family: FONT.num, color: full ? '#ffe070' : COLORS.dim });
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ux, uy, uw, 10);
  const g = spGradient(ctx, ux, uw, full ? Math.floor(Math.abs(world.time * 30)) % 36 || 0 : -1); // 가득 차면 색이 돈다 (300°/s)
  ctx.fillStyle = g; ctx.fillRect(ux, uy, uw * clamp(run.sp / 100, 0, 1), 10);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  for (let i = 1; i < 4; i++) ctx.fillRect(ux + uw * i / 4, uy, 1.5, 10);
  ctx.strokeStyle = full ? '#fff' : COLORS.goldDark; ctx.lineWidth = 1.5; ctx.strokeRect(ux - 0.5, uy - 0.5, uw + 1, 11);
}

// ── 오른쪽 위: 점수/목숨/골드/시간 (150×62, 터치 150×70) ──
function drawScore(ctx, r, world, hero, p, run, T) {
  const rx = r.x + r.w, lx = r.x, y0 = r.y - 10, s1 = T ? 13 : 11, s2 = T ? 14 : 12, ly = T ? 3 : 0;
  text(ctx, 'SCORE', lx, y0 + 26, { size: s1, weight: 700, family: FONT.num, color: COLORS.dim });
  const labelW = ctx.measureText('SCORE').width;
  text(ctx, fmt(run.score), rx, y0 + 28, { size: 20, align: 'right', weight: 800, family: FONT.num, color: '#fff', maxWidth: r.w - labelW - 6 });
  const hi = Math.max(world.game.meta?.highScores?.[0]?.score ?? 0, run.score);
  // 목숨: 하트(보조무기 탄약)와 헷갈리지 않도록 영웅 얼굴 아이콘 × 남은 목숨
  drawLifeIcon(ctx, lx + 8, y0 + 41 + ly, T ? 8.5 : 7.5, hero, p);
  const lives = `×${run.lives}`;
  text(ctx, lives, lx + 19, y0 + 46 + ly, { size: s2, weight: 800, family: FONT.num, color: '#ff8a9a' });
  const livesW = ctx.measureText(lives).width;
  text(ctx, `HI ${fmt(hi)}`, rx, y0 + 46 + ly, { size: s1, align: 'right', weight: 700, family: FONT.num, color: '#e8c872', maxWidth: r.w - 19 - livesW - 8 });
  const time = fmtTime(run.time);
  text(ctx, time, lx, y0 + 64 + ly * 2, { size: s2, weight: 700, family: FONT.num, color: '#c8c0b0' });
  const tw = ctx.measureText(time).width;
  text(ctx, `${fmt(world.state.gold)} G`, rx, y0 + 64 + ly * 2, { size: s2, align: 'right', weight: 700, color: '#ffd84a', maxWidth: r.w - tw - 8 });
}

// ── 보스 체력바 (아래 칸 48 px / 위쪽 칸 36 px): 이름 왼쪽, 칭호 오른쪽 (칸이 360 px 보다 좁으면 칭호 숨김) ──
function drawBossBar(ctx, r, b) {
  if (!b || r.w < 60) return;
  const x = r.x, w = r.w, title = w >= 360 ? b.def.title : null;
  const ny = r.y + 15, by = r.y + r.h - 16;
  text(ctx, b.def.name, x, ny, { size: 16, weight: 800, family: FONT.title, color: '#ffd0d0', maxWidth: title ? w * 0.6 : w });
  if (title) text(ctx, title, x + w, ny, { size: 11, align: 'right', color: COLORS.dim, maxWidth: w * 0.38 });
  bar(ctx, x, by, w, 14, b.hp / b.stats.maxHp, { color: '#b0102a', ghost: b.hpGhost / b.stats.maxHp, edge: '#e8c872' });
  ctx.fillStyle = '#e8c872';
  for (const ph of b.def.phases || []) ctx.fillRect(x + w * ph - 1, by - 2, 2, 18);
}

// ── 배너 (알림 칸 안): 스테이지 제목은 피 글씨, STAGE CLEAR 는 금박 글씨, 나머지는 기존 글씨. 칸보다 길면 40 % 까지 줄인다 ──
let bandG = null, bandKey = '';
function bandGradient(ctx, r) {
  const key = `${r.x}|${r.w}`;
  if (!bandG || bandKey !== key) {
    bandG = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    bandG.addColorStop(0, 'rgba(0,0,0,0)'); bandG.addColorStop(0.2, 'rgba(0,0,0,0.62)');
    bandG.addColorStop(0.8, 'rgba(0,0,0,0.62)'); bandG.addColorStop(1, 'rgba(0,0,0,0)');
    bandKey = key;
  }
  return bandG;
}
/** 칸 너비(maxW)에 맞춰 글자 크기를 줄여 그린다 (원래 크기의 40 % 까지) */
function fitText(ctx, str, x, y, maxW, o) {
  ctx.font = font(o.size, o.weight, o.family);
  const w = ctx.measureText(str).width;
  const size = w > maxW ? Math.max(o.size * 0.4, Math.floor(o.size * maxW / w)) : o.size;
  text(ctx, str, x, y, size === o.size ? o : { ...o, size, maxWidth: maxW });
}
const STAGE_CARD = { size: 40, style: 'blood', drips: 0.6, t: 0 };
const CLEAR_CARD = { size: 40, style: 'gold' };
function drawBanner(ctx, r, world, bn) {
  if (r.w < 40) return;
  if (bn._t0 == null) bn._t0 = bn.t; // 배너 객체는 남은 시간만 가지므로 처음 본 값을 적어 둔다 (등장 연출용)
  const age = bn._t0 - bn.t;
  const a = clamp(Math.min(bn.t * 2, age * 5 + 0.2, 1), 0, 1);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = bandGradient(ctx, r); ctx.fillRect(r.x, r.y, r.w, r.h);
  const cx = r.x + r.w / 2, maxW = r.w - 16;
  const stageCard = bn.kind === 'stage' || (bn.big && bn.text === world.stage?.name);
  const clear = !stageCard && bn.text === 'STAGE CLEAR';
  let subY = r.y + 57;
  if (stageCard || clear) {
    // 피 글씨 (스테이지 제목 카드: 부제를 위에, 제목 아래로 핏방울이 흘러내린다)
    const opts = stageCard ? STAGE_CARD : CLEAR_CARD;
    if (stageCard) STAGE_CARD.t = age;
    const tw = prewarmText(ctx, bn.text, opts);
    const k = clamp(maxW / (tw || 1), 0.4, 1);
    const ty = stageCard ? r.y + 56 : r.y + 40;
    if (stageCard) subY = r.y + 15;
    ctx.save(); ctx.translate(cx, ty); ctx.scale(k, k);
    bloodText(ctx, bn.text, 0, 0, opts);
    ctx.restore();
  } else {
    fitText(ctx, bn.text, cx, r.y + (bn.big ? 36 : 34), maxW, { size: bn.big ? 38 : 30, align: 'center', weight: 800, family: bn.big ? FONT.title : FONT.logo, color: bn.color, ow: 5 });
  }
  if (bn.sub) fitText(ctx, bn.sub, cx, subY, maxW, { size: stageCard ? 13 : 14, align: 'center', weight: 600, color: '#e8dcc8' });
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

/** 문장 바탕 그라데이션: 원점 기준이라 (색, 크기)별로 한 번 만들어 계속 쓴다 (HUD 는 매 프레임 그린다) */
const GLYPH_GRAD = new WeakMap();
function glyphGradient(ctx, col, s) {
  let m = GLYPH_GRAD.get(ctx);
  if (!m) GLYPH_GRAD.set(ctx, (m = new Map()));
  const key = `${col}|${s}`;
  let g = m.get(key);
  if (!g) {
    g = ctx.createRadialGradient(0, 0, 2, 0, 0, s * 0.6);
    g.addColorStop(0, rgba(col, 0.85)); g.addColorStop(1, rgba(col, 0.12));
    if (m.size >= 96) m.clear();
    m.set(key, g);
  }
  return g;
}

/** 스킬 아이콘 (절차적 문장) */
export function drawSkillGlyph(ctx, sk, x, y, s) {
  const col = sk.color ?? '#e8c872';
  const passive = sk.type === 'passive';
  ctx.save();
  ctx.translate(x, y);
  const R = s * 0.45;
  ctx.fillStyle = glyphGradient(ctx, col, s); ctx.beginPath();
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
