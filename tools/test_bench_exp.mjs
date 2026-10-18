// 「함께 걷는 사냥꾼」 대기 헌터 경험치 나눔 시험 (S5 P4b, plan §5 P4 acceptance 4 · K4) — owner: S5 P4b
//
//   node tools/test_bench_exp.mjs                 노드만 (progression.addExpShared 규칙 · 퀘스트 보상 · 세이브 · 회차 · 소스 연결)
//   node tools/test_bench_exp.mjs --browser       + 브라우저 (기본 fold_open): 실제 월드에서 처치·퀘스트·연습·시련·악몽·결과 화면·헌터 교체
//        [--vp fold_open,phone2] [--shots DIR]
//
// 노드:
//   share      대기 헌터는 지금 영웅이 얻는 경험치의 50 % (소수점은 다음 획득으로 넘어가 합계가 정확히 절반)
//   cap        가장 높은 헌터 레벨 − 1 을 넘지 않는다 · 상한에 정확히 닿은 헌터는 0 · 한 번에 큰 보상도 상한에서 멈춘다 · MAX_LEVEL
//   catchup    5레벨 이상 낮으면 ×2 (= 100 %) · 4레벨 차이는 지난 상태 유지 · 3레벨 이내가 되면 꺼진다 · 큰 보상 한 번에 경계에서 ×1 로 바뀐다
//   excluded   아케이드 임시 세이브 · 보스 러시/서바이벌/연습/탑/마을 월드 · 시련(world.trial) · 악몽(world.opts.nightmare) · 다른 세이브의 월드 · ctx.temp
//   sp         대기 헌터 레벨업의 SP = spForLevel 규칙 (5의 배수 레벨 +2) · bus 'levelUp' 은 지금 영웅만
//   active     지금 영웅 쪽은 addExp 와 같다 (레벨·경험치·SP·levelUp 이벤트 수)
//   joined     상태가 없는 헌터(합류했지만 고른 적 없음)는 받지 않고 상태도 생기지 않는다 · 도중에 상태가 생긴 헌터는 그때부터 받는다
//   quest      claimQuest 의 보상 경험치도 나눈다 (out.benchExp · benchN)
//   ng         회차(state.ng) 세이브: ng 는 바뀌지 않는다 · 회차 이야기 월드에서도 나눈다 · startNgPlus 결과에 새 필드 없음
//   saves      옛 세이브(Stage 3/4 fixture): migrateState 결과에 새 필드 없음 · 나눔 뒤에도 세이브·영웅의 키 집합 그대로 (값만 바뀜)
//   ledger     결과 화면 합계(benchMark/benchSince) · 헌터 교체 「LEVEL UP」 배지(benchUnseen)
//   source     world.gainExp 와 quests.claimQuest 가 addExpShared 를 부른다 · 시련 gainExp no-op 그대로 · 결과 화면 경험치 줄 · 헌터 교체 꼬리표
// 종료 코드: 0 = 모두 통과, 1 = 실패
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const BROWSER = argv.includes('--browser');
const VPS = String(opt('vp', 'fold_open')).split(',').filter(Boolean);
const SHOTS = opt('shots', null);
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passes = 0, fails = 0;
const ok = (c, msg, detail) => { if (c) { passes++; console.log(`  ✓ ${msg}`); } else { fails++; console.log(`  ✗ ${msg}${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`); } };
const section = (t) => console.log(`\n${t}`);
const T0 = Date.now();

const P = await imp('src/game/progression.js');
const { expToNext, MAX_LEVEL } = await imp('src/game/stats.js');
const { bus } = await imp('src/core/events.js');
const S = await imp('src/game/state.js');
const NG = await imp('src/game/ngplus.js');

// ─────────── 도우미 ───────────
const W = (state, mode = 'story', extra = {}) => ({ mode, state, trial: null, opts: {}, get arcade() { return ['bossrush', 'survival', 'practice', 'tower'].includes(this.mode); }, ...extra });
function mkState(levels, charId = 'kael') {
  const st = S.newGameState({ slot: 3, charId });
  for (const [id, lv] of Object.entries(levels)) {
    const h = S.ensureHero(st, id);
    h.level = lv; h.exp = 0; h.sp = P.spForLevel(lv);
  }
  st.charId = charId;
  return st;
}
const keysDeep = (o, pre = '') => {
  const out = [];
  if (o && typeof o === 'object' && !Array.isArray(o)) for (const k of Object.keys(o).sort()) { out.push(pre + k); if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && pre.split('.').length < 3) out.push(...keysDeep(o[k], pre + k + '.')); }
  return out;
};
const totalExp = (h) => { let t = h.exp; for (let l = 1; l < h.level; l++) t += expToNext(l); return t; };
let lvEvents = [];
bus.on('levelUp', (d) => lvEvents.push(d?.charId));

