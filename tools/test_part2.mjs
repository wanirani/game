#!/usr/bin/env node
// 2부 「균열의 순례」 인수 테스트 (world2 §17, MASTER_PLAN §5.1) — owner: P2-QA
//
//   node tools/test_part2.mjs --static          §17-2 정적 검사만 (Node, 데이터 모듈 import)
//   node tools/test_part2.mjs                   정적 + 실행 검사 4–12 (+ 성능) 전부
//   node tools/test_part2.mjs --only rooms,bosses   고르기: static rooms gimmicks bosses flow legacy endings items loot mobile perf clears
//   --boss b_nihil[,…]   보스 검사를 일부 보스만    --verbose  통과 항목도 출력
//   스크린샷(방마다 · 보스 페이즈마다 · 기믹 · 휴대폰 · 지도)과 report.json 은 /tmp/claude-0/proto/wpj/ 에 남는다
//
// 실행 검사는 헤드리스 Chromium + tools/serve.mjs. 게임 루프를 멈추고(game._pageHidden) game.tick(1/60) 을
// 직접 돌려 진행한다 — 부하가 큰 기계에서도 결과가 같다. 모든 사례는 페이지 오류·콘솔 오류 0 이어야 통과한다
// (tools/integration.mjs 와 같은 거르개). 종료 코드: 실패가 하나라도 있으면 1, --only/--boss 에 없는 이름이거나
// 고른 묶음이 검사를 하나도 돌리지 않았으면 2 (조용히 통과하지 않게).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf('--' + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const STATIC_ONLY = !!opt('static');
const ONLY = opt('only') ? String(opt('only')).split(',').map((s) => s.trim()).filter(Boolean) : null;
const BOSS_ONLY = opt('boss') ? String(opt('boss')).split(',') : null;
const VERBOSE = !!opt('verbose');
const SHOT_DIR = '/tmp/claude-0/proto/wpj';
const GROUPS = ['static', 'rooms', 'gimmicks', 'bosses', 'flow', 'legacy', 'endings', 'items', 'loot', 'clears', 'mobile', 'perf'];
if (ONLY) { const bad = ONLY.filter((g) => !GROUPS.includes(g)); if (bad.length) { console.error(`알 수 없는 검사 묶음: ${bad.join(', ')} (가능: ${GROUPS.join(' ')})`); process.exit(2); } }
const want = (g) => (STATIC_ONLY ? g === 'static' : !ONLY || ONLY.includes(g));

const P2 = ['s14', 's15', 's16', 's17', 's18', 's19', 's20'];
const P2_BOSSES = { s14: 'b_narkissa', s15: 'b_moloch', s16: 'b_dagon', s17: 'b_ziz', s18: 'b_mara', s19: 'b_behemoth', s20: 'b_nihil' };
// --boss 오타(또는 값 없이 --boss)는 보스 검사를 모두 건너뛴 채 "0개 모두 통과" 로 끝나므로 막는다
if (BOSS_ONLY) { const bad = BOSS_ONLY.filter((b) => !Object.values(P2_BOSSES).includes(b)); if (bad.length) { console.error(`알 수 없는 2부 보스: ${bad.join(', ')} (가능: ${Object.values(P2_BOSSES).join(' ')})`); process.exit(2); } }

const results = [];   // {group, name, ok, info}
function check(group, name, ok, info) {
  results.push({ group, name, ok: !!ok, info });
  if (!ok || VERBOSE) console.log(`  ${ok ? '✓' : '✗'} [${group}] ${name}${!ok && info !== undefined ? '  ' + short(info) : ''}`);
}
const short = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 600 ? s.slice(0, 600) + '…' : s; };

