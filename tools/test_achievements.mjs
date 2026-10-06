// 업적 「사냥의 기록」 시험 (docs/specs/achievements.md §12.1) — 브라우저 없음, < 15초
//   node tools/test_achievements.mjs [--only C3,C4] [--ui]
//   C1 데이터 · C2 요약(digestState) · C3 소급 · C4 이벤트 · C5 병합 · C6 서버 검사(퍼징) · C7 보상 · C8 온라인 이명 · C9 회차(ngplus.md §6)
//   --ui : ACH-UI 의 헤드리스 시험 tools/qa/ach_ui.mjs (export default async function run(opts)) 도 돌린다 (§12.2 U1–U10)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const onlyArg = argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg ? new Set((onlyArg.includes('=') ? onlyArg.split('=')[1] : argv[argv.indexOf(onlyArg) + 1] ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)) : null;
const UI = argv.includes('--ui');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const A = await imp('src/game/achievements.js');
const M = await imp('src/core/ach_meta.js');
const D = await imp('src/data/achievements.js');
const { bus } = await imp('src/core/events.js');
const CL = await imp('src/core/cloud.js');
const { DEFAULT_META } = await imp('src/core/save.js');
const { newGameState, ensureHero } = await imp('src/game/state.js');
const { ITEMS, makeItem } = await imp('src/data/items.js');
const { addItem, INV_LIMIT } = await imp('src/game/inventory.js');
const { CLASSES } = await imp('src/data/classes.js');
const { CHAR_ORDER } = await imp('src/data/characters.js');
const { DOCS } = await imp('src/data/lore.js');
const { ENEMIES } = await imp('src/data/enemies.js');
const { STAGES } = await imp('src/data/stages.js');
const { MOUNTS, GUARDIANS } = await imp('src/data/companions.js');
const sval = await imp('netlify/lib/validate.mts');
const scfg = await imp('netlify/lib/config.mts');
const gd = await imp('netlify/lib/gamedata.mts');

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(isDeepStrictEqual(a, b), `${msg} — 기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)}`);
const clone = (o) => JSON.parse(JSON.stringify(o));
const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
const tick = () => new Promise((r) => setTimeout(r, 0));
const run = (id) => !ONLY || ONLY.has(id);
const section = (t) => console.log('▶ ' + t);
const T0 = Date.now();
// 결정적 난수 (퍼징)
let seed = 0x5eed1234;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const ri = (n) => Math.floor(rnd() * n);
const pick = (a) => a[ri(a.length)];
const DEF = new Map(D.ACHIEVEMENTS.map((d) => [d.id, d]));

// ── 가짜 저장소·게임 ──
function fakeSaves(slots = {}) {
  const listeners = new Set();
  const S = {
    slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, clone(v)])), metaWrites: 0, slotWrites: 0,
    onWrite(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    notify(ev) { for (const fn of [...listeners]) fn(ev); },
    read(s) { return S.slots[s] ? clone(S.slots[s]) : null; },
    write(s, st) { S.slotWrites++; st.slot = s; S.slots[s] = clone(st); S.notify({ type: 'write', slot: s, ok: true }); return true; },
    remove(s) { delete S.slots[s]; S.notify({ type: 'remove', slot: s }); },
    saveMeta() { S.metaWrites++; S.notify({ type: 'meta', ok: true }); return true; },
  };
  return S;
}
function mkGame({ meta = {}, state = null, slots = {}, world = null } = {}) {
  const saves = fakeSaves(slots);
  const game = { meta: { ...structuredClone(DEFAULT_META), ...clone(meta) }, state, world, saves };
  const events = [];
  const off = bus.on('achievementUnlocked', (d) => events.push(clone(d)));
  const ach = A.initAchievements(game, { boot: false });
  return { game, saves, ach, events, ids: () => events.flatMap((e) => e.ids), done: () => { off(); ach._dispose(); } };
}
const story = (slot = 1, diff = 'normal', charId = 'kael') => quiet(() => newGameState({ slot, difficulty: diff, charId }));

/** 합성 '2부 완주' 슬롯 (보통 난이도, 20장 · 엔딩 깃발 · 동료 20 · 비전서 27) */
function part2Save() {
  const s = story(1, 'normal', 'kael');
  for (const id of CHAR_ORDER) quiet(() => ensureHero(s, id));
  for (const [id, h] of Object.entries(s.heroes)) {
    const cls = Object.values(CLASSES).find((c) => c.charId === id && c.tier === 2);
    h.level = 70; h.classId = cls.id;
  }
  const P = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 's13', 's14', 's15', 's16', 's17', 's18', 's19', 's20'];
  const p = s.progress;
  p.chapter = 20; p.unlocked = [...P];
  p.cleared = Object.fromEntries(P.map((sid) => [sid, { rank: sid === 's01' ? 'S' : 'A', time: STAGES[sid].parTime * 0.8, score: 100000 }]));
  p.bosses = ['b_nightwing', 'b_banshee', 'b_dullahan', 'b_crimson', 'b_bonedragon', 'b_grimoire', 'b_chimera', 'b_leviathan', 'b_colossus', 'b_frostqueen', 'b_death', 'b_dracula', 'b_chaos', 'b_narkissa', 'b_moloch', 'b_dagon', 'b_ziz', 'b_mara', 'b_behemoth', 'b_nihil'];
  for (const b of p.bosses) p.flags['boss_' + b] = true;
  for (const f of ['ending_true', 'ending_p2', 'p2_done', 'relics_all', 'isolde_joined']) p.flags[f] = true;
  p.docs = Object.keys(DOCS);
  p.relics = ['k_relic_1', 'k_relic_2', 'k_relic_3', 'k_relic_4', 'k_relic_5'];
  p.shards = ['k_star_1', 'k_star_2', 'k_star_3', 'k_star_4', 'k_star_5', 'k_star_6'];
  p.hearts = ['k_heart_1', 'k_heart_2', 'k_heart_3', 'k_heart_4', 'k_heart_5', 'k_heart_6'];
  p.secrets = Array.from({ length: 25 }, (_, i) => `s${String(1 + (i % 20)).padStart(2, '0')}:k${i}`);
  // 동료 20 (탈것 9 · 수호신 11 — 모두는 아니다), 하나는 알에서
  const mounts = Object.keys(MOUNTS).slice(0, 9), guards = Object.keys(GUARDIANS).slice(0, 11);
  s.companions.owned = {};
  for (const id of [...mounts, ...guards]) s.companions.owned[id] = { lv: 20, exp: 0, bond: 130, got: 1, src: 'story', gift: 0, seen: true };
  s.companions.owned[guards[0]].src = 'egg';
  s.quests = { active: {}, done: Array.from({ length: 35 }, (_, i) => 'q_' + i) };
  s.bestiary = Object.fromEntries(Object.keys(ENEMIES).slice(0, 50).map((id) => [id, 3]));
  s.stats = { ...s.stats, kills: 5000, deaths: 12, maxCombo: 150, minigameWins: 3 };
  s.innGames = { best: {}, duelRank: 2, catGift: false, plays: 9, jackpots: 0 };
  const it = makeItem(Object.keys(ITEMS).find((id) => ITEMS[id].slot === 'weapon'), { rarity: 3, level: 11 });
  addItem(s, it, { silent: true });
  return s;
}
const P2_META = { unlockedChars: ['kael', 'sera', 'victor', 'bran', 'lia', 'azel', 'isolde'], endingsSeen: ['normal', 'p2'], clears: 2 };
const P2_EXPECT = ['st_s01', 'st_s02', 'st_dracula', 'st_end1', 'st_s14', 'st_end2', 'cb_kill_1k', 'cb_combo_100', 'hr_class1', 'hr_class2_all', 'hr_seven',
  'cp_first', 'cp_egg', 'cl_relics', 'cl_otherworld', 'cl_docs10', 'cl_docs_all', 'cl_beast30', 'cl_secret20', 'cl_enhance10', 'cl_quest30', 'mg_win', 'ch_rank_s'];

