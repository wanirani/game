// tools/balance.mjs --asc 본체 (classes_t3 §2.8 · §11.2, QA-ASC) — 초월 28 · 비전 7 을 그 2차 직업과 견준다.
//
//  1) 자료 예산 (§2.8): 자기 Σ(mult−1) ∈ [0.15, 0.25] · mult 하나 ≤ 1.12 · flat 상한 · 계보 dmgReduce ≤ 45 (비전은 네 2차 계보 모두)
//  2) 능력치 층 (닫힌 식, computeStats, 시드 5개 평균, Lv = reqLevel 70/75, balance.mjs --ng 장비 모형):
//     공격 효율 = 힘(지팡이 마력) × (1 + 치명률 × (0.5 + 치명피해)) × (1 + 공격 속도)   — 속성 % 는 따로 (무기·동작 속성에 달림)
//     eHP = HP ÷ (100 / (100 + 방어 × 1.2) × (1 − 피해 감소))                          — §11.2: Δ 공격 효율 ≤ +12 %, Δ eHP ≤ +15 %
//  3) 특성 층 (대본 싸움, tools/qa/lib/asc_arena.mjs — 진짜 Player·hitTarget·특성 훅, Node): 모드 mob/pack/boss/kill/calm/siege,
//     변형 base(2차) / off(asc 능력치, 그 asc 특성 항목만 뺌) / on(asc 전체, 비전은 액티브도). sig = on ÷ off, stat = off ÷ base, tot = on ÷ base.
//     siege 는 맞기만 해서 쓰러질 때까지 받아 낸 양(eHP). mit = 피격 모드에서 받은 피해(최대 HP 비율)의 역수 비.
//  4) 시련 길이 (Lv 70/75 모형 영웅 = 2차 네 직업, 시련 레벨 74/80 보스, trial.prepareTrial 의 규칙·보스 체력, 결투장 boss 모드로 처치까지):
//     목표 40–75초 (§11.2). 결투장은 쉬지 않고 치는 시간(회피·이동·보스 무적·두 번째 형태 없음)이라 실제보다 짧다 — 모형 값.
//     기준 열: 같은 영웅·직업이 2부 마지막 보스(s20, Lv 67)를 쓰러뜨리는 모형 시간 (ratio = 시련 ÷ 기준).
// --check: (1)·(2) 위반, 특성 오류/경고(throw·console), 지속 sig(mob·pack·boss 가운데값) > +20 % (비전 +30 %: 액티브 포함),
//          시련 보스를 200초 안에 못 쓰러뜨림 → 실패. 경고(실패 아님): 모든 모드 sig < +2 % 이고 생존 효과도 없음(모형으로 안 보임) ·
//          지속 sig > +12 % · siege sig > +50 % · 받은 피해 ×0.67 미만 · 시련 모형 시간이 40–75 s 띠 밖 (모형이 실제 길이를 재지 못해 경고만).
import fs from 'node:fs';
import { CLASSES, classChain } from '../../../src/data/classes.js';
import { ASCENSIONS } from '../../../src/data/ascensions.js';
import { TRIALS } from '../../../src/data/trials.js';
import { STAGES } from '../../../src/data/stages.js';
import { BOSSES } from '../../../src/data/bosses.js';
import { CHARACTERS } from '../../../src/data/characters.js';
import { measure, ratios, parentOf, avgStats, fight } from './asc_arena.mjs';
import { prepareTrial } from '../../../src/game/trial.js';
import { enemyStats } from '../../../src/game/enemy.js';
import { getDiff } from '../../../src/data/difficulty.js';

