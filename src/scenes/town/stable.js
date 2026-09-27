// 영혼의 마구간 'stable' — owner: CMP-TOWN (companions §2.2, §7.3, §13; MASTER_PLAN §1.13)
// 허브의 7번째 문('scene:stable')이 push 한다. 마을 서비스 장면 틀(common.js ServiceScene: uiScale · 탭 영역 · 초상화 대사창)을 쓴다.
//
//  탭: 공물(보유 동료에게 금화 → 경험치, 스테이지 클리어 주기마다 한 번 유대 +8) · 구입(STABLE_SHOP: 바르그 · 소악마 계약서)
//      · 부화(보스의 알: 준비되면 2초 부화 연출 → 합류) · 의뢰(그레타의 의뢰 cq_hati · cq_skoll 받기/보상)
//  아래 버튼 '동료 관리' (보조 A · 패드 Y) → 메뉴 › 동료 탭.
//  합류 연출: 구입·부화·의뢰 보상으로 합류한 동료는 여기서 바로 'companionJoin' (markSeen 후 push).
//  들어올 때(첫 update) · 돌아올 때 companionHubEnter(game, this) 를 불러 마구간 개장 대사(cmp_stable_open, 허브 훅이
//  아직 없었을 때)와 남은 합류 연출을 이어서 보여 준다 (CMP-SYS 의 단일 흐름; 같은 것을 두 번 보여 주지 않는다).
//  1장 전(progress.chapter < 1): '닫힘' 모드 — 불 꺼진 빈 마구간 위로 내레이션 한 줄('불에 그을린 빈 마구간이다…') 뒤 닫힌다.
//  ?scene=stable 로 바로 열면 임시 세이브(ensureState)로 열리고, 닫으면 타이틀로 간다 (P-26).
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { text, wrap, bar, font, FONT, COLORS } from '../../core/ui.js';
import { clamp, TAU, fmt, rgba, shade, RNG, hashStr } from '../../core/math.js';
import * as Q from '../../game/quests.js';
import { QUESTS } from '../../data/quests.js';
import { SCRIPTS } from '../../data/story.js';
import { josa } from '../../data/items.js';
import * as CS from '../../game/companion_state.js';
import * as CRT from '../../game/companions.js';
import * as ACMP from '../../core/audio_companions.js';
import {
  STABLE_SHOP, STABLE_LINES, TRIBUTE, BOND_NAMES, COMPANION_QUESTS, CMP_TEXT, companionDef, cmpText,
} from '../../data/companions.js';
import { ServiceScene, Modal, RewardPopup, rowBg, uiPanel, uiButton, makeInst, pickLine } from './common.js';
import { glow, drawStallHead, drawSpiritWisp } from './facades.js';

const GRETA = 'npc_greta';
const KIND_LABEL = { mount: '탈것', guardian: '수호신' };
const TABS = [{ id: 'tribute', label: '공물' }, { id: 'shop', label: '구입' }, { id: 'eggs', label: '부화' }, { id: 'quests', label: '의뢰' }];
const EGG_LOOK = {
  gd_whelp: { a: '#ece4d4', b: '#8a8070', spot: '#6a5a7a', glow: '#b060ff', burst: ['dust', '#e8e0d0'], burst2: ['magic', '#b060ff'] },
  mt_wyvern: { a: '#c8303e', b: '#4a0810', spot: '#ffd070', glow: '#ff8a3a', burst: ['ember', '#ff8a3a'], burst2: ['fire', '#ffd070'] },
};
const scriptLine = (id) => { const l = SCRIPTS[id]?.find?.((x) => x && typeof x.text === 'string'); return l?.text ?? null; };

