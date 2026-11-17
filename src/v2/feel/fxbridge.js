// 효과(fx) ↔ 소리(feel) 다리 (v2 · 3D 판) — 검수(fxverify, 2026-11-17)에서 넣었다.
//
// 왜 있나: 효과 엔진(src/v2/fx)은 박자마다 자기 사건 이름 53개(`hit.slash.heavy` · `magic.fire.hit` · `ult.final` …)를 onEvent 로 내보내고,
// 소리 표(src/v2/feel/table.js)는 다른 이름 52개(`magic.fire.impact` · `bell.toll` …)와 feel.hit(무기, 재질, 세기) 를 쓴다.
// 두 이름표에서 겹치는 것은 3개(move.dash · move.jump · move.land)뿐이었다 → 그대로 이으면 효과 50종이 소리 없이 난다.
// 이 파일이 그 53개를 전부 소리 쪽 호출로 옮긴다 (전용 소리가 없는 것은 가장 가까운 것을 높낮이만 바꿔 쓴다 — 아래 표의 approx).
//
// 쓰는 법 (전문: docs/v2/FX.md §11):
//   import { feel } from '../feel/index.js';
//   import { bindFxSound } from '../feel/fxbridge.js';
//   const bridge = bindFxSound(feel);
//   const fx = createFx(gl, { tier, onEvent: bridge.onEvent });
//   매 프레임:  bridge.sync(fx);                                 // 느린 화면 → 소리 배속 (바뀔 때만 일한다)
//   타격:       bridge.strike(fx, 'sword', e.material ?? 'bone', 'H', FLAG.crit, x, y, z, dx, dz);   // 효과 + 소리 + 진동을 한 번에, 한 번씩만
//   그 밖:      fx.play('fire.bolt', …) 만 부르면 소리는 onEvent 로 따라 난다.
//
// 약속 (두 번 걸지 않기):
//   · 화면 연출값(멈춤·흔들림·밀림·줌·번쩍임·느린 화면)은 **효과 프리셋이 낸 것만** 쓴다. feel.hit 이 돌려주는 r.stop · r.shake · r.zoom · r.slow 는
//     참고값이다 — 프리셋을 낸 타격에 또 걸면 흔들림이 두 배가 된다 (addTrauma 는 더한다).
//   · 타격 소리는 이 다리가 feel.hit 으로 낸다 → 장면 코드는 같은 타격에 feel.hit 을 따로 부르지 않는다.
//   · 프레임당 할당 없음: 자리 객체 하나를 돌려 쓴다. 사건이 없을 때 하는 일은 sync 의 비교 한 번.
import { FLAG, EVENTS } from './table.js';
import { PRESET_IDS } from '../fx/presets.js';

const H = (weapon, strength, flags = 0) => Object.freeze({ k: 'hit', weapon, strength, flags });
const E = (name, vol = 1, pitch = 1, approx = false) => Object.freeze({ k: 'ev', name, vol, pitch, approx });
const V1 = (name, vol = 0.7) => Object.freeze({ k: 'v1', name, opt: Object.freeze({ vol }), approx: false });
const MUTE = (why) => Object.freeze({ k: 'mute', why });

