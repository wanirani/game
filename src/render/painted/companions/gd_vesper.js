// 채색 수호신: 베스퍼 (gd_vesper, 장미 향 나는 편지 박쥐) — 8단계 portrait2. T1 채색 퍼핏 (에셋 assets/painted/companions/gd_vesper/).
// 무닌(gd_munin.js)과 같은 짜임·같은 그리기(makeFlyer): body (귀·빨간 리본·얼굴·털 몸·늘어뜨린 발) · wingL / wingR (들어 올린 진홍 박쥐 날개,
//   어깨 피벗 — 몸 뒤에서 아래로 내려친다) · perch (봉인된 편지를 든 채 선 모습). 원본: Higgsfield 다시 그림 (tools/painted/companions/gd_vesper/parts.json).
// 박쥐라 날갯짓이 더 빠르고 눈이 둘 다 보인다. 각성: 장밋빛 기운.
import { makeFlyer } from './gd_munin.js';

export const spec = {
  id: 'gd_vesper', tier: 'T1', src: '../companions/gd_vesper',
  bake: { outline: 0.3, deep: { wingR: 0.82 }, deepTint: 'rgb(80,40,50)', flash: false },
};

export default makeFlyer(spec, { eye: '#ff4a5a', eyeR: 1.3, cast: '#ff8aa0', aura: '#ff6a8a', flap: 12, dn: 1.0, lift: 0, single: false });
