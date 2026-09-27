// 공용 대화 상자: 확인(예/아니요) 오버레이, 세이브 코드 내보내기/가져오기(텍스트 상자 오버레이)
// 플랫폼 (platform §6.2 · §6.3 · §4.5, P-29) — owner: PLAT-FRONT-A
//  - 두 장면 모두 uiScale (game.uiW × game.uiH). 버튼 줄 ≥ 36 CSS px (목록 줄), 안내 줄은 지금 기기의 글리프
//  - saveCode 의 입력 칸(DOM <textarea>)은 uiK 를 곱해 캔버스 위 제자리에 둔다
//  - 컨트롤러로는 코드를 입력·복사할 수 없으므로 패드 모드에서는 그 안내를 보인다 (P-29; 클라우드 저장이 대신한다)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { saves } from '../../core/save.js';
import { text, wrap, FONT, ListMenu } from '../../core/ui.js';
import { drawHints, promptMode } from '../../core/prompts.js';
import { clamp, ease } from '../../core/math.js';
import { frame, gbutton, ornament, GOLD, BONE, DIM } from './common.js';

const PAD_IMPORT = '컨트롤러로는 코드를 입력할 수 없습니다. 키보드나 터치를 사용하세요';
const PAD_EXPORT = '컨트롤러로는 코드를 복사할 수 없습니다. 키보드나 터치를 사용하세요';
const PAD_CLOUD = '계정에 로그인하면 클라우드 저장으로 다른 기기에 옮길 수 있습니다';

/** 버튼 높이 (UI px): 목록 줄 36 CSS px 이상 (여유 2) */
function btnH(g) { const per = Math.max(0.2, (g.cssScale || 1) * (g.uiK || 1)); return clamp(Math.ceil(38 / per), 46, 52); }

/**
 * push('frontConfirm', { title, message, yes, no, danger, onYes, onNo })
 * 키보드·패드 ←→ 선택, 결정/취소 / 터치 버튼
 */
export class ConfirmScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; }
  enter({ title = '확인', message = '', yes = '예', no = '아니요', danger = false, onYes, onNo, defaultYes = false } = {}) {
    Object.assign(this, { title, message, yes, no, danger, onYes, onNo });
    this.menu = new ListMenu(2, { cols: 2, index: defaultYes ? 0 : 1 });
    audio.sfx(danger ? 'warning' : 'menu_move', { vol: danger ? 0.5 : 1 });
  }
  update(dt) {
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'confirm') this.close(this.menu.index === 0);
    else if (r === 'cancel' || input.pressed('menu')) this.close(false);
  }
  close(ok) {
    if (this.done) return;
    this.done = true;
    audio.sfx(ok ? 'menu_ok' : 'menu_cancel');
    this.game.pop();
    (ok ? this.onYes : this.onNo)?.();
  }
  render(ctx) {
    const g = this.game, vw = g.uiW || g.viewW, vh = g.uiH || g.viewH;
    const k = ease.outBack(clamp(this.t / 0.22, 0, 1));
    ctx.fillStyle = `rgba(2,0,4,${0.7 * clamp(this.t / 0.15, 0, 1)})`; ctx.fillRect(0, 0, vw, vh);
    const w = Math.min(560, vw - 60);
    const lines = wrap(ctx, this.message, w - 80, 16, 500).slice(0, 6);
    const bh = btnH(g);
    const h = Math.min(vh - 24, 116 + bh + lines.length * 26), x = vw / 2 - w / 2, y = vh / 2 - h / 2;
    ctx.save();
    ctx.translate(vw / 2, vh / 2); ctx.scale(0.9 + 0.1 * k, 0.9 + 0.1 * k); ctx.translate(-vw / 2, -vh / 2);
    ctx.globalAlpha = clamp(this.t / 0.15, 0, 1);
    const acc = this.danger ? '#ff4a5a' : GOLD;
    frame(ctx, x, y, w, h, { accent: acc, glow: 0.8 });
    text(ctx, this.title, vw / 2, y + 40, { size: 22, align: 'center', weight: 800, family: FONT.title, color: this.danger ? '#ff8a8a' : '#ffe7a0', ow: 3, maxWidth: w - 40 });
    ornament(ctx, vw / 2, y + 56, 280, { color: acc });
    lines.forEach((l, i) => text(ctx, l, vw / 2, y + 88 + i * 26, { size: 16, align: 'center', color: BONE, ow: 2 }));
    const bw = Math.min(190, (w - 60) / 2), by = y + h - bh - 20;
    const r1 = { x: vw / 2 - bw - 12, y: by, w: bw, h: bh }, r2 = { x: vw / 2 + 12, y: by, w: bw, h: bh };
    this.menu.hit(0, r1); this.menu.hit(1, r2);
    gbutton(ctx, r1, this.yes, { selected: this.menu.index === 0, accent: acc, size: 17 });
    gbutton(ctx, r2, this.no, { selected: this.menu.index === 1, size: 17 });
    ctx.restore();
  }
}

