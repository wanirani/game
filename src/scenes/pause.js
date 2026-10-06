// 일시정지 오버레이: 흐려진 게임 화면 위 진홍 깃발 메뉴 + 스테이지 정보 카드 — owner: PLAT-DIALOG
//  계속하기 / 메뉴(상태·장비·스킬…) / 인벤토리 / 설정 / 마을로 귀환 / 타이틀로
//  - uiScale 장면 (platform §6.2): game.uiW × game.uiH 로 배치 (최소 720×400), 포인터도 UI 좌표
//  - 항목 줄·확인 창 버튼은 ≥ 44 CSS px (platform §6.3), 탭 영역은 ui.taps 에 등록 (?debug=taps · QA 감사)
//  - 안내 줄은 지금 기기의 글리프 (prompts.drawHints: 키캡 / 패드 버튼 / 터치에선 숨김)
//  - 가상 패드는 scene 플래그 hidePad 로 숨긴다 (game.syncPad 가 유일한 주인)
//  - 토스트(컨트롤러 연결 알림 등)는 오른쪽 정보 카드 아래 칸 (toastX/toastY, UI 좌표)
//  - '마을로 귀환' 은 마을 동쪽 성문 앞에서 시작한다 (hub {from: 스테이지 id})
//  - 회차 (docs/specs/ngplus.md §4.1): 정보 카드 머리 줄 'CHAPTER {c} · {N}회차' (world.ng ≥ 1)
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, FONT, taps, bloodText, prewarmText, wrap } from '../core/ui.js';
import { drawHints } from '../core/prompts.js';
import { clamp, ease, fmtTime, TAU } from '../core/math.js';
import { CHARACTERS } from '../data/characters.js';
import { CLASSES } from '../data/classes.js';
import * as NG from '../game/ngplus.js';   // [hook:ng]
import {
  PAL, frame, divider, glow, glowOval, glyph, gauge, diamond, gbutton, Nav, Gesture, Embers,
} from './menu/common.js';

const BANNER_W = 316;
const TITLE = 'PAUSE';

/** 이 장면 좌표 1 px 이 몇 CSS px 인가 (uiScale 이면 uiK 포함) */
function cssPer(sc) {
  const g = sc.game;
  return Math.max(0.2, (g.cssScale || 1) * (sc.uiScale ? g.uiK || 1 : 1));
}
/** 탭 대상 최소 높이 (44 CSS px + 여유 2) → 이 장면 좌표 */
function tapH(sc, base = 46) {
  return Math.max(base, Math.ceil(46 / cssPer(sc)));
}

