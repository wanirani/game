// 수호신 AI B — owner: CMP-GUARD-AI-B (companions §4.9 gd_clock · gd_reaper; MASTER_PLAN §1.2 2부 수호신 표; world2 §14)
//
//  GUARDIAN_AI_B[id] = { init, attack, assist, skill, passive, onEvent }   guardian.js aiFor(id) 가 호출 시점에 찾는다.
//  없는 함수는 guardian.js 의 기본 동작 (데이터 def.attack / def.assist 의 kind → runKind).
//
//  gd_clock  틱톡   공격 「톱니 연사」 톱니 탄 3발 (runKind burst, 톱니 그림) · 협공 「톱니 드릴」 관통 톱니
//                   스킬 「정지된 초침」 world.timeStop = min(2.6, 2.0 + 0.02·(Lv−1)) (공명이면 ×0.6) + 유령 시계판 (keepFx: 방을 옮겨도 남는다)
//  gd_reaper 모르스 공격 「사신의 낫」 = 데이터 blink (체력이 낮은 적 우선: def.bias 'lowhp') · 협공 「영혼 베기」 벤 뒤 20% 이하 일반 적 처형
//                   스킬 「영혼 수확」 화면을 가로지르는 거대한 낫 (화면 안 모든 적, mv 2.5 암흑), 벤 적 하나마다 최대 HP 2% 회복 (최대 20%)
//                   고유 「처형」 사거리 안의 일반 적 체력 < 12% → 즉시 거둔다 (flat: hp + 1, 영혼 폭발, '처형'), 3초 재사용 대기
//  gd_mirra  미라   공격 = 데이터 (유도 거울 파편) · 협공 = 데이터 flash
//                   스킬 「만화경 난반사」 거울 파편 8개가 1초 동안 주인 둘레를 돈 뒤 화면 안 적 최대 8에게 날아간다 (mv 0.9 냉기, 관통 1)
//                   고유 「되비추기」 5초마다 미라나 주인 80px 안의 적 탄 하나를 쏜 적에게 되돌린다 (편 교체: team 'guardian',
//                   attack.team 'player', mv 1.0; 광선·막을 수 없는 탄·80px 넘는 탄·장판 제외 — guardian.js blockable)
//  gd_lumen  루멘   공격·협공 = 데이터 zap (번개 연쇄)
//                   스킬 「심해의 등불」 섬광: 화면 안 적 전부 mv 1.2 번개, 보스가 아닌 적은 1.5초 기절 (공명 ×0.6);
//                   깊은 물 기믹의 숨 world.gimmickOf('deep').air = 100 (GIMMICK-ENGINE 요청)
//                   고유 (빛 r220 · 물속 숨 감소 ×0.5) 는 guardian.js lights() 와 CompanionSystem.airDrainMul 이 데이터로 이미 적용한다
//  gd_momo   모모   공격·협공 = 데이터 (코 물기 · 코 휘두르기) + 문 적에게서 꿈 조각이 모모에게 빨려 든다
//                   스킬 「악몽 포식」 1초 동안 화면의 적 탄을 모두 삼키고 보스가 아닌 적을 최대 200px 끌어당긴 뒤 (주인 앞 간격을 두고 멈춤 —
//                   접촉 피해가 나지 않게), 주인 최대 HP 10% 회복 (공명 ×0.6) · keepFx
//                   고유 「한입에 꿀꺽」 6초마다 모모나 주인 120px 안의 적 탄 하나를 먹는다 ('꺼억')
//
//  적 탄을 없앨 때는 dead = true 로 조용히 지운다 (onExpire 의 폭발·분열이 터지지 않게 — 가웨인 방패와 같은 규칙).
//  모든 수호신 타격은 guardian.js 의 gStrike / gHitOne (소품·거울 스위치·포자 주머니를 치지 않음), 공격 객체는 g.atk (gAttack).
//  순환 import (guardian.js ↔ 이 파일): guardian.js 의 값은 함수 안에서만 쓴다 (모듈 최상위에서 읽지 않는다).
//
//  연출 대체 그림 — 렌더러가 true 를 돌려주면 이 파일의 절차 그림은 건너뛴다 (모두 (ctx, e, world), 월드 좌표; 투사체는 중심 원점):
//   render/guardians.js (CMP-GUARD-ART-A): fxClockFace (시계판 GFx: e.cx/cy 중심, e.data {R, hm, hh, hs, ga}) ·
//                                           fxScytheSweep (낫 GHit: e 는 화면 높이의 띠, e.data {f, k(0..1 진행), wind, color})
//   render/guardians_b.js (CMP-GUARD-ART-B, 선택 export): fxGear (톱니 탄) · fxMirrorShard (거울 파편 탄) · fxKaleido (파편 궤도 고리:
//     e.data {orbitT}) · fxMirrorPane (되비추기 거울면: e.data {a, gx, gy}) · fxLumenFlash (섬광: e.data {R}) · fxLumenBolts (e.data {segs}) ·
//     fxStunSparks (기절 표시: e.data {list}) · fxMomoVortex (흡입 소용돌이: e.data {f}) · fxMorsel (삼킨 탄 조각)
import { GFx, GHit, GProj, gStrike, gHitOne, blockable, runKind } from './guardian.js';
import * as GR from '../render/guardians.js';
import * as GB from '../render/guardians_b.js';
import { audio } from '../core/audio.js';
import { TAU, clamp, rand, lerp, overlap } from '../core/math.js';

