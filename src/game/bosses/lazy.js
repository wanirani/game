// 보스 늦게 받기 (R1-REQ-229 / platform §11 WP-8): 보스 클래스 모듈을 보스마다 동적 import() 로 받는 입구.
// 배포 번들러(tools/deploy/lib/bundle.mjs)는 정적 import 로 닿지 않고 import() 로만 닿는 모듈을 lazy 조각으로 나눈다.
// 이 파일은 보스 클래스 모듈을 정적으로 import 하지 않는다 → 이 파일만 쓰는 쪽(world.js·아케이드)은 첫 화면 바이트에서
// 보스 로직·벡터 그림(≈300 KB br)을 뺄 수 있다. bosses/index.js 는 지금처럼 모든 보스를 정적으로 싣는 '동기 대체 경로'로 남고,
// 불러와지면 자기 클래스를 여기 등록한다 (그러면 아래 createBoss 도 즉시 동기로 진짜 보스를 만든다).
//
// API
//   createBoss(world, id, x, y)  동기. 클래스가 있으면 진짜 보스, 아직 받는 중이면 PendingBoss(대역)를 돌려준다:
//                                대역은 무적·무해·보이지 않는 채로 기다리다가 클래스가 들어오면 world.entities·world.boss 에서
//                                진짜 보스로 스스로 바뀐다 (보스 등장 연출 동안이라 눈에 띄지 않는다). 세 번 실패하거나
//                                20초 안에 오지 않으면 GenericBoss (다시 받기는 1.5초 간격).
//   loadBoss(id) → Promise<class|null>   한 번만 받는다 (실패하면 최대 3번까지 다시 시도)
//   preloadBosses(ids) · preloadStageBosses(stageId) · loadAllBosses()   미리 받기 (월드맵·스테이지 진입·아케이드·도구)
//   bossLoaded(id) · knownBoss(id) · BOSS_IDS · registerBosses({id: class}) · forgetBoss(id) (시험용: 다시 늦게 받게)
// 스테이지에 들어서면(bus 'stageEntered') 그 스테이지의 보스를 스스로 미리 받는다 — main.js·월드맵이 먼저 불러도 된다.
import { BOSSES } from '../../data/bosses.js';
import { STAGES } from '../../data/stages.js';
import { bus } from '../../core/events.js';
import { Boss, GenericBoss } from './boss.js';

/** 보스 id → 클래스 모듈 받기 (import() 인자는 문자열 그대로여야 번들러가 조각으로 나눈다) */
const MODS = {
  b_nightwing: () => import('./a_nightwing.js').then((m) => m.Nightwing),
  b_banshee: () => import('./a_banshee.js').then((m) => m.Banshee),
  b_dullahan: () => import('./a_dullahan.js').then((m) => m.Dullahan),
  b_crimson: () => import('./a_crimson.js').then((m) => m.CrimsonArmor),
  b_bonedragon: () => import('./a_bonedragon.js').then((m) => m.BoneDragon),
  b_grimoire: () => import('./a_grimoire.js').then((m) => m.Grimoire),
  b_chimera: () => import('./a_chimera.js').then((m) => m.Chimera),
  b_leviathan: () => import('./b_leviathan.js').then((m) => m.Leviathan),
  b_colossus: () => import('./b_colossus.js').then((m) => m.Colossus),
  b_frostqueen: () => import('./b_frostqueen.js').then((m) => m.FrostQueen),
  b_death: () => import('./b_death.js').then((m) => m.Death),
  b_dracula: () => import('./b_dracula.js').then((m) => m.Dracula),
  b_chaos: () => import('./b_chaos.js').then((m) => m.ChaosLord),
  b_narkissa: () => import('./c_narkissa.js').then((m) => m.Narkissa),
  b_moloch: () => import('./c_moloch.js').then((m) => m.Moloch),
  b_dagon: () => import('./c_dagon.js').then((m) => m.Dagon),
  b_ziz: () => import('./c_ziz.js').then((m) => m.Ziz),
  b_mara: () => import('./d_mara.js').then((m) => m.Mara),
  b_behemoth: () => import('./d_behemoth.js').then((m) => m.Behemoth),
  b_nihil: () => import('./d_nihil.js').then((m) => m.Nihil),
};
export const BOSS_IDS = Object.freeze(Object.keys(MODS));

const REG = Object.create(null);    // id → class (받았거나 index.js 가 등록한 것)
const LOAD = new Map();             // id → { p: Promise|null, fails }
const MAX_FAILS = 3;
const RETRY = 1.5;                  // 대역: 실패 뒤 다시 받기까지 (게임 초)
const STALL = 20;                   // 대역: 이만큼 기다려도 안 오면 GenericBoss (게임 초)

/** 이미 불러온 클래스 등록 ({id: class}; 함수가 아닌 값은 건너뛴다) */
export function registerBosses(map) {
  for (const [id, C] of Object.entries(map ?? {})) if (typeof C === 'function') REG[id] = C;
}
/** 시험용: 등록을 지워 다음 createBoss 가 늦게 받는 길(대역)을 타게 한다 */
export function forgetBoss(id) { delete REG[id]; LOAD.delete(id); }
export const bossLoaded = (id) => typeof REG[id] === 'function';
export const knownBoss = (id) => Object.prototype.hasOwnProperty.call(MODS, id);

