// 2부 적 AI 종류 D (s17 폭풍의 공중정원 · s18 악몽의 미궁 · s19 썩어가는 숲 · s20 태초의 공허; world2 §5.3). 소유: ENEMY-P2-D-AI
// AI_D[name] = { init(e), update(e, world, dt), onHit?(e, world, attack, info), onDie?(e, world) } — game/ai.js 가 Object.assign 으로 합친다.
// 종류: galeknight roc jelly puppeteer stalker treant moth husk herald (재사용: harpy voider chaos 는 ai_b.js 그대로)
//
// 규칙 (ai_b.js 와 같음)
//  · 모든 공격은 예비동작(자세 + 경고선·경고 장판)을 거친 뒤 발동한다. 쿨다운은 e.aggro(난이도 공격성) 배율로 줄어든다.
//  · AI(ai.js)는 함수 안에서만 쓴다 (ai.js ↔ ai_d.js 순환 import). init 때는 e.world 가 아직 없다 → 월드가 필요한 준비는 update 에서.
//  · 피격 반응(FEEL-REACT, enemy.js): 경직·다운·기상·각성 정지·시간 정지 동안에는 update 가 불리지 않고 stateT/animT 도 멈춘다
//    → 윈드업 도중 맞은 적은 회복 뒤 남은 윈드업을 이어서 보여 준 다음 친다. 공격 상태 이름은 되도록 FH.COUNTER.states 에 있는
//    이름(aim cast windup slash throw charge swing dive …)을 써서 윈드업 중 타격이 COUNTER 가 되게 했다 (자세 이름은 e.anim 따로).
//    한 번만 치는 것은 자체 플래그(e.fired)로 막으므로 didHit 는 건드리지 않는다 (enemy.breakAttack 의 'hold' 방식).
//  · 경고·판정 영역은 ai_b.js 의 Zone 을 쓰되, world.freezeEnemies(각성 연출) 동안 멈추는 하위 클래스로 만든다 (적 탄과 같은 규칙).
//    주인의 공격 상태에 매인 경고(창 겨눔·벼락 기둥·방전·광선 조준)는 주인이 그 상태를 벗어나거나 죽으면 사라지고,
//    실제 판정은 주인의 윈드업이 끝나는 순간 따로 만든다 (경직으로 멈춘 윈드업과 경고가 어긋나지 않게).
//  · 기믹: world.gimmickOf?.('wind') — 질풍 창기사는 돌풍이 부는 동안 바람을 거슬러 돌진하지 않고, 뇌운 해파리는 바람에 떠밀린다.
//          world.gimmickOf?.('blight') — 포자 구름(나무거인·나방·균사 망자). 부패 기믹이 없는 방(아케이드 등)에서는 독 Zone 으로 대신한다.
//
// 렌더 계약 (ENEMY-P2-D-ART: render/enemies_d.js RENDER_D; 원점 발 중앙, 오른쪽 기준)
//  e.anim — galeknight: fly aim dash slash · roc: fly call screech swoop · jelly: drift charge shock ·
//           puppeteer: float summon throw · stalker: idle freeze creep grab appear · treant: idle walk plant swing ·
//           moth: fly dust · husk: rise walk idle attack (좀비와 같음) · herald: float aim fire raise blink
//  보조 값 — e.aimK 0..1 (현재 윈드업 진행), galeknight e.lanceDir · roc e.cols [{x, top, bottom}] (가리키는 벼락 자리) ·
//           puppeteer e.puppets (조종 중인 저주 인형; 손가락에서 실을 그린다) · stalker e.watched (고개 기울임) ·
//           treant e.sporeAt (마지막 포자 분출 e.t) · herald e.aimA (광선 각도), e.lock (조준 고정)
//  투사체·장판은 PROJ_D / ZONE_D 에 같은 키가 있으면 그것으로 그리고, 없으면 아래의 간단한 대체 그림(PF/ZF)으로 그린다.
//    PROJ_D: gale_crescent puppet_needle void_star        — (ctx, p, world), 원점 = 투사체 중심
//    ZONE_D: lance_warn roc_bolt jelly_shock root_spike spore_cloud spore_swell prism_beam star_mark summon_mark
//            — (ctx, z, world) 월드 좌표. 모양 값은 z.data, 경고 진행 z.data.k 또는 z.warnK, 발동 뒤 z.active / z.liveK
import { AI } from './ai.js';
import { Zone } from './ai_b.js';
import { rand, chance, clamp, angleTo, TAU } from '../core/math.js';
import { audio } from '../core/audio.js';
import { isSolidType, T } from '../core/physics.js';
import { TILE } from '../core/game.js';
import * as RD from '../render/enemies_d.js';
import * as RA from '../render/enemies_a.js';
import * as HFX from '../render/hitfx.js';

const PI = Math.PI;
let _zid = 0;
/** 전역 고유 타격 ID (같은 ID 로는 대상당 1회만 맞는다) */
const nid = (p = 'd') => p + '_' + (++_zid);

// ───────────────────────── 경고·판정 영역 ─────────────────────────
let ZoneD = null;
/** 각성 연출(world.freezeEnemies) 동안 멈추는 Zone (첫 사용 때 만든다: 모듈 최상위에서 가져온 클래스를 건드리지 않게) */
function zoneClass() {
  if (!ZoneD) {
    ZoneD = class ZoneD extends Zone {
      update(dt, world) { if (world.freezeEnemies) return; super.update(dt, world); }
    };
  }
  return ZoneD;
}
function addZone(world, o) { const C = zoneClass(); const z = new C(o); world.add(z); return z; }
const alive = (e) => !!e && !e.dead && !(e.dying > 0);
/** 주인이 state 에 머무는 동안만 보이는 경고 (판정 없음). follow(z, world, dt) 가 z.data 와 z 의 사각형(화면 밖 제외용)을 채운다 */
function warnZone(world, e, state, key, follow, data = {}) {
  const z = addZone(world, {
    x: e.x, y: e.y, w: e.w, h: e.h, delay: 1e9, life: 1, noHit: true, owner: e, z: 7, render: zoneRender(key), data,
    follow: (zz, w, dt) => { if (!alive(e) || e.state !== state) { zz.dead = true; return; } follow(zz, w, dt); },
  });
  follow(z, world, 0);
  return z;
}
/** 원 판정 (플레이어 몸통 사각형과 원의 겹침) */
function circleHit(z, w) {
  const p = w.player; if (!p) return false;
  const hb = p.hurtbox(), d = z.data;
  const nx = clamp(d.x, hb.x, hb.x + hb.w), ny = clamp(d.y, hb.y, hb.y + hb.h);
  return Math.hypot(nx - d.x, ny - d.y) < d.r;
}
function setRect(z, x0, y0, x1, y1) { z.x = Math.min(x0, x1); z.y = Math.min(y0, y1); z.w = Math.abs(x1 - x0) + 1; z.h = Math.abs(y1 - y0) + 1; }

// ───────────────────────── 공용 도우미 (ai_b.js 에서 옮겨 옴) ─────────────────────────
function ensureMag(e) { if (e.stats.mag == null) e.stats.mag = e.stats.atk; }
function atk(e, mv, extra) { ensureMag(e); return { owner: e, stats: e.stats, mv, dir: e.facing, ...extra }; }
function hover(e, tx, ty, accel, dt, maxSp) {
  const dx = tx - e.cx, dy = ty - e.cy, d = Math.hypot(dx, dy) || 1;
  const sp = Math.min(maxSp, d * 3);
  const k = Math.min(1, accel * dt);
  e.vx += (dx / d * sp - e.vx) * k;
  e.vy += (dy / d * sp - e.vy) * k;
}
function faceP(e) { const d = e.dxToPlayer(); if (Math.abs(d) > 3) e.facing = Math.sign(d); }
function seesP(e, p, sight, dy = 170) { return !!p && !p.dead && Math.abs(p.cx - e.cx) < sight && Math.abs(p.cy - e.cy) < dy; }
function canMove(e, dir) {
  if (!e.onGround) return true;
  const f = e.facing; e.facing = dir;
  const ok = e.groundAhead() && !e.wallAhead();
  e.facing = f;
  return ok;
}
/** 지상 추격 (낭떠러지·벽 앞에서 정지) */
function chase(e, dir, sp) { e.vx = dir * sp; if (e.onGround && !canMove(e, dir)) e.vx = 0; }
function patrol(e, mul = 0.6) {
  e.vx = e.facing * e.speed * mul;
  if (e.onGround && (!e.groundAhead() || e.wallAhead())) e.facing *= -1;
}
function solidAt(world, x, y) { return isSolidType(world.map.typeAtPx(x, y)); }
/**
 * (x, y) 아래의 첫 바닥(고체·발판) 윗면 y. 시작점이 벽 속이면 벽을 빠져나온 뒤부터 찾는다 (벽을 통과하는 비행체용).
 * 없으면 null
 */
