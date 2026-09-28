#!/usr/bin/env node
// 동료 밸런스 모형 (CMP-QA; companions §9 · §14 C10 10번; MASTER_PLAN §1.2 — 2부 점검점 (30,60) · (30,68) 추가)
//
//   node tools/balance_companions.mjs              여섯 영웅 전부 · 모든 수호신 · 모든 탈것
//   node tools/balance_companions.mjs kael         한 영웅만        --json   결과 JSON 만    --verbose   세부 항목까지
//   --mvps 3.25   플레이어 지속 공격량 (모션 배율/초). 명세 §9 가정 "플레이어 콤보 ≈ 3.0–3.5 mv/s" — 기본은 3.0 과 3.5 두 끝을 모두 본다
//
// ── 무엇을 재나 ──
// 수호신: 모형으로 낸 초당 피해를 플레이어 초당 피해와 비교한 몫 share = g / (p + g).
//   영웅 능력치 = tools/balance.mjs 기준 실행과 같은 규칙(레벨 → 장비 단계·희귀도·강화, 직업 첫 갈래)으로 만든 영웅 +
//   장착한 수호신의 오라 (computeStats 가 그대로 더한다). 수호신 수치 = companion_state.guardianDerived (게임이 쓰는 함수 그대로).
//   적 = 그 영웅 레벨에 해당하는 스테이지 적들의 방어·마법 방어 중앙값 (enemyStats). 피해식 = combat.js computeDamage 의 기대값.
//   · 자동 공격: 데이터의 kind 별 한 번 공격의 배율 합 ÷ 공격 간격 × 가동률 (근접형 60% — 명세 §9 "이동 때문에 ~60%", 원거리 90%)
//   · 스킬: 단일 대상 배율(구현을 읽어 셈: 예 미라 파편 8개가 한 적에게, 크론 뼈 궤도는 겹침 40%) × 유대 위력 ÷ 재사용 대기 × 사용률 80%
//   · 협공: 협공 배율 × min(1/협공 대기, 플레이어 발동 빈도) × 70% · 공명(유대 3+): 필살기 45초마다 스킬 60%
//   · 고유 능력: 모르스 처형(일반 적, 3초 내부 대기) · 미라 되비추기(5초마다, 탄이 있을 확률 40%)
//   장면 두 가지: '필드' (일반 적 둘 — 광역이 둘을 치고 플레이어 베기는 1.4 배, 처형 적용) · '보스' (한 대상, 처형 없음)
// 합격 기준 (어기면 종료 코드 1):
//   B1  모든 수호신 × 모든 영웅 × 점검점 (동료 Lv, 영웅 Lv) = (1,5) (10,15) (20,30) (30,45) (30,60) (30,68) 에서
//       유대 0 · 유대 5 모두, 두 장면 모두, 플레이어 3.0·3.5 mv/s 모두 → 몫 ∈ [6%, 30%]   (companions §9 "Hard limits")
//   B2  그림메인 Lv 1 버티기 배율 ≈ 1.29 · 기수 몫 ≈ 0.39 (명세 §9 예시; 공식·데이터 어긋남 검출)
// 참고 (경고만): 명세 기대 범위 Lv1 8–12% · Lv15 13–18% · Lv30 유대5 20–28% (필드, 3.25 mv/s, 영웅 평균) 밖의 수호신,
//   탈것 버티기·특수기 초당 배율이 아홉 탈것 중앙값의 0.6 배 미만 / 1.6 배 초과, 스테이지 구간별 수호신 몫 요약.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { STAGES, STAGE_ORDER } from '../src/data/stages.js';
import { ENEMIES } from '../src/data/enemies.js';
import { getDiff } from '../src/data/difficulty.js';
import { enemyStats } from '../src/game/enemy.js';
import { computeStats } from '../src/game/stats.js';
import { newHero } from '../src/game/progression.js';
import { makeItem, baseIdFor, tierForLevel } from '../src/data/items.js';
import { CHARACTERS } from '../src/data/characters.js';
import { CLASSES } from '../src/data/classes.js';
import { MOVESETS } from '../src/data/movesets.js';
import { MV_SCALE } from '../src/data/feel_hit.js';
import {
  MOUNTS, GUARDIANS, MOUNT_IDS, GUARDIAN_IDS, BOND_RANKS, GUARD_RULES, guardianShare, trampleRatio, mountHpMul, cdMul,
} from '../src/data/companions.js';
import { ensureCompanionState, unlockCompanion, equipGuardian, guardianDerived, mountDerived } from '../src/game/companion_state.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (k) => argv.includes('--' + k);
const optv = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const JSON_OUT = flag('json'), VERBOSE = flag('verbose');
const posArgs = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--mvps');
const HEROES = posArgs.length ? posArgs : Object.keys(CHARACTERS);
for (const h of HEROES) if (!CHARACTERS[h]) { console.error(`알 수 없는 영웅: ${h} (${Object.keys(CHARACTERS).join(', ')})`); process.exit(2); }
const MVPS_ONE = optv('mvps', null);
const MVPS = MVPS_ONE ? [Number(MVPS_ONE)] : [3.0, 3.5];
const MVPS_MID = MVPS_ONE ? Number(MVPS_ONE) : 3.25;
if (MVPS.some((v) => !(v > 0))) { console.error('--mvps 는 양수'); process.exit(2); }

