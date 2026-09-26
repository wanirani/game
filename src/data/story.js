// [임시 최소 구현] 스토리 담당이 확장.
// SCRIPTS[id] = [ line... ]
//  line = { who:'hero'|charId|npcId|bossId|'narrator', text: '문자열' 또는 {kael:'..', sera:'..', default:'..'}, side?:'left'|'right' }
//       | { choice:[{ text, set:{flag:true}, goto:'label' }] , who, text }
//       | { label:'이름' } | { goto:'label' } | { if:'flag' | '!flag' | {char:'kael'}, ...line }
//       | { cmd:'give', item, qty, name } | { cmd:'gold', amount } | { cmd:'flag', key, value } | { cmd:'quest', id }
//       | { cmd:'unlockChar', id } | { cmd:'shake' } | { cmd:'music', id } | { cmd:'sfx', id } | { cmd:'relic', id }
// '{hero}' 는 현재 캐릭터 이름으로 치환
export const SCRIPTS = {};

/** NPC 대화 스크립트 선택 (챕터/플래그에 따라) */
export function resolveNpcScript(npcId, state) {
  return npcId + '_default';
}
