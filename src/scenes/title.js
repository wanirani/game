// 타이틀: 클링 키 아트 켄번스 + 번개·박쥐·안개·불씨, 피 글씨 로고, PRESS START → 메인 메뉴, 어트랙트 화면, 코나미 커맨드
// 플랫폼 (platform §6.2 · §6.3 · §6.6 · §9.4.6, P-21 · P-23, MASTER_PLAN §1.16) — owner: PLAT-FRONT-A
//  - uiScale 장면: game.uiW × game.uiH 로 배치 (휴대폰에서 글자·버튼이 커진다). 메뉴 줄 ≥ 36 CSS px, 버튼·계정 표시는 ui.taps (≥ 44 CSS px)
//    좁은 화면(휴대폰)에서는 메뉴가 열리면 로고가 오른쪽으로 비켜 선다 (메뉴 줄이 화면 높이를 거의 다 쓴다)
//  - 로고: ui.bloodText — 피 글씨 'BLOOD NOCTURNE' + 금박 한글 부제 (글꼴이 늦게 와도 ui 가 다시 굽는다)
//  - 오른쪽 아래 알림 (위에서부터): 새 버전 [업데이트] (platform.onUpdateReady; 키보드·패드는 sub 버튼),
//    아이폰 사파리 '홈 화면에 추가' 카드 (닫으면 meta.tips.a2hs), 안드로이드 웹 '안드로이드 앱(APK) 받기' (downloads/BloodNocturne.apk),
//    컨트롤러만 쓰는데 소리가 잠겨 있으면 소리 안내 (P-23)
//  - 오른쪽 위: 최고 점수 + 계정(로그인 아이디 또는 게스트) → 누르면 계정 화면. 메뉴에도 '계정' 항목
//  - 안내 줄은 지금 기기의 글리프 (prompts.drawHints), 가상 패드는 숨김 (hidePad)
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { saves } from '../core/save.js';
import { bus } from '../core/events.js';
import { cloud, SLOTS } from '../core/cloud.js';
import * as platform from '../core/platform.js';
import { text, wrap, FONT, ListMenu, taps, bloodText } from '../core/ui.js';
import { drawHints, drawGlyph, glyphWidth, promptMode } from '../core/prompts.js';
import { clamp, ease, lerp, fmt, rand } from '../core/math.js';
import { hudSafe } from '../render/hud_layout.js';
import { CHARACTERS, CHAR_ORDER } from '../data/characters.js';
import { endArcade } from './front/arcade.js';
import {
  Ambience, kenBurns, shade, menuItem, ornament, applySettings, installRecordScore, gbutton, frame, linGrad, radGrad, glowSprite,
  GOLD, BONE, DIM, follow, modeName, scoreList,
} from './front/common.js';
import { drawCloudBadge, accountBadge } from './front/cloud_ui.js';

const KONAMI = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'attack', 'jump'];
const WATCH = ['up', 'down', 'left', 'right', 'attack', 'jump', 'confirm', 'cancel', 'menu', 'dash', 'sub'];

const ATTRACT_STORY = [
  '백 년에 한 번, 핏빛 달이 떠오르는 밤.',
  '안개 너머로 악마성 녹턴이 다시 모습을 드러냈다.',
  '불타는 마을, 사라진 아이들, 깨어나는 백작.',
  '사냥꾼이여 — 채찍을 들어라.',
];
const TIPS = [
  '부서지는 벽 속에는 전설의 비전서가 잠들어 있다.',
  '↓↘→ + 공격 — 비전서로 익힌 커맨드 기술을 써 보자.',
  '콤보를 길게 이을수록 점수 배율과 스타일 랭크가 오른다.',
  '30,000점마다 목숨이 하나씩 늘어난다. 1UP을 노려라!',
  '드라큘라의 유물 다섯 개… 모두 모으면 무슨 일이 일어날까?',
  '보조무기는 하트를 소모한다. 촛불을 부숴 하트를 모으자.',
];

// ── 로고 (로고 좌표: 가운데가 원점, 이 크기를 sc 배로 그린다) ──
const LOGO_W = 900, LOGO_H = 240, LOGO_CY = -4;          // 묶음 크기와 세로 가운데
const TITLE = 'BLOOD NOCTURNE', SUBTITLE = '블러드 녹턴 : 악마성 연대기';
const TITLE_OPTS = { size: 96, style: 'blood', spacing: 2, drips: 0.45 };
const SUB_OPTS = { size: 30, style: 'gold', family: FONT.title, weight: 800, spacing: 6, glow: false };
const GLINTS = [[-330, -38], [-150, -52], [40, -40], [210, -50], [350, -34], [-40, 78], [120, 74]];

