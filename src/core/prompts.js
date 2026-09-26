// 버튼 안내 글리프 (platform.md §4.5, MASTER_PLAN §1.4) — owner: PLAT-INPUT
//
//  bindingOf(action, mode = 지금 안내 기기) → [{type:'key',code} | {type:'btn',index} | {type:'axis',stick,axis,dir,id}
//                                            | {type:'dpad',dirs} | {type:'touch',id}]
//      mode: 'kb' | 'pad' | 'touch' (별칭 'key'·'keyboard'). 바인딩이 없으면 대신 쓰는 액션(각성기 → 필살기)의 것에 via 를 붙여 준다.
//      가상 이름: 'dpad' 'dpadH' 'dpadV' (방향 전체 / 좌우 / 상하), 'stickR' (영웅 회전: 오른쪽 스틱 X · , . 키)
//  glyphFor(action, mode) → {set, label, index | code | id, kind} | null     (첫 바인딩의 글리프; 없으면 null)
//  labelOf(action, mode)  → '점프' 버튼의 글자 ('Z', 'A', '✕', 'LB', '점프' …; 없으면 '')
//  drawGlyph(ctx, action, x, y, h = 18) → 너비. (x, y) = 글리프 상자의 왼쪽 위.
//      키보드 = 키캡, 패드 = 세트별 버튼(얼굴 버튼 원 · 어깨 알약 · 트리거 · D-pad 십자 · 스틱), 터치 = 가상 패드 버튼 모양.
//      액션이 아닌 글자('PgUp' 등)는 그 글자의 키캡. 이 기기에 바인딩이 없으면 아무것도 그리지 않고 0.
//      비트맵 캐시: (기기, 세트, 글자, 높이, 화면 배율, 글꼴 세대) 마다 한 번만 그린다 (HUD 가 매 프레임 4번 부른다).
//  drawHints(ctx, items, x, y, { align, size, color }) → 끝 x
//      items = [[action | action[] | 'dpad'|'dpadH'|'dpadV'|'stickR' | 예전 키 글자('Z','↑↓' …), '라벨', 터치 문구?], …]
//      y = 라벨 글자 기준선 (menu/common.hintRow 와 같은 배치). 터치 모드에선 터치 문구가 있으면 그 문구만 쓴다.
//  legacyKey(str) → 액션 ('Z'→confirm, 'X'→cancel, 'Q'/'S'→prevTab, 'E'/'D'→nextTab, 'A'→alt, 'C'→alt2,
//                    'Enter'→confirm, 'Esc'/'ESC'→menu, '↑↓'→dpadV, '←→'→dpadH, '↑↓←→'→dpad; 모르는 글자는 그대로)
//  promptMode() · glyphSet() · clearGlyphCache()
import { input } from './input.js';
import * as UI from './ui.js';
import { font, FONT, text } from './ui.js';
import {
  ACTIONS, GLYPHS, keyLabel, padButtonName, TOUCH_LABELS, ACTION_FALLBACK,
} from '../data/controls.js';

const ACTION_SET = new Set(ACTIONS);
const VIRTUAL = new Set(['dpad', 'dpadH', 'dpadV', 'stickR', 'stickL']);
const LEGACY = {
  Z: 'confirm', X: 'cancel', Q: 'prevTab', S: 'prevTab', E: 'nextTab', D: 'nextTab', A: 'alt', C: 'alt2',
  Enter: 'confirm', Esc: 'menu', ESC: 'menu', Escape: 'menu', '↑↓': 'dpadV', '←→': 'dpadH', '↑↓←→': 'dpad',
  // 뜻이 하나뿐인 예전 글자
  '↑': 'up', '↓': 'down', '←': 'left', '→': 'right', Space: 'confirm', Shift: 'dash', F: 'ult', V: 'awaken',
  Tab: 'map', M: 'map', I: 'map', R: 'mount', G: 'guard',
};
/** 가상 이름의 키보드 글자 (키캡 하나) */
const KB_VIRTUAL = { dpad: '↑↓←→', dpadH: '←→', dpadV: '↑↓', stickR: ', .', stickL: '↑↓←→' };
const DIR_OF_BTN = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

const normMode = (m) => (m === 'key' || m === 'keyboard' ? 'kb' : m === 'kb' || m === 'pad' || m === 'touch' ? m : null);

