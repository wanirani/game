// STUB (W0 SKEL) — owner: PLAT-INPUT
// 버튼 안내 글리프 (platform.md §4.5). 계약:
//  bindingOf(action, mode = input.mode) → [{type:'key',code}|{type:'btn',index}|{type:'axis',...}|{type:'touch',id}]
//  drawGlyph(ctx, action, x, y, h = 18) → 너비. (x, y) = 글리프 상자의 왼쪽 위. 현재 기기에 맞는 키캡/패드/터치 아이콘
//  drawHints(ctx, items, x, y, { align, size }) → 끝 x. items = [[action | action[] | 'dpad'|'dpadH'|'dpadV'|'stickR', '라벨', 터치 문구?], …]
//                                                  y = 라벨 글자 기준선 (menu/common.hintRow 와 같은 규칙)
//  legacyKey(str) → 액션 이름 ('Z'→confirm, 'X'→cancel, 'Q'/'S'→prevTab, 'E'/'D'→nextTab, 'A'→alt, 'C'→alt2,
//                    'Enter'→confirm, 'Esc'/'ESC'→menu, '↑↓'→dpadV, '←→'→dpadH, '↑↓←→'→dpad; 모르는 글자는 그대로)
// 스텁: 기기와 무관하게 오늘의 키보드 글자 키캡을 그린다.
import { input } from './input.js';
import { text, font, FONT } from './ui.js';

const KEY_LABEL = {
  left: '←', right: '→', up: '↑', down: '↓', dpad: '↑↓←→', dpadH: '←→', dpadV: '↑↓', stickR: ',.',
  jump: 'Z', attack: 'X', dash: 'C', sub: 'A', skill1: 'S', skill2: 'D', ult: 'F', swap: 'Q',
  menu: 'Esc', confirm: 'Z', cancel: 'X', map: 'Tab',
  prevTab: 'Q', nextTab: 'E', alt: 'A', alt2: 'C',
};
const KEY_CODE = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown'],
  jump: ['KeyZ', 'Space'], attack: ['KeyX', 'KeyJ'], dash: ['KeyC', 'ShiftLeft', 'KeyK'], sub: ['KeyA'],
  skill1: ['KeyS'], skill2: ['KeyD'], ult: ['KeyF', 'KeyV'], swap: ['KeyQ', 'KeyE'],
  menu: ['Escape', 'Enter'], confirm: ['KeyZ', 'Enter'], cancel: ['KeyX', 'Escape'], map: ['Tab', 'KeyM'],
  prevTab: ['KeyQ'], nextTab: ['KeyE'], alt: ['KeyA'], alt2: ['KeyC'],
};
const LEGACY = {
  Z: 'confirm', X: 'cancel', Q: 'prevTab', S: 'prevTab', E: 'nextTab', D: 'nextTab', A: 'alt', C: 'alt2',
  Enter: 'confirm', Esc: 'menu', ESC: 'menu', '↑↓': 'dpadV', '←→': 'dpadH', '↑↓←→': 'dpad',
};

export function bindingOf(action, mode = input.mode) {
  return (KEY_CODE[action] ?? []).map((code) => ({ type: 'key', code }));
}

export function legacyKey(str) { return LEGACY[str] ?? str; }

/** 키캡 하나 (menu/common.keycap 과 같은 모양) */
function keycap(ctx, label, x, y, h) {
  ctx.save();
  ctx.font = font(11, 800, FONT.body);
  const w = Math.max(h, ctx.measureText(label).width + 10);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#2e2230'); g.addColorStop(1, '#140c16');
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 4); else ctx.rect(x, y, w, h);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,200,0.12)'; ctx.fillRect(x + 3, y + 2, w - 6, 1);
  ctx.fillStyle = '#e8dcc8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
  ctx.restore();
  return w;
}

export function drawGlyph(ctx, action, x, y, h = 18) {
  return keycap(ctx, KEY_LABEL[action] ?? String(action ?? ''), x, y, h);
}

export function drawHints(ctx, items, x, y, { align = 'left', size = 12 } = {}) {
  const touch = input.touchMode;
  const parts = items.map(([k, label, tip]) => {
    if (touch && tip) return { keys: [], label: tip };
    return { keys: (Array.isArray(k) ? k : [k]).map((a) => KEY_LABEL[a] ?? String(a ?? '')), label: label ?? '' };
  });
  ctx.save();
  let total = 0;
  for (const pt of parts) {
    ctx.font = font(11, 800, FONT.body);
    pt.kw = 0;
    for (const kk of pt.keys) pt.kw += Math.max(18, ctx.measureText(kk).width + 10) + 3;
    ctx.font = font(size, 600, FONT.body);
    pt.lw = ctx.measureText(pt.label).width;
    total += pt.kw + pt.lw + 16;
  }
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  for (const pt of parts) {
    for (const kk of pt.keys) cx += keycap(ctx, kk, cx, y - 13, 18) + 3;
    text(ctx, pt.label, cx + 2, y, { size, weight: 600, color: '#a89880', ow: 2 });
    cx += pt.lw + 16;
  }
  ctx.restore();
  return cx;
}
