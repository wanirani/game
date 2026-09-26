// 클라우드 저장 화면 도우미: 구름 상태 아이콘·문구, 세이브 요약 카드, 충돌 선택 대화 상자(cloudConflict)
//  push('cloudConflict', { slot, mode:'conflict'|'download'|'upload', onDone(ok) })
//  mode: conflict = 양쪽이 따로 바뀜 (받기/올리기 중 선택) · download = 클라우드 것으로 이 기기 덮어쓰기 · upload = 이 기기 것으로 클라우드 덮어쓰기
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { cloud, summarize } from '../../core/cloud.js';
import { text, wrap, FONT, ListMenu } from '../../core/ui.js';
import { clamp, ease, rgba, TAU } from '../../core/math.js';
import { CHARACTERS } from '../../data/characters.js';
import { CLASSES } from '../../data/classes.js';
import { getDiff } from '../../data/difficulty.js';
import { frame, ornament, gbutton, portraitIn, fmtDate, fmtPlay, TapZones, GOLD, BONE, DIM } from './common.js';

export const CLOUD_COLOR = {
  synced: '#86e0a0', cloud: '#7cc4ff', local: '#ffc861', conflict: '#ff5a6a', pending: '#c9b8ff',
  offline: '#8a8088', unknown: '#8a8088', empty: '#6d6166', guest: '#9d8f80', blocked: '#6d6166', error: '#ff8a70',
};
export const CLOUD_TEXT = {
  synced: '동기화됨', cloud: '서버가 최신', local: '기기가 최신', conflict: '충돌', pending: '동기화 중',
  offline: '오프라인', unknown: '확인 전', empty: '비어 있음', guest: '게스트', blocked: '사용 불가', error: '오류',
};

/** 구름 아이콘 (가운데 x,y · 폭 s). 상태별 표식: ✓ 동기화됨, ↓ 서버가 최신, ↑ 기기가 최신, ! 충돌, … 동기화 중, / 오프라인 */
export function drawCloudIcon(ctx, x, y, s, status, t = 0, { alpha = 1 } = {}) {
  const col = CLOUD_COLOR[status] ?? CLOUD_COLOR.unknown;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y); ctx.scale(s / 24, s / 24);
  ctx.beginPath();
  ctx.arc(-6, 2, 5, Math.PI * 0.5, Math.PI * 1.35);
  ctx.arc(0, -2, 7, Math.PI * 1.1, Math.PI * 1.9);
  ctx.arc(7, 2, 5, Math.PI * 1.5, Math.PI * 0.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(8,4,12,0.92)'; ctx.fill();
  ctx.lineWidth = 1.8; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.9; ctx.lineCap = 'round';
  ctx.beginPath();
  switch (status) {
    case 'synced': ctx.moveTo(-3.8, 1.5); ctx.lineTo(-0.8, 4.3); ctx.lineTo(4.2, -1.2); ctx.stroke(); break;
    case 'cloud': ctx.moveTo(0.5, -3); ctx.lineTo(0.5, 4.5); ctx.moveTo(-2.8, 1.4); ctx.lineTo(0.5, 4.6); ctx.lineTo(3.8, 1.4); ctx.stroke(); break;
    case 'local': ctx.moveTo(0.5, 4.6); ctx.lineTo(0.5, -3); ctx.moveTo(-2.8, 0.2); ctx.lineTo(0.5, -3.1); ctx.lineTo(3.8, 0.2); ctx.stroke(); break;
    case 'conflict': ctx.moveTo(0.5, -3.2); ctx.lineTo(0.5, 1.6); ctx.stroke(); ctx.beginPath(); ctx.arc(0.5, 4.3, 1.1, 0, TAU); ctx.fill(); break;
    case 'pending':
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = alpha * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 6 - i * 1.1))); ctx.beginPath(); ctx.arc(-3.5 + i * 4, 1.5, 1.3, 0, TAU); ctx.fill(); }
      break;
    case 'offline': case 'blocked': case 'error': ctx.moveTo(-4, 4.5); ctx.lineTo(5, -3.5); ctx.stroke(); break;
    case 'guest': ctx.arc(0.5, -0.5, 1.8, 0, TAU); ctx.moveTo(-3, 5); ctx.quadraticCurveTo(0.5, 0.8, 4, 5); ctx.stroke(); break;
    default: ctx.moveTo(-3, 1.5); ctx.lineTo(4, 1.5); ctx.stroke();
  }
  ctx.restore();
}

