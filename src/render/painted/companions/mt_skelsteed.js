// 채색 탈것: 코슈타 (mt_skelsteed, 망령 해골마) — owner: CMP-MOUNT-ART-A
// 부품은 Kling 옆모습 한 장(tools/painted/companions/mt_skelsteed/src/mt_skelsteed_ref.webp)에서 잘랐다 (config.json).
// 뒷다리는 무릎(엉덩이 아래 슬개)에서 돈다: 넓적다리뼈는 옆구리에 그려진 채 두고 정강이·발목 아래가 움직인다.
// 효과: 파란 눈빛 · 갈기/꼬리/발굽의 영혼불 혀 · 갈비 속 불빛 (시간 함수, Math.random 없음) · 콧김 없음 (숨을 쉬지 않는다)
// 각성(유대 4) = 구운 틴트 'aw' (영혼불 청색 → 연둣빛 흰불) + 더 밝은 불꽃
import { loadRig } from '../kit.js';

const DIR = 'painted/companions/mt_skelsteed';
const LEG = { flash: true, noDmg: true, deep: 0.5 };
/** 영혼불(청록~청색, 채도·밝기 있는 픽셀)만 연둣빛 흰불로 옮긴다. 뼈·가죽·그림자는 그대로 */
const AW_RULES = [
  { when: (h, s, l) => h > 165 && h < 245 && s > 0.2 && l > 0.22, h: 146, s: 0.8, l: 1.06, l0: 0.04 },
];
const DEF = {
  glow: '#8ac8ff',
  outline: { width: 1.5, color: 'rgba(6,8,14,0.9)' },
  defaults: { flash: true, noDmg: true },
  parts: { foreU: LEG, foreL: LEG, hindU: LEG, hindL: LEG },
  tints: { aw: { rules: AW_RULES, glow: '#b0ffd8' } },
};
const FX = {
  eye: '#8ae8ff', eyeR: 2.6, snort: false,
  glow: '#6ad0ff', awGlow: '#b0ffd8', awEye: '#d8fff0', core: '#9ae0ff',
  mane: ['m0', 'm1', 'm2'], maneLen: 7, maneW: 2.2, maneA: 0.24,
  body: [['r0', 6, 0.32], ['r1', 6, 0.36], ['r2', 5, 0.3]],
  awBody: [['r0', 7, 0.45], ['r1', 7, 0.5], ['r2', 6, 0.42], ['r3', 5, 0.35]],
  tailFire: true, hoofs: true,
};

export default {
  id: 'mt_skelsteed', kind: 'companion',
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    rig.mount = { tint: 'aw', fx: FX };
    return rig;
  },
  draw() {},
};
