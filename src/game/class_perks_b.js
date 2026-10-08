// 직업 특성 내용 B — 빅터·브란 (PERKS-B) (docs/specs/classes_t3.md §3 · §4.3 · §4.4 · §5 · §6)
//  PERKS_B   { '<CLASSES id | ASCENSIONS id | char:<영웅>>': { only?, N?, <훅>… } }   (§3.2, 훅 이름은 class_perks.js HOOK_NAMES)
//  ACTIVES_B { 'asc_<영웅>_<낱말>': (p, w, lv) => true|false }                          (비전 액티브, skills.js castSkill 대체 경로)
//  MARKS_B   { '<표식 키>': (ctx, e, n, k, t) => {…} }                                 (PerkLayer 가 그린다; k = 남은 시간 비율)
// 규칙 (§3.5 · §3.6): ./class_perks.js 와 데이터 모듈만 import 한다 (skills.js · player.js · world.js 금지).
// 모듈 최상단에서 가져온 바인딩(K·도우미)을 읽지 않는다 — 훅 본문 안에서만. 최상단에서 bus·game·document 를 건드리지 않는다.
//
// 항목 (조절 수치는 모두 각 항목의 N 표; classes.js · ascensions.js · skills_asc.js 문구의 숫자와 같다)
//  char:bran (C7) 공격 중 작은 피격 경직 없음 · victor_deadeye (S3) 첫 탄 치명타 · bran_paladin (S4) 가호 · bran_guardian (S5) 결계
//  bran_bloodrage (S6) 혈귀화 · 초월 8 (망령 도탄 · 즉결 처형 · 과열 · 난사 · 방진 · 방패 돌격 · 꺾이지 않는 기세 · 피의 분노)
//  비전 2: victor_silverwolf (달 게이지 · 만월) + asc_victor_silverbullet · bran_oathlord (서약 기사 영혼) + asc_bran_oathbanner
// 보이는 신호: 짧은 빛 고리·캐시 빛(K.glow)·데미지 숫자 색(dmgColor)·짧은 문구·작은 효과음. 그라디언트·새 캔버스·그리기 중 난수 없음.
// 발동 횟수는 perkState(p).cnt[키] 에 센다 (QA 탐침이 읽는다).
import { K, procAtk, procStrike, mark, markOf, unmark, icd, shieldAdd, shieldAbsorb, shieldOf, perkState } from './class_perks.js';
import { SKILLS, skillVal } from '../data/skills.js';

const TAU = Math.PI * 2;
const ADD = 'lighter';

// ─────────────────────────── 작은 도우미 (훅 안에서만 부른다) ───────────────────────────
const S = (p) => perkState(p);
const maxHp = (p) => p?.stats?.hp ?? 1;
const isBoss = (e) => e?.kind === 'boss';
/** 적 체력 비율 0..1 */
function hpOf(e) {
  const m = e?.stats?.maxHp ?? e?.maxHp ?? e?.stats?.hp ?? e?.hp ?? 1;
  return m > 0 ? (e.hp ?? 0) / m : 1;
}
/** 발동 횟수 (QA) */
function bump(p, k) { const c = (S(p).cnt ??= {}); c[k] = (c[k] | 0) + 1; }
function sfx(w, name, o) { try { w?.game?.audio?.sfx?.(name, o); } catch { /* 소리 없음 */ } }
function callout(w, x, y, text, color) { w?.fx?.callout?.(x, y, text, { color }); }
function shake(w, m, t) { w?.camera?.shake?.(m, t); }
/** 원 판정 사각형 */
const circ = (x, y, r) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
/** proc 타격 + 데미지 숫자 색. procAtk 이 dmgColor 를 넘기지 않으므로 K.uHit(= playerStrike(atk(...))) 로 같은 proc 공격을 친다 */
function strike(w, p, rect, o, col) {
  if (!col || typeof K.uHit !== 'function') return procStrike(w, p, rect, o);
  const a = procAtk(p, o);
  a.dmgColor = col;
  return K.uHit(w, p, a.mv, { ...a, rect }) | 0;
}
/** 원형 proc 폭발: 판정 + 빛 고리 + 캐시 빛 두 겹 (파티클 ≤ n × 품질, n ≤ 10) */
function blast(w, p, x, y, r, o, c1, c2, n = 8) {
  const hits = strike(w, p, circ(x, y, r), o, c2);
  w.fx.ring(x, y, { color: c1, r0: r * 0.2, r1: r, life: 0.32, width: 6 });
  w.fx.burst(o.element === 'fire' ? 'fire' : o.element === 'holy' ? 'holy' : 'spark', x, y, Math.min(10, n), { speed: r * 2.2, color: c1 });
  K.fx(w, {
    x: x - r, y: y - r, w: r * 2, h: r * 2, life: 0.3, z: 12,
    draw(ctx, e) {
      const a = 1 - e.k;
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, x, y, r * (0.6 + e.k * 0.6), c1, 0.7 * a);
      K.glow(ctx, x, y, r * 0.35, c2, a);
    },
    light(L, e) { L.add(x, y, r * 2.2, c1, 1.1 * (1 - e.k)); },
  });
  return hits;
}
/** 가장 가까운 적 (배열을 만들지 않고 w.entities 를 한 번 돈다) */
function nearestFoe(w, x, y, r, skip) {
  let best = null, bd = r * r;
  const L = w?.entities;
  if (!L) return null;
  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (e === skip || (e.kind !== 'enemy' && e.kind !== 'boss') || e.dead || e.invuln || e.hidden || e.pendingBoss || e.dying > 0) continue;
    const dx = e.cx - x, dy = e.cy - y, d = dx * dx + dy * dy;
    if (d < bd && !w.inUnrevealedFake?.(e)) { bd = d; best = e; }
  }
  return best;
}
/** 방금 쏜(한 프레임도 안 지난) 내 탄환 수 — 새 개체는 끝에 붙으므로 끝 24개만 본다 */
function freshCount(w, p) {
  const L = w.entities;
  let n = 0;
  for (let i = L.length - 1, k = 0; i >= 0 && k < 24; i--, k++) { const e = L[i]; if (e.kind === 'projectile' && e.owner === p && e.t === 0 && !e.dead) n++; }
  return n;
}
function firstFresh(w, p) {
  const L = w.entities;
  let f = null;
  for (let i = L.length - 1, k = 0; i >= 0 && k < 24; i--, k++) { const e = L[i]; if (e.kind === 'projectile' && e.owner === p && e.t === 0 && !e.dead) f = e; }
  return f;
}
/** proc 탄환 (K.bullet 의 공격을 proc 로 · 숫자 색 · 그라디언트 없는 그림) */
function procBullet(w, p, x, y, ang, o, col) {
  const b = K.bullet(w, p, x, y, ang, { ...o, proc: true, color: col });
  if (!b) return null;
  b.attack.proc = true; b.attack.tags = ['projectile']; b.attack.dmgColor = col;
  b.render = shotRender;
  return b;
}

