// ui2review — 소유자용 비교 한 장: 1차 「달빛 유리」(작게) → 2차 두 시안(같은 화면 · 같은 크기, 크게) → 휴대폰 → 아이콘 한 벌 → 유리를 더 맑게 한 판.
//   node tools/v2/ui_mock2/ui2review/owner_sheet.mjs   → /tmp/claude-0/v2/owner_ui2.png  (review.mjs · clear.mjs · cmp.py 를 먼저 돌린다)
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const R = '/tmp/claude-0/v2/ui2review', tmp = '/dev/shm/ui2review'; mkdirSync(tmp, { recursive: true });
const M = JSON.parse(readFileSync(`${R}/review_measure.json`, 'utf8')), C = JSON.parse(readFileSync(`${R}/clear_measure.json`, 'utf8'));
const fonts = 'file://' + resolve('assets/fonts');
const css = `
@font-face{font-family:"Noto Sans KR";src:url("${fonts}/noto-sans-kr.woff2") format("woff2");font-weight:400 900}
@font-face{font-family:"Noto Sans KR Ext";src:url("${fonts}/noto-sans-kr-ext.woff2") format("woff2");font-weight:400 900;unicode-range:U+AC00-D7A3}
@font-face{font-family:"Hahmlet";src:url("${fonts}/hahmlet.woff2") format("woff2");font-weight:600 900}
@font-face{font-family:"Hahmlet Ext";src:url("${fonts}/hahmlet-ext.woff2") format("woff2");font-weight:600 900;unicode-range:U+AC00-D7A3}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f111a;color:#f6efdf;font-family:"Noto Sans KR","Noto Sans KR Ext",sans-serif;padding:40px;width:2600px}
h1{font:800 56px "Hahmlet","Hahmlet Ext",serif;letter-spacing:.04em}
h2{font:800 46px "Hahmlet","Hahmlet Ext",serif;margin:46px 0 8px;display:flex;align-items:baseline;gap:18px}
h2 b{font:800 30px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#10121c;background:#ecd49a;border-radius:8px;padding:2px 14px}
h2 small{font:600 26px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#b9b6c4}
h3{font:800 34px "Hahmlet","Hahmlet Ext",serif;margin:46px 0 10px;color:#ecd49a}
p{font-size:26px;line-height:1.62;color:#dcd8e4}
p b{color:#fff} .q{color:#ffd9a0}
.cap{font:700 24px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#ecd49a;margin:10px 0 8px}
.cap span{font-weight:500;color:#b9b6c4;margin-left:10px}
img{display:block;width:100%;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.16)}
.top{display:grid;grid-template-columns:880px 1fr;column-gap:36px;margin-top:26px;align-items:start}
.two{display:grid;grid-template-columns:1fr 1fr;column-gap:30px;align-items:start}
.note{background:#181b29;border-radius:12px;padding:20px 26px;margin-top:12px}
.note p{font-size:24px}
.good{color:#9be0a8}.bad{color:#ff9aa6}
table{border-collapse:collapse;margin-top:12px;font-size:24px;width:100%}
td,th{border-bottom:1px solid #2c3046;padding:8px 12px;text-align:left} th{color:#ecd49a;font-weight:700} td.n{text-align:right;font-variant-numeric:tabular-nums}
`;
const r = (n) => `file://${R}/${n}.png`;
const g = M.uigem_fold_open, gp = M.uigem_phone2, k = M.uiink_fold_open, kp = M.uiink_phone2;
const body = `<h1>인터페이스 2차 시안 비교 — 반투명은 그대로, 더 고급스럽게</h1>
<div class="top"><div><img src="file:///tmp/claude-0/v2/uipilot/glass_fold_open_play.png"><p class="cap">1차 — 너무 단순하다고 하신 것<span>「달빛 유리」 · 가는 흰 고리 + 선 기호</span></p></div>
<div><p><span class="q">"너무 단순해. 그리고 반투명이지만 고급스러웠으면 좋겠어. 지금은 무슨 클로드 같아"</span></p>
<p style="margin-top:14px">그래서 2차는 두 가지로 다시 만들었습니다. 둘 다 <b>버튼은 배경이 비치는 유리</b>이고, 아이콘은 선 기호 대신 <b>사냥꾼이 그 동작을 하는 그림</b>입니다. 아래 두 장은 <b>같은 장면 · 같은 크기</b>(폴드를 편 화면)입니다.</p>
<div class="note"><p><b>Ⓐ 세공한 유리</b> — 밤색 유리 + 가는 백금 테 + 붉은 보석. 아이콘은 게임 속 카엘 3D 모델이 실제로 베고 뛰는 모습을 상아 조각처럼 새긴 것.</p>
<p><b>Ⓑ 먹과 달빛</b> — 그을린 유리 + 흰 붓 그림. 체력 막대 · 이름표까지 붓 한 획으로 통일.</p>
<p style="margin-top:10px;color:#b9b6c4">두 시안 모두 유료 그림 생성 없이 만들었습니다(생성 권한이 막혀 있었음). 실시간 배경 흐림은 어디에도 쓰지 않았습니다 — 보이는 그대로가 게임에서 나올 모습입니다.</p></div></div></div>

<h2><b>Ⓐ</b>세공한 유리<small>검토 결과: 통과(작은 수정 포함) · 추천</small></h2>
<img src="${r('uigem_fold_open_play_yard')}"><p class="cap">폴드 펼침 · 전투<span>점프 = 눌린 모습 · 「3」 = 재사용 대기 · 말 = 아직 잠김 · 붉은 달 = 궁극기 다 참 · 박쥐 과녁 = 조준 켜짐</span></p>
<h2><b>Ⓑ</b>먹과 달빛<small>검토 결과: 통과(작은 수정 포함) · 붓 느낌은 Ⓐ에 일부 옮겨 쓸 만함</small></h2>
<img src="${r('uiink_fold_open_play_yard')}"><p class="cap">폴드 펼침 · 전투<span>같은 장면 · 같은 크기</span></p>

<h3>일반 휴대폰(가로)에서</h3>
<div class="two"><div><img src="${r('uigem_phone2_play_yard')}"><p class="cap">Ⓐ 세공한 유리</p></div><div><img src="${r('uiink_phone2_play_yard')}"><p class="cap">Ⓑ 먹과 달빛</p></div></div>
<div class="two"><div><img src="${r('uigem_fold_open_menu')}"><p class="cap">Ⓐ 장비 · 가방<span>물건은 채색 그림 그대로</span></p></div><div><img src="${r('uiink_fold_open_menu')}"><p class="cap">Ⓑ 장비 · 가방<span>물건이 흰 기호 — 1차와 같은 "단순함"이 여기 남아 있음</span></p></div></div>

<h3>아이콘 한 벌</h3>
<div class="two"><div><img src="file:///tmp/claude-0/v2/uigem/icon_sheet.png"><p class="cap">Ⓐ 상아 조각 20개<span>사람 그림이 가장 세밀함. 작은 버튼에서는 자세가 서로 닮아 보임</span></p></div>
<div><img src="file:///tmp/claude-0/v2/uiink/icon_set.png"><p class="cap">Ⓑ 붓 그림 34개<span>작은 크기에서 더 또렷함. 그림은 덜 세밀하고(머리는 점, 팔다리는 한 획) 가방 물건은 기호에 가까움</span></p></div></div>

<h3>검토에서 찾은 것 — 두 시안 모두 유리가 1차보다 두 배쯤 짙습니다</h3>
<p>"배경이 보였으면 좋겠다"고 하셨는데, 재 보니 버튼 유리가 배경을 가리는 정도가 1차는 13–40 %, Ⓐ는 약 ${Math.round(g.glass_avg * 100)} %, Ⓑ는 약 ${Math.round(k.glass_avg * 100)} % 였습니다. 그래서 <b>유리를 더 맑게 한 판</b>을 두 시안에 넣어 봤습니다(Ⓐ 약 ${Math.round(C.uigem_fold_open_clear.glass_p25 * 100)} %, Ⓑ 약 ${Math.round(C.uiink_fold_open_clear.glass_p25 * 100)} %). 그림은 여전히 읽힙니다.</p>
<img style="margin-top:14px" src="${r('clear_cmp_fold_open')}"><p class="cap">왼쪽부터: Ⓐ 지금 · Ⓐ 더 맑게 · Ⓑ 지금 · Ⓑ 더 맑게<span>윗줄 마당 · 아랫줄 어두운 거리</span></p>

<h3>잰 값 (검토자가 다시 잰 것)</h3>
<table><tr><th></th><th>Ⓐ 세공한 유리 (폴드 / 휴대폰)</th><th>Ⓑ 먹과 달빛 (폴드 / 휴대폰)</th><th>1차 달빛 유리</th></tr>
<tr><td>가장 작은 버튼 (44 이상이어야 함)</td><td>${g.min_touch} / ${gp.min_touch}</td><td>${k.min_touch} / ${kp.min_touch}</td><td>46 / 44</td></tr>
<tr><td>공격 버튼</td><td>${g.sizes['b-attack']} / ${gp.sizes['b-attack']}</td><td>${k.sizes['b-attack']} / ${kp.sizes['b-attack']}</td><td>—</td></tr>
<tr><td>인터페이스가 조금이라도 덮는 넓이</td><td>${g.any_pct} % / ${gp.any_pct} %</td><td>${k.any_pct} % / ${kp.any_pct} %</td><td>${C.r1glass_fold_open.any_pct} % / ${C.r1glass_phone2.any_pct} %</td></tr>
<tr><td>절반 넘게 가리는 넓이</td><td>${g.half_pct} % / ${gp.half_pct} %</td><td>${k.half_pct} % / ${kp.half_pct} %</td><td>${C.r1glass_fold_open.half_pct} % / ${C.r1glass_phone2.half_pct} %</td></tr>
<tr><td>화면 가운데(싸움터)를 덮는 넓이</td><td>${g.centre_any_pct} % / ${gp.centre_any_pct} %</td><td>${k.centre_any_pct} % / ${kp.centre_any_pct} %</td><td>${C.r1glass_fold_open.centre_any_pct} % / ${C.r1glass_phone2.centre_any_pct} %</td></tr></table>
<div class="note"><p><b>검토 의견.</b> <span class="good">Ⓐ 세공한 유리를 추천합니다</span> — 사람 그림이 가장 세밀하고, 은 · 루비 · 유리가 이 게임의 고딕 세계(종 · 붉은 달 · 은)와 맞고, 가방 물건도 채색 그림이라 "고급 게임"처럼 보입니다. 유리는 위의 "더 맑게"로 가는 것이 좋겠습니다.</p>
<p><span class="good">Ⓑ에서 옮겨 올 것:</span> 붓으로 그은 체력 막대와 피해 숫자의 힘, 작은 크기에서 또렷한 굵은 실루엣(교대 · 탑승 같은 작은 버튼), 버튼 아래 한글 이름표. <span class="bad">Ⓑ의 걸림돌:</span> 먹 · 낙관(狩)은 동양화 느낌이라 고딕 세계와 결이 다르고, 가방 물건이 다시 흰 기호가 됩니다.</p></div>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] });
const page = await (await browser.newContext({ viewport: { width: 2600, height: 1200 }, deviceScaleFactor: 1 })).newPage();
const f = `${tmp}/owner.html`;
writeFileSync(f, `<!doctype html><html lang="ko"><meta charset="utf-8"><style>${css}</style><body>${body}</body></html>`);
await page.goto('file://' + f); await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
const bad = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src));
if (bad.length) console.log('MISSING', bad);
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/claude-0/v2/owner_ui2.png', fullPage: true });
console.log('ok', await page.evaluate(() => document.documentElement.scrollHeight));
await browser.close();