// ═════════ 노드 ═════════
section('N1 share — 대기 헌터는 50 %');
{
  const st = mkState({ kael: 40, sera: 30, victor: 37 });   // sera 10 차이 → 따라잡기 / victor 3 차이 → ×1
  const v = st.heroes.victor, t0 = totalExp(v);
  let n = 0;
  for (let i = 0; i < 37; i++) { const g = 13 + (i % 5); n += g; P.addExpShared(st, g, st.heroes.kael, { world: W(st), source: 'kill' }); }
  const got = totalExp(v) - t0;
  ok(Math.abs(got - n * 0.5) <= 0.5 + 1e-9, `빅터(3레벨 아래) 받은 양 = 지금 영웅의 50 % (${got} / ${n})`, { got, half: n * 0.5 });
  const st2 = mkState({ kael: 40, victor: 38 });
  const r = P.addExpShared(st2, 1, st2.heroes.kael, { world: W(st2) });
  ok(r.benchExp === 0 && totalExp(st2.heroes.victor) === 0 + totalExp({ level: 38, exp: 0 }), '1 EXP 의 반(0.5)은 이번에 주지 않고 넘긴다', r);
  P.addExpShared(st2, 1, st2.heroes.kael, { world: W(st2) });
  ok(st2.heroes.victor.exp === 1, '다음 1 EXP 와 합쳐 1 (소수점 넘김)', st2.heroes.victor.exp);
}

section('N2 cap — 가장 높은 헌터 레벨 − 1');
{
  const st = mkState({ kael: 30, sera: 29 });
  const r = P.addExpShared(st, 5000, st.heroes.kael, { world: W(st) });
  ok(st.heroes.kael.level >= 30 && !r.bench.some((b) => b.charId === 'sera' && b.exp > 0) === (st.heroes.kael.level === 30), '상한(29)에 정확히 닿은 세라는 지금 영웅이 오르지 않으면 0', { kael: st.heroes.kael.level, r });
  const st2 = mkState({ kael: 30, sera: 29 });
  st2.heroes.sera.exp = 77;
  const r2 = P.addExpShared(st2, 100, st2.heroes.kael, { world: W(st2) });
  ok(st2.heroes.sera.level === 29 && st2.heroes.sera.exp === 77 && r2.benchExp === 0, '상한 레벨(29)의 경험치는 그대로, 받은 양 0', { sera: [st2.heroes.sera.level, st2.heroes.sera.exp], r2 });
  const st3 = mkState({ kael: 30, bran: 20 });
  P.addExpShared(st3, 9e6, st3.heroes.kael, { world: W(st3) });
  const top = Math.max(...Object.values(st3.heroes).map((h) => h.level));
  ok(st3.heroes.bran.level === top - 1 && st3.heroes.bran.exp === 0, `큰 보상 한 번: 브란은 가장 높은 레벨(${top}) − 1 에서 멈추고 넘친 몫은 버린다`, [st3.heroes.bran.level, st3.heroes.bran.exp]);
  const st4 = mkState({ kael: MAX_LEVEL, sera: MAX_LEVEL - 5 });
  P.addExpShared(st4, 9e7, st4.heroes.kael, { world: W(st4) });
  ok(st4.heroes.sera.level === MAX_LEVEL - 1 && st4.heroes.kael.level === MAX_LEVEL, `MAX_LEVEL(${MAX_LEVEL}) 영웅이 받아도 대기 헌터는 ${MAX_LEVEL - 1} 까지`, [st4.heroes.kael.level, st4.heroes.sera.level]);
  // 지금 영웅보다 높은 대기 헌터 (헌터 교체 뒤): 가장 높은 헌터 자신은 받지 않는다
  const st5 = mkState({ kael: 20, sera: 50 });
  const s0 = totalExp(st5.heroes.sera);
  P.addExpShared(st5, 3000, st5.heroes.kael, { world: W(st5) });
  ok(totalExp(st5.heroes.sera) === s0, '지금 영웅보다 높은(가장 높은) 대기 헌터는 0 — 대기만으로 최고 레벨이 오르지 않는다', totalExp(st5.heroes.sera) - s0);
  // 무작위 행진: 어느 때도 대기 헌터 ≤ 최고 − 1 (처음부터 그 아래였던 헌터)
  const st6 = mkState({ kael: 10, sera: 3, victor: 8, bran: 9, lia: 1, azel: 5 });
  let bad = null;
  for (let i = 0; i < 3000 && !bad; i++) {
    P.addExpShared(st6, 20 + ((i * 7919) % 400), st6.heroes.kael, { world: W(st6) });
    const t = st6.heroes.kael.level;
    for (const id of ['sera', 'victor', 'bran', 'lia', 'azel']) if (st6.heroes[id].level > t - 1) bad = { i, id, lv: st6.heroes[id].level, top: t };
  }
  ok(!bad, `3000번 획득 동안 대기 헌터 ≤ 최고 − 1 (지금 영웅 Lv.${st6.heroes.kael.level})`, bad);
}

