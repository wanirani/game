// 타격 손맛 핵심 (owner: FEEL-IMPACT) — feel.md §4.1, §4.6–4.10, §6.1; MASTER_PLAN §1.11, §1.14
// combat.hitTarget 이 차례로 부른다:
//   const pi = preImpact(world, attack, target, rehit)   강도 등급·카운터·백어택·공중·다운 판정, 파생 공격(백어택 치명 +15%, MV_SCALE)
//   const res = computeDamage(src, target, pi.attack)
//   modDamage(world, pi, res, target)                    카운터 ×1.25, 다운 추가타 ×0.8/×1.2, attack.capFn 상한
//   target.takeHit(res.dmg, pi.attack, world, info)       info = hitInfo(pi, res, hx, hy, target)
//   impact(world, pi.attack, target, info)               경직(누적 상한), 카메라 반동·트라우마, 진동, 타격 스프라이트·재질 파편·
//                                                         속성 강조·자국, 데미지 숫자, 판정 문구, 효과음, bus hitCrit/hitHeavy
//
// takeHit 에 넘기는 info 필드 (enemy.js·보스가 읽을 수 있음):
//   dmg crit weak resist capped hx hy                     computeDamage 결과 (+ 상한 적용 여부)
//   cls 'L'|'M'|'H'|'F'|'U'|'S'|'A'|'hurt'                강도 등급 (플레이어 피격은 'hurt')
//   counter back air otg otgStrong gb                    카운터 · 백어택 · 대상 공중 · 다운 추가타 · 강한 다운 추가타 · 바닥 바운드 동작
//   stunAdd                                              카운터 경직 가산(초)
//   moveId cont swing fxType prop part                   동작 id · 같은 휘두르기의 연속 타격 · 휘두르기 id · 스프라이트 종류 · 소품 · 맞은 부위
//   hpBefore                                             타격 직전 대상 체력
// takeHit 뒤 impact 가 더하는 필드: killed, landed(플레이어 피격이 실제로 들어갔는가), launched(띄우기 성공), hitstop(실제 적용 초),
//   overkill (처치 시 (dmg - hpBefore) / maxHp)
// 대상에 남기는 필드: target.hsShake(초, 피격 떨림) · target.hsCls(등급 순번) · target.lastImpact {cls, crit, dmg, hpBefore, counter, back, t}
//   (world.onEnemyKilled 의 오버킬 판정용: 처치 타격의 dmg - hpBefore)
// 플레이어에 남기는 필드: p.lastLaunch {t, target} (추격 점프 판정, FEEL-MOVE)
//
// attack.capFn(target, dmg, world) → 이번 타격이 줄 수 있는 최대 피해 (각성기 보스 상한 30%, AWAKEN-CORE).
//   반환값이 dmg 보다 작으면 그 값으로 줄이고 res.capped = true, 1 이하이면 '저항' 숫자로 표시.
// attack.final = true → 필살기(S)·각성기(A) 마지막 일격. attack.hitstop === 0 은 경직 0 을 유지 (수호신 자동 공격 등).
// 경직 누적 상한: world.freezeLog = [[game.time, 초, 면제?], …], 1초 창 안의 합 ≤ HS_CAP (S·A 제외, 프레임 단위).
import { rand, clamp } from '../core/math.js';
import { audio, SFX } from '../core/audio.js';
import { bus } from '../core/events.js';
import { input } from '../core/input.js';
import { FONT } from '../core/ui.js';
import * as HITFX_MOD from '../render/hitfx.js';
import { MOVESETS } from '../data/movesets.js';
import {
  CLASS_INDEX, STRENGTH_RULES, FEEL_MOVE_OVERRIDES, HITSTOP, HS_CAP, HS_WINDOW, IMPACT_CAM, HIT_SFX, COUNTER, BACK, CALLOUT,
  MATERIAL, HIT_SPRITE, DMG_STYLE, RUMBLE, BUDGET, WEIGHT, DOWN, JUGGLE, MV_SCALE,
} from '../data/feel_hit.js';

export const ELEMENT_COLORS = {
  fire: '#ff7a2a', ice: '#9fe8ff', holy: '#fff2a0', dark: '#b060ff', thunder: '#bfe0ff', none: '#ffffff',
};
export const ELEMENT_NAMES = { fire: '화염', ice: '냉기', holy: '신성', dark: '암흑', thunder: '번개' };
const EL_PRESET = { fire: 'fire', ice: 'ice', holy: 'holy', dark: 'dark', thunder: 'thunder' };
const SIZE_I = { L: 0, M: 1, H: 2, F: 3, U: 0, S: 3, A: 3 };
const FRAME = 1 / 60;
let HFX = HITFX_MOD;   // render/hitfx.js (FEEL-REACT); 테스트는 IMPACT_DEBUG.useHitfx 로 바꿔 끼운다

