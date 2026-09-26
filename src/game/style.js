// 스타일 미터 (owner: FEEL-IMPACT) — DNF식 랭크 D~SSS, 알림(아나운서) 대기열, 콤보 이정표. feel.md §4.10, §6.1
// 계약: world.style = new Style(world)   (world.js 생성자, WORLD-CAM)
//  필드  pts(0..STYLE.max) · rank(0 = 없음, 1 = D … 7 = SSS) · best(이번 스테이지 최고 rank) · last6[] (최근 동작 기록)
//        rankInfo (현재 랭크 표 항목 | null) · progress (다음 랭크까지 0..1) · sinceHit (마지막 타격 후 초)
//        ann = { cur: {rank, r, word, sub, c, c2, age} | null, queue: [] }   ← feel_hud.drawAnnouncer 가 읽음 (age 초)
//        milestone = { n, age } | null                                       ← feel_hud 콤보 이정표 (10/25/50/…)
//        pulse (타격마다 0으로 초기화되는 초 — HUD 튀기기용)
//  메서드 onHit(info, attack, target)  world.onPlayerHit 가 호출 (info.cls/counter/back/air/otg/launched/moveId 사용)
//         onEvent(name, data)          FEEL-REACT·FEEL-MOVE 등이 사건 가점을 보냄:
//                                       'launch' 'wallBounce' 'groundBounce' 'bounce' 'counter' 'back' 'kill' 'chase' 'crit' 'stagger'
//                                       data = { target?, pts?(덮어쓰기) }. 같은 대상·같은 사건은 0.15초 안에 한 번만 센다.
//                                       ('multiKill' 은 onKill 이 스스로 판정하므로 무시)
//         onKill(e, attack)            world.onEnemyKilled 가 호출 (처치 +50, 0.5초 안 연속 처치 +60/추가 1명)
//         onHurt(dmg)                  world.onPlayerHurt 가 호출 (한 단계 아래 랭크 기준점으로 떨어짐)
//         update(dt)                   world.update 가 매 프레임 호출 (감쇠, 알림 대기열)
//         reset()                      점수·랭크 초기화
//  사건: 랭크 상승 시 bus 'styleRankUp' {rank, r}, 각성 게이지 +AW_GAIN.rankUp (콤보 이정표 bus 'comboMilestone' 은 world.js 가 보냄)
//  각성 게이지: 랭크 상승 +1, 벽·바닥 바운드 +3 은 여기서 더한다 (타격·치명·카운터·띄우기·처치·보스 관련 획득은 world.js).
import { STYLE, AW_GAIN } from '../data/feel_hit.js';
import { CLASSES } from '../data/classes.js';
import { audio, SFX } from '../core/audio.js';
import { bus } from '../core/events.js';

const EV_ALIAS = { wallbounce: 'wallBounce', groundbounce: 'groundBounce', ground_bounce: 'groundBounce', wall_bounce: 'wallBounce', backAttack: 'back', back_attack: 'back', staggerBreak: 'stagger', chaseJump: 'chase' };
const AW_EVENTS = { wallBounce: 'bounce', groundBounce: 'bounce', bounce: 'bounce' };   // 띄우기·카운터 게이지는 world.awOnHit

/** 효과음 이름이 등록돼 있을 때만 재생 (sfx_feel.js 가 아직 없으면 기본 삑 소리 대신 조용히) */
function sfxIf(name, o) { if (SFX[name]) audio.sfx(name, o); }

/**
 * 각성 게이지 가산 (feel §6.1): 전직 tier ≥ AW_GAIN.minTier 일 때만, × (1 + ultGain/200), 상한 100.
 * world.addAw 가 있으면 그쪽(WORLD-CAM)에 맡긴다. 반환: 실제 가산량
 */
export function addAwGain(world, n) {
  if (!(n > 0) || !world?.run) return 0;
  if (typeof world.addAw === 'function') return world.addAw(n) ?? 0;
  if (typeof world.gainAw === 'function') return world.gainAw(n) ?? 0;
  const cid = world.hero?.classId;
  const tier = (cid && CLASSES[cid]?.tier) ?? 0;
  if (tier < (AW_GAIN.minTier ?? 1)) return 0;
  const k = 1 + (world.player?.stats?.ultGain ?? 0) / (AW_GAIN.ultGainDiv ?? 200);
  const before = world.run.aw ?? 0;
  world.run.aw = Math.min(AW_GAIN.max ?? 100, before + n * k);
  return world.run.aw - before;
}

