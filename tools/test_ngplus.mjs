// 회차 플레이 「피의 윤회」 시험 (docs/specs/ngplus.md §10.1, NG-CORE)
//   node tools/test_ngplus.mjs [--only N3,N5] [--browser] [--ui]
//   N1 규칙 · N2 여는 조건 · N3 넘기기 · N4 이관(퍼징) · N5 세기 · N6 마을 · N7 지난 회차 · N10 연습 목록 · N11 업적 요약 · N12 점수 줄 — 브라우저 없이 (< 20초)
//   --browser : N8 월드 (?ng= 디버그 세이브 → world.ng·적 레벨·배율·배너·보스 강화 패턴) · N9 아케이드 무관 (tools/qa/lib/server.mjs openEnv)
//   --ui      : NG-UI 의 헤드리스 시험 tools/qa/ngplus_ui.mjs (export default async function run(opts)) 도 돌린다 (§10.2 U1–U8)
// N10 · N11 · N12 는 NG-SYNC · NG-UI 코드의 계약 시험이다 (그쪽 훅이 없으면 실패로 알린다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const T0 = Date.now();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const argv = process.argv.slice(2);
const onlyArg = argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg ? new Set((onlyArg.includes('=') ? onlyArg.split('=')[1] : argv[argv.indexOf(onlyArg) + 1] ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)) : null;
const BROWSER = argv.includes('--browser');
const UI = argv.includes('--ui');
const want = (id) => !ONLY || ONLY.has(id);

const NG = await imp('src/game/ngplus.js');
const { newGameState, migrateState } = await imp('src/game/state.js');
const { isValidSave, saves } = await imp('src/core/save.js');
const { STAGES, STAGE_ORDER } = await imp('src/data/stages.js');
const { DIFF, DIFFICULTIES, getDiff } = await imp('src/data/difficulty.js');
const { ITEMS } = await imp('src/data/items.js');
const { enemyStats } = await imp('src/game/enemy.js');
let serverValid = null;
try { serverValid = (await imp('netlify/lib/validate.mts')).isValidSave; } catch (e) { console.log('  (서버 isValidSave 를 불러오지 못함: ' + e.message.split('\n')[0] + ')'); }

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
const section = (t) => console.log('▶ ' + t);
const bytes = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8');
const isKey = (it) => ITEMS[it?.baseId]?.slot === 'key';
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/save_p2done.json'), 'utf8'));
const V1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/save_v1.json'), 'utf8'));
const NOW = 1760000000000;
const mig = (s) => quiet(() => migrateState(s));
/** 고정 세이브 → 새 회차 (원본 바이트는 그대로) */
const ngFrom = (s, opts = {}) => NG.startNgPlus(mig(clone(s)), { slot: s.slot, now: NOW, ...opts });
const STORY = STAGE_ORDER.filter((id) => STAGES[id] && id !== 'arena');

// ═════════ N1 규칙 ═════════
if (want('N1')) {
  section('N1 규칙 (NG_RULES · ngStageLevel · ngComp · ngLabel)');
  const R = NG.NG_RULES;
  ok(R && R.cap === 3 && isDeepStrictEqual(R.comp, { hp: 2.5, atk: 1.0, ref: 46 }), 'NG_RULES.cap 3 · comp {hp 2.5, atk 1.0, ref 46}');
  ok(isDeepStrictEqual(R.limits, { enemyHp: 4.0, enemyAtk: 3.0, bossHp: 3.6, aggro: 1.8, elite: 0.35, level: 99 }), `NG_RULES.limits §3.2 (${JSON.stringify(R.limits)})`);
  ok(isDeepStrictEqual(Object.keys(R.cycles), ['1', '2', '3']), 'cycles 1·2·3');
  const F = ['base', 'k', 'hp', 'atk', 'bossHp', 'aggro', 'elite', 'drop'];
  for (const n of [1, 2, 3]) ok(F.every((k) => Number.isFinite(R.cycles[n]?.[k])), `cycles[${n}] 에 ${F.join(' ')}`);
  for (const k of ['base', 'hp', 'atk', 'bossHp', 'aggro', 'elite', 'drop']) ok(R.cycles[1][k] <= R.cycles[2][k] && R.cycles[2][k] <= R.cycles[3][k], `${k} 가 회차 1→3 에서 줄지 않음`);
  ok(isDeepStrictEqual(NG.NG_LIMITS, { nMax: 9, histMax: 10, pastBytes: 24576 }), 'NG_LIMITS {9, 10, 24576}');
  const TABLE = { 1: [70, 84, 92, 93], 2: [78, 92, 98, 99], 3: [82, 94, 99, 99] };
  for (const n of [1, 2, 3]) {
    const got = ['s01', 's13', 's20', 's22'].map((id) => NG.ngStageLevel(STAGES[id], n));
    ok(isDeepStrictEqual(got, TABLE[n]), `§3.2 적 레벨 ${n + 1}회차 s01/s13/s20/s22 = ${TABLE[n].join('/')} (지금 ${got.join('/')})`);
  }
  let bad = [];
  for (const id of STORY) for (let n = 1; n <= 9; n++) {
    const L = STAGES[id].level, E = NG.ngStageLevel(STAGES[id], n);
    if (!(Number.isInteger(E) && L <= E && E <= 99)) bad.push(`${id}×${n}=${E}`);
    if (n > 3 && E !== NG.ngStageLevel(STAGES[id], 3)) bad.push(`${id}×${n}≠n3`);
  }
  ok(!bad.length, `모든 스토리 스테이지 × n 1..9: L ≤ E ≤ 99, n ≥ 3 은 n = 3 과 같음 ${bad.slice(0, 6).join(' ')}`);
  ok(STORY.every((id) => NG.ngStageLevel(STAGES[id], 0) === STAGES[id].level), 'n = 0 → stage.level');
  ok(NG.ngComp(46, 2.5) === 1 && NG.ngComp(60, 2.5) === 1 && NG.ngComp(99, 1) === 1, 'comp(L ≥ 46) = 1');
  ok(Math.abs(NG.ngComp(1, 2.5) - 3.5) < 1e-12 && Math.abs(NG.ngComp(1, 1.0) - 2.0) < 1e-12, 'comp(1) = ×3.5 (hp) / ×2.0 (atk)');
  ok(NG.ngLabel(0) === '' && NG.ngLabel(1) === '2회차' && NG.ngLabel(9) === '10회차' && NG.ngLabel(null) === '' && NG.ngLabel(2.5) === '', "ngLabel: 0 → '', 1 → '2회차', 9 → '10회차'");
}