/** 안내 글리프를 그릴 기기 (ctrlPrompts 'keyboard' 면 패드 모드에서도 키보드) */
export function promptMode() {
  try { return normMode(input.promptMode?.() ?? input.mode) ?? (input.touchMode ? 'touch' : 'kb'); } catch { return 'kb'; }
}
/** 패드 글리프 세트 ('xbox' | 'ps' | 'nintendo' | 'generic') */
export function glyphSet() {
  try { return input.glyphSet?.() ?? input.padInfo?.glyphs ?? 'xbox'; } catch { return 'xbox'; }
}

/** 예전 키 글자 → 액션 이름 (모르면 그대로) */
export function legacyKey(str) {
  if (typeof str !== 'string') return str;
  return LEGACY[str] ?? str;
}

function axisEntry(id) {
  const m = /^([lr])s([xy])([+-])$/.exec(id);
  if (!m) return null;
  return { type: 'axis', stick: m[1].toUpperCase(), axis: m[2], dir: m[3] === '+' ? 1 : -1, id };
}

function rawBinding(action, mode) {
  const B = input.bindings ?? {};
  if (mode === 'kb') {
    if (action === 'dpad' || action === 'stickL') return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map((code) => ({ type: 'key', code }));
    if (action === 'dpadH') return [{ type: 'key', code: 'ArrowLeft' }, { type: 'key', code: 'ArrowRight' }];
    if (action === 'dpadV') return [{ type: 'key', code: 'ArrowUp' }, { type: 'key', code: 'ArrowDown' }];
    if (action === 'stickR') return [...(B.key?.viewL ?? []), ...(B.key?.viewR ?? [])].map((code) => ({ type: 'key', code }));
    return (B.key?.[action] ?? []).map((code) => ({ type: 'key', code }));
  }
  if (mode === 'pad') {
    if (action === 'dpad') return [{ type: 'dpad', dirs: ['up', 'down', 'left', 'right'] }];
    if (action === 'dpadH') return [{ type: 'dpad', dirs: ['left', 'right'] }];
    if (action === 'dpadV') return [{ type: 'dpad', dirs: ['up', 'down'] }];
    if (action === 'stickR') return [{ type: 'axis', stick: 'R', axis: 'x', dir: 0, id: 'rsx' }];
    if (action === 'stickL') return [{ type: 'axis', stick: 'L', axis: 'x', dir: 0, id: 'lsx' }];
    const out = [];
    for (const b of B.pad?.[action] ?? []) {
      if (Number.isInteger(b)) out.push({ type: 'btn', index: b });
      else if (typeof b === 'string') { const a = axisEntry(b); if (a) out.push(a); }
    }
    return out;
  }
  if (mode === 'touch') {
    if (VIRTUAL.has(action) && action !== 'stickR') return [{ type: 'touch', id: 'stick' }];
    return (B.touch?.[action] ?? []).map((id) => ({ type: 'touch', id }));
  }
  return [];
}

/** 액션의 바인딩 목록 (지금 안내 기기 기준). 없으면 대신 쓰는 액션의 것 (via 표시) */
export function bindingOf(action, mode) {
  const m = normMode(mode) ?? promptMode();
  if (typeof action !== 'string') return [];
  let list = rawBinding(action, m);
  if (!list.length && ACTION_FALLBACK[action]) {
    const via = ACTION_FALLBACK[action];
    list = rawBinding(via, m).map((b) => ({ ...b, via }));
  }
  return list;
}

/** 첫 바인딩의 글리프 설명 */
export function glyphFor(action, mode) {
  const m = normMode(mode) ?? promptMode();
  const b = bindingOf(action, m)[0];
  if (!b) return null;
  if (b.type === 'key') return { set: 'keyboard', kind: 'key', label: keyLabel(b.code), code: b.code };
  if (b.type === 'touch') return { set: 'touch', kind: 'touch', label: TOUCH_LABELS[b.id] ?? b.id, id: b.id };
  const set = glyphSet();
  if (b.type === 'btn') return { set, kind: 'btn', label: padButtonName(set, b.index), index: b.index };
  if (b.type === 'dpad') return { set, kind: 'dpad', label: b.dirs.map((d) => ({ up: '↑', down: '↓', left: '←', right: '→' })[d]).join(''), index: null };
  if (b.type === 'axis') return { set, kind: 'axis', label: `${b.stick} 스틱`, index: null, id: b.id };
  return null;
}

