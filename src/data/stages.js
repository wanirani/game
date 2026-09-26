// [임시] 스테이지 정의 — 레벨 디자인 담당이 13개 스테이지 + 아레나로 확장
// stage = { id, chapter, name, sub, theme(render/background THEMES 키), bg, tex, tex2, tileStyle, music, level(적 레벨),
//   darkness(0~0.9), darkColor, liquid:'water'|'lava'|'poison'|'blood', boss, start(첫 방), rooms, docs:[비전서 id], next, mapPos:{x,y}, intro, outro }
import { ROOMS as S01 } from './maps/s01.js';

export const STAGES = {
  s01: { id: 's01', chapter: 1, name: '불타는 마을', sub: '에슈빌 외곽', theme: 'village', bg: 'bg/s01_village', tex: 'tex/tex_wood', tex2: 'tex/tex_dirt', tileStyle: 'wood',
    music: 's01', level: 1, darkness: 0.35, liquid: 'water', boss: 'b_nightwing', start: 'r1', rooms: S01, docs: [], next: 's02', mapPos: { x: 0.18, y: 0.78 } },
};
export const STAGE_ORDER = ['s01'];
