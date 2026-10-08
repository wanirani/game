// 시련 「메아리」 엔진 시험 (docs/specs/classes_t3.md §9 · §11.1, story_ext.md §2–§4) — owner: TRIALS-ENGINE
//   node tools/test_trials.mjs                 정적 시험 + 브라우저 (데스크톱 + phone2)
//   node tools/test_trials.mjs --static        정적 시험만 (< 5초)
//   node tools/test_trials.mjs --vp desk       브라우저 화면 고르기 (desk,phone2)
//   node tools/test_trials.mjs --only kael     브라우저 영웅 고르기 (쉼표)
//   --shots DIR   스크린숏 (JPEG) 저장 폴더 (기본: 저장 안 함)
//   --quick       데스크톱은 4 케이스만 (기본: 14 시련 모두 — 나머지 9개는 통과 경로만)
// 정적: TRIALS 행 ↔ STAGES 보스방 · 대본 존재 · 규칙/난이도 덮어쓰기(prepareTrial) · 시작 조건 · 옛 세이브(trials 없음) · NG+ 가 기록을 지킴 · 장면 연결 줄
// 브라우저: 고정 세이브(tools/fixtures/save_p2done.json — 영웅에 trials 필드가 없는 옛 세이브)로
//   성당(전직 탭) → pre 대본 → 시련 보스방 (전리품·경험치·상자·세이브 지점 없음, 「시련의 결계」, 규칙 토스트) → 보스 처치 →
//   bossKilled 없음 · 진행/가방/골드/목숨/점수 그대로 · 기록·해금·슬롯 저장 → win 대본 → 마을 성당 앞 → 성당 (새 칸)
//   실패 → TrialEndScene → 다시 도전(새 월드) / 성당으로 · 일시정지 「시련 포기」 · 시련 Ⅱ (비전 해금)
// 브라우저 시험이 디스크 부족으로 흔들리면 TMPDIR=/dev/shm/<dir> 로 돌린다 (requests_f BM-FOLLOWUP VERIFY 메모).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const T0 = Date.now();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const STATIC_ONLY = argv.includes('--static');
const QUICK = argv.includes('--quick');   // 브라우저: 데스크톱 4 케이스만 (14 시련 전부 대신)
const VPS = (arg('--vp', 'desk,phone2')).split(',').map((s) => s.trim()).filter(Boolean);
const ONLY = arg('--only') ? new Set(arg('--only').split(',').map((s) => s.trim())) : null;
const SHOTS = arg('--shots');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let fails = 0, passes = 0;
const ok = (cond, msg, extra) => { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const section = (t) => console.log('▶ ' + t);
const clone = (o) => JSON.parse(JSON.stringify(o));
const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };

const { TRIALS, TRIAL_IDS, trialsOf } = await imp('src/data/trials.js');
const { STAGES } = await imp('src/data/stages.js');
const { SCRIPTS } = await imp('src/data/story.js');
const { DAILY_MODS } = await imp('src/core/online.js');
const { DIFF, getDiff } = await imp('src/data/difficulty.js');
const { CHARACTERS } = await imp('src/data/characters.js');
const { ASCENSIONS, unlocksOf } = await imp('src/data/ascensions.js');
const PROG = await imp('src/game/progression.js');
const { migrateState } = await imp('src/game/state.js');
const NG = await imp('src/game/ngplus.js');
const TRIAL = await imp('src/game/trial.js');
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/save_p2done.json'), 'utf8'));
const HEROES = ['kael', 'sera', 'victor', 'bran', 'lia', 'azel', 'isolde'];

// ═════════ S1 시련 표 ↔ 스테이지 보스방 · 대본 ═════════
section('S1 시련 표 (14) ↔ STAGES 보스방 · 대본 · 규칙');
const ids = Object.keys(TRIALS);
ok(ids.length === 14 && (TRIAL_IDS?.length ?? 14) === 14, `시련 14개 (${ids.length})`);
for (const h of HEROES) {
  const L = trialsOf(h);
  ok(L.length === 2 && L[0].n === 1 && L[1].n === 2 && L[0].id === `tr_${h}_1` && L[1].id === `tr_${h}_2`, `${h}: trialsOf → [Ⅰ, Ⅱ]`, L.map((t) => t.id));
}
for (const id of ids) {
  const T = TRIALS[id], S = STAGES[T.stage], room = S?.rooms?.[T.room];
  ok(T.id === id && CHARACTERS[T.charId], `${id}: id·charId`);
  ok(!!room && !!room.boss, `${id}: ${T.stage}.rooms.${T.room} 보스방`);
  ok((room?.bossId ?? S?.boss) === T.boss, `${id}: 그 방의 본래 보스 ${T.boss}`, room?.bossId ?? S?.boss);
  for (const k of ['pre', 'win', 'preAgain', 'winAgain']) ok(Array.isArray(SCRIPTS[T[k]]) && SCRIPTS[T[k]].length > 0, `${id}: 대본 ${k} '${T[k]}'`);
  ok(T.pre === `${id}_pre` && T.win === `${id}_win` && T.preAgain === 'tr_again_pre' && T.winAgain === 'tr_again_win', `${id}: 대본 id 규칙`);
  ok((T.mods ?? []).every((m) => Object.hasOwn(DAILY_MODS, m) && m !== 'dark'), `${id}: 규칙 ⊂ DAILY_MODS · dark 없음`, T.mods);
  ok(T.level >= T.reqLevel && T.recLv >= T.reqLevel, `${id}: level ≥ recLv ≥ reqLevel`);
  ok(!T.reqFlag || (typeof T.reqText === 'string' && T.reqText.length > 0), `${id}: reqFlag 면 reqText`);
  ok(typeof T.failLine === 'string' && T.failLine.length > 0 && T.failLine.length <= 44, `${id}: failLine (엘리제, ≤ 44자)`, T.failLine);
  ok(typeof T.bg === 'string' && fs.existsSync(path.join(ROOT, 'assets/bg', T.bg + '.webp')), `${id}: win bg 'bg/${T.bg}' 파일`);
}

