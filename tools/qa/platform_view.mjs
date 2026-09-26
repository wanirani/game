// Screen / scale / budget / pacing / boot suite — platform.md §11 WP-3 (acceptance 1–9), §6, P-02, P-03, P-04, P-11,
// P-12, P-13, P-18, P-26, P-35, §10 settings migration; plus the tap-target and UI-scale audits per scene group
// that the W2 scene packages run (WP-4/6/7 acceptance "tap audit passes at 740×360").
//
//   node tools/qa/platform_view.mjs [--only <groups>] [--vp phone2,…] [--strict] [--assume PKG,…] [--shots]
// groups: budget insets scale pacing governor stack boot pad settings pwa
//         front options account arcade town games pause dialogue results
// Report: /tmp/claude-0/qa/platform/platform_view.json
import { Suite, fmt, near } from './lib/suite.mjs';
import { openEnv } from './lib/server.mjs';
import { VIEWPORTS, NOTCH_INSETS, PIXEL_BUDGET_MP } from './lib/viewports.mjs';
import { probeInsets, canvasBox, insideSafe, hudPortraitBox } from './lib/safearea.mjs';
import { installTapRecorder, auditScene, describeAudit, VISITS, VISIT_BASE } from './lib/taps.mjs';
import { runFrames, TIER_EXPR } from './lib/clock.mjs';
import { Touch, padVisible } from './lib/touch.mjs';
import { emulateNetwork } from './lib/net.mjs';
import { pwaChecks } from './platform_pwa.mjs';

const suite = new Suite('platform_view');
const env = await openEnv();
const W = (g) => suite.wants(g);

/** The effective tier the game is running at (for the pixel budget). */
const tierOf = (s) => s.eval(`(() => { const g = window.__game; const t = ${TIER_EXPR}; return t === 'auto' ? null : t; })()`);

