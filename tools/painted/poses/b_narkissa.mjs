// 나르키사 포즈 스크립트 (tools/painted/poses.mjs · bench.mjs · rng.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/c_narkissa.js)를 실제로 돌려 만든다 —
//   1형태(가면): 등장 · 대기 · 거울 잠수(스며듦 → 거울 속 → 금빛 예고 → 가로 돌진) · 반사 광선 · 파편 비 · 팔 연격(낮게·높게·내려치기) ·
//   기절(진짜 거울) · 피격 · 손상 1 · 66% 비명(shatter1) · 거울 분신 · 만화경 · 33% 가면 깨짐(shatter → form2) ·
//   2형태(눈 가득한 얼굴·거울 이빨 아가리·공전 파편): 대기 · 천 개의 눈 · 거울 낙하 · 피격 · 손상 2 · 사망(2.8초: 균열 → 산산조각).
export const STAGE = 's14';
export const POSES = [
  'intro', 'idle', 'glide', 'dive_in', 'dive_mirror', 'dive_warn', 'dash', 'beam_w', 'beam_a', 'shardrain',
  'combo_low', 'combo_high', 'combo_over', 'stun', 'hit', 'dmg1', 'shatter1', 'twin', 'kaleido',
  'shatter_crack', 'shatter_break', 'idle2', 'eyes', 'mirrorfall', 'hit2', 'dmg2',
  'death_05', 'death_12', 'death_16', 'death_20', 'death_26',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const X = Math.min(A.x1 - 240, A.x0 + Math.max(560, A.w * 0.62));
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.idleWait = 99; } };
  const px = () => { p.x = X - 360; p.vx = 0; p.facing = 1; };
  const clear = () => {
    for (const e of w.entities) {
      if (e === b || e.kind === 'painted' || e.def?.id === 'nark_mirror') continue;
      if (e.kind === 'hazard' || e.kind === 'projectile' || e.owner === b || e.boss === b || e.def?.id === 'nark_twin' || e.def?.id === 'reflection') e.dead = true;
    }
    b.clearJobs?.(); b.twin = null;
    for (const m of b.mirrors) m.reset();
  };
  const ph = (n, hp) => { if (b.phase < n) b.debugPhase(n); b.hp = b.stats.maxHp * hp; };
  const settle = () => {
    if (b.dying > 0) return;
    clear(); w.cutscene = false; b.flashT = 0;
    b.cancelPattern?.(); b.invuln = false; b.harmless = false; b.hidden = false;
    b.place(X, b.homeB); b.setState('idle'); b.idleWait = 99;
    for (let i = 0; i < 50; i++) { px(); step(1); }
  };
  const hold = (st, t) => { b.debugAct(st); for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 400 && b.dying > 0 && 2.8 - b.dying < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': settle(); b.setState('intro'); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'idle': settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'glide': settle(); for (let i = 0; i < 30; i++) { p.x = b.cx - 120; p.vx = 0; step(1); } break;   // 가까운 플레이어에게서 미끄러지듯 물러남
      case 'dive_in': settle(); hold('mirrorDive', 0.3); break;
      case 'dive_mirror': settle(); hold('mirrorDive', 0.8); break;
      case 'dive_warn': settle(); hold('mirrorDive', 1.5); break;
      case 'dash': settle(); hold('mirrorDive', 1.97); break;
      case 'beam_w': settle(); hold('reflectBeam', 0.3); break;
      case 'beam_a': settle(); hold('reflectBeam', 1.28); break;
      case 'shardrain': settle(); hold('shardRain', 0.95); break;
      case 'combo_low': settle(); hold('armCombo', 0.72); break;
      case 'combo_high': settle(); hold('armCombo', 1.3); break;
      case 'combo_over': settle(); hold('armCombo', 1.95); break;
      case 'stun': settle(); b.onRealMirror(b.mirrors[1], w); for (let i = 0; i < 36; i++) { px(); step(1); } break;
      case 'hit': ph(0, 0.9); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dmg1': ph(1, 0.55); settle(); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'shatter1': settle(); b.debugAct('shatter1'); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'twin': ph(1, 0.5); settle(); hold('twinReflect', 1.3); break;
      case 'kaleido': ph(1, 0.5); settle(); hold('kaleido', 1.05); break;
      case 'shatter_crack': ph(1, 0.335); settle(); b.hurtbox(); b.takeHit(Math.ceil(b.stats.maxHp * 0.01), { stats: p.stats }, w, {}); for (let i = 0; i < 42; i++) { px(); step(1); } break;
      case 'shatter_break': for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'idle2': ph(2, 0.3); settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'eyes': ph(2, 0.3); settle(); hold('thousandEyes', 0.9); break;
      case 'mirrorfall': ph(2, 0.3); settle(); hold('mirrorFall', 1.15); break;
      case 'hit2': ph(2, 0.25); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dmg2': ph(2, 0.12); settle(); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'death_05': ph(2, 0.1); settle(); b.hurtbox(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.5); break;
      case 'death_12': untilDeath(1.2); break;
      case 'death_16': untilDeath(1.62); break;
      case 'death_20': untilDeath(2.0); break;
      case 'death_26': untilDeath(2.6); break;
    }
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, form: b.formPhase, pos: [Math.round(b.cx), Math.round(b.bottom)], hidden: !!b.hidden, twin: !!b.twin, dying: +(b.dying ?? 0).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본: 480 프레임 주기 (1형태 팔 연격·반사 광선 → 2형태 천 개의 눈·만화경) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 480;
  const X = Math.min(A.x1 - 240, A.x0 + Math.max(560, A.w * 0.62));
  if (k === 0) { b.hp = b.stats.maxHp; b.place(X, b.homeB); b.debugAct('armCombo'); }
  if (k === 140) b.debugAct('reflectBeam');
  if (k === 240) { if (b.phase < 2) b.debugPhase(2); b.hp = b.stats.maxHp * 0.3; b.place(X, b.homeB); b.debugAct('thousandEyes'); }
  if (k === 380) b.debugAct('kaleido');
  if (b.state === 'idle') b.idleWait = 99;
  p.x = X - 360; p.iframes = 1e9;
}`;

/** rng.mjs 대본: 0프레임에 남은 공격·분신을 지우고, 705·1095 프레임에 체력을 깎아 페이즈 1(비명) → 2(가면 깨짐)를 넘긴다 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && e.def?.id !== 'nark_mirror' && (e.kind === 'projectile' || e.kind === 'hazard' || e.owner === b || e.boss === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.clearJobs?.(); b.twin = null; b.flashT = 0; b.invuln = false; b.harmless = false; b.hidden = false;
    for (const m of b.mirrors) m.reset();
    w.cutscene = false; w.hitstop = 0; w.slowmo = 0;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.36, { stats: p.stats }, w, {});
  if (i === 1095) b.takeHit(b.stats.maxHp * 0.33, { stats: p.stats }, w, {});
}`;
