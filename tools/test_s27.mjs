// 외전 Ⅱ s27 「돌아오지 못한 수문지기」 등록 시험 (docs/specs/ex_s27.md §8.1 — EX-STAGE).
//  Node: 스테이지 정의 · 방 6 · 보스 방 고체 = Johan.PATTERNS.room · 트리거/아이템/상자 id · 대본 12개(영웅 줄 7영웅 + default · ex_s27_done 이 첫 조건 앞 ·
//        화자 id · 줄 길이) · 보상(u_johan · l36 · st_s27 · 마을 대사 넷이 pickNpcScript 로 한 번씩) · 아케이드(코스 19 · 기기 기록 · 문 규칙 · 서바이벌) ·
//        악몽 nm_s27 · 군주 27 · 서버 표(gamedata.mts) · 등록 자리(세계 지도 · 성당 · 크레딧 · 발소리 · 전경 · 갤러리 · 하이스코어).
//  브라우저 (--static 이면 건너뜀): 9장 세이브 → 지도에 s27 없음 · 10장 세이브 → s26 → s27 해금 연출 · 1부 지도(page 0) 노드 · s08 에서 갈라지는 길.
// 사용: node tools/test_s27.mjs [--static]   (종료 코드 0 = 모두 통과)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = process.argv.includes('--static');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(`${ok ? '✓' : '✗'} ${name}${ok || info === undefined ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const { STAGES, STAGE_ORDER_P1, STAGE_ORDER_P2, SIDE_STAGES, SIDE_STAGES_P2, chapterLabel, stageTitle } = await import('../src/data/stages.js');
const { BOSSES } = await import('../src/data/bosses.js');
const { ITEMS } = await import('../src/data/items.js');
const { LORE, LORE_ORDER } = await import('../src/data/lore.js');
const { SCRIPTS, resolveNpcScript } = await import('../src/data/story.js');
const { CHARACTERS } = await import('../src/data/characters.js');
const { NPCS } = await import('../src/data/npcs.js');
const { CREDITS_EX } = await import('../src/data/story_ex.js');
const { ACHIEVEMENTS } = await import('../src/data/achievements.js');
const NMD = await import('../src/data/nightmare.js');
const COS = await import('../src/data/cosmetics.js');
const { Johan } = await import('../src/game/bosses/e_johan.js');
const { ENEMIES } = await import('../src/data/enemies.js');

// ── 1) 스테이지 정의 (W2) ──
const st = STAGES.s27;
const want = { id: 's27', chapter: 27, part: 1, page: 0, side: true, sideLabel: '외전 Ⅱ', name: '잠긴 수문', fullName: '돌아오지 못한 수문지기', theme: 'waterway', bg: 'bg/s08_waterway', tex: 'tex/tex_wet_stone', tex2: 'tex/tex_castle_stone', tileStyle: 'wet', music: 's08', level: 37, liquid: 'water', boss: 'b_johan', parTime: 420, gimmick: null, color: '#9ad0e0', next: null };
const bad1 = Object.entries(want).filter(([k, v]) => st?.[k] !== v).map(([k, v]) => `${k}: ${st?.[k]} ≠ ${v}`);
check('스테이지 정의 (W2 값 · side · part 1 · page 0 · 외전 Ⅱ · 레벨 37 · 8장 그림 · 보스 b_johan)', st && !bad1.length, bad1);
check(`chapterLabel(s27, 'ko') = 「외전 Ⅱ」 · stageTitle = 「돌아오지 못한 수문지기」`, chapterLabel(st, 'ko') === '외전 Ⅱ' && stageTitle(st) === '돌아오지 못한 수문지기', [chapterLabel(st, 'ko'), stageTitle(st)]);
check('STAGE_ORDER_P1 에 없음 · STAGE_ORDER_P2 끝 · SIDE_STAGES 끝 · SIDE_STAGES_P2 에 없음',
  !STAGE_ORDER_P1.includes('s27') && STAGE_ORDER_P2[STAGE_ORDER_P2.length - 1] === 's27' && SIDE_STAGES[SIDE_STAGES.length - 1] === 's27' && !SIDE_STAGES_P2.includes('s27'), { p2: STAGE_ORDER_P2.slice(-3), side: SIDE_STAGES });
