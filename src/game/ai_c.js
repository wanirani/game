// 2부 적 AI 종류 C (s14 거울의 성 · s15 영겁의 용광로 · s16 가라앉은 성소; world2 §5.3) — owner: ENEMY-P2-C-AI
// AI_C[name] = { init(e), update(e, world, dt), onHit?(e, world, attack, info), onDie?(e, world) }. game/ai.js 가
// Object.assign(AI, AI_A, AI_B, AI_C, AI_D) 로 합친다. 재사용 종류(swordsman · wraith · shadow · knight)는 AI 코드 없음.
//
// 규칙 (ai_b.js 와 같음)
//  · 모든 공격은 예비동작(애니메이션 + 반짝임/경고선/경고 장판)을 거친 뒤 발동. 쿨다운은 e.aggro(난이도 공격성)로 나눈다.
//  · 순환 import: ai.js ↔ ai_b.js ↔ ai_c.js — 가져온 값(Zone 등)은 함수 안에서만 쓴다 (모듈 최상위에서 extends 하지 않는다).
//  · 피격 반응(FEEL-REACT, game/enemy.js): 경직·다운·각성 정지 동안 update 가 불리지 않고 stateT·animT 도 멈춘다.
//    예비동작 상태 이름은 data/feel_hit.js COUNTER.states 에 든 것('windup' 'aim' 'cast' 'throw' 'spit' 'sweep' 'slam'
//    'gather' 'dive' 'lunge' 'bite')을 쓰고, 시작할 때 e.didHit = false → 그 사이에 맞으면 COUNTER, 경직을 받으면
//    enemy.breakAttack 이 didHit = true 로 바꿔 그 일격은 나가지 않는다 (각 상태는 시간이 다 되면 스스로 끝난다).
//    무거운 적(HEAVY: 쇳물 골렘 · 사슬 간수)은 예비동작 중 슈퍼아머라 끊기지 않는다.
//  · 공격 장판(Zone)은 world.freezeEnemies(각성 연출) 동안 적 투사체처럼 멈춘다 (zoneCls).
//
// 렌더 계약 (ENEMY-P2-C-ART: render/enemies_c.js RENDER_C · PROJ_C · ZONE_C). 원점·flash 규칙은 render/enemies.js.
//  공통: e.anim / e.animT (아래 이름), e.state, e.alpha.
//  chandelier  'hang' 'shake' 'fall' 'shatter' 'crawl' 'spit' · e.anchorY(천장 y, 매달려 있을 때만 — 첫 갱신 전에는 'hang' 이어도 null) · e.sway(rad) · e.broken(촛대 다리 모드)
//  forgeimp    'fly' 'cast'(대갈못) 'aim' 'dive' · e.aimX/e.aimY(급강하 목표)
//  slag        'idle' 'walk' 'windup' 'slam' 'spit' · e.glow(0..1 팔을 든 채 달아오름)
//  chainhook   'idle' 'walk' 'aim' 'throw' 'reel' 'smash'(상태 'slam') 'sweep' · e.hook(갈고리 장판, 사슬은 ZONE_C.hook 이 그린다)
//  bellows     'idle' 'inhale' 'blow' · e.inflate(0..1 부풂)
//  swimmer     'swim' 'bite'(예비동작·돌진 모두 턱을 벌림) 'leap' 'flop' · e.inWater · e.lure(0..1 초롱불 번쩍임)
//  tidecaller  'idle' 'walk' 'cast'(물기둥·물방울) 'bless'(치유)
//  siren       'float' 'sing' 'dive'(겨냥·급강하) 'vanish' 'appear'
//  PROJ_C 키 (ctx, p, world; 원점 = 투사체 중심): rivet flamebit candle glob bubble
//  ZONE_C 키 (ctx, z, world; 월드 좌표): burn magma hook flamecone geyser songring warnline floorwarn
//  ZONE_C/PROJ_C 에 없으면 이 파일의 임시 그림(SI)이나 ZONE_B/PROJ_RENDER 로 그린다 (그리는 순간에 찾으므로 나중에 채워도 된다).
import { rand, chance, clamp, angleTo, TAU, overlap } from '../core/math.js';
import { audio } from '../core/audio.js';
import { isSolidType, T, touchesType } from '../core/physics.js';
import { TILE } from '../core/game.js';
import { hitTarget } from './combat.js';
import { Zone } from './ai_b.js';
import { PROJ_RENDER } from './projectiles.js';
import { ENEMY_VEC } from '../render/enemies.js';   // 벡터 그림은 늦게 받는다 (R1-REQ-229): ENEMY_VEC.b/.c 를 그리는 순간에 찾는다

const PI = Math.PI;
let _zid = 0;
/** 고유 타격 ID (같은 ID 로는 대상당 1회만 맞으므로 공격마다 새로 발급) */
const nid = (k = 'c') => k + (++_zid);

// ───────────────────────── 장판 (Zone + 각성 정지) ─────────────────────────
let _ZoneC = null;
/** Zone 에 world.freezeEnemies 정지를 더한 클래스. 순환 import 때문에 처음 쓸 때 만든다 */
function zoneCls() {
  if (_ZoneC) return _ZoneC;
  _ZoneC = class ZoneC extends Zone {
    update(dt, world) {
      if (world.freezeEnemies) return;   // 각성 연출: 적 투사체와 같이 경고·판정 모두 멈춘다
      super.update(dt, world);
    }
  };
  return _ZoneC;
}
function addZone(world, o) { const K = zoneCls(); const z = new K(o); world.add(z); return z; }
/** 경고 표시 전용 장판 (피해 없음). 주인이 그 상태를 벗어나거나 경직·다운·사망하면 곧바로 사라진다 */
function warnZone(e, world, o) {
  const st = e.state;
  return addZone(world, {
    noHit: true, delay: 0, owner: e, z: 4, ...o,
    follow: (z, w, dt) => {
      if (e.dead || e.dying > 0 || e.state !== st || e.stun > 0 || e.down > 0) { z.dead = true; return; }
      o.follow?.(z, w, dt);
    },
  });
}
/** 장판 판정: 겹치면 넉백 방향을 장판 가운데에서 바깥쪽으로 */
function pushOut(z, w) {
  const p = w.player;
  if (!p || p.dead || !overlap(z, p.hurtbox())) return false;
  z.attack.dir = Math.sign(p.cx - z.cx) || 1;
  return true;
}

// ───────────────────────── 공용 도우미 (ai_b.js 에서 복사) ─────────────────────────
function ensureMag(e) { if (e.stats.mag == null) e.stats.mag = e.stats.atk; }
function atk(e, mv, extra) { ensureMag(e); return { owner: e, stats: e.stats, mv, dir: e.facing, ...extra }; }
function hover(e, tx, ty, accel, dt, maxSp) {
  const dx = tx - e.cx, dy = ty - e.cy, d = Math.hypot(dx, dy) || 1;
  const sp = Math.min(maxSp, d * 3);
  const k = Math.min(1, accel * dt);
  e.vx += (dx / d * sp - e.vx) * k;
  e.vy += (dy / d * sp - e.vy) * k;
}
function seesP(e, p, sight, dy = 170) { return !!p && !p.dead && Math.abs(p.cx - e.cx) < sight && Math.abs(p.cy - e.cy) < dy; }
function faceP(e) { const d = e.dxToPlayer(); if (Math.abs(d) > 3) e.facing = Math.sign(d); }
function canMove(e, dir) {
  if (!e.onGround) return true;
  const f = e.facing; e.facing = dir;
  const ok = e.groundAhead() && !e.wallAhead();
  e.facing = f;
  return ok;
}
/** 지상 이동 (낭떠러지·벽 앞에서 정지). dir 0 = 멈춤 */
function chase(e, dir, sp) {
  if (!dir) { e.vx = 0; return; }
  e.vx = dir * sp;
  if (e.onGround && !canMove(e, dir)) e.vx = 0;
}
function patrol(e, mul = 0.6) {
  e.vx = e.facing * e.speed * mul;
  if (e.onGround && (!e.groundAhead() || e.wallAhead())) e.facing *= -1;
}
function solidAt(world, x, y) { return isSolidType(world.map.typeAtPx(x, y)); }
/** 아래쪽 첫 지면(고체/발판) 윗면 y */
function groundTop(world, x, y, maxDist = 520) {
  const m = world.map;
  const tx = Math.floor(x / TILE);
  for (let ty = Math.floor(y / TILE), n = 0; n < maxDist / TILE; ty++, n++) {
    const t = m.typeAt(tx, ty);
    if (isSolidType(t) || t === T.ONEWAY) return ty * TILE;
    if (ty >= m.h) return null;
  }
  return null;
}
const isLiquidPx = (world, x, y) => world.map.typeAtPx(x, y) === T.LIQUID;
/** 포물선 투척 수평속도: 초기 vy0(음수), 중력 g(px/s²) 으로 (dx,dy) 에 도달 */
function arcVx(dx, dy, vy0, g, maxVx = 520) {
  const disc = vy0 * vy0 + 2 * g * dy;
  const t = disc > 0 ? (-vy0 + Math.sqrt(disc)) / g : 0.8;
  return clamp(dx / Math.max(0.28, t), -maxVx, maxVx);
}
/** (x,y) 에서 각도 a 로 벽에 닿을 때까지의 길이 */
function rayLen(world, x, y, a, max = 900) {
  const cx = Math.cos(a), cy = Math.sin(a);
  for (let d = 12; d < max; d += 12) if (solidAt(world, x + cx * d, y + cy * d)) return d;
  return max;
}
/** 사각형이 벽 타일과 겹치지 않는가 */
function rectFree(world, x, y, w, h) {
  const m = world.map;
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isSolidType(m.typeAt(tx, ty))) return false;
  return true;
}
function sideFor(e, world, p, keep, dy = -110) {
  const ok = (sd) => { const x = p.cx + sd * keep, y = p.bottom + dy; return x > 30 && x < world.map.pxW - 30 && !solidAt(world, x, y); };
  if (!ok(e.side) && ok(-e.side)) e.side = -e.side;
  return e.side;
}
function puff(world, type, x, y, n, o) { world.fx.burst(type, x, y, n, o); }
/** 품질 배율을 따르는 확률 파티클 한 알 */
function spark(world, type, x, y, p, o) { if (Math.random() < p * (world.fx.quality ?? 1)) world.fx.emit(type, x, y, o); }
/** 마법(피해 계산 res) 투사체 */
function bolt(e, o) {
  ensureMag(e);
  return e.shoot({ life: 3, ...o, attack: { mv: 1, type: 'mag', ...(o.attack || {}) } });
}
/** 투사체가 바닥에 박혔을 때 그 칸 윗면 y (옆벽·천장이면 null) */
function landY(world, pr) {
  if (!(pr.vy > 0)) return null;
  const ty = Math.floor(pr.cy / TILE), tx = Math.floor(pr.cx / TILE);
  if (isSolidType(world.map.typeAt(tx, ty - 1))) return null;
  return ty * TILE;
}
function stillHere(e) { return !e.dead && !(e.dying > 0); }