/** 버튼 글자 (옵션 안내·토스트 문구용) */
export function labelOf(action, mode) {
  return glyphFor(action, mode)?.label ?? '';
}

// ───────────────────────── 글리프 그리기 ─────────────────────────

/** 액션 → 그릴 글리프 설명 {id(캐시 키), parts:[{kind, …}]} | null */
function specOf(action, mode) {
  if (typeof action !== 'string' || !action) return null;
  const known = ACTION_SET.has(action) || VIRTUAL.has(action);
  if (!known) {
    const mapped = LEGACY[action];
    if (mapped) return specOf(mapped, mode);
    return { id: 'lit:' + action, parts: [{ kind: 'key', label: action }] };   // 모르는 글자: 그 글자의 키캡
  }
  if (mode === 'kb') {
    if (KB_VIRTUAL[action]) return { id: 'kv:' + action, parts: [{ kind: 'key', label: KB_VIRTUAL[action] }] };
    const b = bindingOf(action, 'kb')[0];
    if (!b) return null;
    const label = keyLabel(b.code);
    return { id: 'k:' + label, parts: [{ kind: 'key', label }] };
  }
  if (mode === 'touch') {
    const b = bindingOf(action, 'touch')[0];
    if (!b) return null;
    const label = b.id === 'stick' ? '' : TOUCH_LABELS[b.id] ?? b.id;
    return { id: 't:' + b.id, parts: [{ kind: b.id === 'stick' ? 'tstick' : 'touch', label }] };
  }
  const set = glyphSet();
  const b = bindingOf(action, 'pad')[0];
  if (!b) return null;
  if (b.type === 'dpad') return { id: `p:${set}:dpad:${b.dirs.join('')}`, parts: [{ kind: 'dpad', dirs: b.dirs }] };
  if (b.type === 'axis') return { id: `p:${set}:ax:${b.id}`, parts: [{ kind: 'stick', set, stick: b.stick, axis: b.axis, dir: b.dir }] };
  const i = b.index;
  if (DIR_OF_BTN[i]) return { id: `p:${set}:dpad:${DIR_OF_BTN[i]}`, parts: [{ kind: 'dpad', dirs: [DIR_OF_BTN[i]] }] };
  return { id: `p:${set}:b${i}`, parts: [{ kind: 'btn', set, index: i }] };
}

// 비트맵 캐시
const CACHE = new Map();
const CACHE_MAX = 160;
let measureCtx = null;
function scratchCtx() {
  if (measureCtx) return measureCtx;
  try { measureCtx = document.createElement('canvas').getContext('2d'); } catch { measureCtx = null; }
  return measureCtx;
}
/** 캐시 비우기 (설정 변경 등으로 모양이 바뀔 때; 보통은 키에 모두 들어 있어 필요 없다) */
export function clearGlyphCache() { CACHE.clear(); SPEC_MEMO.clear(); }

const labelSize = (h) => Math.round(Math.max(9, h * 0.62));
const ellipsize = (s, n) => (s.length > n ? s.slice(0, n) : s);

/** 부품 너비 (h 기준) */
function partWidth(mctx, p, h) {
  switch (p.kind) {
    case 'key': {
      mctx.font = font(labelSize(h), 800, FONT.body);
      return Math.max(h, Math.ceil(mctx.measureText(p.label).width) + Math.round(h * 0.55));
    }
    case 'touch': {
      mctx.font = font(Math.max(9, Math.round(h * 0.6)), 800, FONT.body);
      return Math.max(h, Math.ceil(mctx.measureText(p.label).width) + Math.round(h * 0.6));
    }
    case 'tstick': return h;
    case 'dpad': return h;
    case 'stick': return p.dir === 0 ? Math.round(h * 1.7) : Math.round(h * 1.3);
    case 'btn': {
      const i = p.index;
      if (i >= 0 && i <= 3) return h;
      if (i === 4 || i === 5 || i === 6 || i === 7) {
        mctx.font = font(labelSize(h) - 1, 800, FONT.body);
        const G = GLYPHS[p.set] ?? GLYPHS.generic;
        return Math.max(Math.round(h * 1.55), Math.ceil(mctx.measureText(G.labels[i] ?? '').width) + Math.round(h * 0.6));
      }
      if (i === 8 || i === 9) {
        const G = GLYPHS[p.set] ?? GLYPHS.generic;
        if (G.icon[i] || p.set === 'ps') return Math.round(h * 1.5);
        mctx.font = font(Math.max(8, labelSize(h) - 2), 800, FONT.body);
        return Math.max(Math.round(h * 1.5), Math.ceil(mctx.measureText(ellipsize(G.labels[i] ?? '', 6)).width) + Math.round(h * 0.6));
      }
      return h;   // 스틱 누름 · 홈 · 그 밖
    }
    default: return h;
  }
}