// ───────────────────────── 동작 색인 ─────────────────────────
let MOVE_IX = null;
function moveIndex() {
  if (MOVE_IX) return MOVE_IX;
  MOVE_IX = new Map();
  for (const [wt, set] of Object.entries(MOVESETS)) {
    for (const v of Object.values(set)) for (const m of Array.isArray(v) ? v : [v]) if (m?.id && !MOVE_IX.has(m.id)) MOVE_IX.set(m.id, { mv: m, wt });
  }
  return MOVE_IX;
}
/** attack → { id, mv, wt } (moveId 가 없으면 플레이어의 현재 휘두르기에서 추정) */
function resolveMove(attack) {
  const o = attack.owner;
  let id = attack.moveId ?? null, mv = null, wt = null;
  if (!id && o?.kind === 'player' && o.move?.id && attack.hitId != null && attack.hitId === o.curHitId) id = o.move.id;
  if (id) {
    const e = moveIndex().get(id);
    if (e) { mv = e.mv; wt = e.wt; }
    if (o?.kind === 'player' && o.move?.id === id) mv = o.move;   // 탑승 중 adaptMove 된 사본 포함
  }
  return { id, mv, wt };
}

// ───────────────────────── 강도 등급 ─────────────────────────
/** 공격의 강도 등급 (feel §4.1 규칙 순서; FEEL_MOVE_OVERRIDES 우선) */
export function strengthClass(attack, mv = null, id = attack?.moveId ?? mv?.id ?? null) {
  const ov = id ? FEEL_MOVE_OVERRIDES[id] : null;
  if (ov?.cls) return ov.cls;
  const tags = attack.tags || [];
  const hs = attack.hitstop ?? mv?.hitstop ?? 0.05;
  const sid = typeof id === 'string' ? id : '';
  const gp = !!mv?.groundPound || (typeof attack.hitId === 'string' && attack.hitId.endsWith('gp'));
  for (const r of STRENGTH_RULES) {
    if (r.tag && !tags.includes(r.tag)) continue;
    if (r.final) { if (attack.final || hs >= (r.finalHitstop ?? 1e9) - 1e-9) return r.cls; continue; }
    // 나머지 조건은 '하나라도' 맞으면 이 등급 (조건이 없으면 기본 규칙)
    let has = false, any = false;
    const test = (on, ok) => { if (on) { has = true; if (ok) any = true; } };
    test(r.tagAny, r.tagAny && r.tagAny.some((t) => tags.includes(t)));
    test(r.finisher, mv?.finisher || attack.finisher);
    test(r.charge, sid.endsWith('Charge'));
    test(r.launch, attack.launch);
    test(r.dash, sid.endsWith('Dash'));
    test(r.down, sid.endsWith('Down'));
    test(r.groundPound, gp);
    test(r.hitstopMin !== undefined, hs >= (r.hitstopMin ?? 0) - 1e-9);
    if (!has || any) return r.cls;
  }
  return 'L';
}

// ───────────────────────── 판정 보조 ─────────────────────────
/** 대상이 공격 동작(윈드업) 중인가 — 카운터 */
export function isCounterState(t) {
  if (!t || t.kind === 'prop' || t.dying > 0) return false;
  if (t.telegraph) return true;
  if (t.kind === 'boss') return false;
  const s = t.state;
  if (!s || t.didHit) return false;
  return COUNTER.states.includes(s) && (t.stateT ?? 0) < COUNTER.maxStateT;
}
function isBack(t, attack) {
  if (!t || t.kind === 'boss' || t.kind === 'prop' || t.facing === undefined || !attack.dir) return false;
  return Math.sign(t.facing) === Math.sign(attack.dir);
}
function isAirborne(t) { return !!t && t.kind === 'enemy' && !t.noGravity && !t.onGround && !(t.down > 0); }
function fxTypeOf(attack, mv, wt) {
  const o = attack.owner, tags = attack.tags || [];
  let f = attack.fx ?? mv?.fx;
  if (!f && attack.element && (tags.includes('skill') || tags.includes('ult') || tags.includes('awaken'))) f = 'magic';
  if (!f) f = HIT_SPRITE.byWeapon[wt ?? o?.stats?.weaponType ?? o?.ch?.weaponType] ?? 'slash';
  return HIT_SPRITE.byFx[f] ?? 'cut';
}
function qualityKey(world) { const q = world.fx?.quality ?? 1; return q >= 0.95 ? 'high' : q >= 0.7 ? 'medium' : 'low'; }
function weightOf(t) {
  if (!t) return 'LIGHT';
  if (t.kind === 'boss') return 'BOSS';
  if (t.wclass) return t.wclass;
  const r = t.def?.fixed ? 1 : (t.def?.kbResist ?? 0);
  for (const k of ['FIXED', 'HEAVY', 'MEDIUM']) if (r >= (WEIGHT[k]?.rule?.[0] ?? 9)) return k;
  return 'LIGHT';
}
const hasTag = (a, t) => !!a.tags && a.tags.includes(t);

// ───────────────────────── preImpact / modDamage ─────────────────────────
/**
 * 타격 전 판정. rehit = 같은 hitId 의 재타격(지속 판정).
 * 반환 pi = { attack(파생), cls, counter, back, air, otg, otgStrong, gb, moveId, mv, wt, cont, swing, fxType, prop, hurt }
 */
