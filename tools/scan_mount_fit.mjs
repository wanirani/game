#!/usr/bin/env node
// 탈것 몸 크기 · 방 지형 스캔 (CMP-QA; companions §3.2 · §3.3 · §14 C10 9번, §15 "Mounted body width"; MASTER_PLAN §1.2)
//
//   node tools/scan_mount_fit.mjs                 s01–s20 모든 방 + 마을 (탈것은 마을에서도 탄다)
//   node tools/scan_mount_fit.mjs s05 s14         고른 스테이지만
//   --verbose   방마다 한 줄씩 전부 (기본은 문제가 있거나 좁은 곳이 많은 방만)
//   --json <파일>   방별 결과를 JSON 으로 저장   --no-town   마을 제외   --no-traverse   탈것 이동 모형 생략
//
// mount.js 의 fits() · findMountSpot() 을 그대로 쓴다 (Node 에서 import 가능한 모듈). 판정은 방을 불러온 직후의 지형
// (거울 기믹 start:'B' 면 B상, 심장 박동은 짝수 박동) 기준이며, 위상 벽이 있는 방은 반대 위상에서도 시작 지점을 따로 본다.
//
// 합격 기준 (하나라도 어기면 종료 코드 1):
//   G1  시작 지점(P)에서 가장 넓은 탈것(녹티스 70×84)이 ±32px 밀기 안에서 자리를 찾는다 — 0 개 방 실패 (명세 C10 9번)
//   G2  시작 지점(P)에서 아홉 탈것 모두 자리를 찾는다 (방에 들어설 때 자동으로 돌려보내지는 일이 없다)
//   G3  탈것이 설 수 있는 모든 발 위치에서, 그 자리에 가장 큰 기수(브란 36×88)가 내려도 벽에 박히지 않는다 (하차 소프트락 없음)
//   G4  시작 지점에 기수 자신이 박히지 않는다 (지도 자체의 결함 검출)
// 참고 수치 (정보): 두 칸 높이 통로 수 · 탈것이 지나갈 수 없는 발 위치(1칸 폭 수직 통로 등) · 탈것이 못 서는 단방향 발판 ·
//   탈것에 탄 채 닿을 수 없는 문/세이브/여신상/보스 경계/NPC · 탈것 몸보다 좁은 위/아래 출구 · 깊은 물 속 시작 지점 ·
//   탈것 이동 모형(아래): 시작 지점에서 내리지 않고 출구·문·보스 경계·세이브까지 가는지 탈것마다 (내려서 가는 방 목록).
import fs from 'node:fs';
import { STAGES } from '../src/data/stages.js';
import { TOWN_STAGE } from '../src/data/town.js';
import { MOUNTS, MOUNT_IDS } from '../src/data/companions.js';
import { CHARACTERS } from '../src/data/characters.js';
import { TileMap } from '../src/game/tilemap.js';
import { T, isSolidType } from '../src/core/physics.js';
import { fits, findMountSpot } from '../src/game/mount.js';

const TILE = 48;
const argv = process.argv.slice(2);
const flag = (k) => argv.includes('--' + k);
const optVal = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] ?? null : null; };
const VERBOSE = flag('verbose');
const JSON_OUT = optVal('json');
const ONLY = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--json');
const WITH_TOWN = !flag('no-town') && (!ONLY.length || ONLY.includes('town'));
const NO_TRAVERSE = flag('no-traverse');

// ── 몸 크기 ──
const BODIES = MOUNT_IDS.map((id) => ({ id, name: MOUNTS[id].name, w: MOUNTS[id].body.w, h: MOUNTS[id].body.h }));
const WIDEST = [...BODIES].sort((a, b) => b.w - a.w || b.h - a.h)[0];
const TALLEST = [...BODIES].sort((a, b) => b.h - a.h || b.w - a.w)[0];
const RIDER = Object.values(CHARACTERS).reduce((m, c) => ({ w: Math.max(m.w, c.size?.w ?? 0), h: Math.max(m.h, c.size?.h ?? 0) }), { w: 0, h: 0 });

