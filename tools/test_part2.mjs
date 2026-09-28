#!/usr/bin/env node
// 2부 「균열의 순례」 인수 테스트 (world2 §17, MASTER_PLAN §5.1) — owner: P2-QA
//
//   node tools/test_part2.mjs --static          §17-2 정적 검사만 (Node, 데이터 모듈 import)
//   node tools/test_part2.mjs                   정적 + 실행 검사 4–12 (+ 성능) 전부
//   node tools/test_part2.mjs --only rooms,bosses   고르기: static rooms gimmicks bosses flow legacy endings items loot mobile perf clears
//   --boss b_nihil[,…]   보스 검사를 일부 보스만    --shots  스크린샷 (/tmp/claude-0/proto/wpj/)    --verbose  통과 항목도 출력
//
// 실행 검사는 헤드리스 Chromium + tools/serve.mjs. 게임 루프를 멈추고(requestAnimationFrame 을 가로챔) game.tick(1/60) 을
// 직접 돌려 진행한다 — 부하가 큰 기계에서도 결과가 같다. 모든 사례는 페이지 오류·콘솔 오류 0 이어야 통과한다
// (tools/integration.mjs 와 같은 거르개). 종료 코드: 실패가 하나라도 있으면 1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf('--' + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const STATIC_ONLY = !!opt('static');
const ONLY = opt('only') ? String(opt('only')).split(',').map((s) => s.trim()).filter(Boolean) : null;
const BOSS_ONLY = opt('boss') ? String(opt('boss')).split(',') : null;
const VERBOSE = !!opt('verbose'), SHOTS = !!opt('shots');
const SHOT_DIR = '/tmp/claude-0/proto/wpj';
const GROUPS = ['static', 'rooms', 'gimmicks', 'bosses', 'flow', 'legacy', 'endings', 'items', 'loot', 'clears', 'mobile', 'perf'];
if (ONLY) { const bad = ONLY.filter((g) => !GROUPS.includes(g)); if (bad.length) { console.error(`알 수 없는 검사 묶음: ${bad.join(', ')} (가능: ${GROUPS.join(' ')})`); process.exit(2); } }
const want = (g) => (STATIC_ONLY ? g === 'static' : !ONLY || ONLY.includes(g));
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];   // {group, name, ok, info}
function check(group, name, ok, info) {
  results.push({ group, name, ok: !!ok, info });
  if (!ok || VERBOSE) console.log(`  ${ok ? '✓' : '✗'} [${group}] ${name}${!ok && info !== undefined ? '  ' + short(info) : ''}`);
}
const short = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 600 ? s.slice(0, 600) + '…' : s; };