function rrect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}
function centerText(c, s, x, y, size, color, weight = 800) {
  c.font = font(size, weight, FONT.body);
  c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(s, x, y + 0.5);
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
}

/** 키캡 (menu/common.keycap 과 같은 모양) */
function drawKey(c, p, x, y, w, h) {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#2e2230'); g.addColorStop(1, '#140c16');
  rrect(c, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(2, h * 0.22));
  c.fillStyle = g; c.fill();
  c.strokeStyle = '#8a6a3a'; c.lineWidth = 1; c.stroke();
  c.fillStyle = 'rgba(255,240,200,0.12)'; c.fillRect(x + 3, y + 2, w - 6, 1);
  centerText(c, p.label, x + w / 2, y + h / 2, labelSize(h), '#e8dcc8');
}

/** 터치 버튼 (가상 패드와 같은 반투명 원/알약) */
function drawTouch(c, p, x, y, w, h) {
  rrect(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, h / 2);
  c.fillStyle = 'rgba(24,12,20,0.78)'; c.fill();
  c.strokeStyle = 'rgba(232,200,114,0.85)'; c.lineWidth = 1.2; c.stroke();
  centerText(c, p.label, x + w / 2, y + h / 2, Math.max(9, Math.round(h * 0.6)), '#f3e6cc');
}
function drawTouchStick(c, x, y, h) {
  const cx = x + h / 2, cy = y + h / 2, r = h / 2 - 1;
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = 'rgba(24,12,20,0.6)'; c.fill();
  c.strokeStyle = 'rgba(232,200,114,0.7)'; c.lineWidth = 1; c.stroke();
  c.beginPath(); c.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  c.fillStyle = 'rgba(243,230,204,0.85)'; c.fill();
}

/** 얼굴 버튼 (원) */
function drawFace(c, set, i, x, y, h) {
  const G = GLYPHS[set] ?? GLYPHS.generic;
  const f = G.face[i];
  const cx = x + h / 2, cy = y + h / 2, r = h / 2 - 0.75;
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#34303a'); g.addColorStop(1, '#131118');
  c.fillStyle = g; c.fill();
  c.lineWidth = 1.2;
  c.strokeStyle = set === 'xbox' ? f.color : 'rgba(210,200,190,0.55)'; c.stroke();
  if (set === 'ps') {
    const s = h * 0.24, col = f.color;
    c.strokeStyle = col; c.lineWidth = Math.max(1.2, h * 0.085); c.lineJoin = 'round';
    c.beginPath();
    if (f.shape === 'cross') { c.moveTo(cx - s, cy - s); c.lineTo(cx + s, cy + s); c.moveTo(cx + s, cy - s); c.lineTo(cx - s, cy + s); } else if (f.shape === 'circle') c.arc(cx, cy, s * 1.05, 0, Math.PI * 2);
    else if (f.shape === 'square') c.rect(cx - s * 0.95, cy - s * 0.95, s * 1.9, s * 1.9);
    else { c.moveTo(cx, cy - s * 1.1); c.lineTo(cx + s * 1.1, cy + s * 0.8); c.lineTo(cx - s * 1.1, cy + s * 0.8); c.closePath(); }
    c.stroke();
    return;
  }
  centerText(c, f.label, cx, cy, Math.max(8, Math.round(h * 0.6)), f.color);
}

