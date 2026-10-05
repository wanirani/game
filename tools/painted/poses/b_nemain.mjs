// 네메인 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/e_nemain.js)를 실제로 돌려 만든다 —
//   등장(망토 펼침) · 대기 · 걷기 · 깃털 비수(예고 · 던짐) · 까마귀 급습(조준 · 내리꽂기) · 그림자 걸음(가라앉음 · 솟아오름 · 베기) ·
//   비석 없는 무덤(던짐 · 비석) · 둥지의 부름 · 피격 · 손상 1(가면 금) · unmask 전환(가면이 깨지는 순간 · 펼침) · 2페이즈 대기(맨얼굴) ·
//   까마귀 폭풍(흩어짐 · 휩쓸기 · 노출) · 둥지 고리 · 그믐(붉은 눈 · 기습) · 무릎(stagger) · 굴복(5초: 까마귀 → 단검 → 무릎 → 유지)
export const STAGE = 's22';
export const POSES = [
  'intro', 'idle', 'walk', 'volley_warn', 'volley', 'dive_aim', 'dive', 'step_sink', 'step_rise', 'step_slash',
  'nameless', 'graves', 'nest', 'hit', 'dmg1', 'unmask_06', 'unmask_14', 'idle2',
  'murder_burst', 'murder_sweep', 'murder_exposed', 'cage', 'eclipse_eyes', 'eclipse_slash', 'stagger',
  'submit_05', 'submit_13', 'submit_25', 'submit_45',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const X = Math.round(A.cx + 120);
  const nodlg = () => { for (let k = 0; k < 4 && g.top?.name === 'dialogue'; k++) g.top.finish?.(); };
  const step = (n) => { for (let i = 0; i < n; i++) { nodlg(); g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.idleWait = 99; } };
  const px = (d = 300) => { p.x = X - d; p.vx = 0; p.facing = 1; };
  const clear = () => {
    for (const e of w.entities) {
      if (e === b || e.kind === 'painted' || e.kind === 'bossart' || e.kind === 'standin') continue;
      if (e.kind === 'hazard' || e.kind === 'projectile' || e.owner === b || e.boss === b || e.summoner === b) e.dead = true;
    }
    b.clearJobs?.();
  };
  const ph = (n, hp) => { if (b.phase < n) b.debugPhase(n); b.hp = b.stats.maxHp * hp; };
  const settle = () => {
    if (b.dying > 0) return;
    clear(); w.cutscene = false; b.flashT = 0;
    b.cancelPattern?.(); b.invuln = false; b.harmless = false;
    b.zx = b.tzx = X; b.facing = -1; b.fk = -1; b.spd = 0; b.place();
    b.setState('idle'); b.idleWait = 99;
    for (let i = 0; i < 50; i++) { px(); b.tzx = X; b.spd = 0; step(1); }
  };
  const hold = (st, t, d) => { b.debugAct(st); for (let i = 0; i < Math.round(t * 60); i++) { px(d); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 900 && b.dying > 0 && (b.dieT ?? 0) < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': settle(); b.setState('intro'); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'idle': settle(); for (let i = 0; i < 20; i++) { px(); step(1); } break;
      case 'walk': settle(); b.tzx = X + 300; b.spd = 170; for (let i = 0; i < 40; i++) { px(); b.tzx = X + 300; b.spd = 170; step(1); } break;
      case 'volley_warn': settle(); hold('featherVolley', 0.45); break;
      case 'volley': settle(); hold('featherVolley', 0.7); break;
      case 'dive_aim': settle(); hold('crowDive', 0.8); break;
      case 'dive': settle(); hold('crowDive', 1.25); break;
      case 'step_sink': settle(); hold('shadowStep', 0.6); break;
      case 'step_rise': settle(); hold('shadowStep', 1.05, 200); break;
      case 'step_slash': settle(); hold('shadowStep', 1.3, 200); break;
      case 'nameless': settle(); hold('nameless', 0.5); break;
      case 'graves': settle(); hold('nameless', 1.3); break;
      case 'nest': settle(); hold('nestCall', 0.9); break;
      case 'hit': ph(0, 0.9); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dmg1': ph(0, 0.6); settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'unmask_06': ph(0, 0.52); settle(); b.hurtbox(); b.takeHit(b.stats.maxHp * 0.03, { stats: p.stats }, w, {}); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'unmask_14': for (let i = 0; i < 48; i++) { px(); step(1); } break;
      case 'idle2': ph(1, 0.45); settle(); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'murder_burst': ph(1, 0.45); settle(); hold('murder', 0.3); break;
      case 'murder_sweep': ph(1, 0.45); settle(); hold('murder', 1.7); break;
      case 'murder_exposed': ph(1, 0.45); settle(); b.debugAct('murder'); for (let i = 0; i < 900 && !b.exposed; i++) { px(); step(1); } for (let i = 0; i < 20; i++) { px(); step(1); } break;
      case 'cage': ph(1, 0.45); settle(); hold('featherCage', 1.2); break;
      case 'eclipse_eyes': ph(1, 0.45); settle(); hold('eclipse', 0.85); break;
      case 'eclipse_slash': ph(1, 0.45); settle(); hold('eclipse', 1.35); break;
      case 'stagger': ph(1, 0.45); settle(); hold('stagger', 0.7); break;
      case 'submit_05': ph(1, 0.1); settle(); b.hurtbox(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.5); break;
      case 'submit_13': untilDeath(1.3); break;
      case 'submit_25': untilDeath(2.5); break;
      case 'submit_45': untilDeath(4.5); break;
    }
    nodlg();
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    const pr = b._painted?.proxy;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, x: Math.round(b.zx), masked: b.masked, ghost: b.ghost, flock: +(b.flock?.a ?? 0).toFixed(2), dying: +(b.dying ?? 0).toFixed(2), painted: !!pr && !pr.dead };
  };
})()`;

/** 벤치마크 대본: 600 프레임 주기 (깃털 비수 → 둥지의 부름(망토 펼침) → P2 까마귀 폭풍(떼 40) → 둥지 고리) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 600;
  if (k === 0) { b.hp = b.stats.maxHp; b.debugAct('featherVolley'); }
  if (k === 120) b.debugAct('nestCall');
  if (k === 240) { if (b.phase < 1) b.debugPhase(1); b.hp = b.stats.maxHp * 0.45; b.debugAct('murder'); }
  if (k === 480) b.debugAct('featherCage');
  if (b.state === 'idle') b.idleWait = 99;
  p.x = A.cx - 360; p.iframes = 1e9;
}`;

/** rng.mjs 대본: 대사는 바로 넘기고, 0프레임에 남은 공격을 지우고, 705 프레임에 체력을 깎아 페이즈 1 을 넘긴다 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (w.game?.top?.name === 'dialogue') w.game.top.finish?.();
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && e.kind !== 'bossart' && e.kind !== 'standin' && (e.kind === 'projectile' || e.kind === 'hazard' || e.owner === b || e.boss === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.clearJobs?.(); b.flashT = 0; b.invuln = false; b.harmless = false;
    w.cutscene = false; w.hitstop = 0; w.slowmo = 0;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.52, { stats: p.stats }, w, {});
}`;
