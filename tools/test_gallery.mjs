// 회랑 「GALLERY」 시험 (docs/specs/gallery.md §9.1) — 브라우저 없음, < 15초
//   node tools/test_gallery.mjs [--only G3,G5] [--ui]
//   G1 데이터 (assets/cg · assets/lo/cg · TRACKS · 음악 index.json 과 집합 대조 — 새 CG·곡을 표에 빠뜨리면 실패) · G2 요약(digestGal, 퍼징)
//   G3 소급 (고정 세이브 → 손으로 적은 기대 집합 · 회차로 넘긴 슬롯 · 아케이드) · G4 실시간 (슬롯 쓰기·되먹임·각성·동기화·디버그 부팅·메타 바꿔 끼우기)
//   G5 병합 (mergeGal·mergeMeta·옛 클라이언트·ensureGal) · G6 서버·크기 (퍼징 2,000 · 64 KB · PUT /api/meta) · G7 2부 숨김
//   --ui : GAL-UI 의 헤드리스 시험 tools/qa/gallery_ui.mjs (export default async function run(opts)) 도 돌린다 (§9.2 U1–U10)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const onlyArg = argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg ? new Set((onlyArg.includes('=') ? onlyArg.split('=')[1] : argv[argv.indexOf(onlyArg) + 1] ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)) : null;
const UI = argv.includes('--ui');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

// core/save.js 의 진짜 saves 를 쓰는 사례(G4 디버그 부팅)를 위한 localStorage 흉내 (다른 모듈을 읽기 전에)
const LS = new Map();
globalThis.localStorage ??= {
  getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => { LS.set(k, String(v)); }, removeItem: (k) => { LS.delete(k); },
  key: (i) => [...LS.keys()][i] ?? null, get length() { return LS.size; }, clear: () => LS.clear(),
};

const G = await imp('src/game/gallery.js');
const M = await imp('src/core/gal_meta.js');
const D = await imp('src/data/gallery.js');
const { bus } = await imp('src/core/events.js');
const CL = await imp('src/core/cloud.js');
const SV = await imp('src/core/save.js');
const { DEFAULT_META } = SV;
const { newGameState } = await imp('src/game/state.js');
const NG = await imp('src/game/ngplus.js');
const { SCRIPTS } = await imp('src/data/story.js');
const { STAGES } = await imp('src/data/stages.js');
const { BOSSES } = await imp('src/data/bosses.js');
const { TRACKS } = await imp('src/data/music.js');
const { CHARACTERS, CHAR_ORDER } = await imp('src/data/characters.js');
const { AWAKEN } = await imp('src/data/awaken.js');
const { ENDINGS } = await imp('src/scenes/front/ending.js');
const sval = await imp('netlify/lib/validate.mts');
const scfg = await imp('netlify/lib/config.mts');

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(isDeepStrictEqual(a, b), `${msg} — 기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)}`);
const clone = (o) => JSON.parse(JSON.stringify(o));
const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (id) => !ONLY || ONLY.has(id);
const section = (t) => console.log('▶ ' + t);
const T0 = Date.now();
let seed = 0x6a11e2;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const ri = (n) => Math.floor(rnd() * n);
const pick = (a) => a[ri(a.length)];
const sorted = (a) => [...a].sort();
const fixture = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, `tools/fixtures/${n}.json`), 'utf8'));
const FIX = ['save_v1', 'save_ch6_nocmp', 'save_p2done'];
const story = (slot = 1, charId = 'kael') => quiet(() => newGameState({ slot, difficulty: 'normal', charId }));
const ids = (k) => D[{ cg: 'GAL_CG', mus: 'GAL_MUSIC', th: 'GAL_THEATER' }[k]].map((d) => d.id);

// ── 가짜 저장소·게임 ──
function fakeSaves(slots = {}) {
  const listeners = new Set();
  const S = {
    slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, clone(v)])), metaWrites: 0, events: [],
    onWrite(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    notify(ev) { S.events.push(ev); for (const fn of [...listeners]) fn(ev); },
    read(s) { return S.slots[s] ? clone(S.slots[s]) : null; },
    write(s, st) { st.slot = s; S.slots[s] = clone(st); S.notify({ type: 'write', slot: s, ok: true }); return true; },
    store(s, st) { S.slots[s] = clone(st); return true; },   // 클라우드 받기 (알림 없음)
    remove(s) { delete S.slots[s]; S.notify({ type: 'remove', slot: s }); },
    saveMeta() { S.metaWrites++; S.notify({ type: 'meta', ok: true }); return true; },
  };
  return S;
}
function mkGame({ meta = {}, state = null, slots = {}, saves = null } = {}) {
  const sv = saves ?? fakeSaves(slots);
  const game = { meta: { ...structuredClone(DEFAULT_META), ...clone(meta) }, state, saves: sv };
  const gal = G.initGallery(game, { boot: false });
  return { game, saves: sv, gal, E: gal._engine, done: () => gal._dispose() };
}
const stored = (meta) => sorted([...Object.keys(meta.gal?.cg ?? {}).map((k) => 'cg:' + k), ...Object.keys(meta.gal?.mus ?? {}).map((k) => 'mus:' + k)]);
const thOpen = (gal) => gal.list('th').filter((r) => r.open).map((r) => r.def.id);
/** 실제 게임이 쓰는 메타: 엔딩 장면은 대본을 틀기 전에 meta.endingsSeen 에 적는다 → 고정 세이브의 ending_* 대본에서 */
const metaOf = (s) => ({ endingsSeen: (s.progress?.seenScripts ?? []).filter((x) => /^ending_/.test(x)).map((x) => x.slice(7)) });

