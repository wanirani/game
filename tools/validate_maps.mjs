// 맵 검증기: 모든 스테이지/방의 ASCII 맵을 검사한다.
//  - 행 길이/필수 마커(P)/적 숫자 매핑/적·보스 ID 존재/문·출구 대상 방 존재
//  - 도달 가능성(BFS): 기본 캐릭터 능력(점프 ≈2.9칸, 이단점프 합계 ≈5칸, 수평 6칸)으로 P에서 출구/문/보스 트리거까지 갈 수 있는지
//  - 2부 기믹 (world2 §3.7): 기믹 종류·매개변수, 기믹 전용 문자(a b Q z Z u U y) 규칙,
//    BFS 확장 — 거울(위상 A/B 상태 + 스위치 Q 전환), 심장 박동(z/Z 낙관적 합집합), 깊은 물(수영), 상승 기류(U)
//  - 배치 아이템 ID(ITEMS·LORE·DOCS·SUBWEAPONS), 스토리 트리거·인트로·아웃트로 스크립트, 비전서 벽 'H' 수, 별의 조각, 문 표식
// 사용: node tools/validate_maps.mjs [stageId] [--stages 모듈경로]
//   --stages: STAGES 대신 그 모듈이 export 하는 STAGES 를 검사 (작업 중인 맵·시험용 방)
//   --debug s14:r2 : 그 방의 도달 지도(닿은 발 위치 '·')를 출력
//   --tight : 난이도 후보 (요청 #161/#181) — 필수 목표(출구·문·보스 트리거)에 천장 아래 빠듯한 점프로만 닿는 방을 경고로 보여 준다.
//             어림 규칙(물리 재현 아님)이라 확인이 필요한 후보 목록일 뿐이다 → 기본 검사에서는 끔
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STAGES as GAME_STAGES } from '../src/data/stages.js';
import { ENEMIES } from '../src/data/enemies.js';
import { BOSSES } from '../src/data/bosses.js';
import { ITEMS } from '../src/data/items.js';
import { LORE, DOCS } from '../src/data/lore.js';
import { SCRIPTS } from '../src/data/story.js';
import { SUBWEAPONS } from '../src/data/subweapons.js';

// 렌더 키 확인용 (선택): 렌더 모듈을 Node 에서 못 읽으면 이 검사만 건너뛴다
const RENDER = await Promise.all([import('../src/render/background.js'), import('../src/render/tiles.js')])
  .then(([b, t]) => ({ THEMES: b.THEMES, TILE_STYLES: t.TILE_STYLES })).catch(() => null);

const argv = process.argv.slice(2);
const si = argv.indexOf('--stages');
const STAGES = si >= 0 ? (await import(pathToFileURL(resolve(argv[si + 1] ?? '')).href)).STAGES : GAME_STAGES;
if (!STAGES || typeof STAGES !== 'object') { console.log(`--stages ${argv[si + 1] ?? ''}: 모듈이 STAGES 객체를 export 하지 않음`); process.exit(2); }
const di = argv.indexOf('--debug');
const DEBUG_ROOM = di >= 0 ? argv[di + 1] : null;
const TIGHT = argv.includes('--tight');
const only = argv.find((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1) && !(di >= 0 && i === di + 1));
let errors = 0, warns = 0;
const err = (s) => { errors++; console.log('  ✗ ' + s); };
const warn = (s) => { warns++; console.log('  ! ' + s); };

const SOLID = new Set(['#', '%', 'B', 'H', 'K']);
const STAND = new Set(['#', '%', 'B', 'H', 'K', '=', 'M', 'V', 'F']);
const BLOCK_BODY = new Set(['#', '%']); // 부서지는 벽은 공격으로 뚫을 수 있으므로 통과 가능 취급
// ── 2부 기믹 (src/game/gimmicks.js GIMMICK_KINDS 와 같게 유지) ──
const KINDS = ['mirror', 'magma', 'deep', 'wind', 'heartbeat', 'blight', 'voidwall'];
const CH_KIND = { a: 'mirror', b: 'mirror', Q: 'mirror', z: 'heartbeat', Z: 'heartbeat', U: 'wind', y: 'blight' }; // 'u' 는 액체가 'deep' 인 방 전용
const LIQUIDS = ['water', 'lava', 'poison', 'blood', 'deep'];