function floorBelow(world, x, y, maxDist = 900) {
  const m = world.map, tx = Math.floor(x / TILE);
  if (tx < 0 || tx >= m.w) return null;
  let ty = Math.max(0, Math.floor(y / TILE));
  const end = Math.min(m.h, ty + Math.ceil(maxDist / TILE));
  while (ty < end && isSolidType(m.typeAt(tx, ty))) ty++;
  for (; ty < end; ty++) { const t = m.typeAt(tx, ty); if (isSolidType(t) || t === T.ONEWAY) return ty * TILE; }
  return null;
}
/** (x, y) 에서 아래로 처음 비어 있는 칸의 윗면 (벽 속에서 시작하면 벽 바로 아래) */
function openBelow(world, x, y, maxY) {
  const m = world.map, tx = Math.floor(x / TILE);
  let ty = Math.max(0, Math.floor(y / TILE));
  const end = Math.floor(maxY / TILE);
  while (ty < end && isSolidType(m.typeAt(tx, ty))) ty++;
  return Math.max(y, ty * TILE);
}
/** 광선 길이: (x,y) 에서 각도 a 로 벽에 닿을 때까지 */
function rayLen(world, x, y, a, max = 900) {
  const cx = Math.cos(a), cy = Math.sin(a);
  for (let d = 16; d < max; d += 12) if (solidAt(world, x + cx * d, y + cy * d)) return d;
  return max;
}
/** 점-선분 거리 */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1;
  const u = clamp(((px - x1) * dx + (py - y1) * dy) / L, 0, 1);
  return Math.hypot(px - (x1 + dx * u), py - (y1 + dy * u));
}
/** 맵 안쪽으로 가두기 (벽을 통과하는 비행체가 맵 밖으로 떠나지 않게) */
function keepInMap(e, world, pad = 8) {
  const m = world.map;
  if (e.x < pad) { e.x = pad; if (e.vx < 0) e.vx = 0; }
  if (e.x + e.w > m.pxW - pad) { e.x = m.pxW - pad - e.w; if (e.vx > 0) e.vx = 0; }
  if (e.y < pad) { e.y = pad; if (e.vy < 0) e.vy = 0; }
  if (e.y + e.h > m.pxH - pad) { e.y = m.pxH - pad - e.h; if (e.vy > 0) e.vy = 0; }
}
const qual = (world) => world.fx?.quality ?? 1;
function puff(world, type, x, y, n, o) { world.fx?.burst(type, x, y, n, o); }
/** 예비동작 반짝임 (눈·창끝 등) */
function glint(world, x, y, color = '#ffffff', size = 46) { world.fx?.flash(x, y, { color, size, life: 0.16 }); }
/** 공중 투사체 공통 (마법 공격력) */
function bolt(e, o) { ensureMag(e); return e.shoot({ life: 3, ...o, attack: { mv: 1, type: 'mag', ...(o.attack || {}) } }); }
function rate(e, def) { return (e.params.rate ?? def) * rand(0.9, 1.2); }
/** 돌풍 방향 (불고 있지 않으면 0) */
function gustDir(world) { const w = world.gimmickOf?.('wind'); return w?.gusting ? (Math.sign(w.dir) || 1) : 0; }

/**
 * 포자 구름: 부패(blight) 기믹이 있으면 그 구름(부패 게이지)을, 없으면 독 Zone(0.5초마다 mv 0.3)을 만든다. (x, y) = 왼쪽 위
 * 반환: 'blight' | 'zone'
 */
function sporeCloud(world, owner, x, y, w, h, life) {
  const b = world.gimmickOf?.('blight');
  const cx = x + w / 2, cy = y + h / 2;
  puff(world, 'smoke', cx, cy, 6, { color: '#8aa84a', speed: 60, jitter: w * 0.3 });
  puff(world, 'magic', cx, cy, 6, { color: '#c8ff6a', speed: 90, jitter: w * 0.25 });
  audio.sfx('mist', { vol: 0.35, pitch: 0.7 });
  if (b?.addCloud) { b.addCloud(x, y, w, h, life); return 'blight'; }
  addZone(world, {
    x, y, w, h, delay: 0.2, life, owner, render: zoneRender('spore_cloud'), z: 6, data: { seed: rand(0, 99) },
    light: { r: Math.max(w, h) * 0.5, color: '#9ad040', i: 0.25 },
    attack: atk(owner, 0.3, { type: 'mag', rehit: 0.5, kb: [60, -120], hitId: nid('spore'), tags: ['magic', 'poison'] }),
  });
  return 'zone';
}

export const AI_D = {};

// ═════════════════════════ s17 폭풍의 공중정원 ═════════════════════════
/**
 * 질풍 창기사: 플레이어 발밑 지면에서 P.hover 위, 좌우 ±200 에 떠 있다.
 * lance — 'aim' P.windup (플레이어 가슴 높이로 내려와 수평 경고선 520) → P.dash px/s 로 0.6초 돌진 (mv 1.6, kb [420,-200]), 벽에서 멈춤.
 * crescent — 'slash' 0.5 → 바람의 초승달 60×90 (속도 520, 관통, 1.4초, mv 1.1).
 * 돌풍이 부는 동안에는 바람을 따라서만 돌진한다 (거스르는 쪽이면 초승달로 바꾼다; 바람을 타면 돌진이 1.15배 빠르다).
 */
AI_D.galeknight = {
  init(e) { e.cool = rand(0.9, 1.6); e.side = 0; e.pick = 0; e.aimK = 0; e.lanceDir = 1; e.lockY = 0; e.setState('hover'); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    if (!e.side) e.side = Math.sign(e.cx - p.cx) || 1;   // 처음엔 나타난 쪽에 머문다
    e.cool -= dt * e.aggro;
    const gust = gustDir(world);
    switch (e.state) {
      case 'aim': {
        const wu = P.windup ?? 0.6;
        e.setAnim('aim');
        e.aimK = clamp(e.stateT / wu, 0, 1);
        // 처음 70% 동안 플레이어 가슴 높이를 따라 내려온다 → 그 뒤 높이·방향 고정 (경고선이 멈춘다)
        if (e.stateT < wu * 0.7) { e.lockY = p.cy - 8; const d = Math.sign(p.cx - e.cx); if (d) e.lanceDir = d; }
        e.facing = e.lanceDir;
        e.vx *= Math.pow(0.02, dt);
        e.vy += ((e.lockY - e.cy) * 7 - e.vy) * Math.min(1, 10 * dt);
        if (e.stateT >= wu) {
          if (gust === -e.lanceDir) { e.setState('slash'); e.fired = false; return; }   // 맞바람: 돌진 대신 초승달
          e.setState('dash'); e.hid = nid('lance'); e.vy = 0;
          e.vx = e.lanceDir * (P.dash ?? 820) * (gust === e.lanceDir ? 1.15 : 1);
          audio.sfx('dash', { vol: 0.55, pitch: 0.8 }); audio.sfx('whip', { vol: 0.4, pitch: 0.5 });
          world.fx?.speedLine?.(e.cx, e.cy, e.lanceDir > 0 ? 0 : PI, { len: 90, color: '#dff4ff', speed: 700 });
        }
        return;
      }
      case 'dash': {
        e.setAnim('dash'); e.vy = 0; e.facing = e.lanceDir;
        const d = e.lanceDir, ahead = e.cx + d * (e.w / 2 + Math.abs(e.vx) * dt + 6);
        const wall = solidAt(world, ahead, e.cy) || ahead < 4 || ahead > world.map.pxW - 4;
        e.strike(-e.w * 0.5, -e.h * 0.82, e.w + 58, e.h * 0.58, 1.6, { kb: [420, -200], hitId: e.hid });
        if (Math.random() < 0.7 * qual(world)) world.fx?.emit('spark', e.cx - d * e.w * 0.4, e.cy + rand(-14, 14), { color: '#dff4ff', speed: 40 });
        if (wall || e.stateT > 0.6) {
          if (wall) { e.vx = 0; world.camera?.shake(3, 0.12); puff(world, 'spark', ahead, e.cy, 8, { color: '#ffe8a0', speed: 200 }); audio.sfx('clang', { vol: 0.45, pitch: 0.8 }); }
          e.setState('recover');
        }
        return;
      }
      case 'recover':
        e.setAnim('fly'); e.vx *= Math.pow(0.05, dt); e.vy += (-90 - e.vy) * Math.min(1, 4 * dt);
        if (e.stateT > 0.5) { e.setState('hover'); e.cool = rate(e, 2.0); }
        return;
      case 'slash': {
        e.setAnim('slash'); e.vx *= Math.pow(0.1, dt); e.vy *= Math.pow(0.1, dt); faceP(e);
        e.aimK = clamp(e.stateT / 0.5, 0, 1);
        if (e.stateT >= 0.5 && !e.fired) {
          e.fired = true;
          const sx = e.cx + e.facing * 18, sy = e.cy - 6;
          let a = angleTo(sx, sy, p.cx, p.cy - 4);
          // 수평에서 ±55° 안으로 (머리 위에서 곧장 내리꽂지 않게)
          const base = e.facing > 0 ? 0 : PI, off = Math.atan2(Math.sin(a - base), Math.cos(a - base));
          a = base + clamp(off, -0.96, 0.96);
          e.shoot({ x: sx, y: sy, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, w: 60, h: 90, render: projRender('gale_crescent'), color: '#dff4ff', life: 1.4, pierce: 99, collideWalls: false,
            light: { r: 70, color: '#bfe8ff', i: 0.5 }, attack: { mv: 1.1, kb: [300, -220] } });
          audio.sfx('slash', { vol: 0.5, pitch: 0.7 }); audio.sfx('mist', { vol: 0.3, pitch: 1.4 });
        }
        if (e.stateT > 0.85) { e.setState('hover'); e.cool = rate(e, 2.0); }
        return;
      }
    }
    // ── 떠 있기 ──
    e.setState('hover'); e.setAnim('fly'); e.aimK = 0;
    if (Math.abs(p.cx - e.cx) > 420) e.side = Math.sign(e.cx - p.cx) || e.side;
    let tx = p.cx + e.side * 200;
    const m = world.map;
    if (tx < 40 || tx > m.pxW - 40 || solidAt(world, tx, p.cy - 60)) { e.side = -e.side; tx = p.cx + e.side * 200; }
    const gy = floorBelow(world, clamp(tx, 8, m.pxW - 8), p.y, 600) ?? p.bottom;
    const ty = gy - (P.hover ?? 150) - e.h / 2 + Math.sin(e.t * 2.1) * 10;
    hover(e, tx, ty, 2.2, dt, e.speed * 1.6);
    faceP(e);
    if (e.cool <= 0 && e.distToPlayer() < 640) {
      const dx = p.cx - e.cx, dir = Math.sign(dx) || e.facing;
      const canLance = Math.abs(dx) > 90 && Math.abs(dx) < 520 && Math.abs(p.cy - e.cy) < 280 && gust !== -dir;
      e.pick++;
      if (canLance && (e.pick % 2 === 1 || gust === dir)) {
        e.setState('aim'); e.lanceDir = dir; e.lockY = p.cy - 8; e.aimK = 0;
        glint(world, e.cx + dir * 30, e.cy - 10, '#dff4ff');
        audio.sfx('charge_ready', { vol: 0.35, pitch: 1.3 });
        warnZone(world, e, 'aim', 'lance_warn', (z) => {
          const d = e.lanceDir, x0 = e.cx + d * e.w * 0.35, y = e.cy - e.h * 0.08, len = 520;
          z.data.x0 = x0; z.data.y = y; z.data.len = len; z.data.dir = d; z.data.k = e.aimK;
          setRect(z, x0, y - 20, x0 + d * len, y + 20);
        });
      } else { e.setState('slash'); e.fired = false; audio.sfx('whip', { vol: 0.3, pitch: 1.4 }); }
    }
  },
};

