// 진동 (platform.md §4.6, feel §4.12, MASTER_PLAN §1.11) — 게임 진동의 단일 소유자.
//
//   haptics.play(name)                    이름 붙은 효과 (아래 EFFECTS): 패드 모드 = 패드 진동, 터치 모드 = 휴대폰 진동
//   haptics.rumble(strong, weak, ms, o)   임의 진동 (input.rumble 이 여기로 온다). o.vibrate: 휴대폰 진동 지정(ms | 패턴 | false),
//                                         o.name: 같은 이름 60ms 제한에 쓰는 키
//   haptics.reset()                       진동 즉시 멈춤 (일시정지·메뉴·창 전환 시 자동)
//   haptics.init(game, input)             input.init 이 부른다: 버스 구독 (playerHurt · bossKilled · playerDied · levelUp · ultimateCast · shake)
//   haptics.tick()                        input.pollFrame 이 매 프레임 부른다: 일시정지·메뉴 장면이 열리면 reset
//
// 규칙
//  - 패드: gamepad.vibrationActuator.playEffect('dual-rumble', {strongMagnitude, weakMagnitude, duration}), 세기 × settings.ctrlRumble
//    (0 이면 호출 없음). vibrationActuator 가 없으면 APK 브리지 window.BNAndroid.rumble(strong, weak, ms).
//  - 휴대폰: navigator.vibrate, settings.vibration 이 켜져 있고 한 번이라도 터치한 뒤에만 (크롬이 첫 사용자 동작 전 호출을 막는다).
//    임의 진동은 강도 H 이상만 15ms, S/A 는 60ms, 각성(0.6/0.9/400) 은 [40,30,80] (feel §4.12).
//  - 같은 효과는 60ms 에 한 번. 더 센 효과가 재생 중이면 약한 효과는 건너뛰고, 센 효과는 약한 효과를 끊는다.
//  - 타격 진동은 impact.js 의 input.rumble 만 낸다 (hitCrit/hitHeavy 는 구독하지 않는다). 각성 진동은 awaken.js 가 직접 부른다.
import { bus } from './events.js';

/** pad: [[strong, weak, ms, 지연ms], …] · phone: vibrate 값 */
export const EFFECTS = {
  hurt: { pad: [[0.55, 0.25, 140, 0]], phone: 30 },
  hurtHeavy: { pad: [[0.9, 0.5, 260, 0]], phone: [40, 30, 60] },
  crit: { pad: [[0, 0.45, 60, 0]], phone: 12 },
  heavy: { pad: [[0.3, 0.3, 70, 0]], phone: 15 },
  explode: { pad: [[0.8, 0.6, 220, 0]], phone: 50 },
  ult: { pad: [[0.4, 0.5, 150, 0], [1.0, 0.9, 220, 180]], phone: [20, 40, 20] },
  bossDie: { pad: [[1.0, 0.8, 700, 0]], phone: [80, 40, 120] },
  death: { pad: [[1.0, 0.4, 500, 0]], phone: 200 },
  levelUp: { pad: [[0, 0.35, 90, 0], [0, 0.35, 90, 170]], phone: [15, 60, 15] },
  awaken: { pad: [[0.6, 0.9, 400, 0]], phone: [40, 30, 80] },
  landHeavy: { pad: [[0.4, 0.2, 100, 0]], phone: false },
};
const THROTTLE_MS = 60;
/** 이 장면이 맨 위에 오면 진동을 멈춘다 */
const QUIET_SCENES = new Set(['pause', 'menu', 'options', 'arcadePause']);

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

class Haptics {
  constructor() {
    this.game = null; this.input = null;
    this.last = new Map();          // 효과 이름 → 마지막 재생 시각 (60ms 제한)
    this.active = null;             // { strength, until } 재생 중인 효과
    this.timers = [];               // 여러 번 울리는 효과의 예약
    this.subs = [];
    this.calls = 0;                 // 실제 장치 호출 수 (QA·디버그)
  }

  init(game, input) {
    this.game = game; this.input = input;
    if (this.subs.length) return;
    const on = (evt, fn) => this.subs.push(bus.on(evt, (d) => { try { fn(d ?? {}); } catch (e) { console.error('[haptics]', evt, e); } }));
    on('playerHurt', (d) => {
      const amt = Number(d.amount ?? d.dmg ?? 0);
      const p = this.game?.world?.player;
      const max = Number(d.max ?? p?.stats?.hp ?? p?.maxHp ?? 0);
      this.play(max > 0 && amt >= max * 0.25 ? 'hurtHeavy' : 'hurt');
    });
    on('bossKilled', () => this.play('bossDie'));
    on('playerDied', () => this.play('death'));
    on('levelUp', () => this.play('levelUp'));
    on('ultimateCast', () => this.play('ult'));
    on('shake', (d) => { if (!(Number(d.mag) < 8)) this.play('explode'); });
    try {
      window.addEventListener('blur', () => this.reset());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    } catch { /* 창이 없는 환경 */ }
  }

  get settings() { return this.game?.settings ?? {}; }
  /** 'pad' | 'phone' | null — 지금 진동을 낼 장치 */
  target() {
    const m = this.input?.mode;
    if (m === 'pad') return 'pad';
    if (m === 'touch') return 'phone';
    return null;
  }

