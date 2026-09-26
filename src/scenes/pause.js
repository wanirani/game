// 일시정지 오버레이: 흐려진 게임 화면 위 진홍 깃발 메뉴 + 스테이지 정보 카드
//  계속하기 / 메뉴(상태·장비·스킬…) / 인벤토리 / 설정 / 마을로 귀환 / 타이틀로
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, FONT } from '../core/ui.js';
import { clamp, ease, fmtTime, TAU } from '../core/math.js';
import { CHARACTERS } from '../data/characters.js';
import { CLASSES } from '../data/classes.js';
import {
  PAL, frame, divider, glow, glyph, gauge, diamond, hintRow, Nav, Gesture, Confirm, Embers, hidePad,
} from './menu/common.js';

export class PauseScene extends Scene {
  constructor(g) { super(g); this.opaque = false; }
  enter({ world } = {}) {
    this.world = world ?? this.game.world;
    const reg = this.game.registry;
    this.items = [
      { label: '계속하기', icon: 'play', run: () => this.resume() },
      { label: '메뉴', sub: '상태 · 장비 · 스킬 · 도감', icon: 'crest', disabled: !reg.menu, run: () => this.game.push('menu', { world: this.world, tab: 'status' }) },
      { label: '인벤토리', icon: 'bag', disabled: !reg.menu, run: () => this.game.push('menu', { world: this.world, tab: 'inventory' }) },
      { label: '설정', icon: 'gear', disabled: !reg.options, run: () => this.game.push('options', {}) },
      { label: '마을로 귀환', icon: 'home', run: () => this.confirmTown() },
      { label: '타이틀로', icon: 'door', run: () => this.confirmTitle() },
    ];
    this.i = 0;
    this.nav = new Nav(); this.ges = new Gesture(); this.embers = new Embers(14);
    this.modal = null; this.snap = null; this.rects = []; this.closing = 0;
    hidePad(true);
    audio.duck?.(0.5, 0.3);
  }
  exit() { hidePad(false); this.snap = null; }
  onResume() { this.opaque = !!this.snap; }
  resume() { if (this.closing) return; audio.sfx('menu_cancel'); this.closing = 0.001; }
  confirmTown() {
    const w = this.world;
    this.modal = new Confirm({
      title: '마을로 귀환', yes: '귀환한다', no: '취소', danger: true,
      text: '스테이지 진행 상황은 사라지지만,\n지금까지 얻은 경험치와 아이템은 그대로 남습니다.',
      onYes: () => {
        try { w?.syncToState?.(); } catch (e) { /* 무시 */ }
        // 마을로 돌아가면 목숨을 난이도 기본값까지 회복 (포기·클리어와 동일. 1UP 으로 늘어난 목숨은 유지)
        const st = this.game.state, full = w?.diff?.lives;
        if (st && full) st.lives = Math.max(st.lives ?? 0, full);
        this.game.go(this.game.registry.hub ? 'hub' : 'title', {});
      },
    });
  }
  confirmTitle() {
    const w = this.world;
    this.modal = new Confirm({
      title: '타이틀로', yes: '돌아간다', no: '취소', danger: true,
      text: '타이틀 화면으로 돌아갈까요?\n저장하지 않은 진행 상황은 사라집니다.',
      onYes: () => { try { w?.syncToState?.(); } catch (e) { /* 무시 */ } this.game.go('title', {}); },
    });
  }
  run(k) {
    const it = this.items[k];
    if (!it) return;
    if (it.disabled) { audio.sfx('menu_cancel'); return; }
    audio.sfx('menu_ok');
    it.run();
  }
  update(dt) {
    if (this.closing) { this.closing += dt; if (this.closing >= 0.12) this.game.pop(); return; }
    const nav = this.nav.poll(dt), ges = this.ges;
    ges.update();
    this.embers.update(dt);
    if (this.modal) { if (!this.modal.update(dt, nav, ges) || !this.modal.open) this.modal = null; return; }
    const n = this.items.length;
    if (nav.up) { this.i = (this.i - 1 + n) % n; audio.sfx('menu_move'); }
    if (nav.down) { this.i = (this.i + 1) % n; audio.sfx('menu_move'); }
    for (let k = 0; k < this.rects.length; k++) {
      if (ges.hoverIn(this.rects[k])) this.i = k;
      if (ges.tap(this.rects[k])) { this.i = k; this.run(k); return; }
    }
    if (nav.confirm) { this.run(this.i); return; }
    if (nav.cancel || nav.menu) this.resume();
  }