/**
 * 뇌조: 보이는 화면 위쪽(카메라 y + 90, 방 안)에 떠서 플레이어 x ±220 을 따라간다.
 * bolts — 'call' 0.9초 (날개 끝으로 땅의 P.bolts 곳을 가리킴 = 경고 기둥) → 폭 50 벼락 기둥 (0.35초, mv 1.4 번개).
 * swoop — 'screech' P.swoop (박쥐 소리 낮게) → 플레이어 자리를 지나는 호를 그리며 급강하했다가 0.9초 만에 다시 올라감 (접촉 mv 1.6).
 */
AI_D.roc = {
  init(e) { e.cool = rand(1.2, 2.0); e.side = 0; e.pick = 0; e.aimK = 0; e.cols = []; e.setState('fly'); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    if (!e.side) e.side = Math.sign(e.cx - p.cx) || 1;   // 처음엔 나타난 쪽에 머문다
    e.cool -= dt * e.aggro;
    const m = world.map, cam = world.camera;
    switch (e.state) {
      case 'cast': {
        e.setAnim('call'); e.vx *= Math.pow(0.1, dt); e.vy *= Math.pow(0.1, dt);
        e.aimK = clamp(e.stateT / 0.9, 0, 1);
        if (e.stateT >= 0.9 && !e.fired) {
          e.fired = true;
          for (const c of e.cols) {
            addZone(world, { x: c.x - 25, y: c.top, w: 50, h: c.bottom - c.top, delay: 0, life: 0.35, owner: e, render: zoneRender('roc_bolt'), z: 7,
              data: { x: c.x, top: c.top, bottom: c.bottom, seed: rand(0, 99), live: true },
              light: { r: 140, color: '#bfe0ff', i: 0.9 }, attack: atk(e, 1.4, { type: 'mag', element: 'thunder', kb: [220, -320], hitId: nid('bolt') }) });
            puff(world, 'thunder', c.x, c.bottom - 6, 8, { speed: 220, angle: -PI / 2, spread: 1.2 });
            puff(world, 'dust', c.x, c.bottom - 4, 5, { speed: 120 });
          }
          world.camera?.shake(5, 0.2);
          audio.sfx('thunderclap', { vol: 0.6 }); audio.sfx('thunder', { vol: 0.5, pitch: 0.8 });
        }
        if (e.stateT > 1.3) { e.setState('fly'); e.cool = rate(e, 2.6); e.cols = []; }
        return;
      }
      case 'windup':
        e.setAnim('screech'); e.vx *= Math.pow(0.05, dt); e.vy *= Math.pow(0.05, dt); faceP(e);
        e.aimK = clamp(e.stateT / (P.swoop ?? 0.6), 0, 1);
        if (e.stateT >= (P.swoop ?? 0.6)) {
          e.sw = { x0: e.cx, y0: e.cy, tx: p.cx, ty: Math.max(e.cy + 20, p.cy - 6) };
          e.setState('dive'); e.hid = nid('swoop');
          audio.sfx('dash', { vol: 0.5, pitch: 0.55 });
        }
        return;
      case 'dive': {
        e.setAnim('swoop');
        const s = e.sw, u = clamp(e.stateT / 0.9, 0, 1);
        const nx = s.x0 + (s.tx - s.x0) * 2 * u, ny = s.y0 + (s.ty - s.y0) * Math.sin(PI * u);
        if (dt > 0) {
          e.vx = clamp((nx - e.cx) / dt, -1400, 1400); e.vy = clamp((ny - e.cy) / dt, -1400, 1400);
        }
        e.facing = Math.sign(s.tx - s.x0) || e.facing;
        e.strike(-e.w * 0.42, -e.h * 0.92, e.w * 0.84, e.h * 0.84, 1.6, { kb: [420, -320], hitId: e.hid, element: 'thunder' });
        if (Math.random() < 0.5 * qual(world)) world.fx?.emit('thunder', e.cx - e.facing * e.w * 0.3, e.cy, { speed: 40 });
        if (u >= 1) { e.setState('fly'); e.vx *= 0.3; e.vy = 0; e.cool = rate(e, 2.6); }
        keepInMap(e, world);
        return;
      }
    }
    // ── 선회 ──
    e.setState('fly'); e.setAnim('fly'); e.aimK = 0;
    if (Math.abs(p.cx - e.cx) > 440) e.side = Math.sign(e.cx - p.cx) || e.side;
    const homeY = clamp((cam?.y ?? 0) + 90, e.h / 2 + 8, m.pxH - e.h / 2 - 8);
    const tx = clamp(p.cx + e.side * 220, e.w / 2 + 8, m.pxW - e.w / 2 - 8);
    hover(e, tx, homeY + Math.sin(e.t * 1.3) * 14, 1.6, dt, e.speed);
    keepInMap(e, world);
    faceP(e);
    if (e.cool <= 0 && Math.abs(p.cx - e.cx) < 560 && p.cy > e.cy) {
      e.pick++;
      if (e.pick % 2 === 1) {
        // 벼락 기둥 자리: 플레이어 x, ±180 (P.bolts 개)
        const n = Math.max(1, P.bolts ?? 3), offs = [0];
        for (let i = 1; offs.length < n; i++) { offs.push(-180 * i); if (offs.length < n) offs.push(180 * i); }
        e.cols = [];
        for (const o of offs) {
          const x = p.cx + o;
          if (x < 10 || x > m.pxW - 10) continue;
          const top = openBelow(world, x, e.cy, m.pxH);
          const bottom = floorBelow(world, x, Math.max(top, p.y - 20), 1200) ?? m.pxH;
          if (bottom - top < 40) continue;
          e.cols.push({ x, top, bottom });
        }
        if (!e.cols.length) { e.pick++; return; }
        e.setState('cast'); e.fired = false; e.aimK = 0;
        audio.sfx('charge_ready', { vol: 0.4, pitch: 0.6 }); audio.sfx('bat', { vol: 0.3, pitch: 0.4 });
        for (const c of e.cols) {
          warnZone(world, e, 'cast', 'roc_bolt', (z) => { z.data.k = e.aimK; setRect(z, c.x - 25, c.top, c.x + 25, c.bottom); }, { x: c.x, top: c.top, bottom: c.bottom, seed: rand(0, 99), live: false });
        }
      } else {
        e.setState('windup'); e.aimK = 0;
        glint(world, e.cx + e.facing * e.w * 0.4, e.cy - 10, '#bfe0ff', 60);
        audio.sfx('bat', { vol: 0.55, pitch: 0.5 });
      }
    }
  },
};

/**
 * 뇌운 해파리: 사인파로 떠다니며(진폭 30, 1.4 rad/s) 천천히 다가온다. 돌풍이 불면 dir × force × 0.3 px/s² 로 떠밀린다.
 * charge — 플레이어가 P.range 안 → 'charge' P.charge (지지직, 방전 범위 경고) → 반지름 120 방전 (mv 1.1 번개). 쿨다운 P.rate.
 * onDie — 0.4초 경고 뒤 작은 방전 (반지름 70, mv 0.8).
 */
