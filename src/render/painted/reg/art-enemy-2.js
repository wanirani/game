// 채색 등록 모듈 — 패키지 ART-ENEMY-2 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
//
// ART-ENEMY-2 (s04–s06, 15종). 벡터 렌더러(enemies_a.js)는 그대로 남아 에셋이 없거나 로딩 중일 때 대신 그린다.
import * as blood_skeleton from '../enemies/blood_skeleton.js';
import * as bone_scimitar from '../enemies/bone_scimitar.js';
import * as skeleton_knight from '../enemies/skeleton_knight.js';
import * as skeleton_mage from '../enemies/skeleton_mage.js';
import * as spear_guard from '../enemies/spear_guard.js';
import * as phantom_sword from '../enemies/phantom_sword.js';
import * as corpse_worm from '../enemies/corpse_worm.js';
import * as ectoplasm from '../enemies/ectoplasm.js';
import * as flea_man from '../enemies/flea_man.js';
import * as book_fiend from '../enemies/book_fiend.js';
import * as scholar_ghost from '../enemies/scholar_ghost.js';
import * as bone_pillar from '../enemies/bone_pillar.js';
import * as mummy from '../enemies/mummy.js';
import * as puppet_maiden from '../enemies/puppet_maiden.js';

export const bosses = {};
export const enemies = [
  { mod: blood_skeleton },
  { mod: bone_scimitar },
  { mod: skeleton_knight },
  { mod: skeleton_mage },
  { mod: spear_guard },
  { mod: phantom_sword },
  { mod: corpse_worm },
  { mod: ectoplasm },
  { mod: flea_man },
  { mod: book_fiend },
  { mod: scholar_ghost },
  { mod: bone_pillar },
  { mod: mummy },
  { mod: puppet_maiden },
];
export const companions = {};
export const npcs = {};