const RECRUITS = { s14: 'gd_mirra', s15: 'mt_ignis', s16: 'gd_lumen', s17: 'mt_gale', s18: 'gd_momo', s19: 'mt_silva' };   // world2 §14 (MASTER_PLAN §1.2)
// 외전 — STAGE_ORDER_P2 끝의 side 스테이지들 (해금은 세계 지도가 p2_done 으로, page = 그 외전이 놓이는 지도)
//   s21 「하늘 정원의 둥지」 (docs/specs/ex_s21.md): 이계 지도, 아웃트로에서 탈것 아르겐 합류
//   s22 「이름 없는 언덕」 (docs/specs/ex_s22.md): 1부 지도(page 0), 아웃트로에서 수호신 무닌 합류
//   s23 「빈칸의 현상금」 (docs/specs/ex_s23.md): 1부 지도(page 0), 동료 대신 아웃트로에서 신화 무기 「사냥꾼의 달」 일곱 자루 (reward: give once·silent = HUNT_SET)
//   s24 「시드는 장미」 (docs/specs/ex_s24.md): 1부 지도(page 0), 아웃트로에서 수호신 베스퍼 합류
//   s25 「불탄 목장의 밤」 (docs/specs/ex_s25.md): 1부 지도(page 0), 아웃트로에서 탈것 모르겐 합류
const EX_LIST = [
  { sid: 's21', chapter: 21, page: 1, boss: 'b_argen', recruit: 'mt_argen', rig: 'wyvern', done: 'ex_s21_done', scripts: ['s21_intro', 's21_t1', 's21_t2', 'b_argen_pre', 'b_argen_corrupt', 'b_argen_awaken', 'b_argen_post', 's21_outro'] },
  { sid: 's22', chapter: 22, page: 0, boss: 'b_nemain', recruit: 'gd_munin', done: 'ex_s22_done', scripts: ['s22_intro', 's22_t1', 's22_t2', 'b_nemain_pre', 'b_nemain_unmask', 'b_nemain_last', 'b_nemain_post', 's22_outro'] },
  { sid: 's23', chapter: 23, page: 0, boss: 'b_hagen', reward: 'hunt', done: 'ex_s23_done', scripts: ['s23_intro', 's23_t1', 's23_t2', 'b_hagen_pre', 'b_hagen_moon', 'b_hagen_last', 'b_hagen_post', 's23_outro'] },
  { sid: 's24', chapter: 24, page: 0, boss: 'b_bride', recruit: 'gd_vesper', done: 'ex_s24_done', scripts: ['s24_intro', 's24_t1', 's24_t2', 'b_bride_pre', 'b_bride_wither', 'b_bride_last', 'b_bride_post', 's24_outro'] },
  { sid: 's25', chapter: 25, page: 0, boss: 'b_charon', recruit: 'mt_morgen', rig: 'horse', done: 'ex_s25_done', scripts: ['s25_intro', 's25_t1', 's25_t2', 'b_charon_pre', 'b_charon_unbridle', 'b_charon_last', 'b_charon_post', 's25_outro'] },
];
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
  const [{ STAGES, STAGE_ORDER, STAGE_ORDER_P2, SHARDS, HEARTS }, { ENEMIES }, { BOSSES }, { ITEMS, MYTHIC_WEAPONS_P2, WTYPES, HUNT_SET }, { QUESTS }, { LORE, LORE_ORDER, DOCS, DOC_ORDER }, { SCRIPTS }, { TRACKS }, { NPCS }, { SAVE_VERSION }, { ENDINGS }, { BOSS_ORDER }, CMP, { P2_PATTERNS }] = await Promise.all([
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
  check(G, 'STAGE_ORDER 에 s14–s20 이 모두 있다 (1부 뒤, 순서대로 · 외전은 그 뒤)', P2.every((s) => STAGE_ORDER.includes(s)) && STAGE_ORDER_P2.filter((s) => !STAGES[s]?.side).join() === P2.join() && STAGE_ORDER.indexOf('s14') === STAGE_ORDER.indexOf('s13') + 1
    && STAGE_ORDER_P2.slice(P2.length).every((s) => STAGES[s]?.side), STAGE_ORDER_P2);
  check(G, '외전 = STAGE_ORDER_P2 의 side 스테이지 (s21 · s22 · s23 · s24 · s25 차례로)', STAGE_ORDER_P2.filter((s) => STAGES[s]?.side).join() === EX_LIST.map((e) => e.sid).join(), STAGE_ORDER_P2);
  for (const EX of EX_LIST) {
    // 외전: 이야기 사슬(next) 밖 · 2부 · 보스·대본·전환 대사·트리거·합류 (해금은 세계 지도가 p2_done 으로 — town/worldmap.js)
    const st = STAGES[EX.sid], miss = [];
    if (!st?.side || st.part !== 2 || st.chapter !== EX.chapter || (st.page ?? 1) !== EX.page) miss.push('side/part/chapter/page');
    if (st?.next != null || Object.values(STAGES).some((o) => o.next === EX.sid || (o.unlocks ?? []).includes(EX.sid))) miss.push('next 사슬에 들어 있음');
    if (st?.boss !== EX.boss || !BOSSES[EX.boss] || BOSSES[EX.boss].stageId !== EX.sid) miss.push('boss');
    if (st?.intro !== `${EX.sid}_intro` || st?.outro !== `${EX.sid}_outro`) miss.push(`intro/outro ${st?.intro}/${st?.outro}`);
    for (const id of EX.scripts) if (!SCRIPTS[id]) miss.push(`대본 ${id}`);
    for (const [rid, room] of Object.entries(st?.rooms ?? {})) for (const t of room.triggers ?? []) if (!SCRIPTS[t]) miss.push(`${rid} trigger ${t}`);
    if (!st?.rooms?.r3?.triggers?.includes(`${EX.sid}_t1`) || !st?.rooms?.r5?.triggers?.includes(`${EX.sid}_t2`)) miss.push(`트리거 r3 ${EX.sid}_t1 · r5 ${EX.sid}_t2`);
    const ln = (x) => (Array.isArray(x) ? x : Array.isArray(x?.lines) ? x.lines : []);
    const out = ln(SCRIPTS[`${EX.sid}_outro`]), fi = out.findIndex((l) => l?.if);
    if (EX.recruit) {
      const ri = out.findIndex((l) => l?.cmd === 'recruit' && l.id === EX.recruit);
      if (ri < 0 || out[ri + 1]?.key !== 'recruit_' + EX.recruit || !(fi < 0 || ri < fi)) miss.push(`${EX.sid}_outro recruit (조건 줄보다 앞)`);
      const m = CMP.MOUNTS?.[EX.recruit] ?? CMP.GUARDIANS?.[EX.recruit];
      if (!(m?.obtain?.type === 'flag' && m.obtain.flag === 'recruit_' + EX.recruit && (!EX.rig || m.rig === EX.rig))) miss.push(`${EX.recruit} 정의`);
    }
    if (EX.reward) {
      // 보상 = 아웃트로의 give 줄들 (once · silent, 조건 줄보다 앞 — 결과 화면이 아웃트로를 다시 틀어도 겹치지 않는다) = 그 한 벌 (ex_s23.md §3)
      const set = EX.reward === 'hunt' ? HUNT_SET ?? [] : [];
      const gv = out.map((l, i) => [l, i]).filter(([l]) => l?.cmd === 'give');
      if (!set.length || gv.map(([l]) => l.item).sort().join() !== [...set].sort().join()) miss.push(`${EX.sid}_outro give ${gv.map(([l]) => l.item)} ≠ ${EX.reward} ${set}`);
      for (const [l, i] of gv) if (!l.once || !l.silent || (l.qty ?? 1) !== 1 || !(fi < 0 || i < fi) || !ITEMS[l.item]) miss.push(`${EX.sid}_outro give ${l.item} (once · silent · 1개 · 조건 줄보다 앞 · ITEMS)`);
    }
    if (!out.some((l, i) => l?.cmd === 'flag' && l.key === EX.done && (fi < 0 || i < fi))) miss.push(`${EX.sid}_outro ${EX.done} (조건 줄보다 앞)`);
    check(G, `외전 ${EX.sid}: side · page ${EX.page} · next 사슬 밖 · 보스 ${EX.boss} · 대본 ${EX.scripts.length}개 · 트리거 r3·r5 · 아웃트로 ${EX.recruit ? `합류(${EX.recruit})` : `보상(${EX.reward})`}·${EX.done}`, !miss.length, miss);
  }
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
  // 모으기(collect) 의뢰의 아이템은 수락 가능해질 때(req.chapter = 마지막으로 깬 장) 이미 열린 스테이지(장 ≤ req+1)의 적·보스 드롭·배치,
  // 또는 그 장의 로크 잡화점에서 나와야 한다 (감사 EC-02: 마르타 「약초 수프」의 월하초는 출처가 없었다)
  {
    const { shopStock } = await imp('src/data/shop.js');
    const first = {};
    const note = (id, ch, why) => { if (typeof id === 'string' && (!first[id] || ch < first[id][0])) first[id] = [ch, why]; };
    for (const [sid, st] of Object.entries(STAGES)) {
      const ch = st.chapter ?? 99;
      for (const [rid, room] of Object.entries(st.rooms ?? {})) {
        for (const sp of Object.values(room.enemies ?? {})) { const id = typeof sp === 'string' ? sp : sp?.id; for (const d of ENEMIES[id]?.drops ?? []) note(d.id, ch, `${sid} ${id}`); }
        for (const it of [...(room.items ?? []), ...(room.chests ?? [])]) note(it, ch, `${sid}/${rid}`);
      }
      for (const d of BOSSES[st.boss]?.drops ?? []) note(typeof d === 'string' ? d : d?.id, ch, `${sid} ${st.boss}`);
    }
    for (let c = 0; c <= 20; c++) for (const g of shopStock(c)) note(g.baseId, c, `로크 잡화점 ${c}장`);
    const late = Object.values(QUESTS).filter((q) => q.goal?.type === 'collect').map((q) => [q.id, q.goal.item, q.req?.chapter ?? 0, first[q.goal.item] ?? null])
      .filter(([, , req, f]) => !f || f[0] > req + 1);
    check(G, '모으기 의뢰의 아이템은 수락 시점까지 열린 스테이지·상점에서 얻을 수 있다 (m_herb 포함)', !late.length && !!first.m_herb, late.length ? late : first.m_herb);
  }
  check(G, 'k_star_1…6 · k_heart_1…6 · k_rift_lantern · k_dawnflower 아이템이 있다', [1, 2, 3, 4, 5, 6].every((n) => ITEMS[`k_star_${n}`] && ITEMS[`k_heart_${n}`]) && ITEMS.k_rift_lantern && ITEMS.k_dawnflower && SHARDS?.length === 6 && HEARTS?.length === 6);
  // 가방이 가득 차도 새벽꽃(유일한 출처 s19 r4)·중요 물품은 반드시 들어가고, 못 받은 보상은 보관함으로 갔다가 자리가 나면 들어온다 (감사 EC-01)
  {
    const INV = await imp('src/game/inventory.js');
    const [{ newGameState }, { makeItem }] = await Promise.all([imp('src/game/state.js'), imp('src/data/items.js')]);
    const st = newGameState({ slot: 1 });
    const wid = Object.keys(ITEMS).find((k) => ITEMS[k].slot === 'weapon' && !ITEMS[k].unique);
    for (let i = 0; INV.freeSlots(st) > 0 && i < 400; i++) INV.addItem(st, makeItem(wid), { silent: true });
    const full = INV.freeSlots(st) === 0;
    const normal = makeItem(wid);
    const r = { full, normalRefused: !INV.canAdd(st, normal) && !INV.addItem(st, normal, { silent: true }) };
    const flower = makeItem('k_dawnflower');
    r.flowerCanAdd = INV.canAdd(st, flower);
    r.flowerAdded = !!INV.addItem(st, flower, { silent: true }) && INV.countItem(st, 'k_dawnflower') === 1;
    r.stillFull = INV.freeSlots(st) === 0;   // 중요 물품은 한도에 들지 않는다
    r.reward = INV.grantItem(st, 'u_alberto', 1);
    INV.removeItem(st, st.inventory.find((i) => i.baseId === wid).uid);
    r.delivered = INV.deliverLoot(st);
    r.alberto = INV.countItem(st, 'u_alberto') === 1 && !st.progress.lootQueue.length;
    check(G, '가방 300/300: 새벽꽃(중요 물품)은 들어가고 일반 아이템은 거절, 못 받은 보상은 보관함 → 자리가 나면 지급', r.full && r.normalRefused && r.flowerCanAdd && r.flowerAdded && r.stillFull && r.reward.queued === 1 && r.delivered === 1 && r.alberto, r);
  }
  const myth = Object.values(MYTHIC_WEAPONS_P2 ?? {});
  check(G, `MYTHIC_WEAPONS_P2 는 무기 종류별 ${WTYPES.length}종 (u_dawn_*)`, myth.length === WTYPES.length && WTYPES.every((wt) => MYTHIC_WEAPONS_P2[wt]) && myth.every((id) => ITEMS[id]?.slot === 'weapon' && /^u_dawn_/.test(id)), MYTHIC_WEAPONS_P2);
  // 외전 s23 「사냥꾼의 달」 (ex_s23.md §3): 무기 종류마다 한 자루 · 7단계 신화 · 희귀도 5 · lvReq 72 · 냉기 · 드롭 표(MYTHIC_WEAPONS_P2 · 보스 고유) 밖
  const hunt = (HUNT_SET ?? []).map((id) => ITEMS[id]);
  check(G, `HUNT_SET 은 무기 종류별 ${WTYPES.length}종 (u_hunt_*, 7단계 신화 · 드롭 표 밖)`, hunt.length === WTYPES.length && WTYPES.every((wt) => hunt.filter((b) => b?.wtype === wt).length === 1)
    && hunt.every((b) => b?.slot === 'weapon' && /^u_hunt_/.test(b.id) && b.tier === 7 && b.mythic && b.rarity === 5 && b.lvReq === 72 && b.element === 'ice' && b.set === 'hunt' && b.unique && !b.boss && !myth.includes(b.id)), HUNT_SET);
  // 대사 give 의 once · silent (ex_s23.md §3 · §8): 두 번 틀어도 한 자루 · 가방이 꽉 차면 보관함 · 보관함에 있어도 once · 팔면 다시 받는다
  {
    const INV = await imp('src/game/inventory.js');
    const [{ newGameState }, { makeItem }] = await Promise.all([imp('src/game/state.js'), imp('src/data/items.js')]);
    const giveOnce = (st, id) => { if (!INV.ownsItem(st, id)) INV.grantItem(st, id, 1); };   // scenes/dialogue.js · front/story.js 의 case 'give' 와 같은 규칙
    const own = (st, id) => INV.countItem(st, id) + (st.progress.lootQueue ?? []).filter((i) => i.baseId === id).length;
    const st = newGameState({ slot: 1 });
    for (let k = 0; k < 2; k++) for (const id of HUNT_SET ?? []) giveOnce(st, id);
    const r = { twice: (HUNT_SET ?? []).every((id) => own(st, id) === 1) };
    const gun = st.inventory.find((i) => i.baseId === 'u_hunt_gun');
    INV.sellItem(st, gun.uid);
    r.sold = !INV.ownsItem(st, 'u_hunt_gun');
    giveOnce(st, 'u_hunt_gun');
    r.again = own(st, 'u_hunt_gun') === 1;
    // 가방이 꽉 찬 세이브: 한 벌이 보관함으로 가고, 보관함에 있는 동안 다시 틀어도 겹치지 않는다
    const full = newGameState({ slot: 2 });
    const wid = Object.keys(ITEMS).find((k) => ITEMS[k].slot === 'weapon' && !ITEMS[k].unique);
    for (let i = 0; INV.freeSlots(full) > 0 && i < 400; i++) INV.addItem(full, makeItem(wid), { silent: true });
    for (let k = 0; k < 2; k++) for (const id of HUNT_SET ?? []) giveOnce(full, id);
    r.queued = (full.progress.lootQueue ?? []).filter((i) => (HUNT_SET ?? []).includes(i.baseId)).length;
    r.fullOnce = (HUNT_SET ?? []).every((id) => own(full, id) === 1 && INV.ownsItem(full, id));
    check(G, 'give once: 두 번 틀어도 무기마다 한 자루 · 팔면 다시 받음 · 가방이 꽉 차면 보관함(그동안에도 once)', r.twice && r.sold && r.again && r.queued === 7 && r.fullOnce, r);
  }

  // ── 로어 · 비전서 ──
  const loreIds = Object.keys(LORE);
  check(G, 'LORE_ORDER 가 LORE 의 모든 id 를 한 번씩 담는다', LORE_ORDER.length === loreIds.length && new Set(LORE_ORDER).size === LORE_ORDER.length && loreIds.every((id) => LORE_ORDER.includes(id)), { order: LORE_ORDER.length, lore: loreIds.length, missing: loreIds.filter((id) => !LORE_ORDER.includes(id)) });
  const d27 = Array.from({ length: 27 }, (_, i) => `d${String(i + 1).padStart(2, '0')}`);
  check(G, 'DOC_ORDER = d01…d27', DOC_ORDER.join() === d27.join(), DOC_ORDER);
  check(G, 'd21 비전서 커맨드 = ↓↗+공격 (MASTER_PLAN §1.21)', JSON.stringify(DOCS.d21?.tech?.cmd ?? DOCS.d21?.cmd) === JSON.stringify(['d', 'uf', 'btn:attack']), DOCS.d21);

  // ── 보스 목록 · 대본 · 엔딩 · 저장 ──
  // 이야기 순서(STAGE_ORDER)에 든 스테이지의 보스 = 아케이드 보스 러시 목록 (외전 보스 아르겐·네메인은 통합 담당이 외전을 STAGE_ORDER_P2 와
  // BOSS_ORDER 에 함께 넣을 때 여기 들어온다 — docs/specs/ex_s21.md §6 · ex_s22.md §7. 그 전에는 BOSSES 에만 있다)
  const allBosses = Object.keys(BOSSES).filter((b) => STAGE_ORDER.includes(BOSSES[b].stageId));
  check(G, `BOSS_ORDER(아케이드) 에 이야기 보스 ${allBosses.length}종이 모두 있다 (20 + 이야기에 든 외전)`, allBosses.length >= 20 && allBosses.every((b) => BOSS_ORDER.includes(b)) && BOSS_ORDER.length === allBosses.length && BOSS_ORDER.every((b) => BOSSES[b]), { n: allBosses.length, order: BOSS_ORDER, notInStory: Object.keys(BOSSES).filter((b) => !allBosses.includes(b)) });
  const noScript = SCRIPT_IDS.filter((id) => !SCRIPTS[id]);
  const noQ = P2_SIDE.flatMap((q) => [`q_${q}_start`, `q_${q}_done`]).filter((id) => !SCRIPTS[id]);
  check(G, `SCRIPTS 에 world2 §1.4 의 대본 ${SCRIPT_IDS.length}개가 모두 있다`, !noScript.length, noScript);
  check(G, '2부 의뢰 13개의 q_<id>_start / _done 대본', !noQ.length && P2_SIDE.every((q) => QUESTS[q]), { noScript: noQ, noQuest: P2_SIDE.filter((q) => !QUESTS[q]) });
  const six = Object.values(RECRUITS);
  const badRecruit = [...recruitIds.keys()].filter((id) => !six.includes(id) && !EX_LIST.some((EX) => id === EX.recruit && (recruitIds.get(id) ?? []).every((sid) => sid === `${EX.sid}_outro`)));
  check(G, '대본의 recruit id 는 모두 world2 §14 의 여섯 동료 (+ 외전 s21_outro 의 mt_argen · s22_outro 의 gd_munin · s24_outro 의 gd_vesper · s25_outro 의 mt_morgen)', !badRecruit.length && recruitIds.size > 0, { bad: badRecruit, seen: Object.fromEntries(recruitIds) });
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

// ═════════════════════════════ 실행 검사 (world2 §17 4–12 + 성능) ═════════════════════════════
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const IGNORE_CONSOLE = /Failed to load resource|ERR_CERT|fonts\.g/;   // tools/integration.mjs 와 같은 거르개
let RT = null;   // { browser, srv, base }

async function rtStart() {
  const { chromium } = await import('playwright-core');
  const { start } = await import('./serve.mjs');
  const port = 8000 + Math.floor(Math.random() * 900);
  const srv = await start(port);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  RT = { browser, srv, base: `http://localhost:${port}/` };
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}
async function rtStop() {
  try { await RT?.browser?.close(); } catch { /* 무시 */ }
  try { RT?.srv?.close(); } catch { /* 무시 */ }
}

/**
 * 페이지 안 도우미 window.__T (page.evaluate 로 설치). 게임 루프는 멈추고(game._pageHidden) 스텝을 직접 돌린다.
 *   tick(n)  한 스텝 = game.tick(1/60) · 무적(god) · 누른 키 떼기 · 자동 진행(대사·보스 소개·합류 연출 넘기기) · drawEvery 마다 그리기
 *   key(code, down) / tap(code) / hold(code, sec)   window 에 KeyboardEvent (input.js 가 e.code 로 읽는다)
 *   god: 'full' (무적 + 체력·MP 가득) | 'iframes' (무적만) | false
 */
async function installT({ god }) {
  const g = window.__game;
  const { input } = await import('/src/core/input.js');
  g._pageHidden = true;   // rAF 루프는 돌지만 아무것도 하지 않는다 → 결과가 기계 부하와 무관
  const T = window.__T = { g, input, god, auto: true, autoEnding: false, frames: 0, drawEvery: 4, holds: new Map(), rels: [], kcd: 0, pin: null, after: null,
    cap: { scenes: [], stories: [], endings: [], credits: [] }, _sc: null };
  T.top = () => g.scenes[g.scenes.length - 1];
  T.w = () => g.world;
  T.p = () => g.world?.player;
  T.key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }));
  T.tap = (code, n = 2) => { T.key(code, true); T.rels.push({ code, n }); };
  T.hold = (code, sec) => { T.key(code, true); T.holds.set(code, Math.max(1, Math.round(sec * 60))); };
  T.release = (code) => { T.holds.delete(code); T.key(code, false); };
  T.releaseAll = () => { for (const c of [...T.holds.keys()]) T.release(c); for (const r of T.rels) T.key(r.code, false); T.rels.length = 0; };
  T.draw = () => { try { g.syncPointer?.(); input.beginRender(); g.render(); input.endRender(); g.syncPad(); } catch (e) { console.error(e); } };
  // 탭 영역은 그린 뒤 마이크로태스크에서 봉인되고(ui.js tapSeal), 봉인한 지 1초(taps.maxAge, 실제 시간)가 지나면 판정하지 않는다.
  // 게임 루프는 매 rAF 마다 다시 봉인하지만 멈춘 루프에서는 그렇지 않으므로, 탭을 판정할 스텝 직전에 그리고 봉인까지 기다린다
  T.drawSealed = async () => { T.draw(); await null; };
  T.full = () => { const p = T.p(); if (p?.stats && !p.dead) { p.hp = p.stats.hp; p.mp = p.stats.mp; } };
  T.hero60 = (lv = 60) => { const st = g.state, h = st?.heroes?.[st.charId]; if (h) h.level = lv; const p = T.p(); if (p) { p.refreshStats?.(); T.full(); } };
  T.menuKey = () => { if (T.kcd <= 0) { T.tap('Enter'); T.kcd = 6; } };
  T.flat = (blocks) => (blocks || []).map((b) => [b.h ?? '', b.sub ?? '', ...(b.rows || []).flat()].join('\n')).join('\n');
  T.autoTick = () => {
    const sc = T.top();
    if (!sc) return;
    const n = sc.name;
    if (sc !== T._sc) {
      T._sc = sc;
      T.cap.scenes.push(n + (sc.script ? ':' + sc.script : sc.kind ? ':' + sc.kind : ''));
      if (n === 'story') T.cap.stories.push(sc.script);
      if (n === 'ending' && !sc.skip) T.cap.endings.push(sc.kind);
      if (n === 'credits') T.cap.credits.push({ kind: sc.kind, text: T.flat(sc.blocks) });
    }
    if (!T.auto) return;
    try {
      if (n === 'dialogue') { if (sc.menu) { if (sc.full) sc.shown = sc.full.length; T.menuKey(); } else if (sc.cur) sc.skipAll(); }
      else if (n === 'story') { if (!sc.ending && !sc.empty && !sc.asking && sc.t > 0.05) { if (sc.menu) { sc.shown = sc.full.length; T.menuKey(); } else sc.skip(); } }
      else if (n === 'document') { if (sc.t > 0.1) g.pop(); }
      else if (n === 'bossIntro' || n === 'companionJoin' || n === 'initials') { if (sc.t > 0.3) sc.finish(); }
      else if (n === 'pause') g.pop();
      else if (n === 'ending' && T.autoEnding) { if (sc.t > 1.7) T.menuKey(); }
      else if (n === 'credits' && T.autoEnding) { if (sc.phase === 'roll') { if (sc.t > 0.5) sc.endRoll(); } else if (sc.phaseT > 0.9) T.menuKey(); }
    } catch (e) { console.error('[test_part2] 자동 진행', n, e); }
  };
  T.tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const p = T.p();
      if (T.god && p && !p.dead) { p.iframes = Math.max(p.iframes ?? 0, 99); if (T.god === 'full') T.full(); }
      if (T.pin) T.pin();
      g.syncPointer?.();
      g.tick(1 / 60);
      T.frames++;
      if (T.kcd > 0) T.kcd--;
      for (const [c, k] of [...T.holds]) { if (k <= 1) { T.holds.delete(c); T.key(c, false); } else T.holds.set(c, k - 1); }
      for (let j = T.rels.length - 1; j >= 0; j--) { const r = T.rels[j]; if (--r.n <= 0) { T.key(r.code, false); T.rels.splice(j, 1); } }
      T.autoTick();
      if (T.after) T.after();
      if (T.drawEvery && T.frames % T.drawEvery === 0) T.draw();
    }
  };
  T.until = (pred, sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (pred()) return true; T.tick(1); } return !!pred(); };
  T.settle = (sec = 3) => T.until(() => { const w = T.w(); return g.fade.dir === 0 && (!w || !w.transitioning); }, sec);
  return true;
}