AI_D.jelly = {
  init(e) { e.cool = rand(0.6, 1.4); e.ph = rand(0, TAU); e.aimK = 0; e.setState('drift'); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    const w = world.gimmickOf?.('wind');
    const gx = w?.gusting ? (Math.sign(w.dir) || 1) * (w.force ?? 900) * 0.3 : 0;
    e.vx += gx * dt;
    if (e.state === 'charge') {
      const T0 = P.charge ?? 0.6;
      e.setAnim('charge'); e.aimK = clamp(e.stateT / T0, 0, 1);
      e.vx *= Math.pow(0.2, dt); e.vy *= Math.pow(0.1, dt);
      if (Math.random() < (0.4 + e.aimK) * qual(world)) world.fx?.emit('thunder', e.cx + rand(-18, 18), e.cy + rand(-10, 24), { speed: 60 });
      if (e.stateT >= T0) {
        e.setState('shock');
        addZone(world, { x: e.cx - 120, y: e.cy - 120, w: 240, h: 240, delay: 0, life: 0.22, owner: e, render: zoneRender('jelly_shock'), z: 7,
          data: { x: e.cx, y: e.cy, r: 120, k: 1 }, hitTest: circleHit, light: { r: 160, color: '#bfe0ff', i: 0.9 },
          follow: (z) => { if (alive(e)) { z.data.x = e.cx; z.data.y = e.cy; z.x = e.cx - 120; z.y = e.cy - 120; } },
          attack: atk(e, 1.1, { type: 'mag', element: 'thunder', kb: [300, -260], hitId: nid('shock') }) });
        world.fx?.ring(e.cx, e.cy, { color: '#dff0ff', r0: 20, r1: 124, life: 0.25, width: 5 });
        audio.sfx('thunder', { vol: 0.5, pitch: 1.3 });
      }
      keepInMap(e, world);
      return;
    }
    if (e.state === 'shock') {
      e.setAnim('shock'); e.vx *= Math.pow(0.3, dt); e.vy *= Math.pow(0.3, dt);
      if (e.stateT > 0.45) { e.setState('drift'); e.cool = rate(e, 2.2); }
      keepInMap(e, world);
      return;
    }
    // ── 떠다니기 ──
    e.setAnim('drift'); e.aimK = 0;
    e.ph += dt * 1.4;
    const dx = p.cx - e.cx, dy = (p.cy - 30) - e.cy, d = Math.hypot(dx, dy) || 1;
    const near = d < 520;
    const tvx = near ? dx / d * e.speed : 0;
    const tvy = (near ? dy / d * e.speed * 0.8 : 0) + Math.cos(e.ph) * 30 * 1.4;
    const k = Math.min(1, 1.5 * dt);
    e.vx += (tvx - e.vx) * k; e.vy += (tvy - e.vy) * k;
    e.vx = clamp(e.vx, -340, 340);
    if (Math.abs(e.vx) > 8) e.facing = Math.sign(e.vx);
    keepInMap(e, world);
    if (e.cool <= 0 && e.distToPlayer() < (P.range ?? 110)) {
      e.setState('charge'); e.aimK = 0;
      audio.sfx('charge_ready', { vol: 0.3, pitch: 1.6 });
      warnZone(world, e, 'charge', 'jelly_shock', (z) => { z.data.x = e.cx; z.data.y = e.cy; z.data.r = 120; z.data.k = e.aimK; setRect(z, e.cx - 120, e.cy - 120, e.cx + 120, e.cy + 120); }, { warn: true });
    }
  },
  onDie(e, world) {
    const x = e.cx, y = e.cy;
    addZone(world, { x: x - 70, y: y - 70, w: 140, h: 140, delay: 0.4, life: 0.18, owner: e, render: zoneRender('jelly_shock'), z: 7,
      data: { x, y, r: 70, mini: true }, hitTest: circleHit, light: { r: 100, color: '#bfe0ff', i: 0.7 },
      tick: (z, w) => { if (z.active && !z.data.boom) { z.data.boom = true; w.fx?.ring(x, y, { color: '#dff0ff', r0: 10, r1: 74, life: 0.2, width: 4 }); audio.sfx('thunder', { vol: 0.35, pitch: 1.6 }); } },
      attack: atk(e, 0.8, { type: 'mag', element: 'thunder', kb: [240, -220], hitId: nid('minishock') }) });
  },
};

// ═════════════════════════ s18 악몽의 미궁 ═════════════════════════
/**
 * 악몽 인형사: 지면에서 160 위에 떠서 P.keep 거리를 둔다.
 * summon — P.summon 초마다, 살아 있는 인형이 P.maxPuppets 보다 적으면 'summon' 0.8초 (바닥에 소환진) → 저주 인형(puppet_maiden)을
 *   옆 ±80 바닥에 부른다 (child.summoner = e, e.puppets 목록 — 렌더러가 손가락에서 실을 그린다).
 *   불려 나온 인형은 정예가 아니고, 무한 사냥을 막으려고 경험치 30%·재료 드롭 없음·금화 조금만 준다.
 * needles — 'throw' 0.5 → 바늘 5개 부채꼴 (속도 460, mv 0.8). 쿨다운 P.rate.
 * onDie — 조종하던 인형이 모두 실이 끊겨 무너진다 (드롭 없음).
 */
AI_D.puppeteer = {
  init(e) { e.cool = rand(1.0, 1.8); e.sumT = rand(0.8, 1.6); e.puppets = []; e.side = 0; e.aimK = 0; e.setState('float'); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    if (!e.side) e.side = Math.sign(e.cx - p.cx) || 1;   // 처음엔 나타난 쪽에 머문다
    // 목록 정리 (제자리에서: 렌더러가 같은 배열을 읽는다)
    const L = e.puppets;
    for (let i = L.length - 1; i >= 0; i--) if (!alive(L[i])) L.splice(i, 1);
    e.cool -= dt * e.aggro; e.sumT -= dt * e.aggro;
    switch (e.state) {
      case 'cast': {
        e.setAnim('summon'); e.vx *= Math.pow(0.1, dt); e.vy *= Math.pow(0.1, dt); faceP(e);
        e.aimK = clamp(e.stateT / 0.8, 0, 1);
        if (Math.random() < 0.6 * qual(world)) world.fx?.emit('magic', e.sumX + rand(-26, 26), e.sumY - rand(0, 10), { color: '#c060ff', speed: 50 });
        if (e.stateT >= 0.8 && !e.fired) {
          e.fired = true;
          if (L.length < (P.maxPuppets ?? 2)) {
            const k = world.spawnEnemy('puppet_maiden', e.sumX, e.sumY, { level: e.stats.level, elite: false, facing: Math.sign(p.cx - e.sumX) || 1 });
            if (k) {
              k.summoner = e;
              k.awake = true;
              k.stats.exp = Math.round((k.stats.exp ?? 0) * 0.3);
              k.def = { ...k.def, drops: [], gold: [1, 3] };
              L.push(k);
              puff(world, 'dark', e.sumX, e.sumY - 30, 12, { speed: 120 });
              world.fx?.ring(e.sumX, e.sumY - 30, { color: '#c060ff', r0: 6, r1: 60, life: 0.35, width: 4 });
              audio.sfx('ghost', { vol: 0.4, pitch: 1.5 });
            }
          }
        }
        if (e.stateT > 1.0) { e.setState('float'); e.cool = Math.max(e.cool, 0.6); }
        return;
      }
      case 'throw': {
        e.setAnim('throw'); e.vx *= Math.pow(0.1, dt); e.vy *= Math.pow(0.1, dt); faceP(e);
        e.aimK = clamp(e.stateT / 0.5, 0, 1);
        if (e.stateT >= 0.5 && !e.fired) {
          e.fired = true;
          const ox = e.cx + e.facing * 16, oy = e.cy - 8, base = angleTo(ox, oy, p.cx, p.cy - 4);
          for (let i = -2; i <= 2; i++) {
            const a = base + i * 0.17;
            e.shoot({ x: ox, y: oy, vx: Math.cos(a) * 460, vy: Math.sin(a) * 460, w: 14, h: 6, render: projRender('puppet_needle'), color: '#e8e0f0', life: 1.8, attack: { mv: 0.8, kb: [140, -100] } });
          }
          audio.sfx('dagger', { vol: 0.5, pitch: 1.6 });
        }
        if (e.stateT > 0.85) { e.setState('float'); e.cool = rate(e, 2.4); }
        return;
      }
    }
    // ── 떠 있기 ──
    e.setState('float'); e.setAnim('float'); e.aimK = 0;
    const keep = P.keep ?? 220, m = world.map;
    if (Math.abs(p.cx - e.cx) > keep * 2.2) e.side = Math.sign(e.cx - p.cx) || e.side;
    let tx = p.cx + e.side * keep;
    if (tx < 40 || tx > m.pxW - 40 || solidAt(world, tx, p.cy - 80)) { e.side = -e.side; tx = p.cx + e.side * keep; }
    const gy = floorBelow(world, clamp(tx, 8, m.pxW - 8), p.y - 40, 600) ?? p.bottom;
    hover(e, tx, gy - 160 - e.h / 2 + Math.sin(e.t * 1.6) * 12, 1.8, dt, e.speed * 1.8);
    faceP(e);
    if (e.sumT <= 0 && L.length < (P.maxPuppets ?? 2)) {
      e.sumT = P.summon ?? 5;
      const spot = this.summonSpot(e, world, p);
      if (spot) {
        e.sumX = spot.x; e.sumY = spot.y;
        e.setState('cast'); e.fired = false; e.aimK = 0;
        audio.sfx('ghost', { vol: 0.3, pitch: 0.8 });
        warnZone(world, e, 'cast', 'summon_mark', (z) => { z.data.k = e.aimK; z.data.fx = e.cx; z.data.fy = e.cy; setRect(z, spot.x - 40, spot.y - 90, spot.x + 40, spot.y + 4); }, { x: spot.x, y: spot.y });
        return;
      }
    }
    if (e.cool <= 0 && e.distToPlayer() < 560) { e.setState('throw'); e.fired = false; e.aimK = 0; glint(world, e.cx + e.facing * 18, e.cy - 12, '#e8d0ff', 36); }
  },
  /** 소환 자리: 인형사 옆 ±80 의 바닥 (플레이어 쪽 먼저) */
  summonSpot(e, world, p) {
    const m = world.map, first = Math.sign(p.cx - e.cx) || 1;
    for (const s of [first, -first, 0]) {
      const x = e.cx + s * 80;
      if (x < 24 || x > m.pxW - 24) continue;
      const gy = floorBelow(world, x, e.y, 520);
      if (gy == null || solidAt(world, x, gy - 20) || solidAt(world, x, gy - 60)) continue;
      return { x, y: gy };
    }
    return null;
  },
  onDie(e, world) {
    for (const k of e.puppets ?? []) {
      if (!alive(k)) continue;
      // 실이 끊긴 인형: 조용히 무너진다 (처치 보상 없음)
      k.dead = true;
      puff(world, 'shard', k.cx, k.cy, 8, { color: '#f4efe6', speed: 160 });
      puff(world, 'dark', k.cx, k.cy, 6, { speed: 80 });
      world.spawnDebris?.(k, '#e8dcc8', 5);
    }
    if (e.puppets?.length) audio.sfx('break_wall', { vol: 0.3, pitch: 1.7 });
    e.puppets = [];
  },
};

