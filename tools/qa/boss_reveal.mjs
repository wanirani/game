// 「보스는 사건이다」 보스 등장·격파 연출 검사 — owner: S5 P4a (plan §5 P4 acceptance 1·2·3·6)
//
//   node tools/qa/boss_reveal.mjs [--device fold_open] [--bosses b_nightwing,b_frostqueen,…] [--out DIR]
//        [--shots] [--video] [--perf [--rounds N]] [--quick] [--quality high|medium|low]
//
// 검사 (보스마다 새 페이지 · lib/step.mjs freeze 로 1/60초씩 진행 — 부하가 큰 기계에서도 같은 결과):
//   data.rows        이야기 보스(스테이지 s01–s25 의 보스 + bosses/lazy.js BOSS_IDS) 모두 data/boss_intro.js 행이 있다 · 모르는 id 는
//                    가족 기본값으로 (예외 없음) · 행 값이 올바른 방식·속성
//   data.finale      world.onBossDefeated 에 'fire' 를 박아 넣은 폭발이 없다 (grep) · BossFinale 이 BI.elementOf 를 쓴다
//   <boss>.hold      등장 연출 동안 보스 think() 0회 · 적 편 판정/탄 새로 0개 · 영웅 피해 0 (보스와 겹쳐 세워 둔다) — K3
//   <boss>.time      장면 시작 → 싸움 시작 ≤ REVEAL.total(3.2초) · 첫 대면은 카드(card), 레터박스·보스 변형이 실제로 일어났다
//   <boss>.skip      0.5초의 결정 입력은 무시 · 0.8초의 결정 입력 → 2프레임 안에 싸움 (--quick 이면 앞의 두 보스만)
//   again.plate      처치한 적이 있는 보스(다시 만남): 등장 연출 + 이름판(plate), 카드 아님
//   retry.plate      보스방 입구 재도전 ([retryart] world.retryAtBossDoor): bossIntro.short · 이름판만 · 등장 연출·레터박스 없음 · 싸움 ≤ 1.2초
//   lazy.timeout     보스 모듈 응답을 2초 붙잡는다 (page.route): 대역(PendingBoss) → 1.5초에 이름판 · 전체 ≤ 3.2초 · 그 뒤 진짜 보스
//   nightmare.plate  world.opts.nightmare (K2): 등장 연출 없이 이름판만 · 진홍판(PLATE_NIGHTMARE)
//   <boss>.finale    격파: 연출 속성 = boss_intro 속성 · 낙관·빛기둥 화면 층 · ULTFX 임팩트 프레임 +1 · STAGE CLEAR 배너 그대로
//   perf.*           (--perf) 같은 페이지·기기에서 프레임 시간(갱신+그리기, 실제 시계) p95: 등장 연출·격파 연출 ≤ 필살기 컷인(카엘 궁극기)
//                    번갈아 N 라운드(기본 3, --quick 1) 재고 라운드별 p95 의 중앙값끼리 비교
// 산출물 (--shots): DIR/<boss>_b1|b2|b3.png (레터박스·변형·이름판) · DIR/retry_plate.png · DIR/nightmare_plate.png · DIR/again_plate.png
//         (--video): DIR/frames_<boss>/f*.png (30 fps) → DIR/<boss>_entrance.mp4 · DIR/<boss>_finale.mp4 (ffmpeg 이 있으면)
// 종료 코드: 0 = 모두 통과, 1 = 실패가 있음
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openEnv } from './lib/server.mjs';
import { freeze, step } from './lib/step.mjs';
import { waitBakes, idleFlush } from './lib/rooms.mjs';
import { stats } from './lib/perfprobe.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';
import { ROOT } from './lib/server.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const DEVICE = String(opt('device', 'fold_open'));
if (!VIEWPORTS[DEVICE]) { console.error(`--device: 모르는 기기 '${DEVICE}'`); process.exit(2); }
const OUT = String(opt('out', '/tmp/claude-0/qa/boss_reveal'));
const SHOTS = !!opt('shots', false), VIDEO = !!opt('video', false), PERF = !!opt('perf', false), QUICK = !!opt('quick', false);
// 화질: --perf 의 프레임 시간은 폴드 기본 등급(medium, perf_budget 의 fold 프로필과 같음)으로 잰다. 다른 검사는 기기 기본값
const QUALITY = opt('quality', null);
const STAGE_OF = { b_nightwing: 's01', b_banshee: 's02', b_dullahan: 's03', b_crimson: 's04', b_bonedragon: 's05', b_grimoire: 's06', b_chimera: 's07', b_leviathan: 's08', b_colossus: 's09', b_frostqueen: 's10', b_death: 's11', b_dracula: 's12', b_chaos: 's13', b_narkissa: 's14', b_moloch: 's15', b_dagon: 's16', b_ziz: 's17', b_mara: 's18', b_behemoth: 's19', b_nihil: 's20', b_argen: 's21', b_nemain: 's22', b_hagen: 's23', b_bride: 's24', b_charon: 's25' };
const DEFAULT_BOSSES = ['b_nightwing', 'b_frostqueen', 'b_dagon', 'b_dullahan', 'b_dracula', 'b_charon'];   // plan §5 P4 acceptance 1
const BOSSES_RUN = String(opt('bosses', DEFAULT_BOSSES.join(','))).split(',').map((s) => s.trim()).filter(Boolean);
for (const b of BOSSES_RUN) if (!STAGE_OF[b]) { console.error(`--bosses: 모르는 보스 '${b}'`); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const add = (id, ok, detail) => { results.push({ id, ok: !!ok, detail }); console.log(`${ok ? '✓' : '✗'} ${id} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };

// ─────────────────────────── 1. 데이터 (node) ───────────────────────────
{
  const BI = await import(path.join(ROOT, 'src/data/boss_intro.js'));
  const { BOSSES } = await import(path.join(ROOT, 'src/data/bosses.js'));
  const { STAGES } = await import(path.join(ROOT, 'src/data/stages.js'));
  const story = new Set();
  for (const s of Object.values(STAGES)) {
    const n = Number(/^s(\d+)$/.exec(s?.id ?? '')?.[1]);
    if (!(n >= 1 && n <= 25)) continue;
    if (s.boss) story.add(s.boss);
    for (const r of Object.values(s.rooms ?? {})) if (r?.bossId) story.add(r.bossId);
  }
  for (const id of Object.keys(STAGE_OF)) story.add(id);
  const missing = [...story].filter((id) => !Object.prototype.hasOwnProperty.call(BI.BOSS_INTRO, id));
  const bad = [];
  for (const [id, r] of Object.entries(BI.BOSS_INTRO)) {
    if (!BI.INTRO_STYLES.includes(r.style)) bad.push(`${id}.style=${r.style}`);
    if (!BI.ELEMENTS[r.element]) bad.push(`${id}.element=${r.element}`);
    if (!/^#[0-9a-f]{6}$/i.test(r.plateColor)) bad.push(`${id}.plateColor`);
    if (!(r.dur > 0 && r.dur <= 1.4)) bad.push(`${id}.dur`);
  }
  add('data.rows', !missing.length && !bad.length && story.size >= 25, { storyBosses: story.size, rows: Object.keys(BI.BOSS_INTRO).length, missing, bad });
  // 등록된 보스 중 표에 없는 것 (다른 작업이 새로 더한 보스): 가족 기본값으로 — 실패가 아니라 알림
  const extra = Object.keys(BOSSES).filter((id) => !Object.prototype.hasOwnProperty.call(BI.BOSS_INTRO, id));
  let threw = null, fb = null;
  try {
    fb = [BI.introOf('b_does_not_exist'), BI.introOf('b_x', { stageId: 's19' }), BI.introOf(undefined), BI.introOf(null, null), BI.elementOf('zzz'), ...extra.map((id) => BI.introOf(id, BOSSES[id]))];
  } catch (e) { threw = e.message; }
  const fbOk = !threw && fb && BI.introOf('b_does_not_exist') === BI.FAMILY.A && BI.introOf('b_x', { stageId: 's19' }) === BI.FAMILY.D && BI.elementOf('zzz') === BI.ELEMENTS.blood;
  add('data.fallback', fbOk, { threw, unlistedRegistered: extra, familyOf_s19: BI.familyOf('b_x', { stageId: 's19' }), total: BI.REVEAL.total, skipAfter: BI.REVEAL.skipAfter, card: BI.REVEAL.card });
  // 격파: onBossDefeated 안에 'fire' 를 박은 폭발이 없다
  const src = fs.readFileSync(path.join(ROOT, 'src/game/world.js'), 'utf8');
  const i0 = src.indexOf('  onBossDefeated(boss) {'), i1 = src.indexOf('\n  }\n', i0);
  const body = i0 >= 0 && i1 > i0 ? src.slice(i0, i1) : '';
  const fin0 = src.indexOf('class BossFinale'), fin1 = src.indexOf('\n}\n', fin0);
  const fin = fin0 >= 0 ? src.slice(fin0, fin1) : '';
  const fireHard = /burst\(\s*['"]fire['"]/.test(body) || /burst\(\s*['"]fire['"]/.test(fin);
  add('data.finale', !!body && !fireHard && /new BossFinale\(/.test(body) && /BI\.elementOf\(/.test(fin) && /ULTFX\.final\(/.test(fin), { onBossDefeatedFound: !!body, hardCodedFire: fireHard, usesElement: /BI\.elementOf\(/.test(fin) });
}

// ─────────────────────────── 2. 브라우저 ───────────────────────────
const env = await openEnv();
const SESS = [];   // [boss, Session] — 끝에 페이지 오류를 모은다
const FPS = 60, DT = 1 / FPS;
const TOTAL = 3.2;

/** 보스방 열고 · 멈추고 · 경기장 앞까지 (아직 들어가지 않는다) */
async function openRoom(boss, { url = null, route = null, quality = QUALITY } = {}) {
  const st = STAGE_OF[boss];
  const s = await env.page(DEVICE, null, quality ? { settings: { quality: String(quality) } } : {});
  SESS.push([boss, s]);
  if (route) await route(s.page);
  await s.goto(url ?? `index.html?scene=stage&stage=${st}&room=boss`);
  await s.waitGame('g.world && g.world.player && g.top && g.top.name === "stage"', 60000);
  await freeze(s.page);
  await step(s.page, 20, true);
  if (!route) await waitBakes(s);
  await idleFlush(s, 300);
  return s;
}
/** 경기장 세 칸 앞에 세우고 (스테이지 배너가 사라지고 카메라가 따라오도록 3.3초) → 오른쪽으로 걸어 들어간다
 *  → (사전 대사는 Enter 로 넘긴다) → bossIntro 가 맨 위가 될 때까지. → 걸린 스텝 (-1 = 열리지 않음) */
async function enterArena(s, maxSteps = 900) {
  await s.eval(() => {
    const w = window.__game.world, p = w.player;
    p.buffs.invincible = 9999; p.iframes = 0;
    if (w.arenaX !== undefined) { p.x = w.arenaX - 48 * 3; p.vx = 0; }
  });
  await step(s.page, 200, false);
  await s.page.keyboard.down('ArrowRight');
  let n = -1;
  for (let i = 0; i < maxSteps; i++) {
    const top = await s.eval(() => window.__game.top?.name);
    if (top === 'bossIntro') { n = i; break; }
    if (top === 'dialogue') { await s.page.keyboard.up('ArrowRight'); await s.page.keyboard.down('Enter'); await step(s.page, 2, false); await s.page.keyboard.up('Enter'); await step(s.page, 2, false); continue; }
    await step(s.page, 1, false);
  }
  await s.page.keyboard.up('ArrowRight');
  await s.eval(() => { const p = window.__game.world.player; p.buffs.invincible = 0; });
  return n;
}
/** 페이지 안 계측 설치: 보스 think 횟수, 적 편 개체 새로 생김, 영웅 체력 */
const installProbe = (s, { overlap = true } = {}) => s.eval(({ overlap }) => {
  const g = window.__game, w = g.world, p = w.player;
  const P = window.__p4a = { think: 0, spawned: 0, hp0: p.hp, dmg0: w.run.damageTaken ?? 0, seen: new Set(), t0: g.top?.t ?? 0, frames: 0 };
  for (const e of w.entities) P.seen.add(e);
  P.wrap = () => {
    const b = w.boss;
    if (b && !b.__p4aWrapped) {
      b.__p4aWrapped = true;
      const f = b.think;
      b.think = function (...a) { if (w.cutscene) P.think++; return f ? f.apply(this, a) : undefined; };
    }
    for (const e of w.entities) if (!P.seen.has(e)) { P.seen.add(e); if (e.team === 'enemy' && (e.kind === 'projectile' || e.kind === 'hitbox')) P.spawned++; }
  };
  if (overlap && w.boss) { p.x = (w.boss.x + w.boss.w / 2) - p.w / 2; p.vx = 0; }
  P.wrap();
}, { overlap });
/** 한 프레임 (계측 갱신 포함) → 상태 */
const tick = (s, render = false) => s.eval((render) => {
  const g = window.__game, w = g.world, P = window.__p4a;
  window.__qaStep(1, render);
  P?.wrap?.();
  if (P) P.frames++;
  const top = g.top, rv = w.reveal;
  return {
    top: top?.name, t: top?.t ?? null, mode: top?.name === 'bossIntro' ? top.mode : null, short: top?.name === 'bossIntro' ? !!top.short : null,
    pt: top?.name === 'bossIntro' ? top.pt : null, cut: !!w.cutscene, active: !!w.bossActive, lb: w.letterbox || 0, hud: !!w.hudHidden,
    rv: rv ? { t: rv.t, tStart: rv.tStart, tLand: rv.tLand, plateAt: rv.plateAt, dur: rv.dur, timedOut: rv.timedOut, done: rv.done, on: rv.xf.on, a: rv.xf.a, dy: rv.xf.dy, sx: rv.xf.sx } : null,
    pend: !!w.boss?.pendingBoss, bossId: w.boss?.def?.id ?? null, plate: top?.name === 'bossIntro' ? top.plateColor : null, nm: top?.name === 'bossIntro' ? !!top.nightmare : null,
  };
}, render);
const probeResult = (s) => s.eval(() => { const w = window.__game.world, P = window.__p4a, p = w.player; return { think: P.think, spawned: P.spawned, hpLoss: P.hp0 - p.hp, dmg: (w.run.damageTaken ?? 0) - P.dmg0, frames: P.frames }; });
async function shot(s, file) { await s.screenshot(path.join(OUT, file)); }
async function frame(s, dir, n) { await s.screenshot(path.join(dir, `f${String(n).padStart(4, '0')}.png`)); }
function mp4(dir, file, fps = 30) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%04d.png'), '-vf', 'scale=1000:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', path.join(OUT, file)], { encoding: 'utf8' });
  return r.status === 0 ? path.join(OUT, file) : `ffmpeg failed: ${r.stderr}`;
}

/** 이야기 모드 등장 연출 한 번: 장면 시작부터 싸움까지 프레임 단위로 → 기록 */
async function runReveal(s, boss, { shots = false, video = false, skipAt = null, earlyPress = null, perf = false } = {}) {
  const n0 = await enterArena(s);
  if (n0 < 0) return { err: 'bossIntro 가 열리지 않음' };
  await installProbe(s);
  const rec = [], beats = {};
  const vdir = video ? path.join(OUT, `frames_${boss}`) : null;
  if (vdir) { fs.rmSync(vdir, { recursive: true, force: true }); fs.mkdirSync(vdir, { recursive: true }); }
  let vf = 0, last = null, pressed = false, early = false, perfMs = [];
  for (let i = 0; i < 60 * 5; i++) {
    const tNow = i * DT;
    // 결정 입력 (건너뛰기 시험)
    if (earlyPress != null && !early && tNow >= earlyPress) { early = true; await s.page.keyboard.down('KeyZ'); await tick(s); await s.page.keyboard.up('KeyZ'); }
    if (skipAt != null && !pressed && tNow >= skipAt) { pressed = { at: last?.t ?? tNow, frame: i }; await s.page.keyboard.down('KeyZ'); }
    const wantShot = shots && last && ((!beats.b1 && last.t >= 0.55) || (!beats.b2 && last.rv?.tStart != null && last.rv.t >= last.rv.tStart + Math.max(0.12, last.rv.dur * 0.55)) || (!beats.b3 && last.pt >= 0.5));
    const render = !!(wantShot || (video && i % 2 === 0));
    let st;
    if (perf) {
      const m = await s.eval(() => { const g = window.__game, now = g.__qaRealNow; const t0 = now(); window.__qaStep(1, false); const t1 = now(); try { g.input?.beginRender?.(); g.__qaRender.call(g); g.input?.endRender?.(); } catch (e) { console.error(e); } const t2 = now(); window.__p4a?.wrap?.(); return { upd: t1 - t0, ren: t2 - t1 }; });
      perfMs.push(m.upd + m.ren);
      st = await s.eval(() => { const g = window.__game, w = g.world, top = g.top; return { top: top?.name, t: top?.t ?? null, pt: top?.name === 'bossIntro' ? top.pt : null, cut: !!w.cutscene, active: !!w.bossActive, rv: w.reveal ? { t: w.reveal.t, tStart: w.reveal.tStart, dur: w.reveal.dur } : null, lb: w.letterbox || 0 }; });
    } else st = await tick(s, render);
    if (pressed && i === pressed.frame) await s.page.keyboard.up('KeyZ');
    rec.push(st);
    if (wantShot) {
      const k = !beats.b1 && st.t >= 0.55 ? 'b1' : !beats.b2 && st.rv?.tStart != null ? 'b2' : 'b3';
      if (!beats[k]) { beats[k] = st.t; await shot(s, `${boss}_${k}.png`); }
    }
    if (vdir && i % 2 === 0) await frame(s, vdir, vf++);
    last = st;
    if (st.top === 'stage' && !st.cut && st.active) break;
  }
  // 싸움 시작 뒤 1초 더 (영상)
  if (vdir) for (let i = 0; i < 60; i++) { await tick(s, i % 2 === 0); if (i % 2 === 0) await frame(s, vdir, vf++); }
  const end = rec.findIndex((r) => r.top === 'stage' && !r.cut && r.active);
  const intro = rec.filter((r) => r.top === 'bossIntro');
  const res = await probeResult(s);
  return {
    n0, rec, beats, perfMs, vdir, frames: vf, pressFrame: pressed ? pressed.frame : null, pressT: pressed ? pressed.at : null,
    total: end >= 0 ? (end + 1) * DT : null,
    mode: intro.find((r) => r.mode)?.mode ?? null,
    lbMax: Math.max(0, ...rec.map((r) => r.lb)),
    transformed: rec.some((r) => r.rv && r.rv.tStart != null && r.rv.on && (r.rv.a < 0.99 || Math.abs(r.rv.dy) > 1 || Math.abs(r.rv.sx - 1) > 0.01)),
    landed: rec.some((r) => r.rv?.tLand != null),
    plateSeen: rec.some((r) => r.pt != null && r.pt >= 0),
    timedOut: rec.some((r) => r.rv?.timedOut),
    pendSeen: rec.some((r) => r.pend),
    probe: res,
  };
}

/** 보스를 쓰러뜨린다 (실제 피격 경로) → 격파 연출 프레임 */
async function runFinale(s, boss, { video = false, perf = false } = {}) {
  const before = await s.eval(() => (window.__ultfxStats0 = null, null));
  void before;
  const k = await s.eval(async () => {
    const g = window.__game, w = g.world, b = w.boss;
    const U = await import('/src/render/ultfx.js');
    window.__impact0 = U.ULTFX_STATS.impactFrames ?? 0;
    if (!b || b.pendingBoss) return { err: 'no boss' };
    w.player.buffs.invincible = 9999;
    b.invuln = false;
    let n = 0;
    for (let i = 0; i < 40 && !w.cleared; i++) { b.hp = Math.min(b.hp, 1); b.invuln = false; b.takeHit?.(99999, { team: 'player', tags: ['test'], dir: 1, kb: [0, 0], stats: w.player.stats, mv: 1 }, w, {}); n++; if (!w.cleared) window.__qaStep(1, false); }
    if (!w.cleared && w.boss) w.onBossDefeated(w.boss);
    return { tries: n, cleared: !!w.cleared, fin: !!w.finale, el: w.finale?.el?.color ?? null, banner: w.banner?.text ?? null };
  });
  const vdir = video ? path.join(OUT, `frames_${boss}_finale`) : null;
  if (vdir) { fs.rmSync(vdir, { recursive: true, force: true }); fs.mkdirSync(vdir, { recursive: true }); }
  let vf = 0, sealSeen = false, pillarSeen = false, perfMs = [];
  for (let i = 0; i < 60 * 3.4; i++) {
    let st;
    if (perf) {
      const m = await s.eval(() => { const g = window.__game, now = g.__qaRealNow; const t0 = now(); window.__qaStep(1, false); const t1 = now(); try { g.input?.beginRender?.(); g.__qaRender.call(g); g.input?.endRender?.(); } catch (e) { console.error(e); } return { upd: t1 - t0, ren: now() - t1 }; });
      perfMs.push(m.upd + m.ren);
    }
    st = await s.eval((render) => { const g = window.__game, w = g.world; if (render) { try { g.__qaRender.call(g); } catch { /* */ } } const seal = w.overlays.find((o) => o.kind === 'bossSeal'); return { fin: !!w.finale, top: g.top?.name, seal: !!seal, sealWord: seal?.word ?? null, pillar: w.overlays.some((o) => o.kind === 'bossPillar') }; }, !perf && video && i % 2 === 0);
    if (!perf) await s.eval(() => window.__qaStep(1, false));
    if (st.seal) sealSeen = st.sealWord || sealSeen || true;
    if (st.pillar) pillarSeen = true;
    if (vdir && i % 2 === 0) await frame(s, vdir, vf++);
    if (st.top !== 'stage') break;
  }
  const after = await s.eval(async () => { const U = await import('/src/render/ultfx.js'); return { impacts: (U.ULTFX_STATS.impactFrames ?? 0) - (window.__impact0 ?? 0) }; });
  return { ...k, sealSeen, pillarSeen, impacts: after.impacts, vdir, frames: vf, perfMs };
}

const BI = await import(path.join(ROOT, 'src/data/boss_intro.js'));
const perfRows = [];
let idx = 0;
for (const boss of BOSSES_RUN) {
  const first = idx++ === 0;
  let s;
  try {
    s = await openRoom(boss);
    const doVideo = VIDEO && (boss === 'b_nightwing');
    const r = await runReveal(s, boss, { shots: SHOTS, video: doVideo, perf: false });
    if (r.err) { add(`${boss}.hold`, false, r.err); await s.close(); continue; }
    add(`${boss}.hold`, r.probe.think === 0 && r.probe.spawned === 0 && r.probe.hpLoss <= 0 && r.probe.dmg <= 0, { think: r.probe.think, spawnedEnemyHitboxes: r.probe.spawned, hpLoss: r.probe.hpLoss, damageTaken: r.probe.dmg });
    add(`${boss}.time`, r.total != null && r.total <= TOTAL + DT + 1e-6 && r.mode === 'card' && r.lbMax > 4 && r.transformed && r.landed && r.plateSeen, { total: r.total && +r.total.toFixed(3), mode: r.mode, letterbox: +r.lbMax.toFixed(1), transformed: r.transformed, landed: r.landed, plate: r.plateSeen, style: BI.introOf(boss).style });
    if (doVideo && r.frames) add(`${boss}.video`, true, mp4(r.vdir, `${boss.replace('b_', '')}_entrance.mp4`));
    // 격파 (Dagon = 물 속성 영상 · 나머지는 검사만)
    const fv = VIDEO && boss === 'b_dagon';
    const f = await runFinale(s, boss, { video: fv });
    const elWant = BI.elementOf(boss).color;
    add(`${boss}.finale`, f.cleared && f.fin && f.el === elWant && f.sealSeen && f.pillarSeen && f.impacts >= 1 && f.banner === 'STAGE CLEAR', { element: BI.introOf(boss).element, color: f.el, want: elWant, seal: f.sealSeen, pillar: f.pillarSeen, impactFrames: f.impacts, banner: f.banner });
    if (fv && f.frames) add(`${boss}.finaleVideo`, true, mp4(f.vdir, `${boss.replace('b_', '')}_finale.mp4`));
    await s.close();
    // 건너뛰기 (앞의 두 보스, --quick 이면 첫 보스만)
    if (idx <= (QUICK ? 1 : 2)) {
      const s2 = await openRoom(boss);
      const r2 = await runReveal(s2, boss, { earlyPress: 0.5, skipAt: 0.8 });
      const pressF = r2.pressFrame ?? -1;
      const fightAt = r2.rec.findIndex((x) => x.top === 'stage' && !x.cut && x.active);
      const earlyKilled = r2.rec.some((x, i) => i < pressF && x.top === 'stage' && !x.cut);
      const sceneT = pressF > 0 ? r2.rec[pressF - 1]?.t : null;   // 누른 프레임 직전의 장면 시각
      add(`${boss}.skip`, pressF > 0 && !earlyKilled && fightAt >= 0 && fightAt - pressF <= 2 && sceneT >= 0.8 - DT - 1e-6 && r2.total >= 0.8 && r2.probe.think === 0,
        { pressAtFrame: pressF, sceneTimeAtPress: sceneT != null ? +(sceneT + DT).toFixed(3) : null, fightAtFrame: fightAt, total: r2.total && +r2.total.toFixed(3), earlyPressAt05Ignored: !earlyKilled });
      await s2.close();
    }
    if (first) {
      // 다시 만남: 처치 기록이 있으면 등장 연출 + 이름판
      const s3 = await openRoom(boss);
      await s3.eval((id) => { const st = window.__game.state; st.progress.bosses.push(id); }, boss);
      const r3 = await runReveal(s3, boss, { shots: false });
      if (SHOTS) {
        // 이름판이 보이는 프레임을 다시 한 번: 같은 방을 새로
        const s3b = await openRoom(boss);
        await s3b.eval((id) => { window.__game.state.progress.bosses.push(id); }, boss);
        await enterArena(s3b); await installProbe(s3b, { overlap: false });
        for (let i = 0; i < 300; i++) { const st = await tick(s3b); if (st.pt >= 0.5) { await step(s3b.page, 1, true); await shot(s3b, 'again_plate.png'); break; } }
        await s3b.close();
      }
      add('again.plate', r3.mode === 'plate' && r3.transformed && r3.total <= TOTAL + DT + 1e-6, { mode: r3.mode, total: r3.total && +r3.total.toFixed(3), transformed: r3.transformed });
      await s3.close();
      // 보스방 입구 재도전 ([retryart]): 싸움 시작 → 재도전 → 다시 걸어 들어가기
      const s4 = await openRoom(boss);
      await runReveal(s4, boss, {});
      const ok = await s4.eval(() => { const w = window.__game.world; return w.retryAtBossDoor(); });
      await step(s4.page, 3, false);
      const n4 = await enterArena(s4);
      await installProbe(s4);
      const rec4 = [];
      let shotDone = false;
      for (let i = 0; i < 240; i++) {
        const st = await tick(s4);
        rec4.push(st);
        if (SHOTS && !shotDone && st.pt >= 0.45) { shotDone = true; await s4.wait(450); await s4.eval(() => { const g = window.__game; g.__qaRender.call(g); }); await shot(s4, 'retry_plate.png'); }
        if (st.top === 'stage' && !st.cut && st.active) break;
      }
      const end4 = rec4.findIndex((r) => r.top === 'stage' && !r.cut && r.active);
      const intro4 = rec4.filter((r) => r.top === 'bossIntro');
      const p4 = await probeResult(s4);
      add('retry.plate', ok && n4 >= 0 && intro4.length > 0 && intro4.every((r) => r.short === true && r.mode === 'plate' && !r.rv && r.lb === 0) && end4 >= 0 && (end4 + 1) * DT <= BI.REVEAL.card + 2 * DT && p4.think === 0,
        { retried: ok, short: intro4[0]?.short, mode: intro4[0]?.mode, reveal: !!intro4.find((r) => r.rv), letterbox: Math.max(0, ...intro4.map((r) => r.lb)), fightAfter: end4 >= 0 ? +((end4 + 1) * DT).toFixed(3) : null, think: p4.think });
      await s4.close();
      // 악몽 (K2): world.opts.nightmare → 이름판만, 진홍판
      const s5 = await openRoom(boss);
      await s5.eval(() => { window.__game.world.opts.nightmare = { id: 'qa', twist: 'qa' }; });
      await enterArena(s5); await installProbe(s5, { overlap: false });
      const rec5 = []; let nmShot = false;
      for (let i = 0; i < 240; i++) {
        const st = await tick(s5);
        rec5.push(st);
        if (SHOTS && !nmShot && st.pt >= 0.5) { nmShot = true; await s5.wait(450); await s5.eval(() => { const g = window.__game; g.__qaRender.call(g); }); await shot(s5, 'nightmare_plate.png'); }
        if (st.top === 'stage' && !st.cut && st.active) break;
      }
      const i5 = rec5.filter((r) => r.top === 'bossIntro');
      const end5 = rec5.findIndex((r) => r.top === 'stage' && !r.cut && r.active);
      add('nightmare.plate', i5.length > 0 && i5.every((r) => r.mode === 'plate' && r.nm && r.plate === BI.PLATE_NIGHTMARE && !r.rv) && end5 >= 0 && (end5 + 1) * DT <= BI.REVEAL.card + 2 * DT,
        { mode: i5[0]?.mode, nightmare: i5[0]?.nm, plate: i5[0]?.plate, want: BI.PLATE_NIGHTMARE, fightAfter: end5 >= 0 ? +((end5 + 1) * DT).toFixed(3) : null });
      await s5.close();
      // 늦게 받기: 보스 모듈 응답을 붙잡아 두었다가 2초 뒤 놓는다 → 대역 → 1.5초에 이름판
      const mod = { b_nightwing: 'a_nightwing', b_frostqueen: 'b_frostqueen', b_dagon: 'c_dagon', b_dullahan: 'a_dullahan', b_dracula: 'b_dracula', b_charon: 'e_charon' }[boss] ?? 'a_nightwing';
      let release = null;
      const gate = new Promise((r) => { release = r; });
      const s6 = await openRoom(boss, { route: (page) => page.route(new RegExp(`/src/game/bosses/${mod}\\.js`), async (route) => { await gate; await route.continue(); }) });
      const rec6 = [];
      const n6 = await enterArena(s6);
      await installProbe(s6, { overlap: false });
      let released = false;
      for (let i = 0; i < 60 * 6; i++) {
        const st = await tick(s6);
        rec6.push(st);
        if (!released && i >= 120) { released = true; release(); await s6.wait(400); }   // 2초 (게임 시간) 붙잡기
        if (st.top === 'stage' && !st.cut && st.active && released) break;
      }
      if (!released) release();
      for (let i = 0; i < 40; i++) { const st = await tick(s6); rec6.push(st); if (!st.pend) break; await s6.wait(50); }
      const end6 = rec6.findIndex((r) => r.top === 'stage' && !r.cut && r.active);
      const p6 = await probeResult(s6);
      const pendAtStart = rec6[0]?.pend;
      add('lazy.timeout', n6 >= 0 && pendAtStart && rec6.some((r) => r.rv?.timedOut) && end6 >= 0 && (end6 + 1) * DT <= TOTAL + DT + 1e-6 && rec6.some((r) => r.pt >= 0) && !rec6[rec6.length - 1].pend && p6.think === 0,
        { pendingAtStart: pendAtStart, timedOut: rec6.some((r) => r.rv?.timedOut), plateAt: rec6.find((r) => r.pt >= 0)?.t ?? null, fightAfter: end6 >= 0 ? +((end6 + 1) * DT).toFixed(3) : null, realBossLater: !rec6[rec6.length - 1].pend, bossId: rec6[rec6.length - 1].bossId, think: p6.think });
      await s6.close();
    }
  } catch (e) {
    add(`${boss}.harness`, false, e.stack?.split('\n').slice(0, 3).join(' | ') ?? String(e));
    try { await s?.close(); } catch { /* */ }
  }
}

// ─────────────────────────── 3. 프레임 시간 (--perf) ───────────────────────────
if (PERF) {
  // 공유 기계의 잡음(다른 작업·GC 튀는 프레임)에 흔들리지 않게: 등장·격파 세션과 필살기 세션을 번갈아 ROUNDS 번 재고,
  // 양쪽 모두 같은 방식(라운드별 p95 의 중앙값)으로 비교한다 (Stage 4 perf.md 의 'interleaved ×3 (median)' 과 같은 방법)
  const ROUNDS = Math.max(1, Math.min(7, Number(opt('rounds', QUICK ? 1 : 3)) || 3));
  const med = (xs) => { const a = xs.slice().sort((p, q) => p - q); return a.length ? a[Math.floor((a.length - 1) / 2)] : 0; };
  for (const boss of BOSSES_RUN.slice(0, QUICK ? 1 : 3)) {
    const PQ = QUALITY || 'medium';
    const rounds = [];
    let tier = null;
    for (let k = 0; k < ROUNDS; k++) {
      const s = await openRoom(boss, { quality: PQ });
      tier = await s.eval(() => { const g = window.__game; return g.tier ?? g.qualityTier ?? g.quality ?? g.settings?.quality ?? null; });
      const r = await runReveal(s, boss, { perf: true });
      const f = await runFinale(s, boss, { perf: true });
      await s.close();
      // 필살기 컷인 (같은 방·같은 기기·같은 화질): 카엘 궁극기
      const s2 = await openRoom(boss, { quality: PQ });
      await runReveal(s2, boss, {});
      await s2.eval(async () => { const { bus } = await import('/src/core/events.js'); if (!window.__p4aUltHook) { window.__p4aUltHook = true; bus.on('ultimateCast', () => { window.__p4aUlt = (window.__p4aUlt || 0) + 1; }); } window.__p4aUlt = 0; });
      // 보스의 'intro' 상태(등장 장면이 닫힌 뒤 잠깐 무적·화면 밖)가 끝나야 필살기가 나간다 (skills.castUltimate 가 거절) — 끝날 때까지 기다린다.
      // 보스 패턴과 겹쳐 거절되면(입력 잠금·경직 등) 조금 뒤 다시 누른다. 시전 순간부터 150 프레임을 잰다
      let cast = false;
      for (let tries = 0; tries < 6 && !cast; tries++) {
        for (let i = 0; i < 360; i++) {
          const busy = await s2.eval(() => { const w = window.__game.world, b = w.boss; return !!(b && !b.dead && (b.pendingBoss || b.state === 'intro')) || !!w.cutscene || !!w.inputLock; });
          if (!busy) break;
          await step(s2.page, 1, false);
        }
        await s2.eval(() => { const w = window.__game.world, p = w.player; p.buffs.invincible = 9999; w.run.sp = 100; p.iframes = 9; p.hurtT = 0; });
        await s2.page.keyboard.down('KeyF'); await step(s2.page, 2, false); await s2.page.keyboard.up('KeyF'); await step(s2.page, 1, false);
        cast = await s2.eval(() => (window.__p4aUlt || 0) > 0 || window.__game.top?.name === 'ultCutin');
        if (!cast) await step(s2.page, 20, false);
      }
      const ult = [];
      let seen = cast;
      for (let i = 0; i < 150; i++) {
        const m = await s2.eval(() => { const g = window.__game, now = g.__qaRealNow; const t0 = now(); window.__qaStep(1, false); try { g.input?.beginRender?.(); g.__qaRender.call(g); g.input?.endRender?.(); } catch (e) { console.error(e); } return { ms: now() - t0, top: g.top?.name, cast: window.__p4aUlt || 0 }; });
        if (m.top === 'ultCutin' || m.cast > 0) seen = true;
        ult.push(m.ms);
      }
      await s2.close();
      rounds.push({ R: stats(r.perfMs.map((x) => +x.toFixed(2))), F: stats(f.perfMs.map((x) => +x.toFixed(2))), U: stats(ult.map((x) => +x.toFixed(2))), seen, frames: [r.perfMs.length, f.perfMs.length, ult.length] });
    }
    const pick = (k, q) => +med(rounds.map((x) => x[k][q])).toFixed(2);
    const R = { p95: pick('R', 'p95'), avg: pick('R', 'avg') }, F = { p95: pick('F', 'p95'), avg: pick('F', 'avg') }, U = { p95: pick('U', 'p95'), avg: pick('U', 'avg') };
    const seen = rounds.every((x) => x.seen);
    perfRows.push({ boss, quality: PQ, tier, rounds, median: { reveal: R, finale: F, ult: U }, ultSeen: seen });
    add(`perf.${boss}`, seen && R.p95 <= U.p95 && F.p95 <= U.p95, { quality: PQ, tier, rounds: ROUNDS, revealP95: R.p95, finaleP95: F.p95, ultP95: U.p95, revealAvg: R.avg, finaleAvg: F.avg, ultAvg: U.avg,
      perRound: rounds.map((x) => [x.R.p95, x.F.p95, x.U.p95, x.seen ? 1 : 0]), frames: rounds[0]?.frames });
  }
}

for (const [boss, s] of SESS) if (s.errs?.length) add(`${boss}.pageErrors`, false, s.errs.slice(0, 4));
add('pageErrors', SESS.every(([, s]) => !s.errs?.length), { sessions: SESS.length, withErrors: SESS.filter(([, s]) => s.errs?.length).length });
await env.close();
const bad = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ device: DEVICE, bosses: BOSSES_RUN, results, perf: perfRows }, null, 1));
console.log(`\nboss_reveal: ${results.length - bad.length}/${results.length} 통과${bad.length ? ' — 실패: ' + bad.map((r) => r.id).join(', ') : ''} — ${OUT}/report.json`);
process.exitCode = bad.length ? 1 : 0;
