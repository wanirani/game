// 타이틀: 클링 키 아트 켄번스 + 번개·박쥐·안개·불씨, 피 글씨 로고, PRESS START → 메인 메뉴, 어트랙트 화면, 코나미 커맨드
// 플랫폼 (platform §6.2 · §6.3 · §6.6 · §9.4.6, P-21 · P-23, MASTER_PLAN §1.16) — owner: PLAT-FRONT-A
//  - uiScale 장면: game.uiW × game.uiH 로 배치 (휴대폰에서 글자·버튼이 커진다). 메뉴 줄 ≥ 36 CSS px, 버튼·계정 표시는 ui.taps (≥ 44 CSS px)
//    좁은 화면(휴대폰)에서는 메뉴가 열리면 로고가 오른쪽으로 비켜 선다 (메뉴 줄이 화면 높이를 거의 다 쓴다)
//  - 로고: ui.bloodText — 피 글씨 'BLOOD NOCTURNE' + 금박 한글 부제 (글꼴이 늦게 와도 ui 가 다시 굽는다)
//  - 오른쪽 아래 알림 (위에서부터): 새 버전 [업데이트] (platform.onUpdateReady; 키보드·패드는 sub 버튼),
//    아이폰 사파리 '홈 화면에 추가' 카드 (닫으면 meta.tips.a2hs), 안드로이드 웹 '안드로이드 앱(APK) 받기' (downloads/BloodNocturne.apk),
//    컨트롤러만 쓰는데 소리가 잠겨 있으면 소리 안내 (P-23), 익명 통계 안내 한 번 (닫으면 meta.tips.telemetry, core/telemetry.js)
//  - 오른쪽 위: 최고 점수 + 계정(로그인 아이디 또는 게스트) → 누르면 계정 화면. 메뉴에도 '계정' 항목
//  - 안내 줄은 지금 기기의 글리프 (prompts.drawHints), 가상 패드는 숨김 (hidePad)
//  - 업적 (docs/specs/achievements.md §7.6 · §5.2, ACH-UI): 메뉴 8번째 줄 '업적' (명예의 전당 다음, 안 본 달성이 있으면 붉은 점 + NEW n)
//    → go('achievements', {back:'title'}) · 고른 타이틀 장식(meta.ach.deco → core/ach_meta.js ACH_DECOS)을 Ambience 인자에 더한다
//    (박쥐·먼지 수 배율, 불씨·안개 색, '핏빛 달'은 로고 뒤 오른쪽 위 달 하나). decoOf · decoAmbience · drawDecoMoon 은 업적 화면도 쓴다
//  - 회랑 (docs/specs/gallery.md §5.7, GAL-UI): 메뉴 8번째 줄 '크레딧' 자리가 '회랑' (줄 수 8 그대로 — 크레딧은 회랑의 극장 안으로)
//    → go('gallery', {back:'title', backIndex}) · 안 본 그림·곡이 있으면 업적 줄과 같은 붉은 점 + NEW n (g.gal.summary().unseen, 1초마다)
//  - PRESS START (benchmark #2): 깜빡임 대신 78–100 % 숨쉬기('동작 줄이기'면 멈춤), 뒤에 부드러운 어둠 띠(어트랙트와 같은 캐시 그라데이션)
//    + 진홍 선. 자리는 로고 아래 ~ 그림 속 사냥꾼 머리 위 (켄번스 기하로 계산, hunterTop) — 사냥꾼을 가리지 않는다.
//    안내 줄은 휴대폰에서 15 CSS px 이상 (ceil(15/per), 15–18 UI). 휴대폰 메뉴 상태의 작은 로고는 부제만 18 UI 로 키운다 (logo.subK)
//  - 접근성 (benchmark #6): 왼쪽 가장자리 '보기' 탭(누르기 화면, ≥ 44 CSS px) → push('options', {page:'screen'}).
//    번개는 Ambience 가 설정을 매번 읽는다 (front/common.js lightningAllowed — 설정에서 돌아와도 바로 반영).
//    '동작 줄이기'면 켄번스 줌·팬과 로고 흔들림도 멈춘다. 저장된 설정이 없는 첫 실행은 첫 입력 전까지 번개를 치지 않고 두 번째 섬광도 없다
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { saves } from '../core/save.js';
import { bus } from '../core/events.js';
import { cloud, SLOTS } from '../core/cloud.js';
import * as platform from '../core/platform.js';
import { NOTICE_TEXT as TELEMETRY_TEXT } from '../core/telemetry.js';
import { text, wrap, FONT, ListMenu, taps, bloodText } from '../core/ui.js';
import { drawHints, drawGlyph, glyphWidth, promptMode } from '../core/prompts.js';
import { clamp, ease, lerp, fmt, rand, TAU } from '../core/math.js';
import { hudSafe } from '../render/hud_layout.js';
import { CHARACTERS, CHAR_ORDER } from '../data/characters.js';
import * as ACHM from '../core/ach_meta.js';
// 아케이드 장면(arcade.js → 보스·아이템·퀘스트 데이터)은 정적으로 싣지 않는다: endArcade 는 front/common.js 의 것 (R1-REQ-229)
import {
  Ambience, kenBurns, shade, menuItem, ornament, applySettings, installRecordScore, gbutton, frame, linGrad, radGrad, glowSprite,
  GOLD, BONE, DIM, follow, modeName, scoreList, endArcade, lightningAllowed,
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
const LOGO_BOT = 112;                                     // 로고 묶음 아래 끝 (아래 금선 108 + 여유, 로고 좌표)
const SUB_MIN = 18;                                       // 휴대폰 메뉴 상태(로고가 오른쪽으로 비켜 섬)의 부제 최소 크기 (UI px ≈ 15 CSS px)

// ── 배경 켄번스 (render 와 layout 이 같은 값을 쓴다) ──
const KB = { z0: 1.03, z1: 1.1, period: 50, panX: 0.012, panY: 0.01, oy: 0.4 };
// 그림(bg/title.webp, lo/ 변형도 같은 비율) 속 사냥꾼 두건 꼭대기의 세로 비율 — 원화 1912×1005 에서 y ≈ 700
const HUNTER_TOP_V = 0.696;
// PRESS START 묶음: 기준선 y 에서 위로 PRESS_UP, 아래로 PRESS_DN (안내 줄 포함). 어둠 띠는 그 가운데에 둔다
const PRESS_UP = 25, PRESS_DN = 36, PRESS_HINT_DY = 30;

// ── 타이틀 장식 (업적 보상, docs/specs/achievements.md §5.2) ──
/** 고른 타이틀 장식 {name, amb} (meta.ach.deco; 없거나 모르는 id 면 null) */
export function decoOf(meta) {
  const id = meta?.ach?.deco, D = ACHM.ACH_DECOS;
  return typeof id === 'string' && D && Object.hasOwn(D, id) ? D[id] : null;
}
/** Ambience 인자에 장식을 더한다: 색은 바꾸고, batsMul·motesMul 은 수에 곱한다 (박쥐 28 이하 — 그리기 예산은 지금과 같은 수준) */
export function decoAmbience(base, deco) {
  const a = deco?.amb, o = { ...base };
  if (!a || typeof a !== 'object') return o;
  if (typeof a.emberColor === 'string') o.emberColor = a.emberColor;
  if (typeof a.fogTint === 'string') o.fogTint = a.fogTint;
  if (Number(a.batsMul) > 0) o.bats = Math.min(28, Math.round((o.bats ?? 12) * a.batsMul));
  if (Number(a.motesMul) > 0) o.motes = Math.round((o.motes ?? 30) * a.motesMul);
  return o;
}
/** '핏빛 달' 장식: 붉은 달 원판 하나 (발광은 glowSprite 캐시, 원 하나 + 얼룩 둘) */
export function drawDecoMoon(ctx, x, y, r, t = 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 + 0.1 * Math.sin(t * 0.7);
  const s = r * 4.4;
  ctx.drawImage(glowSprite('#ff3040'), x - s / 2, y - s / 2, s, s);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#c41c2e';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#4a0610';
  ctx.beginPath(); ctx.arc(x - r * 0.28, y - r * 0.18, r * 0.26, 0, Math.PI * 2); ctx.arc(x + r * 0.3, y + r * 0.26, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.35; ctx.strokeStyle = '#ff8a8a'; ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath(); ctx.arc(x, y, r * 0.96, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
  ctx.restore();
}

const APK_DEFAULT = 'downloads/BloodNocturne.apk';
/** 기록의 이름 (이니셜이 없으면 영웅 이름 앞부분; 알 수 없는 영웅 id 는 '???') */
const scoreName = (h) => (h.name ? String(h.name) : (typeof h.charId === 'string' && Object.hasOwn(CHARACTERS, h.charId) ? CHARACTERS[h.charId].name.split(' ')[0] : '???'));
const MAX_ROW_CSS = 38; // 메뉴 줄 목표 높이 (CSS px, §6.3 목록 줄 36 + 여유)
/** 이번 실행에서 타이틀이 첫 입력을 받았는가 (첫 실행의 번개 미루기는 한 번만) */
let firstInputSeen = false;
/** 이 기기에 저장된 설정이 있는가 (없으면 첫 실행 — save.js loadSettings 는 저장된 값이 없으면 쓰지 않는다). 저장소를 못 읽으면 있는 것으로 */
function hasSavedSettings() {
  try { return localStorage.getItem('bloodnocturne_settings') != null; } catch { return true; }
}

export class TitleScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; }

  enter(params = {}) {
    const g = this.game;
    endArcade(g);
    applySettings(g);
    installRecordScore(g);
    scoreList(g.meta); // 손상된 명예의 전당 기록(배열 아님·null 항목)을 한 번 정리 → 이후 모든 화면이 같은 목록을 읽는다
    audio.music('title');
    const q = g.tier === 'low' ? 0.5 : g.tier === 'medium' ? 0.75 : 1;
    const deco = decoOf(g.meta);   // 업적 보상 타이틀 장식 (§5.2)
    // 번개(화면 번쩍임)는 '화면 번쩍임'·'동작 줄이기' 설정을 따른다 — Ambience 가 프레임마다 설정을 읽는다 (lightningAllowed)
    this.amb = new Ambience(decoAmbience({ embers: Math.round(70 * q), motes: Math.round(24 * q), bats: Math.round(14 * q), lightning: true }, deco));
    this.moon = !!deco?.amb?.moon;
    this.achNew = 0; this.achPoll = 0;
    this.galNew = 0;   // [hook:gal] 회랑: 안 본 그림·곡 수 (achPoll 과 같이 1초마다)
    // 첫 실행(저장된 설정 없음): 설정을 고를 기회가 오기 전에는 번개를 치지 않는다 → 첫 입력 뒤 2.5초. 두 번째 섬광도 없다
    this.boltHold = !firstInputSeen && !hasSavedSettings();
    this.amb.nextBolt = this.boltHold ? Infinity : 0.9;
    if (this.boltHold) this.amb.secondP = 0;
    this.syncMotion();
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
    this.offs.push(bus.on('achievementUnlocked', () => { this.achPoll = 0; }));   // NEW 수를 곧 다시 읽는다
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
  exit() {
    this.alive = false; for (const off of this.offs ?? []) { try { off(); } catch { /* 무시 */ } } this.offs = [];
    // 익명 통계 안내를 3초 넘게 보고 타이틀을 떠났으면 본 것으로 (키보드·패드만 쓰면 ✕ 를 누를 수 없다)
    if ((this.telNoticeT ?? 0) > 3) safe(() => this.game.telemetry?.dismissNotice?.());
  }
  buildMenu(index) {
    this.saveCount = saves.list().filter((s) => !s.empty).length;
    const cloudSave = cloud.loggedIn && SLOTS.some((s) => cloud.view[s].cloud && !cloud.view[s].cloud.empty);
    const hasSave = this.saveCount > 0 || cloudSave;
    this.items = [
      { id: 'new', label: '새 게임', sub: 'NEW GAME' },
      { id: 'continue', label: '이어하기', sub: 'CONTINUE', disabled: !hasSave },
      { id: 'arcade', label: '아케이드 모드', sub: 'ARCADE MODE' },
      { id: 'hof', label: '명예의 전당', sub: 'HALL OF FAME' },
      { id: 'ach', label: '업적', sub: 'ACHIEVEMENTS' },   // 업적 화면 (docs/specs/achievements.md §7.6)
      { id: 'account', label: '계정', sub: 'ACCOUNT' },
      { id: 'options', label: '설정', sub: 'OPTIONS' },
      { id: 'gallery', label: '회랑', sub: 'GALLERY' },   // [hook:gal] 회랑 (docs/specs/gallery.md §5.7 — 크레딧은 회랑의 극장 안으로)
    ];
    this.menu = new ListMenu(this.items.length, { index: index ?? (hasSave ? 1 : 0) });
  }
  openAccount() {
    const i = this.items.findIndex((it) => it.id === 'account');
    this.game.go('account', { backIndex: i >= 0 ? i : 0 });
  }
  onResume() { applySettings(this.game); this.syncMotion(); this.buildMenu(this.menu.index); }
  /** '동작 줄이기'·'화면 번쩍임'을 다시 읽는다 (enter · 설정에서 돌아올 때). 번개 자체는 Ambience 가 매 프레임 설정을 본다 */
  syncMotion() {
    const st = this.game.settings ?? {};
    this.rm = !!st.reduceMotion;
    if (!lightningAllowed(st)) { this.amb.flash = 0; this.amb.second = 0; this.amb.boltT = 0; }
  }
  /** 첫 입력: 미뤄 둔 첫 번개를 2.5초 뒤로 (이번 실행 동안 다시 미루지 않는다) */
  releaseBolt() {
    firstInputSeen = true;
    if (!this.boltHold) return;
    this.boltHold = false;
    this.amb.nextBolt = 2.5;
  }
  /** '보기' 탭: 설정의 화면 페이지 (글자·UI 크기, 화면 번쩍임, 동작 줄이기) */
  openView() {
    audio.sfx('menu_ok');
    this.game.push('options', { page: 'screen' });
  }

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
    if (lightningAllowed()) this.amb.strike(g.uiW || g.viewW, g.uiH || g.viewH, (g.uiW || g.viewW) / 2);
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
    // 업적: 안 본 달성 수 (엔진이 늦게 오고 소급 훑기도 한가할 때 돌아서, 1초마다 다시 읽는다)
    this.achPoll -= dt;
    if (this.achPoll <= 0) { this.achPoll = 1; this.achNew = Math.max(0, Number(safe(() => g.ach?.summary?.()?.unseen)) || 0); this.galNew = Math.max(0, Number(safe(() => g.gal?.summary?.()?.unseen)) || 0); }   // [hook:gal]
    if (this.checkKonami()) { this.unlockAll(); return; }

    if (input.anyPressed() || input.pointer.justDown) { this.idle = 0; if (!firstInputSeen || this.boltHold) this.releaseBolt(); } else this.idle += dt;
    if (this.mode !== 'intro' && this.notes?.some((c) => c.id === 'telemetry')) this.telNoticeT = (this.telNoticeT ?? 0) + dt;
    // 버튼 (알림 카드·계정 표시): 그 뒤의 '아무 곳이나 누르기'보다 먼저
    const tap = taps.hit(this);
    if (tap === 'update') { this.applyUpdate(); return; }
    if (tap === 'a2hs') { audio.sfx('menu_cancel'); safe(() => platform.dismissA2hs?.()); return; }
    if (tap === 'telemetry') { audio.sfx('menu_cancel'); safe(() => g.telemetry?.dismissNotice?.()); return; }
    if (tap === 'apk') { audio.sfx('menu_ok'); this.downloadApk(); return; }
    if (tap === 'account' && this.mode !== 'intro') { audio.sfx('menu_ok'); this.openAccount(); return; }
    if (tap === 'view' && this.mode === 'press') { this.openView(); return; }
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
      case 'ach': g.go('achievements', { back: 'title' }); break;
      case 'account': this.openAccount(); break;
      case 'options': g.push('options', {}); break;
      case 'gallery': g.go('gallery', { back: 'title', backIndex: Math.max(0, this.items.indexOf(it)) }); break;   // [hook:gal]
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
      // 휴대폰에서 작아진 로고: 부제만 고정 최소 크기(SUB_MIN UI)로 키운다 (로고 폭 안에서). 비트맵은 같은 것을 확대해 그린다
      const subK = clamp(SUB_MIN / (SUB_OPTS.size * sc), 1, Math.min(1.5, (LOGO_W * 0.98) / (this.subW || 560)));
      logo = { cx: (rx0 + rx1) / 2, cy: (ry0 + ry1) / 2, sc, side: true, subK };
    }
    // 인트로·PRESS START 의 큰 로고
    const bsc = Math.min(1, (W - 40) / LOGO_W, (H * 0.46) / LOGO_H);
    const big = { cx: W / 2, cy: Math.max(H * 0.3, st + 10 + (LOGO_H * bsc) / 2), sc: bsc };
    const logoBot = big.cy + (LOGO_BOT - LOGO_CY) * bsc + 2;   // 큰 로고 아래 끝 (흔들림 2 포함)
    // PRESS START: 로고 아래 끝과 그림 속 사냥꾼 머리 사이의 가운데 (사냥꾼·로고를 가리지 않는다, 오른쪽 아래 알림 카드 위).
    // 그림이 아직 없으면 로고 아래. 틈이 모자라면(아주 납작한 화면) 로고 쪽을 지킨다
    const head = this.hunterTop(W, H);
    const mid = head != null ? (logoBot + head) / 2 - (PRESS_DN - PRESS_UP) / 2 : logoBot + 40 + PRESS_UP;
    const pressY = Math.max(logoBot + PRESS_UP + 4, Math.min(mid, stackTop - PRESS_DN - 4));
    // '보기' 탭 (누르기 화면 왼쪽 가장자리): 44 CSS px 이상, 로고 아래 · 화면 높이 42 % 쯤
    const vw = Math.max(50, Math.ceil(48 / per)), vh = Math.max(58, Math.ceil(56 / per));
    const view = { x: sl, y: clamp(Math.max(H * 0.42 - vh / 2, logoBot + 12), st + 8, H - sb - 34 - vh), w: vw, h: vh };
    return { W, H, per, sl, sr, st, sb, n, rowH, gap, x, w, y0, bottom, logo, big, cards, stackTop, pressY, logoBot, head, view };
  }
  /** 그림 속 사냥꾼 두건 꼭대기의 화면 y (UI) — 켄번스 한 주기에서 가장 높이 올라갈 때 (줌 z0 · 팬 위 끝, 마우스 시차 여유 4). 그림이 없으면 null */
  hunterTop(W, H) {
    const img = assets.get('bg/title');
    if (!(img?.width > 0 && img.height > 0)) return null;
    const dh = img.height * Math.max(W / img.width, H / img.height) * KB.z0;
    return (H - dh) * KB.oy + dh * HUNTER_TOP_V - KB.panY * H - 4;
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
    if (safe(() => this.game.telemetry?.noticeDue?.())) {
      const lines = wrap(ctx, TELEMETRY_TEXT, nw - 76, 13, 600);
      out.push({ id: 'telemetry', h: Math.max(60, 20 + lines.length * 19), lines });
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
    // 배경 켄번스 (초점: 달·성 중앙 상단). '동작 줄이기'면 줌·팬을 멈춘다 (시차는 사용자가 움직인 만큼만)
    kenBurns(ctx, img, W, H, this.rm ? 0 : t, { ...KB, px: this.px, py: this.py });
    if (this.moon) drawDecoMoon(ctx, W * 0.8 + this.px * 1.5, H * 0.17 + L.st, H * 0.075, t);   // 장식 '핏빛 달' (로고 뒤 오른쪽 위)
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
      if (mk < 0.99) this.drawView(ctx, L, 1 - mk);   // '보기' 탭 (메뉴가 열리면 사라진다 — 메뉴에 '설정')
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
    const cx = lerp(B.cx, M.cx, mk), cy = lerp(B.cy, M.cy, mk) + (this.rm ? 0 : Math.sin(t * 0.8) * 2 * (1 - mk));
    const sc = lerp(B.sc, M.sc, mk) * lerp(1.12, 1, reveal);
    const subK = lerp(1, M.subK ?? 1, mk);   // 휴대폰 메뉴 상태의 부제 확대 (layout)
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
    ctx.fillRect(-200 * subK, 108 + (subK - 1) * 8, 400 * subK, 1.5);
    ctx.save(); ctx.translate(0, 39); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#1a0206'; ctx.fillRect(-7, -7, 14, 14);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(-7, -7, 14, 14);
    ctx.fillStyle = '#c0102a'; ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.restore();
    // 한글 부제 (금박). 휴대폰 메뉴 상태에서는 기준선 아래로 조금 내려 같은 비트맵을 subK 배로
    if (subK > 1.001) {
      ctx.save(); ctx.translate(0, 92 + (subK - 1) * 8); ctx.scale(subK, subK);
      this.subW = bloodText(ctx, SUBTITLE, 0, 0, SUB_OPTS).w;
      ctx.restore();
    } else this.subW = bloodText(ctx, SUBTITLE, 0, 92, SUB_OPTS).w;
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
    // 받침: 가장자리 없는 가로 어둠 띠 (어트랙트와 같은 캐시 그라데이션 'tAttract' 를 납작하게) + 위아래 진홍 선
    const bw = Math.min(W * 0.62, 470), bh = PRESS_UP + PRESS_DN + 42, by = y + (PRESS_DN - PRESS_UP) / 2;
    ctx.save();
    ctx.globalAlpha = A;
    ctx.translate(W / 2, by); ctx.scale(bw / 180, bh / 180);
    ctx.fillStyle = radGrad(ctx, 'tAttract', 0, 0, 10, 90, [[0, 'rgba(6,2,8,0.8)'], [0.6, 'rgba(6,2,8,0.6)'], [1, 'rgba(6,2,8,0)']]);
    ctx.fillRect(-90, -90, 180, 180);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = A * 0.8;
    ctx.fillStyle = linGrad(ctx, 'tPressLine', -100, 0, 100, 0, [[0, 'rgba(179,18,46,0)'], [0.5, 'rgba(214,40,60,0.9)'], [1, 'rgba(179,18,46,0)']]);
    ctx.translate(W / 2, 0); ctx.scale((bw * 0.72) / 200, 1);
    ctx.fillRect(-100, y - PRESS_UP - 7, 200, 1.5);
    ctx.fillRect(-100, y + PRESS_DN + 5, 200, 1.5);
    ctx.restore();
    // 글자: 깜빡임 대신 78–100 % 숨쉬기 (0.4 Hz). '동작 줄이기'면 그대로 멈춘다
    const breath = this.rm ? 1 : 0.89 + 0.11 * Math.sin(t * TAU * 0.4);
    ctx.save();
    ctx.globalAlpha = A * breath;
    ctx.shadowColor = '#ff2a40'; ctx.shadowBlur = 16;
    text(ctx, 'PRESS START', W / 2, y, { size: 30, align: 'center', weight: 900, family: FONT.logo, color: '#fff4dc', ow: 5, outline: 'rgba(30,0,6,0.95)' });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = A * 0.95;
    // 안내 줄: 휴대폰에서도 15 CSS px 이상 (15–18 UI)
    const hs = clamp(Math.ceil(15 / L.per), 15, 18), m = promptMode();
    if (m === 'touch') text(ctx, '— 화면을 터치하세요 —', W / 2, y + PRESS_HINT_DY, { size: hs, align: 'center', weight: 700, color: '#e2d4bc', ow: 3 });
    else drawHints(ctx, [[['confirm', 'menu'], m === 'pad' ? '버튼을 누르세요' : '키를 누르세요']], W / 2, y + PRESS_HINT_DY, { align: 'center', size: hs, color: '#e2d4bc' });
    ctx.restore();
    // 어트랙트 (방치 시)
    if (this.mode === 'press' && this.idle > 10) this.drawAttract(ctx, L, t, this.idle - 10);
  }

  drawAttract(ctx, L, t, it) {
    const W = L.W, H = L.H;
    const cyc = 9, n = 3, idx = Math.floor(it / cyc) % n, u = (it % cyc) / cyc;
    const a = clamp(Math.min(u * 6, (1 - u) * 6), 0, 1);
    // PRESS START 묶음 아래에 둔다 (PRESS START 는 어트랙트 중에도 보인다). 아래 여유가 모자라면(휴대폰) 줄 간격을 줄인다 (f)
    const y = Math.max(H * 0.52, L.pressY + PRESS_DN + 30), w = Math.min(560, W - 80), x = W / 2 - w / 2;
    const f = clamp((H - L.sb - 14 - y) / 96, 0.72, 1);
    ctx.save();
    ctx.globalAlpha = a;
    // 부드러운 타원형 어둠 (가장자리 없이)
    ctx.save();
    ctx.translate(W / 2, y + 45 * f); ctx.scale((w + 120) / 180, f);
    ctx.fillStyle = radGrad(ctx, 'tAttract', 0, 0, 10, 90, [[0, 'rgba(6,2,8,0.8)'], [0.6, 'rgba(6,2,8,0.6)'], [1, 'rgba(6,2,8,0)']]);
    ctx.fillRect(-90, -90, 180, 180);
    ctx.restore();
    if (idx === 0) {
      ATTRACT_STORY.forEach((s, i) => {
        const k = clamp(u * 5 - i * 0.7, 0, 1);
        ctx.globalAlpha = a * k;
        text(ctx, s, W / 2, y + i * 30 * f, { size: i === 3 ? 20 : 17, align: 'center', weight: 800, family: FONT.title, color: i === 3 ? '#ffd890' : '#e8dccb', ow: 3 });
      });
    } else if (idx === 1) {
      text(ctx, 'HALL OF FAME', W / 2, y - 6, { size: 18, align: 'center', weight: 900, family: FONT.logo, color: GOLD, ow: 4 });
      const hs = scoreList(this.game.meta).slice(0, 4);
      if (!hs.length) text(ctx, '아직 기록이 없습니다. 첫 번째 전설이 되어라!', W / 2, y + 40 * f, { size: 15, align: 'center', color: BONE });
      hs.forEach((h, i) => {
        const yy = y + (26 + i * 24) * f;
        text(ctx, `${i + 1}${['ST', 'ND', 'RD', 'TH'][Math.min(i, 3)]}`, x + 70, yy, { size: 14, weight: 900, family: FONT.num, color: i === 0 ? '#ffe070' : BONE });
        text(ctx, scoreName(h), x + 130, yy, { size: 14, weight: 800, color: '#fff' });
        text(ctx, modeName(h.mode), x + 260, yy, { size: 12, color: DIM });
        text(ctx, fmt(h.score), x + w - 70, yy, { size: 15, align: 'right', weight: 900, family: FONT.num, color: '#fff' });
      });
    } else {
      const tip = TIPS[Math.floor(it / (cyc * n)) % TIPS.length];
      text(ctx, 'HUNTER\'S TIP', W / 2, y, { size: 16, align: 'center', weight: 900, family: FONT.logo, color: GOLD, ow: 4 });
      ornament(ctx, W / 2, y + 14 * f, 260, { alpha: a });
      text(ctx, tip, W / 2, y + 52 * f, { size: 17, align: 'center', weight: 700, color: '#f0e4d0', ow: 3, maxWidth: W - 60 });
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
      const nNew = it.id === 'ach' ? this.achNew : it.id === 'gallery' ? this.galNew : 0;   // [hook:gal] 업적 · 회랑 줄의 NEW
      const achNew = nNew > 0, sel = this.menu.index === i && this.mode === 'menu', fs = h >= 48 ? 22 : 21;
      menuItem(ctx, r, it.label, { selected: sel, disabled: it.disabled, sub: achNew ? `NEW ${nNew}` : it.sub, k, size: fs });
      if (achNew) { // 안 본 업적 · 그림 · 곡: 이름 오른쪽 붉은 점
        ctx.font = `800 ${fs}px ${FONT.title}`;
        const dx = r.x + 28 + (sel ? 6 * k : 0) + ctx.measureText(it.label).width + 13, dy = r.y + r.h / 2 - 9, pr = 4.5 + 0.8 * Math.sin(t * 5);
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.beginPath(); ctx.arc(dx, dy, pr + 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff3050'; ctx.beginPath(); ctx.arc(dx, dy, pr, 0, Math.PI * 2); ctx.fill();
      }
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

  /** 왼쪽 가장자리 '보기' 탭 (누르기 화면): 범용 접근성 인물 기호 + '보기'. 누르면 설정의 화면 페이지 (그라데이션·캔버스 없이 경로만) */
  drawView(ctx, L, k) {
    const r = L.view, rad = 10;
    ctx.save();
    ctx.globalAlpha *= k;
    // 판: 왼쪽은 화면 끝에 붙고 오른쪽만 둥글다
    ctx.beginPath();
    ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w - rad, r.y); ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + rad, rad);
    ctx.lineTo(r.x + r.w, r.y + r.h - rad); ctx.arcTo(r.x + r.w, r.y + r.h, r.x + r.w - rad, r.y + r.h, rad); ctx.lineTo(r.x, r.y + r.h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(14,5,14,0.78)'; ctx.fill();
    ctx.strokeStyle = 'rgba(232,200,114,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    // 접근성 기호: 원 + 팔 벌린 사람
    const cx = r.x + r.w / 2, cy = r.y + r.h * 0.38, ir = Math.min(r.w, r.h) * 0.24;
    ctx.strokeStyle = BONE; ctx.fillStyle = BONE; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.4, ir * 0.12);
    ctx.beginPath(); ctx.arc(cx, cy, ir, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - ir * 0.52, ir * 0.17, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(1.4, ir * 0.14);
    ctx.beginPath();
    ctx.moveTo(cx - ir * 0.62, cy - ir * 0.22); ctx.lineTo(cx + ir * 0.62, cy - ir * 0.22);
    ctx.moveTo(cx, cy - ir * 0.22); ctx.lineTo(cx, cy + ir * 0.18);
    ctx.moveTo(cx - ir * 0.36, cy + ir * 0.68); ctx.lineTo(cx, cy + ir * 0.18); ctx.lineTo(cx + ir * 0.36, cy + ir * 0.68);
    ctx.stroke();
    text(ctx, '보기', cx, r.y + r.h - 10, { size: Math.max(13, Math.ceil(13 / L.per)), align: 'center', weight: 800, color: BONE, ow: 2 });
    ctx.restore();
    if (this.mode === 'press' && k > 0.5) taps.add('view', r, { owner: this, kind: 'primary', src: 'title.view' });
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
      } else if (c.id === 'a2hs' || c.id === 'telemetry') {
        (c.lines ?? []).forEach((ln, i) => text(ctx, ln, c.x + 14, c.y + 24 + i * 19, { size: 13, weight: 600, color: BONE, ow: 2 }));
        const r = { x: c.x + c.w - 52, y: c.y + (c.h - 44) / 2, w: 44, h: 44 };
        gbutton(ctx, r, '✕', { size: 16, owner: this, id: c.id, kind: 'icon', src: `title.${c.id}` });
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
