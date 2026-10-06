// 저장 시스템: 슬롯 3개 + 설정 + 전역 메타(해금·최고점수). localStorage 사용 (실패 시 메모리 보관).
// saves.write(slot, state) / saves.read(slot) / saves.list() / saves.remove(slot)
// saves.exportCode(slot) → 문자열, saves.importCode(slot, code)
// saves.onWrite(fn) → 해제 함수. 슬롯 저장·삭제·가져오기와 메타 저장 뒤 fn({ type:'write'|'remove'|'meta', slot }) 호출 (클라우드 동기화용)
// saves.store(slot, data) → 클라우드에서 받은 기록을 savedAt 그대로 저장 (onWrite 알림 없음)
// saves.markDebug(state) → 디버그 부팅(?scene=stage · ?scene=hub … 슬롯을 고르지 않고 바로 연 장면)의 임시 세이브로 표시. 그 상태의 write 는
//  진짜 슬롯(1–3) 대신 디버그 칸 DEBUG_SLOT('debug' → bloodnocturne_slot_debug)에 쓰고 알리지 않는다 (클라우드가 올리지 않는다) — 진짜 슬롯 1 을
//  덮어쓰던 위험. 상태의 slot 값(1)은 그대로라 게임 안의 규칙은 같다. saves.read(DEBUG_SLOT) 로 마지막 디버그 기록을 읽는다 (QA 도구)
// saves.markDebugBoot() → 이 실행 전체가 디버그 부팅(main.js: ?scene= 이 타이틀이 아님). 메타(업적·명예의 전당·보스 러시·탑 기록·해금)는
//  읽기는 진짜 메타에서 하지만 saveMeta 는 진짜 칸 대신 DEBUG_META_KEY(bloodnocturne_meta_debug)에 쓰고, 알림에 debug:true 를 붙인다
//  (업적 엔진은 그대로 다시 보고, 클라우드는 올리지 않는다). saves.debugBoot → 표시 여부
// 쓰기 실패 (저장 공간 부족 QuotaExceededError · 저장소 차단): write/store/saveSettings/saveMeta 가 false 를 돌려주고,
//  새 기록은 이번 실행 동안 메모리에 남아 읽기(read·list·exportCode·클라우드 올리기)가 옛 기록 대신 그것을 돌려준다.
//  공간 부족이면 게임이 만든 사본(클라우드 받기 전 백업 bloodnocturne_slot_N_backup)을 지우고 한 번 다시 쓴다.
//  saves.onFail(fn) → 해제 함수. 실패할 때마다 fn({ kind:'quota'|'unavailable', key, slot? }) — main.js 가 game.saveFailed 로 경고 토스트를 띄운다.
//  saves.lastFail → 마지막 실패 정보 | null (다음 쓰기가 성공하면 null). onWrite 알림에는 ok(true|false)가 함께 실린다
// isValidSave(obj) → 불러와도 안전한 최소 구조인지 (가져오기 코드·손상된 슬롯 거부용)
// 설정 (settingsVersion 2, MASTER_PLAN §1.5 · platform §10):
//  DEFAULT_SETTINGS — 모든 설정 키의 기본값 (한 곳에서만 정의). SETTINGS_SCHEMA — 키별 허용 값 (옵션 화면이 값 목록으로 쓸 수 있다)
//  saves.loadSettings() → 이전 판(v1) 이관 + 검증된 설정 객체 (saves.settings 로도 남는다). 이관·보정이 있었으면 한 번 다시 저장
//    · v1(settingsVersion 없음)의 quality 는 detectQuality() 가 적은 값이라 'auto' 로 되돌린다 · 모르는 키는 보존 · 범위 밖 값은 기본값
//  saves.saveSettings(s) → 항상 settingsVersion 2 로 기록 (다음 불러오기에서 품질 선택이 초기화되지 않게)
//  migrateSettings(obj) → { settings, changed } (순수 함수, 테스트·도구용), autoQualityTier() → 'auto' 의 시작 등급 (platform §6.4)
import { CHARACTERS } from '../data/characters.js';

