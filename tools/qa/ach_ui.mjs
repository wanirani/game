// 업적 UI 헤드리스 시험 — docs/specs/achievements.md §12.2 U1–U10 (ACH-UI)
//
//   node tools/qa/ach_ui.mjs [--only U1,U3] [--vp desk,phone1,phone2]
//   import run from './tools/qa/ach_ui.mjs'; const r = await run({ only: ['U2'] });   // tools/test_achievements.mjs --ui
//     → { ok, passes, fails, results: [{id, name, pass, detail}], errors: [...], perf }
//
// 사례
//   U1 들어가기   desk·phone1·phone2: 타이틀 메뉴 8줄이 안전 영역 안이고 알림 카드(새 버전·홈 화면에 추가·APK)와 겹치지 않음
//                 (+ phone2 노치 47/47/0/21 · safeArea 'full') · '업적' → 장면 · 스크린숏 {vp}_{title,list,detail,titles}.png
//   U2 상태       빈 메타 0/67·숨긴 줄 '숨겨진 업적'·'?' · 반쯤 채운 메타(NEW·분류 수·점수·막대 '640 / 1,000') · 모두 달성 → 모두 공개
//   U3 조작       키보드(E·Q·↓×5·Z·X·A → t_dawn → X) · 패드(fakepad LB·RB·D-pad·A/B, 결정 위치 'east' 설정) · 터치(칩·끌기·줄·'이명 · 외형' 단추·밀기)
//   U4 탭 크기    tools/qa/lib/taps.mjs auditScene phone1·phone2: 목록·자세히·이명 창 — primary ≥ 44 · list ≥ 36 CSS px, 겹침 0
//   U5 메뉴 길    ?scene=hub → 메뉴 '기록' → [설정 | 업적] → 장면 → 닫으면 기록 탭 · ←→ · 단추 높이 ≥ 44 CSS · 클라우드 단추와 겹침 0
//   U6 받기       마을: 골드·아이템·claimed · 두 번째는 '받을 보상이 없습니다' · 스테이지: 꺼짐 + '마을에서 받을 수 있습니다'
//   U7 알림       보스전 미룸 → 클리어 뒤 토스트 · story/ending 미룸 · 소급 요약은 타이틀 메뉴가 열린 뒤 · 셋 이상 → 한 줄 · 업적 화면이면 반짝임
//   U8 장식       d_gold 불씨 색 · d_crow 박쥐 두 배 · d_moon 달 (스크린숏)
//   U9 순위표     /api/boards 흉내: t_dawn → '「새벽을 연 자」' · t_zzz → 별명만 · 좁은 열에서 별명 그대로
//   U10 오류·성능 모든 사례 페이지·콘솔 오류 0 · phone1 그리기 p95 ≤ 3 ms (perfprobe, 품질 medium) · 10초 동안 canvasPoolStats().free 그대로
//   U11 외형 쪽   이명 창 '외형' 탭(터치) · 잠긴 잔상 → 조건 한 줄 · 가진 잔상 → meta.ach.cos.trail (+ 기기 메타) · 키보드 E·Q 순환 · 탭 크기 phone1·phone2
// 결과 /tmp/claude-0/ach_ui/ach_ui.json, 스크린숏 /tmp/claude-0/ach_ui/*.png
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openEnv, waitFrames } from './lib/server.mjs';
import { contextOptions, NOTCH_INSETS } from './lib/viewports.mjs';
import { installTapRecorder, auditScene, describeAudit, drawnText } from './lib/taps.mjs';
import { fakePadInit, connect, press, BTN } from './lib/fakepad.mjs';
import { perfProbeInit, measureFrames, stats } from './lib/perfprobe.mjs';
import { freeze, unfreeze } from './lib/step.mjs';
import { Touch, ensureTouchMode } from './lib/touch.mjs';

const OUT = '/tmp/claude-0/ach_ui';
const ALL = ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8', 'U9', 'U10', 'U11'];
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
/** 아이폰 사파리처럼 전체 화면 API 없음 → '홈 화면에 추가' 카드 */
const NO_FS = () => { try { Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false }); Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false }); } catch { /* 무시 */ } };
const READY = 'g.scenesReady !== false && !!g.ach && !!g.achNotify';
const ACH_READY = "g.top?.name === 'achievements' && !!g.top._L && (g.fade?.a ?? 0) < 0.05";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inter = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;