/** 오른쪽 끝(xr) 기준으로 [구름] 문구 를 그린다. 반환: 그린 폭 */
export function drawCloudBadge(ctx, xr, y, status, t = 0, { size = 12, label = null, alpha = 1 } = {}) {
  const s = label ?? CLOUD_TEXT[status] ?? '';
  const col = CLOUD_COLOR[status] ?? CLOUD_COLOR.unknown;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `800 ${size}px ${FONT.body}`;
  const tw = ctx.measureText(s).width, iw = size * 1.75;
  text(ctx, s, xr, y + size * 0.36, { size, align: 'right', weight: 800, color: col, ow: 2 });
  drawCloudIcon(ctx, xr - tw - 4 - iw / 2, y, iw, status, t);
  ctx.restore();
  return tw + iw + 6;
}

/** 계정 표시용 상태: 게스트 / 아이디 + 동기화 상태 */
export function accountBadge() {
  if (!cloud.loggedIn) return { status: 'guest', label: '게스트' };
  const k = cloud.overall().key;
  const status = k === 'offline' || k === 'conflict' || k === 'synced' ? k : k === 'blocked' ? 'offline' : 'pending';
  return { status, label: cloud.id };
}

// 숫자 끝소리 받침 (영·일·삼·육·칠·팔 → 받침 있음)
const BATCHIM = new Set([0, 1, 3, 6, 7, 8]);
/** '슬롯 1, 3' + 마지막 숫자에 맞는 조사. slotsJosa([1, 3], '은', '는') → '슬롯 1, 3은', slotsJosa([2], '을', '를') → '슬롯 2를' */
export function slotsJosa(list, withBatchim, without) {
  const n = Math.abs(Number(list[list.length - 1])) % 10;
  return `슬롯 ${list.join(', ')}${BATCHIM.has(n) ? withBatchim : without}`;
}

/** 요약 한 줄 (예: '카엘 Lv.12 · 2장까지 돌파') */
export function summaryLine(sum) {
  if (!sum) return '';
  const ch = CHARACTERS[sum.charId];
  return `${ch?.name ?? sum.charId ?? '?'} Lv.${sum.level ?? 1} · ${chapterText(sum.chapter)}`;
}
export const chapterText = (c) => (c ? `${c}장까지 돌파` : '1장 진행 중');

/** 세이브 요약 카드 (초상화·캐릭터·레벨·직업·진행·플레이 시간·저장 시각·난이도) */
export function drawSummaryCard(ctx, r, sum, { title, sub = null, newer = false, empty = '기록 없음', t = 0, accent = GOLD } = {}) {
  frame(ctx, r.x, r.y, r.w, r.h, { accent: newer ? GOLD : '#8a6a3a', glow: newer ? 0.55 : 0, fill0: 'rgba(30,12,26,0.94)', edge: newer ? 0.9 : 0.55 });
  text(ctx, title, r.x + 16, r.y + 26, { size: 15, weight: 900, family: FONT.title, color: accent, ow: 3 });
  if (sub && !newer) text(ctx, sub, r.x + r.w - 14, r.y + 25, { size: 11, align: 'right', weight: 700, color: DIM, ow: 2 });
  if (newer) {
    ctx.font = `800 11px ${FONT.body}`;
    const w = ctx.measureText('더 최근 저장').width + 16, cx = r.x + r.w - 14 - w, cy = r.y + 11;
    ctx.fillStyle = rgba(GOLD, 0.16); ctx.fillRect(cx, cy, w, 20);
    ctx.strokeStyle = rgba(GOLD, 0.8); ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, w - 1, 19);
    text(ctx, '더 최근 저장', cx + w / 2, cy + 14, { size: 11, align: 'center', weight: 800, color: GOLD, ow: 2 });
  }
  if (!sum) {
    text(ctx, empty, r.x + r.w / 2, r.y + r.h / 2 + 10, { size: 16, align: 'center', weight: 800, family: FONT.title, color: '#8a7a70', ow: 3 });
    return;
  }
  const ch = CHARACTERS[sum.charId];
  const pr = { x: r.x + 14, y: r.y + 40, w: 78, h: r.h - 56 };
  portraitIn(ctx, assets.get(ch?.portrait), pr, { zoom: 1.5, fy: 0.12 });
  ctx.strokeStyle = rgba(accent, 0.7); ctx.lineWidth = 1.2; ctx.strokeRect(pr.x + 0.5, pr.y + 0.5, pr.w - 1, pr.h - 1);
  const tx = pr.x + pr.w + 12, maxW = r.x + r.w - 14 - tx;
  const diff = sum.difficulty ? getDiff(sum.difficulty) : null;
  text(ctx, ch?.name ?? sum.charId ?? '?', tx, r.y + 58, { size: 17, weight: 800, family: FONT.title, color: '#fff2dc', ow: 3, maxWidth: maxW });
  text(ctx, `Lv.${sum.level ?? 1}`, tx, r.y + 80, { size: 15, weight: 900, family: FONT.num, color: GOLD, ow: 3 });
  const cls = CLASSES[sum.classId]?.name ?? ch?.title ?? '';
  if (cls) text(ctx, cls, tx + 56, r.y + 80, { size: 12, weight: 700, color: '#d8c8b8', ow: 2, maxWidth: maxW - 56 });
  const rows = [
    ['진행', chapterText(sum.chapter)],
    ['플레이 시간', fmtPlay(sum.playTime ?? 0)],
    ['저장 시각', fmtDate(sum.savedAt ?? sum.clientSavedAt)],
  ];
  if (diff) rows.push(['난이도', diff.name]);
  rows.forEach(([k, v], i) => {
    const yy = r.y + 104 + i * 20;
    text(ctx, k, tx, yy, { size: 12, weight: 600, color: DIM, ow: 2 });
    text(ctx, v, r.x + r.w - 14, yy, { size: 12, align: 'right', weight: 800, color: k === '난이도' ? diff.color : BONE, ow: 2 });
  });
}

