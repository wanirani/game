// 채색 등록 모듈 — 패키지 ART-ENEMY-4 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
//
// ART-ENEMY-4 (s10–s11, 10종). 벡터 렌더러(enemies_b.js)는 그대로 남아 에셋이 없거나 로딩 중일 때 대신 그린다.
import * as ice_bat from '../enemies/ice_bat.js';
import * as snow_wolf from '../enemies/snow_wolf.js';
import * as frozen_knight from '../enemies/frozen_knight.js';
import * as death_knight from '../enemies/death_knight.js';

export const bosses = {};
export const enemies = [
  { mod: ice_bat },
  { mod: snow_wolf },
  { mod: frozen_knight },
  { mod: death_knight },
];
export const companions = {};
export const npcs = {};
