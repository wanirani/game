// [임시] 퀘스트 런타임 — 스토리 담당이 구현. 공개 API:
//  initQuests(game)  : 이벤트 버스 구독 (부트 시 1회)
//  availableQuests(state) / acceptQuest(state, qid) / questProgressText(state, qid) / canClaim(state, qid) / claimQuest(state, qid) → {gold, exp, items}
export function initQuests(game) {}
export function availableQuests(state) { return []; }
export function acceptQuest(state, qid) { return false; }
export function questProgressText(state, qid) { return ''; }
export function canClaim(state, qid) { return false; }
export function claimQuest(state, qid) { return null; }
