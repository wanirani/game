// 계정 화면: 로그인 · 회원가입(복구 코드 1회 표시) · 비밀번호 변경 · 복구 코드로 재설정 · 로그아웃(이 기기 / 모든 기기) · 계정 삭제 · 지금 동기화
// 로그인·가입 화면의 '로그인 유지' 칸: 켜면 30일 동안 이 기기에 로그인이 남고, 끄면 창을 닫을 때 로그아웃된다 (공용 기기용)
// 캔버스 게임이지만 글자 입력은 실제 <input> 을 캔버스 패널 위에 겹쳐 띄운다 (모바일 키보드·비밀번호 관리자 지원).
//  - 화면(장면 안의 단계)이 바뀔 때 만들고 지우며, 매 프레임(requestAnimationFrame) 캔버스 크기·위치에 맞춰 옮긴다
//  - 입력 칸에서: Enter = 다음 칸/제출 · Esc = 뒤로 · ↑↓·Tab = 칸 이동 (input.js 는 입력 칸의 키를 게임 키로 쓰지 않는다)
//  - 버튼에서: ↑↓←→ 이동 · 결정/취소 (키보드·게임패드), 터치는 누르면 바로 실행
// go('account', { backIndex }) → 뒤로 = 타이틀 메뉴 / push('account', { overlay:true, screen }) → 뒤로 = pop
// 서버를 쓸 수 없는 환경(claude.ai 임베드·API 없는 서버·오프라인)에서는 안내만 보여 준다 (이 기기 저장은 그대로 동작)
//
// 플랫폼 UI 규칙 (platform §6.2/§6.3/§4.5, P-29) — owner: PLAT-ACCOUNT-UI
//  - uiScale 장면: game.uiW × game.uiH 로 배치 (최소 720×400), 포인터도 UI 좌표. 입력 칸(DOM)도 uiK 를 곱해 캔버스 위 제자리에 둔다
//  - 버튼 ≥ 44 CSS px, 목록 줄·입력 칸·체크 줄 ≥ 36 CSS px (기기의 CSS 배율로 계산), 탭 영역은 ui.taps (owner = 이 장면)
//  - 아래 안내 줄은 지금 기기의 글리프 (prompts.drawHints). 입력 칸에서 타이핑 중이면 키보드 키캡(ENTER·Esc·↑↓)
//  - 게임패드로는 글자를 칠 수 없다 (P-29): 입력 화면에서 패드를 쓰면 '키보드나 터치를 사용하세요' 안내를 띄운다
//  - 휴대폰 화면 키보드가 입력 칸을 가리면 패널을 위로 올린다 (visualViewport, 앱 브리지 window.__BN_IME, 안드로이드 앱 추정치)
//  - 오프라인·서버 연결 안 됨·로그인 만료·동기화 대기 중 로그아웃·충돌 상태를 휴대폰에서도 읽을 수 있는 안내 상자로 보여 준다
//  - 서버 주소 입력 칸은 두지 않는다 (앱은 cloud.js 가 정한 공식 사이트 API 를 쓴다)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { bus } from '../../core/events.js';
import { cloud, checkId, checkPassword, checkRecoveryCode, SLOTS, isAndroidApp } from '../../core/cloud.js';
import { text, wrap, FONT, taps, hovered } from '../../core/ui.js';
import { drawHints, promptMode } from '../../core/prompts.js';
import { clamp, ease, rgba } from '../../core/math.js';
import { hudSafe } from '../../render/hud_layout.js';
import { Ambience, kenBurns, shade, frame, heading, ornament, gbutton, fmtDate, GOLD, BONE, DIM, CRIMSON } from './common.js';
import { drawCloudIcon, drawCloudBadge, accountBadge, summaryLine, spinner, slotsJosa } from './cloud_ui.js';

const STYLE_ID = 'bn-account-style';
const CSS = `
.bn-acc-form{margin:0;padding:0;border:0}
.bn-field{position:fixed;left:0;top:0;z-index:25;box-sizing:border-box;margin:0;padding:0 .7em;border:1px solid rgba(232,200,114,.5);border-radius:3px;
background:rgba(10,4,12,.95);color:#efe4cf;font-family:"Noto Sans KR","Noto Sans KR Ext","Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-weight:600;
line-height:normal;outline:none;box-shadow:inset 0 0 14px rgba(179,18,46,.28);caret-color:#e8c872;visibility:hidden;
-webkit-user-select:text;user-select:text;touch-action:manipulation;-webkit-appearance:none;appearance:none;transition:border-color .12s,box-shadow .12s}
.bn-field:focus{border-color:#e8c872;box-shadow:0 0 0 1px rgba(232,200,114,.9),0 0 16px rgba(232,200,114,.35),inset 0 0 14px rgba(179,18,46,.4)}
.bn-field::placeholder{color:rgba(157,143,128,.8);font-weight:500}
.bn-field.bad{border-color:#ff4a5a;box-shadow:0 0 0 1px rgba(255,74,90,.8),0 0 14px rgba(255,74,90,.45)}
.bn-field:-webkit-autofill,.bn-field:-webkit-autofill:focus{-webkit-text-fill-color:#efe4cf;-webkit-box-shadow:0 0 0 60px #12060e inset;caret-color:#e8c872}
.bn-field.bn-code{text-align:center;letter-spacing:.12em;color:#ffe7a0;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,"Noto Sans KR",monospace;font-weight:800}
.bn-hidden{position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none}
`;
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID; s.textContent = CSS;
  document.head.appendChild(s);
}

// ── 입력 칸 정의 ──
const F_ID = { key: 'id', label: '아이디', type: 'text', ac: 'username', name: 'username', ph: '영문 소문자로 시작 4~16자', max: 32 };
const F_PW = { key: 'pw', label: '비밀번호', type: 'password', ac: 'current-password', name: 'password', ph: '비밀번호', max: 128 };
const F_NEW = { key: 'pw', label: '비밀번호', type: 'password', ac: 'new-password', name: 'new-password', ph: '8~64자', max: 128 };
const F_NEW2 = { key: 'pw2', label: '비밀번호 확인', type: 'password', ac: 'new-password', name: 'confirm-password', ph: '한 번 더 입력', max: 128 };
const F_OLD = { key: 'old', label: '지금 비밀번호', type: 'password', ac: 'current-password', name: 'current-password', ph: '지금 쓰는 비밀번호', max: 128 };
const F_CODE = { key: 'code', label: '복구 코드', type: 'text', ac: 'off', name: 'recovery-code', ph: 'XXXX-XXXX-XXXX-XXXX', max: 40, caps: true };

const SCREENS = {
  checking: { kind: 'wait', title: '계정 서버 확인' },
  unavailable: { kind: 'notice', title: '계정 기능 안내' },
  home: {
    kind: 'list', title: '계정', items: [
      { id: 'login', label: '로그인', sub: 'LOG IN' },
      { id: 'signup', label: '회원가입', sub: 'SIGN UP' },
      { id: 'recover', label: '복구 코드로 재설정', sub: 'FORGOT PASSWORD' },
      { id: 'back', label: '돌아가기', sub: 'BACK' },
    ],
  },
  profile: {
    kind: 'list', title: '내 계정', items: [
      { id: 'sync', label: '지금 동기화', sub: 'SYNC NOW' },
      { id: 'password', label: '비밀번호 변경', sub: 'PASSWORD' },
      { id: 'logout', label: '로그아웃', sub: 'LOG OUT' },
      { id: 'logoutAll', label: '모든 기기에서 로그아웃', sub: 'EVERYWHERE' },
      { id: 'delete', label: '계정 삭제', sub: 'DELETE', danger: true },
      { id: 'back', label: '돌아가기', sub: 'BACK' },
    ],
  },
  login: { kind: 'form', title: '로그인', fields: [F_ID, F_PW], submit: '로그인', remember: true, extra: { id: 'forgot', label: '비밀번호를 잊었나요?' } },
  signup: { kind: 'form', title: '회원가입', fields: [F_ID, F_NEW, F_NEW2], submit: '가입하기', remember: true },
  password: { kind: 'form', title: '비밀번호 변경', fields: [F_OLD, { ...F_NEW, label: '새 비밀번호' }, { ...F_NEW2, label: '새 비밀번호 확인' }], submit: '변경하기', hiddenUser: true },
  recover: { kind: 'form', title: '복구 코드로 재설정', fields: [F_ID, F_CODE, { ...F_NEW, label: '새 비밀번호' }, { ...F_NEW2, label: '새 비밀번호 확인' }], submit: '재설정하기' },
  delete: { kind: 'form', title: '계정 삭제', fields: [{ ...F_PW, label: '비밀번호', ph: '확인을 위해 입력' }], submit: '계정 삭제', danger: true, hiddenUser: true },
  code: { kind: 'code', title: '복구 코드' },
};
const LOGGED_IN = new Set(['profile', 'password', 'delete']);
const GUEST = new Set(['home', 'login', 'signup', 'recover']);
const RED = '#ff8a8a', GOOD = '#9fe8b0', INFO = '#9fd8ff', WARN = '#ffb070';
/** 게임패드로는 글자를 칠 수 없다 (platform P-29). 복구 코드 화면은 스펙 문구 그대로 */
const P29_CODE = '컨트롤러로는 코드를 입력할 수 없습니다. 키보드나 터치를 사용하세요';
const P29_TEXT = '컨트롤러로는 아이디와 비밀번호를 입력할 수 없습니다. 키보드나 터치를 사용하세요';
const EXPIRED_MSG = '로그인이 만료되었습니다. 다시 로그인해 주세요.';
/** cloud.js 오류 중 연결 문제 (상태 안내와 겹치는 것) */
const NET_ERR = new Set(['offline', 'network', 'timeout', 'bad_response', 'server_error']);