const P2 = ['s14', 's15', 's16', 's17', 's18', 's19', 's20'];
const P2_BOSSES = { s14: 'b_narkissa', s15: 'b_moloch', s16: 'b_dagon', s17: 'b_ziz', s18: 'b_mara', s19: 'b_behemoth', s20: 'b_nihil' };
const RECRUITS = { s14: 'gd_mirra', s15: 'mt_ignis', s16: 'gd_lumen', s17: 'mt_gale', s18: 'gd_momo', s19: 'mt_silva' };   // world2 §14 (MASTER_PLAN §1.2)
const P2_SIDE = ['bd_rift', 'bd_mirror', 'bd_deep', 'bd_storm', 'bd_combo200', 'hd_ember', 'hd_plus15', 'rk_stars', 'rk_stars6', 'el_pearl', 'ab_dawnflower', 'mt_feast', 'cm_dreams'];
// world2 §1.4 — 2부 대본 id 전부
const SCRIPT_IDS = `p2_prologue
s14_intro s14_t1 s14_t2 b_narkissa_pre b_narkissa_shatter b_narkissa_post s14_outro
s15_intro s15_t1 s15_t2 b_moloch_pre b_moloch_post s15_outro
s16_intro s16_t1 s16_t2 b_dagon_pre b_dagon_post s16_outro
s17_intro s17_t1 s17_t2 b_ziz_pre b_ziz_post s17_outro npc_rook_s17
s18_intro s18_t1 s18_t2 b_mara_pre b_mara_dream b_mara_post s18_outro npc_carmilla_s18
s19_intro s19_t1 s19_t2 b_behemoth_pre b_behemoth_post s19_outro
s20_intro s20_t1 s20_t2 b_nihil_pre b_nihil_form2 b_nihil_final b_nihil_post s20_outro
ending_p2 ending_p2true
npc_alberto_ch14 npc_alberto_ch16 npc_alberto_ch18 npc_alberto_ch19 npc_alberto_ch20
npc_marta_ch14 npc_marta_ch15 npc_marta_ch17 npc_marta_ch20
npc_rook_ch14 npc_rook_ch16 npc_rook_ch17 npc_rook_ch19 npc_rook_ch20
npc_hadwin_ch15 npc_hadwin_ch17 npc_hadwin_ch20
npc_elise_ch14 npc_elise_ch16 npc_elise_ch19 npc_elise_ch20
npc_carmilla_ch14 npc_carmilla_ch18 npc_carmilla_ch20`.split(/\s+/).filter(Boolean);
// world2 §4.3 — 방마다 켜지는 기믹 (방 설정이 없으면 스테이지 기본값)
const ROOM_GIMMICKS = {
  s14: { r1: ['mirror'], r2: ['mirror'], r3: ['mirror'], r4: ['mirror'], r5: ['mirror'], boss: [] },
  s15: { r1: ['magma'], r2: ['magma'], r3: ['magma'], r4: ['magma'], r5: [], boss: ['magma'] },
  s16: { r1: ['deep'], r2: ['deep'], r3: ['deep'], r4: ['deep'], r5: ['deep'], boss: ['deep'] },
  s17: { r1: ['wind'], r2: ['wind'], r3: ['wind'], r4: ['wind'], r5: ['wind'], boss: ['wind'] },
  s18: { r1: ['heartbeat'], r2: ['heartbeat'], loop: ['heartbeat'], r3: ['heartbeat'], r4: ['heartbeat'], loop2: ['heartbeat'], r5: ['heartbeat'], boss: ['heartbeat'] },
  s19: { r1: ['blight'], r2: ['blight'], r3: ['blight'], r4: ['blight'], r5: ['blight'], boss: ['blight'] },
  s20: { r1: ['voidwall'], r2: ['mirror'], r3: ['magma'], r4: ['deep', 'wind'], r5: ['heartbeat', 'blight'], boss: ['voidwall'] },
};

