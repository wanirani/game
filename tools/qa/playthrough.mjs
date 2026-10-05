// 자동 플레이스루: 스테이지 입구에서 보스 방까지 실제 키보드 입력으로 방을 차례로 지나 보스를 쓰러뜨리고 결과 화면까지 간다.
//
//   node tools/qa/playthrough.mjs [--only s03,s14] [--god] [--char kael] [--preset 3|4] [--jobs 2] [--room-timeout 120]
//                                 [--boss-timeout 240] [--out dir] [--json] [--verbose]
//
// 시작: 아케이드 '스테이지 연습' (?scene=practice&stage=…&preset=…) — 강한 헌터 등급(LEVEL_PRESETS; 2부는 '이계의 순례자' = 4,
//   meta.konami 로 연다), 이야기 대사 없음. 루프는 lib/step.mjs freeze 로 멈추고 한 스텝(1/60초)씩 돌린다 (결정적·빠름).
// 입력: lib/server.mjs KEY 와 같은 키를 page.keyboard(CDP)로 누른다 — input.js 리스너를 거치는 진짜 입력 경로.
// 길찾기: lib/nav.mjs — 방 타일 격자 + moveBody 복제로 점프·낙하 매크로 결과를 굴려 만든 그래프, 목표(다음 방 출구·문·보스 경기장)
//   까지 남은 비용. 실행은 닫힌 고리: 매 착지마다 지금 상태로 다시 굴려 보고(검증) 어긋나면 그 간선에 벌점 → 다시 계획.
// 모드: --god = 매 스텝 무적(buffs.invincible)·체력 채움 (순수 이동·진행 검사). 기본 = 정상 피해, 사망·피해·시간 기록
//   (목숨은 줄면 다시 채워 뒷방을 계속 본다 — 사망 수는 그대로 센다).
// 방 제한 시간(게임 시간)을 넘기면 stuck: 스크린샷·위치 기록 후 world.gotoRoom(다음 방) 으로 옮겨 나머지를 계속 본다.
// 출력: /tmp/claude-0/qa/playthrough/<시각>[-god]/report.json · stuck_*.png · 콘솔 표 · --json 이면 마지막 줄에 요약 JSON.
import fs from 'node:fs';
import path from 'node:path';
import { openEnv, KEY } from './lib/server.mjs';
import { freeze } from './lib/step.mjs';
import { STAGES, STAGE_ORDER } from '../../src/data/stages.js';
import { Grid, heroModel, RoomNav, simulate, macroById, MACROS, platObjects, TILE } from './lib/nav.mjs';

// ── 인자 ──
const argv = process.argv.slice(2);
const flag = (k) => argv.includes('--' + k);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const GOD = flag('god');
const ONLY = opt('only', null)?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const CHAR = opt('char', 'kael');
const PRESET_ARG = opt('preset', null);
const JOBS = Math.max(1, +opt('jobs', 2));
const ROOM_TIMEOUT = +opt('room-timeout', 120) * 60;     // 프레임
const BOSS_TIMEOUT = +opt('boss-timeout', 240) * 60;
const VERBOSE = flag('verbose');
const WALL_CAP = +opt('wall-cap', 15) * 60000;   // 스테이지 하나의 실시간 상한 (ms)
const STAMP = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const OUT = opt('out', `/tmp/claude-0/qa/playthrough/${STAMP}${GOD ? '-god' : ''}`);
const stages = ONLY ?? STAGE_ORDER;
{
  const bad = stages.filter((s) => !STAGES[s] || !STAGE_ORDER.includes(s));
  if (bad.length) { console.error(`모르는 스테이지: ${bad.join(', ')} (가능: ${STAGE_ORDER.join(',')})`); process.exit(2); }
}
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { if (VERBOSE) console.log(...a); };

// ── 방 경로: 시작 방 → 보스 방 (출구·문 그래프 BFS) ──
function roomLinks(stage, rid) {
  const r = stage.rooms[rid], out = [];
  for (const [k, d] of [['exitRight', 'R'], ['exitLeft', 'L'], ['exitUp', 'U'], ['exitDown', 'D']]) if (r[k]) out.push({ to: r[k], via: d });
  const nD = r.map.join('').split('D').length - 1;
  for (let i = 0; i < nD; i++) { const t = r.doors?.[i] ?? r.next; if (t && !String(t).startsWith('scene:')) out.push({ to: t, via: 'door', door: i }); }
  return out;
}
function routeFrom(stage, from) {
  const bossRoom = Object.keys(stage.rooms).find((k) => stage.rooms[k].boss) ?? 'boss';
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) {
    const n = q.shift();
    if (n === bossRoom) break;
    for (const l of roomLinks(stage, n)) if (stage.rooms[l.to] && !prev.has(l.to)) { prev.set(l.to, { n, l }); q.push(l.to); }
  }
  if (!prev.has(bossRoom)) return null;
  const path = [];
  for (let n = bossRoom; n; n = prev.get(n)?.n) path.unshift(n);
  return path;
}
/** 이 방에서 next 로 가는 방법 → {exits:{R..}, door:index|null} */
function linkTo(stage, rid, next) {
  const ls = roomLinks(stage, rid).filter((l) => l.to === next);
  const exits = {}; let doors = [];
  for (const l of ls) { if (l.via === 'door') doors.push(l.door); else exits[l.via] = true; }
  return { exits, doors };
}

