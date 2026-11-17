// 환경 키트 — 재질 표. docs/v2/ENV_KIT.md §3
// tex: 텍스처 이름. B 가 이미 올리는 다섯 장(flag·block·brick·wood·dirt)은 그대로 다시 쓰고, 키트 전용 여섯 장(k_*)은 assets/v2/env/ 에 있다.
// tile: 무늬 한 번이 차지하는 세계 길이. tint: 색 배율. reg: 잡동사니 아틀라스(k_trim) 안의 조각 이름 (반복하지 않는다).
const px = (x, y, w, h) => [(x + 0.5) / 512, (y + 0.5) / 512, (x + w - 0.5) / 512, (y + h - 0.5) / 512];
/** k_trim.webp 안의 조각 (tools/v2/envkit_tex.py atlas_trim 과 같은 배치) → [u0, v0, u1, v1] */
export const TRIM = {
  timber: px(4, 4, 248, 248), glass: px(260, 4, 120, 120), glassDark: px(388, 4, 120, 120),
  straw: px(260, 132, 120, 120), metal: px(388, 132, 120, 120), cloth: px(4, 260, 120, 120), coal: px(132, 260, 120, 120),
  white: px(272, 400, 224, 96),
};
/** 키트가 새로 받는 텍스처 (파일 = assets/v2/env/<이름>.webp). repeat = 반복 + 밉맵 */
export const KIT_TEX = { k_cobble2: { repeat: true }, k_cobworn: { repeat: true }, k_rubble: { repeat: true }, k_thatch: { repeat: true }, k_soil: { repeat: true }, k_cellar: { repeat: true }, k_planks: { repeat: true }, k_bone: { repeat: true },
  k_ashlar: { repeat: true }, k_plaster: { repeat: true }, k_slate: { repeat: true }, k_cobble: { repeat: true }, k_flag: { repeat: true }, k_trim: { repeat: false },
  '../props/props_atlas': { repeat: false } };   // 구운 소품 아틀라스 = assets/v2/props/props_atlas.webp (이름이 env 폴더 기준 상대 경로다)
export const KMATS = {
  props: { tex: '../props/props_atlas', tile: 1, tint: [1, 1, 1] },          // 구운 소품 아틀라스 (baked.js — uv 는 묶음에 들어 있다)

  // 벽
  ashlar: { tex: 'k_ashlar', tile: 250, tint: [0.84, 0.85, 0.97] },          // 다듬은 돌 쌓기
  rubble: { tex: 'brick', tile: 210, tint: [0.8, 0.76, 0.86] },              // 거친 돌 (B 의 facade)
  stone: { tex: 'block', tile: 256, tint: [0.88, 0.88, 0.98] },              // 큰 돌 (단상·옹벽·계단)
  trimstone: { tex: 'block', tile: 170, tint: [1.08, 1.05, 1.1] },           // 밝은 마감 돌 (모서리돌·띠·창틀·갓돌)
  plaster: { tex: 'k_plaster', tile: 300, tint: [0.98, 0.9, 0.8] },          // 회벽
  slate: { tex: 'k_slate', tile: 190, tint: [0.78, 0.8, 0.98] },             // 지붕 돌기와
  // 바닥
  cobble: { tex: 'k_cobble', tile: 150, tint: [0.8, 0.8, 0.9] },          // 조약돌 길
  flags: { tex: 'k_flag', tile: 300, tint: [0.86, 0.86, 0.96] },             // 판석
  moss: { tex: 'flag', tile: 240, tint: [0.72, 0.8, 0.8] },                  // 이끼 낀 돌 (B 의 cobble 텍스처에 초록빛)
  slabs: { tex: 'flag', tile: 240, tint: [0.76, 0.78, 0.92] },                // 갈라진 큰 판석 (v1 손그림 타일 그대로 — 골목)
  dirt: { tex: 'dirt', tile: 340, tint: [1.05, 0.98, 0.95] },
  // WORLD 구역이 더한 재질 (tools/v2/world_tex.py — ENV_KIT.md §12)
  cobble2: { tex: 'k_cobble2', tile: 170, tint: [0.84, 0.84, 0.94] },       // 잔돌 포장 (광장)
  cobworn: { tex: 'k_cobworn', tile: 210, tint: [0.9, 0.86, 0.84] },         // 닳고 진흙에 묻힌 길 가운데
  fieldstone: { tex: 'k_rubble', tile: 280, tint: [0.86, 0.84, 0.92] },      // 막돌 쌓기 (굵은 회반죽)
  thatch: { tex: 'k_thatch', tile: 150, tint: [0.92, 0.88, 0.8] },           // 초가 지붕
  soil: { tex: 'k_soil', tile: 300, tint: [1.0, 0.96, 0.9] },                // 묘지 흙 + 마른 풀
  cellar: { tex: 'k_cellar', tile: 220, tint: [0.96, 1.0, 1.02] },           // 젖은 지하 돌
  planks: { tex: 'k_planks', tile: 150, tint: [1.0, 0.95, 0.9] },            // 낡은 널
  bone: { tex: 'k_bone', tile: 120, tint: [1.0, 0.98, 0.94] },               // 해골 더미 (납골 벽감)
  charred: { tex: 'k_trim', reg: 'timber', tile: 150, tint: [0.3, 0.27, 0.27], grain: true },   // 탄 나무 (들보 조각을 검게)
  // 나무
  wood: { tex: 'wood', tile: 128, tint: [1.2, 1.02, 0.88] },
  darkwood: { tex: 'wood', tile: 128, tint: [0.66, 0.52, 0.46] },
  // 아틀라스 조각
  timber: { tex: 'k_trim', reg: 'timber', tile: 150, tint: [0.92, 0.84, 0.8], grain: true },   // 어두운 참나무 (들보·문틀)
  glass: { tex: 'k_trim', reg: 'glass', tile: 44, tint: [1.5, 1.32, 1.1] },                     // 불 켜진 납선 유리 (emis 로 쓴다)
  glassDark: { tex: 'k_trim', reg: 'glassDark', tile: 44, tint: [1.1, 1.15, 1.3] },
  straw: { tex: 'k_trim', reg: 'straw', tile: 70, tint: [1.0, 0.95, 0.85] },
  metal: { tex: 'k_trim', reg: 'metal', tile: 60, tint: [0.8, 0.82, 0.92] },
  cloth: { tex: 'k_trim', reg: 'cloth', tile: 80, tint: [1, 1, 1] },
  coal: { tex: 'k_trim', reg: 'coal', tile: 40, tint: [1.7, 1.3, 1.0] },
  white: { tex: 'k_trim', reg: 'white', tile: 1e6, tint: [1, 1, 1] },
};
