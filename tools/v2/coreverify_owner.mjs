// CORE-VERIFY: owner sheet composer — lays captured stills out in rows with Korean captions and saves one PNG.
//   node tools/v2/coreverify_owner.mjs <spec.json> <out.png>
// spec: { width, title, sub, foot, rows: [{ title, h, tiles: [{ img, nat: [w, h], crop: [x, y, w, h] | null, label, tag: 'before' | 'after' | '' }] }] }
// crop is in source pixels; each tile shows that rectangle scaled to the tile (centre crop when the ratio differs).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';

const [specPath, out] = process.argv.slice(2);
if (!specPath || !out) { console.error('usage: coreverify_owner.mjs <spec.json> <out.png>'); process.exit(2); }
const S = JSON.parse(fs.readFileSync(specPath, 'utf8')), W = S.width ?? 2000, PAD = 24, GAP = 10;
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const data = (f) => (fs.existsSync(f) ? `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,` + fs.readFileSync(f).toString('base64') : null);
let html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "KR"; src: url("http://localhost:${port}/assets/fonts/noto-sans-kr.woff2") format("woff2"); font-weight: 400 900; }
@font-face { font-family: "KRX"; src: url("http://localhost:${port}/assets/fonts/noto-sans-kr-ext.woff2") format("woff2"); font-weight: 400 900; }
* { box-sizing: border-box; } body { margin: 0; width: ${W}px; background: #14110f; color: #efe6d6; font-family: "KR", "KRX", sans-serif; padding: ${PAD}px; }
h1 { font-size: 40px; margin: 0 0 4px; font-weight: 800; } .sub { font-size: 22px; color: #c9bba3; margin: 0 0 16px; line-height: 1.45; }
h2 { font-size: 26px; margin: 20px 0 8px; font-weight: 700; color: #f3d9a4; }
.row { display: flex; gap: ${GAP}px; } .tile { position: relative; overflow: hidden; background: #000; border-radius: 6px; flex: none; }
.tile img { position: absolute; max-width: none; } .none { display: flex; align-items: center; justify-content: center; color: #9a8f80; font-size: 22px; text-align: center; padding: 12px; background: #221d19; }
.cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 6px 10px; font-size: 19px; line-height: 1.3; background: linear-gradient(transparent, rgba(0,0,0,.82) 40%); padding-top: 22px; }
.tag { position: absolute; left: 8px; top: 8px; font-size: 18px; font-weight: 800; padding: 2px 10px; border-radius: 4px; } .before { background: #5b5b66; } .after { background: #a8322b; }
.foot { font-size: 22px; margin-top: 18px; color: #e9c9b0; line-height: 1.5; border-top: 1px solid #4a4037; padding-top: 12px; }
</style></head><body><h1>${esc(S.title)}</h1><div class="sub">${esc(S.sub).replace(/\n/g, '<br>')}</div>`;
for (const r of S.rows) {
  const n = r.tiles.length, tw = Math.floor((W - PAD * 2 - GAP * (n - 1)) / n), th = r.h ?? Math.round(tw * 0.72);
  html += `<h2>${esc(r.title)}</h2><div class="row">`;
  for (const t of r.tiles) {
    const src = t.img ? data(t.img) : null;
    if (!src) { html += `<div class="tile none" style="width:${tw}px;height:${th}px">${t.tag ? `<span class="tag ${t.tag}">${t.tag === 'before' ? '전' : '후'}</span>` : ''}${esc(t.label)}</div>`; continue; }
    const [nw, nh] = t.nat ?? [1000, 756]; let [cx, cy, cw, ch] = t.crop ?? [0, 0, nw, nh];
    const ar = tw / th; if (cw / ch > ar) { const w2 = ch * ar; cx += (cw - w2) / 2; cw = w2; } else { const h2 = cw / ar; cy += (ch - h2) / 2; ch = h2; }
    cx = Math.max(0, Math.min(nw - cw, cx)); cy = Math.max(0, Math.min(nh - ch, cy));
    const k = tw / cw;
    html += `<div class="tile" style="width:${tw}px;height:${th}px"><img src="${src}" style="width:${nw * k}px;height:${nh * k}px;left:${-cx * k}px;top:${-cy * k}px">${t.tag ? `<span class="tag ${t.tag}">${t.tag === 'before' ? '전' : '후'}</span>` : ''}<div class="cap">${esc(t.label)}</div></div>`;
  }
  html += '</div>';
}
html += `<div class="foot">${esc(S.foot).replace(/\n/g, '<br>')}</div></body></html>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  const page = await (await browser.newContext({ viewport: { width: W, height: 1200 }, deviceScaleFactor: 1 })).newPage();
  await page.setContent(html, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
  await page.screenshot({ path: out, fullPage: true });
  console.log('saved ' + out);
} finally { await browser.close(); srv.close(); }
