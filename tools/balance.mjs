// 밸런스 시뮬레이터: 스테이지별 예상 레벨/장비로 일반 적·보스 처치 타수와 받는 피해 비율을 표로 출력
// 사용: node tools/balance.mjs [difficulty=normal] [charId=kael] [--check] [--strict] [--json] [--acc] [--docs] [--quests] [--seed N] [--k …]
//   --check : 2부 행(s14–s20)을 world2 §15 목표와 비교해 벗어난 칸을 나열하고, 하나라도 벗어나면 종료 코드 1.
//             카엘은 표의 범위 그대로. 다른 영웅은 "1부 기준 보정" 범위: 카엘 범위 × (그 영웅 ÷ 카엘, s11–s13 평균 비율) ±30%.
//             1부에서 이미 정해진 영웅 개성(예: 브란 가디언 피해 감소 25%, 빅터·리아 무방비)은 2부 데이터로 바꿀 수 없으므로
//             2부 데이터가 모든 영웅에게 같은 난이도 곡선을 주는지를 본다. 레벨(진입 시)은 영웅과 무관 → 표 범위 그대로.
//   --strict: 다른 영웅도 카엘 범위를 ±30% 넓힌 범위로 판정 (world2 §15 문구 그대로 — 1부 직업 설계상 브란/빅터/리아/세라는 통과 불가)
//   --json  : 표 대신 JSON 한 덩어리 (다른 도구가 읽기용)
//   --acc   : 장신구 2칸(반지·목걸이, 같은 단계·희귀도)도 장착한 기준 (기준 실행은 무기·몸통·머리·망토 4칸)
//   --docs  : 지난 스테이지의 비전서 능력치(d01 질풍보 등)를 반영
//   --quests: 메인 퀘스트 보상 경험치(스테이지 클리어 시 자동 수령)도 더함 (기준 실행에는 없음)
//   --seed N: 옵션(affix) 추첨 시드 (기본 1). 같은 데이터 → 같은 표.
//   --k 'bexp=0.4,eatk=0.9,bexp.b_chaos=0.5' : 데이터 조정 가정(what-if) 배율. 이름만 쓰면 2부 스테이지(s14–s20)의
//             모든 적/보스에, 이름.id 를 쓰면 그 적/보스 하나에(1부 포함) 적용. 이름: eexp ehp eatk (일반 적 경험치·체력·공격),
//             bexp bhp batk (보스 경험치·체력·공격). 데이터 파일은 바꾸지 않는다 — FIX-DATA 요청 값을 고르는 용도.
//   --ng N  : 회차 「피의 윤회」 N(1–9, 세기는 3 에서 멈춤)의 표 (docs/specs/ngplus.md §3.4). 영웅 모형 = 1회차 끝 상태:
//             N = 1 은 Lv 70 시작 · 강화 +12, N ≥ 2 는 Lv 99 · +15 (7장마다 +1, ≤ 15), 7단계 희귀도 4 · 장신구 둘 · 비전서 전부
//             (--acc/--docs 와 상관없이; 시드는 설계 시뮬레이션과 같은 레벨 기준). 적·보스 값은 게임과 같은 NG.ngWorld()
//             (src/game/ngplus.js — 공식을 여기에 복사하지 않는다), elv = 회차 적 레벨, enh = 그 행의 무기 강화.
//             --check 와 함께면 모든 난이도에서 (world2 §15 목표 대신): 회차 행(s01–s20, 외전 제외)의 최댓값 ÷ 같은 영웅·난이도
//             1회차 기준 실행의 2부(s14–s20) 최댓값 — 받는 피해(bossTaken·takenMed) ≤ 1.15 / 1.45 / 1.65 (N = 1 / 2 / 3 이상),
//             보스 타수(bossHits) ≤ 1.15, 표의 숫자가 모두 유한. 하나라도 벗어나면 종료 코드 1.
//
// 기준 실행 (world2 §15): 보통 난이도, 1레벨에서 시작해 스테이지마다 일반 적 85% + 보스 처치 경험치를 쌓는다.
// 장비 = tierForLevel(레벨) 단계(최대 7) 상위형 베이스, 희귀도 min(4, 1+floor(i/4)), 강화 min(12, floor(i*0.8))
// (몸통 ×0.7, 머리 ×0.5, 망토 0). 직업은 10/25 레벨에서 첫 번째 갈래. 옵션 추첨은 시드 5개 평균.
//
// 열: hitsMed/hitsMax/bossHits = 기본기 1타(모션 배율 1.0) 기준 타수 — §15 목표의 단위.
//     bossSec = 지상 기본 콤보(모션 배율 × feel_hit.js MV_SCALE, 다단히트 포함)를 쉬지 않고 넣을 때 보스 처치 시간(초, 참고용;
//     공격 속도 스탯·스킬·필살기 제외). 머리글의 mvHit = 그 콤보의 1타 평균 배율 (채찍 MV_SCALE 상향이 여기에 보인다).
//     takenMed / bossTaken = 적 1타(보스는 모션 1.2) 피해가 최대 HP 에서 차지하는 %.
import { STAGES, STAGE_ORDER } from '../src/data/stages.js';
import { ENEMIES } from '../src/data/enemies.js';
import { BOSSES } from '../src/data/bosses.js';
import { QUESTS } from '../src/data/quests.js';
import { getDiff, DIFF } from '../src/data/difficulty.js';
import { enemyStats } from '../src/game/enemy.js';
import { computeStats, expToNext } from '../src/game/stats.js';
import { newHero } from '../src/game/progression.js';
import { makeItem, baseIdFor, tierForLevel } from '../src/data/items.js';
import { CHARACTERS } from '../src/data/characters.js';
import { CLASSES } from '../src/data/classes.js';
import { MOVESETS } from '../src/data/movesets.js';
import { MV_SCALE } from '../src/data/feel_hit.js';
import { DOCS as ALL_DOCS } from '../src/data/lore.js';
import * as NG from '../src/game/ngplus.js';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const optv = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--seed', '--k', '--ng'].includes(argv[i - 1])));
const diffId = pos[0] || 'normal', charId = pos[1] || 'kael';
const CHECK = flag('check'), STRICT = flag('strict'), JSON_OUT = flag('json'), ACC = flag('acc'), DOCS = flag('docs'), QUESTS_ON = flag('quests');
const SEED = Number(optv('seed', 1)) || 1;
const SEEDS = 5;
const NG_N = flag('ng') ? Number(optv('ng', NaN)) : 0;   // 회차 (docs/specs/ngplus.md §3.4)
if (flag('ng') && !(Number.isInteger(NG_N) && NG_N >= 1 && NG_N <= 9)) { console.error(`--ng 는 1–9 정수 (${optv('ng', '')})`); process.exit(2); }
// getDiff 는 모르는 id 를 보통으로 바꾼다 — 오타(예: hardd)가 보통 난이도 표를 'hardd' 라는 이름으로 내지 않게 막는다
if (!DIFF[diffId]) { console.error(`알 수 없는 난이도: ${diffId} (${Object.keys(DIFF).join(', ')})`); process.exit(2); }
const diff = getDiff(diffId);
if (!CHARACTERS[charId]) { console.error(`알 수 없는 영웅: ${charId} (${Object.keys(CHARACTERS).join(', ')})`); process.exit(2); }
// world2 §15 목표는 보통 난이도 기준 실행에만 있다 (MASTER_PLAN §5.1: hard/inferno 는 --check 없이 표만 검토)
if (CHECK && !NG_N && diffId !== 'normal') { console.error(`--check 는 normal 난이도에서만 쓴다 (world2 §15 목표 = 보통 난이도 기준). ${diffId} 는 --check 없이 표로 검토하세요.`); process.exit(2); }
const KNOBS = {};
for (const part of String(optv('k', '')).split(',').map((s) => s.trim()).filter(Boolean)) {
  const [name, v] = part.split('=');
  if (!/^(eexp|ehp|eatk|bexp|bhp|batk)(\.[a-z0-9_]+)?$/.test(name) || !Number.isFinite(Number(v))) { console.error(`--k 형식 오류: ${part}`); process.exit(2); }
  // 이름.id 의 id 오타는 아무 데도 적용되지 않은 채 조용히 넘어가므로 막는다 (e* = 일반 적, b* = 보스)
  const [kind, id] = name.split('.');
  if (id && !(kind[0] === 'b' ? BOSSES[id] : ENEMIES[id])) { console.error(`--k 의 ${kind[0] === 'b' ? '보스' : '적'} id 가 없음: ${part}`); process.exit(2); }
  KNOBS[name] = Number(v);
}
const P2_IDS = new Set(['s14', 's15', 's16', 's17', 's18', 's19', 's20']);
/** what-if 배율: 이름.id 가 먼저, 그다음 2부 스테이지 전체 배율 */
const knob = (name, id, sid) => KNOBS[`${name}.${id}`] ?? (P2_IDS.has(sid) ? KNOBS[name] ?? 1 : 1);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
const MAIN_EXP = {};   // 스테이지 → 메인 퀘스트 보상 경험치
for (const q of Object.values(QUESTS)) if (q.kind === 'main' && q.goal?.type === 'clear') MAIN_EXP[q.goal.stage] = (MAIN_EXP[q.goal.stage] ?? 0) + (q.reward?.exp ?? 0);

