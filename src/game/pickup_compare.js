// 획득 즉시 비교 (docs/specs/qol_equip.md §3) — owner: QOL
//  장비를 주우면(bus 'itemPicked') 그 획득 토스트("획득: …", world.js)에 지금 영웅 기준 ▲/▼/= 와 종합 점수 차를 붙인다
//  (같은 처리 안에서 뜬 토스트를 찾아 덧붙이고, 없으면 — 보상·보관함 — 새 토스트). 새 단축키는 없다:
//   ▲ 토스트를 터치·클릭하면 「바로 장착」. 전투 중(근처에 적 · 보스전 · 2초 안에 맞음)에는 예약만 하고,
//   적이 없는 상태가 2초 이어지면 장착한다.
//  그 밖: 새로 얻은 장비에 NEW 표시(inst.isNew — 가방에서 한 번 고르면 사라짐), 스테이지 입장 때 가방 남은 칸 ≤ 5 경고
//  (토스트를 누르면 메뉴 › 인벤토리 › 일괄 처분), 이번 스테이지에서 얻은 장비 목록(results.js 가 읽는다).
//  [auto] 패드·키보드도 「바로 장착」: 액션 'equipNow' (키보드 N · 패드 ↑ 0.4초 길게 — controls.js PAD_GESTURE) = 가장 최근 ▲ 토스트를 누른 것과 같다.
//         안내 글자는 지금 기기에 맞춰 바뀐다 (터치 '눌러서 장착' · 키보드 '클릭 · N: 장착' · 패드 '↑ 길게: 장착')
//  game.js 의 토스트 그리기 뒤에 한 번 끼어들어(drawToasts 감싸기) 토스트 줄 사각형을 탭 등록부(ui.taps)에 올린다 —
//  가상 패드는 등록된 영역 위의 손가락을 캔버스 탭으로 넘긴다.
//  공개: stageGear() → 이번 스테이지에서 얻은 장비 uid 목록 · requestDispose() / takeDisposeRequest() · isSafe(game) · equipNow(game, uid)
import { bus } from '../core/events.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { taps } from '../core/ui.js';
import { ITEMS, isEquipment, itemName } from '../data/items.js';
import { CHARACTERS } from '../data/characters.js';
import { findItem, canEquip, equipItem, isEquipped, freeSlots } from './inventory.js';
import { gearDelta, gearSettings, markOf } from './gear_score.js';
import { hudLayout } from '../render/hud_layout.js';
import { labelOf } from '../core/prompts.js';   // [auto] 「바로 장착」 키 글자

const S = { log: [], pending: null, lastDanger: -1e9, timer: null, dispose: false, burst: 0, eqT: -99 };   // eqT: 마지막으로 처리한 'equipNow' 누름 시각 (input.time)
const BURST = 2;   // 한 번에 여러 장비가 들어오면(보관함에서 꺼내기·보상 묶음) 앞의 2개만 토스트 비교 (토스트 줄을 덮지 않게)
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const SAFE_MS = 2000, NEAR = 520;

export function stageGear() { return S.log.slice(); }
export function requestDispose() { S.dispose = true; }
export function takeDisposeRequest() { const v = S.dispose; S.dispose = false; return v; }

/** 지금 장착해도 안전한가: 마을·메뉴 밖 장면이면 늘 / 스테이지는 보스전이 아니고, 가까이 적이 없고, 2초 안에 맞지 않았을 때 */
export function isSafe(g, t = now()) {
  const w = g?.world;
  if (!w || w.mode === 'town' || !w.player) return true;
  let danger = !!(w.bossActive && !w.cleared);
  if (!danger) {
    const p = w.player;
    try {
      for (const e of w.enemies?.() ?? []) {
        if (e.harmless || e.invuln) continue;
        if (Math.abs(e.cx - p.cx) < NEAR && Math.abs(e.cy - p.cy) < NEAR * 0.7) { danger = true; break; }
      }
    } catch { /* 월드 모양이 다르면 안전으로 */ }
  }
  if (danger) S.lastDanger = t;
  return t - S.lastDanger >= SAFE_MS;
}

