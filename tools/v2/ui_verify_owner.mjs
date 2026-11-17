// UI-VERIFY lane: the owner sheet (about 2000 px wide) built from the captures of ui_verify.mjs and ui_verify_shots.mjs.
//   node tools/v2/ui_verify_owner.mjs [dir=/tmp/claude-0/v2/uiverify] [out=/tmp/claude-0/v2/owner_ui3.png]
import { chromium } from 'playwright-core';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = process.argv[2] || '/tmp/claude-0/v2/uiverify', out = process.argv[3] || '/tmp/claude-0/v2/owner_ui3.png';
const fonts = 'file://' + resolve('assets/fonts');
const shots = existsSync(dir + '/shots.json') ? JSON.parse(readFileSync(dir + '/shots.json', 'utf8')) : {};
const css = `
@font-face{font-family:"Noto Sans KR";src:url("${fonts}/noto-sans-kr.woff2") format("woff2");font-weight:400 900}
@font-face{font-family:"Noto Sans KR Ext";src:url("${fonts}/noto-sans-kr-ext.woff2") format("woff2");font-weight:400 900;unicode-range:U+AC00-D7A3}
@font-face{font-family:"Hahmlet";src:url("${fonts}/hahmlet.woff2") format("woff2");font-weight:600 900}
@font-face{font-family:"Hahmlet Ext";src:url("${fonts}/hahmlet-ext.woff2") format("woff2");font-weight:600 900;unicode-range:U+AC00-D7A3}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0e101a;color:#f3f0e8;font-family:"Noto Sans KR","Noto Sans KR Ext",sans-serif;padding:32px;width:2000px}
h1{font:800 44px "Hahmlet","Hahmlet Ext",serif;letter-spacing:.03em}
h1 small{font:600 21px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#b9b6c4;margin-left:16px;letter-spacing:0}
h2{font:800 27px "Hahmlet","Hahmlet Ext",serif;margin:26px 0 12px;color:#ecd49a}
.desc{font-size:21px;line-height:1.6;color:#dcd8e4;margin:10px 0 20px}
.cap{font:700 19px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#ecd49a;margin:8px 0 20px;line-height:1.5}
.cap span{font-weight:500;color:#b9b6c4;margin-left:8px}
img.s{display:block;width:100%;border-radius:8px;box-shadow:0 0 0 1px rgba(255,255,255,.16)}
.r{display:grid;column-gap:24px}.r2{grid-template-columns:1fr 1fr}
.icons{display:flex;align-items:flex-end;gap:8px;padding:14px 16px;border-radius:8px;box-shadow:0 0 0 1px rgba(255,255,255,.16);background:#171a28;margin-bottom:8px;flex-wrap:nowrap}
.icons .tag{font:700 17px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#b9b6c4;width:104px;flex:none;align-self:center;line-height:1.4}
.icons img{display:block;flex:none}
.weak{font-size:21px;line-height:1.6;color:#ffd9de;background:#2a1620;border-radius:8px;padding:14px 18px;margin-top:8px}
.nums{font-size:18px;line-height:1.7;color:#c9c6d6;margin-top:14px}
`;
const img = (n) => `file://${dir}/${n}.png`;
const ids = ['attack', 'jump', 'roll', 'skill', 'bell', 'lock', 'pause'];
const sizeOf = Object.fromEntries((shots.icons?.fold_open ?? []).map((r) => [r[0], [r[1], r[2]]]));
const row = (bg, k, tag) => `<div class="icons"><div class="tag">${tag}</div>${ids.map((id) => { const z = sizeOf[id] ?? [90, 100]; return `<img src="file://${dir}/icons/fold_open_${bg}_${id}.png" style="width:${z[0] * k}px;height:${z[1] * k}px">`; }).join('')}</div>`;
const body = `<h1>세공한 유리 — 검증판<small>실제 3D 장면 위에 새 인터페이스를 꽂아 손가락 입력으로 확인한 그림입니다 (폴드 펼침 크기)</small></h1>
<p class="desc">아래 그림은 모두 실제 게임 장면(v2g)에 새 인터페이스를 켜고 찍었습니다. 단추는 흐림 효과 없이 맑은 유리로 그려 배경이 그대로 비칩니다. 다만 화면은 검사용 컴퓨터에서 찍은 것이고, 실제 폴드에서 손으로 눌러 본 것은 아닙니다.</p>
<img class="s" src="${img('fold_open_live_fight')}"><p class="cap">① 싸움 중<span>공격 단추로 실제 적을 때린 장면 — 붓글씨 피해 숫자, 락온 고리(가시 테), 「튕겨냄」, 왼쪽 위 촛불(체력)</span></p>
<div class="r r2"><div><img class="s" src="${img('fold_open_live_idle')}"><p class="cap">② 평소 화면<span>지역 이름 띠 · 왼쪽 떠 있는 스틱 · 오른쪽 단추 일곱 개와 한글 이름표</span></p></div>
<div><img class="s" src="${img('fold_open_live_boss')}"><p class="cap">③ 보스 막대<span>이름 · 문장 · 붉은 막대, 촛불 열여섯 자루(두 단), 울림 눈금 다섯 칸과 보름달 — 값은 검사용으로 넣은 것</span></p></div></div>
<div class="r r2"><div><img class="s" src="${img('fold_open_live_dialog')}"><p class="cap">④ 대화 창<span>초상 · 이름표 · 글자가 차례로 나타남 (대화 중에는 단추가 숨습니다)</span></p></div>
<div><img class="s" src="${img('fold_open_live_pause')}"><p class="cap">⑤ 일시정지<span>멈춤 단추 → 이어 하기 · 설정 · 나가기 (놀이가 멈춥니다)</span></p></div></div>
<h2>단추 아이콘을 가까이서</h2>
${row('bright', 1, '실제 크기<br>밝은 배경')}${row('dark', 1, '실제 크기<br>어두운 배경')}${row('bright', 3, '3배 확대<br>밝은 배경')}
<p class="cap">왼쪽부터 공격 · 점프 · 구르기 · 솜씨 · 종 · 다음 적 · 멈춤<span>은 세공과 서리 낀 수정으로 그린 한 벌. 유리 가운데로 배경이 비칩니다.</span></p>
<h2>전과 후 (같은 3D 장면)</h2>
<div class="r r2"><div><img class="s" src="${img('fold_open_before_v1pad')}"><p class="cap">전 — 지금 기본값<span>옛 2D 판의 금테 단추와 임시 체력 표시</span></p></div>
<div><img class="s" src="${img('fold_open_live_idle')}"><p class="cap">후 — 새 인터페이스<span>맑은 유리 단추 · 전용 아이콘 · 이름표 · 촛불</span></p></div></div>
<p class="weak"><b>아직 약한 점:</b> __WEAK__</p>
<p class="nums">__NUMS__</p>`;
const weak = process.env.UI_WEAK || '아이콘이 모두 같은 은빛이라 실제 크기에서는 「공격 · 구르기 · 솜씨」가 한눈에 색으로는 갈리지 않고 모양으로만 구분됩니다. 실제 폴드에서 손으로 눌러 본 적이 없어 단추 크기와 간격은 기기에서 다시 맞춰야 합니다.';
const nums = process.env.UI_NUMS || '';
const html = `<!doctype html><meta charset="utf-8"><style>${css}</style>${body.replace('__WEAK__', weak).replace('__NUMS__', nums)}`;
writeFileSync(dir + '/owner.html', html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 1 });
await page.goto('file://' + dir + '/owner.html'); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('saved', out);