/**
 * 얼굴 없는 자: 플레이어가 자기 쪽을 보고 있고(sign(e.cx − p.cx) === p.facing) P.sight 안이면 'freeze' (멈춤, 맞을 수는 있음).
 * 보지 않으면 'creep' — P.creep 속도로 다가오고, 90 안이면 'grab' P.grab 윈드업 → 90×120 붙잡기 (mv 1.8).
 *   (윈드업 도중 플레이어가 돌아보면 멈춘다.)
 * P.blink ± 1초마다, 보지 않고 거리 > 300 이면 플레이어 등 뒤 180 으로 순간이동 → 0.4초 동안 나타남 (그동안 닿아도 피해 없음).
 * 발소리 없음.
 */
AI_D.stalker = {
  init(e) { e.blinkT = (e.params.blink ?? 7) + rand(-1, 1); e.cool = rand(0.3, 0.8); e.watched = false; e.aimK = 0; e.setState('idle'); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx, d = Math.hypot(dx, p.cy - e.cy);
    const watched = !p.dead && (Math.sign(e.cx - p.cx) || p.facing) === p.facing && d < (P.sight ?? 700);
    e.watched = watched;
    e.cool -= dt * e.aggro;
    if (e.state === 'appear') {
      e.vx = 0; e.setAnim('appear');
      e.alpha = clamp(e.stateT / 0.4, 0, 1);
      if (e.stateT >= 0.4) { e.alpha = 1; e.harmless = false; e.setState(watched ? 'freeze' : 'creep'); }
      return;
    }
    if (e.state === 'windup') {
      const T0 = P.grab ?? 0.35;
      e.vx = 0; e.setAnim('grab'); e.aimK = clamp(e.stateT / T0, 0, 1);
      if (!e.fired && watched) { e.setState('freeze'); e.aimK = 0; return; }   // 돌아보면 멈춘다
      if (e.stateT >= T0 && !e.fired) {
        e.fired = true;
        e.strike(-10, -112, 90, 120, 1.8, { kb: [380, -420], hitId: nid('grab'), element: 'dark' });
        audio.sfx('slash_heavy', { vol: 0.5, pitch: 0.6 });
      }
      if (e.stateT > T0 + 0.45) { e.setState('creep'); e.cool = rand(0.6, 1.0); }
      return;
    }
    // 순간이동 (보지 않을 때, 멀리 있을 때만)
    e.blinkT -= dt * e.aggro;
    if (e.blinkT <= 0) {
      if (!watched && d > 300 && this.teleport(e, world, p)) { e.blinkT = (P.blink ?? 7) + rand(-1, 1); return; }
      e.blinkT = 0.5;
    }
    if (watched) {
      e.vx = 0; e.setState('freeze'); e.setAnim('freeze'); e.aimK = 0;
      return;
    }
    e.setState('creep'); faceP(e);
    if (Math.abs(dx) < 90 && Math.abs(p.cy - e.cy) < 100 && e.onGround && e.cool <= 0) {
      e.setState('windup'); e.fired = false; e.vx = 0; e.aimK = 0;
      glint(world, e.cx + e.facing * 12, e.y + 16, '#e8e8ff', 34);
      return;
    }
    chase(e, e.facing, P.creep ?? 170);
    e.setAnim(Math.abs(e.vx) > 5 ? 'creep' : 'idle');
  },
  /** 플레이어 등 뒤 180 px 바닥으로 (벽·낭떠러지면 실패) */
  teleport(e, world, p) {
    const m = world.map, back = -(p.facing || 1);
    const x = p.cx + back * 180;
    if (x < e.w || x > m.pxW - e.w) return false;
    const gy = floorBelow(world, x, p.y, p.h + 160);
    if (gy == null || Math.abs(gy - p.bottom) > 140) return false;
    if (solidAt(world, x, gy - 12) || solidAt(world, x, gy - e.h * 0.5) || solidAt(world, x, gy - e.h + 6)) return false;
    puff(world, 'dark', e.cx, e.cy, 8, { speed: 70 });
    e.cx = x; e.bottom = gy; e.vx = 0; e.vy = 0;
    e.facing = Math.sign(p.cx - x) || 1;
    e.alpha = 0; e.harmless = true;
    e.setState('appear');
    puff(world, 'dark', e.cx, e.cy, 10, { speed: 50, jitter: e.h * 0.3 });
    audio.sfx('ghost', { vol: 0.45, pitch: 0.6 });
    return true;
  },
};

// ═════════════════════════ s19 썩어가는 숲 ═════════════════════════
/**
 * 썩은 나무거인: 느리게 걷는다.
 * roots — 'plant' P.windup (두 팔을 땅에 꽂음) → 앞 120/240/360 에 뿌리 가시 3개 (플레이어가 그 안이면 가장 가까운 자리를 플레이어 x 로),
 *   각각 0.5초 경고, 0.25초 간격, 70×110, 0.45초, mv 1.3.
 * sweep — |dx| < 150 에서 'swing' 0.6 → 150×90 (mv 1.5).
 * 3초 안에 P.sporeHits 번 맞으면 몸속 포자를 뿜는다: blight addCloud(cx−80, cy−60, 160, 120, 4) (없으면 독 Zone), 쿨다운 6초.
 */
AI_D.treant = {
  init(e) { e.cool = rand(0.8, 1.6); e.hitLog = []; e.sporeReady = 0; e.sporeAt = -9; e.pick = 0; e.aimK = 0; e.setState('walk'); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    switch (e.state) {
      case 'cast': {
        const wu = P.windup ?? 0.8;
        e.vx = 0; e.setAnim('plant'); e.aimK = clamp(e.stateT / wu, 0, 1);
        if (e.stateT >= wu && !e.fired) { e.fired = true; this.roots(e, world, p); }
        if (e.stateT > wu + 0.7) { e.setState('walk'); e.cool = rate(e, 2.2); }
        return;
      }
      case 'swing': {
        e.vx = 0; e.setAnim('swing'); e.aimK = clamp(e.stateT / 0.6, 0, 1);
        if (e.stateT >= 0.6 && !e.fired) {
          e.fired = true;
          e.strike(-12, -96, 150, 90, 1.5, { kb: [420, -300], hitId: nid('tsweep') });
          world.camera?.shake(3, 0.12); audio.sfx('slash_heavy', { vol: 0.55, pitch: 0.55 });
          puff(world, 'dust', e.cx + e.facing * 90, e.bottom - 20, 6, { speed: 140 });
        }
        if (e.stateT > 1.1) { e.setState('walk'); e.cool = rate(e, 2.2) * 0.8; }
        return;
      }
    }
    e.setState('walk'); e.aimK = 0;
    const dx = p.cx - e.cx, adx = Math.abs(dx);
    if (seesP(e, p, P.sight ?? 480, 200)) {
      faceP(e);
      if (e.cool <= 0 && e.onGround) {
        if (adx < 150 && Math.abs(p.cy - e.cy) < 110) { e.setState('swing'); e.fired = false; glint(world, e.cx + e.facing * 30, e.y + 30, '#e0ffb0', 40); audio.sfx('land', { vol: 0.3, pitch: 0.5 }); return; }
        if (adx < 440) { e.setState('cast'); e.fired = false; audio.sfx('break_wall', { vol: 0.3, pitch: 0.5 }); return; }
      }
      chase(e, e.facing, adx < 120 ? 0 : e.speed);
    } else patrol(e, 0.5);
    e.setAnim(Math.abs(e.vx) > 3 ? 'walk' : 'idle');
  },
  roots(e, world, p) {
    const d = e.facing, offs = [120, 240, 360];
    const ahead = (p.cx - e.cx) * d;
    if (ahead > 40 && ahead < 420) {
      let bi = 0;
      for (let i = 1; i < 3; i++) if (Math.abs(offs[i] - ahead) < Math.abs(offs[bi] - ahead)) bi = i;
      offs[bi] = Math.max(60, ahead);
      offs.sort((a, b) => a - b);
    }
    world.camera?.shake(4, 0.2);
    puff(world, 'dust', e.cx + d * 30, e.bottom - 6, 10, { speed: 160 });
    audio.sfx('land', { vol: 0.5, pitch: 0.4 });
    offs.forEach((o, i) => {
      const x = e.cx + d * o;
      if (x < 20 || x > world.map.pxW - 20) return;
      const top = floorBelow(world, x, e.bottom - 60, 220);
      if (top == null || solidAt(world, x, top - 30)) return;
      addZone(world, { x: x - 35, y: top - 110, w: 70, h: 110, delay: 0.5 + i * 0.25, life: 0.45, owner: e, render: zoneRender('root_spike'), z: 6,
        data: { seed: rand(0, 99), x, top },
        tick: (z, w) => { if (z.active && !z.data.up) { z.data.up = true; w.fx?.burst('dust', x, top - 4, 6, { speed: 150, angle: -PI / 2, spread: 1.2 }); audio.sfx('break_wall', { vol: 0.25, pitch: 0.7 + i * 0.1 }); } },
        attack: atk(e, 1.3, { kb: [180, -640], hitId: nid('root') }) });
    });
  },
  onHit(e, world) {
    const now = e.t, L = e.hitLog;
    L.push(now);
    while (L.length && now - L[0] > 3) L.shift();
    if (L.length >= (e.params.sporeHits ?? 4) && now >= e.sporeReady) {
      e.sporeReady = now + 6; e.sporeAt = now; L.length = 0;
      sporeCloud(world, e, e.cx - 80, e.cy - 60, 160, 120, 4);
      audio.sfx('mist', { vol: 0.4, pitch: 0.5 });
    }
  },
};

