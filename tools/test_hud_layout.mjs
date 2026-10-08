// HUD 영역 배치 시험 (MASTER_PLAN §1.8 acceptance; HUD-LAYOUT W1 은 스텁 위젯, HUD-FINAL W3 는 실제 위젯으로 다시 돌린다)
// 사용: node tools/test_hud_layout.mjs [--out dir] [--no-shots] [--only phone2,tablet] [--no-widgets]
//
// 보기(뷰포트)마다 실제 게임(s04)을 헤드리스 크로미움으로 열고, 페이지 안에서 src/render/hud_layout.js 를 불러
//  1) 명세 행렬: 보스 바 있음/없음 × 기믹 게이지 0–3줄 × 안전 영역(없음 / safeArea 'full' 인셋 47/47/0/21 CSS px)
//     각 조합에서 상시 영역끼리, 상시 영역 ↔ 알림 칸, 모든 영역 ↔ 패드 사각형이 겹치지 않는지,
//     화면·안전 영역 안에 있는지, 최소 크기(토스트 줄·알림 칸·보스 바·콤보 열·게이지)를 지키는지 검사한다.
//     패드 사각형: touchpad.occupiedRects() 가 무언가를 돌려주면 그것(실제 패드), 아니면 §1.4 기본 배치 모형
//     (PLAT-TOUCH 이전). 태블릿은 platform §5.2 대로 캔버스를 위에 붙이고 패드를 아래 띠에 둔 모형이다.
//  2) 실제 화면: hudLayout(world, vw, vh) 기본값(지금 입력 모드·패드·안전 영역)으로 같은 검사 + drawHUD 가 오류 없이 그려지는지
//  3) 실제 위젯 픽셀 검사 (HUD-FINAL): HUD 를 가득 채운 두 장면 — A: 스테이지 제목 배너 · 보스 없음, B: 보스 바 · 알림(SSS
//     'BLOOD NOCTURNE!!!') — 에 1차 전직 각성 게이지(두 게이지 가득 → '각성 가능!' + SP 막대 빛), 콤보 137 + SSS 랭크 + 이정표 +
//     총 피해, 동료 위젯 3개(비행 탈것 탑승 중 + 수호신 2, AUTO), 수호신 스킬 카드, 기믹 게이지 3줄, 토스트 3개, 버프 6개를 켠다.
//     hud.js 의 drawHUDPart 로 부분마다 따로(투명 캔버스에) 그리고, 알파 ≥ 0.3 픽셀이
//       · 다른 부분의 칸·알림 칸·토스트 줄·패드 사각형(탑승/수호 버튼 포함 실제 패드)에 들어가면 실패
//       · 안전 영역 밖이나 (터치) y 297 아래(아래 보스 칸 제외)에 있으면 실패
//       · 상시 영역이 제 칸 밖 빈 곳으로 8 px 넘게 번지면 실패 (8 px 이하, 그리고 알림 칸·토스트는 정보)
//     허용 칸: 각성 게이지 = awGauge + ready + ult (SP 막대 위 빛; FEEL-HUD 계약), 나머지는 제 칸 하나.
//     변형: 휴대폰은 왼손 배치·touchScale 1.3(고정 영역까지 올라오는 패드는 정보), 노치 인셋 47/47/0/21 (safeArea 'fit' · 'full').
//     장면 B 는 연출 첫 프레임(콤보 숫자 튀기기·랭크 글자·이정표 박힘·알림 단어 2.2배 박힘)도 다시 잰다 (@pop: 빈 곳으로 넘치는 것은 정보).
//     각성 연출(world.hudHidden) 중 drawHUD 가 동료 탭 사각형을 비우는지도 본다 (요청 198).
//  4) 스크린샷: 장면 A/B + 영역 윤곽선 → --out 폴더
//  5) 글자 크기 (벤치마크 3, platform §6.2 'HUD 글자는 터치에서 ≥ 11 CSS px'): 3) 의 부분 그리기 동안 fillText 를 가로채
//     글꼴 px × 변환 배율 × cssScale 로 실제 화면 CSS px 를 잰다. 터치 보기에서 hud.js · companion_hud.js 가 그리는 부분
//     (초상화·체력·하트·스킬·필살·동료·카드·점수·보스 바·배너)이 11 CSS px 미만이면 실패, 다른 파일이 그리는 부분(각성 게이지·준비 문구,
//     콤보 열, 알림, 기믹 게이지, 토스트)은 정보로 적는다. 배치 행렬은 변형마다 그 캔버스 배율의 하한(textMin)으로 휴대폰 배치를 만든다.
// 추가 조합(정보용이 아니라 실패로 센다): 휴대폰의 왼손 모드, touchScale 1.3, safeArea 'fit' + 인셋.
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const OUT = arg('out', '/tmp/claude-0/proto/HUD-FINAL/test');
const SHOTS = !argv.includes('--no-shots');
const WIDGETS = !argv.includes('--no-widgets');
const ONLY = arg('only', null) ? String(arg('only')).split(',') : null;
fs.mkdirSync(OUT, { recursive: true });