// ═════════ C1 데이터 ═════════
if (run('C1')) {
  section('C1 데이터');
  const L = D.ACHIEVEMENTS;
  ok(L.length === 67, `업적 67개 (${L.length})`);
  const cats = D.ACH_CATS.map((c) => c.id);
  eq(cats, ['story', 'combat', 'hero', 'companion', 'collect', 'arcade', 'challenge', 'secret'], '분류 8개 순서');
  for (const c of cats) ok(L.filter((d) => d.cat === c).length >= 7, `분류 ${c} ≥ 7`);
  eq(Object.fromEntries(cats.map((c) => [c, L.filter((d) => d.cat === c).length])), { story: 11, combat: 7, hero: 7, companion: 7, collect: 9, arcade: 10, challenge: 9, secret: 7 }, '분류별 수');
  eq(Object.fromEntries(cats.map((c) => [c, L.filter((d) => d.cat === c).reduce((a, d) => a + d.pts, 0)])), { story: 270, combat: 170, hero: 170, companion: 140, collect: 190, arcade: 210, challenge: 370, secret: 110 }, '분류별 점수');
  ok(L.reduce((a, d) => a + d.pts, 0) === 1630, '점수 합 1,630');
  ok(L.every((d) => [10, 20, 30, 50, 100].includes(d.pts)), '점수는 10·20·30·50·100');
  ok(L.filter((d) => d.pts === 100).length === 1, '100점은 하나 (ch_all)');
  ok(new Set(L.map((d) => d.id)).size === L.length, 'id 중복 없음');
  ok(L.every((d) => M.ACH_KEY_RE.test(d.id)), 'id 키 규칙');
  ok(L.every((d) => cats.includes(d.cat) && typeof d.name === 'string' && d.name && typeof d.desc === 'string' && d.desc), '분류·이름·설명');
  ok(L.every((d) => A.METRICS.includes(d.cond?.m) && Number.isFinite(d.cond.n) && d.cond.n >= 1), 'cond.m 이 지표표에 있음, n ≥ 1');
  const hidden = L.filter((d) => d.hidden);
  ok(hidden.length === 7 && hidden.every((d) => d.cat === 'secret') && L.filter((d) => d.cat === 'secret').every((d) => d.hidden), '숨김 7 = secret 분류 전부');
  // 보상 참조
  const titles = L.filter((d) => d.reward?.title).map((d) => d.reward.title), decos = L.filter((d) => d.reward?.deco).map((d) => d.reward.deco);
  ok(titles.length === 17 && new Set(titles).size === 17, `이명 보상 17 (${titles.length})`);
  ok(decos.length === 5 && new Set(decos).size === 5, `장식 보상 5 (${decos.length})`);
  eq([...titles].sort(), Object.keys(M.ACH_TITLES).sort(), '이명 보상 = ACH_TITLES');
  eq([...decos].sort(), Object.keys(M.ACH_DECOS).sort(), '장식 보상 = ACH_DECOS');
  ok(Object.keys(M.ACH_TITLES).every((k) => k.startsWith('t_') && M.ACH_KEY_RE.test(k)) && Object.keys(M.ACH_DECOS).every((k) => k.startsWith('d_') && M.ACH_KEY_RE.test(k)), '이명 t_ · 장식 d_ 키 규칙');
  ok(Object.values(M.ACH_DECOS).every((d) => d.name && d.amb && typeof d.amb.emberColor === 'string'), '장식 amb.emberColor');
  ok(L.every((d) => (d.reward?.items ?? []).every((x) => ITEMS[x.id] && Number.isInteger(x.qty) && x.qty >= 1)), '보상 아이템이 ITEMS 에 있음');
  ok(L.every((d) => !d.reward || Object.keys(d.reward).every((k) => ['gold', 'items', 'title', 'deco'].includes(k))), '보상 필드 이름');
  const fixed = L.filter((d) => d.reward && (d.reward.gold || d.reward.items));
  ok(fixed.length === 12, `정한 골드·소모품 12 (${fixed.length})`);
  ok(L.filter((d) => !d.reward).length === 34, `기본 골드 34 (${L.filter((d) => !d.reward).length})`);
  ok(L.filter((d) => !d.reward).every((d) => A.rewardOf(d).gold === d.pts * 25), '기본 골드 = pts × 25');
  ok(L.filter((d) => d.reward?.title || d.reward?.deco).every((d) => A.rewardOf(d).gold === 0 && !A.rewardOf(d).items.length), '이명·장식 업적은 골드 없음');
  const goldSum = L.reduce((a, d) => a + A.rewardOf(d).gold, 0);
  ok(goldSum > 15000 && goldSum < 25000, `받을 수 있는 골드 합 ≈ 20,300 (${goldSum})`);
  // 특정 값
  ok(DEF.get('ch_all').cond.n === 66 && DEF.get('ch_all').cond.n === L.length - 1, 'ch_all.n === 66');
  ok(DEF.get('cl_docs_all').cond.n === Object.keys(DOCS).length, `cl_docs_all.n === DOCS 수 (${Object.keys(DOCS).length})`);
  let foes = null;
  try { foes = (await imp('src/scenes/games/duel.js')).FOES.length; } catch {
    const src = fs.readFileSync(path.join(ROOT, 'src/scenes/games/duel.js'), 'utf8');
    const blk = src.slice(src.indexOf('export const FOES = ['), src.indexOf('\n];', src.indexOf('export const FOES = [')));
    foes = (blk.match(/^ {4}id: '/gm) ?? []).length;
  }
  ok(DEF.get('mg_duel').cond.n === foes, `mg_duel.n === FOES.length (${foes})`);
  ok(DEF.get('cp_mounts').cond.n === Object.keys(MOUNTS).length && DEF.get('cp_guards').cond.n === Object.keys(GUARDIANS).length, '탈것 10 · 수호신 12 = 데이터');
  ok(DEF.get('ar_rush22').cond.arg[0] === 8 && gd.COURSE_COUNT === 9, '22연전 = 코스 8');
  ok(DEF.get('ch_rank_s_all').cond.arg.length === 20 && DEF.get('ch_rank_s_all').cond.arg.every((s) => STAGES[s] && !STAGES[s].side), 'rankS 인자: 외전 아닌 스무 스테이지');
  // prog 키 목록 (§3.3)
  eq([...A.PROG_KEYS], ['kills', 'combo', 'style', 'nodmg', 'nd_b_dracula', 'aw_kael', 'aw_sera', 'aw_victor', 'aw_bran', 'aw_lia', 'aw_azel', 'aw_isolde', 'aw2',
    'ride', 'egg', 'enh', 'daily_n', 'daily_last', 'rush_perfect', 'mg_win', 'jackpot', 'nodmg_stage', 'hb_lia_nemain', 'hb_isolde_argen', 'deaths'], 'prog 키 25개 (§3.3)');
  ok(A.PROG_KEYS.every((k) => M.ACH_KEY_RE.test(k)), 'prog 키 규칙');
  // 서버 사본 대조
  eq([...gd.TITLE_IDS].sort(), Object.keys(M.ACH_TITLES).sort(), 'TITLE_IDS(gamedata.mts) = ACH_TITLES 키');
  const SA = scfg.ACH;
  for (const k of Object.keys(M.ACH_LIMITS)) ok(M.ACH_LIMITS[k] === SA[k], `ACH_LIMITS.${k} = config.mts ACH.${k} (${M.ACH_LIMITS[k]} / ${SA[k]})`);
  for (const k of Object.keys(SA)) if (k !== 'keyRe') ok(Object.hasOwn(M.ACH_LIMITS, k), `config.mts ACH.${k} 가 ACH_LIMITS 에도 있음`);
  ok(SA.keyRe.source === M.ACH_KEY_RE.source && SA.keyRe.flags === M.ACH_KEY_RE.flags, 'ACH_KEY_RE = config.mts ACH.keyRe');
  // 숨긴 문구·이름 글자 (새 글자 금지 — 피한 글자)
  const allText = JSON.stringify([D.ACHIEVEMENTS, D.ACH_CATS, D.ACH_HIDDEN, M.ACH_TITLES, M.ACH_DECOS]);
  ok(!/[칭깬]/.test(allText), "피한 글자 '칭'·'깬' 없음 (§10)");
}

// ═════════ C2 요약 ═════════
if (run('C2')) {
  section('C2 digestState');
  const v1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/save_v1.json'), 'utf8'));
  const c6 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/save_ch6_nocmp.json'), 'utf8'));
  const d1 = A.digestState(v1);
  ok(d1 && Object.keys(d1.cleared).length === 13 && d1.bosses.includes('b_dracula') && d1.difficulty === 'hard', 'save_v1: 1부 완료 요약');
  ok(d1 && d1.stats.kills === 8123 && d1.stats.maxCombo === 212 && d1.joined.includes('lia') && d1.joined.includes('azel'), 'save_v1: 통계·합류');
  const d6 = A.digestState(c6);
  ok(d6 && Object.keys(d6.owned).length === 0 && Object.keys(d6.cleared).length === 6, 'save_ch6_nocmp: 동료 없음 (companions 필드 없음)');
  const v1c = clone(v1);
  A.digestState(v1);
  ok(isDeepStrictEqual(v1, v1c), '원본 불변');
  // 아케이드 임시 세이브
  const arc = story(0); arc.arcade = { kind: 'practice' }; arc.progress.bosses.push('b_dracula');
  ok(A.digestState(arc) === null, 'state.arcade → null');
  for (const x of [null, undefined, 5, 'x', [], {}, { progress: 7 }]) ok(A.digestState(x) === null || typeof A.digestState(x) === 'object', `이상한 값 ${JSON.stringify(x)}`);
  // 손상 세이브 500개 퍼징
  const BAD = [null, undefined, 0, -1, 1e300, NaN, Infinity, '', 'x', true, [], [1, 'a', null], {}, { a: 1 }, { __proto__: { polluted: 1 } }];
  const mutate = (o, depth = 0) => {
    if (!o || typeof o !== 'object') return;
    const keys = Object.keys(o);
    if (!keys.length) return;
    for (let i = 0; i < 1 + ri(3); i++) {
      const k = pick(keys);
      const r = rnd();
      if (r < 0.35) o[k] = pick(BAD);
      else if (r < 0.5) delete o[k];
      else if (depth < 4) mutate(o[k], depth + 1);
    }
  };
  let thrown = 0, changed = 0, nonFinite = 0;
  const base = [v1, c6, part2Save()];
  for (let i = 0; i < 500; i++) {
    const s = clone(pick(base));
    mutate(s); if (rnd() < 0.5) mutate(s);
    const before = JSON.stringify(s);
    try {
      const d = A.digestState(s);
      if (d) {
        const nums = [d.relics, d.hearts, d.shards, d.secrets, d.enhance, ...Object.values(d.stats), ...Object.values(d.heroes).flatMap((h) => [h.level, h.tier])];
        if (!nums.every(Number.isFinite)) nonFinite++;
        // 지표가 모두 유한한 수
        const ctx = { meta: {}, ach: M.newAch(), slots: [d] };
        if (!A.METRICS.every((m) => Number.isFinite(A.metric(m, DEF.get(D.ACHIEVEMENTS.find((x) => x.cond.m === m)?.id)?.cond.arg, ctx)))) nonFinite++;
      }
    } catch { thrown++; }
    if (JSON.stringify(s) !== before) changed++;
  }
  ok(thrown === 0, `손상 세이브 500개: 던짐 0 (${thrown})`);
  ok(changed === 0, `손상 세이브 500개: 원본 불변 (${changed})`);
  ok(nonFinite === 0, `손상 세이브 500개: 요약·지표 값이 모두 유한 (${nonFinite})`);
}

// ═════════ C3 소급 ═════════
if (run('C3')) {
  section('C3 소급');
  {
    const g = mkGame({ meta: P2_META, slots: { 2: part2Save() } });
    const got = g.ach.rescan('retro');
    eq([...got].sort(), [...P2_EXPECT].sort(), "2부 완주 슬롯 + 메타 → 정해 둔 집합 E");
    ok(g.events.length === 1 && g.events[0].src === 'retro', `achievementUnlocked 한 번, src 'retro' (${g.events.length}, ${g.events[0]?.src})`);
    ok(g.saves.metaWrites === 1, `메타 저장 한 번 (${g.saves.metaWrites})`);
    console.log(`  2부 완주 세이브 소급: ${got.length}개 (${got.join(' ')})`);
    const again = g.ach.rescan('retro');
    ok(again.length === 0 && g.events.length === 1, '다시 훑으면 0');
    ok(g.game.meta.ach.prog.kills === 5000 && g.game.meta.ach.prog.deaths === 12, '누적값 바닥을 슬롯 통계로 맞춤');
    // 슬롯을 지워도 거두지 않는다
    g.saves.remove(2);
    ok(g.ach.rescan('retro').length === 0 && Object.keys(g.game.meta.ach.got).length === P2_EXPECT.length, '슬롯 삭제 뒤에도 got 은 남는다');
    g.done();
  }
  {
    // 1부 완료 고정 세이브 (참고 숫자)
    const v1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/save_v1.json'), 'utf8'));
    const g = mkGame({ meta: { unlockedChars: ['kael', 'sera', 'victor', 'bran', 'lia', 'azel'], endingsSeen: ['true'] }, slots: { 1: v1 } });
    const got = g.ach.rescan('retro');
    ok(got.includes('st_true1') && got.includes('ch_hard_p1') && got.includes('cl_relics') && got.includes('cb_combo_100'), `save_v1 소급: 트루 엔딩·베테랑 1부·유물·콤보 (${got.length}개)`);
    console.log(`  1부 완료(save_v1, 베테랑) 소급: ${got.length}개`);
    g.done();
  }
  {
    const g = mkGame();
    ok(g.ach.rescan('retro').length === 0 && g.events.length === 0 && g.saves.metaWrites === 0, '빈 메타·빈 슬롯 → 0 (이벤트·저장 없음)');
    g.done();
  }
  {
    // 아케이드 임시 세이브 (지금 게임 중) 의 보스·퀘스트·통계는 스토리 업적이 되지 않는다
    const arc = story(0); arc.arcade = { kind: 'practice', stageId: 's12' };
    arc.progress.bosses.push('b_dracula'); arc.progress.cleared.s12 = { rank: 'S', time: 10, score: 1 }; arc.stats.kills = 5000;
    const g = mkGame({ state: arc });
    const got = g.ach.rescan('retro');
    ok(!got.includes('st_dracula') && !got.includes('ch_rank_s') && !got.includes('cb_kill_1k') && !got.includes('ch_speed'), `아케이드 임시 세이브 → 스토리 업적 없음 (${got.join(',')})`);
    // 슬롯 1 로 저장된 척해도 (state.arcade) 요약하지 않는다
    arc.slot = 1;
    ok(g.ach.rescan('retro').length === 0, 'state.arcade 는 슬롯 번호가 있어도 요약하지 않음');
    g.done();
  }
  {
    const g = mkGame({ meta: { konami: true, unlockedChars: ['kael', 'sera', 'victor', 'bran', 'lia', 'azel', 'isolde'] } });
    const got = g.ach.rescan('retro');
    ok(!got.includes('hr_seven') && got.includes('sc_konami'), `비밀 코드만 → hr_seven 아님, sc_konami 는 달성 (${got.join(',')})`);
    g.done();
  }
  {
    // 'cloud' 소급: 동기화로 받은 메타·슬롯
    const g = mkGame();
    g.game.meta.endingsSeen = ['bad'];
    bus.emit('cloud:sync', { phase: 'start' });
    g.saves.saveMeta(g.game.meta);   // applyMeta 흉내 (동기화 중 메타 쓰기)
    await tick(); await tick();
    ok(g.events.length === 1 && g.events[0].src === 'cloud' && g.events[0].ids.includes('sc_bad'), `동기화 중 메타 쓰기 → src 'cloud' (${JSON.stringify(g.events)})`);
    g.saves.slots[3] = part2Save();   // saves.store 흉내 (알림 없음)
    bus.emit('cloud:sync', { phase: 'done', ok: true });
    await tick(); await tick();
    ok(g.events.length === 2 && g.events[1].src === 'cloud' && g.events[1].ids.includes('st_s01'), "cloud:sync done → rescan('cloud')");
    g.done();
  }
}

// ═════════ C4 이벤트 ═════════
if (run('C4')) {
  section('C4 이벤트');
  {
    const g = mkGame({ state: story(1) });
    for (let i = 0; i < 999; i++) bus.emit('enemyKilled', { byPlayer: true, def: { id: 'zombie' } });
    ok(g.events.length === 0 && g.saves.metaWrites === 0, `처치 999: 달성·메타 저장 없음 (저장 ${g.saves.metaWrites})`);
    bus.emit('enemyKilled', { byPlayer: false, def: { id: 'zombie' } });
    ok(g.game.meta.ach.prog.kills === 999, 'byPlayer 아닌 처치는 세지 않음');
    bus.emit('enemyKilled', { byPlayer: true, def: { id: 'zombie' } });
    ok(g.events.length === 1 && g.events[0].ids[0] === 'cb_kill_1k' && g.events[0].src === 'live', "처치 1000 → cb_kill_1k ('live')");
    ok(g.saves.metaWrites === 1, `처치마다 저장하지 않음: 1000 처치에 메타 저장 1번 (달성) (${g.saves.metaWrites})`);
    // 처치 경로 시간 (상수 시간)
    const t = performance.now();
    for (let i = 0; i < 20000; i++) bus.emit('enemyKilled', { byPlayer: true, def: { id: 'bat' } });
    const per = (performance.now() - t) / 20000;
    ok(per < 0.05, `처치 한 번 처리 ${per.toFixed(4)} ms (< 0.05 ms, 데스크톱)`);
    console.log(`  처치 처리: ${(per * 1000).toFixed(1)} µs/회`);
    bus.emit('comboMilestone', { n: 100 });
    ok(g.ids().includes('cb_combo_100'), 'comboMilestone 100 → cb_combo_100');
    bus.emit('styleRankUp', { rank: 5, r: 'S' });
    ok(g.ids().includes('cb_style_s') && !g.ids().includes('cb_style_sss'), 'styleRankUp S → cb_style_s');
    bus.emit('styleRankUp', { rank: 7, r: 'SSS' });
    ok(g.ids().includes('cb_style_sss'), 'styleRankUp SSS → cb_style_sss');
    for (const c of CHAR_ORDER.slice(0, 6)) bus.emit('awakenCast', { charId: c, tier: 1 });
    ok(g.ids().includes('hr_awaken') && !g.ids().includes('hr_awaken_all'), '각성 여섯 → hr_awaken, 아직 hr_awaken_all 아님');
    bus.emit('awakenCast', { charId: CHAR_ORDER[0], tier: 1 });
    ok(!g.ids().includes('hr_awaken_all'), '같은 영웅 다시 → 그대로');
    bus.emit('awakenCast', { charId: 'isolde', tier: 2 });
    ok(g.ids().includes('hr_awaken_all') && g.ids().includes('hr_true_awaken'), '일곱째 (tier 2) → hr_awaken_all + hr_true_awaken');
    // 일일 도전: 서로 다른 날 7번 (같은 날 두 번은 한 번)
    const days = ['20261001', '20261001', '20261002', '20261003', '20261004', '20261005', '20261006'];
    for (const day of days) bus.emit('arcadeFinished', { kind: 'practice', cleared: true, daily: day });
    ok(g.ids().includes('ar_daily') && !g.ids().includes('ar_daily7'), '6일 → ar_daily 만');
    bus.emit('arcadeFinished', { kind: 'practice', cleared: false, daily: '20261007' });
    bus.emit('arcadeFinished', { kind: 'practice', cleared: true, daily: null });
    ok(!g.ids().includes('ar_daily7'), '실패·일일 아님은 세지 않음');
    bus.emit('arcadeFinished', { kind: 'practice', cleared: true, daily: '20261007' });
    ok(g.ids().includes('ar_daily7') && g.game.meta.ach.prog.daily_n === 7 && g.game.meta.ach.prog.daily_last === 20261007, '7일째 → ar_daily7');
    // 보스 러시 무결점
    bus.emit('arcadeFinished', { kind: 'bossrush', cleared: true, extra: { bosses: 6, total: 6, perfect: 5 } });
    ok(!g.ids().includes('ch_rush_perfect'), '보스 러시 무피해 하나 모자람 → 아님');
    bus.emit('arcadeFinished', { kind: 'bossrush', cleared: false, extra: { bosses: 3, total: 6, perfect: 3 } });
    ok(!g.ids().includes('ch_rush_perfect'), '완주 못 함 → 아님');
    bus.emit('arcadeFinished', { kind: 'bossrush', cleared: true, extra: { bosses: 6, total: 6, perfect: 6 } });
    ok(g.ids().includes('ch_rush_perfect'), 'perfect === total → ch_rush_perfect');
    // 무결 스테이지
    bus.emit('stageCleared', { stageId: 's01', rank: 'B', time: 300, score: 1, noDamage: false });
    ok(!g.ids().includes('ch_nodmg_stage'), '피해 있음 → 아님');
    const mw = g.saves.metaWrites;
    g.game.meta.ach.prog.kills++;   // 더러운 누적값
    bus.emit('stageCleared', { stageId: 's01', rank: 'B', time: 300, score: 1, noDamage: true });
    ok(g.ids().includes('ch_nodmg_stage'), 'stageCleared {noDamage:true} → ch_nodmg_stage');
    ok(g.saves.metaWrites > mw, 'stageCleared 에서 저장');
    // 죽음
    for (let i = 0; i < 100; i++) bus.emit('playerDied', { cause: null });
    ok(g.ids().includes('sc_die100'), '죽음 100 → sc_die100');
    // 탈것·알·강화·여관
    bus.emit('mounted', { id: 'mt_boar' });
    bus.emit('eggHatched', { id: 'gd_whelp' });
    bus.emit('minigame', { game: 'dice', win: true, reward: { tier: 'jackpot' } });
    ok(['cp_ride', 'cp_egg', 'mg_win', 'mg_jackpot'].every((id) => g.ids().includes(id)), 'mounted · eggHatched · minigame(jackpot)');
    bus.emit('enhance', { success: true, level: 10 });
    await tick(); await tick();
    ok(g.ids().includes('cl_enhance10'), 'enhance +10 → cl_enhance10');
    // 미뤄 요약하는 사건: 지금 슬롯 상태가 바뀐 뒤
    g.game.state.progress.cleared.s01 = { rank: 'S', time: 100, score: 1 };
    bus.emit('stageCleared', { stageId: 's01', rank: 'S', time: 100, score: 1, noDamage: false });
    ok(!g.ids().includes('st_s01'), '슬롯 요약은 미룬다 (같은 틱에는 아직)');
    await tick(); await tick();
    ok(g.ids().includes('st_s01') && g.ids().includes('ch_rank_s') && g.ids().includes('ch_speed'), 'stageCleared 뒤 → st_s01 · ch_rank_s · ch_speed');
    g.game.state.heroes.kael.level = 80;
    bus.emit('levelUp', { charId: 'kael', level: 80 });
    await tick(); await tick();
    ok(g.ids().includes('hr_lv80'), 'levelUp → hr_lv80');
    // 메타 쓰기 (엔딩)
    g.game.meta.endingsSeen.push('normal');
    g.saves.saveMeta(g.game.meta);
    await tick(); await tick();
    ok(g.ids().includes('st_end1') && g.events.at(-1).src === 'live', "메타 쓰기(endingsSeen normal) → st_end1 ('live')");
    // 슬롯 쓰기 (결투 단계 · 고양이)
    g.game.state.innGames = { duelRank: 5, catGift: true, jackpots: 0, best: {}, plays: 0 };
    g.saves.write(1, g.game.state);
    await tick(); await tick();
    ok(g.ids().includes('mg_duel') && g.ids().includes('sc_cat'), '슬롯 쓰기 → mg_duel · sc_cat');
    // 쓰인 prog 키는 모두 목록 안
    const extra = Object.keys(g.game.meta.ach.prog).filter((k) => !A.PROG_KEYS.includes(k));
    ok(extra.length === 0, `prog 키는 §3.3 목록 안 (${extra.join(',')})`);
    g.done();
  }
  {
    // 무피해 보스: 스토리 드라큘라 → cb_nodmg + sc_count
    const world = { mode: 'story', run: { damageTaken: 40 } };
    const g = mkGame({ state: story(1), world });
    bus.emit('bossStarted', { bossId: 'b_dracula', stageId: 's12', time: 10 });
    bus.emit('bossKilled', { bossId: 'b_dracula', stageId: 's12', time: 99, mode: 'story', charId: 'kael' });
    ok(g.ids().includes('cb_nodmg') && g.ids().includes('sc_count'), '무피해 드라큘라 (스토리) → cb_nodmg + sc_count');
    ok(g.events.length === 1, '한 번의 이벤트로');
    g.done();
  }
  {
    const world = { mode: 'story', run: { damageTaken: 0 } };
    const g = mkGame({ state: story(1), world });
    bus.emit('bossStarted', { bossId: 'b_dracula', stageId: 's12', time: 10 });
    bus.emit('playerHurt', { amount: 5 });
    bus.emit('bossKilled', { bossId: 'b_dracula', stageId: 's12', time: 99, mode: 'story', charId: 'kael' });
    ok(!g.ids().includes('cb_nodmg') && !g.ids().includes('sc_count'), '사이에 playerHurt → 둘 다 아님');
    // 피해 값만 바뀐 경우 (playerHurt 가 없는 피해 경로)
    bus.emit('bossStarted', { bossId: 'b_dracula', stageId: 's12', time: 10 });
    world.run.damageTaken = 7;
    bus.emit('bossKilled', { bossId: 'b_dracula', stageId: 's12', time: 99, mode: 'story', charId: 'kael' });
    ok(!g.ids().includes('cb_nodmg'), 'damageTaken 이 늘면 아님');
    // 다른 보스의 시작 → 아님
    bus.emit('bossStarted', { bossId: 'b_death', stageId: 's11', time: 10 });
    bus.emit('bossKilled', { bossId: 'b_dracula', stageId: 's12', time: 99, mode: 'story', charId: 'kael' });
    ok(!g.ids().includes('cb_nodmg'), '다른 보스의 시작 → 아님');
    // 연습 모드 무피해 → cb_nodmg (sc_count 도 nd_b_dracula), 아케이드 보스 러시는 bossKilled 가 없다
    world.mode = 'practice';
    bus.emit('bossStarted', { bossId: 'b_death', stageId: 's11', time: 10 });
    bus.emit('bossKilled', { bossId: 'b_death', stageId: 's11', time: 50, mode: 'practice', charId: 'kael' });
    ok(g.ids().includes('cb_nodmg') && !g.ids().includes('sc_count'), '연습 무피해 → cb_nodmg');
    // 무피해 다섯 번
    for (let i = 0; i < 4; i++) { bus.emit('bossStarted', { bossId: 'b_death' }); bus.emit('bossKilled', { bossId: 'b_death', mode: 'story', charId: 'kael' }); }
    ok(g.ids().includes('ch_nodmg5'), '무피해 다섯 번 → ch_nodmg5');
    g.done();
  }
  {
    const g = mkGame({ state: story(1, 'normal', 'lia') });
    bus.emit('bossKilled', { bossId: 'b_nemain', stageId: 's22', time: 99, mode: 'practice', charId: 'lia' });
    ok(!g.ids().includes('sc_lia'), '리아로 네메인 (연습) → 아님');
    bus.emit('bossKilled', { bossId: 'b_nemain', stageId: 's22', time: 99, mode: 'story', charId: 'kael' });
    ok(!g.ids().includes('sc_lia'), '다른 영웅으로 네메인 → 아님');
    bus.emit('bossKilled', { bossId: 'b_nemain', stageId: 's22', time: 99, mode: 'story', charId: 'lia' });
    ok(g.ids().includes('sc_lia'), '리아로 네메인 (스토리) → sc_lia');
    bus.emit('bossKilled', { bossId: 'b_argen', stageId: 's21', time: 99, mode: 'story', charId: 'isolde' });
    ok(g.ids().includes('sc_isolde'), '이졸데로 아르겐 (스토리) → sc_isolde');
    g.done();
  }
  {
    // 마지막 하나를 채우면 ch_all (같은 이벤트에)
    const g = mkGame({ state: story(1) });
    const ach = M.ensureAch(g.game.meta);
    for (const d of D.ACHIEVEMENTS) if (d.id !== 'ch_all' && d.id !== 'cb_style_s') ach.got[d.id] = 1;
    bus.emit('styleRankUp', { rank: 5 });
    ok(g.events.length === 1 && isDeepStrictEqual(g.events[0].ids, ['cb_style_s', 'ch_all']), `마지막 하나 → ch_all 같은 이벤트 (${JSON.stringify(g.events)})`);
    ok(g.ach.title() === null && g.ach.setTitle('t_legend') && g.ach.title() === 't_legend' && g.ach.setDeco('d_moon') && g.ach.deco() === 'd_moon', 'ch_all 보상: 이명·장식 고르기');
    ok(!g.ach.setTitle('t_nope') && !g.ach.setDeco('d_nope') && g.ach.setTitle(null) && g.ach.title() === null, '목록 밖 이명·장식은 거절, null 은 허용');
    g.done();
  }
  {
    // 고른 이명이라도 달성하지 않았으면 title() 은 null
    const g = mkGame({ meta: { ach: { v: 1, got: {}, prog: {}, claimed: [], seenAt: 0, title: 't_dawn', deco: 'd_gold' } } });
    ok(g.ach.title() === null && g.ach.deco() === null, '얻지 않은 이명·장식은 읽을 때 무시');
    ok(!g.ach.setTitle('t_dawn'), '얻지 않은 이명은 고를 수 없음');
    g.ach._grant('st_end1');
    ok(g.ach.title() === 't_dawn' && g.ach.titles().find((t) => t.id === 't_dawn').got && g.ach.titles().find((t) => t.id === 't_dawn').from === 'st_end1', '얻으면 유효 · titles() from');
    // 요약·NEW·markSeen
    const s = g.ach.summary();
    ok(s.got === 1 && s.total === 67 && s.pts === 20 && s.ptsMax === 1630 && s.unseen === 1 && s.byCat.story.got === 1 && s.byCat.story.total === 11, 'summary()');
    ok(g.ach.status('st_end1').isNew && !g.ach.status('st_end1').claimable, 'NEW · 이명 업적은 받을 것 없음');
    g.ach.markSeen();
    ok(g.ach.summary().unseen === 0 && !g.ach.status('st_end1').isNew, 'markSeen → NEW 지움');
    const kb = g.ach.status('cb_kill_1k');
    ok(kb.bar && kb.need === 1000 && kb.cur === 0 && kb.got === null, "status: 진행 막대 'kills'");
    ok(g.ach.status('sc_cat').hiddenLocked && !g.ach.status('st_s01').hiddenLocked, 'hiddenLocked');
    ok(g.ach.list('secret').length === 7 && g.ach.list().length === 67, 'list(cat)');
    g.done();
  }
}

// ═════════ C5 병합 ═════════
if (run('C5')) {
  section('C5 병합');
  const a = { v: 1, got: { st_s01: 100, cb_kill_1k: 500, only_a: 7 }, prog: { kills: 900, style: 3 }, claimed: ['st_s01'], seenAt: 50, title: 't_dawn', deco: null, xa: 1, both: 'a' };
  const b = { v: 2, got: { st_s01: 90, cb_kill_1k: 600, only_b: 9 }, prog: { kills: 1200, combo: 50 }, claimed: ['cb_kill_1k'], seenAt: 80, title: 't_reaper', deco: 'd_gold', xb: 2, both: 'b' };
  const m = M.mergeAch(a, b);
  eq(m.got, { st_s01: 90, cb_kill_1k: 500, only_a: 7, only_b: 9 }, 'got 합집합·가장 이른 시각');
  eq(m.prog, { kills: 1200, style: 3, combo: 50 }, 'prog 키마다 큰 값');
  eq(m.claimed, ['cb_kill_1k', 'st_s01'], 'claimed 합집합');
  ok(m.seenAt === 80 && m.v === 2, 'seenAt·v 큰 값');
  ok(m.title === 't_dawn' && m.deco === 'd_gold', 'title 기기 우선 (null 이면 서버 것)');
  ok(m.xa === 1 && m.xb === 2 && m.both === 'a', '모르는 필드 보존 ({...b, ...a})');
  ok(isDeepStrictEqual(a.got.st_s01, 100) && b.prog.kills === 1200, '입력 불변');
  // 교환·결합·멱등 (got)
  let bad = 0;
  const rgot = () => Object.fromEntries(Array.from({ length: ri(12) }, () => [pick(['st_s01', 'st_s02', 'cb_kill_1k', 'ch_all', 'mg_win', 'sc_cat']), 1 + ri(1000)]));
  for (let i = 0; i < 300; i++) {
    const x = { got: rgot(), prog: { kills: ri(9) } }, y = { got: rgot(), prog: { kills: ri(9) } }, z = { got: rgot() };
    if (!isDeepStrictEqual(M.mergeAch(x, y).got, M.mergeAch(y, x).got)) bad++;
    if (!isDeepStrictEqual(M.mergeAch(M.mergeAch(x, y), z).got, M.mergeAch(x, M.mergeAch(y, z)).got)) bad++;
    const xx = M.mergeAch(x, x);
    if (!isDeepStrictEqual(xx.got, M.ensureAch({ ach: clone(x) }).got) || !isDeepStrictEqual(M.mergeAch(xx, x), xx)) bad++;
    if (!isDeepStrictEqual(M.mergeAch(x, y).prog, M.mergeAch(y, x).prog)) bad++;
  }
  ok(bad === 0, `교환·결합·멱등 (got·prog) 300회 (${bad})`);
  // 망가진 입력
  ok(isDeepStrictEqual(M.mergeAch(null, undefined), M.newAch()), '둘 다 없으면 빈 기록');
  ok(isDeepStrictEqual(M.mergeAch({ got: { st_s01: 5, BAD: 1, x_y: 'n' } }, 'nope').got, { st_s01: 5 }), '한쪽만 → 고친 사본');
  // mergeMeta: 한쪽에만 ach
  const meta = (o) => ({ ...structuredClone(DEFAULT_META), ...o });
  const srv = meta({ ach: { v: 1, got: { st_s01: 1 }, prog: {}, claimed: [], seenAt: 0, title: null, deco: null } });
  const loc = meta({});
  ok(isDeepStrictEqual(CL.mergeMeta(loc, srv).ach?.got, { st_s01: 1 }), 'mergeMeta: 서버에만 ach → 남김');
  ok(isDeepStrictEqual(CL.mergeMeta(srv, loc).ach?.got, { st_s01: 1 }), 'mergeMeta: 기기에만 ach → 남김');
  ok(CL.mergeMeta(meta({ ach: { got: { st_s02: 3 } } }), srv).ach.got.st_s01 === 1 && CL.mergeMeta(meta({ ach: { got: { st_s02: 3 } } }), srv).ach.got.st_s02 === 3, 'mergeMeta: 둘 다 → 합집합');
  // 옛 mergeMeta ({...b, ...a} — ach 를 모르는 클라이언트) 는 서버 ach 를 지우지 않는다
  const oldMerge = (x, y) => ({ ...y, ...x });
  ok(isDeepStrictEqual(oldMerge(loc, srv).ach, srv.ach), '옛 mergeMeta 는 자기 쪽에 ach 가 없으면 서버 것을 남긴다');
  // 해시 안정성: claimed 순서만 다르면 같은 정리 결과
  const h1 = CL.cleanMeta(meta({ ach: { got: { a_b: 1 }, claimed: ['st_s02', 'st_s01'] } })), h2 = CL.cleanMeta(meta({ ach: { got: { a_b: 1 }, claimed: ['st_s01', 'st_s02'] } }));
  eq(h1.ach, h2.ach, 'cleanMeta: claimed 순서와 상관없이 같은 모양 (metaHash 안정)');
  // ensureAch 멱등·던지지 않음·모르는 필드 보존
  const em = { ach: { v: 3, got: { st_s01: 5, ST: 1 }, prog: { kills: -1, deaths: 2 }, claimed: 'x', seenAt: 'y', title: 9, futureField: { z: 1 } } };
  const e1 = clone(M.ensureAch(em));
  const e2 = clone(M.ensureAch(em));
  ok(isDeepStrictEqual(e1, e2) && e1.v === 3 && isDeepStrictEqual(e1.got, { st_s01: 5 }) && isDeepStrictEqual(e1.prog, { deaths: 2 }) && isDeepStrictEqual(e1.claimed, []) && e1.seenAt === 0 && e1.title === null && isDeepStrictEqual(e1.futureField, { z: 1 }), 'ensureAch: 고침·모르는 필드 보존·멱등');
  for (const x of [null, 5, 'x', [], { ach: [] }, { ach: 'x' }, { ach: null }]) { try { const r = M.ensureAch(x); ok(M.isValidAch(r), `ensureAch(${JSON.stringify(x)}) 유효`); } catch { ok(false, `ensureAch(${JSON.stringify(x)}) 던짐`); } }
  // 메타 올리기(PUT) 도중에 이 기기에서 얻은 업적·prog 는 충돌(409) 병합 뒤에도 남는다 (cloud._syncMeta — 보내기 전 사본으로 합치면 applyMeta 가 지운다)
  {
    const C = CL.cloud, keep = { game: C.game, auth: C.auth, request: C.request };
    const g = { meta: meta({ ach: { v: 1, got: { st_s01: 1000 }, prog: {}, claimed: [], seenAt: 0, title: null, deco: null } }) };
    const s1 = meta({ ach: { got: { cb_kill_1k: 2000 } } }), s2 = meta({ ach: { got: { cb_kill_1k: 2000, cp_first: 3000 } } });
    let puts = 0;
    try {
      C.game = g; C.auth = { id: 'tester', token: 't'.repeat(43), remember: false };
      C.request = async (method, p) => {
        if (method === 'GET' && p === '/meta') return { ok: true, rev: 1, data: s1 };
        if (method === 'PUT' && p === '/meta' && ++puts === 1) { g.meta.ach.got.sc_cat = 4000; g.meta.ach.prog.style = 7; return { ok: false, error: 'conflict', server: { rev: 2, data: s2 } }; }
        return { ok: true, rev: 3, savedAt: 5000 };
      };
      const r = await quiet(() => C._syncMeta({ rev: 1 }));
      eq([r.ok, Object.keys(g.meta.ach.got).sort(), g.meta.ach.prog.style], [true, ['cb_kill_1k', 'cp_first', 'sc_cat', 'st_s01'], 7], '메타 동기화 충돌: 올리는 동안 얻은 업적·prog 가 남음');
    } finally { Object.assign(C, keep); }
  }
}

// ═════════ C6 서버 검사 ═════════
if (run('C6')) {
  section('C6 서버 검사 (cleanAch ↔ isValidAch)');
  const DATA_MAX_DEPTH = scfg.DATA_MAX_DEPTH;
  const META_LIMIT = scfg.BODY_LIMIT.meta;
  const serverOk = (m) => sval.isValidMeta(m) && sval.safeTree(m, DATA_MAX_DEPTH) && JSON.stringify({ data: m, baseRev: 1 }).length <= META_LIMIT;
  const KEYS = ['st_s01', 'cb_kill_1k', 'kills', 'a', 'AB', 'ab', 'a'.repeat(32), 'a'.repeat(33), '_x', '1a', 'a-b', 'a b', '__proto__', 'constructor', 'toString', 'ok_1', 'é', '', 't_dawn', 'd_moon'];
  const VALS = [0, 1, -1, 1e9, 1e9 + 1, 1e13, 1e13 + 1, 1e14, 0.5, NaN, Infinity, -Infinity, '5', null, true, [], {}];
  const rkey = () => (rnd() < 0.5 ? pick(KEYS) : `k_${ri(400)}${rnd() < 0.1 ? 'X' : ''}`);
  const rval = () => (rnd() < 0.6 ? ri(1e6) : pick(VALS));
  const rmap = (n) => { const o = {}; for (let i = 0; i < n; i++) o[rkey()] = rval(); return o; };
  const deep = (d) => (d <= 0 ? 1 : { n: deep(d - 1) });
  const fuzzAch = () => {
    const r = rnd();
    if (r < 0.04) return pick([[], 'x', 5, null, true]);
    const a = {};
    if (rnd() < 0.9) a.v = pick([1, 1, 2, 0, -1, 1.5, 99, 100, '1', null]);
    if (rnd() < 0.95) a.got = rnd() < 0.05 ? pick([[], 'x', 5]) : rmap(rnd() < 0.1 ? 300 + ri(80) : ri(80));
    if (rnd() < 0.9) a.prog = rnd() < 0.05 ? pick([[], 'x']) : rmap(rnd() < 0.1 ? 140 + ri(40) : ri(40));
    if (rnd() < 0.9) a.claimed = rnd() < 0.05 ? pick(['x', {}, 5]) : Array.from({ length: rnd() < 0.1 ? 260 + ri(50) : ri(40) }, () => (rnd() < 0.9 ? rkey() : rval()));
    if (rnd() < 0.8) a.seenAt = pick([0, 5, -1, 1e13, 1e14, 'x', null, NaN]);
    if (rnd() < 0.8) a.title = pick([null, 't_dawn', 'T_DAWN', 7, '', 'x'.repeat(40), 't_' + 'z'.repeat(31)]);
    if (rnd() < 0.8) a.deco = pick([null, 'd_moon', 'D', [], 'd_x']);
    if (rnd() < 0.3) a.future = 'x'.repeat(ri(30000));
    if (rnd() < 0.2) a.deep = deep(ri(40));
    if (rnd() < 0.1) a.nested = { got: rmap(5), list: Array.from({ length: ri(500) }, () => 'yy') };
    return a;
  };
  let failClean = 0, agree = 0, disagree = 0, maxLen = 0;
  for (let i = 0; i < 2000; i++) {
    const ach = fuzzAch();
    const m = { ...structuredClone(DEFAULT_META), endingsSeen: ['normal'], ach };
    let c;
    try { c = CL.cleanMeta(m); } catch (e) { failClean++; console.log('  cleanMeta 던짐', e.message); continue; }
    const achOk = c.ach === null || (sval.isValidAch(c.ach) && M.isValidAch(c.ach));
    if (!serverOk(c) || !achOk) { failClean++; if (failClean < 4) console.log('  ✗ 정리 결과가 서버 검사 실패:', JSON.stringify(c.ach).slice(0, 300)); }
    maxLen = Math.max(maxLen, JSON.stringify(c.ach ?? null).length);
    // 클라이언트 사본과 서버 검사의 판정이 같다 (JSON 으로 오간 값)
    const j = JSON.parse(JSON.stringify(ach) ?? 'null');
    if (sval.isValidAch(j) === M.isValidAch(j)) agree++; else disagree++;
  }
  ok(failClean === 0, `퍼징 ach 2,000개: cleanMeta(m) 는 늘 서버 isValidMeta·safeTree·64KB 통과 (${failClean})`);
  ok(disagree === 0, `클라이언트 isValidAch = 서버 isValidAch (${agree}/${agree + disagree})`);
  console.log(`  퍼징 2,000: 정리 실패 ${failClean}, 판정 불일치 ${disagree}, 정리된 ach 최대 ${maxLen} B (≤ ${M.ACH_LIMITS.maxBytes})`);
  ok(maxLen <= M.ACH_LIMITS.maxBytes, '정리된 ach ≤ 24 KB');
  // 잘못된 모양 → 서버 거절
  const bads = [
    ['대문자 키', { got: { ST_S01: 1 } }], ['got 값 문자열', { got: { st_s01: '1' } }], ['got 음수', { got: { st_s01: -1 } }], ['got 1e14', { got: { st_s01: 1e14 } }],
    ['prog 1e10', { prog: { kills: 1e10 } }], ['키 257개', { got: Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`a_${i}`, 1])) }],
    ['prog 129개', { prog: Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`p_${i}`, 1])) }], ['claimed 257', { claimed: Array.from({ length: 257 }, (_, i) => `c_${i}`) }],
    ['title 숫자', { title: 7 }], ['deco 형식', { deco: 'Bad' }], ['ach 배열', []], ['ach 문자열', 'x'], ['25 KB', { got: {}, pad: 'x'.repeat(25 * 1024) }],
    ['v 0', { v: 0 }], ['v 100', { v: 100 }], ['seenAt 음수', { seenAt: -1 }], ['claimed 문자열', { claimed: 'st_s01' }], ['got 배열', { got: [] }],
  ];
  for (const [name, a] of bads) ok(!sval.isValidMeta({ ...DEFAULT_META, ach: a }) && !M.isValidAch(a), `서버 거절: ${name}`);
  ok(sval.isValidMeta({ ...DEFAULT_META, ach: null }) && sval.isValidMeta({ ...DEFAULT_META }), 'ach null·없음 허용');
  ok(sval.isValidMeta({ ...DEFAULT_META, ach: { v: 1, got: {}, prog: {}, claimed: [], seenAt: 0, title: null, deco: null, futureX: [1] } }), '모르는 필드 허용');
  // 최대 ach + 명예의 전당 200줄
  const key = (p, i) => `${p}${String(i).padStart(30 - p.length + 2, '0')}`.slice(0, 32);
  const maxAch = {
    v: 1, got: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [key('g', i), 1e13])), prog: Object.fromEntries(Array.from({ length: 128 }, (_, i) => [key('p', i), 1e9])),
    claimed: Array.from({ length: 256 }, (_, i) => key('c', i)), seenAt: 1e13, title: 't_legend', deco: 'd_moon',
  };
  const hs = Array.from({ length: 200 }, (_, i) => ({ score: 999999 - i, stageId: 's20', charId: 'isolde', diff: 'inferno', date: 1759700000000 + i, mode: ['story', 'bossrush', 'survival', 'tower', 'practice'][i % 5], name: '밤의사냥꾼', run: `1:${1759600000000 + i}`, wave: 10, bosses: 22, floor: 50, time: 1234 }));
  const big = { ...structuredClone(DEFAULT_META), unlockedChars: [...CHAR_ORDER], endingsSeen: ['bad', 'normal', 'true', 'p2', 'p2true'], highScores: hs, bestiary: Object.fromEntries(Object.keys(ENEMIES).map((k) => [k, 999])), ach: maxAch };
  const cb = CL.cleanMeta(big);
  const blen = JSON.stringify({ data: cb, baseRev: 9 }).length;
  ok(blen <= META_LIMIT && serverOk(cb), `최대 ach + 명예의 전당 200줄 → cleanMeta ${blen} B ≤ 64 KB, 서버 검사 통과`);
  ok(sval.isValidAch(cb.ach) && Object.keys(cb.ach.got).length + Object.keys(cb.ach.prog).length + cb.ach.claimed.length > 300, `최대 ach 는 24 KB 에 맞게 줄여도 대부분 남는다 (got ${Object.keys(cb.ach.got).length}·prog ${Object.keys(cb.ach.prog).length}·claimed ${cb.ach.claimed.length})`);
  // 지금 설계의 최대 (67 업적 모두 + prog 25 + claimed 46)
  const real = { v: 1, got: Object.fromEntries(D.ACHIEVEMENTS.map((d) => [d.id, 1759700000000])), prog: Object.fromEntries(A.PROG_KEYS.map((k) => [k, 123456])), claimed: D.ACHIEVEMENTS.map((d) => d.id), seenAt: 1759700000000, title: 't_legend', deco: 'd_moon' };
  const rlen = JSON.stringify(real).length;
  ok(rlen < 5000 && isDeepStrictEqual(M.cleanAch(real).got, real.got), `지금 설계 최대 ach ${rlen} B (≈ 4 KB), 정리해도 그대로`);
}