/** 방에 실제로 적용되는 기믹 목록 (world2 §3.1): room.gimmick 이 undefined 면 스테이지 기본값, null 이면 없음, 객체/배열이면 그것 */
function kinds(stage, room) {
  const g = room.gimmick === undefined ? stage.gimmick : room.gimmick;
  if (!g) return [];
  return (Array.isArray(g) ? g : [g]).filter((o) => o && typeof o === 'object');
}
const roomLiquid = (stage, room) => room.liquid ?? stage.liquid ?? 'water';

/** 배치 아이템 문자열이 가리키는 대상이 있는가 (world.spawnPlaced 와 같은 해석) */
function itemOk(spec) {
  if (typeof spec !== 'string') return false;
  if (spec.startsWith('lore:')) return !!LORE[spec.slice(5)];
  if (spec.startsWith('doc:')) return !!DOCS[spec.slice(4)];
  if (spec.startsWith('sub:')) return !!SUBWEAPONS[spec.slice(4)];
  if (spec === 'oneup') return true;
  return !!ITEMS[spec];
}

/** 기믹 매개변수 검사 (world2 §3.5 기본값 기준) */
function checkGimmicks(roomId, room, list, W, H, liquid, rows) {
  const seen = new Set();
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const num = (o, ...ks) => { for (const k of ks) if (o[k] !== undefined && o[k] !== null && !isNum(o[k])) err(`${roomId}: 기믹 ${o.kind}.${k} 는 숫자여야 함 (${JSON.stringify(o[k])})`); };
  const need = (o, k) => { if (!isNum(o[k])) { err(`${roomId}: 기믹 ${o.kind}(${o.mode}) 에 숫자 ${k} 필요`); return false; } return true; };
  const row = (o, k) => { if (isNum(o[k]) && (o[k] < 0 || o[k] > H + 4)) warn(`${roomId}: 기믹 ${o.kind}.${k} = ${o[k]} 행이 방 높이(${H}) 밖`); };
  for (const o of list) {
    if (!KINDS.includes(o.kind)) { err(`${roomId}: 알 수 없는 기믹 종류 '${o.kind}'`); continue; }
    if (seen.has(o.kind)) warn(`${roomId}: 기믹 '${o.kind}' 가 두 번 들어 있음`);
    seen.add(o.kind);
    switch (o.kind) {
      case 'mirror':
        if (o.start !== undefined && o.start !== 'A' && o.start !== 'B') err(`${roomId}: mirror.start 는 'A' 또는 'B' (${JSON.stringify(o.start)})`);
        num(o, 'cooldown', 'auto');
        break;
      case 'magma': {
        if (!['tide', 'rise', 'manual'].includes(o.mode)) { err(`${roomId}: magma.mode 는 'tide'|'rise'|'manual' 이어야 함 (${JSON.stringify(o.mode)})`); break; }
        num(o, 'low', 'high', 'period', 'hold', 'warn', 'y0', 'y1', 'speed', 'trigger', 'level');
        if (o.mode === 'tide') {
          if (need(o, 'low') & need(o, 'high') && o.high > o.low) err(`${roomId}: magma tide 의 high(${o.high}) 는 low(${o.low}) 보다 위(작은 행)여야 함`);
          const rest = (o.period ?? 9) - (o.warn ?? 1.5) - 1.2 - (o.hold ?? 2.5) - 1.5;
          if (rest < 0.5) warn(`${roomId}: magma tide 쉬는 시간 ${rest.toFixed(2)}초 < 0.5 (period 를 늘릴 것)`);
          // 적은 용암을 무시한다 → 만조 수위 아래에 적을 두지 않는다 (world2 §3.5)
          if (isNum(o.high)) for (let y = o.high; y < H; y++) for (let x = 0; x < W; x++) { const c = rows[y]?.[x]; if (c >= '1' && c <= '9') warn(`${roomId}: 적 '${c}' (${x},${y}) 가 용암 만조 수위(${o.high}행) 아래`); }
          row(o, 'low'); row(o, 'high');
        } else if (o.mode === 'rise') {
          if (need(o, 'y0') & need(o, 'y1') && o.y1 >= o.y0) err(`${roomId}: magma rise 의 y1(${o.y1}) 은 y0(${o.y0}) 보다 위(작은 행)여야 함`);
          row(o, 'y0'); row(o, 'y1'); row(o, 'trigger');
        } else {
          if (o.level === undefined) warn(`${roomId}: magma manual 에 시작 level(행) 없음`);
          row(o, 'level');
        }
        break;
      }
      case 'deep':
        if (liquid !== 'deep') err(`${roomId}: deep 기믹은 액체가 'deep' 인 방에서만 동작 (지금 '${liquid}')`);
        num(o, 'air', 'drain', 'refill', 'bubble', 'choke', 'stroke');
        break;
      case 'wind':
        if (o.dir !== undefined && o.dir !== 1 && o.dir !== -1 && o.dir !== 'alt') err(`${roomId}: wind.dir 는 1, -1, 'alt' 중 하나 (${JSON.stringify(o.dir)})`);
        if (o.auto !== undefined && typeof o.auto !== 'boolean') err(`${roomId}: wind.auto 는 true/false`);
        num(o, 'force', 'on', 'off', 'warn', 'maxPush', 'updraft');
        break;
      case 'heartbeat':
        num(o, 'beat', 'warn', 'light');
        if (isNum(o.beat) && o.beat <= (o.warn ?? 0.8)) err(`${roomId}: heartbeat.beat(${o.beat}) 는 warn(${o.warn ?? 0.8}) 보다 길어야 함`);
        break;
      case 'blight':
        num(o, 'gain', 'decay', 'on', 'off', 'dot', 'podRespawn');
        if (o.spores !== undefined) {
          if (!Array.isArray(o.spores)) err(`${roomId}: blight.spores 는 [[tx,ty,tw,th], …] 배열`);
          else o.spores.forEach((r, i) => {
            if (!Array.isArray(r) || r.length !== 4 || !r.every(isNum)) { err(`${roomId}: blight.spores[${i}] 는 [tx,ty,tw,th] 숫자 4개 (${JSON.stringify(r)})`); return; }
            const [tx, ty, tw, th] = r;
            if (tw <= 0 || th <= 0 || tx < 0 || ty < 0 || tx + tw > W || ty + th > H) err(`${roomId}: blight.spores[${i}] [${r}] 가 맵(${W}×${H}) 밖`);
          });
        }
        break;
      case 'voidwall':
        if (o.mode !== undefined && o.mode !== 'chase' && o.mode !== 'arena') err(`${roomId}: voidwall.mode 는 'chase' 또는 'arena' (${JSON.stringify(o.mode)})`);
        num(o, 'speed', 'delay', 'startTx', 'stopTx', 'dmg');
        if (isNum(o.stopTx) && o.stopTx > W) warn(`${roomId}: voidwall.stopTx(${o.stopTx}) 가 방 너비(${W}) 밖`);
        break;
    }
  }
}

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
  const chCount = {};
  const qs = [];
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
    if (c in CH_KIND || c === 'u') chCount[c] = (chCount[c] ?? 0) + 1;
    if (c === 'Q') qs.push([x, y]);
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
  // null/'' 칸은 "이 '@'·'!' 에는 없음" 자리 채움 (world.loadRoom 이 건너뜀) → 검사하지 않는다
  for (const it of room.items ?? []) if (it && !itemOk(it)) err(`${roomId}: 배치 아이템 '${typeof it === 'string' ? it : JSON.stringify(it)}' 가 ITEMS/LORE/DOCS/SUBWEAPONS 에 없음`);
  for (const id of room.triggers ?? []) if (id && !SCRIPTS[id]) err(`${roomId}: 트리거 스크립트 '${id}' 가 SCRIPTS 에 없음`);
  if (room.doorMarks !== undefined) {
    if (!Array.isArray(room.doorMarks)) err(`${roomId}: doorMarks 는 배열이어야 함`);
    else {
      if (room.doorMarks.length !== doors) err(`${roomId}: doorMarks ${room.doorMarks.length}개인데 문 'D' ${doors}개`);
      room.doorMarks.forEach((mk, i) => { if (mk !== null && mk !== 'blood') err(`${roomId}: doorMarks[${i}] 는 'blood' 또는 null (${JSON.stringify(mk)})`); });
    }
  }
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

  // ── 2부 기믹: 종류·매개변수·전용 문자 ──
  const liquid = roomLiquid(stage, room);
  if (room.liquid !== undefined && !LIQUIDS.includes(room.liquid)) err(`${roomId}: room.liquid '${room.liquid}' 는 ${LIQUIDS.join('/')} 중 하나`);
  const list = kinds(stage, room);
  {
    // 게임(gimmicks.js resolveGimmickConfig)은 객체가 아닌 항목을 조용히 버린다 → gimmick: 'mirror' 같은 오타는 기믹 없는 방이 됨
    const raw = room.gimmick === undefined ? stage.gimmick : room.gimmick;
    for (const o of raw ? (Array.isArray(raw) ? raw : [raw]) : []) if (!o || typeof o !== 'object') err(`${roomId}: 기믹 설정 ${JSON.stringify(o)} 는 { kind, …매개변수 } 객체여야 함 (무시됨)`);
  }
  checkGimmicks(roomId, room, list, W, H, liquid, rows);
  const has = (k) => list.some((o) => o.kind === k);
  const mirror = list.find((o) => o.kind === 'mirror') ?? null;
  const heartbeat = has('heartbeat'), wind = has('wind'), deep = liquid === 'deep';
  for (const [c, n] of Object.entries(chCount)) {
    if (c === 'u') { if (!deep) err(`${roomId}: 기포 기둥 'u' ${n}개 — 액체가 'deep' 인 방에서만 (지금 '${liquid}')`); }
    else if (!has(CH_KIND[c])) err(`${roomId}: '${c}' ${n}개 — ${CH_KIND[c]} 기믹 방에서만 쓸 수 있음`);
  }
  if (mirror) {
    if (!qs.length && !((mirror.auto ?? 0) > 0)) err(`${roomId}: 거울 기믹 방에 스위치 'Q' 가 없음 (auto > 0 이 아니면 1개 이상 필요)`);
    if (!chCount.a && !chCount.b) warn(`${roomId}: 거울 기믹 방인데 위상 타일 'a'/'b' 가 없음`);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (c === 'u' && deep && at(x, y - 1) !== '~' && at(x, y - 1) !== 'u') warn(`${roomId}: 기포 기둥 'u' (${x},${y}) 위가 물('~')이 아님`);
    if (c === 'Q' && mirror && !STAND.has(at(x, y + 1)) && at(x, y + 1) !== 'a' && at(x, y + 1) !== 'b') warn(`${roomId}: 거울 스위치 'Q' (${x},${y}) 아래에 받침이 없음 (스위치 아랫면 = 마커 칸 아랫면)`);
    if (c === 'Q' && mirror && BLOCK_BODY.has(at(x, y - 1))) warn(`${roomId}: 거울 스위치 'Q' (${x},${y}) 는 2칸 높이인데 위 칸이 벽`);
    if (c === 'y' && has('blight') && !SOLID.has(at(x, y - 1)) && !STAND.has(at(x, y + 1))) warn(`${roomId}: 포자 주머니 'y' (${x},${y}) 가 천장에 매달리지도 바닥에 놓이지도 않음`);
    if (heartbeat && (c === 'P' || c === 'S' || c === 'D' || c === 'X')) {
      const hb = (ch) => ch === 'z' || ch === 'Z';
      if (hb(at(x, y + 1)) || hb(at(x, y - 1))) warn(`${roomId}: '${c}' (${x},${y}) 가 심장 박동 타일(z/Z) 위나 안에 있음`);
    }
  }
  if (!ps.length) return;

  // ── 도달 가능성 (위상 ph: 거울 방이면 'A'/'B', 아니면 '-') ──
  const xyKey = (x, y) => (y + 10) * 10000 + (x + 10);
  const phaseSolid = (c, ph) => (ph === 'A' && c === 'a') || (ph === 'B' && c === 'b');
  const free = (x, y, ph) => { const c = at(x, y); return !BLOCK_BODY.has(c) && !phaseSolid(c, ph); };
  const standOn = (c, ph) => STAND.has(c) || phaseSolid(c, ph) || (heartbeat && (c === 'z' || c === 'Z'));
  // 이동 발판 (props.js MovingPlatform: 2칸 폭, 'M' 은 오른쪽으로·'V' 는 아래로 platRange 칸 왕복):
  // 지나가는 모든 위치에 설 수 있고, 한 발판의 설 자리끼리는 타고 이동할 수 있다
  const platAt = new Map(); // 발 칸 key → 발판 번호
  const platCells = [];     // 발판 번호 → [[x, y], …]
  {
    const range = room.platRange ?? 4;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = at(x, y);
      if (c !== 'M' && c !== 'V') continue;
      const cells = [];
      for (let k = 0; k <= range; k++) for (let w = 0; w < 2; w++) {
        const px = c === 'M' ? x + k + w : x + w, py = (c === 'V' ? y + k : y) - 1;
        if (px < 0 || px >= W || py < -1 || py >= H) continue;
        cells.push([px, py]);
        platAt.set(xyKey(px, py), platCells.length);
      }
      platCells.push(cells);
    }
  }
  const standable = (x, y, ph) => free(x, y, ph) && free(x, y - 1, ph) && (standOn(at(x, y + 1), ph) || platAt.has(xyKey(x, y))) && !(at(x, y) === '^');
  const water = (c) => c === '~' || c === 'u';
  // 깊은 물: 물 칸, 또는 물 바로 위의 빈칸(수면에 떠 있음)에서는 헤엄쳐 사방으로 움직일 수 있다
  const swim = (x, y, ph) => deep && free(x, y, ph) && (water(at(x, y)) || water(at(x, y + 1)));
  // 상승 기류: 몸(발 칸 또는 머리 칸)이 'U' 칸에 겹치면 떠오른다
  const updraft = (x, y) => wind && (at(x, y) === 'U' || at(x, y - 1) === 'U');
  const node = (x, y, ph) => standable(x, y, ph) || swim(x, y, ph) || updraft(x, y);
  const PH = { '-': 0, A: 1, B: 2 };
  const key = (x, y, ph) => PH[ph] * 1e8 + xyKey(x, y);
  const phases = mirror ? ['A', 'B'] : ['-'];
  const start = mirror ? (mirror.start === 'B' ? 'B' : 'A') : '-'; // 잘못된 start 는 위에서 오류로 보고, BFS 는 기본값 A
  if (mirror) {
    // 시작·세이브 위치는 시작 위상에서 설 수 있어야 한다 (재시작 때 위상이 start 로 돌아감)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = at(x, y);
      if ((c === 'P' || c === 'S') && !standable(x, y, start)) err(`${roomId}: '${c}' (${x},${y}) 가 시작 위상 ${start} 에서 설 수 없는 곳`);
    }
  }
  // 시작: P 아래로 낙하
  let [sx, sy] = ps[0];
  while (sy < H && !node(sx, sy, start)) sy++;
  if (sy >= H) { err(`${roomId}: P 아래에 바닥이 없음`); return; }
  // explore(strict): 도달 BFS. strict = 천장 아래 빠듯한 점프를 뺀 탐색 (요청 #161/#181 — 오류가 아니라 난이도 신호(경고)용).
  // 빠듯한 점프 = 땅에서 3~4칸 올라 4칸 이상 옆으로 가는데 꼭짓점 쪽 머리 위가 막힌 경우: 실제 포물선(점프 760–800,
  // 중력 2200, 공중 점프 1회)은 천장에 부딪혀, 공중 점프를 좁은 프레임 창에 눌러야만 되는 곳이 많다 (예: 고치기 전 s19/r4 가지 연결).
  // tight = 전체 탐색에서 새 칸을 처음 연 빠듯한 점프들 (경고 문구의 예시)
  const explore = (strict) => {
  const seen = new Set([key(sx, sy, start)]);
  const seenXY = new Set([xyKey(sx, sy)]);
  const tight = [];
  const q = [[sx, sy, start, false]];
  // 낙하: 설 수 있는 곳/물/상승 기류에서 멈춤
  const fall = (x, y, ph) => {
    while (y < H + 1 && !standable(x, y, ph)) {
      if (!free(x, y, ph)) return null;
      if (swim(x, y, ph) || updraft(x, y)) return [x, y];
      y++;
    }
    return y < H ? [x, y] : null;
  };
  const clearCol = (x, y0, y1, ph) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) if (!free(x, y, ph) || !free(x, y - 1, ph)) return false; return true; };
  const clearRow = (x0, x1, y, ph) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (!free(x, y, ph) || !free(x, y - 1, ph)) return false; return true; };
  const MAXUP = 5, MAXDX = 6;
  while (q.length) {
    const [x, y, ph, air] = q.shift();
    // air = 상승 기류 꼭대기에서 튀어나온 공중 상태 (남은 공중 점프만 가능)
    const push = (nx, ny, nph = ph, nair = false) => {
      if (nx < -1 || nx > W) return; /* 방 밖(천장 위 보이지 않는 벽) 무한 탐색 방지 */
      const k = key(nx, ny, nph);
      if (!seen.has(k)) { seen.add(k); seenXY.add(xyKey(nx, ny)); q.push([nx, ny, nph, nair]); return true; }
      return false;
    };
    const land = (nx, ny, nph = ph) => { if (node(nx, ny, nph)) push(nx, ny, nph); else { const f = fall(nx, ny, nph); if (f) push(f[0], f[1], nph); } };
    for (const dx of [-1, 1]) {
      const nx = x + dx;
      if (!free(nx, y, ph) || !free(nx, y - 1, ph)) continue;
      land(nx, y);
    }
    // 점프: 위로 올라간 뒤 수평 이동 후 착지 (기류 속·기류 꼭대기에서는 같은 높이 활공 + 공중 점프 2칸만)
    const grounded = !air && (standable(x, y, ph) || swim(x, y, ph));
    const maxUp = grounded ? MAXUP : 2;
    for (let up = grounded ? 1 : 0; up <= maxUp; up++) {
      const ay = y - up;
      if (!clearCol(x, y, ay, ph)) break;
      const reach = up >= 4 ? 4 : grounded ? MAXDX : 4;
      for (const dir of [-1, 1]) {
        for (let d = 1; d <= reach; d++) {
          const nx = x + dir * d;
          if (!clearRow(x, nx, ay, ph)) break;
          // 머리 위 여유: 3~4칸 오르는 점프는 공중 점프를 써서 꼭짓점이 착지 높이보다 ≈ (5.5 − up)칸 위로 올라간다
          // (점프 760–800 → 한 번 ≈ 2.7–3칸, 두 번 ≈ 5.5칸). 그 높이(머리 칸 ay-1 위로 up 3 → 2칸, up 4 → 1칸)가 막혀 있으면 빠듯하다.
          // 꼭짓점은 착지 쪽에 있으므로 이동의 뒤쪽 절반(착지 열 포함)만 본다 — 도움닫기 쪽 천장은 비스듬히 빠져나가면 된다
          // (예: s15/r2 는 ###### 천장 끝에서 뛰면 여유 있음; 고치기 전 s19/r4 의 행 10 → 행 7 가지 연결은 머리 위 2칸째가 윗길 바닥)
          let tj = false;
          if (grounded && d >= 4 && (up === 3 || up === 4)) {   // 옆 3칸 이하는 올라가며 건너면 된다 (넓힌 뒤 s19/r4 의 옆 3칸 연결은 넉넉함 — #181 재현)
            const need = up === 3 ? 2 : 1;
            for (let k = Math.ceil(d / 2); k <= d && !tj; k++) for (let r = 1; r <= need && !tj; r++) tj = !free(x + dir * k, ay - 1 - r, ph);
          }
          if (tj && strict) continue;
          const to = tj ? (tx, ty) => { if (push(tx, ty)) tight.push({ x, y, tx, ty, up, d }); } : push;
          // 해당 열에서 아래로 착지
          const f = fall(nx, ay, ph);
          if (f && f[1] <= y + 8) to(f[0], f[1]);
          if (standable(nx, ay, ph)) to(nx, ay);
          if (updraft(nx, ay) || swim(nx, ay, ph)) to(nx, ay); // 옆에서 기류·물로 뛰어듦
        }
      }
    }
    // 이동 발판 타기: 같은 발판의 다른 설 자리로
    const pl = platAt.get(xyKey(x, y));
    if (pl !== undefined) for (const [px, py] of platCells[pl]) if (standable(px, py, ph)) push(px, py);
    // 수영: 물속에서는 비어 있는 상하좌우 어디로든
    if (swim(x, y, ph)) {
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (!free(nx, ny, ph) || !free(nx, ny - 1, ph)) continue;
        land(nx, ny);
      }
    }
    // 상승 기류: 바로 위 칸으로 떠오름. 기류를 벗어난 꼭대기는 공중 상태(남은 공중 점프·좌우 이동)
    if (updraft(x, y) && free(x, y - 1, ph) && free(x, y - 2, ph)) push(x, y - 1, ph, !node(x, y - 1, ph));
    // 거울 스위치: 가까이(|dx| ≤ 2, −3 ≤ dy ≤ 1)에서 치면 위상 전환 — 다른 위상에서 몸이 들어갈 자리가 있어야 함
    if (mirror) {
      const other = ph === 'A' ? 'B' : 'A';
      for (const [qx, qy] of qs) {
        if (Math.abs(x - qx) > 2 || y - qy < -3 || y - qy > 1) continue;
        if (!free(x, y, other) || !free(x, y - 1, other)) continue;
        land(x, y, other);
        break;
      }
    }
  }
  return { seenXY, tight };
  };
  const { seenXY, tight } = explore(false);
  const reached = (x, y) => { for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (seenXY.has(xyKey(xx, yy))) return true; return false; };
  const anyInCol = (x) => { for (let y = 0; y < H; y++) if (seenXY.has(xyKey(x, y))) return true; return false; };
  // 출구: 가장자리 열의 열린 칸(몸 2칸이 빈 곳)에 닿았거나, 그 바로 안쪽 칸에서 열린 칸으로 걸어 나갈 수 있어야 한다
  // (예전에는 안쪽 열의 아무 행에나 닿으면 통과 → 위쪽 벽에 난 출구를 바닥에서 '도달'한 것으로 봄)
  const exitOk = (col, inner) => {
    for (let y = 0; y < H; y++) {
      if (seenXY.has(xyKey(col, y))) return true;
      if (seenXY.has(xyKey(inner, y)) && !BLOCK_BODY.has(at(col, y)) && !BLOCK_BODY.has(at(col, y - 1))) return true;
    }
    return false;
  };
  if (DEBUG_ROOM && DEBUG_ROOM === `${stage.id}:${roomId}`) {
    // 도달 지도: 닿은 발 위치를 '·'(위상 무관)로 표시
    console.log(rows.map((r, y) => String(y).padStart(3) + ' ' + [...r.padEnd(W, ' ')].map((c, x) => (seenXY.has(xyKey(x, y)) && (c === ' ' || c === '.') ? '·' : c)).join('')).join('\n'));
  }
  if (room.exitRight && !exitOk(W - 1, W - 2)) err(`${roomId}: 오른쪽 출구에 도달 불가`);
  if (room.exitLeft && !exitOk(0, 1)) err(`${roomId}: 왼쪽 출구에 도달 불가`);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (c === 'D' && !reached(x, y)) err(`${roomId}: 문 (${x},${y}) 도달 불가`);
    if (c === 'X' && !anyInCol(x) && !anyInCol(x + 1)) err(`${roomId}: 보스 트리거 X 열(${x}) 도달 불가`);
    if (c === 'S' && !reached(x, y)) warn(`${roomId}: 세이브 (${x},${y}) 도달 불가`);
    if (c === 'Q' && !reached(x, y) && !reached(x - 1, y) && !reached(x + 1, y)) warn(`${roomId}: 거울 스위치 Q (${x},${y}) 도달 불가`);
    if ((c === 'H' || c === '$' || c === '@') && !reached(x, y) && !reached(x - 1, y) && !reached(x + 1, y) && !reached(x, y + 1)) warn(`${roomId}: 비밀/보물 '${c}' (${x},${y}) 근처 도달 불가(부수기 필요 여부 확인)`);
  }
  // 난이도 신호 (#161/#181, --tight): 필수 목표(출구·문·보스 트리거)에 빠듯한 점프 없이는 닿지 못하면 경고 (오류 아님 — 실제 궤적으로 확인할 것)
  if (TIGHT && tight.length) {
    const S = explore(true).seenXY;
    const has2 = (x, y) => { for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (S.has(xyKey(xx, yy))) return true; return false; };
    const col2 = (x) => { for (let y = 0; y < H; y++) if (S.has(xyKey(x, y))) return true; return false; };
    const exit2 = (col, inner) => { for (let y = 0; y < H; y++) { if (S.has(xyKey(col, y))) return true; if (S.has(xyKey(inner, y)) && !BLOCK_BODY.has(at(col, y)) && !BLOCK_BODY.has(at(col, y - 1))) return true; } return false; };
    const lost = [];
    if (room.exitRight && exitOk(W - 1, W - 2) && !exit2(W - 1, W - 2)) lost.push('오른쪽 출구');
    if (room.exitLeft && exitOk(0, 1) && !exit2(0, 1)) lost.push('왼쪽 출구');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = at(x, y);
      if (c === 'D' && reached(x, y) && !has2(x, y)) lost.push(`문 (${x},${y})`);
      if (c === 'X' && (anyInCol(x) || anyInCol(x + 1)) && !col2(x) && !col2(x + 1)) lost.push(`보스 트리거 X 열(${x})`);
    }
    if (lost.length) {
      const t = tight.find((e) => !S.has(xyKey(e.tx, e.ty))) ?? tight[0];
      warn(`${roomId}: [빠듯한 점프 후보] ${lost.join(', ')} — 천장 아래 빠듯한 점프로만 닿음 (예: (${t.x},${t.y})→(${t.tx},${t.ty}) 위 ${t.up}칸·옆 ${t.d}칸, 꼭짓점 쪽 머리 위 막힘). 공중 점프 타이밍이 좁을 수 있으니 실제 궤적으로 확인`);
    }
  }
}

