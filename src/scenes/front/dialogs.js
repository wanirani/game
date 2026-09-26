// 공용 대화 상자: 확인(예/아니요) 오버레이, 세이브 코드 내보내기/가져오기(텍스트 상자 오버레이)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { saves } from '../../core/save.js';
import { text, wrap, FONT, ListMenu } from '../../core/ui.js';
import { clamp, ease } from '../../core/math.js';
import { frame, gbutton, ornament, GOLD, BONE, DIM } from './common.js';

/**
 * push('frontConfirm', { title, message, yes, no, danger, onYes, onNo })
 * 키보드 ←→ 선택, Z 결정, X 취소 / 터치 버튼
 */
export class ConfirmScene extends Scene {
  constructor(g) { super(g); this.opaque = false; }
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
    const vw = this.game.viewW, vh = this.game.viewH;
    const k = ease.outBack(clamp(this.t / 0.22, 0, 1));
    ctx.fillStyle = `rgba(2,0,4,${0.7 * clamp(this.t / 0.15, 0, 1)})`; ctx.fillRect(0, 0, vw, vh);
    const lines = wrap(ctx, this.message, 440, 16, 500);
    const w = 520, h = 150 + lines.length * 26, x = vw / 2 - w / 2, y = vh / 2 - h / 2;
    ctx.save();
    ctx.translate(vw / 2, vh / 2); ctx.scale(0.9 + 0.1 * k, 0.9 + 0.1 * k); ctx.translate(-vw / 2, -vh / 2);
    ctx.globalAlpha = clamp(this.t / 0.15, 0, 1);
    const acc = this.danger ? '#ff4a5a' : GOLD;
    frame(ctx, x, y, w, h, { accent: acc, glow: 0.8 });
    text(ctx, this.title, vw / 2, y + 40, { size: 22, align: 'center', weight: 800, family: FONT.title, color: this.danger ? '#ff8a8a' : '#ffe7a0', ow: 3 });
    ornament(ctx, vw / 2, y + 56, 280, { color: acc });
    lines.forEach((l, i) => text(ctx, l, vw / 2, y + 90 + i * 26, { size: 16, align: 'center', color: BONE, ow: 2 }));
    const bw = 170, bh = 48, by = y + h - 68;
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
  constructor(g) { super(g); this.opaque = false; }
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
    Object.assign(ta.style, {
      position: 'fixed', zIndex: 40, resize: 'none', boxSizing: 'border-box', padding: '10px 12px',
      background: 'rgba(8,3,10,0.94)', color: '#efe4cf', border: '1px solid #8a6a2a', borderRadius: '2px',
      font: '12px/1.45 ui-monospace, Menlo, Consolas, monospace', outline: 'none', wordBreak: 'break-all',
      boxShadow: 'inset 0 0 18px rgba(179,18,46,0.35)', touchAction: 'auto', userSelect: 'text', webkitUserSelect: 'text',
    });
    // 게임 키 매핑(preventDefault)이 타이핑/붙여넣기를 막지 않도록 전파 차단
    const stop = (e) => {
      e.stopPropagation();
      if (e.type === 'keydown' && e.key === 'Escape') { e.preventDefault(); this.close(false); }
    };
    ta.addEventListener('keydown', stop); ta.addEventListener('keyup', stop);
    ta.addEventListener('pointerdown', (e) => e.stopPropagation());
    ta.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    document.body.appendChild(ta);
    this.ta = ta;
    this.place();
    if (this.mode === 'export') setTimeout(() => { try { ta.focus(); ta.select(); } catch { /* 무시 */ } }, 50);
  }
  rect() { const vw = this.game.viewW; const w = Math.min(620, vw - 120); return { x: vw / 2 - w / 2 + 20, y: 196, w: w - 40, h: 170 }; }
  place() {
    const ta = this.ta, cv = this.game.canvas;
    if (!ta || !cv) return;
    const R = cv.getBoundingClientRect(), r = this.rect();
    const sx = R.width / this.game.viewW, sy = R.height / this.game.viewH;
    const k = clamp((this.t - 0.1) / 0.2, 0, 1);
    Object.assign(ta.style, { left: `${R.left + r.x * sx}px`, top: `${R.top + r.y * sy}px`, width: `${r.w * sx}px`, height: `${r.h * sy}px`, opacity: String(k) });
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
    const vw = this.game.viewW, vh = this.game.viewH;
    ctx.fillStyle = 'rgba(2,0,4,0.78)'; ctx.fillRect(0, 0, vw, vh);
    const w = Math.min(620, vw - 120), h = 360, x = vw / 2 - w / 2, y = 90;
    const sx = this.shake > 0 ? Math.sin(this.t * 80) * 8 * this.shake : 0;
    ctx.save(); ctx.translate(sx, 0);
    frame(ctx, x, y, w, h, { glow: 0.7 });
    text(ctx, this.mode === 'export' ? '세이브 코드 내보내기' : '세이브 코드 가져오기', vw / 2, y + 38, { size: 22, align: 'center', weight: 800, family: FONT.title, color: '#ffe7a0', ow: 3 });
    ornament(ctx, vw / 2, y + 54, 300);
    const lines = wrap(ctx, this.msg, w - 70, 13, 500);
    lines.slice(0, 2).forEach((l, i) => text(ctx, l, vw / 2, y + 80 + i * 19, { size: 13, align: 'center', color: DIM, ow: 2 }));
    text(ctx, `슬롯 ${this.slot}`, x + 24, y + 30, { size: 12, weight: 800, family: FONT.num, color: GOLD });
    const n = this.buttons.length, bw = 150, bh = 46, gap = 14, bx = vw / 2 - (n * bw + (n - 1) * gap) / 2, by = y + h - 70;
    this.buttons.forEach(([l], i) => {
      const r = { x: bx + i * (bw + gap), y: by, w: bw, h: bh };
      this.menu.hit(i, r);
      gbutton(ctx, r, l, { selected: this.menu.index === i, size: 16 });
    });
    if (this.mode === 'export' && !this.code) text(ctx, '(이 슬롯은 비어 있습니다)', vw / 2, y + 190, { size: 15, align: 'center', color: '#ff9a9a' });
    ctx.restore();
  }
}