// ═════════ G1 데이터 ═════════
if (run('G1')) {
  section('G1 데이터');
  const webp = (dir) => sorted(fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)));
  const cgIds = ids('cg'), musIds = ids('mus'), thIds = ids('th');
  eq(sorted(cgIds), webp('assets/cg'), 'GAL_CG = assets/cg/*.webp (새 CG 는 data/gallery.js 에 한 줄)');
  eq(sorted(cgIds), webp('assets/lo/cg'), 'GAL_CG = assets/lo/cg/*.webp');
  ok(cgIds.length === 34, `그림 34 (${cgIds.length})`);
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/audio/music/index.json'), 'utf8'));
  eq(sorted(musIds), sorted(Object.keys(TRACKS)), 'GAL_MUSIC = TRACKS 키 (새 곡은 data/gallery.js 에 한 줄)');
  eq(sorted(musIds), sorted(Object.keys(idx.tracks ?? {})), 'GAL_MUSIC = assets/audio/music/index.json 곡');
  ok(musIds.length === 44 && thIds.length === 8, `음악 44 · 극장 8 (${musIds.length} · ${thIds.length})`);
  for (const k of ['cg', 'mus', 'th']) {
    ok(new Set(ids(k)).size === ids(k).length, `${k} id 중복 없음`);
    ok(ids(k).every((id) => M.GAL_KEY_RE.test(id)), `${k} id 키 규칙`);
  }
  // need 문법과 참조
  const TOK = /^(always|start|die|arena|s:[a-z0-9_]+|c:(\*|s\d\d)|b:b_[a-z0-9_]+|boss:b_[a-z0-9_]+|e:[a-z0-9]+|f:[a-z0-9_]+|aw:[a-z]+)$/;
  const all = [...D.GAL_CG, ...D.GAL_MUSIC, ...D.GAL_THEATER];
  const badTok = [], badRef = [];
  for (const d of all) {
    if (!Array.isArray(d.need) || !d.need.length) { badTok.push(d.id + ':(없음)'); continue; }
    for (const t of d.need) {
      if (typeof t !== 'string' || !TOK.test(t)) { badTok.push(`${d.id}:${t}`); continue; }
      const [op, a] = t.split(':');
      const okRef = op === 's' ? Object.hasOwn(SCRIPTS, a) : op === 'c' ? a === '*' || (Object.hasOwn(STAGES, a) && a !== 'arena')
        : op === 'b' || op === 'boss' ? Object.hasOwn(BOSSES, a) : op === 'e' ? Object.hasOwn(ENDINGS, a) : op === 'aw' ? CHAR_ORDER.includes(a) : true;
      if (!okRef) badRef.push(`${d.id}:${t}`);
    }
  }
  ok(!badTok.length, `need 토큰 문법 (${badTok.join(' ')})`);
  ok(!badRef.length, `need 참조가 실재 (대본·장·보스·엔딩·영웅) (${badRef.join(' ')})`);
  ok(D.GAL_THEATER.find((d) => d.id === 'credits')?.need.includes('always') && D.GAL_MUSIC.filter((d) => d.need.includes('always')).map((d) => d.id).join() === 'title,credits'
    && !D.GAL_CG.some((d) => d.need.includes('always')), "'always' 는 title·credits 곡과 크레딧 줄만");
  // 그림의 s: 대본·boss: _pre 대본에 정말 그 cmd:'cg' 줄이 있다 (cutin 은 'cg/cutin_x' 로 적힌다)
  const cgIn = (sid, id) => (SCRIPTS[sid] ?? []).some((l) => l && l.cmd === 'cg' && String(l.id ?? '').replace(/^cg\//, '') === id);
  const noLine = [];
  for (const d of D.GAL_CG) {
    for (const t of d.need) {
      if (t.startsWith('s:') && !cgIn(t.slice(2), d.id)) noLine.push(`${d.id}←${t}`);
      if (t.startsWith('boss:') && !cgIn(t.slice(5) + '_pre', d.id)) noLine.push(`${d.id}←${t}_pre`);
    }
    if (d.need.includes('start') && !cgIn('prologue', d.id)) noLine.push(`${d.id}←prologue`);
  }
  ok(!noLine.length, `그림의 대본에 cmd:'cg' 줄이 있음 (${noLine.join(' ')})`);
  // 자리 힌트: 장 토큰이 있으면 '{N}장' (서막·엔딩 줄은 예외)
  const atBad = D.GAL_CG.filter((d) => {
    if (['서막', '제2부 서막', '엔딩', '각성'].includes(d.at)) return false;
    const sid = d.need.map((t) => /^c:(s\d\d)$/.exec(t)?.[1] ?? (/^boss:(.+)$/.exec(t) ? Object.keys(STAGES).find((s) => STAGES[s].boss === t.slice(5)) : null)).find(Boolean);
    return !sid || d.at !== `${Number(sid.slice(1))}장`;
  });
  ok(!atBad.length, `자리 힌트 '{N}장' = 그 장 (${atBad.map((d) => d.id + ':' + d.at).join(' ')})`);
  ok(D.GAL_CG.every((d) => d.key === 'cg/' + d.id && typeof d.name === 'string' && d.name && typeof d.at === 'string' && [1, 2, 'aw'].includes(d.part)), '그림: key·name·at·part');
  ok(D.GAL_CG.filter((d) => d.part === 1).length === 14 && D.GAL_CG.filter((d) => d.part === 2).length === 13 && D.GAL_CG.filter((d) => d.part === 'aw').length === 7, '분류 제1부 14 · 제2부 13 · 각성 7');
  // 각성 컷인: 영웅 순서·이름·각성 이름은 기존 문장
  const cut = D.GAL_CG.filter((d) => d.part === 'aw');
  eq(cut.map((d) => d.hero), [...CHAR_ORDER], '각성 컷인 순서 = CHAR_ORDER');
  ok(cut.every((d) => d.id === 'cutin_' + d.hero && d.name === CHARACTERS[d.hero].name && d.sub === '각성 — ' + AWAKEN[d.hero].name && d.need.includes('aw:' + d.hero)), '컷인 name = 영웅 이름 · sub = 각성 — {AWAKEN 이름} · aw: 토큰');
  ok(cut.every((d) => AWAKEN[d.hero].cutin === d.key), '컷인 key = AWAKEN[영웅].cutin');
  // 장 곡: STAGES[sid].music 과 맞고 인트로가 그 곡을 튼다 · 외전 장은 다른 장의 곡을 다시 쓴다
  const MUS = new Map(D.GAL_MUSIC.map((d) => [d.id, d]));
  const stBad = [];
  for (const [sid, st] of Object.entries(STAGES)) {
    if (sid === 'arena') { if (st.music !== 'arena' || !MUS.get('arena')?.need.includes('arena')) stBad.push('arena'); continue; }
    const m = MUS.get(st.music);
    if (!m) { stBad.push(`${sid}→${st.music}(없음)`); continue; }
    if (st.side) continue;
    if (st.music !== sid || !m.need.includes('c:' + sid) || !m.need.includes(`s:${sid}_intro`)) stBad.push(`${sid}→${st.music}`);
    if (!(SCRIPTS[`${sid}_intro`] ?? []).some((l) => l?.cmd === 'music' && l.id === sid)) stBad.push(`${sid}_intro 가 ${sid} 곡을 틀지 않음`);
  }
  ok(!stBad.length, `장 곡 need = STAGES[sid].music · 인트로가 그 곡 (${stBad.join(' ')})`);
  // 보스 곡: 모든 보스가 BOSSES[id].music 의 줄에 있고, boss: 토큰은 그 곡의 보스만
  const bBad = [];
  for (const [id, b] of Object.entries(BOSSES)) if (!MUS.get(b.music)?.need.includes('boss:' + id)) bBad.push(`${id}→${b.music}`);
  for (const m of D.GAL_MUSIC) for (const t of m.need) if (t.startsWith('boss:') && BOSSES[t.slice(5)]?.music !== m.id) bBad.push(`${m.id}:${t}`);
  ok(!bBad.length, `보스 곡 need = BOSSES[id].music (모든 보스) (${bBad.join(' ')})`);
  // 칸
  const secs = D.GAL_MUSIC_SECS.map((s) => s.id);
  eq(secs, ['story', 'p1', 'p2', 'boss', 'inter'], '음악 칸 다섯 (이야기와 마을 · 제1부 · 제2부 · 보스 · 막간)');
  ok(D.GAL_MUSIC.every((d) => secs.includes(d.sec)) && D.GAL_MUSIC.filter((d) => d.sec === 'p2').every((d) => d.p2), '곡 sec · 제2부 칸은 모두 p2');
  eq(D.GAL_PARTS.map((p) => p.id), [1, 2, 'aw'], '그림 칸 셋');
  // 극장: 엔딩 줄은 ENDINGS 의 기존 문장·값
  const thBad = D.GAL_THEATER.filter((d) => d.kind === 'ending').filter((d) => {
    const E = ENDINGS[d.ending];
    return !E || d.id !== 'end_' + d.ending || d.name !== 'ENDING ' + E.no || d.sub !== `「${E.name}」` || d.title?.eng !== E.eng || d.title?.kor !== E.name
      || d.bg !== E.bg || d.music !== E.music || d.script !== 'ending_' + d.ending || !SCRIPTS[d.script] || d.credits !== d.ending || !isDeepStrictEqual(d.need, ['e:' + d.ending]);
  });
  ok(!thBad.length && D.GAL_THEATER.filter((d) => d.kind === 'ending').length === 5, `엔딩 다섯 = ENDINGS (${thBad.map((d) => d.id).join(' ')})`);
  eq(thIds, ['prologue', 'p2_prologue', 'end_bad', 'end_normal', 'end_true', 'end_p2', 'end_p2true', 'credits'], '극장 순서');
  ok(D.GAL_THEATER.filter((d) => d.kind === 'script').every((d) => SCRIPTS[d.script] && (!d.music || TRACKS[d.music])), '서막 줄: 대본·곡 실재');
  // 2부 표시 (§3.5: 숨기기 전 20 · 33 · 5)
  const vis = (L) => L.filter((d) => !d.p2).length;
  eq([vis(D.GAL_CG), vis(D.GAL_MUSIC), vis(D.GAL_THEATER)], [20, 33, 5], '2부를 뺀 수 20 · 33 · 5');
  ok(D.GAL_CG.filter((d) => d.p2).every((d) => d.part === 2 || d.id === 'cutin_isolde') && D.GAL_CG.filter((d) => d.part === 2).every((d) => d.p2), '그림 p2 = 제2부 13 + cutin_isolde');
  eq(D.GAL_MUSIC.filter((d) => d.p2).map((d) => d.id), ['worldmap2', 's14', 's15', 's16', 's17', 's18', 's19', 's20', 'boss3', 'boss4', 'nihil'], '곡 p2 11');
  // 첫 조각: gal_meta 는 import 없음 · 데이터도 import 없음 · 엔진은 main.js 가 동적으로만
  const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  ok(!/^\s*import\s/m.test(src('src/core/gal_meta.js')) && !/^\s*import\s/m.test(src('src/data/gallery.js')), 'gal_meta.js · data/gallery.js 는 import 없음');
  ok(/import\('\.\/game\/gallery\.js'\)\.then\(\(G\) => G\.initGallery\(g\)\)/.test(src('src/main.js')) && !/^import .*game\/gallery\.js/m.test(src('src/main.js')), 'main.js loadRest 동적 import (정적 import 없음)');
  ok(/FRONT_SCENES\.add\('gallery'\)/.test(src('src/core/cloud.js')), "cloud.js FRONT_SCENES 에 'gallery'");
}

// ═════════ G2 요약 ═════════
if (run('G2')) {
  section('G2 digestGal');
  const v1 = fixture('save_v1'), c6 = fixture('save_ch6_nocmp'), p2 = fixture('save_p2done');
  const d1 = G.digestGal(v1);
  ok(d1 && d1.cleared.size === 13 && d1.bosses.has('b_dracula') && d1.seen.has('s13_outro') && d1.flags.has('abyss_open') && d1.tier.azel === 2 && d1.deaths === 41, 'save_v1 요약');
  const d6 = G.digestGal(c6);
  ok(d6 && d6.cleared.size === 6 && d6.tier.kael === 1 && d6.tier.sera === 0 && !d6.flags.has('boss_x'), 'save_ch6_nocmp 요약 (세라 기본 직업 = 단계 0)');
  const dp = G.digestGal(p2);
  ok(dp && dp.cleared.size === 22 && dp.flags.has('p2_started') && dp.tier.isolde === 2, 'save_p2done 요약 (외전 둘 포함)');
  for (const s of [v1, c6, p2]) { const c = clone(s); G.digestGal(s); ok(isDeepStrictEqual(s, c), '원본 불변'); }
  // 아케이드 임시 세이브 (대본 전부 본 것으로 표시 — front/arcade.js)
  const arc = story(0); arc.arcade = { kind: 'bossrush' }; arc.progress.seenScripts = Object.keys(SCRIPTS);
  ok(G.digestGal(arc) === null, 'state.arcade → null');
  // 회차 슬롯: past 의 장·보스·깃발을 더한다 (seenScripts 는 비어 있다)
  const ng = NG.startNgPlus(clone(p2), { slot: 1, now: 1759700000000 });
  const dn = G.digestGal(ng);
  ok(ng.progress.seenScripts.length === 0 && dn && dn.seen.size === 0 && dn.cleared.size === 22 && dn.bosses.has('b_nihil') && dn.flags.has('p2_started') && dn.flags.has('ending_p2true'), '회차 슬롯 요약 = past 의 장·보스·깃발');
  for (const x of [null, undefined, 5, 'x', [], {}, { progress: 7 }, { progress: { seenScripts: 'x', cleared: [], bosses: {}, flags: 5 } }, { heroes: { kael: { classId: 'nope' } }, stats: { deaths: 'x' } }]) {
    let r; try { r = G.digestGal(x); } catch { r = 'throw'; }
    ok(r === null || (r instanceof Object && r !== 'throw' && Number.isFinite(r.deaths)), `이상한 값 ${JSON.stringify(x)}`);
  }
  // 손상 세이브 500개 퍼징
  const BAD = [null, undefined, 0, -1, 1e300, NaN, Infinity, '', 'x', true, [], [1, 'a', null], {}, { a: 1 }, { __proto__: { polluted: 1 } }];
  const mutate = (o, depth = 0) => {
    if (!o || typeof o !== 'object') return;
    const keys = Object.keys(o);
    if (!keys.length) return;
    for (let i = 0; i < 1 + ri(3); i++) {
      const k = pick(keys), r = rnd();
      if (r < 0.35) o[k] = pick(BAD);
      else if (r < 0.5) delete o[k];
      else if (depth < 4) mutate(o[k], depth + 1);
    }
  };
  let thrown = 0, changed = 0, badCtx = 0;
  const base = [v1, c6, p2, ng];
  for (let i = 0; i < 500; i++) {
    const s = clone(pick(base));
    mutate(s); if (rnd() < 0.5) mutate(s);
    if (rnd() < 0.1 && s && typeof s === 'object') s.ng = pick([{ n: 2, past: 'x' }, { past: { cleared: 5, flags: [] } }, 7, { n: 1, past: { bosses: [1, 'b_death'], flags: { p2_done: true } } }]);
    const before = JSON.stringify(s);
    try {
      const d = G.digestGal(s);
      const ctx = G.gatherGal({}, [s, d]);
      const r = G.scanGal(ctx);
      if (!Array.isArray(r.cg) || !Array.isArray(r.mus) || !Number.isFinite(ctx.d.deaths)) badCtx++;
    } catch { thrown++; }
    if (JSON.stringify(s) !== before) changed++;
  }
  ok(thrown === 0, `손상 세이브 500개: 던짐 0 (${thrown})`);
  ok(changed === 0, `손상 세이브 500개: 원본 불변 (${changed})`);
  ok(badCtx === 0, `손상 세이브 500개: 판정 문맥·결과 모양 (${badCtx})`);
  // evalNeed: 이상한 입력에 던지지 않는다
  for (const [need, ctx] of [[null, null], [['start'], null], [['x:y', 5, null], { d: 5, meta: 'm' }], [['e:bad'], { d: null, meta: { endingsSeen: 'bad' } }]]) {
    let r; try { r = G.evalNeed(need, ctx); } catch { r = 'throw'; }
    ok(r === false, `evalNeed(${JSON.stringify(need)}) → false`);
  }
}

// ═════════ G3 소급 ═════════
// 손으로 적은 기대 집합 (§4 규칙을 고정 세이브에 대어 본 것 — 엔진 출력을 옮겨 적은 것이 아니다):
//  save_v1 (1부 완주·진엔딩, 영웅 여섯 1차 이상, 죽음 41): 1부 그림 13(배드 엔딩 빼고) + 컷인 여섯 · 2부 곡·투기장·always 빼고 30곡
//  save_ch6_nocmp (6장까지, 카엘만 1차): 서막 셋 + 1·3·4·6장 넷 + 카엘 컷인 · 마을 여덟 + 이야기 + 1–6장 + boss(나이트윙…) + boss2(둘라한·본드래곤) + 승리 + 게임오버
//  save_p2done (2부 완주·외전 둘·영웅 일곱 2차): 그림 34 전부 · 투기장·always 빼고 41곡
const P1_CG = ['cg_prologue_moon', 'cg_prologue_attack', 'cg_alberto_church', 'cg_elise_taken', 'cg_castle_gate', 'cg_elise_rescued', 'cg_carmilla_library',
  'cg_death_appears', 'cg_dracula_throne', 'cg_dracula_transform', 'cg_castle_collapse', 'cg_abyss_gate', 'cg_true_ending'];
const CUT6 = ['cutin_kael', 'cutin_sera', 'cutin_victor', 'cutin_bran', 'cutin_lia', 'cutin_azel'];
const TOWN = ['prologue', 'hub', 'inn', 'shop', 'smith', 'church', 'worldmap', 'minigame'];
const P1_CH = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 's13'];
const P2_CH = ['s14', 's15', 's16', 's17', 's18', 's19', 's20'];
const EXPECT = {
  save_v1: {
    cg: [...P1_CG, ...CUT6],
    mus: [...TOWN, 'story', 'sad', ...P1_CH, 'boss', 'boss2', 'dracula', 'chaos', 'victory', 'gameover', 'ending'],
    th: ['prologue', 'end_normal', 'end_true', 'credits'],
  },
  save_ch6_nocmp: {
    cg: ['cg_prologue_moon', 'cg_prologue_attack', 'cg_alberto_church', 'cg_elise_taken', 'cg_castle_gate', 'cg_elise_rescued', 'cg_carmilla_library', 'cutin_kael'],
    mus: [...TOWN, 'story', 's01', 's02', 's03', 's04', 's05', 's06', 'boss', 'boss2', 'victory', 'gameover'],
    th: ['prologue', 'credits'],
  },
  save_p2done: {
    cg: ids('cg'),
    mus: ids('mus').filter((id) => !['title', 'credits', 'arena'].includes(id)),
    th: ids('th'),
  },
};
const asStored = (e) => sorted([...e.cg.map((x) => 'cg:' + x), ...e.mus.map((x) => 'mus:' + x)]);
if (run('G3')) {
  section('G3 소급');
  {
    const g = mkGame();
    const r = g.gal.rescan('retro');
    ok(r.length === 0 && g.saves.metaWrites === 0 && !('gal' in g.game.meta), `빈 메타·빈 슬롯 → 저장 0, gal 을 만들지 않음 (${r.length}, ${g.saves.metaWrites})`);
    eq(ids('cg').filter((id) => g.gal.has('cg', id)), [], '그림 열림 0');
    eq(ids('mus').filter((id) => g.gal.has('mus', id)), ['title', 'credits'], "곡은 'always' 둘만");
    eq(thOpen(g.gal), ['credits'], '극장은 크레딧만');
    const s = g.gal.summary();
    eq([s.cg, s.mus, s.th, s.unseen, s.p2], [{ got: 0, total: 20 }, { got: 2, total: 33 }, { got: 1, total: 5 }, 0, false], 'summary (2부 숨김)');
    g.done();
  }
  for (const f of FIX) {
    const s = fixture(f), meta = metaOf(s), e = EXPECT[f];
    const g = mkGame({ meta, slots: { 2: s } });
    const r = g.gal.rescan('retro');
    eq(sorted(r), asStored(e), `${f}: 소급 = 손으로 적은 집합 (그림 ${e.cg.length} · 곡 ${e.mus.length})`);
    eq(stored(g.game.meta), asStored(e), `${f}: meta.gal 에 적힘`);
    eq(thOpen(g.gal), e.th, `${f}: 극장 열림`);
    ok(g.saves.metaWrites === 1, `${f}: saveMeta 정확히 한 번 (${g.saves.metaWrites})`);
    ok(g.gal.rescan('retro').length === 0 && g.saves.metaWrites === 1, `${f}: 다시 훑으면 0`);
    const times = Object.values(g.game.meta.gal.cg);
    ok(times.every((t) => t === times[0] && t > 0) && g.game.meta.gal.seenAt === 0, `${f}: 한 번에 같은 시각 · seenAt 0`);
    // 슬롯을 지워도 거두지 않는다
    g.saves.remove(2);
    ok(g.gal.rescan('retro').length === 0 && isDeepStrictEqual(stored(g.game.meta), asStored(e)), `${f}: 슬롯 삭제 뒤에도 남는다`);
    g.done();
    // 「피의 윤회」로 넘긴 슬롯 (seenScripts 빔)만 있어도 같은 집합
    const ng = NG.startNgPlus(quiet(() => clone(s)), { slot: 3, now: 1759700000000 });
    const g2 = mkGame({ meta, slots: { 3: ng } });
    ok(ng.progress.seenScripts.length === 0, `${f}: 넘긴 슬롯의 seenScripts 빔`);
    eq(sorted(g2.gal.rescan('retro')), asStored(e), `${f}: 회차로 넘긴 슬롯만 → 같은 집합`);
    eq(thOpen(g2.gal), e.th, `${f}: 회차로 넘긴 슬롯 → 같은 극장`);
    g2.done();
  }
  {
    // 아케이드 임시 세이브 (대본 전부 본 것으로 표시) → 0 — 슬롯에 있어도, 지금 game.state 여도
    const arc = story(1); arc.arcade = { kind: 'practice' }; arc.progress.seenScripts = Object.keys(SCRIPTS);
    arc.progress.cleared = { s01: { rank: 'S' } }; arc.progress.bosses = ['b_dracula'];
    const g = mkGame({ state: arc, slots: { 1: arc } });
    ok(g.gal.rescan('retro').length === 0 && g.gal.rescan('open').length === 0 && g.saves.metaWrites === 0, '아케이드 임시 세이브 → 0');
    g.done();
  }
  {
    const g = mkGame({ meta: { endingsSeen: ['bad'] } });
    eq(sorted(g.gal.rescan('retro')), ['cg:cg_bad_ending', 'mus:sad'], "meta.endingsSeen ['bad'] 만 → cg_bad_ending · sad");
    eq(thOpen(g.gal), ['end_bad', 'credits'], '… 극장 end_bad');
    g.done();
  }
  {
    const g = mkGame({ meta: { ach: { v: 1, got: {}, prog: { aw_lia: 1 }, claimed: [], seenAt: 0, title: null, deco: null } } });
    eq(g.gal.rescan('retro'), ['cg:cutin_lia'], 'meta.ach.prog.aw_lia 1 → cutin_lia');
    g.done();
  }
  {
    // 메타만의 증거: 서바이벌·탑 기록 → arena 곡 · 업적 누적 죽음 → gameover
    const g = mkGame({ meta: { survivalBest: 0, towerBest: { normal: { floor: 3, time: 100 } }, ach: { prog: { deaths: 2 } } } });
    eq(sorted(g.gal.rescan('retro')), ['mus:arena', 'mus:gameover'], 'towerBest 층 > 0 → arena · ach.prog.deaths → gameover');
    g.done();
  }
}

