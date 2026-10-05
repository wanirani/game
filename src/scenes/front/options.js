// 설정 (OPTIONS) — owner: PLAT-OPTIONS · platform §10 (페이지), §4.7 (키 지정), §5.3 (터치 배치 편집), §6.2–6.3 (UI 배율·탭 크기),
// feel §7 (화면 번쩍임·각성 컷인·자동 달리기), companions §6 (조작 안내의 탈것·수호신), MASTER_PLAN §1.4 · §1.5 (설정 키와 줄 이름)
//
//  페이지 5개 (탭: 터치 · LB/RB · Q/E): 소리 · 화면 · 조작 · 터치 · 기타 — §1.5 표의 모든 줄 + 전체 화면(화면) + 기본값 복원(기타)
//  하위 화면 (장면이 아님, options_controls.js): 게임패드 버튼 지정 › · 키보드 키 지정 › · 조작 안내 ›
//  버튼 배치 편집 › → touchpad.openEditor() (DOM 편집기; 열려 있는 동안 이 장면은 입력을 받지 않는다)
//  - uiScale 장면: game.uiW × game.uiH 로 배치 (최소 720×400), 탭 대상은 ≥ 44 CSS px (줄·◀▶·탭·단추), ui.taps 에 등록
//  - 입력은 메뉴 의미(input.bindings): 결정·취소·이전/다음 탭. 패드 START 는 설정을 닫는다. 휠·끌기·오른쪽 스틱으로 목록 스크롤
//  - 바꾼 값은 바로 반영되고(볼륨·품질·UI 크기·바인딩·터치 패드) 0.6초 뒤·닫을 때 저장된다
//  enter({ page: 0..4 | 'sound'|'screen'|'controls'|'touch'|'etc', sub: 'padRemap'|'keyRemap'|'guide' })
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { DEFAULT_SETTINGS } from '../../core/save.js';
import * as platform from '../../core/platform.js';
import { text, wrap, FONT, taps, drawCover } from '../../core/ui.js';
import { drawHints, drawGlyph, glyphWidth } from '../../core/prompts.js';
import { touchpad } from '../../core/touchpad.js';
import { clamp, ease, rgba, TAU } from '../../core/math.js';
import { frame, heading, gbutton, applySettings, GOLD, BONE, DIM } from './common.js';
import {
  Nav, Scroll, RemapPage, GuidePage, cssPer, tapH, saveSettings, rowBand, scrollBar, presetSummary, PRESET_NAMES, cachedGrad,
} from './options_controls.js';

const SLIDER_STOPS = [[0, '#8a1020'], [1, '#ffcf6a']];
const FOOT_STOPS = [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.72)']];
const BACK_STOPS = [[0, '#1a0610'], [1, '#050207']];

const PAGES = [
  { id: 'sound', name: '소리' },
  { id: 'screen', name: '화면' },
  { id: 'controls', name: '조작' },
  { id: 'touch', name: '터치' },
  { id: 'etc', name: '기타' },
];
const TIER_NAME = { low: '낮음', medium: '보통', high: '높음' };
const pct = (v) => `${Math.round((v ?? 0) * 100)}%`;
const offPct = (v) => (v <= 0.001 ? '끔' : pct(v));
/** 세션 동안 마지막으로 본 페이지 (다시 열면 그 페이지부터) */
let lastPage = 0;

function isTouchDevice() {
  try { return !!window.matchMedia?.('(pointer: coarse)').matches; } catch { return false; }
}
function rumbleDemo(k) {
  if (!(k > 0)) return;
  try {
    const pad = input.activePad?.();
    const act = pad?.vibrationActuator;
    if (act?.playEffect) act.playEffect('dual-rumble', { startDelay: 0, duration: 180, strongMagnitude: 0.7 * k, weakMagnitude: 0.7 * k })?.catch?.(() => {});
    else window.BNAndroid?.rumble?.(0.7 * k, 0.7 * k, 180);
  } catch { /* 진동 없는 기기 */ }
}
function phoneBuzz(ms = 40) {
  try {
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate?.(ms);
  } catch { /* 무시 */ }
}