// ═════════ N2 여는 조건 ═════════
if (want('N2')) {
  section('N2 여는 조건 (canStartNg · ngOf)');
  const fresh = newGameState({ slot: 1 });
  const withFlags = (f) => { const s = clone(fresh); Object.assign(s.progress.flags, f); return s; };
  ok(NG.canStartNg(fresh) === false, '새 게임 거짓');
  ok(NG.canStartNg(withFlags({ p2_done: true })) === true, 'p2_done 참');
  ok(NG.canStartNg(withFlags({ ending_p2true: true })) === true, 'ending_p2true 만 참');
  ok(NG.canStartNg(withFlags({ ending_p2: true })) === true, 'ending_p2 만 참');
  ok(NG.canStartNg(withFlags({ ending_true: true, ending_normal: true, relics_all: true })) === false, '1부 엔딩만 거짓');
  const ar = withFlags({ p2_done: true }); ar.arcade = { kind: 'practice' };
  ok(NG.canStartNg(ar) === false, 'state.arcade 거짓');
  const n9 = withFlags({ p2_done: true }); n9.ng = { v: 1, n: 9, at: 0, hist: [], past: {} };
  ok(NG.canStartNg(n9) === false, 'n = 9 거짓');
  const n8 = withFlags({ p2_done: true }); n8.ng = { v: 1, n: 8, at: 0, hist: [], past: {} };
  ok(NG.canStartNg(n8) === true, 'n = 8 참');
  ok(NG.canStartNg(FIX) === true, '고정 세이브 save_p2done 참');
  ok([null, undefined, 3, 'x', [], {}].every((v) => NG.canStartNg(v) === false && NG.ngOf(v) === 0), '손상 입력 → 거짓 · ngOf 0 (던지지 않음)');
  const ngv = (n, extra = {}) => ({ ...clone(fresh), ...extra, ng: { v: 1, n } });
  ok(NG.ngOf(ngv(2)) === 2 && NG.ngOf(ngv(12)) === 9 && NG.ngOf(ngv(0)) === 0 && NG.ngOf(ngv(-1)) === 0 && NG.ngOf(ngv(2.5)) === 0 && NG.ngOf(ngv('2')) === 0, 'ngOf: 정수 n ≥ 1 만 (≤ 9)');
  ok(NG.ngOf(ngv(3, { arcade: { kind: 'tower' } })) === 0, 'ngOf: 아케이드 임시 세이브 → 0');
}

