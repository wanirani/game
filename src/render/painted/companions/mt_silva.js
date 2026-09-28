// 채색 탈것: 실바 (mt_silva, 숲의 흰 사슴) — owner: CMP-MOUNT-ART-A
// 부품은 Kling 옆모습 한 장(tools/painted/companions/mt_silva/src/mt_silva_ref.webp, 좌우 반전)에서 잘랐다 (config.json).
// 복슬 꼬리는 한 덩이(띠 1개)로 뿌리에서 까딱인다 — 달리면 흰 꼬리를 치켜든다.
// 효과: 초록 눈빛 · 뿔 빛무리 (울음 'howl' 때 커지고 밝아진다) · 안개 콧김. 성스러운 반짝이는 mount_b.js 입자.
// 각성(유대 4) = 구운 틴트 'aw' (초록 뿔빛·잎 → 금빛) + 금빛 뿔 빛무리
import { loadRig } from '../kit.js';

const DIR = 'painted/companions/mt_silva';
const LEG = { flash: true, noDmg: true, deep: 0.62 };
/** 초록 빛(뿔·잎·덩굴) → 금빛. 흰 털·가죽 안장은 그대로 */
const AW_RULES = [
  { when: (h, s, l) => h > 70 && h < 170 && s > 0.18 && l > 0.2, h: 46, s: 0.95, l: 1.05, l0: 0.03 },
];
const DEF = {
  glow: '#8ac8ff',
  outline: { width: 1.4, color: 'rgba(20,24,20,0.85)' },
  defaults: { flash: true, noDmg: true },
  parts: { foreU: LEG, foreL: LEG, hindU: LEG, hindL: LEG },
  tints: { aw: { rules: AW_RULES, parts: ['head', 'body'], glow: '#fff0a0' } },
};
const FX = {
  eye: '#7affb0', eyeR: 2.2, snort: '#e8f0e8',
  glow: '#a8ff9a', awGlow: '#ffe890', awEye: '#fff4c0',
  head: [['a0', 8, 0.22], ['a1', 8, 0.22], ['a2', 7, 0.2], ['a3', 6, 0.18]],
  awHead: [['a0', 10, 0.34], ['a1', 10, 0.34], ['a2', 9, 0.3], ['a3', 8, 0.28]],
  awBody: [['lf0', 5, 0.35], ['lf1', 4, 0.3]],
};

export default {
  id: 'mt_silva', kind: 'companion',
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    rig.mount = { tint: 'aw', fx: FX };
    return rig;
  },
  draw() {},
};