// ── 지도 도우미 ──
/** 방에 적용되는 기믹 목록 (validate_maps 와 같은 해석: undefined = 스테이지 기본, null = 없음) */
function kindsOf(stage, room) {
  const g = room.gimmick === undefined ? stage.gimmick : room.gimmick;
  if (!g) return [];
  return (Array.isArray(g) ? g : [g]).filter((o) => o && typeof o === 'object');
}
/** 위상 타일을 한 위상으로 맞춘다 (A/B: 거울, even/odd: 심장 박동) */
function applyPhase(map, mirror, beat) {
  for (const pt of map.phaseTiles) {
    const solid = pt.key === 'A' || pt.key === 'B' ? pt.key === mirror : pt.key === beat;
    map.tiles[pt.idx] = solid ? T.SOLID : T.EMPTY;
  }
}
const standOn = (t) => t === T.SOLID || t === T.BREAK || t === T.ONEWAY;
const openCell = (t) => !isSolidType(t);
const riderFitsAt = (map, cx, bottom) => fits(map, cx - RIDER.w / 2, bottom, RIDER.w, RIDER.h);
const spotFor = (map, body, cx, bottom) => findMountSpot(map, null, body, { cx, bottom });

/** 방 하나 분석 */
function analyzeRoom(stage, roomId, room) {
  const res = { stage: stage.id, room: roomId, w: 0, h: 0, start: null, startAlt: null, fail: [], info: {}, notes: [] };
  const map = new TileMap(room);
  res.w = map.w; res.h = map.h;
  const kinds = kindsOf(stage, room);
  const mirror = kinds.find((k) => k.kind === 'mirror');
  const startMirror = mirror?.start === 'B' ? 'B' : 'A';
  applyPhase(map, startMirror, 'even');
  const hasPhase = map.phaseTiles.length > 0;
  const liquid = room.liquid ?? stage.liquid ?? 'water';

  // ── 시작 지점 (world.loadRoom 과 같은 자리: P 칸 가운데, 발 = 그 칸 아래 경계) ──
  const P = map.markersOf('P')[0] ?? { tx: 2, ty: map.h - 3 };
  const cx = P.tx * TILE + TILE / 2, bottom = (P.ty + 1) * TILE;
  const startCheck = () => {
    const out = { rider: riderFitsAt(map, cx, bottom), mounts: {} };
    for (const b of BODIES) { const s = spotFor(map, b, cx, bottom); out.mounts[b.id] = s ? s.dx : null; }
    return out;
  };
  res.start = startCheck();
  res.start.tx = P.tx; res.start.ty = P.ty;
  res.start.underwater = liquid === 'deep' && map.typeAt(P.tx, P.ty) === T.LIQUID;
  if (hasPhase) {   // 반대 위상에서도 (방에 머무는 동안 벽이 바뀌면 매 프레임 자리 검사가 돌려보낼 수 있다: 정보)
    applyPhase(map, startMirror === 'A' ? 'B' : 'A', 'odd');
    res.startAlt = startCheck();
    applyPhase(map, startMirror, 'even');
  }
  if (!res.start.rider) res.fail.push('G4');
  if (res.start.mounts[WIDEST.id] === null) res.fail.push('G1');
  const noStart = BODIES.filter((b) => res.start.mounts[b.id] === null).map((b) => b.id);
  if (noStart.length) res.fail.push('G2');
  res.start.noFit = noStart;

  // ── 발 위치 전수 조사 ──
  let spots = 0, riderSpots = 0, noPassWide = 0, noPassAny = 0, corridor2 = 0, shaft1 = 0, oneWayNoMount = 0, embed = [];
  const runs2 = [];      // 두 칸 높이 통로 (같은 줄에서 이어진 칸 묶음)
  for (let ty = 0; ty < map.h - 1; ty++) {
    let run = 0;
    for (let tx = 0; tx < map.w; tx++) {
      const here = map.typeAt(tx, ty), below = map.typeAt(tx, ty + 1);
      const ok = openCell(here) && here !== T.SPIKE && standOn(below);
      let isC2 = false;
      if (ok) {
        spots++;
        const fx = tx * TILE + TILE / 2, fb = (ty + 1) * TILE;
        if (riderFitsAt(map, fx, fb)) {
          riderSpots++;
          // 머리 위 빈칸 수
          let hr = 0;
          for (let y = ty; y >= 0 && openCell(map.typeAt(tx, y)); y--) hr++;
          isC2 = hr === 2 && ty - 2 >= 0;
          if (isC2) corridor2++;
          const sideWalls = [ty, ty - 1].every((y) => isSolidType(map.typeAt(tx - 1, y)) && isSolidType(map.typeAt(tx + 1, y)));
          if (sideWalls) shaft1++;
          let anyFit = false, wideFit = false;
          for (const b of BODIES) {
            const s = spotFor(map, b, fx, fb);
            if (!s) continue;
            anyFit = true;
            if (b.id === WIDEST.id) wideFit = true;
            // G3: 탈것이 선 자리(밀린 발 중앙)에 가장 큰 기수가 내려도 박히지 않는가
            if (!riderFitsAt(map, s.cx, s.bottom) && embed.length < 12) embed.push(`${b.id}@${tx},${ty}`);
          }
          if (!wideFit) noPassWide++;
          if (!anyFit) noPassAny++;
          if (below === T.ONEWAY && !anyFit) oneWayNoMount++;
        }
      }
      if (isC2) run++;
      else if (run) { runs2.push(run); run = 0; }
    }
    if (run) runs2.push(run);
  }
  if (embed.length) res.fail.push('G3');
  res.info = { spots, riderSpots, corridor2Runs: runs2.length, corridor2Tiles: corridor2, shaft1, noPassWide, noPassAny, oneWayNoMount, embed };

  // ── 표식: 탈것에 탄 채 그 앞에 설 수 있는가 (문 D · 세이브 S · 여신상 G · 보스 경계 X · NPC N · 이야기 ! ) ──
  const dismountAt = [];
  for (const mk of map.markers) {
    if (!'DSGXN!'.includes(mk.ch)) continue;
    let fy = null;
    for (let y = mk.ty; y < map.h; y++) { if (standOn(map.typeAt(mk.tx, y + 1)) && openCell(map.typeAt(mk.tx, y))) { fy = (y + 1) * TILE; break; } }
    if (fy === null) continue;
    const fx = mk.tx * TILE + TILE / 2;
    if (!BODIES.some((b) => spotFor(map, b, fx, fy))) dismountAt.push(`${mk.ch}@${mk.tx},${mk.ty}`);
  }
  res.info.dismountAt = dismountAt;

  // ── 위/아래 출구 폭 (탈것은 1칸 폭 틈을 지나갈 수 없다: 내려서 지나간다) ──
  const gapRuns = (ty) => {
    const out = [];
    let run = 0;
    for (let tx = 0; tx <= map.w; tx++) {
      const open = tx < map.w && openCell(map.typeAt(tx, ty));
      if (open) run++;
      else if (run) { out.push(run); run = 0; }
    }
    return out;
  };
  if (room.exitDown) { const g = Math.max(0, ...gapRuns(map.h - 1)); res.info.exitDownGap = g; if (g * TILE < WIDEST.w) res.notes.push(`아래 출구 틈 ${g}칸 — 녹티스(${WIDEST.w}px)는 내려서 지나간다`); }
  if (room.exitUp) { const g = Math.max(0, ...gapRuns(0)); res.info.exitUpGap = g; if (g * TILE < WIDEST.w) res.notes.push(`위 출구 틈 ${g}칸 — 날 수 있는 탈것도 내려서 지나간다`); }
  if (res.start.underwater) res.notes.push('시작 지점이 깊은 물 속 — 소환 거절 (정상)');
  res.deep = liquid === 'deep';
  if (hasPhase) {
    const alt = BODIES.filter((b) => res.startAlt?.mounts[b.id] === null).map((b) => b.id);
    res.info.phaseTiles = map.phaseTiles.length;
    if (alt.length) res.notes.push(`반대 위상에서는 시작 지점에 ${alt.join(',')} 자리 없음 (방 안에서 벽이 바뀌면 자동 하차)`);
  }
  // ── 탈것을 탄 채 방을 지나갈 수 있는가 (정보) ──
  if (!NO_TRAVERSE) res.trav = traverse(stage, roomId, room, startMirror);
  return res;
}

