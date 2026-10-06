// 회차 「피의 윤회」 화면 헤드리스 시험 — docs/specs/ngplus.md §10.2 U1–U8 (NG-UI)
//
//   node tools/qa/ngplus_ui.mjs [--only U1,U3] [--vp desk,phone1,phone2]
//   import run from './tools/qa/ngplus_ui.mjs'; const r = await run({ only: ['U2'] });   // tools/test_ngplus.mjs --ui
//     → { ok, passes, fails, results: [{id, name, pass, detail}], errors: [...], shots: [...] }
//
// 사례 (desk · phone1 · phone2 — 흐름 사례 U3 은 desk 키보드, U4 는 phone2 터치, U6 은 desk)
//   U1 슬롯 카드   슬롯 셋(새 게임 · 2부 완주 n 0 · 2부 완주 n 2) → '3회차' 배지는 슬롯 3에만 · '제2부' 배지·장 글자와 겹침 0 · 장 글자 줄어듦 0
//   U2 동작 목록   완주 슬롯: '불러오기' 다음 '피의 윤회' + '피의 윤회 · 빈 슬롯 3' · 미완주 슬롯·구름 'conflict'/'cloud' → 없음 · phone2 두 줄 ·
//                  줄 ≥ 36 CSS · 화면 안 · 확인 창(제목 '피의 윤회 — 2회차', 본문 §4.2 그대로 6줄 안, '시작'·'취소')
//   U3 같은 슬롯   키보드: 확인 → 서막 건너뛰기 → 마을: 세이브 ng.n 1 · chapter 0 · 영웅 레벨 그대로 · 중요 물품 0 · cloud.markOverwrite 0번
//   U4 빈 슬롯     터치: 원래 슬롯 JSON 바이트 그대로 · 대상 슬롯 ng.n 1 · g.state.slot = 대상
//   U5 표시        ?scene=stage&stage=s03&ng=1: 일시정지 'CHAPTER 3 · 2회차' · 세계 지도 s03 '적 레벨 72' · 명예의 전당 h.ng 1 줄 '2회차 · 엔딩 도달' ·
//                  클라우드 요약 '· 2회차' (summaryLine + 충돌 화면 카드 진행 줄)
//   U6 마을        회차 1·장 0: 가게 엘릭서·5등급 강화석 · 대장간 7단계 · 마구간 열림 · 간판(마구간 불빛) · 수호신 2칸 (회차 없는 장 0 과 대조)
//   U7 엔딩        회차 슬롯 p2 크레딧: 통계 머리 줄 '· 2회차' · 안내 '「피의 윤회」로 3회차를' · 1부 엔딩·아케이드에는 안내 없음 · 줄이 화면 안
//   U8 오류        모든 사례 페이지·콘솔 오류 0
// 글 위치는 game.canvas 의 fillText 를 감싸 논리 화면 px 로 잰다 (줄어듦 = maxWidth 로 눌림).
// 2부 완주 세이브는 tools/fixtures/save_p2done.json (NG-CORE) — 없으면 같은 모양을 합성한다.
// 결과 /tmp/claude-0/ngplus_ui/ngplus_ui.json, 스크린숏 /tmp/claude-0/ngplus_ui/{vp}_*.png
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openEnv, waitFrames } from './lib/server.mjs';
import { Touch, ensureTouchMode } from './lib/touch.mjs';

const OUT = '/tmp/claude-0/ngplus_ui';
const ALL = ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8'];
const READY = 'g.scenesReady !== false';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NG_BODY = '레벨·장비·직업·스킬·비전서·동료·골드를 지닌 채 1장부터 다시 시작합니다. 이야기·지도·의뢰·유물은 처음으로 돌아가고, 적은 더 강해집니다.';
const HINT3 = '이어하기에서 이 슬롯을 고르면 「피의 윤회」로 3회차를 시작할 수 있습니다';

/** fillText 기록기 (페이지 init 스크립트): 게임 캔버스의 글을 논리 화면 px 로 (x0·x1·y, 눌림) */
function TEXT_REC() {
  const R = window.__ngTxt = { on: false, list: [], cur: null };
  const ft = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (str, x, y, mw) {
    const g = window.__game;
    if (R.on && g && this.canvas === g.canvas && R.list.length < 8000) {
      try {
        const m = this.getTransform(), S = g.scale || 1;
        const s = String(str), nat = this.measureText(s).width;
        const squeezed = mw != null && Number.isFinite(mw) && mw > 0 && nat > mw + 0.5;
        const w = squeezed ? mw : nat, al = this.textAlign;
        const lx = al === 'center' ? x - w / 2 : al === 'right' || al === 'end' ? x - w : x;
        R.list.push({ s, x0: (m.a * lx + m.c * y + m.e) / S, x1: (m.a * (lx + w) + m.c * y + m.e) / S, y: (m.b * x + m.d * y + m.f) / S, squeezed, top: R.cur === g.top });
      } catch { /* 무시 */ }
    }
    return ft.call(this, str, x, y, mw);
  };
}