/** 어깨 버튼 (알약) · 트리거 (윗변이 좁은 사다리꼴) */
function drawShoulder(c, set, i, x, y, w, h) {
  const G = GLYPHS[set] ?? GLYPHS.generic;
  const trig = i === 6 || i === 7;
  c.beginPath();
  if (trig) {
    const inset = w * 0.12, r = h * 0.38;
    c.moveTo(x + inset + r, y + 0.75);
    c.lineTo(x + w - inset - r, y + 0.75);
    c.quadraticCurveTo(x + w - inset, y + 0.75, x + w - inset * 0.55, y + r);
    c.lineTo(x + w - 0.75, y + h - 2.5);
    c.quadraticCurveTo(x + w - 0.75, y + h - 0.75, x + w - 3, y + h - 0.75);
    c.lineTo(x + 3, y + h - 0.75);
    c.quadraticCurveTo(x + 0.75, y + h - 0.75, x + 0.75, y + h - 2.5);
    c.lineTo(x + inset * 0.55, y + r);
    c.quadraticCurveTo(x + inset, y + 0.75, x + inset + r, y + 0.75);
    c.closePath();
  } else rrect(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, h * 0.42);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#3a3440'); g.addColorStop(1, '#16131b');
  c.fillStyle = g; c.fill();
  c.strokeStyle = set === 'generic' ? 'rgba(184,180,174,0.7)' : 'rgba(225,215,200,0.6)'; c.lineWidth = 1; c.stroke();
  centerText(c, G.labels[i] ?? '', x + w / 2, y + h / 2 + (trig ? h * 0.05 : 0), labelSize(h) - 1, '#ece4da');
}

/** SELECT / START 계열 (세트별 아이콘) */
function drawMenuBtn(c, set, i, x, y, w, h) {
  const G = GLYPHS[set] ?? GLYPHS.generic;
  const icon = G.icon[i];
  const cx = x + w / 2, cy = y + h / 2;
  if (set === 'nintendo') {
    c.beginPath(); c.arc(cx, cy, h / 2 - 0.75, 0, Math.PI * 2);
    c.fillStyle = '#1c1a20'; c.fill(); c.strokeStyle = 'rgba(225,215,200,0.6)'; c.lineWidth = 1; c.stroke();
    const s = h * 0.24;
    c.strokeStyle = '#ece4da'; c.lineWidth = Math.max(1.2, h * 0.1); c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx - s, cy); c.lineTo(cx + s, cy);
    if (icon === 'plus') { c.moveTo(cx, cy - s); c.lineTo(cx, cy + s); }
    c.stroke(); c.lineCap = 'butt';
    return;
  }
  rrect(c, x + 0.75, y + h * 0.14, w - 1.5, h * 0.72, h * 0.36);
  c.fillStyle = '#1c1a20'; c.fill(); c.strokeStyle = 'rgba(225,215,200,0.6)'; c.lineWidth = 1; c.stroke();
  c.strokeStyle = '#ece4da'; c.fillStyle = '#ece4da';
  const s = h * 0.2;
  c.lineWidth = Math.max(1, h * 0.075);
  if (icon === 'view') {   // ⧉ 겹친 사각형 두 개
    c.strokeRect(cx - s * 1.1, cy - s * 0.9, s * 1.3, s * 1.1);
    c.strokeRect(cx - s * 0.2, cy - s * 0.2, s * 1.3, s * 1.1);
  } else if (icon === 'menu' || (set === 'ps' && i === 9)) {   // ≡
    c.beginPath();
    for (const k of [-1, 0, 1]) { c.moveTo(cx - s * 1.1, cy + k * s * 0.75); c.lineTo(cx + s * 1.1, cy + k * s * 0.75); }
    c.stroke();
  } else if (set === 'ps' && i === 8) {   // Create: 기울어진 세 줄
    c.beginPath();
    for (const k of [-1, 0, 1]) { c.moveTo(cx + k * s * 0.8 - s * 0.35, cy + s * 0.9); c.lineTo(cx + k * s * 0.8 + s * 0.35, cy - s * 0.9); }
    c.stroke();
  } else centerText(c, ellipsize(G.labels[i] ?? '', 6), cx, cy, Math.max(8, labelSize(h) - 2), '#ece4da');
}

