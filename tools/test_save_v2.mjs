// 세이브 스키마 v2 테스트 (MASTER_PLAN §1.6, world2 §2.6, companions §8) — 사용: node tools/test_save_v2.mjs
//  1) newGameState: version 2, progress.shards/hearts, 동료 상태 (companion_state 가 실제 구현이면)
//  2) v1 고정 세이브(tools/fixtures/save_v1.json) → migrateState: v2 필드만 추가되고 나머지는 그대로, 멱등
//  3) shards/hearts 정리 (문자열만, 중복 제거), 모르는 필드 보존 (구버전 클라이언트 호환), version 은 항상 SAVE_VERSION
//  4) 손상 세이브 퍼징: migrateState 는 절대 throw 하지 않는다, 결과는 isValidSave (클라이언트·서버 복사본)
//  5) 프로토타입 키 방어 (charId/heroes/difficulty 에 '__proto__', 'constructor' …)
//  6) 20장 완료 + 동료 20 + 7단계 장비 + 가방 가득 세이브가 256 KB 미만 (서버 한도 512 KB)
//  7) 내보내기 코드 왕복에 동료·조각·심장이 실린다, computeStats 가 유한한 값을 돌려준다
//  8) 디버그 임시 세이브(saves.markDebug — ?scene=stage · ?scene=hub 부팅): write 는 진짜 슬롯 대신 디버그 칸 · 알림 없음 · slot 값 그대로
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(path.join(ROOT, p));
const { SAVE_VERSION, newGameState, migrateState, ensureHero, storyJoinedChars } = await imp('src/game/state.js');
const { computeStats } = await imp('src/game/stats.js');
const { isValidSave, saves, DEBUG_SLOT } = await imp('src/core/save.js');
const { CHARACTERS } = await imp('src/data/characters.js');
const { CLASSES } = await imp('src/data/classes.js');
const { ITEMS, makeItem, baseIdFor, WTYPES } = await imp('src/data/items.js');
const { addItem, INV_LIMIT } = await imp('src/game/inventory.js');
const CS = await imp('src/game/companion_state.js');
const CD = await imp('src/data/companions.js');
let serverValid = null, SAVE_LIMIT = 512 * 1024;
try { serverValid = (await imp('netlify/lib/validate.mts')).isValidSave; } catch (e) { console.log('  (서버 isValidSave 를 불러오지 못함: ' + e.message.split('\n')[0] + ')'); }
try { SAVE_LIMIT = (await imp('netlify/lib/config.mts')).BODY_LIMIT?.save ?? SAVE_LIMIT; } catch {}

const cmpStub = fs.readFileSync(path.join(ROOT, 'src/game/companion_state.js'), 'utf8').includes('STUB (W0 SKEL)');
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
const section = (t) => console.log('▶ ' + t);

// ── 1. 새 게임 ──
section('newGameState');
ok(SAVE_VERSION === 2, `SAVE_VERSION 은 2 여야 함 (현재 ${SAVE_VERSION})`);
const fresh = newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' });
ok(fresh.version === 2, 'new game version 2');
ok(Array.isArray(fresh.progress.shards) && fresh.progress.shards.length === 0, 'progress.shards = []');
ok(Array.isArray(fresh.progress.hearts) && fresh.progress.hearts.length === 0, 'progress.hearts = []');
if (!cmpStub) {
  ok(fresh.companions && fresh.companions.v === 1, 'newGameState → state.companions {v:1} (ensureCompanionState)');
  ok(fresh.heroes.kael.companions && 'mount' in fresh.heroes.kael.companions, 'hero.companions 편성 생성');
}
ok(isDeepStrictEqual(migrateState(clone(fresh)), fresh), 'migrateState(newGameState) 는 아무것도 바꾸지 않음');
ok(isValidSave(fresh) && (!serverValid || serverValid(fresh)), 'new game 은 isValidSave');

