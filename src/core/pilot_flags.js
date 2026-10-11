// 시범 플래그 (docs/specs/anime_motion_sfx.md §5.1) — 남은 호환용 껍데기.
//   anime: 애니풍 시범 원화는 걷어 냈다 → 언제나 false (지금 유화풍 원화 + 메시 관절·2차 움직임이 기본: hero_puppet.js / puppet_mesh.js)
//   sfx2 : 고급 효과음 v2 시범 스위치 (?sfx=v2 또는 localStorage 'bn.sfx' = 'v2'). 효과음 v2 가 기본이 되면 쓰는 곳이 없어진다.
// 둘 다 기본은 꺼짐 — import 하는 쪽이 남아 있어도 해가 없다. Node·사생활 보호 모드처럼 location/localStorage 가 없거나 막혀 있으면 꺼짐.
function qs(name) {
  try { return new URLSearchParams(location.search).get(name); } catch { return null; }
}
function ls(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export const pilot = {
  anime: false,
  sfx2: qs('sfx') === 'v2' || ls('bn.sfx') === 'v2',
};
