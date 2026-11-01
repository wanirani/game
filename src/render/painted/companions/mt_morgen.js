// 채색 탈것: 모르겐 (mt_morgen, 새벽 서약의 군마) — 8단계 portrait2 (외전 25장 동료, 예전엔 벡터만)
// 부품은 Higgsfield 옆모습 한 장(tools/painted/companions/mt_morgen/src/mt_morgen_ref.webp)에서 잘랐다: 그림메인(mt_warhorse) Kling 원본을
// 같은 자세 그대로 진주빛 말 · 금빛 새벽불 갈기 · 금테 은갑으로 다시 칠하고 실루엣 맞춤으로 그 틀에 겹쳐 놓았다 →
// config.json 의 자르기·피벗·틀 = mt_warhorse 것 그대로 (MOUNT_TUNE.mt_morgen = mt_warhorse 값: 같은 안장·등자·발 위치).
// 그리기는 src/render/mounts.js 의 네발 채색 그리기(paintedQuad). 카론(b_charon)의 두 말도 id mt_morgen 이라 이 그림으로 그려진다.
//  효과: 금빛 눈빛 · 콧김 · 각성(유대 4) = 구운 틴트 'aw'(금빛 갈기·꼬리가 새벽불로 타오름) + 마구의 불씨 + 갈기 끝 불꽃
import { loadRig } from '../kit.js';

const DIR = 'painted/companions/mt_morgen';
const LEG = { flash: true, noDmg: true, deep: 0.55 };
/** 각성: 금빛 갈기·꼬리만 더 밝은 새벽불 주황빛으로 (머리·꼬리 부품만; 흰 털·은갑은 그대로) */
const AW_RULES = [
  { when: (h, s, l) => h >= 30 && h < 62 && s > 0.3 && l > 0.45, h: 38, s: 1.15, l: 1.08, l0: 0.03 },
];
const DEF = {
  glow: '#ffe8a0',                                   // 돌진 잔상 (mount.ghost) — 구운 발광 실루엣
  outline: { width: 1.6, color: 'rgba(30,24,20,0.85)' },
  defaults: { flash: true, noDmg: true },
  parts: { foreU: LEG, foreL: LEG, hindU: LEG, hindL: LEG },
  tints: { aw: { rules: AW_RULES, parts: ['head', 'tail'], glow: '#ffd070' } },
};
const FX = {
  eye: '#ffe070', eyeR: 2.6, snort: '#e8e4d8',
  awGlow: '#ffd070', awEye: '#fff0b0',
  awBody: [['em0', 6, 0.5], ['em1', 6, 0.45], ['em2', 5, 0.4]],
  awMane: ['m0', 'm1'], maneLen: 7, maneW: 2.2, maneA: 0.3, core: '#fff0b0',
};

export default {
  id: 'mt_morgen', kind: 'companion',
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    rig.mount = { tint: 'aw', fx: FX };
    return rig;
  },
  /** 탈것은 mounts.drawMount 가 두 층으로 그린다 (registry 직접 그리기 계약용 빈 함수) */
  draw() {},
};
