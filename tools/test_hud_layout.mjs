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
//  6) HUD-REDO (hudredo, /tmp/claude-0/g10/hudredo_design.md): 기기별(폴드 2.0·2.625·2.6, 태블릿, 휴대폰 2종) × 버튼 배치 2가지
//     ('게임 화면 위' overlay / '아래 띠' band) × 장면(스테이지 s01, 마을)에서 실제 패드(touchpad.buttons·layoutInfo)를 잰다:
//       · 모든 터치 조작(버튼·시스템 아이콘·스틱 받침)의 그린 테 바깥 ↔ 화면 가장자리 여백 ≥ 규칙 (PAD_M 25 dp; 넓은 배치 시스템 줄 위쪽 SYS_M_WIDE)
//       · 아래 줄 순서 점프.x < 공격.x < 대시.x, 세 버튼 |Δy| ≤ 2 dp · 마을: 점프–탈것–대시 한 줄(|Δy| ≤ 2 dp, 같은 간격 ±2 dp, 점프·대시 = 스테이지 자리)
//       · 크기: 모든 터치 칸 ≥ 44 dp, 버튼 사이 ≥ 12 dp. 사용자 기기(fold2, 1 dp = 0.163 mm)는 mm 범위
//         (공격 테 13.5–15.5 · 일반 9.3–11 · 필살 9.5–11.5 · ⇄/수호 9–10.8 · 빠른 칸 8.2–9.4 · 스틱 받침 19.5–22.5 · 사이 ≥ 2 mm)
//       · 겹침: 버튼끼리·버튼↔시스템 줄·버튼↔스틱, 점수(재화) 칸·퀘스트 칸 ↔ 시스템 아이콘, 콤보 열 ↔ 빠른 칸, 빠른 칸 ↔ 패드·스틱, 마을 오른쪽 위 판 ↔ 시스템 아이콘
//       · 덧캔버스 DPR ≥ min(devicePixelRatio, 2.75) (폴드, 품질 medium/high) · 평소 불투명도 ≥ 0.92 (그림 버튼)
//       · '아래 띠': 폴드·태블릿은 띠가 생기고(캔버스 위에 붙음) 모든 버튼·스틱이 띠 안, 휴대폰은 띠 없이 '게임 화면 위'와 같게
//       · 게임 화면 가림 %: 덧캔버스(패드) 알파 ∪ HUD(drawHUD) 알파 > 0.25 인 칸 / 캔버스 넓이 — 예전(BEFORE, f395dcd) 값보다 크면 실패
//     --redo-only: 1)–5) 를 건너뛴다 · --coverage-only: 가림 % 만 잰다 (예전 트리에서 BEFORE 값을 다시 잴 때) · --no-redo: 6) 을 건너뛴다
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const OUT = arg('out', '/tmp/claude-0/proto/HUD-FINAL/test');
const SHOTS = !argv.includes('--no-shots');
const WIDGETS = !argv.includes('--no-widgets');
const ONLY = arg('only', null) ? String(arg('only')).split(',') : null;
const REDO_ONLY = argv.includes('--redo-only'), COVERAGE_ONLY = argv.includes('--coverage-only'), NO_REDO = argv.includes('--no-redo');
fs.mkdirSync(OUT, { recursive: true });

