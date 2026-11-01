// 「휴대폰 편의」 묶음 테스트 (Stage 6 PHONE): 절전 모드 · 진동 세기 · 화면 꺼짐 방지 · 복귀 일시정지 · 옵션 줄
// 사용: node tools/test_phone.mjs [--node] (--node: 브라우저 단계 생략)
//  1) (node) haptics.scaleVibe: 끔/약/중/강 배율, 패턴은 진동 칸만, 6–400 ms · Haptics.phone 이 세기를 적용하고 끔이면 부르지 않는다
//  2) (node) 설정: batterySaver·vibeLevel 기본값과 Stage 5 설정 이관 (자세한 검증은 test_settings_v2)
//  3) (브라우저) 절전 모드: 60 Hz rAF 에서 30 → 그리기 ≈ 30/s, 45 → ≈ 45/s, 틱은 늘 60/s (게임 속도 그대로), 품질 등급 한 단계 아래, 끄면 원래대로
//  4) (브라우저) 진동 세기: 피격 진동 길이 약 15 · 중 30 · 강 48 ms, 끔 → 호출 없음 (navigator.vibrate 가로채기)
//  5) (브라우저) 화면 꺼짐 방지: 스테이지에서 Wake Lock 요청 → 일시정지에서 풀림 → 계속하면 다시 · 설정 끔이면 요청 없음 · APK 브리지 keepAwake(bool)
//  6) (브라우저) 복귀: 스테이지 중 앱이 뒤로 가면(visibilitychange hidden) 일시정지 메뉴, 첫 줄 「계속하기」, 계속하면 스테이지로
//  7) (브라우저, fold_open·phone2) 옵션: 화면 장에 「절전 모드」, 터치 장에 「진동 세기」 줄 · 탭 영역 ≥ 44 CSS px · 패드(키보드)로 값 바꾸기
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE_ONLY = process.argv.includes('--node');
let fails = 0, passes = 0;
const ok = (cond, msg, detail = '') => { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg + (detail ? ` — ${detail}` : '')); } };
const section = (t) => console.log('▶ ' + t);

// ── 1. scaleVibe · Haptics.phone (node) ──
section('haptics: 진동 세기');
const calls = [];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { vibrate: (v) => { calls.push(v); return true; }, userActivation: { hasBeenActive: true } } });
const H = await import(path.join(ROOT, 'src/core/haptics.js'));
const { scaleVibe, VIBE_LEVELS, EFFECTS, haptics } = H;
ok(VIBE_LEVELS.off === 0 && VIBE_LEVELS.low < VIBE_LEVELS.mid && VIBE_LEVELS.mid === 1 && VIBE_LEVELS.high > 1, '배율 순서 off 0 < low < mid 1 < high');
ok(scaleVibe(30, 'mid') === 30 && scaleVibe(30, 'low') === 15 && scaleVibe(30, 'high') === 48, `피격 30 ms → 15/30/48 (${scaleVibe(30, 'low')}/${scaleVibe(30, 'mid')}/${scaleVibe(30, 'high')})`);
ok(scaleVibe(30, 'off') === false && scaleVibe(false, 'high') === false && scaleVibe(0, 'mid') === false && scaleVibe(null, 'mid') === false, '끔·false·0·null → false');
ok(scaleVibe(30, undefined) === 30, '세기 없음(옛 설정) → 중과 같다');
ok(JSON.stringify(scaleVibe([40, 30, 60], 'low')) === '[20,30,30]' && JSON.stringify(scaleVibe([40, 30, 60], 'high')) === '[64,30,96]', `패턴: 진동 칸만 배율, 쉼 그대로 (${JSON.stringify(scaleVibe([40, 30, 60], 'low'))})`);
ok(scaleVibe(4, 'low') === 6 && scaleVibe(300, 'high') === 400, '진동 칸 6–400 ms');
for (const [name, e] of Object.entries(EFFECTS)) {
  if (e.phone === false) continue;
  const lo = scaleVibe(e.phone, 'low'), hi = scaleVibe(e.phone, 'high');
  const sum = (v) => (Array.isArray(v) ? v.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) : v);
  ok(sum(lo) < sum(e.phone) && sum(hi) > sum(e.phone), `${name}: 약 < 중 < 강`);
}
// Haptics.phone 에 설정 적용 (game.settings 를 가짜로)
const fakeGame = { settings: { vibration: true, vibeLevel: 'mid' }, top: { name: 'stage' } };
haptics.game = fakeGame;
const ring = (lvl, vib = true) => { calls.length = 0; fakeGame.settings.vibeLevel = lvl; fakeGame.settings.vibration = vib; haptics.phone(30); return calls.slice(); };
ok(JSON.stringify(ring('low')) === '[15]' && JSON.stringify(ring('mid')) === '[30]' && JSON.stringify(ring('high')) === '[48]', 'Haptics.phone(30) → 15 · 30 · 48');
ok(ring('off').length === 0, '세기 끔 → navigator.vibrate 부르지 않음');
ok(ring('high', false).length === 0, 'vibration 끔(옛 설정) → 부르지 않음');
fakeGame.settings.vibeLevel = 'off'; fakeGame.settings.vibration = true;
ok(haptics.phoneOn(30) === false, 'phoneOn: 세기 끔 → false (제한 칸을 차지하지 않는다)');
fakeGame.settings.vibeLevel = 'low';
ok(haptics.phoneOn(30) === true, 'phoneOn: 약 → true');