// ───────────────────────── 공용 도우미 ─────────────────────────
const NOHIT = Object.freeze({ x: -1e9, y: -1e9, w: 0, h: 0 });
const noHit = () => NOHIT;
const alive = (e) => !!e && !e.dead && !(e.dying > 0);
const qOf = (world) => world?.fx?.quality ?? 1;
const WARNED = new Set();
function warnOnce(key, e) { if (WARNED.has(key)) return; WARNED.add(key); console.warn('[guardian_b]', key, e); }
/** 대체 렌더러가 그렸으면 true (예외는 한 번만 경고하고 절차 그림으로) */
function drew(fn, ...a) {
  if (typeof fn !== 'function') return false;
  try { return fn(...a) === true; } catch (e) { warnOnce('fx ' + (fn.name || '?'), e); return false; }
}
/** 수호신이 싸우지 않는 때 (마을·컷신·각성 연출·방 이동) */
const calm = (g) => !!g.system?.calm?.();
const isBoss = (e, world) => e.kind === 'boss' || !!e.isBoss || e === world?.boss;
const maxHpOf = (e) => e.stats?.maxHp || e.maxHp || e.hp || 1;
/** 카메라가 보는 월드 사각형 (+pad) */
function viewRect(world, pad = 0) {
  const c = world.camera, p = world.player;
  if (!c) return { x: (p?.cx ?? 0) - 480 - pad, y: (p?.cy ?? 0) - 270 - pad, w: 960 + pad * 2, h: 540 + pad * 2 };
  const vw = c.vw ?? c.w ?? 960, vh = c.vh ?? c.h ?? 540;
  return { x: c.x - pad, y: c.y - pad, w: vw + pad * 2, h: vh + pad * 2 };
}
/** 수호신이 칠 수 있는 적인가 (죽는 중·숨음·무적·noGuardianHit·드러나지 않은 비밀 방 제외) */
function foe(world, e) {
  return (e.kind === 'enemy' || e.kind === 'boss') && !e.dead && !(e.dying > 0) && !e.hidden && !e.invuln && !e.noGuardianHit
    && !world.inUnrevealedFake?.(e);
}
/** (x, y) 에서 maxD 안의 가장 가까운 적 (배열을 만들지 않는다) */
function nearestFoe(world, x, y, maxD = 700) {
  let best = null, bd = maxD;
  for (const e of world.entities) {
    if (!foe(world, e)) continue;
    const d = Math.hypot(e.cx - x, e.cy - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
/** 스킬 자세 (이미 스킬 동작 중이면 늘리기만) */
function pose(g, dur, goal, o = {}) {
  if (g.act && g.act.name === 'skill') {
    g.act.dur = Math.max(g.act.dur, g.act.t + dur);
    if (goal) g.act.goal = goal;
    return g.act;
  }
  return g.begin('skill', dur, { goal: goal ?? { x: g.cx, y: g.bottom - 6 }, ...o });
}
/** 방을 옮겨도 이어지는 연출 (CompanionSystem.keepFx) */
const keep = (g, e) => (g.system?.keepFx ? g.system.keepFx(e) : e);
/** 한가하면 짧은 공격 자세 (탄 되비추기·먹기 반응) */
function flick(g, dur = 0.22) { if (!g.act) g.begin('attack', dur, {}); }
/** 적 탄 (미라·모모 고유 능력 대상): blockable + 장판·궤도·고정 탄 제외 */
function shotOK(q) { return blockable(q) && q.behavior !== 'pool' && q.behavior !== 'orbit' && q.behavior !== 'static'; }
/** 수호신 또는 주인 r 안의 가장 가까운 적 탄 */
function nearShot(world, g, r) {
  const p = world.player;
  let best = null, bd = r;
  for (const q of world.entities) {
    if (q.kind !== 'projectile' || q.team !== 'enemy' || q.dead || !shotOK(q)) continue;
    const d = Math.min(Math.hypot(q.cx - g.cx, q.cy - g.cy), p ? Math.hypot(q.cx - p.cx, q.cy - p.cy) : Infinity);
    if (d <= bd) { bd = d; best = q; }
  }
  return best;
}

// ── 캐시 스프라이트 (한 번 만들어 재사용: 전투 중 그라디언트·캔버스를 새로 만들지 않게 — MASTER_PLAN §5.2, R12) ──
const SPR = new Map();
function sprite(key, size, paint) {
  if (SPR.has(key)) return SPR.get(key);
  let c = null;
  if (typeof document !== 'undefined') {
    try { c = document.createElement('canvas'); c.width = c.height = size; paint(c.getContext('2d'), size); }
    catch (e) { warnOnce('sprite ' + key, e); c = null; }
  }
  SPR.set(key, c);
  return c;
}
/** 둥근 빛 (색별) */
function glow(color) {
  return sprite('glow' + color, 64, (x, S) => {
    const gr = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color + '88'); gr.addColorStop(1, color + '00');
    x.fillStyle = gr; x.fillRect(0, 0, S, S);
  });
}
function glowAt(ctx, x, y, r, color, a) {
  const s = glow(color);
  if (!s || !(r > 0.5)) return;
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * a;
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = ga;
}
/** 놋쇠 톱니 */
function gearSprite() {
  return sprite('gear', 48, (x, S) => {
    const R = S * 0.47, r0 = S * 0.37, n = 10;
    x.translate(S / 2, S / 2);
    x.beginPath();
    for (let i = 0; i < n * 2; i++) x.arc(0, 0, i % 2 ? r0 : R, (i / (n * 2)) * TAU, ((i + 1) / (n * 2)) * TAU);
    x.closePath();
    x.fillStyle = '#c8a060'; x.fill();
    x.lineWidth = 1.5; x.strokeStyle = '#5a3a28'; x.stroke();
    x.beginPath(); x.arc(0, 0, r0 * 0.8, 0, TAU); x.strokeStyle = '#ffe0a0'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#5a3a28';
    for (let i = 0; i < 4; i++) { x.save(); x.rotate(i * TAU / 4 + 0.4); x.fillRect(-1.6, -r0 * 0.72, 3.2, r0 * 0.5); x.restore(); }
    x.beginPath(); x.arc(0, 0, r0 * 0.26, 0, TAU); x.fillStyle = '#2a1a10'; x.fill();
    x.beginPath(); x.arc(-R * 0.3, -R * 0.3, R * 0.2, 0, TAU); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fill();
  });
}
/** 유령 시계판 (눈금 · 시 표시 마름모 · 안쪽 톱니 고리) */
function dialSprite() {
  return sprite('dial', 256, (x, S) => {
    const R = S * 0.47;
    x.translate(S / 2, S / 2);
    x.fillStyle = 'rgba(255,214,130,0.07)'; x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fill();
    x.strokeStyle = '#ffd070';
    x.lineWidth = 5; x.beginPath(); x.arc(0, 0, R - 3, 0, TAU); x.stroke();
    x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, R * 0.9, 0, TAU); x.stroke();
    x.beginPath(); x.arc(0, 0, R * 0.6, 0, TAU); x.stroke();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU, big = i % 5 === 0, r1 = R * 0.9, r0 = big ? R * 0.77 : R * 0.85;
      x.lineWidth = big ? 4 : 1.5;
      x.beginPath(); x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); x.stroke();
    }
    x.fillStyle = '#ffe6a8';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU - Math.PI / 2, rr = R * 0.69, s = i % 3 === 0 ? 10 : 5;
      x.save(); x.translate(Math.cos(a) * rr, Math.sin(a) * rr); x.rotate(a + Math.PI / 2);
      x.beginPath(); x.moveTo(0, -s); x.lineTo(s * 0.5, 0); x.lineTo(0, s); x.lineTo(-s * 0.5, 0); x.closePath(); x.fill();
      x.restore();
    }
    x.fillStyle = '#ffd070';
    for (let i = 0; i < 24; i++) { x.save(); x.rotate((i / 24) * TAU); x.fillRect(-2, -R * 0.35, 4, R * 0.06); x.restore(); }
    x.lineWidth = 2; x.beginPath(); x.arc(0, 0, R * 0.29, 0, TAU); x.stroke();
  });
}

