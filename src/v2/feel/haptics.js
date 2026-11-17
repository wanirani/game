// 타격감 진동 (v2) — 표(table.js HAPTIC)의 무늬를 v1 진동 소유자(src/core/haptics.js)로 보낸다.
//  패드 = 듀얼 럼블(강·약·ms), 휴대폰 = navigator.vibrate 무늬. 설정(진동 켬/끔·세기)·60 ms 제한·'더 센 효과 우선'·일시정지 때 멈춤은 v1 이 맡는다.
//  v1 규칙과 다른 점: 휴대폰도 세기 M 부터 8 ms 짧은 틱을 준다 (선형 모터가 있는 요즘 기기 기준 — 약하면 설정 '진동 세기'로 줄인다).
import { haptics as core } from '../../core/haptics.js';
import { HAPTIC } from './table.js';

const TAB = new Map();
for (const k in HAPTIC) { const h = HAPTIC[k]; TAB.set(k, { s: h.pad[0], w: h.pad[1], ms: h.pad[2], o: { vibrate: h.phone ? h.phone : false, name: 'f3:' + k } }); }

export const feelHaptics = {
  last: '', count: 0, sent: 0,
  /** 이름 붙은 무늬 (HAPTIC 키). 장치가 울렸으면 true */
  play(name) {
    const h = TAB.get(name);
    if (!h) return false;
    this.last = name; this.count++;
    // 휴대폰만 울리는 무늬(패드 값 0)도 core.rumble 을 지나가게 아주 약한 값을 준다 — 패드에서는 사실상 느껴지지 않는다
    const ok = core.rumble(h.s || (h.o.vibrate ? 0.01 : 0), h.w, h.ms || 1, h.o);
    if (ok) this.sent++;
    return ok;
  },
  stop() { core.reset(); },
};