/** 페이지 줄 정의. type: slider | enum | bool | link | action. note(s, g) → 줄 설명 (아래 안내 칸) */
function buildRows(sc) {
  const g = sc.game;
  return {
    sound: [
      { id: 'musicVol', label: '배경 음악', type: 'slider', min: 0, max: 1, step: 0.1, fmt: offPct, note: '배경 음악의 크기입니다.' },
      { id: 'sfxVol', label: '효과음', type: 'slider', min: 0, max: 1, step: 0.1, fmt: offPct, note: '공격·타격·메뉴 소리의 크기입니다.' },
    ],
    screen: [
      {
        id: 'quality', label: '그래픽 품질', type: 'enum', opts: [['auto', '자동'], ['low', '낮음'], ['medium', '보통'], ['high', '높음']],
        note: (s) => ({
          auto: `자동: 기기 성능에 맞춰 알아서 조절합니다 (지금: ${TIER_NAME[g.tier] ?? '보통'}).`,
          low: '낮음: 해상도와 입자를 줄여 저사양 기기에서도 부드럽게 움직입니다.',
          medium: '보통: 화질과 속도의 균형을 맞춥니다.',
          high: '높음: 가장 선명하지만 기기에 부담이 큽니다.',
        })[s.quality] ?? '',
      },
      {
        id: 'fpsCap', label: '프레임 제한', type: 'enum', opts: [[60, '60'], [0, '제한 없음']],
        note: (s) => (s.fpsCap === 0 ? '화면 주사율만큼 그립니다. 120Hz 화면에서 더 부드럽지만 배터리를 더 씁니다.' : '초당 60번 그립니다. 배터리를 아낍니다.'),
      },
      {
        id: 'uiScale', label: '글자·UI 크기', type: 'enum', opts: [['auto', '자동'], [1, '100%'], [1.15, '115%'], [1.3, '130%'], [1.5, '150%']],
        note: () => `메뉴 글자와 버튼의 크기입니다 (지금 ${Math.round((g.uiK || 1) * 100)}%). 화면이 작으면 가장 큰 크기가 제한됩니다.`,
      },
      {
        id: 'safeArea', label: '노치 영역', type: 'enum', opts: [['fit', '피하기'], ['full', '화면 가득']],
        note: (s) => (s.safeArea === 'full' ? '화면 끝까지 쓰고, 정보 표시만 안전한 곳으로 옮깁니다.' : '노치와 둥근 모서리를 피해서 화면을 그립니다.'),
      },
      {
        id: 'fullscreen', label: '전체 화면', type: 'action', vis: () => !!platform.canFullscreen?.(),
        value: () => (platform.isFullscreen?.() ? '끄기' : '켜기'),
        note: () => (isTouchDevice() ? '전체 화면으로 바꿉니다.' : '전체 화면으로 바꿉니다. 키보드 Alt+Enter 로도 바꿀 수 있습니다.'),
        run: () => sc.toggleFullscreen(),
      },
      { id: 'screenShake', label: '화면 흔들림', type: 'slider', min: 0, max: 1, step: 0.25, fmt: offPct, note: '타격·폭발 때 화면이 흔들리는 정도입니다.' },
      { id: 'flashFx', label: '화면 번쩍임', type: 'enum', opts: [[0, '끔'], [0.5, '약하게'], [1, '보통']], note: '필살기·폭발 때 화면이 번쩍이는 정도입니다. 빛에 민감하다면 줄이거나 끄세요.' },
      { id: 'showDamage', label: '데미지 숫자', type: 'bool', note: '끄면 데미지 숫자와 판정 문구를 숨깁니다. 연속 공격 안내는 그대로 나옵니다.' },
      {
        id: 'cutinMode', label: '각성 컷인', type: 'enum', opts: [['full', '전체'], ['short', '짧게']],
        note: (s) => (s.cutinMode === 'short' ? '각성 연출을 짧게 줄입니다.' : '각성기를 쓸 때 일러스트 연출을 끝까지 보여 줍니다. 같은 스테이지의 두 번째 각성부터는 늘 짧게 나옵니다.'),
      },
      { id: 'reduceMotion', label: '동작 줄이기', type: 'bool', note: '영웅 자동 회전처럼 화면이 도는 연출을 줄입니다.' },
    ],
    controls: [
      {
        id: 'ctrlPrompts', label: '버튼 안내 아이콘', type: 'enum',
        opts: [['auto', '자동'], ['keyboard', '키보드'], ['xbox', 'Xbox'], ['ps', 'PlayStation'], ['nintendo', 'Nintendo']],
        note: '화면에 표시할 버튼 모양입니다. 자동은 지금 쓰는 기기를 따릅니다.',
      },
      {
        id: 'ctrlPreset', label: '게임패드 배치', type: 'enum',
        opts: () => {
          const o = [['arcade', '아케이드'], ['classic', '클래식']];
          if (sc.s.ctrlPreset === 'custom' || sc.stash) o.push(['custom', '사용자 지정']);
          return o;
        },
        set: (v) => sc.setPreset(v),
        note: (s) => (s.ctrlPreset === 'classic' ? `클래식: ${presetSummary('classic')}`
          : s.ctrlPreset === 'custom' ? '「게임패드 버튼 지정」에서 바꾼 배치입니다.'
            : `아케이드 (추천): ${presetSummary('arcade')}`),
      },
      {
        id: 'ctrlConfirm', label: '결정 버튼 위치', type: 'enum', opts: [['auto', '자동'], ['south', '아래 버튼'], ['east', '오른쪽 버튼']],
        note: (s) => {
          const east = (input.confirmPos?.() ?? 'south') === 'east';
          const now = east ? '오른쪽 버튼이 결정, 아래 버튼이 취소' : '아래 버튼이 결정, 오른쪽 버튼이 취소';
          return s.ctrlConfirm === 'auto' ? `자동: 지금은 ${now}입니다 (Nintendo 게임패드는 오른쪽). 메뉴에서만 적용됩니다.` : `메뉴에서 ${now}입니다. 게임 조작은 바뀌지 않습니다.`;
        },
      },
      { id: 'padRemap', label: '게임패드 버튼 지정', type: 'link', value: () => PRESET_NAMES[sc.s.ctrlPreset] ?? '아케이드', run: () => sc.openSub('padRemap'), note: '행동마다 게임패드 버튼을 바꿉니다. 이미 쓰는 버튼을 고르면 두 행동의 버튼이 서로 바뀝니다.' },
      { id: 'keyRemap', label: '키보드 키 지정', type: 'link', value: () => (sc.s.keyMap ? '사용자 지정' : '기본'), run: () => sc.openSub('keyRemap'), note: '행동마다 키보드 키를 바꿉니다. 이미 쓰는 키를 고르면 서로 바뀝니다.' },
      { id: 'ctrlDeadzone', label: '스틱 데드존', type: 'slider', min: 0.1, max: 0.4, step: 0.05, fmt: pct, note: '스틱을 살짝 기울였을 때 무시하는 범위입니다. 캐릭터가 저절로 움직이면 올리세요.', live: 'stick' },
      { id: 'ctrlRumble', label: '게임패드 진동 세기', type: 'slider', min: 0, max: 1, step: 0.1, fmt: offPct, note: '타격·피격 때 게임패드가 떨리는 세기입니다.' },
      { id: 'autoSprint', label: '자동 달리기', type: 'bool', note: '같은 방향으로 계속 달리면 두 번 누르지 않아도 질주합니다.' },
      { id: 'guide', label: '조작 안내', type: 'link', value: () => '', run: () => sc.openSub('guide'), note: '지금 배치로 만든 키보드·게임패드·터치 조작표를 봅니다 (탈것·수호신·각성기 포함).' },
    ],
    touch: [
      { id: 'touchOpacity', label: '투명도', type: 'slider', min: 0.1, max: 1, step: 0.05, fmt: pct, note: '화면 버튼이 보이는 정도입니다. 누르고 있는 버튼은 늘 또렷하게 보입니다.' },
      { id: 'touchScale', label: '크기', type: 'slider', min: 0.8, max: 1.3, step: 0.05, fmt: pct, note: '화면 버튼의 크기입니다.' },
      {
        id: 'touchStick', label: '스틱 방식', type: 'enum', opts: [['float', '따라다니기'], ['fixed', '고정']],
        note: (s) => (s.touchStick === 'fixed' ? '스틱이 왼쪽 아래 한 자리에 있습니다.' : '화면 왼쪽 아무 곳이나 누르면 그 자리에 스틱이 생깁니다.'),
      },
      { id: 'touchSlide', label: '버튼 사이 밀어 누르기', type: 'bool', note: '손가락을 떼지 않고 옆 버튼으로 밀면 그 버튼이 눌립니다.' },
      { id: 'touchLeftHanded', label: '왼손 모드', type: 'bool', note: '스틱과 버튼의 좌우를 바꿉니다.' },
      { id: 'touchLayout', label: '버튼 배치 편집', type: 'link', value: () => (sc.s.touchLayout ? '사용자 지정' : '기본'), run: () => sc.openEditor(), note: '버튼을 끌어서 옮기고, 모서리를 끌어 크기를 바꿉니다.' },
      { id: 'vibration', label: '진동', type: 'bool', note: '휴대폰 진동을 켜고 끕니다.' },
    ],
    etc: [
      { id: 'autoSave', label: '자동 저장', type: 'bool', note: '스테이지를 마치거나 마을에 들어갈 때 자동으로 저장합니다.' },
      { id: 'keepAwake', label: '화면 꺼짐 방지', type: 'bool', note: '게임하는 동안 화면이 꺼지지 않게 합니다.' },
      { id: 'turntableAuto', label: '영웅 자동 회전', type: 'bool', note: '장비·상태 화면에서 영웅이 천천히 돌아갑니다.' },
      {
        id: 'fullscreenAuto', label: '첫 터치에 전체 화면', type: 'bool',
        // platform.js 가 실제로 쓰는 곳에서만 (안드로이드 웹 브라우저; APK·설치 앱·아이폰은 해당 없음)
        vis: () => !!platform.isAndroid?.() && !!platform.fullscreenAvailable?.(),
        note: '타이틀 화면을 처음 누를 때 전체 화면으로 바꿉니다.',
      },
      {
        id: 'telemetry', label: '익명 통계·오류 보내기', type: 'bool',
        note: (s) => (s.telemetry === false ? '보내지 않습니다. 이 기기에 남은 통계 기록과 익명 번호도 지웁니다.'
          : '오류·사망 위치·클리어 시간·화면 속도 같은 익명 통계를 보내 게임을 고치는 데 씁니다. 계정·이름은 보내지 않습니다.'),
      },
      { id: 'reset', label: '기본값 복원', type: 'action', value: () => '복원', run: () => sc.confirmReset(), note: '모든 설정을 처음 상태로 되돌립니다. 키·버튼 지정과 버튼 배치도 초기화됩니다.' },
    ],
  };
}