const INSETS = { l: 47, r: 47, t: 0, b: 21 };
// notch: 노치 인셋을 CDP 로 흉내 낸 페이지 (배치 행렬은 건너뛰고 실제 화면·위젯 검사만, safeArea 'fit' 과 'full' 둘 다)
const VIEWS = [
  { id: 'desk960', w: 960, h: 540, dpr: 1, touch: false },
  { id: 'desk1280', w: 1280, h: 540, dpr: 1, touch: false },   // 21:9 창 → vw 1280
  { id: 'phone1', w: 844, h: 390, dpr: 3, touch: true, expectSlot: 'top' },
  { id: 'phone2', w: 740, h: 360, dpr: 3, touch: true, expectSlot: 'top' },
  { id: 'tablet', w: 1024, h: 768, dpr: 2, touch: true, expectSlot: 'top' },   // 4:3 → 세로 확장 시야 960×720 → fold 프리셋 (보스 바는 위)
  { id: 'fold_open', w: 1000, h: 756, dpr: 2.6, touch: true, expectSlot: 'top' }, // 갤럭시 폴드 펼침 (hud_mobile §5) → fold 프리셋
  { id: 'desk43', w: 1024, h: 768, dpr: 1, touch: false },                        // 4:3 데스크톱 창 → fold 프리셋 + HUD 스킬 원호(L.arc)
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
    if (L.touch && R.pad.length && !L.fold) {   // fold: 아래 가운데는 큰 HP·빠른 칸 자리 (패드·스틱과 겹치지 않기만)
      for (const [n, r] of R.persistent) if (n !== 'boss' && r.h > 0 && r.y + r.h > M.TOUCH_FLOOR + 1 + 0.01) bad(`${n}${f1(r)} 가 터치 y 297 아래로 내려온다`);
    }
    // 최소 크기
    for (const [n, r] of R.toasts) if (r.w < 120) small(`${n} 너무 좁다 ${f1(r)}`);
    if (R.transient.w < 160) small(`transient 너무 좁다 ${f1(R.transient)}`);
    if (L.combo.h < 40) small(`combo 너무 낮다 ${f1(L.combo)}`);
    if (boss && L.bossBar.w < 240) small(`boss 너무 좁다 ${f1(L.bossBar)}`);
    for (let i = 0; i < meters; i++) if (L.meter(i).w < 100) small(`meter${i} 너무 좁다 ${f1(L.meter(i))}`);
    // 토스트 줄 수: 위쪽 보스 바가 보이면 1 (폴드 배치는 2 — hudfix: 보스 바 아래 두 줄), 아니면 3
    const want0 = boss && L.bossSlot === 'top' ? (L.fold ? 2 : 1) : 3;
    // hudfix: 휴대폰 두 줄 버튼 묶음 + 안전 영역 인셋 + 실제 기믹 게이지 줄이면 알림 칸이 버튼 윗줄 위로 올라가야 해서 토스트 줄을 줄인다
    // (L.toastCap — 게이지가 실제로 있을 때만, 1줄 아래로는 줄이지 않는다. 넘치는 토스트는 사라지지 않고 줄을 기다린다)
    if (L.toastCap != null && (boss || !(L.toastCap >= 1 && L.toastCap < 3) || !(meters >= 1))) bad(`toastCap ${L.toastCap} 가 잘못 걸렸다 (boss ${boss}, meters ${meters})`);
    const want = L.toastCap != null && !boss ? Math.min(want0, L.toastCap) : want0;
    if (L.toastCap != null) info.add(`${tag.split('/').slice(0, 2).join('/')}: 토스트 ${L.toastCap}줄로 줄임 (알림 칸이 버튼 윗줄 위로, 게이지 ${meters}줄)`);
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
    const preset = mv.vw / mv.vh < M.FOLD_ASPECT ? 'fold' : 'wide';   // hud_mobile §3: 'auto' 와 같은 규칙
    const pad = !view.touch ? [] : (realPad.length && v.tag === 'plain' ? realPad : M.modelPadRects({ vw: mv.vw, vh: mv.vh, preset, cssW: view.w, cssH: view.h, canvas: mv.canvas, inset: v.inset, touchScale: v.touchScale, leftHanded: v.leftHanded }));
    const textMin = view.touch ? Math.ceil(M.HUD_MIN_CSS / mv.cs - 1e-6) : 0;   // 이 변형의 캔버스 배율에서 터치 글자 하한
    for (const boss of [false, true]) {
      for (let meters = 0; meters <= 3; meters++) {
        const L = M.hudLayout(null, mv.vw, mv.vh, pad, { touch: view.touch, safe: mv.safe, boss, meters, textMin, preset });
        check(`${view.id}/${v.tag}/boss${boss ? 1 : 0}/m${meters}`, L, { boss, meters, safe: mv.safe, vw: mv.vw, vh: mv.vh, sizes: !v.touchScale });
        // fold (hud_mobile §3): 빠른 칸·미니맵 탭 자리 ≥ 44 CSS px, 빠른 칸 사이 ≥ 12 CSS px
        if (L.fold && view.touch && !boss && meters === 0) {
          for (const q of [...L.quick, L.minimap]) if (Math.min(q.w, q.h) * mv.cs < 44 - 0.5) fails.push(`${view.id}/${v.tag}: 탭 자리 ${f1(q)} < 44 CSS px`);
          for (let i = 1; i < L.quick.length; i++) { const gap = (L.quick[i].x - L.quick[i - 1].x - L.quick[i - 1].w) * mv.cs; if (gap < 12 - 0.5) fails.push(`${view.id}/${v.tag}: 빠른 칸 간격 ${gap.toFixed(1)} < 12 CSS px`); }
        }
        combos++;
        slots[v.tag] = L.bossSlot;
        if (boss && meters === 3) notes.push(`${v.tag}: ${L.preset} ${mv.vw}×${mv.vh} 글자 하한 ${L.textMin}${L.big ? ' (휴대폰 배치)' : ''} slot ${L.bossSlot} boss${f1(L.bossBar)} transient${f1(L.transient)} combo${f1(L.combo)} toast0${f1({ x: L.toast(0).l, y: L.toast(0).top, w: L.toast(0).w, h: 26 })} padLeft ${L.padLeft == null ? '-' : Math.round(L.padLeft)} padTop ${L.padTop == null ? '-' : Math.round(L.padTop)}`);
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
    const preset = mv.vw / mv.vh < M.FOLD_ASPECT ? 'fold' : 'wide';
    const pad = M.modelPadRects({ vw: mv.vw, vh: mv.vh, preset, cssW: view.w, cssH: view.h, canvas: mv.canvas, inset: { l: 0, r: 0, t: 0, b: 0 } });
    const o = { touch: true, safe: { l: 0, r: 0, t: 0, b: 0 }, boss: false, meters: 3, preset };
    const A = M.hudLayout(null, mv.vw, mv.vh, pad, o);
    const top = pad.filter((p) => p.y > 162).reduce((m, p) => (p.y < m.y ? p : m));
    const y0 = top.y; top.y = preset === 'fold' ? Math.round(mv.vh * 0.35) : 60; // 제자리 수정 (touchScale 편집 흉내)
    const B = M.hudLayout(null, mv.vw, mv.vh, pad, o);
    if (B === A || B.combo.h === A.combo.h) fails.push(`${view.id}/memo: 패드 사각형을 제자리에서 고쳤는데 배치가 그대로다 (combo h ${A.combo.h} → ${B.combo.h})`);
    top.y = y0;
    const withNaN = [...pad, { id: 'nan', x: NaN, y: NaN, w: 44, h: 44 }];
    const C = M.hudLayout(null, mv.vw, mv.vh, withNaN, o);
    if (M.hudLayout(null, mv.vw, mv.vh, withNaN, o) !== C) fails.push(`${view.id}/memo: NaN 사각형이 있으면 매번 다시 계산한다`);
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
  if (L.fold) { REG.minimap = L.minimap; REG.stage = L.stage; L.quick.forEach((q, i) => { REG['quick' + i] = q; }); if (L.arc) REG.arc = L.arc; delete REG.skills; }
  if (L.bossShown) REG.boss = L.bossBar;
  for (let i = 0; i < L.toastRows; i++) { const q = L.toast(i); REG['toast' + i] = { x: q.l, y: q.top, w: q.w, h: q.h }; }
  const toastKeys = Object.keys(REG).filter((k) => k.startsWith('toast'));
  const FIXED = new Set(['portrait', 'vitals', 'hearts', 'skills', 'ult', 'awGauge', 'companions', 'score', 'minimap', 'stage', 'quick', 'arc']);
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
  // BM-FOLLOWUP: awGauge·combo·transient(배너 없을 때 포함)·meters·toasts 도 휴대폰에서 11 CSS px 이상이 됐다 → 정보가 아니라 실패로
  const OWN_TEXT = new Set(['portrait', 'vitals', 'hearts', 'skills', 'ult', 'awGauge', 'companions', 'callouts', 'score', 'combo', 'transient', 'meters', 'toasts', 'boss', 'stage', 'quick', 'arc']);
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
  if (L.fold) {   // hud_mobile §3 폴드 위젯 (스킬 칸은 원호에 있어 비어 있다)
    PARTS.splice(PARTS.findIndex(([n]) => n === 'skills'), 1);
    PARTS.push(['minimap', part('minimap'), ['minimap']], ['stage', part('stage'), ['stage']], ['quick', part('quick'), L.quick.map((_, i) => 'quick' + i)]);
    if (L.arc) PARTS.push(['arc', part('arc'), ['arc']]);
  }

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
    const floorOk = L.fold || name0 === 'transient' || name0 === 'toasts' || (name0 === 'boss' && L.bossSlot === 'bottom') || !T || !L.pad.length;
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
    const must = { portrait: 1, vitals: 1, hearts: 1, skills: 1, ult: 1, awGauge: 1, companions: 1, callouts: 1, score: 1, combo: 1, transient: 1, meters: 1, toasts: 1, boss: 1, minimap: 1, stage: 1, quick: 1, arc: 1 };
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
  if (REDO_ONLY || COVERAGE_ONLY) break;
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
// ───────────────────────── 6) HUD-REDO ─────────────────────────
// 예전 배치(f395dcd: 아래 가운데 체력, 큰 버튼, 여백 없음)의 가림 % — 같은 시험을 예전 트리에서 --coverage-only 로 잰 값
const BEFORE = {   // node tools/test_hud_layout.mjs --coverage-only 를 f395dcd 트리에서 (2026-10-11): 패드 겉넓이 · HUD 그린 칸 · 합 · 덧캔버스 잉크
  'fold2/overlay/stage': { pad: 7.6, hud: 9.3, union: 16.9, padInk: 8.8 },
  'fold26/overlay/stage': { pad: 9.4, hud: 9.3, union: 18.7, padInk: 10.6 },
  'fold_open/overlay/stage': { pad: 7.6, hud: 9.4, union: 17.0, padInk: 8.8 },
  'tablet/overlay/stage': { pad: 7.6, hud: 9.3, union: 16.9, padInk: 8.7 },
  'phone2/overlay/stage': { pad: 16.2, hud: 3.9, union: 20.1, padInk: 13.7 },
  'phone1/overlay/stage': { pad: 13.1, hud: 3.6, union: 16.8, padInk: 11.2 },
};
// [auto] AUTO-QOL 직전(HUD-REDO hudfix 뒤, 2026-10-11 보고서 hudredo.md)의 가림 % — 새 버튼(AUTO·고정)으로 +0.5 pp 까지만 늘 수 있다
const CURRENT = { 'fold2/overlay/stage': 14.6, 'fold26/overlay/stage': 15.5, 'tablet/overlay/stage': 14.5, 'phone1/overlay/stage': 15.8, 'phone2/overlay/stage': 17.0 };
const REDO_DEVS = [
  { id: 'fold2', w: 1000, h: 755, dpr: 2, fold: true, bandable: true, quality: 'medium', mmPerDp: 0.1626, hub: true, lefty: true },   // 사용자 기기 (WebView DPR 2.0)
  { id: 'fold26', w: 762, h: 575, dpr: 2.625, fold: true, bandable: true, quality: 'medium', mmPerDp: 0.2130 },   // 같은 폴드, 화면 확대 (hudfix: mm 가 그대로여야)
  { id: 'fold_open', w: 1000, h: 756, dpr: 2.6, fold: true, bandable: true, quality: 'high' },
  { id: 'tablet', w: 1024, h: 768, dpr: 2, fold: false, bandable: true, quality: 'medium', hub: true },
  { id: 'phone2', w: 740, h: 360, dpr: 3, fold: false, bandable: false, quality: 'medium', hub: true },
  { id: 'phone1', w: 844, h: 390, dpr: 3, fold: false, bandable: false, quality: 'low' },
];

/** 페이지 안: 실제 패드·HUD 를 재서 {fails, info, m} */
async function redoPage({ dev, mode, scene, coverageOnly }) {
  const TP = await import('/src/core/touchpad.js');
  const HL = await import('/src/render/hud_layout.js');
  const g = window.__game, w = g.world;
  const fails = [], info = [], m = {};
  const tp = TP.touchpad;
  const r1 = (v) => Math.round(v * 10) / 10;
  const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const f1 = (r) => `(${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)})`;
  const W = innerWidth, Hh = innerHeight;
  const cv = g.canvas, crr = cv.getBoundingClientRect();
  const cr = { x: crr.left, y: crr.top, w: crr.width, h: crr.height };
  const cs = cr.h / g.viewH;
  // ── 가림 % (예전 트리에서도 돈다: 공개 API 만 쓴다) ──
  if (scene === 'stage') {
    const pc = document.getElementById('tpadcv');
    let pd = null, pw = 0, ph = 0, pr = null;
    if (pc && pc.width > 0) { pw = pc.width; ph = pc.height; pr = pc.getBoundingClientRect(); pd = pc.getContext('2d').getImageData(0, 0, pw, ph).data; }
    const H = await import('/src/render/hud.js');
    const hc = document.createElement('canvas'); hc.width = g.viewW; hc.height = g.viewH;
    const hx = hc.getContext('2d');
    // 상시 HUD 만: 잠깐 뜨는 것(스테이지 제목 배너·알림 단어)은 재는 순간에 따라 달라지므로 뺀다
    const keepB = w.banner, keepA = w.style?.ann?.cur;
    w.banner = null; if (w.style?.ann) w.style.ann.cur = null;
    try { H.drawHUD(hx, w, g.viewW, g.viewH); } catch (e) { info.push('drawHUD ' + e.message); }
    w.banner = keepB; if (w.style?.ann) w.style.ann.cur = keepA;
    const hd = hx.getImageData(0, 0, hc.width, hc.height).data;
    // 패드 자리(겉넓이): 보이는 버튼·시스템 아이콘의 그린 테 원 + 스틱 받침 원 (불투명도와 상관없이 차지하는 넓이)
    const SYSI = new Set(['pause', 'bag', 'maptog', 'fullscreen', 'auto']);   // [auto] AUTO 는 시스템 줄
    const rimF = (id) => (SYSI.has(id) ? 1.02 : id === 'attack' ? 1.14 : id === 'ult' ? 1.12 : 1.02);
    const discs = (TP.touchpad.buttons?.() ?? []).map((b) => [b.cx, b.cy, (b.d / 2) * rimF(b.id)]);
    const LI = TP.touchpad.layoutInfo?.() ?? {};
    const sz = TP.touchpad.stickZone?.();
    if (LI.home && LI.R) discs.push([LI.home.x, LI.home.y, 1.14 * LI.R]);
    else if (sz && LI.R) { const k = cr.h / g.viewH; discs.push([cr.x + (sz.x + sz.w / 2) * k, cr.y + (sz.y + sz.h / 2) * k, 1.14 * LI.R]); }
    let n = 0, nP = 0, nH = 0, nU = 0, nF = 0, nFU = 0;
    for (let y = cr.y + 1; y < cr.y + cr.h; y += 2) {
      for (let x = cr.x + 1; x < cr.x + cr.w; x += 2) {
        n++;
        let a = false, b = false, f = false;
        if (pd) { const px = Math.floor((x - pr.left) * pw / pr.width), py = Math.floor((y - pr.top) * ph / pr.height); if (px >= 0 && py >= 0 && px < pw && py < ph) a = pd[(py * pw + px) * 4 + 3] > 64; }
        const lx = Math.floor((x - cr.x) / cs), ly = Math.floor((y - cr.y) / cs);
        if (lx >= 0 && ly >= 0 && lx < hc.width && ly < hc.height) b = hd[(ly * hc.width + lx) * 4 + 3] > 64;
        for (const [cx, cy, r] of discs) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) { f = true; break; }
        if (a) nP++; if (b) nH++; if (a || b) nU++; if (f) nF++; if (f || b) nFU++;
      }
    }
    // union = 패드 겉넓이 ∪ HUD 그린 칸 (판정에 쓰는 값) · padInk = 덧캔버스에 실제로 칠해진 칸(알파 > 0.25, 정보)
    m.coverage = { pad: r1(100 * nF / n), hud: r1(100 * nH / n), union: r1(100 * nFU / n), padInk: r1(100 * nP / n), inkUnion: r1(100 * nU / n) };
  }
  if (coverageOnly) return { fails, info, m };

  const I = tp.layoutInfo?.();
  if (!I || I.preset === undefined) { fails.push('touchpad.layoutInfo() 에 preset 이 없다 (HUD-REDO 이전 코드?)'); return { fails, info, m }; }
  const btns = tp.buttons?.() ?? [];
  const SYS = new Set(['pause', 'bag', 'maptog', 'fullscreen', 'auto']);   // [auto] AUTO 는 시스템 줄
  const act = btns.filter((b) => !SYS.has(b.id)), sys = btns.filter((b) => SYS.has(b.id));
  const by = Object.fromEntries(btns.map((b) => [b.id, b]));
  const rimR = (b) => (b.d / 2) * (SYS.has(b.id) ? 1.02 : TP.rimOf(b.id));
  const ins = I.ins, M0 = I.margin;
  m.preset = I.preset; m.band = I.band; m.kEff = r1(I.kEff); m.dpr = I.dpr; m.opacity = I.opacity; m.tier = I.tier;
  m.sizes = Object.fromEntries(act.map((b) => [b.id, r1(b.d)]));
  if (!act.length) fails.push('보이는 터치 버튼이 없다');
  // 여백 (그린 테 바깥 ↔ 안전 영역 가장자리)
  const edge = (b, r) => ({ l: b.cx - r - ins.l, r: W - ins.r - (b.cx + r), t: b.cy - r - ins.t, b: Hh - ins.b - (b.cy + r) });
  let minM = Infinity;
  for (const b of act) {
    const e = edge(b, rimR(b)), mm = Math.min(e.l, e.r, e.b, e.t);
    minM = Math.min(minM, mm);
    if (mm < M0 - 0.5) fails.push(`${b.id}: 가장자리 여백 ${r1(mm)} dp < ${M0}`);
  }
  for (const b of sys) {
    const e = edge(b, rimR(b)), top = I.preset === 'fold' ? M0 : I.sysMarginWide;
    if (e.t < top - 0.5) fails.push(`${b.id}: 위쪽 여백 ${r1(e.t)} dp < ${top}`);
    if (Math.min(e.l, e.r) < (I.preset === 'fold' ? M0 : 8) - 0.5) fails.push(`${b.id}: 옆 여백 ${r1(Math.min(e.l, e.r))} dp`);
  }
  const stickR = 1.14 * I.R;
  const se = { l: I.home.x - stickR - ins.l, b: Hh - ins.b - (I.home.y + stickR), r: W - ins.r - (I.home.x + stickR) };
  if (Math.min(I.left ? se.r : se.l, se.b) < M0 - 0.5) fails.push(`스틱 받침 여백 ${r1(Math.min(I.left ? se.r : se.l, se.b))} dp < ${M0}`);
  m.minMargin = r1(Math.min(minM, I.left ? se.r : se.l, se.b));
  // 순서·줄
  if (scene === 'stage') {
    const [j, a, d] = [by.jump, by.attack, by.dash];
    if (!j || !a || !d) fails.push('점프·공격·대시 중 빠진 버튼');
    else {
      const ok = I.left ? j.cx > a.cx && a.cx > d.cx : j.cx < a.cx && a.cx < d.cx;
      if (!ok) fails.push(`아래 줄 순서가 점프–공격–대시가 아니다 (x ${r1(j.cx)}, ${r1(a.cx)}, ${r1(d.cx)})`);
      const dy = Math.max(Math.abs(j.cy - a.cy), Math.abs(a.cy - d.cy));
      if (dy > 2) fails.push(`아래 줄 높이 차 ${r1(dy)} dp > 2`);
      m.row = { jump: [r1(j.cx), r1(j.cy)], attack: [r1(a.cx), r1(a.cy)], dash: [r1(d.cx), r1(d.cy)] };
    }
  } else {
    const [mo, j, d] = [by.mount, by.jump, by.dash];
    // [hudfix] 점프·대시는 스테이지 자리 그대로 (스테이지와의 비교는 밖에서: m.town.pos)
    // [verify] 마을 줄 = 점프 · 탈것(마을에 없는 공격 자리) · 대시 — 빈 자리 없이 대시 쪽에 나란히 (사용자 의견 1), 두 사이 같음 ±2 dp
    if (!mo || !j || !d) fails.push(`마을: 탈것·점프·대시 중 빠진 버튼 (${Object.keys(by).join(',')})`);
    else {
      const ok = I.left ? j.cx > mo.cx && mo.cx > d.cx : j.cx < mo.cx && mo.cx < d.cx;
      if (!ok) fails.push('마을 줄 순서가 점프–탈것–대시가 아니다');
      const dy = Math.max(Math.abs(mo.cy - j.cy), Math.abs(mo.cy - d.cy));
      if (dy > 2) fails.push(`마을 줄 높이 차 ${r1(dy)} dp > 2`);
      const g1 = Math.abs(mo.cx - j.cx) - (j.d + mo.d) / 2, g2 = Math.abs(d.cx - mo.cx) - (d.d + mo.d) / 2;
      if (g1 < 12 - 0.5 || g1 > 32 || g2 < 12 - 0.5 || g2 > 32) fails.push(`마을 줄 사이 ${r1(g1)} / ${r1(g2)} dp (기대 12–32)`);
      if (Math.abs(g1 - g2) > 2) fails.push(`마을 줄 사이가 고르지 않다 (${r1(g1)} / ${r1(g2)} dp)`);
      m.town = { gaps: [r1(g1), r1(g2)], dy: r1(dy), pos: { mount: [r1(mo.cx), r1(mo.cy), r1(mo.d)], jump: [r1(j.cx), r1(j.cy)], dash: [r1(d.cx), r1(d.cy)] } };
    }
    const tb = g.top?.topBoxes;
    if (!tb) info.push('마을 오른쪽 위 판 정보 없음');
    else {
      const occ = tp.occupiedRects?.() ?? [];
      for (const [k, r] of Object.entries(tb)) for (const p of occ) if (SYS.has(p.id) && ov(r, p)) fails.push(`마을 ${k}${f1(r)} ↔ ${p.id}${f1(p)} 겹침`);
      // [qamatrix] 토스트 줄이 마을 오른쪽 위 판(헌터 교체·메뉴·유물·골드)을 덮지 않는다 (hub.js → hud_layout setHudAvoid)
      const LT = HL.hudLayout(w, g.viewW, g.viewH);
      for (let i = 0; i < (LT?.toastRows ?? 0); i++) {
        const q = LT.toast(i), tr = { x: q.l, y: q.top, w: q.w, h: q.h };
        for (const [k, r] of Object.entries(tb)) if (ov(tr, r)) fails.push(`마을 토스트 줄 ${i}${f1(tr)} ↔ ${k}${f1(r)} 겹침`);
      }
    }
  }
  // 크기·사이
  let minGap = Infinity;
  const all = [...act, ...sys];
  for (const b of all) if (b.d < 44 - 0.01) fails.push(`${b.id}: 지름 ${r1(b.d)} dp < 44`);
  for (let i = 0; i < act.length; i++) {
    for (let k = i + 1; k < all.length; k++) {
      const a = act[i], b = all[k];
      if (a === b) continue;
      const gap = Math.hypot(a.cx - b.cx, a.cy - b.cy) - a.d / 2 - b.d / 2;
      if (!SYS.has(b.id)) minGap = Math.min(minGap, gap);
      if (gap < 12 - 0.5) fails.push(`${a.id}↔${b.id}: 사이 ${r1(gap)} dp < 12`);
    }
    const a = act[i], gs = Math.hypot(a.cx - I.home.x, a.cy - I.home.y) - a.d / 2 - stickR;
    if (gs < 0) fails.push(`${a.id} 가 스틱 받침에 겹친다 (${r1(gs)} dp)`);
  }
  m.minGap = r1(minGap);
  // [auto] AUTO-QOL (/tmp/claude-0/s3/auto/auto_design.md F): 스테이지에는 AUTO(시스템 줄) · 고정(버튼 묶음), 마을에는 둘 다 없다.
  //   AUTO 는 다른 시스템 아이콘과 같은 줄·같은 지름, 고정은 아랫줄 점프–공격–대시를 건드리지 않는다 (위 순서 검사) · ≥ 44 dp · 사이 ≥ 12 dp (위 검사)
  if (scene === 'stage') {
    const au = by.auto, lk = by.lock, pa = by.pause;
    if (!au) fails.push('AUTO 버튼이 없다 (스테이지)');
    else if (pa && (Math.abs(au.cy - pa.cy) > 1 || Math.abs(au.d - pa.d) > 0.5)) fails.push(`AUTO 가 시스템 줄과 어긋난다 (y ${r1(au.cy)} vs ${r1(pa.cy)}, d ${r1(au.d)} vs ${r1(pa.d)})`);
    if (!lk) fails.push('대상 고정 버튼이 없다 (스테이지)');
    else {
      if (I.preset === 'fold' && !I.band && by.ult && !(lk.cy < by.ult.cy && Math.abs(lk.cx - by.ult.cx) < 2)) fails.push(`폴드: 고정은 필살 바로 위 (고정 ${r1(lk.cx)},${r1(lk.cy)} 필살 ${r1(by.ult.cx)},${r1(by.ult.cy)})`);
      if ((I.preset !== 'fold' || I.band) && by.swap && (Math.abs(lk.cy - by.swap.cy) > 2 || (I.left ? lk.cx < by.swap.cx : lk.cx > by.swap.cx))) fails.push('두 줄 배치: 고정은 아랫줄 ⇄ 바깥쪽');
    }
    m.auto = { auto: au ? [r1(au.cx), r1(au.cy), r1(au.d)] : null, lock: lk ? [r1(lk.cx), r1(lk.cy), r1(lk.d)] : null };
  } else if (by.auto || by.lock) fails.push(`마을에 AUTO·고정 버튼이 보인다 (${Object.keys(by).join(',')})`);
  const L = HL.hudLayout(w, g.viewW, g.viewH);
  if (scene === 'stage' && L?.quick?.length && I.preset === 'fold') {
    for (const q of L.quick) if (q.w * cs < 44 - 0.5) fails.push(`빠른 칸 ${r1(q.w * cs)} dp < 44`);
    // [hudfix] 왼손 모드에서 빠른 칸 줄이 화면 밖으로 나가던 결함: 모든 칸이 캔버스 안에
    for (let i = 0; i < L.quick.length; i++) { const q = L.quick[i]; if (q.x < -0.5 || q.y < -0.5 || q.x + q.w > g.viewW + 0.5 || q.y + q.h > g.viewH + 0.5) fails.push(`빠른 칸 ${i} 이 화면 밖 ${f1(q)} (논리 ${g.viewW}×${g.viewH})`); }
    m.quick = r1(L.quick[0].w * cs);
  }
  // [hudfix] 아래 띠: 빠른 칸 줄이 띠 안(스틱과 버튼 묶음 사이)에 있어야 (물약을 가방 없이)
  if (scene === 'stage' && mode === 'band' && dev.bandable) {
    if (!L?.quick?.length) fails.push('아래 띠: 빠른 칸 줄이 없다');
    else {
      const bottom = cr.y + cr.h;
      for (let i = 0; i < L.quick.length; i++) {
        const q = L.quick[i], qx = cr.x + q.x * cs, qy = cr.y + q.y * cs, qw = q.w * cs, qh = q.h * cs;
        if (qy < bottom - 0.5 || qy + qh > Hh - ins.b + 0.5 || qx < ins.l - 0.5 || qx + qw > W - ins.r + 0.5) fails.push(`아래 띠: 빠른 칸 ${i} 이 띠 밖 (${r1(qx)},${r1(qy)} ${r1(qw)}×${r1(qh)})`);
        const ccx = qx + qw / 2, ccy = qy + qh / 2, hr = Math.hypot(qw, qh) / 2;
        for (const b of act) if (Math.hypot(b.cx - ccx, b.cy - ccy) < rimR(b) + hr * 0.8) fails.push(`아래 띠: 빠른 칸 ${i} ↔ ${b.id} 겹침`);
        if (Math.hypot(I.home.x - ccx, I.home.y - ccy) < stickR + hr * 0.8) fails.push(`아래 띠: 빠른 칸 ${i} ↔ 스틱 겹침`);
      }
      m.bandQuick = r1(L.quick[0].w * cs);
    }
  }
  // [hudfix] 휴대폰(넓은 배치): 버튼 묶음 높이 ≤ 화면의 42 % (예전 원호는 수호가 탈것 위로 올라가 41–59 %)
  if (scene === 'stage' && I.preset !== 'fold' && !I.band) {
    let top = Infinity;
    for (const b of act) top = Math.min(top, b.cy - rimR(b));
    const hk = (cr.y + cr.h - top) / cr.h;
    m.clusterH = r1(100 * hk);
    if (hk > 0.42) fails.push(`버튼 묶음 높이 ${r1(100 * hk)}% > 42%`);
  }
  if (scene === 'stage' && mode === 'overlay') { const br = tp.bottomReserve?.(); m.bottomReserve = br == null ? null : r1(100 * br); if (br != null && !(br > 0.08 && br < 0.45)) fails.push(`bottomReserve ${br} (기대 0.08–0.45, 카메라 경기장 바닥용 — 카메라는 0.26 에서 자른다)`); }
  if (dev.mmPerDp && mode === 'overlay' && scene === 'stage') {
    const k = dev.mmPerDp, mmOf = (b) => r1(2 * rimR(b) * k);
    // [hudfix] 공격 76 · 점프 60 · 나머지 56 · 넘김/수호 52 dp (폴드 DPR 2) — 의견 2 '버튼마다 조금씩 작게'. 화면 확대(fold26)도 같은 mm
    const RANGE = { attack: [13.5, 15.5], jump: [9.5, 10.8], ult: [9.6, 11], swap: [8.2, 9.7], guard: [8.2, 9.7], lock: [8.2, 9.7] };  // [auto] 대상 고정 = 넘김 크기
    const mmTab = {};
    for (const b of act) {
      const [lo, hi] = RANGE[b.id] ?? [8.9, 10.2];
      const v = mmOf(b); mmTab[b.id] = v;
      if (v < lo || v > hi) fails.push(`${b.id}: 테 ${v} mm (기대 ${lo}–${hi})`);
    }
    const stickMm = r1(2.28 * I.R * k);
    if (stickMm < 19.5 || stickMm > 22.5) fails.push(`스틱 받침 ${stickMm} mm (기대 19.5–22.5)`);
    if (L?.quick?.length) { const qm = r1(L.quick[0].w * cs * 0.99 * k); mmTab.quick = qm; if (qm < 8.2 || qm > 9.4) fails.push(`빠른 칸 ${qm} mm (기대 8.2–9.4)`); }
    if (minGap * k < 2 - 0.05) fails.push(`버튼 사이 ${r1(minGap * k)} mm < 2`);
    mmTab.stick = stickMm; mmTab.minGap = r1(minGap * k); mmTab.minMargin = r1(m.minMargin * k);
    m.mm = mmTab;
  }
  // HUD 겹침 (논리 px)
  if (scene === 'stage' && L) {
    const occ = tp.occupiedRects?.() ?? [];
    const sysR = occ.filter((p) => SYS.has(p.id)), padR = occ;
    const chk = (n1, a, n2, b) => { if (a && b && a.w > 0 && a.h > 0 && ov(a, b)) fails.push(`${n1}${f1(a)} ↔ ${n2}${f1(b)} 겹침`); };
    for (const p of sysR) { chk('점수(재화)', L.score, p.id, p); if (L.questShown) chk('퀘스트', L.quest, p.id, p); }
    if (L.quest && L.questShown) chk('점수', L.score, '퀘스트', L.quest);
    if (L.fold && L.quick) {
      const sz = tp.stickZone?.();
      for (let i = 0; i < L.quick.length; i++) {
        chk('콤보', L.combo, 'quick' + i, L.quick[i]);
        for (const p of padR) chk('quick' + i, L.quick[i], p.id, p);
        if (sz) chk('quick' + i, L.quick[i], '스틱', sz);
      }
    }
  }
  // 덧캔버스 선명도·불투명도
  {   // [hudfix] 화질 등급과 상관없이 (자동 화질이 낮음으로 내려가도) 기기 해상도 — 상한 DPR 3 · 6.5 MP, 메모리 ≤ 2 GB 기기만 예외
    let want = Math.min(I.devDpr, 3);
    if (W * Hh * want * want > 6.5e6) want = Math.sqrt(6.5e6 / (W * Hh));
    if ((navigator.deviceMemory ?? 8) <= 2) want = Math.min(want, 1.5);
    if (!(I.dpr >= want - 0.01)) fails.push(`덧캔버스 DPR ${I.dpr} < ${r1(want)} (기기 ${I.devDpr}, 등급 ${I.tier})`);
    if (I.backing && I.backing.w < Math.floor(W * I.dpr) - 2) fails.push(`덧캔버스 백킹 ${I.backing.w}px < ${Math.floor(W * I.dpr)}`);
  }
  if (!I.art) fails.push('버튼 그림(HUD art)이 아직 안 올라왔다');
  else if (I.opacity < 0.92) fails.push(`평소 불투명도 ${I.opacity} < 0.92`);
  // 버튼 배치 모드
  if (mode === 'band') {
    if (dev.bandable) {
      if (!I.band) fails.push("'아래 띠' 인데 띠가 없다");
      if (Math.abs(cr.y - ins.t) > 1) fails.push(`띠: 캔버스가 위에 붙지 않았다 (y ${r1(cr.y)})`);
      const bottom = cr.y + cr.h;
      for (const b of act) if (b.cy - rimR(b) < bottom - 0.5) fails.push(`띠: ${b.id} 가 게임 화면에 걸친다 (위 ${r1(b.cy - rimR(b))} < ${r1(bottom)})`);
      if (I.home.y - stickR < bottom - 0.5) fails.push('띠: 스틱 받침이 게임 화면에 걸친다');
      m.bandH = r1(Hh - bottom);
    } else if (I.band) fails.push("휴대폰: '아래 띠' 를 골라도 띠가 없어야 한다 (세로 여유 없음)");
  } else if (I.band) fails.push("'게임 화면 위' 인데 띠가 생겼다");
  return { fails, info, m };
}

const redo = [];
if (!NO_REDO) {
  for (const dev of REDO_DEVS) {
    if (ONLY && !ONLY.includes(dev.id)) continue;
    const runs = [['overlay', 'stage'], ...(COVERAGE_ONLY ? [] : [['band', 'stage'], ...(dev.hub ? [['overlay', 'hub']] : []), ...(dev.lefty ? [['overlay', 'stage', true], ['overlay', 'hub', true]] : [])])];
    const rows = {};   // 스테이지 아래 줄 자리 (마을과 비교)
    for (const [mode, scene, lefty] of runs) {
      const tag = `${dev.id}/${mode}${lefty ? '-lefthand' : ''}/${scene}`;
      const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
      await page.addInitScript(({ quality, mode, lefty }) => {
        try {
          const key = 'bloodnocturne_settings';
          const cur = JSON.parse(localStorage.getItem(key) || '{}');
          cur.quality = quality; cur.hud = { ...(cur.hud ?? {}), preset: 'auto', scale: 1, pad: mode, rev: 2 };
          cur.touchLeftHanded = !!lefty;
          if (!cur.settingsVersion) cur.settingsVersion = 2;
          localStorage.setItem(key, JSON.stringify(cur));
        } catch { /* 저장소 없음 */ }
      }, { quality: dev.quality, mode, lefty: !!lefty });
      let r;
      try {
        const url = scene === 'hub' ? 'index.html?scene=hub&char=sera&nosw' : 'index.html?scene=stage&stage=s01&char=sera&nosw';
        await page.goto(`http://localhost:${port}/${url}`, { timeout: 60000 });
        await page.waitForFunction((sc) => { const g = window.__game; return sc === 'hub' ? g?.top?.name === 'hub' : !!(g?.world?.player && g.scenes?.some((s) => s.name === 'stage')); }, scene, { timeout: 75000 });
        await page.waitForTimeout(1200);
        await page.evaluate(() => { const g = window.__game; let n = 0; while (g.top && g.top.name !== 'stage' && g.top.name !== 'hub' && g.scenes.length > 1 && n++ < 5) g.pop(); g.input?.setMode?.('touch'); });
        // 그림 버튼·덧캔버스가 구워질 때까지 (최대 8초)
        await page.evaluate(async () => {
          const TP = await import('/src/core/touchpad.js');
          for (let i = 0; i < 40; i++) {
            const I = TP.touchpad.layoutInfo?.();
            if (I && (I.art === true || (I.art === undefined && i >= 15))) return;
            await new Promise((res) => setTimeout(res, 200));
          }
        });
        await page.waitForTimeout(900);
        r = await page.evaluate(redoPage, { dev, mode, scene, coverageOnly: COVERAGE_ONLY });
        if (SHOTS && !COVERAGE_ONLY) await page.screenshot({ path: `${OUT}/redo_${dev.id}_${mode}${lefty ? '-lefthand' : ''}_${scene}.png` });
      } catch (e) { r = { fails: ['HARNESS ' + e.message], info: [], m: {} }; }
      await ctx.close();
      // [hudfix] 마을 점프·대시 = 스테이지 점프·대시 자리 (±8 dp), 스테이지 점프 자리를 누르면 마을에서 탈것이 눌리지 않게
      const rk = `${mode}${lefty ? 'L' : ''}`;
      if (scene === 'stage' && r.m.row) rows[rk] = r.m.row;
      if (scene === 'hub' && r.m.town?.pos && rows[rk]) {
        const st = rows[rk], tp = r.m.town.pos;
        const dj = Math.hypot(tp.jump[0] - st.jump[0], tp.jump[1] - st.jump[1]), dd = Math.hypot(tp.dash[0] - st.dash[0], tp.dash[1] - st.dash[1]);
        if (dj > 8) r.fails.push(`마을 점프가 스테이지 점프에서 ${dj.toFixed(1)} dp 떨어졌다 (> 8)`);
        if (dd > 8) r.fails.push(`마을 대시가 스테이지 대시에서 ${dd.toFixed(1)} dp 떨어졌다 (> 8)`);
        const dm = Math.hypot(tp.mount[0] - st.jump[0], tp.mount[1] - st.jump[1]);
        if (dm < tp.mount[2] / 2 + 10) r.fails.push(`스테이지 점프 자리가 마을 탈것의 터치 범위 안 (${dm.toFixed(1)} dp)`);
        r.m.town.vsStage = { jump: Math.round(dj * 10) / 10, dash: Math.round(dd * 10) / 10, mountFromStageJump: Math.round(dm * 10) / 10 };
      }
      const before = lefty ? null : BEFORE[tag];
      if (!COVERAGE_ONLY && before && r.m.coverage && r.m.coverage.union > before.union + 0.5) r.fails.push(`게임 화면 가림 ${r.m.coverage.union}% > 예전 ${before.union}%`);
      const cur = lefty ? null : CURRENT[tag];   // [auto]
      if (!COVERAGE_ONLY && cur != null && r.m.coverage && r.m.coverage.union > cur + 0.5 + 1e-9) r.fails.push(`[auto] 게임 화면 가림 ${r.m.coverage.union}% > AUTO-QOL 전 ${cur}% + 0.5`);
      const fails = [...r.fails, ...new Set(errs)];
      failTotal += fails.length;
      redo.push({ tag, ...r, before: before ?? null, errs: [...new Set(errs)] });
      const cov = r.m.coverage ? ` 가림 ${r.m.coverage.union}% (패드 겉넓이 ${r.m.coverage.pad} · HUD ${r.m.coverage.hud} · 덧캔버스 잉크 ${r.m.coverage.padInk})${before ? ` ← 예전 ${before.union}% (${before.pad} · ${before.hud} · ${before.padInk ?? '-'})` : ''}` : '';
      console.log(`${fails.length ? '✗' : '✓'} redo ${tag}${cov}${fails.length ? '\n    ' + fails.slice(0, 20).join('\n    ') : ''}`);
      if (!COVERAGE_ONLY) console.log(`    · ${JSON.stringify({ ...r.m, coverage: undefined })}`);
      for (const n of r.info ?? []) console.log('    (정보) ' + n);
    }
  }
}
report.push({ redo });
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
console.log(`\n${failTotal ? '실패' : '통과'}: 배치 조합 ${comboTotal}개, 실제 위젯 검사 ${widgetRuns}개, 문제 ${failTotal}건${SHOTS ? ` — 스크린샷 ${OUT}` : ''}`);
await browser.close(); srv.close();
process.exit(failTotal ? 1 : 0);
