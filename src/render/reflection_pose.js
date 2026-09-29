// 비친 자 (reflection, AI_B.shadow: 플레이어 동작을 반 박자 늦게 흉내) 의 자세·색 — 벡터 렌더러(enemies_c.js)와
// 채색 렌더러(painted/enemies/reflection.js)가 함께 쓴다. 작은 모듈로 떼어 두어 채색 렌더러가 벡터 렌더러 묶음(늦게 받기,
// render/enemies.js loadEnemyRenderers)을 정적으로 싣지 않게 한다 (R1-REQ-229).
/** 영웅 그림을 은빛 유리처럼 (look 별 1회) */
const REF_LOOK = new WeakMap();
const REF_FALLBACK = { build: 'normal', height: 1.0, hairStyle: 'ponytail', outfit: 'hunter', coat: 'long', weapon: { type: 'whip', style: 3 } };
export function reflectionLook(L) {
  let S = REF_LOOK.get(L);
  if (S) return S;
  S = {
    ...L, skin: '#b8cce0', hair: '#dfeaf6', eyes: '#ffffff', eyeGlow: true,
    primary: '#9fb4cc', secondary: '#6a809c', trim: '#e8f4ff', pants: '#7a8ea8', boots: '#5a6a84',
    armorColor: '#a8bcd4', armorTrim: '#eef6ff', headColor: '#a8bcd4', band: '#cfe8ff',
    cape: L.cape ? { ...L.cape, color: '#8aa0bc', color2: '#cfe0f0' } : null,
    scarf: L.scarf ? { ...L.scarf, color: '#bcd4ec' } : null,
    aura: { color: '#bfe8ff', type: 'holy' }, trailColor: '#bfe8ff',
    weapon: { ...(L.weapon || {}), color: '#dfeeff', glow: true, element: 'ice', rarity: 4 },
  };
  REF_LOOK.set(L, S);
  return S;
}
/** shadow AI 상태 → drawHero 용 플레이어 흉내 객체 (painted/enemies/reflection.js 도 쓴다) */
export function reflectionPose(e, world) {
  const pl = world?.player;
  const ps = e._ps || (e._ps = { cx: 0, bottom: 0, facing: 1, stats: {}, charging: 0, muzzleT: 0 });
  ps.anim = e.heroAnim ?? 'idle'; ps.animT = e.heroAnimT ?? e.animT; ps.move = e.mv ?? null; ps.moveT = e.mvT ?? 0; ps.atkSpeedMul = 1;
  ps.look = reflectionLook(pl?.look || REF_FALLBACK); ps.ch = pl?.ch;
  ps.vx = Math.abs(e.vx ?? 0); ps.vy = e.vy ?? 0; ps.onGround = e.onGround ?? true; ps.rig = e.rig || (e.rig = {}); ps.t = e.t ?? 0;
  ps.dashT = e.dashT ?? 0;
  return ps;
}
