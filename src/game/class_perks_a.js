// 직업 특성 내용 A — 카엘·세라 (PERKS-A) (docs/specs/classes_t3.md §3.1 · §4.1 · §4.2 · §5 · §6)
//  PERKS_A   { '<CLASSES id | ASCENSIONS id | char:<영웅>>': { only?, N?, <훅>… } }   (§3.2, 훅 이름은 class_perks.js HOOK_NAMES)
//  ACTIVES_A { 'asc_<영웅>_<낱말>': (p, w, lv) => true|false }                          (비전 액티브, skills.js castSkill 대체 경로)
//  MARKS_A   { '<표식 키>': (ctx, e, n, k, t) => {…} }                                 (PerkLayer 가 그린다; k = 남은 시간 비율)
//  toll(p, w, o)  종의 성녀 종소리 (패시브·액티브 공용, §5)
//  STATS_A   { procs: { '<항목>.<일>': 횟수 } }  — 발동 횟수 (QA 탐침이 읽는다; 발동 때만 늘어난다)
// 규칙 (§3.5 · §3.6): ./class_perks.js 와 데이터 모듈만 import 한다 (skills.js · player.js · world.js 금지).
// 모듈 최상단에서 가져온 바인딩(K·도우미)을 읽지 않는다 — 훅 본문 안에서만. 최상단에서 bus·game·document 를 건드리지 않는다.
// 모든 조절 수치는 항목의 N 표 (classes.js · ascensions.js 의 perk 문구 숫자와 같아야 한다). 백분율은 문구 그대로 % 값으로 적는다.
// 특성이 만드는 공격은 proc (procStrike · K.uHit{proc:true} · K.atk{proc:true}) — 비전 액티브의 타격만 보통 스킬 타격 (§5).
// 그리기(표식·게이지·연출 draw)에는 난수·파티클·그라디언트·문자열 조립이 없다 (캐시 스프라이트 K.glow + 선 몇 개).
import { procStrike, mark, markOf, unmark, icd, slowEnemy, perkState, K } from './class_perks.js';
import { skillVal } from '../data/skills.js';

const TAU = Math.PI * 2;
const ADD = 'lighter';
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const isBoss = (e) => e?.kind === 'boss';
const maxHp = (p) => p?.stats?.hp ?? 1;
const nowOf = (w) => w?.time ?? 0;
const circ = (x, y, r) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
const NOBOX = Object.freeze({ box: null });
/** 발동 횟수 (QA) */
export const STATS_A = { procs: {} };
const count = (k) => { STATS_A.procs[k] = (STATS_A.procs[k] ?? 0) + 1; };

// ─────────────────────────── 공용 도우미 ───────────────────────────
function sfx(w, name, o) { try { w?.game?.audio?.sfx?.(name, o); } catch { /* 소리 없음 */ } }
function callout(w, x, y, text, color) { try { w.fx.callout?.(x, y, text, { color }); } catch { /* 연출 없음 */ } }
/**
 * 특성 부가 타격 (proc). o: procAtk 옵션 { mv, type, element, kb, stun, tags, hitstop } + dmgColor(숫자 색) · mult(기본 1).
 * 숫자 색이나 배율이 있으면 K.uHit(playerStrike + 공격 객체)로 실어 보낸다 (procAtk 는 dmgColor 를 옮기지 않는다) → 맞힌 수
 */
function strike(w, p, rect, o) {
  if ((!o.dmgColor && !(o.mult > 0)) || typeof K.uHit !== 'function') return procStrike(w, p, rect, o);
  return K.uHit(w, p, o.mv ?? 1, {
    rect, type: o.type ?? 'phys', element: o.element ?? null, kb: o.kb ?? [80, -60], hitstop: Math.min(0.08, Math.max(0, o.hitstop ?? 0)),
    shake: 0, tags: o.tags ?? ['melee'], proc: true, crit: 0, mult: o.mult ?? 1, stun: o.stun, dmgColor: o.dmgColor, breakWalls: false, launch: false,
  }) || 0;
}
/** 살아 있는 적 (적·보스) 가운데 (x, y) 에서 몸통 상자까지 거리가 r 이하인 것마다 fn(e) — 배열을 만들지 않는다 */
function forFoes(w, x, y, r, fn, skip = null) {
  const L = w?.entities;
  if (!L) return 0;
  let n = 0;
  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (e === skip || (e.kind !== 'enemy' && e.kind !== 'boss') || e.dead || e.hidden || e.dying > 0 || e.invuln || e.pendingBoss) continue;
    const nx = x < e.x ? e.x : x > e.x + e.w ? e.x + e.w : x, ny = y < e.y ? e.y : y > e.y + e.h ? e.y + e.h : y;
    const dx = nx - x, dy = ny - y;
    if (dx * dx + dy * dy > r * r) continue;
    n++;
    fn(e);
  }
  return n;
}
/**
 * 성광 폭발 (K.boom 과 같은 판정·모양, 파티클은 12개 이하 × 품질 · 숫자 색). o: { mv, type, element, tags, mult, hitstop, shake,
 * c1, c2, sfx, dmgColor, kb } → 맞힌 수
 */
function nova(w, p, x, y, r, o) {
  const n = strike(w, p, circ(x, y, r), { mv: o.mv, type: o.type ?? 'phys', element: o.element ?? 'holy', kb: o.kb ?? [320, -380], tags: o.tags ?? ['melee'],
    mult: o.mult ?? 1, hitstop: o.hitstop ?? 0, dmgColor: o.dmgColor ?? o.c1 });
  const c1 = o.c1 ?? '#ffd84a', c2 = o.c2 ?? '#fff8e0';
  if (typeof K.fx === 'function') K.fx(w, {
    x: x - r * 1.6, y: y - r * 1.6, w: r * 3.2, h: r * 3.2, life: 0.45, z: 12,
    draw(ctx, e) {
      const k = e.k, kk = 1 - (1 - Math.min(1, k * 3)) ** 3;
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, x, y, r * (0.7 + kk * 0.9), c1, (1 - k) * 0.85);
      K.glow(ctx, x, y, r * 0.6 * (1 - k * 0.6), c2, 1 - k);
      if (k < 0.3) K.glow(ctx, x, y, r * 0.35, '#ffffff', 1 - k / 0.3);
      ctx.globalAlpha = (1 - k) * 0.85; ctx.strokeStyle = c2; ctx.lineWidth = 7 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(x, y, r * (0.3 + kk * 1.05), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    },
    light(L, e) { L.add(x, y, r * 3, c1, 1.3 * (1 - e.k)); },
  });
  w.fx.burst(o.burst ?? 'holy', x, y, 10, { speed: r * 2.4, color: c1 });
  w.fx.ring(x, y, { color: c2, r0: r * 0.2, r1: r * 1.1, life: 0.35, width: 6 });
  if (o.shake) w.camera?.shake?.(o.shake, 0.25);
  sfx(w, o.sfx ?? 'holy', { vol: 0.8 });
  return n;
}
/** 캐시 스프라이트·판정 문구를 미리 굽는다 (prewarm: 방 입장 때 한 번 — 전투 중 캔버스 생성 없음) */
function warm(w, cols, calls) {
  for (const c of cols) K.glowSprite?.(c);
  if (calls) for (let i = 0; i < calls.length; i += 2) callout(w, -99999, -99999, calls[i], calls[i + 1]);
}
const lowQ = (w) => (w?.fx?.quality ?? 1) < 0.6;
/** 장판의 바닥 y: 공중에서 펴도 발 아래 땅(7칸 안)에 깐다, 없으면 발 위치 */
const floorY = (w, p) => (p.onGround ? p.bottom : K.groundAt?.(w, p.cx, p.bottom - 4) ?? p.bottom);

