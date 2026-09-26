// 퍼펫 QA 검사대 구동: tools/puppet/review.html 에 셀 목록(spec)을 보내 PNG 와 구멍/이음선 분석을 받는다.
// node tools/puppet/review.mjs <plan.json|preset> <outDir> [--sheet cols] [--only-flagged]
//  preset: atk:<cls>:<wt>  (그 무기의 모든 기술 × 5프레임) · anims:<cls> (모든 비공격 동작 연속 프레임) · all (7직업 × 6무기 × 모든 기술, 구멍 통계만)
//  결과: <outDir>/NNN_<label>.png, <outDir>/report.json (셀별 holes/seam/ms), 페이지 오류 출력
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const planArg = argv[0], outDir = argv[1] || '/tmp/claude-0/puppet_review';
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
fs.mkdirSync(outDir, { recursive: true });
const KCLS = ['kael_hunter', 'kael_crusader', 'kael_stalker', 'kael_templar', 'kael_inquisitor', 'kael_bloodhunter', 'kael_nightraven'];
const WT = ['whip', 'sword', 'greatsword', 'dagger', 'gun', 'staff'];
const MK = { whip: ['g0', 'g1', 'g2', 'g3', 'a0', 'a1', 'up', 'down', 'crouch', 'dash', 'charge'], sword: ['g0', 'g1', 'g2', 'g3', 'a0', 'a1', 'a2', 'up', 'down', 'crouch', 'dash', 'charge'],
  greatsword: ['g0', 'g1', 'g2', 'a0', 'up', 'down', 'crouch', 'dash', 'charge'], dagger: ['g0', 'g1', 'g3', 'g4', 'a0', 'a1', 'a2', 'up', 'down', 'crouch', 'dash'],
  gun: ['g0', 'g1', 'g3', 'a0', 'a1', 'up', 'down', 'crouch', 'dash'], staff: ['g0', 'g1', 'g2', 'a0', 'up', 'down', 'crouch', 'dash', 'charge'] };
const FR = [0.6, 1.02, 1.5, 1.98, 2.4];
const ANIMS = [
  ['idle', {}], ['run', { anim: 'run', vx: 280, animate: 1 }], ['jump', { anim: 'jump', vy: -600, onGround: false }], ['fall', { anim: 'fall', vy: 500, onGround: false }],
  ['land', { anim: 'land', animT: 0.02 }], ['crouch', { anim: 'crouch' }], ['wall', { anim: 'wall', onGround: false, vy: 150 }],
  ['dash0', { anim: 'dash', animT: 0.02, vx: 650 }], ['dash1', { anim: 'dash', animT: 0.12, vx: 650 }], ['hurt', { anim: 'hurt', animT: 0.05, vx: -200 }],
  ['cast', { anim: 'cast', animT: 0.15 }], ['throw', { anim: 'throw', animT: 0.1 }], ['charge', { anim: 'charge', charging: 0.7 }],
  ...[0.05, 0.1, 0.16, 0.22, 0.3].map((t) => ['flip' + t, { anim: 'flip', animT: t, onGround: false, vy: -300 }]),
  ...[0.08, 0.2, 0.35, 0.5, 0.7, 1.4].map((t) => ['death' + t, { anim: 'death', animT: t, vx: -150 }]),
];
function preset(p) {
  const [kind, a, b] = p.split(':');
  const list = [];
  if (kind === 'atk') for (const mk of MK[b]) for (const f of FR) list.push({ cls: a, wt: b, mk, frac: f, label: `${a.slice(5)} ${b} ${mk} f${f}` });
  if (kind === 'anims') for (const [n, o] of ANIMS) list.push({ cls: a, ...o, label: `${a.slice(5)} ${n}` });
  if (kind === 'all') for (const cls of KCLS) for (const wt of WT) for (const mk of MK[wt]) for (const f of FR) list.push({ cls, wt, mk, frac: f, noPng: true, label: `${cls.slice(5)} ${wt} ${mk} f${f}` });
  if (kind === 'allanims') for (const cls of KCLS) for (const [n, o] of ANIMS) for (const wt of (b ? [b] : ['whip'])) list.push({ cls, wt, ...o, noPng: !a || a === '-' ? false : true, label: `${cls.slice(5)} ${wt} ${n}` });
  return list;
}
const plan = fs.existsSync(planArg) ? JSON.parse(fs.readFileSync(planArg, 'utf8')) : preset(planArg);
const port = 9800 + Math.floor(Math.random() * 150);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 300)); });
page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
await page.goto(`http://localhost:${port}/tools/puppet/review.html`);
await page.waitForFunction('window.__ready', null, { timeout: 30000 });
const report = [];
let i = 0;
for (const s of plan) {
  const r = await page.evaluate((s) => window.__api.render(s), s);
  const name = String(i).padStart(3, '0') + '_' + (s.label || 'cell').replace(/[^a-z0-9._-]+/gi, '_');
  if (r.url) fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(r.url.split(',')[1], 'base64'));
  report.push({ i, name, label: s.label, spec: s, an: r.an, joints: r.joints, ms: +r.ms.toFixed(3), fy: r.fy, fx: r.fx, sc: r.sc, pose: r.pose });
  i++;
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
// 관절 틈: 관절점·뼈 중간점 둘레 최소 알파 < 150
const jgap = report.filter((r) => r.joints && Object.values(r.joints).some((j) => j[2] < 150));
console.log(JSON.stringify({ cells: report.length, jointGaps: jgap.length, errs, top: jgap.slice(0, 60).map((r) => `${r.label}: ${Object.entries(r.joints).filter(([, j]) => j[2] < 150).map(([k, j]) => `${k}=${j[2]}@${j[0]},${j[1]}`).join(' ')}`) }, null, 1));
await browser.close(); srv.close();
