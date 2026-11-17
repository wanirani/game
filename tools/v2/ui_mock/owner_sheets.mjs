// 소유자용 비교 그림: render.mjs 가 찍은 캡처를 한 장씩 모은다.
//   node tools/v2/ui_mock/owner_sheets.mjs [dir=/tmp/claude-0/v2/uipilot]
//   → owner_ui_<style>.png (스타일마다: 폴드 전투 · 가방 · 휴대폰 전투 · 대화), owner_ui_compare.png (세 스타일 나란히)
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = process.argv[2] || '/tmp/claude-0/v2/uipilot';
const tmp = '/dev/shm/uipilot'; mkdirSync(tmp, { recursive: true });
const fonts = 'file://' + resolve('assets/fonts');
const STYLES = [
  ['fieldkit', '① 사냥 수첩', '가죽 · 양피지 · 뼈 · 황동', '사냥꾼이 들고 다니는 수첩과 도구처럼 따뜻하고 손맛 나는 화면.', '둥글고 도톰한 버튼, 바느질 선, 버튼마다 이름표. 정보를 가장 많이 보여 준다.', '#d2a955'],
  ['glass', '② 달빛 유리', '반투명 유리 · 가는 흰 선 · 굵은 아이콘', '장식을 걷어낸 요즘 액션 게임식 화면.', '화면을 가장 적게 가리고, 붉은 달빛 한 가지 색으로만 강조한다.', '#ff4458'],
  ['silver', '③ 은세공', '어두운 유리 · 가는 은선 · 진홍 보석', '기존 고딕 분위기를 가볍고 납작하게 다듬은 화면.', '팔각 · 마름모 · 뾰족 아치 모양. 밤의 석조 세계에 가장 잘 녹아든다.', '#c9d0de'],
];
const css = `
@font-face{font-family:"Noto Sans KR";src:url("${fonts}/noto-sans-kr.woff2") format("woff2");font-weight:400 900}
@font-face{font-family:"Noto Sans KR Ext";src:url("${fonts}/noto-sans-kr-ext.woff2") format("woff2");font-weight:400 900;unicode-range:U+AC00-D7A3}
@font-face{font-family:"Hahmlet";src:url("${fonts}/hahmlet.woff2") format("woff2");font-weight:600 900}
@font-face{font-family:"Hahmlet Ext";src:url("${fonts}/hahmlet-ext.woff2") format("woff2");font-weight:600 900;unicode-range:U+AC00-D7A3}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#14131a;color:#f1f0ee;font-family:"Noto Sans KR","Noto Sans KR Ext",sans-serif;padding:36px;width:max-content}
h1{font:800 46px "Hahmlet","Hahmlet Ext",serif;letter-spacing:.02em}
h1 small{font:600 24px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#b9b6c4;margin-left:18px}
.desc{font-size:25px;line-height:1.55;color:#d9d6e2;margin:10px 0 26px}
.cap{font:700 21px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#b9b6c4;margin:8px 0 22px}
img{display:block;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.14)}
.g2{display:grid;grid-template-columns:1180px 1180px;column-gap:28px}
.crop{width:1180px;height:574px;object-fit:cover;object-position:bottom}
.cmp{display:grid;grid-template-columns:150px repeat(3,1000px);column-gap:26px;align-items:start}
.cmp .hd{padding:0 0 18px;border-top:6px solid var(--c);padding-top:14px}
.cmp .hd b{font:800 40px "Hahmlet","Hahmlet Ext",serif;display:block}
.cmp .hd span{font-size:21px;color:#b9b6c4;display:block;margin-top:4px}
.cmp .hd p{font-size:20px;line-height:1.5;color:#d9d6e2;margin-top:8px;min-height:92px}
.cmp .rl{font:800 24px "Hahmlet","Hahmlet Ext",serif;color:#e8c872;padding-top:14px;line-height:1.35}
.cmp .rl small{display:block;font:500 17px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#9f9cab;margin-top:6px}
.cmp img{width:1000px;margin-bottom:22px}
.cmp .c2{height:440px;object-fit:cover;object-position:bottom}
.top{margin-bottom:26px}.top h1{font-size:52px}.top p{font-size:24px;color:#b9b6c4;margin-top:8px}
`;
const img = (st, n) => `file://${dir}/${st}_${n}.png`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 })).newPage();
async function shot(name, body) {
  const f = `${tmp}/${name}.html`;
  writeFileSync(f, `<!doctype html><html lang="ko"><meta charset="utf-8"><style>${css}</style><body>${body}</body></html>`);
  await page.goto('file://' + f);
  await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => 0))]));
  await page.waitForTimeout(300);
  await page.locator('body').screenshot({ path: `${dir}/${name}.png` });
  console.log('wrote', `${dir}/${name}.png`);
}
for (const [st, nm, mat, d1, d2] of STYLES) {
  await shot(`owner_ui_${st}`, `<h1>${nm}<small>${mat}</small></h1><p class="desc">${d1}<br>${d2}</p>
<div class="g2"><div><img src="${img(st, 'fold_open_play')}" width="1180"><p class="cap">폴드 펼침 · 전투 (마당, 보스 체력·피해 숫자·획득 알림)</p></div><div><img src="${img(st, 'fold_open_menu')}" width="1180"><p class="cap">폴드 펼침 · 장비/가방 메뉴</p></div>
<div><img src="${img(st, 'phone2_play')}" width="1180"><p class="cap">일반 휴대폰(가로) · 전투</p></div><div><img class="crop" src="${img(st, 'fold_open_dialog')}"><p class="cap">폴드 펼침 · 대화 (화면 아래쪽)</p></div>
<div><img src="${img(st, 'fold_open_play_alley')}" width="1180"><p class="cap">폴드 펼침 · 종 구간(골목) 전투</p></div><div><img src="${img(st, 'phone2_menu')}" width="1180"><p class="cap">일반 휴대폰(가로) · 장비/가방 메뉴</p></div></div>`);
}
const rows = [['fold_open_play', '폴드<br>전투', '횡·마당', ''], ['fold_open_play_alley', '폴드<br>종 구간', '골목', ''], ['phone2_play', '휴대폰<br>전투', '740×360', ''], ['fold_open_menu', '폴드<br>가방', '장비·가방', ''], ['fold_open_dialog', '폴드<br>대화', '아래쪽', 'c2'], ['phone2_menu', '휴대폰<br>가방', '', '']];
await shot('owner_ui_compare', `<div class="top"><h1>「붉은밤」 새 인터페이스 — 세 가지 시안</h1><p>같은 장면 · 같은 내용 · 같은 버튼을 세 가지 생김새로. 바탕은 시범판 B 의 실제 화면입니다.</p></div>
<div class="cmp"><div></div>${STYLES.map(([st, nm, mat, d1, d2, c]) => `<div class="hd" style="--c:${c}"><b>${nm}</b><span>${mat}</span><p>${d1} ${d2}</p></div>`).join('')}
${rows.map(([n, l, s, c]) => `<div class="rl">${l}<small>${s}</small></div>${STYLES.map(([st]) => `<img class="${c}" src="${img(st, n)}">`).join('')}`).join('')}</div>`);
await browser.close();