const INSETS = { l: 47, r: 47, t: 0, b: 21 };
// notch: 노치 인셋을 CDP 로 흉내 낸 페이지 (배치 행렬은 건너뛰고 실제 화면·위젯 검사만, safeArea 'fit' 과 'full' 둘 다)
const VIEWS = [
  { id: 'desk960', w: 960, h: 540, dpr: 1, touch: false },
  { id: 'desk1280', w: 1280, h: 540, dpr: 1, touch: false },   // 21:9 창 → vw 1280
  { id: 'phone1', w: 844, h: 390, dpr: 3, touch: true, expectSlot: 'top' },
  { id: 'phone2', w: 740, h: 360, dpr: 3, touch: true, expectSlot: 'top' },
  { id: 'tablet', w: 1024, h: 768, dpr: 2, touch: true, expectSlot: 'bottom' },
  { id: 'touch960L', w: 1280, h: 720, dpr: 1, touch: true },    // 16:9 터치 화면, 크기 등급 L
  { id: 'touch1280', w: 1000, h: 420, dpr: 2, touch: true },    // 초광폭 휴대폰 → vw 1280, 크기 등급 M
  { id: 'phone1notch', w: 844, h: 390, dpr: 3, touch: true, notch: INSETS },
  { id: 'phone2notch', w: 740, h: 360, dpr: 3, touch: true, notch: INSETS },
];

const srv = await start(0);             // 빈 포트 (다른 에이전트의 서버와 부딪히지 않게)
const port = srv.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

