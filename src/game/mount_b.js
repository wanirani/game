// 2부 탈것 레지스트리 — owner: CMP-MOUNT-B (MASTER_PLAN §1.2 Part 2 mounts · companions §3.4–3.9 · world2 §14)
//
//  MOUNT_B[id] = { charge?, special?, passive? } — mount.js (MountRider) 가 부를 때마다 읽는다 (모듈 최상위에서 읽지 않음).
//   charge.start(r, world, p, dir) → false 면 돌진 거절 · charge.tick(r, world, p, dt) · charge.end(r, world, p, why)
//   special.start(r, world, p) → true = 시전함 (재사용 대기·이름 표시·줌은 MountRider.trySpecial 이 건다)
//   passive.tick(r, world, p, dt) · passive.hazard(r, kind, p, world) → true|false|undefined(기본 규칙) · passive.land(r, world, p, vyBefore)
//
//  데이터만으로 이미 되는 것 (data/companions.js → mount.js):
//   8방향 돌진 (charge.dir8) · 돌진 불씨 자국 (charge.trail) · 활공·날갯짓 2회 (flight) · 공중 점프 · 용암 피해 ×0.5 (hazard.lava) ·
//   독 면역 (hazard.poison 0) · 돌풍 ×0.5 (def.windMul → gimmicks.js) · 부패 게이지 ×0.5 (def.blightMul → gimmicks_b.js)
//  여기서 하는 것:
//   mt_ignis 이그니스 「화염 돌진」 몸에 두른 불길 · 「업화 발굽」 앞들기 0.3초(무적) → 내리찍기 + 양옆 70/140/210px 불기둥이 차례로 ·
//            갈기 불씨 · 불타는 발굽 자국 · 무거운 착지 불꽃
//   mt_gale  게일     「질풍 돌격」 번개 꼬리 · 「뇌명 급강하」 (땅: 도약 −700 → 멈칫 → 급강하 / 공중: 곧바로) 내리꽂히며 부딪힌 적 감전 →
//            착지 충격파 r 140 + 번개 기둥 ±120/±240 · 활공 깃털·바람 줄기 · 질주 발굽 정전기
//   mt_silva 실바     「뿔 돌격」 성광 꼬리·잎사귀 · 「정화의 울음」 원 r 240 (경직) + 부패 게이지 −40 + 둘레 포자 구름 흩기·포자 주머니 정화 +
//            기수 HP 5% 회복 · 뿔 사이 빛 방울 · 발굽 자리에 돋는 새싹 · 독 웅덩이를 밟으면 정화 반짝임
//
//  탈것 애니메이션 이름 (CMP-MOUNT-ART 가 그린다): 이그니스 'rear' → 'special'(내리찍기) · 게일 'jump'(도약) → 'dive' → 'land' · 실바 'howl'
//   기수 자세: 'ride_rear' (앞들기·도약·울음) · 'ride_charge' (급강하)
//  그리기 콜백(Hitbox render · fx.ghost)에는 Math.random·fx.emit 이 없다 (무작위는 갱신 때 정해 둔다).
//  순환 import 규칙: 가져온 값(TILE, GRAVITY …)은 함수 안에서만 쓴다.
import { TILE } from '../core/game.js';
import { T, isSolidType, GRAVITY } from '../core/physics.js';
import { audio } from '../core/audio.js';
import { input } from '../core/input.js';
import { clamp, rand, TAU } from '../core/math.js';
import * as HFX from '../render/hitfx.js';

// ───────────────────────── 공용 도우미 ─────────────────────────
const q = (world) => world?.fx?.quality ?? 1;
const nq = (world, n) => Math.max(1, Math.round(n * q(world)));
const sfx = (name, o) => { try { audio.sfx(name, o); } catch { /* 소리 없음 */ } };
const rumble = (strong, weak, ms) => { try { input.rumble?.(strong, weak, ms); } catch { /* 진동 없음 */ } };
/** hitfx 의 빛 스프라이트 (미리 구워 두는 색만 쓴다: #ff7a2a · #bfe0ff · #fff2a0) */
const glowImg = (c) => { try { return HFX.glow?.(c) ?? null; } catch { return null; } };
const faceOf = (r, p) => (r.chargeDir?.x > 0 ? 1 : r.chargeDir?.x < 0 ? -1 : (p.facing || 1));

/** 탈것마다 따로 두는 이 모듈의 상태 (MountRider 필드와 섞이지 않게) */
const ST = new WeakMap();
function st(r) {
  let s = ST.get(r);
  if (!s) { s = { dist: 0, alt: 0, fxT: 0, featherT: 0, sparkT: -9 }; ST.set(r, s); }
  return s;
}