async function openPage(url, { mobile = false, ready = null, god = 'full', timeout = 120000 } = {}) {
  const ctx = await RT.browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!IGNORE_CONSOLE.test(t)) errs.push('CONSOLE ' + t.slice(0, 300)); } });
  const P = { ctx, page, errs, mobile, close: () => ctx.close().catch(() => {}) };
  try {
    await page.goto(RT.base + url + (url.includes('?') ? '&' : '?') + 'nosw', { timeout });
    await page.waitForFunction((r) => {
      const g = window.__game, top = g?.scenes?.[g.scenes.length - 1];
      // scenesReady: 두 단계 부팅 (R1-REQ-229, 요청 #426) — 타이틀로 열면 나머지 장면이 뒤에 등록된다
      return !!(g && top && (!r || top.name === r) && (r !== 'stage' || g.world?.player) && g.scenesReady !== false);
    }, ready, { timeout, polling: 100 });
    await page.evaluate(installT, { god });
  } catch (e) { await P.close(); throw e; }
  return P;
}
const errsSince = (P, n) => [...new Set(P.errs.slice(n))];
/**
 * 진짜 보스 기다리기 (R1-REQ-229 · 451): world.js 는 bosses/lazy.js createBoss 로 보스를 만든다 — 클래스가 아직 없으면
 * PendingBoss(대역, pendingBoss = true, debugAct 없음)가 서 있다가 모듈이 오면 update 에서 스스로 진짜 보스로 바뀐다.
 * 모듈 도착은 비동기라 실제 시간이 필요하다. world.bossReady() → Promise<Boss|null> (FIX-ENGINE) 이 있으면 먼저 그것을 기다린다
 * (게임 루프가 멈춰 있어도 모듈이 오는 즉시 바꿔 넣는다). 그 뒤(또는 없으면) 한 번에 한 프레임씩 진행하며 최대 maxMs 기다린다.
 * 반환 { done, id, pending, cls, viaReady }
 */
async function waitRealBoss(P, maxMs = 20000) {
  const viaReady = await P.page.evaluate(async (ms) => {
    const w = window.__T.w();
    if (typeof w?.bossReady !== 'function' || !w.boss?.pendingBoss) return null;
    const b = await Promise.race([w.bossReady(), new Promise((r) => setTimeout(() => r(undefined), ms))]);
    return b === undefined ? 'timeout' : (b?.constructor?.name ?? null);
  }, maxMs).catch((e) => 'error: ' + e.message);
  const r = await stepUntil(P, () => {
    const T = window.__T, w = T.w(), b = w?.boss;
    const done = !!b && !b.pendingBoss && typeof b.debugAct === 'function';
    if (!done) T.tick(1);
    return { done, id: b?.def?.id ?? b?.id ?? null, pending: !!b?.pendingBoss, cls: b?.constructor?.name ?? null };
  }, null, maxMs);
  return { ...r, viaReady };
}
async function shot(P, name) {
  try {
    await P.page.evaluate(() => window.__T.draw());
    await P.page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
  } catch (e) { console.log(`  (스크린샷 실패 ${name}: ${e.message})`); }
}
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
/**
 * CDP 로 보낸 탭·클릭·터치는 CDP 응답이 온 뒤에야 페이지 주 스레드에서 처리될 수 있다 (passive 리스너 → 비차단 입력).
 * 부하가 크면 바로 이어지는 page.evaluate 가 먼저 돌아 입력을 놓치므로, fn 이 {done:true} 를 돌려줄 때까지
 * 한 번씩 다시 부르며(fn 안에서 한 스텝씩 진행) 최대 maxMs 기다린다. 판정 자체는 그대로 — 입력이 도착할 시간만 준다.
 */
async function stepUntil(P, fn, arg, maxMs = 3000) {
  const t0 = Date.now();
  let r = null;
  for (;;) {
    r = await P.page.evaluate(fn, arg);
    if (r?.done || Date.now() - t0 > maxMs) return r;
    await P.page.waitForTimeout(25);
  }
}
/** 캔버스 논리 좌표의 탭 영역(ui.taps, uiScale 장면은 k 배) → 페이지 CSS 좌표 */
async function tapPoint(P, id) {
  return P.page.evaluate(async (id) => {
    const { taps } = await import('/src/core/ui.js');
    const T = window.__T, g = T.g;
    T.draw();
    const z = taps.zones().find((q) => q.id === id);
    const cv = document.getElementById('screen')?.getBoundingClientRect() ?? g.canvas.getBoundingClientRect();
    if (!z) return null;
    const k = z.k || 1;
    return { x: cv.x + (((z.x + z.w / 2) * k) / g.viewW) * cv.width, y: cv.y + (((z.y + z.h / 2) * k) / g.viewH) * cv.height, z };
  }, id);
}

// ── 4. 모든 방: 8초 입력 · 오류 0 · 기믹 종류 = §4.3 ──
async function roomsGroup(STAGES) {
  const G = 'rooms';
  for (const sid of P2) {
    const rooms = Object.keys(STAGES[sid].rooms);
    let P = null;
    try {
      P = await openPage(`index.html?scene=stage&stage=${sid}&room=${rooms[0]}`, { ready: 'stage' });
      for (const rid of rooms) {
        const e0 = P.errs.length;
        const r = await P.page.evaluate((rid) => {
          const T = window.__T, w = T.w();
          T.settle(3);
          T.releaseAll();
          if (w.roomId !== rid) w.loadRoom(rid);
          T.hero60();
          const kinds = w.gimmick?.kinds ?? [];
          T.tick(10);
          T.hold('ArrowRight', 2); T.tick(120);                    // 오른쪽 2초
          T.hold('KeyZ', 0.25); T.tick(20);                         // 점프
          for (let i = 0; i < 3; i++) { T.tap('KeyX'); T.tick(12); } // 공격 ×3
          T.tap('KeyC'); T.tick(20);                                // 대시
          T.hold('ArrowLeft', 1); T.tick(60);                       // 왼쪽 1초
          T.key('ArrowDown', true); T.tap('KeyZ'); T.tick(20); T.key('ArrowDown', false);   // ↓+점프
          T.tap('KeyA'); T.tick(20);                                // 보조무기
          T.tap('KeyS'); T.tick(30);                                // 스킬1
          T.tick(144);                                              // 모두 8초
          T.releaseAll();
          return { kinds, room: w.roomId, top: T.top()?.name, hp: Math.round(T.p()?.hp ?? -1) };
        }, rid);
        await shot(P, `room_${sid}_${rid}`);
        const want = ROOM_GIMMICKS[sid]?.[rid] ?? [];
        const errs = errsSince(P, e0);
        check(G, `${sid}/${rid}: 8초 입력 뒤 오류 0 · 기믹 ${want.join('+') || '없음'}`, !errs.length && sameSet(r.kinds, want), { ...r, want, errs });
      }
    } catch (e) { check(G, `${sid} 방 순회 실행`, false, e.stack); }
    await P?.close();
  }
}

