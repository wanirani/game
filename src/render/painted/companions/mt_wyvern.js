// 채색 탈것: 스칼렛 (mt_wyvern, 진홍 비룡) — owner: CMP-MOUNT-ART-B
// 부품은 Kling 옆모습 한 장(tools/painted/companions/mt_wyvern/src/mt_wyvern_ref.webp: 좌우 반전 + 안장 덧그리기)에서 잘랐다 (config.json).
// 그림이 네발 비룡이라 네발 엔진 + 날개로 움직인다 (날개 부품 한 장을 어깨·손목·날개 끝 세 점 아핀으로 치고 접는다; 먼 날개 = 어두운 변형).
// 꼬리 = 부품 세 마디 (tail0 → tail2 삽 끝). 그리기는 src/render/mounts_b.js.
//  효과: 금빛 눈 · 목구멍 불씨 (늘 은은히) · 화염 숨결 때 입속 불빛 · 각성(유대 4) = 구운 틴트 'aw' (비늘이 불타는 주홍, 배 비늘 금빛) + 배의 불빛
import { loadRig } from '../kit.js';

const DIR = 'painted/companions/mt_wyvern';
const LEG = { flash: true, noDmg: true, deep: 0.58 };
/** 각성: 진홍 비늘 → 타오르는 주홍, 주황 배 비늘 → 금빛 (검은 뿔 · 가죽 안장은 그대로) */
const AW_RULES = [
  { when: (h, s, l) => (h < 16 || h > 335) && s > 0.35 && l > 0.08, h: 8, s: 1.1, l: 1.22, l0: 0.04 },
  { when: (h, s, l) => h >= 16 && h < 48 && s > 0.45 && l > 0.3, h: 40, s: 1.1, l: 1.15, l0: 0.05 },
];
const DEF = {
  glow: '#8ac8ff',
  outline: { width: 1.4, color: 'rgba(12,4,6,0.9)' },
  defaults: { flash: true, noDmg: true },
  parts: { foreU: LEG, foreL: LEG, hindU: LEG, hindL: LEG, wing: { flash: true, noDmg: true, deep: 0.5 } },
  tints: { aw: { rules: AW_RULES, parts: ['body', 'head', 'wing', 'tail0', 'tail1', 'tail2'], glow: '#ffb060' } },
};
const FX = {
  awBody: [['belly', 10, 0.3], ['chest', 8, 0.26]],
};

export default {
  id: 'mt_wyvern', kind: 'companion',
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    rig.mount = { tint: 'aw', fx: FX };
    return rig;
  },
  draw() {},
};