// ───────────────────────── 탈것 이동 모형 (정보) ─────────────────────────
// validate_maps 의 도달 BFS 와 같은 틀(발 칸 단위: 걷기 · 낙하 · 점프 올라 옆으로 · 이동 발판 · 헤엄 · 상승 기류)에
// 몸 크기(findMountSpot, ±32px 밀기)와 탈것마다의 점프 높이·거리·비행을 넣었다. 위상 벽(거울·심장 박동)은 두 위상의 합집합(낙관적).
// 같은 모형을 기수(36×88, 위로 5칸·옆으로 6칸 — validate_maps 와 같은 수치)로도 돌려 '모형이 닿는 목표'만 탈것에 대해 판정한다.
const GRAV = 2200;
const hPx = (v) => (v * v) / (2 * GRAV);
function abilityOf(id) {
  const d = MOUNTS[id], mv = d.move, fl = d.flight;
  let px = hPx(mv.jump) + (mv.airJumps ?? 0) * hPx(mv.jump * 0.9);
  if (fl?.type === 'glide') px += (fl.flaps ?? 0) * hPx(Math.abs(fl.flapVy ?? 600));
  const air = (2 * mv.jump) / GRAV;
  const reach = fl?.type === 'fly' ? 10 : fl?.type === 'glide' ? 8 : Math.max(3, Math.min(6, Math.floor((mv.speed * air) / TILE)));
  return { id, name: d.name, body: d.body, maxUp: Math.floor(px / TILE), reach, fly: fl?.type === 'fly', mount: true };
}
const RIDER_PROF = { id: 'rider', name: '기수', body: RIDER, maxUp: 5, reach: 6, fly: false, mount: false };
const PROFILES = MOUNT_IDS.map(abilityOf);