const CHECKS = [[1, 5], [10, 15], [20, 30], [30, 45], [30, 60], [30, 68]];
const LIMIT = [0.06, 0.30];
const EXPECT = [
  { cLv: 1, hLv: 5, bond: 0, band: [0.08, 0.12], label: 'Lv1' },
  { cLv: 15, hLv: 22, bond: 2, band: [0.13, 0.18], label: 'Lv15' },
  { cLv: 30, hLv: 45, bond: 5, band: [0.20, 0.28], label: 'Lv30 유대5' },
];
const diff = getDiff('normal');
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const r2 = (v) => Math.round(v * 100) / 100;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ───────────────────────── 영웅 · 적 ─────────────────────────
/** 영웅 레벨 → 기준 실행에서 그 레벨이 되는 스테이지 (tools/balance.mjs --json 의 plv; 실패하면 적 레벨로 근사) */
const PROG = {};
function stageForLevel(cid, lv) {
  if (!PROG[cid]) {
    try {
      const out = execFileSync(process.execPath, [path.join(ROOT, 'tools/balance.mjs'), 'normal', cid, '--json'], { encoding: 'utf8', maxBuffer: 1 << 24 });
      PROG[cid] = JSON.parse(out).rows.map((r) => ({ stage: r.stage, plv: r.plv }));
    } catch { PROG[cid] = STAGE_ORDER.map((s) => ({ stage: s, plv: STAGES[s].level })); }
  }
  const rows = PROG[cid];
  const i = rows.findIndex((r) => r.plv >= lv);
  return i < 0 ? rows.length - 1 : i;
}
/** 적 방어 중앙값 (그 스테이지 일반 적) */
const EDEF = {};
function enemyDef(stageIdx) {
  if (EDEF[stageIdx]) return EDEF[stageIdx];
  const st = STAGES[STAGE_ORDER[stageIdx]];
  const ids = [];
  for (const room of Object.values(st.rooms)) for (const row of room.map) for (const c of row) if (c >= '1' && c <= '9') { const sp = room.enemies?.[c]; const id = typeof sp === 'string' ? sp : sp?.id; if (id && ENEMIES[id] && ENEMIES[id].ai !== 'spawner') ids.push(id); }
  const es = ids.map((id) => enemyStats(ENEMIES[id], st.level, diff, false));
  EDEF[stageIdx] = { def: med(es.map((e) => e.def)), res: med(es.map((e) => e.res)), hp: med(es.map((e) => e.maxHp)), stage: st.id };
  return EDEF[stageIdx];
}
/** balance.mjs 와 같은 규칙으로 만든 영웅 + 동료 상태 (수호신 id·레벨·유대) → { state, hero, stats } */
function buildHero(cid, level, stageIdx, cmp) {
  const ch = CHARACTERS[cid];
  const real = Math.random;
  const runs = [];
  for (let k = 0; k < 3; k++) {
    Math.random = mulberry32(7000 + stageIdx * 31 + k);
    try {
      const h = newHero(cid, level);
      let c = CLASSES[h.classId];
      while (c?.next?.length && level >= CLASSES[c.next[0]].reqLevel) { h.classId = c.next[0]; c = CLASSES[h.classId]; }
      const tier = Math.min(7, tierForLevel(level));
      const rar = Math.min(4, 1 + Math.floor(stageIdx / 4)), enh = Math.min(12, Math.floor(stageIdx * 0.8));
      const inv = [];
      const put = (slot, id, o) => { const it = id && makeItem(id, o); if (it) { inv.push(it); h.equip[slot] = it.uid; } };
      put('weapon', baseIdFor('weapon', tier, { wtype: ch.weaponType }), { rarity: rar, level: enh });
      put('body', baseIdFor('body', tier), { rarity: rar, level: Math.floor(enh * 0.7) });
      put('head', baseIdFor('head', tier), { rarity: rar, level: Math.floor(enh * 0.5) });
      put('cloak', baseIdFor('cloak', tier), { rarity: rar });
      const state = { inventory: inv, heroes: { [cid]: h }, charId: cid, progress: { docs: [], chapter: 20, flags: {}, bosses: [], relics: [] }, quests: { done: [] }, gold: 0 };
      ensureCompanionState(state);
      if (cmp?.gid) {
        unlockCompanion(state, cmp.gid, { source: 'debug', silent: true, reveal: false });
        const e = state.companions.owned[cmp.gid];
        e.lv = cmp.lv; e.bond = BOND_RANKS[cmp.bond] ?? 0;
        equipGuardian(state, h, 0, cmp.gid);
      }
      runs.push({ state, h, s: computeStats(state, h) });
    } finally { Math.random = real; }
  }
  const s = { ...runs[0].s };
  for (const k of Object.keys(s)) if (typeof s[k] === 'number') s[k] = runs.reduce((a, r) => a + (r.s[k] ?? 0), 0) / runs.length;
  return { state: runs[0].state, hero: runs[0].h, stats: s };
}
/** 지상 기본 콤보 한 바퀴 시간 (협공 발동 빈도용) */
function comboTime(wtype) {
  const g = MOVESETS[wtype]?.ground ?? [];
  let t = 0, hits = 0, mv = 0;
  g.forEach((m, i) => {
    const n = m.rehit && m.hit ? 1 + Math.floor((m.hit[1] - m.hit[0]) / m.rehit) : 1;
    hits += n; mv += (m.mv ?? 1) * (MV_SCALE[m.id] ?? 1) * n;
    t += i < g.length - 1 ? (m.cancel ?? m.dur ?? 0.3) : (m.dur ?? 0.4);
  });
  return { t: t || 1.5, mvHit: hits ? mv / hits : 1 };
}

