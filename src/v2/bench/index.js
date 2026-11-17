// 리빌드(v2) 성능 진단 — index.html?scene=v2bench. docs/v2/PERF_NOTES.md
// 실제 기기에서 왜 끊기는지 스스로 잰다: 시범판 B 의 세계를 정해진 길로 달리면서 설정을 바꿔 가며 약 4초씩 재고(첫 1초는 버림),
// 끝나면 표 · 한 줄 판정 · 「결과 복사」 · 「이 설정으로 하기」 를 보여 준다.
//   stats.js  시험 목록 · 통계 · 고르기 · 복사용 글 (순수 계산)
//   rig.js    세계 · 캐릭터 · 겹치는 법 (시범판 B 의 부품을 읽기만 한다)
// 재는 법: 게임 루프(core/game.js)는 그대로 둔다. 시범판과 같은 길로 불리므로 (60 Hz 고정 틱 → 틱이 돈 rAF 에서만 render)
//   · '초당 60'  = 지금 그대로: update(STEP) 마다 장면 시각이 한 칸 가고, render 는 게임이 부를 때만 그린다.
//   · '매 화면'  = render 안에서 game.dirty = true 를 다시 걸어 모든 rAF 에 그리게 하고, 장면 시각은 rAF 시각(game.last)을 그대로 쓴다.
//   화면 간격은 따로 건 rAF(재는 고리)가 모든 화면 갱신의 시각 차로 잰다. 그 고리는 그리지 않는다.
// 주소 옵션: ?benchsec=4 (시험 하나의 길이 초) · ?benchskip=1 (버리는 앞부분 초). 검사 도구: tools/v2/bench_check.mjs · window.__v2bench
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { text, button, FONT } from '../../core/ui.js';
import { Rig } from './rig.js';
import { buildMatrix, summarize, snapRefresh, dist, pickBest, verdict, settingKo, storeValue, compactText, STORE_KEY, PRESENT_KO, CHARS_KO, PACE_KO } from './stats.js';

const VER = 1;
const now = () => performance.now();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const GOLD = '#e8c872', BONE = '#efe4cf', DIM = '#a89a88';
const TIER_KO = { low: '낮음', medium: '보통', high: '높음' };

export default class V2Bench extends Scene {
  constructor(game) { super(game); this.hidePad = true; this.phase = 'load'; this.rig = null; this.report = null; }
  enter() {
    let Q = null; try { Q = new URLSearchParams(globalThis.location?.search ?? ''); } catch { Q = null; }
    const num = (k, d, lo, hi) => { const v = Number(Q?.get(k)); return v > 0 ? clamp(v, lo, hi) : d; };
    this.DUR = num('benchsec', 4, 0.8, 20) * 1000; this.SKIP = Math.min(this.DUR * 0.5, num('benchskip', 1, 0.1, 5) * 1000);
    this.phase = 'load'; this.error = null; this.report = null; this.box = null; this.saved = false; this.copied = 0;
    this.tests = []; this.ti = -1; this.cur = null; this.calib = null; this.simT = 0; this.steps = 0; this._js = 0; this._pts = 0;
    this.ctxLost = 0; this.longNow = 0; this._heap = 0;
    this.rig = new Rig(this.game);
    this.rig.load().then(() => { if (this.rig?.ready) this._begin(); }).catch((e) => { this.error = String(e?.message ?? e); console.warn('[v2bench]', this.error); this._finish(); });
    this._probe = (ts) => { this._raf = requestAnimationFrame(this._probe); this._onFrame(ts); };
    this._raf = requestAnimationFrame(this._probe);
    try { this._po = new PerformanceObserver((l) => { this.longNow += l.getEntries().length; }); this._po.observe({ entryTypes: ['longtask'] }); } catch { this._po = null; }
    const sc = this;
    globalThis.__v2bench = { get phase() { return sc.phase; }, get report() { return sc.report; }, get text() { return sc.report ? compactText(sc.report) : ''; }, get progress() { return [sc.ti + 1, sc.tests.length]; }, get error() { return sc.error; } };
  }
  exit() {
    cancelAnimationFrame(this._raf); this._raf = 0;
    try { this._po?.disconnect(); } catch { /* 무시 */ }
    this._closeBox();
    if (this.rig) { this.rig.destroy(); this.rig = null; }
    if (globalThis.__v2bench) delete globalThis.__v2bench;
  }
  _leave() { const g = this.game; if (g.registry.v2pick) g.go('v2pick', {}, { fade: true }); else if (g.registry.title) g.go('title', {}, { fade: true }); }

