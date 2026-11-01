// 채색 탈것: 아르겐 (mt_argen, 은빛 뇌룡) — 8단계 portrait2 (외전 21장 동료, 예전엔 벡터만)
// 부품은 Higgsfield 옆모습 한 장(tools/painted/companions/mt_argen/src/mt_argen_ref.webp)에서 잘랐다: 스칼렛(mt_wyvern) Kling 원본을
// 같은 자세 그대로 은빛으로 다시 칠하고 실루엣 맞춤으로 그 틀에 겹쳐 놓았다 → config.json 의 자르기·피벗·틀 = mt_wyvern 것 그대로
// ('wyvern' 템플릿 · 안장 (-10, -58) · 등자 그림 공유). 그리기는 src/render/mounts_b.js (MOUNT_DRAW_B.mt_argen = drawB).
//  효과: 옥색 눈 · 목구멍 번개빛 (mounts_b.js MOUNT_PAL_B.mt_argen) · 각성(유대 4) = 구운 틴트 'aw' (은빛 비늘·상아 배 비늘 → 번개 옥빛) + 배의 빛
import { loadRig } from '../kit.js';

const DIR = 'painted/companions/mt_argen';
const LEG = { flash: true, noDmg: true, deep: 0.58 };
/** 꼬리 마디: 외곽선을 얇게 (마디 이음매의 잘린 가장자리 선이 덜 보이게) */
const TAIL = { flash: true, noDmg: true, outline: 0.6 };
/** 각성: 은빛·청회색 비늘과 상아 배 비늘 → 번개 옥빛 (짙은 남색 안장은 그대로: 밝기 0.3 미만은 건드리지 않는다) */
const AW_RULES = [
  { when: (h, s, l) => l > 0.3 && (s < 0.38 || (h > 170 && h < 250)), h: 188, s: 1.2, s0: 0.28, l: 1.08, l0: 0.02 },
];
const DEF = {
  glow: '#8ae8ff',
  outline: { width: 1.4, color: 'rgba(10,14,24,0.9)' },
  defaults: { flash: true, noDmg: true },
  parts: { foreU: LEG, foreL: LEG, hindU: LEG, hindL: LEG, wing: { flash: true, noDmg: true, deep: 0.5 }, tail0: TAIL, tail1: TAIL, tail2: TAIL },
  tints: { aw: { rules: AW_RULES, parts: ['body', 'head', 'wing', 'tail0', 'tail1', 'tail2'], glow: '#bff4ff' } },
};
const FX = {
  awBody: [['belly', 10, 0.3], ['chest', 8, 0.26]],
};

export default {
  id: 'mt_argen', kind: 'companion',
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    rig.mount = { tint: 'aw', fx: FX };
    return rig;
  },
  draw() {},
};
