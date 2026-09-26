// 본 드래곤 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
export const STAGE = 's05';
// 각 포즈는 로직 상태기계를 실제로 돌려 만든다 (렌더러는 상태를 읽기만 하므로 벡터/채색 비교가 공정하다).
export const POSES = [
  'idle', 'bite_w', 'bite_a', 'breath_w', 'breath_a', 'rain', 'spit',
  'burrow_dive', 'burrow_rise', 'burrow_after', 'wall_w', 'wall_a', 'wall_back',
  'hit', 'dmg1', 'dmg2', 'transform1', 'twin_rise', 'twin', 'twin_bite',
  'death_03', 'death_07', 'death_11', 'death_16', 'death_21',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  // 원래 구멍 (setup 과 같은 식). 굽기를 기다리는 동안 실제 루프가 돌아 보스가 벽 돌격 중일 수 있으므로 현재 구멍을 쓰지 않는다
  const b = w.boss, A = b.A, H0 = { x: Math.min(Math.max(b.homeX, A.x0 + 200), A.x1 - 160), y: A.floor, nx: 0, ny: -1 };
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.cool = 99; } };   // 매 프레임 그려야 렌더러 쪽 시뮬레이션(입자·줄·파편)이 진행된다
  const px = () => { p.x = A.x0 + 330; p.vx = 0; };
  const hold = (st, t) => { b.setState(st); b.cool = 99; for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); if (b.state === 'idle') b.cool = 99; } };
  const settle = () => {
    if (b.dying > 0) return;
    for (const h of b.heads) { h.setHole(h === b.main ? H0.x : h.hole.x, H0.y, 0, -1); h.autoExt = true; h.extSp = 900; }
    b.setState('idle'); b.cool = 99; for (let i = 0; i < 110; i++) { px(); step(1); }
  };
  const untilDeath = (t) => { for (let i = 0; i < 600 && b.dying > 0 && (b.deathT ?? 0) < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'idle': settle(); hold('idle', 1.3); break;
      case 'bite_w': settle(); hold('bite', 0.45); break;
      case 'bite_a': settle(); hold('bite', 0.74); break;
      case 'breath_w': settle(); hold('breath', 0.6); break;
      case 'breath_a': settle(); hold('breath', 1.5); break;
      case 'rain': settle(); hold('boneRain', 0.9); break;
      case 'spit': settle(); hold('spit', 0.55); break;
      case 'burrow_dive': settle(); hold('burrow', 0.35); break;
      case 'burrow_rise': settle(); hold('burrow', 1.42); break;
      case 'burrow_after': settle(); hold('burrow', 1.85); break;
      case 'wall_w': settle(); hold('wall', 1.0); break;
      case 'wall_a': settle(); hold('wall', 1.6); break;
      case 'wall_back': settle(); hold('wall', 2.75); break;
      case 'hit': settle(); b.hp = b.stats.maxHp * 0.7; hold('idle', 0.5); b.takeHit(1, {}, w, {}); step(1); break;
      case 'dmg1': settle(); b.phase = 1; b.hp = b.stats.maxHp * 0.5; hold('idle', 1.0); break;
      case 'dmg2': settle(); b.phase = 1; b.hp = b.stats.maxHp * 0.31; hold('idle', 1.0); break;
      case 'transform1': settle(); b.phase = 0; b.hp = b.stats.maxHp * 0.61; b.takeHit(b.stats.maxHp * 0.02, {}, w, {}); b.cool = 99; for (let i = 0; i < 36; i++) { px(); step(1); } break;
      case 'twin_rise': settle(); b.phase = 1; b.hp = b.stats.maxHp * 0.305; b.takeHit(b.stats.maxHp * 0.01, {}, w, {}); for (let i = 0; i < 62; i++) { px(); step(1); } break;
      case 'twin': if (!b.twin) { b.phase = 2; b.hp = b.stats.maxHp * 0.25; b.phaseApply(2); } settle(); hold('idle', 1.0); break;
      case 'twin_bite': if (!b.twin) { b.phase = 2; b.hp = b.stats.maxHp * 0.25; b.phaseApply(2); } settle(); b.twin.st = 'bite'; b.twin.stT = 0; b.twin.lock = null; for (let i = 0; i < 48; i++) { px(); step(1); } break;
      case 'death_03': settle(); b.takeHit(1e9, {}, w, {}); untilDeath(0.3); break;
      case 'death_07': untilDeath(0.7); break;
      case 'death_11': untilDeath(1.1); break;
      case 'death_16': untilDeath(1.6); break;
      case 'death_21': untilDeath(2.1); break;
    }
    p.iframes = 0; p.hurtT = 0;   // 캡처 프레임에서는 플레이어가 보이게 (무적 깜빡임 끔)
    g.__render();
    p.iframes = 1e9;
    const m = b.main;
    return { st: b.state, hp: +(b.hp / b.stats.maxHp).toFixed(2), head: [Math.round(m.hx), Math.round(m.hy)], hole: [Math.round(m.hole.x), m.hole.nx], twin: !!b.twin, dying: +(b.deathT ?? 0).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본: i = 프레임 번호 (tools/painted/bench.mjs). 330 프레임 주기로 여러 상태를 돈다 (2페이즈 쌍두 포함) */
export const BENCH = `(i, b, p, A, H0) => {
  const k = i % 360;
  if (k === 0) { b.hp = b.stats.maxHp; b.main.setHole(H0.x, H0.y, 0, -1); b.main.autoExt = true; b.setState('idle'); b.cool = 99; }
  if (k === 50) { b.setState('bite'); b.cool = 99; }
  if (k === 130) { b.setState('breath'); b.cool = 99; }
  if (k === 230) { b.hp = b.stats.maxHp * 0.5; b.setState('spit'); b.cool = 99; }
  if (k === 270) { if (!b.twin) { b.phase = 2; b.hp = b.stats.maxHp * 0.25; b.phaseApply(2); } b.setState('idle'); b.cool = 99; }
  if (b.state === 'idle') b.cool = 99;
  p.x = A.x0 + 330; p.iframes = 1e9;
}`;
