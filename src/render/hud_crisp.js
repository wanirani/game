// HUD 선명 칸 (hudfix) — owner: HUD
// 문제 (검토 의견): HUD-REDO 로 터치 덧캔버스(#tpadcv)만 기기 해상도가 되어, 게임 캔버스에 그리는 상시 HUD(빠른 칸 금속 테·체력 숫자·
//   재화·퀘스트 칸)는 game.dpr(폴드 보통 품질 1.46 = 기기의 73 %)로 그려져 바로 옆 버튼보다 흐렸다.
// 해결: 터치로 플레이하는 동안 상시 HUD 칸을 덧캔버스와 같은 DPR 로 작은 캔버스에 굽고(내용이 바뀔 때만), touchpad.hudLayer 로
//   넘겨 덧캔버스가 버튼 아래에 1:1 로 붙인다. 게임 캔버스(전체 화면)를 키우지 않으므로 그리기 비용은 칸 넓이만큼만 는다.
// 켜지는 때 (crispActive): ctx 가 게임 캔버스이고, 터치 입력 · 맨 위 장면이 그 월드의 게임플레이 장면 · 패드를 숨기지 않음 ·
//   HUD 숨김(각성 연출) 아님 · 큰 지도 닫힘 — game.syncPad 가 패드를 보이는 조건과 같다 (그래서 덧캔버스가 보일 때만 켜진다).
//   덧캔버스가 그 칸을 아직 한 번도 붙이지 않았으면(처음·다시 나타날 때) 그 프레임은 게임 캔버스에도 그린다 → 빈 프레임 없음.
// 꺼져 있으면 (키보드·패드·데스크톱, 일시정지 화면 아래, 시험 캔버스) 예전처럼 ctx 에 바로 그린다.
// API
//   crispActive(ctx, world) → bool
//   crisp(ctx, world, id, rect(논리 px), key(숫자), draw(c)) — draw 는 논리 좌표로 그린다 (c 의 변환이 맞춰져 있다)
//   hashStart() / hashNum(v) / hashStr(s) → key 를 만드는 할당 없는 해시
//   crispOnly: crisp(..., { only: true }) 처럼 게임 캔버스 밖(아래 띠)에 놓을 칸은 꺼져 있으면 그리지 않는다
import { touchpad } from '../core/touchpad.js';
import { PAD_SCENES } from '../core/game.js';

const LAY = new Map();   // id → { c, key, ver }
// 칸 캔버스는 모듈을 불러올 때 미리 만든다 (스테이지 도중 새 캔버스 0 — MASTER_PLAN §5.2). 칸 id 는 hud.js 의 7가지 + 마을 town_tr (hub.js)
const POOL = [];
for (let i = 0; i < 10; i++) POOL.push(mkCanvas());   // [auto] +2: 마을 오른쪽 위 판(town_tr) · 여유
export const HUD_CRISP_STATS = { bakes: 0 };

let H = 0;
/** 해시 시작 (FNV-1a 32) */
export function hashStart() { H = 2166136261; return H; }
/** 숫자 하나 섞기 (0.01 단위) */
export function hashNum(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : v === true ? 1 : v ? 7 : 3;
  H = Math.imul(H ^ (n & 0xffff), 16777619); H = Math.imul(H ^ ((n >>> 16) & 0xffff), 16777619);
  return H;
}
/** 문자열 섞기 */
export function hashStr(s) {
  s = s == null ? '' : String(s);
  for (let i = 0; i < s.length; i++) H = Math.imul(H ^ s.charCodeAt(i), 16777619);
  H = Math.imul(H ^ 0xff, 16777619);
  return H;
}

/** 지금 이 ctx 의 HUD 를 덧캔버스 선명 칸으로 그릴까 (game.syncPad 가 패드를 보이는 조건과 같다) */
export function crispActive(ctx, world) {
  const g = world?.game;
  if (!g || ctx !== g.ctx || world.hudHidden || g.hudMapBig || g.portraitLocked) return false;
  if (g.inputMode !== 'touch') return false;
  const top = g.top;
  if (!top || top.world !== world || top.hidePad || !(top.showPad || PAD_SCENES.has(top.name)) || top.name === 'ultCutin') return false;
  return touchpad.crispDpr?.() > 0;
}

/**
 * 칸 하나. r = 논리 px 사각형 (그림이 넘치는 만큼 여유를 넣어 줄 것), key = 내용 해시 (같으면 다시 굽지 않는다).
 * opts.only: 꺼져 있으면 그리지 않는다 (게임 캔버스 밖 칸). → 덧캔버스로 갔으면 true
 */
export function crisp(ctx, world, id, r, key, draw, opts = null) {
  if (!r || !(r.w > 0 && r.h > 0) || !crispActive(ctx, world)) { if (!opts?.only) draw(ctx); return false; }
  const g = world.game, dpr = touchpad.crispDpr();
  const cr = g.canvasRect, cs = cr.h / g.viewH, k = dpr * cs;
  const X0 = Math.floor((cr.x + r.x * cs) * dpr), Y0 = Math.floor((cr.y + r.y * cs) * dpr);
  const W = Math.max(1, Math.ceil((cr.x + (r.x + r.w) * cs) * dpr) - X0), Hh = Math.max(1, Math.ceil((cr.y + (r.y + r.h) * cs) * dpr) - Y0);
  let l = LAY.get(id);
  if (!l) { l = { c: POOL.shift() ?? null, key: NaN, ver: 0, X0: 0, Y0: 0, W: 0, H: 0, dpr: 0 }; LAY.set(id, l); }
  if (!l.c) { if (!opts?.only) draw(ctx); return false; }
  if (l.key !== key || l.X0 !== X0 || l.Y0 !== Y0 || l.W !== W || l.H !== Hh || l.dpr !== dpr) {
    const c = l.c;
    if (c.width !== W || c.height !== Hh) { c.width = W; c.height = Hh; }
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, Hh);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.setTransform(k, 0, 0, k, cr.x * dpr - X0, cr.y * dpr - Y0);
    try { draw(x); } catch (e) { console.error('[hud_crisp]', id, e); }
    l.key = key; l.X0 = X0; l.Y0 = Y0; l.W = W; l.H = Hh; l.dpr = dpr; l.ver++;
    HUD_CRISP_STATS.bakes++;
  }
  touchpad.hudLayer(id, l.c, X0, Y0, l.ver, dpr);
  if (!touchpad.hudLayerShown(id) && !opts?.only) draw(ctx);   // 덧캔버스가 아직 붙이지 않았다 → 이번 프레임은 게임 캔버스에도
  return true;
}

function mkCanvas() { try { if (typeof document === 'undefined' || !document.createElement) return null; const c = document.createElement('canvas'); c.width = c.height = 1; return c; } catch { return null; } }
