// 회랑 UI 헤드리스 시험 — docs/specs/gallery.md §9.2 U1–U10 (GAL-UI)
//
//   node tools/qa/gallery_ui.mjs [--only U1,U3] [--vp desk,phone1,phone2]
//   import run from './tools/qa/gallery_ui.mjs'; const r = await run({ only: ['U2'] });   // tools/test_gallery.mjs --ui
//     → { ok, passes, fails, results: [{id, name, pass, detail}], errors: [...], perf, shots }
//
// 사례
//   U1 들어가기   desk·phone1·phone2: 타이틀 8줄 · 8번째 'gallery'/'회랑' · ids[4] 'ach' · 안전 영역 안·알림 카드와 겹침 0 · NEW 점과 'NEW n'
//                 (씨앗 메타) · '회랑' → 장면 → 방 셋 → cancel → 타이틀 메뉴 8번째 줄 · 스크린숏 {vp}_{title,cg,viewer,music,theater}.png
//   U2 상태       빈 메타 '그림 0 / 20' · 잠긴 카드 ??? + 힌트 · cg/ 요청 0 · 1부 완주 메타: 2부 줄·수 없음 · 전부 연 메타 34 · 44 · 8,
//                 NEW 마름모 → 닫았다 다시 열면 없음 (seenAt)
//   U3 조작       키보드(E·Q 방, 방향키 격자, Z 크게 보기, ←→ 잠긴 것 건너뜀, A 맞춤, X 닫기, 음악실 Z·A·←→, 극장 ↑↓, X 타이틀) ·
//                 패드(fakepad LB·RB, D-pad, 결정 위치 auto/east, Y 맞춤) · 터치(칩, 끌기, 카드 → 크게 보기, 밀기, 두 번 탭, 닫기, 줄 탭 재생,
//                 가로 밀기 방) · 마우스(호버 고르기, 누르기, 휠 넘기기) — 세 방 모두, desk·phone1·phone2
//   U4 탭 크기    tools/qa/lib/taps.mjs auditScene phone1·phone2: 그림·스크롤·크게 보기·음악실·극장·성당 단추 둘 — primary ≥ 44 · list ≥ 36 CSS, 겹침 0
//   U5 메모리     phone1(medium, ?lo=1): 아틀라스 한 장 ≤ 3.0 MB · 크게 보기 중 cg/ 디코딩 ≤ 2 · lo 파일 · 닫으면 canvasPoolStats().free 그대로 ·
//                 성당에서 열고 닫아도 cg/cg_alberto_church 그대로
//   U6 음악실     재생 → current 's01' · 배지 합성음(__BN_AUDIO_CODECS = [])·녹음 음원(recStats 흉내) · 정지 · 빠른 →×5 → 재생 한 번 ·
//                 음량 0 안내 · visibilitychange → suspended, 돌아오면 재생 시간이 이어짐 · analyser 막대 > 0 · 방을 나가면 analyser 끊김 · 타이틀 → 'title'
//   U7 극장       지난 판 game.state(슬롯 2 + 저장하지 않은 깃발)를 둔 채 8개 모두 다시 보기 → 회랑(극장 방): game.state·슬롯 1–3·메타 바이트 같음,
//                 seenScripts 그대로, saves.write 0, 토스트 '획득' 0 · 크레딧: 타이틀에서 연 것은 타이틀 회랑 줄로, 극장에서 연 것은 회랑으로 ·
//                 엔딩에서 시작한 크레딧(fromEnding)은 예전 흐름
//   U8 성당       ?scene=hub → 성당 「여정 기록」 → ←→ 두 단추 · '회랑에서 돌아본다'(push) → 음악실 s03 → 닫기 → 성당, 곡 'church' · 극장 꺼짐 + 안내 ·
//                 alt 바로가기 · '여정을 기록한다' 는 예전처럼 저장
//   U9 성능       phone1 그리기 p95 ≤ 3 ms (목록·크게 보기·음악실·극장, perfprobe) · 프레임마다 새 그라디언트·캔버스 0 · 10초 동안 풀 free 그대로
//   U10 오류      모든 사례 페이지·콘솔 오류 0 · game.gal 을 지운 채 열기 → '회랑 정보를 불러오지 못했습니다', 던짐 0
// 결과 /tmp/claude-0/gal_ui/gallery_ui.json, 스크린숏 /tmp/claude-0/gal_ui/*.png
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openEnv, waitFrames } from './lib/server.mjs';
import { contextOptions } from './lib/viewports.mjs';
import { installTapRecorder, auditScene, describeAudit, drawnText } from './lib/taps.mjs';
import { fakePadInit, connect, press, BTN } from './lib/fakepad.mjs';
import { perfProbeInit, measureFrames, stats } from './lib/perfprobe.mjs';
import { freeze, unfreeze } from './lib/step.mjs';
import { Touch, ensureTouchMode } from './lib/touch.mjs';

const OUT = '/tmp/claude-0/gal_ui';
const ALL = ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8', 'U9', 'U10'];
const FIXTURE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../fixtures/save_p2done.json');
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const NO_FS = () => { try { Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false }); Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false }); } catch { /* 무시 */ } };
const READY = 'g.scenesReady !== false && !!g.gal && !!g.ach';
const GAL_READY = "g.top?.name === 'gallery' && !!g.top._L && (g.fade?.a ?? 0) < 0.05";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inter = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;

export default async function run(opts = {}) {
  const only = Array.isArray(opts.only) && opts.only.length ? opts.only : null;
  const vps = Array.isArray(opts.vp) && opts.vp.length ? opts.vp : ['desk', 'phone1', 'phone2'];
  const want = (id) => !only || only.includes(id);
  fs.mkdirSync(OUT, { recursive: true });
  const R = { passes: 0, fails: 0, results: [], errors: [], perf: null, shots: [] };
  const check = (id, name, pass, detail = '') => {
    R.results.push({ id, name, pass: !!pass, detail: String(detail).slice(0, 600) });
    if (pass) R.passes++; else R.fails++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`);
  };
  const fixture = fs.readFileSync(FIXTURE, 'utf8');
  const env = await openEnv();
  const live = new Set();
  const open = async (vp, url = 'index.html', o = {}) => {
    const s = await env.page(vp, url, o);
    s.tag = `${typeof vp === 'string' ? vp : vp.tag ?? 'custom'} ${url}`;
    live.add(s);
    await s.waitGame(o.pred ?? READY, 60000);
    return s;
  };
  const close = async (s) => { if (!live.has(s)) return; live.delete(s); for (const e of s.errs) R.errors.push(`${s.tag}: ${e}`); await s.close(); };
  const shot = async (s, name) => { const f = path.join(OUT, `${name}.png`); await s.screenshot(f); R.shots.push(f); };
  const C = { env, open, close, shot, check, vps, R, fixture };
  const cases = { U1, U2, U3, U4, U5, U6, U7, U8, U9, U10 };
  try {
    for (const id of ALL) {
      if (!want(id)) continue;
      const t0 = Date.now();
      try { await cases[id](C); } catch (e) { check(id, '시험 실행', false, e?.stack ?? e); }
      for (const s of [...live]) await close(s);
      console.log(`   (${id} ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
    }
    if (want('U10')) check('U10', '모든 사례 페이지·콘솔 오류 0', R.errors.length === 0, R.errors.slice(0, 6).join(' | '));
  } finally {
    for (const s of [...live]) await close(s).catch(() => {});
    await env.close().catch(() => {});
  }
  const out = { ok: R.fails === 0, passes: R.passes, fails: R.fails, results: R.results, errors: R.errors, perf: R.perf, shots: R.shots };
  try { fs.writeFileSync(path.join(OUT, 'gallery_ui.json'), JSON.stringify(out, null, 1)); } catch { /* 무시 */ }
  return out;
}

