// Node 결투장 — 초월·비전 특성(class_perks*.js)을 진짜 코드로 재는 대본 싸움 (classes_t3 §2.8 · §11.2, QA-ASC)
//
// 브라우저 없이 Node 에서 진짜 Player(constructor·refreshStats·tickTimers·physics·startMove/updateMove·startDash·doJump·
// groundPound·trySkill·takeHit·heal) 와 진짜 combat.hitTarget → impact → World.onPlayerHit / onEnemyKilled 경로를 돌린다.
// 월드는 Object.create(World.prototype) 에 필요한 필드만 채운 가짜(방 하나: 평평한 바닥 TileMap, 렌더·조명·파티클·카메라·소리 없음).
// 적은 진짜 Enemy('zombie') 허수아비 (AI 없음, 무게 FIXED — 넉백·띄우기·다운 상태가 쌓이지 않게, 약점·저항 없음).
// 특성 훅(onAttack·onHit·onKill·tick·onSwing·onSkill·onDash·onDashEnd·onJump·onLand·onPound·onHurt·afterHurt·onLethal·keepCombo·
// healMul·onOverheal·dmgMul…)·procStrike·표식·결계·SkillFx·투사체는 모두 게임 코드 그대로 돈다 (K = skills.js FXKIT).
//
// 대본 (PERKS-A..D 의 브라우저 탐침 scratchpad/p?/bal.mjs 와 같은 뜻, 고정 스텝 1/60 s, 시드 난수):
//   기본 공격 연타(지상 콤보, 연결 창마다) · 공용 스킬 1개 재사용 대기마다 (MP 채움) · 비전 액티브 재사용마다 (비전 'on' 만)
//   · 2초마다 적 1타 (기준 2차 직업에게 최대 HP 8 % 가 되도록 맞춘 공격력, 진짜 computeDamage — 방어·피해 감소·결계·회피가 든다)
//   · 대본 옵션: dash n초마다 대시 · dashAtk n초마다 대시 공격 · jump n초마다 점프(+공중 점프) · dive n초마다 점프→공중 점프→급강하
//   · 모드: mob(허수아비 1, HP 1e7) · pack(3) · boss(1, kind 'boss') · kill(3, 진짜 체력 — 죽으면 0.5초 뒤 같은 자리에 새로) ·
//     calm(mob 과 같되 피격 없음: 무피격 연속 보너스·총왕 등)
// 결과: dmg(영웅 소유 공격이 준 피해 합) · procDmg · kills · hits(피격 수) · hpUsed(소모 HP = 시작−끝+되채움) · refills · deaths ·
//       maxHp · perkErrors · procs(p._pk.cnt)
import { World } from '../../../src/game/world.js';
import { Player } from '../../../src/game/player.js';
import { Enemy } from '../../../src/game/enemy.js';
import { TileMap } from '../../../src/game/tilemap.js';
import { hitTarget } from '../../../src/game/combat.js';
import { IMPACT_DEBUG } from '../../../src/game/impact.js';
import * as PERK from '../../../src/game/class_perks.js';
import '../../../src/game/skills.js';   // K 채우기 (bindPerkKit)
import { getDiff } from '../../../src/data/difficulty.js';
import { CHARACTERS } from '../../../src/data/characters.js';
import { CLASSES } from '../../../src/data/classes.js';
import { ASCENSIONS } from '../../../src/data/ascensions.js';
import { SKILLS } from '../../../src/data/skills.js';
import { newHero } from '../../../src/game/progression.js';
import { computeStats } from '../../../src/game/stats.js';
import { makeItem, baseIdFor } from '../../../src/data/items.js';
import { DOCS as ALL_DOCS } from '../../../src/data/lore.js';