/** 시계 방향으로 도는 작은 로딩 표시 */
export function spinner(ctx, x, y, r, t, color = GOLD) {
  ctx.save();
  ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = rgba(color, 0.85 - i * 0.25);
    ctx.beginPath(); ctx.arc(x, y, r - i * 0.2, t * 5 + i * 2.1, t * 5 + i * 2.1 + 1.1); ctx.stroke();
  }
  ctx.restore();
}

// ───────────────────────── 충돌 선택 ─────────────────────────
export class CloudConflictScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.hideToasts = true; }
  enter({ slot = 1, mode = 'conflict', onDone } = {}) {
    Object.assign(this, { slot, mode, onDone });
    const raw = saves.read(slot);
    this.local = raw ? { ...summarize(raw), savedAt: raw.savedAt } : null;
    const c = cloud.view[slot]?.cloud;
    this.remote = c && !c.empty && c.summary ? { ...c.summary, savedAt: c.summary.clientSavedAt ?? c.savedAt, serverAt: c.savedAt } : null;
    this.btns = mode === 'download' ? [['down', '클라우드 기록 받기'], ['cancel', '취소']]
      : mode === 'upload' ? [['up', '이 기기 기록 올리기'], ['cancel', '취소']]
        : [['down', '클라우드 기록 받기'], ['up', '이 기기 기록 올리기'], ['cancel', '취소']];
    this.menu = new ListMenu(this.btns.length, { cols: this.btns.length, index: 0 });
    this.taps = new TapZones();
    this.busy = false; this.msg = null;
    audio.sfx('warning', { vol: 0.45 });
  }
  get message() {
    if (this.mode === 'download') return '클라우드 기록을 받으면 이 기기에 있던 이 슬롯의 기록은 사라집니다.';
    if (this.mode === 'upload') return '이 기기 기록을 올리면 클라우드에 있던 이 슬롯의 기록은 사라집니다.';
    return '이 슬롯은 이 기기와 클라우드에서 서로 다르게 진행되었습니다. 남길 기록을 고르세요. 고르지 않은 쪽의 기록은 사라집니다.';
  }
  async run(id) {
    if (this.busy) return;
    if (id === 'cancel') { this.close(false); return; }
    this.busy = true; this.msg = null;
    audio.sfx('menu_ok');
    const r = id === 'down' ? await cloud.download(this.slot) : await cloud.upload(this.slot, { force: true });
    if (this.done) return;
    this.busy = false;
    if (!r.ok) {
      this.msg = r.message ?? '처리하지 못했습니다.';
      audio.sfx('menu_cancel');
      return;
    }
    audio.sfx('save');
    this.game.toast(id === 'down' ? `슬롯 ${this.slot}에 클라우드 기록을 받았습니다` : `슬롯 ${this.slot}의 기록을 클라우드에 올렸습니다`, '#9fe8ff');
    this.close(true);
  }
  close(ok) {
    if (this.done) return;
    this.done = true;
    if (!ok) audio.sfx('menu_cancel');
    this.game.pop();
    this.onDone?.(ok);
  }
  update(dt) {
    if (this.busy) return;
    const tap = this.taps.hit();
    if (tap) { this.menu.index = Math.max(0, this.btns.findIndex((b) => b[0] === tap)); this.run(tap); return; }
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'confirm') this.run(this.btns[this.menu.index][0]);
    else if (r === 'cancel' || input.pressed('menu')) this.close(false);
  }
  render(ctx) {
    const vw = this.game.viewW, vh = this.game.viewH, t = this.game.time;
    const k = ease.outBack(clamp(this.t / 0.22, 0, 1));
    ctx.fillStyle = `rgba(2,0,4,${0.78 * clamp(this.t / 0.15, 0, 1)})`; ctx.fillRect(0, 0, vw, vh);
    const w = Math.min(780, vw - 60), h = 420, x = vw / 2 - w / 2, y = vh / 2 - h / 2 - 4;
    ctx.save();
    ctx.translate(vw / 2, vh / 2); ctx.scale(0.92 + 0.08 * k, 0.92 + 0.08 * k); ctx.translate(-vw / 2, -vh / 2);
    ctx.globalAlpha = clamp(this.t / 0.15, 0, 1);
    const acc = this.mode === 'conflict' ? '#ff5a6a' : GOLD;
    frame(ctx, x, y, w, h, { accent: acc, glow: 0.8 });
    const title = this.mode === 'conflict' ? '클라우드 기록 충돌' : this.mode === 'download' ? '클라우드 기록 받기' : '클라우드에 올리기';
    drawCloudIcon(ctx, vw / 2 - 118, y + 33, 30, this.mode === 'conflict' ? 'conflict' : this.mode === 'download' ? 'cloud' : 'local', t);
    text(ctx, title, vw / 2 + 12, y + 40, { size: 22, align: 'center', weight: 800, family: FONT.title, color: this.mode === 'conflict' ? '#ff9a9a' : '#ffe7a0', ow: 3 });
    text(ctx, `슬롯 ${this.slot}`, x + 22, y + 28, { size: 12, weight: 800, family: FONT.num, color: GOLD, ow: 2 });
    ornament(ctx, vw / 2, y + 56, 300, { color: acc });
    const lines = wrap(ctx, this.message, w - 60, 14, 500);
    lines.slice(0, 2).forEach((l, i) => text(ctx, l, vw / 2, y + 82 + i * 20, { size: 14, align: 'center', color: BONE, ow: 2 }));
    // 두 카드
    const cw = (w - 60) / 2, ch = 196, cy = y + 116;
    const lt = this.local?.savedAt ?? 0, rt = this.remote?.savedAt ?? 0;
    drawSummaryCard(ctx, { x: x + 20, y: cy, w: cw, h: ch }, this.local, { title: '이 기기', sub: 'THIS DEVICE', newer: !!this.local && lt > rt, t });
    drawSummaryCard(ctx, { x: x + 40 + cw, y: cy, w: cw, h: ch }, this.remote, { title: '클라우드', sub: 'CLOUD', newer: !!this.remote && rt > lt, t, accent: '#9fd8ff', empty: '클라우드 기록 없음' });
    // 버튼
    const n = this.btns.length, gap = 14, bw = Math.min(210, (w - 40 - (n - 1) * gap) / n), bh = 48;
    const bx = vw / 2 - (n * bw + (n - 1) * gap) / 2, by = y + h - 72;
    this.menu.clearHits(); this.taps.clear();
    this.btns.forEach(([id, label], i) => {
      const r = { x: bx + i * (bw + gap), y: by, w: bw, h: bh };
      gbutton(ctx, r, label, { selected: this.menu.index === i && !this.busy, disabled: this.busy, size: 15, accent: id === 'cancel' ? GOLD : acc, zones: this.taps, id });
    });
    if (this.busy) { spinner(ctx, vw / 2 - 64, by - 14, 8, t); text(ctx, '처리하는 중…', vw / 2 - 48, by - 9, { size: 13, weight: 700, color: DIM, ow: 2 }); }
    else if (this.msg) text(ctx, this.msg, vw / 2, by - 10, { size: 13, align: 'center', weight: 700, color: '#ff8a8a', ow: 2, maxWidth: w - 40 });
    else if (!input.touchMode) text(ctx, '←→ 선택   Z 결정   X 취소', vw / 2, by - 10, { size: 11, align: 'center', color: DIM, ow: 2 });
    ctx.restore();
  }
}