export default async function run(opts = {}) {
  const only = Array.isArray(opts.only) ? opts.only : null;
  const vps = Array.isArray(opts.vp) && opts.vp.length ? opts.vp : ['desk', 'phone1', 'phone2'];
  const want = (id) => !only || only.includes(id);
  fs.mkdirSync(OUT, { recursive: true });
  const R = { passes: 0, fails: 0, results: [], errors: [], perf: null, shots: [] };
  const check = (id, name, pass, detail = '') => {
    R.results.push({ id, name, pass: !!pass, detail: String(detail).slice(0, 600) });
    if (pass) R.passes++; else R.fails++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`);
  };
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
  const C = { env, open, close, shot, check, vps, R };
  const cases = { U1, U2, U3, U4, U5, U6, U7, U8, U9, U10, U11 };
  try {
    for (const id of ALL) {
      if (!want(id)) continue;
      const t0 = Date.now();
      try { await cases[id](C); } catch (e) { check(id, '시험 실행', false, e?.stack ?? e); }
      for (const s of [...live]) await close(s);
      console.log(`   (${id} ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
    }
    if (want('U10')) check('U10', `모든 사례 페이지·콘솔 오류 0`, R.errors.length === 0, R.errors.slice(0, 6).join(' | '));
  } finally {
    for (const s of [...live]) await close(s).catch(() => {});
    await env.close().catch(() => {});
  }
  const out = { ok: R.fails === 0, passes: R.passes, fails: R.fails, results: R.results, errors: R.errors, perf: R.perf, shots: R.shots };
  try { fs.writeFileSync(path.join(OUT, 'ach_ui.json'), JSON.stringify(out, null, 1)); } catch { /* 무시 */ }
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
async function tapUi(t, s, r) { const [x, y] = await ui2css(s, r.x + r.w / 2, r.y + r.h / 2); await t.tap(x, y, 70); await waitFrames(s.page, { ms: 120, frames: 3, ticks: 2 }); }
/** 업적 화면 상태 요약 */
function achState(s) {
  return s.eval(() => {
    const g = window.__game, t = g.top;
    if (t?.name !== 'achievements') return { top: t?.name ?? null };
    const m = t.modal;
    return {
      top: t.name, ci: t.ci, cat: t.cats[t.ci]?.id, i: t.i, n: t.list().length, focus: t.focus, scY: t.sc.y,
      modal: m ? m.kind : null, mi: m?.i ?? null, pickL: m?.L ?? null, pickK: m?.k ? [...m.k] : null, pickId: m?.kind === 'pick' ? m.lists[m.L][m.k[m.L]]?.id ?? null : undefined,
      msg: t.msg?.text ?? null, wide: !!t._L?.wide, sum: { ...t.sum }, err: t.err, claimOK: t.claimOK, reason: t.claimReason(),
    };
  });
}
async function openAch(s, params = {}, how = 'go') {
  await s.eval(([p, how]) => { const g = window.__game; if (how === 'push') g.push('achievements', p); else g.go('achievements', p, { fade: false }); }, [params, how]);
  await s.waitGame(ACH_READY, 20000);
  await waitFrames(s.page, { ms: 350, frames: 6, ticks: 4 });
}
const grant = (s, ids, src = 'live') => s.eval(([ids, src]) => { for (const id of ids) window.__game.ach._grant(id, src); }, [ids, src]);
const toasts = (s) => s.eval(() => (window.__game.toasts || []).map((t) => t.text));
async function waitToast(s, re, ms = 2500) {
  const t0 = Date.now();
  for (;;) {
    const list = await toasts(s);
    const hit = list.find((x) => re.test(x));
    if (hit) return hit;
    if (Date.now() - t0 > ms) return null;
    await sleep(100);
  }
}
/** meta.ach 를 통째로 바꾼다 (엔진은 쓸 때마다 ensureAch 로 읽는다) */
const setAch = (s, ach) => s.eval(async (ach) => { const M = await import('/src/core/ach_meta.js'); const g = window.__game; g.meta.ach = ach; M.ensureAch(g.meta); }, ach);

// ───────────────────────── U1 들어가기 ─────────────────────────
async function U1(C) {
  for (const vp of C.vps) {
    const touch = vp !== 'desk';
    const ctx = touch ? { ...contextOptions(vp), userAgent: IOS_UA, tag: vp } : vp;
    const s = await C.open(ctx, 'index.html', touch ? { initScripts: [NO_FS] } : {});
    await grant(s, ['st_s01', 'st_end1']);
    await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
    await s.waitGame("g.top?.name === 'title' && g.top.menuK > 0.98");
    // 알림 카드를 가장 많이: 새 버전 (+ 아이폰: 홈 화면에 추가) + APK
    await s.eval(() => { const t = window.__game.top; t.upd = () => {}; t.apk = { info: null }; });
    await waitFrames(s.page, { ms: 900, frames: 8, ticks: 4 });
    const m = await titleGeom(s);
    C.check('U1', `${vp} 타이틀 메뉴 8줄 ('업적' 5번째)`, m.n === 8 && m.ids[4] === 'ach', m.ids.join(','));
    const cardsOk = touch ? m.cards.some((c) => c.id === 'a2hs') : m.cards.length >= 2;
    C.check('U1', `${vp} 메뉴 줄이 안전 영역 안 · 알림 카드 ${m.cards.length}장(${m.cards.map((c) => c.id).join('·')})과 겹침 0`, m.inside && m.overlap === 0 && cardsOk,
      `y0 ${m.rows[0]?.y.toFixed(1)} · 마지막 줄 끝 ${(m.rows[7]?.y + m.rows[7]?.h).toFixed(1)} / 안전 아래 ${m.safe.b.toFixed(1)} · 겹침 ${m.overlap}`);
    C.check('U1', `${vp} 안 본 업적: '업적' 줄 NEW 2`, m.achNew === 2, `achNew ${m.achNew}`);
    await C.shot(s, `${vp}_title`);
    // '업적' 고르기 → 장면
    if (touch) {
      const t = new Touch(s.cdp, s.page);
      await tapUi(t, s, m.rows[4]);   // 터치: 첫 탭은 고르기
      await tapUi(t, s, m.rows[4]);   // 두 번째 탭은 결정
    } else {
      const idx = await s.eval(() => window.__game.top.menu.index);
      for (let k = idx; k < 4; k++) await s.key('ArrowDown');
      await s.key('KeyZ');
    }
    let ok = true;
    try { await s.waitGame(ACH_READY, 15000); } catch { ok = false; }
    C.check('U1', `${vp} '업적' → 업적 장면`, ok, await s.top());
    if (!ok) { await C.close(s); continue; }
    await waitFrames(s.page, { ms: 600, frames: 6, ticks: 4 });
    await C.shot(s, `${vp}_list`);
    if (touch) {
      const r = await s.eval(() => window.__game.top.zRows.find((z) => z.k === 1 && !z.r.thid)?.r);
      await tapUi(new Touch(s.cdp, s.page), s, r);
    } else { await s.key('ArrowDown'); await s.key('KeyZ'); }
    await waitFrames(s.page, { ms: 400, frames: 5, ticks: 3 });
    const d = await achState(s);
    C.check('U1', `${vp} 자세히 창`, d.modal === 'detail' && d.mi === 1, JSON.stringify({ modal: d.modal, mi: d.mi }));
    await C.shot(s, `${vp}_detail`);
    if (touch) { await s.eval(() => { window.__game.top.modal = null; }); const r = await s.eval(() => window.__game.top.zTitles); await tapUi(new Touch(s.cdp, s.page), s, r); }
    else { await s.key('KeyX'); await s.key('KeyA'); }
    await waitFrames(s.page, { ms: 400, frames: 5, ticks: 3 });
    const p = await achState(s);
    C.check('U1', `${vp} 이명 · 장식 창`, p.modal === 'pick', p.modal);
    await C.shot(s, `${vp}_titles`);
    await C.close(s);
  }
  // 노치 + safeArea 'full' (phone2: 가장 낮은 지원 화면에 가장자리 인셋)
  const s = await C.open('phone2', 'index.html', { insets: NOTCH_INSETS, settings: { safeArea: 'full' } });
  await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
  await s.waitGame("g.top?.name === 'title' && g.top.menuK > 0.98");
  await s.eval(() => { const t = window.__game.top; t.upd = () => {}; t.apk = { info: null }; });
  await waitFrames(s.page, { ms: 700, frames: 6, ticks: 4 });
  const m = await titleGeom(s);
  C.check('U1', `phone2 노치 47/47/0/21 · safeArea 'full': 메뉴 8줄이 안전 영역 안 · 카드와 겹침 0`, m.n === 8 && m.inside && m.overlap === 0,
    `안전 l ${m.safe.l.toFixed(1)} b ${m.safe.b.toFixed(1)} · 첫 줄 x ${m.rows[0]?.x} y ${m.rows[0]?.y.toFixed(1)} · 끝 ${(m.rows[7]?.y + m.rows[7]?.h).toFixed(1)}`);
  await C.shot(s, 'phone2_title_notch');
}
function titleGeom(s) {
  return s.eval(() => {
    const g = window.__game, t = g.top, L = t.layout();
    const rows = t.menu.rects.slice(0, t.items.length).map((r) => r && { x: r.x, y: r.y, w: r.w, h: r.h });
    const cards = L.cards.map((c) => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h }));
    const safe = { l: L.sl, r: L.W - L.sr, t: L.st, b: L.H - L.sb };
    const inside = rows.length === t.items.length && rows.every((r) => r && r.x >= safe.l - 0.5 && r.y >= safe.t - 0.5 && r.x + r.w <= safe.r + 0.5 && r.y + r.h <= safe.b + 0.5);
    let overlap = 0;
    for (const r of rows) for (const c of cards) if (r && Math.min(r.x + r.w, c.x + c.w) > Math.max(r.x, c.x) && Math.min(r.y + r.h, c.y + c.h) > Math.max(r.y, c.y)) overlap++;
    return { n: t.items.length, ids: t.items.map((i) => i.id), rows, cards, safe, inside, overlap, achNew: t.achNew };
  });
}