/** 스테이지 단위 검사: 스크립트·비전서 수·별의 조각·렌더 키 */
function checkStage(sid, stage) {
  const rooms = Object.values(stage.rooms);
  let hWalls = 0;
  const stars = [];
  for (const r of rooms) {
    for (const row of r.map ?? []) for (const c of row) if (c === 'H') hWalls++;
    for (const it of r.items ?? []) if (typeof it === 'string' && it.startsWith('k_star_')) stars.push(it);
  }
  for (const d of stage.docs ?? []) if (!DOCS[d]) err(`비전서 '${d}' 가 DOCS 에 없음`);
  if (hWalls < (stage.docs?.length ?? 0)) err(`비전서 벽 'H' ${hWalls}개 < docs ${stage.docs.length}개`);
  if (stage.chapter > 0) for (const k of ['intro', 'outro']) if (stage[k] && !SCRIPTS[stage[k]]) err(`${k} 스크립트 '${stage[k]}' 가 SCRIPTS 에 없음`);
  if (stage.shard) {
    if (!ITEMS[stage.shard]) err(`별의 조각 '${stage.shard}' 가 ITEMS 에 없음`);
    if (stars.length !== 1 || stars[0] !== stage.shard) err(`별의 조각: '@' 배치 ${stars.length ? stars.join(', ') : '없음'} — 정확히 '${stage.shard}' 1개여야 함`);
  } else if (stars.length) err(`별의 조각이 없는 스테이지인데 '@' 에 ${stars.join(', ')}`);
  if (stage.heart && !ITEMS[stage.heart]) err(`세계의 심장 '${stage.heart}' 가 ITEMS 에 없음`);
  if (stage.liquid !== undefined && !LIQUIDS.includes(stage.liquid)) err(`stage.liquid '${stage.liquid}' 는 ${LIQUIDS.join('/')} 중 하나`);
  if (RENDER) {
    const themes = new Set([stage.theme, ...rooms.map((r) => r.theme)].filter(Boolean));
    for (const th of themes) if (!RENDER.THEMES[th]) warn(`배경 테마 '${th}' 가 THEMES 에 없음 (hall 로 대체됨)`);
    if (stage.tileStyle && !RENDER.TILE_STYLES[stage.tileStyle]) warn(`타일 스타일 '${stage.tileStyle}' 가 TILE_STYLES 에 없음 (stone 으로 대체됨)`);
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
  checkStage(sid, stage);
}
if (only && !STAGES[only]) err(`스테이지 '${only}' 가 STAGES 에 없음`);
console.log(`\n오류 ${errors}개, 경고 ${warns}개`);
process.exit(errors ? 1 : 0);
