// 장비 편의 (docs/specs/qol_equip.md §7) 시험 — owner: QOL
// 사용: node tools/test_gear_qol.mjs
//  1) 점수 = stats.js 최종 능력치 차이 (gearDelta 의 줄·점수를 computeStats 로 다시 계산해 같다), 못 쓰는 무기 = 비교 대상 아님
//  2) 최적 장착 규칙: 잠금 칸 고정 · 고유 칸 기본 고정(옵션으로 풂) · 장신구 중복 없음 · 다른 영웅 장비 제외 · lvReq · 무기는 비우지 않음 ·
//     한 벌(set) 확인 · 적용/되돌리기 · 파티 전체(지금 영웅 먼저)
//  3) 자동 처분: 절대 처분 금지 목록(잠금·장착·중요·다시 못 얻는 것) · 예외 4가지 · 기준 희귀도 상한 · 판매/분해 결과 · 옛 sellJunk 호출
//  4) 되사기: 최대 30 · 스테이지 3번 뒤 사라짐 · 골드/가방 부족 · 되산 장비가 그대로 돌아온다
//  5) 세이브 호환: settings.gear 이관(빠짐·잘못된 값·모르는 키 보존·멱등) · state.buyback/isNew 보존 · 옛 세이브(없음)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg); } };
const section = (t) => console.log('▶ ' + t);
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const LS = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => LS.set(k, String(v)), removeItem: (k) => LS.delete(k) } });

