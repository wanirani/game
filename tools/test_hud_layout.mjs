// HUD 영역 배치 시험 (MASTER_PLAN §1.8 acceptance; HUD-LAYOUT W1 은 스텁 위젯, HUD-FINAL W3 는 실제 위젯으로 다시 돌린다)
// 사용: node tools/test_hud_layout.mjs [--out dir] [--no-shots] [--only phone2,tablet]
//
// 보기(뷰포트)마다 실제 게임(s04)을 헤드리스 크로미움으로 열고, 페이지 안에서 src/render/hud_layout.js 를 불러
//  1) 명세 행렬: 보스 바 있음/없음 × 기믹 게이지 0–3줄 × 안전 영역(없음 / safeArea 'full' 인셋 47/47/0/21 CSS px)
//     각 조합에서 상시 영역끼리, 상시 영역 ↔ 알림 칸, 모든 영역 ↔ 패드 사각형이 겹치지 않는지,
//     화면·안전 영역 안에 있는지, 최소 크기(토스트 줄·알림 칸·보스 바·콤보 열·게이지)를 지키는지 검사한다.
//     패드 사각형: touchpad.occupiedRects() 가 무언가를 돌려주면 그것(실제 패드), 아니면 §1.4 기본 배치 모형
//     (PLAT-TOUCH 이전). 태블릿은 platform §5.2 대로 캔버스를 위에 붙이고 패드를 아래 띠에 둔 모형이다.
//  2) 실제 화면: hudLayout(world, vw, vh) 기본값(지금 입력 모드·패드·안전 영역)으로 같은 검사 + drawHUD 가 오류 없이 그려지는지
//  3) 스크린샷: HUD 를 채운 상태(보스 바, 콤보, 필살 가득, 스테이지 제목 카드) + 영역 윤곽선 → --out 폴더
// 추가 조합(정보용이 아니라 실패로 센다): 휴대폰의 왼손 모드, touchScale 1.3, safeArea 'fit' + 인셋.
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const OUT = arg('out', '/tmp/claude-0/proto/HUD-LAYOUT/test');
const SHOTS = !argv.includes('--no-shots');
const ONLY = arg('only', null) ? String(arg('only')).split(',') : null;
fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  { id: 'desk960', w: 960, h: 540, dpr: 1, touch: false },
  { id: 'desk1280', w: 1280, h: 540, dpr: 1, touch: false },   // 21:9 창 → vw 1280
  { id: 'phone1', w: 844, h: 390, dpr: 3, touch: true, expectSlot: 'top' },
  { id: 'phone2', w: 740, h: 360, dpr: 3, touch: true, expectSlot: 'top' },
  { id: 'tablet', w: 1024, h: 768, dpr: 2, touch: true, expectSlot: 'bottom' },
  { id: 'touch960L', w: 1280, h: 720, dpr: 1, touch: true },    // 16:9 터치 화면, 크기 등급 L
  { id: 'touch1280', w: 1000, h: 420, dpr: 2, touch: true },    // 초광폭 휴대폰 → vw 1280, 크기 등급 M
];
const INSETS = { l: 47, r: 47, t: 0, b: 21 };

const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