// ═════════ N3 넘기기 ═════════
if (want('N3')) {
  section('N3 넘기기 (startNgPlus, tools/fixtures/save_p2done.json)');
  const src = mig(clone(FIX));
  ok(src.progress.chapter === 20 && Object.keys(src.progress.cleared).length === 22 && src.progress.flags.p2_done && src.progress.flags.ending_p2true && src.progress.flags.ex_s21_done && src.progress.flags.ex_s22_done, '고정 세이브: 22장 클리어 · p2_done · ending_p2true · 외전 둘');
  ok(src.inventory.filter(isKey).length === 6 && src.progress.lootQueue.filter(isKey).length === 1 && src.progress.lootQueue.length === 2, '고정 세이브: 가방 중요 물품 6 · 보관함 중요 물품 1 + 장비 1');
  ok(Object.keys(src.heroes).length === 7 && Object.values(src.heroes).every((h) => h.level >= 68 && h.level <= 72), '고정 세이브: 영웅 7 Lv 68–72');
  ok(Object.keys(src.companions?.owned ?? {}).length === 22 && src.quests.done.length === 40 && src.progress.docs.length === 27, '고정 세이브: 동료 22 · 의뢰 40 · 비전서 27');
  ok(!('ng' in src), '고정 세이브: ng 없음 (1회차)');
  const before = clone(src);
  const nx = NG.startNgPlus(src, { slot: src.slot, now: NOW });
  ok(isDeepStrictEqual(src, before), '원본 불변 (전후 깊은 같음)');
  ok(nx !== src && nx.heroes !== src.heroes, '깊은 사본');
  // 그대로
  ok(isDeepStrictEqual(nx.heroes, src.heroes), 'heroes 그대로 (레벨·경험치·SP·직업·스킬·편성·장비)');
  for (const k of ['gold', 'stats', 'bestiary', 'innGames', 'companions', 'charId', 'difficulty', 'created', 'name', 'futureField', 'version'])
    ok(isDeepStrictEqual(nx[k], src[k]), `${k} 그대로`);
  ok(isDeepStrictEqual(nx.progress.docs, src.progress.docs) && isDeepStrictEqual(nx.progress.lore, src.progress.lore), 'progress.docs · lore 그대로 (비전서 27)');
  // 중요 물품만 뺌
  ok(isDeepStrictEqual(nx.inventory, src.inventory.filter((it) => !isKey(it))), `가방: 중요 물품만 빠짐 (${src.inventory.length} → ${nx.inventory.length})`);
  ok(nx.inventory.filter(isKey).length === 0 && nx.progress.lootQueue.filter(isKey).length === 0, '중요 물품 0 (가방·보관함)');
  ok(isDeepStrictEqual(nx.progress.lootQueue, src.progress.lootQueue.filter((it) => !isKey(it))) && nx.progress.lootQueue.length === 1, '보관함: 장비 1 남음');
  const uids = new Set(nx.inventory.map((it) => it.uid));
  ok(Object.values(nx.heroes).every((h) => Object.values(h.equip).every((u) => u == null || uids.has(u))), '장착 장비는 모두 가방에 남음');
  // 새로
  const freshP = newGameState({ slot: 1 }).progress;
  ok(isDeepStrictEqual(Object.keys(nx.progress).filter((k) => k !== 'lootQueue').sort(), Object.keys(freshP).sort()), `progress 키 = newGameState 의 키 (+ lootQueue) — ${Object.keys(nx.progress).join(',')}`);
  ok(nx.progress.chapter === 0 && isDeepStrictEqual(nx.progress.cleared, {}) && isDeepStrictEqual(nx.progress.unlocked, ['s01']), 'chapter 0 · cleared {} · unlocked [s01]');
  for (const k of ['secrets', 'bosses', 'relics', 'seenScripts', 'shards', 'hearts']) ok(isDeepStrictEqual(nx.progress[k], []), `progress.${k} = []`);
  ok(!('npcTalks' in nx.progress), 'progress 의 그 밖 필드(npcTalks) 처음으로');
  ok(isDeepStrictEqual(nx.progress.flags, { startChar: src.charId, stable_open: true }), `깃발 = {startChar, stable_open} (${JSON.stringify(nx.progress.flags)})`);
  ok(isDeepStrictEqual(nx.quests, { active: {}, done: [] }), '의뢰 비움');
  ok(nx.score === 0 && nx.lives === getDiff(src.difficulty).lives && nx.lastStage === null && nx.slot === src.slot, 'score 0 · lives = 난이도 목숨 · lastStage null · slot 그대로');
  const nxNoStable = NG.startNgPlus((() => { const s = clone(src); delete s.progress.flags.stable_open; return s; })(), { slot: 3, now: NOW });
  ok(isDeepStrictEqual(nxNoStable.progress.flags, { startChar: src.charId }) && nxNoStable.slot === 3, 'stable_open 없으면 깃발 {startChar} · slot = 대상 (빈 슬롯 복사)');
  // ng
  ok(nx.ng?.v === 1 && nx.ng.n === 1 && nx.ng.at === NOW, `ng {v 1, n 1, at now} (${JSON.stringify({ v: nx.ng?.v, n: nx.ng?.n, at: nx.ng?.at })})`);
  ok(isDeepStrictEqual(nx.ng.hist, [{ n: 0, end: 'p2true', diff: src.difficulty, t: Math.round(src.stats.playTime), at: NOW }]), `hist 1줄 ${JSON.stringify(nx.ng.hist)}`);
  const past = nx.ng.past;
  ok(Object.keys(past.cleared).length === 22 && Object.entries(src.progress.cleared).every(([k, v]) => past.cleared[k]?.rank === v.rank && past.cleared[k]?.time === v.time), 'past.cleared 22장 (랭크·시간 그대로, 점수는 빼고)');
  ok(Object.values(past.cleared).every((v) => isDeepStrictEqual(Object.keys(v).sort(), ['rank', 'time'])), 'past.cleared 값 = {rank, time}');
  for (const k of ['unlocked', 'bosses', 'relics', 'shards', 'hearts', 'secrets']) ok(isDeepStrictEqual([...past[k]].sort(), [...new Set(src.progress[k])].sort()), `past.${k} = 지난 진행`);
  ok(isDeepStrictEqual([...past.quests].sort(), [...src.quests.done].sort()), 'past.quests = quests.done');
  ok(Object.entries(src.progress.flags).filter(([, v]) => v === true).every(([k]) => past.flags[k] === true) && Object.values(past.flags).every((v) => v === true), 'past.flags = 참인 깃발 전부');
  ok(past.diff === src.difficulty && !('docs' in past) && !('lore' in past), 'past.diff = 슬롯 난이도 · 비전서·기록물은 넣지 않음');
  // 세계의 심장이 다시 떨어진다 (§2.2 근거: loot.heartOwned)
  {
    const { rollBossLoot } = await imp('src/game/loot.js');
    const { BOSSES } = await imp('src/data/bosses.js');
    const heartBoss = Object.values(BOSSES).find((b) => (b.drops ?? []).some((id) => ITEMS[id]?.worldHeart));
    const heartId = heartBoss?.drops.find((id) => ITEMS[id]?.worldHeart);
    const drops = (st) => {
      const w = { state: st, stage: STAGES[heartBoss.stageId] ?? STAGES.s14, entities: [], diff: getDiff(st.difficulty), player: null };
      return quiet(() => rollBossLoot(w, { def: heartBoss, stats: { level: 80 } })).filter((d) => d.type === 'item').map((d) => d.data.item.baseId);
    };
    if (!heartBoss) ok(false, '세계의 심장을 떨어뜨리는 보스를 찾지 못함');
    else {
      ok(!drops(clone(src)).includes(heartId), `1회차 완주 슬롯: ${heartBoss.id} 가 ${heartId} 를 다시 떨어뜨리지 않음 (기준)`);
      ok(drops(clone(nx)).includes(heartId), `새 회차: ${heartBoss.id} 가 ${heartId} 를 다시 떨어뜨림 (중요 물품을 뺐으므로)`);
    }
  }
  // 저장 · 이관
  ok(isValidSave(nx) && (!serverValid || serverValid(nx)), `isValidSave 참 (클라이언트${serverValid ? '·서버 validate.mts' : ''})`);
  const m1 = mig(clone(nx)), m2 = mig(clone(m1));
  ok(isDeepStrictEqual(m1, m2), 'migrateState 두 번 = 한 번');
  ok(isDeepStrictEqual(m1.ng, nx.ng), 'migrateState 는 새 회차의 ng 를 바꾸지 않음');
  ok(bytes(nx) < 256 * 1024, `JSON < 256 KB (${(bytes(nx) / 1024).toFixed(1)} KB, past ${(bytes(nx.ng.past) / 1024).toFixed(1)} KB)`);
  // 두 번째 넘기기: 이번 회차를 조금 하고 다시 2부 엔딩
  const play = mig(clone(nx));
  play.progress.cleared = { s01: { rank: 'C', time: 50, score: 1 }, s02: { rank: 'S', time: 999, score: 1 }, s04: { rank: 'A', time: 10, score: 1 } };
  const s01Old = past.cleared.s01, s02Old = past.cleared.s02, s04Old = past.cleared.s04;
  play.progress.unlocked = ['s01', 's02', 's03'];
  play.progress.secrets = ['s01:new:secret'];
  play.progress.flags = { ...play.progress.flags, p2_done: true, ending_p2: true, brand_new: true, not_true: 1 };
  play.quests.done = ['main01', 'q_new'];
  play.stats.playTime += 5000;
  const nx2 = NG.startNgPlus(play, { slot: play.slot, now: NOW + 1 });
  const p2 = nx2.ng.past;
  ok(nx2.ng.n === 2 && nx2.ng.hist.length === 2 && isDeepStrictEqual(nx2.ng.hist[1], { n: 1, end: 'p2', diff: play.difficulty, t: Math.round(play.stats.playTime), at: NOW + 1 }), `두 번째 넘기기 → n 2 · hist 2줄 (${JSON.stringify(nx2.ng.hist[1])})`);
  ok(p2.cleared.s01.rank === s01Old.rank && p2.cleared.s01.time === Math.min(50, s01Old.time), `past 합치기: 더 좋은 랭크·짧은 시간 (s01 ${JSON.stringify(p2.cleared.s01)})`);
  ok(p2.cleared.s02.rank === 'S' && p2.cleared.s02.time === s02Old.time, `s02 ${JSON.stringify(p2.cleared.s02)}`);
  ok(p2.cleared.s04.rank === ('SABCD'.indexOf('A') < 'SABCD'.indexOf(s04Old.rank) ? 'A' : s04Old.rank) && p2.cleared.s04.time === 10, `s04 ${JSON.stringify(p2.cleared.s04)}`);
  ok(Object.keys(p2.cleared).length === 22 && p2.secrets.includes('s01:new:secret') && p2.secrets.length === past.secrets.length + 1, 'past 목록 합집합 (중복 없이)');
  ok(p2.quests.includes('q_new') && p2.quests.length === past.quests.length + 1 && p2.flags.brand_new === true && !('not_true' in p2.flags) && p2.flags.ending_p2true === true, 'quests·flags 합집합 (flags 는 true 만)');
  // n 9 에서 더 못 넘김 · hist ≤ 10
  let s = clone(nx);
  for (let i = 0; i < 12; i++) { s.progress.flags.p2_done = true; s = NG.startNgPlus(s, { slot: s.slot, now: NOW + 10 + i }); }
  ok(s.ng.n === 9 && NG.canStartNg({ ...s, progress: { ...s.progress, flags: { p2_done: true } } }) === false, `12번 넘겨도 n ≤ 9 (${s.ng.n}) · n 9 에서 canStartNg 거짓`);
  ok(s.ng.hist.length === 10 && s.ng.hist[9].at === NOW + 21, `hist ≤ 10 (오래된 것부터 버림, ${s.ng.hist.length})`);
  ok(isDeepStrictEqual(clone(NG.startNgPlus(mig(clone(FIX)), { slot: 1, now: NOW })), NG.startNgPlus(mig(clone(FIX)), { slot: 1, now: NOW })), 'startNgPlus 결과는 JSON 그대로 (함수·undefined 없음)');
}

