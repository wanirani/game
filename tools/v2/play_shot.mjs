// PLAY: 시험 화면(tools/v2/play_view.html)을 헤드리스로 띄워 움직임 붙임 그림(contact sheet)을 찍는다.
//   node tools/v2/play_shot.mjs                 모든 묶음 → /tmp/claude-0/v2/play/<이름>.jpg
//   node tools/v2/play_shot.mjs run turn        이름이 그 글자로 시작하는 묶음만
//   node tools/v2/play_shot.mjs --page=fight    폴드 편 화면 크기로 한 장면 전체(단추 포함) → page_<demo>.png
//   --owner   소유자용 한 장 → /tmp/claude-0/v2/owner_play.png   ·   --owner2  2차(돌기 · 새 기술 · 보스) → /tmp/claude-0/v2/owner_play2.png
//   --legacy  2차 이전의 돌기 방식으로 찍는다(비교용)
//   --out=<폴더>  --list  --sheet="demo:cam:t0:t1:step:cols:cw:ch[:box][:who]" --name=이름 (그때그때 한 장)
// 한 번에 브라우저 하나. 헤드리스 WebGL 은 소프트웨어 렌더링이라 느리다(프레임 시간은 기기와 무관).
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2), want = argv.filter((a) => !a.startsWith('--'));
const opt = (k, d) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const outDir = opt('out', '/tmp/claude-0/v2/play');
const range = (a, b, s) => { const o = []; for (let t = a; t <= b + 1e-6; t += s) o.push(+t.toFixed(4)); return o; };
const C8 = Array.from({ length: 8 }, (_, k) => k * 2.48).flatMap((b) => [b + 0.31, b + 0.6, b + 1.02]);
/** 묶음: { 이름, demo, times, cam, cols, cw, ch, box, who(적의 클립을 이름표로) } */
const SETS = [
  { n: 'run8_close', demo: 'run8', times: range(0.125, 10, 0.125), cam: 'close', cols: 10, cw: 190, ch: 200 },
  { n: 'run8_game', demo: 'run8', times: range(0.25, 10, 0.25), cam: 'game', cols: 10, cw: 240, ch: 200 },
  // 2차: 돌기 (두 틱마다 한 칸) · 준비 자세 · 내딛기 · 도구 · 보스
  { n: 'rev_close', demo: 'turn', times: range(0.8667, 1.3333, 0.0333), cam: 'close', cols: 8, cw: 240, ch: 230, box: true },
  { n: 'rev_game', demo: 'turn', times: range(0.8667, 1.3333, 0.0333), cam: 'game', cols: 8, cw: 300, ch: 200, box: true },
  { n: 'rev4_close', demo: 'rev4', times: [0.7, 2.3, 3.9, 5.5].flatMap((t) => range(t - 0.0333, t + 0.3, 0.0333)), cam: 'close', cols: 11, cw: 200, ch: 220, box: true },
  { n: 'rev4_game', demo: 'rev4', times: [0.7, 2.3, 3.9, 5.5].flatMap((t) => range(t - 0.0333, t + 0.3, 0.0333)), cam: 'game', cols: 11, cw: 220, ch: 170, box: true },
  { n: 'turn90_close', demo: 'rev4', times: [7.0, 7.5, 8.0].flatMap((t) => range(t - 0.0333, t + 0.2, 0.0333)), cam: 'close', cols: 8, cw: 220, ch: 220, box: true },
  { n: 'flips_close', demo: 'rev4', times: range(8.5, 9.3, 0.0333), cam: 'close', cols: 13, cw: 180, ch: 210, box: true },
  { n: 'ready_close', demo: 'ready', times: range(0.9, 2.2, 0.1), cam: 'close', cols: 7, cw: 220, ch: 230 },
  { n: 'lunge_close', demo: 'lunge', times: range(0.4, 0.8667, 0.0333), cam: 'close', cols: 8, cw: 240, ch: 230, box: true },
  { n: 'charge_small', demo: 'charge', times: range(0.5, 1.9, 0.1), cam: 'close', cols: 8, cw: 240, ch: 230, box: true },
  { n: 'charge_big', demo: 'chargeBig', times: range(0.5, 1.9, 0.1), cam: 'close', cols: 8, cw: 240, ch: 230, box: true },
  { n: 'hook_game', demo: 'hook', times: range(0.4, 1.3, 0.0667), cam: 'game', cols: 7, cw: 300, ch: 230, box: true },
  { n: 'call_game', demo: 'call', times: range(0.8, 3.2, 0.2), cam: 'game', cols: 7, cw: 300, ch: 230, box: true },
  { n: 'echo_game', demo: 'echo', times: range(1.2, 2.6, 0.1), cam: 'game', cols: 8, cw: 300, ch: 230, box: true },
  { n: 'knell_game', demo: 'knell', times: range(0.4, 4.4, 0.25), cam: 'game', cols: 9, cw: 280, ch: 230, box: true },
  { n: 'boss_wail', demo: 'bossFar', times: range(0.3, 3.9, 0.15), cam: 'game', cols: 9, cw: 280, ch: 220, box: true, who: true },
  { n: 'boss_sweep', demo: 'bossSweep', times: range(0.7, 3.3, 0.1), cam: 'enemy', cols: 9, cw: 260, ch: 230, box: true, who: true },
  { n: 'boss_scream', demo: 'bossScream', times: range(0.7, 8.5, 0.3), cam: 'game', cols: 9, cw: 280, ch: 220, box: true, who: true },
  { n: 'boss_summon', demo: 'bossSummon', times: range(0.7, 6.1, 0.3), cam: 'game', cols: 9, cw: 280, ch: 220, box: true, who: true },
  { n: 'boss_song', demo: 'bossSong', times: range(0.7, 7.9, 0.3), cam: 'game', cols: 9, cw: 280, ch: 220, box: true, who: true },
  { n: 'boss_fight', demo: 'boss', times: range(1, 49, 1), cam: 'game', cols: 7, cw: 330, ch: 230, box: true, who: true },
  { n: 'turn_close', demo: 'turn', times: range(0.7, 5.9, 0.0667), cam: 'close', cols: 13, cw: 170, ch: 190 },
  { n: 'turn_top', demo: 'turn', times: range(0.8, 3.0, 0.05), cam: 'top', cols: 15, cw: 150, ch: 150, box: true },
  { n: 'walk_close', demo: 'walk', times: range(0.1, 7.3, 0.15), cam: 'close', cols: 12, cw: 170, ch: 190 },
  { n: 'combo1_close', demo: 'combo1', times: range(0.36, 1.92, 0.0333), cam: 'close', cols: 12, cw: 190, ch: 200 },
  { n: 'combo1_side', demo: 'combo1', times: range(0.36, 1.92, 0.0333), cam: 'side', cols: 12, cw: 190, ch: 200 },
  { n: 'combo1_top', demo: 'combo1', times: range(0.36, 1.92, 0.0333), cam: 'top', cols: 12, cw: 170, ch: 170, box: true },
  { n: 'comboUp_close', demo: 'comboUp', times: range(0.3, 4.1, 0.0667), cam: 'close', cols: 12, cw: 190, ch: 200 },
  { n: 'combo8_high', demo: 'combo', times: C8, cam: 'high', cols: 6, cw: 300, ch: 240, box: true },
  { n: 'roll_close', demo: 'roll', times: [...range(0.25, 1.4, 0.05), ...range(4.85, 6.0, 0.05)], cam: 'close', cols: 12, cw: 190, ch: 200 },
  { n: 'roll_game', demo: 'roll', times: range(0.2, 6.2, 0.125), cam: 'game', cols: 12, cw: 200, ch: 170, box: true },
  { n: 'jump_close', demo: 'jump', times: [...range(0.35, 1.5, 0.05), ...range(1.9, 3.25, 0.05)], cam: 'close', cols: 13, cw: 180, ch: 230 },
  { n: 'jump_side', demo: 'jump', times: range(1.9, 3.25, 0.05), cam: 'side', cols: 14, cw: 170, ch: 230 },
  { n: 'guard_close', demo: 'guard', times: range(0.6, 7.8, 0.1), cam: 'close', cols: 12, cw: 200, ch: 200, box: true },
  { n: 'block_close', demo: 'block', times: range(0.6, 5.3, 0.1), cam: 'close', cols: 12, cw: 200, ch: 200 },
  { n: 'hurt_game', demo: 'hurt', times: range(0.4, 9.9, 0.16), cam: 'game', cols: 12, cw: 210, ch: 180 },
  ...['soldier', 'mage', 'corpse', 'ghost', 'armor', 'bat'].map((k) => ({ n: 'enemy_' + k, demo: k, times: range(0.4, 9.2, 0.2), cam: 'enemy', cols: 9, cw: 250, ch: 230, box: true, who: true })),
  ...['soldier', 'armor', 'corpse'].map((k) => ({ n: 'enemyfine_' + k, demo: k, times: range(1.0, 4.0, 0.0667), cam: 'enemy', cols: 12, cw: 190, ch: 200, who: true })),
  { n: 'enemy_rise', demo: 'rise', times: range(0.2, 4.4, 0.2), cam: 'enemy', cols: 11, cw: 210, ch: 210, who: true },
  { n: 'stop_close', demo: 'run8', times: range(0.75, 1.4, 0.0333), cam: 'close', cols: 10, cw: 230, ch: 250 },
  { n: 'circle_close', demo: 'circle', times: range(0.3, 6.6, 0.21), cam: 'close', cols: 10, cw: 230, ch: 250 },
  { n: 'crowd_high', demo: 'crowd', times: range(1, 11, 0.5), cam: 'high', cols: 7, cw: 330, ch: 280, box: true },
  { n: 'fight_game', demo: 'fight', times: range(0.5, 20, 0.33), cam: 'game', cols: 10, cw: 260, ch: 190, box: true },
  { n: 'elite_game', demo: 'elite', times: range(0.5, 20, 0.33), cam: 'game', cols: 10, cw: 260, ch: 190, box: true },
];
{ const ad = opt('sheet', null);   // --sheet="demo:cam:t0:t1:step:cols:cw:ch[:box][:who]" [--name=이름] — 그때그때 한 장
  if (ad) { const [demo, cam, t0, t1, st, cols, cw, ch, box, who] = ad.split(':'); SETS.length = 0; SETS.push({ n: opt('name', 'adhoc_' + demo + '_' + cam), demo, cam, times: range(+t0, +t1, +st), cols: +cols, cw: +cw, ch: +ch, box: box === '1', who: who === '1' }); want.length = 0; } }