/** 지금 영웅에게 장착 (장신구는 비교에서 고른 칸). 반환 true = 장착함 */
export function equipNow(g, uid, slot = null) {
  const st = g?.state;
  const hero = st?.heroes?.[st?.charId];
  const it = findItem(st, uid);
  if (!hero || !it) return false;
  const chk = canEquip(st, hero, it);
  if (!chk.ok) { g.toast?.(chk.reason, '#ff8a7a'); return false; }
  if (isEquipped(st, uid) === hero.charId) return true;
  equipItem(st, hero, uid, slot);
  delete it.isNew;
  try { g.world?.player?.refreshStats?.(); } catch (e) { console.warn(e); }
  audio.sfx('item');
  g.toast?.(`장착: ${itemName(it)}`, '#7ee07e', 2.2);
  return true;
}

function watch(g) {
  if (S.timer) return;
  S.timer = setInterval(() => {
    const q = S.pending;
    if (!q || g.world !== q.world || !findItem(g.state, q.uid)) { S.pending = null; clearInterval(S.timer); S.timer = null; return; }
    if (!isSafe(g)) return;
    S.pending = null; clearInterval(S.timer); S.timer = null;
    equipNow(g, q.uid, q.slot);
  }, 250);
}

function onTap(g, q) {
  if (q.action === 'dispose') {
    requestDispose();
    if (g.registry?.menu) g.push('menu', { world: g.world, tab: 'inventory' });
    return;
  }
  if (!isSafe(g)) {
    S.pending = { uid: q.uid, slot: q.slot, world: g.world };
    audio.sfx('menu_ok');
    g.toast('적이 없는 곳에서 장착합니다', '#e8dcc8', 2);
    watch(g);
    return;
  }
  equipNow(g, q.uid, q.slot);
}