// ─────────────────────────── 투사체 그림 (그라디언트 없음) ───────────────────────────
function shotRender(ctx, pr) {
  ctx.rotate(Math.atan2(pr.vy, pr.vx));
  ctx.globalCompositeOperation = ADD;
  const a0 = ctx.globalAlpha;
  ctx.fillStyle = pr.color;
  ctx.globalAlpha = a0 * 0.3; ctx.fillRect(-42, -2, 44, 4);
  ctx.globalAlpha = a0 * 0.85; ctx.fillRect(-16, -1.5, 18, 3);
  ctx.globalAlpha = a0; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(3, 0, 2.6, 0, TAU); ctx.fill();
}
/** 성광 충격파 (초승달 + 캐시 빛) */
function waveRender(ctx, pr) {
  const d = Math.sign(pr.vx) || 1, h = pr.h * 0.6, W = pr.w, a0 = ctx.globalAlpha;
  ctx.scale(d, 1);
  ctx.globalCompositeOperation = ADD;
  K.glow(ctx, -W * 0.15, 0, h * 1.5, pr.color, 0.35);
  ctx.fillStyle = pr.color; ctx.globalAlpha = a0 * 0.55;
  ctx.beginPath(); ctx.moveTo(W * 0.5, 0); ctx.quadraticCurveTo(-W * 0.2, -h * 1.6, -W, -h); ctx.quadraticCurveTo(-W * 0.1, 0, -W, h); ctx.quadraticCurveTo(-W * 0.2, h * 1.6, W * 0.5, 0); ctx.fill();
  ctx.globalAlpha = a0 * 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-W * 0.75, -h * 0.95); ctx.quadraticCurveTo(-W * 0.15, -h * 1.35, W * 0.45, 0); ctx.quadraticCurveTo(-W * 0.15, h * 1.35, -W * 0.75, h * 0.95); ctx.stroke();
}
/** 새벽 서약 기사의 영혼: 반투명 금빛 기사가 방패·검을 앞세워 돌격 */
function knightRender(ctx, pr) {
  const d = Math.sign(pr.vx) || 1, a0 = ctx.globalAlpha, fade = Math.min(1, pr.life / 0.2) * Math.min(1, pr.t / 0.08);
  ctx.scale(d, 1);
  ctx.globalCompositeOperation = ADD;
  K.glow(ctx, 0, -6, 62, pr.color, 0.45 * fade);
  ctx.globalAlpha = a0 * 0.35 * fade; ctx.strokeStyle = pr.color; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) { const y = -24 + i * 18; ctx.moveTo(-24, y); ctx.lineTo(-70 + i * 6, y); }
  ctx.stroke();
  ctx.globalAlpha = a0 * 0.55 * fade; ctx.fillStyle = pr.color;
  ctx.beginPath(); ctx.arc(6, -34, 9, 0, TAU); ctx.fill();                                    // 투구
  ctx.beginPath(); ctx.moveTo(-10, -24); ctx.lineTo(14, -24); ctx.lineTo(12, 8); ctx.lineTo(-12, 8); ctx.closePath(); ctx.fill();   // 몸통
  ctx.beginPath(); ctx.moveTo(16, -22); ctx.lineTo(31, -22); ctx.lineTo(31, 0); ctx.lineTo(23.5, 11); ctx.lineTo(16, 0); ctx.closePath(); ctx.fill();   // 방패
  ctx.globalAlpha = a0 * 0.9 * fade; ctx.strokeStyle = '#fff2c0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(14, -10); ctx.lineTo(56, -15);                                  // 검
  ctx.moveTo(-6, 8); ctx.lineTo(-16, 38); ctx.moveTo(6, 8); ctx.lineTo(16, 36);               // 다리
  ctx.moveTo(2, -43); ctx.quadraticCurveTo(-12, -52, -24, -40);                               // 깃털 장식
  ctx.stroke();
}

// ─────────────────────────── 공용 연출 ───────────────────────────
/** 처형: 붉은 X 베기 */
function execFx(w, x, y) {
  K.fx(w, {
    x: x - 70, y: y - 70, w: 140, h: 140, life: 0.32, z: 13,
    draw(ctx, e) {
      const a = 1 - e.k, r = 30 + e.k * 26;
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, x, y, 60, '#ff2030', 0.6 * a);
      K.cutLine(ctx, x - r, y - r, x + r, y + r, 5, '#ff2030', a);
      K.cutLine(ctx, x + r, y - r, x - r, y + r, 5, '#ff2030', a);
    },
  });
  w.fx.burst('blood', x, y, 8, { speed: 280, color: '#ff2030' });
}
/** 은랑: 늑대 발톱 세 줄 (각각 다른 hitId 의 proc 타격, 0.05초 간격) */
function claws(w, p, N) {
  const f = p.facing;
  bump(p, 'claw');
  K.fx(w, {
    life: 0.3, z: 12, d: { n: 0 },
    follow(e) { e.x = p.cx - 240; e.y = p.y - 60; e.w = 480; e.h = p.h + 100; },
    tick(e, ww) {
      while (e.d.n < N.clawN && e.lt >= e.d.n * N.clawGap) {
        strike(ww, p, p.relRect(20, -100, 200, 80), { mv: N.claw, kb: [260, -120], tags: ['melee'] }, '#e8f0ff');
        e.d.n++;
      }
    },
    draw(ctx, e) {
      ctx.globalCompositeOperation = ADD;
      for (let i = 0; i < N.clawN; i++) {
        const t = e.lt - i * N.clawGap;
        if (t < 0) continue;
        const a = Math.max(0, 1 - t / 0.2), y = p.bottom - 92 + i * 24, x0 = p.cx + f * 34, x1 = p.cx + f * 210;
        K.cutLine(ctx, x0, y - 20, x1, y + 16, 4, '#e8f0ff', a);
      }
    },
  });
  sfx(w, 'slash_heavy', { vol: 0.5, pitch: 1.4 });
}
/** 은랑 달 게이지 */
function moonAdd(p, w, n, N) {
  const s = S(p);
  if ((s.fmEnd ?? 0) > w.time) return;
  s.moon = Math.min(N.full, (s.moon ?? 0) + n);
  if (s.moon < N.full) return;
  s.moon = 0; s.fmEnd = w.time + N.t;
  bump(p, 'fullMoon');
  callout(w, p.cx, p.y - 16, '만월!', '#e8f0ff');
  w.fx.ring(p.cx, p.cy - 20, { color: '#e8f0ff', r0: 20, r1: 150, life: 0.6, width: 6 });
  w.fx.burst('holy', p.cx, p.cy - 20, 10, { speed: 220, color: '#e8f0ff' });
  K.afterimage?.(w, p, '#c8d8ff', 0.4);
  w.game?.vignette?.('#c8d8ff', 0.3, 3);
  sfx(w, 'charge_ready', { vol: 0.6 });
}
const fullMoon = (p, w) => (S(p).fmEnd ?? 0) > (w ?? p.world)?.time;
const frenzy = (p) => (S(p).fzEnd ?? 0) > (p.world?.time ?? 0);
/** 군기 반경 안인가 (서약의 군기) */
function inBanner(p, w, N) {
  const b = S(p).banner;
  if (!b || !(w.time < b.end)) return false;
  const dx = p.cx - b.x, dy = p.cy - (b.y - 60);
  return dx * dx + dy * dy <= N.R * N.R;
}
/** 서약 기사의 영혼 돌격 (passive = proc, active = 보통 스킬 타격) */
function oathKnight(w, p, x, y, f, mv, proc, N) {
  K.shoot(w, p, {
    x, y, vx: f * N.spd, vy: 0, w: 50, h: 90, render: knightRender, color: '#ffcf6a', life: N.life, pierce: 99, collideWalls: false,
    light: { r: 110, color: '#ffcf6a', i: 0.7 },
    attack: K.atk(p, { mv, element: 'holy', tags: ['skill'], proc, hitstop: proc ? 0 : 0.03, shake: proc ? 0 : 1, kb: [360, -200], dmgColor: '#ffcf6a', dir: f }),
  });
  w.fx.burst('holy', x, y, 6, { speed: 160, color: '#ffcf6a' });
  if (icd(p, 'oathSfx', 0.8, w)) sfx(w, 'war_horn', { vol: 0.35, pitch: 1.2 });
}
/** 군기 그림: 깃대 + 깃발(펄럭이는 점 4) + 꼭대기 빛 + 바닥 범위 */
function drawBanner(ctx, x, y, f, R, a, t) {
  if (!(a > 0.01)) return;
  ctx.globalCompositeOperation = ADD;
  ctx.globalAlpha = 0.22 * a; ctx.strokeStyle = '#ffcf6a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y - 2, R, R * 0.2, 0, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
  K.glow(ctx, x, y - 150, 26, '#ffcf6a', 0.8 * a);
  K.glow(ctx, x, y - 6, 60, '#ffcf6a', 0.3 * a);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a; ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 152); ctx.stroke();
  const s1 = Math.sin(t * 5.2) * 4, s2 = Math.sin(t * 5.2 + 1.3) * 6, s3 = Math.sin(t * 5.2 + 2.1) * 7;
  ctx.fillStyle = '#ffcf6a';
  ctx.beginPath();
  ctx.moveTo(x + f * 2, y - 146);
  ctx.lineTo(x + f * 26, y - 144 + s1);
  ctx.lineTo(x + f * 50, y - 140 + s2);
  ctx.lineTo(x + f * 46 + s3 * 0.5 * f, y - 98 + s3);
  ctx.lineTo(x + f * 24, y - 100 + s2 * 0.6);
  ctx.lineTo(x + f * 2, y - 104);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a4a8a';
  ctx.beginPath(); ctx.arc(x + f * 25, y - 122 + s2 * 0.5, 7, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}

