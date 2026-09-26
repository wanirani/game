// 계정 화면: 로그인 · 회원가입(복구 코드 1회 표시) · 비밀번호 변경 · 복구 코드로 재설정 · 로그아웃 · 계정 삭제 · 지금 동기화
// 캔버스 게임이지만 글자 입력은 실제 <input> 을 캔버스 패널 위에 겹쳐 띄운다 (모바일 키보드·비밀번호 관리자 지원).
//  - 화면(장면 안의 단계)이 바뀔 때 만들고 지우며, 매 프레임(requestAnimationFrame) 캔버스 크기·위치에 맞춰 옮긴다
//  - 입력 칸에서: Enter = 다음 칸/제출 · Esc = 뒤로 · ↑↓·Tab = 칸 이동 (input.js 는 입력 칸의 키를 게임 키로 쓰지 않는다)
//  - 버튼에서: ↑↓←→ 이동 · Z/Enter 결정 · X/Esc 뒤로 (키보드·게임패드), 터치는 누르면 바로 실행
// go('account', { backIndex }) → 뒤로 = 타이틀 메뉴 / push('account', { overlay:true, screen }) → 뒤로 = pop
// 서버를 쓸 수 없는 환경(claude.ai 임베드·API 없는 서버·오프라인)에서는 안내만 보여 준다 (이 기기 저장은 그대로 동작)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { bus } from '../../core/events.js';
import { cloud, checkId, checkPassword, checkRecoveryCode, SLOTS } from '../../core/cloud.js';
import { text, wrap, FONT } from '../../core/ui.js';
import { clamp, ease } from '../../core/math.js';
import {
  Ambience, kenBurns, shade, frame, heading, ornament, gbutton, menuItem, backButton, footer, setPad, fmtDate,
  TapZones, GOLD, BONE, DIM, CRIMSON,
} from './common.js';
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
const F_CODE = { key: 'code', label: '복구 코드', type: 'text', ac: 'off', name: 'recovery-code', ph: 'XXXX-XXXX-XXXX-XXXX', max: 40 };

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
      { id: 'password', label: '비밀번호 변경', sub: 'CHANGE PASSWORD' },
      { id: 'logout', label: '로그아웃', sub: 'LOG OUT' },
      { id: 'delete', label: '계정 삭제', sub: 'DELETE ACCOUNT', danger: true },
      { id: 'back', label: '돌아가기', sub: 'BACK' },
    ],
  },
  login: { kind: 'form', title: '로그인', fields: [F_ID, F_PW], submit: '로그인', extra: { id: 'forgot', label: '비밀번호를 잊었나요?' } },
  signup: { kind: 'form', title: '회원가입', fields: [F_ID, F_NEW, F_NEW2], submit: '가입하기' },
  password: { kind: 'form', title: '비밀번호 변경', fields: [F_OLD, { ...F_NEW, label: '새 비밀번호' }, { ...F_NEW2, label: '새 비밀번호 확인' }], submit: '변경하기', hiddenUser: true },
  recover: { kind: 'form', title: '복구 코드로 재설정', fields: [F_ID, F_CODE, { ...F_NEW, label: '새 비밀번호' }, { ...F_NEW2, label: '새 비밀번호 확인' }], submit: '재설정하기' },
  delete: { kind: 'form', title: '계정 삭제', fields: [{ ...F_PW, label: '비밀번호', ph: '확인을 위해 입력' }], submit: '계정 삭제', danger: true, hiddenUser: true },
  code: { kind: 'code', title: '복구 코드' },
};
const LOGGED_IN = new Set(['profile', 'password', 'delete']);
const GUEST = new Set(['home', 'login', 'signup', 'recover']);
const RED = '#ff8a8a', GOOD = '#9fe8b0', INFO = '#9fd8ff';