// ── 토스트 줄 사각형 → 탭 등록 · 판정 (game.drawToasts 뒤) ──
/** 토스트가 HUD 토스트 줄에 그려지는 장면인가 (스테이지 · 마을) — 메뉴·상점처럼 자리를 따로 잡는 장면은 아니다 */
function canTap(g, top = g?.top) {
  return !!g?.hudScene?.()?.world && !!top && top.toastX === undefined && top.toastY === undefined && !top.uiScale;
}
function afterToasts(g, top) {
  if (!canTap(g, top)) return;
  const base = g.hudScene();
  if (!g.toasts.some((t) => t._qol)) return;
  // [auto] 'equipNow' (키보드·패드): 가장 최근의 ▲ 토스트 하나를 누른 것으로 (한 번 누름 = 한 번 — 프레임마다 다시 보지 않게 누른 시각으로 가린다)
  const pt = input.pressTime?.equipNow ?? -99;
  if (pt > S.eqT && (input.time ?? 0) - pt < 0.35) {   // 한 스텝짜리 몸짓 탭(↑ 길게)도 그 프레임에 그리기 전에 끝날 수 있다 → down 이 아니라 누른 시각
    S.eqT = pt;
    for (let i = g.toasts.length - 1; i >= 0; i--) {
      const t = g.toasts[i];
      if (t._qol && !t._qol.done && t._qol.uid) { t._qol.done = true; t.t = Math.min(t.t, 0.3); onTap(g, t._qol); break; }
    }
  }
  const L = hudLayout(base.world, g.viewW, g.viewH);
  const rows = L?.toastRows | 0;
  let r = 0;
  for (const t of g.toasts) {
    if (r >= rows || t.shown === false) break;
    const r0 = L.toast(r);
    if (!r0 || r0.hidden) break;
    const n = Math.max(1, t._lines?.length || 1);
    if (t._qol && !t._qol.done) {
      const pl = t._plan, l = Number.isFinite(pl?.l) ? pl.l : r0.l, rr = Number.isFinite(pl?.r) ? pl.r : r0.r;   // hudfix: 줄마다 폭이 다르다 → 그 토스트가 실제로 쓴 가로 범위
      const rect = { x: l, y: r0.top, w: rr - l, h: n * r0.h };
      taps.add('qol.toast', rect, { kind: 'primary', src: 'qol.pickup' });
      const p = input.pointer;
      if (p?.tapped && p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
        t._qol.done = true;
        t.t = Math.min(t.t, 0.3);
        onTap(g, t._qol);
      }
    }
    r += n;
  }
}
function hook(g) {
  if (!g || g._qolToastHook || typeof g.drawToasts !== 'function') return;
  g._qolToastHook = true;
  const orig = g.drawToasts;
  g.drawToasts = function drawToastsQol(ctx, top) {
    try { hintSync(this, top); } catch (e) { console.warn('[pickup_compare]', e); }
    orig.call(this, ctx, top);
    try { afterToasts(this, top); } catch (e) { console.warn('[pickup_compare]', e); }
  };
}
/** 토스트 글자를 바꾼 뒤 game.js 의 줄바꿈·폭 캐시를 비운다 (_pk: hudfix 토스트 줄 계획 캐시) */
function retext(t, s) { t.text = s; t._fk = t._wk = t._mk = undefined; t._pk = null; }
/** [auto] 지금 기기의 「바로 장착」 안내 ('' = 안내 없음) */
function hintFor() {
  if (input.mode === 'touch') return ' · 눌러서 장착';
  if (input.mode === 'pad') return (input.bindings?.pad?.equipNow ?? []).some(Number.isInteger) ? ` · ${labelOf('equipNow', 'pad')}: 장착` : ' · ↑ 길게: 장착';
  const k = labelOf('equipNow', 'kb');
  return k ? ` · 클릭 · ${k}: 장착` : ' · 클릭해 장착';
}
/** 「장착」 안내는 지금 누를 수 있을 때만 (qafix): 마을에서 받은 토스트가 상점·설정·메뉴 위에 그려지는 동안은 안내를 뗀다.
 *  [auto] 기기가 바뀌면 그 기기의 안내로 바꾼다 (패드도 'equipNow' 로 장착할 수 있다) */
function hintSync(g, top) {
  const want = canTap(g, top) ? hintFor() : '';
  for (const t of g.toasts) {
    const h = t._qolHint;
    if (h == null || typeof t.text !== 'string' || !t._qol || t._qol.done) continue;
    if (h === want && (h === '' || t.text.endsWith(h))) continue;
    let base = t.text;
    if (h && base.endsWith(h)) base = base.slice(0, -h.length);
    t._qolHint = want;
    retext(t, base + want);
  }
}

