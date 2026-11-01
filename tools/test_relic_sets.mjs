// 「피의 유물」 장비 세트 시험 (Stage 6 — owner: RELIC)
// 사용: node tools/test_relic_sets.mjs
//  1) 데이터: 세트 4~6개 · 세트당 4~6부위 · 부위 베이스가 items.js 에 있고 set 표식·단계·요구 레벨이 세트 띠와 맞다 · 무작위 장비 풀에는 안 섞인다
//     · 외전 신화 「사냥꾼의 달」(set:'hunt') 일곱 자루는 그대로 (HUNT_SET 7 · MYTHIC_WEAPONS_P2 에 안 섞임 · 세트 보너스 없음)
//  2) 보너스 문턱: 1부위 = 없음, 2부위 = 2세트, 4부위 = 2+4세트 누적, 5부위 = 마지막 단계 · computeStats 가 정확히 그만큼 더한다
//  3) 같은 장신구 두 개는 1부위로 센다 · 벗으면 보너스가 사라진다 · 다른 세트끼리는 따로 센다
//  4) 옛 세이브: 세트 부위가 없는 세이브는 능력치가 바뀌지 않는다 (새 세이브 필드 없음) · 세트 부위가 든 세이브가 저장→불러오기를 견딘다
//  5) 드롭 표: 세트의 스테이지·보스 id 가 실제로 있다 · rollEnemyLoot/rollBossLoot 가 그 스테이지·보스에서만 세트 부위를 낸다 · 기존 고유 드롭은 그대로
//  6) 점수·최적 장착: gearDelta 가 세트 보너스 변화를 잡는다 · 가방에 세트 2부위가 있으면 최적 장착이 세트를 맞춘다 · 세트는 '특별 취급(고정)' 아님
//  7) 균형: 세트 보너스(최대 단계)가 그 단계 장비 한 벌 능력치의 일부(공격·방어 30% 이하)라 '영원한 최강'이 아니다
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg); } };
const section = (t) => console.log('▶ ' + t);
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const LS = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => LS.set(k, String(v)), removeItem: (k) => LS.delete(k) } });
{ let a = 0x51ed27; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const imp = (p) => import(path.join(ROOT, p));
const { newGameState, migrateState } = await imp('src/game/state.js');
const INV = await imp('src/game/inventory.js');
const I = await imp('src/data/items.js');
const RS = await imp('src/data/relic_sets.js');
const { computeStats, heroSetCounts, STAT_INFO } = await imp('src/game/stats.js');
const G = await imp('src/game/gear_score.js');
const L = await imp('src/game/loot.js');
const { STAGES } = await imp('src/data/stages.js');
const { ITEMS, makeItem } = I;

function fresh(charId = 'kael', level = 60) {
  const st = newGameState({ charId });
  st.heroes[charId].level = level;
  return st;
}
const add = (st, baseId, o = {}) => { const it = makeItem(baseId, { rarity: 2, affixes: [], ...o }); INV.addItem(st, it, { silent: true }); return it; };
const wear = (st, h, it, slot) => { h.equip[slot ?? (ITEMS[it.baseId].slot === 'acc' ? (h.equip.acc1 ? 'acc2' : 'acc1') : ITEMS[it.baseId].slot)] = it.uid; };
const diff = (a, b) => { const o = {}; for (const k of Object.keys(STAT_INFO)) { const d = (b[k] ?? 0) - (a[k] ?? 0); if (Math.abs(d) > 1e-6) o[k] = d; } return o; };

// ── 1. 데이터 ──
section('데이터: 세트·부위·사냥꾼의 달');
{
  const ids = RS.RELIC_SET_IDS;
  ok(ids.length >= 4 && ids.length <= 6, `세트 4~6개 (${ids.length})`);
  ok(I.RELIC_SETS === RS.RELIC_SETS, 'items.js 가 같은 RELIC_SETS 를 다시 내보낸다');
  const tiers = new Set();
  for (const k of ids) {
    const S = RS.RELIC_SETS[k];
    tiers.add(S.tier);
    ok(S.pieces.length >= 4 && S.pieces.length <= 6, `${k}: 부위 4~6개 (${S.pieces.length})`);
    ok(S.bonus.length >= 2 && S.bonus[0].n === 2 && S.bonus[1].n === 4, `${k}: 2세트·4세트 보너스`);
    ok(S.bonus.every((t, i) => i === 0 || t.n > S.bonus[i - 1].n) && S.bonus.at(-1).n <= S.pieces.length, `${k}: 문턱이 오름차순이고 부위 수 이하`);
    ok(S.bonus.every((t) => Object.keys(t.stats).every((s) => s in STAT_INFO)), `${k}: 보너스는 기존 능력치 키만`);
    const slots = {};
    for (const id of RS.SET_PIECES[k]) {
      const b = ITEMS[id];
      ok(!!b && b.set === k && b.tier === S.tier && I.isEquipment(b) && !b.unique, `${k}/${id}: 베이스 있음 · set=${k} · 단계 ${S.tier} · 일반 장비`);
      ok(b && b.lvReq >= I.TIER_LV[S.tier - 1] && b.lvReq <= I.TIER_LV[S.tier - 1] + 4, `${k}/${id}: 요구 레벨이 단계 띠 안 (${b?.lvReq})`);
      slots[b?.slot] = (slots[b?.slot] ?? 0) + 1;
      ok(RS.setOfBase(b) === S && RS.setOfBase(id) === S, `${k}/${id}: setOfBase`);
    }
    ok(Object.entries(slots).every(([s, n]) => n <= (s === 'acc' ? 2 : 1)), `${k}: 부위가 칸(무기·머리·몸·망토·장신구×2)에 들어간다`);
  }
  ok(tiers.has(7) && [...tiers].filter((t) => t < 7).length >= 3, '레벨 띠: 1부 셋 이상 + 2부');
  // 무작위 장비에는 안 섞인다
  let leak = 0;
  for (let i = 0; i < 2000; i++) { const it = I.rollItem(1 + (i % 70)); if (ITEMS[it.baseId].set) leak++; }
  ok(leak === 0, '무작위 장비(rollItem)에 세트 부위가 안 섞인다');
  // 사냥꾼의 달
  ok(I.HUNT_SET.length === 7 && I.HUNT_SET.every((id) => ITEMS[id].set === 'hunt' && ITEMS[id].mythic), '사냥꾼의 달 일곱 자루 그대로');
  ok(Object.values(I.MYTHIC_WEAPONS_P2).every((id) => !ITEMS[id].set), 'MYTHIC_WEAPONS_P2 에 한 벌 무기 없음');
  ok(RS.setOfBase(ITEMS[I.HUNT_SET[0]]) === null, "'hunt' 는 보너스 세트가 아니다");
  const stH = fresh(); const hH = stH.heroes.kael;
  const hunt = add(stH, 'u_hunt_whip', { rarity: 5 }); wear(stH, hH, hunt, 'weapon');
  ok(Object.keys(heroSetCounts(stH, hH)).length === 0, '사냥꾼의 달을 들어도 세트 수 없음');
  ok(G.isSpecial(hunt), '사냥꾼의 달은 그대로 특별(고정) 취급');
}

// ── 2·3. 보너스 문턱 · 누적 · 벗기 ──
section('보너스 문턱 · 누적 · 중복 · 벗기');
for (const k of RS.RELIC_SET_IDS) {
  const S = RS.RELIC_SETS[k];
  const st = fresh('kael', 80); const h = st.heroes.kael;
  for (const s of ['head', 'body', 'cloak', 'acc1', 'acc2']) h.equip[s] = null;
  const base = computeStats(st, h);
  const items = S.pieces.map(([id]) => add(st, id));
  // 부위만의 능력치 합 (세트 보너스 없이)
  let prev = base, sumPieces = {};
  for (let n = 1; n <= items.length; n++) {
    wear(st, h, items[n - 1]);
    const piece = I.itemStats(items[n - 1]);
    for (const s in piece) sumPieces[s] = (sumPieces[s] ?? 0) + piece[s];
    const cnt = heroSetCounts(st, h);
    ok(cnt[k] === n, `${k}: ${n}부위 셈`);
    const want = RS.setBonusStats({ [k]: n });
    const expectKeys = {};
    for (const t of S.bonus) if (n >= t.n) for (const s in t.stats) expectKeys[s] = (expectKeys[s] ?? 0) + t.stats[s];
    ok(JSON.stringify(Object.entries(want).sort()) === JSON.stringify(Object.entries(expectKeys).sort()), `${k}: ${n}부위 보너스 = 문턱 누적`);
    if (n === 1) ok(Object.keys(want).length === 0, `${k}: 1부위 = 보너스 없음`);
    // computeStats 가 (부위 능력치 + 보너스) 만큼 오른다 — 정수·상한 반올림을 피해 덧셈형 능력치로 본다
    const now = computeStats(st, h);
    const d = diff(base, now);
    for (const s of ['hp', 'res', 'def', 'atk', 'mag', 'lifesteal', 'skillDmg', 'subDmg', 'dmgReduce', 'ultGain', 'airJumps', 'critDmg', 'mpRegen']) {
      const exp = (sumPieces[s] ?? 0) + (want[s] ?? 0);
      if (!exp && !d[s]) continue;
      ok(Math.abs((d[s] ?? 0) - exp) <= 1.01, `${k}: ${n}부위 ${s} 증가 ${d[s] ?? 0} ≈ 부위 ${sumPieces[s] ?? 0} + 보너스 ${want[s] ?? 0}`);
    }
    prev = now;
  }
  // 벗기: 4부위 → 1부위로 내리면 보너스가 사라진다
  const full = computeStats(st, h);
  for (const s of ['body', 'cloak', 'acc1', 'acc2']) if (h.equip[s] && ITEMS[INV.findItem(st, h.equip[s]).baseId].set === k) INV.unequip(st, h, s);
  const cnt1 = heroSetCounts(st, h)[k] ?? 0;
  ok(cnt1 <= 1, `${k}: 벗으면 부위 수가 줄어든다 (${cnt1})`);
  ok(Object.keys(RS.setBonusStats(heroSetCounts(st, h))).length === 0, `${k}: 1부위 이하로 내리면 보너스 없음`);
  ok(computeStats(st, h).hp < full.hp, `${k}: 벗으면 최종 능력치가 내려간다`);
}
{
  // 같은 장신구 두 개 = 1부위
  const st = fresh('kael', 80); const h = st.heroes.kael;
  const a = add(st, 'rs_void_ring'), b = add(st, 'rs_void_ring');
  h.equip.acc1 = a.uid; h.equip.acc2 = b.uid;
  ok(heroSetCounts(st, h).void === 1, '같은 세트 장신구 두 개는 1부위로 센다');
  // 다른 세트끼리 따로
  h.equip.acc2 = add(st, 'rs_cath_ring').uid; h.equip.head = add(st, 'rs_cath_head').uid; h.equip.body = add(st, 'rs_void_body').uid;
  const c = heroSetCounts(st, h);
  ok(c.void === 2 && c.cathedral === 2, `세트별로 따로 센다 (void ${c.void}, cathedral ${c.cathedral})`);
  const bs = RS.setBonusStats(c);
  ok(near(bs.def ?? 0, 8) && near(bs.hp ?? 0, 60) && near(bs.res ?? 0, 16), '두 세트 2세트 보너스가 함께 더해진다');
  // 아이템 카드: 세트 이름 + n/총 · 켜진 줄
  const rich = I.itemDescRich(INV.findItem(st, h.equip.body), { setCount: 2 });
  ok(rich.some((l) => l.text === '세트: 「공허 순례자」 2/5'), '카드: 「공허 순례자」 2/5');
  ok(rich.filter((l) => l.set && l.on).length === 1 && rich.filter((l) => l.set && l.on === false).length === 2, '카드: 2세트 줄만 켜짐');
  ok(I.itemDescRich(INV.findItem(st, h.equip.body)).some((l) => l.text === '세트: 「공허 순례자」 (5부위)'), '카드(영웅 모름): 부위 수만');
  ok(!I.itemDescRich(makeItem('a_body_8')).some((l) => l.set), '세트가 아닌 장비 카드는 그대로');
}

// ── 4. 옛 세이브 ──
section('옛 세이브 · 저장/불러오기');
{
  const st = fresh('kael', 40); const h = st.heroes.kael;
  const it = add(st, 'a_body_8'); h.equip.body = it.uid;
  const s0 = computeStats(st, h);
  ok(Object.keys(heroSetCounts(st, h)).length === 0, '세트 없는 세이브: 세트 수 없음');
  // 세트 보너스 없는 계산과 같다 (부위 능력치 + 기본치)
  const raw = JSON.parse(JSON.stringify(st));
  const mig = migrateState ? migrateState(raw) ?? raw : raw;
  const s1 = computeStats(mig, mig.heroes.kael);
  ok(Object.keys(diff(s0, s1)).length === 0, '옛 세이브(세트 필드 없음)를 이관해도 능력치 같음');
  // 세트가 든 세이브 왕복
  const st2 = fresh('kael', 80); const h2 = st2.heroes.kael;
  for (const id of RS.SET_PIECES.void.slice(0, 4)) wear(st2, h2, add(st2, id));
  const before = computeStats(st2, h2);
  const back = JSON.parse(JSON.stringify(st2));
  const m2 = migrateState ? migrateState(back) ?? back : back;
  ok(heroSetCounts(m2, m2.heroes.kael).void === 4, '저장→불러오기 뒤에도 4부위');
  ok(Object.keys(diff(before, computeStats(m2, m2.heroes.kael))).length === 0, '저장→불러오기 뒤 능력치 같음');
  ok(!('relicSets' in st2) && !('sets' in st2.progress), '새 세이브 필드 없음 (장착에서 매번 센다)');
}

// ── 5. 드롭 표 ──
section('드롭 표');
{
  const stageIds = new Set((Array.isArray(STAGES) ? STAGES : Object.values(STAGES)).map((s) => s.id));
  const bossIds = new Set((Array.isArray(STAGES) ? STAGES : Object.values(STAGES)).map((s) => s.boss?.id ?? s.boss).filter(Boolean));
  for (const k of RS.RELIC_SET_IDS) {
    const d = RS.RELIC_SETS[k].drop;
    ok(d.stages.length && d.stages.every((s) => stageIds.has(s)), `${k}: 드롭 스테이지가 있다 (${d.stages})`);
    ok(d.bosses.length && d.bosses.every((b) => bossIds.has(b)), `${k}: 드롭 보스가 있다 (${d.bosses})`);
    const lvs = d.stages.map((s) => (Array.isArray(STAGES) ? STAGES : Object.values(STAGES)).find((x) => x.id === s).level);
    ok(lvs.every((lv) => Math.abs(lv - RS.RELIC_SETS[k].lv) <= 20), `${k}: 드롭 스테이지 레벨이 세트 띠 근처 (${lvs})`);
  }
  ok(RS.setDropFor('s01', null).length === 0 && RS.setDropFor('arena', null).length === 0 && RS.setDropFor(undefined, null).length === 0, '세트 없는 스테이지·투기장·아케이드 = 없음');
  ok(RS.setDropFor('s26', null).includes('alchemist') && RS.setDropFor(null, 'b_paracel').includes('alchemist'), '연금술사 세트 = 파라켈의 공방(s26) · 파라켈');
  // 실제 loot 굴림 (확률을 1로 올려 경로 확인 — 끝나면 되돌림)
  const save = { ...L.SET_DROP };
  Object.assign(L.SET_DROP, { elite: 1, normal: 1, boss: 1 });
  const mkWorld = (stageId, lv = 20) => ({ stage: { id: stageId, level: lv, chapter: +String(stageId).slice(1) || 0 }, diff: { drop: 1, gold: 1 }, player: { stats: { luck: 0, dropBonus: 0 } }, state: newGameState({ charId: 'kael' }), entities: [] });
  const enemy = { def: { id: 'skeleton', drops: [] }, elite: true, stats: { level: 20 } };
  const setItems = (out) => out.filter((o) => o.type === 'item' && ITEMS[o.data.item.baseId]?.set && ITEMS[o.data.item.baseId].set !== 'hunt').map((o) => o.data.item);
  const e9 = setItems(L.rollEnemyLoot(mkWorld('s09'), enemy));
  ok(e9.length === 1 && ITEMS[e9[0].baseId].set === 'cathedral' && e9[0].rarity >= 2, '시계탑(s09) 정예 → 성당 기사 부위 (희귀 이상)');
  ok(setItems(L.rollEnemyLoot(mkWorld('s01'), enemy)).length === 0, '불타는 마을(s01) → 세트 부위 없음');
  const bw = mkWorld('s26', 30);
  const bout = L.rollBossLoot(bw, { def: { id: 'b_paracel', drops: [] }, stats: { level: 30 } });
  ok(setItems(bout).some((it) => ITEMS[it.baseId].set === 'alchemist'), '파라켈 → 연금술사 부위');
  const bw2 = mkWorld('s04', 8);
  const bout2 = L.rollBossLoot(bw2, { def: { id: 'b_crimson', drops: ['u_crimson'] }, stats: { level: 8 } });
  ok(bout2.some((o) => o.data?.item?.baseId === 'u_crimson'), '보스 고유 드롭(진홍의 갑주)은 그대로 첫 처치 확정');
  ok(setItems(bout2).some((it) => ITEMS[it.baseId].set === 'bloodmoon'), '진홍의 갑주군주 → 혈월 사냥꾼 부위 (고유와 따로)');
  Object.assign(L.SET_DROP, save);
  ok(L.SET_DROP.boss <= 0.15 && L.SET_DROP.elite <= 0.02 && L.SET_DROP.normal <= 0.002, `기본 확률이 낮다 (보스 ${save.boss} · 정예 ${save.elite} · 일반 ${save.normal})`);
}

// ── 6. 점수 · 최적 장착 ──
section('점수 · 최적 장착');
{
  const st = fresh('kael', 60); const h = st.heroes.kael;
  for (const s of ['head', 'body', 'cloak', 'acc1', 'acc2']) h.equip[s] = null;
  const head = add(st, 'rs_void_head'); wear(st, h, head);
  const body = add(st, 'rs_void_body');
  const d = G.gearDelta(st, h, body);
  const s0 = computeStats(st, h);
  const save = h.equip; h.equip = { ...save, body: body.uid }; const s1 = computeStats(st, h); h.equip = save;
  ok(near(s1.hp - s0.hp, d.rows.find((r) => r.k === 'hp')?.to - d.rows.find((r) => r.k === 'hp')?.from), 'gearDelta 줄 = computeStats 차이 (세트 2부위 보너스 포함)');
  ok((s1.hp - s0.hp) >= I.itemStats(body).hp + 60 - 1, '2부위째를 끼울 때 비교에 2세트 보너스(HP +60)가 잡힌다');
  ok(!G.isSpecial(body) && !d.effect, '세트 부위는 특별(고정·+효과) 취급 아님');
  // 최적 장착: 비슷한 일반 장비를 입은 상태 + 가방에 세트 4부위 → 세트를 모은다
  const st2 = fresh('kael', 60); const h2 = st2.heroes.kael;
  const gen = { head: add(st2, 'a_head_13'), body: add(st2, 'a_body_13'), cloak: add(st2, 'a_cloak_13'), acc1: add(st2, 'a_ring_13'), acc2: add(st2, 'a_amulet_13') };
  for (const s in gen) h2.equip[s] = gen[s].uid;
  for (const id of RS.SET_PIECES.void) add(st2, id);
  const plan = G.bestLoadout(st2, 'kael', { fixSpecial: true });
  const after = { ...plan.after };
  const save2 = h2.equip; h2.equip = after; const n = heroSetCounts(st2, h2).void ?? 0; h2.equip = save2;
  ok(n >= 2, `최적 장착이 세트 보너스를 보고 공허 순례자를 맞춘다 (${n}부위, 점수 ${plan.total.toFixed(2)})`);
  ok(plan.total >= -1e-9, '최적 장착 점수는 지금보다 낮아지지 않는다');
  // 세트 보너스를 빼고 계산하면 세트를 덜 고른다 → 세트 보너스가 결정에 쓰였다 (적어도 고른 부위 수가 같거나 많다)
}

// ── 7. 균형 ──
section('균형: 세트 보너스 크기');
for (const k of RS.RELIC_SET_IDS) {
  const S = RS.RELIC_SETS[k];
  const full = RS.setBonusStats({ [k]: S.pieces.length });
  const pieceSum = {};
  for (const id of RS.SET_PIECES[k]) { const st = I.itemStats(makeItem(id, { rarity: 2, affixes: [] })); for (const s in st) pieceSum[s] = (pieceSum[s] ?? 0) + st[s]; }
  const t = S.tier;
  const atkRef = [8, 17, 29, 44, 62, 84, 110][t - 1];   // 그 단계 무기 기본 공격력
  ok((full.atk ?? 0) <= atkRef * 0.3 + 1e-9 && (full.mag ?? 0) <= atkRef * 0.3 + 1e-9, `${k}: 최대 보너스 공격/마력 ≤ 단계 무기 공격력의 30% (${full.atk ?? 0}/${full.mag ?? 0} vs ${atkRef})`);
  ok((full.def ?? 0) <= (pieceSum.def ?? 0) * 0.3 + 1e-9, `${k}: 최대 보너스 방어 ≤ 부위 방어 합의 30%`);
  ok((full.crit ?? 0) <= 5 && (full.lifesteal ?? 0) <= 2 && (full.dmgReduce ?? 0) <= 4 && (full.airJumps ?? 0) <= 1, `${k}: 확률형 보너스가 작다`);
  // 다음 띠(한 단계 위 일반 장비)보다 세트 한 벌(+보너스)의 방어가 크게 높지 않다 → '영원한 최강' 아님
  if (t < 7) {
    const up = { head: `a_head_${2 * (t + 1)}`, body: `a_body_${2 * (t + 1)}`, cloak: `a_cloak_${2 * (t + 1)}` };
    let upDef = 0; for (const s in up) upDef += I.itemStats(makeItem(up[s], { rarity: 2, affixes: [] })).def ?? 0;
    let setDef = (full.def ?? 0); for (const id of RS.SET_PIECES[k]) if (ITEMS[id].slot !== 'acc') setDef += I.itemStats(makeItem(id, { rarity: 2, affixes: [] })).def ?? 0;
    ok(setDef < upDef * 1.25, `${k}: 세트 방어구+보너스 방어(${setDef})가 한 단계 위 일반 방어구(${upDef})의 1.25배 미만`);
  }
}

console.log(`\n${fails ? '✗' : '✓'} test_relic_sets: ${passes} 통과, ${fails} 실패`);
process.exit(fails ? 1 : 0);