// ───────────────────────── 틱톡 (태엽 인형) ─────────────────────────
function drawGearProj(ctx, pr, world) {
  if (drew(GB.fxGear, ctx, pr, world)) return;
  const r = Math.max(pr.w, pr.h) * 0.62 * (pr.scale ?? 1);
  const ang = Math.atan2(pr.vy, pr.vx);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= 0.4;
  ctx.strokeStyle = '#ffd070'; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-Math.cos(ang) * r * 3, -Math.sin(ang) * r * 3); ctx.lineTo(0, 0); ctx.stroke();   // 꼬리
  ctx.globalAlpha /= 0.4;
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(pr.t * 26 * (Math.sign(pr.vx) || 1));
  const s = gearSprite();
  if (s) ctx.drawImage(s, -r, -r, r * 2, r * 2);
  else { ctx.fillStyle = '#c8a060'; ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, TAU); ctx.fill(); }
}
function drawClockFace(ctx, e, world) {
  const D = e.data, t = e.t;
  const a = Math.min(1, t / 0.2) * clamp(e.life / 0.3, 0, 1);
  if (a <= 0.01) return;
  const k = Math.min(1, t / 0.28), sc = 0.78 + 0.22 * (1 - (1 - k) * (1 - k));
  const R = D.R * sc, x = e.cx, y = e.cy;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.45 * a;
  const s = dialSprite();
  if (s) ctx.drawImage(s, x - R, y - R, R * 2, R * 2);
  else { ctx.strokeStyle = '#ffd070'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke(); }
  // 톱니 셋이 테두리를 따라 돈다
  const gs = gearSprite();
  if (gs) {
    ctx.globalAlpha = 0.5 * a;
    for (let i = 0; i < 3; i++) {
      const an = D.ga + (i * TAU) / 3, gx = x + Math.cos(an) * R * 1.02, gy = y + Math.sin(an) * R * 1.02, gr = R * (i === 0 ? 0.16 : 0.11);
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(D.ga * (i % 2 ? -3 : 3)); ctx.drawImage(gs, -gr, -gr, gr * 2, gr * 2); ctx.restore();
    }
  }
  // 바늘 (시 · 분 · 초)
  ctx.globalAlpha = 0.85 * a;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff4d0';
  ctx.lineWidth = Math.max(3, R * 0.035);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(D.hh) * R * 0.45, y + Math.sin(D.hh) * R * 0.45); ctx.stroke();
  ctx.lineWidth = Math.max(2, R * 0.02);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(D.hm) * R * 0.72, y + Math.sin(D.hm) * R * 0.72); ctx.stroke();
  ctx.strokeStyle = '#ff9a7a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x - Math.cos(D.hs) * R * 0.12, y - Math.sin(D.hs) * R * 0.12); ctx.lineTo(x + Math.cos(D.hs) * R * 0.82, y + Math.sin(D.hs) * R * 0.82); ctx.stroke();
  glowAt(ctx, x, y, R * 0.12, '#ffe6a8', a);
}
const CLOCK = {
  attack(g, world, tgt) {
    const A = g.def.attack;
    audio.sfx('clock_tick', { vol: 0.22, pitch: 1.7 });
    return runKind(g, world, tgt, { ...A, proj: drawGearProj, pw: 14, ph: 14 }, {});
  },
  assist(g, world, tgt) {
    const A = g.def.assist;
    audio.sfx('gear_whir', { vol: 0.35, pitch: 1.5 });
    return runKind(g, world, tgt, { ...A, proj: drawGearProj, pw: 24, ph: 24, speed: A.speed ?? 820 }, { assist: true });
  },
  skill(g, world, mul, o) {
    const sk = g.def.skill, lv = g.d?.lv ?? 1;
    let dur = Math.min(sk.timeMax ?? 2.6, (sk.time ?? 2) + (sk.timePerLv ?? 0.02) * (lv - 1));
    if (mul < 1) dur *= mul;   // 공명 (60%): 짧게. 유대 배율(>1)은 상한 2.6초를 넘기지 않는다
    world.timeStop = Math.max(world.timeStop || 0, dur);
    pose(g, 0.9, { x: g.cx, y: g.bottom - 10 });
    const V = viewRect(world), R = clamp(Math.min(V.w, V.h) * 0.42, 110, 260);
    keep(g, world.add(new GFx({
      x: V.x + V.w / 2 - R, y: V.y + V.h / 2 - R, w: R * 2, h: R * 2, life: dur, z: -4, owner: g,
      data: { R, hm: -Math.PI / 2, hh: -Math.PI / 2 + 1.1, hs: -Math.PI / 2, ga: 0, dur },
      follow(e, w) {
        const v = viewRect(w);
        e.x = v.x + v.w / 2 - e.w / 2; e.y = v.y + v.h / 2 - e.h / 2;
        if (!(w.timeStop > 0) && e.t > 0.25 && e.life > 0.3) e.life = 0.3;   // 누가 시간 정지를 끊었다 → 곧바로 흐려진다
      },
      tick(e, w, dt) {
        const D = e.data;
        if (e.t < 0.35) { D.hm -= 16 * dt; D.hh -= 1.4 * dt; D.hs -= 30 * dt; }    // 태엽을 거꾸로 감는다
        else if (e.life < 0.3) { D.hm += 5 * dt; D.hs += 12 * dt; }              // 다시 흐르기 시작
        D.ga += dt * 0.9;
      },
      onExpire(e, w) {
        audio.sfx('clock_tick', { vol: 0.7, pitch: 1.35 });
        w.fx?.ring(e.cx, e.cy, { color: '#ffd070', r0: e.data.R * 0.85, r1: e.data.R * 1.15, life: 0.3, width: 5 });
      },
      render: (ctx, e, w) => { if (!drew(GR.fxClockFace, ctx, e, w)) drawClockFace(ctx, e, w); },
    })));
    world.game?.flash?.('#ffe6a8', 0.35, 4);
    world.fx?.ring(g.cx, g.cy, { color: '#ffd070', r0: 6, r1: 70, life: 0.35, width: 4 });
    world.fx?.burst('gold', g.cx, g.cy, 12, { speed: 160 });
    audio.sfx('clock_tick', { vol: 0.9 });
    audio.sfx('bell', { vol: 0.3, pitch: 0.6 });
  },
};