export const FLAT_CAP = Object.freeze({ crit: 8, critDmg: 25, dmgReduce: 8, lifesteal: 3, atkSpd: 12, cdr: 10, moveSpd: 8, hpRegen: 2, mpRegen: 2, skillDmg: 12, reach: 10, jumpPow: 10, luck: 10, element: 25 });
const ELEMENTS = ['fire', 'ice', 'holy', 'dark', 'thunder'];
export const LIMITS = Object.freeze({ atkEff: 0.12, ehp: 0.15, sigT3: 0.20, sigHidden: 0.30, sigWarn: 0.12, siegeWarn: 0.50, felt: 0.02, trial: [40, 75] });
const pct = (x, d = 1) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%` : '∞');
const r1 = (x) => Math.round(x * 10) / 10;

// ─────────────────────────── 1) 자료 예산 ───────────────────────────
export function budgetOf(A) {
  const fails = [];
  const m = A.mult ?? {}, f = A.flat ?? {};
  const sum = Object.values(m).reduce((a, v) => a + (v - 1), 0);
  if (!(sum >= 0.15 - 1e-9 && sum <= 0.25 + 1e-9)) fails.push(`Σ(mult−1) ${sum.toFixed(3)} ∉ [0.15, 0.25]`);
  for (const [k, v] of Object.entries(m)) if (v > 1.12 + 1e-9) fails.push(`mult.${k} ${v} > 1.12`);
  for (const [k, v] of Object.entries(f)) {
    const cap = ELEMENTS.includes(k) ? FLAT_CAP.element : FLAT_CAP[k];
    if (cap === undefined) fails.push(`flat.${k} 상한 없음 (§2.8 표 밖)`);
    else if (v > cap) fails.push(`flat.${k} ${v} > ${cap}`);
  }
  const parents = A.parents?.length ? A.parents : [A.parent];
  let chainDr = 0;
  for (const pid of parents) {
    const dr = classChain(pid).reduce((a, c) => a + (c.flat?.dmgReduce ?? 0), 0) + (f.dmgReduce ?? 0);
    chainDr = Math.max(chainDr, dr);
  }
  if (chainDr > 45) fails.push(`계보 dmgReduce ${chainDr} > 45`);
  return { sum: +sum.toFixed(3), chainDr, fails };
}

// ─────────────────────────── 2) 능력치 층 ───────────────────────────
function effOf(s, mag) {
  const power = mag ? s.mag : s.atk;
  const crit = Math.min(75, s.crit ?? 0) / 100;
  const atkEff = power * (1 + crit * (0.5 + (s.critDmg ?? 0) / 100)) * (1 + (s.atkSpd ?? 0) / 100);
  const ehp = s.hp / ((100 / (100 + Math.max(0, s.def ?? 0) * 1.2)) * (1 - Math.min(75, s.dmgReduce ?? 0) / 100));
  return { atkEff, ehp, power };
}
export function statLayer(A) {
  const charId = A.charId, mag = CHARACTERS[charId].weaponType === 'staff';
  const parents = A.parents?.length ? A.parents : [A.parent];
  const rows = parents.map((pid) => {
    const b = avgStats(charId, pid, null, A.reqLevel), a = avgStats(charId, pid, A.id, A.reqLevel);
    const eb = effOf(b, mag), ea = effOf(a, mag);
    const el = {};
    for (const k of ELEMENTS) if ((a[k] ?? 0) !== (b[k] ?? 0)) el[k] = r1((a[k] ?? 0) - (b[k] ?? 0));
    return { parent: pid, dAtk: ea.atkEff / eb.atkEff - 1, dEhp: ea.ehp / eb.ehp - 1, dPower: ea.power / eb.power - 1, el,
      dCrit: r1((a.crit ?? 0) - (b.crit ?? 0)), dCritDmg: r1((a.critDmg ?? 0) - (b.critDmg ?? 0)), dAtkSpd: r1((a.atkSpd ?? 0) - (b.atkSpd ?? 0)) };
  });
  // 비전: 네 2차 가운데 가장 큰 변화로 판정
  const worst = rows.reduce((m, r) => (r.dAtk > m.dAtk ? r : m), rows[0]);
  const worstE = rows.reduce((m, r) => (r.dEhp > m.dEhp ? r : m), rows[0]);
  return { rows, dAtk: worst.dAtk, dEhp: worstE.dEhp, el: worst.el };
}

// ─────────────────────────── 4) 시련 길이 ───────────────────────────
/**
 * 보스 모형: 스테이지 보스 데이터 + 레벨·난이도 덮어쓰기 (boss.js Boss 생성자와 같은 체력 식: early · late · hpMul).
 * 시련은 trial.prepareTrial 의 규칙(rules)·난이도(diffOver, bossHp 배율 포함)·적 레벨(levelOverride) 그대로
 */
export function bossModel(stageId, { bossId, level, diffOver = {}, rules = null } = {}) {
  const st = STAGES[stageId], def = BOSSES[bossId ?? st.boss];
  const lvl = level ?? st.level;
  const D = { ...getDiff('normal'), ...diffOver };
  const s = enemyStats({ ...def, lv: lvl }, lvl, { ...D, enemyHp: D.bossHp ?? D.enemyHp }, false);
  const early = 1 + Math.max(0, 10 - (lvl - 1)) * 0.1;
  const late = 1 / (1 + Math.max(0, lvl - 24) * 0.035);
  const maxHp = Math.round(s.maxHp * (def.hpMul ?? 1) * early * late);
  return { def, lvl, stats: { ...s, maxHp, hp: maxHp }, rules };
}
export function trialBoss(T) {
  const prep = prepareTrial({ state: { difficulty: 'normal' } }, T.id);
  return bossModel(T.stage, { bossId: T.boss, level: prep.opts.levelOverride, diffOver: prep.opts.diffOver, rules: prep.opts.rules });
}
const REF = new Map();   // 영웅·2차 → 2부 마지막 보스(s20) 처치 시간 (Lv 67 = balance.mjs s20 진입 레벨대)
function killTime(charId, cls, B, level, seed) {
  const r = fight({ charId, classId: cls, asc: null, variant: 'base', mode: 'boss', secs: 200, seed, level, boss: { stats: B.stats, rules: B.rules, enemyLevel: B.lvl } });
  return r.killTime;
}
/**
 * 시련 길이 모형: 2차 네 직업 × 모형 영웅(Lv = 시련 reqLevel 70/75, 'table' 장비)을 결투장 boss 모드에 세워 처치 시간(실제 초, 경직 포함).
 * 기준 = 같은 영웅·직업이 2부 마지막 보스(s20 본래 레벨, Lv 67)를 쓰러뜨리는 시간 → ratio = 시련 ÷ 기준 (이야기 마지막 보스전 대비 길이)
 */
export function trialProbe(T, { seed = 1 } = {}) {
  const B = trialBoss(T);
  const t2 = Object.values(CLASSES).filter((c) => c.charId === T.charId && c.tier === 2).map((c) => c.id);
  const ref = bossModel('s20');
  const out = [];
  for (const cls of t2) {
    const time = killTime(T.charId, cls, B, T.reqLevel, seed);
    const key = `${T.charId}|${cls}`;
    if (!REF.has(key)) REF.set(key, killTime(T.charId, cls, ref, 67, seed));
    out.push({ cls, time, ref: REF.get(key) });
  }
  const times = out.map((o) => o.time).filter((t) => t != null);
  const ratios = out.filter((o) => o.time != null && o.ref > 0).map((o) => o.time / o.ref);
  return {
    id: T.id, boss: B.def.id, lvl: B.lvl, hp: B.stats.maxHp, refHp: ref.stats.maxHp, rules: B.rules, rows: out,
    min: times.length ? Math.min(...times) : null, max: times.length === out.length ? Math.max(...times) : null,
    ratio: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null,
    curMul: T.diffOver?.bossHp ?? 1,
  };
}

// ─────────────────────────── 실행 ───────────────────────────
export function selectAsc(sel, charFilter) {
  const all = Object.values(ASCENSIONS);
  let L;
  if (!sel || sel === 'all' || sel === true) L = all;
  else if (sel === 't3' || sel === 'hidden') L = all.filter((A) => A.kind === sel);
  else {
    const ids = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
    const bad = ids.filter((id) => !ASCENSIONS[id]);
    if (bad.length) throw new Error(`알 수 없는 asc id: ${bad.join(', ')} (all | t3 | hidden | <id>[,<id>])`);
    L = ids.map((id) => ASCENSIONS[id]);
  }
  if (charFilter) L = L.filter((A) => A.charId === charFilter);
  return L;
}

export async function runAsc(o) {
  const { sel, charFilter, check, mdPath, json, seeds = 3, secs = 40, modes = ['mob', 'pack', 'boss', 'kill', 'calm', 'siege'], trials = true, log = console.log } = o;
  const list = selectAsc(sel, charFilter);
  const fails = [], warns = [];
  const t0 = Date.now();
  // 1) + 2)
  const data = list.map((A) => {
    const b = budgetOf(A), st = statLayer(A);
    for (const f of b.fails) fails.push({ id: A.id, what: 'budget', msg: f });
    if (st.dAtk > LIMITS.atkEff + 1e-9) fails.push({ id: A.id, what: 'stat', msg: `공격 효율 ${pct(st.dAtk)} > +${LIMITS.atkEff * 100}%` });
    if (st.dEhp > LIMITS.ehp + 1e-9) fails.push({ id: A.id, what: 'stat', msg: `eHP ${pct(st.dEhp)} > +${LIMITS.ehp * 100}%` });
    return { A, b, st };
  });
  // 3)
  const seedList = Array.from({ length: seeds }, (_, i) => i + 1);
  for (const d of data) {
    const A = d.A;
    const m = measure({ charId: A.charId, classId: parentOf(A.id), asc: A.id, modes, seeds: seedList, secs });
    d.sim = m;
    d.r = Object.fromEntries(Object.entries(m.rows).map(([k, row]) => [k, ratios(row)]));
    const err = Object.values(m.rows).reduce((a, r) => a + r.errors, 0), wn = Object.values(m.rows).reduce((a, r) => a + r.warns, 0);
    if (err) fails.push({ id: A.id, what: 'perk', msg: `특성 오류 ${err}회 (${Object.values(m.rows).map((r) => r.perkLast).find(Boolean)})` });
    if (wn) fails.push({ id: A.id, what: 'perk', msg: `console 경고/오류 ${wn}회: ${JSON.stringify(Object.values(m.rows).flatMap((r) => r.warnSample).slice(0, 2))}` });
    const sus = ['mob', 'pack', 'boss'].filter((k) => d.r[k]).map((k) => d.r[k].sig - 1).sort((a, b) => a - b);
    d.sustained = sus.length ? sus[Math.floor(sus.length / 2)] : null;
    const lim = A.kind === 'hidden' ? LIMITS.sigHidden : LIMITS.sigT3;
    if (d.sustained != null && d.sustained > lim) fails.push({ id: A.id, what: 'sig', msg: `지속 sig ${pct(d.sustained)} > +${lim * 100}% (mob/pack/boss 가운데값)` });
    else if (d.sustained != null && d.sustained > LIMITS.sigWarn) warns.push({ id: A.id, msg: `지속 sig ${pct(d.sustained)} > +${LIMITS.sigWarn * 100}% (§2.8 목표 +5–10 %)` });
    const dpsModes = ['mob', 'pack', 'boss', 'kill', 'calm'].filter((k) => d.r[k]);
    const maxSig = Math.max(...dpsModes.map((k) => d.r[k].sig - 1));
    const siegeSig = d.r.siege ? d.r.siege.sig - 1 : 0;
    const maxMit = Math.max(1, ...dpsModes.map((k) => d.r[k].mitSig ?? 1));
    d.maxSig = maxSig; d.siegeSig = siegeSig; d.maxMit = maxMit;
    if (maxSig < LIMITS.felt && siegeSig < 0.03 && maxMit < 1.03) warns.push({ id: A.id, msg: `특성이 모형에서 보이지 않는다 (모든 모드 sig < +2 %, 생존 효과 없음) — 이동·공중·회피 위주 특성이면 정상` });
    if (siegeSig > LIMITS.siegeWarn) warns.push({ id: A.id, msg: `siege eHP sig ${pct(siegeSig)} > +${LIMITS.siegeWarn * 100}%` });
    if (maxMit > 1.5) warns.push({ id: A.id, msg: `피격 모드 받은 피해 ×${(1 / maxMit).toFixed(2)} (mit ×${maxMit.toFixed(2)})` });
    log(`  · ${A.id.padEnd(20)} sig mob ${pct(d.r.mob?.sig - 1)} pack ${pct(d.r.pack?.sig - 1)} boss ${pct(d.r.boss?.sig - 1)} kill ${pct(d.r.kill?.sig - 1)} calm ${pct(d.r.calm?.sig - 1)} siege ${pct(siegeSig)}`);
  }
  // 4)
  let tri = [];
  if (trials) {
    const tl = Object.values(TRIALS).filter((T) => !charFilter || T.charId === charFilter);
    for (const T of tl) {
      const p = trialProbe(T);
      tri.push(p);
      if (p.max == null) fails.push({ id: T.id, what: 'trial', msg: `모형 영웅이 200초 안에 보스를 쓰러뜨리지 못했다 (${p.rows.filter((r) => r.time == null).map((r) => r.cls).join(', ')})` });
      else if (p.max < LIMITS.trial[0]) warns.push({ id: T.id, msg: `모형 처치 ${r1(p.min)}–${r1(p.max)} s (쉬지 않고 칠 때) — 목표 ${LIMITS.trial.join('–')} s 띠보다 짧다 · 2부 마지막 보스 대비 ×${p.ratio?.toFixed(2)}` });
      else if (p.min > LIMITS.trial[1]) warns.push({ id: T.id, msg: `모형 처치 ${r1(p.min)}–${r1(p.max)} s — 목표 띠보다 길다` });
    }
  }
  const out = { secs, seeds, modes, limits: LIMITS, entries: data.map(toJson), trials: tri, fails, warns, elapsed: (Date.now() - t0) / 1000 };
  if (mdPath) { fs.writeFileSync(mdPath, toMarkdown(out)); log(`  → ${mdPath}`); }
  if (json) log(JSON.stringify(out, null, 1));
  else printSummary(out, log);
  return check && fails.length ? 1 : 0;
}

function toJson(d) {
  const A = d.A;
  return {
    id: A.id, kind: A.kind, charId: A.charId, parent: parentOf(A.id), est: A.est, budget: d.b,
    stat: { dAtk: +d.st.dAtk.toFixed(4), dEhp: +d.st.dEhp.toFixed(4), el: d.st.el, rows: d.st.rows.map((r) => ({ ...r, dAtk: +r.dAtk.toFixed(4), dEhp: +r.dEhp.toFixed(4), dPower: +r.dPower.toFixed(4) })) },
    sim: Object.fromEntries(Object.entries(d.r ?? {}).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, Number.isFinite(b) ? +b.toFixed(4) : b]))])),
    sustained: d.sustained, maxSig: d.maxSig, siegeSig: d.siegeSig, maxMit: d.maxMit, level: d.sim?.level,
    procs: d.sim ? Object.fromEntries(Object.entries(d.sim.rows).map(([k, r]) => [k, r.procs])) : null,
  };
}

function printSummary(out, log) {
  log(`초월·비전 ${out.entries.length}개 · 대본 ${out.seeds}시드 × ${out.secs}초 · ${out.elapsed.toFixed(1)}초 걸림`);
  for (const t of out.trials) log(`  시련 ${t.id.padEnd(12)} ${t.boss.padEnd(14)} Lv ${t.lvl} HP ${t.hp}: ${t.rows.map((r) => `${r.cls.replace(/^[a-z]+_/, '')} ${r.time == null ? '—' : r1(r.time) + 's'}`).join(' · ')} · s20 기준 대비 ×${t.ratio?.toFixed(2)}`);
  if (out.warns.length) { log(`! 경고 ${out.warns.length}`); for (const w of out.warns) log(`   ${w.id}: ${w.msg}`); }
  if (!out.fails.length) log('✓ §2.8 예산 · 능력치 층 · 특성 층 · 시련 길이 기준 안');
  else { log(`✗ 기준 밖 ${out.fails.length}`); for (const f of out.fails) log(`   ${f.id} [${f.what}] ${f.msg}`); }
}

function toMarkdown(out) {
  const L = [];
  const M = ['mob', 'pack', 'boss', 'kill', 'calm'];
  L.push('# 초월 · 비전 밸런스 (tools/balance.mjs --asc)', '');
  L.push(`생성: ${new Date().toISOString()} · 대본 ${out.seeds}시드 × ${out.secs}초 (siege 는 쓰러질 때까지, 최대 150초) · ${out.entries.length}개 · ${out.elapsed.toFixed(1)}초`, '');
  L.push('## 읽는 법', '');
  L.push('- **능력치 층** (닫힌 식, Lv 70/75, 7단계 희귀도 4 장비 시드 5개 평균): Δ공격 효율 = 힘(마력) × 치명 기댓값 × 공격 속도, ΔeHP = HP ÷ (방어 감쇠 × 피해 감소). §11.2 한도 +12 % / +15 %. 속성 % 는 따로 (무기·동작 속성에 달림).');
  L.push('- **특성 층** (Node 결투장 `tools/qa/lib/asc_arena.mjs`: 진짜 Player·hitTarget·impact·World.onPlayerHit/onEnemyKilled·특성 훅, 렌더 없음, Lv = arcade.lv 80/85): 기본 콤보 연타 + 공용 스킬 재사용마다 + 2초마다 적 1타(2차에게 최대 HP 8 %). **sig** = asc ÷ (asc − 그 특성 항목), **stat** = (asc − 특성) ÷ 2차, **tot** = asc ÷ 2차. 비전 on 은 액티브도 시전.');
  L.push('- 모드: mob 허수아비 1(HP 1e7) · pack 3 · boss 1(kind boss) · kill 3(2차 공격력 × 25 HP, 처치 0.3초 뒤 다시) · calm(mob, 피격 없음) · **siege**(공격 없이 1.2초마다 맞기만 — 쓰러질 때까지 받아 낸 적 공격력 합 = eHP).');
  L.push('- **mit** = 피격 모드에서 받은 피해(최대 HP 비율)의 역수 비 (1.15 = 15 % 덜 받음). 대본 옵션: 대시(specter 1.5 s · silverwolf/vanguard 2 s · umbra/nightlord 1.5 s 제자리), 급강하(skysovereign/dragonbond 2.5 s), 대시 공격(abyssdragoon 2 s), 점프(blackwing 3 s).');
  L.push(`- --check 실패: 예산 위반 · Δ공격 효율 > +12 % · ΔeHP > +15 % · 특성 오류/경고 · 지속 sig(mob/pack/boss 가운데값) > +20 % (비전 +30 %, 액티브 포함) · 시련 보스를 200 s 안에 못 쓰러뜨림. 경고: 지속 sig > +12 % · siege sig > +50 % · 받은 피해 ×0.67 미만 · 특성이 모형에서 안 보임 · 시련 모형 시간이 40–75 s 띠 밖.`, '');
  L.push('## 1. §2.8 예산 · 능력치 층', '');
  L.push('| asc | 종류 | 2차 | Σ(mult−1) | 계보 DR | Δ공격 효율 | ΔeHP | Δ속성 | est dps/ehp | 예산 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const e of out.entries) {
    L.push(`| ${e.id} | ${e.kind} | ${e.parent} | ${e.budget.sum} | ${e.budget.chainDr} | ${pct(e.stat.dAtk)} | ${pct(e.stat.dEhp)} | ${Object.entries(e.stat.el).map(([k, v]) => `${k} +${v}`).join(' ') || '-'} | ${e.est?.dps}/${e.est?.ehp} | ${e.budget.fails.length ? '✗ ' + e.budget.fails.join('; ') : '✓'} |`);
  }
  L.push('', '## 2. 특성 층 — 피해 sig (asc ÷ asc−특성) · stat · tot', '');
  L.push(`| asc | ${M.map((m) => `${m} sig`).join(' | ')} | 지속 sig | stat (mob) | tot (mob) | tot (pack) | siege eHP sig | siege eHP tot | mit max |`);
  L.push(`|---|${M.map(() => '---').join('|')}|---|---|---|---|---|---|---|`);
  for (const e of out.entries) {
    const s = e.sim;
    L.push(`| ${e.id} | ${M.map((m) => (s[m] ? pct(s[m].sig - 1) : '-')).join(' | ')} | **${pct(e.sustained)}** | ${pct(s.mob?.stat - 1)} | ${pct(s.mob?.tot - 1)} | ${pct(s.pack?.tot - 1)} | ${s.siege ? pct(s.siege.sig - 1) : '-'} | ${s.siege ? pct(s.siege.tot - 1) : '-'} | ×${e.maxMit?.toFixed(2)} |`);
  }
  L.push('', '### 특성 발동 수 (on, 시드 1, 모드별 p._pk.cnt — 있는 것만)', '');
  for (const e of out.entries) {
    const P = Object.entries(e.procs ?? {}).filter(([, v]) => v && Object.keys(v).length).map(([k, v]) => `${k}: ${Object.entries(v).map(([a, b]) => `${a} ${b}`).join(', ')}`);
    if (P.length) L.push(`- ${e.id} — ${P.join(' · ')}`);
  }
  if (out.trials.length) {
    L.push('', '## 3. 시련 길이 (모형: Lv 70/75 2차 영웅, 결투장 boss 모드로 처치까지 — 회피·이동·보스 무적·두 번째 형태 없음)', '');
    L.push(`기준 = 같은 영웅·2차가 2부 마지막 보스(s20 ${out.trials[0]?.refHp ?? ''} HP, Lv 67 영웅)를 쓰러뜨리는 모형 시간. 목표 띠 40–75 s 는 실제 전투 길이라 모형 값과 바로 견줄 수 없다 — 시련끼리의 차이와 기준 대비 비율을 본다.`, '');
    L.push('「s20 과 같은 길이」 열 = 기준 대비 ×1.0 이 되려면 필요한 T.diffOver.bossHp (지금 값 ÷ 기준 대비 비율) — 제안 값이 아니라 눈금이다.', '');
    L.push('| 시련 | 보스 | 적 Lv | 보스 HP | 규칙 | 2차별 처치 시간 s (기준 s) | 최소–최대 | 기준 대비 | bossHp 지금 → s20 과 같은 길이 |');
    L.push('|---|---|---|---|---|---|---|---|---|');
    for (const t of out.trials) {
      const rl = Object.entries(t.rules ?? {}).filter(([k]) => k !== 'label').map(([k, v]) => `${k} ${v}`).join(' ') || '-';
      L.push(`| ${t.id} | ${t.boss} | ${t.lvl} | ${t.hp} | ${rl} | ${t.rows.map((r) => `${r.cls.replace(/^[a-z]+_/, '')} ${r.time == null ? '—' : r1(r.time)} (${r.ref == null ? '—' : r1(r.ref)})`).join(' · ')} | ${t.min == null ? '—' : r1(t.min)}–${t.max == null ? '—' : r1(t.max)} | ×${t.ratio == null ? '—' : t.ratio.toFixed(2)} | ${t.curMul} → ${t.ratio ? (t.curMul / t.ratio).toFixed(2) : '—'} |`);
    }
  }
  L.push('', '## 4. 판정', '');
  if (!out.fails.length) L.push('✓ 실패 없음');
  else for (const f of out.fails) L.push(`- ✗ **${f.id}** [${f.what}] ${f.msg}`);
  for (const w of out.warns) L.push(`- ! ${w.id}: ${w.msg}`);
  L.push('');
  return L.join('\n');
}