export default async function run(opts = {}) {
  const only = Array.isArray(opts.only) ? opts.only : null;
  const vps = Array.isArray(opts.vp) && opts.vp.length ? opts.vp : ['desk', 'phone1', 'phone2'];
  const want = (id) => !only || only.includes(id);
  fs.mkdirSync(OUT, { recursive: true });
  const R = { passes: 0, fails: 0, results: [], errors: [], shots: [] };
  const check = (id, name, pass, detail = '') => {
    R.results.push({ id, name, pass: !!pass, detail: String(detail).slice(0, 600) });
    if (pass) R.passes++; else R.fails++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`);
  };
  const env = await openEnv();
  const live = new Set();
  const open = async (vp, url = 'index.html', o = {}) => {
    const s = await env.page(vp, url, { ...o, initScripts: [TEXT_REC, ...(o.initScripts ?? [])] });
    s.tag = `${vp} ${url}`; s.vp = vp;
    live.add(s);
    await s.waitGame(o.pred ?? READY, 60000);
    return s;
  };
  const close = async (s) => { if (!live.has(s)) return; live.delete(s); for (const e of s.errs) R.errors.push(`${s.tag}: ${e}`); await s.close(); };
  // 스크린숏 전에 토스트(업적 소급 요약 등)를 치운다 — 이 시험의 화면만 보이게
  const shot = async (s, name) => {
    await s.eval(() => { const g = window.__game; if (Array.isArray(g.toasts)) g.toasts.length = 0; }).catch(() => {});
    await waitFrames(s.page, { ms: 60, frames: 2, ticks: 1 });
    const f = path.join(OUT, `${name}.png`); await s.screenshot(f); R.shots.push(f);
  };
  const C = { env, open, close, shot, check, vps, R };
  const cases = { U1, U2, U3, U4, U5, U6, U7 };
  try {
    for (const id of ALL) {
      if (!want(id) || !cases[id]) continue;
      const t0 = Date.now();
      try { await cases[id](C); } catch (e) { check(id, '시험 실행', false, e?.stack ?? e); }
      for (const s of [...live]) await close(s);
      console.log(`   (${id} ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
    }
    if (want('U8')) check('U8', '모든 사례 페이지·콘솔 오류 0', R.errors.length === 0, R.errors.slice(0, 6).join(' | '));
  } finally {
    for (const s of [...live]) await close(s).catch(() => {});
    await env.close().catch(() => {});
  }
  const out = { ok: R.fails === 0, passes: R.passes, fails: R.fails, results: R.results, errors: R.errors, shots: R.shots };
  try { fs.writeFileSync(path.join(OUT, 'ngplus_ui.json'), JSON.stringify(out, null, 1)); } catch { /* 무시 */ }
  return out;
}

// ───────────────────────── 도우미 ─────────────────────────
/** 몇 프레임 동안 그린 글 (중복 없이). top = 맨 위 장면이 그린 글 (장면 render 를 감싸 누가 그리는지 안다) */
async function texts(s, frames = 3) {
  await s.eval(() => {
    const R = window.__ngTxt, g = window.__game;
    for (const sc of g.scenes) {
      if (sc.__ngWrap || typeof sc.render !== 'function') continue;
      sc.__ngWrap = true;
      const o = sc.render;
      sc.render = function (...a) { const p = R.cur; R.cur = this; try { return o.apply(this, a); } finally { R.cur = p; } };
    }
    R.list.length = 0; R.on = true;
  });
  await s.eval((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), frames);
  return s.eval(() => {
    const R = window.__ngTxt; R.on = false;
    const seen = new Map();
    for (const t of R.list) seen.set(`${t.s}|${Math.round(t.x0)}|${Math.round(t.y)}`, t);
    R.list.length = 0;
    return [...seen.values()];
  });
}
const view = (s) => s.eval(() => { const g = window.__game; return { W: g.viewW, H: g.viewH, uiK: g.uiK || 1, uiW: g.uiW, uiH: g.uiH, css: g.canvas.getBoundingClientRect().height / g.viewH }; });
const settle = (s, ms = 300) => waitFrames(s.page, { ms, frames: 4, ticks: 3 });
async function waitTop(s, name, ms = 20000) { await s.waitGame(`g.top?.name === '${name}' && (g.fade?.a ?? 0) < 0.05`, ms); }
/** UI 좌표(uiScale 장면) → 창 CSS 좌표 */
function ui2css(s, x, y) {
  return s.eval(([x, y]) => {
    const g = window.__game, r = g.canvas.getBoundingClientRect(), k = g.top?.uiScale ? g.uiK || 1 : 1;
    return [r.left + x * k * (r.width / g.viewW), r.top + y * k * (r.height / g.viewH)];
  }, [x, y]);
}
async function tapUi(t, s, r) { const [x, y] = await ui2css(s, r.x + r.w / 2, r.y + r.h / 2); await t.tap(x, y, 70); await waitFrames(s.page, { ms: 160, frames: 4, ticks: 3 }); }

/**
 * 슬롯 기록 심기: spec { 1: {kind:'fresh'|'mid'|'done', n}, 2: null(지움) … } → 결과 {fixture}
 * done = 2부·외전 완주 (고정 세이브 save_p2done.json, 없으면 합성: Lv 70 · 22장 · p2_done · ending_p2true · 중요 물품 넷)
 */