// ── 2. v1 고정 세이브 ──
section('v1 fixture → v2');
const v1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/save_v1.json'), 'utf8'));
ok(v1.version === 1 && !('shards' in v1.progress) && !('hearts' in v1.progress) && !('companions' in v1), 'fixture 는 v1 (shards/hearts/companions 없음)');
ok(v1.progress.chapter === 13 && Object.keys(v1.progress.cleared).length === 13 && v1.progress.bosses.length === 13, 'fixture 는 제1부 완료');
const m1 = migrateState(clone(v1));
ok(m1.version === 2, 'migrated version 2');
ok(isDeepStrictEqual(m1.progress.shards, []) && isDeepStrictEqual(m1.progress.hearts, []), 'shards/hearts 추가됨');
// v2 전용 필드를 뺀 나머지는 원본과 완전히 같아야 한다 (올바른 v1 세이브를 망가뜨리지 않음)
const strip = (s) => { const c = clone(s); delete c.version; delete c.companions; delete c.progress.shards; delete c.progress.hearts; for (const h of Object.values(c.heroes)) delete h.companions; return c; };
ok(isDeepStrictEqual(strip(m1), strip(v1)), 'v1 데이터는 그대로 보존 (v2 필드만 추가)');
if (!isDeepStrictEqual(strip(m1), strip(v1))) {
  const a = strip(m1), b = strip(v1);
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!isDeepStrictEqual(a[k], b[k])) console.log('    다른 키:', k);
}
const m2 = migrateState(clone(m1));
ok(isDeepStrictEqual(m2, m1), 'migrateState 멱등 (두 번 돌려도 같음)');
ok(isValidSave(m1) && (!serverValid || serverValid(m1)), 'migrated v1 은 isValidSave (클라이언트·서버)');
if (!cmpStub) {
  ok(m1.companions && m1.companions.v === 1, 'v1 → state.companions 생성 (migrateCompanions)');
  for (const [id, h] of Object.entries(m1.heroes)) ok(h.companions && Array.isArray(h.companions.guards), `hero ${id}.companions`);
}
for (const [id, h] of Object.entries(m1.heroes)) {
  const s = computeStats(m1, h);
  ok(['hp', 'mp', 'atk', 'mag', 'def', 'crit'].every((k) => Number.isFinite(s[k])) && s.hp > 0, `computeStats(${id}) 유한값`);
}

// ── 3. shards/hearts 정리, 모르는 필드 보존, 버전 ──
section('shards/hearts, unknown fields, version');
const s3 = clone(v1);
s3.progress.shards = ['k_star_1', 3, null, 'k_star_2', 'k_star_1', { id: 'x' }, 'k_star_9'];
s3.progress.hearts = 'k_heart_1';
s3.futureField = { keep: [1, 2, 3] };
s3.progress.futureProgress = 'x';
s3.heroes.kael.futureHeroField = 7;
s3.companions = { v: 1, owned: {}, eggs: {}, pending: [], clears: 0, autoSkill: null, slot2Seen: false, last: { mount: null, guards: [null, null] }, futureCmp: true };
const m3 = migrateState(s3);
ok(isDeepStrictEqual(m3.progress.shards, ['k_star_1', 'k_star_2', 'k_star_9']), 'shards: 문자열만, 중복 제거, 모르는 id 유지 → ' + JSON.stringify(m3.progress.shards));
ok(isDeepStrictEqual(m3.progress.hearts, []), 'hearts: 배열이 아니면 [] → ' + JSON.stringify(m3.progress.hearts));
ok(isDeepStrictEqual(m3.futureField, { keep: [1, 2, 3] }) && m3.progress.futureProgress === 'x' && m3.heroes.kael.futureHeroField === 7, '모르는 필드는 지우지 않음');
ok(m3.companions && typeof m3.companions === 'object', 'v2 세이브의 companions 는 유지');
const s3b = clone(m1); s3b.version = 3; s3b.v3Only = { a: 1 }; s3b.companions.v3Cmp = [1];
const m3b = migrateState(s3b);
ok(m3b.version === 2 && isDeepStrictEqual(m3b.v3Only, { a: 1 }) && isDeepStrictEqual(m3b.companions.v3Cmp, [1]), '더 새 클라이언트 세이브(3): 버전은 SAVE_VERSION 으로 (§1.6), 모르는 필드는 그대로');
for (const bad of [undefined, null, 'x', 0, -1, NaN]) { const s = clone(v1); s.version = bad; ok(migrateState(s).version === 2, `version ${String(bad)} → 2`); }

