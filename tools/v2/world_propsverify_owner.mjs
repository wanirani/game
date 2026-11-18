// PROPS-VERIFY owner sheet -> /tmp/claude-0/v2/owner_propsverify.png (Korean captions, the game's own fonts). The PROPS lane's sheet stays next to it
// (/tmp/claude-0/v2/owner_props.png). Inputs: the crops in /tmp/claude-0/v2/propsverify/owner/ (made from tools/v2/world_propsverify_shot.mjs captures).
//   node tools/v2/world_propsverify_owner.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const D = 'file:///tmp/claude-0/v2/propsverify/owner/', F = 'file:///home/user/game/assets/fonts/', OUT = '/tmp/claude-0/v2/owner_propsverify.png', HTML = '/tmp/claude-0/v2/propsverify/owner/owner.html';
const N = fs.existsSync('/tmp/claude-0/v2/propsverify/owner/numbers.json') ? JSON.parse(fs.readFileSync('/tmp/claude-0/v2/propsverify/owner/numbers.json', 'utf8')) : {};
const T = {
  title: '소품 · 벽 · 바닥 검수 결과 — 다른 눈으로 다시 본 것',
  sub: '폴드를 편 화면 크기로 게임 장면에서 찍었습니다. 만든 쪽의 그림(owner_props.png)은 대체로 본 그대로였고, 아래는 거기에 없던 것입니다. 부드러움(프레임)은 실제 기기에서만 알 수 있습니다.',
  fixed: '찾아서 고친 것 (왼쪽 전 · 오른쪽 후)',
  pairs: [
    ['lantern', '등불 기둥이 땅에서 한 뼘 떠 있었습니다 → 땅에 닿게 했습니다. 부딪히는 자리도 기둥 옆 빈 곳이 아니라 기둥에 맞췄습니다.'],
    ['cart', '수레 손잡이 사이가 밝은 종이처럼 보였습니다 → 사이를 그늘로 어둡게 해 두 자루로 읽히게 했습니다 (가까이서는 아직 밝습니다).'],
  ],
  fixedMore: '그림 없이 고친 것: 영웅이 수레 바퀴 · 통과 자루 묶음 · 화로 안으로 몸이 반쯤 들어가던 것을 막았습니다(부딪히는 상자를 보이는 크기에 맞춤).',
  left: '아직 남은 것',
  lefts: [
    ['left_angel', '시범 구간 뜰: 큰 천사상 뒤에 서면 영웅이 통째로 가려집니다 (전부터 있던 문제, 조금 줄었을 뿐).'],
    ['left_cart', '수레 손잡이는 가까이서 보면 납작한 쐐기 꼴입니다. 다시 만들거나 손잡이를 떼는 편이 낫습니다.'],
    ['left_fire', '불길은 움직이지 않는 각진 잎 모양입니다. 불티와 연기 효과가 얹혀야 합니다.'],
    ['left_plague_code', '손으로 지은 역병 기둥(광장 쪽)은 …'],
    ['left_plague_gen', '… 생성한 역병 기둥(외곽) 옆에서 훨씬 단순해 보입니다. 납골 벽감 · 가판대 · 묘지 문도 같습니다.'],
    ['left_well', '우물은 붉은 밤의 광장에서 이끼 빛이 조금 튑니다 (그 밤의 푸른 빛에서는 괜찮습니다).'],
  ],
  nums: '숫자 (폴드 · 헤드리스): ' + (N.line ?? ''),
  verdict: '판정: 고친 뒤 통과. 생성 소품 18종은 방향 · 크기 · 밝기가 두 밤 모두에서 장면에 어울리고, 바꾼 표면 여섯 장은 이음매나 큰 되풀이가 보이지 않으며 벽이 밤에 빛나지 않습니다.',
};
const img = (n, w) => `<img src="${D}${n}.jpg" style="width:${w}px">`;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face { font-family: K; src: url('${F}noto-sans-kr.woff2'); } @font-face { font-family: K; src: url('${F}noto-sans-kr-ext.woff2'); unicode-range: U+AC00-D7A3; }
body { margin: 0; width: 2000px; background: #12141a; color: #e9e2d2; font: 20px/1.45 K, sans-serif; }
.wrap { padding: 28px 30px 34px; } h1 { font-size: 38px; margin: 0 0 6px; color: #f4e7c4; } .sub { color: #b9b2a2; margin-bottom: 18px; }
h2 { font-size: 27px; margin: 26px 0 10px; color: #e8c98a; border-bottom: 2px solid #3a3f4d; padding-bottom: 4px; }
.grid { display: flex; flex-wrap: wrap; gap: 14px 20px; } .pair { width: 960px; } .two { display: flex; gap: 4px; } img { border-radius: 4px; display: block; }
.cell { width: 632px; } .cap { font-size: 19px; color: #d8d0c0; margin-top: 3px; }
.note { margin-top: 18px; padding: 12px 16px; background: #1c2029; border-left: 5px solid #8a6a3a; font-size: 20px; } .ok { border-left-color: #4f9a6a; }
</style></head><body><div class="wrap"><h1>${T.title}</h1><div class="sub">${T.sub}</div>
<h2>${T.fixed}</h2><div class="grid">${T.pairs.map(([n, cap]) => `<div class="pair"><div class="two">${img(n + '_before', 478)}${img(n + '_after', 478)}</div><div class="cap">${cap}</div></div>`).join('')}</div>
<div class="note">${T.fixedMore}</div>
<h2>${T.left}</h2><div class="grid">${T.lefts.map(([n, cap]) => `<div class="cell">${img(n, 632)}<div class="cap">${cap}</div></div>`).join('')}</div>
<div class="note">${T.nums}</div><div class="note ok">${T.verdict}</div></div></body></html>`;
fs.writeFileSync(HTML, html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto('file://' + HTML); await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT, fullPage: true });
  console.log('wrote', OUT, JSON.stringify(await page.evaluate(() => [document.body.scrollWidth, document.body.scrollHeight])));
} finally { await browser.close(); }
