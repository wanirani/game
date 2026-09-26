// 스테이지 정의 (13장 + 투기장). 맵은 data/maps/<id>.js 의 ROOMS.
// stage = { id, chapter, name, sub, theme(render/background THEMES 키), bg, tex, tex2, tileStyle(render/tiles TILE_STYLES 키), music,
//   level(적 레벨), darkness(0~0.9), darkColor, liquid:'water'|'lava'|'poison'|'blood', boss, start(첫 방), rooms,
//   enemies:[이 스테이지에 배치할 적 ID 후보], docs:[비전서 id(숨김 벽 'H' 순서대로)], relic(드라큘라 유물 id|null),
//   next(클리어 시 해금), unlocks:[추가 해금], mapPos:{x,y}(월드맵 0~1), parTime(초), intro/outro(스토리 스크립트 id), req(해금 조건 설명) }
import { ROOMS as S01 } from './maps/s01.js';
import { ROOMS as S02 } from './maps/s02.js';
import { ROOMS as S03 } from './maps/s03.js';
import { ROOMS as S04 } from './maps/s04.js';
import { ROOMS as S05 } from './maps/s05.js';
import { ROOMS as S06 } from './maps/s06.js';
import { ROOMS as S07 } from './maps/s07.js';
import { ROOMS as S08 } from './maps/s08.js';
import { ROOMS as S09 } from './maps/s09.js';
import { ROOMS as S10 } from './maps/s10.js';
import { ROOMS as S11 } from './maps/s11.js';
import { ROOMS as S12 } from './maps/s12.js';
import { ROOMS as S13 } from './maps/s13.js';
import { ROOMS as ARENA } from './maps/arena.js';

const S = (o) => ({ start: 'r1', parTime: 300, darkColor: '#06020c', liquid: 'water', docs: [], relic: null, unlocks: [], ...o, intro: o.intro ?? `${o.id}_intro`, outro: o.outro ?? `${o.id}_outro` });

