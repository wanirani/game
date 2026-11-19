// CHAPTER lane owner sheet -> /tmp/claude-0/v2/owner_chapter.png (about 2000 px wide, Korean captions, the game's own fonts).
//   node tools/v2/chapter_owner.mjs [--spec /tmp/claude-0/v2/chapter/owner.json] [--out /tmp/claude-0/v2/owner_chapter.png]
// The spec is plain data written after the bot runs:
//   { title, sub, sections: [{ h, w (px of one still), items: [{ img (png path), cap }] }], ok: 'the table's summary line', weak: 'what is still weak' }
// Stills are the bot's own (tools/v2/chapter_audit.mjs --shots 1: Fold size, the game's picture as drawn).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const SPEC = arg('--spec', '/tmp/claude-0/v2/chapter/owner.json'), OUT = arg('--out', '/tmp/claude-0/v2/owner_chapter.png'), F = 'file:///home/user/game/assets/fonts/';
const S = JSON.parse(fs.readFileSync(SPEC, 'utf8')), HTML = SPEC.replace(/\.json$/, '.html');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const missing = [];
const strip = (sec) => `<div class="strip">${sec.items.map((it) => { if (!fs.existsSync(it.img)) missing.push(it.img); return `<div style="width:${sec.w}px"><img src="file://${it.img}" style="width:${sec.w}px"><div class="cap">${esc(it.cap)}</div></div>`; }).join('')}</div>`;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face { font-family: K; src: url('${F}noto-sans-kr.woff2'); } @font-face { font-family: K; src: url('${F}noto-sans-kr-ext.woff2'); unicode-range: U+AC00-D7A3; }
body { margin: 0; width: 2000px; background: #12141a; color: #e9e2d2; font: 20px/1.45 K, sans-serif; }
.wrap { padding: 28px 30px 34px; } h1 { font-size: 38px; margin: 0 0 6px; color: #f4e7c4; } .sub { color: #b9b2a2; margin-bottom: 14px; }
h2 { font-size: 26px; margin: 24px 0 8px; color: #e8c98a; border-bottom: 2px solid #3a3f4d; padding-bottom: 4px; }
.strip { display: flex; gap: 6px; flex-wrap: wrap; } img { border-radius: 3px; display: block; } .cap { font-size: 15.5px; color: #d8d0c0; margin: 3px 0 6px; line-height: 1.3; }
.note { margin-top: 14px; padding: 11px 16px; background: #1c2029; border-left: 5px solid #8a6a3a; font-size: 19px; } .ok { border-left-color: #4f9a6a; } .weak { border-left-color: #b5533c; }
</style></head><body><div class="wrap">
<h1>${esc(S.title)}</h1>
<div class="sub">${esc(S.sub)}</div>
${S.sections.map((sec) => `<h2>${esc(sec.h)}</h2>\n${strip(sec)}`).join('\n')}
${S.ok ? `<div class="note ok">${esc(S.ok)}</div>` : ''}
${S.weak ? `<div class="note weak">${esc(S.weak)}</div>` : ''}
</div></body></html>`;
if (missing.length) { console.error('stills missing:\n  ' + missing.join('\n  ')); process.exit(1); }
fs.writeFileSync(HTML, html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 1 });
await page.goto('file://' + HTML); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log('wrote', OUT);
