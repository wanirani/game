// 채색 등록 모듈 — 패키지 ART-ENEMY-1 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
//
// ART-ENEMY-1 (공용 + s01–s03): 기존 5종(bat·ghost·skeleton·armor_knight·gravedigger)은 enemies/index.js 에 이미 등록돼 있다.
// medusa_spawner 는 보이지 않는 생성기(render 'none')라 그림이 없다.
import * as golden_bat from '../enemies/golden_bat.js';
import * as bone_thrower from '../enemies/bone_thrower.js';
import * as skeleton_archer from '../enemies/skeleton_archer.js';
import * as axe_armor from '../enemies/axe_armor.js';
import * as wisp from '../enemies/wisp.js';
import * as crow from '../enemies/crow.js';
import * as medusa_head from '../enemies/medusa_head.js';
import * as mimic from '../enemies/mimic.js';
import * as wolf from '../enemies/wolf.js';

export const bosses = {};
export const enemies = [
  { mod: golden_bat },
  { mod: bone_thrower },
  { mod: skeleton_archer },
  { mod: axe_armor },
  { mod: wisp },
  { mod: crow },
  { mod: medusa_head },
  { mod: mimic },
  { mod: wolf },
];
export const companions = {};
export const npcs = {};
