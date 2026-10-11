// 시범 플래그 (docs/specs/anime_motion_sfx.md §5.1) — 둘 다 꺼져 있으면 게임은 지금과 똑같이 보이고 들린다.
//   anime: 애니풍 퍼펫·메시 변형·16방향 회전  ← 주소 ?anime=1 또는 localStorage 'bn.anime' = '1'
//   sfx2 : 고급 효과음 v2                      ← 주소 ?sfx=v2  또는 localStorage 'bn.sfx'  = 'v2'
// 모듈을 불러올 때 한 번만 읽는다 (바꾸면 새로 고침). Node·사생활 보호 모드처럼 location/localStorage 가 없거나 막혀 있으면 꺼짐.
function qs(name) {
  try { return new URLSearchParams(location.search).get(name); } catch { return null; }
}
function ls(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export const pilot = {
  anime: qs('anime') === '1' || ls('bn.anime') === '1',
  sfx2: qs('sfx') === 'v2' || ls('bn.sfx') === 'v2',
};