// ── 4. 손상 세이브 퍼징 ──
section('corrupt-save fuzz');
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const JUNK = [undefined, null, 0, -3, 1.5, NaN, Infinity, '', 'x', '__proto__', 'constructor', [], [1, 'a', null], {}, { a: 1 }, true, false];
const junk = () => clone({ v: JUNK[Math.floor(rnd() * JUNK.length)] }).v ?? JUNK[Math.floor(rnd() * 3)];
const PATHS = [['version'], ['difficulty'], ['charId'], ['gold'], ['lives'], ['inventory'], ['heroes'], ['progress'], ['progress', 'shards'], ['progress', 'hearts'], ['progress', 'cleared'], ['progress', 'flags'], ['progress', 'chapter'], ['progress', 'unlocked'], ['quests'], ['stats'], ['bestiary'], ['companions'], ['heroes', 'kael', 'level'], ['heroes', 'kael', 'equip'], ['heroes', 'kael', 'classId'], ['heroes', 'kael', 'companions'], ['heroes', 'kael', 'slots'], ['heroes', 'sera', 'skills']];
let fuzzThrows = 0, fuzzInvalid = 0, fuzzNotIdem = 0;
for (let i = 0; i < 400; i++) {
  const s = clone(v1);
  const n = 1 + Math.floor(rnd() * 4);
  for (let j = 0; j < n; j++) {
    const p = PATHS[Math.floor(rnd() * PATHS.length)];
    let o = s; for (let k = 0; k < p.length - 1; k++) { if (!o || typeof o !== 'object') { o = null; break; } o = o[p[k]]; }
    if (o && typeof o === 'object') o[p[p.length - 1]] = junk();
  }
  try {
    const r = quiet(() => migrateState(s));
    if (!isValidSave(r) || (serverValid && !serverValid(r))) fuzzInvalid++;
    const again = quiet(() => migrateState(clone(r)));
    if (!isDeepStrictEqual(clone(again), clone(r))) fuzzNotIdem++;   // 세이브는 항상 JSON (undefined 키는 사라짐)
    if (!Array.isArray(r.progress.shards) || !Array.isArray(r.progress.hearts) || r.version !== 2) fuzzInvalid++;
  } catch (e) { fuzzThrows++; if (fuzzThrows <= 3) console.log('    throw:', e.message); }
}
ok(fuzzThrows === 0, `퍼징 400회: throw ${fuzzThrows}회`);
ok(fuzzInvalid === 0, `퍼징 400회: isValidSave 실패 ${fuzzInvalid}회`);
ok(fuzzNotIdem === 0, `퍼징 400회: 멱등 아님 ${fuzzNotIdem}회`);

// ── 5. 프로토타입 키 방어 ──
section('prototype-key hardening');
for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
  const s = JSON.parse(JSON.stringify(v1).replace('"heroes":{', `"heroes":{"${key}":{"charId":"${key}","level":5,"equip":{}},`));
  s.charId = key; s.difficulty = key;
  const r = quiet(() => migrateState(s));
  ok(Object.hasOwn(CHARACTERS, r.charId), `charId '${key}' → 실존 캐릭터 (${r.charId})`);
  ok(!Object.hasOwn(r.heroes, key), `heroes['${key}'] 제거`);
  ok(r.difficulty === 'normal' && Number.isFinite(r.lives), `difficulty '${key}' → normal, lives 유한`);
  ok(isValidSave(r), `'${key}' 세이브도 isValidSave`);
}

