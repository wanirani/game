// 인게임 메인 메뉴 ('menu') — 스테이지 일시정지 / 마을 허브 / 마구간에서 연다. owner: PLAT-MENU (platform §5.6, §6.2, §6.3, WP-4)
// game.push('menu', { world, tab:'status'|'equip'|'inventory'|'skills'|'class'|'companions'|'quests'|'docs'|'bestiary'|'system', from? })
// 조작: Q·S / E·D (패드 LB / RB) 탭 전환 (메뉴에서는 Q 와 E 가 따로 — MASTER_PLAN §1.4), 상단에서 ←→ 탭 이동, ↓/확인 본문 진입,
//       ↑↓←→ 선택, 결정 · 취소 (패드는 결정 버튼 위치 설정을 따른다), START · 빠른 메뉴(Tab·M·I / SELECT) 로 닫기
//       터치: 탭·항목 터치, 목록 끌어서 스크롤, 내용 영역을 가로로 밀어 탭 이동, 아이템 길게 눌러 행동 메뉴, 오른쪽 위 닫기
//       오른쪽 스틱 Y: 목록 스크롤
// 장면 플래그: uiScale (game.uiW × game.uiH 로 배치, 포인터·탭 영역도 UI 좌표) · hidePad (가상 패드 숨김 — game.syncPad)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { text, font, FONT } from '../../core/ui.js';
import { drawGlyph, glyphWidth, promptMode } from '../../core/prompts.js';
import { clamp, lerp, ease, fmtTime, TAU } from '../../core/math.js';
import { drawIcon } from '../../render/icons.js';
import * as PUPPET from '../../render/hero_puppet.js';
import { currentHero } from '../../game/state.js';
import {
  PAL, glow, glowOval, diamond, glyph, hintRow, Layer, Nav, Gesture, Embers, brackets, inRect, ellipsize,
} from './common.js';
import { heroPerfSample } from './hero_view.js';
import { StatusTab } from './tab_status.js';
import { EquipTab } from './tab_equip.js';
import { InventoryTab } from './tab_inventory.js';
import { SkillsTab } from './tab_skills.js';
import { ClassTab } from './tab_class.js';
import { CompanionsTab } from './tab_companions.js';
import { QuestsTab } from './tab_quests.js';
import { DocsTab } from './tab_docs.js';
import { BestiaryTab } from './tab_bestiary.js';
import { SystemTab } from './tab_system.js';

export const MENU_TABS = [
  { id: 'status', name: '상태', glyph: 'crest', C: () => StatusTab },
  { id: 'equip', name: '장비', glyph: 'sword', C: () => EquipTab },
  { id: 'inventory', name: '인벤토리', glyph: 'bag', C: () => InventoryTab },
  { id: 'skills', name: '스킬', glyph: 'rune', C: () => SkillsTab },
  { id: 'class', name: '직업', glyph: 'crown', C: () => ClassTab },
  { id: 'companions', name: '동료', glyph: 'paw', C: () => CompanionsTab },   // [hook:cmp] companions §7.2
  { id: 'quests', name: '퀘스트', glyph: 'scroll', C: () => QuestsTab },
  { id: 'docs', name: '비전서', glyph: 'book', C: () => DocsTab },
  { id: 'bestiary', name: '도감', glyph: 'bat', C: () => BestiaryTab },
  { id: 'system', name: '기록', glyph: 'hourglass', C: () => SystemTab },
];
const TOP_H = 62, BOT_H = 34;
// 상단 막대: 탭 화살표·닫기 단추는 44 CSS px 이상 (§6.3; 폰 UI 배율에서 1 UI px ≈ 0.83 CSS px → 여유 영역 포함 52.8 UI px)
const ARROW_W = 44, CLOSE_W = 50, BAR_GAP = 10, BAR_M = 8;

