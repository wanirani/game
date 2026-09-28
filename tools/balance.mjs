// 밸런스 시뮬레이터: 스테이지별 예상 레벨/장비로 일반 적·보스 처치 타수와 받는 피해 비율을 표로 출력
// 사용: node tools/balance.mjs [difficulty=normal] [charId=kael] [--check] [--json] [--acc] [--docs] [--seed N]
//   --check : 2부 행(s14–s20)을 world2 §15 목표와 비교해 벗어난 칸을 나열하고, 하나라도 벗어나면 종료 코드 1
//             (카엘은 표의 범위 그대로, 다른 영웅은 범위를 ±30% 넓혀서 — "every other character within ±30%").
//             플레이어 레벨(진입 시)은 영웅과 무관하므로 모든 영웅에 표의 범위를 그대로 쓴다.
//   --json  : 표 대신 JSON 한 덩어리 (다른 도구가 읽기용)
//   --acc   : 장신구 2칸(반지·목걸이, 같은 단계·희귀도)도 장착한 기준으로 계산 (기준 실행은 무기·몸통·머리·망토 4칸)
//   --docs  : 지난 스테이지의 비전서 능력치(d01 질풍보 등)를 반영
//   --seed N: 옵션(affix) 추첨 시드 (기본 1). 같은 데이터 → 같은 표.
//
// 기준 실행 (world2 §15): 보통 난이도, 1레벨에서 시작해 스테이지마다 일반 적 85% + 보스 처치 경험치를 쌓는다.
// 장비 = tierForLevel(레벨) 단계(최대 7) 상위형 베이스, 희귀도 min(4, 1+floor(i/4)), 강화 min(12, floor(i*0.8))
// (몸통 ×0.7, 머리 ×0.5, 망토 0). 직업은 10/25 레벨에서 첫 번째 갈래. 옵션 추첨은 시드 5개 평균.
//
// 열: hitsMed/hitsMax/bossHits = 기본기 1타(모션 배율 1.0) 기준 타수 — §15 목표의 단위.
//     mvHit = 지상 기본 콤보의 실제 1타 평균 배율 (모션 배율 × feel_hit.js MV_SCALE, 다단히트 포함 가중 평균),
//     bossSec = 그 콤보를 쉬지 않고 넣을 때 보스 처치 시간(초, 참고용; 공격 속도 스탯·스킬·필살기 제외).
//     takenMed / bossTaken = 적 1타(보스는 모션 1.2) 피해가 최대 HP 에서 차지하는 %.
import { STAGES, STAGE_ORDER } from '../src/data/stages.js';
import { ENEMIES } from '../src/data/enemies.js';
import { BOSSES } from '../src/data/bosses.js';
import { getDiff } from '../src/data/difficulty.js';
import { enemyStats } from '../src/game/enemy.js';
import { computeStats, expToNext } from '../src/game/stats.js';
import { newHero } from '../src/game/progression.js';
import { makeItem, baseIdFor, tierForLevel } from '../src/data/items.js';
import { CHARACTERS } from '../src/data/characters.js';
import { CLASSES } from '../src/data/classes.js';
import { MOVESETS } from '../src/data/movesets.js';
import { MV_SCALE } from '../src/data/feel_hit.js';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const optv = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--seed'));
const diffId = pos[0] || 'normal', charId = pos[1] || 'kael';
const CHECK = flag('check'), JSON_OUT = flag('json'), ACC = flag('acc'), DOCS = flag('docs');
const SEED = Number(optv('seed', 1)) || 1;
const SEEDS = 5;
const diff = getDiff(diffId);
const ch = CHARACTERS[charId];
if (!ch) { console.error(`알 수 없는 영웅: ${charId} (${Object.keys(CHARACTERS).join(', ')})`); process.exit(2); }
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };

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
const COMBO = comboModel(ch.weaponType);