// ═════════ C7 보상 ═════════
if (run('C7')) {
  section('C7 보상');
  const town = { mode: 'town', run: { damageTaken: 0 } };
  {
    const st = story(2);
    const g = mkGame({ state: st, world: town });
    const goldBefore = st.gold, potBefore = st.inventory.filter((i) => i.baseId === 'c_potion').reduce((a, i) => a + i.qty, 0);
    ok(g.ach.canClaim().reason === 'none' && g.ach.claimAll() === null, '받을 것 없음 → null (none)');
    g.ach._grant('st_s01'); g.ach._grant('cb_style_s'); g.ach._grant('st_end1');
    ok(g.ach.summary().claimable === 2, 'claimable 2 (이명 업적 제외)');
    const sw = g.saves.slotWrites, mw = g.saves.metaWrites;
    const r = g.ach.claimAll();
    ok(r && r.gold === 250 && st.gold === goldBefore + 250, `골드 250 (기본 10점 × 25) (${r?.gold})`);
    ok(r && r.items.length === 1 && r.items[0].id === 'c_potion' && r.items[0].qty === 3 && r.items[0].name === ITEMS.c_potion.name, '아이템 회복 물약 ×3 (이름 포함)');
    ok(st.inventory.filter((i) => i.baseId === 'c_potion').reduce((a, i) => a + i.qty, 0) === potBefore + 3, '가방에 들어감');
    ok(r && r.queued === 0 && isDeepStrictEqual([...r.ids].sort(), ['cb_style_s', 'st_s01']), 'ids');
    ok(g.saves.slotWrites === sw + 1 && g.saves.metaWrites === mw + 1, `슬롯 저장 1번 · 메타 저장 1번 (${g.saves.slotWrites - sw}, ${g.saves.metaWrites - mw})`);
    eq(g.game.meta.ach.claimed, ['cb_style_s', 'st_s01'], 'claimed');
    ok(g.saves.slots[2].gold === st.gold, '슬롯에 저장된 골드');
    ok(g.ach.claimAll() === null && g.ach.canClaim().reason === 'none', '두 번째 → null');
    ok(g.ach.status('st_s01').claimed && !g.ach.status('st_s01').claimable, 'status claimed');
    const rw = g.ach.reward('cl_docs10');
    ok(rw.items[0].name === ITEMS.c_ether.name && rw.gold === 0 && rw.claimable && g.ach.reward('st_end1').title.name === '새벽을 연 자', 'reward(id)');
    g.done();
  }
  {
    // 가방이 가득 → 보관함 (queued)
    const st = story(1);
    while (st.inventory.length < INV_LIMIT) addItem(st, makeItem(Object.keys(ITEMS).find((id) => ITEMS[id].slot === 'head')), { silent: true });
    const g = mkGame({ state: st, world: town });
    g.ach._grant('cl_docs10');
    const r = g.ach.claimAll();
    ok(r && r.queued === 3 && r.items[0].id === 'c_ether', `가방 가득 → queued 3 (${r?.queued})`);
    g.done();
  }
  {
    // 받을 수 없는 곳
    const cases = [
      ['아케이드 임시 세이브', (() => { const s = story(0); s.arcade = { kind: 'bossrush' }; return s; })(), town, 'arcade'],
      ['세이브 없음', null, town, 'no_slot'],
      ['슬롯 0', story(0), town, 'no_slot'],
      ['스테이지 안', story(1), { mode: 'story', run: {} }, 'not_town'],
      ['장면 없음(타이틀)', story(1), null, 'not_town'],
    ];
    for (const [name, st, world, reason] of cases) {
      const g = mkGame({ state: st, world });
      g.ach._grant('st_s01');
      const c = g.ach.canClaim();
      ok(!c.ok && c.reason === reason && g.ach.claimAll() === null && !g.game.meta.ach.claimed.length, `${name} → null, 이유 ${reason} (${c.reason})`);
      g.done();
    }
  }
}

