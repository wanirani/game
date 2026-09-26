// Server, browser and page helpers shared by the platform QA suites (tools/qa/platform_*.mjs).
//
//   const env = await openEnv();                      // static server on a free port + headless Chromium
//   const s = await env.page('phone2', 'index.html?scene=stage&stage=s03', { initScripts: [fakePadInit()] });
//   await s.waitGame();  await s.skipDialogue();  s.errs  → page and console errors of this page
//   await s.close();  …  await env.close();
//
// Every page collects pageerror and console.error messages exactly like tools/integration.mjs
// (resource 404s, certificate and Google Fonts noise are ignored).
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { start as startRepoServer } from '../../serve.mjs';
import { contextOptions } from './viewports.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const REPORT_DIR = '/tmp/claude-0/qa/platform';
export const IGNORE_CONSOLE = /Failed to load resource|ERR_CERT|ERR_INTERNET_DISCONNECTED|fonts\.g/;

/** A port nobody on this machine is listening on (other agents run servers too). */
export async function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.once('error', reject);
    s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

/** tools/serve.mjs on a free port → { port, origin, close() } */
export async function startServer() {
  for (let i = 0; i < 5; i++) {
    const port = await freePort();
    try {
      const srv = await startRepoServer(port);
      return { port, origin: `http://localhost:${port}`, close: () => new Promise((r) => srv.close(() => r())) };
    } catch (e) { if (i === 4) throw e; }
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.apk': 'application/vnd.android.package-archive' };
const COMPRESSIBLE = /\.(html|js|mjs|css|json|webmanifest|svg|txt)$/;

/**
 * Static server for a directory other than the repo (dist/web), with brotli for text types like Netlify.
 * Used by platform_load --dist when tools/deploy/serve_dist.mjs does not export start().
 */
export async function startStatic(dir, { brotli = true } = {}) {
  const root = path.resolve(dir);
  const cache = new Map();
  if (brotli) {
    // precompress like a CDN would, so the first request of a file does not pay the compression time
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (/^(node_modules|\.git)$/.test(e.name)) continue; const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (COMPRESSIBLE.test(e.name)) files.push(f); } };
    const files = [];
    walk(root);
    await Promise.all(files.map((f) => new Promise((res) => zlib.brotliCompress(fs.readFileSync(f), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }, (err, b) => { if (!err) cache.set(f, b); res(); }))));
  }
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (u.endsWith('/')) u += 'index.html';
    const f = path.join(root, u);
    if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(f);
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
      if (brotli && COMPRESSIBLE.test(ext) && /\bbr\b/.test(req.headers['accept-encoding'] || '')) {
        let b = cache.get(f);
        if (!b) { b = zlib.brotliCompressSync(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }); cache.set(f, b); }
        headers['Content-Encoding'] = 'br'; data = b;
      }
      res.writeHead(200, headers); res.end(data);
    });
  });
  const port = await freePort();
  await new Promise((r) => srv.listen(port, r));
  return { port, origin: `http://localhost:${port}`, close: () => new Promise((r) => srv.close(() => r())) };
}

export async function launchBrowser(extraArgs = []) {
  return chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', ...extraArgs] });
}

/**
 * Server + browser. env.page(viewportId | contextOptions, url, opts) → Session.
 * opts: initScripts [fn|string|{fn,arg}], insets {l,r,t,b} (CDP safe-area override, applied before load),
 *       settings {…} (merged into the stored settings before load, as settingsVersion 2 unless given),
 *       storage {key: value} (raw localStorage before load),
 *       sw (true = let the service worker register; by default page URLs get the ?nosw dev switch, platform §9.3, so
 *       an unrelated check never installs the SW and precaches the whole game in the background of every context),
 *       wait (false = do not wait for window.__game), origin (serve another origin, e.g. dist/web)
 */
export async function openEnv({ server = null, browserArgs = [] } = {}) {
  const srv = server || await startServer();
  const browser = await launchBrowser(browserArgs);
  const sessions = new Set();
  const env = {
    origin: srv.origin, port: srv.port, browser,
    async page(vpOrOpts, url = 'index.html', opts = {}) {
      const s = await openSession(browser, opts.origin || srv.origin, vpOrOpts, url, opts);
      sessions.add(s); s._onClose = () => sessions.delete(s);
      return s;
    },
    async closeSessions() { for (const s of [...sessions]) await s.close().catch(() => {}); },
    async close() {
      for (const s of [...sessions]) await s.close().catch(() => {});
      await browser.close().catch(() => {});
      if (!server) await srv.close();
    },
  };
  return env;
}