// ═════════ N4 이관 (normalizeNg 퍼징) ═════════
if (want('N4')) {
  section('N4 이관 (normalizeNg, 손상 ng 1,000개)');
  // ng 없는 세이브에 ng 가 생기지 않는다
  ok(!('ng' in mig(clone(V1))), 'v1 고정 세이브 → ng 없음');
  ok(!('ng' in mig(clone(FIX))), 'save_p2done → ng 없음');
  ok(!('ng' in mig(newGameState({ slot: 2 }))), '새 게임 → ng 없음');
  { const s = clone(FIX); NG.normalizeNg(s); ok(isDeepStrictEqual(s, FIX), 'normalizeNg(ng 없는 세이브) 는 아무것도 바꾸지 않음'); }
  // 손상 퍼징
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const junk = () => pick([null, undefined, 0, -1, 1e9, 2.5, NaN, Infinity, 'x', '3', true, [], [1, 'a'], {}, { a: 1 }, '__proto__']);
  const bigStr = (n) => 'x'.repeat(n);
  const genPast = () => pick([
    () => junk(),
    () => [1, 2, 3],
    () => ({ cleared: pick([junk(), { s01: junk(), s02: { rank: pick(['S', 'Z', 3, 'SS', null]), time: junk() }, __proto__x: 1 }]), unlocked: pick([junk(), ['s01', 's01', 3, null, 's02']]), flags: pick([junk(), { a: true, b: 1, c: 'true' }]), diff: junk(), extra: { keep: 1 } }),
    () => ({ secrets: Array.from({ length: 3000 }, (_, i) => `s${i}:room:${i * 7},${i % 13}`), quests: Array.from({ length: 500 }, (_, i) => 'q' + i), unlocked: ['s01'] }),
    () => ({ blob: bigStr(100 * 1024), unlocked: ['s01', 's02'] }),
    () => ({ unlocked: Array.from({ length: 4000 }, (_, i) => 'stage_' + i), flags: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => ['f' + i, true])), cleared: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => ['c' + i, { rank: 'S', time: i }])) }),
  ])();
  const genHist = () => pick([() => junk(), () => Array.from({ length: 500 }, (_, i) => (i % 3 ? { n: i, end: pick(['p2', 'p2true', 5, null, bigStr(200)]), diff: pick(['normal', 'zz', 3]), t: junk(), at: junk() } : junk())), () => [{ n: 1, end: 'p2', diff: 'hard', t: 5, at: 6 }]])();
  const genNg = () => pick([
    () => junk(),
    () => 'ng-string',
    () => [1, 2],
    () => ({ v: junk(), n: pick([-1, 1e9, 2.5, NaN, '2', null, 0, 3, 9, 10, Infinity]), at: junk(), hist: genHist(), past: genPast(), zz: 'keep' }),
    () => ({ n: 2, past: genPast(), hist: genHist(), zz: { nested: [1] } }),
  ])();
  let threw = 0, bad = [], kept = 0, keptExpect = 0, idem = 0;
  const base = mig(clone(FIX));
  for (let i = 0; i < 1000; i++) {
    const s = clone(base);
    s.ng = genNg();
    const hadZz = s.ng && typeof s.ng === 'object' && !Array.isArray(s.ng) && 'zz' in s.ng;
    const zz = hadZz ? clone(s.ng.zz) : null;
    let m;
    try { m = mig(s); } catch (e) { threw++; if (threw < 3) console.log('    throw', e?.message); continue; }
    if ('ng' in m) {
      const g = m.ng;
      if (!g || typeof g !== 'object' || Array.isArray(g)) bad.push(`#${i} ng 모양`);
      else {
        if (!Number.isInteger(g.n) || g.n < 0 || g.n > 9) bad.push(`#${i} n=${g.n}`);
        if (!Array.isArray(g.hist) || g.hist.length > 10 || !g.hist.every((r) => r && typeof r === 'object' && Number.isInteger(r.n))) bad.push(`#${i} hist`);
        if ('past' in g && (!g.past || typeof g.past !== 'object' || Array.isArray(g.past) || bytes(g.past) > 24 * 1024)) bad.push(`#${i} past ${g.past ? bytes(g.past) : g.past}`);
        if (g.past && ['unlocked', 'secrets', 'quests'].some((k) => g.past[k] && !g.past[k].every((x) => typeof x === 'string'))) bad.push(`#${i} past 목록`);
        if (g.past?.flags && !Object.values(g.past.flags).every((v) => v === true)) bad.push(`#${i} past.flags`);
        if (hadZz) { keptExpect++; if (isDeepStrictEqual(g.zz, zz)) kept++; }
      }
    }
    try { if (isDeepStrictEqual(mig(clone(m)), m)) idem++; else if (bad.length < 8) bad.push(`#${i} 멱등 아님`); } catch { threw++; }
    if (JSON.stringify(JSON.parse(JSON.stringify(m))) !== JSON.stringify(m)) bad.push(`#${i} JSON`);
    if (!(isValidSave(m) && (!serverValid || serverValid(m)))) bad.push(`#${i} isValidSave`);
  }
  ok(threw === 0, `던짐 0 (${threw})`);
  ok(!bad.length, `n 0..9 정수 · hist ≤ 10 · past ≤ 24 KB · 목록은 문자열 · flags 는 true · isValidSave (${bad.slice(0, 8).join(' | ')})`);
  ok(keptExpect > 50 && kept === keptExpect, `ng 의 모르는 필드 남음 (${kept}/${keptExpect})`);
  ok(idem === 1000, `migrateState 멱등 (${idem}/1000)`);
  // 직접 사례
  const one = (ng) => { const s = clone(base); s.ng = ng; return mig(s); };
  ok(!('ng' in one('x')) && !('ng' in one([1])) && !('ng' in one(null)) && !('ng' in one(7)), '객체가 아닌 ng → 지움');
  ok(one({ n: -1 }).ng.n === 0 && one({ n: 1e9 }).ng.n === 9 && one({ n: 2.5 }).ng.n === 2 && one({ n: NaN }).ng.n === 0 && one({ n: '2' }).ng.n === 0, 'n: −1 → 0 · 1e9 → 9 · 2.5 → 2 · NaN → 0 · 문자열 → 0');
  ok(!('past' in one({ n: 1, past: [1, 2] }).ng) && !('past' in one({ n: 1, past: 'x' }).ng), 'past 가 객체가 아니면 지움');
  const h500 = one({ n: 3, hist: Array.from({ length: 500 }, (_, i) => ({ n: i % 10, end: 'p2', diff: 'normal', t: i, at: i })) });
  ok(h500.ng.hist.length === 10 && h500.ng.hist[9].t === 499, 'hist 500줄 → 마지막 10줄');
  const big = one({ n: 1, past: { secrets: Array.from({ length: 3000 }, (_, i) => `sec_${i}_${'y'.repeat(10)}`), quests: ['a', 'b'], unlocked: ['s01'], cleared: { s01: { rank: 'S', time: 3 } } } });
  ok(bytes(big.ng.past) <= 24 * 1024 && big.ng.past.secrets.length > 0 && big.ng.past.secrets[0] === 'sec_0_yyyyyyyyyy' && isDeepStrictEqual(big.ng.past.quests, ['a', 'b']) && big.ng.past.cleared.s01.rank === 'S', `past 상한: secrets 를 뒤에서 자름 (${bytes(big.ng.past)} B, secrets ${big.ng.past.secrets.length}) · quests·cleared 는 그대로`);
  const unk = one({ n: 2, past: { unlocked: ['s01', 's01', 5], keepMe: { a: 1 } }, zz: 1 });
  ok(isDeepStrictEqual(unk.ng.past.unlocked, ['s01']) && isDeepStrictEqual(unk.ng.past.keepMe, { a: 1 }) && unk.ng.zz === 1, 'past 목록 정리 · past·ng 의 모르는 필드 남음');
  const proto = one(JSON.parse('{"n":1,"past":{"__proto__":{"polluted":true},"cleared":{"__proto__":{"rank":"S"}},"flags":{"__proto__":true}}}'));
  ok(({}).polluted === undefined && Object.getPrototypeOf(proto.ng.past) === Object.prototype && !Object.hasOwn(proto.ng.past.cleared, '__proto__'), '__proto__ 키로 프로토타입을 바꾸지 않음');
  // JSON 왕복 (옛 클라이언트 흉내: 모르는 필드 ng 를 그대로 싣고 저장)
  const nx = ngFrom(FIX);
  const rt = JSON.parse(JSON.stringify(nx));
  ok(isDeepStrictEqual(rt.ng, nx.ng), 'JSON 왕복에 ng 가 남음');
  const old = clone(nx); const ng0 = old.ng; delete old.ng; const oldMig = mig(old); oldMig.ng = ng0;   // 옛 migrateState 는 ng 를 모른다 → 그대로 남는다
  ok(isDeepStrictEqual(mig(clone(oldMig)).ng, nx.ng), '옛 클라이언트가 남긴 ng 를 새 클라이언트가 그대로 읽음');
}