/**
 * 역병 나방: 플레이어 머리 위 P.hover 에서 사인파로 날갯짓한다 (속도 120, 진폭 60, 3 rad/s).
 * P.dust 초마다 'dust' — 플레이어 쪽으로 살짝 내려앉으며 날개를 떨고(0.45초 경고) 몸 60 아래에 포자 구름 100×80 (3초).
 *   (구름이 머리 위에만 쌓이지 않도록 뿌리는 순간에는 플레이어 머리 높이까지 내려온다 — 구름 자리 = 뿌리는 순간 나방 자리 + 60)
 */
AI_D.moth = {
  init(e) { e.ph = rand(0, TAU); e.dustT = (e.params.dust ?? 3) * rand(0.6, 1.0); e.aimK = 0; e.setState('fly'); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.dustT -= dt * e.aggro;
    e.ph += dt * 3;
    if (e.state === 'dust') {
      e.setAnim('dust'); e.aimK = clamp(e.stateT / 0.45, 0, 1);
      if (!e.fired) hover(e, e.dx0, e.dy0, 4, dt, e.speed * 1.6);
      else { e.vx *= Math.pow(0.2, dt); e.vy += (-120 - e.vy) * Math.min(1, 3 * dt); }
      if (Math.random() < 0.5 * qual(world)) world.fx?.emit('magic', e.cx + rand(-22, 22), e.cy + rand(0, 16), { color: '#c8ff6a', speed: 30 });
      if (e.stateT >= 0.45 && !e.fired) {
        e.fired = true;
        sporeCloud(world, e, e.cx - 50, e.cy + 60 - 40, 100, 80, 3);
      }
      if (e.stateT > 0.9) e.setState('fly');
      return;
    }
    e.setState('fly'); e.setAnim('fly'); e.aimK = 0;
    const tx = p.cx + Math.sin(e.ph * 0.5) * 60, ty = p.cy - (P.hover ?? 180) + Math.sin(e.ph) * 60 * 0.5;
    hover(e, tx, ty, 2.5, dt, e.speed);
    e.vy += Math.cos(e.ph) * 60 * dt * 3;
    if (Math.abs(e.vx) > 10) e.facing = Math.sign(e.vx);
    if (e.dustT <= 0 && Math.abs(p.cx - e.cx) < 90 && e.distToPlayer() < 360) {   // 머리 위에 왔을 때만 뿌린다
      // 뿌릴 자리: 플레이어 머리 위 (구름 가운데가 플레이어 가슴께에 오도록)
      e.dx0 = p.cx; e.dy0 = Math.min(e.cy + 60, p.cy - 90);
      if (solidAt(world, e.dx0, e.dy0)) { e.dx0 = e.cx; e.dy0 = e.cy; }
      e.setState('dust'); e.fired = false; e.aimK = 0; e.dustT = P.dust ?? 3;   // 뿌리기 시작부터 다음 뿌리기까지 P.dust 초
      audio.sfx('bat', { vol: 0.25, pitch: 1.8 });
    }
  },
};

/**
 * 균사 망자: 좀비(AI.zombie)와 똑같이 솟아올라 쫓아온다 (P.chaseMul).
 * onDie — 쓰러지면 부풀어 오르고(0.3초 경고) 포자 구름 140×110 (4초).
 */
AI_D.husk = {
  init(e) { AI.zombie.init(e); },
  update(e, world, dt) { AI.zombie.update(e, world, dt); },
  onDie(e, world) {
    const x = e.cx, by = e.bottom;
    addZone(world, { x: x - 40, y: by - 60, w: 80, h: 60, delay: 0.3, life: 0.05, noHit: true, owner: e, render: zoneRender('spore_swell'), z: 6, data: { x, y: by },
      onExpire: (z, w) => sporeCloud(w, e, x - 70, by - 110, 140, 110, 4) });
    puff(world, 'magic', x, by - 30, 8, { color: '#c8ff6a', speed: 70 });
  },
};

// ═════════════════════════ s20 태초의 공허 ═════════════════════════
/**
 * 공허의 전령: 플레이어 높이 ±40 에 떠서 P.keep 거리를 둔다.
 * prism — 'aim' P.aim (조준선이 플레이어를 따라가다 0.6초에 고정) → 광선 (굵기 18, 첫 벽 또는 900까지, 0.4초, mv 1.6 암흑, 무지갯빛).
 * starfall — 'raise' 0.7 → 플레이어 x −200…+200 에 별 5개가 화면 위에서 떨어진다 (속도 520, mv 0.9), 떨어질 자리에 0.5초 이상 작은 원 경고.
 * 공격 뒤 40% 확률로 플레이어 반대편 280 으로 건너뛴다 ('blink', P.blink 초 동안 사라졌다 나타남; 그동안 무적·무해).
 */
