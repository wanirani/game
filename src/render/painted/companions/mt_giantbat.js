// 채색 탈것: 녹티스 (mt_giantbat, 거대 흡혈 박쥐) — owner: CMP-MOUNT-ART-B
// 부품은 Kling 옆모습 한 장(tools/painted/companions/mt_giantbat/src/mt_giantbat_ref.webp)에서 잘랐다 (config.json).
// 박쥐 리그 (mounts_b.js batPose): 땅에서는 날개 손목을 딛고 기고, 날 때는 날개 부품 한 장을 아핀으로 친다 (먼 날개 · 먼 다리 = 어두운 변형).
//  효과: 붉은 눈 · 초음파·흡혈 급습 때 입속 불빛 · 각성(유대 4) = 구운 틴트 'aw' (날개막 핏줄이 선홍으로 빛난다) + 날개 핏줄 빛
import { loadRig } from '../kit.js';

const DIR = 'painted/companions/mt_giantbat';
/** 각성: 핏빛 날개막 · 귀 속 → 선홍으로 밝게 (검은 털 · 은 안장은 그대로) */
const AW_RULES = [
  { when: (h, s, l) => (h < 20 || h > 330) && s > 0.3 && l > 0.1, h: 352, s: 1.2, l: 1.28, l0: 0.04 },
];
const DEF = {
  glow: '#8ac8ff',
  outline: { width: 1.4, color: 'rgba(10,4,8,0.9)' },
  defaults: { flash: true, noDmg: true },
  parts: { leg: { flash: true, noDmg: true, deep: 0.6 }, wing: { flash: true, noDmg: true, deep: 0.5 } },
  tints: { aw: { rules: AW_RULES, parts: ['wing', 'head', 'body'], glow: '#ff7a8a' } },
};
const FX = {
  awWing: ['mem', 'mid', 'f3'],
};

export default {
  id: 'mt_giantbat', kind: 'companion',
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    rig.mount = { tint: 'aw', fx: FX };
    return rig;
  },
  draw() {},
};