// 오른쪽 안내 문구 (h: 소제목, b: 글머리, t: 문장, c: 색) — 칸이 모자라면 뒤쪽 항목부터 생략한다
const RULES_ID = { b: '아이디: 영문 소문자로 시작하는 4~16자. 영문 소문자, 숫자, 밑줄(_)만 쓸 수 있습니다. 대문자로 적으면 소문자로 바뀝니다.' };
const RULES_PW = { b: '비밀번호: 8~64자. 한글·숫자·기호도 쓸 수 있지만 아이디와 같으면 안 됩니다.' };
const INFO_TEXT = {
  home: [
    { h: '계정을 만들면' },
    { b: '세이브 슬롯 1~3을 클라우드에 보관합니다.' },
    { b: '웹과 앱 어디서든 같은 아이디로 로그인해 이어서 할 수 있습니다.' },
    { b: '해금한 헌터, 본 엔딩, 명예의 전당 기록도 합쳐서 보관합니다.' },
    { t: '계정 없이 게스트로 플레이해도 기록은 이 기기에 그대로 저장됩니다.', c: DIM },
  ],
  login: [
    { h: '로그인' },
    { b: '아이디는 대소문자를 구분하지 않습니다.' },
    { b: '비밀번호를 5번 틀리면 10분 동안 이 기기(네트워크)에서 로그인할 수 없습니다.' },
    { b: 'PC방·학교 같은 공용 기기에서는 「로그인 유지」를 끄고, 다 쓰면 로그아웃하세요.' },
    { b: '비밀번호를 잊었다면 가입할 때 받은 복구 코드로 새 비밀번호를 정할 수 있습니다.' },
  ],
  signup: [
    { h: '만들기 규칙' },
    RULES_ID, RULES_PW,
    { b: '가입이 끝나면 복구 코드를 한 번만 보여 드립니다. 비밀번호를 잊었을 때 꼭 필요하니 적어 두세요.' },
    { b: '공용 기기에서는 「로그인 유지」를 끄세요.' },
    { t: '이 기기에 있는 세이브는 가입 뒤 클라우드에 올라갑니다.', c: DIM },
  ],
  password: [
    { h: '비밀번호 변경' },
    RULES_PW,
    { b: '비밀번호를 바꾸면 이 기기를 뺀 다른 모든 기기에서 로그아웃됩니다.' },
  ],
  recover: [
    { h: '복구 코드로 재설정' },
    { b: '가입(또는 마지막 재설정) 때 받은 16자리 코드를 입력하세요. 하이픈·띄어쓰기·대소문자는 신경 쓰지 않아도 됩니다.' },
    { b: '재설정하면 새 복구 코드가 나오고, 예전 코드와 모든 기기의 로그인은 무효가 됩니다.' },
    RULES_PW,
  ],
  delete: [
    { h: '계정 삭제', c: '#ff9a9a' },
    { b: '계정과 클라우드에 보관한 세이브·기록이 모두 지워지며 되돌릴 수 없습니다.' },
    { b: '이 기기에 저장된 세이브는 지워지지 않습니다.' },
    { b: '확인을 위해 지금 비밀번호를 입력하세요.' },
  ],
};

/** 서버 오류 코드 → 표시할 입력 칸 */
const ERR_FIELD = {
  invalid_id: 'id', reserved_id: 'id', id_taken: 'id', invalid_password: 'pw', password_same_as_id: 'pw', same_password: 'pw', weak_password: 'pw',
  invalid_credentials: 'pw', wrong_password: 'old', invalid_recovery: 'code',
};

// ── 이 장면 밖에서 로그인이 만료된 기록 (다음에 계정 화면을 열면 로그인 칸으로 안내하고 아이디를 채운다) ──
let EXPIRED = null; // { id, at }
let expiryWatch = false;
function watchExpiry() {
  if (expiryWatch) return;
  expiryWatch = true;
  try {
    bus.on('cloud:logout', (e) => { EXPIRED = e?.reason === 'expired' && e.id ? { id: e.id, at: Date.now() } : null; });
    bus.on('cloud:login', () => { EXPIRED = null; });
  } catch (err) { console.error('[account] expiry watch', err); }
}
// 모듈 평가가 모두 끝난 뒤에 구독한다 (모듈 최상위에서 import 값에 바로 접근하지 않는다 — ARCHITECTURE 순환 import 규칙)
if (typeof setTimeout === 'function') setTimeout(watchExpiry, 0);

/**
 * 비밀번호 관리자에 저장을 제안한다 (Credential Management API). 캔버스 게임은 페이지를 옮기지 않아서
 * 브라우저가 로그인 성공을 알아채지 못할 수 있다. 지원하지 않는 환경(앱 웹뷰·사파리 등)에서는 조용히 넘어간다
 */
function offerSaveCredential(id, password) {
  try {
    const PC = typeof window !== 'undefined' ? window.PasswordCredential : null;
    if (!PC || !id || !password || !window.isSecureContext || !navigator.credentials?.store) return;
    navigator.credentials.store(new PC({ id, password, name: id })).catch(() => { /* 사용자가 거절·지원 안 함 */ });
  } catch { /* 지원 안 함 */ }
}

/**
 * 화면 키보드가 가리지 않는 세로 띠 (CSS px, 레이아웃 뷰포트 기준) 또는 null (키보드 없음으로 본다)
 *  1) 앱 브리지 window.__BN_IME = {bottom} (IME 가 가린 높이, CSS px) — 있으면 그대로
 *  2) visualViewport 가 창보다 눈에 띄게 작으면 그 범위 (웹: 크롬 안드로이드·iOS 사파리)
 *  3) 안드로이드 앱(adjustNothing: 웹뷰가 키보드를 모른다)에서 터치로 입력 중이면 화면 아래 절반을 키보드로 본다
 */
function keyboardBand(touchTyping) {
  if (typeof window === 'undefined') return null;
  const ih = window.innerHeight || 0;
  if (!(ih > 0)) return null;
  // 앱이 IME 높이를 알려 주면 (0 = 키보드 닫힘 포함) 그 값만 믿는다
  const raw = window.__BN_IME;
  const ime = raw == null ? NaN : Number(typeof raw === 'object' ? raw.bottom : raw);
  if (Number.isFinite(ime)) return ime > 40 ? { top: 0, bottom: ih - ime } : null;
  const vv = window.visualViewport;
  if (vv && vv.height > 0 && vv.height < ih * 0.9) return { top: vv.offsetTop || 0, bottom: (vv.offsetTop || 0) + vv.height };
  if (touchTyping && isAndroidApp()) return { top: 0, bottom: ih * 0.5 };
  return null;
}