// ═════════ S2 prepareTrial (규칙·난이도·적 레벨) ═════════
section('S2 prepareTrial: 스테이지 복사본 · 규칙 라벨 · bossHp 배율(난이도 기준) · 적 레벨');
for (const diff of Object.keys(DIFF)) {
  const D = getDiff(diff);
  for (const id of ids) {
    const T = TRIALS[id], P = TRIAL.prepareTrial({ state: { difficulty: diff } }, id);
    if (!P) { ok(false, `${diff}/${id}: prepareTrial`); continue; }
    const { stage, opts } = P;
    ok(stage !== STAGES[T.stage] && stage.id === T.stage && stage.rooms === STAGES[T.stage].rooms && stage.intro == null && stage.outro == null && stage.next == null && Array.isArray(stage.unlocks) && !stage.unlocks.length, `${diff}/${id}: 스테이지 복사본 (intro/outro/next/unlocks 없음)`);
    ok(opts.mode === 'trial' && opts.roomId === 'boss' && opts.trial === T && opts.levelOverride === T.level, `${diff}/${id}: mode·roomId·trial·levelOverride`);
    ok(opts.rules?.label === '시련의 규칙', `${diff}/${id}: rules.label`);
    ok(!!opts.rules.noSub === (T.mods ?? []).includes('no_sub') && !!opts.rules.noPotion === (T.mods ?? []).includes('no_potion') && (opts.rules.taken === 2) === (T.mods ?? []).includes('glass'), `${diff}/${id}: 규칙 플래그`, opts.rules);
    const baseBoss = D.bossHp ?? D.enemyHp ?? 1;
    const wantBoss = T.diffOver?.bossHp ? baseBoss * T.diffOver.bossHp : undefined;
    ok(wantBoss === undefined ? opts.diffOver.bossHp === undefined : Math.abs(opts.diffOver.bossHp - wantBoss) < 1e-9, `${diff}/${id}: bossHp = 난이도 ${baseBoss} × ${T.diffOver?.bossHp ?? '-'}`, opts.diffOver);
    if ((T.mods ?? []).includes('haste')) ok(Math.abs(opts.diffOver.enemySpeed - (D.enemySpeed ?? 1) * 1.25) < 1e-9, `${diff}/${id}: haste → enemySpeed × 1.25`);
  }
}
ok(TRIAL.prepareTrial({ state: {} }, 'tr_nobody_1') === null && TRIAL.prepareTrial({ state: {} }, '__proto__') === null, '모르는 시련 → null');
ok(TRIAL.trialRuleNames(TRIALS.tr_kael_1).join(' · ') === '보조 무기 금지 · 보스 체력 1.3배', '규칙 이름 (성당 확인 창과 같은 표기)', TRIAL.trialRuleNames(TRIALS.tr_kael_1));

// ═════════ S3 시작 조건 · 옛 세이브 · 기록 ═════════
section('S3 시작 조건 (canStartTrial) · 옛 세이브(trials 없음) · trialRecord');
const fresh = () => { const s = quiet(() => migrateState(clone(FIX))); for (const h of HEROES) s.heroes[h].level = 80; return s; };
{
  const s = fresh();
  ok(HEROES.every((h) => !Object.hasOwn(s.heroes[h], 'trials')), '고정 세이브 영웅에 trials 필드 없음 (옛 세이브 — migrateAsc 가 만들지 않는다)');
  s.charId = 'kael';
  const k = s.heroes.kael;
  ok(PROG.canStartTrial(k, 'tr_kael_1', s).ok, 'kael Ⅰ 시작 가능 (Lv 80 · 2차 · p2_done)');
  ok(PROG.canStartTrial(k, 'tr_kael_2', s).code === 'prev', 'kael Ⅱ: Ⅰ 먼저 (prev)');
  ok(PROG.canStartTrial(k, 'tr_sera_1', s).code === 'hero', '다른 영웅의 시련 → hero');
  const s2 = clone(s); s2.progress.flags.p2_done = false;
  ok(PROG.canStartTrial(s2.heroes.kael, 'tr_kael_1', s2).code === 'p2', 'p2_done 없으면 → p2');
  const s3 = clone(s); s3.heroes.kael.level = 69;
  ok(PROG.canStartTrial(s3.heroes.kael, 'tr_kael_1', s3).code === 'level', 'Lv 69 → level');
  const s4 = clone(s); s4.heroes.kael.classId = 'kael_hunter';
  ok(PROG.canStartTrial(s4.heroes.kael, 'tr_kael_1', s4).code === 'tier', '1차 직업 → tier');
  const s5 = clone(s); s5.charId = 'victor'; delete s5.progress.flags.ex_s23_done;
  ok(PROG.canStartTrial(s5.heroes.victor, 'tr_victor_1', s5).code === 'story', 'victor Ⅰ: 외전 플래그 없으면 → story');
  // trialRecord: 옛 영웅에 trials 를 만들고 모양을 고친다
  const h = clone(k);
  const r = TRIAL.trialRecord(h, 'tr_kael_1');
  ok(h.trials && r === h.trials.tr_kael_1 && r.done === false && r.at === 0 && r.best === null && r.tries === 0, 'trialRecord: trials 없는 영웅 → { done:false, at:0, best:null, tries:0 }', r);
  h.trials.tr_kael_1 = { done: 1, at: 'x', best: -3, tries: 2.5 };
  const r2 = TRIAL.trialRecord(h, 'tr_kael_1');
  ok(r2.done === true && r2.at === 0 && r2.best === null && r2.tries === 0, 'trialRecord: 이상한 값 정리', r2);
  // 통과 → 해금 (ascUnlocked 없던 영웅)
  const h2 = clone(k); delete h2.ascUnlocked;
  const added = PROG.unlockFromTrial(h2, 'tr_kael_1');
  ok(added.length === 4 && unlocksOf('tr_kael_1').every((id) => h2.ascUnlocked.includes(id)), 'unlockFromTrial: Ⅰ → 초월 4개', added);
  // 다시 하기: 통과한 시련은 'story' 조건 없이
  const s6 = clone(s5); s6.heroes.victor.trials = { tr_victor_1: { done: true, at: 1, best: 50, tries: 1 } };
  ok(PROG.canStartTrial(s6.heroes.victor, 'tr_victor_1', s6).ok, '통과한 시련 다시 하기는 외전 조건 없이');
}