// ── 결정적 난수 (옵션 추첨용) — makeItem → rollAffixes 가 Math.random 을 쓴다
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const realRandom = Math.random;

// ── 지상 기본 콤보 모델 (요청 68: MV_SCALE 반영)
function comboModel(wtype) {
  const g = MOVESETS[wtype]?.ground ?? [];
  let sum = 0, n = 0, time = 0;
  g.forEach((m, i) => {
    const hits = m.rehit && m.hit ? 1 + Math.floor((m.hit[1] - m.hit[0]) / m.rehit) : 1;
    sum += (m.mv ?? 1) * (MV_SCALE[m.id] ?? 1) * hits; n += hits;
    time += i < g.length - 1 ? (m.cancel ?? m.dur ?? 0.3) : (m.dur ?? 0.4);
  });
  return n ? { mvHit: sum / n, perSec: sum / Math.max(0.1, time) } : { mvHit: 1, perSec: 3 };
}

function countEnemies(stage) {
  const ids = [];
  for (const room of Object.values(stage.rooms)) {
    for (const row of room.map) for (const c of row) if (c >= '1' && c <= '9') { const sp = room.enemies?.[c]; const id = typeof sp === 'string' ? sp : sp?.id; if (id && ENEMIES[id] && ENEMIES[id].ai !== 'spawner') ids.push(id); }
  }
  return ids;
}
function dmg(src, tgt, mv = 1, mag = false) {
  const power = mag ? src.mag : src.atk;
  let d = power * mv;
  const def = mag ? (tgt.res ?? 0) : (tgt.def ?? 0);
  d *= 100 / (100 + Math.max(0, def) * 1.2);
  if (tgt.dmgReduce) d *= 1 - Math.min(75, tgt.dmgReduce) / 100;
  const crit = Math.min(75, src.crit ?? 0) / 100;
  d *= 1 + crit * (0.5 + (src.critDmg ?? 0) / 100);
  return Math.max(1, d);
}

