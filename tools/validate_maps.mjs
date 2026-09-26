// 맵 검증기: 모든 스테이지/방의 ASCII 맵을 검사한다.
//  - 행 길이/필수 마커(P)/적 숫자 매핑/적·보스 ID 존재/문·출구 대상 방 존재
//  - 도달 가능성(BFS): 기본 캐릭터 능력(점프 ≈2.9칸, 이단점프 합계 ≈5칸, 수평 6칸)으로 P에서 출구/문/보스 트리거까지 갈 수 있는지
// 사용: node tools/validate_maps.mjs [stageId]
import { STAGES } from '../src/data/stages.js';
import { ENEMIES } from '../src/data/enemies.js';
import { BOSSES } from '../src/data/bosses.js';

const only = process.argv[2];
let errors = 0, warns = 0;
const err = (s) => { errors++; console.log('  ✗ ' + s); };
const warn = (s) => { warns++; console.log('  ! ' + s); };

const SOLID = new Set(['#', '%', 'B', 'H', 'K']);
const STAND = new Set(['#', '%', 'B', 'H', 'K', '=', 'M', 'V', 'F']);
const BLOCK_BODY = new Set(['#', '%']); // 부서지는 벽은 공격으로 뚫을 수 있으므로 통과 가능 취급

function check(stage, roomId, room) {
  const rows = room.map;
  if (!Array.isArray(rows) || !rows.length) { err(`${roomId}: map 없음`); return; }
  const W = Math.max(...rows.map((r) => r.length));
  const H = rows.length;
  rows.forEach((r, i) => { if (r.length !== W) warn(`${roomId}: ${i}행 길이 ${r.length} ≠ ${W} (공백으로 채워짐)`); });
  if (H < 11) warn(`${roomId}: 높이 ${H} < 11 (화면보다 낮음)`);
  if (W < 20) warn(`${roomId}: 너비 ${W} < 20`);
  const at = (x, y) => (y < 0 || y >= H ? ' ' : x < 0 || x >= W ? (x < 0 ? (room.exitLeft ? ' ' : '#') : (room.exitRight ? ' ' : '#')) : rows[y][x] ?? ' ');
  const ps = [];
  const digits = new Set();
  let doors = 0, hasX = false, npcs = 0, trig = 0, items = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (c === 'P') ps.push([x, y]);
    if (c >= '1' && c <= '9') digits.add(c);
    if (c === 'D') doors++;
    if (c === 'X') hasX = true;
    if (c === 'N') npcs++;
    if (c === '!') trig++;
    if (c === '@') items++;
  }
  if (ps.length !== 1) err(`${roomId}: 'P' 개수 ${ps.length} (정확히 1개 필요)`);
  for (const d of digits) {
    const spec = room.enemies?.[d];
    if (!spec) { err(`${roomId}: 적 숫자 '${d}' 매핑 없음`); continue; }
    const id = typeof spec === 'string' ? spec : spec.id;
    if (!ENEMIES[id]) err(`${roomId}: 적 ID '${id}' 가 ENEMIES 에 없음`);
  }
  if (npcs > (room.npcs?.length ?? 0)) err(`${roomId}: 'N' ${npcs}개인데 npcs 배열 ${room.npcs?.length ?? 0}개`);
  if (trig > (room.triggers?.length ?? 0)) warn(`${roomId}: '!' ${trig}개인데 triggers ${room.triggers?.length ?? 0}개`);
  if (items > (room.items?.length ?? 0)) err(`${roomId}: '@' ${items}개인데 items ${room.items?.length ?? 0}개`);
  const targets = [];
  for (const k of ['exitRight', 'exitLeft', 'exitUp', 'exitDown', 'next']) if (room[k]) targets.push(room[k]);
  for (const d of room.doors || []) targets.push(d);
  for (const t of targets) if (!stage.rooms[t]) err(`${roomId}: 대상 방 '${t}' 없음`);
  if (doors && !room.next && !(room.doors?.length)) err(`${roomId}: 문 'D' 가 있는데 next/doors 없음`);
  if (room.boss) {
    if (!hasX) err(`${roomId}: 보스방인데 'X' 트리거 없음`);
    const bid = room.bossId ?? stage.boss;
    if (!BOSSES[bid]) err(`${roomId}: 보스 ID '${bid}' 가 BOSSES 에 없음`);
  }
  if (!ps.length) return;

  // ── 도달 가능성 ──
  const free = (x, y) => !BLOCK_BODY.has(at(x, y));
  const standable = (x, y) => free(x, y) && free(x, y - 1) && STAND.has(at(x, y + 1)) && !(at(x, y) === '^');
  const key = (x, y) => y * 10000 + x;
  // 시작: P 아래로 낙하
  let [sx, sy] = ps[0];
  while (sy < H && !standable(sx, sy)) sy++;
  if (sy >= H) { err(`${roomId}: P 아래에 바닥이 없음`); return; }
  const seen = new Set([key(sx, sy)]);
  const q = [[sx, sy]];
  const fall = (x, y) => { while (y < H + 1 && !standable(x, y)) { if (!free(x, y)) return null; y++; } return y < H ? [x, y] : null; };
  const clearCol = (x, y0, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) if (!free(x, y) || !free(x, y - 1)) return false; return true; };
  const clearRow = (x0, x1, y) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (!free(x, y) || !free(x, y - 1)) return false; return true; };
  const MAXUP = 5, MAXDX = 6;
  while (q.length) {
    const [x, y] = q.shift();
    const push = (nx, ny) => { if (nx < -1 || nx > W) return; /* 방 밖(천장 위 보이지 않는 벽) 무한 탐색 방지 */ const k = key(nx, ny); if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); } };
    for (const dx of [-1, 1]) {
      const nx = x + dx;
      if (!free(nx, y) || !free(nx, y - 1)) continue;
      if (standable(nx, y)) push(nx, y);
      else { const f = fall(nx, y); if (f) push(...f); }
    }
    // 점프: 위로 올라간 뒤 수평 이동 후 착지
    for (let up = 1; up <= MAXUP; up++) {
      const ay = y - up;
      if (!clearCol(x, y, ay)) break;
      const reach = up >= 4 ? 4 : MAXDX;
      for (const dir of [-1, 1]) {
        for (let d = 1; d <= reach; d++) {
          const nx = x + dir * d;
          if (!clearRow(x, nx, ay)) break;
          // 해당 열에서 아래로 착지
          const f = fall(nx, ay);
          if (f && f[1] <= y + 8) push(...f);
          if (standable(nx, ay)) push(nx, ay);
        }
      }
    }
  }
  const reached = (x, y) => { for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (seen.has(key(xx, yy))) return true; return false; };
  const anyInCol = (x) => { for (let y = 0; y < H; y++) if (seen.has(key(x, y))) return true; return false; };
  if (room.exitRight && !anyInCol(W - 1) && !anyInCol(W - 2)) err(`${roomId}: 오른쪽 출구에 도달 불가`);
  if (room.exitLeft && !anyInCol(0) && !anyInCol(1)) err(`${roomId}: 왼쪽 출구에 도달 불가`);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (c === 'D' && !reached(x, y)) err(`${roomId}: 문 (${x},${y}) 도달 불가`);
    if (c === 'X' && !anyInCol(x) && !anyInCol(x + 1)) err(`${roomId}: 보스 트리거 X 열(${x}) 도달 불가`);
    if (c === 'S' && !reached(x, y)) warn(`${roomId}: 세이브 (${x},${y}) 도달 불가`);
    if ((c === 'H' || c === '$' || c === '@') && !reached(x, y) && !reached(x - 1, y) && !reached(x + 1, y) && !reached(x, y + 1)) warn(`${roomId}: 비밀/보물 '${c}' (${x},${y}) 근처 도달 불가(부수기 필요 여부 확인)`);
  }
}

for (const [sid, stage] of Object.entries(STAGES)) {
  if (only && sid !== only) continue;
  console.log(`■ ${sid} ${stage.name}`);
  if (!stage.rooms || !Object.keys(stage.rooms).length) { err('rooms 없음'); continue; }
  if (!stage.rooms[stage.start]) err(`start 방 '${stage.start}' 없음`);
  for (const [rid, room] of Object.entries(stage.rooms)) check(stage, rid, room);
  // 보스방 존재
  if (stage.boss && !Object.values(stage.rooms).some((r) => r.boss)) err('보스방(boss:true) 없음');
}
console.log(`\n오류 ${errors}개, 경고 ${warns}개`);
process.exit(errors ? 1 : 0);
