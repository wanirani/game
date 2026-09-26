// 사신 데스 포즈 스크립트 (tools/painted/poses.mjs · bench.mjs · rng.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/b_death.js)를 실제로 돌려 만든다 — 1형태(망토 사신) · 변신 · 2형태(거대 해골) · 3페이즈(저승의 문) · 사망.
export const STAGE = 's11';
export const POSES = [
  'idle', 'throw_w', 'throw_a', 'sickles', 'blink_w', 'blink_a', 'drain', 'dash_w', 'dash_a',
  'hit', 'dmg1', 'transform_a', 'transform_b', 'transform_c', 'idle2', 'storm', 'spears', 'cross', 'reap', 'dmg2',
  'death_03', 'death_10', 'death_18', 'death_24', 'death_29',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A, X = Math.min(A.x1 - 200, A.x0 + Math.max(600, A.w * 0.62));
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.rest = 99; } };
  const px = () => { p.x = X - 360; p.vx = 0; p.facing = 1; };
  const clear = () => { for (const e of w.entities) if (e.kind === 'hazard' || e.kind === 'projectile') e.dead = true; b.hasScythe = true; b.sickleSet = null; b.reapWarn = null; b.dashWarn = null; b.blinkTo = null; };
  const settle = () => {
    if (b.dying > 0) return;
    clear(); b.vanish = 0; b.invuln = false; b.harmless = false; b.flashT = 0; b.dim = 0; b.burn = 0;
    b.place(X, b.homeY); b.setState('idle'); b.rest = 99;
    for (let i = 0; i < 50; i++) { px(); step(1); }
  };
  const hold = (st, t) => { b.setState(st); for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const form2 = (ph, hp) => { if (b.form !== 2) { b.phase = 2; b.form = 2; b.scale = 1.3; b.burn = 0; } b.phase = ph; b.hp = b.stats.maxHp * hp; };
  const form1 = (ph, hp) => { b.form = 1; b.scale = 1; b.burn = 0; b.phase = ph; b.hp = b.stats.maxHp * hp; };
  const untilDeath = (t) => { for (let i = 0; i < 400 && b.dying > 0 && 3.2 - b.dying < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'idle': form1(0, 1); settle(); hold('idle', 1.2); break;
      case 'throw_w': settle(); hold('throw', 0.35); break;
      case 'throw_a': settle(); hold('throw', 0.72); break;
      case 'sickles': settle(); hold('sickles', 0.75); break;
      case 'blink_w': settle(); hold('blink', 0.45); break;
      case 'blink_a': settle(); hold('blink', 0.84); break;
      case 'drain': settle(); hold('drain', 1.3); break;
      case 'dash_w': settle(); hold('dash', 0.45); break;
      case 'dash_a': settle(); hold('dash', 0.95); break;
      case 'hit': form1(0, 0.9); settle(); hold('idle', 0.4); b.takeHit(1, { stats: p.stats }, w, {}); step(1); break;
      case 'dmg1': form1(1, 0.6); settle(); hold('idle', 1.0); break;
      case 'transform_a': form1(1, 0.505); settle(); b.takeHit(b.stats.maxHp * 0.01, { stats: p.stats }, w, {}); for (let i = 0; i < 48; i++) { px(); step(1); } break;
      case 'transform_b': for (let i = 0; i < 42; i++) { px(); step(1); } break;
      case 'transform_c': for (let i = 0; i < 24; i++) { px(); step(1); } break;
      case 'idle2': form2(2, 0.45); settle(); hold('idle', 1.2); break;
      case 'storm': form2(2, 0.45); settle(); hold('storm', 1.1); break;
      case 'spears': form2(2, 0.45); settle(); hold('spears', 0.9); break;
      case 'cross': form2(2, 0.45); settle(); hold('cross', 0.75); break;
      case 'reap': form2(3, 0.15); settle(); hold('reap', 0.95); break;
      case 'dmg2': form2(3, 0.15); settle(); hold('idle', 1.0); break;
      case 'death_03': form2(3, 0.1); settle(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.3); break;
      case 'death_10': untilDeath(1.0); break;
      case 'death_18': untilDeath(1.8); break;
      case 'death_24': untilDeath(2.4); break;
      case 'death_29': untilDeath(2.9); break;
    }
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, form: b.form, S: +b.scale.toFixed(2), pos: [Math.round(b.cx), Math.round(b.bottom)], vanish: +b.vanish.toFixed(2), scythe: b.hasScythe, dying: +(b.dying).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본: 360 프레임 주기 (1형태 투척·순간이동 → 2형태 폭풍·교차) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 360;
  const X = Math.min(A.x1 - 200, A.x0 + Math.max(600, A.w * 0.62));
  if (k === 0) { b.hp = b.stats.maxHp; b.phase = 0; b.form = 1; b.scale = 1; b.vanish = 0; b.hasScythe = true; b.place(X, b.homeY); b.setState('idle'); }
  if (k === 30) b.setState('throw');
  if (k === 120) { b.hasScythe = true; b.setState('sickles'); }
  if (k === 200) { b.phase = 2; b.form = 2; b.scale = 1.3; b.hp = b.stats.maxHp * 0.45; b.hasScythe = true; b.setState('storm'); }
  if (b.state === 'idle') b.rest = 99;
  p.x = X - 360; p.iframes = 1e9;
}`;