// ───────────────────────── 그림 도우미 ─────────────────────────
/** 동료 원형 아이콘: 초상화를 iconFocus 로 정사각 크롭 (없으면 색 원판 + 이름 첫 글자). locked = 검은 실루엣 + '?' */
function cmpIcon(ctx, id, x, y, r, { locked = false } = {}) {
  const d = companionDef(id);
  const img = d?.portrait ? assets.get(d.portrait) : null;
  const col = d?.color ?? '#c8a060';
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.closePath();
  ctx.fillStyle = '#12080e'; ctx.fill();
  ctx.clip();
  if (img && img.width) {
    const f = d.iconFocus ?? { x: 0.5, y: 0.35, s: 0.6 };
    const s = f.s * img.width;
    ctx.drawImage(img, f.x * img.width - s / 2, f.y * img.height - s / 2, s, s, x - r, y - r, r * 2, r * 2);
  } else {
    const g = ctx.createRadialGradient(x, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, shade(col, 0.15)); g.addColorStop(1, shade(col, -0.65));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    text(ctx, d?.name?.[0] ?? '?', x, y + r * 0.36, { size: Math.round(r * 1.05), weight: 900, family: FONT.title, color: '#fff4d8', align: 'center', ow: 2 });
  }
  if (locked) {
    ctx.fillStyle = 'rgba(4,2,6,0.86)'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    text(ctx, '?', x, y + r * 0.36, { size: Math.round(r * 1.05), weight: 900, color: '#7a6a58', align: 'center', ow: 0 });
  }
  ctx.restore();
  ctx.strokeStyle = locked ? 'rgba(110,85,48,0.7)' : col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
}
/** 세로 초상화 카드 (3:4 그림을 채워 넣고 테두리). dim 0..1 = 어둡게 */
function portraitCard(ctx, id, x, y, w, h, { dim = 0, t = 0 } = {}) {
  const d = companionDef(id);
  const img = d?.portrait ? assets.get(d.portrait) : null;
  const col = d?.color ?? '#c8a060';
  ctx.save();
  ctx.fillStyle = '#0a0608'; ctx.fillRect(x, y, w, h);
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (img && img.width) {
    const k = Math.max(w / img.width, h / img.height) * (1.02 + Math.sin(t * 0.4) * 0.01);
    const iw = img.width * k, ih = img.height * k;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) * 0.3, iw, ih);
  } else {
    const g = ctx.createRadialGradient(x + w / 2, y + h * 0.4, 4, x + w / 2, y + h * 0.5, h * 0.7);
    g.addColorStop(0, shade(col, -0.1)); g.addColorStop(1, '#08040a');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    text(ctx, d?.name?.[0] ?? '?', x + w / 2, y + h * 0.58, { size: Math.round(w * 0.5), weight: 900, family: FONT.title, color: rgba(col, 0.8), align: 'center', ow: 3 });
  }
  if (dim > 0) { ctx.fillStyle = `rgba(4,2,6,${clamp(dim, 0, 1)})`; ctx.fillRect(x, y, w, h); }
  const fade = ctx.createLinearGradient(0, y + h * 0.65, 0, y + h);
  fade.addColorStop(0, 'rgba(4,2,6,0)'); fade.addColorStop(1, 'rgba(4,2,6,0.7)');
  ctx.fillStyle = fade; ctx.fillRect(x, y + h * 0.65, w, h * 0.35);
  ctx.restore();
  ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = 'rgba(232,200,114,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
}
function heart(ctx, x, y, s, on) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.4);
  ctx.bezierCurveTo(x - s * 0.95, y - s * 0.2, x - s * 0.5, y - s * 0.95, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.5, y - s * 0.95, x + s * 0.95, y - s * 0.2, x, y + s * 0.4);
  ctx.closePath();
  ctx.fillStyle = on ? '#ff5a7a' : 'rgba(50,24,34,0.95)'; ctx.fill();
  ctx.strokeStyle = on ? '#ffb8c8' : 'rgba(150,100,110,0.55)'; ctx.lineWidth = 1; ctx.stroke();
}
/** 유대 하트 5개 (단계만큼 채움) → 끝 x */
function hearts(ctx, x, y, rank, s = 6) {
  for (let i = 0; i < 5; i++) heart(ctx, x + s + i * (s * 2 + 3), y, s, i < rank);
  return x + 5 * (s * 2 + 3);
}
function pill(ctx, str, x, y, { color = '#e8c872', bg = 'rgba(40,20,30,0.92)', size = 11, align = 'left' } = {}) {
  ctx.font = font(size, 800, FONT.body);
  const w = ctx.measureText(str).width + 14, h = size + 8;
  const X = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(X, y - h / 2, w, h, h / 2) : ctx.rect(X, y - h / 2, w, h); ctx.fill();
  ctx.strokeStyle = rgba(color, 0.8); ctx.lineWidth = 1; ctx.stroke();
  text(ctx, str, X + w / 2, y + size * 0.36, { size, weight: 800, color, align: 'center', ow: 0 });
  return w;
}
/** 알 (끝이 뾰족한 달걀꼴 + 무늬 + 금 + 준비되면 광채). (x, y) = 바닥 가운데 */
function drawEgg(ctx, id, x, y, s, t, { ready = false, crack = 0, wob = 0 } = {}) {
  const d = companionDef(id), p = d?.palette ?? ['#e8e0d0', '#9a9080', '#6a5a7a', '#ffd070', '#ffffff'];
  const L = EGG_LOOK[id] ?? { a: p[0], b: p[1], spot: p[2], glow: d?.light?.color ?? d?.color ?? '#ffd070' };
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (ready || crack > 0) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -28, 54 + crack * 8, L.glow, 0.3 + 0.12 * Math.sin(t * 4) + crack * 0.08);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 0, 22, 5, 0, 0, TAU); ctx.fill();
  // 둥지 짚
  ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI; ctx.beginPath(); ctx.moveTo(-26 + i * 4.5, 1); ctx.lineTo(-26 + i * 4.5 + Math.cos(a) * 9, -3 - Math.sin(a) * 3); ctx.stroke(); }
  ctx.rotate(wob);
  const shell = () => { ctx.beginPath(); ctx.moveTo(0, -58); ctx.bezierCurveTo(21, -58, 27, -19, 23, -8); ctx.bezierCurveTo(19, 2, -19, 2, -23, -8); ctx.bezierCurveTo(-27, -19, -21, -58, 0, -58); ctx.closePath(); };
  shell();
  const g = ctx.createRadialGradient(-8, -40, 2, 0, -26, 36);
  g.addColorStop(0, shade(L.a, 0.35)); g.addColorStop(0.55, L.a); g.addColorStop(1, L.b);
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); shell(); ctx.clip();
  const rng = new RNG(hashStr('egg:' + id));
  for (let i = 0; i < 9; i++) { ctx.fillStyle = rgba(L.spot, rng.range(0.35, 0.7)); ctx.beginPath(); ctx.ellipse(rng.range(-18, 18), rng.range(-52, -6), rng.range(2, 5), rng.range(1.5, 4), rng.range(0, 3), 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-9, -40, 4, 9, -0.3, 0, TAU); ctx.fill();
  ctx.restore();
  shell(); ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 1.6; ctx.stroke();
  // 금 (crack 0..3 줄), 틈으로 새는 빛
  const cracks = [[[-4, -56], [2, -46], [-5, -38], [3, -30]], [[16, -34], [8, -28], [13, -20], [5, -14]], [[-18, -26], [-10, -22], [-15, -14], [-6, -10]]];
  const n = clamp(Math.ceil(crack), 0, 3) + (ready && crack <= 0 ? 1 : 0);
  for (let k = 0; k < Math.min(3, n); k++) {
    const c = cracks[k];
    ctx.strokeStyle = rgba(L.glow, 0.9); ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (const [a, b] of c.slice(1)) ctx.lineTo(a, b); ctx.stroke();
    ctx.strokeStyle = '#1a0a0a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (const [a, b] of c.slice(1)) ctx.lineTo(a, b); ctx.stroke();
  }
  ctx.restore();
}