const PREFIX = 'bloodnocturne_';
/** 디버그 부팅의 임시 세이브가 쓰는 칸 (saves.list 의 1–3 밖, 클라우드 SLOTS 밖) */
export const DEBUG_SLOT = 'debug';
/** 디버그 부팅의 메타가 쓰는 칸 (진짜 메타 bloodnocturne_meta 를 건드리지 않는다) */
export const DEBUG_META_KEY = 'bloodnocturne_meta_debug';
const DEBUG_STATES = new WeakSet();
// 기기에 쓰지 못한 최신 기록 (이번 실행 동안만). 읽기는 이것을 먼저 본다: 쓰기 실패 뒤에도 옛 기록이 되살아나지 않게
const mem = {};
/** 지워도 되는, 게임이 스스로 만든 사본: 클라우드 받기 전 이 기기 기록 백업 (core/cloud.js) */
const SPARE_KEY = /^bloodnocturne_slot_\d+_backup$/;
let failHook = null; // SaveSystem 이 받는다 (실패 알림)

/** 저장 공간 부족 오류인가 (브라우저마다 이름·코드가 다르다) */
export function isQuotaError(e) {
  if (!e) return false;
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014;
}
function lsGet(k) {
  if (Object.hasOwn(mem, k)) return mem[k];
  try { return localStorage.getItem(k); } catch { return null; }
}
/** 게임이 만든 백업 사본을 지운다 → 지운 글자 수 */
function freeSpare() {
  let freed = 0;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && SPARE_KEY.test(k)) keys.push(k);
    }
    for (const k of keys) {
      try { freed += (localStorage.getItem(k) || '').length || 1; localStorage.removeItem(k); } catch { /* 무시 */ }
    }
  } catch { /* 저장소 자체를 쓸 수 없음 */ }
  return freed;
}
/** 쓰기. 공간이 부족하면 백업 사본을 지우고 한 번 더 쓴다. 실패하면 메모리에 두고 알린 뒤 false */
function lsSet(k, v) {
  let err = null;
  try { localStorage.setItem(k, v); delete mem[k]; flushPending(); return true; } catch (e) { err = e; }
  if (isQuotaError(err) && freeSpare() > 0) {
    try { localStorage.setItem(k, v); delete mem[k]; console.warn('[saves] 저장 공간이 부족해 백업 사본을 지우고 저장했다'); return true; } catch (e) { err = e; }
  }
  mem[k] = v;
  const kind = isQuotaError(err) ? 'quota' : 'unavailable';
  if (typeof localStorage !== 'undefined') console.warn(`[saves] ${k} 저장 실패 (${kind}):`, err?.name || err); // (Node 도구에는 저장소가 없다)
  try { failHook?.({ kind, key: k }); } catch (e) { console.error('[saves]', e); }
  return false;
}
/** 쓰기가 다시 되면(공간이 생겼다) 메모리에만 있던 다른 기록도 조용히 기기에 옮긴다 */
function flushPending() {
  for (const k of Object.keys(mem)) {
    try { localStorage.setItem(k, mem[k]); delete mem[k]; } catch { return; }
  }
}
function lsDel(k) {
  delete mem[k];
  try { localStorage.removeItem(k); } catch { /* 무시 */ }
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * 세이브 데이터 최소 구조 검사: 현재 캐릭터가 실존하고, 모든 영웅에 레벨·장비 칸이 있으며,
 * 가방(inventory)·진행도(progress)가 있어야 한다. 세부 누락 필드는 game/state.js migrateState 가 보정한다.
 */
export function isValidSave(s) {
  if (!isObj(s) || !isObj(s.heroes) || !Array.isArray(s.inventory) || !isObj(s.progress)) return false;
  if (typeof s.charId !== 'string' || !Object.hasOwn(CHARACTERS, s.charId) || !Object.hasOwn(s.heroes, s.charId) || !isObj(s.heroes[s.charId])) return false;
  for (const [id, h] of Object.entries(s.heroes)) {
    if (!Object.hasOwn(CHARACTERS, id) || !isObj(h) || !isObj(h.equip) || !Number.isFinite(h.level)) return false;
  }
  return true;
}

/** 주 입력이 터치(coarse)이거나 화면이 작은 기기(휴대폰·태블릿) — 터치스크린 노트북(주 입력 마우스)은 제외 */
export function isTouchDevice() {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const touch = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : (navigator.maxTouchPoints ?? 0) > 0;
    const small = Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999) < 600;
    return touch || small;
  } catch { return false; }
}