// 장비 능력치 굴림이 무작위라 결과가 흔들리지 않게 Math.random 을 고정 씨앗으로 (mulberry32)
{ let a = 0x9e3779b9; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const imp = (p) => import(path.join(ROOT, p));
const { newGameState, ensureHero, migrateState } = await imp('src/game/state.js');
const INV = await imp('src/game/inventory.js');
const { ITEMS, makeItem, sellPrice } = await imp('src/data/items.js');
const { computeStats, STAT_INFO } = await imp('src/game/stats.js');
const G = await imp('src/game/gear_score.js');
const { DEFAULT_SETTINGS, migrateSettings } = await imp('src/core/save.js');

function fresh(charId = 'kael', level = 30) {
  const st = newGameState({ charId });
  st.heroes[charId].level = level;
  st.gold = 100000;
  return st;
}
const add = (st, baseId, o = {}) => { const it = makeItem(baseId, o); INV.addItem(st, it, { silent: true }); return it; };

// ── 1. 점수 = stats.js 차이 ──
section('점수 = stats.js 최종 능력치 차이');
{
  const st = fresh();
  const h = st.heroes.kael;
  const cands = [add(st, 'w_whip_8', { rarity: 2 }), add(st, 'a_body_8', { rarity: 1, level: 4 }), add(st, 'a_ring_7', { rarity: 2 }), add(st, 'a_head_6', { rarity: 0 }), add(st, 'a_cloak_5', { rarity: 1 })];
  for (const it of cands) {
    const d = G.gearDelta(st, h, it);
    ok(d.comparable, `${it.baseId} 비교 가능`);
    const s0 = computeStats(st, h);
    const eq = { ...h.equip, [d.slot]: it.uid };
    const save = h.equip; h.equip = eq; const s1 = computeStats(st, h); h.equip = save;
    let same = true;
    for (const r of d.rows) if (!near(r.to - r.from, (s1[r.k] ?? 0) - (s0[r.k] ?? 0))) same = false;
    const keys = Object.keys(STAT_INFO).filter((k) => Math.abs((s1[k] ?? 0) - (s0[k] ?? 0)) >= 0.05);
    ok(same && keys.every((k) => d.rows.some((r) => r.k === k)), `${it.baseId}: 줄 = computeStats 차이 (${d.rows.length}줄)`);
    ok(near(d.score, G.scoreBetween(G.powerOf(s0, h), G.powerOf(s1, h), h)), `${it.baseId}: 점수 = scoreBetween(stats)`);
    ok(d.mark === G.markOf(d.score), `${it.baseId}: 표시 ${d.mark}`);
    ok(d.dps && near(d.dps.from, G.dpsOf(s0, h)) && near(d.dps.to, G.dpsOf(s1, h)), `${it.baseId}: 초당 피해 어림 = dpsOf(stats)`);
  }
  const sword = add(st, 'w_sword_8', { rarity: 2 });
  const ds = G.gearDelta(st, h, sword);
  ok(!ds.comparable && G.gearScore(st, h, sword) === null, '카엘이 못 쓰는 장검 = 비교 대상 아님');
  const wNow = INV.findItem(st, h.equip.weapon);
  ok(G.gearDelta(st, h, wNow).here && G.gearDelta(st, h, wNow).score === 0, '장착 중인 무기 = 같음(0)');
  // 점수 기준(공격/생존)이 결과를 기울인다
  const arm = add(st, 'a_body_12', { rarity: 2 });
  const sa = G.gearDelta(st, h, arm, { mode: 'atk' }).score, sd = G.gearDelta(st, h, arm, { mode: 'def' }).score;
  ok(sd > sa, `갑옷 점수: 생존 우선(${sd.toFixed(2)}) > 공격 우선(${sa.toFixed(2)})`);
  const u = add(st, 'u_banshee');
  ok(G.gearDelta(st, h, u).effect === true && G.isSpecial(u), '고유 장비 = +효과 · 특수');
}

// ── 2. 최적 장착 ──
section('최적 장착 규칙');
{
  const st = fresh();
  const h = st.heroes.kael;
  const w2 = add(st, 'w_whip_8', { rarity: 2 }), b2 = add(st, 'a_body_8', { rarity: 2 });
  const r1 = add(st, 'a_ring_7', { rarity: 2 }), r2 = add(st, 'a_amulet_8', { rarity: 2 }), r3 = add(st, 'a_ring_1');
  const hiLv = add(st, 'w_whip_14', { rarity: 2 });   // lvReq 50 > 30
  const p = G.bestLoadout(st, 'kael');
  ok(p.after.weapon === w2.uid, '무기: 더 좋은 채찍');
  ok(p.after.weapon !== hiLv.uid, 'lvReq 미달 무기는 고르지 않는다');
  ok(p.after.body === b2.uid, '갑옷: 더 좋은 갑옷');
  ok(p.after.acc1 && p.after.acc2 && p.after.acc1 !== p.after.acc2, '장신구 두 칸 · 중복 없음');
  ok(new Set([p.after.acc1, p.after.acc2]).has(r1.uid) && new Set([p.after.acc1, p.after.acc2]).has(r2.uid), '장신구: 상위 2개 (약한 반지 제외)');
  ok(!Object.values(p.after).includes(r3.uid), '약한 반지는 안 낀다');
  ok(p.total > 0 && p.changes.length >= 4, `계획: ${p.changes.length}칸 · 종합 ${p.total.toFixed(1)}`);
  ok(isDeepStrictEqual(h.equip, p.before), '계획만으로는 장비가 바뀌지 않는다');
  const tok = G.applyLoadout(st, p);
  ok(isDeepStrictEqual({ ...h.equip }, { ...p.after }), '적용 = 계획 그대로');
  G.undoLoadout(st, tok);
  ok(isDeepStrictEqual({ ...h.equip }, { ...p.before }), '되돌리기 = 원래 장비');
  // 잠금 칸 고정
  const bodyNow = INV.findItem(st, h.equip.body);
  bodyNow.locked = true;
  const p2 = G.bestLoadout(st, 'kael');
  ok(p2.after.body === bodyNow.uid && p2.fixed.some((f) => f.slot === 'body' && f.why === 'locked'), '잠긴 장비 칸은 고정');
  bodyNow.locked = false;
  // 고유 칸: 기본 고정, 옵션으로 풂
  const cloakU = add(st, 'u_nightwing');
  INV.equipItem(st, h, cloakU.uid);
  const better = add(st, 'a_cloak_8', { rarity: 3 });   // lvReq 24 ≤ 30
  const p3 = G.bestLoadout(st, 'kael');
  ok(p3.after.cloak === cloakU.uid && p3.fixed.some((f) => f.slot === 'cloak' && f.why === 'special'), '고유 망토 칸은 기본 고정');
  const p4 = G.bestLoadout(st, 'kael', { fixSpecial: false });
  const sNw = G.gearDelta(st, h, better).score;
  ok(p4.after.cloak === (sNw > 0.05 ? better.uid : cloakU.uid), `fixSpecial:false 면 점수대로 (${sNw.toFixed(2)})`);
  // 다른 영웅이 끼운 장비 제외
  ensureHero(st, 'lia'); st.heroes.lia.level = 30;
  const top = add(st, 'a_head_8', { rarity: 3 });
  INV.equipItem(st, st.heroes.lia, top.uid);
  const p5 = G.bestLoadout(st, 'kael');
  ok(p5.after.head !== top.uid, '다른 영웅(리아)이 낀 투구는 후보가 아니다');
  // 무기는 비우지 않는다
  ok(!!p5.after.weapon, '무기 칸은 늘 무언가');
  // 파티 전체: 지금 영웅 먼저 (같은 장비를 둘 다 원하면 카엘)
  INV.unequip(st, st.heroes.lia, 'head');
  const all = G.planAll(st);
  const kp = all.plans.find((q) => q.heroId === 'kael'), lp = all.plans.find((q) => q.heroId === 'lia');
  ok(all.plans[0].heroId === 'kael', '파티 계획: 지금 영웅 먼저');
  ok(kp.after.head === top.uid && lp.after.head !== top.uid, '공유 가방 경합: 지금 영웅이 먼저 가져간다');
  const used = new Map();
  let dup = false;
  for (const q of all.plans) for (const v of Object.values(q.after)) if (v) { if (used.has(v) && used.get(v) !== q.heroId) dup = true; used.set(v, q.heroId); }
  ok(!dup, '파티 계획: 한 장비를 두 영웅이 끼지 않는다');
  ok(isDeepStrictEqual({ ...st.heroes.lia.equip }, { ...lp.before }), 'planAll 은 장비를 바꾸지 않는다');
  const tokA = G.applyLoadout(st, all.plans);
  ok(st.heroes.kael.equip.head === top.uid, '파티 적용');
  G.undoLoadout(st, tokA);
  ok(isDeepStrictEqual({ ...st.heroes.kael.equip }, { ...kp.before }) && isDeepStrictEqual({ ...st.heroes.lia.equip }, { ...lp.before }), '파티 되돌리기');
  // 한 벌(set) 확인: 가짜 한 벌 두 조각을 끼우고 더 좋은 장비를 넣는다 (fixSpecial:false) → 견줘서 더 높은 쪽
  ITEMS.qa_set_head = { ...ITEMS.a_head_2, id: 'qa_set_head', set: 'qa', unique: true };
  ITEMS.qa_set_body = { ...ITEMS.a_body_2, id: 'qa_set_body', set: 'qa', unique: true };
  const st2 = fresh('kael', 40);
  const h2 = st2.heroes.kael;
  const sh = add(st2, 'qa_set_head'), sb = add(st2, 'qa_set_body');
  INV.equipItem(st2, h2, sh.uid); INV.equipItem(st2, h2, sb.uid);
  add(st2, 'a_head_10', { rarity: 2 }); add(st2, 'a_body_10', { rarity: 2 });
  const ps = G.bestLoadout(st2, 'kael', { fixSpecial: false });
  ok(ps.setKept === false && ps.after.head !== sh.uid, '한 벌보다 탐욕 선택이 높으면 한 벌을 푼다 (setKept=false)');
  const pf = G.bestLoadout(st2, 'kael');
  ok(pf.after.head === sh.uid && pf.after.body === sb.uid, '기본(고유 고정)이면 한 벌 칸은 그대로');
  delete ITEMS.qa_set_head; delete ITEMS.qa_set_body;
}

// ── 3. 자동 처분 ──
section('자동 처분 (절대 금지 · 예외)');
{
  const st = fresh();
  const h = st.heroes.kael;
  ensureHero(st, 'bran'); st.heroes.bran.level = 30;
  // 두 영웅 모두 중간 장비로 채운다 (빈 칸이면 어떤 장비든 ▲ 라서 처분 후보가 안 된다)
  for (const [id, list] of [['kael', ['w_whip_8', 'a_body_8', 'a_head_8', 'a_cloak_8']], ['bran', ['a_body_8', 'a_head_8', 'a_cloak_8']]]) {
    for (const b of list) INV.equipItem(st, st.heroes[id], add(st, b, { rarity: 2 }).uid);
    INV.equipItem(st, st.heroes[id], add(st, 'a_ring_7').uid, 'acc1');
    INV.equipItem(st, st.heroes[id], add(st, 'a_amulet_8').uid, 'acc2');
  }
  const junk = add(st, 'a_head_1', { rarity: 0 });
  const junk2 = add(st, 'w_whip_1', { rarity: 1 });
  const locked = add(st, 'a_head_1', { rarity: 0 }); locked.locked = true;
  const enh = add(st, 'a_cloak_1', { rarity: 0, level: 3 });
  const rare = add(st, 'a_cloak_2', { rarity: 2 });
  const epic = add(st, 'a_cloak_1', { rarity: 3 });
  const uniq = add(st, 'u_goldbat');
  // 카엘에게 ▲ (더 높은 단계 반지) — 붙는 능력치가 무작위라 확실히 좋은 것이 나올 때까지 다시 만든다
  let better = add(st, 'a_ring_9', { rarity: 1 });
  for (let i = 0; i < 40 && !((G.gearDelta(st, h, better, {}).score ?? 0) > 1); i++) { INV.removeItem ? INV.removeItem(st, better.uid) : st.inventory.splice(st.inventory.indexOf(better), 1); better = add(st, 'a_ring_9', { rarity: 1 }); }
  const forBran = add(st, 'w_greatsword_7', { rarity: 1 });   // 브란 전용 계열 무기, 브란에게 ▲
  const eqd = INV.findItem(st, h.equip.body);             // 시작 갑옷 (장착 중, 일반)
  const key = INV.findItem(st, st.inventory.find((i) => ITEMS[i.baseId]?.slot === 'key')?.uid) ?? (INV.addByBase(st, 'k_rift_lantern', 1, {}, { silent: true }), st.inventory.find((i) => i.baseId === 'k_rift_lantern'));
  ITEMS.qa_hunt = { ...ITEMS.a_cloak_1, id: 'qa_hunt', set: 'hunt' };
  const irr = add(st, 'qa_hunt', { rarity: 0 });
  const crit = G.disposeCriteria(st, { gear: { maxRarity: 2 } });
  const list = INV.disposeCandidates(st, crit).map((c) => c.inst.uid);
  ok(list.includes(junk.uid) && list.includes(junk2.uid), '기준 이하 잡동사니는 처분 후보');
  ok(list.includes(rare.uid), '희귀 이하(기준 2) 후보');
  ok(!list.includes(epic.uid), '영웅 등급은 기준 밖');
  ok(!list.includes(locked.uid), '잠금 = 절대 처분 금지');
  ok(!list.includes(eqd.uid), '장착 중 = 절대 처분 금지');
  ok(!list.includes(key.uid), '중요 물품 = 절대 처분 금지');
  ok(!list.includes(irr.uid), '다시 얻을 수 없는 장비(한 벌) = 절대 처분 금지');
  ok(!list.includes(enh.uid), '예외: 강화한 장비 남김');
  ok(!list.includes(uniq.uid), '예외: 고유 장비 남김');
  ok(!list.includes(better.uid), '예외: 지금 영웅에게 ▲ 남김');
  ok(!list.includes(forBran.uid), '예외: 다른 영웅에게 ▲ 남김');
  // 예외를 끄면 처분 후보가 된다 (절대 금지 목록은 그대로)
  const off = G.disposeCriteria(st, { gear: { maxRarity: 2, keep: { enhanced: false, better: false, other: false, special: false } } });
  const list2 = INV.disposeCandidates(st, off).map((c) => c.inst.uid);
  ok(list2.includes(enh.uid) && list2.includes(better.uid) && list2.includes(forBran.uid), '예외를 끄면 강화·▲ 장비도 후보');
  ok(!list2.includes(uniq.uid), '고유(전설 이상)는 기준 희귀도 밖이라 그래도 남는다');
  ok(!list2.includes(locked.uid) && !list2.includes(eqd.uid) && !list2.includes(key.uid) && !list2.includes(irr.uid), '예외를 꺼도 절대 금지 목록은 그대로');
  ok(INV.disposeCandidates(st, { ...off, maxRarity: 5 }).every((c) => (c.inst.rarity ?? 0) <= 2), '기준 희귀도는 희귀(2)를 넘지 않는다');
  // 판매 → 골드 · 되사기
  const g0 = st.gold, cands = INV.disposeCandidates(st, crit);
  const expect = cands.reduce((a, c) => a + sellPrice(c.inst), 0);
  const res = INV.disposeJunk(st, null, { mode: 'sell', buyback: true, list: cands });
  ok(res.count === cands.length && res.gold === expect && st.gold === g0 + expect, `판매 ${res.count}개 +${res.gold}G`);
  ok(INV.buybackList(st).length === res.count, '판 장비가 되사기 목록에');
  ok(!INV.findItem(st, junk.uid) && INV.findItem(st, locked.uid) && INV.findItem(st, eqd.uid), '판매 뒤: 잡동사니만 사라짐');
  // 분해 → 강화석
  const s2 = fresh();
  const a = add(s2, 'a_body_7', { rarity: 1 }), b = add(s2, 'a_head_1', { rarity: 0 });
  const r2 = INV.disposeJunk(s2, { maxRarity: 1, keep: { better: false, other: false } }, { mode: 'salvage' });
  ok(r2.count === 2 && (r2.mats.m_stone_3 ?? 0) === 2 && (r2.mats.m_stone_1 ?? 0) === 1, `분해: ${JSON.stringify(r2.mats)}`);
  ok(INV.countItem(s2, 'm_stone_3') === 2 && !INV.findItem(s2, a.uid) && !INV.findItem(s2, b.uid), '분해 = 장비 사라지고 강화석 들어옴');
  // 옛 호출 sellJunk(state, maxRarity): 강화한 장비는 남긴다
  const s3 = fresh();
  const c1 = add(s3, 'a_head_1', { rarity: 1 }), c2 = add(s3, 'a_head_1', { rarity: 1, level: 2 }), c3 = add(s3, 'a_head_1', { rarity: 2 });
  const r3 = INV.sellJunk(s3, 1);
  ok(r3.count >= 1 && !INV.findItem(s3, c1.uid) && INV.findItem(s3, c2.uid) && INV.findItem(s3, c3.uid), '옛 sellJunk: 기준 이하·강화 안 한 것만');
  delete ITEMS.qa_hunt;
}

// ── 4. 되사기 ──
section('되사기');
{
  const st = fresh();
  for (let i = 0; i < 35; i++) INV.pushBuyback(st, makeItem('a_head_1'), 10 + i);
  ok(INV.buybackList(st).length === 30 && INV.buybackList(st)[0].price === 44, '최대 30개, 최근 것이 앞');
  const st2 = fresh();
  const it = makeItem('a_body_5', { rarity: 2 }); it.affixes = it.affixes ?? [];
  INV.pushBuyback(st2, it, 777);
  INV.buybackTick(st2); INV.buybackTick(st2);
  ok(INV.buybackList(st2).length === 1, '스테이지 2번 뒤에는 남아 있다');
  st2.gold = 100;
  ok(!INV.buyBack(st2, 0).ok, '골드 부족이면 못 산다');
  st2.gold = 1000;
  const r = INV.buyBack(st2, 0);
  ok(r.ok && st2.gold === 223 && INV.findItem(st2, it.uid)?.rarity === 2 && isDeepStrictEqual(INV.findItem(st2, it.uid).affixes, it.affixes), '판 값 그대로 되사기 · 같은 장비(희귀도·옵션)');
  ok(INV.buybackList(st2).length === 0, '되산 것은 목록에서 빠진다');
  INV.pushBuyback(st2, makeItem('a_head_1'), 5);
  INV.buybackTick(st2); INV.buybackTick(st2); INV.buybackTick(st2);
  ok(INV.buybackList(st2).length === 0, '스테이지 3번 지나면 사라진다');
  const st3 = fresh();
  INV.pushBuyback(st3, makeItem('a_head_1'), 5);
  while (INV.freeSlots(st3) > 0) INV.addItem(st3, makeItem('a_head_1'), { silent: true });
  ok(!INV.buyBack(st3, 0).ok && INV.buybackList(st3).length === 1, '가방이 가득 차면 못 산다 (목록 유지)');
}

// ── 5. 세이브 호환 ──
section('세이브 호환');
{
  const m0 = migrateSettings({ settingsVersion: 2 }).settings;
  ok(isDeepStrictEqual(m0.gear, { ...DEFAULT_SETTINGS.gear, keep: { ...DEFAULT_SETTINGS.gear.keep } }) && !Object.isFrozen(m0.gear), '옛 설정(gear 없음) → 기본값 (복사본)');
  ok(m0.gear.autoDispose === 'off', '자동 처분 기본 = 끔');
  const bad = migrateSettings({ settingsVersion: 2, gear: { autoDispose: 'burn', maxRarity: 4, weights: 'x', fixSpecial: 'y', keep: { enhanced: 'no', better: false } } }).settings.gear;
  ok(bad.autoDispose === 'off' && bad.maxRarity === 0 && bad.weights === 'bal' && bad.fixSpecial === true && bad.keep.enhanced === true && bad.keep.better === false, '잘못된 값은 항목별 기본값 (맞는 값은 유지)');
  const fut = { settingsVersion: 2, gear: { autoDispose: 'sell', maxRarity: 1, weights: 'def', fixSpecial: false, keep: { enhanced: false, better: true, other: true, special: true, future: 1 }, newKey: 'x' } };
  const m1 = migrateSettings(fut);
  ok(m1.settings.gear.newKey === 'x' && m1.settings.gear.keep.future === 1, '새 앱이 더한 항목은 보존');
  const m2 = migrateSettings(JSON.parse(JSON.stringify(m1.settings)));
  ok(isDeepStrictEqual(m2.settings.gear, m1.settings.gear) && !m2.changed, '멱등 (두 번째 이관은 바뀌는 것 없음)');
  ok(migrateSettings({ settingsVersion: 2, gear: 'nope' }).settings.gear.autoDispose === 'off', '객체가 아니면 기본값');
  ok(G.gearSettings({}).autoDispose === 'off' && G.gearSettings({ gear: { weights: 'atk' } }).weights === 'atk', 'gearSettings: 빠진 값은 기본');
  // 상태: 되사기·NEW 는 세이브에 남고, 옛 세이브(없음)는 빈 목록
  const st = fresh();
  const it = add(st, 'a_head_2'); it.isNew = true;
  INV.pushBuyback(st, makeItem('a_body_2'), 50);
  const back = JSON.parse(JSON.stringify(st));
  migrateState(back);
  ok(Array.isArray(back.buyback) && back.buyback.length === 1 && back.inventory.find((i) => i.uid === it.uid)?.isNew === true, 'migrateState 가 buyback·isNew 를 지우지 않는다 (옛 앱도 모르는 필드는 보존)');
  const old = JSON.parse(JSON.stringify(fresh()));
  delete old.buyback;
  migrateState(old);
  ok(INV.buybackList(old).length === 0 && Array.isArray(old.buyback), '옛 세이브 (buyback 없음) → 빈 목록');
  old.buyback = [{ item: { baseId: 'no_such' }, price: 1 }, 'x', null, { item: makeItem('a_head_1'), price: 9, left: 2 }];
  ok(INV.buybackList(old).length === 1, '알 수 없는 되사기 항목은 버린다');
}

console.log(`\n${fails ? '✗' : '✓'} test_gear_qol: ${passes} 통과, ${fails} 실패`);
process.exit(fails ? 1 : 0);