/** 페이지 안에서 도는 검사 (문자열로 넘기지 않고 함수로 넘긴다) */
async function pageChecks({ view, INSETS }) {
  const M = await import('/src/render/hud_layout.js');
  const TP = await import('/src/core/touchpad.js');
  const g = window.__game, w = g.world;
  const fails = [], notes = [], info = new Set();
  const FIXED = new Set(['portrait', 'vitals', 'hearts', 'skills', 'ult', 'awGauge', 'ready', 'companions', 'score']);
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
      for (const p of R.pad) {
        if (!ov(r, p)) continue;
        // 스트레스 조합(touchScale 1.3)에서 패드가 고정 영역까지 올라오면 HUD 가 아니라 패드 배치 문제 (PLAT-TOUCH 가 줄여야 한다)
        if (!sizes && FIXED.has(n)) info.add(`${tag.split('/').slice(0, 2).join('/')}: 패드 ${p.id ?? '?'} 가 고정 영역 ${n} 까지 올라온다 → PLAT-TOUCH 가 크기를 제한해야 함`);
        else bad(`${n}${f1(r)} ↔ pad:${p.id ?? '?'}${f1(p)}`);
      }
      // 화면 / 안전 영역 안
      const s = safe ?? { l: 0, r: 0, t: 0, b: 0 };
      if (r.x < s.l - 0.01 || r.y < s.t - 0.01 || r.x + r.w > vw - s.r + 0.01 || r.y + r.h > vh - s.b + 0.01) bad(`${n}${f1(r)} 화면/안전 영역 밖 (vw ${vw}, safe ${JSON.stringify(s)})`);
      if (r.w < 0 || r.h < 0) bad(`${n} 음수 크기 ${f1(r)}`);
    }
    // 터치: y 297 아래(엄지·떠 있는 스틱 자리)에는 상시 영역이 없다 (§1.8 '터치 패드' 행; 아래 보스 칸만 예외)
    if (L.touch && R.pad.length) {
      for (const [n, r] of R.persistent) if (n !== 'boss' && r.h > 0 && r.y + r.h > M.TOUCH_FLOOR + 1 + 0.01) bad(`${n}${f1(r)} 가 터치 y 297 아래로 내려온다`);
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

  // 1) 명세 행렬 (노치 페이지는 건너뛴다: 모형 행렬은 인셋 없는 페이지에서 이미 인셋 조합까지 돈다)
  const variants = view.notch ? [] : [
    { tag: 'plain', inset: { l: 0, r: 0, t: 0, b: 0 }, mode: 'fit' },
    { tag: 'full+inset', inset: INSETS, mode: 'full' },
  ];
  if (!view.notch && view.touch && view.h < 400) {
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
    const textMin = view.touch ? Math.ceil(M.HUD_MIN_CSS / mv.cs - 1e-6) : 0;   // 이 변형의 캔버스 배율에서 터치 글자 하한
    for (const boss of [false, true]) {
      for (let meters = 0; meters <= 3; meters++) {
        const L = M.hudLayout(null, mv.vw, 540, pad, { touch: view.touch, safe: mv.safe, boss, meters, textMin });
        check(`${view.id}/${v.tag}/boss${boss ? 1 : 0}/m${meters}`, L, { boss, meters, safe: mv.safe, vw: mv.vw, vh: 540, sizes: !v.touchScale });
        combos++;
        slots[v.tag] = L.bossSlot;
        if (boss && meters === 3) notes.push(`${v.tag}: vw ${mv.vw} 글자 하한 ${L.textMin}${L.big ? ' (휴대폰 배치)' : ''} slot ${L.bossSlot} boss${f1(L.bossBar)} transient${f1(L.transient)} combo${f1(L.combo)} toast0${f1({ x: L.toast(0).l, y: L.toast(0).top, w: L.toast(0).w, h: 26 })} padLeft ${L.padLeft == null ? '-' : Math.round(L.padLeft)} padTop ${L.padTop == null ? '-' : Math.round(L.padTop)}`);
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
  // 기억: 패드 쪽이 같은 사각형 객체를 제자리에서 고쳐도 배치를 다시 계산한다 / 숫자가 아닌 사각형은 무시하고, 매번 다시 계산하지도 않는다
  if (view.touch && !view.notch) {
    const mv = M.modelView(view.w, view.h);
    const pad = M.modelPadRects({ vw: mv.vw, cssW: view.w, cssH: view.h, canvas: mv.canvas, inset: { l: 0, r: 0, t: 0, b: 0 } });
    const o = { touch: true, safe: { l: 0, r: 0, t: 0, b: 0 }, boss: false, meters: 3 };
    const A = M.hudLayout(null, mv.vw, 540, pad, o);
    const top = pad.filter((p) => p.y > 162).reduce((m, p) => (p.y < m.y ? p : m));
    const y0 = top.y; top.y = 60; // 제자리 수정 (touchScale 편집 흉내)
    const B = M.hudLayout(null, mv.vw, 540, pad, o);
    if (B === A || B.combo.h === A.combo.h) fails.push(`${view.id}/memo: 패드 사각형을 제자리에서 고쳤는데 배치가 그대로다 (combo h ${A.combo.h} → ${B.combo.h})`);
    top.y = y0;
    const withNaN = [...pad, { id: 'nan', x: NaN, y: NaN, w: 44, h: 44 }];
    const C = M.hudLayout(null, mv.vw, 540, withNaN, o);
    if (M.hudLayout(null, mv.vw, 540, withNaN, o) !== C) fails.push(`${view.id}/memo: NaN 사각형이 있으면 매번 다시 계산한다`);
    for (const k of ['combo', 'transient', 'bossTop', 'bossBottom']) if (![C[k].x, C[k].y, C[k].w, C[k].h].every(Number.isFinite)) fails.push(`${view.id}/nan: ${k} 가 숫자가 아니다 ${JSON.stringify(C[k])}`);
    if (C.pad.some((p) => p.id === 'nan')) fails.push(`${view.id}/nan: 숫자가 아닌 패드 사각형이 L.pad 에 남았다`);
  }
  return { fails, notes, info: [...info], combos, padSource, vw: g.viewW, liveSlot: live.bossSlot, livePad: live.pad.length };
}

/**
 * HUD 를 가득 채운다 (월드는 멈춘다). scen: 'A' = 스테이지 제목 배너·보스 없음, 'B' = 보스 바·알림.
 * settings: 휴대폰 변형 { safeArea, touchLeftHanded, touchScale } (바꾸면 화면 배치를 다시 잰다)
 */
async function stageScene({ scen, settings }) {
  const g = window.__game, w = g.world, sc = g.scenes.find((x) => x.name === 'stage') ?? g.top;
  const CL = await import('/src/data/classes.js');
  const CD = await import('/src/data/companions.js');
  const FH = await import('/src/data/feel_hit.js');
  const GM = await import('/src/game/gimmicks.js');
  const M = await import('/src/render/hud_layout.js');
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (!sc.__hudFrozen) { sc.__hudFrozen = true; sc.update = () => {}; }
  if (settings) {
    const st = g.settings;
    let relayout = false;
    for (const k in settings) if (st[k] !== settings[k]) { if (k === 'safeArea') relayout = true; st[k] = settings[k]; }
    if (relayout) { g.resize?.(); await raf2(); await raf2(); }
  }
  // 1차 전직 (각성 게이지) + 두 게이지 가득 → '각성 가능!' + SP 막대 빛
  const cid = Object.keys(CL.CLASSES).find((k) => CL.CLASSES[k].charId === w.hero.charId && CL.CLASSES[k].tier === 1);
  if (cid) w.hero.classId = cid;
  w.run.sp = 100; w.run.aw = 100;
  // 콤보 137 + SSS + 총 피해 + 이정표 (처음 그릴 때 숫자·이정표 시각이 잡히고, 아래에서 rt 를 0.5초 넘겨 튀기기를 끝낸다)
  const ranks = FH.STYLE.ranks, top = ranks[ranks.length - 1];
  w.combo.n = 137; w.combo.t = 1.6; w.combo.max = Math.max(w.combo.max ?? 0, 137); w.combo.dmg = 123456;
  try { w.style.pts = top.min + 300; w.style.rank = ranks.length; } catch { /* 읽기 전용 */ }
  w.style.ann.cur = scen === 'B' ? { rank: ranks.length, r: top.r, word: top.word, sub: top.sub, c: top.c, c2: top.c2, age: 0.3 } : null;
  w.style.ann.queue = [];
  // 버프 6개 + 첫 스킬 슬롯 재사용 대기 (초 글자도 글자 크기 검사에 들어가게)
  Object.assign(w.player.buffs, { haste: 20, rage: 12, magnet: 9999, holyaura: 15, invincible: 5, gunmode: 8 });
  { const sid = w.hero.slots?.[(w.player.skillPage ?? 0) * 2]; if (sid && w.player.skillCd) w.player.skillCd[sid] = 12.5; }
  // 보스 바
  if (scen === 'B') {
    w.boss = { def: { name: '진홍의 갑주군주', title: '피로 벼린 갑옷의 주인', phases: [0.5] }, hp: 620, hpGhost: 700, stats: { maxHp: 1000 }, dead: false, dying: 0 };
    w.bossActive = true;
  } else { w.boss = null; w.bossActive = false; }
  w.cutscene = false; w.hudHidden = false;
  // 배너: A 는 스테이지 제목 카드, B 는 없음 (알림이 칸을 쓴다)
  if (scen === 'A') {
    w.banner = { text: w.stage.name, sub: `CHAPTER ${w.stage.chapter ?? ''} · ${w.stage.sub ?? ''}`, t: 3.0, color: '#e8c872', big: true };
    w.banner._t0 = 4.2;
  } else w.banner = null;
  // 동료: 비행 탈것(게일, 탑승 중 + 기력 호) + 수호신 2 (AUTO, 하나는 재사용 대기 · 하나는 준비) + 스킬 카드 1장 (머무는 중)
  const cs = w.companions;
  const md = CD.companionDef('mt_gale'), g1 = CD.companionDef('gd_fairy'), g2 = CD.companionDef('gd_owl');
  const INFO = {
    mount: { id: 'mt_gale', name: md.name, color: md.color, state: 'ride', hp: 70, maxHp: 100, cd: 0, cdMax: 0, riding: true, stamina: 60, staminaMax: 100, blocked: false },
    guards: [
      { id: 'gd_fairy', slot: 0, name: g1.name, color: g1.color, cd: 4.2, cdMax: 12, ready: false, auto: true },
      { id: 'gd_owl', slot: 1, name: g2.name, color: g2.color, cd: 0, cdMax: 10, ready: true, auto: true },
    ],
    auto: true, town: false,
  };
  window.__hudInfo = INFO;
  cs.hudInfo = () => window.__hudInfo;
  window.__hudCard = { id: 'gd_fairy', name: g1.name, skill: g1.skill?.name ?? '', line: g1.skill?.line ?? '', color: g1.color, portrait: g1.portrait, t: 0.3, auto: false, resonance: false };
  cs.callouts = [window.__hudCard];
  // 기믹 게이지 3줄 (실제 게이지 그리기 drawMeter, 줄은 hud.meter() 와 같은 hudLayout().meter(i))
  window.__hudMeters = (ctx, vw, vh) => {
    if (w.hudHidden) return;
    const L = M.hudLayout(w, vw, vh);
    GM.drawMeter(ctx, L.meter(0), '산소', 0.42, '#6fe8ff', { sub: '42' });
    GM.drawMeter(ctx, L.meter(1), '부패', 0.66, '#9ad040', { sub: '66', labelColor: '#f4ffe0' });
    GM.drawMeter(ctx, L.meter(2), '심장 박동', 0.8, '#ff4a5a', { sub: '3초' });
  };
  w.gimmick = { meterRows: 3, drawScreen: (ctx, vw, vh) => window.__hudMeters(ctx, vw, vh) };
  // 토스트 3개 (하나는 두 줄로 넘친다)
  g.toasts.length = 0;
  for (const [s, c] of [['보물 상자를 열었다: 흡혈귀의 붉은 반지', '#ffd84a'], ['각성 게이지가 가득 찼다! 필살 버튼을 길게 눌러 각성의 힘을 해방하라', '#ffb0b8'], ['레벨이 올랐다', '#f3e2b8']]) {
    g.toast(s, c, 9999); const t = g.toasts[g.toasts.length - 1]; t.t = t.max - 1;
  }
  w.time = 0.1;
  await raf2();
  w.rt = (Number(w.rt) || 0) + 0.5;   // 튀기기·박힘 연출이 끝난 상태
  // 콤보 열 연출 시각을 고정: 튀기기·랭크 등장 끝, 이정표 '100 HIT!' 는 보이는 중 (장면을 몇 번 다시 꾸며도 같은 그림)
  const FHD = (await import('/src/render/feel_hud.js')).FEEL_HUD_DEBUG;
  const st = FHD?.stateOf?.(w);
  if (st) { st.hitRt = w.rt - 1; st.rankRt = w.rt - 1; st.mile = 100; st.mileStr = '100 HIT!'; st.mileRt = w.rt - 0.4; st.endRt = -9; }
  g.dirty = true;
  await raf2();
  return { vw: g.viewW, touch: M.hudLayout(w, g.viewW, g.viewH).touch, safeArea: g.settings.safeArea };
}

/** 3) 실제 위젯 픽셀 검사 (stageScene 다음에). relaxFixed: 패드가 고정 영역까지 올라온 것은 정보로 (touchScale 1.3) */
async function widgetChecks({ tag, relaxFixed }) {
  const M = await import('/src/render/hud_layout.js');
  const H = await import('/src/render/hud.js');
  const FHD = (await import('/src/render/feel_hud.js')).FEEL_HUD_DEBUG;
  const g = window.__game, w = g.world, cs = w.companions;
  const vw = g.viewW, vh = g.viewH;
  const fails = [], info = [], parts = {};
  const L = M.hudLayout(w, vw, vh);
  const T = L.touch;
  const A_MIN = 77;          // 알파 ≥ 0.3 (옅은 빛 번짐은 세지 않는다)
  const SPILL_MAX = 8;       // 제 칸 밖 빈 곳으로 번져도 되는 거리 (영역 사이 최소 간격 HUD_GAP)
  const f1 = (r) => `(${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)})`;
  let cv = window.__hudCv;
  if (!cv) cv = window.__hudCv = document.createElement('canvas');
  if (cv.width !== vw || cv.height !== vh) { cv.width = vw; cv.height = vh; }
  const c = cv.getContext('2d', { willReadFrequently: true });

  // 영역 목록 (이름 → 사각형)
  const REG = {};
  for (const k of ['portrait', 'vitals', 'hearts', 'skills', 'ult', 'awGauge', 'ready', 'companions', 'callouts', 'score', 'combo', 'transient']) REG[k] = L[k];
  for (let i = 0; i < 3; i++) REG['meter' + i] = L.meter(i);
  if (L.bossShown) REG.boss = L.bossBar;
  for (let i = 0; i < L.toastRows; i++) { const q = L.toast(i); REG['toast' + i] = { x: q.l, y: q.top, w: q.w, h: q.h }; }
  const toastKeys = Object.keys(REG).filter((k) => k.startsWith('toast'));
  const FIXED = new Set(['portrait', 'vitals', 'hearts', 'skills', 'ult', 'awGauge', 'companions', 'score']);
  const TRANSIENT = new Set(['transient', 'toasts']);
  const inR = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  const dist = (r, x, y) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));
  const S = L.safe ?? { l: 0, r: 0, t: 0, b: 0 };

  // 동료: 위젯만 / 카드만 따로 잰다
  const INFO = window.__hudInfo, CARD = window.__hudCard;
  const withCmp = (mode, fn) => () => {
    const h0 = cs.hudInfo, c0 = cs.callouts;
    cs.hudInfo = mode === 'cards' ? () => null : () => INFO;
    cs.callouts = mode === 'widgets' ? [] : [CARD];
    try { return fn(); } finally { cs.hudInfo = h0; cs.callouts = c0; }
  };
  const part = (name) => () => H.drawHUDPart(c, w, vw, vh, name);
  // 5) 글자 크기: 부분을 그리는 동안 fillText 를 가로채 CSS px 를 잰다 (캐시 캔버스에 굽는 글자는 굽는 배율이 1 일 때 논리 px 와 같다 →
  //    먼저 배율 2 의 빈 캔버스에 HUD 를 한 번 그려 캐시(초상화·카드)를 무효로 만들어, 아래 측정에서 배율 1 로 다시 굽게 한다)
  const OWN_TEXT = new Set(['portrait', 'vitals', 'hearts', 'skills', 'ult', 'companions', 'callouts', 'score', 'boss']);
  const cssK = g.cssScale > 0 ? g.cssScale : 1;
  const texts = {};
  let curPart = null;
  const P2D = CanvasRenderingContext2D.prototype, fill0 = P2D.fillText;
  P2D.fillText = function (str, ...rest) {
    if (curPart) {
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
      const t = this.getTransform();
      const css = m ? Number(m[1]) * Math.hypot(t.a, t.b) * cssK : NaN;
      const a = (texts[curPart] ??= { min: Infinity, minStr: '', n: 0 });
      a.n++;
      if (css < a.min) { a.min = css; a.minStr = String(str).slice(0, 24); }
    }
    return fill0.call(this, str, ...rest);
  };
  { const pre = document.createElement('canvas'); pre.width = vw * 2; pre.height = vh * 2; const pc = pre.getContext('2d'); pc.setTransform(2, 0, 0, 2, 0, 0); H.drawHUD(pc, w, vw, vh); pre.width = pre.height = 1; }
  const PARTS = [
    ['portrait', part('portrait'), ['portrait']],
    ['vitals', part('vitals'), ['vitals']],
    ['hearts', part('hearts'), ['hearts']],
    ['skills', part('skills'), ['skills']],
    ['ult', part('ult'), ['ult']],
    ['awGauge', part('awGauge'), ['awGauge', 'ready', 'ult']],
    ['companions', withCmp('widgets', part('companions')), ['companions']],
    ['callouts', withCmp('cards', part('companions')), ['callouts']],
    ['score', part('score'), ['score']],
    ['combo', part('combo'), ['combo']],
    ['transient', part('transient'), ['transient']],
    ['meters', () => window.__hudMeters(c, vw, vh), ['meter0', 'meter1', 'meter2']],
    ['toasts', () => g.drawHudToasts(c, L), toastKeys],
  ];
  if (L.bossShown) PARTS.push(['boss', part('boss'), ['boss']]);

  // peak = 튀기기·박힘 연출의 첫 프레임 (feel_hud: 칸 위·왼쪽으로 잠깐 넘쳐도 되지만 다른 영역·패드는 덮지 않는다)
  const measure = (list, peak) => { for (const [name0, fn, allowKeys] of list) {
    const name = peak ? name0 + '@pop' : name0;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, vw, vh);
    let ret;
    curPart = peak ? null : name0;
    try { ret = fn(); } catch (e) { curPart = null; fails.push(`${tag}/${name}: 그리다 오류 ${e.message}`); continue; }
    curPart = null;
    const allow = allowKeys.map((k) => REG[k]).filter(Boolean);
    const foreign = Object.keys(REG).filter((k) => !allowKeys.includes(k)).map((k) => [k, REG[k]]);
    const d = c.getImageData(0, 0, vw, vh).data;
    let ink = 0, spill = 0, maxSpill = 0, unsafe = 0, floor = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const hits = {};
    const floorOk = name0 === 'transient' || name0 === 'toasts' || (name0 === 'boss' && L.bossSlot === 'bottom') || !T || !L.pad.length;
    for (let y = 0, i = 3; y < vh; y++) {
      for (let x = 0; x < vw; x++, i += 4) {
        if (d[i] < A_MIN) continue;
        ink++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        const px = x + 0.5, py = y + 0.5;
        if (px < S.l || px > vw - S.r || py < S.t || py > vh - S.b) unsafe++;
        if (!floorOk && py > M.TOUCH_FLOOR + 1) floor++;
        for (const p of L.pad) if (inR(p, px, py)) { const k = 'pad:' + (p.id ?? '?'); hits[k] = (hits[k] || 0) + 1; }
        let inside = false;
        for (const r of allow) if (inR(r, px, py)) { inside = true; break; }
        if (inside) continue;
        spill++;
        let dm = 1e9;
        for (const r of allow) dm = Math.min(dm, dist(r, px, py));
        if (dm > maxSpill) maxSpill = dm;
        for (const [k, r] of foreign) if (inR(r, px, py)) hits[k] = (hits[k] || 0) + 1;
      }
    }
    const bbox = ink ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
    parts[name] = { ink, bbox, spill, maxSpill: Math.round(maxSpill * 10) / 10, hits, ret: typeof ret === 'object' ? (ret ? 'rects' : null) : ret };
    // 판정
    const must = { portrait: 1, vitals: 1, hearts: 1, skills: 1, ult: 1, awGauge: 1, companions: 1, callouts: 1, score: 1, combo: 1, transient: 1, meters: 1, toasts: 1, boss: 1 };
    if (must[name0] && ink < 20) fails.push(`${tag}/${name}: 거의 그려지지 않았다 (잉크 ${ink}px) — 실제 위젯이 빠졌다`);
    for (const k in hits) {
      const isPad = k.startsWith('pad:');
      const msg = `${tag}/${name}${bbox ? f1(bbox) : ''}: ${k}${isPad ? '' : f1(REG[k])} 에 ${hits[k]}px 겹침`;
      if (isPad && relaxFixed && FIXED.has(name0)) info.push(msg + ' (touchScale 1.3: 패드가 고정 영역까지 — PLAT-TOUCH)');
      else fails.push(msg);
    }
    if (unsafe) fails.push(`${tag}/${name}: 안전 영역 밖 ${unsafe}px (safe ${JSON.stringify(S)})`);
    if (floor) fails.push(`${tag}/${name}: 터치 y 297 아래 ${floor}px`);
    // 상시 영역은 제 칸 밖 빈 곳으로도 8 px 넘게 번지면 실패. 알림 칸·토스트(잠깐 뜨는 것)는 다른 영역·패드만 피하면 된다
    // (스테이지 제목 카드의 핏방울은 글자 아래로 흘러내린다 — ui.bloodText 연출)
    if (maxSpill > SPILL_MAX && !TRANSIENT.has(name0) && !peak) fails.push(`${tag}/${name}${bbox ? f1(bbox) : ''}: 제 칸 밖으로 ${parts[name].maxSpill}px 번진다 (${spill}px)`);
    else if (maxSpill > SPILL_MAX) info.push(`${tag}/${name}: 잠깐 뜨는 그림이 제 칸 밖 빈 곳으로 ${parts[name].maxSpill}px (${spill}px, 다른 영역·패드와 겹침 없음)`);
    else if (spill) info.push(`${tag}/${name}: 제 칸 밖 ${spill}px (최대 ${parts[name].maxSpill}px, 빈 곳)`);
  } };
  try { measure(PARTS, false); } finally { P2D.fillText = fill0; }
  // 글자 크기 판정 (터치만): 이 꾸러미(hud.js·companion_hud.js)가 그리는 부분은 실패, 나머지는 정보
  const textSizes = {};
  for (const k in texts) {
    const a = texts[k], own = OWN_TEXT.has(k) || (k === 'transient' && w.banner);
    textSizes[k] = Math.round(a.min * 10) / 10;
    if (!T || !(a.min < 11 - 0.05)) continue;
    const msg = `${tag}/${k}: 가장 작은 글자 ${a.min.toFixed(1)} CSS px ('${a.minStr}') < 11`;
    if (own) fails.push(msg); else info.push(msg + ' (다른 파일 — 요청)');
  }
  // 연출 첫 프레임: 콤보 숫자 1.35배 튀기기 + 랭크 글자 등장 + 이정표 2배 박힘, 알림 단어 2.2배 박힘 + 색수차 (장면 B 만)
  const st = FHD?.stateOf?.(w);
  if (st && w.style?.ann?.cur) {
    const now = Number(w.rt) || 0, keep = { hitRt: st.hitRt, rankRt: st.rankRt, mileRt: st.mileRt }, cur = w.style.ann.cur;
    st.hitRt = now; st.rankRt = now; st.mileRt = now;
    w.style.ann.cur = { ...cur, age: 0 };
    try { measure(PARTS.filter(([n]) => n === 'combo' || n === 'transient'), true); } finally { Object.assign(st, keep); w.style.ann.cur = cur; }
  }
  // 동료 위젯 탭 사각형: 그린 뒤에는 채워지고, 각성 연출(hudHidden) 중 drawHUD 는 비운다 (요청 198)
  c.clearRect(0, 0, vw, vh);
  H.drawHUD(c, w, vw, vh);
  const nRects = cs.hudRects?.length ?? 0;
  if (nRects !== 3) fails.push(`${tag}/hudRects: 위젯 3개를 그렸는데 탭 사각형 ${nRects}개`);
  w.hudHidden = true;
  H.drawHUD(c, w, vw, vh);
  if ((cs.hudRects?.length ?? 0) !== 0) fails.push(`${tag}/hudRects: 각성 연출(hudHidden) 중에도 탭 사각형 ${cs.hudRects.length}개가 남았다`);
  w.hudHidden = false;
  H.drawHUD(c, w, vw, vh);
  const layout = { vw, touch: T, textMin: L.textMin, big: L.big, safeArea: g.settings.safeArea, bossSlot: L.bossSlot, pad: L.pad.length, companions: f1(L.companions), callouts: f1(L.callouts), combo: f1(L.combo), transient: f1(L.transient), toastRows: L.toastRows };
  return { fails, info, parts, layout, textSizes };
}