// ── 적 탄 지우기 (종의 성녀): guardian.js blockable · quietExpire 와 같은 규칙. 특성 모듈은 guardian.js 를 import 하지 않으므로
//    K 에 묶여 있으면 그것을, 없으면 같은 동작의 사본을 쓴다 (쏜 적의 탄 장부 onExpire 는 풀되, 그 안의 폭발·연출·소리는 막는다)
const noop = () => {};
const MUTED = new WeakMap();
function mutedFx(fx) {
  if (!fx || typeof fx !== 'object') return fx;
  let m = MUTED.get(fx);
  if (!m) { m = new Proxy(fx, { get: (t, k) => (typeof t[k] === 'function' ? noop : t[k]) }); MUTED.set(fx, m); }
  return m;
}
function blockLocal(e) {
  return e.kind === 'projectile' && e.team === 'enemy' && !e.dead && e.behavior !== 'beam' && !e.unblockable && e.w <= 80 && e.h <= 80;
}
function quietLocal(world, q) {
  const fn = q.onExpire;
  q.onExpire = null; q.onHit = null; q.onWall = null; q.onLand = null;
  if (typeof fn !== 'function' || !world) return;
  const cam = world.camera, au = world.game?.audio;
  const had = { add: hasOwn(world, 'add'), shake: !!cam && hasOwn(cam, 'shake'), sfx: !!au && hasOwn(au, 'sfx') };
  const prev = { add: world.add, fx: world.fx, shake: cam?.shake, sfx: au?.sfx };
  world.add = (e) => { if (e && typeof e === 'object') { e.dead = true; e.world = world; } return e; };
  world.fx = mutedFx(prev.fx);
  if (cam) cam.shake = noop;
  if (au) au.sfx = noop;
  try { fn(q, world, false); } catch { /* 탄 장부 오류는 무시 (탄은 이미 없어졌다) */ }
  finally {
    if (had.add) world.add = prev.add; else delete world.add;
    world.fx = prev.fx;
    if (cam) { if (had.shake) cam.shake = prev.shake; else delete cam.shake; }
    if (au) { if (had.sfx) au.sfx = prev.sfx; else delete au.sfx; }
  }
}
/** 반경 R 안의 적 탄을 지운다 → 지운 수 */
function eraseShots(w, x, y, R, color) {
  const L = w?.entities;
  if (!L) return 0;
  const B = typeof K.blockable === 'function' ? K.blockable : blockLocal, QE = typeof K.quietExpire === 'function' ? K.quietExpire : quietLocal;
  let n = 0;
  for (let i = 0; i < L.length; i++) {
    const q = L[i];
    if (q.kind !== 'projectile' || !B(q)) continue;
    const dx = q.cx - x, dy = q.cy - y;
    if (dx * dx + dy * dy > R * R) continue;
    const qx = q.cx, qy = q.cy;
    q.dead = true;
    QE(w, q);
    if (n++ < 2) w.fx.burst('spark', qx, qy, 2, { speed: 160, color });   // 종소리 하나에 파티클 ≤ 12 (만종 8 + 4)
  }
  return n;
}

// ─────────────────────────── 그리기 조각 (그리기 경로: 난수·할당 없음) ───────────────────────────
/** 종 (원점 = 종 꼭대기 고리, 아래로 매달림). s = 크기, a = 알파 */
function drawBell(ctx, s, col, a) {
  ctx.globalAlpha = a;
  ctx.fillStyle = col; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, s * 0.12);
  ctx.quadraticCurveTo(-s * 0.36, s * 0.16, -s * 0.38, s * 0.62);
  ctx.quadraticCurveTo(-s * 0.42, s * 0.9, -s * 0.58, s * 1.0);
  ctx.lineTo(s * 0.58, s * 1.0);
  ctx.quadraticCurveTo(s * 0.42, s * 0.9, s * 0.38, s * 0.62);
  ctx.quadraticCurveTo(s * 0.36, s * 0.16, s * 0.18, s * 0.12);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, s * 0.04, s * 0.1, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(0, s * 1.06, s * 0.1, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}
/** 머리 위 작은 마름모 하나 (어두운 테두리: 불길·밝은 배경에서도 읽히게) */
function pip(ctx, x, y, s, col, a) {
  ctx.globalAlpha = a; ctx.fillStyle = col; ctx.strokeStyle = '#1a0610'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.globalAlpha = 1;
}
/** 영웅 게이지 높이: 히트박스 위쪽(p.y)에서 이만큼 위 — 퍼펫 그림(머리·후광·모자·날개)에 가리지 않게 (PerkLayer z 9 < 영웅 z 10) */
const METER_DY = 38;

// ─────────────────────────── 화형 (화형 심판장) ───────────────────────────
function pyre(w, p, tgt, N) {
  w._pkPyres = (w._pkPyres ?? 0) + 1;
  count('kael_highinquisitor.pyre');
  callout(w, tgt.cx, tgt.y - 24, '화형!', '#ff8a3a');
  sfx(w, 'fire', { vol: 0.7 });
  const hb = () => (typeof tgt.hurtbox === 'function' ? tgt.hurtbox() : tgt);
  K.fx(w, {
    life: N.pyreT + 0.02, z: 9, d: { n: 0, x: tgt.cx, b: tgt.bottom ?? tgt.y + tgt.h, h: tgt.h ?? 60 },
    follow(e) {
      if (!tgt.dead) { e.d.x = tgt.cx; e.d.b = tgt.bottom ?? tgt.y + tgt.h; e.d.h = tgt.h ?? 60; }
      e.x = e.d.x - 60; e.y = e.d.b - e.d.h - 40; e.w = 120; e.h = e.d.h + 50;
    },
    tick(e, ww) {
      if (tgt.dead) { e.life = Math.min(e.life, e.lt); return; }
      while (e.d.n < N.ticks && e.lt >= (e.d.n + 1) * N.tickT) {
        e.d.n++;
        const r = hb();
        strike(ww, p, { x: r.x - N.pad, y: r.y - N.pad, w: r.w + N.pad * 2, h: r.h + N.pad * 2 },
          { mv: N.mvPct / 100, element: 'fire', kb: [0, -40], dmgColor: '#ff8a3a' });
        ww.fx.emit('ember', e.d.x + ((e.d.n * 37) % 40) - 20, e.d.b - 10, { angle: -Math.PI / 2, spread: 0.5, speed: 160, color: '#ffb040' });
        if (!lowQ(ww)) ww.fx.emit('fire', e.d.x, e.d.b - e.d.h * 0.4, { angle: -Math.PI / 2, spread: 0.4, speed: 90, color: '#ff5a1a' });
      }
    },
    end(e, ww) { ww._pkPyres = Math.max(0, (ww._pkPyres ?? 1) - 1); },
    draw(ctx, e) {
      const a = Math.min(1, e.lt / 0.12) * clamp01((e.life - e.lt) / 0.3), x = e.d.x, b = e.d.b, h = e.d.h;
      const fl = 1 + 0.12 * Math.sin(e.lt * 31);
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, x, b - h * 0.25, (h * 0.55 + 26) * fl, '#ff5a1a', 0.8 * a);
      K.glow(ctx, x, b - h * 0.55, (h * 0.42 + 18) * fl, '#ffb040', 0.75 * a);
      K.glow(ctx, x, b - h * 0.85, (h * 0.28 + 12) * fl, '#fff2b0', 0.7 * a);
    },
    light(L, e) { L.add(e.d.x, e.d.b - e.d.h * 0.5, 140, '#ff7a2a', 1.1); },
  });
}

// ─────────────────────────── 피의 초승달 (피의 처단자) ───────────────────────────
function crescentHit(pr) {
  const p = pr.owner, N = PERKS_A.kael_bloodreaver.N;
  if (!p || p.dead) return;
  const got = Math.min(N.healMax, pr.hits ?? 0), n = got - (pr._pkH ?? 0);
  if (n <= 0) return;
  pr._pkH = got;
  p.heal(maxHp(p) * N.healPct / 100 * n);
  count('kael_bloodreaver.heal');
}

// ─────────────────────────── 깃털 비 (흑익의 사냥꾼) ───────────────────────────
function featherRain(w, p, N) {
  count('kael_blackwing.rain');
  const n = N.n, sp = N.spread;
  for (let i = 0; i < n; i++) {
    const x = p.cx + (i - (n - 1) / 2) * (sp * 2 / n) + ((i * 53) % 21) - 10;
    const y = p.bottom - N.h - (i % 3) * 26;
    K.shoot(w, p, {
      x, y, vx: (p.cx - x) * 0.18, vy: 980, w: 18, h: 30, scale: 1.1, render: K.featherRenderD, life: 0.42, pierce: 2, collideWalls: false,
      attack: K.atk(p, { mv: N.mvPct / 100, element: 'dark', kb: [60, -80], hitstop: 0, shake: 0, tags: ['melee'], proc: true, dmgColor: '#b89aff' }),
    });
  }
  w.fx.burst('feather', p.cx, p.bottom - N.h * 0.6, 6, { speed: 160, color: '#2a2230' });
  w.fx.ring(p.cx, p.bottom - 6, { color: '#9a8aff', r0: 10, r1: 120, life: 0.35, width: 4 });
  sfx(w, 'crow_caw', { vol: 0.7 });
}