/** 한 영웅의 1~20 스테이지 기준 실행 (ng ≥ 1: 회차 — 1회차 끝 영웅 모형 + NG.ngWorld 세기, docs/specs/ngplus.md §3.4) */
function simulate(cid, ng = 0) {
  const ch = CHARACTERS[cid];
  const combo = comboModel(ch.weaponType);
  const mag = ch.weaponType === 'staff';
  const NG_HERO = ng ? { start: ng === 1 ? 70 : 99, enh: ng === 1 ? 12 : 15 } : null;   // §3.4 영웅 모형
  function heroOnce(level, stageIdx, docs, seed) {
    Math.random = mulberry32(seed);
    try {
      const h = newHero(cid, level);
      // 직업: 10/25 레벨에서 첫 번째 갈래
      let c = CLASSES[h.classId];
      while (c?.next?.length && level >= CLASSES[c.next[0]].reqLevel) { h.classId = c.next[0]; c = CLASSES[h.classId]; }
      const tier = NG_HERO ? 7 : Math.min(7, tierForLevel(level));   // 요청 20: 2부 7단계 장비
      const rar = NG_HERO ? 4 : Math.min(4, 1 + Math.floor(stageIdx / 4));
      const enh = NG_HERO ? Math.min(15, NG_HERO.enh + Math.floor(stageIdx / 7)) : Math.min(12, Math.floor(stageIdx * 0.8));   // world2 §15 (1부 행은 최대 9 라서 예전과 같다)
      const inv = [];
      const put = (slot, id, opts) => { const it = id && makeItem(id, opts); if (it) { inv.push(it); h.equip[slot] = it.uid; } };
      put('weapon', baseIdFor('weapon', tier, { wtype: ch.weaponType }), { rarity: rar, level: enh });
      put('body', baseIdFor('body', tier), { rarity: rar, level: Math.floor(enh * 0.7) });
      put('head', baseIdFor('head', tier), { rarity: rar, level: Math.floor(enh * 0.5) });
      put('cloak', baseIdFor('cloak', tier), { rarity: rar });
      if (ACC || NG_HERO) { put('acc1', baseIdFor('acc', tier, { variant: 0 }), { rarity: rar }); put('acc2', baseIdFor('acc', tier, { variant: 1 }), { rarity: rar }); }
      // arcade: true → 수호신 오라 제외 (기준 실행에는 동료가 없다)
      const state = { inventory: inv, heroes: { [cid]: h }, progress: { docs: NG_HERO ? Object.keys(ALL_DOCS) : DOCS ? docs : [] }, arcade: true };
      return { h, s: computeStats(state, h), tier, enh };
    } finally { Math.random = realRandom; }
  }
  /** 옵션 추첨 편차를 줄이려고 시드 여러 개의 능력치 평균 (회차는 설계 시뮬레이션처럼 레벨 기준 시드) */
  function heroAt(level, stageIdx, docs) {
    const runs = Array.from({ length: SEEDS }, (_, k) => heroOnce(level, stageIdx, docs, SEED * 1000 + (NG_HERO ? level : stageIdx) * 31 + k));
    const s = { ...runs[0].s };
    for (const k of Object.keys(s)) if (typeof s[k] === 'number') s[k] = runs.reduce((a, r) => a + (r.s[k] ?? 0), 0) / runs.length;
    return { h: runs[0].h, s, tier: runs[0].tier, enh: runs[0].enh };
  }
  let level = NG_HERO ? NG_HERO.start : 1, exp = 0, mainLevel = level;   // mainLevel = 이야기(외전 제외) 마지막 장(s20)을 마친 레벨 — END_LV 는 이것과 비교
  const docsSoFar = [];
  const rows = [];
  STAGE_ORDER.forEach((sid, i) => {
    // 회차: 게임과 같은 계산 (적 레벨 · 배율 · 1부 초반 보정 · 상한) — 스테이지·난이도의 복사본
    const W = ng ? NG.ngWorld(STAGES[sid], diff, ng) : null;
    if (ng && !W) { console.error(`NG.ngWorld(${sid}, ${diffId}, ${ng}) 가 null — src/game/ngplus.js 가 아직 뼈대인가?`); process.exit(2); }
    const st = W ? W.stage : STAGES[sid], D = W ? W.diff : diff;
    const { s: P, h: H, tier, enh } = heroAt(level, i, docsSoFar);
    const ids = countEnemies(st);
    const es = ids.map((id) => {
      const s = enemyStats(ENEMIES[id], st.level, D, false);
      s.maxHp = Math.round(s.maxHp * knob('ehp', id, sid)); s.atk = Math.round(s.atk * knob('eatk', id, sid)); s.exp = Math.round(s.exp * knob('eexp', id, sid));
      return { id, s };
    });
    const hits = es.map((e) => Math.ceil(e.s.maxHp / dmg(P, e.s, 1.0, mag)));
    const taken = es.map((e) => dmg(e.s, { def: P.def, dmgReduce: P.dmgReduce, crit: 0 }, 1.0) / P.hp * 100);
    const b = BOSSES[st.boss];
    let bh = 0, bt = 0, bhp = 0, bsec = 0;
    if (b) {
      const bid = b.id ?? st.boss;
      const bs = enemyStats({ ...b, lv: st.level }, st.level, { ...D, enemyHp: D.bossHp ?? D.enemyHp }, false);
      bs.atk = Math.round(bs.atk * knob('batk', bid, sid));
      bhp = Math.round(bs.maxHp * (b.hpMul ?? 1) * knob('bhp', bid, sid) * (1 + Math.max(0, 10 - (st.level - 1)) * 0.1) / (1 + Math.max(0, st.level - 24) * 0.035));
      const d1 = dmg(P, bs, 1.0, mag);
      bh = Math.ceil(bhp / d1);
      bsec = bhp / (d1 * combo.perSec);
      bt = dmg(bs, { def: P.def, dmgReduce: P.dmgReduce }, 1.2) / P.hp * 100;
    }
    rows.push({ stage: sid, elv: st.level, plv: level, cls: H.classId.replace(/^[a-z]+_/, ''), tier, ...(ng ? { enh } : {}), atk: Math.round(mag ? P.mag : P.atk), hp: Math.round(P.hp), def: Math.round(P.def), n: ids.length, eHP: med(es.map((e) => e.s.maxHp)), hitsMed: med(hits), hitsMax: Math.max(...hits, 0), takenMed: +med(taken).toFixed(1), bossHP: bhp, bossHits: bh, bossSec: Math.round(bsec), bossTaken: +bt.toFixed(1) });
    // 경험치 획득 (85% 처치 + 보스 [+ 메인 퀘스트])
    let gain = es.reduce((a, e) => a + e.s.exp, 0) * 0.85;
    if (b) gain += Math.round((b.exp ?? 400) * knob('bexp', b.id ?? st.boss, sid) * (1 + st.level * 0.35) * (D.exp ?? 1));
    if (QUESTS_ON) gain += MAIN_EXP[sid] ?? 0;
    exp += gain;
    while (level < 99 && exp >= expToNext(level)) { exp -= expToNext(level); level++; }
    for (const d of st.docs || []) if (!docsSoFar.includes(d)) docsSoFar.push(d);
    if (!st.side) mainLevel = level;   // 외전(s21 · s22, docs/specs/ex_s21.md · ex_s22.md)은 2부 엔딩 뒤 — 행만 보여 주고 끝 레벨 판정에는 넣지 않는다
  });
  return { rows, endLevel: mainLevel, sideEndLevel: level, combo };
}

