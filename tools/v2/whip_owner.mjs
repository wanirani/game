// WHIP lane — the owner picture /tmp/claude-0/v2/owner_whip.png (about 2000 px wide, Korean captions): press timing before / after
// (from <out>/press.json of tools/v2/whip_press.mjs), the hit-feel table, the roll table, the garbage numbers. Text and tables only -
// no frame-by-frame captures of the lash were made in this round (said on the picture).
//   node tools/v2/whip_owner.mjs [--out /tmp/claude-0/v2/whip]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : '/tmp/claude-0/v2/whip';
const P = JSON.parse(fs.readFileSync(`${OUT}/press.json`, 'utf8')), B = P.rulesBefore, A = P.rulesAfter;
const cells = (arr, okKey, wKey) => arr.map((q) => `<td class="${q[okKey] ? 'ok' : 'no'}">${q[okKey] ? q[wKey] : '×'}</td>`).join('');
const row = (label, arr, okKey, wKey) => `<tr><th>${label}</th>${cells(arr, okKey, wKey)}</tr>`;
const head = (arr, k) => `<tr><th></th>${arr.map((q) => `<td class="h">${q[k]}</td>`).join('')}</tr>`;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#14161d;color:#e9e6dc;font-family:'WenQuanYi Zen Hei','Noto Sans CJK KR',sans-serif;width:2000px}
.w{padding:44px 56px}h1{font-size:44px;margin:0 0 6px;color:#ffd98a}h2{font-size:30px;margin:34px 0 10px;color:#ffd98a}p{font-size:22px;line-height:1.5;margin:6px 0;color:#cfcabb}
table{border-collapse:collapse;margin:8px 0 4px}td,th{font-size:20px;padding:6px 9px;border:1px solid #333a4a;text-align:center}th{text-align:left;color:#b9c4dc;font-weight:normal;background:#1b1f2a}
td.ok{background:#1f4a35;color:#bff5d2}td.no{background:#4a2326;color:#ff9a9a}td.h{background:#1b1f2a;color:#8f9ab3}
.g{display:grid;grid-template-columns:1fr 1fr;gap:28px}.box{background:#1a1d27;border:1px solid #2c3242;border-radius:10px;padding:18px 22px}
.bar{display:inline-block;height:18px;background:#e0b25a;vertical-align:middle;border-radius:3px}.bar.b{background:#5a7fd0}.small{font-size:18px;color:#9aa3b8}.warn{color:#ffb38a}
</style><div class="w">
<h1>채찍 손맛 · 누름 · 쓰레기 — 11월 19일</h1>
<p>폴드에서 「단추가 가끔 먹지 않는다」 · 「때린 느낌이 한 박자 어긋난다」를 고친 판. 숫자는 모두 도구로 잰 것이고, 재지 못한 것은 그렇다고 적었다.</p>

<h2>1. 누른 단추가 버려지지 않는다 (입력 기억 0.18초)</h2>
<p>초록 = 눌림이 살아서 동작이 나간다(숫자 = 누른 뒤 몇 틱 뒤에 나가는가, 1틱 = 1/60초) · 빨강 × = 버려진다. 위 줄이 고치기 전, 아래 줄이 지금.</p>
<div class="g"><div class="box"><p>공격을 누르고 d틱 뒤에 <b>솜씨(채찍 걸기)</b>를 누름 — d = 0 … 14</p><table>${head(A.skill, 'd')}${row('전', B.skill, 'thrown', 'wait')}${row('지금', A.skill, 'thrown', 'wait')}</table>
<p class="small">전: 15번 가운데 ${B.skill.filter((q) => q.thrown).length}번만 나감 → 지금 ${A.skill.filter((q) => q.thrown).length}번</p></div>
<div class="box"><p>공격을 누르고 d틱 뒤에 <b>구르기</b>를 누름 (스틱을 민 채) — d = 0 … 14</p><table>${head(A.roll, 'd')}${row('전', B.roll, 'rolled', 'wait')}${row('지금', A.roll, 'rolled', 'wait')}</table>
<p class="small">전: ${B.roll.filter((q) => q.rolled).length}번 → 지금 ${A.roll.filter((q) => q.rolled).length}번</p></div>
<div class="box"><p>셋째 타가 끝나기 k틱 전에 <b>공격</b>을 누름 — k = 1 … 16 (숫자 0 = 셋째 타가 끝나는 바로 그 틱에 새 연타)</p><table>${head(A.c3, 'k')}${row('전', B.c3, 'again', 'afterEnd')}${row('지금', A.c3, 'again', 'afterEnd')}</table>
<p class="small">전: ${B.c3.filter((q) => q.again).length}번 → 지금 ${A.c3.filter((q) => q.again).length}번</p></div>
<div class="box"><p>구르기 시작 d틱 뒤에 <b>점프</b>를 누름 — d = 6, 8 … 20 (구르기는 21틱)</p><table>${head(A.jump, 'd')}${row('전', B.jump, 'jumped', 'afterRoll')}${row('지금', A.jump, 'jumped', 'afterRoll')}</table>
<p class="small">전: ${B.jump.filter((q) => q.jumped).length}번 → 지금 ${A.jump.filter((q) => q.jumped).length}번 · 묘지의 고리 밑에서 무덤지기에게 맞는 중에도 솜씨는 첫째나 둘째 누름에 나간다(8번 재서 8번)</p></div></div>
<p>구르기의 무적 시간 0.26초 → <b>0.34초</b>: 유령의 덮침 · 주검의 붙잡기(판정 0.30초) · 여왕의 비명(0.25초)을 판정 0.1초 전부터 굴러도 맞지 않는다. 1,736번 굴려서 맞은 횟수: 비명 80 → 0 · 여왕의 물결 24 → 0 · 박쥐 7 → 0 · 유령 4 → 0 · 주검 2 → 0.</p>

<h2>2. 맞는 순간이 한 프레임에 모인다</h2>
<p>끈이 적에게 닿은 그림 · 불티 · 피해 숫자 · 움찔 · 화면 멈춤 · 소리 · 진동이 <b>같은 프레임</b>에 나온다 (60 Hz · 120 Hz 모두, 45번의 타격을 재서 어긋남 0프레임). 고치기 전에는 끈이 한 틱 늦게 그려져 불티 · 숫자가 끈보다 먼저(120 Hz 에서 두 프레임) 보였다 <span class="small">(전의 값은 코드를 읽어 따진 것 — 도구로 재지는 않았다)</span>.</p>
<table><tr><th>기술</th><th>세기</th><th>화면 멈춤</th><th>흔들림</th><th>진동(폰)</th><th>소리 겹</th></tr>
<tr><th>연타 1</th><td>약 (전: 중)</td><td style="text-align:left"><span class="bar" style="width:${43 * 3}px"></span> 0.043초 · 3틱</td><td style="text-align:left"><span class="bar b" style="width:${0.10 * 600}px"></span> 0.10</td><td>5 ms (전: 없음)</td><td>3</td></tr>
<tr><th>연타 2</th><td>중</td><td style="text-align:left"><span class="bar" style="width:${63 * 3}px"></span> 0.063초 · 4틱</td><td style="text-align:left"><span class="bar b" style="width:${0.16 * 600}px"></span> 0.16</td><td>8 ms</td><td>6</td></tr>
<tr><th>훑기 · 내려베기</th><td>강</td><td style="text-align:left"><span class="bar" style="width:${95 * 3}px"></span> 0.095초 · 6틱</td><td style="text-align:left"><span class="bar b" style="width:${0.26 * 600}px"></span> 0.26</td><td>15 ms</td><td>7</td></tr>
<tr><th>연타 3 · 모아 휘감기</th><td>끝 (휘감기 전: 강)</td><td style="text-align:left"><span class="bar" style="width:${126 * 3}px"></span> 0.126초 · 8틱</td><td style="text-align:left"><span class="bar b" style="width:${0.36 * 600}px"></span> 0.36</td><td>18-22-30 ms</td><td>8</td></tr></table>
<p>한 번에 여럿을 치면 여럿으로 들린다: 해골 셋 = 소리 셋(0 / 24 / 48 ms 간격), 항아리 셋 = 쨍그랑 셋(0 / 28 / 56 ms). 전에는 항아리 셋이 하나로 들릴 때가 있었다.</p>

<h2>3. 프레임마다 버리는 쓰레기</h2>
<table><tr><th>상황</th><th>전 (지난 검증의 표본값)</th><th>지금 (이 기계에서 잰 표본값)</th><th>120 프레임이면 1초에</th></tr>
<tr><th>서 있을 때</th><td>77 KB / 프레임 (채찍 31.8 KB)</td><td>54 KB / 프레임 (채찍 9–10 KB)</td><td>9.2 MB → 6.5 MB</td></tr>
<tr><th>싸울 때</th><td>45 KB / 프레임 (채찍 16.3 KB)</td><td>38 KB / 프레임 (채찍 8.1 KB)</td><td>5.4 MB → 4.6 MB</td></tr></table>
<p>채찍 코드가 틱마다 부르던 느린 계산(Math.hypot 40곳)을 없앴다. 끈의 모양은 전과 숫자 하나까지 같다(3,000틱 비교). <span class="warn">목표(1 KB 아래)에는 한참 못 미친다</span> — 바닥 스티커(6.8–7.5 KB) · 끈 메시(4–9 KB) · 등불 빛(2.6–3.4 KB)이 남았다. 「전」 값은 지난 검증이 적어 둔 것이고 이 기계에서 다시 재지 못했다.</p>

<h2>아직 약한 것</h2>
<p class="warn">끈 끝 궤적 띠의 꺾임 · 셋째 타에서 끈이 손보다 한 프레임 늦는 것 · 옆이나 뒤의 적에게 끝이 한 틱에 건너뛰는 것은 손대지 못했다(그래서 셋째 타 · 훑기의 프레임별 전후 그림도 없다). 건널 수 없을 때의 둔한 종도 그대로다. 쓰레기는 조금만 줄었다.</p>
</div>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 1 })).newPage();
await page.setContent(html); await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/claude-0/v2/owner_whip.png', fullPage: true });
await browser.close();
console.log('wrote /tmp/claude-0/v2/owner_whip.png');