// ═════════ C8 온라인 이명 ═════════
if (run('C8')) {
  section('C8 온라인 이명');
  eq([...gd.TITLE_IDS].sort(), Object.keys(M.ACH_TITLES).sort(), 'TITLE_IDS = ACH_TITLES');
  const OL = await imp('src/core/online.js');
  const base = { time: 60000, score: 1, hero: 'kael', cls: 'kael_hunter', level: 10 };
  ok(OL.cleanResult({ ...base, ti: 't_dawn' }).ti === 't_dawn', 'cleanResult: ti 형식이 맞으면 옮긴다');
  for (const bad of ['x', 'T_DAWN', 't_', 7, null, '새벽을 연 자', 't_' + 'a'.repeat(31), 't_dawn<script>']) ok(!('ti' in OL.cleanResult({ ...base, ti: bad })), `cleanResult: ti ${JSON.stringify(bad)} 버림`);
  ok(Object.keys(M.ACH_TITLES).every((k) => OL.TITLE_RE.test(k)), '모든 이명 id 가 클라이언트 형식(TITLE_RE)에 맞음');
  // arcade_run.js onlinePayload 가 고른 이명을 싣는다 (소스 확인 — 브라우저 모듈)
  const ar = fs.readFileSync(path.join(ROOT, 'src/scenes/front/arcade_run.js'), 'utf8');
  ok(/const ti = this\.game\.ach\?\.title\?\.\(\); if \(ti\) result\.ti = ti;/.test(ar), 'onlinePayload: result.ti = game.ach.title()');
  ok(/perfect: this\.log\.filter\(\(l\) => l\.perfect\)\.length/.test(ar) && /daily: this\.cfg\.daily\?\.date \?\? null/.test(ar), 'arcade_run: extra.perfect · arcadeFinished.daily');
  // 서버 시험 (메모리 저장소): tools/online/test_online.mjs 의 이명 사례
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/online/test_online.mjs'), '--mode=memory', '--filter=이명'], { encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  ok(r.status === 0 && /통과 1, 실패 0/.test(out), `test_online.mjs 이명 사례 (memory) ${r.status === 0 ? '통과' : '실패\n' + out.slice(-800)}`);
}