// ── world2 §15 목표 (카엘 기준)
const T = {
  s14: { plv: [39, 43], hitsMed: [5, 9], hitsMax: [0, 20], takenMed: [6, 12], bossHits: [110, 170], bossTaken: [12, 22] },
  s15: { plv: [43, 47], hitsMed: [5, 9], hitsMax: [0, 20], takenMed: [6, 12], bossHits: [110, 170], bossTaken: [12, 22] },
  s16: { plv: [46, 50], hitsMed: [5, 9], hitsMax: [0, 20], takenMed: [6, 12], bossHits: [110, 170], bossTaken: [12, 22] },
  s17: { plv: [49, 53], hitsMed: [5, 9], hitsMax: [0, 20], takenMed: [6, 12], bossHits: [115, 175], bossTaken: [12, 22] },
  s18: { plv: [52, 57], hitsMed: [5, 9], hitsMax: [0, 20], takenMed: [6, 13], bossHits: [120, 180], bossTaken: [13, 23] },
  s19: { plv: [56, 61], hitsMed: [5, 10], hitsMax: [0, 22], takenMed: [6, 13], bossHits: [130, 190], bossTaken: [13, 23] },
  s20: { plv: [60, 65], hitsMed: [5, 10], hitsMax: [0, 22], takenMed: [7, 14], bossHits: [180, 260], bossTaken: [14, 24] },
};
const END_LV = [64, 68];   // s20 을 마친 뒤 레벨
const ANCHOR = ['s11', 's12', 's13'];   // 1부 기준 보정 비율을 잴 스테이지
const round1 = (v) => Math.round(v * 10) / 10;