  /** 이름 붙은 효과 */
  play(name) {
    const fx = EFFECTS[name];
    if (!fx) return false;
    const dev = this.target();
    if (!dev) return false;
    // 울리지 않을 효과는 60ms 제한·우선순위 칸을 차지하지 않는다 (예: 휴대폰에서 진동 없는 타격이 레벨업 진동을 막지 않게)
    if (dev === 'pad' ? !this.padOn() : !this.phoneOn(fx.phone)) return false;
    if (!this.gate(name, Math.max(...fx.pad.map((p) => Math.max(p[0], p[1]))), fx.pad.reduce((a, p) => Math.max(a, p[2] + p[3]), 0))) return false;
    if (dev === 'pad') {
      this.clearTimers();
      for (const [s, w, ms, at] of fx.pad) {
        if (at > 0) {
          const id = setTimeout(() => { this.timers = this.timers.filter((x) => x !== id); this.padEffect(s, w, ms); }, at);
          this.timers.push(id);
        } else this.padEffect(s, w, ms);
      }
      return true;
    }
    return this.phone(fx.phone);
  }

  /** 임의 진동 (input.rumble) */
  rumble(strong, weak, ms, o = {}) {
    const s = clamp01(strong), w = clamp01(weak), d = Math.max(0, Math.min(5000, Number(ms) || 0));
    if (d <= 0 || (s <= 0 && w <= 0)) return false;
    const dev = this.target();
    if (!dev) return false;
    let v;
    if (dev === 'phone') {
      v = o.vibrate;
      if (v === undefined) {
        if (d >= 350 && w >= 0.8 && s < 0.95) v = EFFECTS.awaken.phone;   // 각성 스팅어 (0.6/0.9/400)
        else if (s >= 0.95) v = 60;                                        // 강도 S · A
        else if (s >= 0.35 && w >= 0.6) v = 15;                            // 강도 H · F
        else v = false;
      }
      if (!this.phoneOn(v)) return false;   // 휴대폰에서 울리지 않는 강도(L·M 등)는 제한·우선순위 칸을 차지하지 않는다
    } else if (!this.padOn()) return false;
    const name = o.name ?? `raw:${s}/${w}/${d}`;
    if (!this.gate(name, Math.max(s, w), d)) return false;
    if (dev === 'pad') { this.clearTimers(); return this.padEffect(s, w, d); }
    return this.phone(v);
  }
  /** 패드 진동이 켜져 있나 (ctrlRumble > 0) */
  padOn() { return clamp01(this.settings.ctrlRumble ?? 0.8) > 0; }
  /** 휴대폰 진동 값 v 가 실제로 울리나 (값이 있고 settings.vibration 이 켜짐) */
  phoneOn(v) { return v !== false && v != null && v !== 0 && this.settings.vibration !== false; }

  /** 60ms 제한 + 더 센 효과 우선. 통과하면 재생 중 효과를 갱신 */
  gate(name, strength, dur) {
    const t = now();
    const last = this.last.get(name);
    if (last !== undefined && t - last < THROTTLE_MS) return false;
    const a = this.active;
    if (a && t < a.until && strength < a.strength - 1e-6) return false;
    this.last.set(name, t);
    if (this.last.size > 64) { for (const [k, v] of this.last) if (t - v > 1000) this.last.delete(k); }
    this.active = { strength, until: t + dur };
    return true;
  }

  padEffect(strong, weak, ms) {
    const k = clamp01(this.settings.ctrlRumble ?? 0.8);
    if (k <= 0) return false;
    const s = +(strong * k).toFixed(3), w = +(weak * k).toFixed(3);
    if (s <= 0 && w <= 0) return false;
    const pad = this.input?.activePad?.();
    const act = pad?.vibrationActuator;
    try {
      if (act?.playEffect) {
        this.calls++;
        const r = act.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: w, strongMagnitude: s });
        r?.catch?.(() => {});
        return true;
      }
      const br = typeof window !== 'undefined' ? window.BNAndroid : null;
      if (typeof br?.rumble === 'function') { this.calls++; br.rumble(s, w, ms); return true; }
    } catch { /* 지원하지 않는 기기 */ }
    return false;
  }

  phone(v) {
    if (v === false || v == null) return false;
    if (this.settings.vibration === false) return false;
    try {
      if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
      // 크롬은 첫 사용자 동작 전 vibrate 를 막고 콘솔에 경고를 남긴다
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
      this.calls++;
      navigator.vibrate(v);
      return true;
    } catch { return false; }
  }

  clearTimers() { for (const id of this.timers) clearTimeout(id); this.timers.length = 0; }

  reset() {
    this.clearTimers();
    const was = this.active && now() < this.active.until;
    this.active = null;
    if (!was) return;
    try {
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads || []) p?.vibrationActuator?.reset?.()?.catch?.(() => {});
      if (typeof navigator !== 'undefined' && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(0);
      window.BNAndroid?.rumble?.(0, 0, 0);
    } catch { /* 무시 */ }
  }

  /** 매 프레임 (input.pollFrame): 일시정지·메뉴 장면이면 멈춘다 */
  tick() {
    if (!this.active) return;
    const top = this.game?.top;
    if (top && QUIET_SCENES.has(top.name)) this.reset();
    else if (now() >= this.active.until && !this.timers.length) this.active = null;
  }
}

export const haptics = new Haptics();
