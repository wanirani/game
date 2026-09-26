// 저장 시스템: 슬롯 3개 + 설정 + 전역 메타(해금·최고점수). localStorage 사용 (실패 시 메모리 보관).
// saves.write(slot, state) / saves.read(slot) / saves.list() / saves.remove(slot)
// saves.exportCode(slot) → 문자열, saves.importCode(slot, code)
// saves.onWrite(fn) → 해제 함수. 슬롯 저장·삭제·가져오기와 메타 저장 뒤 fn({ type:'write'|'remove'|'meta', slot }) 호출 (클라우드 동기화용)
// saves.store(slot, data) → 클라우드에서 받은 기록을 savedAt 그대로 저장 (onWrite 알림 없음)
// isValidSave(obj) → 불러와도 안전한 최소 구조인지 (가져오기 코드·손상된 슬롯 거부용)
import { CHARACTERS } from '../data/characters.js';

const PREFIX = 'bloodnocturne_';
const mem = {};

function lsGet(k) {
  try { return localStorage.getItem(k); } catch { return mem[k] ?? null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); return true; } catch { mem[k] = v; return false; }
}
function lsDel(k) {
  try { localStorage.removeItem(k); } catch { delete mem[k]; }
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

/** 기본 그래픽 품질: 터치·소형 화면(휴대폰)은 'medium', 그중 메모리 2GB 이하 저사양이면 'low', 그 외 'high' */
function detectQuality() {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'high';
    // 주 입력이 터치(coarse)인 기기 — 터치스크린 노트북(주 입력 마우스)은 제외
    const touch = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : (navigator.maxTouchPoints ?? 0) > 0;
    const small = Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999) < 600;
    if (!touch && !small) return 'high';
    return (navigator.deviceMemory ?? 8) <= 2 ? 'low' : 'medium';
  } catch { return 'high'; }
}

export const DEFAULT_SETTINGS = {
  musicVol: 0.6, sfxVol: 0.8, quality: detectQuality(), vibration: true, screenShake: 1,
  showDamage: true, touchOpacity: 0.55, autoSave: true, language: 'ko',
};

export const DEFAULT_META = {
  unlockedChars: ['kael', 'sera', 'victor', 'bran'],
  highScores: [], // [{name, score, charId, stage, date, mode}]
  bossRushBest: null, survivalBest: 0,
  konami: false, clears: 0, endingsSeen: [], bestiary: {},
};

class SaveSystem {
  constructor() { this.listeners = new Set(); }
  /** 저장 알림 구독 (core/cloud.js 가 쓴다). 구독자 오류는 저장을 막지 않는다 */
  onWrite(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify(ev) {
    for (const fn of this.listeners) { try { fn(ev); } catch (e) { console.error('[saves]', e); } }
  }
  slotKey(slot) { return `${PREFIX}slot_${slot}`; }
  write(slot, state) {
    state.savedAt = Date.now();
    state.slot = slot;
    const ok = lsSet(this.slotKey(slot), JSON.stringify(state));
    this.notify({ type: 'write', slot });
    return ok;
  }
  /** 받은 기록을 그대로 저장 (savedAt 유지, 알림 없음). 구조가 올바르지 않으면 false */
  store(slot, data) {
    if (!isValidSave(data)) return false;
    data.slot = slot;
    return lsSet(this.slotKey(slot), JSON.stringify(data));
  }
  /** 슬롯에 무언가 저장되어 있는가 (손상되어 read() 가 null 인 경우도 true) */
  has(slot) { return lsGet(this.slotKey(slot)) != null; }
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
      lsSet(this.slotKey(slot), JSON.stringify(obj));
      this.notify({ type: 'write', slot });
      return true;
    } catch { return false; }
  }
  loadSettings() {
    try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(lsGet(PREFIX + 'settings')) || {}) }; } catch { return { ...DEFAULT_SETTINGS }; }
  }
  saveSettings(s) { lsSet(PREFIX + 'settings', JSON.stringify(s)); }
  loadMeta() {
    try {
      const m = JSON.parse(lsGet(PREFIX + 'meta')) || {};
      return { ...structuredClone(DEFAULT_META), ...m };
    } catch { return structuredClone(DEFAULT_META); }
  }
  saveMeta(m) { lsSet(PREFIX + 'meta', JSON.stringify(m)); this.notify({ type: 'meta' }); }
}
export const saves = new SaveSystem();