// 오른쪽 안내 문구 (h: 소제목, b: 글머리, t: 문장, c: 색)
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
    { b: '비밀번호를 5번 틀리면 10분 동안 로그인할 수 없습니다.' },
    { b: '비밀번호를 잊었다면 가입할 때 받은 복구 코드로 새 비밀번호를 정할 수 있습니다.' },
  ],
  signup: [
    { h: '만들기 규칙' },
    RULES_ID, RULES_PW,
    { b: '가입이 끝나면 복구 코드를 한 번만 보여 드립니다. 비밀번호를 잊었을 때 꼭 필요하니 적어 두세요.' },
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
  invalid_id: 'id', reserved_id: 'id', id_taken: 'id', invalid_password: 'pw', password_same_as_id: 'pw', same_password: 'pw',
  invalid_credentials: 'pw', wrong_password: 'old', invalid_recovery: 'code',
};

export class AccountScene extends Scene {
  enter(params = {}) {
    setPad(false);
    ensureStyle();
    this.overlay = !!params.overlay;
    this.backIndex = params.backIndex ?? 4;
    this.toastY = 88; // 제목 장식과 패널 사이
    this.amb = new Ambience({ embers: 36, motes: 18, bats: 4, lightning: false });
    this.taps = new TapZones();
    this.inputs = []; this.form = null; this.values = {};
    this.items = []; this.focus = 0;
    this.busy = false; this.msg = null; this.shakeT = 0;
    this.alive = true; this.leaving = false;
    this.code = null; this.codeNext = 'profile';
    this.infoT = 0; this.slotRows = [];
    this.offs = [
      bus.on('cloud:logout', (e) => {
        if (!this.alive || e?.reason !== 'expired' || !LOGGED_IN.has(this.screen)) return;
        this.show('login', { msg: { text: '로그인이 만료되었습니다. 다시 로그인해 주세요.', color: '#ffb070' } });
      }),
      bus.on('cloud:sync', (e) => { if (this.alive && e?.phase === 'done') this.readSlots(); }),
    ];
    const tick = () => { if (!this.alive) return; this.place(); this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
    this.start(params.screen);
  }
  exit() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.removeFields();
    for (const off of this.offs ?? []) off();
    setPad(true);
  }
  onResume() { setPad(false); this.readSlots(); }
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
      this.show(ok ? (GUEST.has(want) ? want : 'home') : 'unavailable');
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
    this.st = 0; this.msg = msg; this.busy = false;
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
      const r = d.fields.length;
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
      el.setAttribute('autocapitalize', 'off');
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
  blurInputs() { const a = document.activeElement; if (a && this.inputs.includes(a)) a.blur(); }
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

