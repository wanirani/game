// 퀘스트 추적 칸 (HUD-REDO, /tmp/claude-0/g10/hudredo_design.md §3) — owner: HUD
// 자리: hud_layout 의 L.quest (폴드 배치: 오른쪽 위 아이콘 줄 아래). 보스 바가 보이거나 연출 중(world.cutscene)이면 그리지 않는다.
//  접힘(기본): 머리 줄 한 줄 — ▸ + 퀘스트 그림 + 주 퀘스트 이름 + 진행 (예: '구울 소탕 의뢰 7/12')
//  펼침: 머리 줄 + 진행 중인 퀘스트 ≤ 3줄 (주 퀘스트 먼저, 금빛)
// 탭 (터치, game.hudTaps → touchpad → game.hudTapFn): 머리 줄 왼쪽 ▸ 칸 = 접기/펼치기 ('qt_toggle'), 나머지 = 메뉴 › 퀘스트 탭 ('qt_open').
//  스테이지 목표는 방 안 좌표가 없어 길 안내 화살표 대신 퀘스트 탭을 연다.
// 그리기: 줄 내용(0.5초마다 다시 읽음)·접힘·크기·배율·글꼴 세대가 바뀔 때만 작은 캔버스에 굽고, 매 프레임 drawImage 한 번 (그라디언트 없음).
// 접힘 상태는 이 기기의 localStorage 'bn.qt' ('1' 접힘 / '0' 펼침) — 세이브와 무관한 화면 취향.
import { text, font, FONT, fontEpoch } from '../core/ui.js';
import { activeQuests, questProgress } from '../game/quests.js';
import { drawArtIcon } from './hud.js';

const mkCanvas = () => { try { if (typeof document === 'undefined' || !document.createElement) return null; const c = document.createElement('canvas'); c.width = c.height = 1; return c; } catch { return null; } };
const Q = { collapsed: null, rows: [], t: -1e9, state: null, key: '', c: mkCanvas(), a: 0, w: 0, h: 0 };
export const QUEST_TRACKER_STATS = { bakes: 0 };

/** 접혀 있나 (기본 접힘 — 게임 화면을 덜 가리게) */
export function questCollapsed() {
  if (Q.collapsed == null) { try { const v = localStorage.getItem('bn.qt'); Q.collapsed = v == null ? true : v === '1'; } catch { Q.collapsed = true; } }
  return Q.collapsed;
}
export function toggleQuestTracker() {
  Q.collapsed = !questCollapsed();
  try { localStorage.setItem('bn.qt', Q.collapsed ? '1' : '0'); } catch { /* 저장 못 함 — 이번 실행만 */ }
  Q.key = '';
}
/** 진행 중인 퀘스트 줄 (≤ 3, 주 퀘스트 먼저) — 0.5초마다 다시 센다 */
function questRows(state, t) {
  if (Q.state === state && t - Q.t < 0.5 && t >= Q.t) return Q.rows;
  Q.state = state; Q.t = t;
  const out = [];
  try {
    for (const q of activeQuests(state)) {
      if (out.length >= 3) break;
      const p = questProgress(state, q.id);
      out.push({ name: q.name ?? q.id, main: q.kind === 'main', prog: p.done ? '완료' : `${p.cur}/${p.need}`, done: !!p.done });
    }
  } catch { /* 퀘스트 데이터 없음 */ }
  Q.rows = out;
  return out;
}
/** 줄 높이·글자 (questPanelH(F) 와 같은 계산) */
function metrics(F) { const fs = Math.max(12, F); return { fs, head: Math.round(fs + 14), row: Math.round(fs + 6) }; }

/** 지금 ctx 변환의 기기 배율 (0.25 단위 올림, 1–4) */
function devScale(ctx) {
  let a = 1;
  try { const m = ctx.getTransform(); a = Math.hypot(m.a, m.b) || 1; } catch { /* 1 */ }
  return Math.min(4, Math.max(1, Math.ceil(a * 4 - 0.01) / 4));
}

/**
 * 퀘스트 칸을 그린다. r = L.quest, F = 글자 하한. → 실제로 그린 칸 {x,y,w,h, head} | null (탭 자리용; 퀘스트가 없으면 null)
 */