// ═════════ N5 세기 ═════════
if (want('N5')) {
  section('N5 세기 (ngWorld: 스테이지 23 × n 1..3 × 난이도 5)');
  const comp = (L, A) => 1 + A * Math.max(0, 46 - L) / 45;
  const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  const levels0 = Object.fromEntries(Object.entries(STAGES).map(([k, v]) => [k, v.level]));
  let bad = [], n5 = 0;
  for (const id of STORY) for (let n = 1; n <= 3; n++) for (const D of DIFFICULTIES) {
    const st = STAGES[id], d = getDiff(D.id), R = NG.NG_RULES.cycles[n], L = st.level;
    const r = NG.ngWorld(st, d, n);
    n5++;
    if (!r) { bad.push(`${id}/${n}/${D.id} null`); continue; }
    if (r.stage === st || r.stage.rooms !== st.rooms || r.stage.level !== NG.ngStageLevel(st, n) || r.stage.ngFrom !== L || r.stage.id !== id) bad.push(`${id}/${n}/${D.id} stage`);
    if (r.diff === d) bad.push(`${id}/${n}/${D.id} diff 사본 아님`);
    const bh = d.enemyHp, ba = d.enemyAtk, bb = d.bossHp ?? d.enemyHp;
    const want = {
      enemyHp: Math.min(Math.max(bh, 4.0), bh * R.hp) * comp(L, 2.5),
      enemyAtk: Math.min(Math.max(ba, 3.0), ba * R.atk) * comp(L, 1.0),
      bossHp: Math.min(Math.max(bb, 3.6), bb * R.bossHp) * comp(L, 2.5),
      aggro: Math.min(Math.max(d.aggro, 1.8), d.aggro * R.aggro),
      elite: Math.min(Math.max(d.elite, 0.35), d.elite + R.elite),
      drop: d.drop * R.drop,
    };
    for (const [k, v] of Object.entries(want)) if (!close(r.diff[k], v)) bad.push(`${id}/${n}/${D.id} ${k} ${r.diff[k]}≠${v}`);
    for (const k of ['exp', 'gold', 'healDrop', 'lives', 'continues', 'scoreMult', 'enemySpeed', 'enhanceBonus', 'id', 'name']) if (r.diff[k] !== d[k]) bad.push(`${id}/${n}/${D.id} ${k} 바뀜`);
    if (r.diff.enemyHp < d.enemyHp || r.diff.enemyAtk < d.enemyAtk || r.diff.aggro < d.aggro || r.diff.elite < d.elite) bad.push(`${id}/${n}/${D.id} 난이도 값보다 낮음`);
    if (r.bossPatterns !== true) bad.push(`${id}/${n}/${D.id} bossPatterns`);
    const es = enemyStats({ hp: 40, atk: 10, def: 3, exp: 8 }, r.stage.level, r.diff, true);
    const bs = enemyStats({ hp: 900, atk: 20, def: 5, exp: 400 }, r.stage.level, { ...r.diff, enemyHp: r.diff.bossHp ?? r.diff.enemyHp }, false);
    if (![es.maxHp, es.atk, es.def, es.exp, bs.maxHp, bs.atk].every(Number.isFinite)) bad.push(`${id}/${n}/${D.id} enemyStats 유한 아님`);
  }
  ok(n5 === STORY.length * 15 && STORY.length === 23, `사례 ${n5} (스토리 스테이지 ${STORY.length})`);   // 23 = s01–s20 + 외전 s21 · s22 · s23 (EX3-INTEG, ex_s23.md §5.4)
  ok(!bad.length, `§3.1 공식 · 사본 · 나머지 배율 그대로 · bossPatterns · enemyStats 유한 (${bad.slice(0, 6).join(' | ')})`);
  ok(Object.entries(STAGES).every(([k, v]) => v.level === levels0[k] && !('ngFrom' in v)), 'STAGES 의 level 그대로 (ngFrom 없음)');
  const hell = NG.ngWorld(STAGES.s01, getDiff('inferno'), 3), hell20 = NG.ngWorld(STAGES.s20, getDiff('inferno'), 3);
  ok(close(hell.diff.enemyAtk, 3.0 * comp(1, 1.0)) && close(hell20.diff.enemyAtk, 3.0), `지옥 4회차 enemyAtk = 3.0 × comp (s01 ${hell.diff.enemyAtk}, s20 ${hell20.diff.enemyAtk})`);
  ok(close(NG.ngWorld(STAGES.s20, getDiff('normal'), 3).diff.enemyHp, 1.6) && close(NG.ngWorld(STAGES.s01, getDiff('normal'), 1).diff.enemyHp, 1.1 * 3.5), '보통: s20 4회차 체력 ×1.6 · s01 2회차 ×1.1×3.5');
  ok([0, -1, null, undefined, NaN].every((n) => NG.ngWorld(STAGES.s01, getDiff('normal'), n) === null), 'n = 0 (· 손상) → null');
  ok(NG.ngWorld(null, getDiff('normal'), 1) === null && NG.ngWorld(STAGES.s01, null, 1)?.diff?.enemyHp > 0, '손상 입력에도 던지지 않음');
  const dd = { ...getDiff('hard'), diffOver: 1 }; const r9 = NG.ngWorld(STAGES.s05, dd, 9), r3 = NG.ngWorld(STAGES.s05, dd, 3);
  ok(isDeepStrictEqual(r9, r3), 'n ≥ 3 은 4회차와 같은 세기');
}