section('N3 catchup — ≥5 켜짐, 3 이내 꺼짐, 4 는 유지');
{
  const st = mkState({ kael: 40, sera: 35 });   // 차이 5 → ×2
  const s = st.heroes.sera;
  ok(P.catchUpOn(st, s) === true, '차이 5: 따라잡기 켜짐');
  const t0 = totalExp(s);
  P.addExpShared(st, 100, st.heroes.kael, { world: W(st) });
  ok(totalExp(s) - t0 === 100, '차이 5 에서 100 EXP → 대기 100 (×2 = 100 %)', totalExp(s) - t0);
  // 레벨을 올려 차이 4 로: 켜진 채 유지
  s.exp = 0; s.level = 36;
  ok(P.catchUpOn(st, s) === true, '차이 4 (오르는 중): 유지 — 켜짐');
  const t1 = totalExp(s);
  P.addExpShared(st, 60, st.heroes.kael, { world: W(st) });
  ok(totalExp(s) - t1 === 60, '차이 4 (켜짐): 60 → 60', totalExp(s) - t1);
  // 차이 3 이 되는 레벨업: 그 레벨부터 ×1
  const st2 = mkState({ kael: 40, sera: 36 });
  const s2 = st2.heroes.sera;
  P.addExpShared(st2, 2, st2.heroes.kael, { world: W(st2) });   // 기억 없음 + 차이 4 → 꺼짐 (내려오는 쪽과 구별할 수 없다: 보수적으로 꺼짐)
  ok(P.catchUpOn(st2, s2) === false && s2.exp === 1, '기억 없는 차이 4 (앱을 다시 켠 뒤): 꺼짐, 2 → 1', [P.catchUpOn(st2, s2), s2.exp]);
  // 한 번에 여러 레벨: 지금 영웅을 MAX_LEVEL 로 두어 최고 레벨이 움직이지 않게 (L = MAX − 5)
  const L = MAX_LEVEL - 5;
  const st3 = mkState({ kael: MAX_LEVEL, sera: L });
  const s3 = st3.heroes.sera, needA = expToNext(L), needB = expToNext(L + 1);
  // L→L+1 은 ×2, L+1→L+2 는 ×2 (차이 4, 켜진 채), L+2 부터 ×1 (차이 3)
  const big = needA / 2 + needB / 2 + 1000;   // ×1 기준 몫
  P.addExpShared(st3, big * 2, st3.heroes.kael, { world: W(st3) });   // 대기 몫 = big
  const expL2 = s3.level === L + 2 ? s3.exp : null;
  ok(s3.level === L + 2 && Math.abs(expL2 - 1000) <= 1, `큰 보상 한 번: Lv.${L}→${L + 2} 은 ×2, 차이 3 이 된 뒤 남은 1000 은 ×1 (Lv.${L + 2} 경험치 ${expL2})`, [s3.level, s3.exp]);
  ok(P.catchUpOn(st3, s3) === false, '차이 3: 꺼짐');
  // 다시 벌어지면 (최고 레벨이 오름) 차이 4 는 꺼진 채, 5 에서 다시 켜짐
  const st4 = mkState({ kael: 40, sera: 37 });
  P.addExpShared(st4, 2, st4.heroes.kael, { world: W(st4) });   // 차이 3: 기억 = 꺼짐
  st4.heroes.kael.level = 41;
  ok(P.catchUpOn(st4, st4.heroes.sera) === false, '차이 4 (벌어지는 중): 꺼진 채');
  const g4 = totalExp(st4.heroes.sera);
  P.addExpShared(st4, 100, st4.heroes.kael, { world: W(st4) });
  ok(totalExp(st4.heroes.sera) - g4 === 50, '차이 4 (꺼짐): 100 → 50', totalExp(st4.heroes.sera) - g4);
  st4.heroes.kael.level = 42;
  ok(P.catchUpOn(st4, st4.heroes.sera) === true, '차이 5: 다시 켜짐');
}

section('N4 excluded — 아케이드 · 시련 · 악몽 · 임시 월드');
{
  const cases = [
    ['아케이드 임시 세이브 (state.arcade)', (st) => { st.arcade = { kind: 'bossrush' }; return { world: W(st, 'bossrush') }; }],
    ['아케이드 세이브 + 월드 없이 (퀘스트 경로)', (st) => { st.arcade = { kind: 'practice' }; return { source: 'quest' }; }],
    ['보스 러시 월드', (st) => ({ world: W(st, 'bossrush') })],
    ['서바이벌 월드', (st) => ({ world: W(st, 'survival') })],
    ['스테이지 연습 월드', (st) => ({ world: W(st, 'practice') })],
    ['무한의 탑 월드', (st) => ({ world: W(st, 'tower') })],
    ['마을 월드', (st) => ({ world: W(st, 'town') })],
    ['시련 (mode trial + world.trial)', (st) => ({ world: W(st, 'trial', { trial: { id: 'tr_kael_1' } }) })],
    ['악몽 (world.opts.nightmare)', (st) => ({ world: W(st, 'trial', { trial: { id: 'nm_s01', nightmare: true }, opts: { nightmare: { id: 'nm_s01', twist: 'bloodrain' } } }) })],
    ['이야기 모드라도 opts.nightmare', (st) => ({ world: W(st, 'story', { opts: { nightmare: { id: 'nm_s01' } } }) })],
    ['다른 세이브의 월드', (st) => ({ world: W({ heroes: {} }, 'story') })],
    ['ctx.temp', () => ({ temp: true })],
  ];
  for (const [name, mk] of cases) {
    const st = mkState({ kael: 30, sera: 20 });
    const ctx = mk(st);
    const s0 = totalExp(st.heroes.sera), k0 = totalExp(st.heroes.kael);
    const r = P.addExpShared(st, 500, st.heroes.kael, ctx);
    ok(totalExp(st.heroes.sera) === s0 && r.benchExp === 0 && totalExp(st.heroes.kael) === k0 + 500, `${name}: 대기 0 (지금 영웅은 500 그대로)`, { bench: totalExp(st.heroes.sera) - s0, r });
  }
  const st = mkState({ kael: 30, sera: 20 });
  ok(P.benchAllowed(st, { world: W(st, 'story') }) && P.benchAllowed(st, { source: 'quest' }), '이야기 월드 · 퀘스트(월드 없음)는 나눈다');
}

