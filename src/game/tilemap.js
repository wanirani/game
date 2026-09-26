// 타일맵: ASCII 방 데이터를 타일 배열 + 마커 목록으로 변환
// ── 범례 (docs/ARCHITECTURE.md 와 동일) ──
//  ' ' '.' 빈칸          '#' 벽(주 텍스처)      '%' 벽(보조 텍스처)     '=' 단방향 발판
//  'B' 부서지는 벽(음식/골드)  'H' 부서지는 벽(비전서)  'K' 부서지는 벽(보물상자)
//  '^' 가시   '~' 액체(stage.liquid)   'h' 가짜 벽(비밀통로, 통과 가능 — 가짜 벽 너머에만 닿는 빈 공간도 자동으로 가짜 벽이 된다)
//  'C' 촛불  'T' 촛대/횃불(큰 드롭)  'P' 시작 위치  'S' 세이브(관)  'G' 여신상(회복)  '$' 보물상자
//  'D' 문(room.next 로 이동, 문 아래칸)  'X' 보스 트리거 열   'M' 좌우 이동 발판  'V' 상하 이동 발판  'F' 붕괴 발판
//  'N' NPC(room.npcs 순서)  '!' 스토리 트리거(room.triggers 순서)  '@' 배치 아이템(room.items 순서)
//  '1'~'9' 적(room.enemies[숫자])  'p' 파워업 구슬  'm' 고기  'L' 장식 램프(광원)  'W' 장식 창문  '|' 장식 기둥
// ── 2부 기믹 문자 (world2 §3.4; 규칙은 game/gimmicks.js) ──
//  'a' A상(실상)에서만 벽  'b' B상(허상)에서만 벽  'z' 짝수 박동에서만 벽  'Z' 홀수 박동에서만 벽   → 마커가 아니라 phaseTiles
//  'Q' 거울 스위치  'u' 공기 방울 기둥 시작점(물 속이면 그 칸도 물)  'U' 상승 기류 칸(통과 가능)  'y' 포자 주머니   → 일반 마커
import { TILE } from '../core/game.js';
import { T } from '../core/physics.js';

const TILE_CHARS = {
  '#': T.SOLID, '%': T.SOLID, '=': T.ONEWAY, B: T.BREAK, H: T.BREAK, K: T.BREAK,
  '^': T.SPIKE, '~': T.LIQUID, h: T.FAKE,
};
const DECOR_CHARS = new Set(['L', 'W', '|']);
/** 위상 타일: 문자 → 키 ('A'|'B' 거울, 'even'|'odd' 심장 박동). 처음 상태는 A상·짝수 박동 (a·z 벽, b·Z 빈칸) */
export const PHASE = { a: 'A', b: 'B', z: 'even', Z: 'odd' };
const PHASE_SOLID0 = { a: true, b: false, z: true, Z: false };