// ───────────────────────── 모르스 (꼬마 사신) ─────────────────────────
/** 거두기: flat = 남은 체력 + 1. 성공하면 사신이 대상 옆으로 순간이동해 낫을 휘두르고 영혼이 터진다 */
function reap(g, world, e) {
  const P = g.def.passive ?? {}, col = g.def.color;
  if (!alive(e) || e.invuln || e.wakeInv > 0) return false;
  const atk = g.atk({ mv: 1, type: 'phys', element: 'dark', kb: [220, -280] }, { extra: { flat: Math.ceil(e.hp) + 1, hitstop: 0.03, shake: 2 } }, e);
  atk.tags.push('execute');
  const info = gHitOne(world, e, atk, e.cx, e.cy);
  if (!info) return false;
  const busy = g.act && (g.act.name === 'skill' || g.act.name === 'assist');
  if (!busy) {
    world.fx?.burst('dark', g.cx, g.cy, 6, { speed: 80 });
    const side = Math.sign(e.cx - (world.player?.cx ?? g.cx)) || 1;
    g.cx = e.cx + side * (e.w / 2 + 14); g.bottom = e.cy + g.h / 2; g.vx = 0; g.vy = 0; g.facing = -side;
    g.begin('blink', 0.35, { pos: true });
    g.setAnim('attack');
  }
  world.fx?.slash(e.cx, e.cy, g.facing > 0 ? 0.35 : Math.PI - 0.35, { len: 110, width: 16, color: col, life: 0.2, dir: g.facing, arc: 2.4 });
  world.fx?.burst('soul', e.cx, e.cy, 14, { speed: 200 });
  world.fx?.ring(e.cx, e.cy, { color: col, r0: 8, r1: 64, life: 0.3, width: 4 });
  world.fx?.text(e.cx, e.y - 20, P.text ?? '처형', { color: col, size: 22, life: 1.0, vy: -60, outline: '#06140a' });
  audio.sfx('soul_reap', { vol: 0.7 });
  audio.sfx('scythe', { vol: 0.5, pitch: 0.85 });
  return true;
}
function drawScytheSweep(ctx, e) {
  const D = e.data;
  if (e.t < D.wind) return;
  const a = Math.min(1, (1 - D.k) * 3 + 0.25) * clamp(e.life / 0.12, 0, 1);
  if (a <= 0.01) return;
  const H = e.h * 0.92, R = H * 0.62, ox = -H * 0.55;
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(e.cx, e.cy); ctx.scale(D.f, 1);
  ctx.globalAlpha = 0.3 * a; ctx.fillStyle = D.color;     // 낫날 (초승달)
  ctx.beginPath(); ctx.arc(ox, 0, R, -0.95, 0.95); ctx.arc(ox - 46, 0, R * 0.97, 0.95, -0.95, true); ctx.closePath(); ctx.fill();
  for (let i = 3; i >= 0; i--) {                         // 잔상 + 날
    ctx.globalAlpha = a * (i === 0 ? 0.95 : 0.42 - i * 0.1);
    ctx.strokeStyle = i === 0 ? '#eafff0' : D.color;
    ctx.lineWidth = i === 0 ? 4 : 20 - i * 4;
    ctx.beginPath(); ctx.arc(ox - i * 34, 0, R, -0.95, 0.95); ctx.stroke();
  }
}
const REAPER = {
  init(g) { g.mem.execCd = 0; g.mem.scanT = 0; },
  assist(g, world, tgt) {
    const A = g.def.assist, col = g.def.color;
    if (!alive(tgt)) return null;
    g.facing = Math.sign(tgt.cx - g.cx) || g.facing || 1;
    const r = g.frontRect(A.box?.w ?? 90, A.box?.h ?? 70, -10);
    g.strike(world, r, g.atk(A, { assist: true }, tgt));
    world.fx?.slash(g.cx + g.facing * 30, g.cy, g.facing > 0 ? 0.2 : Math.PI - 0.2, { len: 96, width: 14, color: col, life: 0.18, dir: g.facing, arc: 2.2 });
    audio.sfx('scythe', { vol: 0.5 });
    // 영혼 베기: 벤 뒤 체력이 문턱(20%) 이하인 일반 적은 그 자리에서 거둔다
    if (alive(tgt) && !isBoss(tgt, world) && tgt.kind === 'enemy' && tgt.hp / maxHpOf(tgt) <= (A.execute ?? 0.2)) reap(g, world, tgt);
    else g.begin('assist', 0.25, { pos: true });
    return g.act;
  },
  skill(g, world, mul, o) {
    const p = world.player, sk = g.def.skill, f = p.facing || 1, col = g.def.color;
    g.facing = f;
    pose(g, 0.75, { x: p.cx - f * 18, y: p.bottom - p.h - 24 });
    const wind = 0.18, sweep = 0.36, BW = 150;
    const atk = g.atk({ mv: sk.mv ?? 2.5, type: sk.type ?? 'phys', element: sk.element ?? 'dark', kb: [320, -320], stun: 0.4 }, { skill: true, mul, hitstop: 0.05, shake: 5 });
    const healPer = (sk.heal ?? 0.02) * mul, healCap = (sk.healMax ?? 0.2) * mul;
    const got = new Set();
    let healed = 0, hp = 0;
    const V = viewRect(world, 40);
    const xs0 = f > 0 ? V.x : V.x + V.w;
    world.add(new GFx({
      x: xs0 - BW / 2, y: V.y, w: BW, h: V.h, life: wind + sweep + 0.14, z: 12, owner: g,
      data: { f, k: 0, wind, color: col, px: null },
      follow(e, w) {
        const v = viewRect(w, 40), xs = f > 0 ? v.x : v.x + v.w, xe = f > 0 ? v.x + v.w : v.x;
        const k = clamp((e.t - wind) / sweep, 0, 1), ek = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
        e.data.k = k;
        e.x = lerp(xs, xe, ek) - BW / 2; e.y = v.y; e.h = v.h;
      },
      tick(e, w) {
        const D = e.data;
        if (e.t < wind) return;
        // 지난 프레임 위치부터 지금까지를 한 번에 (느린 기기에서 띠가 적을 건너뛰지 않게)
        const x0 = D.px ?? e.x, x1 = e.x;
        D.px = e.x;
        if (D.k >= 1 && e.t > wind + sweep + 0.02) return;
        gStrike(w, { x: Math.min(x0, x1), y: e.y, w: Math.abs(x1 - x0) + BW, h: e.h }, atk);
        for (const t of w.entities) {
          if ((t.kind !== 'enemy' && t.kind !== 'boss') || got.has(t) || !t._hits?.has?.(atk.hitId)) continue;
          got.add(t);
          w.fx?.burst('soul', t.cx, t.cy, 5, { speed: 160 });
          const pl = w.player;
          if (pl && !pl.dead) {
            w.fx?.emit('soul', t.cx, t.cy, { angle: Math.atan2(pl.cy - t.cy, pl.cx - t.cx), speed: 420, spread: 0.2 });
            if (healed < healCap - 1e-9) {
              const add = Math.min(healPer, healCap - healed);
              healed += add;
              hp += pl.heal(pl.stats.hp * add, false);
            }
          }
        }
      },
      onExpire(e, w) {
        const pl = w.player;
        if (hp > 0 && pl) { w.fx?.text(pl.cx, pl.y - 10, '+' + hp, { color: '#7ee07e', size: 20 }); w.fx?.burst('soul', pl.cx, pl.cy, 10, { speed: 90 }); }
      },
      render: (ctx, e, w) => { if (!drew(GR.fxScytheSweep, ctx, e, w)) drawScytheSweep(ctx, e, w); },
      light: { r: 220, color: col, i: 0.6 },
    }));
    world.game?.vignette?.('#0a3a1a', 0.4, 2.5);
    world.fx?.burst('soul', g.cx, g.cy, 12, { speed: 120 });
    audio.sfx('scythe', { vol: 0.9, pitch: 0.7, delay: wind * 0.6 });
    audio.sfx('soul_reap', { vol: 0.6, delay: wind + sweep * 0.5 });
  },
  passive(g, world, dt) {
    const P = g.def.passive, m = g.mem;
    if (!P) return;
    if (m.execCd > 0) { m.execCd -= dt; return; }
    if (calm(g)) return;
    m.scanT = (m.scanT ?? 0) - dt;
    if (m.scanT > 0) return;
    m.scanT = 0.1;
    const range = g.def.attack?.range ?? 340, below = P.below ?? 0.12;
    let best = null, bd = Infinity;
    for (const e of world.entities) {
      if (e.kind !== 'enemy' || !foe(world, e) || e.harmless || e.wakeInv > 0 || isBoss(e, world)) continue;
      if (!(e.hp > 0) || e.hp / maxHpOf(e) >= below) continue;
      const d = Math.hypot(e.cx - g.cx, e.cy - g.cy);
      if (d > range + e.w / 2 || d >= bd) continue;
      best = e; bd = d;
    }
    if (best && reap(g, world, best)) m.execCd = P.icd ?? 3;
  },
};