function traverse(stage, roomId, room, startMirror) {
  const mA = new TileMap(room), mB = new TileMap(room);
  applyPhase(mA, startMirror, 'even');
  applyPhase(mB, startMirror === 'A' ? 'B' : 'A', 'odd');
  // 몸이 지나가는 판정용 사본: 부서지는 벽(B/H/K)은 부수고 지나간다고 본다 (validate_maps 와 같다; 서 있을 발판으로는 원본을 쓴다)
  const open = (m) => { const c = new TileMap(room); c.tiles.set(m.tiles); for (let i = 0; i < c.tiles.length; i++) if (c.tiles[i] === T.BREAK) c.tiles[i] = T.EMPTY; return c; };
  const oA = open(mA), oB = open(mB);
  const W = mA.w, H = mA.h;
  const liquid = room.liquid ?? stage.liquid ?? 'water';
  const deep = liquid === 'deep';
  const kinds = kindsOf(stage, room);
  const wind = kinds.some((k) => k.kind === 'wind');
  const rows = room.map;
  const ch = (x, y) => rows[y]?.[x] ?? ' ';
  const K = (x, y) => (y + 10) * 10000 + (x + 10);
  // 이동 발판 (validate_maps 와 같은 해석: 'M' 오른쪽, 'V' 아래로 platRange 칸, 2칸 폭)
  const platAt = new Map(), platCells = [];
  const range = room.platRange ?? 4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = ch(x, y);
    if (c !== 'M' && c !== 'V') continue;
    const cells = [];
    for (let k = 0; k <= range; k++) for (let w = 0; w < 2; w++) {
      const px = c === 'M' ? x + k + w : x + w, py = (c === 'V' ? y + k : y) - 1;
      if (px < 0 || px >= W || py < -1 || py >= H) continue;
      cells.push([px, py]); platAt.set(K(px, py), platCells.length);
    }
    platCells.push(cells);
  }
  const targets = [];
  if (room.exitRight) targets.push({ k: 'exitRight', label: '오른쪽 출구' });
  if (room.exitLeft) targets.push({ k: 'exitLeft', label: '왼쪽 출구' });
  if (room.exitUp) targets.push({ k: 'exitUp', label: '위 출구' });
  if (room.exitDown) targets.push({ k: 'exitDown', label: '아래 출구' });
  for (const mk of mA.markers) {
    if (mk.ch === 'D') targets.push({ k: `D${mk.tx},${mk.ty}`, label: `문(${mk.tx},${mk.ty})`, near: [mk.tx, mk.ty] });
    if (mk.ch === 'X') targets.push({ k: `X${mk.tx}`, label: `보스 경계(${mk.tx})`, col: mk.tx });
    if (mk.ch === 'S') targets.push({ k: `S${mk.tx},${mk.ty}`, label: `세이브(${mk.tx},${mk.ty})`, near: [mk.tx, mk.ty] });
  }
  const P = mA.markersOf('P')[0] ?? { tx: 2, ty: H - 3 };

  const run = (prof) => {
    const body = prof.body;
    // 격자: x −1…W+1, y −2…H+1 (방 밖 한 칸까지). 판정은 모두 격자 배열에 기억한다
    const GW = W + 3, GH = H + 4, N = GW * GH;
    const inG = (x, y) => x >= -1 && x <= W + 1 && y >= -2 && y <= H + 1;
    const gi = (x, y) => (y + 2) * GW + (x + 1);
    const inLiquid = (x, y) => mA.typeAt(x, y) === T.LIQUID;
    const bf = new Int8Array(N).fill(-1);
    const bodyFree = (x, y) => {
      if (!inG(x, y)) return false;
      const i = gi(x, y);
      if (bf[i] >= 0) return bf[i] === 1;
      const cx = x * TILE + TILE / 2, b = (y + 1) * TILE;
      let v = !!(spotFor(oA, body, cx, b) || spotFor(oB, body, cx, b));
      if (v && prof.mount && deep && (inLiquid(x, y) || inLiquid(x, y - 1))) v = false;   // 탈것은 깊은 물에 들어가면 내린다
      bf[i] = v ? 1 : 0;
      return v;
    };
    const floorAt = (x, y) => standOn(mA.typeAt(x, y + 1)) || standOn(mB.typeAt(x, y + 1)) || platAt.has(K(x, y));
    const standable = (x, y) => bodyFree(x, y) && floorAt(x, y) && mA.typeAt(x, y) !== T.SPIKE;
    const canSwim = deep ? !prof.mount : liquid === 'water' && prof.mount;
    const swim = (x, y) => canSwim && bodyFree(x, y) && (inLiquid(x, y) || inLiquid(x, y + 1));
    const updraft = (x, y) => wind && (ch(x, y) === 'U' || ch(x, y - 1) === 'U');
    const hover = (x, y) => prof.fly && bodyFree(x, y);
    const node = (x, y) => standable(x, y) || swim(x, y) || updraft(x, y) || hover(x, y);
    const hit = new Set();
    const seen = new Uint8Array(N);
    const qx = [], qy = [];
    const push = (x, y) => { if (!inG(x, y)) return; const i = gi(x, y); if (!seen[i]) { seen[i] = 1; qx.push(x); qy.push(y); } };
    const fm = new Int32Array(N).fill(-9);   // 낙하 결과: -9 모름, -1 없음, 그 밖에는 멈춘 y
    const fall = (x, y0) => {
      if (!inG(x, y0)) return null;
      const i0 = gi(x, y0);
      if (fm[i0] !== -9) return fm[i0] < 0 ? null : [x, fm[i0]];
      let y = y0, res = -1;
      while (true) {
        if (y >= H) { if (room.exitDown) hit.add('exitDown'); break; }
        if (standable(x, y)) { res = y; break; }
        if (!bodyFree(x, y)) break;
        if (swim(x, y) || updraft(x, y)) { res = y; break; }
        y++;
      }
      fm[i0] = res;
      return res < 0 ? null : [x, res];
    };
    const land = (x, y) => { if (node(x, y)) push(x, y); else { const f = fall(x, y); if (f) push(f[0], f[1]); } };
    // 시작: P 에서 아래로
    let sx = P.tx, sy = P.ty;
    while (sy < H && !node(sx, sy)) { if (!bodyFree(sx, sy)) break; sy++; }
    if (sy >= H || !node(sx, sy)) return { hit, ok: false, start: false };
    push(sx, sy);
    for (let h = 0; h < qx.length; h++) {
      const x = qx[h], y = qy[h];
      if (y >= H && room.exitDown) hit.add('exitDown');
      if (x >= W - 1 && room.exitRight) hit.add('exitRight');
      if (x <= 0 && room.exitLeft) hit.add('exitLeft');
      if (y < 0 && room.exitUp) hit.add('exitUp');
      for (const dx of [-1, 1]) { if (bodyFree(x + dx, y)) land(x + dx, y); }
      if (hover(x, y) || swim(x, y)) {
        if (bodyFree(x, y - 1)) push(x, y - 1);
        if (bodyFree(x, y + 1)) land(x, y + 1);
      }
      if (updraft(x, y) && bodyFree(x, y - 1)) push(x, y - 1);
      if (prof.fly) continue;   // 나는 탈것은 위 네 방향 이동으로 충분하다
      const grounded = standable(x, y) || swim(x, y);
      const maxUp = grounded ? prof.maxUp : Math.min(2, prof.maxUp);
      for (let up = 1; up <= maxUp; up++) {
        const ay = y - up;
        if (!bodyFree(x, ay)) break;               // 위로 한 칸씩 (아래 칸들은 앞 반복에서 확인)
        if (ay < 0 && room.exitUp) hit.add('exitUp');
        const reach = up >= 4 ? Math.min(4, prof.reach) : prof.reach;
        for (const dir of [-1, 1]) {
          for (let d = 1; d <= reach; d++) {
            const nx = x + dir * d;
            if (!bodyFree(nx, ay)) break;           // 같은 높이로 옆으로 (앞 칸들은 이미 확인)
            const f = fall(nx, ay);
            if (f && f[1] <= y + 8) push(f[0], f[1]);
            if (standable(nx, ay) || updraft(nx, ay) || swim(nx, ay)) push(nx, ay);
          }
        }
      }
      const pl = platAt.get(K(x, y));
      if (pl !== undefined) for (const [px, py] of platCells[pl]) if (standable(px, py)) push(px, py);
    }
    const reachedAt = (x, y) => inG(x, y) && seen[gi(x, y)] === 1;
    const near = ([tx, ty]) => { for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) if (reachedAt(xx, yy)) return true; return false; };
    const inCol = (c) => { for (let y = -2; y <= H + 1; y++) if (reachedAt(c, y) || reachedAt(c + 1, y)) return true; return false; };
    for (const t of targets) if (t.near ? near(t.near) : t.col !== undefined ? inCol(t.col) : hit.has(t.k)) hit.add(t.k);
    return { hit, start: true };
  };
  const base = run(RIDER_PROF);
  const judged = targets.filter((t) => base.hit.has(t.k));
  const out = { targets: targets.map((t) => t.k), judged: judged.map((t) => t.k), modelMiss: targets.filter((t) => !base.hit.has(t.k)).map((t) => t.label), mounts: {} };
  for (const prof of PROFILES) {
    const r = run(prof);
    out.mounts[prof.id] = judged.filter((t) => !r.hit.has(t.k)).map((t) => t.label);
  }
  return out;
}

