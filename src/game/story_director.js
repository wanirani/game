// 마을 이야기 연출 — owner: STORY-GAPS-B (docs/specs/story_ext.md §5.3 여관의 밤 · §5.6 동료 합류 한마디)
//
// hubStoryEnter(game, hub) — hub.js 가 CMP.companionHubEnter?.(…) 바로 뒤에서 부른다 (enter · onResume 마다; 호출 줄은 TRIALS-ENGINE 몫,
// classes_t3 §9.4). 허브가 맨 위 장면일 때만, 대화 오버레이(dialogue)를 한 번에 하나 올린다:
//   1) 동료 합류 한마디 cmp_join_<id> — bus 'companionUnlocked' {id} 를 받으면 (첫 호출 때 구독) 그 대본이 있고 아케이드가 아닐 때
//      progress.flags['cmpq_' + id] = true 로 줄을 세운다 (플래그라서 저장·종료 뒤에도 남는다). 마을에 올 때마다 UNLOCK_ORDER 에서
//      처음 줄 선 것 하나를 틀고 플래그를 false 로. 합류 장면이 따로 있는 동료(그림메인·녹티스·스콜·2부/외전 동료)는 대본이 없어 줄 서지 않는다.
//   2) 여관의 밤 BANTER (story_extra.js) — 스테이지에서 돌아온 도착(hub.from 이 첫 도착·이어하기·2부 서막·여관·성당(시련 귀환)이 아님)마다
//      하나까지, 합류 한마디가 다 끝난 뒤. 표 순서대로 첫 번째: 아직 안 봄 · chapter ≥ chapterMin · flags 모두 참 · pair 에 지금 헌터가 없음.
//      본 대본은 seenScripts 에 남는다 (회차를 넘기면 다시 들린다).
// 아케이드 세이브에서는 아무것도 하지 않는다. 반환: 대화를 올렸으면 true.
import { bus } from '../core/events.js';
import { SCRIPTS } from '../data/story.js';
import { BANTER } from '../data/story_extra.js';
import { UNLOCK_ORDER } from '../data/companions.js';

/** 스테이지에서 돌아온 도착이 아닌 hub.from (hub.js ARRIVE_FROM + 여관 + 시련 뒤 성당 귀환 — 그때는 허브가 성당을 바로 연다) */
const NOT_BACK = new Set(['prologue', 'load', 'title', 'new', 'p2', 'inn', 'church']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

let GAME = null;
let subscribed = false;
/** 허브 인스턴스(= 도착 한 번)마다: calls (부른 횟수), banter (이번 도착에 여관의 밤을 틀었나) */
const VISIT = new WeakMap();

function onCompanionUnlocked(e) {
  try {
    const st = GAME?.state, id = e?.id;
    if (!isObj(st) || st.arcade || !isObj(st.progress) || typeof id !== 'string') return;
    if (!SCRIPTS['cmp_join_' + id]) return;
    if (!isObj(st.progress.flags)) st.progress.flags = {};
    st.progress.flags['cmpq_' + id] = true;
  } catch (err) { console.warn('[story_director] companionUnlocked', err); }
}

/** 줄 선 합류 한마디 중 UNLOCK_ORDER 에서 첫 번째 → { id, sid } | null */
function nextJoin(F) {
  for (const id of UNLOCK_ORDER) {
    if (F['cmpq_' + id] !== true) continue;
    const sid = 'cmp_join_' + id;
    if (SCRIPTS[sid]) return { id, sid };
  }
  return null;
}

/** 지금 틀 수 있는 여관의 밤 (표 순서대로 첫 번째) | null */
export function pickBanter(state) {
  const P = state?.progress;
  if (!isObj(P)) return null;
  const F = isObj(P.flags) ? P.flags : {};
  const seen = Array.isArray(P.seenScripts) ? P.seenScripts : [];
  const ch = Number.isFinite(P.chapter) ? P.chapter : 0;
  const me = state.charId;
  for (const b of BANTER) {
    if (!SCRIPTS[b.id] || seen.includes(b.id)) continue;
    if (ch < (b.req?.chapterMin ?? 0)) continue;
    if (!(b.req?.flags ?? []).every((f) => F[f] === true)) continue;
    if (Array.isArray(b.pair) && b.pair.includes(me)) continue;
    return b;
  }
  return null;
}

function play(game, hub, P, sid) {
  if (!P.seenScripts.includes(sid)) P.seenScripts.push(sid);
  game.push('dialogue', { script: sid, world: hub.world ?? game.world ?? null, onEnd: () => hubStoryEnter(game, hub) });
  return true;
}

export function hubStoryEnter(game, hub) {
  if (!game || !hub) return false;
  GAME = game;
  if (!subscribed) { bus.on('companionUnlocked', onCompanionUnlocked); subscribed = true; }
  const V = VISIT.get(hub) ?? { calls: 0, banter: false };
  VISIT.set(hub, V);
  V.calls++;
  try {
    if (game.top !== hub || hub.menuOpen || hub.entering) return false;
    // 시련 귀환(from 'church'): 허브가 enter 직후 성당을 연다 (setTimeout) — 첫 호출에서는 아무것도 올리지 않는다
    if (V.calls === 1 && hub.from === 'church') return false;
    const st = game.state, P = st?.progress;
    if (!isObj(st) || st.arcade || !isObj(P)) return false;
    if (!Array.isArray(P.seenScripts)) P.seenScripts = [];
    if (!isObj(P.flags)) P.flags = {};
    // 1) 동료 합류 한마디 (먼저)
    const j = nextJoin(P.flags);
    if (j) { P.flags['cmpq_' + j.id] = false; return play(game, hub, P, j.sid); }
    // 2) 여관의 밤 — 스테이지에서 돌아온 도착마다 하나까지
    if (V.banter || !hub.from || NOT_BACK.has(hub.from)) return false;
    const b = pickBanter(st);
    if (!b) return false;
    V.banter = true;
    return play(game, hub, P, b.id);
  } catch (e) { console.warn('[story_director] hub', e); return false; }
}