AI_D.herald = {
  init(e) { e.cool = rand(1.2, 2.0); e.side = 0; e.pick = 0; e.aimA = 0; e.lock = false; e.aimK = 0; e.setState('float'); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    if (!e.side) e.side = Math.sign(e.cx - p.cx) || 1;   // 처음엔 나타난 쪽에 머문다
    e.cool -= dt * e.aggro;
    switch (e.state) {
      case 'aim': {
        const T0 = P.aim ?? 0.9, lockAt = Math.min(0.6, T0 * 0.7);
        e.setAnim('aim'); e.vx *= Math.pow(0.1, dt); e.vy *= Math.pow(0.1, dt);
        e.aimK = clamp(e.stateT / T0, 0, 1);
        const o = this.eye(e);
        if (e.stateT < lockAt) { e.aimA = angleTo(o.x, o.y, p.cx, p.cy - 6); e.lock = false; faceP(e); }
        else if (!e.lock) { e.lock = true; audio.sfx('charge_ready', { vol: 0.4, pitch: 1.5 }); }
        if (e.stateT >= T0) {
          e.setState('fire');
          const len = rayLen(world, o.x, o.y, e.aimA, 900);
          const x1 = o.x + Math.cos(e.aimA) * len, y1 = o.y + Math.sin(e.aimA) * len;
          const z = addZone(world, { x: 0, y: 0, w: 1, h: 1, delay: 0, life: 0.4, owner: e, render: zoneRender('prism_beam'), z: 7,
            data: { x0: o.x, y0: o.y, x1, y1, a: e.aimA, fire: true },
            hitTest: (zz, w) => { const hb = w.player.hurtbox(); return segDist(hb.x + hb.w / 2, hb.y + hb.h / 2, zz.data.x0, zz.data.y0, zz.data.x1, zz.data.y1) < 9 + Math.min(hb.w, hb.h) * 0.5; },
            light: { r: 120, color: '#ffffff', i: 0.8 },
            attack: atk(e, 1.6, { type: 'mag', element: 'dark', kb: [360, -260], dir: Math.cos(e.aimA) >= 0 ? 1 : -1, hitId: nid('prism') }) });
          setRect(z, o.x, o.y, x1, y1);
          puff(world, 'spark', x1, y1, 10, { color: '#ffffff', speed: 240 });
          world.camera?.shake(4, 0.18);
          audio.sfx('holy', { vol: 0.5, pitch: 0.6 }); audio.sfx('dark', { vol: 0.5, pitch: 0.7 });
        }
        return;
      }
      case 'fire':
        e.setAnim('fire'); e.vx *= Math.pow(0.1, dt); e.vy *= Math.pow(0.1, dt);
        if (e.stateT > 0.45) this.after(e, world);
        return;
      case 'cast': {
        e.setAnim('raise'); e.vx *= Math.pow(0.1, dt); e.vy *= Math.pow(0.1, dt);
        e.aimK = clamp(e.stateT / 0.7, 0, 1);
        if (Math.random() < 0.6 * qual(world)) world.fx?.emit('magic', e.cx + rand(-16, 16), e.y + rand(-10, 20), { color: '#ffffff', speed: 60 });
        if (e.stateT >= 0.7 && !e.fired) { e.fired = true; this.starfall(e, world, p); }
        if (e.stateT > 1.0) this.after(e, world);
        return;
      }
      case 'blink': {
        const Tb = Math.max(0.2, P.blink ?? 0.4), half = Tb / 2;
        e.setAnim('blink'); e.vx = 0; e.vy = 0;
        e.alpha = e.stateT < half ? 1 - e.stateT / half : clamp((e.stateT - half) / half, 0, 1);
        e.invuln = e.alpha < 0.5; e.harmless = true;
        if (e.stateT >= half && !e.fired) {
          e.fired = true;
          const side = Math.sign(e.cx - p.cx) || 1, m = world.map;
          let x = p.cx - side * 280;
          if (x < e.w || x > m.pxW - e.w) x = p.cx + side * 280;
          puff(world, 'magic', e.cx, e.cy, 10, { color: '#ffffff', speed: 120 });
          e.cx = clamp(x, e.w, m.pxW - e.w); e.y = clamp(p.cy - e.h / 2, 8, m.pxH - e.h - 8);
          e.side = Math.sign(e.cx - p.cx) || 1; faceP(e);
          world.fx?.ring(e.cx, e.cy, { color: '#ffffff', r0: 50, r1: 6, life: 0.25, width: 3 });
          audio.sfx('mist', { vol: 0.4, pitch: 1.3 });
        }
        if (e.stateT >= Tb) { e.alpha = 1; e.invuln = false; e.harmless = false; e.setState('float'); e.cool = rate(e, 2.4); }
        return;
      }
    }
    // ── 떠 있기 ──
    e.setState('float'); e.setAnim('float'); e.aimK = 0; e.lock = false;
    const keep = P.keep ?? 280, m = world.map;
    if (Math.abs(p.cx - e.cx) > keep * 2) e.side = Math.sign(e.cx - p.cx) || e.side;
    let tx = p.cx + e.side * keep;
    if (tx < 40 || tx > m.pxW - 40) { e.side = -e.side; tx = p.cx + e.side * keep; }
    hover(e, tx, p.cy + Math.sin(e.t * 1.1) * 40, 1.8, dt, e.speed * 2);
    keepInMap(e, world);
    faceP(e);
    if (e.cool <= 0 && e.distToPlayer() < 720) {
      e.pick++;
      if (e.pick % 2 === 1) {
        e.setState('aim'); e.lock = false; e.aimK = 0;
        const o = this.eye(e); e.aimA = angleTo(o.x, o.y, p.cx, p.cy - 6);
        glint(world, o.x, o.y, '#ffffff', 40);
        warnZone(world, e, 'aim', 'prism_beam', (z, w) => {
          const oo = this.eye(e), len = rayLen(w, oo.x, oo.y, e.aimA, 900);
          const x1 = oo.x + Math.cos(e.aimA) * len, y1 = oo.y + Math.sin(e.aimA) * len;
          Object.assign(z.data, { x0: oo.x, y0: oo.y, x1, y1, a: e.aimA, k: e.aimK, lock: e.lock });
          setRect(z, oo.x, oo.y, x1, y1);
        });
      } else { e.setState('cast'); e.fired = false; e.aimK = 0; audio.sfx('holy', { vol: 0.35, pitch: 1.4 }); }
    }
  },
  /** 광선이 나오는 자리 (내민 손) */
  eye(e) { return { x: e.cx + e.facing * 16, y: e.cy - e.h * 0.12 }; },
  after(e, world) {
    if (chance(0.4)) { e.setState('blink'); e.fired = false; }
    else { e.setState('float'); e.cool = rate(e, 2.4); }
  },
  starfall(e, world, p) {
    const m = world.map, camY = world.camera?.y ?? 0;
    audio.sfx('holy', { vol: 0.4, pitch: 0.8 });
    for (let i = 0; i < 5; i++) {
      const x = clamp(p.cx - 200 + i * 100 + rand(-18, 18), 12, m.pxW - 12);
      const gy = floorBelow(world, x, Math.max(0, Math.min(p.y - 40, camY + 40)), 1200);
      if (gy == null) continue;
      const y0 = openBelow(world, x, Math.max(0, camY - 16), gy - 30);
      const fallT = Math.max(0.05, (gy - y0) / 520);
      const warn = Math.max(0.5, fallT) + i * 0.06;
      addZone(world, { x: x - 22, y: gy - 12, w: 44, h: 14, delay: warn, life: 0.1, noHit: true, owner: e, render: zoneRender('star_mark'), z: 6,
        data: { x, y: gy, launched: false },
        tick: (z, w) => {
          if (z.data.launched || z.t < warn - fallT) return;
          z.data.launched = true;
          bolt(e, { x, y: y0, vx: 0, vy: 520, w: 18, h: 18, render: projRender('void_star'), color: '#e8e0ff', life: fallT + 0.6, collideWalls: true,
            light: { r: 60, color: '#ffffff', i: 0.6 }, attack: { mv: 0.9, kb: [160, -300] },
            onWall: (pr, ww) => { pr.dead = true; ww.fx?.burst('magic', pr.cx, pr.cy - 6, 8, { color: '#ffffff', speed: 160 }); ww.fx?.ring(pr.cx, pr.cy - 4, { color: '#e8e0ff', r0: 4, r1: 34, life: 0.2, width: 3 }); } });
        } });
    }
  },
};

// ═════════════════════════ 대체 그림 (ENEMY-P2-D-ART 의 PROJ_D / ZONE_D 가 없을 때) ═════════════════════════
const PF = {}, ZF = {};
const _zr = {}, _pr = {};
/** 장판 렌더러: ZONE_D[key] 가 있으면 그것, 없으면 ZF[key] (호출 때 고른다 → 렌더 패키지가 나중에 채워도 된다) */
function zoneRender(key) {
  return _zr[key] ??= (ctx, z, world) => { const f = RD.ZONE_D?.[key]; (typeof f === 'function' ? f : ZF[key])?.(ctx, z, world); };
}
function projRender(key) {
  return _pr[key] ??= (ctx, p, world) => { const f = RD.PROJ_D?.[key]; (typeof f === 'function' ? f : PF[key])?.(ctx, p, world); };
}
/** 결정적 잡음 0..1 (그리기 코드에서는 Math.random 을 쓰지 않는다) */
const h1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function glowAt(ctx, color, x, y, size, a = 1) {
  const img = HFX.glow?.(color);
  if (!img || a <= 0.01) return;
  const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalAlpha = ga * a; ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
}

PF.gale_crescent = (ctx, p) => {
  ctx.rotate(Math.atan2(p.vy, p.vx));
  const R = p.h * 0.5, fade = p.maxLife ? clamp(p.life / 0.25, 0, 1) : 1;
  ctx.globalAlpha *= fade;
  glowAt(ctx, '#bfe8ff', -4, 0, R * 2.6, 0.55);
  ctx.beginPath();
  ctx.arc(-R * 0.55, 0, R, -1.15, 1.15);
  ctx.arc(-R * 0.9, 0, R * 0.86, 1.05, -1.05, true);
  ctx.closePath();
  ctx.fillStyle = 'rgba(232,250,255,0.9)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(120,200,255,0.9)'; ctx.stroke();
  ctx.strokeStyle = 'rgba(210,240,255,0.5)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const y = (i - 1) * R * 0.45, ph = (p.t * 5 + i * 0.3) % 1;
    ctx.beginPath(); ctx.moveTo(-R * 0.6 - ph * 30, y); ctx.lineTo(-R * 1.6 - ph * 30, y * 1.2); ctx.stroke();
  }
};
PF.puppet_needle = (ctx, p, world) => {
  const f = RA.PROJ_A?.needle;
  if (typeof f === 'function') { f(ctx, p, world); return; }
  ctx.rotate(Math.atan2(p.vy, p.vx));
  ctx.strokeStyle = '#e8e0f0'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke();
};
PF.void_star = (ctx, p) => {
  const t = p.t;
  // 꼬리 (무지갯빛 세 줄)
  ctx.globalCompositeOperation = 'lighter';
  const cols = ['rgba(255,90,140,0.45)', 'rgba(90,255,170,0.45)', 'rgba(120,150,255,0.45)'];
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) { ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.moveTo((i - 1) * 3, -4); ctx.lineTo((i - 1) * 5, -46); ctx.stroke(); }
  glowAt(ctx, '#d8c8ff', 0, 0, 56, 0.9);
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(t * 7);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * PI / 4, r = i & 1 ? 3 : 10; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath(); ctx.fill();
};