// ───────────────────────── 도우미 ─────────────────────────
/** UI 좌표(uiScale 장면) → 창 CSS 좌표 */
function ui2css(s, x, y) {
  return s.eval(([x, y]) => {
    const g = window.__game, r = g.canvas.getBoundingClientRect(), k = g.top?.uiScale ? g.uiK || 1 : 1;
    return [r.left + x * k * (r.width / g.viewW), r.top + y * k * (r.height / g.viewH)];
  }, [x, y]);
}
async function tapUi(t, s, r, ms = 70) { const [x, y] = await ui2css(s, r.x + r.w / 2, r.y + r.h / 2); await t.tap(x, y, ms); await waitFrames(s.page, { ms: 140, frames: 3, ticks: 2 }); }
/** 회랑 상태 요약 */
function galState(s) {
  return s.eval(() => {
    const g = window.__game, t = g.top;
    if (t?.name !== 'gallery') return { top: t?.name ?? null };
    const V = t.viewer;
    return {
      top: t.name, room: t.room, ri: t.ri, sel: [...t.sel], wide: !!t._L?.wide, pushed: t.pushed, err: t.err,
      sum: JSON.parse(JSON.stringify(t.sum)), news: [t.rows.cg.filter((r) => r.isNew).length, t.rows.mus.filter((r) => r.isNew).length],
      viewer: V ? { vi: V.vi, ui: V.ui, key: t.openCg[V.vi]?.key ?? null } : null, fit: t.fitCover,
      scY: t.scs.map((x) => x.y), current: g.audio?.current ?? null, pend: t.pend?.id ?? null, atlas: t.atlasBytes,
      deferToasts: !!t.deferToasts, keepAwake: !!t.keepAwake, msg: t.msg?.text ?? null,
    };
  });
}
async function openGal(s, params = { back: 'title', backIndex: 7 }, how = 'go') {
  await s.eval(([p, how]) => { const g = window.__game; if (how === 'push') g.push('gallery', p); else g.go('gallery', p, { fade: false }); }, [params, how]);
  await s.waitGame(GAL_READY, 20000);
  await waitFrames(s.page, { ms: 350, frames: 6, ticks: 4 });
}
/**
 * meta.gal 씨앗 (엔진은 쓸 때마다 ensureGal 로 읽는다). kind: 'empty' | 'p1'(1부 완주) | 'all' | 'some'(그림 0·2·5 · 곡 몇) ·
 * seen: true 면 seenAt = 지금 (NEW 없음), 아니면 0 (모두 NEW)
 */
function seed(s, kind, { seen = false } = {}) {
  return s.eval(([kind, seen]) => {
    const g = window.__game, D = g.gal.defs, t0 = Date.now() - 60000, cg = {}, mus = {};
    const always = (d) => d.need.includes('always');
    if (kind === 'all') { D.cg.forEach((d, i) => { cg[d.id] = t0 + i; }); D.mus.forEach((d, i) => { if (!always(d)) mus[d.id] = t0 + i; }); }
    if (kind === 'p1') { D.cg.forEach((d, i) => { if (!d.p2) cg[d.id] = t0 + i; }); D.mus.forEach((d, i) => { if (!d.p2 && !always(d)) mus[d.id] = t0 + i; }); }
    if (kind === 'some') { [0, 2, 5].forEach((i) => { cg[D.cg[i].id] = t0 + i; }); for (const id of ['prologue', 'hub', 's01', 's02', 's03', 'boss']) mus[id] = t0; }
    g.meta.gal = { v: 1, cg, mus, seenAt: seen ? Date.now() : 0 };
    g.meta.endingsSeen = kind === 'all' ? ['bad', 'normal', 'true', 'p2', 'p2true'] : kind === 'p1' ? ['true'] : [];
    g.gal.rescan?.('retro');
  }, [kind, seen]);
}
/** 슬롯 2 에 2부 완주 세이브 (극장 서막·2부 서막의 증거) */
const slotStorage = (fx) => ({ bloodnocturne_slot_2: fx });
const titleMenu = (s) => s.eval(() => { const t = window.__game.top; return { top: t?.name, idx: t?.menu?.index, mode: t?.mode }; });
function titleGeom(s) {
  return s.eval(() => {
    const g = window.__game, t = g.top, L = t.layout();
    const rows = t.menu.rects.slice(0, t.items.length).map((r) => r && { x: r.x, y: r.y, w: r.w, h: r.h });
    const cards = L.cards.map((c) => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h }));
    const safe = { l: L.sl, r: L.W - L.sr, t: L.st, b: L.H - L.sb };
    const inside = rows.length === t.items.length && rows.every((r) => r && r.x >= safe.l - 0.5 && r.y >= safe.t - 0.5 && r.x + r.w <= safe.r + 0.5 && r.y + r.h <= safe.b + 0.5);
    let overlap = 0;
    for (const r of rows) for (const c of cards) if (r && Math.min(r.x + r.w, c.x + c.w) > Math.max(r.x, c.x) && Math.min(r.y + r.h, c.y + c.h) > Math.max(r.y, c.y)) overlap++;
    return { n: t.items.length, ids: t.items.map((i) => i.id), labels: t.items.map((i) => i.label), rows, cards, safe, inside, overlap, galNew: t.galNew, achNew: t.achNew };
  });
}
/** 바이트 사진: game.state · 슬롯 1–3 · 메타 (localStorage 그대로) */
const snapBytes = (s) => s.eval(() => {
  const ls = {};
  for (const k of ['bloodnocturne_slot_1', 'bloodnocturne_slot_2', 'bloodnocturne_slot_3', 'bloodnocturne_meta']) ls[k] = localStorage.getItem(k);
  return { state: JSON.stringify(window.__game.state), ls };
});
const toasts = (s) => s.eval(() => (window.__game.toasts || []).map((t) => t.text));
/** 디코딩된 cg/ 이미지 키 (들어올 때 캐시에 있던 것 제외) */
const decodedCg = (s) => s.eval(async () => {
  const { assets } = await import('/src/core/assets.js');
  const t = window.__game.top, c0 = t?.cached0 ?? new Set();
  return [...assets.cache.values()].filter((e) => e.ok && e.folder === 'cg' && !c0.has(e.key) && (e.img?.naturalWidth || 0) > 4).map((e) => ({ key: e.key, lo: !!e.lo }));
});
const poolFree = (s) => s.eval(async () => (await import('/src/scenes/menu/common.js')).canvasPoolStats().free);

// ───────────────────────── U1 들어가기 ─────────────────────────
async function U1(C) {
  for (const vp of C.vps) {
    const touch = vp !== 'desk';
    const ctx = touch ? { ...contextOptions(vp), userAgent: IOS_UA, tag: vp } : vp;
    const s = await C.open(ctx, 'index.html', { ...(touch ? { initScripts: [NO_FS] } : {}), storage: slotStorage(C.fixture) });
    await seed(s, 'all');
    await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
    await s.waitGame("g.top?.name === 'title' && g.top.menuK > 0.98");
    await s.eval(() => { const t = window.__game.top; t.upd = () => {}; t.apk = { info: null }; t.galPoll = 0; t.achPoll = 0; });
    await waitFrames(s.page, { ms: 1300, frames: 8, ticks: 4 });
    const m = await titleGeom(s);
    C.check('U1', `${vp} 타이틀 메뉴 8줄 · 8번째 'gallery'/'회랑' · ids[4] 'ach'`, m.n === 8 && m.ids[7] === 'gallery' && m.labels[7] === '회랑' && m.ids[4] === 'ach' && !m.ids.includes('credits'), m.ids.join(','));
    const cardsOk = touch ? m.cards.some((c) => c.id === 'a2hs') : m.cards.length >= 2;
    C.check('U1', `${vp} 메뉴 줄이 안전 영역 안 · 알림 카드 ${m.cards.length}장과 겹침 0`, m.inside && m.overlap === 0 && cardsOk, `끝 ${(m.rows[7]?.y + m.rows[7]?.h).toFixed(1)} / ${m.safe.b.toFixed(1)} · 겹침 ${m.overlap}`);
    await installTapRecorder(s.page);
    const tx = await drawnText(s.page);
    const unseen = await s.eval(() => window.__game.gal.summary().unseen);
    C.check('U1', `${vp} '회랑' 줄 NEW ${unseen} (붉은 점 + sub 'NEW n')`, unseen > 0 && m.galNew === unseen && tx.includes(`NEW ${unseen}`), `galNew ${m.galNew} · ${tx.filter((x) => /^NEW/.test(x)).join(',')}`);
    await C.shot(s, `${vp}_title`);
    // '회랑' 고르기 → 장면
    if (touch) {
      const t = new Touch(s.cdp, s.page);
      await tapUi(t, s, m.rows[7]); await tapUi(t, s, m.rows[7]);   // 터치: 첫 탭은 고르기, 두 번째 탭은 결정
    } else {
      const idx = await s.eval(() => window.__game.top.menu.index);
      for (let k = idx; k < 7; k++) await s.key('ArrowDown');
      await s.key('KeyZ');
    }
    let ok = true;
    try { await s.waitGame(GAL_READY, 15000); } catch { ok = false; }
    C.check('U1', `${vp} '회랑' → 회랑 장면`, ok, await s.scenes());
    if (!ok) { await C.close(s); continue; }
    await s.waitGame('[...(g.top.atlas?.state ?? [])].filter((x) => x === 2).length >= 6', 20000).catch(() => {});
    await waitFrames(s.page, { ms: 500, frames: 6, ticks: 4 });
    await C.shot(s, `${vp}_cg`);
    await s.eval(() => window.__game.top.openViewer(3));
    await s.waitGame('g.top.viewer?.shown', 15000).catch(() => {});
    await waitFrames(s.page, { ms: 400, frames: 5, ticks: 3 });
    await C.shot(s, `${vp}_viewer`);
    await s.eval(() => { const t = window.__game.top; t.closeViewer(); t.setRoom(1); });
    await waitFrames(s.page, { ms: 500, frames: 6, ticks: 4 });
    await C.shot(s, `${vp}_music`);
    await s.eval(() => window.__game.top.setRoom(2));
    await waitFrames(s.page, { ms: 500, frames: 6, ticks: 4 });
    await C.shot(s, `${vp}_theater`);
    const st = await galState(s);
    C.check('U1', `${vp} 방 셋 (그림 → 음악 → 극장)`, st.room === 'theater', JSON.stringify(st.sum));
    // 닫기 → 타이틀 메뉴의 회랑 줄
    if (touch) await tapUi(new Touch(s.cdp, s.page), s, await s.eval(() => window.__game.top._L.back));
    else await s.key('KeyX');
    await s.waitGame("g.top?.name === 'title'", 10000).catch(() => {});
    const tm = await titleMenu(s);
    C.check('U1', `${vp} cancel → 타이틀 메뉴 8번째 줄(회랑)에 초점`, tm.top === 'title' && tm.idx === 7 && tm.mode === 'menu', JSON.stringify(tm));
    await C.close(s);
  }
}

