// 채색 등록 모듈 — 패키지 ART-ENEMY-5 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
//
// ART-ENEMY-5 (s12–s13, 9종). 벡터 렌더러(enemies_b.js)는 그대로 남아 에셋이 없거나 로딩 중일 때 대신 그린다.
import * as bat_swarm from '../enemies/bat_swarm.js';
import * as royal_guard from '../enemies/royal_guard.js';
import * as hellhound from '../enemies/hellhound.js';
import * as shadow_hunter from '../enemies/shadow_hunter.js';
import * as chaos_spawn from '../enemies/chaos_spawn.js';
import * as abyss_eye from '../enemies/abyss_eye.js';
import * as vampire_bride from '../enemies/vampire_bride.js';
import * as void_demon from '../enemies/void_demon.js';
import * as demon_lord from '../enemies/demon_lord.js';

export const bosses = {};
export const enemies = [
  { mod: bat_swarm },
  { mod: royal_guard },
  { mod: hellhound },
  { mod: shadow_hunter },
  { mod: chaos_spawn },
  { mod: abyss_eye },
  { mod: vampire_bride },
  { mod: void_demon },
  { mod: demon_lord },
];
export const companions = {};
export const npcs = {};