if (argv.includes('--list')) { for (const s of SETS) console.log(s.n.padEnd(16), s.demo.padEnd(9), s.times.length + ' frames', s.cam); process.exit(0); }
fs.mkdirSync(outDir, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || /keystore/i.test(f)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); });
});
const port = 9500 + Math.floor(Math.random() * 400);
await new Promise((r) => srv.listen(port, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
let code = 0;
try {
  const pageDemo = opt('page', null);
  const page = await (await browser.newContext({ viewport: pageDemo ? { width: 884, height: 1104 } : { width: 400, height: 300 }, deviceScaleFactor: 1 })).newPage();
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall due to ReadPixels/.test(m.text())) errs.push(`[${m.type()}] ${m.text()}`); });   // (소프트웨어 렌더링의 읽기 경고는 뺀다)
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  await page.goto(`http://localhost:${port}/tools/v2/play_view.html?hold=${pageDemo ? 0 : 1}${pageDemo ? '&demo=' + pageDemo + '&box=1' : ''}${argv.includes('--legacy') ? '&legacy=1' : ''}`);   // --legacy = 1차의 돌기 방식(비교용)
  try { await page.waitForFunction(() => window.__play?.ready || window.__play?.error, null, { timeout: 90000 }); } catch { errs.push('timeout waiting for ready'); }
  const err0 = await page.evaluate(() => window.__play?.error ?? null);
  if (err0) { errs.push('page error: ' + err0); code = 1; }
  else if (pageDemo) {
    await page.waitForTimeout(Number(opt('wait', 6000)));
    const f = path.join(outDir, `page_${pageDemo}.png`); await page.screenshot({ path: f }); console.log('wrote', f, JSON.stringify(await page.evaluate(() => window.__play.state())).slice(0, 600));
  } else {
    await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; document.getElementById('info').style.display = 'none'; });
    if (argv.includes('--owner')) {   // 소유자용 한 장: 카엘의 기술 여덟 + 적 여섯 + 무리 둘
      const L = [
        { demo: 'run8', t: 0.45, cam: 'close', label: '달리기' }, { demo: 'combo1', t: 0.6, cam: 'close', label: '연타 1' }, { demo: 'combo1', t: 1.42, cam: 'close', label: '연타 3 (넓게)' }, { demo: 'roll', t: 0.56, cam: 'close', label: '구르기 (짧은 무적)' },
        { demo: 'roll', t: 5.62, cam: 'close', label: '구른 직후 훑기' }, { demo: 'jump', t: 2.5, cam: 'close', label: '점프 중 내려베기' }, { demo: 'guard', t: 1.24, cam: 'close', box: true, label: '튕겨내기' }, { demo: 'combo', t: 8.05, cam: 'high', box: true, label: '보는 방향대로 베기 (여덟 방향)' },
        { demo: 'soldier', t: 1.62, cam: 'enemy', box: true, label: '해골 병사 — 내지르기 예고' }, { demo: 'mage', t: 1.5, cam: 'enemy', label: '해골 술사 — 탄' }, { demo: 'corpse', t: 2.8, cam: 'enemy', box: true, label: '역병 주검 — 덮치기 (막을 수 없다)' }, { demo: 'ghost', t: 1.9, cam: 'enemy', box: true, label: '무덤 유령 — 덮칠 때만 또렷하다' },
        { demo: 'armor', t: 7.6, cam: 'enemy', box: true, label: '무덤지기 갑주 — 땅 찍기 예고' }, { demo: 'bat', t: 1.1, cam: 'enemy', box: true, label: '박쥐 떼 — 내리꽂기' }, { demo: 'crowd', t: 5.0, cam: 'high', box: true, label: '둘씩 번갈아 덤빈다' }, { demo: 'fight', t: 7.0, cam: 'game', box: true, label: '게임 카메라 높이' },
      ];
      const url = await page.evaluate((L) => window.__play.shots(L, { cols: 4, cw: 440, ch: 360 }), L);
      const f = opt('owner', '') || '/tmp/claude-0/v2/owner_play.png'; fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log('wrote', f);
    }
    if (argv.includes('--owner2')) {   // 2차 소유자용 한 장: 돌기 전 · 후, 준비 자세, 새 기술, 보스의 공격과 예고
      const T8 = [0.9, 0.9333, 0.9667, 1.0, 1.0333, 1.0667, 1.1, 1.1333], sec = (t) => (t - 0.9).toFixed(2) + '초';
      const rows = [
        { title: '① 달리다 반대로 꺾기 — 고치기 전: 몸은 아직 오른쪽을 보는데 발밑(파란 선 = 몸이 보는 쪽)은 벌써 왼쪽으로 밀려간다 (0.1초쯤 옆 · 뒤로 미끄러짐)', items: T8.map((t) => ({ demo: 'turn', t, cam: 'close', box: true, legacy: true, label: '전 · 꺾은 뒤 ' + sec(t) })) },
        { title: '① 고친 뒤: 멈추고(0.07초) → 제자리에서 돌아서고 → 새 쪽으로 박찬다. 속도는 늘 몸이 보는 쪽으로만 난다 (돌아서는 데 0.21초, 다시 달리기까지 0.22초)', items: T8.map((t) => ({ demo: 'turn', t, cam: 'close', box: true, label: '후 · 꺾은 뒤 ' + sec(t) })) },
        { title: '② 준비 자세 · 내딛으며 베기 · 길게 눌러 모아 휘감기', items: [
          { demo: 'ready', t: 1.3, cam: 'close', legacy: true, label: '준비 자세 전: 칼끝이 등 뒤' }, { demo: 'ready', t: 1.3, cam: 'close', label: '후: 칼을 앞으로 겨눈다' },
          { demo: 'lunge', t: 0.58, cam: 'close', box: true, legacy: true, label: '내딛기 전: 선 채로 미끄러짐' }, { demo: 'lunge', t: 0.58, cam: 'close', box: true, label: '후: 뒷발을 디딘 채 뻗는다' },
          { demo: 'charge', t: 1.3, cam: 'close', box: true, label: '공격 길게: 모은다' }, { demo: 'charge', t: 1.72, cam: 'close', box: true, label: '놓으면 채찍이 멀리 뻗는다' },
          { demo: 'charge', t: 1.95, cam: 'close', box: true, label: '작은 적은 끌어온다' }, { demo: 'chargeBig', t: 1.95, cam: 'close', box: true, label: '큰 적에게는 끌려간다' } ] },
        { title: '③ 솜씨 단추(빛나는 고리 = 채찍 걸기 / 없으면 세라의 등불) · 종 단추(짧게 = 메아리 / 길게 = 조종)', items: [
          { demo: 'hook', t: 0.6, cam: 'game', box: true, label: '채찍 걸기: 고리에 던진다' }, { demo: 'hook', t: 0.87, cam: 'game', box: true, label: '고리 쪽으로 날아 건넌다' },
          { demo: 'call', t: 1.25, cam: 'game', box: true, label: '부름: 울림 한 칸을 쓴다' }, { demo: 'call', t: 2.4, cam: 'game', box: true, label: '빛 안의 유령이 굳어 베인다' },
          { demo: 'echo', t: 1.62, cam: 'game', box: true, label: '메아리: 종이 울린다' }, { demo: 'echo', t: 2.1, cam: 'game', box: true, label: '숨은 유령이 드러나고 주문이 끊긴다' },
          { demo: 'knell', t: 1.5, cam: 'game', box: true, label: '종을 길게: 차오른다' }, { demo: 'knell', t: 2.05, cam: 'game', box: true, label: '무릎 꿇은 여왕을 보낸다 (조종)' } ] },
        { title: '④ 보스 밴시 여왕 — 공격마다 예고(노랑 = 막을 수 있다, 분홍 = 막을 수 없다) → 판정(빨강) → 틈', items: [
          { demo: 'bossFar', t: 1.15, cam: 'game', box: true, label: '울음 탄: 길 셋이 먼저 보인다' }, { demo: 'bossFar', t: 1.75, cam: 'game', box: true, label: '그 길로 탄 셋' },
          { demo: 'bossSweep', t: 1.55, cam: 'game', box: true, label: '울음 물결: 부채꼴 예고 0.9초' }, { demo: 'bossSweep', t: 1.8, cam: 'game', box: true, label: '맞춰 막으면 튕겨낸다' },
          { demo: 'bossScream', t: 6.5, cam: 'game', box: true, label: '비명: 공중 고리 + 바닥 원 1.15초' }, { demo: 'bossScream', t: 6.75, cam: 'game', box: true, label: '막을 수 없다 — 맞으면 굳는다' },
          { demo: 'bossScream', t: 1.62, cam: 'game', box: true, label: '예고 중에 종을 치면 끊긴다' }, { demo: 'bossScream', t: 2.4, cam: 'game', box: true, label: '여왕이 비틀거린다 (칠 틈 2.6초)' } ] },
        { title: '④ 2막(체력 절반 뒤): 유령 부르기 · 배웅가. 베어서는 끝나지 않는다 — 무릎 꿇으면 종을 길게 쳐 보낸다', items: [
          { demo: 'bossSummon', t: 1.9, cam: 'game', box: true, label: '유령 부르기: 나올 자리 둘' }, { demo: 'bossSummon', t: 3.2, cam: 'game', box: true, label: '무덤 유령 둘' },
          { demo: 'bossSong', t: 2.5, cam: 'game', box: true, label: '배웅가: 0.7초마다 깎인다' }, { demo: 'bossSong', t: 4.3, cam: 'game', box: true, label: '종으로 노래를 끊는다' },
          { demo: 'boss', t: 22.0, cam: 'game', box: true, label: '절반에서 그 밤으로 달아난다' }, { demo: 'boss', t: 31.0, cam: 'game', box: true, label: '2막: 등불로 유령을 굳히고 싸운다' },
          { demo: 'knell', t: 1.0, cam: 'enemy', box: true, label: '무릎 꿇음: 머리를 감싸고 숙인다' }, { demo: 'knell', t: 2.6, cam: 'enemy', label: '조종 뒤 스러진다' } ] },
      ];
      const head = ['블러드 녹턴 3D — 움직임 2차: 돌기 · 준비 자세 · 새 기술 · 보스 밴시 여왕 (시험 화면 tools/v2/play_view.html, 평평한 마당)', '효과 · 소리 · 단추 그림은 본 게임 장면이 입힌다. 여기의 선과 원은 규칙이 정한 모양(예고 · 판정 · 채찍 · 빛)을 그대로 그린 것이다.'];
      const foot = ['아직 약한 곳: 반전 때 멈추는 자세가 과하게 뒤로 젖는다 · 모으는 자세가 밋밋하다 · 채찍 전용 동작이 없어 칼 휘두름 클립에 띠만 그렸다 · 여왕의 무릎 꿇음은 숙인 채 떠 있는 자세다 · 폴드에서 손으로 해 본 값이 아니다(반전 빠르기 · 보스 체력 900 · 예고 길이는 기기에서 다듬어야 한다).'];
      const url = await page.evaluate(([rows, head, foot]) => window.__play.board(rows, { cols: 8, cw: 250, ch: 220, head, foot }), [rows, head, foot]);
      const f = opt('owner2', '') || '/tmp/claude-0/v2/owner_play2.png'; fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log('wrote', f);
    }
    const gal = opt('gallery', null);   // --gallery="idle:0,idle_combat:0.5,…" [--gcam=close] [--gdir=1,0] [--gname=이름]
    if (gal) {
      const list = gal.split(',').map((x) => { const [n, t] = x.split(':'); return [n, Number(t ?? 0)]; }), gd = opt('gdir', '1,0').split(',').map(Number);
      const url = await page.evaluate(([list, cam, dir]) => window.__play.gallery(list, { cam, dir, cols: Math.min(8, list.length), cw: 250, ch: 270 }), [list, opt('gcam', 'close'), gd]);
      const f = path.join(outDir, 'gallery_' + opt('gname', 'clips') + '.jpg'); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log('wrote', f);
    }
    for (const s of gal || argv.includes('--owner') || argv.includes('--owner2') ? [] : SETS) {
      if (want.length && !want.some((w) => s.n.startsWith(w))) continue;
      const t0 = Date.now();
      const url = await page.evaluate((s) => window.__play.sheet(s.demo, s.times, { cols: s.cols, cw: s.cw, ch: s.ch, cam: s.cam, box: s.box, who: s.who }), s);
      const f = path.join(outDir, s.n + '.jpg'); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
      const stt = await page.evaluate(() => window.__play.lastStates);
      fs.writeFileSync(path.join(outDir, s.n + '.json'), JSON.stringify(stt));
      const clips = [...new Set(stt.map((q) => q.hero.clip))].join(' '), eclips = [...new Set(stt.flatMap((q) => q.enemies.map((e) => e.clip)))].join(' ');
      console.log(`wrote ${f}  (${s.times.length} frames, ${((Date.now() - t0) / 1000).toFixed(1)} s)  hero clips: ${clips}${eclips ? '  enemy clips: ' + eclips : ''}`);
    }
  }
} catch (e) { errs.push('exception: ' + (e?.stack ?? e)); code = 1; }
console.log(errs.length ? errs.slice(0, 12).join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
process.exit(code || (errs.some((e) => /pageerror|page error|exception/.test(e)) ? 1 : 0));