function seed(s, spec) {
  return s.eval(async (spec) => {
    const S = await import('/src/game/state.js');
    const { saves } = await import('/src/core/save.js');
    const { makeItem } = await import('/src/data/items.js');
    const { addItem } = await import('/src/game/inventory.js');
    const ST = await import('/src/data/stages.js');
    let fx = null;
    try { const r = await fetch('/tools/fixtures/save_p2done.json', { cache: 'no-store' }); if (r.ok) fx = await r.json(); } catch { fx = null; }
    const done = (slot) => {
      if (fx) { const st = JSON.parse(JSON.stringify(fx)); delete st.ng; st.slot = slot; return st; }
      const st = S.newGameState({ slot, difficulty: 'normal', charId: 'kael' });
      st.heroes.kael.level = 70;
      const P = st.progress;
      P.chapter = 20; P.unlocked = [...ST.STAGE_ORDER, ...(ST.SIDE_STAGES ?? [])];
      for (const id of ST.STAGE_ORDER) P.cleared[id] = { rank: 'A', time: 300, score: 5000 };
      Object.assign(P.flags, { startChar: 'kael', p2_started: true, p2_done: true, ending_true: true, ending_p2true: true, stable_open: true, s14_revealed: true, s20_revealed: true, s21_revealed: true, s22_revealed: true });
      P.relics = [...ST.RELICS]; P.shards = [...ST.SHARDS]; P.hearts = [...ST.HEARTS];
      for (const id of ['k_heart_1', 'k_star_1', 'k_relic_1', 'k_dawnflower']) addItem(st, makeItem(id), { silent: true });
      st.gold = 250000;
      return st;
    };
    for (const [k, v] of Object.entries(spec)) {
      const slot = Number(k);
      if (!v) { saves.remove(slot); continue; }
      const st = v.kind === 'done' ? done(slot) : S.newGameState({ slot, difficulty: 'normal', charId: 'kael' });
      if (v.kind === 'mid') { st.progress.chapter = 5; st.progress.unlocked = ['s01', 's02', 's03', 's04', 's05', 's06']; st.heroes.kael.level = 24; }
      if (v.n) st.ng = { v: 1, n: v.n, at: Date.now(), hist: [], past: {} };
      saves.write(slot, st);
    }
    return { fixture: !!fx };
  }, spec);
}
/** 이어하기 슬롯 화면을 열고 등장 연출이 끝날 때까지 */
async function openSlots(s, index = 0) {
  await s.eval((i) => { const g = window.__game; g.go('slots', { mode: 'load', index: i }, { fade: false }); }, index);
  await s.waitGame("g.top?.name === 'slots' && g.top.t > 1.0", 20000);
  await settle(s);
}
/** 슬롯 i 의 동작 목록 → { ids, labels, cols, rects, ih } */
async function actions(s, i, cloudStatus = undefined) {
  await s.eval(([i, cs]) => {
    const t = window.__game.top;
    t.act = null; t.menu.index = i;
    if (cs !== undefined) t.slots[i].cloud = cs ? { status: cs } : null;
    t.openActions();
  }, [i, cloudStatus ?? null]);
  await s.waitGame("g.top?.act && g.top.act.t > 0.45", 5000);
  await settle(s, 200);
  return s.eval(() => {
    const t = window.__game.top, a = t.act;
    return { ids: a.items.map((x) => x[0]), labels: a.items.map((x) => x[1]), subs: a.items.map((x) => x[2]), cols: a.cols, rects: a.menu.rects.map((r) => r && { ...r }), ih: t.layout().ih };
  });
}
/** 이야기(서막)를 건너뛰고 마을까지 */
async function skipToHub(s, ms = 40000) {
  const t0 = Date.now();
  for (;;) {
    const st = await s.eval(() => {
      const g = window.__game, t = g.top;
      if (t?.name === 'story' && !t.ending && !t.empty && (g.fade?.a ?? 0) < 0.5) t.skip();
      return { top: t?.name ?? null, stack: g.scenes.map((x) => x.name).join('>') };
    });
    if (/(^|>)hub(>|$)/.test(st.stack) && st.top !== 'story') return st;
    if (Date.now() - t0 > ms) throw new Error(`마을에 닿지 못함: ${st.stack}`);
    await sleep(250);
  }
}

// ───────────────────────── U1 슬롯 카드 ─────────────────────────
async function U1(C) {
  for (const vp of C.vps) {
    const s = await C.open(vp);
    const sd = await seed(s, { 1: { kind: 'fresh' }, 2: { kind: 'done' }, 3: { kind: 'done', n: 2 } });
    await openSlots(s, 2);
    const tx = await texts(s);
    const L = await s.eval(() => { const g = window.__game, L = g.top.layout(); return { top: L.top, h: L.h, gap: L.gap, uiK: g.uiK || 1 }; });
    const cardOf = (y) => { const u = y / L.uiK; for (let i = 0; i < 3; i++) { const y0 = L.top + i * (L.h + L.gap); if (u >= y0 && u <= y0 + L.h) return i + 1; } return 0; };
    const badges = tx.filter((t) => /^\d+회차$/.test(t.s));
    const b = badges[0];
    C.check('U1', `${vp} '3회차' 배지는 슬롯 3에만${sd.fixture ? '' : ' (합성 완주 세이브)'}`, badges.length === 1 && b.s === '3회차' && cardOf(b.y) === 3,
      badges.map((t) => `${t.s}@slot${cardOf(t.y)}`).join(', ') || '배지 없음');
    if (!b) { await C.shot(s, `${vp}_slots`); await C.close(s); continue; }
    const line = tx.filter((t) => Math.abs(t.y - b.y) < 3 && cardOf(t.y) === 3 && t !== b).sort((p, q) => p.x0 - q.x0);
    const p2 = line.find((t) => t.s === '제2부'), ch = line.find((t) => /^CHAPTER /.test(t.s));
    const gapP2 = p2 ? p2.x0 - b.x1 : null, gapCh = ch ? ch.x0 - (p2 ?? b).x1 : null;
    C.check('U1', `${vp} 슬롯 3: 배지 → '제2부' → 장 글자 차례로 겹침 0`, !!p2 && !!ch && b.x1 < p2.x0 && gapP2 >= 8 && gapCh >= 8,
      `회차 ${b.x0.toFixed(0)}–${b.x1.toFixed(0)} · 제2부 ${p2?.x0.toFixed(0)}–${p2?.x1.toFixed(0)} · '${ch?.s}' ${ch?.x0.toFixed(0)}–${ch?.x1.toFixed(0)} (틈 ${gapP2?.toFixed(1)} / ${gapCh?.toFixed(1)})`);
    C.check('U1', `${vp} 슬롯 3 장 글자가 눌리지 않음 (maxWidth 안)`, !!ch && !ch.squeezed, ch ? `'${ch.s}'` : '장 글자 없음');
    const p2s = tx.filter((t) => t.s === '제2부').map((t) => cardOf(t.y)).sort();
    C.check('U1', `${vp} '제2부' 배지는 완주 슬롯 2·3 (회차 없는 슬롯 2 에는 회차 배지 없음)`, p2s.join(',') === '2,3', p2s.join(','));
    await C.shot(s, `${vp}_slots`);
    await C.close(s);
  }
}