// ── 5. 기믹 ──
async function gimmicksGroup() {
  const G = 'gimmicks';
  const run = async (name, url, fn, arg, judge, { god = 'iframes' } = {}) => {
    let P = null;
    try {
      P = await openPage(url, { ready: 'stage', god });
      const e0 = P.errs.length;
      const r = await P.page.evaluate(fn, arg);
      await shot(P, 'gimmick_' + name.split(' ')[0]);
      const errs = errsSince(P, e0);
      const [ok, label] = judge(r);
      check(G, label, ok && !errs.length, { ...r, errs });
    } catch (e) { check(G, name + ' 실행', false, e.stack); }
    await P?.close();
  };
  // s14 r1 거울
  await run('s14r1 mirror', 'index.html?scene=stage&stage=s14&room=r1', async () => {
    const T = window.__T, w = T.w();
    const { T: TT } = await import('/src/core/physics.js');
    T.tick(5);
    const m = w.gimmickOf('mirror');
    const a0 = m?.phase, flipped = m?.flip(true);
    const r = { a0, flipped, phase: m?.phase, t22: w.map.typeAt(22, 10), t30: w.map.typeAt(30, 12), EMPTY: TT.EMPTY, SOLID: TT.SOLID, bgFlip: w.gimmick?.bgFlip };
    T.tick(20);
    return r;
  }, null, (r) => [r.a0 === 'A' && r.phase === 'B' && r.t22 === r.EMPTY && r.t30 === r.SOLID && r.bgFlip === true,
    's14 r1 거울: phase A → flip(true) → B, (22,10) a 칸 EMPTY · (30,12) b 칸 SOLID · bgFlip']);
  // s15 r2 용암 상승
  await run('s15r2 magma', 'index.html?scene=stage&stage=s15&room=r2', () => {
    const T = window.__T, w = T.w(), p = T.p();
    T.hero60(); T.tick(5);
    const m = w.gimmickOf('magma');
    const lv0 = m.level, trig = m.params.trigger;
    p.y = (trig - 8 + 1) * 48 - p.h; p.vy = 0;           // 발끝 줄 = trigger − 8
    T.tick(180);
    const lv1 = m.level;
    const max = p.stats.hp; T.full();
    const hp0 = p.hp, lvA = m.level;
    p.safeSpot = null;                                  // 낙사 복귀는 체크포인트(방 입구, 용암 아래쪽)로
    p.y = m.level + 30; p.vy = 0;
    let fellAt = -1;
    for (let i = 0; i < 40 && fellAt < 0; i++) { T.tick(1); if (p.hp < hp0) fellAt = i + 1; }
    T.tick(2);
    return { lv0, lv1, rose: lv0 - lv1, rising: m.rising, hp0, hp1: p.hp, dmg: hp0 - p.hp, need: Math.ceil(max * 0.25), fellAt, lvA, lvB: m.level };
  }, null, (r) => [r.rose >= 100 && r.fellAt > 0 && r.dmg >= r.need - 1 && r.lvB > r.lvA,
    's15 r2 용암: trigger 위 8칸 → 3초에 수위 ≥100px 상승 · 잠기면 onPlayerFell(체력 −25%) · 수위가 내려감']);
  // s16 r2 깊은 물
  await run('s16r2 deep', 'index.html?scene=stage&stage=s16&room=r2', () => {
    const T = window.__T, w = T.w(), p = T.p();
    T.hero60(); T.tick(5);
    const d = w.gimmickOf('deep');
    const X = 10 * 48, Y = 16 * 48;
    p.x = X; p.y = Y; p.vx = 0; p.vy = 0;
    T.tick(180);
    const air3 = d.air, under = d.headUnder;
    p.x = X; p.y = Y; p.vy = 0; T.tick(2);
    T.tap('KeyZ');
    let minVy = 1e9;
    for (let i = 0; i < 8; i++) { T.tick(1); minVy = Math.min(minVy, p.vy); }
    T.pin = () => { p.x = X; p.y = Y; p.vx = 0; p.vy = 0; };
    T.tick(2);
    d.air = 0;
    const hp0 = p.hp;
    let dropAt = -1;
    for (let i = 0; i < 72 && dropAt < 0; i++) { T.tick(1); if (p.hp < hp0) dropAt = i + 1; }
    T.pin = null;
    return { air3: Math.round(air3 * 10) / 10, under, minVy: Math.round(minVy), hp0, hp1: p.hp, dropAt };
  }, null, (r) => [r.air3 <= 80 && r.minVy < 0 && r.dropAt > 0 && r.dropAt <= 72,
    's16 r2 깊은 물: 3초 뒤 air ≤ 80 · 점프 → vy < 0 · air 0 → 1.2초 안에 체력 감소']);
  // s17 r1 돌풍 + r2 상승 기류
  await run('s17 wind', 'index.html?scene=stage&stage=s17&room=r1', () => {
    const T = window.__T, w = T.w(), p = T.p();
    T.hero60(); T.tick(30);
    const wd = w.gimmickOf('wind');
    wd.gust(1, 900, 2, 0);
    let maxVx = -1e9, at = -1;
    for (let i = 0; i < 30; i++) { T.tick(1); if (p.vx > maxVx) maxVx = p.vx; if (at < 0 && p.vx > 150) at = i + 1; }
    w.loadRoom('r2');
    T.tick(2);
    const up = w.gimmickOf('wind');
    p.x = 8 * 48 + 24 - p.w / 2; p.y = 45 * 48; p.vx = 0; p.vy = 0;
    let minVy = 1e9, upAt = -1;
    for (let i = 0; i < 24; i++) { T.tick(1); if (p.vy < minVy) minVy = p.vy; if (upAt < 0 && p.vy < 0) upAt = i + 1; }
    return { maxVx: Math.round(maxVx), at, upCells: up?.updraft?.size ?? 0, minVy: Math.round(minVy), upAt };
  }, null, (r) => [r.at > 0 && r.at <= 30 && r.upAt > 0 && r.upAt <= 24,
    's17 돌풍 gust(1,900,2,0) → 0.5초 안에 vx > 150 · r2 U 칸 → 0.4초 안에 vy < 0']);
  // s18 r1 박동
  await run('s18r1 heartbeat', 'index.html?scene=stage&stage=s18&room=r1', async () => {
    const T = window.__T, w = T.w(), p = T.p();
    const { T: TT } = await import('/src/core/physics.js');
    T.hero60(); T.tick(2);
    const hb = w.gimmickOf('heartbeat');
    const snap = () => hb.cells.map((c) => w.map.tiles[c.idx]);
    const s0 = snap(), b0 = hb.beatIndex;
    T.tick(Math.round((hb.beat + 0.1) * 60));
    const s1 = snap();
    const toggled = s0.filter((v, i) => v !== s1[i]).length;
    const next = hb.beatIndex + 1;
    const c = hb.cells.find((q) => hb.wants(q, next) && w.map.tiles[q.idx] === TT.EMPTY && q.tx > 4);
    if (!c) return { b0, b1: hb.beatIndex, toggled, noCell: true };
    const X = c.tx * 48 + 24 - p.w / 2, Y = c.ty * 48 + 24 - p.h / 2;
    let solidWhileOver = 0, sawPending = false, overFrames = 0;
    T.pin = () => { p.x = X; p.y = Y; p.vx = 0; p.vy = 0; };
    T.after = () => {
      const over = p.x < c.tx * 48 + 48 && p.x + p.w > c.tx * 48 && p.y < c.ty * 48 + 48 && p.y + p.h > c.ty * 48;
      if (over) overFrames++;
      if (over && w.map.tiles[c.idx] === TT.SOLID) solidWhileOver++;
      if (c.pending) sawPending = true;
    };
    T.tick(Math.round((hb.beat - hb.timer + 0.3) * 60));   // 다음 박동을 지나도록
    T.pin = null; T.after = null;
    const beatAfter = hb.beatIndex;
    const sp = w.run.checkpoint;
    p.x = sp.x; p.y = sp.y; p.vx = 0; p.vy = 0;
    T.tick(20);
    return { b0, beat: hb.beat, toggled, cell: [c.tx, c.ty], beatAfter, next, overFrames, solidWhileOver, sawPending, solidLater: w.map.tiles[c.idx] === TT.SOLID || !hb.wants(c) };
  }, null, (r) => [r.toggled > 0 && !r.noCell && r.beatAfter >= r.next && r.overFrames > 0 && r.solidWhileOver === 0 && r.sawPending && r.solidLater,
    's18 r1 박동: beat+0.1초 뒤 z 칸이 바뀜 · 플레이어와 겹친 칸은 보류(겹친 동안 SOLID 아님) → 비키면 굳음']);
  // s19 r1 부패
  await run('s19r1 blight', 'index.html?scene=stage&stage=s19&room=r1', async () => {
    const T = window.__T, w = T.w(), p = T.p();
    const { Statue } = await import('/src/game/props.js');
    T.hero60(); T.tick(5);
    const b = w.gimmickOf('blight');
    const X = 36 * 48;
    const Y = (() => { for (let ty = 7; ty < w.map.h; ty++) if (w.map.typeAt(36, ty + 1) !== 0 && w.map.typeAt(36, ty) === 0) return (ty + 1) * 48 - p.h; return 12 * 48; })();
    T.pin = () => { p.x = X; };
    p.x = X; p.y = Y; p.vy = 0;
    T.tick(60);
    const m1 = b.meter;
    b.meter = 100; T.tick(1);
    const status = b.status;
    const max = p.stats.hp;
    p.hp = Math.floor(max * 0.2);
    const got = p.heal(max * 0.2, false);
    T.pin = null;
    const cp = w.run.checkpoint;
    p.x = cp.x; p.y = cp.y; p.vx = 0; p.vy = 0;
    T.tick(20);
    const before = b.meter;
    const ptx = Math.floor(p.cx / 48), pty = Math.floor((p.bottom - 1) / 48);
    const st = w.add(new Statue(ptx, pty));
    T.tick(6);
    const statue = { used: st.used, meter: b.meter, status: b.status, before: Math.round(before) };
    b.meter = 60; b.setStatus(true, true);
    const pk = w.spawnPickup('food', p.cx, p.cy, { heal: 0.3, icon: 'meat', vx: 0, vy: 0 });
    w.collect(pk);
    const food = { meter: b.meter, status: b.status };
    T.tick(2);
    return { m1: Math.round(m1), status, got, half: Math.round(max * 0.1), statue, food };
  }, null, (r) => [r.m1 > 20 && r.status === true && Math.abs(r.got - r.half) <= 1 && r.statue.used && r.statue.meter === 0 && !r.statue.status && r.food.meter <= 30.5 && !r.food.status,
    's19 r1 부패: 포자 속 1초 → meter > 20 · 100 → status · 회복 절반 · 여신상/음식 정화']);
  // s20 r1 공허의 벽
  await run('s20r1 voidwall', 'index.html?scene=stage&stage=s20&room=r1', () => {
    const T = window.__T, w = T.w(), p = T.p();
    T.hero60(); T.god = false; p.iframes = 0;
    const v = w.gimmickOf('voidwall');
    const x0 = v.wallX;
    T.tick(Math.round((v.cfg.delay + 1) * 60));
    const x1 = v.wallX;
    T.full();
    const hp0 = p.hp;
    let contact = -1, pxAt = 0, maxVx = 0;
    for (let i = 0; i < 900; i++) {
      T.tick(1);
      if (contact < 0 && p.x < v.wallX) { contact = i; pxAt = p.x; }
      if (contact >= 0) { maxVx = Math.max(maxVx, p.vx); if (i - contact > 20) break; }
    }
    return { x0: Math.round(x0), x1: Math.round(x1), contact, hp0, hp1: Math.round(p.hp), maxVx: Math.round(maxVx), pushed: Math.round(p.x - pxAt), wall: Math.round(v.wallX) };
  }, null, (r) => [r.x1 > r.x0 && r.contact >= 0 && r.hp1 < r.hp0 && (r.maxVx >= 300 || r.pushed > 20),
    's20 r1 공허의 벽: delay+1초 뒤 wallX 증가 · 가만히 있으면 피해 + 오른쪽으로 밀림'], { god: false });
}