export function drawQuestTracker(ctx, r, world, F = 0) {
  const state = world?.state ?? world?.game?.state;
  if (!r || !state || r.w < 80) return null;
  const rows = questRows(state, world.time ?? 0);
  if (!rows.length) return null;
  const col = questCollapsed();
  const M = metrics(F);
  const h = col ? M.head : Math.min(r.h, M.head + rows.length * M.row + 4);
  const a = devScale(ctx);
  const key = `${col ? 1 : 0}|${r.w}|${h}|${a}|${fontEpoch}|${M.fs}|` + rows.map((x) => `${x.main ? 1 : 0}${x.name}:${x.prog}`).join('|');
  const c = Q.c;
  if (!c) { paint(ctx, r.x, r.y, r.w, h, rows, col, M); return { x: r.x, y: r.y, w: r.w, h, head: M.head }; }
  if (key !== Q.key) {
    const W = Math.ceil(r.w * a), H = Math.ceil(h * a);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    g.setTransform(a, 0, 0, a, 0, 0);
    paint(g, 0, 0, r.w, h, rows, col, M);
    Q.key = key; Q.a = a; Q.w = r.w; Q.h = h;
    QUEST_TRACKER_STATS.bakes++;
  }
  ctx.drawImage(c, 0, 0, c.width, c.height, r.x, r.y, Q.w, Q.h);
  return { x: r.x, y: r.y, w: r.w, h, head: M.head };
}

/** 칸 칠하기 (구울 때 한 번): 어두운 판 + 금테 + 머리 줄(▸/▾ · 퀘스트 그림 · 주 퀘스트) + 펼친 줄 */
function paint(g, x, y, w, h, rows, col, M) {
  g.save();
  g.fillStyle = 'rgba(10,4,10,0.74)'; roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, 6); g.fill();
  g.lineWidth = 1; g.strokeStyle = 'rgba(214,170,110,0.6)'; g.stroke();
  // 머리 줄: 접기 화살표 칸 (탭 자리 'qt_toggle')
  const hy = y + M.head / 2;
  g.fillStyle = 'rgba(232,200,114,0.16)'; roundRect(g, x + 3, y + 3, 26, M.head - 6, 4); g.fill();
  g.fillStyle = '#e8c872';
  g.beginPath();
  if (col) { g.moveTo(x + 12, hy - 5); g.lineTo(x + 20, hy); g.lineTo(x + 12, hy + 5); } else { g.moveTo(x + 11, hy - 3); g.lineTo(x + 21, hy - 3); g.lineTo(x + 16, hy + 4); }
  g.closePath(); g.fill();
  const ix = x + 34 + M.fs * 0.55;
  if (!drawArtIcon(g, 'ui_quest', ix, hy, M.fs + 6)) { g.fillStyle = '#e8c872'; g.fillRect(ix - 4, hy - 6, 8, 12); }
  const first = rows[0];
  const tx = ix + M.fs * 0.75 + 4, maxR = x + w - 8;
  g.font = font(M.fs, 800, FONT.num);
  const pw = g.measureText(first.prog).width;
  text(g, first.name, tx, hy + Math.round(M.fs * 0.36), { size: M.fs, weight: 800, color: first.main ? '#f3d38a' : '#e8dcc8', maxWidth: Math.max(20, maxR - tx - pw - 8) });
  text(g, first.prog, maxR, hy + Math.round(M.fs * 0.36), { size: M.fs, align: 'right', weight: 800, family: FONT.num, color: first.done ? '#9fe0a0' : '#fff2c0' });
  if (!col) {
    g.fillStyle = 'rgba(214,170,110,0.35)'; g.fillRect(x + 6, y + M.head, w - 12, 1);
    for (let i = 1; i < rows.length; i++) {
      const rw = rows[i], ry = y + M.head + (i - 1) * M.row + M.row / 2 + 2, by = ry + Math.round(M.fs * 0.36);
      g.fillStyle = rw.main ? '#e8c872' : 'rgba(232,220,200,0.7)'; g.beginPath(); g.arc(x + 14, ry, 2.5, 0, Math.PI * 2); g.fill();
      g.font = font(M.fs, 700, FONT.num);
      const qw = g.measureText(rw.prog).width;
      text(g, rw.name, x + 22, by, { size: M.fs, weight: 700, color: rw.main ? '#f3d38a' : '#e0d4c0', maxWidth: Math.max(20, maxR - x - 22 - qw - 8) });
      text(g, rw.prog, maxR, by, { size: M.fs, align: 'right', weight: 700, family: FONT.num, color: rw.done ? '#9fe0a0' : '#fff2c0' });
    }
  }
  g.restore();
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