// ═════════════════════════════ §17-2 정적 검사 ═════════════════════════════
async function staticChecks() {
  const G = 'static';
  const imp = (f) => import(path.join(ROOT, f));
  const [{ STAGES, STAGE_ORDER, STAGE_ORDER_P2, SHARDS, HEARTS }, { ENEMIES }, { BOSSES }, { ITEMS, MYTHIC_WEAPONS_P2 }, { QUESTS }, { LORE, LORE_ORDER, DOCS, DOC_ORDER }, { SCRIPTS }, { TRACKS }, { NPCS }, { SAVE_VERSION }, { ENDINGS }, { BOSS_ORDER }, CMP, { P2_PATTERNS }] = await Promise.all([
    imp('src/data/stages.js'), imp('src/data/enemies.js'), imp('src/data/bosses.js'), imp('src/data/items.js'), imp('src/data/quests.js'), imp('src/data/lore.js'),
    imp('src/data/story.js'), imp('src/data/music.js'), imp('src/data/npcs.js'), imp('src/game/state.js'), imp('src/scenes/front/ending.js'), imp('src/scenes/front/arcade.js'),
    imp('src/data/companions.js'), imp('src/game/bosses/c_common.js'),
  ]);
  const { CREDITS_P2 } = await imp('src/data/story_p2.js');
  const miss = [];   // [where, what]
  const need = (cond, where, what) => { if (!cond) miss.push(`${where}: ${what}`); };
  const itemRef = (id, where) => {
    if (typeof id !== 'string' || !id) { miss.push(`${where}: 빈 아이템 id`); return; }
    if (id.startsWith('lore:')) need(LORE[id.slice(5)], where, `로어 ${id}`);
    else need(ITEMS[id], where, `아이템 ${id}`);
  };
  const CHEST_KW = /^(equip|rare|epic|mythic|gold:\d+)$/;

  // ── 스테이지 · 방 ──
  check(G, 'STAGE_ORDER 에 s14–s20 이 모두 있다 (1부 뒤, 순서대로)', P2.every((s) => STAGE_ORDER.includes(s)) && STAGE_ORDER_P2.join() === P2.join() && STAGE_ORDER.indexOf('s14') === STAGE_ORDER.indexOf('s13') + 1, STAGE_ORDER_P2);
  P2.forEach((sid, i) => {
    const st = STAGES[sid];
    if (!st) { miss.push(`${sid}: 스테이지 없음`); return; }
    need(st.next === (P2[i + 1] ?? null), sid, `next ${st.next} ≠ ${P2[i + 1] ?? null}`);
    need(st.boss === P2_BOSSES[sid] && BOSSES[st.boss], sid, `boss ${st.boss}`);
    for (const e of st.enemies ?? []) need(ENEMIES[e], sid, `enemies[] ${e}`);
    for (const d of st.docs ?? []) need(DOCS[d], sid, `docs ${d}`);
    need(TRACKS[st.music], sid, `music ${st.music} (TRACKS 에 없음)`);
    need(SCRIPTS[st.intro], sid, `intro ${st.intro}`);
    need(SCRIPTS[st.outro], sid, `outro ${st.outro}`);
    if (sid !== 's20') {
      need(st.shard === `k_star_${i + 1}` && ITEMS[st.shard]?.starShard === i + 1, sid, `shard ${st.shard}`);
      need(st.heart === `k_heart_${i + 1}` && ITEMS[st.heart]?.worldHeart === i + 1, sid, `heart ${st.heart}`);
    } else need(!st.shard && !st.heart, sid, 's20 에는 별의 조각·세계의 심장이 없어야 한다');
    need(st.rooms?.boss?.boss, sid, 'boss 방');
    let shardPlaced = false;
    for (const [rid, room] of Object.entries(st.rooms ?? {})) {
      const w = `${sid}/${rid}`;
      for (const t of room.triggers ?? []) need(SCRIPTS[t], w, `trigger ${t}`);
      for (const it of room.items ?? []) { itemRef(it, w); if (it === st.shard) shardPlaced = true; }
      for (const c of [...(room.chests ?? []), ...(room.hiddenChest ? [room.hiddenChest] : [])]) need(CHEST_KW.test(c) || ITEMS[c], w, `상자 ${c}`);
      for (const d of room.docs ?? []) need(DOCS[d], w, `docs ${d}`);
      for (const n of room.npcs ?? []) need(NPCS[n], w, `npc ${n}`);
      for (const [dg, sp] of Object.entries(room.enemies ?? {})) { const id = typeof sp === 'string' ? sp : sp?.id; need(ENEMIES[id], w, `적 ${dg}=${id}`); }
      if (room.exitRight) need(st.rooms[room.exitRight], w, `exitRight ${room.exitRight}`);
      if (room.exitLeft) need(st.rooms[room.exitLeft], w, `exitLeft ${room.exitLeft}`);
      for (const d of room.doors ?? []) need(!d || st.rooms[d], w, `door → ${d}`);
      const doorCount = (room.map ?? []).reduce((a, row) => a + [...row].filter((c) => c === 'D').length, 0);
      if (room.doors) need(doorCount === room.doors.length, w, `문 'D' ${doorCount}개 ≠ doors ${room.doors.length}개`);
      need(ROOM_GIMMICKS[sid]?.[rid], w, '§4.3 기믹 표에 없는 방');
    }
    if (st.shard) need(shardPlaced, sid, `${st.shard} 가 어느 방 items 에도 없음`);
    // 보스 대사 (pre/post + 전환 대사)
    const b = st.boss;
    need(SCRIPTS[`${b}_pre`], sid, `${b}_pre`); need(SCRIPTS[`${b}_post`], sid, `${b}_post`);
    for (const tr of Object.values(P2_PATTERNS[b]?.transitions ?? {})) if (tr.script) need(SCRIPTS[tr.script], sid, `전환 대사 ${tr.script}`);
    need(P2_PATTERNS[b]?.attacks?.length, sid, `P2_PATTERNS.${b}`);
    // 보스 드롭
    for (const d of BOSSES[b]?.drops ?? []) itemRef(d, `${b}.drops`);
  });
  check(G, 's14–s20: 적·보스·비전서·별의 조각·심장·음악·인트로/아웃트로·방 트리거·아이템·상자·문·NPC 가 모두 있다', !miss.length, miss);

  // ── 아이템 참조: 퀘스트 · 보스 드롭 · 대본 give ──
  const m2 = [];
  const needQ = (c, w) => { if (!c) m2.push(w); };
  for (const q of Object.values(QUESTS)) {
    const w = `quest ${q.id}`, g = q.goal ?? {};
    for (const it of q.reward?.items ?? []) needQ(ITEMS[it.id], `${w} reward ${it.id}`);
    for (const e of [].concat(g.enemy ?? [])) needQ(ENEMIES[e], `${w} goal.enemy ${e}`);
    if (g.item) needQ(ITEMS[g.item], `${w} goal.item ${g.item}`);
    if (g.boss) needQ(BOSSES[g.boss], `${w} goal.boss ${g.boss}`);
    if (g.stage) needQ(STAGES[g.stage], `${w} goal.stage ${g.stage}`);
    if (g.npc) needQ(NPCS[g.npc], `${w} goal.npc ${g.npc}`);
    if (q.giver && q.giver !== 'board') needQ(NPCS[q.giver], `${w} giver ${q.giver}`);
    if (q.req?.quest) needQ(QUESTS[q.req.quest], `${w} req.quest ${q.req.quest}`);
  }
  for (const b of Object.values(BOSSES)) for (const d of b.drops ?? []) needQ(ITEMS[d], `boss ${b.id} drop ${d}`);
  const lines = (s) => (Array.isArray(s) ? s : Array.isArray(s?.lines) ? s.lines : []);
  const recruitIds = new Map();
  for (const [sid, s] of Object.entries(SCRIPTS)) {
    for (const l of lines(s)) {
      if (l?.cmd === 'give') needQ(ITEMS[l.item], `script ${sid} give ${l.item}`);
      if (l?.cmd === 'quest') needQ(QUESTS[l.id], `script ${sid} quest ${l.id}`);
      if (l?.cmd === 'recruit') recruitIds.set(l.id, [...(recruitIds.get(l.id) ?? []), sid]);
    }
  }
  check(G, '맵·퀘스트·보스 드롭·대본 give 가 가리키는 아이템/적/NPC 가 모두 있다', !m2.length, m2);
  check(G, 'k_star_1…6 · k_heart_1…6 · k_rift_lantern · k_dawnflower 아이템이 있다', [1, 2, 3, 4, 5, 6].every((n) => ITEMS[`k_star_${n}`] && ITEMS[`k_heart_${n}`]) && ITEMS.k_rift_lantern && ITEMS.k_dawnflower && SHARDS?.length === 6 && HEARTS?.length === 6);
  const myth = Object.values(MYTHIC_WEAPONS_P2 ?? {});
  check(G, 'MYTHIC_WEAPONS_P2 는 무기 종류별 6종 (u_dawn_*)', myth.length === 6 && myth.every((id) => ITEMS[id]?.slot === 'weapon' && /^u_dawn_/.test(id)), MYTHIC_WEAPONS_P2);

  // ── 로어 · 비전서 ──
  const loreIds = Object.keys(LORE);
  check(G, 'LORE_ORDER 가 LORE 의 모든 id 를 한 번씩 담는다', LORE_ORDER.length === loreIds.length && new Set(LORE_ORDER).size === LORE_ORDER.length && loreIds.every((id) => LORE_ORDER.includes(id)), { order: LORE_ORDER.length, lore: loreIds.length, missing: loreIds.filter((id) => !LORE_ORDER.includes(id)) });
  const d27 = Array.from({ length: 27 }, (_, i) => `d${String(i + 1).padStart(2, '0')}`);
  check(G, 'DOC_ORDER = d01…d27', DOC_ORDER.join() === d27.join(), DOC_ORDER);
  check(G, 'd21 비전서 커맨드 = ↓↗+공격 (MASTER_PLAN §1.21)', JSON.stringify(DOCS.d21?.tech?.cmd ?? DOCS.d21?.cmd) === JSON.stringify(['d', 'uf', 'btn:attack']), DOCS.d21);

  // ── 보스 목록 · 대본 · 엔딩 · 저장 ──
  const allBosses = Object.keys(BOSSES);
  check(G, 'BOSS_ORDER(아케이드) 에 보스 20종이 모두 있다', allBosses.length === 20 && allBosses.every((b) => BOSS_ORDER.includes(b)) && BOSS_ORDER.length === 20, { n: allBosses.length, order: BOSS_ORDER });
  const noScript = SCRIPT_IDS.filter((id) => !SCRIPTS[id]);
  const noQ = P2_SIDE.flatMap((q) => [`q_${q}_start`, `q_${q}_done`]).filter((id) => !SCRIPTS[id]);
  check(G, `SCRIPTS 에 world2 §1.4 의 대본 ${SCRIPT_IDS.length}개가 모두 있다`, !noScript.length, noScript);
  check(G, '2부 의뢰 13개의 q_<id>_start / _done 대본', !noQ.length && P2_SIDE.every((q) => QUESTS[q]), { noScript: noQ, noQuest: P2_SIDE.filter((q) => !QUESTS[q]) });
  const six = Object.values(RECRUITS);
  const badRecruit = [...recruitIds.keys()].filter((id) => !six.includes(id));
  check(G, '대본의 recruit id 는 모두 world2 §14 의 여섯 동료', !badRecruit.length && recruitIds.size > 0, { bad: badRecruit, seen: Object.fromEntries(recruitIds) });
  const wrongOutro = Object.entries(RECRUITS).filter(([sid, id]) => !lines(SCRIPTS[`${sid}_outro`]).some((l) => l?.cmd === 'recruit' && l.id === id));
  check(G, '각 동료는 자기 스테이지 아웃트로에서 합류한다 (s14 미라 … s19 실바)', !wrongOutro.length, wrongOutro);
  const cmpBad = six.filter((id) => { const d = CMP.MOUNTS?.[id] ?? CMP.GUARDIANS?.[id]; const o = d?.obtain ?? d?.unlock; return !d || !(o?.type === 'flag' && (o.flag ?? o.id) === `recruit_${id}`); });
  check(G, '여섯 동료의 companions.js 정의 (obtain flag recruit_<id>)', !cmpBad.length, cmpBad.map((id) => [id, CMP.MOUNTS?.[id]?.obtain ?? CMP.GUARDIANS?.[id]?.obtain ?? null]));
  const ek = Object.keys(ENDINGS);
  check(G, 'ENDINGS 5종 (bad normal true p2 p2true)', ek.length === 5 && ['bad', 'normal', 'true', 'p2', 'p2true'].every((k) => ENDINGS[k]), ek);
  check(G, 'CREDITS_P2 가 있고 2부 보스·동료 줄을 담는다', Array.isArray(CREDITS_P2) && CREDITS_P2.some((l) => /니힐/.test(l)) && CREDITS_P2.some((l) => /미라/.test(l)), CREDITS_P2?.length);
  check(G, 'SAVE_VERSION === 2', SAVE_VERSION === 2, SAVE_VERSION);
  check(G, '§4.3 기믹 표가 s14–s20 의 모든 방을 덮는다', P2.every((s) => Object.keys(STAGES[s]?.rooms ?? {}).every((r) => ROOM_GIMMICKS[s]?.[r])), P2.map((s) => [s, Object.keys(STAGES[s]?.rooms ?? {}).filter((r) => !ROOM_GIMMICKS[s]?.[r])]));
}