// ── 6 · 11 · 스테이지 클리어: 보스 7종 ──
async function bossFlow(sid, { patterns = true, death = true, loot = false, clears = false, shards = null, ending = false } = {}) {
  const bid = P2_BOSSES[sid], G = ending ? 'endings' : 'bosses';
  const PT = BOSS_PAT[bid];
  let P = null;
  const tag = ending ? `endings ${bid}(${shards?.length ?? 0})` : bid;
  try {
    P = await openPage(`index.html?scene=stage&stage=${sid}&room=boss`, { ready: 'stage', god: 'full' });
    let e0 = P.errs.length;
    if (shards) await P.page.evaluate((s) => { window.__T.g.state.progress.shards = s; }, shards);
    // 경기장까지 걷기 (막히면 점프)
    const walk = await P.page.evaluate(() => {
      const T = window.__T, w = T.w(), p = T.p();
      T.hero60();
      let lastX = p.x, jumps = 0;
      T.hold('ArrowRight', 40);
      for (let i = 0; i < 60 * 30 && !w.boss; i++) {
        T.tick(1);
        if (T.top()?.name !== 'stage') continue;
        if (i % 20 === 19) { if (Math.abs(p.x - lastX) < 4) { T.hold('KeyZ', 0.25); jumps++; } lastX = p.x; }
      }
      T.release('ArrowRight');
      const walked = !!w.boss;
      if (!walked && w.arenaX !== undefined) { p.x = w.arenaX + 3 * 48; T.tick(5); }
      return { walked, boss: !!w.boss, x: Math.round(p.x), arenaX: w.arenaX, jumps };
    });
    // 늦게 받는 보스 (R1-REQ-229 · 451): world.boss 는 클래스 모듈이 올 때까지 PendingBoss(대역)다.
    // 모듈은 비동기로 오므로 멈춘 루프의 한 evaluate 안에서는 바뀌지 않는다 → 실제 시간을 주며 한 프레임씩 진행해 진짜 보스를 기다린다
    const real = await waitRealBoss(P);
    const fight = await P.page.evaluate(() => {
      const T = window.__T, w = T.w();
      const ok = T.until(() => w.bossActive && !w.cutscene && T.top()?.name === 'stage' && T.g.fade.dir === 0, 40);
      const b = w.boss;
      T.base = { tiles: Array.from(w.map.tiles), magma: w.gimmickOf('magma')?.level, windAuto: w.gimmickOf('wind')?.auto };
      return { ok, top: T.top()?.name, id: b?.def?.id, phases: b?.def?.phases ?? [], hp: b?.hp, log: T.cap.scenes.slice(-6) };
    });
    check(G, `${tag}: 걸어서 경기장 → 보스 모듈 도착(대역 → 진짜 보스) → 대사·소개 넘김 → 전투 시작`, walk.walked && real.done && fight.ok && fight.id === bid && !errsSince(P, e0).length, { walk, real, fight, errs: errsSince(P, e0) });
    if (!fight.ok) return;
    await shot(P, `boss_${bid}${ending ? '_' + (shards?.length ?? 0) : ''}_p0`);
    const nPh = fight.phases.length;
    const act = async (name) => {
      const e1 = P.errs.length;
      const r = await P.page.evaluate((name) => {
        const T = window.__T, w = T.w(), b = w.boss;
        T.until(() => T.top()?.name === 'stage' && !w.cutscene, 8);
        const ok = b.debugAct(name);
        T.tick(210);
        return { ok, state: b.state, phase: b.phase, alive: !b.dead && !(b.dying > 0) };
      }, name);
      const errs = errsSince(P, e1);
      check(G, `${bid} 페이즈 ${r.phase} 패턴 ${name} 3.5초`, r.ok !== false && r.alive && !errs.length, { ...r, errs });
    };
    if (patterns) {
      for (const a of PT.attacks) await act(a);
      for (let n = 1; n <= nPh; n++) {
        const e1 = P.errs.length;
        const ph = await P.page.evaluate((n) => {
          const T = window.__T, w = T.w(), b = w.boss;
          b.debugPhase(n);
          const ok = T.until(() => !b._tr && !w.cutscene && T.top()?.name === 'stage', 12);
          T.tick(30);
          return { ok, phase: b.phase, form: b.formPhase ?? null, state: b.state, log: T.cap.scenes.slice(-4) };
        }, n);
        check(G, `${bid} debugPhase(${n}) → 전환·대사 뒤 전투 재개`, ph.ok && ph.phase === n && !errsSince(P, e1).length, { ...ph, errs: errsSince(P, e1) });
        await shot(P, `boss_${bid}_p${n}`);
        for (const a of Object.keys(PT.weights?.[n] ?? {})) await act(a);
        if (n === 1 && death) {
          const e2 = P.errs.length;
          const d = await P.page.evaluate(() => {
            const T = window.__T, g = T.g, w = T.w(), p = T.p(), b = w.boss;
            T.god = false; p.iframes = 0; p.hp = 0;
            T.tick(2);
            if (!p.dead) p.die?.(w);
            const died = T.until(() => p.dead, 2);
            const back = T.until(() => !p.dead && !w.transitioning && g.fade.dir === 0, 10);
            T.god = 'full';
            T.tick(90);   // 경기장이 원래대로 (용암·물·벽) 돌아올 시간
            const hb = w.gimmickOf('heartbeat'), skip = new Set(hb ? hb.cells.map((c) => c.idx) : []);
            let diff = 0;
            const tl = w.map.tiles;
            for (let i = 0; i < tl.length; i++) if (!skip.has(i) && tl[i] !== T.base.tiles[i]) diff++;
            const mg = w.gimmickOf('magma'), wd = w.gimmickOf('wind'), vw = w.gimmickOf('voidwall'), bl = w.gimmickOf('blight');
            return {
              died, back, phase: b.phase, hpFull: b.hp >= b.stats.maxHp, tileDiff: diff,
              magma: mg ? { level: Math.round(mg.level), target: Math.round(mg.target), base: Math.round(T.base.magma) } : null,
              beat: hb ? { beat: hb.beat, base: hb.baseBeat } : null,
              wind: wd ? { auto: wd.auto, base: T.base.windAuto } : null,
              void: vw ? { active: !!vw.active, opening: !!vw.opening } : null,
              blight: bl ? { status: bl.status } : null, lives: w.run.lives,
            };
          });
          const arenaOk = d.tileDiff === 0 && (!d.magma || Math.abs(d.magma.target - d.magma.base) < 2 || Math.abs(d.magma.level - d.magma.base) < 2)
            && (!d.beat || d.beat.beat === d.beat.base) && (!d.wind || d.wind.auto === d.wind.base) && (!d.void || !d.void.active || d.void.opening) && (!d.blight || !d.blight.status);
          check(G, `${bid} 페이즈 1 에서 쓰러짐 → 부활 · 페이즈 0 · 경기장 원위치 (onReset)`, d.died && d.back && d.phase === 0 && d.hpFull && arenaOk && !errsSince(P, e2).length, { ...d, errs: errsSince(P, e2) });
          await shot(P, `boss_${bid}_reset`);
        }
      }
    }
    // 처치 → 결과 화면
    e0 = P.errs.length;
    const k = await P.page.evaluate((maxPh) => {
      const T = window.__T, w = T.w(), p = T.p(), b = w.boss;
      if (b.phase < maxPh) { b.debugPhase(maxPh); T.until(() => !b._tr && !w.cutscene && T.top()?.name === 'stage', 12); }
      try { b.debugAct?.('idle'); } catch { /* 무시 */ }
      let hits = 0;
      for (let i = 0; i < 900 && !(b.dying > 0) && !w.cleared; i++) {
        if (T.top()?.name === 'stage' && !b.invuln && !b.hidden) { b.hp = 1; b.takeHit(50, { team: 'player', owner: p, tags: [], dmg: 50 }, w, { hx: b.cx, hy: b.cy }); hits++; }
        T.tick(1);
      }
      const cleared = w.cleared;
      const res = T.until(() => T.top()?.name === 'results', 25);
      return { cleared, res, hits, top: T.top()?.name, flag: !!T.g.state.progress.flags['boss_' + b.def.id], log: T.cap.scenes.slice(-6) };
    }, nPh);
    check(G, `${tag}: hp=1 → 타격 → world.cleared → 결과 화면`, k.cleared && k.res && k.flag && !errsSince(P, e0).length, { ...k, errs: errsSince(P, e0) });
    if (!k.res) return;
    await shot(P, `boss_${bid}${ending ? '_' + (shards?.length ?? 0) : ''}_results`);
    if (loot && (bid === 'b_narkissa' || bid === 'b_nihil')) {
      const L = await P.page.evaluate(async (myth) => {
        const T = window.__T, st = T.g.state, res = T.top(), w = res.world;
        const { rollBossLoot } = await import('/src/game/loot.js');
        const ids = (drops) => drops.filter((d) => d.type === 'item').map((d) => d.data?.item?.baseId);
        const again = ids(rollBossLoot(w, w.boss));
        const inv = st.inventory.map((it) => it.baseId);
        return { hearts: [...st.progress.hearts], heartInv: inv.filter((b) => b === 'k_heart_1').length, againHeart: again.includes('k_heart_1'), myth: inv.filter((b) => myth.includes(b)), again };
      }, Object.values(MYTHIC_P2));
      if (bid === 'b_narkissa') check('loot', 'b_narkissa 두 번 처치 → k_heart_1 은 한 번만', L.hearts.includes('k_heart_1') && L.heartInv <= 1 && !L.againHeart, L);
      else check('loot', 'b_nihil 첫 처치 → MYTHIC_WEAPONS_P2 무기', L.myth.length >= 1, L);
    }
    if (clears || ending) {
      e0 = P.errs.length;
      let left = false;
      if (ending) {
        // §17 시각 검토: 두 엔딩 제목 카드 (ENDING n · 영문 제목 · 「이름」 이 모두 보이는 2.4–4.4초 사이에서 멈춰 찍는다)
        left = await P.page.evaluate(() => { const T = window.__T; T.autoEnding = false; T.top().leave(); return true; });
        const card = await P.page.evaluate(() => { const T = window.__T; return T.until(() => T.top()?.name === 'ending' && T.top().t > 3 && T.g.fade.dir === 0, 60) ? T.top().kind : null; });
        // 배경 CG 는 비동기로 받는다 — 멈춘 루프에서는 시뮬레이션 3초가 실제로는 순식간이므로, 스텝 없이 디코딩을 기다린 뒤 찍는다
        if (card) await stepUntil(P, async () => { const { assets } = await import('/src/core/assets.js'); const sc = window.__T.top(); return { done: sc?.name !== 'ending' || !!assets.get(sc.E?.bg) }; }, null, 8000);
        if (card) await shot(P, `ending_card_${card}`);
      }
      const c = await P.page.evaluate(({ sid, rid, ending, left }) => {
        const T = window.__T, g = T.g, st = g.state, res = T.top();
        T.autoEnding = !!ending;
        if (!left) res.leave();
        const done = () => { const n = T.top()?.name; return g.fade.dir === 0 && (ending ? n === 'hub' : (n === 'hub' || n === 'ending')) && !g.scenes.some((s) => s.name === 'companionJoin'); };
        const ok = T.until(done, ending ? 240 : 90);
        T.tick(60);
        const P2 = st.progress;
        return {
          ok, top: T.top()?.name, cleared: !!P2.cleared[sid], unlocked: [...P2.unlocked], flag: rid ? !!P2.flags['recruit_' + rid] : null,
          owned: rid ? !!st.companions?.owned?.[rid] : null, stories: T.cap.stories.slice(), endings: T.cap.endings.slice(),
          credits: T.cap.credits.map((c) => ({ kind: c.kind, text: c.text })), flags: Object.keys(P2.flags).filter((f) => /^ending_/.test(f)), log: T.cap.scenes.slice(-12),
        };
      }, { sid, rid: RECRUITS[sid] ?? null, ending, left });
      const errs = errsSince(P, e0);
      await shot(P, `after_${bid}${ending ? '_' + (shards?.length ?? 0) : ''}`);
      return { c, errs };
    }
  } catch (e) { check(G, `${tag} 실행`, false, e.stack); }
  finally { await P?.close(); }
  return null;
}

async function bossesGroup() {
  for (const sid of P2) {
    const bid = P2_BOSSES[sid];
    if (BOSS_ONLY && !BOSS_ONLY.includes(bid)) continue;
    const full = want('bosses');
    const needLoot = want('loot') && (bid === 'b_narkissa' || bid === 'b_nihil');
    if (!full && !needLoot && !want('clears')) continue;
    const out = await bossFlow(sid, { patterns: full, death: full, loot: needLoot, clears: want('clears') });
    if (!out || !want('clears')) continue;
    const { c, errs } = out, G = 'clears', next = STAGES_REF[sid]?.next;
    if (sid !== 's20') {
      const rid = RECRUITS[sid];
      check(G, `${sid} 클리어 → 아웃트로 ${sid}_outro → 마을 · cleared.${sid} · ${next} 해금 · recruit_${rid} · 동료 합류`,
        c.ok && c.top === 'hub' && c.cleared && c.unlocked.includes(next) && c.flag && c.owned && c.stories.includes(`${sid}_outro`) && !errs.length, { ...c, errs });
    } else {
      check(G, 's20 클리어 → 아웃트로 s20_outro → 엔딩 장면', c.ok && c.top === 'ending' && c.cleared && c.stories.includes('s20_outro') && !errs.length, { ...c, errs });
    }
  }
}

// ── 7. 1부 진엔딩 크레딧 → 2부 프롤로그 → 마을 → 지도 ──
async function flowGroup() {
  const G = 'flow';
  let P = null;
  try {
    P = await openPage('index.html', { ready: 'title', god: false });
    const e0 = P.errs.length;
    const a = await P.page.evaluate(async () => {
      const T = window.__T, g = T.g;
      const { newGameState } = await import('/src/game/state.js');
      const st = newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' });
      const P = st.progress;
      P.unlocked = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 's13'];
      for (const s of P.unlocked) P.cleared[s] = { rank: 'A', time: 600, score: 1000 };
      P.flags.abyss_open = true; P.bosses.push('b_chaos'); P.chapter = 13; st.score = 0;
      g.state = st;
      T.autoEnding = true;
      g.go('credits', { kind: 'true', fromEnding: true }, { fade: false });
      const ok = T.until(() => T.top()?.name === 'hub' && g.fade.dir === 0, 120);
      T.tick(30);
      return { ok, top: T.top()?.name, stories: T.cap.stories.slice(), p2: !!P.flags.p2_started, lantern: st.inventory.some((it) => it.baseId === 'k_rift_lantern'), log: T.cap.scenes.slice(-8) };
    });
    check(G, "credits(kind 'true') → 2부 프롤로그 p2_prologue → 마을 · flags.p2_started · k_rift_lantern", a.ok && a.stories.includes('p2_prologue') && a.p2 && a.lantern && !errsSince(P, e0).length, { ...a, errs: errsSince(P, e0) });
    const e1 = P.errs.length;
    const b = await P.page.evaluate(() => {
      const T = window.__T, g = T.g, st = g.state;
      g.push('worldmap');
      T.tick(2);
      const wm = T.top();
      const r = { top: wm?.name, reveal: !!wm?.reveal, page: wm?.page, s14: st.progress.unlocked.includes('s14') };
      T.until(() => !wm.reveal, 6);
      T.tick(5);
      T.tap('KeyQ'); T.tick(4); r.q1 = wm.page;
      T.tap('KeyQ'); T.tick(4); r.q2 = wm.page;
      return r;
    });
    await shot(P, 'flow_worldmap_p1');
    const pt = await tapPoint(P, 'tab0');
    if (pt) await P.page.mouse.click(pt.x, pt.y);
    await stepUntil(P, async () => { const T = window.__T, wm = T.top(); await T.drawSealed(); T.tick(1); return { done: wm.page === 0 }; });
    const c = await P.page.evaluate(() => {
      const T = window.__T, wm = T.top();
      T.draw(); T.tick(2);
      const tapPage = wm.page;
      T.tap('Escape'); T.tick(4);
      T.until(() => T.top()?.name === 'hub' && T.g.fade.dir === 0, 3);
      return { tapPage, top: T.top()?.name };
    });
    check(G, '마을에서 지도: s14 해금 연출 · 2부 지도(page 1) · Q 로 지도 전환 · 탭(tab0) 전환 · 닫으면 마을', b.top === 'worldmap' && b.reveal && b.s14 && b.page === 1 && b.q1 === 0 && b.q2 === 1 && !!pt && c.tapPage === 0 && c.top === 'hub' && !errsSince(P, e1).length,
      { ...b, tab0: pt?.z ? [pt.z.x, pt.z.y, pt.z.w, pt.z.h, pt.z.k] : null, ...c, errs: errsSince(P, e1) });
  } catch (e) { check(G, '흐름 실행', false, e.stack); }
  await P?.close();
}