function countEnemies(stage) {
  const ids = [];
  for (const room of Object.values(stage.rooms)) {
    for (const row of room.map) for (const c of row) if (c >= '1' && c <= '9') { const sp = room.enemies?.[c]; const id = typeof sp === 'string' ? sp : sp?.id; if (id && ENEMIES[id] && ENEMIES[id].ai !== 'spawner') ids.push(id); }
  }
  return ids;
}
function heroOnce(level, stageIdx, docs, seed) {
  Math.random = mulberry32(seed);
  try {
    const h = newHero(charId, level);
    // 직업: 10/25 레벨에서 첫 번째 갈래
    let c = CLASSES[h.classId];
    while (c?.next?.length && level >= CLASSES[c.next[0]].reqLevel) { h.classId = c.next[0]; c = CLASSES[h.classId]; }
    const tier = Math.min(7, tierForLevel(level));   // 요청 20: 2부 7단계 장비
    const rar = Math.min(4, 1 + Math.floor(stageIdx / 4));
    const enh = Math.min(12, Math.floor(stageIdx * 0.8));   // world2 §15 (1부 행은 최대 9 라서 그대로)
    const inv = [];
    const put = (slot, id, opts) => { const it = id && makeItem(id, opts); if (it) { inv.push(it); h.equip[slot] = it.uid; } };
    put('weapon', baseIdFor('weapon', tier, { wtype: ch.weaponType }), { rarity: rar, level: enh });
    put('body', baseIdFor('body', tier), { rarity: rar, level: Math.floor(enh * 0.7) });
    put('head', baseIdFor('head', tier), { rarity: rar, level: Math.floor(enh * 0.5) });
    put('cloak', baseIdFor('cloak', tier), { rarity: rar });
    if (ACC) { put('acc1', baseIdFor('acc', tier, { variant: 0 }), { rarity: rar }); put('acc2', baseIdFor('acc', tier, { variant: 1 }), { rarity: rar }); }
    const state = { inventory: inv, heroes: { [charId]: h }, progress: { docs: DOCS ? docs : [] }, arcade: true };
    return { h, s: computeStats(state, h), tier };
  } finally { Math.random = realRandom; }
}
/** 옵션 추첨 편차를 줄이려고 시드 여러 개의 능력치 평균 */
function heroAt(level, stageIdx, docs) {
  const runs = Array.from({ length: SEEDS }, (_, k) => heroOnce(level, stageIdx, docs, SEED * 1000 + stageIdx * 31 + k));
  const s = { ...runs[0].s };
  for (const k of Object.keys(s)) if (typeof s[k] === 'number') s[k] = runs.reduce((a, r) => a + (r.s[k] ?? 0), 0) / runs.length;
  return { h: runs[0].h, s, tier: runs[0].tier };
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

let level = 1, exp = 0;
const docsSoFar = [];
const rows = [];
STAGE_ORDER.forEach((sid, i) => {
  const st = STAGES[sid];
  const { s: P, h: H, tier } = heroAt(level, i, docsSoFar);
  const mag = ch.weaponType === 'staff';
  const ids = countEnemies(st);
  const es = ids.map((id) => ({ id, s: enemyStats(ENEMIES[id], st.level, diff, false) }));
  const hits = es.map((e) => Math.ceil(e.s.maxHp / dmg(P, e.s, 1.0, mag)));
  const taken = es.map((e) => dmg(e.s, { def: P.def, dmgReduce: P.dmgReduce, crit: 0 }, 1.0) / P.hp * 100);
  const b = BOSSES[st.boss];
  let bh = 0, bt = 0, bhp = 0, bsec = 0;
  if (b) {
    const bs = enemyStats({ ...b, lv: st.level }, st.level, { ...diff, enemyHp: diff.bossHp ?? diff.enemyHp }, false);
    bhp = Math.round(bs.maxHp * (b.hpMul ?? 1) * (1 + Math.max(0, 10 - (st.level - 1)) * 0.1) / (1 + Math.max(0, st.level - 24) * 0.035));
    const d1 = dmg(P, bs, 1.0, mag);
    bh = Math.ceil(bhp / d1);
    bsec = bhp / (d1 * COMBO.perSec);
    bt = dmg(bs, { def: P.def, dmgReduce: P.dmgReduce }, 1.2) / P.hp * 100;
  }
  rows.push({ stage: sid, elv: st.level, plv: level, cls: H.classId.replace(/^[a-z]+_/, ''), tier, atk: Math.round(mag ? P.mag : P.atk), hp: Math.round(P.hp), def: Math.round(P.def), n: ids.length, eHP: med(es.map((e) => e.s.maxHp)), hitsMed: med(hits), hitsMax: Math.max(...hits, 0), takenMed: +med(taken).toFixed(1), bossHP: bhp, bossHits: bh, bossSec: Math.round(bsec), bossTaken: +bt.toFixed(1) });
  // 경험치 획득 (85% 처치 + 보스)
  let gain = es.reduce((a, e) => a + e.s.exp, 0) * 0.85;
  if (b) gain += Math.round((b.exp ?? 400) * (1 + st.level * 0.35) * (diff.exp ?? 1));
  exp += gain;
  while (level < 99 && exp >= expToNext(level)) { exp -= expToNext(level); level++; }
  for (const d of st.docs || []) if (!docsSoFar.includes(d)) docsSoFar.push(d);
});

// ── world2 §15 목표 (카엘 기준; 다른 영웅은 ±30%)
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
const widen = (k, [lo, hi]) => (charId === 'kael' || k === 'plv') ? [lo, hi] : [lo === 0 ? 0 : +(lo * 0.7).toFixed(1), +(hi * 1.3).toFixed(1)];
const fails = [];
for (const r of rows) {
  const t = T[r.stage];
  if (!t) continue;
  for (const [k, band] of Object.entries(t)) {
    const [lo, hi] = widen(k, band);
    const v = r[k];
    if (v < lo || v > hi) fails.push({ stage: r.stage, key: k, value: v, lo, hi, dir: v < lo ? 'low' : 'high' });
  }
}
if (!(level >= END_LV[0] && level <= END_LV[1])) fails.push({ stage: 'end', key: 'plv', value: level, lo: END_LV[0], hi: END_LV[1], dir: level < END_LV[0] ? 'low' : 'high' });

if (JSON_OUT) {
  console.log(JSON.stringify({ diff: diffId, char: charId, acc: ACC, docs: DOCS, combo: { mvHit: +COMBO.mvHit.toFixed(3), perSec: +COMBO.perSec.toFixed(2) }, endLevel: level, rows, fails }, null, 1));
} else {
  console.log(`${diffId} · ${charId} (${ch.weaponType}) — 기본 콤보 1타 평균 배율 mvHit ${COMBO.mvHit.toFixed(2)}, 초당 배율 ${COMBO.perSec.toFixed(2)}${ACC ? ' · 장신구 포함' : ''}${DOCS ? ' · 비전서 포함' : ''}`);
  console.table(rows);
  console.log(`s20 클리어 후 레벨 ${level}`);
  if (CHECK) {
    if (!fails.length) console.log(`✓ world2 §15 목표 안 (2부 s14–s20${charId === 'kael' ? '' : ', ±30%'})`);
    else {
      console.log(`✗ world2 §15 목표 밖 ${fails.length}칸${charId === 'kael' ? '' : ' (±30% 적용)'}:`);
      for (const f of fails) console.log(`   ${f.stage} ${f.key} = ${f.value}  (목표 ${f.lo}–${f.hi}, ${f.dir === 'low' ? '낮음' : '높음'})`);
    }
  }
}
if (CHECK && fails.length) process.exitCode = 1;