/** 스크린샷용 영역 윤곽선 (캔버스 위 DOM 오버레이) */
async function overlay(page, on) {
  await page.evaluate(async (on) => {
    const M = await import('/src/render/hud_layout.js');
    document.getElementById('hudov')?.remove();
    if (!on) return;
    const g = window.__game, w = g.world;
    const L = M.hudLayout(w, g.viewW, g.viewH);
    const cr = g.canvas.getBoundingClientRect(), k = cr.width / g.viewW;
    const c = document.createElement('canvas');
    c.id = 'hudov'; c.width = cr.width * 2; c.height = cr.height * 2;
    Object.assign(c.style, { position: 'fixed', left: cr.left + 'px', top: cr.top + 'px', width: cr.width + 'px', height: cr.height + 'px', pointerEvents: 'none', zIndex: 50 });
    document.body.appendChild(c);
    const x = c.getContext('2d'); x.scale(2 * k, 2 * k); x.lineWidth = 1.5 / k; x.font = `${10 / k * 0.9}px sans-serif`;
    const R = M.hudRegions(L, { boss: L.bossShown, meters: 3 });
    const box = (n, r, col) => { x.strokeStyle = col; x.strokeRect(r.x, r.y, r.w, r.h); x.fillStyle = col; x.fillText(n, r.x + 2, r.y + 10); };
    for (const [n, r] of R.persistent) box(n, r, '#3f3');
    for (const [n, r] of R.toasts) box(n, r, '#3ff');
    box('transient', R.transient, '#ff3');
    for (const p of R.pad) box(p.id ?? 'pad', p, '#f44');
  }, on);
  await page.waitForTimeout(150);
}