// ───────────────────────── U2 상태 ─────────────────────────
async function U2(C) {
  for (const vp of ['desk', 'phone2']) {
    const s = await C.open(vp);
    await installTapRecorder(s.page);
    // 빈 메타
    await openAch(s, {});
    let st = await achState(s);
    C.check('U2', `${vp} 빈 메타: 0 / 67 · 점수 0 / 1,630`, st.sum.got === 0 && st.sum.total === 67 && st.sum.pts === 0 && st.sum.ptsMax === 1630 && !st.err, JSON.stringify(st.sum));
    let tx = await drawnText(s.page);
    const head = st.wide ? '달성 0 / 67 · 업적 점수 0 / 1,630' : '0/67 · 0점';
    C.check('U2', `${vp} 머리 글 '${head}'`, tx.includes(head), tx.filter((x) => /67/.test(x)).join(' | '));
    await s.eval(() => window.__game.top.setCat(8));
    await waitFrames(s.page, { ms: 450, frames: 6, ticks: 4 });
    tx = await drawnText(s.page);
    C.check('U2', `${vp} 숨긴 줄: '숨겨진 업적' · 메달 '?'`, tx.includes('숨겨진 업적') && tx.includes('?') && !tx.includes('옛 주문'), tx.slice(0, 12).join(' | '));
    if (vp === 'desk') await C.shot(s, 'desk_state_empty');
    // 반쯤 채운 메타 (NEW 포함): 짝수 번째 업적 (cb_kill_1k · ch_all 빼고), 뒤쪽 절반은 seenAt 뒤라 NEW
    const exp = await s.eval(() => {
      const defs = window.__game.ach.defs, t0 = Date.parse('2026-10-01T00:00:00Z');
      const half = defs.filter((d, i) => i % 2 === 0 && d.id !== 'cb_kill_1k' && d.id !== 'ch_all');
      const got = {};
      half.forEach((d, i) => { got[d.id] = t0 + i * 60000; });
      const seenAt = t0 + Math.floor(half.length / 2) * 60000 - 1;
      const byCat = {};
      for (const d of defs) { const c = (byCat[d.cat] ||= { got: 0, total: 0 }); c.total++; if (got[d.id]) c.got++; }
      return { ach: { v: 1, got, prog: { kills: 640 }, claimed: [], seenAt, title: null, deco: null }, n: half.length, pts: half.reduce((a, d) => a + d.pts, 0), isNew: half.filter((d) => got[d.id] > seenAt).length, byCat };
    });
    await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
    await setAch(s, exp.ach);
    await openAch(s, {});
    st = await achState(s);
    const info = await s.eval(() => { const t = window.__game.top; return { cats: t.cats.map((c, i) => ({ id: c.id, ...t.catInfo[i] })), isNew: t.rowsAll.filter((r) => r.isNew).length, kill: t.rowsAll.find((r) => r.def.id === 'cb_kill_1k')?.progWide }; });
    const catsOk = info.cats.filter((c) => c.id !== 'all').every((c) => exp.byCat[c.id] && exp.byCat[c.id].got === c.got && exp.byCat[c.id].total === c.total);
    C.check('U2', `${vp} 반쯤: 달성 ${exp.n} · 점수 ${exp.pts} · 분류별 수`, st.sum.got === exp.n && st.sum.pts === exp.pts && catsOk, JSON.stringify(info.cats.map((c) => `${c.id}:${c.got}/${c.total}`)));
    C.check('U2', `${vp} 반쯤: NEW ${exp.isNew}줄 (요약 unseen ${st.sum.unseen})`, info.isNew === exp.isNew && st.sum.unseen === exp.isNew, `isNew ${info.isNew}`);
    await s.eval(() => window.__game.top.setCat(2));   // 전투: cb_kill_1k 가 첫 줄
    await waitFrames(s.page, { ms: 450, frames: 6, ticks: 4 });
    tx = await drawnText(s.page);
    const bar = st.wide ? '640 / 1,000' : '640/1000';
    C.check('U2', `${vp} 막대 글 '${bar}'`, info.kill === '640 / 1,000' && tx.includes(bar), `progWide ${info.kill}`);
    if (vp === 'desk') { await s.eval(() => window.__game.top.setCat(0)); await waitFrames(s.page, { ms: 400, frames: 5, ticks: 3 }); await C.shot(s, 'desk_state_half'); }
    else await C.shot(s, 'phone2_state_half');
    // 모두 달성
    await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
    await s.eval(async () => { const M = await import('/src/core/ach_meta.js'); const g = window.__game, got = {}; g.ach.defs.forEach((d, i) => { got[d.id] = Date.parse('2026-10-02T00:00:00Z') + i; }); g.meta.ach = { v: 1, got, prog: {}, claimed: [], seenAt: Date.now(), title: null, deco: null }; M.ensureAch(g.meta); });
    await openAch(s, { cat: 'secret' });
    st = await achState(s);
    tx = await drawnText(s.page);
    C.check('U2', `${vp} ch_all 달성: 67 / 67 · 1,630 · 숨긴 업적 모두 공개`, st.sum.got === 67 && st.sum.pts === 1630 && st.cat === 'secret' && !tx.includes('숨겨진 업적') && tx.includes('옛 주문'), `${st.sum.got} ${st.sum.pts} ${st.cat}`);
    if (vp === 'desk') await C.shot(s, 'desk_state_all');
    // 엔진이 없을 때 (§7.1): 데이터만으로 모두 미달성 + 한 줄, 던지지 않는다 · 받기는 꺼짐
    if (vp === 'desk') {
      await s.eval(() => { const g = window.__game; g.go('title', { menu: true }, { fade: false }); g.__achSaved = g.ach; delete g.ach; });
      await openAch(s, {});
      const fb = await achState(s);
      tx = await drawnText(s.page);
      await s.key('KeyC'); await s.key('KeyA');
      const fb2 = await achState(s);
      await C.shot(s, 'desk_state_noengine');
      await s.eval(() => { const g = window.__game; g.top.modal = null; g.ach = g.__achSaved; });
      C.check('U2', "엔진 없음: 67줄 모두 미달성 · '업적 정보를 불러오지 못했습니다' · 받기 꺼짐 · 이명 창 열림", fb.err && fb.n === 67 && fb.sum.got === 0 && tx.includes('업적 정보를 불러오지 못했습니다') && !fb.claimOK && fb2.modal === 'pick',
        JSON.stringify({ err: fb.err, n: fb.n, got: fb.sum.got, modal: fb2.modal }));
    }
    await C.close(s);
  }
}

