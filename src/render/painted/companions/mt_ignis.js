// 채색 탈것: 이그니스 (mt_ignis, 화염 군마) — owner: CMP-MOUNT-ART-A
// 부품은 Kling 옆모습 한 장(tools/painted/companions/mt_ignis/src/mt_ignis_ref.webp)에서 잘랐다 (config.json).
// 불꽃 갈기·꼬리·발목 불깃은 그림에 그려져 있다. 대기 불씨는 mount_b.js 가 입자로 뿜으므로 여기서는 겹치지 않게
// 용암 균열의 맥동 · 눈 · 입 속 불 · 발굽 불빛 · 불티 콧김만 그린다 (시간 함수, Math.random 없음).
// 앞들기(rear) → 내리찍기(special) 는 리그 자세(rearK · pitch)를 그대로 따른다.
// 각성(유대 4) = 구운 틴트 'aw' (불꽃·용암 → 백열) + 더 밝은 균열
import { loadRig } from '../kit.js';

const DIR = 'painted/companions/mt_ignis';
const LEG = { flash: true, noDmg: true, deep: 0.5 };
/** 불꽃·용암(주황~노랑, 채도·밝기 있는 픽셀) → 백열. 검은 털·가죽·쇠사슬은 그대로 */
const AW_RULES = [
  { when: (h, s, l) => h > 4 && h < 58 && s > 0.35 && l > 0.28, h: 48, s: 0.72, l: 1.16, l0: 0.1 },
];
const DEF = {
  glow: '#8ac8ff',
  outline: { width: 1.5, color: 'rgba(10,4,2,0.9)' },
  defaults: { flash: true, noDmg: true },
  parts: { foreU: LEG, foreL: LEG, hindU: LEG, hindL: LEG },
  tints: { aw: { rules: AW_RULES, glow: '#fff4c0' } },
};
const FX = {
  eye: '#ffd060', eyeR: 2.6, snort: '#ff9a3a',
  glow: '#ff8a2a', awGlow: '#fff0b0', awEye: '#ffffff',
  head: [['mouth', 5, 0.4]],
  awHead: [['mouth', 7, 0.55]],
  body: [['l0', 6, 0.28], ['l2', 6, 0.28], ['l3', 5, 0.24]],
  awBody: [['l0', 8, 0.42], ['l2', 8, 0.42], ['l3', 7, 0.38]],
  hoofs: true,
};

export default {
  id: 'mt_ignis', kind: 'companion',
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    rig.mount = { tint: 'aw', fx: FX };
    return rig;
  },
  draw() {},
};