/**
 * quality 'auto' 의 시작 등급 (platform §6.4): 데스크톱 'high', 터치 기기 'medium',
 * 메모리 2GB 이하(모든 기기) 또는 코어 4개 이하 터치 기기는 'low'.
 * (코어 수 조건은 터치 기기에만 건다: 4스레드 데스크톱이 'low' 에서 시작하면 조절기가 시작 등급 위로 올리지 못한다)
 * 품질 조절기(core/game.js)가 이 값에서 시작해 실제 등급(game.quality)을 정한다.
 */
export function autoQualityTier() {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'high';
    if ((navigator.deviceMemory ?? 8) <= 2) return 'low';
    if (!isTouchDevice()) return 'high';
    return (navigator.hardwareConcurrency ?? 8) <= 4 ? 'low' : 'medium';
  } catch { return 'high'; }
}
/** 예전 이름 (v1 에서 DEFAULT_SETTINGS.quality 를 정하던 함수). 이제 설정 기본값은 'auto' 이고 이 값은 시작 등급으로만 쓴다 */
export const detectQuality = autoQualityTier;

export const SETTINGS_VERSION = 2;

/** 브라우저가 '추적하지 말라'(Global Privacy Control)고 알리는가 → 익명 통계 기본값 끔 (docs/TELEMETRY.md) */
export function privacySignal() {
  try { return typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true; } catch { return false; }
}

/** 배경 음악 기본 엔진: 녹음 음원, 단 데이터 절약(Save-Data)이거나 저사양(시작 등급 low — 웹의 lo/ 단계 기준과 같다)이면 합성 음원 */
export function defaultMusicSource() {
  try {
    if (typeof navigator !== 'undefined' && navigator.connection?.saveData) return 'synth';
    return autoQualityTier() === 'low' ? 'synth' : 'recorded';
  } catch { return 'recorded'; }
}

/** 모든 설정 키의 기본값 (MASTER_PLAN §1.5 표 순서). 새 키는 여기와 SETTINGS_SCHEMA 에 함께 추가한다 */
export const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION,
  musicVol: 0.6, sfxVol: 0.8, musicSource: defaultMusicSource(), // 음악 음원 (core/audio_rec.js) — 데이터 절약·저사양은 기본 합성
  quality: 'auto', fpsCap: 60, uiScale: 'auto', safeArea: 'fit',
  screenShake: 1, showDamage: true, flashFx: 1, cutinMode: 'full', reduceMotion: false,
  ctrlPrompts: 'auto', ctrlPreset: 'arcade', ctrlConfirm: 'auto', ctrlMap: null, keyMap: null,
  ctrlDeadzone: 0.2, ctrlRumble: 0.8, autoSprint: false,
  touchOpacity: 0.55, touchScale: 1, touchStick: 'float', touchSlide: true, touchLeftHanded: false, touchLayout: null,
  vibration: true, autoSave: true, keepAwake: true, turntableAuto: true, fullscreenAuto: true,
  telemetry: !privacySignal(), // 익명 통계·오류 보내기 (core/telemetry.js) — GPC 를 켠 브라우저는 기본 끔
  language: 'ko',
};

// ── 설정 검증 ──
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const EPS = 1e-6;
const num = (min, max) => Object.freeze({ type: 'num', min, max });
const oneOf = (...values) => Object.freeze({ type: 'enum', values: Object.freeze(values) });
const BOOL = Object.freeze({ type: 'bool' });
/** 패드 버튼 번호 (표준 배치 0–16, 여유 있게 0–63) 또는 짧은 이름표 (예: 축 바인딩을 문자열로 쓰는 경우) */
const isPadBinding = (v) => (Number.isInteger(v) && v >= 0 && v <= 63) || (typeof v === 'string' && /^[A-Za-z0-9:+\-_.]{1,24}$/.test(v));
/** KeyboardEvent.code (예: 'KeyZ', 'Space', 'ArrowLeft', 'Numpad0') */
const isKeyCode = (v) => typeof v === 'string' && /^[A-Za-z0-9]{1,32}$/.test(v);