// ═════════ N6 마을 ═════════
if (want('N6')) {
  section('N6 회차의 마을 (serviceChapter · guardianSlots · buyCompanion · shopStock)');
  const CS = await imp('src/game/companion_state.js');
  const { shopStock, smithStock } = await imp('src/data/shop.js');
  const fresh = newGameState({ slot: 1 });
  const withNg = (ch, n = 1) => { const s = clone(fresh); s.progress.chapter = ch; s.ng = { v: 1, n, at: 0, hist: [], past: {} }; return s; };
  ok(NG.serviceChapter(fresh) === 0 && NG.serviceChapter({ progress: { chapter: 7 } }) === 7, '회차 없음 = 장');
  ok(NG.serviceChapter(withNg(0)) === 20 && NG.serviceChapter(withNg(12)) === 20 && NG.serviceChapter(withNg(22)) === 22, '회차 1 · 장 0 = 20 (max(장, 20))');
  ok(NG.serviceChapter({ ...withNg(0), arcade: {} }) === 0 && NG.serviceChapter(null) === 0, '아케이드 · 손상 → 장 그대로');
  ok(CS.guardianSlots(fresh) === 1 && CS.guardianSlots(withNg(0)) === 2, `guardianSlots(회차·장 0) = 2 (회차 없음 1)`);
  // companion_state.js 는 data·events 만 import 하므로 serviceChapter 를 인라인으로 읽는다 → 같은 값인지 대조
  {
    const cases = [];
    for (const ch of [0, 3, 7, 8, 12, 20]) for (const ng of [undefined, null, 'x', { n: 0 }, { n: 1 }, { n: 2.5 }, { n: '2' }, { n: 9 }, { n: -1 }]) for (const ar of [false, true]) {
      const s = clone(fresh); s.progress.chapter = ch; if (ng !== undefined) s.ng = ng; if (ar) s.arcade = { kind: 'practice' }; cases.push(s);
    }
    const bad = cases.filter((s) => CS.guardianSlots(s) !== (NG.serviceChapter(s) >= 8 ? 2 : 1));
    ok(!bad.length, `guardianSlots = (NG.serviceChapter ≥ 8 ? 2 : 1) — ${cases.length}가지 (${bad.slice(0, 3).map((s) => JSON.stringify({ ch: s.progress.chapter, ng: s.ng, ar: !!s.arcade })).join(' ')})`);
  }
  const stock = shopStock(NG.serviceChapter(withNg(0))).map((r) => r.baseId);
  ok(stock.includes('c_elixir') && stock.includes('m_stone_5'), `shopStock(serviceChapter) 에 c_elixir · m_stone_5`);
  ok(!shopStock(NG.serviceChapter(fresh)).some((r) => r.baseId === 'c_elixir'), '1회차 장 0 가게에는 엘릭서 없음 (기준)');
  ok(smithStock(NG.serviceChapter(withNg(0))).length >= smithStock(20).length, 'smithStock(serviceChapter) = 20장 대장간');
  const CD = await imp('src/data/companions.js');
  const row = [...CD.STABLE_SHOP].sort((a, b) => b.chapter - a.chapter)[0];
  if (row) {
    const a = clone(fresh); a.gold = 1e9; CS.ensureCompanionState(a);
    const b = withNg(0); b.gold = 1e9; CS.ensureCompanionState(b);
    ok(row.chapter < 1 || quiet(() => CS.buyCompanion(a, row.id)).ok === false, `1회차 장 0: ${row.id}(${row.chapter}장) 구입 불가 (기준)`);
    ok(quiet(() => CS.buyCompanion(b, row.id)).ok === true, `회차·장 0: ${row.id}(${row.chapter}장) 구입 가능`);
  }
}

// ═════════ N7 지난 회차 ═════════
if (want('N7')) {
  section('N7 지난 회차 (pastState)');
  const nx = ngFrom(FIX);
  const ps = NG.pastState(nx);
  ok(ps && !('ng' in ps), 'pastState: 있음 · ng 없음 (재귀 없음)');
  ok(ps.difficulty === nx.ng.past.diff && ps.slot === nx.slot && ps.created === nx.created, 'difficulty = past.diff · slot · created');
  ok(isDeepStrictEqual(ps.progress.cleared, nx.ng.past.cleared) && isDeepStrictEqual(ps.progress.unlocked, nx.ng.past.unlocked) && isDeepStrictEqual(ps.progress.flags, nx.ng.past.flags), 'progress 부분 모양 (cleared · unlocked · flags)');
  for (const k of ['bosses', 'relics', 'shards', 'hearts', 'secrets']) ok(isDeepStrictEqual(ps.progress[k], nx.ng.past[k]), `progress.${k}`);
  ok(isDeepStrictEqual(ps.quests.done, nx.ng.past.quests) && isDeepStrictEqual(ps.heroes, {}) && isDeepStrictEqual(ps.inventory, []) && !ps.companions && !ps.stats, 'quests.done · 영웅·가방·동료·통계 비어 있음');
  ps.progress.unlocked.push('zz'); ps.progress.cleared.s01.rank = 'D';
  ok(!nx.ng.past.unlocked.includes('zz') && nx.ng.past.cleared.s01.rank !== 'D', '반환값을 고쳐도 슬롯은 그대로');
  ok(NG.pastState(mig(clone(FIX))) === null && NG.pastState(newGameState({ slot: 1 })) === null && NG.pastState(null) === null, '회차 없는 세이브 → null');
  ok(NG.pastState({ ...nx, arcade: {} }) === null, '아케이드 → null');
  const dbg = newGameState({ slot: 1 }); NG.applyNgDebug(dbg, new URLSearchParams('ng=2'));
  ok(dbg.ng?.n === 2 && isDeepStrictEqual(dbg.ng.past, {}) && isDeepStrictEqual(dbg.ng.hist, []) && Number.isFinite(dbg.ng.at), 'applyNgDebug(?ng=2) → {v 1, n 2, hist [], past {}}');
  const d0 = newGameState({ slot: 1 }); NG.applyNgDebug(d0, new URLSearchParams('stage=s01'));
  ok(!('ng' in d0), 'applyNgDebug: ?ng 없으면 아무것도 하지 않음');
  const d12 = newGameState({ slot: 1 }); NG.applyNgDebug(d12, { ng: '12' });
  ok(d12.ng?.n === 9 && isDeepStrictEqual(mig(clone(d12)).ng.n, 9), 'applyNgDebug(12) → 9');
}

// ═════════ N10 연습 목록 (NG-SYNC front/arcade.js) ═════════
if (want('N10')) {
  section('N10 아케이드 연습 목록 (practiceStages, NG-SYNC 계약)');
  const A = await imp('src/scenes/front/arcade.js');
  const keep = [1, 2, 3].map((k) => saves.read(k));
  try {
    quiet(() => { for (const k of [1, 2, 3]) saves.remove(k); });
    const nx = ngFrom(FIX, { slot: 1 });
    ok(isDeepStrictEqual(nx.progress.unlocked, ['s01']) && nx.ng.past.unlocked.length === 22, '회차 슬롯: unlocked [s01] · past.unlocked 22장');
    quiet(() => saves.write(1, nx));
    ok(saves.read(1)?.ng?.n === 1, 'saves.write → read (node 메모리 기록)');
    const ps = A.practiceStages({ meta: {} });
    ok(ps.includes('s22') && ps.includes('s13') && ps.length === 22, `practiceStages 에 s22 (지난 회차 해금 포함, ${ps.length}개) — NG-SYNC front/arcade.js slotUnlocks`);
  } finally {
    quiet(() => { for (const k of [1, 2, 3]) { if (keep[k - 1]) saves.write(k, keep[k - 1]); else saves.remove(k); } });
  }
}