// ───────────────────────── U3 조작 ─────────────────────────
async function U3(C) {
  // 키보드 (desk)
  {
    const s = await C.open('desk');
    await grant(s, ['st_end1']);   // 이명 「새벽을 연 자」
    await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
    await openAch(s, { back: 'title' });
    await s.key('KeyE'); let a = await achState(s);
    const e1 = a.ci === 1;
    await s.key('KeyQ'); a = await achState(s);
    C.check('U3', 'kb E·Q → 분류 앞뒤', e1 && a.ci === 0, `ci ${a.ci}`);
    for (let k = 0; k < 5; k++) await s.key('ArrowDown');
    a = await achState(s);
    C.check('U3', 'kb ↓×5 → 6번째 줄 (목록이 따라 내려감)', a.i === 5, `i ${a.i} scY ${a.scY.toFixed(1)}`);
    await s.key('KeyZ'); a = await achState(s);
    const z = a.modal === 'detail' && a.mi === 5;
    await s.key('KeyX'); a = await achState(s);
    C.check('U3', 'kb Z 자세히 · X 닫기', z && a.modal === null, `modal ${a.modal}`);
    await s.key('ArrowLeft'); a = await achState(s);
    const lf = a.focus === 'cats';
    await s.key('ArrowDown'); a = await achState(s);
    const cd = a.ci === 1;
    await s.key('ArrowRight'); a = await achState(s);
    C.check('U3', 'kb ← 분류 칸 · ↓ 분류 · → 목록', lf && cd && a.focus === 'list', `focus ${a.focus} ci ${a.ci}`);
    await s.key('KeyA'); a = await achState(s);
    const pk = a.modal === 'pick';
    await s.key('ArrowDown'); a = await achState(s);
    const onDawn = a.pickId === 't_dawn';
    await s.key('KeyZ');
    const title = await s.eval(() => window.__game.meta.ach.title);
    C.check('U3', "kb A 이명 창 → ↓ 't_dawn' → Z → meta.ach.title === 't_dawn'", pk && onDawn && title === 't_dawn', `pick ${pk} id ${a.pickId} title ${title}`);
    await s.key('KeyX'); await s.key('KeyX');
    await s.waitGame("g.top?.name === 'title'", 10000).catch(() => {});
    const tt = await s.eval(() => ({ top: window.__game.top?.name, idx: window.__game.top?.menu?.index, mode: window.__game.top?.mode }));
    C.check('U3', 'kb X → 타이틀 메뉴의 \'업적\' 줄', tt.top === 'title' && tt.idx === 4 && tt.mode === 'menu', JSON.stringify(tt));
    await C.close(s);
  }
  // 패드 (fakepad, 결정 위치 auto = 아래 A / 설정 'east' = 오른쪽 B)
  for (const confirm of ['auto', 'east']) {
    const s = await C.open('desk', 'index.html', { initScripts: [fakePadInit()], settings: { ctrlConfirm: confirm } });
    await connect(s.page);
    await waitFrames(s.page, { ms: 200, frames: 4, ticks: 2 });
    await openAch(s, {});
    const [OK, NO] = confirm === 'east' ? [BTN.B, BTN.A] : [BTN.A, BTN.B];
    await press(s.page, BTN.RB); let a = await achState(s);
    const rb = a.ci === 1;
    await press(s.page, BTN.LB); a = await achState(s);
    const lb = a.ci === 0;
    await press(s.page, BTN.DOWN); await press(s.page, BTN.DOWN); a = await achState(s);
    const dn = a.i === 2;
    await press(s.page, OK); a = await achState(s);
    const det = a.modal === 'detail' && a.mi === 2;
    await press(s.page, NO); a = await achState(s);
    const cl = a.modal === null;
    await press(s.page, BTN.Y); a = await achState(s);
    const pk = a.modal === 'pick';
    await press(s.page, NO); a = await achState(s);
    const pkc = a.modal === null;
    await press(s.page, BTN.LT); a = await achState(s);
    const lt = /이어하기로 슬롯을 불러온 뒤 받을 수 있습니다/.test(a.msg ?? '');
    C.check('U3', `pad(${confirm}) RB·LB 분류 · D-pad · ${confirm === 'east' ? 'B' : 'A'} 자세히 · ${confirm === 'east' ? 'A' : 'B'} 닫기 · Y 이명 창 · LT 받기(이유)`, rb && lb && dn && det && cl && pk && pkc && lt,
      JSON.stringify({ rb, lb, dn, det, cl, pk, pkc, lt, msg: a.msg }));
    if (confirm === 'auto') {
      // 패드 글리프 안내 (키보드 글자가 보이지 않는다)
      const tx = await (async () => { await installTapRecorder(s.page); return drawnText(s.page, { minY: 540 - 40 }); })();
      C.check('U3', 'pad: 바닥 안내에 키보드 글자 없음', !tx.some((x) => /^(Z|X|Q|E|A|C)$/.test(x)), tx.join(' | '));
    }
    await C.close(s);
  }
  // 터치 (phone2)
  {
    const s = await C.open('phone2');
    await grant(s, ['st_end1', 'st_s01']);
    await openAch(s, {});
    const t = new Touch(s.cdp, s.page);
    // 첫 터치는 터치 모드 전환·전체 화면(설정 fullscreenAuto)에 쓰인다 → 머리 가운데 빈 곳을 한 번
    const [hx, hy] = await ui2css(s, 444, 24);
    await ensureTouchMode(t, s.page, [hx, hy]); await waitFrames(s.page, { ms: 300, frames: 4, ticks: 2 });
    const chip = (k) => s.eval((k) => window.__game.top.zCats[k], k);
    await tapUi(t, s, await chip(2)); let a = await achState(s);
    const c2 = a.ci === 2;
    await tapUi(t, s, await chip(0)); a = await achState(s);
    C.check('U3', 'touch 칩 탭 → 분류', c2 && a.ci === 0, `ci ${a.ci}`);
    const LR = await s.eval(() => window.__game.top._L.list);
    const [x0, y0] = await ui2css(s, LR.x + LR.w * 0.5, LR.y + LR.h * 0.8);
    const [, y1] = await ui2css(s, 0, LR.y + LR.h * 0.15);
    await t.drag(x0, y0, x0, y1, { steps: 10, stepMs: 20, hold: 120 });
    await waitFrames(s.page, { ms: 400, frames: 5, ticks: 3 });
    a = await achState(s);
    C.check('U3', 'touch 목록 끌기 → 스크롤', a.scY > 40 && a.modal === null, `scY ${a.scY.toFixed(1)}`);
    const row = await s.eval(() => { const z = window.__game.top.zRows.find((q) => !q.r.thid && q.k > 0); return z ? { k: z.k, r: z.r } : null; });
    await tapUi(t, s, row.r); a = await achState(s);
    C.check('U3', 'touch 줄 탭 → 그 줄 자세히', a.modal === 'detail' && a.mi === row.k, `modal ${a.modal} mi ${a.mi} k ${row.k}`);
    const box = await s.eval(() => window.__game.top.modal?.box);
    const [ox, oy] = await ui2css(s, 6, box ? box.y + box.h / 2 : 200);
    await t.tap(ox, oy, 60); await waitFrames(s.page, { ms: 200, frames: 4, ticks: 2 });
    a = await achState(s);
    const outside = a.modal === null;
    await tapUi(t, s, await s.eval(() => window.__game.top.zTitles)); a = await achState(s);
    const pick = a.modal === 'pick';
    const dawn = await s.eval(() => window.__game.top.modal.zones[0].find((z) => z.k === 1 && !z.r.thid)?.r);
    await tapUi(t, s, dawn);
    const title = await s.eval(() => window.__game.meta.ach.title);
    C.check('U3', "touch 바깥 탭 닫기 · '이명 · 외형' 단추 → 「새벽을 연 자」 탭 → 정함", outside && pick && title === 't_dawn', JSON.stringify({ outside, pick, title }));
    await C.shot(s, 'phone2_touch_pick');
    await tapUi(t, s, await s.eval(() => window.__game.top.modal.closeR)); a = await achState(s);
    const closed = a.modal === null;
    // 목록 가로 밀기 → 다음 분류
    const [sx, sy] = await ui2css(s, LR.x + LR.w * 0.7, LR.y + LR.h * 0.5);
    const [ex] = await ui2css(s, LR.x + LR.w * 0.2, 0);
    await t.drag(sx, sy, ex, sy + 4, { steps: 6, stepMs: 12 });
    await waitFrames(s.page, { ms: 300, frames: 4, ticks: 3 });
    a = await achState(s);
    C.check('U3', 'touch ✕ 닫기 · 목록 왼쪽으로 밀기 → 다음 분류', closed && a.ci === 1, `closed ${closed} ci ${a.ci}`);
    await C.close(s);
  }
}

// ───────────────────────── U4 탭 크기 ─────────────────────────
async function U4(C) {
  for (const vp of ['phone1', 'phone2']) {
    const s = await C.open(vp);
    await grant(s, ['st_end1', 'st_s01', 'cb_kill_1k']);
    await installTapRecorder(s.page);
    const views = [
      ['list', "__game.go('achievements', {back:'title'}, {fade:false})", 1300],
      ['list-scrolled', "(__game.top.sc.target = 150, __game.top.chipX = 40, 0)", 700],
      ['detail', "(__game.top.openDetail(3), 0)", 700],
      ['pick', "(__game.top.modal = null, __game.top.openPick(), 0)", 800],
      ['pick-scrolled', "(__game.top.modal.scs[0].target = 60, 0)", 600],
    ];
    for (const [name, ev, wait] of views) {
      const a = await auditScene(s.page, ev, { wait });
      const regs = a.regions ?? [];
      let ov = 0;
      for (let i = 0; i < regs.length; i++) for (let j = i + 1; j < regs.length; j++) {
        const p = { x: regs[i].lx, y: regs[i].ly, w: regs[i].lw, h: regs[i].lh }, q = { x: regs[j].lx, y: regs[j].ly, w: regs[j].lw, h: regs[j].lh };
        const contains = (u, v) => u.x <= v.x && u.y <= v.y && u.x + u.w >= v.x + v.w && u.y + u.h >= v.y + v.h;
        if (inter(p, q) && !contains(p, q) && !contains(q, p)) ov++;
      }
      C.check('U4', `${vp} ${name}: primary ≥ 44 · list ≥ 36 CSS px, 겹침 0 (${a.n ?? 0}곳)`, !a.error && a.ok && ov === 0 && (a.n ?? 0) > 0, `${describeAudit(a)} · 겹침 ${ov}`);
      // 읽기 (platform P-03, platform_view 의 기준): 글자 p10 ≥ 9 · 중앙값 ≥ 10 CSS px
      const T = a.text ?? {};
      C.check('U4', `${vp} ${name}: 글자 p10 ${T.p10} ≥ 9 · 중앙값 ${T.median} ≥ 10 CSS px`, T.n > 0 && T.p10 >= 9 && T.median >= 10, `min ${T.min} · ${(T.smallest ?? []).join(', ')}`);
      if (name === 'list') await C.shot(s, `${vp}_taps_list`);
    }
    await C.close(s);
  }
}

