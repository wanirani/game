// 시범판 B — 캐릭터 그림: v1 채색 퍼펫을 그대로 2D 캔버스(아틀라스)에 그리고 텍스처로 올린다. docs/v2/proto_b.md §4
// 방식 (1) 을 골랐다: 퍼펫 코드는 한 줄도 고치지 않는다 (drawHero · drawEnemy 를 발밑 원점으로 부를 뿐).
//   한 프레임: 화면에 보이는 캐릭터마다 아틀라스 칸 하나 → 퍼펫 그리기 → texSubImage2D 한 번 (쓴 줄만).
//   GL 쪽에서는 그 칸을 세운 사각형(빌보드)에 붙이므로 깊이 버퍼가 기둥·벽 가림을 풀어 준다.
import { drawHero, preloadPuppet } from '../../render/hero.js';
import { drawEnemy, preloadPaintedEnemies } from '../../render/enemies.js';
import { CHARACTERS } from '../../data/characters.js';
import { classChain } from '../../data/classes.js';
import { MOVESETS } from '../../data/movesets.js';
import { ENEMIES } from '../../data/enemies.js';

// 칸 크기 (논리 px) · 발밑 원점. 영웅 칸은 검 궤적까지 담는다
export const HERO_CELL = { w: 340, h: 256, ox: 170, oy: 208 };
export const ENEMY_CELL = { w: 210, h: 180, ox: 105, oy: 150 };
export const SWORD = MOVESETS.sword;
export const ENEMY_KIND = { melee: 'skeleton', ranged: 'skeleton_mage' };

export function heroLook() {
  const ch = CHARACTERS.kael, look = structuredClone(ch.look);
  for (const c of classChain('kael_hunter')) Object.assign(look, structuredClone(c.look || {}));
  look.weapon = { type: 'sword', style: 3, level: 7, rarity: 0, element: null };
  return look;
}
export function preloadChars() {
  try { preloadPuppet('kael', 'kael_hunter'); } catch (e) { console.warn('[v2b] 퍼펫 미리 받기 실패', e); }
  try { preloadPaintedEnemies(Object.values(ENEMY_KIND)); } catch (e) { console.warn('[v2b] 적 그림 미리 받기 실패', e); }
}
/** drawHero 가 읽는 v1 영웅 모양 (hero.js 머리말의 p) */
export function makeHeroPuppet() {
  return { cx: 0, bottom: 0, facing: 1, anim: 'idle', animT: 0, move: null, moveT: 0, atkSpeedMul: 1, vx: 0, vy: 0, onGround: true, rig: {}, t: 0, stats: { reach: 0 }, charging: 0, muzzleT: 0, dashT: 0, look: heroLook(), ch: CHARACTERS.kael };
}
/** drawEnemy 가 읽는 v1 적 모양 (enemies.js 머리말의 e) */
export function makeEnemyPuppet(kind) {
  const def = ENEMIES[ENEMY_KIND[kind]];
  return { cx: 0, bottom: 0, cy: -def.size.h / 2, w: def.size.w, h: def.size.h, facing: 1, anim: 'idle', animT: 0, t: 0, flashT: 0, state: 'idle', stateT: 0, def, params: def.aiParams, scale: 1, dying: 0, vx: 0, vy: 0, onGround: true, stun: 0 };
}

export class CharAtlas {
  constructor(scale) {
    this.S = Math.max(1, Math.min(2, Math.round(scale * 4) / 4));
    const big = this.S > 1.5;
    this.canvas = document.createElement('canvas');
    this.canvas.width = big ? 2048 : 1024; this.canvas.height = big ? 2048 : 1536;
    this.ctx = this.canvas.getContext('2d');
    this.used = 0; this.prevUsed = this.canvas.height; this.cx = 0; this.cy = 0; this.rowH = 0; this.cells = 0; this.drawMs = 0;
  }
  begin() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, Math.max(this.used, this.prevUsed) + 2);
    this.prevUsed = this.used; this.used = 0; this.cx = 0; this.cy = 0; this.rowH = 0; this.cells = 0;
  }
  _alloc(C) {
    const w = Math.ceil(C.w * this.S), h = Math.ceil(C.h * this.S);
    if (this.cx + w > this.canvas.width) { this.cx = 0; this.cy += this.rowH + 2; this.rowH = 0; }
    if (this.cy + h > this.canvas.height) return null;
    const r = { x: this.cx, y: this.cy, w, h };
    this.cx += w + 2; this.rowH = Math.max(this.rowH, h); this.used = Math.max(this.used, this.cy + h); this.cells++;
    return r;
  }
  /** 칸에 그리고 uv 사각형을 돌려준다 (자리가 없으면 null) */
  draw(C, fn) {
    const r = this._alloc(C); if (!r) return null;
    const c = this.ctx, S = this.S;
    c.save();
    c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
    c.setTransform(S, 0, 0, S, r.x + C.ox * S, r.y + C.oy * S);
    try { fn(c); } catch (e) { if (!this._err) { this._err = true; console.error('[v2b] 캐릭터 그리기 오류', e); } }
    c.restore();
    const W = this.canvas.width, H = this.canvas.height;
    return { u0: r.x / W, v0: r.y / H, u1: (r.x + r.w) / W, v1: (r.y + r.h) / H };
  }
  hero(p) { return this.draw(HERO_CELL, (c) => drawHero(c, p, null, { main: true })); }
  enemy(e) { return this.draw(ENEMY_CELL, (c) => drawEnemy(c, e, null)); }
}