// ───────────────────────── U2 동작 목록 ─────────────────────────
async function U2(C) {
  for (const vp of C.vps) {
    const s = await C.open(vp);
    await seed(s, { 1: { kind: 'done' }, 2: { kind: 'mid' }, 3: null });
    await openSlots(s, 0);
    const V = await view(s);
    const a = await actions(s, 0);
    C.check('U2', `${vp} 완주 슬롯: '불러오기' 다음 '피의 윤회' · '피의 윤회 · 빈 슬롯 3'`,
      a.ids[0] === 'load' && a.ids[1] === 'ngplus' && a.ids[2] === 'ngcopy' && a.labels[1] === '피의 윤회' && a.labels[2] === '피의 윤회 · 빈 슬롯 3' && a.subs[1] === 'NEW GAME+' && a.subs[2] === 'NEW GAME+ → SLOT 3',
      a.ids.join(','));
    const tx = await texts(s);
    const lab = tx.find((t) => t.s === '피의 윤회 · 빈 슬롯 3'), r2 = a.rects[2];
    C.check('U2', `${vp} '피의 윤회 · 빈 슬롯 3' 글이 줄 안`, !!lab && !!r2 && lab.x1 <= (r2.x + r2.w) * V.uiK + 0.5 && !lab.squeezed, lab && r2 ? `글 끝 ${lab.x1.toFixed(0)} / 줄 끝 ${((r2.x + r2.w) * V.uiK).toFixed(0)}` : '없음');
    const rowCss = a.ih * V.uiK * V.css;
    const inside = a.rects.every((r) => r && r.x >= 0 && r.y >= 0 && r.x + r.w <= V.uiW + 0.5 && r.y + r.h <= V.uiH + 0.5);
    C.check('U2', `${vp} 동작 ${a.ids.length}줄 · ${a.cols}열 · 줄 높이 ${rowCss.toFixed(1)} CSS ≥ 36 · 화면 안${vp === 'phone2' ? ' · 두 줄' : ''}`,
      rowCss >= 36 && inside && (vp !== 'phone2' || a.cols === 2), `cols ${a.cols} · inside ${inside}`);
    await C.shot(s, `${vp}_actions`);
    // 미완주 슬롯 · 구름 상태
    const b = await actions(s, 1);
    C.check('U2', `${vp} 미완주 슬롯에는 피의 윤회 없음`, !b.ids.includes('ngplus') && !b.ids.includes('ngcopy'), b.ids.join(','));
    for (const cs of ['conflict', 'cloud']) {
      const c = await actions(s, 0, cs);
      C.check('U2', `${vp} 구름 '${cs}' 흉내 → 피의 윤회 없음 (먼저 받게)`, !c.ids.includes('ngplus') && !c.ids.includes('ngcopy'), c.ids.join(','));
    }
    const c = await actions(s, 0, 'local');
    C.check('U2', `${vp} 구름 'local' → 피의 윤회 있음`, c.ids.includes('ngplus'), c.ids.join(','));
    // 확인 창 (빈 슬롯 복사 · 같은 슬롯)
    for (const [id, tail] of [['ngcopy', '슬롯 1의 기록은 그대로 두고, 빈 슬롯 3에 새 회차를 만듭니다.'], ['ngplus', '슬롯 1의 지금 기록은 새 회차로 바뀝니다.']]) {
      await s.eval(() => { const t = window.__game.top; t.slots[0].cloud = null; });
      await actions(s, 0);
      await s.eval((id) => window.__game.top.doAction(id), id);
      await s.waitGame("g.top?.name === 'frontConfirm' && g.top.t > 0.4", 5000);
      await settle(s, 200);
      const info = await s.eval(() => { const t = window.__game.top; return { title: t.title, message: t.message, yes: t.yes, no: t.no, danger: t.danger, idx: t.menu.index }; });
      const ft = await texts(s);
      const strip = (x) => x.replace(/\s+/g, '');
      const want = `${NG_BODY} ${tail}`;
      // 본문 줄: 제목과 단추 사이의 글 (frontConfirm 은 줄 6개까지만 그린다)
      const ty = ft.find((t) => t.s === '피의 윤회 — 2회차');
      const by = ft.find((t) => t.s === '시작');
      const body = ft.filter((t) => t.top && ty && by && t.y > ty.y + 20 && t.y < by.y - 10).sort((p, q) => p.y - q.y);
      const joined = strip(body.map((t) => t.s).join(''));
      const inScreen = body.every((t) => t.x0 >= 0 && t.x1 <= V.W);
      C.check('U2', `${vp} 확인 창(${id}): 제목 '피의 윤회 — 2회차' · 본문 §4.2 그대로 ${body.length}줄 · '시작'·'취소' · danger · 기본 '취소'`,
        info.title === '피의 윤회 — 2회차' && info.message === want && joined === strip(want) && body.length <= 6 && inScreen && info.yes === '시작' && info.no === '취소' && info.danger && info.idx === 1 && !!ft.find((t) => t.s === '취소'),
        `${body.length}줄 · ${joined === strip(want) ? '본문 같음' : '본문 다름: ' + body.map((t) => t.s).join(' / ')}`);
      if (id === 'ngcopy') await C.shot(s, `${vp}_confirm`);
      await s.eval(() => window.__game.top.close(false));
      await s.waitGame("g.top?.name === 'slots'", 5000);
    }
    await C.close(s);
  }
}