/** 예/아니오 확인 창 (≥ 44 CSS px 단추, ui.taps) */
class Confirm {
  constructor(o) {
    Object.assign(this, { title: '확인', msg: '', yes: '예', no: '아니오', onYes: null }, o);
    this.i = 1; this.t = 0;
  }
  update(dt, nav, hit) {
    this.t += dt;
    if (hit === 'cf:yes' || hit === 'cf:no') return this.done(hit === 'cf:yes');
    if (nav.left || nav.right || nav.up || nav.down) { this.i = 1 - this.i; audio.sfx('menu_move'); }
    if (nav.confirm) return this.done(this.i === 0);
    if (nav.cancel || nav.menu) return this.done(false);
    return true;
  }
  done(ok) {
    audio.sfx(ok ? 'menu_ok' : 'menu_cancel');
    if (ok) { try { this.onYes?.(); } catch (e) { console.error(e); } }
    return false;
  }
  render(ctx, W, H, th, owner) {
    const k = ease.outBack(clamp(this.t / 0.18, 0, 1));
    const w = Math.min(480, W - 40);
    const lines = wrap(ctx, this.msg, w - 50, 15, 500, FONT.body);
    const h = 70 + lines.length * 22 + th + 26;
    const x = (W - w) / 2, y = (H - h) / 2;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.55 * clamp(this.t / 0.12, 0, 1)})`; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-W / 2, -H / 2);
    frame(ctx, x, y, w, h, { glow: 0.7, accent: '#ff8a8a' });
    text(ctx, this.title, W / 2, y + 36, { size: 20, align: 'center', weight: 800, family: FONT.title, color: '#ffb0a0', ow: 3 });
    lines.forEach((l, i) => text(ctx, l, W / 2, y + 66 + i * 22, { size: 15, align: 'center', color: BONE, weight: 500, ow: 2 }));
    const bw = Math.min(170, (w - 60) / 2), by = y + h - th - 18;
    [[this.yes, 'cf:yes'], [this.no, 'cf:no']].forEach(([lb, id], i) => {
      const r = { x: i === 0 ? W / 2 - bw - 10 : W / 2 + 10, y: by, w: bw, h: th };
      gbutton(ctx, r, lb, { selected: this.i === i, size: 16 });
      taps.add(id, r, { owner, kind: 'primary', src: 'options.confirm' });
    });
    ctx.restore();
  }
}

export class OptionsScene extends Scene {
  constructor(g) {
    super(g);
    this.opaque = false; this.uiScale = true; this.hidePad = true;
    this.toastUp = true;
    this._wheel = (e) => this.onWheel(e);
  }
  get toastX() { return (this.game.uiW || this.game.viewW) / 2; }
  get toastY() { return (this.L ?? this.layout()).note.y - 4; }

  enter(params = {}) {
    const { page, sub } = params ?? {};
    this.s = this.game.settings ??= { ...DEFAULT_SETTINGS };
    let p = typeof page === 'number' ? page : PAGES.findIndex((x) => x.id === page);
    if (!(p >= 0 && p < PAGES.length)) p = lastPage;
    this.page = p;
    this.defs = buildRows(this);
    this.sel = PAGES.map(() => 0);
    this.scrolls = PAGES.map(() => new Scroll());
    this.nav = new Nav();
    this.sub = null; this.modal = null; this.flash = {}; this.shakeDemo = 0; this.saveT = 0;
    this.editing = false; this.closed = false; this.stash = null; this.follow = true; this.pageAnim = 1; this.L = null; this.geo = [];
    // 표준 배치가 아닌 컨트롤러 (platform §4.2): 조작 페이지의 「게임패드 버튼 지정」에서 시작
    if (!sub && page == null && input.padInfo && input.padInfo.standard === false && this.s.ctrlPreset !== 'custom') {
      this.page = 2;
      this.sel[2] = Math.max(0, this.rows(2).findIndex((r) => r.id === 'padRemap'));
    }
    if (sub) this.openSub(sub, true);
    try { this.game.canvas?.addEventListener('wheel', this._wheel, { passive: true }); } catch { /* 캔버스 없음 */ }
  }
  exit() {
    this.save();
    lastPage = this.page;
    this.sub?.exit?.(); this.sub = null;
    try { this.game.canvas?.removeEventListener('wheel', this._wheel); } catch { /* 무시 */ }
    if (touchpad.editorOpen) { try { touchpad.closeEditor({ save: false }); } catch (e) { console.error(e); } }
  }
  save() { saveSettings(this.game); applySettings(this.game); this.saveT = 0; }
  /** 값이 바뀌면 0.6초 뒤 저장 (슬라이더를 누르고 있는 동안 매 틱 쓰지 않게) */
  touched() { this.saveT = 0.6; }

  // ── 줄 ──
  rows(page = this.page) {
    const list = this.defs[PAGES[page].id] ?? [];
    return list.filter((r) => !r.vis || r.vis());
  }
  val(r) { return r.get ? r.get() : this.s[r.key ?? r.id]; }
  optsOf(r) { return typeof r.opts === 'function' ? r.opts() : r.opts; }
  optIndex(r, opts = this.optsOf(r)) {
    const v = this.val(r);
    let i = opts.findIndex((o) => o[0] === v);
    if (i < 0 && typeof v === 'number') {
      let best = Infinity;
      opts.forEach((o, k) => { if (typeof o[0] === 'number' && Math.abs(o[0] - v) < best) { best = Math.abs(o[0] - v); i = k; } });
    }
    return i < 0 ? 0 : i;
  }
  valueText(r) {
    const v = this.val(r);
    switch (r.type) {
      case 'slider': return (r.fmt ?? pct)(v ?? r.min);
      case 'bool': return v ? '켬' : '끔';
      case 'enum': { const o = this.optsOf(r); return o[this.optIndex(r, o)]?.[1] ?? ''; }
      case 'link': case 'action': return r.value?.() ?? '';
      default: return '';
    }
  }
  noteOf(r) {
    if (!r) return '';
    try { return typeof r.note === 'function' ? r.note(this.s, this.game) : r.note ?? ''; } catch { return ''; }
  }
  /** d = -1 | +1 (◀▶), wrap = 결정 키로 순환 */
  change(r, d, wrapAround = false) {
    const s = this.s;
    const key = r.key ?? r.id;
    let nv;
    if (r.type === 'slider') {
      const cur = Number.isFinite(s[key]) ? s[key] : r.min;
      nv = clamp(Math.round((Math.round(cur / r.step) + d) * r.step * 1000) / 1000, r.min, r.max);
      if (nv === cur) { audio.sfx('menu_move', { vol: 0.4 }); return; }
    } else if (r.type === 'bool') nv = !s[key];
    else if (r.type === 'enum') {
      const o = this.optsOf(r), i = this.optIndex(r, o);
      let j = i + d;
      if (wrapAround) j = (j + o.length) % o.length; else j = clamp(j, 0, o.length - 1);
      if (j === i) { audio.sfx('menu_move', { vol: 0.4 }); return; }
      nv = o[j][0];
    } else return;
    if (r.set) r.set(nv); else s[key] = nv;
    this.flash[r.id] = 1;
    this.touched();
    this.effect(r, nv);
  }
  /** 바꾼 값의 즉시 반영 · 미리 보기 */
  effect(r, v) {
    const g = this.game;
    if (r.id === 'musicVol' || r.id === 'sfxVol' || r.id === 'touchOpacity') applySettings(g);
    if (r.id === 'sfxVol') { audio.sfx('coin'); return; }
    if (r.id === 'screenShake' && v > 0 && !this.s.reduceMotion) this.shakeDemo = 0.35 * v;
    if (r.id === 'flashFx' && v > 0) g.flash?.('#fff4e0', 0.45, 5);
    if (r.id === 'ctrlRumble') rumbleDemo(v);
    if (r.id === 'vibration' && v) phoneBuzz(40);
    if (r.id === 'quality' || r.id === 'uiScale' || r.id === 'safeArea') g.dirty = true; // 배치는 game 이 다음 프레임에 다시 잡는다
    audio.sfx('menu_move');
  }
  /** 슬라이더 막대를 누른 곳의 값으로 (눈금에 맞춤) */
  slideTo(r, i) {
    const gm = this.geo?.[i];
    if (!gm) { this.change(r, 1); return; }
    const k = clamp((input.pointer.x - gm.bx) / gm.bw, 0, 1);
    const cur = this.val(r) ?? r.min;
    const steps = Math.round((k * (r.max - r.min)) / r.step);
    const d = Math.round((r.min + steps * r.step - cur) / r.step);
    if (d) this.change(r, d); else audio.sfx('menu_move', { vol: 0.4 });
  }
  act(r) {
    if (r.type === 'link' || r.type === 'action') { audio.sfx('menu_ok'); r.run?.(); return; }
    if (r.type === 'bool') this.change(r, 1);
    else if (r.type === 'enum') this.change(r, 1, true);
  }
  setPreset(v) {
    const s = this.s;
    if (v === 'custom') {
      if (!this.stash) return;
      s.ctrlMap = this.stash; s.ctrlPreset = 'custom';
      input.refreshBindings?.();
      return;
    }
    if (s.ctrlPreset === 'custom' && s.ctrlMap) this.stash = s.ctrlMap;
    if (!input.setPreset?.(v)) { s.ctrlPreset = v; s.ctrlMap = null; }
  }
  toggleFullscreen() {
    let p;
    try { p = platform.toggleFullscreen?.(); } catch { p = null; }
    Promise.resolve(p).then((ok) => { if (ok === false) this.game.toast('전체 화면으로 바꿀 수 없습니다', '#ffb0a0', 2); this.game.dirty = true; }, () => {});
  }
  openEditor() {
    if (input.mode === 'pad') { this.game.toast('버튼 배치 편집은 터치나 마우스로 할 수 있습니다', '#ffd890', 2.6); return; }
    let ok = false;
    try {
      ok = touchpad.openEditor?.({
        onClose: (saved) => {
          this.editing = false;
          input.flush();
          if (saved) { this.game.toast(this.s.touchLayout ? '버튼 배치를 저장했습니다' : '버튼 배치를 기본값으로 되돌렸습니다', '#c8f0c0', 2); this.flash.touchLayout = 1; }
        },
      }) !== false;
    } catch (e) { console.error('[options] editor', e); ok = false; }
    if (ok) this.editing = true;
    else this.game.toast('이 화면에서는 버튼 배치를 편집할 수 없습니다', '#ffb0a0', 2.4);
  }
  confirmReset() {
    this.modal = new Confirm({
      title: '기본값 복원', yes: '되돌리기', no: '취소',
      msg: '모든 설정을 기본값으로 되돌릴까요?\n키·버튼 지정과 터치 버튼 배치도 초기화됩니다.',
      onYes: () => {
        Object.assign(this.s, DEFAULT_SETTINGS);
        this.stash = null;
        input.refreshBindings?.();
        applySettings(this.game);
        this.game.resize?.();
        this.save();
        this.game.toast('설정을 기본값으로 되돌렸습니다', '#e8dcc8', 2);
      },
    });
  }
  openSub(id, silent = false) {
    this.sub?.exit?.();
    if (id === 'padRemap' || id === 'keyRemap') { this.page = 2; this.sub = new RemapPage(this, id === 'padRemap' ? 'pad' : 'key'); } else if (id === 'guide') { this.page = 2; this.sub = new GuidePage(this); } else { this.sub = null; return; }
    this.pageAnim = 0;
    if (!silent) input.flush();
  }
  closeSub() {
    this.sub?.exit?.();
    this.sub = null;
    this.save();
    this.pageAnim = 0;
    audio.sfx('menu_cancel');
    input.flush();
  }
  setPage(i) {
    i = ((i % PAGES.length) + PAGES.length) % PAGES.length;
    if (i === this.page) return;
    this.page = i; this.pageAnim = 0; this.follow = true;
    audio.sfx('menu_move');
  }
  back() {
    if (this.sub) this.closeSub(); else this.close();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    audio.sfx('menu_cancel');
    this.save();
    this.game.pop();
  }
  onWheel(e) {
    if (this.game.top !== this || this.editing || this.modal) return;
    const sc = this.sub ? this.sub.scroll : this.scrolls[this.page];
    if (!sc) return;
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 300 : e.deltaY;
    sc.wheel += d / cssPer(this);
  }

  // ── 배치 ──
  layout() {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const th = tapH(this);
    const m = W < 820 ? 10 : 18;
    // safeArea 'full' (platform §6.1): 캔버스가 노치·홈 표시줄 밑까지 깔리므로 단추·줄·안내는 안전 영역 안에 둔다 (UI px)
    const S = g.settings?.safeArea === 'full' ? g.safe : null, k = g.uiK || 1;
    const sl = (S?.l || 0) / k, sr = (S?.r || 0) / k, st = (S?.t || 0) / k, sb = (S?.b || 0) / k;
    const mL = m + sl, mR = m + sr;
    const titleRow = H - st - sb >= 500;
    const hy = (titleRow ? 58 : 8) + st;
    const backR = { x: mL, y: hy, w: Math.max(100, Math.round(th * 1.9)), h: th };
    const footH = 26 + sb, noteH = 42;
    const cy = hy + th + 8;
    const sub = !!this.sub;
    const content = { x: mL, y: cy, w: W - mL - mR, h: H - cy - footH - (sub ? 4 : noteH + 6) };
    const note = { x: mL + 8, y: content.y + content.h + 4, w: content.w - 16, h: noteH };
    const lw = Math.min(900, content.w - 16);
    const statusH = this.sub instanceof RemapPage ? 34 : 0;
    const list = { x: Math.round(mL + (content.w - lw) / 2), y: content.y + 6 + statusH, w: lw, h: content.h - 12 - statusH };
    return { W, H, th, m, mR, st, sb, titleRow, backR, hy, content, note, list, footY: H - 9 - sb };
  }

  // ── 갱신 ──
  update(dt) {
    if (this.closed) return;
    for (const k in this.flash) this.flash[k] = Math.max(0, this.flash[k] - dt * 3);
    if (this.shakeDemo > 0) this.shakeDemo = Math.max(0, this.shakeDemo - dt);
    this.pageAnim = Math.min(1, this.pageAnim + dt * 6);
    if (this.saveT > 0 && (this.saveT -= dt) <= 0) saveSettings(this.game);
    if (this.editing || touchpad.editorOpen) {
      // DOM 편집기가 열려 있는 동안: 패드 입력도 먹지 않는다. 편집기가 스스로 닫혔으면(Esc 등) 되돌아온다
      if (!touchpad.editorOpen) { this.editing = false; input.flush(); }
      return;
    }
    const L = this.L = this.layout();
    const nav = this.nav.poll(dt);
    if (this.modal) {
      const hit = taps.hit(this);
      if (!this.modal.update(dt, nav, hit)) { this.modal = null; input.flush(); }
      return;
    }
    // 스크롤 (끌기가 끝난 틱의 탭은 버린다)
    let sc;
    if (this.sub) { this.sub.tick?.(dt, L); sc = this.sub.scroll; } else { sc = this.scrolls[this.page]; sc.update(dt, L.list); }
    const hit = sc?.swallow || sc?.dragging ? null : taps.hit(this);
    if (hit === 'back') { this.back(); return; }
    if (typeof hit === 'string' && hit.startsWith('tab:')) {
      const i = +hit.slice(4);
      if (this.sub) this.sub.setTab?.(i); else this.setPage(i);
      return;
    }
    if (this.sub) {
      if (this.sub.update(dt, nav, hit) === 'back') this.closeSub();
      return;
    }
    if (nav.cancel || nav.menu) { this.close(); return; }
    if (nav.prevTab) { this.setPage(this.page - 1); return; }
    if (nav.nextTab) { this.setPage(this.page + 1); return; }
    const rows = this.rows();
    if (!rows.length) return;
    let i = clamp(this.sel[this.page], 0, rows.length - 1);
    if (typeof hit === 'string') {
      const [kind, idx] = hit.split(':'), j = +idx;
      const r = rows[j];
      if (r) {
        this.sel[this.page] = j;
        if (kind === 'l' || kind === 'r') this.change(r, kind === 'l' ? -1 : 1);
        else if (kind === 'val') { if (r.type === 'slider') this.slideTo(r, j); else this.act(r); }
        else if (kind === 'row') { if (r.type === 'link' || r.type === 'action') this.act(r); else if (i !== j) audio.sfx('menu_move'); }
        return;
      }
    }
    if (nav.up) { i = (i + rows.length - 1) % rows.length; this.follow = true; audio.sfx('menu_move'); }
    if (nav.down) { i = (i + 1) % rows.length; this.follow = true; audio.sfx('menu_move'); }
    this.sel[this.page] = i;
    const r = rows[i];
    if (nav.left || nav.right) {
      if (r.type === 'slider' || r.type === 'enum' || r.type === 'bool') this.change(r, nav.left ? -1 : 1);
    }
    if (nav.confirm) this.act(r);
  }

  // ── 그리기 ──
  render(ctx) {
    const g = this.game;
    const L = this.L = this.layout();
    const { W, H } = L;
    const k = ease.outCubic(clamp(this.t / 0.25, 0, 1));
    const alone = g.scenes[0] === this;
    const editing = this.editing || touchpad.editorOpen;
    // 편집기 (platform §5.3): 뒤에 지금 스테이지가 어둡게 보이도록 이 장면의 어둠막은 깔지 않는다 (편집기가 스스로 어둡게 덮는다)
    if (alone) this.backdrop(ctx, W, H);
    else if (!editing) { ctx.fillStyle = `rgba(4,0,8,${0.84 * k})`; ctx.fillRect(0, 0, W, H); }
    if (editing) return; // 편집기가 위를 덮는다 (가상 패드 버튼이 잘 보이게 비워 둔다)
    const sx = this.shakeDemo > 0 ? Math.sin(g.time * 90) * 10 * this.shakeDemo : 0;
    const owner = this.modal ? null : this;
    ctx.save();
    ctx.globalAlpha = k; ctx.translate(sx, (1 - k) * 16);
    if (L.titleRow) heading(ctx, W / 2, 36 + L.st, 'OPTIONS', null, { size: 30 });
    frame(ctx, L.content.x, L.content.y, L.content.w, L.content.h, { glow: 0.35 });
    ctx.save();
    ctx.globalAlpha *= 0.4 + 0.6 * ease.outCubic(this.pageAnim);
    if (this.sub) this.sub.render(ctx, L, owner);
    else this.drawList(ctx, L, owner);
    ctx.restore();
    this.drawHeader(ctx, L, owner);
    if (!this.sub) this.drawNote(ctx, L);
    ctx.restore();
    this.drawFooter(ctx, L);
    if (this.modal) this.modal.render(ctx, W, H, L.th, this);
  }
  backdrop(ctx, W, H) {
    const img = assets.get?.('bg/title');
    if (img) drawCover(ctx, img, W, H, { oy: 0.4 });
    else { ctx.fillStyle = cachedGrad(ctx, 'backdrop', H, 'v', BACK_STOPS); ctx.fillRect(0, 0, W, H); } // 배경 그림이 없을 때 (캐시한 그라데이션)
    ctx.fillStyle = 'rgba(4,0,8,0.78)'; ctx.fillRect(0, 0, W, H);
  }
  drawHeader(ctx, L, owner) {
    const { backR, th, W, mR } = L;
    gbutton(ctx, backR, this.sub ? '설정' : '닫기', { size: 15, icon: '◀' });
    if (owner && !this.sub?.modal) taps.add('back', backR, { owner, kind: 'primary', src: 'options.back' });
    const tabs = this.sub ? this.sub.tabs : PAGES.map((p) => p.name);
    const cur = this.sub ? this.sub.tab : this.page;
    const x0 = backR.x + backR.w + 12, avail = W - mR - x0;
    if (!tabs) {
      text(ctx, this.sub.title, x0 + 10, backR.y + th / 2 + 7, { size: 19, weight: 800, family: FONT.title, color: GOLD, ow: 3 });
      return;
    }
    const pad = input.mode !== 'touch';
    const gh = 20, gl = pad ? glyphWidth('prevTab', gh) : 0, gr = pad ? glyphWidth('nextTab', gh) : 0;
    const gap = 6, n = tabs.length;
    const room = avail - (gl ? gl + 8 : 0) - (gr ? gr + 8 : 0);
    const tw = Math.max(th, Math.min(this.sub ? 150 : 132, (room - gap * (n - 1)) / n));
    const total = tw * n + gap * (n - 1);
    let tx = x0 + (gl ? gl + 8 : 0) + Math.max(0, (room - total) / 2);
    if (this.sub?.title && room - total > 200) text(ctx, this.sub.title, x0 + 6, backR.y + th / 2 + 6, { size: 16, weight: 800, family: FONT.title, color: GOLD, ow: 3 });
    if (gl) drawGlyph(ctx, 'prevTab', tx - gl - 8, backR.y + (th - gh) / 2, gh);
    tabs.forEach((name, i) => {
      const r = { x: tx + i * (tw + gap), y: backR.y, w: tw, h: th };
      gbutton(ctx, r, name, { selected: i === cur, size: 15 });
      if (owner && !this.sub?.modal) taps.add(`tab:${i}`, r, { owner, kind: 'primary', src: 'options.tab' });
    });
    if (gr) drawGlyph(ctx, 'nextTab', tx + total + 8, backR.y + (th - gh) / 2, gh);
  }
  drawList(ctx, L, owner) {
    const rows = this.rows(), th = L.th, view = L.list;
    const sc = this.scrolls[this.page];
    const contentH = rows.length * th;
    sc.bounds(contentH, view.h);
    const si = clamp(this.sel[this.page], 0, Math.max(0, rows.length - 1));
    if (this.follow) { sc.show(si * th, si * th + th, view.h); this.follow = false; }
    const sy = Math.round(sc.y);
    const hov = input.mode === 'kb' ? taps.over(this) : null;
    const hovI = typeof hov === 'string' && /^(row|val|l|r):/.test(hov) ? +hov.split(':')[1] : -1;
    const valW = clamp(view.w * 0.3, 140, 230);
    this.geo = [];
    const rightX = view.x + view.w - 12; // 스크롤 막대 자리
    ctx.save();
    ctx.beginPath(); ctx.rect(view.x - 4, view.y, view.w + 8, view.h); ctx.clip();
    rows.forEach((r, i) => {
      const y = view.y + i * th - sy;
      if (y > view.y + view.h || y + th < view.y) return;
      const sel = i === si;
      rowBand(ctx, view.x, y, view.w - 10, th, sel, hovI === i, i);
      const fl = this.flash[r.id] ?? 0;
      const ty = y + th / 2 + 6;
      const labelMax = (r.type === 'link' || r.type === 'action' ? view.w * 0.55 : view.w - valW - th * 2 - 50);
      text(ctx, r.label, view.x + 22, ty, { size: 16, weight: 800, color: sel ? '#fff4dc' : BONE, ow: 2, maxWidth: labelMax });
      const full = y >= view.y - 0.5 && y + th <= view.y + view.h + 0.5;
      const vis = { x: view.x, y: Math.max(view.y, y), w: 0, h: Math.min(view.y + view.h, y + th) - Math.max(view.y, y) };
      if (r.type === 'link' || r.type === 'action') {
        const v = this.valueText(r);
        if (r.type === 'link') {
          ctx.save(); ctx.translate(rightX - 14, y + th / 2); ctx.fillStyle = sel ? GOLD : rgba(GOLD, 0.55);
          ctx.beginPath(); ctx.moveTo(-5, -8); ctx.lineTo(4, 0); ctx.lineTo(-5, 8); ctx.lineTo(-2, 0); ctx.closePath(); ctx.fill(); ctx.restore();
          if (v) text(ctx, v, rightX - 30, ty, { size: 14, align: 'right', weight: 700, color: fl > 0 ? '#fff' : sel ? GOLD : '#c8b8a0', ow: 2 });
        } else {
          const pw = Math.max(96, Math.min(160, valW * 0.7)), ph = Math.min(th - 14, 34);
          const pr = { x: rightX - pw, y: y + (th - ph) / 2, w: pw, h: ph };
          ctx.fillStyle = sel ? 'rgba(140,22,40,0.9)' : 'rgba(40,16,30,0.9)'; ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
          ctx.strokeStyle = sel ? GOLD : rgba(GOLD, 0.4); ctx.lineWidth = 1.2; ctx.strokeRect(pr.x + 0.5, pr.y + 0.5, pr.w - 1, pr.h - 1);
          text(ctx, v, pr.x + pr.w / 2, pr.y + pr.h / 2 + 5, { size: 14, align: 'center', weight: 800, color: sel ? '#fff4dc' : BONE, ow: 2 });
        }
        vis.w = view.w - 10;
        if (owner && vis.h >= th * 0.8) taps.add(`row:${i}`, vis, { owner, kind: 'list', src: 'options.row' });
        return;
      }
      // ◀ 값 ▶
      const rx = rightX - th, lx = rx - valW - th, vx = lx + th + valW / 2;
      const col = sel ? GOLD : 'rgba(232,200,114,0.38)';
      for (const [bx, dir] of [[lx, -1], [rx, 1]]) {
        const cx = bx + th / 2, cy = y + th / 2;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(cx - dir * 6, cy - 8); ctx.lineTo(cx + dir * 7, cy); ctx.lineTo(cx - dir * 6, cy + 8); ctx.closePath(); ctx.fill();
      }
      if (r.type === 'slider') {
        const v = this.val(r) ?? r.min, ratio = clamp((v - r.min) / (r.max - r.min), 0, 1);
        const bw = valW - 24, bx = vx - bw / 2, by = y + th / 2 + 7;
        this.geo[i] = { bx, bw };
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, 6);
        ctx.save(); ctx.translate(bx, 0);
        ctx.fillStyle = cachedGrad(ctx, 'slider', bw, 'h', SLIDER_STOPS); ctx.fillRect(0, by, bw * ratio, 6);
        ctx.restore();
        ctx.strokeStyle = 'rgba(232,200,114,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, 7);
        ctx.fillStyle = '#fff4dc'; ctx.beginPath(); ctx.arc(bx + bw * ratio, by + 3, 5 + fl * 2, 0, TAU); ctx.fill();
        text(ctx, this.valueText(r), vx, y + th / 2 - 1, { size: 15, align: 'center', weight: 900, family: FONT.num, color: sel ? GOLD : '#e8dcc8', ow: 2 });
      } else {
        const on = r.type === 'bool' ? !!this.val(r) : null;
        ctx.save(); ctx.translate(vx, ty); ctx.scale(1 + fl * 0.14, 1 + fl * 0.14);
        text(ctx, this.valueText(r), 0, 0, { size: 16, align: 'center', weight: 800, color: on === null ? (sel ? GOLD : '#e8dcc8') : on ? '#8aff9a' : '#ff8a8a', ow: 2, maxWidth: valW - 8 });
        ctx.restore();
      }
      if (!owner) return;
      if (vis.h >= th * 0.8) {
        taps.add(`row:${i}`, { ...vis, w: lx - view.x }, { owner, kind: 'list', src: 'options.row' });
        taps.add(`val:${i}`, { x: lx + th, y: vis.y, w: valW, h: vis.h }, { owner, kind: 'list', src: 'options.value' });
      }
      if (full) {
        taps.add(`l:${i}`, { x: lx, y, w: th, h: th }, { owner, kind: 'icon', src: 'options.arrow' });
        taps.add(`r:${i}`, { x: rx, y, w: th, h: th }, { owner, kind: 'icon', src: 'options.arrow' });
      }
    });
    ctx.restore();
    scrollBar(ctx, view, sc, contentH);
  }
  drawNote(ctx, L) {
    const rows = this.rows();
    const r = rows[clamp(this.sel[this.page], 0, rows.length - 1)];
    const note = this.noteOf(r), n = L.note;
    let w = n.w;
    if (r?.live === 'stick') { this.drawStickTest(ctx, n.x + n.w - 20, n.y + n.h / 2); w -= 56; }
    if (!note) return;
    const lines = wrap(ctx, note, w - 8, 13, 600, FONT.body).slice(0, 2);
    const y0 = n.y + (lines.length > 1 ? 15 : 24);
    lines.forEach((l, i) => text(ctx, l, n.x + w / 2, y0 + i * 18, { size: 13, align: 'center', weight: 600, color: '#d8c8b0', ow: 2 }));
  }
  /** 스틱 데드존 줄: 왼쪽 스틱 원래 기울기와 데드존 원 */
  drawStickTest(ctx, cx, cy) {
    const R = 17, dz = clamp(Number(this.s.ctrlDeadzone) || 0.2, 0.1, 0.4);
    let x = 0, y = 0;
    try { const a = input.activePad?.()?.axes; if (a) { x = a[0] || 0; y = a[1] || 0; } } catch { /* 무시 */ }
    const m = Math.hypot(x, y), inside = m < dz;
    ctx.save();
    ctx.strokeStyle = 'rgba(232,200,114,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(179,18,46,0.35)'; ctx.beginPath(); ctx.arc(cx, cy, R * dz, 0, TAU); ctx.fill();
    ctx.fillStyle = inside ? '#8a7a70' : '#8aff9a';
    ctx.beginPath(); ctx.arc(cx + clamp(x, -1, 1) * R, cy + clamp(y, -1, 1) * R, 3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  drawFooter(ctx, L) {
    let items;
    if (this.modal) items = input.mode === 'touch' ? [[null, '', '단추를 눌러 고르세요']] : [['dpadH', '선택'], ['confirm', '결정'], ['cancel', '취소']];
    else if (this.sub) items = this.sub.hints();
    else if (input.mode === 'touch') items = [[null, '', '◀ ▶ 를 눌러 값을 바꿉니다 · 위아래로 밀면 더 보입니다']];
    else items = [['dpadV', '항목'], ['dpadH', '값 바꾸기'], ['confirm', '결정'], [['prevTab', 'nextTab'], '페이지'], ['cancel', '닫기']];
    const { W, H, sb } = L;
    ctx.save(); ctx.translate(0, H - 30 - sb);
    ctx.fillStyle = cachedGrad(ctx, 'foot', 30, 'v', FOOT_STOPS); ctx.fillRect(0, 0, W, 30 + sb);
    ctx.restore();
    drawHints(ctx, items, W / 2, L.footY, { align: 'center', size: 13, color: '#b8aa98' });
  }
}
