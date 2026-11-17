// v2 play — PLAY 구역의 공개 면. ENGINE(src/v2/game/)은 놀이 규칙·동작을 이 파일에서만 가져온다 (docs/v2/P1_CONTRACT.md §2–3).
// 지금은 시범판 B 의 것을 그대로 내보내는 자리 채우기다. PLAY 구역이 같은 이름·같은 모양(더 많은 것)을 지키며 알맹이를 바꾼다.
//
//  Sim            new Sim(W, hooks) · sim.update(dt, inp) · sim.hero · sim.enemies · sim.shots · sim.section · sim.reset() · sim.teleport(id)
//                 inp = { mx, mz(-1..1, + = 화면 안쪽), jump(눌림), jumpHeld, attack(눌림), attackHeld, dash(눌림 = 구르기), guard(누르고 있음), lockNext(눌림) }
//                 영웅·적은 x · y · z, 보는 방향 dirX · dirZ(단위 벡터, 360°), anim · animT, hp 를 가진다.
//  KINDS          적·인물 종류표: kind → { model(assets/v2/char3d/<model>.glb), weapon(소품 모델 id 또는 null), height(m), material(타격 재질 — src/v2/feel/table.js) }
//  driveHero      (ch: Char3D, hero, dt, TUNE) → 영웅 상태를 방향·클립으로
//  driveActor     (ch: Char3D, actor, dt) → 적·인물 상태를 방향·클립으로
export { Sim, TUNE } from '../b/sim.js';
export { driveHero } from '../char3d/hero3d.js';

export const KINDS = {
  melee: { model: 'skeleton_soldier', weapon: 'w_rusty_sword', height: 1.75, material: 'bone' },
  ranged: { model: 'skeleton_mage', weapon: 'w_crystal_staff', height: 1.8, material: 'bone' },
};

const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
/** 자리 채우기: 영웅 쪽(또는 facing)을 보고, 상태 이름과 같은 클립이 있으면 튼다 */
export function driveActor(ch, e, dt) {
  const tx = e.dirX ?? e.facing ?? 1, tz = e.dirZ ?? 0;
  const cur = Math.atan2(ch.dz, ch.dx), a = cur + wrapPi(Math.atan2(tz, tx) - cur) * (1 - Math.exp(-dt * 12));
  ch.dx = Math.cos(a); ch.dz = Math.sin(a);
  const clips = ch.asset.clips, want = e.state === 'dead' ? 'death' : e.anim;
  ch.anim.play(clips[want] ? want : clips.idle ? 'idle' : Object.keys(clips)[0], { fade: 0.12 });
  ch.anim.update(dt);
}
