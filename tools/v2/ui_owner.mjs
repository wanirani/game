// UI lane: one picture for the owner, built from the captures of tools/v2/ui_shot.mjs.
//   node tools/v2/ui_owner.mjs [dir=/tmp/claude-0/v2/ui/final] [out=/tmp/claude-0/v2/owner_ui3.png]
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = process.argv[2] || '/tmp/claude-0/v2/ui/final', out = process.argv[3] || '/tmp/claude-0/v2/owner_ui3.png';
const tmp = '/tmp/claude-0/v2/ui/owner_tmp'; mkdirSync(tmp, { recursive: true });
const fonts = 'file://' + resolve('assets/fonts');
const css = `
@font-face{font-family:"Noto Sans KR";src:url("${fonts}/noto-sans-kr.woff2") format("woff2");font-weight:400 900}
@font-face{font-family:"Noto Sans KR Ext";src:url("${fonts}/noto-sans-kr-ext.woff2") format("woff2");font-weight:400 900;unicode-range:U+AC00-D7A3}
@font-face{font-family:"Hahmlet";src:url("${fonts}/hahmlet.woff2") format("woff2");font-weight:600 900}
@font-face{font-family:"Hahmlet Ext";src:url("${fonts}/hahmlet-ext.woff2") format("woff2");font-weight:600 900;unicode-range:U+AC00-D7A3}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0e101a;color:#f3f0e8;font-family:"Noto Sans KR","Noto Sans KR Ext",sans-serif;padding:36px;width:2400px}
h1{font:800 50px "Hahmlet","Hahmlet Ext",serif;letter-spacing:.04em}
h1 small{font:600 24px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#b9b6c4;margin-left:18px;letter-spacing:0}
.desc{font-size:24px;line-height:1.6;color:#dcd8e4;margin:10px 0 24px}
.cap{font:700 22px "Noto Sans KR","Noto Sans KR Ext",sans-serif;color:#ecd49a;margin:8px 0 24px}
.cap span{font-weight:500;color:#b9b6c4;margin-left:10px}
img{display:block;width:100%;border-radius:8px;box-shadow:0 0 0 1px rgba(255,255,255,.16)}
.r{display:grid;column-gap:28px}
.r2{grid-template-columns:1fr 1fr}.r3{grid-template-columns:1fr 1fr 1fr}
.zoom{height:640px;overflow:hidden;border-radius:8px;box-shadow:0 0 0 1px rgba(255,255,255,.16);position:relative}
.zoom img{position:absolute;width:auto;border-radius:0;box-shadow:none}
`;
const img = (n) => `file://${dir}/${n}.jpg`;
const body = `<h1>세공한 유리<small>3D 판의 진짜 인터페이스 — 맑은 유리 단추 · 은 세공과 수정으로 새긴 전용 아이콘 · 단추 아래 이름표 · 붓 숫자</small></h1>
<p class="desc">단추는 배경이 그대로 비치는 맑은 유리입니다(실시간 흐림 효과를 쓰지 않아 폴드에서 끊기지 않습니다). 아이콘 26개는 이번에 새로 그린 한 벌이고, 체력은 제단의 촛불, 그 아래가 울림 눈금과 달의 칸입니다.</p>
<img src="${img('fold_open_play_bright')}"><p class="cap">폴드 펼침 · 싸움 화면 (밝은 가로등 거리)<span>왼쪽 위: 밤 표시 · 촛불 · 울림 · 달 / 오른쪽 아래: 공격 · 점프 · 구르기 · 솜씨 · 종 · 다음 적 / 붓 숫자와 「튕겨냄」</span></p>
<div class="r r2"><div><img src="${img('fold_open_boss_dark')}"><p class="cap">폴드 · 보스전 (어두운 골목)<span>보스 이름과 막대, 촛불 여덟 자루</span></p></div>
<div><div class="zoom"><img src="${img('fold_open_states_yard')}" style="right:0;bottom:0;height:1512px"></div><p class="cap">단추를 가까이서 (폴드 실제 해상도)<span>솜씨 = 쉬는 중(부채꼴) · 종 = 길게 누르는 중(금빛 테) · 구르기 = 못 씀(흐림)</span></p></div></div>
<div class="r r2"><div><img src="${img('phone2_play_bright')}"><p class="cap">일반 휴대폰(가로) · 싸움 화면</p></div><div><img src="${img('phone2_dialog_dark')}"><p class="cap">일반 휴대폰 · 대화 창<span>초상 · 이름표 · 글자가 차례로 나타남</span></p></div></div>
<div class="r r2"><div><img src="${img('fold_open_night_bright')}"><p class="cap">폴드 · 「오늘 밤이 달라졌다」<span>촛불 열여섯 자루는 두 단으로, 그 밤은 붉은 달 표시</span></p></div><div><img src="${img('fold_open_pause_dark')}"><p class="cap">폴드 · 일시정지<span>이어 하기 · 설정 · 나가기</span></p></div></div>`;
const html = `<!doctype html><meta charset="utf-8"><style>${css}</style>${body}`;
writeFileSync(tmp + '/owner.html', html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 2400, height: 1200 }, deviceScaleFactor: 1 });
await page.goto('file://' + tmp + '/owner.html'); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('saved', out);