// ───────────────────────── 미라 (거울 요정) ─────────────────────────
function drawMirrorShard(ctx, pr, world) {
  if (drew(GB.fxMirrorShard, ctx, pr, world)) return;
  const orb = pr.behavior === 'orbit';
  const ang = orb ? (pr.orbitA ?? 0) : Math.atan2(pr.vy, pr.vx), s = pr.scale ?? 1;
  if (qOf(world) >= 0.95) { ctx.globalCompositeOperation = 'lighter'; glowAt(ctx, 0, 0, 16 * s, '#dff4ff', 0.6); ctx.globalCompositeOperation = 'source-over'; }
  ctx.rotate(ang + Math.PI / 2);
  ctx.fillStyle = 'rgba(232,246,255,0.92)'; ctx.strokeStyle = '#6a8ab8'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -9 * s); ctx.lineTo(4.5 * s, 1 * s); ctx.lineTo(0, 8 * s); ctx.lineTo(-4 * s, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-1.5 * s, -4 * s); ctx.lineTo(1.5 * s, 2 * s); ctx.stroke();
}
function drawKaleido(ctx, e, world) {
  const D = e.data, p = world.player;
  if (!p) return;
  const k = e.t / D.orbitT;
  if (k > 1.2) return;
  const a = Math.min(1, e.t / 0.15) * clamp((1.2 - k) / 0.3, 0, 1);
  const x = p.cx, y = p.cy, R = 72, rot = e.t * 1.6;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#dff4ff'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i <= 3; i++) {
      const an = rot + (j * Math.PI) / 3 + (i * TAU) / 3, px = x + Math.cos(an) * R, py = y + Math.sin(an) * R;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
  }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, R * 1.04, 0, TAU); ctx.stroke();
}
function drawMirrorPane(ctx, e) {
  const D = e.data, a = clamp(e.life / e.maxLife, 0, 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.45 * a; ctx.strokeStyle = '#dff4ff'; ctx.lineWidth = 1.5;   // 미라에게서 거울면까지 빛줄기
  ctx.beginPath(); ctx.moveTo(D.gx, D.gy); ctx.lineTo(e.cx, e.cy); ctx.stroke();
  ctx.translate(e.cx, e.cy); ctx.rotate(D.a);
  const hh = 22 + (1 - a) * 8;
  ctx.globalAlpha = 0.55 * a; ctx.fillStyle = '#b8d8ff'; ctx.fillRect(-3, -hh, 6, hh * 2);
  ctx.globalAlpha = 0.95 * a; ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -hh, 2, hh * 2);
}
/** 반사된 탄의 update (자기 속성으로 덮어쓴다): 쏜 적 쪽으로 휘어 날아가 gStrike 로만 때린다 */
function reflectedUpdate(dt, world) {
  const T = this.mTgt;
  if (T && (!alive(T) || T.invuln)) this.mTgt = null;
  else if (T && this.t > 0.04) {
    const want = Math.atan2(T.cy - this.cy, T.cx - this.cx);
    let cur = Math.atan2(this.vy, this.vx);
    const d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur)), tn = 9 * dt;
    cur += clamp(d, -tn, tn);
    this.vx = Math.cos(cur) * this.speed; this.vy = Math.sin(cur) * this.speed;
  }
  Object.getPrototypeOf(this).update.call(this, dt, world);   // 원래 탄 클래스의 이동·벽·꼬리 (적 쪽 판정은 빈 사각형)
  if (this.dead) return;
  this.attack.dir = Math.sign(this.vx) || this.attack.dir || 1;
  const n = gStrike(world, this.rect(), this.attack);
  if (n > 0) {
    this.hits += n;
    world.fx?.burst('ice', this.cx, this.cy, 6, { speed: 200 });
    if (this.hits >= this.pierce) this.dead = true;
  }
}
/** 적 탄을 쏜 적에게 되돌린다 (같은 탄 객체의 편을 바꾼다: team 'guardian' · attack.team 'player') */
function reflect(g, world, q) {
  const P = g.def.passive ?? {}, col = g.def.color;
  const own = q.attack?.owner ?? q.owner;
  let T = own && own !== world.player && foe(world, own) ? own : null;
  if (!T) T = nearestFoe(world, q.cx, q.cy, 700);
  const sp = clamp(Math.max(q.speed || 0, Math.hypot(q.vx || 0, q.vy || 0), 560), 560, 1100);
  const ang = T ? Math.atan2(T.cy - q.cy, T.cx - q.cx) : Math.atan2(-(q.vy || 0), -(q.vx || -1));
  // 거울면 연출 (새 진행 방향에 수직)
  world.add(new GFx({
    x: q.cx - 4, y: q.cy - 4, w: 8, h: 8, life: 0.26, z: 12, owner: g, data: { a: ang, gx: g.cx, gy: g.cy },
    render: (ctx, e, w) => { if (!drew(GB.fxMirrorPane, ctx, e, w)) drawMirrorPane(ctx, e, w); },
    light: { r: 70, color: col, i: 0.6 },
  }));
  q.team = 'guardian'; q.behavior = 'straight'; q.gravity = 0; q.returnTo = null; q.follow = null;
  q.onHit = null; q.onExpire = null; q.onWall = null; q.onLand = null;
  q.speed = sp; q.vx = Math.cos(ang) * sp; q.vy = Math.sin(ang) * sp;
  q.life = clamp(Math.max(q.life || 0, 1.2), 1.2, 2.2); q.maxLife = q.life; q.fadeOut = false;
  q.pierce = 1; q.hits = 0;
  q.hitRect = noHit;
  q.color = col; q.trail = 'ice'; q.trailRate = 0.05 / Math.max(0.3, qOf(world)); q.trailOpts = null;
  q.light = { r: 60, color: col, i: 0.55 };
  q.reflected = true; q.mTgt = T; q.owner = g;
  q.attack = g.atk({ mv: P.mv ?? 1.0, type: 'mag', element: null, kb: [240, -160] }, { proj: true }, T);
  q.attack.tags.push('reflect');
  q.update = reflectedUpdate;
  world.fx?.flash(q.cx, q.cy, { color: '#ffffff', size: 50, life: 0.12 });
  world.fx?.ring(q.cx, q.cy, { color: col, r0: 6, r1: 40, life: 0.25, width: 3 });
  world.fx?.burst('ice', q.cx, q.cy, 6, { speed: 180 });
  audio.sfx('mirror_chime', { vol: 0.4, pitch: 1.3 });
  audio.sfx('clang', { vol: 0.22, pitch: 1.7 });
  g.facing = Math.sign(q.cx - g.cx) || g.facing;
  flick(g);
}
/** 화면 안 적을 가까운 순으로 n 까지 (위협이 없는 적(harmless)은 모자랄 때만) */
function pickTargets(world, p, n) {
  const V = viewRect(world, 60), a = [], b = [];
  for (const e of world.entities) {
    if (!foe(world, e) || !overlap(e, V)) continue;
    (e.harmless ? b : a).push(e);
  }
  const by = (u, v) => Math.hypot(u.cx - p.cx, u.cy - p.cy) - Math.hypot(v.cx - p.cx, v.cy - p.cy);
  a.sort(by);
  if (a.length < n) { b.sort(by); a.push(...b); }
  return a.slice(0, n);
}
const MIRRA = {
  init(g) { g.mem.reflCd = 1.0; g.mem.scanT = 0; },
  skill(g, world, mul, o) {
    const p = world.player, sk = g.def.skill, col = g.def.color;
    const n = sk.count ?? 8, orbitT = sk.orbit ?? 1.0, spd = 980;
    pose(g, orbitT + 0.25, { x: p.cx - (p.facing || 1) * 20, y: p.bottom - p.h - 20 });
    const shards = [];
    for (let i = 0; i < n; i++) {
      const s = new GProj({
        x: p.cx, y: p.cy, vx: 0, vy: 0, w: 14, h: 14, behavior: 'orbit', owner: p, orbitR: 64, orbitSpeed: 6.5, orbitA: (i / n) * TAU,
        life: orbitT + 1.6, pierce: sk.pierce ?? 1, collideWalls: false, render: drawMirrorShard, color: col, gRect: noHit,
        light: i % 2 ? null : { r: 44, color: col, i: 0.4 },
        attack: g.atk({ mv: sk.mv ?? 0.9, type: sk.type ?? 'mag', element: sk.element ?? 'ice', kb: [220, -160] }, { skill: true, mul, hitstop: 0.02, shake: 2, proj: true }),
      });
      shards.push(world.add(s));
    }
    world.add(new GFx({
      x: p.x, y: p.y, w: p.w, h: p.h, life: orbitT + 1.7, z: 12, owner: g, data: { orbitT, launched: false },
      follow(e, w) { const pl = w.player; if (pl) { e.x = pl.x - 60; e.y = pl.y - 60; e.w = pl.w + 120; e.h = pl.h + 120; } },
      tick(e, w, dt) {
        const D = e.data, pl = w.player;
        if (!pl || pl.dead) { for (const s of shards) s.dead = true; e.dead = true; return; }
        if (!D.launched) {
          if (e.t < orbitT) return;
          D.launched = true;
          const tg = pickTargets(w, pl, n);
          shards.forEach((s, i) => {
            if (s.dead) return;
            const T = tg.length ? tg[i % tg.length] : null;
            const ang = T ? Math.atan2(T.cy - s.cy, T.cx - s.cx) : (s.orbitA ?? 0);
            s.behavior = 'straight'; s.gRect = null; s.mTgt = T;
            s.life = 1.4; s.maxLife = 1.4;
            s.speed = spd; s.vx = Math.cos(ang) * spd; s.vy = Math.sin(ang) * spd;
            s.trail = 'ice'; s.trailRate = 0.05 / Math.max(0.3, qOf(w));
          });
          w.fx?.ring(pl.cx, pl.cy, { color: col, r0: 20, r1: 110, life: 0.3, width: 4 });
          audio.sfx('mirror_chime', { vol: 0.7, pitch: 1.1 });
          audio.sfx('ice', { vol: 0.5, pitch: 1.3 });
          return;
        }
        // 날아가는 파편: 제 표적 쪽으로 휜다 (표적이 죽으면 가까운 적으로)
        let live = 0;
        for (const s of shards) {
          if (s.dead) continue;
          live++;
          let T = s.mTgt;
          if (!T || !foe(w, T)) T = s.mTgt = nearestFoe(w, s.cx, s.cy, 600);
          if (!T) continue;
          const want = Math.atan2(T.cy - s.cy, T.cx - s.cx);
          let cur = Math.atan2(s.vy, s.vx);
          const d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur)), tn = 14 * dt;
          cur += clamp(d, -tn, tn);
          s.vx = Math.cos(cur) * s.speed; s.vy = Math.sin(cur) * s.speed;
        }
        if (!live) e.dead = true;
      },
      render: (ctx, e, w) => { if (!drew(GB.fxKaleido, ctx, e, w)) drawKaleido(ctx, e, w); },
    }));
    world.fx?.burst('ice', p.cx, p.cy, 10, { speed: 160 });
    audio.sfx('mirror_chime', { vol: 0.5, pitch: 0.9 });
  },
  passive(g, world, dt) {
    const P = g.def.passive, m = g.mem;
    if (!P) return;
    if (m.reflCd > 0) { m.reflCd -= dt; return; }
    if (calm(g)) return;
    m.scanT = (m.scanT ?? 0) - dt;
    if (m.scanT > 0) return;
    m.scanT = 1 / 30;
    const q = nearShot(world, g, P.r ?? 80);
    if (!q) return;
    reflect(g, world, q);
    m.reflCd = P.every ?? 5;
  },
};