// ───────────────────────── 피해 기대값 (combat.js computeDamage) ─────────────────────────
const critK = (s, extra = 0) => 1 + Math.min(100, (s.crit ?? 0) + extra) / 100 * (0.5 + (s.critDmg ?? 0) / 100);
function unit(s, type, el, E) {
  const power = type === 'mag' ? s.mag : s.atk;
  const def = type === 'mag' ? E.res : E.def;
  return power * (el ? 1 + (s[el] ?? 0) / 100 : 1) * (100 / (100 + Math.max(0, def) * 1.2)) * critK(s);
}

// ───────────────────────── 수호신 공격 모형 ─────────────────────────
const MELEE = new Set(['pounce', 'slash', 'dive', 'blink', 'bite', 'bash', 'swing']);
/** 한 번 공격(자동·협공)의 배율 합. n = 범위 안 적 수 */
function kindMv(spec, n) {
  const mv = spec.mv ?? 1, extra = Math.max(0, n - 1);
  switch (spec.kind) {
    case 'proj': return mv + (spec.explode ? spec.explode.mv * (1 + extra * 0.5) : 0) + (spec.pierce > 1 ? mv * extra * 0.4 : 0);
    case 'burst': case 'volley': return (spec.count ?? 1) * mv;
    case 'pounce': return (spec.bites ?? 2) * mv * (1 + extra * 0.3);
    case 'slash': return (spec.hits ?? 2) * mv * (1 + extra * 0.5);
    case 'cone': return Math.ceil((spec.dur ?? 0.5) / (spec.rehit ?? 0.1)) * mv * (1 + extra * 0.7);
    case 'dive': return mv * (1 + extra * 0.2);
    case 'blink': return mv * (1 + extra * 0.5);
    case 'zap': return mv + (n > 1 ? (spec.chain ?? 0) * mv * (spec.chainMul ?? 0.7) : 0);
    case 'ring': case 'flash': return mv * (1 + extra * 0.5);
    default: return mv * (1 + extra * 0.3);   // bite · bash · swing
  }
}
/** 스킬 한 번의 배율 합 (구현을 읽어 셈; 유대 위력 배율 전) */
function skillMv(id, sk, n) {
  switch (id) {
    case 'gd_spiritwolf': return (sk.count ?? 3) * (sk.mv ?? 1.2) * n;                                   // 관통 늑대 셋이 모두를 친다
    case 'gd_imp': return (sk.count ?? 12) * (0.12 * (sk.mv * 0.5 + sk.mv) + 0.16 * sk.mv) * n;          // 520px 에 흩어지는 운석: 직격 12% · 폭발만 16%
    case 'gd_whelp': return (sk.count ?? 6) * (sk.mv ?? 0.5) * ((sk.dur ?? 5) / (2 * Math.PI / 5)) * 0.4 * (n > 1 ? n * 0.7 : 1);   // 궤도 주기 1.26초, 겹침 40%
    case 'gd_owl': return Math.round((sk.dur ?? 0.6) / (sk.rehit ?? 0.1)) * (sk.mv ?? 0.5) * n;            // 700px 광선
    case 'gd_clock': return (sk.mv ?? 0.8) * n;                                                         // 시간이 다시 흐를 때 화면 안 전부 한 번
    case 'gd_reaper': return (sk.mv ?? 2.5) * n;                                                        // 화면 전체
    case 'gd_mirra': return (sk.count ?? 8) * (sk.mv ?? 0.9);                                            // 파편 여덟이 적들에게 나뉜다 (한 적이면 모두)
    case 'gd_lumen': return (sk.mv ?? 1.2) * n;                                                         // 화면 안 전부
    default: return 0;                                                                                  // 아리아 · 가웨인 · 모모: 피해 없음 (회복·방어)
  }
}
/**
 * 수호신 하나의 모형. scen = { n (적 수), boss, mvps } · 반환 { g, p, share, parts }
 */