export function preImpact(world, attack, target, rehit = false) {
  const pi = { attack, cls: 'L', counter: false, back: false, air: false, otg: false, otgStrong: false, gb: false, moveId: null, mv: null, wt: null, cont: !!rehit, swing: null, fxType: 'cut', prop: target?.kind === 'prop', hurt: false };
  if (attack.team !== 'player') { pi.cls = 'hurt'; pi.hurt = target?.kind === 'player'; return pi; }
  // 같은 휘두르기(hitId 'pl12:3' → 'pl12')의 두 번째 타격부터 = 연속 타격(1프레임 경직)
  const hid = attack.hitId;
  if (typeof hid === 'string') { const i = hid.lastIndexOf(':'); pi.swing = i > 0 ? hid.slice(0, i) : hid; } else pi.swing = hid ?? null;
  if (pi.swing != null && target) {
    if (target._impSwing === pi.swing) pi.cont = true;
    target._impSwing = pi.swing;
  }
  const r = resolveMove(attack);
  pi.moveId = r.id; pi.mv = r.mv; pi.wt = r.wt;
  pi.fxType = fxTypeOf(attack, r.mv, r.wt);
  if (pi.prop) return pi;
  const ov = r.id ? FEEL_MOVE_OVERRIDES[r.id] : null;
  pi.cls = strengthClass(attack, r.mv, r.id);
  const cmp = hasTag(attack, 'companion');
  if (!cmp && !hasTag(attack, 'ult') && !hasTag(attack, 'awaken')) { pi.counter = isCounterState(target); pi.back = isBack(target, attack); }
  pi.air = isAirborne(target);
  pi.otg = target.down > 0;
  pi.otgStrong = pi.otg && !!(ov?.otg || attack.otg || r.mv?.groundPound || r.mv?.pogo);
  pi.gb = !!(ov?.gb || attack.gb || (attack.kb?.[1] ?? 0) > 0);
  let crit = attack.crit ?? 0, mult = attack.mult ?? 1, changed = false;
  if (pi.back) { crit += BACK.crit; changed = true; }
  const sc = r.id && attack.owner?.kind === 'player' ? MV_SCALE[r.id] : undefined;
  if (sc && sc !== 1) { mult *= sc; changed = true; }
  if (changed) pi.attack = { ...attack, crit, mult };
  return pi;
}

/** 계산된 피해에 카운터·다운 추가타·상한(capFn)을 반영 (res 를 고쳐서 돌려준다) */
export function modDamage(world, pi, res, target) {
  if (!res || pi.hurt || pi.prop) return res;
  const a = pi.attack;
  let d = res.dmg;
  if (d > 0 && !a.flat) {
    if (pi.counter) d *= COUNTER.mul;
    if (pi.otg) d *= pi.otgStrong ? DOWN.otgStrongMul : DOWN.otgMul;
    d = Math.max(1, Math.round(d));
  }
  if (typeof a.capFn === 'function' && d > 0) {
    let c;
    try { c = a.capFn(target, d, world); } catch (e) { console.warn('capFn', e); }
    if (Number.isFinite(c) && c < d) { d = Math.max(0, Math.round(c)); res.capped = true; if (d <= 1) res.resist = true; }
  }
  res.dmg = d;
  return res;
}

/** takeHit 에 넘길 info */
export function hitInfo(pi, res, hx, hy, target) {
  return {
    ...res, hx, hy,
    cls: pi.cls, counter: pi.counter, back: pi.back, air: pi.air, otg: pi.otg, otgStrong: pi.otgStrong, gb: pi.gb,
    stunAdd: pi.counter ? COUNTER.stunAdd : 0,
    moveId: pi.moveId, cont: pi.cont, swing: pi.swing, fxType: pi.fxType, prop: pi.prop,
    part: target?.hitParts ? (target.hitPart ?? null) : null,
    hpBefore: target?.hp ?? null,
  };
}

// ───────────────────────── 경직 (히트스톱) ─────────────────────────
/**
 * 월드 정지 적용. 프레임 단위로 반올림하고, 1초 창 누적 HS_CAP 을 넘지 않게 줄인다 (S·A 등급은 면제).
 * 같은 프레임의 여러 타격은 합치지 않고 가장 긴 것 하나 (world.freezeLog 한 항목).
 * 반환: 실제로 적용된 정지 시간(초)
 */
export function applyHitstop(world, dur, cls = 'L') {
  if (!(dur > 0) || !world) return 0;
  let frames = Math.max(1, Math.round(dur / FRAME));
  const now = world.game?.time ?? world.time ?? 0;
  const log = (world.freezeLog ??= []);
  while (log.length && now - log[0][0] > HS_WINDOW + 0.5) log.shift();
  const exempt = (HITSTOP.exempt || []).includes(cls);
  const last = log[log.length - 1];
  const cur = last && last[0] === now ? last : null;
  const curFrames = cur ? Math.round(cur[1] / FRAME) : 0;
  if (!exempt) {
    let used = 0;
    for (const e of log) {
      if (e === cur || e[2]) continue;
      const a = Math.max(e[0], now - HS_WINDOW), b = Math.min(e[0] + e[1], now);
      if (b > a) used += b - a;
    }
    const allow = Math.max(0, Math.floor((HS_CAP - used) / FRAME + 1e-6));
    frames = Math.min(frames, allow);
  }
  if (cur) {
    if (frames <= curFrames) return 0;
    cur[1] = frames * FRAME;
    if (exempt) cur[2] = 1;
  } else {
    if (frames <= 0) return 0;
    log.push([now, frames * FRAME, exempt ? 1 : 0]);
    if (log.length > 96) log.shift();
  }
  const add = frames * FRAME - 1e-4;
  const before = world.hitstop ?? 0;
  if (add > before) world.hitstop = add;
  return (frames - curFrames) * FRAME;
}

