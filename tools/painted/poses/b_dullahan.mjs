// 둘라한 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 로직 상태기계를 실제로 돌려 상태별 포즈를 만든다.
// 기승(말 위) → 3페이즈 하마(도보) → 사망. 유령마 환영 돌격(phantom) 투사체, 하마 때 사라지는 유령마(horseFade) 포함.
export const STAGE = 's03';
export const POSES = [
  'idle', 'walk', 'charge_back', 'charge_w', 'charge_a', 'skull_w', 'skull_a', 'stomp_w', 'stomp_a', 'thrust_w', 'thrust_a',
  'hit', 'dmg1', 'transform1', 'hellfire', 'dismount', 'dismount_fade', 'foot_idle', 'lunge_w', 'lunge_a', 'leap_air', 'leap_land',
  'phantom', 'foot_skull', 'dmg2',
  'death_03', 'death_07', 'death_11', 'death_16', 'death_21',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.cool = 99; } };
  const px = () => { p.x = A.mid - 300; p.vx = 0; };
  const hold = (st, t) => { b.setState(st); b.cool = 99; for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); if (b.state === 'idle') b.cool = 99; } };
  const settle = () => {
    if (b.dying > 0) return;
    b.invuln = false; b.harmless = false; b.skullOut = 0;
    b.x = A.mid + 120 - b.w / 2; b.y = A.floor - b.h; b.vx = b.vy = 0;
    b.setState('idle'); b.cool = 99; for (let i = 0; i < 50; i++) { px(); step(1); }
  };
  const dismount = () => { if (b.mounted) { b.phase = 2; b.hp = b.stats.maxHp * 0.28; b.applyDismount(); b.setState('idle'); b.invuln = false; } };
  const untilDeath = (t) => { for (let i = 0; i < 600 && b.dying > 0 && (b.deathT ?? 0) < t; i++) step(1); };
  const setPhase = (n, hp) => { b.phase = n; b.hp = b.stats.maxHp * hp; };
  window.__pose = (name) => {
    switch (name) {
      case 'idle': settle(); hold('idle', 1.0); break;
      case 'walk': settle(); b.x -= 260; hold('idle', 0.5); break;
      case 'charge_back': settle(); hold('charge', 0.5); break;
      case 'charge_w': settle(); hold('charge', 1.4); break;
      case 'charge_a': settle(); hold('charge', 1.85); break;
      case 'skull_w': settle(); hold('skull', 0.5); break;
      case 'skull_a': settle(); hold('skull', 0.82); break;
      case 'stomp_w': settle(); hold('stomp', 0.55); break;
      case 'stomp_a': settle(); hold('stomp', 0.8); break;
      case 'thrust_w': settle(); hold('thrust', 0.4); break;
      case 'thrust_a': settle(); hold('thrust', 0.62); break;
      case 'hit': settle(); b.hp = b.stats.maxHp * 0.8; hold('idle', 0.4); b.takeHit(1, {}, w, {}); step(1); break;
      case 'dmg1': settle(); setPhase(1, 0.5); hold('idle', 1.0); break;
      case 'transform1': settle(); setPhase(0, 0.61); b.takeHit(b.stats.maxHp * 0.02, {}, w, {}); b.cool = 99; for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'hellfire': settle(); setPhase(1, 0.5); hold('hellfire', 0.9); break;
      case 'dismount': settle(); setPhase(1, 0.31); b.takeHit(b.stats.maxHp * 0.02, {}, w, {}); b.cool = 99; for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'dismount_fade': for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'foot_idle': dismount(); settle(); hold('idle', 1.0); break;
      case 'lunge_w': dismount(); settle(); hold('lunge', 0.25); break;
      case 'lunge_a': dismount(); settle(); hold('lunge', 0.45); break;
      case 'leap_air': dismount(); settle(); hold('leap', 0.95); break;
      case 'leap_land': dismount(); settle(); hold('leap', 1.75); break;
      case 'phantom': dismount(); settle(); hold('phantom', 1.35); break;
      case 'foot_skull': dismount(); settle(); hold('skull', 0.5); break;
      case 'dmg2': dismount(); settle(); setPhase(2, 0.2); hold('idle', 1.0); break;
      case 'death_03': dismount(); settle(); b.takeHit(1e9, {}, w, {}); untilDeath(0.3); break;
      case 'death_07': untilDeath(0.7); break;
      case 'death_11': untilDeath(1.1); break;
      case 'death_16': untilDeath(1.6); break;
      case 'death_21': untilDeath(2.1); break;
    }
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, t: +b.stateT.toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, mounted: b.mounted, pos: [Math.round(b.cx), Math.round(b.bottom)], vx: Math.round(b.vx), rear: +(b.rear ?? 0).toFixed(2), lanceA: +(b.lanceA ?? 0).toFixed(2), lanceX: Math.round(b.lanceX ?? 0), skullUp: +(b.skullUp ?? 0).toFixed(2), skullOut: b.skullOut, horseFade: +(b.horseFade ?? 0).toFixed(2), dying: +(b.deathT ?? 0).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본 (i = 프레임 번호) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 360;
  if (k === 0) { b.hp = b.stats.maxHp; b.phase = 0; b.setState('idle'); b.cool = 99; }
  if (k === 60) { b.setState('stomp'); b.cool = 99; }
  if (k === 160) { b.setState('thrust'); b.cool = 99; }
  if (k === 260) { b.phase = 1; b.setState('hellfire'); b.cool = 99; }
  if (b.state === 'idle') b.cool = 99;
  p.x = A.mid - 300; p.iframes = 1e9;
}`;

/** 결정성 A/B (tools/painted/rng.mjs): 굽기 대기 동안 실제 루프가 돈 흔적(속도·투사체·입자)을 지우고 같은 조건에서 시작 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && (e.owner === b || e.owner?.owner === b || e.boss === b || e.summoner === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.vx = 0; b.vy = 0; b.y = b.floorY - b.h; b.facing = -1; b.flashT = 0; b.stateT = 0; b._pst = -1; b.last = null; b.last2 = null; b.phaseFx = 0; b.invuln = false; b.skullOut = 0;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.45, { stats: p.stats }, w, {});
  if (i === 1095) b.takeHit(b.stats.maxHp * 0.3, { stats: p.stats }, w, {});
}`;