export class Style {
  constructor(world) {
    this.world = world;
    this.pts = 0;
    this.rank = 0;
    this.best = 0;
    this.last6 = [];          // [{id, hitId, v}] 최근 동작 (한 번의 휘두르기 = 1개)
    this.sinceHit = 99;
    this.pulse = 99;
    this.ann = { cur: null, queue: [] };
    this.milestone = null;
    this._kills = [];         // 최근 처치 시각
    this._ev = new Map();     // 사건 중복 방지: key → 시각
    this._mile = 0;           // 이번 콤보에서 지난 마지막 이정표
    this._t = 0;
  }
  get rankInfo() { return this.rank > 0 ? STYLE.ranks[this.rank - 1] : null; }
  /** 다음 랭크까지 진행도 0..1 (SSS 는 max 까지) */
  get progress() {
    const R = STYLE.ranks, lo = this.rank > 0 ? R[this.rank - 1].min : 0;
    const hi = this.rank < R.length ? R[this.rank].min : STYLE.max;
    return hi > lo ? Math.max(0, Math.min(1, (this.pts - lo) / (hi - lo))) : 1;
  }
  reset() {
    this.pts = 0; this.rank = 0; this.last6.length = 0; this.sinceHit = 99;
    this.ann.cur = null; this.ann.queue.length = 0; this.milestone = null; this._kills.length = 0; this._ev.clear(); this._mile = 0;
  }

  /** 점수 → 랭크 번호 */
  rankOf(pts) {
    const R = STYLE.ranks;
    let r = 0;
    for (let i = 0; i < R.length; i++) if (pts >= R[i].min) r = i + 1;
    return r;
  }
  add(n) {
    if (!(n > 0)) return;
    this.pts = Math.min(STYLE.max, this.pts + n);
    this.refresh(true);
  }
  /** 점수가 바뀐 뒤 랭크 갱신. up = 올라갈 때 알림/보상 */
  refresh(up) {
    const r = this.rankOf(this.pts);
    if (r > this.rank && up) {
      for (let k = this.rank + 1; k <= r; k++) this.rankUp(k);
    }
    this.rank = r;
    if (r > this.best) this.best = r;
  }
  rankUp(k) {
    const d = STYLE.ranks[k - 1];
    if (!d) return;
    const q = this.ann.queue, max = STYLE.announce?.queue ?? 2;
    q.push({ rank: k, r: d.r, word: d.word, sub: d.sub, c: d.c, c2: d.c2, age: 0 });
    while (q.length > max) q.shift();       // 오래된 것부터 버리고 최신 랭크를 남긴다
    addAwGain(this.world, AW_GAIN.rankUp ?? 1);
    bus.emit('styleRankUp', { rank: k, r: d.r });
  }

  onHit(info, attack, target) {
    if (!info || target?.kind === 'prop') return;
    const tags = attack?.tags;
    const cls = info.cls ?? 'L';
    const w = STYLE.weight[cls] ?? 1;
    this.sinceHit = 0; this.pulse = 0;
    const W = this.world;
    // 콤보 이정표 (world.combo.n 은 onPlayerHit 에서 이미 증가)
    const n = W?.combo?.n ?? 0;
    if (n < this._mile) this._mile = 0;
    for (const m of STYLE.milestones) {
      if (n >= m && this._mile < m) {
        this._mile = m;
        this.milestone = { n: m, age: 0 };
        const i = STYLE.milestones.indexOf(m);
        sfxIf('combo_milestone', { vol: 0.8, pitch: 1 + i * 0.08 });
      }
    }
    if (!(w > 0)) return;
    // 다양성: 같은 휘두르기(hitId)의 다단 히트는 첫 타의 배율을 이어 쓴다
    const id = info.moveId ?? attack?.moveId ?? (tags?.includes('sub') ? 'sub' : tags?.includes('skill') ? 'skill:' + (attack?.skillId ?? '') : tags?.[0] ?? 'x');
    const hid = info.swing ?? attack?.hitId ?? null;   // 다단 히트('pl12:0', 'pl12:1')는 한 번의 휘두르기
    const last = this.last6[this.last6.length - 1];
    let v;
    if (hid && last && last.hitId === hid) v = last.v;
    else {
      let same = 0;
      for (const e of this.last6) if (e.id === id) same++;
      const V = STYLE.variety;
      v = same === 0 ? V.fresh : same >= V.staleN ? V.stale : 1;
      this.last6.push({ id, hitId: hid, v });
      while (this.last6.length > (V.window ?? 6)) this.last6.shift();
    }
    let p = STYLE.base * w * v;
    if (info.air) p *= STYLE.air;
    if (info.otg) p *= STYLE.otg;
    const cmp = tags?.includes('companion');
    if (cmp) p *= STYLE.companion;
    const E = STYLE.events;
    let ev = 0;
    if (info.crit) ev += E.crit;
    if (info.counter && this.mark('counter', target)) ev += E.counter;
    if (info.back && this.mark('back', target)) ev += E.back;
    if (info.launched && this.mark('launch', target)) ev += E.launch;
    this.add(p + ev * (cmp ? STYLE.companion : 1));
  }