// ─────────────────────────── 성역 (대성녀) ───────────────────────────
function sanctum(w, p, N) {
  count('sera_archsaint.zone');
  const x0 = p.cx, y0 = floorY(w, p), R = N.r;
  sfx(w, 'holy', { vol: 0.7 });
  w.fx.ring(x0, y0 - 4, { color: '#ffe9a0', r0: 20, r1: R, life: 0.4, width: 6 });
  K.fx(w, {
    life: N.t, z: 3, x: x0 - R - 20, y: y0 - R, w: R * 2 + 40, h: R + 30, d: { next: N.tickT, pk: 9 },
    tick(e, ww, dt) {
      e.d.pk += dt;
      while (e.lt >= e.d.next && e.d.next <= N.t + 1e-6) {
        e.d.next += N.tickT; e.d.pk = 0;
        if (!p.dead && Math.abs(p.cx - x0) < R && Math.abs(p.bottom - y0) < N.ry) {
          p.heal(maxHp(p) * N.healPct / 100, false);
          ww.fx.burst('holy', p.cx, p.cy, 2, { speed: 90, color: '#7ee07e' });
          count('sera_archsaint.heal');
        }
        strike(ww, p, { x: x0 - R, y: y0 - 110, w: R * 2, h: 120 }, { mv: N.mvPct / 100, type: 'mag', element: 'holy', kb: [40, -40], dmgColor: '#ffe9a0' });
      }
    },
    draw(ctx, e) {
      const open = Math.min(1, e.lt / 0.25), a = clamp01((e.life - e.lt) / 0.35) * open;
      K.runeCircle(ctx, x0, y0 - 2, R * open, '#ffe9a0', e.lt * 1.2, a, 0.22, 8);
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, x0, y0 - 18, R * 0.9, '#ffe9a0', 0.22 * a);
      if (e.d.pk < 0.25) K.glow(ctx, x0, y0 - 30, R * (0.5 + e.d.pk * 2), '#ffffff', 0.35 * (1 - e.d.pk / 0.25) * a);
    },
    light(L) { L.add(x0, y0 - 40, R * 2, '#ffe9a0', 0.8); },
  });
}

// ─────────────────────────── 삼원 융합탄 (대현자) ───────────────────────────
const SIG_COL = ['#ff7a2a', '#9fe8ff', '#fff2a0'];
const FUSE = { fire: ['#ff7a2a', '#ffd070'], ice: ['#9fe8ff', '#e8fbff'], thunder: ['#fff2a0', '#ffffff'] };
function fuseElement(w, x, y) {
  const e = w.nearestEnemy?.(x, y, 320);
  const wk = e?.stats?.weak;
  if (wk) for (const el of ['fire', 'ice', 'thunder']) if (wk.includes(el)) return el;
  return 'fire';
}
function fuseBurst(pr, w) {
  const p = pr.owner, N = PERKS_A.sera_archsage.N;
  if (!p || pr._pkDone) return;
  pr._pkDone = true;
  const x = pr.cx, y = pr.cy, el = fuseElement(w, x, y), C = FUSE[el];
  count('sera_archsage.burst');
  nova(w, p, x, y, N.r, { mv: N.mvPct / 100, type: 'mag', element: el, tags: ['skill'], mult: p.dmgMul, hitstop: 0.05, shake: 6, c1: C[0], c2: C[1], burst: el, sfx: el });
  p.mp = Math.min(p.stats?.mp ?? p.mp, p.mp + N.mp);
  w.fx.text(p.cx, p.y - 24, 'MP +' + N.mp, { color: '#5aa8ff', size: 16 });
}
/** 벽에 닿아 사라질 때도 터진다 (명세 「맞거나 사라질 때」 — onWall 이 없으면 projectiles.js 가 onExpire 없이 지운다) */
function fuseWall(pr, w) { pr.expire(w, false); }

// ─────────────────────────── 정전기 연쇄 (뇌우의 무녀) ───────────────────────────
const CH_E = [null, null, null], CH_D = [0, 0, 0];   // 연쇄 후보 (가까운 3) — 발동마다 다시 쓴다
function chainFrom(w, p, src, N) {
  CH_E[0] = CH_E[1] = CH_E[2] = null; CH_D[0] = CH_D[1] = CH_D[2] = Infinity;
  const L = w.entities, R2 = N.r * N.r, sx = src.cx, sy = src.cy;
  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (e === src || (e.kind !== 'enemy' && e.kind !== 'boss') || e.dead || e.hidden || e.invuln || e.dying > 0 || !markOf(e, 'static')) continue;
    const dx = e.cx - sx, dy = e.cy - sy, d = dx * dx + dy * dy;
    if (d > R2) continue;
    for (let j = 0; j < N.n && j < 3; j++) if (d < CH_D[j]) {
      for (let k = 2; k > j; k--) { CH_E[k] = CH_E[k - 1]; CH_D[k] = CH_D[k - 1]; }
      CH_E[j] = e; CH_D[j] = d; break;
    }
  }
  let n = 0;
  for (let j = 0; j < 3; j++) {
    const e = CH_E[j];
    if (!e) continue;
    CH_E[j] = null;
    n++;
    const ex = e.cx, ey = e.cy;
    strike(w, p, circ(ex, ey, 22), { mv: N.mvPct / 100, type: 'mag', element: 'thunder', stun: N.stunT, kb: [40, -60], dmgColor: '#bfe0ff' });
    unmark(e, 'static', N.consume);
    const pts = K.boltPts(sx, sy, ex, ey, 8, 18);
    K.fx(w, {
      life: 0.18, z: 11, x: Math.min(sx, ex) - 30, y: Math.min(sy, ey) - 30, w: Math.abs(ex - sx) + 60, h: Math.abs(ey - sy) + 60,
      draw(ctx, fe) { const a = 1 - fe.k; K.drawBolt(ctx, pts, '#bfe0ff', 3, a); ctx.globalCompositeOperation = ADD; K.glow(ctx, ex, ey, 34, '#bfe0ff', 0.8 * a); },
    });
    w.fx.burst('thunder', ex, ey, 3, { speed: 220, color: '#e0f4ff' });
  }
  if (n) { count('sera_tempest.chain'); sfx(w, 'thunder', { vol: 0.45, pitch: 1.25 }); }
  return n;
}

// ─────────────────────────── 봉인 (발크레인 봉인자) ───────────────────────────
/** 봉인 add 중첩 → 5중첩이면 일반 적 2초 봉인 / 보스 4초 균열 (대상마다 재사용 대기) → 발동했으면 true */
function sealStack(w, p, tgt, add, N) {
  if (!tgt || tgt.dead) return false;
  const n = mark(tgt, 'seal', N.t, add, N.max);
  if (n < N.max) return false;
  if (isBoss(tgt)) {
    if (!icd(tgt, 'pkCrack', N.crackIcd, w)) return false;
    mark(tgt, 'crack', N.crackT, 1, 1);
    count('kael_sealbearer.crack');
  } else {
    if (!icd(tgt, 'pkSealed', N.sealIcd, w)) return false;
    tgt.stun = Math.max(tgt.stun ?? 0, N.sealT);
    tgt.vx = 0;
    mark(tgt, 'sealed', N.sealT, 1, 1);
    count('kael_sealbearer.sealed');
  }
  unmark(tgt, 'seal');
  w.fx.ring(tgt.cx, tgt.cy, { color: '#ffd84a', r0: 10, r1: 70, life: 0.35, width: 5 });
  if (SEAL_FX-- > 0) {   // 제1봉인이 여러 적을 한꺼번에 봉인할 때 문구·파티클은 3명까지 (해방기 파티클 ≤ 24, §12)
    callout(w, tgt.cx, tgt.y - 20, '봉인!', '#ffd84a');
    w.fx.burst('gold', tgt.cx, tgt.cy, 6, { speed: 200 });
    sfx(w, 'seal_stamp', { vol: 0.6 });
  }
  return true;
}
let SEAL_FX = Infinity;

// ─────────────────────────── 종소리 (종의 성녀; 패시브·액티브 공용) ───────────────────────────
/**
 * 종소리 한 번. o: { x, y, R, mv, healPct, great, proc } — 반경 R 신성 파동(0.3초 경직) · 그 안의 적 탄 지우기 · 최대 HP 회복.
 * proc: true(패시브) → 특성 부가 타격, false(액티브) → 보통 스킬 타격 → 맞힌 수
 */
