// 「악몽의 군주」 악몽 재대결 엔진 — owner: Stage 5 P3 (docs/specs/nightmare.md §1 · §5)
//  시련 「메아리」 엔진(game/trial.js)을 그대로 빌린다: trial.js 가 'nm_<stage>' id 를 보고 이 파일의 함수로 넘긴다.
//   startNightmare(game, id, {from})   조건 → 저장 → 스테이지 'stage' { mode: 'trial', trial: id, roomId: 'boss' }
//   prepareNightmare(game, id)         → { T, stage, opts } (opts.nightmare = K2 · rules = 비틀기 규칙 · levelOverride = 악몽 레벨)
//   attachNightmare(scene, w, T)       attachTrial 끝에서: 배너 · 격파/종료 덮어쓰기 · 비틀기 감독(nm_hazards.js, 늦게 받기)
//   completeNightmare(game, w, T)      기록(state.nm) · 첫 격파 보상 · 메타 nm (K1) · 저장 → 마을
//   retryNightmare / leaveNightmare    실패 화면 「다시 도전」 / 「마을로」 · 일시정지 포기
//  경험치 0 (K4: attachTrial 의 w.gainExp = () => 0 을 그대로 쓴다) · 목숨·사망 수 그대로 · AUTO 는 world.trial 로 막힌다.
//  이 파일은 trial.js 를 import 하지 않는다 (순환 없음 — trial.js → nightmare.js 한 방향).
import { NM, NM_IDS, NM_COLOR, NM_FAIL_LINE, NM_FLAGS, isNightmareId, nmEntry, nmTwist, nmLevel } from '../data/nightmare.js';
import { TRAILS } from '../data/cosmetics.js';   // [P3b] K1 잔상 이름 (읽기만 — 첫 격파로 새로 열린 잔상을 결과 화면에 보인다)
import { STAGES } from '../data/stages.js';
import { BOSSES } from '../data/bosses.js';
import { itemName } from '../data/items.js';
import { saves } from '../core/save.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { preloadStageBosses } from './bosses/lazy.js';
import { rollEquipDrop } from './loot.js';
import { addItem, canAdd, queueLoot } from './inventory.js';

export { NM, NM_IDS, NM_COLOR, isNightmareId, nmEntry };
/** QA: { started, cleared, failed, left, retried, last } */
export const NM_STATS = { started: 0, cleared: 0, failed: 0, left: 0, retried: 0, last: null };
const SLOWMO_BOSS = 0.35;
const RULE_LABEL = '악몽의 규칙';
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const round1 = (t) => Math.round((Number.isFinite(t) ? t : 0) * 10) / 10;
const R = (code, reason) => ({ ok: false, code, reason });
const OK = Object.freeze({ ok: true, code: null, reason: '' });
/** 떠날 때 돌아갈 곳 (startNightmare 의 from — 'church' | 'worldmap') */
let FROM = 'church';

function toast(game, text, sec = 2) { try { game?.toast?.(text, NM_COLOR, sec); } catch (e) { console.warn('[nightmare]', e); } }
/** 앞 판의 「악몽의 규칙」 안내가 (컷인 등으로 미뤄져) 남아 있으면 지운다 — 다른 악몽·마을에 엉뚱한 규칙이 뜨지 않게 */
function dropRuleToasts(game) { try { if (Array.isArray(game?.toasts)) game.toasts = game.toasts.filter((t) => !String(t?.text ?? '').startsWith(RULE_LABEL + ':')); } catch { /* 토스트 없음 */ } }
function save(game) {
  const st = game?.state;
  if (!st || st.arcade) return;
  try { saves.write(st.slot ?? 1, st); } catch (e) { console.warn('[nightmare] save', e); }
}
const bossName = (e) => BOSSES[e?.boss]?.name ?? e?.boss ?? '';

// ═════════════ T (시련 행 모양) ═════════════
const T_CACHE = new Map();
/** 악몽 id → 시련 행 모양 { id, nightmare: true, entry, stage, boss, room, name, twist, twistName, color, mods: [], bossPatterns } | null */
export function nightmareTrial(id) {
  const e = nmEntry(id);
  if (!e) return null;
  let T = T_CACHE.get(id);
  if (!T) {
    const tw = nmTwist(e);
    T = Object.freeze({
      id, nightmare: true, entry: e, stage: e.stage, boss: e.boss, room: 'boss',
      name: `악몽 · ${bossName(e)}`, twist: e.twist, twistName: tw?.name ?? '', color: NM_COLOR,
      mods: [], diffOver: null, bossPatterns: true, failLine: NM_FAIL_LINE,
    });
    T_CACHE.set(id, T);
  }
  return T;
}