// ───────────────────────── U3 같은 슬롯 (desk 키보드) ─────────────────────────
const SNAP = () => (async () => {
  const { saves } = await import('/src/core/save.js');
  const { ITEMS } = await import('/src/data/items.js');
  const keyN = (list) => (Array.isArray(list) ? list.filter((it) => ITEMS[it?.baseId]?.slot === 'key').length : 0);
  const snap = (st) => st && {
    ng: st.ng ? { n: st.ng.n, hist: st.ng.hist?.length ?? 0 } : null, chapter: st.progress?.chapter, slot: st.slot, created: st.created,
    levels: Object.fromEntries(Object.entries(st.heroes ?? {}).map(([k, h]) => [k, h.level])),
    keys: keyN(st.inventory) + keyN(st.progress?.lootQueue), unlocked: st.progress?.unlocked?.length ?? 0, gold: st.gold,
  };
  const g = window.__game;
  return { s1: snap(saves.read(1)), s2: snap(saves.read(2)), s3: snap(saves.read(3)), cur: snap(g.state), raw1: localStorage.getItem(saves.slotKey(1)), mo: window.__mo ?? null };
})();
async function countMarkOverwrite(s) {
  await s.eval(async () => {
    const { cloud } = await import('/src/core/cloud.js');
    window.__mo = 0;
    const o = cloud.markOverwrite.bind(cloud);
    cloud.markOverwrite = (...a) => { window.__mo++; return o(...a); };
  });
}
async function U3(C) {
  const s = await C.open('desk');
  await seed(s, { 1: { kind: 'done' }, 2: null, 3: null });
  await countMarkOverwrite(s);
  const before = await s.eval(SNAP);
  await openSlots(s, 0);
  await s.key('KeyZ');
  await s.waitGame('g.top?.act && g.top.act.t > 0.3', 5000);
  const i0 = await s.eval(() => { const a = window.__game.top.act; return a.items[a.menu.index][0]; });
  await s.key('ArrowDown');
  const i1 = await s.eval(() => { const a = window.__game.top.act; return a.items[a.menu.index][0]; });
  C.check('U3', "kb: 슬롯 1 Z → 동작 '불러오기' · ↓ '피의 윤회'", i0 === 'load' && i1 === 'ngplus', `${i0} → ${i1}`);
  await s.key('KeyZ');
  await s.waitGame("g.top?.name === 'frontConfirm' && g.top.t > 0.3", 5000);
  await C.shot(s, 'desk_confirm_same');
  await s.key('ArrowLeft');
  await s.key('KeyZ');
  await s.waitGame("g.top?.name === 'story'", 20000);
  const mid = await s.eval(SNAP);
  C.check('U3', '시작 → 서막 (세이브는 이미 새 회차)', mid.s1?.ng?.n === 1 && mid.cur?.ng?.n === 1, JSON.stringify(mid.s1?.ng));
  const hub = await skipToHub(s);
  await settle(s, 600);
  const after = await s.eval(SNAP);
  const lv = Object.keys(before.s1.levels).every((k) => after.s1?.levels?.[k] === before.s1.levels[k]);
  C.check('U3', `서막 건너뛰기 → 마을 (${hub.stack})`, /hub/.test(hub.stack), hub.stack);
  C.check('U3', `세이브: ng.n 1 · hist 1 · chapter 0 · unlocked 1 · created 그대로 · 영웅 레벨 그대로 (${JSON.stringify(before.s1.levels)})`,
    after.s1?.ng?.n === 1 && after.s1.ng.hist === 1 && after.s1.chapter === 0 && after.s1.unlocked === 1 && after.s1.created === before.s1.created && lv && after.s1.gold === before.s1.gold,
    JSON.stringify({ ng: after.s1?.ng, ch: after.s1?.chapter, un: after.s1?.unlocked, lv: after.s1?.levels }));
  C.check('U3', `중요 물품 ${before.s1.keys} → 0 (가방·보관함)`, before.s1.keys > 0 && after.s1?.keys === 0 && after.cur?.keys === 0, `${before.s1.keys} → ${after.s1?.keys}`);
  C.check('U3', 'cloud.markOverwrite 호출 0번 · g.state 는 슬롯 1 의 새 회차', after.mo === 0 && after.cur?.slot === 1 && after.cur?.ng?.n === 1, `mo ${after.mo} · slot ${after.cur?.slot}`);
  await C.shot(s, 'desk_ng_hub');
  await C.close(s);
}

// ───────────────────────── U4 빈 슬롯 (phone2 터치) ─────────────────────────
async function U4(C) {
  const s = await C.open('phone2');
  await seed(s, { 1: { kind: 'done' }, 2: { kind: 'mid' }, 3: null });
  await countMarkOverwrite(s);
  const before = await s.eval(SNAP);
  await openSlots(s, 0);
  const t = new Touch(s.cdp, s.page);
  await ensureTouchMode(t, s.page, [8, 8]);
  await s.eval(() => { const g = window.__game; g.top.act = null; g.top.menu.index = 0; });
  await settle(s, 150);
  const card = await s.eval(() => window.__game.top.menu.rects[0]);
  await tapUi(t, s, card);
  await s.waitGame('g.top?.act && g.top.act.t > 0.45', 5000);
  await settle(s, 200);
  const a = await s.eval(() => { const a = window.__game.top.act; return { i: a.items.findIndex((x) => x[0] === 'ngcopy'), rects: a.menu.rects.map((r) => r && { ...r }) }; });
  const r = a.rects[a.i];
  await tapUi(t, s, r);
  if (await s.eval(() => window.__game.top?.name === 'slots')) await tapUi(t, s, r);   // 터치: 첫 탭은 고르기, 두 번째가 결정
  await s.waitGame("g.top?.name === 'frontConfirm' && g.top.t > 0.4", 5000);
  await settle(s, 200);
  await C.shot(s, 'phone2_confirm_copy');
  const yes = await s.eval(() => window.__game.top.menu.rects[0]);
  await tapUi(t, s, yes);
  if (await s.eval(() => window.__game.top?.name === 'frontConfirm')) await tapUi(t, s, yes);
  await s.waitGame("g.top?.name === 'story'", 20000);
  await skipToHub(s);
  await settle(s, 600);
  const after = await s.eval(SNAP);
  C.check('U4', '터치: 슬롯 1 → \'피의 윤회 · 빈 슬롯 3\' → 시작 → 서막 → 마을', after.cur?.slot === 3, `g.state.slot ${after.cur?.slot}`);
  C.check('U4', '원래 슬롯 1 의 JSON 바이트 그대로 (ng 없음)', before.raw1 && after.raw1 === before.raw1 && after.s1?.ng === null, `${before.raw1?.length} → ${after.raw1?.length}`);
  C.check('U4', '대상 슬롯 3: ng.n 1 · chapter 0 · 영웅 레벨 그대로 · 중요 물품 0 · 슬롯 2 그대로',
    after.s3?.ng?.n === 1 && after.s3.chapter === 0 && Object.keys(before.s1.levels).every((k) => after.s3.levels[k] === before.s1.levels[k]) && after.s3.keys === 0 && after.s2?.chapter === before.s2?.chapter,
    JSON.stringify(after.s3));
  C.check('U4', 'cloud.markOverwrite 호출 0번', after.mo === 0, `mo ${after.mo}`);
  await C.close(s);
}