// ── 8. 옛 세이브 (v1) ──
async function legacyGroup() {
  const G = 'legacy';
  let P = null;
  try {
    const json = fs.readFileSync(path.join(ROOT, 'tools/fixtures/save_v1.json'), 'utf8');
    P = await openPage('index.html', { ready: 'title', god: false });
    const e0 = P.errs.length;
    const r = await P.page.evaluate(async (json) => {
      const T = window.__T, g = T.g;
      const { saves } = await import('/src/core/save.js');
      const { migrateState } = await import('/src/game/state.js');
      const imported = saves.importCode(2, btoa(unescape(encodeURIComponent(json))));
      const raw = saves.read(2);
      const v0 = raw?.version;
      const st = migrateState(raw);
      const out = { imported, v0, version: st.version, shards: Array.isArray(st.progress.shards), hearts: Array.isArray(st.progress.hearts), companions: !!st.companions?.owned, slot: st.slot };
      g.state = st;
      g.go('hub', {}, { fade: false });
      T.until(() => T.top()?.name === 'hub' && g.fade.dir === 0, 10);
      T.tick(10);
      const n0 = T.cap.stories.filter((s) => s === 'p2_prologue').length;
      g.push('worldmap');
      out.first = T.until(() => T.top()?.name === 'hub' && g.fade.dir === 0 && T.cap.stories.includes('p2_prologue'), 120);
      T.tick(20);
      out.p2 = !!st.progress.flags.p2_started;
      g.push('worldmap');
      T.tick(10);
      out.second = T.top()?.name;
      T.until(() => !T.top()?.reveal, 6);
      out.prologues = T.cap.stories.filter((s) => s === 'p2_prologue').length - n0;
      out.s14 = st.progress.unlocked.includes('s14');
      out.log = T.cap.scenes.slice(-8);
      return out;
    }, json);
    await shot(P, 'legacy_worldmap');
    check(G, 'save_v1.json → importCode → migrateState: version 2 · shards/hearts 배열 · 동료 구조', r.imported && r.v0 === 1 && r.version === 2 && r.shards && r.hearts && r.companions, r);
    check(G, '옛 세이브로 지도 → p2_prologue 한 번 → 마을 → 다시 지도는 그냥 열림 (s14 해금)', r.first && r.p2 && r.prologues === 1 && r.second === 'worldmap' && r.s14 && !errsSince(P, e0).length, { ...r, errs: errsSince(P, e0) });
  } catch (e) { check(G, '옛 세이브 실행', false, e.stack); }
  await P?.close();
}

// ── 9. 엔딩 ──
async function endingsGroup() {
  const G = 'endings';
  const lastLine = '새벽의 별은 지지 않는다.';
  const P1_LAST = '밤은 끝났다. 좋은 아침을.', P2_SUB = '제2부 균열의 순례';   // world2 §1.7
  const P2_HEADS = CREDITS_P2_REF.map((s) => s.trim().match(/^—\s*(.+?)\s*—$/)?.[1]).filter(Boolean);   // CREDITS_P2 의 소제목 (1부 크레딧에는 없어야 한다)
  const creditParts = CREDITS_P2_REF.map((s) => s.trim()).filter(Boolean).flatMap((s) => s.replace(/^—\s*|\s*—$/g, '').split(' — ')).map((s) => s.trim()).filter(Boolean);
  for (const [n, kind] of [[6, 'p2true'], [0, 'p2']]) {
    if (BOSS_ONLY && !BOSS_ONLY.includes('b_nihil')) break;
    const shards = Array.from({ length: n }, (_, i) => `k_star_${i + 1}`);
    const out = await bossFlow('s20', { patterns: false, death: false, shards, ending: true });
    if (!out) { check(G, `별의 조각 ${n}개 → ${kind}`, false, '보스전/결과 화면까지 가지 못함'); continue; }
    const { c, errs } = out;
    const cr = c.credits.find((x) => x.kind === kind);
    const missing = cr ? creditParts.filter((s) => !cr.text.includes(s)) : creditParts;
    // world2 §1.7: p2true 는 마지막 줄을 lastLine 으로 바꾸고, p2 는 1부 마지막 줄을 그대로 둔다. 두 갈래 모두 부제가 2부판.
    const closing = kind === 'p2true' ? !!cr?.text.includes(lastLine) && !cr.text.includes(P1_LAST) : !!cr?.text.includes(P1_LAST) && !cr.text.includes(lastLine);
    const sub = !!cr?.text.includes(P2_SUB);
    check(G, `별의 조각 ${n}개: s20 결과 → leave() → 엔딩 ${kind} · ending_${kind} · 크레딧(CREDITS_P2 · 2부 부제 · ${kind === 'p2true' ? '새 마지막 줄' : '1부 마지막 줄'}) · 마을`,
      c.ok && c.top === 'hub' && c.endings.includes(kind) && c.stories.includes(`ending_${kind}`) && !!cr && !missing.length && closing && sub && c.flags.includes('ending_' + kind) && !errs.length,
      { top: c.top, endings: c.endings, stories: c.stories, credits: c.credits.map((x) => x.kind), missing: missing.slice(0, 8), closing, sub, flags: c.flags, log: c.log, errs });
  }
  // 1부 회귀: s12 (유물 없음) → 배드/노멀, s13 → 진엔딩 → 프롤로그
  const cases = [
    { name: 's12 · 유물 없음 → ending_bad', from: 's12', flags: {}, kind: 'bad', end: 'hub' },
    { name: 's12 · 유물 없음 + carmilla_trust2 → ending_normal', from: 's12', flags: { carmilla_trust2: true }, kind: 'normal', end: 'hub' },
    { name: 's13 → ending_true → 크레딧 → p2_prologue → 마을', from: 's13', flags: {}, kind: 'true', end: 'hub', prologue: true },
  ];
  for (const cs of cases) {
    let P = null;
    try {
      P = await openPage('index.html', { ready: 'title', god: false });
      const e0 = P.errs.length;
      const r = await P.page.evaluate(async (cs) => {
        const T = window.__T, g = T.g;
        const { newGameState } = await import('/src/game/state.js');
        const st = newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' });
        const P = st.progress;
        P.unlocked = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12'];
        for (const s of P.unlocked) P.cleared[s] = { rank: 'B', time: 600, score: 1000 };
        Object.assign(P.flags, cs.flags);
        if (cs.from === 's13') { P.unlocked.push('s13'); P.cleared.s13 = { rank: 'B', time: 600, score: 1000 }; P.bosses.push('b_chaos'); P.relics = ['r1', 'r2', 'r3', 'r4', 'r5']; }
        st.score = 0;
        g.state = st;
        T.autoEnding = true;
        g.go('ending', { from: cs.from }, { fade: false });
        const ok = T.until(() => T.top()?.name === cs.end && g.fade.dir === 0, 150);
        return { ok, top: T.top()?.name, endings: T.cap.endings.slice(), stories: T.cap.stories.slice(), p2: !!P.flags.p2_started, log: T.cap.scenes.slice(-8), credits: T.cap.credits.map((c) => ({ kind: c.kind, text: c.text })) };
      }, cs);
      // world2 §1.7: 2부 엔딩을 본 적 없는 1부 엔딩 크레딧에는 2부 줄이 없다 (부제·마지막 줄도 1부 그대로)
      const cr = r.credits.find((x) => x.kind === cs.kind);
      const p2Lines = cr ? [P2_SUB, lastLine, ...P2_HEADS].filter((s) => cr.text.includes(s)) : null;
      const pass = r.ok && r.endings.includes(cs.kind) && r.stories.includes(`ending_${cs.kind}`) && (!cs.prologue || (r.stories.includes('p2_prologue') && r.p2))
        && !!cr && !p2Lines.length && cr.text.includes(P1_LAST);
      check(G, `1부 회귀: ${cs.name} (크레딧에 2부 줄 없음)`, pass && !errsSince(P, e0).length, { ...r, credits: r.credits.map((x) => x.kind), p2Lines, errs: errsSince(P, e0) });
    } catch (e) { check(G, `1부 회귀 ${cs.name} 실행`, false, e.stack); }
    await P?.close();
  }
}

