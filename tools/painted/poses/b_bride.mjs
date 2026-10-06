// 엘제베트 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/e_bride.js)를 실제로 돌려 만든다 —
//   등장(무릎 인사) · 대기 · 걷기 · 왈츠(착지 예고 · 박쥐로 흩어짐 · 회전 베기 · 무릎 인사 카운터) · 가시 채찍(감아 올림 · 휘두름) · 장미 던지기 ·
//   신부들의 부름(베일을 젖힘) · 회춘의 잔(머리 위로 · 마심) · 피격 · 손상 1 · 무릎(stagger, 귀부인·노파) · wither 전환(베일이 탄다 · 금 · 노파) ·
//   2페이즈 대기 · 마지막 왈츠(미끄러짐 · 잔상) · 피의 욕조(떠오름) · 세월 흡수(팔 벌림 · 노출) · 노파 채찍 · 15% 긴 무릎 · 쓰러짐(무릎 → 시든 꽃잎)
export const STAGE = 's24';
export const POSES = [
  'intro', 'idle', 'walk', 'waltz_mark', 'waltz_spin', 'waltz_bow', 'lash_wind', 'lash', 'throw', 'brides', 'goblet', 'drink', 'hit', 'dmg1',
  'stagger_l', 'wither_06', 'wither_14', 'wither_22', 'idle2', 'last_glide', 'last_after', 'bath', 'drain', 'drain_exposed', 'lash2', 'goblet2',
  'stagger_c', 'fall_05', 'fall_20', 'fall_28',
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
    b.zx = b.tzx = X; b.fy = A.floor; b.lp = null; b.facing = -1; b.fk = -1; b.spd = 0; b.place();
    b.setState('idle'); b.idleWait = 99;
    for (let i = 0; i < 50; i++) { px(); b.tzx = X; b.spd = 0; step(1); }
  };
  const hold = (st, t, d) => { b.debugAct(st); for (let i = 0; i < Math.round(t * 60); i++) { px(d); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 900 && b.dying > 0 && (b.dieT ?? 0) < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': settle(); b.setState('intro'); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'idle': settle(); for (let i = 0; i < 20; i++) { px(); step(1); } break;
      case 'walk': settle(); b.tzx = X + 300; b.spd = 140; for (let i = 0; i < 40; i++) { px(); b.tzx = X + 300; b.spd = 140; step(1); } break;
      case 'waltz_mark': settle(); hold('waltz', 0.2, 260); break;
      case 'waltz_spin': settle(); hold('waltz', 0.55, 260); break;
      case 'waltz_bow': settle(); hold('waltz', 2.1, 260); break;
      case 'lash_wind': settle(); hold('thornLash', 0.45, 300); break;
      case 'lash': settle(); hold('thornLash', 1.3, 300); break;
      case 'throw': settle(); hold('roseBloom', 0.5, 300); break;
      case 'brides': settle(); hold('brides', 0.6, 300); break;
      case 'goblet': ph(0, 0.8); settle(); hold('goblet', 1.0, 300); break;
      case 'drink': ph(0, 0.8); settle(); hold('goblet', 2.0, 300); break;
      case 'hit': ph(0, 0.9); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dmg1': ph(0, 0.6); settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'stagger_l': ph(0, 0.6); settle(); hold('stagger', 0.7); break;
      case 'wither_06': ph(0, 0.52); settle(); b.hurtbox(); b.takeHit(b.stats.maxHp * 0.03, { stats: p.stats }, w, {}); for (let i = 0; i < 36; i++) { px(); step(1); } break;
      case 'wither_14': for (let i = 0; i < 48; i++) { px(); step(1); } break;
      case 'wither_22': for (let i = 0; i < 48; i++) { px(); step(1); } break;
      case 'idle2': ph(1, 0.45); settle(); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'last_glide': ph(1, 0.45); settle(); hold('lastDance', 0.27, 260); break;
      case 'last_after': ph(1, 0.45); settle(); hold('lastDance', 0.78, 260); break;
      case 'bath': ph(1, 0.45); settle(); hold('crimsonBath', 1.6, 300); break;
      case 'drain': ph(1, 0.45); settle(); hold('drain', 1.2, 300); break;
      case 'drain_exposed': ph(1, 0.45); settle(); hold('drain', 2.4, 300); break;
      case 'lash2': ph(1, 0.45); settle(); hold('thornLash', 1.3, 300); break;
      case 'goblet2': ph(1, 0.4); settle(); hold('goblet', 0.9, 300); break;
      case 'stagger_c': ph(1, 0.45); settle(); b.stagLong = true; b.debugAct('stagger'); b.stagLong = true; for (let i = 0; i < 60; i++) { px(); step(1); } break;
      case 'fall_05': ph(1, 0.1); settle(); Object.defineProperty(w, 'arcade', { value: true, configurable: true }); b.hurtbox(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.5); break;   // 쓰러짐: 아케이드 규칙 (world.arcade — 꽃잎으로 사라짐)
      case 'fall_20': untilDeath(2.0); break;
      case 'fall_28': untilDeath(2.8); break;
    }
    nodlg();
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    const pr = b._painted?.proxy;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, x: Math.round(b.zx), y: Math.round(b.fy), crone: b.crone, ghost: b.ghost, dying: +(b.dying ?? 0).toFixed(2), painted: !!pr && !pr.dead };
  };
})()`;

/** 벤치마크 대본: 600 프레임 주기 (왈츠 → 가시 채찍 → P2 마지막 왈츠 → 세월 흡수) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 600;
  if (k === 0) { b.hp = b.stats.maxHp; b.debugAct('waltz'); }
  if (k === 150) b.debugAct('thornLash');
  if (k === 300) { if (b.phase < 1) b.debugPhase(1); b.hp = b.stats.maxHp * 0.45; b.debugAct('lastDance'); }
  if (k === 450) b.debugAct('drain');
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