// ───────────────────────── U5 표시 ─────────────────────────
async function U5(C) {
  for (const vp of C.vps) {
    const s = await C.open(vp, 'index.html?scene=stage&stage=s03&ng=1', { pred: "!!g.world && g.scenes.some((x) => x.name === 'stage')" });
    await s.skipDialogue();
    const V = await view(s);
    const w = await s.eval(() => { const g = window.__game; return { ng: g.world.ng, level: g.world.stage.level, ch: g.world.stage.chapter, stateNg: g.state?.ng?.n ?? null }; });
    C.check('U5', `${vp} 스테이지 world.ng 1 (NG-CORE ?ng=)`, w.ng === 1 && w.stateNg === 1, JSON.stringify(w));
    // 일시정지 정보
    await s.eval(() => { const g = window.__game; g.push('pause', { world: g.world }); });
    await s.waitGame("g.top?.name === 'pause' && g.top.t > 0.7", 8000);
    await settle(s, 300);
    let tx = await texts(s);
    const pl = tx.find((t) => t.s === 'CHAPTER 3 · 2회차');
    C.check('U5', `${vp} 일시정지 'CHAPTER 3 · 2회차' (화면 안)`, !!pl && pl.x0 >= 0 && pl.x1 <= V.W, tx.filter((t) => /CHAPTER/.test(t.s)).map((t) => t.s).join(' | '));
    await C.shot(s, `${vp}_pause`);
    // 세계 지도
    const exp = await s.eval(async () => {
      const NG = await import('/src/game/ngplus.js'), { STAGES } = await import('/src/data/stages.js');
      const g = window.__game;
      g.state.progress.unlocked = ['s01', 's02', 's03'];
      g.go('worldmap', { page: 0 }, { fade: false });
      return NG.ngStageLevel(STAGES.s03, 1);
    });
    await s.waitGame("g.top?.name === 'worldmap' && !!g.top.pages && !g.top.reveal", 15000);
    await s.eval(() => { const t = window.__game.top; t.index = t.nodes.findIndex((n) => n.id === 's03'); });
    await settle(s, 500);
    tx = await texts(s);
    const el = tx.find((t) => /^적 레벨 \d+$/.test(t.s));
    C.check('U5', `${vp} 세계 지도 s03 '적 레벨 72' (= NG.ngStageLevel ${exp})`, exp === 72 && el?.s === '적 레벨 72', el?.s ?? '적 레벨 글 없음');
    await C.shot(s, `${vp}_worldmap`);
    // 명예의 전당 (기기 · 스토리)
    await s.eval(() => {
      const g = window.__game, now = Date.now();
      g.meta.highScores = [
        { name: 'NGP', score: 987654, mode: 'story', stageId: 'ending', ng: 1, charId: 'kael', diff: 'normal', date: now, run: '1:1:1' },
        { name: 'ONE', score: 543210, mode: 'story', stageId: 's05', charId: 'kael', diff: 'normal', date: now, run: '1:1' },
        { name: 'BAD', score: 123456, mode: 'story', stageId: 's04', ng: 'x', charId: 'kael', diff: 'normal', date: now, run: '2:1' },
      ];
      g.go('highscore', { mode: 'story' }, { fade: false });
    });
    await s.waitGame("g.top?.name === 'highscore' && g.top.t > 0.9", 10000);
    await settle(s, 400);
    tx = await texts(s);
    const hs = tx.find((t) => t.s.endsWith('2회차 · 엔딩 도달'));
    const one = tx.find((t) => t.s.endsWith('5장 클리어')), bad = tx.find((t) => t.s.endsWith('4장 클리어'));
    C.check('U5', `${vp} 명예의 전당 h.ng 1 줄 '2회차 · 엔딩 도달' · 1회차 줄·이상한 ng 줄은 그대로`, !!hs && !!one && !/회차/.test(one.s) && !!bad && !/회차/.test(bad.s) && !hs.squeezed,
      tx.filter((t) => /클리어|도달/.test(t.s)).map((t) => t.s + (t.squeezed ? '(눌림)' : '')).join(' | '));
    await C.shot(s, `${vp}_highscore`);
    // '전체' 부문: 모드 이름이 앞에 붙는다 ('스토리 · 2회차 · 엔딩 도달')
    await s.eval(() => window.__game.go('highscore', { mode: 'all' }, { fade: false }));
    await s.waitGame("g.top?.name === 'highscore' && g.top.t > 0.9", 10000);
    await settle(s, 400);
    tx = await texts(s);
    const hsa = tx.find((t) => t.s.endsWith('2회차 · 엔딩 도달'));
    C.check('U5', `${vp} 명예의 전당 '전체' 부문 '… · 2회차 · 엔딩 도달' 눌림 없음`, !!hsa && !hsa.squeezed, hsa ? `'${hsa.s}' ${hsa.squeezed ? '눌림' : ''}` : '없음');
    await C.shot(s, `${vp}_highscore_all`);
    // 클라우드 요약: 한 줄 + 충돌 화면 카드 진행 줄 (이 기기 = 회차, 클라우드 = 1회차)
    const sl = await s.eval(async () => {
      const U = await import('/src/scenes/front/cloud_ui.js'), { saves } = await import('/src/core/save.js'), { summarize } = await import('/src/core/cloud.js');
      const g = window.__game;
      saves.write(1, JSON.parse(JSON.stringify(g.state)));
      const base = { charId: 'kael', level: 72, chapter: 3 };
      const out = { ng: U.summaryLine({ ...base, ng: 1 }), none: U.summaryLine(base), bad: U.summaryLine({ ...base, ng: '1' }), ten: U.summaryLine({ ...base, ng: 9 }), sum: summarize(saves.read(1))?.ng ?? null };
      g.go('title', { menu: true }, { fade: false });
      return out;
    });
    C.check('U5', `${vp} summaryLine 끝 ' · 2회차' (ng 없음·'1' → 없음, 9 → '10회차') · summarize(회차 세이브).ng 1`,
      sl.ng.endsWith('3장까지 돌파 · 2회차') && !/회차/.test(sl.none) && !/회차/.test(sl.bad) && sl.ten.endsWith(' · 10회차') && sl.sum === 1, JSON.stringify(sl));
    await s.waitGame("g.top?.name === 'title'", 10000);
    await s.eval(() => {
      const g = window.__game;
      g.push('cloudConflict', { slot: 1, mode: 'conflict' });
      g.top.remote = { charId: 'kael', level: 70, chapter: 20, classId: null, playTime: 360000, difficulty: 'normal', savedAt: Date.now() - 86400000 };
    });
    await s.waitGame("g.top?.name === 'cloudConflict' && g.top.t > 0.6", 8000);
    await settle(s, 300);
    tx = await texts(s);
    const prog = tx.filter((t) => /장까지 돌파|진행 중/.test(t.s));
    const loc = prog.find((t) => / · 2회차$/.test(t.s)), rem = prog.find((t) => t.s === '20장까지 돌파');
    C.check('U5', `${vp} 충돌 화면: 이 기기 카드 진행 '… · 2회차' · 클라우드(1회차) 카드는 그대로 · 눌림 없음`, !!loc && !!rem && !loc.squeezed, prog.map((t) => t.s + (t.squeezed ? '(눌림)' : '')).join(' | '));
    await C.shot(s, `${vp}_cloud`);
    await C.close(s);
  }
}

