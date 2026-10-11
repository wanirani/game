// 원형 미니맵 (hud_mobile §3 왼쪽 위) — owner: HUD-TOUCH
// drawMinimap(ctx, r, world, ring?)  r = 칸 {x,y,w,h} (원 지름 = min(w,h)), ring = 테 그림 (hud.js hudArt('ring_map')) | null
//   지금 방 + 이웃 방(출구 사슬, 왼·오른쪽 2칸, 위·아래 1칸)을 방 모양(타일 가로×세로 비율) 상자로, 보스방은 붉게 + 해골 표시,
//   지금 방 안의 보물상자($)·세이브(S)·여신상(G) 표시. 방·크기·글꼴이 바뀔 때만 작은 캔버스에 굽고(원형 마스크 포함),
//   매 프레임에는 그 그림 + 영웅 점(+ 보스 맥동 점) + 테만 붙인다 (그라디언트·필터 없음).
// drawBigMap(ctx, world, vw, vh) → 큰 지도 사각형 (game.hudMapBig 일 때 화면 가운데, 같은 그림을 크게 + 이웃 방 더 멀리) — 누르면 닫힌다 (touchpad)
import { TAU } from '../core/math.js';
import { text, FONT } from '../core/ui.js';

const mk = () => { try { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = c.height = 1; return c; } catch { return null; } };
const SMALL = { c: mk(), key: '' };
const BIG = { c: mk(), key: '' };
export const MINIMAP_STATS = { bakes: 0 };

const DIRS = [['exitLeft', -1, 0], ['exitRight', 1, 0], ['exitUp', 0, -1], ['exitDown', 0, 1]];
const COL = { room: 'rgba(92,36,40,0.9)', roomEdge: 'rgba(214,170,110,0.75)', cur: 'rgba(168,52,52,0.95)', curEdge: '#f3d38a', boss: 'rgba(140,10,24,0.95)', link: 'rgba(214,170,110,0.6)', bg: 'rgba(10,4,8,0.82)' };

/** 방 배치: 지금 방에서 출구 사슬을 따라 (dx, dy) 칸 좌표 → [{id, room, gx, gy, cur}] */
function layoutRooms(stage, roomId, reachH, reachV) {
  const rooms = stage?.rooms ?? {};
  const out = [], seen = new Set([roomId]);
  const q = [[roomId, 0, 0]];
  while (q.length) {
    const [id, gx, gy] = q.shift();
    const room = rooms[id];
    if (!room) continue;
    out.push({ id, room, gx, gy, cur: id === roomId });
    for (const [k, dx, dy] of DIRS) {
      const nb = room[k];
      if (!nb || seen.has(nb) || !rooms[nb]) continue;
      const nx = gx + dx, ny = gy + dy;
      if (Math.abs(nx) > reachH || Math.abs(ny) > reachV) continue;
      seen.add(nb); q.push([nb, nx, ny]);
    }
  }
  return out;
}
/** 방 하나의 표시 크기 (타일 비율, 칸 u 안에) */
function roomBox(room, u) {
  const h = room.map?.length || 16, w = room.map?.[0]?.length || 40;
  const a = w / h;
  return a >= 1 ? { w: u, h: Math.max(u * 0.28, u / a) } : { w: Math.max(u * 0.28, u * a), h: u };
}
/** 지금 방 안의 표시물 (보물상자·세이브·여신상) — 방마다 한 번 찾는다 */
const MARKS = new WeakMap();
function marksOf(room) {
  let m = MARKS.get(room);
  if (m) return m;
  m = [];
  const rows = room.map ?? [], H = rows.length || 1, W = rows[0]?.length || 1;
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      if (ch === '$' || ch === 'S' || ch === 'G') m.push({ ch, fx: (x + 0.5) / W, fy: (y + 0.5) / H });
    }
  }
  MARKS.set(room, m);
  return m;
}

