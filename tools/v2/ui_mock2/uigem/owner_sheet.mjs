// 소유자용 모음 한 장: render.mjs · extras.mjs 가 찍은 캡처를 한국어 설명과 함께 모은다.
//   node tools/v2/ui_mock2/uigem/owner_sheet.mjs [dir=/tmp/claude-0/v2/uigem]   → owner_uigem.png
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = process.argv[2] || '/tmp/claude-0/v2/uigem';
const tmp = '/dev/shm/uigem'; mkdirSync(tmp, { recursive: true });
const fonts = 'file://' + resolve('assets/fonts');
const css = `
@font-face{font-family:"Noto Sans KR";src:url("${fonts}/noto-sans-kr.woff2") format("woff2");font-weight:400 900}
@font-face{font-family:"Noto Sans KR Ext";src:url("${fonts}/noto-sans-kr-ext.woff2") format("woff2");font-weight:400 900;unicode-range:U+AC00-D7A3}
@font-face{font-family:"Hahmlet";src:url("${fonts}/hahmlet.woff2") format("woff2");font-weight:600 900}
@font-face{font-family:"Hahmlet Ext";src:url("${fonts}/hahmlet-ext.woff2") format("woff2");font-weight:600 900;unicode-range:U+AC00-D7A3}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#10121c;color:#f6efdf;font-family:"Noto Sans KR","Noto Sans KR Ext",sans-serif;padding:40px;width:2560px}
h1{font:800 54px "Hahmlet","Hahmlet Ext",serif;letter-spacing:.06em}
h1 small{font:600 26px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#b9b6c4;margin-left:20px;letter-spacing:0}
.desc{font-size:26px;line-height:1.6;color:#dcd8e4;margin:12px 0 28px}
.cap{font:700 23px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#ecd49a;margin:10px 0 26px}
.cap span{font-weight:500;color:#b9b6c4;margin-left:10px}
img{display:block;width:100%;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.16)}
.r1{display:grid;grid-template-columns:1500px 950px;column-gap:30px}
.r2{display:grid;grid-template-columns:1225px 1225px;column-gap:30px}
.crop{height:560px;object-fit:cover;object-position:bottom}
`;
const img = (n) => `file://${dir}/${n}.png`;
const body = `<h1>세공한 유리<small>보석과 은세공 — 반투명 유리 원판 · 백금 테 · 루비 · 상아 조각 아이콘</small></h1>
<p class="desc">버튼은 배경이 비치는 밤색 유리 원판입니다. 가는 백금 테에 작은 구슬 무늬(밀그레인)를 두르고, 유리 밑에는 시계 문자판 같은 가는 물결 무늬를 깔았습니다. 강조는 붉은 보석 하나뿐.<br>아이콘은 기호가 아니라 그림입니다 — 게임 속 카엘이 실제로 그 동작을 하는 모습을 상아 조각처럼 새겼습니다. (유료 그림 생성 없이 게임이 가진 그림으로 만들었습니다.)</p>
<img src="${img('fold_open_play')}"><p class="cap">폴드 펼침 · 전투<span>보스 체력 · 피해 숫자 · 획득 알림 · 미니맵 · 임무. 점프 = 눌린 모습, 「3」 = 재사용 대기(테가 다시 차오름), 말 = 잠김, 붉은 달 = 궁극기 다 참, 박쥐 과녁 = 조준 켜짐</span></p>
<div class="r2"><div><img src="${img('phone2_play')}"><p class="cap">일반 휴대폰(가로) · 전투</p><img src="${img('phone2_dialog')}"><p class="cap">일반 휴대폰 · 대화</p>
<img src="${img('fold_open_menu')}"><p class="cap">폴드 펼침 · 장비/가방 메뉴<span>유리판 · 은선 두 겹 · 모서리 장식 · 등급 빛</span></p>
<img src="${img('icon_sheet')}"><p class="cap">아이콘 한 벌 20개<span>크게 + 실제 버튼 크기(64 · 48)</span></p></div>
<div><img src="${img('phone2_menu')}"><p class="cap">일반 휴대폰 · 장비/가방</p>
<img class="crop" src="${img('fold_open_dialog')}"><p class="cap">폴드 펼침 · 대화 (화면 아래쪽)<span>아치 액자의 카엘 흉상 · 이름표</span></p>
<img src="${img('strip_backgrounds')}"><p class="cap">같은 버튼을 밝은 불꽃 · 돌바닥 · 어둠 · 흰 불빛 위에<span>실시간 흐림을 쓰지 않은 모습 그대로</span></p>
<img src="${img('fold_open_play_alley')}"><p class="cap">폴드 펼침 · 종 구간(골목) 전투</p><img src="${img('fold_open_play_street')}"><p class="cap">폴드 펼침 · 어두운 거리 위</p></div></div>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] });
const page = await (await browser.newContext({ viewport: { width: 2560, height: 1200 }, deviceScaleFactor: 1 })).newPage();
const f = `${tmp}/owner.html`;
writeFileSync(f, `<!doctype html><html lang="ko"><meta charset="utf-8"><style>${css}</style><body>${body}</body></html>`);
await page.goto('file://' + f);
await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => 0))]));
await page.waitForTimeout(400);
await page.locator('body').screenshot({ path: `${dir}/owner_uigem.png` });
console.log('wrote', `${dir}/owner_uigem.png`);
await browser.close();