// ─────────────────────────── 은월탄 (비전 액티브) ───────────────────────────
function silverShot(w, p, x0, y, f, mv) {
  if (p.dead) return;
  const cam = w.camera, x1 = f > 0 ? cam.x + cam.vw + 60 : cam.x - 60, lx = Math.min(x0, x1), len = Math.abs(x1 - x0);
  const a = K.atk(p, { mv, kb: [460, -160], hitstop: 0.08, shake: 6, tags: ['projectile', 'silver'], crit: 0, dir: f, element: null });
  K.fx(w, {
    life: 0.42, z: 12, x: lx, y: y - 60, w: len, h: 120, atk: a, win: [0, 0.25],
    rect() { return { x: lx, y: y - 20, w: len, h: 40 }; },
    draw(ctx, e) {
      const k = 1 - e.k, th = 20 * (1 - e.k * 0.7);
      ctx.globalCompositeOperation = ADD;
      K.beamH(ctx, x0, x1, y, th * 2.2, '#c8d8ff', 0.7 * k);
      K.beamH(ctx, x0, x1, y, th * 0.6, '#ffffff', k, '#ffffff');
      K.glow(ctx, x0, y, 70, '#e8f0ff', k);
    },
    light(L, e) { L.add(x0 + f * 200, y, 260, '#e8f0ff', 1.2 * (1 - e.k)); },
  });
  K.muzzle?.(w, p, x0, y, f > 0 ? 0 : Math.PI, '#e8f0ff', 1.8);
  w.fx.flash(x0, y, { color: '#ffffff', size: 120, life: 0.12 });
  for (let i = 1; i <= 8; i++) w.fx.burst('spark', x0 + f * len * i / 9, y, 1, { speed: 90, color: '#e8f0ff' });
  sfx(w, 'shotgun'); sfx(w, 'gun', { pitch: 0.6 });
  shake(w, 8, 0.25); w.camera?.punchZoom?.(1.04, 0.12);
  p.vx = -f * 300;
  bump(p, 'silverShot');
}