export const SETTINGS_KEY = 'bloodnocturne_settings';

async function openSession(browser, origin, vpOrOpts, url, opts) {
  const ctxOpts = typeof vpOrOpts === 'string' ? contextOptions(vpOrOpts) : { ...vpOrOpts };
  const ctx = await browser.newContext(ctxOpts);
  for (const s of opts.initScripts || []) {
    if (typeof s === 'function' || typeof s === 'string') await ctx.addInitScript(s);
    else await ctx.addInitScript(s.fn, s.arg);
  }
  if (opts.settings || opts.storage) {
    await ctx.addInitScript(({ key, settings, storage }) => {
      try {
        if (sessionStorage.getItem('__qa_seeded')) return; // only before the first load of this tab
        sessionStorage.setItem('__qa_seeded', '1');
        if (storage) for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        if (settings) {
          // saved as a current (v2) player would: without settingsVersion the v1 migration (platform §10) resets quality
          let cur = {}; try { cur = JSON.parse(localStorage.getItem(key)) || {}; } catch { cur = {}; }
          localStorage.setItem(key, JSON.stringify({ settingsVersion: 2, ...cur, ...settings }));
        }
      } catch { /* storage blocked */ }
    }, { key: SETTINGS_KEY, settings: opts.settings || null, storage: opts.storage || null });
  }
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (opts.insets) await setSafeAreaInsets(cdp, opts.insets);
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!IGNORE_CONSOLE.test(t)) errs.push('CONSOLE ' + t.slice(0, 300)); } });
  const s = new Session(ctx, page, cdp, errs, origin, !!opts.sw);
  if (url) await s.goto(url, opts);
  return s;
}

/** Adds the dev switch ?nosw (no service worker, platform §9.3) to a page URL (.html or a directory) unless present. */
export function noSw(u) {
  const i = u.indexOf('#'), base = i < 0 ? u : u.slice(0, i), hash = i < 0 ? '' : u.slice(i);
  if (/[?&]nosw(=|&|$)/.test(base) || !/(\.html?|\/)(\?|$)/.test(base)) return u;
  return `${base}${base.includes('?') ? '&' : '?'}nosw${hash}`;
}

/** CDP Emulation.setSafeAreaInsetsOverride (env(safe-area-inset-*) values), CSS px. */
export async function setSafeAreaInsets(cdp, { l = 0, r = 0, t = 0, b = 0 } = {}) {
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: l, right: r, top: t, bottom: b } });
}