// 마구간 안쪽 배경 (크기·열림 여부가 바뀔 때만 다시 굽는다)
const BG = { key: '', cv: null };
function bakeInterior(vw, vh, closed) {
  const key = `${Math.round(vw)}x${Math.round(vh)}:${closed ? 1 : 0}`;
  if (BG.key === key && BG.cv) return BG.cv;
  const cv = BG.cv ?? document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(vw)); cv.height = Math.max(1, Math.ceil(vh));
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  const rng = new RNG(hashStr('stable-interior'));
  const base = closed ? '#241c20' : '#3a2418';
  // 판자 뒷벽
  for (let x = -rng.range(0, 10); x < vw;) {
    const w = rng.range(18, 30), col = shade(base, rng.range(-0.25, 0.08));
    const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, shade(col, 0.1)); g.addColorStop(1, shade(col, -0.3));
    c.fillStyle = g; c.fillRect(x + 1, 0, w - 2, vh);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + rng.range(4, w - 4), 0, 1, vh);
    x += w;
  }
  // 들보 · 기둥 · 버팀대
  const beam = (y, h) => { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#5a3a22'); g.addColorStop(1, '#1a0c06'); c.fillStyle = g; c.fillRect(0, y, vw, h); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, y + h - 2, vw, 2); };
  beam(vh * 0.2, 16); beam(vh * 0.56, 12);
  c.strokeStyle = '#24140a'; c.lineWidth = 9;
  for (let x = vw * 0.12; x < vw; x += vw * 0.24) {
    const g = c.createLinearGradient(x - 8, 0, x + 8, 0); g.addColorStop(0, '#4a3020'); g.addColorStop(1, '#140a04');
    c.fillStyle = g; c.fillRect(x - 8, 0, 16, vh);
    c.beginPath(); c.moveTo(x + 8, vh * 0.2 + 16); c.lineTo(x + 50, vh * 0.2 - 30); c.stroke();
  }
  // 칸 (반쪽 문) — 아래쪽 띠
  const sy = vh * 0.56 + 12, stall = Math.max(90, vw / 7);
  for (let x = 0; x < vw; x += stall) {
    c.fillStyle = '#070304'; c.fillRect(x + 12, sy, stall - 24, vh * 0.14);
    const g = c.createLinearGradient(0, sy + vh * 0.14, 0, vh); g.addColorStop(0, '#4a2a1a'); g.addColorStop(1, '#1a0c06');
    c.fillStyle = g; c.fillRect(x + 8, sy + vh * 0.14, stall - 16, vh);
    c.strokeStyle = '#1a0c06'; c.lineWidth = 5; c.beginPath(); c.moveTo(x + 12, sy + vh * 0.14 + 6); c.lineTo(x + stall - 12, vh - 8); c.stroke();
  }
  // 바닥 짚
  for (let i = 0; i < vw / 3; i++) {
    const x = rng.next() * vw, y = vh - rng.range(0, 24), a = rng.range(-0.6, 0.6), l = rng.range(5, 14);
    c.strokeStyle = closed ? `rgba(90,80,70,${rng.range(0.3, 0.6)})` : `rgba(200,160,80,${rng.range(0.35, 0.7)})`; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y - Math.abs(Math.sin(a)) * l * 0.5); c.stroke();
  }
  if (closed) {
    // 그을음 · 부서진 판자 · 거미줄
    for (let i = 0; i < 9; i++) {
      const x = rng.next() * vw, y = rng.range(vh * 0.3, vh), r = rng.range(30, 80);
      const g = c.createRadialGradient(x, y, 2, x, y, r); g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.strokeStyle = 'rgba(200,210,230,0.18)'; c.lineWidth = 0.8;
    for (const [cx, cy] of [[vw - 40, vh * 0.2 + 16], [vw * 0.12 + 8, vh * 0.2 + 16]]) {
      for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(k * 0.5 + 0.2) * 70, cy + Math.sin(k * 0.5 + 0.2) * 70); c.stroke(); }
      for (let r = 14; r < 70; r += 14) { c.beginPath(); c.arc(cx, cy, r, 0.2, 2.8); c.stroke(); }
    }
    // 차가운 달빛 줄기
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const x0 = vw * (0.45 + i * 0.18);
      const g = c.createLinearGradient(x0, 0, x0 - vh * 0.5, vh); g.addColorStop(0, 'rgba(140,170,230,0.14)'); g.addColorStop(1, 'rgba(140,170,230,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + 34, 0); c.lineTo(x0 + 34 - vh * 0.5, vh); c.lineTo(x0 - vh * 0.5, vh); c.closePath(); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  }
  // 전체 톤 (가장자리 어둡게)
  const v = c.createRadialGradient(vw * 0.6, vh * 0.5, vh * 0.2, vw * 0.6, vh * 0.5, vw * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, closed ? 'rgba(2,2,6,0.7)' : 'rgba(4,2,2,0.55)');
  c.fillStyle = v; c.fillRect(0, 0, vw, vh);
  BG.key = key; BG.cv = cv;
  return cv;
}

// ───────────────────────── 장면 ─────────────────────────
export class StableScene extends ServiceScene {
  setup() {
    const st = this.state;
    try { CS.ensureCompanionState?.(st); } catch (e) { console.warn('[stable] state', e); }
    this.closed = !!st.arcade || (st.progress?.chapter ?? 0) < 1;
    this.title = '영혼의 마구간'; this.eng = 'STABLE OF SOULS';
    this.bgKey = null; this.music = null;
    this.npcId = this.closed ? null : GRETA;
    this.lines = STABLE_LINES;
    this.portraitGlow = '#9fd8ff'; this.accentGlow = '#3a8ab0';
    this.emberColor = this.closed ? '#9fb8d8' : '#ffd9a0';
    this.entries = [];
    this.list = this.addList ? this.addList(62) : null;
    if (this.closed) {
      this.tabs = []; this.lockTabs = true;
      this.closedFlow = true;
      return;
    }
    this.tabs = TABS.map((t) => ({ ...t, badge: '' }));
    // 첫 탭: 부화할 알 → 부화 / 그레타 의뢰 보상 → 의뢰 / 동료가 있으면 공물 / 아니면 구입
    const eggReady = this.eggs().some((e) => e.ready);
    const claim = this.gretaQuests().some((e) => e.status === 'ready');
    this.tab = eggReady ? 2 : claim ? 3 : (CS.ownedIds?.(st) ?? []).length ? 0 : 1;
    this.refresh();
    if (eggReady) this.talk(scriptLine('cmp_egg_ready') ?? STABLE_LINES.egg[0]);
    else if (claim) this.talk('의뢰는 끝냈어? 표정을 보니 좋은 소식이구나.');
    else this.talk('hello');
    this.flowSoon = true;   // 첫 update 에서 마구간 개장 대사 · 남은 합류 연출 (companionHubEnter)
  }
  onTab() { if (this.list) { this.list.index = 0; this.list.scroll = this.list.target = 0; } this.refresh(); }
  onResume() { if (!this.closed) { this.refresh(); this.flowSoon = true; } }
  extraHints() { return this.closed ? [] : [['alt', '동료 관리']]; }
  get cur() { return this.entries[this.list?.index ?? 0] ?? null; }

  // ── 데이터 ──
  eggs() { try { return CS.eggStatus?.(this.state) ?? []; } catch { return []; } }
  gretaQuests() {
    const st = this.state, out = [];
    let avail = [], active = [], done = [];
    try { avail = (Q.availableQuests(st, GRETA) || []).filter(Boolean); } catch (e) { console.warn('[stable] quests', e); }
    try { active = (Q.activeQuests(st) || []).filter((q) => q?.giver === GRETA); } catch { active = []; }
    try { done = (Q.completedQuests(st) || []).filter((q) => q?.giver === GRETA); } catch { done = []; }
    for (const q of active) out.push({ kind: 'quest', q, status: Q.canClaim(st, q.id) ? 'ready' : 'active' });
    out.sort((a, b) => (a.status === 'ready' ? 0 : 1) - (b.status === 'ready' ? 0 : 1));
    for (const q of avail) out.push({ kind: 'quest', q, status: 'available' });
    for (const q of Object.values(QUESTS)) {
      if (q?.giver !== GRETA) continue;
      let s = 'locked';
      try { s = Q.questStatus(st, q.id); } catch { /* 무시 */ }
      if (s === 'locked') out.push({ kind: 'quest', q, status: 'locked' });
    }
    for (const q of done) out.push({ kind: 'quest', q, status: 'done' });
    return out;
  }
  refresh() {
    if (this.closed) return;
    const st = this.state, id = this.tabs[this.tab]?.id;
    let E = [];
    try {
      if (id === 'tribute') E = (CS.ownedIds?.(st) ?? []).map((cid) => ({ kind: 'owned', id: cid }));
      else if (id === 'shop') E = STABLE_SHOP.filter((r) => companionDef(r.id)).map((row) => ({ kind: 'shop', id: row.id, row }));
      else if (id === 'eggs') E = this.eggs().map((egg) => ({ kind: 'egg', id: egg.id, egg }));
      else if (id === 'quests') E = this.gretaQuests();
    } catch (e) { console.warn('[stable] refresh', e); }
    this.entries = E;
    this.list?.setCount(E.length);
    const eggsReady = this.eggs().filter((e) => e.ready).length;
    const gq = this.gretaQuests();
    this.tabs[2].badge = eggsReady ? '!' : '';
    this.tabs[3].badge = gq.some((e) => e.status === 'ready') ? '★' : gq.some((e) => e.status === 'available') ? '!' : '';
  }

