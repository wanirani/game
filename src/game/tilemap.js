// 타일맵: ASCII 방 데이터를 타일 배열 + 마커 목록으로 변환
// ── 범례 (docs/ARCHITECTURE.md 와 동일) ──
//  ' ' '.' 빈칸          '#' 벽(주 텍스처)      '%' 벽(보조 텍스처)     '=' 단방향 발판
//  'B' 부서지는 벽(음식/골드)  'H' 부서지는 벽(비전서)  'K' 부서지는 벽(보물상자)
//  '^' 가시   '~' 액체(stage.liquid)   'h' 가짜 벽(비밀통로, 통과 가능)
//  'C' 촛불  'T' 촛대/횃불(큰 드롭)  'P' 시작 위치  'S' 세이브(관)  'G' 여신상(회복)  '$' 보물상자
//  'D' 문(room.next 로 이동, 문 아래칸)  'X' 보스 트리거 열   'M' 좌우 이동 발판  'V' 상하 이동 발판  'F' 붕괴 발판
//  'N' NPC(room.npcs 순서)  '!' 스토리 트리거(room.triggers 순서)  '@' 배치 아이템(room.items 순서)
//  '1'~'9' 적(room.enemies[숫자])  'p' 파워업 구슬  'm' 고기  'L' 장식 램프(광원)  'W' 장식 창문  '|' 장식 기둥
import { TILE } from '../core/game.js';
import { T } from '../core/physics.js';

const TILE_CHARS = {
  '#': T.SOLID, '%': T.SOLID, '=': T.ONEWAY, B: T.BREAK, H: T.BREAK, K: T.BREAK,
  '^': T.SPIKE, '~': T.LIQUID, h: T.FAKE,
};
const DECOR_CHARS = new Set(['L', 'W', '|']);

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
    const counters = {};
    for (let ty = 0; ty < this.h; ty++) {
      const row = rows[ty];
      for (let tx = 0; tx < this.w; tx++) {
        const ch = row[tx] ?? ' ';
        const idx = ty * this.w + tx;
        if (ch in TILE_CHARS) {
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
        }
      }
    }
    // 가짜 벽(h)으로 둘러싸인 표식 칸도 가짜 벽으로 메운다 — 비밀 방 안의 아이템·적이 밖에서 구멍처럼 보이지 않게
    const W = this.w, H = this.h;
    const closed = (x, y) => { const t = x < 0 || y < 0 || x >= W || y >= H ? T.SOLID : this.tiles[y * W + x]; return t === T.SOLID || t === T.BREAK || t === T.FAKE; };
    for (const mk of this.markers) {
      const i = mk.ty * W + mk.tx;
      if (mk.breakable || this.tiles[i] !== T.EMPTY) continue;
      const nb = [[mk.tx - 1, mk.ty], [mk.tx + 1, mk.ty], [mk.tx, mk.ty - 1], [mk.tx, mk.ty + 1]];
      if (nb.every(([x, y]) => closed(x, y)) && nb.some(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && this.tiles[y * W + x] === T.FAKE)) this.tiles[i] = T.FAKE;
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
