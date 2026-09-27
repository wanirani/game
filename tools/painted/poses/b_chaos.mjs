// 혼돈의 군주 포즈 스크립트 (tools/painted/poses.mjs · bench.mjs · rng.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/b_chaos.js)를 실제로 돌려 만든다 —
//   등장 글리치 · 마안 광선(조준/발사) · 격자 광선 · 공허 촉수 · 탄막 4종 · 현실 왜곡 · 그림자 소환(5종) · 글리치 순간이동 ·
//   눈 피격/파괴 · 손상 단계 · 종언의 눈(12%) · 사망(3.8초).
export const STAGE = 's13';
export const POSES = [
  'intro_glitch', 'intro_roar', 'idle', 'blink', 'lasers_w', 'lasers_a', 'grid_w', 'grid_a', 'tendrils', 'spiral', 'flower',
  'rings', 'starfall', 'warp_w', 'warp_a', 'shadows_a', 'shadows_b', 'hit', 'eye_hit', 'eyes_dead', 'dmg1', 'dmg2',
  'finale_a', 'finale_b', 'finale_end',
  'death_05', 'death_12', 'death_20', 'death_28', 'death_35',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const X = A.x0 + A.w * 0.55;
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.rest = 99; } };
  const px = () => { p.x = X - 330; p.vx = 0; p.facing = 1; };
  const clear = () => { for (const e of w.entities) if (e !== b && e.kind !== 'painted' && (e.kind === 'hazard' || e.kind === 'projectile' || e.owner === b)) e.dead = true; b.clearJobs?.(); b.shadows.length = 0; b.warpPreview = null; for (const e of b.eyes) { e.laser = null; e.fireAt = undefined; } };
  const phase = (ph, hp) => { b.phase = ph; b.hp = b.stats.maxHp * hp; b.finaleDone = ph >= 3 ? b.finaleDone : false; };
  const settle = () => {
    if (b.dying > 0) return;
    clear(); b.glitch = 0; b.invert = 0; b.dim = b.dimT = 0; b.third = b.thirdT = 0; b.exposed = false; b.invuln = false; b.flashT = 0;
    b.regenEyes(); for (const e of b.eyes) { e.hp = 1; e.open = 1; e.blink = 9; }
    b.place(X, b.homeY); b.setState('idle'); b.rest = 99;
    for (let i = 0; i < 50; i++) { px(); step(1); }
  };
  const hold = (st, t) => { b.setState(st); for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 600 && b.dying > 0 && 3.8 - b.dying < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro_glitch': phase(0, 1); settle(); hold('intro', 0.5); break;
      case 'intro_roar': phase(0, 1); settle(); hold('intro', 1.3); break;
      case 'idle': phase(0, 1); settle(); hold('idle', 1.2); break;
      case 'blink': settle(); hold('blink', 0.2); break;
      case 'lasers_w': settle(); hold('lasers', 0.95); break;
      case 'lasers_a': settle(); hold('lasers', 1.25); break;
      case 'grid_w': phase(1, 0.65); settle(); hold('grid', 0.7); break;
      case 'grid_a': phase(1, 0.65); settle(); hold('grid', 0.95); break;
      case 'tendrils': settle(); hold('tendrils', 0.95); break;
      case 'spiral': settle(); hold('spiral', 1.2); break;
      case 'flower': settle(); hold('flower', 0.75); break;
      case 'rings': settle(); hold('rings', 0.8); break;
      case 'starfall': settle(); hold('starfall', 1.3); break;
      case 'warp_w': phase(1, 0.65); settle(); hold('warp', 0.8); break;
      case 'warp_a': phase(1, 0.65); settle(); hold('warp', 1.25); break;
      case 'shadows_a': settle(); b.setState('shadow'); b.later(0, () => {}); for (const k of ['fq', 'drac']) b.summonShadow(w, k); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'shadows_b': settle(); b.setState('shadow'); for (const k of ['lev', 'col', 'death']) b.summonShadow(w, k); for (let i = 0; i < 64; i++) { px(); step(1); } break;
      case 'hit': phase(0, 0.9); settle(); hold('idle', 0.4); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(1); break;
      case 'eye_hit': phase(0, 0.9); settle(); hold('idle', 0.4); b.hitEye(1, b.stats.maxHp * b.eyeHpMax * 0.6); b.flashT = 0.12; step(2); break;
      case 'eyes_dead': phase(0, 0.9); settle(); hold('idle', 0.3); for (const i of [0, 2, 3]) b.hitEye(i, 1e9); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'dmg1': phase(1, 0.6); settle(); hold('idle', 1.0); break;
      case 'dmg2': phase(2, 0.3); settle(); hold('idle', 1.0); break;
      case 'finale_a': phase(3, 0.11); b.finaleDone = false; settle(); hold('finale', 1.0); break;
      case 'finale_b': phase(3, 0.11); b.finaleDone = false; settle(); hold('finale', 3.2); break;
      case 'finale_end': phase(3, 0.11); b.finaleDone = false; settle(); hold('finale', 9.3); break;
      case 'death_05': phase(3, 0.05); b.finaleDone = true; settle(); b.hurtbox(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.5); break;
      case 'death_12': untilDeath(1.2); break;
      case 'death_20': untilDeath(2.0); break;
      case 'death_28': untilDeath(2.8); break;
      case 'death_35': untilDeath(3.5); break;
    }
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, pos: [Math.round(b.cx), Math.round(b.cy)], eyes: b.eyes.filter((e) => !e.dead).length, glitch: +b.glitch.toFixed(2), exposed: b.exposed, dying: +(b.dying).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본: 420 프레임 주기 (광선 → 나선 탄막 → 촉수 → 그림자) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 420;
  const X = A.x0 + A.w * 0.55;
  if (k === 0) { b.hp = b.stats.maxHp * 0.6; b.phase = 1; b.place(X, b.homeY); b.regenEyes(); b.setState('lasers'); }
  if (k === 120) b.setState('spiral');
  if (k === 260) b.setState('tendrils');
  if (k === 340) b.setState('shadow');
  if (b.state === 'idle') b.rest = 99;
  p.x = X - 330; p.iframes = 1e9;
}`;

/** rng.mjs 대본: 0프레임에 굽기 대기 중 실제 루프가 남긴 것(탄·장판·그림자·입자)을 지워 채색/벡터 출발 상태를 같게 한 뒤,
 *  705·1095 프레임에 체력을 깎아 페이즈를 넘긴다 (기본 대본과 같은 시점). */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && (e.kind === 'projectile' || e.kind === 'hazard' || e.owner === b || e.owner?.owner === b || e.summoner === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.clearJobs?.(); b.shadows.length = 0; b.warpPreview = null; for (const e of b.eyes) { e.laser = null; e.fireAt = undefined; }
    b.glitch = 0; b.invert = 0; b.flashT = 0; b.invuln = false; b.rest = undefined;
    w.cutscene = false; w.hitstop = 0; w.slowmo = 0;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.45, { stats: p.stats }, w, {});
  if (i === 1095) b.takeHit(b.stats.maxHp * 0.3, { stats: p.stats }, w, {});
}`;