// ── 6. 20장 완료 세이브 크기 ──
section('chapter-20 save size');
const big = newGameState({ slot: 3, difficulty: 'nightmare', charId: 'azel' });
for (const id of Object.keys(CHARACTERS)) ensureHero(big, id);
const tierOf = (slot, wtype) => (ITEMS[baseIdFor(slot, 7, { wtype })] ? 7 : 6);
const T7 = tierOf('weapon', 'whip');
big.inventory.length = 0;
for (const [id, h] of Object.entries(big.heroes)) {
  const cls = Object.values(CLASSES).find((c) => c.charId === id && c.tier === 2);
  h.level = 70; h.classId = cls?.id ?? h.classId;
  const wtype = CHARACTERS[id].weaponType;
  for (const [slot, bid] of Object.entries({ weapon: baseIdFor('weapon', T7, { wtype }), head: baseIdFor('head', T7), body: baseIdFor('body', T7), cloak: baseIdFor('cloak', T7), acc1: baseIdFor('acc', T7, { variant: 0 }), acc2: baseIdFor('acc', T7, { variant: 1 }) })) {
    const it = makeItem(bid, { rarity: 5, level: 15 }); if (!it) continue;
    addItem(big, it, { silent: true }); h.equip[slot] = it.uid;
  }
}
for (let i = 0; big.inventory.length < INV_LIMIT; i++) {
  const slot = ['weapon', 'head', 'body', 'cloak', 'acc'][i % 5];
  const it = makeItem(baseIdFor(slot, T7, { wtype: WTYPES[i % WTYPES.length], variant: i % 2 }), { rarity: 5, level: 15 });
  if (!it || addItem(big, it, { silent: true }) === false) break;
}
const P1 = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 's13'], P2 = ['s14', 's15', 's16', 's17', 's18', 's19', 's20'];
const bp = big.progress;
bp.chapter = 20;
bp.unlocked = [...P1, ...P2];
bp.cleared = Object.fromEntries([...P1, ...P2].map((s, i) => [s, { rank: 'S', time: 400 + i, score: 99999 + i }]));
bp.shards = ['k_star_1', 'k_star_2', 'k_star_3', 'k_star_4', 'k_star_5', 'k_star_6'];
bp.hearts = ['k_heart_1', 'k_heart_2', 'k_heart_3', 'k_heart_4', 'k_heart_5', 'k_heart_6'];
bp.docs = Array.from({ length: 27 }, (_, i) => 'd' + String(i + 1).padStart(2, '0'));
bp.lore = Array.from({ length: 34 }, (_, i) => 'l' + String(i + 1).padStart(2, '0'));
bp.bosses = ['b_nightwing', 'b_banshee', 'b_dullahan', 'b_crimson', 'b_bonedragon', 'b_grimoire', 'b_chimera', 'b_leviathan', 'b_colossus', 'b_frostqueen', 'b_death', 'b_dracula', 'b_chaos', 'b_narkissa', 'b_moloch', 'b_dagon', 'b_ziz', 'b_mara', 'b_behemoth', 'b_nihil'];
bp.relics = ['k_relic_1', 'k_relic_2', 'k_relic_3', 'k_relic_4', 'k_relic_5'];
bp.secrets = Array.from({ length: 80 }, (_, i) => `s${String(1 + (i % 20)).padStart(2, '0')}:r${i % 7}:${i * 3},${i % 13}`);
let scriptIds = [];
try { scriptIds = Object.keys((await imp('src/data/story.js')).SCRIPTS); } catch {}
while (scriptIds.length < 420) scriptIds.push('script_' + scriptIds.length);
bp.seenScripts = scriptIds;
for (const f of ['p2_started', 'rook_revealed', 'hearts_all', 'stars_all', 'p2_star', 'p2_done', 's14_revealed', 's20_revealed', 'dawnflower_given', 'ending_p2', 'ending_p2true', 'stable_open', 'relics_all', 'ending_true']) bp.flags[f] = true;
for (const b of bp.bosses) { bp.flags['boss_' + b] = true; bp.flags['loot_' + b] = true; }
const MOUNT_IDS = ['mt_warhorse', 'mt_boar', 'mt_skelsteed', 'mt_direwolf', 'mt_wyvern', 'mt_giantbat', 'mt_ignis', 'mt_gale', 'mt_silva'];
const GUARD_IDS = ['gd_fairy', 'gd_spiritwolf', 'gd_imp', 'gd_knight', 'gd_whelp', 'gd_owl', 'gd_clock', 'gd_reaper', 'gd_mirra', 'gd_lumen', 'gd_momo'];
for (const id of [...MOUNT_IDS, ...GUARD_IDS]) bp.flags['recruit_' + id] = true;
big.quests = { active: {}, done: Array.from({ length: 70 }, (_, i) => 'quest_' + i) };
big.bestiary = Object.fromEntries(Array.from({ length: 110 }, (_, i) => ['enemy_' + i, 9999]));
big.stats = { playTime: 360000, kills: 99999, deaths: 999, maxCombo: 999, goldEarned: 99999999, enhanceOk: 999, enhanceFail: 999, minigameWins: 999, bossKills: 999, docs: 27 };
big.gold = 99999999; big.score = 99999999;
// 동료 20 전원 (companions §8 스키마, 최대치) — 실제 구현이 있으면 그 API 로 해금하고, 없으면 스키마대로 채운다
const allIds = CD.COMPANION_ORDER?.length ? CD.COMPANION_ORDER : [...MOUNT_IDS, ...GUARD_IDS];
if (!cmpStub) { CS.ensureCompanionState(big); for (const id of allIds) CS.unlockCompanion(big, id, { source: 'debug', silent: true }); }
big.companions ??= { v: 1, owned: {}, eggs: {}, pending: [], clears: 0, autoSkill: null, slot2Seen: false, last: { mount: null, guards: [null, null] } };
for (const id of allIds) big.companions.owned[id] = { ...(big.companions.owned[id] ?? {}), lv: 30, exp: 99999, bond: 200, got: Date.now(), src: 'story', gift: 12, seen: true };
big.companions.pending = [...allIds];
big.companions.eggs = { mt_wyvern: { at: 12, got: Date.now() }, gd_whelp: { at: 9, got: Date.now() } };
big.companions.clears = 999; big.companions.slot2Seen = true;
big.companions.last = { mount: 'mt_gale', guards: ['gd_mirra', 'gd_lumen'] };
for (const h of Object.values(big.heroes)) h.companions = { mount: 'mt_ignis', guards: ['gd_fairy', 'gd_momo'] };
const bigM = quiet(() => migrateState(big));
const bytes = Buffer.byteLength(JSON.stringify(bigM), 'utf8');
console.log(`  20장 세이브: ${(bytes / 1024).toFixed(1)} KB (가방 ${bigM.inventory.length}/${INV_LIMIT}, 장비 단계 ${T7}${T7 < 7 ? ' — 7단계 베이스가 아직 없어 6단계로 측정' : ''}, 동료 ${Object.keys(bigM.companions?.owned ?? {}).length})`);
ok(bigM.inventory.length >= INV_LIMIT - 6, `가방이 가득 참 (${bigM.inventory.length})`);
ok(bytes < 256 * 1024, `20장 세이브는 256 KB 미만이어야 함 (${bytes} B)`);
ok(bytes < SAVE_LIMIT / 2, `서버 한도 ${SAVE_LIMIT} B 의 절반 미만`);
ok(isValidSave(bigM) && (!serverValid || serverValid(bigM)), '20장 세이브 isValidSave');
ok(isDeepStrictEqual(quiet(() => migrateState(clone(bigM))), bigM), '20장 세이브 멱등');