// ── 10. 아이템 · 의뢰 · 비전서 기술 ──
async function itemsGroup() {
  const G = 'items';
  let P = null;
  try {
    P = await openPage('index.html', { ready: 'title', god: false });
    const e0 = P.errs.length;
    const r = await P.page.evaluate(async () => {
      const [{ ITEMS, rollItem, WTYPES }, { smithStock }, Q, { newGameState }, INV] = await Promise.all([
        import('/src/data/items.js'), import('/src/data/shop.js'), import('/src/game/quests.js'), import('/src/game/state.js'), import('/src/game/inventory.js'),
      ]);
      const out = {};
      let t7 = 0;
      for (let i = 0; i < 600; i++) { const it = rollItem(55); if (ITEMS[it?.baseId]?.tier === 7) t7++; }
      out.tier7 = t7;
      const stock = smithStock(15).map((s) => s.baseId);
      out.smith = WTYPES.map((wt) => [wt, stock.includes(`w_${wt}_13`), stock.includes(`w_${wt}_14`)]);
      const st = newGameState({ slot: 1 });
      st.progress.chapter = 19; st.progress.flags.p2_started = true;
      for (let i = 1; i <= 19; i++) { const s = 's' + String(i).padStart(2, '0'); st.progress.cleared[s] = { rank: 'B', time: 1, score: 1 }; }
      const acc = Q.acceptQuest(st, 'ab_dawnflower', { silent: true });
      INV.addByBase(st, 'k_dawnflower', 1);
      out.dawn = { accepted: !!acc || !!st.quests.active.ab_dawnflower, canClaim: Q.canClaim(st, 'ab_dawnflower') };
      const rw = Q.claimQuest(st, 'ab_dawnflower');
      out.dawn.claimed = !!rw;
      out.dawn.alberto = st.inventory.some((it) => it.baseId === 'u_alberto');
      out.dawn.flag = !!st.progress.flags.dawnflower_given;
      Q.acceptQuest(st, 'rk_stars', { silent: true });
      st.progress.shards = ['k_star_1', 'k_star_2'];
      const p2 = Q.questProgress(st, 'rk_stars');
      st.progress.shards.push('k_star_4');
      const p3 = Q.questProgress(st, 'rk_stars');
      out.stars = { active: !!st.quests.active.rk_stars, two: p2.cur, doneAt2: p2.done, three: p3.cur, doneAt3: p3.done };
      return out;
    });
    check(G, 'rollItem(55) 이 7단계 장비를 낼 수 있다', r.tier7 > 0, { tier7of600: r.tier7 });
    check(G, '15장 대장간에 w_*_13 · w_*_14 (무기 6종)', r.smith.every(([, a, b]) => a && b), r.smith);
    check(G, 'ab_dawnflower 보상 → u_alberto · flags.dawnflower_given', r.dawn.accepted && r.dawn.canClaim && r.dawn.claimed && r.dawn.alberto && r.dawn.flag, r.dawn);
    check(G, 'rk_stars 진행 = progress.shards (2/3 → 3/3 달성)', r.stars.active && r.stars.two === 2 && !r.stars.doneAt2 && r.stars.three === 3 && r.stars.doneAt3, r.stars);
    // 외전 s23 아웃트로의 give once · silent (docs/specs/ex_s23.md §3 · §8): 진짜 컷신(front/story.js)·대화창(dialogue.js) 장면으로 —
    //   끝까지 보기 · 건너뛰기 모두 일곱 자루, 다시 틀어도 겹치지 않음, 획득 토스트 0 · 'item' 소리는 대본의 se 한 번, 가방이 꽉 차면 보관함, 팔고 다시 틀면 다시 받음
    const gv = await P.page.evaluate(async () => {
      const g = window.__game;
      const [{ ITEMS, makeItem, HUNT_SET }, { newGameState }, INV, { audio }, { SCRIPTS }] = await Promise.all([
        import('/src/data/items.js'), import('/src/game/state.js'), import('/src/game/inventory.js'), import('/src/core/audio.js'), import('/src/data/story.js'),
      ]);
      if (!SCRIPTS.s23_outro || !HUNT_SET?.length) return { missing: { outro: !!SCRIPTS.s23_outro, set: HUNT_SET?.length ?? 0 } };
      const keep = { state: g.state, toast: g.toast, sfx: audio.sfx };
      const log = { toasts: [], item: 0 };
      g.toast = function (t, ...a) { log.toasts.push(String(t)); return keep.toast.call(this, t, ...a); };
      audio.sfx = function (id, ...a) { if (id === 'item') log.item++; return keep.sfx.call(this, id, ...a); };
      const own = (st) => HUNT_SET.map((id) => INV.countItem(st, id) + (st.progress.lootQueue ?? []).filter((i) => i.baseId === id).length);
      const fresh = (charId = 'kael') => { const st = newGameState({ slot: 1, charId }); st.slot = 0; st.progress.flags.p2_done = true; return st; };   // slot 0: 컷신 끝의 saves.write 를 건너뛴다
      // how: 'play' = 한 줄씩 끝까지 · 'skip' = 건너뛰기 · 'dlg' = 대화창(skipAll)
      const run = (st, how) => {
        g.state = st;
        const t0 = log.toasts.length, i0 = log.item;
        if (how === 'dlg') { const sc = g.push('dialogue', { lines: SCRIPTS.s23_outro }); sc.skipAll(); }
        else {
          const sc = g.push('story', { script: 's23_outro', then: 'title' });
          if (how === 'skip') sc.skip();
          else for (let n = 0; n < 400 && !sc.ending; n++) sc.next();
          if (g.top === sc) g.pop();
        }
        return { toasts: log.toasts.slice(t0).filter((t) => /획득/.test(t)).length, item: log.item - i0, own: own(st), done: !!st.progress.flags.ex_s23_done };
      };
      const out = {};
      try {
        const a = fresh('victor');
        out.play = run(a, 'play'); out.again = run(a, 'skip');
        const gun = a.inventory.find((i) => i.baseId === 'u_hunt_gun');
        INV.sellItem(a, gun.uid);
        out.sold = own(a)[HUNT_SET.indexOf('u_hunt_gun')];
        out.resell = run(a, 'skip');
        out.skip = run(fresh('lia'), 'skip');
        const d = fresh();
        out.dlg = run(d, 'dlg'); out.dlg2 = run(d, 'dlg');
        const f = fresh('isolde');
        const wid = Object.keys(ITEMS).find((k) => ITEMS[k].slot === 'weapon' && !ITEMS[k].unique);
        for (let i = 0; INV.freeSlots(f) > 0 && i < 400; i++) INV.addItem(f, makeItem(wid), { silent: true });
        out.full = run(f, 'skip'); out.full.queued = (f.progress.lootQueue ?? []).length; out.full2 = run(f, 'play');
      } finally { g.toast = keep.toast; audio.sfx = keep.sfx; g.state = keep.state; }
      return out;
    });
    const one = (x) => x && x.own.every((n) => n === 1) && x.toasts === 0 && x.done;
    check(G, 's23 아웃트로 give once·silent: 끝까지 보기 → 일곱 자루 · 획득 토스트 0 · item 소리 1 (대본 se)', !gv.missing && one(gv.play) && gv.play.item === 1, gv.missing ?? gv.play);
    check(G, 's23 아웃트로 다시 틀기 · 건너뛰기 · 대화창 두 번 → 무기마다 한 자루, 토스트 0', !gv.missing && one(gv.again) && one(gv.skip) && one(gv.dlg) && one(gv.dlg2) && gv.again.item === 0 && gv.dlg2.item <= 1, gv.missing ?? { again: gv.again, skip: gv.skip, dlg: gv.dlg, dlg2: gv.dlg2 });
    check(G, 's23 아웃트로: 팔고 다시 틀면 다시 받음 · 가방이 꽉 차면 보관함 일곱 (다시 틀어도 겹치지 않음)', !gv.missing && gv.sold === 0 && one(gv.resell) && one(gv.full) && gv.full.queued === 7 && one(gv.full2), gv.missing ?? { sold: gv.sold, resell: gv.resell, full: gv.full, full2: gv.full2 });
    check(G, '아이템/의뢰 검사 오류 0', !errsSince(P, e0).length, errsSince(P, e0));
  } catch (e) { check(G, '아이템 검사 실행', false, e.stack); }
  await P?.close();
  // 가방 300/300 으로 s19 r4 (감사 EC-01): 새벽꽃은 주워지고, 일반 아이템은 바닥에 남으며(배치 기록 없음),
  // 상자·보스 전리품은 방을 떠나면, 남은 전리품은 스테이지 끝에 보관함으로 → 자리가 나면 world.update 가 가방에 넣는다
  try {
    P = await openPage('index.html?scene=stage&stage=s19&room=r4', { ready: 'stage', god: 'full' });
    const e0 = P.errs.length;
    const r = await P.page.evaluate(async () => {
      const T = window.__T, w = T.w(), st = T.g.state, p = T.p();
      const [INV, { ITEMS, makeItem }] = await Promise.all([import('/src/game/inventory.js'), import('/src/data/items.js')]);
      const wid = Object.keys(ITEMS).find((k) => ITEMS[k].slot === 'weapon' && !ITEMS[k].unique);
      st.inventory = st.inventory.filter((i) => ITEMS[i.baseId]?.slot !== 'key');
      for (let i = 0; INV.freeSlots(st) > 0 && i < 400; i++) INV.addItem(st, makeItem(wid), { silent: true });
      if (st.progress.lootQueue) st.progress.lootQueue.length = 0;
      const pk = (id) => w.entities.find((e) => e.kind === 'pickup' && !e.dead && e.data?.item?.baseId === id);
      const touch = (e, n = 20) => { for (let i = 0; i < n && !e.dead; i++) { p.x = e.cx - p.w / 2; p.y = e.y + e.h - p.h; p.vx = p.vy = 0; T.tick(1); } };
      const out = { full: INV.freeSlots(st) === 0 };
      T.tick(30);
      const flower = pk('k_dawnflower');
      out.flowerPlaced = !!flower;
      if (flower) touch(flower);
      out.flower = INV.countItem(st, 'k_dawnflower') === 1 && st.progress.secrets.includes('s19:r4:item0');
      // 배치 일반 아이템 (가짜 secretKey) · 상자 내용물(keep) · 적 드롭
      const plain = w.spawnPickup('item', p.cx + 60, p.y, { item: makeItem('c_hipotion', { qty: 1 }), vx: 0, vy: 0 });
      plain.secretKey = 's19:r4:qa_item';
      const potion0 = INV.countItem(st, 'c_hipotion');
      T.tick(30); touch(plain, 30);
      out.plainStays = !plain.dead && plain.bagFull === true && !st.progress.secrets.includes('s19:r4:qa_item') && INV.countItem(st, 'c_hipotion') === potion0;
      const chest = w.spawnPickup('item', p.cx - 60, p.y, { item: makeItem(wid), keep: true, vx: 0, vy: 0 });
      T.tick(30); touch(chest, 30);
      out.chestStays = !chest.dead;
      // 방을 떠난다 → keep 은 보관함으로, 배치 아이템은 기록 없이 다음에 다시 놓인다
      w.loadRoom('r4'); T.tick(5);
      const q = st.progress.lootQueue ?? [];
      out.queuedOnLeave = q.length === 1 && q[0].baseId === wid;
      out.plainNotQueued = !q.some((i) => i.baseId === 'c_hipotion');
      // 스테이지 끝 자동 회수: 가득 찬 가방 → 보관함
      w.spawnPickup('item', p.cx, p.y - 40, { item: makeItem('u_goldbat'), keep: true, vx: 0, vy: 0 });
      w.collectLeftovers();
      out.leftoverQueued = q.some((i) => i.baseId === 'u_goldbat');
      // 자리가 나면 1초 안에 가방으로
      for (let k = 0; k < 3; k++) INV.removeItem(st, st.inventory.find((i) => i.baseId === wid && !INV.isEquipped(st, i.uid)).uid);
      T.tick(90);
      out.delivered = !q.length && INV.countItem(st, 'u_goldbat') === 1;
      out.queueLeft = q.map((i) => i.baseId);
      return out;
    });
    const ok = r.full && r.flowerPlaced && r.flower && r.plainStays && r.chestStays && r.queuedOnLeave && r.plainNotQueued && r.leftoverQueued && r.delivered;
    check(G, '가방 300/300 (s19 r4): 새벽꽃 획득 · 일반 아이템은 바닥에 남음 · 상자/남은 전리품은 보관함 → 자리가 나면 지급', ok && !errsSince(P, e0).length, { ...r, errs: errsSince(P, e0) });
  } catch (e) { check(G, '가방 가득 참 검사 실행', false, e.stack); }
  await P?.close();
  // 비전서 기술 (커맨드 입력 → MP 소모)
  try {
    P = await openPage('index.html?scene=stage&stage=s14&room=r1', { ready: 'stage', god: 'iframes' });
    const e0 = P.errs.length;
    const techs = [
      ['tech_mirror', 'd21', [['ArrowDown'], ['ArrowUp', 'ArrowRight']]],
      ['tech_whirl', 'd23', [['ArrowUp'], [], ['ArrowUp']]],
      ['tech_purge', 'd26', [['ArrowUp'], ['ArrowRight']]],
    ];
    const r = await P.page.evaluate(async (techs) => {
      const T = window.__T, p = T.p(), st = T.g.state;
      const [{ SKILL_IMPL }, { DOCS }] = await Promise.all([import('/src/game/skills.js'), import('/src/data/lore.js')]);
      // 어떤 기술이 나갔는지 기록 (castTechnique 가 SKILL_IMPL[id] 를 부른다) — 다른 커맨드 기술이 대신 나가도 MP 는 줄기 때문
      const fired = [];
      for (const k of Object.keys(SKILL_IMPL)) {
        if (!k.startsWith('tech_') || SKILL_IMPL[k]._qaWrap) continue;
        const f = SKILL_IMPL[k];
        SKILL_IMPL[k] = Object.assign(function (...a) { fired.push(k); return f.apply(this, a); }, { _qaWrap: true });
      }
      T.hero60(); T.tick(30);
      for (const [, d] of techs) if (!st.progress.docs.includes(d)) st.progress.docs.push(d);
      const out = [];
      for (const [id, d, seq] of techs) {
        T.full(); p.facing = 1; T.tick(60);
        fired.length = 0;
        const mp0 = p.mp, cost = DOCS[d]?.tech?.mp ?? null;
        let held = [];
        for (const keys of seq) {
          for (const k of held) if (!keys.includes(k)) T.key(k, false);
          for (const k of keys) if (!held.includes(k)) T.key(k, true);
          held = keys; T.tick(3);
        }
        T.tap('KeyX'); T.tick(2);
        for (const k of held) T.key(k, false);
        let spent = 0;
        for (let i = 0; i < 20; i++) { T.tick(1); spent = Math.max(spent, mp0 - p.mp); }
        out.push({ id, mp0: Math.round(mp0), spent: Math.round(spent), cost, fired: fired.slice() });
        T.tick(90);
      }
      return out;
    }, techs);
    await shot(P, 'items_techs');
    for (const t of r) check(G, `${t.id}: 커맨드 입력 → 바로 그 기술 발동 · MP ${t.cost ?? '?'} 소모`, t.cost > 0 && t.fired.length === 1 && t.fired[0] === t.id && Math.abs(t.spent - t.cost) <= 1, t);
    check(G, '기술 검사 오류 0', !errsSince(P, e0).length, errsSince(P, e0));
  } catch (e) { check(G, '기술 검사 실행', false, e.stack); }
  await P?.close();
}