section('N5 sp · active — SP 규칙과 levelUp 이벤트');
{
  const st = mkState({ kael: 60, sera: 2, victor: 3 });
  lvEvents = [];
  const kHero = st.heroes.kael, kLv0 = kHero.level;
  P.addExpShared(st, 3e5, kHero, { world: W(st) });
  for (const id of ['sera', 'victor']) {
    const h = st.heroes[id];
    ok(h.level > 4 && h.sp === P.spForLevel(h.level), `${id}: Lv.${h.level} SP ${h.sp} = spForLevel(${h.level}) ${P.spForLevel(h.level)}`);
  }
  ok(lvEvents.length === kHero.level - kLv0 && lvEvents.every((c) => c === 'kael'), `bus 'levelUp' 은 지금 영웅만 (${lvEvents.length}번, 대기 헌터 0번)`, lvEvents.slice(0, 8));
  // 지금 영웅 쪽은 addExp 와 같다
  const a = mkState({ kael: 12 }), b = mkState({ kael: 12 });
  a.heroes.kael.exp = 33; b.heroes.kael.exp = 33;
  const ra = P.addExp(a.heroes.kael, 4321), rb = P.addExpShared(b, 4321, b.heroes.kael, { world: W(b) });
  ok(ra === rb.ups && a.heroes.kael.level === b.heroes.kael.level && a.heroes.kael.exp === b.heroes.kael.exp && a.heroes.kael.sp === b.heroes.kael.sp, '지금 영웅: addExpShared = addExp (레벨·경험치·SP·오른 수)', [ra, rb.ups]);
  const c = mkState({ kael: MAX_LEVEL });
  ok(P.addExpShared(c, 999, c.heroes.kael, { world: W(c) }).ups === 0 && c.heroes.kael.exp === 0, 'MAX_LEVEL 영웅: 경험치·레벨 그대로 (addExp 와 같음)');
  ok(P.addExpShared(c, NaN, c.heroes.kael).ups === 0 && P.addExpShared(c, -50, c.heroes.kael).ups === 0 && P.addExpShared(null, 5, null).ups === 0, '잘못된 입력(NaN · 음수 · null)은 던지지 않고 0');
}

section('N6 joined — 상태 없는 헌터 · 도중 합류');
{
  const st = mkState({ kael: 20 });
  st.progress.flags.boss_b_banshee = true;   // 리아 합류 깃발 — 상태는 아직 없다
  P.addExpShared(st, 5000, st.heroes.kael, { world: W(st) });
  ok(!st.heroes.lia && Object.keys(st.heroes).join() === 'kael', '합류했지만 고른 적 없는 리아: 상태가 생기지 않고 받지 않음', Object.keys(st.heroes));
  const lia = S.ensureHero(st, 'lia');   // 스테이지 도중 헌터 교체로 상태가 생김 (최고 − 3)
  const top = st.heroes.kael.level;
  ok(lia.level === Math.max(1, top - 3), `처음 고를 때 Lv.${lia.level} (최고 ${top} − 3)`);
  const l0 = totalExp(lia);
  P.addExpShared(st, 400, st.heroes.kael, { world: W(st) });
  ok(totalExp(lia) - l0 === 200, '그 뒤 획득부터 50 %', totalExp(lia) - l0);
  // 다른 영웅으로 교체한 뒤: 예전 영웅이 대기 헌터가 된다
  st.charId = 'lia';
  const k0 = totalExp(st.heroes.kael);
  P.addExpShared(st, 400, st.heroes.lia, { world: W(st) });
  ok(totalExp(st.heroes.kael) === k0, '교체 뒤 가장 높은 카엘(대기)은 0 (상한 = 자기 레벨 − 1)');
  const bench = P.benchHeroes(st).map((h) => h.charId);
  ok(bench.join() === 'kael', `benchHeroes = 상태가 있는 다른 헌터 (${bench.join()})`);
}