export const DT = 1 / 60;
const TILE = 48;
/** 영웅별 공용 스킬 (PERKS-A..D 탐침과 같은 것) */
export const COMMON_SKILL = {
  kael: 'kael_vigilia', sera: 'sera_holy_bolt', victor: 'victor_fanning', bran: 'bran_ground_split',
  lia: 'lia_cross_cut', azel: 'azel_moon_slash', isolde: 'isolde_piercing_gale',
};
/** 항목별 대본 옵션 (PERKS-A..D 탐침의 E 표 + 이 도구에서 더한 것: blackwing 점프) */
//  dashBack: 대시 출발 위치 = 허수아비 왼쪽 끝에서 몇 px 뒤 (기본 150 — 허수아비를 지나쳐 달린다; 0 = 싸우던 자리에서 —
//  잔상·안개를 그 자리에 남기는 그림자 화신·밤의 군주의 '제자리 싸움' 최악의 경우, PERKS-C 탐침과 같다)
export const SCRIPT = {
  victor_specter: { dash: 1.5 }, victor_silverwolf: { dash: 2 }, bran_vanguard: { dash: 2 },
  lia_umbra: { dash: 1.5, dashBack: 0 }, azel_nightlord: { dash: 1.5, dashBack: 0 },
  isolde_skysovereign: { dive: 2.5 }, isolde_dragonbond: { dive: 2.5 }, isolde_abyssdragoon: { dashAtk: 2 },
  kael_blackwing: { jump: 3 },
};
/** 허수아비까지 간격(px, 영웅 오른쪽 끝 → 허수아비 왼쪽 끝): 무기마다 기본 콤보 판정이 허수아비 몸통에 닿는 거리.
 *  채찍·창은 끝(tip)에서 터지는 효과(이단심문관 화염 폭발 등)가 맞도록 멀리, 총은 탐침과 같은 140 */
export const GAP = { whip: 95, sword: 35, greatsword: 45, dagger: 12, gun: 140, spear: 85, staff: 40 };

// ─────────────────────────── 소음 없는 대역 ───────────────────────────
/** 무엇을 부르든·읽든 자기 자신을 돌려주는 함수 대역 (fx·카메라·조명·소리·hitfx). 숫자 필드는 base 에서 */
export function noop(base = {}) {
  const fn = function () { return P; };
  const P = new Proxy(fn, {
    get(t, k) {
      if (k in base) return base[k];
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'then') return undefined;   // await 대상으로 오해받지 않게
      return P;
    },
    set(t, k, v) { base[k] = v; return true; },
    apply() { return P; },
    construct() { return P; },
    has(t, k) { return true; },
  });
  return P;
}
const HFX_STUB = noop({});

