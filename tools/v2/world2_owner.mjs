// WORLD-2 owner sheet -> /tmp/claude-0/v2/owner_world2.png (about 2000 px wide, Korean captions, the game's own fonts).
// Inputs: /tmp/claude-0/v2/world2/owner/t/<name>.jpg - captures of scene v2c at Fold size made by tools/v2/world2_shot.mjs (spot list in docs/v2/ENV_KIT.md 18).
//   node tools/v2/world2_owner.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const D = 'file:///tmp/claude-0/v2/world2/owner/t/', F = 'file:///home/user/game/assets/fonts/', OUT = '/tmp/claude-0/v2/owner_world2.png', HTML = '/tmp/claude-0/v2/world2/owner/owner.html';
const img = (n, w) => `<img src="${D}${n}.jpg" style="width:${w}px">`;
const cell = (n, w, cap) => `<div style="width:${w}px">${img(n, w)}<div class="cap">${cap}</div></div>`;
const pair = (a, b, w, cap) => `<div style="width:${w * 2 + 4}px"><div class="two">${img(a, w)}${img(b, w)}</div><div class="cap">${cap}</div></div>`;
const ROOMS = [
  ['1', '납골당 어귀 — 곡하는 석상 둘, 길종. 오늘 밤은 뼈 더미와 안개'],
  ['2', '관의 복도 — 그 밤엔 새 관과 촛불, 오늘 밤은 백 년 치 관이 길을 막았습니다 (종으로 그 밤에 건너가 지나갑니다)'],
  ['3', '틈의 방 — 바닥이 갈라진 틈. 그 밤에 석상이나 나무 궤짝을 밀어 넣습니다'],
  ['4', '곡하는 방 — 제단. 오늘 밤 유령과 해골 술사가 깨어납니다'],
  ['5', '등불대의 방 — 등불대(세라가 서는 곳)'],
  ['6', '석관의 방 — 닳은 석관 셋'],
  ['7', '문 앞 — 불 그릇 기둥 둘과 낮은 난간이 맨 안의 문. 촛불 쉼터'],
  ['8', '맨 안 — 밴시 여왕과 싸우는 곳'],
  ['9', '종대의 회랑 — 조종을 거는 종대 넷, 봉한 문, 샹들리에 둘'],
];
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face { font-family: K; src: url('${F}noto-sans-kr.woff2'); } @font-face { font-family: K; src: url('${F}noto-sans-kr-ext.woff2'); unicode-range: U+AC00-D7A3; }
body { margin: 0; width: 2000px; background: #12141a; color: #e9e2d2; font: 20px/1.45 K, sans-serif; }
.wrap { padding: 28px 30px 34px; } h1 { font-size: 38px; margin: 0 0 6px; color: #f4e7c4; } .sub { color: #b9b2a2; margin-bottom: 14px; }
h2 { font-size: 27px; margin: 26px 0 10px; color: #e8c98a; border-bottom: 2px solid #3a3f4d; padding-bottom: 4px; }
.grid { display: flex; flex-wrap: wrap; gap: 14px 12px; } .two { display: flex; gap: 4px; } img { border-radius: 4px; display: block; }
.cap { font-size: 18px; color: #d8d0c0; margin-top: 3px; } .tag { color: #9fb6d8; }
.note { margin-top: 16px; padding: 12px 16px; background: #1c2029; border-left: 5px solid #8a6a3a; font-size: 20px; } .ok { border-left-color: #4f9a6a; } .weak { border-left-color: #b5533c; }
</style></head><body><div class="wrap">
<h1>종탑 · 배웅의 납골당 · 채찍 고리 · 이야기에 따라 바뀌는 지역</h1>
<div class="sub">폴드를 편 화면 크기로 게임 장면(시험 장면)에서 찍은 그대로입니다. 인물과 적은 이 시험 장면에 나오지 않습니다(자리만 정해 두었습니다). 부드러움(프레임)은 실제 기기에서만 알 수 있습니다.</div>

<h2>1. 종탑 오르기 — 문에서 종 아래까지 (다섯 층, 계단과 턱, 부서진 바닥은 뛰어넘기)</h2>
<div class="grid">
${cell('bt_0', 474, '① 문 안. 오른쪽 돌계단으로')}${cell('bt_1', 474, '② 1층. 가운데 부서진 틈을 뛰어 왼쪽 나무 계단으로')}${cell('bt_2', 474, '③ 2층. 들보에 매달린 박쥐 떼. 오른쪽 턱을 딛고 위로')}${cell('bt_3', 474, '④ 3층. 다시 틈을 뛰어 왼쪽 계단으로')}
${cell('bt_4', 474, '⑤ 4층. 틈 건너 오른쪽 턱으로')}${cell('bt_5', 474, '⑥ 종 아래. 큰 종과 참나무 틀, 화로 둘')}${cell('bt_6', 474, '⑦ 종 줄(붉은 손잡이). 엘리제가 서는 자리')}
<div style="width:474px" class="cap">떨어지면 바로 아래층에 내려앉습니다. 탑 어디서 떨어져도 세상 밖으로 빠지지 않습니다(검사: 252곳에서 떨어뜨려 252번 모두 바닥에 섬). 검사용 자동 걸음이 문에서 종 아래까지 뛰어넘기 7번으로, 한 번도 떨어지지 않고 올라갔습니다.</div>
</div>

<h2>2. 배웅의 납골당 — 같은 방을 두 번 봅니다 (왼쪽 오늘 밤 1797 · 오른쪽 그 밤 1697)</h2>
<div class="grid">${ROOMS.map(([k, cap]) => pair('on_' + k, 'op_' + k, 315, cap)).join('')}</div>

<h2>3. 틈의 선택이 오늘 밤에 남는 모습 (왼쪽 그 밤에 한 일 · 오른쪽 오늘 밤)</h2>
<div class="grid">${pair('op_3s', 'on_3s', 478, '석상을 밀어 넣으면: 돌은 백 년 뒤에도 그대로 — 오늘 밤에도 건널 수 있습니다')}${pair('op_3w', 'on_3w', 478, '나무 궤짝을 밀어 넣으면: 그 밤에는 건너지만 오늘 밤에는 썩어 무너져 있습니다')}</div>

<h2>4. 맨 안 — 밴시 여왕과 싸우는 곳 (평평하고 가로 1000 × 세로 700, 영웅을 가리는 기둥 없음)</h2>
<div class="grid">${cell('on_8', 962, '오늘 밤. 가운데 길종, 옆 벽에는 붙박이 벽기둥만 있습니다')}${cell('op_8', 962, '그 밤. 촛대와 샹들리에가 켜져 있습니다')}</div>

<h2>5. 안개의 묘지 깊은 곳 — 부서진 돌길, 채찍 고리, 길종을 걸기 전과 후</h2>
<div class="grid">
${cell('gp_stair', 474, '그 밤: 돌계단이 무너져 있고, 위쪽 턱 끝에 채찍 고리가 빛납니다')}${cell('gn_stair', 474, '오늘 밤(길종을 걸기 전): 똑같이 무너져 있습니다')}${cell('gp_top_hung', 474, '그 밤, 길종을 건 뒤: 납골당 앞 종대에 새 종')}${cell('gn_stair_hung', 474, '오늘 밤, 길종이 백 년 걸려 있던 뒤: 계단이 온전합니다')}
</div>

<h2>6. 새 소품 — 영웅 옆에서</h2>
<div class="grid">
${cell('pr_stall', 474, '가판대(새로 만든 모델)와 그 밤의 초가 지붕')}${cell('pr_cart', 474, '수레: 뭉개졌던 손잡이를 둥근 자루 둘로 다시 지음. 오른쪽은 불탄 잔해(새 모델)')}${cell('pr_tree', 474, '고목: 뿌리 위를 걸어 지나가지 않게 막음')}${cell('gn_top_hung', 474, '채찍 고리(푸른 빛)와 녹슨 길종, 납골당 문')}
</div>
<div class="note">납골당의 석관 · 쌓인 관 · 뼈 더미 · 해골 벽감 · 촛대 · 샹들리에 · 제단 · 곡하는 석상 · 납골당 문은 모두 새로 만든 입체 모델입니다(12종, 2번 그림에서 영웅 옆에 보입니다). 채찍 고리 · 길종 종대 · 종 줄은 코드로 지었습니다.</div>
<div class="note ok">숫자(헤드리스 측정): 에슈빌 큰길의 가장 무거운 화면에서 배경 그리기 33 → 30회(오늘 밤), 35 → 30회(그 밤). 안개의 묘지 18 → 15회, 종탑 14회, 납골당 최대 25회. 모든 지역이 화면당 정적 삼각형 35,000 이하. 그림 메모리는 지역마다 약 +10.7 MB(소품 그림판을 두 배로 키움).</div>
<div class="note weak">아직 약한 것: 묘지 문은 다시 만들지 못해 손으로 지은 그대로이고, 종탑의 「그 밤」 판은 없습니다. 불길은 여전히 움직이지 않는 잎 모양입니다. 채찍 고리는 이 시험 장면에 채찍이 없어 실제로 걸어 보지는 못했습니다(자리와 내려설 곳만 검사). 에슈빌은 삼각형 여유가 100개도 안 남았습니다.</div>
</div></body></html>`;
fs.writeFileSync(HTML, html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto('file://' + HTML); await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT, fullPage: true });
  console.log('wrote', OUT, JSON.stringify(await page.evaluate(() => [document.body.scrollWidth, document.body.scrollHeight])));
} finally { await browser.close(); }
