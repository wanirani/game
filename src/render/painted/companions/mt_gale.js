// 채색 탈것: 게일 (mt_gale, 폭풍 그리핀) — owner: CMP-MOUNT-ART-B
// 부품은 Kling 옆모습 한 장(tools/painted/companions/mt_gale/src/mt_gale_ref.webp)에서 잘랐다 (config.json).
// 네발 엔진 + 깃털 날개 (날개 부품 한 장을 아핀으로 치고 접는다) · 꼬리 두 마디 (사자 꼬리 → 흰 털 뭉치).
// 뇌명 급강하 (mount_b.js): 도약 'jump' → 0.08초 날개를 치켜들고 멈칫 'dive' → 날개를 뒤로 접고 내리꽂힘 → 착지 'land' 웅크림.
// 번개 입자·몸을 감싸는 기운은 mount_b.js 가 낸다 (여기서는 두 번 그리지 않는다).
//  효과: 푸른 눈 · 가슴 보석의 은은한 빛 · 각성(유대 4) = 구운 틴트 'aw' (금빛 깃 끝이 번쩍이고 흰 깃이 푸르스름) + 날개 끝 금빛
import { loadRig } from '../kit.js';

const DIR = 'painted/companions/mt_gale';
const LEG = { flash: true, noDmg: true, deep: 0.6 };
/** 각성: 금빛 깃 끝 · 장식 → 더 밝은 금, 흰 깃 → 번개빛 도는 청백 (가죽 안장은 그대로) */
const AW_RULES = [
  { when: (h, s, l) => h > 34 && h < 62 && s > 0.3 && l > 0.3, h: 48, s: 1.2, l: 1.18, l0: 0.04 },
  { when: (h, s, l) => l > 0.68 && s < 0.2, h: 208, s: 1, s0: 0.1, l: 1.02 },
];
const DEF = {
  glow: '#8ac8ff',
  outline: { width: 1.4, color: 'rgba(10,10,16,0.9)' },
  defaults: { flash: true, noDmg: true },
  parts: { foreU: LEG, foreL: LEG, hindU: LEG, hindL: LEG, wing: { flash: true, noDmg: true, deep: 0.52 } },
  tints: { aw: { rules: AW_RULES, parts: ['wing', 'head', 'body'], glow: '#fff2a0' } },
};
const FX = {
  body: [['gem', 3.5, 0.3]],
  awBody: [['gem', 6, 0.5]],
  awWing: ['f1', 'f2'],
};

export default {
  id: 'mt_gale', kind: 'companion',
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    rig.mount = { tint: 'aw', fx: FX };
    return rig;
  },
  draw() {},
};
