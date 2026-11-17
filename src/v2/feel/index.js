// 타격감 (v2 · 3D 판) — 소리 + 진동 + 추천 연출값의 한 창구. 계약·사건 이름·숫자: docs/v2/SOUND_FEEL.md
//
//   import { feel } from '../feel/index.js';
//   feel.setRoom('alley');                                   // 구역이 바뀔 때: 'street' | 'alley' | 'courtyard' | 'hall'
//   feel.setListener(cam.px, cam.py, cam.pz, cam.fx, cam.fy, cam.fz, cam.dist);   // 프레임마다 (대입 몇 번 — 할당 없음)
//   feel.swing('sword', 'M', hero);                          // 휘두름 시작 (닿기 lead 초 전) → { lead }
//   const r = feel.hit('sword', 'bone', 'H', FLAG.crit | FLAG.kill, enemy);   // 닿는 순간 → { stop, shake, kick, zoom, zoomT, slow, spark … } 를 효과 쪽이 쓴다
//   feel.step(speed, hero);  feel.play('move.dash', hero);  feel.play('magic.fire.impact', pos);  feel.play('bell.dawn');  feel.play('ui.ok');
//   const id = feel.loopStart('loop.magic.fire', shot);  feel.loopMove(id, shot);  feel.loopStop(id);
//   feel.setTimeScale(0.25);                                 // 느린 화면 동안 (끝나면 1)
//   feel.update();                                           // 프레임마다 불러도 된다 (0.5초에 한 번만 일한다)
//
//  pos 는 {x, y, z} 를 가진 아무 객체 (적·탄 객체를 그대로 넘긴다 — 새 객체를 만들지 않는다). 없으면 화면 가운데.
import { FeelSound } from './sound.js';
import { feelHaptics } from './haptics.js';
import { EVENTS, FLAG, MAGIC_EVENT, BELL_EVENT } from './table.js';

export * from './table.js';
export { FeelSound, ROOMS, BUS, SYN, NEW_DIR } from './sound.js';
export { feelHaptics } from './haptics.js';

class Feel {
  constructor(sound = new FeelSound()) { this.sound = sound; this.haptics = feelHaptics; this.vibrate = true; }
  /** 스테이지 로딩 때 한 번 (첫 입력 뒤): 샘플을 미리 받는다 */
  preload() { return this.sound.preload(); }
  setListener(px, py, pz, fx, fy, fz, ref, tan) { this.sound.setListener(px, py, pz, fx, fy, fz, ref, tan); }
  setRoom(name) { this.sound.setRoom(name); }
  setTimeScale(s) { this.sound.setTimeScale(s); }
  setQuality(q) { this.sound.setQuality(q); }
  update() { this.sound.update(); }
  release() { this.sound.release(); }
  _hap(name) { if (name && this.vibrate) this.haptics.play(name); }
  swing(weapon, strength, pos) { return this.sound.swing(weapon, strength, pos); }
  /** 타격 한 번: 소리 + 진동 → 레시피 (경직·흔들림·줌·느린 화면 추천값). flags = FLAG 비트 합 */
  hit(weapon, material, strength, flags = 0, pos = null) { const r = this.sound.hit(weapon, material, strength, flags, pos); this._hap(r.haptic); return r; }
  /** 막힘·받아치기 줄임 */
  guard(weapon, pos) { return this.hit(weapon, 'armor', 'M', FLAG.guard, pos); }
  parry(weapon, pos) { return this.hit(weapon, 'armor', 'H', FLAG.parry, pos); }
  step(speed, pos) { return this.sound.step(speed, pos); }
  /** 사건 이름으로 (EVENT_NAMES) → 레시피 | null */
  play(name, pos = null, vol = 1, pitch = 1) { const r = this.sound.play(name, pos, vol, pitch); if (r) this._hap(r.haptic); return r; }
  /** 마법: phase = 'charge' | 'release' | 'impact' */
  magic(element, phase, pos) { const m = MAGIC_EVENT[element]; return m && m[phase] ? this.play(m[phase], pos) : null; }
  /** 종 가락: 'dawn' | 'dusk' | 'bloodmoon' | 'return' | 'still' · 깊은 종 = 'toll' */
  bell(name) { const n = BELL_EVENT[name]; return n ? this.play(n) : null; }
  loopStart(name, pos = null, vol = 1) { return this.sound.loopStart(name, pos, vol); }
  loopMove(id, pos) { this.sound.loopMove(id, pos); }
  loopStop(id, fade) { this.sound.loopStop(id, fade); }
  has(name) { return Object.hasOwn(EVENTS, name); }
}
export { Feel };
export const feel = new Feel();
