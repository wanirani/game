// Stage 6 「사냥 일지」 시험 — node tools/test_hunt_journal.mjs (Node 만, 브라우저 없음)
//  - 뽑기: 같은 날 · 같은 진행 → 같은 계약, 날마다 바뀐다 · 깬 이야기 스테이지 · 가진 영웅 · 쓰러뜨린 보스의 악몽만
//  - 진행: 이야기 판만 (아케이드·탑·시련 X) · 처치 · 촛대 · 불굴(쓰러짐 0) · 지명 영웅 · 질주(시간) · AUTO 판 솜씨 계약 X · 악몽 토벌
//  - 보상: 한 번만 · 골드·강화석·경험치·일지 점수 · 등급 상승 · 보상 크기가 같은 장 의뢰 규모 안
//  - 날·주 바뀜: 새 일일 계약 · 달성했지만 받지 않은 계약은 남는다 · 주간은 같은 주 동안 그대로
//  - 옛 세이브: hunt 없음 · 깨진 hunt → 빈 일지, 예외 없음 · JSON 왕복 · 아케이드 임시 세이브에는 만들지 않는다
//  - K1 장부: { hj: n } (슬롯 중 최대 점수, 아케이드 제외) · 잔상 tr_hunter = 등급 「명사냥꾼」 점수
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const H = await imp('src/game/hunt_journal.js');
const D = await imp('src/data/hunt_journal.js');
const S = await imp('src/game/state.js');
const C = await imp('src/data/cosmetics.js');
const { STAGES } = await imp('src/data/stages.js');
const { NM } = await imp('src/data/nightmare.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const DAY = new Date(2026, 9, 31, 12, 0);           // 토요일
const NEXT = new Date(2026, 10, 1, 9, 0);           // 일요일 (같은 주)
const MON = new Date(2026, 10, 2, 9, 0);            // 월요일 (다음 주)
function fresh(cleared = ['s01', 's02', 's03', 's04'], { bosses = [], heroes = [] } = {}) {
  const s = S.newGameState({});
  for (const id of cleared) s.progress.cleared[id] = { rank: 'B', time: 300, score: 1000 };
  s.progress.bosses.push(...bosses);
  for (const h of heroes) S.ensureHero(s, h);
  return s;
}
const clone = (o) => JSON.parse(JSON.stringify(o));

test('뽑기: 같은 날 같은 계약 · 날마다 바뀜 · 3장 + 주간 1장', () => {
  const day = H.huntDay(DAY);
  const a = H.rollDaily(fresh(), day), b = H.rollDaily(fresh(), day);
  assert.equal(a.length, D.HUNT_DAILY);
  assert.deepEqual(a, b, '같은 날 · 같은 진행 → 같은 계약');
  const keys = new Set();
  for (let d = 0; d < 10; d++) keys.add(JSON.stringify(H.rollDaily(fresh(), day + d).map((c) => [c.kind, c.stage, c.enemy ?? c.n ?? c.t ?? c.hero ?? ''])));
  assert.ok(keys.size >= 8, `10일 중 다른 뽑기 ${keys.size}`);
  const s = fresh();
  const list = H.huntList(s, DAY);
  assert.equal(list.length, 4);
  assert.equal(list[0].c.slot, 'w', '주간 먼저');
  assert.deepEqual(H.huntList(s, DAY).map((e) => e.c.id), list.map((e) => e.c.id), '다시 열어도 그대로');
  assert.equal(new Set(list.map((e) => e.c.id)).size, 4, 'id 겹침 없음');
  for (const e of list) { assert.ok(H.huntGoalText(e.c).length > 4, '목표 글'); assert.ok(D.huntTitle(e.c).length >= 4, '제목'); }
});

test('자격: 깬 이야기 스테이지 · 가진 영웅 · 쓰러뜨린 보스의 악몽만', () => {
  assert.deepEqual(H.huntList(S.newGameState({}), DAY), [], '새 세이브 → 계약 없음');
  const s0 = fresh(['s01', 'arena']);
  for (let d = 0; d < 30; d++) for (const c of H.rollDaily(s0, 20000 + d)) assert.equal(c.stage, 's01', '깬 스테이지만 (투기장 제외)');
  const s = fresh(['s01', 's02', 's05'], { heroes: ['lia'] });
  const el = H.huntEligible(s);
  assert.deepEqual(el.stages, ['s01', 's02', 's05']);
  assert.deepEqual(el.heroes, ['kael', 'lia']);
  for (let d = 0; d < 60; d++) for (const c of H.rollDaily(s, 20000 + d)) {
    assert.ok(el.stages.includes(c.stage));
    if (c.kind === 'hero') assert.ok(el.heroes.includes(c.hero), '가진 영웅만');
    if (c.kind === 'kill') assert.ok(STAGES[c.stage].enemies.includes(c.enemy) && c.enemy !== 'mimic', '그 스테이지 적');
  }
  const one = fresh(['s01']);
  for (let d = 0; d < 40; d++) for (const c of H.rollDaily(one, 20000 + d)) assert.notEqual(c.kind, 'hero', '영웅 하나 → 지명 계약 없음');
  // 주간: 악몽은 이야기에서 쓰러뜨린 보스 줄만 · 없으면 순회
  assert.equal(H.rollWeekly(fresh(['s01'], { bosses: [] }), 3000).kind, 'nm', '깬 스테이지 = 악몽 자격 (nmBeaten 과 같은 규칙)');
  const nmOnly = fresh(['s01', 's02'], { bosses: ['b_banshee'] });
  for (let w = 0; w < 20; w++) { const c = H.rollWeekly(nmOnly, 3000 + w); assert.ok(['nm_s01', 'nm_s02'].includes(c.nm)); assert.equal(c.stage, NM[c.nm].stage); }
  const s4 = S.newGameState({}); s4.progress.cleared.arena = { rank: 'B' };
  assert.equal(H.rollWeekly(s4, 3000), null, '이야기 스테이지 없음 → 주간 없음');
  const ar = fresh(); ar.arcade = true;
  assert.deepEqual(H.huntList(ar, DAY), [], '아케이드 임시 세이브');
  assert.equal(ar.hunt, undefined, '아케이드 세이브에는 hunt 를 만들지 않는다');
});

/** 계약을 직접 넣은 세이브 */
function withPicks(picks) {
  const s = fresh(['s01', 's02', 's03'], { heroes: ['lia'] });
  H.syncHunt(s, DAY);
  s.hunt.picks = picks.map((c, i) => ({ id: `d${H.huntDay(DAY)}_${i}`, slot: 'd', lv: STAGES[c.stage ?? 's01'].level, ...c }));
  s.hunt.prog = {}; s.hunt.claimed = [];
  return s;
}
const prog = (s, i) => H.huntProgressOf(s, s.hunt.picks[i]);

test('진행: 처치 · 촛대 — 이야기 판만, 그 스테이지 · 그 적만', () => {
  const s = withPicks([{ kind: 'kill', stage: 's01', enemy: 'zombie', n: 3 }, { kind: 'candle', stage: 's02', n: 2 }]);
  const kill = (stageId, id, story = true) => H.huntEvent(s, 'enemyKilled', { def: { id }, stageId, byPlayer: true }, { story });
  kill('s01', 'zombie', false); kill('s01', 'bat'); kill('s02', 'zombie');
  assert.equal(prog(s, 0).cur, 0, '아케이드·탑·시련 · 다른 적 · 다른 스테이지는 세지 않는다');
  kill('s01', 'zombie'); kill('s01', 'zombie');
  assert.equal(prog(s, 0).cur, 2);
  const done = kill('s01', 'zombie');
  assert.equal(done.length, 1, '처음 달성 → 알림 1');
  assert.equal(kill('s01', 'zombie').length, 0, '달성 뒤 다시 알리지 않는다');
  assert.equal(prog(s, 0).cur, 3);
  H.huntEvent(s, 'candleBroken', { stageId: 's02' }, { story: false });
  H.huntEvent(s, 'candleBroken', { stageId: 's01' }, { story: true });
  assert.equal(prog(s, 1).cur, 0);
  H.huntEvent(s, 'candleBroken', { stageId: 's02' }, { story: true }); H.huntEvent(s, 'candleBroken', { stageId: 's02' }, { story: true });
  assert.ok(prog(s, 1).done);
});

test('진행: 불굴 (쓰러짐 0) · 지명 영웅 · 질주 · AUTO · 악몽 · 순회', () => {
  const s = withPicks([{ kind: 'boss', stage: 's01' }, { kind: 'hero', stage: 's02', hero: 'lia' }, { kind: 'swift', stage: 's03', t: 300 }]);
  const boss = (stageId, extra = {}, o = { story: true }) => H.huntEvent(s, 'bossKilled', { bossId: STAGES[stageId].boss, stageId, mode: 'story', charId: 'kael', ...extra }, o);
  H.huntEvent(s, 'stageEntered', { stageId: 's01' }); H.huntEvent(s, 'playerDied', {});
  boss('s01');
  assert.equal(prog(s, 0).done, false, '쓰러진 판 → 불굴 X');
  H.huntEvent(s, 'stageEntered', { stageId: 's01' });
  boss('s01', {}, { story: true, auto: true });
  assert.equal(prog(s, 0).done, false, 'AUTO 판 → X');
  boss('s01', { mode: 'practice' });
  assert.equal(prog(s, 0).done, false, '연습 모드 → X');
  boss('s01');
  assert.equal(prog(s, 0).done, true);
  boss('s02');
  assert.equal(prog(s, 1).done, false, '다른 영웅 → X');
  boss('s02', { charId: 'lia' });
  assert.equal(prog(s, 1).done, true, '리아로 처치');
  H.huntEvent(s, 'stageCleared', { stageId: 's03', time: 301 });
  H.huntEvent(s, 'stageCleared', { stageId: 's03', time: 200, assisted: true });
  assert.equal(prog(s, 2).done, false, '시간 초과 · AUTO');
  H.huntEvent(s, 'stageCleared', { stageId: 's03', time: 299.5 });
  assert.equal(prog(s, 2).done, true);
  const w = withPicks([{ kind: 'nm', nm: 'nm_s02', stage: 's02', slot: 'w' }, { kind: 'sweep', n: 2, slot: 'w' }]);
  H.huntEvent(w, 'nightmareCleared', { id: 'nm_s01' });
  assert.equal(prog(w, 0).done, false);
  H.huntEvent(w, 'nightmareCleared', { id: 'nm_s02' });
  assert.equal(prog(w, 0).done, true);
  H.huntEvent(w, 'stageCleared', { stageId: 's01', time: 999 }); H.huntEvent(w, 'stageCleared', { stageId: 's02', time: 999 });
  assert.equal(prog(w, 1).done, true, '순회: 이야기 스테이지 2곳');
});

test('보상: 한 번만 · 골드·강화석·경험치·점수 · 등급 상승', () => {
  const s = withPicks([{ kind: 'kill', stage: 's03', enemy: 'bat', n: 1 }, { kind: 'candle', stage: 's01', n: 5 }]);
  assert.equal(H.claimHunt(s, s.hunt.picks[1].id), null, '미달성 → 받을 수 없다');
  H.huntEvent(s, 'enemyKilled', { def: { id: 'bat' }, stageId: 's03' }, { story: true });
  const gold0 = s.gold, hero = s.heroes[s.charId], xp0 = hero.exp + hero.level * 1e6;
  const c = s.hunt.picks[0], rw = D.huntReward(c);
  const out = H.claimHunt(s, c.id);
  assert.ok(out);
  assert.equal(s.gold, gold0 + rw.gold);
  assert.equal(out.pts, D.HUNT_PTS.daily);
  assert.equal(s.hunt.pts, D.HUNT_PTS.daily);
  assert.ok(hero.exp + hero.level * 1e6 > xp0, '경험치');
  assert.ok(s.inventory.some((it) => it.baseId === rw.items[0].id), '강화석');
  assert.equal(H.claimHunt(s, c.id), null, '두 번 받기 X');
  assert.equal(s.gold, gold0 + rw.gold);
  assert.equal(H.claimHunt(s, 'd1_9'), null, '없는 계약');
  // 등급
  s.hunt.pts = 45;
  const s2 = withPicks([{ kind: 'candle', stage: 's01', n: 1 }]); s2.hunt.pts = 45;
  H.huntEvent(s2, 'candleBroken', { stageId: 's01' }, { story: true });
  const o2 = H.claimHunt(s2, s2.hunt.picks[0].id);
  assert.equal(o2.rankUp, true); assert.equal(D.HUNT_RANKS[o2.rank].name, '사냥꾼');
  assert.equal(D.huntRankOf(0), 0); assert.equal(D.huntRankOf(799), 4); assert.equal(D.huntRankOf(800), 5); assert.equal(D.huntRankOf(NaN), 0);
  // 보상 크기: 같은 장 의뢰(data/quests.js) 규모 안 — 1장 일일 ≤ 500 G, 12장 일일 ≤ 3,000 G, 주간 ≤ 일일 3배
  assert.ok(D.huntReward({ lv: 1, slot: 'd' }).gold <= 500);
  assert.ok(D.huntReward({ lv: 36, slot: 'd' }).gold <= 3000);
  const dd = D.huntReward({ lv: 30, slot: 'd' }), ww = D.huntReward({ lv: 30, slot: 'w' });
  assert.ok(ww.gold <= dd.gold * 3 && ww.exp <= dd.exp * 3 && ww.pts === D.HUNT_PTS.weekly);
});

test('날·주 바뀜: 새 일일 · 받지 않은 달성 계약은 남음 · 주간은 같은 주 그대로', () => {
  const s = fresh(['s01', 's02', 's03', 's04', 's05']);
  const l0 = H.huntList(s, DAY);
  const d0 = l0.filter((e) => e.c.slot === 'd'), wk = l0.find((e) => e.c.slot === 'w');
  s.hunt.prog[d0[0].c.id] = D.huntNeed(d0[0].c);         // 달성 (받지 않음)
  s.hunt.prog[d0[1].c.id] = 0.5 * D.huntNeed(d0[1].c);   // 진행 중
  s.hunt.prog[d0[2].c.id] = D.huntNeed(d0[2].c); s.hunt.claimed.push(d0[2].c.id);   // 받음
  const l1 = H.huntList(s, NEXT);
  const ids = l1.map((e) => e.c.id);
  assert.ok(ids.includes(d0[0].c.id), '받지 않은 달성 계약은 남는다');
  assert.ok(!ids.includes(d0[1].c.id) && !ids.includes(d0[2].c.id), '미달성 · 받은 계약은 지운다');
  assert.equal(l1.find((e) => e.c.id === d0[0].c.id).old, true);
  assert.equal(l1.filter((e) => e.c.slot === 'd' && !e.old).length, 3, '새 일일 3');
  assert.ok(ids.includes(wk.c.id), '같은 주 → 주간 그대로');
  assert.equal(s.hunt.prog[d0[1].c.id], undefined, '진행 기록 정리');
  assert.ok(!s.hunt.claimed.includes(d0[2].c.id));
  assert.ok(H.claimHunt(s, d0[0].c.id), '지난 계약도 받을 수 있다');
  const l2 = H.huntList(s, MON);
  assert.ok(!l2.some((e) => e.c.id === wk.c.id), '월요일 → 새 주간');
  assert.equal(l2.filter((e) => e.c.slot === 'w').length, 1);
  assert.equal(H.huntWeek(H.huntDay(DAY)), H.huntWeek(H.huntDay(NEXT)));
  assert.equal(H.huntWeek(H.huntDay(MON)), H.huntWeek(H.huntDay(NEXT)) + 1);
  // 처음 깬 날: 계약이 없던 날에 스테이지를 깨면 그날 안에 열린다
  const n = S.newGameState({});
  assert.equal(H.huntList(n, DAY).length, 0);
  n.progress.cleared.s01 = { rank: 'C' };
  assert.equal(H.huntList(n, DAY).length, 4, '같은 날 다시 열면 생긴다');
  const left = H.huntTimeLeft(new Date(2026, 9, 31, 23, 30));
  assert.equal(Math.round(left.day), 1800); assert.equal(Math.round(left.week), 1800 + 86400);
});

test('옛 세이브: hunt 없음 · 깨진 hunt → 빈 일지 · JSON 왕복 · migrateState', () => {
  const old = clone(fresh());
  delete old.hunt;
  const m = S.migrateState(clone(old));
  assert.equal(m.hunt, undefined, '불러오기만으로는 만들지 않는다');
  assert.equal(H.huntList(m, DAY).length, 4);
  for (const bad of ['x', 7, [], null]) {
    const s = clone(old); s.hunt = bad;
    const mm = S.migrateState(s);
    assert.equal(mm.hunt, undefined, `깨진 hunt ${JSON.stringify(bad)} → 없음`);
    assert.doesNotThrow(() => H.huntList(mm, DAY));
  }
  const s = clone(old);
  s.hunt = { day: 'x', week: null, picks: [null, 5, { id: 'd1_0', slot: 'd', kind: 'kill', stage: 'nope', enemy: 'bat', n: 3 }, { id: 'd1_1', slot: 'd', kind: 'candle', stage: 's01', n: 2, lv: 1 }, { id: 'd1_1', slot: 'd', kind: 'candle', stage: 's01', n: 2 }], prog: { a: 'x', d1_1: -1 }, claimed: [1, 'z', 'z'], pts: -5 };
  const h = H.ensureHunt(s);
  assert.equal(h.day, null); assert.equal(h.pts, 0);
  assert.deepEqual(h.picks.map((c) => c.id), ['d1_1'], '모르는 스테이지 · 겹친 id 버림');
  assert.deepEqual(h.prog, {}); assert.deepEqual(h.claimed, ['z']);
  assert.doesNotThrow(() => H.huntSummary(s, DAY));
  const rt = S.migrateState(clone(s));
  assert.deepEqual(H.huntList(rt, DAY).map((e) => e.c.id), H.huntList(s, DAY).map((e) => e.c.id), 'JSON 왕복 뒤 같은 계약');
  // 더 새 클라이언트가 붙인 모르는 필드는 남긴다
  rt.hunt.future = { a: 1 }; H.ensureHunt(rt); assert.deepEqual(rt.hunt.future, { a: 1 });
});

test('K1 장부: { hj } · 잔상 「사냥꾼」 = 명사냥꾼 점수', () => {
  const hunter = C.TRAIL_IDS.filter((id) => typeof C.TRAILS[id].need?.hj === 'number');
  assert.deepEqual(hunter, ['tr_hunter']);
  assert.equal(C.TRAILS.tr_hunter.need.hj, D.HUNT_RANKS[D.HUNT_TRAIL_RANK].pts);
  assert.equal(D.HUNT_RANKS[D.HUNT_TRAIL_RANK].name, '명사냥꾼');
  assert.equal(C.cosContext({}, []).hj, 0);
  assert.equal(C.cosContext({}, [null, 7, { hunt: 'x' }, { hunt: { pts: '900' } }, { hunt: { pts: NaN } }]).hj, 0, '깨진 값 → 0');
  assert.equal(C.cosContext({}, [{ hunt: { pts: 120 } }, { hunt: { pts: 510 } }, { arcade: true, hunt: { pts: 2000 } }]).hj, 510, '슬롯 중 최대 · 아케이드 제외');
  assert.equal(C.ownsTrail('tr_hunter', C.cosContext({}, [{ hunt: { pts: 499 } }])), false);
  assert.equal(C.ownsTrail('tr_hunter', C.cosContext({}, [{ hunt: { pts: 500 } }])), true);
  assert.equal(C.ownsTrail('tr_hunter', { got: {}, tower: 0, ng: 0 }), false, '화면 예비 문맥 (hj 없음)');
  const nt = C.needText({ hj: 500 });
  assert.ok(nt.short.includes('500') && nt.long.includes('사냥 일지'));
});

let pass = 0, fail = 0;
for (const t of tests) {
  try { await t.fn(); pass++; console.log(`✓ ${t.name}`); }
  catch (e) { fail++; console.log(`✗ ${t.name}\n  ${String(e?.stack ?? e).split('\n').slice(0, 4).join('\n  ')}`); }
}
console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