export function toll(p, w, o) {
  if (!p || !w) return 0;
  const x = o.x ?? p.cx, y = o.y ?? p.cy, R = o.R, great = !!o.great, NB = PERKS_A.sera_bellsaint.N;
  let n;
  if (o.proc) n = strike(w, p, circ(x, y, R), { mv: o.mv, type: 'mag', element: 'holy', stun: NB.stunT, kb: [220, -120], dmgColor: '#e8f0ff' });
  else n = K.uHit?.(w, p, o.mv, { rect: circ(x, y, R), type: 'mag', element: 'holy', stun: NB.stunT, kb: [220, -120], hitstop: 0.03, shake: 2, tags: ['skill'], dmgColor: '#e8f0ff', pkBell: true }) ?? 0;   // pkBell: 패시브 적중 계수에 넣지 않는다 (§5 'no passive counter')
  const erased = NB.eraseProj ? eraseShots(w, x, y, R, '#e8f0ff') : 0;
  if (o.healPct > 0 && !p.dead) p.heal(maxHp(p) * o.healPct / 100);
  w.fx.ring(x, y, { color: '#e8f0ff', r0: 20, r1: R, life: 0.45, width: great ? 9 : 5 });
  if (great) { w.fx.ring(x, y, { color: '#ffd84a', r0: 30, r1: R * 1.05, life: 0.6, width: 4 }); callout(w, p.cx, p.y - 34, '만종!', '#ffd84a'); }
  w.fx.burst('holy', x, y - 20, great ? 8 : 5, { speed: R * 1.6, color: '#e8f0ff' });
  if (o.bellFx !== false) bellFlash(w, p, great);
  sfx(w, 'bell', { vol: great ? 0.9 : 0.6, pitch: great ? 0.8 : 1.05 });
  if (erased) count('sera_bellsaint.erase');
  return n;
}
/** 패시브 종: 머리 위에 잠깐 나타나는 종 */
function bellFlash(w, p, great) {
  const s = great ? 26 : 18;
  K.fx?.(w, {
    life: 0.5, z: 11, d: {},
    follow(e) { e.x = p.cx - 40; e.y = p.y - 90; e.w = 80; e.h = 80; },
    draw(ctx, e) {
      const a = Math.min(1, e.lt / 0.08) * (1 - e.k), sw = Math.sin(e.lt * 18) * 0.25 * (1 - e.k);
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, p.cx, p.y - 52, s * 2.2, great ? '#ffd84a' : '#e8f0ff', 0.6 * a);
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(p.cx, p.y - 74); ctx.rotate(sw); drawBell(ctx, s, great ? '#ffe9a0' : '#e8f0ff', 0.9 * a); ctx.restore();
    },
  });
}
function passiveToll(p, w) {
  const N = PERKS_A.sera_bellsaint.N, st = perkState(p), tn = nowOf(w);
  if (!icd(p, 'pkBell', N.icd, w)) return false;
  const great = (st.bell1 ?? -99) >= tn - N.window && (st.bell2 ?? -99) >= tn - N.window;
  if (great) { st.bell1 = st.bell2 = -99; } else { st.bell1 = st.bell2 ?? -99; st.bell2 = tn; }
  count(great ? 'sera_bellsaint.great' : 'sera_bellsaint.toll');
  toll(p, w, { R: great ? N.greatR : N.r, mv: (great ? N.greatMvPct : N.mvPct) / 100, healPct: great ? N.greatHealPct : N.healPct, great, proc: true });
  return true;
}

// ─────────────────────────── 등록부 ───────────────────────────
const ELS = ['fire', 'ice', 'thunder'];
const EL_COL = ['#ff7a2a', '#9fe8ff', '#fff2a0'];
const RET_QUARRY = { mult: 1 }, RET_CRACK = { mult: 1 };   // onAttack 반환 (다시 쓰는 객체: perkAttack 이 곧바로 읽는다)
const BASIC_SKIP = ['skill', 'sub', 'ult', 'awaken', 'assist', 'companion', 'mount'];
const isBasic = (atk) => { const t = atk?.tags; if (!t) return false; for (let i = 0; i < BASIC_SKIP.length; i++) if (t.includes(BASIC_SKIP[i])) return false; return true; };

