// WORLD-VERIFY owner sheet -> /tmp/claude-0/v2/owner_world.png (about 2000 px wide, Korean captions, the game's own fonts).
//   node tools/v2/world_verify_owner.mjs [--check 1]   (--check: only list caption glyphs the fonts do not have)
// Inputs: captures of tools/v2/world_verify_shot.mjs (/tmp/claude-0/v2/worldverify/shots), the earlier review's test-route captures
// (/tmp/claude-0/v2/envverify/cmp) and the lane's own sheet from before this review (/tmp/claude-0/v2/worldverify/owner_world_lane.png).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const S = 'file:///tmp/claude-0/v2/worldverify/shots/', OLD = 'file:///tmp/claude-0/v2/envverify/cmp/', LANE = 'file:///tmp/claude-0/v2/worldverify/owner_world_lane.png';
const F = 'file:///home/user/game/assets/fonts/', OUT = '/tmp/claude-0/v2/owner_world.png', HTML = '/tmp/claude-0/v2/worldverify/owner.html';
const T = {
  title: '배경 검수 — 에슈빌 · 안개의 묘지 (오늘 밤 / 그 밤)',
  sub: '폴드를 편 화면 크기로 찍은 것입니다. 적과 마을 사람은 아직 이 장면에 나오지 않습니다. 부드러움(프레임)은 실제 기기에서만 알 수 있어 여기서는 재지 못했습니다.',
  esh: '에슈빌 — 윗줄: 오늘 밤 (불타는 마을) · 아랫줄: 그 밤 (초가 지붕, 수확 가판대, 검은 깃발). 같은 자리, 같은 건물입니다.',
  eshCols: ['마을 외곽', '큰길 · 여관 앞', '광장 · 우물', '성당 앞'],
  grv: '안개의 묘지 — 윗줄: 오늘 밤 (안개, 차가운 등불) · 아랫줄: 그 밤 (따뜻한 등불, 묘지기 오두막)',
  grvCols: ['묘지 가는 길', '안쪽 문', '묘지 한가운데', '영묘 앞'],
  props: '새 입체 소품 — 게임 화면에서 그대로 잘라 낸 것 (납작한 그림판은 이제 없습니다)',
  propNames: ['우는 천사상', '가고일', '큰 종', '영묘 · 납골 벽감', '묘지 문 · 등불 기둥', '우물', '불탄 잔해 · 불', '고목', '가판대 · 수확물'],
  ba: '시범 구간의 약했던 곳 — 왼쪽: 전 · 오른쪽: 후',
  ba1a: '전: 천사상이 납작한 그림판', ba1b: '후: 입체 석상 (그림은 예전 것이 더 또렷합니다)',
  ba2a: '전: 자로 그은 흙 네모, 가는 난간, 그림판 가고일', ba2b: '후: 들쭉날쭉한 가장자리, 굵은 난간, 입체 가고일',
  fix: '이번 검수에서 고친 것 — 묘지 안쪽 담이 너무 높아 그 뒤에서 영웅이 보이지 않던 것',
  fixa: '전: 높은 담 (담 뒤 넓은 자리가 가려짐)', fixb: '후: 낮은 담과 쇠 난간 (묘지가 보임)', fixc: '남은 것: 오두막 바로 뒤에 서면 아직 가려짐',
  weak: '아직 약한 곳: 석상 · 가고일 · 고목은 코드로 빚은 것이라 가까이서 무르고 흐릿합니다 (유료 모델 생성이 거절됨). 불길은 세 가지 색의 뿔 모양입니다. 막돌 벽 무늬가 크게 되풀이됩니다. 큰길은 적이 없어도 그리기 호출이 37–39 로 예산(40)에 닿습니다.',
};
if (process.argv.includes('--check')) {
  const all = [...new Set(Object.values(T).flat().join(''))].join('');
  console.log(execFileSync('python3', ['-c', `
import sys
from fontTools.ttLib import TTFont
cm=set()
for n in ['noto-sans-kr','noto-sans-kr-ext']:
    cm|=set(TTFont('/home/user/game/assets/fonts/'+n+'.woff2').getBestCmap().keys())
miss=[c for c in sys.argv[1] if ord(c)>0x2000 and ord(c) not in cm]
print('missing glyphs:', ''.join(miss) or 'none')`, all]).toString());
  process.exit(0);
}
const img = (src, cap, crop) => `<figure>${crop ? `<div class="crop" style="background-image:url('${src}');background-size:${crop[2]}%;background-position:${crop[0]}% ${crop[1]}%"></div>` : `<img src="${src}">`}${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
const E = ['1_outskirts', '3_street_inn', '6_square_well', '8_church_front'], G = ['1_road', '3_gate', '4_field', '6_mausoleum'];
const PROPS = [   // [capture, x%, y%, zoom%]
  ['slice0_3_garden', 4, 78, 330], ['eshville_past_8_church_front', 18, 58, 380], ['eshville_now_x_bell_behind', 86, 52, 300], ['graveyard_past_6_mausoleum', 50, 12, 210],
  ['graveyard_past_3_gate', 50, 50, 230], ['eshville_now_6_square_well', 50, 74, 330], ['eshville_now_1_outskirts', 66, 62, 300], ['eshville_now_1_outskirts', 14, 50, 280], ['eshville_past_3_street_inn', 88, 62, 300],
];
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: K; src: url('${F}noto-sans-kr.woff2'); } @font-face { font-family: K; src: url('${F}noto-sans-kr-ext.woff2'); unicode-range: U+AC00-D7A3; }
@font-face { font-family: H; src: url('${F}hahmlet.woff2'); }
* { box-sizing: border-box; } body { margin: 0; width: 2000px; background: #14121a; color: #e8e2d6; font-family: K, sans-serif; padding: 26px 28px 30px; }
h1 { font: 700 40px H, K; margin: 0 0 6px; color: #f0d9a0; } p.sub { font-size: 19px; margin: 0 0 18px; color: #b9b2a6; }
h2 { font-size: 23px; margin: 22px 0 8px; color: #f0d9a0; font-weight: 700; border-left: 6px solid #a8323a; padding-left: 12px; }
.g4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .g9 { display: grid; grid-template-columns: repeat(9, 1fr); gap: 8px; } .g3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
figure { margin: 0; position: relative; background: #000; } img { width: 100%; display: block; } .crop { width: 100%; aspect-ratio: 1 / 1.15; background-repeat: no-repeat; }
figcaption { font-size: 17px; padding: 5px 8px 6px; background: #221f2a; color: #e8e2d6; } .cols { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 18px; color: #cfc8ba; margin-bottom: 4px; } .cols span { padding-left: 4px; }
.row { margin-bottom: 8px; } .weak { margin-top: 22px; font-size: 21px; line-height: 1.5; background: #2a1c20; border: 2px solid #a8323a; padding: 12px 16px; color: #f2e6d8; }
</style>
<h1>${T.title}</h1><p class="sub">${T.sub}</p>
<h2>${T.esh}</h2><div class="cols">${T.eshCols.map((c) => `<span>${c}</span>`).join('')}</div>
<div class="g4 row">${E.map((n) => img(`${S}eshville_now_${n}.png`)).join('')}</div><div class="g4">${E.map((n) => img(`${S}eshville_past_${n}.png`)).join('')}</div>
<h2>${T.grv}</h2><div class="cols">${T.grvCols.map((c) => `<span>${c}</span>`).join('')}</div>
<div class="g4 row">${G.map((n) => img(`${S}graveyard_now_${n}.png`)).join('')}</div><div class="g4">${G.map((n) => img(`${S}graveyard_past_${n}.png`)).join('')}</div>
<h2>${T.props}</h2><div class="g9">${PROPS.map((p, i) => img(`${S}${p[0]}.png`, T.propNames[i], [p[1], p[2], p[3]])).join('')}</div>
<h2>${T.ba}</h2><div class="g4">${img(`${OLD}c_5_stairs.png`, T.ba1a)}${img(`${S}slice0_c5_stairs.png`, T.ba1b)}${img(`${OLD}c_6_yard.png`, T.ba2a)}${img(`${S}slice0_c6_yard.png`, T.ba2b)}</div>
<h2>${T.fix}</h2><div class="g3">${img(LANE, T.fixa, [0, 61.2, 200])}${img(`${S}graveyard_now_4_field.png`, T.fixb)}${img(`${S}graveyard_past_x_hut_behind.png`, T.fixc)}</div>
<div class="weak">${T.weak}</div>`;
fs.writeFileSync(HTML, html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }), page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
await page.goto('file://' + HTML); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(600);
await page.screenshot({ path: OUT, fullPage: true });
const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
await browser.close();
console.log('wrote', OUT, size.join('x'));
