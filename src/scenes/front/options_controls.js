// 옵션 › 조작의 하위 화면 — owner: PLAT-OPTIONS (platform §4.7 키 지정, §4.5 조작 안내, P-29 · MASTER_PLAN §1.4, §1.5 · companions §6)
//  RemapPage('pad' | 'key')  게임패드 버튼 지정 / 키보드 키 지정: 12개 액션(controls.js REMAPPABLE). 줄을 고르면
//                            "새 버튼을 누르세요… (3초, 취소: START)" → 다음 버튼 엣지(패드) 또는 e.code(키보드)를 잡아 input.remap().
//                            다른 액션이 쓰던 값이면 서로 맞바꾸고 "‘대시’와 바꿨습니다" 토스트. START·Esc·Enter·방향은 input 이 거부한다.
//                            아래 단추: 기본값 복원 · 아케이드/클래식 배치 · 차례대로 지정(비표준 패드용 마법사).
//  GuidePage                 조작 안내 (키보드 · 게임패드 · 터치): 전부 input.bindings / 가상 패드 배치에서 만든다
//                            → 실제 배치와 어긋날 수 없다 (탈것 [R/L3], 수호신 [G/R3], 각성기 [F 길게 / V · RT 길게] 포함).
//  공용: Nav(메뉴 의미 입력 + 방향 반복), Scroll(끌기·튕기기·휠·오른쪽 스틱), drawBind(임의 키/버튼 글리프), tapH/cssPer, josaWa
// 하위 화면은 장면이 아니다 (MASTER_PLAN §1.13): OptionsScene 이 머리 줄(뒤로·탭)을 그리고 update/render/tap 을 넘겨준다.
//   page.update(dt, nav, hit) → 'back' 이면 옵션 첫 화면으로 · page.render(ctx, L, owner) · page.hints() · page.exit()
//   page.tabs / page.tab / page.setTab(i) (선택) · page.title · page.modal (true 면 머리 줄 탭 영역을 등록하지 않는다)
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { saves } from '../../core/save.js';
import * as UI from '../../core/ui.js';
import { text, font, FONT, taps } from '../../core/ui.js';
import { drawHints, glyphSet } from '../../core/prompts.js';
import { touchpad, PAD_LAYOUT_S } from '../../core/touchpad.js';
import { clamp, TAU, rgba, ease } from '../../core/math.js';
import {
  REMAPPABLE, ACTION_NAMES, GLYPHS, PAD_PRESETS, PAD_IGNORE, keyLabel, padButtonName, TOUCH_LABELS,
} from '../../data/controls.js';
import { frame, gbutton, GOLD, BONE, DIM } from './common.js';

