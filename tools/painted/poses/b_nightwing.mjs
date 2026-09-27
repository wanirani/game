// 나이트윙 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 로직 상태기계를 실제로 돌려 상태별 포즈를 만든다.
export const STAGE = 's01';
export const POSES = [
  'idle', 'swoop_w', 'swoop_a', 'swoop_low', 'screech_w', 'screech_a', 'talon_track', 'talon_drop', 'talon_land',
  'blades_w', 'blades_a', 'summon', 'hit', 'dmg1', 'transform1', 'dmg2', 'rain', 'transform2',
  'death_03', 'death_07', 'death_11', 'death_16', 'death_21',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.cool = 99; } };
  const px = () => { p.x = A.mid - 260; p.vx = 0; };
  const hold = (st, t) => { b.setState(st); b.cool = 99; for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); if (b.state === 'idle') b.cool = 99; } };
  const settle = () => {
    if (b.dying > 0) return;
    b.invuln = false; b.harmless = false;
    b.x = A.mid + 80 - b.w / 2; b.y = A.floor - 200 - b.h / 2; b.vx = b.vy = 0;
    b.setState('idle'); b.cool = 99; for (let i = 0; i < 70; i++) { px(); step(1); }
  };
  const untilDeath = (t) => { for (let i = 0; i < 600 && b.dying > 0 && (b.deathT ?? 0) < t; i++) step(1); };
  const setPhase = (n, hp) => { b.phase = n; b.hp = b.stats.maxHp * hp; };
  window.__pose = (name) => {
    switch (name) {
      case 'idle': settle(); hold('idle', 1.2); break;
      case 'swoop_w': settle(); hold('swoop', 0.6); break;
      case 'swoop_a': settle(); hold('swoop', 1.12); break;
      case 'swoop_low': settle(); hold('swoop', 1.3); break;
      case 'screech_w': settle(); hold('screech', 0.5); break;
      case 'screech_a': settle(); hold('screech', 0.84); break;
      case 'talon_track': settle(); hold('talon', 0.6); break;
      case 'talon_drop': settle(); hold('talon', 1.18); break;
      case 'talon_land': settle(); hold('talon', 1.5); break;
      case 'blades_w': settle(); hold('blades', 0.45); break;
      case 'blades_a': settle(); hold('blades', 0.66); break;
      case 'summon': settle(); hold('summon', 0.72); break;
      case 'hit': settle(); b.hp = b.stats.maxHp * 0.8; hold('idle', 0.4); b.takeHit(1, {}, w, {}); step(1); break;
      case 'dmg1': settle(); setPhase(1, 0.5); hold('idle', 1.0); break;
      case 'transform1': settle(); setPhase(0, 0.61); b.takeHit(b.stats.maxHp * 0.02, {}, w, {}); b.cool = 99; for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'dmg2': settle(); setPhase(2, 0.25); hold('idle', 1.0); break;
      case 'rain': settle(); setPhase(2, 0.25); hold('bloodRain', 1.6); break;
      case 'transform2': settle(); setPhase(1, 0.31); b.takeHit(b.stats.maxHp * 0.02, {}, w, {}); b.cool = 99; for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'death_03': settle(); b.takeHit(1e9, {}, w, {}); untilDeath(0.3); break;
      case 'death_07': untilDeath(0.7); break;
      case 'death_11': untilDeath(1.1); break;
      case 'death_16': untilDeath(1.6); break;
      case 'death_21': untilDeath(2.1); break;
    }
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, t: +b.stateT.toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, pos: [Math.round(b.cx), Math.round(b.bottom)], sp: +(b.spread ?? 0).toFixed(2), claw: +(b.claw ?? 0).toFixed(2), mouth: +(b.mouth ?? 0).toFixed(2), dying: +(b.deathT ?? 0).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본 (i = 프레임 번호) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 360;
  if (k === 0) { b.hp = b.stats.maxHp; b.phase = 0; b.setState('idle'); b.cool = 99; }
  if (k === 60) { b.setState('screech'); b.cool = 99; }
  if (k === 150) { b.setState('swoop'); b.cool = 99; }
  if (k === 260) { b.phase = 2; b.hp = b.stats.maxHp * 0.25; b.setState('blades'); b.cool = 99; }
  if (b.state === 'idle') b.cool = 99;
  p.x = A.mid - 260; p.iframes = 1e9;
}`;

/** 결정성 A/B (tools/painted/rng.mjs): 굽기 대기 동안 실제 루프가 돈 흔적(속도·투사체·입자)을 지우고 같은 조건에서 시작 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && (e.owner === b || e.owner?.owner === b || e.boss === b || e.summoner === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.vx = 0; b.vy = 0; b.facing = -1; b.flashT = 0; b.stateT = 0; b._pst = -1; b.last = null; b.last2 = null; b.phaseFx = 0; b.invuln = false;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.45, { stats: p.stats }, w, {});
  if (i === 1095) b.takeHit(b.stats.maxHp * 0.3, { stats: p.stats }, w, {});
}`;