// ── 회차 (--ng N): 1회차 2부 최댓값 대비 비율 (docs/specs/ngplus.md §3.4) — world2 §15 목표 대신
if (NG_N) {
  const ngRun = simulate(charId, NG_N);
  const base = simulate(charId, 0);
  const P2 = base.rows.filter((r) => P2_IDS.has(r.stage));
  const NGR = ngRun.rows.filter((r) => !STAGES[r.stage]?.side);   // s01–s20 (외전은 2부 엔딩 뒤 — 행만 보여 준다)
  const mx = (rows, k) => Math.max(...rows.map((r) => r[k]));
  const LIMIT = { taken: [1.15, 1.45, 1.65][Math.min(NG_N, 3) - 1], hits: 1.15 };
  const KEYS = ['bossTaken', 'takenMed', 'bossHits'];
  const base1 = Object.fromEntries(KEYS.map((k) => [k, mx(P2, k)])), max = Object.fromEntries(KEYS.map((k) => [k, mx(NGR, k)]));
  const ratios = Object.fromEntries(KEYS.map((k) => [k, base1[k] > 0 ? +(max[k] / base1[k]).toFixed(3) : NaN]));
  const at = (k) => NGR.find((r) => r[k] === max[k])?.stage ?? '?';
  const fails = KEYS.filter((k) => !(ratios[k] <= (k === 'bossHits' ? LIMIT.hits : LIMIT.taken))).map((k) => ({ key: k, ratio: ratios[k], limit: k === 'bossHits' ? LIMIT.hits : LIMIT.taken, at: at(k) }));
  const bad = ngRun.rows.flatMap((r) => Object.entries(r).filter(([, v]) => typeof v === 'number' && !Number.isFinite(v)).map(([k]) => `${r.stage}.${k}`));
  if (bad.length) fails.push({ key: 'finite', ratio: NaN, limit: null, at: bad.join(' ') });
  const label = `${NG_N + 1}회차 (--ng ${NG_N}${NG_N > NG.NG_RULES.cap ? `, 세기 = ${NG.NG_RULES.cap + 1}회차` : ''})`;
  const hero = { start: NG_N === 1 ? 70 : 99, enh: NG_N === 1 ? 12 : 15, rarity: 4, tier: 7, acc: true, docs: Object.keys(ALL_DOCS).length };
  if (JSON_OUT) {
    console.log(JSON.stringify({ diff: diffId, char: charId, ng: NG_N, knobs: KNOBS, hero, combo: { mvHit: +ngRun.combo.mvHit.toFixed(3), perSec: +ngRun.combo.perSec.toFixed(2) }, endLevel: ngRun.sideEndLevel, base1, max, ratios, limits: LIMIT, rows: ngRun.rows, fails }, null, 1));
  } else {
    console.log(`${diffId} · ${charId} (${CHARACTERS[charId].weaponType}) · ${label} — 영웅 모형 Lv ${hero.start} 시작 · ${hero.tier}단계 희귀도 ${hero.rarity} · 강화 +${hero.enh}(7장마다 +1, ≤ 15) · 장신구 둘 · 비전서 ${hero.docs} · 적·보스 = NG.ngWorld`);
    console.table(ngRun.rows);
    console.log(`끝 레벨 ${ngRun.sideEndLevel} · 회차 행(s01–s20) 최댓값 ÷ 1회차 2부(s14–s20) 최댓값: 받는 피해 bossTaken ×${ratios.bossTaken} (${at('bossTaken')}) · takenMed ×${ratios.takenMed} (${at('takenMed')}) ≤ ${LIMIT.taken} · 보스 타수 ×${ratios.bossHits} (${at('bossHits')}) ≤ ${LIMIT.hits}`);
    if (CHECK) {
      if (!fails.length) console.log(`✓ 회차 세기 상한 안 (ngplus.md §3.4, ${label})`);
      else {
        console.log(`✗ 회차 세기 상한 밖 ${fails.length}칸 (${label}):`);
        for (const f of fails) console.log(`   ${f.key} ×${f.ratio}  (상한 ${f.limit ?? '유한'}, ${f.at})`);
      }
    }
  }
  if (CHECK && fails.length) process.exitCode = 1;
}

