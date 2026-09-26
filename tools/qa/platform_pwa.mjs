// PWA suite — platform.md §9.3 manifest/iOS metadata, service worker on localhost (P-27), SW never caches /api (P-10),
// Chromium installability (§1.7).
//
//   node tools/qa/platform_pwa.mjs [--strict] [--assume PLAT-BOOT,DELIVERY-WEB]
// Also run as the 'pwa' group of platform_view.mjs (pwaChecks(suite, env)).
// Report: /tmp/claude-0/qa/platform/platform_pwa.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Suite, fmt } from './lib/suite.mjs';
import { openEnv, ROOT } from './lib/server.mjs';

const readText = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return null; } };

export async function pwaChecks(suite, env, group = 'pwa') {
  // static: manifest fields and iOS metadata
  const man = (() => { try { return JSON.parse(readText('manifest.webmanifest')); } catch (e) { return { __err: e.message }; } })();
  await suite.check({ id: `${group}.manifest.fields`, group, issue: 'P-27', gate: 'PLAT-BOOT', title: 'manifest id/scope/categories/description, 192/512/maskable icons, 2 screenshots' }, async () => {
    if (man.__err) return { pass: false, detail: 'manifest.webmanifest: ' + man.__err };
    const icons = man.icons || [];
    const has = (sz) => icons.some((i) => String(i.sizes || '').split(/\s+/).includes(sz));
    const maskable = icons.some((i) => /maskable/.test(i.purpose || '') && String(i.sizes || '').includes('512'));
    const iconFiles = icons.filter((i) => !fs.existsSync(path.join(ROOT, String(i.src).replace(/^\.?\//, '')))).map((i) => i.src);
    const shots = (man.screenshots || []).filter((s) => !s.form_factor || s.form_factor === 'wide');
    const miss = [];
    if (!man.id) miss.push('id'); if (!man.scope) miss.push('scope');
    if (!(man.categories || []).includes('games')) miss.push('categories:games');
    if (!man.description) miss.push('description');
    if (!has('192x192')) miss.push('icon 192'); if (!has('512x512')) miss.push('icon 512'); if (!maskable) miss.push('maskable 512');
    if (shots.length < 2) miss.push(`screenshots (${shots.length}/2)`);
    if (iconFiles.length) miss.push('missing icon files ' + iconFiles.join(','));
    return { pass: miss.length === 0, detail: miss.length ? 'missing: ' + miss.join(', ') : 'all fields present' };
  });
  const html = readText('index.html') || '';
  await suite.check({ id: `${group}.ios.meta`, group, issue: 'P-27', gate: 'PLAT-BOOT', title: 'iOS status-bar style, 180 px apple-touch-icon, app title' }, async () => {
    const miss = [];
    if (!/apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/.test(html)) miss.push('status-bar-style black-translucent');
    const m = /<link[^>]+rel="apple-touch-icon"[^>]*>/.exec(html)?.[0] || '';
    if (!/180x180/.test(m)) miss.push('apple-touch-icon 180x180');
    const href = /href="([^"]+)"/.exec(m)?.[1];
    if (href && !fs.existsSync(path.join(ROOT, href))) miss.push(`file ${href}`);
    if (!/apple-mobile-web-app-title"\s+content="블러드 녹턴"/.test(html)) miss.push('apple-mobile-web-app-title');
    return { pass: miss.length === 0, detail: miss.length ? 'missing: ' + miss.join(', ') : 'ok' };
  });

  // runtime: manifest parse + installability in Chromium
  {
    const s = await env.page('phone1', 'index.html', { sw: true });
    await s.wait(2500);
    const man2 = await s.cdp.send('Page.getAppManifest').catch((e) => ({ errors: [{ message: e.message }] }));
    await suite.check({ id: `${group}.manifest.parse`, group, issue: 'P-27', title: 'manifest parses without errors' }, async () => ({ pass: !(man2.errors || []).length, detail: (man2.errors || []).map((e) => e.message).join('; ') || 'no errors' }));
    const inst = await s.cdp.send('Page.getInstallabilityErrors').catch((e) => ({ installabilityErrors: [{ errorId: 'cdp:' + e.message }] }));
    const errs = (inst.installabilityErrors || []).map((e) => e.errorId).filter((id) => id !== 'in-incognito');
    await suite.check({ id: `${group}.installable`, group, issue: 'P-27', title: 'installable (ignoring the incognito test context)' }, async () => ({ pass: errs.length === 0, detail: errs.join(', ') || 'no installability errors' }));
    await suite.errors({ id: `${group}.errors`, group }, s);
    await s.close();
  }

  // runtime: the service worker registers on localhost unless ?nosw (§9.3)
  let swOk = false;
  {
    const s = await env.page('desk', 'index.html', { sw: true });
    let regs = 0;
    for (let i = 0; i < 16 && !regs; i++) { await s.wait(300); regs = await s.eval(async () => (await navigator.serviceWorker?.getRegistrations?.())?.length ?? 0); }
    swOk = regs > 0;
    await suite.check({ id: `${group}.sw.localhost`, group, issue: 'P-27', gate: 'PLAT-BOOT', title: 'service worker registers on localhost' }, async () => ({ pass: regs > 0, detail: `${regs} registration(s)` }));
    if (swOk) {
      // P-10: /api/ responses never reach Cache Storage (instrumented). The first page load is controlled only if the
      // SW calls clients.claim(); otherwise one reload (as a returning visitor) puts the page under the SW
      await s.eval(() => navigator.serviceWorker.ready.then(() => true));
      if (!(await s.eval(() => !!navigator.serviceWorker.controller))) { await s.page.reload(); await s.waitGame().catch(() => {}); }
      const r = await s.eval(async () => {
        await navigator.serviceWorker.ready;
        for (let i = 0; i < 20 && !navigator.serviceWorker.controller; i++) await new Promise((res) => setTimeout(res, 150));
        try { await fetch('/api/qa-probe?x=1'); await fetch('/api/qa-probe?x=1'); } catch { /* 404 is fine */ }
        await new Promise((res) => setTimeout(res, 400));
        const hits = [];
        for (const k of await caches.keys()) { const c = await caches.open(k); for (const req of await c.keys()) if (/\/api\//.test(req.url)) hits.push(k + ' ' + req.url); }
        return { controlled: !!navigator.serviceWorker.controller, hits };
      });
      await suite.check({ id: `${group}.sw.api`, group, issue: 'P-10', gate: 'DELIVERY-WEB', title: 'no /api/ request is ever served from or stored in Cache Storage' }, async () => ({ pass: r.hits.length === 0 && r.controlled, detail: r.controlled ? (r.hits.join(', ') || 'no /api/ entries in any cache') : 'page not controlled by the SW' }));
    } else {
      await suite.check({ id: `${group}.sw.api`, group, issue: 'P-10', gate: 'DELIVERY-WEB', title: 'no /api/ request is ever served from or stored in Cache Storage' }, async () => ({ pass: false, detail: 'no service worker on localhost, cannot instrument' }));
    }
    await s.close();
    const s2 = await env.page('desk', 'index.html?nosw');
    await s2.wait(2500);
    const regs2 = await s2.eval(async () => (await navigator.serviceWorker?.getRegistrations?.())?.length ?? 0);
    await suite.check({ id: `${group}.sw.nosw`, group, issue: 'P-27', title: '?nosw keeps the service worker off' }, async () => ({ pass: regs2 === 0, detail: `${regs2} registration(s)` }));
    await s2.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const suite = new Suite('platform_pwa');
  const env = await openEnv();
  try { await pwaChecks(suite, env); } catch (e) { await suite.check({ id: 'harness', group: 'harness', title: 'suite ran to completion' }, async () => { throw e; }); } finally { await env.close(); }
  process.exit(await suite.finish());
}