// ── 실행 ──
if (argv.includes('--json') && (!JSON_OUT || JSON_OUT.startsWith('--'))) { console.error('--json 다음에 저장할 파일 경로가 필요하다'); process.exit(2); }
const badIds = ONLY.filter((s) => s !== 'town' && !(/^s\d\d$/.test(s) && STAGES[s]));
if (badIds.length) { console.error(`알 수 없는 스테이지: ${badIds.join(' ')} (s01–s20, town)`); process.exit(2); }   // 오타가 조용히 빠져 '모두 통과' 로 끝나지 않게
const stageIds = Object.keys(STAGES).filter((s) => /^s\d\d$/.test(s) && (!ONLY.length || ONLY.includes(s)));
const targets = stageIds.map((id) => STAGES[id]);
if (WITH_TOWN) targets.push({ ...TOWN_STAGE, id: TOWN_STAGE.id ?? 'town' });
if (!targets.length) { console.log('검사할 스테이지가 없다:', ONLY.join(' ')); process.exit(2); }

console.log(`탈것 몸 ${BODIES.length}종: ${BODIES.map((b) => `${b.name} ${b.w}×${b.h}`).join(' · ')}`);
console.log(`가장 넓은 몸 ${WIDEST.name} ${WIDEST.w}×${WIDEST.h} · 가장 높은 몸 ${TALLEST.name} ${TALLEST.w}×${TALLEST.h} · 가장 큰 기수 ${RIDER.w}×${RIDER.h}\n`);

