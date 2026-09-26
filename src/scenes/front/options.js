// 설정: 음악/효과음 볼륨, 그래픽 품질, 화면 흔들림, 데미지 숫자, 진동, 터치 패드 투명도, 자동 저장, 조작 안내(키보드/패드/터치)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { saves, DEFAULT_SETTINGS } from '../../core/save.js';
import { text, FONT, ListMenu } from '../../core/ui.js';
import { clamp, ease, rgba, TAU } from '../../core/math.js';
import { frame, heading, ornament, gbutton, backButton, footer, setPad, applySettings, menuItem, GOLD, BONE, DIM, CRIMSON } from './common.js';

const Q = [['low', '낮음'], ['medium', '보통'], ['high', '높음']];
const SHAKE = [[0, '끔'], [0.5, '약하게'], [1, '보통'], [1.5, '강하게']];

export class OptionsScene extends Scene {
  constructor(g) { super(g); this.opaque = false; }
  enter({ page = 0 } = {}) {
    setPad(false);
    this.s = this.game.settings ??= { ...DEFAULT_SETTINGS };
    this.page = page; // 0: 설정, 1: 조작 안내
    this.guideTab = input.touchMode ? 2 : 0;
    this.rows = [
      { id: 'musicVol', label: '배경 음악', type: 'vol' },
      { id: 'sfxVol', label: '효과음', type: 'vol' },
      { id: 'quality', label: '그래픽 품질', type: 'enum', opts: Q, note: '낮음: 저사양 기기용 (해상도·입자 감소)' },
      { id: 'screenShake', label: '화면 흔들림', type: 'enum', opts: SHAKE },
      { id: 'showDamage', label: '데미지 숫자 표시', type: 'bool' },
      { id: 'vibration', label: '진동 (모바일)', type: 'bool' },
      { id: 'touchOpacity', label: '터치 패드 투명도', type: 'pct', min: 0.2, max: 1, step: 0.05 },
      { id: 'autoSave', label: '자동 저장', type: 'bool' },
      { id: 'guide', label: '조작 안내', type: 'action' },
      { id: 'reset', label: '기본값 복원', type: 'action' },
      { id: 'close', label: '저장하고 닫기', type: 'action' },
    ];
    this.menu = new ListMenu(this.rows.length);
    this.tabs = new ListMenu(3, { cols: 3, index: this.guideTab });
    this.flash = {};
    this.lr = [];
  }
  exit() { this.save(); setPad(true); }
  onResume() { setPad(false); }
  save() { saves.saveSettings(this.s); applySettings(this.game); }
  valueText(r) {
    const v = this.s[r.id];
    switch (r.type) {
      case 'vol': return `${Math.round((v ?? 0) * 10)}`;
      case 'pct': return `${Math.round((v ?? 0) * 100)}%`;
      case 'bool': return v ? '켬' : '끔';
      case 'enum': return (r.opts.find((o) => o[0] === v) ?? r.opts[r.opts.length - 1])[1];
      default: return '';
    }
  }
  change(r, d) {
    const s = this.s;
    switch (r.type) {
      case 'vol': s[r.id] = clamp(Math.round(((s[r.id] ?? 0) * 10 + d)) / 10, 0, 1); break;
      case 'pct': s[r.id] = clamp(Math.round(((s[r.id] ?? 0.5) + d * r.step) * 100) / 100, r.min, r.max); break;
      case 'bool': s[r.id] = !s[r.id]; break;
      case 'enum': {
        let i = r.opts.findIndex((o) => o[0] === s[r.id]); if (i < 0) i = r.opts.length - 1;
        i = clamp(i + d, 0, r.opts.length - 1); s[r.id] = r.opts[i][0]; break;
      }
      default: return;
    }
    this.flash[r.id] = 1;
    applySettings(this.game);
    if (r.id === 'quality') this.game.resize();
    if (r.id === 'sfxVol') audio.sfx('coin');
    else if (r.id === 'vibration' && s.vibration) { try { navigator.vibrate?.(40); } catch { /* 무시 */ } audio.sfx('menu_move'); }
    else audio.sfx('menu_move');
    if (r.id === 'screenShake' && s.screenShake > 0) this.shakeDemo = 0.35 * s.screenShake;
  }
  act(r) {
    audio.sfx('menu_ok');
    if (r.id === 'guide') { this.page = 1; this.tabs.index = input.touchMode ? 2 : 0; }
    else if (r.id === 'reset') this.game.push('frontConfirm', { title: '기본값', message: '모든 설정을 기본값으로 되돌릴까요?', onYes: () => { Object.assign(this.s, DEFAULT_SETTINGS); applySettings(this.game); this.game.resize(); this.save(); this.game.toast('설정을 기본값으로 되돌렸습니다'); } });
    else if (r.id === 'close') this.close();
  }
  close() { if (this.closed) return; this.closed = true; audio.sfx('menu_cancel'); this.save(); this.game.pop(); }
  update(dt) {
    for (const k in this.flash) this.flash[k] = Math.max(0, this.flash[k] - dt * 3);
    if (this.shakeDemo > 0) this.shakeDemo -= dt;
    if (this.backTapped) { this.backTapped = false; if (this.page === 1) { this.page = 0; audio.sfx('menu_cancel'); } else this.close(); return; }
    if (this.page === 1) {
      const r = this.tabs.update(dt);
      if (this.tabs.moved) audio.sfx('menu_move');
      if (r === 'cancel' || (r === 'confirm' && !input.pointer.tapped) || input.pressed('menu')) { this.page = 0; audio.sfx('menu_cancel'); }
      return;
    }
    if (this.lrTap) { const [i, d] = this.lrTap; this.lrTap = null; this.menu.index = i; this.change(this.rows[i], d); return; }
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    const row = this.rows[this.menu.index];
    const A0 = this.rows.findIndex((q) => q.type === 'action');
    if (row.type === 'action') {
      // 하단 버튼 줄: ←→ 로 버튼 이동
      if (input.pressed('left') && this.menu.index > A0) { this.menu.index--; audio.sfx('menu_move'); }
      else if (input.pressed('right') && this.menu.index < this.rows.length - 1) { this.menu.index++; audio.sfx('menu_move'); }
    } else if (input.pressed('left')) this.change(row, -1);
    else if (input.pressed('right')) this.change(row, 1);
    if (r === 'confirm') { if (row.type === 'action') this.act(row); else if (row.type === 'bool' || row.type === 'enum') this.change(row, row.type === 'enum' ? 1 : 0); }
    else if (r === 'cancel' || input.pressed('menu')) this.close();
  }
  render(ctx) {
    const g = this.game, vw = g.viewW, vh = g.viewH, t = g.time;
    const k = ease.outCubic(clamp(this.t / 0.25, 0, 1));
    ctx.fillStyle = `rgba(4,0,8,${0.8 * k})`; ctx.fillRect(0, 0, vw, vh);
    const sx = this.shakeDemo > 0 ? Math.sin(t * 90) * 10 * this.shakeDemo : 0;
    ctx.save(); ctx.globalAlpha = k; ctx.translate(sx, (1 - k) * 20);
    if (this.page === 0) this.drawSettings(ctx, vw, vh, t); else this.drawGuide(ctx, vw, vh, t);
    ctx.restore();
    if (backButton(ctx, 14, 12, this.page === 1 ? '설정' : '닫기')) this.backTapped = true;
  }
  drawSettings(ctx, vw, vh, t) {
    heading(ctx, vw / 2, 44, 'OPTIONS', '설정', { size: 30 });
    const w = Math.min(660, vw - 140), x = vw / 2 - w / 2, y0 = 104, rh = 41;
    const A0 = this.rows.findIndex((q) => q.type === 'action');
    frame(ctx, x - 16, y0 - 8, w + 32, A0 * rh + 16, { glow: 0.4 });
    this.menu.clearHits();
    this.rows.forEach((r, i) => {
      const sel = this.menu.index === i;
      if (r.type === 'action') {
        // 하단 버튼 줄
        const n = this.rows.length - A0, bw = (w + 32 - (n - 1) * 12) / n, br = { x: x - 16 + (i - A0) * (bw + 12), y: y0 + A0 * rh + 18, w: bw, h: 46 };
        this.menu.hit(i, br);
        gbutton(ctx, br, r.label, { selected: sel, size: 15 });
        return;
      }
      const y = y0 + i * rh, rr = { x, y, w, h: rh };
      this.menu.hit(i, r.type === 'bool' ? rr : { x, y, w: w * 0.4, h: rh });
      if (sel) {
        const lg = ctx.createLinearGradient(x, 0, x + w, 0);
        lg.addColorStop(0, 'rgba(179,18,46,0.7)'); lg.addColorStop(1, 'rgba(179,18,46,0.05)');
        ctx.fillStyle = lg; ctx.fillRect(x, y + 3, w, rh - 6);
        ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(x + 6, y + rh / 2 - 5); ctx.lineTo(x + 12, y + rh / 2); ctx.lineTo(x + 6, y + rh / 2 + 5); ctx.fill();
      } else if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fillRect(x, y + 3, w, rh - 6); }
      const ty = y + rh / 2 + 6;
      text(ctx, r.label, x + 22, ty, { size: 16, weight: 800, color: sel ? '#fff4dc' : BONE, ow: 2 });
      const vx = x + w * 0.6, fl = this.flash[r.id] ?? 0;
      if (r.type === 'vol' || r.type === 'pct') {
        const v = this.s[r.id] ?? 0, bw = w * 0.28, by = y + rh / 2 - 4;
        const ratio = r.type === 'vol' ? v : (v - r.min) / (r.max - r.min);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(vx - bw / 2, by, bw, 8);
        const bg = ctx.createLinearGradient(vx - bw / 2, 0, vx + bw / 2, 0);
        bg.addColorStop(0, '#8a1020'); bg.addColorStop(1, '#ffcf6a');
        ctx.fillStyle = bg; ctx.fillRect(vx - bw / 2, by, bw * ratio, 8);
        ctx.strokeStyle = 'rgba(232,200,114,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(vx - bw / 2 - 0.5, by - 0.5, bw + 1, 9);
        ctx.fillStyle = '#fff4dc'; ctx.beginPath(); ctx.arc(vx - bw / 2 + bw * ratio, by + 4, 6 + fl * 3, 0, TAU); ctx.fill();
        text(ctx, this.valueText(r), x + w - 18, ty, { size: 15, align: 'right', weight: 900, family: FONT.num, color: sel ? GOLD : '#e8dcc8', ow: 2 });
      } else {
        ctx.save(); ctx.translate(vx, ty); ctx.scale(1 + fl * 0.15, 1 + fl * 0.15);
        text(ctx, this.valueText(r), 0, 0, { size: 16, align: 'center', weight: 800, color: r.type === 'bool' ? (this.s[r.id] ? '#8aff9a' : '#ff8a8a') : sel ? GOLD : '#e8dcc8', ow: 2 });
        ctx.restore();
      }
      // ◀ ▶ (터치용 44px 폭)
      const off = w * 0.2;
      const lr = { x: vx - off - 24, y, w: 48, h: rh }, rr2 = { x: vx + off - 24, y, w: 48, h: rh };
      for (const [q, d, s] of [[lr, -1, '◀'], [rr2, 1, '▶']]) {
        text(ctx, s, q.x + q.w / 2, ty - 1, { size: 15, align: 'center', color: sel ? GOLD : 'rgba(232,200,114,0.35)', ow: 2 });
        const p = input.pointer;
        if (p.tapped && p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h) this.lrTap = [i, d];
      }
    });
    const cur = this.rows[this.menu.index];
    footer(ctx, vw, vh, cur.note ?? '↑↓ 항목   ←→ 값 변경   Z 결정   X 닫기', cur.note ?? '◀ ▶ 를 터치해 값을 바꾸세요');
  }

  // ── 조작 안내 ──
  drawGuide(ctx, vw, vh, t) {
    heading(ctx, vw / 2, 44, 'CONTROLS', '조작 안내', { size: 30 });
    const names = ['키보드', '게임패드', '터치'];
    const tw = 150, tx0 = vw / 2 - (tw * 3) / 2;
    this.tabs.clearHits();
    names.forEach((n, i) => {
      const r = { x: tx0 + i * tw, y: 88, w: tw - 8, h: 44 };
      this.tabs.hit(i, r);
      gbutton(ctx, r, n, { selected: this.tabs.index === i, size: 15 });
    });
    const x = vw / 2 - Math.min(700, vw - 80) / 2, w = Math.min(700, vw - 80), y = 144, h = vh - y - 44;
    frame(ctx, x, y, w, h, { glow: 0.3 });
    if (this.tabs.index === 0) this.guideKeyboard(ctx, x, y, w, h);
    else if (this.tabs.index === 1) this.guidePad(ctx, x, y, w, h, t);
    else this.guideTouch(ctx, x, y, w, h);
    footer(ctx, vw, vh, '←→ 탭 전환   X 돌아가기', '탭을 눌러 전환하세요');
  }
  key(ctx, x, y, label, w = 34, hot = false) {
    const g = ctx.createLinearGradient(x, y, x, y + 30);
    g.addColorStop(0, hot ? '#5a1a26' : '#2e2632'); g.addColorStop(1, hot ? '#2a0810' : '#141018');
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 1, y + 3, w, 30);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, 30);
    ctx.strokeStyle = hot ? GOLD : 'rgba(200,180,160,0.5)'; ctx.lineWidth = 1.2; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 29);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 2, y + 2, w - 4, 8);
    text(ctx, label, x + w / 2, y + 20, { size: label.length > 3 ? 10 : 13, align: 'center', weight: 800, color: hot ? '#ffe7a0' : '#efe4cf', ow: 2 });
    return x + w + 6;
  }
  guideKeyboard(ctx, x, y, w, h) {
    const rows = [
      [['←', '→'], '이동', ['↑', '↓'], '위 공격 / 웅크리기·하단 공격'],
      [['Z', 'Space'], '점프 (공중 점프)', ['X', 'J'], '공격 (길게: 모아 공격)'],
      [['C', 'Shift'], '대시 / 회피', ['A'], '보조무기 (하트 소모)'],
      [['S'], '스킬 1', ['D'], '스킬 2'],
      [['F', 'V'], '필살기 (게이지 MAX)', ['Q', 'E'], '스킬 페이지 전환'],
      [['Enter', 'Esc'], '일시정지 / 메뉴', ['Tab', 'M'], '지도'],
    ];
    const cw = w / 2 - 20;
    rows.forEach((r, i) => {
      const yy = y + 22 + i * 44;
      for (let c = 0; c < 2; c++) {
        let kx = x + 22 + c * (cw + 20);
        for (const k of r[c * 2]) kx = this.key(ctx, kx, yy, k, k.length > 2 ? 52 : 34, i < 2);
        text(ctx, r[c * 2 + 1], kx + 6, yy + 20, { size: 13, weight: 700, color: BONE, ow: 2, maxWidth: x + 22 + c * (cw + 20) + cw - kx });
      }
    });
    const cy = y + 22 + rows.length * 44 + 6;
    ctx.fillStyle = 'rgba(179,18,46,0.2)'; ctx.fillRect(x + 16, cy, w - 32, 44);
    text(ctx, '커맨드 기술: 비전서를 얻으면 ↓↘→ + 공격 같은 격투 커맨드로 필살기를 쓸 수 있다 (→ = 바라보는 방향)', x + w / 2, cy + 18, { size: 12, align: 'center', weight: 700, color: '#ffe0b0', ow: 2, maxWidth: w - 40 });
    text(ctx, '메뉴: ↑↓←→ 선택 · Z/Enter 결정 · X/Esc 취소', x + w / 2, cy + 36, { size: 12, align: 'center', color: DIM, ow: 2 });
  }
  guidePad(ctx, x, y, w, h, t) {
    const cx = x + w / 2, cy = y + h / 2 + 4;
    // 패드 몸체
    ctx.save();
    ctx.fillStyle = '#1c1620'; ctx.strokeStyle = 'rgba(232,200,114,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 150, cy - 50); ctx.quadraticCurveTo(cx, cy - 78, cx + 150, cy - 50);
    ctx.quadraticCurveTo(cx + 200, cy - 40, cx + 190, cy + 40); ctx.quadraticCurveTo(cx + 180, cy + 100, cx + 130, cy + 80);
    ctx.quadraticCurveTo(cx + 90, cy + 40, cx, cy + 40); ctx.quadraticCurveTo(cx - 90, cy + 40, cx - 130, cy + 80);
    ctx.quadraticCurveTo(cx - 180, cy + 100, cx - 190, cy + 40); ctx.quadraticCurveTo(cx - 200, cy - 40, cx - 150, cy - 50);
    ctx.fill(); ctx.stroke();
    // D패드
    ctx.fillStyle = '#3a3240';
    ctx.fillRect(cx - 128, cy - 22, 48, 16); ctx.fillRect(cx - 112, cy - 38, 16, 48);
    // 버튼 ABXY
    const bt = [['A', 0, 18, '#7ee07e'], ['B', 18, 0, '#ff6060'], ['X', -18, 0, '#5aa8ff'], ['Y', 0, -18, '#ffd84a']];
    for (const [l, dx, dy, c] of bt) {
      ctx.fillStyle = rgba(c, 0.85); ctx.beginPath(); ctx.arc(cx + 104 + dx, cy - 14 + dy, 10, 0, TAU); ctx.fill();
      text(ctx, l, cx + 104 + dx, cy - 10 + dy, { size: 11, align: 'center', weight: 900, color: '#111', ow: 0 });
    }
    ctx.fillStyle = '#3a3240'; ctx.fillRect(cx - 24, cy - 24, 16, 8); ctx.fillRect(cx + 8, cy - 24, 16, 8);
    ctx.fillRect(cx - 170, cy - 70, 60, 12); ctx.fillRect(cx + 110, cy - 70, 60, 12);
    ctx.restore();
    const L = [
      [x + 24, y + 30, '방향패드 / 왼쪽 스틱', '이동 · 메뉴 선택', cx - 104, cy - 14],
      [x + 24, y + 70, 'LB / RB', '스킬 1 / 스킬 2', cx - 140, cy - 64],
      [x + 24, y + 110, 'LT / RT', '대시 / 필살기', cx - 140, cy - 64],
      [x + 24, y + h - 40, 'SELECT', '지도', cx - 16, cy - 20],
      [x + w - 24, y + 30, 'A', '점프 · 결정', cx + 104, cy + 4],
      [x + w - 24, y + 70, 'B / X', '공격 · 취소', cx + 86, cy - 14],
      [x + w - 24, y + 110, 'Y', '보조무기', cx + 104, cy - 32],
      [x + w - 24, y + h - 40, 'START', '일시정지', cx + 16, cy - 20],
    ];
    for (const [lx, ly, a, b, px, py] of L) {
      const right = lx > cx;
      text(ctx, a, lx, ly, { size: 14, align: right ? 'right' : 'left', weight: 900, family: FONT.num, color: GOLD, ow: 2 });
      text(ctx, b, lx, ly + 17, { size: 12, align: right ? 'right' : 'left', weight: 700, color: BONE, ow: 2 });
      ctx.font = `700 12px ${FONT.body}`;
      const tw = Math.max(ctx.measureText(b).width, a.length * 8.5) + 10;
      const sx = right ? lx - tw : lx + tw, sy = ly + 4;
      ctx.strokeStyle = 'rgba(232,200,114,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (right ? -14 : 14), sy); ctx.lineTo(px, py); ctx.stroke();
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(px, py, 2.5, 0, TAU); ctx.fill();
    }
  }
  guideTouch(ctx, x, y, w, h) {
    // 가로 화면 축소도
    const sw = Math.min(460, w - 60), sh = sw * 0.46, sx = x + w / 2 - sw / 2, sy = y + 20;
    ctx.fillStyle = '#0c0810'; ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = 'rgba(232,200,114,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(sx - 6, sy - 6, sw + 12, sh + 12);
    // 스틱
    ctx.strokeStyle = 'rgba(232,200,114,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx + 44, sy + sh - 42, 30, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#6a1a26'; ctx.beginPath(); ctx.arc(sx + 50, sy + sh - 46, 13, 0, TAU); ctx.fill();
    // 버튼 군
    const B = [['공격', sw - 80, sh - 30, 17], ['점프', sw - 30, sh - 52, 17], ['대시', sw - 128, sh - 28, 12], ['보조', sw - 84, sh - 74, 12], ['S1', sw - 120, sh - 68, 11], ['S2', sw - 46, sh - 96, 11], ['필살', sw - 150, sh - 100, 12], ['⇄', sw - 86, sh - 108, 9]];
    for (const [l, bx, by, r] of B) {
      ctx.fillStyle = l === '필살' ? '#6a4a10' : '#4a1020'; ctx.beginPath(); ctx.arc(sx + bx, sy + by, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(232,200,114,0.7)'; ctx.stroke();
      text(ctx, l, sx + bx, sy + by + 4, { size: 9, align: 'center', weight: 800, color: '#f3e2b8', ow: 0 });
    }
    ctx.fillStyle = '#2a2230'; ctx.fillRect(sx + sw / 2 - 26, sy + 8, 22, 18); ctx.fillRect(sx + sw / 2 + 4, sy + 8, 22, 18);
    text(ctx, 'Ⅱ', sx + sw / 2 - 15, sy + 22, { size: 11, align: 'center', color: '#eee', ow: 0 });
    text(ctx, '⛶', sx + sw / 2 + 15, sy + 22, { size: 11, align: 'center', color: '#eee', ow: 0 });
    const notes = [
      '왼쪽 원형 스틱: 이동 (위/아래로 밀면 위 공격·웅크리기)',
      '공격 · 점프 · 대시 · 보조무기 · 스킬(S1/S2) · 필살 버튼은 오른쪽에 있습니다',
      '상단 Ⅱ: 일시정지 · ⛶: 전체 화면   /   메뉴 화면에서는 항목을 직접 터치하세요',
      '버튼이 가린다면 「터치 패드 투명도」를 조절해 보세요',
    ];
    notes.forEach((n, i) => text(ctx, n, x + w / 2, sy + sh + 32 + i * 22, { size: 13, align: 'center', weight: i < 2 ? 700 : 500, color: i < 2 ? BONE : DIM, ow: 2, maxWidth: w - 30 }));
  }
}
