// NPC 정의. NPCS[id] = { id, name, title, portrait, role, services, look(render/hero.js look 스키마), desc, appear? }
//  · 대화 스크립트는 data/story.js 의 resolveNpcScript(npcId, state) 가 챕터/플래그에 따라 고른다 (<npcId>_ch<N> → 팁 순환 → <npcId>_default)
//  · role: 'inn'(여관·미니게임) 'shop'(상점) 'smith'(강화) 'church'(전직·스토리) 'villager' 'mystery' 'stable'(영혼의 마구간)
//  · appear: 허브(마을)에 모습을 보이는 조건 — npcVisible(npcId, state) 로 판정 (맵 'N' 배치는 조건 없이 등장)
export const NPCS = {
  npc_marta: {
    id: 'npc_marta', name: '마르타', title: '흑묘 여관 주인', portrait: 'portraits/npc_marta', role: 'inn', services: ['inn', 'minigame', 'quest'],
    desc: '에슈빌의 흑묘 여관을 꾸려 가는 호쾌한 여주인. 어깨 위의 검은 고양이 "백작님"과 한 몸처럼 붙어 다닌다. 엘리제의 이모.',
    look: { build: 'broad', height: 0.96, skin: '#f0cdb4', hair: '#b4502a', hairStyle: 'braid', eyes: '#3f9a52', outfit: 'innkeeper',
      primary: '#3c3640', secondary: '#231e26', trim: '#efe4cf', pants: '#231e26', boots: '#1a1014', fem: true },
  },
  npc_rook: {
    id: 'npc_rook', name: '로크', title: '떠돌이 상인', portrait: 'portraits/npc_rook', role: 'shop', services: ['shop', 'quest'],
    desc: '까마귀 부리 가면을 쓴 수수께끼의 상인. 성 안이든 밖이든 어디에나 불쑥 나타나 물건을 판다. 가면 아래 얼굴을 본 사람은 없다.',
    look: { build: 'normal', height: 1.04, skin: '#c8a080', hair: '#1a1418', hairStyle: 'short', eyes: '#ffc040', eyeGlow: true, outfit: 'merchant',
      primary: '#241f26', secondary: '#5a4028', trim: '#b89a60', pants: '#1c1a1e', boots: '#16100c', headgear: 'hood', headColor: '#1c181e',
      scarf: { color: '#2e2a30' } },
  },
  npc_hadwin: {
    id: 'npc_hadwin', name: '하드윈', title: '대장장이', portrait: 'portraits/npc_hadwin', role: 'smith', services: ['smith', 'enhance', 'quest'],
    desc: '말수 적은 거한 대장장이. 망치질 소리로 대화한다는 농담이 있을 정도. 무기를 보면 주인의 실력을 안다고 한다.',
    look: { build: 'huge', height: 1.04, skin: '#c89070', hair: '#7a6450', hairStyle: 'bald', beard: 'full', eyes: '#5a3a24', outfit: 'smith',
      primary: '#5a4838', secondary: '#6a4424', trim: '#8a8e9a', pants: '#2a2420', boots: '#1a1410', armor: null },
  },
  npc_alberto: {
    id: 'npc_alberto', name: '알베르토 신부', title: '에슈빌 성당 사제', portrait: 'portraits/npc_alberto', role: 'church', services: ['church', 'classChange', 'quest'],
    desc: '에슈빌 성당을 지키는 노신부. 헌터들을 이끄는 멘토이자, 악마성에 대해 이상할 만큼 많은 것을 알고 있는 인물.',
    look: { build: 'normal', height: 0.97, skin: '#e0c0a0', hair: '#dcd8d2', hairStyle: 'short', beard: 'full', eyes: '#6a5a4a', outfit: 'priest',
      primary: '#141018', secondary: '#2a2030', trim: '#e8c872', pants: '#141018', boots: '#100c10', headgear: null },
  },
  npc_elise: {
    id: 'npc_elise', name: '엘리제', title: '에슈빌의 소녀', portrait: 'portraits/npc_elise', role: 'villager', services: ['quest'],
    desc: '성 루미나의 피를 이은 마을 소녀. 겁이 많지만 누구보다 씩씩하다. 1장에서 백작의 거대한 박쥐에게 납치된다.',
    appear: { hideFrom: 1, hideUntil: 4 },
    look: { build: 'slim', height: 0.78, skin: '#f8e0d0', hair: '#e8c070', hairStyle: 'braid', eyes: '#b08040', outfit: 'girl',
      primary: '#d8c8a4', secondary: '#8a5a3a', trim: '#f4ece0', pants: '#f0e8e0', boots: '#4a3020' },
  },
  npc_carmilla: {
    id: 'npc_carmilla', name: '카밀라', title: '흡혈귀 귀부인', portrait: 'portraits/npc_carmilla', role: 'mystery', services: [],
    desc: '백작의 가장 오래된 "딸" 중 하나. 우아하고 변덕스러우며, 속내를 알 수 없다. 그녀를 믿을지는 당신의 몫이다.',
    appear: { minChapter: 6, flag: 'carmilla_trust1' },
    look: { build: 'slim', height: 1.03, skin: '#f4e6ea', hair: '#141018', hairStyle: 'flowing', eyes: '#ff3040', eyeGlow: true, outfit: 'lady',
      primary: '#2a0812', secondary: '#12060c', trim: '#c8a040', pants: '#12060c', boots: '#0a0608', cape: { color: '#1a0610', color2: '#6a0a20', len: 0.9 } },
  },
  // 영혼의 마구간 (companions §2.2): 1장부터 동쪽 성문 밖 마구간 앞에 선다. role 'stable' = 탈것·수호신·공물·그레타의 의뢰
  npc_greta: {
    id: 'npc_greta', name: '그레타', title: '영혼의 마구간지기', portrait: 'portraits/npc_greta', role: 'stable', services: ['stable', 'quest'],
    desc: '불타 버린 에슈빌 외곽 목장의 주인. 짐승의 말과 죽은 이의 속삭임을 듣는다는 소문이 있다. 무뚝뚝하지만 동물 앞에서는 누구보다 다정하다.',
    appear: { minChapter: 1 },
    look: { build: 'broad', height: 1.0, skin: '#d8a888', hair: '#c8b8a0', hairStyle: 'braid', eyes: '#5a9ab0', outfit: 'villager',
      primary: '#4a3624', secondary: '#2a3a2e', trim: '#b89a60', pants: '#3a2a1a', boots: '#2a1a10', headgear: 'wide_hat', headColor: '#2a2018',
      scarf: { color: '#7a2a1a' }, fem: true },
  },
};

export const NPC_ORDER = ['npc_alberto', 'npc_marta', 'npc_rook', 'npc_hadwin', 'npc_elise', 'npc_carmilla', 'npc_greta'];

/** 마을(허브)에 이 NPC가 지금 보여야 하는가 (엘리제는 납치~구출 사이 부재, 카밀라는 신뢰한 경우 밤의 여관에 등장) */
export function npcVisible(npcId, state) {
  const n = NPCS[npcId];
  if (!n) return false;
  const a = n.appear;
  if (!a) return true;
  const ch = state?.progress?.chapter ?? 0;
  const f = state?.progress?.flags ?? {};
  if (a.hideFrom != null && ch >= a.hideFrom && ch < a.hideUntil && !f.elise_rescued) return false;
  if (a.minChapter != null && ch < a.minChapter) return false;
  if (a.flag && !f[a.flag]) return false;
  return true;
}
