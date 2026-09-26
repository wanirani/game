// story 클러스터 QA 확인 스크립트 (임시)
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import fs from 'node:fs';
const OUT = process.argv[2] || '/tmp/claude-0/-home-user-game/01bb32c1-b295-5e05-8160-23ed04e60e08/scratchpad/qa';
const PATCH = process.argv.includes('--patch');
fs.mkdirSync(OUT, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
if (PATCH) {
  const patch = (file, pairs) => page.route(`**/src/${file}`, async (route) => {
    let s = fs.readFileSync(`/home/user/game/src/${file}`, 'utf8');
    for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error('patch miss ' + file + ': ' + a); s = s.replace(a, b); }
    route.fulfill({ status: 200, contentType: 'text/javascript', body: s });
  });
  await patch('scenes/dialogue.js', [['const sp = speakerInfo(l.who, this.state);', 'const sp = { ...speakerInfo(l.who, this.state), ...(l.name ? { name: l.name } : {}), ...(l.portrait ? { portrait: l.portrait } : {}) };']]);
  await patch('scenes/front/story.js', [['const sp = speaker(l.who, this.state);', 'const sp = speaker(l.who, this.state);\n    if (l.name) sp.name = l.name;\n    if (l.portrait) sp.portrait = l.portrait;']]);
  await patch('scenes/front/ending.js', [['const custom = STORY.CREDITS;', "const custom = typeof STORY.creditsFor === 'function' ? STORY.creditsFor(kind, g.state, g.meta) : STORY.CREDITS;"], ['if (f.carmilla_trust2 || f.carmilla_trust) return', 'if (f.carmilla_trust2) return']]);
}
await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=s02&char=kael`);
await page.waitForTimeout(3000);
const snap = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const info = () => page.evaluate(() => { const g = window.__game, t = g.scenes[g.scenes.length - 1]; return { scene: t.name, i: t.i, card: t.card ? t.card.kor : null, sp: t.sp?.name ?? null, text: (t.full ?? '').slice(0, 30), toasts: g.toasts.map((x) => x.text) }; });

// 1) s02_t1 (대화 오버레이) — 명패
await page.evaluate(() => window.__game.world.playScript('s02_t1'));
await page.waitForTimeout(1200); await snap('t1_lia_plate');
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
// 2) 드라큘라 변신 대사 — 초상화
await page.evaluate(() => window.__game.world.playScript('b_dracula_transform'));
await page.waitForTimeout(1500); await snap('dracT'); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
// 3) 퀘스트 완료 표시
const q = await page.evaluate(async () => {
  const Q = await import('/src/game/quests.js');
  const s = window.__game.state;
  const out = {};
  Q.acceptQuest(s, 'bd_wolves', { silent: true });
  s.quests.active.bd_wolves.n = 8;
  out.before = Q.questProgressText(s, 'bd_wolves');
  out.claim = !!Q.claimQuest(s, 'bd_wolves');
  out.after = Q.questProgressText(s, 'bd_wolves');
  out.prog = Q.questProgress(s, 'bd_wolves');
  out.status = Q.questStatus(s, 'bd_wolves');
  return out;
});
console.log('QUEST', JSON.stringify(q));
// 4) s02_outro 컷신 — 합류 연출 시점
await page.evaluate(() => { const g = window.__game; g.state.progress.flags.lia_joined = false; g.meta.unlockedChars = g.meta.unlockedChars.filter((c) => c !== 'lia'); g.go('story', { script: 's02_outro', then: 'hub', bg: 's02_graveyard' }, { fade: false }); });
await page.waitForTimeout(1200);
const log = [];
for (let k = 0; k < 40; k++) {
  const s = await info();
  log.push(s);
  if (s.scene !== 'story') break;
  if (s.card) { await snap('lia_card'); await page.waitForTimeout(3200); log.push(await info()); await snap('lia_after_card'); }
  if (k === 0) await snap('lia_first_plate');
  await page.keyboard.press('KeyZ'); await page.waitForTimeout(250);
  await page.keyboard.press('KeyZ'); await page.waitForTimeout(350);
}
await page.waitForTimeout(1500); log.push(await info()); await snap('lia_hub');
for (const l of log) console.log(JSON.stringify(l));
// 5) 크레딧 (배드 엔딩, 신규 플레이어)
await page.evaluate(() => { const g = window.__game; g.meta.endingsSeen = []; g.go('credits', { kind: 'bad', fromEnding: true }, { fade: false }); });
await page.waitForTimeout(800);
const cr = await page.evaluate(() => { const t = window.__game.scenes.at(-1); return t.blocks.flatMap((b) => (b.rows || []).map((r) => r.join(' '))).filter((r) => r.includes('13장')); });
console.log('CREDITS 13장 rows (bad):', JSON.stringify(cr));
const dec = await page.evaluate(async () => { const E = await import('/src/scenes/front/ending.js'); return [E.decideEnding({ progress: { flags: { carmilla_trust1: true } } }), E.decideEnding({ progress: { flags: { carmilla_trust1: true, carmilla_trust2: false } } }, 's12'), E.decideEnding({ progress: { flags: { carmilla_trust2: true } } }, 's12')]; });
console.log('decideEnding', JSON.stringify(dec));
console.log(errors.length ? errors.join('\n') : 'NO PAGE ERRORS');
await browser.close();
srv.close();