// ═════════════════════════════════════ 항목 ═════════════════════════════════════
export const PERKS_B = {
  // ── 브란 공통 (C7): 공격하는 동안 작은 피격으로는 경직되지 않는다 ──
  'char:bran': {
    N: { frac: 0.10, cueCd: 0.5 },
    onHurt(p, dmg, atk, w) {
      const N = this.N;
      if (!p.move || p.move.skill || !(dmg < N.frac * maxHp(p))) return;
      bump(p, 'knightArmor');
      if (icd(p, 'knArm', N.cueCd, w)) { w.fx.ring(p.cx, p.cy - 6, { color: '#e8e8f0', r0: 14, r1: 46, life: 0.2, width: 3 }); sfx(w, 'clang', { vol: 0.35, pitch: 1.2 }); }
      return { armor: true };
    },
  },

  // ── 데드아이 (S3, 1차 → 팬텀·처형인과 그 초월·비전에도): 4초 동안 내게 맞지 않은 적을 맞히는 첫 탄은 치명타 확정 ──
  victor_deadeye: {
    N: { fresh: 4, crit: 100, cueCd: 0.25 },
    onAttack(p, atk, tgt, w) {
      const N = this.N;
      if ((w?.time ?? 0) - (tgt._vSeen ?? -99) <= N.fresh) return;
      bump(p, 'firstShot');
      if (icd(p, 'deCue', N.cueCd, w)) { w.fx.flash(tgt.cx, tgt.cy - 10, { color: '#ff4040', size: 54, life: 0.12 }); sfx(w, 'eye_glint', { vol: 0.4 }); }
      return { crit: N.crit };
    },
    onHit(p, tgt, info, atk, w) { tgt._vSeen = w.time; },
    prewarm() { K.glowSprite?.('#ff4040'); },
  },

  // ── 성기사 (S4, 1차 → 수호성기사·십자군 총사령과 그 초월·비전에도): 10초마다 가호 ──
  bran_paladin: {
    N: { cd: 10, half: 0.5, r: 120, mv: 0.5 },
    tick(p, w, dt) {
      const s = S(p);
      if (s.grace) return;
      s.graceT = (s.graceT ?? 0) + dt;
      if (s.graceT < this.N.cd) return;
      s.grace = true; s.graceT = 0;
      w.fx.ring(p.cx, p.cy - 10, { color: '#ffd84a', r0: 10, r1: 40, life: 0.35, width: 3 });
      sfx(w, 'holy', { vol: 0.3, pitch: 1.4 });
    },
    onHurt(p, dmg, atk, w) {
      const s = S(p), N = this.N;
      if (!s.grace || atk?.team !== 'enemy' || atk.flat) return;
      s.grace = false; s.graceT = 0;
      bump(p, 'grace');
      blast(w, p, p.cx, p.cy - 10, N.r, { mv: N.mv, element: 'holy', kb: [260, -160], tags: ['melee'] }, '#ffd84a', '#fff2b0', 8);
      callout(w, p.cx, p.y - 10, '가호!', '#ffd84a');
      sfx(w, 'holy', { vol: 0.6 });
      return dmg * N.half;
    },
    drawMeter(ctx, p, w) {
      if (!S(p).grace) return;
      const x = p.cx - p.facing * 18, y = p.y + 4, k = 0.8 + 0.2 * Math.sin((w?.time ?? 0) * 4);
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, x, y, 13 * k, '#ffd84a', 0.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffd84a'; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(x - 4.5, y - 5); ctx.lineTo(x + 4.5, y - 5); ctx.lineTo(x + 4.5, y + 1); ctx.lineTo(x, y + 6); ctx.lineTo(x - 4.5, y + 1); ctx.closePath(); ctx.fill();
    },
    prewarm() { K.glowSprite?.('#ffd84a'); K.glowSprite?.('#fff2b0'); },
  },

  // ── 수호성기사 (S5): 8초 동안 피해를 받지 않으면 최대 HP 12% 결계 ──
  bran_guardian: {
    N: { wait: 8, frac: 0.12 },
    tick(p, w, dt) {
      const s = S(p), N = this.N;
      s.unhurt = (s.unhurt ?? 0) + dt;
      if (s.unhurt < N.wait) return;
      s.unhurt = 0;
      const cap = N.frac * maxHp(p);
      if (shieldOf(p) >= cap - 0.5) return;
      shieldAdd(p, cap, cap);
      bump(p, 'barrier');
      w.fx.ring(p.cx, p.cy - 8, { color: '#9ac8ff', r0: 18, r1: 64, life: 0.4, width: 4 });
      w.fx.text(p.cx, p.y - 16, '결계', { color: '#9ac8ff', size: 15, life: 0.7 });
      sfx(w, 'holy', { vol: 0.4, pitch: 0.8 });
    },
    onHurt(p, dmg, atk, w) {
      if (!(shieldOf(p) > 0) || !(dmg > 0)) return;
      const rest = shieldAbsorb(p, dmg);
      bump(p, 'absorb');
      w.fx.ring(p.cx, p.cy - 8, { color: '#9ac8ff', r0: 24, r1: 54, life: 0.2, width: 3 });
      sfx(w, 'clang', { vol: 0.4, pitch: 1.4 });
      return rest > 0 ? rest : { dmg: 0, armor: true };
    },
    afterHurt(p) { S(p).unhurt = 0; },
    drawMeter(ctx, p) {
      const sh = shieldOf(p);
      if (!(sh > 0)) return;
      const k = Math.min(1, sh / (this.N.frac * maxHp(p))), r = p.h * 0.62;
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, p.cx, p.cy, r * 1.15, '#9ac8ff', 0.18 + 0.12 * k);
      ctx.strokeStyle = '#cfe4ff'; ctx.globalAlpha = 0.75; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.cx, p.cy, r, -Math.PI / 2 - k * Math.PI, -Math.PI / 2 + k * Math.PI); ctx.stroke();
    },
    prewarm() { K.glowSprite?.('#9ac8ff'); },
  },

  // ── 혈귀 광전사 (S6): HP 40% 아래로 떨어지면 6초 혈귀화 (20초에 한 번) ──
  bran_bloodrage: {
    N: { below: 0.4, t: 6, cd: 20, spd: 1.25, ls: 0.06 },
    afterHurt(p, dmg, atk, w) {
      const N = this.N;
      if (!(p.hp > 0) || p.hp >= N.below * maxHp(p) || !icd(p, 'frenzy', N.cd, w)) return;
      S(p).fzEnd = w.time + N.t;
      bump(p, 'frenzy');
      callout(w, p.cx, p.y - 12, '혈귀화!', '#ff1a2a');
      w.game?.vignette?.('#c00010', 0.5, 3);
      w.fx.burst('blood', p.cx, p.cy, 10, { speed: 260, color: '#ff1a2a' });
      w.fx.ring(p.cx, p.cy, { color: '#ff1a2a', r0: 16, r1: 90, life: 0.4, width: 6 });
      sfx(w, 'heartbeat', { vol: 0.7 });
    },
    atkSpdMul(p) { return frenzy(p) ? this.N.spd : 1; },
    onHurt(p) { if (frenzy(p)) return { armor: true }; },
    onHit(p, tgt, info) { if (frenzy(p) && info?.dmg > 0) p.heal(info.dmg * this.N.ls, false); },
    tick(p, w) { if (frenzy(p) && icd(p, 'fzMote', 0.25, w)) w.fx.burst('bloodmist', p.cx, p.cy - 10, 1, { speed: 30 }); },
    drawMeter(ctx, p, w) {
      if (!frenzy(p)) return;
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, p.cx, p.cy, 54, '#ff1a2a', 0.28 + 0.1 * Math.sin((w?.time ?? 0) * 9));
    },
    prewarm() { K.glowSprite?.('#ff1a2a'); },
  },

  // ═══════════ 빅터 초월 ═══════════
  // 망령 저격수 「유령 도탄」
  victor_specter: {
    N: { win: 1.2, r: 400, k: 0.5, max: 6, speed: 1600, life: 0.35, reloadCue: 0.4 },
    onDash(p) { S(p).ric = 0; },
    onHit(p, tgt, info, atk, w) {
      const N = this.N, s = S(p);
      if (!atk?.tags?.includes('projectile') || !(p.t - (p.lastDashT ?? -99) < N.win) || (s.ric ?? 0) >= N.max) return;
      const e2 = nearestFoe(w, tgt.cx, tgt.cy, N.r, tgt);
      if (!e2) return;
      s.ric = (s.ric ?? 0) + 1;
      bump(p, 'ricochet');
      const ang = Math.atan2(e2.cy - tgt.cy, e2.cx - tgt.cx);
      const b = procBullet(w, p, tgt.cx + Math.cos(ang) * 14, tgt.cy + Math.sin(ang) * 14, ang, { mv: (atk.mv ?? 0.6) * N.k, speed: N.speed, life: N.life, walls: false, hitstop: 0, shake: 0, kb: [90, -40] }, '#9ab0ff');
      if (b) { b.attack.dir = Math.cos(ang) >= 0 ? 1 : -1; tgt._hits?.set?.(b.attack.hitId, w.time); }   // 맞힌 적은 다시 맞히지 않는다
      w.fx.flash(tgt.cx, tgt.cy, { color: '#9ab0ff', size: 40, life: 0.1 });
      if (icd(p, 'ricSfx', 0.08, w)) sfx(w, 'gun', { vol: 0.3, pitch: 1.7 });
    },
    onKill(p, e, atk, w) {
      if (!(p.t - (p.lastDashT ?? -99) < this.N.win)) return;
      p.dashCool = 0; p.airDashUsed = false;
      bump(p, 'reload');
      if (icd(p, 'reload', this.N.reloadCue, w)) { callout(w, p.cx, p.y - 12, '재장전!', '#9ab0ff'); sfx(w, 'cylinder_spin', { vol: 0.5 }); K.afterimage?.(w, p, '#9ab0ff', 0.25); }
    },
    drawMeter(ctx, p) {
      const N = this.N, dt = p.t - (p.lastDashT ?? -99);
      if (!(dt < N.win)) return;
      const k = 1 - dt / N.win, left = N.max - (S(p).ric ?? 0);
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, p.cx, p.cy, 46, '#9ab0ff', 0.35 * k);
      ctx.fillStyle = '#c0d0ff'; ctx.globalAlpha = 0.5 + 0.5 * k;
      for (let i = 0; i < left; i++) { ctx.beginPath(); ctx.arc(p.cx - (N.max - 1) * 4 + i * 8, p.y - 8, 2.4, 0, TAU); ctx.fill(); }
    },
    prewarm() { K.glowSprite?.('#9ab0ff'); },
  },

  // 사형 집행자 「즉결 처형」
  victor_headsman: {
    N: { at: 0.40, t: 6, exec: 0.15, mp: 10, sp: 4, boss: 1.25, bossCd: 6 },
    onHit(p, tgt, info, atk, w) {
      const N = this.N;
      if (info?.killed || tgt.dead || markOf(tgt, 'sent') || !(hpOf(tgt) < N.at)) return;
      if (isBoss(tgt) && !icd(tgt, 'sent', N.bossCd, w)) return;
      mark(tgt, 'sent', N.t, 1, 1);
      bump(p, 'sentence');
      w.fx.flash(tgt.cx, tgt.y + 8, { color: '#ff2030', size: 50, life: 0.14 });
      if (icd(p, 'sentSfx', 0.3, w)) sfx(w, 'seal_stamp', { vol: 0.5 });
    },
    onAttack(p, atk, tgt, w) {
      const N = this.N;
      if (!markOf(tgt, 'sent')) return;
      if (isBoss(tgt)) {
        unmark(tgt, 'sent');
        bump(p, 'bossSentence');
        w.fx.flash(tgt.cx, tgt.cy, { color: '#ff2030', size: 90, life: 0.16 });
        sfx(w, 'crit', { vol: 0.5, pitch: 0.8 });
        return { mult: N.boss };
      }
      if (hpOf(tgt) < N.exec) return { flat: Math.ceil(tgt.hp) + 1, executed: true };
    },
    onKill(p, e, atk, w) {
      if (!atk?.executed) return;
      const N = this.N;
      p.mp = Math.min(p.stats.mp, p.mp + N.mp);
      w.run.sp = Math.min(100, (w.run.sp ?? 0) + N.sp);
      bump(p, 'execute');
      callout(w, e.cx, e.y - 8, '처형!', '#ff2030');
      execFx(w, e.cx, e.cy);
      sfx(w, 'crit', { vol: 0.6, pitch: 0.7 });
    },
    prewarm() { K.glowSprite?.('#ff2030'); },
  },

  // 연옥의 총잡이 「과열」 (HOOKS: 헬파이어 탄 폭발 반경·위력 × p._heatK)
  victor_purgatory: {
    N: { per: 10, extra: 4, max: 100, idle: 0.8, cool: 25, oh: 3, r: 1.5, mv: 1.25, ringR: 140, ringMv: 0.8, vent: 2, ember: 50, emberEvery: 0.2 },
    onSwing(p, w, mv) {
      const N = this.N, s = S(p);
      if (!mv?.proj || mv.skill || (s.vent ?? 0) > 0 || (s.oh ?? 0) > 0) return;
      const n = Math.max(1, freshCount(w, p));
      s.heat = Math.min(N.max, (s.heat ?? 0) + N.per + N.extra * (n - 1));
      s.lastShot = w.time;
    },
    tick(p, w, dt) {
      const N = this.N, s = S(p);
      if (s.oh > 0) {
        s.oh -= dt;
        if (icd(p, 'ohMote', 0.1, w)) { const g = K.gunOf(p); w.fx.burst('fire', g.x, g.y, 1, { speed: 80, color: '#ff7a2a' }); }
        if (s.oh > 0) return;
        s.oh = 0; s.heat = 0; s.vent = N.vent; p._heatK = null;
        bump(p, 'vent');
        blast(w, p, p.cx, p.cy - 16, N.ringR, { mv: N.ringMv, element: 'fire', kb: [300, -260], tags: ['projectile'] }, '#ff5a1a', '#ffd070', 10);
        w.fx.ring(p.cx, p.cy - 16, { color: '#ffb040', r0: 30, r1: N.ringR * 1.2, life: 0.45, width: 8 });
        shake(w, 4, 0.2);
        sfx(w, 'explode', { vol: 0.6 });
        return;
      }
      if (s.vent > 0) { s.vent = Math.max(0, s.vent - dt); return; }
      const h = s.heat ?? 0;
      if (!(h > 0)) return;
      if (h >= N.max) {
        s.oh = N.oh;
        p._heatK = (s.heatK ??= Object.freeze({ r: N.r, mv: N.mv }));
        bump(p, 'overheat');
        callout(w, p.cx, p.y - 12, '과열!', '#ff5a1a');
        w.fx.ring(p.cx, p.cy, { color: '#ff5a1a', r0: 16, r1: 80, life: 0.35, width: 5 });
        sfx(w, 'fire', { vol: 0.7, pitch: 0.8 });
        return;
      }
      if (w.time - (s.lastShot ?? -9) > N.idle) s.heat = Math.max(0, h - N.cool * dt);
      if (h >= N.ember && icd(p, 'ember', N.emberEvery, w)) { const g = K.gunOf(p); w.fx.burst('ember', g.x, g.y, 1, { speed: 60, color: '#ffb040' }); }
    },
    drawMeter(ctx, p, w) {
      const N = this.N, s = S(p), oh = s.oh > 0, vent = s.vent > 0, h = s.heat ?? 0;
      if (!oh && !vent && !(h > 0)) return;
      const x = p.cx - p.facing * 24, y0 = p.bottom - 14, H = 48;
      const k = oh ? 1 : vent ? s.vent / N.vent : h / N.max;
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#1a0a06'; ctx.fillRect(x - 3, y0 - H, 6, H);
      ctx.globalAlpha = 0.95; ctx.fillStyle = vent ? '#8a8078' : oh ? '#fff0c0' : h >= N.ember ? '#ff5a1a' : '#ff9a40';
      ctx.fillRect(x - 2, y0 - H * k, 4, H * k);
      if (oh) {
        ctx.globalCompositeOperation = ADD; ctx.globalAlpha = 1;
        K.glow(ctx, p.cx, p.cy, 58, '#ff5a1a', 0.3 + 0.12 * Math.sin((w?.time ?? 0) * 16));
        K.glow(ctx, x, y0 - H, 14, '#ffd070', 0.8);
      }
    },
    prewarm() { K.glowSprite?.('#ff5a1a'); K.glowSprite?.('#ffd070'); },
  },

  // 총왕 「난사」
  victor_gunking: {
    N: { need: 12, t: 4, cd: 10, ang: 0.12, k: 0.5 },
    onSwing(p, w, mv) {
      const N = this.N, s = S(p);
      if (!mv?.proj || mv.skill) return;
      if ((s.fanEnd ?? 0) > w.time) {
        const sh = firstFresh(w, p);
        if (!sh) return;
        const a0 = Math.atan2(sh.vy, sh.vx), m = (mv.proj.mv ?? mv.mv ?? 0.6) * N.k;
        for (let k = -1; k <= 1; k += 2) procBullet(w, p, sh.cx, sh.cy, a0 + k * N.ang, { mv: m, hitstop: 0, shake: 0, life: 0.5, kb: [100, -30] }, '#ffd84a');
        bump(p, 'fanShot');
        return;
      }
      s.streak = (s.streak ?? 0) + 1;
      if (s.streak < N.need || !icd(p, 'fan', N.cd, w)) return;
      s.streak = 0; s.fanEnd = w.time + N.t;
      bump(p, 'fan');
      callout(w, p.cx, p.y - 12, '난사!', '#ffd84a');
      w.fx.ring(p.cx, p.cy, { color: '#ffd84a', r0: 14, r1: 76, life: 0.35, width: 4 });
      sfx(w, 'cylinder_spin', { vol: 0.6 });
    },
    afterHurt(p) { S(p).streak = 0; },
    drawMeter(ctx, p, w) {
      const N = this.N, s = S(p), t = w?.time ?? 0, x = p.cx, y = p.y - 10;
      if ((s.fanEnd ?? 0) > t) {
        const k = (s.fanEnd - t) / N.t;
        ctx.globalCompositeOperation = ADD;
        K.glow(ctx, x, p.cy, 50, '#ffd84a', 0.25 + 0.1 * k);
        ctx.fillStyle = '#ffe070'; ctx.globalAlpha = 0.9;
        for (let i = 0; i < 6; i++) { const a = t * 9 + i * TAU / 6; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 2.4, 0, TAU); ctx.fill(); }
        return;
      }
      const n = Math.min(N.need, s.streak ?? 0);
      if (!n) return;
      ctx.strokeStyle = n >= N.need ? '#fff0b0' : '#ffd84a'; ctx.globalAlpha = n >= N.need ? 0.95 : 0.7; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + TAU * n / N.need); ctx.stroke();
    },
    prewarm() { K.glowSprite?.('#ffd84a'); },
  },

  // ═══════════ 브란 초월 ═══════════
  // 성채 기사 「방진」
  bran_bastion: {
    N: { still: 0.6, tol: 40, red: 0.8, mv: 0.6, cd: 0.5 },
    tick(p, w, dt) {
      const N = this.N, s = S(p);
      if (!p.onGround || p.mount?.riding || p.dead) { s.stance = false; s.anchor = null; s.still = 0; return; }
      if (s.anchor == null || Math.abs(p.cx - s.anchor) > N.tol) { s.stance = false; s.anchor = p.cx; s.still = 0; return; }
      if (s.stance) return;
      s.still = (s.still ?? 0) + dt;
      if (s.still < N.still) return;
      s.stance = true;
      bump(p, 'stance');
      w.fx.ering(p.cx, p.bottom - 2, { color: '#cfe0ff', r0: 10, r1: 72, ry: 0.28, life: 0.4, width: 4 });
      w.fx.burst('holy', p.cx, p.bottom - 20, 6, { speed: 120, angle: -Math.PI / 2, spread: 1 });
      sfx(w, 'clang', { vol: 0.35, pitch: 0.7 });
    },
    onHurt(p, dmg) { if (S(p).stance) { bump(p, 'stanceHit'); return { dmg: dmg * this.N.red, armor: true }; } },
    afterHurt(p, dmg, atk, w) {
      const N = this.N, o = atk?.owner;
      if (!S(p).stance || !o || o.dead || (o.kind !== 'enemy' && o.kind !== 'boss') || atk.tags?.includes('projectile') || !icd(p, 'bcounter', N.cd, w)) return;
      const hb = typeof o.hurtbox === 'function' ? o.hurtbox() : o;
      strike(w, p, { x: hb.x - 8, y: hb.y - 8, w: hb.w + 16, h: hb.h + 16 }, { mv: N.mv, element: 'holy', kb: [260, -160], tags: ['melee'], dir: Math.sign(o.cx - p.cx) || p.facing }, '#cfe0ff');
      bump(p, 'counter');
      const x = (p.cx + o.cx) / 2, y = p.cy - 6;
      w.fx.flash(x, y, { color: '#cfe0ff', size: 70, life: 0.12 });
      w.fx.burst('holy', x, y, 5, { speed: 180 });
      if (icd(p, 'bcCue', 1, w)) callout(w, p.cx, p.y - 12, '반격!', '#cfe0ff');
      sfx(w, 'counter', { vol: 0.5 });
    },
    drawMeter(ctx, p, w) {
      const N = this.N, s = S(p);
      if (!s.stance && !(s.still > 0.1)) return;
      const k = s.stance ? 1 : Math.min(1, s.still / N.still), y = p.bottom - 2;
      ctx.globalCompositeOperation = ADD;
      if (s.stance) K.glow(ctx, p.cx, y - 6, 54, '#cfe0ff', 0.28 + 0.06 * Math.sin((w?.time ?? 0) * 5));
      ctx.strokeStyle = '#cfe0ff'; ctx.globalAlpha = s.stance ? 0.8 : 0.4; ctx.lineWidth = s.stance ? 3 : 2;
      ctx.beginPath(); ctx.ellipse(p.cx, y, N.tol, 9, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
    },
    prewarm() { K.glowSprite?.('#cfe0ff'); },
  },

  // 성전 선봉장 「방패 돌격」 + 성광 충격파 세 번
  bran_vanguard: {
    N: { mv: 1.2, kbx: 420, kby: -220, hs: 0.03, hsGap: 1.5, waveMv: 0.8, gap: 0.12, n: 2 },
    onDash(p, w) {
      const N = this.N, f = p.facing;
      const a = procAtk(p, { mv: N.mv, element: 'holy', kb: [N.kbx, N.kby], hitstop: icd(p, 'vgHs', N.hsGap, w) ? N.hs : 0, shake: 2, tags: ['melee'] });
      a.dmgColor = '#ffd870';
      bump(p, 'shieldBash');
      K.fx(w, {
        life: Math.max(0.12, p.dashT || 0.2), z: 11, atk: a, win: [0, 1], d: { snd: 0 },
        follow(e) { e.x = p.cx - 90; e.y = p.y - 30; e.w = 180; e.h = p.h + 40; },
        rect() { return p.relRect(-10, -90, 90, 90); },
        tick(e, ww) { ww.fx.burst('holy', p.cx + f * 30, p.cy, 1, { speed: 80 }); },
        onHit(e, ww) { if (!e.d.snd) { e.d.snd = 1; bump(p, 'shieldBashHit'); sfx(ww, 'clang', { vol: 0.6, pitch: 0.9 }); } },
        draw(ctx, e) {
          const a2 = Math.min(1, e.lt * 14) * (1 - e.k * 0.4);
          ctx.translate(p.cx + p.facing * 38, p.cy - 6); ctx.scale(p.facing, 1);
          ctx.globalCompositeOperation = ADD;
          K.glow(ctx, 0, 0, 56, '#ffd870', 0.5 * a2);
          ctx.globalCompositeOperation = 'source-over';
          K.shieldShape?.(ctx, 0.9, a2);
        },
        end(e, ww) { ww.fx.ring(p.cx + p.facing * 30, p.cy, { color: '#ffd870', r0: 10, r1: 70, life: 0.25, width: 4 }); },
        light(L) { L.add(p.cx + p.facing * 40, p.cy, 120, '#ffd870', 0.8); },
      });
    },
    onSwing(p, w, mv) {
      if (!mv?.finisher || mv.skill) return;
      const N = this.N, f = p.facing;
      for (let i = 1; i <= N.n; i++) {
        K.setTimeoutFx(w, N.gap * i, (ww) => {
          if (p.dead) return;
          K.shoot(ww, p, {
            x: p.cx + f * 40, y: p.bottom - 60, vx: f * 900, vy: 0, w: 50, h: 80, render: waveRender, color: '#fff2b0', life: 0.5, pierce: 99,
            attack: K.atk(p, { mv: N.waveMv, element: 'holy', tags: ['skill'], proc: true, hitstop: 0, shake: 0, kb: [300, -160], dmgColor: '#ffd870', dir: f }),
          });
          ww.fx.burst('holy', p.cx + f * 40, p.bottom - 60, 3, { speed: 140 });
          bump(p, 'wave');
        });
      }
    },
    prewarm() { K.glowSprite?.('#ffd870'); K.glowSprite?.('#fff2b0'); },
  },

  // 정복왕 「꺾이지 않는 기세」
  bran_conqueror: {
    N: { combo: 30, chance: 0.10, cd: 1.2, r: 160, mv: 0.6, stun: 0.4, keep: 0.15 },
    onHit(p, tgt, info, atk, w) {
      const N = this.N;
      if ((w.combo?.n ?? 0) < N.combo || Math.random() >= N.chance || !icd(p, 'roar', N.cd, w)) return;
      bump(p, 'roar');
      blast(w, p, p.cx, p.cy - 10, N.r, { mv: N.mv, element: 'fire', stun: N.stun, kb: [340, -280], tags: ['melee'] }, '#ff5020', '#ffd0a0', 10);
      w.fx.ring(p.cx, p.cy - 10, { color: '#ff7a3a', r0: 30, r1: N.r * 1.25, life: 0.4, width: 8 });
      shake(w, 4, 0.2);
      callout(w, p.cx, p.y - 14, '포효!', '#ff7a3a');
      sfx(w, 'war_horn', { vol: 0.55 });
    },
    keepCombo(p, dmg) { if (dmg < this.N.keep * maxHp(p)) return true; },
    afterHurt(p, dmg, atk, w) {
      if ((w.combo?.n ?? 0) > 0 && dmg < this.N.keep * maxHp(p) && icd(p, 'keepCue', 1, w)) { bump(p, 'keepCombo'); callout(w, p.cx, p.y - 10, '기세!', '#ffb070'); }
    },
    drawMeter(ctx, p, w) {
      if ((w?.combo?.n ?? 0) < this.N.combo) return;
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, p.cx, p.cy + 6, 56, '#ff5020', 0.22 + 0.08 * Math.sin((w?.time ?? 0) * 11));
    },
    prewarm() { K.glowSprite?.('#ff5020'); K.glowSprite?.('#ffd0a0'); },
  },

  // 혈귀 폭군 「피의 분노」
  bran_bloodtyrant: {
    N: { above: 0.5, burn: 0.01, max: 10, per: 0.02, idle: 2, decay: 0.5, inv: 1 },
    onSwing(p, w, mv) {
      if (!mv || mv.skill) return;
      const N = this.N, s = S(p);
      s.lastAtk = w.time;
      if (!(p.hp > N.above * maxHp(p))) return;
      p.hp -= Math.max(1, Math.floor(N.burn * p.hp));
      s.rage = Math.min(N.max, (s.rage ?? 0) + 1);
      bump(p, 'rage');
      w.fx.burst('blood', p.cx, p.cy - 8, 2, { speed: 120, color: '#ff1a2a' });
    },
    tick(p, w) {
      const N = this.N, s = S(p);
      if (!(s.rage > 0) || w.time - (s.lastAtk ?? -9) <= N.idle) return;
      if (icd(p, 'rageDecay', N.decay, w)) s.rage--;
    },
    dmgMul(p) { return 1 + this.N.per * (S(p).rage ?? 0); },
    onLethal(p, atk, w) {
      if (w.run.tyrantUsed) return;
      w.run.tyrantUsed = true;
      p.hp = 1; p.iframes = Math.max(p.iframes ?? 0, this.N.inv);
      bump(p, 'undying');
      w.fx.burst('blood', p.cx, p.cy, 12, { speed: 320, color: '#ff1a2a' });
      w.fx.ring(p.cx, p.cy, { color: '#ff1a2a', r0: 20, r1: 120, life: 0.5, width: 8 });
      callout(w, p.cx, p.y - 14, '불사!', '#ff1a2a');
      w.game?.vignette?.('#c00010', 0.6, 3);
      sfx(w, 'boss_roar', { vol: 0.5, pitch: 1.3 });
      return true;
    },
    drawMeter(ctx, p, w) {
      const N = this.N, n = S(p).rage ?? 0;
      if (!(n > 0)) return;
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, p.cx, p.cy, 30 + n * 3, '#ff1a2a', 0.06 + n * 0.025);
      ctx.globalCompositeOperation = 'source-over';
      const y = p.y - 8, x0 = p.cx - (N.max - 1) * 3.5;
      for (let i = 0; i < N.max; i++) {
        ctx.globalAlpha = i < n ? 0.95 : 0.25; ctx.fillStyle = i < n ? '#ff1a2a' : '#3a0a0e';
        ctx.beginPath(); ctx.arc(x0 + i * 7, y - (i < n && n >= N.max ? Math.sin((w?.time ?? 0) * 12 + i) : 0), 2.4, 0, TAU); ctx.fill();
      }
    },
    prewarm() { K.glowSprite?.('#ff1a2a'); },
  },

  // ═══════════ 비전 ═══════════
  // 은랑 사냥꾼: 달 게이지 · 만월 (은탄 +15%, 관통 +2, 대시 발톱) · 은월탄 보조
  victor_silverwolf: {
    N: { hit: 3, kill: 8, full: 100, t: 8, dmg: 1.15, pierce: 2, claw: 0.5, clawN: 3, clawGap: 0.05, aim: 0.35, sbKill: 30, sbCut: 0.25, sbMax: 0.5, sbLow: 0.5 },
    onHit(p, tgt, info, atk, w) { moonAdd(p, w, this.N.hit, this.N); },
    onKill(p, e, atk, w) {
      const N = this.N, s = S(p);
      if (atk?.tags?.includes('silver')) {
        const id = 'asc_victor_silverbullet', base = SKILLS[id]?.cd ?? 15, cut = N.sbCut * base;
        bump(p, 'silverKill');
        if ((s.sbCut ?? 0) + cut <= N.sbMax * base + 1e-6 && (p.skillCd?.[id] ?? 0) > 0) {
          p.skillCd[id] = Math.max(0, p.skillCd[id] - cut); s.sbCut = (s.sbCut ?? 0) + cut;
          w.fx.text(p.cx, p.y - 26, '-25%', { color: '#e8f0ff', size: 15, life: 0.8 });
          sfx(w, 'cylinder_spin', { vol: 0.45, pitch: 1.3 });
        }
        moonAdd(p, w, N.sbKill, N);
      }
      moonAdd(p, w, N.kill, N);
    },
    onSwing(p, w, mv) {
      if (!mv?.proj || mv.skill || !fullMoon(p, w)) return;
      const L = w.entities;
      for (let i = L.length - 1, k = 0; i >= 0 && k < 24; i--, k++) {
        const e = L[i];
        if (e.kind === 'projectile' && e.owner === p && e.t === 0 && !e.dead) { e.pierce = (e.pierce ?? 1) + this.N.pierce; e.color = '#e8f0ff'; }
      }
    },
    onAttack(p, atk, tgt, w) {
      const N = this.N, silver = atk.tags?.includes('silver') && hpOf(tgt) < N.sbLow, moon = fullMoon(p, w) && atk.tags?.includes('projectile');
      if (!silver && !moon) return;
      return { mult: moon ? N.dmg : 1, crit: silver ? 100 : 0 };
    },
    onDash(p, w) { if (fullMoon(p, w)) claws(w, p, this.N); },
    drawMeter(ctx, p, w) {
      const N = this.N, s = S(p), t = w?.time ?? 0, x = p.cx - p.facing * 20, y = p.y - 2, r = 7;
      const full = (s.fmEnd ?? 0) > t, k = full ? 1 : Math.min(1, (s.moon ?? 0) / N.full);
      ctx.globalCompositeOperation = ADD;
      if (full) {
        K.glow(ctx, x, y, 22 + 3 * Math.sin(t * 6), '#e8f0ff', 0.75);
        K.glow(ctx, p.cx, p.cy, 52, '#c8d8ff', 0.2);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#1a1a2a'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      if (k > 0.02) {
        // 초승달 → 보름달: 오른쪽 반원 + 경계 타원 (rx = r·|1 − 2k|, k < 0.5 이면 안쪽으로 파인 초승달)
        ctx.globalAlpha = full ? 1 : 0.85; ctx.fillStyle = '#e8f0ff';
        ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, false);
        ctx.ellipse(x, y, Math.max(0.01, r * Math.abs(1 - 2 * k)), r, 0, Math.PI / 2, -Math.PI / 2, k < 0.5);
        ctx.closePath(); ctx.fill();
      }
      if (full) {
        ctx.strokeStyle = '#e8f0ff'; ctx.globalAlpha = 0.8; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * ((s.fmEnd - t) / N.t)); ctx.stroke();
      }
    },
    prewarm() { K.glowSprite?.('#e8f0ff'); K.glowSprite?.('#c8d8ff'); },
  },

  // 서약 기사단장: 적중 20회마다 서약 기사의 영혼 · 군기 안 경직 없음 (+ 서약의 군기 효과)
  bran_oathlord: {
    N: { every: 20, cd: 3, mv: 0.8, R: 260, dmg: 1.15, red: 0.8, heal: 0.01, waveEvery: 2, first: 0.4, behind: 70, spd: 900, life: 0.7 },
    onHit(p, tgt, info, atk, w) {
      const N = this.N, s = S(p);
      s.oathN = (s.oathN ?? 0) + 1;
      if (s.oathN < N.every || !icd(p, 'oath', N.cd, w)) return;
      s.oathN = 0;
      bump(p, 'oathKnight');
      oathKnight(w, p, p.cx - p.facing * N.behind, p.bottom - 50, p.facing, N.mv, true, N);
    },
    dmgMul(p, w) { return inBanner(p, w ?? p.world, this.N) ? this.N.dmg : 1; },
    onHurt(p, dmg, atk, w) { if (inBanner(p, w, this.N)) { bump(p, 'bannerGuard'); return { dmg: dmg * this.N.red, armor: true }; } },
    tick(p, w, dt) {
      const N = this.N, s = S(p), b = s.banner;
      if (!b) return;
      if (b.world !== w) { s.banner = null; return; }
      if (b.left > 0 && w.time >= b.next) {
        b.left--; b.next += N.waveEvery;
        const e = nearestFoe(w, b.x, b.y - 60, 900, null), f = e ? (Math.sign(e.cx - b.x) || b.f) : b.f;
        bump(p, 'bannerKnight');
        oathKnight(w, p, b.x - f * 30, b.y - 50, f, b.mv, false, N);
      }
      if (!(w.time < b.end)) { s.banner = null; return; }
      if (inBanner(p, w, N)) {
        b.heal += dt;
        if (b.heal >= 1) { b.heal -= 1; p.heal(N.heal * maxHp(p)); }
      }
    },
    onEnter(p) { S(p).banner = null; },
    drawMeter(ctx, p, w) {
      const N = this.N, s = S(p), n = s.oathN ?? 0;
      if (inBanner(p, w, N)) { ctx.globalCompositeOperation = ADD; K.glow(ctx, p.cx, p.cy, 50, '#ffcf6a', 0.25); ctx.globalCompositeOperation = 'source-over'; }
      if (!n) return;
      ctx.strokeStyle = '#ffcf6a'; ctx.globalAlpha = 0.7; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.cx - p.facing * 18, p.y + 4, 6, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, n / N.every)); ctx.stroke();
    },
    prewarm() { K.glowSprite?.('#ffcf6a'); },
  },
};