// ───────────────────────── U5 인게임 메뉴 길 ─────────────────────────
async function U5(C) {
  for (const vp of C.vps) {
    const s = await C.open(vp, 'index.html?scene=hub', { pred: `${READY} && g.top?.name === 'hub' && !!g.world` });
    await waitFrames(s.page, { ms: 500, frames: 5, ticks: 3 });
    await s.eval(() => window.__game.push('menu', { tab: 'system' }));
    await s.waitGame("g.top?.name === 'menu'", 10000);
    await waitFrames(s.page, { ms: 700, frames: 6, ticks: 4 });
    const geo = await s.eval(() => {
      const g = window.__game, m = g.top, tab = m.cur, acts = tab.actions();
      const per = (g.cssScale || 1) * (g.uiK || 1);
      const R = (id) => { const k = acts.findIndex((a) => a.id === id); const r = tab.btns[k]; return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null; };
      return { per, ids: acts.map((a) => a.id), ach: R('ach'), options: R('options'), title: R('title'), save: R('save'), cloud: R('cloud'), sub: acts.find((a) => a.id === 'ach')?.sub };
    });
    const hOk = geo.ach && geo.options && geo.ach.h * geo.per >= 44 - 0.01 && geo.options.h * geo.per >= 44 - 0.01;
    const same = geo.ach && geo.options && Math.abs(geo.ach.y - geo.options.y) < 0.5 && Math.abs(geo.ach.h - geo.options.h) < 0.5 && geo.ach.x > geo.options.x + geo.options.w;
    const ovCloud = geo.cloud ? [geo.ach, geo.options, geo.title, geo.save].filter((r) => r && inter(r, geo.cloud)).length : 0;
    C.check('U5', `${vp} [설정 | 업적] 한 줄 · 높이 ≥ 44 CSS (${(geo.ach?.h * geo.per).toFixed(1)}) · 클라우드 단추와 겹침 0`, hOk && same && ovCloud === 0 && geo.ids.join(',').startsWith('save,options,ach,title'),
      `${geo.ids.join(',')} · sub '${geo.sub}' · cloud ${geo.cloud ? 'y ' + geo.cloud.y.toFixed(0) : '없음'} · title 끝 ${(geo.title?.y + geo.title?.h).toFixed(0)}`);
    if (vp === 'desk') {
      // 키보드: 저장 → ↓ 설정 → → 업적 → ← 설정 → → 업적 → Z
      const at = () => s.eval(() => { const t = window.__game.top.cur; return t.actions()[t.i]?.id; });
      await s.key('ArrowDown'); const a1 = await at();
      await s.key('ArrowRight'); const a2 = await at();
      await s.key('ArrowLeft'); const a3 = await at();
      await s.key('ArrowRight'); await s.key('ArrowDown'); const a4 = await at();
      await s.key('ArrowUp'); const a5 = await at();
      C.check('U5', 'kb ↓ 설정 · → 업적 · ← 설정 · ↓ 타이틀로 · ↑ 업적(같은 쪽)', a1 === 'options' && a2 === 'ach' && a3 === 'options' && a4 === 'title' && a5 === 'ach', [a1, a2, a3, a4, a5].join(' → '));
      await s.key('KeyZ');
      let ok = true; try { await s.waitGame(ACH_READY, 10000); } catch { ok = false; }
      await waitFrames(s.page, { ms: 400, frames: 5, ticks: 3 });
      await C.shot(s, 'desk_menu_ach');
      await s.key('KeyX');
      await s.waitGame("g.top?.name === 'menu'", 8000).catch(() => {});
      const back = await s.eval(() => ({ top: window.__game.top?.name, tab: window.__game.top?.cur?.constructor?.name, ti: window.__game.top?.ti }));
      C.check('U5', "kb Z → 업적 장면 · X → 메뉴 '기록' 탭", ok && back.top === 'menu' && back.ti === 9, JSON.stringify(back));
    } else {
      const t = new Touch(s.cdp, s.page);
      await C.shot(s, `${vp}_menu_system`);
      await tapUi(t, s, geo.ach);
      let ok = true; try { await s.waitGame(ACH_READY, 10000); } catch { ok = false; }
      await waitFrames(s.page, { ms: 400, frames: 5, ticks: 3 });
      const back = await s.eval(() => window.__game.top._L.back);
      await tapUi(t, s, back);
      await s.waitGame("g.top?.name === 'menu'", 8000).catch(() => {});
      const st = await s.eval(() => ({ top: window.__game.top?.name, ti: window.__game.top?.ti }));
      C.check('U5', `${vp} 업적 단추 탭 → 장면 · 뒤로 → 기록 탭`, ok && st.top === 'menu' && st.ti === 9, JSON.stringify(st));
    }
    await C.close(s);
  }
}

// ───────────────────────── U6 받기 ─────────────────────────
async function U6(C) {
  {
    const s = await C.open('desk', 'index.html?scene=hub', { pred: `${READY} && g.top?.name === 'hub' && !!g.world` });
    await waitFrames(s.page, { ms: 400, frames: 4, ticks: 2 });
    await grant(s, ['st_s01', 'st_s02', 'st_end1']);   // 회복 물약 ×3 · 300 G · 이명(받기 대상 아님)
    // 마을에 다시 들어서면 받을 보상 안내 한 번 (§6) — 두 번째 입장에는 없다
    const hubAgain = async () => { await s.eval(() => { window.__game.toasts.length = 0; window.__game.go('hub', {}, { fade: false }); }); await s.waitGame("g.top?.name === 'hub' && !!g.world", 10000); };
    await hubAgain();
    const hint = await waitToast(s, /^업적 보상 2개를 받을 수 있습니다 — 메뉴의 「기록」에서 「업적」을 고르세요$/, 4000);
    await hubAgain();
    await sleep(2500);
    const again = (await toasts(s)).some((x) => /^업적 보상/.test(x));
    C.check('U6', "마을에 들어설 때 받을 보상 안내 — 이번 실행에서 한 번", !!hint && !again, `${hint} · 두 번째 ${again}`);
    const b0 = await s.eval(async () => { const I = await import('/src/game/inventory.js'); const st = window.__game.state; return { gold: st.gold ?? 0, potion: I.countItem(st, 'c_potion') }; });
    await s.eval(() => window.__game.push('menu', { tab: 'system' }));
    await s.waitGame("g.top?.name === 'menu'", 8000);
    await s.eval(() => window.__game.push('achievements', {}));
    await s.waitGame(ACH_READY, 10000);
    await waitFrames(s.page, { ms: 300, frames: 4, ticks: 3 });
    let a = await achState(s);
    const ready = a.claimOK && a.sum.claimable === 2;
    await s.key('KeyC');
    a = await achState(s);
    const b1 = await s.eval(async () => { const I = await import('/src/game/inventory.js'); const g = window.__game, st = g.state; return { gold: st.gold ?? 0, potion: I.countItem(st, 'c_potion'), claimed: [...(g.meta.ach.claimed || [])] }; });
    C.check('U6', "마을: '보상 받기' → 300 G · 회복 물약 ×3 · claimed", ready && b1.gold - b0.gold === 300 && b1.potion - b0.potion === 3 && b1.claimed.includes('st_s01') && b1.claimed.includes('st_s02') && /^보상을 받았습니다/.test(a.msg ?? ''),
      JSON.stringify({ ready, dGold: b1.gold - b0.gold, dPotion: b1.potion - b0.potion, claimed: b1.claimed, msg: a.msg }));
    await waitFrames(s.page, { ms: 200, frames: 3, ticks: 2 });
    await C.shot(s, 'desk_claim');
    await s.key('KeyC');
    a = await achState(s);
    const b2 = await s.eval(() => window.__game.state.gold ?? 0);
    C.check('U6', "두 번째 받기 → 0 · '받을 보상이 없습니다'", b2 === b1.gold && a.msg === '받을 보상이 없습니다' && !a.claimOK, `msg ${a.msg}`);
    await C.close(s);
  }
  {
    const s = await C.open('desk', 'index.html?scene=stage&stage=s01', { pred: `${READY} && !!g.world?.player` });
    await s.skipDialogue();
    await grant(s, ['st_s01']);
    await s.eval(() => window.__game.push('menu', { tab: 'system', world: window.__game.world }));
    await s.waitGame("g.top?.name === 'menu'", 8000);
    await s.eval(() => window.__game.push('achievements', {}));
    await s.waitGame(ACH_READY, 10000);
    await installTapRecorder(s.page);
    await waitFrames(s.page, { ms: 300, frames: 4, ticks: 3 });
    const tx = await drawnText(s.page);
    let a = await achState(s);
    await s.key('KeyC');
    const a2 = await achState(s);
    C.check('U6', "스테이지에서 연 메뉴: 받기 꺼짐 + '마을에서 받을 수 있습니다'", !a.claimOK && a.reason === '마을에서 받을 수 있습니다' && tx.includes('마을에서 받을 수 있습니다') && a2.msg === '마을에서 받을 수 있습니다', `${a.reason} / ${a2.msg}`);
    await C.shot(s, 'desk_claim_stage');
    await C.close(s);
  }
}