// ═════════ C9 회차 ═════════
// docs/specs/ngplus.md §6: 엔진 요약이 지난 회차 기록(ng.past)을 가상 슬롯으로 함께 읽는다 → 넘겨도 새 달성 0 · 진행이 줄지 않음 ·
// diffEnding 은 그 회차(가상 슬롯)의 난이도로만. 업적 고정 수(67 · 1,630 · 17 · 25)는 C1 이 그대로 본다
if (run('C9')) {
  section('C9 회차 (ngplus.md §6)');
  const NG = await imp('src/game/ngplus.js');
  const { migrateState } = await imp('src/game/state.js');
  const NOW = Date.UTC(2026, 9, 6, 3, 0, 0);
  const ngOf = (src, now = NOW) => NG.startNgPlus(quiet(() => migrateState(clone(src))), { slot: src.slot ?? 1, now });
  /** 모든 업적 조건의 지표 값 (진행 막대의 원본) */
  const metrics = (ctx) => Object.fromEntries(D.ACHIEVEMENTS.map((d) => [d.id, A.metric(d.cond.m, d.cond.arg, ctx)]));
  const p2 = part2Save();
  const next = ngOf(p2);
  ok(next.ng?.n === 1 && next.progress.chapter === 0 && Object.keys(next.progress.cleared).length === 0 && next.quests.done.length === 0, `넘긴 세이브: n 1 · 1장 · 클리어·의뢰 비움 (${JSON.stringify({ n: next.ng?.n, ch: next.progress.chapter })})`);
  // 요약: 1회차 세이브는 past 없음 (모양 그대로), 회차 세이브는 past = 가상 슬롯 (영웅·통계·동료·가방 비어 있음, 난이도 = past.diff)
  ok(!('past' in A.digestState(p2)), '1회차 세이브 요약에는 past 키가 없다');
  const dn = A.digestState(next);
  ok(dn?.past && Object.keys(dn.past.cleared).length === 20 && dn.past.bosses.length === 20 && dn.past.questsDone.length === 35 && dn.past.secrets === 25 && dn.past.relics === 5,
    `회차 요약 past: 클리어 20 · 보스 20 · 의뢰 35 · 비밀 25 · 유물 5 (${JSON.stringify(dn?.past && { c: Object.keys(dn.past.cleared).length, b: dn.past.bosses.length, q: dn.past.questsDone.length, s: dn.past.secrets, r: dn.past.relics })})`);
  ok(dn?.past && !('past' in dn.past) && Object.keys(dn.past.heroes).length === 0 && dn.past.stats.kills === 0 && Object.keys(dn.past.owned).length === 0 && dn.past.enhance === 0 && dn.past.difficulty === 'normal',
    '가상 슬롯: 재귀 없음 · 영웅·통계·동료·가방 비어 있음 · 난이도 = past.diff');
  ok(isDeepStrictEqual(A.digestState(next), dn), 'digestState(회차 세이브) 결정적');
  {
    // 같은 계정(이미 받은 업적) — 넘기기 → 슬롯 쓰기 → 소급: 새 달성 0, 알림 0, 진행 줄지 않음
    const g = mkGame({ meta: P2_META, slots: { 2: p2 } });
    const first = g.ach.rescan('retro');
    eq([...first].sort(), [...P2_EXPECT].sort(), '넘기기 전 소급 = C3 의 집합 E');
    const m0 = metrics(g.ach._engine.ctx(true));
    const ev0 = g.events.length, mw0 = g.saves.metaWrites;
    g.saves.write(2, ngOf(g.saves.read(2)));   // 같은 슬롯을 새 회차로 (slots.js §2.1 흐름: saves.write)
    await tick(); await tick();
    ok(g.ach.rescan('retro').length === 0 && g.events.length === ev0, `넘긴 뒤 rescan('retro') 새 달성 0 · achievementUnlocked 0번 (${g.events.length - ev0})`);
    ok(g.saves.metaWrites === mw0, `메타 저장 없음 (${g.saves.metaWrites - mw0})`);
    const ctx = g.ach._engine.ctx(true);
    ok(ctx.slots.length === 2, `ctx.slots = 지금 회차 + 지난 회차 가상 슬롯 (${ctx.slots.length})`);
    const m1 = metrics(ctx);
    const down = D.ACHIEVEMENTS.filter((d) => m1[d.id] < m0[d.id]).map((d) => `${d.id} ${m0[d.id]}→${m1[d.id]}`);
    ok(down.length === 0, `67개 조건의 지표가 하나도 줄지 않음 (${down.join(', ')})`);
    for (const id of ['ch_rank_s', 'ch_rank_s_all', 'cl_secret20', 'cl_quest30', 'st_end2', 'cl_relics', 'cl_otherworld']) ok(m1[id] === m0[id], `${id} 진행 그대로 (${m0[id]} → ${m1[id]})`);
    // 가상 슬롯이 진행을 붙잡는다: 지난 회차 칸을 빼면 줄어든다 (훅이 없을 때의 모습)
    const noPast = { ...ctx, slots: ctx.slots.filter((d) => d !== ctx.slots[1]) };
    ok(A.metric('secrets', null, noPast) === 0 && A.metric('quests', null, noPast) === 0 && A.metric('rankS', DEF.get('ch_rank_s_all').cond.arg, noPast) === 0, '지난 회차 칸이 없으면 비밀·의뢰·S 랭크가 0 (가상 슬롯이 진행을 붙잡음)');
    // 지금 게임 중인 회차 슬롯 (실시간 요약)도 같다
    g.game.state = quiet(() => migrateState(g.saves.read(2)));
    ok(g.ach.rescan('retro').length === 0 && g.ach._engine.ctx(true).slots.length === 2, '게임 중인 회차 슬롯(live)도 가상 슬롯 + 새 달성 0');
    // 새 회차에서 같은 일을 다시 해도 두 번 받지 않는다 (s01 클리어 · 의뢰 · 비밀)
    const st = g.game.state;
    const t01 = STAGES.s01.parTime * 0.8;   // 빠른 클리어(ch_speed, ≤ 0.5)는 아닌 시간 — 지난 회차와 같은 기록
    st.progress.cleared.s01 = { rank: 'S', time: t01, score: 1 }; st.progress.secrets.push('s01:k0'); st.quests.done.push('q_0');
    bus.emit('stageCleared', { stageId: 's01', rank: 'S', time: t01 }); await tick(); await tick();
    const again = g.ach.rescan('retro');
    ok(g.events.length === ev0 && again.length === 0, `새 회차의 같은 클리어·비밀·의뢰 → 새 달성 0 (${JSON.stringify(g.events.slice(ev0))} ${again})`);
    // 두 번째 넘기기 (n 2): past 합치기, 여전히 새 달성 0
    g.game.state = null;
    const n2 = ngOf(st, NOW + 1000);
    g.saves.write(2, n2); await tick(); await tick();
    ok(n2.ng.n === 2 && g.ach.rescan('retro').length === 0 && g.events.length === ev0, `두 번째 넘기기(n ${n2.ng.n}) → 새 달성 0`);
    const m2 = metrics(g.ach._engine.ctx(true));
    ok(D.ACHIEVEMENTS.every((d) => m2[d.id] >= m0[d.id]), '두 번째 넘기기 뒤에도 지표가 줄지 않음');
    g.done();
  }
  {
    // 새 계정(받은 것 없음)에서 넘기기 전·뒤 소급 집합이 같다 — 같은 기록을 다시 읽을 뿐 (ngplus.md §10.1 N11 과 같은 계약)
    const a = mkGame({ meta: P2_META, slots: { 1: p2 } }), b = mkGame({ meta: P2_META, slots: { 1: next } });
    const ga = a.ach.rescan('retro'), gb = b.ach.rescan('retro');
    eq([...gb].sort(), [...ga].sort(), '새 계정: 넘긴 세이브의 소급 집합 = 넘기기 전 세이브의 집합');
    ok(!gb.includes('ch_nightmare_p2') && !gb.includes('ch_hard_p1'), `보통 난이도 회차 세이브 → ch_nightmare_p2 · ch_hard_p1 아님 (${gb.filter((x) => x.startsWith('ch_')).join(',')})`);
    a.done(); b.done();
  }
  {
    // 빈 슬롯 복사(ngcopy, slots.js): 원래 슬롯은 그대로이고 복사본도 같은 누적 통계(처치 5,000)를 가진다 — 같은 진행(created)을 두 번 세지 않는다
    // (합 지표 kills 가 10,000 이 되어 cb_kill_10k 를 거짓으로 주고 prog.kills 를 부풀리던 결함, NG-VERIFY)
    const g = mkGame({ meta: P2_META, slots: { 1: p2 } });
    g.ach.rescan('retro');
    const k0 = A.metric('kills', null, g.ach._engine.ctx(true)), ev0 = g.events.length;
    g.saves.write(3, NG.startNgPlus(quiet(() => migrateState(g.saves.read(1))), { slot: 3, now: NOW }));
    await tick(); await tick();
    const k1 = A.metric('kills', null, g.ach._engine.ctx(true));
    ok(k0 === 5000 && k1 === 5000 && g.ach.rescan('retro').length === 0 && g.events.length === ev0 && g.game.meta.ach.prog.kills === 5000,
      `빈 슬롯 복사: 처치 수 합 그대로 (${k0} → ${k1}, prog ${g.game.meta.ach.prog.kills}) · 새 달성 0 (${JSON.stringify(g.events.slice(ev0))})`);
    g.done();
  }
  {
    // diffEnding 은 가상 슬롯 자신의 (난이도, 엔딩 깃발) 로만 선다
    const hardPast = clone(next); hardPast.ng.past.diff = 'hard';   // 지난 회차를 베테랑으로 끝냈다
    const g1 = mkGame({ meta: P2_META, slots: { 1: hardPast } });
    const got1 = g1.ach.rescan('retro');
    ok(got1.includes('ch_hard_p1') && !got1.includes('ch_nightmare_p2'), `past.diff 'hard' + 엔딩 깃발 → ch_hard_p1 (가상 슬롯), ch_nightmare_p2 아님 (${got1.filter((x) => x.startsWith('ch_')).join(',')})`);
    g1.done();
    // 거꾸로: 지금 회차 난이도가 베테랑이어도 지난 회차(보통)의 엔딩 깃발과 섞이지 않는다
    const mixed = clone(next); mixed.difficulty = 'hard'; mixed.ng.past.diff = 'normal';
    const g2 = mkGame({ meta: P2_META, slots: { 1: mixed } });
    const got2 = g2.ach.rescan('retro');
    ok(!got2.includes('ch_hard_p1') && !got2.includes('ch_nightmare_p2'), `지금 'hard' + 지난 회차 'normal' 엔딩 → ch_hard_p1 아님 (섞이지 않음) (${got2.filter((x) => x.startsWith('ch_')).join(',')})`);
    g2.done();
    // 지옥 지난 회차 + 2부 엔딩 → ch_nightmare_p2 (가상 슬롯), 1부도
    const infPast = clone(next); infPast.ng.past.diff = 'inferno';
    const g3 = mkGame({ meta: P2_META, slots: { 1: infPast } });
    const got3 = g3.ach.rescan('retro');
    ok(got3.includes('ch_nightmare_p2') && got3.includes('ch_hard_p1'), `past.diff 'inferno' → ch_nightmare_p2 · ch_hard_p1 (${got3.filter((x) => x.startsWith('ch_')).join(',')})`);
    g3.done();
  }
  {
    // 손상된 ng 에도 던지지 않고 지금 슬롯 요약은 그대로
    const base = A.digestState(p2);
    for (const bad of ['x', 5, [], { n: 2 }, { n: 2, past: 'x' }, { n: 2, past: [] }, { n: 2, past: { cleared: 7, unlocked: 'x', flags: [] } }, { n: NaN, past: { diff: 'zzz' } }]) {
      const s = clone(p2); s.ng = bad;
      let d = null, threw = false;
      try { d = A.digestState(s); } catch { threw = true; }
      const { past, ...rest } = d ?? {};
      ok(!threw && d && isDeepStrictEqual(rest, base), `손상 ng ${JSON.stringify(bad)}: 던짐 없음, 지금 슬롯 요약 그대로`);
    }
  }
}

// ═════════ --ui (ACH-UI) ═════════
if (UI) {
  section('--ui (tools/qa/ach_ui.mjs, ACH-UI)');
  const p = path.join(ROOT, 'tools/qa/ach_ui.mjs');
  if (!fs.existsSync(p)) ok(false, 'tools/qa/ach_ui.mjs 가 아직 없음 (ACH-UI)');
  else {
    try {
      const mod = await import(pathToFileURL(p).href);
      const res = await mod.default({ root: ROOT, only: ONLY ? [...ONLY].filter((x) => x.startsWith('U')) : null });
      const bad = res === false || res?.ok === false || (Number.isFinite(res?.fails) && res.fails > 0) || (Number.isFinite(res?.failed) && res.failed > 0);
      ok(!bad, `ach_ui.mjs 결과 ${JSON.stringify(res)?.slice(0, 300)}`);
    } catch (e) { ok(false, `ach_ui.mjs 실행 오류: ${e?.stack ?? e}`); }
  }
}

console.log(`\n통과 ${passes}, 실패 ${fails} (${((Date.now() - T0) / 1000).toFixed(1)}초)`);
process.exit(fails ? 1 : 0);