  capture(ctx) {
    const src = ctx.canvas;
    const c = document.createElement('canvas');
    c.width = Math.max(64, Math.round(this.game.viewW / 3)); c.height = Math.max(36, Math.round(this.game.viewH / 3));
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    try { g.drawImage(src, 0, 0, src.width, src.height, 0, 0, c.width, c.height); } catch (e) { g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); }
    this.snap = c;
    this.opaque = true;
  }

  render(ctx) {
    const W = this.game.viewW, H = this.game.viewH;
    if (!this.snap) this.capture(ctx);
    const kIn = ease.outCubic(clamp(this.t / 0.25, 0, 1));
    const kOut = this.closing ? 1 - clamp(this.closing / 0.12, 0, 1) : 1;
    const k = kIn * kOut;
    // 흐린 게임 화면 (닫히는 중엔 선명한 쪽으로)
    ctx.drawImage(this.snap, 0, 0, W, H);
    if (this.game.top !== this) { ctx.fillStyle = 'rgba(6,3,10,0.4)'; ctx.fillRect(0, 0, W, H); return; } // 위에 메뉴가 떠 있음
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(8,3,10,0.55)'; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    this.embers.render(ctx, W, H, 0.8);
    // ── 진홍 깃발 ──
    const bw = 316, bx = Math.round(clamp(W * 0.08, 40, 120));
    const drop = (1 - kIn) * -60;
    ctx.save();
    ctx.translate(0, drop);
    const bh = H - 44;
    ctx.beginPath();
    ctx.moveTo(bx, -4); ctx.lineTo(bx + bw, -4); ctx.lineTo(bx + bw, bh); ctx.lineTo(bx + bw / 2, bh - 34); ctx.lineTo(bx, bh); ctx.closePath();
    const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bg.addColorStop(0, '#2a040c'); bg.addColorStop(0.18, '#6a0c1e'); bg.addColorStop(0.5, '#86122a'); bg.addColorStop(0.82, '#5a0a1a'); bg.addColorStop(1, '#22030a');
    ctx.fillStyle = bg; ctx.fill();
    const sh = ctx.createLinearGradient(0, 0, 0, bh);
    sh.addColorStop(0, 'rgba(255,200,160,0.10)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = sh; ctx.fill();
    const tex = assets.get('tex/tex_blood_marble');
    if (tex) {
      if (!this.pat) this.pat = ctx.createPattern(tex, 'repeat');
      ctx.save(); ctx.clip(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha *= 0.35;
      ctx.fillStyle = this.pat; ctx.fillRect(bx, 0, bw, bh); ctx.restore();
    }
    // 세로 주름
    for (let k = 1; k < 5; k++) {
      const fx = bx + (bw / 5) * k;
      const fg = ctx.createLinearGradient(fx - 18, 0, fx + 18, 0);
      fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, k % 2 ? 'rgba(0,0,0,0.16)' : 'rgba(255,190,170,0.05)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg; ctx.fillRect(fx - 18, 0, 36, bh - 30);
    }
    ctx.beginPath();
    ctx.moveTo(bx, -4); ctx.lineTo(bx + bw, -4); ctx.lineTo(bx + bw, bh); ctx.lineTo(bx + bw / 2, bh - 34); ctx.lineTo(bx, bh); ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bx + 8, -4); ctx.lineTo(bx + 8, bh - 10); ctx.lineTo(bx + bw / 2, bh - 40); ctx.lineTo(bx + bw - 8, bh - 10); ctx.lineTo(bx + bw - 8, -4); ctx.stroke();
    // 문장
    const cx = bx + bw / 2;
    glow(ctx, cx, 70, 70, '#ff4050', 0.3);
    text(ctx, 'PAUSE', cx, 88, { size: 46, align: 'center', weight: 900, family: FONT.logo, color: PAL.goldHi, ow: 5 });
    divider(ctx, bx + 40, 104, bw - 80, { color: PAL.gold });
    text(ctx, '일 시 정 지', cx, 126, { size: 14, align: 'center', weight: 800, family: FONT.title, color: '#f0d8c0', ow: 3 });
    // 항목
    this.rects.length = 0;
    const rowH = input.touchMode ? 50 : 46, y0 = 146;
    this.items.forEach((it, k) => {
      const r = { x: bx + 20, y: y0 + k * rowH, w: bw - 40, h: rowH - 6 };
      this.rects.push(r);
      const sel = k === this.i && !this.modal;
      if (sel) {
        const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
        g.addColorStop(0, 'rgba(10,2,6,0.7)'); g.addColorStop(0.7, 'rgba(10,2,6,0.45)'); g.addColorStop(1, 'rgba(10,2,6,0)');
        ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
        const lg = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
        lg.addColorStop(0, 'rgba(255,220,140,0.95)'); lg.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = lg; ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
        glow(ctx, r.x + 28, r.y + r.h / 2, 26, '#ffc060', 0.35 + 0.15 * Math.sin(this.t * 5));
        diamond(ctx, r.x - 2, r.y + r.h / 2, 5 + Math.sin(this.t * 5), PAL.goldHi);
      }
      const col = it.disabled ? '#8a6068' : sel ? PAL.goldHi : PAL.bone;
      glyph(ctx, it.icon, r.x + 28, r.y + r.h / 2, 18, sel ? PAL.goldHi : it.disabled ? '#6a4048' : PAL.gold, 1.6);
      text(ctx, it.label, r.x + 50, r.y + r.h / 2 + (it.sub ? 1 : 6), { size: 17, weight: 800, color: col, ow: 3 });
      if (it.sub) text(ctx, it.sub, r.x + 50, r.y + r.h / 2 + 16, { size: 10, weight: 600, color: sel ? '#f0d0b0' : '#c0909a', ow: 2 });
    });
    ctx.restore();
    // ── 정보 카드 ──
    this.drawInfo(ctx, W, H, kIn);
    // 하단 안내
    if (!input.touchMode) hintRow(ctx, [['↑↓', '선택'], ['Z', '결정'], ['ESC', '계속하기']], W - 20, H - 16, { align: 'right' });
    if (this.modal) this.modal.render(ctx, W, H);
    ctx.restore();
  }

  drawInfo(ctx, W, H, kIn) {
    const w = this.world;
    if (!w) return;
    const cw = Math.min(380, W * 0.4), cx0 = W - cw - clamp(W * 0.07, 30, 110) + (1 - kIn) * 40, cy0 = 88, ch = 330;
    frame(ctx, cx0, cy0, cw, ch, { top: 'rgba(24,12,30,0.9)', bot: 'rgba(8,4,12,0.92)' });
    const st = w.stage || {};
    text(ctx, `CHAPTER ${st.chapter ?? ''}`, cx0 + 22, cy0 + 30, { size: 12, weight: 800, family: FONT.num, color: PAL.goldMid });
    text(ctx, st.name ?? '', cx0 + 22, cy0 + 60, { size: 26, weight: 800, family: FONT.title, color: PAL.bone, ow: 4, maxWidth: cw - 44 });
    if (st.sub) text(ctx, st.sub, cx0 + 22, cy0 + 80, { size: 12, weight: 600, color: PAL.dim });
    divider(ctx, cx0 + 16, cy0 + 94, cw - 32);
    const run = w.run || {};
    const docsAll = st.docs?.length ?? 0;
    const rows = [
      ['진행 시간', fmtTime(run.time ?? 0)],
      ['점수', Math.floor(run.score ?? 0).toLocaleString('ko-KR')],
      ['처치', `${run.kills ?? 0}`],
      ['최대 콤보', `${w.combo?.best ?? w.combo?.max ?? 0} HIT`],
      ['비전서', docsAll ? `${run.docsFound?.length ?? 0} / ${docsAll}` : '—'],
    ];
    rows.forEach(([a, b], k) => {
      const y = cy0 + 120 + k * 24;
      text(ctx, a, cx0 + 24, y, { size: 13, weight: 600, color: PAL.text });
      text(ctx, b, cx0 + cw - 24, y, { size: 15, align: 'right', weight: 800, family: FONT.num, color: PAL.bone, ow: 3 });
    });
    // 목숨
    const ly = cy0 + 120 + rows.length * 24;
    text(ctx, '남은 목숨', cx0 + 24, ly, { size: 13, weight: 600, color: PAL.text });
    const lives = run.lives ?? 0;
    for (let k = 0; k < Math.min(lives, 9); k++) {
      const hx = cx0 + cw - 28 - k * 18, hy = ly - 5;
      glow(ctx, hx, hy, 9, '#ff3050', 0.4);
      ctx.fillStyle = '#e8283c';
      ctx.beginPath(); ctx.moveTo(hx, hy + 5); ctx.bezierCurveTo(hx - 9, hy - 2, hx - 5, hy - 9, hx, hy - 4); ctx.bezierCurveTo(hx + 5, hy - 9, hx + 9, hy - 2, hx, hy + 5); ctx.fill();
    }
    if (lives > 9) text(ctx, `×${lives}`, cx0 + cw - 190, ly, { size: 12, weight: 800, color: PAL.bone });
    // 영웅
    const p = w.player, hero = w.hero;
    if (!p || !hero) return;
    const hy = cy0 + ch - 62;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cx0 + 12, hy - 10, cw - 24, 64);
    const px = cx0 + 44, py = hy + 22;
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, 24, 0, TAU); ctx.clip();
    ctx.fillStyle = '#12060c'; ctx.fillRect(px - 24, py - 24, 48, 48);
    const chr = CHARACTERS[hero.charId];
    const img = assets.get(chr?.portrait);
    if (img) ctx.drawImage(img, px - 34, py - 22, 68, 68 * (img.height / img.width));
    ctx.restore();
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 25, 0, TAU); ctx.stroke();
    const tx = px + 36, bw = cw - (tx - cx0) - 22;
    text(ctx, chr?.name ?? '', tx, hy + 8, { size: 14, weight: 800, color: PAL.bone });
    text(ctx, `Lv ${hero.level} · ${CLASSES[hero.classId]?.name ?? ''}`, tx + bw, hy + 8, { size: 11, align: 'right', weight: 700, color: PAL.dim });
    gauge(ctx, tx, hy + 17, bw, 8, p.hp / (p.stats?.hp || 1), '#e8283c', { glowEnd: false });
    gauge(ctx, tx, hy + 32, bw * 0.75, 6, p.mp / (p.stats?.mp || 1), '#3a7aff', { glowEnd: false });
    text(ctx, `${Math.ceil(p.hp)} / ${p.stats?.hp ?? 0}`, tx + bw, hy + 44, { size: 10, align: 'right', weight: 700, family: FONT.num, color: PAL.dim });
  }
}
