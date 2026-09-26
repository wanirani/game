// 동료 버스 연결 — owner: CMP-DATA (companions §2.1, §12.1, §12.5; MASTER_PLAN §1.2 roster rules; world2 §2.4, §14)
// node 에서 import 가능 (DOM 없음). game 은 { state, world?, toast?() } 모양이면 된다.
//
//  initCompanions(game)
//    · game.companions = { recruit(id), unlock(id, opts), evaluate(opts), state() } 를 묶는다 (main.js 가 initQuests 뒤에 호출).
//      recruit(id): 스토리 명령 {cmd:'recruit', id} — flags['recruit_'+id] = true 로 두고 합류(합류 연출은 마을에서). 합류 항목|null
//      unlock(id, {source, silent, reveal, equip, toast}): 바로 합류. toast:true 면 '새 동료 합류' 토스트
//      evaluate(opts): evaluateUnlocks (플래그·유물·보스·의뢰 조건) → 새로 합류한 id[]
//    · 버스 구독 (스토리 세이브만; 아케이드 임시 세이브·아케이드 월드는 무시):
//      bossKilled   → 보스형 합류('새 동료 합류 — 「코슈타」! …' 토스트), 알형 알 획득('「본 드래곤의 알」을 손에 넣었다 …')
//      stageCleared → clears +1 (알·공물 주기), 장착한 동료 유대 +6
//      questClaimed → 의뢰형 합류 (그레타의 의뢰)
//      relicFound   → 유물 5개면 녹티스 합류 (마을에서 cmp_bat_arrive 뒤에 합류 연출)
//      bondUp       → '「아리아」와의 유대가 깊어졌다 — 공명' 토스트 (유대가 오르는 모든 곳의 토스트는 여기서만 띄운다)
//    (보스 처치 유대 +10·경험치 분배·50킬 유대는 런타임 CompanionSystem 이 한다.)
//  applyCompanionDebug(state, params) — companion_state.js 와 같은 함수 (다시 내보냄)
import { bus } from '../core/events.js';
import { BOND_NAMES, companionDef, normCompanionId, cmpText } from '../data/companions.js';
import {
  ensureCompanionState, unlockCompanion, evaluateUnlocks, bossKillUpdate, stageClearUpdate, questClaimUpdate, relicUpdate,
} from './companion_state.js';

export { applyCompanionDebug } from './companion_state.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const COLOR = { join: '#ffd070', egg: '#e8c872', bond: '#ffb0d0' };
let offs = [];

const ARCADE_MODES = new Set(['bossrush', 'survival', 'practice']);
/** 스토리 진행 세이브인가 (아케이드 임시 세이브·아케이드 월드는 동료가 없다). 마을(town)·스토리 스테이지·장면 사이(월드 없음)는 참 */
function storyState(game) {
  const st = game?.state;
  if (!isObj(st) || !isObj(st.progress) || st.arcade) return null;
  const w = game.world;
  if (w && (w.arcade === true || ARCADE_MODES.has(w.mode))) return null;
  return st;
}
function toast(game, text, color, time) {
  try { game?.toast?.(text, color, time); } catch { /* 토스트 실패는 무시 */ }
}
const nameOf = (id) => companionDef(id)?.name ?? '???';

function recruit(game, id) {
  const st = game?.state, n = normCompanionId(id);
  if (!isObj(st) || !n) return null;
  if (isObj(st.progress)) {
    if (!isObj(st.progress.flags)) st.progress.flags = {};
    st.progress.flags['recruit_' + n] = true; // world2 §2.4: 플래그가 합류의 원본 (불러올 때도 다시 확인)
  }
  if (st.arcade) return null;
  return unlockCompanion(st, n, { source: 'story' });
}

/** 동료 시스템의 버스 연결과 game.companions API. 다시 부르면 이전 구독을 풀고 새로 묶는다. */
export function initCompanions(game) {
  for (const off of offs) { try { off(); } catch { /* 무시 */ } }
  offs = [];
  if (!game || typeof game !== 'object') return null;
  const api = {
    recruit: (id) => recruit(game, id),
    unlock: (id, opts = {}) => {
      const st = game.state;
      if (!isObj(st) || st.arcade) return null;
      const n = normCompanionId(id);
      const had = !!(n && st.companions?.owned && Object.hasOwn(st.companions.owned, n));
      const e = unlockCompanion(st, n, opts);
      if (e && !had && opts.toast) toast(game, cmpText(game.world?.mode === 'story' ? 'joined' : 'joinedTown', { name: nameOf(n) }), COLOR.join, 3.2);
      return e;
    },
    evaluate: (opts) => (isObj(game.state) ? evaluateUnlocks(game.state, opts) : []),
    state: () => ensureCompanionState(game.state),
  };
  game.companions = api;
  const on = (evt, fn) => offs.push(bus.on(evt, (d) => {
    try {
      const st = storyState(game);
      if (st) fn(st, isObj(d) ? d : {});
    } catch (e) { try { console.warn('[companions]', evt, e); } catch { /* 무시 */ } }
  }));
  on('bossKilled', (st, d) => {
    if (game.world?.mode && game.world.mode !== 'story') return; // 동료 보스 해금은 스토리 모드만 (§2.1)
    const r = bossKillUpdate(st, d.bossId);
    for (const id of r.unlocked) toast(game, cmpText('joined', { name: nameOf(id) }), COLOR.join, 3.2);
    for (const id of r.eggs) toast(game, cmpText('egg', { egg: companionDef(id).obtain.egg }), COLOR.egg, 3.2);
  });
  on('stageCleared', (st) => { stageClearUpdate(st); });
  on('questClaimed', (st, d) => {
    for (const id of questClaimUpdate(st, d.questId)) toast(game, cmpText('joinedTown', { name: nameOf(id) }), COLOR.join, 3.2);
  });
  on('relicFound', (st) => {
    for (const id of relicUpdate(st)) toast(game, cmpText('joined', { name: nameOf(id) }), COLOR.join, 3.2);
  });
  on('bondUp', (st, d) => {
    const rank = Number.isFinite(d.rank) ? d.rank : 0;
    if (rank > 0 && companionDef(d.id)) toast(game, cmpText('bond', { name: nameOf(d.id), rank: BOND_NAMES[rank] ?? '' }), COLOR.bond, 2.8);
  });
  return api;
}