/** 스틱 (누름 L3/R3 또는 축 방향) */
function drawStick(c, set, stick, x, y, w, h, arrows) {
  const cx = x + w / 2, cy = y + h / 2, r = h / 2 - 0.75;
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = '#16131b'; c.fill(); c.strokeStyle = 'rgba(225,215,200,0.55)'; c.lineWidth = 1; c.stroke();
  c.beginPath(); c.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  c.fillStyle = '#3a3440'; c.fill();
  centerText(c, stick, cx, cy, Math.max(8, Math.round(h * 0.5)), '#ece4da');
  if (!arrows) return;
  c.fillStyle = '#e8c872';
  const a = h * 0.2;
  for (const d of arrows) {
    const ax = d < 0 ? x + a * 0.2 : x + w - a * 0.2;
    c.beginPath(); c.moveTo(ax, cy); c.lineTo(ax - d * a, cy - a * 0.8); c.lineTo(ax - d * a, cy + a * 0.8); c.closePath(); c.fill();
  }
}

/** D-pad 십자 (켜진 팔만 밝게) */
function drawDpad(c, dirs, x, y, h) {
  const cx = x + h / 2, cy = y + h / 2, t = h * 0.34, L = h / 2 - 0.75;
  const arms = { up: [cx - t / 2, cy - L, t, L], down: [cx - t / 2, cy, t, L], left: [cx - L, cy - t / 2, L, t], right: [cx, cy - t / 2, L, t] };
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.fillRect(cx - t / 2 - 1, cy - L - 1, t + 2, 2 * L + 2); c.fillRect(cx - L - 1, cy - t / 2 - 1, 2 * L + 2, t + 2);
  for (const [d, r] of Object.entries(arms)) {
    c.fillStyle = dirs.includes(d) ? '#e8c872' : '#4a4450';
    c.fillRect(r[0], r[1], r[2], r[3]);
  }
  c.fillStyle = '#2a2530'; c.fillRect(cx - t / 2, cy - t / 2, t, t);
}

function drawPart(c, p, x, y, w, h) {
  switch (p.kind) {
    case 'key': return drawKey(c, p, x, y, w, h);
    case 'touch': return drawTouch(c, p, x, y, w, h);
    case 'tstick': return drawTouchStick(c, x, y, h);
    case 'dpad': return drawDpad(c, p.dirs, x, y, h);
    case 'stick': return drawStick(c, p.set, p.stick, x, y, w, h, p.dir === 0 ? [-1, 1] : [p.dir]);
    case 'btn': {
      const i = p.index;
      if (i >= 0 && i <= 3) return drawFace(c, p.set, i, x, y, h);
      if (i >= 4 && i <= 7) return drawShoulder(c, p.set, i, x, y, w, h);
      if (i === 8 || i === 9) return drawMenuBtn(c, p.set, i, x, y, w, h);
      if (i === 10 || i === 11) return drawStick(c, p.set, i === 10 ? 'L' : 'R', x, y, w, h, null);
      const G = GLYPHS[p.set] ?? GLYPHS.generic;
      return drawKey(c, { label: ellipsize(G.labels[i] ?? `#${i}`, 4) }, x, y, w, h);
    }
    default: return undefined;
  }
}

/** 배율 (ctx 변환의 x 배율, 0.5 단위, 1..4) */
function scaleOf(ctx) {
  try {
    const m = ctx.getTransform?.();
    if (!m) return 1;
    const s = Math.hypot(m.a, m.b);
    return Math.min(4, Math.max(1, Math.ceil(s * 2 - 0.05) / 2));
  } catch { return 1; }
}

function bitmapOf(spec, h, sc) {
  const key = `${spec.id}|${h}|${sc}|${UI.fontEpoch}`;
  let e = CACHE.get(key);
  if (e) return e;
  const mctx = scratchCtx();
  if (!mctx) return null;
  const gap = Math.max(2, Math.round(h * 0.12));
  const ws = spec.parts.map((p) => partWidth(mctx, p, h));
  const w = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
  let cv = null;
  try {
    cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * sc)); cv.height = Math.max(1, Math.ceil(h * sc));
    const c = cv.getContext('2d');
    c.scale(sc, sc);
    let x = 0;
    spec.parts.forEach((p, k) => { drawPart(c, p, x, 0, ws[k], h); x += ws[k] + gap; });
  } catch (err) { console.error('[prompts] glyph', err); return null; }
  if (CACHE.size >= CACHE_MAX) CACHE.clear();
  e = { cv, w };
  CACHE.set(key, e);
  return e;
}