// ═════════ G4 실시간 ═════════
if (run('G4')) {
  section('G4 실시간');
  const base = () => {
    const s = story(1);
    s.progress.seenScripts = ['prologue', 's01_intro', 'b_nightwing_pre', 's01_outro'];
    s.progress.cleared = { s01: { rank: 'A', time: 300 } }; s.progress.bosses = ['b_nightwing'];
    return s;
  };
  {
    const st = base();
    const g = mkGame({ state: st, slots: { 1: st } });
    const first = g.gal.rescan('retro');
    ok(first.includes('cg:cg_elise_taken') && first.includes('mus:boss') && g.saves.metaWrites === 1, '시작: 1장 클리어 소급');
    ok(g.E.pend.timer === null, '자기 saveMeta 알림은 다시 보지 않음 (모으는 타이머 없음)');
    // 슬롯 쓰기: 5장 클리어 (0.5초 모아서)
    st.progress.seenScripts.push('s05_intro', 'b_bonedragon_pre', 's05_outro');
    st.progress.cleared.s05 = { rank: 'B', time: 600 }; st.progress.bosses.push('b_bonedragon');
    const rev0 = g.gal.rev;
    g.saves.write(1, st);
    g.saves.write(1, st);   // 같은 0.5초 안의 두 번째 쓰기는 한 번으로
    ok(g.E.pend.timer !== null && g.saves.metaWrites === 1, '쓰기 직후에는 아직 (0.5초 모음)');
    await sleep(650);
    eq(stored(g.game.meta).filter((x) => !first.includes(x)), ['mus:boss2', 'mus:s05'], '슬롯 쓰기(5장 클리어) → s05 · boss2');
    ok(g.saves.metaWrites === 2 && g.gal.rev > rev0, `saveMeta 1번 더 (${g.saves.metaWrites}) · rev 증가`);
    await sleep(650);
    ok(g.saves.metaWrites === 2 && g.E.pend.timer === null, '되먹임 0 (자기 메타 쓰기 뒤 다시 쓰지 않음)');
    // 저장 전 진행: 회랑을 열면 지금 game.state 를 본다 (캐시 + 지금 상태)
    st.progress.seenScripts.push('s06_outro');
    eq(g.gal.rescan('open'), ['cg:cg_carmilla_library'], "rescan('open') → 저장하지 않은 진행도 (지금 game.state)");
    // 각성 컷인 (아케이드에서도)
    const mw = g.saves.metaWrites;
    bus.emit('awakenCast', { charId: 'bran', tier: 1, classId: 'bran_warlord' });
    ok(g.gal.has('cg', 'cutin_bran') && g.saves.metaWrites === mw + 1, 'awakenCast bran → cutin_bran, saveMeta 1번');
    bus.emit('awakenCast', { charId: 'bran', tier: 1 });
    bus.emit('awakenCast', { charId: 'nobody' });
    ok(g.saves.metaWrites === mw + 1, '같은 것·모르는 영웅 → 쓰기 0');
    g.game.state = (() => { const a = story(0); a.arcade = { kind: 'bossrush' }; return a; })();
    bus.emit('awakenCast', { charId: 'victor', tier: 2 });
    ok(g.gal.has('cg', 'cutin_victor'), '아케이드 중 각성 → cutin_victor');
    g.game.state = st;
    // 남의 메타 쓰기: 엔딩 장면이 endingsSeen 에 적고 saveMeta → 메타 규칙만 다시
    g.game.meta.endingsSeen.push('bad');
    g.saves.saveMeta(g.game.meta);
    const mw2 = g.saves.metaWrites;
    await sleep(650);
    ok(g.gal.has('cg', 'cg_bad_ending') && g.gal.has('mus', 'sad') && g.saves.metaWrites === mw2 + 1, '남의 메타 쓰기 (엔딩) → cg_bad_ending · sad, 쓰기 1번');
    // 클라우드 동기화 뒤: 알림 없이 받은 슬롯 (saves.store) → 전부 훑기
    const p1 = fixture('save_v1'); g.saves.store(2, p1);
    bus.emit('cloud:sync', { phase: 'start' });
    bus.emit('cloud:sync', { phase: 'done', ok: true });
    await sleep(20);
    ok(g.gal.has('cg', 'cg_true_ending') && g.gal.has('mus', 'chaos'), "cloud:sync done → 전부 훑기 (받은 슬롯 2)");
    bus.emit('cloud:sync', { phase: 'done', ok: false });
    // game.meta 를 통째로 바꿔 끼운 뒤에도 (cloud.applyMeta·로그인 다른 계정)
    const old = g.game.meta;
    g.game.meta = CL.mergeMeta({ ...structuredClone(DEFAULT_META) }, clone(old));
    ok(g.gal.has('cg', 'cg_true_ending') && g.game.meta.gal !== old.gal, '바꿔 끼운 메타의 gal 을 읽는다');
    bus.emit('awakenCast', { charId: 'isolde', tier: 1 });
    ok(Object.hasOwn(g.game.meta.gal.cg, 'cutin_isolde') && !Object.hasOwn(old.gal.cg, 'cutin_isolde'), '쓰기도 새 메타에');
    g.game.meta = { ...structuredClone(DEFAULT_META) };
    ok(!g.gal.has('cg', 'cg_true_ending') && g.gal.summary().cg.got === 0, '빈 메타로 바꾸면 빈 회랑 (붙잡아 둔 객체 없음)');
    // markSeen: 새로 연 것이 있을 때만
    g.game.meta = old;
    const mw3 = g.saves.metaWrites;
    ok(g.gal.summary().unseen > 0 && g.gal.markSeen() === true && g.saves.metaWrites === mw3 + 1, 'markSeen → seenAt · saveMeta');
    ok(g.gal.summary().unseen === 0 && g.gal.isNew('cg', 'cg_true_ending') === false && g.gal.markSeen() === false && g.saves.metaWrites === mw3 + 1, '다시 markSeen → 쓰기 0');
    await sleep(5);
    g.gal._open('cg', 'cg_nihil');
    ok(g.gal.isNew('cg', 'cg_nihil') && g.gal.summary().unseen === 1 && g.gal.p2(), '_open 뒤 NEW 1 · 2부 그림이 열려 p2()');
    ok(g.gal._open('mus', 'title').length === 0 && g.gal._open('cg', 'cg_nope').length === 0 && !('title' in g.game.meta.gal.mus), "_open: 'always'·모르는 id 는 적지 않음");
    // 슬롯 삭제 알림 → 요약만 비운다
    g.saves.remove(2);
    ok(g.gal.has('cg', 'cg_true_ending'), '슬롯 삭제 → 거두지 않음');
    delete g.game.meta.gal.cg.cutin_lia;
    g.done();
    const mw4 = g.saves.metaWrites;
    bus.emit('awakenCast', { charId: 'lia' });
    g.saves.write(1, st);
    await sleep(650);
    ok(!g.game.meta.gal.cg.cutin_lia && g.saves.metaWrites === mw4 && !g.game.gal, '_dispose 뒤 구독 없음 · game.gal 지움');
  }
  {
    // 디버그 부팅: 진짜 saves (core/save.js) — saveMeta 는 디버그 칸에만, 알림 debug:true
    const S = SV.saves;
    LS.clear();
    const realBefore = JSON.stringify({ ...structuredClone(DEFAULT_META), endingsSeen: ['p2'] });
    localStorage.setItem('bloodnocturne_meta', realBefore);
    const evs = [];
    const offW = S.onWrite((ev) => evs.push(ev));
    S.markDebugBoot();
    try {
      const game = { meta: S.loadMeta(), state: null, saves: S };
      const gal = G.initGallery(game, { boot: false });
      const r = gal.rescan('retro');
      ok(r.includes('cg:cg_p2_ending'), '디버그 부팅: 진짜 메타에서 읽는다 (endingsSeen p2)');
      ok(localStorage.getItem('bloodnocturne_meta') === realBefore, '진짜 메타 칸은 그대로');
      const dbg = JSON.parse(localStorage.getItem(SV.DEBUG_META_KEY) ?? 'null');
      ok(dbg?.gal?.cg?.cg_p2_ending > 0, `쓰기는 디버그 칸 ${SV.DEBUG_META_KEY}`);
      ok(evs.length === 1 && evs[0].type === 'meta' && evs[0].debug === true, `알림 debug:true 한 번 (${JSON.stringify(evs)})`);
      gal._dispose();
    } finally { S.debugBoot = false; offW(); LS.clear(); }
  }
  {
    // 부팅 소급은 한가할 때 (업적보다 늦게 — 1.5초 뒤)
    const g = { meta: { ...structuredClone(DEFAULT_META), endingsSeen: ['true'] }, state: null, saves: fakeSaves() };
    const gal = G.initGallery(g);
    ok(G.initGallery(g) === gal, 'initGallery 두 번 → 같은 객체');
    ok(g.saves.metaWrites === 0, '부팅 직후에는 훑지 않음');
    await sleep(1600);
    ok(g.saves.metaWrites === 1 && gal.has('cg', 'cg_true_ending'), '1.5초 뒤 소급 (retro)');
    gal._dispose();
  }
}

