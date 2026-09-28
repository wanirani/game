// 채색 탈것: 스콜 (mt_direwolf, 서리 늑대) — owner: CMP-MOUNT-ART-B
// 부품은 Kling 옆모습 한 장(tools/painted/companions/mt_direwolf/src/mt_direwolf_ref.webp)에서 잘랐다 (config.json).
// 그리기는 src/render/mounts_b.js 의 채색 그리기가 한다 (늑대 리그: 꼬리 한 장을 띠로 굽힌다, 아래턱 = 송곳니 돌진·포효 때 벌린다).
//  효과: 얼음빛 눈 · 서리 숨 (콧김·포효) · 각성(유대 4) = 구운 틴트 'aw' (털이 더 희고 푸르게 빛난다) + 어깨·가슴의 서리 기운
import { loadRig } from '../kit.js';

const DIR = 'painted/companions/mt_direwolf';
const LEG = { flash: true, noDmg: true, deep: 0.6 };
/** 각성: 흰 털은 얼음빛 청백으로, 푸른 등 털은 더 짙고 밝은 청색으로 (가죽 안장 · 뼈 장식은 그대로) */
const AW_RULES = [
  { when: (h, s, l) => h > 180 && h < 250 && s > 0.08 && l > 0.2, h: 198, s: 1.35, s0: 0.06, l: 1.08, l0: 0.02 },
  { when: (h, s, l) => l > 0.62 && s < 0.25, h: 195, s: 1, s0: 0.14, l: 1.03 },
];
const DEF = {
  glow: '#8ac8ff',                                   // 돌진 잔상 (mount.ghost 기본색) — 구운 발광 실루엣
  outline: { width: 1.4, color: 'rgba(8,10,16,0.9)' },
  defaults: { flash: true, noDmg: true },
  parts: { foreU: LEG, foreL: LEG, hindU: LEG, hindL: LEG },
  tints: { aw: { rules: AW_RULES, parts: ['body', 'head', 'tail'], glow: '#c8f8ff' } },
};
const FX = {
  awBody: [['sh0', 7, 0.3], ['sh1', 6, 0.28], ['chest', 7, 0.3]],
};

export default {
  id: 'mt_direwolf', kind: 'companion',
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    rig.mount = { tint: 'aw', fx: FX };
    return rig;
  },
  /** 탈것은 mounts.drawMount → MOUNT_DRAW_B 가 두 층으로 그린다 (registry 직접 그리기 계약용 빈 함수) */
  draw() {},
};
