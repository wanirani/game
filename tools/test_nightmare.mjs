// 「악몽의 군주」 악몽 재대결 엔진 시험 (docs/specs/nightmare.md §8) — owner: Stage 5 P3
//   node tools/test_nightmare.mjs               노드 시험만 (< 5초): 표 · 레벨 · 준비(K2) · 열림 · 기록/메타(K1) · 옛 세이브 · 클라우드 합치기 · 연결 줄
//   node tools/test_nightmare.mjs --browser     + 브라우저 (기본 fold_open):
//        25 악몽 모두: 보스 · inferno · 배율 · 비틀기 하나 · 감독(예고 ≥ 0.6초 · 빈 길) · AUTO 거절 · 경험치 0 · 포기 → 마을
//        나이트윙 전체 흐름: 실패(목숨 그대로) → 다시 도전 → 격파(첫 보상 한 번) → 두 번째 격파(보상 없음) → 실패 → 마을로
//        1장 세이브 → (월드맵 「악몽」 단추가 있으면 그것, 없으면 startNightmare from 'worldmap') → 나이트윙 → 떠나기 · 페이지 오류 0 · fetch 0
//   --quick           브라우저: 비틀기마다 하나 (8 악몽)
//   --only nm_s01,…   브라우저: 고른 악몽만 (전체 흐름·1장 케이스는 nm_s01 이 들어 있을 때만)
//   --vp fold_open    화면 (쉼표)
//   --shots DIR       스크린숏 (PNG) 저장 폴더
// 브라우저 시험은 TMPDIR=/dev/shm/<dir> nice -n 10 로 돌린다 (디스크·CPU 여유).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const T0 = Date.now();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const BROWSER = argv.includes('--browser');
const QUICK = argv.includes('--quick');
const VPS = arg('--vp', 'fold_open').split(',').map((s) => s.trim()).filter(Boolean);
const ONLY = arg('--only') ? new Set(arg('--only').split(',').map((s) => s.trim())) : null;
const SHOTS = arg('--shots');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let fails = 0, passes = 0;
const ok = (cond, msg, extra) => { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const section = (t) => console.log('▶ ' + t);
const clone = (o) => JSON.parse(JSON.stringify(o));
const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };

const D = await imp('src/data/nightmare.js');
const { STAGES } = await imp('src/data/stages.js');
const { BOSSES } = await imp('src/data/bosses.js');
const { ENEMIES } = await imp('src/data/enemies.js');
const { migrateState, newGameState } = await imp('src/game/state.js');
const NM = await imp('src/game/nightmare.js');
const HZ = await imp('src/game/nm_hazards.js');
const TRIAL = await imp('src/game/trial.js');
const { TRIALS } = await imp('src/data/trials.js');
const CLOUD = await imp('src/core/cloud.js');
const COS = await imp('src/data/cosmetics.js');
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/save_p2done.json'), 'utf8'));
const FIX_V1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/save_v1.json'), 'utf8'));
const FIX_CH6 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/save_ch6_nocmp.json'), 'utf8'));
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ═════════ N1 표: 25 악몽 ↔ 스테이지 보스 · 비틀기 하나 ═════════
section('N1 악몽 표 (25) ↔ STAGES 보스 · 비틀기');
const ids = Object.keys(D.NM);
ok(ids.length === 25 && D.NM_IDS.length === 25, `악몽 25개 (${ids.length})`);
const usedTwists = new Set();
for (let i = 1; i <= 25; i++) {
  const sid = 's' + String(i).padStart(2, '0'), id = 'nm_' + sid, e = D.NM[id];
  ok(!!e, `${id} 있음`);
  if (!e) continue;
  const S = STAGES[e.stage];
  ok(e.id === id && e.stage === sid && S?.rooms?.boss, `${id}: 스테이지 ${sid} 보스방`);
  ok(S?.boss === e.boss && !!BOSSES[e.boss], `${id}: 보스 ${e.boss} = 스테이지 보스 (${S?.boss})`);
  ok(typeof e.twist === 'string' && !!D.NM_TWISTS[e.twist], `${id}: 비틀기 하나 '${e.twist}'`);
  usedTwists.add(e.twist);
  ok(e.hpMul > 1 && e.atkMul >= 1 && e.spMul >= 1 && e.hpMul <= 2 && e.atkMul <= 1.3 && e.spMul <= 1.3, `${id}: 배율 (체력 ${e.hpMul} · 공격 ${e.atkMul} · 속도 ${e.spMul})`);
  ok([4, 5].includes(e.reward?.rarity), `${id}: 첫 격파 보상 등급 ${e.reward?.rarity}`);
  if (e.twist === 'minions') ok(Array.isArray(e.minions) && e.minions.length > 0 && e.minions.every((m) => ENEMIES[m]), `${id}: 하수인 목록 = 적 id`, e.minions);
  ok(D.isNightmareId(id) && D.nmEntry(id) === e && D.nmOfBoss?.(e.boss)?.id === id, `${id}: isNightmareId · nmEntry · nmOfBoss`);
}
ok(usedTwists.size === Object.keys(D.NM_TWISTS).length && usedTwists.size === 8, `비틀기 8가지 모두 쓰임 (${[...usedTwists].join(',')})`);
for (const [k, tw] of Object.entries(D.NM_TWISTS)) {
  ok(tw.name && tw.desc && (tw.hazard || tw.rules || tw.dark), `비틀기 ${k}: 이름 · 설명 · 효과`);
  if (tw.rules) ok(Object.keys(tw.rules).length === 1, `비틀기 ${k}: 규칙 하나`, tw.rules);
}
ok(!D.isNightmareId('tr_kael_1') && !D.isNightmareId('nm_s99') && !D.isNightmareId(null) && !D.nmEntry('nm_x'), '모르는 id 는 악몽이 아니다');
ok(!ids.some((id) => Object.hasOwn(TRIALS, id)), '악몽 id 가 시련 id 와 겹치지 않음');

// ═════════ N2 레벨 ═════════
section('N2 레벨 = max(이야기 + 8, 영웅 − 2), 1–120');
const e01 = D.NM.nm_s01, e25 = D.NM.nm_s25;
ok(D.nmLevel(e01, 1) === STAGES.s01.level + 8, `s01 · 영웅 1 → ${D.nmLevel(e01, 1)}`);
ok(D.nmLevel(e01, 40) === 38, `s01 · 영웅 40 → 38 (${D.nmLevel(e01, 40)})`);
ok(D.nmLevel(e25, 99) === 97, `s25 · 영웅 99 → 97 (${D.nmLevel(e25, 99)})`);
ok(D.nmLevel(e25, 999) === 120 && D.nmLevel(e01, NaN) === STAGES.s01.level + 8, '상한 120 · 숫자 아님 → 이야기 + 8');
for (const id of ids) { const e = D.NM[id]; ok(D.nmRecLevel(e) >= STAGES[e.stage].level + 8, `${id}: 권장 레벨 ≥ 이야기 + 8`); }

