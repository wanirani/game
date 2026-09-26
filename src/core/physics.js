// 물리: 타일 충돌 이동, 단방향 발판, 이동 발판, 베를레 체인(망토/머리카락/채찍/사슬), 파편 물리
import { TILE } from './game.js';

export const T = {
  EMPTY: 0,
  SOLID: 1,   // 벽/바닥
  ONEWAY: 2,  // 아래에서 통과 가능한 발판
  BREAK: 3,   // 부술 수 있는 벽 (단단함)
  SPIKE: 4,   // 가시 (닿으면 피해)
  LIQUID: 5,  // 물/용암 (stage.liquid 에 따라 효과)
  FAKE: 6,    // 가짜 벽 (통과 가능한 비밀 통로, 보이기만 벽)
};
export const isSolidType = (t) => t === T.SOLID || t === T.BREAK;

export const GRAVITY = 2200;
export const MAX_FALL = 980;

/**
 * 타일맵과 충돌하며 몸체 이동.
 * body: {x,y,w,h,vx,vy, gravity?:배율, noGravity?, dropThrough?, onGround}
 * map : {typeAt(tx,ty)} (TileMap)
 * 결과: body.onGround, body.hitWall(-1/0/1), body.hitCeil, body.landed(이번 프레임 착지)
 */
export function moveBody(body, dt, map, platforms = null) {
  const wasGround = body.onGround;
  if (!body.noGravity) {
    body.vy += GRAVITY * (body.gravity ?? 1) * dt;
    const mf = body.maxFall ?? MAX_FALL;
    if (body.vy > mf) body.vy = mf;
  }
  body.hitWall = 0; body.hitCeil = false; body.landed = false;
  const prevBottom = body.y + body.h;

  // X 이동 (서브스텝)
  let dx = body.vx * dt;
  const stepsX = Math.max(1, Math.ceil(Math.abs(dx) / 14));
  const sx = dx / stepsX;
  for (let i = 0; i < stepsX; i++) {
    body.x += sx;
    if (collideX(body, map, sx)) { body.vx = 0; break; }
  }

  // Y 이동
  let dy = body.vy * dt;
  body.onGround = false;
  const stepsY = Math.max(1, Math.ceil(Math.abs(dy) / 14));
  const sy = dy / stepsY;
  for (let i = 0; i < stepsY; i++) {
    const before = body.y + body.h;
    body.y += sy;
    if (collideY(body, map, sy, before)) {
      if (sy > 0) { body.onGround = true; }
      else body.hitCeil = true;
      body.vy = 0;
      break;
    }
  }
  // 이동 발판
  if (platforms && body.vy >= 0) {
    for (const p of platforms) {
      if (p.dead) continue;
      const top = p.y;
      if (body.x + body.w > p.x + 2 && body.x < p.x + p.w - 2 &&
          prevBottom <= top + 6 + Math.max(0, p.vy || 0) * dt && body.y + body.h >= top - 1 && !body.dropThrough) {
        body.y = top - body.h;
        body.vy = 0;
        body.onGround = true;
        body.platform = p;
        if (!(p.solidOnly)) { body.x += (p.vx || 0) * dt; }
        p.onStand?.(body);
      }
    }
  }
  if (!body.onGround) body.platform = null;
  // 바닥 붙어있기 (경사/미세 틈 방지): 이전 프레임 접지 & 바로 아래 1px 지면
  if (!body.onGround && wasGround && body.vy >= 0 && !body.noGravity) {
    body.y += 1;
    if (groundBelow(body, map)) { body.onGround = true; body.vy = 0; body.y = Math.floor((body.y + body.h) / TILE) * TILE - body.h; }
    else body.y -= 1;
  }
  body.landed = body.onGround && !wasGround;
  return body;
}

function collideX(b, map, dx) {
  const top = Math.floor(b.y / TILE), bottom = Math.floor((b.y + b.h - 0.01) / TILE);
  if (dx > 0) {
    const tx = Math.floor((b.x + b.w) / TILE);
    for (let ty = top; ty <= bottom; ty++) {
      if (isSolidType(map.typeAt(tx, ty))) { b.x = tx * TILE - b.w - 0.001; b.hitWall = 1; return true; }
    }
  } else if (dx < 0) {
    const tx = Math.floor(b.x / TILE);
    for (let ty = top; ty <= bottom; ty++) {
      if (isSolidType(map.typeAt(tx, ty))) { b.x = (tx + 1) * TILE + 0.001; b.hitWall = -1; return true; }
    }
  }
  return false;
}