/** 키별 허용 값. type: 'num'(min..max) | 'enum'(values) | 'bool' | 'map'({action:[…]} | null) | 'layout'({id:{right,bottom,d}} | null) */
export const SETTINGS_SCHEMA = Object.freeze({
  musicVol: num(0, 1), sfxVol: num(0, 1),
  musicSource: oneOf('recorded', 'synth'),
  quality: oneOf('auto', 'low', 'medium', 'high'),
  fpsCap: oneOf(60, 0),
  uiScale: oneOf('auto', 1, 1.15, 1.3, 1.5),
  safeArea: oneOf('fit', 'full'),
  screenShake: num(0, 1),
  showDamage: BOOL,
  flashFx: oneOf(0, 0.5, 1),
  cutinMode: oneOf('full', 'short'),
  reduceMotion: BOOL,
  ctrlPrompts: oneOf('auto', 'keyboard', 'xbox', 'ps', 'nintendo'),
  ctrlPreset: oneOf('arcade', 'classic', 'custom'),
  ctrlConfirm: oneOf('auto', 'south', 'east'),
  ctrlMap: Object.freeze({ type: 'map', item: isPadBinding }),
  keyMap: Object.freeze({ type: 'map', item: isKeyCode }),
  ctrlDeadzone: num(0.1, 0.4),
  ctrlRumble: num(0, 1),
  autoSprint: BOOL,
  touchOpacity: num(0, 1),
  touchScale: num(0.8, 1.3),
  touchStick: oneOf('float', 'fixed'),
  touchSlide: BOOL,
  touchLeftHanded: BOOL,
  touchLayout: Object.freeze({ type: 'layout' }),
  vibration: BOOL, autoSave: BOOL, keepAwake: BOOL, turntableAuto: BOOL, fullscreenAuto: BOOL, telemetry: BOOL,
  language: oneOf('ko'),
});

const INVALID = Symbol('invalid');
/** 설정 값 하나 검증 → 정규화된 값 또는 INVALID */
function checkSetting(spec, v) {
  switch (spec.type) {
    case 'num':
      if (typeof v !== 'number' || !Number.isFinite(v) || v < spec.min - EPS || v > spec.max + EPS) return INVALID;
      return Math.min(spec.max, Math.max(spec.min, v)); // 0.1 단위 누적 오차(0.7000000000000001 등)만 허용
    case 'enum':
      for (const x of spec.values) {
        if (x === v) return x;
        if (typeof x === 'number' && typeof v === 'number' && Math.abs(x - v) < EPS) return x;
      }
      return INVALID;
    case 'bool': return typeof v === 'boolean' ? v : INVALID;
    case 'map': {
      if (v === null) return null;
      if (!isObj(v)) return INVALID;
      const out = {};
      for (const [action, list] of Object.entries(v)) {
        if (UNSAFE_KEYS.has(action) || !Array.isArray(list)) continue;
        out[action] = list.filter(spec.item).slice(0, 8);
      }
      return out;
    }
    case 'layout': {
      if (v === null) return null;
      if (!isObj(v)) return INVALID;
      const out = {};
      const fin = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
      for (const [id, b] of Object.entries(v)) {
        if (UNSAFE_KEYS.has(id) || !isObj(b)) continue;
        if (!fin(b.right, -200, 10000) || !fin(b.bottom, -200, 10000) || !fin(b.d, 20, 400)) continue;
        out[id] = { right: b.right, bottom: b.bottom, d: b.d };
      }
      return out;
    }
    default: return v;
  }
}

/**
 * 저장된 설정(파싱된 JSON) → { settings, changed }. 순수 함수, 멱등.
 *  - settingsVersion 이 없거나 2 미만(v1): quality 를 'auto' 로 (v1 의 값은 플레이어가 고른 것이 아니라 detectQuality() 결과)
 *  - 모르는 키는 그대로 보존 (새 버전 클라이언트가 쓴 키, 디버그 키 settings.painted 등). 프로토타입 키는 버린다
 *  - 형식이 틀리거나 범위를 벗어난 값은 기본값으로, 빠진 키는 기본값으로 채운다
 *  - changed: 다시 저장할 가치가 있는 변경(이관, 잘못된 값 보정)이 있었는지 (빠진 키 채우기만으로는 false)
 */