const all = [];
const tot = { rooms: 0, corridor2Runs: 0, noPassWide: 0, noPassAny: 0, shaft1: 0, oneWayNoMount: 0, dismountAt: 0, riderSpots: 0 };
for (const st of targets) {
  const rooms = Object.entries(st.rooms ?? {});
  const rows = [];
  for (const [rid, room] of rooms) {
    let r;
    try { r = analyzeRoom(st, rid, room); } catch (e) { r = { stage: st.id, room: rid, fail: ['ERROR'], info: {}, notes: [String(e?.stack ?? e)], start: null }; }
    rows.push(r); all.push(r);
    tot.rooms++;
    for (const k of ['corridor2Runs', 'noPassWide', 'noPassAny', 'shaft1', 'oneWayNoMount', 'riderSpots']) tot[k] += r.info[k] ?? 0;
    tot.dismountAt += r.info.dismountAt?.length ?? 0;
  }
  const bad = rows.filter((r) => r.fail.length);
  console.log(`${bad.length ? '✗' : '✓'} ${st.id} ${st.name ?? ''} — 방 ${rows.length}개${bad.length ? `, 실패 ${bad.length}` : ''}`);
  for (const r of rows) {
    const I = r.info;
    const trMiss = r.trav ? Object.entries(r.trav.mounts).filter(([, m]) => m.length) : [];
    const interesting = r.fail.length || r.notes.length || (I.noPassAny ?? 0) > 0 || (I.dismountAt?.length ?? 0) > 0 || trMiss.length || r.trav?.modelMiss?.length;
    if (!VERBOSE && !interesting) continue;
    const s = r.start;
    const startTxt = s ? (s.noFit?.length ? `시작 P(${s.tx},${s.ty}) 자리 없음: ${s.noFit.join(',')}` : `시작 P(${s.tx},${s.ty}) 9종 OK${Object.values(s.mounts).some((d) => d) ? ` (밀기 ${[...new Set(Object.values(s.mounts).filter((d) => d))].join('/')}px)` : ''}`) : '';
    console.log(`    ${r.fail.length ? 'FAIL ' + r.fail.join('+') : 'ok  '} ${r.room.padEnd(6)} ${startTxt}`
      + ` · 2칸 통로 ${I.corridor2Runs ?? 0}곳(${I.corridor2Tiles ?? 0}칸) · 탈것 불가 발 위치 ${I.noPassAny ?? 0} (녹티스 ${I.noPassWide ?? 0}) / 기수 ${I.riderSpots ?? 0}`
      + `${I.shaft1 ? ` · 1칸 폭 통로 ${I.shaft1}` : ''}${I.oneWayNoMount ? ` · 탈것이 못 서는 발판 ${I.oneWayNoMount}` : ''}`
      + `${I.dismountAt?.length ? ` · 내려야 닿는 표식 ${I.dismountAt.join(' ')}` : ''}`);
    for (const n of r.notes) console.log(`         · ${n}`);
    if (I.embed?.length) console.log(`         · 하차 시 기수가 박히는 자리: ${I.embed.join(' ')}`);
    if (r.trav) {
      // 같은 목표를 못 가는 탈것끼리 묶어서 한 줄에
      const byMiss = new Map();
      for (const [id, m] of trMiss) { const k = m.join(', '); byMiss.set(k, [...(byMiss.get(k) ?? []), MOUNTS[id].name]); }
      for (const [k, names] of byMiss) console.log(`         · 탄 채로 못 감 (내려서 간다): ${k} ← ${names.join('·')}${r.deep ? ' (깊은 물 방: 물에 들어가면 내린다 — 설계)' : ''}`);
      if (r.trav.modelMiss.length) console.log(`         · (이동 모형이 기수로도 닿지 못한 목표 — 판정 제외: ${r.trav.modelMiss.join(', ')})`);
    }
  }
}