const run = NG_N ? null : simulate(charId);
let ratio = null;   // 영웅 ÷ 카엘 (1부 s11–s13 평균)
if (run && charId !== 'kael' && !STRICT) {
  const k = simulate('kael');
  ratio = {};
  for (const key of ['hitsMed', 'hitsMax', 'takenMed', 'bossHits', 'bossTaken']) {
    const rs = ANCHOR.map((s) => { const a = run.rows.find((r) => r.stage === s)?.[key], b = k.rows.find((r) => r.stage === s)?.[key]; return a > 0 && b > 0 ? a / b : null; }).filter((x) => x != null);
    ratio[key] = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 1;
  }
}
function band(key, [lo, hi]) {
  if (charId === 'kael' || key === 'plv') return [lo, hi];
  if (STRICT) return [lo === 0 ? 0 : round1(lo * 0.7), round1(hi * 1.3)];
  const r = ratio[key] ?? 1;   // 1부 기준 보정 후 §15 의 ±30% 허용폭
  return [lo === 0 ? 0 : round1(lo * r * 0.7), round1(hi * r * 1.3)];
}
const fails = [];
for (const r of run?.rows ?? []) {
  const t = T[r.stage];
  if (!t) continue;
  for (const [k, b] of Object.entries(t)) {
    const [lo, hi] = band(k, b);
    const v = r[k];
    if (v < lo || v > hi) fails.push({ stage: r.stage, key: k, value: v, lo, hi, dir: v < lo ? 'low' : 'high' });
  }
}
if (run && !(run.endLevel >= END_LV[0] && run.endLevel <= END_LV[1])) fails.push({ stage: 'end', key: 'plv', value: run.endLevel, lo: END_LV[0], hi: END_LV[1], dir: run.endLevel < END_LV[0] ? 'low' : 'high' });
const mode = charId === 'kael' ? 'kael' : STRICT ? 'strict ±30%' : '1부 기준 보정';