function guardianModel(cid, gid, cLv, bond, hLv, scen) {
  const sIdx = stageForLevel(cid, hLv);
  const E = enemyDef(sIdx);
  const H = buildHero(cid, hLv, sIdx, { gid, lv: cLv, bond });
  const P = H.stats;
  const d = guardianDerived(H.state, gid, P);
  const def = GUARDIANS[gid];
  const ch = CHARACTERS[cid];
  const pType = ch.weaponType === 'staff' ? 'mag' : 'phys';
  const pEl = P.element ?? null;
  // 플레이어: 지속 mv/s × 베기 대상 수 × 1타 기대 피해 (오라의 공격 속도는 배율로)
  const cleave = scen.n > 1 ? 1.4 : 1;
  const pDps = scen.mvps * cleave * unit({ ...P, atk: P.atk, mag: P.mag }, pType, pEl, E);
  const G = d.stats;
  // 자동 공격
  const A = def.attack;
  const upt = MELEE.has(A.kind) ? 0.6 : A.kind === 'cone' ? 0.8 : 0.9;
  const auto = kindMv(A, scen.n) / d.interval * upt * unit(G, A.type ?? 'phys', A.element, E);
  // 스킬 (+ 공명: 유대 3 이상이면 필살기 45초마다 60%)
  const sk = def.skill;
  const sMv = skillMv(gid, sk, scen.boss ? 1 : scen.n) * d.skillMul;
  const skillType = sk.type ?? (['gd_imp', 'gd_owl', 'gd_mirra', 'gd_lumen'].includes(gid) ? 'mag' : 'phys');
  const skillEl = sk.element ?? A.element ?? null;
  const reso = d.resonance ? (skillMv(gid, sk, scen.boss ? 1 : scen.n) * GUARD_RULES.resonanceMul) / 45 : 0;
  const skill = (sMv / d.skillCd * 0.8 + reso) * unit(G, skillType, skillEl, E);
  // 협공: 플레이어 발동 (마무리 · 치명타) 빈도와 협공 대기 중 느린 쪽
  const ct = comboTime(ch.weaponType);
  const trig = (1 / ct.t + Math.min(0.75, (P.crit ?? 0) / 100) * scen.mvps / ct.mvHit) * 0.6;
  const aRate = Math.min(1 / d.assistCd, trig) * 0.7;
  const AS = def.assist;
  const assist = aRate * kindMv({ kind: AS.kind, mv: AS.mv, count: AS.count, pierce: AS.pierce }, 1) * unit(G, AS.type ?? 'phys', AS.element, E);
  // 고유 능력 (피해가 있는 것만)
  let passive = 0;
  if (gid === 'gd_reaper' && !scen.boss) {
    const kill = (pDps + auto + skill + assist) / Math.max(1, E.hp);
    passive = Math.min(1 / (def.passive.icd ?? 3), kill * 0.5) * 0.06 * E.hp;   // 12% 아래 적을 처형 (평균 남은 HP 6%)
  }
  if (gid === 'gd_mirra') passive = (0.4 / (def.passive.every ?? 5)) * (def.passive.mv ?? 1) * unit(G, 'mag', 'ice', E);
  const gDps = auto + skill + assist + passive;
  return { g: gDps, p: pDps, share: gDps / (pDps + gDps), parts: { auto, skill, assist, passive }, d, stage: E.stage, heroAtk: Math.round(Math.max(P.atk, P.mag)) };
}