function decorate(g, item) {
  const st = g?.state;
  if (!st?.heroes || !findItem(st, item.uid)) return;
  const hero = st.heroes[st.charId];
  if (!hero) return;
  if (isEquipped(st, item.uid)) { delete item.isNew; return; }   // 받자마자 끼운 장비(새 게임 · 아케이드 준비물)는 NEW 아님
  const mode = gearSettings(g.settings).weights;
  let mark = null, score = null, slot = null, other = null;
  if (canEquip(st, hero, item).ok) {
    const d = gearDelta(st, hero, item, { mode });
    if (d.comparable) { mark = d.mark; score = d.score; slot = d.slot; }
  }
  if (mark !== 'up') {
    let best = 0.5;
    for (const [id, h] of Object.entries(st.heroes)) {
      if (id === st.charId || !canEquip(st, h, item).ok) continue;
      const d = gearDelta(st, h, item, { mode });
      if ((d.score ?? 0) > best) { best = d.score; other = id; }
    }
  }
  if (!mark && !other) return;
  if (g._stashUids?.has?.(item.uid) && mark !== 'up') return;   // [playb] P11 보관함에서 꺼낸 장비: ▲ 일 때만 알린다 (▼ · = · 다른 영웅용은 조용히)
  const sc = score == null ? '' : Math.abs(score) < 0.05 ? '±0' : `${score > 0 ? '+' : '−'}${(Math.round(Math.abs(score) * 10) / 10).toFixed(1)}`;
  let suf = '';
  if (mark) suf += ` ${mark === 'up' ? '▲' : mark === 'down' ? '▼' : '='} ${sc}`;
  // [auto] 패드·키보드는 'equipNow' (↑ 길게 · N) 로도 장착한다 — 안내는 지금 기기에 맞춘다 (hintFor; 기기가 바뀌면 hintSync 가 바꾼다)
  // 누를 수 있는 곳(스테이지·마을 HUD 위 토스트)에서만 「장착」 안내 — 상점·메뉴 같은 화면의 토스트는 표시만
  const tappable = mark === 'up' && canTap(g);
  const hint = hintFor();
  if (tappable) suf += hint;
  else if (other) suf += ` · ${CHARACTERS[other]?.name?.split(' ')[0] ?? ''}에게 ▲`;
  const name = itemName(item);
  const head = `획득: ${name}`;
  let t = null;
  for (let i = g.toasts.length - 1; i >= 0; i--) { const q = g.toasts[i]; if (!q._qol && !q._qolDec && typeof q.text === 'string' && q.text.startsWith(head)) { t = q; break; } }   // [auto] 이미 비교를 붙인 토스트에 또 붙이지 않는다 (같은 이름 두 개를 한꺼번에 주우면 '= ±0 = ±0')
  if (t) retext(t, t.text + suf);
  else { g.toast(head + suf, '#efe4cf', 3); t = g.toasts[g.toasts.length - 1]; }
  if (!t) return;
  t._qolDec = true;
  if (tappable) { t._qol = { uid: item.uid, slot, mark }; t._qolHint = hint; t.t = t.max = Math.max(t.max ?? 0, 4); }
  hook(g);
}

bus.on('itemPicked', ({ item } = {}) => {
  const g = input.game;
  if (!g?.state || !item || !isEquipment(ITEMS[item.baseId])) return;
  item.isNew = true;
  if (g.world && g.world.mode !== 'town') S.log.push(item.uid);
  if (S.burst++ === 0) setTimeout(() => { S.burst = 0; }, 0);
  if (S.burst > BURST) return;
  const run = () => { try { decorate(g, item); } catch (e) { console.warn('[pickup_compare]', e); } };
  if (typeof queueMicrotask === 'function') queueMicrotask(run); else Promise.resolve().then(run);
});
bus.on('playerHurt', () => { S.lastDanger = now(); });
bus.on('stageEntered', () => {
  S.log.length = 0;
  const g = input.game;
  const st = g?.state;
  if (!st?.inventory || g.world?.arcade || g.world?.trial) return;
  const free = freeSlots(st);
  if (free > 5) return;
  // 스테이지 입장 때 가방 경고 (qol_equip §5) — 누르면 일괄 처분 창
  const msg = free <= 0 ? '가방이 가득 찼습니다' : `가방 남은 칸 ${free}`;
  const run = () => {
    g.toast(input.mode === 'pad' ? `${msg} — 메뉴 › 인벤토리에서 일괄 처분` : `${msg} — ${input.touchMode ? '눌러서' : '클릭해'} 일괄 처분`, '#ffb060', 5);
    const t = g.toasts[g.toasts.length - 1];
    if (t) t._qol = { action: 'dispose' };
    hook(g);
  };
  setTimeout(run, 600);   // 스테이지 이름 띄우기와 겹치지 않게 조금 뒤
});
export const _test = { S, decorate, afterToasts, markOf };