/** 페이지 안에서 도는 검사 (문자열로 넘기지 않고 함수로 넘긴다) */
async function pageChecks({ view, INSETS }) {
  const M = await import('/src/render/hud_layout.js');
  const TP = await import('/src/core/touchpad.js');
  const g = window.__game, w = g.world;
  const fails = [], notes = [], info = new Set();
  const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const f1 = (r) => `(${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)})`;
  let realPad = [];
  try { realPad = TP.touchpad.occupiedRects?.() ?? []; } catch { realPad = []; }
  const padSource = realPad.length ? 'real' : 'model';

  // sizes = false: 최소 크기·토스트 줄 수는 정보로만 적는다 (touchScale 1.3: §1.8 은 '겹치지 말고 줄어들 것'만 요구)
  function check(tag, L, { boss, meters, safe, vw, vh, sizes = true }) {
    const R = M.hudRegions(L, { boss, meters, toasts: L.toastRows });
    const all = [...R.persistent, ...R.toasts];
    const bad = (m) => fails.push(`${tag}: ${m}`);
    const small = (m) => (sizes ? bad(m) : info.add(`${tag.split('/').slice(0, 2).join('/')}: ${m.replace(/\(.*$/, '').trim()}`));
    // 겹침
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) if (ov(all[i][1], all[j][1])) bad(`${all[i][0]}${f1(all[i][1])} ↔ ${all[j][0]}${f1(all[j][1])}`);
      if (ov(all[i][1], R.transient)) bad(`${all[i][0]}${f1(all[i][1])} ↔ transient${f1(R.transient)}`);
    }
    for (const [n, r] of [...all, ['transient', R.transient]]) {
      for (const p of R.pad) if (ov(r, p)) bad(`${n}${f1(r)} ↔ pad:${p.id ?? '?'}${f1(p)}`);
      // 화면 / 안전 영역 안
      const s = safe ?? { l: 0, r: 0, t: 0, b: 0 };
      if (r.x < s.l - 0.01 || r.y < s.t - 0.01 || r.x + r.w > vw - s.r + 0.01 || r.y + r.h > vh - s.b + 0.01) bad(`${n}${f1(r)} 화면/안전 영역 밖 (vw ${vw}, safe ${JSON.stringify(s)})`);
      if (r.w < 0 || r.h < 0) bad(`${n} 음수 크기 ${f1(r)}`);
    }
    // 최소 크기
    for (const [n, r] of R.toasts) if (r.w < 120) small(`${n} 너무 좁다 ${f1(r)}`);
    if (R.transient.w < 160) small(`transient 너무 좁다 ${f1(R.transient)}`);
    if (L.combo.h < 40) small(`combo 너무 낮다 ${f1(L.combo)}`);
    if (boss && L.bossBar.w < 240) small(`boss 너무 좁다 ${f1(L.bossBar)}`);
    for (let i = 0; i < meters; i++) if (L.meter(i).w < 100) small(`meter${i} 너무 좁다 ${f1(L.meter(i))}`);
    // 토스트 줄 수: 위쪽 보스 바가 보이면 1, 아니면 3
    const want = boss && L.bossSlot === 'top' ? 1 : 3;
    if (L.toastRows !== want) small(`toastRows ${L.toastRows} (기대 ${want})`);
    return R;
  }

  // 1) 명세 행렬
  const variants = [
    { tag: 'plain', inset: { l: 0, r: 0, t: 0, b: 0 }, mode: 'fit' },
    { tag: 'full+inset', inset: INSETS, mode: 'full' },
  ];
  if (view.touch && view.h < 400) {
    variants.push({ tag: 'fit+inset', inset: INSETS, mode: 'fit' });
    variants.push({ tag: 'lefthand', inset: { l: 0, r: 0, t: 0, b: 0 }, mode: 'fit', leftHanded: true });
    variants.push({ tag: 'scale1.3', inset: { l: 0, r: 0, t: 0, b: 0 }, mode: 'fit', touchScale: 1.3 });
    variants.push({ tag: 'full+inset+scale1.3', inset: INSETS, mode: 'full', touchScale: 1.3 });
  }
  let combos = 0;
  const slots = {};
  for (const v of variants) {
    const mv = M.modelView(view.w, view.h, v.inset, v.mode);
    const pad = !view.touch ? [] : (realPad.length && v.tag === 'plain' ? realPad : M.modelPadRects({ vw: mv.vw, cssW: view.w, cssH: view.h, canvas: mv.canvas, inset: v.inset, touchScale: v.touchScale, leftHanded: v.leftHanded }));
    for (const boss of [false, true]) {
      for (let meters = 0; meters <= 3; meters++) {
        const L = M.hudLayout(null, mv.vw, 540, pad, { touch: view.touch, safe: mv.safe, boss, meters });
        check(`${view.id}/${v.tag}/boss${boss ? 1 : 0}/m${meters}`, L, { boss, meters, safe: mv.safe, vw: mv.vw, vh: 540, sizes: !v.touchScale });
        combos++;
        slots[v.tag] = L.bossSlot;
        if (boss && meters === 3) notes.push(`${v.tag}: vw ${mv.vw} slot ${L.bossSlot} boss${f1(L.bossBar)} transient${f1(L.transient)} combo${f1(L.combo)} toast0${f1({ x: L.toast(0).l, y: L.toast(0).top, w: L.toast(0).w, h: 26 })} padLeft ${L.padLeft == null ? '-' : Math.round(L.padLeft)} padTop ${L.padTop == null ? '-' : Math.round(L.padTop)}`);
      }
    }
  }
  if (view.expectSlot && slots.plain !== view.expectSlot) fails.push(`${view.id}: 보스 칸 ${slots.plain} (기대 ${view.expectSlot})`);

  // 2) 실제 화면 (기본값: 지금 입력 모드·패드·안전 영역)
  const live = M.hudLayout(w, g.viewW, g.viewH);
  const liveTouch = live.touch;
  if (liveTouch !== view.touch) fails.push(`${view.id}/live: 입력 모드 touch=${liveTouch} (기대 ${view.touch})`);
  check(`${view.id}/live`, live, { boss: live.bossShown, meters: 3, safe: live.safe, vw: g.viewW, vh: g.viewH });
  // 같은 입력 → 같은 객체 (한 프레임에 여러 번 불러도 할당 없음)
  if (M.hudLayout(w, g.viewW, g.viewH) !== live) fails.push(`${view.id}/live: 같은 입력인데 새 객체를 만든다 (기억 실패)`);
  return { fails, notes, info: [...info], combos, padSource, vw: g.viewW, liveSlot: live.bossSlot, livePad: live.pad.length };
}

