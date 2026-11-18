// PROPS lane owner sheet -> /tmp/claude-0/v2/owner_props.png (about 2000 px wide, Korean captions, the game's own fonts).
//   node tools/v2/world_props_owner.mjs [--check 1]   (--check: only list caption glyphs the fonts do not have)
// Inputs: captures of tools/v2/world_props_shot.mjs — before: /tmp/claude-0/v2/props/before (old pack, old textures), /tmp/claude-0/v2/props/tb (walls before),
// after: /tmp/claude-0/v2/props/after (the shipped tree).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const B = 'file:///tmp/claude-0/v2/props/before/', A = 'file:///tmp/claude-0/v2/props/after/', TB = 'file:///tmp/claude-0/v2/props/tb/';
const F = 'file:///home/user/game/assets/fonts/', OUT = '/tmp/claude-0/v2/owner_props.png', HTML = '/tmp/claude-0/v2/props/owner.html';
const T = {
  title: '소품과 벽 · 바닥 — 생성한 입체 모델과 그린 표면으로 바꾼 결과',
  sub: '폴드를 편 화면 크기로 게임 장면에서 그대로 찍었습니다. 왼쪽이 전, 오른쪽이 후입니다. 부드러움(프레임)은 실제 기기에서만 알 수 있어 여기서는 재지 못했습니다.',
  props: '바꾼 소품 — 영웅 옆에서 (왼쪽 전 · 오른쪽 후)',
  pairs: [
    ['angel', '우는 천사상 · 등불 기둥 · 비석 (안개의 묘지)', 0.45, 0.5, 2.6],
    ['s0_angel', '천사상 가까이 (시범 구간 뜰)', 0.43, 0.6, 2.3],
    ['gargoyle', '가고일 · 돌 십자가 (영묘는 손으로 지은 것을 그대로 둠)', 0.45, 0.58, 2.4],
    ['s0_gargoyle', '가고일 · 화로 (시범 구간 마당)', 0.37, 0.45, 2.3],
    ['bell', '큰 종 · 가고일 · 천사상 (성당 앞)', 0.6, 0.63, 2.4],
    ['brazier', '화로 · 가고일 (성당 문 앞)', 0.48, 0.68, 2.4],
    ['coffin', '관 · 비석 (묘지 안쪽)', 0.52, 0.55, 2.6],
    ['chapel', '작은 무덤 예배당 · 돌 십자가 · 비석 (예배당은 새로 놓음)', 0.45, 0.5, 2.2],
    ['cart', '수레 · 꺼진 등불 기둥 · 통과 자루 묶음 (에슈빌 외곽)', 0.3, 0.6, 2.3],
    ['goods', '통 · 상자 · 자루 묶음 (통과 상자 대신)', 0.36, 0.62, 2.6],
    ['well', '우물 (광장)', 0.44, 0.55, 2.6],
    ['plaguepost', '역병 기둥 (그 밤)', 0.38, 0.58, 2.4],
    ['past_lantern', '등불 기둥 · 수레 (그 밤)', 0.38, 0.58, 2.4],
    ['lanternpost', '묘지 문 앞 등불 기둥 (문은 손으로 지은 것을 그대로 둠)', 0.52, 0.56, 2.0],
    ['wreck', '불탄 잔해와 불길 (잔해는 손으로 지은 것 · 불길과 잉걸불만 바꿈)', 0.3, 0.6, 2.4],
    ['fire', '화로와 그 불길 (에슈빌 큰길)', 0.6, 0.5, 2.4],
  ],
  wide: '넓게 본 화면 — 지역마다 세 곳 (후)',
  wideRows: [['에슈빌 오늘 밤', 'w_esh_now_1', 'w_esh_now_2', 'w_esh_now_3'], ['에슈빌 그 밤', 'w_esh_past_1', 'w_esh_past_2', 'w_esh_past_3'], ['안개의 묘지 오늘 밤', 'w_grv_now_1', 'w_grv_now_2', 'w_grv_now_3'], ['안개의 묘지 그 밤', 'w_grv_past_1', 'w_grv_past_2', 'w_grv_past_3'], ['시범 구간', 'w_s0_1', 'w_s0_2', 'w_s0_3']],
  tex: '벽과 바닥 — 그린 표면으로 바꾼 여섯 가지 (왼쪽 전 · 오른쪽 후)',
  texPairs: [
    ['t_plaster', TB, '회벽 · 돌기와 지붕 · 초가 지붕 (에슈빌 그 밤)', 0.45, 0.3, 1.7],
    ['t_ashlar', TB, '다듬은 돌벽 · 판석 바닥 (성당 앞)', 0.5, 0.45, 1.7],
    ['t_slate', TB, '돌기와 지붕 · 다듬은 돌벽 (에슈빌 큰길)', 0.5, 0.3, 1.7],
    ['t_plaster', TB, '회벽과 돌벽 가까이 (에슈빌 그 밤)', 0.3, 0.45, 3.0],
    ['t_rubble2', TB, '막돌 담 (묘지 가는 길 — 무늬가 크게 되풀이되던 곳)', 0.62, 0.45, 1.7],
    ['w_esh_past_1', B, '초가 지붕 · 회벽 (그 밤의 큰길)', 0.4, 0.25, 1.8],
  ],
  kept: '손으로 지은 것을 그대로 둔 것: 묘지 쇠문(생성 모델은 창살이 뭉개짐 · 문 사이로 걸어 들어가야 함), 납골 벽감(해골 아치가 뭉개짐), 가판대(차양과 물건이 뭉개짐), 불탄 잔해(게임 크기에서 밝은 덩어리로 보임), 영묘(납골당 들머리 · 더 크고 반듯함), 영웅이 뒤로 지나가는 자리의 등불 기둥 · 역병 기둥(굵은 생성 기둥이 영웅을 가림). 조약돌 · 흙길 · 묘지 흙은 새 그림이 더 낫지 않아 그대로 뒀습니다.',
  weak: '아직 약한 곳: 생성 모델은 가까이서 보면 모서리가 조금 울퉁불퉁합니다(수레 손잡이, 우물 지붕, 화로 다리). 불길은 움직이지 않는 그림이라 효과 구역의 불티 · 연기가 얹혀야 살아납니다. 소품 그림 한 장이 커져서 그래픽 메모리가 지역마다 약 9 MB 늘었습니다. 에슈빌은 정적 삼각형이 검사 상한(35,000)에 300–570 만 남아 있어 소품을 더 놓기 어렵습니다. 화로는 전보다 큽니다. 손으로 지은 채 남은 납골 벽감 · 가판대 · 묘지 문은 새 소품 옆에서 더 단순해 보입니다.',
};
if (process.argv.includes('--check')) {
  const all = [...new Set(JSON.stringify(T))].join('');
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
// a window of the capture centred on (cx, cy), zoomed
const win = (src, cx, cy, zoom, w, h) => `<div class="im" style="width:${w}px;height:${h}px;background-image:url('${src}');background-size:${zoom * 100}% auto;background-position:${((cx * zoom - 0.5) / (zoom - 1 || 1)) * 100}% ${((cy * zoom * (w * 0.756 / h) - 0.5) / ((zoom * (w * 0.756 / h)) - 1 || 1)) * 100}%"></div>`;
const exists = (u) => fs.existsSync(u.replace('file://', ''));
const pair = (name, before, cap, cx, cy, zoom, w = 470, h = 390) => `<div class="pair"><div class="two">${exists(before + name + '.png') ? win(before + name + '.png', cx, cy, zoom, w, h) : `<div class="im none" style="width:${w}px;height:${h}px">새로 놓은 것 · 전 사진 없음</div>`}${win(A + name + '.png', cx, cy, zoom, w, h)}</div><div class="cap">${cap}</div></div>`;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face { font-family: K; src: url('${F}noto-sans-kr.woff2'); } @font-face { font-family: K; src: url('${F}noto-sans-kr-ext.woff2'); unicode-range: U+AC00-D7A3; }
body { margin: 0; width: 2000px; background: #12141a; color: #e9e2d2; font: 20px/1.45 K, sans-serif; }
.wrap { padding: 28px 30px 34px; } h1 { font-size: 38px; margin: 0 0 6px; color: #f4e7c4; } .sub { color: #b9b2a2; margin-bottom: 18px; }
h2 { font-size: 27px; margin: 26px 0 10px; color: #e8c98a; border-bottom: 2px solid #3a3f4d; padding-bottom: 4px; }
.grid { display: flex; flex-wrap: wrap; gap: 14px 20px; } .pair { width: 960px; } .two { display: flex; gap: 4px; } .im { background-repeat: no-repeat; border-radius: 4px; background-color: #000; } .none { display: flex; align-items: center; justify-content: center; color: #777; }
.cap { font-size: 19px; color: #d8d0c0; margin-top: 3px; } .row { display: flex; gap: 10px; margin-bottom: 4px; } .row img { width: 640px; border-radius: 4px; display: block; } .rcap { font-size: 20px; color: #e8c98a; margin: 10px 0 4px; }
.note { margin-top: 18px; padding: 12px 16px; background: #1c2029; border-left: 5px solid #8a6a3a; font-size: 20px; } .weak { border-left-color: #b0485a; }
</style></head><body><div class="wrap"><h1>${T.title}</h1><div class="sub">${T.sub}</div>
<h2>${T.props}</h2><div class="grid">${T.pairs.map(([n, cap, cx, cy, z]) => pair(n, B, cap, cx, cy, z)).join('')}</div>
<h2>${T.tex}</h2><div class="grid">${T.texPairs.map(([n, b, cap, cx, cy, z]) => pair(n, b, cap, cx, cy, z)).join('')}</div>
<h2>${T.wide}</h2>${T.wideRows.map(([cap, ...ns]) => `<div class="rcap">${cap}</div><div class="row">${ns.map((n) => `<img src="${A}${n}.png">`).join('')}</div>`).join('')}
<div class="note">${T.kept}</div><div class="note weak">${T.weak}</div></div></body></html>`;
fs.writeFileSync(HTML, html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto('file://' + HTML); await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT, fullPage: true });
  console.log('wrote', OUT, JSON.stringify(await page.evaluate(() => [document.body.scrollWidth, document.body.scrollHeight])));
} finally { await browser.close(); }
