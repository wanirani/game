// v2 play — PLAY 구역의 공개 면. ENGINE(src/v2/game/)은 놀이 규칙 · 동작을 이 파일에서만 가져온다 (docs/v2/P1_CONTRACT.md §2–3 · docs/v2/PLAY_API.md).
//
//  Sim            new Sim(W, hooks) · sim.update(dt, inp) · sim.hero · sim.enemies · sim.shots · sim.section · sim.reset() · sim.teleport(id)
//                 + sim.addEnemy(spawn) · sim.byId(id) · sim.hitStop(초) · sim.reveal(x, z, r, 초) · sim.staggerEnemy(e, 초) · sim.hurtHero(…)
//                 inp = { mx, mz(-1..1, + = 화면 안쪽), jump(눌림), jumpHeld, attack(눌림), attackHeld, dash(눌림 = 구르기), guard(누르고 있음), lockNext(눌림) }
//                 영웅 · 적은 x · y · z, 보는 방향 dirX · dirZ(단위 벡터, 360°), anim · animT, hp 를 가진다. 영웅의 락온 대상 = hero.lock (적 id 또는 null)
//                 3차(2026-11-18): inp 에 attackHeld(길게 = 모아 휘감기) · skill(솜씨) · bell + bellHeld(종). 영웅의 dirX · dirZ 는 몸이 보는 방향이고 규칙이 돌린다(속도는 늘 그쪽으로).
//                 + sim.bossState() · sim.heal(n) · sim.respawnAt(x, z) · sim.here · sim.freezeSection · sim.caps · sim.setCaller(id) · sim.hookPoints · sim.lights · sim.knell(e) · sim.bossReturn(e)
//  TUNE · MOVES   조율값 · 카엘의 기술표
//  KINDS          적 · 보스 종류표: kind → { model(assets/v2/char3d/<model>.glb), weapon(소품 모델 id 또는 null), height(m), material(타격 재질 — src/v2/feel/table.js), name, grip?, … }
//                 스테이지의 옛 이름 'melee' · 'ranged' 도 같은 줄을 가리킨다. kindOf(kind) · registerKind(id, def, ai)
//  driveHero      (ch, hero, dt, TUNE) → 영웅 상태를 방향 · 클립으로 (ch = Char3D / Actor3D)
//  driveActor     (ch, actor, dt) → 적 · 인물 상태를 방향 · 클립으로.  placeActor(ch, e) → 숙여 나는 것(박쥐)까지 놓는 행렬
//  loadPlayClips  (asset) → 공용 클립 라이브러리를 받아 붙인다 (장면이 이미 붙였으면 아무것도 하지 않는다)
export { Sim, TUNE } from './sim.js';
export { UNIT } from './tune.js';
export { MOVES, COMBO, HERO_ANIMS } from './moves.js';
export { KINDS, AI, ATTACKS, kindOf, kindId, registerKind, attackDef } from './enemies.js';
export { flatArena, bindWorld } from './collide.js';
export { driveHero, driveActor, placeActor, loadPlayClips, usePlayClips, playClipsReady, warpMove, warpAttack } from './motion.js';
