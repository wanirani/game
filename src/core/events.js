// 전역 이벤트 버스 — 퀘스트/점수/업적 등이 게임 이벤트를 구독한다.
// 이벤트 등록부 (MASTER_PLAN §1.12). 새 이벤트는 여기에 이름과 payload 를 먼저 적고 쓴다.
// 주요 이벤트 (payload):
//  'enemyKilled'   {enemy, def, x, y, byPlayer}
//  'bossKilled'    {bossId, stageId, time}
//  'itemPicked'    {item, qty}       (인벤토리에 들어간 아이템 인스턴스)
//  'itemUsed'      {item, baseId}
//  'itemBought'    {baseId, qty, gold, item}
//  'itemSold'      {baseId, qty, gold}
//  'goldPicked'    {amount}
//  'docFound'      {docId}
//  'relicFound'    {id}
//  'secretFound'   {stageId, key}
//  'stageCleared'  {stageId, rank, time, score}
//  'stageEntered'  {stageId}
//  'roomEntered'   {stageId, roomId}
//  'playerHurt'    {amount}
//  'playerDied'    {cause}           cause = 맞은 attack 객체 | 'fall' | 'hazard' | null (core/telemetry.js 가 사망 원인으로 읽는다)
//  'bossStarted'   {bossId, stageId, time}   world.startBoss (스토리·연습 보스전 시작; time = run.time)
//  'arcadeFinished' {kind, cleared, reason, score, time, extra, charId, diff, stageId}   아케이드 정산 (front/arcade_run.js finish)
//  'levelUp'       {charId, level}
//  'classChanged'  {charId, classId}
//  'enhance'       {item, success, destroyed, level, before}
//  'minigame'      {game, win, reward}
//  'npcTalk'       {npcId}
//  'questOffer'    {questId}
//  'questDone'     {questId}
//  'questClaimed'  {questId, reward}
//  'combo'         {count}
// 플랫폼 (입력·진동):
//  'inputDevice'   {kind, name, glyphs}   입력 기기 전환 (input.js)
//  'hitCrit'       {target}               치명타 (impact.js)
//  'hitHeavy'      {cls}                  강타 (impact.js)
//  'shake'         {mag}                  큰 화면 흔들림 (camera.js, mag ≥ 8)
// 손맛·필살기·각성기:
//  'ultimateCast'  {charId, tier, classId}   필살기 시전 (skills.js castUltimate; 옛 이름 ultStart 는 쓰지 않는다)
//  'awakenCast'    {charId, tier, classId}   각성기 시전 (awaken.js)
//  'styleRankUp'   {rank}
//  'comboMilestone' {n}
// 2부 (이계편):
//  'shardFound'    {id}                   별의 조각 획득
//  'heartFound'    {id}                   세계의 심장 획득
// 동료 (탈것·수호신; 'ultimateCast' 도 함께 구독):
//  'companionUnlocked' {id, source}  'companionLevelUp' {id, level}  'bondUp' {id, rank}
//  'mounted' {id}  'dismounted' {id, reason}  'guardianSkill' {id, auto}  'eggObtained' {id}  'eggHatched' {id}
// 계정 (core/cloud.js, docs/ACCOUNTS.md):
//  'cloud:status' {state}  'cloud:login' {id, resumed}  'cloud:logout' {id, reason}  'cloud:sync' {phase, …}  'cloud:conflict' {slot}
// 온라인 (core/online.js, docs/specs/online.md):
//  'online:flushed' {sent:[{board, rank, total, best}], dropped, left}   기기 대기열에 두었던 결과를 보냄 (front/arcade.js 가 토스트)
export class EventBus {
  constructor() { this.map = new Map(); }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) { this.map.get(evt)?.delete(fn); }
  emit(evt, data) {
    const set = this.map.get(evt);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(data); } catch (e) { console.error('[bus]', evt, e); globalThis.__bnReportError?.(e, 'bus'); } // 익명 오류 보고 (core/telemetry.js, 꺼져 있으면 없음)
    }
  }
}
export const bus = new EventBus();
