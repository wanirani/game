// 채색 등록 모듈 — 패키지 ART-ENEMY-3 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
//
// ART-ENEMY-3 (s07–s09, 14종). 벡터 렌더러(enemies_b.js)는 그대로 남아 에셋이 없거나 로딩 중일 때 대신 그린다.
import * as slime from '../enemies/slime.js';
import * as killer_fish from '../enemies/killer_fish.js';
import * as cog_wheel from '../enemies/cog_wheel.js';
import * as acid_turret from '../enemies/acid_turret.js';
import * as plague_doctor from '../enemies/plague_doctor.js';
import * as homunculus from '../enemies/homunculus.js';
import * as flesh_golem from '../enemies/flesh_golem.js';
import * as merman from '../enemies/merman.js';
import * as frog_demon from '../enemies/frog_demon.js';
import * as drowned from '../enemies/drowned.js';
import * as water_spirit from '../enemies/water_spirit.js';
import * as gear_golem from '../enemies/gear_golem.js';

export const bosses = {};
export const enemies = [
  { mod: slime },
  { mod: killer_fish },
  { mod: cog_wheel },
  { mod: acid_turret },
  { mod: plague_doctor },
  { mod: homunculus },
  { mod: flesh_golem },
  { mod: merman },
  { mod: frog_demon },
  { mod: drowned },
  { mod: water_spirit },
  { mod: gear_golem },
];
export const companions = {};
export const npcs = {};
