// 키메라 호문쿨루스 포즈 스크립트 (tools/painted/poses.mjs · fight.mjs · bench.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
export const STAGE = 's07';
// 각 포즈는 로직 상태기계를 실제로 돌려 만든다 (렌더러는 상태를 읽기만 하므로 벡터/채색 비교가 공정하다).
export const POSES = [
  'idle', 'walk', 'pounce_w', 'pounce_air', 'pounce_land', 'goat_w', 'goat_flask', 'goat_homing', 'goat_bolt',
  'tail_whip_w', 'tail_whip_a', 'tail_spit', 'acid', 'charge_w', 'charge_run', 'swipe_w', 'swipe_a',
  'hit', 'dmg1', 'dmg2', 'transform1', 'transform2',
  'death_03', 'death_08', 'death_13', 'death_18', 'death_23',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.cool = 99; } };   // 매 프레임 그려야 렌더러 쪽 시뮬레이션(입자·줄·파편)이 진행된다
  let PX = 0.42;
  const px = () => { p.x = A.x0 + A.w * PX; p.vx = 0; };
  const clear = () => { for (const e of w.entities) if (e !== b && e.owner === b && !e.dead && e.kind !== 'painted') e.dead = true; };
  const home = () => { b.x = A.x0 + A.w * 0.7 - b.w / 2; b.vx = 0; b.vy = 0; b.y = b.floorY - b.h; b.facing = PX < 0.5 ? -1 : 1; };
  const hold = (st, t, pre) => { clear(); home(); b.setState(st); pre?.(); b.cool = 99; for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); if (b.state === 'idle') b.cool = 99; } };
  const settle = (ph = null, hp = null) => {
    if (b.dying > 0) return;
    PX = 0.42;
    if (ph != null) { b.phase = ph; b.phaseApply?.(ph); b.fury = ph / 2; if (ph < 2) { b.tubesBroken = false; b.enraged = false; } }
    if (hp != null) b.hp = b.stats.maxHp * hp;
    b.invuln = false; clear(); home(); b.setState('idle'); b.cool = 99; for (let i = 0; i < 50; i++) { px(); home(); step(1); }
  };
  const untilDeath = (t) => { for (let i = 0; i < 600 && b.dying > 0 && (b.deathT ?? 0) < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'idle': settle(0, 1); hold('idle', 1.2); break;
      case 'walk': settle(0, 1); clear(); b.x = A.x0 + A.w * 0.9; b.setState('idle'); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'pounce_w': settle(0, 1); hold('pounce', 0.42); break;
      case 'pounce_air': settle(0, 1); hold('pounce', 0.78); break;
      case 'pounce_land': settle(0, 1); hold('pounce', 1.3); break;
      case 'goat_w': settle(1, 0.55); hold('goat', 0.45, () => { b.spellI = -1; }); break;
      case 'goat_flask': settle(1, 0.55); hold('goat', 1.05, () => { b.spellI = -1; }); break;
      case 'goat_homing': settle(1, 0.55); hold('goat', 1.0, () => { b.spellI = 0; }); break;
      case 'goat_bolt': settle(1, 0.55); hold('goat', 1.25, () => { b.spellI = 1; }); break;
      case 'tail_whip_w': settle(0, 1); PX = 0.9; hold('tail', 0.4, () => { b.facing = -1; }); break;
      case 'tail_whip_a': settle(0, 1); PX = 0.9; hold('tail', 0.6, () => { b.facing = -1; }); break;
      case 'tail_spit': settle(1, 0.55); hold('tail', 0.9); break;
      case 'acid': settle(0, 1); hold('acid', 0.95); break;
      case 'charge_w': settle(0, 1); hold('charge', 0.5); break;
      case 'charge_run': settle(0, 1); PX = 0.3; hold('charge', 0.95); break;
      case 'swipe_w': settle(0, 1); PX = 0.5; hold('swipe', 0.26); break;
      case 'swipe_a': settle(0, 1); PX = 0.5; hold('swipe', 0.4); break;
      case 'hit': settle(0, 0.9); hold('idle', 0.4); b.takeHit(1, {}, w, {}); step(1); break;
      case 'dmg1': settle(1, 0.5); hold('idle', 1.0); break;
      case 'dmg2': settle(2, 0.22); hold('idle', 1.0); break;
      case 'transform1': settle(0, 0.61); b.takeHit(b.stats.maxHp * 0.02, {}, w, {}); b.cool = 99; for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'transform2': settle(1, 0.31); b.takeHit(b.stats.maxHp * 0.02, {}, w, {}); b.cool = 99; for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'death_03': settle(2, 0.2); b.takeHit(1e9, {}, w, {}); untilDeath(0.3); break;
      case 'death_08': untilDeath(0.8); break;
      case 'death_13': untilDeath(1.3); break;
      case 'death_18': untilDeath(1.8); break;
      case 'death_23': untilDeath(2.3); break;
    }
    p.iframes = 0; p.hurtT = 0;   // 캡처 프레임에서는 플레이어가 보이게 (무적 깜빡임 끔)
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, t: +b.stateT.toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, x: Math.round(b.cx), f: b.facing, ground: b.onGround, dying: +(b.deathT ?? 0).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본: i = 프레임 번호 (tools/painted/bench.mjs). 여러 상태를 돈다 */
export const BENCH = `(i, b, p, A) => {
  const k = i % 360;
  if (k === 0) { b.hp = b.stats.maxHp; b.setState('idle'); b.cool = 99; }
  if (k === 40) { b.setState('pounce'); b.cool = 99; }
  if (k === 140) { b.setState('goat'); b.cool = 99; }
  if (k === 230) { b.hp = b.stats.maxHp * 0.25; b.phase = 2; b.phaseApply(2); b.setState('swipe'); b.cool = 99; }
  if (k === 290) { b.setState('tail'); b.cool = 99; }
  if (b.state === 'idle') b.cool = 99;
  p.x = A.x0 + 260; p.iframes = 1e9;
}`;

/** 결정성 A/B (tools/painted/rng.mjs): 시작 전 굽기 대기 동안 실제 루프가 돈 흔적(속도·투사체·입자)을 지우고 같은 조건에서 시작 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && (e.owner === b || e.owner?.owner === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.vx = 0; b.vy = 0; b.y = b.floorY - b.h; b.facing = -1; b.lean = 0; b.flashT = 0; b.stateT = 0; b._pst = -1;
    b.snakeCool = 3; b.tubesBroken = false; b.enraged = false; b.fury = 0; b.spellI = undefined; b.last = null; b.last2 = null; b.phaseFx = 0;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.45, { stats: p.stats }, w, {});
  if (i === 1095) b.takeHit(b.stats.maxHp * 0.3, { stats: p.stats }, w, {});
}`;