// ───────────────────────── 연출 보조 ─────────────────────────
/** 등록된 효과음만 재생 (sfx_feel.js 이름이 아직 없으면 기본 삑 소리 대신 조용히). 예산·재질 층 상한은 audio.js 가 적용 */
function sfxHas(name) { return !!name && (audio.has ? audio.has(name) : !!SFX[name]); }
function sfxPlay(name, o) { if (!sfxHas(name)) return false; audio.sfx(name, o); return true; }

let _hfxLive = null, _hfxCheckT = -1e9;
/** render/hitfx.js 가 실제 구현인가 (스텁은 캐시 스프라이트로 null 을 돌려준다) */
function hitfxLive() {
  if (_hfxLive) return true;
  const now = performance.now();
  if (now - _hfxCheckT < 2000) return false;
  _hfxCheckT = now;
  try { _hfxLive = !!HFX.glow?.('#ffffff'); } catch { _hfxLive = false; }
  return _hfxLive;
}

/** 캐시 스프라이트 한 장을 가산 합성으로 튀겨 그린다 (0.7→1.2배로 2프레임 안에 커졌다가 사라짐) */
function emitSprite(fx, img, x, y, size, angle = 0, life = 0.12, alpha = 1) {
  if (!img || !fx?.ghost) return;
  const iw = img.width || 1, ih = img.height || 1, s0 = size / Math.max(iw, ih);
  fx.ghost((ctx, a) => {
    const k = clamp(1 - a * 2, 0, 1);
    const sc = s0 * (k < 0.15 ? 0.7 + (k / 0.15) * 0.5 : 1.2 - (k - 0.15) * 0.25);
    const al = alpha * (k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65);
    if (al <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = al;
    ctx.translate(x, y); if (angle) ctx.rotate(angle);
    ctx.drawImage(img, -iw * sc / 2, -ih * sc / 2, iw * sc, ih * sc);
    ctx.restore();
  }, life, 'front');
}
/** 품질 예산에 맞춘 정확한 개수 방출 (fx.burst 의 품질 배율을 두 번 곱하지 않도록) */
function emitN(fx, type, x, y, n, opts) {
  const k = Math.round(n);
  for (let i = 0; i < k; i++) fx.emit(type, x, y, opts);
  return k;
}

/** 필드 위 판정 문구 ('COUNTER', 'BACK ATTACK', '벽 바운드!' …). showDamage 가 꺼지면 숨김 */
export function callout(world, x, y, text, o = {}) {
  if (!world?.fx || world.game?.settings?.showDamage === false) return;
  const size = o.size ?? CALLOUT.size;
  const opts = { color: o.color ?? CALLOUT.color, size, life: o.life ?? CALLOUT.life, vy: o.vy ?? CALLOUT.vy, outline: o.outline ?? CALLOUT.outline, skew: CALLOUT.skew };
  if (typeof world.fx.callout === 'function') { world.fx.callout(x, y, text, opts); return; }
  world.fx.text(x, y, text, { ...opts, font: `italic 900 ${size}px ${FONT.dmg ?? FONT.num}` });
}

/** 데미지 숫자 (fx.dmg 가 있으면 아틀라스, 없으면 기존 fx.text + 간단한 숫자 기둥) */
export function dmgNumber(world, target, value, key = 'normal', o = {}) {
  const fx = world?.fx;
  if (!fx || world.game?.settings?.showDamage === false) return;
  const st = DMG_STYLE[key] ?? DMG_STYLE.normal;
  const x = o.x ?? target?.cx ?? 0, y = o.y ?? (target ? target.y : 0);
  if (typeof fx.dmg === 'function') { fx.dmg(target, value, key, { x, y, color: o.color ?? null, style: st }); return; }
  // 기존 방식: 0.5초 안에 이어진 숫자는 16px 씩 위로 쌓는다
  const C = DMG_STYLE.column, now = world.time ?? 0;
  let dy = 0;
  if (target && key !== 'hurt' && key !== 'heal') {
    const col = (target._dmgCol ??= { n: -1, t: -9, total: 0 });
    if (now - col.t < C.gap) col.n = (col.n + 1) % C.height; else { col.n = 0; col.total = 0; }
    col.t = now; col.total += value;
    dy = -col.n * C.step;
  }
  // 살아 있는 숫자 상한 (feel §4.8: 24 / 보통 16 / 낮음 10). 넘으면 기둥 합계에만 더한다 (플레이어 피격 숫자는 항상)
  if (key !== 'hurt') {
    const live = (world._dmgLive ??= []);
    while (live.length && live[0] <= now) live.shift();
    if (live.length >= (BUDGET[qualityKey(world)]?.dmgNums ?? 24)) return;
    live.push(now + 0.9);
  }
  const str = key === 'crit' ? `${value}!` : key === 'heal' ? `+${value}` : String(value);
  fx.text(x, y + dy, str, { color: o.color ?? st.color, size: st.size, crit: key === 'crit', outline: st.outline ?? '#200008', vy: st.fall ? 60 : -90 });
}

// ───────────────────────── impact ─────────────────────────
/** 타격 연출 전체. hitTarget 이 takeHit 뒤에 부른다 */
export function impact(world, attack, target, info) {
  if (!world || !target || !info) return;
  if (attack.team !== 'player') { hurtImpact(world, attack, target, info); return; }
  const fx = world.fx, cls = info.cls ?? 'L';
  const px = info.hx ?? target.cx, py = info.hy ?? target.cy;
  const dir = attack.dir > 0 ? 1 : attack.dir < 0 ? -1 : (px >= (attack.owner?.cx ?? px) ? 1 : -1);
  const cmp = hasTag(attack, 'companion'), guard = hasTag(attack, 'guardian'), mount = hasTag(attack, 'mount');
  const killed = !!info.killed;
  // 초과 피해 비율 (world.overkillSlowmo: F·치명 처치에서 ≥ 0.5 이면 '오버킬!')
  if (killed && info.hpBefore > 0) { const mx = target.stats?.maxHp ?? 0; if (mx > 0) info.overkill = (info.dmg - info.hpBefore) / mx; }
  // 띄우기 성공 (스타일 +30, 추격 점프 창)
  if (attack.launch && !info.cont && !killed && target.kind === 'enemy' && !target.noGravity && (target.vy ?? 0) < -150) {
    info.launched = true;
    if (attack.owner?.kind === 'player') attack.owner.lastLaunch = { t: world.time, target };
  }
  // 1) 경직
  let hs;
  if (attack.hitstop === 0) hs = 0;   // 명시한 0 은 소품(촛불·거울 스위치)을 쳐도 0 (수호신 자동 공격·오라)
  else if (cmp || mount) hs = attack.hitstop ?? 0;
  else if (info.prop) hs = HITSTOP.prop;
  else if (info.cont) hs = HITSTOP.cont;
  else {
    const ov = info.moveId ? FEEL_MOVE_OVERRIDES[info.moveId] : null;
    hs = ov?.hitstop ?? (cls === 'L' && info.fxType === 'bullet' ? HITSTOP.gun : HITSTOP[cls] ?? HITSTOP.L);
    if (cls === 'L' || cls === 'M' || cls === 'H' || cls === 'F') {
      const M = HITSTOP.mod;
      let f = 0;
      if (info.crit) f += M.crit;
      if (info.counter) f += M.counter;
      if (killed && target.kind !== 'prop') f += target.elite ? M.eliteKill : M.kill;
      hs += f * FRAME;
    }
  }
  info.hitstop = hs > 0 ? applyHitstop(world, hs, info.prop ? 'L' : cls) : 0;
  if (!info.prop && (info.hitstop > 0 || hs > 0)) {
    target.hsShake = Math.max(target.hsShake ?? 0, Math.max(info.hitstop, world.hitstop ?? 0));
    target.hsCls = CLASS_INDEX[cls] ?? 0;
  }
  // 2) 카메라
  camImpact(world, attack, info, info.prop ? 'prop' : cls, dir, cmp, guard);
  // 3) 전투 기록 (콤보·점수·SP·흡혈·스타일·각성 게이지)
  world.onPlayerHit?.(target, info, attack);
  // 4) 시각 효과
  if (fx) {
    try { hitVisuals(world, attack, target, info, cls, px, py, dir); } catch (e) { console.warn('hitVisuals', e); }
  }
  // 5) 숫자와 판정 문구
  if (!info.prop) {
    const key = info.capped && info.dmg <= 1 ? 'resist' : info.crit ? 'crit' : (cls === 'U' || cls === 'S' || cls === 'A') ? 'ult' : info.counter ? 'counter' : info.weak ? 'weak' : info.resist ? 'resist' : 'normal';
    dmgNumber(world, target, info.dmg, key, { x: px, y: py - 20, color: info.crit ? null : attack.dmgColor ?? null });
    if (info.counter) callout(world, px, py - 44, COUNTER.callout, { color: COUNTER.color });
    if (info.back) callout(world, px, py - (info.counter ? 60 : 44), BACK.callout, { color: BACK.color, size: CALLOUT.small });
  }
  // 6) 효과음 (경직 0 잔타는 동료 타격처럼 작게, 재질 층 없이)
  hitSounds(world, attack, target, info, cls, cmp || attack.hitstop === 0);
  // 7) 진동과 이벤트 (경직 0 잔타는 진동 없음: 오라가 0.35초마다 진동을 울리지 않게)
  if (!info.prop && !guard && cls !== 'U' && attack.hitstop !== 0) {
    const R = RUMBLE[cls];
    if (R) {
      let [s, w, ms] = R;
      if (info.crit) { w = Math.max(w, RUMBLE.crit[1]); ms = Math.max(ms, RUMBLE.crit[2]); }
      input.rumble?.(s, w, ms);
    }
  }
  if (!info.prop && !cmp) {
    if (info.crit) bus.emit('hitCrit', { target, cls });
    if (cls === 'F' || cls === 'S' || cls === 'A') bus.emit('hitHeavy', { cls, target });
  }
  // 8) 공중 타격 부양 (플레이어가 공중에서 근접 타격을 맞히면 살짝 떠서 높이를 맞춘다; 체공 1회당 floatMax 번, 휘두르기 1회 = 1번)
  const p = attack.owner;
  if (p?.kind === 'player' && !info.prop && !info.cont && hasTag(attack, 'melee') && !mount && !p.mount?.riding) {
    const mv = p.move;
    if (p.onGround) { p._hfN = 0; p._hfAir = null; }
    else if (!(mv?.vy > 0) && !mv?.pogo && !mv?.groundPound && !(typeof info.moveId === 'string' && info.moveId.endsWith('Down'))) {
      if (newAirtime(p, world)) p._hfN = 0;
      const sw = info.swing ?? attack.hitId ?? null;
      if ((p._hfN ?? 0) < JUGGLE.floatMax && (sw == null || sw !== p._hfSwing)) {
        p._hfN = (p._hfN ?? 0) + 1; p._hfT = world.time; p._hfSwing = sw;
        p.vy = Math.min(p.vy, JUGGLE.floatVy);
      }
    }
  }
}

/**
 * 부양 횟수를 새로 셀 체공인가 (착지 후 다시 뜬 경우). player.update 는 공중에서 coyote 를 매 스텝 dt 씩 줄이고 t 를 dt 씩
 * 늘리므로 t + coyote 는 한 번의 이륙(점프·낭떠러지) 동안 일정하다. 공중 점프(2단 점프)로 바뀐 값은 남은 공중 점프가
 * 줄어 있으니 같은 체공으로 본다. 이 필드들이 없으면 마지막 부양 뒤 0.9초로 대신 판정.
 */
function newAirtime(p, world) {
  const key = Number.isFinite(p.t) && Number.isFinite(p.coyote) ? Math.round((p.t + p.coyote) * 60) : null;
  if (key === null) return world.time - (p._hfT ?? -9) > 0.9;
  if (p._hfAir === key) return false;
  const prev = p._hfAir;
  p._hfAir = key;
  if (prev == null) return true;
  const maxAJ = typeof p.maxAirJumps === 'function' ? p.maxAirJumps() : null;
  return !(Number.isFinite(maxAJ) && Number.isFinite(p.airJumpsLeft) && p.airJumpsLeft < maxAJ);
}

function camImpact(world, attack, info, cls, dir, cmp, guard) {
  const cam = world.camera;
  if (!cam) return;
  const C = IMPACT_CAM[cls] ?? IMPACT_CAM.L;
  let kick = C.kick, tr = C.trauma;
  const sh = attack.shake ?? 0;
  if (cmp) { kick = Math.min(kick, sh || 0.6); tr = guard ? 0 : tr * 0.3; }
  else if (attack.hitstop === 0) { kick = Math.min(kick, sh); tr = Math.min(tr, sh / 22) * 0.5; }   // 경직 0 을 명시한 잔타(성광 오라·난무): attack.shake 만큼만
  else if (!info.cont) { kick = Math.max(kick, sh * 0.8); tr = Math.max(tr, Math.min(0.7, sh / 22)); }
  else { kick *= 0.5; tr *= 0.5; }
  if (info.crit && !cmp) { kick *= IMPACT_CAM.critMul; tr *= IMPACT_CAM.critMul; }
  if (typeof cam.kick === 'function') {
    // 한 프레임에 여러 대상을 맞혀도 반동·트라우마는 더하지 않고 가장 큰 것 하나 (경직과 같은 규칙: 5마리 = 1마리)
    const now = world.game?.time ?? world.time ?? 0;
    let F = world._impCam;
    if (!F || F.t !== now) F = world._impCam = { t: now, kick: 0, tr: 0 };
    if (kick > F.kick) { const d = kick - F.kick; cam.kick(dir * d, (attack.kb?.[1] ?? 0) > 0 ? d * 0.5 : 0); F.kick = kick; }
    if (tr > F.tr) { cam.addTrauma?.(tr - F.tr); F.tr = tr; }
  } else {
    const heavy = (attack.hitstop ?? 0) >= 0.08 || info.crit;
    cam.shake((attack.shake ?? 3) * (info.crit ? 1.6 : 1), heavy ? 0.22 : 0.12);
  }
}

function hitVisuals(world, attack, target, info, cls, px, py, dir) {
  const fx = world.fx;
  const q = qualityKey(world), qk = (BUDGET[q]?.perHit ?? 28) / 28;
  const el = attack.element && attack.element !== 'none' ? attack.element : null;
  const rim = el ? ELEMENT_COLORS[el] : '#ffffff';
  const mat = info.prop ? 'prop' : (info.part?.armor ? 'metal' : target.def?.material ?? 'flesh');
  const ci = SIZE_I[cls] ?? 0, typ = info.fxType ?? 'cut';
  const theta = dir > 0 ? 0 : Math.PI;
  const small = cls === 'U' || info.cont;
  const sk = small ? 0.75 : cls === 'S' || cls === 'A' ? 1.3 : 1;
  const spr = HIT_SPRITE[typ] ?? HIT_SPRITE.cut;
  const size = (spr.size[ci] ?? spr.size[0]) * sk;
  if (hitfxLive()) {
    // (1) 무기 타격 스프라이트
    let img = null, ang = 0;
    const swing = info.moveId ? moveIndex().get(info.moveId)?.mv?.slash?.angle ?? 0 : 0;
    if (typ === 'cut') { img = HFX.cut(rim); ang = (dir > 0 ? swing : Math.PI - swing) + rand(-0.3, 0.3); }
    else if (typ === 'streak') { img = HFX.streak(rim); ang = theta; }
    else if (typ === 'star') { img = HFX.star(rim); ang = rand(0, Math.PI); }
    else if (typ === 'bullet') { img = HFX.star('#fff0b0'); ang = rand(0, Math.PI); }
    else img = HFX.glow(rim);
    emitSprite(fx, img, px, py, size, ang, spr.life);
    if (typ === 'star' && !small) emitSprite(fx, HFX.ring(rim), px, py, size * 1.4, 0, spr.life * 1.4, 0.8);
    if (info.counter) emitSprite(fx, HFX.star(COUNTER.color), px, py, 80, rand(0, 1), 0.16);
    if (info.crit && !small) emitSprite(fx, HFX.star('#ffe080'), px, py, size * 0.9, rand(0, 1), 0.16, 0.9);
    // (2) 재질 파편 (hitfx 가 예산 안에서 방출; 소품은 불꽃 몇 개)
    if (mat === 'prop') emitN(fx, 'spark', px, py, 4 * qk, { color: MATERIAL.prop.color });
    else if (!small || Math.random() < 0.5) HFX.materialBurst(fx, mat, px, py, dir, small ? 'L' : (cls === 'S' || cls === 'A') ? 'F' : cls, el ? rim : null);   // hitfx 표는 L/M/H/F
    // (3) 속성 강조
    if (el && EL_PRESET[el]) emitN(fx, EL_PRESET[el], px, py, (small ? 3 : 6) * qk, {});
    // (4) 자국
    const M = MATERIAL[mat];
    if (M?.decal && q !== 'low' && !small) {
      const p = cls === 'H' || cls === 'F' || cls === 'S' || cls === 'A' ? (M.decalHeavy ?? M.decal) : M.decal;
      if (Math.random() < p) HFX.stampDecal(world, px, py, dir, mat);
    }
    return;
  }
  legacyVisuals(world, fx, attack, info, cls, px, py, dir, mat, rim, el, qk, small, typ, size);
}

/** hitfx 가 아직 스텁일 때의 대체 연출 (기존 파티클 종류만 사용, 한 타격 파티클 ≤ BUDGET.perHit) */
function legacyVisuals(world, fx, attack, info, cls, px, py, dir, mat, rim, el, qk, small, typ, size) {
  const ci = SIZE_I[cls] ?? 0, theta = dir > 0 ? 0 : Math.PI;
  const heavy = ci >= 2 || info.crit;
  const cap = BUDGET[qualityKey(world)]?.perHit ?? 28;
  const rings = small ? 0 : (info.crit ? 1 : 0) + (info.counter ? 1 : 0) + ((cls === 'F' || cls === 'S' || cls === 'A') ? 1 : 0);
  fx.flash(px, py, { color: info.counter ? COUNTER.color : rim, size: small ? 34 : [48, 58, 72, 92][ci], life: 0.1 });
  let n = 1 + rings;   // 섬광 1 + 고리를 예산에 미리 넣는다
  const put = (type, k, opts) => { const m = Math.min(Math.round(k), Math.max(0, cap - n)); n += emitN(fx, type, px, py, m, opts); };
  put('hit', (small ? 3 : [5, 6, 8, 10][ci]) * qk, { color: rim, angle: theta, spread: typ === 'streak' ? 0.5 : 1.1 });
  const M = MATERIAL[mat] ?? MATERIAL.flesh;
  const cnt = (M.n?.[Math.min(3, ci)] ?? 6) * (small ? 0.4 : 1) * qk;
  const extra = !small && qk > 0.5;   // 연기·먼지 한 개짜리 덧층은 낮은 품질에서 생략
  switch (mat) {
    case 'flesh':
      put('blood', cnt * 0.8, { angle: dir > 0 ? -0.35 : Math.PI + 0.35, spread: M.cone ?? 0.5, speed: 300 });
      if (heavy && extra) put('smoke', 1, { color: M.mist, alpha: 0.4, speed: 40 });
      break;
    case 'bone': put('shard', cnt, { color: M.color, size: 3 }); if (extra) put('dust', 1, {}); break;
    case 'metal': put('spark', cnt * 0.8, { color: M.color, speed: 500, grav: M.grav }); break;
    case 'ghost': put('soul', cnt, {}); if (extra && n < cap) { fx.ring(px, py, { color: '#8affc8', r0: 6, r1: 46, life: 0.3, width: 3 }); n++; } break;
    case 'stone': put('shard', cnt, { color: M.color }); if (extra) put('dust', 2, {}); break;
    case 'slime': put('blood', cnt, { color: M.color }); break;
    case 'paper': put('shard', cnt, { color: M.color, grav: 200 }); break;
    case 'ice': put('ice', cnt, {}); if (extra) put('smoke', 1, { color: M.mist, alpha: 0.3 }); break;
    case 'fire': put('ember', cnt, {}); if (extra) put('fire', 1, {}); break;
    case 'prop': put('spark', 3 * qk, { color: M.color }); break;
    default: break;
  }
  if (el && EL_PRESET[el]) put(EL_PRESET[el], 6 * qk, {});
  if (info.crit && !small) fx.ring(px, py, { color: '#ffe080', r0: 6, r1: 60, life: 0.25, width: 5 });
  if (info.counter && !small) fx.ring(px, py, { color: COUNTER.color, r0: 4, r1: 50, life: 0.22, width: 4 });
  if ((cls === 'F' || cls === 'S' || cls === 'A') && !small) fx.ring(px, py, { color: rim, r0: 10, r1: size * 0.7, life: 0.3, width: 6 });
}

function hitSounds(world, attack, target, info, cls, cmp) {
  const pitch = rand(0.92, 1.08);
  if (info.prop) { sfxPlay('hit', { vol: 0.5, pitch }); return; }
  if (cls === 'U') { if (!info.cont) sfxPlay(info.crit ? 'crit' : 'hit', { vol: 0.35, pitch }); return; }
  const L = HIT_SFX[cls] ?? HIT_SFX.L;
  const main = (n) => (sfxHas(n) ? n : 'hit_heavy');   // ult_impact·awaken_boom 이 아직 없으면 기존 소리로
  const vol = cmp ? 0.55 : info.cont ? 0.6 : 0.9;
  sfxPlay(info.crit ? 'crit' : L[0] ? main(L[0]) : 'hit', { vol, pitch });
  if (info.crit && L[0] && L[0] !== 'hit') sfxPlay(main(L[0]), { vol: vol * 0.7, pitch });
  if (info.cont || cmp) return;
  const mat = info.part?.armor ? 'metal' : target.def?.material ?? 'flesh';
  const M = MATERIAL[mat];
  for (const layer of L.slice(1)) {
    if (layer === 'mat') {
      if (M?.sfx) sfxPlay(M.sfx, { vol: 0.6, pitch });
      const w = weightOf(target);
      if (M?.clang && (w === 'HEAVY' || w === 'FIXED')) sfxPlay('clang', { vol: 0.45, pitch });
    } else sfxPlay(layer, { vol: 0.8, pitch });
  }
  if (info.counter) sfxPlay(COUNTER.sfx, { vol: 0.9 });
  if (info.back) sfxPlay(BACK.sfx, { vol: 0.7 });
}

/** 적 → 플레이어 피격 연출: 3프레임 경직, 카메라, 피, 숫자 (진동·비네트는 haptics.js / world.onPlayerHurt 담당) */
function hurtImpact(world, attack, target, info) {
  const landed = info.landed ?? true;
  if (!landed) return;
  const px = info.hx ?? target.cx, py = info.hy ?? target.cy;
  const isPlayer = target.kind === 'player';
  // 실제로 깎인 체력 (수호 방벽·탈것이 먼저 받은 만큼 줄어든 값). 사망·부활(성녀)로 체력이 뛰면 계산값 그대로
  let shown = info.dmg;
  if (isPlayer && Number.isFinite(info.hpBefore) && Number.isFinite(target.hp) && target.hp > 0 && target.hp <= info.hpBefore) shown = Math.round(info.hpBefore - target.hp);
  if (isPlayer && !(shown > 0)) return;
  if (isPlayer) info.hitstop = applyHitstop(world, HITSTOP.hurt, 'hurt');
  const cam = world.camera, dir = attack.dir > 0 ? 1 : attack.dir < 0 ? -1 : (px >= (attack.owner?.cx ?? px) ? 1 : -1);
  if (cam) {
    if (typeof cam.kick === 'function') { cam.kick(dir * IMPACT_CAM.hurt.kick, -IMPACT_CAM.hurt.kick * 0.4); cam.addTrauma?.(IMPACT_CAM.hurt.trauma); }
    else cam.shake(5, 0.2);
  }
  const fx = world.fx;
  if (fx) {
    const qk = (BUDGET[qualityKey(world)]?.perHit ?? 28) / 28;
    emitN(fx, 'blood', px, py, 9 * qk, { angle: dir > 0 ? -0.4 : Math.PI + 0.4, spread: 0.9 });
    fx.flash(px, py, { color: '#ff2040', size: 46, life: 0.1 });
  }
  dmgNumber(world, target, shown, isPlayer ? 'hurt' : 'normal', { x: px, y: py - 30, color: isPlayer ? null : '#ff5050' });
}

/** 테스트·도구용 */
export const IMPACT_DEBUG = {
  moveIndex, resolveMove, weightOf, qualityKey, hitfxLive,
  /** 테스트용: hitfx 구현을 바꿔 끼운다 (null = 원래 모듈) */
  useHitfx(m) { HFX = m || HITFX_MOD; _hfxLive = null; _hfxCheckT = -1e9; },
};