// ═════════ N11 업적 요약 (NG-SYNC game/achievements.js) ═════════
if (want('N11')) {
  section('N11 업적 요약 (digestState.past · scanDefs, NG-SYNC 계약)');
  const AC = await imp('src/game/achievements.js');
  const M = await imp('src/core/ach_meta.js');
  const src = mig(clone(FIX));
  const nx = NG.startNgPlus(src, { slot: src.slot, now: NOW });
  const d0 = AC.digestState(src), d1 = AC.digestState(nx);
  ok(d1 && d1.past && typeof d1.past === 'object', 'digestState(새 회차).past 있음');
  ok(d0 && !d0.past, 'digestState(1회차).past 없음');
  const slotsOf = (d) => (d?.past ? [d, d.past] : [d]);
  const set0 = new Set(AC.scanDefs({ meta: {}, ach: M.newAch(), slots: slotsOf(d0) }));
  const set1 = new Set(AC.scanDefs({ meta: {}, ach: M.newAch(), slots: slotsOf(d1) }));
  const lost = [...set0].filter((x) => !set1.has(x)), gained = [...set1].filter((x) => !set0.has(x));
  ok(!lost.length && !gained.length, `scanDefs 결과 집합이 넘기기 전과 같음 (${set0.size}개; 줄어든 것 ${lost.join(',') || '없음'} · 늘어난 것 ${gained.join(',') || '없음'})`);
}