// ── 6b. 7번째 영웅 이졸데: 14장 아웃트로 합류(isolde_joined)를 14장을 이미 깬 세이브에 소급 (docs/specs/hero7.md) ──
section('hero7 late join (isolde_joined)');
{
  ok(!m1.progress.flags.isolde_joined && !storyJoinedChars(m1).includes('isolde'), '1부 완료(14장 전) 세이브는 이졸데 미합류');
  ok(storyJoinedChars(m1).includes('lia') && storyJoinedChars(m1).includes('azel'), '1부 완료 세이브: 리아·아젤 합류 플래그(boss_b_banshee·boss_b_grimoire) → storyJoinedChars');
  const p = clone(m1); p.progress.cleared.s14 = { rank: 'A', time: 500, score: 1 };
  const pm = migrateState(clone(p));
  ok(pm.progress.flags.isolde_joined === true && storyJoinedChars(pm).includes('isolde'), '14장을 깬 옛 세이브 → isolde_joined 소급, storyJoinedChars 에 isolde');
  ok(isDeepStrictEqual(migrateState(clone(pm)), pm), '소급 후 멱등');
  ok(bigM.progress.flags.isolde_joined === true, '20장 세이브도 isolde_joined');
  const ar = clone(p); ar.arcade = { kind: 'practice' };
  const am = migrateState(ar);
  ok(!am.progress.flags.isolde_joined && storyJoinedChars(am).length === 0, '아케이드 임시 세이브는 소급·합류 목록 없음');
  const iso = newGameState({ slot: 1, difficulty: 'normal', charId: 'isolde' });
  ok(iso.heroes.isolde && iso.charId === 'isolde' && isValidSave(iso) && (!serverValid || serverValid(iso)), '이졸데로 새 게임 → isValidSave (클라이언트·서버)');
}