// ───────────────────────── U2 상태 ─────────────────────────
async function U2(C) {
  for (const vp of ['desk', 'phone2']) {
    const s = await C.open(vp);
    await installTapRecorder(s.page);
    const reqs = [];
    s.page.on('request', (r) => { if (/\/assets\/(lo\/)?cg\//.test(r.url())) reqs.push(r.url()); });
    // 빈 메타
    await seed(s, 'empty');
    reqs.length = 0;
    await openGal(s);
    await waitFrames(s.page, { ms: 1200, frames: 10, ticks: 6 });
    let st = await galState(s);
    let tx = await drawnText(s.page);
    C.check('U2', `${vp} 빈 메타: 그림 0 / 20 · 음악 2 / 33 · 극장 1 / 5 · 머리 '그림 0 / 20 · 음악 2 / 33'`, st.sum.cg.got === 0 && st.sum.cg.total === 20 && st.sum.mus.got === 2 && st.sum.mus.total === 33 && st.sum.th.got === 1 && st.sum.th.total === 5 && tx.includes('그림 0 / 20 · 음악 2 / 33') && !st.err, JSON.stringify(st.sum));
    C.check('U2', `${vp} 빈 회랑: 안내 줄 · 잠긴 카드 ??? + 힌트('서막'·'1장')`, tx.includes('아직 걸린 그림이 없습니다 — 이야기를 진행하면 하나씩 걸립니다') && tx.includes('???') && tx.includes('서막') && tx.includes('1장'), tx.slice(0, 14).join(' | '));
    C.check('U2', `${vp} 잠긴 카드 때문에 cg/ 요청 0`, reqs.length === 0, reqs.slice(0, 3).join(' '));
    if (vp === 'desk') await C.shot(s, 'desk_state_empty');
    // 1부 완주 메타: 2부 줄·수 없음
    await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
    await seed(s, 'p1', { seen: true });
    await openGal(s);
    st = await galState(s);
    tx = await drawnText(s.page);
    const p2txt = tx.filter((x) => /제2부|PART Ⅱ|균열/.test(x));
    await s.eval(() => window.__game.top.setRoom(1));
    await waitFrames(s.page, { ms: 450, frames: 6, ticks: 4 });
    const mus = await s.eval(() => window.__game.top.rows.mus.map((r) => r.no + ':' + r.id));
    const tx2 = await drawnText(s.page);
    await s.eval(() => window.__game.top.setRoom(2));
    await waitFrames(s.page, { ms: 450, frames: 6, ticks: 4 });
    const tx3 = await drawnText(s.page);
    const numsOk = mus.length === 33 && mus.every((x, i) => x.startsWith(`No.${String(i + 1).padStart(2, '0')}:`));
    C.check('U2', `${vp} 1부 완주: 20 · 33 · 5, 2부 줄·문장 없음, 곡 번호 01–33 연속`, st.sum.cg.total === 20 && st.sum.cg.got === 20 && st.sum.mus.total === 33 && st.sum.th.total === 5 && !p2txt.length && !tx2.some((x) => /제2부/.test(x)) && !tx3.some((x) => /PART Ⅱ|제2부/.test(x)) && numsOk,
      `${JSON.stringify(st.sum)} · ${p2txt.join(',')} · ${mus.slice(-2).join(',')}`);
    // 전부 연 메타 (+ 2부 완주 슬롯 → 극장 서막·2부 서막) · NEW
    await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
    await s.eval((fx) => { localStorage.setItem('bloodnocturne_slot_2', fx); }, C.fixture);
    await seed(s, 'all');
    await openGal(s);
    st = await galState(s);
    const diamonds = await s.eval(() => window.__game.top.rows.cg.filter((r) => r.isNew).length);
    C.check('U2', `${vp} 전부: 34 · 44 · 8 · NEW 마름모 ${diamonds}개`, st.sum.cg.got === 34 && st.sum.cg.total === 34 && st.sum.mus.got === 44 && st.sum.mus.total === 44 && st.sum.th.got === 8 && st.sum.th.total === 8 && diamonds === 34 && st.news[1] === 42, JSON.stringify({ sum: st.sum, news: st.news }));
    if (vp === 'desk') { await waitFrames(s.page, { ms: 1500, frames: 10, ticks: 6 }); await C.shot(s, 'desk_state_all'); }
    await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
    await openGal(s);
    st = await galState(s);
    C.check('U2', `${vp} 닫았다 다시 열면 NEW 없음 (seenAt)`, st.news[0] === 0 && st.news[1] === 0 && (await s.eval(() => window.__game.gal.summary().unseen)) === 0, JSON.stringify(st.news));
    await C.close(s);
  }
}

// ───────────────────────── U3 조작 ─────────────────────────
async function U3(C) {
  // 키보드 (desk · phone2 — 좁은 배치도 같은 조작)
  for (const vp of ['desk', 'phone2']) {
    const s = await C.open(vp);
    await seed(s, 'some', { seen: true });
    await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
    await openGal(s);
    await s.key('KeyE'); let a = await galState(s);
    const e1 = a.room === 'music';
    await s.key('KeyE'); a = await galState(s);
    const e2 = a.room === 'theater';
    await s.key('KeyE'); a = await galState(s);
    const e3 = a.room === 'cg';
    await s.key('KeyQ'); a = await galState(s);
    C.check('U3', `kb(${vp}) E·E·E·Q → 음악 · 극장 · 그림(돌아감) · 극장`, e1 && e2 && e3 && a.room === 'theater', a.room);
    await s.key('KeyE');
    const cols = await s.eval(() => window.__game.top.geo.cg.cols);
    await s.key('ArrowRight'); const r1 = (await galState(s)).sel[0];
    await s.key('ArrowDown'); const d1 = (await galState(s)).sel[0];
    await s.key('ArrowLeft'); const l1 = (await galState(s)).sel[0];
    await s.key('ArrowUp'); const u1 = (await galState(s)).sel[0];
    C.check('U3', `kb(${vp}) 격자 → ↓ ← ↑ (열 ${cols})`, r1 === 1 && d1 === 1 + cols && l1 === cols && u1 === 0, [r1, d1, l1, u1].join(','));
    await s.key('KeyZ'); a = await galState(s);
    const z = a.viewer?.key === 'cg/cg_prologue_moon' && a.deferToasts;
    await s.key('ArrowRight'); a = await galState(s);
    const skip1 = a.viewer?.key === 'cg/cg_alberto_church';
    await s.key('ArrowRight'); a = await galState(s);
    const skip2 = a.viewer?.key === 'cg/cg_elise_rescued';
    await s.key('ArrowRight'); a = await galState(s);
    const end = a.viewer?.key === 'cg/cg_elise_rescued';
    C.check('U3', `kb(${vp}) Z 크게 보기 · → 가 잠긴 그림을 건너뜀 (0 → 2 → 5, 끝에서 멈춤)`, z && skip1 && skip2 && end, JSON.stringify(a.viewer));
    const f0 = a.fit;
    await s.key('KeyA'); a = await galState(s);
    const f1 = a.fit;
    await s.key('KeyA'); a = await galState(s);
    await s.key('KeyZ'); const ov = (await galState(s)).viewer?.ui;
    await C.shot(s, 'desk_viewer_kb');
    await s.key('KeyX'); a = await galState(s);
    C.check('U3', `kb(${vp}) A 맞춤 ↔ 가득 채움 · Z 덮개 숨김 · X 닫기 (목록 선택이 마지막 그림)`, f1 === !f0 && a.fit === f0 && ov === 0 && a.viewer === null && !a.deferToasts && a.sel[0] === 5, JSON.stringify({ f0, f1, ov, sel: a.sel }));
    // 음악실
    await s.key('KeyE');
    await s.eval(async () => { const { audio } = await import('/src/core/audio.js'); audio.unlock(); });
    await s.key('ArrowDown'); a = await galState(s);
    const sel1 = a.sel[1];
    const id1 = await s.eval((i) => window.__game.top.rows.mus[i].id, sel1);
    await s.key('KeyZ'); a = await galState(s);
    const play = a.current === id1;
    await s.key('KeyA'); a = await galState(s);
    const stop = a.current === null;
    await s.key('ArrowRight'); a = await galState(s);
    const nextId = await s.eval((i) => window.__game.top.rows.mus[i].id, a.sel[1]);
    await sleep(600); a = await galState(s);
    C.check('U3', `kb(${vp}) 음악실 ↓ · Z 재생(${id1}) · A 정지 · → 다음 열린 곡 0.35초 뒤 재생(${nextId})`, sel1 === 1 && play && stop && a.current === nextId && nextId === 'hub', JSON.stringify({ sel1, play, stop, cur: a.current }));
    // 극장
    await s.key('KeyE'); await s.key('ArrowDown'); a = await galState(s);
    C.check('U3', `kb(${vp}) 극장 ↓`, a.room === 'theater' && a.sel[2] === 1, JSON.stringify(a.sel));
    await s.key('KeyX');
    await s.waitGame("g.top?.name === 'title'", 10000).catch(() => {});
    const tm = await titleMenu(s);
    C.check('U3', `kb(${vp}) X → 타이틀 메뉴 회랑 줄 · 곡 title`, tm.top === 'title' && tm.idx === 7 && (await s.eval(() => window.__game.audio?.current ?? null)) === 'title', JSON.stringify(tm));
    if (vp !== 'desk') { await C.close(s); continue; }
    // 마우스: 올리면 고르기 · 누르면 크게 보기 · 휠 넘기기
    await seed(s, 'all', { seen: true });
    await openGal(s);
    const card = await s.eval(() => window.__game.top.zItems.find((z) => z.k === 2 && !z.r.thid)?.r);
    const [mx, my] = await ui2css(s, card.x + card.w / 2, card.y + card.h / 2);
    await s.page.mouse.move(mx - 5, my - 5); await s.page.mouse.move(mx, my);
    await waitFrames(s.page, { ms: 200, frames: 3, ticks: 2 });
    const hov = (await galState(s)).sel[0];
    await s.page.mouse.click(mx, my); await waitFrames(s.page, { ms: 250, frames: 4, ticks: 3 });
    a = await galState(s);
    const opened = a.viewer?.vi === 2;
    await s.page.mouse.wheel(0, 120); await waitFrames(s.page, { ms: 250, frames: 4, ticks: 3 });
    a = await galState(s);
    C.check('U3', 'mouse 올리면 고르기 · 누르면 크게 보기 · 휠 → 다음 그림', hov === 2 && opened && a.viewer?.vi === 3, JSON.stringify({ hov, opened, vi: a.viewer?.vi }));
    await C.close(s);
  }
  // 패드 (fakepad, 결정 위치 auto = 아래 A / 설정 'east' = 오른쪽 B)
  for (const [vp, confirm] of [['desk', 'auto'], ['phone1', 'east'], ['phone2', 'auto']]) {
    const s = await C.open(vp, 'index.html', { initScripts: [fakePadInit()], settings: { ctrlConfirm: confirm } });
    await connect(s.page);
    await seed(s, 'some', { seen: true });
    await waitFrames(s.page, { ms: 200, frames: 4, ticks: 2 });
    await openGal(s);
    const [OK, NO] = confirm === 'east' ? [BTN.B, BTN.A] : [BTN.A, BTN.B];
    await press(s.page, BTN.RB); let a = await galState(s);
    const rb = a.room === 'music';
    await press(s.page, BTN.LB); a = await galState(s);
    const lb = a.room === 'cg';
    await press(s.page, BTN.RIGHT); await press(s.page, BTN.RIGHT); await press(s.page, BTN.LEFT); a = await galState(s);
    const dp = a.sel[0] === 1;
    await press(s.page, BTN.LEFT); await press(s.page, OK); a = await galState(s);
    const vw = a.viewer?.key === 'cg/cg_prologue_moon';
    await press(s.page, BTN.RIGHT); a = await galState(s);
    const nx = a.viewer?.key === 'cg/cg_alberto_church';
    const f0 = a.fit;
    await press(s.page, BTN.Y); a = await galState(s);
    const fy = a.fit === !f0;
    await press(s.page, BTN.Y);
    await press(s.page, NO); a = await galState(s);
    const cl = a.viewer === null;
    await press(s.page, BTN.RB); await press(s.page, BTN.DOWN); await press(s.page, OK); a = await galState(s);
    const mp = a.current === 'prologue';
    await press(s.page, BTN.Y); a = await galState(s);
    const ms = a.current === null;
    await press(s.page, BTN.RB); await press(s.page, BTN.DOWN); a = await galState(s);
    const th = a.room === 'theater' && a.sel[2] === 1;
    await installTapRecorder(s.page);
    const tx = await drawnText(s.page, { minY: 540 - 40 });
    await press(s.page, NO);
    await s.waitGame("g.top?.name === 'title'", 10000).catch(() => {});
    const tm = await titleMenu(s);
    C.check('U3', `pad(${vp}, ${confirm}) RB·LB 방 · D-pad · ${confirm === 'east' ? 'B' : 'A'} 크게 보기 · → 넘기기 · Y 맞춤 · ${confirm === 'east' ? 'A' : 'B'} 닫기 · 음악 재생/Y 정지 · 극장 · 닫기 → 타이틀`,
      rb && lb && dp && vw && nx && fy && cl && mp && ms && th && tm.top === 'title' && tm.idx === 7, JSON.stringify({ rb, lb, dp, vw, nx, fy, cl, mp, ms, th, tm }));
    C.check('U3', `pad(${vp}): 바닥 안내에 키보드 글자 없음`, !tx.some((x) => /^(Z|X|Q|E|A|C)$/.test(x)), tx.join(' | '));
    await C.close(s);
  }
  // 터치 (phone1 · phone2)
  for (const vp of ['phone1', 'phone2']) {
    const s = await C.open(vp, 'index.html', { storage: slotStorage(C.fixture) });
    await seed(s, 'all', { seen: true });
    await openGal(s);
    const t = new Touch(s.cdp, s.page);
    const [hx, hy] = await ui2css(s, 400, 24);
    await ensureTouchMode(t, s.page, [hx, hy]); await waitFrames(s.page, { ms: 300, frames: 4, ticks: 2 });
    const chip = (k) => s.eval((k) => window.__game.top.zChips[k], k);
    await tapUi(t, s, await chip(1)); let a = await galState(s);
    const c1 = a.room === 'music';
    await tapUi(t, s, await chip(0)); a = await galState(s);
    C.check('U3', `touch(${vp}) 칩 탭 → 방`, c1 && a.room === 'cg', a.room);
    const A = await s.eval(() => window.__game.top._L.area);
    const [x0, y0] = await ui2css(s, A.x + A.w * 0.5, A.y + A.h * 0.85);
    const [, y1] = await ui2css(s, 0, A.y + A.h * 0.1);
    await t.drag(x0, y0, x0, y1, { steps: 10, stepMs: 20, hold: 120 });
    await waitFrames(s.page, { ms: 400, frames: 5, ticks: 3 });
    a = await galState(s);
    C.check('U3', `touch(${vp}) 그림 목록 끌기 → 스크롤`, a.scY[0] > 40 && a.viewer === null, `scY ${a.scY[0].toFixed(1)}`);
    await s.eval(() => { window.__game.top.scs[0].reset(); });
    await waitFrames(s.page, { ms: 200, frames: 3, ticks: 2 });
    const card = await s.eval(() => { const z = window.__game.top.zItems.find((q) => q.k === 1 && !q.r.thid); return z ? z.r : null; });
    await tapUi(t, s, card); a = await galState(s);
    const opened = a.viewer?.vi === 1;
    await waitFrames(s.page, { ms: 300, frames: 4, ticks: 3 });
    await C.shot(s, `${vp}_viewer_touch`);
    // 밀기 = 넘기기
    const W = await s.eval(() => [innerWidth, innerHeight]);
    await t.drag(W[0] * 0.7, W[1] * 0.55, W[0] * 0.2, W[1] * 0.56, { steps: 6, stepMs: 12 });
    await waitFrames(s.page, { ms: 300, frames: 4, ticks: 3 });
    a = await galState(s);
    const sw = a.viewer?.vi === 2;
    // 화살 단추 (덮개가 보일 때)
    await s.eval(() => { window.__game.top.viewer.ui = 3; });
    await waitFrames(s.page, { ms: 150, frames: 3, ticks: 2 });
    const prev = await s.eval(() => window.__game.top.viewer.z.prev);
    if (prev) await tapUi(t, s, prev);
    a = await galState(s);
    const arrow = a.viewer?.vi === 1;
    // 한 번 탭 = 덮개 숨김 · 두 번 탭 = 맞춤 토글
    await s.eval(() => { window.__game.top.viewer.ui = 3; });
    const mid = [W[0] * 0.5, W[1] * 0.55];
    await t.tap(mid[0], mid[1], 50); await waitFrames(s.page, { ms: 450, frames: 5, ticks: 3 });
    a = await galState(s);
    const hid = a.viewer?.ui === 0;
    const f0 = a.fit;
    await t.tap(mid[0], mid[1], 40); await sleep(90); await t.tap(mid[0], mid[1], 40);
    await waitFrames(s.page, { ms: 200, frames: 3, ticks: 2 });
    a = await galState(s);
    const dbl = a.fit === !f0;
    if (a.fit !== f0) await s.eval(() => window.__game.top.toggleFit());
    await s.eval(() => { window.__game.top.viewer.ui = 3; });
    await waitFrames(s.page, { ms: 150, frames: 3, ticks: 2 });
    await tapUi(t, s, await s.eval(() => window.__game.top.viewer.z.close));
    a = await galState(s);
    C.check('U3', `touch(${vp}) 카드 탭 → 크게 보기 · 밀기 → 다음 · 화살 ← · 탭 = 덮개 숨김 · 두 번 탭 = 맞춤 · 닫기`, opened && sw && arrow && hid && dbl && a.viewer === null, JSON.stringify({ opened, sw, arrow, hid, dbl, v: a.viewer }));
    // 음악실: 줄 탭 = 재생 · [정지] · [다음 곡]
    await tapUi(t, s, await chip(1));
    const row = await s.eval(() => { const z = window.__game.top.zItems.find((q) => q.k === 3 && !q.r.thid); return z ? z.r : null; });
    const rid = await s.eval(() => window.__game.top.rows.mus[3].id);
    await tapUi(t, s, row); a = await galState(s);
    const rp = a.current === rid;
    await tapUi(t, s, await s.eval(() => window.__game.top.zBtns.toggle)); a = await galState(s);
    const rs = a.current === null;
    await tapUi(t, s, await s.eval(() => window.__game.top.zBtns.next)); await sleep(550); a = await galState(s);
    const rn = a.current === (await s.eval(() => window.__game.top.rows.mus[4].id));
    await C.shot(s, `${vp}_music_touch`);
    // 목록 가로 밀기 → 다음 방
    const LR = await s.eval(() => window.__game.top.geo.mus.list);
    const [sx, sy] = await ui2css(s, LR.x + LR.w * 0.75, LR.y + LR.h * 0.5);
    const [ex] = await ui2css(s, LR.x + LR.w * 0.2, 0);
    await t.drag(sx, sy, ex, sy + 4, { steps: 6, stepMs: 12 });
    await waitFrames(s.page, { ms: 300, frames: 4, ticks: 3 });
    a = await galState(s);
    C.check('U3', `touch(${vp}) 음악실 줄 탭 재생 · [정지] · [다음 곡] · 가로 밀기 → 극장`, rp && rs && rn && a.room === 'theater', JSON.stringify({ rp, rs, rn, room: a.room }));
    // 극장 줄 탭 → 다시 보기 (크레딧) → 회랑으로
    const cr = await s.eval(() => { const t = window.__game.top, k = t.rows.th.findIndex((r) => r.id === 'credits'); t.scs[2].target = 1e4; return k; });
    await waitFrames(s.page, { ms: 500, frames: 5, ticks: 3 });
    const crz = await s.eval((k) => window.__game.top.zItems.find((q) => q.k === k && !q.r.thid)?.r ?? null, cr);
    if (crz) await tapUi(t, s, crz);
    let ok = true;
    try { await s.waitGame("g.top?.name === 'credits'", 8000); } catch { ok = false; }
    if (ok) { await s.eval(() => { const t = window.__game.top; t.endRoll(); t.leave(); }); await s.waitGame(GAL_READY, 10000).catch(() => { ok = false; }); }
    a = await galState(s);
    C.check('U3', `touch(${vp}) 극장 '크레딧' 탭 → 크레딧 → 회랑(극장 방)`, ok && a.room === 'theater', JSON.stringify({ ok, top: a.top, room: a.room }));
    await C.close(s);
  }
}

// ───────────────────────── U4 탭 크기 ─────────────────────────
async function U4(C) {
  for (const vp of ['phone1', 'phone2']) {
    let s = await C.open(vp, 'index.html', { storage: slotStorage(C.fixture) });
    await seed(s, 'all', { seen: true });
    await installTapRecorder(s.page);
    const views = [
      ['cg', "__game.go('gallery', {back:'title', backIndex:7}, {fade:false})", 1300],
      ['cg-scrolled', "(__game.top.scs[0].target = 170, 0)", 700],
      ['viewer', "(__game.input.touchMode = true, __game.top.openViewer(2), __game.top.viewer.ui = 30, 0)", 900],
      ['music', "(__game.top.closeViewer(), __game.top.setRoom(1), 0)", 800],
      ['music-scrolled', "(__game.top.scs[1].target = 130, 0)", 700],
      ['theater', "(__game.top.setRoom(2), 0)", 800],
      ['church', null, 900],
    ];
    for (const [name, ev, wait] of views) {
      if (name === 'church') {   // 성당 「여정 기록」 단추 둘: 마을(?scene=hub) 에서
        await C.close(s);
        s = await C.open(vp, 'index.html?scene=hub', { pred: `${READY} && g.top?.name === 'hub' && !!g.world` });
        await installTapRecorder(s.page);
        await s.eval(() => { const g = window.__game; g.input.touchMode = true; g.push('church', {}); g.top.setTab(3); });
        await s.waitGame("g.top?.name === 'church'", 10000);
      }
      const a = await auditScene(s.page, ev, { wait });
      const regs = a.regions ?? [];
      let ov = 0;
      for (let i = 0; i < regs.length; i++) for (let j = i + 1; j < regs.length; j++) {
        const p = { x: regs[i].lx, y: regs[i].ly, w: regs[i].lw, h: regs[i].lh }, q = { x: regs[j].lx, y: regs[j].ly, w: regs[j].lw, h: regs[j].lh };
        const contains = (u, v) => u.x <= v.x && u.y <= v.y && u.x + u.w >= v.x + v.w && u.y + u.h >= v.y + v.h;
        if (inter(p, q) && !contains(p, q) && !contains(q, p)) ov++;
      }
      const extra = name === 'church' ? regs.filter((r) => r.id === 'act' || r.id === 'gal').length === 2 : name === 'viewer' ? regs.some((r) => r.kind === 'icon') : true;
      C.check('U4', `${vp} ${name}: primary ≥ 44 · list ≥ 36 CSS px, 겹침 0 (${a.n ?? 0}곳)`, !a.error && a.ok && ov === 0 && (a.n ?? 0) > 0 && extra, `${describeAudit(a)} · 겹침 ${ov}${extra ? '' : ' · 단추 없음'}`);
      const T = a.text ?? {};
      if (name !== 'church') C.check('U4', `${vp} ${name}: 글자 p10 ${T.p10} ≥ 9 · 중앙값 ${T.median} ≥ 10 CSS px`, T.n > 0 && T.p10 >= 9 && T.median >= 10, `min ${T.min} · ${(T.smallest ?? []).join(', ')}`);
      if (name === 'church' || name === 'cg') await C.shot(s, `${vp}_taps_${name}`);
    }
    await C.close(s);
  }
}

// ───────────────────────── U5 메모리 ─────────────────────────
async function U5(C) {
  {
    const s = await C.open('phone1', 'index.html?lo=1', { settings: { quality: 'medium' } });
    await seed(s, 'all', { seen: true });
    await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
    await waitFrames(s.page, { ms: 800, frames: 6, ticks: 4 });
    const f0 = await poolFree(s);
    await openGal(s);
    await s.waitGame('[...(g.top.atlas?.state ?? [])].filter((x) => x === 2).length >= 12', 30000).catch(() => {});
    const at = await s.eval(() => { const t = window.__game.top; return { bytes: t.atlasBytes, w: t.atlas?.cv.width, h: t.atlas?.cv.height, baked: [...(t.atlas?.state ?? [])].filter((x) => x === 2).length, tier: window.__game.tier }; });
    const dec0 = await decodedCg(s);
    C.check('U5', `phone1(${at.tier}) 아틀라스 한 장 ${at.w}×${at.h} = ${(at.bytes / 1048576).toFixed(2)} MB ≤ 3.0 MB · 구운 뒤 원본 ≤ 1장 디코딩`, at.bytes > 0 && at.bytes <= 3 * 1048576 && at.baked >= 12 && dec0.length <= 1, JSON.stringify({ ...at, dec0 }));
    await s.eval(() => window.__game.top.openViewer(4));
    await s.waitGame('g.top.viewer?.shown', 15000).catch(() => {});
    let peak = 0, lo = true;
    for (let k = 0; k < 4; k++) {
      await waitFrames(s.page, { ms: 700, frames: 6, ticks: 4 });
      const d = await decodedCg(s);
      peak = Math.max(peak, d.length);
      if (d.some((x) => !x.lo)) lo = false;
      await s.eval(() => window.__game.top.stepViewer(1));
    }
    await s.waitGame('g.top.viewer?.shown', 15000).catch(() => {});
    await waitFrames(s.page, { ms: 700, frames: 6, ticks: 4 });
    const dv = await decodedCg(s);
    peak = Math.max(peak, dv.length);
    C.check('U5', `크게 보기 중 cg/ 디코딩 최대 ${peak}장 ≤ 2 · lo 파일 (${dv.map((x) => x.key.slice(3) + (x.lo ? '(lo)' : '')).join(',')})`, peak <= 2 && peak >= 1 && lo && dv.every((x) => x.lo), JSON.stringify(dv));
    await s.eval(() => window.__game.top.closeViewer());
    await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
    await waitFrames(s.page, { ms: 800, frames: 6, ticks: 4 });
    const f1 = await poolFree(s);
    const dec1 = await s.eval(async () => { const { assets } = await import('/src/core/assets.js'); return [...assets.cache.values()].filter((e) => e.ok && e.folder === 'cg').length; });
    C.check('U5', `닫은 뒤 canvasPoolStats().free 그대로 (${f0} → ${f1}) · cg/ 디코딩 0`, f1 === f0 && dec1 === 0, `${f0} → ${f1} · cg ${dec1}`);
    await C.close(s);
  }
  {
    const s = await C.open('phone1', 'index.html?scene=hub', { settings: { quality: 'medium' }, pred: `${READY} && g.top?.name === 'hub' && !!g.world` });
    await seed(s, 'all', { seen: true });
    await s.eval(() => window.__game.push('church', {}));
    await s.waitGame("g.top?.name === 'church'", 10000);
    await s.waitGame("(() => { const e = g.assets?.cache?.get('cg/cg_alberto_church'); return !!e?.ok; })()", 15000).catch(() => {});
    await openGal(s, {}, 'push');
    await s.waitGame('[...(g.top.atlas?.state ?? [])].filter((x) => x === 2).length >= 4', 20000).catch(() => {});
    const bakedAlb = await s.eval(() => { const t = window.__game.top, r = t.rows.cg.find((x) => x.id === 'cg_alberto_church'); return t.atlas?.state?.[r.cell] ?? -1; });
    await s.eval(() => window.__game.top.leave());
    await s.waitGame("g.top?.name === 'church'", 10000).catch(() => {});
    await waitFrames(s.page, { ms: 600, frames: 5, ticks: 3 });
    const alb = await s.eval(() => { const e = window.__game.assets?.cache?.get('cg/cg_alberto_church'); return { ok: !!e?.ok, w: e?.img?.naturalWidth ?? 0 }; });
    C.check('U5', '성당에서 회랑을 열고 닫아도 cg/cg_alberto_church 그대로 (썸네일은 캐시 그림으로)', alb.ok && alb.w > 4 && bakedAlb === 2, JSON.stringify({ alb, bakedAlb }));
    await C.close(s);
  }
}

// ───────────────────────── U6 음악실 ─────────────────────────
async function U6(C) {
  const s = await C.open('desk', 'index.html', { initScripts: [() => { window.__BN_AUDIO_CODECS = []; }] });
  await seed(s, 'all', { seen: true });
  await s.eval(async () => { const { audio } = await import('/src/core/audio.js'); audio.unlock(); });
  await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
  await openGal(s, { back: 'title', backIndex: 7, room: 'music' });
  await s.waitGame("g.audio?.ctx?.state === 'running'", 10000).catch(() => {});
  // 재생 → s01 · 배지 합성음
  await s.eval(() => { const t = window.__game.top, k = t.rows.mus.findIndex((r) => r.id === 's01'); t.sel[1] = k; t.activate(k); });
  await waitFrames(s.page, { ms: 900, frames: 8, ticks: 6 });
  let a = await galState(s);
  const badge = await s.eval(() => window.__game.top.badge());
  const an = await s.eval(() => { const t = window.__game.top; return { has: !!t.an, max: Math.max(...t.fft), bars: Math.max(...t.bars) }; });
  C.check('U6', `재생 → audio.current 's01' · 배지 '${badge}' (합성음 강제) · analyser 막대 > 0`, a.current === 's01' && badge === '합성음' && an.has && an.max > 0 && an.bars > 0.05, JSON.stringify({ cur: a.current, badge, an }));
  await C.shot(s, 'desk_music_playing');
  // 배지: 녹음 음원 (recStats 흉내 — 헤드리스 Chromium 은 AAC 를 풀지 못한다) · 불러오는 중
  const b2 = await s.eval(() => { const t = window.__game.top, r0 = t.rec; t.rec = { player: { id: 's01', rec: true }, pend: null }; const x = t.badge(); t.rec = { player: null, pend: 's01' }; const y = t.badge(); t.rec = r0; return [x, y]; });
  C.check('U6', `배지 글: 녹음 '${b2[0]}' · 기다림 '${b2[1]}'`, b2[0] === '녹음 음원' && b2[1] === '불러오는 중…', b2.join(' / '));
  // 재생 시간 · 숨김 → suspended → 이어짐
  await sleep(1200);
  const e0 = await s.eval(() => window.__game.top.elapsed());
  await s.eval(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(700);
  const sus = await s.eval(() => ({ state: window.__game.audio.ctx.state, e: window.__game.top.elapsed() }));
  await sleep(900);
  const e1 = await s.eval(() => window.__game.top.elapsed());
  await s.eval(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(1200);
  const res = await s.eval(() => ({ state: window.__game.audio.ctx.state, e: window.__game.top.elapsed(), cur: window.__game.audio.current }));
  C.check('U6', `visibilitychange 숨김 → '${sus.state}' (시간 멈춤 ${sus.e.toFixed(2)} → ${e1.toFixed(2)}) · 돌아오면 이어짐 (${res.e.toFixed(2)})`, e0 > 0.5 && sus.state === 'suspended' && Math.abs(e1 - sus.e) < 0.05 && res.state === 'running' && res.e > e1 + 0.3 && res.cur === 's01', JSON.stringify({ e0, sus, e1, res }));
  // 같은 곡 다시 = 처음부터 · 정지
  await s.eval(() => { const t = window.__game.top; t.activate(t.sel[1]); });
  await waitFrames(s.page, { ms: 700, frames: 6, ticks: 4 });
  const e2 = await s.eval(() => window.__game.top.elapsed());
  await s.eval(() => { window.__game.top.stopTrack(); });
  a = await galState(s);
  C.check('U6', `같은 곡을 다시 고르면 처음부터 (${e2.toFixed(2)} 초) · 정지 → current null`, e2 < res.e && a.current === null, JSON.stringify({ e2, cur: a.current }));
  // 빠른 → 다섯 번 → 재생 요청 한 번
  await s.eval(async () => { const { audio } = await import('/src/core/audio.js'); const t = window.__game.top; t.sel[1] = t.rows.mus.findIndex((r) => r.id === 's01'); window.__musicCalls = []; const m = audio.music.bind(audio); audio.__qaMusic = m; audio.music = (id, o) => { window.__musicCalls.push(id); return m(id, o); }; });
  for (let k = 0; k < 5; k++) {   // 빠르게 (0.35초 안에 다음 누름)
    await s.page.keyboard.down('ArrowRight'); await waitFrames(s.page, { frames: 2, ticks: 1 });
    await s.page.keyboard.up('ArrowRight'); await waitFrames(s.page, { frames: 1, ticks: 1 });
  }
  await sleep(700);
  const calls = await s.eval(async () => { const { audio } = await import('/src/core/audio.js'); audio.music = audio.__qaMusic; delete audio.__qaMusic; return window.__musicCalls; });
  a = await galState(s);
  const want5 = await s.eval(() => { const t = window.__game.top; return t.rows.mus[t.rows.mus.findIndex((r) => r.id === 's01') + 5].id; });
  C.check('U6', `빠른 →×5 → 재생 요청 한 번 (${calls.join(',')})`, calls.length === 1 && calls[0] === want5 && a.current === want5, JSON.stringify({ calls, cur: a.current, want5 }));
  // 음량 0 안내
  await installTapRecorder(s.page);
  await s.eval(() => { window.__game.settings.__mv = window.__game.settings.musicVol; window.__game.settings.musicVol = 0; });
  const tx = await drawnText(s.page);
  await s.eval(() => { window.__game.settings.musicVol = window.__game.settings.__mv; delete window.__game.settings.__mv; });
  C.check('U6', "음량 0 → '음악 음량이 0입니다 — 설정에서 올리면 들을 수 있습니다'", tx.includes('음악 음량이 0입니다 — 설정에서 올리면 들을 수 있습니다'), tx.filter((x) => /음량/.test(x)).join(','));
  // keepAwake: 음악실에서 곡이 도는 동안만 · 방을 나가면 analyser 끊김
  a = await galState(s);
  const ka = a.keepAwake;
  await s.eval(() => window.__game.top.setRoom(0));
  await waitFrames(s.page, { ms: 300, frames: 4, ticks: 3 });
  const off = await s.eval(() => ({ an: window.__game.audio._an ?? null, top: !!window.__game.top.an, ka: window.__game.top.keepAwake, cur: window.__game.audio.current }));
  C.check('U6', `keepAwake 음악실 ${ka} → 그림 방 ${off.ka} · analyser 끊김 · 곡은 계속 (${off.cur})`, ka === true && off.ka === false && off.an === null && !off.top && off.cur === want5, JSON.stringify(off));
  await s.eval(() => window.__game.top.leave());
  await s.waitGame("g.top?.name === 'title'", 10000).catch(() => {});
  await sleep(300);
  C.check('U6', "타이틀로 나가면 곡 'title'", (await s.eval(() => window.__game.audio.current)) === 'title');
  await C.close(s);
}

// ───────────────────────── U7 극장 ─────────────────────────
async function U7(C) {
  const s = await C.open('desk', 'index.html', { storage: slotStorage(C.fixture) });
  await s.eval(async () => {
    const { saves } = await import('/src/core/save.js');
    const g = window.__game;
    g.meta.endingsSeen = ['bad', 'normal', 'true', 'p2', 'p2true'];
    g.state = saves.read(2);                      // 지난 판의 메모리 사본 (타이틀은 비우지 않는다)
    g.state.progress.flags.qa_unsaved = true;     // 저장하지 않은 진행
    g.gal.rescan('retro');
    window.__writes = 0;
    const w = saves.write.bind(saves);
    saves.write = (...a) => { window.__writes++; return w(...a); };
  });
  await sleep(3500);   // 부팅 뒤 업적·회랑 소급 훑기(한가할 때)가 메타를 쓰고 난 뒤에 사진을 찍는다
  await openGal(s, { back: 'title', backIndex: 7, room: 'theater' });
  await s.eval(() => window.__game.gal.markSeen());   // 회랑을 닫을 때의 seenAt 쓰기를 먼저 (다시 보기와 무관)
  const before = await snapBytes(s);
  const seen0 = await s.eval(() => window.__game.state.progress.seenScripts.length);
  const ids = await s.eval(() => window.__game.top.rows.th.map((r) => r.id));
  C.check('U7', `극장 8줄 모두 열림 (${ids.join(',')})`, ids.length === 8 && (await s.eval(() => window.__game.top.rows.th.every((r) => r.open))));
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k];
    await s.eval(() => { window.__game.toasts.length = 0; });
    await s.eval((k) => { const t = window.__game.top; t.sel[2] = k; t.activate(k); }, k);
    await s.waitGame("g.top?.name === 'story' || g.top?.name === 'credits'", 15000);
    const first = await s.top();
    let story = null;
    if (first === 'story') {
      await waitFrames(s.page, { ms: 500, frames: 5, ticks: 3 });
      story = await s.eval(() => { const t = window.__game.top; return { replay: t.replay, script: t.script, then: t.then, kind: t.thenParams?.kind ?? null, back: t.thenParams?.back ?? null, card: t.card ? `${t.card.eng}|${t.card.kor}` : null, hero: t.state?.charId }; });
      if (id === 'end_true') await C.shot(s, 'desk_replay_true');
      await s.eval(() => { const t = window.__game.top; t.card = null; t.waitT = 0; t.skip(); });
      await s.waitGame("g.top?.name === 'credits' || g.top?.name === 'gallery'", 15000);
    }
    let credits = null;
    if ((await s.top()) === 'credits') {
      await waitFrames(s.page, { ms: 300, frames: 4, ticks: 2 });
      credits = await s.eval(() => { const t = window.__game.top; return { kind: t.kind, back: t.back, from: t.fromEnding }; });
      await s.eval(() => { const t = window.__game.top; t.endRoll(); t.leave(); });
    }
    await s.waitGame(GAL_READY, 15000);
    const after = await snapBytes(s);
    const st = await galState(s);
    const tl = await toasts(s);
    const writes = await s.eval(() => window.__writes);
    const seen1 = await s.eval(() => window.__game.state.progress.seenScripts.length);
    const same = after.state === before.state && Object.keys(before.ls).every((x) => before.ls[x] === after.ls[x]);
    const isEnd = id.startsWith('end_'), isCred = id === 'credits';
    const flowOk = isCred ? first === 'credits' && credits?.kind === null && credits?.back === 'gallery'
      : isEnd ? first === 'story' && story?.replay && story.then === 'credits' && story.kind === id.slice(4) && story.back === 'gallery' && credits?.kind === id.slice(4) && !credits.from
        : first === 'story' && story?.replay && story.then === 'gallery' && !credits;
    C.check('U7', `${id}: ${first}${credits ? ' → credits' : ''} → 회랑(극장 방) · state·슬롯 1–3·메타 바이트 같음 · seenScripts ${seen0} · 쓰기 0 · '획득' 0`,
      flowOk && st.room === 'theater' && same && writes === 0 && seen1 === seen0 && !tl.some((x) => /획득/.test(x)) && (!story || story.hero === 'kael'),
      JSON.stringify({ story, credits, room: st.room, same, writes, seen1, tl: tl.slice(0, 2), diff: Object.keys(before.ls).filter((x) => before.ls[x] !== after.ls[x]) }));
  }
  // 크레딧: 타이틀에서 연 것(back:'title')은 타이틀의 회랑 줄로
  await s.eval(() => window.__game.go('credits', { back: 'title' }, { fade: false }));
  await s.waitGame("g.top?.name === 'credits'", 8000);
  await s.eval(() => { const t = window.__game.top; t.endRoll(); t.leave(); });
  await s.waitGame("g.top?.name === 'title'", 10000).catch(() => {});
  const tm = await titleMenu(s);
  C.check('U7', "크레딧(back:'title') → 타이틀 메뉴 회랑 줄(7)", tm.top === 'title' && tm.idx === 7 && tm.mode === 'menu', JSON.stringify(tm));
  // 극장 크레딧은 backParams 가 없어도 회랑 극장 방으로
  await s.eval(() => window.__game.go('credits', { back: 'gallery' }, { fade: false }));
  await s.waitGame("g.top?.name === 'credits'", 8000);
  await s.eval(() => { const t = window.__game.top; t.endRoll(); t.leave(); });
  await s.waitGame(GAL_READY, 10000).catch(() => {});
  const g2 = await galState(s);
  C.check('U7', "크레딧(back:'gallery', backParams 없음) → 회랑 극장 방", g2.top === 'gallery' && g2.room === 'theater', JSON.stringify({ top: g2.top, room: g2.room }));
  await C.close(s);
  // 엔딩에서 시작한 크레딧(fromEnding)은 예전 흐름 그대로 (2부 엔딩 → 순위권 아니면 마을)
  {
    const s2 = await C.open('desk', 'index.html?scene=hub', { pred: `${READY} && g.top?.name === 'hub' && !!g.world` });
    await s2.eval(() => { const g = window.__game; g.state.score = 0; g.go('credits', { kind: 'p2', fromEnding: true }, { fade: false }); });
    await s2.waitGame("g.top?.name === 'credits'", 8000);
    await s2.eval(() => { const t = window.__game.top; t.endRoll(); t.phase = 'end'; t.phaseT = 9; t.leave(); });
    await s2.waitGame("g.top?.name === 'hub'", 15000).catch(() => {});
    C.check('U7', '엔딩에서 시작한 크레딧(fromEnding) → 예전 흐름(마을)', (await s2.top()) === 'hub', await s2.scenes());
    await C.close(s2);
  }
}

// ───────────────────────── U8 성당 ─────────────────────────
async function U8(C) {
  for (const vp of ['desk', 'phone2']) {
    const s = await C.open(vp, 'index.html?scene=hub', { pred: `${READY} && g.top?.name === 'hub' && !!g.world` });
    await seed(s, 'all', { seen: true });
    await s.eval(async () => { const { audio } = await import('/src/core/audio.js'); audio.unlock(); });
    await s.eval(() => window.__game.push('church', {}));
    await s.waitGame("g.top?.name === 'church'", 10000);
    await s.eval(() => window.__game.top.setTab(3));
    await waitFrames(s.page, { ms: 500, frames: 5, ticks: 3 });
    await C.shot(s, `${vp}_church_save`);
    const geo = await s.eval(() => { const t = window.__game.top; return { act: t.actRect, gal: t.galRect, sel: t.sel, per: (window.__game.cssScale || 1) * (window.__game.uiK || 1) }; });
    const sizeOk = geo.act && geo.gal && geo.act.h * geo.per >= 36 && Math.abs(geo.act.y - geo.gal.y) < 0.5 && geo.gal.x > geo.act.x + geo.act.w && geo.act.w <= 240;
    let rt = null;
    if (vp === 'desk') {
      await s.key('ArrowRight'); const r1 = await s.eval(() => window.__game.top.sel);
      await s.key('ArrowLeft'); const l1 = await s.eval(() => window.__game.top.sel);
      const tab = await s.eval(() => window.__game.top.tab);
      // '여정을 기록한다' 는 예전처럼 (debug 칸에 쓰고 토스트)
      await s.eval(() => { window.__game.toasts.length = 0; });
      await s.key('KeyZ');
      const saved = (await toasts(s)).some((x) => /여정을 기록했다/.test(x));
      // alt 바로가기
      await s.key('KeyA');
      let ok = true; try { await s.waitGame(GAL_READY, 10000); } catch { ok = false; }
      rt = { r1, l1, tab, saved, ok };
      await s.eval(() => window.__game.top.leave());
      await s.waitGame("g.top?.name === 'church'", 10000).catch(() => {});
      await s.key('ArrowRight'); await s.key('KeyZ');
    } else {
      const t = new Touch(s.cdp, s.page);
      await ensureTouchMode(t, s.page, await ui2css(s, 300, 300));
      await tapUi(t, s, geo.gal);
    }
    let ok = true; try { await s.waitGame(GAL_READY, 10000); } catch { ok = false; }
    const st = await galState(s);
    C.check('U8', `${vp} 「여정 기록」 단추 둘 (같은 줄 · 폭 ≤ 240) → '회랑에서 돌아본다' → 회랑(push)${rt ? ' · ←→ · 기록 저장 · alt 바로가기' : ''}`,
      sizeOk && ok && st.pushed && (await s.scenes()).endsWith('church>gallery') && (!rt || (rt.r1 === 1 && rt.l1 === 0 && rt.tab === 3 && rt.saved && rt.ok)), JSON.stringify({ geo, rt, ok, scenes: await s.scenes() }));
    // 극장 꺼짐 + 안내
    await installTapRecorder(s.page);
    await s.eval(() => window.__game.top.setRoom(2));
    await waitFrames(s.page, { ms: 500, frames: 5, ticks: 3 });
    const tx = await drawnText(s.page);
    const thZones = await s.eval(() => window.__game.top.zItems.length);
    await s.eval(() => window.__game.top.activate(0));
    await waitFrames(s.page, { ms: 200, frames: 3, ticks: 2 });
    const stay = await galState(s);
    await C.shot(s, `${vp}_church_theater_off`);
    C.check('U8', `${vp} 극장 꺼짐 (탭 영역 0 · 결정해도 그대로) + '타이틀 화면의 회랑에서 볼 수 있습니다'`, tx.includes('타이틀 화면의 회랑에서 볼 수 있습니다') && thZones === 0 && stay.top === 'gallery', JSON.stringify({ thZones, top: stay.top, msg: stay.msg }));
    // 음악실 s03 → 닫기 → 성당, 곡 church
    await s.eval(() => { const t = window.__game.top; t.setRoom(1); const k = t.rows.mus.findIndex((r) => r.id === 's03'); t.sel[1] = k; t.activate(k); });
    await waitFrames(s.page, { ms: 400, frames: 4, ticks: 3 });
    const cur = await s.eval(() => window.__game.audio.current);
    await s.eval(() => window.__game.top.leave());
    await s.waitGame("g.top?.name === 'church'", 10000).catch(() => {});
    await sleep(300);
    const back = await s.eval(() => ({ top: window.__game.top?.name, music: window.__game.audio.current, scenes: window.__game.scenes.map((x) => x.name).join('>') }));
    C.check('U8', `${vp} 음악실 s03 → 닫기 → 성당 · 곡 'church'`, cur === 's03' && back.top === 'church' && back.music === 'church' && back.scenes === 'hub>church', JSON.stringify({ cur, back }));
    await C.close(s);
  }
}

// ───────────────────────── U9 성능 ─────────────────────────
async function U9(C) {
  const s = await C.open('phone1', 'index.html', { settings: { quality: 'medium' }, initScripts: [perfProbeInit()], storage: slotStorage(C.fixture) });
  await seed(s, 'all');   // NEW 마름모까지 (가장 무거운 상태)
  await openGal(s);
  await s.waitGame('[...(g.top.atlas?.state ?? [])].filter((x) => x === 2).length >= 34', 40000).catch(() => {});
  await waitFrames(s.page, { ms: 600, frames: 6, ticks: 4 });
  const tier = await s.eval(() => window.__game.tier);
  await freeze(s.page);
  const flush = () => s.eval(() => { window.__game.ctx.getImageData(0, 0, 1, 1); });
  const runP = async (label, setup) => {
    if (setup) await s.eval(setup);
    await measureFrames(s.page, 10); await flush();
    const frames = [], sites = [];
    for (let k = 0; k < 3; k++) { const r = await measureFrames(s.page, 30); frames.push(...r.frames); sites.push(...r.sites.grad, ...r.sites.canv); await flush(); }
    const ms = frames.map((f) => f.ms), grad = frames.map((f) => f.grad), canv = frames.map((f) => f.canv);
    return { label, ms: stats(ms), gradMax: Math.max(...grad), canvMax: Math.max(...canv), sites: sites.slice(0, 3) };
  };
  const list = await runP('그림 목록');
  const viewer = await runP('크게 보기', () => { const t = window.__game.top; t.openViewer(3); });
  await unfreeze(s.page);
  await s.waitGame('g.top.viewer?.shown', 15000).catch(() => {});
  await freeze(s.page);
  const viewer2 = await runP('크게 보기(그림)', () => { window.__game.top.viewer.ui = 99; });
  const music = await runP('음악실', () => { const t = window.__game.top; t.closeViewer(); t.setRoom(1); });
  const theater = await runP('극장', () => { window.__game.top.setRoom(2); });
  await unfreeze(s.page);
  C.R.perf = { vp: 'phone1', tier, list, viewer, viewer2, music, theater };
  for (const p of [list, viewer2, music, theater]) {
    C.check('U9', `phone1(${tier}) ${p.label} 그리기 p95 ${p.ms.p95} ms ≤ 3 ms · 프레임마다 새 그라디언트·캔버스 0`, p.ms.p95 <= 3 && p.gradMax === 0 && p.canvMax === 0,
      `avg ${p.ms.avg} p50 ${p.ms.p50} p95 ${p.ms.p95} max ${p.ms.max} · grad ${p.gradMax} · canv ${p.canvMax} ${JSON.stringify(p.sites)}`);
  }
  // 캔버스 풀: 10초 (방 넘기기 · 스크롤 · 크게 보기 열고 닫기)
  await s.eval(() => window.__game.top.setRoom(0));
  await waitFrames(s.page, { ms: 600, frames: 6, ticks: 3 });
  const f0 = await poolFree(s);
  for (let k = 0; k < 5; k++) {
    await s.eval((k) => { const t = window.__game.top; t.setRoom(k % 3); t.scs[k % 3].target = 140; if (k === 1) { t.setRoom(0); t.openViewer(5); } if (k === 2) t.closeViewer(); }, k);
    await sleep(2000);
  }
  const f1 = await poolFree(s);
  C.check('U9', `10초 동안 canvasPoolStats().free 변화 0 (${f0} → ${f1})`, f0 === f1, `${f0} → ${f1}`);
  await C.close(s);
}

// ───────────────────────── U10 오류 ─────────────────────────
async function U10(C) {
  const s = await C.open('desk');
  await installTapRecorder(s.page);
  await s.eval(() => { const g = window.__game; g.__galSaved = g.gal; delete g.gal; });
  await openGal(s);
  let tx = await drawnText(s.page);
  let st = await galState(s);
  await s.eval(() => window.__game.top.setRoom(1));
  await waitFrames(s.page, { ms: 300, frames: 4, ticks: 3 });
  await s.key('KeyZ');
  await s.eval(() => window.__game.top.setRoom(2));
  await waitFrames(s.page, { ms: 300, frames: 4, ticks: 3 });
  const th = await s.eval(() => window.__game.top.rows.th.filter((r) => r.open).map((r) => r.id));
  await C.shot(s, 'desk_noengine');
  C.check('U10', "game.gal 없음: '회랑 정보를 불러오지 못했습니다' · 모두 잠김(always 만) · 2부 숨김 · 던짐 0", st.err && tx.includes('회랑 정보를 불러오지 못했습니다') && st.sum.cg.got === 0 && st.sum.cg.total === 20 && st.sum.mus.total === 33 && th.join() === 'credits',
    JSON.stringify({ err: st.err, sum: st.sum, th }));
  // 엔진이 늦게 오면 다시 읽는다
  await s.eval(() => { const g = window.__game; g.gal = g.__galSaved; });
  await waitFrames(s.page, { ms: 800, frames: 6, ticks: 4 });
  st = await galState(s);
  tx = await drawnText(s.page);
  C.check('U10', '엔진이 늦게 오면 다시 읽어 안내 줄이 사라짐', !st.err && !tx.includes('회랑 정보를 불러오지 못했습니다'), JSON.stringify({ err: st.err }));
  await C.close(s);
}

// ───────────────────────── 명령줄 ─────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1].split(',').map((x) => x.trim()).filter(Boolean) : null; };
  const t0 = Date.now();
  const r = await run({ only: val('--only'), vp: val('--vp') });
  console.log(`\n통과 ${r.passes}, 실패 ${r.fails}, 오류 ${r.errors.length} (${((Date.now() - t0) / 1000).toFixed(0)}초) — ${path.join(OUT, 'gallery_ui.json')}`);
  process.exit(r.ok ? 0 : 1);
}