// ── 2. 설정 키 ──
section('설정: 절전 모드 · 진동 세기');
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
const S = await import(path.join(ROOT, 'src/core/save.js'));
ok(S.DEFAULT_SETTINGS.batterySaver === 0 && S.DEFAULT_SETTINGS.vibeLevel === 'mid', '기본값 절전 끔 · 진동 중');
ok(S.migrateSettings({ settingsVersion: 2, vibration: false }).settings.vibeLevel === 'off', 'Stage 5 진동 끔 → 세기 끔');
ok(S.migrateSettings({ settingsVersion: 2, batterySaver: 30 }).settings.batterySaver === 30, '절전 30 유지');

// ── 3–7. 브라우저 ──
if (!NODE_ONLY) {
  const { openEnv } = await import('./qa/lib/server.mjs');
  const { runFrames } = await import('./qa/lib/clock.mjs');
  const env = await openEnv();
  const stage = async (vp, settings = {}, initScripts = []) => {
    const s = await env.page(vp, 'index.html?scene=stage&stage=s01', { settings: { quality: 'high', ...settings }, initScripts });
    await s.waitGame('!!g.world?.player');
    await s.wait(1200);
    await s.skipDialogue();
    return s;
  };
  const errsOf = (s) => (s.errs || []).filter((e) => !/Failed to load resource|ERR_|fonts\.g/.test(String(e)));
  try {
    // 3. 절전 모드 (desk: 60 Hz 가상 rAF)
    section('절전 모드: 그리기 상한 · 게임 속도 · 품질');
    {
      const s = await stage('desk');
      const rate = async (sv) => {
        await s.eval((sv) => { window.__game.settings.batterySaver = sv; }, sv);
        await runFrames(s.page, 1000 / 60, 30);
        const r = await runFrames(s.page, 1000 / 60, 240);
        const sec = r.virtualMs / 1000;
        const st = await s.eval(() => ({ tier: window.__game.tier, q: window.__game.settings.quality, dpr: window.__game.dpr }));
        return { draw: r.renders / sec, tick: r.ticks / sec, ...st };
      };
      const off = await rate(0), s30 = await rate(30), s45 = await rate(45), s60 = await rate(60), back = await rate(0);
      const d = (x) => `${x.draw.toFixed(1)}/s draw, ${x.tick.toFixed(1)}/s tick, ${x.tier}`;
      ok(off.draw > 57 && off.tier === 'high', `끔: 60 Hz 마다 그림 (${d(off)})`);
      ok(s30.draw > 28 && s30.draw < 32, `30: 그리기 ≈ 30/s (${d(s30)})`);
      ok(s45.draw > 43 && s45.draw < 47, `45: 그리기 ≈ 45/s (${d(s45)})`);
      ok(s60.draw > 57 && s60.draw <= 61, `60: 그리기 ≈ 60/s (${d(s60)})`);
      for (const [n, x] of [['끔', off], ['30', s30], ['45', s45], ['60', s60]]) ok(x.tick > 58 && x.tick < 62, `${n}: 틱 60/s 그대로 (게임 속도) (${x.tick.toFixed(1)})`);
      ok(s30.tier === 'medium' && s45.tier === 'medium' && s60.tier === 'medium' && s30.q === 'high', `켜면 품질 한 단계 아래 (설정 high → ${s30.tier}), 설정값은 그대로 (${s30.q})`);
      ok(back.tier === 'high' && back.draw > 57, `끄면 원래 등급·속도 (${d(back)})`);
      ok(s30.dpr <= off.dpr, `절전 중 DPR 이 늘지 않는다 (${off.dpr} → ${s30.dpr})`);
      // 낮음 등급은 더 내려가지 않는다
      const low = await s.eval(() => { const g = window.__game; g.settings.quality = 'low'; g.settings.batterySaver = 30; g.resize(); return g.tier; });
      ok(low === 'low', `품질 낮음 + 절전 → 낮음 그대로 (${low})`);
      // 플레이어가 실제로 같은 거리를 간다: 절전 30 과 끔에서 같은 틱 수 → 같은 시간 진행 (게임 시계)
      // (runFrames 가 가상 시계를 쥐기 전의 실제 프레임은 빼고 잰다: 틱 수 × 1/60 = 지나간 가상 시간)
      await s.eval(() => { window.__game.settings.batterySaver = 30; });
      const r = await runFrames(s.page, 1000 / 60, 120);
      ok(Math.abs(r.ticks / 60 - r.virtualMs / 1000) < 0.05 && r.renders <= 62, `절전 30: 게임 시계 = 실제 시간 (${(r.ticks / 60).toFixed(2)} s / ${(r.virtualMs / 1000).toFixed(2)} s, 그림 ${r.renders})`);
      ok(!errsOf(s).length, '페이지 오류 없음', errsOf(s).slice(0, 2).join(' | '));
      await s.close();
    }

    // 4. 진동 세기 (phone2, 터치 모드)
    section('진동 세기: 피격 진동');
    {
      const init = () => { window.__vib = []; const f = (v) => { window.__vib.push(v); return true; }; try { Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: f }); } catch { /* 무시 */ } try { Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { hasBeenActive: true, isActive: true } }); } catch { /* 무시 */ } };
      const s = await stage('phone2', {}, [init]);
      const hit = async (lvl, vib = true) => s.eval(async ({ lvl, vib }) => {
        const g = window.__game; g.settings.vibeLevel = lvl; g.settings.vibration = vib;
        const H = (await import('/src/core/haptics.js')).haptics;
        H.reset(); H.last?.clear?.(); H.active = null;
        g.input.mode = 'touch'; if ('touchMode' in g.input) g.input.touchMode = true;
        window.__vib.length = 0;
        H.play('hurt');
        return { v: window.__vib.slice(), tgt: H.target?.() };
      }, { lvl, vib });
      const lo = await hit('low'), mid = await hit('mid'), hi = await hit('high'), off = await hit('off'), old = await hit('mid', false);
      ok(JSON.stringify(lo.v) === '[15]' && JSON.stringify(mid.v) === '[30]' && JSON.stringify(hi.v) === '[48]', `피격: 약 ${fmtV(lo.v)} · 중 ${fmtV(mid.v)} · 강 ${fmtV(hi.v)} (target ${mid.tgt})`);
      ok(off.v.length === 0 && old.v.length === 0, `끔·옛 진동 끔 → 호출 없음 (${fmtV(off.v)} ${fmtV(old.v)})`);
      ok(!errsOf(s).length, '페이지 오류 없음', errsOf(s).slice(0, 2).join(' | '));
      await s.close();
    }

    // 5–6. 화면 꺼짐 방지 · 복귀 일시정지 (fold_open)
    section('화면 꺼짐 방지 · 복귀 일시정지');
    {
      const init = () => {
        window.__wake = { req: 0, rel: 0, held: 0, br: [] };
        const W = window.__wake;
        const mk = () => { const t = new EventTarget(); t.released = false; t.type = 'screen'; t.release = async () => { if (!t.released) { t.released = true; W.rel++; W.held--; t.dispatchEvent(new Event('release')); } }; return t; };
        try { Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => ({ request: async () => { W.req++; W.held++; return mk(); } }) }); } catch { /* 무시 */ }
        window.BNAndroid = Object.assign(window.BNAndroid || {}, { keepAwake: (on) => W.br.push(!!on) });
      };
      const s = await stage('fold_open', {}, [init]);
      await s.wait(1200);   // platform tick 500 ms
      const st = () => s.eval(async () => { const P = await import('/src/core/platform.js'); return { ...window.__wake, br: window.__wake.br.slice(), ws: P.wakeState(), top: window.__game.top?.name }; });
      const a = await st();
      ok(a.ws.want && a.held === 1 && a.ws.held, `스테이지: Wake Lock 쥠 (${JSON.stringify(a.ws)}, req ${a.req})`);
      ok(a.br.at(-1) === true, `APK 브리지 keepAwake(true) (${JSON.stringify(a.br)})`);
      // 앱이 뒤로 감 → 일시정지 메뉴 (복귀 카드)
      await s.eval(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
      await s.wait(300);
      const b = await st();
      ok(b.top === 'pause', `뒤로 가면 일시정지 메뉴 (${b.top})`);
      ok(b.held === 0, `숨으면 Wake Lock 풀림 (held ${b.held})`);
      await s.eval(() => { delete document.hidden; delete document.visibilityState; Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
      await s.wait(1300);
      const c = await st();
      const first = await s.eval(() => { const t = window.__game.top; const it = (t.items || t.list || t.entries || []); const x = it[0]; return x?.label ?? null; });
      ok(c.top === 'pause' && first === '계속하기', `돌아오면 일시정지 그대로, 첫 줄 「계속하기」 (${c.top}, ${first})`);
      ok(!c.ws.want && c.held === 0 && c.br.at(-1) === false, `일시정지 중에는 화면 꺼짐 방지 풀림 (want ${c.ws.want}, held ${c.held}, bridge ${JSON.stringify(c.br)})`);
      // 계속하기 → 스테이지, 다시 쥠
      await s.key('Escape'); await s.wait(1300);
      const d = await st();
      ok(d.top === 'stage' && d.held === 1 && d.br.at(-1) === true, `계속하면 스테이지 + 다시 쥠 (${d.top}, held ${d.held}, bridge ${JSON.stringify(d.br)})`);
      // 설정 끔 → 풀림
      await s.eval(() => { window.__game.settings.keepAwake = false; }); await s.wait(1200);
      const e = await st();
      ok(e.held === 0 && !e.ws.want && e.br.at(-1) === false, `설정 끔 → 풀림 (held ${e.held}, bridge ${JSON.stringify(e.br)})`);
      // 타이틀 → 풀림 (설정 켬이어도)
      await s.eval(() => { window.__game.settings.keepAwake = true; window.__game.go('title', {}, { fade: false }); }); await s.wait(1300);
      const f = await st();
      ok(f.top === 'title' && f.held === 0 && !f.ws.want, `타이틀에서는 풀림 (${f.top}, held ${f.held})`);
      ok(!errsOf(s).length, '페이지 오류 없음', errsOf(s).slice(0, 2).join(' | '));
      await s.close();
    }

    // 7. 옵션 줄 (fold_open · phone2)
    section('옵션: 절전 모드 · 진동 세기 줄');
    for (const vp of ['fold_open', 'phone2']) {
      const s = await env.page(vp, 'index.html', { settings: { quality: 'medium', batterySaver: 0, vibeLevel: 'mid', vibration: true } });
      await s.waitGame("g.top?.name === 'title'");
      await s.wait(600);
      const find = (id) => s.eval((id) => {
        const sc = window.__game.top;
        for (const [pg, list] of Object.entries(sc.defs || {})) { const i = (list || []).findIndex((r) => r.id === id); if (i >= 0) return { page: pg, i }; }
        return null;
      }, id);
      const openAt = async (page, row) => { await s.eval(({ page, row }) => window.__game.go('options', { page, row }, { fade: false }), { page, row }); await s.wait(700); };
      const selRow = () => s.eval(() => { const sc = window.__game.top; const r = sc.rows()[sc.sel[sc.page]]; return r?.id ?? null; });
      await openAt('screen', 'batterySaver');
      const bs = await find('batterySaver'), vl = await find('vibeLevel');
      ok(bs?.page === 'screen', `${vp}: 「절전 모드」 화면 장 (${JSON.stringify(bs)})`);
      ok(vl?.page === 'touch', `${vp}: 「진동 세기」 터치 장 (${JSON.stringify(vl)})`);
      ok((await selRow()) === 'batterySaver', `${vp}: 절전 모드 줄 선택`);
      // 키보드(패드와 같은 Nav): → 로 값 바꾸기 0 → 60 → 45
      await s.key('ArrowRight'); await s.wait(150); await s.key('ArrowRight'); await s.wait(150);
      const v1 = await s.eval(() => window.__game.settings.batterySaver);
      ok(v1 === 45, `${vp}: → 두 번 → 절전 45 (${v1})`);
      // 줄 높이 ≥ 44 CSS px (탭 영역)
      const hRow = await s.eval(() => { const g = window.__game, sc = g.top; const k = (sc.uiScale ? g.uiK : 1) * g.cssScale; return sc.L?.th ? sc.L.th * k : null; });
      ok(hRow == null || hRow >= 43.5, `${vp}: 옵션 줄 높이 ≥ 44 CSS px (${hRow?.toFixed?.(1)})`);
      await s.screenshot(`/tmp/claude-0/s6/fold/phone/options_screen_${vp}.png`);
      await openAt('touch', 'vibeLevel');
      ok((await selRow()) === 'vibeLevel', `${vp}: 진동 세기 줄 선택`);
      await s.key('ArrowLeft'); await s.wait(150);
      const v2 = await s.eval(() => ({ l: window.__game.settings.vibeLevel, v: window.__game.settings.vibration }));
      ok(v2.l === 'low' && v2.v === true, `${vp}: ← → 진동 약, vibration 켬 유지 (${JSON.stringify(v2)})`);
      await s.key('ArrowLeft'); await s.wait(150);
      const v3 = await s.eval(() => ({ l: window.__game.settings.vibeLevel, v: window.__game.settings.vibration }));
      ok(v3.l === 'off' && v3.v === false, `${vp}: ← → 진동 끔, vibration 도 끔 (옛 앱과 같은 뜻) (${JSON.stringify(v3)})`);
      await s.screenshot(`/tmp/claude-0/s6/fold/phone/options_touch_${vp}.png`);
      ok(!errsOf(s).length, `${vp}: 페이지 오류 없음`, errsOf(s).slice(0, 2).join(' | '));
      await s.close();
    }
  } finally {
    await env.close();
  }
}
function fmtV(v) { return JSON.stringify(v); }

console.log(fails ? `✗ test_phone: ${passes} 통과, ${fails} 실패` : `✓ test_phone: ${passes} 통과, 0 실패`);
process.exit(fails ? 1 : 0);