// ───────────────────────── 크기 · 문구 도우미 ─────────────────────────
/** 장면 좌표 1 px 이 몇 CSS px 인가 (uiScale 장면이면 uiK 포함) */
export function cssPer(sc) {
  const g = sc.game;
  return Math.max(0.2, (g.cssScale || 1) * (sc.uiScale ? g.uiK || 1 : 1));
}
/** 탭 대상 한 변 (≥ 44 CSS px + 여유 2 → 장면 좌표). 데스크톱 46, 휴대폰 ≈ 56 */
export function tapH(sc, base = 46) {
  return Math.max(base, Math.ceil(46 / cssPer(sc)));
}
/** 받침에 따라 '와' / '과' ('대시' → 와, '공격' → 과, '스킬 1' → 과) */
export function josaWa(word) {
  const s = String(word ?? '').trim();
  const c = s.charCodeAt(s.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? '과' : '와';
  if (c >= 48 && c <= 57) return '013678'.includes(s[s.length - 1]) ? '과' : '와';
  return '와';
}
/** 받침에 따라 '은' / '는' ('필살기' → 는, '수호신 스킬' → 은, '스킬 1' → 은) */
export function josaEun(word) {
  return josaWa(word) === '과' ? '은' : '는';
}
/** 설정 저장 (실패해도 게임은 계속) */
export function saveSettings(game) {
  try { if (game.settings) saves.saveSettings(game.settings); } catch (e) { console.error('[options] save', e); }
}
const inRect = (p, r) => !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export const SET_NAMES = { xbox: 'Xbox', ps: 'PlayStation', nintendo: 'Nintendo', generic: '일반 게임패드' };
export const PRESET_NAMES = { arcade: '아케이드', classic: '클래식', custom: '사용자 지정' };

// ───────────────────────── 입력 ─────────────────────────
const DIRS = ['up', 'down', 'left', 'right'];
/**
 * 메뉴 입력 (매 틱 poll): 방향 반복(0.3초 뒤 0.075초 간격) + 의미 액션 (input.bindings 의 메뉴 의미, MASTER_PLAN §1.4).
 * 패드 B 는 게임에선 대시지만 여기선 취소, 키보드 Enter 는 결정·Esc 는 취소, 패드 START 만 menu (옵션 닫기).
 */
export class Nav {
  constructor() { this.rep = { up: 0, down: 0, left: 0, right: 0 }; this.o = {}; }
  poll(dt) {
    const o = this.o;
    for (const a of DIRS) {
      let hit = false;
      if (input.pressed(a)) { hit = true; this.rep[a] = 0.3; } else if (input.down(a)) { this.rep[a] -= dt; if (this.rep[a] <= 0) { hit = true; this.rep[a] = 0.075; } }
      o[a] = hit;
    }
    o.confirm = input.pressed('confirm');
    o.cancel = input.pressed('cancel');
    o.menu = input.pressed('menu') && !o.confirm && !o.cancel;
    o.prevTab = input.pressed('prevTab');
    o.nextTab = input.pressed('nextTab');
    return o;
  }
  clear() { for (const k in this.o) this.o[k] = false; }
}

/**
 * 세로 스크롤: 손가락·마우스 끌기(8 px 넘게 움직이면 끌기, 뗄 때 튕기기), 휠(wheel 누적), 오른쪽 스틱 Y(≤ 900 px/s).
 * 끌기가 끝난 틱에는 swallow = true → 그 틱의 탭은 버린다 (끌다 손을 뗀 곳의 줄이 눌리지 않게).
 */
export class Scroll {
  constructor() { this.y = 0; this.max = 0; this.drag = null; this.swallow = false; this.wheel = 0; this.vy = 0; }
  bounds(contentH, viewH) {
    this.max = Math.max(0, contentH - viewH);
    if (!this.drag) this.y = clamp(this.y, 0, this.max);
  }
  /** [top, bot] 이 보이도록 (키·패드로 선택이 바뀌었을 때만 부른다) */
  show(top, bot, viewH, pad = 4) {
    if (top - pad < this.y) this.y = Math.max(0, top - pad);
    else if (bot + pad > this.y + viewH) this.y = Math.min(this.max, bot + pad - viewH);
    this.vy = 0;
  }
  get dragging() { return !!this.drag?.moved; }
  update(dt, view) {
    this.swallow = false;
    const p = input.pointer;
    if (p.justDown && inRect(p, view)) { this.drag = { y0: p.y, s0: this.y, moved: false }; this.vy = 0; }
    if (this.drag) {
      if (p.down) {
        const dy = p.y - this.drag.y0;
        if (!this.drag.moved && Math.abs(dy) > 8) this.drag.moved = true;
        if (this.drag.moved) {
          const ny = clamp(this.drag.s0 - dy, 0, this.max);
          this.vy = this.vy * 0.5 + ((ny - this.y) / Math.max(dt, 1 / 240)) * 0.5;
          this.y = ny;
        }
      } else {
        if (this.drag.moved) this.swallow = true; else this.vy = 0;
        this.drag = null;
      }
    } else if (this.vy) {
      this.y = clamp(this.y + this.vy * dt, 0, this.max);
      this.vy *= Math.exp(-7 * dt);
      if (Math.abs(this.vy) < 15 || this.y <= 0 || this.y >= this.max) this.vy = 0;
    }
    if (this.wheel) { this.y = clamp(this.y + this.wheel, 0, this.max); this.wheel = 0; this.vy = 0; }
    const ry = input.stickR?.y ?? 0;
    if (Math.abs(ry) > 0.05 && this.max > 0) { this.y = clamp(this.y + ry * 900 * dt, 0, this.max); this.vy = 0; }
  }
}

// ───────────────────────── 임의 바인딩 글리프 ─────────────────────────
// prompts.drawGlyph 는 액션의 첫 바인딩만 그린다. 지정 화면·안내는 한 액션의 모든 키·버튼과 특정 버튼 번호를 그려야 해서
// 같은 모양(키캡 · 얼굴 버튼 · 어깨/트리거 · SELECT/START · 스틱 · D-pad · 터치 버튼)을 여기서 그린다. 비트맵 캐시.
const DIR_OF_BTN = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const labelSize = (h) => Math.round(Math.max(9, h * 0.62));
const ellipsize = (s, n) => (s.length > n ? s.slice(0, n) : s);

/** 바인딩 값 → 그릴 부품 {id, kind, …}. v: KeyboardEvent.code | 버튼 번호 | 'lsx-' 축 | {type,…} */
export function bindSpec(v, dev, set = glyphSet()) {
  if (v && typeof v === 'object') {
    if (v.type === 'text') return { id: 'x:' + v.label, kind: 'text', label: v.label };
    if (v.type === 'touch') return { id: 't:' + v.id, kind: v.id === 'stick' ? 'tstick' : 'touch', label: TOUCH_LABELS[v.id] ?? v.id };
    if (v.type === 'dpad') return { id: 'd:' + v.dirs.join(','), kind: 'dpad', dirs: v.dirs };
    if (v.type === 'stick') return { id: `s:${set}:${v.stick}:${v.dir ?? 0}`, kind: 'stick', set, stick: v.stick, dir: v.dir ?? 0 };
    if (v.type === 'key') v = v.code; else if (v.type === 'btn') v = v.index;
  }
  if (dev === 'key' || typeof v === 'string' && dev !== 'pad') { const label = keyLabel(v); return { id: 'k:' + label, kind: 'key', label }; }
  if (Number.isInteger(v)) {
    if (DIR_OF_BTN[v]) return { id: 'd:' + DIR_OF_BTN[v], kind: 'dpad', dirs: [DIR_OF_BTN[v]] };
    return { id: `b:${set}:${v}`, kind: 'btn', set, index: v };
  }
  const m = /^([lr])s([xy])([+-])$/.exec(String(v));
  if (m) return { id: `s:${set}:${m[1]}:${m[3]}`, kind: 'stick', set, stick: m[1].toUpperCase(), dir: m[3] === '+' ? 1 : -1 };
  return { id: 'x:' + String(v), kind: 'text', label: String(v) };
}

function partWidth(c, p, h) {
  switch (p.kind) {
    case 'key': c.font = font(labelSize(h), 800, FONT.body); return Math.max(h, Math.ceil(c.measureText(p.label).width) + Math.round(h * 0.55));
    case 'touch': c.font = font(Math.max(9, Math.round(h * 0.6)), 800, FONT.body); return Math.max(h, Math.ceil(c.measureText(p.label).width) + Math.round(h * 0.6));
    case 'text': c.font = font(Math.max(10, Math.round(h * 0.62)), 700, FONT.body); return Math.ceil(c.measureText(p.label).width) + 2;
    case 'stick': return p.dir === 0 ? Math.round(h * 1.7) : Math.round(h * 1.3);
    case 'btn': {
      const i = p.index, G = GLYPHS[p.set] ?? GLYPHS.generic;
      if (i >= 4 && i <= 7) { c.font = font(labelSize(h) - 1, 800, FONT.body); return Math.max(Math.round(h * 1.55), Math.ceil(c.measureText(G.labels[i] ?? '').width) + Math.round(h * 0.6)); }
      if (i === 8 || i === 9) {
        if (G.icon[i] || p.set === 'ps') return Math.round(h * 1.5);
        c.font = font(Math.max(8, labelSize(h) - 2), 800, FONT.body);
        return Math.max(Math.round(h * 1.5), Math.ceil(c.measureText(ellipsize(G.labels[i] ?? '', 6)).width) + Math.round(h * 0.6));
      }
      if (i > 16) { c.font = font(labelSize(h), 800, FONT.body); return Math.max(h, Math.ceil(c.measureText(`#${i}`).width) + Math.round(h * 0.55)); }
      return h;
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
function ctext(c, s, x, y, size, color, weight = 800) {
  c.font = font(size, weight, FONT.body);
  c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(s, x, y + 0.5);
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
}
function dKey(c, label, x, y, w, h) {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#2e2230'); g.addColorStop(1, '#140c16');
  rrect(c, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(2, h * 0.22));
  c.fillStyle = g; c.fill();
  c.strokeStyle = '#8a6a3a'; c.lineWidth = 1; c.stroke();
  c.fillStyle = 'rgba(255,240,200,0.12)'; c.fillRect(x + 3, y + 2, w - 6, 1);
  ctext(c, label, x + w / 2, y + h / 2, labelSize(h), '#e8dcc8');
}
function dTouch(c, label, x, y, w, h) {
  rrect(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, h / 2);
  c.fillStyle = 'rgba(24,12,20,0.78)'; c.fill();
  c.strokeStyle = 'rgba(232,200,114,0.85)'; c.lineWidth = 1.2; c.stroke();
  ctext(c, label, x + w / 2, y + h / 2, Math.max(9, Math.round(h * 0.6)), '#f3e6cc');
}
function dTouchStick(c, x, y, h) {
  const cx = x + h / 2, cy = y + h / 2, r = h / 2 - 1;
  c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fillStyle = 'rgba(24,12,20,0.6)'; c.fill();
  c.strokeStyle = 'rgba(232,200,114,0.7)'; c.lineWidth = 1; c.stroke();
  c.beginPath(); c.arc(cx, cy, r * 0.45, 0, TAU); c.fillStyle = 'rgba(243,230,204,0.85)'; c.fill();
}
function dFace(c, set, i, x, y, h) {
  const G = GLYPHS[set] ?? GLYPHS.generic, f = G.face[i];
  const cx = x + h / 2, cy = y + h / 2, r = h / 2 - 0.75;
  c.beginPath(); c.arc(cx, cy, r, 0, TAU);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#34303a'); g.addColorStop(1, '#131118');
  c.fillStyle = g; c.fill();
  c.lineWidth = 1.2; c.strokeStyle = set === 'xbox' ? f.color : 'rgba(210,200,190,0.55)'; c.stroke();
  if (set === 'ps') {
    const s = h * 0.24;
    c.strokeStyle = f.color; c.lineWidth = Math.max(1.2, h * 0.085); c.lineJoin = 'round';
    c.beginPath();
    if (f.shape === 'cross') { c.moveTo(cx - s, cy - s); c.lineTo(cx + s, cy + s); c.moveTo(cx + s, cy - s); c.lineTo(cx - s, cy + s); } else if (f.shape === 'circle') c.arc(cx, cy, s * 1.05, 0, TAU);
    else if (f.shape === 'square') c.rect(cx - s * 0.95, cy - s * 0.95, s * 1.9, s * 1.9);
    else { c.moveTo(cx, cy - s * 1.1); c.lineTo(cx + s * 1.1, cy + s * 0.8); c.lineTo(cx - s * 1.1, cy + s * 0.8); c.closePath(); }
    c.stroke();
    return;
  }
  ctext(c, f.label, cx, cy, Math.max(8, Math.round(h * 0.6)), f.color);
}
function dShoulder(c, set, i, x, y, w, h) {
  const G = GLYPHS[set] ?? GLYPHS.generic, trig = i === 6 || i === 7;
  c.beginPath();
  if (trig) {
    const inset = w * 0.12, r = h * 0.38;
    c.moveTo(x + inset + r, y + 0.75); c.lineTo(x + w - inset - r, y + 0.75);
    c.quadraticCurveTo(x + w - inset, y + 0.75, x + w - inset * 0.55, y + r);
    c.lineTo(x + w - 0.75, y + h - 2.5); c.quadraticCurveTo(x + w - 0.75, y + h - 0.75, x + w - 3, y + h - 0.75);
    c.lineTo(x + 3, y + h - 0.75); c.quadraticCurveTo(x + 0.75, y + h - 0.75, x + 0.75, y + h - 2.5);
    c.lineTo(x + inset * 0.55, y + r); c.quadraticCurveTo(x + inset, y + 0.75, x + inset + r, y + 0.75);
    c.closePath();
  } else rrect(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, h * 0.42);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#3a3440'); g.addColorStop(1, '#16131b');
  c.fillStyle = g; c.fill();
  c.strokeStyle = set === 'generic' ? 'rgba(184,180,174,0.7)' : 'rgba(225,215,200,0.6)'; c.lineWidth = 1; c.stroke();
  ctext(c, G.labels[i] ?? '', x + w / 2, y + h / 2 + (trig ? h * 0.05 : 0), labelSize(h) - 1, '#ece4da');
}
function dMenuBtn(c, set, i, x, y, w, h) {
  const G = GLYPHS[set] ?? GLYPHS.generic, icon = G.icon[i];
  const cx = x + w / 2, cy = y + h / 2;
  if (set === 'nintendo') {
    c.beginPath(); c.arc(cx, cy, h / 2 - 0.75, 0, TAU);
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
  c.strokeStyle = '#ece4da';
  const s = h * 0.2;
  c.lineWidth = Math.max(1, h * 0.075);
  if (icon === 'view') {
    c.strokeRect(cx - s * 1.1, cy - s * 0.9, s * 1.3, s * 1.1);
    c.strokeRect(cx - s * 0.2, cy - s * 0.2, s * 1.3, s * 1.1);
  } else if (icon === 'menu' || (set === 'ps' && i === 9)) {
    c.beginPath();
    for (const k of [-1, 0, 1]) { c.moveTo(cx - s * 1.1, cy + k * s * 0.75); c.lineTo(cx + s * 1.1, cy + k * s * 0.75); }
    c.stroke();
  } else if (set === 'ps' && i === 8) {
    c.beginPath();
    for (const k of [-1, 0, 1]) { c.moveTo(cx + k * s * 0.8 - s * 0.35, cy + s * 0.9); c.lineTo(cx + k * s * 0.8 + s * 0.35, cy - s * 0.9); }
    c.stroke();
  } else ctext(c, ellipsize(G.labels[i] ?? '', 6), cx, cy, Math.max(8, labelSize(h) - 2), '#ece4da');
}
function dStick(c, stick, x, y, w, h, arrows) {
  const cx = x + w / 2, cy = y + h / 2, r = h / 2 - 0.75;
  c.beginPath(); c.arc(cx, cy, r, 0, TAU);
  c.fillStyle = '#16131b'; c.fill(); c.strokeStyle = 'rgba(225,215,200,0.55)'; c.lineWidth = 1; c.stroke();
  c.beginPath(); c.arc(cx, cy, r * 0.62, 0, TAU); c.fillStyle = '#3a3440'; c.fill();
  ctext(c, stick, cx, cy, Math.max(8, Math.round(h * 0.5)), '#ece4da');
  if (!arrows) return;
  c.fillStyle = GOLD;
  const a = h * 0.2;
  for (const d of arrows) {
    const ax = d < 0 ? x + a * 0.2 : x + w - a * 0.2;
    c.beginPath(); c.moveTo(ax, cy); c.lineTo(ax - d * a, cy - a * 0.8); c.lineTo(ax - d * a, cy + a * 0.8); c.closePath(); c.fill();
  }
}
function dDpad(c, dirs, x, y, h) {
  const cx = x + h / 2, cy = y + h / 2, t = h * 0.34, L = h / 2 - 0.75;
  const arms = { up: [cx - t / 2, cy - L, t, L], down: [cx - t / 2, cy, t, L], left: [cx - L, cy - t / 2, L, t], right: [cx, cy - t / 2, L, t] };
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.fillRect(cx - t / 2 - 1, cy - L - 1, t + 2, 2 * L + 2); c.fillRect(cx - L - 1, cy - t / 2 - 1, 2 * L + 2, t + 2);
  for (const [d, r] of Object.entries(arms)) { c.fillStyle = dirs.includes(d) ? GOLD : '#4a4450'; c.fillRect(r[0], r[1], r[2], r[3]); }
  c.fillStyle = '#2a2530'; c.fillRect(cx - t / 2, cy - t / 2, t, t);
}
function drawPart(c, p, x, y, w, h) {
  switch (p.kind) {
    case 'key': return dKey(c, p.label, x, y, w, h);
    case 'touch': return dTouch(c, p.label, x, y, w, h);
    case 'tstick': return dTouchStick(c, x, y, h);
    case 'dpad': return dDpad(c, p.dirs, x, y, h);
    case 'stick': return dStick(c, p.stick, x, y, w, h, p.dir === 0 ? [-1, 1] : [p.dir]);
    case 'text': c.font = font(Math.max(10, Math.round(h * 0.62)), 700, FONT.body); c.fillStyle = '#c8b8a0'; c.textBaseline = 'middle'; c.fillText(p.label, x + 1, y + h / 2 + 0.5); c.textBaseline = 'alphabetic'; return undefined;
    case 'btn': {
      const i = p.index;
      if (i >= 0 && i <= 3) return dFace(c, p.set, i, x, y, h);
      if (i >= 4 && i <= 7) return dShoulder(c, p.set, i, x, y, w, h);
      if (i === 8 || i === 9) return dMenuBtn(c, p.set, i, x, y, w, h);
      if (i === 10 || i === 11) return dStick(c, i === 10 ? 'L' : 'R', x, y, w, h, null);
      const G = GLYPHS[p.set] ?? GLYPHS.generic;
      return dKey(c, ellipsize(G.labels[i] ?? `#${i}`, 4), x, y, w, h);
    }
    default: return undefined;
  }
}
const GCACHE = new Map();
let mctx = null;
function measureCtx() {
  if (mctx) return mctx;
  try { mctx = document.createElement('canvas').getContext('2d'); } catch { mctx = null; }
  return mctx;
}
function scaleOf(ctx) {
  try { const m = ctx.getTransform?.(); if (!m) return 1; return Math.min(4, Math.max(1, Math.ceil(Math.hypot(m.a, m.b) * 2 - 0.05) / 2)); } catch { return 1; }
}
/** 부품 하나의 너비 (그리지 않음) */
export function bindWidth(spec, h) {
  const c = measureCtx();
  return c ? partWidth(c, spec, Math.round(h)) : h;
}
/** 부품 하나 → 너비. (x, y) = 왼쪽 위, h = 높이. 비트맵 캐시 (기기 배율·글꼴 세대 포함) */
export function drawBind(ctx, spec, x, y, h) {
  if (!spec) return 0;
  h = Math.max(8, Math.round(h));
  if (spec.kind === 'text') {
    ctx.save(); const w = partWidth(ctx, spec, h); drawPart(ctx, spec, x, y, w, h); ctx.restore();
    return w;
  }
  const sc = scaleOf(ctx);
  const key = `${spec.id}|${h}|${sc}|${UI.fontEpoch}`;
  let e = GCACHE.get(key);
  if (!e) {
    const c0 = measureCtx();
    const w = c0 ? partWidth(c0, spec, h) : h;
    try {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.ceil(w * sc)); cv.height = Math.max(1, Math.ceil(h * sc));
      const c = cv.getContext('2d');
      c.scale(sc, sc);
      drawPart(c, spec, 0, 0, w, h);
      e = { cv, w };
    } catch (err) { console.error('[options] glyph', err); return 0; }
    if (GCACHE.size >= 240) GCACHE.clear();
    GCACHE.set(key, e);
  }
  ctx.drawImage(e.cv, x, y, e.w, h);
  return e.w;
}
/** 여러 부품을 한 줄로 (같은 모양은 한 번만). → 끝 x */
export function drawBinds(ctx, specs, x, y, h, gap = 4) {
  const seen = new Set();
  let cx = x;
  for (const s of specs) {
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    cx += drawBind(ctx, s, cx, y, h) + gap;
  }
  return cx - (cx > x ? gap : 0);
}
export function bindsWidth(specs, h, gap = 4) {
  const seen = new Set();
  let w = 0, n = 0;
  for (const s of specs) { if (!s || seen.has(s.id)) continue; seen.add(s.id); w += bindWidth(s, h); n++; }
  return w + Math.max(0, n - 1) * gap;
}
/** 액션의 바인딩 부품 목록 (dev 'key' | 'pad') */
export function actionSpecs(action, dev, max = 4) {
  const B = input.bindings?.[dev === 'pad' ? 'pad' : 'key'] ?? {};
  const set = glyphSet();
  const out = [];
  for (const v of B[action] ?? []) { if (out.length >= max) break; out.push(bindSpec(v, dev, set)); }
  return out;
}

// ───────────────────────── 패드 버튼 읽기 (지정용) ─────────────────────────
/** 연결된 패드마다 지금 눌린 버튼 번호 집합. 트리거(6·7)는 값 0.5 이상 (input.js 와 같은 문턱) */
function padSnapshot() {
  const out = new Map();
  let list = [];
  try { list = navigator.getGamepads ? navigator.getGamepads() : []; } catch { list = []; }
  for (const gp of list || []) {
    if (!gp || gp.connected === false) continue;
    if (PAD_IGNORE.test(String(gp.id ?? '').toLowerCase()) || (gp.buttons?.length ?? 0) < 4) continue;
    const s = new Set();
    gp.buttons.forEach((b, i) => {
      const v = typeof b === 'object' ? Number(b.value) || 0 : Number(b) || 0;
      const pr = typeof b === 'object' ? !!b.pressed : v > 0.5;
      const on = i === 6 || i === 7 ? v >= 0.5 || (pr && v === 0) : pr || v >= 0.5;
      if (on) s.add(i);
    });
    out.set(`${gp.index}|${gp.id}`, s);
  }
  return out;
}
export function padConnected() {
  try { return [...padSnapshot().keys()].length > 0 || !!input.padInfo; } catch { return !!input.padInfo; }
}

// ───────────────────────── 공용 그리기 ─────────────────────────
const GRADS = new Map();
/** 0 → len 의 가로('h')·세로('v') 그라데이션 캐시 (매 프레임 새로 만들지 않는다; 그릴 때 translate 로 옮긴다) */
export function cachedGrad(ctx, key, len, dir, stops) {
  const k = `${key}|${dir}|${Math.round(len)}`;
  let g = GRADS.get(k);
  if (!g) {
    const n = Math.max(1, Math.round(len));
    g = dir === 'v' ? ctx.createLinearGradient(0, 0, 0, n) : ctx.createLinearGradient(0, 0, n, 0);
    for (const [o, c] of stops) g.addColorStop(o, c);
    if (GRADS.size >= 64) GRADS.clear();
    GRADS.set(k, g);
  }
  return g;
}
const BAND_STOPS = [[0, 'rgba(179,18,46,0.72)'], [1, 'rgba(179,18,46,0.06)']];
/** 선택 줄 띠 (진홍 그라데이션 + 금색 화살표) */
export function rowBand(ctx, x, y, w, h, sel, hover, i) {
  if (sel) {
    ctx.save(); ctx.translate(x, 0);
    ctx.fillStyle = cachedGrad(ctx, 'band', w, 'h', BAND_STOPS); ctx.fillRect(0, y + 3, w, h - 6);
    ctx.restore();
    ctx.fillStyle = rgba(GOLD, 0.7); ctx.fillRect(x, y + 3, w * 0.6, 1);
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(x + 5, y + h / 2 - 6); ctx.lineTo(x + 12, y + h / 2); ctx.lineTo(x + 5, y + h / 2 + 6); ctx.fill();
  } else if (hover) { ctx.fillStyle = 'rgba(255,220,160,0.07)'; ctx.fillRect(x, y + 3, w, h - 6); } else if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fillRect(x, y + 3, w, h - 6); }
}
/** 스크롤 막대 */
export function scrollBar(ctx, view, sc, contentH) {
  if (sc.max <= 0) return;
  const x = view.x + view.w - 4, h = Math.max(24, (view.h * view.h) / contentH), y = view.y + (view.h - h) * (sc.y / sc.max);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, view.y, 3, view.h);
  ctx.fillStyle = rgba(GOLD, 0.55); ctx.fillRect(x, y, 3, h);
}

// ───────────────────────── 키·버튼 지정 ─────────────────────────
const ACT_DESC = {
  jump: '공중에서 한 번 더 누르면 2단 점프', attack: '길게 누르면 모아 공격', dash: '회피 · 탈것 돌진', sub: '하트를 써서 보조무기 사용',
  skill1: '스킬 슬롯 1', skill2: '스킬 슬롯 2', swap: '스킬 1·2 페이지 전환', ult: '게이지 MAX · 길게 누르면 각성기',
  awaken: '비워 두면 필살기를 길게 눌러 발동', map: '인벤토리를 바로 엽니다', mount: '탈것을 부르거나 내립니다', guard: '수호신이 스킬을 씁니다',
};
const CAP_TIME = 3, WIZ_TIME = 5;
/** 키 지정 캡처가 잡지 않고 브라우저·OS 에 그대로 넘기는 키 */
const BROWSER_KEYS = new Set(['F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu']);

export class RemapPage {
  constructor(scene, dev) {
    this.sc = scene; this.game = scene.game;
    this.dev = dev === 'key' ? 'key' : 'pad';
    this.title = this.dev === 'pad' ? '게임패드 버튼 지정' : '키보드 키 지정';
    this.sel = 0; this.bsel = 0;
    this.scroll = new Scroll();
    this.cap = null; this.wiz = null; this.flash = {};
    this.swallowCodes = new Set();
    this.listening = false;
    this.msg = null; // 캡처 중 안내 (거부된 키 등)
    this._kd = (e) => this.onKeyDown(e);
    this._ku = (e) => this.onKeyUp(e);
    this.follow = true;
    /** 패드 캡처가 끝날 때 눌려 있던 버튼: 뗄 때까지 메뉴 입력을 막는다 ({btns:Set, t}) */
    this.hold = null;
  }
  get modal() { return !!this.cap; }
  buttons() {
    return this.dev === 'pad'
      ? [['reset', '기본값 복원'], ['arcade', '아케이드 배치'], ['classic', '클래식 배치'], ['wizard', '차례대로 지정']]
      : [['reset', '기본값 복원']];
  }
  get count() { return REMAPPABLE.length + 1; }
  exit() { this.cap = null; this.wiz = null; this.hold = null; this.listen(false); this.swallowCodes.clear(); }
  listen(on) {
    if (on === this.listening || typeof window === 'undefined') return;
    this.listening = on;
    if (on) { window.addEventListener('keydown', this._kd, true); window.addEventListener('keyup', this._ku, true); } else { window.removeEventListener('keydown', this._kd, true); window.removeEventListener('keyup', this._ku, true); }
  }
  /** 캡처 중인 키는 게임 입력으로 가지 않게 (창 캡처 단계에서 멈춘다). 잡은 키는 뗄 때까지 계속 막는다 (반복 입력이 취소·결정으로 새지 않게) */
  onKeyDown(e) {
    if (this.cap && this.dev === 'key') {
      if (BROWSER_KEYS.has(e.code)) return; // 새로 고침·전체 화면·개발자 도구·OS 키는 브라우저 몫 (platform §6.6: F11 은 브라우저에 맡긴다)
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat && !this.cap.key && e.code) { this.cap.key = e.code; this.swallowCodes.add(e.code); }
      return;
    }
    if (this.swallowCodes.has(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  onKeyUp(e) {
    if (this.swallowCodes.delete(e.code) && !this.cap && !this.swallowCodes.size) this.listen(false);
  }
  startCapture(action, wizard = false) {
    this.cap = { action, t: 0, limit: wizard ? WIZ_TIME : CAP_TIME, wizard, key: null, prev: this.dev === 'pad' ? padSnapshot() : null };
    this.msg = null;
    this.sel = REMAPPABLE.indexOf(action);
    this.follow = true;
    if (this.dev === 'key') this.listen(true);
    audio.sfx('menu_ok');
  }
  endCapture(kind) {
    const c = this.cap;
    this.cap = null; this.msg = null;
    input.flush();
    if (this.dev === 'key' && !this.swallowCodes.size) this.listen(false);
    // 캡처는 navigator.getGamepads() 를 틱에서 직접 읽는다. input 은 rAF 첫머리에 읽으므로, 그 사이에 눌린 버튼은
    // input 이 다음 프레임에야 '눌림'으로 본다 (flush 뒤라서 엣지가 산다): ○ 를 지정했더니 이 화면이 닫히거나(취소),
    // START 로 취소했더니 옵션이 닫히는 일이 없도록 그 버튼을 뗄 때까지 메뉴 입력을 막는다
    if (this.dev === 'pad') {
      const btns = new Set();
      for (const s of padSnapshot().values()) for (const i of s) btns.add(i);
      this.hold = btns.size ? { btns, t: 0 } : null;
    }
    if (!c) return;
    if (c.wizard && this.wiz) {
      if (kind === 'cancel') { this.wiz = null; this.game.toast('차례대로 지정을 멈췄습니다', '#e8dcc8', 2); return; }
      this.wiz.i++;
      if (this.wiz.i < REMAPPABLE.length) this.startCapture(REMAPPABLE[this.wiz.i], true);
      else { this.wiz = null; this.game.toast('모든 버튼 지정을 마쳤습니다', '#c8f0c0', 2.4); audio.sfx('levelup'); }
      return;
    }
    if (kind === 'timeout') this.game.toast('시간이 지나 지정을 취소했습니다', '#c8b8a0', 2);
    else if (kind === 'cancel') audio.sfx('menu_cancel');
  }
  apply(value) {
    const c = this.cap;
    const r = input.remap(this.dev, c.action, value);
    if (!r?.ok) {
      audio.sfx('menu_cancel');
      if (r?.reason === 'reserved') this.msg = this.dev === 'pad' ? 'START 와 방향 버튼은 바꿀 수 없습니다. 다른 버튼을 누르세요' : 'Esc · Enter · 방향키 · W 는 바꿀 수 없습니다. 다른 키를 누르세요';
      else this.msg = this.dev === 'pad' ? '이 버튼은 쓸 수 없습니다. 다른 버튼을 누르세요' : '이 키는 쓸 수 없습니다. 다른 키를 누르세요';
      c.t = Math.min(c.t, c.limit - 2.2); // 다시 누를 시간을 준다
      if (this.dev === 'key') c.key = null;
      return;
    }
    saveSettings(this.game);
    this.flash[c.action] = 1;
    audio.sfx('coin');
    if (r.swapped) {
      const nm = ACTION_NAMES[r.swapped] ?? r.swapped;
      this.flash[r.swapped] = 1;
      // 지정하던 행동에 버튼이 없었으면(패드의 각성기, 클래식의 빠른 메뉴) 맞바꿀 것이 없어 상대 행동이 비게 된다: 그렇게 알린다
      const left = input.bindings?.[this.dev]?.[r.swapped] ?? [];
      if (left.length) this.game.toast(`‘${nm}’${josaWa(nm)} 바꿨습니다`, '#ffe0a0', 2.2);
      else this.game.toast(`‘${nm}’의 버튼을 가져왔습니다 · ‘${nm}’${josaEun(nm)} 비어 있습니다`, '#ffd890', 2.8);
    }
    this.endCapture('done');
  }
  runButton(id) {
    const g = this.game;
    if (id === 'reset') {
      input.resetBindings(this.dev);
      saveSettings(g);
      g.toast(this.dev === 'pad' ? '게임패드 배치를 기본값(아케이드)으로 되돌렸습니다' : '키보드 키를 기본값으로 되돌렸습니다', '#e8dcc8', 2.2);
      audio.sfx('menu_ok');
      for (const a of REMAPPABLE) this.flash[a] = 1;
    } else if (id === 'arcade' || id === 'classic') {
      input.setPreset(id);
      saveSettings(g);
      g.toast(`${PRESET_NAMES[id]} 배치로 바꿨습니다`, '#e8dcc8', 2);
      audio.sfx('menu_ok');
      for (const a of REMAPPABLE) this.flash[a] = 1;
    } else if (id === 'wizard') {
      this.wiz = { i: 0 };
      this.startCapture(REMAPPABLE[0], true);
    }
  }
  update(dt, nav, hit) {
    for (const k in this.flash) this.flash[k] = Math.max(0, this.flash[k] - dt * 2.5);
    if (this.cap) {
      const c = this.cap;
      c.t += dt;
      if (input.pointer.tapped) { this.endCapture('cancel'); return null; }
      if (this.dev === 'pad') {
        const cur = padSnapshot();
        let got = null;
        for (const [k, s] of cur) {
          const prev = c.prev?.get(k);
          for (const i of s) if (!prev || !prev.has(i)) { got = i; break; }
          if (got !== null) break;
        }
        c.prev = cur;
        if (got === 9) { this.endCapture('cancel'); return null; }
        if (got !== null) { this.apply(got); return null; }
      } else if (c.key) {
        const code = c.key;
        c.key = null;
        if (code === 'Escape') { this.endCapture('cancel'); return null; }
        this.apply(code);
        return null;
      }
      if (this.cap && c.t >= c.limit) this.endCapture('timeout');
      return null;
    }
    const n = REMAPPABLE.length, btns = this.buttons();
    // 탭
    if (hit != null) {
      if (typeof hit === 'string' && hit.startsWith('rm:')) {
        const i = +hit.slice(3);
        this.sel = i; this.follow = false;
        this.startCapture(REMAPPABLE[i]);
        return null;
      }
      if (typeof hit === 'string' && hit.startsWith('rb:')) {
        const id = hit.slice(3);
        this.sel = n; this.bsel = Math.max(0, btns.findIndex((b) => b[0] === id)); this.follow = false;
        this.runButton(id);
        return null;
      }
    }
    if (this.hold) {
      // 캡처를 끝낸 버튼을 아직 누르고 있으면 그 버튼의 메뉴 뜻(취소·결정·닫기)은 무시 (endCapture 참고, 최대 2초)
      this.hold.t += dt;
      let down = false;
      for (const s of padSnapshot().values()) for (const i of this.hold.btns) if (s.has(i)) down = true;
      if (down && this.hold.t < 2) return null;
      this.hold = null;
    }
    if (nav.cancel || nav.menu) return 'back';
    if (nav.up) { this.sel = (this.sel + n) % (n + 1); this.follow = true; audio.sfx('menu_move'); }
    if (nav.down) { this.sel = (this.sel + 1) % (n + 1); this.follow = true; audio.sfx('menu_move'); }
    if (this.sel === n && (nav.left || nav.right)) {
      this.bsel = clamp(this.bsel + (nav.right ? 1 : -1), 0, btns.length - 1);
      audio.sfx('menu_move');
    }
    if (nav.confirm) {
      if (this.sel < n) this.startCapture(REMAPPABLE[this.sel]);
      else this.runButton(btns[clamp(this.bsel, 0, btns.length - 1)][0]);
    }
    return null;
  }
  /** 기기 상태 안내 (P-29: 이 기기로는 할 수 없는 지정이면 알려 준다) */
  status() {
    const m = input.mode;
    if (this.dev === 'key') {
      if (m === 'pad') return { text: '게임패드로는 키보드 키를 지정할 수 없습니다. 키보드를 사용하세요', warn: true };
      if (m === 'touch') return { text: '키보드가 연결되어 있을 때 쓸 수 있습니다. 줄을 누른 뒤 키보드 키를 누르세요', warn: true };
      return { text: '줄을 고르고 새 키를 누르세요. 첫 번째 키가 화면 안내에 표시됩니다', warn: false };
    }
    const info = input.padInfo;
    const preset = PRESET_NAMES[this.game.settings?.ctrlPreset] ?? PRESET_NAMES.arcade;
    if (!info && !padConnected()) return { text: '연결된 게임패드가 없습니다. 게임패드의 아무 버튼이나 누르면 연결됩니다', warn: true };
    const nonstd = info && info.standard === false ? ' · 표준 배치가 아닌 게임패드: 「차례대로 지정」을 권장합니다' : '';
    return { text: `${info?.name ?? '게임패드'} · 지금 배치: ${preset}${nonstd}`, warn: !!nonstd };
  }
  hints() {
    if (this.cap) return this.dev === 'pad' ? [[null, '', '게임패드 버튼을 누르세요 · 화면을 누르면 취소']] : [[null, '', '키보드 키를 누르세요 · 화면을 누르면 취소']];
    if (input.mode === 'touch') return [[null, '', '줄을 누른 뒤 새 버튼을 누르세요 · 위아래로 밀면 더 보입니다']];
    return [['dpadV', '행동'], ['confirm', '지정'], ['cancel', '뒤로']];
  }
  render(ctx, L, owner) {
    const { th } = L, view = L.list;
    const n = REMAPPABLE.length;
    // 상태 줄
    const st = this.status();
    text(ctx, st.text, L.content.x + L.content.w / 2, L.content.y + 20, { size: 13, align: 'center', weight: 700, color: st.warn ? '#ffd890' : DIM, ow: 2, maxWidth: L.content.w - 20 });
    // 목록: 12 줄 + 단추 줄
    const rowH = th, btnH = th + 12;
    const contentH = n * rowH + btnH;
    this.scroll.bounds(contentH, view.h);
    if (this.follow) {
      const top = this.sel < n ? this.sel * rowH : n * rowH;
      this.scroll.show(top, top + (this.sel < n ? rowH : btnH), view.h);
      this.follow = false;
    }
    const sy = Math.round(this.scroll.y);
    const hover = input.mode === 'kb' ? taps.over(owner) : null;
    ctx.save();
    ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip();
    const gh = Math.round(Math.min(30, th * 0.56));
    for (let i = 0; i < n; i++) {
      const a = REMAPPABLE[i], y = view.y + i * rowH - sy;
      if (y > view.y + view.h || y + rowH < view.y) continue;
      const sel = this.sel === i && !this.wiz || (this.cap && this.cap.action === a);
      rowBand(ctx, view.x, y, view.w - 8, rowH, sel, hover === `rm:${i}`, i);
      const fl = this.flash[a] ?? 0;
      if (fl > 0) { ctx.fillStyle = rgba(GOLD, 0.22 * fl); ctx.fillRect(view.x, y + 3, view.w - 8, rowH - 6); }
      const nm = ACTION_NAMES[a] ?? a;
      text(ctx, nm, view.x + 20, y + rowH / 2 - 1, { size: 16, weight: 800, color: sel ? '#fff4dc' : BONE, ow: 2 });
      const desc = ACT_DESC[a];
      if (desc) text(ctx, desc, view.x + 20, y + rowH / 2 + 15, { size: 11, weight: 600, color: DIM, ow: 2, maxWidth: view.w * 0.5 });
      const specs = actionSpecs(a, this.dev);
      const gx = view.x + view.w - 22;
      if (this.cap && this.cap.action === a) {
        const k = 0.5 + 0.5 * Math.sin(this.game.time * 10);
        text(ctx, this.dev === 'pad' ? '버튼을 누르세요…' : '키를 누르세요…', gx, y + rowH / 2 + 5, { size: 15, align: 'right', weight: 800, color: rgba('#ffd27a', 0.6 + 0.4 * k), ow: 2 });
      } else if (!specs.length) {
        text(ctx, a === 'awaken' ? '비어 있음 (필살기 길게)' : '비어 있음', gx, y + rowH / 2 + 5, { size: 13, align: 'right', weight: 700, color: DIM, ow: 2 });
      } else {
        const w = bindsWidth(specs, gh, 6);
        drawBinds(ctx, specs, gx - w, y + (rowH - gh) / 2, gh, 6);
      }
      const vis = { x: view.x, y: Math.max(view.y, y), w: view.w - 8, h: Math.min(view.y + view.h, y + rowH) - Math.max(view.y, y) };
      if (!this.cap && vis.h >= rowH * 0.8) taps.add(`rm:${i}`, vis, { owner, kind: 'list', src: 'options.remap' });
    }
    // 단추 줄
    const by = view.y + n * rowH - sy + 8, btns = this.buttons();
    if (by < view.y + view.h && by + th > view.y) {
      const gap = 10, bw = Math.min(200, (view.w - 8 - gap * (btns.length - 1)) / btns.length);
      const x0 = view.x + (view.w - 8 - (bw * btns.length + gap * (btns.length - 1))) / 2;
      btns.forEach(([id, label], i) => {
        const r = { x: x0 + i * (bw + gap), y: by, w: bw, h: th };
        gbutton(ctx, r, label, { selected: this.sel === n && this.bsel === i, size: 15 });
        if (!this.cap && r.y >= view.y && r.y + r.h <= view.y + view.h) taps.add(`rb:${id}`, r, { owner, kind: 'primary', src: 'options.remap' });
      });
    }
    ctx.restore();
    scrollBar(ctx, view, this.scroll, contentH);
    if (this.cap) this.renderCapture(ctx, L, owner);
  }
  renderCapture(ctx, L, owner) {
    const c = this.cap, W = L.W, H = L.H;
    const nm = ACTION_NAMES[c.action] ?? c.action;
    // 터치: 눈에 보이는 취소 단추 (≥ 44 CSS px). 화면 어디를 눌러도 취소되는 것은 그대로
    const touch = input.mode === 'touch';
    const w = Math.min(520, W - 40), h = touch ? 124 + L.th + 14 : 170, x = (W - w) / 2, y = Math.max(L.content.y, (H - h) / 2);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
    frame(ctx, x, y, w, h, { glow: 0.6, accent: GOLD });
    if (this.wiz) text(ctx, `차례대로 지정 ${this.wiz.i + 1} / ${REMAPPABLE.length}`, W / 2, y + 26, { size: 13, align: 'center', weight: 700, color: GOLD, ow: 2 });
    const head = this.dev === 'pad' ? `‘${nm}’에 쓸 새 버튼을 누르세요…` : `‘${nm}’에 쓸 새 키를 누르세요…`;
    text(ctx, head, W / 2, y + 58, { size: 19, align: 'center', weight: 800, family: FONT.title, color: '#fff0d0', ow: 3, maxWidth: w - 30 });
    // 남은 시간 막대
    const k = clamp(1 - c.t / c.limit, 0, 1), bw = w - 80;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 40, y + 76, bw, 6);
    ctx.fillStyle = k > 0.3 ? GOLD : '#ff7a6a'; ctx.fillRect(x + 40, y + 76, bw * k, 6);
    text(ctx, `${Math.ceil(c.limit - c.t)}초`, x + w - 36, y + 83, { size: 12, align: 'left', weight: 800, family: FONT.num, color: DIM, ow: 2 });
    if (this.msg) text(ctx, this.msg, W / 2, y + 108, { size: 13, align: 'center', weight: 700, color: '#ff9a8a', ow: 2, maxWidth: w - 30 });
    if (touch) {
      if (!this.msg && c.wizard) text(ctx, '기다리면 다음 행동으로 넘어갑니다', W / 2, y + 108, { size: 13, align: 'center', weight: 700, color: DIM, ow: 2, maxWidth: w - 30 });
      const cw = Math.min(200, w - 60), r = { x: W / 2 - cw / 2, y: y + h - L.th - 14, w: cw, h: L.th };
      gbutton(ctx, r, '취소', { size: 16 });
      if (owner) taps.add('cap:cancel', r, { owner, kind: 'primary', src: 'options.capture' });
      ctx.restore();
      return;
    }
    // 취소 안내: 패드 START / 키보드 Esc (글리프)
    const gh = 22, cy = y + h - 40;
    const cancelSpec = this.dev === 'pad' ? bindSpec(9, 'pad') : bindSpec('Escape', 'key');
    const t1 = '취소:', t2 = c.wizard ? ' · 건너뛰려면 기다리세요' : '';
    ctx.font = font(13, 700, FONT.body);
    const w1 = ctx.measureText(t1 + ' ').width, gw = bindWidth(cancelSpec, gh), w2 = t2 ? ctx.measureText(t2).width : 0;
    let cx = W / 2 - (w1 + gw + w2) / 2;
    text(ctx, t1, cx, cy + gh / 2 + 5, { size: 13, weight: 700, color: BONE, ow: 2 });
    cx += w1;
    cx += drawBind(ctx, cancelSpec, cx, cy, gh);
    if (t2) text(ctx, t2, cx, cy + gh / 2 + 5, { size: 13, weight: 700, color: DIM, ow: 2 });
    ctx.restore();
  }
  /** 매 틱 스크롤 입력 (캡처 중에는 멈춤) */
  tick(dt, L) { if (!this.cap && L) this.scroll.update(dt, L.list); }
}

// ───────────────────────── 조작 안내 ─────────────────────────
/** 키보드 안내 줄 (input.bindings.key 에서): [부품…], 라벨 */
function keyboardRows() {
  const K = input.bindings?.key ?? {};
  const k = (a, n = 1) => (K[a] ?? []).slice(0, n).map((code) => bindSpec(code, 'key'));
  const T = (label) => ({ id: 'x:' + label, kind: 'text', label });
  const awaken = k('awaken');
  return [
    [[...k('left'), ...k('right')], '이동'],
    [[...k('up'), ...k('down')], '위 공격 · 웅크리기'],
    [k('jump', 2), '점프 (공중에서 한 번 더)'],
    [k('attack', 2), '공격 (길게: 모아 공격)'],
    [k('dash', 3), '대시 · 회피'],
    [k('sub'), '보조무기 (하트 소모)'],
    [[...k('skill1'), ...k('skill2')], '스킬 1 · 스킬 2'],
    [k('swap', 2), '스킬 페이지 전환'],
    [k('ult'), '필살기 (게이지 MAX)'],
    [[...k('ult'), T('길게'), ...(awaken.length ? [T('/'), ...awaken] : [])], '각성기'],
    [k('mount'), '탈것 탑승 · 하차'],
    [k('guard'), '수호신 스킬'],
    [k('map', 2), '빠른 메뉴 (인벤토리)'],
    [k('menu', 2), '일시정지'],
    [[...k('right'), ...k('right').map((s) => ({ ...s, id: s.id + '#2' }))], '질주 (같은 방향 두 번)'],
    [[...k('viewL'), ...k('viewR')], '영웅 회전 (장비 화면)'],
  ];
}
/** 패드 버튼 번호 → 설명 (게임 액션 이름들, 메뉴 뜻) — input.bindings.pad 에서 */
function padLabels() {
  const P = input.bindings?.pad ?? {};
  const game = new Map(), menu = new Map();
  const add = (m, i, s) => { if (!m.has(i)) m.set(i, []); if (!m.get(i).includes(s)) m.get(i).push(s); };
  const awakenBound = (P.awaken ?? []).some(Number.isInteger);
  const GP = [['jump', '점프'], ['attack', '공격'], ['dash', '대시'], ['sub', '보조무기'], ['skill1', '스킬 1'], ['skill2', '스킬 2'], ['swap', '스킬 페이지'],
    ['ult', awakenBound ? '필살기' : '필살기 (길게: 각성기)'], ['awaken', '각성기'], ['map', '빠른 메뉴'], ['menu', '일시정지'], ['mount', '탈것'], ['guard', '수호신']];
  for (const [a, nm] of GP) for (const b of P[a] ?? []) if (Number.isInteger(b)) add(game, b, nm);
  for (const [a, nm] of [['confirm', '결정'], ['cancel', '취소']]) for (const b of P[a] ?? []) if (Number.isInteger(b)) add(menu, b, nm);
  return { game, menu };
}

export class GuidePage {
  constructor(scene, tab) {
    this.sc = scene; this.game = scene.game;
    this.title = '조작 안내';
    this.tabs = ['키보드', '게임패드', '터치'];
    this.tab = Number.isInteger(tab) ? clamp(tab, 0, 2) : input.mode === 'pad' ? 1 : input.mode === 'touch' ? 2 : 0;
    this.modal = false;
    this.anim = 1;
  }
  setTab(i) {
    i = clamp(i, 0, this.tabs.length - 1);
    if (i !== this.tab) { this.tab = i; this.anim = 0; audio.sfx('menu_move'); }
  }
  exit() {}
  tick() {}
  update(dt, nav) {
    this.anim = Math.min(1, this.anim + dt * 5);
    if (nav.cancel || nav.menu) return 'back';
    if (nav.prevTab || nav.left) this.setTab((this.tab + this.tabs.length - 1) % this.tabs.length);
    else if (nav.nextTab || nav.right) this.setTab((this.tab + 1) % this.tabs.length);
    return null;
  }
  hints() {
    if (input.mode === 'touch') return [[null, '', '위의 탭을 눌러 기기를 바꿉니다']];
    return [[['prevTab', 'nextTab'], '기기'], ['dpadH', '전환'], ['cancel', '뒤로']];
  }
  render(ctx, L) {
    const r = L.content;
    ctx.save();
    ctx.globalAlpha *= ease.outCubic(this.anim);
    if (this.tab === 0) this.keyboard(ctx, r);
    else if (this.tab === 1) this.pad(ctx, r);
    else this.touch(ctx, r);
    ctx.restore();
  }

  keyboard(ctx, r) {
    const rows = keyboardRows();
    const noteH = 44;
    const half = Math.ceil(rows.length / 2);
    const rh = clamp((r.h - noteH - 16) / half, 24, 40);
    const gh = Math.round(clamp(rh * 0.66, 18, 26));
    const colW = (r.w - 36) / 2;
    rows.forEach(([specs, label], i) => {
      const col = i < half ? 0 : 1, row = col ? i - half : i;
      const x = r.x + 16 + col * (colW + 8), y = r.y + 10 + row * rh;
      if (row % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(x, y + 1, colW, rh - 2); }
      const ex = drawBinds(ctx, specs, x + 8, y + (rh - gh) / 2, gh, 4);
      const lx = Math.max(ex + 10, x + Math.min(150, colW * 0.42));
      text(ctx, label, lx, y + rh / 2 + 5, { size: 14, weight: 700, color: BONE, ow: 2, maxWidth: x + colW - lx - 6 });
    });
    const ny = r.y + 10 + half * rh + 8;
    ctx.fillStyle = 'rgba(179,18,46,0.2)'; ctx.fillRect(r.x + 12, ny, r.w - 24, noteH - 6);
    text(ctx, '커맨드 기술: 비전서를 얻으면 ↓↘→ + 공격 같은 격투 커맨드로 기술을 씁니다 (→ = 바라보는 방향)', r.x + r.w / 2, ny + 16, { size: 12, align: 'center', weight: 700, color: '#ffe0b0', ow: 2, maxWidth: r.w - 40 });
    drawHints(ctx, [['confirm', '결정'], ['cancel', '취소'], [['prevTab', 'nextTab'], '탭 전환']], r.x + r.w / 2, ny + 33, { align: 'center', size: 12, mode: 'kb', color: DIM });
  }

  pad(ctx, r) {
    const set = glyphSet();
    const { game: gl, menu: ml } = padLabels();
    const s = clamp(Math.min((r.w - 400) / 420, (r.h - 70) / 190), 0.55, 1.1);
    const cx = r.x + r.w / 2, cy = r.y + 16 + (r.h - 70) / 2;
    // 컨트롤러 몸체
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(s, s);
    ctx.fillStyle = '#1c1620'; ctx.strokeStyle = 'rgba(232,200,114,0.55)'; ctx.lineWidth = 2 / s;
    ctx.beginPath();
    ctx.moveTo(-150, -50); ctx.quadraticCurveTo(0, -78, 150, -50);
    ctx.quadraticCurveTo(200, -40, 190, 40); ctx.quadraticCurveTo(180, 100, 130, 80);
    ctx.quadraticCurveTo(90, 40, 0, 40); ctx.quadraticCurveTo(-90, 40, -130, 80);
    ctx.quadraticCurveTo(-180, 100, -190, 40); ctx.quadraticCurveTo(-200, -40, -150, -50);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // 몸체 위 버튼 글리프 (지금 글리프 세트)
    const P = { 6: [-140, -84], 4: [-140, -62], dpad: [-104, -14], ls: [-58, 22], 8: [-22, -22], 9: [22, -22], rs: [58, 22], 7: [140, -84], 5: [140, -62], 3: [104, -34], 1: [124, -14], 2: [84, -14], 0: [104, 6] };
    const at = (k) => [cx + P[k][0] * s, cy + P[k][1] * s];
    const gOn = Math.round(clamp(18 * s, 12, 20));
    const put = (k, spec) => { const [x, y] = at(k); const w = bindWidth(spec, gOn); drawBind(ctx, spec, x - w / 2, y - gOn / 2, gOn); };
    for (const i of [6, 4, 7, 5, 8, 9, 3, 1, 2, 0]) put(i, bindSpec(i, 'pad', set));
    put('dpad', { id: 'd:all', kind: 'dpad', dirs: ['up', 'down', 'left', 'right'] });
    put('ls', { id: `s:${set}:L:0`, kind: 'stick', set, stick: 'L', dir: 0 });
    put('rs', { id: `s:${set}:R:0`, kind: 'stick', set, stick: 'R', dir: 0 });
    // 설명선
    const lab = (i) => {
      const g = gl.get(i) ?? [], m = ml.get(i) ?? [];
      return { g: g.join(' · ') || (m.length ? '' : '—'), m: m.length ? `메뉴 ${m.join('·')}` : '' };
    };
    // 옆 칸: 어깨·방향·스틱 / 얼굴 버튼(위→오른쪽→아래→왼쪽 순, 설명선이 덜 엇갈리게). SELECT·START 는 몸체 위 가운데
    const left = [[6, 6], [4, 4], ['dpad', 'dpad'], ['ls', 'ls'], [10, 'ls']];
    const right = [[7, 7], [5, 5], [3, 3], [1, 1], [0, 0], [2, 2], [11, 'rs']];
    const gh = Math.round(clamp(20 * Math.max(s, 0.85), 16, 22));
    const rowsN = Math.max(left.length, right.length);
    const top = r.y + 10, span = r.h - 70 - 6, step = clamp(span / rowsN, 22, 38);
    const drawSide = (list, side) => {
      list.forEach(([k, anchor], j) => {
        const y = top + j * step + (rowsN - list.length) * step / 2;
        let spec, L1, L2 = '';
        if (k === 'dpad') { spec = { id: 'd:all', kind: 'dpad', dirs: ['up', 'down', 'left', 'right'] }; L1 = '이동 · 메뉴 선택'; }
        else if (k === 'ls') { spec = { id: `s:${set}:L:0`, kind: 'stick', set, stick: 'L', dir: 0 }; L1 = '이동 (살짝 기울이면 걷기)'; }
        else { spec = bindSpec(k, 'pad', set); const l = lab(k); L1 = l.g; L2 = l.m; }
        const w = bindWidth(spec, gh);
        const x = side < 0 ? r.x + 12 : r.x + r.w - 12 - w;
        drawBind(ctx, spec, x, y, gh);
        const tx = side < 0 ? x + w + 6 : x - 6;
        const maxW = Math.max(60, (r.w / 2) - 210 * s - w - 20);
        text(ctx, L1, tx, y + gh / 2 + (L2 ? -1 : 5), { size: 13, align: side < 0 ? 'left' : 'right', weight: 800, color: L1 === '—' ? '#6a5e5e' : BONE, ow: 2, maxWidth: maxW });
        if (L2) text(ctx, L2, tx, y + gh / 2 + 13, { size: 11, align: side < 0 ? 'left' : 'right', weight: 700, color: DIM, ow: 2, maxWidth: maxW });
        // 설명선 → 버튼 위치
        ctx.font = font(13, 800, FONT.body);
        const tw = Math.min(maxW, ctx.measureText(L1).width);
        const sx = side < 0 ? tx + tw + 6 : tx - tw - 6, sy = y + gh / 2;
        const [ex, ey] = at(anchor);
        const mx = sx + (side < 0 ? 10 : -10);
        if ((side < 0 && ex > mx) || (side > 0 && ex < mx)) {
          ctx.strokeStyle = 'rgba(232,200,114,0.3)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(mx, sy); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(ex, ey, 2, 0, TAU); ctx.fill();
        }
      });
    };
    drawSide(left, -1); drawSide(right, 1);
    const topY = Math.max(r.y + 6, cy - 116 * s);
    for (const [i, side] of [[8, -1], [9, 1]]) {
      const spec = bindSpec(i, 'pad', set), w = bindWidth(spec, gh);
      const L1 = lab(i).g;
      const [bx, bY] = at(i);
      const gx = side < 0 ? cx - 14 - w : cx + 14;
      ctx.strokeStyle = 'rgba(232,200,114,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(gx + w / 2, topY + gh); ctx.lineTo(bx, bY - gOn / 2); ctx.stroke();
      drawBind(ctx, spec, gx, topY, gh);
      text(ctx, L1, side < 0 ? gx - 6 : gx + w + 6, topY + gh / 2 + 5, { size: 13, align: side < 0 ? 'right' : 'left', weight: 800, color: L1 === '—' ? '#6a5e5e' : BONE, ow: 2 });
    }
    // 아래 두 줄: 배치 · 글리프 세트 / 오른쪽 스틱 · 기타 버튼
    const by = r.y + r.h - 44;
    const preset = PRESET_NAMES[this.game.settings?.ctrlPreset] ?? PRESET_NAMES.arcade;
    const extra = [];
    for (const [i, names] of gl) if (i > 16) extra.push(`#${i} ${names.join('·')}`);
    text(ctx, `배치: ${preset} · 버튼 모양: ${SET_NAMES[set] ?? set}${extra.length ? ' · 기타 버튼 ' + extra.join(', ') : ''}`, r.x + r.w / 2, by + 10, { size: 12, align: 'center', weight: 700, color: GOLD, ow: 2, maxWidth: r.w - 30 });
    drawHints(ctx, [['stickR', '영웅 회전 · 목록 스크롤'], [['prevTab', 'nextTab'], '메뉴 탭'], ['confirm', '결정'], ['cancel', '취소']], r.x + r.w / 2, by + 32, { align: 'center', size: 12, mode: 'pad', color: DIM });
  }

  touch(ctx, r) {
    const notes = [
      this.game.settings?.touchStick === 'fixed' ? '왼쪽 아래 스틱으로 이동 · 끝까지 밀면 질주합니다' : '화면 왼쪽 아무 곳이나 누르면 스틱이 생깁니다 · 바깥 고리 너머로 밀면 질주',
      '필살 버튼: 게이지가 차면 필살기 · 두 게이지가 모두 차면 길게 눌러 각성기',
      '탑승 · 수호 버튼은 스킬 버튼 위에 있습니다 (탈것·수호신을 데려가면 나타납니다)',
      '⇄ 버튼: 스킬 페이지 전환 · 위 가운데 Ⅱ: 일시정지 · 가방: 빠른 메뉴',
      '메뉴 화면에서는 항목을 직접 누르고, 위아래로 밀어 목록을 넘깁니다',
    ];
    const lh = 20, notesH = notes.length * lh + 10;
    let vw = 844, vh = 390;
    try { vw = window.innerWidth || vw; vh = window.innerHeight || vh; } catch { /* 창 없음 */ }
    if (vh > vw) [vw, vh] = [vh, vw];
    const maxH = Math.max(80, r.h - notesH - 20);
    const sw = Math.min(r.w - 40, maxH * (vw / vh)), sh = sw * (vh / vw);
    const sx = r.x + (r.w - sw) / 2, sy = r.y + 10;
    const k = sw / vw;
    ctx.fillStyle = '#0c0810'; ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = 'rgba(232,200,114,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(sx - 4, sy - 4, sw + 8, sh + 8);
    // 배치: 실제 가상 패드(사용자 배치·왼손 모드 포함). 없으면 기본 배치
    let bs = [];
    try { bs = touchpad.buttons?.({ all: true }) ?? []; } catch { bs = []; }
    if (!bs.length) {
      for (const [id, [rr, bb, d]] of Object.entries(PAD_LAYOUT_S)) bs.push({ id, cx: vw - rr, cy: vh - bb, d });
      bs.push({ id: 'pause', cx: vw / 2 - 26, cy: 28, d: 44 }, { id: 'bag', cx: vw / 2 + 26, cy: 28, d: 44 });
    }
    const left = !!this.game.settings?.touchLeftHanded;
    // 스틱
    const stx = sx + (left ? vw * 0.8 : vw * 0.2) * k, sty = sy + vh * 0.7 * k, sr = 60 * k;
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(232,200,114,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(stx, sty, sr, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#6a1a26'; ctx.beginPath(); ctx.arc(stx, sty, 26 * k, 0, TAU); ctx.fill();
    text(ctx, '스틱', stx, sty + sr + 14, { size: 11, align: 'center', weight: 700, color: DIM, ow: 2 });
    for (const b of bs) {
      const x = sx + b.cx * k, y = sy + b.cy * k, rad = Math.max(7, (b.d / 2) * k);
      if (x < sx - rad || x > sx + sw + rad) continue;
      const cmp = b.id === 'mount' || b.id === 'guard', sys = b.id === 'pause' || b.id === 'bag' || b.id === 'fullscreen';
      ctx.beginPath();
      if (sys) ctx.rect(x - rad, y - rad, rad * 2, rad * 2); else ctx.arc(x, y, rad, 0, TAU);
      ctx.fillStyle = b.id === 'ult' ? '#6a4a10' : cmp ? '#233a2a' : sys ? '#2a2230' : '#4a1020'; ctx.fill();
      ctx.strokeStyle = cmp ? '#9fe0a0' : 'rgba(232,200,114,0.7)'; ctx.lineWidth = 1; ctx.stroke();
      const lb = TOUCH_LABELS[b.id] ?? (b.id === 'fullscreen' ? '전체' : b.id);
      text(ctx, lb, x, y + 4, { size: clamp(rad * 0.62, 9, 13), align: 'center', weight: 800, color: '#f3e2b8', ow: 0 });
    }
    notes.forEach((n, i) => text(ctx, n, r.x + r.w / 2, sy + sh + 24 + i * lh, { size: 13, align: 'center', weight: i < 3 ? 700 : 600, color: i === 2 ? '#bfe8c0' : i < 2 ? BONE : DIM, ow: 2, maxWidth: r.w - 24 }));
  }
}

// ───────────────────────── 문구 도우미 (옵션 첫 화면) ─────────────────────────
/** 프리셋 설명: "✕ 점프 · □ 공격 · ○ 대시 · △ 보조무기" (지금 글리프 세트의 버튼 이름으로) */
export function presetSummary(name) {
  const P = PAD_PRESETS[name];
  if (!P) return '';
  const set = glyphSet();
  const bn = (a) => { const b = (P[a] ?? []).find(Number.isInteger); return b == null ? '' : padButtonName(set, b); };
  return [['jump', '점프'], ['attack', '공격'], ['dash', '대시'], ['sub', '보조무기']].map(([a, nm]) => `${bn(a)} ${nm}`).join(' · ');
}
