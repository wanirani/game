// CROSSING lane owner sheet -> /tmp/claude-0/v2/owner_cross.png (about 2000 px wide, Korean captions, the game's own fonts).
// Inputs (made by tools/v2/cross_shot.mjs at Fold size): /tmp/claude-0/v2/cross/own/{to_past,back_years,grave,refuse,before}/ (frames.json + png)
// and /tmp/claude-0/v2/cross/own/notes.json = { numbers: '...', weak: '...' } (two lines of text for the bottom).
//   node tools/v2/cross_owner.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const B = '/tmp/claude-0/v2/cross/own/', D = 'file://' + B, F = 'file:///home/user/game/assets/fonts/', OUT = '/tmp/claude-0/v2/owner_cross.png', HTML = B + 'owner.html';
const N = fs.existsSync(B + 'notes.json') ? JSON.parse(fs.readFileSync(B + 'notes.json', 'utf8')) : { numbers: '', weak: '' };
const frames = (d) => (fs.existsSync(B + d + '/frames.json') ? JSON.parse(fs.readFileSync(B + d + '/frames.json', 'utf8')).frames : []);
const KO = { before: '울리기 전', gather: '종빛이 모인다', ring: '종빛 고리가 세상을 지난다', passage: '시간이 흐른다', reveal: '고리가 열리며 건너편이 드러난다', land: '둘째 종 · 밤 표시가 뒤집힌다', glow: '남은 빛 · 단추가 돌아온다', after: '건넌 뒤', dull_a: '둔한 종 · 고리가 꺼진다', dull_b: '둔한 종 · 고리가 꺼진다', dull_c: '잿빛 연기', after_refusal: '아무것도 바뀌지 않았다', veil_up: '(전) 옅은 장막이 오른다', flat: '(전) 한 가지 색 · 단추는 그대로', veil_down: '(전) 장막이 걷힌다' };
/** pick n frames of a run, by label order */
const pick = (d, want) => { const fr = frames(d), out = []; for (const [label, k] of want) { const L = fr.filter((f) => f.label === label); if (L[k]) out.push(L[k]); } return out; };
const strip = (d, list, w) => `<div class="strip">${list.map((f) => `<div style="width:${w}px"><img src="${D}${d}/${f.file}" style="width:${w}px"><div class="cap">${KO[f.label] ?? f.label}${f.phase && f.t ? ` <span class="t">${f.t.toFixed(2)}초</span>` : ''}</div></div>`).join('')}</div>`;
const TEN = [['before', 0], ['ring', 0], ['ring', 1], ['ring', 2], ['passage', 1], ['passage', 2], ['passage', 3], ['reveal', 1], ['reveal', 3], ['land', 0]];
const TENY = [['before', 0], ['ring', 1], ['passage', 1], ['passage', 2], ['passage', 3], ['passage', 4], ['passage', 5], ['reveal', 1], ['reveal', 3], ['glow', 0]];
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face { font-family: K; src: url('${F}noto-sans-kr.woff2'); } @font-face { font-family: K; src: url('${F}noto-sans-kr-ext.woff2'); unicode-range: U+AC00-D7A3; }
body { margin: 0; width: 2000px; background: #12141a; color: #e9e2d2; font: 20px/1.45 K, sans-serif; }
.wrap { padding: 28px 30px 34px; } h1 { font-size: 38px; margin: 0 0 6px; color: #f4e7c4; } .sub { color: #b9b2a2; margin-bottom: 14px; }
h2 { font-size: 26px; margin: 24px 0 8px; color: #e8c98a; border-bottom: 2px solid #3a3f4d; padding-bottom: 4px; }
.strip { display: flex; gap: 5px; } img { border-radius: 3px; display: block; } .cap { font-size: 14.5px; color: #d8d0c0; margin-top: 2px; line-height: 1.25; } .t { color: #8f98ad; }
.note { margin-top: 14px; padding: 11px 16px; background: #1c2029; border-left: 5px solid #8a6a3a; font-size: 19px; } .ok { border-left-color: #4f9a6a; } .weak { border-left-color: #b5533c; }
</style></head><body><div class="wrap">
<h1>종을 울려 밤을 건너는 순간 — 흰 화면에서 한 장면으로</h1>
<div class="sub">폴드를 편 화면 크기로 게임 화면을 그대로 찍었습니다 (멈춘 그림 열 장씩). 소리와 진동, 실제 기기에서의 부드러움은 이 그림으로는 알 수 없습니다.</div>

<h2>1. 성당 종에서 1697년 그 밤으로 — 열 장</h2>
${strip('to_past', pick('to_past', TEN), 189)}

<h2>2. 오늘 밤으로 돌아올 때 — 「백 년이 흐르는 3초」 (밤 표시 구석에 해가 1697 → 1797 로 달립니다)</h2>
${strip('back_years', pick('back_years', TENY), 189)}

<h2>3. 같은 순간, 고치기 전 (지금 깔려 있는 앱) — 옅은 장막 · 한 가지 색 · 다시 장막</h2>
${strip('before', frames('before').slice(0, 10), 189)}

<h2>4. 묘지 길종에서 — 같은 틀</h2>
${strip('grave', pick('grave', TEN), 189)}

<h2>5. 건널 수 없을 때 — 둔한 종</h2>
${strip('refuse', frames('refuse'), 318)}

<div class="note ok">${N.numbers}</div>
<div class="note weak">${N.weak}</div>
</div></body></html>`;
fs.writeFileSync(HTML, html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 1 });
await page.goto('file://' + HTML); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log('wrote', OUT);