// ═════════ G5 병합 ═════════
if (run('G5')) {
  section('G5 병합');
  const A = { v: 1, cg: { cg_a: 500, cg_b: 300 }, mus: { s01: 10 }, seenAt: 100, devOnly: 1 };
  const B = { v: 2, cg: { cg_b: 200, cg_future: 900 }, mus: { s01: 20, s99: 5 }, seenAt: 50, srvOnly: { x: 1 }, devOnly: 2 };
  const m = M.mergeGal(A, B);
  eq(m.cg, { cg_a: 500, cg_b: 200, cg_future: 900 }, 'cg 합집합 · 가장 이른 시각 · 모르는 id 보존');
  eq(m.mus, { s01: 10, s99: 5 }, 'mus 합집합 · 가장 이른 시각');
  ok(m.v === 2 && m.seenAt === 100, 'v·seenAt 큰 값');
  ok(m.devOnly === 1 && isDeepStrictEqual(m.srvOnly, { x: 1 }), '모르는 필드 {...b, ...a} (이 기기 우선)');
  ok(A.cg.cg_b === 300 && B.cg.cg_b === 200, '입력 불변');
  // 교환·결합·멱등 (퍼징 300)
  const KEYS = ['cg_a', 'cg_b', 'cg_c', 's01', 's02', 'BAD', '1x', 'a'.repeat(33), '__proto__', 'title'];
  const VALS = [1, 5, 1e13, 1e13 + 1, 0, -1, NaN, '5', null, 1759700000000, 2.5];
  const rmap = () => { const o = {}; for (let i = 0, n = ri(8); i < n; i++) o[pick(KEYS)] = pick(VALS); return o; };
  const rgal = () => (rnd() < 0.05 ? pick([null, 'x', [], 5]) : { v: pick([1, 2, 0, 'x', 99, 100]), cg: rnd() < 0.05 ? 'x' : rmap(), mus: rmap(), seenAt: pick([0, 5, -1, 1e13, 'x']) });
  let bad = 0;
  const core = (g) => ({ v: g.v, cg: g.cg, mus: g.mus, seenAt: g.seenAt });
  for (let i = 0; i < 300; i++) {
    const x = rgal(), y = rgal(), z = rgal();
    if (!isDeepStrictEqual(core(M.mergeGal(x, y)), core(M.mergeGal(y, x)))) bad++;
    if (!isDeepStrictEqual(core(M.mergeGal(M.mergeGal(x, y), z)), core(M.mergeGal(x, M.mergeGal(y, z))))) bad++;
    const xx = M.mergeGal(x, x);
    if (!isDeepStrictEqual(core(M.mergeGal(xx, x)), core(xx)) || !isDeepStrictEqual(core(xx), core(M.ensureGal({ gal: clone(x) ?? null })))) bad++;
  }
  ok(bad === 0, `교환·결합·멱등 300회 (${bad})`);
  eq(M.mergeGal(null, undefined), M.newGal(), '둘 다 없으면 빈 기록');
  eq(M.mergeGal({ cg: { cg_a: 5, BAD: 1, cg_b: 'n', cg_c: 0 } }, 'nope'), { v: 1, cg: { cg_a: 5 }, mus: {}, seenAt: 0 }, '한쪽만 → 고친 사본 (0·문자열·대문자 버림)');
  // mergeMeta: 한쪽에만 gal
  const meta = (o) => ({ ...structuredClone(DEFAULT_META), ...o });
  const srv = meta({ gal: { v: 1, cg: { cg_prologue_moon: 7 }, mus: {}, seenAt: 3 } });
  const loc = meta({});
  ok(CL.mergeMeta(loc, srv).gal?.cg?.cg_prologue_moon === 7, 'mergeMeta: 서버에만 gal → 남김');
  ok(CL.mergeMeta(srv, loc).gal?.cg?.cg_prologue_moon === 7, 'mergeMeta: 기기에만 gal → 남김');
  const both = CL.mergeMeta(meta({ gal: { cg: { cg_prologue_moon: 9, cg_nihil: 4 } } }), srv);
  ok(both.gal.cg.cg_prologue_moon === 7 && both.gal.cg.cg_nihil === 4 && both.gal.seenAt === 3, 'mergeMeta: 둘 다 → 합집합 · 이른 시각 · seenAt 큰 값');
  ok(!('gal' in CL.mergeMeta(loc, meta({}))), 'mergeMeta: 둘 다 없으면 gal 을 만들지 않음');
  // 옛 mergeMeta ({...b, ...a} — gal 을 모르는 클라이언트) 는 서버 gal 을 지우지 않는다
  const oldMerge = (x, y) => ({ ...y, ...x });
  ok(isDeepStrictEqual(oldMerge(loc, srv).gal, srv.gal), '옛 mergeMeta 는 자기 쪽에 gal 이 없으면 서버 것을 남긴다');
  // cleanMeta: 키 순서와 상관없이 같은 모양 (metaHash 안정) · null·이상한 값
  eq(CL.cleanMeta(meta({ gal: { cg: { cg_b: 1, cg_a: 2 } } })).gal, CL.cleanMeta(meta({ gal: { cg: { cg_a: 2, cg_b: 1 } } })).gal, 'cleanMeta: 같은 내용이면 같은 gal');
  ok(CL.cleanMeta(meta({ gal: 'x' })).gal === null && !('gal' in CL.cleanMeta(meta({}))), "cleanMeta: gal 이 객체가 아니면 null · 없으면 없음");
  // ensureGal 멱등·던지지 않음·모르는 필드 보존·제자리
  const em = { gal: { v: 3, cg: { cg_a: 5, CG: 1, cg_z: -2 }, mus: 'x', seenAt: 'y', futureField: { z: 1 } } };
  const ref = em.gal;
  const e1 = clone(M.ensureGal(em)), e2 = clone(M.ensureGal(em));
  ok(isDeepStrictEqual(e1, e2) && em.gal === ref && e1.v === 3 && isDeepStrictEqual(e1.cg, { cg_a: 5 }) && isDeepStrictEqual(e1.mus, {}) && e1.seenAt === 0 && isDeepStrictEqual(e1.futureField, { z: 1 }), 'ensureGal: 제자리 고침·모르는 필드 보존·멱등');
  for (const x of [null, 5, 'x', [], { gal: [] }, { gal: 'x' }, { gal: null }, Object.freeze({ gal: Object.freeze({ v: 'x' }) })]) {
    try { const r = M.ensureGal(x); ok(M.isValidGal(r), `ensureGal(${JSON.stringify(x)}) 유효`); } catch { ok(false, `ensureGal(${JSON.stringify(x)}) 던짐`); }
  }
  // 메타 올리기(PUT) 도중에 이 기기에서 연 그림은 충돌(409) 병합 뒤에도 남는다 (cloud._syncMeta)
  {
    const C = CL.cloud, keep = { game: C.game, auth: C.auth, request: C.request };
    const g = { meta: meta({ gal: { v: 1, cg: { cg_prologue_moon: 1000 }, mus: {}, seenAt: 0 } }) };
    const s1 = meta({ gal: { cg: { cg_elise_taken: 2000 } } }), s2 = meta({ gal: { cg: { cg_elise_taken: 2000, cg_nihil: 3000 }, mus: { s20: 3000 } } });
    let puts = 0;
    try {
      C.game = g; C.auth = { id: 'tester', token: 't'.repeat(43), remember: false };
      C.request = async (method, p) => {
        if (method === 'GET' && p === '/meta') return { ok: true, rev: 1, data: s1 };
        if (method === 'PUT' && p === '/meta' && ++puts === 1) { g.meta.gal.cg.cutin_kael = 4000; return { ok: false, error: 'conflict', server: { rev: 2, data: s2 } }; }
        return { ok: true, rev: 3, savedAt: 5000 };
      };
      const r = await quiet(() => C._syncMeta({ rev: 1 }));
      eq([r.ok, sorted(Object.keys(g.meta.gal.cg)), g.meta.gal.mus], [true, ['cg_elise_taken', 'cg_nihil', 'cg_prologue_moon', 'cutin_kael'], { s20: 3000 }], '메타 동기화 충돌: 올리는 동안 연 그림이 남음 · 서버 것 합침');
    } finally { Object.assign(C, keep); }
  }
}