/**
 * push('saveCode', { mode:'export'|'import', slot, onDone(ok) })
 * 캔버스 위에 실제 <textarea> 를 띄워 복사/붙여넣기를 지원한다.
 */
export class SaveCodeScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; }
  enter({ mode = 'export', slot = 1, onDone } = {}) {
    this.mode = mode; this.slot = slot; this.onDone = onDone;
    this.code = mode === 'export' ? (saves.exportCode(slot) ?? '') : '';
    this.msg = mode === 'export' ? '아래 코드를 복사해 안전한 곳에 보관하세요. 다른 기기에서 「코드 가져오기」로 불러올 수 있습니다.' : '보관해 둔 세이브 코드를 아래 칸에 붙여 넣으세요. 이 슬롯의 기존 기록은 덮어쓰기됩니다.';
    this.buttons = mode === 'export' ? [['복사하기', () => this.copy()], ['닫기', () => this.close(true)]] : [['붙여넣기', () => this.paste()], ['가져오기', () => this.doImport()], ['취소', () => this.close(false)]];
    this.menu = new ListMenu(this.buttons.length, { cols: this.buttons.length, index: 0 });
    this.makeBox();
  }
  makeBox() {
    if (typeof document === 'undefined') return;
    const ta = document.createElement('textarea');
    ta.value = this.code;
    ta.spellcheck = false;
    ta.readOnly = this.mode === 'export';
    ta.placeholder = '여기에 코드를 붙여 넣으세요';
    ta.setAttribute('aria-label', this.mode === 'export' ? '세이브 코드' : '세이브 코드 입력');
    Object.assign(ta.style, {
      position: 'fixed', zIndex: 40, resize: 'none', boxSizing: 'border-box', padding: '10px 12px',
      background: 'rgba(8,3,10,0.94)', color: '#efe4cf', border: '1px solid #8a6a2a', borderRadius: '2px',
      font: '12px/1.45 ui-monospace, Menlo, Consolas, monospace', outline: 'none', wordBreak: 'break-all',
      boxShadow: 'inset 0 0 18px rgba(179,18,46,0.35)', touchAction: 'auto', userSelect: 'text', webkitUserSelect: 'text',
    });
    // 게임 키 매핑(preventDefault)이 타이핑/붙여넣기를 막지 않도록 전파 차단.
    //  · 내보내기(읽기 전용): 복사 단축키(Ctrl/⌘+C 등)만 막고 나머지(Z·X·방향키·Enter·Esc)는 게임으로 흘려 버튼을 키보드로 조작
    //  · 가져오기: Enter = 가져오기, Esc = 입력 칸에서 빠져나와 키보드로 버튼 조작 (한 번 더 Esc/X 면 닫기)
    const onKey = (e) => {
      if (ta.readOnly && !(e.ctrlKey || e.metaKey)) return;
      e.stopPropagation();
      if (e.type !== 'keydown' || e.isComposing) return;
      if (e.key === 'Escape') { e.preventDefault(); ta.blur(); }
      else if (e.key === 'Enter' && !e.shiftKey && !ta.readOnly) { e.preventDefault(); audio.sfx('menu_ok'); this.doImport(); }
    };
    ta.addEventListener('keydown', onKey); ta.addEventListener('keyup', onKey);
    ta.addEventListener('pointerdown', (e) => e.stopPropagation());
    ta.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    document.body.appendChild(ta);
    this.ta = ta;
    this.place();
    if (this.mode === 'export' && promptMode() !== 'touch') setTimeout(() => { try { if (this.ta === ta) { ta.focus(); ta.select(); } } catch { /* 무시 */ } }, 50);
  }
  /** 상자 배치 (UI 좌표): 높이가 모자라면 입력 칸을 줄인다 */
  layout() {
    const g = this.game, vw = g.uiW || g.viewW, vh = g.uiH || g.viewH;
    const w = Math.min(640, vw - 80), h = Math.min(380, vh - 24), x = vw / 2 - w / 2, y = Math.max(12, (vh - h) / 2);
    const bh = btnH(g);
    const box = { x: x + 20, y: y + 118, w: w - 40, h: Math.max(64, h - 118 - bh - 44) };
    return { vw, vh, w, h, x, y, bh, box };
  }
  place() {
    const ta = this.ta, g = this.game, cv = g.canvas;
    if (!ta || !cv) return;
    const R = cv.getBoundingClientRect(), r = this.layout().box, k = g.uiK || 1;
    const sx = (R.width / g.viewW) * k, sy = (R.height / g.viewH) * k;
    const a = clamp((this.t - 0.1) / 0.2, 0, 1);
    const left = `${R.left + r.x * sx}px`, top = `${R.top + r.y * sy}px`, width = `${r.w * sx}px`, height = `${r.h * sy}px`, op = String(a);
    const s = ta.style;
    if (s.left !== left) s.left = left;
    if (s.top !== top) s.top = top;
    if (s.width !== width) s.width = width;
    if (s.height !== height) s.height = height;
    if (s.opacity !== op) s.opacity = op;
  }
  exit() { this.ta?.remove(); this.ta = null; }
  async copy() {
    const v = this.ta?.value ?? this.code;
    let ok = false;
    try { await navigator.clipboard.writeText(v); ok = true; } catch { /* 권한 없음 */ }
    if (!ok && this.ta) { try { this.ta.focus(); this.ta.select(); ok = document.execCommand('copy'); } catch { /* 무시 */ } }
    this.game.toast(ok ? '세이브 코드를 클립보드에 복사했습니다' : '자동 복사에 실패했습니다. 직접 선택해 복사하세요', ok ? '#9fe8ff' : '#ff9a9a');
    audio.sfx(ok ? 'item' : 'menu_cancel');
  }
  async paste() {
    try {
      const v = await navigator.clipboard.readText();
      if (v && this.ta) { this.ta.value = v.trim(); audio.sfx('item'); return; }
    } catch { /* 권한 없음 */ }
    this.game.toast('길게 눌러(또는 Ctrl+V) 직접 붙여 넣으세요', '#ffd890');
    this.ta?.focus();
  }
  doImport() {
    const v = (this.ta?.value ?? '').trim();
    if (!v) { this.game.toast('코드를 먼저 붙여 넣으세요', '#ff9a9a'); audio.sfx('menu_cancel'); return; }
    const ok = saves.importCode(this.slot, v);
    if (!ok) { this.game.toast('올바르지 않은 세이브 코드입니다', '#ff6060'); audio.sfx('lose'); this.shake = 0.35; return; }
    audio.sfx('save');
    this.game.flash('#ff2040', 0.35, 3);
    this.game.toast(`슬롯 ${this.slot}에 기록을 가져왔습니다`, '#ffe7a0');
    this.close(true);
  }
  close(ok) {
    if (this.done) return;
    this.done = true;
    audio.sfx('menu_cancel');
    this.game.pop();
    this.onDone?.(ok && this.mode === 'import');
  }
  update(dt) {
    this.place();
    if (this.shake > 0) this.shake -= dt;
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'confirm') { audio.sfx('menu_ok'); this.buttons[this.menu.index][1](); }
    else if (r === 'cancel' || input.pressed('menu')) this.close(false);
  }
  resize() { this.place(); }
  render(ctx) {
    const L = this.layout(), vw = L.vw, vh = L.vh, { w, h, x, y, bh } = L;
    ctx.fillStyle = 'rgba(2,0,4,0.78)'; ctx.fillRect(0, 0, vw, vh);
    const sx = this.shake > 0 ? Math.sin(this.t * 80) * 8 * this.shake : 0;
    ctx.save(); ctx.translate(sx, 0);
    frame(ctx, x, y, w, h, { glow: 0.7 });
    text(ctx, this.mode === 'export' ? '세이브 코드 내보내기' : '세이브 코드 가져오기', vw / 2, y + 38, { size: 22, align: 'center', weight: 800, family: FONT.title, color: '#ffe7a0', ow: 3 });
    ornament(ctx, vw / 2, y + 54, 300);
    const m = promptMode();
    // 컨트롤러: 코드를 입력·복사할 수 없다는 안내 (P-29)
    const pad = m === 'pad';
    const msg = pad ? `${this.mode === 'export' ? PAD_EXPORT : PAD_IMPORT}. ${PAD_CLOUD}` : this.msg;
    const lines = wrap(ctx, msg, w - 70, 13, 500);
    lines.slice(0, 2).forEach((l, i) => text(ctx, l, vw / 2, y + 80 + i * 19, { size: 13, align: 'center', color: pad ? '#ffd890' : DIM, ow: 2 }));
    text(ctx, `슬롯 ${this.slot}`, x + 24, y + 30, { size: 12, weight: 800, family: FONT.num, color: GOLD });
    const n = this.buttons.length, bw = Math.min(160, (w - 40 - (n - 1) * 14) / n), gap = 14, bx = vw / 2 - (n * bw + (n - 1) * gap) / 2, by = y + h - bh - 26;
    this.buttons.forEach(([l], i) => {
      const r = { x: bx + i * (bw + gap), y: by, w: bw, h: bh };
      this.menu.hit(i, r);
      gbutton(ctx, r, l, { selected: this.menu.index === i, size: 16 });
    });
    if (this.mode === 'export' && !this.code) text(ctx, '(이 슬롯은 비어 있습니다)', vw / 2, L.box.y + L.box.h / 2 + 6, { size: 15, align: 'center', color: '#ff9a9a' });
    const hy = y + h - 9;
    if (m === 'kb') {
      const items = this.mode === 'export'
        ? [['dpadH', '선택'], ['confirm', '결정'], ['cancel', '닫기'], [null, '(Ctrl+C 복사)']]
        : [['ENTER', '가져오기(입력 칸에서)'], ['Esc', '입력 칸 나가기'], ['cancel', '취소']];
      drawHints(ctx, items, vw / 2, hy, { align: 'center', size: 11, color: DIM });
    } else if (pad) drawHints(ctx, [['dpadH', '선택'], ['confirm', '결정'], ['cancel', '닫기']], vw / 2, hy, { align: 'center', size: 11, color: DIM });
    ctx.restore();
  }
}