section('N7 quest — 퀘스트 보상도 나눈다');
{
  const Q = await imp('src/game/quests.js');
  const { QUESTS, QUEST_ORDER } = await imp('src/data/quests.js');
  const qid = QUEST_ORDER.find((id) => QUESTS[id].kind !== 'main' && (QUESTS[id].reward?.exp ?? 0) > 0 && QUESTS[id].goal?.type === 'killAny') ?? QUEST_ORDER.find((id) => (QUESTS[id].reward?.exp ?? 0) > 0 && QUESTS[id].goal?.type === 'killAny');
  const st = mkState({ kael: 30, sera: 22, victor: 28 });
  st.quests = { active: { [qid]: { n: 9999, t: 0 } }, done: [] };
  const s0 = totalExp(st.heroes.sera), v0 = totalExp(st.heroes.victor), k0 = totalExp(st.heroes.kael);
  const out = Q.claimQuest(st, qid);
  const exp = QUESTS[qid].reward.exp;
  ok(!!out && totalExp(st.heroes.kael) - k0 === exp, `「${QUESTS[qid].name}」 보상 EXP ${exp} → 지금 영웅`, out);
  ok(totalExp(st.heroes.victor) - v0 === Math.floor(exp / 2) && totalExp(st.heroes.sera) - s0 === exp, `빅터(차이 2) ${exp / 2} · 세라(차이 8, 따라잡기) ${exp}`, [totalExp(st.heroes.victor) - v0, totalExp(st.heroes.sera) - s0]);
  ok(out.benchN === 2 && out.benchExp === (totalExp(st.heroes.victor) - v0) + (totalExp(st.heroes.sera) - s0), `out.benchExp ${out.benchExp} · benchN ${out.benchN}`);
  const ar = mkState({ kael: 30, sera: 22 });
  ar.arcade = { kind: 'practice' };
  ar.quests = { active: { [qid]: { n: 9999, t: 0 } }, done: [] };
  const a0 = totalExp(ar.heroes.sera);
  Q.claimQuest(ar, qid);
  ok(totalExp(ar.heroes.sera) === a0, '아케이드 임시 세이브의 퀘스트 보상: 대기 0');
}

section('N8 ng — 회차 세이브');
{
  const fix = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/save_p2done.json'), 'utf8'));
  const st0 = S.migrateState(JSON.parse(JSON.stringify(fix)));
  const ng = NG.startNgPlus(st0, { slot: 3, now: 1760000000000 });
  const st = S.migrateState(ng);
  const ngBefore = JSON.stringify(st.ng);
  ok(NG.ngOf(st) === 1, `회차 세이브 (ngOf = ${NG.ngOf(st)})`);
  const k = st.heroes[st.charId], benchIds = P.benchHeroes(st).map((h) => h.charId);
  const before = Object.fromEntries(benchIds.map((id) => [id, totalExp(st.heroes[id])]));
  P.addExpShared(st, 8000, k, { world: W(st, 'story', { ng: 1 }) });
  ok(JSON.stringify(st.ng) === ngBefore, 'state.ng 는 한 글자도 바뀌지 않는다');
  const moved = benchIds.filter((id) => totalExp(st.heroes[id]) > before[id]);
  ok(moved.length > 0, `회차 이야기 월드에서도 나눈다 (${moved.join(',')})`);
  const next = NG.startNgPlus(st, { slot: 3, now: 1760000001000 });
  ok(keysDeep(next).join() === keysDeep(NG.startNgPlus(st0, { slot: 3, now: 1760000001000 })).join(), '나눔 뒤 startNgPlus 결과의 키 집합 = 나눔 전과 같다 (새 필드 없음)');
}

section('N9 saves — 옛 세이브 (Stage 3/4 fixture)');
{
  for (const f of ['save_v1.json', 'save_ch6_nocmp.json', 'save_p2done.json']) {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures', f), 'utf8'));
    const st = S.migrateState(JSON.parse(JSON.stringify(raw)));
    const k0 = keysDeep(st).join('|'), h0 = Object.fromEntries(Object.entries(st.heroes).map(([id, h]) => [id, Object.keys(h).sort().join()]));
    const ids = Object.keys(st.heroes);
    for (let i = 0; i < 30; i++) P.addExpShared(st, 700, st.heroes[st.charId], { world: W(st) });
    const h1 = Object.fromEntries(Object.entries(st.heroes).map(([id, h]) => [id, Object.keys(h).sort().join()]));
    ok(keysDeep(st).join('|') === k0 && JSON.stringify(h1) === JSON.stringify(h0) && Object.keys(st.heroes).join() === ids.join(), `${f}: 세이브·영웅의 키 그대로 (값만 바뀜, 헌터 ${ids.length}명)`);
    const again = S.migrateState(JSON.parse(JSON.stringify(st)));
    ok(JSON.stringify(again.heroes) === JSON.stringify(st.heroes), `${f}: 나눔 뒤 JSON 왕복 + migrateState → 영웅 그대로`);
    const re = S.migrateState(JSON.parse(JSON.stringify(raw)));
    ok(!/bench|catchUp|shared/i.test(JSON.stringify(re)), `${f}: 불러온 세이브에 나눔 관련 필드 없음`);
  }
}