const APK_DEFAULT = 'downloads/BloodNocturne.apk';
/** 기록의 이름 (이니셜이 없으면 영웅 이름 앞부분; 알 수 없는 영웅 id 는 '???') */
const scoreName = (h) => (h.name ? String(h.name) : (typeof h.charId === 'string' && Object.hasOwn(CHARACTERS, h.charId) ? CHARACTERS[h.charId].name.split(' ')[0] : '???'));
const MAX_ROW_CSS = 38; // 메뉴 줄 목표 높이 (CSS px, §6.3 목록 줄 36 + 여유)

export class TitleScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; }

  enter(params = {}) {
    const g = this.game;
    endArcade(g);
    applySettings(g);
    installRecordScore(g);
    scoreList(g.meta); // 손상된 명예의 전당 기록(배열 아님·null 항목)을 한 번 정리 → 이후 모든 화면이 같은 목록을 읽는다
    audio.music('title');
    const st = g.settings ?? {};
    const q = g.tier === 'low' ? 0.5 : g.tier === 'medium' ? 0.75 : 1;
    // 번개(화면 번쩍임)는 '화면 번쩍임'·'동작 줄이기' 설정을 따른다
    const bolts = Number(st.flashFx ?? 1) > 0 && !st.reduceMotion;
    this.amb = new Ambience({ embers: Math.round(70 * q), motes: Math.round(24 * q), bats: Math.round(14 * q), lightning: bolts });
    this.amb.nextBolt = 0.9;
    this.mode = params.menu ? 'menu' : 'intro';
    this.modeT = params.menu ? 1 : 0;
    this.idle = 0;
    this.konami = 0;
    this.px = 0; this.py = 0;
    this.buildMenu(params.index ?? null);
    this.menuK = params.menu ? 1 : 0;
    this.glint = -1; this.glintI = 0; this.nextGlint = 2.2;
    this.logoT = params.menu ? 9 : 0; // 피 방울 연출 시계 (메뉴로 돌아온 경우는 이미 흘러내린 상태)
    this.alive = true;
    // 클라우드에서 기록을 받거나 로그인 상태가 바뀌면 '이어하기' 활성 여부를 다시 계산
    const rebuild = () => { if (this.game.top === this) this.buildMenu(this.menu.index); };
    this.offs = [bus.on('cloud:sync', (e) => { if (e?.phase === 'done') rebuild(); }), bus.on('cloud:login', rebuild), bus.on('cloud:logout', rebuild)];
    // 새 버전 준비 알림 (구독하는 동안 platform.js 는 타이틀에서 자기 안내 토스트를 띄우지 않는다)
    this.upd = null;
    try {
      const off = platform.onUpdateReady?.((e) => { if (!this.alive) return; this.upd = typeof e?.apply === 'function' ? e.apply : () => platform.applyUpdate?.(); g.dirty = true; });
      if (typeof off === 'function') this.offs.push(off);
    } catch (e) { console.error(e); }
    // 안드로이드 웹: 'APK 받기' (latest.json 이 있으면 버전·크기 표시)
    this.apk = safe(() => platform.isAndroidWeb?.()) ? { info: null } : null;
    if (this.apk) this.fetchApk();
    this.notes = [];
  }
  exit() { this.alive = false; for (const off of this.offs ?? []) { try { off(); } catch { /* 무시 */ } } this.offs = []; }
  buildMenu(index) {
    this.saveCount = saves.list().filter((s) => !s.empty).length;
    const cloudSave = cloud.loggedIn && SLOTS.some((s) => cloud.view[s].cloud && !cloud.view[s].cloud.empty);
    const hasSave = this.saveCount > 0 || cloudSave;
    this.items = [
      { id: 'new', label: '새 게임', sub: 'NEW GAME' },
      { id: 'continue', label: '이어하기', sub: 'CONTINUE', disabled: !hasSave },
      { id: 'arcade', label: '아케이드 모드', sub: 'ARCADE MODE' },
      { id: 'hof', label: '명예의 전당', sub: 'HALL OF FAME' },
      { id: 'account', label: '계정', sub: 'ACCOUNT' },
      { id: 'options', label: '설정', sub: 'OPTIONS' },
      { id: 'credits', label: '크레딧', sub: 'CREDITS' },
    ];
    this.menu = new ListMenu(this.items.length, { index: index ?? (hasSave ? 1 : 0) });
  }
  openAccount() {
    const i = this.items.findIndex((it) => it.id === 'account');
    this.game.go('account', { backIndex: i >= 0 ? i : 0 });
  }
  onResume() { applySettings(this.game); this.buildMenu(this.menu.index); }

  // ── 안드로이드 앱(APK) ──
  fetchApk() {
    if (typeof fetch !== 'function') return;
    fetch('downloads/latest.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (this.alive && this.apk && j && typeof j === 'object') { this.apk.info = j; this.game.dirty = true; } })
      .catch(() => { /* 아직 배포 전: 기본 경로로 받는다 */ });
  }
  /** 받을 주소: latest.json 의 url 이 같은 사이트의 .apk 일 때만 그것, 아니면 기본 경로 */
  apkUrl() {
    const u = this.apk?.info?.url;
    if (typeof u === 'string' && u) {
      try {
        const x = new URL(u, location.href);
        if (x.origin === location.origin && /\.apk$/i.test(x.pathname)) return x.href;
      } catch { /* 잘못된 주소 */ }
    }
    return APK_DEFAULT;
  }
  downloadApk() {
    const g = this.game, url = this.apkUrl();
    if (this.apkBusy) return;
    this.apkBusy = true;
    const go = () => {
      try {
        const a = document.createElement('a');
        a.href = url; a.download = 'BloodNocturne.apk'; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
        g.toast('안드로이드 앱(APK)을 내려받습니다. 받은 파일을 열어 설치하세요', '#9fe8ff', 3.6);
      } catch { g.toast('내려받지 못했습니다. 잠시 뒤 다시 시도해 주세요', '#ff9a9a'); }
    };
    // 파일이 있는지 먼저 확인한다 (없는 주소로 이동하면 게임 화면을 떠난다)
    Promise.resolve(typeof fetch === 'function' ? fetch(url, { method: 'HEAD', cache: 'no-store' }).then((r) => r.ok).catch(() => false) : true)
      .then((ok) => {
        this.apkBusy = false;
        if (!this.alive) return;
        if (ok) go();
        else g.toast('지금은 앱(APK)을 받을 수 없습니다. 잠시 뒤 다시 시도해 주세요', '#ffb070', 3);
      });
  }
  applyUpdate() {
    if (!this.upd) return;
    audio.sfx('menu_ok');
    this.game.toast('새 버전으로 다시 시작합니다…', '#9fe8ff', 3);
    const fn = this.upd;
    this.upd = null;
    try { fn(); } catch (e) { console.error(e); }
  }

  // ── 입력 ──
  checkKonami() {
    for (const a of WATCH) {
      if (!input.pressed(a)) continue;
      if (a === 'confirm' || a === 'cancel' || a === 'menu') {
        // confirm/cancel 은 jump/attack 과 같은 키에서 동시에 발생 → 무시
        if (input.pressed('jump') || input.pressed('attack')) continue;
      }
      if (a === KONAMI[this.konami]) this.konami++;
      else this.konami = a === KONAMI[0] ? 1 : 0;
      if (this.konami === KONAMI.length) { this.konami = 0; return true; }
    }
    return false;
  }
  unlockAll() {
    const g = this.game, m = g.meta;
    const already = CHAR_ORDER.every((id) => m.unlockedChars.includes(id)) && m.konami;
    m.unlockedChars = [...new Set([...m.unlockedChars, ...CHAR_ORDER])];
    m.konami = true;
    saves.saveMeta(m);
    audio.sfx('secret'); audio.sfx('extra_life');
    g.flash('#ffe8a0', 0.8, 2.5);
    this.amb.strike(g.uiW || g.viewW, g.uiH || g.viewH, (g.uiW || g.viewW) / 2);
    g.toast(already ? '비밀 코드는 이미 발동되어 있습니다' : '★ 비밀 코드 발동! 모든 헌터가 해금되었습니다 ★', '#ffe070', 3.2);
    this.konamiT = 2.5;
  }

  update(dt) {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    this.amb.update(dt, W, H);
    this.modeT += dt;
    this.logoT += dt;
    if (this.konamiT > 0) this.konamiT -= dt;
    // 마우스 시차
    const p = input.pointer;
    const mouse = p.active && !input.touchMode;
    const tx = mouse ? (p.x / W - 0.5) * -18 : 0, ty = mouse ? (p.y / H - 0.5) * -10 : 0;
    this.px = follow(this.px, tx, dt, 2.5); this.py = follow(this.py, ty, dt, 2.5);
    // 로고 반짝임
    this.nextGlint -= dt;
    if (this.nextGlint <= 0) { this.glint = 0; this.glintI = (this.glintI + 1 + Math.floor(rand(0, GLINTS.length - 1))) % GLINTS.length; this.nextGlint = rand(3.5, 6.5); }
    if (this.glint >= 0) { this.glint += dt / 0.7; if (this.glint > 1) this.glint = -1; }
    this.menuK = follow(this.menuK, this.mode === 'menu' ? 1 : 0, dt, 7);
    if (this.checkKonami()) { this.unlockAll(); return; }

    if (input.anyPressed() || input.pointer.justDown) this.idle = 0; else this.idle += dt;
    // 버튼 (알림 카드·계정 표시): 그 뒤의 '아무 곳이나 누르기'보다 먼저
    const tap = taps.hit(this);
    if (tap === 'update') { this.applyUpdate(); return; }
    if (tap === 'a2hs') { audio.sfx('menu_cancel'); safe(() => platform.dismissA2hs?.()); return; }
    if (tap === 'apk') { audio.sfx('menu_ok'); this.downloadApk(); return; }
    if (tap === 'account' && this.mode !== 'intro') { audio.sfx('menu_ok'); this.openAccount(); return; }
    // 키보드·패드로 업데이트 (sub = 키보드 A · 패드 Y/△)
    if (this.upd && this.mode !== 'intro' && input.pressed('sub')) { this.applyUpdate(); return; }

    if (this.mode === 'intro') {
      if (this.modeT > 2.2 || (this.modeT > 0.3 && (input.pressed('confirm') || input.pressed('menu') || input.pointer.tapped))) { this.mode = 'press'; this.modeT = 0; }
      return;
    }
    if (this.mode === 'press') {
      if (input.pressed('confirm') || input.pressed('menu') || input.pointer.tapped) {
        audio.sfx('menu_ok'); audio.sfx('whip_crack', { vol: 0.6 });
        g.flash('#ffffff', 0.25, 5);
        this.mode = 'menu'; this.modeT = 0; this.idle = 0;
        this.buildMenu(this.menu.index);
      }
      return;
    }
    // 메뉴
    if (this.idle > 40) { this.mode = 'press'; this.modeT = 0; this.idle = 0; return; }
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'cancel') { audio.sfx('menu_cancel'); this.mode = 'press'; this.modeT = 0; return; }
    if (r === 'confirm') this.choose(this.items[this.menu.index]);
  }
  choose(it) {
    const g = this.game;
    if (it.disabled) { audio.sfx('menu_cancel'); g.toast('저장된 기록이 없습니다', '#ff9a9a'); return; }
    audio.sfx('menu_ok');
    switch (it.id) {
      case 'new': g.go('slots', { mode: 'new' }); break;
      case 'continue': g.go('slots', { mode: 'load' }); break;
      case 'arcade': g.go('arcade', {}); break;
      case 'hof': g.go('highscore', { back: 'title' }); break;
      case 'account': this.openAccount(); break;
      case 'options': g.push('options', {}); break;
      case 'credits': g.go('credits', { back: 'title' }); break;
    }
  }

  // ── 배치 (UI 좌표) ──
  /**
   * 메뉴·로고·알림 배치. 메뉴 줄 높이 = 38 CSS px 이상(44~52 UI px). 메뉴 위에 로고를 둘 자리가 넉넉하지 않으면(휴대폰)
   * 메뉴가 열렸을 때 로고가 오른쪽 빈 곳으로 간다
   */
  layout() {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH, k = g.uiK || 1;
    const per = Math.max(0.2, (g.cssScale || 1) * k);
    const S = hudSafe(g);
    const sl = (S.l || 0) / k, sr = (S.r || 0) / k, st = (S.t || 0) / k, sb = (S.b || 0) / k;
    const n = this.items.length;
    const rowH = clamp(Math.ceil(MAX_ROW_CSS / per), 44, 52);
    const bottom = H - 30 - sb;
    let gap = 3, menuH = n * rowH + (n - 1) * gap;
    if (bottom - menuH < 150) { gap = 1; menuH = n * rowH + (n - 1) * gap; }
    const x = 36 + sl, w = Math.min(330, W * 0.36);
    const y0 = Math.max(st + 10, bottom - menuH);
    // 알림 카드 (오른쪽 아래, 아래에서 위로 쌓는다)
    const nw = Math.min(380, W * 0.44), nx = W - 14 - sr - nw;
    let ny = H - (this.game.meta?.konami ? 44 : 30) - sb;
    const cards = [];
    for (const c of this.notes) { ny -= c.h; cards.push({ ...c, x: nx, y: ny, w: nw }); ny -= 8; }
    const stackTop = ny + 8;
    // 메뉴가 열렸을 때의 로고: 메뉴 위 (넉넉하면) 또는 오른쪽 빈 곳
    const room = y0 - 14 - st;
    let logo;
    if (room >= 110) {
      const sc = clamp(Math.min(room / LOGO_H, (w + 90) / LOGO_W), 0.2, 0.5);
      logo = { cx: Math.max(Math.min(250, W * 0.27), sl + 10 + (LOGO_W * sc) / 2), cy: st + 8 + (LOGO_H * sc) / 2, sc, side: false };
    } else {
      const rx0 = x + w + 28, rx1 = W - 16 - sr, ry0 = st + 112, ry1 = Math.max(ry0 + 80, stackTop - 10);
      const sc = clamp(Math.min((rx1 - rx0) / LOGO_W, (ry1 - ry0) / LOGO_H, 0.62), 0.2, 0.62);
      logo = { cx: (rx0 + rx1) / 2, cy: (ry0 + ry1) / 2, sc, side: true };
    }
    // 인트로·PRESS START 의 큰 로고
    const bsc = Math.min(1, (W - 40) / LOGO_W, (H * 0.46) / LOGO_H);
    const big = { cx: W / 2, cy: Math.max(H * 0.3, st + 10 + (LOGO_H * bsc) / 2), sc: bsc };
    const pressY = Math.max(big.cy + (LOGO_H * bsc) / 2 + 40, Math.min(H * 0.8, stackTop - 40));
    return { W, H, per, sl, sr, st, sb, n, rowH, gap, x, w, y0, bottom, logo, big, cards, stackTop, pressY };
  }
  /** 알림 카드 목록 (높이 포함). 내용은 platform 상태를 따른다 */
  collectNotes(ctx, W) {
    const out = this.notes;
    out.length = 0;
    const nw = Math.min(380, W * 0.44);
    if (this.upd) out.push({ id: 'update', h: 60 });
    if (safe(() => platform.a2hsHint?.())) {
      const lines = wrap(ctx, platform.A2HS_TEXT ?? '', nw - 76, 13, 600);
      out.push({ id: 'a2hs', h: Math.max(60, 20 + lines.length * 19), lines });
    }
    if (this.apk) out.push({ id: 'apk', h: 48 });
    if (safe(() => platform.audioHint?.())) out.push({ id: 'audio', h: 26 });
    // 아래에서부터 쌓으므로 뒤집는다 (소리 안내가 맨 아래)
    out.reverse();
  }

  // ── 그리기 ──
  render(ctx) {
    const g = this.game, t = g.time;
    const W = g.uiW || g.viewW;
    this.collectNotes(ctx, W);
    const L = this.layout();
    const H = L.H;
    // 토스트 줄: 로고를 가리지 않는 곳 (메뉴가 열리면 메뉴 오른쪽, 아니면 큰 로고 아래) — game.drawToasts 가 UI 좌표로 읽는다
    if (this.menuK > 0.5) { this.toastX = L.x + L.w + (W - L.sr - L.x - L.w) / 2; this.toastY = L.logo.side ? L.st + 136 : L.st + 150; }
    else { this.toastX = W / 2; this.toastY = L.big.cy + (LOGO_H * L.big.sc) / 2 + 26; }
    const T = this.mode === 'intro' ? this.modeT : 99;
    const img = assets.get('bg/title');
    // 배경 켄번스 (초점: 달·성 중앙 상단)
    kenBurns(ctx, img, W, H, t, { z0: 1.03, z1: 1.1, period: 50, panX: 0.012, panY: 0.01, px: this.px, py: this.py, oy: 0.4 });
    this.amb.draw(ctx, W, H, 'back', t, this.px * 2);
    // 달빛 맥동 (원점 그라데이션 + 알파)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 0.9);
    const mcx = W * 0.5 + this.px, mcy = H * 0.26, mr = H * 0.5;
    ctx.translate(mcx, mcy); ctx.scale(mr / 100, mr / 100);
    ctx.fillStyle = radGrad(ctx, 'tMoon', 0, 0, 4, 100, [[0, 'rgba(255,60,50,1)'], [1, 'rgba(255,0,0,0)']]);
    ctx.fillRect(-100, -100, 200, 200);
    ctx.restore();
    shade(ctx, W, H, { top: 0.35, bottom: 0.8, vig: 0.75 });
    this.amb.draw(ctx, W, H, 'front', t, this.px * 3);
    // 메뉴 쪽 어둡게
    const mk = this.menuK;
    if (mk > 0.01) {
      ctx.save();
      ctx.globalAlpha = mk;
      const lw = Math.max(1, Math.round(W * 0.55));
      ctx.fillStyle = linGrad(ctx, `tSide|${lw}`, 0, 0, lw, 0, [[0, 'rgba(4,1,6,0.86)'], [0.6, 'rgba(4,1,6,0.45)'], [1, 'rgba(4,1,6,0)']]);
      ctx.fillRect(0, 0, lw, H);
      ctx.restore();
    }
    // 인트로 암전
    if (T < 1.2) { ctx.fillStyle = `rgba(0,0,0,${1 - ease.inOutQuad(clamp(T / 1.2, 0, 1))})`; ctx.fillRect(0, 0, W, H); }

    this.drawLogo(ctx, L, t, T, mk);
    if (this.mode === 'press' || this.mode === 'intro') this.drawPress(ctx, L, t, T);
    if (mk > 0.02) this.drawMenu(ctx, L, t, mk);
    // 상단 우측: 최고 점수 (아케이드 감성) + 계정, 하단 우측: 알림 카드 · 저작권
    const a = clamp((T - 1.5) / 0.6, 0, 1);
    if (a > 0) {
      ctx.save(); ctx.globalAlpha = a;
      const hi = scoreList(this.game.meta)[0];
      const xr = W - 16 - L.sr, yt = L.st;
      text(ctx, 'HI-SCORE', xr, yt + 24, { size: 11, align: 'right', weight: 800, family: FONT.num, color: '#ff5a6a', ow: 3 });
      text(ctx, fmt(hi?.score ?? 0).padStart(9, ' '), xr, yt + 46, { size: 20, align: 'right', weight: 900, family: FONT.num, color: '#fff', ow: 4 });
      if (hi) text(ctx, `${scoreName(hi)} · ${modeName(hi.mode)}`, xr, yt + 62, { size: 11, align: 'right', weight: 700, color: DIM, ow: 2 });
      // 계정 (로그인한 아이디 또는 게스트) — 누르면 계정 화면
      const ab = accountBadge();
      const bw = drawCloudBadge(ctx, xr, yt + 90, ab.status, t, { size: 13, label: ab.label });
      if (this.mode !== 'intro') taps.add('account', { x: xr - bw - 10, y: yt + 72, w: bw + 20, h: 36 }, { owner: this, kind: 'primary', src: 'title.account' });
      text(ctx, '© 2026 BLOOD NOCTURNE PROJECT', W - 14 - L.sr, H - 12 - L.sb, { size: 10, align: 'right', weight: 700, family: FONT.num, color: 'rgba(200,180,160,0.55)', ow: 2 });
      if (this.game.meta?.konami) text(ctx, '✦ 비밀 코드 적용됨', W - 14 - L.sr, H - 28 - L.sb, { size: 10, align: 'right', weight: 700, color: 'rgba(255,224,112,0.7)', ow: 2 });
      this.drawNotes(ctx, L, t);
      ctx.restore();
    }
    if (this.konamiT > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(this.konamiT / 2.5, 0, 1) * 0.35;
      const kr = W * 0.6;
      ctx.translate(W / 2, H / 2); ctx.scale(kr / 100, kr / 100);
      ctx.fillStyle = radGrad(ctx, 'tKonami', 0, 0, 2, 100, [[0, '#ffe8a0'], [1, 'rgba(255,200,100,0)']]);
      ctx.fillRect(-100, -100, 200, 200); ctx.restore();
    }
  }

  drawLogo(ctx, L, t, T, mk) {
    const reveal = ease.outCubic(clamp((T - 0.5) / 1.1, 0, 1));
    if (reveal <= 0) return;
    const B = L.big, M = L.logo;
    const cx = lerp(B.cx, M.cx, mk), cy = lerp(B.cy, M.cy, mk) + Math.sin(t * 0.8) * 2 * (1 - mk);
    const sc = lerp(B.sc, M.sc, mk) * lerp(1.12, 1, reveal);
    ctx.save();
    // 뒤쪽 어둠 (가독성): 로고 폭만 한 타원
    ctx.save();
    ctx.globalAlpha = reveal * 0.75;
    const rx = LOGO_W * sc * 0.58, ry = LOGO_H * sc * 0.75;
    ctx.translate(cx, cy); ctx.scale(rx / 100, ry / 100);
    ctx.fillStyle = radGrad(ctx, 'tLogoDark', 0, 0, 6, 100, [[0, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);
    ctx.fillRect(-100, -100, 200, 200);
    ctx.restore();
    ctx.globalAlpha = reveal;
    ctx.translate(cx, cy - LOGO_CY * sc);
    ctx.scale(sc, sc);
    // 위쪽 십자 장식
    ctx.fillStyle = '#1a0206'; ctx.fillRect(-5, -134, 10, 40); ctx.fillRect(-15, -124, 30, 10);
    ctx.fillStyle = GOLD; ctx.fillRect(-2.5, -131, 5, 34); ctx.fillRect(-12.5, -121.5, 25, 5);
    // 제목: 피 글씨 (방울이 흘러내린다)
    bloodText(ctx, TITLE, 0, 18, { ...TITLE_OPTS, t: this.logoT - 0.4 });
    // 장식선 + 가운데 마름모
    ctx.fillStyle = linGrad(ctx, 'tLine', -330, 0, 330, 0, [[0, 'rgba(232,200,114,0)'], [0.5, '#e8c872'], [1, 'rgba(232,200,114,0)']]);
    ctx.fillRect(-330, 38, 660, 2);
    ctx.fillRect(-200, 108, 400, 1.5);
    ctx.save(); ctx.translate(0, 39); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#1a0206'; ctx.fillRect(-7, -7, 14, 14);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(-7, -7, 14, 14);
    ctx.fillStyle = '#c0102a'; ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.restore();
    // 한글 부제 (금박)
    bloodText(ctx, SUBTITLE, 0, 92, SUB_OPTS);
    // 반짝임: 글자 윗면을 스치는 빛 한 점
    if (this.glint >= 0) {
      const [gx, gy] = GLINTS[this.glintI];
      const k = Math.sin(this.glint * Math.PI);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = reveal * k;
      const s = 34 + 24 * k;
      ctx.drawImage(glowSprite('#fff0c8'), gx - s / 2, gy - s / 2, s, s);
      ctx.fillStyle = '#fffbe8';
      ctx.fillRect(gx - s * 0.7, gy - 0.8, s * 1.4, 1.6);
      ctx.fillRect(gx - 0.8, gy - s * 0.45, 1.6, s * 0.9);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  drawPress(ctx, L, t, T) {
    const A = this.mode === 'press' ? clamp(this.modeT / 0.5, 0, 1) : clamp((T - 1.7) / 0.5, 0, 1);
    if (A <= 0) return;
    const W = L.W, y = L.pressY;
    const blink = 0.55 + 0.45 * Math.sin(t * 4.2);
    ctx.save();
    ctx.globalAlpha = A * blink;
    ctx.shadowColor = '#ff2a40'; ctx.shadowBlur = 16;
    text(ctx, 'PRESS START', W / 2, y, { size: 30, align: 'center', weight: 900, family: FONT.logo, color: '#fff4dc', ow: 5, outline: 'rgba(30,0,6,0.95)' });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = A * 0.85;
    const m = promptMode();
    if (m === 'touch') text(ctx, '— 화면을 터치하세요 —', W / 2, y + 28, { size: 15, align: 'center', weight: 700, color: '#d8c8b0', ow: 3 });
    else drawHints(ctx, [[['confirm', 'menu'], m === 'pad' ? '버튼을 누르세요' : '키를 누르세요']], W / 2, y + 28, { align: 'center', size: 15, color: '#d8c8b0' });
    ctx.restore();
    // 어트랙트 (방치 시)
    if (this.mode === 'press' && this.idle > 10) this.drawAttract(ctx, L, t, this.idle - 10);
  }

  drawAttract(ctx, L, t, it) {
    const W = L.W, H = L.H;
    const cyc = 9, n = 3, idx = Math.floor(it / cyc) % n, u = (it % cyc) / cyc;
    const a = clamp(Math.min(u * 6, (1 - u) * 6), 0, 1);
    const y = H * 0.52, w = Math.min(560, W - 80), x = W / 2 - w / 2;
    ctx.save();
    ctx.globalAlpha = a;
    // 부드러운 타원형 어둠 (가장자리 없이)
    ctx.save();
    ctx.translate(W / 2, y + 45); ctx.scale((w + 120) / 180, 1);
    ctx.fillStyle = radGrad(ctx, 'tAttract', 0, 0, 10, 90, [[0, 'rgba(6,2,8,0.8)'], [0.6, 'rgba(6,2,8,0.6)'], [1, 'rgba(6,2,8,0)']]);
    ctx.fillRect(-90, -90, 180, 180);
    ctx.restore();
    if (idx === 0) {
      ATTRACT_STORY.forEach((s, i) => {
        const k = clamp(u * 5 - i * 0.7, 0, 1);
        ctx.globalAlpha = a * k;
        text(ctx, s, W / 2, y + i * 30, { size: i === 3 ? 20 : 17, align: 'center', weight: 800, family: FONT.title, color: i === 3 ? '#ffd890' : '#e8dccb', ow: 3 });
      });
    } else if (idx === 1) {
      text(ctx, 'HALL OF FAME', W / 2, y - 6, { size: 18, align: 'center', weight: 900, family: FONT.logo, color: GOLD, ow: 4 });
      const hs = scoreList(this.game.meta).slice(0, 4);
      if (!hs.length) text(ctx, '아직 기록이 없습니다. 첫 번째 전설이 되어라!', W / 2, y + 40, { size: 15, align: 'center', color: BONE });
      hs.forEach((h, i) => {
        const yy = y + 26 + i * 24;
        text(ctx, `${i + 1}${['ST', 'ND', 'RD', 'TH'][Math.min(i, 3)]}`, x + 70, yy, { size: 14, weight: 900, family: FONT.num, color: i === 0 ? '#ffe070' : BONE });
        text(ctx, scoreName(h), x + 130, yy, { size: 14, weight: 800, color: '#fff' });
        text(ctx, modeName(h.mode), x + 260, yy, { size: 12, color: DIM });
        text(ctx, fmt(h.score), x + w - 70, yy, { size: 15, align: 'right', weight: 900, family: FONT.num, color: '#fff' });
      });
    } else {
      const tip = TIPS[Math.floor(it / (cyc * n)) % TIPS.length];
      text(ctx, 'HUNTER\'S TIP', W / 2, y, { size: 16, align: 'center', weight: 900, family: FONT.logo, color: GOLD, ow: 4 });
      ornament(ctx, W / 2, y + 14, 260, { alpha: a });
      text(ctx, tip, W / 2, y + 52, { size: 17, align: 'center', weight: 700, color: '#f0e4d0', ow: 3, maxWidth: W - 60 });
    }
    ctx.restore();
  }

  drawMenu(ctx, L, t, mk) {
    const { x, w, rowH: h, gap, y0 } = L;
    this.menu.clearHits();
    this.items.forEach((it, i) => {
      const k = ease.outCubic(clamp(mk * 1.6 - i * 0.1, 0, 1));
      if (k <= 0) return;
      const r = { x: x - (1 - k) * 60, y: y0 + i * (h + gap), w, h };
      this.menu.hit(i, r);
      ctx.save(); ctx.globalAlpha = k;
      menuItem(ctx, r, it.label, { selected: this.menu.index === i && this.mode === 'menu', disabled: it.disabled, sub: it.sub, k, size: h >= 48 ? 22 : 21 });
      ctx.restore();
    });
    ctx.save(); ctx.globalAlpha = mk;
    const hy = L.H - 12 - L.sb;
    if (promptMode() === 'touch') text(ctx, '항목을 터치하세요', x + 8, hy, { size: 12, weight: 700, color: '#a89888', ow: 2 });
    else drawHints(ctx, [['dpadV', '선택'], ['confirm', '결정'], ['cancel', '뒤로']], x + 8, hy, { size: 12, color: '#a89888' });
    // 저장된 기록 수: 로고가 메뉴 위에 있을 때 그 사이에
    if (this.saveCount && !L.logo.side && y0 - (L.logo.cy + (LOGO_H * L.logo.sc) / 2) > 18) text(ctx, `저장된 기록 ${this.saveCount}개`, x + 8, y0 - 6, { size: 11, weight: 700, color: DIM, ow: 2 });
    ctx.restore();
  }

  /** 오른쪽 아래 알림 카드 (새 버전 · 홈 화면에 추가 · APK · 소리 안내) */
  drawNotes(ctx, L, t) {
    const m = promptMode();
    for (const c of L.cards) {
      if (c.id === 'audio') {
        const txt = platform.AUDIO_HINT_TEXT ?? '';
        const xr = c.x + c.w;
        ctx.save();
        ctx.globalAlpha *= 0.65 + 0.35 * Math.sin(t * 3);
        ctx.font = `700 13px ${FONT.body}`;
        const tw = Math.min(c.w - 26, ctx.measureText(txt).width);
        speaker(ctx, xr - tw - 14, c.y + c.h / 2, 10);
        text(ctx, txt, xr, c.y + c.h / 2 + 5, { size: 13, align: 'right', weight: 700, color: '#ffd890', ow: 2, maxWidth: c.w - 26 });
        ctx.restore();
        continue;
      }
      if (c.id === 'apk') {
        const info = this.apk?.info;
        const mb = Number(info?.bytes) > 0 ? ` · ${(Number(info.bytes) / 1048576).toFixed(1)}MB` : '';
        const sub = info?.versionName ? `v${String(info.versionName).slice(0, 16)}${mb}` : null;
        const bw = Math.min(c.w, 300), r = { x: c.x + c.w - bw, y: c.y, w: bw, h: c.h };
        gbutton(ctx, r, '안드로이드 앱(APK) 받기', { size: 15, sub, accent: '#86e0a0', owner: this, id: 'apk', src: 'title.apk', disabled: !!this.apkBusy });
        continue;
      }
      frame(ctx, c.x, c.y, c.w, c.h, { accent: c.id === 'update' ? '#86e0a0' : GOLD, fill0: 'rgba(24,10,22,0.94)', edge: 0.8, corners: false });
      if (c.id === 'update') {
        const bw = 118, r = { x: c.x + c.w - bw - 8, y: c.y + 8, w: bw, h: 44 };
        text(ctx, platform.UPDATE_READY_TEXT ?? '새 버전이 준비되었습니다', c.x + 14, c.y + 27, { size: 14, weight: 800, color: '#dff8e6', ow: 2, maxWidth: c.w - bw - 34 });
        text(ctx, '업데이트하면 게임이 다시 시작됩니다', c.x + 14, c.y + 45, { size: 11, weight: 600, color: DIM, ow: 2, maxWidth: c.w - bw - 34 });
        gbutton(ctx, r, '업데이트', { size: 15, selected: true, accent: '#86e0a0', owner: this, id: 'update', src: 'title.update' });
        if (m !== 'touch') { const gw = glyphWidth('sub', 18); if (gw > 0) drawGlyph(ctx, 'sub', r.x - gw - 6, r.y + 13, 18); }
      } else if (c.id === 'a2hs') {
        (c.lines ?? []).forEach((ln, i) => text(ctx, ln, c.x + 14, c.y + 24 + i * 19, { size: 13, weight: 600, color: BONE, ow: 2 }));
        const r = { x: c.x + c.w - 52, y: c.y + (c.h - 44) / 2, w: 44, h: 44 };
        gbutton(ctx, r, '✕', { size: 16, owner: this, id: 'a2hs', kind: 'icon', src: 'title.a2hs' });
      }
    }
  }
}

/** 스피커 아이콘 (소리 안내) */
function speaker(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffd890';
  ctx.beginPath();
  ctx.moveTo(-s * 0.9, -s * 0.35); ctx.lineTo(-s * 0.45, -s * 0.35); ctx.lineTo(0, -s * 0.8); ctx.lineTo(0, s * 0.8); ctx.lineTo(-s * 0.45, s * 0.35); ctx.lineTo(-s * 0.9, s * 0.35);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ffd890'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(s * 0.1, 0, s * 0.45, -0.9, 0.9); ctx.stroke();
  ctx.beginPath(); ctx.arc(s * 0.1, 0, s * 0.8, -0.9, 0.9); ctx.stroke();
  ctx.restore();
}
function safe(fn) { try { return fn(); } catch { return undefined; } }