ZF.lance_warn = (ctx, z) => {
  const d = z.data, k = d.k ?? 0, x1 = d.x0 + d.dir * d.len;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(150,215,255,${0.05 + 0.1 * k})`;
  ctx.fillRect(Math.min(d.x0, x1), d.y - 16, d.len, 32);
  const blink = k > 0.7 && ((z.t * 18) | 0) % 2 === 0;
  ctx.strokeStyle = blink ? 'rgba(255,255,255,0.95)' : `rgba(200,240,255,${0.3 + 0.5 * k})`;
  ctx.lineWidth = 2 + 2.5 * k;
  ctx.setLineDash([16, 10]); ctx.lineDashOffset = -z.t * 160 * d.dir;
  ctx.beginPath(); ctx.moveTo(d.x0, d.y); ctx.lineTo(x1, d.y); ctx.stroke();
  ctx.setLineDash([]);
  // 끝 화살촉
  ctx.beginPath(); ctx.moveTo(x1, d.y); ctx.lineTo(x1 - d.dir * 14, d.y - 9); ctx.moveTo(x1, d.y); ctx.lineTo(x1 - d.dir * 14, d.y + 9); ctx.stroke();
  ctx.restore();
};
ZF.roc_bolt = (ctx, z) => {
  const d = z.data, x = d.x, top = d.top, bot = d.bottom;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (!d.live) {
    // 경고: 옅은 기둥 + 바닥 표시
    const k = d.k ?? 0;
    ctx.fillStyle = `rgba(170,210,255,${0.04 + 0.1 * k})`; ctx.fillRect(x - 25, top, 50, bot - top);
    ctx.strokeStyle = `rgba(210,235,255,${0.25 + 0.5 * k})`; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]); ctx.lineDashOffset = z.t * 60;
    ctx.beginPath(); ctx.moveTo(x - 25, top); ctx.lineTo(x - 25, bot); ctx.moveTo(x + 25, top); ctx.lineTo(x + 25, bot); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(230,245,255,${0.4 + 0.5 * k})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, bot - 2, 26 - 10 * k, 6 - 2 * k, 0, 0, TAU); ctx.stroke();
    ctx.restore();
    return;
  }
  const fade = clamp(z.life / 0.15, 0, 1);
  ctx.globalAlpha *= fade;
  ctx.fillStyle = 'rgba(190,225,255,0.28)'; ctx.fillRect(x - 25, top, 50, bot - top);
  const f = Math.floor(z.t * 30), seg = 26, n = Math.max(2, Math.ceil((bot - top) / seg));
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? '#ffffff' : 'rgba(140,190,255,0.8)';
    ctx.lineWidth = pass ? 3 : 10;
    ctx.beginPath(); ctx.moveTo(x, top);
    for (let i = 1; i <= n; i++) ctx.lineTo(x + (i === n ? 0 : (h1(i * 3.1 + f * 7 + d.seed) - 0.5) * 30), Math.min(bot, top + i * seg));
    ctx.stroke();
  }
  glowAt(ctx, '#bfe0ff', x, bot - 6, 90, 0.8);
  ctx.restore();
};
ZF.jelly_shock = (ctx, z) => {
  const d = z.data, r = d.r ?? 120;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (d.warn || (d.mini && !z.active)) {
    const k = d.warn ? (d.k ?? 0) : z.warnK;
    ctx.fillStyle = `rgba(160,200,255,${0.03 + 0.07 * k})`;
    ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(210,235,255,${0.2 + 0.6 * k})`; ctx.lineWidth = 1.5 + 1.5 * k;
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = z.t * 40;
    ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }
  const u = z.liveK, fade = 1 - u;
  ctx.globalAlpha *= fade;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(d.x, d.y, r * (0.85 + 0.15 * u), 0, TAU); ctx.stroke();
  const f = Math.floor(z.t * 30);
  ctx.strokeStyle = 'rgba(170,215,255,0.9)'; ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + h1(i + f) * 0.4;
    ctx.beginPath(); ctx.moveTo(d.x, d.y);
    for (let s = 1; s <= 4; s++) { const rr = r * s / 4, j = (h1(i * 9 + s + f * 3) - 0.5) * 0.35; ctx.lineTo(d.x + Math.cos(a + j) * rr, d.y + Math.sin(a + j) * rr); }
    ctx.stroke();
  }
  glowAt(ctx, '#bfe0ff', d.x, d.y, r * 1.6, 0.7 * fade);
  ctx.restore();
};
ZF.root_spike = (ctx, z) => {
  const d = z.data, x = d.x, by = d.top;
  ctx.save();
  if (!z.active) {
    // 경고: 땅이 갈라지며 흙이 들썩인다
    const k = z.warnK;
    ctx.fillStyle = `rgba(20,12,6,${0.35 + 0.4 * k})`;
    ctx.beginPath(); ctx.ellipse(x, by - 1, 22 + 12 * k, 4 + 2 * k, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(200,255,140,${0.25 + 0.5 * k})`; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const a = h1(i + d.seed) * 26 - 13; ctx.moveTo(x + a, by - 1); ctx.lineTo(x + a * 1.6 + (i - 1.5) * 6, by - 1 - 4 * k); }
    ctx.stroke();
    ctx.restore();
    return;
  }
  const u = z.liveK, rise = u < 0.25 ? 1 - Math.pow(1 - u / 0.25, 3) : u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
  const H = z.h * rise;
  for (let i = -1; i <= 1; i++) {
    const bx = x + i * 16, hh = H * (i === 0 ? 1 : 0.72), lean = i * 0.25 + (h1(i + d.seed) - 0.5) * 0.2;
    ctx.beginPath();
    ctx.moveTo(bx - 9, by);
    ctx.quadraticCurveTo(bx - 4 + lean * hh * 0.3, by - hh * 0.6, bx + lean * hh * 0.5, by - hh);
    ctx.quadraticCurveTo(bx + 4 + lean * hh * 0.3, by - hh * 0.5, bx + 9, by);
    ctx.closePath();
    ctx.fillStyle = '#4a3522'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#1a0f08'; ctx.stroke();
    ctx.fillStyle = '#d8d0a8';
    ctx.beginPath(); ctx.arc(bx + lean * hh * 0.5, by - hh + 3, 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
};
ZF.spore_cloud = (ctx, z) => {
  const d = z.data, t = z.t;
  const fade = !z.active ? z.warnK : clamp(z.life / 1, 0, 1);
  if (fade <= 0.01) return;
  const img = HFX.soft?.('rgba(150,200,70,0.55)'), img2 = HFX.soft?.('rgba(120,90,160,0.35)');
  ctx.save();
  ctx.globalAlpha *= fade;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const u = h1(i + d.seed), v = h1(i * 2.3 + d.seed);
    const cx = z.x + z.w * (0.2 + 0.6 * u) + Math.sin(t * 0.8 + i) * 8;
    const cy = z.y + z.h * (0.25 + 0.5 * v) + Math.cos(t * 0.6 + i * 1.7) * 6;
    const s = Math.min(z.w, z.h) * (0.8 + 0.4 * h1(i + 7));
    const im = i % 3 === 2 ? img2 : img;
    if (im) ctx.drawImage(im, cx - s / 2, cy - s / 2, s, s);
    else { ctx.fillStyle = 'rgba(150,200,70,0.25)'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.35, 0, TAU); ctx.fill(); }
  }
  ctx.fillStyle = 'rgba(220,255,150,0.6)';
  for (let i = 0; i < 8; i++) {
    const ph = (t * 0.3 + h1(i + 3)) % 1;
    ctx.fillRect(z.x + z.w * h1(i * 5 + d.seed), z.y + z.h * (1 - ph), 2, 2);
  }
  ctx.restore();
};
ZF.spore_swell = (ctx, z) => {
  const d = z.data, k = z.warnK;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(200,255,120,${0.3 + 0.5 * k})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(d.x, d.y - 20, 16 + 40 * k, 10 + 24 * k, 0, 0, TAU); ctx.stroke();
  glowAt(ctx, '#9ad040', d.x, d.y - 24, 60 + 60 * k, 0.5);
  ctx.restore();
};
ZF.prism_beam = (ctx, z) => {
  const d = z.data;
  if (d.x1 == null) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  if (!d.fire) {
    const k = d.k ?? 0, blink = d.lock && ((z.t * 16) | 0) % 2 === 0;
    ctx.strokeStyle = blink ? 'rgba(255,255,255,0.9)' : `rgba(230,220,255,${0.2 + 0.45 * k})`;
    ctx.lineWidth = d.lock ? 2.5 : 1.5;
    ctx.setLineDash(d.lock ? [] : [12, 8]); ctx.lineDashOffset = -z.t * 90;
    ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }
  const fade = clamp(z.life / 0.15, 0, 1);
  ctx.globalAlpha *= fade;
  const nx = -Math.sin(d.a), ny = Math.cos(d.a);
  const cols = ['rgba(255,58,106,0.55)', 'rgba(58,255,154,0.55)', 'rgba(106,138,255,0.55)'];
  ctx.lineWidth = 7;
  for (let i = 0; i < 3; i++) {
    const o = (i - 1) * 4 + Math.sin(z.t * 40 + i) * 1.5;
    ctx.strokeStyle = cols[i];
    ctx.beginPath(); ctx.moveTo(d.x0 + nx * o, d.y0 + ny * o); ctx.lineTo(d.x1 + nx * o, d.y1 + ny * o); ctx.stroke();
  }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); ctx.stroke();
  glowAt(ctx, '#e8e0ff', d.x1, d.y1, 70, 0.9);
  glowAt(ctx, '#ffffff', d.x0, d.y0, 50, 0.8);
  ctx.restore();
};
ZF.star_mark = (ctx, z) => {
  const d = z.data, k = z.warnK;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = 22 - 10 * k;
  ctx.strokeStyle = `rgba(240,230,255,${0.35 + 0.55 * k})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(d.x, d.y - 2, r, r * 0.3, 0, 0, TAU); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const a = z.t * 3 + i * PI / 2; ctx.moveTo(d.x + Math.cos(a) * (r + 3), d.y - 2 + Math.sin(a) * (r + 3) * 0.3); ctx.lineTo(d.x + Math.cos(a) * (r + 9), d.y - 2 + Math.sin(a) * (r + 9) * 0.3); }
  ctx.stroke();
  ctx.restore();
};
ZF.summon_mark = (ctx, z) => {
  const d = z.data, k = d.k ?? 0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(200,120,255,${0.3 + 0.5 * k})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(d.x, d.y - 2, 14 + 26 * k, (14 + 26 * k) * 0.28, 0, 0, TAU); ctx.stroke();
  // 인형사 손가락에서 내려오는 실
  if (d.fx != null) {
    ctx.strokeStyle = `rgba(235,220,255,${0.15 + 0.35 * k})`; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) { ctx.moveTo(d.fx + i * 5, d.fy); ctx.lineTo(d.x + i * 10, d.y - 60 * k); }
    ctx.stroke();
  }
  glowAt(ctx, '#c060ff', d.x, d.y - 10, 50 + 40 * k, 0.5 * k);
  ctx.restore();
};