// ───────────────────────── 임시 그림 (ENEMY-P2-C-ART 의 ZONE_C/PROJ_C 가 오기 전까지) ─────────────────────────
const GLOW_FIRE = '#ff8228', GLOW_WATER = '#78d2ff';
/** 은은한 빛 (캔버스·그라디언트 없이 반투명 원 두 겹 — 플레이 도중 새 캔버스를 만들지 않는다, MASTER_PLAN §5.2) */
function glowAt(ctx, x, y, r, col, a = 1) {
  const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = col;
  ctx.globalAlpha = ga * a * 0.18; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.globalAlpha = ga * a * 0.22; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.fill();
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
}
const SI = {
  /** 경고선: 점선이 짙어지다가 끝무렵 깜빡인다. data {x0,y0,x1,y1,color} */
  warnline(ctx, z) {
    const d = z.data; if (d?.x0 == null) return;
    const k = clamp(z.liveK, 0, 1), blink = k > 0.7 ? (Math.sin(z.t * 50) > 0 ? 1 : 0.4) : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.3 + 0.6 * k) * blink;
    ctx.strokeStyle = d.color ?? '#ff3c46'; ctx.lineWidth = 1 + 2 * k;
    ctx.setLineDash([10, 6]); ctx.lineDashOffset = -z.t * 80;
    ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = d.color ?? '#ff3c46';
    ctx.beginPath(); ctx.arc(d.x1, d.y1, 3 + 5 * k, 0, TAU); ctx.fill();
    ctx.restore();
  },
  /** 바닥 경고: 발밑 붉은 띠가 차오른다 */
  floorwarn(ctx, z) {
    const k = clamp(z.liveK, 0, 1), blink = k > 0.7 ? (Math.sin(z.t * 46) > 0 ? 1 : 0.5) : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.18 + 0.35 * k) * blink;
    ctx.fillStyle = z.data?.color ?? '#ff3040';
    const h = Math.max(4, z.h * (0.25 + 0.75 * k));
    ctx.fillRect(z.x, z.y + z.h - h, z.w, h);
    ctx.globalAlpha = (0.5 + 0.5 * k) * blink;
    ctx.fillRect(z.x, z.y + z.h - 3, z.w, 3);
    ctx.restore();
  },
  /** 쇳물 웅덩이 */
  magma(ctx, z) {
    const fade = z.active ? clamp(z.life / 0.5, 0, 1) : z.warnK;
    const cx = z.cx, by = z.y + z.h, w = z.w / 2, t = z.t + (z.data?.seed ?? 0);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#7a1604'; ctx.beginPath(); ctx.ellipse(cx, by - 5, w, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff5a1a'; ctx.beginPath(); ctx.ellipse(cx, by - 5, w * 0.82, 5, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffc050'; ctx.beginPath(); ctx.ellipse(cx + Math.sin(t * 2) * w * 0.2, by - 6, w * 0.45, 2.6, 0, 0, TAU); ctx.fill();
    glowAt(ctx, cx, by - 8, w * 1.2, GLOW_FIRE, 0.45);
    for (let i = 0; i < 2; i++) {
      const u = (t * 1.3 + i * 0.5) % 1;
      ctx.strokeStyle = `rgba(255,210,120,${0.8 * (1 - u)})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx + (i ? 0.4 : -0.35) * w, by - 7 - u * 6, 1.5 + u * 3, PI, TAU); ctx.stroke();
    }
    ctx.restore();
  },
  /** 대갈못이 떨어진 자리의 불 */
  burn(ctx, z) {
    const fade = clamp(z.life / 0.4, 0, 1), cx = z.cx, by = z.y + z.h, t = z.t;
    ctx.save(); ctx.globalAlpha = fade; ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, cx, by - 6, 26, GLOW_FIRE, 0.5);
    for (let i = 0; i < 3; i++) {
      const h = 8 + 5 * Math.sin(t * 17 + i * 2.1), x = cx - 10 + i * 10;
      ctx.fillStyle = i === 1 ? '#ffd070' : '#ff7a2a';
      ctx.beginPath(); ctx.moveTo(x - 4, by); ctx.quadraticCurveTo(x - 2, by - h * 0.6, x + Math.sin(t * 11 + i) * 2, by - h); ctx.quadraticCurveTo(x + 3, by - h * 0.5, x + 4, by); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },
  /** 갈고리 사슬: 손(d.hx, d.hy) → 갈고리 */
  hook(ctx, z) {
    const d = z.data; if (d?.hx == null) return;
    const x = z.cx, y = z.cy, dir = d.dir || 1;
    ctx.save();
    ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(d.hx, d.hy); ctx.lineTo(x, y); ctx.stroke();
    ctx.strokeStyle = '#8a8078'; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -d.dist * 0.5;
    ctx.beginPath(); ctx.moveTo(d.hx, d.hy); ctx.lineTo(x, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.strokeStyle = '#1a1614'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(2, 0, 9, -PI * 0.5, PI * 0.75); ctx.stroke();
    ctx.strokeStyle = d.hooked ? '#ff6a4a' : '#c8c0b4'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(2, 0, 9, -PI * 0.5, PI * 0.75); ctx.stroke();
    ctx.fillStyle = '#c8c0b4'; ctx.beginPath(); ctx.moveTo(-5, 6); ctx.lineTo(-11, 2); ctx.lineTo(-4, 1); ctx.fill();
    ctx.restore();
  },
  /** 풀무의 부채꼴 불길 */
  flamecone(ctx, z) {
    const d = z.data; if (!d || d.len <= 1) return;
    const fade = clamp(z.life / 0.2, 0, 1), dir = d.dir, L = d.len, hh = 14 + (d.H / 2 - 14) * (L / d.L), t = z.t;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade;
    ctx.translate(d.mx, d.my); ctx.scale(dir, 1);
    const wob = Math.sin(t * 30) * 4;
    ctx.fillStyle = 'rgba(255,90,20,0.45)';
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(L * 0.6, -hh - wob, L, -hh * 0.7); ctx.lineTo(L, hh * 0.7); ctx.quadraticCurveTo(L * 0.6, hh + wob, 0, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,170,60,0.55)';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(L * 0.5, -hh * 0.55, L * 0.85, 0); ctx.quadraticCurveTo(L * 0.5, hh * 0.55, 0, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,190,0.6)';
    ctx.beginPath(); ctx.ellipse(L * 0.2, 0, L * 0.22, 5, 0, 0, TAU); ctx.fill();
    glowAt(ctx, L * 0.45, 0, hh * 1.6, GLOW_FIRE, 0.4);
    ctx.restore();
  },
  /** 세이렌의 노래 파문 (틈 하나) */
  songring(ctx, z) {
    const d = z.data; if (!d) return;
    const fade = clamp(z.life / 0.25, 0, 1), a0 = d.gapA + d.gap / 2, a1 = d.gapA - d.gap / 2 + TAU;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(120,210,255,0.35)'; ctx.lineWidth = d.th;
    ctx.beginPath(); ctx.arc(d.cx, d.cy, d.r, a0, a1); ctx.stroke();
    ctx.strokeStyle = 'rgba(230,250,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(d.cx, d.cy, d.r, a0, a1); ctx.stroke();
    ctx.restore();
  },
  // ── 투사체 (원점 = 투사체 중심) ──
  rivet(ctx, p) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, 0, 0, 14, GLOW_FIRE, 0.7);
    ctx.rotate(p.rot || 0);
    ctx.fillStyle = '#ffb050'; ctx.fillRect(-6, -2.5, 12, 5);
    ctx.fillStyle = '#fff2c0'; ctx.fillRect(-3, -1.2, 7, 2.4);
    ctx.fillStyle = '#ff7a2a'; ctx.fillRect(-7, -4, 3, 8);
    ctx.restore();
  },
  flamebit(ctx, p) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, 0, 0, 16, GLOW_FIRE, 0.7);
    const f = 1 + Math.sin(p.t * 30) * 0.12;
    ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.ellipse(0, 1, 5 * f, 7 * f, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe8a0'; ctx.beginPath(); ctx.ellipse(0, 2, 2.4, 3.6, 0, 0, TAU); ctx.fill();
    ctx.restore();
  },
  glob(ctx, p) {
    ctx.save();
    glowAt(ctx, 0, 0, 22, GLOW_FIRE, 0.6);
    const r = p.w * 0.5;
    ctx.fillStyle = '#3a1206'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff5a1a'; ctx.beginPath(); ctx.arc(-1, -1, r * 0.78, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffd070'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.35, 0, TAU); ctx.fill();
    ctx.restore();
  },
  bubble(ctx, p) {
    const r = p.w * 0.5 * (1 + Math.sin(p.t * 9) * 0.05);
    ctx.save();
    glowAt(ctx, 0, 0, r * 1.6, GLOW_WATER, 0.35);
    ctx.fillStyle = 'rgba(110,190,240,0.18)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(200,245,255,0.85)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.7, -PI * 0.85, -PI * 0.55); ctx.stroke();
    ctx.restore();
  },
};
/** 장판 그리기: ZONE_C[name] → fb (그리는 순간에 찾는다) */
const zr = (name, fb) => (ctx, z, w) => (ENEMY_VEC.c?.ZONE_C?.[name] ?? fb)?.(ctx, z, w);
/** 투사체 그리기: PROJ_C[name] → fb */
const pr = (name, fb) => (ctx, p, w) => (ENEMY_VEC.c?.PROJ_C?.[name] ?? fb)?.(ctx, p, w);
const fireball = (ctx, p, w) => PROJ_RENDER.fireball?.(ctx, p, w);
const pillar = (ctx, z, w) => ENEMY_VEC.b?.ZONE_B?.pillar?.(ctx, z, w);

/** 쇳물 웅덩이 (슬래그 골렘): 발 근처 바닥에만 둔다. yRef = 기준 바닥 y */
function magmaPuddle(e, world, x, yRef, life, mv) {
  if (x < 8 || x > world.map.pxW - 8) return null;
  const gy = groundTop(world, x, yRef - 30, 170);
  if (gy == null || Math.abs(gy - yRef) > 110 || solidAt(world, x, gy - 8)) return null;
  return addZone(world, {
    x: x - 30, y: gy - 16, w: 60, h: 16, life, owner: e, z: 3, render: zr('magma', SI.magma),
    light: { r: 60, color: '#ff6a1a', i: 0.55 }, data: { seed: rand(0, 10) }, hitTest: pushOut,
    attack: atk(e, mv, { type: 'mag', element: 'fire', rehit: 0.35, hitId: nid('sp'), kb: [160, -320], tags: ['magic'] }),
  });
}

export const AI_C = {};

// ═════════════════════════ s14 거울의 성 ═════════════════════════
/** 샹들리에 마귀: 천장에 매달림 → 발밑을 지나가면 흔들리다 떨어져 산산조각(광역·불씨) → 촛대 다리로 기며 촛불을 뱉는다 */
AI_C.chandelier = {
  init(e) {
    e.noGravity = true; e.hung = false; e.broken = false; e.anchorY = null; e.sway = 0;
    e.cool = rand(0.6, 1.4);
    e.setState('hang'); e.setAnim('hang');
  },
  /** 첫 갱신 때 위로 올라가 천장(≤ 6칸)에 매단다. 천장이 없으면 처음부터 기어 다닌다 */
  attach(e, world) {
    e.hung = true;
    const m = world.map, tx = Math.floor(e.cx / TILE), r0 = Math.floor((e.y + 6) / TILE);
    for (let k = 0; k <= 6; k++) {
      const ty = r0 - k;
      if (ty < 0) break;
      if (isSolidType(m.typeAt(tx, ty))) {
        e.anchorY = (ty + 1) * TILE; e.anchorTx = tx; e.anchorTy = ty;
        e.y = e.anchorY + 4; e.vx = 0; e.vy = 0; e.noGravity = true;
        return;
      }
    }
    e.anchorY = null; e.noGravity = false; e.broken = true;
    e.setState('crawl'); e.setAnim('crawl');
  },
  /** 흔들림 끝 → 낙하 */
  drop(e) {
    e.setState('fall'); e.setAnim('fall');
    e.anchorY = null; e.noGravity = false; e.gravity = 1.6; e.vx = 0; e.vy = 40;
    e.fallId = nid('cf');
    e.harmless = true;   // 떨어지는 동안의 몸통 판정은 AI 가 mv 1.4 로 직접 한다 (기본 접촉 피해 mv 1 이 먼저 맞히지 않게)
  },
  /** 착지: 220×80 광역 화염 + 불씨 6개 → 기어 다니는 모드 */
  shatter(e, world) {
    const P = e.params;
    e.setState('shatter'); e.setAnim('shatter');
    e.broken = true; e.vx = 0; e.sway = 0; e.gravity = 1; e.harmless = false;
    e.strike(-110, -80, 220, 80, P.shatterMv ?? 1.4, { hitId: nid('cs'), element: 'fire', kb: [340, -520], hitstop: 0.07 });
    for (let i = 0; i < 6; i++) {
      const a = -PI / 2 + (i - 2.5) * 0.36 + rand(-0.08, 0.08), s = rand(260, 360);
      bolt(e, {
        x: e.cx + Math.cos(a) * 10, y: e.bottom - 22, vx: Math.cos(a) * s, vy: Math.sin(a) * s, w: 12, h: 14,
        behavior: 'arc', gravity: 1, life: 1.6, render: pr('flamebit', SI.flamebit), trail: 'ember', trailRate: 0.08,
        light: { r: 40, color: '#ffb050', i: 0.6 }, attack: { mv: P.bitMv ?? 0.7, element: 'fire', kb: [200, -260] },
      });
    }
    const fx = world.fx;
    puff(world, 'shard', e.cx, e.bottom - 20, 18, { color: '#e8f4ff', speed: 300 });
    puff(world, 'fire', e.cx, e.bottom - 10, 12, { speed: 160, jitter: 30 });
    if (fx.ering) fx.ering(e.cx, e.bottom - 4, { color: '#ffd9a0', r0: 10, r1: 120, ry: 0.28, life: 0.35, width: 5 });
    else fx.ring(e.cx, e.bottom - 8, { color: '#ffd9a0', r0: 10, r1: 110, life: 0.35, width: 5 });
    world.camera.shake(6, 0.25);
    audio.sfx('break_wall', { vol: 0.8, pitch: 1.3 }); audio.sfx('fire', { vol: 0.6 });
  },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!e.hung) this.attach(e, world);
    e.cool -= dt * e.aggro;
    switch (e.state) {
      case 'hang': {
        e.vx = 0; e.vy = 0; e.setAnim('hang');
        e.sway = Math.sin(e.t * 1.7) * 0.05;
        // 거울 뒤집기 등으로 매달린 천장이 사라지면 곧바로 떨어진다
        if (!isSolidType(world.map.typeAt(e.anchorTx, e.anchorTy))) { this.drop(e); return; }
        if (p && !p.dead && Math.abs(p.cx - e.cx) < (P.wake ?? 90) && p.y > e.bottom - 20 && p.y - e.bottom < 600) {
          e.setState('shake'); e.setAnim('shake');
          audio.sfx('bell', { pitch: 1.8, vol: 0.3 });
        }
        return;
      }
      case 'shake': {
        e.vx = 0; e.vy = 0; e.setAnim('shake');
        e.sway = Math.sin(e.stateT * 42) * 0.16 * Math.min(1, e.stateT * 4);
        spark(world, 'dust', e.cx + rand(-10, 10), e.y - 2, 0.4, { speed: 30, color: '#b8b0a0' });
        spark(world, 'ember', e.cx + rand(-e.w * 0.4, e.w * 0.4), e.bottom - 8, 0.4, { speed: 40 });
        if (e.stateT > (P.shake ?? 0.5) || (e.anchorTx != null && !isSolidType(world.map.typeAt(e.anchorTx, e.anchorTy)))) this.drop(e);
        return;
      }
      case 'fall': {
        e.noGravity = false; e.gravity = 1.6; e.vx = 0; e.sway *= 0.9;
        e.setAnim('fall');
        // 몸통 + 이번 스텝에 떨어질 거리 (이동은 AI 뒤에 일어나므로 한 스텝 앞까지 판정)
        const reach = Math.max(0, (e.vy + 2200 * 1.6 * dt) * dt) + 4;
        e.strike(-e.w / 2, -e.h, e.w, e.h + reach, P.fallMv ?? 1.4, { hitId: e.fallId, kb: [200, -320] });
        if (e.onGround && e.stateT > 0.02) this.shatter(e, world);
        return;
      }
      case 'shatter':
        e.vx = 0; e.setAnim('shatter');
        if (e.stateT > 0.5) { e.setState('crawl'); e.cool = Math.max(e.cool, 0.6); }
        return;
      case 'spit': {
        e.vx = 0; e.setAnim('spit');
        const wu = P.spitWindup ?? 0.4;
        spark(world, 'ember', e.cx + e.facing * 14, e.bottom - 26, 0.5, { speed: 40 });
        if (e.stateT > wu) {
          if (!e.didHit) {
            e.didHit = true;
            bolt(e, {
              x: e.cx + e.facing * e.w * 0.35, y: e.bottom - 26, vx: e.facing * (P.spit ?? 300), vy: 0, w: 16, h: 12,
              render: pr('candle', fireball), color: '#ffb050', trail: 'ember', trailRate: 0.05, life: 2.4,
              light: { r: 50, color: '#ffb050', i: 0.6 }, attack: { mv: P.spitMv ?? 0.9, element: 'fire' },
            });
            audio.sfx('fire', { vol: 0.45, pitch: 1.3 });
          }
          if (e.stateT > wu + 0.35) { e.setState('crawl'); e.cool = (P.rate ?? 2.2) * rand(0.9, 1.2); }
        }
        return;
      }
      default: {   // crawl: 촛대 다리로 기어 다님
        e.noGravity = false; e.broken = true; e.sway = 0;
        e.setAnim('crawl');
        if (seesP(e, p, P.sight ?? 460, 150)) {
          faceP(e);
          const adx = Math.abs(p.cx - e.cx);
          if (e.cool <= 0 && e.onGround && adx < (P.spitRange ?? 420) && Math.abs(p.cy - e.cy) < 60) { e.setState('spit'); e.didHit = false; e.vx = 0; return; }
          chase(e, e.facing, adx < 70 ? 0 : e.speed);
        } else patrol(e, 0.7);
      }
    }
  },
  onHit(e, world) {
    if (e.state === 'hang' || e.state === 'shake' || e.state === 'fall') {
      // 매달린 채로는 밀리거나 경직되지 않는다 (enemy.takeHit: onHit 에서 guardT 가 바뀌면 반응 없음) — 대신 곧 떨어진다.
      // 떨어지는 중에도 같다: 띄워서 다운시키면 누웠다 일어난 뒤에야 산산조각(예고 없는 늦은 광역)이 나므로 착지 순간에 깨지게 둔다
      e.guardT = (e.guardT || 0) + 1;
      if (e.state === 'hang') { e.setState('shake'); e.setAnim('shake'); audio.sfx('bell', { pitch: 1.8, vol: 0.3 }); }
    }
  },
  onDie(e, world) {
    if (e.state === 'hang' || e.state === 'shake' || e.state === 'fall') {
      // 매달린 채(또는 떨어지던 중) 쓰러짐 → 떨어져 깨진다 (광역 피해 없음; 긴 낙하에서 공중에 사라지지 않게 쓰러짐 시간을 늘린다)
      e.noGravity = false; e.vy = Math.max(e.vy, 80); e.anchorY = null; e.setAnim('fall');
      e.dying = Math.max(e.dying, 0.55);
      puff(world, 'shard', e.cx, e.cy, 12, { color: '#e8f4ff', speed: 220 });
      audio.sfx('break_wall', { vol: 0.5, pitch: 1.5 });
    }
  },
};

// ═════════════════════════ s15 영겁의 용광로 ═════════════════════════
/** 용광로 임프: 거리를 두고 날며 ① 달군 대갈못 3발(떨어진 자리에 불) ② 조준 후 불덩이처럼 급강하 */
AI_C.forgeimp = {
  init(e) { e.cool = rand(0.8, 1.6); e.side = chance(0.5) ? 1 : -1; e.pick = chance(0.5) ? 1 : 0; e.aimX = e.cx; e.aimY = e.cy; ensureMag(e); },
  /** 대갈못이 바닥에 박힘 → 40×12 불 자리 1.2초 */
  rivetLand(e, pro, world) {
    const gy = landY(world, pro);
    pro.dead = true;
    puff(world, 'ember', pro.cx, pro.cy - 4, 5, { speed: 90 });
    if (gy == null) return;
    const P = e.params;
    addZone(world, {
      x: pro.cx - 20, y: gy - 12, w: 40, h: 12, life: P.burn ?? 1.2, owner: e, z: 3, render: zr('burn', SI.burn), hitTest: pushOut,
      light: { r: 40, color: '#ff7a2a', i: 0.5 },
      attack: atk(e, P.burnMv ?? 0.5, { type: 'mag', element: 'fire', rehit: 0.4, hitId: nid('fb'), kb: [120, -260], tags: ['magic'] }),
    });
  },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    switch (e.state) {
      case 'cast': {   // 대갈못 흩뿌리기
        e.vx *= 0.9; e.vy *= 0.9; faceP(e); e.setAnim('cast');
        spark(world, 'ember', e.cx + e.facing * 10, e.cy, 0.5, { speed: 60 });
        const wu = P.windup ?? 0.55;
        if (e.stateT > wu) {
          if (!e.didHit) {
            e.didHit = true;
            const d = Math.abs(p.cx - e.cx);
            const base = angleTo(e.cx, e.cy, p.cx, p.cy - 30 - d * 0.18);
            const s = P.rivetSpeed ?? 300;
            for (let i = -1; i <= 1; i++) {
              const a = base + i * (P.spread ?? 0.25);
              bolt(e, {
                x: e.cx + e.facing * 8, y: e.cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, w: 10, h: 10, gravity: 0.4, life: 2.4,
                render: pr('rivet', SI.rivet), spin: 12 * e.facing, trail: 'ember', trailRate: 0.07, light: { r: 34, color: '#ff8a3a', i: 0.5 },
                onWall: (pro, w) => this.rivetLand(e, pro, w), attack: { mv: P.rivetMv ?? 0.9, element: 'fire' },
              });
            }
            audio.sfx('dagger', { vol: 0.4, pitch: 0.7 }); audio.sfx('fire', { vol: 0.3, pitch: 1.5 });
          }
          if (e.stateT > wu + 0.45) { e.setState('fly'); e.cool = (P.rate ?? 2.2) * rand(0.85, 1.2); }
        }
        return;
      }
      case 'aim': {   // 급강하 조준 (조준선은 끝까지 플레이어를 따라가다가 급강하 순간 고정)
        e.vx *= 0.85; e.vy *= 0.85; faceP(e); e.setAnim('aim');
        e.aimX = p.cx; e.aimY = p.cy;
        spark(world, 'fire', e.cx, e.cy, 0.35, { speed: 30 });
        if (e.stateT > (P.aim ?? 0.4)) {
          if (!e.didHit) {
            e.setState('dive'); e.setAnim('dive'); e.bit = false;
            const d = Math.hypot(e.aimX - e.cx, e.aimY - e.cy);
            e.diveT = d / (P.dive ?? 460) + 0.12;
            audio.sfx('dash', { vol: 0.45, pitch: 1.3 }); audio.sfx('fire', { vol: 0.35, pitch: 0.8 });
          } else { e.setState('fly'); e.cool = (P.rate ?? 2.2) * 0.6; }
        }
        return;
      }
      case 'dive': {
        e.setAnim('dive');
        const dx = e.aimX - e.cx, dy = e.aimY - e.cy, d = Math.hypot(dx, dy), sp = P.dive ?? 460;
        if (d > 10) { e.vx = dx / d * sp; e.vy = dy / d * sp; if (Math.abs(dx) > 2) e.facing = Math.sign(dx); }
        if (!e.didHit && e.strike(-e.w / 2, -e.h, e.w, e.h, P.diveMv ?? 1.2, { hitId: e.diveId, element: 'fire', kb: [320, -320] })) { e.didHit = true; e.bit = true; }
        spark(world, 'fire', e.cx - e.vx * 0.03, e.cy - e.vy * 0.03, 0.9, { speed: 40 });
        // 목표 도착 · 명중 · 끊김(경직) · 시간 초과 → 다시 떠오른다
        if (d < 16 || e.stateT > Math.min(1.2, e.diveT) || (e.didHit && !e.bit) || (e.bit && e.stateT > 0.1)) {
          e.setState('recover'); e.vy = -220; e.vx *= 0.3;
        }
        return;
      }
      case 'recover':
        e.setAnim('fly'); e.vx *= 0.92; e.vy += (-160 - e.vy) * Math.min(1, 4 * dt);
        if (e.stateT > 0.45) { e.setState('fly'); e.cool = (P.rate ?? 2.2) * rand(0.85, 1.2); }
        return;
      default: {   // fly
        const keep = P.keep ?? 180;
        if (Math.abs(p.cx - e.cx) > keep * 2.2) e.side = Math.sign(e.cx - p.cx) || 1;
        sideFor(e, world, p, keep, -150);
        hover(e, p.cx + e.side * keep, p.bottom - 150 + Math.sin(e.t * 3.2) * 16, 2.2, dt, e.speed * 1.4);
        faceP(e); e.setAnim('fly');
        spark(world, 'ember', e.cx - e.facing * 12, e.cy + 10, 0.12, { speed: 30 });
        if (e.cool <= 0 && e.distToPlayer() < (P.range ?? 520)) {
          e.pick ^= 1;
          e.didHit = false;
          if (e.pick) { e.setState('cast'); audio.sfx('fire', { vol: 0.25, pitch: 1.8 }); }
          else {
            e.setState('aim'); e.diveId = nid('fd');
            audio.sfx('bat', { vol: 0.3, pitch: 1.7 });
            warnZone(e, world, {
              x: e.cx, y: e.cy, w: 4, h: 4, life: (P.aim ?? 0.4) + 0.05, render: zr('warnline', SI.warnline), data: { color: '#ff8a3a' },
              follow: (z) => { const d = z.data; d.x0 = e.cx; d.y0 = e.cy; d.x1 = e.aimX; d.y1 = e.aimY; z.x = Math.min(d.x0, d.x1); z.y = Math.min(d.y0, d.y1); z.w = Math.abs(d.x1 - d.x0) + 4; z.h = Math.abs(d.y1 - d.y0) + 4; },
            });
          }
        }
      }
    }
  },
};

/** 쇳물 골렘: 느린 추격. 가까우면 두 팔 내려찍기(+쇳물 웅덩이 둘), 멀면 녹은 쇳덩이를 뱉는다. 쓰러진 자리에 웅덩이 */
AI_C.slag = {
  init(e) { e.cool = rand(0.8, 1.6); e.glow = 0; ensureMag(e); },
  slam(e, world) {
    const P = e.params;
    e.strike(-20, -70, 180, 70, P.slamMv ?? 1.8, { hitId: nid('ss'), kb: [360, -460], hitstop: 0.08 });
    world.camera.shake(6, 0.25);
    const fx = world.fx, sx = e.cx + e.facing * 80;
    puff(world, 'fire', sx, e.bottom - 6, 14, { speed: 200, angle: -PI / 2, spread: 1.2 });
    puff(world, 'dust', sx, e.bottom - 6, 8, { speed: 120, jitter: 40 });
    if (fx.ering) fx.ering(sx, e.bottom - 3, { color: '#ffb050', r0: 10, r1: 100, ry: 0.25, life: 0.3, width: 5 });
    audio.sfx('hit_heavy', { pitch: 0.6 }); audio.sfx('fire', { vol: 0.5, pitch: 0.7 });
    for (const s of [-1, 1]) magmaPuddle(e, world, e.cx + s * (P.puddleX ?? 90), e.bottom, P.puddle ?? 3, P.puddleMv ?? 0.45);
  },
  spit(e, world) {
    const p = e.player, P = e.params;
    const x = e.cx + e.facing * 22, y = e.bottom - e.h * 0.75;
    const vy0 = -(P.globVy ?? 520);
    const vx = arcVx((p?.cx ?? e.cx + e.facing * 300) - x, (p ? p.bottom - 12 : e.bottom) - y, vy0, 2000 * (P.globGrav ?? 1), P.globSpeed ?? 380);
    bolt(e, {
      x, y, vx, vy: vy0, w: 18, h: 18, behavior: 'arc', gravity: P.globGrav ?? 1, life: 3, render: pr('glob', SI.glob),
      trail: 'ember', trailRate: 0.05, light: { r: 50, color: '#ff6a1a', i: 0.6 }, attack: { mv: P.globMv ?? 1.0, element: 'fire' },
      onWall: (pro, w) => {
        const gy = landY(w, pro);
        pro.dead = true;
        puff(w, 'fire', pro.cx, pro.cy - 6, 6, { speed: 120 });
        if (gy != null) magmaPuddle(e, w, pro.cx, gy, P.globPuddle ?? 2.5, P.puddleMv ?? 0.45);
      },
    });
    audio.sfx('fire', { vol: 0.5, pitch: 0.55 });
  },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro;
    // 흘러내리는 쇳물
    spark(world, 'ember', e.cx + rand(-e.w * 0.35, e.w * 0.35), e.bottom - rand(10, e.h * 0.6), 0.12, { speed: 20, grav: 500 });
    switch (e.state) {
      case 'windup': {   // 두 팔을 들어 올림 (달아오름)
        e.vx = 0; e.setAnim('windup');
        const wu = P.windup ?? 0.8;
        e.glow = clamp(e.stateT / wu, 0, 1);
        spark(world, 'fire', e.cx - e.facing * 6, e.y + 10, 0.4, { speed: 50 });
        if (e.stateT > wu) {
          if (!e.didHit) { e.didHit = true; this.slam(e, world); e.setState('slam'); e.setAnim('slam'); }
          else { e.setState('walk'); e.cool = (P.rate ?? 2) * 0.6; }   // 끊긴 내려찍기
        }
        return;
      }
      case 'slam':
        e.vx = 0; e.setAnim('slam'); e.glow *= 0.92;
        if (e.stateT > 0.65) { e.setState('walk'); e.cool = (P.rate ?? 2) * rand(0.9, 1.2); }
        return;
      case 'spit': {
        e.vx = 0; e.setAnim('spit'); faceP(e);
        const wu = P.spitWindup ?? 0.6;
        e.glow = clamp(e.stateT / wu, 0, 1) * 0.6;
        if (e.stateT > wu) {
          if (!e.didHit) { e.didHit = true; this.spit(e, world); }
          if (e.stateT > wu + 0.45) { e.setState('walk'); e.cool = (P.rate ?? 2) * rand(0.9, 1.2); }
        }
        return;
      }
      default: {
        e.glow *= 0.95;
        if (seesP(e, p, P.sight ?? 460, 200)) {
          faceP(e);
          const adx = Math.abs(p.cx - e.cx), melee = P.melee ?? 120;
          if (e.cool <= 0 && e.onGround) {
            if (adx < melee && Math.abs(p.cy - e.cy) < 110) {
              e.setState('windup'); e.didHit = false; e.vx = 0;
              audio.sfx('fire', { vol: 0.4, pitch: 0.5 });
              // 내려찍는 자리 + 웅덩이 자리 경고
              warnZone(e, world, { x: 0, y: 0, w: 1, h: 1, life: (P.windup ?? 0.8) + 0.05, render: zr('floorwarn', SI.floorwarn), data: { color: '#ff5a1a' },
                follow: (z) => { const r = e.relRect(-20, -26, 180, 26); z.x = r.x; z.y = r.y; z.w = r.w; z.h = r.h; } });
              return;
            }
            if (adx > 200 && adx < 500 && Math.abs(p.cy - e.cy) < 260) { e.setState('spit'); e.didHit = false; e.vx = 0; return; }
          }
          chase(e, e.facing, adx < melee * 0.7 ? 0 : e.speed);
        } else patrol(e, 0.5);
        e.setAnim(Math.abs(e.vx) > 3 ? 'walk' : 'idle');
      }
    }
  },
  onDie(e, world) {
    magmaPuddle(e, world, e.cx, e.bottom, e.params.deathPuddle ?? 2, e.params.deathMv ?? 0.3);
    puff(world, 'fire', e.cx, e.cy, 12, { speed: 160, jitter: 20 });
  },
};

/** 사슬 간수: 가슴 높이 경고선 → 갈고리 사슬(맞으면 간수 쪽으로 끌려옴) → 가까이 오면 올려치기. 근접이면 낮게 사슬 휩쓸기 */
AI_C.chainhook = {
  init(e) { e.cool = rand(0.8, 1.5); e.hook = null; e.hooked = false; ensureMag(e); },
  hand(e) { return { x: e.cx + e.facing * 16, y: e.bottom - (e.params.hookY ?? 55) }; },
  throwHook(e, world) {
    const P = e.params, h = this.hand(e);
    const range = P.range ?? 380;
    const max = Math.max(40, Math.min(range, rayLen(world, h.x, h.y, e.facing > 0 ? 0 : PI, range)));
    e.hooked = false;
    e.hook = addZone(world, {
      x: h.x - 12, y: h.y - 9, w: 24, h: 18, noHit: true, life: 3, owner: e, z: 6, render: zr('hook', SI.hook),
      data: { dir: e.facing, dist: 0, max, back: false, hooked: false, hx: h.x, hy: h.y },
      attack: atk(e, P.hookMv ?? 1.0, { hitId: nid('ch'), kb: [700, -150], tags: ['projectile'] }),
      tick: (z, w, dtt) => this.tickHook(e, z, w, dtt),
    });
    audio.sfx('whip', { pitch: 0.55, vol: 0.6 });
  },
  /** 갈고리: 900 px/s 로 최대 사거리까지 → 되감기. 맞히면 곧바로 되감고 간수는 'reel' */
  tickHook(e, z, w, dt) {
    const d = z.data;
    if (!stillHere(e)) { z.dead = true; return; }
    const h = this.hand(e), sp = e.params.hookSpeed ?? 900;
    if (!d.back) { d.dist += sp * dt; if (d.dist >= d.max) { d.dist = d.max; d.back = true; audio.sfx('clang', { vol: 0.25, pitch: 1.6 }); } }
    else { d.dist -= sp * 1.25 * dt; if (d.dist <= 0) { z.dead = true; return; } }
    d.hx = h.x; d.hy = h.y;
    z.x = h.x + d.dir * d.dist - z.w / 2; z.y = h.y - z.h / 2;
    if (d.back || d.hooked) return;
    const pl = w.player;
    if (!pl || pl.dead || !overlap(z, pl.hurtbox())) return;
    // 맞으면 간수 쪽으로 넉백 (당겨 옴). 세기는 거리에 맞춰 (최대 700) → 간수 바로 앞에 떨어진다 (지나쳐 날아가지 않게)
    z.attack.dir = Math.sign(e.cx - pl.cx) || -d.dir;
    z.attack.kb = [clamp((Math.abs(e.cx - pl.cx) - 40) * 3, 240, e.params.hookKb ?? 700), -150];   // 넉백 이동 ≈ 0.33~0.4·kb − 20 px
    const info = hitTarget(w, { team: 'enemy', ...z.attack }, pl, pl.cx, pl.cy);
    if (info && info.landed !== false) {
      d.hooked = true; d.back = true; e.hooked = true;
      w.fx.burst('spark', z.cx, z.cy, 8, { color: '#ffd0a0' });
      audio.sfx('whip_crack', { vol: 0.7, pitch: 0.7 });
      if (e.state === 'throw') { e.setState('reel'); e.setAnim('reel'); }
    }
  },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro;
    switch (e.state) {
      case 'aim': {   // 경고선 뒤 갈고리 던지기
        e.vx = 0; e.setAnim('aim');
        const wu = P.windup ?? 0.5;
        if (e.stateT > wu) {
          if (!e.didHit) { e.didHit = true; this.throwHook(e, world); e.setState('throw'); e.setAnim('throw'); }
          else { e.setState('walk'); e.cool = (P.rate ?? 1.9) * 0.6; }
        }
        return;
      }
      case 'throw': {
        e.vx = 0; e.setAnim('throw');
        if (!e.hook || e.hook.dead || e.stateT > 2) {
          if (e.hook && !e.hook.dead) e.hook.dead = true;
          e.hook = null; e.setState('walk'); e.cool = (P.rate ?? 1.9) * rand(0.9, 1.2);
        }
        return;
      }
      case 'reel': {   // 끌려온 먹잇감이 0.6초 안에 140 px 안이면 올려치기
        e.vx = 0; e.setAnim('reel');
        if (e.hook?.dead) e.hook = null;
        if (p && !p.dead && Math.abs(p.cx - e.cx) < (P.smashRange ?? 140) && Math.abs(p.cy - e.cy) < 110) {
          faceP(e); e.setState('slam'); e.setAnim('smash'); e.didHit = false;   // 상태 'slam' = COUNTER 창 (애니메이션은 'smash')
          // 피격 무적이 거의 끝날 때 내려오도록 예비동작을 늘린다 (0.2초 이상, 1초 이하) — 보고 피할 틈이 있다
          e.smashWu = clamp((p.iframes ?? 0) - 0.08, P.smashWindup ?? 0.2, 1.0);
          audio.sfx('clang', { vol: 0.4, pitch: 0.7 });
          warnZone(e, world, { x: 0, y: 0, w: 1, h: 1, life: e.smashWu + 0.05, render: zr('floorwarn', SI.floorwarn),
            follow: (z) => { const r = e.relRect(-10, -20, 110, 20); z.x = r.x; z.y = r.y; z.w = r.w; z.h = r.h; } });
          return;
        }
        if (e.stateT > (P.reel ?? 0.6)) { e.setState('walk'); e.hooked = false; e.cool = (P.rate ?? 1.9) * rand(0.6, 0.9); }
        return;
      }
      case 'slam': {   // 올려치기 (anim 'smash')
        e.vx = 0; e.setAnim('smash');
        const wu = e.smashWu ?? 0.2;
        if (e.stateT > wu) {
          if (!e.didHit) {
            e.didHit = true;
            e.strike(-10, -120, 110, 120, P.smashMv ?? 1.5, { hitId: nid('cw'), kb: [200, -700], hitstop: 0.07 });
            world.camera.shake(5, 0.2);
            puff(world, 'dust', e.cx + e.facing * 50, e.bottom - 4, 8, { speed: 140, angle: -PI / 2, spread: 1 });
            audio.sfx('hit_heavy', { pitch: 0.8 });
          }
          if (e.stateT > wu + 0.45) { e.setState('walk'); e.hooked = false; e.cool = (P.rate ?? 1.9) * rand(0.9, 1.2); }
        }
        return;
      }
      case 'sweep': {   // 낮은 사슬 휩쓸기 (뛰어서 피한다)
        e.vx = 0; e.setAnim('sweep');
        const wu = P.sweepWindup ?? 0.6;
        if (e.stateT > wu) {
          if (!e.didHit) {
            e.didHit = true;
            e.strike(-40, -40, 200, 40, P.sweepMv ?? 1.3, { hitId: nid('cw'), kb: [320, -360] });
            puff(world, 'dust', e.cx + e.facing * 70, e.bottom - 4, 10, { speed: 160, jitter: 50 });
            audio.sfx('whip_crack', { pitch: 0.6, vol: 0.7 });
          }
          if (e.stateT > wu + 0.4) { e.setState('walk'); e.cool = (P.rate ?? 1.9) * rand(0.9, 1.2); }
        }
        return;
      }
      default: {
        if (seesP(e, p, P.sight ?? 520, 180)) {
          faceP(e);
          const adx = Math.abs(p.cx - e.cx), ady = Math.abs(p.cy - e.cy);
          if (e.cool <= 0 && e.onGround && ady < 80) {
            if (adx < 200 && (adx < 120 || chance(0.5))) {
              e.setState('sweep'); e.didHit = false; e.vx = 0;
              audio.sfx('whip', { pitch: 0.4, vol: 0.4 });
              warnZone(e, world, { x: 0, y: 0, w: 1, h: 1, life: (P.sweepWindup ?? 0.6) + 0.05, render: zr('floorwarn', SI.floorwarn),
                follow: (z) => { const r = e.relRect(-40, -16, 200, 16); z.x = r.x; z.y = r.y; z.w = r.w; z.h = r.h; } });
              return;
            }
            if (adx > 120 && adx < (P.range ?? 380)) {
              e.setState('aim'); e.didHit = false; e.vx = 0;
              audio.sfx('clang', { vol: 0.3, pitch: 1.2 });
              const h = this.hand(e), L = Math.min(P.range ?? 380, rayLen(world, h.x, h.y, e.facing > 0 ? 0 : PI, P.range ?? 380));
              warnZone(e, world, { x: Math.min(h.x, h.x + e.facing * L), y: h.y - 2, w: L, h: 4, life: (P.windup ?? 0.5) + 0.05, render: zr('warnline', SI.warnline),
                data: { x0: h.x, y0: h.y, x1: h.x + e.facing * L, y1: h.y } });
              return;
            }
          }
          chase(e, e.facing, adx < 90 ? 0 : e.speed * (P.chaseMul ?? 1));
        } else patrol(e, 0.5);
        e.setAnim(Math.abs(e.vx) > 3 ? 'walk' : 'idle');
      }
    }
  },
  onDie(e) { if (e.hook && !e.hook.dead) e.hook.dead = true; e.hook = null; },
};

/** 불풀무: 제자리. 쉬는 동안만 돌아본다. 들이마시기(앞쪽 먹잇감을 끌어당김) → 부채꼴 불길 */
AI_C.bellows = {
  init(e) { e.cool = rand(0.6, 1.4); e.inflate = 0.3; e.pullV = 0; e.vx = 0; ensureMag(e); },
  mouth(e) { return { x: e.cx + e.facing * e.w * 0.5, y: e.bottom - (e.params.mouthY ?? 50) }; },
  /** 앞쪽 range 안(|dy| < 100)의 플레이어를 입 쪽으로 끌어당긴다 (500 px/s², 벽은 뚫지 않음, 대시로 벗어날 수 있다) */
  pull(e, world, dt) {
    const p = world.player, P = e.params;
    if (!p || p.dead || world.cutscene || world.inputLock) { e.pullV = 0; return; }
    const m = this.mouth(e), dx = m.x - p.cx, adx = Math.abs(dx);
    const inFront = Math.sign(p.cx - e.cx) === e.facing;
    if (!inFront || adx > (P.range ?? 300) || Math.abs(p.cy - m.y) > 100 || p.dashT > 0) { e.pullV = Math.max(0, e.pullV - 1500 * dt); return; }
    e.pullV = Math.min(P.pullMax ?? 240, e.pullV + (P.pull ?? 500) * dt);
    const step = Math.sign(dx) * Math.min(Math.max(0, adx - 24), e.pullV * dt);
    if (step && rectFree(world, p.x + step, p.y, p.w, p.h)) p.x += step;
    if (Math.random() < 0.5 * (world.fx.quality ?? 1)) {
      const a = rand(-0.6, 0.6), r = rand(60, 200);
      world.fx.emit('dust', m.x + e.facing * r * Math.cos(a), m.y + r * Math.sin(a), { vx: -e.facing * 260, vy: -Math.sin(a) * 120, speed: 0, color: '#c8b8a0', alpha: 0.35, grav: 0, life: 0.35 });
    }
  },
  blow(e, world) {
    const P = e.params, m = this.mouth(e), dir = e.facing;
    const L = Math.max(40, Math.min(P.length ?? 280, rayLen(world, m.x, m.y, dir > 0 ? 0 : PI, P.length ?? 280)));
    const H = P.height ?? 90;
    addZone(world, {
      x: m.x, y: m.y - H / 2, w: 1, h: H, life: P.blow ?? 1.2, owner: e, z: 6, render: zr('flamecone', SI.flamecone),
      light: { r: 110, color: '#ff7a2a', i: 0.8 },
      data: { dir, len: 0, L, H, mx: m.x, my: m.y },
      attack: atk(e, P.blowMv ?? 0.55, { type: 'mag', element: 'fire', rehit: 0.2, hitId: nid('bf'), kb: [260, -220] }),
      follow: (z) => {
        if (!stillHere(e) && z.life > 0.15) z.life = 0.15;   // 주인이 쓰러지면 불길이 곧 꺼진다
        const d = z.data;
        d.len = Math.min(d.L, d.L * (z.t / 0.2));
        z.w = Math.max(1, d.len); z.x = d.dir > 0 ? d.mx : d.mx - z.w; z.y = d.my - d.H / 2;
        if (Math.random() < 0.6 * (world.fx.quality ?? 1)) world.fx.emit('fire', d.mx + d.dir * rand(10, d.len), d.my + rand(-0.3, 0.3) * d.H * (d.len / d.L), { vx: d.dir * 200, speed: 40, grav: -100 });
      },
      hitTest: (z, w) => {
        const pl = w.player, d = z.data;
        if (!pl || pl.dead) return false;
        const hb = pl.hurtbox();
        if (!overlap(z, hb)) return false;
        // 부채꼴: 입에서 멀어질수록 넓어진다 (입 14 px → 끝 H/2)
        const near = d.dir > 0 ? Math.max(0, hb.x - d.mx) : Math.max(0, d.mx - (hb.x + hb.w));
        if (near > d.len) return false;
        const hh = 14 + (d.H / 2 - 14) * (near / d.L);
        if (!(hb.y < d.my + hh && hb.y + hb.h > d.my - hh)) return false;
        z.attack.dir = d.dir;
        return true;
      },
    });
    audio.sfx('fire', { vol: 0.7, pitch: 0.6 });
    puff(world, 'smoke', m.x, m.y, 6, { speed: 80 });
  },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.vx = 0;
    e.cool -= dt * e.aggro;
    switch (e.state) {
      case 'gather': {   // 들이마시기 (anim 'inhale')
        e.setAnim('inhale');
        const T = P.inhale ?? 0.9;
        e.inflate = Math.min(1, e.inflate + dt / T);
        this.pull(e, world, dt);
        if (e.stateT > T) {
          e.pullV = 0;
          if (!e.didHit) { e.didHit = true; this.blow(e, world); e.setState('blow'); e.setAnim('blow'); }
          else { e.setState('idle'); e.cool = 1; }
        }
        return;
      }
      case 'blow': {
        e.setAnim('blow');
        const B = P.blow ?? 1.2;
        e.inflate = Math.max(0, e.inflate - dt / B * 1.1);
        if (e.stateT > B) { e.setState('idle'); e.cool = Math.max(0.4, (P.rate ?? 3) - (P.inhale ?? 0.9) - B) * rand(0.9, 1.3); }
        return;
      }
      default: {
        e.setAnim('idle');
        e.inflate += (0.3 + Math.sin(e.t * 2) * 0.08 - e.inflate) * Math.min(1, dt * 3);
        if (p && !p.dead) {
          const dx = p.cx - e.cx;
          if (Math.abs(dx) > 6) e.facing = Math.sign(dx);   // 쉬는 동안에만 돌아본다 (등 뒤는 무방비)
          if (e.cool <= 0 && Math.abs(dx) < (P.range ?? 300) * 1.8 && Math.abs(p.cy - e.cy) < 220) {
            e.setState('gather'); e.didHit = false; e.pullV = 0;
            audio.sfx('mist', { pitch: 0.5, vol: 0.5 });
          }
        }
      }
    }
  },
};

// ═════════════════════════ s16 가라앉은 성소 ═════════════════════════
/** 심해 아귀: 물속에서 자유롭게 헤엄 (물 밖으로는 스스로 나가지 않음). 물속 먹잇감 → 다가가 물기 돌진,
 *  수면 위 먹잇감 → 바로 아래에서 뛰어오르며 물기. 뭍에 올라오면 물 쪽으로 퍼덕인다 */
AI_C.swimmer = {
  init(e) { e.cool = rand(0.6, 1.2); e.inWater = false; e.wander = rand(0, TAU); e.lure = 0; e.flopT = 0.3; e.setState('lurk'); e.setAnim('swim'); },
  /** 플레이어가 물속인가 (깊은 물 기믹이 있으면 그 판정, 없으면 액체 칸과 겹치는지) */
  playerWet(world, p) {
    const dg = world.gimmickOf?.('deep');
    return dg ? !!dg.inWater : touchesType(p, world.map, T.LIQUID, 10);
  },
  /** 물 밖으로 나가는 속도 성분은 0 (가운데가 액체가 아닌 칸으로 들어가지 않는다) */
  clampWater(e, world, dt) {
    const cx = e.cx, cy = e.cy;
    if (e.vx && !isLiquidPx(world, cx + e.vx * dt + Math.sign(e.vx) * 6, cy)) e.vx = 0;
    if (e.vy && !isLiquidPx(world, cx, cy + e.vy * dt + (e.vy < 0 ? -e.h * 0.25 : 6))) e.vy = 0;
  },
  /** 몸 가운데 칸 위로 이어진 물의 수면 y (위가 막혀 있으면 null) */
  surfaceY(e, world) {
    const m = world.map, tx = Math.floor(e.cx / TILE);
    let ty = Math.floor(e.cy / TILE);
    if (m.typeAt(tx, ty) !== T.LIQUID) return null;
    while (ty > 0 && m.typeAt(tx, ty - 1) === T.LIQUID) ty--;
    if (isSolidType(m.typeAt(tx, ty - 1))) return null;
    return ty * TILE;
  },
  /** 가장 가까운 물 쪽 (±1, 없으면 0) */
  waterDir(e, world) {
    const m = world.map, tx0 = Math.floor(e.cx / TILE), ty0 = Math.floor((e.bottom - 4) / TILE);
    for (let k = 1; k <= 14; k++) for (const s of [-1, 1]) for (let dy = -1; dy <= 3; dy++) if (m.typeAt(tx0 + s * k, ty0 + dy) === T.LIQUID) return s;
    return 0;
  },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    const wet = isLiquidPx(world, e.cx, e.cy);
    e.inWater = wet;
    e.cool -= dt * e.aggro;
    e.lure = Math.max(0, e.lure - dt * 3);
    // ── 수면 위로 도약 ──
    if (e.state === 'leap') {
      e.noGravity = false; e.gravity = 1; e.setAnim('leap');
      if (!e.didHit) faceP(e);   // 기슭 벽에 막혀 vx 가 0 이 되어도 턱은 먹잇감 쪽
      // 뛰어오르며 무는 턱은 몸보다 조금 더 앞으로 나온다 (물가 벽에 막혀도 가장자리에 선 먹잇감에 닿게)
      if (!e.didHit && e.strike(-e.w * 0.3, -e.h - 6, e.w * 0.8 + 22, e.h + 6, P.biteMv ?? 1.5, { hitId: e.leapId, kb: [360, -380] })) e.didHit = true;
      if (wet && e.vy > 0 && e.stateT > 0.15) {
        const s = this.surfaceY(e, world) ?? e.cy;
        puff(world, 'water', e.cx, s + 2, 14, { angle: -PI / 2, spread: 0.8, speed: 280 });
        audio.sfx('splash', { vol: 0.5 });
        e.noGravity = true; e.vy *= 0.25; e.vx *= 0.4;
        e.setState('stalk'); e.cool = (P.rate ?? 1.6) * rand(0.9, 1.2);
      } else if (e.onGround && e.stateT > 0.1) { e.setState('flop'); e.flopT = 0.5; e.harmless = true; e.flopId = nid('af'); }
      return;
    }
    // ── 뭍 (좌초): 0.8초마다 물 쪽으로 한 칸 퍼덕 ──
    if (!wet) {
      if (e.state !== 'flop') { e.setState('flop'); e.flopT = 0.4; e.harmless = true; e.flopId = nid('af'); }
      e.noGravity = false; e.gravity = 1; e.setAnim('flop');
      if (e.onGround) {
        e.vx *= 0.8;
        e.flopT -= dt;
        if (e.flopT <= 0) {
          e.flopT = P.flop ?? 0.8;
          const dir = this.waterDir(e, world) || (p ? Math.sign(p.cx - e.cx) : e.facing) || 1;
          e.facing = dir; e.vx = dir * (P.hopVx ?? 120); e.vy = -(P.hopVy ?? 440);
          audio.sfx('splash', { vol: 0.2, pitch: 1.9 });
          puff(world, 'water', e.cx, e.bottom - 4, 4, { speed: 90, angle: -PI / 2, spread: 1 });
        }
      }
      // 퍼덕이는 몸통 (접촉 mv 0.5 — enemy.js 기본 접촉 피해는 harmless 로 끈다)
      e.strike(-e.w / 2 + 4, -e.h + 4, e.w - 8, e.h - 8, P.flopMv ?? 0.5, { hitId: e.flopId, rehit: 0.8, tags: ['contact'], kb: [200, -240] });
      return;
    }
    if (e.state === 'flop') {
      e.harmless = false; e.vx *= 0.3; e.vy = Math.min(e.vy, 60);
      puff(world, 'water', e.cx, e.cy - 10, 10, { angle: -PI / 2, spread: 0.8, speed: 200 });
      audio.sfx('splash', { vol: 0.4 });
      e.setState('lurk');
    }
    e.noGravity = true;
    const pIn = !!p && !p.dead && this.playerWet(world, p);
    switch (e.state) {
      case 'bite': {   // 예비동작: 초롱불이 번쩍이며 멈칫
        e.setAnim('bite'); e.vx *= 0.85; e.vy *= 0.85; faceP(e);
        e.lure = 1;
        if (e.stateT > (P.windup ?? 0.45)) {
          if (!e.didHit && p) {
            e.lungeA = angleTo(e.cx, e.cy, p.cx, p.cy);
            e.setState('lunge'); e.bit = false; e.lungeId = nid('al');
            audio.sfx('slash', { pitch: 0.5, vol: 0.5 });
            puff(world, 'water', e.cx, e.cy, 6, { speed: 120 });
          } else { e.setState('stalk'); e.cool = (P.rate ?? 1.6) * 0.6; }
        }
        this.clampWater(e, world, dt);
        return;
      }
      case 'lunge': {
        e.setAnim('bite');
        const s = P.lunge ?? 520;
        e.vx = Math.cos(e.lungeA) * s; e.vy = Math.sin(e.lungeA) * s;
        if (Math.abs(e.vx) > 5) e.facing = Math.sign(e.vx);
        if (!e.didHit && e.strike(-e.w * 0.3, -e.h, e.w * 0.8 + 10, e.h, P.biteMv ?? 1.5, { hitId: e.lungeId, kb: [380, -300] })) { e.didHit = true; e.bit = true; }
        this.clampWater(e, world, dt);
        spark(world, 'water', e.cx - e.facing * 20, e.cy, 0.4, { speed: 40, grav: -200, alpha: 0.6 });
        if (e.stateT > (P.lungeT ?? 0.35) || (e.didHit && !e.bit)) { e.setState('stalk'); e.cool = (P.rate ?? 1.6) * rand(0.9, 1.2); e.vx *= 0.3; e.vy *= 0.3; }
        return;
      }
      case 'aim': {   // 도약 예비동작: 수면 아래에서 초롱불 번쩍 + 물결
        e.setAnim('bite'); e.vx *= 0.8; e.vy *= 0.8; e.lure = 1;
        const s = this.surfaceY(e, world);
        if (s != null) spark(world, 'water', e.cx + rand(-16, 16), s + 2, 0.6, { angle: -PI / 2, spread: 0.4, speed: 140 });
        if (e.stateT > (P.leapWindup ?? 0.35)) {
          if (!e.didHit && p) {
            e.setState('leap'); e.setAnim('leap'); e.leapId = nid('aL');
            e.noGravity = false; e.vy = -(P.leap ?? 700); e.vx = clamp((p.cx - e.cx) * 1.6, -260, 260);
            puff(world, 'water', e.cx, (s ?? e.y) + 2, 18, { angle: -PI / 2, spread: 0.7, speed: 360 });
            audio.sfx('splash', { vol: 0.7, pitch: 1.2 });
          } else { e.setState('lurk'); e.cool = (P.rate ?? 1.6) * 0.6; }
          return;
        }
        this.clampWater(e, world, dt);
        return;
      }
      case 'stalk': {   // 물속 먹잇감에게 160 px 까지 다가감
        e.setAnim('swim');
        if (!pIn) { e.setState('lurk'); break; }
        const d = e.distToPlayer(), a = angleTo(e.cx, e.cy, p.cx, p.cy);
        const want = d > 170 ? e.speed : d < 110 ? -e.speed * 0.5 : 0;
        e.vx += (Math.cos(a) * want - e.vx) * Math.min(1, 3 * dt);
        e.vy += (Math.sin(a) * want + Math.sin(e.t * 2) * 20 - e.vy) * Math.min(1, 3 * dt);
        faceP(e);
        if (e.cool <= 0 && d < 230) { e.setState('bite'); e.didHit = false; audio.sfx('magic', { pitch: 2, vol: 0.25 }); }
        this.clampWater(e, world, dt);
        return;
      }
    }
    // lurk: 천천히 떠돌다 먹잇감을 찾는다
    e.setAnim('swim');
    e.wander += dt * 0.7;
    let tvx = Math.cos(e.wander) * e.speed * 0.35, tvy = Math.sin(e.wander * 1.3) * 25;
    if (p && !p.dead) {
      const d = e.distToPlayer(), adx = Math.abs(p.cx - e.cx);
      if (pIn && d < (P.sight ?? 360)) { e.setState('stalk'); return; }
      if (!pIn) {
        // 수면 위(200 px 이내)의 먹잇감: 바로 아래 수면 가까이로 가서 뛰어오른다
        const s = this.surfaceY(e, world);
        if (s != null && p.bottom <= s + 6 && s - p.bottom <= (P.leapH ?? 200) && adx < (P.sight ?? 360)) {
          const ty = s + e.h * 0.5 + 8;
          tvx = clamp(p.cx - e.cx, -1, 1) * e.speed; tvy = clamp((ty - e.cy) * 3, -e.speed, e.speed);
          if (adx < 120 && e.cy - s < 70 && e.cool <= 0) { e.setState('aim'); e.didHit = false; audio.sfx('magic', { pitch: 1.8, vol: 0.2 }); return; }
        }
      }
    }
    e.vx += (tvx - e.vx) * Math.min(1, 2 * dt); e.vy += (tvy - e.vy) * Math.min(1, 2 * dt);
    if (Math.abs(e.vx) > 5) e.facing = Math.sign(e.vx);
    this.clampWater(e, world, dt);
  },
};

/** 수몰 사제: 거리 유지(180 미만 후퇴, 360 초과 접근). 물기둥 셋(경고 후) · 유도 물방울 · 다친 동료 치유(8초) */
AI_C.tidecaller = {
  init(e) { e.cool = rand(1.0, 1.8); e.pick = chance(0.5) ? 1 : 0; e.blessCd = rand(2, 4); e.castTok = 0; ensureMag(e); },
  /** 300 px 안에서 체력 60% 미만인 동료 (가장 많이 다친 쪽) */
  findWounded(e, world) {
    let best = null, br = 0.6;
    for (const o of world.entities) {
      if (o === e || o.kind !== 'enemy' || o.dead || o.dying > 0 || o.hidden || !o.stats?.maxHp) continue;
      if (Math.hypot(o.cx - e.cx, o.cy - e.cy) > (e.params.blessRange ?? 300)) continue;
      const r = o.hp / o.stats.maxHp;
      if (r < br) { br = r; best = o; }
    }
    return best;
  },
  startGeyser(e, world) {
    const p = e.player, P = e.params;
    e.setState('cast'); e.setAnim('cast'); e.didHit = false; e.vx = 0;
    const tok = e.castTok = ++_zid;
    const wu = P.windup ?? 0.7;
    for (const off of [-120, 0, 120]) {
      const x = p.cx + off;
      if (x < 20 || x > world.map.pxW - 20) continue;
      const gy = groundTop(world, x, p.bottom - 20, 420);
      if (gy == null || solidAt(world, x, gy - 20)) continue;
      addZone(world, {
        x: x - 35, y: gy - 200, w: 70, h: 200, delay: wu, life: 0.5, owner: e, z: 6, render: zr('geyser', pillar),
        light: { r: 80, color: '#8ad8ff', i: 0.6 }, data: { tok }, hitTest: pushOut,
        attack: atk(e, P.geyserMv ?? 1.1, { type: 'mag', hitId: nid('tg'), kb: [0, -600] }),
        tick: (z, w) => {
          // 예비동작이 끊기면(경직·다운·사망·다른 행동) 아직 솟지 않은 물기둥은 사그라든다
          if (!z.active && (!stillHere(e) || e.stun > 0 || e.down > 0 || e.castTok !== z.data.tok)) {
            z.dead = true; w.fx.burst('water', z.cx, z.y + z.h - 4, 5, { angle: -PI / 2, spread: 0.6, speed: 120 }); return;
          }
          if (z.active && !z.data.burst) {
            z.data.burst = true;
            w.fx.burst('water', z.cx, z.y + z.h - 6, 16, { angle: -PI / 2, spread: 0.5, speed: 420 });
          }
        },
      });
    }
    audio.sfx('magic', { pitch: 0.6, vol: 0.4 });
  },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro; e.blessCd -= dt * e.aggro;
    switch (e.state) {
      case 'cast': {   // 물기둥 (장판은 시작할 때 경고로 깔아 둔다)
        e.vx = 0; e.setAnim('cast');
        spark(world, 'water', e.cx + e.facing * 8, e.bottom - e.h * 0.78, 0.35, { angle: -PI / 2, spread: 0.6, speed: 60, grav: -300, alpha: 0.6 });
        const wu = P.windup ?? 0.7;
        if (e.stateT > wu) {
          if (!e.didHit) { e.didHit = true; audio.sfx('splash', { vol: 0.7, pitch: 0.7 }); }
          if (e.stateT > wu + 0.5) { e.castTok = 0; e.setState('walk'); e.cool = (P.rate ?? 2.6) * rand(0.9, 1.2); }
        }
        return;
      }
      case 'throw': {   // 커다란 유도 물방울 (anim 'cast')
        e.vx = 0; e.setAnim('cast');
        const wu = P.bubbleWindup ?? 0.6;
        if (e.stateT > wu) {
          if (!e.didHit && p) {
            e.didHit = true;
            const y = e.bottom - e.h * 0.7, a = angleTo(e.cx, y, p.cx, p.cy), s = P.bubbleSpeed ?? 150;
            const pop = (pro, w) => { w.fx.burst('water', pro.cx, pro.cy, 12, { speed: 200 }); w.fx.ring(pro.cx, pro.cy, { color: '#bfefff', r0: 8, r1: 34, life: 0.25, width: 3 }); audio.sfx('splash', { vol: 0.35, pitch: 1.8 }); };
            bolt(e, {
              x: e.cx + e.facing * 16, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, w: 44, h: 44, behavior: 'homing', homingTurn: P.homing ?? 1.5, homingDelay: 0.2,
              life: 4, render: pr('bubble', SI.bubble), light: { r: 60, color: '#8ad8ff', i: 0.45 },
              onExpire: pop, onWall: (pro, w) => { pop(pro, w); pro.dead = true; },
              attack: { mv: P.bubbleMv ?? 1.2, kb: [240, -300] },
            });
            audio.sfx('splash', { pitch: 1.6, vol: 0.4 });
          }
          if (e.stateT > wu + 0.4) { e.setState('walk'); e.cool = (P.rate ?? 2.6) * rand(0.9, 1.2); }
        }
        return;
      }
      case 'gather': {   // 물의 축복 (anim 'bless')
        e.vx = 0; e.setAnim('bless');
        const wu = P.blessWindup ?? 0.6, t = e.healT;
        if (e.stateT > wu) {
          if (!e.didHit) {
            e.didHit = true; e.blessCd = P.blessCd ?? 8;
            if (t && stillHere(t) && t.stats?.maxHp) {
              const n = Math.round(t.stats.maxHp * (P.heal ?? 0.2));
              t.hp = Math.min(t.stats.maxHp, t.hp + n);
              world.fx.ring(t.cx, t.cy, { color: '#8ae8ff', r0: 10, r1: Math.max(t.w, t.h) * 0.9, life: 0.4, width: 4 });
              puff(world, 'water', t.cx, t.bottom - 10, 12, { angle: -PI / 2, spread: 0.8, speed: 200 });
              if (world.game?.settings?.showDamage !== false) world.fx.text(t.cx, t.y - 8, '+' + n, { color: '#7fe8d0', size: 16 });
              audio.sfx('heal', { vol: 0.4, pitch: 1.2 });
            }
          } else if (e.blessCd <= 0) e.blessCd = 3;   // 끊긴 축복은 조금 뒤 다시
          if (e.stateT > wu + 0.35) { e.healT = null; e.setState('walk'); e.cool = Math.max(e.cool, 0.6); }
        }
        return;
      }
      default: {
        if (seesP(e, p, P.sight ?? 560, 260)) {
          faceP(e);
          if (e.blessCd <= 0 && e.onGround) {
            const t = this.findWounded(e, world);
            if (t) { e.healT = t; e.setState('gather'); e.didHit = false; e.vx = 0; world.fx.ring(e.cx, e.cy, { color: '#8ae8ff', r0: 40, r1: 6, life: 0.3, width: 3 }); return; }
            e.blessCd = 1;
          }
          if (e.cool <= 0 && e.onGround) {
            e.pick ^= 1;
            if (e.pick) this.startGeyser(e, world);
            else { e.setState('throw'); e.setAnim('cast'); e.didHit = false; e.vx = 0; audio.sfx('magic', { pitch: 1.3, vol: 0.3 }); }
            return;
          }
          const adx = Math.abs(p.cx - e.cx);
          chase(e, adx < (P.near ?? 180) ? -e.facing : adx > (P.far ?? 360) ? e.facing : 0, e.speed);
        } else patrol(e, 0.4);
        e.setAnim(Math.abs(e.vx) > 3 ? 'walk' : 'idle');
      }
    }
  },
};

/** 세이렌: 공중을 헤엄치듯 거리 유지. 노래 → 틈 하나 있는 파문 / 겨냥 → 급강하 할퀴기 → 물러남. 2초 안에 3번 맞으면 물보라 속으로 사라졌다 나타남 */
AI_C.siren = {
  init(e) { e.cool = rand(1.0, 1.8); e.side = chance(0.5) ? 1 : -1; e.pick = chance(0.5) ? 1 : 0; e.hitTimes = []; e.vanishReq = false; ensureMag(e); },
  ring(e, world) {
    const P = e.params, cx = e.cx, cy = e.cy;
    const sp = P.ringSpeed ?? 260, r0 = 20, r1 = P.ringMax ?? 360;
    addZone(world, {
      x: cx - r0, y: cy - r0, w: r0 * 2, h: r0 * 2, life: (r1 - r0) / sp, owner: e, z: 6, render: zr('songring', SI.songring),
      light: { r: 90, color: '#9fe8ff', i: 0.5 },
      data: { cx, cy, r: r0, r0, sp, gapA: rand(0, TAU), gap: (P.gap ?? 50) * PI / 180, th: P.ringThick ?? 16 },
      attack: atk(e, P.ringMv ?? 1.0, { type: 'mag', hitId: nid('sr'), kb: [260, -260] }),
      follow: (z) => { const d = z.data; d.r = d.r0 + d.sp * z.t; z.x = d.cx - d.r; z.y = d.cy - d.r; z.w = z.h = d.r * 2; },
      hitTest: (z, w) => {
        const pl = w.player, d = z.data;
        if (!pl || pl.dead) return false;
        const hb = pl.hurtbox();
        // 몸 사각형이 고리 띠(r ± th/2)에 걸치는가
        const nx = clamp(d.cx, hb.x, hb.x + hb.w), ny = clamp(d.cy, hb.y, hb.y + hb.h);
        const dmin = Math.hypot(nx - d.cx, ny - d.cy);
        const fx = Math.max(Math.abs(hb.x - d.cx), Math.abs(hb.x + hb.w - d.cx)), fy = Math.max(Math.abs(hb.y - d.cy), Math.abs(hb.y + hb.h - d.cy));
        const dmax = Math.hypot(fx, fy);
        if (dmin > d.r + d.th / 2 || dmax < d.r - d.th / 2) return false;
        // 틈 (몸 가운데 방향)
        const a = Math.atan2(pl.cy - d.cy, pl.cx - d.cx), da = Math.atan2(Math.sin(a - d.gapA), Math.cos(a - d.gapA));
        if (Math.abs(da) < d.gap / 2) return false;
        z.attack.dir = Math.sign(pl.cx - d.cx) || 1;
        return true;
      },
    });
    audio.sfx('bell', { pitch: 1.3, vol: 0.45 }); audio.sfx('magic', { pitch: 1.8, vol: 0.3 });
  },
  /** 사라진 뒤 나타날 자리: 300 px 안의 물 칸(약 200 px 떨어진 곳) → 없으면 좌우 200 px 중 빈 곳 */
  relocate(e, world) {
    const p = e.player, m = world.map;
    let best = null, bd = 1e9;
    const tx0 = Math.floor(e.cx / TILE), ty0 = Math.floor(e.cy / TILE);
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const tx = tx0 + dx, ty = ty0 + dy;
      if (m.typeAt(tx, ty) !== T.LIQUID) continue;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2, d = Math.hypot(x - e.cx, y - e.cy);
      if (d > 300 || d < 120) continue;
      const sc = Math.abs(d - 200);
      if (sc < bd && rectFree(world, x - e.w / 2, y - e.h / 2, e.w, e.h)) { bd = sc; best = { x, y }; }
    }
    if (!best && p) {
      const away = Math.sign(e.cx - p.cx) || 1;
      for (const s of [away, -away]) {
        const x = e.cx + s * 200;
        if (x > e.w && x < m.pxW - e.w && rectFree(world, x - e.w / 2, e.y, e.w, e.h)) { best = { x, y: e.cy }; break; }
      }
    }
    if (best) { e.cx = best.x; e.y = best.y - e.h / 2; }
    e.vx = 0; e.vy = 0;
  },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    if (e.vanishReq && e.state !== 'vanish' && e.state !== 'appear') {
      e.vanishReq = false; e.hitTimes.length = 0;
      e.setState('vanish'); e.setAnim('vanish');
      puff(world, 'water', e.cx, e.cy, 16, { speed: 220 });
      audio.sfx('splash', { pitch: 1.5, vol: 0.45 });
    }
    switch (e.state) {
      case 'cast': {   // 노래 (anim 'sing')
        e.vx *= 0.9; e.vy *= 0.9; faceP(e); e.setAnim('sing');
        spark(world, 'magic', e.cx + rand(-14, 14), e.y + 14, 0.4, { color: '#9fe8ff', speed: 50, angle: -PI / 2, spread: 1 });
        const wu = P.sing ?? 0.8;
        if (e.stateT > wu) {
          if (!e.didHit) { e.didHit = true; this.ring(e, world); }
          if (e.stateT > wu + 0.35) { e.setState('float'); e.cool = (P.rate ?? 2.4) * rand(0.9, 1.2); }
        }
        return;
      }
      case 'aim': {   // 급강하 겨냥 (anim 'dive')
        e.vx *= 0.85; e.vy *= 0.85; faceP(e); e.setAnim('dive');
        e.aimX = p.cx; e.aimY = p.cy;
        if (e.stateT > (P.aim ?? 0.4)) {
          if (!e.didHit) {
            e.setState('dive'); e.bit = false; e.diveId = nid('sd');
            const a = angleTo(e.cx, e.cy, e.aimX, e.aimY);
            e.diveVx = Math.cos(a); e.diveVy = Math.sin(a);
            audio.sfx('dash', { vol: 0.4, pitch: 1.4 });
          } else { e.setState('float'); e.cool = (P.rate ?? 2.4) * 0.6; }
        }
        return;
      }
      case 'dive': {
        e.setAnim('dive');
        const sp = P.dive ?? 480;
        e.vx = e.diveVx * sp; e.vy = e.diveVy * sp;
        if (Math.abs(e.vx) > 5) e.facing = Math.sign(e.vx);
        if (!e.didHit && e.strike(-e.w * 0.3, -e.h, e.w * 0.9, e.h, P.clawMv ?? 1.3, { hitId: e.diveId, kb: [340, -300] })) { e.didHit = true; e.bit = true; }
        spark(world, 'water', e.cx, e.cy, 0.3, { speed: 40, alpha: 0.6 });
        // 목표를 지나침 · 명중 · 끊김 · 시간 초과 · 벽 → 물러남
        const past = (e.aimX - e.cx) * e.diveVx + (e.aimY - e.cy) * e.diveVy < -20;
        if (past || e.bit || (e.didHit && !e.bit) || e.stateT > 0.8 || solidAt(world, e.cx + e.vx * 0.05, e.cy + e.vy * 0.05)) {
          e.setState('retreat'); e.vx *= 0.3; e.vy = -200;
        }
        return;
      }
      case 'retreat':
        e.setAnim('float');
        hover(e, e.cx + (Math.sign(e.cx - p.cx) || 1) * 120, p.bottom - 170, 2.5, dt, e.speed * 1.6);
        if (e.stateT > 0.5) { e.setState('float'); e.cool = (P.rate ?? 2.4) * rand(0.9, 1.2); }
        return;
      case 'vanish':
        e.setAnim('vanish'); e.vx = 0; e.vy = 0;
        e.alpha = 1 - clamp(e.stateT / 0.3, 0, 1); e.invuln = e.stateT > 0.15; e.harmless = true;
        if (e.stateT > 0.3) {
          this.relocate(e, world);
          puff(world, 'water', e.cx, e.cy, 14, { speed: 160 });
          e.setState('appear'); e.setAnim('appear');
        }
        return;
      case 'appear':
        e.setAnim('appear'); e.vx = 0; e.vy = 0; e.alpha = clamp(e.stateT / 0.3, 0, 1);
        if (e.stateT > 0.3) { e.alpha = 1; e.invuln = false; e.harmless = false; e.setState('float'); e.cool = Math.max(e.cool, 0.5); }
        return;
    }
    // float
    const keep = P.keep ?? 240;
    if (Math.abs(p.cx - e.cx) > keep * 2.2) e.side = Math.sign(e.cx - p.cx) || 1;
    sideFor(e, world, p, keep, -130);
    hover(e, p.cx + e.side * keep, p.bottom - 130 + Math.sin(e.t * 1.3) * 24, 1.7, dt, e.speed * 1.5);
    faceP(e); e.setAnim('float');
    if (e.cool <= 0 && e.distToPlayer() < (P.range ?? 560)) {
      e.pick ^= 1; e.didHit = false;
      if (e.pick) { e.setState('cast'); e.setAnim('sing'); audio.sfx('magic', { pitch: 1.5, vol: 0.25 }); }
      else { e.setState('aim'); e.setAnim('dive'); audio.sfx('ghost', { pitch: 1.6, vol: 0.3 }); }
    }
  },
  onHit(e) {
    const now = e.t;
    e.hitTimes.push(now);
    while (e.hitTimes.length && now - e.hitTimes[0] > 2) e.hitTimes.shift();
    if (e.hitTimes.length >= 3 && e.state !== 'vanish' && e.state !== 'appear') e.vanishReq = true;
  },
};