  // ── 갱신 ──
  update(dt) {
    const g = this.game;
    if (g.top === this && !this.closing) {
      if (this.closedFlow) {
        this.closedFlow = false;
        const line = STABLE_LINES.closed?.[0] ?? '불에 그을린 빈 마구간이다.';
        if (g.registry?.dialogue) { g.push('dialogue', { lines: [{ who: 'narrator', text: line }], world: this.world ?? g.world ?? null, onEnd: () => this.close() }); return; }
        g.toast?.(line, '#c8c0e0', 3); this.close(); return;
      }
      if (this.flowSoon && !this.busy && !this.modal && !this.popup) {
        this.flowSoon = false;
        try { CRT.companionHubEnter?.(g, this); } catch (e) { console.warn('[stable] hub flow', e); }
        if (g.top !== this) return;
      }
    }
    super.update(dt);
  }
  updateBody(dt) {
    if (this.closed || !this.list) return null;
    const r = this.list.update(dt);
    if (this.list.moved) audio.sfx('menu_move', { vol: 0.6 });
    const id = this.tapId;
    if (id === 'act' && this.cur) { this.act(); return 'handled'; }
    if (id === 'mgmt' || input.pressed('alt')) { this.openManage(); return 'handled'; }
    if (r === 'confirm' && this.cur) this.act();
    return r;
  }
  openManage() {
    const g = this.game;
    audio.sfx('menu_ok');
    if (g.registry?.menu) g.push('menu', { world: this.world ?? g.world ?? null, tab: 'companions', from: 'stable' });
    else g.toast?.('메뉴를 준비 중입니다.', '#c8b8a0');
  }
  act() {
    const e = this.cur;
    if (!e) return;
    if (e.kind === 'owned') this.tribute(e.id);
    else if (e.kind === 'shop') this.buy(e);
    else if (e.kind === 'egg') this.hatch(e);
    else if (e.kind === 'quest') this.questAct(e);
  }
  /** 합류 연출 (구입·부화·의뢰 보상). 이미 본 것으로 표시한 뒤 push — 허브 흐름이 같은 동료를 다시 보여 주지 않는다 */
  reveal(id, source) {
    const g = this.game, d = companionDef(id);
    if (!d) return;
    try { CS.markSeen?.(g.state, id); } catch { /* 무시 */ }
    if (g.registry?.companionJoin) g.push('companionJoin', { id, source, onDone: () => this.refresh() });
  }
  poor() { audio.sfx('menu_cancel'); this.talk('poor'); this.portraitShake = 6; }

  tribute(id) {
    const st = this.state, d = companionDef(id);
    let r;
    try { r = CS.giveTribute(st, id); } catch (e) { console.warn('[stable] tribute', e); return; }
    if (!r?.ok) {
      if (r?.msg === CMP_TEXT.poor) { this.poor(); this.game.toast(`${CMP_TEXT.poor} (${fmt(r.cost ?? 0)} G)`, '#ff8a7a'); }
      else { audio.sfx('menu_cancel'); if (r?.msg) { this.talk(r.msg); this.game.toast(r.msg, '#c8b8a0'); } }
      return;
    }
    audio.sfx('coin');
    try { ACMP.playCry?.(d, { vol: 0.7 }); } catch { /* 무시 */ }
    if (r.bond > 0) audio.sfx('bond_up', { vol: 0.6 });
    this.talk('tribute');
    const gain = [r.exp ? `경험치 +${fmt(r.exp)}` : '', r.bond ? `유대 +${r.bond}` : ''].filter(Boolean).join(' · ');
    this.game.toast(`${josa(d.name, '이/가')} 공물을 ${r.bond ? '반겼다!' : '받았다'}${gain ? ` ${gain}` : ''}`, d?.color ?? '#ffd070');
    if (r.levels > 0) {
      const lv = CS.ownedEntry?.(st, id)?.lv;
      this.game.toast(`「${d.name}」 Lv ${lv}! 한층 더 강해졌다`, '#ffe070');
      audio.sfx('levelup', { vol: 0.5 });
    }
    const dr = this.detailRect;
    if (dr) {
      this.fx.burst('gold', dr.x + 60, dr.y + 80, 24, { speed: 200 });
      if (r.bond > 0) this.fx.burst('holy', dr.x + 60, dr.y + 80, 16, { speed: 150, color: '#ff8aa8' });
      this.fx.ring(dr.x + 60, dr.y + 80, { color: d?.color ?? '#ffd84a', r0: 8, r1: 80, life: 0.45, width: 4 });
    }
    this.refresh();
  }
  buy(e) {
    const st = this.state, row = e.row, d = companionDef(e.id);
    if (CS.isOwned?.(st, e.id)) { audio.sfx('menu_cancel'); this.game.toast(CMP_TEXT.owned, '#c8b8a0'); return; }
    if ((st.progress?.chapter ?? 0) < row.chapter) { audio.sfx('menu_cancel'); this.talk(`아직 들여오지 못했어. ${row.chapter}장을 마치고 다시 와.`); return; }
    if (!((st.gold ?? 0) >= row.price)) { this.poor(); return; }
    audio.sfx('menu_ok');
    const who = row.label !== d.name ? `${row.label} — ${d.title} ${d.name}` : `${d.title} ${d.name}`;
    this.modal = new Modal({
      title: '동료 들이기', lines: [who, `${fmt(row.price)} G를 내고 데려가겠습니까?`], width: 480,
      buttons: [{ label: '데려간다', value: 'ok', primary: true }, { label: '그만둔다', value: 'cancel' }],
      onResult: (res) => {
        if (res.value !== 'ok') return;
        let r;
        try { r = CS.buyCompanion(st, e.id); } catch (err) { console.warn('[stable] buy', err); return; }
        if (!r?.ok) { if (r?.msg === CMP_TEXT.poor) this.poor(); else if (r?.msg) this.game.toast(r.msg, '#ff8a7a'); return; }
        audio.sfx('coin'); audio.sfx('item', { vol: 0.7 });
        this.talk('buy');
        this.game.toast(r.msg, d.color);
        const dr = this.detailRect;
        if (dr) { this.fx.burst('gold', dr.x + 60, dr.y + 80, 30, { speed: 220 }); this.fx.ring(dr.x + 60, dr.y + 80, { color: d.color, r0: 10, r1: 90, life: 0.5, width: 5 }); }
        this.refresh();
        this.reveal(e.id, 'shop');
      },
    });
  }
  hatch(e) {
    if (!e.egg?.ready) { audio.sfx('menu_cancel'); this.talk(STABLE_LINES.egg?.[1] ?? e.egg?.text ?? ''); return; }
    audio.sfx('menu_ok');
    this.talk(STABLE_LINES.egg?.[0] ?? '');
    this.busy = { kind: 'hatch', id: e.id, t: 0, last: 0, crack: 0, done: false, entry: null };
  }
  updateBusy(dt) {
    const B = this.busy;
    if (!B) return;
    B.t += dt;
    const c = this.eggCenter, look = EGG_LOOK[B.id] ?? { burst: ['magic', '#ffd070'], burst2: ['holy', '#ffffff'] };
    for (const at of [0.45, 1.05, 1.6]) {
      if (B.t >= at && B.last < at) {
        B.crack++;
        audio.sfx('egg_crack', { vol: 0.8, pitch: 0.9 + B.crack * 0.08 });
        if (c) this.fx.burst(look.burst[0], c.x, c.y - 30 * c.s, 8 + B.crack * 4, { speed: 120, color: look.burst[1] });
      }
    }
    if (B.t >= 2.0 && !B.done) {
      B.done = true;
      try { B.entry = CS.hatchEgg(this.state, B.id); } catch (err) { console.warn('[stable] hatch', err); }
      audio.sfx('explode', { vol: 0.35 }); audio.sfx('powerup', { vol: 0.6 });
      this.game.flash('#ffffff', 0.35, 4);
      if (c) {
        this.fx.burst(look.burst[0], c.x, c.y - 30 * c.s, 40, { speed: 280, color: look.burst[1] });
        this.fx.burst(look.burst2[0], c.x, c.y - 30 * c.s, 30, { speed: 220, color: look.burst2[1] });
        this.fx.ring(c.x, c.y - 30 * c.s, { color: look.burst2[1], r0: 10, r1: 130, life: 0.6, width: 6 });
      }
    }
    B.last = B.t;
    if (B.t >= 2.5) {
      this.busy = null;
      const d = companionDef(B.id);
      this.refresh();
      if (B.entry && d) {
        this.game.toast(`${josa(d.name, '이/가')} 알을 깨고 나왔다!`, d.color);
        this.talk(`봐, 깨어났어! 이름은… 「${d.name}」. 너를 어미로 아는 눈치야.`);
        this.reveal(B.id, 'egg');
      } else this.talk(STABLE_LINES.egg?.[1] ?? '');
    }
  }
  questAct(e) {
    const st = this.state, q = e.q;
    if (e.status === 'available') {
      let ok = false;
      try { ok = Q.acceptQuest(st, q.id); } catch (err) { console.warn('[stable] accept', err); }
      if (!ok) { audio.sfx('menu_cancel'); this.game.toast('지금은 받을 수 없는 의뢰다.', '#ff8a7a'); return; }
      this.talk(scriptLine(`q_${q.id}_start`) ?? q.desc ?? '');
      audio.sfx('item', { vol: 0.6 });
      this.refresh();
      return;
    }
    if (e.status === 'ready') {
      let out = null;
      try { out = Q.claimQuest(st, q.id); } catch (err) { console.warn('[stable] claim', err); }
      if (!out) { audio.sfx('menu_cancel'); this.game.toast('보상을 받을 수 없다.', '#ff8a7a'); return; }
      audio.sfx('win'); audio.sfx('coin');
      const items = (out.items || []).map((i) => { const m = makeInst(i.id); if (m) m.qty = i.qty ?? 1; return m; }).filter(Boolean);
      const cid = COMPANION_QUESTS[q.id];
      const cd = companionDef(cid);
      this.popup = new RewardPopup({ title: '의뢰 완료!', sub: `「${q.name}」${cd ? ` · ${KIND_LABEL[cd.kind]} 「${cd.name}」 합류` : ''}`, gold: out.gold, exp: out.exp, items, color: '#ffd84a' });
      this.popup.onClose = () => {
        this.refresh();
        this.talk(scriptLine(`q_${q.id}_done`) ?? '고마워. 녀석들도 기뻐할 거야.');
        if (cid && (CS.pendingIds?.(st) ?? []).includes(cid)) this.reveal(cid, 'quest');
      };
      return;
    }
    audio.sfx('menu_cancel');
    if (e.status === 'active') this.talk(`아직이야. ${Q.questProgressText?.(st, q.id) ?? ''}`.trim());
    else if (e.status === 'locked') this.talk(`아직은 부탁할 때가 아니야. ${q.req?.chapter ?? 1}장을 마치고 다시 와.`);
    else this.talk('그때는 고마웠어. 녀석도 잘 지내.');
  }