/** fx 사건 이름 → 소리. approx = 전용 소리가 없어 가까운 것을 빌려 쓴 것 (들어 보고 따로 만들 후보) */
export const FX_SOUND = Object.freeze({
  // 타격: 무기·재질·세기는 strike() 가 넘긴 것을 쓰고, 프리셋만 따로 불렸으면 여기 적힌 기본값
  'hit.slash.light': H('sword', 'L'),
  'hit.slash.heavy': H('sword', 'H'),
  'hit.blunt': H('blunt', 'H'),
  'hit.pierce': H('dagger', 'M'),
  'hit.crit': H('sword', 'M', FLAG.crit),
  'hit.guard': H('sword', 'M', FLAG.guard),
  'hit.parry': H('sword', 'H', FLAG.parry),
  'hit.finisher': H('sword', 'F', FLAG.finisher | FLAG.kill),
  'feel.slowmo': MUTE('마무리 일격의 소리 층(kill_slowmo)에 이미 들어 있다; 배속은 sync 가 넘긴다'),
  'swing.light': Object.freeze({ k: 'swing', strength: 'L' }),
  'swing.heavy': Object.freeze({ k: 'swing', strength: 'H' }),
  // 이동
  'move.dash': E('move.dash'), 'move.jump': E('move.jump'), 'move.land': E('move.land'),
  'move.step': Object.freeze({ k: 'step' }),
  // 적
  'enemy.hurt': MUTE('타격 소리(feel.hit)가 같은 순간에 난다'),
  'enemy.death.bone': E('enemy.skel.collapse'),
  'enemy.death.ash': E('magic.blood.impact', 0.7, 0.7, true),
  'enemy.breath.cast': E('magic.fire.charge', 1, 0.8, true),
  'enemy.breath.fire': V1('fire_breath', 0.8),
  // 버프 · 줍기 (v1 효과음을 그대로)
  'buff.shield': E('magic.holy.charge', 0.8, 1.2, true),
  'pickup.coin': V1('coin', 0.6), 'pickup.heal': V1('heal', 0.7), 'pickup.mana': V1('item', 0.7),
  // 마법 — 불
  'magic.fire.cast': E('magic.fire.charge'), 'magic.fire.fly': E('magic.fire.release'), 'magic.fire.hit': E('magic.fire.impact'),
  'magic.fire.pillar': E('magic.fire.impact', 1, 0.86, true),
  'magic.meteor.cast': E('magic.fire.charge', 1, 0.75, true), 'magic.meteor.fall': E('magic.fire.release', 1, 0.7, true), 'magic.meteor.impact': E('magic.fire.impact', 1, 0.7, true),
  // 얼음
  'magic.ice.cast': E('magic.ice.charge'), 'magic.ice.fly': E('magic.ice.release'), 'magic.ice.hit': E('magic.ice.impact'),
  'magic.ice.nova.cast': E('magic.ice.charge', 1, 0.82, true), 'magic.ice.nova.burst': E('magic.ice.impact', 1, 0.82, true),
  // 번개
  'magic.lightning.cast': E('magic.lightning.charge'), 'magic.lightning.zap': E('magic.lightning.impact', 0.8, 1.12),
  'magic.thunder.charge': E('magic.lightning.charge', 1, 0.8, true), 'magic.thunder.strike': E('magic.lightning.impact', 1, 0.8, true),
  // 성 · 종
  'magic.holy.cast': E('magic.holy.charge'), 'magic.holy.pillar': E('magic.holy.impact'), 'magic.holy.wave': E('magic.holy.release'),
  'magic.bell.cast': E('magic.holy.charge', 0.8, 0.9, true), 'magic.bell.toll': E('bell.toll'),
  // 피 · 그림자
  'magic.blood.cast': E('magic.blood.charge'), 'magic.blood.fly': E('magic.blood.release'), 'magic.blood.hit': E('magic.blood.impact'),
  'magic.shadow.cast': E('magic.blood.charge', 0.9, 0.8, true), 'magic.shadow.claw': E('magic.blood.impact', 0.8, 1.3, true),
  // 궁극기 「붉은 달의 종」
  'ult.cast': E('bell.bloodmoon'), 'ult.lance': E('magic.blood.release', 0.8, 1.15, true), 'ult.final': E('bell.toll', 1, 0.84, true),
});

/** (무기, 세기, flags) → 효과 프리셋 이름. 재질별 그림은 아직 없다 (docs/v2/FX.md §9-13) */
export function hitPreset(weapon, strength, flags = 0) {
  if (flags & FLAG.finisher) return 'hit.finisher';
  if (flags & (FLAG.guard | FLAG.parry)) return 'hit.guard';
  if (flags & FLAG.crit) return 'hit.crit';
  if (weapon === 'blunt') return 'hit.blunt';
  if (weapon === 'dagger' || weapon === 'arrow') return 'hit.pierce';
  return strength === 'H' || strength === 'F' || weapon === 'great' ? 'hit.slash.heavy' : 'hit.slash.light';
}

