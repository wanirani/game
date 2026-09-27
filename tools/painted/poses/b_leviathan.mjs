// 레비아탄 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
export const STAGE = 's08';
// 각 포즈는 로직 상태기계를 실제로 돌려 만든다 (debugAct = 자리 잡은 목 모드에서 패턴 시작)
export const POSES = [
  'rise', 'roar', 'idle', 'cannon_w', 'cannon_a', 'spit', 'dive',
  'bite_w', 'bite_rise', 'bite_snap', 'bite_hold',
  'wave', 'arc_rise', 'arc_apex', 'arc_dive', 'arc_tail', 'geyser', 'tail_up', 'tail_slam',
  'hit', 'dmg1', 'dmg2',
  'death_05', 'death_12', 'death_19', 'death_25', 'death_31',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; } };
  const px = () => { p.x = A.x0 + A.w * 0.3; p.vx = 0; };
  const clear = () => { for (const e of w.entities) if (e !== b && e.owner === b && !e.dead && e.kind !== 'painted') e.dead = true; b.clearJobs?.(); };
  const act = (st, t, ph = 0, hp = null) => {
    if (b.dying > 0) return;
    clear();
    if (b.phase !== ph) { b.hp = b.stats.maxHp; b.phase = 0; b.enrage = 0; if (ph) b.debugPhase(ph); }
    if (hp != null) b.hp = b.stats.maxHp * hp;
    b.rest = 99; b.debugAct(st);
    for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); if (b.state === 'idle') b.rest = 99; }
  };
  const D0 = { v: 0 };
  const untilDeath = (t) => { for (let i = 0; i < 600 && b.dying > 0 && D0.v - b.dying < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'rise': act('rise', 0.45); break;
      case 'roar': act('roar', 0.6); break;
      case 'idle': act('idle', 1.2); break;
      case 'cannon_w': act('cannon', 0.55); break;
      case 'cannon_a': act('cannon', 1.4); break;
      case 'spit': act('spit', 0.5); break;
      case 'dive': act('dive', 0.3); break;
      case 'bite_w': act('bite', 0.45); break;
      case 'bite_rise': act('bite', 0.9); break;
      case 'bite_snap': act('bite', 1.04); break;
      case 'bite_hold': act('bite', 1.45); break;
      case 'wave': act('wave', 1.0); break;
      case 'arc_rise': act('arc', 1.0); break;
      case 'arc_apex': act('arc', 1.35); break;
      case 'arc_dive': act('arc', 1.72); break;
      case 'arc_tail': act('arc', 2.2); break;
      case 'geyser': act('geyser', 1.2, 1); break;
      case 'tail_up': act('tail', 0.6, 1); break;
      case 'tail_slam': act('tail', 1.12, 1); break;
      case 'hit': act('idle', 0.5, 0, 0.9); b.hurtbox(); b.takeHit(1, {}, w, {}); step(1); break;
      case 'dmg1': act('idle', 1.0, 1, 0.5); break;
      case 'dmg2': act('idle', 1.0, 2, 0.22); break;
      case 'death_05': act('idle', 0.6, 2, 0.2); b.invuln = false; b.takeHit(1e9, {}, w, {}); D0.v = b.dying; untilDeath(0.5); break;
      case 'death_12': untilDeath(1.2); break;
      case 'death_19': untilDeath(1.9); break;
      case 'death_25': untilDeath(2.5); break;
      case 'death_31': untilDeath(3.1); break;
    }
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, head: [Math.round(b.hx), Math.round(b.hy)], mode: b.mode, sub: b.sub, dying: +(b.dying ?? 0).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본 (i = 프레임 번호) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 360;
  if (k === 0) { b.hp = b.stats.maxHp; b.rest = 99; b.debugAct('idle'); }
  if (k === 60) b.debugAct('cannon');
  if (k === 180) { b.hp = b.stats.maxHp * 0.5; b.debugAct('spit'); }
  if (k === 250) b.debugAct('arc');
  if (b.state === 'idle') b.rest = 99;
  p.x = A.x0 + A.w * 0.3; p.iframes = 1e9;
}`;

/** 결정성 A/B (tools/painted/rng.mjs): 굽기 대기 동안 실제 루프가 남긴 투사체·구역·입자를 지우고 같은 조건에서 시작 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && (e.owner === b || e.boss === b || e.owner?.owner === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.clearJobs?.(); b.st = 0; b.pst = 0; b.rest = undefined; b.lastAtk = null; b.flashT = 0;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.45, { stats: p.stats }, w, {});
  if (i === 1095) b.takeHit(b.stats.maxHp * 0.3, { stats: p.stats }, w, {});
}`;