export class Session {
  constructor(ctx, page, cdp, errs, origin, sw = false) { this.ctx = ctx; this.page = page; this.cdp = cdp; this.errs = errs; this.origin = origin; this.sw = sw; }
  url(u) { return /^https?:/.test(u) ? u : `${this.origin}/${u.replace(/^\//, '')}`; }
  async goto(u, { wait = true, timeout = 30000, sw = this.sw } = {}) {
    await this.page.goto(sw ? this.url(u) : noSw(this.url(u)), { timeout });
    if (wait) await this.waitGame();
  }
  /** window.__game exists and has a scene (or the given predicate holds). */
  async waitGame(pred = 'g.scenes.length > 0', timeout = 45000) {
    await this.page.waitForFunction(`(() => { const g = window.__game; return !!g && (${pred}); })()`, null, { timeout, polling: 50 });
  }
  eval(fn, arg) { return this.page.evaluate(fn, arg); }
  wait(ms) { return this.page.waitForTimeout(ms); }
  /** Scene stack names, e.g. 'stage>pause'. */
  scenes() { return this.page.evaluate(() => (window.__game?.scenes || []).map((s) => s.name).join('>')); }
  top() { return this.page.evaluate(() => window.__game?.top?.name ?? null); }
  /** Press a keyboard key (e.code or KEY alias) for ≥ ms and ≥ 3 frames / 2 game steps (never lost on a loaded machine). */
  async key(k, ms = 90) {
    const code = KEY[k] || k;
    await this.page.keyboard.down(code); await waitFrames(this.page, { ms, frames: 3, ticks: 2 });
    await this.page.keyboard.up(code); await waitFrames(this.page, { ms: 40, frames: 2, ticks: 1 });
  }
  /** Advance dialogue / boss intro / story overlays until a gameplay scene is on top (keyboard Enter). */
  async skipDialogue(maxSteps = 60) {
    // an intro dialogue can open a moment after the stage starts: wait for 1.2 s of world time with a gameplay scene on top
    for (let i = 0; i < maxSteps; i++) {
      const st = await this.page.evaluate(() => ({ top: window.__game?.top?.name ?? null, t: window.__game?.world?.time ?? 99 }));
      const cut = st.top && /dialogue|bossIntro|story|document|ultCutin|awakenCutin|companionJoin/.test(st.top);
      if (!cut && st.t >= 1.2) return st.top;
      if (!cut) { await this.page.waitForTimeout(150); continue; }
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(160);
    }
    return this.top();
  }
  /** Player snapshot for input checks. */
  player() {
    return this.page.evaluate(() => {
      const g = window.__game, w = g?.world, p = w?.player;
      if (!p) return null;
      return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, anim: p.anim, move: p.move?.anim || null, onGround: !!p.onGround, facing: p.facing, mp: p.mp, hp: p.hp, hearts: w.run?.hearts, page: p.skillPage, sub: w.run?.sub ?? null };
    });
  }
  /**
   * Per-frame recorder (rAF) of the player/world/scene state; stopRec() returns the frames.
   * Frame: {t, x, y, vx, vy, anim, move, mp, sp, hearts, page, top, n (scene count), toasts}
   */
  startRec() {
    return this.page.evaluate(() => {
      const R = window.__qaRec = { on: true, frames: [], t0: performance.now() };
      const f = () => {
        if (!R.on) return;
        const g = window.__game, w = g?.world, p = w?.player;
        R.frames.push({
          t: Math.round(performance.now() - R.t0), top: g?.top?.name ?? null, n: g?.scenes?.length ?? 0,
          x: p?.x, y: p?.y, vx: p?.vx, vy: p?.vy, anim: p?.anim, move: p?.move?.anim || null, mp: p?.mp, sp: w?.run?.sp, hearts: w?.run?.hearts,
          page: p?.skillPage, toasts: (g?.toasts || []).map((t) => t.text).join(' | '),
        });
        if (R.frames.length < 3000) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
  }
  stopRec() { return this.page.evaluate(() => { const R = window.__qaRec; if (!R) return []; R.on = false; return R.frames; }); }
  async screenshot(file) { try { await this.page.screenshot({ path: file, scale: 'css', timeout: 15000 }); } catch { /* page gone */ } }
  async close() { try { await this.ctx.close(); } catch { /* closed */ } this._onClose?.(); }
}

/**
 * Waits in the page until at least `ms` passed AND the game ran `frames` rAF frames with `ticks` fixed steps since the call,
 * so a short press is never lost between two input polls on a loaded machine.
 */
export function waitFrames(page, { ms = 0, frames = 2, ticks = 1 } = {}) {
  return page.evaluate(({ ms, frames, ticks }) => new Promise((res) => {
    const g = window.__game, t0 = performance.now(), f0 = g?.frame ?? 0; let n = 0;
    const f = () => { n++; if (performance.now() - t0 >= ms && n >= frames && (g?.frame ?? 0) - f0 >= ticks) res(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), { ms, frames, ticks });
}

/**
 * Init script: report a fixed device class (navigator.hardwareConcurrency / deviceMemory), so the quality start tier
 * (platform §6.4: low when ≤ 4 cores or ≤ 2 GB) does not depend on the machine that runs the QA.
 */
export function deviceClassInit({ cores = 8, memory = 8 } = {}) {
  return {
    fn: ({ cores, memory }) => {
      try { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => cores, configurable: true }); } catch { /* */ }
      try { Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => memory, configurable: true }); } catch { /* */ }
    },
    arg: { cores, memory },
  };
}

export const KEY = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', jump: 'KeyZ', attack: 'KeyX', dash: 'KeyC', sub: 'KeyA', skill1: 'KeyS', skill2: 'KeyD', ult: 'KeyF', menu: 'Escape', enter: 'Enter', swap: 'KeyQ', tabR: 'KeyE', map: 'Tab' };