export class AccountScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; }
  enter(params = {}) {
    ensureStyle();
    watchExpiry();
    this.overlay = !!params.overlay;
    this.backIndex = params.backIndex ?? 4;
    this.want = params.screen ?? null;
    this.toastY = 84; // 제목 장식 바로 아래 (UI 좌표)
    this.amb = new Ambience({ embers: 36, motes: 18, bats: 4, lightning: false });
    this.inputs = []; this.form = null; this.values = {};
    this.items = []; this.focus = 0;
    this.busy = false; this.msg = null; this.shakeT = 0;
    this.alive = true; this.leaving = false;
    this.code = null; this.codeNext = 'profile';
    this.remember = cloud.rememberPref(); // '로그인 유지' 칸 (이 기기에 기억한 선택)
    this.infoT = 0; this.slotRows = [];
    this.lift = 0; this._placeT = 0; this.padFlash = 0;
    this.offs = [
      bus.on('cloud:logout', (e) => {
        if (!this.alive || e?.reason !== 'expired' || !LOGGED_IN.has(this.screen)) return;
        if (e.id) this.values.id = e.id;
        EXPIRED = null;
        this.show('login', { msg: { text: EXPIRED_MSG, color: WARN } });
      }),
      bus.on('cloud:sync', (e) => { if (this.alive && e?.phase === 'done') this.readSlots(); }),
      bus.on('cloud:conflict', () => { if (this.alive) this.readSlots(); }),
    ];
    // 인터넷이 다시 연결되면 안내 화면에서 저절로 다시 확인한다
    this.onOnline = () => { if (this.alive && this.screen === 'unavailable' && cloud.state !== 'blocked') this.start(this.want); };
    try { window.addEventListener('online', this.onOnline); } catch { /* 창 없음 */ }
    const tick = () => { if (!this.alive) return; this.place(); this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
    this.start(this.want);
  }
  exit() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.removeFields();
    for (const off of this.offs ?? []) off();
    try { window.removeEventListener('online', this.onOnline); } catch { /* 창 없음 */ }
  }
  onResume() { this.readSlots(); }
  resize() { this.place(); }

  /** 처음 보여 줄 화면을 정한다 (서버 확인 포함) */
  start(want = null) {
    if (!cloud.eligible()) { this.show('unavailable'); return; }
    if (cloud.loggedIn) {
      this.show(LOGGED_IN.has(want) ? want : 'profile');
      if (!cloud.verified) cloud.resume().then(() => { if (this.alive) this.readSlots(); });
      return;
    }
    this.show('checking');
    cloud.probe(true).then((ok) => {
      if (!this.alive || this.screen !== 'checking') return;
      if (!ok) { this.show('unavailable'); return; }
      // 다른 화면에서 로그인이 만료됐다면 (토스트로 알렸다) 로그인 칸으로 바로 안내한다 (6시간 안)
      const ex = EXPIRED && Date.now() - EXPIRED.at < 6 * 3600e3 ? EXPIRED : null;
      EXPIRED = null;
      if (ex && (!want || want === 'login' || want === 'home')) {
        this.values.id = ex.id;
        this.show('login', { msg: { text: `${ex.id} 계정의 ${EXPIRED_MSG}`, color: WARN } });
        return;
      }
      this.show(GUEST.has(want) ? want : 'home');
    });
  }

  // ───────────────────────── 화면 전환 ─────────────────────────
  show(name, { msg = null, focus = null } = {}) {
    // 아이디는 화면을 옮겨도 남긴다 (로그인 → 복구 코드 재설정 등). 비밀번호는 남기지 않는다
    const idEl = this.inputs.find((el) => el.dataset.key === 'id');
    if (idEl?.value) this.values.id = idEl.value;
    this.removeFields();
    this.screen = name;
    this.def = SCREENS[name];
    this.st = 0; this.msg = msg; this.busy = false; this.lift = 0;
    this.buildItems();
    this.makeFields();
    const first = this.items.findIndex((it) => it.kind === 'field');
    this.focus = focus ?? (first >= 0 ? first : 0);
    if (this.items[this.focus]?.kind === 'field' && !input.touchMode) {
      // 데스크톱: 첫 칸에 바로 입력할 수 있게 (모바일은 키보드가 갑자기 뜨지 않도록 사용자가 누를 때까지 기다림)
      const it = this.items[this.focus];
      setTimeout(() => { if (this.alive && this.screen === name && this.game.top === this) this.focusInput(it.fi); }, 60);
    }
    if (name === 'profile') this.readSlots();
  }
  buildItems() {
    const d = this.def, it = [];
    if (d.kind === 'list') d.items.forEach((x, i) => it.push({ kind: 'btn', id: x.id, label: x.label, sub: x.sub, danger: x.danger, row: i, col: 0 }));
    else if (d.kind === 'form') {
      d.fields.forEach((f, i) => it.push({ kind: 'field', id: f.key, fi: i, row: i, col: 0 }));
      let r = d.fields.length;
      if (d.remember) it.push({ kind: 'check', id: 'remember', label: '로그인 유지', row: r++, col: 0 });
      it.push({ kind: 'btn', id: 'submit', label: d.submit, row: r, col: 0, primary: true, danger: d.danger });
      it.push({ kind: 'btn', id: 'cancel', label: '취소', row: r, col: 1 });
      if (d.extra) it.push({ kind: 'btn', id: d.extra.id, label: d.extra.label, row: r, col: 2, link: true });
    } else if (d.kind === 'code') {
      it.push({ kind: 'btn', id: 'copy', label: '복사하기', row: 0, col: 0 });
      it.push({ kind: 'btn', id: 'done', label: '적어 두었습니다', row: 0, col: 1, primary: true });
    } else if (d.kind === 'notice') {
      if (cloud.state !== 'blocked') it.push({ kind: 'btn', id: 'retry', label: '다시 확인', row: 0, col: 0 });
      it.push({ kind: 'btn', id: 'back', label: '돌아가기', row: 0, col: it.length, primary: true });
    } else it.push({ kind: 'btn', id: 'back', label: '돌아가기', row: 0, col: 0 });
    this.items = it;
  }

  // ───────────────────────── 실제 입력 칸 (DOM) ─────────────────────────
  makeFields() {
    if (typeof document === 'undefined') return;
    const d = this.def;
    const fields = d.kind === 'form' ? d.fields : d.kind === 'code' ? [{ key: 'codeview', type: 'text', ac: 'off', name: 'recovery-code', readonly: true }] : [];
    if (!fields.length) return;
    const form = document.createElement('form');
    form.className = 'bn-acc-form';
    form.setAttribute('autocomplete', 'on');
    form.noValidate = true;
    form.addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    if (d.hiddenUser && cloud.id) {
      // 비밀번호 관리자가 어느 계정의 비밀번호인지 알 수 있도록 숨은 아이디 칸
      const h = document.createElement('input');
      h.type = 'text'; h.name = 'username'; h.autocomplete = 'username'; h.value = cloud.id; h.readOnly = true; h.tabIndex = -1;
      h.className = 'bn-hidden'; h.setAttribute('aria-hidden', 'true');
      form.appendChild(h);
    }
    fields.forEach((f, i) => {
      const el = document.createElement('input');
      el.className = 'bn-field' + (f.readonly ? ' bn-code' : '');
      el.type = f.type; el.name = f.name; el.dataset.key = f.key;
      el.setAttribute('autocomplete', f.ac);
      el.setAttribute('autocapitalize', f.caps ? 'characters' : 'off');
      el.setAttribute('autocorrect', 'off');
      el.spellcheck = false;
      if (f.max) el.maxLength = f.max;
      if (f.label) el.setAttribute('aria-label', f.label);
      if (f.ph) el.placeholder = f.ph;
      if (f.readonly) { el.readOnly = true; el.value = this.code ?? ''; el.setAttribute('aria-label', '복구 코드'); }
      else {
        el.setAttribute('enterkeyhint', i === fields.length - 1 ? (this.screen === 'login' ? 'go' : 'done') : 'next');
        if (f.key === 'id' && this.values.id) el.value = this.values.id;
        el.addEventListener('keydown', (e) => this.onFieldKey(e, i));
        el.addEventListener('input', () => { el.classList.remove('bad'); if (this.msg?.field === f.key) this.msg = null; });
      }
      if (f.readonly) {
        // 읽기 전용 칸: 게임 키(Z·X·방향키)는 버튼 조작에 쓰고, 복사 단축키만 칸이 받게 한다
        el.addEventListener('keydown', (e) => { if (e.ctrlKey || e.metaKey) e.stopPropagation(); });
        el.addEventListener('focus', () => { try { el.select(); } catch { /* 무시 */ } });
      } else {
        el.addEventListener('focus', () => { const k = this.items.findIndex((it) => it.kind === 'field' && it.fi === i); if (k >= 0) this.focus = k; });
      }
      form.appendChild(el);
      this.inputs.push(el);
    });
    document.body.appendChild(form);
    this.form = form;
    this.place();
  }
  removeFields() {
    for (const el of this.inputs) { el.value = ''; }
    this.form?.remove();
    this.form = null; this.inputs = [];
  }
  focusInput(fi) {
    const el = this.inputs[fi];
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  }
  blurInputs() { const a = typeof document !== 'undefined' ? document.activeElement : null; if (a && this.inputs.includes(a)) a.blur(); }
  /** 포커스가 있는 입력 칸 번호 (-1: 없음) */
  domFocus() { return typeof document === 'undefined' ? -1 : this.inputs.indexOf(document.activeElement); }
  val(key) { return this.inputs.find((el) => el.dataset.key === key)?.value ?? ''; }
  markBad(key) {
    const el = this.inputs.find((e) => e.dataset.key === key);
    if (!el) return;
    el.classList.add('bad');
    if (!input.touchMode || this.domFocus() >= 0) this.focusInput(this.inputs.indexOf(el));
    const k = this.items.findIndex((it) => it.kind === 'field' && it.id === key);
    if (k >= 0) this.focus = k;
  }
  onFieldKey(e, i) {
    if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중
    const last = i === this.inputs.length - 1;
    switch (e.key) {
      case 'Enter': e.preventDefault(); if (this.busy) return; if (last) this.submit(); else { this.focusInput(i + 1); audio.sfx('menu_move'); } break;
      case 'Escape': e.preventDefault(); this.back(); break;
      case 'ArrowUp': e.preventDefault(); this.move(-1, 0); break;
      case 'ArrowDown': e.preventDefault(); this.move(1, 0); break;
      case 'Tab': e.preventDefault(); this.step(e.shiftKey ? -1 : 1); break;
      default: break;
    }
  }

  /**
   * 입력 칸을 캔버스 위 제자리로 옮긴다 (매 rAF). 이 장면이 맨 위가 아니거나 떠나는 중이면 숨긴다.
   * 화면 키보드가 포커스된 칸을 가리면 패널 전체를 위로 올린다 (this.lift, UI px — render 와 탭 영역도 같은 값을 쓴다)
   */
  place() {
    const els = this.inputs;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = clamp((now - (this._placeT || now)) / 1000, 0, 0.1);
    this._placeT = now;
    if (!els.length) { this.lift = 0; return; }
    const g = this.game, cv = g.canvas;
    if (!cv) return;
    const visible = this.alive && !this.leaving && g.top === this && !(g.portrait && input.touchMode);
    const R = cv.getBoundingClientRect();
    const k = (R.height / g.viewH) * (g.uiK || 1); // UI px → CSS px
    // 키보드 피하기: 포커스된 (쓸 수 있는) 칸이 보이는 띠 안에 들어오도록 올릴 양
    let target = 0;
    const df = this.domFocus();
    if (visible && df >= 0 && !els[df].classList.contains('bn-code') && k > 0) {
      const band = keyboardBand(!!input.touchMode);
      const r0 = band ? this.fieldRect(df, this.geom(0)) : null;
      if (r0) {
        const top = R.top + r0.y * k, bot = top + r0.h * k, m = 10;
        const lo = (bot + m - band.bottom) / k, hi = (top - m - band.top) / k;
        target = Math.max(0, Math.min(Math.max(0, lo), hi));
      }
    }
    if (Math.abs(target - this.lift) < 0.5) this.lift = target;
    else this.lift += (target - this.lift) * (1 - Math.exp(-16 * dt));
    const G = this.geom();
    const a = clamp((this.st - 0.08) / 0.18, 0, 1) * (1 - clamp(g.fade?.a ?? 0, 0, 1));
    els.forEach((el, i) => {
      const r = this.fieldRect(i, G);
      if (!visible || !r) {
        if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
        if (document.activeElement === el) el.blur();
        return;
      }
      const code = el.classList.contains('bn-code');
      const fs = Math.max(16, Math.round((code ? 24 : 16.5) * k)); // 16 CSS px 미만이면 iOS 가 확대한다
      const css = `${Math.round(R.left + r.x * k)}|${Math.round(R.top + r.y * k)}|${Math.round(r.w * k)}|${Math.round(r.h * k)}|${fs}|${a.toFixed(2)}`;
      if (el._css === css && el.style.visibility === 'visible') return;
      el._css = css;
      const [l, t, w, h] = css.split('|');
      Object.assign(el.style, { left: `${l}px`, top: `${t}px`, width: `${w}px`, height: `${h}px`, fontSize: `${fs}px`, opacity: a.toFixed(2), visibility: 'visible' });
    });
  }

  // ───────────────────────── 배치 (UI 좌표) ─────────────────────────
  /** 이 장면 좌표 1 px 이 몇 CSS px 인가 (uiScale: CSS 배율 × uiK) */
  cssPer() { const g = this.game; return Math.max(0.2, (g.cssScale || 1) * (g.uiK || 1)); }
  /** CSS px 최소 크기 → 이 장면 좌표 */
  minPx(css) { return Math.ceil(css / this.cssPer()); }
  geom(lift = this.lift) {
    const g = this.game, k = g.uiK || 1;
    const W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const S = hudSafe(g);
    const sl = (S.l || 0) / k, sr = (S.r || 0) / k, st = (S.t || 0) / k, sb = (S.b || 0) / k;
    const kind = this.def?.kind;
    const single = kind === 'wait' || kind === 'notice' || kind === 'code';
    const top = 58 + st, foot = 30 + sb;
    const availW = W - sl - sr, availH = H - top - foot - 4;
    const PW = Math.round(single ? Math.min(720, availW - 40) : Math.min(940, availW - 28));
    const PH = Math.round(Math.min(single ? 404 : 452, availH));
    const sh = this.shakeT > 0 ? Math.sin(this.shakeT * 70) * 7 * (this.shakeT / 0.35) : 0;
    const x0 = Math.round(sl + availW / 2 - PW / 2 + sh);
    const y0 = Math.round(top + Math.max(0, (availH - PH) / 2) - (lift || 0));
    const LW = single ? PW : Math.round(PW * 0.55);
    const L = { x: x0 + 22, w: LW - 22 - 14 };
    const R = { x: x0 + LW + 8, w: PW - LW - 8 - 20 };
    const lab = Math.round(clamp(L.w * 0.3, 84, 118));
    // 크기 하한 (platform §6.3): 입력 칸·목록 줄·체크 줄 ≥ 36 CSS px (여유 2), 버튼 ≥ 44 CSS px (모자라면 탭 여유가 채운다)
    const fieldH = clamp(this.minPx(38), 40, 50);
    const rowH = clamp(this.minPx(38), 40, 52);
    const btnH = clamp(this.minPx(44), 44, 54);
    return { W, H, sl, sr, st, sb, top, foot, x0, y0, PW, PH, LW, L, R, lab, fieldH, rowH, btnH, single };
  }
  /** 입력 폼의 세로 배치: 칸 y 들, 체크 줄 y, 버튼 줄 y */
  formLayout(G) {
    const d = this.def, n = d.fields.length, rem = d.remember ? 1 : 0;
    const titleH = G.PH < 340 ? 46 : 54;
    const btnGap = 12, bottom = 12;
    const avail = G.PH - titleH - btnGap - G.btnH - bottom;
    const gap = clamp((avail - n * G.fieldH - rem * G.rowH) / Math.max(1, n + rem - 0.5), 4, 12);
    let y = G.y0 + titleH;
    const fy = [];
    for (let i = 0; i < n; i++) { fy.push(y); y += G.fieldH + gap; }
    let checkY = null;
    if (rem) { checkY = y; y += G.rowH + gap; }
    const btnY = Math.round(Math.min(y - gap + btnGap, G.y0 + G.PH - bottom - G.btnH));
    return { titleH, fy, checkY, btnY };
  }
  /** 목록 화면 줄 배치 */
  listLayout(G) {
    const n = this.def.items.length, titleH = G.PH < 340 ? 46 : 54;
    const avail = G.PH - titleH - 10;
    const rowH = Math.max(G.rowH, Math.min(52, Math.floor(avail / n) - 4));
    const pitch = Math.max(rowH + 2, Math.min(rowH + 6, Math.floor(avail / n)));
    return { titleH, rowH, pitch, y: G.y0 + titleH };
  }
  fieldRect(fi, G = this.geom()) {
    const d = this.def;
    if (d.kind === 'code') { const c = this.codeLayout(G); return { x: G.x0 + G.PW / 2 - c.fw / 2, y: c.fieldY, w: c.fw, h: c.fh }; }
    if (d.kind !== 'form') return null;
    const F = this.formLayout(G);
    return { x: G.L.x + G.lab, y: F.fy[fi], w: G.L.w - G.lab, h: G.fieldH };
  }
  itemRect(it, G = this.geom()) {
    const d = this.def;
    if (it.kind === 'field') return this.fieldRect(it.fi, G);
    if (d.kind === 'form') {
      const F = this.formLayout(G);
      if (it.kind === 'check') return { x: G.L.x + G.lab, y: F.checkY, w: G.L.w - G.lab, h: G.rowH };
      const bw = Math.round((G.L.w - 12) * 0.6);
      if (it.col === 0) return { x: G.L.x, y: F.btnY, w: bw, h: G.btnH };
      if (it.col === 1) return { x: G.L.x + bw + 12, y: F.btnY, w: G.L.w - bw - 12, h: G.btnH };
      return { x: G.R.x + 8, y: F.btnY, w: G.R.w - 8, h: G.btnH };
    }
    if (d.kind === 'list') {
      const Ls = this.listLayout(G);
      return { x: G.L.x - 10, y: Ls.y + it.row * Ls.pitch, w: G.L.w + 20, h: Ls.rowH };
    }
    // 가운데 버튼 줄 (code · notice · wait)
    const row = this.items.filter((x) => x.row === it.row), n = row.length, gap = 16;
    const bw = Math.min(220, Math.floor((G.PW - 60 - (n - 1) * gap) / n));
    const bx = G.x0 + G.PW / 2 - (n * bw + (n - 1) * gap) / 2;
    return { x: Math.round(bx + row.indexOf(it) * (bw + gap)), y: G.y0 + G.PH - 16 - G.btnH, w: bw, h: G.btnH };
  }
  /** 복구 코드 화면의 세로 배치 */
  codeLayout(G) {
    const fh = clamp(this.minPx(40), 52, 62), fw = Math.min(440, G.PW - 80);
    const compact = G.PH < 380;
    const fieldY = G.y0 + (compact ? 104 : 132);
    return { fh, fw, fieldY, compact };
  }

  // ───────────────────────── 조작 ─────────────────────────
  /** ↑↓(dr) ←→(dc) 이동: 같은 줄에서는 좌우, 줄 사이는 가장 가까운 칸으로 */
  move(dr, dc) {
    const items = this.items;
    if (!items.length) return;
    const cur = items[this.focus] ?? items[0];
    let next = null;
    if (dc) {
      const row = items.filter((x) => x.row === cur.row).sort((a, b) => a.col - b.col);
      next = row[clamp(row.indexOf(cur) + dc, 0, row.length - 1)];
    } else if (dr) {
      const rows = [...new Set(items.map((x) => x.row))].sort((a, b) => a - b);
      const ri = (rows.indexOf(cur.row) + dr + rows.length) % rows.length;
      const cand = items.filter((x) => x.row === rows[ri]);
      next = cand.find((x) => x.col === cur.col) ?? cand[0];
    }
    if (next && next !== cur) this.setFocus(items.indexOf(next));
  }
  /** Tab 순서대로 한 칸 */
  step(d) {
    const n = this.items.length;
    if (n) this.setFocus((this.focus + d + n) % n);
  }
  setFocus(i) {
    this.focus = i;
    audio.sfx('menu_move');
    const it = this.items[i];
    if (it?.kind === 'field') this.focusInput(it.fi);
    else this.blurInputs();
  }
  activate(id) {
    if (this.busy) return;
    const it = this.items.find((x) => x.id === id);
    if (it?.disabled) { audio.sfx('menu_cancel'); return; }
    switch (id) {
      case 'hdrBack': this.back(); return;
      case 'back': this.leave(); return;
      case 'cancel': this.back(); return;
      case 'login': case 'signup': case 'recover': audio.sfx('menu_ok'); this.show(id); return;
      case 'forgot': audio.sfx('menu_ok'); this.show('recover'); return;
      case 'password': case 'delete': audio.sfx('menu_ok'); this.show(id); return;
      case 'submit': this.submit(); return;
      case 'sync': this.doSync(); return;
      case 'logout': this.confirmLogout(); return;
      case 'logoutAll': this.confirmLogoutAll(); return;
      case 'remember': this.remember = !this.remember; audio.sfx('menu_move'); return;
      case 'copy': this.copyCode(); return;
      case 'done': this.confirmCode(); return;
      case 'retry': audio.sfx('menu_ok'); this.start(this.want); return;
      default:
    }
  }
  back() {
    if (this.busy) return;
    switch (this.screen) {
      case 'login': case 'signup': case 'recover': audio.sfx('menu_cancel'); this.show('home'); break;
      case 'password': case 'delete': audio.sfx('menu_cancel'); this.show('profile'); break;
      case 'code': this.confirmCode(); break;
      default: this.leave();
    }
  }
  leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.blurInputs();
    this.place();
    audio.sfx('menu_cancel');
    if (this.overlay) this.game.pop();
    else this.game.go('title', { menu: true, index: this.backIndex });
  }
  /** 게임패드로 입력 칸을 고름 (P-29): 칸은 열어 두되(키보드·터치로 칠 수 있게) 안내를 깜빡인다 */
  padOnField() {
    this.padFlash = 1.2;
    audio.sfx('menu_cancel');
  }

  update(dt) {
    const g = this.game;
    this.amb.update(dt, g.uiW || g.viewW, g.uiH || g.viewH);
    this.st += dt;
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.padFlash > 0) this.padFlash = Math.max(0, this.padFlash - dt);
    if (this.screen === 'profile' && (this.infoT += dt) > 0.5) { this.infoT = 0; this.readSlots(); }
    if (this.leaving) return;
    const tap = taps.hit(this);
    if (tap) {
      const k = this.items.findIndex((x) => x.id === tap);
      if (k >= 0) { this.focus = k; this.blurInputs(); }
      this.activate(tap);
      return;
    }
    if (this.busy) return;
    // 키보드는 입력 칸에 포커스가 있으면 여기로 오지 않는다 (onFieldKey 가 처리). 게임패드는 항상 온다
    if (input.pressed('up')) this.move(-1, 0);
    else if (input.pressed('down')) this.move(1, 0);
    else if (input.pressed('left') && this.domFocus() < 0) this.move(0, -1);
    else if (input.pressed('right') && this.domFocus() < 0) this.move(0, 1);
    if (input.pressed('confirm')) {
      const it = this.items[this.focus];
      if (!it) return;
      if (it.kind === 'field') {
        const df = this.domFocus();
        if (input.mode === 'pad' && df !== it.fi) { this.focusInput(it.fi); this.padOnField(); }
        else if (df !== it.fi) this.focusInput(it.fi);
        else if (it.fi === this.inputs.length - 1) this.submit();
        else this.move(1, 0);
      } else this.activate(it.id);
    } else if (input.pressed('cancel')) this.back();
  }

  // ───────────────────────── 동작 ─────────────────────────
  fail(text, field = null) {
    this.msg = { text, color: RED, field };
    this.shakeT = 0.35;
    audio.sfx('menu_cancel');
    if (field) this.markBad(field);
  }
  setBusy(on, label = '서버와 통신하는 중…') {
    this.busy = on;
    for (const el of this.inputs) if (!el.classList.contains('bn-code')) el.readOnly = on;
    if (on) this.msg = { text: label, color: DIM, spin: true };
  }
  /** 입력값 검사 → { text, field } 또는 null */
  validate() {
    const s = this.screen, id = this.val('id'), pw = this.val('pw'), pw2 = this.val('pw2');
    if (s === 'login') {
      const e = checkId(id); if (e) return { text: e, field: 'id' };
      if (!pw) return { text: '비밀번호를 입력해 주세요.', field: 'pw' };
      return null;
    }
    if (s === 'signup' || s === 'recover') {
      const e = checkId(id, s === 'signup'); if (e) return { text: e, field: 'id' };
      if (s === 'recover') { const c = checkRecoveryCode(this.val('code')); if (c) return { text: c, field: 'code' }; }
      const p = checkPassword(pw, id); if (p) return { text: p, field: 'pw' };
      if (pw !== pw2) return { text: '비밀번호 확인이 일치하지 않습니다. 같은 비밀번호를 한 번 더 입력해 주세요.', field: 'pw2' };
      return null;
    }
    if (s === 'password') {
      if (!this.val('old')) return { text: '지금 쓰는 비밀번호를 입력해 주세요.', field: 'old' };
      const p = checkPassword(pw, cloud.id ?? ''); if (p) return { text: p, field: 'pw' };
      if (pw === this.val('old')) return { text: '새 비밀번호가 지금 비밀번호와 같습니다.', field: 'pw' };
      if (pw !== pw2) return { text: '새 비밀번호 확인이 일치하지 않습니다.', field: 'pw2' };
      return null;
    }
    if (s === 'delete' && !pw) return { text: '비밀번호를 입력해 주세요.', field: 'pw' };
    return null;
  }
  async submit() {
    if (this.busy || this.def.kind !== 'form') return;
    const err = this.validate();
    if (err) { this.fail(err.text, err.field); return; }
    const s = this.screen;
    if (s === 'delete') { this.confirmDelete(); return; }
    audio.sfx('menu_ok');
    this.setBusy(true);
    const id = this.val('id'), pw = this.val('pw');
    let r;
    if (s === 'login') r = await cloud.login(id, pw, { remember: this.remember });
    else if (s === 'signup') r = await cloud.signup(id, pw, { remember: this.remember });
    else if (s === 'recover') r = await cloud.recover(id, this.val('code'), pw);
    else if (s === 'password') r = await cloud.changePassword(this.val('old'), pw);
    if (!this.alive || this.screen !== s) return;
    this.setBusy(false);
    if (!r?.ok) {
      // 로그인 만료(비밀번호 변경 중): cloud:logout 알림이 로그인 화면으로 옮긴다 — 여기서 더 할 일이 없다
      if (r?.error === 'unauthorized' && !cloud.loggedIn && LOGGED_IN.has(s)) return;
      const field = r?.error === 'wrong_password' && s === 'delete' ? 'pw' : ERR_FIELD[r?.error] ?? null;
      this.fail(r?.message ?? '처리하지 못했습니다.', field);
      if (r?.error === 'invalid_credentials') { const el = this.inputs.find((e) => e.dataset.key === 'pw'); if (el) el.value = ''; }
      return;
    }
    audio.sfx('save');
    offerSaveCredential(r.id ?? cloud.id, pw);
    if (s === 'login') this.afterLogin(r.id);
    else if (s === 'signup') {
      this.values.id = r.id;
      this.showCode(r.recoveryCode, 'profile', `${r.id} 계정을 만들었습니다.`);
      cloud.refresh({ reason: 'signup', adoptLocal: true }).then(() => { if (this.alive) this.readSlots(); });
    } else if (s === 'recover') {
      this.values.id = r.id;
      this.showCode(r.recoveryCode, 'profile', '새 비밀번호로 바꾸고 로그인했습니다.');
      cloud.refresh({ reason: 'login' }).then((out) => { if (this.alive) { this.readSlots(); cloud.announce(out); } });
    } else if (s === 'password') {
      this.show('profile', { msg: { text: '비밀번호를 바꿨습니다. 다른 기기에서는 모두 로그아웃되었습니다.', color: GOOD } });
    }
  }
  async afterLogin(id) {
    this.show('profile', { msg: { text: `${id} 님, 어서 오세요. 클라우드와 동기화하는 중…`, color: DIM, spin: true } });
    const out = await cloud.refresh({ reason: 'login' });
    if (!this.alive) return;
    this.readSlots();
    if (this.screen === 'profile') { const m = this.syncMsg(out); this.msg = { ...m, text: `${id} 님, 어서 오세요. ${m.text}` }; }
    if (out?.ok && out.localOnly?.length && this.game.top === this) {
      const list = out.localOnly.join(', ');
      this.game.push('frontConfirm', {
        title: '이 기기의 기록 올리기',
        message: `슬롯 ${list}의 기록은 이 기기에만 있습니다. 이 계정(클라우드)에 올릴까요? 올려 두면 다른 기기에서도 이어서 할 수 있습니다.`,
        yes: '올리기', no: '나중에', defaultYes: true,
        onYes: () => this.uploadLocal(out.localOnly),
      });
    }
  }
  async uploadLocal(slots) {
    this.setBusy(true, '클라우드에 올리는 중…');
    const r = await cloud.uploadSlots(slots);
    if (!this.alive) return;
    this.setBusy(false);
    this.readSlots();
    if (!cloud.loggedIn) { this.msg = { text: EXPIRED_MSG, color: WARN }; return; }
    if (r.ok && !r.conflicts.length) this.msg = { text: `슬롯 ${r.uploaded.join(', ')}의 기록을 클라우드에 올렸습니다.`, color: GOOD };
    else if (r.conflicts.length) this.msg = { text: `${slotsJosa(r.conflicts, '은', '는')} 클라우드 기록과 달라 올리지 않았습니다. 세이브 슬롯 화면에서 골라 주세요.`, color: WARN };
    else this.msg = { text: r.message ?? '올리지 못했습니다.', color: RED };
  }
  syncMsg(out) {
    if (!out?.ok) return { text: out?.message ?? '동기화하지 못했습니다.', color: RED, net: NET_ERR.has(out?.error) };
    const parts = [];
    if (out.downloaded.length) parts.push(`받음: 슬롯 ${out.downloaded.join(', ')}`);
    if (out.uploaded.length) parts.push(`올림: 슬롯 ${out.uploaded.join(', ')}`);
    if (out.deleted.length) parts.push(`클라우드에서 지움: 슬롯 ${out.deleted.join(', ')}`);
    if (out.conflicts.length) return { text: `${slotsJosa(out.conflicts, '은', '는')} 이 기기와 클라우드 기록이 서로 다릅니다. 세이브 슬롯 화면에서 남길 기록을 골라 주세요.`, color: WARN };
    if (out.failed.length) return { text: `${slotsJosa(out.failed, '을', '를')} 동기화하지 못했습니다. 잠시 후 다시 시도해 주세요.`, color: RED };
    if (out.held?.length) return { text: `${slotsJosa(out.held, '은', '는')} 지금 플레이 중이라 받지 않았습니다. 타이틀의 이어하기에서 받을 수 있습니다.`, color: WARN };
    return { text: parts.length ? `동기화를 마쳤습니다. (${parts.join(' · ')})` : '동기화를 마쳤습니다. 모든 기록이 최신입니다.', color: GOOD };
  }
  async doSync() {
    audio.sfx('menu_ok');
    this.setBusy(true, '클라우드와 동기화하는 중…');
    const out = await cloud.syncNow();
    if (!this.alive) return;
    this.setBusy(false);
    this.readSlots();
    if (this.screen === 'profile' && cloud.loggedIn) this.msg = this.syncMsg(out);
    else if (!cloud.loggedIn && this.screen !== 'login') this.show('login', { msg: { text: EXPIRED_MSG, color: WARN } });
  }
  /** 아직 클라우드에 올리지 못한 이 기기의 슬롯 (저장 뒤 2초 대기 중·올리는 중·연결이 끊겨 남은 것) */
  unsynced() {
    if (!cloud.loggedIn) return [];
    return SLOTS.filter((s) => {
      const data = saves.read(s);
      if (!data || data.arcade) return false;
      return cloud.pending(s) || !!cloud.rec(s)?.dirty;
    });
  }
  /** 기다리던 업로드를 바로 보내고 끝날 때까지(최대 ms) 기다린 뒤, 그래도 남은 슬롯 */
  async flushPending(ms = 6000) {
    try {
      cloud.flushTimers();
      await Promise.race([cloud.queue, new Promise((res) => setTimeout(res, ms))]);
    } catch (e) { console.error('[account] flush', e); }
    return this.unsynced();
  }
  confirmLogout() {
    audio.sfx('menu_ok');
    const pend = this.unsynced();
    const message = pend.length
      ? `${slotsJosa(pend, '은', '는')} 아직 클라우드에 올리지 못했습니다. 로그아웃하기 전에 먼저 올려 봅니다. 올리지 못해도 이 기기의 기록은 그대로 남습니다.`
      : '로그아웃할까요? 이 기기에 저장된 세이브는 그대로 남고, 다시 로그인하면 이어서 동기화됩니다.';
    this.game.push('frontConfirm', {
      title: '로그아웃', message, yes: '로그아웃', no: '취소',
      onYes: async () => {
        let left = [];
        if (pend.length) {
          this.setBusy(true, '로그아웃하기 전에 클라우드에 올리는 중…');
          left = await this.flushPending();
          if (!this.alive) return;
        }
        this.setBusy(true, '로그아웃하는 중…');
        const r = await cloud.logout();
        if (!this.alive) return;
        this.setBusy(false);
        // 서버에 닿지 못했으면 서버 쪽 로그인(토큰)은 만료될 때까지 남는다 — 그대로 알린다
        const base = r.remote
          ? { text: '로그아웃했습니다. 게스트로 계속 플레이할 수 있습니다.', color: GOOD }
          : { text: '이 기기에서 로그아웃했습니다. 서버에 닿지 못했으니 다른 기기에서 「모든 기기에서 로그아웃」을 해 두세요.', color: WARN };
        if (left.length) base.text += ` ${slotsJosa(left, '의', '의')} 최근 기록은 클라우드에 올리지 못했습니다. 이 기기에 남아 있으니 다시 로그인한 뒤 동기화하세요.`;
        if (left.length) base.color = WARN;
        this.show('home', { msg: base });
      },
    });
  }
  confirmLogoutAll() {
    audio.sfx('menu_ok');
    this.game.push('frontConfirm', {
      title: '모든 기기에서 로그아웃', danger: true, yes: '모두 로그아웃', no: '취소',
      message: '이 기기를 포함해 이 계정으로 로그인한 모든 기기(휴대폰·PC방 컴퓨터 등)에서 로그아웃합니다. 공용 기기에서 로그아웃을 잊었거나 기기를 잃어버렸을 때 쓰세요.',
      onYes: async () => {
        this.setBusy(true, '모든 기기에서 로그아웃하는 중…');
        const r = await cloud.logout({ all: true });
        if (!this.alive) return;
        this.setBusy(false);
        if (!r.ok) { this.fail(r.message ?? '로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
        this.show('home', { msg: { text: `모든 기기에서 로그아웃했습니다. (${Math.max(1, r.revoked ?? 1)}곳)`, color: GOOD } });
      },
    });
  }
  confirmDelete() {
    const pw = this.val('pw');
    const id = cloud.id;
    this.blurInputs();
    this.game.push('frontConfirm', {
      title: '계정 삭제', danger: true, yes: '영구 삭제', no: '취소',
      message: `'${id}' 계정과 클라우드에 보관한 모든 기록을 영구히 삭제합니다. 되돌릴 수 없습니다. 정말 삭제할까요?`,
      onYes: async () => {
        this.setBusy(true, '계정을 삭제하는 중…');
        const r = await cloud.deleteAccount(pw);
        if (!this.alive) return;
        this.setBusy(false);
        if (!r.ok) {
          if (r.error === 'unauthorized' && !cloud.loggedIn) return; // 만료 → cloud:logout 이 로그인 화면으로
          this.fail(r.message ?? '삭제하지 못했습니다.', r.error === 'wrong_password' ? 'pw' : null);
          return;
        }
        audio.sfx('break_wall');
        this.values = {};
        this.show('home', { msg: { text: '계정을 삭제했습니다. 이 기기에 저장된 세이브는 그대로 남아 있습니다.', color: GOOD } });
      },
    });
  }
  showCode(code, next, note = '') {
    this.code = String(code ?? '');
    this.codeNext = next;
    this.codeNote = note;
    this.show('code');
  }
  async copyCode() {
    audio.sfx('menu_ok');
    let ok = false;
    try { await navigator.clipboard.writeText(this.code); ok = true; } catch { /* 권한 없음 */ }
    if (!ok) {
      const el = this.inputs[0];
      try { el.focus(); el.select(); el.setSelectionRange(0, 64); ok = document.execCommand('copy'); } catch { /* 무시 */ }
    }
    this.msg = ok
      ? { text: '복구 코드를 복사했습니다. 메모 앱 등 안전한 곳에 붙여 넣어 보관하세요.', color: INFO }
      : { text: '자동 복사가 되지 않습니다. 코드를 길게 눌러 직접 복사하거나 종이에 적어 두세요.', color: '#ffd890' };
  }
  confirmCode() {
    if (this.st < 3) { audio.sfx('menu_cancel'); this.msg = { text: '복구 코드를 먼저 적어 두세요. 잠시 뒤에 넘어갈 수 있습니다.', color: '#ffd890' }; return; }
    this.blurInputs();
    this.game.push('frontConfirm', {
      title: '복구 코드를 적어 두셨나요?',
      message: '이 화면을 닫으면 복구 코드를 다시 볼 수 없습니다. 비밀번호를 잊었을 때 이 코드가 없으면 계정을 되찾을 수 없습니다.',
      yes: '적어 두었습니다', no: '다시 보기',
      onYes: () => { this.code = null; this.show(this.codeNext, { msg: { text: '가입과 로그인이 끝났습니다. 이 기기의 기록은 자동으로 클라우드에 보관됩니다.', color: GOOD } }); },
    });
  }
  /** 프로필 화면의 슬롯별 상태를 다시 읽는다 */
  readSlots() {
    if (!cloud.loggedIn) { this.slotRows = []; return; }
    const list = saves.list();
    this.slotRows = SLOTS.map((slot) => {
      const info = cloud.slotInfo(slot);
      const l = list.find((x) => x.slot === slot);
      const c = info.cloud;
      const who = l && !l.empty ? summaryLine({ charId: l.charId, level: l.level, chapter: l.chapter }) : c && !c.empty && c.summary ? `클라우드: ${summaryLine(c.summary)}` : '비어 있음';
      return { slot, status: info.busy ? 'pending' : info.status, who };
    });
  }

  // ───────────────────────── 안내 상자 ─────────────────────────
  /** 게임패드 사용 중 입력 화면이면 P-29 안내 문구 */
  padNote() {
    if (input.mode !== 'pad' || this.def?.kind !== 'form') return null;
    return this.screen === 'recover' ? P29_CODE : P29_TEXT;
  }
  /** 로그인한 계정의 연결 상태 안내 (오프라인·서버 연결 안 됨·확인 중·충돌) */
  statusNote() {
    if (!cloud.loggedIn) return null;
    const s = cloud.state;
    if (s === 'offline') return { text: '오프라인입니다. 이 기기에는 그대로 저장되고, 인터넷에 다시 연결되면 자동으로 동기화합니다.', color: WARN, net: true };
    if (s === 'unavailable') return { text: '계정 서버에 연결할 수 없습니다. 이 기기에는 그대로 저장됩니다. 잠시 후 「지금 동기화」로 다시 시도해 주세요.', color: WARN, net: true };
    if (!cloud.verified && (s === 'checking' || s === 'unknown')) return { text: '로그인 상태를 확인하는 중…', color: DIM, spin: true };
    const n = this.slotRows.filter((r) => r.status === 'conflict').length;
    if (n) return { text: `충돌 ${n}개 — 이 기기와 클라우드 기록이 다릅니다. 세이브 슬롯 화면에서 남길 기록을 고르세요.`, color: '#ff9a9a' };
    return null;
  }
  /**
   * 안내 상자들을 위에서부터 그린다 (색 띠 + 줄바꿈, 상자마다 최대 lines 줄). 반환: 끝 y
   * notes: [{text, color, spin, flash}]
   */
  drawNotes(ctx, notes, x, y, w, t, { align = 'left', lines = 4, size = 13 } = {}) {
    const lh = Math.round(size * 1.4);
    for (const n of notes) {
      if (!n?.text) continue;
      const tw = w - 22 - (n.spin ? 18 : 0);
      const ls = wrap(ctx, n.text, tw, size, 700).slice(0, lines);
      const h = ls.length * lh + 12;
      const col = n.color ?? BONE;
      ctx.save();
      const fl = n.flash ? 0.5 + 0.5 * Math.sin(t * 14) : 0;
      ctx.fillStyle = rgba(col.length === 7 ? col : GOLD, 0.1 + 0.12 * fl); ctx.fillRect(x, y, w, h);
      ctx.fillStyle = col; ctx.fillRect(x, y, 3, h);
      ctx.strokeStyle = rgba(col.length === 7 ? col : GOLD, 0.35 + 0.4 * fl); ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      let tx = x + 12;
      if (n.spin) { spinner(ctx, x + 18, y + 6 + lh / 2, 6.5, t); tx += 18; }
      ls.forEach((l, i) => {
        const yy = y + 6 + i * lh + Math.round(lh * 0.72);
        if (align === 'center') text(ctx, l, x + w / 2 + (n.spin ? 9 : 0), yy, { size, align: 'center', weight: 700, color: col, ow: 2 });
        else text(ctx, l, tx, yy, { size, weight: 700, color: col, ow: 2 });
      });
      ctx.restore();
      y += h + 8;
    }
    return y;
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx) {
    const g = this.game, t = g.time;
    const G = this.geom(), d = this.def;
    const W = G.W, H = G.H;
    kenBurns(ctx, assets.get('bg/title'), W, H, t, { z0: 1.06, z1: 1.12, period: 70, oy: 0.4 });
    ctx.fillStyle = 'rgba(6,2,10,0.7)'; ctx.fillRect(0, 0, W, H);
    shade(ctx, W, H, { top: 0.6, bottom: 0.8, vig: 0.8 });
    this.amb.draw(ctx, W, H, 'back', t);
    this.amb.draw(ctx, W, H, 'front', t);
    const ap = ease.outCubic(clamp(this.st / 0.35, 0, 1));
    const cx = G.sl + (W - G.sl - G.sr) / 2;
    heading(ctx, cx, 36 + G.st, 'ACCOUNT', null, { size: 26, alpha: ap });
    // 오른쪽 위: 로그인 상태
    const ab = accountBadge();
    drawCloudBadge(ctx, W - 16 - G.sr, 28 + G.st, ab.status, t, { size: 13, label: ab.label });
    // 왼쪽 위: 뒤로 (폼에서는 목록으로, 목록에서는 장면을 떠난다)
    const bb = { x: 12 + G.sl, y: 8 + G.st, w: 96, h: 44 };
    gbutton(ctx, bb, '뒤로', { size: 15, icon: '◀', disabled: this.busy });
    if (!this.busy) taps.add('hdrBack', bb, { owner: this, kind: 'primary', src: 'account.back' });

    ctx.save();
    ctx.globalAlpha = ap;
    frame(ctx, G.x0, G.y0, G.PW, G.PH, { glow: 0.5, accent: d.danger ? '#ff5a6a' : GOLD });
    if (d.kind === 'form' || d.kind === 'list') {
      // 두 칸 사이 구분선
      ctx.fillStyle = 'rgba(232,200,114,0.18)'; ctx.fillRect(G.x0 + G.LW - 6, G.y0 + 20, 1, G.PH - 40);
    }
    switch (d.kind) {
      case 'list': this.drawList(ctx, G, t); break;
      case 'form': this.drawForm(ctx, G, t); break;
      case 'code': this.drawCode(ctx, G, t); break;
      case 'notice': this.drawNotice(ctx, G, t); break;
      default: this.drawWait(ctx, G, t);
    }
    // 버튼 (목록 화면은 drawList 에서)
    if (d.kind !== 'list') {
      this.items.forEach((it, i) => {
        if (it.kind === 'btn') this.drawButton(ctx, it, i, G);
        else if (it.kind === 'check') this.drawCheck(ctx, it, i, G);
      });
    }
    ctx.restore();
    this.drawFooter(ctx, G);
  }
  /** 아래 안내 줄: 지금 기기의 글리프 (입력 칸에서 타이핑 중이면 키보드 키캡, 터치는 문구) */
  drawFooter(ctx, G) {
    const W = G.W, H = G.H, y = H - 11 - G.sb, cx = G.sl + (W - G.sl - G.sr) / 2;
    ctx.save();
    const gr = ctx.createLinearGradient(0, H - 34 - G.sb, 0, H);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = gr; ctx.fillRect(0, H - 34 - G.sb, W, 34 + G.sb);
    ctx.restore();
    const m = promptMode(), df = this.domFocus(), kind = this.def?.kind;
    if (m === 'touch') {
      const tip = df >= 0 ? '화면 키보드의 「다음」·「완료」로 다음 칸으로 넘어갑니다'
        : kind === 'form' ? '입력 칸을 눌러 입력하고, 아래 버튼을 누르세요' : kind === 'wait' ? '' : '항목을 누르세요';
      if (tip) text(ctx, tip, cx, y, { size: 13, align: 'center', color: '#b8aa98', ow: 2 });
      return;
    }
    let items;
    if (df >= 0 && m === 'kb' && !this.inputs[df]?.readOnly) {
      const last = df === this.inputs.length - 1;
      items = [['ENTER', last ? '확인' : '다음 칸'], ['Esc', '뒤로'], ['↑↓', '칸 이동']];
      drawHints(ctx, items, cx, y, { align: 'center', size: 13, color: '#b8aa98', mode: 'kb' });
      return;
    }
    if (kind === 'wait') items = [['cancel', '뒤로']];
    else if (kind === 'list') items = [['dpadV', '선택'], ['confirm', '결정'], ['cancel', '뒤로']];
    else if (kind === 'form') items = [['dpad', '이동'], ['confirm', '결정'], ['cancel', '뒤로']];
    else items = [['dpadH', '선택'], ['confirm', '결정'], ['cancel', '뒤로']];
    drawHints(ctx, items, cx, y, { align: 'center', size: 13, color: '#b8aa98' });
  }
  title(ctx, G, str, x = G.L.x, color = '#ffe7a0', w = G.L.w) {
    const compact = G.PH < 340;
    text(ctx, str, x, G.y0 + (compact ? 32 : 38), { size: compact ? 19 : 21, weight: 800, family: FONT.title, color, ow: 3, maxWidth: w });
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(232,200,114,0.8)'); g.addColorStop(1, 'rgba(232,200,114,0)');
    ctx.fillStyle = g; ctx.fillRect(x, G.y0 + (compact ? 40 : 48), w, 1.5);
  }
  drawButton(ctx, it, i, G) {
    const r = this.itemRect(it, G);
    const sel = this.focus === i && this.domFocus() < 0 && !this.busy;
    const waiting = it.id === 'done' && this.st < 3;
    const label = waiting ? `${it.label} (${Math.ceil(3 - this.st)})` : it.label;
    const acc = it.danger ? '#ff4a5a' : it.link ? '#9fd8ff' : GOLD;
    const off = this.busy || waiting;
    gbutton(ctx, r, label, { selected: sel, disabled: off, size: it.link ? 14 : 16, accent: acc });
    // 기다리는 중인 '적어 두었습니다' 도 누르면 안내가 나오도록 영역은 남긴다
    if (!this.busy) taps.add(it.id, r, { owner: this, kind: 'primary', src: 'account.btn' });
  }
  /** '로그인 유지' 칸 (캔버스에 그리는 체크 상자 — 키보드·게임패드·터치로 켜고 끔) */
  drawCheck(ctx, it, i, G) {
    const r = this.itemRect(it, G);
    const sel = this.focus === i && this.domFocus() < 0 && !this.busy;
    const on = !!this.remember;
    const cy = r.y + r.h / 2;
    text(ctx, it.label, G.L.x, cy + 5, { size: 14, weight: 800, color: sel ? '#fff2cc' : BONE, ow: 2, maxWidth: G.lab - 8 });
    ctx.save();
    const bx = r.x, by = cy - 12;
    ctx.fillStyle = 'rgba(10,4,12,0.9)'; ctx.fillRect(bx, by, 24, 24);
    ctx.strokeStyle = sel ? GOLD : 'rgba(232,200,114,0.55)'; ctx.lineWidth = sel ? 2 : 1; ctx.strokeRect(bx + 0.5, by + 0.5, 23, 23);
    if (on) {
      ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(bx + 5.5, by + 12); ctx.lineTo(bx + 10, by + 17); ctx.lineTo(bx + 18.5, by + 6.5); ctx.stroke();
    }
    if (sel) { ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(bx - 12, cy - 6); ctx.lineTo(bx - 5, cy); ctx.lineTo(bx - 12, cy + 6); ctx.fill(); }
    ctx.restore();
    text(ctx, on ? '켬 · 이 기기에 30일 동안 유지' : '끔 · 창을 닫으면 로그아웃', bx + 34, cy + 5, { size: 13, weight: 700, color: on ? '#ffe7a0' : DIM, ow: 2, maxWidth: r.w - 34 });
    if (!this.busy) taps.add(it.id, { x: G.L.x, y: r.y, w: G.L.w, h: r.h }, { owner: this, kind: 'list', src: 'account.check' });
  }
  /** 오른쪽 칸 안내 문구. yMax 를 넘는 항목은 생략한다. 반환: 끝 y */
  drawInfo(ctx, G, lines, y, yMax = G.y0 + G.PH - 14) {
    const x = G.R.x + 14, w = G.R.w - 20;
    for (const l of lines) {
      if (l.h) {
        if (y + 6 > yMax) break;
        text(ctx, l.h, x, y + 12, { size: 16, weight: 800, family: FONT.title, color: l.c ?? GOLD, ow: 3, maxWidth: w });
        y += 28; continue;
      }
      const indent = l.b ? 14 : 0;
      const ls = wrap(ctx, l.b ?? l.t, w - indent, 13, 500);
      if (y + ls.length * 19 > yMax) break;
      if (l.b) { ctx.fillStyle = l.c ?? GOLD; ctx.save(); ctx.translate(x + 4, y + 9); ctx.rotate(Math.PI / 4); ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore(); }
      ls.forEach((s, k) => text(ctx, s, x + indent, y + 13 + k * 19, { size: 13, color: l.c ?? BONE, ow: 2 }));
      y += ls.length * 19 + 7;
    }
    return y;
  }
  /** 목록 한 줄: 선택 띠 + 한글 이름 + 오른쪽 작은 영문 부제 */
  drawRow(ctx, r, it, sel, off) {
    const hot = (sel || (hovered(r) && !off)) && !off;
    const accent = it.danger ? '#c0102a' : CRIMSON;
    ctx.save();
    if (hot) {
      const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
      g.addColorStop(0, rgba(accent, 0.85)); g.addColorStop(0.7, rgba(accent, 0.25)); g.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = g; ctx.fillRect(r.x, r.y + 2, r.w, r.h - 4);
      ctx.fillStyle = rgba(GOLD, 0.8); ctx.fillRect(r.x, r.y + 2, r.w * 0.7, 1); ctx.fillRect(r.x, r.y + r.h - 3, r.w * 0.5, 1);
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.moveTo(r.x + 8, r.y + r.h / 2 - 6); ctx.lineTo(r.x + 16, r.y + r.h / 2); ctx.lineTo(r.x + 8, r.y + r.h / 2 + 6); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(r.x, r.y + 2, r.w, r.h - 4);
    }
    const size = r.h >= 46 ? 20 : 18;
    const col = off ? '#6a5e5e' : it.danger ? (hot ? '#ffd0d0' : '#ff9a9a') : hot ? '#fff6dc' : BONE;
    if (hot) { ctx.shadowColor = 'rgba(255,190,110,0.7)'; ctx.shadowBlur = 12; }
    text(ctx, it.label, r.x + 28 + (hot ? 6 : 0), r.y + r.h / 2 + size * 0.36, { size, weight: 800, family: FONT.title, color: col, ow: 3, maxWidth: r.w - 130 });
    ctx.shadowBlur = 0;
    if (it.sub) text(ctx, it.sub, r.x + r.w - 10, r.y + r.h / 2 + 4, { size: 11, align: 'right', weight: 700, family: FONT.num, color: off ? '#4a4244' : hot ? GOLD : DIM, ow: 2 });
    ctx.restore();
  }
  drawList(ctx, G, t) {
    const d = this.def;
    this.title(ctx, G, d.title);
    this.items.forEach((it, i) => {
      const r = this.itemRect(it, G);
      const off = this.busy && it.id !== 'back';
      this.drawRow(ctx, r, it, this.focus === i && !this.busy, off);
      if (!this.busy) taps.add(it.id, r, { owner: this, kind: 'list', src: 'account.row' });
    });
    const x = G.R.x + 8, w = G.R.w - 4;
    // 연결 실패 알림과 연결 상태 안내가 같은 내용이면 (오프라인·서버 연결 안 됨) 더 자세한 상태 안내 하나만
    const sn = this.statusNote();
    let y = this.drawNotes(ctx, this.msg?.net && sn?.net ? [sn] : [this.msg, sn], x, G.y0 + 16, w, t);
    if (this.screen === 'home') this.drawInfo(ctx, G, INFO_TEXT.home, y + 2);
    else this.drawProfile(ctx, G, t, y);
  }
  drawProfile(ctx, G, t, y0) {
    const x = G.R.x + 14, w = G.R.w - 20, yMax = G.y0 + G.PH - 12;
    let y = y0 + 2;
    text(ctx, '로그인한 계정', x, y + 10, { size: 12, weight: 700, color: DIM, ow: 2 });
    drawCloudIcon(ctx, x + 14, y + 32, 26, accountBadge().status, t);
    text(ctx, cloud.id ?? '', x + 36, y + 40, { size: 22, weight: 900, family: FONT.title, color: GOLD, ow: 3, maxWidth: w - 40 });
    y += 54;
    ctx.fillStyle = 'rgba(232,200,114,0.2)'; ctx.fillRect(x, y, w, 1);
    y += 4;
    // 슬롯별 상태 (가장 중요) → 해금·명예의 전당 → 계정 정보
    const rowH = 24;
    for (const r of this.slotRows) {
      if (y + rowH > yMax) break;
      text(ctx, `슬롯 ${r.slot}`, x, y + 16, { size: 13, weight: 800, family: FONT.num, color: BONE, ow: 2 });
      drawCloudBadge(ctx, x + w, y + 12, r.status, t, { size: 12 });
      text(ctx, r.who, x + 52, y + 16, { size: 12, color: DIM, ow: 2, maxWidth: Math.max(40, w - 52 - 96) });
      y += rowH;
    }
    if (this.slotRows.length && y + rowH <= yMax) {
      const ms = cloud.metaView?.status === 'synced' ? 'synced' : cloud.metaView?.status === 'error' ? 'error' : 'unknown';
      text(ctx, '해금·명예의 전당', x, y + 16, { size: 13, weight: 800, color: BONE, ow: 2 });
      drawCloudBadge(ctx, x + w, y + 12, ms, t, { size: 12, label: ms === 'synced' ? '합쳐서 보관됨' : ms === 'error' ? '오류' : '확인 전' });
      y += rowH;
    }
    y += 6;
    const rows = [];
    rows.push(['마지막 동기화', cloud.lastSync ? fmtDate(cloud.lastSync) : '-']);
    rows.push(['로그인 유지', cloud.auth?.remember ? '켬 (30일)' : '끔 (창을 닫으면 로그아웃)']);
    const st = cloud.state === 'ready' ? '연결됨' : cloud.state === 'offline' ? '오프라인' : cloud.state === 'unavailable' ? '서버에 연결할 수 없음' : '확인 중';
    rows.push(['서버 연결', st]);
    if (cloud.createdAt) rows.push(['가입일', fmtDate(cloud.createdAt)]);
    for (const [k, v] of rows) {
      if (y + 20 > yMax) break;
      text(ctx, k, x, y + 14, { size: 13, weight: 600, color: DIM, ow: 2 });
      text(ctx, v, x + w, y + 14, { size: 13, align: 'right', weight: 800, color: BONE, ow: 2, maxWidth: w - 96 });
      y += 20;
    }
  }
  drawForm(ctx, G, t) {
    const d = this.def;
    this.title(ctx, G, d.title, G.L.x, d.danger ? '#ff9a9a' : '#ffe7a0');
    const df = this.domFocus();
    d.fields.forEach((f, i) => {
      const r = this.fieldRect(i, G);
      const on = df === i || (this.items[this.focus]?.kind === 'field' && this.items[this.focus].fi === i);
      text(ctx, f.label, G.L.x, r.y + r.h / 2 + 5, { size: 14, weight: 800, color: on ? '#fff2cc' : BONE, ow: 2, maxWidth: G.lab - 8 });
      // 입력 칸 뒤 받침 (DOM 칸이 늦게 뜨는 순간에도 자리가 보이게)
      ctx.fillStyle = 'rgba(10,4,12,0.9)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = on ? GOLD : 'rgba(232,200,114,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      if (on && df !== i) { ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(r.x - 12, r.y + r.h / 2 - 6); ctx.lineTo(r.x - 5, r.y + r.h / 2); ctx.lineTo(r.x - 12, r.y + r.h / 2 + 6); ctx.fill(); }
    });
    // 오른쪽: 알림(오류·진행) → P-29 패드 안내 → 규칙
    const F = this.formLayout(G);
    const x = G.R.x + 8, w = G.R.w - 4;
    const pn = this.padNote();
    let y = this.drawNotes(ctx, [this.msg, pn && { text: pn, color: INFO, flash: this.padFlash > 0 }], x, G.y0 + 16, w, t);
    const yMax = d.extra ? F.btnY - 10 : G.y0 + G.PH - 14;
    this.drawInfo(ctx, G, INFO_TEXT[this.screen] ?? [], y + 2, yMax);
  }
  drawCode(ctx, G, t) {
    const cx = G.x0 + G.PW / 2, C = this.codeLayout(G);
    const y0 = G.y0;
    if (this.codeNote) text(ctx, this.codeNote, G.x0 + 22, y0 + 24, { size: 13, weight: 800, color: GOOD, ow: 2, maxWidth: G.PW / 2 - 40 });
    text(ctx, '복구 코드', cx, y0 + (C.compact ? 34 : 42), { size: 22, align: 'center', weight: 800, family: FONT.title, color: '#ffe7a0', ow: 3 });
    ornament(ctx, cx, y0 + (C.compact ? 46 : 58), 300);
    text(ctx, '이 코드는 지금 한 번만 보여 드립니다', cx, y0 + (C.compact ? 70 : 90), { size: 16, align: 'center', weight: 800, color: '#ff9a9a', ow: 3, maxWidth: G.PW - 40 });
    text(ctx, '비밀번호를 잊었을 때 이 코드로만 계정을 되찾을 수 있습니다.', cx, y0 + (C.compact ? 92 : 116), { size: 13, align: 'center', color: BONE, ow: 2, maxWidth: G.PW - 40 });
    const r = this.fieldRect(0, G);
    ctx.fillStyle = 'rgba(10,4,12,0.95)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (!this.inputs.length) text(ctx, this.code ?? '', cx, r.y + r.h / 2 + 9, { size: 26, align: 'center', weight: 800, family: FONT.num, color: '#ffe7a0' });
    const notes = [
      '종이에 적거나 안전한 곳(비밀번호 관리자·메모 앱 등)에 보관하세요.',
      '다른 사람에게 알려 주지 마세요. 코드를 아는 사람은 비밀번호를 바꿀 수 있습니다.',
      '코드를 쓰고 나면 새 코드가 나오고, 쓴 코드는 더 이상 쓸 수 없습니다.',
    ];
    const btnY = G.y0 + G.PH - 16 - G.btnH;
    let y = r.y + r.h + (C.compact ? 24 : 30);
    // 알림(복사 결과 등)이 있으면 버튼 바로 위에 두고, 주의 사항은 남는 자리만큼
    const mh = this.msg ? 44 : 0;
    notes.forEach((s, i) => {
      if (y > btnY - 10 - mh) return;
      text(ctx, `· ${s}`, cx, y, { size: 13, align: 'center', color: i === 1 ? '#ffd0a0' : BONE, ow: 2, maxWidth: G.PW - 50 });
      y += 20;
    });
    if (this.msg) { const bw = Math.min(560, G.PW - 60); this.drawNotes(ctx, [this.msg], cx - bw / 2, btnY - 10 - 36, bw, t, { align: 'center', lines: 2 }); }
  }
  drawNotice(ctx, G, t) {
    const cx = G.x0 + G.PW / 2, st = cloud.state;
    const blocked = st === 'blocked', offline = st === 'offline';
    const compact = G.PH < 380;
    const iconS = compact ? 40 : 54;
    let y = G.y0 + (compact ? 36 : 54);
    drawCloudIcon(ctx, cx, y, iconS, blocked ? 'blocked' : 'offline', t);
    y += compact ? 46 : 58;
    const title = blocked ? '여기서는 계정 기능을 쓸 수 없습니다' : offline ? '인터넷에 연결되어 있지 않습니다' : '계정 서버에 연결할 수 없습니다';
    text(ctx, title, cx, y, { size: compact ? 19 : 21, align: 'center', weight: 800, family: FONT.title, color: '#ffe7a0', ow: 3, maxWidth: G.PW - 40 });
    ornament(ctx, cx, y + 14, 320);
    y += compact ? 40 : 46;
    const body = blocked
      ? ['계정과 클라우드 저장은 블러드 녹턴 공식 사이트와 안드로이드 앱에서 사용할 수 있습니다.']
      : offline
        ? ['연결을 확인한 뒤 「다시 확인」을 눌러 주세요. 연결되면 저절로 다시 확인합니다.', '계정과 클라우드 저장은 공식 사이트와 안드로이드 앱에서 사용할 수 있습니다.']
        : ['서버가 잠시 응답하지 않는 것일 수 있습니다. 잠시 후 「다시 확인」을 눌러 주세요.', '계정과 클라우드 저장은 블러드 녹턴 공식 사이트와 안드로이드 앱에서 사용할 수 있습니다.'];
    const btnY = G.y0 + G.PH - 16 - G.btnH;
    const fs = compact ? 14 : 15, lh = compact ? 20 : 23;
    for (const s of body) {
      for (const l of wrap(ctx, s, G.PW - 80, fs, 500)) {
        if (y > btnY - 20) break;
        text(ctx, l, cx, y, { size: fs, align: 'center', color: BONE, ow: 2 }); y += lh;
      }
      y += 4;
    }
    // 이 기기 저장은 그대로 (자리가 되면 상자, 모자라면 한 줄)
    const boxH = 54, room = btnY - 12 - y;
    if (room >= boxH + 4) {
      const box = { x: G.x0 + 50, y: y + Math.min(8, room - boxH - 4), w: G.PW - 100, h: boxH };
      ctx.fillStyle = 'rgba(126,224,126,0.08)'; ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = 'rgba(126,224,126,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
      text(ctx, '이 기기의 저장은 그대로 쓸 수 있습니다', cx, box.y + 22, { size: 14, align: 'center', weight: 800, color: '#a8f0b0', ow: 2, maxWidth: box.w - 20 });
      text(ctx, '세이브 슬롯 1~3, 해금, 명예의 전당 기록은 평소처럼 이 기기에 저장됩니다.', cx, box.y + 42, { size: 13, align: 'center', color: BONE, ow: 2, maxWidth: box.w - 20 });
    } else if (room >= 18) {
      text(ctx, '이 기기의 저장(세이브 슬롯·해금·기록)은 그대로 쓸 수 있습니다.', cx, y + 14, { size: 13, align: 'center', weight: 800, color: '#a8f0b0', ow: 2, maxWidth: G.PW - 60 });
    }
    if (this.msg) { const bw = Math.min(560, G.PW - 60); this.drawNotes(ctx, [this.msg], cx - bw / 2, btnY - 10 - 36, bw, t, { align: 'center', lines: 2 }); }
  }
  drawWait(ctx, G, t) {
    const cx = G.x0 + G.PW / 2, my = G.y0 + (G.PH - G.btnH - 16) / 2;
    spinner(ctx, cx, my - 30, 22, t);
    text(ctx, '계정 서버에 연결하는 중…', cx, my + 26, { size: 18, align: 'center', weight: 800, family: FONT.title, color: '#ffe7a0', ow: 3 });
    text(ctx, '잠시만 기다려 주세요.', cx, my + 50, { size: 13, align: 'center', color: DIM, ow: 2 });
  }
}
