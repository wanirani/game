// 니힐 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/d_nihil.js)를 실제로 돌려 만든다 —
//   등장 · 대기 · 손바닥 눈(내려찍기 → 눈 뜸) · 지우기(가리키는 손가락) · 별비 · 움켜쥐기(바닥 쓸기) · 핵/손 피격 ·
//   form2 전환(메아리 넷이 번갈아) · P2 대기 · 일그러짐 · 메아리 드라큘라/혼돈/나르키사/지즈 · phase2 전환(세로 찢김) · 붕괴(벽) ·
//   아가리(흡입 → 물기) · final 빨려듦 · P4 검은 태양 · 마지막 빛 · 태양 피격 · 사망(4초: 빛의 금 → 흰 섬광 → 마지막 빛).
export const STAGE = 's20';
export const POSES = [
  'intro', 'idle', 'palmEyes', 'erase', 'starfall', 'grasp', 'hit_core', 'hit_hand',
  'form2', 'p2_idle', 'glitch', 'echoDracula', 'echoChaos', 'echoNarkissa', 'echoZiz',
  'phase2', 'collapse', 'maw_open', 'maw_bite', 'final', 'p4_sun', 'lastLight', 'hit_sun',
  'death_05', 'death_14', 'death_20', 'death_26', 'death_32',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const nodlg = () => { for (let k = 0; k < 4 && g.top?.name === 'dialogue'; k++) g.top.finish?.(); };
  const step = (n) => { for (let i = 0; i < n; i++) { nodlg(); g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.idleWait = 99; } };
  const px = () => { const B = b.bounds?.() ?? A; p.x = Math.max(B.x0 + 40, Math.min(B.x1 - 80, b.bx - 380)); p.vx = 0; p.facing = 1; };   // 공허의 벽 안쪽
  const clear = () => {
    for (const e of w.entities) {
      if (e === b || e.kind === 'painted' || e.kind === 'bossart') continue;
      if (e.kind === 'hazard' || e.kind === 'projectile' || e.owner === b || e.boss === b) e.dead = true;
    }
    b.clearJobs?.();
  };
  const ph = (n, hp) => { if (b.phase < n) b.debugPhase(n); b.hp = b.stats.maxHp * hp; };
  const settle = () => {
    if (b.dying > 0) return;
    clear(); w.cutscene = false; b.flashT = 0;
    b.cancelPattern?.(); b.invuln = false; b.harmless = false;
    if (w.banner && b._fakeBanner === w.banner) w.banner = null;
    b.setState('idle'); b.idleWait = 99;
    for (let i = 0; i < 50; i++) { px(); step(1); }
  };
  const hold = (st, t) => { b.debugAct(st); for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const run = (t) => { for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 400 && b.dying > 0 && (b.dieT ?? 0) < t; i++) step(1); };
  const hitOn = (part) => { b.hurtbox(); b.hitPart = part; b.takeHit(1, { stats: p.stats }, w, {}); step(2); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': settle(); b.introK = 0; b.setState('intro'); run(0.45); break;
      case 'idle': settle(); run(0.6); break;
      case 'palmEyes': settle(); hold('palmEyes', 1.25); break;
      case 'erase': settle(); hold('erase', 0.75); break;
      case 'starfall': settle(); hold('starfall', 0.55); break;
      case 'grasp': settle(); hold('grasp', 1.3); break;
      case 'hit_core': ph(0, 0.9); settle(); hitOn(b.pCore); break;
      case 'hit_hand': ph(0, 0.88); settle(); hitOn(b.hands[1].pHand); break;
      case 'form2': ph(0, 0.8); settle(); b.debugAct('form2'); run(0.8); break;
      case 'p2_idle': ph(1, 0.6); settle(); run(0.8); break;
      case 'glitch': ph(1, 0.58); settle(); for (let i = 0; i < 240 && !(b.glitch > 0.6); i++) { px(); step(1); } break;
      case 'echoDracula': ph(1, 0.56); settle(); hold('echoDracula', 1.2); break;
      case 'echoChaos': ph(1, 0.55); settle(); hold('echoChaos', 0.8); break;
      case 'echoNarkissa': ph(1, 0.52); settle(); hold('echoNarkissa', 1.0); break;
      case 'echoZiz': ph(1, 0.5); settle(); hold('echoZiz', 0.8); break;
      case 'phase2': ph(1, 0.47); settle(); b.debugAct('phase2'); run(1.0); break;
      case 'collapse': ph(2, 0.4); settle(); run(1.2); hold('collapse', 1.6); break;
      case 'maw_open': ph(2, 0.35); settle(); hold('maw', 2.2); break;
      case 'maw_bite': ph(2, 0.34); settle(); b.debugAct('maw'); for (let i = 0; i < 400 && b.state === 'maw' && (b.st ?? 0) < 3.72; i++) { px(); step(1); } break;
      case 'final': ph(2, 0.2); settle(); b.debugAct('final'); run(1.0); break;
      case 'p4_sun': ph(3, 0.12); settle(); run(1.6); break;
      case 'lastLight': ph(3, 0.12); settle(); hold('lastLight', 0.8); break;
      case 'hit_sun': ph(3, 0.11); settle(); hitOn(b.pCore); break;
      case 'death_05': ph(3, 0.1); settle(); b.hurtbox(); b.hitPart = b.pCore; b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.5); break;
      case 'death_14': untilDeath(1.4); break;
      case 'death_20': untilDeath(2.0); break;
      case 'death_26': untilDeath(2.6); break;
      case 'death_32': untilDeath(3.2); break;
    }
    nodlg();
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    const pr = b._painted?.proxy;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, fp: b.formPhase, xy: [Math.round(b.bx), Math.round(b.by)], sun: +(b.sunK ?? 0).toFixed(2), maw: +(b.mawK ?? 0).toFixed(2), tear: +(b.tear ?? 0).toFixed(2), echo: b.echoKey, dying: +(b.dying ?? 0).toFixed(2), painted: !!pr && !pr.dead };
  };
})()`;

/** 벤치마크 대본: 700 프레임 주기 (P1 손바닥 눈 → P2 혼돈 메아리 → P3 아가리 → P4 마지막 빛) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 700;
  if (k === 0) { b.hp = b.stats.maxHp * 0.9; b.debugAct('palmEyes'); }
  if (k === 180) { if (b.phase < 1) b.debugPhase(1); b.hp = b.stats.maxHp * 0.6; b.debugAct('echoChaos'); }
  if (k === 330) { if (b.phase < 2) b.debugPhase(2); b.hp = b.stats.maxHp * 0.35; b.debugAct('maw'); }
  if (k === 560) { if (b.phase < 3) b.debugPhase(3); b.hp = b.stats.maxHp * 0.12; b.debugAct('lastLight'); }
  if (b.state === 'idle') b.idleWait = 99;
  p.x = A.x0 + 80; p.iframes = 1e9;
}`;

/** rng.mjs 대본: 대사는 바로 넘기고, 0프레임에 남은 공격을 지우고, 705·1095 프레임에 체력을 깎아 form2(75%) → phase2(45%) 를 넘긴다 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (w.game?.top?.name === 'dialogue') w.game.top.finish?.();
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && e.kind !== 'bossart' && (e.kind === 'projectile' || e.kind === 'hazard' || e.owner === b || e.boss === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.clearJobs?.(); b.flashT = 0; b.invuln = false; b.harmless = false;
    w.cutscene = false; w.hitstop = 0; w.slowmo = 0;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.36, { stats: p.stats }, w, {});
  if (i === 1095) b.takeHit(b.stats.maxHp * 0.33, { stats: p.stats }, w, {});
}`;
