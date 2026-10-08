// 초월 · 비전 · 시련 데이터와 코어 API 테스트 (docs/specs/classes_t3.md §11.1, ASC-CORE — 뒤 패키지가 늘린다)
// 사용: node tools/test_ascension.mjs [--quiet]
//  1) 표: 초월 28 (2차마다 하나) + 비전 7 · parents · id 겹침 없음 (CLASSES/SKILLS/ITEMS) · look/lookTop 키 · 예산 §2.8 · 각성 덮개 ⊂ T3_BOOST
//  2) 시련 14: 스테이지 boss 방·본래 보스 · mods ⊂ DAILY_MODS ('dark' 없음) · level ≥ reqLevel · 대본 id (story_trials.js 가 생기면)
//  3) 비전 기술 7: SKILLS 에 합쳐짐 · reqAsc · canLearn/equipSkill/resetSkills 규칙 (§2.3)
//  4) progression: canStartTrial · canAscend 코드 순서 · ascend 첫 SP +3 한 번 · 전환 무료 · switchAsc(null) · 비전 기술 장착/해제/ascSlot 복구 · 이벤트
//  5) migrateState: 남의/잘못된 asc 버림 · 모르는 시련 버림 · ascUnlocked 복구 · 두 번 돌려도 같음 · 옛 세이브 그대로 · 옛 앱(migrateAsc 없음) 흉내
//  6) computeStats: 배율·고정치가 표와 같음 · 「초월 보정」 상한 · composeLook: look.classId = 2차, lookTop 이 장비 위에 · lookForAsc 는 영웅을 바꾸지 않음
//  7) NG+: asc/trials 가 이어지고 p2Cleared 는 ng.n 으로 참 · 시련 시작은 이번 회차 p2_done 필요
//  8) saves.list / cloud summarize 가 asc 를 싣는다 (초월 없는 세이브 요약 = 서버 saveSummary)
//  9) 퍼펫: artClass 가 초월·비전 id 를 2차 원화로, classOf 가 look.classId 로 (원화 없는 id 는 부모로)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIET = process.argv.includes('--quiet');
// save.js 는 부를 때 전역 localStorage 를 찾는다 → 가짜 (test_settings_v2 와 같은 방식)
const LS = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => LS.set(k, String(v)), removeItem: (k) => LS.delete(k), key: (i) => [...LS.keys()][i] ?? null, get length() { return LS.size; }, clear: () => LS.clear() },
});
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const AS = await imp('src/data/ascensions.js');
const { ASCENSIONS, ASC_IDS, T3_OF, HIDDEN_OF, TOP_KEYS, LOOK_KEYS, ASC_REQ } = AS;
const { TRIALS, TRIAL_IDS, trialsOf } = await imp('src/data/trials.js');
const { ASC_SKILLS } = await imp('src/data/skills_asc.js');
const SK = await imp('src/data/skills.js');
const { CLASSES, classChain } = await imp('src/data/classes.js');
const { CHARACTERS } = await imp('src/data/characters.js');
const { ITEMS, makeItem } = await imp('src/data/items.js');
const { STAGES } = await imp('src/data/stages.js');
const AW = await imp('src/data/awaken.js');
const PR = await imp('src/game/progression.js');
const ST = await imp('src/game/state.js');
const STATS = await imp('src/game/stats.js');
const { addItem } = await imp('src/game/inventory.js');
const { startNgPlus } = await imp('src/game/ngplus.js');
const { bus } = await imp('src/core/events.js');
const { saves } = await imp('src/core/save.js');
const CL = await imp('src/core/cloud.js');
let DAILY_MODS = null;
try { DAILY_MODS = (await imp('src/core/online.js')).DAILY_MODS; } catch (e) { console.log('  (core/online.js 를 불러오지 못함: ' + e.message.split('\n')[0] + ')'); }
let SCRIPTS = {};
try { SCRIPTS = (await imp('src/data/story.js')).SCRIPTS ?? {}; } catch (e) { console.log('  (story.js 를 불러오지 못함: ' + e.message.split('\n')[0] + ')'); }
let SCRIPTS_TRIALS = null;
if (fs.existsSync(path.join(ROOT, 'src/data/story_trials.js'))) {
  try { SCRIPTS_TRIALS = (await imp('src/data/story_trials.js')).SCRIPTS_TRIALS ?? null; } catch (e) { console.log('  (story_trials.js 를 불러오지 못함: ' + e.message.split('\n')[0] + ')'); }
}
let serverSummary = null;
try { serverSummary = (await imp('netlify/lib/validate.mts')).saveSummary; } catch (e) { console.log('  (서버 saveSummary 를 불러오지 못함: ' + e.message.split('\n')[0] + ')'); }
let PUP = null;
try { PUP = await imp('src/render/hero_puppet.js'); } catch (e) { console.log('  (hero_puppet.js 를 불러오지 못함: ' + e.message.split('\n')[0] + ')'); }
const { PUPPETS } = await imp('src/render/puppet_manifest.js');

let fails = 0, passes = 0;
const ok = (cond, msg, extra) => { if (cond) { passes++; if (!QUIET && process.env.VERBOSE) console.log('  ✓ ' + msg); } else { fails++; console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } };
const section = (t) => console.log('▶ ' + t);
const clone = (o) => JSON.parse(JSON.stringify(o));
const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
const EPS = 1e-9;
const A_LIST = Object.values(ASCENSIONS);
const T3 = A_LIST.filter((a) => a.kind === 't3'), HID = A_LIST.filter((a) => a.kind === 'hidden');
const TIER2 = Object.values(CLASSES).filter((c) => c.tier === 2);
const HEROES = Object.keys(CHARACTERS);