// ═════════ N3 준비 (K2 · K4 · 규칙) ═════════
section('N3 준비: opts.nightmare (K2) · 규칙 · 레벨 · 이야기 연출 없음');
const G = (st) => ({ state: st, toast() {}, go() {}, registry: {} });
const stP2 = migrateState(clone(FIX));
for (const id of ids) {
  const e = D.NM[id], P = NM.prepareNightmare(G(stP2), id), tw = D.NM_TWISTS[e.twist];
  const hero = stP2.heroes[stP2.charId];
  ok(P && P.T?.nightmare && P.T.id === id && P.stage.id === e.stage, `${id}: prepare → T · stage`);
  if (!P) continue;
  const o = P.opts, n = o.nightmare;
  ok(o.mode === 'trial' && o.roomId === 'boss' && o.levelOverride === D.nmLevel(e, hero.level), `${id}: mode trial · 보스방 · 레벨 ${o.levelOverride}`);
  ok(n && n.id === id && n.twist === e.twist && n.boss === e.boss && n.stage === e.stage && n.baseLevel === STAGES[e.stage].level && n.level === o.levelOverride
    && n.hpMul === e.hpMul && n.atkMul === e.atkMul && n.spMul === e.spMul, `${id}: opts.nightmare (K2)`, n);
  const rk = Object.keys(o.rules).filter((k) => k !== 'label');
  ok(o.rules.label === '악몽의 규칙' && rk.length === (tw.rules ? 1 : 0) && (!tw.rules || o.rules[rk[0]] === tw.rules[rk[0]]), `${id}: 규칙 = 비틀기 하나 (${rk.join(',') || '없음'})`, o.rules);
  ok(P.stage.intro == null && P.stage.outro == null && !P.stage.next && (P.stage.unlocks ?? []).length === 0, `${id}: 이야기 연출·해금 없음`);
  ok(o.diffOver == null, `${id}: 난이도 덮어쓰기 없음 (배율은 opts.nightmare 로만)`);
}
ok(NM.prepareNightmare(G(stP2), 'nm_zz') === null, '모르는 id → null');

