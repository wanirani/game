// 밴시 여왕 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 로직 상태기계를 실제로 돌려 상태별 포즈를 만든다.
export const STAGE = 's02';
export const POSES = [
  'idle', 'wail_w', 'wail_a', 'chains', 'hands', 'phase_out', 'phase_in', 'spiral', 'summon', 'hit',
  'dmg1', 'transform1', 'dmg2', 'requiem', 'transform2',
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
    b.invuln = false; b.harmless = false; b.alpha = 1;
    b.x = A.mid + 80 - b.w / 2; b.y = A.floor - 190 - b.h; b.vx = b.vy = 0;
    b.setState('idle'); b.cool = 99; for (let i = 0; i < 70; i++) { px(); step(1); }
  };
  const untilDeath = (t) => { for (let i = 0; i < 600 && b.dying > 0 && (b.deathT ?? 0) < t; i++) step(1); };
  const setPhase = (n, hp) => { b.phase = n; b.hp = b.stats.maxHp * hp; };
  window.__pose = (name) => {
    switch (name) {
      case 'idle': settle(); hold('idle', 1.2); break;
      case 'wail_w': settle(); hold('wail', 0.6); break;
      case 'wail_a': settle(); hold('wail', 0.9); break;
      case 'chains': settle(); hold('chains', 0.5); break;
      case 'hands': settle(); hold('hands', 0.6); break;
      case 'phase_out': settle(); hold('phase', 0.3); break;
      case 'phase_in': settle(); hold('phase', 1.05); break;
      case 'spiral': settle(); hold('spiral', 1.2); break;
      case 'summon': settle(); hold('summon', 0.75); break;
      case 'hit': settle(); b.hp = b.stats.maxHp * 0.8; hold('idle', 0.4); b.takeHit(1, {}, w, {}); step(1); break;
      case 'dmg1': settle(); setPhase(1, 0.5); hold('idle', 1.0); break;
      case 'transform1': settle(); setPhase(0, 0.61); b.takeHit(b.stats.maxHp * 0.02, {}, w, {}); b.cool = 99; for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'dmg2': settle(); setPhase(2, 0.25); hold('idle', 2.0); break;
      case 'requiem': settle(); setPhase(2, 0.25); hold('requiem', 1.6); break;
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
    return { st: b.state, t: +b.stateT.toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, pos: [Math.round(b.cx), Math.round(b.bottom)], mouth: +(b.mouth ?? 0).toFixed(2), arms: +(b.arms ?? 0).toFixed(2), up: +(b.armsUp ?? 0).toFixed(2), skull: +(b.skull ?? 0).toFixed(2), alpha: +(b.alpha ?? 1).toFixed(2), dying: +(b.deathT ?? 0).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본 (i = 프레임 번호) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 360;
  if (k === 0) { b.hp = b.stats.maxHp; b.phase = 0; b.setState('idle'); b.cool = 99; }
  if (k === 60) { b.setState('wail'); b.cool = 99; }
  if (k === 160) { b.setState('chains'); b.cool = 99; }
  if (k === 260) { b.phase = 2; b.hp = b.stats.maxHp * 0.25; b.setState('requiem'); b.cool = 99; }
  if (b.state === 'idle') b.cool = 99;
  p.x = A.mid - 260; p.iframes = 1e9;
}`;