try {
  // ── 1. pixel budget per viewport + zero page errors in title, hub, stage, menu (P-11) ────────────
  if (W('budget')) {
    for (const vp of suite.vps(Object.keys(VIEWPORTS))) {
      // one page per viewport: stage s04 → menu (equip) → hub → title (the backing store does not depend on the scene)
      const s = await env.page(vp, 'index.html?scene=stage&stage=s04');
      await s.waitGame('!!g.world?.player');
      await s.wait(1800);
      const snap = async (name) => { const r = await s.eval(() => { const g = window.__game, c = g.canvas; return { scenes: g.scenes.map((x) => x.name).join('>'), w: c.width, h: c.height, dpr: g.dpr, quality: g.settings?.quality }; }); r.tier = (await tierOf(s)) || (VIEWPORTS[vp].touch ? 'medium' : 'high'); return { name, ...r }; };
      const info = [await snap('stage')];
      await s.eval("import('/tools/menu_seed.js?seed=1&tab=equip')"); await s.wait(1200); info.push(await snap('menu'));
      await s.eval(() => __game.go('hub', {}, { fade: false })); await s.wait(1500); info.push(await snap('hub'));
      await s.eval(() => __game.go('title', {}, { fade: false })); await s.wait(1200); info.push(await snap('title'));
      const worst = info.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
      const mp = (worst.w * worst.h) / 1e6, budget = PIXEL_BUDGET_MP[worst.tier] ?? 3.7;
      await suite.check({ id: `budget.${vp}`, group: 'budget', issue: 'P-11', pkg: 'PLAT-CORE', title: `backing store within the '${worst.tier}' pixel budget`, session: s }, async () => ({
        pass: mp <= budget + 0.005, detail: `${worst.w}×${worst.h} = ${mp.toFixed(2)} MP (budget ${budget} MP, tier ${worst.tier}, dpr ${worst.dpr}) in ${worst.name}`, metrics: info,
      }));
      await suite.errors({ id: `budget.${vp}.errors`, group: 'budget', title: 'no page errors in stage, menu, hub, title' }, s);
      await s.close();
    }
  }

  // ── 2. safe area 47/47/0/21 with safeArea 'fit': canvas and HUD inside the safe rect (P-02) ────────
  if (W('insets')) {
    for (const vp of suite.vps(['phone1', 'phone2'])) {
      const s = await env.page(vp, 'index.html?scene=stage&stage=s04', { insets: NOTCH_INSETS });
      await s.waitGame('!!g.world?.player');
      await s.wait(2500);
      const env_ = await probeInsets(s.page);
      const box = await canvasBox(s.page);
      const hud = await hudPortraitBox(s.page);
      const safe = await s.eval(() => window.__game.safe ?? null);
      const inner = { w: box.innerW, h: box.innerH };
      const c = insideSafe(box, NOTCH_INSETS, inner), h = insideSafe(hud, NOTCH_INSETS, inner);
      await suite.check({ id: `insets.canvas.${vp}`, group: 'insets', issue: 'P-02', pkg: 'PLAT-CORE', title: 'canvas inside the safe rect (x ≥ 47, right ≤ innerWidth − 47)', session: s }, async () => ({
        pass: c.ok, detail: `canvas x ${box.x.toFixed(1)}..${box.right.toFixed(1)} of ${inner.w}, overflow ${fmt(c.overflow)}; env() ${fmt(env_)}; game.safe ${fmt(safe)}`, metrics: { box, env: env_, safe },
      }));
      await suite.check({ id: `insets.hud.${vp}`, group: 'insets', issue: 'P-02', pkg: 'PLAT-CORE', title: 'HUD portrait inside the safe rect', session: s }, async () => ({ pass: h.ok, detail: `portrait ${hud.x.toFixed(1)},${hud.y.toFixed(1)} ${hud.w.toFixed(1)}×${hud.h.toFixed(1)}, overflow ${fmt(h.overflow)}` }));
      await suite.errors({ id: `insets.${vp}.errors`, group: 'insets' }, s);
      await s.close();
    }
  }

  // ── 3. UI scale: game.uiK per viewport; uiScale scenes get pointer coordinates in UI space (P-03) ───
  if (W('scale')) {
    const want = { phone1: 1.15, phone2: 1.25, tablet: 1.0, desk: 1.0 };
    for (const vp of suite.vps(Object.keys(want))) {
      const s = await env.page(vp, 'index.html?scene=hub');
      await s.waitGame('!!g.world?.player');
      await s.wait(1200);
      const r = await s.eval(() => { const g = window.__game; return { uiK: g.uiK ?? null, uiW: g.uiW ?? null, uiH: g.uiH ?? null, cssScale: +(g.canvas.getBoundingClientRect().height / g.viewH).toFixed(3) }; });
      await suite.check({ id: `scale.uiK.${vp}`, group: 'scale', issue: 'P-03', pkg: 'PLAT-CORE', title: `game.uiK ≈ ${want[vp]} (auto)` }, async () => ({ pass: typeof r.uiK === 'number' && near(r.uiK, want[vp], 0.02), detail: `uiK ${r.uiK} (cssScale ${r.cssScale}, uiW ${r.uiW}, uiH ${r.uiH})` }));
      if (vp === 'phone2') {
        const hit = await s.eval(async () => {
          const { Scene } = await import('/src/core/game.js');
          class QaUiScene extends Scene {
            constructor(g) { super(g); this.uiScale = true; this.opaque = false; }
            update() { const p = this.game.input.pointer; if (p.tapped && p.x >= 100 && p.x <= 200 && p.y >= 100 && p.y <= 160) window.__qaHit = (window.__qaHit || 0) + 1; }
            render(ctx) { ctx.fillStyle = '#f0f'; ctx.fillRect(100, 100, 100, 60); }
          }
          window.__qaHit = 0;
          __game.register('__qaUi', QaUiScene); __game.push('__qaUi');
          const g = __game, cv = g.canvas.getBoundingClientRect(), k = (cv.height / g.viewH) * (g.uiK || 1);
          return { x: cv.x + 150 * k, y: cv.y + 130 * k };
        });
        await s.wait(200);
        const t = new Touch(s.cdp, s.page);
        await t.tap(hit.x, hit.y, 70);
        await s.wait(300);
        const n = await s.eval(() => window.__qaHit);
        await suite.check({ id: 'scale.pointer', group: 'scale', issue: 'P-03', pkg: 'PLAT-CORE', title: 'a uiScale scene receives taps in UI space', session: s }, async () => ({ pass: n >= 1, detail: `tap at the drawn button centre → ${n} hit(s)` }));
      }
      await suite.errors({ id: `scale.${vp}.errors`, group: 'scale' }, s);
      await s.close();
    }
  }

  // ── 4. frame pacing: fpsCap 60 on a 120 Hz display → ≤ 61 render() per second (P-12) ──────────────
  if (W('pacing')) {
    const s = await env.page('desk', 'index.html?scene=stage&stage=s01');
    await s.waitGame('!!g.world?.player');
    await s.wait(1500);
    await runFrames(s.page, 1000 / 120, 60);
    const r = await runFrames(s.page, 1000 / 120, 240);
    const perSec = r.renders / (r.virtualMs / 1000), ticks = r.ticks / (r.virtualMs / 1000);
    await suite.check({ id: 'pacing.120hz', group: 'pacing', issue: 'P-12', pkg: 'PLAT-CORE', title: '120 Hz rAF, fpsCap 60 → ≤ 61 renders/s', session: s }, async () => ({ pass: perSec <= 61, detail: `${perSec.toFixed(1)} renders/s, ${ticks.toFixed(1)} ticks/s over ${r.frames} frames`, metrics: r }));
    await suite.check({ id: 'pacing.sim', group: 'pacing', issue: 'P-12', pkg: 'PLAT-CORE', title: 'simulation stays at 60 ticks/s' }, async () => ({ pass: ticks > 57 && ticks < 63, detail: `${ticks.toFixed(1)} ticks/s` }));
    await suite.errors({ id: 'pacing.errors', group: 'pacing' }, s);
    await s.close();
  }

  // ── 5. governor (quality 'auto'): 30 ms frames for 6 s drop one tier; 8 ms frames for 21 s raise it (P-13) ─
  if (W('governor')) {
    const s = await env.page('desk', 'index.html?scene=stage&stage=s01', { settings: { quality: 'auto' } });
    await s.waitGame('!!g.world?.player');
    await s.wait(1500);
    const order = ['low', 'medium', 'high'];
    const start = await tierOf(s);
    const slow = await runFrames(s.page, 30, 200, { sampleTier: true });
    let detail = `start ${start}, after 6 s at 33 fps ${slow.endTier} ${fmt(slow.tiers)}`;
    let pass = !!start && order.indexOf(slow.endTier) === order.indexOf(start) - 1;
    let fast = null;
    if (pass) {
      fast = await runFrames(s.page, 8, 2625, { sampleTier: true });
      const changes = [...slow.tiers.slice(1), ...fast.tiers.slice(1).map(([t, v]) => [t + slow.virtualMs, v])];
      const spaced = changes.every((c, i) => i === 0 || c[0] - changes[i - 1][0] >= 9900);
      pass = fast.endTier === start && spaced;
      detail += `; after 21 s at 125 fps ${fast.endTier} ${fmt(fast.tiers)}; ≥ 10 s apart ${spaced}`;
    }
    await suite.check({ id: 'governor.auto', group: 'governor', issue: 'P-13', gate: 'PLAT-CORE', title: 'symmetric quality governor with hysteresis', session: s }, async () => ({ pass, detail: start ? detail : "no effective tier (expected game.tier with settings.quality 'auto')" }));
    await suite.errors({ id: 'governor.errors', group: 'governor' }, s);
    await s.close();
  }

  // ── 6. ?scene=worldmap + cancel → title, never an empty stack (P-26) ──────────────────────────────
  if (W('stack')) {
    const s = await env.page('desk', 'index.html?scene=worldmap');
    await s.wait(2000);
    await s.key('Escape', 90);
    await s.wait(1500);
    const sc = await s.scenes();
    await suite.check({ id: 'stack.worldmap', group: 'stack', issue: 'P-26', gate: 'PLAT-CORE', title: 'worldmap opened directly, then cancel → title', session: s }, async () => ({ pass: /title$/.test(sc), detail: `scenes '${sc}'` }));
    await suite.errors({ id: 'stack.errors', group: 'stack' }, s);
    await s.close();
  }

  // ── 7. boot gate, boot error screen, boot progress (P-35, §6.7) ──────────────────────────────────
  if (W('boot')) {
    {
      const s = await env.page('desk', 'index.html', { wait: false, initScripts: [() => { try { delete window.structuredClone; } catch { /* */ } try { delete Window.prototype.structuredClone; } catch { /* */ } }] });
      await s.wait(2500);
      const txt = await s.eval(() => document.body.innerText || '');
      await suite.check({ id: 'boot.gate', group: 'boot', issue: 'P-35', gate: 'PLAT-BOOT', title: 'no structuredClone → Korean "이 브라우저에서는 실행할 수 없습니다" message', session: s }, async () => ({ pass: /이 브라우저에서는 실행할 수 없습니다/.test(txt), detail: `visible text: ${fmt(txt.replace(/\s+/g, ' ').slice(0, 120))}` }));
      await s.close();
    }
    {
      const s = await env.page('desk', null, { wait: false });
      await s.page.route('**/src/main.js*', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: "throw new Error('qa: boot failure');" }));
      await s.goto('index.html', { wait: false });
      await s.wait(2500);
      const r = await s.eval(() => ({ text: document.body.innerText || '', button: [...document.querySelectorAll('button')].some((b) => /새로고침/.test(b.textContent) && b.offsetParent !== null) }));
      await suite.check({ id: 'boot.error', group: 'boot', issue: 'P-35', gate: 'PLAT-BOOT', title: 'module failure → "불러오기에 실패했습니다" + [새로고침]', session: s }, async () => ({ pass: /불러오기에 실패했습니다/.test(r.text) && r.button, detail: `text ${fmt(r.text.replace(/\s+/g, ' ').slice(0, 100))}, button ${r.button}` }));
      await s.close();
    }
    {
      const s = await env.page('phone1', null, { wait: false });
      await emulateNetwork(s.cdp, 'fast4g');
      await s.goto('index.html', { wait: false });
      let seen = null;
      for (let i = 0; i < 80 && !seen; i++) {
        const t = await s.eval(() => { const b = document.getElementById('boot'); return b ? b.innerText : null; }).catch(() => '');
        if (t === null) break;
        if (/\d{1,3}\s*%/.test(t)) seen = t.replace(/\s+/g, ' ');
        await s.wait(100);
      }
      await suite.check({ id: 'boot.progress', group: 'boot', issue: 'P-09', gate: 'PLAT-BOOT', title: '#boot shows a progress percentage while loading' }, async () => ({ pass: !!seen, detail: seen ? fmt(seen.slice(0, 80)) : 'no percentage seen in #boot' }));
      await suite.errors({ id: 'boot.errors', group: 'boot' }, s);
      await s.close();
    }
  }

  // ── 8. one pad-visibility owner: hidden on the title, visible in a stage on touch (P-18) ─────────
  if (W('pad')) {
    const s = await env.page('phone1', 'index.html');
    await s.wait(2000);
    const t = new Touch(s.cdp, s.page);
    const title = await padVisible(s.page);
    await s.goto('index.html?scene=stage&stage=s01');
    await s.waitGame('!!g.world?.player');
    await s.wait(1500);
    const [w, h] = await s.eval(() => [innerWidth, innerHeight]);
    await t.tap(w * 0.5, h * 0.3);
    await s.wait(400);
    const stage = await padVisible(s.page);
    await s.eval(() => __game.push('pause', { world: __game.world }));
    await s.wait(500);
    const pause = await padVisible(s.page);
    await suite.check({ id: 'pad.visibility', group: 'pad', issue: 'P-18', gate: 'PLAT-CORE', title: 'pad hidden on title and pause, visible in stage (touch)', session: s }, async () => ({ pass: !title.visible && stage.visible && !pause.visible, detail: `title ${title.visible}, stage ${stage.visible}, pause ${pause.visible} [${stage.source}]` }));
    await suite.errors({ id: 'pad.errors', group: 'pad' }, s);
    await s.close();
  }

  // ── 9. settings v1 {quality:'medium'} loads as 'auto' with settingsVersion 2 (§10) ─────────────
  if (W('settings')) {
    const s = await env.page('desk', 'index.html', { storage: { bloodnocturne_settings: { quality: 'medium', musicVol: 0.3 } } });
    await s.wait(1500);
    const r = await s.eval(() => { const st = window.__game.settings || {}; return { quality: st.quality, settingsVersion: st.settingsVersion, musicVol: st.musicVol }; });
    await suite.check({ id: 'settings.migrate', group: 'settings', issue: 'P-13', gate: 'PLAT-SAVE-ASSETS', title: "v1 settings: quality → 'auto', settingsVersion 2, other values kept" }, async () => ({ pass: r.quality === 'auto' && r.settingsVersion === 2 && r.musicVol === 0.3, detail: fmt(r) }));
    await suite.errors({ id: 'settings.errors', group: 'settings' }, s);
    await s.close();
  }

  if (W('pwa')) await pwaChecks(suite, env, 'pwa');

  // ── tap-target audit (P-04) and UI scale opt-in / legibility (P-03) per scene group ────────────────
  for (const group of Object.keys(VISITS)) {
    if (!W(group)) continue;
    for (const vp of suite.vps(['phone2', 'phone1'])) {
      const s = await env.page(vp, VISIT_BASE[group]);
      await s.wait(/scene=/.test(VISIT_BASE[group]) ? 2500 : 1500);
      if (/scene=stage/.test(VISIT_BASE[group])) await s.skipDialogue();
      await installTapRecorder(s.page);
      for (const [name, ev, wait, opt = {}] of VISITS[group]) {
        const a = await auditScene(s.page, ev, { wait });
        await suite.check({ id: `taps.${name}.${vp}`, group, issue: 'P-04', pkg: pkgOf(group), title: `${name}: tap targets ≥ §6.3 minimums at ${VIEWPORTS[vp].css.w}×${VIEWPORTS[vp].css.h}`, session: s }, async () => ({
          pass: !a.error && a.ok && (a.n > 0 || opt.regions === false), detail: a.error || (a.n ? describeAudit(a) : `${a.top}: no tap regions recorded`), metrics: a.error ? null : { n: a.n, red: a.red.length, yellow: a.yellow.length, regions: a.regions.slice(0, 40) },
        }));
        if (vp === 'phone2' && !a.error && opt.scale !== false) {
          await suite.check({ id: `scale.${name}`, group, issue: 'P-03', pkg: pkgOf(group), title: `${name}: uiScale opt-in, text p10 ≥ 9 and median ≥ 10 CSS px at 740×360` }, async () => ({
            pass: a.uiScale && a.uiK >= 1.2 && a.text.n > 0 && a.text.p10 >= 9 && a.text.median >= 10,
            detail: `uiScale ${a.uiScale}, uiK ${a.uiK}, text n ${a.text.n} min ${a.text.min} p10 ${a.text.p10} median ${a.text.median} css px; smallest ${a.text.smallest.join(', ')}`,
          }));
        }
      }
      await suite.errors({ id: `${group}.${vp}.errors`, group }, s);
      await s.close();
    }
  }
} catch (e) {
  await suite.check({ id: 'harness', group: 'harness', title: 'suite ran to completion' }, async () => { throw e; });
} finally {
  await env.close();
}
process.exit(await suite.finish());

function pkgOf(group) {
  return { front: 'PLAT-FRONT-A', options: 'PLAT-OPTIONS', account: 'PLAT-ACCOUNT-UI', arcade: 'PLAT-FRONT-B', town: 'PLAT-TOWN', games: 'PLAT-GAMES', pause: 'PLAT-DIALOG', dialogue: 'PLAT-DIALOG', results: 'PLAT-DIALOG' }[group] || null;
}