/** 확인 창 (예/아니오). 버튼은 ≥ 44 CSS px, ui.taps 로 판정 */
class PauseConfirm {
  constructor({ title = '확인', text: msg = '', yes = '예', no = '아니오', onYes = null, onNo = null, danger = false } = {}) {
    this.title = title; this.msg = msg; this.yes = yes; this.no = no; this.onYes = onYes; this.onNo = onNo; this.danger = danger;
    this.i = danger ? 1 : 0; this.t = 0; this.open = true;
  }
  close(ok) {
    if (!this.open) return;
    this.open = false;
    audio.sfx(ok ? 'menu_ok' : 'menu_cancel');
    if (ok) this.onYes?.(); else this.onNo?.();
  }
  /** → 계속 열려 있으면 true */
  update(dt, nav, ges, owner) {
    this.t += dt;
    if (!this.open) return false;
    if (nav.left || nav.right || nav.up || nav.down) { this.i = 1 - this.i; audio.sfx('menu_move'); }
    if (ges.hover) { const o = taps.over(owner); if (o === 'cf_yes') this.i = 0; else if (o === 'cf_no') this.i = 1; }
    const hit = ges.tapOK ? taps.hit(owner) : null;
    if (hit === 'cf_yes' || hit === 'cf_no') { this.close(hit === 'cf_yes'); return false; }
    if (nav.confirm) { this.close(this.i === 0); return false; }
    if (nav.cancel || nav.menu) { this.close(false); return false; }
    return true;
  }
  render(ctx, W, H, owner, bh) {
    const k = ease.outBack(clamp(this.t / 0.18, 0, 1));
    const w = Math.min(460, W - 60);
    const lines = wrap(ctx, this.msg, w - 60, 15, 500, FONT.body);
    const h = 64 + lines.length * 23 + bh + 34;
    const x = (W - w) / 2, y = (H - h) / 2;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.55 * clamp(this.t / 0.12, 0, 1)})`; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); ctx.translate(-W / 2, -H / 2);
    ctx.globalAlpha = clamp(this.t / 0.1, 0, 1);
    glowOval(ctx, W / 2, H / 2, w * 0.75, h * 0.8, this.danger ? '#8a0a1e' : '#4a2a10', 0.45);
    frame(ctx, x, y, w, h, { top: 'rgba(36,16,34,0.98)', bot: 'rgba(10,4,12,0.98)', edge: PAL.goldMid, glowC: this.danger ? '#a01020' : null });
    text(ctx, this.title, W / 2, y + 34, { size: 19, align: 'center', weight: 800, family: FONT.title, color: this.danger ? '#ff8a8a' : PAL.gold });
    divider(ctx, x + 40, y + 46, w - 80);
    lines.forEach((l, i) => text(ctx, l, W / 2, y + 74 + i * 23, { size: 15, align: 'center', color: PAL.text, weight: 500 }));
    const bw = Math.min(150, (w - 60) / 2), by = y + h - bh - 18;
    [[this.yes, 'cf_yes'], [this.no, 'cf_no']].forEach(([lb, id], i) => {
      const r = { x: i === 0 ? W / 2 - bw - 10 : W / 2 + 10, y: by, w: bw, h: bh };
      // 등장 애니메이션(확대) 중에도 판정 영역은 최종 위치 (확대가 끝난 모습 기준)
      gbutton(ctx, r, lb, { hot: this.i === i, t: this.t, size: 16 });
      taps.add(id, r, { owner, kind: 'primary', src: 'pause.confirm' });
    });
    ctx.restore();
  }
}

export class PauseScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; }
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
    this.modal = null; this.snap = null; this.closing = 0; this.L = null;
    audio.duck?.(0.5, 0.3);
    this.prewarm();
  }
  exit() { this.snap = null; }
  onResume() { this.opaque = !!this.snap; }
  /** 토스트 줄 (UI 좌표): 오른쪽 정보 카드 아래 — 기본 자리(가운데 y 92)는 카드 제목을 가린다 */
  get toastX() { return (this.L ?? this.layout()).toastX; }
  get toastY() { return (this.L ?? this.layout()).toastY; }
  prewarm() {
    const g = this.game, ctx = g.ctx;
    if (!ctx?.setTransform) return;
    const k = (g.scale || 1) * (g.uiK || 1);
    ctx.save();
    try { ctx.setTransform(k, 0, 0, k, 0, 0); prewarmText(ctx, TITLE, { size: this.layout().titleSize, style: 'gold' }); } catch (e) { /* 그릴 때 굽는다 */ } finally { ctx.restore(); }
  }
  resume() { if (this.closing) return; audio.sfx('menu_cancel'); this.closing = 0.001; }
  confirmTown() {
    const w = this.world;
    this.modal = new PauseConfirm({
      title: '마을로 귀환', yes: '귀환한다', no: '취소', danger: true,
      text: '스테이지 진행 상황은 사라지지만,\n지금까지 얻은 경험치와 아이템은 그대로 남습니다.',
      onYes: () => {
        try { w?.syncToState?.(); } catch (e) { /* 무시 */ }
        // 마을로 돌아가면 목숨을 난이도 기본값까지 회복 (포기·클리어와 동일. 1UP 으로 늘어난 목숨은 유지)
        const st = this.game.state, full = w?.diff?.lives;
        if (st && full) st.lives = Math.max(st.lives ?? 0, full);
        // from = 스테이지 id → 마을은 동쪽 성문 앞에서 시작 (hub.js: 도착 이유가 처음 방문·이어하기가 아니면 성문)
        this.game.go(this.game.registry.hub ? 'hub' : 'title', { from: w?.stage?.id ?? 'stage' });
      },
    });
  }
  confirmTitle() {
    const w = this.world;
    this.modal = new PauseConfirm({
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
    if (this.modal) { if (!this.modal.update(dt, nav, ges, this) || !this.modal.open) this.modal = null; return; }
    const n = this.items.length;
    if (nav.up) { this.i = (this.i - 1 + n) % n; audio.sfx('menu_move'); }
    if (nav.down) { this.i = (this.i + 1) % n; audio.sfx('menu_move'); }
    if (ges.hover) { const o = rowOf(taps.over(this)); if (o >= 0 && o < n) this.i = o; }
    const hit = ges.tapOK ? rowOf(taps.hit(this)) : -1;
    if (hit >= 0 && hit < n) { this.i = hit; this.run(hit); return; }
    if (nav.confirm) { this.run(this.i); return; }
    if (nav.cancel || nav.menu) this.resume();
  }

  /** 배치 (UI px). 줄 높이는 ≥ 44 CSS px — 화면이 낮으면 머리글을 줄인다 */
  layout() {
    const g = this.game;
    const W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const hints = !input.touchMode;
    const n = this.items?.length ?? 6;
    let rowH = tapH(this, 46);
    let y0 = 146;
    const bottom = H - 16;
    // 낮은 화면(최소 UI 720×400, 예: 568×320 폰)에서는 머리글을 더 줄여 줄 높이(≥ 44 CSS px)를 지킨다: y0 는 44 까지 올라간다
    if (y0 + n * rowH > bottom) y0 = bottom - n * rowH;
    if (y0 < 44) { rowH = Math.max(40, Math.floor((bottom - 44) / n)); y0 = bottom - n * rowH; }
    const compact = y0 < 130, tight = y0 < 80; // tight: 'PAUSE' 만 작게 (구분선·'일 시 정 지' 생략)
    const titleY = tight ? y0 - 12 : compact ? y0 - 40 : 88;
    const bx = Math.round(clamp(W * 0.08, 40, 120)), bw = BANNER_W;
    const bh = Math.max(H - 44, y0 + n * rowH + 40); // 줄이 길면 깃발 끝(가운데 홈)은 화면 아래로 내려간다
    // 오른쪽 정보 카드: 아래에 토스트 두 줄 + 안내 줄 자리를 남긴다
    const cw = Math.min(380, W * 0.4), ch = clamp(H - 110, 322, 330);
    const cx0 = W - cw - clamp(W * 0.07, 30, 110);
    const cy0 = clamp(H - ch - 64 - (hints ? 30 : 8), 16, 88);
    return {
      W, H, hints, n, rowH, y0, bx, bw, bh, compact, tight,
      titleY, titleSize: tight ? 30 : compact ? 36 : 46, dividerY: tight ? null : compact ? titleY + 12 : 104, subY: tight ? null : compact ? titleY + 29 : 126,
      // 토스트 두 줄(기준선 y, y+30 · 상자 y-20…y+8)이 화면 안, 안내 줄 위에 들어오게
      cw, ch, cx0, cy0, toastX: cx0 + cw / 2, toastY: Math.min(cy0 + ch + 32, H - 38 - (hints ? 30 : 4)),
      btnH: tapH(this, 40),
    };
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
    const L = this.L = this.layout();
    const { W, H } = L;
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
    this.drawBanner(ctx, L, kIn);
    ctx.restore();
    // ── 정보 카드 ──
    this.drawInfo(ctx, L, kIn);
    // 하단 안내 (키보드·패드: 지금 기기의 글리프 / 터치: 항목을 바로 누르면 되므로 생략)
    if (L.hints && !this.modal) {
      ctx.save(); ctx.globalAlpha = k;
      drawHints(ctx, [['dpadV', '선택'], ['confirm', '결정'], [['cancel', 'menu'], '계속하기']], W - 20, H - 16, { align: 'right', size: 13 });
      ctx.restore();
    }
    if (this.modal) this.modal.render(ctx, W, H, this, L.btnH);
  }

  drawBanner(ctx, L, kIn) {
    const { bx, bw, bh } = L;
    const drop = (1 - kIn) * -60;
    ctx.save();
    ctx.translate(0, drop);
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(bx, -4); ctx.lineTo(bx + bw, -4); ctx.lineTo(bx + bw, bh); ctx.lineTo(bx + bw / 2, bh - 34); ctx.lineTo(bx, bh); ctx.closePath();
    };
    shape();
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
    shape();
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bx + 8, -4); ctx.lineTo(bx + 8, bh - 10); ctx.lineTo(bx + bw / 2, bh - 40); ctx.lineTo(bx + bw - 8, bh - 10); ctx.lineTo(bx + bw - 8, -4); ctx.stroke();
    // 문장 (피 글씨: 금박)
    const cx = bx + bw / 2;
    glow(ctx, cx, L.titleY - L.titleSize * 0.4, L.tight ? 50 : 70, '#ff4050', 0.3);
    bloodText(ctx, TITLE, cx, L.titleY, { size: L.titleSize, style: 'gold', t: this.t, maxWidth: bw - 40 });
    if (L.dividerY != null) divider(ctx, bx + 40, L.dividerY, bw - 80, { color: PAL.gold });
    if (L.subY != null) text(ctx, '일 시 정 지', cx, L.subY, { size: 14, align: 'center', weight: 800, family: FONT.title, color: '#f0d8c0', ow: 3 });
    // 항목 (줄 전체가 탭 영역: 줄끼리 맞닿아 있어 ≥ 44 CSS px 그대로 눌린다)
    const rowH = L.rowH;
    this.items.forEach((it, k) => {
      const r = { x: bx + 20, y: L.y0 + k * rowH, w: bw - 40, h: rowH };
      if (!this.modal) taps.add('r' + k, r, { owner: this, kind: 'primary', src: 'pause.row' }); // 떨어지는 연출 중에도 최종 위치로 판정
      const sel = k === this.i && !this.modal;
      const ry = r.y + 3, rh = r.h - 6, cy = r.y + r.h / 2;
      if (sel) {
        const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
        g.addColorStop(0, 'rgba(10,2,6,0.7)'); g.addColorStop(0.7, 'rgba(10,2,6,0.45)'); g.addColorStop(1, 'rgba(10,2,6,0)');
        ctx.fillStyle = g; ctx.fillRect(r.x, ry, r.w, rh);
        const lg = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
        lg.addColorStop(0, 'rgba(255,220,140,0.95)'); lg.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = lg; ctx.fillRect(r.x, ry, r.w, 1); ctx.fillRect(r.x, ry + rh - 1, r.w, 1);
        glow(ctx, r.x + 28, cy, 26, '#ffc060', 0.35 + 0.15 * Math.sin(this.t * 5));
        diamond(ctx, r.x - 2, cy, 5 + Math.sin(this.t * 5), PAL.goldHi);
      }
      const col = it.disabled ? '#8a6068' : sel ? PAL.goldHi : PAL.bone;
      glyph(ctx, it.icon, r.x + 28, cy, 18, sel ? PAL.goldHi : it.disabled ? '#6a4048' : PAL.gold, 1.6);
      text(ctx, it.label, r.x + 50, cy + (it.sub ? 0 : 6), { size: 17, weight: 800, color: col, ow: 3 });
      if (it.sub) text(ctx, it.sub, r.x + 50, cy + 16, { size: 11, weight: 600, color: sel ? '#f0d0b0' : '#c0909a', ow: 2 });
    });
    ctx.restore();
  }

  drawInfo(ctx, L, kIn) {
    const w = this.world;
    if (!w) return;
    const { cw, ch, cy0 } = L;
    const cx0 = L.cx0 + (1 - kIn) * 40;
    frame(ctx, cx0, cy0, cw, ch, { top: 'rgba(24,12,30,0.9)', bot: 'rgba(8,4,12,0.92)' });
    const st = w.stage || {};
    const ng = w.ng > 0 ? NG.ngLabel?.(w.ng) || `${w.ng + 1}회차` : '';   // [hook:ng]
    text(ctx, `CHAPTER ${st.chapter ?? ''}${ng ? ` · ${ng}` : ''}`, cx0 + 22, cy0 + 30, { size: 12, weight: 800, family: FONT.num, color: PAL.goldMid });
    text(ctx, st.name ?? '', cx0 + 22, cy0 + 60, { size: 26, weight: 800, family: FONT.title, color: PAL.bone, ow: 4, maxWidth: cw - 44 });
    if (st.sub) text(ctx, st.sub, cx0 + 22, cy0 + 80, { size: 12, weight: 600, color: PAL.dim, maxWidth: cw - 44 });
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
    const img = chr?.portrait ? assets.get(chr.portrait) : null;
    if (img) ctx.drawImage(img, px - 34, py - 22, 68, 68 * (img.height / img.width));
    ctx.restore();
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 25, 0, TAU); ctx.stroke();
    const tx = px + 36, bw = cw - (tx - cx0) - 22;
    text(ctx, chr?.name ?? '', tx, hy + 8, { size: 14, weight: 800, color: PAL.bone });
    text(ctx, `Lv ${hero.level} · ${CLASSES[hero.classId]?.name ?? ''}`, tx + bw, hy + 8, { size: 11, align: 'right', weight: 700, color: PAL.dim });
    gauge(ctx, tx, hy + 17, bw, 8, p.hp / (p.stats?.hp || 1), '#e8283c', { glowEnd: false });
    gauge(ctx, tx, hy + 32, bw * 0.75, 6, p.mp / (p.stats?.mp || 1), '#3a7aff', { glowEnd: false });
    text(ctx, `${Math.ceil(p.hp)} / ${p.stats?.hp ?? 0}`, tx + bw, hy + 46, { size: 11, align: 'right', weight: 700, family: FONT.num, color: PAL.dim });
  }
}

/** 탭 영역 id 'r3' → 3 (항목 줄이 아니면 -1) */
function rowOf(id) {
  return typeof id === 'string' && /^r\d+$/.test(id) ? Number(id.slice(1)) : -1;
}