// ───────────────────────── U7 알림 ─────────────────────────
async function U7(C) {
  {
    const s = await C.open('desk', 'index.html?scene=stage&stage=s01', { pred: `${READY} && !!g.world?.player` });
    await s.skipDialogue();
    await s.eval(() => { const g = window.__game; g.toasts.length = 0; g.world.bossActive = true; g.ach._grant('cb_style_s'); });
    await sleep(3000);
    const t1 = await toasts(s);
    const why = await s.eval(() => window.__game.achNotify.deferReason());
    const held = !t1.some((x) => /잔혹하다/.test(x)) && why === 'boss';
    await s.eval(() => { window.__game.world.cleared = true; });
    const hit = await waitToast(s, /^업적 달성 — 「잔혹하다」$/, 2000);
    C.check('U7', "보스전 3초 동안 토스트 없음 → world.cleared → '업적 달성 — 「잔혹하다」'", held && !!hit, `미룸 ${why} · ${t1.join(' | ')} → ${hit}`);
    await C.close(s);
  }
  {
    const s = await C.open('desk', 'index.html?scene=hub', { pred: `${READY} && g.top?.name === 'hub' && !!g.world` });
    await waitFrames(s.page, { ms: 2200, frames: 6, ticks: 3 });
    await s.eval(() => { const g = window.__game; g.toasts.length = 0; g.push('story', { lines: [{ who: 'narr', text: '……' }], then: null }); g.ach._grant('cb_nodmg'); });
    await sleep(1500);
    const t1 = await toasts(s);
    const why = await s.eval(() => window.__game.achNotify.deferReason());
    await s.eval(() => window.__game.pop());
    const hit = await waitToast(s, /흠집 하나 없이/, 2000);
    const end = await s.eval(async () => { const N = await import('/src/game/ach_notify.js'); return [N.deferReason({ top: { name: 'ending' }, world: null }), N.deferReason({ top: { name: 'title', mode: 'press' }, world: null }), N.deferReason({ top: { name: 'hub' }, world: { bossActive: false } })]; });
    C.check('U7', "맨 위가 story → 미룸, 닫으면 표시 · ending·타이틀 PRESS START → 미룸", why === 'story' && !t1.some((x) => /흠집/.test(x)) && !!hit && end[0] === 'ending' && end[1] === 'title' && end[2] === null, `${why} · ${end.join(',')} · ${hit}`);
    // 셋 이상 (같은 프레임) → 한 줄
    await s.eval(() => { const g = window.__game; g.toasts.length = 0; for (const id of ['cp_first', 'cp_ride', 'cp_egg']) g.ach._grant(id); });
    await sleep(900);
    const t3 = await toasts(s);
    const sum = t3.filter((x) => /^업적 3개 달성 — 「.+」 외 2개$/.test(x));
    C.check('U7', "셋 이상 → '업적 3개 달성 — 「…」 외 2개' 한 줄", sum.length === 1 && !t3.some((x) => /^업적 달성 — /.test(x)), t3.join(' | '));
    // 업적 화면이 맨 위면 토스트 대신 반짝임
    await s.eval(() => window.__game.push('achievements', {}));
    await s.waitGame(ACH_READY, 10000);
    await s.eval(() => { const g = window.__game; g.toasts.length = 0; g.ach._grant('cp_bond'); });
    await sleep(900);
    const t4 = await toasts(s);
    const fl = await s.eval(() => window.__game.top.flash.has('cp_bond') && !!window.__game.top.rowsAll.find((r) => r.def.id === 'cp_bond')?.got);
    C.check('U7', '업적 화면이 열려 있으면 토스트 없이 그 줄이 반짝임', fl && !t4.some((x) => /영혼 결속/.test(x)), t4.join(' | '));
    await C.close(s);
  }
  {
    const s = await C.open('desk');
    await s.eval(() => window.__game.go('title', {}, { fade: false }));
    await s.waitGame("g.top?.name === 'title' && g.top.mode === 'intro'", 8000);
    await s.eval(() => { const g = window.__game; g.toasts.length = 0; for (const id of ['st_s01', 'st_s02', 'st_dracula']) g.ach._grant(id, 'retro'); });
    await sleep(2500);
    const t1 = await toasts(s);
    const why = await s.eval(() => window.__game.achNotify.deferReason());
    for (let k = 0; k < 3 && (await s.eval(() => window.__game.top?.mode)) !== 'menu'; k++) { await s.key('Enter'); await sleep(400); }
    const hit = await waitToast(s, /^지난 기록으로 업적 3개를 달성했습니다 — 「업적」 화면에서 확인하세요$/, 3000);
    C.check('U7', '소급 요약: 타이틀 인트로 동안 미룸 → 메뉴가 열린 뒤 한 줄', why === 'title' && !t1.some((x) => /지난 기록/.test(x)) && !!hit, `${why} → ${hit}`);
    await C.shot(s, 'desk_title_retro_toast');
    await C.close(s);
  }
}

// ───────────────────────── U8 장식 ─────────────────────────
async function U8(C) {
  const s = await C.open('desk');
  const titleWith = async (deco) => {
    await s.eval(async (deco) => { const M = await import('/src/core/ach_meta.js'); const g = window.__game; M.ensureAch(g.meta).deco = deco; g.go('title', { menu: true }, { fade: false }); }, deco);
    await s.waitGame("g.top?.name === 'title'", 8000);
    await waitFrames(s.page, { ms: 300, frames: 4, ticks: 2 });
    return s.eval(() => { const t = window.__game.top; return { ember: t.amb.emberColor, fog: t.amb.fogTint, bats: t.amb.B.length, motes: t.amb.M.length, moon: !!t.moon }; });
  };
  const base = await titleWith(null);
  const gold = await titleWith('d_gold');
  C.check('U8', "d_gold → 타이틀 amb.emberColor '#ffd070'", gold.ember === '#ffd070' && base.ember !== '#ffd070', `${base.ember} → ${gold.ember}`);
  const crow = await titleWith('d_crow');
  C.check('U8', `d_crow → 박쥐 두 배 (${base.bats} → ${crow.bats}, 28 이하)`, crow.bats === Math.min(28, base.bats * 2) && crow.ember === '#ff4a6a', JSON.stringify(crow));
  const silver = await titleWith('d_silver');
  C.check('U8', `d_silver → 먼지 1.6배 (${base.motes} → ${silver.motes})`, silver.motes === Math.round(base.motes * 1.6), JSON.stringify(silver));
  const moon = await titleWith('d_moon');
  await waitFrames(s.page, { ms: 900, frames: 6, ticks: 4 });
  await C.shot(s, 'desk_title_moon');
  await openAch(s, {});
  const am = await s.eval(() => ({ moon: !!window.__game.top.moon, ember: window.__game.top.amb.emberColor, fog: window.__game.top.fogAmb.fogTint }));
  await C.shot(s, 'desk_list_moon');
  C.check('U8', "d_moon → 타이틀 달 + 업적 화면 미리 보기 (불씨 '#ff3040', 안개 '#5a1a2a')", moon.moon && moon.fog === '#5a1a2a' && am.moon && am.ember === '#ff3040' && am.fog === '#5a1a2a', JSON.stringify({ moon, am }));
  await C.close(s);
}

