// 전역 이벤트 버스 — 퀘스트/점수/업적 등이 게임 이벤트를 구독한다.
// 주요 이벤트 (payload):
//  'enemyKilled'   {enemy, def, x, y, byPlayer}
//  'bossKilled'    {bossId, stageId, time}
//  'itemPicked'    {item}            (인벤토리에 들어간 아이템 인스턴스)
//  'goldPicked'    {amount}
//  'docFound'      {docId}
//  'secretFound'   {stageId, key}
//  'stageCleared'  {stageId, rank, time, score}
//  'stageEntered'  {stageId}
//  'roomEntered'   {stageId, roomId}
//  'playerHurt'    {amount}
//  'playerDied'    {}
//  'levelUp'       {charId, level}
//  'classChanged'  {charId, classId}
//  'enhance'       {item, success, destroyed, level}
//  'minigame'      {game, win, reward}
//  'npcTalk'       {npcId}
//  'questDone'     {questId}
//  'combo'         {count}
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
      try { fn(data); } catch (e) { console.error('[bus]', evt, e); }
    }
  }
}
export const bus = new EventBus();