// ── 페이지 도우미 (freeze 뒤 설치) ──
function installHelper() {
  const g = window.__game;
  const P = window.__pt = {
    god: false, deaths: 0, wasDead: false, airborne: false, landed: false, lives: 0, hurt: 0,
    gameplay() { const t = g.top?.name; return t === 'practice' || t === 'stage'; },
    refill() {
      const w = g.world, p = w?.player;
      if (!p) return;
      if (P.god) { p.buffs.invincible = 9999; if (!p.dead && p.hp < p.stats.hp) p.hp = p.stats.hp; if (w.gimmickOf?.('deep')) { const d = w.gimmickOf('deep'); d.air = 100; } }
      if (w.run && w.run.lives < 2) { w.run.lives = 3; P.lives++; }
    },
    hb(e) { try { const r = e.hurtbox?.() ?? e; return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null; } catch { return { x: e.x, y: e.y, w: e.w, h: e.h }; } },
    grid() {
      const w = g.world, m = w.map;
      const wind = w.gimmickOf?.('wind');
      const doors = w.entities.filter((e) => e.constructor?.name === 'Door' || (e.kind === 'prop' && 'target' in e && e.h === 96 && e.w === 48)).map((d) => ({ tx: Math.round(d.x / 48), ty: Math.round((d.y + d.h) / 48) - 1, target: d.target }));
      const switches = w.entities.filter((e) => e.def?.id === 'mirror_switch').map((e) => ({ tx: Math.round(e.x / 48), ty: Math.round((e.y + e.h) / 48) - 1 }));
      return { stage: w.stage.id, room: w.roomId, w: m.w, h: m.h, tiles: Array.from(m.tiles), openL: m.openLeft, openR: m.openRight, version: m.version,
        liquid: w.liquid, deep: !!w.gimmickOf?.('deep'), updraft: wind ? [...(wind.updraft || [])] : [], arenaX: w.room?.boss ? (w.arenaX ?? null) : null,
        doors, switches, gimmicks: (w.gimmick?.members || []).map((x) => x.kind), revealed: m.revealed?.size ?? 0 };
    },
    plats() {
      return (g.world?.platforms || []).filter((p) => !p.dead).map((p) => p.constructor?.name === 'CrumblePlatform' || 'state' in p
        ? { kind: 'F', x: p.x, y: p.y, w: p.w, h: p.h, ox: p.ox, oy: p.oy, state: p.state, st: p.st, fallV: p.fallV ?? 0 }
        : { kind: p.vertical ? 'V' : 'M', x: p.x, y: p.y, w: p.w, h: p.h, ox: p.ox, oy: p.oy, range: p.range, speed: p.speed, dir: p.dir, vertical: !!p.vertical, vx: p.vx || 0, vy: p.vy || 0 });
    },
    obs(full = false) {
      const w = g.world, p = w?.player, b = w?.boss;
      const o = { f: g.frame, top: g.top?.name ?? null, scenes: g.scenes.map((s) => s.name).join('>'), room: w?.roomId ?? null, stage: w?.stage?.id ?? null,
        trans: !!w?.transitioning || (g.fade?.dir ?? 0) !== 0, cut: !!w?.cutscene, deaths: P.deaths, lives: P.lives, landed: P.landed,
        cleared: !!w?.cleared, arena: !!w?.arena, ver: w?.map?.version ?? 0, revealed: w?.map?.revealed?.size ?? 0,
        dmg: w?.run?.damageTaken ?? 0, rtime: w?.run?.time ?? 0, gt: w?.time ?? 0 };
      if (p) {
        const pi = p.platform ? (w.platforms || []).indexOf(p.platform) : -1;
        o.p = { x: p.x, y: p.y, w: p.w, h: p.h, vx: p.vx, vy: p.vy, og: !!p.onGround, hp: p.hp, mhp: p.stats?.hp, mp: p.mp, dead: !!p.dead, hurt: p.hurtT > 0,
          air: p.airJumpsLeft, facing: p.facing, move: !!p.move, plat: pi, platRef: pi >= 0 ? { ox: p.platform.ox, oy: p.platform.oy, x: p.platform.x, y: p.platform.y } : null,
          sprint: !!p.sprinting, jumpCut: !!p.jumpCut, reach: p.stats?.reach ?? 0 };
      }
      if (b) o.boss = { ...(P.hb(b) || {}), hp: b.hp, mhp: b.stats?.maxHp ?? b.maxHp, dead: !!b.dead, dying: b.dying > 0, pending: !!b.pendingBoss, id: b.def?.id ?? b.id, active: !!w.bossActive };
      const wind = w?.gimmickOf?.('wind');
      if (wind) o.wind = wind.phase;
      if (p && w) {
        const foes = [];
        for (const e of w.entities) {
          if (e.dead || e === b || e.kind !== 'enemy' || e.pendingBoss) continue;
          const r = P.hb(e); if (!r) continue;
          const dx = r.x + r.w / 2 - (p.x + p.w / 2), dy = r.y + r.h / 2 - (p.y + p.h / 2);
          if (Math.abs(dx) < 420 && Math.abs(dy) < 300) foes.push({ ...r, dx, dy, hp: e.hp });
        }
        foes.sort((a, c) => Math.abs(a.dx) - Math.abs(c.dx));
        o.foes = foes.slice(0, 6);
        // 부서지는 벽(B/H/K)
      }
      if (g.top?.name === 'arcadeResults') { const r = g.top.res || {}; o.res = { cleared: !!r.cleared, title: r.title, time: r.time, rank: r.rank, score: r.score }; }
      if (full) o.plats = P.plats();
      return o;
    },
    /** n 스텝. stop: {land, room, scene, dead} 조건이면 일찍 멈춤 */
    run(n, stop = {}) {
      const w0 = g.world, room0 = w0?.roomId;
      P.landed = false;
      let i = 0;
      for (; i < n; i++) {
        P.refill();
        window.__qaStep(1, false);
        const w = g.world, p = w?.player;
        if (p) {
          if (p.dead && !P.wasDead) P.deaths++;
          P.wasDead = !!p.dead;
          if (!p.onGround) P.airborne = true;
          else if (P.airborne) { P.airborne = false; P.landed = true; }
        }
        if (stop.room && (g.world !== w0 || g.world?.roomId !== room0)) break;
        if (stop.scene && !P.gameplay()) break;
        if (stop.dead && p?.dead) break;
        if (stop.land && P.landed) break;
        if (stop.trans && (w?.transitioning || (g.fade?.dir ?? 0) !== 0)) break;
      }
      return P.obs(!!stop.full);
    },
    render() { try { g.__qaRender.call(g); } catch (e) { console.error(e); } },
  };
}

