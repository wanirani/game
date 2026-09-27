// 채색 등록 모듈 — 패키지 ENEMY-P2-C-ART 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
// 2부 적 s14–s16 (world2 §5): 채색 퍼핏이 등록된 적은 리그(아틀라스)가 로드되면 채색, 아니면 render/enemies_c.js 벡터 대체 그림.
import * as bellows from '../enemies/bellows.js';
import * as glass_wraith from '../enemies/glass_wraith.js';
import * as reflection from '../enemies/reflection.js';
import * as siren from '../enemies/siren.js';
import * as forge_imp from '../enemies/forge_imp.js';

export const bosses = {};
export const enemies = [
  { mod: bellows },
  { mod: glass_wraith },
  { mod: reflection },
  { mod: siren },
  { mod: forge_imp },
];
export const companions = {};
export const npcs = {};