const report = [];
let failTotal = 0, comboTotal = 0, widgetRuns = 0;
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
  const wres = [];
  try {
    if (view.notch) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: view.notch.l, right: view.notch.r, top: view.notch.t, bottom: view.notch.b } });
    }
    // 부하가 큰 기계에서도 (load 40–60) 부팅을 기다린다
    await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=s04&nosw`, { timeout: 60000 });
    await page.waitForFunction(() => window.__game?.world?.player && window.__game.scenes?.some((sc) => sc.name === 'stage'), null, { timeout: 75000 });
    await page.waitForTimeout(1200);
    // 스테이지 도입 대화 등 위에 쌓인 장면은 닫는다 (HUD 가 맨 위 장면의 것이어야 한다)
    await page.evaluate(() => { const g = window.__game; let n = 0; while (g.top && g.top.name !== 'stage' && g.scenes.length > 1 && n++ < 5) g.pop(); });
    await page.waitForTimeout(300);
    res = await page.evaluate(pageChecks, { view, INSETS });
    if (WIDGETS) {
      // 변형: [이름, 설정, relaxFixed]
      const vars = view.notch
        ? [['fit', { safeArea: 'fit' }, false], ['full', { safeArea: 'full' }, false]]
        : view.touch && view.h < 400
          ? [['plain', null, false], ['lefthand', { touchLeftHanded: true }, false], ['scale1.3', { touchLeftHanded: false, touchScale: 1.3 }, true]]
          : [['plain', null, false]];
      for (const [vt, settings, relaxFixed] of vars) {
        for (const scen of ['A', 'B']) {
          const tag = `${view.id}/${vt}/${scen}`;
          await page.evaluate(stageScene, { scen, settings });
          const r = await page.evaluate(widgetChecks, { tag, relaxFixed });
          wres.push({ tag, ...r });
          widgetRuns++;
          if (SHOTS && (vt === 'plain' || view.notch || vt === 'lefthand')) {
            await page.screenshot({ path: `${OUT}/${view.id}_${vt}_${scen}.png` });
            if (scen === 'B' && vt !== 'lefthand') { await overlay(page, true); await page.screenshot({ path: `${OUT}/${view.id}_${vt}_regions.png` }); await overlay(page, false); }
          }
        }
      }
    }
  } catch (e) { res = { ...(res ?? {}), fails: [...(res?.fails ?? []), 'HARNESS ' + e.message], notes: res?.notes ?? [], combos: res?.combos ?? 0 }; }
  await ctx.close();
  const wf = wres.flatMap((r) => r.fails);
  const fails = [...res.fails, ...wf, ...new Set(errs)];
  failTotal += fails.length; comboTotal += res.combos;
  report.push({ view: view.id, ...res, widgets: wres, errs: [...new Set(errs)] });
  console.log(`${fails.length ? '✗' : '✓'} ${view.id}  vw ${res.vw}  pad ${res.padSource}  조합 ${res.combos}  위젯 검사 ${wres.length}  실제 보스 칸 ${res.liveSlot}${fails.length ? '\n    ' + fails.slice(0, 16).join('\n    ') + (fails.length > 16 ? `\n    … 외 ${fails.length - 16}건` : '') : ''}`);
  for (const n of res.notes ?? []) console.log('    · ' + n);
  for (const r of wres) console.log(`    · 위젯 ${r.tag}: vw ${r.layout.vw} ${r.layout.safeArea} 글자 하한 ${r.layout.textMin}${r.layout.big ? ' 휴대폰 배치' : ''} 최소 CSS px {${Object.entries(r.textSizes ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}} 보스 칸 ${r.layout.bossSlot} 패드 ${r.layout.pad} 동료${r.layout.companions} 카드${r.layout.callouts} 콤보${r.layout.combo} 알림${r.layout.transient} 토스트 ${r.layout.toastRows}줄`);
  for (const n of res.info ?? []) console.log('    (정보) ' + n);
  for (const n of [...new Set(wres.flatMap((r) => r.info))]) console.log('    (정보) ' + n);
}
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
console.log(`\n${failTotal ? '실패' : '통과'}: 배치 조합 ${comboTotal}개, 실제 위젯 검사 ${widgetRuns}개, 문제 ${failTotal}건${SHOTS ? ` — 스크린샷 ${OUT}` : ''}`);
await browser.close(); srv.close();
process.exit(failTotal ? 1 : 0);