export class MenuScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; }

  enter({ world = null, tab = 'status' } = {}) {
    this.world = world ?? this.game.world ?? null;
    this.state = this.game.state;
    if (this.state && !currentHero(this.state)) this.state = null;
    this.tabs = {};
    this.ti = Math.max(0, MENU_TABS.findIndex((t) => t.id === tab));
    this.focus = tab === 'status' ? 'tabs' : 'content';
    this.nav = new Nav();
    this.ges = new Gesture();
    this.embers = new Embers(24);
    this.bgLayer = new Layer();
    this.snap = null;
    this.modal = null;
    this.rev = 0;               // 데이터 변경 버전 (캐시 무효화)
    this.closing = 0;
    this.tabX = null; this.tabSlide = 0; this.slideDir = 0;
    this.tabRects = []; this.closeRect = null; this.qeRects = [];
    this.contentRect = null;
    this.msg = null;            // 하단 알림 {text, color, t}
    // 휠은 메뉴가 맨 위일 때만 모은다 (위에 옵션 등이 열려 있는 동안 굴린 휠이 닫힌 뒤 목록을 튀게 하지 않게)
    this._onWheel = (e) => { if (this.game.top === this && !this.closing) this.ges.addWheel(e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1) * 0.9); };
    window.addEventListener('wheel', this._onWheel, { passive: true });
    // 영웅 미리보기의 역광(림) 패스: 품질 등급 '낮음'이면 HeroView.lowTier() 가 그릴 때마다 끈다 (game.tier, 설정 'auto' 포함).
    // 여기서 HERO_Q.rim 을 끄면 등급이 다시 올라가도 세션 내내 꺼진 채로 남으므로 건드리지 않는다
    audio.sfx('menu_ok');
    if (!this.state) return;
    // 지금 영웅의 채색 인형을 미리 읽어 둔다 (상태·장비·직업 탭의 미리보기)
    try { const h = this.hero; if (h?.charId && PUPPET.puppetEnabled?.() !== false) PUPPET.preloadPuppet?.(h.charId, h.classId); } catch (e) { console.warn(e); }   // [hook:plat]
    this.cur.onShow();
  }
  exit() {
    window.removeEventListener('wheel', this._onWheel);
    for (const k in this.tabs) this.tabs[k].free?.();
    this.bgLayer.free();
    this.snap = null;
    try { this.world?.player?.refreshStats(); } catch (e) { console.warn(e); }
  }
  get hero() { return this.state ? currentHero(this.state) : null; }
  get cur() {
    const d = MENU_TABS[this.ti];
    return this.tabs[d.id] || (this.tabs[d.id] = new (d.C())(this));
  }
  /** UI 너비·높이 (uiScale 장면) */
  get W() { return this.game.uiW ?? this.game.viewW; }
  get H() { return this.game.uiH ?? this.game.viewH; }
  /** 안전 영역 여백 (UI px): safeArea 'full' 일 때만 (fit 이면 캔버스가 이미 안쪽에 있다) */
  safeUi() {
    const g = this.game, s = g.safe;
    if (g.settings?.safeArea !== 'full' || !s) return { l: 0, r: 0, t: 0, b: 0 };
    const k = g.uiK || 1;
    return { l: (s.l || 0) / k, r: (s.r || 0) / k, t: (s.t || 0) / k, b: (s.b || 0) / k };
  }
  /** 데이터가 바뀌었음을 알림 (장비·스킬·아이템 사용 등) — 능력치를 다시 계산한다 (패시브 습득 포함) */
  changed() {
    this.rev++;
    try { this.world?.player?.refreshStats(); } catch (e) { console.warn(e); }
  }
  get inStage() { return !!this.world && this.world.mode !== 'town'; }
  notify(textStr, color = PAL.goldHi) { this.msg = { text: textStr, color, t: 2.2 }; }
  openModal(m) { this.modal = m; }
  focusTabs() { if (this.focus !== 'tabs') { this.focus = 'tabs'; audio.sfx('menu_cancel'); } }
  switchTab(dir, abs = null) {
    const n = MENU_TABS.length;
    const ni = abs !== null ? abs : (this.ti + dir + n) % n;
    if (ni === this.ti) return;
    this.cur.onHide();
    this.slideDir = abs !== null ? Math.sign(ni - this.ti) : dir;
    this.ti = ni; this.tabSlide = 1;
    audio.sfx('menu_move');
    this.cur.onShow();
    if (this.focus === 'content' && !this.cur.wantsFocus) this.focus = 'tabs';
  }
  close() {
    if (this.closing) return;
    audio.sfx('menu_cancel');
    this.closing = 0.001;
  }
  /** 가로 밀기로 탭을 넘겨도 되나: 내용 영역에서 시작했고, 회전대·가로 조작 위가 아니다 (§5.6) */
  swipeOK(sw) {
    if (this.swipeBlocked || !this.contentRect || !inRect(sw.x, sw.y, this.contentRect)) return false;
    const c = this.cur;
    try {
      if (typeof c.swipeBlock === 'function' && c.swipeBlock(sw.x, sw.y)) return false;
      if (typeof c.noSwipe === 'function') { if (c.noSwipe(sw.x, sw.y)) return false; }
      else if (Array.isArray(c.noSwipe) && c.noSwipe.some((r) => inRect(sw.x, sw.y, r))) return false;
    } catch (e) { console.warn(e); }
    for (const r of [c.heroRect, c.stageRect, c.viewRect]) if (r && inRect(sw.x, sw.y, r)) return false;
    return true;
  }

  update(dt) {
    if (this.closing) {
      this.closing += dt;
      if (this.closing >= 0.14) this.game.pop();
      return;
    }
    const nav = this.nav.poll(dt), ges = this.ges;
    ges.update();
    // 회전대 위에서 시작한 손가락은 탭 넘기기 밀기로 보지 않는다 (§5.6, 누른 순간에 판정)
    if (ges.justDown && ges.g) {
      try { this.swipeBlocked = !!this.cur?.swipeBlock?.(ges.g.x, ges.g.y); } catch (e) { this.swipeBlocked = false; console.warn(e); }
    }
    this.embers.update(dt);
    if (this.tabSlide > 0) this.tabSlide = Math.max(0, this.tabSlide - dt * 6);
    if (this.msg) { this.msg.t -= dt; if (this.msg.t <= 0) this.msg = null; }
    if (!this.state) { if (nav.cancel || nav.menu || nav.map || nav.confirm || ges.tapOK) this.close(); return; }
    // 모달 우선
    if (this.modal) {
      const open = this.modal.update(dt, nav, ges);
      if (!open || !this.modal.open) this.modal = null;
      return;
    }
    // 탭 전환: 이전 탭 (Q·S / LB) · 다음 탭 (E·D / RB)
    const dir = nav.prevTab ? -1 : nav.nextTab ? 1 : 0;
    if (dir) { this.switchTab(dir); return; }
    // 닫기 (START · 빠른 메뉴 · 닫기 단추) / 탭 터치
    if (nav.menu || nav.map || ges.tap(this.closeRect)) { this.close(); return; }
    if (ges.tap(this.qeRects[0])) { this.switchTab(-1); return; }
    if (ges.tap(this.qeRects[1])) { this.switchTab(1); return; }
    for (let i = 0; i < this.tabRects.length; i++) {
      if (ges.tap(this.tabRects[i])) {
        if (i !== this.ti) this.switchTab(0, i);
        this.focus = this.cur.wantsFocus && input.touchMode ? 'content' : 'tabs';
        return;
      }
    }
    // 내용을 가로로 밀기 → 탭 이동 (왼쪽으로 밀면 다음 탭)
    if (ges.swipe && this.swipeOK(ges.swipe)) {
      this.switchTab(ges.swipe.dir);
      if (this.cur.wantsFocus) this.focus = 'content';
      return;
    }
    const tab = this.cur;
    tab.t += dt;
    if (this.focus === 'tabs') {
      if (nav.left) this.switchTab(-1);
      else if (nav.right) this.switchTab(1);
      else if ((nav.down || nav.confirm) && tab.wantsFocus) { this.focus = 'content'; audio.sfx('menu_ok'); nav.confirm = false; nav.down = false; }
      else if (nav.cancel) { this.close(); return; }
      tab.update(dt, nav, ges, false);
    } else {
      tab.update(dt, nav, ges, true);
    }
  }

  // ─────────────────────────── 그리기 ───────────────────────────
  captureSnapshot(ctx) {
    const src = ctx.canvas;
    const sw = Math.max(64, Math.round(this.game.viewW / 4)), sh = Math.max(36, Math.round(this.game.viewH / 4));
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    try {
      // 두 단계 축소 → 부드러운 흐림
      const mid = document.createElement('canvas'); mid.width = sw * 2; mid.height = sh * 2;
      const mg = mid.getContext('2d'); mg.imageSmoothingQuality = 'high';
      mg.drawImage(src, 0, 0, src.width, src.height, 0, 0, mid.width, mid.height);
      g.drawImage(mid, 0, 0, sw, sh);
      mid.width = mid.height = 1;
    } catch (e) { g.fillStyle = '#0a0610'; g.fillRect(0, 0, sw, sh); }
    this.snap = c;
    this.opaque = true; // 이후로는 아래 장면을 그리지 않음 (성능)
  }

  render(ctx) {
    const t0 = performance.now();
    this.draw(ctx);
    if (this.t > 0.4 && !this.modal) heroPerfSample(performance.now() - t0);
  }
  draw(ctx) {
    const W = this.W, H = this.H, S = this.safeUi();
    if (!this.snap) this.captureSnapshot(ctx);
    const kIn = ease.outCubic(clamp(this.t / 0.22, 0, 1));
    const kOut = this.closing ? 1 - clamp(this.closing / 0.14, 0, 1) : 1;
    const k = kIn * kOut;
    // 배경: 흐린 스냅샷 + 어둠 + 질감 + 비네팅 — 스냅샷은 열 때 한 번 찍고 바뀌지 않으므로 배경 레이어에 함께 구워
    // 전체 화면 복사를 매 프레임 한 번만 한다 (P-11: fhd2x 에서 전체 화면 복사 한 장이 수십 ms).
    // 열고 닫는 동안(k < 1)은 그 위에 스냅샷을 (1 − k) 로 덮는다 = 스냅샷 위에 배경을 k 로 그린 것과 같은 결과.
    // 1/4 해상도 흐린 스냅샷의 4배 확대는 쌍선형('low')이면 충분하다 ('high' 는 매 프레임 수십 ms)
    ctx.save();
    this.bgLayer.draw(ctx, 'bgs' + (assets.has('tex/tex_blood_marble') ? 1 : 0), 0, 0, W, H, null, (c) => {
      c.imageSmoothingQuality = 'low'; c.drawImage(this.snap, 0, 0, W, H); c.imageSmoothingQuality = 'high';
      this.drawBackdrop(c, W, H);
    });
    if (k < 1) {
      const sq = ctx.imageSmoothingQuality;
      ctx.globalAlpha = 1 - k; ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(this.snap, 0, 0, W, H);
      ctx.imageSmoothingQuality = sq;
    }
    ctx.globalAlpha = k;
    this.embers.render(ctx, W, H, 0.9);
    if (!this.state) {
      text(ctx, '진행 중인 게임이 없습니다', W / 2, H / 2, { size: 22, align: 'center', family: FONT.title, weight: 800, color: PAL.gold });
      ctx.restore();
      return;
    }
    // 상단 탭 막대
    ctx.save();
    ctx.translate(0, (1 - kIn) * -20);
    this.drawTabBar(ctx, W, S);
    ctx.restore();
    // 본문
    const A = { x: 14 + S.l, y: TOP_H + 10, w: W - 28 - S.l - S.r, h: H - TOP_H - 10 - BOT_H - 6 - S.b };
    this.contentRect = A;
    ctx.save();
    const sk = ease.outCubic(1 - this.tabSlide);
    ctx.globalAlpha = k * (0.35 + 0.65 * sk);
    ctx.translate(this.slideDir * 24 * (1 - sk), (1 - kIn) * 14);
    try { this.cur.render(ctx, A); } catch (e) { if (!this._rerr) { console.error(e); this._rerr = true; } }
    ctx.restore();
    this.ges.flush(); // 다른 담당의 탭이 등록 없이 tap() 한 사각형도 등록부에 (여유 영역 · ?debug=taps)
    // 하단 막대
    this.drawBottomBar(ctx, W, H, S);
    // 모달
    if (this.modal) this.modal.render(ctx, W, H);
    ctx.restore();
  }

  drawBackdrop(c, W, H) {
    c.fillStyle = 'rgba(6,3,10,0.8)'; c.fillRect(0, 0, W, H);
    const pat = (() => { const img = assets.get('tex/tex_blood_marble'); return img ? c.createPattern(img, 'repeat') : null; })();
    if (pat) { c.save(); c.globalAlpha = 0.07; c.fillStyle = pat; c.fillRect(0, 0, W, H); c.restore(); }
    // 위쪽 핏빛 여명 + 아래 남빛
    const g1 = c.createRadialGradient(W / 2, -60, 10, W / 2, -60, W * 0.7);
    g1.addColorStop(0, 'rgba(150,20,40,0.35)'); g1.addColorStop(1, 'rgba(150,20,40,0)');
    c.fillStyle = g1; c.fillRect(0, 0, W, H);
    const g2 = c.createLinearGradient(0, H * 0.6, 0, H);
    g2.addColorStop(0, 'rgba(20,14,50,0)'); g2.addColorStop(1, 'rgba(20,14,50,0.35)');
    c.fillStyle = g2; c.fillRect(0, 0, W, H);
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.0);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.7)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
    // 상단 막대
    const tg = c.createLinearGradient(0, 0, 0, TOP_H);
    tg.addColorStop(0, 'rgba(26,10,20,0.97)'); tg.addColorStop(1, 'rgba(10,4,10,0.95)');
    c.fillStyle = tg; c.fillRect(0, 0, W, TOP_H);
    c.fillStyle = 'rgba(0,0,0,0.9)'; c.fillRect(0, TOP_H, W, 2);
    const lg = c.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, 'rgba(200,160,80,0.05)'); lg.addColorStop(0.5, 'rgba(232,200,114,0.85)'); lg.addColorStop(1, 'rgba(200,160,80,0.05)');
    c.fillStyle = lg; c.fillRect(0, TOP_H - 1, W, 1); c.fillRect(0, TOP_H + 3, W, 1);
    // 하단 막대
    const by = H - BOT_H;
    const bg = c.createLinearGradient(0, by, 0, H);
    bg.addColorStop(0, 'rgba(14,6,14,0.94)'); bg.addColorStop(1, 'rgba(4,2,6,0.98)');
    c.fillStyle = bg; c.fillRect(0, by, W, BOT_H);
    c.fillStyle = lg; c.fillRect(0, by, W, 1);
  }

  drawTabBar(ctx, W, S) {
    const t = this.t, ges = this.ges;
    const touch = input.touchMode;
    const ax0 = S.l + BAR_M, x0 = ax0 + ARROW_W + BAR_GAP;
    const closeX = W - S.r - BAR_M - CLOSE_W, ex = closeX - BAR_GAP - ARROW_W, x1 = ex - BAR_GAP;
    const n = MENU_TABS.length, tw = (x1 - x0) / n;
    // 이전·다음 탭 (터치: 화살표, 키보드·패드: 지금 기기의 글리프 — Q/E 또는 LB/RB)
    this.qeRects[0] = ges.zone({ x: ax0, y: 5, w: ARROW_W, h: TOP_H - 10 }, 'icon', { src: 'menu.prevTab' });
    this.qeRects[1] = ges.zone({ x: ex, y: 5, w: ARROW_W, h: TOP_H - 10 }, 'icon', { src: 'menu.nextTab' });
    for (const [r, d] of [[this.qeRects[0], -1], [this.qeRects[1], 1]]) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, hov = ges.over(r);
      if (touch) {
        ctx.beginPath(); ctx.arc(cx, cy, 17, 0, TAU);
        ctx.fillStyle = 'rgba(40,14,24,0.85)'; ctx.fill();
        ctx.strokeStyle = PAL.goldDim; ctx.lineWidth = 1.2; ctx.stroke();
        glyph(ctx, d < 0 ? 'chevronL' : 'chevronR', cx, cy, 18, PAL.goldHi, 2.2);
      } else {
        const act = d < 0 ? 'prevTab' : 'nextTab';
        const gw = glyphWidth(act, 22);
        if (gw > 0) drawGlyph(ctx, act, cx - gw / 2, cy - 11, 22);
        else glyph(ctx, d < 0 ? 'chevronL' : 'chevronR', cx, cy, 16, PAL.goldMid, 2);
        if (hov) glow(ctx, cx, cy, 20, '#ffd070', 0.25);
      }
    }
    // 선택 표시 이동 애니메이션
    const target = x0 + this.ti * tw;
    if (this.tabX === null) this.tabX = target;
    this.tabX = lerp(this.tabX, target, 1 - Math.pow(0.00002, 1 / 60));
    const sx = this.tabX;
    // 선택 판
    const py = 6, ph = TOP_H - 10;
    ctx.save();
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, 'rgba(150,22,44,0.95)'); g.addColorStop(0.55, 'rgba(90,10,28,0.92)'); g.addColorStop(1, 'rgba(40,4,14,0.9)');
    ctx.beginPath();
    ctx.moveTo(sx + 6, py + ph); ctx.lineTo(sx + 2, py + 8); ctx.quadraticCurveTo(sx + 2, py, sx + 10, py);
    ctx.lineTo(sx + tw - 10, py); ctx.quadraticCurveTo(sx + tw - 2, py, sx + tw - 2, py + 8); ctx.lineTo(sx + tw - 6, py + ph); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1.2; ctx.stroke();
    glowOval(ctx, sx + tw / 2, py + ph * 0.55, tw * 0.7, ph * 0.8, '#ff3a50', 0.28 + 0.06 * Math.sin(t * 4));
    ctx.fillStyle = 'rgba(255,230,180,0.25)'; ctx.fillRect(sx + 10, py + 2, tw - 20, 1);
    diamond(ctx, sx + tw / 2, TOP_H + 1, 5, PAL.gold, '#000');
    glow(ctx, sx + tw / 2, TOP_H + 1, 16, '#ffd070', 0.5);
    ctx.restore();
    // 탭들
    this.tabRects.length = 0;
    const nameSize = tw < 64 ? 11 : tw < 80 ? 12 : 13;
    for (let i = 0; i < n; i++) {
      const d = MENU_TABS[i];
      const x = x0 + i * tw, r = { x, y: 4, w: tw, h: TOP_H - 6 };
      this.tabRects.push(ges.zone(r, 'primary', { src: 'menu.tab' }));
      const sel = i === this.ti, hov = ges.over(r);
      const col = sel ? PAL.goldHi : hov ? PAL.bone : PAL.dim;
      if (sel) glow(ctx, x + tw / 2, 22, 16, '#ffd070', 0.35);
      glyph(ctx, d.glyph, x + tw / 2, 22, 17, col, sel ? 1.8 : 1.5);
      text(ctx, ellipsize(ctx, d.name, tw - 6, nameSize, sel ? 800 : 700), x + tw / 2, 50, { size: nameSize, align: 'center', weight: sel ? 800 : 700, color: col, ow: 3 });
      if (i > 0 && !sel && i - 1 !== this.ti) { ctx.fillStyle = 'rgba(200,160,90,0.18)'; ctx.fillRect(x, 16, 1, TOP_H - 30); }
    }
    if (this.focus === 'tabs') brackets(ctx, sx + 4, py + 2, tw - 8, ph - 4, t, PAL.goldHi);
    // 닫기 단추
    this.closeRect = ges.zone({ x: closeX, y: 5, w: CLOSE_W, h: TOP_H - 10 }, 'icon', { src: 'menu.close' });
    const hov = ges.over(this.closeRect);
    const cx = closeX + CLOSE_W / 2, cy = 5 + (TOP_H - 10) / 2;
    ctx.beginPath(); ctx.arc(cx, cy, 17, 0, TAU);
    const cg = ctx.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, 18);
    cg.addColorStop(0, hov ? '#8a1a2a' : '#3a1420'); cg.addColorStop(1, '#12060c');
    ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = hov ? PAL.gold : PAL.goldDim; ctx.lineWidth = 1.5; ctx.stroke();
    glyph(ctx, 'cross', cx, cy, 16, hov ? PAL.goldHi : PAL.bone, 2);
  }

  drawBottomBar(ctx, W, H, S) {
    const y = H - S.b - BOT_H / 2 + 5;
    const st = this.state;
    // 오른쪽: 골드 / 플레이 시간
    let rx = W - 14 - S.r;
    const time = fmtTime(st.stats?.playTime ?? 0);
    ctx.font = font(14, 800, FONT.num);
    const tW = ctx.measureText(time).width;
    text(ctx, time, rx, y, { size: 14, align: 'right', weight: 800, family: FONT.num, color: PAL.bone, ow: 3 });
    rx -= tW + 14;
    glyph(ctx, 'hourglass', rx, y - 5, 14, PAL.goldMid, 1.4);
    rx -= 22;
    const gold = Math.floor(st.gold ?? 0).toLocaleString('ko-KR');
    ctx.font = font(15, 800, FONT.num);
    const gW = ctx.measureText(gold).width;
    text(ctx, gold, rx, y, { size: 15, align: 'right', weight: 800, family: FONT.num, color: '#ffd870', ow: 3 });
    rx -= gW + 14;
    drawIcon(ctx, 'coin', rx, y - 5, 18);
    rx -= 16;
    const lx = 14 + S.l;
    // 알림 or 버튼 안내
    if (this.msg) {
      const a = clamp(this.msg.t * 3, 0, 1);
      ctx.globalAlpha *= a;
      glyph(ctx, 'star', lx + 10, y - 5, 12, this.msg.color, 1.4);
      text(ctx, this.msg.text, lx + 22, y, { size: 14, weight: 700, color: this.msg.color, ow: 3, maxWidth: rx - lx - 34 });
      ctx.globalAlpha /= a || 1;
      return;
    }
    const focused = this.focus === 'content';
    let items = this.cur.hints(focused) || [];
    if (promptMode() === 'touch') {
      const tips = items.filter((it) => it[2]).map((it) => it[2]);
      text(ctx, tips.length ? tips.join('  ·  ') : '항목을 터치해 선택하세요  ·  목록은 끌어서, 탭은 옆으로 밀어서 넘기세요', lx + 2, y, { size: 13, weight: 600, color: PAL.dim, ow: 2, maxWidth: rx - lx - 16 });
      return;
    }
    if (!focused) {
      // 탭 막대에 초점이 있어도 늘 먹는 조작 (상태·장비·직업 탭의 영웅 회전: , . / RS 회전 · / R3 자동 회전)
      let idle = [];
      try { idle = this.cur.idleHints?.() || []; } catch (e) { idle = []; }
      items = [['←→', '탭 이동'], ...(this.cur.wantsFocus ? [['↓', '선택']] : []), ...idle, ['X', '닫기']];
    } else if (!items.some((it) => (Array.isArray(it[0]) ? it[0] : [it[0]]).some((k) => k === 'X' || k === 'cancel'))) items = [...items, ['X', '닫기']];
    ctx.save();
    ctx.beginPath(); ctx.rect(0, H - S.b - BOT_H, rx - 10, BOT_H); ctx.clip();
    hintRow(ctx, items.map((it) => [it[0], it[1]]), lx, y);
    ctx.restore();
  }
}