/** 스크린샷용: 월드를 멈추고 HUD 를 가득 채운 뒤, 영역 윤곽선을 캔버스 위 DOM 오버레이에 그린다 */
async function stageHud(page, overlay) {
  await page.evaluate(async (overlay) => {
    const M = await import('/src/render/hud_layout.js');
    const g = window.__game, w = g.world, sc = g.top;
    sc.update = () => {};
    w.banner = { text: w.stage.name, sub: `CHAPTER ${w.stage.chapter ?? ''} · ${w.stage.sub ?? ''}`, t: 3.0, color: '#e8c872', big: true };
    w.banner._t0 = 4.2;
    w.combo.n = 37; w.combo.t = 2.0; w.combo.max = Math.max(w.combo.max ?? 0, 37);
    w.run.sp = 100; w.time = 0.1;
    w.player.buffs.haste = 20; w.player.buffs.rage = 12; w.player.buffs.magnet = 9999; w.player.buffs.holyaura = 15; w.player.buffs.invincible = 5; w.player.buffs.gunmode = 8;
    w.boss = { def: { name: '진홍의 갑주군주', title: '피로 벼린 갑옷의 주인', phases: [0.5] }, hp: 620, hpGhost: 700, stats: { maxHp: 1000 }, dead: false, dying: 0 };
    w.bossActive = true; w.cutscene = false;
    document.getElementById('hudov')?.remove();
    if (!overlay) return;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const L = M.hudLayout(w, g.viewW, g.viewH);
    const cr = g.canvas.getBoundingClientRect(), k = cr.width / g.viewW;
    const c = document.createElement('canvas');
    c.id = 'hudov'; c.width = cr.width * 2; c.height = cr.height * 2;
    Object.assign(c.style, { position: 'fixed', left: cr.left + 'px', top: cr.top + 'px', width: cr.width + 'px', height: cr.height + 'px', pointerEvents: 'none', zIndex: 50 });
    document.body.appendChild(c);
    const x = c.getContext('2d'); x.scale(2 * k, 2 * k); x.lineWidth = 1.5 / k; x.font = `${10 / k * 0.9}px sans-serif`;
    const R = M.hudRegions(L, { boss: true, meters: 3 });
    const box = (n, r, col) => { x.strokeStyle = col; x.strokeRect(r.x, r.y, r.w, r.h); x.fillStyle = col; x.fillText(n, r.x + 2, r.y + 10); };
    for (const [n, r] of R.persistent) box(n, r, '#3f3');
    for (const [n, r] of R.toasts) box(n, r, '#3ff');
    box('transient', R.transient, '#ff3');
    for (const p of R.pad) box(p.id ?? 'pad', p, '#f44');
  }, overlay);
  await page.waitForTimeout(250);
}

const report = [];
let failTotal = 0, comboTotal = 0;
for (const view of VIEWS) {
  if (ONLY && !ONLY.includes(view.id)) continue;
  const ctx = await browser.newContext(view.touch
    ? { viewport: { width: view.w, height: view.h }, deviceScaleFactor: view.dpr, hasTouch: true, isMobile: true }
    : { viewport: { width: view.w, height: view.h }, deviceScaleFactor: view.dpr });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|ERR_CERT|fonts\.g/.test(t)) errs.push('CONSOLE ' + t.slice(0, 300)); } });
  let res;
  try {
    await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=s04`, { timeout: 30000 });
    await page.waitForFunction(() => window.__game?.world?.player && window.__game.top?.name === 'stage', null, { timeout: 30000 });
    await page.waitForTimeout(1200);
    res = await page.evaluate(pageChecks, { view, INSETS });
    if (SHOTS) {
      await stageHud(page, false);
      await page.screenshot({ path: `${OUT}/${view.id}_hud.png` });
      await stageHud(page, true);
      await page.screenshot({ path: `${OUT}/${view.id}_regions.png` });
    }
  } catch (e) { res = { fails: ['HARNESS ' + e.message], notes: [], combos: 0 }; }
  await ctx.close();
  const fails = [...res.fails, ...new Set(errs)];
  failTotal += fails.length; comboTotal += res.combos;
  report.push({ view: view.id, ...res, errs: [...new Set(errs)] });
  console.log(`${fails.length ? '✗' : '✓'} ${view.id}  vw ${res.vw}  pad ${res.padSource}  조합 ${res.combos}  실제 보스 칸 ${res.liveSlot}${fails.length ? '\n    ' + fails.slice(0, 12).join('\n    ') + (fails.length > 12 ? `\n    … 외 ${fails.length - 12}건` : '') : ''}`);
  for (const n of res.notes ?? []) console.log('    · ' + n);
  for (const n of res.info ?? []) console.log('    (정보) ' + n);
}
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
console.log(`\n${failTotal ? '실패' : '통과'}: 조합 ${comboTotal}개, 문제 ${failTotal}건${SHOTS ? ` — 스크린샷 ${OUT}` : ''}`);
await browser.close(); srv.close();
process.exit(failTotal ? 1 : 0);