// ───────────────────────── 루멘 (등불 해파리) ─────────────────────────
function drawLumenFlash(ctx, e) {
  const D = e.data, t = e.t, k = clamp(t / 0.3, 0, 1), ek = 1 - (1 - k) * (1 - k) * (1 - k);
  const R = lerp(24, D.R, ek), a = clamp(1 - t / e.maxLife, 0, 1), x = e.cx, y = e.cy;
  if (a <= 0.01) return;
  ctx.globalCompositeOperation = 'lighter';
  glowAt(ctx, x, y, R, '#6fe8ff', 0.7 * a);
  glowAt(ctx, x, y, R * 0.35, '#ffffff', 0.9 * a * (1 - k * 0.6));
  ctx.globalAlpha = 0.8 * a; ctx.strokeStyle = '#e0fbff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, R * 0.8, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 0.45 * a; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU + t * 1.5; ctx.moveTo(x + Math.cos(an) * R * 0.2, y + Math.sin(an) * R * 0.2); ctx.lineTo(x + Math.cos(an) * R * 0.9, y + Math.sin(an) * R * 0.9); }
  ctx.stroke();
}
function drawBolts(ctx, e) {
  const S = e.data.segs, a = Math.min(1, e.life / 0.1);
  ctx.globalCompositeOperation = 'lighter';
  for (const [wd, col] of [[5, e.data.color], [1.8, '#ffffff']]) {
    ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.globalAlpha = 0.85 * a;
    ctx.beginPath();
    for (let i = 0; i < S.length; i += 4) {
      const x0 = S[i], y0 = S[i + 1], x1 = S[i + 2], y1 = S[i + 3];
      ctx.moveTo(x0, y0);
      for (let s = 1; s <= 5; s++) {
        const k = s / 5, j = s < 5 ? Math.sin(e.t * 90 + s * 2.3 + i) * 8 : 0;
        ctx.lineTo(lerp(x0, x1, k) + j, lerp(y0, y1, k) - j);
      }
    }
    ctx.stroke();
  }
}
function drawStunSparks(ctx, e, world) {
  const L = e.data.list, t = world?.time ?? e.t;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#bff8ff';
  for (let n = 0; n < L.length && n < 12; n++) {
    const en = L[n];
    if (!alive(en) || !(en.stun > 0.05)) continue;
    ctx.globalAlpha = Math.min(1, en.stun / 0.3) * 0.9;
    for (let i = 0; i < 3; i++) {
      const an = t * 5 + (i * TAU) / 3 + n, x = en.cx + Math.cos(an) * 13, y = en.y - 8 + Math.sin(an) * 4, s = 3.2;
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.35, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.35, y); ctx.closePath();
      ctx.moveTo(x - s, y); ctx.lineTo(x, y + s * 0.35); ctx.lineTo(x + s, y); ctx.lineTo(x, y - s * 0.35); ctx.closePath();
      ctx.fill();
    }
  }
}
const LUMEN = {
  skill(g, world, mul, o) {
    const p = world.player, sk = g.def.skill, col = g.def.color;
    pose(g, 0.6, { x: g.cx, y: g.bottom - 12 });
    const stunT = (sk.stun ?? 1.5) * Math.min(1, mul);
    const V = viewRect(world, 40);
    const base = { mv: sk.mv ?? 1.2, type: sk.type ?? 'mag', element: sk.element ?? 'thunder', kb: [160, -120] };
    const atkN = g.atk({ ...base, stun: stunT }, { skill: true, mul, hitstop: 0.04, shake: 4 });
    const atkB = g.atk(base, { skill: true, mul, hitstop: 0.04, shake: 4 });
    const segs = [], stunned = [];
    const list = world.enemies();
    for (const e of list) {
      if (!foe(world, e) || !overlap(e, V)) continue;
      const boss = isBoss(e, world);
      gHitOne(world, e, boss ? atkB : atkN, e.cx, e.cy);
      // 섬광 기절: 경직 저항·무게와 상관없이 정해진 시간 (보스 제외)
      if (!boss && e.kind === 'enemy' && alive(e)) { e.stun = Math.max(e.stun || 0, stunT); e.awake = true; stunned.push(e); }
      if (segs.length < 40) segs.push(g.cx, g.cy, e.cx, e.cy);
      world.fx?.burst('thunder', e.cx, e.cy, 6, { speed: 260 });
    }
    // 깊은 물: 숨을 가득 (world2 §14, GIMMICK-ENGINE 요청)
    const deep = world.gimmickOf?.('deep');
    if (deep && Number.isFinite(deep.air)) {
      deep.air = Math.max(deep.air, sk.air ?? 100);
      if (deep.headUnder) world.fx?.burst('water', p.cx, p.cy - 10, 12, { speed: 140 });
    }
    // 연출: 섬광 · 번개 줄기 · 기절 표시
    const R = Math.max(V.w, V.h) * 0.6;
    world.add(new GFx({
      x: g.cx - 40, y: g.cy - 40, w: 80, h: 80, life: 0.6, z: 12, owner: g, data: { R },
      follow(e) { e.x = g.cx - 40; e.y = g.cy - 40; },
      render: (ctx, e, w) => { if (!drew(GB.fxLumenFlash, ctx, e, w)) drawLumenFlash(ctx, e, w); },
      light: { r: 420, color: '#bff8ff', i: 0.9 },
    }));
    if (segs.length) {
      world.add(new GFx({
        x: V.x, y: V.y, w: V.w, h: V.h, life: 0.24, z: 12, owner: g, data: { segs, color: col },
        render: (ctx, e, w) => { if (!drew(GB.fxLumenBolts, ctx, e, w)) drawBolts(ctx, e, w); },
      }));
    }
    if (stunned.length && stunT > 0.1) {
      world.add(new GFx({
        x: V.x, y: V.y, w: V.w, h: V.h, life: stunT, z: 13, owner: g, data: { list: stunned, sparkT: 0 },
        follow(e, w) { const v = viewRect(w, 40); e.x = v.x; e.y = v.y; e.w = v.w; e.h = v.h; },
        tick(e, w, dt) {
          const D = e.data;
          if ((D.sparkT -= dt) > 0 || qOf(w) < 0.6) return;
          D.sparkT = 0.12;
          const en = D.list[Math.floor(Math.random() * D.list.length)];
          if (alive(en) && en.stun > 0.05) w.fx?.emit('thunder', en.cx + rand(-10, 10), en.cy + rand(-16, 10), { speed: 160 });
        },
        render: (ctx, e, w) => { if (!drew(GB.fxStunSparks, ctx, e, w)) drawStunSparks(ctx, e, w); },
      }));
    }
    world.game?.flash?.('#c8f8ff', 0.45, 3);
    world.fx?.ring(g.cx, g.cy, { color: col, r0: 10, r1: 160, life: 0.4, width: 6 });
    world.fx?.burst('thunder', g.cx, g.cy, 18, { speed: 380 });
    audio.sfx('thunderclap', { vol: 0.45, pitch: 1.3 });
    audio.sfx('thunder', { vol: 0.55 });
  },
};

