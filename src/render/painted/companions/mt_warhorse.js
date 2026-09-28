// 채색 탈것: 그림메인 (mt_warhorse, 흑철 군마) — owner: CMP-MOUNT-ART-A
// 부품은 Kling 옆모습 한 장(tools/painted/companions/mt_warhorse/src/mt_warhorse_ref.webp)에서 잘랐다 (config.json).
// 그리기는 src/render/mounts.js 의 네발 채색 그리기(paintedQuad)가 한다: 이 모듈은 굽기 옵션과 효과 표만 준다.
//  효과: 붉은 눈빛 · 대기 콧김(회색 연기) · 각성(유대 4) = 마구의 불씨 균열 + 갈기 끝 불꽃
import { loadRig } from '../kit.js';

const DIR = 'painted/companions/mt_warhorse';
const LEG = { flash: true, noDmg: true, deep: 0.55 };
const DEF = {
  glow: '#8ac8ff',                                   // 돌진 잔상 (mount.ghost 기본색) — 구운 발광 실루엣
  outline: { width: 1.6, color: 'rgba(8,5,10,0.9)' },
  defaults: { flash: true, noDmg: true },
  parts: { foreU: LEG, foreL: LEG, hindU: LEG, hindL: LEG },
};
const FX = {
  eye: '#ff5a2a', snort: '#b8b8c0',
  awGlow: '#ff8a2a', awEye: '#ffb050',
  awBody: [['em0', 6, 0.55], ['em1', 6, 0.5], ['em2', 5, 0.45]],
  awMane: ['m0', 'm1', 'm2'], maneLen: 7, maneW: 2.6, maneA: 0.5,
};

export default {
  id: 'mt_warhorse', kind: 'companion',
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    rig.mount = { tint: null, fx: FX };
    return rig;
  },
  /** 탈것은 mounts.drawMount 가 두 층으로 그린다 (registry 직접 그리기 계약용 빈 함수) */
  draw() {},
};