export function migrateSettings(saved) {
  const out = {};
  let changed = false;
  if (!isObj(saved)) {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) out[k] = v;
    return { settings: out, changed: saved != null };
  }
  const ver = saved.settingsVersion;
  const v1 = !(Number.isInteger(ver) && ver >= SETTINGS_VERSION);
  // 모르는 키 보존 (앞쪽), 알려진 키는 아래에서 검증한 값으로 덮어쓴다
  for (const [k, v] of Object.entries(saved)) {
    if (UNSAFE_KEYS.has(k)) { changed = true; continue; }
    if (!Object.hasOwn(SETTINGS_SCHEMA, k) && k !== 'settingsVersion') out[k] = v;
  }
  out.settingsVersion = v1 ? SETTINGS_VERSION : ver;
  if (v1) changed = true;
  for (const [k, spec] of Object.entries(SETTINGS_SCHEMA)) {
    const dflt = DEFAULT_SETTINGS[k];
    if (v1 && k === 'quality') { out[k] = dflt; continue; }
    if (!Object.hasOwn(saved, k)) { out[k] = dflt; continue; }
    const v = checkSetting(spec, saved[k]);
    if (v === INVALID) { out[k] = dflt; changed = true; continue; }
    if (v !== saved[k] && (spec.type === 'num' || spec.type === 'enum')) changed = true;
    else if ((spec.type === 'map' || spec.type === 'layout') && v !== null && JSON.stringify(v) !== JSON.stringify(saved[k])) changed = true;
    out[k] = v;
  }
  return { settings: out, changed };
}

export const DEFAULT_META = {
  unlockedChars: ['kael', 'sera', 'victor', 'bran'],
  highScores: [], // [{name, score, charId, stage, date, mode}]
  bossRushBest: null, survivalBest: 0,
  konami: false, clears: 0, endingsSeen: [], bestiary: {},
};