// ═════════════════════════════ 실행 ═════════════════════════════
const t0 = Date.now();
if (want('static')) { console.log('── 정적 검사 (world2 §17-2)'); try { await staticChecks(); } catch (e) { check('static', '정적 검사 실행', false, e.stack); } }
if (!STATIC_ONLY && GROUPS.slice(1).some(want)) {
  const { runRuntime } = await import('./test_part2_rt.mjs').catch(() => ({ runRuntime: null }));
  if (runRuntime) await runRuntime({ want, check, results, opts: { BOSS_ONLY, SHOTS, SHOT_DIR, VERBOSE }, consts: { P2, P2_BOSSES, RECRUITS, ROOM_GIMMICKS } });
}
const bad = results.filter((r) => !r.ok);
const byGroup = {};
for (const r of results) { const g = (byGroup[r.group] ??= { ok: 0, bad: 0 }); r.ok ? g.ok++ : g.bad++; }
console.log('\n' + Object.entries(byGroup).map(([g, v]) => `${g} ${v.ok}/${v.ok + v.bad}`).join(' · ') + `  (${Math.round((Date.now() - t0) / 1000)}초)`);
console.log(bad.length ? `✗ ${bad.length}개 실패` : `✓ ${results.length}개 모두 통과`);
fs.mkdirSync('/tmp/claude-0/proto/wpj', { recursive: true });
fs.writeFileSync('/tmp/claude-0/proto/wpj/report.json', JSON.stringify(results, null, 1));
if (bad.length) process.exitCode = 1;