// ───────────────────────── U9 순위표 이명 ─────────────────────────
async function U9(C) {
  const BOARD = {
    ok: true, total: 3, me: null,
    entries: [
      { rank: 1, nick: 'HUNTER', time: 61230, hero: 'kael', cls: '', title: 't_dawn' },
      { rank: 2, nick: 'BETA', time: 62000, hero: 'lia', cls: '', title: 't_zzz' },
      { rank: 3, nick: 'NIGHTHUNTER_SUPREME_X', time: 63000, hero: 'sera', cls: '', title: 't_legend' },
      { rank: 4, nick: 'MOON_KNIGHT_7', time: 64000, hero: 'bran', cls: '', title: 't_nightmare' },
    ],
  };
  for (const vp of ['desk', 'phone2']) {
    const s = await C.open(vp);
    await s.page.route('**/api/boards/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOARD) }));
    await installTapRecorder(s.page);
    await s.eval(() => window.__game.go('highscore', { src: 'online', board: 'practice:s01:normal' }, { fade: false }));
    await s.waitGame("g.top?.name === 'highscore' && g.top.ob?.state === 'ready'", 15000);
    await waitFrames(s.page, { ms: 500, frames: 6, ticks: 3 });
    const tx = await drawnText(s.page);
    const epi = tx.filter((x) => /^「.*」$/.test(x));
    const nickW = await s.eval(() => { const g = window.__game, t = g.top, L = t.layout(); const W = L.W; const LW = Math.round(Math.min(290, Math.max(236, W * 0.29))); const lx = L.sl + 16 + LW + 14, lw = W - L.sr - 16 - lx; return Math.round(lx + Math.round(lw * 0.52) - (lx + 58) - 70); });
    C.check('U9', `${vp} t_dawn → 별명 옆 '「새벽을 연 자」'`, tx.includes('HUNTER') && tx.includes('「새벽을 연 자」'), epi.join(' | '));
    C.check('U9', `${vp} t_zzz(목록 밖) → 별명만`, tx.includes('BETA') && !tx.some((x) => /zzz/i.test(x)), epi.join(' | '));
    // 규칙 (§8.3): 별명 칸(C.rec − C.nick − 70) 안에서 별명은 그대로, 이명을 먼저 줄이고(…, 두 글자 이상) 안 되면 뺀다 → 줄마다 기대값
    const expect = await s.eval(async ([entries, w]) => {
      const U = await import('/src/core/ui.js');
      const ctx = document.createElement('canvas').getContext('2d');
      const names = { t_dawn: '새벽을 연 자', t_legend: '블러드 녹턴', t_nightmare: '악몽을 걷는 자' };
      return entries.map((e) => {
        const n = names[e.title];
        if (!n) return null;
        ctx.font = U.font(14, 800, U.FONT.body);
        const nw = ctx.measureText(e.nick).width, room = w - nw - 5;
        if (nw + 6 >= w) return null;
        ctx.font = U.font(12, 700, U.FONT.body);
        if (ctx.measureText(`「${n}」`).width <= room) return `「${n}」`;
        for (let k = n.length - 1; k >= 2; k--) { const h = n.slice(0, k); if (/\s$/.test(h)) continue; const q = `「${h}…」`; if (ctx.measureText(q).width <= room) return q; }
        return null;
      }).filter(Boolean);
    }, [BOARD.entries, nickW]);
    const same = expect.length === epi.length && expect.every((x) => epi.includes(x));
    C.R.u9 = { ...(C.R.u9 ?? {}), [vp]: { nickW, expect, drawn: epi } };
    C.check('U9', `${vp} 좁은 칸(${nickW} UI px): 별명 그대로 · 이명을 먼저 줄이고(…) 안 되면 뺀다`, tx.includes('NIGHTHUNTER_SUPREME_X') && tx.includes('MOON_KNIGHT_7') && same, `기대 ${expect.join(' | ')} · 그림 ${epi.join(' | ')}`);
    if (vp === 'phone2') C.check('U9', '줄인 이명이 한 번 이상 나옴 (desk·phone2)', [...(C.R.u9.desk?.drawn ?? []), ...epi].some((x) => x.endsWith('…」')), JSON.stringify(C.R.u9));
    await C.shot(s, `${vp}_board_titles`);
    await C.close(s);
  }
}

// ───────────────────────── U10 오류·성능 ─────────────────────────
async function U10(C) {
  const s = await C.open('phone1', 'index.html', { settings: { quality: 'medium' }, initScripts: [perfProbeInit()] });
  // 보이는 줄이 가장 무거운 상태: 반쯤 달성 · NEW · 진행 막대
  await s.eval(async () => {
    const M = await import('/src/core/ach_meta.js'); const g = window.__game, got = {}, t0 = Date.parse('2026-10-01T00:00:00Z');
    g.ach.defs.forEach((d, i) => { if (i % 2 === 0 && d.id !== 'ch_all') got[d.id] = t0 + i * 1000; });
    g.meta.ach = { v: 1, got, prog: { kills: 640, combo: 40 }, claimed: [], seenAt: t0 + 30000, title: 't_dawn', deco: 'd_moon' }; M.ensureAch(g.meta);
  });
  await openAch(s, {});
  await waitFrames(s.page, { ms: 1000, frames: 10, ticks: 6 });
  const tier = await s.eval(() => window.__game.tier);
  await freeze(s.page);
  // 얼린 페이지에서 그리기를 연달아 기록하면 크롬이 쌓인 그리기 명령을 수십 프레임마다 한꺼번에 래스터한다(한 프레임에 수백 ms로 보임).
  // 그래서 30프레임씩 재고, 그 사이(잰 구간 밖)에서 한 번씩 비운다(getImageData). 래스터까지 넣은 값은 따로 (정보: 인게임 메뉴와 비교)
  const flush = () => s.eval(() => { window.__game.ctx.getImageData(0, 0, 1, 1); });
  const raster = (n) => s.eval((n) => {
    const g = window.__game, P = window.__perf, out = [];
    for (let i = 0; i < n; i++) { window.__qaStep(1, false); const t0 = P.realNow(); g.__qaRender.call(g); g.ctx.getImageData(0, 0, 1, 1); out.push(+(P.realNow() - t0).toFixed(2)); }
    return out;
  }, n);
  const run = async (label, setup) => {
    if (setup) await s.eval(setup);
    await measureFrames(s.page, 10); await flush();   // 데우기 (글꼴·레이어 굽기)
    const frames = [], sites = [];
    for (let k = 0; k < 3; k++) { const r = await measureFrames(s.page, 30); frames.push(...r.frames); sites.push(...r.sites.grad); await flush(); }
    const ms = frames.map((f) => f.ms), grad = frames.map((f) => f.grad), canv = frames.map((f) => f.canv);
    return { label, ms: stats(ms), gradMax: Math.max(...grad), canvMax: Math.max(...canv), sites: sites.slice(0, 3), withRaster: stats(await raster(30)) };
  };
  const list = await run('list');
  const detail = await run('detail', () => window.__game.top.openDetail(2));
  const pick = await run('pick', () => { const t = window.__game.top; t.modal = null; t.openPick(); });
  // 비교 (정보): 같은 페이지의 인게임 메뉴 '기록' 탭 (래스터 포함)
  await s.eval(() => { const t = window.__game.top; t.modal = null; });
  await unfreeze(s.page);
  const ref = await (async () => {
    try {
      await s.eval(async () => { const S = await import('/src/game/state.js'); const g = window.__game; g.state = g.state ?? S.newGameState({ slot: 1 }); g.push('menu', { tab: 'system' }); });
      await waitFrames(s.page, { ms: 900, frames: 8, ticks: 4 });
      await freeze(s.page); await measureFrames(s.page, 10); await flush();
      const r = stats(await raster(30));
      await unfreeze(s.page); await s.eval(() => window.__game.pop()); await waitFrames(s.page, { ms: 300, frames: 3, ticks: 2 });
      return r;
    } catch (e) { await unfreeze(s.page).catch(() => {}); return { error: String(e?.message ?? e) }; }
  })();
  C.R.perf = { vp: 'phone1', tier, list, detail, pick, menuSystemWithRaster: ref };
  console.log(`   그리기+래스터 (정보, 소프트웨어 래스터): 업적 목록 p95 ${list.withRaster.p95} ms · 자세히 ${detail.withRaster.p95} · 이명 창 ${pick.withRaster.p95} · 인게임 메뉴 기록 탭 ${ref.p95 ?? ref.error} ms`);
  for (const p of [list, detail, pick]) {
    C.check('U10', `phone1(${tier}) 업적 장면 ${p.label} 그리기 p95 ${p.ms.p95} ms ≤ 3 ms · 프레임마다 새 그라디언트·캔버스 0`, p.ms.p95 <= 3 && p.gradMax === 0 && p.canvMax === 0,
      `avg ${p.ms.avg} p50 ${p.ms.p50} p95 ${p.ms.p95} max ${p.ms.max} · grad ${p.gradMax} ${JSON.stringify(p.sites)} · canv ${p.canvMax}`);
  }
  // 캔버스 풀: 장면을 연 뒤 10초 (닫힌 팝업 · 목록 스크롤 · 분류 넘기기 포함)
  await s.eval(() => { const t = window.__game.top; t.modal = null; });
  await waitFrames(s.page, { ms: 600, frames: 6, ticks: 3 });
  const f0 = await s.eval(async () => (await import('/src/scenes/menu/common.js')).canvasPoolStats().free);
  for (let k = 0; k < 5; k++) {
    await s.eval((k) => { const t = window.__game.top; t.setCat(k + 1); t.sc.target = 120; if (k === 2) t.openDetail(1); if (k === 3) t.modal = null; }, k);
    await sleep(2000);
  }
  const f1 = await s.eval(async () => (await import('/src/scenes/menu/common.js')).canvasPoolStats().free);
  C.check('U10', `10초 동안 canvasPoolStats().free 변화 0 (${f0} → ${f1})`, f0 === f1, `${f0} → ${f1}`);
  // 닫으면 배경 레이어를 풀에 돌려준다
  await s.eval(() => window.__game.go('title', { menu: true }, { fade: false }));
  await waitFrames(s.page, { ms: 500, frames: 5, ticks: 3 });
  const f2 = await s.eval(async () => (await import('/src/scenes/menu/common.js')).canvasPoolStats().free);
  C.check('U10', `장면을 닫으면 레이어 캔버스를 풀로 (${f1} → ${f2})`, f2 === f1 + 1, `${f1} → ${f2}`);
}

// ───────────────────────── U11 외형 쪽 (BM-FOLLOWUP) ─────────────────────────
/** 이명 창 상태 (외형 쪽 = page 1 · 목록 2) */
function pickState(s) {
  return s.eval(() => {
    const g = window.__game, m = g.top?.modal;
    if (m?.kind !== 'pick') return null;
    return { page: m.page, L: m.L, k: m.k[m.L], id: m.lists[m.L][m.k[m.L]]?.id ?? null, n: m.lists[2].length, zones: m.zones[2].filter((z) => !z.r.thid).length, msg: m.msg?.text ?? null, trail: g.meta.ach?.cos?.trail ?? null };
  });
}
async function U11(C) {
  // 터치 (phone2): '외형' 탭 → 잠긴 칸은 조건 한 줄 · 가진 칸은 meta.ach.cos.trail (+ 기기 메타에 저장)
  {
    const s = await C.open('phone2');
    await grant(s, ['cb_style_s']);   // 잔상 「핏빛」
    await openAch(s, {});
    const t = new Touch(s.cdp, s.page);
    const [hx, hy] = await ui2css(s, 444, 24);
    await ensureTouchMode(t, s.page, [hx, hy]); await waitFrames(s.page, { ms: 300, frames: 4, ticks: 2 });
    await tapUi(t, s, await s.eval(() => window.__game.top.zTitles));
    let p = await pickState(s);
    const opened = p?.page === 0;
    await tapUi(t, s, await s.eval(() => window.__game.top.modal.tabR[1]));
    await waitFrames(s.page, { ms: 200, frames: 4, ticks: 2 });
    p = await pickState(s);
    C.check('U11', "touch '외형' 탭 → 잔상 쪽 (목록 2 · 7칸 · 칸 4곳 이상 보임)", opened && p?.page === 1 && p.L === 2 && p.n === 7 && p.zones >= 4, JSON.stringify(p));
    const zoneOf = (id) => s.eval((id) => { const m = window.__game.top.modal, k = m.lists[2].findIndex((it) => it.id === id); return m.zones[2].find((z) => z.k === k && !z.r.thid)?.r ?? null; }, id);
    const moon = await zoneOf('tr_moon');
    if (moon) await tapUi(t, s, moon);
    p = await pickState(s);
    C.check('U11', 'touch 잠긴 칸 「월광」 → 조건 한 줄 · 잔상 그대로', !!moon && p?.id === 'tr_moon' && /달성하면 쓸 수 있습니다/.test(p.msg ?? '') && p.trail === null, JSON.stringify(p));
    await C.shot(s, 'phone2_trail_locked');
    const blood = await zoneOf('tr_blood');
    if (blood) await tapUi(t, s, blood);
    p = await pickState(s);
    const stored = await s.eval(() => { try { const k = window.localStorage; return [k.getItem('bloodnocturne_meta'), k.getItem('bloodnocturne_meta_debug')].map((x) => JSON.parse(x ?? 'null')?.ach?.cos?.trail ?? null); } catch { return []; } });
    C.check('U11', "touch 가진 칸 「핏빛」 → meta.ach.cos.trail === 'tr_blood' · 기기 메타에도", !!blood && p?.trail === 'tr_blood' && /핏빛/.test(p.msg ?? '') && stored.includes('tr_blood'), JSON.stringify({ p, stored }));
    await C.shot(s, 'phone2_trail_chosen');
    await tapUi(t, s, await s.eval(() => window.__game.top.modal.tabR[0]));
    p = await pickState(s);
    C.check('U11', "touch '이명 · 장식' 탭 → 첫 쪽 (잔상은 그대로)", p?.page === 0 && p.L < 2 && p.trail === 'tr_blood', JSON.stringify(p));
    await C.close(s);
  }
  // 키보드 (desk, 넓은 배치): A 이명 창 → E·E 목록 2 → ↓ 「핏빛」 → Z → Q 목록 1
  {
    const s = await C.open('desk');
    await grant(s, ['cb_style_s']);
    await openAch(s, {});
    await s.key('KeyA'); await s.key('KeyE'); await s.key('KeyE');
    let p = await pickState(s);
    const onTrail = p?.page === 1 && p.L === 2;
    await s.key('ArrowDown'); p = await pickState(s);
    const onBlood = p?.id === 'tr_blood';
    await s.key('KeyZ'); p = await pickState(s);
    const chosen = p?.trail === 'tr_blood';
    await s.key('KeyQ'); p = await pickState(s);
    C.check('U11', "kb A · E·E → 외형 쪽 · ↓ 「핏빛」 · Z → 정함 · Q → 장식 목록", onTrail && onBlood && chosen && p?.page === 0 && p.L === 1, JSON.stringify({ onTrail, onBlood, chosen, p }));
    await C.shot(s, 'desk_trail');
    await C.close(s);
  }
  // 탭 크기 (phone1·phone2): 외형 쪽 — primary ≥ 44 · list ≥ 36 CSS px, 겹침 0
  for (const vp of ['phone1', 'phone2']) {
    const s = await C.open(vp);
    await grant(s, ['cb_style_s']);
    await installTapRecorder(s.page);
    await auditScene(s.page, "__game.go('achievements', {back:'title'}, {fade:false})", { wait: 1300 });
    const a = await auditScene(s.page, '(__game.top.modal = null, __game.top.openPick(), __game.top.modal.setPage(1), 0)', { wait: 800 });
    const regs = a.regions ?? [];
    let ov = 0;
    const contains = (u, v) => u.x <= v.x && u.y <= v.y && u.x + u.w >= v.x + v.w && u.y + u.h >= v.y + v.h;
    for (let i = 0; i < regs.length; i++) for (let j = i + 1; j < regs.length; j++) {
      const P = { x: regs[i].lx, y: regs[i].ly, w: regs[i].lw, h: regs[i].lh }, Q = { x: regs[j].lx, y: regs[j].ly, w: regs[j].lw, h: regs[j].lh };
      if (inter(P, Q) && !contains(P, Q) && !contains(Q, P)) ov++;
    }
    C.check('U11', `${vp} 외형 쪽: primary ≥ 44 · list ≥ 36 CSS px, 겹침 0 (${a.n ?? 0}곳)`, !a.error && a.ok && ov === 0 && (a.n ?? 0) > 0, `${describeAudit(a)} · 겹침 ${ov}`);
    await C.close(s);
  }
}

// ───────────────────────── 명령줄 ─────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1].split(',').map((x) => x.trim()).filter(Boolean) : null; };
  const t0 = Date.now();
  const r = await run({ only: val('--only'), vp: val('--vp') });
  console.log(`\n통과 ${r.passes}, 실패 ${r.fails}, 오류 ${r.errors.length} (${((Date.now() - t0) / 1000).toFixed(0)}초) — ${path.join(OUT, 'ach_ui.json')}`);
  process.exit(r.ok ? 0 : 1);
}