/** mulberry32 시드 난수 */
export function seeded(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ─────────────────────────── 영웅 모형 ───────────────────────────
/**
 * 시험 영웅: newHero(level) · 직업 classId · asc · 장비 모형 gear:
 *   'table' (기본) = tools/balance.mjs 기준 실행의 2부 끝 모형 — 7단계 희귀도 4, 무기 +12 · 몸통 +8 · 머리 +6 · 망토, 장신구·비전서 없음
 *   'max'          = balance.mjs --ng 모형 — 위 + 장신구 둘 + 비전서 전부
 * 옵션 추첨은 seed 로 고정 → 같은 seed 면 변형끼리 같은 장비.
 */
export function buildHero(charId, classId, asc, level, seed = 1, { skills = [], gear = 'table' } = {}) {
  const real = Math.random;
  Math.random = seeded(seed * 7919 + level);
  try {
    const ch = CHARACTERS[charId];
    const h = newHero(charId, level);
    h.classId = classId; h.asc = asc ?? null;
    if (asc) { h.ascUnlocked = [asc]; h.trials = { [`tr_${charId}_1`]: { done: true }, [`tr_${charId}_2`]: { done: true } }; }
    const inv = [];
    const put = (slot, id, opts) => { const it = id && makeItem(id, opts); if (it) { inv.push(it); h.equip[slot] = it.uid; } };
    put('weapon', baseIdFor('weapon', 7, { wtype: ch.weaponType }), { rarity: 4, level: 12 });
    put('body', baseIdFor('body', 7), { rarity: 4, level: 8 });
    put('head', baseIdFor('head', 7), { rarity: 4, level: 6 });
    put('cloak', baseIdFor('cloak', 7), { rarity: 4 });
    if (gear === 'max') { put('acc1', baseIdFor('acc', 7, { variant: 0 }), { rarity: 4 }); put('acc2', baseIdFor('acc', 7, { variant: 1 }), { rarity: 4 }); }
    h.skills = {}; h.slots = [null, null, null, null];
    skills.filter(Boolean).forEach((id, i) => { h.skills[id] = 1; if (i < 4) h.slots[i] = id; });
    // arcade: true → 수호신 오라 제외 (동료 없음) — balance.mjs 와 같다
    const state = {
      charId, difficulty: 'normal', inventory: inv, heroes: { [charId]: h }, arcade: true,
      progress: { docs: gear === 'max' ? Object.keys(ALL_DOCS) : [], flags: { p2_done: true }, bosses: [], secrets: [], lootQueue: [] },
      stats: { kills: 0, maxCombo: 0 }, bestiary: {}, score: 0, lives: 3,
    };
    return { state, hero: h };
  } finally { Math.random = real; }
}
/** 능력치 (시드 n개 평균 — 옵션 추첨 편차 줄이기) */
export function avgStats(charId, classId, asc, level, seeds = 5, gear = 'table') {
  const runs = Array.from({ length: seeds }, (_, k) => { const { state, hero } = buildHero(charId, classId, asc, level, 101 + k, { gear }); return computeStats(state, hero); });
  const s = { ...runs[0] };
  for (const k of Object.keys(s)) if (typeof s[k] === 'number') s[k] = runs.reduce((a, r) => a + (r[k] ?? 0), 0) / runs.length;
  return s;
}

// ─────────────────────────── 가짜 월드 ───────────────────────────
const ROOM_W = 48, ROOM_H = 12, FLOOR_TY = 10;
const ROOM = (() => {
  const rows = [];
  for (let y = 0; y < ROOM_H; y++) rows.push(y >= FLOOR_TY ? '#'.repeat(ROOM_W) : '#' + ' '.repeat(ROOM_W - 2) + '#');
  return { id: 'arena', map: rows, enemies: {} };
})();
export const FLOOR_Y = FLOOR_TY * TILE;
const ARENA_TRIAL = Object.freeze({ id: '__arena' });   // onEnemyKilled: 경험치·전리품·동료 몫 없음 (시련과 같은 길)

function makeGame() {
  const G = {
    time: 0, debug: false, viewW: 960, viewH: 540, quality: 'high', settings: { quality: 'high', showDamage: false, flashFx: false, shake: 0 },
    toast() {}, flash() {}, vignette() {}, flashCapped() {}, push() {}, go() {}, audio: noop({}), cssScale: 1, uiK: 1,
  };
  return new Proxy(G, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? noop({}) : undefined) });
}

export function makeWorld(state, level) {
  const w = Object.create(World.prototype);
  const game = makeGame();
  Object.assign(w, {
    game, state, stage: { id: 'arena', level, name: 'arena', rooms: { arena: ROOM } }, mode: 'story', diff: getDiff('normal'),
    rules: null, trial: ARENA_TRIAL, ng: 0, rng: null, hero: state.heroes[state.charId],
    camera: noop({ x: 0, y: 0, vw: 960, vh: 540, zoom: 1, bounds: null, focus: null }), fx: noop({ quality: 1, list: [], max: 1400 }),
    lighting: noop({ res: 0.5 }), bg: noop({}), tiles: null,
    entities: [], platforms: [], debrisList: [], debugRects: [], time: 0, hitstop: 0, slowmo: 0, timeStop: 0,
    cutscene: false, inputLock: false, transitioning: false, boss: null, bossActive: false, arena: null, cleared: false, clearT: 0,
    combo: { n: 0, t: 0, max: 0, best: 0, dmg: 0 }, banner: null, nextExtraLife: Infinity, noExtraLives: true,
    run: { hp: null, mp: null, hearts: 99, lives: 3, score: 0, sp: 0, sub: 'dagger', time: 0, kills: 0, secrets: 0, damageTaken: 0, hits: 0, continues: 3, docsFound: [], saintUsed: false, checkpoint: null, aw: 0 },
    player: null, rt: 0, slowmoScale: 0.35, slowScaleT: 0, killSlowT: 1e12, killChain: { n: 0, t: -9 }, freezeEnemies: false,
    freezeLog: [], frozenRecent: 0, overlays: [], hudHidden: false, letterbox: 0, backingLayer: true, roomFoes: 0, killPend: [],
    style: null, awakenState: { ready: false, holdK: 0 }, bossPhaseSeen: null, bossPhaseOf: null, gimmick: null, companions: null,
    map: new TileMap(ROOM), roomId: 'arena', room: ROOM,
  });
  w.breakTilesIn = () => {};
  w.gainExp = () => 0;
  w.spawnPickup = () => null;
  w.onPlayerDeath = () => {};
  w.onPlayerFell = () => {};
  w.startUltimate = () => {};
  w.addOverlay = (o) => o;
  return w;
}

