// 서리 여왕 이자벨라 포즈 스크립트 (tools/painted/poses.mjs · bench.mjs · rng.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/b_frostqueen.js)를 실제로 돌려 만든다 — 렌더러는 상태를 읽기만 하므로 벡터/채색 비교가 공정하다.
export const STAGE = 's10';
export const POSES = [
  'idle', 'warp_out', 'warp_mist', 'warp_in', 'icicles', 'pillars', 'beam_w', 'beam_a',
  'blizzard', 'mirror', 'mirror3', 'dust', 'hit', 'dmg1', 'dmg2',
  'death_04', 'death_10', 'death_16', 'death_24', 'death_29',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A, X = Math.min(A.x1 - 180, A.x0 + Math.max(560, A.w * 0.6));
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.rest = 99; } };
  const px = () => { p.x = X - 330; p.vx = 0; p.facing = 1; };
  const clear = () => { for (const e of w.entities) if (e.kind === 'hazard' || e.kind === 'projectile' || (e.queen === b)) e.dead = true; for (const c of b.clones) c.dead = true; b.clones.length = 0; b.beamLine = null; b.windK = 0; };
  const settle = (y) => {
    if (b.dying > 0) return;
    clear(); b.vanish = 0; b.invuln = false; b.flashT = 0;
    b.place(X, y ?? b.homeY); b.hoverY = y ?? b.homeY; b.setState('idle'); b.rest = 99;
    for (let i = 0; i < 50; i++) { px(); step(1); }
  };
  const hold = (st, t) => { b.setState(st); for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const phase = (n, hp) => { b.phase = n; b.hp = b.stats.maxHp * hp; };
  const untilDeath = (t) => { for (let i = 0; i < 400 && b.dying > 0 && 3.2 - b.dying < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'idle': phase(0, 1); settle(); hold('idle', 1.2); break;
      case 'warp_out': settle(); hold('warp', 0.16); break;
      case 'warp_mist': settle(); hold('warp', 0.45); break;
      case 'warp_in': settle(); b.warpKind = 'low'; hold('warp', 0.7); break;
      case 'icicles': settle(A.floor - 230); hold('icicles', 0.55); break;
      case 'pillars': settle(); hold('pillars', 0.6); break;
      case 'beam_w': settle(); hold('beam', 0.5); break;
      case 'beam_a': settle(); hold('beam', 0.95); break;
      case 'blizzard': settle(); b.place(A.x1 - 120, A.floor - 90); b.hoverY = A.floor - 90; hold('blizzard2', 1.3); break;
      case 'mirror': phase(1, 0.55); settle(); hold('mirror', 0.9); break;
      case 'mirror3': phase(2, 0.25); settle(); hold('mirror', 1.4); break;
      case 'dust': phase(2, 0.25); settle(A.floor - 280); b.place(A.x0 + A.w / 2, A.floor - 280); b.hoverY = A.floor - 280; hold('dust', 1.3); break;
      case 'hit': phase(0, 0.8); settle(); hold('idle', 0.4); b.takeHit(1, { stats: p.stats }, w, {}); step(1); break;
      case 'dmg1': phase(1, 0.5); settle(); hold('idle', 1.0); break;
      case 'dmg2': phase(2, 0.25); settle(); hold('idle', 1.0); break;
      case 'death_04': phase(2, 0.1); settle(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.4); break;
      case 'death_10': untilDeath(1.0); break;
      case 'death_16': untilDeath(1.6); break;
      case 'death_24': untilDeath(2.4); break;
      case 'death_29': untilDeath(2.9); break;
    }
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, pos: [Math.round(b.cx), Math.round(b.bottom)], vanish: +b.vanish.toFixed(2), clones: b.clones.length, dying: +(b.dying).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본: i = 프레임 번호. 360 프레임 주기로 여러 상태를 돈다 (분신·3페이즈 포함) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 360;
  const X = Math.min(A.x1 - 180, A.x0 + Math.max(560, A.w * 0.6));
  if (k === 0) { b.hp = b.stats.maxHp; b.phase = 0; b.vanish = 0; b.place(X, b.homeY); b.hoverY = b.homeY; b.setState('idle'); }
  if (k === 40) b.setState('beam');
  if (k === 140) b.setState('pillars');
  if (k === 220) { b.phase = 2; b.hp = b.stats.maxHp * 0.25; b.setState('mirror'); }
  if (b.state === 'idle') b.rest = 99;
  p.x = X - 330; p.iframes = 1e9;
}`;