const g = (code) => all.filter((r) => r.fail.includes(code)).map((r) => `${r.stage}:${r.room}`);
const gates = [
  ['G1 시작 지점에서 가장 넓은 탈것(녹티스) 자리 찾기 실패 방 0', g('G1')],
  ['G2 시작 지점에서 아홉 탈것 모두 자리 찾기', g('G2')],
  ['G3 탈것이 선 자리에서 내려도 기수가 박히지 않음', g('G3')],
  ['G4 시작 지점에 기수가 박히지 않음', g('G4')],
  ['스캔 오류 없음', g('ERROR')],
];
console.log(`\n── 요약: 방 ${tot.rooms}개 ──`);
console.log(`  두 칸 높이 통로 ${tot.corridor2Runs}곳 · 기수만 설 수 있는 발 위치 ${tot.noPassAny} / ${tot.riderSpots} (녹티스 기준 ${tot.noPassWide}) · 1칸 폭 통로 칸 ${tot.shaft1}`
  + ` · 탈것이 못 서는 단방향 발판 ${tot.oneWayNoMount} · 내려야 닿는 표식 ${tot.dismountAt}`);
console.log('  (탈것 몸 폭 56–70px 은 1칸 폭 통로에 들어가지 못한다: 설계상 내려서 지나간다 — companions §3.3 · §15)');
if (!NO_TRAVERSE) {
  const withT = all.filter((r) => r.trav && r.trav.judged.length);
  console.log(`  탈것을 탄 채 시작 지점에서 모든 출구·문·보스 경계·세이브까지 가는 방 (이동 모형, 정보; 판정 가능한 방 ${withT.length}개):`);
  const line = [];
  for (const prof of PROFILES) {
    const ok = withT.filter((r) => !r.trav.mounts[prof.id].length).length;
    line.push(`${prof.name} ${ok}/${withT.length}`);
  }
  console.log('    ' + line.join(' · '));
  const worst = withT.filter((r) => r.trav.mounts.mt_warhorse.length);
  if (worst.length) {
    const dry = worst.filter((r) => !r.deep);
    console.log(`    그림메인(지상 기본형)으로는 내려야 하는 방 ${worst.length}개 (깊은 물 방 ${worst.length - dry.length}개 포함): ${worst.map((r) => `${r.stage}:${r.room}${r.deep ? '*' : ''}`).join(' ')}   (* 깊은 물 — 설계상 하차)`);
  }
  const lows = PROFILES.map((prof) => ({ prof, n: withT.filter((r) => !r.deep && r.trav.mounts[prof.id].length).length })).filter((o) => o.n > withT.length * 0.2);
  for (const o of lows) console.log(`    ! ${o.prof.name}: 깊은 물이 아닌 방 ${o.n}개에서 내려야 한다 (점프로 오를 수 있는 높이 ${o.prof.maxUp}칸 · 옆으로 ${o.prof.reach}칸 — 모형)`);
  const miss = all.filter((r) => r.trav?.modelMiss?.length).length;
  if (miss) console.log(`    (이동 모형이 기수로도 닿지 못한 목표가 있는 방 ${miss}개 — 그 목표는 판정에서 뺐다. 기수 도달은 validate_maps 가 검사한다)`);
}
let failed = 0;
for (const [name, list] of gates) {
  console.log(`  ${list.length ? '✗' : '✓'} ${name}${list.length ? ` — ${list.length}개: ${list.slice(0, 20).join(' ')}` : ''}`);
  if (list.length) failed++;
}
if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({ bodies: BODIES, widest: WIDEST.id, rider: RIDER, totals: tot, rooms: all }, null, 1));
  console.log(`  JSON: ${JSON_OUT}`);
}
console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과');
process.exit(failed ? 1 : 0);