// ── 7. 내보내기 코드 왕복 ──
section('export/import code round trip');
const rt = clone(m1); rt.progress.shards = ['k_star_2']; rt.progress.hearts = ['k_heart_3']; rt.companions ??= { v: 1, owned: {}, eggs: {}, pending: [], clears: 1, autoSkill: null, slot2Seen: false, last: { mount: null, guards: [null, null] } };
saves.write(3, rt);
const code = saves.exportCode(3);
ok(typeof code === 'string' && saves.importCode(2, code), 'exportCode → importCode 성공');
const back = saves.read(2);
ok(back && isDeepStrictEqual(back.progress.shards, ['k_star_2']) && isDeepStrictEqual(back.progress.hearts, ['k_heart_3']) && isDeepStrictEqual(back.companions, rt.companions), '코드에 shards/hearts/companions 가 실린다');
saves.remove?.(2); saves.remove?.(3);

// ── 8. 디버그 임시 세이브 ──
section('debug boot state (saves.markDebug)');
{
  const real = clone(m1); real.charId = 'sera';
  saves.write(1, real);
  const before = JSON.stringify(saves.read(1));
  const evs = []; const off = saves.onWrite((e) => evs.push(e));
  const dbg = saves.markDebug(newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' }));
  dbg.gold = 4321;
  quiet(() => saves.write(1, dbg));   // (Node 에는 저장소가 없어 메모리 기록 — false)
  off();
  ok(saves.isDebug(dbg) && !saves.isDebug(real) && !saves.isDebug(null), 'isDebug: 표시한 상태만');
  ok(JSON.stringify(saves.read(1)) === before, '디버그 상태의 write(1) → 진짜 슬롯 1 그대로');
  ok(saves.read(DEBUG_SLOT)?.gold === 4321 && saves.read(DEBUG_SLOT)?.charId === 'kael' && dbg.slot === 1, '디버그 칸(saves.read(DEBUG_SLOT))에 기록 · 상태의 slot 은 1 그대로');
  ok(evs.length === 0, `디버그 기록은 onWrite 알림 없음 (클라우드가 올리지 않는다) (${evs.length})`);
  ok(saves.list().every((x) => !x || x.charId !== 'kael' || x.slot !== 1), 'saves.list 의 슬롯 1 은 진짜 기록');
  const copy = migrateState(saves.read(DEBUG_SLOT));
  ok(!saves.isDebug(copy), '디버그 칸에서 읽어 만든 새 상태는 표시 없음 (불러온 세이브처럼 진짜 슬롯에 쓴다)');
  saves.remove?.(1); saves.remove?.(DEBUG_SLOT);
}

console.log(`${fails ? '✗' : '✓'} test_save_v2: ${passes} 통과, ${fails} 실패${cmpStub ? ' (companion_state 는 아직 스텁 — 동료 항목 일부 생략)' : ''}`);
process.exit(fails ? 1 : 0);
