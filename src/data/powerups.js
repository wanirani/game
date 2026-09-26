// 일시 파워업 (촛불/적에게서 드롭되는 빛나는 구슬). 먹으면 즉시 효과 + 화면 연출
// player.buffs[id] = 남은 시간. 효과는 game/player.js 에서 buffs 를 확인해 적용.
export const POWERUPS = {
  rage:      { id: 'rage', name: '광폭화', desc: '공격력 2배', time: 15, color: '#ff4030', w: 12 },
  haste:     { id: 'haste', name: '신속', desc: '이동·공격 속도 +40%', time: 15, color: '#6affb0', w: 12 },
  invincible:{ id: 'invincible', name: '무적의 물약', desc: '모든 피해 무효', time: 8, color: '#ffe070', w: 6 },
  magnet:    { id: 'magnet', name: '자석', desc: '아이템을 끌어당긴다', time: 30, color: '#b0c8ff', w: 10 },
  gunmode:   { id: 'gunmode', name: '쌍권총 난사', desc: '공격 시 권총이 자동으로 함께 발사', time: 15, color: '#ffd070', w: 10 },
  holyaura:  { id: 'holyaura', name: '성광의 오라', desc: '주변 적에게 지속 신성 피해', time: 15, color: '#fff2b0', w: 8 },
  whipup:    { id: 'whipup', name: '무기 강화', desc: '이번 스테이지 동안 공격 범위 +25%, 불꽃 속성', time: 9999, color: '#ff9a3a', w: 10 },
  double:    { id: 'double', name: '더블 샷', desc: '보조무기 2발 동시 발사 (스테이지 동안)', time: 9999, color: '#8ac8ff', w: 7 },
  triple:    { id: 'triple', name: '트리플 샷', desc: '보조무기 3발 동시 발사 (스테이지 동안)', time: 9999, color: '#c07cff', w: 3 },
  rosary:    { id: 'rosary', name: '로사리오', desc: '화면의 모든 적을 정화한다', time: 0, color: '#ffffff', w: 4 },
  heartrain: { id: 'heartrain', name: '하트 비', desc: '하트가 쏟아진다', time: 0, color: '#ff6a7a', w: 6 },
  goldrush:  { id: 'goldrush', name: '황금 비', desc: '금화가 쏟아진다', time: 0, color: '#ffd84a', w: 6 },
};