// ═════════════════════════════════════ 비전 액티브 ═════════════════════════════════════
export const ACTIVES_B = {
  /** 은월탄 — 하겐의 마지막 탄환: 0.35초 겨눈 뒤 화면 끝까지 꿰뚫는 은탄 (보통 스킬 타격; 50% 미만 치명타·처치 보상은 은랑 항목) */
  asc_victor_silverbullet(p, w, lv) {
    const id = 'asc_victor_silverbullet', N = PERKS_B.victor_silverwolf.N, mv = skillVal(id, 'dmg', lv) / 100, f = p.facing, cam = w.camera;
    S(p).sbCut = 0;
    K.pose(p, w, 'shoot_double', N.aim + 0.2, { h0: N.aim, hw: 0.04, sfx: 'charge_ready' });
    K.fx(w, {
      life: N.aim, z: 12, d: { x: p.cx, y: p.cy },
      follow(e) { const g = K.gunOf(p); e.d.x = g.x; e.d.y = g.y; e.x = cam.x; e.y = g.y - 40; e.w = cam.vw; e.h = 80; },
      draw(ctx, e) {
        const x1 = f > 0 ? cam.x + cam.vw + 60 : cam.x - 60;
        ctx.globalCompositeOperation = ADD;
        K.cutLine(ctx, e.d.x, e.d.y, x1, e.d.y, 0.8 + e.k * 1.6, '#e8f0ff', 0.2 + e.k * 0.55);
        K.glow(ctx, e.d.x, e.d.y, 18 + e.k * 30, '#e8f0ff', 0.4 + 0.5 * e.k);
      },
      end(e, ww) { silverShot(ww, p, e.d.x, e.d.y, f, mv); },
    });
    return true;
  },
  /** 서약의 군기: 발밑에 군기를 꽂는다 (하나만; 다시 쓰면 옮겨 꽂음). 효과는 bran_oathlord 항목 (dmgMul · onHurt · tick) */
  asc_bran_oathbanner(p, w, lv) {
    const id = 'asc_bran_oathbanner', N = PERKS_B.bran_oathlord.N, s = S(p);
    const T = skillVal(id, 't', lv), n = Math.floor(skillVal(id, 'n', lv)), mv = skillVal(id, 'dmg', lv) / 100, f = p.facing;
    if (s.banner?.fx) s.banner.fx.dead = true;
    const x = p.cx + f * 24, y = p.onGround ? p.bottom : (K.groundAt?.(w, x, p.bottom) ?? p.bottom);
    const b = { x, y, f, end: w.time + T, next: w.time + N.first, left: n, mv, heal: 0, fx: null, world: w };
    b.fx = K.fx(w, {
      life: T, z: 6, x: x - N.R, y: y - 200, w: N.R * 2, h: 230, d: { ring: 0 },
      tick(e, ww, dt) { e.d.ring -= dt; if (e.d.ring <= 0) { e.d.ring = 1; ww.fx.ering(x, y - 2, { color: '#ffcf6a', r0: N.R * 0.3, r1: N.R, ry: 0.2, life: 0.9, width: 2 }); } },
      draw(ctx, e, ww) { drawBanner(ctx, x, y, f, N.R, Math.min(1, e.lt * 6) * Math.min(1, (e.life - e.lt) / 0.4), ww?.time ?? e.lt); },
      light(L) { L.add(x, y - 120, 170, '#ffcf6a', 0.6); },
      end() { if (s.banner === b) s.banner = null; },
    });
    s.banner = b;
    bump(p, 'banner');
    K.pose(p, w, 'heavy_down', 0.4, { h0: 0.12, sfx: 'war_horn' });
    w.fx.burst('holy', x, y - 20, 12, { speed: 240, angle: -Math.PI / 2, spread: 1.1, color: '#ffcf6a' });
    w.fx.ering(x, y - 2, { color: '#ffcf6a', r0: 20, r1: N.R, ry: 0.2, life: 0.5, width: 5 });
    shake(w, 5, 0.2);
    sfx(w, 'clang', { vol: 0.6, pitch: 0.6 });
    return true;
  },
};

// ═════════════════════════════════════ 적 표식 ═════════════════════════════════════
export const MARKS_B = {
  /** 사형 선고: 머리 위 붉은 빛 + X (처형 가능하면 더 크고 빠르게 맥동) */
  sent(ctx, e, n, k, t) {
    const x = e.cx, y = e.y - 14, ready = !isBoss(e) && hpOf(e) < PERKS_B.victor_headsman.N.exec;
    const pulse = 0.75 + 0.25 * Math.sin(t * (ready ? 14 : 6));
    ctx.globalCompositeOperation = ADD;
    K.glow(ctx, x, y, (ready ? 20 : 14) * pulse, '#ff2030', 0.55 * Math.min(1, k * 4 + 0.3));
    ctx.globalCompositeOperation = 'source-over';
    const r = ready ? 7 : 5.5;
    ctx.strokeStyle = ready ? '#ffffff' : '#ff4050'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
  },
};