  // ── 그리기 ──
  renderAmbient(ctx, L) {
    const { vw, vh } = L;
    const bg = bakeInterior(vw, vh, this.closed);
    ctx.drawImage(bg, 0, 0, vw, vh);
    const t = this.t;
    if (this.closed) return;
    // 매달린 등불 (따뜻한 빛)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const x = vw * (0.36 + i * 0.26), y = vh * 0.2 + 34, k = 0.85 + Math.sin(t * 7.3 + i * 1.7) * 0.07 + Math.sin(t * 13.1 + i) * 0.05;
      glow(ctx, x, y, 170, '#ffb45a', 0.28 * k);
      glow(ctx, x, y, 34, '#ffe6a8', 0.6 * k);
    }
    // 제단 쪽 푸른 빛 (오른쪽 끝)
    glow(ctx, vw - 60, vh * 0.42, 160, '#9fd8ff', 0.18 + Math.sin(t * 1.3) * 0.04);
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const x = vw * (0.36 + i * 0.26), y = vh * 0.2 + 34;
      ctx.strokeStyle = '#141014'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, vh * 0.2 + 16); ctx.lineTo(x, y - 12); ctx.stroke();
      ctx.fillStyle = '#141014'; ctx.fillRect(x - 8, y - 13, 16, 4); ctx.fillRect(x - 7, y + 10, 14, 4);
      ctx.fillStyle = 'rgba(255,200,120,0.9)'; ctx.fillRect(x - 6, y - 9, 12, 19);
    }
    // 칸마다 보유한 탈것 (반쪽 문 위로 머리) · 제단의 수호신 영혼
    const st = this.state, sy = vh * 0.56 + 12 + vh * 0.14, stall = Math.max(90, vw / 7);
    let mounts = [], guards = [];
    try { mounts = CS.ownedIds?.(st, 'mount') ?? []; guards = CS.ownedIds?.(st, 'guardian') ?? []; } catch { /* 무시 */ }
    const s = clamp(vh / 300, 1.3, 1.9);
    for (let i = 0; i < mounts.length; i++) {
      const x = vw - stall * (i + 0.5) - 8;
      if (x < L.pw) break;
      drawStallHead(ctx, mounts[i], x - 8 * s, sy, s, t, i);
      ctx.fillStyle = '#2a160c'; ctx.fillRect(x - stall / 2 + 8, sy - 2, stall - 16, 6);
    }
    for (let i = 0; i < Math.min(5, guards.length); i++) {
      const a = t * 0.4 + (i * TAU) / Math.min(5, guards.length);
      drawSpiritWisp(ctx, guards[i], vw - 70 + Math.cos(a) * 44, vh * 0.42 + Math.sin(a) * 16, 1.2, t + i, 0.5 + 0.25 * Math.sin(a));
    }
  }
  renderPortrait(ctx, L) {
    if (this.closed) return;                                   // 닫힌 마구간: 그레타가 아직 없다
    if (this.game.top?.name === 'dialogue') return;            // 대화 장면이 그레타 초상화를 따로 그린다
    super.renderPortrait(ctx, L);
  }
  renderBody(ctx, body, L) {
    if (this.closed || !this.list) return;
    const compact = !!L.compact;
    const lw = Math.round(body.w * (compact ? 0.44 : 0.46));
    const lr = { x: body.x + 10, y: body.y, w: lw - 10, h: body.h };
    ctx.fillStyle = 'rgba(6,3,8,0.55)'; ctx.fillRect(body.x, body.y - 4, lw + 2, body.h + 8);
    this.list.draw(ctx, lr, (c, i, r, sel) => this.drawRow(c, r, sel, this.entries[i]), this.emptyText());
    const bh = compact ? 46 : 50;
    const dr = { x: body.x + lw + 10, y: body.y, w: body.w - lw - 10, h: body.h - bh - 8 };
    this.detailRect = dr;
    this.drawDetail(ctx, dr, this.cur, compact);
    const mw = Math.min(150, Math.round(dr.w * 0.36));
    const actR = this.tz ? this.tz('act', { x: dr.x, y: dr.y + dr.h + 8, w: dr.w - mw - 8, h: bh }) : { x: dr.x, y: dr.y + dr.h + 8, w: dr.w - mw - 8, h: bh };
    const mgR = this.tz ? this.tz('mgmt', { x: dr.x + dr.w - mw, y: dr.y + dr.h + 8, w: mw, h: bh }) : { x: dr.x + dr.w - mw, y: dr.y + dr.h + 8, w: mw, h: bh };
    this.actRect = actR; this.mgmtRect = mgR;
    const a = this.actionOf(this.cur);
    uiButton(ctx, actR, a.label, { selected: a.ok, disabled: !a.ok, size: a.label.length > 12 ? 15 : 17, color: a.color });
    uiButton(ctx, mgR, '동료 관리', { size: 15 });
  }
  emptyText() {
    const id = this.tabs[this.tab]?.id;
    return id === 'tribute' ? '아직 함께하는 동료가 없다.' : id === 'eggs' ? '맡겨 둔 알이 없다.' : id === 'quests' ? '지금은 부탁할 일이 없어.' : '팔 녀석이 없다.';
  }
  actionOf(e) {
    const st = this.state, gold = st.gold ?? 0;
    if (!e) return { label: '—', ok: false };
    if (e.kind === 'owned') {
      const p = CS.tributePreview?.(st, e.id) ?? { cost: 0, useful: false };
      if (!p.useful) return { label: '더 바칠 공물이 없다', ok: false };
      return gold >= p.cost ? { label: `공물 바치기 · ${fmt(p.cost)} G`, ok: true } : { label: `금화 부족 · ${fmt(p.cost)} G`, ok: false, color: '#ff8a7a' };
    }
    if (e.kind === 'shop') {
      if (CS.isOwned?.(st, e.id)) return { label: '함께하고 있다', ok: false };
      if ((st.progress?.chapter ?? 0) < e.row.chapter) return { label: e.row.lockNote, ok: false };
      return gold >= e.row.price ? { label: `데려가기 · ${fmt(e.row.price)} G`, ok: true } : { label: `금화 부족 · ${fmt(e.row.price)} G`, ok: false, color: '#ff8a7a' };
    }
    if (e.kind === 'egg') return e.egg.ready ? { label: '부화시키기', ok: true, color: '#ffe070' } : { label: '아직 따뜻하다…', ok: false };
    if (e.kind === 'quest') {
      if (e.status === 'available') return { label: '의뢰 받기', ok: true };
      if (e.status === 'ready') return { label: '★ 보상 받기', ok: true, color: '#ffe070' };
      if (e.status === 'active') return { label: '진행 중…', ok: false };
      if (e.status === 'locked') return { label: `${e.q.req?.chapter ?? 1}장 클리어 후`, ok: false };
      return { label: '완료한 의뢰', ok: false };
    }
    return { label: '—', ok: false };
  }

  drawRow(ctx, r, sel, e) {
    if (!e) return;
    const st = this.state, cy = r.y + r.h / 2, ir = Math.min(22, (r.h - 10) / 2), ix = r.x + 10 + ir;
    if (e.kind === 'quest') {
      const q = e.q, cid = COMPANION_QUESTS[q.id], dim = e.status === 'locked' || e.status === 'done';
      rowBg(ctx, r, sel, { tint: e.status === 'ready' ? '#ffd84a' : e.status === 'available' ? '#ff8a6a' : null, dim });
      ctx.globalAlpha = dim ? 0.6 : 1;
      if (cid) cmpIcon(ctx, cid, ix, cy, ir, { locked: !CS.isOwned?.(st, cid) });
      const nx = ix + ir + 12, mw = r.x + r.w - nx - 12;
      text(ctx, q.name, nx, cy - 3, { size: 15, weight: 800, family: FONT.title, color: '#f3e2b8', maxWidth: mw - 60 });
      const sub = e.status === 'ready' ? '의뢰 달성 — 보상을 받자' : e.status === 'active' ? (Q.questProgressText?.(st, q.id) ?? '') : e.status === 'available' ? '새 의뢰' : e.status === 'locked' ? `${q.req?.chapter ?? 1}장 클리어 후` : '완료';
      text(ctx, sub, nx, cy + 15, { size: 12, color: e.status === 'ready' ? '#ffe070' : '#a89880', maxWidth: mw });
      if (e.status === 'ready') pill(ctx, '달성', r.x + r.w - 12, cy - 8, { color: '#ffe070', align: 'right' });
      else if (e.status === 'available') pill(ctx, 'NEW', r.x + r.w - 12, cy - 8, { color: '#ff8a6a', align: 'right' });
      ctx.globalAlpha = 1;
      return;
    }
    if (e.kind === 'egg') {
      rowBg(ctx, r, sel, { tint: e.egg.ready ? '#ffd84a' : null });
      drawEgg(ctx, e.id, ix, r.y + r.h - 6, (r.h - 12) / 62, this.t, { ready: e.egg.ready, wob: e.egg.ready ? Math.sin(this.t * 9) * 0.06 : 0 });
      const nx = ix + ir + 12;
      text(ctx, e.egg.egg, nx, cy - 3, { size: 15, weight: 800, family: FONT.title, color: '#f3e2b8', maxWidth: r.x + r.w - nx - 70 });
      text(ctx, e.egg.text, nx, cy + 15, { size: 12, color: e.egg.ready ? '#ffe070' : '#a89880', maxWidth: r.x + r.w - nx - 12 });
      if (e.egg.ready) pill(ctx, '부화 가능', r.x + r.w - 12, cy - 8, { color: '#ffe070', align: 'right' });
      return;
    }
    const d = companionDef(e.id);
    if (!d) return;
    const owned = !!CS.isOwned?.(st, e.id);
    const locked = e.kind === 'shop' && !owned && (st.progress?.chapter ?? 0) < e.row.chapter;
    rowBg(ctx, r, sel, { tint: d.color, dim: locked });
    cmpIcon(ctx, e.id, ix, cy, ir, { locked });
    const nx = ix + ir + 12, right = r.x + r.w - 12;
    if (e.kind === 'owned') {
      const ent = CS.ownedEntry?.(st, e.id), rank = CS.bondRankOf?.(st, e.id) ?? 0;
      text(ctx, d.name, nx, cy - 4, { size: 15, weight: 800, family: FONT.title, color: d.color, maxWidth: r.w - 180 });
      ctx.font = font(15, 800, FONT.title);
      const nw = Math.min(r.w - 180, ctx.measureText(d.name).width);
      text(ctx, `Lv ${ent?.lv ?? 1}`, nx + nw + 8, cy - 4, { size: 12, weight: 800, family: FONT.num, color: '#e8dcc0' });
      hearts(ctx, nx, cy + 11, rank, 5);
      const p = CS.tributePreview?.(st, e.id);
      if (p?.useful) text(ctx, `${fmt(p.cost)} G`, right, cy + 6, { size: 14, weight: 800, family: FONT.num, color: (st.gold ?? 0) >= p.cost ? '#ffd84a' : COLORS.bad ?? '#ff6a5a', align: 'right' });
      if (ent && ent.seen === false) pill(ctx, 'NEW', right, r.y + 12, { color: '#ff6a6a', align: 'right', size: 10 });
    } else {
      ctx.globalAlpha = locked ? 0.6 : 1;
      text(ctx, e.row.label, nx, cy - 3, { size: 15, weight: 800, family: FONT.title, color: locked ? '#8a7a68' : d.color, maxWidth: r.w - 170 });
      text(ctx, e.row.desc, nx, cy + 15, { size: 11, color: '#a89880', maxWidth: r.w - ir * 2 - 130 });
      const rt = owned ? '보유 중' : locked ? e.row.lockNote : `${fmt(e.row.price)} G`;
      const rc = owned ? '#8ae08a' : locked ? '#8a7a68' : (st.gold ?? 0) >= e.row.price ? '#ffd84a' : (COLORS.bad ?? '#ff6a5a');
      text(ctx, rt, right, cy + 6, { size: locked ? 11 : 14, weight: 800, family: locked ? FONT.body : FONT.num, color: rc, align: 'right' });
      ctx.globalAlpha = 1;
    }
  }

  drawDetail(ctx, r, e, compact) {
    uiPanel(ctx, r.x, r.y, r.w, r.h, { corner: false });
    this.eggCenter = null;
    if (!e) {
      text(ctx, this.emptyText(), r.x + r.w / 2, r.y + r.h / 2 - 6, { size: 15, align: 'center', color: COLORS.dim });
      const id = this.tabs[this.tab]?.id;
      const sub = id === 'tribute' ? '구입하거나 보스를 쓰러뜨려 동료를 만나 보자' : id === 'eggs' ? '알을 남기는 보스를 처음 쓰러뜨리면 이곳에 맡겨진다' : '';
      if (sub) text(ctx, sub, r.x + r.w / 2, r.y + r.h / 2 + 18, { size: 12, align: 'center', color: '#8a7a68', maxWidth: r.w - 24 });
      return;
    }
    if (e.kind === 'quest') { this.drawQuestDetail(ctx, r, e); return; }
    if (e.kind === 'egg') { this.drawEggDetail(ctx, r, e, compact); return; }
    const st = this.state, d = companionDef(e.id);
    if (!d) return;
    const owned = !!CS.isOwned?.(st, e.id);
    const locked = e.kind === 'shop' && !owned && (st.progress?.chapter ?? 0) < e.row.chapter;
    const pad = 12, ph = Math.round(clamp(r.h * 0.56, 110, 170)), pw = Math.round(ph * 0.76);
    const px = r.x + pad, py = r.y + pad;
    portraitCard(ctx, e.id, px, py, pw, ph, { dim: locked ? 0.55 : 0, t: this.t });
    const x = px + pw + 14, w = r.x + r.w - pad - x;
    let y = py + 22;
    text(ctx, d.name, x, y, { size: compact ? 20 : 22, weight: 800, family: FONT.title, color: d.color, maxWidth: w });
    y += 20;
    text(ctx, d.title, x, y, { size: 13, weight: 700, color: '#d8c8b0', maxWidth: w - 64 });
    pill(ctx, KIND_LABEL[d.kind] ?? '', x + w, y - 5, { color: d.kind === 'mount' ? '#e8a040' : '#9fd8ff', align: 'right', size: 10 });
    y += 10;
    if (owned) {
      const xi = CS.expInfo?.(st, e.id) ?? { lv: 1, exp: 0, need: 0, max: false };
      const bi = CS.bondInfo?.(st, e.id) ?? { rank: 0, name: BOND_NAMES[0], next: null, points: 0 };
      y += 16;
      text(ctx, `Lv ${xi.lv}`, x, y, { size: 14, weight: 900, family: FONT.num, color: '#fff4d8' });
      text(ctx, xi.max ? 'EXP MAX' : `EXP ${fmt(xi.exp)} / ${fmt(xi.need)}`, x + w, y, { size: 11, weight: 700, color: '#bca88a', align: 'right' });
      bar(ctx, x, y + 6, w, 6, xi.max ? 1 : xi.exp / Math.max(1, xi.need), { color: '#e8c872' });
      y += 28;
      const hx = hearts(ctx, x, y - 4, bi.rank, 5);
      text(ctx, bi.name, hx + 6, y, { size: 12, weight: 800, color: '#ff9ab0' });
      y += 17;
      if (bi.next != null) { text(ctx, `다음 유대까지 ${Math.max(0, bi.next - bi.points)}`, x, y, { size: 11, color: '#a89880' }); y += 14; }
    } else {
      y += 18;
      for (const l of wrap(ctx, d.role ?? '', w, 12).slice(0, 2)) { text(ctx, l, x, y, { size: 12, color: '#d8c8b0' }); y += 17; }
    }
    if (!compact || !owned) {
      y += 8;
      for (const l of wrap(ctx, d.desc ?? '', w, 12).slice(0, compact ? 2 : 3)) { if (y > py + ph + 4) break; text(ctx, l, x, y, { size: 12, color: '#a89880' }); y += 16; }
    }
    // 아래: 공물 미리보기 / 능력 칩 · 값
    let by = py + ph + 14;
    const bx = r.x + pad, bw = r.w - pad * 2;
    if (by > r.y + r.h - 20) return;
    if (e.kind === 'owned') {
      const p = CS.tributePreview?.(st, e.id) ?? { cost: 0, exp: 0, bond: 0, useful: false };
      text(ctx, '공물', bx, by + 4, { size: 12, weight: 800, color: '#e8c872' });
      by += 22;
      if (!p.useful) text(ctx, cmpText('tributeDone', { name: d.name }), bx, by, { size: 13, color: '#a89880', maxWidth: bw });
      else {
        const parts = [];
        if (p.exp) parts.push(`경험치 +${fmt(p.exp)}`);
        if (p.bond) parts.push(`유대 +${p.bond}`);
        text(ctx, `${fmt(p.cost)} G → ${parts.join(' · ')}`, bx, by, { size: 14, weight: 700, color: (st.gold ?? 0) >= p.cost ? '#fff4d8' : '#ff8a7a', maxWidth: bw });
        by += 20;
        if (!p.bond && by < r.y + r.h - 6) text(ctx, TRIBUTE.noBondNote, bx, by, { size: 12, color: '#a89880', maxWidth: bw });
      }
    } else {
      const chips = d.chips ?? [];
      let cx = bx;
      ctx.font = font(12, 700, FONT.body);
      for (const ch of chips) {
        const cw = ctx.measureText(ch).width + 18;
        if (cx + cw > bx + bw) { cx = bx; by += 26; }
        if (by + 22 > r.y + r.h - 4) break;
        ctx.fillStyle = rgba(d.color, 0.14); ctx.fillRect(cx, by, cw, 22);
        ctx.strokeStyle = rgba(d.color, 0.55); ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, by + 0.5, cw - 1, 21);
        text(ctx, ch, cx + cw / 2, by + 15, { size: 12, weight: 700, color: '#f3e2b8', align: 'center', ow: 0 });
        cx += cw + 6;
      }
      by += 46;
      if (by < r.y + r.h - 6) {
        const note = owned ? '이미 함께하고 있다' : locked ? e.row.lockNote : `${fmt(e.row.price)} G`;
        text(ctx, note, bx, by, { size: 14, weight: 800, family: owned || locked ? FONT.body : FONT.num, color: owned ? '#8ae08a' : locked ? '#a89880' : (st.gold ?? 0) >= e.row.price ? '#ffd84a' : '#ff8a7a' });
      }
    }
  }
  drawEggDetail(ctx, r, e, compact) {
    const B = this.busy?.kind === 'hatch' && this.busy.id === e.id ? this.busy : null;
    const s = clamp((r.h - 90) / 90, 1.1, 2.1), cx = r.x + r.w / 2, cy = r.y + 30 + 62 * s;
    const t = this.t;
    let wob = e.egg.ready ? Math.sin(t * 7) * 0.05 * (0.5 + 0.5 * Math.sin(t * 1.3)) : Math.sin(t * 1.2) * 0.015;
    let crack = 0;
    if (B) { const k = clamp(B.t / 2, 0, 1); wob = Math.sin(B.t * (20 + k * 30)) * (0.06 + k * 0.1); crack = B.crack; }
    this.eggCenter = { x: cx, y: cy, s };
    if (!B?.done) drawEgg(ctx, e.id, cx, cy, s, t, { ready: e.egg.ready, crack, wob });
    else {
      // 깨진 껍데기 조각 + 태어난 동료의 영혼빛
      const d = companionDef(e.id), k = clamp((B.t - 2) / 0.5, 0, 1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, cy - 34 * s, 90 * s * (0.6 + k), d?.color ?? '#ffe070', 0.7 * (1 - k * 0.4)); ctx.restore();
      if (d?.kind === 'mount') drawStallHead(ctx, e.id, cx - 8 * s, cy, s, t, 0);
      else drawSpiritWisp(ctx, e.id, cx, cy - 34 * s, s * 1.4, t, 1);
    }
    let y = cy + 26;
    text(ctx, e.egg.egg, cx, y, { size: compact ? 18 : 20, weight: 800, family: FONT.title, color: '#f3e2b8', align: 'center', maxWidth: r.w - 20 });
    y += 22;
    if (y < r.y + r.h - 4) text(ctx, B ? '알이 흔들린다…!' : e.egg.text, cx, y, { size: 13, weight: 700, color: e.egg.ready || B ? '#ffe070' : '#a89880', align: 'center', maxWidth: r.w - 20 });
    y += 20;
    if (!B && y < r.y + r.h - 4) text(ctx, e.egg.ready ? '무엇이 태어날지는 깨어나 봐야 안다.' : '스테이지를 클리어할 때마다 조금씩 깨어난다.', cx, y, { size: 11, color: '#8a7a68', align: 'center', maxWidth: r.w - 20 });
  }
  drawQuestDetail(ctx, r, e) {
    const st = this.state, q = e.q, pad = 14, x = r.x + pad, w = r.w - pad * 2;
    let y = r.y + 30;
    text(ctx, '— 그레타의 의뢰 —', r.x + r.w / 2, y - 10, { size: 11, weight: 800, align: 'center', color: '#8a1426', family: FONT.title });
    text(ctx, q.name, r.x + r.w / 2, y + 14, { size: 20, weight: 800, family: FONT.title, align: 'center', color: '#f3e2b8', maxWidth: w });
    y += 36;
    ctx.fillStyle = 'rgba(232,200,114,0.35)'; ctx.fillRect(x, y, w, 1.5);
    y += 20;
    for (const l of wrap(ctx, q.desc ?? '', w, 13).slice(0, 4)) { text(ctx, l, x, y, { size: 13, color: '#e8dcc8' }); y += 19; }
    y += 6;
    if (e.status !== 'locked' && y < r.y + r.h - 50) {
      let p = null; try { p = Q.questProgress?.(st, q.id); } catch { p = null; }
      text(ctx, '목표', x, y, { size: 12, weight: 800, color: '#e8c872' });
      text(ctx, Q.questProgressText?.(st, q.id) ?? '', x + 40, y, { size: 13, weight: 700, color: '#fff4d8', maxWidth: w - 40 });
      y += 8;
      if (p && (e.status === 'active' || e.status === 'ready')) { bar(ctx, x, y, w, 7, p.cur / Math.max(1, p.need), { color: p.done ? '#6ac85a' : '#c8881a' }); y += 12; }
      y += 12;
    }
    if (y < r.y + r.h - 30) {
      text(ctx, '보상', x, y, { size: 12, weight: 800, color: '#e8c872' });
      const rw = q.reward || {};
      const parts = [];
      if (rw.gold) parts.push(`${fmt(rw.gold)} G`);
      if (rw.exp) parts.push(`EXP ${fmt(rw.exp)}`);
      text(ctx, parts.join(' · '), x + 40, y, { size: 13, weight: 700, color: '#ffd84a', maxWidth: w - 40 });
      y += 26;
      const cid = COMPANION_QUESTS[q.id], d = companionDef(cid);
      if (d && y < r.y + r.h - 12) {
        const owned = !!CS.isOwned?.(st, cid);
        cmpIcon(ctx, cid, x + 16, y, 15, { locked: !owned && e.status !== 'done' });
        text(ctx, `${KIND_LABEL[d.kind]} 「${d.name}」 합류${owned ? ' (함께하는 중)' : ''}`, x + 40, y + 5, { size: 14, weight: 800, color: d.color, maxWidth: w - 40 });
      }
    }
    if (e.status === 'done') {
      ctx.save(); ctx.translate(r.x + r.w - 58, r.y + 64); ctx.rotate(-0.25);
      ctx.strokeStyle = 'rgba(200,40,50,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 32, 0, TAU); ctx.stroke();
      text(ctx, '완료', 0, 7, { size: 18, weight: 900, align: 'center', color: 'rgba(220,60,70,0.9)', family: FONT.title, ow: 0 });
      ctx.restore();
    }
  }
}