/** 보스 클래스 받기 → Promise<class|null> (이미 있으면 바로, 받는 중이면 같은 약속) */
export function loadBoss(id) {
  if (bossLoaded(id)) return Promise.resolve(REG[id]);
  if (!knownBoss(id)) return Promise.resolve(null);
  let st = LOAD.get(id);
  if (!st) { st = { p: null, fails: 0 }; LOAD.set(id, st); }
  if (st.p) return st.p;
  if (st.fails >= MAX_FAILS) return Promise.resolve(null);
  st.p = MODS[id]().then((C) => {
    st.p = null;
    if (typeof C === 'function') REG[id] = C;
    else st.fails = MAX_FAILS;   // 스텁(null) 클래스: 다시 받아도 같다 → 대역은 GenericBoss 로
    return REG[id] ?? null;
  }).catch((e) => {
    st.p = null; st.fails++;
    console.warn(`[bosses] ${id} 보스 모듈을 받지 못했습니다 (${st.fails}/${MAX_FAILS})`, e);
    return null;
  });
  return st.p;
}
export function preloadBosses(ids) { return Promise.all([...new Set(ids ?? [])].filter(Boolean).map((id) => loadBoss(id))); }
/** 스테이지의 보스(stage.boss 와 방마다 bossId)를 미리 받는다 */
export function stageBossIds(stageId) {
  const s = STAGES?.[stageId];
  if (!s) return [];
  const ids = [s.boss];
  for (const r of Object.values(s.rooms ?? {})) if (r?.bossId) ids.push(r.bossId);
  return [...new Set(ids.filter(Boolean))];
}
export function preloadStageBosses(stageId) { return preloadBosses(stageBossIds(stageId)); }
export function loadAllBosses() { return preloadBosses(BOSS_IDS); }

// 스테이지에 들어서면 그 스테이지 보스를 받기 시작 (순환 import 로 bus 가 아직 없을 수 있어 다음 틱에 붙인다: awaken.js 와 같은 방식)
if (typeof window !== 'undefined' && typeof setTimeout === 'function') {
  setTimeout(() => {
    try { bus.on('stageEntered', (e) => { if (e?.stageId) preloadStageBosses(e.stageId); }); } catch (err) { console.warn('[bosses] bus', err); }
  }, 0);
}

// ───────────────────────── 대역 (클래스를 받는 동안) ─────────────────────────
const OFF = { x: -99999, y: -99999, w: 1, h: 1 };
/** 클래스가 들어올 때까지 자리를 지키는 대역: 무적·무해·그리지 않음, 상태 'intro' (각성·필살기는 intro 보스를 기다린다) */
export class PendingBoss extends Boss {
  init() { this.pendingBoss = true; this.invuln = true; this.harmless = true; this.noGravity = true; this.waitT = 0; this.retryT = 0; this.alpha = 0; }
  hurtboxes() { return []; }
  hitParts() { return []; }
  contactParts() { return []; }
  hurtbox() { return OFF; }
  takeHit() { return false; }
  update(dt, world) {
    this.t += dt; this.waitT += dt; this.animT += dt;
    if (this.dead) return;
    const id = this.id;
    if (bossLoaded(id)) { this.become(REG[id], world); return; }
    const st = LOAD.get(id);
    // 세 번 실패했거나, 받기가 끝나지 않은 채 STALL 초가 지나면 (멈춘 망: 약속이 영영 안 끝남) GenericBoss — 잠긴 투기장에 보스 없이 갇히지 않게
    if (!knownBoss(id) || (st && !st.p && st.fails >= MAX_FAILS) || this.waitT > STALL) { this.become(GenericBoss, world); return; }
    // 실패 뒤 다시 시도: RETRY 초 간격 (흔들리는 모바일 망에서 세 번을 한꺼번에 다 쓰지 않게)
    if (!st?.p && (this.retryT -= dt) <= 0) { this.retryT = RETRY; loadBoss(id); }
  }
  /** 진짜 보스로 바뀐다: 같은 자리·같은 데이터로 만들어 world.entities 와 world.boss 에서 자리를 바꾼다 */
  become(C, world) {
    const w = world ?? this.world;
    let real;
    try { real = new C(w, this.def, this.x + this.w / 2, this.y + this.h); } catch (e) {
      if (C === GenericBoss) throw e;
      console.error(`[bosses] ${this.id} 보스를 만들지 못했습니다`, e);   // 받은 모듈이 깨졌으면 매 프레임 오류 대신 대체 보스로
      real = new GenericBoss(w, this.def, this.x + this.w / 2, this.y + this.h);
    }
    const E = w.entities, i = E ? E.indexOf(this) : -1;
    if (i >= 0) { E[i] = real; real.world = w; } else w.add?.(real);
    if (w.boss === this) w.boss = real;
    this.dead = true;
    return real;
  }
  draw() {}
  lights() {}
}

/** 보스 만들기 (동기). 클래스가 아직 없으면 받기를 시작하고 대역을 돌려준다 */
export function createBoss(world, id, x, y) {
  const def = BOSSES[id] || { id, name: id, hp: 800, atk: 20, size: { w: 120, h: 140 } };
  const C = REG[id];
  if (C) return new C(world, def, x, y);
  if (!knownBoss(id)) return new GenericBoss(world, def, x, y);
  loadBoss(id);
  return new PendingBoss(world, def, x, y);
}
