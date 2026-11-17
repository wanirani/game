// 소유자용 모음 한 장: node tools/v2/ui_mock2/uiink/owner_sheet.mjs [dir=/tmp/claude-0/v2/uiink]  → owner_uiink.png
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = process.argv[2] || '/tmp/claude-0/v2/uiink';
const tmp = '/dev/shm/uiink'; mkdirSync(tmp, { recursive: true });
const fonts = 'file://' + resolve('assets/fonts');
const css = `
@font-face{font-family:"Noto Sans KR";src:url("${fonts}/noto-sans-kr.woff2") format("woff2");font-weight:400 900}
@font-face{font-family:"Noto Sans KR Ext";src:url("${fonts}/noto-sans-kr-ext.woff2") format("woff2");font-weight:400 900;unicode-range:U+AC00-D7A3}
@font-face{font-family:"Hahmlet";src:url("${fonts}/hahmlet.woff2") format("woff2");font-weight:600 900}
@font-face{font-family:"Hahmlet Ext";src:url("${fonts}/hahmlet-ext.woff2") format("woff2");font-weight:600 900;unicode-range:U+AC00-D7A3}
@font-face{font-family:"BN Brush";src:url("${fonts}/bn-brush.woff2") format("woff2")}
@font-face{font-family:"BN Seal";src:url("${fonts}/bn-seal.woff2") format("woff2")}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d0d12;color:#f3f1ea;font-family:"Noto Sans KR","Noto Sans KR Ext",sans-serif;padding:40px;width:2480px}
h1{font:400 84px/1 "BN Brush","Hahmlet",serif;display:flex;align-items:center;gap:22px}
h1 i{display:grid;place-items:center;width:58px;height:58px;background:#e8283f;color:#fff;font:400 40px/1 "BN Seal",serif;border-radius:5px;transform:rotate(-5deg);font-style:normal;box-shadow:inset 0 0 0 2px rgba(255,255,255,.4)}
h1 small{font:600 26px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#b9b6c4;margin-left:10px}
.desc{font-size:27px;line-height:1.6;color:#dcd9e4;margin:16px 0 30px;word-break:keep-all}
.desc b{color:#e8c56c;font-weight:700}
.cap{font:700 23px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#cfccd8;margin:10px 0 28px}
.cap small{font-weight:500;color:#9f9cab;font-size:20px;margin-left:8px}
img{display:block;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.16)}
.g2{display:grid;grid-template-columns:1188px 1188px;column-gap:24px;align-items:start}
.crop{width:1188px;height:560px;object-fit:cover;object-position:bottom}
.zoom{width:1188px;height:560px;object-fit:none;object-position:100% 100%}
`;
const img = (n) => `file://${dir}/${n}.png`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 })).newPage();
const body = `<h1><i>狩</i>먹과 달빛<small>2차 시안 · 그을린 반투명 유리 위에 붓으로 그린 그림 · 달빛 테 · 핏빛과 금빛의 가는 선</small></h1>
<p class="desc">버튼은 <b>배경이 비쳐 보이는 그을린 유리</b>이고, 그 위의 그림은 선 기호가 아니라 <b>동작을 하는 사냥꾼을 붓으로 그은 그림</b>입니다. 체력 막대 · 이름표 · 「장착」 버튼까지 붓 한 획으로 그렸습니다.<br>배경 흐림 효과는 쓰지 않았습니다 — 보이는 그대로 게임 화면에 그릴 수 있습니다. 그림은 전부 코드(붓 엔진)로 그린 것이라 유료 생성은 0장입니다.</p>
<img src="${img('fold_open_play')}" width="2400"><p class="cap">폴드 펼침 · 전투 <small>공격(가장 큼) · 대시 · 점프 · 기술 2 · 궁극기(가득 참, 붉은 달) · 막기 · 교대 · 조준(켜짐) · 탑승(잠김) / 기술 하나는 재사용 대기 중(테가 차오름) / 보스 체력 · 피해 숫자 · 획득 알림 · 미니맵 · 임무</small></p>
<div class="g2">
<div><img src="${img('phone2_play')}" width="1188"><p class="cap">일반 휴대폰(가로) · 전투</p>
<img src="${img('fold_open_menu')}" width="1188"><p class="cap">폴드 펼침 · 장비 / 가방 <small>유리판 · 탭 · 목록 · 물건 카드 · 버튼</small></p>
<img src="${img('icon_set')}" width="1188"><p class="cap">아이콘 묶음 <small>크게 본 그림과 실제 크기</small></p></div>
<div><img class="crop" src="${img('fold_open_dialog')}"><p class="cap">폴드 펼침 · 대화 <small>붓 한 획 이름표 · 카엘 흉상</small></p>
<img src="${img('phone2_menu')}" width="1188"><p class="cap">일반 휴대폰 · 장비 / 가방</p>
<img src="${img('phone2_dialog')}" width="1188"><p class="cap">일반 휴대폰 · 대화</p>
<img src="${img('bg_strip')}" width="1188"><p class="cap">밝은 불빛 · 돌바닥 · 어두운 곳 위의 버튼 <small>흐림 효과 없이</small></p>
<img class="zoom" src="${img('fold_open_play_press')}"><p class="cap">가까이 본 버튼 <small>공격을 누른 순간 · 궁극기 80% 충전 · 기술 재사용 대기</small></p></div>
<div><img src="${img('fold_open_play_alley')}" width="1188"><p class="cap">폴드 펼침 · 골목(종 구간) 전투</p></div>
<div><img src="${img('fold_open_play_street')}" width="1188"><p class="cap">폴드 펼침 · 거리 전투</p></div>
</div>`;
const f = `${tmp}/owner.html`;
writeFileSync(f, `<!doctype html><html lang="ko"><meta charset="utf-8"><style>${css}</style><body>${body}</body></html>`);
await page.goto('file://' + f);
await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => 0))]));
await page.waitForTimeout(400);
await page.locator('body').screenshot({ path: `${dir}/owner_uiink.png` });
console.log('wrote', `${dir}/owner_uiink.png`);
await browser.close();