  /** 입력 칸을 캔버스 위 제자리로 옮긴다 (매 프레임). 이 장면이 맨 위가 아니거나 떠나는 중이면 숨긴다 */
  place() {
    const els = this.inputs;
    if (!els.length) return;
    const g = this.game, cv = g.canvas;
    if (!cv) return;
    const visible = this.alive && !this.leaving && g.top === this && !(g.portrait && input.touchMode);
    const R = cv.getBoundingClientRect();
    const sx = R.width / g.viewW, sy = R.height / g.viewH;
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
      const fs = Math.max(16, Math.round((code ? 26 : 17) * sy));
      const css = `${Math.round(R.left + r.x * sx)}|${Math.round(R.top + r.y * sy)}|${Math.round(r.w * sx)}|${Math.round(r.h * sy)}|${fs}|${a.toFixed(2)}`;
      if (el._css === css && el.style.visibility === 'visible') return;
      el._css = css;
      const [l, t, w, h] = css.split('|');
      Object.assign(el.style, { left: `${l}px`, top: `${t}px`, width: `${w}px`, height: `${h}px`, fontSize: `${fs}px`, opacity: a.toFixed(2), visibility: 'visible' });
    });
  }

  // ───────────────────────── 배치 ─────────────────────────
  geom() {
    const g = this.game, vw = g.viewW;
    const kind = this.def?.kind;
    const single = kind === 'wait' || kind === 'notice' || kind === 'code';
    const W = single ? Math.min(700, vw - 80) : Math.min(880, vw - 60), H = 404;
    const sh = this.shakeT > 0 ? Math.sin(this.shakeT * 70) * 7 * (this.shakeT / 0.35) : 0;
    const x0 = Math.round(vw / 2 - W / 2 + sh), y0 = 96;
    const LW = single ? W : Math.round(W * 0.55);
    return { x0, y0, W, H, LW, L: { x: x0 + 28, w: LW - 48 }, R: { x: x0 + LW + 6, w: W - LW - 32 }, lab: 118 };
  }
  fieldRect(fi, G = this.geom()) {
    const d = this.def;
    if (d.kind === 'code') return { x: this.game.viewW / 2 - 220 + (G.x0 - Math.round(this.game.viewW / 2 - G.W / 2)), y: G.y0 + 132, w: 440, h: 62 };
    if (d.kind !== 'form') return null;
    return { x: G.L.x + G.lab, y: G.y0 + 74 + fi * 52, w: G.L.w - G.lab, h: 40 };
  }
  itemRect(it, G = this.geom()) {
    const d = this.def;
    if (it.kind === 'field') return this.fieldRect(it.fi, G);
    if (d.kind === 'list') return { x: G.L.x - 10, y: G.y0 + 72 + it.row * 54, w: G.L.w + 20, h: 50 };
    if (d.kind === 'form') {
      const by = this.formButtonsY(G), bw = Math.round((G.L.w - 12) * 0.6);
      if (it.col === 0) return { x: G.L.x, y: by, w: bw, h: 46 };
      if (it.col === 1) return { x: G.L.x + bw + 12, y: by, w: G.L.w - bw - 12, h: 46 };
      return { x: G.R.x + 8, y: by, w: G.R.w - 8, h: 46 };
    }
    // 가운데 버튼 줄 (code · notice · wait)
    const row = this.items.filter((x) => x.row === it.row), n = row.length, bw = 210, gap = 16;
    const bx = G.x0 + G.W / 2 - (n * bw + (n - 1) * gap) / 2;
    return { x: bx + row.indexOf(it) * (bw + gap), y: G.y0 + G.H - 70, w: bw, h: 48 };
  }

  /** 입력 폼 버튼 줄의 y (칸이 적으면 칸 바로 아래로 올린다) */
  formButtonsY(G) { return Math.min(G.y0 + G.H - 66, G.y0 + 74 + this.def.fields.length * 52 + 62); }

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
    if (it?.disabled || (id === 'done' && this.st < 3)) { audio.sfx('menu_cancel'); return; }
    switch (id) {
      case 'back': this.leave(); return;
      case 'cancel': this.back(); return;
      case 'login': case 'signup': case 'recover': audio.sfx('menu_ok'); this.show(id); return;
      case 'forgot': audio.sfx('menu_ok'); this.show('recover'); return;
      case 'password': case 'delete': audio.sfx('menu_ok'); this.show(id); return;
      case 'submit': this.submit(); return;
      case 'sync': this.doSync(); return;
      case 'logout': this.confirmLogout(); return;
      case 'copy': this.copyCode(); return;
      case 'done': this.confirmCode(); return;
      case 'retry': audio.sfx('menu_ok'); this.start(); return;
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

  update(dt) {
    const g = this.game;
    this.amb.update(dt, g.viewW, g.viewH);
    this.st += dt;
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.screen === 'profile' && (this.infoT += dt) > 0.5) { this.infoT = 0; this.readSlots(); }
    if (this.leaving) return;
    const tap = this.taps.hit();
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
        if (df !== it.fi) this.focusInput(it.fi);
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
    if (s === 'login') r = await cloud.login(id, pw);
    else if (s === 'signup') r = await cloud.signup(id, pw);
    else if (s === 'recover') r = await cloud.recover(id, this.val('code'), pw);
    else if (s === 'password') r = await cloud.changePassword(this.val('old'), pw);
    if (!this.alive || this.screen !== s) return;
    this.setBusy(false);
    if (!r?.ok) {
      const field = r?.error === 'wrong_password' && s === 'delete' ? 'pw' : ERR_FIELD[r?.error] ?? null;
      this.fail(r?.message ?? '처리하지 못했습니다.', field);
      if (r?.error === 'invalid_credentials') { const el = this.inputs.find((e) => e.dataset.key === 'pw'); if (el) el.value = ''; }
      return;
    }
    audio.sfx('save');
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
    if (r.ok && !r.conflicts.length) this.msg = { text: `슬롯 ${r.uploaded.join(', ')}의 기록을 클라우드에 올렸습니다.`, color: GOOD };
    else if (r.conflicts.length) this.msg = { text: `${slotsJosa(r.conflicts, '은', '는')} 클라우드 기록과 달라 올리지 않았습니다. 세이브 슬롯 화면에서 골라 주세요.`, color: '#ffb070' };
    else this.msg = { text: r.message ?? '올리지 못했습니다.', color: RED };
  }
  syncMsg(out) {
    if (!out?.ok) return { text: out?.message ?? '동기화하지 못했습니다.', color: RED };
    const parts = [];
    if (out.downloaded.length) parts.push(`받음: 슬롯 ${out.downloaded.join(', ')}`);
    if (out.uploaded.length) parts.push(`올림: 슬롯 ${out.uploaded.join(', ')}`);
    if (out.deleted.length) parts.push(`클라우드에서 지움: 슬롯 ${out.deleted.join(', ')}`);
    if (out.conflicts.length) return { text: `${slotsJosa(out.conflicts, '은', '는')} 이 기기와 클라우드 기록이 서로 다릅니다. 세이브 슬롯 화면에서 남길 기록을 골라 주세요.`, color: '#ffb070' };
    if (out.failed.length) return { text: `${slotsJosa(out.failed, '을', '를')} 동기화하지 못했습니다. 잠시 후 다시 시도해 주세요.`, color: RED };
    if (out.held?.length) return { text: `${slotsJosa(out.held, '은', '는')} 지금 플레이 중이라 받지 않았습니다. 타이틀의 이어하기에서 받을 수 있습니다.`, color: '#ffb070' };
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
    else if (!cloud.loggedIn && this.screen !== 'login') this.show('login', { msg: { text: '로그인이 만료되었습니다. 다시 로그인해 주세요.', color: '#ffb070' } });
  }
  confirmLogout() {
    audio.sfx('menu_ok');
    this.game.push('frontConfirm', {
      title: '로그아웃', message: '로그아웃할까요? 이 기기에 저장된 세이브는 그대로 남고, 다시 로그인하면 이어서 동기화됩니다.', yes: '로그아웃', no: '취소',
      onYes: async () => {
        this.setBusy(true, '로그아웃하는 중…');
        await cloud.logout();
        if (!this.alive) return;
        this.setBusy(false);
        this.show('home', { msg: { text: '로그아웃했습니다. 게스트로 계속 플레이할 수 있습니다.', color: GOOD } });
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
        if (!r.ok) { this.fail(r.message ?? '삭제하지 못했습니다.', r.error === 'wrong_password' ? 'pw' : null); return; }
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

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx) {
    const g = this.game, vw = g.viewW, vh = g.viewH, t = g.time;
    kenBurns(ctx, assets.get('bg/title'), vw, vh, t, { z0: 1.06, z1: 1.12, period: 70, oy: 0.4 });
    ctx.fillStyle = 'rgba(6,2,10,0.7)'; ctx.fillRect(0, 0, vw, vh);
    shade(ctx, vw, vh, { top: 0.6, bottom: 0.8, vig: 0.8 });
    this.amb.draw(ctx, vw, vh, 'back', t);
    this.amb.draw(ctx, vw, vh, 'front', t);
    const ap = ease.outCubic(clamp(this.st / 0.35, 0, 1));
    heading(ctx, vw / 2, 40, 'ACCOUNT', null, { size: 30, alpha: ap });
    // 오른쪽 위: 로그인 상태
    const ab = accountBadge();
    drawCloudBadge(ctx, vw - 18, 28, ab.status, t, { size: 13, label: ab.label });

    const G = this.geom(), d = this.def;
    this.taps.clear();
    ctx.save();
    ctx.globalAlpha = ap;
    frame(ctx, G.x0, G.y0, G.W, G.H, { glow: 0.5, accent: d.danger ? '#ff5a6a' : GOLD });
    if (d.kind === 'form' || d.kind === 'list') {
      // 두 칸 사이 구분선
      ctx.fillStyle = 'rgba(232,200,114,0.18)'; ctx.fillRect(G.x0 + G.LW - 6, G.y0 + 24, 1, G.H - 48);
    }
    switch (d.kind) {
      case 'list': this.drawList(ctx, G, t); break;
      case 'form': this.drawForm(ctx, G, t); break;
      case 'code': this.drawCode(ctx, G, t); break;
      case 'notice': this.drawNotice(ctx, G, t); break;
      default: this.drawWait(ctx, G, t);
    }
    // 버튼 (목록 화면은 drawList 에서)
    if (d.kind !== 'list') this.items.forEach((it, i) => { if (it.kind === 'btn') this.drawButton(ctx, it, i, G); });
    this.drawMsg(ctx, G, t);
    ctx.restore();
    backButton(ctx, 14, 12, '뒤로', this.taps);
    const df = this.domFocus() >= 0;
    const keys = df ? 'Enter 다음·확인   Esc 뒤로   ↑↓ 칸 이동' : '↑↓←→ 선택   Z 결정   X 뒤로';
    const touch = d.kind === 'form' ? '입력 칸을 눌러 입력하세요' : '항목을 누르세요';
    footer(ctx, vw, vh, keys, touch);
  }
  title(ctx, G, str, x = G.L.x, color = '#ffe7a0') {
    text(ctx, str, x, G.y0 + 40, { size: 21, weight: 800, family: FONT.title, color, ow: 3 });
    const w = this.def.kind === 'form' || this.def.kind === 'list' ? G.L.w : G.W - 56;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(232,200,114,0.8)'); g.addColorStop(1, 'rgba(232,200,114,0)');
    ctx.fillStyle = g; ctx.fillRect(x, G.y0 + 52, w, 1.5);
  }
  drawButton(ctx, it, i, G) {
    const r = this.itemRect(it, G);
    const sel = this.focus === i && this.domFocus() < 0 && !this.busy;
    const waiting = it.id === 'done' && this.st < 3;
    const label = waiting ? `${it.label} (${Math.ceil(3 - this.st)})` : it.label;
    const acc = it.danger ? '#ff4a5a' : it.link ? '#9fd8ff' : GOLD;
    gbutton(ctx, r, label, { selected: sel, disabled: this.busy || waiting, size: it.link ? 14 : 16, accent: acc, zones: this.taps, id: it.id });
  }
  drawInfo(ctx, G, lines, y = G.y0 + 40) {
    const x = G.R.x + 14, w = G.R.w - 20;
    for (const l of lines) {
      if (l.h) { text(ctx, l.h, x, y, { size: 16, weight: 800, family: FONT.title, color: l.c ?? GOLD, ow: 3 }); y += 26; continue; }
      const indent = l.b ? 14 : 0;
      const ls = wrap(ctx, l.b ?? l.t, w - indent, 13, 500);
      if (l.b) { ctx.fillStyle = l.c ?? GOLD; ctx.save(); ctx.translate(x + 4, y - 4); ctx.rotate(Math.PI / 4); ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore(); }
      ls.forEach((s, k) => text(ctx, s, x + indent, y + k * 19, { size: 13, color: l.c ?? BONE, ow: 2 }));
      y += ls.length * 19 + 8;
    }
    return y;
  }
  drawList(ctx, G, t) {
    const d = this.def;
    this.title(ctx, G, d.title);
    this.items.forEach((it, i) => {
      const r = this.itemRect(it, G);
      const sel = this.focus === i && !this.busy;
      menuItem(ctx, r, it.label, { selected: sel, sub: it.sub, size: 20, accent: it.danger ? '#c0102a' : CRIMSON, disabled: this.busy && it.id !== 'back' });
      if (!this.busy) this.taps.add(it.id, r);
    });
    if (this.screen === 'home') this.drawInfo(ctx, G, INFO_TEXT.home);
    else this.drawProfile(ctx, G, t);
  }
  drawProfile(ctx, G, t) {
    const x = G.R.x + 14, w = G.R.w - 20;
    let y = G.y0 + 42;
    text(ctx, '로그인한 계정', x, y, { size: 12, weight: 700, color: DIM, ow: 2 });
    drawCloudIcon(ctx, x + 16, y + 26, 30, accountBadge().status, t);
    text(ctx, cloud.id ?? '', x + 40, y + 34, { size: 24, weight: 900, family: FONT.title, color: GOLD, ow: 3, maxWidth: w - 44 });
    y += 64;
    const rows = [];
    if (cloud.createdAt) rows.push(['가입일', fmtDate(cloud.createdAt)]);
    const st = cloud.state === 'ready' ? '연결됨' : cloud.state === 'offline' ? '오프라인' : cloud.state === 'unavailable' ? '서버에 연결할 수 없음' : '확인 중';
    rows.push(['서버 연결', st]);
    rows.push(['마지막 동기화', cloud.lastSync ? fmtDate(cloud.lastSync) : '-']);
    for (const [k, v] of rows) {
      text(ctx, k, x, y, { size: 13, weight: 600, color: DIM, ow: 2 });
      text(ctx, v, x + w, y, { size: 13, align: 'right', weight: 800, color: BONE, ow: 2 });
      y += 22;
    }
    y += 6;
    ctx.fillStyle = 'rgba(232,200,114,0.2)'; ctx.fillRect(x, y - 8, w, 1);
    for (const r of this.slotRows) {
      text(ctx, `슬롯 ${r.slot}`, x, y + 12, { size: 13, weight: 800, family: FONT.num, color: BONE, ow: 2 });
      text(ctx, r.who, x + 54, y + 12, { size: 12, color: DIM, ow: 2, maxWidth: w - 54 - 100 });
      drawCloudBadge(ctx, x + w, y + 8, r.status, t, { size: 12 });
      y += 28;
    }
    if (this.slotRows.length) {
      const ms = cloud.metaView?.status === 'synced' ? 'synced' : cloud.metaView?.status === 'error' ? 'error' : 'unknown';
      text(ctx, '해금·명예의 전당', x, y + 12, { size: 13, weight: 800, color: BONE, ow: 2 });
      drawCloudBadge(ctx, x + w, y + 8, ms, t, { size: 12, label: ms === 'synced' ? '합쳐서 보관됨' : ms === 'error' ? '오류' : '확인 전' });
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
    this.drawInfo(ctx, G, INFO_TEXT[this.screen] ?? []);
  }
  drawCode(ctx, G, t) {
    const cx = G.x0 + G.W / 2;
    text(ctx, '복구 코드', cx, G.y0 + 40, { size: 22, align: 'center', weight: 800, family: FONT.title, color: '#ffe7a0', ow: 3 });
    ornament(ctx, cx, G.y0 + 56, 300);
    if (this.codeNote) text(ctx, this.codeNote, G.x0 + 24, G.y0 + 28, { size: 12, weight: 800, color: GOOD, ow: 2 });
    text(ctx, '이 코드는 지금 한 번만 보여 드립니다', cx, G.y0 + 90, { size: 16, align: 'center', weight: 800, color: '#ff9a9a', ow: 3 });
    text(ctx, '비밀번호를 잊었을 때 이 코드로만 계정을 되찾을 수 있습니다.', cx, G.y0 + 114, { size: 13, align: 'center', color: BONE, ow: 2 });
    const r = this.fieldRect(0, G);
    ctx.fillStyle = 'rgba(10,4,12,0.95)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (!this.inputs.length) text(ctx, this.code ?? '', cx, r.y + r.h / 2 + 9, { size: 26, align: 'center', weight: 800, family: FONT.num, color: '#ffe7a0' });
    const notes = [
      '종이에 적거나 안전한 곳(비밀번호 관리자·메모 앱 등)에 보관하세요.',
      '다른 사람에게 알려 주지 마세요. 코드를 아는 사람은 비밀번호를 바꿀 수 있습니다.',
      '코드를 쓰고 나면 새 코드가 나오고, 쓴 코드는 더 이상 쓸 수 없습니다.',
    ];
    notes.forEach((s, i) => text(ctx, `· ${s}`, cx, r.y + r.h + 34 + i * 21, { size: 13, align: 'center', color: i === 1 ? '#ffd0a0' : BONE, ow: 2, maxWidth: G.W - 60 }));
  }
  drawNotice(ctx, G, t) {
    const cx = G.x0 + G.W / 2, st = cloud.state;
    const blocked = st === 'blocked', offline = st === 'offline';
    drawCloudIcon(ctx, cx, G.y0 + 58, 54, blocked ? 'blocked' : 'offline', t);
    const title = blocked ? '여기서는 계정 기능을 쓸 수 없습니다' : offline ? '인터넷에 연결되어 있지 않습니다' : '계정 서버에 연결할 수 없습니다';
    text(ctx, title, cx, G.y0 + 116, { size: 21, align: 'center', weight: 800, family: FONT.title, color: '#ffe7a0', ow: 3 });
    ornament(ctx, cx, G.y0 + 132, 320);
    const body = blocked
      ? ['계정과 클라우드 저장은 블러드 녹턴 공식 사이트와 안드로이드 앱에서 사용할 수 있습니다.']
      : offline
        ? ['연결을 확인한 뒤 「다시 확인」을 눌러 주세요.', '계정과 클라우드 저장은 공식 사이트와 안드로이드 앱에서 사용할 수 있습니다.']
        : ['계정과 클라우드 저장은 블러드 녹턴 공식 사이트와 안드로이드 앱에서 사용할 수 있습니다.', '서버가 잠시 응답하지 않는 것일 수도 있으니 잠시 후 다시 확인해 주세요.'];
    let y = G.y0 + 166;
    for (const s of body) {
      for (const l of wrap(ctx, s, G.W - 90, 15, 500)) { text(ctx, l, cx, y, { size: 15, align: 'center', color: BONE, ow: 2 }); y += 23; }
      y += 4;
    }
    y += 8;
    const box = { x: G.x0 + 60, y, w: G.W - 120, h: 58 };
    ctx.fillStyle = 'rgba(126,224,126,0.08)'; ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = 'rgba(126,224,126,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    text(ctx, '이 기기의 저장은 그대로 쓸 수 있습니다', cx, box.y + 24, { size: 14, align: 'center', weight: 800, color: '#a8f0b0', ow: 2 });
    text(ctx, '세이브 슬롯 1~3, 해금, 명예의 전당 기록은 평소처럼 이 기기에 저장됩니다.', cx, box.y + 45, { size: 12, align: 'center', color: BONE, ow: 2, maxWidth: box.w - 20 });
  }
  drawWait(ctx, G, t) {
    const cx = G.x0 + G.W / 2;
    spinner(ctx, cx, G.y0 + 150, 22, t);
    text(ctx, '계정 서버에 연결하는 중…', cx, G.y0 + 210, { size: 18, align: 'center', weight: 800, family: FONT.title, color: '#ffe7a0', ow: 3 });
    text(ctx, '잠시만 기다려 주세요.', cx, G.y0 + 236, { size: 13, align: 'center', color: DIM, ow: 2 });
  }
  drawMsg(ctx, G, t) {
    const m = this.msg;
    if (!m) return;
    const d = this.def;
    let x, y, w, align;
    if (d.kind === 'form') { x = G.L.x; y = this.formButtonsY(G) - 20; w = G.L.w; align = 'left'; }
    else if (d.kind === 'list') { x = G.R.x + 14; y = G.y0 + G.H - 52; w = G.R.w - 20; align = 'left'; }
    else { x = G.x0 + G.W / 2; y = G.y0 + G.H - 90; w = G.W - 60; align = 'center'; }
    const lines = wrap(ctx, m.text, w - (m.spin ? 22 : 0), 13, 700).slice(0, 2);
    const y0 = y - (lines.length - 1) * 18;
    if (m.spin) spinner(ctx, align === 'center' ? x - ctx.measureText(lines[0] ?? '').width / 2 - 14 : x + 7, y0 - 4, 7, t);
    lines.forEach((l, i) => text(ctx, l, align === 'left' && m.spin ? x + 22 : x, y0 + i * 18, { size: 13, align, weight: 700, color: m.color ?? BONE, ow: 2 }));
  }
}