// ───────────────────────── U6 마을 (desk) ─────────────────────────
async function U6(C) {
  const s = await C.open('desk');
  const res = {};
  for (const ng of [0, 1]) {
    await s.eval(async (ng) => {
      const S = await import('/src/game/state.js'), { saves } = await import('/src/core/save.js');
      const st = S.newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' });
      st.heroes.kael.level = 70;
      if (ng) st.ng = { v: 1, n: ng, at: Date.now(), hist: [], past: {} };
      saves.write(1, st);
      const g = window.__game;
      g.state = S.migrateState(st);
      g.go('hub', { from: 'load' }, { fade: false });
    }, ng);
    await s.waitGame("g.top?.name === 'hub' && !!g.world", 20000);
    await settle(s, 500);
    const r = {};
    // 가게
    await s.eval(() => window.__game.push('shop'));
    await s.waitGame("g.top?.name === 'shop' && g.top.t > 0.5", 10000);
    r.shop = await s.eval(() => window.__game.top.entries.map((e) => e.inst.baseId));
    if (ng) await C.shot(s, 'desk_ng_shop');
    await s.eval(() => window.__game.pop());
    // 대장간 (구매 탭)
    await s.eval(() => window.__game.push('smith'));
    await s.waitGame("g.top?.name === 'smith' && g.top.t > 0.5", 10000);
    r.smith = await s.eval(() => { const t = window.__game.top; t.setTab(t.tabs.findIndex((x) => x.id === 'buy') >= 0 ? t.tabs.findIndex((x) => x.id === 'buy') : 1); return t.entries.map((e) => e.inst.baseId); });
    if (ng) { await settle(s, 300); await C.shot(s, 'desk_ng_smith'); }
    await s.eval(() => window.__game.pop());
    // 마구간
    // (닫힌 마구간은 내레이션 한 줄 뒤 스스로 닫히고, 처음 여는 마구간은 개장 대사를 위에 쌓는다 → 장면 객체에서 읽는다)
    await s.eval(() => window.__game.push('stable'));
    await s.waitGame("g.scenes.some((x) => x.name === 'stable')", 10000);
    r.closed = await s.eval(() => window.__game.scenes.find((x) => x.name === 'stable').closed);
    if (ng) { await settle(s, 800); await C.shot(s, 'desk_ng_stable'); }
    await s.eval(() => { const g = window.__game; while (g.scenes.length > 1 && g.scenes.some((x) => x.name === 'stable')) g.pop(); });
    await s.waitGame("g.top?.name === 'hub'", 10000);
    // 수호신 칸 · 마구간 간판(불빛: facadeLights 의 마구간 등불·제단·영혼 등불)
    await sleep(450);   // facades 의 마구간 상태 캐시(0.4초)
    Object.assign(r, await s.eval(async () => {
      const CS = await import('/src/game/companion_state.js'), F = await import('/src/scenes/town/facades.js');
      let n = 0;
      F.facadeLights({ add: () => { n++; } }, { x: 4100, vw: 480 }, 0);
      return { guards: CS.guardianSlots(window.__game.state), lights: n };
    }));
    res[ng] = r;
  }
  const A = res[1], B = res[0];
  C.check('U6', '회차 1·장 0 가게: 엘릭서(c_elixir) · 5등급 강화석(m_stone_5) — 회차 없는 장 0 에는 없음',
    A.shop.includes('c_elixir') && A.shop.includes('m_stone_5') && !B.shop.includes('c_elixir') && !B.shop.includes('m_stone_5'), `회차 ${A.shop.length}종 · 1회차 ${B.shop.length}종`);
  const t7 = (l) => l.filter((id) => /_(13|14)$/.test(id)).length;
  C.check('U6', '회차 1·장 0 대장간: 7단계 장비 (w_*_13·14, a_*_13·14)', t7(A.smith) > 0 && t7(B.smith) === 0, `7단계 ${t7(A.smith)} / 1회차 ${t7(B.smith)} · ${A.smith.slice(0, 4).join(',')}`);
  C.check('U6', '회차 1·장 0 마구간 열림 (1회차 장 0 은 닫힘)', A.closed === false && B.closed === true, `회차 ${A.closed} · 1회차 ${B.closed}`);
  C.check('U6', '회차 1·장 0 마을 마구간 간판·등불 켜짐 (facades 불빛 더 많음)', A.lights > B.lights, `회차 ${A.lights} · 1회차 ${B.lights}`);
  C.check('U6', '회차 1·장 0 수호신 2칸 (guardianSlots)', A.guards === 2 && B.guards === 1, `회차 ${A.guards} · 1회차 ${B.guards}`);
  await C.close(s);
}