// ═════════ G6 서버·크기 ═════════
if (run('G6')) {
  section('G6 서버 검사·크기');
  const DATA_MAX_DEPTH = scfg.DATA_MAX_DEPTH, META_LIMIT = scfg.BODY_LIMIT.meta;
  const serverOk = (m) => sval.isValidMeta(m) && sval.safeTree(m, DATA_MAX_DEPTH) && JSON.stringify({ data: m, baseRev: 1 }).length <= META_LIMIT;
  const KEYS = ['cg_prologue_moon', 'cutin_kael', 's01', 'a', 'AB', 'ab', 'a'.repeat(32), 'a'.repeat(33), '_x', '1a', 'a-b', 'a b', '__proto__', 'constructor', 'toString', 'ok_1', 'é', ''];
  const VALS = [0, 1, -1, 1e13, 1e13 + 1, 1e14, 0.5, 9999999999999.998, NaN, Infinity, -Infinity, '5', null, true, [], {}];
  const rkey = () => (rnd() < 0.5 ? pick(KEYS) : `k_${ri(400)}${rnd() < 0.1 ? 'X' : ''}`);
  const rval = () => (rnd() < 0.6 ? 1759700000000 + ri(1e9) : pick(VALS));
  const rmap = (n) => { const o = {}; for (let i = 0; i < n; i++) o[rkey()] = rval(); return o; };
  const deep = (d) => (d <= 0 ? 1 : { n: deep(d - 1) });
  const fuzzGal = () => {
    if (rnd() < 0.04) return pick([[], 'x', 5, null, true]);
    const g = {};
    if (rnd() < 0.9) g.v = pick([1, 1, 2, 0, -1, 1.5, 99, 100, '1', null]);
    if (rnd() < 0.95) g.cg = rnd() < 0.05 ? pick([[], 'x', 5]) : rmap(rnd() < 0.15 ? 70 + ri(300) : ri(60));
    if (rnd() < 0.95) g.mus = rnd() < 0.05 ? pick([[], 'x']) : rmap(rnd() < 0.15 ? 100 + ri(300) : ri(60));
    if (rnd() < 0.8) g.seenAt = pick([0, 5, -1, 1e13, 1e14, 'x', null, NaN]);
    if (rnd() < 0.3) g.future = 'x'.repeat(ri(12000));
    if (rnd() < 0.2) g.deep = deep(ri(40));
    if (rnd() < 0.1) g.nested = { cg: rmap(5), list: Array.from({ length: ri(500) }, () => 'yy') };
    return g;
  };
  let failClean = 0, badGal = 0, maxLen = 0;
  for (let i = 0; i < 2000; i++) {
    const gal = fuzzGal();
    const m = { ...structuredClone(DEFAULT_META), endingsSeen: ['normal'], gal };
    let c;
    try { c = CL.cleanMeta(m); } catch (e) { failClean++; console.log('  cleanMeta 던짐', e.message); continue; }
    if (!serverOk(c)) { failClean++; if (failClean < 4) console.log('  ✗ 정리 결과가 서버 검사 실패:', JSON.stringify(c.gal).slice(0, 300)); }
    const cg = M.cleanGal(gal);
    if (!(c.gal === null || M.isValidGal(c.gal)) || !M.isValidGal(cg) || Object.keys(cg.cg).length > 64 || Object.keys(cg.mus).length > 96) badGal++;
    maxLen = Math.max(maxLen, JSON.stringify(c.gal ?? null).length, JSON.stringify(cg).length);
  }
  ok(failClean === 0, `퍼징 gal 2,000개: cleanMeta(m) 는 늘 서버 isValidMeta·safeTree·64KB 통과 (${failClean})`);
  ok(badGal === 0, `퍼징 gal 2,000개: cleanGal ≤ 8 KB · 키 상한 (cg 64 · mus 96) · 규칙 (${badGal})`);
  ok(maxLen <= M.GAL_LIMITS.maxBytes, `정리된 gal 최대 ${maxLen} B ≤ 8 KB`);
  console.log(`  퍼징 2,000: 정리 실패 ${failClean}, 규칙 밖 ${badGal}, 정리된 gal 최대 ${maxLen} B`);
  // 상한 가득 + 긴 소수 시각 → 뒤에서 잘라 8 KB
  const key = (p, i) => `${p}${String(i).padStart(31 - p.length, '0')}`.slice(0, 32);
  const maxGal = { v: 99, cg: Object.fromEntries(Array.from({ length: 64 }, (_, i) => [key('c', i), 9999999999999.998])), mus: Object.fromEntries(Array.from({ length: 96 }, (_, i) => [key('m', i), 9999999999999.998])), seenAt: 1e13, pad: 'x'.repeat(3000) };
  const cm = M.cleanGal(maxGal);
  ok(M.isValidGal(cm) && JSON.stringify(cm).length <= 8192 && !('pad' in cm) && Object.keys(cm.cg).length === 64 && Object.keys(cm.mus).length < 96, `가득 찬 gal → 모르는 필드부터, 그다음 mus 뒤쪽 (${JSON.stringify(cm).length} B, mus ${Object.keys(cm.mus).length})`);
  // 지금 설계의 최대 (그림 34 + 곡 42 전부)
  const real = { v: 1, cg: Object.fromEntries(ids('cg').map((id) => [id, 1759700000000])), mus: Object.fromEntries(ids('mus').filter((id) => !['title', 'credits'].includes(id)).map((id) => [id, 1759700000000])), seenAt: 1759712000000 };
  const rlen = JSON.stringify(real).length;
  ok(rlen < 3000 && isDeepStrictEqual(M.cleanGal(real), real), `지금 설계 최대 gal ${rlen} B (≈ 2.6 KB), 정리해도 그대로`);
  // 최대 gal + 최대 ach + 명예의 전당 200줄 → 64 KB 안 (cleanMeta 의 56 KB 줄이기 규칙)
  const maxAch = {
    v: 1, got: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [key('g', i), 1e13])), prog: Object.fromEntries(Array.from({ length: 128 }, (_, i) => [key('p', i), 1e9])),
    claimed: Array.from({ length: 256 }, (_, i) => key('k', i)), seenAt: 1e13, title: 't_legend', deco: 'd_moon',
  };
  const hs = Array.from({ length: 200 }, (_, i) => ({ score: 999999 - i, stageId: 's20', charId: 'isolde', diff: 'inferno', date: 1759700000000 + i, mode: ['story', 'bossrush', 'survival', 'tower', 'practice'][i % 5], name: '밤의사냥꾼', run: `1:${1759600000000 + i}`, wave: 10, bosses: 22, floor: 50, time: 1234 }));
  const big = { ...structuredClone(DEFAULT_META), unlockedChars: [...CHAR_ORDER], endingsSeen: ['bad', 'normal', 'true', 'p2', 'p2true'], highScores: hs, ach: maxAch, gal: { ...maxGal, pad: undefined } };
  const cb = CL.cleanMeta(big);
  const blen = JSON.stringify({ data: cb, baseRev: 9 }).length;
  ok(blen <= META_LIMIT && serverOk(cb) && M.isValidGal(cb.gal), `최대 gal + 최대 ach + 명예의 전당 200줄 → cleanMeta ${blen} B ≤ 64 KB, 서버 검사 통과`);
  ok(Object.keys(cb.gal.cg).length === 64, '… gal 은 줄지 않음 (그림 64)');
  ok(sval.isValidMeta({ ...DEFAULT_META, gal: real }) && sval.isValidMeta({ ...DEFAULT_META, gal: 'anything' }), '서버 isValidMeta 는 gal 을 검사하지 않는다 (모르는 필드 허용)');
  // test_api.mjs 흉내: 서버 처리기(netlify/functions/api.mts) + 메모리 저장소로 PUT /api/meta 에 gal → 200
  {
    const ENV = new Map([['AUTH_PEPPER', 'gal-test-pepper']]);   // 시험용 값 (경고 줄 없이)
    globalThis.Netlify ??= { context: null, env: { get: (k) => ENV.get(k), set: (k, v) => ENV.set(k, v), has: (k) => ENV.has(k), delete: (k) => ENV.delete(k), toObject: () => Object.fromEntries(ENV) } };
    const api = (await imp('netlify/functions/api.mts')).default;
    const rt = await imp('netlify/lib/runtime.mts');
    const scrypto = await imp('netlify/lib/crypto.mts');
    const { createMemoryBackend } = await imp('tools/accounts/mem_store.mjs');
    const backend = createMemoryBackend();
    rt.setStoreFactory((name, dc) => backend.factory(name, dc));
    scrypto.setHashCostForTests?.({ N: 1024, r: 8, p: 1 });
    const call = async (method, p, body, token) => {
      const h = new Headers({ 'content-type': 'application/json' });
      if (token) h.set('authorization', `Bearer ${token}`);
      const res = await api(new Request('https://game.test' + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), duplex: 'half' }), { requestId: 'test', ip: '198.51.100.77', deploy: { context: 'production', id: '0123456789abcdef01234567', published: true } });
      return { status: res.status, body: JSON.parse(await res.text()) };
    };
    const su = await call('POST', '/api/auth/signup', { id: 'galtester', password: 'crimson-moon-77' });
    ok(su.status === 201 && su.body.token, `가입 (${su.status})`);
    const m = CL.cleanMeta({ ...structuredClone(DEFAULT_META), endingsSeen: ['true'], gal: real });
    const put = await call('PUT', '/api/meta', { data: m, baseRev: 0 }, su.body.token);
    ok(put.status === 200 && put.body.ok && put.body.rev === 1, `PUT /api/meta (gal 포함) → 200 (${put.status} ${JSON.stringify(put.body).slice(0, 120)})`);
    const get = await call('GET', '/api/meta', undefined, su.body.token);
    ok(get.status === 200 && isDeepStrictEqual(get.body.data?.gal, real), 'GET /api/meta → gal 그대로');
    const put2 = await call('PUT', '/api/meta', { data: CL.cleanMeta({ ...m, gal: { ...maxGal } }), baseRev: 1 }, su.body.token);
    ok(put2.status === 200 && put2.body.ok, `가득 찬 gal (cleanMeta 뒤) 도 200 (${put2.status})`);
  }
}