  /** 사건 중복 방지 (같은 대상·같은 사건 0.15초) — true 면 처음 */
  mark(name, target) {
    const key = name + ':' + (target && typeof target === 'object' ? idOf(target) : '-');
    const t0 = this._ev.get(key);
    if (t0 !== undefined && this._t - t0 < (STYLE.eventDedupe ?? 0.15)) return false;
    this._ev.set(key, this._t);
    if (this._ev.size > 48) { for (const [k, t] of this._ev) if (this._t - t > 1) this._ev.delete(k); }
    return true;
  }

  onEvent(name, data = {}) {
    name = EV_ALIAS[name] ?? name;
    if (name === 'multiKill' || name === 'multikill' || name === 'kill') return;   // onKill 이 처리
    const E = STYLE.events;
    const pts = data?.pts ?? E[name];
    if (!(pts > 0)) return;
    if (!this.mark(name, data?.target ?? data?.enemy)) return;
    this.sinceHit = Math.min(this.sinceHit, 0.2);
    this.add(pts);
    const aw = AW_EVENTS[name];
    if (aw && !data?.companion) addAwGain(this.world, AW_GAIN[aw] ?? 0);
  }

  onKill(e, attack) {
    if (!e || e.kind === 'prop') return;
    const E = STYLE.events, cmp = attack?.tags?.includes('companion');
    const win = STYLE.multiKillWindow ?? 0.5;
    const K = this._kills;
    while (K.length && this._t - K[0] > win) K.shift();
    K.push(this._t);
    let p = E.kill;
    if (K.length >= 2) p += E.multiKill;          // 두 번째 처치부터 추가 1명마다 +60
    this.sinceHit = 0;
    this.add(p * (cmp ? STYLE.companion : 1));
  }

  onHurt(dmg) {
    if (!(dmg > 0) || this.rank <= 0) return;
    const R = STYLE.ranks;
    this.pts = this.rank >= 2 ? R[this.rank - 2].min : 0;
    this.rank = this.rankOf(this.pts);
    this.last6.length = 0;
  }

  update(dt) {
    this._t += dt;
    this.sinceHit += dt; this.pulse += dt;
    if (this.pts > 0 && this.sinceHit > STYLE.decayDelay) {
      const idle = !(this.world?.combo?.n > 0);
      this.pts = Math.max(0, this.pts - (idle ? STYLE.decayIdle : STYLE.decay) * dt);
      this.rank = this.rankOf(this.pts);
    }
    if (!(this.world?.combo?.n > 0)) this._mile = 0;
    if (this.milestone) { this.milestone.age += dt; if (this.milestone.age > 1.2) this.milestone = null; }
    // 알림: 한 번에 하나, 0.8초 간격, 대기열 2
    const A = STYLE.announce, ann = this.ann;
    if (ann.cur) { ann.cur.age += dt; if (ann.cur.age >= A.hold + A.fade) ann.cur = null; }
    if (ann.queue.length && (!ann.cur || ann.cur.age >= A.gap)) {
      ann.cur = ann.queue.shift();
      ann.cur.age = 0;
      sfxIf('rank_up', { vol: 0.8, pitch: 0.9 + ann.cur.rank * 0.06 });
      sfxIf('announce', { vol: 0.7, pitch: 0.92 + ann.cur.rank * 0.05 });
    }
  }
}

let _uid = 0;
function idOf(t) { return t._styleId ??= ++_uid; }