/** x 열의 바닥 y (발 높이 from 근처: 한 칸 위 턱 ~ 네 칸 아래). 벽 속이면 null, 낭떠러지면 from 그대로 */
function groundAt(world, x, from) {
  const m = world?.map;
  if (!m?.typeAt || !Number.isFinite(x) || !Number.isFinite(from)) return from;
  const tx = Math.floor(x / TILE), ty0 = Math.floor((from - 1) / TILE);
  if (isSolidType(m.typeAt(tx, ty0))) return isSolidType(m.typeAt(tx, ty0 - 1)) ? null : ty0 * TILE;
  for (let ty = ty0 + 1; ty <= ty0 + 4; ty++) {
    const t = m.typeAt(tx, ty);
    if (isSolidType(t) || t === T.ONEWAY) return ty * TILE;
  }
  return from;
}
/** x0 → x1 사이 높이 y 에 벽이 있는가 (한 칸짜리 턱은 y 를 턱 위로 잡아 넘긴다) */
function wallBetween(world, x0, x1, y) {
  const m = world?.map;
  if (!m?.typeAt) return false;
  const d = x1 - x0, s = Math.sign(d) || 1, L = Math.abs(d), ty = Math.floor(y / TILE);
  for (let k = 16; k < L + 16; k += 16) {
    const x = x0 + s * Math.min(L, k);
    if (isSolidType(m.typeAt(Math.floor(x / TILE), ty))) return true;
  }
  return false;
}
/**
 * 기수 양옆(또는 앞)으로 at[] 거리마다 바닥에서 솟는 판정 기둥 (불기둥 · 번개 기둥). 벽을 넘지는 않는다.
 * o = { at, both, delay0, stagger, w, h, life, atk(side, i) → attack, render, tick, light, pts() }  반환: 만든 수
 */
function spawnLine(r, world, p, o) {
  const x0 = p.cx, b0 = p.bottom, f = p.facing || 1;
  const sides = o.both ? [f, -f] : [f];
  let n = 0;
  for (const s of sides) {
    let px = x0;
    for (let i = 0; i < o.at.length; i++) {
      const x = x0 + s * o.at[i];
      if (wallBetween(world, px, x + s * o.w * 0.3, b0 - 60)) break;   // 기둥이 벽에 반쯤 묻히지 않게 (가운데 너머로 30% 여유)
      px = x;
      const g = groundAt(world, x, b0);
      if (g == null) break;
      r.hit(world, {
        x: x - o.w / 2, y: g - o.h, w: o.w, h: o.h, life: o.life, delay: (o.delay0 ?? 0) + i * (o.stagger ?? 0),
        attack: o.atk(s, i), render: o.render, tick: o.tick, light: null, lightDef: o.light ?? null,
        side: s, lead: f, idx: i, fired: false, pts: o.pts ? o.pts() : null, jt: 0,
      });
      n++;
    }
  }
  return n;
}
/** 발굽 자국: 땅 위에서 기본 속도의 절반 이상으로 달릴 때 spacing px 마다 make(world, x, y, big, facing) */
function hoofPrints(r, world, p, dt, s, make, spacing) {
  if (!p.onGround || r.chargeT > 0 || r.inWater || r._wet || r.act) { s.dist = Math.min(s.dist, spacing * 0.5); return; }
  const qq = q(world);
  if (qq < 0.5) return;
  const sp = Math.abs(p.vx), base = typeof r.baseSpeed === 'function' ? r.baseSpeed(p) : 400;
  if (sp < base * 0.5) return;
  s.dist += sp * dt;
  const gap = spacing * (qq >= 0.95 ? 1 : 1.5);
  if (s.dist < gap) return;
  s.dist = Math.min(s.dist - gap, gap);
  s.alt ^= 1;
  const f = p.facing || 1;
  make(world, p.cx + f * (s.alt ? 16 : -18), p.bottom, !!r.awakened, f);
}