// ───────────────────────── 모모 (꿈먹는 맥) ─────────────────────────
const mouth = (g) => ({ x: g.cx + (g.facing || 1) * g.w * 0.55, y: g.cy + 2 });
function drawMomoVortex(ctx, e) {
  const t = e.t, a = Math.min(1, t / 0.12) * clamp(e.life / 0.15, 0, 1), x = e.cx, y = e.cy;
  if (a <= 0.01) return;
  ctx.globalCompositeOperation = 'lighter';
  glowAt(ctx, x, y, 46, '#c060ff', 0.5 * a);
  ctx.strokeStyle = '#e8c8ff'; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = a * (0.75 - i * 0.18);
    const r = 14 + i * 11, s = -t * 9 - i * 2;
    ctx.beginPath(); ctx.arc(x, y, r, s, s + 4.2); ctx.stroke();
  }
}
function drawMorsel(ctx, e) {
  const k = clamp(e.t / e.maxLife, 0, 1), r = 7 * (1 - k * 0.7);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#2a1040'; ctx.strokeStyle = '#d080ff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(e.cx, e.cy, r, 0, TAU); ctx.fill(); ctx.stroke();
}
/** 적 탄 하나를 삼킨다: 탄은 조용히 사라지고 (onExpire 없음) 꿈 조각이 모모의 입으로 빨려 든다 */
function swallow(g, world, q, o = {}) {
  q.dead = true;
  const x0 = q.cx, y0 = q.cy;
  if (o.morsel !== false) {
    world.add(new GFx({
      x: x0 - 7, y: y0 - 7, w: 14, h: 14, life: 0.18, z: 12, owner: g, data: { text: o.text ?? null },
      follow(e) { const m = mouth(g), k = clamp(e.t / 0.18, 0, 1); e.x = lerp(x0, m.x, k) - 7; e.y = lerp(y0, m.y, k) - 7; },
      onExpire(e, w) {
        if (e.data.text) {
          w.fx?.text(g.cx, g.y - 6, e.data.text, { color: g.def.color, size: 14, life: 0.9, vy: -50 });
          audio.sfx('momo_gulp', { vol: 0.45, pitch: 1.25 });
        }
        w.fx?.burst('magic', e.cx, e.cy, 4, { speed: 60, color: g.def.color });
      },
      render: (ctx, e, w) => { if (!drew(GB.fxMorsel, ctx, e, w)) drawMorsel(ctx, e, w); },
    }));
  } else world.fx?.burst('magic', x0, y0, 4, { speed: 90, color: g.def.color });
}
/** 사각형 V 안의 적 탄을 모두 삼킨다 (광선·막을 수 없는 탄 제외). 삼킨 수 */
function swallowAll(g, world, V) {
  let n = 0;
  for (const q of world.entities) {
    if (q.kind !== 'projectile' || q.team !== 'enemy' || q.dead || q.behavior === 'beam' || q.unblockable) continue;
    if (!overlap(q, V)) continue;
    swallow(g, world, q, { morsel: n < 8 });
    n++;
  }
  return n;
}
/** 움직일 수 없는 적 (고정형·밀리지 않는 적) */
const immovable = (e) => !!e.def?.fixed || e.wclass === 'FIXED' || (e.def?.kbResist ?? 0) >= 1;
const MOMO = {
  init(g) { g.mem.eatCd = 1.0; g.mem.scanT = 0; },
  onEvent(g, world, name, d) {
    // 제 코로 문 적에게서 꿈 조각이 빨려 든다 (연출만)
    if (name !== 'hit' || d?.attack?.owner !== g || !d.target || qOf(world) < 0.6) return;
    const t = d.target, m = mouth(g), an = Math.atan2(m.y - t.cy, m.x - t.cx);
    world.fx?.emit('magic', t.cx, t.cy, { angle: an, spread: 0.3, speed: 260, color: g.def.color });
    world.fx?.emit('magic', t.cx, t.cy, { angle: an, spread: 0.3, speed: 200, color: '#f0e0ff' });
  },
  skill(g, world, mul, o) {
    const p = world.player, sk = g.def.skill, col = g.def.color;
    const pullT = sk.pullT ?? 1.0, dist = sk.pull ?? 200, speed = dist / Math.max(0.1, pullT);
    const front = () => ({ x: p.cx + (p.facing || 1) * 48, y: p.bottom - p.h * 0.45 });
    pose(g, pullT + 0.25, front(), { speed: 900, step(gg, w, dt, a) { a.goal = front(); gg.facing = p.facing || 1; } });
    const budget = new Map();
    const V0 = viewRect(world, 30);
    for (const e of world.enemies()) {
      if (!foe(world, e) || isBoss(e, world) || e.kind !== 'enemy' || immovable(e) || !overlap(e, V0)) continue;
      budget.set(e, dist);
    }
    let eaten = 0;
    const room = world.roomId;
    keep(g, world.add(new GFx({
      x: g.cx - 30, y: g.cy - 30, w: 60, h: 60, life: pullT + 0.02, z: 12, owner: g, data: { streakT: 0 },
      follow(e) { const m = mouth(g); e.x = m.x - 30; e.y = m.y - 30; },
      tick(e, w, dt) {
        const pl = w.player;
        if (!pl || pl.dead) { e.dead = true; return; }
        if (w.roomId !== room) budget.clear();   // 방이 바뀌었다: 끌어당길 적이 없다 (회복은 그대로)
        eaten += swallowAll(g, w, viewRect(w, 30));
        // 끌어당기기: 주인 앞 간격(70px + 몸 절반)까지만 — 접촉 피해가 나지 않게
        const m = w.map;
        for (const [en, left] of budget) {
          if (!alive(en) || left <= 0) { budget.delete(en); continue; }
          const side = Math.sign(en.cx - pl.cx) || 1, gap = 70 + en.w / 2 + pl.w / 2;
          const over = side * (en.cx - (pl.cx + side * gap));   // 간격 밖으로 벗어난 거리
          if (over <= 1) { budget.delete(en); continue; }
          const step = Math.min(over, speed * dt, left);
          const nx = en.x - side * step, edge = side > 0 ? nx : nx + en.w;
          const blocked = !!m && (m.isSolidPx?.(edge, en.y + en.h * 0.5) || (!en.noGravity && m.isSolidPx?.(edge, en.bottom - 6)));
          if (blocked) { budget.delete(en); continue; }
          en.x = nx;
          if (en.noGravity) {   // 날아다니는 적은 주인 높이로도
            const dy = pl.cy - 10 - en.cy, sy = Math.min(Math.abs(dy), speed * 0.6 * dt);
            if (Math.abs(dy) > 4 && !(m?.isSolidPx?.(en.cx, en.cy + Math.sign(dy) * (en.h / 2 + sy)))) en.y += Math.sign(dy) * sy;
            en.vy = 0;
          }
          en.vx = 0; en.kbT = 0; en.awake = true;
          en.stun = Math.max(en.stun || 0, 0.3);   // 끌려오는 동안 AI 정지
          budget.set(en, left - step);
        }
        // 빨려 드는 꿈 줄기
        const D = e.data;
        if ((D.streakT -= dt) <= 0) {
          D.streakT = 0.045 / Math.max(0.35, qOf(w));
          const mo = mouth(g), an = rand(0, TAU), r = rand(110, 190), sx = mo.x + Math.cos(an) * r, sy = mo.y + Math.sin(an) * r;
          w.fx?.speedLine?.(sx, sy, an + Math.PI, { len: 28, width: 2, color: rand(0, 1) < 0.5 ? col : '#f0e0ff', life: 0.24, speed: r / 0.22 });
        }
      },
      onExpire(e, w) {
        const pl = w.player;
        if (!pl || pl.dead) return;
        pl.heal(pl.stats.hp * (sk.heal ?? 0.1) * mul, true);
        w.fx?.text(g.cx, g.y - 10, '꺼억!', { color: col, size: 18, life: 1.0, vy: -60, outline: '#1a0610' });
        w.fx?.ring(g.cx, g.cy, { color: col, r0: 8, r1: 60, life: 0.35, width: 4 });
        w.fx?.burst('magic', pl.cx, pl.cy, 14, { speed: 140, color: '#f0e0ff' });
        audio.sfx('momo_gulp', { vol: 0.8, pitch: 0.85 });
        void eaten;
      },
      render: (ctx, e, w) => { if (!drew(GB.fxMomoVortex, ctx, e, w)) drawMomoVortex(ctx, e, w); },
      light: { r: 110, color: col, i: 0.5 },
    })));
    audio.sfx('mist', { vol: 0.5, pitch: 0.6 });
  },
  passive(g, world, dt) {
    const P = g.def.passive, m = g.mem;
    if (!P) return;
    if (m.eatCd > 0) { m.eatCd -= dt; return; }
    if (calm(g)) return;
    m.scanT = (m.scanT ?? 0) - dt;
    if (m.scanT > 0) return;
    m.scanT = 1 / 30;
    const q = nearShot(world, g, P.r ?? 120);
    if (!q) return;
    g.facing = Math.sign(q.cx - g.cx) || g.facing;
    swallow(g, world, q, { text: P.text ?? '꺼억' });
    flick(g);
    m.eatCd = P.every ?? 6;
  },
};

/** 틱톡 · 모르스 · 미라 · 루멘 · 모모 (guardian.js aiFor 가 GUARDIAN_AI 다음으로 찾는다) */
export const GUARDIAN_AI_B = { gd_clock: CLOCK, gd_reaper: REAPER, gd_mirra: MIRRA, gd_lumen: LUMEN, gd_momo: MOMO };
// GHit 는 연출 개체가 타격도 해야 할 때를 위해 남겨 둔다 (지금은 GFx + gStrike 로 충분)
void GHit;