// ───────────────────────── 생존 기여 (정보) ─────────────────────────
function guardianSurvival(gid, cLv, bond) {
  const def = GUARDIANS[gid], sk = def.skill, P = def.passive;
  const skillMul = bond >= 4 ? 1.5 : bond >= 1 ? 1.25 : 1;
  const cd = sk.cd * cdMul(cLv) * (bond >= 5 ? 0.8 : 1);
  const auraMul = bond >= 2 ? 1.5 : 1;
  const aura = (k) => ((def.aura.base?.[k] ?? 0) + (def.aura.perLv?.[k] ?? 0) * (cLv - 1)) * auraMul;
  let healPerMin = 0, drAvg = 0, notes = [];
  if (gid === 'gd_fairy') {
    healPerMin += (sk.heal ?? 0.25) * skillMul * 60 / cd * 100;
    healPerMin += ((P.heal ?? 0.04) + (P.healPerLv ?? 0.001) * (cLv - 1)) * 60 / (P.every ?? 8) * 0.5 * 100;
    notes.push(`무적 결계 ${((sk.shield ?? 2) / cd * 100).toFixed(1)}% 시간`);
  }
  if (gid === 'gd_knight') { drAvg += (1 - (sk.dmgMul ?? 0.7)) * (sk.dur ?? 4) / cd; notes.push(`탄 막기 ${P.every ?? 4}초마다`); }
  if (gid === 'gd_momo') { healPerMin += (sk.heal ?? 0.1) * skillMul * 60 / cd * 100; notes.push(`탄 먹기 ${P.every ?? 6}초마다`); }
  if (gid === 'gd_reaper') healPerMin += Math.min(sk.healMax ?? 0.2, (sk.heal ?? 0.02) * 3) * skillMul * 60 / cd * 100;
  if (gid === 'gd_mirra') notes.push(`탄 되비추기 ${P.every ?? 5}초마다`);
  if (gid === 'gd_lumen') notes.push('깊은 물 숨 감소 ×0.5');
  const regen = aura('hpRegen');
  const dr = aura('dmgReduce');
  return { healPerMin: r2(healPerMin), regen: r2(regen), drAvg: r2(drAvg * 100), dmgReduce: r2(dr), lifesteal: r2(aura('lifesteal')), notes };
}

// ───────────────────────── 탈것 모형 ─────────────────────────
/** 특수기 한 번의 단일 대상 배율 (구현 데이터에서) */
function specialMv(sp) {
  switch (sp.kind) {
    case 'stomp': return sp.mv ?? 1.6;
    case 'rocks': return (sp.rocks?.length ?? 3) * 0.5 * (sp.mv ?? 0.9) + (sp.burst?.mv ?? 0.5);   // 세 바위 중 절반이 맞는다
    case 'chains': return 1.5 * (sp.mv ?? 0.8);                                                      // 기둥 셋 중 1.5개
    case 'roar': return sp.mv ?? 0.8;
    case 'breath': return Math.floor((sp.dur ?? 1) / (sp.rehit ?? 0.12)) * (sp.mv ?? 0.35);
    case 'sonar': return sp.mv ?? 0.6;
    case 'hooves': return (sp.stomp?.mv ?? 1) + (sp.pillars?.mv ?? 0.9);
    case 'thunderdive': return (sp.shock?.mv ?? 1.3) + (sp.columns?.mv ?? 0.8) * 0.5;
    case 'purify': return sp.mv ?? 0.9;
    default: return sp.mv ?? 1;
  }
}
function mountModel(id, lv, rank) {
  const def = MOUNTS[id];
  const state = { heroes: {}, progress: { chapter: 20, flags: {}, bosses: [], relics: [] }, quests: { done: [] }, companions: null, gold: 0 };
  ensureCompanionState(state);
  unlockCompanion(state, id, { source: 'debug', silent: true, reveal: false });
  state.companions.owned[id].lv = lv; state.companions.owned[id].bond = BOND_RANKS[rank] ?? 0;
  const md = mountDerived(state, id, { hp: 1000, atk: 100, mag: 100 });
  const hpR = md.maxHp / 1000;
  const buffer = hpR / (def.absorb * def.taken);
  const bossBuffer = buffer / 1.3;
  const riderShare = (1 - def.absorb) * buffer;
  const dr = (md.ride?.dmgReduce ?? 0) / 100;
  const ehp = (riderShare >= 1 ? 1 / (1 - def.absorb) : 1 + def.absorb * buffer) / (1 - dr);
  const tr = md.trampleRatio;
  const charge = (def.charge.mv ?? 1) * tr;
  const spRate = specialMv(def.special) * md.specialMul * tr / md.specialCd;
  const chargeRate = charge / 3;   // 싸움 중 3초에 한 번 들이받는다고 본다
  return { id, name: def.name, lv, rank, hpR: r2(hpR), buffer: r2(buffer), bossBuffer: r2(bossBuffer), riderShare: r2(riderShare), ehp: r2(ehp), charge: r2(charge), spRate: r2(spRate), offense: (spRate + chargeRate) / (MVPS_MID + spRate + chargeRate), recall: md.recall, armor: def.armor };
}

