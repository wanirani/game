// v2 fx — 소유자용 자료 (fxverify): node tools/v2/fx_owner.mjs [sheet|video|all]
//   sheet → /tmp/claude-0/v2/owner_fx.png   (타격 7종 + 휘두르기 · 마법 다섯 계열 · 궁극기, 한글 설명)
//   video → /tmp/claude-0/v2/owner_fx.webm  (콤보 → 마법 순회, 자막 포함, 8 MB 이하)
// 헤드리스 Chromium(SwiftShader)에서 프레임을 하나씩 찍는다 → 영상 속도는 기기 성능과 무관하다.
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const part = process.argv[2] || 'all', OUT = '/tmp/claude-0/v2', TMP = '/dev/shm/fxverify';
fs.mkdirSync(TMP, { recursive: true });
const port = 8950 + (process.pid % 30); const srv = await start(port);
const launch = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
async function open() {
  const browser = await launch(); const page = await (await browser.newContext({ ...contextOptions('fold_open'), deviceScaleFactor: 1 })).newPage();
  await page.goto(`http://localhost:${port}/tools/v2/fx_view.html?ui=0&tier=high`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__fx && window.__fx.ready && window.__fx.texReady, null, { timeout: 60000 });
  await page.evaluate(() => { window.__fx.manual = true; });
  return { browser, page };
}
if (part === 'sheet' || part === 'all') {
  const { browser, page } = await open();
  const HIT = [0.5, 0.37, 0.62];
  const ITEMS = [
    ['h', 'hit.slash.light', 0.08, ...HIT, null, '약한 베기', '가는 빛줄기 + 짧은 불티'],
    ['h', 'hit.slash.heavy', 0.14, ...HIT, null, '강한 베기', '굵은 선 + 충격 고리'],
    ['h', 'hit.blunt', 0.14, ...HIT, null, '둔기', '둥근 충격 + 바닥 고리 · 파편'],
    ['h', 'hit.pierce', 0.09, ...HIT, null, '찌르기', '꿰뚫는 긴 선 + 푸른 고리'],
    ['h', 'hit.crit', 0.16, ...HIT, null, '치명타', '금빛 고리 + 별 모양 섬광'],
    ['h', 'hit.guard', 0.16, ...HIT, null, '막기 · 쳐내기', '푸른 방패 물결'],
    ['h', 'hit.finisher', 0.26, ...HIT, null, '마무리 일격', '느린 화면 + 큰 섬광 · 바닥 균열'],
    ['h', 'swing.heavy', 0.11, 0.5, 0.3, 0.62, null, '휘두르기', '초승달 칼바람'],
    ['m', 'fire.pillar', 0.86, 1, 0.5, 0.56, null, '불 — 불기둥', '바닥 예고 원 → 솟는 기둥'],
    ['m', 'fire.meteor', 1.2, 1, 0.5, 0.56, null, '불 — 운석', '하늘에서 떨어져 균열을 남긴다'],
    ['m', 'ice.lance', 0.32, 1, 0.5, 0.56, null, '얼음 — 얼음창', '날아가 꽂히는 창 + 서리 자국'],
    ['m', 'ice.nova', 0.66, 1, 0.5, 0.56, null, '얼음 — 서리 폭발', '둘레에 솟는 얼음 가시'],
    ['m', 'lightning.chain', 0.26, 1, 0.5, 0.56, null, '번개 — 연쇄 번개', '적에서 적으로 건너뛴다'],
    ['m', 'lightning.strike', 0.66, 1, 0.5, 0.56, 4, '번개 — 낙뢰', '예고 원 → 굵은 벼락'],
    ['m', 'holy.pillar', 0.8, 1, 0.5, 0.56, 3, '성 — 빛기둥', '도는 마법진 + 빛의 기둥'],
    ['m', 'holy.bell', 0.62, 1, 0.5, 0.56, null, '성 — 종소리 충격파', '머리 위 종이 세 번 울린다'],
    ['m', 'blood.orb', 0.75, 1, 0.5, 0.56, null, '피 — 피의 구슬', '핏방울을 흘리며 날아가 터진다'],
    ['m', 'shadow.claws', 0.5, 1, 0.5, 0.56, 1, '그림자 — 발톱', '세 줄기 발톱 자국'],
    ['u', 'ult.bloodmoon', 1.32, 1, 0.5, 0.56, null, '궁극기 「붉은 달의 종」 ①', '화면이 어두워지고 종이 세 번'],
    ['u', 'ult.bloodmoon', 2.66, 1, 0.5, 0.56, null, '궁극기 「붉은 달의 종」 ②', '붉은 빛창 여덟 줄기 → 마무리'],
  ];
  const tiles = [];
  for (const it of ITEMS) {
    const url = await page.evaluate(([name, t, crop, cx, cy, dummy]) => {
      const a = window.__fx, cv = document.getElementById('c'); a.reset('high'); a.steps(1, 1 / 60, false); a.fire(name, dummy != null ? a.D[dummy] : undefined);
      a.steps(Math.round(t * 120), 1 / 120, false); a.steps(1, 0, true);
      const sw = cv.width * crop, sh = cv.height * crop, sx = Math.min(Math.max(cv.width * cx - sw / 2, 0), cv.width - sw), sy = Math.min(Math.max(cv.height * cy - sh / 2, 0), cv.height - sh);
      const c = document.createElement('canvas'); c.width = Math.round(sw); c.height = Math.round(sh); c.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.92);
    }, it.slice(1, 7));
    tiles.push({ sec: it[0], name: it[1], ko: it[7], note: it[8], url });
  }
  const sec = (k) => tiles.filter((t) => t.sec === k).map((t) => `<figure><img src="${t.url}"><figcaption><b>${t.ko}</b><span>${t.note}</span></figcaption></figure>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#0b0d14;color:#e8ebf7;font:15px/1.35 system-ui,sans-serif;width:1680px}
  h1{font-size:30px;margin:0;padding:22px 28px 4px} p.sub{margin:0;padding:0 28px 12px;color:#9aa3c2;font-size:16px}
  h2{font-size:21px;margin:14px 28px 8px;color:#ffd98a} .g{display:grid;gap:10px;padding:0 28px}
  .g4{grid-template-columns:repeat(4,1fr)} .g5{grid-template-columns:repeat(5,1fr)} .g2{grid-template-columns:repeat(2,1fr)}
  figure{margin:0;background:#141826;border-radius:8px;overflow:hidden} img{display:block;width:100%}
  figcaption{padding:7px 10px 9px} figcaption b{display:block;font-size:17px} figcaption span{color:#aab2cf;font-size:14px}
  footer{padding:14px 28px 22px;color:#8a93b3;font-size:14px}</style>
  <h1>블러드 녹턴 3D 판 — 타격 · 마법 효과 한눈에</h1>
  <p class="sub">시험 화면(게임과 같은 카메라 각도, 인형)에서 찍은 실제 렌더 · 품질 단계 「높음」 · 파랑 인형 = 영웅</p>
  <h2>타격 일곱 가지 + 휘두르기 — 종류마다 모양과 색이 다르다</h2><div class="g g4">${sec('h')}</div>
  <h2>마법 다섯 계열 (불 · 얼음 · 번개 · 성 · 피/그림자) — 바닥 예고 → 시전 → 날아감 → 터짐</h2><div class="g g5">${sec('m')}</div>
  <h2>궁극기</h2><div class="g g2">${sec('u')}</div>
  <footer>아직 게임에는 꽂지 않은 모듈입니다. 인형 대신 진짜 캐릭터 · 진짜 스테이지 위에서는 통합 뒤에 다시 봅니다. 폴드 실기 속도는 재지 않았습니다.</footer>`;
  const p2 = await (await browser.newContext({ viewport: { width: 1680, height: 1200 }, deviceScaleFactor: 1 })).newPage();
  await p2.setContent(html, { waitUntil: 'load' }); await p2.waitForTimeout(300);
  await p2.screenshot({ path: `${OUT}/owner_fx.png`, fullPage: true });
  console.log(`${OUT}/owner_fx.png`, fs.statSync(`${OUT}/owner_fx.png`).size);
  await browser.close();
}
if (part === 'video' || part === 'all') {
  const { browser, page } = await open(); const FPS = 24;
  const dir = `${TMP}/vframes`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  const shoot = (cap) => page.evaluate(([cap, dt]) => {
    const a = window.__fx, cv = document.getElementById('c'); a.steps(2, dt / 2, false); a.steps(1, 0, true);
    const c = (window.__cap ??= document.createElement('canvas')); if (c.width !== 960) { c.width = 960; c.height = Math.round(960 * cv.height / cv.width / 2) * 2; }
    const g = c.getContext('2d'); g.drawImage(cv, 0, 0, c.width, c.height);
    g.fillStyle = 'rgba(6,8,14,0.62)'; g.fillRect(0, c.height - 46, c.width, 46); g.font = '600 22px system-ui, sans-serif'; g.fillStyle = '#f1f3fb'; g.textBaseline = 'middle'; g.fillText(cap, 18, c.height - 23);
    return c.toDataURL('image/jpeg', 0.86);
  }, [cap, 1 / FPS]).then((url) => fs.writeFileSync(`${dir}/f_${String(n++).padStart(5, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64')));
  for (const [d, cap] of [['combo', '콤보 — 세 번 베기 → 대시 → 마무리 일격 (시험 화면 · 인형)'], ['spells', '마법 순회 — 불 · 얼음 · 번개 · 성 · 피/그림자 → 궁극기 「붉은 달의 종」']]) {
    await page.evaluate((d) => { window.__fx.reset('high'); window.__fx.startDemo(d); }, d);
    let guard = 0; while (guard++ < FPS * 30) { await shoot(cap); if (!(await page.evaluate(() => window.__fx.demoName))) break; }
    for (let i = 0; i < 10; i++) await shoot(cap);
  }
  await browser.close();
  const webm = `${OUT}/owner_fx.webm`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', `${dir}/f_%05d.jpg`, '-c:v', 'libvpx-vp9', '-b:v', '1500k', '-maxrate', '2200k', '-bufsize', '4000k', '-pix_fmt', 'yuv420p', '-row-mt', '1', '-cpu-used', '4', '-an', webm]);
  console.log(webm, fs.statSync(webm).size, 'frames', n, 'sec', (n / FPS).toFixed(1));
  fs.rmSync(dir, { recursive: true, force: true });
}
srv.close(); process.exit(0);