// ───────────────────────── 이그니스 (화염 군마) ─────────────────────────
/** 불타는 발굽 자국 (fx.ghost 'back' 층: 타일 위 · 개체 뒤). 막 찍힌 자국엔 작은 불꽃 혀가 핀다 */
function emberPrint(world, x, y, big) {
  const fx = world?.fx, g = glowImg('#ff7a2a');
  if (!fx?.ghost || !g) return;
  const w = big ? 34 : 28, life = big ? 1.5 : 1.2, ph = x * 0.37;
  fx.ghost((ctx, a) => {
    const k = clamp(a * 2, 0, 1);
    if (k <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = 0.55 * k; ctx.fillStyle = '#1a0806';   // 그을린 발굽 자국
    ctx.beginPath(); ctx.ellipse(x, y - 1, w * 0.36, 3.4, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.95 * k;
    ctx.drawImage(g, x - w / 2, y - 8, w, 13);
    ctx.globalAlpha = 0.8 * k; ctx.fillStyle = '#ffd070';   // 달아오른 속
    ctx.beginPath(); ctx.ellipse(x, y - 1.5, w * 0.2, 1.7, 0, 0, TAU); ctx.fill();
    if (k > 0.5) {
      const u = (k - 0.5) * 2, hh = u * (big ? 16 : 11), sw = Math.sin((world.time ?? 0) * 22 + ph) * 2;
      ctx.globalAlpha = 0.7 * u; ctx.fillStyle = '#ffa040';
      ctx.beginPath(); ctx.moveTo(x - 5, y - 1); ctx.quadraticCurveTo(x - 3, y - hh * 0.6, x + sw, y - hh); ctx.quadraticCurveTo(x + 3, y - hh * 0.6, x + 5, y - 1); ctx.fill();
    }
    ctx.restore();
  }, life, 'back');
  if (Math.random() < 0.6 * q(world)) fx.emit('ember', x, y - 3, { angle: -Math.PI / 2, spread: 0.6, speed: rand(30, 90) });
}
const FIRE_LAYERS = [['#ff4a12', 1.0, 0.5], ['#ff9a30', 0.66, 0.55], ['#fff0b0', 0.32, 0.7]];
/** 불기둥 (Hitbox render). 솟기 전(delay)에는 땅이 달아오르는 예고만 */
function drawFirePillar(ctx, h) {
  const age = h.t - (h.delay ?? 0), cx = h.x + h.w / 2, base = h.y + h.h;
  const g = glowImg('#ff7a2a');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (age < 0) {
    if (g) { ctx.globalAlpha = 0.3 + 0.4 * clamp(1 + age / 0.1, 0, 1); ctx.drawImage(g, cx - 30, base - 8, 60, 14); }
    ctx.restore();
    return;
  }
  const grow = Math.min(1, age / 0.07), fade = clamp(h.life / 0.18, 0, 1);
  const H = h.h * grow * (0.85 + 0.15 * fade), top = base - H, hw = h.w / 2, t = h.t;
  for (let i = 0; i < 3; i++) {
    const L = FIRE_LAYERS[i], w = hw * 1.2 * L[1], sw = Math.sin(t * 17 + i * 1.9 + cx * 0.05) * (6 - i * 1.5);
    ctx.globalAlpha = L[2] * fade; ctx.fillStyle = L[0];
    ctx.beginPath();
    ctx.moveTo(cx - w, base);
    ctx.bezierCurveTo(cx - w * 1.15, base - H * 0.45, cx - w * 0.45 + sw, top + H * 0.2, cx + sw * 1.3, top - (i === 0 ? 10 : 4));
    ctx.bezierCurveTo(cx + w * 0.45 + sw, top + H * 0.2, cx + w * 1.15, base - H * 0.45, cx + w, base);
    ctx.closePath(); ctx.fill();
  }
  if (g) { ctx.globalAlpha = 0.85 * fade; ctx.drawImage(g, cx - 48, base - 18, 96, 30); }
  ctx.restore();
}
function firePillarTick(h, world) {
  if (!h.fired) {   // 솟는 순간: 불길 · 자갈 · 소리 (앞쪽 기둥만) · 작은 흔들림
    h.fired = true; h.light = h.lightDef;
    const cx = h.x + h.w / 2, base = h.y + h.h;
    world.fx?.burst('fire', cx, base - 10, nq(world, 8), { angle: -Math.PI / 2, spread: 0.35, speed: 420 });
    world.fx?.burst('gravel', cx, base - 4, nq(world, 5), { angle: -Math.PI / 2, spread: 1.2, speed: 220 });
    if (h.side === h.lead) sfx('fire', { vol: 0.55, pitch: 0.85 + h.idx * 0.12 });
    world.camera?.shake?.(2, 0.08);
    return;
  }
  if (Math.random() < 0.5 * q(world)) world.fx?.emit('ember', h.x + h.w / 2 + rand(-14, 14), h.y + h.h * rand(0.2, 0.9), { angle: -Math.PI / 2, spread: 0.5, speed: rand(80, 200) });
}
/** 업화 발굽 2단: 내리찍기 판정 + 양옆 불기둥 + 연출 */
function ignisStomp(r, world, p, sp) {
  const f = p.facing || 1, so = sp.stomp ?? {}, b = so.box ?? { x: -100, y: -60, w: 200, h: 60 };
  r.strike(world, { x: p.cx + b.x, y: p.bottom + b.y, w: b.w, h: b.h }, r.atk({
    mv: r.power(so.mv ?? 1.0), type: sp.type ?? 'phys', element: sp.element ?? 'fire', launch: so.launch !== false, kb: so.kb ?? [300, -420],
    stun: 0.3, hitstop: sp.hitstop ?? 0.08, shake: sp.shake ?? 7, tags: ['mount', 'special'], breakWalls: true,
  }, p));
  const pl = sp.pillars ?? {};
  spawnLine(r, world, p, {
    at: pl.at ?? [70, 140, 210], both: pl.both !== false, delay0: 0.02, stagger: pl.stagger ?? 0.08,
    w: pl.w ?? 44, h: pl.h ?? 150, life: pl.life ?? 0.5,
    atk: (s) => r.atk({ mv: r.power(pl.mv ?? 0.9), type: 'mag', element: sp.element ?? 'fire', launch: true, kb: [140, -520], stun: 0.2, hitstop: 0.04, shake: 3, dir: s, tags: ['mount', 'special'] }, p),
    render: drawFirePillar, tick: firePillarTick, light: { r: 110, color: '#ff8a2a', i: 0.8 },
  });
  const fx = world.fx;
  fx?.ering?.(p.cx, p.bottom, { color: '#ff8a2a', r0: 10, r1: 220, ry: 0.22, life: 0.45, width: 8 });
  fx?.ering?.(p.cx, p.bottom, { color: '#fff0b0', r0: 6, r1: 120, ry: 0.22, life: 0.3, width: 4 });
  fx?.flash?.(p.cx + f * 20, p.bottom - 20, { color: '#ffb060', size: 150, life: 0.12 });
  fx?.burst('fire', p.cx, p.bottom - 6, nq(world, 18), { angle: -Math.PI / 2, spread: 1.6, speed: 260 });
  fx?.burst('ember', p.cx, p.bottom - 6, nq(world, 16), { angle: -Math.PI / 2, spread: 1.4, speed: 300 });
  fx?.burst('shard', p.cx, p.bottom - 4, nq(world, 12), { angle: -Math.PI / 2, spread: 1.3, speed: 340, color: '#5a2a18' });
  fx?.burst('dust', p.cx, p.bottom, nq(world, 12), { speed: 200 });
  try { HFX.stampDecal?.(world, p.cx, p.bottom - 4, f, 'scorch', { floor: true, scale: 1.6, life: 8 }); } catch { /* 자국 없음 */ }
  world.camera?.shake?.(sp.shake ?? 7, 0.3);
  sfx('hoof_land', { vol: 1.1 }); sfx('explode', { vol: 0.55, pitch: 0.75 }); sfx('fire', { vol: 0.8 });
  rumble(0.7, 0.45, 160);
  r.startAct({ name: 'stomp', dur: 0.3, anim: 'special', riderAnim: 'ride', moveMul: 0.2, rearK: 0 });
}

const IGNIS = {
  charge: {
    /** 화염 돌진: 불꽃 고리와 함께 뛰쳐나간다 (데이터: 화염 1.3 · 띄우기 · 불씨 자국 1초) */
    start(r, world, p, dir) {
      const fx = world.fx, f = dir?.x < 0 ? -1 : 1;
      fx?.burst('fire', p.cx, p.cy, nq(world, 10), { angle: f > 0 ? Math.PI : 0, spread: 1.2, speed: 200 });
      fx?.ering?.(p.cx, p.bottom - 4, { color: '#ff8a2a', r0: 8, r1: 70, ry: 0.3, life: 0.3, width: 5 });
      sfx('fire', { vol: 0.6, pitch: 1.1 });
    },
    /** 몸에 두른 불길이 뒤로 흩날린다 */
    tick(r, world, p) {
      const qq = q(world), f = faceOf(r, p), back = f > 0 ? Math.PI : 0;
      if (Math.random() < 0.9 * qq) world.fx?.emit('fire', p.cx + f * rand(-10, 24), p.bottom - rand(20, 80), { angle: back, spread: 0.4, speed: rand(120, 260) });
      if (Math.random() < 0.6 * qq) world.fx?.emit('ember', p.cx - f * rand(10, 30), p.bottom - rand(10, 70), { angle: back, spread: 0.6, speed: rand(60, 180) });
    },
    end(r, world, p, why) {
      if (why === 'wall') world.fx?.burst('fire', p.cx + (p.facing || 1) * p.w / 2, p.cy, nq(world, 10), { speed: 220 });
    },
  },
  /** 업화 발굽: 앞발을 치켜들었다가 (무적) 내리찍고, 양옆으로 불기둥 세 줄기가 차례로 솟는다 */
  special: {
    start(r, world, p) {
      const sp = r.def?.special ?? {};
      r.startAct({
        name: 'rear', dur: sp.rear ?? 0.3, anim: 'rear', riderAnim: 'ride_rear', moveMul: 0, rearK: 1, invuln: sp.invuln ?? 0.3, noJump: true,
        tick(rr, w, pp) {   // 치켜든 발굽에서 불씨가 흩날린다
          if (Math.random() < 0.6 * q(w)) w.fx?.emit('ember', pp.cx + (pp.facing || 1) * rand(16, 40), pp.bottom - rand(40, 80), { speed: 80 });
        },
        end(rr, w, pp) { ignisStomp(rr, w, pp, sp); },
      });
      r.cry(world, { vol: 0.95 });
      world.fx?.burst('fire', p.cx + (p.facing || 1) * 30, p.bottom - 60, nq(world, 8), { angle: -Math.PI / 2, spread: 0.8, speed: 120 });
      sfx('fire', { vol: 0.5, pitch: 0.8 });
      return true;
    },
  },
  passive: {
    /** 갈기·꼬리 불씨 + 달릴 때 불타는 발굽 자국 (용광로의 피) */
    tick(r, world, p, dt) {
      const s = st(r);
      s.fxT -= dt;
      if (s.fxT <= 0) {
        s.fxT = 0.12 / Math.max(0.4, q(world));
        world.fx?.emit('ember', p.cx - (p.facing || 1) * rand(-6, 26), p.bottom - rand(50, 86), { angle: -Math.PI / 2, spread: 0.7, speed: rand(30, 80) });
      }
      hoofPrints(r, world, p, dt, s, emberPrint, 58);
    },
    /** 무거운 착지: 발밑에 불꽃 고리 */
    land(r, world, p, vyBefore) {
      if (!(vyBefore > 700)) return;
      world.fx?.ering?.(p.cx, p.bottom, { color: '#ff8a2a', r0: 8, r1: 90, ry: 0.25, life: 0.35, width: 5 });
      world.fx?.burst('ember', p.cx, p.bottom - 4, nq(world, 10), { angle: -Math.PI / 2, spread: 1.8, speed: 200 });
      emberPrint(world, p.cx - 14, p.bottom, true); emberPrint(world, p.cx + 14, p.bottom, true);
    },
  },
};

// ───────────────────────── 게일 (폭풍 그리핀) ─────────────────────────
/** 번개 모양: 위→아래 n 마디의 가로 흔들림 (양 끝은 0) */
function boltPts(n = 9) {
  const a = new Array(n + 1).fill(0);
  for (let i = 1; i < n; i++) a[i] = rand(-14, 14);
  return a;
}
/** 번개 기둥 (Hitbox render): 하늘에서 떨어지는 굵은 번개 + 기둥 안개 + 땅 섬광 */
function drawBoltColumn(ctx, h) {
  const age = h.t - (h.delay ?? 0), cx = h.x + h.w / 2, base = h.y + h.h, top = h.y - 60;
  const g = glowImg('#bfe0ff');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (age < 0) {   // 예고: 땅 위에 푸른 불꽃이 튄다
    if (g) { ctx.globalAlpha = 0.35; ctx.drawImage(g, cx - 26, base - 10, 52, 18); }
    ctx.restore();
    return;
  }
  const fade = clamp(h.life / 0.15, 0, 1), flick = age < 0.06 ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(h.t * 40));
  ctx.globalAlpha = 0.18 * fade; ctx.fillStyle = '#6fb8ff';
  ctx.fillRect(h.x, top, h.w, base - top);
  const P = h.pts;
  if (P && P.length > 1) {
    const n = P.length - 1;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const y = top + (base - top) * (i / n), x = cx + P[i]; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 9; ctx.globalAlpha = 0.45 * fade * flick; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.95 * fade * flick; ctx.stroke();
  }
  if (g) { ctx.globalAlpha = 0.9 * fade; ctx.drawImage(g, cx - 44, base - 22, 88, 36); }
  ctx.restore();
}
function boltTick(h, world, dt) {
  if (!h.fired) {
    h.fired = true; h.light = h.lightDef;
    const cx = h.x + h.w / 2, base = h.y + h.h;
    world.fx?.burst('thunder', cx, base - 8, nq(world, 10), { angle: -Math.PI / 2, spread: 1.4, speed: 420 });
    world.fx?.burst('gravel', cx, base - 4, nq(world, 4), { angle: -Math.PI / 2, spread: 1.2, speed: 200 });
    if (h.side === h.lead) sfx('thunder', { vol: 0.6, pitch: 1.2 - h.idx * 0.15 });
  }
  h.jt -= dt;   // 번개 모양은 0.05초마다 다시 떤다 (그리기 밖에서)
  if (h.jt <= 0 && h.pts) { h.jt = 0.05; for (let i = 1; i < h.pts.length - 1; i++) h.pts[i] = rand(-14, 14); }
}
/** 뇌명 급강하 착지: 충격파 + 번개 기둥 + 짧은 착지 동작 */
function galeShock(r, world, p, a) {
  if (!a || a.shocked) return;
  a.shocked = true; a.phase = 'done';
  const sp = r.def?.special ?? {}, sh = sp.shock ?? {}, R0 = sh.r ?? 140;
  r.strike(world, { x: p.cx - R0, y: p.bottom - 100, w: R0 * 2, h: 106 }, r.atk({
    mv: r.power(sh.mv ?? 1.3), type: sp.type ?? 'mag', element: sp.element ?? 'thunder', launch: true, kb: [340, -480], stun: 0.5,
    hitstop: sp.hitstop ?? 0.08, shake: sp.shake ?? 7, tags: ['mount', 'special'],
  }, p));
  const cl = sp.columns ?? {};
  spawnLine(r, world, p, {
    at: cl.at ?? [120, 240], both: cl.both !== false, delay0: 0.03, stagger: 0.07, w: cl.w ?? 40, h: cl.h ?? 220, life: cl.life ?? 0.4,
    atk: (s) => r.atk({ mv: r.power(cl.mv ?? 0.8), type: 'mag', element: sp.element ?? 'thunder', stun: cl.stun ?? 0.4, kb: [160, -300], hitstop: 0.04, shake: 3, dir: s, tags: ['mount', 'special'] }, p),
    render: drawBoltColumn, tick: boltTick, light: { r: 130, color: '#bfe0ff', i: 0.9 }, pts: () => boltPts(9),
  });
  const fx = world.fx;
  fx?.ering?.(p.cx, p.bottom, { color: '#bfe0ff', r0: 10, r1: R0 * 1.3, ry: 0.28, life: 0.4, width: 8 });
  fx?.ering?.(p.cx, p.bottom, { color: '#ffffff', r0: 6, r1: R0 * 0.7, ry: 0.28, life: 0.25, width: 3 });
  fx?.flash?.(p.cx, p.bottom - 30, { color: '#dff0ff', size: 190, life: 0.14 });
  fx?.burst('thunder', p.cx, p.bottom - 10, nq(world, 22), { angle: -Math.PI / 2, spread: 2.6, speed: 520 });
  fx?.burst('dust', p.cx, p.bottom, nq(world, 14), { angle: -Math.PI / 2, spread: 2.6, speed: 220 });
  fx?.burst('shard', p.cx, p.bottom - 4, nq(world, 10), { angle: -Math.PI / 2, spread: 1.3, speed: 320 });
  fx?.burst('feather', p.cx, p.bottom - 50, nq(world, 6), { color: '#e8e0d0', speed: 160 });
  world.game?.flash?.('#e8f4ff', 0.28, 6);
  world.camera?.shake?.(sp.shake ?? 7, 0.3);
  sfx('thunderclap', { vol: 0.9 }); sfx('explode', { vol: 0.5, pitch: 1.2 });
  rumble(0.8, 0.5, 170);
  r.invulnT = Math.max(r.invulnT ?? 0, 0.25);
  r.startAct({ name: 'thunderland', dur: 0.26, anim: 'land', riderAnim: 'ride', moveMul: 0.15, noJump: true });
}
/** 뇌명 급강하 진행: leap (도약) → hang (0.08초 멈칫, 번개를 모은다) → dive (내리꽂힘) → 착지 = galeShock */
function galeDiveTick(r, world, p, a, dt) {
  const sp = r.def?.special ?? {};
  a.phT += dt;
  if (a.phase === 'leap') {
    if (Math.random() < 0.4 * q(world)) world.fx?.emit('feather', p.cx + rand(-30, 30), p.bottom - rand(10, 50), { color: '#e8e0d0', speed: 60 });
    if (p.vy >= -90 || a.phT >= 0.45 || p.hitCeil) { a.phase = 'hang'; a.phT = 0; }
    return;
  }
  if (a.phase === 'hang') {
    p.vy = -GRAVITY * dt;   // 물리 뒤 0: 공중에서 멈칫
    p.vx *= 0.85;
    if (!a.charged) {
      a.charged = true; a.anim = 'dive'; a.riderAnim = 'ride_charge';
      world.fx?.ring(p.cx, p.cy, { color: '#bfe0ff', r0: 90, r1: 12, life: 0.12, width: 4 });
      world.fx?.burst('thunder', p.cx, p.cy, nq(world, 10), { speed: 260 });
      sfx('thunder', { vol: 0.5, pitch: 1.6 });
    }
    if (a.phT >= 0.08) {
      a.phase = 'dive'; a.phT = 0;
      p.vx *= 0.5;
      a.diveAtk = r.atk({ mv: r.power(0.5), type: 'mag', element: sp.element ?? 'thunder', kb: [140, 220], stun: 0.3, hitstop: 0.03, shake: 2, tags: ['mount', 'special'] }, p);
      sfx('dash', { vol: 0.7, pitch: 0.7 }); sfx('wing_flap', { vol: 0.8, pitch: 0.8 });
    }
    return;
  }
  if (a.phase === 'dive') {
    if (r.inWater || r._wet) { a.phase = 'done'; a.dur = a.t; return; }   // 물에 내리꽂히면 그냥 끝
    if (p.onGround && a.phT > 0) { galeShock(r, world, p, a); return; }   // 착지 훅을 놓쳤을 때
    p.vy = (sp.diveSpeed ?? 900) - GRAVITY * dt;   // 물리 뒤 정확히 급강하 속도
    r.invulnT = Math.max(r.invulnT ?? 0, 0.1);
    if (a.diveAtk) r.strike(world, { x: p.x - 6, y: p.cy, w: p.w + 12, h: p.h * 0.5 + 16 }, a.diveAtk);
    const qq = q(world);
    a.auraT = (a.auraT ?? 0) - dt;
    if (a.auraT <= 0) {   // 몸을 감싸는 번개 기운 (캐시 스프라이트 한 장)
      a.auraT = qq >= 0.95 ? 0.05 : 0.1;
      const g = glowImg('#bfe0ff');
      if (g) world.fx?.sprite?.(g, p.cx, p.cy + 6, { size: 150, life: 0.1, s0: 0.9, s1: 1.05, alpha: 0.45 });
    }
    if (Math.random() < 0.9 * qq) world.fx?.emit('thunder', p.cx + rand(-24, 24), p.y + rand(0, p.h), { angle: -Math.PI / 2, spread: 0.5, speed: rand(200, 420) });
    if (qq > 0.55 && Math.random() < 0.6) world.fx?.speedLine(p.cx + rand(-26, 26), p.y + rand(0, p.h * 0.6), -Math.PI / 2, { len: rand(60, 110), width: 2.5, color: '#dff0ff', life: 0.14, speed: 500 });
    if (a.phT > 1.2) { a.phase = 'done'; a.dur = a.t; }   // 끝없는 낙하 (구덩이): 급강하만 멈춘다
  }
}

const GALE = {
  charge: {
    /** 질풍 돌격: 번쩍 · 번개 불꽃 · 깃털 (데이터: 8방향 · 번개 1.1 · 경직 0.3) */
    start(r, world, p, dir) {
      const fx = world.fx;
      fx?.burst('thunder', p.cx, p.cy, nq(world, 12), { speed: 420 });
      fx?.flash?.(p.cx, p.cy, { color: '#bfe0ff', size: 90, life: 0.1 });
      fx?.burst('feather', p.cx, p.cy - 10, nq(world, 4), { color: '#e8e0d0', speed: 140 });
      sfx('thunder', { vol: 0.45, pitch: 1.3 });
      void dir;
    },
    /** 번개 꼬리: 진행 반대쪽으로 불꽃 · 흰 줄기 */
    tick(r, world, p) {
      const qq = q(world), d = r.chargeDir ?? { x: p.facing || 1, y: 0 }, back = Math.atan2(-d.y, -d.x);
      if (Math.random() < 0.8 * qq) world.fx?.emit('thunder', p.cx - d.x * rand(10, 40) + rand(-12, 12), p.cy - d.y * rand(10, 40) + rand(-20, 20), { angle: back, spread: 0.9, speed: rand(200, 480) });
      if (qq > 0.55 && Math.random() < 0.35) world.fx?.speedLine(p.cx - d.x * 40, p.cy + rand(-24, 24), back, { len: rand(60, 110), width: 2, color: '#ffffff', life: 0.12, speed: 520 });
    },
    end(r, world, p) { world.fx?.burst('thunder', p.cx, p.cy, nq(world, 6), { speed: 260 }); },
  },
  /** 뇌명 급강하: 땅에서는 높이 도약한 뒤, 공중에서는 곧바로 번개를 두르고 내리꽂힌다 */
  special: {
    start(r, world, p) {
      const sp = r.def?.special ?? {}, air = !p.onGround;
      r.startAct({
        name: 'thunderdive', dur: 2.2, anim: air ? 'dive' : 'jump', riderAnim: air ? 'ride_charge' : 'ride_rear', moveMul: 0.55,
        noJump: true, noGlide: true, noFly: true, cancelable: false, invuln: 0.2,
        phase: air ? 'hang' : 'leap', phT: 0, shocked: false, charged: false, diveAtk: null,
        tick: galeDiveTick,
      });
      if (!air) {
        p.vy = sp.leapVy ?? -700; p.onGround = false; p.jumpCut = true; p.coyote = 0;
        world.fx?.burst('dust', p.cx, p.bottom, nq(world, 12), { angle: -Math.PI / 2, spread: 1.6, speed: 160 });
        world.fx?.ering?.(p.cx, p.bottom, { color: '#e8dccc', r0: 8, r1: 70, ry: 0.3, life: 0.3, width: 4 });
        sfx('wing_flap', { vol: 1 }); sfx('jump', { vol: 0.6, pitch: 0.8 });
      } else p.vx *= 0.5;
      r.cry(world, { vol: 0.9 });
      return true;
    },
  },
  passive: {
    /** 활공 중 깃털·바람 줄기, 질주 발굽에 튀는 정전기 */
    tick(r, world, p, dt) {
      const s = st(r), qq = q(world);
      if (r.gliding) {
        s.featherT -= dt;
        if (s.featherT <= 0) { s.featherT = 0.16 / Math.max(0.4, qq); world.fx?.emit('feather', p.cx - (p.facing || 1) * rand(10, 40), p.cy + rand(-20, 10), { color: '#e8e0d0', speed: 40 }); }
        if (qq > 0.55 && Math.random() < 0.25) world.fx?.speedLine(p.cx + rand(-30, 30), p.cy + rand(-30, 30), p.vx >= 0 ? Math.PI : 0, { len: rand(30, 60), width: 1.5, color: '#dfe8ff', life: 0.14, speed: 300 });
      }
      hoofPrints(r, world, p, dt, s, staticSpark, 80);
    },
    /** 급강하 중 착지 → 충격파 */
    land(r, world, p) {
      const a = r.act;
      if (a?.name === 'thunderdive' && a.phase !== 'done') galeShock(r, world, p, a);
    },
  },
};
function staticSpark(world, x, y) {
  world.fx?.burst('thunder', x, y - 3, nq(world, 2), { angle: -Math.PI / 2, spread: 0.9, speed: 160 });
}

// ───────────────────────── 실바 (백록 신령) ─────────────────────────
/** 발굽 자리에 돋는 새싹 (fx.ghost 'back' 층). 흔들림 방향은 만들 때 정한다 */
function sproutPrint(world, x, y) {
  const fx = world?.fx;
  if (!fx?.ghost) return;
  const flip = Math.random() < 0.5 ? -1 : 1;
  fx.ghost((ctx, a) => {
    const k = clamp(a * 2, 0, 1), grow = clamp((1 - k) * 5, 0, 1);
    if (k <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = k; ctx.strokeStyle = '#8ed06a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      const hh = (7 + (i === 0 ? 4 : 0)) * grow, bx = x + i * 3;
      ctx.moveTo(bx, y); ctx.quadraticCurveTo(bx, y - hh * 0.6, bx + flip * (i * 3 + 1), y - hh);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff8d0'; ctx.globalAlpha = k * grow;
    ctx.beginPath(); ctx.arc(x + flip, y - 11 * grow, 1.8, 0, TAU); ctx.fill();
    ctx.restore();
  }, 1.1, 'back');
  if (Math.random() < 0.5 * q(world)) fx.emit('holy', x, y - 4, { angle: -Math.PI / 2, spread: 0.5, speed: rand(30, 70) });
}
/** 둘레 R 안의 (맵이 아닌) 포자 구름을 곧 흩어지게 한다. 흩은 것이 있으면 true */
function dissolveClouds(bl, cx, cy, R) {
  const L = bl?.clouds;
  if (!Array.isArray(L)) return false;
  let n = 0;
  for (const c of L) {
    if (!c || c.static || !Number.isFinite(c.life) || !Number.isFinite(c.x)) continue;
    const dx = Math.max(c.x - cx, 0, cx - (c.x + c.w)), dy = Math.max(c.y - cy, 0, cy - (c.y + c.h));
    if (dx * dx + dy * dy > R * R) continue;
    if (c.life > 0.45) { c.life = 0.45; n++; }
  }
  return n > 0;
}

const SILVA = {
  charge: {
    /** 뿔 돌격: 뿔 끝이 번쩍인다 (데이터: 신성 1.2 · 띄우기 · 경직 0.6) */
    start(r, world, p, dir) {
      const f = dir?.x < 0 ? -1 : 1;
      world.fx?.burst('holy', p.cx + f * 30, p.bottom - 80, nq(world, 10), { speed: 200 });
      world.fx?.flash?.(p.cx + f * 34, p.bottom - 82, { color: '#fff2a0', size: 70, life: 0.12 });
      sfx('holy', { vol: 0.45, pitch: 1.2 });
    },
    /** 성광 꼬리와 잎사귀 */
    tick(r, world, p) {
      const qq = q(world), f = faceOf(r, p), back = f > 0 ? Math.PI : 0;
      if (Math.random() < 0.7 * qq) world.fx?.emit('holy', p.cx + f * rand(16, 40), p.bottom - rand(60, 96), { angle: back, spread: 0.5, speed: rand(120, 260) });
      if (Math.random() < 0.3 * qq) world.fx?.emit('paper', p.cx - f * rand(0, 30), p.bottom - rand(20, 70), { color: '#a8d880', angle: back, spread: 0.8, speed: rand(60, 140) });
    },
  },
  /** 정화의 울음: 주위를 경직시키고 부패를 씻어 내며 기수를 회복시킨다 */
  special: {
    start(r, world, p) {
      const sp = r.def?.special ?? {}, R0 = sp.r ?? 240, cx = p.cx, cy = p.cy;
      r.strike(world, { x: cx - R0, y: cy - R0, w: R0 * 2, h: R0 * 2 }, r.atk({
        mv: r.power(sp.mv ?? 0.9), type: sp.type ?? 'mag', element: sp.element ?? 'holy', stun: sp.stun ?? 0.8, kb: [220, -240],
        hitstop: 0.08, shake: 6, purge: true, tags: ['mount', 'special', 'purge'],   // purge: 포자 주머니는 터지지 않고 정화된다
      }, p));
      const bl = world.gimmickOf?.('blight');
      if (bl) {
        try { bl.cleanse?.(sp.cleanse ?? 40); } catch { /* 정화 실패는 무시 */ }
        dissolveClouds(bl, cx, cy, R0);
      }
      const maxHp = p.stats?.hp ?? 0, heal = Math.round(maxHp * (sp.heal ?? 0.05));
      if (heal > 0 && p.hp < maxHp) p.heal?.(heal);
      const fx = world.fx;
      fx?.ring(cx, cy, { color: '#fff2a0', r0: 30, r1: R0, life: 0.5, width: 10 });
      fx?.ring(cx, cy, { color: '#c8ff9a', r0: 10, r1: R0 * 0.7, life: 0.35, width: 5 });
      fx?.ering?.(cx, p.bottom, { color: '#e8f0c8', r0: 12, r1: R0 * 1.1, ry: 0.25, life: 0.5, width: 5 });
      fx?.flash?.(cx, cy - 30, { color: '#fff8d0', size: R0, life: 0.16 });
      fx?.burst('holy', cx, cy - 30, nq(world, 26), { speed: 360 });
      fx?.burst('paper', cx, cy - 40, nq(world, 10), { color: '#a8d880', speed: 220 });
      world.game?.flash?.('#fff8d0', 0.18, 5);
      world.camera?.shake?.(4, 0.25);
      r.cry(world, { vol: 1 });
      sfx('holy', { vol: 0.85 }); sfx('heal', { vol: 0.5 });
      rumble(0.35, 0.3, 120);
      r.startAct({ name: 'howl', dur: 0.5, anim: 'howl', riderAnim: 'ride_rear', moveMul: 0.3 });
      return true;
    },
  },
  passive: {
    /** 뿔 사이에서 떠오르는 빛 방울 · 달릴 때 발굽 자리의 새싹 (숲의 가호) */
    tick(r, world, p, dt) {
      const s = st(r);
      s.fxT -= dt;
      if (s.fxT <= 0) {
        s.fxT = 0.3 / Math.max(0.4, q(world));
        world.fx?.emit('holy', p.cx + (p.facing || 1) * rand(18, 36), p.bottom - rand(90, 110), { angle: -Math.PI / 2, spread: 0.8, speed: rand(20, 50) });
      }
      hoofPrints(r, world, p, dt, s, sproutPrint, 72);
    },
    /** 독 웅덩이: 면역은 데이터 (hazard.poison 0). 밟은 자리에 정화 반짝임만 더한다 → 기본 규칙 그대로 (undefined) */
    hazard(r, kind, p, world) {
      if (kind !== 'poison' || !world) return undefined;
      const s = st(r), now = world.time ?? 0;
      if (now - s.sparkT > 0.15) {
        s.sparkT = now;
        world.fx?.burst('holy', p.cx + rand(-20, 20), p.bottom - 6, nq(world, 2), { angle: -Math.PI / 2, spread: 0.6, speed: 90 });
      }
      return undefined;
    },
    land(r, world, p, vyBefore) {
      if (!(vyBefore > 700)) return;
      world.fx?.ering?.(p.cx, p.bottom, { color: '#e8f0c8', r0: 8, r1: 90, ry: 0.25, life: 0.35, width: 4 });
      sproutPrint(world, p.cx - 14, p.bottom); sproutPrint(world, p.cx + 14, p.bottom);
    },
  },
};

export const MOUNT_B = { mt_ignis: IGNIS, mt_gale: GALE, mt_silva: SILVA };