section('N10 ledger — 결과 화면 합계 · 「LEVEL UP」 배지');
{
  P.benchUnseen(null, true);
  const st = mkState({ kael: 30, sera: 20, victor: 29 });
  const m = P.benchMark();
  let actv = 0;
  for (let i = 0; i < 20; i++) { P.addExpShared(st, 800, st.heroes.kael, { world: W(st) }); actv += 800; }
  const d = P.benchSince(m);
  ok(d.active === actv, `benchSince.active = 지금 영웅이 받은 합 ${actv}`, d.active);
  const sum = d.heroes.reduce((a, h) => a + h.exp, 0);
  ok(Math.abs(d.bench - sum) < 1e-6 && d.heroes.find((h) => h.charId === 'sera')?.catchUp === true, `benchSince: 합 ${d.bench} = 헌터별 합 · 세라 ×2 표시`, d);
  const un = P.benchUnseen();
  ok((un.sera ?? 0) === d.heroes.find((h) => h.charId === 'sera').ups && (un.sera ?? 0) > 0, `보지 않은 레벨업: 세라 ${un.sera}`, un);
  P.benchUnseen('sera', true);
  ok(P.benchUnseen('sera') === 0 && P.benchUnseen(null, true) && Object.keys(P.benchUnseen()).length === 0, '본 것으로 지우기 (한 명 · 모두)');
}