// ─────────────────────────── 한 판 ───────────────────────────
/**
 * o: { charId, classId, asc (null = 2차 그대로), variant 'base'|'off'|'on', mode, secs, seed, level, enemyAtk?, script?, skill? }
 * variant: base = asc 없음 · off = asc 능력치만 (그 asc 의 특성 항목을 등록부에서 뺌) · on = asc 전체 (비전은 액티브도 시전)
 * mode 'siege': 공격하지 않고 서서 1.2초마다 맞기만 한다 (기준 2차에게 1타 6 %) → 쓰러질 때까지 받아 낸 적 공격력 합(ehp) —
 *   결계·피해 감소·회피·치명상 무효(onLethal)·재생처럼 '맞는 쪽' 생존력만 (흡혈·적중 회복 같은 공격 쪽 회복은 빠진다)
 */
export function fight(o) {
  const { charId, classId, asc = null, variant = 'on', mode = 'mob', seed = 1, level = 80 } = o;
  const siege = mode === 'siege';
  const secs = siege ? (o.siegeSecs ?? 150) : (o.secs ?? 40);
  const S = siege ? {} : { ...(SCRIPT[asc] ?? {}), ...(o.script ?? {}) };
  const skill = siege ? null : o.skill === undefined ? COMMON_SKILL[charId] : o.skill;
  const A = asc ? ASCENSIONS[asc] : null;
  const active = !siege && variant === 'on' && A?.kind === 'hidden' ? A.skill : null;
  const realRandom = Math.random, realWarn = console.warn, realErr = console.error;
  const errs = [];
  console.warn = (...a) => errs.push(['warn', String(a[0]).slice(0, 160)]);
  console.error = (...a) => errs.push(['error', String(a[0]).slice(0, 160) + (a[1]?.message ? ' ' + a[1].message : '')]);
  const err0 = PERK.PERK_STATS.errors;
  try {
    // 등록부: off 는 그 asc 항목만 뺀다 (char·0~2차 항목은 그대로)
    if (variant === 'off' && asc) { const R = { ...PERK.perkRegistry() }; delete R[asc]; PERK.setPerkRegistry(R); }
    else PERK.setPerkRegistry(null);
    const { state, hero } = buildHero(charId, classId, variant === 'base' ? null : asc, level, seed, { gear: o.gear ?? 'table', skills: [skill ?? COMMON_SKILL[charId], A?.kind === 'hidden' && variant === 'on' ? A.skill : null] });
    Math.random = seeded(seed * 104729 + 17);
    IMPACT_DEBUG.useHitfx(HFX_STUB);
    const w = makeWorld(state, level);
    globalThis.__game = { world: w };
    const p = new Player(w, state, hero);
    w.player = p; w.entities.push(p);
    p.facing = 1; p.x = 6 * TILE; p.y = FLOOR_Y - p.h; p.onGround = true;
    p.hp = p.stats.hp; p.mp = p.stats.mp;
    // ── 허수아비 ──
    const D = [];
    const nT = mode === 'pack' || mode === 'kill' ? 3 : 1;
    // kill 모드 체력: 기준 2차 영웅 공격력 × 25 (2부 끝 일반 적처럼 기본 콤보 몇 번에 쓰러진다 — 처형·처치 특성이 돈다). 변형끼리 같은 값
    const killHp = o.killHp ?? Math.round(25 * Math.max(p.stats.atk ?? 0, p.stats.mag ?? 0));
    const gap = o.gap ?? GAP[CHARACTERS[charId].weaponType] ?? 40;
    const baseX = p.x + p.w + gap;
    const BOSS = o.boss ?? null;   // 시련 길이 모형: { stats (보스 능력치·체력·약점), rules (시련 규칙), enemyLevel }
    if (BOSS?.rules) w.rules = { ...BOSS.rules };
    const dummyAt = (i) => {
      const e = new Enemy('zombie', baseX + 20 + i * 50, FLOOR_Y, { level: BOSS?.enemyLevel ?? level, diff: w.diff, facing: -1 });
      e.wclass = 'FIXED'; e.stats.weak = []; e.stats.resist = []; e.stats.immune = [];
      const H = mode === 'kill' ? killHp : 1e7;
      e.hp = e.stats.maxHp = e.stats.hp = H;
      if (BOSS) { e.stats = { ...e.stats, ...BOSS.stats }; e.hp = e.stats.maxHp; }
      e.update = function (dt) { this.t += dt; this.stun = 0; if (this.dying > 0) { this.dying -= dt; if (this.dying <= 0) this.dead = true; } };
      e.harmless = true; e.onGround = true;
      if (mode === 'boss') e.kind = 'boss';
      w.add(e);
      wrapTake(e, onTake);
      D[i] = e;
      return e;
    };
    // ── 기록 ──
    let dmg = 0, procDmg = 0, kills = 0, hits = 0, refills = 0, deaths = 0, hpAdded = 0, taken = 0, lethalPart = 0, died = false, diedAt = null;
    const onTake = (e, d0, atk) => { if (atk?.owner === p || atk?.owner?.owner === p) { dmg += d0; if (atk.proc) procDmg += d0; } };
    for (let i = 0; i < nT; i++) dummyAt(i);
    // 적 공격력: 기준 2차 영웅에게 1타 = 최대 HP 8 % (포위전 6 %) — 호출부가 enemyAtk 를 주면 그 값 (변형끼리 같은 값)
    const enemyAtk = o.enemyAtk ?? (BOSS ? BOSS.stats.atk : calibAtk(p.stats, siege ? 0.06 : 0.08));
    let killTime = null;
    const tk = p.takeHit;
    p.takeHit = function (d, atk, ww, info) {
      const h0 = this.hp;
      const r = tk.call(this, d, atk, ww, info);
      const lost = Math.max(0, h0 - Math.max(0, this.hp));
      taken += lost;
      if (siege && this.dead && !died) { died = true; diedAt = w.time; lethalPart = lost > 0 ? h0 / lost : 0; }
      return r;
    };
    const hp0 = p.hp;
    const respawn = [];
    // ── 첫 방 입장 (prewarm · onEnter · PerkLayer) ──
    PERK.perkEnter(w);
    const T = Math.round(secs / DT);
    let nextHurt = 1, nextDash = S.dash ?? Infinity, nextDashAtk = S.dashAtk ?? Infinity, nextJump = S.jump ?? Infinity, nextDive = S.dive ?? Infinity;
    let air = null;   // { kind:'jump'|'dive', t, stage } | { dashAtk: true }
    const ms = p.moveSet;
    for (let f = 0; f < T; f++) {
      if (siege && died) break;
      if (BOSS && (D[0].hp <= 0 || D[0].dying > 0 || D[0].dead)) { killTime = w.rt; break; }
      const tw = f * DT;
      w.rt += DT; w.game.time += DT;
      if (w.hitstop > 0) { w.hitstop -= DT; continue; }
      w.slowmo = 0;
      w.time += DT;
      // 처치된 허수아비 다시 세우기 (kill 모드: 0.5초 뒤)
      for (let i = 0; i < D.length; i++) {
        const e = D[i];
        if ((e.dead || e.dying > 0 || e.hp <= 0) && !respawn[i]) { respawn[i] = tw + 0.3; kills++; }
        if (respawn[i] && tw >= respawn[i]) { e.dead = true; respawn[i] = 0; dummyAt(i); }
      }
      // ── 영웅 ──
      if (p.dead) { deaths++; hpAdded += p.stats.hp; p.dead = false; p.deathT = 0; p.hp = p.stats.hp; p.iframes = 1; }
      p.t += DT; p.animT += DT;
      p.tickTimers(DT, w);
      const target = D.find((e) => !e.dead && !(e.dying > 0)) ?? D[0];
      if (p.hurtT > 0) { p.hurtT -= DT; p.physics(DT, w); }
      else if (siege) { p.physics(DT, w); }
      else {
        // 대시 진행 (Player.update 의 대시 갈래 그대로)
        if (p.dashT > 0) {
          p.dashT -= DT; p.vx = p.facing * p.dashSpeed; p.vy = p.dashAir ? 0 : p.vy;
          if (p.dashT <= 0) {
            p.vx *= 0.5; p.lastDashEnd = p.t;
            if (p.perks?.onDashEnd) PERK.firePerks(p.perks.onDashEnd, p, w);
            if (air?.dashAtk) { p.startMove(w, ms.dash ?? ms.ground[0], 'dash'); air = null; }
          }
        }
        // 대본 행동
        const free = !p.move || p.moveT * p.atkSpeedMul >= (p.move.cancel ?? p.move.dur);
        if (!air && p.onGround && p.dashT <= 0 && tw >= nextDive) {
          nextDive += S.dive; p.endMove(); p.doJump(w, false); air = { kind: 'dive', t: tw, stage: 0 };
        } else if (!air && p.onGround && p.dashT <= 0 && tw >= nextJump) {
          nextJump += S.jump; p.endMove(); p.doJump(w, false); air = { kind: 'jump', t: tw, stage: 0 };
        } else if (!air && p.dashT <= 0 && p.dashCool <= 0 && tw >= nextDash) {
          nextDash += S.dash; if ((S.dashBack ?? 150) > 0) p.x = target.x - (S.dashBack ?? 150) - p.w; if (p.move) p.endMove(); p.startDash(1, w);
        } else if (!air && p.dashT <= 0 && p.dashCool <= 0 && tw >= nextDashAtk) {
          nextDashAtk += S.dashAtk; p.x = target.x - 200 - p.w; if (p.move) p.endMove(); p.startDash(1, w); air = { dashAtk: true };
        }
        if (air?.kind) {
          const at = tw - air.t;
          if (air.stage === 0 && at > 0.22) { air.stage = 1; p.doJump(w, true); }
          if (air.kind === 'dive' && air.stage === 1 && at > 0.42 && ms.down) { air.stage = 2; p.startMove(w, ms.down, 'down'); }
          if (air.kind === 'jump' && air.stage >= 1 && !p.move && ms.air?.[0]) p.startMove(w, ms.air[0], 'air');
          if (p.onGround && at > 0.1) air = null;
        } else if (!air?.dashAtk && p.dashT <= 0) {
          // 스킬 (재사용마다, MP 채움): 비전 액티브 먼저
          for (const sid of [active, skill]) {
            if (!sid || (p.skillCd[sid] ?? 0) > 0 || !free) continue;
            p.mp = p.stats.mp;
            const cd0 = p.skillCd[sid] ?? 0;
            p.trySkill(w, sid);
            if ((p.skillCd[sid] ?? 0) > cd0) break;
          }
          // 기본 공격 연타 (handleAttackInput 의 지상 콤보 갈래)
          if (!p.move) { p.chain = 0; p.startMove(w, ms.ground[0], 'ground'); }
          else if (p.chainKind && p.moveT * p.atkSpeedMul >= (p.move.cancel ?? p.move.dur) && ms[p.chainKind]?.[p.chain + 1] && !p.move.finisher) {
            p.chain++; p.startMove(w, ms[p.chainKind][p.chain], p.chainKind);
          }
        }
        p.physics(DT, w);
        p.updateMove(DT, w);
      }
      // 땅에 있을 때는 제자리 (넉백·돌진 반동을 지운다: 탐침과 같이 허수아비 앞에 붙여 둔다)
      if (p.onGround && p.dashT <= 0 && !air) { p.x = target.x - gap - p.w; p.vx = 0; p.facing = 1; }
      // ── 피격: 2초마다 (calm 없음 · siege 1.2초마다) ──
      if (mode !== 'calm' && tw >= nextHurt) {
        nextHurt += siege ? 1.2 : 2;
        if (!siege && p.hp < p.stats.hp * 0.35) { hpAdded += p.stats.hp - p.hp; p.hp = p.stats.hp; refills++; }
        const src = target;
        const atk = { team: 'enemy', owner: src, stats: { ...src.stats, atk: enemyAtk, crit: 0, critDmg: 0 }, mv: BOSS ? 1.2 : 1, type: 'phys', element: null, dir: -1, kb: [60, -60], hitstop: 0, shake: 0, hitId: 'arena' + f, tags: ['contact'] };
        hits++;
        hitTarget(w, atk, p, p.cx, p.cy);
      }
      // ── 다른 개체 (SkillFx · 투사체 · PerkLayer · 허수아비) ──
      for (let i = 0; i < w.entities.length; i++) {
        const e = w.entities[i];
        if (e === p || e.dead) continue;
        e.update(DT, w);
      }
      if (w.entities.some((e) => e.dead && e !== p)) {
        for (const e of w.entities) if (e.dead && e !== p) e.onRemove?.(w);
        w.entities = w.entities.filter((e) => !e.dead || e === p);
      }
      if (w.combo.n > 0) { w.combo.t -= DT; if (w.combo.t <= 0) w.endCombo(); }
      w.killPend.length = 0;
    }
    // 회복 합 = 끝 HP − 시작 HP + 잃은 HP − 되채운 HP (흡혈·재생·특성 회복 모두)
    const healed = Math.max(0, p.hp - hp0 + taken - hpAdded);
    const time = siege ? (diedAt ?? w.time) : w.time;
    const out = {
      dmg: Math.round(dmg), procDmg: Math.round(procDmg), kills, hits, refills, deaths, killHp, killTime: killTime == null ? null : +killTime.toFixed(2),
      taken: Math.round(taken), healed: Math.round(healed), maxHp: Math.round(p.stats.hp), enemyAtk, time: +time.toFixed(2),
      // 포위전: 쓰러지기까지 받아 낸 공격 수 (마지막 1타는 남은 HP 비율만큼) × 적 공격력 = 같은 적에게 버틴 양
      ehp: siege ? Math.round(enemyAtk * ((died ? hits - 1 : hits) + (died ? lethalPart : 0))) : null, survived: siege ? !died : null,
      perkErrors: PERK.PERK_STATS.errors - err0, perkLast: PERK.PERK_STATS.errors > err0 ? PERK.PERK_STATS.last : null,
      warns: errs.length, warnSample: errs.slice(0, 3), procs: { ...(p._pk?.cnt ?? {}) },
    };
    return out;
  } finally {
    Math.random = realRandom; console.warn = realWarn; console.error = realErr;
    PERK.setPerkRegistry(null);
    IMPACT_DEBUG.useHitfx(null);
    globalThis.__game = undefined;
  }
}
/** 1타 = 최대 HP 8 % 가 되는 적 공격력 (computeDamage 의 방어·피해 감소 식, 난수 ±8 % 의 평균 1) */
export function calibAtk(s, frac = 0.08) {
  const k = 100 / (100 + Math.max(0, s.def ?? 0) * 1.2) * (1 - Math.min(75, Math.max(0, s.dmgReduce ?? 0)) / 100);
  return Math.max(1, Math.round(s.hp * frac / Math.max(0.05, k)));
}
function wrapTake(e, cb) {
  const th = e.takeHit.bind(e);
  e.takeHit = (d, atk, ww, info) => { const h0 = e.hp; const r = th(d, atk, ww, info); cb(e, Math.max(0, h0 - Math.max(0, e.hp)), atk); return r; };
}