// ───────────────────────── 실행 ─────────────────────────
const out = { checks: [], expect: [], mounts: [], tiers: [], fails: [], warns: [] };

// B1: 점검점 × 유대 0/5 × 장면 × mvps × 영웅
const rows = [];
for (const gid of GUARDIAN_IDS) {
  const row = { gid, name: GUARDIANS[gid].name, cells: [] };
  for (const [cLv, hLv] of CHECKS) {
    let lo = Infinity, hi = -Infinity, loAt = null, hiAt = null;
    for (const cid of HEROES) for (const bond of [0, 5]) for (const mvps of MVPS) for (const scen of [{ n: 2, boss: false }, { n: 1, boss: true }]) {
      const m = guardianModel(cid, gid, cLv, bond, hLv, { ...scen, mvps });
      const tag = `${cid} 유대${bond} ${scen.boss ? '보스' : '필드'} ${mvps}mv/s`;
      if (m.share < lo) { lo = m.share; loAt = tag; }
      if (m.share > hi) { hi = m.share; hiAt = tag; }
    }
    const ok = lo >= LIMIT[0] - 1e-9 && hi <= LIMIT[1] + 1e-9;
    row.cells.push({ cLv, hLv, lo, hi, ok, loAt, hiAt });
    if (!ok) out.fails.push(`B1 ${GUARDIANS[gid].name}(${gid}) (Lv${cLv}, 영웅 Lv${hLv}): ${pct(lo)}–${pct(hi)} — ${lo < LIMIT[0] ? `최저 ${loAt}` : `최고 ${hiAt}`}`);
  }
  rows.push(row);
}
out.checks = rows.map((r) => ({ gid: r.gid, cells: r.cells.map((c) => ({ cLv: c.cLv, hLv: c.hLv, lo: r2(c.lo * 100), hi: r2(c.hi * 100), ok: c.ok })) }));

// 기대 범위 (경고)
const expRows = [];
for (const gid of GUARDIAN_IDS) {
  const cells = EXPECT.map((x) => {
    const v = HEROES.map((cid) => guardianModel(cid, gid, x.cLv, x.bond, x.hLv, { n: 2, boss: false, mvps: MVPS_MID }).share);
    const avg = v.reduce((a, b) => a + b, 0) / v.length;
    const inBand = avg >= x.band[0] - 1e-9 && avg <= x.band[1] + 1e-9;
    if (!inBand) out.warns.push(`기대 범위 밖: ${GUARDIANS[gid].name} ${x.label} ${pct(avg)} (명세 ${pct(x.band[0])}–${pct(x.band[1])})`);
    return { label: x.label, avg, inBand };
  });
  expRows.push({ gid, name: GUARDIANS[gid].name, cells });
}
out.expect = expRows.map((r) => ({ gid: r.gid, cells: r.cells.map((c) => ({ label: c.label, avg: r2(c.avg * 100), inBand: c.inBand })) }));

// 탈것
const MLV = [[1, 0], [10, 2], [20, 3], [30, 5]];
const mrows = [];
for (const [lv, rank] of MLV) {
  const list = MOUNT_IDS.map((id) => mountModel(id, lv, rank));
  const mb = med(list.map((m) => m.buffer)), me = med(list.map((m) => m.ehp)), ms = med(list.map((m) => m.spRate));
  for (const m of list) {
    for (const [k, v, mdn, label] of [['buffer', m.buffer, mb, '버티기 배율'], ['ehp', m.ehp, me, '탑승 중 유효 체력'], ['spRate', m.spRate, ms, '특수기 초당 배율']]) {
      if (v < mdn * 0.6 || v > mdn * 1.6) out.warns.push(`탈것 튀는 값: ${m.name} Lv${lv} ${label} ${v} (아홉 탈것 중앙값 ${r2(mdn)})`);
      void k;
    }
  }
  mrows.push({ lv, rank, list });
}
out.mounts = mrows.map((r) => ({ lv: r.lv, rank: r.rank, list: r.list.map(({ offense, ...m }) => ({ ...m, offense: r2(offense * 100) })) }));
const wh = mountModel('mt_warhorse', 1, 0);
const b2 = Math.abs(wh.buffer - 1.29) <= 0.02 && Math.abs(wh.riderShare - 0.39) <= 0.02;
if (!b2) out.fails.push(`B2 그림메인 Lv1 버티기 ${wh.buffer} · 기수 몫 ${wh.riderShare} (명세 ≈1.29 · ≈0.39)`);