/** 굽기: 원 안에 방 상자들 (지름 D 논리 px, 배율 a). 돌려주는 정보: 지금 방 상자 {x,y,w,h} (영웅 점 자리) */
function bake(slot, world, D, a, reach) {
  const c = slot.c;
  const stage = world.stage, roomId = world.roomId;
  const key = `${stage?.id}|${roomId}|${D}|${a}|${reach}`;
  if (slot.key === key) return slot.cur;
  slot.key = key; MINIMAP_STATS.bakes++;
  const P = Math.ceil(D * a);
  if (c.width !== P || c.height !== P) { c.width = P; c.height = P; }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, P, P);
  g.setTransform(a, 0, 0, a, 0, 0);
  const R0 = D / 2;
  g.fillStyle = COL.bg; g.beginPath(); g.arc(R0, R0, R0, 0, TAU); g.fill();
  // 바탕 격자 (옛 양피지 느낌의 가는 선)
  g.strokeStyle = 'rgba(214,170,110,0.08)'; g.lineWidth = 1;
  for (let i = 1; i < 6; i++) { const v = (D * i) / 6; g.beginPath(); g.moveTo(v, 0); g.lineTo(v, D); g.moveTo(0, v); g.lineTo(D, v); g.stroke(); }
  const list = layoutRooms(stage, roomId, reach, Math.max(1, reach - 1));
  const u = D * (reach >= 3 ? 0.2 : 0.36), step = u * 1.12;
  const pos = new Map();
  for (const e of list) {
    const bx = roomBox(e.room, u);
    pos.set(e.id, { x: R0 + e.gx * step - bx.w / 2, y: R0 + e.gy * step - bx.h / 2, w: bx.w, h: bx.h, e });
  }
  // 연결선
  g.strokeStyle = COL.link; g.lineWidth = Math.max(1.5, D * 0.012);
  for (const [, b] of pos) {
    for (const [k] of DIRS) {
      const nb = b.e.room[k], o = nb && pos.get(nb);
      if (!o) continue;
      g.beginPath(); g.moveTo(b.x + b.w / 2, b.y + b.h / 2); g.lineTo(o.x + o.w / 2, o.y + o.h / 2); g.stroke();
    }
  }
  let cur = null;
  for (const [, b] of pos) {
    const boss = !!b.e.room.boss;
    g.fillStyle = b.e.cur ? COL.cur : boss ? COL.boss : COL.room;
    g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = b.e.cur ? COL.curEdge : COL.roomEdge; g.lineWidth = b.e.cur ? 2 : 1;
    g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    if (boss) skull(g, b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) * 0.36);
    // 출구 표시 (방 가장자리의 작은 문)
    for (const [k, dx, dy] of DIRS) {
      if (!b.e.room[k]) continue;
      const ex = b.x + b.w / 2 + (dx * b.w) / 2, ey = b.y + b.h / 2 + (dy * b.h) / 2;
      g.fillStyle = '#f3d38a'; g.fillRect(ex - 2, ey - 2, 4, 4);
    }
    if (b.e.cur) {
      cur = { x: b.x, y: b.y, w: b.w, h: b.h };
      for (const m of marksOf(b.e.room)) {
        const mx = b.x + m.fx * b.w, my = b.y + m.fy * b.h;
        g.fillStyle = m.ch === '$' ? '#ffd84a' : m.ch === 'S' ? '#8ec8ff' : '#9fe8a0';
        g.beginPath(); g.arc(mx, my, Math.max(1.8, D * 0.016), 0, TAU); g.fill();
      }
    }
  }
  // 원형 마스크 (바깥은 투명 — 굽는 때만)
  g.globalCompositeOperation = 'destination-in';
  g.beginPath(); g.arc(R0, R0, R0 - 1, 0, TAU); g.fill();
  g.globalCompositeOperation = 'source-over';
  slot.cur = cur;
  return cur;
}
function skull(g, x, y, s) {
  g.fillStyle = '#f3e2b8';
  g.beginPath(); g.arc(x, y - s * 0.15, s * 0.55, 0, TAU); g.fill();
  g.fillRect(x - s * 0.32, y + s * 0.2, s * 0.64, s * 0.32);
  g.fillStyle = '#3a0610';
  g.beginPath(); g.arc(x - s * 0.22, y - s * 0.18, s * 0.15, 0, TAU); g.arc(x + s * 0.22, y - s * 0.18, s * 0.15, 0, TAU); g.fill();
}
function scaleOf(ctx) {
  try { const m = ctx.getTransform(); return Math.min(3, Math.max(1, Math.ceil(Math.hypot(m.a, m.b) * 2) / 2)); } catch { return 1; }
}
/** 영웅·보스 점 (매 프레임) */
function dots(ctx, world, x, y, cur, D) {
  if (!cur) return;
  const map = world.map, p = world.player;
  if (map?.pxW > 0 && p) {
    const px = x + cur.x + (p.cx ?? p.x) / map.pxW * cur.w, py = y + cur.y + (p.cy ?? p.y) / map.pxH * cur.h;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(px, py, Math.max(3, D * 0.03) + 1.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(px, py, Math.max(3, D * 0.03), 0, TAU); ctx.fill();
  }
  const b = world.boss;
  if (b && !b.dead && map?.pxW > 0) {
    const bx = x + cur.x + (b.cx ?? b.x) / map.pxW * cur.w, by = y + cur.y + (b.cy ?? b.y) / map.pxH * cur.h;
    const k = 0.6 + 0.4 * Math.sin((world.rt ?? world.time ?? 0) * 6);
    ctx.fillStyle = `rgba(255,40,60,${k.toFixed(2)})`; ctx.beginPath(); ctx.arc(bx, by, Math.max(3.5, D * 0.034), 0, TAU); ctx.fill();
  }
}

export function drawMinimap(ctx, r, world, ring = null) {
  const D = Math.min(r.w, r.h);
  if (!world?.stage || D < 20) return;
  const x = r.x + (r.w - D) / 2, y = r.y + (r.h - D) / 2;
  let cur = null;
  if (SMALL.c) {
    cur = bake(SMALL, world, Math.round(D * 0.84), scaleOf(ctx), 2);
    const d = Math.round(D * 0.84), o = (D - d) / 2;
    ctx.drawImage(SMALL.c, x + o, y + o, d, d);
    dots(ctx, world, x + o, y + o, cur, d);
  }
  if (ring) ctx.drawImage(ring, x - D * 0.04, y - D * 0.04, D * 1.08, D * 1.08);
  else { ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + D / 2, y + D / 2, D * 0.43, 0, TAU); ctx.stroke(); }
}

/** 큰 지도 (game.hudMapBig): 화면 가운데 → 그린 사각형 (탭 자리) */
export function drawBigMap(ctx, world, vw, vh, ring = null) {
  const D = Math.round(Math.min(vw, vh) * 0.62);
  const x = Math.round((vw - D) / 2), y = Math.round((vh - D) / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, vw, vh);
  let cur = null;
  if (BIG.c) {
    cur = bake(BIG, world, D, scaleOf(ctx), 3);
    ctx.drawImage(BIG.c, x, y, D, D);
    dots(ctx, world, x, y, cur, D);
  }
  if (ring) ctx.drawImage(ring, x - D * 0.05, y - D * 0.05, D * 1.1, D * 1.1);
  const st = world.stage;
  if (st?.name) text(ctx, st.name, vw / 2, y - D * 0.06, { size: 22, align: 'center', weight: 800, family: FONT.title, color: '#f3d38a', ow: 3 });
  return { x, y, w: D, h: D };
}
