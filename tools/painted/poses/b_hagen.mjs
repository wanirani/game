// 하겐 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/e_hagen.js)를 실제로 돌려 만든다 —
//   등장 · 대기 · 걷기 · 조준 사격(무릎 쏴 · 고정 · 장전 노출) · 은 올가미(던지기) · 산탄 · 사냥칼(뽑기 · 베기 · 카운터 창) · 뿔피리 · 피격 · 손상 1 ·
//   moonrise 전환(달빛 · 외투가 찢어짐 · 늑대) · 2페이즈 대기 · 덮치기(웅크림 · 도약 · 착지) · 할퀴기 연타 · 울부짖음 · 달 그림자(급강하 · 노출) ·
//   무릎(stagger, 사람·늑대) · 가슴을 내줌(offer) · 쓰러짐(5초: 늑대가 눕는다 → 새벽빛 → 사람으로 누움)
export const STAGE = 's23';
export const POSES = [
  'intro', 'idle', 'walk', 'aim', 'aim_lock', 'reload', 'traps', 'buckshot', 'knife_draw', 'knife_slash', 'knife_counter', 'horn', 'hit', 'dmg1',
  'stagger_h', 'moon_04', 'moon_12', 'moon_21', 'idle2', 'pounce_crouch', 'pounce_air', 'pounce_land', 'claw', 'howl', 'dive_fall', 'dive_exposed',
  'stagger_w', 'offer', 'fall_05', 'fall_14', 'fall_25', 'fall_45',
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
    b.zx = b.tzx = X; b.fy = A.floor; b.air = false; b.facing = -1; b.fk = -1; b.spd = 0; b.place();
    b.setState('idle'); b.idleWait = 99;
    for (let i = 0; i < 50; i++) { px(); b.tzx = X; b.spd = 0; step(1); }
  };
  const hold = (st, t, d) => { b.debugAct(st); for (let i = 0; i < Math.round(t * 60); i++) { px(d); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 900 && b.dying > 0 && (b.dieT ?? 0) < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': settle(); b.setState('intro'); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'idle': settle(); for (let i = 0; i < 20; i++) { px(); step(1); } break;
      case 'walk': settle(); b.tzx = X + 300; b.spd = 120; for (let i = 0; i < 40; i++) { px(); b.tzx = X + 300; b.spd = 120; step(1); } break;
      case 'aim': settle(); hold('aimedShot', 0.6); break;
      case 'aim_lock': settle(); hold('aimedShot', 1.05); break;
      case 'reload': settle(); hold('aimedShot', 1.6); break;
      case 'traps': settle(); hold('trapLine', 0.7, 260); break;
      case 'buckshot': settle(); hold('buckshot', 0.5, 200); break;
      case 'knife_draw': settle(); hold('huntingKnife', 0.3, 200); break;
      case 'knife_slash': settle(); hold('huntingKnife', 0.5, 200); break;
      case 'knife_counter': settle(); hold('huntingKnife', 0.95, 200); break;
      case 'horn': settle(); hold('packCall', 0.6); break;
      case 'hit': ph(0, 0.9); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dmg1': ph(0, 0.6); settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'stagger_h': ph(0, 0.6); settle(); hold('stagger', 0.7); break;
      case 'moon_04': ph(0, 0.52); settle(); b.hurtbox(); b.takeHit(b.stats.maxHp * 0.03, { stats: p.stats }, w, {}); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'moon_12': for (let i = 0; i < 48; i++) { px(); step(1); } break;
      case 'moon_21': for (let i = 0; i < 54; i++) { px(); step(1); } break;
      case 'idle2': ph(1, 0.45); settle(); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'pounce_crouch': ph(1, 0.45); settle(); hold('pounce', 0.4, 260); break;
      case 'pounce_air': ph(1, 0.45); settle(); hold('pounce', 1.15, 260); break;
      case 'pounce_land': ph(1, 0.45); settle(); b.debugAct('pounce'); for (let i = 0; i < 300 && !b.cWin; i++) { px(260); step(1); } for (let i = 0; i < 6; i++) { px(260); step(1); } break;
      case 'claw': ph(1, 0.45); settle(); hold('clawRush', 0.55, 320); break;
      case 'howl': ph(1, 0.45); settle(); hold('packCall', 0.7); break;
      case 'dive_fall': ph(1, 0.45); settle(); b.debugAct('moonDive'); for (let i = 0; i < 600 && b.md?.stage !== 'fall'; i++) { px(80); step(1); } for (let i = 0; i < 8; i++) { px(80); step(1); } break;
      case 'dive_exposed': ph(1, 0.45); settle(); b.debugAct('moonDive'); for (let i = 0; i < 900 && !b.exposed; i++) { px(260); step(1); } for (let i = 0; i < 12; i++) { px(260); step(1); } break;
      case 'stagger_w': ph(1, 0.45); settle(); hold('stagger', 0.7); break;
      case 'offer': ph(1, 0.14); settle(); hold('offer', 1.2); break;
      case 'fall_05': ph(1, 0.1); settle(); b.hurtbox(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.5); break;
      case 'fall_14': untilDeath(1.4); break;
      case 'fall_25': untilDeath(2.5); break;
      case 'fall_45': untilDeath(4.5); break;
    }
    nodlg();
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    const pr = b._painted?.proxy;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, x: Math.round(b.zx), y: Math.round(b.fy), wolf: b.wolf, ghost: b.ghost, dying: +(b.dying ?? 0).toFixed(2), painted: !!pr && !pr.dead };
  };
})()`;

/** 벤치마크 대본: 600 프레임 주기 (조준 사격 → 사냥칼 → P2 할퀴기 연타 → 울부짖음 · 늑대 소환) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 600;
  if (k === 0) { b.hp = b.stats.maxHp; b.debugAct('aimedShot'); }
  if (k === 150) b.debugAct('huntingKnife');
  if (k === 300) { if (b.phase < 1) b.debugPhase(1); b.hp = b.stats.maxHp * 0.45; b.debugAct('clawRush'); }
  if (k === 450) b.debugAct('packCall');
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