/**
 * 대본 결과 묶음: 모드마다 변형 base/off/on × 시드 → 합.
 * 반환 rows[mode] = { dmg{base,off,on}, proc{off,on}, kills, taken, healed, maxHp, ehp (siege), errors, warns, procs }
 * 비율은 ratios(row) 로: stat = off/base, sig = on/off, tot = on/base (피해) · ehp 같은 식 (siege) · mit = 받은 피해(최대 HP 비율) 역수 비
 */
export function measure({ charId, classId, asc, modes = ['mob', 'pack', 'boss', 'kill', 'calm', 'siege'], seeds = [1, 2], secs = 40, level, onRun }) {
  const lv = level ?? ASCENSIONS[asc]?.arcade?.lv ?? 80;
  const rows = {};
  for (const mode of modes) {
    const acc = { base: [], off: [], on: [] };
    for (const seed of seeds) {
      const b = fight({ charId, classId, asc, variant: 'base', mode, secs, seed, level: lv });
      acc.base.push(b);
      acc.off.push(fight({ charId, classId, asc, variant: 'off', mode, secs, seed, level: lv, enemyAtk: b.enemyAtk, killHp: b.killHp }));
      acc.on.push(fight({ charId, classId, asc, variant: 'on', mode, secs, seed, level: lv, enemyAtk: b.enemyAtk, killHp: b.killHp }));
      onRun?.(mode, seed);
    }
    const sum = (L, k) => L.reduce((a, r) => a + (r[k] ?? 0), 0);
    const V = (k) => ({ base: sum(acc.base, k), off: sum(acc.off, k), on: sum(acc.on, k) });
    const all = [...acc.base, ...acc.off, ...acc.on];
    rows[mode] = {
      dmg: V('dmg'), proc: V('procDmg'), kills: V('kills'), taken: V('taken'), healed: V('healed'), maxHp: V('maxHp'), time: V('time'),
      ehp: mode === 'siege' ? V('ehp') : null, survived: mode === 'siege' ? { base: acc.base.every((r) => r.survived), off: acc.off.every((r) => r.survived), on: acc.on.every((r) => r.survived) } : null,
      deaths: V('deaths'), errors: sum(all, 'perkErrors'), perkLast: all.map((r) => r.perkLast).find(Boolean) ?? null,
      warns: sum(all, 'warns'), warnSample: all.flatMap((r) => r.warnSample).slice(0, 3), procs: acc.on[0]?.procs ?? {},
    };
  }
  return { asc, charId, classId, level: lv, seeds: seeds.length, secs, rows };
}
/** 한 모드 행의 비율 (1 = 같음) */
export function ratios(r) {
  const q = (a, b) => (b > 0 ? a / b : a > 0 ? Infinity : 1);
  if (r.ehp) return { stat: q(r.ehp.off, r.ehp.base), sig: q(r.ehp.on, r.ehp.off), tot: q(r.ehp.on, r.ehp.base) };
  const tn = (v) => (r.maxHp[v] > 0 ? r.taken[v] / r.maxHp[v] : 0);
  const hs = (v) => (r.maxHp[v] > 0 && r.time[v] > 0 ? r.healed[v] / r.maxHp[v] / r.time[v] : 0);   // 초당 회복 (최대 HP 비율)
  return {
    stat: q(r.dmg.off, r.dmg.base), sig: q(r.dmg.on, r.dmg.off), tot: q(r.dmg.on, r.dmg.base),
    procShare: q(r.proc.on - r.proc.off, r.dmg.off),
    mitSig: q(tn('off'), tn('on')), mitTot: q(tn('base'), tn('on')),
    hpsBase: hs('base'), hpsOff: hs('off'), hpsOn: hs('on'),
  };
}
/** 그 영웅의 asc 가 비교할 2차 직업 (초월 = parent, 비전 = parents[0]) */
export function parentOf(asc) {
  const A = ASCENSIONS[asc];
  return A ? (A.parent ?? A.parents?.[0] ?? null) : null;
}
export function ascIdsOf(kind = 'all') {
  return Object.values(ASCENSIONS).filter((A) => kind === 'all' || A.kind === kind).map((A) => A.id);
}
export { ASCENSIONS, CLASSES, SKILLS };