// ═════════ S4 NG+ 가 기록을 지킨다 ═════════
section('S4 NG+: hero.trials · ascUnlocked 유지, 시작은 이번 회차 p2_done 필요, 초월은 회차로 허용');
{
  const s = fresh(); s.charId = 'kael';
  const k = s.heroes.kael;
  TRIAL.trialRecord(k, 'tr_kael_1'); Object.assign(k.trials.tr_kael_1, { done: true, at: 1730000000000, best: 51.2, tries: 3 });
  PROG.unlockFromTrial(k, 'tr_kael_1');
  const ng = quiet(() => NG.startNgPlus(s, { slot: 3, now: 1760000000000 }));
  const st = ng?.state ?? ng;
  const k2 = st?.heroes?.kael;
  ok(k2 && k2.trials?.tr_kael_1?.done === true && k2.trials.tr_kael_1.best === 51.2 && k2.trials.tr_kael_1.tries === 3, 'NG+: hero.trials 그대로', k2?.trials);
  ok(unlocksOf('tr_kael_1').every((id) => k2?.ascUnlocked?.includes(id)), 'NG+: ascUnlocked 그대로');
  const m2 = st ? quiet(() => migrateState(clone(st))) : null;
  ok(m2?.heroes?.kael?.trials?.tr_kael_1?.done === true, 'NG+ 세이브 다시 불러오기(migrateState) 뒤에도 기록 유지');
  if (st) {
    ok(PROG.canStartTrial(k2, 'tr_kael_1', st).code === 'p2', 'NG+ 새 회차: 시련 시작은 이번 회차 p2_done 전까지 잠김 (p2)');
    ok(PROG.canAscend(k2, 'kael_grandtemplar', st).ok, 'NG+ 새 회차: 해금된 초월은 고를 수 있다 (p2Cleared ← ng.n)', PROG.canAscend(k2, 'kael_grandtemplar', st));
  }
}