// ── 한 스테이지 ──
async function playStage(env, stageId) {
  const stage = STAGES[stageId];
  const preset = PRESET_ARG != null ? +PRESET_ARG : (stage.part === 2 || STAGE_ORDER.indexOf(stageId) >= 13 ? 4 : 3);
  const url = `index.html?scene=practice&stage=${stageId}&preset=${preset}&char=${CHAR}&diff=normal`;
  const rep = { stage: stageId, name: stage.name, mode: GOD ? 'god' : 'normal', preset, char: CHAR, url, rooms: [], deaths: 0, livesRefilled: 0, damage: 0,
    bossTime: null, clear: null, errors: [], botLimits: [], wallMs: 0, gameTime: 0 };
  const t0 = Date.now();
  const s = await env.page({ viewport: { width: 1280, height: 720 } }, url, { settings: { quality: 'low', autoSprint: false, screenShake: false }, storage: { bloodnocturne_meta: { konami: true } } });
  const held = new Set();
  const lastUp = {}, lastDown = {};
  let frame = 0;   // 우리 쪽 프레임 계수 (키 타이밍)
  const keys = async (want) => {
    for (const k of [...held]) if (!want[k]) { await s.page.keyboard.up(KEY[k]); held.delete(k); lastUp[k] = frame; }
    for (const [k, v] of Object.entries(want)) if (v && !held.has(k)) { await s.page.keyboard.down(KEY[k]); held.add(k); lastDown[k] = frame; }
  };
  const setKey = async (k, v) => {
    if (v && !held.has(k)) { await s.page.keyboard.down(KEY[k]); held.add(k); lastDown[k] = frame; }
    else if (!v && held.has(k)) { await s.page.keyboard.up(KEY[k]); held.delete(k); lastUp[k] = frame; }
  };
  const run = async (n, stop = {}) => { const o = await s.eval(([n, stop]) => window.__pt.run(n, stop), [n, stop]); frame = o.f; return o; };
  const tap = async (k, n = 2, after = 2) => { await setKey(k, true); await run(n); await setKey(k, false); return run(after); };
  /** 질주(두 번 톡) 방지: 짧게 누른 방향을 떼고 15 프레임 안에 다시 누르지 않는다 */
  const sprintSafe = async (k) => {
    if (!(k === 'left' || k === 'right') || held.has(k)) return;
    const since = frame - (lastUp[k] ?? -999), dur = (lastUp[k] ?? -999) - (lastDown[k] ?? -999);
    if (since < 16 && dur < 20) await run(16 - since);
  };
  try {
    await s.waitGame('!!g.world?.player && (g.top?.name === "practice" || g.top?.name === "stage")', 90000);
    await freeze(s.page);
    await s.eval(installHelper);
    await s.eval((god) => { window.__pt.god = god; }, GOD);
    let obs = await run(30);
    const info = await s.eval(() => { const p = window.__game.world.player; return { w: p.w, h: p.h, speed: p.moveProfile(null).speed, jump: p.jumpVel(), airJumps: p.maxAirJumps(), wallJump: !!p.ch.move.wallJump, lv: p.hero.level }; });
    rep.hero = info;
    const hero = heroModel(info);
    let route = routeFrom(stage, obs.room);
    rep.route = route;
    let room = null, R = null, nav = null, gsnap = null, gridVer = -1, nextRoom = null;
    const visited = [];
    let bossStart = null, resultWait = 0, lastProgress = 0;
    const finishRoom = (status, extra = {}) => {
      if (!R || R.status) return;
      R.status = status; R.frames = frame - R.f0; R.time = +(R.frames / 60).toFixed(1);
      R.deaths = obs.deaths - R.d0; R.damage = Math.round(obs.dmg - R.dmg0);
      Object.assign(R, extra);
      if (R.deaths > 0 && status === 'ok') R.status = 'died';
    };
    const enterRoom = async () => {
      room = obs.room;
      visited.push(room);
      if (!route?.includes(room)) route = routeFrom(stage, room);
      const i = route ? route.indexOf(room) : -1;
      nextRoom = i >= 0 && i < route.length - 1 ? route[i + 1] : null;
      R = { room, next: nextRoom, f0: frame, d0: obs.deaths, dmg0: obs.dmg, status: null, replans: 0, macros: 0, fails: 0, notes: [] };
      rep.rooms.push(R);
      await rebuild();
    };
    const rebuild = async () => {
      gsnap = await s.eval(() => window.__pt.grid());
      gridVer = gsnap.version + ':' + gsnap.revealed;
      const grid = new Grid(gsnap);
      const goal = { exits: {}, door: null, arenaTx: null };
      if (stage.rooms[room]?.boss) goal.arenaTx = gsnap.arenaX != null ? Math.floor(gsnap.arenaX / TILE) : null;
      else if (nextRoom) {
        const l = linkTo(stage, room, nextRoom);
        goal.exits = l.exits;
        const d = gsnap.doors.filter((x) => x.target === nextRoom);
        if (d.length) goal.door = d[0];
      }
      const plats = platObjects((await s.eval(() => window.__pt.plats())));
      nav = new RoomNav(grid, hero, goal, { plats, god: GOD });
      nav.liquidHurts = gsnap.liquid !== 'water' && gsnap.liquid !== 'deep';
      R.goal = goal; R.gimmicks = gsnap.gimmicks;
    };
    const shot = async (name) => { await s.eval(() => window.__pt.render()); const f = path.join(OUT, name); await s.screenshot(f); return f; };
    const stuck = async (reason) => {
      const f = await shot(`stuck_${stageId}_${room}.png`);
      const p = obs.p || {};
      finishRoom('stuck', { reason, pos: { x: Math.round(p.x), y: Math.round(p.y), tx: Math.floor((p.x + p.w / 2) / TILE), fy: Math.round((p.y + p.h) / TILE), og: p.og }, shot: f,
        reached: nav?.reached?.size ?? 0, goalReachable: !!nav?.goalHit, trail: R.trail?.slice(-12) });
      await keys({});
      if (nextRoom) {
        await s.eval((n) => window.__game.world.gotoRoom(n), nextRoom);
        obs = await run(40);
        return true;
      }
      return false;
    };

    const isOverlay = (t) => t && !['practice', 'stage', 'arcadeResults', 'loading'].includes(t);
    let overlayN = 0, fightT = 0, swimT = 0, waitN = 0, noNode = 0;
    for (let iter = 0; iter < 400000; iter++) {
      if (Date.now() - t0 > WALL_CAP) { rep.errors.push(`HARNESS 스테이지 실시간 상한 ${WALL_CAP / 60000}분 초과`); if (R && !R.status) await stuck('실시간 상한 초과'); break; }
      // ── 결과 화면 ──
      if (obs.res || obs.top === 'arcadeResults') {
        rep.clear = obs.res;
        if (R && !R.status) finishRoom(obs.res?.cleared ? 'ok' : 'died');
        break;
      }
      // ── 대사·보스 소개·일시정지 등 겹친 장면 ──
      if (isOverlay(obs.top)) {
        overlayN++;
        await keys({});
        const k = obs.top === 'bossIntro' ? 'jump' : obs.top === 'arcadePause' || obs.top === 'pause' ? 'menu' : 'enter';
        await tap(k, 2, 6);
        obs = await run(4);
        if (overlayN > 400) { rep.errors.push(`겹친 장면 '${obs.top}' 이 닫히지 않음`); break; }
        continue;
      }
      if (obs.top === 'loading' || !obs.p) { obs = await run(10); continue; }
      // ── 방 바뀜 ──
      if (obs.room !== room) {
        if (R && !R.status) finishRoom(R.next === obs.room || !R.next ? 'ok' : 'ok', { exitTo: obs.room });
        await keys({});
        await enterRoom();
        noNode = 0; waitN = 0;
        continue;
      }
      if (obs.trans) { obs = await run(6, { room: true }); continue; }
      if (obs.p.dead) { await keys({}); obs = await run(20, { room: true }); continue; }
      rep.gameTime = obs.rtime;
      const isBossRoom = !!stage.rooms[room]?.boss;
      // ── 시간 제한 ──
      const inRoom = frame - R.f0;
      if (isBossRoom && obs.boss && bossStart == null) bossStart = frame;
      if (isBossRoom && obs.cleared) {
        if (rep.bossTime == null && bossStart != null) rep.bossTime = +((frame - bossStart) / 60).toFixed(1);
        await keys({});
        obs = await run(30);
        if (++resultWait > 60) { finishRoom('stuck', { reason: '보스 격파 뒤 결과 화면이 열리지 않음' }); rep.errors.push('NORESULT 보스 격파 후 30초 동안 결과 화면 없음'); break; }
        continue;
      }
      if (isBossRoom && bossStart != null && frame - bossStart > BOSS_TIMEOUT) {
        const b = obs.boss;
        await stuck(`보스전 ${BOSS_TIMEOUT / 60}초 안에 끝나지 않음 (boss=${b?.id} hp=${Math.round(b?.hp)}/${Math.round(b?.mhp)} pending=${b?.pending} active=${b?.active})`);
        break;
      }
      if (!isBossRoom && inRoom > ROOM_TIMEOUT) {
        if (!(await stuck(`방 제한 시간 ${ROOM_TIMEOUT / 60}초 초과`))) break;
        continue;
      }
      if (isBossRoom && bossStart == null && inRoom > ROOM_TIMEOUT) { await stuck('보스 경기장에 닿지 못함'); break; }
      // ── 보스전 ──
      if (isBossRoom && (obs.arena || obs.boss)) {
        fightT++;
        obs = await fight(obs);
        continue;
      }
      // ── 격자 바뀜 (위상 타일·부서진 벽·드러난 가짜 벽) ──
      if (obs.ver + ':' + obs.revealed !== gridVer) { await rebuild(); }
      // ── 적 (정상 모드) ──
      if (!GOD && obs.p.og && obs.foes?.length) {
        const f = obs.foes.find((e) => Math.abs(e.dx) < (e.w / 2 + 70 + (obs.p.reach || 0)) && Math.abs(e.dy) < 90);
        if (f) {
          const dir = Math.sign(f.dx) || obs.p.facing;
          if (dir !== obs.p.facing) { await keys({ [dir > 0 ? 'right' : 'left']: true }); obs = await run(1); }
          await keys({});
          obs = await tap('attack', 2, 6);
          continue;
        }
      }
      // ── 깊은 물: 헤엄 ──
      const node = nav.nodeOf({ ...obs.p, platRef: obs.p.platRef }, obs.p.plat);
      if (!obs.p.og && !(typeof node === 'string' && node[0] === 'W')) {
        // 공중 (넉백·바람·발판에서 떨어짐): 키를 놓고 착지까지
        await keys({});
        obs = await run(30, { land: true, room: true, scene: true, dead: true });
        continue;
      }
      if (node == null) {
        // 격자상 설 곳이 아님 (가장자리·발판 끝): 조금씩 움직여 본다
        noNode++;
        await sprintSafe(noNode % 40 < 20 ? 'right' : 'left');
        await keys({ [noNode % 40 < 20 ? 'right' : 'left']: true });
        obs = await run(4, { room: true });
        await keys({});
        if (noNode % 10 === 0) obs = await tap('jump', 12, 20);
        continue;
      }
      noNode = 0;
      (R.trail ??= []);
      if (R.trail[R.trail.length - 1] !== node) { R.trail.push(node); if (R.trail.length > 40) R.trail.shift(); }
      let hNow = nav.hOf(node);
      if (!Number.isFinite(hNow) || !nav.h.size) {
        hNow = nav.plan(node); R.replans++;
        if (!Number.isFinite(hNow)) {
          // 길 없음: 거울 스위치 · 부서지는 벽 · 기다리기(위상·발판)
          const acted = await unblock(node);
          if (!acted) { obs = await run(30, { room: true }); waitN++; }
          if (waitN > 12 && !R.noteNoPath) { R.noteNoPath = true; R.notes.push(`길 없음 (노드 ${nav.reached?.size}개 닿음)`); }
          continue;
        }
      }
      if (nav.isGoal(node)) {
        if (nav.goal.door) { await keys({}); obs = await tap('up', 3, 20); if (obs.room === room && !obs.trans) { obs = await run(10); R.notes.push('문 앞에서 ▲'); } continue; }
        // 보스 경기장: 오른쪽으로 걸어 들어간다
        await keys({ right: true }); obs = await run(6, { room: true }); continue;
      }
      // 바람: 돌풍 중에는 기다린다 (바람 반대쪽으로 버티기)
      if (obs.wind === 'on' || obs.wind === 'warn') { await keys({}); obs = await run(6, { room: true }); continue; }
      const b = nav.best(node);
      if (!b) { nav.plan(node); R.replans++; obs = await run(4); continue; }
      const e = b.e;
      if (e.ride) { await keys({}); obs = await run(2, { room: true }); continue; }
      if (e.swim) { obs = await swim(e); continue; }
      if (e.walk != null && !e.macro) {
        const k = e.walk > 0 ? 'right' : 'left';
        await sprintSafe(k);
        await keys({ [k]: true });
        obs = await run(3, { room: true, dead: true });
        // 떨어졌거나 제자리면 다음 판단에서 다시 본다
        continue;
      }
      // 매크로 간선: 정렬 → 검증 → 실행
      obs = await doMacro(node, e, hNow);
    }

    // ── 보조 동작들 (클로저) ──
    async function align(x) {
      for (let k = 0; k < 40; k++) {
        const p = obs.p, dx = x - p.x;
        if (Math.abs(dx) <= 4 && Math.abs(p.vx) < 30) { await keys({}); return true; }
        if (!p.og) return false;
        const key = dx > 0 ? 'right' : 'left';
        if (Math.abs(dx) > 26) { await sprintSafe(key); await keys({ [key]: true }); obs = await run(2, { room: true }); }
        else if (Math.abs(dx) > 4 && Math.abs(p.vx) < 60) { await sprintSafe(key); await keys({ [key]: true }); obs = await run(1, { room: true }); await keys({}); obs = await run(3, { room: true }); }
        else { await keys({}); obs = await run(2, { room: true }); }
        if (obs.room !== room) return false;
      }
      await keys({});
      return false;
    }
    function simFrom(m, o) {
      const p = o.p;
      const st = { x: p.x, y: p.y, w: p.w, h: p.h, vx: p.vx, vy: p.vy, onGround: p.og, air: p.air, jumpCut: true };
      return simulate(nav.grid, hero, st, m, { plats: platObjects(o.plats || []), exits: nav.goal.exits || {} });
    }
    function landNode(r) {
      if (r.end === 'exit') return 'EXIT';
      if (r.end !== 'land' && r.end !== 'swim') return null;
      return nav.nodeOf({ x: r.x, y: r.y, w: hero.w, h: hero.h, onGround: r.end === 'land', platRef: r.platRef }, r.platRef ? 0 : -1);
    }
    function hLand(n) { return n === 'EXIT' ? 0 : nav.hOf(n); }
    async function doMacro(node, e, hNow) {
      const m = macroById(e.macro);
      const onPlat = typeof node === 'string' && node[0] === 'P';
      const toPlat = typeof e.to === 'string' && e.to[0] === 'P';
      const crumble = nav.crumbleAt(nav.decode(node)?.tx, nav.decode(node)?.fy);
      if (!onPlat && !crumble && !(typeof node === 'string' && node[0] === 'W')) {
        const a = nav.anchor(node);
        if (!(await align(a.x))) { if (obs.room === room) { R.fails++; nav.penalize(node, e, 0.5); } return obs; }
      }
      // 질주 방지 대기 (정렬 탭 직후 같은 방향으로 출발하지 않게)
      const firstDir = m.events[0].k.right ? 'right' : m.events[0].k.left ? 'left' : null;
      if (firstDir) await sprintSafe(firstDir);
      let o = await s.eval(() => window.__pt.obs(true));
      let r = simFrom(m, o), ln = landNode(r);
      let chosen = m;
      const target = e.to === 'EXIT' ? 0 : nav.hOf(e.to);
      if (!(ln != null && hLand(ln) <= target + 0.35)) {
        // 지금 상태에서 다른 매크로가 더 나은가
        let best = null, bc = hNow - 0.2;
        for (const mm of MACROS) {
          const rr = simFrom(mm, o), nn = landNode(rr);
          if (nn == null || nn === node) continue;
          const c = hLand(nn) + rr.frames / 60;
          if (c < bc) { bc = c; best = mm; }
        }
        if (best) { chosen = best; }
        else {
          // 움직이는 발판을 기다린다
          if (toPlat || onPlat || o.plats?.some((p) => p.kind !== 'F')) { waitN++; obs = await run(3, { room: true }); if (waitN % 120 === 119) { nav.penalize(node, e, 2); nav.plan(node); } return obs; }
          R.fails++; nav.penalize(node, e, 3); nav.plan(node); R.replans++;
          return obs;
        }
      }
      waitN = 0;
      // 실행
      R.macros++;
      const evs = chosen.events;
      let f = 0;
      const want = {};
      for (let i = 0; i < evs.length; i++) {
        Object.assign(want, evs[i].k);
        await keys({ ...want });
        const nextF = i + 1 < evs.length ? evs[i + 1].f : null;
        if (nextF == null) break;
        obs = await run(nextF - evs[i].f, { room: true, dead: true, scene: true, land: f > 0 });
        f = nextF;
        if (obs.room !== room || obs.p?.dead || !(obs.top === 'practice' || obs.top === 'stage') || obs.landed) break;
      }
      if (obs.room === room && !obs.p?.dead && !obs.landed) obs = await run(150, { land: true, room: true, dead: true, scene: true });
      await keys({});
      if (obs.room === room && obs.p) {
        const now = nav.nodeOf({ ...obs.p }, obs.p.plat);
        const exp = chosen === m ? e.to : null;
        if (exp != null && now !== exp && exp !== 'EXIT') {
          R.fails++;
          if (!(Number.isFinite(nav.hOf(now)) && nav.hOf(now) < hNow)) nav.penalize(node, e, 2);
          nav.plan(now ?? node); R.replans++;
        }
      }
      return obs;
    }
    async function swim(e) {
      const p = obs.p;
      const cx = p.x + p.w / 2, by = p.y + p.h;
      const n = e.to;
      let tx, ty;
      if (typeof n === 'string' && n[0] === 'W') { const i = +n.slice(1); tx = (i % nav.W) * TILE + TILE / 2; ty = (Math.floor(i / nav.W) + 1) * TILE; }
      else { const d = nav.decode(n); tx = d.tx * TILE + TILE / 2; ty = d.fy * TILE; }
      const want = {};
      if (tx - cx > 8) want.right = true; else if (tx - cx < -8) want.left = true;
      if (ty - by < -12) { if (p.vy > -60) { await keys({ ...want, jump: true }); obs = await run(1); } }
      else if (ty - by > 20) want.down = true;
      await keys(want);
      obs = await run(3, { room: true });
      await setKey('jump', false);
      if (++swimT % 600 === 0) { nav.penalize(nav.nodeOf(obs.p), e, 2); nav.plan(nav.nodeOf(obs.p)); }
      return obs;
    }
    async function unblock(node) {
      // 거울 스위치: 닿는 노드에 스위치가 있으면 그리로 가서 ▲ (상태가 바뀌면 격자 버전이 바뀌어 다시 계획)
      if (gsnap.switches.length) {
        const sw = gsnap.switches.map((q) => nav.key(q.tx, q.ty + 1)).filter((k) => nav.reached?.has(k));
        if (sw.length) {
          const tgt = sw[(R.swi = (R.swi ?? -1) + 1) % sw.length];
          // 스위치를 목표로 잠시 바꿔서 그리로 간다
          const goal0 = nav.goal;
          nav.goal = { exits: {}, door: { tx: nav.decode(tgt).tx, ty: nav.decode(tgt).fy - 1 }, arenaTx: null };
          nav.edges.clear(); nav.h = new Map();
          let hh = nav.plan(node);
          for (let k = 0; k < 400 && Number.isFinite(hh) && hh > 0; k++) {
            const cur = nav.nodeOf({ ...obs.p }, obs.p.plat);
            if (cur == null) { obs = await run(4); continue; }
            if (cur === tgt) break;
            const b = nav.best(cur); if (!b) break;
            if (b.e.walk != null && !b.e.macro) { const kk = b.e.walk > 0 ? 'right' : 'left'; await sprintSafe(kk); await keys({ [kk]: true }); obs = await run(3, { room: true }); }
            else obs = await doMacro(cur, b.e, nav.hOf(cur));
            if (!obs.p?.og) obs = await run(60, { land: true, room: true });
            if (obs.room !== room) break;
          }
          await keys({});
          obs = await tap('up', 3, 10);
          R.notes.push('거울 스위치 사용');
          nav.goal = goal0; nav.edges.clear(); nav.h = new Map();
          await rebuild();
          return true;
        }
      }
      // 부서지는 벽: 닿은 노드 옆의 BREAK 칸을 때린다
      const g = nav.grid;
      for (const n of nav.reached || []) {
        if (typeof n === 'string') continue;
        const { tx, fy } = nav.decode(n);
        for (const d of [-1, 1]) {
          if (g.typeAt(tx + d, fy - 1) === 3 || g.typeAt(tx + d, fy - 2) === 3) {
            const key = `${tx + d},${fy}`;
            if ((R.broke ??= new Set()).has(key)) continue;
            R.broke.add(key);
            // 그 노드로 가서 벽 쪽을 보고 공격
            nav.goal = { ...nav.goal, _tmp: n };
            R.notes.push(`부서지는 벽 (${tx + d},${fy - 1}) 공격 시도`);
            const a = nav.anchor(n);
            if (n !== node) return false;   // 간단화: 지금 서 있는 노드 옆만
            await align(a.x);
            await keys({ [d > 0 ? 'right' : 'left']: true }); obs = await run(1); await keys({});
            for (let k = 0; k < 6; k++) obs = await tap('attack', 2, 14);
            await rebuild();
            return true;
          }
        }
      }
      return false;
    }
    async function fight(o) {
      const p = o.p, b = o.boss;
      if (!b || b.pending || b.dead || !b.active || o.cut) { await keys({}); return run(6, { scene: true }); }
      const pcx = p.x + p.w / 2, bcx = b.x + b.w / 2;
      const dx = bcx - pcx, dy = (b.y + b.h / 2) - (p.y + p.h / 2);
      const dir = Math.sign(dx) || 1;
      const reach = 70 + (p.reach || 0) + b.w / 2;
      const want = {};
      const ft = fightT;
      if (Math.abs(dx) > reach * 0.85) want[dir > 0 ? 'right' : 'left'] = true;
      else if (p.facing !== dir) want[dir > 0 ? 'right' : 'left'] = true;
      if ((dy < -90 && p.og && ft % 6 === 0) || (!p.og && dy < -60 && p.vy > -100 && p.air > 0 && ft % 4 === 0)) want.jump = true;
      if (ft % 2 === 0 && Math.abs(dx) < reach * 1.4) want.attack = true;
      if (ft % 45 === 10 && p.mp > 30) want.skill1 = true;
      if (ft % 45 === 32 && p.mp > 30) want.skill2 = true;
      if (ft % 30 === 20) want.sub = true;
      await keys(want);
      const r = await run(3, { scene: true, room: true });
      await keys({ ...(want.right ? { right: true } : {}), ...(want.left ? { left: true } : {}) });
      return r;
    }
  } catch (e) {
    rep.errors.push('HARNESS ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
  }
  rep.pageErrors = [...new Set(s.errs)];
  rep.deaths = rep.rooms.reduce((a, r) => a + (r.deaths || 0), 0);
  rep.damage = rep.rooms.reduce((a, r) => a + (r.damage || 0), 0);
  try { rep.livesRefilled = await s.eval(() => window.__pt?.lives ?? 0); } catch { /* */ }
  rep.wallMs = Date.now() - t0;
  rep.completed = !!rep.clear?.cleared;
  for (const r of rep.rooms) { delete r.f0; delete r.d0; delete r.dmg0; if (r.trail && r.status === 'ok') delete r.trail; }
  await s.close();
  return rep;
}

// ── 실행 ──
const env = await openEnv();
const results = [];
const queue = stages.slice();
const t0 = Date.now();
async function worker() {
  while (queue.length) {
    const id = queue.shift();
    const r = await playStage(env, id);
    results.push(r);
    const bad = r.rooms.filter((x) => x.status !== 'ok');
    console.log(`${r.completed ? '✓' : '✗'} ${id} ${r.mode} rooms ${r.rooms.length} (${r.rooms.map((x) => `${x.room}:${x.status ?? '?'}`).join(' ')}) boss ${r.bossTime ?? '-'}s deaths ${r.deaths} clear=${r.clear?.cleared ?? '-'} ${Math.round(r.wallMs / 1000)}s${r.pageErrors.length ? ' PAGEERR ' + r.pageErrors.length : ''}${r.errors.length ? ' ERR ' + r.errors[0].slice(0, 120) : ''}`);
    for (const x of bad) console.log(`    ${x.room}: ${x.status} ${x.reason ?? ''} ${x.pos ? JSON.stringify(x.pos) : ''}`);
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, stages.length) }, worker));
await env.close();
results.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
const summary = {
  mode: GOD ? 'god' : 'normal', out: OUT, stages: results.length, completed: results.filter((r) => r.completed).map((r) => r.stage),
  failed: results.filter((r) => !r.completed).map((r) => r.stage),
  stuck: results.flatMap((r) => r.rooms.filter((x) => x.status === 'stuck').map((x) => `${r.stage}:${x.room}`)),
  died: results.flatMap((r) => r.rooms.filter((x) => x.status === 'died').map((x) => `${r.stage}:${x.room}`)),
  deaths: results.reduce((a, r) => a + r.deaths, 0), pageErrors: results.flatMap((r) => r.pageErrors.map((e) => `${r.stage}: ${e}`)),
  wallSec: Math.round((Date.now() - t0) / 1000),
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ summary, stages: results }, null, 1));
// 콘솔 표
const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + pad('stage', 6) + pad('mode', 7) + pad('clear', 6) + pad('rooms ok/all', 13) + pad('deaths', 7) + pad('boss s', 7) + pad('game s', 7) + 'problems');
for (const r of results) {
  const ok = r.rooms.filter((x) => x.status === 'ok').length;
  const probs = r.rooms.filter((x) => x.status !== 'ok').map((x) => `${x.room}:${x.status}`).join(' ') + (r.errors.length ? ' ' + r.errors.map((e) => e.slice(0, 60)).join(';') : '');
  console.log(pad(r.stage, 6) + pad(r.mode, 7) + pad(r.completed ? 'yes' : 'NO', 6) + pad(`${ok}/${r.rooms.length}`, 13) + pad(r.deaths, 7) + pad(r.bossTime ?? '-', 7) + pad(Math.round(r.gameTime), 7) + probs);
}
console.log(`\n${summary.completed.length}/${results.length} 스테이지 클리어 · stuck ${summary.stuck.length} · 페이지 오류 ${summary.pageErrors.length} · ${summary.wallSec}s → ${OUT}/report.json`);
if (flag('json')) console.log(JSON.stringify(summary));