check('이야기 사슬 밖 (어느 스테이지의 next 도 s27 이 아님)', !Object.values(STAGES).some((o) => o.next === 's27'));
check(`적 = 8장 여섯 + 얼음 박쥐 + 미믹 (모두 ENEMIES)`, (st.enemies ?? []).join() === 'merman,killer_fish,frog_demon,drowned,water_spirit,bat,ice_bat,mimic' && st.enemies.every((e) => ENEMIES[e]), st.enemies);
check(`대본 연결 intro/outro = s27_intro/s27_outro`, st.intro === 's27_intro' && st.outro === 's27_outro', [st.intro, st.outro]);

// ── 2) 방 6 · 보스 방 고체 = Johan.PATTERNS.room ──
const rooms = st.rooms ?? {};
check('방 6개 (r1 r2 r3 r4 r5 boss) · 크기 §1.1', Object.keys(rooms).join() === 'r1,r2,r3,r4,r5,boss'
  && [['r1', 96, 17], ['r2', 32, 46], ['r3', 72, 22], ['r4', 64, 24], ['r5', 96, 18], ['boss', 60, 18]].every(([r, w, h]) => rooms[r]?.map.length === h && rooms[r].map.every((row) => row.length === w)),
  Object.fromEntries(Object.entries(rooms).map(([k, r]) => [k, [r.map[0].length, r.map.length]])));