section('N11 source — 연결 지점');
{
  const w = src('src/game/world.js'), q = src('src/game/quests.js'), t = src('src/game/trial.js'), r = src('src/scenes/results.js'), p = src('src/scenes/town/party.js'), c = src('src/scenes/menu/common.js');
  ok(/gainExp\(n\) \{[\s\S]{0,700}addExpShared\(this\.state, n, this\.hero, \{ world: this \}\)/.test(w), 'world.gainExp → addExpShared(state, n, hero, { world })');
  ok(!/\baddExp\(/.test(w.replace(/addExpShared/g, '')), 'world.js 에 addExp 직접 호출 없음 (처치·보스 모두 gainExp → K4)');
  ok(/if \(!this\.trial\) \{[^}]*this\.gainExp\(expGain\);[^}]*this\.companions\?\.onKill\(e, expGain\);/.test(w), '처치 경로 그대로 (시련은 경험치 없음 — test_perks 의 같은 검사)');
  ok(/this\.gainExp\(Math\.round\(\(boss\.stats\.exp/.test(w), '보스 격파도 gainExp');
  ok(/addExpShared\(s, out\.exp, hero, \{ source: 'quest' \}\)/.test(q) && !/\baddExp\(/.test(q.replace(/addExpShared/g, '')), 'quests.claimQuest → addExpShared (메인·부가 퀘스트)');
  ok(/w\.gainExp = \(\) => 0;/.test(t), 'trial.js 의 gainExp no-op 그대로 (시련·악몽 경험치 0)');
  ok(/expSummary\(world, st, xp0\)/.test(r) && /대기 헌터 \$\{r\.n\}명/.test(r), '결과 화면: 경험치 줄 · 「대기 헌터 N명」');
  ok(/따라잡기 ×\$\{BENCH\.catchUp\}/.test(p) && /LEVEL UP/.test(p) && /skillAlert\(hero\)/.test(p), '헌터 교체: 「따라잡기 ×2」 · LEVEL UP · SP 배지');
  ok(/export function skillAlert\(hero, state = null\)/.test(c), 'skillAlert(hero, state): 대기 헌터 SP 합계 (bench)');
}
console.log(`\n  노드: ${passes} 통과 · ${fails} 실패 (${((Date.now() - T0) / 1000).toFixed(1)}초)`);

// ═════════ 브라우저 ═════════
async function until(s, fn, a, ms = 20000, step = 100) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await s.eval(fn, a); } catch (e) { if (!/context was destroyed|navigation/i.test(String(e?.message))) throw e; }
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await s.wait(step);
  }
}
async function browserSuite() {
  const { openEnv } = await imp('tools/qa/lib/server.mjs');
  const env = await openEnv();
  if (SHOTS) fs.mkdirSync(String(SHOTS), { recursive: true });
  try {
    for (const vp of VPS) {
      section(`B 브라우저 [${vp}]`);
      const s = await env.page(vp, 'index.html?scene=stage&stage=s01');
      try {
        await s.skipDialogue();
        // B1 실제 처치: 대기 헌터가 50 % · 따라잡기 100 %
        const B1 = await s.eval(async () => {
          const g = window.__game, st = g.state, w = g.world;
          const S = await import('/src/game/state.js');
          const P = await import('/src/game/progression.js');
          for (const id of ['sera', 'victor']) S.ensureHero(st, id);
          const set = (id, lv) => { const h = st.heroes[id]; h.level = lv; h.exp = 0; h.sp = P.spForLevel(lv); };
          set(st.charId, 12); set('sera', 4); set('victor', 10);
          const tot = (h) => { let t = h.exp; for (let l = 1; l < h.level; l++) t += Math.floor(30 * Math.pow(l, 1.65) + 20 * l); return t; };
          const before = { k: tot(st.heroes[st.charId]), s: tot(st.heroes.sera), v: tot(st.heroes.victor) };
          const foes = w.entities.filter((e) => e.kind === 'enemy' && e.stats?.exp > 0 && !e.dead && !e.boss);
          let n = 0;
          for (const e of foes.slice(0, 4)) { const kb = tot(st.heroes[st.charId]); w.onEnemyKilled(e, null); n += tot(st.heroes[st.charId]) - kb; }
          return { foes: foes.length, n, k: tot(st.heroes[st.charId]) - before.k, s: tot(st.heroes.sera) - before.s, v: tot(st.heroes.victor) - before.v, mode: w.mode, log: !!w.expLog };
        });
        ok(B1.n > 0 && B1.k === B1.n, `[${vp}] s01 실제 처치 ${Math.min(4, B1.foes)}마리: 지금 영웅 +${B1.k}`, B1);
        ok(Math.abs(B1.v - B1.n / 2) <= 1 && B1.s === B1.n, `[${vp}] 빅터(차이 2) +${B1.v} ≈ 50 % · 세라(차이 8) +${B1.s} = 100 %`, B1);
        ok(B1.log, `[${vp}] world.expLog (결과 화면 시작점) 생김`);
        // B2 연습 · 시련 · 악몽 월드: 대기 0
        const B2 = await s.eval(async () => {
          const g = window.__game, st = g.state;
          const { World } = await import('/src/game/world.js');
          const NMj = await import('/src/game/nightmare.js');
          const TR = await import('/src/game/trial.js');
          const tot = (h) => { let t = h.exp; for (let l = 1; l < h.level; l++) t += Math.floor(30 * Math.pow(l, 1.65) + 20 * l); return t; };
          const out = {};
          const keep = g.world;
          const probe = (name, mk) => {
            const s0 = tot(st.heroes.sera);
            let w = null, err = null;
            try { w = mk(); w.gainExp(500); } catch (e) { err = String(e); }
            out[name] = { bench: tot(st.heroes.sera) - s0, err, mode: w?.mode };
          };
          probe('practice', () => new World(g, 's01', { mode: 'practice' }));
          probe('bossrush', () => new World(g, 's01', { mode: 'bossrush' }));
          probe('trial', () => new World(g, 's01', { mode: 'trial', trial: { id: 'tr_x' } }));
          probe('nightmare', () => { const p = NMj.prepareNightmare(g, 'nm_s01'); return new World(g, p.stage, p.opts); });
          probe('nightmareAttached', () => { const p = NMj.prepareNightmare(g, 'nm_s01'); const w = new World(g, p.stage, p.opts); TR.attachTrial({ game: g }, w, p.T); return w; });
          g.world = keep;
          return out;
        });
        for (const [k, v] of Object.entries(B2)) ok(!v.err && v.bench === 0, `[${vp}] ${k} 월드 gainExp(500): 대기 0`, v);
        // B3 결과 화면: 경험치 줄 · 대기 헌터 줄
        await s.eval(() => { const g = window.__game; g.push('results', { world: g.world }); });
        await s.wait(300);
        await s.eval(() => { const t = window.__game.top; t.shownRows = t.rowCount; t.scoreShown = t.finalScore; t.rankShown = t.t; t.expT0 = t.t - 2; });
        await s.wait(900);
        const B3 = await s.eval(() => { const t = window.__game.top; return { top: t.name, rows: t.expRows, count: t.rowCount, base: t.rows.length }; });
        const hr = B3.rows?.find((r) => r.kind === 'hero'), br = B3.rows?.find((r) => r.kind === 'bench');
        ok(B3.top === 'results' && hr && hr.gained >= B1.n, `[${vp}] 결과 화면 경험치 줄: +${hr?.gained} EXP (Lv.${hr?.lv0}→${hr?.lv})`, B3);
        ok(br && br.n === 2 && br.exp >= B1.s + B1.v, `[${vp}] 「대기 헌터 ${br?.n}명 +${br?.exp} EXP」`, br);
        ok(B3.count === B3.base + 2, `[${vp}] 표 줄 수 6 + 2`, B3.count);
        if (SHOTS) await s.screenshot(path.join(String(SHOTS), `${vp}_results.png`));
        const errs = s.errs.filter((e) => !/favicon|ERR_FILE_NOT_FOUND|net::ERR_ABORTED/.test(e));
        ok(errs.length === 0, `[${vp}] 페이지 오류 0 (스테이지·결과)`, errs.slice(0, 5));
      } catch (e) { ok(false, `[${vp}] 브라우저 예외: ${e.message}`); } finally { await s.close(); }

      // B4 마을: 퀘스트 보상 나눔 · 헌터 교체 꼬리표 · skillAlert(bench)
      const s2 = await env.page(vp, 'index.html?scene=hub');
      try {
        await until(s2, () => window.__game.top?.name === 'hub' && window.__game.world?.mode === 'town', null, 30000);
        const B4 = await s2.eval(async () => {
          const g = window.__game, st = g.state;
          const S = await import('/src/game/state.js');
          const P = await import('/src/game/progression.js');
          const C = await import('/src/scenes/menu/common.js');
          for (const id of ['sera', 'victor', 'bran']) S.ensureHero(st, id);
          const set = (id, lv) => { const h = st.heroes[id]; h.level = lv; h.exp = 0; h.sp = P.spForLevel(lv) - 1; };   // 배울 SP 를 대부분 쓴 상태
          set(st.charId, 22); set('sera', 12); set('victor', 19); set('bran', 21);
          { const { migrateState } = await import('/src/game/state.js'); const m = migrateState(JSON.parse(JSON.stringify(st))); window.__keys0 = { top: Object.keys(m).sort().join(), heroes: Object.fromEntries(Object.entries(m.heroes).map(([k, h]) => [k, Object.keys(h).sort().join()])) }; }   // 나눔 전 저장 모양
          P.benchUnseen(null, true);
          const w = g.world;
          const town0 = st.heroes.sera.exp;
          w.gainExp(300);   // 마을 월드: 대기 0
          const town = st.heroes.sera.exp - town0;
          for (let i = 0; i < 4; i++) P.addExpShared(st, 2500, st.heroes[st.charId], { source: 'quest' });
          const a = C.skillAlert(st.heroes[st.charId], st);
          g.push('party', { world: w, from: 'hub' });
          return { town, lv: Object.fromEntries(Object.entries(st.heroes).map(([k, h]) => [k, h.level])), unseen: P.benchUnseen(), bench: a.bench, cu: { sera: P.catchUpOn(st, st.heroes.sera), victor: P.catchUpOn(st, st.heroes.victor) } };
        });
        ok(B4.town === 0, `[${vp}] 마을 월드 gainExp: 대기 0`);
        ok((B4.unseen.sera ?? 0) > 0 && B4.cu.sera === true && B4.cu.victor === false, `[${vp}] 퀘스트 보상 뒤: 세라 LEVEL UP ×${B4.unseen.sera} · 따라잡기 (세라 켜짐 · 빅터 꺼짐)`, B4);
        ok(B4.bench.n >= 1 && B4.bench.sp > 0, `[${vp}] skillAlert(hero, state).bench: 배울 스킬이 있는 대기 헌터 ${B4.bench.n}명 · SP ${B4.bench.sp}`, B4.bench);
        await until(s2, () => window.__game.top?.name === 'party', null, 5000);
        await s2.eval(() => { window.__game.top.index = 1; });
        await s2.wait(800);
        if (SHOTS) await s2.screenshot(path.join(String(SHOTS), `${vp}_party.png`));
        const B5 = await s2.eval(() => { const t = window.__game.top; return { top: t.name, unseen: t.unseen }; });
        ok(B5.top === 'party' && (B5.unseen?.sera ?? 0) > 0, `[${vp}] 헌터 교체 화면이 「LEVEL UP」 배지를 들고 있다`, B5);
        await s2.eval(() => window.__game.pop());
        await s2.wait(300);
        const B6 = await s2.eval(async () => { const P = await import('/src/game/progression.js'); return P.benchUnseen(); });
        ok(Object.keys(B6).length === 0, `[${vp}] 헌터 교체를 닫으면 배지는 본 것으로`, B6);
        // 세이브 쓰기 → 다시 읽기: 새 필드 없음
        const B7 = await s2.eval(async () => {
          const g = window.__game, st = g.state;
          const { isValidSave } = await import('/src/core/save.js');
          const { migrateState } = await import('/src/game/state.js');
          const json = JSON.stringify(st);   // saves.write 와 같은 직렬화 (이 디버그 부팅은 진짜 슬롯에 쓰지 않는다)
          const back = isValidSave(JSON.parse(json)) ? migrateState(JSON.parse(json)) : null;
          const backKeys = back?.heroes ? Object.fromEntries(Object.entries(back.heroes).map(([k, h]) => [k, Object.keys(h).sort().join()])) : null;
          const k0 = window.__keys0;
          return { same: JSON.stringify(k0.heroes) === JSON.stringify(backKeys) && k0.top === Object.keys(back ?? {}).sort().join(), bench: /bench|catchUp/i.test(JSON.stringify(back)), lv: back?.heroes?.sera?.level, ok: !!back };
        });
        ok(B7.ok && B7.same && !B7.bench, `[${vp}] 세이브 직렬화 → 읽기: 나눔 전과 같은 키 (세이브·영웅) · 나눔 필드 없음 (세라 Lv.${B7.lv})`, B7);
        const errs = s2.errs.filter((e) => !/favicon|ERR_FILE_NOT_FOUND|net::ERR_ABORTED/.test(e));
        ok(errs.length === 0, `[${vp}] 페이지 오류 0 (마을·헌터 교체)`, errs.slice(0, 5));
      } catch (e) { ok(false, `[${vp}] 브라우저 예외 (마을): ${e.message}`); } finally { await s2.close(); }
    }
  } finally { await env.close(); }
}
if (BROWSER) await browserSuite();
console.log(`\n${passes} 통과 · ${fails} 실패 (${((Date.now() - T0) / 1000).toFixed(1)}초)`);
process.exit(fails ? 1 : 0);