class SaveSystem {
  constructor() {
    this.listeners = new Set(); this.failFns = new Set();
    this.settings = null; /* 마지막으로 불러오거나 저장한 설정 객체 (= game.settings) */
    this.lastFail = null; /* 마지막 쓰기 실패 { kind, key, slot, at } | null */
    this.debugBoot = false; /* 디버그 부팅(markDebugBoot) — 메타를 디버그 칸에만 쓴다 */
    failHook = (f) => this.failed(f);
  }
  /** 저장 알림 구독 (core/cloud.js 가 쓴다). 구독자 오류는 저장을 막지 않는다 */
  onWrite(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify(ev) {
    for (const fn of this.listeners) { try { fn(ev); } catch (e) { console.error('[saves]', e); } }
  }
  /** 쓰기 실패 구독 (main.js → 경고 토스트). fn({ kind:'quota'|'unavailable', key, slot? }) */
  onFail(fn) { this.failFns.add(fn); return () => this.failFns.delete(fn); }
  failed(f) {
    const m = /^bloodnocturne_slot_(\d+)$/.exec(f.key);
    const ev = { ...f, slot: m ? Number(m[1]) : undefined, at: Date.now() };
    this.lastFail = ev;
    for (const fn of this.failFns) { try { fn(ev); } catch (e) { console.error('[saves]', e); } }
  }
  /** 이번 실행에서 기기에 쓰지 못하고 메모리에만 있는 기록이 있는가 */
  pending() { return Object.keys(mem).length > 0; }
  slotKey(slot) { return `${PREFIX}slot_${slot}`; }
  /** 디버그 부팅의 임시 세이브로 표시 (main.js debugState · 장면을 바로 열 때의 임시 상태). 반환: 그 상태 */
  markDebug(state) { if (state && typeof state === 'object') DEBUG_STATES.add(state); return state; }
  isDebug(state) { return !!state && typeof state === 'object' && DEBUG_STATES.has(state); }
  /** 이 실행은 디버그 부팅 (main.js): 이후 saveMeta 는 DEBUG_META_KEY 에만 */
  markDebugBoot() { this.debugBoot = true; }
  write(slot, state) {
    state.savedAt = Date.now();
    state.slot = slot;
    if (DEBUG_STATES.has(state)) return lsSet(this.slotKey(DEBUG_SLOT), JSON.stringify(state));   // 진짜 슬롯·클라우드에 닿지 않는다 (알림 없음)
    const ok = lsSet(this.slotKey(slot), JSON.stringify(state));
    if (ok) this.lastFail = null;
    // 실패해도 알린다: 로그인 중이면 클라우드(core/cloud.js)가 메모리의 새 기록을 올려 진행을 지킨다
    this.notify({ type: 'write', slot, ok });
    return ok;
  }
  /** 받은 기록을 그대로 저장 (savedAt 유지, 알림 없음). 구조가 올바르지 않으면 false */
  store(slot, data) {
    if (!isValidSave(data)) return false;
    data.slot = slot;
    return lsSet(this.slotKey(slot), JSON.stringify(data));
  }
  read(slot) {
    const raw = lsGet(this.slotKey(slot));
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      return isValidSave(s) ? s : null; // 손상된 슬롯은 빈 슬롯으로 취급 (새로 시작으로 덮어쓸 수 있음)
    } catch { return null; }
  }
  remove(slot) { lsDel(this.slotKey(slot)); this.notify({ type: 'remove', slot }); }
  /** 슬롯 요약 목록 (타이틀 화면용) */
  list() {
    return [1, 2, 3].map((slot) => {
      const s = this.read(slot);
      if (!s) return { slot, empty: true };
      const hero = s.heroes?.[s.charId];
      return {
        slot, empty: false, charId: s.charId, level: hero?.level ?? 1, classId: hero?.classId,
        chapter: s.progress?.chapter ?? 0, playTime: s.stats?.playTime ?? 0, difficulty: s.difficulty,
        savedAt: s.savedAt, gold: s.gold ?? 0,
      };
    });
  }
  exportCode(slot) {
    const raw = lsGet(this.slotKey(slot));
    if (!raw) return null;
    return btoa(unescape(encodeURIComponent(raw)));
  }
  importCode(slot, code) {
    try {
      const raw = decodeURIComponent(escape(atob(code.trim())));
      const obj = JSON.parse(raw);
      if (!isValidSave(obj)) return false;
      obj.slot = slot;
      const ok = lsSet(this.slotKey(slot), JSON.stringify(obj));
      this.notify({ type: 'write', slot, ok });
      return true; // 코드는 올바르다 (기기에 쓰지 못했으면 onFail 경고가 따로 뜬다)
    } catch { return false; }
  }
  /** 설정 불러오기: v1 → v2 이관과 값 검증(migrateSettings). 이관·보정이 있었으면 결과를 한 번 다시 저장한다 */
  loadSettings() {
    const raw = lsGet(PREFIX + 'settings');
    let saved = null;
    if (raw) { try { saved = JSON.parse(raw); } catch { saved = raw; } } // 손상된 JSON(문자열 그대로) → 기본값으로 다시 저장
    const { settings, changed } = migrateSettings(saved);
    if (raw && changed) lsSet(PREFIX + 'settings', JSON.stringify(settings));
    this.settings = settings;
    return settings;
  }
  /** 설정 저장. 기록에는 항상 settingsVersion 2 를 붙인다 (없으면 다음 불러오기에서 v1 로 보고 품질을 초기화하므로) */
  saveSettings(s) {
    if (!isObj(s)) return false;
    this.settings = s;
    const v = s.settingsVersion;
    return lsSet(PREFIX + 'settings', JSON.stringify(Number.isInteger(v) && v >= SETTINGS_VERSION ? s : { ...s, settingsVersion: SETTINGS_VERSION }));
  }
  loadMeta() {
    try {
      const m = JSON.parse(lsGet(PREFIX + 'meta')) || {};
      return { ...structuredClone(DEFAULT_META), ...m };
    } catch { return structuredClone(DEFAULT_META); }
  }
  saveMeta(m) {
    // 디버그 부팅: 진짜 메타·클라우드에 닿지 않는다 (알림은 debug 표시와 함께 — 업적 엔진은 다시 보고 core/cloud.js 는 무시)
    if (this.debugBoot) { const ok = lsSet(DEBUG_META_KEY, JSON.stringify(m)); this.notify({ type: 'meta', ok, debug: true }); return ok; }
    const ok = lsSet(PREFIX + 'meta', JSON.stringify(m)); this.notify({ type: 'meta', ok }); return ok;
  }
}
export const saves = new SaveSystem();