// 액션 → 글리프 설명 메모 (바인딩 객체·글리프 세트가 바뀌면 비운다): HUD 가 매 프레임 부를 때 배열을 새로 만들지 않는다
const SPEC_MEMO = new Map();
let memoBindings = null, memoSet = null;
function specMemo(action, m) {
  const b = input.bindings, set = m === 'pad' ? glyphSet() : null;
  if (b !== memoBindings || (set && set !== memoSet)) { SPEC_MEMO.clear(); memoBindings = b; if (set) memoSet = set; }
  const k = m + '|' + action;
  let spec = SPEC_MEMO.get(k);
  if (spec === undefined) {
    try { spec = specOf(action, m); } catch (e) { console.error('[prompts] spec', e); spec = null; }
    if (SPEC_MEMO.size > 256) SPEC_MEMO.clear();
    SPEC_MEMO.set(k, spec);
  }
  return spec;
}

/** 글리프 하나 → 너비 (그릴 것이 없으면 0) */
export function drawGlyph(ctx, action, x, y, h = 18, mode) {
  const m = normMode(mode) ?? promptMode();
  const spec = specMemo(action, m);
  if (!spec) return 0;
  h = Math.max(8, Math.round(h));
  const bm = bitmapOf(spec, h, scaleOf(ctx));
  if (bm) { ctx.drawImage(bm.cv, x, y, bm.w, h); return bm.w; }
  // 캔버스를 만들 수 없는 환경: 바로 그린다
  const ws = spec.parts.map((p) => partWidth(ctx, p, h));
  ctx.save();
  let cx = x;
  spec.parts.forEach((p, k) => { drawPart(ctx, p, cx, y, ws[k], h); cx += ws[k] + 2; });
  ctx.restore();
  return cx - 2 - x;
}

/** 글리프 너비만 (그리지 않음) */
export function glyphWidth(action, h = 18, mode) {
  const m = normMode(mode) ?? promptMode();
  const spec = specMemo(action, m);
  if (!spec) return 0;
  const mctx = scratchCtx();
  if (!mctx) return h;
  const gap = Math.max(2, Math.round(h * 0.12));
  const ws = spec.parts.map((p) => partWidth(mctx, p, Math.round(h)));
  return ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
}

/** 안내 줄 한 항목의 글리프 목록 (같은 모양은 한 번만) */
function itemKeys(k, mode) {
  const list = Array.isArray(k) ? k : [k];
  const out = [], seen = new Set();
  for (const raw of list) {
    if (raw == null || raw === '') continue;
    const a = typeof raw === 'string' && !ACTION_SET.has(raw) && !VIRTUAL.has(raw) ? legacyKey(raw) : raw;
    const spec = specOf(a, mode);
    if (!spec || seen.has(spec.id)) continue;
    seen.add(spec.id);
    out.push(a);
  }
  return out;
}

/**
 * 버튼 안내 줄. items = [[키/액션(배열 가능), '라벨', 터치 문구?], …]. y = 라벨 글자 기준선. → 끝 x
 * 터치 모드: 터치 문구가 있으면 문구만, 없으면 (터치 버튼이 있는 액션은 그 모양 +) 라벨.
 */
export function drawHints(ctx, items, x, y, { align = 'left', size = 12, color = '#a89880', mode } = {}) {
  const m = normMode(mode) ?? promptMode();
  const h = Math.round(size * 1.5);
  const top = y - Math.round(h * 0.72);
  const parts = [];
  ctx.save();
  let total = 0;
  for (const it of items || []) {
    if (!it) continue;
    const [k, label, tip] = it;
    let keys, lab = label ?? '';
    if (m === 'touch' && tip) { keys = []; lab = tip; } else keys = itemKeys(k, m);
    let kw = 0;
    for (const a of keys) kw += glyphWidth(a, h, m) + 3;
    ctx.font = font(size, 600, FONT.body);
    const lw = ctx.measureText(lab).width;
    parts.push({ keys, lab, kw, lw });
    total += kw + lw + 16;
  }
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  for (const pt of parts) {
    for (const a of pt.keys) cx += drawGlyph(ctx, a, cx, top, h, m) + 3;
    text(ctx, pt.lab, cx + 2, y, { size, weight: 600, color, ow: 2 });
    cx += pt.lw + 16;
  }
  ctx.restore();
  return cx;
}