/** feel(소리 창구)에 묶인 다리를 만든다. feel = src/v2/feel/index.js 의 feel (또는 같은 모양의 것) */
export function bindFxSound(feel) {
  const pos = { x: 0, y: 0, z: 0 };                        // 돌려 쓰는 자리 객체 (사건마다 새로 만들지 않는다)
  const B = {
    weapon: null, material: 'flesh', strength: null, flags: -1,   // strike() 가 타격 한 번 동안만 채운다
    speed: 200,                                             // 발소리의 빠르기 (장면이 영웅 속도를 넣어 둔다: 150 미만 걷기 · 300 이상 질주)
    last: null,                                             // 마지막 타격의 레시피 (참고값: r.spark 재질 불티 종류 · r.haptic …)
    unknown: 0, timeScale: 1,
    /** createFx(gl, { onEvent: bridge.onEvent }) */
    onEvent(name, x, y, z, vol) {
      const m = FX_SOUND[name]; if (!m) { B.unknown++; return; }
      const k = m.k; if (k === 'mute') return;
      pos.x = x; pos.y = y; pos.z = z;
      if (k === 'hit') {
        const w = B.weapon ?? m.weapon, st = B.strength ?? m.strength, fl = B.flags >= 0 ? B.flags | (m.flags & (FLAG.guard | FLAG.parry)) : m.flags;
        B.last = feel.hit(w, B.material, st, fl, pos);
      } else if (k === 'ev') feel.play(m.name, pos, m.vol * (vol > 0 ? vol : 1), m.pitch);
      else if (k === 'swing') feel.swing(B.weapon ?? 'sword', m.strength, pos);
      else if (k === 'step') feel.step(B.speed, pos);
      else if (k === 'v1') { try { feel.sound.host.sfx(m.name, m.opt); } catch { /* 소리 없음 */ } }
    },
    /** 타격 한 번: 효과 프리셋 + 소리 + 진동. (x,y,z) = 맞은 점, (dx,dz) = 치는 방향. → 소리 레시피(참고값) */
    strike(fx, weapon, material, strength, flags, x, y, z, dx, dz) {
      B.weapon = weapon; B.material = material; B.strength = strength; B.flags = flags; B.last = null;
      const name = hitPreset(weapon, strength, flags);
      if (fx) fx.playAt(PRESET_IDS[name], x, y, z, dx, dz, flags & FLAG.parry ? 1.5 : 1, x, y, z);
      else B.onEvent(flags & FLAG.parry ? 'hit.parry' : name, x, y, z, 1);          // 효과 엔진이 없을 때(WebGL1): 소리만
      B.weapon = null; B.material = 'flesh'; B.strength = null; B.flags = -1;
      return B.last;
    },
    /** 프레임마다: 느린 화면이면 소리도 낮고 어둡게 (값이 바뀔 때만 feel 을 부른다) */
    sync(fx) {
      const F = fx ? fx.feel : null, s = F && F.slowT > 0 ? F.slowScale : 1;
      if (s !== B.timeScale) { B.timeScale = s; feel.setTimeScale(s); }
    },
  };
  return B;
}

/** 검사용: 표에 적힌 소리 이름이 모두 실제로 있는가 → 없는 것의 목록 ([] 이면 정상) */
export function checkFxSound(fxEventNames, v1Names = null) {
  const bad = [];
  for (const n of fxEventNames) {
    const m = FX_SOUND[n];
    if (!m) { bad.push(n + ': 표에 없음'); continue; }
    if (m.k === 'ev' && !Object.hasOwn(EVENTS, m.name)) bad.push(`${n} → ${m.name}: 소리 표에 없는 이름`);
    if (m.k === 'v1' && v1Names && !v1Names.includes(m.name)) bad.push(`${n} → v1 ${m.name}: 없는 효과음`);
  }
  return bad;
}