// ═════════════ 기록 (슬롯 state.nm · 메타 meta.nm) ═════════════
/** 슬롯 기록 (없으면 만든다 — 옛 세이브에는 nm 필드가 없다) → { done, best, tries, clears, at, first } */
export function nmRecord(state, id) {
  if (!state || !isNightmareId(id)) return null;
  if (!isObj(state.nm)) state.nm = {};
  let r = state.nm[id];
  if (!isObj(r)) r = state.nm[id] = {};
  r.done = !!r.done;
  r.best = Number.isFinite(r.best) && r.best > 0 ? r.best : null;
  r.tries = Number.isInteger(r.tries) && r.tries >= 0 ? r.tries : 0;
  r.clears = Number.isInteger(r.clears) && r.clears >= 0 ? r.clears : (r.done ? 1 : 0);
  r.at = Number.isFinite(r.at) ? r.at : 0;
  r.first = Number.isFinite(r.first) ? r.first : (r.done ? r.at : 0);
  return r;
}
/** 읽기 전용 (만들지 않는다) */
export function nmRecordOf(state, id) { const r = state?.nm?.[id]; return isObj(r) ? r : null; }
/** 메타 nm (K1 — data/cosmetics.js 가 meta.nm.clears 를 읽는다) → { clears, ids: { id: 처음 시각 } } (없으면 만든다) */
export function nmMeta(meta) {
  if (!isObj(meta)) return { clears: 0, ids: {} };
  if (!isObj(meta.nm)) meta.nm = { clears: 0, ids: {} };
  const m = meta.nm;
  if (!isObj(m.ids)) m.ids = {};
  for (const k of Object.keys(m.ids)) if (!isNightmareId(k) && !/^nm_s\d{2,3}$/.test(k)) delete m.ids[k];
  const c = Number.isFinite(m.clears) && m.clears > 0 ? Math.floor(m.clears) : 0;
  m.clears = Math.max(c, Object.keys(m.ids).length);
  return m;
}

