// 퍼펫 인게임 QA: 스테이지를 열고 조작 → 스크린샷 + 플레이어 그리기 시간(ms) 측정
// node tools/puppet/ingame.mjs --stage s01 [--room boss] [--char kael] [--cls kael_templar] [--out /tmp/x] [--w 1280 --h 720 --dpr 1.5]
//        [--mobile] [--vector] [--scale 1.14(플레이어 그리기 배율)] [--dlg(대사 창 자동 닫기 끔)] [--steps "wait:1,shot,right:1,attack:0.2,snap=..." ] [--equip body=#hex,plate]
// 단계 토큰: key[:초] (right left up down jump attack dash sub skill1 skill2 ult) · a+b:초 · wait:초 · shot · eval=JS(;; 는 ,)
//           snap=조건JS (조건이 참인 프레임의 게임 캔버스를 저장, 예: snap=window.__game.world.player.move&&window.__game.world.player.moveT>0.1)
//           press=key@초 · down=key · up=key
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import fs from 'node:fs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const stage = opt('stage', 's01'), room = opt('room', ''), char = opt('char', 'kael'), cls = opt('cls', '');
const outp = opt('out', '/tmp/claude-0/puppet_dbg/ig'), mobile = !!opt('mobile', false), vector = !!opt('vector', false);
const steps = opt('steps', 'wait:1.5,shot');
fs.mkdirSync(outp.replace(/\/[^/]*$/, ''), { recursive: true });
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext(mobile
  ? { viewport: { width: Number(opt('w', 844)), height: Number(opt('h', 390)) }, deviceScaleFactor: Number(opt('dpr', 2)), hasTouch: true, isMobile: true }
  : { viewport: { width: Number(opt('w', 1280)), height: Number(opt('h', 720)) }, deviceScaleFactor: Number(opt('dpr', 1.5)) });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 300)); });
page.on('response', (r) => { if (r.status() >= 400 && /puppets/.test(r.url())) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=${stage}&char=${char}${room ? '&room=' + room : ''}`);
await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 30000 });
await page.evaluate(async ({ vector, cls, equip, skipDlg, drawScale }) => {
  const hero = await import('/src/render/hero.js');
  if (vector) hero.setPuppetEnabled(false);
  if (drawScale) hero.setHeroDrawScale(drawScale);
  const w = window.__game.world, pl = w.player;
  if (cls && pl.hero) {
    pl.hero.classId = cls;
    const st = await import('/src/game/stats.js');
    pl.look = st.composeLook(pl.state, pl.hero);
  }
  if (equip) Object.assign(pl.look = { ...pl.look }, equip);
  // 플레이어 그리기 시간 측정 (draw 전체 = 잔상 제외 본체)
  const proto = Object.getPrototypeOf(pl), orig = proto.draw;
  window.__drawMs = [];
  proto.draw = function (c, ww) { const t0 = performance.now(); orig.call(this, c, ww); window.__drawMs.push(performance.now() - t0); };
  window.__hero = hero;
  // QA 편의: 대사·보스 소개 창을 닫고 연출 입력 잠금을 푼다 (--dlg 로 끔)
  if (skipDlg) setInterval(() => { const g = window.__game, top = g.scenes[g.scenes.length - 1]; if (top && /Dialogue|BossIntro|Story/.test(top.constructor?.name || '')) g.pop(); else if (g.world && top?.constructor?.name === 'StageScene') { g.world.cutscene = false; g.world.inputLock = false; } }, 60);
}, { vector, cls, equip: opt('equip', '') ? JSON.parse(opt('equip')) : null, skipDlg: !opt('dlg', false), drawScale: Number(opt('scale', 0)) });
// 퍼펫 로드 대기 (최대 5초)
if (!vector && (await page.evaluate(async (c) => { const m = await import('/src/render/puppet_manifest.js'); return !!m.PUPPETS[c]; }, char))) await page.waitForFunction(() => { const s = window.__hero?.puppetStatus?.(); return s && Object.values(s).some((v) => v.state === 1); }, null, { timeout: 8000 }).catch(() => errs.push('PUPPET NOT READY'));
await page.waitForTimeout(400);
const KEY = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', jump: 'KeyZ', attack: 'KeyX', dash: 'KeyC', sub: 'KeyA', skill1: 'KeyS', skill2: 'KeyD', ult: 'KeyF', menu: 'Escape', enter: 'Enter' };
let n = 0;
for (const s of steps.split(',')) {
  const [k, d] = s.split(':');
  if (k === 'shot') { await page.screenshot({ path: `${outp}_${n++}.png` }); continue; }
  if (k === 'wait') { await page.waitForTimeout(Number(d) * 1000); continue; }
  if (s.startsWith('eval=')) { try { await page.evaluate(s.slice(5).replaceAll(';;', ',')); } catch (e) { errs.push('EVAL ' + e.message); } continue; }
  if (s.startsWith('snap=')) {
    // 조건이 참이 되는 프레임의 캔버스를 그대로 저장 (스크린샷 지연 없이 공격 판정 프레임 등을 잡는다)
    const cond = s.slice(5).replaceAll(';;', ',');
    const data = await page.evaluate((cond) => new Promise((res) => {
      const f = new Function('return (' + cond + ')');
      let k = 0;
      const tick = () => { k++; let ok = false; try { ok = f(); } catch { /* 무시 */ } if (ok || k > 300) requestAnimationFrame(() => res(window.__game.canvas.toDataURL('image/png'))); else requestAnimationFrame(tick); };
      tick();
    }), cond);
    fs.writeFileSync(`${outp}_${n++}.png`, Buffer.from(data.split(',')[1], 'base64'));
    continue;
  }
  if (s.startsWith('press=')) { const [kk, dd] = s.slice(6).split('@'); await page.keyboard.down(KEY[kk] || kk); await page.waitForTimeout(Number(dd || 0.08) * 1000); await page.keyboard.up(KEY[kk] || kk); continue; }
  if (s.startsWith('down=')) { await page.keyboard.down(KEY[s.slice(5)] || s.slice(5)); continue; }
  if (s.startsWith('up=')) { await page.keyboard.up(KEY[s.slice(3)] || s.slice(3)); continue; }
  if (k.includes('+')) { const ks = k.split('+').map((x) => KEY[x] || x); for (const kk of ks) await page.keyboard.down(kk); await page.waitForTimeout(Number(d || 0.1) * 1000); for (const kk of ks) await page.keyboard.up(kk); continue; }
  const key = KEY[k] || k;
  await page.keyboard.down(key); await page.waitForTimeout(Number(d || 0.1) * 1000); await page.keyboard.up(key);
}
const info = await page.evaluate(() => {
  const p = window.__game.world.player, a = (window.__drawMs || []).slice(20).sort((x, y) => x - y);
  const avg = a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return { anim: p.anim, cls: p.hero?.classId, drawAvgMs: avg && +avg.toFixed(3), drawP95Ms: a.length ? +a[Math.floor(a.length * 0.95)].toFixed(3) : null, frames: a.length, fps: Math.round(window.__game.fps || 0), pup: window.__hero.puppetStatus() };
});
console.log(JSON.stringify({ errs, ...info }));
await browser.close(); srv.close();