// ═════════ G7 2부 숨김 ═════════
if (run('G7')) {
  section('G7 2부 숨김');
  {
    const v1 = fixture('save_v1');
    const g = mkGame({ meta: { endingsSeen: ['normal', 'true'] }, slots: { 1: v1 } });
    g.gal.rescan('retro');
    const s = g.gal.summary();
    ok(!s.p2 && !g.gal.p2(), '1부만 → p2() 거짓');
    eq([s.cg.total, s.mus.total, s.th.total], [20, 33, 5], '1부만 깬 메타·슬롯 → 수 20 · 33 · 5');
    eq([s.cg.got, s.mus.got, s.th.got], [19, 32, 4], '… 열림 19 · 32 · 4 (배드 엔딩·투기장·배드 엔딩 줄 빼고)');
    ok(['cg', 'mus', 'th'].every((k) => g.gal.list(k).every((r) => r.hidden === !!r.def.p2)), '2부 항목 hidden');
    ok(s.unseen === 19 + 30, `NEW 는 숨김 빼고 (${s.unseen})`);
    ok(g.gal.list('music').length === 44 && g.gal.list('theater').length === 8 && g.gal.list('x').length === 0, "list: 'music'·'theater' 별칭 · 모르는 종류 → []");
    g.done();
  }
  {
    const st = story(1); st.progress.flags.p2_started = true;
    const g = mkGame({ slots: { 1: st } });
    g.gal.rescan('retro');
    const s = g.gal.summary();
    ok(s.p2 && g.gal.p2(), 'p2_started 하나 → p2() 참');
    eq([s.cg.total, s.mus.total, s.th.total], [34, 44, 8], '… 수 34 · 44 · 8');
    ok(g.gal.list('cg').every((r) => !r.hidden), '숨김 없음');
    g.done();
  }
  for (const [name, meta, slot] of [
    ['endingsSeen p2true', { endingsSeen: ['p2true'] }, null],
    ['rook_revealed 깃발 (회차 past)', {}, (() => { const s = story(2); s.ng = { v: 1, n: 1, at: 1, hist: [], past: { flags: { rook_revealed: true } } }; return s; })()],
    ['2부 곡 하나 (cloud 로 받은 gal)', { gal: { v: 1, cg: {}, mus: { boss3: 5 }, seenAt: 0 } }, null],
  ]) {
    const g = mkGame({ meta, slots: slot ? { 2: slot } : {} });
    g.gal.rescan('retro');
    ok(g.gal.p2(), `${name} → p2()`);
    g.done();
  }
}

// ═════════ --ui (GAL-UI) ═════════
if (UI) {
  section('--ui (tools/qa/gallery_ui.mjs, GAL-UI)');
  const p = path.join(ROOT, 'tools/qa/gallery_ui.mjs');
  if (!fs.existsSync(p)) ok(false, 'tools/qa/gallery_ui.mjs 가 아직 없음 (GAL-UI)');
  else {
    try {
      const mod = await import(pathToFileURL(p).href);
      const res = await mod.default({ root: ROOT, only: ONLY ? [...ONLY].filter((x) => x.startsWith('U')) : null });
      const bad = res === false || res?.ok === false || (Number.isFinite(res?.fails) && res.fails > 0) || (Number.isFinite(res?.failed) && res.failed > 0);
      ok(!bad, `gallery_ui.mjs 결과 ${JSON.stringify(res)?.slice(0, 300)}`);
    } catch (e) { ok(false, `gallery_ui.mjs 실행 오류: ${e?.stack ?? e}`); }
  }
}

console.log(`\n통과 ${passes}, 실패 ${fails} (${((Date.now() - T0) / 1000).toFixed(1)}초)`);
process.exit(fails ? 1 : 0);