if (!run) { /* --ng: 위에서 출력했다 */ } else if (JSON_OUT) {
  console.log(JSON.stringify({ diff: diffId, char: charId, acc: ACC, docs: DOCS, quests: QUESTS_ON, knobs: KNOBS, mode, ratio, combo: { mvHit: +run.combo.mvHit.toFixed(3), perSec: +run.combo.perSec.toFixed(2) }, endLevel: run.endLevel, rows: run.rows, fails }, null, 1));
} else {
  const ch = CHARACTERS[charId];
  const extra = [ACC && '장신구 포함', DOCS && '비전서 포함', QUESTS_ON && '메인 퀘스트 경험치 포함', Object.keys(KNOBS).length && `가정 ${Object.keys(KNOBS).length}개`].filter(Boolean).join(' · ');
  console.log(`${diffId} · ${charId} (${ch.weaponType}) — 기본 콤보 1타 평균 배율 mvHit ${run.combo.mvHit.toFixed(2)}, 초당 배율 ${run.combo.perSec.toFixed(2)}${extra ? ' · ' + extra : ''}`);
  console.table(run.rows);
  console.log(`s20 클리어 후 레벨 ${run.endLevel}${run.sideEndLevel !== run.endLevel ? ` (외전 ${STAGE_ORDER.filter((id) => STAGES[id]?.side).join(" · ")} 까지 ${run.sideEndLevel})` : ''}`);
  if (CHECK) {
    if (ratio) console.log(`1부 기준 보정 비율 (${charId} ÷ kael, ${ANCHOR.join('/')} 평균): ` + Object.entries(ratio).map(([k, v]) => `${k} ×${v.toFixed(2)}`).join(', '));
    if (!fails.length) console.log(`✓ world2 §15 목표 안 (2부 s14–s20, ${mode})`);
    else {
      console.log(`✗ world2 §15 목표 밖 ${fails.length}칸 (${mode}):`);
      for (const f of fails) console.log(`   ${f.stage} ${f.key} = ${f.value}  (목표 ${f.lo}–${f.hi}, ${f.dir === 'low' ? '낮음' : '높음'})`);
    }
  }
}
if (run && CHECK && fails.length) process.exitCode = 1;
