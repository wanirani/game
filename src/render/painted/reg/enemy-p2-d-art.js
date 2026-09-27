// 채색 등록 모듈 — 패키지 ENEMY-P2-D-ART 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
//
// ENEMY-P2-D-ART (2부 s17–s20): 채색 퍼핏이 준비된 적만 여기 등록한다. 등록되지 않은 적은 render/enemies_d.js 의 벡터 대체 그림.
import * as cloud_jelly from '../enemies/cloud_jelly.js';
import * as nihil_spawn from '../enemies/nihil_spawn.js';
import * as storm_harpy from '../enemies/storm_harpy.js';
import * as thunder_roc from '../enemies/thunder_roc.js';
import * as gale_knight from '../enemies/gale_knight.js';
import * as puppeteer from '../enemies/puppeteer.js';
import * as faceless from '../enemies/faceless.js';
import * as dream_eater from '../enemies/dream_eater.js';

export const bosses = {};
export const enemies = [
  { mod: cloud_jelly },
  { mod: nihil_spawn },
  { mod: storm_harpy },
  { mod: thunder_roc },
  { mod: gale_knight },
  { mod: puppeteer },
  { mod: faceless }, { mod: dream_eater },
];
export const companions = {};
export const npcs = {};