export const STAGES = {
  s01: S({ id: 's01', chapter: 1, name: '불타는 마을', sub: '에슈빌 외곽', theme: 'village', bg: 'bg/s01_village', tex: 'tex/tex_wood', tex2: 'tex/tex_dirt', tileStyle: 'wood',
    music: 's01', level: 1, darkness: 0.3, boss: 'b_nightwing', rooms: S01, parTime: 240,
    enemies: ['bat', 'zombie', 'skeleton', 'crow', 'wolf', 'possessed'], docs: ['d01', 'd02'], next: 's02', mapPos: { x: 0.14, y: 0.8 } }),
  s02: S({ id: 's02', chapter: 2, name: '안개의 묘지', sub: '잠들지 못한 자들의 언덕', theme: 'graveyard', bg: 'bg/s02_graveyard', tex: 'tex/tex_mossy_stone', tex2: 'tex/tex_dirt', tileStyle: 'moss',
    music: 's02', level: 3, darkness: 0.45, boss: 'b_banshee', rooms: S02, parTime: 270,
    enemies: ['zombie', 'skeleton', 'ghost', 'wisp', 'bone_thrower', 'gravedigger', 'mud_man', 'crow'], docs: ['d03', 'd04'], next: 's03', mapPos: { x: 0.26, y: 0.66 } }),
  s03: S({ id: 's03', chapter: 3, name: '악마성 정문', sub: '도개교와 성벽', theme: 'gate', bg: 'bg/s03_gate', tex: 'tex/tex_castle_stone', tex2: 'tex/tex_wood', tileStyle: 'stone',
    music: 's03', level: 5, darkness: 0.4, boss: 'b_dullahan', rooms: S03, parTime: 300, relic: 'k_relic_1',
    enemies: ['armor_knight', 'axe_armor', 'gargoyle', 'medusa_head', 'medusa_spawner', 'skeleton_archer', 'bat', 'skeleton'], docs: ['d05', 'd06'], next: 's04', mapPos: { x: 0.38, y: 0.55 } }),
  s04: S({ id: 's04', chapter: 4, name: '대회랑', sub: '진홍의 입구 홀', theme: 'hall', bg: 'bg/s04_hall', tex: 'tex/tex_marble', tex2: 'tex/tex_castle_stone', tileStyle: 'marble',
    music: 's04', level: 8, darkness: 0.4, boss: 'b_crimson', rooms: S04, parTime: 300,
    enemies: ['blood_skeleton', 'phantom_sword', 'lesser_demon', 'spear_guard', 'puppet_maiden', 'armor_knight', 'axe_armor', 'mimic'], docs: ['d07', 'd08'], next: 's05', mapPos: { x: 0.47, y: 0.47 } }),
  s05: S({ id: 's05', chapter: 5, name: '지하 묘지', sub: '해골의 카타콤', theme: 'catacombs', bg: 'bg/s05_catacombs', tex: 'tex/tex_bone', tex2: 'tex/tex_castle_stone', tileStyle: 'bone',
    music: 's05', level: 11, darkness: 0.6, boss: 'b_bonedragon', rooms: S05, parTime: 330, relic: 'k_relic_2',
    enemies: ['bone_pillar', 'mummy', 'skeleton_knight', 'corpse_worm', 'bone_scimitar', 'bone_thrower', 'ghost'], docs: ['d09', 'd10'], next: 's06', mapPos: { x: 0.44, y: 0.66 } }),
  s06: S({ id: 's06', chapter: 6, name: '금단의 대도서관', sub: '잊힌 지식의 미궁', theme: 'library', bg: 'bg/s06_library', tex: 'tex/tex_library', tex2: 'tex/tex_wood', tileStyle: 'wood',
    music: 's06', level: 14, darkness: 0.45, boss: 'b_grimoire', rooms: S06, parTime: 330,
    enemies: ['book_fiend', 'flea_man', 'skeleton_mage', 'scholar_ghost', 'ectoplasm', 'lesser_demon', 'mimic'], docs: ['d11', 'd12'], next: 's07', mapPos: { x: 0.56, y: 0.38 } }),
  s07: S({ id: 's07', chapter: 7, name: '연금술 연구소', sub: '금단의 실험실', theme: 'alchemy', bg: 'bg/s07_alchemy', tex: 'tex/tex_lab', tex2: 'tex/tex_brass', tileStyle: 'lab',
    music: 's07', level: 17, darkness: 0.45, liquid: 'poison', boss: 'b_chimera', rooms: S07, parTime: 330, relic: 'k_relic_3',
    enemies: ['slime', 'homunculus', 'flesh_golem', 'plague_doctor', 'acid_turret', 'flea_man'], docs: ['d13'], next: 's08', mapPos: { x: 0.64, y: 0.5 } }),
  s08: S({ id: 's08', chapter: 8, name: '지하 수로', sub: '검은 물의 회랑', theme: 'waterway', bg: 'bg/s08_waterway', tex: 'tex/tex_wet_stone', tex2: 'tex/tex_castle_stone', tileStyle: 'wet',
    music: 's08', level: 20, darkness: 0.55, liquid: 'water', boss: 'b_leviathan', rooms: S08, parTime: 360,
    enemies: ['merman', 'killer_fish', 'frog_demon', 'drowned', 'water_spirit', 'bat'], docs: ['d14'], next: 's09', mapPos: { x: 0.58, y: 0.74 } }),
  s09: S({ id: 's09', chapter: 9, name: '시계탑', sub: '멈추지 않는 톱니', theme: 'clock', bg: 'bg/s09_clocktower', tex: 'tex/tex_brass', tex2: 'tex/tex_wood', tileStyle: 'brass',
    music: 's09', level: 24, darkness: 0.4, boss: 'b_colossus', rooms: S09, parTime: 360, relic: 'k_relic_4',
    enemies: ['gear_golem', 'harpy', 'clockwork_soldier', 'cog_wheel', 'medusa_head', 'medusa_spawner', 'flea_man'], docs: ['d15', 'd16'], next: 's10', mapPos: { x: 0.74, y: 0.3 } }),
  s10: S({ id: 's10', chapter: 10, name: '얼어붙은 첨탑', sub: '구름 위의 빙벽', theme: 'spire', bg: 'bg/s10_spire', tex: 'tex/tex_ice', tex2: 'tex/tex_castle_stone', tileStyle: 'ice',
    music: 's10', level: 28, darkness: 0.35, boss: 'b_frostqueen', rooms: S10, parTime: 360,
    enemies: ['ice_golem', 'frost_wraith', 'snow_wolf', 'frozen_knight', 'ice_bat', 'harpy'], docs: ['d17'], next: 's11', mapPos: { x: 0.84, y: 0.18 } }),
  s11: S({ id: 's11', chapter: 11, name: '피의 예배당', sub: '타락한 성소', theme: 'chapel', bg: 'bg/s11_chapel', tex: 'tex/tex_blood_marble', tex2: 'tex/tex_marble', tileStyle: 'blood',
    music: 's11', level: 32, darkness: 0.5, liquid: 'blood', boss: 'b_death', rooms: S11, parTime: 390, relic: 'k_relic_5',
    enemies: ['succubus', 'blood_priest', 'bone_angel', 'death_knight', 'cursed_nun', 'phantom_sword'], docs: ['d18'], next: 's12', mapPos: { x: 0.8, y: 0.44 } }),
  s12: S({ id: 's12', chapter: 12, name: '드라큘라의 왕좌', sub: '영원한 밤의 정점', theme: 'throne', bg: 'bg/s12_throne', tex: 'tex/tex_blood_marble', tex2: 'tex/tex_marble', tileStyle: 'blood',
    music: 's12', level: 36, darkness: 0.45, boss: 'b_dracula', rooms: S12, parTime: 420,
    enemies: ['vampire_bride', 'demon_lord', 'bat_swarm', 'death_knight', 'royal_guard', 'bat'], docs: ['d19'], next: null, mapPos: { x: 0.9, y: 0.08 } }),
  s13: S({ id: 's13', chapter: 13, name: '심연의 역성', sub: '거꾸로 선 혼돈의 성', theme: 'abyss', bg: 'bg/s13_abyss', tex: 'tex/tex_abyss', tex2: 'tex/tex_blood_marble', tileStyle: 'abyss',
    music: 's13', level: 45, darkness: 0.55, liquid: 'lava', boss: 'b_chaos', rooms: S13, parTime: 480,
    enemies: ['chaos_spawn', 'hellhound', 'abyss_eye', 'shadow_hunter', 'void_demon', 'death_knight', 'demon_lord'], docs: ['d20'], next: null, mapPos: { x: 0.5, y: 0.12 },
    req: '드라큘라의 유물 5개를 모두 모으고 드라큘라를 쓰러뜨리면 열린다' }),
  arena: S({ id: 'arena', chapter: 0, name: '피의 투기장', sub: '서바이벌 & 보스 러시', theme: 'arena', bg: 'bg/s_arena', tex: 'tex/tex_castle_stone', tex2: 'tex/tex_dirt', tileStyle: 'stone',
    music: 'arena', level: 10, darkness: 0.3, boss: null, rooms: ARENA, parTime: 600, intro: null, outro: null,
    enemies: [], next: null, mapPos: { x: 0.3, y: 0.3 } }),
};
export const STAGE_ORDER = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 's13'];
export const RELICS = ['k_relic_1', 'k_relic_2', 'k_relic_3', 'k_relic_4', 'k_relic_5'];