export const PERKS_A = {
  // ═════════════ 카엘 ═════════════
  // C1 헌터 (0차, 카엘 공통): 숨은 부서지는 벽 알림 — 0.5초마다 320 안의 부서지는 벽을 찾아 채찍 끝 반짝임 · 1초마다 가장 가까운 벽에 고리
  'char:kael': {
    N: { scan: 0.5, r: 320, ringEvery: 1 },
    onEnter(p, w) {
      const st = perkState(p);
      st.brk = (w.map?.markers ?? []).filter((m) => m.breakable);
      st.brkT = 0; st.brkR = 0;
    },
    tick(p, w, dt) {
      const st = perkState(p), B = st.brk;
      if (!B || !B.length || p.dead) return;
      if ((st.brkT -= dt) > 0) return;
      st.brkT = this.N.scan;
      const m = w.map, R2 = this.N.r * this.N.r;
      let best = null, bd = Infinity;
      for (let i = B.length - 1; i >= 0; i--) {
        const mk = B[i];
        if (!m || m.typeAt(mk.tx, mk.ty) === 0) { B.splice(i, 1); continue; }   // 부서졌다
        const ts = mk.tx > 0 ? mk.x / mk.tx : mk.ty > 0 ? mk.y / mk.ty : 48;
        const dx = mk.x + ts / 2 - p.cx, dy = mk.y + ts / 2 - p.cy, d = dx * dx + dy * dy;
        if (d < R2 && d < bd) { bd = d; best = mk; }
      }
      if (!best) return;
      const tip = K.tipOf ? K.tipOf(p, p.move?.box ? p.move : NOBOX) : { x: p.cx + p.facing * 60, y: p.bottom - 60 };
      w.fx.emit('holy', tip.x, tip.y, { speed: 40, color: '#fff2b0' });
      if (!lowQ(w)) w.fx.emit('gold', tip.x, tip.y - 4, { speed: 30 });
      if ((st.brkR -= this.N.scan) <= 0) {
        st.brkR = this.N.ringEvery;
        const ts = best.tx > 0 ? best.x / best.tx : 48;
        w.fx.ring(best.x + ts / 2, best.y + ts / 2, { color: '#ffe7a0', r0: 6, r1: ts * 0.7, life: 0.55, width: 2 });
        count('char:kael.hint');
      }
    },
  },
  // C3 성전 기사: 적에게 맞으면 20% 확률로 성광 반격 (반경 130, 위력 160%, 0.5초에 한 번) — skills.js hookBus 에서 옮겨 왔다
  kael_templar: {
    N: { chancePct: 20, icd: 0.5, r: 130, mvPct: 160 },
    prewarm(w) { warm(w, ['#ffd870', '#fff8e0'], null); },
    afterHurt(p, dmg, atk, w) {
      if (!atk || atk.team !== 'enemy' || atk.flat || p.dead || !(p.hp > 0)) return;
      if (Math.random() * 100 >= this.N.chancePct || !icd(p, 'pkTpCounter', this.N.icd, w)) return;
      count('kael_templar.counter');
      nova(w, p, p.cx, p.cy, this.N.r, { mv: this.N.mvPct / 100, element: 'holy', c1: '#ffd870', c2: '#fff8e0', shake: 6, tags: ['skill'], mult: p.dmgMul, dmgColor: '#ffd84a' });
      w.fx.text(p.cx, p.y - 30, '성광 반격!', { color: '#fff2b0', size: 18 });
    },
  },
  // S1 그림자 추적자 (1차 → 블러드 헌터·나이트 레이븐과 그 초월): 사냥감 표식
  kael_stalker: {
    N: { t: 6, dmgPct: 6, sprintT: 1, sprintPct: 25 },
    prewarm(w) { warm(w, ['#b060ff'], null); },
    onHit(p, tgt, info, atk, w) {
      if (!tgt || tgt.dead || tgt.dying > 0 || tgt.kind === 'prop') return;
      const st = perkState(p);
      if (st.qry && st.qry !== tgt) { st.qryOld = st.qry; st.qryAt = nowOf(w); unmark(st.qry, 'quarry'); }
      st.qry = tgt;
      mark(tgt, 'quarry', this.N.t, 1, 1);
    },
    onAttack(p, atk, tgt, w) {
      if (!markOf(tgt, 'quarry')) { const st = perkState(p); if (!(st.qryOld === tgt && st.qryAt === nowOf(w))) return undefined; }   // 같은 휘두르기 안에서 옮겨 간 표식도 (onKill 과 같은 규칙)
      RET_QUARRY.mult = 1 + this.N.dmgPct / 100;
      return RET_QUARRY;
    },
    onKill(p, e, atk, w) {
      const st = perkState(p);
      // 한 번 휘두른 채찍이 다른 적을 먼저 맞혀 표식이 같은 프레임에 옮겨 간 뒤 표식 대상이 쓰러져도 사냥감 처치로 친다
      if (!markOf(e, 'quarry') && !(st.qryOld === e && st.qryAt === nowOf(w))) return;
      unmark(e, 'quarry');
      if (st.qry === e) st.qry = null;
      st.sprint = nowOf(w) + this.N.sprintT;
      count('kael_stalker.sprint');
      K.afterimage?.(w, p, '#b060ff', 0.3);
      w.fx.burst('magic', p.cx, p.bottom - 20, 6, { speed: 180, color: '#b060ff' });
    },
    speedMul(p) { return (perkState(p).sprint ?? -1) > nowOf(p.world) ? 1 + this.N.sprintPct / 100 : 1; },
    tick(p, w) {
      const st = perkState(p);
      if (!((st.sprint ?? -1) > nowOf(w)) || !icd(p, 'pkSprintFx', 0.08, w)) return;
      w.fx.emit('magic', p.cx - p.facing * 14, p.bottom - 24, { speed: 40, color: '#b060ff' });
    },
  },
  // ── 초월 ──
  kael_grandtemplar: {
    N: { capPct: 30, minPct: 5, r: 150, mvMinPct: 80, mvMaxPct: 250, icd: 1.5, moteAt: 0.5, moteT: 0.3 },   // 위력 80~250% (명세 100~300% → §2.8 예산: 3%/초 피격 대본에서 +13% → +11%)
    prewarm(w) { warm(w, ['#ffd84a', '#fff8e0'], ['성광 응보!', '#ffe080']); },
    onEnter(p) { perkState(p).bw = 0; },
    afterHurt(p, dmg, atk) {
      if (!atk || atk.team !== 'enemy' || atk.flat || !(dmg > 0)) return;
      const st = perkState(p), cap = maxHp(p) * this.N.capPct / 100, was = st.bw ?? 0;
      st.bw = Math.min(cap, was + dmg);
      const min = maxHp(p) * this.N.minPct / 100;
      if (was < min && st.bw >= min) p.world?.fx?.ring(p.cx, p.cy, { color: '#ffd84a', r0: 16, r1: 60, life: 0.4, width: 4 });
    },
    onSwing(p, w, mv) {
      if (!mv?.finisher || mv.skill) return;
      const st = perkState(p), H = maxHp(p);
      if (!((st.bw ?? 0) >= H * this.N.minPct / 100) || !icd(p, 'pkGtBoom', this.N.icd, w)) return;
      const k = clamp01(st.bw / (H * this.N.capPct / 100)), tip = K.tipOf(p, mv);
      count('kael_grandtemplar.boom');
      nova(w, p, tip.x, tip.y, this.N.r, {
        mv: (this.N.mvMinPct + (this.N.mvMaxPct - this.N.mvMinPct) * k) / 100, element: 'holy', c1: '#ffd84a', c2: '#fff8e0',
        shake: 3 + 3 * k, hitstop: 0.04, tags: ['melee'], mult: p.dmgMul, dmgColor: '#ffd84a',
      });
      callout(w, tip.x, tip.y - 40, '성광 응보!', '#ffe080');
      st.bw = 0;
    },
    tick(p, w) {
      const st = perkState(p);
      if (!(st.bw > 0) || st.bw < maxHp(p) * this.N.capPct / 100 * this.N.moteAt || !icd(p, 'pkGtMote', this.N.moteT, w)) return;
      const k = st.bw / (maxHp(p) * this.N.capPct / 100);
      w.fx.burst('holy', p.cx, p.cy, k >= 0.99 ? 3 : k >= 0.75 ? 2 : 1, { speed: 70, color: '#ffd84a', jitter: 14 });
    },
    drawMeter(ctx, p) {
      const st = perkState(p), bw = st.bw ?? 0;
      if (!(bw > 0)) return;
      const H = maxHp(p), k = bw / (H * this.N.capPct / 100), ready = bw >= H * this.N.minPct / 100;
      const x = p.cx, y = p.y - METER_DY;
      for (let i = 0; i < 3; i++) {
        const on = k >= (i + 1) / 3 - 0.001 || (i === 0 && ready);
        pip(ctx, x + (i - 1) * 11, y, 4.5, on ? '#ffd84a' : '#5a4a2a', on ? 0.95 : 0.55);
      }
    },
  },
  kael_highinquisitor: {
    N: { stacks: 3, markT: 4, pyreT: 1.5, tickT: 0.25, ticks: 6, mvPct: 30, icd: 5, icdBoss: 8, maxPyres: 6, pad: 10 },
    prewarm(w) { warm(w, ['#ff5a1a', '#ffb040'], ['화형!', '#ff8a3a']); },
    // 방을 옮기면 화형 연출이 end() 없이 지워진다 → 살아 있는 화형 수를 방마다 0 부터 (안 그러면 6 에 막혀 스테이지 끝까지 화형이 안 나온다)
    onEnter(p, w) { w._pkPyres = 0; },
    onHit(p, tgt, info, atk, w) {
      if (!atk?.tags?.includes('inq') || !tgt || tgt.dead) return;
      const n = mark(tgt, 'brand', this.N.markT, 1, this.N.stacks);
      if (n < this.N.stacks || (w._pkPyres ?? 0) >= this.N.maxPyres) return;
      if (!icd(tgt, 'pkPyre', isBoss(tgt) ? this.N.icdBoss : this.N.icd, w)) return;
      unmark(tgt, 'brand');
      pyre(w, p, tgt, this.N);
    },
  },
  kael_bloodreaver: {
    N: { minHpPct: 15, costPct: 4, mvPct: 120, pierce: 3, icd: 0.8, healPct: 1.5, healMax: 3, speed: 950, life: 0.45 },   // 위력 120% (명세 140% → §2.8 예산: +12.4% → 약 +10.6%)
    prewarm(w) { warm(w, ['#ff2040'], null); },
    onSwing(p, w, mv) {
      if (!mv?.finisher || mv.skill || p.dead) return;
      const H = maxHp(p);
      if (!(p.hp > H * this.N.minHpPct / 100) || !icd(p, 'pkBrCres', this.N.icd, w)) return;
      const cost = Math.min(Math.ceil(p.hp * this.N.costPct / 100), Math.max(0, Math.ceil(p.hp) - 1));
      if (cost > 0) { p.hp -= cost; w.fx.text(p.cx, p.y - 10, '-' + cost, { color: '#ff6a7a', size: 16 }); }
      count('kael_bloodreaver.crescent');
      const f = p.facing;
      K.shoot(w, p, {
        x: p.cx + f * 40, y: p.bottom - 60, vx: f * this.N.speed, vy: 0, w: 44, h: 76, render: 'wave', color: '#ff2040', life: this.N.life, pierce: this.N.pierce,
        light: { r: 90, color: '#ff2040', i: 0.8 },
        attack: K.atk(p, { mv: this.N.mvPct / 100, kb: [220, -120], hitstop: 0, shake: 1, tags: ['melee'], proc: true, dmgColor: '#ff6a7a' }),
        onHit: crescentHit,
      });
      w.fx.burst('blood', p.cx + f * 30, p.bottom - 60, 5, { speed: 160, color: '#ff2040' });
      sfx(w, 'slash_heavy', { vol: 0.5, pitch: 1.2 });
    },
  },
  kael_blackwing: {
    N: { per: 4, refund: 1, maxRefund: 2, vyCap: 40, need: 6, icd: 2.5, n: 8, mvPct: 40, h: 280, spread: 170 },
    prewarm(w) { warm(w, ['#9a8aff', '#b060ff'], null); },
    onEnter(p) { const st = perkState(p); st.air = 0; st.airRef = 0; },
    onHit(p, tgt, info, atk, w) {
      if (p.onGround || p.dead) return;
      const st = perkState(p);
      st.air = (st.air ?? 0) + 1;
      if (p.vy > this.N.vyCap) p.vy = this.N.vyCap;
      if (st.air % this.N.per === 0 && (st.airRef ?? 0) < this.N.maxRefund) {
        st.airRef = (st.airRef ?? 0) + 1;
        p.airJumpsLeft = Math.min(p.maxAirJumps?.() ?? 2, (p.airJumpsLeft ?? 0) + this.N.refund);
        w.fx.ring(p.cx, p.cy, { color: '#9a8aff', r0: 12, r1: 56, life: 0.32, width: 4 });
        w.fx.burst('feather', p.cx, p.cy, 3, { speed: 120, color: '#2a2230' });
        count('kael_blackwing.refund');
      }
    },
    onLand(p, w) {
      const st = perkState(p);
      if ((st.air ?? 0) >= this.N.need && icd(p, 'pkBwRain', this.N.icd, w)) featherRain(w, p, this.N);
      st.air = 0; st.airRef = 0;
    },
    drawMeter(ctx, p) {
      const st = perkState(p), n = Math.min(this.N.need, st.air ?? 0);
      if (p.onGround || !n) return;
      const x0 = p.cx - (this.N.need - 1) * 4.5, y = p.y - METER_DY;
      for (let i = 0; i < this.N.need; i++) pip(ctx, x0 + i * 9, y, 3.6, i < n ? (n >= this.N.need ? '#e0e0ff' : '#9a8aff') : '#2a2440', i < n ? 0.95 : 0.5);
    },
  },
  // ── 비전 ──
  kael_sealbearer: {
    N: { add: 1, max: 5, t: 5, sealT: 2, sealIcd: 6, crackT: 4, crackIcd: 15, crackPct: 15 },
    prewarm(w) { warm(w, ['#ffd84a', '#ffe9a0'], ['봉인!', '#ffd84a']); },
    onHit(p, tgt, info, atk, w) {
      if (!atk?.tags?.includes('melee') || !tgt || tgt.dead || tgt.kind === 'prop') return;
      const sw = p.curHitId;
      if (sw != null) { if (tgt._pkSw === sw) return; tgt._pkSw = sw; }   // 한 번 휘두를 때 대상마다 1중첩 (성광 추가타·성화 폭발은 세지 않음)
      sealStack(w, p, tgt, this.N.add, this.N);
    },
    onAttack(p, atk, tgt) {
      if (!markOf(tgt, 'crack')) return undefined;
      RET_CRACK.mult = 1 + this.N.crackPct / 100;
      return RET_CRACK;
    },
  },

  // ═════════════ 세라 ═════════════
  // C4 대사제 (1차 → 성녀·신탁의 무녀와 그 초월): 회복량 +30% (모든 p.heal)
  sera_priestess: {
    N: { healPct: 30 },
    healMul() { return 1 + this.N.healPct / 100; },
  },
  // S2 원소술사 (1차 → 대마법사·폭풍의 소환사와 그 초월): 기본 공격 3번 적중마다 원소 파열
  sera_elementalist: {
    N: { every: 3, r: 55, mvPct: 35, slowPct: 30, slowT: 1, stunT: 0.2 },
    prewarm(w) { warm(w, ['#ff7a2a', '#9fe8ff'], null); },
    onHit(p, tgt, info, atk, w) {
      if (!isBasic(atk) || !tgt || tgt.kind === 'prop') return;
      const st = perkState(p);
      st.elN = (st.elN ?? 0) + 1;
      if (st.elN < this.N.every) return;
      st.elN = 0;
      const i = st.elI = ((st.elI ?? -1) + 1) % 3, el = ELS[i], col = EL_COL[i];
      const x = info?.hx ?? tgt.cx, y = info?.hy ?? tgt.cy, r = this.N.r;
      count('sera_elementalist.' + el);
      strike(w, p, circ(x, y, r), { mv: this.N.mvPct / 100, type: 'mag', element: el, stun: el === 'thunder' ? this.N.stunT : undefined, kb: [60, -40], dmgColor: col });
      if (el === 'ice') { const k = 1 - this.N.slowPct / 100, t = this.N.slowT; forFoes(w, x, y, r, (e) => { if (!isBoss(e)) slowEnemy(e, k, t, w); }); }
      w.fx.ring(x, y, { color: col, r0: 8, r1: r * 1.15, life: 0.28, width: 4 });
      w.fx.burst(el, x, y, 4, { speed: 180, color: col });   // ≤ 4: 시간 재사용 대기가 없는 발동 (§3.6.3)
      sfx(w, el, { vol: 0.35, pitch: 1.2 });
    },
  },
  // ── 초월 ──
  sera_archsaint: {
    N: { icd: 12, t: 4, r: 140, ry: 90, tickT: 0.5, healPct: 1.5, mvPct: 20, reviveHpPct: 50, boomR: 200, boomMvPct: 200, iframes: 2 },   // 성역 회복 1.5% (명세 2%, 조절 손잡이 zoneHeal → eHP ×1.68 → 약 ×1.43)
    prewarm(w) { warm(w, ['#ffe9a0', '#ffffff'], null); },
    onSkill(p, w) { if (icd(p, 'pkAsZone', this.N.icd, w)) sanctum(w, p, this.N); },
    onLethal(p, atk, w) {
      const run = w?.run;
      if (!run || run.saintUsed) return undefined;
      run.saintUsed = true;
      p.hp = Math.ceil(maxHp(p) * this.N.reviveHpPct / 100);
      p.iframes = Math.max(p.iframes ?? 0, this.N.iframes);
      count('sera_archsaint.revive');
      nova(w, p, p.cx, p.cy, this.N.boomR, { mv: this.N.boomMvPct / 100, type: 'mag', element: 'holy', c1: '#ffe9a0', c2: '#ffffff', tags: ['skill'], mult: p.dmgMul, hitstop: 0.08, shake: 10, sfx: 'choir_gate', dmgColor: '#ffe9a0' });
      w.game?.flash?.('#fff8d0', 0.8);
      w.game?.toast?.('대성녀의 기적 — 죽음을 거부했다!', '#fff2b0');
      return true;
    },
  },
  sera_prophetess: {
    N: { charge: 10, r: 220, slowT: 2, slowPct: 50, bossSlowPct: 25, cdCut: 1.5, iframes: 0.8 },
    prewarm(w) { warm(w, ['#a8e0ff'], ['예지!', '#a8e0ff']); },
    tick(p, w, dt) {
      const st = perkState(p);
      if ((st.fore ?? 0) >= this.N.charge) return;
      st.fore = (st.fore ?? 0) + dt;
      if (st.fore >= this.N.charge) { w.fx.ring(p.cx, p.cy, { color: '#a8e0ff', r0: 60, r1: 14, life: 0.45, width: 3 }); sfx(w, 'clock_tick', { vol: 0.5 }); }
    },
    onHurt(p, dmg, atk, w) {
      const st = perkState(p);
      if (!((st.fore ?? 0) >= this.N.charge) || !atk || atk.team !== 'enemy' || atk.flat) return undefined;
      st.fore = 0;
      count('sera_prophetess.foresight');
      p.iframes = Math.max(p.iframes ?? 0, this.N.iframes);
      const kN = 1 - this.N.slowPct / 100, kB = 1 - this.N.bossSlowPct / 100, t = this.N.slowT;
      forFoes(w, p.cx, p.cy, this.N.r, (e) => slowEnemy(e, isBoss(e) ? kB : kN, t, w));
      for (const k in p.skillCd) if (p.skillCd[k] > 0) p.skillCd[k] = Math.max(0, p.skillCd[k] - this.N.cdCut);
      w.fx.ring(p.cx, p.cy, { color: '#a8e0ff', r0: 20, r1: this.N.r, life: 0.42, width: 5 });
      K.afterimage?.(w, p, '#a8e0ff', 0.3);
      callout(w, p.cx, p.y - 30, '예지!', '#a8e0ff');
      sfx(w, 'clock_tick', { vol: 0.8, pitch: 0.8 });
      return false;
    },
    drawMeter(ctx, p, w) {
      const st = perkState(p), f = st.fore ?? 0;
      const x = p.cx, y = p.y - METER_DY;
      if (f >= this.N.charge) {
        const pu = 0.75 + 0.25 * Math.sin(nowOf(w) * 6);
        ctx.globalCompositeOperation = ADD;
        K.glow(ctx, x, y, 16 * pu, '#a8e0ff', 0.7);
        ctx.globalCompositeOperation = 'source-over';
        pip(ctx, x, y, 5.5, '#e8fbff', 0.95);
      } else if (f > 0) {
        ctx.globalAlpha = 0.5; ctx.strokeStyle = '#1a0610'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.85; ctx.strokeStyle = '#a8e0ff'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(x, y, 6, -Math.PI / 2, -Math.PI / 2 + TAU * (f / this.N.charge)); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },
  },
  sera_archsage: {
    N: { add: 1, max: 3, r: 110, mvPct: 260, orbMvPct: 40, mp: 15, speed: 700, life: 0.9 },
    prewarm(w) { warm(w, ['#ffe0b0', '#9fe8ff', '#fff2a0'], null); },
    onSkill(p, w) {
      const st = perkState(p), n = st.sig ?? 0;
      if (n >= this.N.max) return;
      st.sig = Math.min(this.N.max, n + this.N.add);
      const col = SIG_COL[n];
      w.fx.ring(p.cx, p.y - 16, { color: col, r0: 6, r1: 34, life: 0.3, width: 3 });
      if (st.sig === this.N.max) { w.fx.ring(p.cx, p.cy, { color: '#ffe0b0', r0: 20, r1: 70, life: 0.4, width: 4 }); sfx(w, 'magic', { vol: 0.5, pitch: 1.3 }); }
    },
    onSwing(p, w, mv) {
      if (!mv || mv.skill) return;
      const st = perkState(p);
      if ((st.sig ?? 0) < this.N.max) return;
      st.sig = 0;
      count('sera_archsage.orb');
      const f = p.facing;
      K.shoot(w, p, {
        x: p.cx + f * 34, y: p.bottom - 60, vx: f * this.N.speed, vy: 0, w: 34, h: 34, render: 'orb', color: '#ffe0b0', scale: 1.6, life: this.N.life, pierce: 1,
        light: { r: 110, color: '#ffe0b0', i: 0.9 }, trail: 'magic',
        attack: K.atk(p, { mv: this.N.orbMvPct / 100, type: 'mag', tags: ['skill'], proc: true, hitstop: 0, shake: 0, kb: [120, -80], dmgColor: '#ffe0b0' }),
        onExpire: fuseBurst, onWall: fuseWall,
      });
      sfx(w, 'magic', { vol: 0.7, pitch: 0.8 });
    },
    drawMeter(ctx, p, w) {
      const n = perkState(p).sig ?? 0;
      if (!n) return;
      const t = nowOf(w), x = p.cx, y = p.y - METER_DY, full = n >= this.N.max;
      for (let i = 0; i < n; i++) {
        const a = t * 1.6 + i * TAU / 3, px = x + Math.cos(a) * 16, py = y + Math.sin(a) * 5;
        ctx.globalCompositeOperation = ADD;
        K.glow(ctx, px, py, full ? 15 : 11, SIG_COL[i], full ? 0.9 : 0.65);
        ctx.globalCompositeOperation = 'source-over';
        pip(ctx, px, py, 5.5, SIG_COL[i], 1);
      }
    },
  },
  sera_tempest: {
    N: { add: 1, max: 5, t: 4, r: 300, n: 3, mvPct: 60, stunT: 0.2, consume: 1, icd: 0.35 },
    prewarm(w) { warm(w, ['#bfe0ff'], null); },
    onHit(p, tgt, info, atk, w) {
      if (!tgt || tgt.kind === 'prop') return;
      if (!tgt.dead) mark(tgt, 'static', this.N.t, this.N.add, this.N.max);
      if (atk?.element !== 'thunder' || !markOf(tgt, 'static') || !icd(p, 'pkTmpChain', this.N.icd, w)) return;
      chainFrom(w, p, tgt, this.N);
    },
  },
  // ── 비전 ──
  sera_bellsaint: {
    N: { every: 8, icd: 2.5, r: 200, mvPct: 50, stunT: 0.3, healPct: 2, window: 12, greatR: 300, greatMvPct: 120, greatHealPct: 4, eraseProj: true },
    prewarm(w) { warm(w, ['#e8f0ff', '#ffd84a'], ['만종!', '#ffd84a']); },
    onHit(p, tgt, info, atk, w) {
      if (!tgt || tgt.kind === 'prop' || atk?.pkBell) return;   // 일곱 번째 종(액티브)의 타격은 세지 않는다
      const st = perkState(p);
      st.bellN = Math.min(this.N.every, (st.bellN ?? 0) + 1);
      if (st.bellN >= this.N.every && passiveToll(p, w)) st.bellN = 0;
    },
    onSkill(p, w) { passiveToll(p, w); },
    drawMeter(ctx, p, w) {
      const st = perkState(p), n = st.bellN ?? 0, tn = nowOf(w);
      const x = p.cx, y = p.y - METER_DY;
      if (n > 0) {
        ctx.globalAlpha = 0.5; ctx.strokeStyle = '#1a0610'; ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#e8f0ff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, 7, -Math.PI / 2, -Math.PI / 2 + TAU * (n / this.N.every)); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const g = ((st.bell1 ?? -99) >= tn - this.N.window ? 1 : 0) + ((st.bell2 ?? -99) >= tn - this.N.window ? 1 : 0);
      for (let i = 0; i < g; i++) pip(ctx, x - 13 + i * 26, y, 3.2, '#ffd84a', 0.9);
    },
  },
};

// ─────────────────────────── 비전 액티브 ───────────────────────────
export const ACTIVES_A = {
  /** 제1봉인 — 발크레인 결계: 발밑 봉인진 (0.3초마다 신성 피해 + 감속), 펼칠 때 진 안의 적에게 봉인 5중첩 */
  asc_kael_firstseal(p, w, lv) {
    const id = 'asc_kael_firstseal', mv = skillVal(id, 'dmg', lv) / 100, r = skillVal(id, 'r', lv), t = skillVal(id, 't', lv);
    const N = PERKS_A.kael_sealbearer.N, A = ACT_N.firstseal;
    K.pose(p, w, 'cast_up', 0.45, { sfx: 'holy' });
    const x0 = p.cx, y0 = floorY(w, p);
    count('asc_kael_firstseal.cast');
    SEAL_FX = 3;
    try { forFoes(w, x0, y0 - r * 0.45, r, (e) => sealStack(w, p, e, N.max, N)); } finally { SEAL_FX = Infinity; }
    sfx(w, 'seal_stamp', { vol: 0.9 });
    w.fx.ring(x0, y0 - 6, { color: '#ffd84a', r0: 20, r1: r, life: 0.45, width: 8 });
    w.camera?.shake?.(5, 0.2);
    const rect = { x: x0 - r, y: y0 - r, w: r * 2, h: r + 24 };
    K.fx(w, {
      life: t + 0.05, z: 3, x: x0 - r - 20, y: y0 - r - 20, w: r * 2 + 40, h: r + 50, d: { n: 0, pk: 9 },
      tick(e, ww, dt) {
        e.d.pk += dt;
        while (e.d.n < A.ticks && e.lt >= (e.d.n + 1) * A.tickT) {
          e.d.n++; e.d.pk = 0;
          K.uHit(ww, p, mv, { rect, type: 'phys', element: 'holy', tags: ['skill'], kb: [20, -30], hitstop: 0, shake: 0, dmgColor: '#ffd84a' });
          forFoes(ww, x0, y0 - r * 0.45, r, (f) => slowEnemy(f, isBoss(f) ? A.bossSlow : A.slow, A.slowT, ww));
          if (e.d.n % 2 === 0) ww.fx.burst('gold', x0 + ((e.d.n * 67) % (r * 2)) - r, y0 - 8, 2, { angle: -Math.PI / 2, spread: 0.4, speed: 160 });
        }
      },
      draw(ctx, e) {
        const open = Math.min(1, e.lt / 0.2), a = clamp01((e.life - e.lt) / 0.3) * open, R = r * open;
        K.runeCircle(ctx, x0, y0 - 2, R, '#ffd84a', e.lt * 0.9, a, 0.24, 6);
        ctx.globalCompositeOperation = ADD;
        K.glow(ctx, x0, y0 - 20, R * 0.95, '#ffd84a', 0.2 * a);
        for (let i = 0; i < 6; i++) {
          const ang = e.lt * 0.5 + i * TAU / 6, c = Math.cos(ang), s = Math.sin(ang);
          K.cutLine(ctx, x0 + c * R * 0.95, y0 - 4 + s * R * 0.22, x0 + c * R * 0.25, y0 - R * 0.55 - 10 * Math.sin(e.lt * 3 + i), 3, '#ffd84a', 0.55 * a);
        }
        if (e.d.pk < 0.2) K.glow(ctx, x0, y0 - 30, R * 0.6, '#fff8e0', 0.4 * (1 - e.d.pk / 0.2) * a);
      },
      light(L) { L.add(x0, y0 - 40, r * 2, '#ffd84a', 0.9); },
    });
    return true;
  },
  /** 일곱 번째 종: 머리 위 환영의 종 4초 — 0.8초마다 종소리 (보통 스킬 타격, 패시브 계수 없음) */
  asc_sera_seventhbell(p, w, lv) {
    const id = 'asc_sera_seventhbell', mv = skillVal(id, 'dmg', lv) / 100, n = Math.max(1, Math.round(skillVal(id, 'n', lv))), R = skillVal(id, 'r', lv);
    const A = ACT_N.seventhbell;
    K.pose(p, w, 'cast_up', 0.45, { sfx: 'magic' });
    count('asc_sera_seventhbell.cast');
    sfx(w, 'bell', { vol: 0.8, pitch: 0.9 });
    K.fx(w, {
      life: A.t, z: 11, d: { n: 0, ring: 9 },
      follow(e) { e.x = p.cx - R; e.y = p.y - 220; e.w = R * 2; e.h = R + 220; },
      tick(e, ww, dt) {
        e.d.ring += dt;
        while (e.d.n < n && e.lt >= A.first + e.d.n * A.every) {
          e.d.n++; e.d.ring = 0;
          count('asc_sera_seventhbell.toll');
          toll(p, ww, { x: p.cx, y: p.cy, R, mv, healPct: A.healPct, great: false, proc: false, bellFx: false });
        }
      },
      draw(ctx, e) {
        const a = Math.min(1, e.lt / 0.2) * clamp01((e.life - e.lt) / 0.3), bx = p.cx, by = p.y - A.h;
        const sw = Math.sin(e.lt * (TAU / A.every)) * A.swing;
        ctx.globalCompositeOperation = ADD;
        K.glow(ctx, bx, by + 30, 70, '#e8f0ff', 0.45 * a);
        if (e.d.ring < 0.35) K.glow(ctx, bx, by + 30, 70 + e.d.ring * 260, '#e8f0ff', 0.5 * (1 - e.d.ring / 0.35) * a);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.6 * a; ctx.strokeStyle = '#c8d0e0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx, by - 40); ctx.lineTo(bx, by); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(sw); drawBell(ctx, 34, '#e8f0ff', 0.92 * a); ctx.restore();
      },
      light(L) { L.add(p.cx, p.y - A.h + 30, 220, '#e8f0ff', 0.9); },
    });
    return true;
  },
};
/** 비전 액티브의 레벨과 무관한 수치 (레벨 수치는 data/skills_asc.js v) */
const ACT_N = {
  firstseal: { ticks: 10, tickT: 0.3, slow: 0.5, bossSlow: 0.75, slowT: 0.35 },
  seventhbell: { t: 4, every: 0.8, first: 0.3, healPct: 2, h: 150, swing: 0.25 },
};

// ─────────────────────────── 표식 그리기 (PerkLayer) ───────────────────────────
// (ctx, e, n, k, t): n = 중첩, k = 남은 시간 비율 0..1, t = 월드 시간. 머리 위 = (e.cx, e.y)
const DASH_CHAIN = [6, 4], DASH_NONE = [];   // setLineDash 인자 (그리기마다 배열을 만들지 않게)
export const MARKS_A = {
  /** 사냥감 (그림자 추적자): 보라 갈매기표 */
  quarry(ctx, e, n, k, t) {
    const x = e.cx, y = e.y - 14 + Math.sin(t * 5) * 2, a = 0.55 + 0.45 * Math.min(1, k * 4);
    ctx.globalCompositeOperation = ADD;
    K.glow(ctx, x, y, 16, '#b060ff', 0.5 * a);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a; ctx.strokeStyle = '#d8a0ff'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - 7, y - 6); ctx.lineTo(x, y); ctx.lineTo(x + 7, y - 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 7, y - 1); ctx.lineTo(x, y + 5); ctx.lineTo(x + 7, y - 1); ctx.stroke();
  },
  /** 낙인 (화형 심판장): 붉은 불씨 1–3 */
  brand(ctx, e, n, k, t) {
    const y = e.y - 12;
    ctx.globalCompositeOperation = ADD;
    for (let i = 0; i < n; i++) {
      const x = e.cx + (i - (n - 1) / 2) * 13, f = 1 + 0.15 * Math.sin(t * 13 + i * 2);
      K.glow(ctx, x, y, 11 * f, '#ff5a1a', 0.9);
      K.glow(ctx, x, y + 1, 5 * f, '#fff2b0', 0.8);
    }
  },
  /** 정전기 (뇌우의 무녀): 푸른 불꽃 중첩 수만큼 */
  static(ctx, e, n, k, t) {
    const x = e.cx, y = e.y - 14, fl = 0.8 + 0.2 * Math.sin(t * 23);
    ctx.globalCompositeOperation = ADD;
    K.glow(ctx, x, y, 12 + n * 3, '#bfe0ff', (0.45 + 0.1 * n) * fl);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineJoin = 'miter';
    ctx.beginPath(); ctx.moveTo(x + 3, y - 9); ctx.lineTo(x - 3, y - 1); ctx.lineTo(x + 3, y + 1); ctx.lineTo(x - 3, y + 9); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < n; i++) pip(ctx, x - (n - 1) * 4 + i * 8, y + 15, 2.6, '#bfe0ff', 0.95);
  },
  /** 봉인 중첩 (발크레인 봉인자): 금빛 눈금 n/5 */
  seal(ctx, e, n, k, t) {
    const x = e.cx, y = e.y - 12;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.42;
      ctx.globalAlpha = i < n ? 0.95 : 0.3; ctx.strokeStyle = i < n ? '#ffd84a' : '#5a4a2a';
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 9, y + 14 + Math.sin(a) * 9); ctx.lineTo(x + Math.cos(a) * 16, y + 14 + Math.sin(a) * 16); ctx.stroke();
    }
    if (n >= 4) { ctx.globalCompositeOperation = ADD; ctx.globalAlpha = 1; K.glow(ctx, x, y, 14, '#ffd84a', 0.25 + 0.2 * Math.sin(t * 10)); }
  },
  /** 봉인됨 (일반 적 2초): 금빛 사슬 두 줄이 몸을 가로지른다 */
  sealed(ctx, e, n, k) {
    const x = e.cx, cy = e.y + e.h * 0.5, hw = Math.max(18, e.w * 0.6), hh = Math.max(18, e.h * 0.45), a = Math.min(1, k * 3);
    ctx.globalCompositeOperation = ADD;
    K.glow(ctx, x, cy, Math.max(hw, hh) * 1.3, '#ffd84a', 0.35 * a);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3; ctx.setLineDash?.(DASH_CHAIN);
    ctx.beginPath(); ctx.moveTo(x - hw, cy - hh); ctx.lineTo(x + hw, cy + hh); ctx.moveTo(x + hw, cy - hh); ctx.lineTo(x - hw, cy + hh); ctx.stroke();
    ctx.setLineDash?.(DASH_NONE);
  },
  /** 봉인 균열 (보스 4초): 몸을 가르는 들쭉날쭉한 금빛 선 */
  crack(ctx, e, n, k, t) {
    const x = e.cx, top = e.y + e.h * 0.15, h = e.h * 0.7, a = Math.min(1, k * 3) * (0.8 + 0.2 * Math.sin(t * 14));
    ctx.globalCompositeOperation = ADD;
    K.glow(ctx, x, top + h / 2, Math.max(30, e.w * 0.45), '#ffd84a', 0.3 * a);
    ctx.globalAlpha = a; ctx.strokeStyle = '#fff2b0'; ctx.lineWidth = 3; ctx.lineJoin = 'miter';
    ctx.beginPath(); ctx.moveTo(x - 4, top);
    for (let i = 1; i <= 6; i++) ctx.lineTo(x + (i % 2 ? 9 : -9), top + h * i / 6);
    ctx.stroke();
  },
};
