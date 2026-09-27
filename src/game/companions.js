// 동료 런타임 — owner: CMP-SYS (companions §4–§7.4, §12.4; world2 §14; MASTER_PLAN §1.2, §1.7, §1.14)
//
//  class CompanionSystem            world.companions (World 생성자에서 loadRoom 전에 만든다)
//    active                         스토리·마을 월드에서만 true (아케이드·보스 러시·서바이벌·연습·아케이드 세이브는 false)
//    onRoomLoaded(roomId)           감독(CompanionDirector) 추가, 수호신을 기준점에 다시 배치, 탈것 다시 태우기(p.mount.onRoomLoaded)
//    sync(force)                    편성 키(loadoutKey)가 바뀌면 수호신을 다시 만들고 탈것(MountRider)을 붙이거나 뗀다 (메뉴가 장착을 바꾸면 부른다)
//    update(dt)                     감독이 엔티티 루프 안에서 부른다: 결계·방패벽 시간, 예약 동작, 'guard' 입력(히트스톱 안전: buffered),
//                                   HUD 위젯 탭, 자동 스킬, 공명 대기, 탑승 이동 경험치, 레벨업 뒤 능력치 갱신
//    onHit(target, info, attack)    협공 (플레이어의 마무리·차지·탈것 돌진/특수기·치명타 → 협공 대기 0 인 수호신), AI 이벤트 'hit'
//    onKill(enemy, exp)             경험치 분배 (수호신 40%, 탑승 중이면 탈것 40%), 50킬마다 유대 +1 (스테이지당 5), AI 이벤트 'kill'
//    onBossStart(boss)              boss.def.noMount → mountBlocked (탈것이 p.mount.onBossStart 로 직접 처리, 없으면 여기서 하차)
//    onBossDefeated(boss)           장착 동료 유대 +10, 보스 경험치 50%
//    onRespawn()                    수호신을 기준점으로, 결계·방패벽·공명 초기화, p.mount.onRespawn
//    onStatsChanged()               수호신 파생 수치 다시 계산 (Player 생성자 안에서도 불린다: 플레이어가 아직 없을 수 있다)
//    incoming(p, dmg, attack)       → { dmg, mounted, noStagger, cancel } | null   가웨인 방패벽 ×0.7, 탑승 중이면 MountRider.incoming
//    shieldT                        아리아 결계 남은 시간 (> 0 이면 플레이어 무적, 깜빡임 없음 — player.js 훅 #20)
//    airDrainMul                    깊은 물 숨 감소 배율 (장착 수호신 passive.airDrainMul 의 최솟값: 루멘 0.5)
//    mountBlocked                   noMount 보스전 중 (탈것은 소환을 거절한다)
//    tryGuardianSkill(auto, g?)     → bool   첫 번째 준비된 수호신의 스킬 (없으면 '쿨타임')
//    castSkill(g, {auto, resonance}) 스킬 시전 (공명이면 60% 위력, 재사용 대기 소모 없음)
//    keepFx(e)                      방을 옮겨도 다시 넣는 연출 개체 (아리아 결계·가웨인 방패벽: shieldT·wallT 와 함께 이어진다)
//    ('mount' 입력은 탈것 런타임이 읽는다. 탈것을 장착하지 않아 p.mount 가 없을 때만 여기서 '장착한 탈것이 없다' 안내)
//    hudInfo() → { mount:{id,name,color,state,hp,maxHp,cd,cdMax,riding,stamina,staminaMax}|null,
//                  guards:[{id,slot,name,color,cd,cdMax,ready,auto}] (마을에서는 []), auto, town } | null   (HUD 위젯 · 터치 패드 탑승/수호 버튼 표시)
//    hudRects                       companion_hud 가 그린 탭 영역: [{x,y,w,h, act:'mount'|'guard', slot?}] (객체 {mount:rect, guard0:rect} 도 받음)
//    callouts                       스킬 카드 대기열 [{id, name, skill, line, color, portrait, t, auto, resonance}] (최대 2, HUD 가 읽고 t 를 쓴다)
//    debug: { summon(), dismount(), knock(), skill(i), setLevel(id, lv), resonance() }   (window.__game.world.companions.debug)
//  class CompanionDirector extends Entity   보이지 않는 감독 (kind 'director', z -99): 엔티티 루프 안에서 system.update 를 부른다
//  companionHubEnter(game, hub)     허브 enter/onResume 끝에서: 마구간 개장(cmp_stable_open) → 해금 평가 → 수호신 2번 칸 안내 →
//                                   합류 연출(companionJoin) 최대 3명 (위에 다른 장면이 있으면 아무것도 하지 않고 다음 onResume 에 이어간다)
//  companionHubNote(state) → 문구 | null    마구간 문 '!' 표시 (알 부화 가능 · 합류 연출 대기 · 그레타 의뢰 보상 대기)
//
// 탈것 런타임(CMP-MOUNT, mount.js)에게 부르는 것 (모두 선택; 없으면 건너뜀):
//  new MountRider(system, id, def) · attach(world, p) · detach(world, p) · dismount(world, p, reason) · incoming(p, dmg, attack, world)
//  onRoomLoaded(world, p, roomId) · onRespawn(world, p) · onBossStart(world, p, boss) · onBossDefeated(world, p, boss)
//  summon(world, p, {force, instant}) · knockOff(world, p, reason) · resonance(world, p) (없으면 여기서 '기마 돌격' 을 그린다)
//  hudInfo() (없으면 필드 id state hp maxHp cd cdMax riding stamina staminaMax 를 읽는다)
import { Entity } from './entity.js';
import { Guardian, GHit, aiFor } from './guardian.js';
import * as MR from './mount.js';
import * as ACMP from '../core/audio_companions.js';   // 동료 효과음 등록 (부수 효과) + playCry
import * as QuestRt from './quests.js';
import {
  ensureCompanionState, heroLoadout, loadoutKey, equippedIds, guardianSlots, addCompanionExp, addBond, bondRankOf,
  mountDerived, evaluateUnlocks, pendingIds, markSeen, eggStatus, isOwned, ownedIds, ownedEntry,
} from './companion_state.js';
import { SCRIPTS } from '../data/story.js';
import { bus } from '../core/events.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { TAU, clamp, lerp } from '../core/math.js';
import {
  MOUNTS, GUARDIANS, GUARD_RULES, CMP_EXP, BOND_GAIN, BOND_NAMES, CMP_TEXT, CMP_MAX_LV, companionDef, isMountId, isGuardianId,
} from '../data/companions.js';