const solidSet = (map) => { const s = []; map.forEach((row, y) => [...row].forEach((c, x) => { if ('#%'.includes(c)) s.push(`${x},${y}`); })); return s; };
const R = Johan.PATTERNS.room, pat = new Set();
for (const [x0, y0, x1, y1] of R.solids) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pat.add(`${x},${y}`);
const oneway = (map) => { const s = []; map.forEach((row, y) => [...row].forEach((c, x) => { if (c === '=') s.push(`${x},${y}`); })); return s; };
const bossRoom = rooms.boss, walls = new Set(solidSet(bossRoom.map)), plats = new Set(oneway(bossRoom.map));
// PATTERNS.room.solids = 바닥(16–17행) + '=' 발판 (옆벽 '#' 0열 · 59열은 경기장 밖 — s26 과 같은 규칙)
const floorOk = [...pat].every((k) => walls.has(k) || plats.has(k)) && [...plats].every((k) => pat.has(k)) && [...walls].every((k) => pat.has(k) || /^(0|59),/.test(k));
check(`보스 방 고체 = Johan.PATTERNS.room (60×18 · x0 ${R.x0} · floorRow ${Johan.PATTERNS.floorRow})`, R.w === 60 && R.h === 18 && Johan.PATTERNS.floorRow === 16 && floorOk && bossRoom.bossId === 'b_johan' && bossRoom.boss === true && bossRoom.gimmick === null);
const s26boss = STAGES.s26.rooms.boss.map.map((r) => r.replace(/[^#%=|XPGT]/g, ' '));
check('보스 방 뼈대 = s26 보스 방 (문자 하나까지 같은 고체 · X · P)', JSON.stringify(bossRoom.map.map((r) => r.replace(/[^#%=|XPGT]/g, ' '))) === JSON.stringify(s26boss));
const trig = [], items = [], chests = [];
for (const [rid, r] of Object.entries(rooms)) { for (const t of r.triggers ?? []) trig.push([rid, t]); for (const i of r.items ?? []) items.push([rid, i]); for (const c of r.chests ?? []) chests.push([rid, c]); if (r.hiddenChest) items.push([rid, 'item:' + r.hiddenChest]); }
check('트리거 r3 s27_t1 · r5 s27_t2 (대본 있음)', JSON.stringify(trig) === JSON.stringify([['r3', 's27_t1'], ['r5', 's27_t2']]) && trig.every(([, t]) => SCRIPTS[t]), trig);
const idOk = (x) => { const [k, v] = x.includes(':') ? x.split(':') : ['item', x]; return k === 'lore' ? !!LORE[v] : k === 'item' ? !!ITEMS[v] : false; };
check(`배치 아이템 · 숨은 상자 id (${items.map(([r, i]) => r + ' ' + i).join(' · ')}) · 상자 등급`, items.length === 3 && items.every(([, i]) => idOk(i)) && chests.every(([, c]) => ['common', 'rare', 'epic'].includes(c)), { items, chests });
check(`r4 깊은 물 (room.liquid 'deep' + gimmick deep · 공기 방울 기둥 'u' ≥ 3)`, rooms.r4.liquid === 'deep' && rooms.r4.gimmick?.kind === 'deep' && rooms.r4.map.join('').split('u').length - 1 >= 3);
check(`'!' 열 = 평평한 단단한 바닥 (r3 · r5 10열)`, ['r3', 'r5'].every((rid) => { const m = rooms[rid].map, y = m.findIndex((row) => row[10] === '!'); return y > 0 && '#%'.includes(m[y + 1][10]) && m.slice(0, y).every((row, yy) => yy < 2 ? true : row[10] === ' '); }));

// ── 3) 대본 12개 ──
const IDS = ['s27_intro', 's27_t1', 's27_t2', 'b_johan_pre', 'b_johan_breach', 'b_johan_last', 'b_johan_post', 's27_outro', 'npc_marta_ex27', 'npc_hadwin_ex27', 'npc_elise_ex27', 'npc_alberto_ex27'];
check('대본 12개 모두 SCRIPTS 에 (story_p2.js 를 거쳐)', IDS.every((id) => Array.isArray(SCRIPTS[id]) && SCRIPTS[id].length), IDS.filter((id) => !SCRIPTS[id]));
const HEROES = ['kael', 'sera', 'victor', 'bran', 'lia', 'azel', 'isolde'];
const hBad = [], whoBad = [], lenBad = [], lbl = [];
const LIM = { hero: 79, npc: 86, narrator: 134 };
for (const id of IDS) {
  const labels = new Set(SCRIPTS[id].filter((l) => l?.label).map((l) => l.label));
  for (const l of SCRIPTS[id]) {
    if (l?.goto && !labels.has(l.goto)) lbl.push(`${id} goto ${l.goto}`);
    if (l?.cmd === 'goto' && !labels.has(l.label)) lbl.push(`${id} if-goto ${l.label}`);
    if (typeof l?.text === 'object' && l.text) {
      const miss = [...HEROES, 'default'].filter((h) => typeof l.text[h] !== 'string');
      if (miss.length) hBad.push(`${id}: ${miss}`);
      for (const t of Object.values(l.text)) if (t.length > LIM.hero) lenBad.push(`${id} hero ${t.length}`);
    } else if (typeof l?.text === 'string' && !l.cmd) {   // title(text, sub) 같은 명령 줄은 화자가 없다
      const w = l.who;
      if (!(w === 'narrator' || w === 'hero' || CHARACTERS[w] || NPCS[w] || BOSSES[w])) whoBad.push(`${id}: ${w}`);
      const lim = w === 'narrator' ? LIM.narrator : (w === 'hero' || CHARACTERS[w]) ? LIM.hero : LIM.npc;
      if (l.text.length > lim) lenBad.push(`${id} ${w} ${l.text.length}`);
    }
  }
}
check('영웅 줄 H({...}) 마다 7영웅 + default', !hBad.length, hBad);
check('화자 id 가 모두 있다 (영웅 · NPC · 보스 · 내레이션)', !whoBad.length, whoBad);
check('줄 길이 상한 (영웅 79 · NPC 86 · 내레이션 134자)', !lenBad.length, lenBad);
check('goto · ifChar · ifFlag 의 라벨이 모두 있다', !lbl.length, lbl);
const out = SCRIPTS.s27_outro, fi = out.findIndex((l) => l?.if), di = out.findIndex((l) => l?.cmd === 'flag' && l.key === 'ex_s27_done');
check('아웃트로: flag(ex_s27_done) 가 첫 조건 줄보다 앞 (results.js hasNewBranch)', di >= 0 && (fi < 0 || di < fi), { di, fi });
check('인트로: 제목 카드 title(외전 Ⅱ, 돌아오지 못한 수문지기)', SCRIPTS.s27_intro.some((l) => l?.cmd === 'title' && l.text === '외전 Ⅱ' && l.sub === '돌아오지 못한 수문지기'));
check('대본이 읽는 플래그 = p2_started · boss_b_dracula 뿐 (+ 영웅 분기 kael)', SCRIPTS && IDS.every((id) => SCRIPTS[id].every((l) => !l?.if || (typeof l.if === 'string' ? ['p2_started', '!p2_started', 'boss_b_dracula', '!boss_b_dracula'].includes(l.if) : l.if?.char === 'kael'))));
const sfx = new Set(SCRIPTS.s27_intro.concat(...IDS.map((id) => SCRIPTS[id])).filter((l) => l?.cmd === 'sfx').map((l) => l.id));
check(`효과음은 있는 이름만 (${[...sfx].join(' · ')})`, [...sfx].every((s) => ['splash', 'break_wall', 'clang', 'whip', 'whip_crack', 'slash_heavy', 'ice', 'dark', 'mist', 'warning', 'land', 'boss_roar', 'holy'].includes(s)));
check('크레딧 CREDITS_EX.s27 (제목 — 이름 두 칸 행)', Array.isArray(CREDITS_EX.s27) && CREDITS_EX.s27.length === 2 && CREDITS_EX.s27.every((r) => / — /.test(r)), CREDITS_EX.s27);

// ── 4) 보상 ──
const u = ITEMS.u_johan;
check('장신구 u_johan 「수문지기의 등불」 (acc · 5단계 · Lv 35 · boss b_johan · 아이콘 파일 · 효과 문구)', u && u.name === '수문지기의 등불' && u.slot === 'acc' && u.tier === 5 && u.lvReq === 35 && u.boss === 'b_johan' && u.unique
  && fs.existsSync(path.join(ROOT, `assets/icons/${u.icon}.png`)) && u.stats?.thunder === 10 && u.stats?.dmgReduce === 4 && /번개 피해 \+10%/.test(u.effect), u && { icon: u.icon, stats: u.stats });
check('보스 드롭 BOSSES.b_johan.drops = [u_johan] (EX-BOSS 데이터)', JSON.stringify(BOSSES.b_johan?.drops) === '["u_johan"]', BOSSES.b_johan?.drops);
check('로어 l36 (s27 · LORE_ORDER 끝 · r3 @)', LORE.l36?.stage === 's27' && LORE_ORDER[LORE_ORDER.length - 1] === 'l36' && rooms.r3.items?.includes('lore:l36'));
const ach = ACHIEVEMENTS.find((a) => a.id === 'st_s27'), ai = ACHIEVEMENTS.findIndex((a) => a.id === 'st_s27');
check('업적 st_s27 「이번엔 정말이오」 (st_s26 바로 뒤 · cleared s27 · 20점)', ach && ach.name === '이번엔 정말이오' && ACHIEVEMENTS[ai - 1]?.id === 'st_s26' && ach.cond?.m === 'cleared' && ach.cond.arg?.[0] === 's27' && ach.pts === 20, ach);
// 마을 대사 넷: 외전을 깬 세이브에서 각 NPC 의 다음 대화 = _ex27 (한 번) → 다음엔 평소 순환
const town = {};
for (const npc of ['npc_marta', 'npc_hadwin', 'npc_elise', 'npc_alberto']) {
  const mk = (p2) => ({ progress: { chapter: 10, flags: { ex_s27_done: true, ex_s26_done: true, ...(p2 ? { p2_started: true } : {}) }, seenScripts: [], npcTalks: {} } });
  const s1 = mk(false), a = resolveNpcScript(npc, s1), b = resolveNpcScript(npc, { ...s1 });
  town[npc] = [a, b];
}
check('마을 대사 넷이 pickNpcScript 로 한 번씩 (외전 Ⅱ 가 외전 Ⅰ 보다 먼저 · 두 번째는 아님)', Object.entries(town).every(([n, [a, b]]) => a === `${n}_ex27` && b !== a), town);
check('성당: albertoNews 표 · 안내 줄 (src 확인)', /\[\['ex27', 'ex_s27_done'\], \['ex26'/.test(src('src/scenes/town/church.js')) && /has\(P\.unlocked, 's27'\) && !P\.cleared\?\.s27/.test(src('src/scenes/town/church.js')));

// ── 5) 아케이드 ──
const A = await import('../src/scenes/front/arcade.js');
const C19 = A.COURSES[19];
check('코스 19 = 「외전 Ⅱ」 (S27_COURSE · 기기 기록 · 순위표 밖 · 보스 다섯)', C19 === A.S27_COURSE && C19.name === '외전 Ⅱ' && A.localCourse(19) && !A.visibleCourses(true, true).includes(19)
  && A.courseBosses(19).join() === 'b_leviathan,b_frostqueen,b_death,b_dracula,b_johan', { name: C19?.name, bosses: A.courseBosses(19) });
check('BOSS_ORDER 27번째(인덱스 26) = b_johan · 기존 코스 from/to 그대로', A.BOSS_ORDER.indexOf('b_johan') === 26 && A.BOSS_ORDER.length === 27 && A.COURSES.slice(0, 15).every((c) => c.to <= 25));
check('s27 모르는 세이브엔 코스 19 없음 · s27 만 알면 보임 (2부 몰라도) · s26 만 알면 19 없음 (예전 true = s26 만)',
  !A.menuCourses(false, false, false).includes(19) && A.menuCourses(false, false, new Set(['s27'])).includes(19) && !A.menuCourses(false, false, true).includes(19)
  && A.menuCourses(false, false, true).includes(18) && !A.menuCourses(false, false, new Set(['s27'])).includes(18) && A.menuCourses(false, false, ['s26', 's27']).filter((c) => c >= 18).join() === '18,19');
check('arenaBosses(false,false,true) 는 파라켈만 · Set(s26,s27) 은 둘 다 · Set(s27) 은 요한만',
  A.arenaBosses(false, false, true).filter((id) => A.P1_SIDE && Object.values(A.P1_SIDE).includes(id)).join() === 'b_paracel'
  && A.arenaBosses(false, false, new Set(['s26', 's27'])).filter((id) => Object.values(A.P1_SIDE).includes(id)).join() === 'b_paracel,b_johan'
  && A.arenaBosses(false, false, new Set(['s27'])).filter((id) => Object.values(A.P1_SIDE).includes(id)).join() === 'b_johan');
check('sanitizeCfg: 코스 19 는 s27 을 알 때만 (아니면 0)', A.sanitizeCfg({ kind: 'bossrush', course: 19 }, false, null, false, true).course === 0 && A.sanitizeCfg({ kind: 'bossrush', course: 19 }, false, null, false, new Set(['s27'])).course === 19);
check('p1SideKnown: 코나미 = 둘 · 지금 회차 s27 해금 = s27 · s26Known 은 s26 만', [...A.p1SideKnown({ meta: { konami: true } }, new Set())].join() === 's26,s27'
  && [...A.p1SideKnown({ meta: {}, state: { progress: { unlocked: ['s27'] } } }, new Set())].join() === 's27' && A.s26Known({ meta: {}, state: { progress: { unlocked: ['s27'] } } }, new Set()) === false
  && A.exKnown({ meta: {}, state: { progress: { unlocked: ['s27'] } } }, new Set()) === false);
check('하이스코어 ONLINE_PENDING 에 s27 (배포 전 순위표에서 뺀다)', /const ONLINE_PENDING = new Set\(\['s26', 's27'\]\)/.test(src('src/scenes/front/highscore.js')));

// ── 6) 악몽 · 군주 · 서버 표 · 그 밖의 등록 ──
const nm = NMD.NM.nm_s27;
check('악몽 nm_s27 (요한 · 종말의 시계 · 1부 배율 · 27개)', nm?.boss === 'b_johan' && nm.twist === 'doom_clock' && nm.atkMul === 1.08 && nm.spMul === 1.15 && NMD.NM_IDS.length === 27 && NMD.NM_IDS[26] === 'nm_s27', nm);
check('잔상 「군주」 need.nm = 27 · 「스물일곱 군주」', COS.TRAILS.tr_sovereign?.need?.nm === 27 && /스물일곱/.test(COS.TRAILS.tr_sovereign.desc));
const gd = await import('../netlify/lib/gamedata.mts');
check('서버 표 (gamedata.mts): 스테이지 27 · s27 레벨 37 · 외전 일곱 · P2_STAGES 끝', gd.STAGE_IDS.length === 27 && gd.STAGE_LEVELS.s27 === 37 && gd.SIDE_STAGES.length === 7 && gd.SIDE_STAGES[6] === 's27' && gd.P2_STAGES[gd.P2_STAGES.length - 1] === 's27' && !gd.DAILY_STAGE_IDS.includes('s27'));
const wm = src('src/scenes/town/worldmap.js');
check('세계 지도: SIDE_FROM.s27 = s08 · SIDE_GATE.s27 = 10장 클리어 · SIDE_INFO · REVEALS (src 확인)', /s26: 's07', s27: 's08' \}/.test(wm) && /s27: \(P\) => !!P\.cleared\?\.s10/.test(wm) && /s27: \{ label: '보상', flag: 'ex_s27_done'/.test(wm) && /s27: \{ title: '외전 Ⅱ · 잠긴 수문'/.test(wm));
check('발소리 · 전경 · 갤러리 (s27 = 8장 수로 · boss2 에 b_johan)', /s27: \{ liquid: 'water', dry: 'stone' \}/.test(src('src/data/feel_move.js')) && /s27: \{ theme: 'waterway' \}/.test(src('src/data/foreground.js')) && /'b_paracel', 'b_johan'\)\)/.test(src('src/data/gallery.js')));
const bal = src('tools/balance.mjs');
check('balance.mjs: P1_SIDE_AFTER.s27 = s11 · SIDE_P1.s27 (s11–s12 띠)', /s26: 's09', s27: 's11'/.test(bal) && /s27: \{ peers: \['s11', 's12'\]/.test(bal));

// ── 7) 브라우저: 세계 지도 문 (9장 · 10장 세이브) ──
if (!STATIC) {
  const { chromium } = await import('playwright-core');
  const { start } = await import('./serve.mjs');
  const port = 8000 + Math.floor(Math.random() * 900);
  const srv = await start(port);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${port}/index.html?scene=hub`);
  await page.waitForFunction(() => window.__game?.scenes?.length, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const open = async (n) => page.evaluate(async (n) => {
    const g = window.__game, { newGameState } = await import('/src/game/state.js');
    const st = newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' });
    for (let i = 1; i <= n; i++) st.progress.cleared['s' + String(i).padStart(2, '0')] = { rank: 'A', time: 300 };
    st.progress.unlocked = Array.from({ length: n + 1 }, (_, i) => 's' + String(i + 1).padStart(2, '0'));
    st.progress.chapter = n; g.state = st;
    g.go('worldmap', {}, { fade: false });
  }, n);
  const look = () => page.evaluate(() => {
    const g = window.__game, m = g.scenes.find((s) => s.name === 'worldmap');
    if (!m) return null;
    const p0 = m.pages?.[0];
    const link = (p0?.links ?? []).find((l) => l.b?.id === 's27');
    return { reveal: m.reveal?.id ?? null, queue: (m.reveals ?? []).map((r) => r.id), nodes0: (p0?.nodes ?? []).map((n) => n.id), nodes1: (m.pages?.[1]?.nodes ?? []).map((n) => n.id), from: link?.a?.id ?? null, unl: g.state.progress.unlocked.includes('s27'), rev: !!g.state.progress.flags.s27_revealed };
  });
  await open(9); await page.waitForTimeout(1200);
  const a = await look();
  check('9장 세이브: 지도에 s27 없음 (해금 · 연출 없음 — s26 은 있다)', a && !a.nodes0.includes('s27') && !a.unl && a.reveal !== 's27' && !a.queue.includes('s27') && a.nodes0.includes('s26'), a);
  await open(10); await page.waitForTimeout(400);
  const order = [];
  let b = null;
  for (let i = 0; i < 60; i++) { b = await look(); if (b?.reveal && order[order.length - 1] !== b.reveal) order.push(b.reveal); if (order.includes('s27') && !b?.reveal) break; await page.waitForTimeout(250); }
  check('10장 세이브: s26 → s27 해금 연출 차례로 · 1부 지도(page 0) 노드 · s08 에서 갈라지는 길 · s27_revealed', order.join('>') === 's26>s27' && b.nodes0.includes('s27') && !b.nodes1.includes('s27') && b.from === 's08' && b.unl && b.rev, { order, ...b });
  check('페이지 오류 0', !errs.length, errs.slice(0, 5));
  await browser.close();
  srv.close?.();
}

const fails = results.filter((r) => !r.ok);
console.log(`\ntest_s27: ${results.length - fails.length}/${results.length} 통과${fails.length ? ` · ✗ ${fails.length}` : ''}`);
process.exit(fails.length ? 1 : 0);