// ══════════════ 1. 표 ══════════════
section('ASCENSIONS 표');
ok(A_LIST.length === 35 && T3.length === 28 && HID.length === 7, `초월 28 + 비전 7 (지금 ${T3.length} + ${HID.length})`);
ok(Object.isFrozen(ASCENSIONS) && A_LIST.every((a) => Object.isFrozen(a) && Object.isFrozen(a.lookTop ?? {})), '표는 얼려 있다 (깊게)');
for (const c of TIER2) ok(T3.filter((a) => a.parent === c.id).length === 1 && T3_OF[c.id] && ASCENSIONS[T3_OF[c.id]].parent === c.id, `2차 ${c.id} 에 초월 정확히 하나`);
for (const id of HEROES) ok(HID.filter((a) => a.charId === id).length === 1 && HIDDEN_OF[id] && ASCENSIONS[HIDDEN_OF[id]].charId === id, `영웅 ${id} 에 비전 정확히 하나`);
for (const a of A_LIST) {
  ok(a.id && ASCENSIONS[a.id] === a && CHARACTERS[a.charId], `${a.id}: id·charId`);
  if (a.kind === 't3') {
    ok(CLASSES[a.parent]?.tier === 2 && CLASSES[a.parent].charId === a.charId && isDeepStrictEqual(a.parents, [a.parent]), `${a.id}: parent ${a.parent} 는 같은 영웅의 2차`);
    ok(a.reqLevel === ASC_REQ.t3Level && a.trial === `tr_${a.charId}_1` && a.arcade?.lv === 80, `${a.id}: Lv 70 · 시련 Ⅰ · 아케이드 Lv 80`);
    ok(!a.skill, `${a.id}: 초월에는 비전 기술 없음`);
    ok(a.awaken && typeof a.awaken.label === 'string' && typeof a.awaken.desc === 'string' && a.awaken.label && a.awaken.desc, `${a.id}: 각성 이름·설명`);
  } else {
    const want = TIER2.filter((c) => c.charId === a.charId).map((c) => c.id);
    ok(a.parent === null && isDeepStrictEqual(a.parents, want) && want.length === 4, `${a.id}: parents = 그 영웅의 2차 넷 (CLASSES 순서)`, a.parents);
    ok(a.reqLevel === ASC_REQ.hiddenLevel && a.trial === `tr_${a.charId}_2` && a.arcade?.lv === 85, `${a.id}: Lv 75 · 시련 Ⅱ · 아케이드 Lv 85`);
    ok(typeof a.skill === 'string' && a.skill.startsWith(`asc_${a.charId}_`), `${a.id}: 비전 기술 id asc_${a.charId}_*`);
    ok(!a.awaken, `${a.id}: 비전 각성은 T3_BOOST(T2[현재 2차]) — 표에 awaken 없음`);
  }
  for (const k of ['name', 'eng', 'desc', 'perk']) ok(typeof a[k] === 'string' && a[k].length > 0, `${a.id}.${k}`);
  ok(/^#[0-9a-f]{6}$/.test(a.ult?.accent ?? '') && Array.isArray(a.ult?.colors) && a.ult.colors.length === 3 && a.ult.colors.every((c) => /^#[0-9a-f]{6}$/.test(c)), `${a.id}.ult accent + 색 3`);
  ok(Number.isFinite(a.est?.dps) && Number.isFinite(a.est?.ehp) && a.est.dps >= 1 && a.est.dps <= 1.15 && a.est.ehp >= 1 && a.est.ehp <= 1.35, `${a.id}.est`, a.est);
  ok(Object.keys(a.look ?? {}).every((k) => LOOK_KEYS.includes(k)), `${a.id}.look 키 ⊂ ${LOOK_KEYS}`, Object.keys(a.look ?? {}));
  ok(a.lookTop && Object.keys(a.lookTop).length > 0 && Object.keys(a.lookTop).every((k) => TOP_KEYS.includes(k)), `${a.id}.lookTop 키 ⊂ 허용 목록`, Object.keys(a.lookTop ?? {}));
  const t = a.lookTop ?? {};
  ok(!t.aura || (typeof t.aura.type === 'string' && /^#[0-9a-f]{6}$/.test(t.aura.color)), `${a.id}.lookTop.aura {type,color}`);
  ok(!t.wingCol || (t.wings && t.wingCol.length === 3), `${a.id}.lookTop.wingCol 은 날개와 함께 3색`);
  ok(!t.tint || (Number.isFinite(t.tint.h) && Number.isFinite(t.tint.s)), `${a.id}.lookTop.tint {h,s}`);
}
// id 겹침
const ITEM_IDS = new Set(Object.keys(ITEMS));
for (const a of A_LIST) ok(!CLASSES[a.id] && !SK.SKILLS[a.id] && !ITEM_IDS.has(a.id), `${a.id} 는 CLASSES·SKILLS·ITEMS 와 겹치지 않음`);
for (const s of ASC_SKILLS) ok(!CLASSES[s.id] && !ITEM_IDS.has(s.id) && !ASCENSIONS[s.id], `${s.id} 는 CLASSES·ITEMS·ASCENSIONS 와 겹치지 않음`);
// ASC_IDS 순서
for (const id of HEROES) {
  const want = [...TIER2.filter((c) => c.charId === id).map((c) => T3_OF[c.id]), HIDDEN_OF[id]];
  ok(isDeepStrictEqual([...ASC_IDS[id]], want) && isDeepStrictEqual(AS.ascListOf(id), want), `ASC_IDS.${id} = 초월 4 (CLASSES 순서) + 비전`);
}

section('예산 §2.8');
const FLAT_CAP = { crit: 8, critDmg: 25, dmgReduce: 8, lifesteal: 3, atkSpd: 12, cdr: 10, moveSpd: 8, hpRegen: 2, mpRegen: 2, skillDmg: 12, fire: 25, ice: 25, holy: 25, dark: 25, thunder: 25, reach: 10, jumpPow: 10, luck: 10 };
for (const a of A_LIST) {
  const m = Object.values(a.mult ?? {});
  const sum = m.reduce((s, v) => s + (v - 1), 0);
  ok(sum >= 0.15 - EPS && sum <= 0.25 + EPS, `${a.id}: Σ(mult−1) ${sum.toFixed(2)} ∈ [0.15, 0.25]`);
  ok(m.every((v) => v > 1 && v <= 1.12 + EPS), `${a.id}: 배율 하나 ≤ 1.12`, a.mult);
  for (const [k, v] of Object.entries(a.flat ?? {})) ok(Object.hasOwn(FLAT_CAP, k) && v > 0 && v <= FLAT_CAP[k], `${a.id}: flat ${k} ${v} ≤ ${FLAT_CAP[k]}`);
  ok(Object.keys(a.mult ?? {}).every((k) => !(k in (a.flat ?? {}))), `${a.id}: 같은 능력치에 배율과 고정치를 함께 두지 않음`);
  for (const p of a.parents) {
    const chain = [...classChain(p), a].reduce((s, c) => s + (c.flat?.dmgReduce ?? 0), 0);
    ok(chain <= 45, `${a.id} (${p}): 계보 받는 피해 감소 ${chain} ≤ 45`);
  }
}
ok([...classChain('bran_guardian'), ASCENSIONS.bran_bastion].reduce((s, c) => s + (c.flat?.dmgReduce ?? 0), 0) === 40, '성채 기사 계보 dmgReduce = 40');

section('각성 덮개 ⊂ T3_BOOST (§7.2)');
// ULT-AWAKEN 이 data/awaken.js 에 T3_BOOST 를 내면 그것으로, 아직이면 명세 §7.2 규칙으로 상한을 만든다
const boostRule = (b) => {
  const o = structuredClone(b);
  if (o.heal != null) o.heal *= 1.5;
  if (o.lifesteal != null) o.lifesteal *= 1.5;
  if (o.dot) { o.dot.t += 1; o.dot.mv *= 1.33; }
  if (o.slow) { o.slow.mul -= 0.1; o.slow.t += 1; }
  if (o.invuln != null) o.invuln += 1;
  if (o.critDmg != null) o.critDmg += 20;
  if (o.comboDmg != null) o.comboDmg += 0.01;
  if (o.shots != null) o.shots += 4;
  if (o.execute != null) o.execute += 0.05;
  if (o.healPerKill != null) o.healPerKill += 0.01;
  return o;
};
const T3_BOOST = typeof AW.T3_BOOST === 'function' ? AW.T3_BOOST : boostRule;
if (typeof AW.T3_BOOST !== 'function') console.log('  (data/awaken.js 에 T3_BOOST 아직 없음 — 명세 §7.2 규칙으로 검사)');
const NUM_KEYS = ['heal', 'lifesteal', 'invuln', 'critDmg', 'comboDmg', 'shots', 'execute', 'healPerKill'];
for (const a of T3) {
  const base = AW.T2[a.parent], top = T3_BOOST(base);
  const ov = a.awaken;
  for (const k of Object.keys(ov)) ok(['label', 'desc', 'dot', 'slow', ...NUM_KEYS].includes(k), `${a.id}.awaken 키 ${k} 는 수치 덮개 키`);
  for (const k of NUM_KEYS) {
    if (ov[k] == null) continue;
    ok(base?.[k] != null, `${a.id}.awaken.${k}: 2차 T2 에도 있는 값`);
    ok(ov[k] >= base[k] - EPS && ov[k] <= top[k] + 1e-3, `${a.id}.awaken.${k} ${ov[k]} ∈ [T2 ${base[k]}, T3_BOOST ${top[k]}]`);
  }
  if (ov.dot) ok(base.dot && ov.dot.element === base.dot.element && ov.dot.t >= base.dot.t && ov.dot.t <= top.dot.t + EPS && ov.dot.mv >= base.dot.mv && ov.dot.mv <= top.dot.mv + 1e-3, `${a.id}.awaken.dot ⊂ T3_BOOST`, [ov.dot, top.dot]);
  if (ov.slow) ok(base.slow && ov.slow.mul <= base.slow.mul + EPS && ov.slow.mul >= top.slow.mul - 1e-3 && ov.slow.t >= base.slow.t && ov.slow.t <= top.slow.t + EPS, `${a.id}.awaken.slow ⊂ T3_BOOST`, [ov.slow, top.slow]);
}

// ══════════════ 2. 시련 ══════════════
section('TRIALS 표 (story_ext §2)');
ok(TRIAL_IDS.length === 14 && Object.keys(TRIALS).length === 14, '시련 14');
for (const id of HEROES) {
  const L = trialsOf(id);
  ok(L.length === 2 && L[0].n === 1 && L[1].n === 2 && L[0].id === `tr_${id}_1` && L[1].id === `tr_${id}_2`, `trialsOf(${id}) = [Ⅰ, Ⅱ]`);
}
for (const tid of TRIAL_IDS) {
  const T = TRIALS[tid], S = STAGES[T.stage];
  ok(T.id === tid && CHARACTERS[T.charId] && (T.n === 1 || T.n === 2), `${tid}: id·charId·n`);
  ok(!!S?.rooms?.boss && T.room === 'boss', `${tid}: ${T.stage} 에 boss 방`);
  ok(S && T.boss === (S.rooms?.boss?.bossId ?? S.boss) && T.boss === S.boss, `${tid}: ${T.boss} 는 ${T.stage} 본래 보스`, [S?.boss, S?.rooms?.boss?.bossId]);
  ok(Array.isArray(T.mods) && !T.mods.includes('dark') && (!DAILY_MODS || T.mods.every((m) => Object.hasOwn(DAILY_MODS, m))), `${tid}: mods ⊂ DAILY_MODS, 'dark' 없음`, T.mods);
  ok(T.diffOver === null || (Object.keys(T.diffOver).every((k) => k === 'bossHp') && T.diffOver.bossHp > 1 && T.diffOver.bossHp <= 1.3), `${tid}: diffOver 는 bossHp 만`, T.diffOver);
  ok(T.level >= T.reqLevel && T.recLv >= T.reqLevel && T.recLv <= T.level, `${tid}: reqLevel ${T.reqLevel} ≤ recLv ${T.recLv} ≤ level ${T.level}`);
  ok(T.n === 1 ? T.reqLevel === 70 && T.level === 74 && T.recLv === 72 && T.unlock === 't3' : T.reqLevel === 75 && T.level === 80 && T.recLv === 78 && T.unlock === 'hidden', `${tid}: 공통 수치 (§2)`);
  ok(T.pre === `${tid}_pre` && T.win === `${tid}_win` && T.preAgain === 'tr_again_pre' && T.winAgain === 'tr_again_win', `${tid}: 대본 id`);
  ok(typeof T.bossPatterns === 'boolean' && typeof T.bg === 'string' && ['story', 'church', 'sad'].includes(T.music), `${tid}: bossPatterns·bg·music`);
  ok(!T.reqFlag || (/^ex_s2\d_done$/.test(T.reqFlag) && typeof T.reqText === 'string' && T.reqText.length > 0), `${tid}: reqFlag ↔ reqText`);
  ok([...T.desc].length <= 24 && [...T.failLine].length <= 44, `${tid}: desc ≤ 24자 · failLine ≤ 44자`, [[...T.desc].length, [...T.failLine].length]);
  ok(isDeepStrictEqual(AS.unlocksOf(tid), A_LIST.filter((a) => a.charId === T.charId && a.kind === (T.n === 1 ? 't3' : 'hidden')).map((a) => a.id)), `unlocksOf(${tid})`);
}
ok(AS.unlocksOf('tr_nobody_1').length === 0 && AS.unlocksOf('x').length === 0 && AS.unlocksOf(null).length === 0, 'unlocksOf(모르는 id) = []');
{
  const all = new Set([...TRIAL_IDS.flatMap((t) => [TRIALS[t].pre, TRIALS[t].win]), 'tr_again_pre', 'tr_again_win']);
  const merged = [...all].filter((id) => SCRIPTS[id]);
  if (SCRIPTS_TRIALS) {
    const miss = [...all].filter((id) => !SCRIPTS_TRIALS[id] && !SCRIPTS[id]);
    ok(miss.length === 0, '시련 대본 id 가 SCRIPTS_TRIALS 에 있다', miss);
    if (!merged.length) console.log('  (SCRIPTS_TRIALS 는 아직 story.js 에 합쳐지지 않음 — STORY-GAPS-B)');
    else ok(merged.length === all.size, '시련 대본이 SCRIPTS 에 모두 합쳐졌다', [...all].filter((id) => !SCRIPTS[id]));
  } else console.log('  (src/data/story_trials.js 가 아직 없음 — 대본 id 검사 보류, STORY-TRIALS)');
}

// ══════════════ 3. 비전 기술 ══════════════
section('비전 기술 (skills_asc.js → SKILLS)');
ok(ASC_SKILLS.length === 7, '비전 기술 7');
for (const h of HID) {
  const s = SK.SKILLS[h.skill];
  ok(!!s && s.reqAsc === h.id && s.charId === h.charId && s.type === 'active' && s.maxLv === 5 && s.reqLevel === 75 && s.spCost === 2 && s.branch === 'asc' && s.row === 0 && isDeepStrictEqual(s.req, []), `${h.skill}: SKILLS 에 합쳐짐 (reqAsc ${h.id}, Lv 75, SP 2, branch asc)`);
  ok(s && Number.isFinite(s.cost) && Number.isFinite(s.cd) && /^#[0-9a-f]{6}$/.test(s.color), `${h.skill}: MP·재사용·색`);
  ok(s && !/\{\w+\}/.test(SK.skillDesc(h.skill, 1)) && !/\{\w+\}/.test(SK.skillDesc(h.skill, 5)), `${h.skill}: 설명의 {키} 가 모두 v 로 바뀜`, SK.skillDesc(h.skill, 1));
  ok(!Object.values(SK.SKILL_TREES[h.charId]?.branches ?? []).some((b) => b.skills.includes(h.skill)), `${h.skill}: 스킬 트리 밖`);
}
{
  const st = ST.newGameState({ charId: 'lia' });
  const hero = st.heroes.lia;
  hero.level = 75; hero.sp = 20; hero.classId = 'lia_reaper';
  const sid = 'asc_lia_frostwing';
  ok(SK.canLearn(hero, sid).reason === '비전 해금 필요' && !SK.canLearn(hero, sid).ok, 'canLearn: 비전 해금 전 → 비전 해금 필요');
  ok(SK.canLearn({ ...hero, charId: 'kael' }, sid).reason === '다른 캐릭터의 스킬', 'canLearn: 다른 영웅 먼저 걸러짐');
  hero.ascUnlocked = ['lia_frostcrow'];
  ok(SK.canLearn(hero, sid).ok && SK.canLearn(hero, sid).cost === 2, 'canLearn: 해금 + Lv 75 → 가능 (SP 2)');
  hero.skills[sid] = 1;
  ok(SK.canLearn(hero, sid).reason === '레벨 77 필요', 'canLearn: Lv 2 는 Lv 77 필요', SK.canLearn(hero, sid));
  hero.level = 83; hero.skills[sid] = 4;
  ok(SK.canLearn(hero, sid).ok, 'canLearn: Lv 5 는 Lv 83');
  hero.skills[sid] = 1;
  ok(SK.equipSkill(hero, 1, sid) === false, 'equipSkill: 비전 직업이 아니면 거절');
  hero.asc = 'lia_frostcrow';
  ok(SK.equipSkill(hero, 1, sid) === true && hero.slots[1] === sid, 'equipSkill: 비전 직업이면 장착');
  ok(SK.equipSkill(hero, 1, null) === true && hero.slots[1] === null, 'equipSkill(null) 은 그대로 해제');
  // resetSkills: 해금된 비전 기술 1레벨 무료 + 비전이면 다시 장착
  hero.skills[sid] = 3; hero.sp = 0; hero.ascSlot = { i: 3, prev: 'lia_shadow_step' };
  const starter = SK.STARTER_SKILLS.lia;
  const before = clone(hero.skills);
  const want = Object.entries(before).reduce((s, [id, lv]) => s + Math.max(0, lv - (id === starter || id === sid ? 1 : 0)) * (SK.SKILLS[id]?.spCost ?? 1), 0);
  const ref = SK.resetSkills(hero);
  ok(ref === want && hero.sp === want, `resetSkills: 환급 ${ref} = ${want} (비전 기술 1레벨 무료)`);
  ok(hero.skills[sid] === 1 && hero.slots.includes(sid) && hero.slots[0] === starter, 'resetSkills: 비전 기술 1레벨 남고 장착됨', hero.slots);
  ok(hero.ascSlot === null, 'resetSkills: ascSlot 비움');
  hero.asc = null; SK.resetSkills(hero);
  ok(hero.skills[sid] === 1 && !hero.slots.includes(sid), 'resetSkills: 비전이 아니면 1레벨만 남고 장착 안 함');
  const h2 = { charId: 'lia', skills: { [sid]: 2 }, slots: [null, null, null, null], sp: 0 };
  ok(SK.resetSkills(h2) === 4 && !h2.skills[sid], 'resetSkills: 해금 안 된 비전 기술은 전부 환급');
}

// ══════════════ 4. progression ══════════════
section('progression: 시련 시작 판정 (§2.4 · §9.1)');
const mkState = (charId = 'kael', classId = 'kael_templar', level = 80, flags = { p2_done: true }) => {
  const s = ST.newGameState({ charId });
  const h = s.heroes[charId];
  h.classId = classId; h.level = level; h.sp = 10;
  s.progress.flags = { ...flags };
  return s;
};
{
  let s = mkState(); let h = s.heroes.kael;
  ok(PR.canStartTrial(h, 'tr_kael_1', s).ok, '정상: 시련 Ⅰ 도전 가능');
  ok(PR.canStartTrial(h, 'tr_nope_1', s).code === 'unknown', "'unknown'");
  ok(PR.canStartTrial(h, 'tr_sera_1', s).code === 'hero', "'hero' (다른 영웅의 시련)");
  ok(PR.canStartTrial(h, 'tr_kael_1', { ...s, charId: 'sera' }).code === 'hero', "'hero' (지금 영웅이 아님)");
  h.classId = 'kael_crusader';
  ok(PR.canStartTrial(h, 'tr_kael_1', s).code === 'tier' && PR.canStartTrial(h, 'tr_kael_1', s).reason === '최상급 직업에서만 도전할 수 있다', "'tier'");
  s.progress.flags = {};
  ok(PR.canStartTrial(h, 'tr_kael_1', s).code === 'tier', 'tier 가 p2 보다 먼저');
  h.classId = 'kael_templar';
  ok(PR.canStartTrial(h, 'tr_kael_1', s).code === 'p2' && PR.canStartTrial(h, 'tr_kael_1', s).reason === '2부의 결말을 본 뒤에 열린다', "'p2' (이번 회차 p2_done 없음)");
  s.progress.flags = { ending_p2true: true };
  ok(PR.canStartTrial(h, 'tr_kael_1', s).code === 'p2', "'p2': 시작은 p2_done 만 (엄격)");
  s.progress.flags = { p2_done: true };
  ok(PR.canStartTrial(h, 'tr_kael_2', s).code === 'prev' && PR.canStartTrial(h, 'tr_kael_2', s).reason === '시련 Ⅰ을 먼저 넘어야 한다', "'prev' (Ⅱ 는 Ⅰ 뒤)");
  h.level = 69;
  ok(PR.canStartTrial(h, 'tr_kael_1', s).code === 'level' && PR.canStartTrial(h, 'tr_kael_1', s).reason === '레벨 70 필요', "'level' (Lv 70)");
  h.level = 74; h.trials = { tr_kael_1: { done: true, at: 1, best: 50, tries: 1 } };
  ok(PR.canStartTrial(h, 'tr_kael_2', s).code === 'level' && PR.canStartTrial(h, 'tr_kael_2', s).reason === '레벨 75 필요', "'level' (Ⅱ 는 Lv 75)");
  ok(PR.trialStatus(h, 'tr_kael_1', s).state === 'done' && PR.trialStatus(h, 'tr_kael_1', s).code === 'ok', 'trialStatus: 통과 → done (다시 도전 가능)');
  ok(PR.trialStatus(h, 'tr_kael_2', s).state === 'locked', 'trialStatus: 잠김');
  h.level = 80;
  ok(PR.trialStatus(h, 'tr_kael_2', s).state === 'ready', 'trialStatus: ready');
  // reqFlag (story): 첫 통과 전에만, 지난 회차 플래그도 인정
  s = mkState('victor', 'victor_phantom'); h = s.heroes.victor;
  const r = PR.canStartTrial(h, 'tr_victor_1', s);
  ok(r.code === 'story' && r.reason === TRIALS.tr_victor_1.reqText, "'story' (외전 미완)", r);
  s.ng = { n: 1, past: { flags: { ex_s23_done: true } } };
  ok(PR.canStartTrial(h, 'tr_victor_1', s).ok, "'story': 지난 회차(ng.past.flags) 플래그도 인정 (flagEver)");
  delete s.ng; h.trials = { tr_victor_1: { done: true, at: 1, best: null, tries: 2 } };
  ok(PR.canStartTrial(h, 'tr_victor_1', s).ok, "'story': 통과한 시련의 다시 도전은 플래그 없이도");
  h.classId = 'victor_deadeye';
  ok(PR.canStartTrial(h, 'tr_victor_1', s).code === 'tier', '다시 도전도 2차에서만');
  s.progress.flags.ex_s23_done = true;
  ok(AS.flagEver(s, 'ex_s23_done') && !AS.flagEver(s, 'ex_s22_done'), 'flagEver');
}

section('progression: 초월 판정 · 초월 · 전환 (§2.4)');
{
  const s = mkState(); const h = s.heroes.kael;
  const C = (id, st = s) => PR.canAscend(h, id, st);
  ok(C('nope').code === 'unknown', "'unknown'");
  ok(C('sera_archsaint').code === 'hero', "'hero'");
  h.classId = 'kael_crusader';
  ok(C('kael_grandtemplar').code === 'tier', "'tier'");
  h.classId = 'kael_templar';
  ok(C('kael_highinquisitor').code === 'line' && C('kael_highinquisitor').reason === '이 계보의 길이 아니다', "'line'");
  s.progress.flags = {};
  ok(C('kael_grandtemplar').code === 'p2', "'p2' (2부 결말 전)");
  const tr = C('kael_highinquisitor');
  ok(tr.code === 'line', 'line 이 p2 보다 먼저');
  s.progress.flags = { ending_p2: true };
  const t1 = C('kael_grandtemplar');
  ok(t1.code === 'trial' && t1.trial === 'tr_kael_1' && t1.reason === '「시련 Ⅰ · 묘비의 빈 줄」을 넘어야 한다', "'trial' (Ⅰ)", t1);
  const t2 = C('kael_sealbearer');
  ok(t2.code === 'trial' && t2.trial === 'tr_kael_2' && t2.reason === '「시련 Ⅱ · 첫 번째 봉인」을 넘어야 한다', "'trial' (Ⅱ)", t2);
  // 을/를: 받침 없는 이름
  { const sh = mkState('sera', 'sera_saint'); const r = PR.canAscend(sh.heroes.sera, 'sera_archsaint', sh); ok(r.code === 'trial' && r.reason === '「시련 Ⅰ · 얼어붙은 기도」를 넘어야 한다', '받침 없는 이름은 「…」를', r.reason); }
  // 시련 통과 → 해금
  const added = PR.unlockFromTrial(h, 'tr_kael_1');
  ok(isDeepStrictEqual(added, ASC_IDS.kael.slice(0, 4)) && isDeepStrictEqual(h.ascUnlocked, ASC_IDS.kael.slice(0, 4)), 'unlockFromTrial(Ⅰ) → 초월 넷');
  ok(PR.unlockFromTrial(h, 'tr_kael_1').length === 0, 'unlockFromTrial 두 번째는 새로 연 것 없음');
  ok(PR.unlockFromTrial(h, 'tr_sera_1').length === 0 && h.ascUnlocked.length === 4, '다른 영웅의 시련은 열지 않음');
  h.level = 69;
  ok(C('kael_grandtemplar').code === 'level' && C('kael_grandtemplar').reason === '레벨 70 필요', "'level'");
  h.level = 72;
  ok(C('kael_grandtemplar').ok, '초월 가능');
  const av = PR.availableAscensions(h, s);
  ok(av.length === 2 && av[0].asc.id === 'kael_grandtemplar' && av[0].chk.ok && av[1].asc.id === 'kael_sealbearer' && av[1].chk.code === 'trial', 'availableAscensions = [초월, 비전]', av.map((x) => [x.asc.id, x.chk.code]));
  ok(PR.availableAscensions({ ...h, classId: 'kael_crusader' }, s).length === 0, 'availableAscensions: 2차가 아니면 []');
  // 이벤트
  const ev = [];
  const off1 = bus.on('ascChanged', (d) => ev.push(['asc', d])), off2 = bus.on('classChanged', (d) => ev.push(['cls', d]));
  const sp0 = h.sp;
  const r1 = PR.ascend(h, 'kael_grandtemplar', s);
  ok(r1.ok && r1.first && r1.sp === 3 && h.sp === sp0 + 3 && h.ascSp === true && h.asc === 'kael_grandtemplar', '첫 초월: SP +3, ascSp', r1);
  ok(ev.length === 2 && ev[0][0] === 'asc' && isDeepStrictEqual(ev[0][1], { charId: 'kael', classId: 'kael_templar', asc: 'kael_grandtemplar', prev: null, first: true }) && ev[1][0] === 'cls' && isDeepStrictEqual(ev[1][1], { charId: 'kael', classId: 'kael_templar', asc: 'kael_grandtemplar' }), 'ascChanged → classChanged 순서·내용', ev);
  ok(C('kael_grandtemplar').code === 'current' && C('kael_grandtemplar').reason === '이미 이 길을 걷고 있다', "'current'");
  ok(AS.heroTier(h) === 3 && AS.classNameOf(h) === '성전 기사단장' && AS.classEngOf(h) === 'GRAND TEMPLAR' && AS.tierLabelOf(h) === '초월' && AS.heroKey(h) === 'kael_templar|kael_grandtemplar', 'heroTier·classNameOf·classEngOf·tierLabelOf·heroKey');
  ok(isDeepStrictEqual(AS.heroChain(h).map((c) => c.id), ['kael_hunter', 'kael_crusader', 'kael_templar', 'kael_grandtemplar']), 'heroChain = 계보 + 초월');
  // 전환: null → 무료
  ev.length = 0;
  const r2 = PR.switchAsc(h, null, s);
  ok(r2.ok && !r2.first && r2.sp === 0 && h.asc === null && h.sp === sp0 + 3, 'switchAsc(null): 기본 최상급으로, SP 없음');
  ok(ev[0]?.[1]?.prev === 'kael_grandtemplar' && ev[0][1].asc === null && ev[0][1].first === false, 'switchAsc(null) 이벤트');
  ok(PR.switchAsc(h, null, s).code === 'current', 'switchAsc(null) 두 번째 → current');
  ok(AS.heroTier(h) === 2 && AS.classNameOf(h) === CLASSES.kael_templar.name && AS.tierLabelOf(h) === '최상급 직업', '초월 해제 뒤 2차 이름');
  const r3 = PR.switchAsc(h, 'kael_grandtemplar', s);
  ok(r3.ok && !r3.first && h.sp === sp0 + 3, '다시 초월 (전환) — SP 없음');
  off1(); off2();
  // 비전: 기술 1레벨 · 빈 슬롯
  h.level = 80;
  PR.unlockFromTrial(h, 'tr_kael_1');
  const add2 = PR.unlockFromTrial(h, 'tr_kael_2');
  ok(isDeepStrictEqual(add2, ['kael_sealbearer']) && h.skills.asc_kael_firstseal === 1, 'unlockFromTrial(Ⅱ) → 비전 + 비전 기술 1레벨 (무료)');
  h.slots = ['kael_vigilia', null, null, null];
  const r4 = PR.ascend(h, 'kael_sealbearer', s);
  ok(r4.ok && !r4.first && h.asc === 'kael_sealbearer' && h.slots[1] === 'asc_kael_firstseal' && h.ascSlot === null, '비전: 빈 슬롯에 비전 기술', h.slots);
  ok(AS.heroTier(h) === 3 && AS.tierLabelOf(h) === '비전', '비전 tier 3 · 비전');
  const r5 = PR.ascend(h, 'kael_grandtemplar', s);
  ok(r5.ok && isDeepStrictEqual(h.slots, ['kael_vigilia', null, null, null]) && h.skills.asc_kael_firstseal === 1, '비전을 떠나면 슬롯에서 빠짐 (배운 레벨은 남음)', h.slots);
  // 슬롯이 가득: 4번을 빌리고 되돌림
  h.skills.kael_tempest = 1; h.skills.x2 = 1; h.skills.x3 = 1;
  h.slots = ['kael_vigilia', 'x2', 'x3', 'kael_tempest'];
  PR.ascend(h, 'kael_sealbearer', s);
  ok(h.slots[3] === 'asc_kael_firstseal' && isDeepStrictEqual(h.ascSlot, { i: 3, prev: 'kael_tempest' }), '가득 찬 슬롯: 4번을 빌리고 ascSlot 기억', [h.slots, h.ascSlot]);
  PR.switchAsc(h, null, s);
  ok(isDeepStrictEqual(h.slots, ['kael_vigilia', 'x2', 'x3', 'kael_tempest']) && h.ascSlot === null, '비전을 떠나면 원래 스킬 복구, ascSlot 비움', [h.slots, h.ascSlot]);
  // 초월 → 비전 → 초월 로 ascSlot 복구 (switch t3)
  PR.ascend(h, 'kael_sealbearer', s); PR.ascend(h, 'kael_grandtemplar', s);
  ok(h.slots[3] === 'kael_tempest' && h.ascSlot === null, '비전 → 초월 전환도 복구');
  // 비전 기술을 다시 처음 들어갈 때 1레벨이 없으면 준다 (옛 앱 초기화)
  delete h.skills.asc_kael_firstseal;
  PR.ascend(h, 'kael_sealbearer', s);
  ok(h.skills.asc_kael_firstseal === 1, '비전에 들어설 때 비전 기술 1레벨 보장');
  // 다른 2차에서도 비전
  PR.switchAsc(h, null, s); h.classId = 'kael_nightraven';
  ok(PR.canAscend(h, 'kael_sealbearer', s).ok && PR.canAscend(h, 'kael_grandtemplar', s).code === 'line', '비전은 그 영웅의 어느 2차에서도, 초월은 제 계보만');
  // changeClass 방어
  const hh = mkState('sera', 'sera_priestess').heroes.sera; hh.asc = 'sera_archsaint'; hh.level = 30;
  const cc = PR.changeClass(hh, 'sera_saint');
  ok(cc.ok && hh.asc === null && hh.classId === 'sera_saint', 'changeClass: asc = null');
  // 첫 SP 는 비전으로 시작해도 한 번
  const s2 = mkState('azel', 'azel_seraph'); const ha = s2.heroes.azel;
  PR.unlockFromTrial(ha, 'tr_azel_1'); PR.unlockFromTrial(ha, 'tr_azel_2');
  const spA = ha.sp;
  const fa = PR.ascend(ha, 'azel_dawnblood', s2);
  const fb = PR.ascend(ha, 'azel_nephilim', s2);
  ok(fa.first && !fb.first && ha.sp === spA + 3, '첫 초월 보너스는 영웅마다 한 번 (비전으로 시작해도)');
}

// ══════════════ 5. migrateState ══════════════
section('migrateState (§1.2)');
{
  const base = mkState(); const h = base.heroes.kael;
  // 옛 세이브: 필드 없음 → 아무것도 더하지 않는다
  const old = clone(base); for (const k of ['asc', 'ascUnlocked', 'trials', 'ascSp', 'ascSlot']) delete old.heroes.kael[k];
  const mo = ST.migrateState(clone(old));
  ok(['asc', 'ascUnlocked', 'trials', 'ascSp', 'ascSlot'].every((k) => !(k in mo.heroes.kael)), '옛 세이브 영웅에 초월 필드를 더하지 않는다', Object.keys(mo.heroes.kael));
  ok(isDeepStrictEqual(ST.migrateState(clone(mo)), mo), '옛 세이브 멱등');
  ok(isDeepStrictEqual(ST.migrateState(clone(base)), base), 'newGameState 기본값은 그대로');
  // 망가진 값들
  const s = clone(base); const k = s.heroes.kael;
  k.trials = { tr_kael_1: { done: 1, at: 'x', best: -3, tries: 2.7, junk: 1 }, tr_sera_1: { done: true }, tr_zzz_1: { done: true }, __proto__x: 1, tr_kael_2: 'bad' };
  k.ascUnlocked = ['sera_archsaint', 'kael_blackwing', 'kael_blackwing', 7, null, 'nope'];
  k.asc = 'kael_blackwing';   // 다른 계보 (templar)
  k.ascSp = 'yes'; k.ascSlot = { i: 9, prev: 'x' };
  const m = ST.migrateState(s);
  const mk = m.heroes.kael;
  ok(isDeepStrictEqual(Object.keys(mk.trials), ['tr_kael_1', 'tr_kael_2']), '모르는 시련·다른 영웅 시련 버림', Object.keys(mk.trials));
  ok(isDeepStrictEqual(mk.trials.tr_kael_1, { done: true, at: 0, best: null, tries: 2 }) && isDeepStrictEqual(mk.trials.tr_kael_2, { done: false, at: 0, best: null, tries: 0 }), '시련 기록 {done, at, best, tries} 로', mk.trials);
  ok(isDeepStrictEqual(mk.ascUnlocked, ['kael_blackwing', 'kael_grandtemplar', 'kael_highinquisitor', 'kael_bloodreaver']), 'ascUnlocked: 남의·모르는 id 버림 + 통과한 시련으로 복구 (중복 없음)', mk.ascUnlocked);
  ok(mk.asc === null, 'asc: 지금 2차의 길이 아니면 null');
  ok(mk.ascSp === true && mk.ascSlot === null, 'ascSp 불리언 · 잘못된 ascSlot → null');
  ok(isDeepStrictEqual(ST.migrateState(clone(m)), m), '두 번 돌려도 같다');
  // 여러 경우
  const cases = [
    [{ asc: 'sera_archsaint', ascUnlocked: ['sera_archsaint'] }, null, '다른 영웅의 asc'],
    [{ asc: 'nope' }, null, '모르는 asc'],
    [{ asc: 'kael_grandtemplar', ascUnlocked: [] }, null, '해금 안 된 asc'],
    [{ asc: 'kael_grandtemplar', ascUnlocked: ['kael_grandtemplar'] }, 'kael_grandtemplar', '해금된 asc 유지'],
    [{ asc: 'kael_grandtemplar', trials: { tr_kael_1: { done: true } } }, 'kael_grandtemplar', 'ascUnlocked 를 잃어도 통과 기록으로 복구 → asc 유지'],
    [{ asc: 'kael_sealbearer', ascUnlocked: ['kael_sealbearer'] }, 'kael_sealbearer', '비전 asc 유지 (어느 2차든)'],
    [{ asc: 5 }, null, '숫자 asc'],
  ];
  for (const [patch, want, label] of cases) {
    const x = clone(base); Object.assign(x.heroes.kael, patch);
    const r = ST.migrateState(x);
    ok(r.heroes.kael.asc === want, `asc: ${label}`, r.heroes.kael.asc);
    ok(isDeepStrictEqual(ST.migrateState(clone(r)), r), `멱등: ${label}`);
  }
  // 아케이드: 해금 없이도 asc 유지 (§10.3)
  const ar = clone(base); ar.arcade = { kind: 'practice' }; ar.heroes.kael.asc = 'kael_grandtemplar'; ar.heroes.kael.ascUnlocked = [];
  ok(ST.migrateState(ar).heroes.kael.asc === 'kael_grandtemplar', '아케이드 임시 세이브는 해금 없이도 asc 유지');
  // 비전 기술 1레벨 다시 주기 (§1.3)
  const rg = clone(base); rg.heroes.kael.ascUnlocked = ['kael_sealbearer']; delete rg.heroes.kael.skills.asc_kael_firstseal;
  ok(ST.migrateState(rg).heroes.kael.skills.asc_kael_firstseal === 1, '해금된 비전 기술 1레벨을 다시 준다');
  // classId 가 바뀌어 계보를 벗어나면 asc 버림 (옛 앱이 classId 를 고친 뒤)
  const bad = clone(base); bad.heroes.kael.classId = 'sera_saint'; bad.heroes.kael.asc = 'kael_grandtemplar'; bad.heroes.kael.ascUnlocked = ['kael_grandtemplar'];
  ok(ST.migrateState(bad).heroes.kael.asc === null && ST.migrateState(clone(bad)).heroes.kael.classId === 'kael_hunter', 'classId 복구 뒤 계보 밖 asc 는 null');
  // 퍼징: 초월 필드에 쓰레기
  const JUNK = [undefined, null, 0, -1, 1.5, NaN, '', 'x', 'kael_grandtemplar', [], ['kael_grandtemplar', 3], {}, { a: 1 }, { tr_kael_1: null }, true];
  let seed = 11, thr = 0, notIdem = 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 300; i++) {
    const x = clone(base);
    for (const f of ['asc', 'ascUnlocked', 'trials', 'ascSp', 'ascSlot', 'skills', 'classId']) if (rnd() < 0.5) x.heroes.kael[f] = clone({ v: JUNK[Math.floor(rnd() * JUNK.length)] }).v;
    try {
      const r = quiet(() => ST.migrateState(x));
      if (!isDeepStrictEqual(clone(quiet(() => ST.migrateState(clone(r)))), clone(r))) notIdem++;
    } catch (e) { thr++; if (thr < 3) console.log('    throw:', e.message); }
  }
  ok(thr === 0 && notIdem === 0, `퍼징 300회: throw ${thr} · 멱등 아님 ${notIdem}`);
}

section('옛 앱 흉내 (migrateAsc 없는 migrateState)');
{
  // 지금 state.js 에서 migrateAsc 호출·import 를 뺀 사본 = 이 기능 전의 앱 (CLASSES 는 그대로)
  let src = fs.readFileSync(path.join(ROOT, 'src/game/state.js'), 'utf8');
  src = src.replace(/^\s*migrateAsc\(h, id, s\);.*$/m, '').replace(/^import \{[^}]*\} from '\.\.\/data\/(ascensions|trials)\.js';.*$/gm, '');
  src = src.replace(/from '(\.\.?\/[^']+)'/g, (_, p) => `from '${pathToFileURL(path.join(ROOT, 'src/game', p)).href}'`);
  ok(!/^\s*migrateAsc\(h, id, s\);/m.test(src) && !/data\/ascensions\.js/.test(src), '옛 사본에는 migrateAsc 호출·초월 import 가 없다');
  const OLD = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const s = mkState(); const h = s.heroes.kael;
  PR.unlockFromTrial(h, 'tr_kael_1'); PR.unlockFromTrial(h, 'tr_kael_2'); h.trials = { tr_kael_1: { done: true, at: 5, best: 41.2, tries: 3 }, tr_kael_2: { done: true, at: 6, best: 63, tries: 1 } };
  PR.ascend(h, 'kael_sealbearer', s);
  const saved = clone(s);
  const o = OLD.migrateState(clone(saved));
  ok(o.heroes.kael.classId === 'kael_templar', '옛 앱: 2차 classId 그대로');
  for (const k of ['asc', 'ascUnlocked', 'trials', 'ascSp', 'ascSlot']) ok(isDeepStrictEqual(o.heroes.kael[k], saved.heroes.kael[k]), `옛 앱: ${k} 가 남는다`);
  const back = ST.migrateState(clone(o));
  ok(back.heroes.kael.asc === 'kael_sealbearer' && isDeepStrictEqual(back.heroes.kael.trials, saved.heroes.kael.trials), '새 앱으로 돌아오면 초월 그대로');
  // 옛 앱의 스킬 초기화가 비전 기술을 환급해 지움 → 새 앱이 1레벨을 다시 준다
  delete o.heroes.kael.skills.asc_kael_firstseal;
  ok(ST.migrateState(clone(o)).heroes.kael.skills.asc_kael_firstseal === 1, '옛 앱 초기화 뒤에도 비전 기술 1레벨 복구');
}

// ══════════════ 6. 능력치 · 외형 ══════════════
section('computeStats (§2.6)');
{
  for (const a of A_LIST) {
    const s = mkState(a.charId, a.parents[0], 85); const h = s.heroes[a.charId];
    const s0 = STATS.computeStats(s, h);
    h.asc = a.id; h.ascUnlocked = [a.id];
    const s1 = STATS.computeStats(s, h);
    for (const [k, m] of Object.entries(a.mult)) {
      const want = s0[k] * m;
      ok(Math.abs(s1[k] - want) <= 1.01, `${a.id}: ${k} ×${m} (${s0[k]} → ${s1[k]})`);
    }
    for (const [k, v] of Object.entries(a.flat)) {
      if (k === 'crit') continue;
      ok(Math.abs(s1[k] - s0[k] - v) < 1e-6, `${a.id}: ${k} +${v}`, [s0[k], s1[k]]);
    }
    const dLuck = s1.luck - s0.luck;
    ok(s1.crit - s0.crit <= (a.flat.crit ?? 0) + 0.1 * dLuck + 1e-6, `${a.id}: 치명타 증가 ≤ 고정치 + 행운×0.1`);
    for (const k of ['hp', 'atk', 'mag', 'def', 'res', 'agi']) ok(s1[k] <= s0[k] * 1.12 + 1.01, `${a.id}: ${k} 증가 ≤ ×1.12`);
  }
  // 「초월 보정」: 넘친 치명타·공격 속도 → 치명타 피해 ≤ +20, 이동 속도 ≤ +8 (초월일 때만)
  SK.SKILLS.__t_over = { id: '__t_over', stats: { crit: 300, agi: 3000 } };
  const s = mkState('kael', 'kael_bloodhunter', 85); const h = s.heroes.kael; h.skills.__t_over = 1;
  const a0 = STATS.computeStats(s, h);
  h.asc = 'kael_bloodreaver'; h.ascUnlocked = ['kael_bloodreaver'];
  const a1 = STATS.computeStats(s, h);
  ok(a0.crit === 75 && a1.crit === 75 && a1.atkSpd === 80, '치명타 75 · 공격 속도 80 상한 그대로');
  ok(Math.abs(a1.critDmg - a0.critDmg - 20 - 20) < 1e-6, '초월 보정: 치명타 피해 +20 (상한) + 고정치 20', [a0.critDmg, a1.critDmg]);
  ok(Math.abs(a1.moveSpd - a0.moveSpd - 8) < 1e-6, '초월 보정: 이동 속도 +8 (상한)', [a0.moveSpd, a1.moveSpd]);
  delete h.skills.__t_over;
  const b1 = STATS.computeStats(s, h); h.asc = null; const b0 = STATS.computeStats(s, h);
  ok(b0.crit < 75 && Math.abs(b1.critDmg - b0.critDmg - 20) < 1e-6 && Math.abs(b1.moveSpd - b0.moveSpd) < 1e-6, '넘치지 않으면 보정 0', [b0.crit, b0.atkSpd]);
  // 조금 넘침: 넘친 만큼 비례 (치명타 +4 넘침 → 치명타 피해 +6)
  SK.SKILLS.__t_over.stats = { crit: 75 - b0.crit + 4 };
  h.skills.__t_over = 1; h.asc = 'kael_bloodreaver';
  const c1 = STATS.computeStats(s, h); h.asc = null; const c0 = STATS.computeStats(s, h);
  ok(Math.abs(c1.critDmg - c0.critDmg - 20 - 6) < 1e-6, '초월 보정: 넘친 치명타 4 → 치명타 피해 +6', [c0.critDmg, c1.critDmg]);
  delete h.skills.__t_over; delete SK.SKILLS.__t_over;
  // 해금 안 된 asc 라도 ascOf 는 계보만 본다 (해금은 migrate·progression 이 지킴); 다른 계보면 무시
  h.asc = 'kael_grandtemplar';
  ok(isDeepStrictEqual(STATS.computeStats(s, h), b0), '계보 밖 asc 는 능력치에 영향 없음');
}

section('composeLook · lookTop (§2.6)');
{
  const ch = (id) => CHARACTERS[id];
  const nonStarter = (charId, slot, pred) => Object.values(ITEMS).find((it) => it.slot === slot && !ch(charId).startArmor?.includes(it.id) && pred(it.visual ?? {}));
  for (const a of A_LIST) {
    const s = mkState(a.charId, a.parents[a.parents.length - 1], 85); const h = s.heroes[a.charId];
    const body = nonStarter(a.charId, 'body', (v) => v.armor && v.trim);
    const cloak = nonStarter(a.charId, 'cloak', (v) => v.cape);
    for (const [slot, base] of [['body', body], ['cloak', cloak]]) { const it = makeItem(base.id); addItem(s, it); h.equip[slot] = it.uid; }
    const L0 = STATS.composeLook(s, h);
    ok(L0.classId === h.classId && L0.asc === null, `${a.id}: 초월 전 look.classId = 2차, asc null`);
    h.asc = a.id; h.ascUnlocked = [a.id];
    const snap = clone(h);
    const L = STATS.composeLook(s, h);
    ok(L.classId === h.classId && L.asc === a.id && CLASSES[L.classId].tier === 2, `${a.id}: look.classId = 2차 (${h.classId}), look.asc`);
    const T = a.lookTop;
    if (T.armorTrim) ok(L.armorTrim === T.armorTrim && L0.armorTrim === body.visual.trim, `${a.id}: armorTrim 이 장비 장식색을 덮음`, [L0.armorTrim, L.armorTrim]);
    if (T.capeColor2) ok(L.cape && L.cape.color2 === T.capeColor2 && L.cape.color === L0.cape.color && L0.cape.color2 !== undefined, `${a.id}: capeColor2 는 장비 망토의 안감만`, [L0.cape, L.cape]);
    if (T.aura) ok(isDeepStrictEqual(L.aura, T.aura) && L.aura !== T.aura && !Object.isFrozen(L.aura), `${a.id}: aura (복사본)`);
    for (const k of ['wings', 'halo', 'trailColor']) if (k in T) ok(L[k] === T[k], `${a.id}: ${k}`);
    if (T.scarf) ok(isDeepStrictEqual(L.scarf, T.scarf) && L.scarf !== T.scarf, `${a.id}: scarf (복사본)`);
    if (T.tint) ok(isDeepStrictEqual(L.tint, T.tint), `${a.id}: tint`);
    if (T.wingCol) ok(isDeepStrictEqual(L.wingCol, T.wingCol) && L.wingCol !== T.wingCol, `${a.id}: wingCol (복사본)`);
    if (a.look.armorColor) ok(L.armorColor === body.visual.color, `${a.id}: look.armorColor(장비 전)는 장비 갑옷색에 덮인다`);
    ok(isDeepStrictEqual(h, snap), `${a.id}: composeLook 은 영웅을 바꾸지 않음`);
    const Lp = STATS.lookForAsc(s, { ...h, asc: null }, a.id);
    ok(isDeepStrictEqual(Lp, L) && isDeepStrictEqual(h, snap), `${a.id}: lookForAsc 미리보기 = 실제, 영웅 그대로`);
  }
  // 망토 없는 영웅에 capeColor2 → 망토를 만들지 않는다
  let found = 0;
  for (const a of A_LIST.filter((x) => x.lookTop.capeColor2)) {
    for (const p of a.parents) {
      const s = mkState(a.charId, p, 85); const h = s.heroes[a.charId];
      if (STATS.composeLook(s, h).cape) continue;
      h.asc = a.id; h.ascUnlocked = [a.id];
      ok(!STATS.composeLook(s, h).cape, `${a.id} (${p}, 망토 없음): capeColor2 가 망토를 만들지 않음`);
      found++;
    }
  }
  if (!found) console.log('  (망토 없는 capeColor2 사례 없음 — 생략)');
  // 시작 갑옷: look.armorColor 가 직업색 위에
  const s = mkState('kael', 'kael_templar', 85); const h = s.heroes.kael; h.asc = 'kael_grandtemplar'; h.ascUnlocked = ['kael_grandtemplar'];
  const L = STATS.composeLook(s, h);
  ok(L.armorColor === '#eef0f8' && L.cape.color === '#f4f0e4' && L.cape.color2 === '#c8102a' && L.cape.len === 1.25, '시작 갑옷: 초월 look(갑옷색·망토)이 그대로');
  L.aura.color = '#000000';
  ok(ASCENSIONS.kael_grandtemplar.lookTop.aura.color === '#ffe080', 'look 을 고쳐도 표는 그대로');
}

// ══════════════ 7. NG+ ══════════════
section('NG+ (§1.4)');
{
  const s = mkState('isolde', 'isolde_spearsaint', 82, { p2_done: true, ending_p2true: true, ex_s21_done: true });
  const h = s.heroes.isolde;
  h.trials = { tr_isolde_1: { done: true, at: 1, best: 44, tries: 2 }, tr_isolde_2: { done: true, at: 2, best: 70, tries: 5 } };
  PR.unlockFromTrial(h, 'tr_isolde_1'); PR.unlockFromTrial(h, 'tr_isolde_2');
  PR.ascend(h, 'isolde_dragonbond', s);
  const n = ST.migrateState(startNgPlus(s, { slot: 2, now: 1700000000000 }));
  const nh = n.heroes.isolde;
  ok(n.ng?.n === 1 && !n.progress.flags.p2_done, 'NG+: 회차 1, 플래그 지워짐');
  for (const k of ['asc', 'ascUnlocked', 'trials', 'ascSp', 'ascSlot']) ok(isDeepStrictEqual(nh[k], h[k]), `NG+: ${k} 이어짐`);
  ok(nh.skills.asc_isolde_breath >= 1 && nh.slots.includes('asc_isolde_breath'), 'NG+: 비전 기술·장착 이어짐');
  ok(AS.p2Cleared(n) && !AS.p2Cleared({ ...n, arcade: { kind: 'practice' } }), 'p2Cleared: ng.n > 0 이면 참 (아케이드 제외)');
  ok(PR.canAscend(nh, 'isolde_speargod', n).ok, 'NG+: 해금된 초월로 전환 가능');
  ok(PR.canStartTrial(nh, 'tr_isolde_1', n).code === 'p2', 'NG+: 시련 시작은 이번 회차 p2_done 필요');
  ok(AS.flagEver(n, 'ex_s21_done'), 'NG+: 지난 회차 플래그 flagEver');
  ok(AS.p2Cleared({ progress: { flags: { ending_p2: true } } }) && !AS.p2Cleared({ progress: { flags: {} } }) && !AS.p2Cleared({}), 'p2Cleared 플래그');
}

// ══════════════ 8. 요약 ══════════════
section('saves.list · cloud summarize (§1.3)');
{
  const s = mkState('bran', 'bran_guardian', 80); const h = s.heroes.bran;
  PR.unlockFromTrial(h, 'tr_bran_1'); PR.ascend(h, 'bran_bastion', s);
  saves.write(2, s);
  const s3 = ST.newGameState({ charId: 'lia' }); saves.write(3, s3);
  const L = saves.list();
  ok(L[1].asc === 'bran_bastion' && L[1].classId === 'bran_guardian', 'saves.list: asc 실음', L[1]);
  ok(L[2].asc === null && L[0].empty, 'saves.list: 초월 없음 → null');
  const sm = CL.summarize(s);
  ok(sm.asc === 'bran_bastion' && sm.classId === 'bran_guardian', 'summarize: asc 실음');
  const so = CL.summarize(s3);
  ok(!('asc' in so), 'summarize: 초월 없으면 asc 키 없음');
  if (serverSummary) ok(isDeepStrictEqual(so, serverSummary(s3)), '초월 없는 세이브 요약 = 서버 saveSummary');
  ok(AS.ascName('bran_bastion') === '성채 기사' && AS.ascName('nope') === null && AS.ascName(undefined) === null, 'ascName');
}

// ══════════════ 9. 퍼펫 ══════════════
section('퍼펫 원화 고르기 (§2.7)');
if (PUP?.artClass) {
  for (const a of A_LIST) {
    ok(PUP.artClass(a.charId, a.id) === (PUPPETS[a.charId]?.[a.id] ? a.id : a.parents[0]), `artClass(${a.id}) → 원화 직업`);
    for (const p of a.parents) {
      const look = { classId: p, asc: a.id };
      const want = PUPPETS[a.charId]?.[a.id] ? a.id : p;
      ok(PUP.classOf({ ch: { id: a.charId } }, look) === want, `classOf(${p} + ${a.id}) = ${want}`);
    }
    ok(PUP.hasPuppet(a.charId, a.id), `hasPuppet(${a.charId}, ${a.id}) — 2차 원화로`);
  }
  for (const c of Object.values(CLASSES)) ok(PUP.artClass(c.charId, c.id) === c.id && PUP.hasPuppet(c.charId, c.id), `기존 직업 ${c.id} 는 제 원화 그대로`);
  ok(PUP.artClass('kael', 'nope') === null && PUP.artClass(null, 'kael_templar') === null, 'artClass: 모르는 id → null');
} else console.log('  (hero_puppet.js 를 node 에서 불러오지 못해 생략 — 브라우저 점검으로)');

console.log(`${fails ? '✗' : '✓'} test_ascension: ${passes} 통과, ${fails} 실패`);
process.exit(fails ? 1 : 0);