const ARCADE = new Set(['bossrush', 'survival', 'practice']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
let RSEQ = 0;
// 필살기·각성기 이벤트는 모듈에서 한 번만 구독하고 지금 월드(game.world)의 동료 시스템으로 넘긴다
// (월드마다 구독하면 버려진 World 가 다음 필살기까지 메모리에 남는다)
let GAME = null, BOUND = false;
function bindBus(game) {
  if (game) GAME = game;
  if (BOUND) return;
  BOUND = true;
  for (const evt of ['ultimateCast', 'awakenCast']) bus.on(evt, (d) => { try { GAME?.world?.companions?.onCast?.(evt, d); } catch (e) { console.warn('[companions]', evt, e); } });
  // 유대 단계·레벨이 어디서 올랐든 (보스·50킬·스테이지 클리어·공물·디버그) 지금 월드의 수호신 파생 수치(공명·오라 ×1.5·스킬 위력)와 오라를 다시 계산한다
  for (const evt of ['bondUp', 'companionLevelUp']) bus.on(evt, () => { const cs = GAME?.world?.companions; if (cs?.active) { cs.needRefresh = true; cs._hud = null; } });
}

/** 보이지 않는 감독: 엔티티 루프 안에서 CompanionSystem.update 를 부른다 (World.update 를 고치지 않고) */
export class CompanionDirector extends Entity {
  constructor(system) {
    super(0, 0, 1, 1);
    this.kind = 'director';
    this.z = -99;
    this.hidden = true;
    this.system = system;
  }
  update(dt, world) {
    this.t += dt;
    try { this.system?.update(dt); }
    catch (e) { if (!this.warned) { this.warned = true; console.error('[companions] update', e); } }
  }
}

export class CompanionSystem {
  constructor(world) {
    this.world = world;
    const st = world?.state;
    this.active = !!world && isObj(st) && !st.arcade && !world.arcade && !ARCADE.has(world.mode);
    this.shieldT = 0; this.airDrainMul = 1; this.mountBlocked = false;
    this.wallT = 0; this.wallMul = GUARDIANS.gd_knight?.skill?.dmgMul ?? 0.7;
    this.hudRects = [];
    this.callouts = [];
    this.guards = []; this.key = null; this.director = null; this.cdStore = {};
    this.timers = []; this.reso = null; this.keep = [];
    this.kills = 0; this.killBond = 0; this.tileExp = 0; this.tileAcc = 0; this.lastX = null;
    this.groundY = null; this.idleT = 0; this.lastGround = true;
    this.autoT = 0; this.autoCd = 0; this.syncT = 0; this.chainN = -1; this.needRefresh = false; this.rideDone = false;
    this._hud = null; this._hudAt = -1;
    const self = this;
    this.debug = {
      summon() { const w = self.world, p = w?.player, m = p?.mount; if (!m) return false; return !!(m.summon?.(w, p, { force: true, instant: true }) ?? m.debugSummon?.(w, p)); },
      dismount() { const w = self.world, p = w?.player, m = p?.mount; if (!m) return false; m.dismount?.(w, p, 'debug'); return true; },
      knock() { const w = self.world, p = w?.player, m = p?.mount; if (!m) return false; return !!(m.knockOff?.(w, p, 'debug') ?? m.debugKnock?.(w, p)); },
      skill(i = 0) { const g = self.guards[i]; if (!g) return false; g.skillCd = 0; return self.castSkill(g, { auto: false }); },
      setLevel(id, lv) {
        const e = ownedEntry(self.world?.state, id);
        if (!e) return false;
        e.lv = clamp(Math.round(Number(lv) || 1), 1, CMP_MAX_LV); e.exp = 0;
        self.world?.player?.refreshStats?.();
        return true;
      },
      resonance() { self.reso = null; self.fireResonance(); return true; },
    };
    if (this.active) {
      try { ensureCompanionState(st); } catch (e) { /* 손상된 세이브: 동료 없이 진행 */ }
      bindBus(world.game);
    }
  }

  // ───────────────────────── 상태 ─────────────────────────
  get state() { return this.world?.state ?? null; }
  /** 수호신이 표적을 잡지 않는 때 (마을·컷신·각성 연출·방 이동) */
  calm() {
    const w = this.world;
    return !w || w.mode === 'town' || !!w.cutscene || !!w.hudHidden || !!w.freezeEnemies || !!w.transitioning;
  }
  /** 자동 스킬 켜짐? (null = 기기 기본: 터치 모드면 켬) */
  autoOn() {
    const a = this.state?.companions?.autoSkill;
    return a === true || a === false ? a : !!input.touchMode;
  }
  /** delay 초 뒤 fn (월드 시간 기준; 방이 바뀌면 취소) */
  later(delay, fn) { if (delay <= 0) { try { fn(); } catch (e) { console.warn('[companions] later', e); } return; } this.timers.push({ t: delay, fn }); }
  /** 방을 옮겨도 이어지는 연출 개체 (아리아 결계·가웨인 방패벽: shieldT·wallT 가 남아 있는 동안 보이고 탄을 막게) */
  keepFx(e) {
    if (!e) return e;
    this.keep = this.keep.filter((x) => !x.dead && x.life > 0);
    this.keep.push(e);
    return e;
  }
  runTimers(dt) {
    if (!this.timers.length) return;
    const due = [];
    for (const tm of this.timers) { tm.t -= dt; if (tm.t <= 0) due.push(tm); }
    if (!due.length) return;
    this.timers = this.timers.filter((tm) => tm.t > 0);
    for (const tm of due) { try { tm.fn(); } catch (e) { console.warn('[companions] timer', e); } }
  }

  // ───────────────────────── 방 · 편성 ─────────────────────────
  onRoomLoaded(roomId) {
    if (!this.active) return;
    const w = this.world, p = w.player;
    if (!p) return;
    this.timers.length = 0;
    this.director = w.add(new CompanionDirector(this));
    this.tileExp = 0; this.tileAcc = 0; this.lastX = p.cx; this.groundY = p.bottom; this.idleT = 0;
    this.sync(true);
    for (const g of this.guards) { g.dead = false; if (!w.entities.includes(g)) w.add(g); g.place(w, p); }
    this.keep = this.keep.filter((e) => !e.dead && e.life > 0);
    for (const e of this.keep) if (!w.entities.includes(e)) w.add(e);
    try { p.mount?.onRoomLoaded?.(w, p, roomId); } catch (e) { console.warn('[companions] mount room', e); }
    if (!this.rideDone) {
      this.rideDone = true;
      if (this.state?.companions?._debug?.ride && w.mode === 'story') this.later(0.05, () => this.debug.summon());
    }
  }
  /** 편성이 바뀌었으면 수호신·탈것을 다시 맞춘다 (메뉴에서 장착을 바꾼 뒤 부른다) */
  sync(force = false) {
    if (!this.active) return;
    const w = this.world, st = w.state, p = w.player;
    if (!p) return;
    let key = '';
    try { key = loadoutKey(st, w.hero); } catch { key = ''; }
    if (!force && key === this.key) return;
    const first = this.key === null;
    const changed = key !== this.key;
    this.key = key;
    const L = heroLoadout(st, w.hero), slots = guardianSlots(st);
    // 수호신
    const want = [];
    for (let i = 0; i < slots; i++) { const id = L.guards?.[i]; if (isGuardianId(id) && isOwned(st, id) && !want.includes(id)) want.push(id); }
    const next = [];
    for (const g of this.guards) {
      if (want.includes(g.id)) continue;
      this.cdStore[g.id] = g.skillCd;
      if (!g.dead) { g.dead = true; w.fx?.burst('magic', g.cx, g.cy, 8, { speed: 100, color: g.def?.color }); }
    }
    want.forEach((id, i) => {
      let g = this.guards.find((x) => x.id === id);
      if (!g) {
        g = new Guardian(this, id, i);
        g.skillCd = this.cdStore[id] ?? 0;
        w.add(g); g.place(w, p);
      } else if (!w.entities.includes(g)) { g.dead = false; w.add(g); g.place(w, p); }
      g.slot = i;
      next.push(g);
    });
    this.guards = next;
    // 탈것 (MountRider — CMP-MOUNT; 스텁이어도 오늘의 동작 그대로)
    const mid = isMountId(L.mount) && isOwned(st, L.mount) ? L.mount : null;
    const cur = p.mount;
    if (cur && cur.id !== mid) {
      if (cur.riding) { try { cur.dismount?.(w, p, 'unequip'); } catch (e) { console.warn('[companions] dismount', e); } }
      if (cur.riding) this.key = null;      // 아직 내리는 중이면 다음 확인 때 다시
      else { try { cur.detach?.(w, p); } catch { /* 무시 */ } p.mount = null; }
    }
    if (mid && !p.mount) {
      try {
        const Rider = MR.MountRider;
        if (typeof Rider === 'function') { p.mount = new Rider(this, mid, MOUNTS[mid]); p.mount.attach?.(w, p); }
      } catch (e) { console.warn('[companions] mount attach', e); p.mount = null; }
    }
    // 깊은 물 숨 (루멘)
    let air = 1;
    for (const g of this.guards) { const m = g.def?.passive?.airDrainMul; if (Number.isFinite(m)) air = Math.min(air, m); }
    this.airDrainMul = air;
    this._hud = null;
    if (changed && !first) this.needRefresh = true;   // 오라(장착 수호신)가 바뀌었다
  }

  // ───────────────────────── 매 프레임 (감독) ─────────────────────────
  update(dt) {
    if (!this.active) return;
    const w = this.world, p = w.player;
    if (!p) return;
    this.syncT -= dt;
    if (this.syncT <= 0) { this.syncT = 0.5; this.sync(); }
    if (this.shieldT > 0) this.shieldT = Math.max(0, this.shieldT - dt);
    if (this.wallT > 0) this.wallT = Math.max(0, this.wallT - dt);
    if (this.autoCd > 0) this.autoCd -= dt;
    this.runTimers(dt);
    // 플레이어 관찰: 마지막으로 딛은 바닥 · 점프(지면형 수호신 깡충) · 가만히 선 시간
    if (p.onGround) this.groundY = p.bottom; else if (this.groundY == null) this.groundY = p.bottom;
    if (!p.onGround && this.lastGround && p.vy < -200) for (const g of this.guards) if (!g.fly) g.hopT = 0.35;
    this.lastGround = !!p.onGround;
    const still = p.onGround && Math.abs(p.vx) < 15 && !p.move && !(p.castT > 0) && !p.dead;
    this.idleT = still ? this.idleT + dt : 0;
    for (const c of this.callouts) c.t = (c.t ?? 0) + dt;
    if (this.callouts.length && this.callouts[0].t > 4) this.callouts.shift();
    // 입력 ('guard' 는 buffered 로 읽는다: 히트스톱 동안 엣지를 놓치지 않게 — MASTER_PLAN R16)
    const bufWin = 0.25 + Math.min(0.3, w.frozenRecent ?? 0);   // 히트스톱으로 멈춘 시간만큼 창을 늘린다 (player.js 와 같은 규칙)
    if (w.mode !== 'town') {
      if (input.buffered('guard', bufWin)) {
        input.consume('guard');
        if (!p.dead && !w.cutscene && !w.inputLock) this.tryGuardianSkill(false);
      }
      this.handleTaps(p);
    }
    // 탈것을 장착하지 않았을 때의 'mount' (R · L3): 탈것 런타임(p.mount)이 없으니 여기서 안내한다 (§7.5 '장착한 탈것이 없다 — 메뉴 › 동료')
    if (!p.mount && input.buffered('mount', bufWin)) {
      input.consume('mount');
      if (!p.dead && !w.cutscene && !w.inputLock) {
        audio.sfx('menu_cancel', { vol: 0.3 });
        if (ownedIds(w.state, 'mount').length) w.game?.toast?.(CMP_TEXT.noMount, '#c8b8a8', 2);
      }
    }
    // 자동 스킬
    if (this.guards.length && !p.dead && !this.calm() && this.autoOn()) {
      this.autoT -= dt;
      if (this.autoT <= 0) { this.autoT = 0.2; if (this.autoCd <= 0) this.autoSkill(p); }
    }
    // 공명: 필살기·각성기 뒤 연출이 끝나면 (world.cutscene 해제) 0.9초 뒤
    if (this.reso) {
      this.reso.age += dt;
      if (!w.cutscene && !w.hudHidden && !w.freezeEnemies && !p.dead) {
        this.reso.t -= dt;
        if (this.reso.t <= 0) { this.reso = null; this.fireResonance(); }
      }
      if (this.reso && this.reso.age > 20) this.reso = null;
    }
    // 탑승 이동 경험치: 1칸마다 1 (방마다 최대 300)
    const m = p.mount;
    if (m?.riding && w.mode !== 'town' && this.lastX != null) {
      this.tileAcc += Math.abs(p.cx - this.lastX) / 48;
      if (this.tileAcc >= 10 && this.tileExp < CMP_EXP.tileCap) {
        const n = Math.min(Math.floor(this.tileAcc), CMP_EXP.tileCap - this.tileExp);
        this.tileAcc -= n; this.tileExp += n;
        this.giveExp(m.id, n * CMP_EXP.perTile, p);
      }
    }
    this.lastX = p.cx;
    if (this.needRefresh) { this.needRefresh = false; try { p.refreshStats(); } catch (e) { console.warn('[companions] refresh', e); } }
  }
  /** HUD 위젯 탭 (터치 패드가 없을 때도 동작하도록) */
  handleTaps(p) {
    const ptr = input.pointer, R = this.hudRects;
    if (!ptr?.tapped || !R) return;
    const list = Array.isArray(R) ? R : Object.entries(R).map(([k, r]) => ({ act: k, ...r }));
    for (const r of list) {
      if (!r || !(ptr.x >= r.x && ptr.x <= r.x + r.w && ptr.y >= r.y && ptr.y <= r.y + r.h)) continue;
      const act = String(r.act ?? r.kind ?? r.id ?? '');
      if (act === 'mount') {
        // 터치 대체 경로 (§6). 마우스 클릭은 넘긴다: input.touch.tap 은 기기를 터치로 바꿔 데스크톱에 가상 패드를 띄운다 (키보드는 R)
        if (ptr.type === 'mouse' && !input.touchMode) continue;
        input.touch?.tap?.('mount'); ptr.tapped = false; return;
      }
      if (act.startsWith('guard')) {
        const slot = Number.isFinite(r.slot) ? r.slot : (/\d$/.test(act) ? Number(act.slice(-1)) : null);
        const g = slot != null ? this.guards.find((x) => x.slot === slot) : null;
        if (!p.dead && !this.world.cutscene) this.tryGuardianSkill(false, g);
        ptr.tapped = false;
        return;
      }
    }
  }
  autoSkill(p) {
    const w = this.world;
    let near = 0;
    for (const e of w.enemies()) { if (!e.harmless && Math.hypot(e.cx - p.cx, e.cy - p.cy) <= GUARD_RULES.auto.r) near++; }
    const b = w.boss;
    const boss = !!(w.bossActive && b && !b.dead && !(b.dying > 0) && Math.hypot(b.cx - p.cx, b.cy - p.cy) <= GUARD_RULES.auto.bossR);
    const low = p.hp < p.stats.hp * GUARD_RULES.auto.fairyHp;
    for (const g of this.guards) {
      if (!g.skillReady()) continue;
      const want = near >= GUARD_RULES.auto.enemies || boss || (g.id === 'gd_fairy' && low);
      if (!want) continue;
      if (this.castSkill(g, { auto: true })) { this.autoCd = 1.0; return; }
    }
  }

  // ───────────────────────── 스킬 ─────────────────────────
  /** 'guard' 입력: 첫 번째 준비된 수호신 (only 가 있으면 그 수호신만) */
  tryGuardianSkill(auto = false, only = null) {
    if (!this.active) return false;
    const w = this.world, p = w.player;
    if (!p || p.dead || w.mode === 'town' || w.cutscene) return false;
    if (!this.guards.length) {
      if (!auto) {
        audio.sfx('menu_cancel', { vol: 0.3 });
        if (ownedIds(w.state, 'guardian').length) w.game?.toast?.(CMP_TEXT.noGuard, '#c8b8a8', 2);
      }
      return false;
    }
    const g = only ? (only.skillReady() ? only : null) : this.guards.find((x) => x.skillReady());
    if (!g) {
      if (!auto) { audio.sfx('menu_cancel', { vol: 0.3 }); w.fx?.text(p.cx, p.y - 20, CMP_TEXT.cooldown, { size: 14, color: '#9d8f80' }); }
      return false;
    }
    return this.castSkill(g, { auto });
  }
  castSkill(g, { auto = false, resonance = false } = {}) {
    const w = this.world, p = w?.player;
    if (!g || !p || p.dead || g.dead) return false;
    const def = g.def;
    const mul = resonance ? GUARD_RULES.resonanceMul : (g.d?.skillMul ?? 1);
    if (!resonance) g.skillCd = g.skillCdMax;
    g.perched = false; g.flinchT = 0;
    const ai = g.ai ?? aiFor(g.id);
    try { ai.skill(g, w, mul, { auto, resonance }); } catch (e) { console.warn('[companions] skill', g.id, e); }
    if (typeof ACMP.playCry === 'function') ACMP.playCry(def, { vol: 0.7 });
    else audio.sfx(def.cry?.sfx ?? 'summon', { vol: 0.7, pitch: def.cry?.pitch ?? 1 });
    audio.duck?.(0.3, 0.4);
    w.fx?.text(g.cx, g.y - 14, def.skill?.name ?? '', { color: def.color, size: 18, life: 1.1, vy: -50, outline: '#1a0610' });
    w.camera?.shake?.(3, 0.18);
    this.callouts.push({ id: g.id, name: def.name, skill: def.skill?.name ?? '', line: def.skill?.line ?? '', color: def.color, portrait: def.portrait, t: 0, auto, resonance });
    while (this.callouts.length > 2) this.callouts.shift();
    this._hud = null;
    bus.emit('guardianSkill', { id: g.id, auto, resonance, name: def.skill?.name, line: def.skill?.line });
    return true;
  }

  // ───────────────────────── 공명 (§4.7, 유대 3단계) ─────────────────────────
  onCast(evt, d) {
    if (!this.active) return;
    const p = this.world.player;
    if (!p || p.dead) return;
    const any = this.guards.some((g) => g.d?.resonance) || this.mountResonance();
    if (!any) return;
    this.reso = { t: GUARD_RULES.resonanceDelay, age: 0, evt, charId: d?.charId };
  }
  mountResonance() {
    const st = this.state, L = heroLoadout(st, this.world.hero);
    return isMountId(L.mount) && isOwned(st, L.mount) && bondRankOf(st, L.mount) >= 3 ? L.mount : null;
  }
  fireResonance() {
    const w = this.world, p = w.player;
    if (!p || p.dead) return;
    let n = 0;
    for (const g of this.guards) if (g.d?.resonance && !g.dead) { if (this.castSkill(g, { resonance: true })) n++; }
    const mid = this.mountResonance();
    if (mid) { this.spectralCharge(mid); n++; }
    if (n) w.fx?.text(p.cx, p.y - 56, `${BOND_NAMES[3]}!`, { color: '#ffd070', size: 24, life: 1.0, vy: -40, outline: '#1a0610' });
  }
  /** 탈것 공명 '기마 돌격': 반투명한 탈것이 화면을 가로질러 달리며 모든 적을 한 번씩 친다 (mv 2.0, 돌진 속성) */
  spectralCharge(mid) {
    const w = this.world, p = w.player, def = MOUNTS[mid], st = w.state;
    if (typeof p.mount?.resonance === 'function' && p.mount.id === mid) { try { p.mount.resonance(w, p); return; } catch (e) { console.warn('[companions] mount resonance', e); } }
    const cam = w.camera, f = p.facing || 1;
    const vw = (cam?.w ?? w.game?.viewW ?? 960) / (cam?.zoom > 0 ? cam.zoom : 1), x0 = cam?.x ?? (p.cx - vw / 2);   // 카메라 뷰 폭 (줌 반영)
    const W = 150, H = 130, dur = 0.75;
    const sx = f > 0 ? x0 - W : x0 + vw + W, ex = f > 0 ? x0 + vw + W : x0 - W;
    const md = mountDerived(st, mid, p.stats);
    const atk = {
      owner: p, team: 'player', stats: md?.atkStats ?? p.stats, mv: 2.0, type: def.charge?.type ?? 'phys', element: def.charge?.element ?? null,
      dir: f, kb: [460, -320], launch: true, hitstop: 0.04, shake: 3, hitId: 'reso' + (++RSEQ), mult: 1, crit: 0,
      tags: ['companion', 'mount', 'resonance'], breakWalls: false, dmgColor: def.color,
    };
    w.add(new GHit({
      x: sx - W / 2, y: p.bottom - H, w: W, h: H, life: dur, attack: atk, owner: p, z: 12, data: { f, color: def.color, rig: def.rig },
      follow(h) { const k = clamp(h.t / dur, 0, 1); h.x = lerp(sx, ex, k) - W / 2; h.y = (w.player?.bottom ?? h.y + H) - H; },
      tick(h, world) { if ((h.data.n = (h.data.n ?? 0) + 1) % 3 === 0) world.fx?.speedLine?.(h.cx - f * 60, h.cy + (h.data.n % 2 ? -20 : 25), f > 0 ? Math.PI : 0, { len: 90, width: 3, color: def.color, life: 0.2, speed: 300 }); },
      render: drawSpectralMount,
      light: { r: 150, color: def.color, i: 0.6 },
    }));
    if (typeof ACMP.playCry === 'function') ACMP.playCry(def, { vol: 0.8 }); else audio.sfx('neigh', { vol: 0.8 });
    audio.sfx('dash', { vol: 0.7 });
  }

  // ───────────────────────── 전투 기록 (world.js 훅) ─────────────────────────
  onHit(target, info, attack) {
    if (!this.active || !target || target.kind === 'prop') return;
    const w = this.world, p = w.player;
    if (!p) return;
    for (const g of this.guards) { try { g.ai?.onEvent?.(g, w, 'hit', { target, info, attack }); } catch { /* 무시 */ } }
    // 협공 (§4.6): 플레이어 자신의 마무리 · 차지 · 탈것 돌진/특수기 · 치명타
    if (attack?.owner !== p || this.calm() || p.dead) return;
    const tags = attack.tags ?? [];
    if (tags.includes('guardian') || tags.includes('resonance')) return;
    const chg = p.moveSet?.charge;   // 모아치기 (탈것 adaptMove 가 사본을 만들어도 id 로 알아본다)
    const trig = !!(p.move?.finisher || attack.finisher || (p.move && chg && (p.move === chg || (p.move.id && p.move.id === chg.id))) || tags.includes('mount') || info?.crit);
    if (!trig || info?.killed || target.dead || target.dying > 0) return;
    // 콤보 줄기 식별: run.hits 와 combo.n 은 한 줄기 안에서 함께 1씩 오르므로 차이가 그 줄기의 번호다 (줄기가 끊기면 combo.n 만 0 으로)
    const chain = (w.run?.hits ?? 0) - (w.combo?.n ?? 0);
    for (const g of this.guards) {
      if (g.assistCd > 0 || g.dead || g.flinchT > 0) continue;
      if (g.act?.name === 'skill' || g.act?.name === 'assist') continue;
      if (Math.hypot(g.cx - target.cx, g.cy - target.cy) > GUARD_RULES.leash) continue;
      if (!g.startAssist(w, target)) continue;
      // 협공 문구는 콤보 한 줄기마다 처음 한 번
      if (this.chainN !== chain) { this.chainN = chain; w.fx?.text(target.cx, target.y - 30, CMP_TEXT.assist, { color: g.def.color, size: 18 }); }
    }
  }
  onKill(enemy, exp) {
    if (!this.active) return;
    const w = this.world, p = w.player, st = w.state;
    if (!p || w.mode === 'town') return;
    for (const g of this.guards) { try { g.ai?.onEvent?.(g, w, 'kill', { enemy }); } catch { /* 무시 */ } }
    const n = Number.isFinite(exp) ? exp : 0;
    if (n > 0) {
      const share = Math.round(n * CMP_EXP.killShare);
      for (const g of this.guards) this.giveExp(g.id, share, g);
      if (p.mount?.riding && p.mount.id) this.giveExp(p.mount.id, Math.round(n * CMP_EXP.mountKillShare), p);
    }
    // 50킬마다 유대 +1 (스테이지당 5번까지)
    this.kills++;
    if (this.kills % BOND_GAIN.killsPer === 0 && this.killBond < BOND_GAIN.killsCap) {
      this.killBond++;
      for (const id of equippedIds(st, w.hero)) addBond(st, id, 1);
    }
  }
  onBossStart(boss) {
    if (!this.active) return;
    const w = this.world, p = w.player;
    this.mountBlocked = !!boss?.def?.noMount;
    const m = p?.mount;
    if (!m) return;
    try {
      if (typeof m.onBossStart === 'function') m.onBossStart(w, p, boss);
      else if (this.mountBlocked && m.riding) m.dismount?.(w, p, 'boss');
    } catch (e) { console.warn('[companions] boss start', e); }
  }
  onBossDefeated(boss) {
    if (!this.active) return;
    const w = this.world, p = w.player, st = w.state;
    this.mountBlocked = false;
    if (!p || w.mode === 'town') return;
    const exp = Math.round((boss?.stats?.exp ?? 500) * (1 + (p.stats?.expBonus ?? 0) / 100) * CMP_EXP.bossShare);
    for (const id of equippedIds(st, w.hero)) {
      addBond(st, id, BOND_GAIN.boss);
      this.giveExp(id, exp, this.guards.find((g) => g.id === id) ?? p);
    }
    try { p.mount?.onBossDefeated?.(w, p, boss); } catch { /* 무시 */ }
  }
  onRespawn() {
    if (!this.active) return;
    const w = this.world, p = w.player;
    this.shieldT = 0; this.wallT = 0; this.reso = null; this.timers.length = 0; this.idleT = 0;
    for (const e of this.keep) e.dead = true;
    this.keep.length = 0;
    if (!p) return;
    for (const g of this.guards) {
      g.act = null; g.target = null; g.flinchT = 0; g.perched = false;
      if (!w.entities.includes(g)) { g.dead = false; w.add(g); }
      g.place(w, p);
    }
    try { p.mount?.onRespawn?.(w, p); } catch (e) { console.warn('[companions] mount respawn', e); }
  }
  onStatsChanged() {
    for (const g of this.guards) g.refresh();
    this._hud = null;
  }
  /** 경험치 → 레벨업이면 연출 (고리 + 'Lv UP!' + bond_up 0.6) 과 능력치 갱신 예약 */
  giveExp(id, n, ent) {
    if (!(n > 0)) return 0;
    const up = addCompanionExp(this.state, id, n);
    if (up > 0) {
      const w = this.world, e = ent ?? w.player;
      if (e) {
        w.fx?.ring(e.cx, e.cy, { color: '#ffe070', r0: 6, r1: 52, life: 0.45, width: 4 });
        w.fx?.text(e.cx, e.y - 10, CMP_TEXT.levelUp, { color: '#ffe070', size: 16 });
      }
      audio.sfx('bond_up', { vol: 0.6 });
      this.needRefresh = true;
      this._hud = null;
    }
    return up;
  }

  // ───────────────────────── 피격 (player.js 훅 #21) ─────────────────────────
  incoming(p, dmg, attack) {
    if (!this.active || !p) return null;
    const w = this.world;
    let d = dmg, touched = false;
    if (this.wallT > 0 && Number.isFinite(d)) { d = Math.max(0, Math.round(d * this.wallMul)); touched = true; }
    for (const g of this.guards) { g.flinch(); try { g.ai?.onEvent?.(g, w, 'hurt', { dmg: d, attack }); } catch { /* 무시 */ } }
    const m = p.mount;
    if (m?.riding && typeof m.incoming === 'function') {
      let r = null;
      try { r = m.incoming(p, d, attack, w); } catch (e) { console.warn('[companions] mount incoming', e); }
      if (r) return { dmg: Number.isFinite(r.dmg) ? r.dmg : d, mounted: r.mounted !== false, noStagger: !!r.noStagger, cancel: !!r.cancel };
    }
    return touched ? { dmg: d, mounted: false, noStagger: false, cancel: false } : null;
  }

  // ───────────────────────── HUD · 터치 패드 ─────────────────────────
  hudInfo() {
    if (!this.active) return null;
    const w = this.world, p = w.player;
    if (!p) return null;
    const now = w.time ?? 0;
    if (this._hud !== null && this._hudAt === now) return this._hud;
    const auto = this.autoOn();
    let mount = null;
    const m = p.mount;
    if (m && m.id) {
      const def = MOUNTS[m.id] ?? {};
      let h = null;
      try { h = m.hudInfo?.() ?? null; } catch { h = null; }
      const num = (v, dv = 0) => (Number.isFinite(v) ? v : dv);
      mount = {
        id: m.id, name: def.name ?? '', color: def.color ?? '#fff', state: h?.state ?? m.state ?? 'stowed',
        hp: num(h?.hp ?? m.hp), maxHp: num(h?.maxHp ?? m.maxHp), cd: num(h?.cd ?? m.cd), cdMax: num(h?.cdMax ?? m.cdMax),
        riding: !!(h?.riding ?? m.riding), stamina: h?.stamina ?? m.stamina ?? null, staminaMax: h?.staminaMax ?? m.staminaMax ?? null,
        blocked: this.mountBlocked,
      };
    }
    // 마을에서는 수호신 스킬을 쓸 수 없으므로 수호 버튼·위젯 정보를 내지 않는다 (탈것은 마을에서도 탈 수 있다)
    const guards = w.mode === 'town' ? [] : this.guards.map((g) => ({
      id: g.id, slot: g.slot, name: g.def?.name ?? '', color: g.def?.color ?? '#fff',
      cd: Math.max(0, g.skillCd), cdMax: g.skillCdMax, ready: g.skillCd <= 0, auto,
    }));
    const info = mount || guards.length ? { mount, guards, auto, town: w.mode === 'town' } : null;
    this._hud = info; this._hudAt = now;
    return info;
  }
}

// ───────────────────────── 마을 (hub.js 훅) ─────────────────────────
/**
 * 허브 enter/onResume 끝에서 부른다 (companions §7.4). 위에 다른 장면이 있으면 아무것도 하지 않는다 (다음 onResume 에 이어감).
 *  1) 1장 이상 · 마구간 미개장 → cmp_stable_open 대사 (끝나면 stable_open) → 그림메인 합류
 *  2) 해금 평가 (유물·플래그·보스·의뢰) 3) 8장 이상 첫 방문 → '수호신 슬롯이 하나 더 열렸다!' (+ cmp_slot2)
 *  4) 합류 연출 대기열: 방문마다 최대 3명 (합류 전 대사가 있으면 먼저: 녹티스 cmp_bat_arrive). 나머지는 메뉴의 NEW 로 남는다
 */
export function companionHubEnter(game, hub) {
  if (!game || !hub || hub._cmpBusy) return;
  const st = game.state;
  if (!isObj(st) || st.arcade || !isObj(st.progress)) return;
  hub._cmpBusy = true;
  try {
    for (let i = 0; i < 12 && game.top === hub; i++) if (!hubStep(game, hub, st)) break;
  } catch (e) { console.warn('[companions] hub', e); }
  finally { hub._cmpBusy = false; }
}
function playHubScript(game, hub, st, sid, onEnd) {
  const P = st.progress;
  if (!P.seenScripts.includes(sid)) P.seenScripts.push(sid);
  game.push('dialogue', { script: sid, world: hub.world ?? game.world ?? null, onEnd: () => { try { onEnd?.(); } finally { companionHubEnter(game, hub); } } });
}
/** 한 단계 진행. 장면을 쌓았거나 더 할 일이 있으면 true */
function hubStep(game, hub, st) {
  if (!ensureCompanionState(st)) return false;
  const P = st.progress;
  if (!isObj(P.flags)) P.flags = {};
  if (!Array.isArray(P.seenScripts)) P.seenScripts = [];
  const V = (hub._cmpVisit ??= { shown: 0 });
  const c = st.companions;
  // 1) 마구간 개장 (그림메인)
  if ((P.chapter ?? 0) >= 1 && !P.flags.stable_open) {
    const sid = MOUNTS.mt_warhorse?.obtain?.script ?? 'cmp_stable_open';
    if (SCRIPTS[sid] && !P.seenScripts.includes(sid)) {
      playHubScript(game, hub, st, sid, () => { P.flags.stable_open = true; });
      return true;
    }
    P.flags.stable_open = true;
  }
  // 2) 해금 평가
  try { if (typeof game.companions?.evaluate === 'function') game.companions.evaluate(); else evaluateUnlocks(st); } catch (e) { console.warn('[companions] evaluate', e); }
  // 3) 수호신 2번 칸
  if (guardianSlots(st) >= 2 && !c.slot2Seen && ownedIds(st).length) {
    c.slot2Seen = true;
    game.toast?.(CMP_TEXT.slot2, '#ffd070', 3);
    if (SCRIPTS.cmp_slot2 && !P.seenScripts.includes('cmp_slot2')) { playHubScript(game, hub, st, 'cmp_slot2'); return true; }
  }
  // 4) 합류 연출
  if (V.shown >= 3) return false;
  const id = pendingIds(st)[0];
  if (!id) return false;
  const sid = companionDef(id)?.obtain?.script;
  if (sid && SCRIPTS[sid] && !P.seenScripts.includes(sid)) { playHubScript(game, hub, st, sid); return true; }
  V.shown++;
  markSeen(st, id);
  if (!game.registry?.companionJoin) return true;
  game.push('companionJoin', { id, source: c.owned[id]?.src ?? 'story', onDone: () => companionHubEnter(game, hub) });
  return true;
}
/** 마구간 문 '!' 표시 문구 (없으면 null) — hub.refreshBoard 가 boardInfo.stableNote 에 둔다 */
export function companionHubNote(state) {
  try {
    if (!isObj(state) || state.arcade || !isObj(state.companions)) return null;
    if (eggStatus(state).some((e) => e.ready)) return '알에 금이 가기 시작했다!';
    if (pendingIds(state).length) return '새 동료가 기다리고 있다';
    const act = typeof QuestRt.activeQuests === 'function' ? QuestRt.activeQuests(state) : [];
    for (const q of act) {
      if (q?.giver === 'npc_greta' && QuestRt.canClaim?.(state, q.id)) return '그레타의 의뢰를 마쳤다';
    }
  } catch { /* 표시만 실패 */ }
  return null;
}

// ───────────────────────── 그림 ─────────────────────────
/** '기마 돌격' 반투명 탈것 (CMP-MOUNT-ART 의 drawMount 가 오기 전 간단한 실루엣) */
function drawSpectralMount(ctx, h, world) {
  const f = h.data.f ?? 1, col = h.data.color ?? '#ff6a4a', t = h.t;
  const fade = Math.min(1, t / 0.12, (h.life) / 0.2);
  ctx.translate(h.cx, h.y + h.h);
  ctx.scale(f, 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= 0.65 * fade;
  const gr = ctx.createLinearGradient(-90, 0, 70, 0);
  gr.addColorStop(0, col + '00'); gr.addColorStop(0.5, col + 'aa'); gr.addColorStop(1, '#ffffffcc');
  ctx.fillStyle = gr; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(-4, -72, 50, 22, 0, 0, TAU); ctx.fill();                 // 몸통
  ctx.beginPath(); ctx.moveTo(30, -84); ctx.quadraticCurveTo(46, -112, 58, -118); ctx.lineTo(70, -104); ctx.quadraticCurveTo(52, -96, 44, -70); ctx.fill();   // 목·머리
  const ph = t * 22;
  for (let i = 0; i < 4; i++) {                                                            // 다리 (질주)
    const lx = i < 2 ? 26 - i * 10 : -32 - (i - 2) * 10, sw = Math.sin(ph + i * 1.7) * 18;
    ctx.beginPath(); ctx.moveTo(lx, -56); ctx.lineTo(lx + sw * 0.5, -30); ctx.lineTo(lx + sw, -4); ctx.stroke();
  }
  ctx.globalAlpha *= 0.7;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-60 - i * 18, -60 - i * 9); ctx.lineTo(-140 - i * 24, -58 - i * 9); ctx.stroke(); }   // 잔상 줄
  void world;
}