// ═════════════ 열림 · 상태 ═════════════
/** 이야기에서 그 보스를 이겼는가 (또는 이 슬롯에서 이미 그 악몽을 이겼는가 — 회차가 플래그를 지워도 열린 채) */
export function nmBeaten(state, e) {
  const p = state?.progress;
  if (!e || !isObj(p)) return false;
  return (Array.isArray(p.bosses) && p.bosses.includes(e.boss)) || !!p.flags?.['boss_' + e.boss]
    || !!p.cleared?.[e.stage] || !!nmRecordOf(state, e.id)?.done;
}
/** 도전할 수 있는가 → { ok, code: 'unknown'|'mode'|'story'|null, reason } */
export function canStartNightmare(state, id) {
  const e = nmEntry(id);
  if (!e || !STAGES[e.stage]?.rooms?.boss) return R('unknown', '알 수 없는 악몽이다');
  if (!isObj(state) || state.arcade) return R('mode', '지금은 악몽에 들어갈 수 없다');
  if (!nmBeaten(state, e)) return R('story', `이야기에서 ${bossName(e)}${josaEul(bossName(e))} 먼저 쓰러뜨려야 한다`);
  return OK;
}
function josaEul(w) { const c = String(w ?? '').charCodeAt(String(w ?? '').length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? '을' : '를'; }
/** 성당 칸 · 월드맵 단추용 → { state: 'locked'|'ready'|'done', reason, code, rec } */
export function nmStatus(state, id) {
  const chk = canStartNightmare(state, id), rec = nmRecordOf(state, id);
  if (rec?.done) return { state: 'done', reason: chk.ok ? '' : chk.reason, code: chk.code, rec };
  return { state: chk.ok ? 'ready' : 'locked', reason: chk.reason, code: chk.code, rec };
}

// ═════════════ 시작 · 준비 · 붙이기 ═════════════
/** 성당 「악몽」 탭 · 월드맵 붉은 단추: 조건 → 저장 → 보스방. from: 'church'(기본) | 'worldmap' → 반환 canStartNightmare */
export function startNightmare(game, id, { from = 'church' } = {}) {
  const chk = canStartNightmare(game?.state, id);
  if (!chk.ok) { toast(game, chk.reason || '악몽에 들어갈 수 없다'); return chk; }
  FROM = from === 'worldmap' ? 'worldmap' : 'church';
  const T = nightmareTrial(id);
  save(game);   // 출발하는 지금을 남긴다 (악몽 안에는 세이브 지점이 없다)
  try { preloadStageBosses(T.stage)?.catch?.(() => null); } catch (e) { console.warn('[nightmare] preload', e); }
  NM_STATS.started++; NM_STATS.last = 'start';
  audio.sfx('bell', { vol: 0.45, pitch: 0.7 });
  goStage(game, T);
  return chk;
}
function goStage(game, T) { game.go('stage', { stageId: T.stage, roomId: 'boss', mode: 'trial', trial: T.id }); }

/** K2 opts.nightmare (보스 배율·이름판·감독이 읽는다) */
export function nmOpt(e, level) {
  return { id: e.id, twist: e.twist, boss: e.boss, stage: e.stage, level, baseLevel: STAGES[e.stage]?.level ?? 1, hpMul: e.hpMul, atkMul: e.atkMul, spMul: e.spMul };
}
/** scenes/stage.js → trial.prepareTrial → 여기: { T, stage, opts } | null */
export function prepareNightmare(game, id) {
  const T = nightmareTrial(id), e = T?.entry, base = e ? STAGES[e.stage] : null;
  if (!T || !base?.rooms?.boss) return null;
  const st = game?.state, hero = st?.heroes?.[st?.charId];
  const level = nmLevel(e, hero?.level ?? 1);
  const stage = { ...base, intro: null, outro: null, next: null, unlocks: [] };
  const tw = nmTwist(e);
  const rules = { ...(tw?.rules ?? {}), label: RULE_LABEL };
  const opts = { roomId: 'boss', mode: 'trial', trial: T, rules, diffOver: null, levelOverride: level, nightmare: nmOpt(e, level) };
  return { T, stage, opts };
}

/** 감독 모듈 (늦게 받기: c_common·b_common 이 첫 화면 번들에 끌려오지 않게) */
let _hz = null;
export function loadHazards() { return (_hz ??= import('./nm_hazards.js').catch((err) => { _hz = null; console.warn('[nightmare] 감독 모듈 받기 실패', err); return null; })); }

/** trial.attachTrial 끝에서 (시련 덮어쓰기 위에): 배너 · 격파/종료 · 감독 */
export function attachNightmare(scene, w, T) {
  if (!w || !T?.nightmare) return;
  const e = T.entry, game = w.game, tw = nmTwist(e);
  dropRuleToasts(game);
  if (!isObj(w.opts)) w.opts = {};
  if (!w.opts.nightmare) w.opts.nightmare = nmOpt(e, w.stage?.level ?? nmLevel(e, w.hero?.level ?? 1));   // K2 (월드가 opts 를 들고 있지 않아도)
  w.nightmare = w.opts.nightmare;
  w.onBossDefeated = (b) => nmBossDown(w, b, T);
  w.finishStage = () => completeNightmare(game, w, T);
  w.banner = { text: '악몽', sub: `${bossName(e)} · ${tw?.name ?? ''}`, t: 2.6, color: NM_COLOR, big: true };
  const hz = loadHazards();
  const startBoss = w.startBoss.bind(w);   // attachTrial 이 이미 감싼 것 (보스전 시작 시각)
  w.startBoss = () => {
    startBoss();
    hz.then((m) => { if (m && game.world === w && !w.cleared && !w.trialEnded) m.startDirector(w, e); });
  };
  if (tw) setTimeout(() => { if (game.world === w && !w.cleared && !w.trialEnded) toast(game, `${RULE_LABEL}: ${tw.name} — ${tw.desc}`, 3.2); }, 900);
  void scene;
}

/** 보스 격파: 연출만 (진행·플래그·전리품·bossKilled 없음) */
function nmBossDown(w, boss, T) {
  if (w.cleared) return;
  w.cleared = true; w.clearT = 0;
  w.trialTime = Math.max(0, w.run.time - (w.trialFightT0 ?? 0));
  w.slowmo = 1.6; w.slowmoScale = SLOWMO_BOSS;
  w.game.flash('#ffffff', 1, 1.2);
  w.camera.shake(16, 1.2);
  audio.stopMusic(0.3);
  audio.sfx('boss_die');
  audio.sfx('bell', { vol: 0.55, pitch: 0.6 });
  const fx = w.fx, q = fx?.quality ?? 1;
  fx?.ring?.(boss.cx, boss.cy, { color: NM_COLOR, r0: 20, r1: 300, life: 1.0, width: 9 });
  fx?.ring?.(boss.cx, boss.cy, { color: '#ffd0c8', r0: 10, r1: 170, life: 0.6, width: 4 });
  fx?.burst?.('blood', boss.cx, boss.cy, Math.round(30 * q), { speed: 320 });
  w.nmDirector?.stop?.(w);
  w.banner = { text: '악몽 격파', sub: bossName(T.entry), t: 4, color: NM_COLOR, big: true };
}

/** 첫 격파 보상: 등급 ≥ reward.rarity 장비 하나 (가방이 차면 보관함) + 골드 500 × 레벨 → { items, gold } */
export function grantFirstReward(game, w, e) {
  const st = game?.state ?? w?.state, lv = w?.stage?.level ?? 1;
  const out = { items: [], gold: 0 };
  if (!st) return out;
  try {
    const d = rollEquipDrop(w, lv + 2, { minRarity: e?.reward?.rarity ?? 4, boost: 1 });
    const it = d?.data?.item;
    if (it) {
      if (!(canAdd(st, it) && addItem(st, it, { silent: true }))) queueLoot(st, it);   // 알림은 「첫 격파 보상」 하나로
      out.items.push(it);
    }
  } catch (err) { console.warn('[nightmare] 보상', err); }
  const gold = 500 * lv;
  st.gold = (Number.isFinite(st.gold) ? st.gold : 0) + gold;
  out.gold = gold;
  return out;
}

/** 이 기기의 메타에 처음 이긴 악몽을 남긴다 (K1) → 이번에 처음이면 true */
export function noteMetaClear(meta, id) {
  if (!isObj(meta) || !isNightmareId(id)) return false;
  const m = nmMeta(meta);
  const fresh = !m.ids[id];
  if (fresh) m.ids[id] = Date.now();
  m.clears = Math.max(m.clears, Object.keys(m.ids).length);
  return fresh;
}

/** 통과 → 기록 · 보상 · 메타 · 저장 → 마을 */
export function completeNightmare(game, w, T) {
  if (!w || w.trialEnded) return;
  w.trialEnded = 'clear';
  const st = game?.state ?? w.state, e = T.entry;
  const rec = nmRecord(st, T.id);
  const t = round1(w.trialTime ?? w.run?.time ?? 0);
  const first = !rec.done, prev = rec.best;
  rec.done = true; rec.at = Date.now(); rec.tries++; rec.clears++;
  if (first) rec.first = rec.at;
  const newBest = t > 0 && !(prev > 0 && prev <= t);
  if (newBest) rec.best = t;
  const reward = first ? grantFirstReward(game, w, e) : { items: [], gold: 0 };
  let metaFresh = false;
  const meta = game?.meta;
  const clears0 = meta ? nmMeta(meta).clears : 0;
  if (meta) {
    metaFresh = noteMetaClear(meta, T.id);
    if (metaFresh) { try { saves.saveMeta(meta); } catch (err) { console.warn('[nightmare] meta', err); } }
  }
  try { w.syncToState(); } catch (err) { console.warn('[nightmare] sync', err); }
  save(game);
  const clears = meta ? nmMeta(meta).clears : 0;
  // [P3b] 이번 격파로 새로 열린 K1 잔상 (need.nm 이 clears0 < n ≤ clears)
  const trails = Object.values(TRAILS).filter((tr) => Number.isFinite(tr?.need?.nm) && tr.need.nm > clears0 && tr.need.nm <= clears).map((tr) => tr.name);
  w.nmResult = {
    id: T.id, time: t, best: rec.best, newBest, first, items: reward.items.map((it) => itemName(it)), gold: reward.gold, clears, metaFresh,
    rarity: reward.items.map((it) => it?.rarity ?? 0), trails, tries: rec.tries, level: w.stage?.level ?? null,
  };
  NM_STATS.cleared++; NM_STATS.last = 'clear';
  try { bus.emit('nightmareCleared', { id: T.id, bossId: e.boss, time: t, first }); } catch (err) { console.warn('[nightmare] bus', err); }
  // [P3b] 입구가 켜져 있으면 결과 화면(trial_end 의 보상 줄)이 첫 보상·기록·격파 수를 보여 주고, 그 단추가 다시 도전 / 돌아가기를 고른다
  if (NM_FLAGS.ui && game?.registry?.trialEnd) {
    game.push('trialEnd', { world: w, tid: T.id, result: w.nmResult });
    return;
  }
  if (first) {
    for (const n of w.nmResult.items) toast(game, `첫 격파 보상: ${n}`, 3.4);
    toast(game, `+${reward.gold.toLocaleString('ko-KR')} G`, 2.6);
  } else if (newBest) toast(game, `최고 기록 ${t.toFixed(1)}초`, 2.6);
  goBack(game, T.id, 'clear');
}

/** [P3b] 결과 화면 「성당으로」·「마을로」: 격파 뒤 돌아가기 (기록·보상은 completeNightmare 가 이미 남겼다 — 다시 저장만) */
export function finishNightmare(game, id) {
  if (!game) return;
  save(game);
  goBack(game, id, 'clear');
}

/** 실패 화면 「다시 도전」: 조건 다시 확인 → 새 월드로 보스방 */
export function retryNightmare(game, id) {
  const chk = canStartNightmare(game?.state, id);
  if (!chk.ok) { toast(game, chk.reason || '악몽에 들어갈 수 없다'); leaveNightmare(game, id, 'blocked'); return chk; }
  NM_STATS.retried++; NM_STATS.last = 'retry';
  const T = nightmareTrial(id);
  try { preloadStageBosses(T.stage)?.catch?.(() => null); } catch { /* 스테이지 입장 때 다시 받는다 */ }
  audio.sfx('bell', { vol: 0.4, pitch: 0.7 });
  goStage(game, T);
  return chk;
}

/** 쓰러짐 (trial.failTrial 이 부른다): 도전 횟수 +1 — 목숨·사망 수는 그대로 */
export function noteFail(game, id) {
  const r = nmRecord(game?.state, id);
  if (r) r.tries++;
  NM_STATS.failed++; NM_STATS.last = 'fail';
}

/** 실패 화면 「마을로」 · 일시정지 포기 · 조건 깨짐: 저장 → 마을. why: 'leave' | 'quit' | 'fail' | 'blocked' */
export function leaveNightmare(game, id, why = 'leave') {
  if (!game) return;
  const w = game.world;
  if (w?.trial && w.trial.id === id) {
    if (why === 'quit' && w.bossActive && !w.trialEnded) { const r = nmRecord(game.state, id); if (r) r.tries++; }   // 보스전 도중 포기 = 한 번의 도전
    w.trialEnded ||= why;
    try { w.nmDirector?.stop?.(w); } catch { /* 무시 */ }
    try { w.syncToState(); } catch { /* 무시 */ }
  }
  save(game);
  NM_STATS.left++; NM_STATS.last = why;
  goBack(game, id, why);
}

/** 마을로: 성당에서 왔으면 성당 앞 + 성당, 월드맵에서 왔으면 동쪽 문 (P3b 가 성당 「악몽」 탭을 연다 — params.nightmare) */
function goBack(game, id, why) {
  dropRuleToasts(game);
  if (!game.registry?.hub) { game.go('title', {}); return; }
  if (FROM === 'worldmap') game.go('hub', { from: 'nightmare', nightmare: id, nmWhy: why });
  else game.go('hub', { from: 'church', open: 'church', nightmare: id, nmWhy: why, trial: id });   // trial: hub 가 성당에 넘긴다 → 성당이 「악몽」 탭을 연다 (P3b)
}
/** 떠날 곳 (QA) */
export const nmFrom = () => FROM;