// 스테이지 구간 (정보): 그 스테이지에서 쓸 수 있는 수호신들의 필드 몫 (카엘, 3.25 mv/s)
const TIERS = [['1구간 s01–s04', 0, 3], ['2구간 s05–s08', 4, 7], ['3구간 s09–s13', 8, 12], ['4구간 s14–s17', 13, 16], ['5구간 s18–s20', 17, 19]];
const tierHero = HEROES.includes('kael') ? 'kael' : HEROES[0];
const prog = (() => { stageForLevel(tierHero, 1); return PROG[tierHero]; })();
const tierRows = [];
for (const [label, a, b] of TIERS) {
  const shares = [], ehps = [];
  let cl = 0, hl = 0, bd = 0;
  for (let i = a; i <= b && i < STAGE_ORDER.length; i++) {
    const hLv = prog[i]?.plv ?? STAGES[STAGE_ORDER[i]].level;
    const cLv = Math.max(1, Math.min(30, Math.round(hLv * 0.7)));
    for (const gid of GUARDIAN_IDS) {
      const joinCh = GUARDIANS[gid].chapter ?? 1;
      if (joinCh > i + 1) continue;   // 아직 합류 전
      const stagesSince = Math.max(0, i + 1 - joinCh);
      const bondPts = 19 * stagesSince;   // 스테이지 클리어 6 + 보스 10 + 50킬 3 (공물 제외)
      const bond = BOND_RANKS.reduce((r, t, k) => (bondPts >= t ? k : r), 0);
      shares.push(guardianModel(tierHero, gid, Math.max(cLv, joinCh >= 14 ? 25 : 1), bond, hLv, { n: 2, boss: false, mvps: MVPS_MID }).share);
    }
    for (const id of MOUNT_IDS) if ((MOUNTS[id].chapter ?? 1) <= i + 1) ehps.push(mountModel(id, cLv, Math.min(5, Math.floor(i / 3))).ehp);
    cl += cLv; hl += hLv; bd++;
  }
  tierRows.push({ label, hLv: Math.round(hl / bd), cLv: Math.round(cl / bd), n: shares.length, min: Math.min(...shares), med: med(shares), max: Math.max(...shares), ehp: ehps.length ? med(ehps) : null });
}
out.tiers = tierRows.map((t) => ({ ...t, min: r2(t.min * 100), med: r2(t.med * 100), max: r2(t.max * 100) }));

// 생존 기여 (정보)
const surv = GUARDIAN_IDS.map((gid) => ({ gid, name: GUARDIANS[gid].name, lv1: guardianSurvival(gid, 1, 0), lv30: guardianSurvival(gid, 30, 5) }));
out.survival = surv;

if (JSON_OUT) { console.log(JSON.stringify(out, null, 1)); process.exit(out.fails.length ? 1 : 0); }