// ═════════ N4 시련 엔진 연결 ═════════
section('N4 trial.js 연결 (악몽 id → nightmare.js)');
const T01 = TRIAL.trialOf('nm_s01');
ok(T01?.nightmare === true && T01.boss === 'b_nightwing' && T01.room === 'boss' && T01.bossPatterns === true && T01.color === D.NM_COLOR, 'trialOf(nm_s01) → 악몽 행');
ok(T01?.name === `악몽 · ${BOSSES.b_nightwing.name}` && T01.failLine === D.NM_FAIL_LINE, '이름 · 실패 대사');
ok(JSON.stringify(TRIAL.trialRuleNames(T01)) === JSON.stringify([D.NM_TWISTS[e01.twist].name]), '규칙 이름 = 비틀기 이름 하나', TRIAL.trialRuleNames(T01));
ok(TRIAL.trialOf('tr_kael_1') === TRIALS.tr_kael_1, '시련 id 는 그대로 TRIALS');
ok(TRIAL.trialOf('nm_zz') == null, '모르는 id → 없음');
{
  const tri = src('src/game/trial.js'), te = src('src/scenes/trial_end.js'), nmj = src('src/game/nightmare.js'), boss = src('src/game/bosses/boss.js');
  ok(/import \* as NM from '\.\/nightmare\.js'/.test(tri) && !/from '\.\/trial\.js'/.test(nmj), 'trial.js → nightmare.js 한 방향 (순환 없음)');
  for (const fn of ['startTrial', 'prepareTrial', 'retryTrial', 'leaveTrial']) ok(new RegExp(`export function ${fn}[\\s\\S]{0,400}NM\\.isNightmareId`).test(tri), `trial.js ${fn}: 악몽 id 를 넘김`);
  ok(/if \(T\.nightmare\) \{ NM\.attachNightmare\(scene, w, T\); return; \}/.test(tri), 'trial.js attachTrial: 악몽은 attachNightmare');
  ok(/NM\.noteFail\(game, T\.id\)/.test(tri), 'trial.js failTrial: 악몽 도전 횟수는 state.nm');
  ok(/w\.gainExp = \(\) => 0/.test(tri), 'K4: attachTrial 의 gainExp no-op 그대로');
  ok(!/emit\(\s*['"](bossKilled|stageCleared)['"]/.test(nmj), 'nightmare.js: bossKilled · stageCleared 를 내지 않는다');
  ok(/TRIAL\.trialOf\(this\.tid\)/.test(te) && /NM_TITLE/.test(te), 'trial_end.js: 악몽 행 · 제목');
  ok(/world\.opts\?\.nightmare/.test(boss) && /this\.inferno \|\|= !!nm/.test(boss) && /shapeLv/.test(boss), 'boss.js: opts.nightmare → inferno · 배율 · 이야기 모양 레벨');
  ok(!/this\.nm = \{/.test(boss), 'boss.js: 보스 필드 이름 nmScale (네메인의 this.nm 패턴 상태와 겹치지 않게)');
  ok(/import\('\.\/nm_hazards\.js'\)/.test(nmj) && !/^import[^\n]*nm_hazards/m.test(nmj), 'nm_hazards.js 는 늦게 받는다 (첫 화면 번들 밖)');
  ok(!/\bassets\/painted\b|bake\(|requestRig\(/.test(src('src/game/nm_hazards.js')), '감독: 새 그림/굽기 없음');
}

// ═════════ N5 열림 ═════════
section('N5 열림: 이야기에서 그 보스를 이겨야');
{
  const fresh = newGameState({ slot: 2 });
  const r = NM.canStartNightmare(fresh, 'nm_s01');
  ok(!r.ok && r.code === 'story' && r.reason.includes(BOSSES.b_nightwing.name), `새 게임 → 잠김 (${r.reason})`);
  const ch1 = newGameState({ slot: 2 });
  ch1.progress.bosses = ['b_nightwing'];
  ok(NM.canStartNightmare(ch1, 'nm_s01').ok && !NM.canStartNightmare(ch1, 'nm_s02').ok, '1장 보스만 → nm_s01 만 열림');
  const ch1f = newGameState({ slot: 2 });
  ch1f.progress.flags = { ...(ch1f.progress.flags ?? {}), boss_b_nightwing: true };
  ok(NM.canStartNightmare(ch1f, 'nm_s01').ok, '플래그 boss_<id> 로도 열림');
  ok(NM.canStartNightmare({ ...ch1, arcade: true }, 'nm_s01').code === 'mode', '아케이드 상태 → mode');
  ok(NM.canStartNightmare(ch1, 'nm_zz').code === 'unknown', '모르는 id → unknown');
  const open = ids.filter((id) => NM.canStartNightmare(stP2, id).ok);
  const want = ids.filter((id) => stP2.progress.bosses.includes(D.NM[id].boss) || stP2.progress.flags?.['boss_' + D.NM[id].boss] || stP2.progress.cleared?.[D.NM[id].stage]);
  ok(open.length === want.length && open.length >= 20, `p2 세이브: ${open.length}개 열림`, open);
  ok(NM.nmStatus(fresh, 'nm_s01').state === 'locked' && NM.nmStatus(ch1, 'nm_s01').state === 'ready', 'nmStatus locked · ready');
  const ch1d = clone(ch1); ch1d.nm = { nm_s01: { done: true, tries: 1, best: 30, at: 1 } };
  ok(NM.nmStatus(ch1d, 'nm_s01').state === 'done', 'nmStatus done');
  const ng = clone(ch1d); ng.progress.bosses = []; ng.progress.flags = {}; ng.progress.cleared = {};
  ok(NM.canStartNightmare(ng, 'nm_s01').ok, '회차로 이야기 기록이 지워져도 이긴 악몽은 열린 채');
}

// ═════════ N6 기록 · 메타 (K1) ═════════
section('N6 기록 (state.nm) · 메타 nm (K1 → 꾸미기)');
{
  const st = newGameState({ slot: 2 });
  ok(st.nm === undefined && NM.nmRecordOf(st, 'nm_s01') === null, '새 상태: nm 없음 (필요할 때 만든다)');
  const r = NM.nmRecord(st, 'nm_s01');
  ok(r && r.done === false && r.tries === 0 && r.best === null && r.clears === 0 && st.nm.nm_s01 === r, 'nmRecord 만들기');
  ok(NM.nmRecord(st, 'tr_kael_1') === null && !('tr_kael_1' in st.nm), '악몽 아닌 id 는 기록하지 않음');
  const bad = { nm: { nm_s02: { done: 1, tries: -3, best: 'x', clears: 2.5 } } };
  const rb = NM.nmRecord(bad, 'nm_s02');
  ok(rb.done === true && rb.tries === 0 && rb.best === null && rb.clears === 1, '깨진 기록 고치기', rb);
  const meta = {};
  ok(COS.cosContext(meta).nm === 0 && !COS.needMet({ nm: 1 }, COS.cosContext(meta)), '메타에 nm 없음 → 0 · 잠김');
  ok(NM.noteMetaClear(meta, 'nm_s01') === true && NM.noteMetaClear(meta, 'nm_s01') === false, '첫 격파만 새로 (두 번째는 아님)');
  ok(meta.nm.clears === 1 && meta.nm.ids.nm_s01 > 0, 'meta.nm = { clears 1, ids }', meta.nm);
  ok(COS.needMet({ nm: 1 }, COS.cosContext(meta)) && !COS.needMet({ nm: 10 }, COS.cosContext(meta)), 'K1: 악몽 잔상 열림 · 흑장미(10) 잠김');
  for (const id of ids) NM.noteMetaClear(meta, id);
  ok(meta.nm.clears === 25 && COS.needMet({ nm: 25 }, COS.cosContext(meta)), 'K1: 25 모두 → 군주 잔상');
  ok(NM.noteMetaClear(meta, 'nm_zz') === false && meta.nm.clears === 25, '모르는 id 는 세지 않음');
  const m2 = { nm: { clears: 'x', ids: [] } }; NM.nmMeta(m2);
  ok(m2.nm.clears === 0 && typeof m2.nm.ids === 'object' && !Array.isArray(m2.nm.ids), '깨진 메타 nm 고치기', m2.nm);
}

// ═════════ N7 옛 세이브 ═════════
section('N7 옛 세이브 (nm 없음) 그대로 열림 · 왕복');
for (const [name, f] of [['save_v1', FIX_V1], ['save_ch6_nocmp', FIX_CH6], ['save_p2done', FIX]]) {
  let st = null, err = null;
  try { st = quiet(() => migrateState(clone(f))); } catch (e) { err = e.message; }
  ok(st && !err && st.nm === undefined, `${name}: migrateState (nm 없음)`, err);
  if (!st) continue;
  ok(NM.canStartNightmare(st, 'nm_s01').ok, `${name}: 1장 악몽 열림`);
  NM.nmRecord(st, 'nm_s01').tries = 2;
  const back = quiet(() => migrateState(JSON.parse(JSON.stringify(st))));
  ok(back.nm?.nm_s01?.tries === 2, `${name}: state.nm 저장 왕복`);
}

// ═════════ N8 클라우드 합치기 ═════════
section('N8 클라우드: mergeMeta 가 nm 을 지키고 합친다');
{
  const a = { clears: 3, nm: { clears: 2, ids: { nm_s01: 100, nm_s02: 200 } } };
  const b = { clears: 1, nm: { clears: 2, ids: { nm_s01: 50, nm_s05: 300 } } };
  const m = CLOUD.mergeMeta(a, b);
  ok(m.nm && m.nm.ids.nm_s01 === 50 && m.nm.ids.nm_s02 === 200 && m.nm.ids.nm_s05 === 300 && m.nm.clears === 3, '두 기기 합집합 · 이른 시각 · clears 3', m.nm);
  ok(JSON.stringify(CLOUD.mergeMeta({}, b).nm) === JSON.stringify({ clears: 2, ids: { nm_s01: 50, nm_s05: 300 } }), '이 기기에 없으면 서버 것');
  ok(CLOUD.mergeMeta(a, {}).nm.clears === 2 && CLOUD.mergeMeta(a, null).nm.clears === 2, '서버에 없으면 이 기기 것');
  ok(!('nm' in CLOUD.mergeMeta({ clears: 1 }, { clears: 2 })), '둘 다 없으면 nm 을 만들지 않음');
  const rt = JSON.parse(JSON.stringify(CLOUD.cleanMeta(m)));
  ok(JSON.stringify(rt.nm) === JSON.stringify(m.nm), 'cleanMeta → JSON 왕복에 nm 그대로');
  ok(COS.cosContext(rt).nm === 3, '왕복 뒤 K1 nm = 3');
  const evil = CLOUD.mergeMeta({ nm: { clears: 1, ids: { nm_s01: 1, '__proto__': 5, 'x y': 2 } } }, {});
  ok(Object.keys(evil.nm.ids).join() === 'nm_s01', '이상한 키는 버림', evil.nm.ids);
}

// ═════════ N9 감독 규칙 (단위) ═════════
section('N9 감독: 예고 ≥ 0.6초 · 빈 길');
ok(HZ.MIN_WARN >= 0.6 && HZ.GRACE >= 2, `MIN_WARN ${HZ.MIN_WARN} · GRACE ${HZ.GRACE}`);
ok(HZ.safeWidth({ player: { w: 40 } }) === 160 && HZ.safeWidth({ player: { w: 70 } }) === 210, 'safeWidth = max(160, 영웅 폭 × 3)');
ok(HZ.widestGap([], 0, 1000) === 1000 && HZ.widestGap([[100, 300], [250, 600]], 0, 1000) === 400 && HZ.widestGap([[0, 450], [550, 1000]], 0, 1000) === 100, 'widestGap 합치기');
ok(HZ.widestGap([[-50, 2000]], 0, 1000) === 0 && HZ.widestGap([[600, 400]], 0, 1000) === 400, 'widestGap 경계 · 뒤집힌 구간');
{
  const hz = src('src/game/nm_hazards.js');
  // 해를 주는 위험의 예고 (harmless: true 인 표식은 맞지 않으므로 뺀다) + 시계 종의 WARN 상수
  const warns = hz.split('\n').filter((l) => /warn:\s*[0-9.]/.test(l) && !/harmless:\s*true/.test(l)).map((l) => +l.match(/warn:\s*([0-9.]+)/)[1]);
  const clockWarn = +(hz.match(/WARN = ([0-9.]+)/)?.[1] ?? 0);
  ok(warns.length >= 3 && warns.every((w) => w >= HZ.MIN_WARN) && clockWarn >= HZ.MIN_WARN, `코드의 예고 시간 모두 ≥ ${HZ.MIN_WARN} (${warns.join(',')} · 시계 ${clockWarn})`);
  ok(hz.split('\n').filter((l) => /warn:\s*0[,\s]/.test(l)).every((l) => /harmless:\s*true/.test(l)), '예고 0 인 것은 모두 해 없는 표식');
}
console.log(`  노드: ${passes} 통과 · ${fails} 실패 (${((Date.now() - T0) / 1000).toFixed(1)}초)`);

// ═════════ 브라우저 ═════════
async function browserSuite() {
  const { openEnv } = await import(pathToFileURL(path.join(ROOT, 'tools/qa/lib/server.mjs')).href);
  const env = await openEnv();
  const pick = QUICK ? (() => { const seen = new Set(); return ids.filter((id) => { const t = D.NM[id].twist; if (seen.has(t)) return false; seen.add(t); return true; }); })() : ids;
  const plan = pick.filter((id) => !ONLY || ONLY.has(id));
  const withFull = !ONLY || ONLY.has('nm_s01');
  try {
    for (const vp of VPS) {
      section(`B 브라우저 [${vp}] ${plan.length} 악몽${withFull ? ' + 나이트윙 전체 흐름 + 1장 세이브' : ''}`);
      const s = await env.page(vp, 'index.html');
      try {
        await s.waitGame();
        await s.eval(() => {
          const g = window.__game;
          window.__tt = { toasts: [], bus: [], fetchN: 0, fetchUrls: [] };
          const o = g.toast.bind(g);
          g.toast = (t, ...a) => { window.__tt.toasts.push(String(t)); return o(t, ...a); };
          const of = window.fetch.bind(window);
          window.fetch = (...a) => { const u = String(a[0]?.url ?? a[0]); if (!/\.(js|mjs|webp|png|jpg|json|m4a|mp3|ogg|woff2?|css|txt)(\?|$)/.test(u)) { window.__tt.fetchN++; window.__tt.fetchUrls.push(u); } return of(...a); };
        });
        await s.eval(async () => {
          const { bus } = await import('/src/core/events.js');
          for (const ev of ['bossKilled', 'stageCleared', 'bossStarted', 'levelUp', 'nightmareCleared']) bus.on(ev, (d) => window.__tt.bus.push(ev + ':' + (d?.bossId ?? d?.stageId ?? d?.id ?? '')));
        });
        await loadSave(s, FIX);
        for (const id of plan) await fightCase(s, vp, id);
        if (withFull) { await fullCase(s, vp); await ch1Case(s, vp); }
        const errs = s.errs.filter((e) => !/favicon|ERR_FILE_NOT_FOUND|net::ERR_ABORTED/.test(e));
        ok(errs.length === 0, `[${vp}] 페이지 오류 0`, errs.slice(0, 5));
        const fN = await s.eval(() => ({ n: window.__tt.fetchN, u: window.__tt.fetchUrls.slice(0, 5) }));
        ok(fN.n === 0, `[${vp}] 데이터 fetch 0 (악몽은 서버를 부르지 않는다)`, fN);
      } catch (e) {
        ok(false, `[${vp}] 브라우저 예외: ${e.message}`);
        await shot(s, `${vp}_exception`);
      } finally { await s.close(); }
    }
  } finally { await env.close(); }
}

async function shot(s, name) {
  if (!SHOTS) return;
  try { await s.page.screenshot({ path: path.join(SHOTS, `nightmare_${name}.png`), timeout: 15000 }); } catch { /* 페이지 없음 */ }
}
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
const topName = (s) => s.eval(() => window.__game?.top?.name ?? null);
async function skipOverlays(s, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = await topName(s);
    if (!t || !/dialogue|bossIntro/.test(t)) return t;
    await s.key(t === 'bossIntro' ? 'jump' : 'enter', 70);
    await s.wait(120);
  }
  return topName(s);
}
/** 고정 세이브 → 슬롯 3 (디버그 표시) → 마을 */
async function loadSave(s, fix, prep = null) {
  await s.eval(async ({ fix, prep }) => {
    const g = window.__game;
    const { migrateState, newGameState } = await import('/src/game/state.js');
    const st = fix ? migrateState(JSON.parse(JSON.stringify(fix))) : newGameState({ slot: 3 });
    st.slot = 3;
    if (prep === 'ch1') {
      st.progress.bosses = ['b_nightwing'];
      st.progress.cleared = { ...(st.progress.cleared ?? {}), s01: true };
      st.progress.flags = { ...(st.progress.flags ?? {}), boss_b_nightwing: true };
    }
    g.state = st;
    g.go('hub', { from: 'load' }, { fade: false });
  }, { fix, prep });
  await until(s, () => window.__game.top?.name === 'hub' && window.__game.world?.mode === 'town', null, 30000);
  await s.wait(300);
}
const SNAP = () => {
  const st = window.__game.state;
  const heroes = Object.fromEntries(Object.entries(st.heroes).map(([k, h]) => [k, [h.level, h.exp]]));
  return JSON.stringify({ heroes, lives: st.lives, score: st.score, bosses: st.progress.bosses, deaths: st.stats?.deaths ?? 0, bk: st.stats?.bossKills ?? 0, cleared: st.progress.cleared });
};
/** 보스방 들어가기 → { W, B } */
async function enterFight(s, id, opts = {}) {
  await s.eval(async ({ id, from }) => { const NMj = await import('/src/game/nightmare.js'); window.__chk = NMj.startNightmare(window.__game, id, { from }); }, { id, from: opts.from ?? 'church' });
  const W = await until(s, () => { const g = window.__game, w = g.world; return g.top?.name === 'stage' && w?.mode === 'trial' && g.fade.dir <= 0 ? { id: w.trial?.id, room: w.roomId, sid: w.stage.id, lv: w.stage.level, rules: w.rules, nm: w.opts?.nightmare ?? null, banner: w.banner?.text, sub: w.banner?.sub } : null; }, null, 25000);
  if (!W) return { W: null };
  await s.eval(() => { const w = window.__game.world, p = w.player; if (w.arenaX !== undefined) { p.x = w.arenaX + 96; p.vx = 0; } });
  await until(s, () => window.__game.world.bossActive, null, 8000);
  await skipOverlays(s, 20000);
  const B = await s.eval(async () => {
    const w = window.__game.world, b = await w.bossReady();
    if (!b) return null;
    const { enemyStats } = await import('/src/game/enemy.js');
    const { BOSSES } = await import('/src/data/bosses.js');
    const def = BOSSES[b.def?.id ?? b.id] ?? b.def, d = w.diff, lv = w.stage.level, nm = w.opts?.nightmare;
    const shape = Number.isFinite(nm?.baseLevel) ? nm.baseLevel : lv;
    const early = 1 + Math.max(0, 10 - (shape - 1)) * 0.1, late = 1 / (1 + Math.max(0, shape - 24) * 0.035);
    const base = enemyStats({ ...def, lv }, lv, { ...d, enemyHp: (d.bossHp ?? d.enemyHp) }, false);
    return { id: b.def?.id ?? b.id, inferno: b.inferno, nm: b.nmScale ?? null, maxHp: b.stats.maxHp, atk: b.stats.atk, aggro: b.aggro, dAggro: d.aggro ?? 1,
      wantHp: Math.round(base.maxHp * (def.hpMul ?? 1) * early * late * (nm?.hpMul ?? 1)), baseAtk: base.atk };
  });
  return { W, B };
}
async function keepAlive(s, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await s.eval(() => { const w = window.__game.world, p = w?.player; if (p && !p.dead) { p.hp = p.stats.hp; p.iframes = Math.max(p.iframes ?? 0, 0.4); } });
    await s.wait(200);
  }
}
async function killBoss(s) {
  let cleared = false;
  for (let i = 0; i < 40 && !cleared; i++) {
    cleared = await s.eval(() => {
      const w = window.__game.world, b = w.boss, p = w.player;
      if (w.cleared) return true;
      if (b && !b.dead && !(b.dying > 0) && !b.pendingBoss) { b.invuln = false; b.takeHit?.(b.hp + 1, { team: 'player', owner: p, dir: 1, kb: [0, 0], type: 'phys', tags: ['melee'], hitId: 'qa' + Math.random() }, w, {}); }
      if (p) { p.hp = p.stats.hp; p.iframes = 0.5; }
      return w.cleared;
    });
    if (!cleared) { await skipOverlays(s, 3000); await s.wait(350); }
  }
  return cleared;
}
async function killPlayer(s) {
  for (let i = 0; i < 6; i++) {
    const dead = await s.eval(() => {
      const w = window.__game.world, p = w.player;
      if (p.dead || window.__game.top?.name === 'trialEnd') return true;
      p.iframes = 0; p.invuln = false; p.dashT = 0; p.superArmor = 0;
      p.takeHit(p.hp + 99999, { team: 'enemy', dir: 1, kb: [0, 0] }, w, {});
      if (p.hp > 0) { p.hp = 0; p.die?.(w); }
      return p.dead;
    });
    if (dead) return true;
    await s.wait(300);
  }
  return false;
}
const near = (a, b, tol = 0.011) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1, Math.abs(b) * tol);

/** 악몽 하나: 들어가기 · 보스 · 비틀기 · 감독 · AUTO · 경험치 · 포기 */
async function fightCase(s, vp, id) {
  const e = D.NM[id], tw = D.NM_TWISTS[e.twist], tag = `[${vp}] ${id} (${e.boss} · ${e.twist})`;
  // 이 세이브에서 아직 안 깬 보스(외전)는 이야기 기록을 넣어 연다
  await s.eval(({ boss }) => { const p = window.__game.state.progress; if (!p.bosses.includes(boss)) p.bosses.push(boss); }, { boss: e.boss });
  const tries0 = await s.eval((id) => window.__game.state.nm?.[id]?.tries ?? 0, id);
  const snap0 = await s.eval(SNAP);
  await s.eval(() => { window.__tt.toasts.length = 0; });
  const { W, B } = await enterFight(s, id);
  ok(W && W.id === id && W.room === 'boss' && W.sid === e.stage, `${tag}: 악몽 스테이지 (보스방)`, W);
  if (!W) return;
  const heroLv = await s.eval(() => window.__game.state.heroes[window.__game.state.charId].level);
  ok(W.lv === D.nmLevel(e, heroLv), `${tag}: 레벨 ${W.lv}`);
  ok(W.nm && W.nm.id === id && W.nm.hpMul === e.hpMul && W.nm.twist === e.twist, `${tag}: world.opts.nightmare (K2)`, W.nm);
  ok(W.banner === '악몽' && W.sub === `${BOSSES[e.boss].name} · ${tw.name}`, `${tag}: 배너 '악몽' · ${W.sub}`);
  const rk = Object.keys(W.rules ?? {}).filter((k) => k !== 'label');
  ok(W.rules?.label === '악몽의 규칙' && rk.length === (tw.rules ? 1 : 0), `${tag}: 규칙 하나뿐 (${rk.join(',') || '없음'})`, W.rules);
  ok(B && B.id === e.boss, `${tag}: 보스 ${e.boss}`, B?.id);
  if (B) {
    ok(B.inferno === true, `${tag}: inferno === true`);
    ok(B.nm && B.nm.hpMul === e.hpMul && B.nm.atkMul === e.atkMul && B.nm.spMul === e.spMul, `${tag}: boss.nmScale 배율`, B.nm);
    ok(near(B.aggro, B.dAggro * e.spMul, 0.001), `${tag}: aggro = 난이도 × ${e.spMul} (${B.aggro})`);
    ok(near(B.maxHp, B.wantHp), `${tag}: 체력 = 이야기 모양 × ${e.hpMul} (${B.maxHp} / ${B.wantHp})`);
    ok(near(B.atk, Math.round(B.baseAtk * e.atkMul)) || B.atk >= B.baseAtk, `${tag}: 공격 × ${e.atkMul} (${B.atk} / ${B.baseAtk})`);
  }
  // 규칙 안내 토스트 (비틀기 이름)
  ok(await until(s, (n) => window.__tt.toasts.some((t) => t.startsWith(`악몽의 규칙: ${n}`)), tw.name, 4000), `${tag}: 규칙 토스트 '악몽의 규칙: ${tw.name} — …'`);
  const stale = await s.eval((n) => (window.__game.toasts ?? []).map((t) => String(t.text)).filter((t) => t.startsWith('악몽의 규칙:') && !t.startsWith(`악몽의 규칙: ${n}`) && !t.endsWith('쓸 수 없다')), tw.name);
  ok(stale.length === 0, `${tag}: 앞 판의 규칙 안내가 남지 않음`, stale);
  // AUTO 거절
  const A = await s.eval(async () => {
    const AP = await import('/src/game/autoplay.js'), g = window.__game;
    const was = AP.levelOf(g);
    AP.setLevel(g, 'battle', { toast: false });
    await new Promise((r) => setTimeout(r, 450));
    const r = { blocked: AP.autoBlockedIn(g.world), hud: { ...(g.autoHud ?? {}) } };
    AP.setLevel(g, was, { toast: false });
    return r;
  });
  ok(A.blocked === 'trial' && !A.hud.on && A.hud.level === 'off', `${tag}: AUTO 거절`, A);
  // 경험치 0 (K4) · 전리품 없음
  const X = await s.eval(() => { const w = window.__game.world, p = w.player; return { exp: w.gainExp(5000), gold: w.spawnPickup('gold', p.cx, p.y, { amount: 50 }), item: w.spawnPickup('item', p.cx, p.y, { item: { baseId: 'c_potion' } }) }; });
  ok(X.exp === 0 && X.gold === null && X.item === null, `${tag}: 경험치 0 · 금화/아이템 줍기 없음`, X);
  // 감독: 유예를 건너뛰고 첫 위험을 곧바로
  const hasD = await until(s, () => !!window.__game.world.nmDirector, null, 5000);
  ok(hasD, `${tag}: 감독 시작 (nm_hazards.js 늦게 받기)`);
  if (hasD) {
    await s.eval(async ({ G }) => {
      const d = window.__game.world.nmDirector, { widestGap, safeWidth } = await import('/src/game/nm_hazards.js');
      window.__tt.room = [];
      const rf = d.roomFor.bind(d);
      // 빈 길 판정을 밖에서 다시 잰다: 감독이 「놓아도 된다」고 한 때는 언제나 폭 ≥ safeWidth 인 빈 길이 남아야 한다
      d.roomFor = (adds) => { const gap = widestGap([...d.claims(), ...adds], d.A.x0, d.A.x1), r = rf(adds); window.__tt.room.push({ r, gap: Math.round(gap), sw: safeWidth(d.world) }); return r; };
      d.fightT = Math.max(d.fightT, G); d.next = 0;
      if (d.twist === 'doom_clock') d.clockT = d.clockPeriod() - 1.3;
    }, { G: HZ.GRACE });
    await keepAlive(s, d0(e.twist));
    const R = await s.eval(({ sw0 }) => {
      const w = window.__game.world, d = w.nmDirector;
      return { st: { ...d.stats, minWarn: Number.isFinite(d.stats.minWarn) ? d.stats.minWarn : null }, twist: d.twist, dark: w.lighting?.darkness ?? null, room: window.__tt.room.slice(0, 40),
        sw: Math.max(sw0, (w.player?.w ?? 40) * 3), aw: d.A ? d.A.x1 - d.A.x0 : null, minions: w.entities.filter((q) => q.nmMinion && !q.dead).length };
    }, { sw0: 160 });
    ok(R.twist === e.twist, `${tag}: 감독 비틀기 = ${e.twist}`);
    ok(R.aw > R.sw * 1.5, `${tag}: 경기장 폭 ${Math.round(R.aw)} > 빈 길 ${R.sw} × 1.5`);
    if (R.st.minWarn !== null) ok(R.st.minWarn >= HZ.MIN_WARN, `${tag}: 예고 최소 ${R.st.minWarn}초 ≥ ${HZ.MIN_WARN}`);
    ok(R.room.every((q) => q.r === (q.gap >= q.sw)), `${tag}: 빈 길 판정 ${R.room.length}번 모두 맞음 (놓을 때 빈 길 ≥ ${R.sw})`, R.room.filter((q) => q.r !== (q.gap >= q.sw)).slice(0, 4));
    if (tw.hazard) {
      const fired = e.twist === 'doom_clock' ? R.st.tolls >= 1 : e.twist === 'minions' ? R.st.summoned >= 1 : R.st.spawned >= 1;
      ok(fired || R.st.rejects > 0, `${tag}: 위험이 나왔다 (또는 빈 길이 없어 미뤘다)`, R.st);
      if (e.twist === 'minions') ok(R.st.summoned <= 3, `${tag}: 하수인 ≤ 3`, R.st);
    } else {
      ok(R.st.spawned === 0 && R.st.tolls === 0 && R.st.summoned === 0, `${tag}: 위험 없는 비틀기 → 감독은 위험을 놓지 않음`, R.st);
    }
    if (tw.dark) ok(R.dark >= 0.6, `${tag}: 어둠 (darkness ${R.dark})`);
    if (tw.rules?.noPotion) {
      const U = await s.eval(async () => {
        const g = window.__game, st = g.state, h = st.heroes[st.charId];
        const { useItem } = await import('/src/game/inventory.js'), { ITEMS } = await import('/src/data/items.js');
        const it = st.inventory.find((q) => ITEMS[q.baseId]?.use && !ITEMS[q.baseId].use.warp);
        return it ? useItem(st, h, it.uid, g.world.player) : { none: true };
      });
      ok(U.none || (U.ok === false && String(U.msg).startsWith('악몽의 규칙')), `${tag}: 물약 금지`, U);
    }
    if (tw.rules?.noSub) {
      await s.eval(() => { window.__game.world.run.hearts = 20; window.__tt.toasts.length = 0; });
      await s.key('sub', 90);
      ok(await until(s, () => window.__tt.toasts.some((t) => t === '악몽의 규칙: 보조 무기를 쓸 수 없다'), null, 2000), `${tag}: 보조 무기 금지 토스트`);
    }
    if (SHOTS && (id === 'nm_s01' || id === 'nm_s16' || QUICK)) await shot(s, `${vp}_${id}_fight`);
  }
  // 포기 (보스전 도중 = 한 번의 도전) → 마을
  await s.eval((id) => import('/src/game/trial.js').then((TR) => TR.leaveTrial(window.__game, id, 'quit')), id);
  const back = await until(s, () => { const g = window.__game; return g.scenes[0]?.name === 'hub' && g.world?.mode === 'town' ? { from: g.scenes[0].from, top: g.top?.name } : null; }, null, 15000);
  ok(back && back.from === 'church', `${tag}: 포기 → 마을 (성당 앞)`, back);
  const after = await s.eval((id) => ({ tries: window.__game.state.nm?.[id]?.tries ?? 0, dir: window.__game.world?.nmDirector ?? null }), id);
  ok(after.tries === tries0 + 1, `${tag}: 보스전 도중 포기 → 도전 +1 (${tries0} → ${after.tries})`);
  ok(await s.eval(SNAP) === snap0, `${tag}: 영웅 레벨·경험치·목숨·점수·보스 기록 그대로`);
  await s.eval(() => { const g = window.__game; while (g.scenes.length > 1 && g.top?.name !== 'hub') g.pop(); });
  await s.wait(150);
}
/** 비틀기마다 감독을 지켜볼 시간 (ms) */
function d0(t) { return t === 'doom_clock' ? 2600 : t === 'dark' ? 2800 : 1800; }

/** 나이트윙 전체 흐름: 실패 → 다시 도전 → 격파(첫 보상) → 두 번째 격파(보상 없음) → 실패 → 마을로 */
async function fullCase(s, vp) {
  const id = 'nm_s01', e = D.NM[id], tag = `[${vp}] ${id} 전체`;
  await loadSave(s, FIX);
  ok(await s.eval(() => window.__game.state.nm === undefined), `${tag}: 옛 세이브 (nm 없음)으로 시작`);
  const meta0 = await s.eval(() => import('/src/core/save.js').then(({ saves }) => { const m = saves.loadMeta(); return m.nm ?? null; }));
  // ── 실패: 목숨·사망 수 그대로 · 도전 +1 · 실패 화면
  const snap0 = await s.eval(SNAP);
  const { W } = await enterFight(s, id);
  ok(!!W, `${tag}: 들어감`);
  await s.eval(() => { window.__tt.bus.length = 0; });
  await killPlayer(s);
  ok(await until(s, () => window.__game.top?.name === 'trialEnd', null, 12000), `${tag}: 쓰러짐 → 실패 화면`);
  await s.wait(900);
  await shot(s, `${vp}_trialend`);
  const TE = await s.eval(() => { const sc = window.__game.top; return { nm: !!sc.T?.nightmare, line: sc.T?.failLine, tries: sc.tries, idx: sc.menu?.index }; });
  ok(TE.nm && TE.line === D.NM_FAIL_LINE && TE.idx === 0 && TE.tries === 1, `${tag}: 실패 화면 — 악몽 행 · 대사 · 도전 1회 · 「다시 도전」`, TE);
  ok(await s.eval(SNAP) === snap0, `${tag}: 실패해도 목숨·사망 수·레벨·경험치 그대로`);
  // ── 다시 도전 → 새 월드
  await s.eval(() => { window.__tt.w0 = window.__game.world; });
  await s.key('enter');
  ok(await until(s, () => { const g = window.__game; return g.top?.name === 'stage' && g.world?.mode === 'trial' && g.world !== window.__tt.w0 && g.world.trial?.id === 'nm_s01' && g.fade.dir <= 0; }, null, 20000), `${tag}: 「다시 도전」 → 새 악몽 월드`);
  // ── 격파 (첫 번째)
  await s.eval(() => { const w = window.__game.world, p = w.player; if (w.arenaX !== undefined) p.x = w.arenaX + 96; });
  await until(s, () => window.__game.world.bossActive, null, 8000);
  await skipOverlays(s, 20000);
  await s.eval(async () => { await window.__game.world.bossReady(); });
  const pre1 = await s.eval(() => { const st = window.__game.state; return { gold: st.gold, uids: [...st.inventory.map((i) => i.uid), ...(st.progress.lootQueue ?? []).map((i) => i.uid)], snap: null }; });
  const snapA = await s.eval(SNAP);
  await s.eval(() => { window.__tt.bus.length = 0; window.__tt.toasts.length = 0; window.__tt.w1 = window.__game.world; });
  ok(await killBoss(s), `${tag}: 보스 격파 → cleared`);
  const C1 = await s.eval(() => { const w = window.__game.world; return { banner: w.banner?.text, dir: w.nmDirector ? { stopped: !!w.nmDirector.stopped } : null }; });
  ok(C1.banner === '악몽 격파', `${tag}: 배너 '악몽 격파'`, C1);
  await s.wait(400);
  await shot(s, `${vp}_clear`);
  const R1 = await until(s, () => { const w = window.__tt.w1; return w?.nmResult ? { ...w.nmResult, lv: w.stage.level } : null; }, null, 20000);
  ok(R1 && R1.first === true && R1.items.length === 1 && R1.gold === 500 * R1.lv && R1.metaFresh === !meta0?.ids?.nm_s01, `${tag}: 첫 격파 보상 (장비 1 · ${R1?.gold} G)`, R1);
  const post1 = await s.eval((pre) => {
    const st = window.__game.state, all = [...st.inventory, ...(st.progress.lootQueue ?? [])];
    const neu = all.filter((i) => !pre.uids.includes(i.uid));
    return { gold: st.gold, neu: neu.map((i) => ({ id: i.baseId, r: i.rarity })), rec: st.nm?.nm_s01 ?? null };
  }, pre1);
  ok(post1.neu.length === 1 && post1.neu[0].r >= e.reward.rarity, `${tag}: 새 장비 등급 ≥ ${e.reward.rarity}`, post1.neu);
  ok(post1.gold === pre1.gold + R1.gold, `${tag}: 골드 +${R1?.gold}`, { a: pre1.gold, b: post1.gold });
  ok(post1.rec?.done === true && post1.rec.tries === 2 && post1.rec.clears === 1 && post1.rec.best > 0 && post1.rec.first > 0, `${tag}: state.nm 기록 (실패 1 + 격파 1)`, post1.rec);
  const B1 = await s.eval(() => [...window.__tt.bus]);
  ok(B1.some((b) => b.startsWith('nightmareCleared')) && !B1.some((b) => /^(bossKilled|stageCleared|levelUp)/.test(b)), `${tag}: nightmareCleared 만 (bossKilled · stageCleared · levelUp 없음)`, B1);
  ok(await s.eval(SNAP) === snapA, `${tag}: 경험치(대기 영웅 포함)·레벨·목숨·점수·보스 기록 그대로 (K4)`);
  const M1 = await s.eval(() => import('/src/core/save.js').then(({ saves }) => { const m = saves.loadMeta(), d = saves.read(3); return { nm: m.nm, slot: d?.nm?.nm_s01 ?? null, mem: window.__game.meta?.nm ?? null }; }));
  ok(M1.nm?.ids?.nm_s01 > 0 && M1.nm.clears >= 1 && M1.mem?.clears === M1.nm.clears, `${tag}: 메타 저장 nm (K1) clears ${M1.nm?.clears}`, M1.nm);
  ok(M1.slot?.done === true, `${tag}: 슬롯 저장에 state.nm`);
  const H1 = await until(s, () => { const g = window.__game; return g.scenes[0]?.name === 'hub' && g.world?.mode === 'town' ? { from: g.scenes[0].from, top: g.top?.name } : null; }, null, 20000);
  ok(H1 && H1.from === 'church', `${tag}: 격파 → 마을 성당 앞`, H1);
  await s.wait(800);
  await shot(s, `${vp}_back_church`);
  await s.eval(() => { const g = window.__game; while (g.scenes.length > 1 && g.top?.name !== 'hub') g.pop(); });
  // ── 두 번째 격파: 보상 없음 · 메타 그대로
  const clears1 = M1.nm?.clears ?? 0;
  await enterFight(s, id);
  const pre2 = await s.eval(() => { const st = window.__game.state; return { gold: st.gold, n: st.inventory.length + (st.progress.lootQueue ?? []).length }; });
  await s.eval(() => { window.__tt.w2 = window.__game.world; });
  ok(await killBoss(s), `${tag}: 두 번째 격파`);
  const R2 = await until(s, () => window.__tt.w2?.nmResult ?? null, null, 20000);
  const post2 = await s.eval(() => { const st = window.__game.state; return { gold: st.gold, n: st.inventory.length + (st.progress.lootQueue ?? []).length, rec: st.nm?.nm_s01 }; });
  ok(R2 && R2.first === false && R2.items.length === 0 && R2.gold === 0 && R2.metaFresh === false, `${tag}: 두 번째 → 보상 없음`, R2);
  ok(post2.gold === pre2.gold && post2.n === pre2.n && post2.rec?.clears === 2 && post2.rec.tries === 3, `${tag}: 골드·가방 그대로 · 격파 2 · 도전 3`, { pre2, post2 });
  const M2 = await s.eval(() => import('/src/core/save.js').then(({ saves }) => saves.loadMeta().nm));
  ok(M2?.clears === clears1, `${tag}: 메타 clears 그대로 (${M2?.clears})`);
  await until(s, () => window.__game.scenes[0]?.name === 'hub' && window.__game.world?.mode === 'town', null, 20000);
  await s.eval(() => { const g = window.__game; while (g.scenes.length > 1 && g.top?.name !== 'hub') g.pop(); });
  // ── 실패 → 「성당으로」
  await enterFight(s, id);
  await killPlayer(s);
  await until(s, () => window.__game.top?.name === 'trialEnd', null, 12000);
  await s.wait(800);
  await s.key('right'); await s.key('enter');
  const H3 = await until(s, () => { const g = window.__game; return g.scenes[0]?.name === 'hub' && g.world?.mode === 'town' ? { from: g.scenes[0].from } : null; }, null, 15000);
  ok(H3 && H3.from === 'church', `${tag}: 실패 화면 「성당으로」 → 마을 성당`, H3);
  ok((await s.eval(() => window.__game.state.nm?.nm_s01?.tries)) === 4, `${tag}: 도전 4회`);
  await s.eval(() => { const g = window.__game; while (g.scenes.length > 1 && g.top?.name !== 'hub') g.pop(); });
}

/** 1장 세이브 → 월드맵 「악몽」 단추(있으면) → 나이트윙 → 떠나기 */
async function ch1Case(s, vp) {
  const tag = `[${vp}] 1장 세이브`;
  await loadSave(s, null, 'ch1');
  const st = await s.eval(() => ({ lv: window.__game.state.heroes[window.__game.state.charId].level, nm: window.__game.state.nm }));
  ok(st.nm === undefined, `${tag}: nm 없는 새 슬롯`);
  // 월드맵 「악몽」 단추 (P3b) — 있으면 그것으로, 없으면 startNightmare(from 'worldmap')
  let via = 'api';
  await s.eval(() => { const g = window.__game; if (g.registry?.worldmap) g.push('worldmap', { world: g.world, from: 'hub' }); });
  await s.wait(900);
  const btn = await s.eval(() => import('/src/core/ui.js').then(({ taps }) => (taps.zones?.() ?? []).find((z) => z.hit && /nightmare|^nm[_:]/i.test(String(z.id)))?.id ?? null));
  if (btn) {
    const p = await s.eval((id) => import('/src/core/ui.js').then(({ taps }) => { const g = window.__game, z = taps.zones().find((q) => q.id === id), c = g.canvas.getBoundingClientRect(), k = c.width / g.viewW; return { x: c.left + (z.x + z.w / 2) * z.k * k, y: c.top + (z.y + z.h / 2) * z.k * k }; }), btn);
    await s.page.touchscreen.tap(p.x, p.y); await s.wait(300);
    if (!(await until(s, () => window.__game.world?.mode === 'trial', null, 2500))) { await s.page.touchscreen.tap(p.x, p.y); await s.wait(300); }
    if (await until(s, () => window.__game.world?.mode === 'trial', null, 4000)) via = 'button';
  }
  if (via !== 'button') {
    await s.eval(() => { const g = window.__game; while (g.scenes.length > 1 && g.top?.name !== 'hub') g.pop(); });
    await s.eval(() => import('/src/game/nightmare.js').then((N) => N.startNightmare(window.__game, 'nm_s01', { from: 'worldmap' })));
  }
  const W = await until(s, () => { const g = window.__game, w = g.world; return g.top?.name === 'stage' && w?.mode === 'trial' && g.fade.dir <= 0 ? { id: w.trial?.id, lv: w.stage.level } : null; }, null, 25000);
  ok(W && W.id === 'nm_s01' && W.lv === D.nmLevel(D.NM.nm_s01, st.lv), `${tag}: ${via === 'button' ? '월드맵 단추' : 'startNightmare(worldmap)'} → 나이트윙 악몽 (Lv ${W?.lv})`, W);
  await s.eval(() => { const w = window.__game.world, p = w.player; if (w.arenaX !== undefined) p.x = w.arenaX + 96; });
  await until(s, () => window.__game.world.bossActive, null, 8000);
  await skipOverlays(s, 20000);
  const b = await s.eval(async () => { const b = await window.__game.world.bossReady(); return { id: b?.def?.id, inferno: b?.inferno }; });
  ok(b.id === 'b_nightwing' && b.inferno === true, `${tag}: 나이트윙 inferno`, b);
  await keepAlive(s, 1200);
  await s.eval(() => import('/src/game/trial.js').then((TR) => TR.leaveTrial(window.__game, 'nm_s01', 'quit')));
  const H = await until(s, () => { const g = window.__game; return g.scenes[0]?.name === 'hub' && g.world?.mode === 'town' ? { from: g.scenes[0].from } : null; }, null, 15000);
  ok(H && H.from === 'nightmare', `${tag}: 떠나기 → 마을 (동쪽 문, from 'nightmare')`, H);
  ok(await s.eval(() => (window.__game.state.nm?.nm_s01?.tries ?? 0) === 1 && !window.__game.state.nm.nm_s01.done), `${tag}: 도전 1 · 격파 없음`);
}

if (BROWSER) await browserSuite();
console.log(`${fails ? '✗' : '✓'} test_nightmare: ${passes} 통과 · ${fails} 실패 (${((Date.now() - T0) / 1000).toFixed(1)}초)`);
process.exit(fails ? 1 : 0);