// ── 12. 휴대폰 (844×390, 터치) ──
async function mobileGroup() {
  const G = 'mobile';
  const { Touch, padLayout } = await import('./qa/lib/touch.mjs');
  const overlapCheck = () => (async () => {
    const T = window.__T, g = T.g, w = T.w();
    const { hudLayout } = await import('/src/render/hud_layout.js');
    const { touchpad } = await import('/src/core/touchpad.js');
    T.draw();
    const L = hudLayout(w, g.viewW, g.viewH);
    const n = Math.max(1, w.gimmick?.meterRows ?? 1);
    const mine = Array.from({ length: n }, (_, i) => ['meter' + i, L.meter(i)]);
    const occ = (touchpad.occupiedRects?.() ?? []).map((r) => [r.id ?? 'pad', r]);
    if (L.bossShown && L.bossBar) occ.push(['bossBar', L.bossBar]);
    const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const bad = [];
    for (const [a, ra] of mine) for (const [b, rb] of occ) if (hit(ra, rb)) bad.push(`${a}×${b}`);
    // rows = 이번에 실제로 그린 게이지 줄 수, boss = 보스 바가 보이는가 (둘 다 없으면 비교가 헛돈다)
    return { n, rows: w.gimmick?.meterRows ?? 0, boss: !!L.bossShown, occ: occ.length, bad };
  })();
  const touchOn = async (P, t) => {
    const [w, h] = await P.page.evaluate(() => [innerWidth, innerHeight]);
    await t.tap(Math.round(w * 0.5), Math.round(h * 0.3), 40);
    return P.page.evaluate(() => { const T = window.__T; T.tick(3); T.draw(); return T.input.mode ?? (T.input.touchMode ? 'touch' : 'kb'); });
  };
  // s16 r2: 가상 패드 점프 버튼으로 헤엄
  let P = null;
  try {
    P = await openPage('index.html?scene=stage&stage=s16&room=r2', { ready: 'stage', god: 'iframes', mobile: true });
    const e0 = P.errs.length;
    const cdp = await P.ctx.newCDPSession(P.page), t = new Touch(cdp, P.page);
    const mode = await touchOn(P, t);
    await P.page.evaluate(() => { const T = window.__T, p = T.p(); T.hero60(); p.x = 10 * 48; p.y = 16 * 48; p.vx = 0; p.vy = 0; T.tick(90); T.draw(); });
    const pad = await padLayout(P.page);
    const jb = pad.buttons?.jump;
    let r = { mode, pad: pad.source, visible: pad.visible, jump: !!jb };
    if (jb) {
      await t.down(11, jb.cx, jb.cy);
      // 가상 패드가 점프를 받을 때까지 (touchpad → input.touch.set('jump') → sources.touch.jump) — 스텝은 돌리지 않는다
      r.padJump = !!(await stepUntil(P, () => ({ done: !!window.__T.input.sources?.touch?.jump })))?.done;
      const a = await P.page.evaluate(() => { const T = window.__T, p = T.p(); let minVy = 1e9; for (let i = 0; i < 6; i++) { T.tick(1); minVy = Math.min(minVy, p.vy); } return { minVy: Math.round(minVy), inWater: !!T.w().gimmickOf('deep')?.inWater }; });
      await t.up(11);
      r = { ...r, ...a };
    }
    await P.page.evaluate(() => window.__T.tick(20));
    const ov = await P.page.evaluate(overlapCheck);
    await shot(P, 'mobile_s16_r2');
    check(G, 's16 r2 (터치): 점프 버튼 → 물속 헤엄 (vy < 0)', mode === 'touch' && r.jump && r.minVy < 0 && r.inWater && !errsSince(P, e0).length, { ...r, errs: errsSince(P, e0) });
    check(G, 's16 r2 (터치): 기믹 게이지가 패드·일시정지와 겹치지 않음', ov.occ > 0 && ov.rows >= 1 && !ov.bad.length, ov);
  } catch (e) { check(G, 's16 r2 휴대폰 실행', false, e.stack); }
  await P?.close(); P = null;
  // s17 r2: 상승 기류
  try {
    P = await openPage('index.html?scene=stage&stage=s17&room=r2', { ready: 'stage', god: 'iframes', mobile: true });
    const e0 = P.errs.length;
    const cdp = await P.ctx.newCDPSession(P.page), t = new Touch(cdp, P.page);
    const mode = await touchOn(P, t);
    const r = await P.page.evaluate(() => {
      const T = window.__T, p = T.p();
      T.hero60(); T.tick(10);
      p.x = 8 * 48 + 24 - p.w / 2; p.y = 45 * 48; p.vx = 0; p.vy = 0;
      let minVy = 1e9, at = -1;
      for (let i = 0; i < 24; i++) { T.tick(1); if (p.vy < minVy) minVy = p.vy; if (at < 0 && p.vy < 0) at = i + 1; }
      T.tick(30);
      return { minVy: Math.round(minVy), at };
    });
    const ov = await P.page.evaluate(overlapCheck);
    await shot(P, 'mobile_s17_r2');
    check(G, 's17 r2 (터치): 상승 기류 → vy < 0', mode === 'touch' && r.at > 0 && !errsSince(P, e0).length, { mode, ...r, errs: errsSince(P, e0) });
    check(G, 's17 r2 (터치): 기믹 게이지 자리가 패드·일시정지와 겹치지 않음', ov.occ > 0 && !ov.bad.length, ov);
  } catch (e) { check(G, 's17 r2 휴대폰 실행', false, e.stack); }
  await P?.close(); P = null;
  // s16 보스방: 보스 바가 보이는 채로 물속 공기 게이지를 띄워 셋(게이지·보스 바·패드)이 겹치지 않는지 (§17-12 '보스 바')
  try {
    P = await openPage('index.html?scene=stage&stage=s16&room=boss', { ready: 'stage', god: 'full', mobile: true });
    const e0 = P.errs.length;
    const cdp = await P.ctx.newCDPSession(P.page), t = new Touch(cdp, P.page);
    const mode = await touchOn(P, t);
    await P.page.evaluate(() => {
      const T = window.__T, w = T.w(), p = T.p();
      T.hero60();
      // 키 입력을 보내면 입력 모드가 'kb' 로 바뀌어 HUD 가 키보드 배치를 쓴다 (멈춘 루프에서는 realTime 이 안 흘러 패드도 안 숨는다).
      // 터치 검사이므로 걷지 않고 입구 단(0–20열, 윗면 11줄)의 X 표시 너머로 옮겨 보스전을 연다 (world: p.x > arenaX + TILE)
      p.x = (w.arenaX ?? 16 * 48) + 2 * 48; p.y = 11 * 48 - p.h; p.vx = 0; p.vy = 0;
      T.until(() => !!w.boss, 5);
    });
    const real = await waitRealBoss(P);   // 늦게 받는 보스: 대역(PendingBoss)이 진짜 보스로 바뀔 때까지 (R1-REQ-451)
    const r = await P.page.evaluate(() => {
      const T = window.__T, w = T.w(), p = T.p();
      const fight = T.until(() => w.bossActive && !w.cutscene && T.top()?.name === 'stage' && T.g.fade.dir === 0, 40);
      const d = w.gimmickOf('deep');
      const X = 30 * 48, Y = 16 * 48 - p.h;   // 경기장 물(21–55열, 12–15줄) 바닥에 선다 — 머리가 물속
      T.pin = () => { p.x = X; p.y = Y; p.vx = 0; p.vy = 0; };
      T.tick(150);
      T.pin = null;
      return { boss: !!w.boss, fight, air: d ? Math.round(d.air) : null, under: !!d?.headUnder, modeAfter: T.input.mode };
    });
    const ov = await P.page.evaluate(overlapCheck);
    await shot(P, 'mobile_s16_boss');
    check(G, 's16 보스방 (터치): 보스 바가 보일 때 공기 게이지가 보스 바·패드·일시정지와 겹치지 않음',
      mode === 'touch' && real.done && r.modeAfter === 'touch' && r.fight && r.air < 100 && ov.boss && ov.rows >= 1 && ov.occ > 0 && !ov.bad.length && !errsSince(P, e0).length, { mode, real, ...r, ...ov, errs: errsSince(P, e0) });
  } catch (e) { check(G, 's16 보스방 휴대폰 실행', false, e.stack); }
  await P?.close(); P = null;
  // 지도: 탭을 눌러 지도 전환
  try {
    P = await openPage('index.html', { ready: 'title', god: false, mobile: true });
    const e0 = P.errs.length;
    const cdp = await P.ctx.newCDPSession(P.page), t = new Touch(cdp, P.page);
    await P.page.evaluate(async () => {
      const T = window.__T, g = T.g;
      const { newGameState } = await import('/src/game/state.js');
      const st = newGameState({ slot: 1 });
      const P = st.progress;
      P.unlocked = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 's13', 's14'];
      for (const s of P.unlocked.slice(0, 13)) P.cleared[s] = { rank: 'B', time: 1, score: 1 };
      Object.assign(P.flags, { p2_started: true, s14_revealed: true });
      g.state = st;
      g.go('hub', {}, { fade: false });
      T.until(() => T.top()?.name === 'hub' && g.fade.dir === 0, 10);
      T.tick(10);
      g.push('worldmap', { page: 0 });
      T.tick(10);
    });
    const pt = await tapPoint(P, 'tab1');
    if (pt) await t.tap(pt.x, pt.y, 50);
    const r = await stepUntil(P, async () => { const T = window.__T, wm = T.top(); await T.drawSealed(); T.tick(1); return { done: wm.page === 1, top: wm.name, page: wm.page, uiK: T.g.uiK, frames: T.frames }; });
    await P.page.evaluate(() => window.__T.tick(45));   // 45: 지도 교차 페이드가 끝난 뒤 스크린샷
    await shot(P, 'mobile_worldmap');
    check(G, '지도 (터치): tab1 을 눌러 2부 지도로', !!pt && r.top === 'worldmap' && r.page === 1 && !errsSince(P, e0).length, { ...r, tab1: pt?.z ? [pt.z.x, pt.z.y, pt.z.w, pt.z.h, pt.z.k] : null, errs: errsSince(P, e0) });
  } catch (e) { check(G, '지도 휴대폰 실행', false, e.stack); }
  await P?.close();
}

// ── 성능: s17 r1 · s20 r1, quality medium, world.update + world.render 평균 ≤ 10 ms (300 프레임) ──
async function perfGroup() {
  const G = 'perf';
  for (const [sid, rid] of [['s17', 'r1'], ['s20', 'r1']]) {
    let best = null, P = null;
    try {
      P = await openPage(`index.html?scene=stage&stage=${sid}&room=${rid}`, { ready: 'stage', god: 'full' });
      const e0 = P.errs.length;
      // 실제 시간 측정이라 다른 프로세스가 CPU 를 잠깐 차지하면 튄다 (부하 20 대 4코어에서 2.8 ms → 29 ms 관찰).
      // 최대 4번 재어 가장 좋은 값을 쓰고, 예산 안이면 바로 멈춘다 — 진짜 회귀는 네 번 모두 넘는다.
      const attempts = [];
      for (let attempt = 0; attempt < 4 && !(best && best.avg <= 10); attempt++) {
        const r = await P.page.evaluate(() => {
          const T = window.__T, g = T.g, w = T.w();
          g.settings.quality = 'medium'; g.resize?.();
          T.hero60(); T.drawEvery = 0;
          if (!w._qaWrapped) {
            w._qaWrapped = true; T.pf = { u: 0, r: 0 };
            const u0 = w.update, r0 = w.render;
            w.update = function (dt) { const t = performance.now(); try { return u0.call(this, dt); } finally { T.pf.u += performance.now() - t; } };
            w.render = function (ctx) { const t = performance.now(); try { return r0.call(this, ctx); } finally { T.pf.r += performance.now() - t; } };
          }
          T.hold('ArrowRight', 20);
          for (let i = 0; i < 60; i++) { T.tick(1); T.draw(); }
          T.pf.u = 0; T.pf.r = 0;
          for (let i = 0; i < 300; i++) { if (i % 40 === 0) T.tap('KeyX'); T.tick(1); T.draw(); }
          T.releaseAll();
          return { upd: T.pf.u / 300, ren: T.pf.r / 300, tier: g.tier, quality: w.qualityNow?.(), room: w.roomId };
        });
        r.avg = r.upd + r.ren;
        attempts.push(Math.round(r.avg * 100) / 100);
        if (!best || r.avg < best.avg) best = r;
      }
      const fix = (v) => Math.round(v * 100) / 100;
      check(G, `${sid} ${rid} (medium): world.update + world.render 평균 ≤ 10 ms`, best.avg <= 10 && !errsSince(P, e0).length, { avg: fix(best.avg), upd: fix(best.upd), ren: fix(best.ren), attempts, tier: best.tier, quality: best.quality, errs: errsSince(P, e0) });
      console.log(`  · ${sid} ${rid}: update ${fix(best.upd)} ms + render ${fix(best.ren)} ms = ${fix(best.avg)} ms (tier ${best.tier})`);
    } catch (e) { check(G, `${sid} 성능 실행`, false, e.stack); }
    await P?.close();
  }
}

// 실행 검사가 쓰는 데이터 (Node 에서 import)
let STAGES_REF = {}, BOSS_PAT = {}, MYTHIC_P2 = {}, CREDITS_P2_REF = [];
async function runtime() {
  const imp = (f) => import(path.join(ROOT, f));
  ({ STAGES: STAGES_REF } = await imp('src/data/stages.js'));
  ({ P2_PATTERNS: BOSS_PAT } = await imp('src/game/bosses/c_common.js'));
  ({ MYTHIC_WEAPONS_P2: MYTHIC_P2 } = await imp('src/data/items.js'));
  ({ CREDITS_P2: CREDITS_P2_REF } = await imp('src/data/story_p2.js'));
  await rtStart();
  const step = async (g, label, fn) => {
    if (!want(g)) return;
    console.log(`── ${label}`);
    const t = Date.now();
    try { await fn(); } catch (e) { check(g, label + ' 실행', false, e.stack); }
    console.log(`   (${Math.round((Date.now() - t) / 1000)}초)`);
  };
  try {
    await step('rooms', '4. 모든 방 스모크 (§4.3 기믹)', () => roomsGroup(STAGES_REF));
    await step('gimmicks', '5. 기믹', gimmicksGroup);
    if (['bosses', 'loot', 'clears'].some(want)) {
      console.log('── 6. 보스 · 11. 보스 전리품 · 클리어 흐름');
      const t = Date.now();
      try { await bossesGroup(); } catch (e) { check('bosses', '보스 실행', false, e.stack); }
      console.log(`   (${Math.round((Date.now() - t) / 1000)}초)`);
    }
    await step('flow', '7. 1부 진엔딩 → 2부 프롤로그 → 지도', flowGroup);
    await step('legacy', '8. 옛 세이브', legacyGroup);
    await step('endings', '9. 엔딩 (2부 두 갈래 + 1부 회귀)', endingsGroup);
    await step('items', '10. 아이템 · 의뢰 · 기술', itemsGroup);
    await step('mobile', '12. 휴대폰', mobileGroup);
    await step('perf', '성능', perfGroup);
  } finally { await rtStop(); }
}

// ═════════════════════════════ 실행 ═════════════════════════════
const t0 = Date.now();
if (want('static')) { console.log('── 정적 검사 (world2 §17-2)'); try { await staticChecks(); } catch (e) { check('static', '정적 검사 실행', false, e.stack); } }
if (!STATIC_ONLY && GROUPS.slice(1).some(want)) await runtime();
const bad = results.filter((r) => !r.ok);
const byGroup = {};
for (const r of results) { const g = (byGroup[r.group] ??= { ok: 0, bad: 0 }); r.ok ? g.ok++ : g.bad++; }
console.log('\n' + Object.entries(byGroup).map(([g, v]) => `${g} ${v.ok}/${v.ok + v.bad}`).join(' · ') + `  (${Math.round((Date.now() - t0) / 1000)}초)`);
// 고른 묶음이 검사를 하나도 돌리지 않았으면(예: --only loot --boss b_moloch) 통과로 치지 않는다 — integration.mjs --only 와 같은 규칙
const empty = (STATIC_ONLY ? ['static'] : ONLY ?? []).filter((g) => !byGroup[g]);
const none = !results.length || empty.length > 0;
if (bad.length) console.log(`✗ ${bad.length}개 실패`);
else if (!none) console.log(`✓ ${results.length}개 모두 통과`);
if (none) console.log(`✗ 고른 검사가 하나도 돌지 않음${empty.length ? ': ' + empty.join(', ') : ''} (--only · --boss 조합을 확인)`);
fs.mkdirSync('/tmp/claude-0/proto/wpj', { recursive: true });
fs.writeFileSync('/tmp/claude-0/proto/wpj/report.json', JSON.stringify(results, null, 1));
if (bad.length) process.exitCode = 1;
else if (none) process.exitCode = 2;
