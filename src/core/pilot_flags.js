// 시범 기능 스위치 (docs/specs/anime_motion_sfx.md §5.1) — 끄면 지금 그대로.
//  anime: 애니풍 영웅 (URL ?anime=1 또는 localStorage 'bn.anime' = '1')
//  sfx2 : 고급 효과음 v2 (URL ?sfx=v2 또는 localStorage 'bn.sfx' = 'v2')
function read() {
  let q = null, ls = null;
  try { q = new URLSearchParams(location.search); } catch { q = null; }
  try { ls = localStorage; } catch { ls = null; }
  const get = (k) => { try { return ls ? ls.getItem(k) : null; } catch { return null; } };
  let anime = false, sfx2 = false;
  try { anime = q?.get('anime') === '1' || get('bn.anime') === '1'; } catch { anime = false; }
  try { sfx2 = q?.get('sfx') === 'v2' || get('bn.sfx') === 'v2'; } catch { sfx2 = false; }
  return { anime, sfx2 };
}
export const pilot = read();
