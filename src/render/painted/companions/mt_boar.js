// 채색 탈것: 바르그 (mt_boar, 철엄니 멧돼지) — owner: CMP-MOUNT-ART-A
// 부품은 Kling 옆모습 한 장(tools/painted/companions/mt_boar/src/mt_boar_ref.webp)에서 잘랐다 (config.json).
// 그리기는 src/render/mounts.js 의 네발 채색 그리기(paintedQuad): 이 모듈은 굽기 옵션과 효과 표만 준다.
//  효과: 붉은 눈빛 · 대기 콧김(흙먼지색) · 각성(유대 4) = 엄니 세 개가 달군 쇠처럼 빛나고 엉덩이 흉터가 달아오른다
import { loadRig } from '../kit.js';

const DIR = 'painted/companions/mt_boar';
const LEG = { flash: true, noDmg: true, deep: 0.55 };
const DEF = {
  glow: '#8ac8ff',
  outline: { width: 1.6, color: 'rgba(8,5,4,0.9)' },
  defaults: { flash: true, noDmg: true },
  parts: { foreU: LEG, foreL: LEG, hindU: LEG, hindL: LEG },
};
const FX = {
  eye: '#ff3a2a', snort: '#9a8a70',
  awGlow: '#ff7a2a', awEye: '#ffb040',
  awHead: [['t0', 5, 0.55], ['t1', 4, 0.45], ['t2', 3, 0.4]],
  awBody: [['sc0', 5, 0.45]],
};

export default {
  id: 'mt_boar', kind: 'companion',
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    rig.mount = { tint: null, fx: FX };
    return rig;
  },
  draw() {},
};