// ── 표 ──
console.log(`동료 밸런스 모형 — 영웅 ${HEROES.join(', ')} · 보통 난이도 · 플레이어 ${MVPS.join('/')} mv/s · 장면 필드(적 2)·보스(적 1) · 유대 0/5`);
console.log(`\n■ 수호신 피해 몫 [${pct(LIMIT[0])}, ${pct(LIMIT[1])}] (점검점: 동료 Lv, 영웅 Lv — 칸 = 모든 조합의 최저–최고)`);
const head = ['수호신'.padEnd(10), ...CHECKS.map(([c, h]) => `(${c},${h})`.padEnd(15))].join('');
console.log('  ' + head);
for (const r of rows) console.log('  ' + `${r.name}`.padEnd(9, '　').slice(0, 9).padEnd(10) + r.cells.map((c) => `${c.ok ? ' ' : '✗'}${pct(c.lo)}–${pct(c.hi)}`.padEnd(15)).join(''));
if (VERBOSE) {
  console.log('\n  (세부: 카엘 · 필드 · 3.25 mv/s · 유대 0 — 자동 / 스킬 / 협공 / 고유, 초당 피해)');
  for (const gid of GUARDIAN_IDS) for (const [cLv, hLv] of CHECKS) {
    const m = guardianModel(tierHero, gid, cLv, 0, hLv, { n: 2, boss: false, mvps: MVPS_MID });
    console.log(`   ${GUARDIANS[gid].name.padEnd(5, '　')} (${cLv},${hLv}) ${m.stage} 영웅 공격 ${m.heroAtk} · 몫 ${pct(m.share)} · 자동 ${m.parts.auto.toFixed(1)} 스킬 ${m.parts.skill.toFixed(1)} 협공 ${m.parts.assist.toFixed(1)} 고유 ${m.parts.passive.toFixed(1)} / 플레이어 ${m.p.toFixed(1)} · 간격 ${m.d.interval}s · 스킬 대기 ${m.d.skillCd}s`);
  }
}
console.log(`\n■ 명세 기대 범위 (필드 · ${MVPS_MID} mv/s · 영웅 평균; 벗어나도 경고만)`);
for (const r of expRows) console.log('  ' + `${r.name}`.padEnd(9, '　').slice(0, 9).padEnd(10) + r.cells.map((c) => `${c.inBand ? ' ' : '!'}${c.label} ${pct(c.avg)}`.padEnd(20)).join(''));
console.log('\n■ 탈것 (버티기 = 탈것이 쓰러질 때까지 받는 피해 ÷ 기수 최대 HP · 보스 ×1.3 · 기수 몫 = 그동안 기수가 받는 양 · 유효 체력 = 탑승부터 쓰러질 때까지 버티는 양 (탑승 효과 피해 감소 포함) · 특수기 = 단일 대상 배율/초)');
for (const r of mrows) {
  console.log(`  Lv ${r.lv} · 유대 ${r.rank}`);
  for (const m of r.list) console.log(`    ${m.name.padEnd(5, '　')} HP ${m.hpR.toFixed(2)}× · 버티기 ${m.buffer.toFixed(2)} (보스 ${m.bossBuffer.toFixed(2)}) · 기수 몫 ${m.riderShare.toFixed(2)} · 유효 체력 ${m.ehp.toFixed(2)}× · 돌진 ${m.charge.toFixed(2)} · 특수기 ${m.spRate.toFixed(3)}/s · 공격 기여 ${pct(m.offense)} · 재소환 ${m.recall}s`);
}
console.log(`  그림메인 Lv1 확인: 버티기 ${wh.buffer} (명세 ≈1.29) · 기수 몫 ${wh.riderShare} (명세 ≈0.39) ${b2 ? '✓' : '✗'}`);
console.log(`\n■ 스테이지 구간 (${tierHero}, 필드, ${MVPS_MID} mv/s; 동료 Lv = 영웅 Lv×0.7, 유대 = 합류 뒤 스테이지마다 19점, 2부 수호신은 Lv 25 합류)`);
for (const t of tierRows) console.log(`  ${t.label} · 영웅 Lv ${t.hLv} · 동료 Lv ${t.cLv} · 수호신 몫 ${pct(t.min)} / ${pct(t.med)} / ${pct(t.max)} (최저/중앙/최고, ${t.n}개) · 탈것 유효 체력 중앙 ${t.ehp ?? '-'}×`);
console.log('\n■ 생존 기여 (Lv1 유대0 → Lv30 유대5; HP%/분 = 스킬·고유 회복, 재생 = 오라 초당 HP)');
for (const s of surv) {
  const f = (x) => [x.healPerMin ? `회복 ${x.healPerMin}%/분` : '', x.regen ? `재생 ${x.regen}/s` : '', x.drAvg ? `평균 피해 감소 ${x.drAvg}%` : '', x.dmgReduce ? `오라 피해 감소 ${x.dmgReduce}%` : '', x.lifesteal ? `흡혈 ${x.lifesteal}%` : ''].filter(Boolean).join(' · ') || '-';
  console.log(`  ${s.name.padEnd(5, '　')} ${f(s.lv1)}  →  ${f(s.lv30)}${s.lv30.notes.length ? ` (${s.lv30.notes.join(', ')})` : ''}`);
}
if (out.warns.length) { console.log(`\n경고 ${out.warns.length}건 (명세 기대 범위·튀는 값, 실패 아님):`); for (const w of out.warns) console.log('  ! ' + w); }
if (out.fails.length) { console.log(`\n실패 ${out.fails.length}건:`); for (const f of out.fails) console.log('  ✗ ' + f); }
else console.log('\n✓ B1 모든 수호신 몫이 [6%, 30%] 안 · ✓ B2 탈것 공식 확인');
process.exit(out.fails.length ? 1 : 0);