function collideY(b, map, dy, prevBottom) {
  const left = Math.floor(b.x / TILE), right = Math.floor((b.x + b.w - 0.01) / TILE);
  if (dy > 0) {
    const ty = Math.floor((b.y + b.h) / TILE);
    for (let tx = left; tx <= right; tx++) {
      const t = map.typeAt(tx, ty);
      if (isSolidType(t) || (t === T.ONEWAY && !b.dropThrough && prevBottom <= ty * TILE + 0.5)) {
        b.y = ty * TILE - b.h;
        return true;
      }
    }
  } else if (dy < 0) {
    const ty = Math.floor(b.y / TILE);
    for (let tx = left; tx <= right; tx++) {
      if (isSolidType(map.typeAt(tx, ty))) { b.y = (ty + 1) * TILE + 0.001; return true; }
    }
  }
  return false;
}

function groundBelow(b, map) {
  const left = Math.floor(b.x / TILE), right = Math.floor((b.x + b.w - 0.01) / TILE);
  const ty = Math.floor((b.y + b.h) / TILE);
  for (let tx = left; tx <= right; tx++) {
    const t = map.typeAt(tx, ty);
    if (isSolidType(t) || (t === T.ONEWAY && !b.dropThrough)) return true;
  }
  return false;
}

/** 몸체가 겹친 타일 중 특정 타입이 있는지 */
export function touchesType(b, map, type, shrink = 4) {
  const l = Math.floor((b.x + shrink) / TILE), r = Math.floor((b.x + b.w - shrink) / TILE);
  const t = Math.floor((b.y + shrink) / TILE), btm = Math.floor((b.y + b.h - 1) / TILE);
  for (let ty = t; ty <= btm; ty++) for (let tx = l; tx <= r; tx++) if (map.typeAt(tx, ty) === type) return true;
  return false;
}

/** 두 점 사이 시야가 트였는지 (적 AI용) */
export function lineOfSight(map, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / (TILE / 2));
  for (let i = 1; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
    if (isSolidType(map.typeAt(Math.floor(x / TILE), Math.floor(y / TILE)))) return false;
  }
  return true;
}

/**
 * 베를레 체인: 망토, 머리카락, 스카프, 사슬, 채찍 등.
 * 첫 점은 anchor에 고정. update(dt, ax, ay, wind)
 */
export class VerletChain {
  constructor(n, segLen, { gravity = 900, damping = 0.9, stiffness = 1, iterations = 4 } = {}) {
    this.n = n; this.seg = segLen; this.gravity = gravity; this.damping = damping;
    this.stiffness = stiffness; this.iter = iterations;
    this.pts = [];
    for (let i = 0; i < n; i++) this.pts.push({ x: 0, y: i * segLen, px: 0, py: i * segLen });
    this.inited = false;
  }
  reset(ax, ay, dirX = 0, dirY = 1) {
    this.pts.forEach((p, i) => { p.x = p.px = ax + dirX * i * this.seg; p.y = p.py = ay + dirY * i * this.seg; });
    this.inited = true;
  }
  update(dt, ax, ay, fx = 0, fy = 0, groundY = null) {
    if (!this.inited) this.reset(ax, ay);
    const pts = this.pts;
    const g = this.gravity * dt * dt;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * this.damping, vy = (p.y - p.py) * this.damping;
      p.px = p.x; p.py = p.y;
      p.x += vx + fx * dt * dt; p.y += vy + g + fy * dt * dt;
      if (groundY !== null && p.y > groundY) { p.y = groundY; p.px = p.x - vx * 0.5; }
    }
    pts[0].x = pts[0].px = ax; pts[0].y = pts[0].py = ay;
    for (let k = 0; k < this.iter; k++) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = ((d - this.seg) / d) * this.stiffness;
        if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
        else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
      }
      pts[0].x = ax; pts[0].y = ay;
    }
  }
}

/** 간단 강체 파편 (뼈, 갑옷 조각, 돌 파편 등): 튕기고 회전하며 바닥에서 멈춤 */
export class Debris {
  constructor(x, y, vx, vy, opts = {}) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.w = opts.size ?? 8; this.h = opts.size ?? 8;
    this.rot = opts.rot ?? Math.random() * Math.PI * 2;
    this.vr = opts.vr ?? (Math.random() - 0.5) * 20;
    this.life = opts.life ?? 2.5; this.maxLife = this.life;
    this.bounce = opts.bounce ?? 0.45;
    this.draw = opts.draw; // (ctx, debris) 로컬 좌표(0,0) 기준 그리기
    this.color = opts.color ?? '#ddd';
    this.gravity = opts.gravity ?? 1;
    this.onGround = false;
  }
  update(dt, map) {
    this.life -= dt;
    const vyBefore = this.vy, vxBefore = this.vx;
    moveBody(this, dt, map);
    if (this.onGround) {
      if (Math.abs(vyBefore) > 120) { this.vy = -vyBefore * this.bounce; this.onGround = false; }
      this.vx *= 0.86; this.vr *= 0.8;
    }
    if (this.hitWall) this.vx = -vxBefore * 0.5;
    this.rot += this.vr * dt;
  }
}