  // ───────────────────────── 진행 ─────────────────────────
  _begin() {
    const rig = this.rig;
    try { rig.warmUp(); } catch (e) { console.warn('[v2bench] 데우기 실패', e); }
    this.tests = buildMatrix(rig.has3d).map((t) => ({ ...t, raw: null, valid: false, note: '' }));
    // 주사율 재기: 가장 가벼운 설정(겹쳐 얹기 · 절반 해상도 · 캐릭터 없음 · 매 화면)으로 1.2초 — 가만히 있는 화면은 기기가 주사율을 낮출 수 있어 움직이는 그림으로 잰다
    this.calib = this._newRaw(1200); this.phase = 'calib';
    rig.setMode('layer', 0.5, 'none');
    this.cur = { present: 'layer', resK: 0.5, chars: 'none', pace: 'every', t0: 0, raw: this.calib, dur: 1500, skip: 300, lost: false };
  }
  _newRaw(ms) {
    const cap = Math.ceil(ms * 0.26) + 64;
    return { iv: new Float32Array(cap), ivN: 0, ci: new Float32Array(cap), ciN: 0, js: new Float32Array(cap), jsN: 0, gc: 0, gcStall: 0, heapUp: 0, long: 0, ms: 0, up: 0, blit: 0, n: 0, px: [0, 0] };
  }
  _startTest(i) {
    const T = this.tests[i], rig = this.rig;
    this.ti = i; T.raw = this._newRaw(this.DUR); T.valid = false; T.note = '';
    rig.setMode(T.present, T.resK, T.chars);
    this.cur = { present: T.present, resK: T.resK, chars: T.chars, pace: T.pace, t0: 0, raw: T.raw, dur: this.DUR, skip: this.SKIP, lost: false, test: T };
    this.simT = 0; this.steps = 0; this.phase = 'run';
  }
  /** 재는 고리: 화면이 한 번 갱신될 때마다 (게임 루프의 rAF 콜백 다음에 불린다) */
  _onFrame(ts) {
    const d = ts - this._pts; this._pts = ts;
    const C = this.cur, rig = this.rig;
    if (!C || !rig || (this.phase !== 'run' && this.phase !== 'calib')) { this._js = 0; return; }
    if (document.hidden || this.game._pageHidden || !(d > 0) || d > 1500) { C.t0 = 0; this._js = 0; return; }   // 가려졌다 돌아오면 이 시험을 처음부터
    if (rig.glr?.lost) { if (!C.lost) { C.lost = true; this.ctxLost++; C.lostAt = ts; } else if (ts - C.lostAt > 6000) { this.error = '화면(WebGL)을 되살리지 못했습니다'; this._finish(); } this._js = 0; return; }
    if (C.lost) { C.lost = false; C.t0 = 0; if (C.test) C.test.note = 'ctx lost → 다시 잼'; }
    if (!C.t0) { C.t0 = ts; C.lastDraw = 0; this.simT = 0; this.steps = 0; this._js = 0; this.longNow = 0; this._heap = 0; const R = C.raw; R.ivN = R.ciN = R.jsN = 0; R.gc = R.gcStall = R.heapUp = R.long = 0; return; }
    const el = ts - C.t0, R = C.raw;
    if (el >= C.skip && el < C.dur) {
      if (R.ivN < R.iv.length) R.iv[R.ivN++] = d;
      if (this._js > 0 && R.jsN < R.js.length) R.js[R.jsN++] = this._js;
      const m = performance.memory?.usedJSHeapSize ?? 0;
      if (m && this._heap) { const dm = m - this._heap; if (dm > 0) R.heapUp += dm; else if (dm < -300000) { R.gc++; if (d > (this.calibMs ?? 16.7) * 1.5) R.gcStall++; } }
      this._heap = m;
    } else if (el < C.skip) { this.longNow = 0; this._heap = performance.memory?.usedJSHeapSize ?? 0; }
    this._js = 0;
    if (el >= C.dur) {
      R.ms = C.dur - C.skip; R.long = this.longNow; R.up = rig.cost.n ? rig.cost.upMs / rig.cost.n : 0; R.blit = rig.cost.n ? rig.cost.blitMs / rig.cost.n : 0; R.n = rig.cost.n; R.px = rig.pixels;
      if (this.phase === 'calib') { this.calibMs = dist(R.iv, R.ivN).p50 || 16.7; this.envTris = rig.tris; this._startTest(0); }
      else { C.test.valid = R.ivN > 5; if (this.ti + 1 < this.tests.length) this._startTest(this.ti + 1); else this._finish(); }
    }
  }
  _finish() {
    const rig = this.rig, g = this.game;
    this.cur = null; this.phase = 'done';
    rig?.hideLayer();
    // 주사율 = 가장 빨랐던 중앙값 (어떤 시험도 화면보다 빨리 돌 수는 없다)
    let ms = this.calibMs ?? 16.667;
    for (const T of this.tests) if (T.valid) { const p = dist(T.raw.iv, T.raw.ivN).p50; if (p > 2 && p < ms) ms = p; }
    const refresh = snapRefresh(ms), r1 = (v) => Math.round(v * 10) / 10;
    const rows = this.tests.map((T) => {
      const base = { id: T.id, present: T.present, resK: T.resK, chars: T.chars, pace: T.pace, pick: T.pick, why: T.why, valid: T.valid, note: T.note, best: false };
      if (!T.valid) return base;
      const R = T.raw, sec = Math.max(0.001, R.ms / 1000);
      return { ...base, ...summarize(R, refresh.ms), upMs: r1(R.up), blitMs: r1(R.blit), heapRate: r1(R.heapUp / 1048576 / sec), gc: R.gc, gcStall: R.gcStall, longTasks: R.long, px: R.px };
    });
    const best = pickBest(rows); if (best) best.best = true;
    const cv = g.canvas, rc = g.canvasRect ?? { w: 0, h: 0 }, info = rig?.glr ? rig.glr.info() : { api: 'none', renderer: this.error ?? '', maxTex: 0 };
    const cal = this.calib ? dist(this.calib.iv, this.calib.ivN) : { p50: 0, p95: 0, max: 0 };
    const env = {
      at: new Date().toISOString(), ua: String(navigator.userAgent ?? ''), gl: info, ctxLost: this.ctxLost, ctxRestored: rig?.glr?.restored ?? 0,
      dpr: Math.round((globalThis.devicePixelRatio || 1) * 1000) / 1000, win: [globalThis.innerWidth | 0, globalThis.innerHeight | 0], css: [rc.w | 0, rc.h | 0], canvas: [cv.width, cv.height], view: [g.viewW, g.viewH],
      tier: g.tier, auto: g.autoQualityOn(), fpsCap: g.settings?.fpsCap ?? 60, saver: g.saverFps(), mem: navigator.deviceMemory ?? null, cores: navigator.hardwareConcurrency ?? null, touch: navigator.maxTouchPoints ?? 0,
      refresh, calib: { p50: r1(cal.p50), p95: r1(cal.p95), max: r1(cal.max) }, char3d: rig?.has3d ? 'ok' : 'no(' + (rig?.err3d || '-') + ')',
      warm: rig?.warm ?? { world: 0, card: 0, c3d: 0 }, loadMs: rig?.loadMs ?? 0, tris: this.envTris ?? 0, draws: rig?.draws ?? 0, gameScale: r1(g.scale),
    };
    const notes = [];
    if (this.error) notes.push(this.error);
    if (env.saver) notes.push('절전 모드(그리기 상한 ' + env.saver + ')가 켜져 있어 값이 낮게 나옵니다');
    if (/SwiftShader|llvmpipe|Software/i.test(info.renderer)) notes.push('software renderer — not a device number');
    this.report = { ver: VER, env, rows, best: best ?? null, note: notes.join(' / '), store: best ? storeValue(best, env) : null };
    let old = null; try { old = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null'); } catch { old = null; }
    this.stored = old;
    console.info('[v2bench]\n' + compactText(this.report));
  }

  // ───────────────────────── 게임 루프가 부르는 것 ─────────────────────────
  update(dt) {
    if (input.pressed('menu') || input.pressed('cancel')) { if (this.box) { this._closeBox(); return; } this._leave(); return; }
    if (this.phase === 'run' || this.phase === 'calib') { this.simT += dt; this.steps++; }
    else if (this.phase === 'done' && input.pressed('confirm') && !this.box) this._copy();
  }
  render(ctx) {
    const g = this.game, Wv = g.viewW, Hv = g.viewH, C = this.cur, rig = this.rig;
    if (this.phase === 'done') { this._result(ctx, Wv, Hv); return; }
    ctx.fillStyle = '#07030a'; ctx.fillRect(0, 0, Wv, Hv);
    if (this.phase === 'load' || !C || !rig?.ready) { text(ctx, '성능 진단을 준비하는 중…', Wv / 2, Hv / 2, { size: 22, weight: 700, align: 'center', color: BONE }); g.dirty = true; return; }
    if (rig.glr.lost) { text(ctx, '화면을 되살리는 중…', Wv / 2, Hv / 2, { size: 22, weight: 700, align: 'center', color: BONE }); g.dirty = true; return; }
    const t0 = now(), every = C.pace === 'every', ts = g.last;
    if (every) g.dirty = true;                               // 다음 rAF 에도 그린다 (틱이 없어도)
    const fresh = every || this.steps > 0 || !C.lastDraw;    // 새 그림인가 (초당 60 방식은 틱이 돈 프레임만)
    const t = !C.t0 ? 0 : every ? Math.max(0, (ts - C.t0) / 1000) : this.simT;
    rig.frame(ctx, t, (o, w, h) => this._progress(o, w, h));
    if (C.t0 && fresh) {
      const el = ts - C.t0, R = C.raw;
      if (C.lastDraw && el >= C.skip && el < C.dur && R.ciN < R.ci.length) R.ci[R.ciN++] = ts - C.lastDraw;
      C.lastDraw = ts;
    }
    this.steps = 0;
    this._js += now() - t0;
  }
  _progress(o, Wv, Hv) {
    const g = this.game, s = g.safe ?? { l: 0, t: 0, r: 0, b: 0 }, C = this.cur, n = this.tests.length;
    const done = this.phase === 'calib' ? 0 : this.ti, el = C?.t0 ? clamp((this._pts - C.t0) / C.dur, 0, 1) : 0;
    const k = this.phase === 'calib' ? el * 0.03 : 0.03 + 0.97 * (done + el) / n, left = Math.max(1, Math.ceil(((1 - k) * (n * this.DUR + 1500)) / 1000));
    const w = Math.min(520, Wv - 40 - s.l - s.r), x = (Wv - w) / 2, y = 22 + s.t;
    o.fillStyle = 'rgba(6,3,10,0.78)'; o.fillRect(x - 14, y - 12, w + 28, 92);
    o.strokeStyle = 'rgba(232,200,114,0.6)'; o.lineWidth = 1.5; o.strokeRect(x - 13.5, y - 11.5, w + 27, 91);
    text(o, this.phase === 'calib' ? '성능 진단 · 화면 주사율 재는 중' : `성능 진단 ${done + 1} / ${n}`, x, y + 12, { size: 18, weight: 800, color: GOLD });
    text(o, `약 ${left}초 남음`, x + w, y + 12, { size: 15, weight: 600, align: 'right', color: BONE });
    o.fillStyle = '#2a1420'; o.fillRect(x, y + 24, w, 10); o.fillStyle = '#d8a848'; o.fillRect(x, y + 24, w * k, 10);
    if (C) text(o, `${PRESENT_KO[C.present]} · 해상도 ${Math.round(C.resK * 100)}% · ${CHARS_KO[C.chars]} · ${PACE_KO[C.pace]}`, x, y + 54, { size: 14, weight: 600, color: BONE });
    text(o, '끝날 때까지 화면을 건드리지 말고 기다려 주세요', x, y + 73, { size: 13, weight: 500, color: DIM });
  }

  // ───────────────────────── 결과 화면 ─────────────────────────
  _result(ctx, Wv, Hv) {
    const g = this.game, s = g.safe ?? { l: 0, t: 0, r: 0, b: 0 }, rep = this.report, env = rep.env, rows = rep.rows, best = rep.best;
    ctx.fillStyle = '#0a0610'; ctx.fillRect(0, 0, Wv, Hv);
    const tight = Hv < 620, x0 = 18 + s.l, x1 = Wv - 18 - s.r, w = x1 - x0;
    let y = s.t + (tight ? 30 : 40);
    text(ctx, '성능 진단 결과', x0, y, { size: tight ? 22 : 26, weight: 800, family: FONT.title, color: GOLD, ow: 4 });
    text(ctx, `화면 ${env.refresh.hz}Hz · 그림 크기 ${env.canvas[0]}×${env.canvas[1]} · 품질 ${TIER_KO[env.tier] ?? env.tier} · ${env.gl.api === 'webgl2' ? 'WebGL2' : env.gl.api === 'webgl1' ? 'WebGL1' : 'WebGL 없음'}`, x1, y - 2, { size: 13, align: 'right', color: DIM, ow: 2, maxWidth: w * 0.6 });
    y += tight ? 24 : 30;
    text(ctx, verdict(best), x0, y, { size: tight ? 15 : 17, weight: 700, color: best && best.uneven < 0.02 ? '#b8f0a8' : best && best.uneven < 0.08 ? '#ffe08a' : '#ffa090', ow: 3, maxWidth: w });
    y += tight ? 12 : 16;
    // 표
    const btnH = tight ? 40 : 46, footH = btnH + (tight ? 44 : 58) + s.b, headH = tight ? 22 : 26;
    const rowH = clamp(Math.floor((Hv - y - footH - headH - 6) / Math.max(1, rows.length)), 15, 30), fs = clamp(rowH - 6, 11, 15);
    const COLS = [['#', 0.04, 'center'], ['겹치는 법', 0.14, 'left'], ['해상도', 0.08, 'center'], ['캐릭터', 0.14, 'left'], ['그리기', 0.1, 'left'], ['초당 그림', 0.09, 'right'], ['끊김', 0.09, 'right'], ['느린 화면', 0.1, 'right'], ['화면 간격 보통/느릴 때', 0.22, 'right']];
    const cx = []; { let a = x0 + 6; for (const c of COLS) { cx.push(a); a += (w - 12) * c[1]; } cx.push(a); }
    const cell = (i, str, yy, o) => { const al = COLS[i][2], xx = al === 'left' ? cx[i] + 4 : al === 'right' ? cx[i + 1] - 6 : (cx[i] + cx[i + 1]) / 2; text(ctx, str, xx, yy, { size: fs, align: al, ow: 0, maxWidth: cx[i + 1] - cx[i] - 6, ...o }); };
    ctx.fillStyle = 'rgba(232,200,114,0.12)'; ctx.fillRect(x0, y, w, headH);
    COLS.forEach((c, i) => cell(i, c[0], y + headH - 7, { color: GOLD, weight: 700 }));
    y += headH;
    for (const r of rows) {
      if (r.best) { ctx.fillStyle = 'rgba(232,200,114,0.22)'; ctx.fillRect(x0, y, w, rowH); ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 0.75, y + 0.75, w - 1.5, rowH - 1.5); }
      else if (r.id % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(x0, y, w, rowH); }
      const yy = y + rowH - Math.max(4, (rowH - fs) / 2 + 1), col = r.best ? '#fff4d8' : r.pick ? BONE : DIM, wt = r.best ? 800 : 500;
      cell(0, r.best ? '추천' : String(r.id), yy, { color: r.best ? GOLD : col, weight: wt });
      cell(1, PRESENT_KO[r.present], yy, { color: col, weight: wt }); cell(2, Math.round(r.resK * 100) + '%', yy, { color: col, weight: wt });
      cell(3, CHARS_KO[r.chars], yy, { color: col, weight: wt }); cell(4, PACE_KO[r.pace], yy, { color: col, weight: wt });
      if (!r.valid) { cell(8, '재지 못함', yy, { color: '#ff9a90' }); y += rowH; continue; }
      const uc = r.uneven < 0.02 ? '#b8f0a8' : r.uneven < 0.08 ? '#ffe08a' : '#ffa090';
      cell(5, r.fps + '장', yy, { color: col, weight: wt }); cell(6, (r.uneven * 100).toFixed(1) + '%', yy, { color: uc, weight: 700 });
      cell(7, (r.slow * 100).toFixed(1) + '%', yy, { color: col, weight: wt }); cell(8, `${r.p50.toFixed(1)} / ${r.p95.toFixed(1)} · 최장 ${Math.round(r.stall)}ms`, yy, { color: col, weight: wt });
      y += rowH;
    }
    y += tight ? 14 : 18;
    text(ctx, '끊김 = 새 그림이 고르지 않게 올라온 비율 (낮을수록 부드럽다) · 흐린 줄은 원인을 가르려고 잰 참고용', x0, y, { size: 12, color: DIM, ow: 0, maxWidth: w });
    if (rep.note) text(ctx, rep.note, x0, y + 16, { size: 12, color: '#ffb0a0', ow: 0, maxWidth: w });
    else if (this.saved || this.stored) text(ctx, this.saved ? '이 설정을 기기에 저장했습니다 (3D 판이 다음부터 이 설정으로 돕니다)' : `저장된 설정: ${settingKo({ present: this.stored.present, resK: this.stored.resK, pace: this.stored.cap === 60 ? 'cap60' : 'every' })}`, x0, y + 16, { size: 12, color: '#b8f0a8', ow: 0, maxWidth: w });
    // 버튼
    const labels = [this.box ? '상자 닫기' : '결과 복사', '이 설정으로 하기', '다시 재기', '나가기'];
    const gap = 10, bw = Math.min(210, (w - gap * 3) / 4), bx = x0 + (w - (bw * 4 + gap * 3)) / 2, by = Hv - s.b - btnH - 10;
    const hit = labels.map((l, i) => button(ctx, { x: bx + i * (bw + gap), y: by, w: bw, h: btnH }, l, { size: tight ? 15 : 17, disabled: i === 1 && !best, selected: i === 0 && !this.box && !this.copied }));
    this._boxRect = { x: x0, y: s.t + (tight ? 60 : 78), w, h: by - 12 - (s.t + (tight ? 60 : 78)) };
    if (this.box) this._placeBox();
    if (hit[0]) { if (this.box) this._closeBox(); else this._copy(); }
    else if (hit[1] && best) this._save();
    else if (hit[2]) { this._closeBox(); const r = this.rig; if (r?.ready) { this.saved = false; this.copied = 0; this._begin(); } else { this.exit(); this.enter(); } }
    else if (hit[3]) this._leave();
  }
  _save() {
    let ok = false; try { localStorage.setItem(STORE_KEY, JSON.stringify(this.report.store)); ok = true; } catch { ok = false; }
    this.saved = ok; if (ok) this.stored = this.report.store;
    this.game.toast(ok ? '이 설정을 저장했습니다' : '저장하지 못했습니다 (저장 공간을 쓸 수 없습니다)', ok ? '#b8f0a8' : '#ff9a9a');
  }
  async _copy() {
    const v = compactText(this.report); let ok = false;
    try { await navigator.clipboard.writeText(v); ok = true; } catch { ok = false; }
    if (!ok) {   // 클립보드를 못 쓰면 글 상자를 띄우고 한 번 더 시도 — 그래도 안 되면 상자의 글을 길게 눌러 복사
      this._openBox(v);
      try { this.box.focus(); this.box.select(); ok = document.execCommand('copy'); } catch { ok = false; }
    }
    this.copied = ok ? 1 : -1;
    this.game.toast(ok ? '결과를 복사했습니다. 붙여 넣어 보내 주세요' : '자동 복사가 안 됩니다. 상자의 글을 길게 눌러 복사하세요', ok ? '#9fe8ff' : '#ffd890');
  }
  /** 저장 코드 화면(scenes/front/dialogs.js)과 같은 방법: 캔버스 위에 진짜 <textarea> 를 얹어 고르고 복사할 수 있게 한다 */
  _openBox(v) {
    if (this.box || typeof document === 'undefined') return;
    const ta = document.createElement('textarea');
    ta.value = v; ta.readOnly = true; ta.spellcheck = false; ta.id = 'v2bench-text'; ta.setAttribute('aria-label', '성능 진단 결과');
    Object.assign(ta.style, {
      position: 'fixed', zIndex: 40, resize: 'none', boxSizing: 'border-box', padding: '10px 12px', background: 'rgba(8,3,10,0.97)', color: '#efe4cf', border: '1px solid #8a6a2a', borderRadius: '2px',
      font: '11px/1.4 ui-monospace, Menlo, Consolas, monospace', outline: 'none', whiteSpace: 'pre', overflow: 'auto', touchAction: 'auto', userSelect: 'text', webkitUserSelect: 'text',
    });
    const stop = (e) => e.stopPropagation();
    ta.addEventListener('pointerdown', stop); ta.addEventListener('touchstart', stop, { passive: true }); ta.addEventListener('touchmove', stop, { passive: true });
    ta.addEventListener('keydown', (e) => { if (e.ctrlKey || e.metaKey) e.stopPropagation(); });
    document.body.appendChild(ta); this.box = ta; this._boxKey = '';
    this._placeBox();
  }
  _placeBox() {
    const ta = this.box, cv = this.game.canvas, r = this._boxRect; if (!ta || !cv || !r) return;
    const R = cv.getBoundingClientRect(), sx = R.width / this.game.viewW, sy = R.height / this.game.viewH;
    const key = [R.left, R.top, R.width, R.height, r.x, r.y, r.w, r.h].join(',');
    if (key === this._boxKey) return; this._boxKey = key;
    const st = ta.style; st.left = R.left + r.x * sx + 'px'; st.top = R.top + r.y * sy + 'px'; st.width = r.w * sx + 'px'; st.height = Math.max(60, r.h * sy) + 'px';
  }
  _closeBox() { if (this.box) { this.box.remove(); this.box = null; } }
}