export class TileMap {
  constructor(room) {
    const rows = room.map;
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.tiles = new Uint8Array(this.w * this.h);
    this.alt = new Uint8Array(this.w * this.h);   // 1 = 보조 텍스처('%')
    this.breakKind = {};                          // idx -> 'B'|'H'|'K'
    this.markers = [];                            // {ch, tx, ty, x, y, order}
    this.decor = [];                              // {ch, tx, ty}
    this.openLeft = !!room.exitLeft; this.openRight = !!room.exitRight;
    this.openTop = true; this.openBottom = true;
    this.revealed = new Set();                    // 드러난 가짜 벽 idx
    this.version = 0;                             // 타일 변경 시 증가 (렌더 캐시 무효화)
    this.phaseTiles = [];                         // {idx, tx, ty, key:'A'|'B'|'even'|'odd'} — 이후 변화는 기믹이 map.set 으로 소유
    const counters = {};
    for (let ty = 0; ty < this.h; ty++) {
      const row = rows[ty];
      for (let tx = 0; tx < this.w; tx++) {
        const ch = row[tx] ?? ' ';
        const idx = ty * this.w + tx;
        if (ch in PHASE) {
          this.tiles[idx] = PHASE_SOLID0[ch] ? T.SOLID : T.EMPTY;
          this.phaseTiles.push({ idx, tx, ty, key: PHASE[ch] });
        } else if (ch in TILE_CHARS) {
          this.tiles[idx] = TILE_CHARS[ch];
          if (ch === '%') this.alt[idx] = 1;
          if (ch === 'B' || ch === 'H' || ch === 'K') {
            this.breakKind[idx] = ch;
            counters[ch] = (counters[ch] ?? -1) + 1;
            this.markers.push({ ch, tx, ty, x: tx * TILE, y: ty * TILE, order: counters[ch], breakable: true });
          }
        } else if (DECOR_CHARS.has(ch)) {
          this.decor.push({ ch, tx, ty });
        } else if (ch !== ' ' && ch !== '.') {
          counters[ch] = (counters[ch] ?? -1) + 1;
          this.markers.push({ ch, tx, ty, x: tx * TILE, y: ty * TILE, order: counters[ch] });
          // 공기 방울 기둥 시작점이 물 속에 있으면 그 칸도 물 (수면에 구멍이 나지 않게)
          if (ch === 'u' && [rows[ty - 1]?.[tx], rows[ty + 1]?.[tx], row[tx - 1], row[tx + 1]].includes('~')) this.tiles[idx] = T.LIQUID;
        }
      }
    }
    this.fillSecretPockets(room);
  }
  /**
   * 비밀 방 메우기: 가짜 벽(h) 너머에만 있는 빈 공간도 가짜 벽으로 바꿔, 밖에서 창문처럼 뚫려 보이거나
   * 안의 아이템·상자·촛불·적이 미리 보이지 않게 한다. 들어서는 순간 revealFake 의 flood fill 로 한꺼번에 드러난다.
   *  1) 시작점 P · 문 D · 보스 트리거 X · 방 출구(좌우 끝 열, 위쪽 출구/천장이 트인 맨 윗줄, 아래쪽 출구)에서
   *     4방향 flood fill. 벽(#,%)과 가짜 벽(h)만 막힘 — 부서지는 벽(B/H/K)·발판(=)·가시·액체는 통과(입구)로 본다.
   *  2) 닿지 못한 칸들의 연결 덩어리 가운데 가짜 벽에 맞닿은 것만 비밀 방으로 보고, 그 안의 빈칸을 가짜 벽으로 바꾼다.
   *     (발판·가시·액체·부서지는 벽은 그대로 둔다 — 안쪽 지형과 숨은 상자는 드러난 뒤에도 그대로 쓰인다)
   */
  fillSecretPockets(room) {
    const W = this.w, H = this.h, tiles = this.tiles;
    let hasFake = false;
    for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.FAKE) { hasFake = true; break; }
    if (!hasFake) return;
    // 위상 타일(a/b/z/Z)은 어느 위상에서든 지나갈 수 있으므로 열린 칸으로 보고, 가짜 벽으로 바꾸지도 않는다
    const phase = new Uint8Array(W * H);
    for (const pt of this.phaseTiles) phase[pt.idx] = 1;
    const open = (i) => phase[i] === 1 || (tiles[i] !== T.SOLID && tiles[i] !== T.FAKE);
    const reached = new Uint8Array(W * H);
    const stack = [];
    const seed = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (open(i) && !reached[i]) { reached[i] = 1; stack.push(i); } };
    // 문은 이어진 방으로 나가는 곳이지만, 가짜 벽 속에 파묻힌 비밀 문(사방이 벽·가짜 벽)은 씨앗에서 빼 함께 가린다 (s11 r2)
    const buried = (x, y) => [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].every(([a, b]) => a < 0 || b < 0 || a >= W || b >= H || !open(b * W + a));
    for (const mk of this.markers) if (mk.ch === 'P' || mk.ch === 'X' || (mk.ch === 'D' && !buried(mk.tx, mk.ty))) seed(mk.tx, mk.ty);
    for (let x = 0; x < W; x++) { seed(x, 0); if (room.exitDown) seed(x, H - 1); } // 맨 윗줄은 천장 위(방 밖)로 이어져 있다
    for (let y = 0; y < H; y++) { if (room.exitLeft) seed(0, y); if (room.exitRight) seed(W - 1, y); }
    const flood = (mark, pass, out) => {
      while (stack.length) {
        const i = stack.pop(), x = i % W, y = (i - x) / W;
        out?.push(i);
        if (x > 0 && pass(i - 1) && !mark[i - 1]) { mark[i - 1] = 1; stack.push(i - 1); }
        if (x < W - 1 && pass(i + 1) && !mark[i + 1]) { mark[i + 1] = 1; stack.push(i + 1); }
        if (y > 0 && pass(i - W) && !mark[i - W]) { mark[i - W] = 1; stack.push(i - W); }
        if (y < H - 1 && pass(i + W) && !mark[i + W]) { mark[i + W] = 1; stack.push(i + W); }
      }
    };
    flood(reached, open);
    // 닿지 못한 덩어리별로: 가짜 벽에 맞닿았으면 빈칸을 가짜 벽으로
    const seen = new Uint8Array(W * H);
    const touchesFake = (i) => { const x = i % W; return (x > 0 && tiles[i - 1] === T.FAKE) || (x < W - 1 && tiles[i + 1] === T.FAKE) || (i >= W && tiles[i - W] === T.FAKE) || (i + W < tiles.length && tiles[i + W] === T.FAKE); };
    for (let i0 = 0; i0 < tiles.length; i0++) {
      if (reached[i0] || seen[i0] || !open(i0)) continue;
      const comp = [];
      seen[i0] = 1; stack.push(i0);
      flood(seen, (j) => open(j) && !reached[j], comp);
      if (!comp.some(touchesFake)) continue;
      for (const i of comp) if (tiles[i] === T.EMPTY && !phase[i]) tiles[i] = T.FAKE;
    }
  }
  get pxW() { return this.w * TILE; }
  get pxH() { return this.h * TILE; }
  idx(tx, ty) { return ty * this.w + tx; }
  typeAt(tx, ty) {
    if (ty < 0) return tx < 0 || tx >= this.w ? (this.openTop ? T.EMPTY : T.SOLID) : T.EMPTY;
    if (ty >= this.h) return T.EMPTY; // 구덩이
    if (tx < 0) return this.openLeft ? T.EMPTY : T.SOLID;
    if (tx >= this.w) return this.openRight ? T.EMPTY : T.SOLID;
    return this.tiles[ty * this.w + tx];
  }
  set(tx, ty, type) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.tiles[ty * this.w + tx] = type;
    this.version++;
  }
  typeAtPx(x, y) { return this.typeAt(Math.floor(x / TILE), Math.floor(y / TILE)); }
  isSolidPx(x, y) { const t = this.typeAtPx(x, y); return t === T.SOLID || t === T.BREAK; }
  markersOf(ch) { return this.markers.filter((m) => m.ch === ch); }
  /** 지면 찾기: (tx) 열에서 ty부터 아래로 처음 서 있을 수 있는 칸의 y(px) */
  groundBelow(tx, ty) {
    for (let y = ty; y < this.h; y++) {
      const t = this.typeAt(tx, y);
      if (t === T.SOLID || t === T.BREAK || t === T.ONEWAY) return y * TILE;
    }
    return null;
  }
}
