// FIRE-2 owner sheet -> /tmp/claude-0/v2/owner_fire2.png (about 2000 px wide, Korean captions, the game's own fonts).
// Inputs (made by tools/v2/fire2_shot.mjs at Fold size, game camera): /tmp/claude-0/v2/fire2/{before,after}/<spot>.png, strip/strip_<spot>_<0..5>.png,
// close_before / close_after/<spot>.png, and notes.json = { numbers: '...', weak: '...' } (two lines of text for the bottom).
//   node tools/v2/fire2_owner.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const B = '/tmp/claude-0/v2/fire2/', D = 'file://' + B, F = 'file:///home/user/game/assets/fonts/', OUT = '/tmp/claude-0/v2/owner_fire2.png', HTML = B + 'owner.html';
const N = fs.existsSync(B + 'notes.json') ? JSON.parse(fs.readFileSync(B + 'notes.json', 'utf8')) : { numbers: '', weak: '' };
const has = (p) => fs.existsSync(B + p);
const img = (p, w, h) => (has(p) ? `<img src="${D}${p}" style="width:${w}px${h ? `;height:${h}px;object-fit:cover` : ''}">` : `<div class="miss" style="width:${w}px;height:${h || 200}px">(없음: ${p})</div>`);
const pair = (n, w, cap) => `<div style="width:${w * 2 + 4}px"><div class="two"><div class="tagbox">${img('before/' + n + '.png', w)}<span class="tg old">전</span></div><div class="tagbox">${img('after/' + n + '.png', w)}<span class="tg new">후</span></div></div><div class="cap">${cap}</div></div>`;
const SPOTS = [
  ['esh_roof', '마을 외곽 — 지붕과 담 위의 큰불. 물방울 줄이 아니라 한 덩어리로 탑니다'],
  ['esh_wreck', '마을 외곽 — 불탄 잔해'],
  ['brazier', '큰길 — 화로 (그릇 속 각진 노란 조각을 빼고 숯불을 넣음)'],
  ['past_brazier', '1697년 큰길 — 화로'],
  ['ossuary_past', '1697년 납골당 — 문 앞 불그릇과 촛불'],
  ['ossuary_now', '오늘 밤 납골당 — 찬 빛 아래의 창백한 불'],
  ['tower_brazier', '종탑 — 화로'],
  ['slice0_brazier', '시범 구간 — 화로'],
];
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face { font-family: K; src: url('${F}noto-sans-kr.woff2'); } @font-face { font-family: K; src: url('${F}noto-sans-kr-ext.woff2'); unicode-range: U+AC00-D7A3; }
body { margin: 0; width: 2000px; background: #12141a; color: #e9e2d2; font: 20px/1.45 K, sans-serif; }
.wrap { padding: 28px 30px 34px; } h1 { font-size: 38px; margin: 0 0 6px; color: #f4e7c4; } .sub { color: #b9b2a2; margin-bottom: 14px; }
h2 { font-size: 27px; margin: 26px 0 10px; color: #e8c98a; border-bottom: 2px solid #3a3f4d; padding-bottom: 4px; }
.grid { display: flex; flex-wrap: wrap; gap: 14px 12px; } .two { display: flex; gap: 4px; } img { border-radius: 4px; display: block; }
.tagbox { position: relative; } .tg { position: absolute; left: 8px; top: 8px; font-size: 19px; padding: 1px 10px; border-radius: 4px; color: #fff; } .old { background: #7a3b30cc; } .new { background: #2f7a4acc; }
.cap { font-size: 18px; color: #d8d0c0; margin-top: 3px; } .miss { background: #2a2030; color: #a88; font-size: 14px; }
.note { margin-top: 16px; padding: 12px 16px; background: #1c2029; border-left: 5px solid #8a6a3a; font-size: 20px; } .ok { border-left-color: #4f9a6a; } .weak { border-left-color: #b5533c; }
</style></head><body><div class="wrap">
<h1>불 다시 만들기 — 물방울 줄에서 타오르는 불로</h1>
<div class="sub">폴드를 편 화면 크기로 게임 카메라에서 찍은 그대로입니다 (왼쪽 「전」 = 지금 깔려 있는 앱의 불, 오른쪽 「후」 = 새 불). 멈춘 그림이라 일렁임은 2번의 여섯 장으로 보여 드립니다. 실제 기기의 부드러움은 기기에서만 알 수 있습니다.</div>

<h2>1. 불 자리 여덟 곳 — 전과 후</h2>
<div class="grid">${SPOTS.map(([n, cap]) => pair(n, 478, cap)).join('')}</div>

<h2>2. 담 위의 큰불이 움직이는 모습 — 0.1초 간격 여섯 장</h2>
<div class="grid">${[0, 1, 2, 3, 4, 5].map((k) => `<div style="width:314px">${img(`strip/strip_esh_roof_${k}.png`, 314)}</div>`).join('')}</div>
<div class="cap">불길 그림 16장(타오르는 불) + 8장(떨어져 나가는 불꼬리)을 불 조각마다 다른 장부터 돌려 가며 겹칩니다. 밑동은 희고 노랗게, 끝은 짙은 주황으로, 위로 불티와 검은 연기가 오릅니다.</div>

<h2>3. 가까이 — 촛불과 화로</h2>
<div class="grid">
<div style="width:960px"><div class="two"><div class="tagbox">${img('close_before/candles.png', 478, 366)}<span class="tg old">전</span></div><div class="tagbox">${img('close_after/candles.png', 478, 366)}<span class="tg new">후</span></div></div><div class="cap">촛불: 납작한 세모 대신 심지마다 작은 불꽃이 일렁이고 둘레에 옅은 빛무리</div></div>
<div style="width:960px"><div class="two"><div class="tagbox">${img('close_before/brazier_close.png', 478, 366)}<span class="tg old">전</span></div><div class="tagbox">${img('close_after/brazier_close.png', 478, 366)}<span class="tg new">후</span></div></div><div class="cap">화로: 그릇 속의 각진 노란 조각을 없애고 붉게 단 숯 더미 위에서 불이 탑니다</div></div>
</div>
<div class="note ok">${N.numbers}</div>
<div class="note weak">아직 약한 것: ${N.weak}</div>
</div></body></html>`;
fs.writeFileSync(HTML, html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto('file://' + HTML); await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT, fullPage: true });
  console.log('wrote', OUT, JSON.stringify(await page.evaluate(() => [document.body.scrollWidth, document.body.scrollHeight])));
} finally { await browser.close(); }