// ═════════ N12 점수 줄 (NG-UI front/common.js recordHighScore · NG-CORE main.js recordScore) ═════════
if (want('N12')) {
  section('N12 명예의 전당 스토리 줄 (recordHighScore, 첫 조각 인라인 표기)');
  const C = await imp('src/scenes/front/common.js');
  const st = mig(clone(FIX)); st.slot = 1;
  const game = { meta: { highScores: [] }, state: st };
  quiet(() => C.recordHighScore(game, { score: 1000, stageId: 's20', mode: 'story' }));
  const nx = ngFrom(FIX, { slot: 1 }); nx.ng.n = 2;
  game.state = nx;
  quiet(() => C.recordHighScore(game, { score: 500, stageId: 's01', mode: 'story' }));
  quiet(() => C.recordHighScore(game, { score: 700, stageId: 's02', mode: 'story' }));
  const rows = game.meta.highScores.filter((h) => (h.mode || 'story') === 'story');
  const r1 = rows.find((h) => h.run === `1:${st.created}`), r2 = rows.find((h) => h.run === `1:${st.created}:2`);
  ok(rows.length === 2, `두 줄 (${rows.map((h) => h.run).join(' · ')})`);
  ok(r1 && !('ng' in r1) && r1.score === 1000, `1회차 → run '1:<created>' · ng 없음`);
  ok(r2 && r2.ng === 2 && r2.score === 700, `회차 2 → run '1:<created>:2' · ng 2 · 한 줄로 합침 (${JSON.stringify(r2)})`);
  // main.js game.recordScore (직접 부팅 대체 경로) 도 같은 규칙 — 소스 확인
  const mainSrc = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  ok(/st\.created\}\$\{ng \? `:\$\{ng\}` : ''\}/.test(mainSrc) && /e\.ng = ng/.test(mainSrc), 'main.js recordScore: run 에 :n · 항목 ng');
  // 첫 조각 인라인 읽기 = ngOf · 표기 = ngLabel
  const inline = (s) => (Number.isInteger(s?.ng?.n) && s.ng.n > 0 ? Math.min(9, s.ng.n) : 0);
  const label = (n) => (n ? `${n + 1}회차` : '');
  const cases = [undefined, null, 0, 1, 2, 2.5, 9, 10, 99, -1, '2', NaN].map((n) => ({ ng: { n } }));
  ok(cases.every((s) => inline(s) === NG.ngOf(s) && label(inline(s)) === NG.ngLabel(NG.ngOf(s))), '인라인 읽기 = ngOf · 인라인 표기 = ngLabel');
  const FIRST = { 'src/core/cloud.js': 'NG-SYNC summarize', 'src/scenes/front/common.js': 'NG-UI recordHighScore', 'src/scenes/front/cloud_ui.js': 'NG-UI 요약' };
  for (const f of Object.keys(FIRST)) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok(!/from ['"][^'"]*ngplus\.js['"]|import\(['"][^'"]*ngplus\.js/.test(src), `${f} 는 ngplus.js 를 import 하지 않음 (첫 조각)`);
  }
  // 동작으로 대조: cloud.summarize(s).ng = ngOf(s) · cloud_ui.ngText(요약) = ' · ' + ngLabel
  const CL = await imp('src/core/cloud.js');
  const sumNg = (s) => CL.summarize?.({ ...clone(FIX), ng: s.ng })?.ng ?? 0;
  ok(cases.every((s) => sumNg(s) === NG.ngOf({ ...clone(FIX), ng: s.ng })), `core/cloud.js summarize 의 ng = ngOf (${FIRST['src/core/cloud.js']})`);
  let UIM = null; try { UIM = await imp('src/scenes/front/cloud_ui.js'); } catch (e) { console.log('    (cloud_ui.js 를 node 에서 불러오지 못함: ' + e.message.split('\n')[0] + ')'); }
  if (UIM) ok(typeof UIM.ngText === 'function' && [0, 1, 2, 9, 10, 2.5, -1, '2', null].every((n) => UIM.ngText({ ng: n }) === (Number.isInteger(n) && n > 0 ? ` · ${NG.ngLabel(Math.min(9, n))}` : '')), `front/cloud_ui.js ngText(요약) = ' · ' + ngLabel (${FIRST['src/scenes/front/cloud_ui.js']})`);
}

// ═════════ --browser: N8 월드 · N9 아케이드 무관 ═════════
if (BROWSER && (want('N8') || want('N9'))) {
  const { openEnv } = await imp('tools/qa/lib/server.mjs');
  const env = await openEnv();
  // 스테이지 배너는 대화가 시작되면 지워지므로 첫 프레임부터 기록한다
  const bannerRec = () => {
    const f = () => { const w = window.__game?.world; if (w?.banner?.sub && !window.__ngBanner) window.__ngBanner = w.banner.sub; if (!window.__ngBanner) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  };
  const worldReady = 'g.world && g.world.player && g.top';
  // 보스 클래스를 먼저 받은 뒤 경기장 시작 (대역 PendingBoss 는 대화 중 월드가 멈추면 진짜 보스로 바뀌지 않는다)
  const startBossNow = async () => {
    const w = window.__game.world;
    const L = await import('/src/game/bosses/lazy.js');
    await L.loadBoss?.(w.room?.bossId ?? w.stage.boss);
    if (!w.boss && w.arenaX !== undefined) w.startBoss();
  };
  const allErrs = [];
  try {
    if (want('N8')) {
      section('N8 월드 (--browser: ?scene=stage&ng=N)');
      let s = await env.page('desk', 'index.html?scene=stage&stage=s01&ng=2', { initScripts: [bannerRec] });
      await s.waitGame(worldReady);
      await s.wait(400);
      const w8 = await s.eval(async () => {
        const g = window.__game, w = g.world;
        const { STAGES } = await import('/src/data/stages.js');
        return { ng: w.ng, level: w.stage.level, ngFrom: w.stage.ngFrom, orig: STAGES.s01.level, hp: w.diff.enemyHp, atk: w.diff.enemyAtk, ngBoss: w.ngBoss, banner: window.__ngBanner ?? w.banner?.sub ?? null, stateNg: g.state?.ng?.n,
          foes: w.entities.filter((e) => e.kind === 'enemy' && !e.dead).map((e) => e.stats?.level) };
      });
      const want8 = NG.ngWorld(STAGES.s01, getDiff('normal'), 2).diff;
      ok(w8.ng === 2 && w8.stateNg === 2, `world.ng 2 (${w8.ng})`);
      ok(w8.level === 78 && w8.ngFrom === 1 && w8.orig === 1, `world.stage.level 78 · STAGES.s01.level 1 (${w8.level} / ${w8.orig})`);
      ok(Math.abs(w8.hp - want8.enemyHp) < 1e-9 && Math.abs(w8.atk - want8.enemyAtk) < 1e-9, `world.diff.enemyHp = 공식 (${w8.hp} vs ${want8.enemyHp})`);
      ok(typeof w8.banner === 'string' && w8.banner.startsWith('3회차 · CHAPTER 1'), `배너 부제 '3회차 · CHAPTER 1 …' (${w8.banner})`);
      ok(w8.ngBoss === true, 'world.ngBoss 참');
      ok(!w8.foes.length || w8.foes.every((l) => l >= 78), `첫 방 적 레벨 ≥ 78 (${w8.foes.join(',')})`);
      allErrs.push(...s.errs.map((e) => 'N8 s01: ' + e));
      await s.close();
      // 보스방: 강화 패턴
      s = await env.page('desk', 'index.html?scene=stage&stage=s01&room=boss&ng=2');
      await s.waitGame(worldReady);
      await s.eval(startBossNow);
      await s.waitGame('g.world.boss && !g.world.boss.pendingBoss', 30000);
      const b8 = await s.eval(() => { const b = window.__game.world.boss; return { inferno: b.inferno, hp: b.stats?.maxHp, lv: b.stats?.level, id: b.id }; });
      ok(b8.inferno === true && Number.isFinite(b8.hp) && b8.hp > 0, `&room=boss → world.boss.inferno 참 (${JSON.stringify(b8)})`);
      allErrs.push(...s.errs.map((e) => 'N8 boss: ' + e));
      await s.close();
      // 회차 없이 (같은 보스는 보통 난이도에서 강화 패턴 없음)
      s = await env.page('desk', 'index.html?scene=stage&stage=s01&room=boss', { initScripts: [bannerRec] });
      await s.waitGame(worldReady);
      await s.eval(startBossNow);
      await s.waitGame('g.world.boss && !g.world.boss.pendingBoss', 30000);
      const w0 = await s.eval(() => { const g = window.__game, w = g.world; return { ng: w.ng, level: w.stage.level, ngFrom: w.stage.ngFrom ?? null, inferno: w.boss?.inferno, banner: window.__ngBanner ?? null, stateNg: g.state?.ng ?? null }; });
      ok(w0.ng === 0 && w0.level === 1 && w0.ngFrom === null && w0.stateNg === null, `ng 없이 → world.ng 0 · 레벨 1 · state.ng 없음 (${JSON.stringify(w0)})`);
      ok(w0.inferno === false && (w0.banner == null || w0.banner.startsWith('CHAPTER 1')), '회차 없음: 보통 난이도 보스 강화 패턴 없음 · 배너 \'CHAPTER 1\'');
      allErrs.push(...s.errs.map((e) => 'N8 plain: ' + e));
      await s.close();
      // 마을: world.ng 0 · 회차의 마을 (수호신 2칸)
      s = await env.page('desk', 'index.html?scene=hub&ng=1');
      await s.waitGame('g.world && g.world.mode === "town"');
      const h8 = await s.eval(async () => { const g = window.__game; const CS = await import('/src/game/companion_state.js'); return { ng: g.world.ng, stateNg: g.state?.ng?.n, slots: CS.guardianSlots(g.state) }; });
      ok(h8.ng === 0 && h8.stateNg === 1 && h8.slots === 2, `?scene=hub&ng=1 → 마을 world.ng 0 · state.ng.n 1 · 수호신 2칸 (${JSON.stringify(h8)})`);
      allErrs.push(...s.errs.map((e) => 'N8 hub: ' + e));
      await s.close();
    }
    if (want('N9')) {
      section('N9 아케이드 무관 (--browser: 회차 슬롯 → 스테이지 연습 s01)');
      const nx = ngFrom(FIX, { slot: 1 }); nx.ng.n = 3;
      const s = await env.page('desk', 'index.html?scene=hub&ng=3');
      await s.waitGame('g.world && g.world.mode === "town"');
      const a9 = await s.eval(async (slot) => {
        const g = window.__game;
        const { saves } = await import('/src/core/save.js');
        const { migrateState } = await import('/src/game/state.js');
        saves.write(1, slot);
        g.state = migrateState(saves.read(1));
        const ng = g.state.ng?.n;
        const A = await import('/src/scenes/front/arcade.js');
        A.startArcade(g, { kind: 'practice', diff: 'normal', preset: 1, stageId: 's01' }, 'kael');
        return { ng };
      }, nx);
      ok(a9.ng === 3, '회차 슬롯(4회차)을 불러온 뒤 연습 시작');
      await s.waitGame('g.world && g.world.mode === "practice" && g.world.player', 30000);
      await s.wait(600);
      const p9 = await s.eval(async () => {
        const g = window.__game, w = g.world;
        const { STAGES } = await import('/src/data/stages.js');
        return { ng: w.ng, level: w.stage.level, orig: STAGES.s01.level, ngFrom: w.stage.ngFrom ?? null, ngBoss: !!w.ngBoss, arcade: !!g.state.arcade, foes: w.entities.filter((e) => e.kind === 'enemy').map((e) => e.stats?.level) };
      });
      ok(p9.arcade && p9.ng === 0 && p9.level === p9.orig && p9.ngFrom === null && !p9.ngBoss, `연습 s01: world.ng 0 · 적 레벨 = 아케이드 규칙 (${JSON.stringify(p9)})`);
      ok(p9.foes.every((l) => l < 70), `연습 적 레벨 (회차 세기 없음): ${p9.foes.join(',')}`);
      allErrs.push(...s.errs.map((e) => 'N9: ' + e));
      await s.close();
    }
  } catch (e) {
    ok(false, `--browser 실행 오류: ${e?.stack ?? e}`);
  } finally {
    await env.close();
  }
  ok(!allErrs.length, `페이지·콘솔 오류 0 (${allErrs.slice(0, 4).join(' | ')})`);
}

// ═════════ --ui (NG-UI) ═════════
if (UI) {
  section('--ui (tools/qa/ngplus_ui.mjs, NG-UI)');
  const p = path.join(ROOT, 'tools/qa/ngplus_ui.mjs');
  if (!fs.existsSync(p)) ok(false, 'tools/qa/ngplus_ui.mjs 가 아직 없음 (NG-UI)');
  else {
    try {
      const mod = await import(pathToFileURL(p).href);
      const res = await mod.default({ root: ROOT, only: ONLY ? [...ONLY].filter((x) => x.startsWith('U')) : null });
      const bad = res === false || res?.ok === false || (Number.isFinite(res?.fails) && res.fails > 0) || (Number.isFinite(res?.failed) && res.failed > 0);
      ok(!bad, `ngplus_ui.mjs 결과 ${JSON.stringify(res)?.slice(0, 300)}`);
    } catch (e) { ok(false, `ngplus_ui.mjs 실행 오류: ${e?.stack ?? e}`); }
  }
}

console.log(`\n통과 ${passes}, 실패 ${fails} (${((Date.now() - T0) / 1000).toFixed(1)}초)`);
process.exit(fails ? 1 : 0);
