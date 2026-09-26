// 저장 시스템: 슬롯 3개 + 설정 + 전역 메타(해금·최고점수). localStorage 사용 (실패 시 메모리 보관).
// saves.write(slot, state) / saves.read(slot) / saves.list() / saves.remove(slot)
// saves.exportCode(slot) → 문자열, saves.importCode(slot, code)
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

export const DEFAULT_SETTINGS = {
  musicVol: 0.6, sfxVol: 0.8, quality: 'high', vibration: true, screenShake: 1,
  showDamage: true, touchOpacity: 0.55, autoSave: true, language: 'ko',
};

export const DEFAULT_META = {
  unlockedChars: ['kael', 'sera', 'victor', 'bran'],
  highScores: [], // [{name, score, charId, stage, date, mode}]
  bossRushBest: null, survivalBest: 0,
  konami: false, clears: 0, endingsSeen: [], bestiary: {},
};

class SaveSystem {
  slotKey(slot) { return `${PREFIX}slot_${slot}`; }
  write(slot, state) {
    state.savedAt = Date.now();
    state.slot = slot;
    return lsSet(this.slotKey(slot), JSON.stringify(state));
  }
  read(slot) {
    const raw = lsGet(this.slotKey(slot));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  remove(slot) { lsDel(this.slotKey(slot)); }
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
      if (!obj || !obj.heroes) return false;
      lsSet(this.slotKey(slot), raw);
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
  saveMeta(m) { lsSet(PREFIX + 'meta', JSON.stringify(m)); }
}
export const saves = new SaveSystem();