// ───────────────────────── U7 엔딩 ─────────────────────────
async function U7(C) {
  for (const vp of C.vps) {
    const s = await C.open(vp);
    await seed(s, { 1: { kind: 'done', n: 1 } });
    const V = await view(s);
    const roll = async (kind, arcade = false, shotName = null) => {
      await s.eval(async ([kind, arcade]) => {
        const S = await import('/src/game/state.js'), { saves } = await import('/src/core/save.js');
        const g = window.__game;
        g.state = S.migrateState(saves.read(1));
        g.state.progress.flags[`ending_${kind}`] = true;
        if (arcade) g.state.arcade = { mode: 'practice' };
        g.go('credits', { kind, fromEnding: true }, { fade: false });
      }, [kind, arcade]);
      await s.waitGame("g.top?.name === 'credits' && g.top.t > 0.3", 10000);
      await s.eval(() => window.__game.top.endRoll());
      await s.waitGame("g.top?.phase === 'stats' && g.top.phaseT > 1.0", 8000);
      const st = await texts(s);
      if (shotName) await C.shot(s, shotName);
      await s.eval(() => { const t = window.__game.top; t.phase = 'end'; t.phaseT = 0; });
      await s.waitGame("g.top?.phase === 'end' && g.top.phaseT > 1.4", 8000);
      const en = await texts(s);
      return { st, en };
    };
    const p2 = await roll('p2', false, `${vp}_ending_stats`);
    const head = p2.st.find((t) => /난이도/.test(t.s));
    C.check('U7', `${vp} p2 통계 머리 줄 '… 난이도 · 2회차' (화면 안·눌림 없음)`, !!head && head.s.endsWith('난이도 · 2회차') && head.x0 >= 0 && head.x1 <= V.W && !head.squeezed, head?.s ?? '없음');
    const h = p2.en.find((t) => t.s === HINT3);
    const cont = p2.en.find((t) => /^계속$|화면을 터치하세요/.test(t.s));
    const notes = p2.en.filter((t) => t !== cont && t.y < (cont ? cont.y - 4 : V.H) && t.s.length > 3).sort((a, b) => a.y - b.y);
    const last = notes[notes.length - 1];
    C.check('U7', `${vp} p2 안내 '「피의 윤회」로 3회차를' — 마지막 줄 바로 앞 · 화면 안 · 눌림 없음`, !!h && h.x0 >= 0 && h.x1 <= V.W && !h.squeezed && last && last.y > h.y && notes[notes.length - 2] === h,
      h ? `x ${h.x0.toFixed(0)}–${h.x1.toFixed(0)} / ${V.W} · y ${h.y.toFixed(0)} · 마지막 '${last?.s}'` : p2.en.map((t) => t.s).join(' | '));
    C.check('U7', `${vp} 안내 줄들이 '계속' 안내와 겹치지 않음`, !!last && (!cont || last.y + 14 * V.uiK < cont.y - 8), `마지막 줄 y ${last?.y.toFixed(0)} · 계속 y ${cont?.y.toFixed(0)}`);
    await C.shot(s, `${vp}_ending_end`);
    if (vp === C.vps[0]) {
      const p1 = await roll('true');
      C.check('U7', `${vp} 1부 진엔딩 크레딧: 피의 윤회 안내 없음 (머리 줄 '· 2회차' 는 있음)`, !p1.en.some((t) => /피의 윤회/.test(t.s)) && p1.st.some((t) => /난이도 · 2회차$/.test(t.s)), p1.en.map((t) => t.s).slice(0, 6).join(' | '));
      const ar = await roll('p2', true);
      C.check('U7', `${vp} 아케이드 임시 세이브: 안내·회차 표기 없음`, !ar.en.some((t) => /피의 윤회/.test(t.s)) && !ar.st.some((t) => /회차/.test(t.s)), ar.st.filter((t) => /난이도/.test(t.s)).map((t) => t.s).join(' | '));
    }
    await C.close(s);
  }
}

// ───────────────────────── 명령줄 ─────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1].split(',').map((x) => x.trim()).filter(Boolean) : null; };
  const t0 = Date.now();
  const r = await run({ only: val('--only'), vp: val('--vp') });
  console.log(`\n통과 ${r.passes}, 실패 ${r.fails}, 오류 ${r.errors.length} (${((Date.now() - t0) / 1000).toFixed(0)}초) — ${path.join(OUT, 'ngplus_ui.json')}`);
  process.exit(r.ok ? 0 : 1);
}