// ═════════ S5 장면 연결 (소스) ═════════
section('S5 장면 연결: stage.js · index.js · pause.js · hub.js · trial.js API');
{
  const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const stage = src('src/scenes/stage.js'), index = src('src/scenes/index.js'), pause = src('src/scenes/pause.js'), hub = src('src/scenes/town/hub.js'), tri = src('src/game/trial.js');
  ok(/TRIAL\.prepareTrial\(/.test(stage) && /TRIAL\.attachTrial\(/.test(stage), 'stage.js: prepareTrial → World → attachTrial');
  ok(/import \{ TrialEndScene \} from '\.\/trial_end\.js'/.test(index) && /game\.register\('trialEnd', TrialEndScene\)/.test(index) && index.indexOf("register('gameover'") < index.indexOf("register('trialEnd'"), "index.js: 'trialEnd' 등록 (gameover 다음)");
  ok(/'시련 포기'/.test(pause) && /TRIAL\.leaveTrial\(this\.game, tid, 'quit'\)/.test(pause) && /classNameOf\(hero\)/.test(pause) && !/CLASSES\[hero\.classId\]/.test(pause), "pause.js: '시련 포기' → leaveTrial · classNameOf");
  const nCmp = (hub.match(/CMP\.companionHubEnter\?\.\(g, this\);/g) ?? []).length, nDir = (hub.match(/STORYDIR\.hubStoryEnter\?\.\(g, this\);/g) ?? []).length;
  ok(nCmp >= 3 && nCmp === nDir, `hub.js: companionHubEnter 뒤마다 hubStoryEnter (${nCmp} / ${nDir})`);
  ok(/spawn === 'church'/.test(hub) && /this\.from !== 'church'/.test(hub) && /open === 'church'/.test(hub) && /classNameOf\(hero\)/.test(hub), "hub.js: 성당 앞 시작 · back 에서 'church' 제외 · 성당 열기 · classNameOf");
  for (const fn of ['startTrial', 'prepareTrial', 'attachTrial', 'retryTrial', 'leaveTrial']) ok(typeof TRIAL[fn] === 'function', `trial.js export ${fn}`);
  ok(TRIAL.TRIAL_STATS && typeof TRIAL.TRIAL_STATS === 'object', 'trial.js export TRIAL_STATS');
  ok(!/emit\(\s*['"](bossKilled|stageCleared)['"]/.test(tri), 'trial.js 코드: bossKilled · stageCleared 를 내지 않는다');
}
console.log(`  정적: ${passes} 통과 · ${fails} 실패 (${((Date.now() - T0) / 1000).toFixed(1)}초)`);

// ═════════ 브라우저 ═════════

async function browserSuite() {
  const { openEnv } = await import(pathToFileURL(path.join(ROOT, 'tools/qa/lib/server.mjs')).href);
  const env = await openEnv();
  // 화면마다: full = 실패·다시 도전·포기·성당으로까지, ui = 성당 화면을 키/탭으로 몬다, cont = 앞 케이스의 세이브를 이어 쓴다
  const PLAN = {
    desk: [
      { c: 'kael', t: 'tr_kael_1', full: true, ui: true },
      { c: 'kael', t: 'tr_kael_2', cont: true },
      { c: 'bran', t: 'tr_bran_1' },
      { c: 'isolde', t: 'tr_isolde_1' },
      // §11.1 "14 시련 모두": 나머지 9개 (prep = 외전 플래그 + Ⅱ 는 Ⅰ 통과 기록을 미리 넣는다). --quick 이면 건너뛴다
      ...(QUICK ? [] : ['tr_sera_1', 'tr_sera_2', 'tr_victor_1', 'tr_victor_2', 'tr_bran_2', 'tr_lia_1', 'tr_lia_2', 'tr_azel_2', 'tr_isolde_2'].map((t) => ({ c: TRIALS[t].charId, t, prep: true }))),
    ],
    phone2: [
      { c: 'bran', t: 'tr_bran_1', full: true, ui: true },
      { c: 'isolde', t: 'tr_isolde_1' },
      { c: 'azel', t: 'tr_azel_1' },
    ],
  };
  try {
    for (const vp of VPS) {
      const plan = (PLAN[vp] ?? PLAN.desk).filter((p) => !ONLY || ONLY.has(p.c));
      if (!plan.length) continue;
      section(`B 브라우저 [${vp}] ${plan.map((p) => p.t).join(' · ')}`);
      const s = await env.page(vp, 'index.html');
      try {
        await s.waitGame();
        await s.eval(() => {   // 토스트 기록 · bus 기록
          const g = window.__game;
          window.__tt = { toasts: [], bus: [] };
          const o = g.toast.bind(g);
          g.toast = (t, ...a) => { window.__tt.toasts.push(String(t)); return o(t, ...a); };
        });
        await s.eval(async () => {
          const { bus } = await import('/src/core/events.js');
          for (const ev of ['bossKilled', 'stageCleared', 'bossStarted', 'levelUp']) bus.on(ev, (d) => window.__tt.bus.push(ev + ':' + (d?.bossId ?? d?.stageId ?? '')));
        });
        for (const P of plan) await runCase(s, vp, P);
        const errs = s.errs.filter((e) => !/favicon|ERR_FILE_NOT_FOUND|net::ERR_ABORTED/.test(e));
        ok(errs.length === 0, `[${vp}] 페이지 오류 0`, errs.slice(0, 5));
      } catch (e) {
        ok(false, `[${vp}] 브라우저 케이스 예외: ${e.message}`);
        await shot(s, `${vp}_exception`);
      } finally { await s.close(); }
    }
  } finally { await env.close(); }
}

async function shot(s, name) {
  if (!SHOTS) return;
  try { await s.page.screenshot({ path: path.join(SHOTS, `trials-engine_${name}.jpg`), type: 'jpeg', quality: 72, scale: 'css', timeout: 15000 }); } catch { /* 페이지 없음 */ }
}
/** 조건이 참이 될 때까지 (ms) */
async function until(s, fn, arg, ms = 20000, step = 100) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await s.eval(fn, arg); } catch (e) { if (!/context was destroyed|navigation/i.test(String(e?.message))) throw e; }
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await s.wait(step);
  }
}
const topName = (s) => s.eval(() => window.__game?.top?.name ?? null);
/** 탭 영역(ui.taps) 가운데를 실제 터치로 누른다 */
async function tapZone(s, id) {
  const p = await s.eval((id) => {
    const g = window.__game;
    return import('/src/core/ui.js').then(({ taps }) => {
      const z = taps.zones().find((q) => q.id === id && q.hit);
      if (!z) return null;
      const c = g.canvas.getBoundingClientRect(), k = c.width / g.viewW;
      return { x: c.left + (z.x + z.w / 2) * z.k * k, y: c.top + (z.y + z.h / 2) * z.k * k };
    });
  }, id);
  if (!p) return false;
  await s.page.touchscreen.tap(p.x, p.y);
  await s.wait(220);
  return true;
}
/** 대화·컷신·보스 소개를 넘긴다 (키보드) */
async function skipOverlays(s, names = /dialogue|bossIntro/, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = await topName(s);
    if (!t || !names.test(t)) return t;
    await s.key(t === 'bossIntro' ? 'jump' : 'enter', 70);
    await s.wait(120);
  }
  return topName(s);
}
/** 비교용 스냅숏 (시련이 건드리면 안 되는 것) */
const SNAP = () => {
  const st = window.__game.state, h = st.heroes[st.charId];
  const flags = Object.fromEntries(Object.entries(st.progress.flags).filter(([k]) => k !== 'echo_known' && !k.startsWith('cmpq_')));
  return JSON.stringify({ inv: st.inventory, gold: st.gold, exp: h.exp, lv: h.level, lives: st.lives, score: st.score, bosses: st.progress.bosses, flags, bk: st.stats?.bossKills ?? 0, deaths: st.stats?.deaths ?? 0, docs: st.progress.docs, secrets: st.progress.secrets });
};

async function runCase(s, vp, P) {
  const T = TRIALS[P.t], tag = `[${vp}] ${P.t}`;
  // ── 세이브 준비 (옛 세이브: 영웅에 trials 없음) → 마을 → 성당 전직 탭
  await s.eval(async ({ fix, c, cont, prep, t }) => {
    const g = window.__game;
    const { migrateState } = await import('/src/game/state.js');
    if (!cont) {
      const st = migrateState(JSON.parse(JSON.stringify(fix)));
      st.slot = 3;
      for (const h of Object.values(st.heroes)) h.level = Math.max(h.level, 80);
      g.state = st;
    }
    g.state.charId = c;
    if (prep) {   // 고정 세이브에 없는 외전 플래그(빅터 Ⅰ) · 시련 Ⅱ 는 Ⅰ 통과 기록과 해금
      g.state.progress.flags.ex_s23_done = true;
      if (t.endsWith('_2')) {
        const TR = await import('/src/game/trial.js'), { unlockFromTrial } = await import('/src/game/progression.js');
        const h = g.state.heroes[c], t1 = t.replace(/_2$/, '_1'), r = TR.trialRecord(h, t1);
        r.done = true; r.tries = 1; r.best = 50; r.at = 1;
        unlockFromTrial(h, t1);
      }
    }
    g.go('hub', { from: 'load' }, { fade: false });
  }, { fix: FIX, c: P.c, cont: !!P.cont, prep: !!P.prep, t: P.t });
  ok(await until(s, () => window.__game.top?.name === 'hub' && window.__game.world?.mode === 'town', null, 30000), `${tag}: 마을`);
  await s.wait(400);
  if (!P.cont && !(P.prep && T.n === 2)) ok(await s.eval((c) => !Object.hasOwn(window.__game.state.heroes[c], 'trials'), P.c), `${tag}: 옛 세이브 영웅 (trials 필드 없음)`);
  const snap0 = await s.eval(SNAP);
  const tries0 = await s.eval(({ c, t }) => window.__game.state.heroes[c].trials?.[t]?.tries ?? 0, { c: P.c, t: P.t });
  await s.eval(() => { const g = window.__game; g.push('church', { world: g.world, from: 'hub', tab: 'class' }); });
  ok(await until(s, () => window.__game.top?.name === 'church' && window.__game.top.ascMode, null, 8000), `${tag}: 성당 「초월의 길」`);
  await s.wait(500);
  // ── 시련 시작: 성당 카드(키/탭) → 확인 창 → startTrial
  const cardIdx = T.n === 1 ? 0 : 2;
  let viaUi = false;
  if (P.ui) {
    if (vp === 'desk') {
      if (cardIdx === 2) await s.key('down');
      await s.key('enter'); await s.wait(350);
      const modal = await s.eval(() => !!window.__game.top?.modal);
      if (modal) { await s.key('enter'); await s.wait(300); viaUi = (await topName(s)) === 'dialogue'; }
    } else {
      await tapZone(s, `card:${cardIdx}`);
      if (!(await s.eval(() => !!window.__game.top?.modal))) await tapZone(s, `card:${cardIdx}`);
      await s.wait(300);
      if (await s.eval(() => !!window.__game.top?.modal)) {
        const zones = await s.eval(() => import('/src/core/ui.js').then(({ taps }) => taps.zones().filter((z) => z.hit).map((z) => String(z.id))));
        const okId = zones.find((z) => /ok|modal:0|btn0|m0|yes/.test(z)) ?? null;
        if (okId) await tapZone(s, okId); else await s.key('enter');
        await s.wait(300);
        viaUi = (await topName(s)) === 'dialogue';
      }
    }
    ok(viaUi, `${tag}: 성당 카드 → 확인 창 → 대본 (${vp === 'desk' ? '키보드' : '터치'})`);
  }
  if (!viaUi) await s.eval(async (t) => { const TR = await import('/src/game/trial.js'); TR.startTrial(window.__game, t); }, P.t);
  // ── pre 대본 (처음: tr_<hero>_<n>_pre, 다시: tr_again_pre)
  const pre = await until(s, () => window.__game.top?.name === 'dialogue' && window.__game.top.lines?.length, null, 5000);
  const wantPre = tries0 > 0 || P.again ? T.preAgain : T.pre;
  ok(pre === SCRIPTS[wantPre]?.length, `${tag}: pre 대본 '${wantPre}' (${pre} 줄)`);
  ok(await s.eval((slot) => import('/src/core/save.js').then(({ saves }) => !!saves.read(slot)), 3), `${tag}: 출발 전에 슬롯 저장`);
  await s.key('menu'); await s.wait(250);   // 대본 넘기기 → 시련 스테이지
  const W = await until(s, () => { const g = window.__game, w = g.world; return g.top?.name === 'stage' && w?.mode === 'trial' && g.fade.dir <= 0 ? { id: w.trial?.id, room: w.roomId, banner: w.banner?.text, sub: w.banner?.sub, rules: w.rules, ng: !!w.ngBoss, lv: w.stage.level, sid: w.stage.id, bossHp: w.diff.bossHp } : null; }, null, 25000);
  ok(W && W.id === P.t && W.room === 'boss' && W.sid === T.stage, `${tag}: 시련 스테이지 (mode 'trial', ${T.stage} 보스방)`, W);
  if (!W) return;
  ok(W.banner === '시련' && W.sub === T.name, `${tag}: 시작 배너 '시련' · ${T.name}`, { b: W.banner, s: W.sub });
  ok(W.rules?.label === '시련의 규칙' && W.ng === !!T.bossPatterns && W.lv === T.level, `${tag}: 규칙 라벨 · 보스 패턴 · 적 레벨 ${T.level}`, W);
  await s.wait(350);
  await shot(s, `${vp}_${P.t}_banner`);
  // 상자·세이브 지점·이야기 트리거·배치 아이템 없음, 금화/아이템 줍기 안 생김
  const E = await s.eval(() => {
    const w = window.__game.world, p = w.player;
    const kinds = w.entities.map((e) => e.constructor?.name);
    const gold = w.spawnPickup('gold', p.cx, p.y, { amount: 50 });
    const item = w.spawnPickup('item', p.cx, p.y, { item: { baseId: 'c_potion' } });
    const heart = w.spawnPickup('heart', p.cx, p.y, {});
    if (heart) heart.dead = true;
    return { chest: kinds.includes('Chest'), save: kinds.includes('SavePoint'), trig: kinds.includes('StoryTrigger'), gold, item, heart: !!heart, exp: w.gainExp(5000) };
  });
  ok(!E.chest && !E.save && !E.trig, `${tag}: 상자·세이브 지점·이야기 트리거 없음`, E);
  ok(E.gold === null && E.item === null && E.heart, `${tag}: 금화·아이템 줍기 안 생김, 하트는 생김`, E);
  ok(E.exp === 0, `${tag}: gainExp → 0`);
  // 「시련의 결계」: 왼쪽 출구로 걸어 나가도 방이 그대로
  const blk = await s.eval(async () => {
    const g = window.__game, w = g.world, p = w.player;
    window.__tt.toasts.length = 0;
    p.x = 4; p.vx = -200;
    w.gotoRoom('elsewhere');
    return { room: w.roomId, tr: w.transitioning, x: p.x, toast: window.__tt.toasts.includes('시련의 결계가 길을 막는다') };
  });
  await s.page.keyboard.down('ArrowLeft'); await s.wait(700); await s.page.keyboard.up('ArrowLeft');
  const blk2 = await s.eval(() => ({ room: window.__game.world.roomId, x: window.__game.world.player.x, tr: window.__game.world.transitioning }));
  ok(blk.room === 'boss' && !blk.tr && blk.toast && blk2.room === 'boss' && !blk2.tr && blk2.x >= -1, `${tag}: 「시련의 결계」 (방 이동 막힘 + 토스트)`, { blk, blk2 });
  // 규칙 토스트 (시작 규칙 안내 · 보조 무기 금지)
  if ((T.mods ?? []).length || T.diffOver) {
    const want = `시련의 규칙: ${TRIAL.trialRuleNames(T).join(' · ')}`;
    ok(await until(s, (w) => window.__tt.toasts.includes(w) || (window.__game.toasts ?? []).some((t) => t.text === w), want, 3000), `${tag}: 시작 규칙 토스트 '${want}'`);
  }
  if ((T.mods ?? []).includes('no_sub')) {
    await s.eval(() => { window.__game.world.run.hearts = 20; });
    await s.key('sub', 90);
    ok(await until(s, () => window.__tt.toasts.some((t) => t === '시련의 규칙: 보조 무기를 쓸 수 없다'), null, 2000), `${tag}: 보조 무기 금지 토스트 '시련의 규칙: …'`);
  }
  // ── 보스전: 경기장으로 → 소개 넘기기 → 디버그 처치
  await s.eval(() => { const w = window.__game.world, p = w.player; if (w.arenaX !== undefined) { p.x = w.arenaX + 48 * 2; p.vx = 0; } });
  ok(await until(s, () => window.__game.world.bossActive, null, 8000), `${tag}: 보스전 시작`);
  await skipOverlays(s, /dialogue|bossIntro/, 20000);
  const bossId = await s.eval(async () => { const w = window.__game.world; const b = await w.bossReady(); return b?.def?.id ?? b?.id ?? null; });
  ok(bossId === T.boss, `${tag}: 보스 ${T.boss}`, bossId);
  const hpInfo = await s.eval(() => { const b = window.__game.world.boss; return { hp: b?.stats?.maxHp, k: window.__game.world.diff.bossHp }; });
  ok(T.diffOver?.bossHp ? hpInfo.k > 0 : true, `${tag}: 보스 체력 배율 ${hpInfo.k}`);
  if (P.full) {
    // ── 실패 → TrialEndScene → 다시 도전 (새 월드)
    const before = await s.eval(SNAP);
    await killPlayer(s);
    ok(await until(s, () => window.__game.top?.name === 'trialEnd', null, 12000), `${tag}: 쓰러짐 → 시련 실패 화면`);
    await s.wait(900);
    await shot(s, `${vp}_${P.t}_trialend`);
    const te = await s.eval(() => { const sc = window.__game.top; return { line: sc.T?.failLine, idx: sc.menu?.index }; });
    ok(te.line === T.failLine && te.idx === 0, `${tag}: 실패 화면 — 엘리제 failLine · 기본 「다시 도전」`, te);
    const after = await s.eval(SNAP);
    ok(after === before, `${tag}: 실패해도 목숨·사망 수·진행 그대로`, { before: before.slice(0, 120), after: after.slice(0, 120) });
    const tr1 = await s.eval(({ c, t }) => window.__game.state.heroes[c].trials?.[t]?.tries ?? 0, { c: P.c, t: P.t });
    ok(tr1 === tries0 + 1, `${tag}: 도전 횟수 +1 (${tries0} → ${tr1})`);
    const w0 = await s.eval(() => { window.__tt.w0 = window.__game.world; return true; });
    void w0;
    if (vp === 'desk') await s.key('enter'); else await tapZone(s, 'te_retry');
    ok(await until(s, () => { const g = window.__game; return g.top?.name === 'stage' && g.world?.mode === 'trial' && g.world !== window.__tt.w0 && g.world.roomId === 'boss'; }, null, 15000), `${tag}: 「다시 도전」 → 새 시련 월드`);
    // ── 일시정지 → 「시련 포기」 → 마을 성당
    await s.wait(600);
    await s.eval(() => window.__game.push('pause', { world: window.__game.world }));
    await s.wait(500);
    const items = await s.eval(() => window.__game.top?.items?.map((i) => i.label));
    ok(items?.includes('시련 포기') && !items.includes('마을로 귀환'), `${tag}: 일시정지 항목 '시련 포기'`, items);
    await shot(s, `${vp}_${P.t}_pause`);
    const qi = items?.indexOf('시련 포기') ?? 4;
    if (vp === 'desk') {
      await s.eval((i) => { window.__game.top.i = i; }, qi);
      await s.key('enter'); await s.wait(300);
      await s.key('left'); await s.key('enter');
    } else {
      await tapZone(s, 'r' + qi); await s.wait(300);
      await tapZone(s, 'cf_yes');
    }
    const back = await until(s, () => { const g = window.__game; return g.top?.name === 'church' && g.scenes[0]?.name === 'hub' ? { from: g.scenes[0].from, px: g.scenes[0].world.player.x } : null; }, null, 15000);
    const doorX = await s.eval(() => import('/src/data/town.js').then(({ BUILDINGS }) => BUILDINGS.find((b) => b.kind === 'church').door * 48));
    ok(back && back.from === 'church' && Math.abs(back.px - doorX) < 160, `${tag}: 「시련 포기」 → 마을 성당 앞 → 성당`, { back, doorX });
    // ── 다시 시작 → 쓰러짐 → 「성당으로」
    await s.eval(async (t) => { const TR = await import('/src/game/trial.js'); TR.startTrial(window.__game, t); }, P.t);
    await until(s, () => window.__game.top?.name === 'dialogue', null, 5000);
    await s.key('menu');
    ok(await until(s, () => window.__game.top?.name === 'stage' && window.__game.world?.mode === 'trial' && window.__game.fade.dir <= 0, null, 20000), `${tag}: 다시 시작 (성당에서)`);
    await s.wait(500);
    await killPlayer(s);
    ok(await until(s, () => window.__game.top?.name === 'trialEnd', null, 12000), `${tag}: 두 번째 실패 화면`);
    await s.wait(800);
    if (vp === 'desk') { await s.key('right'); await s.key('enter'); } else { await tapZone(s, 'te_leave'); await tapZone(s, 'te_leave'); }
    ok(await until(s, () => window.__game.top?.name === 'church' && window.__game.scenes[0]?.name === 'hub', null, 15000), `${tag}: 「성당으로」 → 마을 성당`);
    const tr2 = await s.eval(({ c, t }) => window.__game.state.heroes[c].trials?.[t]?.tries ?? 0, { c: P.c, t: P.t });
    ok(tr2 === tries0 + 2, `${tag}: 실패 2번 → 도전 ${tr2}회 (포기는 보스전 전이라 세지 않음)`);
    // 다시 처음부터 통과 경로로
    await s.eval(async (t) => { const TR = await import('/src/game/trial.js'); TR.startTrial(window.__game, t); }, P.t);
    await until(s, () => window.__game.top?.name === 'dialogue', null, 5000);
    await s.key('menu');
    await until(s, () => window.__game.top?.name === 'stage' && window.__game.world?.mode === 'trial' && window.__game.fade.dir <= 0, null, 20000);
    await s.wait(500);
    await s.eval(() => { const w = window.__game.world, p = w.player; if (w.arenaX !== undefined) p.x = w.arenaX + 96; });
    await until(s, () => window.__game.world.bossActive, null, 8000);
    await skipOverlays(s, /dialogue|bossIntro/, 20000);
    await s.eval(async () => { await window.__game.world.bossReady(); });
  }
  // ── 보스 처치 (디버그)
  await s.eval(() => { window.__tt.bus.length = 0; });
  const triesBefore = await s.eval(({ c, t }) => window.__game.state.heroes[c].trials?.[t]?.tries ?? 0, { c: P.c, t: P.t });
  const wasDone = await s.eval(({ c, t }) => !!window.__game.state.heroes[c].trials?.[t]?.done, { c: P.c, t: P.t });
  let cleared = false;
  for (let i = 0; i < 40 && !cleared; i++) {
    cleared = await s.eval(() => {
      const w = window.__game.world, b = w.boss, p = w.player;
      if (w.cleared) return true;
      if (b && !b.dead && !(b.dying > 0) && !b.pendingBoss) { b.invuln = false; b.takeHit?.(b.hp + 1, { team: 'player', owner: p, dir: 1, kb: [0, 0], type: 'phys', tags: ['melee'], hitId: 'qa' + Math.random() }, w, {}); }
      return w.cleared;
    });
    if (!cleared) { await skipOverlays(s, /dialogue|bossIntro/, 3000); await s.wait(400); }
  }
  ok(cleared, `${tag}: 보스 처치 → world.cleared`);
  const C = await s.eval(() => { const w = window.__game.world; return { banner: w.banner?.text, sub: w.banner?.sub, bus: [...window.__tt.bus] }; });
  ok(C.banner === '시련 통과' && C.sub === T.name, `${tag}: 배너 '시련 통과'`, C);
  ok(!C.bus.some((e) => e.startsWith('bossKilled') || e.startsWith('stageCleared') || e.startsWith('levelUp')), `${tag}: bossKilled · stageCleared · levelUp 없음`, C.bus);
  await s.wait(300);
  await shot(s, `${vp}_${P.t}_clear`);
  // ── win 대본 (컷신) → 기록·해금·저장
  const story = await until(s, () => { const g = window.__game; return g.top?.name === 'story' ? { script: g.top.script, then: g.top.then, tp: g.top.thenParams } : null; }, null, 20000);
  const wantWin = wasDone ? T.winAgain : T.win;
  ok(story && story.script === wantWin && story.then === 'hub' && story.tp?.from === 'church' && story.tp?.open === 'church' && story.tp?.trial === P.t, `${tag}: win 대본 '${wantWin}' → 마을 성당`, story);
  const R = await s.eval(({ c, t }) => { const h = window.__game.state.heroes[c]; return { rec: h.trials?.[t], asc: h.ascUnlocked ?? [] }; }, { c: P.c, t: P.t });
  ok(R.rec?.done === true && R.rec.tries === triesBefore + 1 && R.rec.best > 0 && R.rec.at > 0, `${tag}: hero.trials 기록 (done · tries ${triesBefore + 1} · best · at)`, R.rec);
  ok(unlocksOf(P.t).every((id) => R.asc.includes(id)), `${tag}: ascUnlocked ⊇ ${unlocksOf(P.t).join(',')}`, R.asc);
  ok((story?.tp?.unlocked ?? []).length === (wasDone ? 0 : unlocksOf(P.t).length), `${tag}: thenParams.unlocked = 새로 열린 길`, story?.tp?.unlocked);
  const saved = await s.eval(({ c, t }) => import('/src/core/save.js').then(({ saves }) => { const d = saves.read(3); return { done: !!d?.heroes?.[c]?.trials?.[t]?.done, asc: d?.heroes?.[c]?.ascUnlocked ?? [] }; }), { c: P.c, t: P.t });
  ok(saved.done && unlocksOf(P.t).every((id) => saved.asc.includes(id)), `${tag}: 슬롯 저장에 기록·해금`, saved);
  const snap1 = await s.eval(SNAP);
  ok(snap1 === snap0, `${tag}: 가방·골드·경험치·레벨·목숨·점수·보스 기록·플래그 그대로`, { a: snap0.slice(0, 160), b: snap1.slice(0, 160) });
  await s.wait(1200);
  await shot(s, `${vp}_${P.t}_win`);
  // 컷신 넘기기 → 마을(성당 앞) → 성당 (새 칸)
  await s.eval(() => window.__game.top?.finish?.(true));
  const CH = await until(s, () => { const g = window.__game, c = g.top; return c?.name === 'church' && g.scenes[0]?.name === 'hub' ? { tab: c.tabs?.[c.tab]?.id, fresh: c.fresh ? [...c.fresh.ids] : [], sel: c.cardSel, from: g.scenes[0].from } : null; }, null, 20000);
  const wantFresh = wasDone ? [] : unlocksOf(P.t);
  ok(CH && CH.tab === 'class' && CH.from === 'church' && wantFresh.every((id) => CH.fresh.includes(id)), `${tag}: 마을 → 성당 전직 탭 (새 칸 ${wantFresh.length})`, CH);
  if (CH && wantFresh.length) ok(CH.sel === (T.n === 1 ? 1 : 3), `${tag}: 새로 열린 칸 선택 (${T.n === 1 ? '초월' : '비전'})`, CH.sel);
  await s.wait(1300);
  await shot(s, `${vp}_${P.t}_church`);
  // 성당을 닫으면 마을 (이야기 연출이 성당을 막지 않았나)
  await s.eval(() => window.__game.pop());
  ok(await until(s, () => ['hub', 'dialogue', 'companionJoin'].includes(window.__game.top?.name), null, 5000), `${tag}: 성당 닫기 → 마을`);
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

if (!STATIC_ONLY) await browserSuite();
console.log(`\n시련 시험: ${passes} 통과 · ${fails} 실패 · ${((Date.now() - T0) / 1000).toFixed(1)}초`);
process.exit(fails ? 1 : 0);
